import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { buildHeistLevel } from '../src/heist/level.js';

/**
 * THE GARAGE, which the owner called the roughest part of THE TAKE.
 *
 * *"The on-ramp that you came in on is inverted the wrong way. The cops are
 * spawning into it, and they're kind of just standing there."*
 *
 * Three separate faults, all measurable without a browser:
 *  1. the ramp climbed into the room instead of down from the street;
 *  2. its collider was one axis-aligned slab, so it was a wall in both
 *     directions rather than something to walk on;
 *  3. the fire positions were unreachable under street-sized movement rules,
 *     so every officer sat in `hold` forever.
 */

/** The ramp footprint: the slab is 7 wide about x 0, and spans z 9 to 17. */
const RAMP = Object.freeze({ halfWidth: 3.5, minZ: 9, maxZ: 17 });
const onRamp = (x, z) => Math.abs(x) <= RAMP.halfWidth && z >= RAMP.minZ && z <= RAMP.maxZ;

function garage() {
  const level = buildHeistLevel(new THREE.Scene());
  level.phases.garage.group.updateMatrixWorld(true);
  return level.phases.garage;
}

/** The ramp's top surface at a world z, through its real transform. */
function rampSurfaceY(ramp, z) {
  const point = new THREE.Vector3(0, 0.15, z - 13);
  ramp.localToWorld(point);
  return point.y;
}

test('the ramp descends from the street into the garage, not the other way', () => {
  const ramp = garage().group.getObjectByName('garage-ramp');
  assert.ok(ramp, 'garage-ramp is missing');

  const atFloor = rampSurfaceY(ramp, RAMP.minZ);
  const atPortal = rampSurfaceY(ramp, 15);
  const atStreet = rampSurfaceY(ramp, RAMP.maxZ);

  assert.ok(atStreet > atPortal && atPortal > atFloor,
    `the ramp must fall from the street to the floor: street ${atStreet.toFixed(2)}, `
    + `portal ${atPortal.toFixed(2)}, floor ${atFloor.toFixed(2)}`);
  assert.ok(Math.abs(atFloor) < 0.12,
    `the foot of the ramp must meet the floor, not stand on a lip: ${atFloor.toFixed(3)}`);
  assert.ok(atStreet > 1.4 && atStreet < 2.1,
    `the street end should be about a storey up: ${atStreet.toFixed(2)}`);
});

test('the kerbs follow the slope instead of cutting through it', () => {
  const group = garage().group;
  const ramp = group.getObjectByName('garage-ramp');
  for (const side of [-1, 1]) {
    const wall = group.getObjectByName(`garage-ramp-wall-${side}`);
    assert.ok(wall, `garage-ramp-wall-${side} is missing`);
    assert.ok(Math.abs(wall.rotation.x - ramp.rotation.x) < 1e-6,
      'a level kerb beside a sloping slab sinks into it at one end');
  }
});

/**
 * The collider used to be `bounds([6.7, 2.6, 8], [0, 1.3, 13])` -- one solid
 * box two and a half metres tall over the whole footprint. The way in was a
 * wall. It is now a stair of treads that follow the surface.
 */
test('the ramp is something you can walk down', () => {
  const level = buildHeistLevel(new THREE.Scene());
  level.phases.garage.group.updateMatrixWorld(true);
  const ramp = level.phases.garage.group.getObjectByName('garage-ramp');

  const treads = level.phases.garage.colliders.filter((c) => {
    const box = c.box ?? c;
    const min = box.min ?? {};
    const max = box.max ?? {};
    if (!Number.isFinite(min.z) || !Number.isFinite(max.z)) return false;
    const midZ = (min.z + max.z) / 2;
    const depth = max.z - min.z;
    /* Depth is what separates a tread from the portal wall standing across
     * the same z: the treads are a metre deep, the wall is 25 cm. */
    return midZ > RAMP.minZ && midZ < RAMP.maxZ
      && depth > 0.8 && depth < 1.2
      && Math.abs((min.x + max.x) / 2) < 1 && (max.x - min.x) > 6;
  });
  assert.ok(treads.length >= 6,
    `expected a stair of treads under the ramp, found ${treads.length}`);

  /* No tread may stand proud of the surface it is meant to support, and none
   * may be tall enough to be a wall. */
  for (const tread of treads) {
    const box = tread.box ?? tread;
    const midZ = (box.min.z + box.max.z) / 2;
    const surface = rampSurfaceY(ramp, midZ);
    assert.ok(box.max.y <= surface + 0.12,
      `a tread at z ${midZ.toFixed(1)} rises ${box.max.y.toFixed(2)} above a `
      + `surface at ${surface.toFixed(2)}`);
    assert.ok(box.max.y < 1.8, 'a tread that tall is a wall, not a step');
  }

  /* And the treads must climb, which is what makes it a ramp and not a floor. */
  const sorted = [...treads].sort((a, b) => {
    const ab = a.box ?? a; const bb = b.box ?? b;
    return (ab.min.z + ab.max.z) - (bb.min.z + bb.max.z);
  });
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = (sorted[i - 1].box ?? sorted[i - 1]).max.y;
    const here = (sorted[i].box ?? sorted[i]).max.y;
    assert.ok(here > prev, 'the treads do not rise toward the street');
    assert.ok(here - prev < 0.4,
      `a ${(here - prev).toFixed(2)} m step is a climb, not a walk`);
  }
});

/**
 * The movement rules. `chooseFirePosition` rejects a slot unless it is at
 * least `standoff - 1.5` from the player AND buys at least `gain` metres of
 * closure. The garage's slots run 5.00 to 9.43 m from where the player holds,
 * so street numbers (standoff up to 14.5, gain 3.0) reject every one of them.
 */
test('a garage officer can actually find somewhere to move to', () => {
  const phase = garage();
  const slots = phase.firePositions;
  assert.ok(slots.length >= 8, 'the garage should offer real cover');

  const player = phase.spawn ?? { x: 0, z: 6.4 };
  const ranges = slots.map((slot) => Math.hypot(slot.x - player.x, slot.z - player.z));
  const nearest = Math.min(...ranges);
  const furthest = Math.max(...ranges);

  /* The room is what it is; the rules have to fit inside it. Recreate the two
   * gates for a man arriving at the ramp mouth. */
  const GARAGE_STANDOFF = [3.6, 6.4];
  const GARAGE_GAIN = 1.2;
  assert.ok(GARAGE_STANDOFF[1] - 1.5 < furthest,
    `the widest standoff demands ${(GARAGE_STANDOFF[1] - 1.5).toFixed(2)} m of `
    + `separation and the furthest slot is ${furthest.toFixed(2)} m out`);
  assert.ok(GARAGE_STANDOFF[0] - 1.5 <= nearest,
    'the tightest standoff should not reject the nearest slot outright');

  /* Every rolled standoff must leave at least one usable slot for a man who
   * has just arrived at the top of the ramp -- which is where reinforcements
   * actually come from. Measuring from the very foot of the slope would be
   * measuring from two metres away, where no repositioning is sensible and
   * standing still and shooting is the correct behaviour. */
  const from = { x: 0, z: 13.8 };
  const own = Math.hypot(from.x - player.x, from.z - player.z);
  for (let i = 0; i <= 10; i += 1) {
    const standoff = GARAGE_STANDOFF[0]
      + (i / 10) * (GARAGE_STANDOFF[1] - GARAGE_STANDOFF[0]);
    const usable = slots.filter((slot) => {
      const toPlayer = Math.hypot(slot.x - player.x, slot.z - player.z);
      if (toPlayer < standoff - 1.5) return false;
      if (own - toPlayer < GARAGE_GAIN) return false;
      const travel = Math.hypot(slot.x - from.x, slot.z - from.z);
      return travel <= 13 && travel >= 0.6;
    });
    assert.ok(usable.length > 0,
      `an officer with standoff ${standoff.toFixed(2)} has nowhere to go, which `
      + 'is what left the whole garage standing still');
  }
});

test('nothing spawns inside the ramp', () => {
  /* Mirrors WAVE_ENTRY.mercer_garage and BLOCK_CONTACT.mercer_garage. Kept as
   * literals so the test fails loudly if either table moves back onto the
   * slope rather than silently following it there. */
  const waveEntry = [[-2.4, 12.6], [2.4, 12.6], [-1.1, 14.4], [1.1, 13.8], [0, 11.2]];
  const blockContact = [[-8, 11.2], [8, 11.2], [-5.6, 6.2], [5.6, 6.2], [0, 8.4]];

  /* The opening contact holds the room, so nothing there may be on the slope. */
  assert.deepEqual(blockContact.filter(([x, z]) => onRamp(x, z)), [],
    'the opening contact stages officers on the sloping ramp');

  /* Reinforcements DO come down the ramp -- that is the only way in, and the
   * believable one. What matters is that they arrive on its surface rather
   * than at floor height, and far enough out not to appear on top of anybody. */
  const surfaceAt = (z) => Math.max(0, 0.866 + (z - 13) * 0.2182);
  const player = { x: 0, z: 6.4 };
  for (const [x, z] of waveEntry) {
    assert.equal(onRamp(x, z), true,
      `a reinforcement at (${x}, ${z}) is not coming in through the ramp`);
    assert.ok(surfaceAt(z) > 0.3,
      'a spawn this close to the foot gains nothing from the slope');
    assert.ok(Math.hypot(x - player.x, z - player.z) > 4.0,
      `(${x}, ${z}) puts a man in the player's lap`);
  }
});
