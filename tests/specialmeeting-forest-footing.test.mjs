/**
 * THE FOREST FLOOR, MEASURED.
 *
 * The geometry gate cannot check this scene's footing and says so. Its support
 * test asks whether some solid's TOP sits under an object's BOTTOM, and the
 * forest floor is a displaced heightfield drawn in 48 m chunks: one chunk's
 * axis-aligned box has fifteen metres of relief in it and swallows everything
 * standing on it, so no tree is ever "above" the ground it is planted in. The
 * gate reported four hundred and fifty-six floating objects for that, none of
 * them off the floor, and the annotations in src/specialmeeting/forest/** that
 * silenced it are honest only if something else does the checking.
 *
 * This is that something else, and it is a better check than the one it
 * replaces: instead of asking whether a box is over another box, it asks the
 * terrain directly what its height is at the exact point each object stands,
 * and compares. A tree that came adrift by ten centimetres fails here and
 * would not have failed the gate even when the gate was looking.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';

import { scatterChunk } from '../src/specialmeeting/forest/foliage.js';
import { heightAt, landSlopeAt, CLEARING } from '../src/specialmeeting/forest/field.js';

/* The chunks the drive actually streams around the spur. Four of them, on the
 * grid the terrain streamer uses (48 m, indexed from the origin), covering the
 * clearing and the last stretch of road into it. */
const CHUNK = 48;
const CHUNKS = Object.freeze([
  { cx: 2, cz: -3 }, { cx: 3, cz: -3 }, { cx: 3, cz: -4 }, { cx: 1, cz: -4 },
]);

/**
 * How far below true ground `seatedHeight` beds a thing in.
 *
 * `foliage.js` sinks everything by `min(2, landSlopeAt) * 0.22` so a trunk on
 * a bank does not hang over the terrain mesh's chord. That is deliberate, so
 * the tolerance has to allow for it exactly rather than being widened until
 * the test stops complaining.
 */
function seatedTolerance(x, z) {
  return Math.min(2, landSlopeAt(x, z)) * 0.22;
}

function scatterFor({ cx, cz }) {
  return scatterChunk({ minX: cx * CHUNK, minZ: cz * CHUNK, size: CHUNK });
}

test('every tree in the streamed forest stands on the ground it is scattered over', () => {
  let counted = 0;
  for (const chunk of CHUNKS) {
    for (const tree of scatterFor(chunk).trees) {
      counted += 1;
      const ground = heightAt(tree.x, tree.z);
      const bedded = ground - tree.y;
      assert.ok(
        bedded >= -0.001 && bedded <= seatedTolerance(tree.x, tree.z) + 0.001,
        `tree at ${tree.x.toFixed(1)},${tree.z.toFixed(1)} sits ${bedded.toFixed(3)} m below`
        + ` ground where at most ${seatedTolerance(tree.x, tree.z).toFixed(3)} is intended`,
      );
    }
  }
  assert.ok(counted > 200, `the four spur chunks should carry a forest, got ${counted} trees`);
});

test('rocks and stumps are bedded into the floor rather than dropped on it', () => {
  let counted = 0;
  for (const chunk of CHUNKS) {
    const { rocks, stumps } = scatterFor(chunk);
    for (const [label, items] of [['rock', rocks], ['stump', stumps]]) {
      for (const item of items) {
        counted += 1;
        const bedded = heightAt(item.x, item.z) - item.y;
        assert.ok(
          bedded >= -0.001 && bedded <= seatedTolerance(item.x, item.z) + 0.001,
          `${label} at ${item.x.toFixed(1)},${item.z.toFixed(1)} is ${bedded.toFixed(3)} m off the floor`,
        );
      }
    }
  }
  assert.ok(counted > 40, `the four spur chunks should carry scatter, got ${counted}`);
});

/**
 * A log is checked at its ENDS, because that is where it touches.
 *
 * `scatterChunk` rests each end on the ground and lets the middle be wherever
 * the pitch puts it, which is the whole point of it -- a log lying flat across
 * a dip is the giveaway that nobody consulted the ground. So the midpoint is
 * legitimately up to a few tens of centimetres clear of the floor, and testing
 * the midpoint (which is what the first draft of this file did) fails on
 * exactly the logs that are placed CORRECTLY.
 */
test('deadfall rests on the ground at both ends', () => {
  let counted = 0;
  for (const chunk of CHUNKS) {
    for (const log of scatterFor(chunk).logs) {
      counted += 1;
      for (const end of [-0.5, 0.5]) {
        const ex = log.x + Math.sin(log.yaw) * log.run * end;
        const ez = log.z + Math.cos(log.yaw) * log.run * end;
        const axis = log.y + Math.sin(log.pitch) * log.length * end;
        const rest = heightAt(ex, ez) + log.radius;
        assert.ok(
          Math.abs(axis - rest) <= seatedTolerance(ex, ez) + 0.01,
          `a log end at ${ex.toFixed(1)},${ez.toFixed(1)} is ${(axis - rest).toFixed(3)} m off the floor`,
        );
      }
    }
  }
  assert.ok(counted > 20, `the four spur chunks should carry deadfall, got ${counted}`);
});

/**
 * The thing the gate CAN still see, restated as a direct measurement.
 *
 * Two trunks reported as one object is a real defect and the clearance test in
 * `scatterChunk` is what prevents it. That test compares the trunks' plan
 * footprints — the same boxes the gate measures — so this asserts the property
 * end to end rather than trusting the implementation of it.
 */
test('no two trunks share a footprint anywhere in the streamed forest', () => {
  const dummy = new THREE.Object3D();
  const box = new THREE.Box3();
  const unit = new THREE.Box3(
    new THREE.Vector3(-1, 0, -1),
    new THREE.Vector3(1, 1, 1),
  );
  for (const chunk of CHUNKS) {
    const { trees } = scatterFor(chunk);
    const boxes = trees.map((tree) => {
      const height = (tree.kind === 'fir' ? 9.5
        : tree.kind === 'pine' ? 12.5
          : tree.kind === 'birch' ? 8.0 : 7.0) * tree.scale;
      dummy.rotation.order = 'YXZ';
      dummy.rotation.set(tree.lean, tree.leanYaw, 0);
      dummy.position.set(tree.x, 0, tree.z);
      dummy.scale.set(tree.radius, height, tree.radius);
      dummy.updateMatrix();
      return { tree, plan: box.copy(unit).applyMatrix4(dummy.matrix).clone() };
    });
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const apart = a.plan.min.x > b.plan.max.x || b.plan.min.x > a.plan.max.x
          || a.plan.min.z > b.plan.max.z || b.plan.min.z > a.plan.max.z;
        assert.ok(
          apart,
          `trunks at ${a.tree.x.toFixed(1)},${a.tree.z.toFixed(1)} and`
          + ` ${b.tree.x.toFixed(1)},${b.tree.z.toFixed(1)} share a footprint`,
        );
      }
    }
  }
});

test('the scatter is the same forest every time a chunk is streamed back in', () => {
  const chunk = CHUNKS[0];
  const first = scatterFor(chunk);
  const again = scatterFor(chunk);
  assert.deepEqual(first.trees, again.trees);
  assert.deepEqual(first.rocks, again.rocks);
  assert.deepEqual(first.logs, again.logs);
  assert.deepEqual(first.stumps, again.stumps);
});

test('the clearing the men stand in is cut flat', () => {
  const centre = heightAt(CLEARING.x, CLEARING.z);
  for (const [dx, dz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [1.5, 1.5]]) {
    const here = heightAt(CLEARING.x + dx, CLEARING.z + dz);
    assert.ok(
      Math.abs(here - centre) < 0.25,
      `the clearing floor moves ${(here - centre).toFixed(2)} m at ${dx},${dz}`,
    );
  }
});
