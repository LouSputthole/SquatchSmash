import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { FatSquatch } = await import('../src/enolasquatch/payload/FatSquatch.js');

/* Owner playtest, 2026-08-18: "I want the bomb to point down as it drops out,
 * it should happen rather quickly when it comes out of the bay." The contract:
 * out of the doors the nose still lies along the release path (no snap), the
 * tip-over to straight down is complete well under a second in, and it falls
 * nose-first from there — all on the SIMULATED clock. */
test('the released Fat Squatch tips nose-down fast and falls nose-first', () => {
  const scene = new THREE.Scene();
  const payload = new FatSquatch();
  scene.add(payload.group);
  // Along +Z, the direction the casing's nose is built to face — on the real
  // mount the release attitude and the carrier velocity agree the same way.
  payload.release(scene, new THREE.Vector3(0, 0, 92));

  const nose = () => new THREE.Vector3(0, 0, 1).applyQuaternion(payload.group.quaternion).normalize();
  const step = (seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) payload.update(1 / 60); };

  // Clearing the doors: the nose has not been snapped away from the path.
  step(0.15);
  const path = payload.velocity.clone().normalize();
  assert.ok(nose().dot(path) > 0.94,
    `the nose left the bay off its own path (dot ${nose().dot(path).toFixed(3)})`);

  // One second in the crisp tip-over is done: nose within ~18 degrees of down.
  step(0.85);
  assert.ok(nose().y < -0.95,
    `the tip-over never completed (nose.y ${nose().y.toFixed(3)} at 1.0 s)`);

  // Then it weathervanes: by mid-fall the down-bias has eased off and the
  // nose has settled INTO the falling path — the scene gate's own contract —
  // while still pointing well below the horizon, not tumbling and not
  // drifting back toward level.
  step(3);
  const midPath = payload.velocity.clone().normalize();
  assert.ok(nose().dot(midPath) > 0.94,
    `the nose never settled into the falling path (dot ${nose().dot(midPath).toFixed(3)} at 4.0 s)`);
  // Below the horizon by the gate's own floor: at this test's 92 m/s release
  // the path is only ~23 degrees steep at 4 s, and the nose rides the path.
  assert.ok(nose().y < -0.2,
    `the nose came back up during the fall (nose.y ${nose().y.toFixed(3)} at 4.0 s)`);
});
