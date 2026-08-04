import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  BARRIERS, ESCAPE_START, HEADING_VECTORS, ROUTE_NODES, ROUTE_ROADS, turnFrom,
} from '../src/heist/city.js';
import { intersectsDrivingObstacle } from '../src/heist/geometry.js';
import { buildHeistLevel } from '../src/heist/level.js';
import { HEIST_PENDING_DIALOGUE, HEIST_DIALOGUE } from '../src/heist/script.js';

/**
 * The owner's note was that the calls and the road disagreed, and that the
 * ROAD is the thing that is wrong. So these tests do not check the road against
 * a remembered coordinate; they re-derive the road from the instructions.
 */

test('turn handedness matches right = forward x up in this coordinate frame', () => {
  const up = new THREE.Vector3(0, 1, 0);
  for (const [heading, vector] of Object.entries(HEADING_VECTORS)) {
    const forward = new THREE.Vector3(vector.x, 0, vector.z);
    const right = forward.clone().cross(up).normalize();
    const left = right.clone().negate();
    const rightName = Object.entries(HEADING_VECTORS)
      .find(([, v]) => Math.abs(v.x - right.x) < 1e-6 && Math.abs(v.z - right.z) < 1e-6)[0];
    const leftName = Object.entries(HEADING_VECTORS)
      .find(([, v]) => Math.abs(v.x - left.x) < 1e-6 && Math.abs(v.z - left.z) < 1e-6)[0];
    assert.equal(turnFrom(heading, 'right'), rightName, `right of ${heading}`);
    assert.equal(turnFrom(heading, 'left'), leftName, `left of ${heading}`);
    assert.equal(turnFrom(heading, 'straight'), heading);
  }
});

test('the drive actually goes the way the authored calls say it goes', () => {
  // Rippinflow's lines: "Left out ... Left at the warehouse ... then right at
  // the glass tower", Snow's "Center gap", then the canal. Left, left, right,
  // straight, left. If a road ever disagrees with this list again, this fails.
  assert.deepEqual(ROUTE_NODES.map((node) => node.turn),
    ['left', 'left', 'right', 'straight', 'left', 'stop']);

  let heading = 'N';
  let from = { x: ESCAPE_START.x, z: ESCAPE_START.z };
  for (const node of ROUTE_NODES) {
    assert.equal(node.heading, heading,
      `${node.id} is reached heading ${heading}, but is authored as ${node.heading}`);
    const travelled = { x: node.x - from.x, z: node.z - from.z };
    const expected = HEADING_VECTORS[heading];
    // The leg has to actually run in the heading it claims: forward distance
    // positive, and no sideways drift at all (these are city streets).
    const forward = travelled.x * expected.x + travelled.z * expected.z;
    const sideways = Math.abs(travelled.x * expected.z - travelled.z * expected.x);
    assert.ok(forward > 20, `${node.id} leg is only ${forward} m of ${heading}`);
    assert.equal(sideways, 0, `${node.id} leg drifts ${sideways} m sideways`);
    heading = turnFrom(heading, node.turn);
    from = { x: node.x, z: node.z };
  }
});

test('the HUD label at every junction names the turn the geometry makes', () => {
  for (const node of ROUTE_NODES) {
    if (node.turn === 'left') assert.match(node.label, /^LEFT/, node.id);
    if (node.turn === 'right') assert.match(node.label, /^RIGHT/, node.id);
    if (node.turn === 'straight') assert.match(node.label, /CENTER|STRAIGHT/, node.id);
  }
});

test('the spoken calls agree with the junctions they announce', () => {
  const all = { ...HEIST_DIALOGUE, ...HEIST_PENDING_DIALOGUE };
  // "Left at the warehouse ... then right at the glass tower" is one line and
  // it covers two junctions; both have to still be that way round.
  assert.match(all.rippin_market_left.text, /Left at the warehouse/);
  assert.match(all.rippin_market_left.text, /right at the glass tower/);
  assert.equal(ROUTE_NODES.find((node) => node.id === 'warehouse_left').turn, 'left');
  assert.equal(ROUTE_NODES.find((node) => node.id === 'tower_right').turn, 'right');
  assert.match(all.rippin_drive.text, /Left out/);
  assert.equal(ROUTE_NODES[0].turn, 'left');
  assert.match(all.snow_roadblock.text, /Center gap/);
  assert.equal(ROUTE_NODES.find((node) => node.id === 'roadblock').turn, 'straight');
});

test('every leg of the route is carried by a road that reaches both ends', () => {
  const onRoad = (x, z) => ROUTE_ROADS.some((road) => (
    Math.abs(x - road.x) <= road.w / 2 && Math.abs(z - road.z) <= road.d / 2
  ));
  let from = { x: ESCAPE_START.x, z: ESCAPE_START.z };
  assert.ok(onRoad(from.x, from.z), 'the escape car does not start on a road');
  for (const node of ROUTE_NODES) {
    for (let t = 0; t <= 1; t += 0.05) {
      const x = from.x + (node.x - from.x) * t;
      const z = from.z + (node.z - from.z) * t;
      assert.ok(onRoad(x, z), `${node.id} leg leaves the road at ${x},${z}`);
    }
    from = { x: node.x, z: node.z };
  }
});

test('every wrong turn out of a junction dead-ends in a barrier', () => {
  const level = buildHeistLevel(new THREE.Scene());
  const { obstacles } = level.phases.driving;
  let heading = 'N';
  for (const node of ROUTE_NODES) {
    const taken = turnFrom(heading, node.turn);
    for (const option of ['left', 'right', 'straight']) {
      const direction = turnFrom(node.heading, option);
      if (direction === taken) continue;
      const vector = HEADING_VECTORS[direction];
      // Walk out of the junction. Either the road runs out (off-road, which the
      // scene already punishes) or a barrier stops the car inside 26 m.
      let blocked = false;
      for (let d = 2; d <= 26; d += 1) {
        const x = node.x + vector.x * d;
        const z = node.z + vector.z * d;
        if (intersectsDrivingObstacle(x, z, obstacles)) { blocked = true; break; }
        const stillRoad = ROUTE_ROADS.some((road) => (
          Math.abs(x - road.x) <= road.w / 2 && Math.abs(z - road.z) <= road.d / 2
        ));
        if (!stillRoad) { blocked = true; break; }
      }
      assert.ok(blocked, `${node.id}: you can drive ${direction} forever instead of ${taken}`);
    }
    heading = taken;
  }
});

test('the authored barriers sit on roads rather than in the scenery', () => {
  assert.ok(BARRIERS.length >= 8, `only ${BARRIERS.length} barriers`);
  for (const barrier of BARRIERS) {
    const road = ROUTE_ROADS.find((r) => (
      Math.abs(barrier.x - r.x) <= r.w / 2 + 2 && Math.abs(barrier.z - r.z) <= r.d / 2 + 2
    ));
    assert.ok(road, `barrier ${barrier.id} blocks nothing`);
  }
});

test('the route the runtime drives is the route the city authored', () => {
  const level = buildHeistLevel(new THREE.Scene());
  assert.deepEqual(level.phases.driving.route.map((node) => node.id),
    ROUTE_NODES.map((node) => node.id));
  assert.equal(level.phases.driving.pursuers.length, 3);
  assert.equal(level.phases.driving.car.position.x, ESCAPE_START.x);
  assert.equal(level.phases.driving.car.position.z, ESCAPE_START.z);
});
