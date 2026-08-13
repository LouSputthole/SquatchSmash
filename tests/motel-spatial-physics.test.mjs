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
    const scene = new THREE.Scene();
    return { ...buildMotel(scene), scene };
  } finally {
    restoreDocument();
  }
}

function boundsOf(object) {
  object.updateWorldMatrix(true, false);
  return new THREE.Box3().setFromObject(object);
}

function positiveFootprintOverlap(a, b, epsilon = 1e-4) {
  return Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > epsilon
    && Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > epsilon;
}

function horizontalFloorBoxes(scene) {
  const floors = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!object.isMesh || object.geometry?.type !== 'PlaneGeometry') return;
    const box = boundsOf(object);
    if (Math.abs(box.max.y - box.min.y) <= 1e-4) floors.push(box);
  });
  return floors;
}

function renderedVertexYRange(root) {
  root.updateWorldMatrix(true, true);
  const point = new THREE.Vector3();
  let min = Infinity;
  let max = -Infinity;
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    for (let ancestor = object; ancestor; ancestor = ancestor.parent) {
      if (!ancestor.visible) return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some((material) => material?.visible !== false
      && (!material.transparent || material.opacity > 0))) return;
    const positions = object.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      min = Math.min(min, point.y);
      max = Math.max(max, point.y);
    }
  });
  return { min, max };
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

test('both room-twelve dining chairs have four visible legs joined from carpet to seat', () => {
  const { refs, scene } = buildLevel();
  const floors = horizontalFloorBoxes(scene);
  assert.equal(refs.chairs.length, 2);

  for (const [chairIndex, chair] of refs.chairs.entries()) {
    const seat = chair.children.find((child) => child.geometry?.parameters?.depth === 0.7);
    assert.ok(seat, `dining chair ${chairIndex} lost its seat`);
    const seatBox = boundsOf(seat);
    const feet = chair.children.filter((child) => child.name === 'motel-dining-chair-foot');
    assert.equal(feet.length, 4, `dining chair ${chairIndex} does not have four legs`);
    for (const [footIndex, foot] of feet.entries()) {
      const footBox = boundsOf(foot);
      assert.ok(positiveFootprintOverlap(seatBox, footBox),
        `dining chair ${chairIndex} leg ${footIndex} leaves the seat footprint`);
      assert.ok(Math.abs(footBox.max.y - seatBox.min.y) <= 1e-4,
        `dining chair ${chairIndex} leg ${footIndex} does not meet the seat`);
      assert.ok(floors.some((floor) => positiveFootprintOverlap(footBox, floor)
        && Math.abs(footBox.min.y - floor.max.y) <= 1e-4),
      `dining chair ${chairIndex} leg ${footIndex} does not meet the carpet`);
    }
  }
});

test('both upright pool loungers are continuous supported assemblies on the concrete deck', () => {
  const { refs, scene } = buildLevel();
  const decks = refs.poolDeck.map(boundsOf);
  const upright = refs.poolFurniture.filter((item) => item.deck);
  assert.equal(upright.length, 2);

  for (const item of upright) {
    const seat = item.group.children.find((child) => child.name === 'motel-pool-lounge-seat'
      || child.geometry?.parameters?.depth === 1.8);
    const back = item.group.getObjectByName('motel-pool-lounge-back')
      || item.group.children.find((child) => child.geometry?.parameters?.depth === 0.8);
    const feet = item.group.children.filter((child) => child.name === 'motel-pool-lounge-foot');
    assert.ok(seat, `${item.id} lost its seat`);
    assert.ok(back, `${item.id} lost its back`);
    assert.equal(feet.length, 4, `${item.id} does not have four legs`);
    const seatBox = boundsOf(seat);
    const backBox = boundsOf(back);
    assert.ok(seatBox.intersectsBox(backBox), `${item.id} back is disconnected from its seat`);
    for (const [footIndex, foot] of feet.entries()) {
      const footBox = boundsOf(foot);
      assert.ok(Math.abs(footBox.max.y - seatBox.min.y) <= 1e-4,
        `${item.id} leg ${footIndex} does not meet the seat`);
      assert.ok(decks.some((deck) => positiveFootprintOverlap(footBox, deck)
        && Math.abs(footBox.min.y - deck.max.y) <= 1e-4),
      `${item.id} leg ${footIndex} does not meet the pool deck`);
    }
  }
});

test('the tipped pool lounge rests on the visible liner instead of clipping through it', () => {
  const { refs } = buildLevel();
  const debris = refs.poolFurniture.find((item) => item.id === 'pool-debris');
  assert.ok(debris?.group, 'the authored pool-bottom debris is missing');

  const linerY = refs.pool.y + 0.02;
  const range = renderedVertexYRange(debris.group);
  assert.ok(Number.isFinite(range.min) && range.max > linerY,
    'the debris has no visible triangles above the pool liner');
  assert.ok(Math.abs(range.min - linerY) <= 1e-4,
    `the debris penetrates the visible pool liner by ${(linerY - range.min).toFixed(4)} m`);
});

test('every room-eleven shipment crate rests on its floor or a crate directly beneath it', () => {
  const { refs, scene } = buildLevel();
  const floors = horizontalFloorBoxes(scene);
  const crates = refs.crates.group.children;
  assert.equal(crates.length, 5);
  const boxes = crates.map(boundsOf);

  for (const [index, item] of boxes.entries()) {
    const floorSupported = floors.some((floor) => positiveFootprintOverlap(item, floor)
      && Math.abs(item.min.y - floor.max.y) <= 1e-4);
    const crateSupported = boxes.some((support, supportIndex) => supportIndex !== index
      && positiveFootprintOverlap(item, support)
      && Math.abs(item.min.y - support.max.y) <= 1e-4);
    assert.ok(floorSupported || crateSupported,
      `shipment crate ${index} has no tangent floor or crate support`);
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
