import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import {
  SquatchfatherCombatAdapter,
  squatchfatherBodyAnchor,
} from '../src/squatchfather/combat.js';

ensureThreeShim();
ensureDomShim();

const {
  BLOOD_MARK_NAME,
  BLOOD_POOL_NAME,
  BLOOD_SPATTER_NAME,
  BloodImpactSystem,
  DeathBloodPool,
} = await import('../src/world/blood.js');
const { BulletHoles } = await import('../src/world/bullets.js');

function makeCamera(scene) {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 100);
  scene.add(camera);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function makeTarget(scene, id, z) {
  const actor = { id };
  const root = new THREE.Group();
  root.name = `target.${id}`;
  root.position.z = z;
  const anchor = new THREE.Group();
  anchor.name = `target.${id}.anchor`;
  root.add(anchor);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  anchor.add(body);
  scene.add(root);
  scene.updateMatrixWorld(true);
  return { actor, root, anchor, body };
}

test('an ordered shot accepts the intended registered figure at the exact center-ray contact', () => {
  const scene = new THREE.Scene();
  const camera = makeCamera(scene);
  const sal = makeTarget(scene, 'sal', -5);
  const adapter = new SquatchfatherCombatAdapter({
    camera,
    hitTargets: () => scene.children,
  });
  adapter.registerTarget('sal', {
    actor: sal.actor,
    root: sal.root,
    anchorOf: () => sal.anchor,
    spatterAnchorOf: () => sal.anchor,
  });

  const shot = adapter.resolve('sal');

  assert.equal(shot.outcome, 'intended');
  assert.equal(shot.targetId, 'sal');
  assert.equal(shot.actor, sal.actor);
  assert.equal(shot.object, sal.body);
  assert.equal(shot.anchor, sal.anchor);
  assert.ok(Math.abs(shot.point.z + 4.5) < 1e-9,
    `expected the box surface at z=-4.5, got ${shot.point.z}`);
  assert.deepEqual(shot.origin.toArray(), [0, 0, 0]);
  assert.deepEqual(shot.direction.toArray(), [0, 0, -1]);
});

test('a nearer restaurant surface blocks the ordered figure', () => {
  const scene = new THREE.Scene();
  const camera = makeCamera(scene);
  const sal = makeTarget(scene, 'sal', -5);
  const blocker = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.5, 0.5),
    new THREE.MeshBasicMaterial(),
  );
  blocker.name = 'restaurant.partition';
  blocker.position.z = -2;
  scene.add(blocker);
  scene.updateMatrixWorld(true);

  const adapter = new SquatchfatherCombatAdapter({
    camera,
    hitTargets: () => scene.children,
  });
  adapter.registerTarget('sal', {
    actor: sal.actor,
    root: sal.root,
    anchorOf: () => sal.anchor,
    spatterAnchorOf: () => sal.anchor,
  });

  const shot = adapter.resolve('sal');

  assert.equal(shot.outcome, 'blocked');
  assert.equal(shot.object, blocker);
  assert.equal(shot.targetId, null);
  assert.equal(shot.actor, null);
  assert.ok(Math.abs(shot.point.z + 1.75) < 1e-9,
    `expected the near blocker surface at z=-1.75, got ${shot.point.z}`);
});

test('an empty center ray is a miss with no fabricated evidence', () => {
  const scene = new THREE.Scene();
  const camera = makeCamera(scene);
  const surfaceImpacts = new BulletHoles(scene, 'hole', { random: () => 0.5 });
  const bloodImpacts = new BloodImpactSystem(scene, { random: () => 0.5 });
  const deathBloodPools = new DeathBloodPool(scene, { capacity: 2, random: () => 0.5 });
  const adapter = new SquatchfatherCombatAdapter({
    camera,
    hitTargets: () => scene.children,
    surfaceImpacts,
    bloodImpacts,
    deathBloodPools,
  });

  const shot = adapter.resolve('sal');
  adapter.present(shot, { fatal: true });

  assert.equal(shot.outcome, 'miss');
  assert.equal(shot.object, null);
  assert.equal(shot.point, null);
  assert.equal(shot.normal, null);
  assert.equal(shot.actor, null);
  assert.equal(shot.distance, Infinity);
  assert.equal(surfaceImpacts.visibleCount, 0);
  assert.equal(bloodImpacts.wounds.visibleCount, 0);
  assert.equal(bloodImpacts.spatter.visibleCount, 0);
  assert.equal(deathBloodPools.visibleCount, 0);
});

test('the other registered wiseguy is a wrong target and cannot satisfy the order', () => {
  const scene = new THREE.Scene();
  const camera = makeCamera(scene);
  const sal = makeTarget(scene, 'sal', -5);
  sal.root.position.x = 3;
  const mcclawsky = makeTarget(scene, 'mcclawsky', -4);
  scene.updateMatrixWorld(true);
  let killCalls = 0;
  mcclawsky.actor.kill = () => { killCalls += 1; };

  const adapter = new SquatchfatherCombatAdapter({
    camera,
    hitTargets: () => scene.children,
  });
  for (const [id, target] of [['sal', sal], ['mcclawsky', mcclawsky]]) {
    adapter.registerTarget(id, {
      actor: target.actor,
      root: target.root,
      anchorOf: () => target.anchor,
      spatterAnchorOf: () => target.anchor,
    });
  }

  const shot = adapter.resolve('sal');

  assert.equal(shot.outcome, 'wrong-target');
  assert.equal(shot.targetId, 'mcclawsky');
  assert.equal(shot.actor, mcclawsky.actor);
  assert.equal(shot.object, mcclawsky.body);
  assert.equal(killCalls, 0, 'resolving a shot invoked a controller side effect');
});

test('a fatal intended hit uses the exact contact and canonical shared-blood metadata', () => {
  const scene = new THREE.Scene();
  const camera = makeCamera(scene);
  const sal = makeTarget(scene, 'sal', -5);
  const bloodImpacts = new BloodImpactSystem(scene, { random: () => 0.5 });
  const deathBloodPools = new DeathBloodPool(scene, {
    capacity: 2,
    random: () => 0.5,
  });
  const adapter = new SquatchfatherCombatAdapter({
    camera,
    hitTargets: () => scene.children,
    bloodImpacts,
    deathBloodPools,
    floorY: () => 0.1,
  });
  adapter.registerTarget('sal', {
    actor: sal.actor,
    root: sal.root,
    anchorOf: () => sal.anchor,
    spatterAnchorOf: () => sal.anchor,
  });
  const shot = adapter.resolve('sal');

  adapter.present(shot, { fatal: true });
  scene.updateMatrixWorld(true);

  const wound = bloodImpacts.wounds.pool.find((mark) => mark.visible);
  const spatter = bloodImpacts.spatter.pool.find((mark) => mark.visible);
  const pool = deathBloodPools.meshes.find((mark) => mark.visible);
  assert.ok(wound, 'the accepted hit left no wound');
  assert.ok(spatter, 'the accepted hit left no spatter');
  assert.ok(pool, 'the fatal hit left no death pool');
  assert.equal(wound.name, BLOOD_MARK_NAME);
  assert.equal(wound.userData.reusableSystem, 'blood');
  assert.equal(wound.userData.bloodEffect, 'impact');
  assert.equal(wound.userData.hitOwner, sal.actor);
  assert.equal(wound.parent, sal.anchor);
  assert.ok(wound.getWorldPosition(new THREE.Vector3()).distanceTo(shot.point) < 0.006,
    'the wound drifted from the exact ray contact');
  assert.equal(spatter.name, BLOOD_SPATTER_NAME);
  assert.equal(spatter.userData.reusableSystem, 'blood');
  assert.equal(spatter.userData.bloodEffect, 'spatter');
  assert.equal(spatter.userData.hitOwner, sal.actor);
  assert.equal(pool.name, `${BLOOD_POOL_NAME}.01`);
  assert.equal(pool.userData.reusableSystem, 'blood');
  assert.equal(pool.userData.bloodEffect, 'death-pool');
  assert.equal(pool.position.x, shot.point.x);
  assert.equal(pool.position.z, shot.point.z);
  assert.ok(Math.abs(pool.position.y - 0.106) < 1e-9,
    `expected the pool on floor y=0.1, got ${pool.position.y}`);
});

test('an arm contact stays on its nearest safe joint while that limb moves', () => {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  const torso = new THREE.Group();
  const shoulder = new THREE.Group();
  const elbow = new THREE.Group();
  const hand = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.MeshBasicMaterial(),
  );
  group.add(root);
  root.add(pelvis);
  pelvis.add(torso);
  torso.add(shoulder);
  shoulder.position.set(0.45, 0.55, 0);
  shoulder.add(elbow);
  elbow.position.set(0, -0.35, 0);
  elbow.add(hand);
  hand.position.set(0, -0.28, 0.04);
  scene.add(group);
  scene.updateMatrixWorld(true);

  const controller = {
    group,
    fig: {
      group,
      root,
      pelvis,
      torso,
      armL: { shoulder, elbow },
      armR: {},
      legL: {},
      legR: {},
    },
  };
  const anchor = squatchfatherBodyAnchor(controller, hand);
  assert.equal(anchor, elbow, 'the arm hit fell back to the torso');

  const point = hand.localToWorld(new THREE.Vector3(0, 0, 0.1));
  const bloodImpacts = new BloodImpactSystem(scene, { random: () => 0.5 });
  const { wound } = bloodImpacts.hit({
    actor: controller,
    anchor,
    point,
    normal: new THREE.Vector3(0, 0, 1),
    spatter: false,
  });
  scene.updateMatrixWorld(true);
  const localWound = anchor.worldToLocal(wound.getWorldPosition(new THREE.Vector3()));

  elbow.rotation.x = -1.1;
  shoulder.rotation.z = 0.45;
  scene.updateMatrixWorld(true);

  const expected = anchor.localToWorld(localWound.clone());
  assert.ok(wound.getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 1e-9,
    'the exact arm wound drifted when its elbow and shoulder moved');
});

test('a blocked shot leaves one surface hole and no blood evidence', () => {
  const scene = new THREE.Scene();
  const camera = makeCamera(scene);
  const blocker = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.5, 0.5),
    new THREE.MeshBasicMaterial(),
  );
  blocker.position.z = -2;
  scene.add(blocker);
  const surfaceImpacts = new BulletHoles(scene, 'hole', { random: () => 0.5 });
  const bloodImpacts = new BloodImpactSystem(scene, { random: () => 0.5 });
  const deathBloodPools = new DeathBloodPool(scene, { capacity: 2, random: () => 0.5 });
  scene.updateMatrixWorld(true);
  const adapter = new SquatchfatherCombatAdapter({
    camera,
    hitTargets: () => scene.children,
    surfaceImpacts,
    bloodImpacts,
    deathBloodPools,
  });
  const shot = adapter.resolve('sal');
  assert.equal(shot.outcome, 'blocked');

  adapter.present(shot, { fatal: true });

  assert.equal(surfaceImpacts.pool.filter((mark) => mark.visible).length, 1);
  assert.equal(bloodImpacts.wounds.pool.filter((mark) => mark.visible).length, 0);
  assert.equal(bloodImpacts.spatter.pool.filter((mark) => mark.visible).length, 0);
  assert.equal(deathBloodPools.visibleCount, 0);
});

test('a wrong target receives a nonfatal shared wound but never a death pool', () => {
  const scene = new THREE.Scene();
  const camera = makeCamera(scene);
  const sal = makeTarget(scene, 'sal', -5);
  sal.root.position.x = 3;
  const mcclawsky = makeTarget(scene, 'mcclawsky', -4);
  const bloodImpacts = new BloodImpactSystem(scene, { random: () => 0.5 });
  const deathBloodPools = new DeathBloodPool(scene, { capacity: 2, random: () => 0.5 });
  scene.updateMatrixWorld(true);
  const adapter = new SquatchfatherCombatAdapter({
    camera,
    hitTargets: () => scene.children,
    bloodImpacts,
    deathBloodPools,
    floorY: () => 0,
  });
  for (const [id, target] of [['sal', sal], ['mcclawsky', mcclawsky]]) {
    adapter.registerTarget(id, {
      actor: target.actor,
      root: target.root,
      anchorOf: () => target.anchor,
      spatterAnchorOf: () => target.anchor,
    });
  }
  const shot = adapter.resolve('sal');
  assert.equal(shot.outcome, 'wrong-target');

  adapter.present(shot, { fatal: true });

  assert.equal(bloodImpacts.marksOn(mcclawsky.actor), 2);
  assert.equal(bloodImpacts.marksOn(sal.actor), 0);
  assert.equal(deathBloodPools.visibleCount, 0,
    'the wrong target was presented as a fatal ordered hit');
});

test('existing impact evidence cannot become the next shot blocker', () => {
  const scene = new THREE.Scene();
  const camera = makeCamera(scene);
  const sal = makeTarget(scene, 'sal', -5);
  const surfaceImpacts = new BulletHoles(scene, 'hole', { random: () => 0.5 });
  surfaceImpacts.punch(
    new THREE.Vector3(0, 0, -2),
    new THREE.Vector3(0, 0, 1),
  );
  scene.updateMatrixWorld(true);
  const adapter = new SquatchfatherCombatAdapter({
    camera,
    hitTargets: () => scene.children,
    surfaceImpacts,
  });
  adapter.registerTarget('sal', {
    actor: sal.actor,
    root: sal.root,
    anchorOf: () => sal.anchor,
    spatterAnchorOf: () => sal.anchor,
  });

  const shot = adapter.resolve('sal');

  assert.equal(shot.outcome, 'intended');
  assert.equal(shot.object, sal.body);
});

test('the adapter updates, resets, and exposes every shared-blood pool for prewarm', () => {
  const scene = new THREE.Scene();
  const camera = makeCamera(scene);
  const sal = makeTarget(scene, 'sal', -5);
  const bloodImpacts = new BloodImpactSystem(scene, { random: () => 0.5 });
  const deathBloodPools = new DeathBloodPool(scene, {
    capacity: 2,
    growthSeconds: 1,
    random: () => 0.5,
  });
  const adapter = new SquatchfatherCombatAdapter({
    camera,
    hitTargets: () => scene.children,
    bloodImpacts,
    deathBloodPools,
    floorY: () => 0,
  });
  adapter.registerTarget('sal', {
    actor: sal.actor,
    root: sal.root,
    anchorOf: () => sal.anchor,
    spatterAnchorOf: () => sal.anchor,
  });
  adapter.present(adapter.resolve('sal'), { fatal: true });
  const pool = deathBloodPools.meshes.find((mark) => mark.visible);
  assert.equal(pool.material.opacity, 0);

  adapter.update(0.5);

  assert.ok(pool.material.opacity > 0, 'the death pool growth clock was never advanced');
  assert.deepEqual(
    new Set(adapter.prewarmObjects),
    new Set([
      ...bloodImpacts.wounds.pool,
      ...bloodImpacts.spatter.pool,
      ...deathBloodPools.meshes,
    ]),
  );

  adapter.reset();

  assert.equal(bloodImpacts.wounds.visibleCount, 0);
  assert.equal(bloodImpacts.spatter.visibleCount, 0);
  assert.equal(deathBloodPools.visibleCount, 0);
});
