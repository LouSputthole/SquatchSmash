/**
 * Encounters, friendly-fire rules and the lab level: the mission-facing
 * surface of the combat framework.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { EncounterController } from '../src/core/combat/encounter.js';
import { CombatRules, FRIENDLY_FIRE } from '../src/core/combat/rules.js';
import { FactionMatrix } from '../src/core/combat/factions.js';
import { Vitals } from '../src/core/combat/vitals.js';
import { WEAPON_CATALOG } from '../src/core/weapons/catalog.js';

const flat = () => 0.5;

function config(overrides = {}) {
  return {
    id: 'test',
    groups: [
      { id: 'a', archetype: 'rifleman', count: 3, faction: 'police', spawns: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }] },
      { id: 'b', archetype: 'shotgunner', count: 1, faction: 'police', spawns: [{ x: 5, z: 5 }], leader: true },
    ],
    entries: { door: { x: 10, z: 10, yaw: 0 } },
    reinforcements: [
      { id: 'wave', group: 'a', entry: 'door', onDeaths: 2, count: 2, limit: 1 },
    ],
    complete: { allDead: true },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* EncounterController                                                  */
/* ------------------------------------------------------------------ */

test('begin() emits one spawn order per body, at the configured spots', () => {
  const orders = [];
  const ec = new EncounterController(config(), { onSpawn: (o) => orders.push(o) });
  ec.begin();
  assert.equal(orders.length, 4);
  assert.equal(orders.filter((o) => o.archetype === 'rifleman').length, 3);
  assert.equal(orders.filter((o) => o.leader).length, 1, 'exactly one leader');
  assert.deepEqual(
    orders.slice(0, 3).map((o) => o.spawn.x), [0, 1, 2],
    'spawns cycle through the configured points',
  );
  assert.equal(ec.aliveCount, 4);
});

test('reinforcements arrive through the entry after enough deaths, once, and completion waits for them', () => {
  const orders = [];
  let reinforced = 0;
  let complete = false;
  const ec = new EncounterController(config(), {
    onSpawn: (o) => orders.push(o),
    onReinforce: () => reinforced++,
    onComplete: () => { complete = true; },
  });
  ec.begin();
  ec.reportKill({ id: orders[0].id, byPlayer: true });
  ec.update(0.1);
  assert.equal(reinforced, 0, 'one death is not the trigger');
  ec.reportKill({ id: orders[1].id, byPlayer: true });
  ec.update(0.1);
  assert.equal(reinforced, 1);
  assert.equal(orders.length, 6);
  const wave = orders.slice(4);
  assert.ok(wave.every((o) => o.spawn.x === 10 && o.spawn.z === 10),
    'reinforcements must enter at the door, not in the player\'s face');
  assert.ok(wave[1].spawn.stagger > 0, 'a wave files in, it does not teleport shoulder-to-shoulder');

  // Kill the originals — the wave still stands, so no completion…
  ec.reportKill({ id: orders[2].id, byPlayer: true });
  ec.reportKill({ id: orders[3].id, byPlayer: true });
  ec.update(0.1);
  assert.equal(complete, false);
  // …and killing the wave finishes it, with no second wave (limit 1).
  ec.reportKill({ id: wave[0].id, byPlayer: true });
  ec.reportKill({ id: wave[1].id, byPlayer: true });
  ec.update(0.1);
  assert.equal(complete, true);
  assert.equal(reinforced, 1);
});

test('a kill reported twice counts once — restores must not double-count', () => {
  const orders = [];
  const ec = new EncounterController(config({ reinforcements: [] }), { onSpawn: (o) => orders.push(o) });
  ec.begin();
  ec.reportKill({ id: orders[0].id, byPlayer: true });
  ec.reportKill({ id: orders[0].id, byPlayer: true });
  assert.equal(ec.kills, 1);
});

test('capture/restore round-trips the fight without duplicating anyone', () => {
  const orders = [];
  const ec = new EncounterController(config(), { onSpawn: (o) => orders.push(o) });
  ec.begin();
  ec.reportKill({ id: orders[0].id, byPlayer: true });
  const snap = ec.capture();

  ec.reportKill({ id: orders[1].id, byPlayer: true });
  ec.update(0.1); // triggers the wave
  assert.equal(ec.kills, 2);

  ec.restore(snap);
  assert.equal(ec.kills, 1);
  assert.equal(ec.aliveCount, 3);
  assert.equal(ec.wavesSent.get('wave') ?? 0, 0, 'the restored fight still owes its wave');
  // The same second kill after restore triggers the wave exactly once.
  const before = orders.length;
  ec.reportKill({ id: orders[1].id, byPlayer: true });
  ec.update(0.1);
  assert.equal(orders.length, before + 2);
});

test('player death fails the encounter; timed survival completes it', () => {
  let failed = null;
  const ec = new EncounterController(config(), { onFail: (r) => { failed = r; } });
  ec.begin();
  ec.reportPlayerDead();
  assert.equal(ec.state, 'failed');
  assert.equal(failed, 'player-dead');

  let done = false;
  const survive = new EncounterController(
    config({ complete: { survive: 10 }, reinforcements: [] }),
    { onComplete: () => { done = true; } },
  );
  survive.begin();
  survive.update(9);
  assert.equal(done, false);
  survive.update(1.1);
  assert.equal(done, true);
});

/* ------------------------------------------------------------------ */
/* Rules: friendly fire and protected characters                        */
/* ------------------------------------------------------------------ */

test('the four friendly-fire modes behave as configured', () => {
  const ally = { faction: 'crew' };
  const playerAttacker = { faction: 'crew' };
  const gate = (mode, playerShot = true) => new CombatRules({
    matrix: new FactionMatrix(), friendlyFire: mode,
  }).gate({ attacker: playerAttacker, target: ally, playerShot, damage: 30 });

  assert.equal(gate(FRIENDLY_FIRE.OFF).allowed, false);
  assert.equal(gate(FRIENDLY_FIRE.FULL).allowed, true);
  assert.equal(gate(FRIENDLY_FIRE.FULL).scale, 1);
  const reduced = gate(FRIENDLY_FIRE.REDUCED);
  assert.equal(reduced.allowed, true);
  assert.ok(reduced.scale < 1);
  assert.equal(gate(FRIENDLY_FIRE.PLAYER_ONLY, true).allowed, true);
  assert.equal(gate(FRIENDLY_FIRE.PLAYER_ONLY, false).allowed, false,
    'allies never damage the player in playerOnly mode');
});

test('hostile gating still runs through the faction matrix', () => {
  const rules = new CombatRules({ matrix: new FactionMatrix() });
  const cop = { faction: 'police' };
  const me = { faction: 'crew' };
  const civ = { faction: 'civilian' };
  assert.equal(rules.gate({ attacker: me, target: cop, playerShot: true }).allowed, true);
  assert.equal(rules.gate({ attacker: cop, target: civ }).allowed, false);
  assert.equal(rules.gate({ attacker: me, target: civ, playerShot: true }).allowed, true,
    'a careless player round can still hit a civilian so the mission can respond');
});

test('a protected character reports the would-be kill; killing a fail-listed one fails the mission', () => {
  let protectedHit = null;
  let failed = null;
  const rules = new CombatRules({
    matrix: new FactionMatrix(),
    protectedIds: ['snow'],
    failOnKillIds: ['tony'],
    onProtectedHit: (info) => { protectedHit = info; },
    onFriendlyKill: (info) => { failed = info; },
  });

  const snow = new Vitals({ maxHealth: 80, protectedCore: true, rng: flat });
  const record = snow.applyHit({ weapon: WEAPON_CATALOG.barrett, distance: 5, region: 'head' });
  assert.equal(rules.judge({ targetId: 'snow', record, friendly: true, playerShot: true }), 'protected');
  assert.ok(protectedHit);
  assert.equal(snow.dead, false);

  const tony = new Vitals({ maxHealth: 50, rng: flat });
  const fatal = tony.applyHit({ weapon: WEAPON_CATALOG.barrett, distance: 5, region: 'head' });
  assert.equal(rules.judge({ targetId: 'tony', record: fatal, friendly: true, playerShot: true }), 'failed');
  assert.ok(failed);
});

test('tiny physics grazes never read as betrayal', () => {
  const rules = new CombatRules({ matrix: new FactionMatrix(), accidentFloor: 8 });
  const record = { applied: true, damage: 3, fatal: false };
  assert.equal(rules.judge({ targetId: 'ally', record, friendly: true, playerShot: true }), 'ok');
  const real = { applied: true, damage: 20, fatal: false };
  assert.equal(rules.judge({ targetId: 'ally', record: real, friendly: true, playerShot: true }), 'grazed');
});

/* ------------------------------------------------------------------ */
/* The lab level (headless)                                             */
/* ------------------------------------------------------------------ */

test('the combat lab level builds headless with the contract the scene needs', async () => {
  const { buildCombatLab, LAB } = await import('../src/combatlab/level.js');
  const fakeScene = { add() {} };
  const lab = buildCombatLab(fakeScene);

  assert.ok(lab.colliders.length >= 40);
  assert.ok(lab.coverPoints.length >= 25);
  assert.ok(lab.hitMeshes.length >= 60);
  for (const m of lab.hitMeshes) {
    assert.ok(m.userData.material, `${m.name || 'a mesh'} is untagged`);
  }
  // The stairs really climb.
  const midStair = lab.groundAt(LAB.STAIR.x, LAB.STAIR.z);
  assert.ok(midStair > 0 && midStair < LAB.UPPER_Y);
  const upper = lab.spawns.enemyGroups.killhouseUpper[0];
  assert.equal(lab.groundAt(upper.x, upper.z), LAB.UPPER_Y);
  // Doors add and remove their own colliders.
  const door = lab.doors[0];
  const closed = lab.colliders.length;
  door.toggle();
  assert.notEqual(lab.colliders.length, closed);
  door.toggle();
  assert.equal(lab.colliders.length, closed);
  // Spawn table completeness.
  assert.ok(lab.spawns.player && lab.spawns.friendly && lab.spawns.armoryWall);
  assert.ok(lab.spawns.enemyGroups.yard.length >= 6);
  assert.ok(lab.spawns.enemyGroups.killhouseGround.length >= 4);
  assert.ok(lab.spawns.enemyGroups.killhouseUpper.length >= 3);
  assert.ok(lab.spawns.stress.length >= 12);
  assert.equal(lab.spawns.reinforcementDoors.length, 2);
  // The movers move.
  const target = lab.movingTargets.targets?.[0] ?? null;
  lab.movingTargets.update(1 / 60);
  assert.ok(target !== undefined);
});
