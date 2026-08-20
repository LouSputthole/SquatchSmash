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
  {
    name: 'combat.pain.grunt.a', duration: 0.7,
    intent: /grunt|involuntary vocal/i,
  },
  {
    name: 'combat.pain.grunt.b', duration: 0.75,
    intent: /grunt|involuntary vocal/i,
  },
  {
    name: 'combat.pain.cry', duration: 1.1,
    intent: /cry|wounded/i,
  },
  {
    name: 'combat.pain.death', duration: 1.5,
    intent: /fatal|dying|death/i,
  },
  {
    name: 'combat.player.pain', duration: 0.9,
    intent: /first.?person|player/i,
  },
]);

/*
 * The pain bank, added 2026-08-19 because a landed round made every physical
 * noise a body makes and no sound the MAN makes, which is why hits registered
 * and still read as nothing.
 *
 * These are queued, not delivered: unlike NEW_PRODUCTION_CUES they are held to
 * the manifest brief but NOT to the recording-hash pin below, because the
 * takes do not exist yet. They must stay discoverable by the booth sheet
 * (`npm run record:sheet`) until they do. Move a name up into
 * NEW_PRODUCTION_CUES when its mp3 lands.
 *
 * They are prompt-based effect cues rather than cast `say`/`voice` dialogue on
 * purpose -- see the manifest comment on `combat.pain.grunt.a`.
 */
const VOCAL_PRODUCTION_CUES = Object.freeze([
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
  ...VOCAL_PRODUCTION_CUES.map(({ name }) => name),
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
  /* The vocal layer is time- and chance-gated, so this contract drives both:
   * `clock` advances a full second between hits (clear of the per-man pain
   * throttle) and `random` always rolls into the player's vocal chance, which
   * leaves the player's hard cooldown as the only thing that can silence him. */
  let clock = 0;
  const audio = new CombatAudio({ audio: engine, now: () => clock, random: () => 0 });
  const position = { x: 2, y: 1.4, z: -3 };
  const hit = (event) => {
    clock += 1;
    return audio.impact(event);
  };

  hit({
    target: 'enemy', zone: 'body', caliber: 'rifle', position,
    result: { applied: true, absorbed: 0, armorBroken: false, fatal: false },
  });
  hit({
    target: 'enemy', zone: 'head', caliber: 'rifle', position,
    result: { applied: true, absorbed: 0, armorBroken: false, fatal: true },
  });
  hit({
    target: 'enemy', zone: 'body', caliber: 'rifle', position,
    result: { applied: true, absorbed: 8, armorBroken: false, fatal: false },
  });
  hit({
    target: 'enemy', zone: 'body', caliber: 'heavy', position,
    result: { applied: true, absorbed: 24, armorBroken: true, fatal: false },
  });
  hit({
    target: 'player', zone: 'body', caliber: 'rifle', position,
    result: { applied: true, absorbed: 0, armorBroken: false, fatal: false },
  });
  hit({
    target: 'player', zone: 'body', caliber: 'rifle', position,
    result: { applied: true, absorbed: 6, armorBroken: false, fatal: false },
  });

  /* Every applied hit now carries the man's reaction as well as the physical
   * event: the physical layer alone is what made a landed round read as
   * nothing. The last player hit is silent because his voice is still inside
   * its cooldown, one second after the previous one. */
  assert.deepEqual(cueNames(engine), [
    'combat.bullet.impact.flesh',
    'combat.pain.grunt.a',
    'combat.bullet.impact.head',
    'combat.pain.death',
    'combat.bullet.impact.armor',
    'combat.pain.grunt.b',
    'combat.bullet.impact.armor.heavy',
    'combat.armor.break',
    'combat.armor.plate.drop',
    'combat.pain.grunt.a',
    'combat.player.hit.flesh',
    'combat.player.pain',
    'heist.player.hit',
  ]);
  assert.ok(engine.calls.every(({ options }) => options.position === position));
  assert.ok(cueNames(engine).every((name) => !name.startsWith('combat.hitconfirm.')));
});

test('CombatAudio gives a hostile one positional voice per burst, sorted by severity', () => {
  const CombatAudio = requireClass('CombatAudio');
  const engine = audioSpy();
  let clock = 0;
  const audio = new CombatAudio({ audio: engine, now: () => clock });
  const guard = { x: 8, y: 1.3, z: 2 };

  assert.equal(audio.pain({ id: 'guard-a', position: guard, result: { damage: 9 } }),
    'combat.pain.grunt.a');
  /* Seven more pellets from the same shell, same frame: still one man. */
  for (let i = 0; i < 7; i++) {
    assert.equal(audio.pain({ id: 'guard-a', position: guard, result: { damage: 9 } }), null,
      'one shotgun blast became a choir out of one body');
  }
  /* A different man in the same instant still answers for himself. */
  assert.equal(
    audio.pain({ id: 'guard-b', position: { x: -8, y: 1.3, z: 2 }, result: { damage: 9 } }),
    'combat.pain.grunt.b',
  );
  /* The scene root re-presenting THAT hit must not double it: no id, but the
   * same body-sized cell. */
  assert.equal(audio.pain({ position: { x: -8.1, y: 1.35, z: 2.1 }, result: { damage: 9 } }), null);

  clock += 1;
  assert.equal(audio.pain({ id: 'guard-a', position: guard, zone: 'head', result: { damage: 9 } }),
    'combat.pain.cry', 'a head hit is heavy however small the number is');
  clock += 1;
  assert.equal(audio.pain({ id: 'guard-a', position: guard, result: { damage: 40 } }),
    'combat.pain.cry');
  clock += 1;
  assert.equal(audio.pain({ id: 'guard-a', position: guard, result: { damage: 9, fatal: true } }),
    'combat.pain.death');
  assert.equal(audio.pain({ id: 'guard-a', position: guard, result: { applied: false } }), null);

  assert.ok(engine.calls.every(({ options }) => options.position),
    'pain must come out of the body, not out of the HUD');
  assert.equal(engine.calls.length, 5);

  audio.reset();
  assert.equal(audio.pain({ id: 'guard-a', position: guard, result: { damage: 9 } }),
    'combat.pain.grunt.a', 'a checkpoint restore carried a dead man\'s throttle into the retry');
});

test('the player vocal is rationed: a cooldown and a roll, not a percussion instrument', () => {
  const CombatAudio = requireClass('CombatAudio');
  const engine = audioSpy();
  let clock = 100;
  /* random() === 0 always clears the chance gate, so this isolates the
   * cooldown: nothing but time may let him speak twice. */
  const audio = new CombatAudio({ audio: engine, now: () => clock, random: () => 0 });
  const at = { x: 0, y: 1.6, z: 0 };
  const shot = () => audio.impact({
    target: 'player', zone: 'chest', caliber: 'rifle', position: at,
    result: { applied: true, absorbed: 0, armorBroken: false, fatal: false },
  });

  assert.ok(shot().includes('combat.player.pain'));
  /* A full magazine into the vest over the next three and a half seconds. */
  for (let i = 0; i < 30; i++) {
    clock += 0.1;
    assert.equal(shot().includes('combat.player.pain'), false,
      `the player spoke again ${(clock - 100).toFixed(1)}s after his last vocal`);
  }
  assert.equal(
    engine.calls.filter(({ cue }) => cue === 'combat.player.pain').length,
    1,
    '31 rounds produced more than one player vocal',
  );

  clock += 2;
  assert.ok(shot().includes('combat.player.pain'), 'the cooldown never released');

  /* And the roll: with the cooldown clear, most eligible hits still say
   * nothing, so the vocal is not a metronome either. */
  const rolled = new CombatAudio({ audio: audioSpy(), now: () => clock, random: () => 0.99 });
  clock += 100;
  assert.equal(rolled.playerVocal({ position: at }), null);
  clock += 100;
  assert.equal(rolled.playerVocal({ position: at }), null);
  /* A killing hit skips the dice -- but never the cooldown. */
  assert.equal(rolled.playerVocal({ position: at, fatal: true }), 'combat.player.pain');
  assert.equal(rolled.playerVocal({ position: at, fatal: true }), null);
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
  const expectedNames = [...NEW_PRODUCTION_CUES, ...VOCAL_PRODUCTION_CUES].map(({ name }) => name);
  assert.deepEqual(queued, expectedNames, 'no missing cues, unapproved voices or duplicate semantics');

  const byName = new Map(manifest.sfx.map((cue) => [cue.name, cue]));
  for (const expected of [...NEW_PRODUCTION_CUES, ...VOCAL_PRODUCTION_CUES]) {
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

test('the queued pain cues stay visible to the booth sheet until they are recorded', () => {
  /* The point of the pain bank is that it is UN-recorded work that must not
   * go quiet. `npm run record:sheet` lists a cue as an effect row exactly when
   * it has a prompt and no delivered file, so that is what is pinned here. */
  for (const { name } of VOCAL_PRODUCTION_CUES) {
    const cue = manifest.sfx.find((entry) => entry.name === name);
    assert.ok(cue, `${name} must remain a manifest cue`);
    assert.equal(typeof cue.prompt, 'string', `${name} must carry a generatable brief`);
    assert.equal(cue.file ?? null, null, `${name} must resolve to ${name}.mp3, not an alias`);
    if (audioIndex.files.includes(`${name}.mp3`)) {
      assert.fail(`${name} now has a recording — move it into NEW_PRODUCTION_CUES `
        + 'so the hash pin below covers it');
    }
  }
});

test('every new combat production cue has a non-trivial indexed recording with its current hash', () => {
  /* Delivered queue only. VOCAL_PRODUCTION_CUES is deliberately excluded: it
   * is briefed, discoverable and not yet cut, and the test above owns it. */
  for (const { name } of NEW_PRODUCTION_CUES) {
    const filename = `${name}.mp3`;
    const bytes = readFileSync(new URL(`../assets/sfx/${filename}`, import.meta.url));
    const version = createHash('md5').update(bytes).digest('hex').slice(0, 10);

    assert.ok(bytes.length > 512, `${filename} is missing or too small to be a delivered effect`);
    assert.ok(audioIndex.files.includes(filename), `${filename} is absent from the runtime index`);
    assert.equal(audioIndex.versions[filename], version, `${filename} has a stale runtime hash`);
  }
});
