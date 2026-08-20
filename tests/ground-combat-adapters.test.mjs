import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const groundCombat = await import('../src/core/combat/index.js');
const { buildPalaceCast } = await import('../src/cartel-palace/cast.js');
const { PalaceSecurity } = await import('../src/cartel-palace/security.js');
const { createAttackerPool } = await import('../src/mansion/siege/attackers.js');
const { buildSiegeEnsemble } = await import('../src/mansion/siege/ensemble.js');
const { ROLES, STAGING } = await import('../src/mansion/siege/waves.js');
const { Firearm } = await import('../src/core/weapons/Firearm.js');
const { CombatArmorPresentation } = await import('../src/world/combat-armor.js');

const ROOT = new URL('../', import.meta.url);
const DEEP_MODULES = Object.freeze([
  'AabbCombatSpace',
  'CombatPerception',
  'CombatWeaponAim',
  'CombatImpairments',
  'CombatImpactResolver',
  'CombatFireControl',
]);
const CANONICAL_MODULES = Object.freeze([
  'CombatActor',
  ...DEEP_MODULES,
  'CombatSupplyState',
  'SuppressionModel',
  'CombatStatusHud',
]);
const IMPACT_FIELDS = Object.freeze([
  'point', 'normal', 'origin', 'direction', 'distance',
  'object', 'weapon', 'damage', 'penetration',
]);

function combatImports(source) {
  const imports = new Map();
  const matcher = /import\s*\{([\s\S]*?)\}\s*from\s*(['"])([^'"]*\/core\/combat\/[^'"]+\.js)\2\s*;/g;
  for (const match of source.matchAll(matcher)) {
    const specifiers = match[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',');
    for (const raw of specifiers) {
      const specifier = raw.trim();
      if (!specifier) continue;
      const alias = specifier.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
      if (alias) imports.set(alias[1], alias[2] ?? alias[1]);
    }
  }
  return imports;
}

function withoutImports(source) {
  return source.replace(/import\s*[\s\S]*?\sfrom\s*(['"])[^'"]+\1\s*;/g, '');
}

function assertDeepAdapter(source, label) {
  const imports = combatImports(source);
  const implementation = withoutImports(source);
  for (const name of DEEP_MODULES) {
    const localName = imports.get(name);
    assert.ok(localName, `${label} must import ${name} from core/combat`);
    assert.match(
      implementation,
      new RegExp(`\\bnew\\s+${localName}\\s*\\(`),
      `${label} imports ${name} but does not compose it`,
    );
  }
}

function firstMesh(anchor) {
  let mesh = null;
  anchor.traverse((node) => {
    if (!mesh && node.isMesh) mesh = node;
  });
  assert.ok(mesh, `${anchor.name || 'body anchor'} must contain a raycast mesh`);
  return mesh;
}

function assertHitProtocol(entry, label) {
  assert.equal(entry.root.userData.combatant, entry, `${label} combatant tag`);
  assert.equal(entry.root.userData.combatActor, entry.actor, `${label} actor tag`);
  for (const [part, zone, hitPart] of [
    ['head', 'head', 'head'],
    ['body', 'chest', 'chest'],
    ['armL', 'limb', 'arm'],
    ['legL', 'limb', 'leg'],
  ]) {
    const anchor = entry.figure.parts[part];
    assert.ok(anchor, `${label} is missing ${part}`);
    assert.equal(anchor.userData.hitZone, zone, `${label} ${part} hitZone`);
    assert.equal(anchor.userData.hitPart, hitPart, `${label} ${part} hitPart`);
  }
}

function completeImpact(scene, entry) {
  const anchor = entry.figure.parts.body;
  const object = firstMesh(anchor);
  scene.updateMatrixWorld(true);
  const point = anchor.localToWorld(new THREE.Vector3(0.017, 0.029, 0.013));
  const origin = point.clone().add(new THREE.Vector3(0.4, 0.2, 4));
  const direction = point.clone().sub(origin).normalize();
  return {
    point,
    normal: direction.clone().negate(),
    origin,
    direction,
    distance: origin.distanceTo(point),
    object,
    weapon: 'pistol9',
    damage: 12,
    penetration: 0.31,
  };
}

function assertCompleteLocatedImpact(response, input, label) {
  const located = Array.isArray(response) ? response[0] : response;
  assert.ok(located, `${label} returned no Located hit`);
  assert.ok(located.impact, `${label} stripped the full impact record`);
  assert.equal(Object.isFrozen(located.impact), true, `${label} impact is not immutable`);
  for (const field of IMPACT_FIELDS) {
    const actual = located.impact[field];
    const expected = input[field];
    if (expected?.isVector3) {
      assert.notEqual(actual, expected, `${label} must own its ${field} vector`);
      assert.deepEqual(actual.toArray(), expected.toArray(), `${label} changed ${field}`);
    } else {
      assert.equal(actual, expected, `${label} changed ${field}`);
    }
  }
  assert.equal(located.applied, true, `${label} did not apply the body hit`);
}

function constructorOptions(source, binding, constructorName) {
  const marker = new RegExp(
    `\\b(?:const|let)\\s+${binding}\\s*=\\s*new\\s+${constructorName}\\s*\\(`,
  );
  const match = marker.exec(source);
  assert.ok(match, `missing ${binding} = new ${constructorName}(...)`);
  const open = source.indexOf('{', match.index + match[0].length);
  assert.notEqual(open, -1, `${binding} constructor has no options object`);
  let depth = 0;
  let quote = null;
  let escaped = false;
  /* Comments are skipped, not scanned. An apostrophe in an ordinary English
   * comment -- "the root's audio budget" -- would otherwise open a string that
   * never closes, and every brace after it stops counting: the failure lands on
   * an unrelated constructor further down the file with a message about
   * unterminated options, which is a long way from "somebody wrote a
   * possessive in a comment". */
  let comment = null;
  for (let index = open; index < source.length; index++) {
    const character = source[index];
    const next = source[index + 1];
    if (comment === 'line') {
      if (character === '\n') comment = null;
      continue;
    }
    if (comment === 'block') {
      if (character === '*' && next === '/') { comment = null; index++; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') { comment = 'line'; index++; continue; }
    if (character === '/' && next === '*') { comment = 'block'; index++; continue; }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return source.slice(open, index + 1);
  }
  assert.fail(`unterminated ${binding} constructor options`);
}

function assertProductionMain(source, label, weaponBinding) {
  assert.match(source, /new\s+BloodImpactSystem\s*\(/, `${label} has no blood impacts`);
  assert.match(source, /new\s+DeathBloodPool\s*\(/, `${label} has no death blood pool`);
  const playerOptions = constructorOptions(source, 'playerActor', 'CombatActor');
  assert.match(playerOptions, /\barmor\s*:/, `${label} player has no armor`);
  const weaponOptions = constructorOptions(source, weaponBinding, 'WeaponSystem');
  assert.match(weaponOptions, /\bonImpact\s*:/, `${label} WeaponSystem has no impact Seam`);
  assert.doesNotMatch(
    weaponOptions,
    /\bonImpact\s*:\s*(?:async\s*)?\(\s*\{/,
    `${label} destructures and strips the WeaponSystem impact at the callback boundary`,
  );
}

test('the canonical combat surface exports the complete ground-combat Module stack', () => {
  for (const name of CANONICAL_MODULES) {
    assert.equal(typeof groundCombat[name], 'function', `${name} is missing from core/combat/index.js`);
  }
});

test('both production hostile Adapters compose every deep combat Module', async () => {
  const [mansionAttackers, palaceSecurity] = await Promise.all([
    readFile(new URL('src/mansion/siege/attackers.js', ROOT), 'utf8'),
    readFile(new URL('src/cartel-palace/security.js', ROOT), 'utf8'),
  ]);
  assertDeepAdapter(mansionAttackers, 'Mansion Siege attackers');
  assertDeepAdapter(palaceSecurity, 'Cartel Palace security');
});

test('Mansion hostile and friendly rigs share canonical firearm and combat truth', async () => {
  const [attackersSource, ensembleSource] = await Promise.all([
    readFile(new URL('src/mansion/siege/attackers.js', ROOT), 'utf8'),
    readFile(new URL('src/mansion/siege/ensemble.js', ROOT), 'utf8'),
  ]);
  for (const [source, label] of [
    [attackersSource, 'Mansion attackers'],
    [ensembleSource, 'Mansion ensemble'],
  ]) {
    assert.match(source, /import\s*\{\s*Firearm\s*\}\s*from\s*['"][^'"]*\/core\/weapons\/Firearm\.js['"]\s*;/,
      `${label} must import the canonical Firearm`);
    assert.match(withoutImports(source), /\bnew\s+Firearm\s*\(/,
      `${label} does not instantiate the canonical Firearm`);
    assert.doesNotMatch(source, /\bWeaponController\b/,
      `${label} still depends on the legacy WeaponController`);
  }
  assert.doesNotMatch(ensembleSource, /\bresolveBallisticHits\b/,
    'Mansion ensemble still bypasses shared fire and impact truth');
  for (const name of [
    'CombatPerception', 'CombatWeaponAim', 'CombatFireControl', 'CombatImpactResolver',
  ]) {
    assert.match(ensembleSource, new RegExp(`\\bnew\\s+${name}\\s*\\(`),
      `Mansion ensemble does not compose ${name}`);
  }

  const scene = new THREE.Scene();
  const pool = createAttackerPool({ scene });
  const armored = pool.spawn({
    id: 'shared-hostile-firearm', role: ROLES.armored, staging: STAGING.front_steps,
  });
  assert.ok(armored.weapon instanceof Firearm);
  assert.ok(armored.armorPresentation instanceof CombatArmorPresentation);
  assert.equal(armored.armorPresentation.tier, 'heavy');
  assert.equal(armored.weapon.magazine, armored.weapon.rounds,
    'legacy magazine diagnostics no longer mirror Firearm rounds');
  const armoredCheckpoint = JSON.parse(JSON.stringify(pool.snapshot()));
  const armorGroup = armored.armorPresentation.group;
  const [armorHit] = pool.registerHit(armored.figure.parts.body, 100, 0.2);
  assert.equal(armorHit.result.armorBroken, true);
  assert.equal(armorHit.armorBreakPresented, true,
    'the resolved armor break did not drive the presentation exactly once');
  assert.equal(armored.armorPresentation.applyResult(armorHit.result), false,
    'one armor result replayed its break presentation');
  assert.equal(pool.restore(armoredCheckpoint), true);
  assert.equal(armored.armorPresentation.report().state, 'armored',
    'checkpoint restore did not rebuild armor presentation from actor armor');
  const hostileSteps = [];
  armored.path.length = 0;
  armored.goal.copy(armored.root.position).add(new THREE.Vector3(0, 0, 1));
  pool.update(0.1, {
    player: null,
    alive: [],
    colliders: [],
    onStep: (entry, event) => hostileSteps.push({ entry, event }),
  });
  assert.ok(hostileSteps.length > 0, 'moving attackers do not expose post-collision steps');
  assert.equal(hostileSteps[0].entry, armored);
  assert.equal(hostileSteps[0].event.id, armored.id);
  assert.equal(hostileSteps[0].event.moving, true);
  assert.ok(hostileSteps[0].event.from.distanceTo(hostileSteps[0].event.to) > 0);

  const ensemble = buildSiegeEnsemble({ scene });
  ensemble.stage('BRIEFING');
  const friendly = [...ensemble.members.values()]
    .find((member) => member.weapon && member.staged);
  assert.ok(friendly, 'the Mansion ensemble has no armed member');
  assert.ok(friendly.weapon instanceof Firearm);
  assert.ok(friendly.perception instanceof groundCombat.CombatPerception);
  assert.ok(friendly.weaponAim instanceof groundCombat.CombatWeaponAim);
  assert.ok(ensemble.fireControl instanceof groundCombat.CombatFireControl);
  assert.ok(ensemble.impactResolver instanceof groundCombat.CombatImpactResolver);
  assert.equal(friendly.root.userData.combatant, friendly);
  const friendlySteps = [];
  friendly.goal.x += 0.8;
  ensemble.update(0.1, {
    player: null,
    hostiles: [],
    colliders: [],
    onStep: (entry, event) => friendlySteps.push({ entry, event }),
  });
  assert.ok(friendlySteps.some(({ entry, event }) => entry === friendly
    && event.id === friendly.id && event.moving === true
    && event.from.distanceTo(event.to) > 0),
  'moving friendlies do not expose actual displacement steps');

  pool.dispose();
  assert.equal(armorGroup.parent, null, 'pool disposal left armor presentation mounted');
  ensemble.dispose();
});

test('both production casts expose one hit protocol and preserve complete impacts', () => {
  const mansionScene = new THREE.Scene();
  const mansionPool = createAttackerPool({ scene: mansionScene });
  const mansionEntry = mansionPool.spawn({
    id: 'ground-combat-contract',
    role: ROLES.rifle,
    staging: STAGING.front_steps,
  });
  assertHitProtocol(mansionEntry, 'Mansion Siege attacker');
  const mansionImpact = completeImpact(mansionScene, mansionEntry);
  assertCompleteLocatedImpact(
    mansionPool.registerHit(mansionImpact), mansionImpact, 'Mansion Siege',
  );
  mansionPool.dispose();

  const palaceScene = new THREE.Scene();
  const palaceCast = buildPalaceCast(palaceScene);
  for (const entry of palaceCast.all) assertHitProtocol(entry, `Cartel Palace ${entry.id}`);
  const playerActor = new groundCombat.CombatActor({
    id: 'architecture-player', faction: 'crew', maxHealth: 100, armor: 20,
  });
  const palaceSecurity = new PalaceSecurity({ cast: palaceCast, playerActor });
  const palaceEntry = palaceCast.guards[0];
  const palaceImpact = completeImpact(palaceScene, palaceEntry);
  assertCompleteLocatedImpact(
    palaceSecurity.applyPlayerImpact(palaceImpact), palaceImpact, 'Cartel Palace',
  );
  palaceSecurity.dispose();
});

test('both production mains mount blood, player armor and a whole-impact Seam', async () => {
  const [mansionMain, palaceMain] = await Promise.all([
    readFile(new URL('src/mansion/siege/main.js', ROOT), 'utf8'),
    readFile(new URL('src/cartel-palace/main.js', ROOT), 'utf8'),
  ]);
  assertProductionMain(mansionMain, 'Mansion Siege', 'weaponSystem');
  assertProductionMain(palaceMain, 'Cartel Palace', 'weapons');
});

test('the gameplay catalog names both production Adapters and bounds migration', async () => {
  const docs = await readFile(new URL('docs/REUSABLE-GAMEPLAY-SYSTEMS.md', ROOT), 'utf8');
  const start = docs.indexOf('## Ground-combat architecture');
  const end = docs.indexOf('\n## Inventory', start);
  assert.ok(start >= 0 && end > start, 'ground-combat architecture section is missing');
  const section = docs.slice(start, end);

  assert.match(
    section,
    /Mansion\s+Siege\s+and\s+Cartel\s+Palace\s+are\s+the\s+two\s+production\s+ground-combat\s+Adapters/,
  );
  assert.match(section, /reuse claim is proven for both player\/hostile and hostile\/player paths/);
  assert.match(section, /friendly ensemble additionally proves the shared perception/);
  assert.match(section, /WeaponController[\s\S]*no production consumer left/);
  assert.doesNotMatch(section, /Mansion Siege[\s\S]{0,180}WeaponController/);
  assert.match(section, /CombatLab\s+is\s+verification\s+only/);

  const migration = section.slice(section.indexOf('### Remaining migration matrix and order'));
  const ordered = ['Heist / THE TAKE', 'Motel:', 'Silver Case:', 'Regular Mansion', 'scripted firearm scenes'];
  let previous = -1;
  for (const name of ordered) {
    const position = migration.indexOf(name);
    assert.ok(position > previous, `${name} is missing or out of migration order`);
    previous = position;
  }
  assert.match(
    migration,
    /Air combat, arcade combat\/targeting and cinematic Initiation are explicitly out\s+of scope/,
  );
});
