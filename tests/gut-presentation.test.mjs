import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { Npc } from '../src/bing/cast.js';

function gutBounds(npc) {
  npc.group.updateMatrixWorld(true);
  const belly = npc.group.getObjectByName('person.gut.belly');
  return belly ? new THREE.Box3().setFromObject(belly) : null;
}

function armGutIntersections(npc) {
  const gut = gutBounds(npc);
  if (!gut) return ['missing belly'];
  const intersections = [];
  for (const [side, arm] of [['left', npc.parts.armL], ['right', npc.parts.armR]]) {
    arm.traverse((node) => {
      if (node.isMesh && new THREE.Box3().setFromObject(node).intersectsBox(gut)) {
        intersections.push(`${side}:${node.name || node.geometry.type}`);
      }
    });
  }
  return intersections;
}

test('the shared gut is round and keeps gutted character poses outside the belly', () => {
  const npc = new Npc(new THREE.Scene(), {
    name: 'belly regression', tier: 'ambient', job: 'sit', x: 0, z: 0, yaw: 0,
    model: { height: 1.7, build: 1.1, gut: 1, dress: 'shirt' },
  });
  const belly = npc.group.getObjectByName('person.gut.belly');
  assert.ok(belly);
  assert.equal(belly.geometry.type, 'SphereGeometry');
  const size = gutBounds(npc).getSize(new THREE.Vector3());
  assert.ok(size.x > size.z * 1.2, 'the belly is wider than it projects forward');
  assert.ok(size.y >= size.z * 0.9, 'the belly stays vertically round');

  assert.deepEqual(armGutIntersections(npc), [], 'seated arms clear the belly');
  for (let i = 0; i < 120; i++) {
    npc.update(1 / 20, null);
    assert.deepEqual(armGutIntersections(npc), [], `seated idle frame ${i} clears the belly`);
  }

  npc.job = 'stand';
  npc.folded = false;
  npc._syncJob(true);
  for (let i = 0; i < 5; i++) npc.update(1 / 20, null);
  assert.deepEqual(armGutIntersections(npc), [], 'standing arms clear the belly');

  npc.folded = true;
  npc._syncJob(true);
  for (let i = 0; i < 5; i++) npc.update(1 / 20, null);
  assert.deepEqual(armGutIntersections(npc), [], 'folded arms clear the belly');
});
