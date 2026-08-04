import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  WRAPPED_BODY_LENGTH,
  buildWrappedBody,
  measureWrappedBody,
} from '../src/core/props/wrapped-body.js';

/* ------------------------------------------------------------------ */
/* It is a body, not a pill                                            */
/* ------------------------------------------------------------------ */

test('the wrapped body has a body\'s footprint: long, then wide, then flat', () => {
  const measured = measureWrappedBody(buildWrappedBody().group);

  assert.ok(measured.length > measured.width * 2.5,
    `a body is much longer than it is wide, got ${measured.length} by ${measured.width}`);
  assert.ok(measured.width > measured.height * 1.25,
    `a body lying down is wider than it is tall, got ${measured.width} by ${measured.height}`);
});

test('the silhouette tapers shoulder to hip to ankle, which is what the capsule never did', () => {
  const measured = measureWrappedBody(buildWrappedBody().group);

  assert.ok(measured.shoulder.width > measured.hip.width * 1.05,
    `shoulders ${measured.shoulder.width} must beat hips ${measured.hip.width}`);
  assert.ok(measured.hip.width > measured.ankle.width * 1.5,
    `hips ${measured.hip.width} must beat ankles ${measured.ankle.width}`);
});

test('the two ends are telling apart at a glance, and the head is the -Z one', () => {
  const wrapped = buildWrappedBody();
  const measured = measureWrappedBody(wrapped.group);

  assert.ok(wrapped.headZ < wrapped.footZ);
  // One end is a skull on a neck. The other is a pair of feet on two ankles.
  // Both are lumps behind a pinch, and it is how hard the pinch bites that
  // tells a viewer instantly which end they are looking at.
  assert.ok(measured.head.width > measured.neck.width * 1.4,
    `head ${measured.head.width} against neck ${measured.neck.width}`);
  assert.ok(measured.feet.width > measured.ankle.width * 1.1,
    `feet ${measured.feet.width} against ankles ${measured.ankle.width}`);
  assert.ok(
    measured.head.width / measured.neck.width > measured.feet.width / measured.ankle.width * 1.25,
    'the neck is a much deeper pinch than the ankles, which is what reads as a head',
  );

  // And the half with the skull, shoulders, chest and belly in it carries more
  // of him than the half with two legs.
  assert.ok(measured.headHalfArea > measured.footHalfArea * 1.15,
    `head half ${measured.headHalfArea} against foot half ${measured.footHalfArea}`);
});

test('nothing in it is a capsule, a tube or a lathe', () => {
  const wrapped = buildWrappedBody();
  const shapes = new Set();
  wrapped.group.traverse((node) => { if (node.isMesh) shapes.add(node.geometry.type); });

  for (const banned of ['CapsuleGeometry', 'TubeGeometry', 'LatheGeometry', 'TorusGeometry']) {
    assert.equal(shapes.has(banned), false, `${banned} is back`);
  }
});

/* ------------------------------------------------------------------ */
/* It is wrapped, and it has weight                                    */
/* ------------------------------------------------------------------ */

test('the sheet is faceted and translucent, and something dark reads through it', () => {
  const wrapped = buildWrappedBody();

  assert.equal(wrapped.sheet.material.flatShading, true, 'sheeting creases, it does not blend');
  assert.equal(wrapped.sheet.material.transparent, true);
  assert.ok(wrapped.sheet.material.opacity < 0.8 && wrapped.sheet.material.opacity > 0.3);
  // Front and back faces are separate meshes over one geometry, because a
  // single DoubleSide transparent mesh cannot sort its own two sides.
  assert.equal(wrapped.sheetInner.geometry, wrapped.sheet.geometry);
  assert.notEqual(wrapped.sheetInner.material, wrapped.sheet.material);
  assert.equal(wrapped.sheetInner.material.side, THREE.BackSide);
  assert.equal(wrapped.sheet.material.side, THREE.FrontSide);

  assert.ok(wrapped.mass, 'a dark mass sits inside the plastic');
  assert.equal(wrapped.mass.material.transparent, false);
  assert.ok(buildWrappedBody({ hollow: true }).mass === null,
    'a caller with a real figure to put inside can turn the mass off');
});

test('the tape is applied by hand: wide, angled, unevenly spaced, doubled once, and lapped', () => {
  const wrapped = buildWrappedBody();
  const bands = wrapped.tape.filter((mesh) => /\.tape\.[a-z-]+$/.test(mesh.name));
  assert.ok(bands.length >= 5, `expected ankles, knees, waist, chest and neck, got ${bands.length}`);

  wrapped.group.updateMatrixWorld(true);
  const centres = bands
    .map((mesh) => new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()).z)
    .sort((a, b) => a - b);
  const gaps = centres.slice(1).map((z, i) => z - centres[i]);
  assert.ok(Math.max(...gaps) > Math.min(...gaps) * 2,
    `nobody tapes at even spacing, gaps were ${gaps.map((g) => g.toFixed(3))}`);
  assert.ok(Math.min(...gaps) < 0.12, 'one band is doubled over another');

  // Every band is wound off square, so none of them is a ring round the axis.
  for (const band of bands) {
    const size = new THREE.Box3().setFromObject(band).getSize(new THREE.Vector3());
    assert.ok(size.z > 0.09, `${band.name} is a wide band, not a cable tie`);
  }
  assert.ok(wrapped.tape.some((mesh) => /lap$/.test(mesh.name)), 'the tape has a visible start');
});

test('the excess past the head and the feet is gathered off, which is what a capsule cannot do', () => {
  const wrapped = buildWrappedBody();
  wrapped.group.updateMatrixWorld(true);

  const sheet = new THREE.Box3().setFromObject(wrapped.sheet);
  const whole = new THREE.Box3().setFromObject(wrapped.group);
  assert.ok(whole.min.z < sheet.min.z - 0.1, 'sheeting is gathered past the head');
  assert.ok(whole.max.z > sheet.max.z + 0.1, 'sheeting is gathered past the feet');
  assert.ok(wrapped.gathers.head && wrapped.gathers.feet);
  // Both gathers are taped off, which is the whole reason they hold.
  assert.equal(wrapped.tape.filter((mesh) => /gather\..+\.tie$/.test(mesh.name)).length, 2);
});

test('it sits into the floor at the shoulder and the hip, and bridges at the waist and the ankle', () => {
  const measured = measureWrappedBody(buildWrappedBody().group);

  assert.ok(measured.shoulder.bottom <= 0.013, 'the shoulder takes the load');
  assert.ok(measured.hip.bottom <= 0.013, 'so does the hip');
  assert.ok(measured.ankle.bottom > measured.hip.bottom + 0.02,
    'the ankles are off the floor between the heel and the calf');
});

/* ------------------------------------------------------------------ */
/* The options both scenes need                                        */
/* ------------------------------------------------------------------ */

test('length and build scale the whole bundle without losing the taper', () => {
  const small = measureWrappedBody(buildWrappedBody({ length: 1.5, build: 0.8 }).group);
  const large = measureWrappedBody(buildWrappedBody({ length: 2.1, build: 1.25 }).group);

  assert.ok(Math.abs(small.length - 1.5) < 0.001);
  assert.ok(Math.abs(large.length - 2.1) < 0.001);
  assert.ok(large.width > small.width * 1.4);
  for (const measured of [small, large]) {
    assert.ok(measured.shoulder.width > measured.hip.width);
    assert.ok(measured.hip.width > measured.ankle.width);
  }
});

test('propped raises the head end and still leaves the feet on the ground', () => {
  const flat = buildWrappedBody({ pose: 'flat' });
  const propped = buildWrappedBody({ pose: 'propped' });
  flat.group.updateMatrixWorld(true);
  propped.group.updateMatrixWorld(true);
  const flatBox = new THREE.Box3().setFromObject(flat.group);
  const proppedBox = new THREE.Box3().setFromObject(propped.group);

  assert.ok(proppedBox.max.y > flatBox.max.y + 0.2, 'the head end comes up');
  assert.ok(proppedBox.min.y < 0.05 && proppedBox.min.y >= -0.01, 'the foot end still rests on the floor');

  const headY = new THREE.Vector3(0, 0, propped.headZ).applyMatrix4(propped.group.matrixWorld).y;
  const footY = new THREE.Vector3(0, 0, propped.footZ).applyMatrix4(propped.group.matrixWorld).y;
  assert.ok(headY > footY + 0.15, 'it is the head that is up, not the feet');
});

test('staining is restrained, optional, and pooled where the sheet sags', () => {
  const clean = buildWrappedBody({ stain: 0 });
  const stained = buildWrappedBody({ stain: 1 });
  assert.equal(clean.stains.length, 0);
  assert.ok(stained.stains.length > 0 && stained.stains.length <= 6,
    'a few pools, not a scene from a different game');

  stained.group.updateMatrixWorld(true);
  const height = measureWrappedBody(stained.group).height;
  for (const blob of stained.stains) {
    const box = new THREE.Box3().setFromObject(blob);
    assert.ok(box.min.y < height * 0.35, `${blob.name} pools low, it does not float`);
    assert.equal(blob.castShadow, false);
  }
});

test('two bodies built with different seeds are not the same mesh twice', () => {
  const a = buildWrappedBody({ seed: 1 }).sheet.geometry.getAttribute('position');
  const b = buildWrappedBody({ seed: 9 }).sheet.geometry.getAttribute('position');
  assert.equal(a.count, b.count);
  let different = 0;
  for (let i = 0; i < a.count; i++) if (Math.abs(a.getX(i) - b.getX(i)) > 1e-4) different += 1;
  assert.ok(different > a.count / 4, 'the creases move with the seed');
});

test('the default length is the authored profile, and every mesh is named', () => {
  const wrapped = buildWrappedBody({ name: 'burial.body' });
  assert.equal(wrapped.length, WRAPPED_BODY_LENGTH);
  assert.equal(wrapped.group.name, 'burial.body');
  wrapped.group.traverse((node) => {
    assert.match(node.name, /^burial\.body(\..+)?$/, 'an unnamed mesh cannot be found by a scene');
  });
});
