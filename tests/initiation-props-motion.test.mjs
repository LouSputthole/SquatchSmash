import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { makeInitiationCeremonyFigure } = await import('../src/initiation/ceremony-figure.js');
const { buildInitiationExecutionRevolver } = await import('../src/initiation/presentation.js');
const {
  FOUNDER_STAFF_HAND,
  EXECUTION_SIDEARM_HAND,
  buildExecutionHolster,
  buildFounderStaff,
  mountFounderStaff,
  poseExecutionDraw,
  poseExecutionHolster,
  poseFounderStaffGrip,
} = await import('../src/initiation/ceremony-props-motion.js');

test('Booskibro keeps the staff in the off hand, above ground and outside his torso', () => {
  assert.equal(FOUNDER_STAFF_HAND, 'L');
  assert.equal(EXECUTION_SIDEARM_HAND, 'R');
  const boosk = makeInitiationCeremonyFigure('BOOSKIBRO');
  const staff = buildFounderStaff();
  const socket = mountFounderStaff(boosk, staff);
  assert.equal(socket, boosk.parts.handL);

  const move = new THREE.Vector3(0.4, 0, 0.9).normalize();
  const localBoundsOf = (root) => {
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    const bounds = new THREE.Box3().makeEmpty();
    root.traverse((node) => {
      if (!node.geometry) return;
      node.geometry.computeBoundingBox();
      const relative = inverse.clone().multiply(node.matrixWorld);
      bounds.union(node.geometry.boundingBox.clone().applyMatrix4(relative));
    });
    return bounds;
  };
  for (const dt of [0, 0.12, 0.23, 0.31]) {
    boosk.update(dt, move, 2.6);
    poseFounderStaffGrip(boosk, boosk.armL.rotation.x);
    boosk.group.updateMatrixWorld(true);
    const staffBox = new THREE.Box3().setFromObject(staff, true);
    assert.ok(staffBox.min.y >= -0.02, `staff foot entered the floor at ${staffBox.min.y}`);

    /* Rotated world AABBs overlap even when the real cylinder and jacket do
     * not. Sample the shaft axis in the torso's own coordinate system and
     * require its 5 cm radius to stay clear of the actual local bounds. */
    const torso = boosk.torsoWrap ?? boosk.body;
    const torsoBounds = localBoundsOf(torso);
    const shaft = staff.getObjectByName('staff.shaft');
    const low = shaft.localToWorld(new THREE.Vector3(0, -0.86, 0));
    const high = shaft.localToWorld(new THREE.Vector3(0, 0.86, 0));
    let clearance = Infinity;
    for (let sample = 0; sample <= 48; sample += 1) {
      const point = low.clone().lerp(high, sample / 48);
      torso.worldToLocal(point);
      clearance = Math.min(clearance, torsoBounds.distanceToPoint(point));
    }
    assert.ok(clearance > 0.052, `staff shaft cleared jacket by only ${clearance.toFixed(3)} m`);
  }
});

test('the execution revolver has exactly one visible copy through draw and holster', () => {
  const boosk = makeInitiationCeremonyFigure('BOOSKIBRO');
  const gun = buildInitiationExecutionRevolver();
  gun.visible = false;
  boosk.parts.handR.add(gun);
  const receipt = buildExecutionHolster(boosk, { name: 'test-sidearm' });

  assert.equal(receipt.holstered.visible, true);
  assert.equal(gun.visible, false);
  poseExecutionDraw(boosk, receipt, gun, 0.5);
  assert.equal(receipt.holstered.visible, false);
  assert.equal(gun.visible, true);
  poseExecutionDraw(boosk, receipt, gun, 1);
  assert.ok(Number.isFinite(boosk.armR.rotation.x));

  poseExecutionHolster(boosk, receipt, gun, 0.5);
  assert.equal(gun.visible, true);
  poseExecutionHolster(boosk, receipt, gun, 1);
  assert.equal(receipt.holstered.visible, true);
  assert.equal(gun.visible, false);
});
