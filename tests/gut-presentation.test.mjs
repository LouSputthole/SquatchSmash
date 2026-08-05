import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ensureDomShim } from '../tools/three-shim.mjs';

/* The cast builds photographed faces through `THREE.TextureLoader`, which
 * reaches for `document.createElementNS`. See `ensureDomShim`. */
ensureDomShim();

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
  /* Not a primitive check. This used to assert SphereGeometry, which pinned an
   * implementation rather than the thing that matters -- and the smooth
   * ellipsoid was the only round surface on a figure cut from chamfered boxes,
   * so it took one continuous highlight and read as a ball glued to the front
   * of a man. It is a chamfered slab now. What has to stay true is the
   * proportion the old softBox got wrong: broad, not projecting. */
  assert.ok(belly.geometry.type !== 'BoxGeometry', 'the belly is chamfered, not a crate');
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

test('a heavy frame widens the belly without pushing it further forward', () => {
  /* The projection used to be scaled by `t` (0.55 + build * 0.45), so a heavy
   * build was paid twice: once in width, which is correct, and again in reach,
   * which is not. On Big Uncle Lou -- build 1.38, gut 0.42 -- that produced a
   * belly 0.47 across by 0.38 deep by 0.38 tall, which is a beach ball, and
   * under a suit it read as one. A wide man's belly is WIDE. */
  const bellyOf = (build) => {
    const npc = new Npc(new THREE.Scene(), {
      name: `build ${build}`, tier: 'ambient', job: 'stand', x: 0, z: 0, yaw: 0,
      model: { height: 1.8, build, gut: 0.42, dress: 'suit' },
    });
    return gutBounds(npc).getSize(new THREE.Vector3());
  };
  const slim = bellyOf(1.0);
  const heavy = bellyOf(1.38);
  assert.ok(heavy.x > slim.x * 1.05, 'a heavier frame carries a wider belly');
  const widthGain = heavy.x / slim.x;
  const depthGain = heavy.z / slim.z;
  assert.ok(widthGain > 1.05, `build must widen the belly (width gain ${widthGain.toFixed(3)})`);
  // Projection is `gut`'s business alone. Build owns the width and nothing else.
  assert.ok(depthGain <= 1.001,
    `build must not push the belly further forward (depth gain ${depthGain.toFixed(3)})`);
  assert.ok(heavy.x > heavy.z * 1.35, 'the heavy belly is still broader than it is deep');
});
