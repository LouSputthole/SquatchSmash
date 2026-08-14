import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();

const THREE = await import('three');
const { CombatImpairments } = await import('../src/core/combat/impairments.js');
const { CombatWeaponAim } = await import('../src/core/combat/aim.js');

test('resolved arm and leg hits produce bounded tactical impairments that recover honestly', () => {
  const impairments = new CombatImpairments();

  assert.equal(impairments.applyResolvedHit({
    zone: 'chest', part: 'leg', result: { applied: true, damage: 8 },
  }), true);
  assert.equal(impairments.stagger, 0.42);
  assert.ok(impairments.legWound > 0);
  assert.ok(impairments.speedScale < 1);
  assert.equal(impairments.accuracyScale, 1);

  impairments.applyResolvedHit({
    zone: 'limb', part: 'arm', result: { applied: true, damage: 8 },
  });
  assert.ok(impairments.armWound > 0);
  assert.ok(impairments.accuracyScale < 1);
  assert.ok(impairments.aimSettleScale < 1);
  assert.equal(impairments.interrupted, true);
  assert.ok(impairments.reaction > 0 && impairments.reaction <= 1);

  impairments.update(0.42);
  assert.equal(impairments.stagger, 0);
  assert.equal(impairments.interrupted, false);
  assert.ok(impairments.legWound > 0, 'a transient stagger cleared the durable leg wound');
  assert.ok(impairments.armWound > 0, 'a transient stagger cleared the durable arm wound');
});

test('impairment snapshots survive a JSON checkpoint and restore exact combat scales', () => {
  const original = new CombatImpairments();
  original.applyResolvedHit({
    zone: 'chest', part: 'leg', result: { applied: true, damage: 24 },
  });
  original.applyResolvedHit({
    zone: 'limb', part: 'arm', result: { applied: true, damage: 18 },
  });
  original.update(0.1);
  const checkpoint = JSON.parse(JSON.stringify(original.snapshot()));

  const restored = new CombatImpairments();
  restored.restore(checkpoint);
  assert.deepEqual(restored.snapshot(), checkpoint);
  assert.equal(restored.speedScale, original.speedScale);
  assert.equal(restored.accuracyScale, original.accuracyScale);
  assert.equal(restored.aimSettleScale, original.aimSettleScale);

  restored.reset();
  assert.deepEqual(restored.snapshot(), { stagger: 0, armWound: 0, legWound: 0 });
});

test('weapon aim turns the body, poses it, then aligns the catalog muzzle and bore', () => {
  const root = new THREE.Group();
  root.rotation.y = Math.PI;
  const gun = new THREE.Group();
  gun.userData.muzzle = new THREE.Vector3(0, 0, -0.8);
  root.add(gun);
  const targetPoint = new THREE.Vector3(0, 4, 10);
  const weaponController = {
    aimed: false,
    setAimed(value) { this.aimed = value; },
  };
  const aim = new CombatWeaponAim();
  let poseCalls = 0;
  let frame = null;

  for (let i = 0; i < 240 && !frame?.aligned; i++) {
    frame = aim.update(1 / 60, {
      root,
      weaponModel: gun,
      weaponController,
      targetPoint,
      muzzleHeight: 1.35,
      pose: (bodyFrame) => {
        poseCalls++;
        assert.equal(bodyFrame.pitch, aim.pitch,
          'the body pose ran before the shared pitch state was updated');
        gun.position.y = 1.35;
      },
    });
  }

  assert.ok(poseCalls > 1);
  assert.ok(frame?.aligned, 'the visible weapon never reached the firing gate');
  assert.equal(weaponController.aimed, true);
  assert.ok(Math.abs(root.rotation.y) <= aim.tolerance,
    `root crossed the firing gate at yaw ${root.rotation.y}`);
  assert.ok(frame.pitch > 0.05, 'an elevated target did not change aim pitch');
  assert.ok(frame.aimError <= aim.tolerance);
  assert.ok(frame.boreError <= aim.tolerance);
  const renderedMuzzle = gun.localToWorld(gun.userData.muzzle.clone());
  assert.ok(frame.origin.distanceTo(renderedMuzzle) <= 1e-9,
    'the shot origin was sampled before the pose callback moved the gun');
  const renderedBore = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(gun.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
  assert.ok(frame.direction.angleTo(renderedBore) <= 1e-9);
});

test('an interruption visibly breaks the alignment gate and aim can recover afterward', () => {
  const root = new THREE.Group();
  const gun = new THREE.Group();
  gun.position.y = 1.35;
  gun.userData.muzzle = new THREE.Vector3(0, 0, -0.6);
  root.add(gun);
  const targetPoint = new THREE.Vector3(0, 1.35, 10);
  const weaponController = {
    aimed: false,
    setAimed(value) { this.aimed = value; },
  };
  const aim = new CombatWeaponAim();
  let frame = null;
  for (let i = 0; i < 180 && !frame?.aligned; i++) {
    frame = aim.update(1 / 60, {
      root, weaponModel: gun, weaponController, targetPoint, muzzleHeight: 1.35,
    });
  }
  assert.equal(frame?.aligned, true, 'the setup shot never aligned');

  frame = aim.update(1 / 60, {
    root,
    weaponModel: gun,
    weaponController,
    targetPoint,
    muzzleHeight: 1.35,
    interrupted: true,
    pose: () => gun.quaternion.identity(),
  });
  assert.equal(frame.interrupted, true);
  assert.equal(frame.aligned, false);
  assert.equal(weaponController.aimed, false);
  assert.ok(frame.boreError > aim.tolerance,
    'the bore was silently re-steered after the interruption pose');

  for (let i = 0; i < 180 && !frame.aligned; i++) {
    frame = aim.update(1 / 60, {
      root, weaponModel: gun, weaponController, targetPoint, muzzleHeight: 1.35,
    });
  }
  assert.equal(frame.aligned, true, 'the weapon did not recover after interruption');
  assert.equal(weaponController.aimed, true);
});

test('aim frames own their world vectors instead of leaking mutable scratch state', () => {
  const root = new THREE.Group();
  const gun = new THREE.Group();
  gun.position.y = 1.2;
  gun.userData.muzzle = new THREE.Vector3(0, 0, -0.5);
  root.add(gun);
  const aim = new CombatWeaponAim();
  const targetPoint = new THREE.Vector3(0, 2, 8);
  const first = aim.update(1 / 60, {
    root, weaponModel: gun, targetPoint, muzzleHeight: 1.2,
  });
  const firstValues = {
    origin: first.origin.toArray(),
    direction: first.direction.toArray(),
    targetPoint: first.targetPoint.toArray(),
  };

  targetPoint.set(5, 5, 12);
  const second = aim.update(1 / 60, {
    root, weaponModel: gun, targetPoint, muzzleHeight: 1.2,
  });
  assert.notEqual(first.origin, second.origin);
  assert.notEqual(first.direction, second.direction);
  assert.notEqual(first.targetPoint, second.targetPoint);
  assert.deepEqual(first.origin.toArray(), firstValues.origin);
  assert.deepEqual(first.direction.toArray(), firstValues.direction);
  assert.deepEqual(first.targetPoint.toArray(), firstValues.targetPoint);
});

test('a steered weapon keeps its sights up — roll is a decision, not a remainder', () => {
  /* Owner, playtest 2026-08-13: "all the main characters are holding their
   * guns upsidedown". The mount in Mansion Siege parents the model under a
   * raised forearm, and `setFromUnitVectors`' shortest arc from the bore to
   * the aim landed the model's +Y (sights, rib, top strap) pointing at the
   * floor for exactly that parent frame. This is that frame, in miniature:
   * root -> raised arm -> forearm -> gun, the same chain both siege adapters
   * build, with the arm angles the braced pose uses. */
  const root = new THREE.Group();
  root.rotation.y = 0.4;
  const arm = new THREE.Group();
  arm.rotation.set(-1.26, 0, 0.15);
  const fore = new THREE.Group();
  fore.rotation.set(-0.18, 0, 0);
  fore.position.y = -0.28;
  arm.position.y = 1.45;
  root.add(arm);
  arm.add(fore);
  const gun = new THREE.Group();
  /* The siege mount: bore down the forearm, rolled so the sights face the
   * back of the hand. See src/mansion/siege/armed-pose.js. */
  gun.rotation.set(-Math.PI / 2, 0, Math.PI);
  gun.userData.muzzle = new THREE.Vector3(0, 0, -0.6);
  fore.add(gun);

  const aim = new CombatWeaponAim();
  const targetPoint = new THREE.Vector3(2, 1.35, 10);
  let frame = null;
  for (let i = 0; i < 240 && !frame?.aligned; i++) {
    frame = aim.update(1 / 60, {
      root, weaponModel: gun, targetPoint, muzzleHeight: 1.35,
    });
  }
  assert.equal(frame?.aligned, true, 'the weapon never aligned in the siege frame');

  root.updateMatrixWorld(true);
  const worldUp = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(gun.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(worldUp.y > 0.5,
    `sights are not up: the steered weapon's world up-vector is ${worldUp.y.toFixed(3)}`);
  /* And the fix did not buy the roll by bending the bore: the shot contract
   * is untouched. */
  assert.ok(frame.boreError <= aim.tolerance);
});

test('aim snapshots restore yaw and pitch but never grant stale firing alignment', () => {
  const root = new THREE.Group();
  root.rotation.y = 1.7;
  const gun = new THREE.Group();
  gun.position.y = 1.3;
  gun.userData.muzzle = new THREE.Vector3(0, 0, -0.7);
  root.add(gun);
  const aim = new CombatWeaponAim();
  const targetPoint = new THREE.Vector3(-3, 4, 10);
  for (let i = 0; i < 12; i++) {
    aim.update(1 / 60, {
      root, weaponModel: gun, targetPoint, muzzleHeight: 1.3,
    });
  }
  const checkpoint = JSON.parse(JSON.stringify(aim.snapshot()));

  const restoredRoot = new THREE.Group();
  const controller = {
    aimed: true,
    setAimed(value) { this.aimed = value; },
  };
  const restored = new CombatWeaponAim();
  restored.restore(checkpoint, { root: restoredRoot, weaponController: controller });
  assert.deepEqual(restored.snapshot(), checkpoint);
  assert.equal(restoredRoot.rotation.y, checkpoint.yaw);
  assert.equal(restored.aligned, false);
  assert.equal(controller.aimed, false);

  const empty = JSON.parse(JSON.stringify(new CombatWeaponAim().snapshot()));
  assert.equal(empty.aimError, null);
  assert.equal(empty.boreError, null);
});
