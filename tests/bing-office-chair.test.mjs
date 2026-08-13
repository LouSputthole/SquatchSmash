import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three.module.min.js';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const { buildClub, ROOMS } = await import('../src/bing/club.js');

function boundsOf(object) {
  return new THREE.Box3().setFromObject(object);
}

function positiveVolumeOverlap(a, b, epsilon = 1e-4) {
  return Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > epsilon
    && Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > epsilon
    && Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > epsilon;
}

function containedInFootprint(inner, outer, epsilon = 1e-4) {
  return inner.min.x >= outer.min.x - epsilon
    && inner.max.x <= outer.max.x + epsilon
    && inner.min.z >= outer.min.z - epsilon
    && inner.max.z <= outer.max.z + epsilon;
}

function effectivelyVisible(object) {
  for (let current = object; current; current = current.parent) {
    if (current.visible === false) return false;
  }
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.every((material) => (
    material?.visible !== false && (material?.opacity ?? 1) > 0.01
  ));
}

function assertEvenRadialCoverage(objects, hub, expectedRadius, label) {
  const centre = hub.getWorldPosition(new THREE.Vector3());
  const points = objects.map((object) => object.getWorldPosition(new THREE.Vector3()));
  for (const [index, point] of points.entries()) {
    const radius = Math.hypot(point.x - centre.x, point.z - centre.z);
    assert.ok(
      Math.abs(radius - expectedRadius) <= 1e-4,
      `${label} ${index} sits at radius ${radius.toFixed(4)} m instead of ${expectedRadius.toFixed(2)} m`,
    );
    for (let other = 0; other < index; other++) {
      assert.ok(point.distanceTo(points[other]) > 0.1, `${label} ${index} is coincident with ${label} ${other}`);
    }
  }

  const angles = points
    .map((point) => Math.atan2(point.z - centre.z, point.x - centre.x))
    .map((angle) => (angle + Math.PI * 2) % (Math.PI * 2))
    .sort((a, b) => a - b);
  const expectedGap = Math.PI * 2 / objects.length;
  for (let index = 0; index < angles.length; index++) {
    const next = index === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[index + 1];
    const gap = next - angles[index];
    assert.ok(
      Math.abs(gap - expectedGap) <= 1e-4,
      `${label} angular gap ${index} is ${(gap * 180 / Math.PI).toFixed(2)} degrees instead of 72`,
    );
  }
}

test('Lou office chair has one grounded five-foot swivel load path on the real carpet', () => {
  const scene = new THREE.Scene();
  const club = buildClub(scene);
  scene.updateMatrixWorld(true);

  const chair = scene.getObjectByName('lou-chair');
  assert.ok(chair, 'Lou office lost its desk chair');
  assert.equal(club.colliders.length, 128, 'Lou chair geometry changed the club route collider set');

  const meshes = [];
  chair.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  const named = (name) => meshes.filter((mesh) => mesh.name === name);
  const arms = named('lou-chair-base-arm');
  const feet = named('lou-chair-foot');
  assert.equal(arms.length, 5, `Lou chair has ${arms.length}/5 visible swivel-base arms`);
  assert.equal(feet.length, 5, `Lou chair has ${feet.length}/5 carpet-standing feet`);

  const exactlyOne = (name) => {
    const matches = named(name);
    assert.equal(matches.length, 1, `Lou chair needs exactly one ${name}`);
    return matches[0];
  };
  const seat = exactlyOne('lou-chair-seat');
  const back = exactlyOne('lou-chair-back');
  const column = exactlyOne('lou-chair-column');
  const hub = exactlyOne('lou-chair-base-hub');

  const office = ROOMS.office;
  let carpet = null;
  scene.traverse((object) => {
    if (carpet || !object.isMesh || object.geometry?.type !== 'PlaneGeometry') return;
    const box = boundsOf(object);
    if (Math.abs(box.min.x - office.x0) <= 1e-4
        && Math.abs(box.max.x - office.x1) <= 1e-4
        && Math.abs(box.min.z - office.z0) <= 1e-4
        && Math.abs(box.max.z - office.z1) <= 1e-4
        && Math.abs(box.max.y - 0.004) <= 1e-4) {
      carpet = object;
    }
  });
  assert.ok(carpet, 'the real Lou-office carpet plane was not built');
  assert.ok(effectivelyVisible(carpet), 'the Lou-office carpet is hidden or transparent');

  const carpetBox = boundsOf(carpet);
  const seatBox = boundsOf(seat);
  const backBox = boundsOf(back);
  const columnBox = boundsOf(column);
  const hubBox = boundsOf(hub);
  const armBoxes = arms.map(boundsOf);
  const footBoxes = feet.map(boundsOf);

  assert.ok(positiveVolumeOverlap(backBox, seatBox), 'Lou chair back is disconnected from its seat');
  assert.ok(positiveVolumeOverlap(columnBox, seatBox), 'Lou chair column is disconnected from its seat');
  assert.ok(positiveVolumeOverlap(hubBox, columnBox), 'Lou chair base hub is disconnected from its column');
  for (const mesh of [seat, back, column, hub, ...arms, ...feet]) {
    assert.ok(effectivelyVisible(mesh), `${mesh.name} is hidden or transparent`);
  }

  const armFootLinks = armBoxes.map((armBox) => footBoxes.flatMap((footBox, footIndex) => (
    positiveVolumeOverlap(armBox, footBox) ? [footIndex] : []
  )));
  const footArmLinks = footBoxes.map((footBox) => armBoxes.flatMap((armBox, armIndex) => (
    positiveVolumeOverlap(footBox, armBox) ? [armIndex] : []
  )));
  for (const [index, armBox] of armBoxes.entries()) {
    assert.ok(positiveVolumeOverlap(armBox, hubBox), `Lou chair base arm ${index} misses its hub`);
    assert.deepEqual(
      armFootLinks[index].length,
      1,
      `Lou chair base arm ${index} joins ${armFootLinks[index].length} feet instead of one`,
    );
  }
  for (const [index, footBox] of footBoxes.entries()) {
    assert.deepEqual(
      footArmLinks[index].length,
      1,
      `Lou chair foot ${index} joins ${footArmLinks[index].length} base arms instead of one`,
    );
    const gap = footBox.min.y - carpetBox.max.y;
    assert.ok(Math.abs(gap) <= 1e-4, `Lou chair foot ${index} is ${gap.toFixed(4)} m off its carpet`);
    assert.ok(containedInFootprint(footBox, carpetBox), `Lou chair foot ${index} is outside its carpet`);
  }
  assert.equal(new Set(armFootLinks.flat()).size, 5, 'Lou chair arms do not map to five distinct feet');
  assertEvenRadialCoverage(arms, hub, 0.12, 'Lou chair base arm');
  assertEvenRadialCoverage(feet, hub, 0.25, 'Lou chair foot');

  for (const [label, boxes] of [['arm', armBoxes], ['foot', footBoxes], ['hub', [hubBox]]]) {
    for (const [index, box] of boxes.entries()) {
      assert.ok(containedInFootprint(box, seatBox), `Lou chair ${label} ${index} escaped the seat footprint`);
    }
  }
});
