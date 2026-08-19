import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [{ buildGeometrySceneState }, { collectGeometrySnapshot }] = await Promise.all([
  import('../tools/geometry-scenes.mjs'),
  import('../tools/geometry-collect.mjs'),
]);

const EXPECTED_PARTS = Object.freeze({
  pine: Object.freeze([
    'golf-tree-pine-cone-tier-0',
    'golf-tree-pine-cone-tier-1',
    'golf-tree-pine-cone-tier-2',
    'golf-tree-pine-trunk',
  ]),
  oak: Object.freeze([
    'golf-tree-oak-crown-0',
    'golf-tree-oak-crown-1',
    'golf-tree-oak-crown-2',
    'golf-tree-oak-trunk',
  ]),
});

function sorted(values) {
  return [...values].sort();
}

test('Golf Adapter assigns every tree part and collider to one exact per-tree assembly', async () => {
  // Hole two exercises Course.load(), not only the constructor's initial build.
  const built = await buildGeometrySceneState('golf:hole-two');
  const root = built.roots[0].root;
  const treeMeshes = [];
  root.traverse((object) => {
    if (object?.isInstancedMesh && object.name.startsWith('golf-tree-')) treeMeshes.push(object);
  });

  assert.deepEqual(
    sorted(treeMeshes.map(({ name }) => name)),
    sorted([...EXPECTED_PARTS.pine, ...EXPECTED_PARTS.oak]),
  );
  assert.equal(new Set(treeMeshes.map(({ name }) => name)).size, 8);

  for (const kind of ['pine', 'oak']) {
    const prefix = `golf-tree-${kind}`;
    const parts = treeMeshes.filter(({ name }) => name.startsWith(`${prefix}-`));
    assert.equal(parts.length, 4);
    assert.ok(parts[0].count > 0, `${kind} has no instances`);
    assert.ok(parts.every(({ count }) => count === parts[0].count));
    assert.ok(parts.every((mesh) => (
      mesh.userData.geometryGate.instanceAssemblyPrefix === prefix
    )));
    const trunk = parts.find(({ name }) => name.endsWith('-trunk'));
    const crowns = parts.filter(({ name }) => !name.endsWith('-trunk'));
    assert.equal(trunk.userData.geometryGate.overlap, undefined);
    assert.equal(trunk.userData.geometryGate.checkSupport, false);
    assert.ok(crowns.every((mesh) => mesh.userData.geometryGate.overlap === false));
    assert.ok(crowns.every((mesh) => mesh.userData.geometryGate.checkSupport === undefined));
  }

  const treeCount = treeMeshes
    .filter(({ name }) => name.endsWith('-trunk'))
    .reduce((count, mesh) => count + mesh.count, 0);
  assert.equal(built.metadata.treeCount, treeCount);

  const treeColliders = built.colliders.slice(0, treeCount);
  assert.equal(treeColliders.length, treeCount);
  assert.equal(new Set(treeColliders.map(({ name }) => name)).size, treeCount);
  assert.ok(treeColliders.every(({ name, userData }) => (
    /^golf-tree-(?:pine|oak)-\d+-collider$/.test(name)
    && userData?.geometryGate?.assemblyId === name.slice(0, -'-collider'.length)
  )));

  for (let left = 0; left < treeColliders.length; left++) {
    for (let right = left + 1; right < treeColliders.length; right++) {
      const a = treeColliders[left];
      const b = treeColliders[right];
      const overlapX = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
      const overlapZ = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
      assert.ok(
        overlapX <= 0.03 || overlapZ <= 0.03,
        `${a.name} overlaps ${b.name} by ${overlapX.toFixed(3)}m x ${overlapZ.toFixed(3)}m`,
      );
    }
  }

  const snapshot = collectGeometrySnapshot({
    roots: built.roots,
    colliders: built.colliders,
    THREE: built.THREE,
  });
  const treeItems = snapshot.items.filter(({ name }) => name.startsWith('golf-tree-'));
  const normalizedTreeColliders = snapshot.colliders.filter(({ name }) => (
    name.startsWith('golf-tree-')
  ));
  const treeTrunks = treeItems.filter(({ name }) => name.endsWith('-trunk'));
  for (let left = 0; left < treeTrunks.length; left++) {
    for (let right = left + 1; right < treeTrunks.length; right++) {
      const a = treeTrunks[left];
      const b = treeTrunks[right];
      const overlapX = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
      const overlapZ = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
      assert.ok(
        overlapX <= 0.03 || overlapZ <= 0.03,
        `${a.id} overlaps ${b.id} by ${overlapX.toFixed(3)}m x ${overlapZ.toFixed(3)}m`,
      );
    }
  }
  assert.equal(treeItems.length, treeCount * 4);
  assert.equal(normalizedTreeColliders.length, treeCount);
  for (const item of treeItems) {
    assert.equal(
      item.overlap,
      item.name.endsWith('-trunk') ? undefined : false,
      item.id,
    );
    assert.equal(
      item.checkSupport,
      item.name.endsWith('-trunk') ? false : undefined,
      item.id,
    );
  }

  for (const mesh of treeMeshes) {
    const records = treeItems.filter(({ name }) => name === mesh.name);
    assert.equal(records.length, mesh.count, `${mesh.name} lost instances`);
    assert.deepEqual(
      records.map(({ instanceIndex }) => instanceIndex).sort((a, b) => a - b),
      Array.from({ length: mesh.count }, (_, index) => index),
    );
  }

  const partsByAssembly = new Map();
  for (const item of treeItems) {
    assert.ok(item.assemblyId, `${item.id} has no assembly`);
    const parts = partsByAssembly.get(item.assemblyId) ?? [];
    parts.push(item.name);
    partsByAssembly.set(item.assemblyId, parts);
  }
  assert.equal(partsByAssembly.size, treeCount, 'distinct trees collapsed into shared owners');

  const collidersByAssembly = new Map();
  for (const collider of normalizedTreeColliders) {
    assert.ok(collider.assemblyId, `${collider.id} has no assembly`);
    const colliders = collidersByAssembly.get(collider.assemblyId) ?? [];
    colliders.push(collider);
    collidersByAssembly.set(collider.assemblyId, colliders);
  }

  for (const [assemblyId, partNames] of partsByAssembly) {
    const kind = assemblyId.includes('golf-tree-pine-') ? 'pine' : 'oak';
    assert.deepEqual(sorted(partNames), sorted(EXPECTED_PARTS[kind]), assemblyId);
    assert.equal(collidersByAssembly.get(assemblyId)?.length, 1, assemblyId);
  }

  const pineZero = [...partsByAssembly.keys()].find((id) => id.endsWith('golf-tree-pine-0'));
  const oakZero = [...partsByAssembly.keys()].find((id) => id.endsWith('golf-tree-oak-0'));
  assert.ok(pineZero && oakZero);
  assert.notEqual(pineZero, oakZero, 'per-kind prefixes must keep equal indices distinct');

  const grass = root.getObjectByName('golf-grass-detail');
  assert.ok(grass?.isInstancedMesh);
  assert.equal(grass.userData.geometryGate.checkSupport, false);

  for (const name of [
    'flag',
    'hole-marker',
    'next-tee-hint',
    'course-side-cooler',
    'tee-marker-left',
    'tee-marker-right',
  ]) {
    const object = root.getObjectByName(name);
    assert.ok(object, `missing planted Golf object ${name}`);
    assert.equal(
      object.userData.geometryGate.checkSupport,
      false,
      `${name} must use its authored heightAt planting instead of global terrain AABB support`,
    );
  }
});
