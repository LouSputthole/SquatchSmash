import test from 'node:test';
import assert from 'node:assert/strict';

import { FACTIONS, FactionMatrix } from '../src/core/combat/factions.js';
import { CombatActor } from '../src/core/combat/actors.js';
import { MansionDamageState, DAMAGE_STATES, STATE_LAYERS } from '../src/mansion/siege/state.js';
import {
  WaveDirector, WAVES, ENCOUNTERS, STAGING, ROLES, totalAttackers, COMBAT_BOUNDARY, DEFENCE_POST,
} from '../src/mansion/siege/waves.js';
import {
  SiegeMission, BEATS, B, CHECKPOINT_FIELDS, CHECKPOINTS, LULL_SECONDS,
} from '../src/mansion/siege/mission.js';

/* ================================================================== */
/* The CARTEL faction                                                   */
/* ================================================================== */

test('the cartel and the crew are hostile, both ways', () => {
  const matrix = new FactionMatrix();
  const crew = { faction: FACTIONS.CREW };
  const cartel = { faction: FACTIONS.CARTEL };
  assert.equal(matrix.canTarget(crew, cartel), true);
  assert.equal(matrix.canTarget(cartel, crew), true);
  assert.equal(matrix.canDamage(cartel, crew), true);
});

test('adding the cartel did not disturb anybody already in the matrix', () => {
  const matrix = new FactionMatrix();
  const crew = { faction: FACTIONS.CREW };
  const police = { faction: FACTIONS.POLICE };
  const civilian = { faction: FACTIONS.CIVILIAN };
  const neutral = { faction: FACTIONS.NEUTRAL };
  assert.equal(matrix.canTarget(crew, police), true);
  assert.equal(matrix.canTarget(police, crew), true);
  assert.equal(matrix.canTarget(crew, crew), false);
  assert.equal(matrix.canTarget(crew, civilian), false);
  assert.equal(matrix.canDamage(crew, civilian, { playerShot: true }), true);
  assert.equal(matrix.canDamage(crew, civilian), false);
  assert.equal(matrix.canDamage(crew, neutral), false);
  /* No mission puts these two in a room, so the hostility is not declared. */
  assert.equal(matrix.canTarget(police, { faction: FACTIONS.CARTEL }), false);
});

test('Snow is not shootable by the men attacking the house', () => {
  /* The standing constraint: Snow never enters player-hostile targeting or
   * damage logic. He is crew, the attackers are cartel, and crew is only
   * damageable BY cartel -- but Snow additionally carries `core`, so a round
   * that reaches him cannot be the one that kills him. */
  const matrix = new FactionMatrix();
  const snow = new CombatActor({ id: 'snow', faction: FACTIONS.CREW, core: true });
  const attacker = { faction: FACTIONS.CARTEL };
  const result = snow.applyHit({ amount: 9999, attacker, matrix });
  assert.equal(result.protectedCore, true);
  assert.equal(snow.incapacitated, false);
  assert.equal(snow.health, 1);
  /* And the player, who is crew, cannot target him at all. */
  assert.equal(matrix.canTarget({ faction: FACTIONS.CREW }, snow), false);
  assert.equal(matrix.canDamage({ faction: FACTIONS.CREW }, snow, { playerShot: true }), false);
});

/* ================================================================== */
/* The damage-state overlay                                             */
/* ================================================================== */

const fakeObject = () => ({ visible: true });

function overlay() {
  const colliders = [{ id: 'base-wall' }];
  return { colliders, damage: new MansionDamageState({ colliders }) };
}

test('clean and repaired stand up exactly the same house', () => {
  assert.deepEqual(STATE_LAYERS.clean, []);
  assert.deepEqual(STATE_LAYERS.repaired, []);
  const { damage } = overlay();
  damage.group('wreck.car.1', { object: fakeObject(), layers: ['battle'] });
  damage.apply('under_attack');
  assert.deepEqual(damage.liveNames(), ['wreck.car.1']);
  damage.apply('repaired');
  assert.deepEqual(damage.liveNames(), []);
});

test('siege content is hidden in the walking tour and shown in the fight', () => {
  const { colliders, damage } = overlay();
  const wreck = fakeObject();
  const box = { id: 'wreck-collider' };
  damage.group('wreck.car.1', { object: wreck, colliders: [box], layers: ['battle'] });
  assert.equal(wreck.visible, false);
  assert.equal(colliders.includes(box), false, 'a hidden wreck must not be solid');

  damage.apply('under_attack');
  assert.equal(wreck.visible, true);
  assert.equal(colliders.includes(box), true);

  damage.apply('clean');
  assert.equal(wreck.visible, false);
  assert.equal(colliders.includes(box), false);
  assert.equal(colliders.length, 1, 'the base wall is still the only collider');
});

test('a broken window takes its collider with it', () => {
  const { colliders, damage } = overlay();
  const pane = fakeObject();
  const paneBox = { id: 'pane' };
  const shards = fakeObject();
  damage.suppress('glass.foyer.w2', { object: pane, collider: paneBox, layers: ['battle'] });
  damage.group('glass.foyer.w2.shards', { object: shards, layers: ['battle'] });

  assert.equal(pane.visible, true);
  assert.equal(colliders.includes(paneBox), true);
  assert.equal(shards.visible, false);

  damage.apply('under_attack');
  assert.equal(pane.visible, false);
  assert.equal(shards.visible, true);
  assert.equal(colliders.includes(paneBox), false,
    'an invisible pane you cannot walk through is the NO WAKE deck fault with a view');
});

test('the alarm stops before the smoke does', () => {
  const { damage } = overlay();
  damage.group('alarm.klaxon', { object: fakeObject(), layers: ['alarm'] });
  damage.group('fire.foyer', { object: fakeObject(), layers: ['battle'] });
  damage.apply('damaged');
  assert.deepEqual(damage.liveNames(), ['alarm.klaxon', 'fire.foyer']);
  damage.apply('post_battle');
  assert.deepEqual(damage.liveNames(), ['fire.foyer']);
});

test('re-applying a state changes nothing and re-adds no colliders', () => {
  const { colliders, damage } = overlay();
  damage.group('debris', { object: fakeObject(), colliders: [{ id: 'd' }], layers: ['battle'] });
  damage.apply('under_attack');
  const before = colliders.length;
  assert.deepEqual(damage.apply('under_attack'), []);
  assert.equal(colliders.length, before, 'a re-apply must not double-add a collider');
});

test('the overlay refuses states and layers it does not have', () => {
  const { damage } = overlay();
  assert.throws(() => damage.apply('on_fire'), /Unknown mansion damage state/);
  assert.throws(() => damage.group('x', { layers: ['smouldering'] }), /unknown layer/);
  assert.throws(() => damage.group('y', { layers: [] }), /at least one layer/);
  damage.group('z', { layers: ['battle'] });
  assert.throws(() => damage.group('z', { layers: ['battle'] }), /Duplicate/);
});

test('a checkpoint restores the house by name alone', () => {
  const { damage } = overlay();
  damage.group('wreck', { object: fakeObject(), layers: ['battle'] });
  damage.apply('under_attack');
  const shot = damage.snapshot();
  damage.apply('clean');
  assert.deepEqual(damage.liveNames(), []);
  damage.restore(shot);
  assert.deepEqual(damage.liveNames(), ['wreck']);
  assert.deepEqual(DAMAGE_STATES, [
    'clean', 'alert', 'under_attack', 'damaged', 'post_battle', 'repaired',
  ]);
});

/* ================================================================== */
/* Waves                                                                */
/* ================================================================== */

test('the encounter and wave counts are the ones the brief asked for', () => {
  assert.equal(ENCOUNTERS.corridor.members.length, 2);
  assert.equal(ENCOUNTERS.foyer.members.length, 3);
  const one = WAVES.find((w) => w.id === 'one');
  const two = WAVES.find((w) => w.id === 'two');
  assert.deepEqual(one.groups.map((g) => g.count), [4, 4]);
  assert.deepEqual(two.groups.map((g) => g.count), [5, 4, 5]);
  assert.deepEqual(totalAttackers(), { encounters: 5, waves: 22, total: 27 });
});

test('every staging zone and role a group names actually exists', () => {
  for (const wave of WAVES) {
    for (const group of wave.groups) {
      for (const id of group.staging) {
        assert.ok(STAGING[id], `${group.id} names missing staging ${id}`);
      }
      for (const id of group.roles) {
        assert.ok(ROLES[id], `${group.id} names missing role ${id}`);
      }
    }
  }
  for (const encounter of Object.values(ENCOUNTERS)) {
    for (const member of encounter.members) {
      assert.ok(STAGING[member.staging], `${member.id} names missing staging`);
      assert.ok(ROLES[member.role], `${member.id} names missing role`);
    }
  }
});

test('nobody in wave two is the same twenty-two riflemen', () => {
  const two = WAVES.find((w) => w.id === 'two');
  const roles = new Set(two.groups.flatMap((g) => g.roles));
  assert.ok(roles.size >= 5, `wave two only fields ${[...roles].join(', ')}`);
  const final = two.groups.find((g) => g.id === '2C');
  assert.ok(final.roles.includes('leader'));
  assert.ok(final.roles.includes('armored'));
  assert.ok(final.roles.includes('gunner'));
});

test('every attacker walks in from a staging zone that has an approach', () => {
  for (const zone of Object.values(STAGING)) {
    assert.ok(Array.isArray(zone.approach) && zone.approach.length > 0,
      `${zone.id} has no way in -- attackers would appear out of thin air`);
  }
});

test('the second group does not wait for the first to die', () => {
  const spawns = [];
  const wave = new WaveDirector({ wave: 'one', onSpawn: (o) => spawns.push(o) });
  wave.begin();
  assert.equal(spawns.length, 4);
  assert.equal(wave.cleared, false);
  /* Nobody killed, nobody even shot at: 22 seconds and 1B comes anyway. */
  wave.update(21);
  assert.equal(spawns.length, 4, 'released early');
  wave.update(1.5);
  assert.equal(spawns.length, 8);
  assert.equal(spawns.at(-1).trigger, 'clock');
});

test('a fast player pulls the second group forward instead of waiting', () => {
  const spawns = [];
  const wave = new WaveDirector({ wave: 'one', onSpawn: (o) => spawns.push(o) });
  const first = wave.begin();
  wave.update(2);
  for (const order of first.slice(0, 2)) wave.noteDown(order.id);
  assert.equal(wave.standing.size, 2);
  wave.update(0.1);
  assert.equal(spawns.length, 8, 'attrition should have released 1B');
  assert.equal(spawns.at(-1).trigger, 'attrition');
});

test('a wave is not cleared before it has finished arriving', () => {
  const wave = new WaveDirector({ wave: 'one' });
  const first = wave.begin();
  for (const order of first) wave.noteDown(order.id);
  assert.equal(wave.standing.size, 0);
  assert.equal(wave.cleared, false, '1B has not been released yet');
  wave.update(0.1);
  assert.equal(wave.standing.size, 4);
  for (const id of [...wave.standing]) wave.noteDown(id);
  assert.equal(wave.cleared, true);
});

test('a wave restores mid-fight without resurrecting anybody', () => {
  const wave = new WaveDirector({ wave: 'two' });
  const first = wave.begin();
  wave.noteDown(first[0].id);
  wave.noteDown(first[1].id);
  const shot = wave.snapshot();

  const restored = new WaveDirector({ wave: 'two' }).restore(shot);
  assert.equal(restored.standing.size, 3);
  assert.equal(restored.down.size, 2);
  assert.deepEqual(restored.released, ['2A']);
  assert.equal(restored.cleared, false);
  assert.throws(() => new WaveDirector({ wave: 'one' }).restore(shot), /mismatch/);
});

test('the defence post sits inside the combat boundary, above the foyer', () => {
  assert.ok(DEFENCE_POST.x0 >= COMBAT_BOUNDARY.x0 && DEFENCE_POST.x1 <= COMBAT_BOUNDARY.x1);
  assert.ok(DEFENCE_POST.z0 >= COMBAT_BOUNDARY.z0 && DEFENCE_POST.z1 <= COMBAT_BOUNDARY.z1);
  assert.equal(DEFENCE_POST.y, 6.0, 'the gallery floor is UPPER_Y');
});

/* ================================================================== */
/* The mission                                                          */
/* ================================================================== */

function mission({ onSpawn = null } = {}) {
  const colliders = [];
  const damage = new MansionDamageState({ colliders });
  const scene = {
    weapon: 'pistol',
    health: 100,
    ammunition: { mag: 12, reserve: 24 },
    enemiesDown: [],
    guardsDown: [],
    damageProps: {},
    brokenGlass: [],
    objectives: [],
    activeWave: null,
    friendlies: {},
    dialogue: null,
  };
  const m = new SiegeMission({ damage, onSpawn });
  for (const field of CHECKPOINT_FIELDS) {
    m.provide(field, {
      capture: () => JSON.parse(JSON.stringify(scene[field] ?? null)),
      restore: (value) => { scene[field] = value; },
    });
  }
  return { m, scene, damage, colliders };
}

test('every field the brief said a checkpoint must restore has a provider slot', () => {
  for (const field of [
    'weapon', 'health', 'ammunition', 'enemiesDown', 'guardsDown',
    'damageProps', 'brokenGlass', 'objectives', 'activeWave', 'friendlies', 'dialogue',
  ]) {
    assert.ok(CHECKPOINT_FIELDS.includes(field), `${field} is not saved`);
  }
});

test('a checkpoint refuses to save while a field has nobody reading it', () => {
  const damage = new MansionDamageState({ colliders: [] });
  const m = new SiegeMission({ damage });
  assert.deepEqual(m.missingProviders(), CHECKPOINT_FIELDS);
  assert.throws(() => m.start(), /cannot save without/);
});

test('the mission walks the brief\'s objective chain in order', () => {
  const { m } = mission();
  m.start();
  assert.equal(m.beat, B.WAKE);
  assert.equal(m.objective, null, 'no objective while he is still waking up');

  m.wokeUp();
  assert.equal(m.objective, 'Reach the armory');
  assert.equal(m.enteredOffice(), false, 'the office is not reachable yet');

  m.enteredArmory();
  assert.equal(m.objective, 'Arm yourself');
  assert.equal(m.armed({ primary: true }), false, 'the heavy is not optional');
  assert.equal(m.armed({ primary: true, heavy: true }), true);
  assert.equal(m.objective, "Reach Lou's office");

  m.enteredOffice();
  assert.equal(m.beat, B.BRIEFING);
  m.briefingEnded();
  assert.equal(m.objective, 'Hold the house');
});

test('the house is under attack from the first frame and stays that way', () => {
  const { m, damage } = mission();
  m.start();
  assert.equal(damage.state, 'under_attack');
  m.wokeUp(); m.enteredArmory(); m.armed({ primary: true, heavy: true });
  m.enteredOffice(); m.briefingEnded();
  assert.equal(damage.state, 'under_attack');
});

test('the line is said once, and a checkpoint restore does not hand it back', () => {
  const { m } = mission();
  m.start(); m.wokeUp(); m.enteredArmory();
  m.armed({ primary: true, heavy: true });
  m.enteredOffice(); m.briefingEnded();

  assert.equal(m.sayHello(), true);
  assert.equal(m.beat, B.WAVE_ONE);
  assert.equal(m.sayHello(), false);

  /* Wave one, then die, then restore at the lull checkpoint. */
  for (const id of [...m.waves.one.standing]) m.noteDown(id);
  m.update(0.1);
  for (const id of [...m.waves.one.standing]) m.noteDown(id);
  m.update(0.1);
  assert.equal(m.beat, B.LULL);
  assert.equal(m.checkpoint.id, 'wave_one');

  m.restoreCheckpoint();
  assert.equal(m.beat, B.LULL);
  assert.equal(m.sayHello(), false, 'the little friend does not get introduced twice');
});

test('the lull is a breath, not a tea ceremony', () => {
  const { m } = mission();
  m.start(); m.wokeUp(); m.enteredArmory();
  m.armed({ primary: true, heavy: true });
  m.enteredOffice(); m.briefingEnded(); m.sayHello();
  for (const id of [...m.waves.one.standing]) m.noteDown(id);
  m.update(0.1);
  for (const id of [...m.waves.one.standing]) m.noteDown(id);
  m.update(0.1);
  assert.equal(m.beat, B.LULL);
  assert.ok(LULL_SECONDS <= 12, 'a lull over twelve seconds is a coffee break');
  m.update(LULL_SECONDS + 0.1);
  assert.equal(m.beat, B.WAVE_TWO);
  assert.equal(m.waves.two.standing.size, 5, 'wave two opens with 2A');
});

test('restoring the wave-one checkpoint does not respawn wave one', () => {
  const spawned = [];
  const { m } = mission({ onSpawn: (o) => spawned.push(o.id) });
  m.start(); m.wokeUp(); m.enteredArmory();
  m.armed({ primary: true, heavy: true });
  m.enteredOffice(); m.briefingEnded(); m.sayHello();
  for (const id of [...m.waves.one.standing]) m.noteDown(id);
  m.update(0.1);
  for (const id of [...m.waves.one.standing]) m.noteDown(id);
  m.update(0.1);
  const afterWaveOne = spawned.length;
  assert.equal(afterWaveOne, 8);

  m.restoreCheckpoint();
  assert.equal(spawned.length, afterWaveOne, 'a cleared section repopulated');
  assert.equal(m.waves.one.cleared, true);
  assert.equal(m.waves.two.started, false);
});

test('a checkpoint carries the scene fields back with it', () => {
  const { m, scene } = mission();
  m.start(); m.wokeUp(); m.enteredArmory();
  scene.weapon = 'heavy';
  scene.health = 61;
  scene.brokenGlass = ['foyer.w2', 'lounge.bay.3'];
  m.armed({ primary: true, heavy: true });
  assert.equal(m.checkpoint.id, 'armed');

  scene.weapon = 'pistol';
  scene.health = 4;
  scene.brokenGlass = [];
  m.restoreCheckpoint();
  assert.equal(scene.weapon, 'heavy');
  assert.equal(scene.health, 61);
  assert.deepEqual(scene.brokenGlass, ['foyer.w2', 'lounge.bay.3']);
  assert.equal(m.beat, CHECKPOINTS.armed.beat);
});

test('the siege ends by handing the player to Captain Sasole', () => {
  const { m, damage } = mission();
  m.start(); m.wokeUp(); m.enteredArmory();
  m.armed({ primary: true, heavy: true });
  m.enteredOffice(); m.briefingEnded(); m.sayHello();
  for (const wave of ['one', 'two']) {
    while (!m.waves[wave].cleared) {
      for (const id of [...m.waves[wave].standing]) m.noteDown(id);
      m.update(LULL_SECONDS + 1);
    }
    m.update(LULL_SECONDS + 1);
  }
  assert.equal(m.beat, B.AFTERMATH);
  assert.equal(damage.state, 'damaged', 'the fires are still going');
  m.aftermathEnded();
  assert.equal(m.objective, 'Meet Captain Sasole');
  assert.equal(damage.state, 'post_battle');
  m.metSasole();
  assert.equal(m.complete, true);
});

test('every beat names a damage state the overlay actually has', () => {
  for (const [name, beat] of Object.entries(BEATS)) {
    assert.ok(DAMAGE_STATES.includes(beat.state), `${name} wants state ${beat.state}`);
  }
});
