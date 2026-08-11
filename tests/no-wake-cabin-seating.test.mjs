import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { buildNoWakeWorld } = await import('../src/nowake/world.js');
const {
  CABIN,
  CABIN_COLLIDERS,
  CABIN_CONCAVE_FIXTURE_CHANNELS,
  CABIN_CAST_STAGING,
  CAPSULE_RADIUS,
  cabinColliderBoxes,
  deckPenetration,
  narrowChannels,
} = await import('../src/nowake/deck-collision.js');

function poseAtMark(npc, mark) {
  npc.group.position.set(mark.x, mark.baseY, mark.z);
  npc.group.rotation.set(0, mark.yaw, 0);
  npc.baseY = mark.baseY;
  npc.job = mark.job;
  npc._syncJob(true);
}

function isShown(object) {
  for (let node = object; node; node = node.parent) {
    if (node.visible === false) return false;
  }
  const materials = (Array.isArray(object.material) ? object.material : [object.material])
    .filter(Boolean);
  return materials.length === 0 || materials.some((material) => (
    material.visible !== false && (material.opacity ?? 1) > 0.01
  ));
}

function visibleMeshBoxes(group) {
  const meshes = [];
  group.traverse((object) => {
    if (object.isMesh && isShown(object)) {
      meshes.push({ object, box: new THREE.Box3().setFromObject(object) });
    }
  });
  return meshes;
}

function positiveVolumeContacts(a, b, epsilon = 1e-6) {
  const contacts = [];
  for (const left of visibleMeshBoxes(a)) {
    for (const right of visibleMeshBoxes(b)) {
      const overlap = left.box.clone().intersect(right.box);
      if (overlap.isEmpty()) continue;
      const size = overlap.getSize(new THREE.Vector3());
      if (size.x <= epsilon || size.y <= epsilon || size.z <= epsilon) continue;
      contacts.push({
        a: left.object.name || '(unnamed mesh)',
        b: right.object.name || '(unnamed mesh)',
        size: size.toArray().map((value) => Number(value.toFixed(6))),
      });
    }
  }
  return contacts;
}

test('Willy sits forward on the aft return without touching Uncle Lou', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const { boat } = world;
  poseAtMark(boat.cast.lou, CABIN_CAST_STAGING.lou);
  poseAtMark(boat.cast.willy, CABIN_CAST_STAGING.willySeat);
  boat.root.updateMatrixWorld(true);

  assert.equal(CABIN_CAST_STAGING.willySeat.x, 1.20);
  assert.equal(CABIN_CAST_STAGING.willySeat.z, -3.05);
  assert.equal(CABIN_CAST_STAGING.willySeat.yaw, Math.PI);
  assert.equal(boat.cast.willy.baseY, CABIN_CAST_STAGING.willySeat.baseY);
  assert.deepEqual(
    positiveVolumeContacts(boat.cast.willy.group, boat.cast.lou.group),
    [],
    'Willy and Uncle Lou still occupy the same visible space',
  );

  const hips = new THREE.Box3().setFromObject(boat.cast.willy.group.getObjectByName('hips'));
  const support = new THREE.Box3().setFromObject(
    boat.cabin.group.getObjectByName('dinette booth cushion · aft return'),
  );
  assert.ok(hips.min.x >= support.min.x && hips.max.x <= support.max.x,
    `Willy's hips are not fully over the aft return in X: ${JSON.stringify({ hips, support })}`);
  assert.ok(hips.min.z >= support.min.z && hips.max.z <= support.max.z,
    `Willy's hips are not fully over the aft return in Z: ${JSON.stringify({ hips, support })}`);
  const supportGap = hips.min.y - support.max.y;
  assert.ok(supportGap >= -1e-6 && supportGap <= 0.025,
    `Willy's hips hover ${supportGap.toFixed(6)} m above the aft return`);
});

test('Willy has a real legwell instead of intersecting the booth or table', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const { boat } = world;
  poseAtMark(boat.cast.willy, CABIN_CAST_STAGING.willySeat);
  boat.root.updateMatrixWorld(true);

  const dinette = boat.cabin.group.getObjectByName('curved dinette');
  const contacts = positiveVolumeContacts(boat.cast.willy.group, dinette)
    .filter((contact) => !/aft return/.test(contact.b));
  assert.deepEqual(contacts, [],
    'non-support booth/table geometry still passes through seated Willy');
});

test('the notched visible dinette and its player colliders are the same layout', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const { boat } = world;
  boat.root.updateMatrixWorld(true);
  const boatInverse = boat.root.matrixWorld.clone().invert();
  const colliderByName = new Map(CABIN_COLLIDERS.map((entry) => [entry.name, entry]));
  const layouts = [
    ['cabin · dinette booth · outboard spine', [
      'dinette booth base · outboard spine',
      'dinette booth cushion · outboard spine',
    ]],
    ['cabin · dinette booth · forward inboard remnant', [
      'dinette booth base · forward inboard remnant',
      'dinette booth cushion · forward inboard remnant',
    ]],
    ['cabin · dinette booth · forward return', [
      'dinette booth base · forward return',
      'dinette booth cushion · forward return',
    ]],
    ['cabin · dinette booth · aft return support', [
      'dinette booth base · aft return',
      'dinette booth cushion · aft return',
    ]],
    ['cabin · dinette booth backrest', ['dinette booth back rest']],
    ['cabin · dinette table pedestal', ['dinette table pedestal']],
    ['cabin · dinette table top', ['dinette table top']],
  ];

  for (const [colliderName, meshNames] of layouts) {
    const collider = colliderByName.get(colliderName);
    assert.ok(collider, `missing player collider ${colliderName}`);
    const visible = new THREE.Box3();
    visible.makeEmpty();
    for (const meshName of meshNames) {
      const object = boat.cabin.group.getObjectByName(meshName);
      assert.ok(object, `missing visible cabin mesh ${meshName}`);
      visible.union(new THREE.Box3().setFromObject(object).applyMatrix4(boatInverse));
    }
    const actual = [...collider.min, ...collider.max];
    const expected = [...visible.min.toArray(), ...visible.max.toArray()];
    assert.ok(actual.every((value, index) => Math.abs(value - expected[index]) <= 1e-6),
      `${colliderName} does not match its visible geometry: ${JSON.stringify({ actual, expected })}`);
  }

  assert.deepEqual(
    narrowChannels(CABIN_COLLIDERS),
    CABIN_CONCAVE_FIXTURE_CHANNELS.map(({ reason: _reason, ...channel }) => channel),
    'the dinette reblock created an unclassified player-width squeeze',
  );
  const boxes = cabinColliderBoxes();
  for (let z = -4.75; z <= -2.50; z += 0.05) {
    const penetration = deckPenetration(
      boxes, 0, z, CAPSULE_RADIUS, CABIN.height + 1.66, 1.66,
    );
    assert.ok(penetration.depth <= 1e-6,
      `the cabin centre route hits ${penetration.name} by ${penetration.depth.toFixed(6)} m at z ${z.toFixed(2)}`);
  }
});
