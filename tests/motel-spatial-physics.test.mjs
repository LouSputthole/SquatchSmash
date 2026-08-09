import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { buildMotel } from '../src/motel/level.js';
import { selectPointInteraction } from '../src/motel/point-interaction.js';

const motelMain = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');

function installCanvasDocument() {
  const previous = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext(kind) {
          assert.equal(kind, '2d');
          return {
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 0,
            font: '',
            textAlign: '',
            textBaseline: '',
            fillRect() {},
            strokeRect() {},
            fillText() {},
          };
        },
      };
    },
  };
  return () => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  };
}

function buildLevel() {
  const restoreDocument = installCanvasDocument();
  try {
    return buildMotel(new THREE.Scene());
  } finally {
    restoreDocument();
  }
}

test('the clerk office entrance looks open whenever its doorway has no blocker', () => {
  const { refs } = buildLevel();
  const door = refs.officeDoor;

  assert.equal(door.open, true, 'the office is intentionally available from the lot');
  assert.equal(door.collider.enabled, false, 'an open doorway must not block the player');
  assert.ok(Math.abs(door.pivot.rotation.y) > 1.5,
    'the open doorway still presents a closed-looking door leaf');
  assert.equal(door.angle, door.pivot.rotation.y,
    'the animated door state disagrees with its visible hinge');
  assert.equal(door.targetAngle, door.pivot.rotation.y,
    'the next update would pull the visible door back across the opening');
});

test('the rear windows of rooms eleven and twelve reveal the rooms behind them', () => {
  const { refs } = buildLevel();
  const rearWindows = [
    ['room eleven', refs.window11.mesh],
    ['room twelve bathroom', refs.bathWindow.mesh],
  ];

  for (const [name, pane] of rearWindows) {
    assert.equal(pane.material.transparent, true, `${name} rear pane is opaque`);
    assert.ok(pane.material.opacity > 0 && pane.material.opacity < 0.7,
      `${name} rear pane does not read as glass`);
    assert.equal(pane.material.depthWrite, false,
      `${name} rear pane hides the room while writing its transparent depth`);
  }
});

test('the Motel arrival car is the complete shared maroon convertible with two seats and a real passenger exit', () => {
  const { refs, colliders } = buildLevel();
  const car = refs.manCar;

  assert.equal(car.group.name, 'vehicle.motel.convertible');
  assert.equal(car.group.userData.sharedVehicleBase, 'bing.makePlayerCar');
  assert.equal(car.group.userData.bodyStyle, 'convertible');

  const required = [
    'car.body.front',
    'car.body.rear',
    'cockpit.dashboard',
    'cockpit.steering-wheel',
    'cockpit.seat.driver',
    'cockpit.seat.passenger',
    'cockpit.door.driver',
    'cockpit.door.passenger',
    'cockpit.windscreen',
  ];
  for (const name of required) {
    assert.ok(car.group.getObjectByName(name), `${name} is missing from the shared car`);
  }
  assert.equal(car.group.getObjectByName('car.roof'), undefined,
    'the Motel car still has the shared sedan roof');
  assert.equal(car.group.getObjectByName('cockpit.headliner'), undefined,
    'the open car still has a ceiling over its passengers');

  const body = car.group.getObjectByName('car.body.front');
  const { r, g, b } = body.material.color;
  assert.ok(r > g * 1.5 && r > b && b > g,
    `paint is not maroon/pink: ${body.material.color.getHexString()}`);

  const start = car.group.position.clone();
  car.placeArrival(1);
  assert.ok(start.distanceTo(car.group.position) > 10,
    'the car starts parked instead of visibly pulling into the motel');
  assert.ok(car.group.position.distanceTo(car.park) < 0.001,
    'the pull-in path does not finish in the authored parking space');

  const passenger = car.passengerPosition();
  const passengerActor = car.passengerActorPosition();
  const driver = car.driverActorPosition();
  const passengerDoor = car.passengerDoorPosition();
  const passengerExit = car.passengerExitPosition();
  const driverFacing = new THREE.Vector3(
    Math.sin(car.driverFacingPassengerYaw()),
    0,
    Math.cos(car.driverFacingPassengerYaw()),
  );
  const passengerFacing = new THREE.Vector3(
    Math.sin(car.passengerFacingDriverYaw()),
    0,
    Math.cos(car.passengerFacingDriverYaw()),
  );
  assert.ok(driverFacing.dot(passenger.clone().sub(driver).setY(0).normalize()) > 0.999,
    'Snow is not turned from the driver seat toward Tony in the passenger seat');
  assert.ok(passengerFacing.dot(driver.clone().sub(passenger).setY(0).normalize()) > 0.999,
    'Tony\'s authored arrival view does not point from the passenger seat to Snow');
  assert.equal(car.group.getObjectByName('cockpit.seat.driver').userData.seatRole, 'driver');
  assert.equal(car.group.getObjectByName('cockpit.seat.passenger').userData.seatRole, 'passenger');
  assert.ok(Math.hypot(passenger.x - passengerActor.x, passenger.z - passengerActor.z) < 0.8,
    'Tony\'s passenger camera has drifted away from his physically seated model');
  assert.ok(car.exteriorCameraPosition().distanceTo(car.cabinCenterPosition()) > 3,
    'the exterior pull-in proof camera is clipped into the shared cabin');
  assert.ok(passenger.distanceTo(passengerDoor) < 1.5,
    'the [E] target is not on the passenger door beside Tony');
  const doorRayBlockers = [];
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    const x = THREE.MathUtils.lerp(passenger.x, passengerDoor.x, t);
    const y = THREE.MathUtils.lerp(1.4, passengerDoor.y, t);
    const z = THREE.MathUtils.lerp(passenger.z, passengerDoor.z, t);
    for (const blocker of colliders) {
      if (!blocker.enabled || blocker.tag === 'bed' || blocker.tag === 'table') continue;
      if (y <= blocker.y0 || y >= blocker.y1) continue;
      if (x > blocker.x0 - 0.25 && x < blocker.x1 + 0.25
          && z > blocker.z0 - 0.25 && z < blocker.z1 + 0.25) {
        doorRayBlockers.push({ tag: blocker.tag, t });
      }
    }
  }
  assert.deepEqual(doorRayBlockers, [],
    `Tony's public [E] ray is occluded before the passenger door: ${JSON.stringify(doorRayBlockers)}`);
  assert.equal(car.collider.enabled, false,
    'the seated player starts trapped inside an enabled car blocker');
  car.collider.enabled = true;
  assert.equal(
    passengerExit.x < car.collider.x0 || passengerExit.x > car.collider.x1
      || passengerExit.z < car.collider.z0 || passengerExit.z > car.collider.z1,
    true,
    'the public passenger exit still places Tony inside the car blocker',
  );
});

test('intentional aim independently selects the car case, glovebox, door, and Snow', () => {
  const { refs } = buildLevel();
  const car = refs.manCar;
  car.placeArrival(1);
  const eye = car.passengerPosition();
  const targets = [
    { id: 'moneyCase', point: car.moneyCasePosition(), requiresAim: true },
    { id: 'glovebox', point: car.gloveboxPosition(), requiresAim: true },
    { id: 'exitCar', point: car.passengerDoorPosition(), requiresAim: true },
    { id: 'silverback', point: car.driverActorPosition().add(new THREE.Vector3(0, 1.1, 0)), requiresAim: true },
  ];

  for (const intended of targets) {
    const facing = intended.point.clone().sub(eye).normalize();
    const selected = selectPointInteraction({ eye, facing, targets });
    assert.equal(selected?.id, intended.id,
      `aiming at ${intended.id} selected ${selected?.id ?? 'nothing'} instead`);
  }

  for (const id of targets.map((target) => target.id)) {
    const block = motelMain.match(new RegExp(`addInteract\\(\\{\\s*id: '${id}',[\\s\\S]*?\\n\\}\\);`))?.[0] ?? '';
    assert.match(block, /requiresAim:\s*true/,
      `${id} still uses the directionless close-range interaction shortcut`);
  }
  assert.doesNotMatch(
    motelMain.match(/addInteract\(\{\s*id: 'exitCar',[\s\S]*?\n\}\);/)?.[0] ?? '',
    /priority:/,
    'the passenger door has an unbounded priority that steals the case or glovebox',
  );
});
