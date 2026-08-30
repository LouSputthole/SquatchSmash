import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { buildPalaceCast } from '../src/cartel-palace/cast.js';
import { PalaceSecurity } from '../src/cartel-palace/security.js';
import { CombatActor } from '../src/core/combat/actors.js';
import { FACTIONS } from '../src/core/combat/factions.js';
import { InteractionSystem } from '../src/core/interaction.js';
import { WEAPON_IDS, weaponDef } from '../src/core/weapons/catalog.js';

function randomSequence(values, fallback = values.at(-1) ?? 0.5) {
  let index = 0;
  return () => index < values.length ? values[index++] : fallback;
}

function harness({ colliders = [], random = randomSequence([0.5]) } = {}) {
  const scene = new THREE.Group();
  const cast = buildPalaceCast(scene);
  const playerActor = new CombatActor({
    id: 'palace-prospect',
    faction: FACTIONS.CREW,
    maxHealth: 200,
    armor: 35,
    maxArmor: 35,
  });
  const enemyFire = [];
  const playerHits = [];
  const targetDown = [];
  const security = new PalaceSecurity({
    cast,
    colliders,
    playerActor,
    random,
    onEnemyFire: (shot) => enemyFire.push(shot),
    onPlayerHit: (hit) => playerHits.push(hit),
    onTargetDown: (entry, detail) => targetDown.push({ entry, detail }),
  });
  return {
    scene, cast, security, playerActor, colliders, enemyFire, playerHits, targetDown,
  };
}

function isolate(cast, ...active) {
  const allowed = new Set(active);
  for (const entry of cast.all) {
    entry.active = allowed.has(entry) && !entry.down;
  }
}

test('focus cancellation clears a held Palace interaction without firing its tap action', () => {
  const hud = {
    setHold() {}, hidePrompt() {}, showPrompt() {},
  };
  const interaction = new InteractionSystem(new THREE.PerspectiveCamera(), hud);
  const target = new THREE.Object3D();
  let taps = 0;
  interaction.register(target, {
    hold: 1,
    onTap: () => { taps++; },
  });
  interaction.current = target;
  interaction.press();
  interaction.holdTime = 0.25;
  interaction.cancel();
  assert.equal(interaction.holding, false);
  assert.equal(interaction.holdTime, 0);
  assert.equal(taps, 0);

  interaction.press();
  interaction.holdTime = 0.25;
  interaction.release();
  assert.equal(taps, 1, 'a real key release must retain authored tap behavior');
});

function firstMesh(anchor) {
  let object = null;
  anchor.traverse((node) => {
    if (!object && node.isMesh) object = node;
  });
  assert.ok(object, `${anchor.name || 'hit anchor'} has no real cast mesh`);
  return object;
}

function locatedImpact(scene, entry, part, {
  weapon = WEAPON_IDS.PISTOL9,
  damage = weaponDef(weapon)?.damage ?? 30,
  penetration = weaponDef(weapon)?.penetration ?? 0,
  localPoint = new THREE.Vector3(0.013, 0.021, 0.017),
} = {}) {
  const anchor = entry.figure.parts[part];
  assert.ok(anchor, `${entry.id} has no ${part} hit anchor`);
  const object = firstMesh(anchor);
  scene.updateMatrixWorld(true);
  const point = anchor.localToWorld(localPoint.clone());
  const normal = new THREE.Vector3(0.17, 0.08, 1).normalize()
    .applyQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
  const origin = point.clone().addScaledVector(normal, 4);
  const direction = point.clone().sub(origin).normalize();
  return {
    anchor,
    localPoint: localPoint.clone(),
    impact: {
      object,
      weapon,
      point,
      normal,
      origin,
      direction,
      distance: origin.distanceTo(point),
      damage,
      penetration,
    },
  };
}

function advanceUntil(security, predicate, {
  playerPosition,
  dt = 1 / 60,
  frames = 600,
  options = {},
} = {}) {
  for (let frame = 0; frame < frames; frame++) {
    security.update(dt, { playerPosition, ...options });
    if (predicate()) return frame + 1;
  }
  return null;
}

function installShotRandom(security, values, fallback = values.at(-1) ?? 0.5) {
  const random = randomSequence(values, fallback);
  security.random = random;
  security.fireControl.random = random;
  return random;
}

test('a full world-space head impact kills armored Mark and preserves its Located point', () => {
  const { scene, cast, security, targetDown } = harness();
  /* `activateFinalEncounter` is the CHEF since the 2026-08-25 rewire -- the
   * doors opening leave Mark walking out of the room, and the finale director
   * brings him back for stage one. This test is about what a round does to him
   * when he IS live, so it puts him there the way the director does. */
  security.activateFinalEncounter();
  cast.activateMark({ armored: true });
  for (let frame = 0; frame < 180 && !cast.mark.active; frame++) {
    cast.updatePresentation(1 / 60);
  }
  assert.equal(cast.mark.active, true);
  assert.ok(cast.mark.actor.armor > 0, 'the test did not exercise armored Mark');

  const localPoint = new THREE.Vector3(0.02, 0.03, 0.01);
  const { anchor, impact } = locatedImpact(scene, cast.mark, 'head', { localPoint });
  const worldPoint = impact.point.clone();
  const result = security.applyPlayerImpact(impact);

  assert.equal(result.entry, cast.mark);
  assert.equal(result.zone, 'head');
  assert.equal(result.part, 'head');
  assert.equal(result.anchor, anchor);
  assert.equal(result.object, impact.object);
  assert.equal(result.lethal, true);
  assert.equal(result.fatal, true);
  assert.equal(result.result.absorbed, 0, 'lethal headshot was absorbed by armor');
  assert.equal(cast.mark.actor.health, 0);
  assert.equal(cast.mark.actor.incapacitated, true);
  assert.equal(cast.mark.down, true);
  assert.equal(targetDown.length, 1);
  assert.ok(result.anchorLocalPoint.distanceTo(localPoint) <= 1e-9,
    `Located point drifted ${result.anchorLocalPoint.distanceTo(localPoint)}m`);
  assert.ok(result.point.distanceTo(worldPoint) <= 1e-12);
  assert.notEqual(result.point, impact.point, 'resolution retained the mutable impact vector');
  assert.ok(result.normal.distanceTo(impact.normal) <= 1e-12);
  assert.ok(result.origin.distanceTo(impact.origin) <= 1e-12);
  assert.ok(result.direction.distanceTo(impact.direction) <= 1e-12);
  assert.ok(Math.abs(result.distance - 4) <= 1e-12);
});

test('chest armor absorption and real arm/leg impacts drive shared impairments', () => {
  const { scene, cast, security } = harness();
  const chestTarget = cast.guards.find((entry) => entry.id === 'guardhouse');
  const armTarget = cast.guards.find((entry) => entry.id === 'gate-one');
  const legTarget = cast.guards.find((entry) => entry.id === 'fountain');
  assert.ok(chestTarget && armTarget && legTarget);

  const armorBefore = chestTarget.actor.armor;
  const chest = security.applyPlayerImpact(locatedImpact(
    scene, chestTarget, 'body', { damage: 30 },
  ).impact);
  assert.equal(chest.zone, 'chest');
  assert.equal(chest.part, 'chest');
  assert.ok(chest.result.absorbed > 0);
  assert.equal(chest.result.armorBefore, armorBefore);
  assert.ok(chest.result.armorAfter < armorBefore);
  assert.equal(chestTarget.actor.armor, chest.result.armorAfter);
  assert.ok(chestTarget.impairments.stagger > 0);
  assert.equal(chestTarget.impairments.armWound, 0);
  assert.equal(chestTarget.impairments.legWound, 0);

  const arm = security.applyPlayerImpact(locatedImpact(
    scene, armTarget, 'armR', { damage: 30 },
  ).impact);
  assert.equal(arm.zone, 'limb');
  assert.equal(arm.part, 'arm');
  assert.ok(arm.applied);
  assert.ok(armTarget.impairments.armWound > 0);
  assert.equal(armTarget.impairments.legWound, 0);

  const leg = security.applyPlayerImpact(locatedImpact(
    scene, legTarget, 'legR', { damage: 30 },
  ).impact);
  assert.equal(leg.zone, 'limb');
  assert.equal(leg.part, 'leg');
  assert.ok(leg.applied);
  assert.ok(legTarget.impairments.legWound > 0);
  assert.equal(legTarget.impairments.armWound, 0);
});

test('a wall prevents Palace perception, awareness, hostile fire and player damage', () => {
  const wall = new THREE.Box3(
    new THREE.Vector3(-3, 0, 3),
    new THREE.Vector3(3, 3, 3.12),
  );
  wall.combatId = 'sight-wall';
  const {
    cast, security, playerActor, enemyFire, playerHits,
  } = harness({ colliders: [wall], random: randomSequence([0]) });
  const guard = cast.guards[0];
  isolate(cast, guard);
  guard.root.position.set(0, 0, 0);
  guard.root.rotation.y = 0;
  guard.patrol = [];
  const playerPosition = new THREE.Vector3(0, 0, 8);
  const healthBefore = playerActor.health;

  for (let frame = 0; frame < 240; frame++) {
    security.update(1 / 60, { playerPosition });
  }

  assert.equal(security.canSee(guard, playerPosition), false);
  assert.equal(guard.perception.target, null);
  assert.equal(guard.perception.targetVisible, false);
  assert.equal(guard.perception.lastSeen, null);
  assert.equal(guard.perception.awareness, 0);
  assert.equal(guard.awareness, 0);
  assert.equal(security.alarm, false);
  assert.equal(security.stats.roundsFired, 0);
  assert.equal(enemyFire.length, 0);
  assert.equal(playerHits.length, 0);
  assert.equal(playerActor.health, healthBefore);
});

test('Palace fire waits for the real catalog bore and begins at the rendered muzzle', () => {
  const {
    scene, cast, security, playerActor, enemyFire,
  } = harness({ random: randomSequence([0]) });
  const guard = cast.guards[0];
  isolate(cast, guard);
  guard.root.position.set(0, 0, 0);
  guard.root.rotation.y = 0;
  guard.patrol = [];
  security.alarm = true;
  security.runtime.get(guard.id).shotClock = 0;
  installShotRandom(security, [0, 0, 0, 0], 0);
  const playerPosition = new THREE.Vector3(0, 0, 6);

  const frames = advanceUntil(security, () => enemyFire.length > 0, {
    playerPosition,
    frames: 360,
  });
  assert.ok(frames, 'the aligned Palace guard never fired');
  assert.equal(enemyFire.length, 1);
  const shot = enemyFire[0];

  scene.updateMatrixWorld(true);
  const renderedMuzzle = guard.weaponModel.localToWorld(
    guard.weaponModel.userData.muzzle.clone(),
  );
  const renderedBore = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(guard.weaponModel.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
  const towardSample = guard.perception.sampledPoint.clone().sub(renderedMuzzle).normalize();

  assert.equal(guard.aimAligned, true);
  assert.ok(guard.aimError <= 0.14, `root aim fired at ${guard.aimError} rad`);
  assert.ok(guard.boreError <= 0.14, `rendered bore fired at ${guard.boreError} rad`);
  assert.ok(renderedBore.angleTo(towardSample) <= 0.14);
  assert.ok(shot.origin.distanceTo(renderedMuzzle) <= 1e-9,
    `shot began ${shot.origin.distanceTo(renderedMuzzle)}m from the muzzle`);
  assert.ok(shot.boreDirection.angleTo(renderedBore) <= 1e-9);
  assert.ok(guard.lastShotOrigin.distanceTo(renderedMuzzle) <= 1e-9);
  assert.equal(shot.applied, true);
  assert.ok(playerActor.health < playerActor.maxHealth);
});

test('Palace patrol and combat movement sweep thin walls and separate actors', () => {
  const exercise = (mode) => {
    const wall = new THREE.Box3(
      new THREE.Vector3(-20, 0, 2),
      new THREE.Vector3(20, 3, 2.05),
    );
    wall.combatId = `${mode}-wall`;
    const { cast, security } = harness({ colliders: [wall] });
    const first = cast.guards[0];
    const second = cast.guards[1];
    isolate(cast, first, second);
    for (const entry of [first, second]) {
      entry.root.position.set(0, 0, 0);
      entry.root.rotation.y = 0;
      entry.patrol = [new THREE.Vector3(0, 0, 10)];
      entry.patrolIndex = 0;
      if (mode === 'combat') {
        entry.perception.restore({
          awareness: 1,
          memory: 10,
          lastSeen: [0, 1.5, 10],
        });
      }
    }
    security.alarm = mode === 'combat';
    const distantPlayer = new THREE.Vector3(100, 0, 100);
    for (let frame = 0; frame < 100; frame++) {
      security.update(0.1, { playerPosition: distantPlayer });
    }
    return { wall, security, first, second };
  };

  for (const mode of ['patrol', 'combat']) {
    const { wall, security, first, second } = exercise(mode);
    const maximumZ = wall.min.z - security.space.radius;
    assert.ok(first.root.position.z <= maximumZ + 1e-9,
      `${mode} first actor crossed to z=${first.root.position.z}`);
    assert.ok(second.root.position.z <= maximumZ + 1e-9,
      `${mode} second actor crossed to z=${second.root.position.z}`);
    const separation = Math.hypot(
      first.root.position.x - second.root.position.x,
      first.root.position.z - second.root.position.z,
    );
    assert.ok(separation >= security.space.separation - 1e-9,
      `${mode} actors remained stacked at ${separation}m`);
    assert.ok(security.stats.blockedMoves > 0, `${mode} never reported a blocked sweep`);
  }
});

test('Palace patrol and combat steering detour around a finite thin wall without clipping', () => {
  for (const mode of ['patrol', 'combat']) {
    const wall = new THREE.Box3(
      new THREE.Vector3(0.5, 0, -0.34),
      new THREE.Vector3(0.56, 3, 0.34),
    );
    wall.combatId = `${mode}-finite-wall`;
    const { cast, security } = harness({ colliders: [wall] });
    const guard = cast.guards[0];
    isolate(cast, guard);
    guard.root.position.set(0, 0, 0);
    guard.patrol = [new THREE.Vector3(9, 0, 0)];
    guard.patrolIndex = 0;
    const target = new THREE.Vector3(9, 0, 0);
    let cleared = false;
    let furthestSide = 0;

    for (let frame = 0; frame < 500; frame++) {
      if (mode === 'patrol') security._patrol(guard, 0.1, 1);
      else security._combatMove(guard, 0.1, target, 1);
      const { x, z } = guard.root.position;
      furthestSide = Math.max(furthestSide, Math.abs(z));
      const insideExpandedBody = x > wall.min.x - security.space.radius
        && x < wall.max.x + security.space.radius
        && z > wall.min.z - security.space.radius
        && z < wall.max.z + security.space.radius;
      assert.equal(insideExpandedBody, false,
        `${mode} detour intersected the live collider at ${x},${z}`);
      if (x > wall.max.x + security.space.radius + 0.25) {
        cleared = true;
        break;
      }
    }

    assert.equal(cleared, true, `${mode} stayed pinned to the finite wall`);
    assert.ok(furthestSide >= wall.max.z + security.space.radius - 0.08,
      `${mode} crossed the wall plane without visibly steering around its edge`);
  }
});

test('hostile endpoints stop at blockers or visibly miss instead of ending on the player', () => {
  /* A door closes after a clean perception sample but before the trigger
   * breaks. The already-aligned guard may fire, but geometry owns the end. */
  {
    const {
      cast, security, colliders, playerActor, enemyFire,
    } = harness({ random: randomSequence([0]) });
    const guard = cast.guards[0];
    isolate(cast, guard);
    guard.root.position.set(0, 0, 0);
    guard.root.rotation.y = 0;
    guard.patrol = [];
    security.alarm = true;
    const runtime = security.runtime.get(guard.id);
    runtime.shotClock = 99;
    installShotRandom(security, [0, 0, 0, 0], 0);
    const playerPosition = new THREE.Vector3(0, 0, 7);
    assert.ok(advanceUntil(security, () => guard.aimAligned, {
      playerPosition,
      frames: 360,
    }), 'guard never reached alignment before the blocker test');
    assert.equal(enemyFire.length, 0);

    const wall = new THREE.Box3(
      new THREE.Vector3(-5, 0, 3),
      new THREE.Vector3(5, 3, 3.1),
    );
    wall.combatId = 'closing-wall';
    runtime.shotClock = 0;
    const scan = security._scan.bind(security);
    security._scan = (...args) => {
      const seen = scan(...args);
      if (seen && !colliders.includes(wall)) colliders.push(wall);
      return seen;
    };
    const healthBefore = playerActor.health;
    security.update(1 / 60, { playerPosition });
    security._scan = scan;

    assert.equal(enemyFire.length, 1);
    const shot = enemyFire[0];
    assert.equal(shot.blocked, true);
    assert.equal(shot.blocker.box, wall);
    assert.equal(shot.hit, false);
    assert.equal(shot.applied, false);
    assert.ok(shot.end.distanceTo(shot.blocker.point) <= 1e-12);
    assert.ok(shot.end.distanceTo(playerPosition.clone().setY(1.5)) > 0.5);
    assert.equal(playerActor.health, healthBefore);
  }

  /* A clean line with a failed deterministic accuracy roll has a real offset
   * endpoint rather than a tracer that lies and terminates on the player. */
  {
    const {
      cast, security, playerActor, enemyFire,
    } = harness({ random: randomSequence([1]) });
    const guard = cast.guards[0];
    isolate(cast, guard);
    guard.root.position.set(0, 0, 0);
    guard.root.rotation.y = 0;
    guard.patrol = [];
    security.alarm = true;
    security.runtime.get(guard.id).shotClock = 0;
    installShotRandom(security, [1, 1, 1, 1, 1], 1);
    const playerPosition = new THREE.Vector3(0, 0, 7);
    const healthBefore = playerActor.health;
    assert.ok(advanceUntil(security, () => enemyFire.length > 0, {
      playerPosition,
      frames: 360,
    }), 'deterministic miss never fired');

    const shot = enemyFire[0];
    const playerAim = playerPosition.clone().setY(1.5);
    assert.equal(shot.blocked, false);
    assert.equal(shot.hit, false);
    assert.equal(shot.applied, false);
    assert.ok(shot.missDistance >= security.fireControl.missMin);
    assert.ok(shot.end.distanceTo(playerAim) >= security.fireControl.missMin);
    assert.equal(playerActor.health, healthBefore);
  }
});

test('Palace combat snapshot round-trips durable state and clears stale fire permission', () => {
  const {
    scene, cast, security,
  } = harness({ random: randomSequence([0]) });
  const guard = cast.guards[0];
  isolate(cast, guard);
  guard.root.position.set(0, 0, 0);
  guard.root.rotation.y = 0;
  guard.patrol = [];
  security.alarm = true;
  const runtime = security.runtime.get(guard.id);
  runtime.shotClock = 99;
  const playerPosition = new THREE.Vector3(0, 0, 6);
  assert.ok(advanceUntil(security, () => guard.aimAligned, {
    playerPosition,
    frames: 360,
  }), 'guard never acquired durable perception/aim state');
  assert.ok(guard.perception.target, 'the pre-snapshot state has no live target to clear');

  guard.firearm.setTrigger(true);
  const fired = guard.firearm.fire({ aimed: true, aimStability: 1 });
  guard.firearm.setTrigger(false);
  assert.equal(fired.fired, true);
  const arm = security.applyPlayerImpact(locatedImpact(
    scene, guard, 'armR', { damage: 10 },
  ).impact);
  assert.equal(arm.part, 'arm');
  assert.ok(guard.impairments.armWound > 0);

  const encoded = JSON.stringify(security.snapshot());
  const snapshot = JSON.parse(encoded);
  const record = snapshot.entries.find((entry) => entry.id === guard.id);
  assert.ok(record);
  assert.ok(Number.isFinite(record.actor.armor));
  assert.ok(Number.isFinite(record.firearm.rounds));
  assert.ok(Number.isFinite(record.firearm.reserve));
  assert.ok(record.perception.lastSeen);
  assert.ok(record.impairments.armWound > 0);
  assert.ok(Number.isFinite(record.aim.aimError));
  assert.ok(Number.isFinite(record.aim.boreError));

  guard.actor.health = 1;
  guard.actor.armor = 0;
  guard.firearm.rounds = 0;
  guard.firearm.reserve = 0;
  guard.firearm.setTrigger(true);
  guard.perception.restore({});
  guard.impairments.reset();
  guard.aimAligned = true;
  guard.weaponAim.aligned = true;
  security.restore(snapshot);

  assert.equal(guard.actor.health, record.actor.health);
  assert.equal(guard.actor.armor, record.actor.armor);
  assert.equal(guard.actor.maxArmor, record.actor.maxArmor);
  assert.equal(guard.firearm.rounds, record.firearm.rounds);
  assert.equal(guard.firearm.reserve, record.firearm.reserve);
  assert.equal(guard.firearm.triggerHeld, false);
  assert.equal(guard.perception.awareness, record.perception.awareness);
  assert.equal(guard.perception.memory, record.perception.memory);
  assert.deepEqual(guard.perception.lastSeen.toArray(), record.perception.lastSeen);
  assert.equal(guard.perception.target, null);
  assert.equal(guard.perception.targetVisible, false);
  assert.equal(guard.perception.sampledPoint, null);
  assert.equal(guard.impairments.armWound, record.impairments.armWound);
  assert.equal(guard.impairments.legWound, record.impairments.legWound);
  assert.equal(guard.impairments.stagger, record.impairments.stagger);
  assert.equal(guard.aimAligned, false);
  assert.equal(guard.weaponAim.aligned, false);
});

test('Palace restore rejects collider-contained poses and clears stale aim presentation', () => {
  const wall = new THREE.Box3(
    new THREE.Vector3(-1, -0.2, -1),
    new THREE.Vector3(1, 2.4, 1),
  );
  const { cast, security } = harness({ colliders: [wall] });
  const guard = cast.guards[0];
  const runtime = security.runtime.get(guard.id);
  const authored = runtime.authoredPosition.clone();
  const restGun = runtime.restGunQuaternion.clone();
  const snapshot = JSON.parse(JSON.stringify(security.snapshot()));
  const record = snapshot.entries.find((entry) => entry.id === guard.id);
  record.position = [0, 0, 0];

  guard.root.position.set(4, 0, 4);
  guard.lastShot = { hit: true };
  guard.lastShotOrigin = new THREE.Vector3(4, 1, 4);
  guard.blocked = true;
  guard.aimAligned = true;
  guard.aimError = 0;
  guard.boreError = 0;
  guard.aimPitch = 0.7;
  guard.weaponModel.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.2);

  security.restore(snapshot);

  assert.deepEqual(guard.root.position.toArray(), authored.toArray(),
    'a contained durable pose did not fall back to the authored post');
  assert.equal(guard.lastShot, null);
  assert.equal(guard.lastShotOrigin, null);
  assert.equal(guard.blocked, false);
  assert.equal(guard.aimAligned, false);
  assert.equal(guard.aimError, Infinity);
  assert.equal(guard.boreError, Infinity);
  assert.equal(guard.aimPitch, 0);
  assert.ok(guard.weaponModel.quaternion.angleTo(restGun) < 1e-9,
    'restore retained a stale model-space aiming quaternion');
});

test('Palace security snapshots canonicalize unsafe live poses before serialization', () => {
  const wall = new THREE.Box3(
    new THREE.Vector3(-1, -0.2, -1),
    new THREE.Vector3(1, 2.4, 1),
  );
  const { cast, security } = harness({ colliders: [wall] });
  const guard = cast.guards[0];
  const runtime = security.runtime.get(guard.id);
  runtime.aim.restore({
    yaw: guard.root.rotation.y,
    desiredYaw: guard.root.rotation.y,
    pitch: 0,
    desiredPitch: 0,
    aimError: null,
    boreError: null,
  }, { root: guard.root });
  guard.root.position.set(0, 0, 0);

  const checkpoint = JSON.parse(JSON.stringify(security.snapshot()));
  const record = checkpoint.entries.find((entry) => entry.id === guard.id);
  assert.deepEqual(record.position, runtime.authoredPosition.toArray(),
    'snapshot serialized a position that restore would reject');

  security.restore(checkpoint);
  assert.deepEqual(JSON.parse(JSON.stringify(security.snapshot())), checkpoint,
    'canonical snapshot changed across an immediate restore');
});
