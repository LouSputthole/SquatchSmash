import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { FatSquatch } = await import('../src/enolasquatch/payload/FatSquatch.js');

test('the released Fat Squatch settles nose-first into its ballistic path', () => {
  const scene = new THREE.Scene();
  const payload = new FatSquatch();
  scene.add(payload.group);
  payload.release(scene, new THREE.Vector3(92, 0, 0));

  // Four seconds is long enough for a gradual aerodynamic settle, while the
  // falling path is already clearly pitched down. The old free Euler tumble
  // points the nose somewhere unrelated to this velocity.
  for (let i = 0; i < 4 * 60; i++) payload.update(1 / 60);

  const nose = new THREE.Vector3(0, 0, 1).applyQuaternion(payload.group.quaternion).normalize();
  const path = payload.velocity.clone().normalize();
  assert.ok(nose.dot(path) > 0.94,
    `bomb nose follows the path at only ${nose.dot(path).toFixed(3)}`);
  assert.ok(nose.y < -0.25,
    `bomb nose never pitched visibly down (${nose.y.toFixed(3)})`);
});
