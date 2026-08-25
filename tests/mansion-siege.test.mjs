import test from 'node:test';
import assert from 'node:assert/strict';

import { FACTIONS, FactionMatrix } from '../src/core/combat/factions.js';
import { CombatActor } from '../src/core/combat/actors.js';
import { MansionDamageState, DAMAGE_STATES, STATE_LAYERS } from '../src/mansion/siege/state.js';
import {
  WaveDirector, WAVES, ENCOUNTERS, STAGING, ROLES, totalAttackers, COMBAT_BOUNDARY, DEFENCE_POST,
  FRONT_DOOR_STAGING, frontDoorShare, waveById,
  ASSAULT_ROUTES, FLANK_RELEASE_STAGGER,
} from '../src/mansion/siege/waves.js';
import { anchorById } from '../src/mansion/siege/nav.js';
import {
  SiegeMission, BEATS, B, CHECKPOINT_FIELDS, CHECKPOINTS, HUNT_REMNANT, LULL_SECONDS,
} from '../src/mansion/siege/mission.js';
import {
  isSiegeLineWeapon, resolveArmoryTake,
} from '../src/mansion/siege/armory-policy.js';

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

test('every attacker walks in from a staging zone that has a way in', () => {
  for (const zone of Object.values(STAGING)) {
    assert.ok(typeof zone.entry === 'string' && zone.entry.length > 0,
      `${zone.id} names no nav anchor -- attackers would appear out of thin air`);
    assert.ok(anchorById(zone.entry),
      `${zone.id} names nav anchor "${zone.entry}", which does not exist`);
  }
});

test('the way in is beside the man, not across the property from him', () => {
  /* A staging zone and its entry anchor are two different things -- he stands
   * on the first and walks to the second -- but if they are twenty metres
   * apart the first leg of his route is a straight line nobody authored. */
  for (const zone of Object.values(STAGING)) {
    const anchor = anchorById(zone.entry);
    const leg = Math.hypot(anchor.x - zone.x, anchor.z - zone.z);
    assert.ok(leg < 6, `${zone.id} is ${leg.toFixed(1)}m from its own entry anchor`);
  }
});

test('the front door is the way in: four fifths of the siege comes through it', () => {
  /* OWNER DIRECTION, 2026-08-05: "everyone should funnel in through the main
   * door". The brief's standing counter-instruction is that twenty-two
   * identical riflemen through one doorway is not an encounter, so this is
   * both halves of it: overwhelmingly the front door, and not ONLY the front
   * door. Both bounds, because a future pass that quietly re-opens four more
   * flanks and a future pass that deletes the last one are the same mistake
   * in opposite directions. */
  const share = frontDoorShare();
  assert.equal(share.total, 22);
  assert.ok(share.share >= 0.8, `only ${share.front}/${share.total} come in the front`);
  assert.ok(share.share < 1, 'nobody ever breaks a window, which is a shooting gallery');

  /* And the ones who do not are ONE group, so the player looks away from the
   * stairs once rather than continuously. */
  const flankGroups = WAVES.flatMap((wave) => wave.groups)
    .filter((group) => group.staging.some((id) => !FRONT_DOOR_STAGING.has(id)));
  assert.equal(flankGroups.length, 1, `${flankGroups.map((g) => g.id).join('+')} come off the door`);
  assert.equal(flankGroups[0].flank, true, 'and the group says so on the tin');
  /* Late, not early: wave one is all door, so the shape is taught before it
   * is broken. */
  assert.equal(waveById('one').groups.some((g) => g.flank), false);
});

test('no outdoor staging zone is standing inside a building', () => {
  /* The fault this catches, found for real: `living_west` was staged at
   * x -18 on the strength of the living room's west windows, and the WEST
   * WING was later hung off that entire elevation. Those windows look into
   * the trophy hall now, so the "outdoor" zone was inside a room and the
   * attacker arrived through its roof. Bounds are the builders' own. */
  const BUILDING = { x0: -16, x1: 16, z0: 36, z1: 75 };
  const WEST_WING = { x0: -24.6, x1: -16, z0: 40.6, z1: 74.4 };
  const LOUNGE_BAY = { x0: 16, x1: 20.6, z0: 41, z1: 54 };
  const inside = (r, p) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;
  for (const zone of Object.values(STAGING)) {
    if (zone.indoor) continue;
    assert.ok(!inside(BUILDING, zone), `${zone.id} is inside the house`);
    assert.ok(!inside(WEST_WING, zone), `${zone.id} is inside the west wing`);
    /* The lounge bay is roofed and glazed on three sides -- a room, not a
     * terrace. Standing beside it is the point; standing IN it is arriving
     * through the glass you were about to break. */
    assert.ok(!inside(LOUNGE_BAY, zone), `${zone.id} is inside the lounge bay`);
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

test('every group is authored on a named route, and stages only on it', () => {
  /* The encounter-director seam: route choice is data in ASSAULT_ROUTES and
   * the plan, not constants scattered across the pool and the nav file. The
   * builder already throws on a group staged off its own route; this holds
   * the derived facts the rest of the suite leans on. */
  for (const wave of WAVES) {
    for (const group of wave.groups) {
      assert.ok(group.routes.length > 0, `${group.id} has no route`);
      for (const route of group.routes) {
        assert.ok(ASSAULT_ROUTES[route], `${group.id} names unknown route ${route}`);
      }
      const flankByRoute = group.routes.some((route) => ASSAULT_ROUTES[route].flank);
      assert.equal(group.flank, flankByRoute,
        `${group.id}'s flank flag disagrees with its routes`);
    }
  }
  /* The main route IS the front-door funnel: same zones, no drift between
   * the route table and the share the owner asked for. */
  assert.deepEqual([...ASSAULT_ROUTES.main.staging].sort(), [...FRONT_DOOR_STAGING].sort());
});

test('the flank releases into the main push, not after it dies down', () => {
  /* The service-door lesson, applied to the flank that survived: a long
   * route released on the frontal groups' 18 s clock arrives at a room the
   * frontal group already died in. The stagger is short ON PURPOSE -- the
   * wing walk is the delay -- and 2B must come before the final frontal
   * push, so the player is pressured from behind DURING the fight. */
  const two = waveById('two');
  assert.deepEqual(two.groups.map((g) => g.id), ['2A', '2B', '2C']);
  const flank = two.groups.find((g) => g.flank);
  assert.equal(flank.id, '2B');
  assert.equal(flank.after, FLANK_RELEASE_STAGGER);
  assert.ok(FLANK_RELEASE_STAGGER <= 8,
    `a ${FLANK_RELEASE_STAGGER} s stagger plus the wing walk lands after 2A is dead`);
  assert.ok(flank.after < two.groups.find((g) => g.id === '2C').after,
    'the flank must be moving before the final frontal group');

  /* And on the director itself: nobody shot, six seconds on the clock, and
   * the flank is in while all five of 2A are still standing. */
  const spawns = [];
  const wave = new WaveDirector({ wave: 'two', onSpawn: (o) => spawns.push(o) });
  wave.begin();
  assert.equal(spawns.length, 5);
  wave.update(FLANK_RELEASE_STAGGER);
  assert.equal(spawns.length, 9, 'the flank did not release on its stagger');
  assert.equal(spawns.at(-1).group, '2B');
  assert.equal(wave.standing.size, 9, 'all of 2A must still be standing at the flank release');
  /* 2C keeps its own clock, measured from the flank's release. */
  wave.update(19.9);
  assert.equal(spawns.length, 9, '2C released early');
  wave.update(0.2);
  assert.equal(spawns.length, 14);
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
    'supplies',
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

test('taking any one armory weapon advances to the office and saves the armed checkpoint', () => {
  for (const id of ['revolver', 'pistol9', 'carbine', 'ak47', 'saw', 'barrett']) {
    const { m } = mission();
    m.start();
    m.wokeUp();
    m.enteredArmory();

    assert.equal(m.weaponTaken(id), true, `${id} should be enough to leave the armory`);
    assert.equal(m.beat, B.TO_OFFICE);
    assert.equal(m.objective, "Reach Lou's office");
    assert.equal(m.checkpoint.id, 'armed');
    assert.equal(m.weaponTaken(id), false, 'the transition only happens once');
  }
});

test('a full inherited loadout falls back to an owned gun and still advances', () => {
  const decision = resolveArmoryTake({
    takenId: 'barrett',
    acquisition: { ok: false, reason: 'full' },
    loadout: {
      slots: ['revolver', 'pistol9', 'carbine', 'ak47', 'saw'],
      selected: 2,
    },
  });

  assert.deepEqual(decision, {
    advance: true,
    keepTaken: false,
    equipSlot: 2,
    weaponId: 'carbine',
    nudge: 'You are already carrying five guns. You are armed - get upstairs.',
  });
});

test('a refused acquisition never leaves the player armed with the objective unsatisfiable', () => {
  /* `Armory.take()` has ALREADY hidden the rack copy and put the gun in his
   * hands by the time this runs. A silent `advance: false` therefore left a
   * player standing in an empty armory, holding a gun, with "Arm yourself" on
   * the HUD and nothing left in the room to press. Every refusal below either
   * closes the beat on a gun he really holds or says out loud what to do. */
  const decision = resolveArmoryTake({
    takenId: 'carbine',
    acquisition: { ok: false, reason: 'unknown_weapon' },
    loadout: { slots: [null, null, null, null, null], selected: -1 },
  });

  assert.equal(decision.advance, true, 'the caller returns before it speaks on a false advance');
  assert.equal(decision.keepTaken, true, 'the gun is already in his hands');
  assert.equal(decision.weaponId, 'carbine');
  assert.ok(decision.nudge, 'a refusal the player cannot see is the bug');
  assert.equal(isSiegeLineWeapon(decision.weaponId), true,
    'the beat can only close on a gun the firing step would also accept');
});

test('a rack gun the line does not accept goes back and the player is told to take another', () => {
  const decision = resolveArmoryTake({
    takenId: 'prop_musket',
    acquisition: { ok: false, reason: 'unknown_weapon' },
    loadout: { slots: [null, null, null, null, null], selected: -1 },
  });

  assert.equal(decision.keepTaken, false, 'the rack copy must come back so the stand works again');
  assert.equal(decision.weaponId, null);
  assert.equal(decision.equipSlot, -1);
  assert.equal(decision.advance, true, 'advance is what carries the nudge to the HUD');
  assert.match(decision.nudge, /rack/i);
});

test('a refused acquisition falls back to a gun the player already owns', () => {
  const decision = resolveArmoryTake({
    takenId: 'prop_musket',
    acquisition: { ok: false, reason: 'unknown_weapon' },
    loadout: { slots: ['ak47', null, null, null, null], selected: 3 },
  });

  assert.equal(decision.advance, true);
  assert.equal(decision.keepTaken, false);
  assert.equal(decision.equipSlot, 0, 'an empty selected slot falls through to the first real gun');
  assert.equal(decision.weaponId, 'ak47');
  assert.ok(decision.nudge);
});

test('every armory refusal reaches the player and none of them dead-ends the beat', () => {
  for (const reason of ['unknown_weapon', 'full', 'locked', undefined]) {
    for (const takenId of ['saw', 'prop_musket']) {
      const decision = resolveArmoryTake({
        takenId,
        acquisition: { ok: false, reason },
        loadout: { slots: ['revolver', null, null, null, null], selected: 0 },
      });
      const label = `${reason} / ${takenId}`;
      assert.equal(decision.advance, true, label);
      assert.ok(decision.nudge, `${label} must not fail in silence`);
      assert.equal(isSiegeLineWeapon(decision.weaponId), true,
        `${label} must hand the beat a gun that satisfies it`);
      // And the beat really does close on it.
      const { m } = mission();
      m.start();
      m.wokeUp();
      m.enteredArmory();
      assert.equal(m.weaponTaken(decision.weaponId), true, label);
      assert.equal(m.beat, B.TO_OFFICE, label);
    }
  }
});

test('every armory catalog gun satisfies the firing-step weapon gate', () => {
  for (const id of ['revolver', 'pistol9', 'carbine', 'ak47', 'saw', 'barrett']) {
    assert.equal(isSiegeLineWeapon(id), true, `${id} should satisfy F`);
  }
  assert.equal(isSiegeLineWeapon(null), false, 'empty hands still refuse the line');
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
  assert.equal(m.weaponTaken('carbine'), true);
  assert.equal(m.objective, "Reach Lou's office");

  m.enteredOffice();
  assert.equal(m.beat, B.BRIEFING);
  m.briefingEnded();
  assert.equal(m.objective, 'Hold the house');
});

test('the essential office briefing owns the player-fire lock', () => {
  const { m } = mission();
  m.start();
  m.wokeUp();
  m.enteredArmory();
  m.weaponTaken('carbine');

  assert.equal(m.playerFireEnabled, true, 'the armed route remains playable');
  m.enteredOffice();
  assert.equal(m.beat, B.BRIEFING);
  assert.equal(m.playerFireEnabled, false, 'Lou must be allowed to finish the briefing');

  m.briefingEnded();
  assert.equal(m.beat, B.LITTLE_FRIEND);
  assert.equal(m.playerFireEnabled, true, 'the gun unlocks on the authored beat boundary');
});

test('the last few attackers hunt instead of hiding, and only the last few', () => {
  /* Owner, playtest 2026-08-13: "four attacks left cant find them". The
   * mission flips `huntActive` when the active wave has released everything
   * and its remnant is at most HUNT_REMNANT; the pool converts that flag
   * into men who drop their standoffs and walk at the player. */
  const { m } = mission();
  m.start(); m.wokeUp(); m.enteredArmory(); m.weaponTaken('carbine');
  m.enteredOffice(); m.briefingEnded(); m.sayHello();
  assert.equal(m.beat, B.WAVE_ONE);
  assert.equal(m.huntActive, false, 'a full first group is not a remnant');

  /* Kill 1A so 1B releases by attrition; nothing may hunt while a group is
   * still pending -- the "remnant" would be reinforced mid-hunt. */
  const firstGroup = [...m.waves.one.standing];
  for (const id of firstGroup) {
    m.noteDown(id);
    m.update(0.01);
    if (m.waves.one.pendingGroups.length === 0) break;
    assert.equal(m.huntActive, false,
      `hunt engaged at ${m.waves.one.standing.size} standing with a group still pending`);
  }
  assert.equal(m.waves.one.pendingGroups.length, 0, '1B never released');

  /* Now walk the released wave down to the remnant. */
  while (m.waves.one.standing.size > HUNT_REMNANT) {
    m.noteDown([...m.waves.one.standing][0]);
    m.update(0.01);
  }
  assert.equal(m.huntActive, true,
    `${m.waves.one.standing.size} standing, all groups released: the remnant must hunt`);

  /* And the flag drops with the wave, not before. */
  for (const id of [...m.waves.one.standing]) m.noteDown(id);
  m.update(0.01);
  assert.equal(m.beat, B.LULL);
  assert.equal(m.huntActive, false, 'no wave, no hunt');
});

test('the house is under attack from the first frame and stays that way', () => {
  const { m, damage } = mission();
  m.start();
  assert.equal(damage.state, 'under_attack');
  m.wokeUp(); m.enteredArmory(); m.weaponTaken('carbine');
  m.enteredOffice(); m.briefingEnded();
  assert.equal(damage.state, 'under_attack');
});

test('the line is said once, and a checkpoint restore does not hand it back', () => {
  const { m } = mission();
  m.start(); m.wokeUp(); m.enteredArmory();
  m.weaponTaken('carbine');
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
  m.weaponTaken('carbine');
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
  m.weaponTaken('carbine');
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
  m.weaponTaken('carbine');
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
  m.weaponTaken('carbine');
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
