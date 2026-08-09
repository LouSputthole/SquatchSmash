/**
 * THE ALARM ON THE APPEARANCE LEDGER.
 *
 * `src/core/appearances.js` says who is in what and what they have on. A
 * ledger written by hand and never checked is a document, not a tool: it is
 * right on the day it is written and it lies from the first scene edit
 * afterwards, silently, in a file whose whole purpose is to be trusted. This
 * file is the reason it can be trusted.
 *
 * ## WHAT IT CAN CHECK, and how
 *
 * 1. **The row points at a line that exists.** Every row carries `evidence`:
 *    a literal substring of the scene module that puts that person in that
 *    scene. The test reads the real file off disk and looks for it. Delete a
 *    man from a scene, or move him to a different call, and the ledger fails
 *    rather than going on describing him.
 *
 * 2. **The clothes are the scene's clothes, by identity where possible.**
 *    - `from: { wardrobe: 'NAME' }` — the row's `model` must BE that export of
 *      `src/core/wardrobe.js`. Not equal to it. The same object.
 *    - `from: { module, export, at }` — the module is imported for real and
 *      the value walked out of it, then deep-compared.
 *    - `from: { module, source: true }` — the scene keeps its table private,
 *      so the object literal is read out of the source text and compared
 *      field by field, both ways: a key the scene added and a key the scene
 *      dropped both fail.
 *
 * 3. **A scene cannot quietly start dressing somebody new.** For every scene
 *    module, the set of `core/wardrobe.js` models it can reach — its imports,
 *    plus every `WARDROBE.<id>` it names — must be exactly the set the ledger
 *    says it uses. Add a fifteenth wardrobe import to `src/mansion/cast.js`
 *    and this fails until somebody writes the row.
 *
 * 4. **The campaign's hard identity rules.** The two Lous never merge. Willy
 *    and Billy HotDog are dead before the mansion arc and appear in no mansion
 *    scene. No two people share a face photograph.
 *
 * ## WHAT IT CANNOT CHECK, said plainly rather than implied
 *
 * - **Whether the person is actually on screen.** Nine of the mansion's
 *   figures are inside `if (labAt)`; Sasole is only on the Bing floor once the
 *   Beef Run is flown; Willy leaves that floor once NO WAKE is done. Presence
 *   is a campaign-state question and this is a static check. The `where` field
 *   says so in words where it matters and nothing here enforces it.
 * - **Whether an outfit is RIGHT.** Every `divergence` in the ledger is a
 *   human's judgement written down, and no assertion here agrees or disagrees
 *   with any of them. That is the fitting room's job and the owner's.
 * - **The `where` text.** It is the one hand-written field in the ledger and
 *   there is no way to derive "on a stool at the bar, by the service station"
 *   from an x and a z. A man described in the wrong chair is a nuisance; a man
 *   in the wrong clothes is the bug this file is for.
 * - **The block-rig scenes' actual figures.** `src/beefrun/npc.js` and
 *   `src/enolasquatch/crew.js` build people with `makeFigure`, whose options
 *   are a different vocabulary. Rows for those scenes carry no model and the
 *   test asserts only that they say why, and that their evidence is real.
 * - **Anybody the ledger deliberately leaves out** — the club's dancers, the
 *   restaurant's diners, the bank's customers, the siege's two unnamed
 *   bodies. Check 3 catches a scene reaching for a WARDROBE model for one of
 *   them; nothing catches a scene inventing a new anonymous extra, and
 *   nothing should.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ensureThreeShim, ensureDomShim } from '../tools/three-shim.mjs';

/* The modules this test imports for real (`src/bing/family.js`,
 * `src/heist/cast.js`) reach `three` and, through it, a canvas. */
ensureThreeShim();
ensureDomShim();

import { CHARACTER_IDS, SCENE_IDS } from '../src/core/campaign.js';
import * as WARDROBE_MODULE from '../src/core/wardrobe.js';
import {
  APPEARANCES, CAMPAIGN_SCENE_COVERAGE, EXTRAS, PHOTOS,
  PROCEDURAL_APPEARANCE_TEMPLATES, SCENES,
  appearancesInScene, appearancesOf, isShowable, ledgerCharacters,
} from '../src/core/appearances.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ------------------------------------------------------------------ */
/* Reading a scene's source without being fooled by its comments       */
/* ------------------------------------------------------------------ */

/**
 * Blank out every comment and string body, keeping the file's length.
 *
 * THIS IS NOT TIDINESS. `src/beefrun/npc.js` contains the sentence "importing
 * or spreading `BIG_UNCLE_LOU` here would be a character error", in a comment,
 * to stop somebody doing exactly that. A naive scan for wardrobe names would
 * read that as the Beef Run dressing Big Uncle Lou and fail check 3 on a file
 * whose comment is the reason it passes. Positions are preserved so an index
 * found in the blanked text is valid in the real one.
 */
function blankNoise(source, { strings = true } = {}) {
  const out = source.split('');
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      blank(i, end < 0 ? source.length : end);
      i = end < 0 ? source.length : end;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      blank(i, end < 0 ? source.length : end + 2);
      i = end < 0 ? source.length : end + 2;
    } else if (c === '\'' || c === '"' || c === '`') {
      let k = i + 1;
      while (k < source.length && source[k] !== c) k += source[k] === '\\' ? 2 : 1;
      if (strings) blank(i + 1, k);
      i = k + 1;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/**
 * The `{ … }` that starts at or after `anchor`, brace-matched.
 *
 * Matched on the comment-and-string-blanked copy so a brace inside a comment
 * or a string cannot close the literal, and sliced out of the REAL source so
 * the text handed to the parser is what the file says.
 */
function literalAfter(source, anchor) {
  const clean = blankNoise(source);
  const at = source.indexOf(anchor);
  if (at < 0) return null;
  const open = clean.indexOf('{', at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    if (clean[i] === '{') depth += 1;
    else if (clean[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

/** The innermost object literal containing a unique source anchor. */
function literalContaining(source, anchor) {
  const clean = blankNoise(source);
  const at = source.indexOf(anchor);
  if (at < 0) return null;
  const open = clean.lastIndexOf('{', at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    if (clean[i] === '{') depth += 1;
    else if (clean[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

/**
 * Evaluate a scene's own object literal.
 *
 * `new Function` on repo source, in a test, is the most honest reading of "the
 * scene's table" there is — it produces the exact object the scene produces,
 * hex literals, nested colourways, trailing comments and all, with no parser
 * of ours in between to be subtly wrong. It only works while the literal is
 * PLAIN: the moment a scene puts an identifier or a call in there this throws,
 * and it should, loudly, with the message below rather than a bare
 * ReferenceError.
 */
function evalLiteral(text, label) {
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return (${text});`)();
  } catch (err) {
    assert.fail(`${label}: its clothing literal is no longer a plain literal `
      + `(${err.message}). Either export the table so this test can import it, `
      + 'or teach this test how to read it. Do not delete the check.');
    return null;
  }
}

/* Local to a call site and never part of the outfit: the fitting room paints
 * its own faces from assets/faces/index.json, and `role` is golf's own. */
const NOT_WARDROBE = new Set(['face', 'faceCrop', 'role', 'castShadow']);

/* ------------------------------------------------------------------ */
/* Which models core/wardrobe.js publishes, by every name they answer to */
/* ------------------------------------------------------------------ */

/** name -> the frozen model, for every reachable model in core/wardrobe.js. */
const WARDROBE_MODELS = (() => {
  const out = new Map();
  for (const [name, value] of Object.entries(WARDROBE_MODULE)) {
    if (name === 'WARDROBE' || typeof value === 'function') continue;
    if (Array.isArray(value)) value.forEach((m, i) => out.set(`${name}[${i}]`, m));
    else out.set(name, value);
  }
  return out;
})();

/** `WARDROBE.booski` -> `BOOSKI`, resolved by identity rather than by name. */
const EXPORT_NAME_FOR_ROSTER_KEY = (() => {
  const out = new Map();
  for (const [key, model] of Object.entries(WARDROBE_MODULE.WARDROBE)) {
    for (const [name, candidate] of WARDROBE_MODELS) {
      if (candidate === model) { out.set(key, name); break; }
    }
  }
  return out;
})();

/** `MANSION_GUARDS[3]` and `MANSION_GUARDS` are one import. */
const baseName = (name) => name.replace(/\[\d+\]$/, '');

/**
 * Every core/wardrobe.js model a module can reach, by export name.
 *
 * Two routes exist and both are used in the wild: a direct named import
 * (`import { SNOW } from '../core/wardrobe.js'`) and the roster
 * (`import { WARDROBE }` then `WARDROBE.snow`). A module that takes the second
 * route imports one name and reaches fourteen models, so the roster keys have
 * to be expanded or `src/bing/family.js` looks like it dresses nobody.
 */
function wardrobeReach(rel) {
  const source = read(rel);
  /* The import scan keeps string bodies, because the thing it is matching on
   * IS a string — the specifier. The member scan blanks them, because that is
   * the scan a comment could fool. */
  const withPaths = blankNoise(source, { strings: false });
  const clean = blankNoise(source);
  const names = new Set();
  const importRe = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*wardrobe\.js['"]/g;
  for (const match of withPaths.matchAll(importRe)) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (name === 'WARDROBE') continue;
      names.add(name);
    }
  }
  /* The import list is blanked-safe but the member accesses are read off the
   * comment-free copy, which is the point of blanking. */
  for (const match of clean.matchAll(/\bWARDROBE\.([a-z_0-9]+)\b/g)) {
    const resolved = EXPORT_NAME_FOR_ROSTER_KEY.get(match[1]);
    if (resolved) names.add(resolved);
  }
  return names;
}

/* ------------------------------------------------------------------ */
/* Shape                                                               */
/* ------------------------------------------------------------------ */

test('the ledger is frozen data, top to bottom', () => {
  assert.ok(Object.isFrozen(APPEARANCES), 'APPEARANCES is not frozen');
  assert.ok(Object.isFrozen(CAMPAIGN_SCENE_COVERAGE),
    'CAMPAIGN_SCENE_COVERAGE is not frozen');
  assert.ok(Object.isFrozen(SCENES), 'SCENES is not frozen');
  assert.ok(Object.isFrozen(EXTRAS), 'EXTRAS is not frozen');
  assert.ok(Object.isFrozen(PHOTOS), 'PHOTOS is not frozen');
  for (const a of APPEARANCES) {
    assert.ok(Object.isFrozen(a), `${a.character} in ${a.scene} is a mutable row`);
    if (a.model) {
      assert.ok(Object.isFrozen(a.model),
        `${a.character} in ${a.scene} carries a mutable model — the game's own `
        + 'models are all frozen and a copy that is not is a copy somebody can edit');
    }
  }
});

test('every playable campaign scene is explicitly classified for wardrobe review', () => {
  const campaignIds = Object.values(SCENE_IDS).sort();
  assert.deepEqual(Object.keys(CAMPAIGN_SCENE_COVERAGE).sort(), campaignIds,
    'the wardrobe catalog must classify every SCENE_IDS value, including aliases and frozen scenes');

  const allowed = new Set(['appearance-ledger', 'alias', 'no-fixed-cast', 'frozen']);
  for (const id of campaignIds) {
    const coverage = CAMPAIGN_SCENE_COVERAGE[id];
    assert.ok(Object.isFrozen(coverage), `${id} wardrobe coverage is mutable`);
    assert.equal(coverage.id, id, `${id} coverage carries the wrong id`);
    assert.ok(allowed.has(coverage.status), `${id} has unknown wardrobe status ${coverage.status}`);
    assert.ok(Array.isArray(coverage.appearanceScenes), `${id} has no appearanceScenes list`);
    assert.ok(Object.isFrozen(coverage.appearanceScenes), `${id} appearanceScenes is mutable`);
    assert.ok(Array.isArray(coverage.modules) && coverage.modules.length > 0,
      `${id} must name the production module(s) its classification was checked against`);
    assert.ok(Object.isFrozen(coverage.modules), `${id} coverage modules are mutable`);
    assert.ok(Array.isArray(coverage.requiredAppearances),
      `${id} has no requiredAppearances list`);
    assert.ok(Object.isFrozen(coverage.requiredAppearances),
      `${id} requiredAppearances is mutable`);
    assert.ok(coverage.note?.length > 40, `${id} coverage does not explain its classification`);
    for (const rel of coverage.modules) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `${id} coverage names missing ${rel}`);
    }
    for (const sceneId of coverage.appearanceScenes) {
      assert.ok(SCENES[sceneId], `${id} points at missing appearance scene ${sceneId}`);
      assert.ok(appearancesInScene(sceneId).length > 0,
        `${id} points at empty appearance scene ${sceneId}`);
    }
    for (const required of coverage.requiredAppearances) {
      assert.ok(Object.isFrozen(required), `${id} has a mutable required appearance selector`);
      assert.ok(coverage.appearanceScenes.includes(required.scene),
        `${id} requires ${required.character}@${required.scene} outside its appearanceScenes`);
      assert.ok(APPEARANCES.some((appearance) => appearance.character === required.character
        && appearance.scene === required.scene
        && (required.variant === undefined || appearance.variant === required.variant)),
      `${id} fixed cast is missing ${required.character}@${required.scene}`);
    }

    if (coverage.status === 'appearance-ledger' || coverage.status === 'alias') {
      assert.ok(coverage.appearanceScenes.length > 0,
        `${id} says it is covered but points at no appearance scene`);
    } else {
      assert.equal(coverage.appearanceScenes.length, 0,
        `${id} is ${coverage.status} but also claims a rendered appearance scene`);
    }
  }

  assert.equal(CAMPAIGN_SCENE_COVERAGE[SCENE_IDS.INITIATION].status, 'frozen',
    'Initiation must be catalogued across its frozen boundary, never imported or reconstructed here');
  assert.ok(Object.values(CAMPAIGN_SCENE_COVERAGE)
    .filter((entry) => entry.status === 'frozen')
    .every((entry) => entry.id === SCENE_IDS.INITIATION),
  'Initiation is the only frozen campaign runtime');
});

test('every fixed campaign identity has at least one wardrobe-ledger row', () => {
  const claimed = new Set(APPEARANCES.map((appearance) => appearance.character));
  const missing = Object.values(CHARACTER_IDS).filter((id) => !claimed.has(id));
  assert.deepEqual(missing, [],
    `fixed CHARACTER_IDS consumers missing from the wardrobe ledger: ${missing.join(', ')}`);
});

test('Margo is catalogued at home, at the ordinary Bing and in the Silver Room without crossing her protected runtime boundary', () => {
  const rows = appearancesOf(CHARACTER_IDS.MARGO);
  assert.deepEqual(rows.map((row) => row.scene).sort(), ['apartment', 'bada_bing', 'silver_room']);

  const apartment = rows.find((row) => row.scene === 'apartment');
  assert.equal(apartment.model, null, 'the apartment private rig must remain source-only');
  assert.equal(apartment.module, 'src/world/dressing.js');
  const apartmentSource = read(apartment.module);
  for (const anchor of [
    'export function makeMorningGuest(M) {',
    "const blouse = group('margo.outfit.blouse');",
    "name: 'margo.outfit.jeans.waistband'",
    'name: `margo.leg.${side}.shoe`',
    'restyleMargoHead({ head },',
  ]) assert.ok(apartmentSource.includes(anchor), `Margo morning rig lost ${anchor}`);

  const bing = rows.find((row) => row.scene === 'bada_bing');
  assert.deepEqual(bing.model, {
    height: 1.69, build: 0.96, dress: 'shirt', shirt: 0x24303a, hair: 'tied',
    hairColour: 0x2a1c14, skin: 0xd8a878, gender: 'female', bodyShape: 'curvy',
  });
  assert.ok(read(bing.module).includes('restyleMargoHead(by.margo.parts,'),
    'ordinary-Bing Margo no longer receives her authored head restyle');

  const silver = rows.find((row) => row.scene === 'silver_room');
  assert.deepEqual(silver.model, {
    height: 1.69, build: 1.06, dress: 'gown', shirt: 0x1a2a4a,
    hair: 'bald', hairColour: 0x2a1c14, skin: 0xd8a878,
    gender: 'female', bodyShape: 'curvy',
  });
  assert.ok(read(silver.module).includes('restyleMargoHead(this.npc.parts,'),
    'Silver Room Margo no longer receives her authored head restyle');

  assert.doesNotMatch(read('src/core/appearances.js'),
    /^import .*silver\/(?:margo|date)\.js/m,
    'the data-only wardrobe ledger must not import Margo/date runtime modules');
});

test('License to Grill catalogs the exact canonical James Blond tuxedo with its scene-owned bare feet', () => {
  const row = appearancesOf(CHARACTER_IDS.JAMES_BLOND).find((appearance) => (
    appearance.scene === 'bada_bing' && appearance.variant === 'license_to_grill'
  ));
  assert.ok(row, 'License to Grill James Blond is absent from the wardrobe ledger');
  assert.deepEqual(row.model, { ...WARDROBE_MODULE.JAMES_BLOND, barefoot: true });
  assert.equal(row.from.baseWardrobe, 'JAMES_BLOND');
  assert.deepEqual(row.from.adds, ['barefoot']);
  assert.ok(read(row.module).includes('model: { ...WARDROBE.james_blond, barefoot: true },'));
});

test('Enola Captain Sasole mirrors the canonical wardrobe through the shared block-rig adapter', () => {
  const row = APPEARANCES.find((entry) => (
    entry.scene === 'enola_squatch'
    && entry.character === CHARACTER_IDS.CAPTAIN_LOU_SASOLE
  ));
  assert.ok(row, 'Enola Captain Sasole is absent from the wardrobe ledger');
  assert.strictEqual(row.model, WARDROBE_MODULE.CAPTAIN_LOU_SASOLE);
  assert.equal(row.from.wardrobe, 'CAPTAIN_LOU_SASOLE');
  assert.equal(row.evidence, '...fromWardrobe(CAPTAIN_LOU_SASOLE),');
  assert.equal(row.divergence, null);
  const source = read(row.module);
  assert.ok(source.includes("import { CAPTAIN_LOU_SASOLE } from '../core/wardrobe.js';"));
  assert.ok(source.includes('...fromWardrobe(CAPTAIN_LOU_SASOLE),'));
});

test('finite procedural clothing/job combinations have deterministic extreme fixtures and source evidence', async () => {
  assert.ok(Object.isFrozen(PROCEDURAL_APPEARANCE_TEMPLATES));
  const ids = PROCEDURAL_APPEARANCE_TEMPLATES.map((template) => template.id);
  assert.equal(new Set(ids).size, ids.length, 'procedural template ids are not unique');
  assert.deepEqual(ids.filter((id) => id.startsWith('bing.')).sort(), [
    'bing.patron.shirt.drink', 'bing.patron.shirt.sit',
    'bing.patron.suit.drink', 'bing.patron.suit.sit',
    'bing.patron.tracksuit.drink', 'bing.patron.tracksuit.sit',
    'bing.performer.bikini.dance',
    'bing.stander.shirt.lean', 'bing.stander.tracksuit.lean',
    'bing.tabler.shirt.drink', 'bing.tabler.tracksuit.drink',
  ]);
  assert.deepEqual(ids.filter((id) => id.startsWith('silver.')).sort(), [
    'silver.band.suit.stand',
    'silver.diner.gown.drink', 'silver.diner.gown.sit',
    'silver.diner.suit.drink', 'silver.diner.suit.sit',
    'silver.kitchen.chef.work',
    'silver.queue.gown.lean', 'silver.queue.gown.stand',
    'silver.queue.shirt.lean', 'silver.queue.shirt.stand',
    'silver.queue.suit.lean', 'silver.queue.suit.stand',
    'silver.server.waistcoat.patrol',
  ]);

  const THREE = await import('three');
  const cast = await import(pathToFileURL(path.join(ROOT, 'src/bing/cast.js')).href);
  for (const template of PROCEDURAL_APPEARANCE_TEMPLATES) {
    assert.ok(Object.isFrozen(template), `${template.id} is mutable`);
    assert.ok(SCENES[template.scene], `${template.id} names missing scene ${template.scene}`);
    assert.ok(SCENES[template.scene].modules.includes(template.module),
      `${template.id} source ${template.module} is outside ${template.scene}`);
    const source = read(template.module);
    assert.ok(Object.isFrozen(template.evidence) && template.evidence.length >= 2,
      `${template.id} does not prove both clothes and job`);
    for (const anchor of template.evidence) {
      assert.ok(source.includes(anchor), `${template.id} lost source evidence ${anchor}`);
    }
    assert.deepEqual(template.fixtures.map((fixture) => fixture.id), ['min', 'max']);
    for (const fixture of template.fixtures) {
      assert.ok(Object.isFrozen(fixture) && Object.isFrozen(fixture.model));
      assert.equal(fixture.model.dress, template.dress);
      assert.equal(fixture.model.gender ?? null, template.gender);
      assert.equal(fixture.model.bodyShape ?? null, template.bodyShape);
      const npc = new cast.Npc(new THREE.Scene(), {
        name: template.id, tier: 'hero', job: template.job, look: false,
        model: { ...fixture.model, face: null },
      });
      npc.t = 0;
      npc.phase = 0;
      npc.update(0, null);
      npc.group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(npc.group);
      const size = bounds.getSize(new THREE.Vector3());
      assert.ok([...bounds.min.toArray(), ...bounds.max.toArray(), ...size.toArray()]
        .every(Number.isFinite), `${template.id}.${fixture.id} has non-finite bounds`);
      assert.ok(size.x > 0 && size.y > 0 && size.z > 0,
        `${template.id}.${fixture.id} has empty geometry`);
    }
  }
});

test('the mansion ledger includes every authored Family and performer model consumer', async () => {
  const house = appearancesInScene('mansion_house');
  const familyEvidence = new Map([
    [CHARACTER_IDS.SEFF, 'model: familyModel(CHARACTER_IDS.SEFF),'],
    [CHARACTER_IDS.LAG, 'model: familyModel(CHARACTER_IDS.LAG),'],
    [CHARACTER_IDS.APE, 'model: withFace(familyModel(CHARACTER_IDS.APE), FACES.ape),'],
    [CHARACTER_IDS.SAUCE, 'model: familyModel(CHARACTER_IDS.SAUCE),'],
    [CHARACTER_IDS.OLD_STOVE, 'model: withFace(familyModel(CHARACTER_IDS.OLD_STOVE), FACES.stove),'],
  ]);
  for (const [character, evidence] of familyEvidence) {
    assert.ok(house.some((entry) => entry.character === character && entry.evidence === evidence),
      `mansion_house is missing the real familyModel consumer ${character}`);
  }

  const performers = house.filter((entry) => entry.from.mansionPerformer);
  assert.deepEqual(performers.map((entry) => entry.from.mansionPerformer.post).sort(), [
    'poolPerformer0', 'poolPerformer1', 'poolPerformer2',
    'suitePerformer0', 'suitePerformer1',
  ], 'the fitting room must show the two suite and three pool performer variants');

  const castSource = read('src/mansion/cast.js');
  const castModule = await import(pathToFileURL(path.join(ROOT, 'src/bing/cast.js')).href);
  for (const entry of performers) {
    const recipe = entry.from.mansionPerformer;
    let height;
    let build;
    let performerIndex;
    if (recipe.post.startsWith('suitePerformer')) {
      const loop = literalAfter(castSource, 'post(`suitePerformer${i}`, {');
      assert.ok(loop, 'the suite performer loop no longer has an authored post block');
      assert.match(castSource, /const look = BADA_BING_PERFORMERS\[i === 0 \? 3 : 1\];/u);
      assert.match(loop, /height: i === 0 \? 1\.74 : 1\.71, build: 1\.08, dress: 'bikini', \.\.\.look,/u);
      const loopIndex = Number(recipe.post.at(-1));
      height = loopIndex === 0 ? 1.74 : 1.71;
      build = 1.08;
      performerIndex = loopIndex === 0 ? 3 : 1;
    } else {
      const block = literalAfter(castSource, `post('${recipe.post}', {`);
      assert.ok(block, `${recipe.post} no longer has an authored post block`);
      const modelText = block.match(/model:\s*\{([\s\S]*?)\n\s*\},/u)?.[1];
      assert.ok(modelText, `${recipe.post} no longer has an inline model literal`);
      height = Number(modelText.match(/height:\s*([0-9.]+)/u)?.[1]);
      build = Number(modelText.match(/build:\s*([0-9.]+)/u)?.[1]);
      performerIndex = Number(modelText.match(/BADA_BING_PERFORMERS\[(\d+)\]/u)?.[1]);
      assert.ok(Number.isFinite(height) && Number.isFinite(build) && Number.isInteger(performerIndex),
        `${recipe.post} no longer composes a fixed body with a Bada Bing performer look`);
    }
    assert.equal(recipe.index, performerIndex, `${recipe.post} points at the wrong performer identity`);
    assert.deepEqual(entry.model, {
      role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
      height, build, dress: 'bikini', ...castModule.BADA_BING_PERFORMERS[performerIndex],
    }, `${recipe.post} in the wardrobe catalog has drifted from the production model`);
  }
});

test('every row names a real scene, a real module and a real person', () => {
  const ids = new Set(Object.values(CHARACTER_IDS));
  for (const a of APPEARANCES) {
    const scene = SCENES[a.scene];
    assert.ok(scene, `${a.character} is in "${a.scene}", which is not a scene`);
    assert.ok(scene.modules.includes(a.module),
      `${a.character} in ${a.scene} is dressed by ${a.module}, `
      + `which is not one of that scene's modules (${scene.modules.join(', ')})`);
    assert.ok(fs.existsSync(path.join(ROOT, a.module)), `${a.module} does not exist`);
    assert.ok(ids.has(a.character) || Object.hasOwn(EXTRAS, a.character),
      `"${a.character}" is neither a CHARACTER_IDS value nor declared in EXTRAS`);
    assert.ok(a.where && a.where.length > 3,
      `${a.character} in ${a.scene} has no "where" — the whole point is knowing `
      + 'where in the scene he is');
    assert.ok(a.name, `${a.character} in ${a.scene} has no display name`);
    assert.ok(a.rig === 'person' || a.rig === 'block',
      `${a.character} in ${a.scene} has rig "${a.rig}"`);
  }
});

test('every scene is used, and every scene module exists', () => {
  for (const scene of Object.values(SCENES)) {
    assert.ok(appearancesInScene(scene.id).length > 0,
      `${scene.id} is declared and nobody is in it`);
    for (const rel of scene.modules) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `${scene.id} names ${rel}, which does not exist`);
    }
  }
});

test('nobody is listed twice in the same place in the same scene', () => {
  const seen = new Set();
  for (const a of APPEARANCES) {
    const key = `${a.character}@${a.scene}@${a.where}`;
    assert.ok(!seen.has(key), `${a.character} is in ${a.scene} twice at "${a.where}"`);
    seen.add(key);
  }
});

/* ------------------------------------------------------------------ */
/* Check 1 — the row points at a line that exists                      */
/* ------------------------------------------------------------------ */

test('every row quotes a line that is really in the scene it names', () => {
  const cache = new Map();
  for (const a of APPEARANCES) {
    assert.ok(a.evidence, `${a.character} in ${a.scene} cites nothing`);
    if (!cache.has(a.module)) cache.set(a.module, read(a.module));
    assert.ok(cache.get(a.module).includes(a.evidence),
      `${a.module} no longer contains ${JSON.stringify(a.evidence)}, which is `
      + `the ledger's only evidence that ${a.name} is in ${a.scene}. Either he `
      + 'has been moved or removed and the row is now a lie, or the call site '
      + 'was reformatted and the row needs re-quoting.');
  }
});

/* ------------------------------------------------------------------ */
/* Check 2 — the clothes are the scene's clothes                       */
/* ------------------------------------------------------------------ */

test('rows that name a wardrobe export ARE that export, by identity', () => {
  for (const a of APPEARANCES) {
    if (!a.from.wardrobe) continue;
    const model = WARDROBE_MODELS.get(a.from.wardrobe);
    assert.ok(model, `${a.from.wardrobe} is not exported by src/core/wardrobe.js`);
    assert.equal(a.model, model,
      `${a.name} in ${a.scene} claims to wear ${a.from.wardrobe} but carries a `
      + 'COPY of it rather than the object itself. A copy is a second ledger '
      + 'and second ledgers drift; this must be the same object.');
  }
});

test('scene-owned additions to a canonical wardrobe model are explicit and exact', () => {
  for (const a of APPEARANCES) {
    if (!a.from.baseWardrobe) continue;
    const base = WARDROBE_MODELS.get(a.from.baseWardrobe);
    assert.ok(base, `${a.from.baseWardrobe} is not exported by src/core/wardrobe.js`);
    const adds = new Set(a.from.adds ?? []);
    for (const [key, value] of Object.entries(base)) {
      assert.deepEqual(a.model[key], value,
        `${a.name} in ${a.scene} drifted from ${a.from.baseWardrobe}.${key}`);
    }
    for (const key of Object.keys(a.model)) {
      assert.ok(Object.hasOwn(base, key) || adds.has(key),
        `${a.name} in ${a.scene} adds undeclared wardrobe field ${key}`);
    }
    for (const key of adds) {
      assert.ok(Object.hasOwn(a.model, key) && !Object.hasOwn(base, key),
        `${a.name} in ${a.scene} declares a non-addition ${key}`);
    }
  }
});

test('rows proved against another module match what that module exports', async () => {
  for (const a of APPEARANCES) {
    if (!a.from.export) continue;
    const url = pathToFileURL(path.join(ROOT, a.from.module)).href;
    // eslint-disable-next-line no-await-in-loop
    const module = await import(url);
    const exported = module[a.from.export];
    assert.ok(exported !== undefined,
      `${a.from.module} does not export ${a.from.export}`);
    let value = exported;
    for (const key of a.from.at) {
      value = Array.isArray(value) ? value.find((v) => v?.id === key) : value?.[key];
      assert.ok(value !== undefined,
        `${a.from.export}[${a.from.at.join('][')}] is gone from ${a.from.module}`);
    }
    const adds = new Set(a.from.adds ?? []);
    const mine = Object.fromEntries(
      Object.entries(a.model).filter(([k]) => !adds.has(k)),
    );
    assert.deepEqual(mine, { ...value },
      `${a.name} in ${a.scene} disagrees with ${a.from.module}. THE MODULE IS `
      + 'RIGHT — bring the ledger forward, do not push the scene back.');
    for (const key of Object.keys(a.model)) {
      if (adds.has(key)) continue;
      assert.ok(Object.hasOwn(value, key),
        `${a.name} in ${a.scene} carries "${key}", which ${a.from.module} does `
        + 'not, and which is not declared in `from.adds`');
    }
  }
});

test("rows read out of a scene's private table still match that table", () => {
  for (const a of APPEARANCES) {
    if (a.from.source !== true) continue;
    const label = `${a.name} in ${a.scene}`;
    const text = a.from.containing
      ? literalContaining(read(a.from.module), a.evidence)
      : literalAfter(read(a.from.module), a.evidence);
    assert.ok(text, `${label}: no object literal after ${JSON.stringify(a.evidence)}`);
    const real = evalLiteral(text, label);
    const adds = new Set(a.from.adds ?? []);
    for (const [key, value] of Object.entries(a.model)) {
      if (adds.has(key)) continue;
      assert.deepEqual(value, real[key],
        `${label}: the ledger says ${key} is ${JSON.stringify(value)} and `
        + `${a.from.module} says ${JSON.stringify(real[key])}. The scene is right.`);
    }
    for (const key of Object.keys(real)) {
      if (NOT_WARDROBE.has(key)) continue;
      assert.ok(Object.hasOwn(a.model, key),
        `${label}: ${a.from.module} now also gives him "${key}" and the ledger `
        + 'has not caught up. Copy it across.');
    }
  }
});

test('the heist crew reuse canonical bodies while tactical gear stays scene-owned', async () => {
  const module = await import(pathToFileURL(path.join(ROOT, 'src/heist/cast.js')).href);
  const source = read('src/heist/cast.js');
  assert.ok(source.includes('...presentation.model,'));
  assert.ok(source.includes('bandana: false,'));
  assert.ok(source.includes('face: CAN_PAINT_FACES ? (presentation.face ?? null) : null,'));
  assert.ok(source.includes('addPlateCarrier(figure, presentation.shirtDark);'));
  for (const a of appearancesInScene('bank_heist')) {
    const presentation = module.HEIST_CREW_PRESENTATION[a.character];
    assert.ok(presentation, `the heist no longer presents ${a.character}`);
    const canonical = WARDROBE_MODULE.WARDROBE[a.character];
    assert.ok(canonical, `${a.character} has no canonical wardrobe model`);
    assert.strictEqual(presentation.model, canonical,
      `${a.name}'s heist presentation copied or replaced the canonical body`);
    assert.strictEqual(a.model, canonical,
      `${a.name}'s appearance row does not mirror the canonical body`);
    assert.equal(typeof presentation.shirtDark, 'number',
      `${a.name}'s scene-owned plate-carrier colour is missing`);
  }
});

test('rows with nothing to show say why, and rows with something to show can be built', () => {
  for (const a of APPEARANCES) {
    if (isShowable(a)) {
      assert.equal(typeof a.model.height, 'number',
        `${a.name} in ${a.scene} has no height, so nothing can stand him up`);
      assert.ok(a.model.height > 1.2 && a.model.height < 2.3,
        `${a.name} in ${a.scene} is ${a.model.height} m`);
      assert.ok(!a.from.unshown,
        `${a.name} in ${a.scene} has a model AND a reason it cannot be shown`);
    } else {
      assert.ok(a.from.unshown && a.from.unshown.length > 20,
        `${a.name} in ${a.scene} has no model and no explanation for it. A row `
        + 'with nothing to show has to say why, or it reads as an oversight.');
      assert.equal(a.rig, 'block',
        `${a.name} in ${a.scene} is on the club rig and still has no model`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Check 3 — a scene cannot quietly start dressing somebody new        */
/* ------------------------------------------------------------------ */

test('every wardrobe model a scene can reach is a row in the ledger', () => {
  for (const scene of Object.values(SCENES)) {
    for (const rel of scene.modules) {
      const reachable = wardrobeReach(rel);
      const claimed = new Set(
        appearancesInScene(scene.id)
          .filter((a) => a.module === rel)
          .flatMap((a) => [a.from.wardrobe, a.from.baseWardrobe, a.from.canonicalBody]
            .filter(Boolean).map(baseName)),
      );
      for (const name of reachable) {
        assert.ok(claimed.has(name),
          `${rel} can dress somebody in ${name} and the ledger has no row for `
          + `it in ${scene.id}. Somebody has been added to this scene and the `
          + 'appearance ledger — and therefore the fitting room — does not know.');
      }
      for (const name of claimed) {
        assert.ok(reachable.has(name),
          `the ledger says ${scene.id} dresses somebody in ${name} out of `
          + `${rel}, and that module cannot reach ${name} at all.`);
      }
    }
  }
});

test('the six mansion guards are six men, not one man six times', () => {
  for (const sceneId of ['mansion_house', 'mansion_siege']) {
    const used = appearancesInScene(sceneId)
      .filter((a) => a.character.startsWith('staff:guard_'))
      .map((a) => a.character);
    assert.equal(new Set(used).size, used.length,
      `${sceneId} posts the same guard in two places at once`);
    for (const a of appearancesInScene(sceneId)) {
      if (!a.from.wardrobe?.startsWith('MANSION_GUARDS')) continue;
      const index = Number(a.from.wardrobe.match(/\[(\d+)\]/)[1]);
      assert.ok(index >= 0 && index < WARDROBE_MODULE.MANSION_GUARDS.length,
        `${sceneId} posts MANSION_GUARDS[${index}] and there are only `
        + `${WARDROBE_MODULE.MANSION_GUARDS.length}`);
      assert.equal(a.character, `staff:guard_${index}`,
        'a guard\'s ledger id must be his index, or the same man reads as two '
        + 'people across the two mansion scenes');
    }
  }
});

/* ------------------------------------------------------------------ */
/* Check 4 — the campaign's hard identity rules                        */
/* ------------------------------------------------------------------ */

test('the two Lous are two men in every scene that has both', () => {
  const lou = appearancesOf(CHARACTER_IDS.LOU);
  const sasole = appearancesOf(CHARACTER_IDS.CAPTAIN_LOU_SASOLE);
  assert.ok(lou.length > 0 && sasole.length > 0);
  assert.notEqual(CHARACTER_IDS.LOU, CHARACTER_IDS.CAPTAIN_LOU_SASOLE);
  assert.notEqual(PHOTOS[CHARACTER_IDS.LOU], PHOTOS[CHARACTER_IDS.CAPTAIN_LOU_SASOLE]);
  const louModels = new Set(lou.map((a) => a.model).filter(Boolean));
  for (const a of sasole) {
    if (!a.model) continue;
    assert.ok(!louModels.has(a.model),
      `${a.scene} dresses Captain Lou Sasole in one of Big Uncle Lou's models. `
      + 'They share a first name and nothing else.');
  }
  /* And in the one house they are both in on the same night. */
  const house = appearancesInScene('mansion_house');
  assert.ok(house.some((a) => a.character === CHARACTER_IDS.LOU));
  assert.ok(house.some((a) => a.character === CHARACTER_IDS.CAPTAIN_LOU_SASOLE));
});

test('the dead are not in the mansion', () => {
  /* Owner, 2026-08-05: "Willy should not be in any mansion scene because he
   * died on the boat same with billy hotdog both died before hand." */
  for (const id of [CHARACTER_IDS.WILLY, CHARACTER_IDS.BILLY_HOTDOG]) {
    for (const a of appearancesOf(id)) {
      assert.ok(!a.scene.startsWith('mansion'),
        `${a.name} is dead before the mansion arc and the ledger has him in `
        + `${a.scene}`);
    }
  }
  /* And they are still correct earlier, which is the other half of the rule —
   * a check that only removed people would pass by deleting them. */
  assert.ok(appearancesOf(CHARACTER_IDS.WILLY).some((a) => a.scene === 'no_wake'),
    'Willy has to be on the boat; it is the scene he dies in');
  assert.ok(appearancesOf(CHARACTER_IDS.BILLY_HOTDOG).some((a) => a.scene === 'bing_party'),
    'Billy HotDog has to be at the party; it is the scene he dies in');
});

test('no two people wear the same face', () => {
  const byPhoto = new Map();
  for (const [character, photo] of Object.entries(PHOTOS)) {
    assert.ok(!byPhoto.has(photo),
      `${character} and ${byPhoto.get(photo)} both wear ${photo}, which mints a `
      + 'second identity for one photograph');
    byPhoto.set(photo, character);
  }
  const onDisk = new Set(JSON.parse(read('assets/faces/index.json')).files);
  for (const [character, photo] of Object.entries(PHOTOS)) {
    if (!onDisk.has(photo)) continue;
    assert.ok(appearancesOf(character).length > 0,
      `${photo} has landed for ${character} and he is in no scene`);
  }
});

/* ------------------------------------------------------------------ */
/* The ledger's own promises to the fitting room                       */
/* ------------------------------------------------------------------ */

test('the ledger answers the two questions the workshop asks it', () => {
  /* Everyone in a scene. */
  const bing = appearancesInScene('bada_bing');
  assert.ok(bing.length >= 18, `the Bing floor is ${bing.length} people`);
  assert.ok(bing.every((a) => a.scene === 'bada_bing'));

  /* One person across every scene. Lou is the case the whole ledger was
   * written for: several outfits over several modules, and they have to come
   * back in one list or the workshop cannot put them side by side.
   *
   * THIS USED TO ASSERT FOUR OUTFITS and it is three, which is a real change
   * rather than a loosened bound. The fourth was `BIG_UNCLE_LOU_MANSION`, worn
   * by a Big Uncle Lou sitting in the office carver — and the ledger's whole
   * reason for existing is that it revealed there was a SECOND Big Uncle Lou
   * standing 1.7 m away in the plain suit, both mounted unconditionally. The
   * seated one was removed, so that outfit is now worn by nobody.
   *
   * It is deliberately still an `>=`: if somebody seats him again in
   * `cast.js` and dresses him properly, this goes back to four and the test
   * should not have to be edited to allow it. */
  const lou = appearancesOf(CHARACTER_IDS.LOU);
  assert.ok(lou.length >= 5, `Big Uncle Lou is in ${lou.length} places`);
  const outfits = new Set(lou.map((a) => a.model));
  assert.ok(outfits.size >= 3,
    `Big Uncle Lou wears ${outfits.size} distinct outfits across the campaign; `
    + 'the club, the course and the plain suit are three');

  const characters = ledgerCharacters();
  assert.equal(characters.length, new Set(characters.map((c) => c.id)).size);
  for (const c of characters) assert.ok(c.scenes.length > 0);
});

test('a one-person wardrobe lineup is framed full length, not cropped to its width', async () => {
  const preview = await import('../src/wardrobe/preview.js');
  assert.equal(typeof preview.lineupCameraDistance, 'function',
    'the fitting room must expose its lineup framing calculation for verification');
  const distance = preview.lineupCameraDistance({
    width: 0.96, tallest: 1.88, targetY: 1.0, aspect: 980 / 900, fov: 38,
  });
  const halfV = (38 * Math.PI / 180) / 2;
  const verticalNeed = Math.max(1.0, 1.88 - 1.0) / Math.tan(halfV) * 1.06;
  assert.ok(distance + 1e-9 >= verticalNeed,
    `one-person lineup distance ${distance} ignores its ${verticalNeed} m vertical fit`);
});

test('real animated Lou Npc keeps pinstripes and three-piece fronts registered to the breathing body surface', async () => {
  const [THREE, cast] = await Promise.all([
    import('three'), import(pathToFileURL(path.join(ROOT, 'src/bing/cast.js')).href),
  ]);
  const npc = new cast.Npc(new THREE.Scene(), {
    name: 'Lou', tier: 'hero', job: 'sit', look: false,
    model: { ...WARDROBE_MODULE.BIG_UNCLE_LOU_BING, face: null },
  });
  const named = (name) => {
    const found = [];
    npc.group.traverse((object) => { if (object.name === name) found.push(object); });
    return found;
  };
  const belly = npc.group.getObjectByName('person.gut.belly');
  const surfaces = {
    waistcoat: named('suit.waistcoat.cloth'),
    lapelLeft: named('suit.lapel.left'),
    lapelRight: named('suit.lapel.right'),
    pinstripeFronts: named('suit.pinstripe.front'),
  };
  assert.ok(belly, 'Lou lost the structural belly surface');
  assert.equal(surfaces.waistcoat.length, 1);
  assert.equal(surfaces.lapelLeft.length, 1);
  assert.equal(surfaces.lapelRight.length, 1);
  assert.equal(surfaces.pinstripeFronts.length, 6);

  const box = (object) => new THREE.Box3().setFromObject(object);
  const gaps = [-Math.PI / 3, 0, Math.PI / 3].map((phase) => {
    npc.t = phase;
    npc.phase = 0;
    npc.update(0, new THREE.Vector3());
    npc.group.updateMatrixWorld(true);
    const bellyZ = box(belly).max.z;
    const gap = (object) => box(object).max.z - bellyZ;
    return {
      waistcoat: gap(surfaces.waistcoat[0]),
      lapelLeft: gap(surfaces.lapelLeft[0]),
      lapelRight: gap(surfaces.lapelRight[0]),
      pinstripeFronts: surfaces.pinstripeFronts.map(gap),
    };
  });
  const drift = (values) => Math.max(...values) - Math.min(...values);
  const drifts = [
    drift(gaps.map((entry) => entry.waistcoat)),
    drift(gaps.map((entry) => entry.lapelLeft)),
    drift(gaps.map((entry) => entry.lapelRight)),
    ...surfaces.pinstripeFronts.map((_, index) => (
      drift(gaps.map((entry) => entry.pinstripeFronts[index]))
    )),
  ];
  assert.ok(Math.max(...drifts) <= 0.0015,
    `Lou garment-to-belly surface drift is ${(Math.max(...drifts) * 1000).toFixed(3)}mm: ${JSON.stringify({ gaps, drifts })}`);
});

test('every wardrobe difference has a status and no unresolved divergence ships', () => {
  const allowed = new Set(['none', 'intentional', 'unresolved']);
  for (const a of APPEARANCES) {
    assert.ok(allowed.has(a.divergenceStatus),
      `${a.name} in ${a.scene} has invalid divergence status ${a.divergenceStatus}`);
    assert.equal(Boolean(a.divergence), a.divergenceStatus !== 'none',
      `${a.name} in ${a.scene} has contradictory divergence data`);
  }
  const reported = APPEARANCES.filter((a) => a.divergence);
  assert.deepEqual(reported.map((a) => [a.scene, a.character, a.divergenceStatus]), [
    ['enola_squatch', CHARACTER_IDS.IRISH, 'intentional'],
    ['enola_squatch', CHARACTER_IDS.NUMBSKULL, 'intentional'],
  ]);
  assert.deepEqual(APPEARANCES.filter((a) => a.divergenceStatus === 'unresolved'), [],
    'an unresolved cross-scene wardrobe divergence would ship');
});
