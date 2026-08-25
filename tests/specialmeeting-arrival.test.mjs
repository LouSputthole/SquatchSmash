/**
 * THE SPECIAL MEETING — the car, and the ten seconds before it.
 *
 * The staging of this scene is a seating plan, so the seating plan is what
 * these tests hold still:
 *
 *   - four seats, addressable by name, with occupants that stay in them while
 *     the car moves (a body left behind on the pavement is the bug that ends
 *     a conversation the moment the handbrake comes off);
 *   - the FRONT PASSENGER door on the kerb, in front of the entrance, because
 *     the whole beat is that the seat nearest him is the front one;
 *   - a boot with room in it, and a lid that opens;
 *   - an arrival that takes its time, ends parked against the kerb, and does
 *     not drive through anything on the way.
 *
 * All headless. The car is a real `GroundVehicle` either way, so what is
 * simulated here is what runs in the browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { buildMeetingSedan, SEATS, SEAT_IDS } = await import('../src/specialmeeting/sedan.js');
const { buildSpecialMeetingCast } = await import('../src/specialmeeting/cast.js');
const {
  createFrontPassengerDoorTarget,
  FRONT_PASSENGER_DOOR_AFFORDANCE,
} = await import('../src/specialmeeting/door-interaction.js');
const { buildSpecialMeetingBlock } = await import('../src/specialmeeting/block.js');
const { createArrivalSequence } = await import('../src/specialmeeting/arrival.js');
const { RouteDriver, bearingTo, wrapAngle } = await import('../src/specialmeeting/drive.js');
const { ForestDrive } = await import('../src/specialmeeting/forest/driver.js');
const { ROAD_EVENTS, roadAt } = await import('../src/specialmeeting/forest/road.js');
const { createNightForestRoad } = await import('../src/specialmeeting/forest/index.js');
const { buildNightSedan } = await import('../src/specialmeeting/forest/car.js');
const { PassengerRig } = await import('../src/specialmeeting/forest/passenger.js');
const { adaptMeetingSedan } = await import('../src/specialmeeting/forest/sedan-adapter.js');
const { createRideSequence } = await import('../src/specialmeeting/ride.js');
const {
  ARRIVAL_ROUTE,
  ROAD,
  SEDAN_STAGING,
  SEDAN_STOP,
  SIDEWALK,
  SPAWN,
  WAIT_SECONDS,
} = await import('../src/specialmeeting/layout.js');

const STEP = 1 / 60;

function runFor(sequence, seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) sequence.update(STEP);
  return sequence;
}

function runUntil(sequence, predicate, limitSeconds = 60) {
  let elapsed = 0;
  while (elapsed < limitSeconds && !predicate(sequence)) {
    sequence.update(STEP);
    elapsed += STEP;
  }
  return elapsed;
}

test('the sedan has four seats and the prospect-facing one is on the kerb', () => {
  const sedan = buildMeetingSedan();
  assert.deepEqual(SEAT_IDS.slice().sort(), Object.keys(SEATS).sort());
  assert.equal(SEAT_IDS.length, 4);

  sedan.placeAt(SEDAN_STOP.x, SEDAN_STOP.z, SEDAN_STOP.heading);
  const driver = sedan.seatWorld('driver');
  const passenger = sedan.seatWorld('front_passenger');
  const rearLeft = sedan.seatWorld('rear_left');
  const rearRight = sedan.seatWorld('rear_right');

  /* Parked heading east on the north kerb: the kerb is at negative z, so the
   * kerb-side seat is the one with the SMALLER z. It has to be the front
   * passenger. If this ever flips, the driver's door opens onto the pavement,
   * the prospect gets in behind somebody, and the scene is about nothing. */
  assert.ok(passenger.z < driver.z, 'the front passenger sits on the kerb side');
  assert.ok(rearRight.z < rearLeft.z, 'and the rear bench mirrors it');
  assert.ok(rearLeft.x < driver.x, 'the back seats are behind the front ones');

  // Both front seats are ahead of both rear seats, and all four are inside the car.
  const collider = sedan.collider();
  for (const id of SEAT_IDS) {
    const seat = sedan.seatWorld(id);
    assert.ok(collider.containsPoint(new THREE.Vector3(seat.x, 1, seat.z)), `${id} is inside the car`);
  }
});

test('the meeting sedan keeps the windscreen and side glass separately readable from inside', () => {
  const sedan = buildMeetingSedan();
  const sideGlass = sedan.car.glass;
  const sharedExteriorGlass = sedan.car.glassMat;
  const windscreen = sedan.group.getObjectByName('sedan.windscreen');

  assert.notEqual(sideGlass.material, sharedExteriorGlass,
    'the interior side-glass treatment must remain isolated from the shared exterior material');
  assert.equal(sharedExteriorGlass.opacity, 0.82,
    'opening this cabin must not wash out the standard exterior-car glazing');

  assert.equal(sideGlass.material.transparent, true);
  assert.equal(sideGlass.material.side, THREE.DoubleSide,
    'side and rear panes must render from the passenger compartment');
  assert.equal(sideGlass.material.depthWrite, false,
    'transparent side glass must not occlude the forest behind it in the depth buffer');
  assert.ok(sideGlass.material.opacity > 0.1 && sideGlass.material.opacity <= 0.24,
    `side glass opacity ${sideGlass.material.opacity} blocks the passenger's route view`);

  assert.ok(windscreen, 'the dedicated windscreen is missing');
  assert.equal(windscreen.material.transparent, true);
  assert.equal(windscreen.material.side, THREE.DoubleSide);
  assert.ok(windscreen.material.opacity > 0.05 && windscreen.material.opacity <= 0.2,
    `windscreen opacity ${windscreen.material.opacity} blocks the road`);
});

test('the door the player walks to is the front one, and it is on the pavement', () => {
  const sedan = buildMeetingSedan();
  sedan.placeAt(SEDAN_STOP.x, SEDAN_STOP.z, SEDAN_STOP.heading);
  const door = sedan.doorWorld('front_passenger');
  assert.ok(door.z < SIDEWALK.north.z0, 'you stand on the pavement to open it');
  assert.ok(door.z > SIDEWALK.north.z1, 'and not inside the building');
  const walk = Math.hypot(door.x - SPAWN.x, door.z - SPAWN.z);
  assert.ok(walk < 3, `it is two steps from where he is standing, not ${walk.toFixed(2)}m`);
});

test('the passenger-door interaction target follows the real door at person height', () => {
  const sedan = buildMeetingSedan();
  sedan.placeAt(SEDAN_STOP.x, SEDAN_STOP.z, SEDAN_STOP.heading);
  const target = createFrontPassengerDoorTarget(sedan);
  const door = sedan.doorWorld('front_passenger');
  const world = target.getWorldPosition(new THREE.Vector3());

  assert.equal(target.parent, sedan.group, 'the affordance must follow the moving car');
  assert.equal(target.userData.anchor, 'front_passenger_door');
  assert.ok(Math.abs(world.x - door.x) < 1e-9);
  assert.ok(Math.abs(world.z - door.z) < 1e-9);
  assert.ok(Math.abs(world.y - (door.y + FRONT_PASSENGER_DOOR_AFFORDANCE.centreHeight)) < 1e-9);

  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.04, 100);
  camera.position.set(SPAWN.x, SPAWN.groundY + 1.66, SPAWN.z);
  camera.rotation.set(0, SPAWN.yaw, 0, 'YXZ');
  camera.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.far = 2.7;
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  assert.ok(ray.intersectObject(target, false).length > 0,
    'the authored spawn crosshair can discover the passenger door at eye height');
});

test('the pickup men face the Prospect with their bodies and heads after the tableau is restaged', () => {
  const scene = new THREE.Scene();
  const sedan = buildMeetingSedan();
  scene.add(sedan.group);
  const cast = buildSpecialMeetingCast(scene, {
    sedan,
    colliders: [],
    groundAt: () => 0,
    faces: new Set(),
  });
  cast.boardForArrival();
  cast.disembarkForPickup();

  const door = sedan.doorWorld('front_passenger');
  const prospect = new THREE.Vector3(door.x + 0.65, 1.66, door.z - 0.55);
  for (let i = 0; i < 60; i++) cast.update(STEP, prospect);
  cast.holdTheFrontDoor();
  for (let i = 0; i < 60; i++) cast.update(STEP, prospect);

  for (const [key, name] of [['lag', 'Lag'], ['numbskull', 'Numbskull']]) {
    const npc = cast.byKey(key);
    const origin = npc.group.getWorldPosition(new THREE.Vector3());
    const toward = prospect.clone().sub(origin).setY(0).normalize();
    const bodyForward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(npc.group.getWorldQuaternion(new THREE.Quaternion()))
      .setY(0).normalize();
    const headForward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(npc.parts.head.getWorldQuaternion(new THREE.Quaternion()))
      .setY(0).normalize();

    assert.ok(bodyForward.dot(toward) > 0.9,
      `${name}'s body still points away from the Prospect (${bodyForward.dot(toward).toFixed(3)})`);
    assert.ok(headForward.dot(toward) > 0.9,
      `${name}'s head is still pinned at its gaze limit (${headForward.dot(toward).toFixed(3)})`);
  }
});

test('the boot is a hole with a lid, not a slab', () => {
  const sedan = buildMeetingSedan();
  for (const name of [
    'sedan.trunk.floor', 'sedan.trunk.tail', 'sedan.trunk.bulkhead', 'sedan.trunk.lid.panel',
  ]) {
    assert.ok(sedan.group.getObjectByName(name), `${name} is missing`);
  }
  assert.equal(sedan.group.getObjectByName('car.body.rear'), undefined,
    'the solid rear panel is gone — that is where he is');

  const floor = sedan.group.getObjectByName('sedan.trunk.floor');
  assert.ok(floor.scale.x > 0.7 && floor.scale.z > 1.5, 'a man has to fit in it');

  sedan.placeAt(0, 0, Math.PI / 2);
  const anchor = sedan.trunkWorld();
  assert.ok(anchor.x < -1.5, 'the boot is behind the car');
  assert.ok(anchor.y > 0.4 && anchor.y < 1.2, 'and at boot height');

  assert.equal(sedan.trunk.hinge.rotation.z, 0);
  sedan.setTrunk(1);
  for (let i = 0; i < 90; i++) sedan.update(STEP);
  assert.equal(sedan.trunkOpen, 1);
  assert.ok(sedan.trunk.hinge.rotation.z < -0.9, 'the lid is up');
  sedan.setTrunk(0);
  for (let i = 0; i < 90; i++) sedan.update(STEP);
  assert.ok(Math.abs(sedan.trunk.hinge.rotation.z) < 1e-9, 'and it shuts again');
});

test('the forest adapter advances the borrowed boot without stepping its physics', () => {
  const sedan = buildMeetingSedan();
  sedan.placeAt(12, -7, 0.4);
  const adapted = adaptMeetingSedan(sedan, { shadows: false });
  const pose = { x: sedan.vehicle.x, z: sedan.vehicle.z, heading: sedan.vehicle.heading };

  adapted.setTrunk(1);
  for (let i = 0; i < 90; i++) adapted.updateCabin(STEP, { speed: 0, distance: 0 });

  assert.equal(sedan.trunkOpen, 1, 'the forest-owned visual never opened the borrowed boot');
  assert.ok(sedan.trunk.hinge.rotation.z < -0.9, 'the lid did not visibly rise');
  assert.deepEqual(
    { x: sedan.vehicle.x, z: sedan.vehicle.z, heading: sedan.vehicle.heading },
    pose,
    'advancing presentation also stepped the dormant block physics',
  );
  adapted.dispose();
});

test('the authored reveal opens the boot and shuts it after Numbskull’s last word', () => {
  const stageDirections = [];
  const sequence = createRideSequence({
    onLine: () => 0.01,
    onStage: (line) => stageDirections.push({
      opens: line.opensTrunk === true,
      closes: line.closesTrunk === true,
      holdSeconds: line.holdSeconds ?? 0,
    }),
  });

  sequence.begin('SM-410', { phase: 'spur' });
  runUntil(sequence, (ride) => ride.beatId === 'SM-430', 20);

  assert.ok(stageDirections.some((line) => line.opens && line.holdSeconds >= 1.1),
    'SM-410 did not hold Kittenboss inside until the boot had visibly opened');
  assert.ok(stageDirections.some((line) => line.closes), 'SM-420 never asked the boot to shut');
  assert.equal(sequence.trunkOpen, false, 'story state still claims the reveal boot is open');
});

test('nothing happens for ten seconds, and then the headlights do', () => {
  const sedan = buildMeetingSedan();
  const phases = [];
  const sequence = createArrivalSequence({ sedan, onPhase: (phase) => phases.push(phase) });

  assert.equal(sequence.phase, 'waiting');
  assert.equal(sedan.headlightsOn, false);

  runFor(sequence, WAIT_SECONDS - 1);
  assert.equal(sequence.phase, 'waiting', 'nine seconds in, still nothing');
  assert.equal(sedan.headlightsOn, false);
  assert.equal(sedan.vehicle.x, SEDAN_STAGING.x, 'the car has not moved');
  assert.ok(
    Math.hypot(sedan.vehicle.x - SPAWN.x, sedan.vehicle.z - SPAWN.z) > 40,
    'and it is a long way off',
  );

  runFor(sequence, 2);
  assert.equal(sequence.phase, 'headlights');
  assert.equal(sedan.headlightsOn, true, 'the lights come on before the car moves');
  assert.equal(sedan.vehicle.speed, 0, 'it sits there for a beat with them on');

  runFor(sequence, 2);
  assert.equal(sequence.phase, 'approach');
  assert.ok(sedan.vehicle.speed > 0);
  assert.deepEqual(phases, ['headlights', 'approach']);
});

test('the car pulls up against the kerb outside the door, slowly', () => {
  const sedan = buildMeetingSedan();
  const sequence = createArrivalSequence({ sedan });
  const seconds = runUntil(sequence, (s) => s.phase === 'stopped', 70);

  assert.ok(seconds > WAIT_SECONDS + 8, `the drive is a beat, not a cut (${seconds.toFixed(1)}s)`);
  assert.ok(seconds < WAIT_SECONDS + 25, `and it does not become a wait (${seconds.toFixed(1)}s)`);

  const offset = Math.hypot(sedan.vehicle.x - SEDAN_STOP.x, sedan.vehicle.z - SEDAN_STOP.z);
  assert.ok(offset < 0.9, `it parks on its mark, ${offset.toFixed(2)}m off`);
  assert.ok(
    Math.abs(wrapAngle(sedan.vehicle.heading - SEDAN_STOP.heading)) < 0.25,
    'and roughly parallel with the kerb',
  );
  assert.equal(sedan.vehicle.speed, 0);

  // Off the kerb, not on it, and not out in the traffic lane either.
  const flank = sedan.vehicle.z - 1;
  assert.ok(flank > SIDEWALK.north.z0 - 0.25, 'the near side is not through the kerb');
  assert.ok(flank < SIDEWALK.north.z0 + 0.6, 'and it is not parked a metre out');

  // It sits there with the engine running before anything is said.
  assert.equal(sequence.settled, false);
  runFor(sequence, 2.5);
  assert.equal(sequence.settled, true);
});

/**
 * The car's actual footprint, not the axis-aligned box round it.
 *
 * A five-metre car at eleven degrees has an AABB three-quarters of a metre
 * wider than the car, and on a twelve-metre street that difference is the
 * difference between "drove past a hydrant" and "drove through a hydrant".
 * Four corners and a separating-axis test is the honest version.
 */
function footprint(vehicle, halfLength = 2.7, halfWidth = 1) {
  const forwardX = Math.sin(vehicle.heading);
  const forwardZ = Math.cos(vehicle.heading);
  const rightX = forwardZ;
  const rightZ = -forwardX;
  const corners = [];
  for (const along of [1, -1]) {
    for (const across of [1, -1]) {
      corners.push({
        x: vehicle.x + forwardX * halfLength * along + rightX * halfWidth * across,
        z: vehicle.z + forwardZ * halfLength * along + rightZ * halfWidth * across,
      });
    }
  }
  return { corners, axes: [{ x: forwardX, z: forwardZ }, { x: rightX, z: rightZ }] };
}

function overlaps(shape, box) {
  const boxCorners = [
    { x: box.min.x, z: box.min.z }, { x: box.max.x, z: box.min.z },
    { x: box.max.x, z: box.max.z }, { x: box.min.x, z: box.max.z },
  ];
  const axes = [...shape.axes, { x: 1, z: 0 }, { x: 0, z: 1 }];
  for (const axis of axes) {
    const project = (points) => points.reduce((range, point) => {
      const value = point.x * axis.x + point.z * axis.z;
      return { min: Math.min(range.min, value), max: Math.max(range.max, value) };
    }, { min: Infinity, max: -Infinity });
    const a = project(shape.corners);
    const b = project(boxCorners);
    if (a.max <= b.min || b.max <= a.min) return false;   // a separating axis
  }
  return true;
}

test('the arrival does not drive through the block on the way in', () => {
  const scene = new THREE.Scene();
  const block = buildSpecialMeetingBlock(scene, {});
  const sedan = buildMeetingSedan();
  const sequence = createArrivalSequence({ sedan });
  sequence.beginNow();

  /* Kerbs are stepped over by the player and driven over by everybody, and the
   * two end-of-block leashes are there to hold a man, not a car. Everything
   * else is something the sedan would visibly hit. */
  const hittable = block.colliders.filter((box) => (
    box.max.y > 0.25 && !block.boundaries.includes(box)
  ));
  const hits = new Set();
  runUntil(sequence, (s) => {
    const shape = footprint(sedan.vehicle);
    for (const box of hittable) {
      if (overlaps(shape, box)) hits.add(`${box.min.x.toFixed(1)},${box.min.z.toFixed(1)}`);
    }
    return s.phase === 'stopped';
  }, 60);

  assert.deepEqual([...hits], [], 'the sedan passed through these colliders');
});

test('four riders stay in their seats all the way out of the block', () => {
  const sedan = buildMeetingSedan();
  const sequence = createArrivalSequence({ sedan });
  runUntil(sequence, (s) => s.settled, 70);

  const riders = SEAT_IDS.map((id) => {
    const body = new THREE.Object3D();
    sedan.occupy(id, body, { drop: 0 });
    return { id, body };
  });
  assert.equal(sedan.seatsTaken, 4);
  sequence.update(STEP);

  const before = riders.map(({ body }) => body.getWorldPosition(new THREE.Vector3()));
  for (const [index, { id }] of riders.entries()) {
    assert.equal(riders[index].body.parent, sedan.seatAnchor(id), `${id} is parented to its seat`);
    assert.ok(before[index].distanceTo(sedan.seatWorld(id)) < 0.01, `${id} is on its seat`);
  }

  sequence.driveAway();
  const seconds = runUntil(sequence, (s) => s.phase === 'gone', 40);
  assert.ok(seconds < 25, 'it leaves rather than idling off into the fog');
  assert.ok(sedan.vehicle.x > 40, 'east, and out of the block');

  for (const [index, { id, body }] of riders.entries()) {
    const world = body.getWorldPosition(new THREE.Vector3());
    assert.ok(world.distanceTo(before[index]) > 30, `${id} went with the car`);
    assert.ok(world.distanceTo(sedan.seatWorld(id)) < 0.01, `${id} is still in its seat`);
  }

  sedan.release('rear_left');
  assert.equal(sedan.seatsTaken, 3);
});

test('the oversized rear passenger remains below the physical headliner', () => {
  const scene = new THREE.Scene();
  const sedan = buildMeetingSedan();
  scene.add(sedan.group);
  const cast = buildSpecialMeetingCast(scene, {
    sedan,
    colliders: [],
    groundAt: () => 0,
    faces: new Set(),
  });
  cast.boardForArrival();
  scene.updateMatrixWorld(true);

  const numbskull = new THREE.Box3().setFromObject(cast.byKey('numbskull').group);
  const headliner = new THREE.Box3().setFromObject(sedan.group.getObjectByName('sedan.headliner'));
  assert.ok(
    numbskull.max.y <= headliner.min.y - 0.015,
    `Numbskull crown ${numbskull.max.y.toFixed(3)} clips headliner ${headliner.min.y.toFixed(3)}`,
  );
  assert.equal(cast.byKey('numbskull').group.parent, sedan.seatAnchor('rear_right'),
    'headroom is solved at the seat offset, not by detaching him from the car');
});

test('the player eye stays on the same vehicle anchor from SM-195 into the forest', () => {
  const sedan = buildMeetingSedan();
  const sequence = createArrivalSequence({ sedan });
  sequence.snapToKerb();

  const camera = new THREE.PerspectiveCamera();
  const player = {
    camera,
    mode: 'walk',
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    roll: 0,
    sway: { yaw: 0, pitch: 0, roll: 0 },
    clearKeys() {},
    update() { camera.position.copy(this.position); },
  };
  const blockRig = new PassengerRig(player, sedan, { seat: 'frontPassenger' }).board();
  const start = player.position.clone();
  assert.ok(start.distanceTo(sedan.eyeWorld('front_passenger')) < 1e-8);

  sequence.driveAway();
  for (let i = 0; i < 5 / STEP; i++) {
    sequence.update(STEP);
    blockRig.update(STEP);
    assert.ok(player.position.distanceTo(sedan.eyeWorld('front_passenger')) < 1e-8,
      'the player left the VehicleOccupants eye anchor during SM-195');
    assert.ok(camera.position.distanceTo(player.position) < 1e-8,
      'the rendered camera chased the seat by a frame');
  }
  assert.ok(player.position.distanceTo(start) > 8, 'the camera stayed at the kerb while the car left');

  blockRig.release();
  const adapted = adaptMeetingSedan(sedan, { shadows: false });
  const beforeHandoff = player.position.clone();
  const forestRig = new PassengerRig(player, adapted, { seat: 'frontPassenger' }).board();
  assert.ok(player.position.distanceTo(beforeHandoff) < 1e-8,
    'the block-to-forest passenger handoff snapped to another seat');
  assert.equal(blockRig.seated, false);
  assert.equal(forestRig.seated, true);
  adapted.dispose();
});

test('the dormant forest sedan uses the same tip-at-lamp headlight invariant', () => {
  const scene = new THREE.Scene();
  const car = buildNightSedan(scene, { shadows: false });
  assert.equal(car.beams.length, 2);
  for (const beam of car.beams) {
    assert.deepEqual(beam.userData.headlightBeam, {
      axis: '+x', nearRadius: 0, farRadius: 4.6, reach: 27,
    });
    assert.ok(Math.abs(beam.position.x - (car.length / 2 - 0.1)) < 1e-8,
      'beam tip is not on the lamp fixture');
  }
  car.dispose();
});

test('the beat can be skipped or snapped to for a restart', () => {
  const sedan = buildMeetingSedan();
  const sequence = createArrivalSequence({ sedan });

  sequence.beginNow();
  sequence.update(STEP);
  assert.equal(sequence.phase, 'headlights', 'beginNow skips the wait, not the drive');

  sequence.reset();
  assert.equal(sequence.phase, 'waiting');
  assert.equal(sedan.headlightsOn, false);
  assert.equal(sedan.vehicle.x, SEDAN_STAGING.x);

  sequence.snapToKerb();
  assert.equal(sequence.phase, 'stopped');
  assert.equal(sequence.settled, true);
  assert.equal(sedan.headlightsOn, true);
  assert.ok(Math.hypot(sedan.vehicle.x - SEDAN_STOP.x, sedan.vehicle.z - SEDAN_STOP.z) < 0.01);
});

test('a forest checkpoint restores the authored road node without replaying it', () => {
  const callbacks = [];
  const car = {
    group: new THREE.Group(),
    length: 5.4,
    width: 2,
    setBrakeLights() {},
    steer() {},
    rollWheels() {},
  };
  const drive = new ForestDrive(car, { onNode: (id) => callbacks.push(id) });
  const arrival = ROAD_EVENTS.find((event) => event.id === 'arrival');

  drive.restoreAtEvent('arrival');

  assert.equal(drive.distance, arrival.s);
  assert.equal(drive.speed, 0);
  assert.equal(drive.running, false);
  assert.equal(drive.waitingAt, 'arrival');
  assert.equal(drive.arrived, true);
  assert.equal(callbacks.length, 0, 'a reload does not replay story callbacks');
  assert.ok(
    Math.hypot(car.group.position.x - roadAt(arrival.s).x, car.group.position.z - roadAt(arrival.s).z) < 2,
    'the restored car is physically at the authored spur',
  );

  drive.update(STEP);
  assert.deepEqual(callbacks, [], 'already-crossed road events stay crossed after restore');
});

test('the final exchange is tied to a moving road event before the arrival stop', () => {
  const approach = ROAD_EVENTS.find((event) => event.id === 'final_approach');
  const arrival = ROAD_EVENTS.find((event) => event.id === 'arrival');
  assert.ok(approach, 'the final exchange has no road event');
  assert.ok(arrival, 'the arrival stop has no road event');
  assert.equal(approach.stop, false, 'the final line must play in a moving car');
  assert.equal(arrival.stop, true);
  assert.ok(arrival.s - approach.s >= 70,
    `only ${(arrival.s - approach.s).toFixed(1)}m remain for the coda and fade`);
  assert.ok(arrival.s - approach.s <= 90,
    `the final exchange starts ${(arrival.s - approach.s).toFixed(1)}m before arrival`);
});

test('the forest owns the borrowed sedan lights and reconstructs the spur', () => {
  const scene = new THREE.Scene();
  const sedan = buildMeetingSedan();
  const car = adaptMeetingSedan(sedan, { shadows: false });
  const forest = createNightForestRoad({ scene, car, shadows: false });

  assert.equal(car.headlightsOn, false, 'the adapter starts dark until the forest takes ownership');
  forest.start();
  assert.equal(car.headlightsOn, true, 'starting the forest drive lights the borrowed car');

  forest.restoreAtNode('arrival');
  assert.equal(forest.drive.arrived, true);
  assert.equal(car.mainBeamOn, true, 'crossing the turn-off is reflected in restored lamp state');
  assert.equal(car.headlightsOn, true, 'the authored SM-330 light hold is reconstructed before shutdown');

  forest.killEngine();
  forest.killLights();
  assert.equal(forest.drive.running, false);
  assert.equal(car.headlightsOn, false);
  forest.dispose();
});

test('the route driver steers by the vehicle frame, not by a guess at it', () => {
  // heading 0 is +Z and PI/2 is +X, because that is how GroundVehicle integrates.
  assert.ok(Math.abs(bearingTo(0, 0, 0, 5) - 0) < 1e-9);
  assert.ok(Math.abs(bearingTo(0, 0, 5, 0) - Math.PI / 2) < 1e-9);
  assert.equal(wrapAngle(Math.PI * 3), Math.PI);
  assert.ok(Math.abs(wrapAngle(-Math.PI * 1.5) - Math.PI / 2) < 1e-9);

  const sedan = buildMeetingSedan();
  sedan.placeAt(SEDAN_STAGING.x, SEDAN_STAGING.z, SEDAN_STAGING.heading);
  const driver = new RouteDriver(sedan.vehicle, ARRIVAL_ROUTE);
  assert.equal(driver.done, false);
  assert.equal(driver.target, ARRIVAL_ROUTE[0]);

  // The last node is a parking space: it brakes into it and holds.
  let elapsed = 0;
  while (elapsed < 60 && !driver.done) {
    sedan.update(STEP, driver);
    elapsed += STEP;
  }
  assert.equal(driver.done, true);
  assert.equal(driver.holding, true);
  assert.equal(sedan.vehicle.speed, 0);
});

test('a route with stopAtEnd off finishes by leaving, not by stopping', () => {
  const sedan = buildMeetingSedan();
  sedan.placeAt(0, 0, Math.PI / 2);
  const driver = new RouteDriver(
    sedan.vehicle,
    [{ x: 20, z: 0, speed: 8 }, { x: 60, z: 0, speed: 10 }],
    { stopAtEnd: false },
  );
  let elapsed = 0;
  while (elapsed < 40 && !driver.done) {
    sedan.update(STEP, driver);
    elapsed += STEP;
  }
  assert.equal(driver.done, true);
  assert.ok(sedan.vehicle.speed > 5, 'it is still going when the route runs out');
  assert.ok(sedan.vehicle.x > 55);
});

test('the sedan tracks the vehicle: mesh yaw carries the car-is-long-on-X offset', () => {
  const sedan = buildMeetingSedan();
  sedan.placeAt(4, -3, Math.PI / 2);
  assert.ok(Math.abs(sedan.group.rotation.y) < 1e-9, 'heading PI/2 points the model down +X');
  assert.equal(sedan.group.position.x, 4);
  assert.equal(sedan.group.position.z, -3);

  sedan.placeAt(0, 0, 0);
  assert.ok(Math.abs(sedan.group.rotation.y + Math.PI / 2) < 1e-9);

  // Headlights and brake lights are material state, not lights we forgot to add.
  sedan.setHeadlights(true);
  assert.ok(sedan.lights.spot.intensity > 0);
  assert.ok(sedan.car.heads.every((head) => head.material.emissiveIntensity > 1));
  sedan.setBrake(1);
  const braking = sedan.car.tails[0].material.emissiveIntensity;
  sedan.setBrake(0);
  assert.ok(braking > sedan.car.tails[0].material.emissiveIntensity, 'the brake is the same bulb harder');
  sedan.setHeadlights(false);
  assert.equal(sedan.lights.spot.intensity, 0);
  assert.equal(sedan.headlightsOn, false);
});

test('one shadow-casting light in the car, and it is none of them', () => {
  const sedan = buildMeetingSedan();
  const lights = [];
  sedan.group.traverse((object) => { if (object.isLight) lights.push(object); });
  assert.equal(lights.length, 1, 'two headlamps, one beam');
  assert.equal(lights[0].castShadow, false);
  assert.ok(ROAD.kerbHeight > 0, 'the kerb the beam sweeps is real');
});
