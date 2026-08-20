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
const { buildSpecialMeetingBlock } = await import('../src/specialmeeting/block.js');
const { createArrivalSequence } = await import('../src/specialmeeting/arrival.js');
const { RouteDriver, bearingTo, wrapAngle } = await import('../src/specialmeeting/drive.js');
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

test('the door the player walks to is the front one, and it is on the pavement', () => {
  const sedan = buildMeetingSedan();
  sedan.placeAt(SEDAN_STOP.x, SEDAN_STOP.z, SEDAN_STOP.heading);
  const door = sedan.doorWorld('front_passenger');
  assert.ok(door.z < SIDEWALK.north.z0, 'you stand on the pavement to open it');
  assert.ok(door.z > SIDEWALK.north.z1, 'and not inside the building');
  const walk = Math.hypot(door.x - SPAWN.x, door.z - SPAWN.z);
  assert.ok(walk < 3, `it is two steps from where he is standing, not ${walk.toFixed(2)}m`);
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

  const before = riders.map(({ body }) => body.position.clone());
  for (const [index, { id }] of riders.entries()) {
    assert.ok(before[index].distanceTo(sedan.seatWorld(id)) < 0.01, `${id} is on its seat`);
  }

  sequence.driveAway();
  const seconds = runUntil(sequence, (s) => s.phase === 'gone', 40);
  assert.ok(seconds < 25, 'it leaves rather than idling off into the fog');
  assert.ok(sedan.vehicle.x > 40, 'east, and out of the block');

  for (const [index, { id, body }] of riders.entries()) {
    assert.ok(body.position.distanceTo(before[index]) > 30, `${id} went with the car`);
    assert.ok(body.position.distanceTo(sedan.seatWorld(id)) < 0.01, `${id} is still in its seat`);
  }

  sedan.release('rear_left');
  assert.equal(sedan.seatsTaken, 3);
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
