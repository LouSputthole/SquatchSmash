import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CombatActor } from '../src/core/combat/actors.js';
import { CombatFireControl } from '../src/core/combat/fire-control.js';
import { CombatImpactResolver } from '../src/core/combat/impact.js';
import { FACTIONS } from '../src/core/combat/factions.js';
import { WeaponSystem } from '../src/core/weapons/WeaponSystem.js';

function impactFixture({ health = 120, armor = 80 } = {}) {
  const root = new THREE.Group();
  root.name = 'fixture.combatant';
  root.position.set(4, 1, -3);
  root.rotation.y = 0.35;

  const body = new THREE.Group();
  body.name = 'fixture.body';
  body.userData.hitZone = 'chest';
  body.userData.hitPart = 'chest';
  body.position.set(0, 1, 0);
  root.add(body);

  const head = new THREE.Group();
  head.name = 'fixture.head';
  head.userData.hitZone = 'head';
  head.userData.hitPart = 'head';
  head.position.set(0, 1, 0);
  body.add(head);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4));
  mesh.name = 'fixture.head.mesh';
  head.add(mesh);
  root.updateMatrixWorld(true);

  const actor = new CombatActor({
    id: 'fixture-target',
    faction: FACTIONS.CARTEL,
    maxHealth: health,
    armor,
  });
  const combatant = { id: 'fixture-target', active: true, root, actor };
  const point = mesh.localToWorld(new THREE.Vector3(0.1, 0.08, 0.2));
  const origin = point.clone().add(new THREE.Vector3(0, 0, 4));
  const direction = point.clone().sub(origin).normalize();
  return {
    root,
    body,
    head,
    mesh,
    actor,
    combatant,
    impact: {
      point,
      normal: direction.clone().negate(),
      origin,
      direction,
      distance: origin.distanceTo(point),
      object: mesh,
      weapon: 'revolver',
      damage: 1,
      penetration: 0.16,
    },
  };
}

test('a registered humanoid head hit is lethal through armor', () => {
  const fixture = impactFixture();
  const resolver = new CombatImpactResolver();
  resolver.register(fixture.root, {
    actor: fixture.actor,
    combatant: fixture.combatant,
  });

  const hit = resolver.resolve(fixture.impact, {
    attacker: { faction: FACTIONS.CREW },
    playerShot: true,
  });

  assert.equal(hit.applied, true);
  assert.equal(hit.fatal, true);
  assert.equal(hit.lethal, true);
  assert.equal(hit.zone, 'head');
  assert.equal(hit.part, 'head');
  assert.equal(hit.actor, fixture.actor);
  assert.equal(hit.combatant, fixture.combatant);
  assert.equal(hit.result.absorbed, 0);
  assert.equal(fixture.actor.health, 0);
  assert.equal(fixture.actor.armor, 80);
});

test('a protected core head hit is applied but truthfully nonfatal to generic adapters', () => {
  const fixture = impactFixture();
  fixture.actor.core = true;
  const resolver = new CombatImpactResolver();
  resolver.register(fixture.root, {
    actor: fixture.actor,
    combatant: fixture.combatant,
  });

  const hit = resolver.resolve(fixture.impact, {
    attacker: { faction: FACTIONS.CREW },
    playerShot: true,
  });

  assert.equal(hit.applied, true);
  assert.equal(hit.lethal, true);
  assert.equal(hit.fatal, false);
  assert.equal(hit.result.fatal, false);
  assert.equal(hit.result.fatalPrevented, true);
  assert.equal(hit.result.protectedCore, true);
  assert.equal(fixture.actor.health, 1);
  assert.equal(fixture.actor.incapacitated, false);
});

test('a located body hit preserves shared armor and damage metadata', () => {
  const fixture = impactFixture({ health: 100, armor: 40 });
  const point = fixture.body.localToWorld(new THREE.Vector3(0.12, 0.3, 0.08));
  const impact = {
    ...fixture.impact,
    object: fixture.body,
    point,
    damage: 20,
  };
  const resolver = new CombatImpactResolver();
  resolver.register(fixture.root, {
    actor: () => fixture.actor,
    combatant: () => fixture.combatant,
    zoneOf: (object) => object.userData.hitZone,
    partOf: 'chest',
    anchorOf: (object) => object,
    materialOf: 'flesh',
  });

  const hit = resolver.resolve(impact, {
    attacker: { faction: FACTIONS.CREW },
    playerShot: true,
    damageScale: 0.5,
  });

  assert.equal(hit.zone, 'chest');
  assert.equal(hit.part, 'chest');
  assert.equal(hit.material, 'flesh');
  assert.equal(hit.lethal, false);
  assert.equal(hit.applied, true);
  assert.equal(hit.fatal, false);
  assert.equal(hit.result.raw, 10);
  assert.equal(hit.result.absorbed, 5.5);
  assert.equal(hit.result.damage, 4.5);
  assert.equal(hit.result.armorBefore, 40);
  assert.equal(hit.result.armorAfter, 34.5);
  assert.equal(hit.result.healthBefore, 100);
  assert.equal(hit.result.healthAfter, 95.5);
});

test('the immutable world record and anchor-local hit are captured before a fatal pose', () => {
  const fixture = impactFixture();
  fixture.root.updateMatrixWorld(true);
  const expectedLocalPoint = fixture.head.worldToLocal(fixture.impact.point.clone());
  const expectedLocalNormal = fixture.impact.normal.clone().applyMatrix3(
    new THREE.Matrix3().setFromMatrix4(fixture.head.matrixWorld).transpose(),
  ).normalize();
  const originalWorldPoint = fixture.impact.point.clone();
  const originalWorldNormal = fixture.impact.normal.clone();
  const originalOrigin = fixture.impact.origin.clone();
  const originalDirection = fixture.impact.direction.clone();
  const applyHit = fixture.actor.applyHit.bind(fixture.actor);
  fixture.actor.applyHit = (options) => {
    const result = applyHit(options);
    if (result.fatal) {
      fixture.root.position.set(-20, 0, 11);
      fixture.root.rotation.set(0.7, -1.1, 1.3);
      fixture.root.updateMatrixWorld(true);
    }
    return result;
  };

  const resolver = new CombatImpactResolver();
  resolver.register(fixture.root, {
    actor: fixture.actor,
    combatant: fixture.combatant,
  });
  const hit = resolver.resolve(fixture.impact, {
    attacker: { faction: FACTIONS.CREW },
    playerShot: true,
  });

  assert.deepEqual(hit.anchorLocalPoint.toArray(), expectedLocalPoint.toArray());
  assert.ok(hit.anchorLocalNormal.distanceTo(expectedLocalNormal) < 1e-12);
  assert.equal(hit.impact.object, fixture.mesh);
  assert.equal(hit.impact.weapon, 'revolver');
  assert.equal(hit.impact.damage, 1);
  assert.equal(hit.impact.penetration, 0.16);
  assert.equal(hit.impact.distance, 4);
  assert.deepEqual(hit.impact.point.toArray(), originalWorldPoint.toArray());
  assert.deepEqual(hit.impact.normal.toArray(), originalWorldNormal.toArray());
  assert.deepEqual(hit.impact.origin.toArray(), originalOrigin.toArray());
  assert.deepEqual(hit.impact.direction.toArray(), originalDirection.toArray());
  assert.equal(hit.point, hit.impact.point);
  assert.equal(hit.normal, hit.impact.normal);
  assert.equal(hit.origin, hit.impact.origin);
  assert.equal(hit.direction, hit.impact.direction);
  assert.equal(Object.isFrozen(hit.impact), true);
  assert.equal(Object.isFrozen(hit.impact.point), true);
  assert.equal(Object.isFrozen(hit.result), true);

  fixture.impact.point.set(99, 99, 99);
  assert.deepEqual(hit.impact.point.toArray(), originalWorldPoint.toArray());
  assert.throws(() => hit.impact.point.set(1, 2, 3), TypeError);
});

test('a delayed player impact keeps its fire-time body space when the target moves', () => {
  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 1, 0.08, 120);
  world.add(camera);

  const root = new THREE.Group();
  root.name = 'moving-target';
  root.position.set(0, 0, -55);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(20, 20, 0.4),
    new THREE.MeshBasicMaterial(),
  );
  body.name = 'moving-target.body';
  body.userData.hitZone = 'chest';
  body.userData.hitPart = 'chest';
  root.add(body);
  world.add(root);
  world.updateMatrixWorld(true);

  const actor = new CombatActor({
    id: 'moving-target', faction: FACTIONS.CARTEL, maxHealth: 100,
  });
  const combatant = { id: actor.id, active: true, root, actor };
  const resolver = new CombatImpactResolver();
  resolver.register(root, { actor, combatant });
  const fireTimeBodyMatrix = body.matrixWorld.clone();
  const fireTimeBodyInverse = fireTimeBodyMatrix.clone().invert();
  let located = null;
  const weapons = new WeaponSystem({
    camera,
    world,
    hitTargets: [root],
    range: 90,
    onImpact: (impact) => {
      located = resolver.resolve(impact, {
        attacker: { faction: FACTIONS.CREW },
        playerShot: true,
      });
      return located;
    },
  });
  weapons.equip('revolver');
  weapons.triggerPress();
  assert.equal(located, null, 'the tracer did not preserve delayed presentation');

  root.position.x = 6;
  root.rotation.y = 0.45;
  world.updateMatrixWorld(true);
  for (let i = 0; i < 30 && !located; i++) weapons.update(1 / 60);

  assert.ok(located?.applied, 'the delayed impact never reached the resolver');
  assert.equal(located.anchor, body);
  const expectedLocalPoint = located.point.clone().applyMatrix4(fireTimeBodyInverse);
  const expectedLocalNormal = located.normal.clone().applyMatrix3(
    new THREE.Matrix3().setFromMatrix4(fireTimeBodyMatrix).transpose(),
  ).normalize();
  assert.ok(located.anchorLocalPoint.distanceTo(expectedLocalPoint) < 1e-9,
    'the old world point was converted through the target\'s new transform');
  assert.ok(located.anchorLocalNormal.distanceTo(expectedLocalNormal) < 1e-9,
    'the old world normal was converted through the target\'s new transform');

  const arrivalTimeConversion = body.worldToLocal(located.point.clone());
  assert.ok(arrivalTimeConversion.distanceTo(expectedLocalPoint) > 1,
    'the fixture did not move enough to expose the delayed-transform bug');
  const attachedPoint = body.localToWorld(located.anchorLocalPoint.clone());
  assert.ok(attachedPoint.distanceTo(located.point) > 1,
    'the wound did not remain attached to the body after its movement');
  assert.equal(actor.health < actor.maxHealth, true);
  weapons.dispose();
});

test('fire control refuses a shot whose actual bore is not aligned', () => {
  const targetActor = new CombatActor({
    id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100,
  });
  const fire = new CombatFireControl({ random: () => 0 });
  const shot = fire.resolveShot({
    origin: new THREE.Vector3(0, 1.5, 0),
    boreDirection: new THREE.Vector3(1, 0, 0),
    aimPoint: new THREE.Vector3(0, 1.5, 10),
    target: {
      id: 'prospect',
      actor: targetActor,
      position: new THREE.Vector3(0, 0, 10),
      eye: 1.5,
      visible: true,
    },
    attacker: { faction: FACTIONS.CARTEL },
    damage: 20,
    accuracy: 1,
  });

  assert.equal(shot.fired, false);
  assert.equal(shot.reason, 'unaligned');
  assert.equal(shot.hit, false);
  assert.equal(shot.damage, 0);
  assert.equal(targetActor.health, 100);
  assert.ok(Math.abs(shot.boreError - Math.PI / 2) < 1e-12);
  assert.deepEqual(shot.origin.toArray(), [0, 1.5, 0]);
  assert.deepEqual(shot.boreDirection.toArray(), [1, 0, 0]);
});

test('only a visible actor still at the copied aim sample can take damage', () => {
  const origin = new THREE.Vector3(0, 1.5, 0);
  const aimPoint = new THREE.Vector3(0, 1.5, 10);
  const boreDirection = new THREE.Vector3(0, 0, 1);
  const attacker = { faction: FACTIONS.CARTEL };
  const fire = new CombatFireControl({ random: () => 0 });
  const makeTarget = (id, x = 0, visible = true) => ({
    id,
    actor: new CombatActor({ id, faction: FACTIONS.CREW, maxHealth: 100 }),
    position: new THREE.Vector3(x, 0, 10),
    eye: 1.5,
    visible,
  });

  const current = makeTarget('current');
  const hit = fire.resolveShot({
    origin, boreDirection, aimPoint, target: current, attacker, damage: 20, accuracy: 1,
  });
  assert.equal(hit.fired, true);
  assert.equal(hit.hit, true);
  assert.equal(hit.applied, true);
  assert.equal(hit.damage, 20);
  assert.equal(hit.targetId, 'current');
  assert.equal(current.actor.health, 80);
  assert.deepEqual(hit.end.toArray(), [0, 1.5, 10]);

  const occluded = makeTarget('occluded', 0, false);
  const hiddenMiss = fire.resolveShot({
    origin, boreDirection, aimPoint, target: occluded, attacker, damage: 20, accuracy: 1,
  });
  assert.equal(hiddenMiss.hit, false);
  assert.equal(hiddenMiss.applied, false);
  assert.equal(occluded.actor.health, 100);
  assert.ok(hiddenMiss.end.distanceTo(aimPoint) >= 0.45);

  const moved = makeTarget('moved', 2, true);
  const staleMiss = fire.resolveShot({
    origin, boreDirection, aimPoint, target: moved, attacker, damage: 20, accuracy: 1,
  });
  assert.equal(staleMiss.hit, false);
  assert.equal(staleMiss.applied, false);
  assert.equal(moved.actor.health, 100);
  assert.ok(staleMiss.end.distanceTo(aimPoint) >= 0.45);
});

test('a collider stops the round at its real endpoint and prevents hits and near misses', () => {
  const wall = new THREE.Box3(
    new THREE.Vector3(-1, 0, 4),
    new THREE.Vector3(1, 3, 4.5),
  );
  wall.name = 'test-wall';
  const actor = new CombatActor({ id: 'covered', faction: FACTIONS.CREW });
  const fire = new CombatFireControl({ random: () => 0, colliders: [wall] });
  const shot = fire.resolveShot({
    origin: new THREE.Vector3(0, 1.5, 0),
    boreDirection: new THREE.Vector3(0, 0, 1),
    aimPoint: new THREE.Vector3(0, 1.5, 10),
    target: {
      id: 'covered', actor, position: new THREE.Vector3(0, 0, 10), eye: 1.5, visible: true,
    },
    attacker: { faction: FACTIONS.CARTEL },
    damage: 50,
    accuracy: 1,
  });

  assert.equal(shot.fired, true);
  assert.equal(shot.blocked, true);
  assert.equal(shot.blocker.box, wall);
  assert.equal(shot.blocker.id, 'test-wall');
  assert.equal(shot.hit, false);
  assert.equal(shot.nearMiss, false);
  assert.equal(shot.whiz, false);
  assert.equal(shot.damage, 0);
  assert.equal(actor.health, 100);
  assert.ok(shot.end.distanceTo(new THREE.Vector3(0, 1.5, 4)) < 1e-12);
  assert.equal(shot.distance, 4);
});

test('a clean accuracy miss ends visibly off the sampled target', () => {
  const values = [0.9, 0, 0, 0.5];
  const actor = new CombatActor({ id: 'missed', faction: FACTIONS.CREW });
  const fire = new CombatFireControl({ random: () => values.shift() ?? 0.5 });
  const origin = new THREE.Vector3(0, 1.5, 0);
  const aimPoint = new THREE.Vector3(0, 1.5, 10);
  const shot = fire.resolveShot({
    origin,
    boreDirection: new THREE.Vector3(0, 0, 1),
    aimPoint,
    target: {
      id: 'missed', actor, position: new THREE.Vector3(0, 0, 10), eye: 1.5, visible: true,
    },
    attacker: { faction: FACTIONS.CARTEL },
    damage: 40,
    accuracy: 0.5,
  });

  assert.equal(shot.fired, true);
  assert.equal(shot.blocked, false);
  assert.equal(shot.hit, false);
  assert.equal(shot.applied, false);
  assert.equal(actor.health, 100);
  assert.ok(Math.abs(shot.end.distanceTo(aimPoint) - 0.45) < 1e-12);
  assert.ok(Math.abs(shot.missDistance - 0.45) < 1e-12);
  assert.ok(shot.direction.distanceTo(shot.end.clone().sub(origin).normalize()) < 1e-12);
});

test('area fire drops the actor and can never apply damage', () => {
  const actor = new CombatActor({ id: 'area-victim', faction: FACTIONS.CREW });
  const fire = new CombatFireControl({ random: () => 0 });
  const shot = fire.resolveShot({
    origin: new THREE.Vector3(0, 1.5, 0),
    boreDirection: new THREE.Vector3(0, 0, 1),
    aimPoint: new THREE.Vector3(0, 1.5, 10),
    target: {
      id: 'area-victim', actor, position: new THREE.Vector3(0, 0, 10), eye: 1.5, visible: true,
    },
    attacker: { faction: FACTIONS.CARTEL },
    areaFire: true,
    damage: 500,
    accuracy: 1,
  });

  assert.equal(shot.fired, true);
  assert.equal(shot.areaFire, true);
  assert.equal(shot.actor, null);
  assert.equal(shot.hit, false);
  assert.equal(shot.applied, false);
  assert.equal(shot.damage, 0);
  assert.equal(actor.health, 100);
  assert.ok(shot.end.distanceTo(new THREE.Vector3(0, 1.5, 10)) >= 0.45);
});

test('close misses share one checkpoint-safe whiz cooldown across the fire-control pool', () => {
  const makeFire = () => new CombatFireControl({ random: () => 0, whizCooldown: 0.22 });
  const miss = (fire, id) => {
    const actor = new CombatActor({ id, faction: FACTIONS.CREW });
    return fire.resolveShot({
      origin: new THREE.Vector3(0, 1.5, 0),
      boreDirection: new THREE.Vector3(0, 0, 1),
      aimPoint: new THREE.Vector3(0, 1.5, 10),
      target: {
        id, actor, position: new THREE.Vector3(0, 0, 10), eye: 1.5, visible: true,
      },
      attacker: { faction: FACTIONS.CARTEL },
      damage: 20,
      accuracy: 0,
    });
  };

  const fire = makeFire();
  const first = miss(fire, 'first-pass');
  const second = miss(fire, 'second-pass');
  assert.equal(first.nearMiss, true);
  assert.equal(first.whiz, true);
  assert.equal(second.nearMiss, true);
  assert.equal(second.whiz, false);

  const snapshot = fire.snapshot();
  assert.deepEqual(snapshot, { version: 1, whizCooldown: 0.22 });
  const restored = makeFire().restore(snapshot);
  assert.equal(miss(restored, 'after-restore').whiz, false);
  restored.update(0.22);
  assert.equal(miss(restored, 'after-recovery').whiz, true);
});

test('impact registrations reject inactive targets and unregister without damaging them', () => {
  const fixture = impactFixture();
  fixture.combatant.active = false;
  const resolver = new CombatImpactResolver();
  const unregister = resolver.register(fixture.root, {
    actor: fixture.actor,
    combatant: fixture.combatant,
  });

  const inactive = resolver.resolve(fixture.impact, {
    attacker: { faction: FACTIONS.CREW }, playerShot: true,
  });
  assert.equal(inactive.applied, false);
  assert.equal(inactive.reason, 'inactive');
  assert.equal(fixture.actor.health, 120);
  assert.equal(unregister(), true);
  assert.equal(unregister(), false);

  fixture.combatant.active = true;
  const absent = resolver.resolve(fixture.impact, {
    attacker: { faction: FACTIONS.CREW }, playerShot: true,
  });
  assert.equal(absent.applied, false);
  assert.equal(absent.reason, 'unregistered');
  assert.equal(absent.impact.object, fixture.mesh);
  assert.equal(fixture.actor.health, 120);
});

test('an adapter can explicitly disable lethal headshots without changing location metadata', () => {
  const fixture = impactFixture();
  const resolver = new CombatImpactResolver();
  resolver.register(fixture.root, { actor: fixture.actor, combatant: fixture.combatant });

  const hit = resolver.resolve(fixture.impact, {
    attacker: { faction: FACTIONS.CREW },
    playerShot: true,
    lethalHeadshots: false,
  });

  assert.equal(hit.zone, 'head');
  assert.equal(hit.lethal, false);
  assert.equal(hit.fatal, false);
  assert.equal(hit.result.lethal, false);
  assert.ok(fixture.actor.health > 0);
  assert.ok(fixture.actor.armor < 80);
});
