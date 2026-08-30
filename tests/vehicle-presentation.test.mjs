import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import {
  aimHeadlightBeam,
  createHeadlightBeam,
  createHeadlightBeamGeometry,
} from '../src/core/vehicles/headlights.js';
import { VehicleOccupants } from '../src/core/vehicles/occupants.js';
import { PlanarMirror, reflectPointAcrossPlane } from '../src/core/planar-mirror.js';
import { makePlayerCar } from '../src/bing/vehicles.js';
import { makeTaxi } from '../src/silver/vehicle.js';

test('shared headlight geometry is narrow at the fixture and widens downrange', () => {
  const geometry = createHeadlightBeamGeometry({ radialSegments: 16 });
  const positions = geometry.getAttribute('position');
  let nearRadius = 0;
  let farRadius = 0;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const radius = Math.hypot(positions.getY(i), positions.getZ(i));
    if (x < 0.01) nearRadius = Math.max(nearRadius, radius);
    if (x > 0.99) farRadius = Math.max(farRadius, radius);
  }
  assert.ok(nearRadius < 1e-5, `fixture radius ${nearRadius} is not a point`);
  assert.ok(farRadius > 0.99, `downrange radius ${farRadius} did not widen`);
});

test('a profiled beam keeps its tip at the lamp while aim changes direction', () => {
  const beam = createHeadlightBeam({ reach: 40, farRadius: 3.6 });
  beam.position.set(2, 0.8, -0.4);
  aimHeadlightBeam(beam, new THREE.Vector3(55, -1.9, 2.6));
  beam.updateMatrixWorld(true);
  const tip = new THREE.Vector3(0, 0, 0).applyMatrix4(beam.matrixWorld);
  assert.ok(tip.distanceTo(beam.position) < 1e-8);
  assert.deepEqual(beam.userData.headlightBeam, {
    axis: '+x', nearRadius: 0, farRadius: 3.6, reach: 40,
  });
});

test('vehicle occupants are scene-graph children and inherit the full car transform', () => {
  const scene = new THREE.Scene();
  const car = new THREE.Group();
  scene.add(car);
  const occupants = new VehicleOccupants(car, {
    passenger: { x: 0.5, y: 0.8, z: -0.4 },
  });
  const rider = new THREE.Object3D();
  scene.add(rider);

  assert.equal(occupants.attach('passenger', rider, { drop: 0.42, localYaw: Math.PI / 2 }), true);
  assert.equal(rider.parent, occupants.anchor('passenger'));
  assert.equal(rider.position.y, -0.42);

  car.position.set(12, 1.2, -8);
  car.rotation.set(0.12, 0.8, -0.07);
  car.updateMatrixWorld(true);
  const first = rider.getWorldPosition(new THREE.Vector3());
  car.position.add(new THREE.Vector3(10, 2, 5));
  car.rotation.y += 0.4;
  car.updateMatrixWorld(true);
  const moved = rider.getWorldPosition(new THREE.Vector3());
  assert.ok(moved.distanceTo(first) > 10, 'rider did not inherit vehicle motion');

  const beforeRelease = rider.getWorldPosition(new THREE.Vector3());
  occupants.release('passenger');
  const afterRelease = rider.getWorldPosition(new THREE.Vector3());
  assert.equal(rider.parent, scene);
  assert.ok(afterRelease.distanceTo(beforeRelease) < 1e-8, 'release changed world pose');
});

test('every moving passenger scene consumes the canonical vehicle-occupant contract', () => {
  const files = [
    '../src/specialmeeting/sedan.js',
    '../src/motel/vehicle.js',
    '../src/golf/carts.js',
    '../src/silver/vehicle.js',
    '../src/bing/vehicles.js',
  ];
  for (const relative of files) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /core\/vehicles\/occupants\.js/);
  }
  const motelRuntime = readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');
  assert.match(motelRuntime, /occupants\.attach\('passengerActor'/);
  assert.doesNotMatch(motelRuntime, /player\.group\.position\.copy\(refs\.manCar\.passengerActorPosition\(\)\)/);

  const golfMission = readFileSync(new URL('../src/golf/mission.js', import.meta.url), 'utf8');
  assert.match(golfMission, /cart\.occupants\.attach\(which, golfer\.group/);
  assert.doesNotMatch(golfMission, /golfer\.group\.position\.set\(s\.x/,
    'Golf still chases cart seats by copying world coordinates every frame');

  const silverTaxi = readFileSync(new URL('../src/silver/vehicle.js', import.meta.url), 'utf8');
  assert.match(silverTaxi, /occupants\.attach\('driverActor', driver\.group/);
  assert.doesNotMatch(silverTaxi, /driver\.group\.position\.x\s*=\s*car\.group\.position\.x/,
    'Silver still chases the departing taxi by copying one axis');

  const bingCar = readFileSync(new URL('../src/bing/vehicles.js', import.meta.url), 'utf8');
  assert.match(bingCar, /driverPosition:[^\n]*occupants\.worldPoint\('driverEye'/,
    'Bing drive-away does not read its non-Object3D player eye from VehicleOccupants');
});

test('Bing keeps its authored camera policy on a canonical moving driver-eye anchor', () => {
  const car = makePlayerCar(new THREE.Scene(), { x: 7, z: -3, yaw: 0.43 });
  assert.equal(car.occupants.has('driverEye'), true);
  assert.ok(car.driverPosition().distanceTo(car.occupants.worldPoint('driverEye')) < 1e-9);

  car.group.position.set(-12, 1.1, 23);
  car.group.rotation.set(0.08, -0.7, -0.04);
  car.group.updateMatrixWorld(true);
  assert.ok(car.driverPosition().distanceTo(car.occupants.worldPoint('driverEye')) < 1e-9,
    'driver camera left the canonical anchor after the whole car transformed');
  assert.equal(car.driverYaw(), car.group.rotation.y - Math.PI / 2,
    'Bing scene policy must continue to own the camera yaw');
});

test('Silver hands the driver to the taxi anchor exactly when the car departs', () => {
  const scene = new THREE.Scene();
  const taxi = makeTaxi(scene, { x: 4, z: 9 });
  taxi.group.position.set(taxi.park.x, 0, taxi.park.z);
  taxi.driver.group.rotation.y = 0.73;
  const parked = taxi.driver.group.getWorldPosition(new THREE.Vector3());
  const parkedFacing = taxi.driver.group.getWorldQuaternion(new THREE.Quaternion());

  assert.equal(taxi.driver.group.parent, scene,
    'the parked interactive driver intentionally remains in scene space');
  taxi.leave();
  assert.equal(taxi.driver.group.parent, taxi.occupants.anchor('driverActor'));
  assert.ok(taxi.driver.group.getWorldPosition(new THREE.Vector3()).distanceTo(parked) < 1e-9,
    'boarding the departure anchor visibly snapped the parked driver');
  assert.ok(taxi.driver.group.getWorldQuaternion(new THREE.Quaternion()).angleTo(parkedFacing) < 1e-7,
    'boarding reset the driver\'s final glance before departure');

  taxi.update(0.5);
  const moved = taxi.driver.group.getWorldPosition(new THREE.Vector3());
  assert.ok(moved.distanceTo(parked) > 4.4, 'the taxi left without its driver');
  assert.ok(moved.distanceTo(taxi.occupants.worldPoint('driverActor')) < 1e-9,
    'the moving driver drifted off the canonical seat anchor');
});

test('Special Meeting and Initiation consume the canonical headlight beam invariant', () => {
  const files = [
    '../src/specialmeeting/sedan.js',
    '../src/specialmeeting/forest/sedan-adapter.js',
    '../src/initiation/cabin/execution-ground.js',
    '../src/motel/drive-geometry.js',
  ];
  for (const relative of files) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /core\/vehicles\/headlights\.js/);
    assert.doesNotMatch(source, /new THREE\.ConeGeometry\([^\n]*headlight/i);
  }
});

test('a mounted mirror derives its plane from the fixture world transform', () => {
  const scene = new THREE.Scene();
  const fixture = new THREE.Group();
  fixture.position.set(4, 2, -3);
  fixture.rotation.y = Math.PI / 2;
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.66));
  fixture.add(surface);
  scene.add(fixture);

  const mirror = new PlanarMirror(scene, surface);
  const { center, normal } = mirror.plane(new THREE.Vector3(), new THREE.Vector3());
  assert.ok(center.distanceTo(new THREE.Vector3(4, 2, -3)) < 1e-8);
  assert.ok(normal.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-8);
  const reflected = reflectPointAcrossPlane(
    new THREE.Vector3(6, 2, -3), center, normal,
  );
  assert.ok(reflected.distanceTo(new THREE.Vector3(2, 2, -3)) < 1e-8);
  mirror.dispose();
});

test('every playable bathroom uses the canonical planar mirror Module', () => {
  const compositions = [
    ['../src/main.js'],
    ['../src/squatchfather/effects/MirrorReflection.js'],
    ['../src/luxury-apartment/main.js'],
    ['../src/cabin/main.js', '../src/cabin/presentation.js'],
  ];
  for (const relatives of compositions) {
    const source = relatives
      .map((relative) => readFileSync(new URL(relative, import.meta.url), 'utf8'))
      .join('\n');
    assert.match(source, /core\/planar-mirror\.js/,
      `${relatives[0]} must reach the canonical planar mirror Module`);
  }
});

test('mirror scenes either use the shared first-person body or an authored reflection-layer body', () => {
  for (const relative of [
    '../src/main.js',
    '../src/luxury-apartment/main.js',
    '../src/cabin/main.js',
  ]) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /core\/first-person-body\.js/,
      `${relative} must use the persistent mirror-body lifecycle`);
  }

  const squatchfather = readFileSync(
    new URL('../src/squatchfather/characters/ProspectController.js', import.meta.url),
    'utf8',
  );
  assert.match(squatchfather, /layers\.set\(1\)/,
    'Squatchfather keeps its authored mirror-only Prospect body');
});
