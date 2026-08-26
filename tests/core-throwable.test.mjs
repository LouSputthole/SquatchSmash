import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  BallisticProjectile,
  ThrowCharge,
  composeThrowVelocity,
  firstSegmentImpact,
  segmentPlaneImpact,
} from '../src/core/throwable.js';

test('shared throw charge produces a bounded deterministic release receipt', () => {
  const charge = new ThrowCharge({ minPower: 6, maxPower: 14, chargeSeconds: 1 });
  assert.equal(charge.begin(), true);
  assert.equal(charge.begin(), false, 'a held input cannot restart its own charge');
  charge.update(0.5);
  assert.equal(charge.amount, 0.5);
  assert.equal(charge.power, 10);
  assert.deepEqual(charge.release(), { amount: 0.5, power: 10, elapsed: 0.5 });
  assert.equal(charge.active, false);
  assert.equal(charge.release(), null);

  charge.begin();
  charge.update(4);
  assert.equal(charge.amount, 1);
  assert.equal(charge.release().power, 14);
});

test('shared launch velocity normalizes aim and applies optional upward bias', () => {
  const straight = composeThrowVelocity(new THREE.Vector3(0, 0, -4), 12);
  assert.ok(straight.distanceTo(new THREE.Vector3(0, 0, -12)) < 1e-9);
  const arced = composeThrowVelocity(new THREE.Vector3(0, 0, -1), 12, { upwardBias: 0.12 });
  assert.ok(Math.abs(arced.length() - 12) < 1e-9);
  assert.ok(arced.y > 0);
  assert.ok(arced.z < 0);
});

test('continuous plane collision reports physical contact and clips circular targets', () => {
  const planePoint = new THREE.Vector3(0, 0, 0);
  const planeNormal = new THREE.Vector3(0, 0, 1);
  const hit = segmentPlaneImpact({
    from: new THREE.Vector3(0.2, 0.1, 2),
    to: new THREE.Vector3(0.2, 0.1, -2),
    planePoint,
    planeNormal,
    maxRadius: 0.5,
    oneSided: true,
    target: 'board',
  });
  assert.ok(hit);
  assert.equal(hit.target, 'board');
  assert.ok(Math.abs(hit.t - 0.5) < 1e-9);
  assert.ok(hit.contactPoint.distanceTo(new THREE.Vector3(0.2, 0.1, 0)) < 1e-9);
  assert.equal(segmentPlaneImpact({
    from: new THREE.Vector3(0.8, 0, 2),
    to: new THREE.Vector3(0.8, 0, -2),
    planePoint,
    planeNormal,
    maxRadius: 0.5,
  }), null);
});

test('two-sided plane collision expands projectile radius toward either approach', () => {
  const planePoint = new THREE.Vector3(0, 0, 0);
  const planeNormal = new THREE.Vector3(0, 0, 1);
  const forward = segmentPlaneImpact({
    from: new THREE.Vector3(0, 0, 2),
    to: new THREE.Vector3(0, 0, -2),
    planePoint,
    planeNormal,
    radius: 0.5,
  });
  const reverse = segmentPlaneImpact({
    from: new THREE.Vector3(0, 0, -2),
    to: new THREE.Vector3(0, 0, 2),
    planePoint,
    planeNormal,
    radius: 0.5,
  });

  assert.ok(Math.abs(forward.t - 0.375) < 1e-9);
  assert.ok(Math.abs(forward.point.z - 0.5) < 1e-9);
  assert.ok(Math.abs(forward.contactPoint.z) < 1e-9);
  assert.deepEqual(forward.normal.toArray(), [0, 0, 1]);
  assert.ok(Math.abs(reverse.t - 0.375) < 1e-9);
  assert.ok(Math.abs(reverse.point.z + 0.5) < 1e-9);
  assert.ok(Math.abs(reverse.contactPoint.z) < 1e-9);
  assert.ok(Math.abs(reverse.normal.x) < 1e-9);
  assert.ok(Math.abs(reverse.normal.y) < 1e-9);
  assert.equal(reverse.normal.z, -1);
});

test('shared collision selection and substepped ballistics stop at the earliest thin surface', () => {
  const near = ({ from, to }) => segmentPlaneImpact({
    from,
    to,
    planePoint: new THREE.Vector3(0, 0, 2),
    planeNormal: new THREE.Vector3(0, 0, 1),
    target: 'near',
    oneSided: true,
  });
  const far = ({ from, to }) => segmentPlaneImpact({
    from,
    to,
    planePoint: new THREE.Vector3(0, 0, 0),
    planeNormal: new THREE.Vector3(0, 0, 1),
    target: 'far',
    oneSided: true,
  });
  const selected = firstSegmentImpact(
    new THREE.Vector3(0, 1, 4),
    new THREE.Vector3(0, 1, -1),
    [far, near],
  );
  assert.equal(selected.target, 'near');

  const projectile = new BallisticProjectile({ maxStep: 1 / 240 });
  projectile.launch(new THREE.Vector3(0, 1.5, 4), new THREE.Vector3(0, 0, -10));
  const receipt = projectile.update(1, [far]);
  assert.equal(receipt.active, false);
  assert.equal(receipt.impact.target, 'far');
  assert.ok(Math.abs(receipt.impact.point.z) < 1e-6);
  assert.ok(receipt.impact.point.y < 1.5, 'gravity creates a visible ballistic drop');
  assert.ok(receipt.impact.velocity.y < 0);
});
