import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import { CombatActor } from '../src/core/combat/actors.js';
import { FACTIONS, FactionMatrix } from '../src/core/combat/factions.js';
import { Firearm } from '../src/core/weapons/Firearm.js';
import { WEAPON_CATALOG, WEAPON_IDS } from '../src/core/weapons/catalog.js';
import {
  HEIST_WEAPON_BINDINGS, HeistCombatAdapter, HeistFirearm,
} from '../src/heist/combat.js';
import { HEIST_WEAPON_DEFS, HeistLoadout } from '../src/heist/loadout.js';

const MAIN_SOURCE = await readFile(new URL('../src/heist/main.js', import.meta.url), 'utf8');
const LOADOUT_SOURCE = await readFile(new URL('../src/heist/loadout.js', import.meta.url), 'utf8');

const combatActorOf = (object, { root }) => root.userData.combatActor;

/**
 * A minimal bank: a wall of real geometry between the gun and the person, a
 * hostage figure whose root carries a `combatActor`, and an officer with a
 * modelled weapon. The Adapter must treat this exactly as it treats the real
 * phase group — it only ever sees Object3D roots.
 */
function buildRange() {
  const world = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 0.3));
  wall.name = 'range-wall';
  wall.position.set(0, 1.5, 0);
  world.add(wall);

  const hostageRoot = new THREE.Group();
  hostageRoot.name = 'hostage-probe';
  hostageRoot.position.set(0, 0, -6);
  hostageRoot.userData.hostageId = 'hostage_probe';
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.35));
  body.position.y = 0.85;
  hostageRoot.add(body);
  world.add(hostageRoot);
  const hostageActor = new CombatActor({
    id: 'hostage_probe', faction: FACTIONS.CIVILIAN, maxHealth: 34, armor: 0,
  });
  hostageRoot.userData.combatActor = hostageActor;

  world.updateMatrixWorld(true);
  return { world, wall, hostageRoot, hostageActor };
}

function buildOfficer(world, { z = 8 } = {}) {
  const root = new THREE.Group();
  root.name = 'officer-probe';
  root.position.set(0, 0, z);
  const arm = new THREE.Group();
  arm.position.set(0.2, 1.3, 0);
  root.add(arm);
  const gun = new THREE.Group();
  gun.position.set(0, 0, -0.1);
  gun.rotation.x = -Math.PI / 2;
  gun.userData.muzzle = new THREE.Vector3(0, 0, -0.12);
  arm.add(gun);
  world.add(root);
  world.updateMatrixWorld(true);
  const actor = new CombatActor({
    id: 'officer_probe', faction: FACTIONS.POLICE, maxHealth: 80, armor: 12,
  });
  root.userData.combatActor = actor;
  /* The production wiring: heist figures hang the modelled gun on
   * `root.userData.weapon`, and the Adapter must find it there — an entry
   * that forgot to pass `weaponModel` must still have a real bore. */
  root.userData.weapon = gun;
  return { root, actor };
}

test('the loadout weapons ARE the shared catalog: same numbers, canonical Firearm state', () => {
  assert.equal(HEIST_WEAPON_BINDINGS.carbine.weaponId, WEAPON_IDS.CARBINE);
  assert.equal(HEIST_WEAPON_BINDINGS.sidearm.weaponId, WEAPON_IDS.PISTOL9);

  const loadout = new HeistLoadout();
  for (const [slot, binding] of Object.entries(HEIST_WEAPON_BINDINGS)) {
    const weapon = loadout.weapons[slot];
    const catalog = WEAPON_CATALOG[binding.weaponId];
    assert.ok(weapon instanceof HeistFirearm, `${slot} is not the compatibility adapter`);
    assert.ok(weapon.firearm instanceof Firearm, `${slot} does not hold a canonical Firearm`);
    assert.equal(weapon.definition.damage, catalog.damage);
    assert.equal(weapon.definition.penetration, catalog.penetration);
    assert.equal(weapon.definition.magazineSize, catalog.capacity);
    assert.equal(weapon.magazine, catalog.capacity);
    assert.equal(weapon.reserveRounds, catalog.reserve);
    assert.equal(HEIST_WEAPON_DEFS[slot].damage, catalog.damage);
    const round = weapon.fire();
    assert.equal(round.fired, true);
    assert.equal(round.damage, catalog.damage, `${slot} fired non-catalog damage`);
    assert.equal(round.penetration, catalog.penetration);
    assert.equal(weapon.magazine, catalog.capacity - 1);
  }
});

test('HeistFirearm keeps the old surface: reload, cooldown, dry click and durable restore', () => {
  const gun = new HeistFirearm('sidearm');
  assert.equal(gun.fire().fired, true);
  assert.equal(gun.fire().reason, 'cooldown', 'the catalog cooldown did not apply');
  gun.update(0.25);
  assert.equal(gun.fire().fired, true);
  assert.equal(gun.beginReload(), true);
  assert.equal(gun.reloading, true);
  // Two-phase reload: eject, then seat. Events come off the shared Firearm.
  const events = [];
  for (let i = 0; i < 12; i++) events.push(...gun.update(0.25));
  assert.deepEqual(events.map((event) => event.type), ['eject', 'loaded']);
  assert.equal(gun.magazine, gun.definition.magazineSize);

  // Durable ammunition round-trips through the checkpoint seam.
  const worn = new HeistFirearm('carbine');
  worn.fire();
  worn.update(0.25);
  worn.fire();
  const snapshot = JSON.parse(JSON.stringify(worn.snapshot()));
  const restored = new HeistFirearm('carbine');
  restored.restore(snapshot);
  assert.equal(restored.magazine, worn.magazine);
  assert.equal(restored.reserveRounds, worn.reserveRounds);
  // And a legacy WeaponController-shaped snapshot still lands on its feet.
  const legacy = new HeistFirearm('carbine');
  legacy.restore({ magazine: 5, reserveMagazines: 2 });
  assert.equal(legacy.magazine, 5);
  assert.equal(legacy.reserveRounds, 2 * legacy.definition.magazineSize);
});

test('a player round cannot reach a hostage through a wall, and lands honestly without one', () => {
  const { world, wall, hostageRoot, hostageActor } = buildRange();
  const combat = new HeistCombatAdapter({ matrix: new FactionMatrix() });
  combat.register(hostageRoot, { actor: combatActorOf });
  combat.setOccluders([world]);

  const origin = new THREE.Vector3(0, 1.2, 6);
  const chest = new THREE.Vector3(0, 1.0, -6);
  const aim = chest.clone().sub(origin).normalize();

  const blocked = combat.resolvePlayerShot({
    origin, direction: aim, weapon: 'carbine', damage: 42, penetration: 0.38,
  });
  assert.equal(blocked.hit.object, wall, 'the wall did not own the round');
  assert.equal(blocked.located.reason, 'unregistered');
  assert.equal(blocked.located.applied, false);
  assert.equal(hostageActor.health, 34, 'a hostage took damage THROUGH A WALL');

  // Same shot with the cover gone: the round arrives, at catalog damage.
  wall.position.x = 50;
  world.updateMatrixWorld(true);
  const open = combat.resolvePlayerShot({
    origin, direction: aim, weapon: 'carbine', damage: 42, penetration: 0.38,
  });
  assert.equal(open.located.applied, true);
  assert.equal(open.located.actor, hostageActor);
  assert.equal(open.located.result.raw, WEAPON_CATALOG.carbine.damage);
  assert.equal(open.located.fatal, true);
  assert.equal(hostageActor.health, 0);
  assert.ok(open.hit.point.distanceTo(chest) < 0.6,
    'the recorded impact is not the real intersection');
});

test('armor and wounds obey the one shared CombatActor rule the other scenes use', () => {
  const { world, wall, hostageRoot } = buildRange();
  wall.position.x = 50;
  hostageRoot.position.x = 40; // out of this exchange
  const officer = buildOfficer(world, { z: -8 });
  world.updateMatrixWorld(true);
  const officerBody = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4));
  officerBody.position.y = 0.9;
  officer.root.add(officerBody);
  world.updateMatrixWorld(true);

  const combat = new HeistCombatAdapter({ matrix: new FactionMatrix() });
  combat.register(officer.root, { actor: combatActorOf });
  combat.setOccluders([world]);

  const origin = new THREE.Vector3(0, 1.2, 0);
  const aim = new THREE.Vector3(0, 1.1, -8).sub(origin).normalize();
  const shot = combat.resolvePlayerShot({
    origin, direction: aim, weapon: 'carbine', damage: 42, penetration: 0.38,
  });
  assert.equal(shot.located.applied, true);

  // The identical hit against a reference actor must produce identical truth.
  const reference = new CombatActor({
    id: 'reference', faction: FACTIONS.POLICE, maxHealth: 80, armor: 12,
  });
  const expected = reference.applyHit({
    amount: 42, attacker: { faction: FACTIONS.CREW }, playerShot: true,
  });
  const got = shot.located.result;
  assert.equal(got.absorbed, expected.absorbed);
  assert.equal(got.damage, expected.damage);
  assert.equal(got.armorBroken, expected.armorBroken);
  assert.equal(got.healthAfter, expected.healthAfter);
  // The concrete shared rule: armor absorbs at most 55 percent of the raw hit.
  assert.equal(got.absorbed, Math.min(12, 42 * 0.55));
});

test('hostile fire is denied by real cover and lands truthfully without it', () => {
  const { world, wall, hostageRoot } = buildRange();
  hostageRoot.position.x = 40; // out of this exchange
  const officer = buildOfficer(world, { z: 8 });
  wall.position.set(0, 1.5, 4); // between the officer and the player
  world.updateMatrixWorld(true);

  const playerActor = new CombatActor({
    id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100, armor: 0,
  });
  const combat = new HeistCombatAdapter({
    matrix: new FactionMatrix(), random: () => 0.5,
  });
  combat.setOccluders([world]);

  const targetPoint = new THREE.Vector3(0, 1.2, 0);
  const options = {
    targetPoint,
    targetActor: playerActor,
    accuracy: 1,
    damage: 11,
    cadence: [0.4, 0.4],
    range: 48,
  };

  let firedBehindCover = 0;
  for (let i = 0; i < 240; i++) {
    const update = combat.updateHostile(officer, 1 / 30, options);
    assert.equal(update.seen, false, 'shared perception saw the player through a wall');
    if (update.shot?.fired) firedBehindCover++;
  }
  assert.equal(firedBehindCover, 0, 'an officer fired without an honest trace');
  assert.equal(playerActor.health, 100, 'the player was hit through cover');

  // Cover gone: perception acquires, the bore visibly aligns, rounds land.
  wall.position.x = 50;
  world.updateMatrixWorld(true);
  const shots = [];
  for (let i = 0; i < 240; i++) {
    const update = combat.updateHostile(officer, 1 / 30, options);
    if (update.shot?.fired) shots.push(update.shot);
  }
  assert.ok(shots.length >= 2, `only ${shots.length} rounds in eight seconds of clear sight`);
  const first = shots[0];
  assert.ok(first.boreError <= 0.14, 'a round left a bore that was not aligned');
  assert.ok(first.origin.y > 0.8 && first.origin.y < 1.9,
    'the round did not leave the modelled weapon');
  assert.ok(first.hit, 'a clear full-accuracy shot missed');
  assert.equal(first.applied, true);
  assert.ok(playerActor.health < 100, 'an applied hit did not damage the player');
  assert.equal(playerActor.health,
    Math.max(0, 100 - 11 * shots.filter((shot) => shot.applied).length));

  // The rounds were real: the shared Firearm spent them, and the pipeline
  // state is durable through the checkpoint seam.
  const snapshot = combat.hostileSnapshot(officer.actor.id);
  assert.equal(snapshot.firearm.id, WEAPON_IDS.PISTOL9);
  assert.equal(snapshot.firearm.rounds, snapshot.firearm.capacity - shots.length);
  const rebuilt = new HeistCombatAdapter({ matrix: new FactionMatrix(), random: () => 0.5 });
  rebuilt.setOccluders([world]);
  rebuilt.restoreHostile(officer, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(rebuilt.hostileSnapshot(officer.actor.id).firearm.rounds,
    snapshot.firearm.rounds);
});

test('segment truth: blockedBetween owns the exact contact and clears with the geometry', () => {
  const { world, wall, hostageRoot } = buildRange();
  hostageRoot.position.x = 40; // only the wall may own this segment
  world.updateMatrixWorld(true);
  const combat = new HeistCombatAdapter({ matrix: new FactionMatrix() });
  combat.setOccluders([world]);
  const from = new THREE.Vector3(0, 1.4, 6);
  const to = new THREE.Vector3(0, 1.4, -6);
  const contact = combat.blockedBetween(from, to);
  assert.ok(contact, 'the wall did not block the segment');
  assert.equal(contact.object, wall);
  assert.ok(Math.abs(contact.point.z - 0.15) < 0.02,
    `blocker endpoint ${contact.point.z} is not on the wall face`);
  wall.position.y = 40;
  world.updateMatrixWorld(true);
  assert.equal(combat.blockedBetween(from, to), null);
});

test('applied hits produce shared blood — wound, spurt, and a fatal-only floor pool', () => {
  const { world, wall, hostageRoot, hostageActor } = buildRange();
  wall.position.x = 50;
  world.updateMatrixWorld(true);
  const combat = new HeistCombatAdapter({ matrix: new FactionMatrix(), random: () => 0.5 });
  combat.register(hostageRoot, { actor: combatActorOf });
  combat.setOccluders([world]);
  const calls = { hit: [], burst: [], spill: [] };
  combat.attachBlood({
    impacts: { hit: (record) => calls.hit.push(record) },
    spurts: { burst: (point, direction, options) => calls.burst.push({ point: point.clone(), options }) },
    pools: { spill: (point, options) => calls.spill.push({ point: point.clone(), options }) },
    floorYFor: () => 0,
  });

  const origin = new THREE.Vector3(0, 1.2, 6);
  const aim = new THREE.Vector3(0, 1.0, -6).sub(origin).normalize();
  const graze = combat.resolvePlayerShot({
    origin, direction: aim, weapon: 'pistol9', damage: 10, penetration: 0.16,
  });
  assert.equal(graze.located.applied, true);
  assert.equal(graze.located.fatal, false);
  assert.equal(combat.presentImpact(graze.located), true);
  assert.equal(calls.hit.length, 1);
  assert.equal(calls.hit[0].actor, hostageActor);
  assert.equal(calls.hit[0].anchor, hostageRoot,
    'the wound must attach to a uniformly-scaled body anchor');
  assert.ok(calls.hit[0].point.equals(graze.located.point),
    'the wound is not at the real ray intersection');
  assert.equal(calls.burst.length, 1);
  assert.equal(calls.spill.length, 0, 'a survivable wound left a death pool');

  const kill = combat.resolvePlayerShot({
    origin, direction: aim, weapon: 'carbine', damage: 42, penetration: 0.38,
  });
  assert.equal(kill.located.fatal, true);
  combat.presentImpact(kill.located);
  assert.equal(calls.spill.length, 1, 'a fatal hit left no death pool');
  assert.equal(calls.spill[0].options.floorY, 0);

  // No round, no blood: a refused impact must not decorate anybody.
  calls.hit.length = 0;
  assert.equal(combat.presentImpact({ applied: false }), false);
  assert.equal(calls.hit.length, 0);
});

test('the old local firing path is gone: no second ammunition, ray or blood authority', () => {
  for (const source of [MAIN_SOURCE, LOADOUT_SOURCE]) {
    assert.ok(!/\bWeaponController\b/.test(source),
      'THE TAKE still constructs the deprecated WeaponController');
  }
  assert.ok(!/resolveBallisticHits/.test(MAIN_SOURCE),
    'main.js still resolves ballistics beside the impact resolver');
  assert.ok(!/function\s+registerActorHit/.test(MAIN_SOURCE),
    'the traceless registerActorHit path still exists');
  assert.ok(!/function\s+emitBlood/.test(MAIN_SOURCE),
    'the scene-local blood implementation still exists');
  assert.ok(!/lineOfSightRaycaster/.test(MAIN_SOURCE),
    'the short police line-of-sight ray still exists');
  assert.ok(/combat\.resolvePlayerShot\s*\(/.test(MAIN_SOURCE),
    'player rounds do not go through the shared seam');
  assert.ok(/combat\.updateHostile\s*\(/.test(MAIN_SOURCE),
    'hostile rounds do not go through the shared seam');
  assert.ok(/new BloodImpactSystem\s*\(/.test(MAIN_SOURCE)
    && /new DeathBloodPool\s*\(/.test(MAIN_SOURCE)
    && /new BloodSpurtSystem\s*\(/.test(MAIN_SOURCE),
    'the shared blood systems are not mounted');
  assert.ok(/combat\.setOccluders\s*\(\s*\[\s*phase\.group\s*\]\s*\)/.test(MAIN_SOURCE),
    'the adapter does not trace the active phase geometry');
});
