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

import { CHARACTER_IDS } from '../src/core/campaign.js';
import * as WARDROBE_MODULE from '../src/core/wardrobe.js';
import {
  APPEARANCES, EXTRAS, PHOTOS, SCENES,
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
    const text = literalAfter(read(a.from.module), a.evidence);
    assert.ok(text, `${label}: no object literal after ${JSON.stringify(a.evidence)}`);
    const real = evalLiteral(text, label);
    for (const [key, value] of Object.entries(a.model)) {
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

test('the heist crew wear the shirts their own presentation table gives them', async () => {
  /* `from.adds` above deliberately excludes these three keys from the deep
   * compare, because the scene composes them at the call site rather than
   * storing them on `model`. Excluded is not unchecked: `shirt` comes off the
   * same exported table and is compared here, and the two constants are read
   * back out of the call site itself. */
  const module = await import(pathToFileURL(path.join(ROOT, 'src/heist/cast.js')).href);
  const source = read('src/heist/cast.js');
  assert.ok(source.includes('skin: 0xd2a074,'), 'the heist no longer sets skin at the call site');
  assert.ok(source.includes('bandana: false,'), 'the heist no longer sets bandana at the call site');
  for (const a of appearancesInScene('bank_heist')) {
    const presentation = module.HEIST_CREW_PRESENTATION[a.character];
    assert.ok(presentation, `the heist no longer presents ${a.character}`);
    assert.equal(a.model.shirt, presentation.shirt,
      `${a.name}'s heist shirt has moved`);
    assert.equal(a.model.skin, 0xd2a074, `${a.name}'s heist skin has moved`);
    assert.equal(a.model.bandana, false, `${a.name} has a bandana on the job`);
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
          .filter((a) => a.module === rel && a.from.wardrobe)
          .map((a) => baseName(a.from.wardrobe)),
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
   * written for: four outfits, five modules, and they have to come back in
   * one list or the workshop cannot put them side by side. */
  const lou = appearancesOf(CHARACTER_IDS.LOU);
  assert.ok(lou.length >= 5, `Big Uncle Lou is in ${lou.length} places`);
  const outfits = new Set(lou.map((a) => a.model));
  assert.ok(outfits.size >= 4,
    `Big Uncle Lou wears ${outfits.size} distinct outfits across the campaign; `
    + 'the club, the mansion, the course and the plain suit are four');

  const characters = ledgerCharacters();
  assert.equal(characters.length, new Set(characters.map((c) => c.id)).size);
  for (const c of characters) assert.ok(c.scenes.length > 0);
});

test('every divergence the ledger reports is a sentence, not a shrug', () => {
  const reported = APPEARANCES.filter((a) => a.divergence);
  assert.ok(reported.length > 0,
    'the ledger reports no divergences at all, which would be a first');
  for (const a of reported) {
    assert.ok(a.divergence.length > 60,
      `${a.name} in ${a.scene} has a divergence note too short to act on`);
  }
});
