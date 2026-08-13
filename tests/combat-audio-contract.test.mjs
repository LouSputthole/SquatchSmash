import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as groundCombat from '../src/core/combat/index.js';

/*
 * Red contract for ground-combat sound. The manifest remains the production
 * authority: the names in NEW_PRODUCTION_CUES are the exact non-story queue,
 * while REUSED_CUES are recordings that already exist and must not be
 * regenerated under new aliases.
 */
const NEW_PRODUCTION_CUES = Object.freeze([
  {
    name: 'combat.bullet.impact.flesh', duration: 0.75,
    intent: /clothed flesh|clothing.*body/i,
  },
  {
    name: 'combat.bullet.impact.flesh.heavy', duration: 0.95,
    intent: /large.?calib|heavy.*round|anti.?materiel/i,
  },
  {
    name: 'combat.bullet.impact.head', duration: 0.8,
    intent: /head|skull/i,
  },
  {
    name: 'combat.bullet.impact.armor', duration: 0.75,
    intent: /ballistic.*plate|body armo(?:u)?r/i,
  },
  {
    name: 'combat.bullet.impact.armor.heavy', duration: 0.95,
    intent: /heavy.*plate|large.?calib.*armo(?:u)?r/i,
  },
  {
    name: 'combat.armor.break', duration: 1.1,
    intent: /ceramic.*fracture|plate.*break/i,
  },
  {
    name: 'combat.armor.plate.drop', duration: 1.25,
    intent: /plate.*(?:drop|floor)|armo(?:u)?r.*(?:drop|floor)/i,
  },
  {
    name: 'combat.player.hit.flesh', duration: 0.9,
    intent: /first.?person|player/i,
  },
  {
    name: 'combat.takedown.quiet', duration: 1.8,
    intent: /grapple|controlled lowering|quiet takedown/i,
  },
  {
    name: 'combat.triage.bandage', duration: 1.6,
    intent: /gauze|field dressing/i,
  },
  {
    name: 'combat.bullet.impact.wood', duration: 1,
    intent: /hardwood|wood/i,
  },
  {
    name: 'combat.bullet.impact.metal', duration: 1.1,
    intent: /steel|metal/i,
  },
  {
    name: 'combat.bullet.impact.glass', duration: 1,
    intent: /glass/i,
  },
  {
    name: 'combat.bullet.impact.dirt', duration: 0.9,
    intent: /dirt|soil/i,
  },
  {
    name: 'combat.bullet.whiz.pistol', duration: 0.8,
    intent: /pistol|handgun|9mm/i,
  },
  {
    name: 'combat.bullet.whiz.heavy', duration: 1.1,
    intent: /\.50|belt.?fed|large.?calib|heavy/i,
  },
  {
    name: 'combat.body.fall.gravel', duration: 1.3,
    intent: /gravel/i,
  },
  {
    name: 'combat.body.fall.grass', duration: 1.25,
    intent: /grass|lawn/i,
  },
  {
    name: 'combat.shell.floor.wood', duration: 0.75,
    intent: /brass|casing|case.*wood/i,
  },
  {
    name: 'weapon.shotgun.fire', duration: 1.8,
    intent: /12.?gauge|shotgun/i,
  },
  {
    name: 'weapon.shotgun.reload.out', duration: 1.1,
    intent: /shotgun.*(?:action|reload|tube)|(?:action|tube).*shotgun/i,
  },
  {
    name: 'weapon.shotgun.reload.in', duration: 2.2,
    intent: /shotgun.*(?:shell|reload|tube)|(?:shell|tube).*shotgun/i,
  },
  {
    name: 'weapon.shotgun.empty', duration: 0.7,
    intent: /empty.*shotgun|shotgun.*(?:empty|dry)/i,
  },
  {
    name: 'weapon.shotgun.mag.floor', duration: 1,
    intent: /shotgun.*shell|shell.*shotgun/i,
  },
  {
    name: 'weapon.shotgun.cycle', duration: 1,
    intent: /pump.?action|fore.?end|shotgun.*cycle/i,
  },
]);

const REUSED_CUES = Object.freeze([
  'heist.bullet.whiz',
  'heist.bullet.impact',
  'gun.impact',
  'heist.player.hit',
  'ammo.take',
  'heist.armor.strap',
  'heist.body.marble',
  'silent.body.concrete',
  'drunk.collapse',
  'silent.shell.concrete',
  'footstep.wood.a',
  'footstep.wood.b',
  'footstep.rug',
  'footstep.tile',
  'footstep.concrete',
  'footstep.gravel',
  'footstep.metal',
  'footstep.grass',
  'footstep.dirt',
]);

const EXPECTED_GROUND_COMBAT_AUDIO_CUES = Object.freeze([
  ...NEW_PRODUCTION_CUES.map(({ name }) => name),
  ...REUSED_CUES,
]);

const manifest = JSON.parse(readFileSync(
  new URL('../assets/sfx/manifest.json', import.meta.url),
  'utf8',
));
const audioIndex = JSON.parse(readFileSync(
  new URL('../assets/sfx/index.json', import.meta.url),
  'utf8',
));

function requireClass(name) {
  assert.equal(
    typeof groundCombat[name],
    'function',
    `src/core/combat/index.js must export the reusable ${name} Interface`,
  );
  return groundCombat[name];
}

function audioSpy() {
  const calls = [];
  return {
    calls,
    play(cue, options = {}) {
      calls.push({ cue, options });
      return { cue, options };
    },
  };
}

function cueNames(spy) {
  return spy.calls.map(({ cue }) => cue);
}

test('ground combat exports the reusable audio and positional step Interfaces', () => {
  assert.equal(typeof groundCombat.CombatAudio, 'function');
  assert.equal(typeof groundCombat.CombatStepCadence, 'function');
  assert.deepEqual(
    groundCombat.GROUND_COMBAT_AUDIO_CUES,
    EXPECTED_GROUND_COMBAT_AUDIO_CUES,
    'the preload surface is an exact stable bank: new queue first, approved reuse second',
  );
  assert.equal(
    groundCombat.GROUND_COMBAT_AUDIO_CUES?.some((name) => name.startsWith('combat.hitconfirm.')),
    false,
    'hit confirmation must use physical/result cues, not a redundant arcade sound',
  );
});

test('CombatAudio maps physical body, head, armor, break and player-hit results', () => {
  const CombatAudio = requireClass('CombatAudio');
  const engine = audioSpy();
  const audio = new CombatAudio({ audio: engine });
  const position = { x: 2, y: 1.4, z: -3 };

  audio.impact({
    target: 'enemy', zone: 'body', caliber: 'rifle', position,
    result: { applied: true, absorbed: 0, armorBroken: false, fatal: false },
  });
  audio.impact({
    target: 'enemy', zone: 'head', caliber: 'rifle', position,
    result: { applied: true, absorbed: 0, armorBroken: false, fatal: true },
  });
  audio.impact({
    target: 'enemy', zone: 'body', caliber: 'rifle', position,
    result: { applied: true, absorbed: 8, armorBroken: false, fatal: false },
  });
  audio.impact({
    target: 'enemy', zone: 'body', caliber: 'heavy', position,
    result: { applied: true, absorbed: 24, armorBroken: true, fatal: false },
  });
  audio.impact({
    target: 'player', zone: 'body', caliber: 'rifle', position,
    result: { applied: true, absorbed: 0, armorBroken: false, fatal: false },
  });
  audio.impact({
    target: 'player', zone: 'body', caliber: 'rifle', position,
    result: { applied: true, absorbed: 6, armorBroken: false, fatal: false },
  });

  assert.deepEqual(cueNames(engine), [
    'combat.bullet.impact.flesh',
    'combat.bullet.impact.head',
    'combat.bullet.impact.armor',
    'combat.bullet.impact.armor.heavy',
    'combat.armor.break',
    'combat.armor.plate.drop',
    'combat.player.hit.flesh',
    'heist.player.hit',
  ]);
  assert.ok(engine.calls.every(({ options }) => options.position === position));
  assert.ok(cueNames(engine).every((name) => !name.startsWith('combat.hitconfirm.')));
});

test('CombatAudio distinguishes pistol, rifle and heavy near-pass calibers', () => {
  const CombatAudio = requireClass('CombatAudio');
  const engine = audioSpy();
  const audio = new CombatAudio({ audio: engine });
  const position = { x: -1, y: 1.6, z: 5 };

  audio.whiz({ caliber: 'pistol', position });
  audio.whiz({ caliber: 'rifle', position });
  audio.whiz({ caliber: 'heavy', position });

  assert.deepEqual(cueNames(engine), [
    'combat.bullet.whiz.pistol',
    'heist.bullet.whiz',
    'combat.bullet.whiz.heavy',
  ]);
  assert.ok(engine.calls.every(({ options }) => options.position === position));
});

test('CombatAudio classifies world impacts instead of layering one generic hit', () => {
  const CombatAudio = requireClass('CombatAudio');
  const engine = audioSpy();
  const audio = new CombatAudio({ audio: engine });
  const position = { x: 0, y: 0.8, z: 0 };

  for (const material of ['stone', 'drywall', 'wood', 'metal', 'glass', 'dirt']) {
    audio.worldImpact({ material, position });
  }

  assert.deepEqual(cueNames(engine), [
    'heist.bullet.impact',
    'gun.impact',
    'combat.bullet.impact.wood',
    'combat.bullet.impact.metal',
    'combat.bullet.impact.glass',
    'combat.bullet.impact.dirt',
  ]);
  assert.equal(engine.calls.length, 6, 'one classified world hit plays one primary impact');
});

test('CombatAudio uses the bandage cue and reuses existing ammo and armor supply cues', () => {
  const CombatAudio = requireClass('CombatAudio');
  const engine = audioSpy();
  const audio = new CombatAudio({ audio: engine });
  const position = { x: 3, y: 0, z: 4 };

  audio.triage({ position });
  audio.resupply({ ammunition: 30, armor: 0, position });
  audio.resupply({ ammunition: 0, armor: 20, position });
  audio.resupply({ ammunition: 30, armor: 20, position });

  assert.deepEqual(cueNames(engine), [
    'combat.triage.bandage',
    'ammo.take',
    'heist.armor.strap',
    'ammo.take',
    'heist.armor.strap',
  ]);
});

test('CombatAudio maps body falls and ejected cases by the actual floor surface', () => {
  const CombatAudio = requireClass('CombatAudio');
  const engine = audioSpy();
  const audio = new CombatAudio({ audio: engine });
  const position = { x: 6, y: 0, z: -8 };

  for (const surface of ['marble', 'concrete', 'wood', 'gravel', 'grass']) {
    audio.bodyFall({ surface, position });
  }
  audio.ejecta({ kind: 'case', surface: 'wood', position });
  audio.ejecta({ kind: 'case', surface: 'concrete', position });
  audio.ejecta({ kind: 'shotgun-shell', surface: 'wood', position });

  assert.deepEqual(cueNames(engine), [
    'heist.body.marble',
    'silent.body.concrete',
    'drunk.collapse',
    'combat.body.fall.gravel',
    'combat.body.fall.grass',
    'combat.shell.floor.wood',
    'silent.shell.concrete',
    'weapon.shotgun.mag.floor',
  ]);
});

test('CombatStepCadence accumulates real movement per enemy and plays positional steps', () => {
  const CombatAudio = requireClass('CombatAudio');
  const CombatStepCadence = requireClass('CombatStepCadence');
  const engine = audioSpy();
  const audio = new CombatAudio({ audio: engine });
  const cadence = new CombatStepCadence({ audio, stride: 1, minInterval: 0 });

  assert.equal(cadence.update({
    id: 'guard-a', dt: 0.1, position: { x: 0, y: 0, z: 0 }, surface: 'gravel',
  }), false, 'the first sample establishes position without a phantom step');
  assert.equal(cadence.update({
    id: 'guard-b', dt: 0.1, position: { x: 10, y: 0, z: 0 }, surface: 'concrete',
  }), false);
  assert.equal(cadence.update({
    id: 'guard-a', dt: 0.1, position: { x: 0.45, y: 0, z: 0 }, surface: 'gravel',
  }), false);
  const guardAPosition = { x: 1.05, y: 0, z: 0 };
  assert.equal(cadence.update({
    id: 'guard-a', dt: 0.1, position: guardAPosition, surface: 'gravel', intensity: 0.8,
  }), true);
  assert.equal(cadence.update({
    id: 'guard-b', dt: 0.1, position: { x: 10.55, y: 0, z: 0 }, surface: 'concrete',
  }), false, 'each enemy owns an independent distance accumulator');
  const guardBPosition = { x: 11.05, y: 0, z: 0 };
  assert.equal(cadence.update({
    id: 'guard-b', dt: 0.1, position: guardBPosition, surface: 'concrete',
  }), true);

  assert.deepEqual(cueNames(engine), ['footstep.gravel', 'footstep.concrete']);
  assert.equal(engine.calls[0].options.position, guardAPosition);
  assert.equal(engine.calls[1].options.position, guardBPosition);
  cadence.reset('guard-a');
  cadence.reset();
});

test('CombatStepCadence bounds crowd footstep voices without losing per-actor distance', () => {
  const CombatAudio = requireClass('CombatAudio');
  const CombatStepCadence = requireClass('CombatStepCadence');
  const engine = audioSpy();
  let now = 10;
  const cadence = new CombatStepCadence({
    audio: new CombatAudio({ audio: engine }),
    stride: 1,
    minInterval: 0,
    maxPerSecond: 2,
    now: () => now,
  });
  for (const [id, x] of [['a', 0], ['b', 10], ['c', 20]]) {
    cadence.update({ id, position: { x, y: 0, z: 0 } });
  }
  assert.equal(cadence.update({ id: 'a', position: { x: 1.1, y: 0, z: 0 } }), true);
  assert.equal(cadence.update({ id: 'b', position: { x: 11.1, y: 0, z: 0 } }), true);
  assert.equal(cadence.update({ id: 'c', position: { x: 21.1, y: 0, z: 0 } }), false,
    'a crowd exceeded the global step-voice budget');
  assert.equal(engine.calls.length, 2);

  now += 1.01;
  assert.equal(cadence.update({ id: 'c', position: { x: 21.11, y: 0, z: 0 } }), true,
    'a rate-limited actor lost its accumulated travel');
  assert.equal(engine.calls.length, 3);
});

test('the manifest carries the exact non-story combat production queue and briefs', () => {
  const queued = manifest.sfx
    .filter(({ name }) => name.startsWith('combat.') || name.startsWith('weapon.shotgun.'))
    .map(({ name }) => name);
  const expectedNames = NEW_PRODUCTION_CUES.map(({ name }) => name);
  assert.deepEqual(queued, expectedNames, 'no missing cues, unapproved voices or duplicate semantics');

  const byName = new Map(manifest.sfx.map((cue) => [cue.name, cue]));
  for (const expected of NEW_PRODUCTION_CUES) {
    const cue = byName.get(expected.name);
    assert.ok(cue, `${expected.name} must have an authoritative manifest production brief`);
    assert.equal(cue.duration, expected.duration, `${expected.name} duration`);
    assert.equal(cue.loop ?? false, false, `${expected.name} is a one-shot, not a loop`);
    assert.equal(typeof cue.prompt, 'string', `${expected.name} must be generatable as SFX`);
    assert.ok(cue.prompt.length >= 40, `${expected.name} prompt must be production-ready`);
    assert.match(cue.prompt, expected.intent, `${expected.name} prompt must preserve its event intent`);
    assert.equal('say' in cue, false, `${expected.name} must not cross into story dialogue`);
    assert.equal('voice' in cue, false, `${expected.name} must not cast a character voice`);
  }

  assert.ok(REUSED_CUES.every((name) => byName.has(name)), 'every approved reuse remains manifest-backed');
  assert.equal(expectedNames.some((name) => name.startsWith('combat.hitconfirm.')), false);
  assert.deepEqual(expectedNames.filter((name) => name.startsWith('weapon.shotgun.')), [
    'weapon.shotgun.fire',
    'weapon.shotgun.reload.out',
    'weapon.shotgun.reload.in',
    'weapon.shotgun.empty',
    'weapon.shotgun.mag.floor',
    'weapon.shotgun.cycle',
  ]);
});

test('every new combat production cue has a non-trivial indexed recording with its current hash', () => {
  for (const { name } of NEW_PRODUCTION_CUES) {
    const filename = `${name}.mp3`;
    const bytes = readFileSync(new URL(`../assets/sfx/${filename}`, import.meta.url));
    const version = createHash('md5').update(bytes).digest('hex').slice(0, 10);

    assert.ok(bytes.length > 512, `${filename} is missing or too small to be a delivered effect`);
    assert.ok(audioIndex.files.includes(filename), `${filename} is absent from the runtime index`);
    assert.equal(audioIndex.versions[filename], version, `${filename} has a stale runtime hash`);
  }
});
