import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { makePlayerCar } from '../src/bing/vehicles.js';
import { makeMotelArrivalCar } from '../src/motel/vehicle.js';

const EPSILON = 1e-9;

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, got ${actual}`);
}

function assertConvertibleWaists(label, car) {
  const bodyTop = car.shape.wheelR + car.shape.bodyH;
  const glassBottom = bodyTop
    + car.shape.cabinH * (0.5 + 0.12 - 0.56 / 2);
  const cabinHalfWidth = car.shape.W * 0.94 / 2;

  car.group.updateMatrixWorld(true);
  for (const [side, outwardSign] of [['left', -1], ['right', 1]]) {
    const waist = car.group.getObjectByName(`car.waist.${side}`);
    assert.ok(waist?.isMesh, `${label} is missing its ${side} waist strip`);

    assert.ok(waist.scale.y > 0,
      `${label} ${side} waist has mirrored vertical geometry (${waist.scale.y})`);
    assert.ok(waist.matrixWorld.determinant() > 0,
      `${label} ${side} waist reverses its front faces`);

    assertClose(waist.position.y - waist.scale.y / 2, bodyTop,
      `${label} ${side} waist does not start at the body top`);
    assertClose(waist.position.y + waist.scale.y / 2, glassBottom,
      `${label} ${side} waist does not meet the side-glass line`);
    assertClose(waist.scale.x, car.shape.cabinL,
      `${label} ${side} waist lost the greenhouse run`);
    assertClose(waist.scale.z, 0.07,
      `${label} ${side} waist lost its authored skin thickness`);
    assertClose(
      waist.position.z + outwardSign * waist.scale.z / 2,
      outwardSign * cabinHalfWidth,
      `${label} ${side} waist is inset from the cabin exterior`,
    );

    // The production material is front-sided. Prove an exterior sightline
    // reaches the outward face after the complete scene transform, rather
    // than relying on a double-sided material to conceal reversed geometry.
    assert.equal(waist.material.side, THREE.FrontSide,
      `${label} ${side} waist masks its winding with a two-sided material`);
    const center = waist.getWorldPosition(new THREE.Vector3());
    const outward = new THREE.Vector3(0, 0, outwardSign)
      .applyQuaternion(car.group.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    const hit = new THREE.Raycaster(
      center.clone().addScaledVector(outward, 0.5),
      outward.clone().negate(),
      0,
      1,
    ).intersectObject(waist, false)[0];
    assert.ok(hit && hit.distance < 0.5,
      `${label} ${side} waist is not visible from outside the car`);
  }
}

test('the real Bing sedan and Motel convertible keep outward, aligned waist strips', () => {
  const bing = makePlayerCar(new THREE.Scene(), { x: 7, z: -3, yaw: 0.43 });
  const motel = makeMotelArrivalCar(new THREE.Scene());
  motel.placeArrival(1);

  assertConvertibleWaists('Bing player car', bing);
  assertConvertibleWaists('Motel arrival car', motel);

  const bingLeft = bing.group.getObjectByName('car.waist.left');
  const motelLeft = motel.group.getObjectByName('car.waist.left');
  assert.deepEqual(motelLeft.scale.toArray(), bingLeft.scale.toArray(),
    'the Motel adapter drifted from the complete shared Bing shell');
  assert.ok(motel.group.getObjectByName('cockpit.seat.driver')
      && motel.group.getObjectByName('cockpit.seat.passenger')
      && motel.group.getObjectByName('cockpit.door.driver')
      && motel.group.getObjectByName('cockpit.door.passenger'),
  'correcting the shared shell removed a Motel seat or door');
});
