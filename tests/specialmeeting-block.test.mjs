/**
 * THE SPECIAL MEETING — the block outside the flat.
 *
 * The scene is a man standing on a pavement for a long time, so the pavement
 * has to survive being looked at. These are the things that would break it
 * quietly:
 *
 *   - a hole in the block, where a player walks past the last building and
 *     out into nothing;
 *   - a scatter that reshuffles on reload, which makes the street unlearnable
 *     and makes the geometry gate unable to compare two runs;
 *   - street furniture standing in the lane the sedan drives down, which does
 *     not fail anything, it just puts a car through a hydrant on arrival;
 *   - the lighting budget quietly growing a point light per lamp post.
 *
 * Nothing here draws a pixel. The shared DOM shim is enough for the canvas
 * textures, and the geometry is just numbers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { buildSpecialMeetingBlock } = await import('../src/specialmeeting/block.js');
const {
  SPECIAL_MEETING_GEOMETRY_STATES,
  buildSpecialMeetingRuntimeGeometry,
} = await import('../src/specialmeeting/runtime-geometry.js');
const {
  ALLEY,
  APARTMENT,
  ARRIVAL_ROUTE,
  EASTBOUND_LANE_Z,
  NORTH_PARKING_Z,
  PARKING,
  ROAD,
  SIDEWALK,
  SPAWN,
  SEDAN_STOP,
  groundAt,
  onRoad,
} = await import('../src/specialmeeting/layout.js');

function build() {
  const scene = new THREE.Scene();
  const lightsSeen = [];
  const block = buildSpecialMeetingBlock(scene, { registerLight: (light) => lightsSeen.push(light) });
  return { scene, block, lightsSeen };
}

function named(root, name) {
  const found = [];
  root.traverse((object) => {
    if (object.name === name) found.push(object);
  });
  return found;
}

function anyNameMatching(root, pattern) {
  const found = [];
  root.traverse((object) => {
    if (pattern.test(object.name ?? '')) found.push(object);
  });
  return found;
}

test('the block builds a road, two pavements and the building the player lives in', () => {
  const { block } = build();
  assert.equal(named(block.group, 'block.road').length, 1);
  assert.equal(named(block.group, 'block.pavement.north').length, 1);
  assert.equal(named(block.group, 'block.pavement.south').length, 1);
  assert.equal(named(block.group, 'apartment.shell').length, 1);

  const road = named(block.group, 'block.road')[0];
  assert.equal(road.scale.z, ROAD.halfWidth * 2, 'the road is as wide as the layout says');

  // The pavements meet the kerb faces and the building lines, with nothing between.
  const north = named(block.group, 'block.pavement.north')[0];
  const depth = Math.abs(SIDEWALK.north.z1 - SIDEWALK.north.z0);
  assert.ok(Math.abs(north.scale.z - depth) < 1e-6);
  assert.equal(north.position.y, ROAD.kerbHeight / 2);
});

test('the front door, the alley and the parking are all actually built', () => {
  const { block } = build();
  // The door he comes out of, and the things around it that say somebody lives here.
  assert.equal(named(block.group, 'entrance.doors').length, 1);
  assert.equal(named(block.group, 'entrance.number').length, 1);
  assert.equal(named(block.group, 'entrance.buzzers').length, 1);
  assert.equal(named(block.group, 'entrance.step.lower').length, 1);
  assert.equal(named(block.group, 'entrance.step.upper').length, 1);
  assert.equal(named(block.group, 'entrance.light').length, 1);

  // The alley: a floor, a dead end, bins, a lit service door.
  assert.equal(named(block.group, 'alley.floor').length, 1);
  assert.equal(named(block.group, 'alley.dead-end').length, 1);
  assert.equal(named(block.group, 'alley.service-door').length, 1);
  assert.equal(named(block.group, 'alley.light').length, 1);
  assert.ok(named(block.group, 'dumpster.body').length === 1, 'one dumpster');
  assert.ok(anyNameMatching(block.group, /^alley\.crate$/).length >= 3, 'crates against the wall');

  // Parking: an apron, painted bays, and cars in some of them.
  assert.equal(named(block.group, 'parking.apron').length, 1);
  assert.equal(
    anyNameMatching(block.group, /^parking\.bay-line/).length,
    PARKING.bays + 1,
    'four bays takes five lines',
  );
  assert.equal(named(block.group, 'parking.sign').length, 1);

  // Across the road, and above it.
  assert.equal(named(block.group, 'south.laundromat.sign').length, 1);
  assert.equal(named(block.group, 'south.grille.laundromat').length, 1);
  assert.equal(named(block.group, 'south.shoe-repair.sign').length, 1);
  assert.ok(anyNameMatching(block.group, /^pole\.trunk$/).length >= 4, 'utility poles');
  assert.ok(anyNameMatching(block.group, /^block\.wire$/).length >= 8, 'wires between them');
  assert.equal(anyNameMatching(block.group, /^block\.service-drop$/).length, 2);

  // Fire escapes: one on the front of the building, one in the alley, one over the road.
  const escapes = anyNameMatching(block.group, /fire-escape$/).filter((o) => o.isGroup);
  assert.ok(escapes.length >= 3, `expected at least three fire escapes, saw ${escapes.length}`);
});

test('the skyline is three instanced draws and no lights at all', () => {
  const { block } = build();
  const instanced = [];
  block.group.traverse((object) => {
    if (object.isInstancedMesh) instanced.push(object.name);
  });
  assert.deepEqual(instanced.sort(), [
    'skyline.blocks', 'skyline.rooftops', 'skyline.warning-lights',
  ]);
  const skyline = block.group.getObjectByName('block.skyline');
  let lights = 0;
  skyline.traverse((object) => { if (object.isLight) lights++; });
  assert.equal(lights, 0, 'the city behind the block is emissive, not lit');
});

test('the lighting budget is five practicals and they are the authored five', () => {
  const { block, lightsSeen } = build();
  assert.equal(block.lights.length, 5);
  assert.deepEqual(
    block.lights.map((light) => light.name).sort(),
    [
      'alley.light',
      'entrance.light',
      'streetlamp.light.-10',
      'streetlamp.light.14',
      'streetlamp.light.6',
    ],
  );
  assert.deepEqual(lightsSeen, block.lights, 'every practical is offered to a light scheduler');
  for (const light of block.lights) {
    assert.equal(light.castShadow, false, 'no practical casts a shadow at night here');
  }
});

test('the block is identical on every load', () => {
  const digest = (root) => {
    const rows = [];
    root.traverse((object) => {
      if (!object.isMesh && !object.isLight) return;
      rows.push([
        object.name,
        object.position.x.toFixed(4),
        object.position.y.toFixed(4),
        object.position.z.toFixed(4),
        object.rotation.y.toFixed(4),
      ].join(','));
    });
    return rows.join(';');
  };
  assert.equal(digest(build().block.group), digest(build().block.group));
});

test('the parked cars are in the parking lane, not the travel lane', () => {
  const { block } = build();
  /* Every kerb-side car and the space the sedan takes are the same lane, which
   * is the whole reason the road is twelve metres wide. If a car ends up in the
   * travel lane the arrival drives through it and nothing anywhere says so. */
  const travel = new THREE.Box3(
    new THREE.Vector3(-38, 0.3, EASTBOUND_LANE_Z - 1.1),
    new THREE.Vector3(34, 2, EASTBOUND_LANE_Z + 1.1),
  );
  const inTravelLane = block.colliders.filter((box) => (
    box.max.y > 0.3 && box.max.y < 2.6 && box.max.x - box.min.x < 8 && box.intersectsBox(travel)
  ));
  assert.deepEqual(inTravelLane.map((box) => box.min.z.toFixed(2)), []);
  assert.ok(NORTH_PARKING_Z < EASTBOUND_LANE_Z, 'the parking lane is outside the travel lane');
});

test('the block has no hole in it: every direction off the pavement is closed', () => {
  const { block } = build();
  /* Walk the building line at chest height and look for a stretch of it that
   * no collider covers. The gap between the building and the parking was one
   * of these until it was walled, and it is the exact failure that tells a
   * player how big the set is. */
  const gaps = { north: [], south: [] };
  for (let x = -37; x < 33; x += 0.5) {
    const isAlley = x > ALLEY.minX - 0.3 && x < ALLEY.maxX + 0.3;
    const isDoor = Math.abs(x - APARTMENT.entranceX) < APARTMENT.entranceWidth / 2;
    const isDriveway = x > PARKING.curbCut.minX - 0.3 && x < PARKING.curbCut.maxX + 0.3;
    for (const side of ['north', 'south']) {
      if (side === 'north' && (isAlley || isDoor || isDriveway)) continue;
      const line = SIDEWALK[side].z1;
      const inward = side === 'north' ? -1 : 1;
      const probe = new THREE.Box3(
        new THREE.Vector3(x - 0.25, 0.8, line + inward * (side === 'north' ? 0.6 : 0.1)),
        new THREE.Vector3(x + 0.25, 1.4, line + inward * (side === 'north' ? 0.1 : 0.6)),
      );
      if (!block.colliders.some((box) => box.intersectsBox(probe))) gaps[side].push(x.toFixed(1));
    }
  }
  assert.deepEqual(gaps, { north: [], south: [] }, 'the building lines have holes in them');
});

test('the player spawns on the pavement outside his own front door', () => {
  const { block } = build();
  assert.equal(onRoad(SPAWN.x, SPAWN.z), false, 'he comes out onto a pavement, not a road');
  assert.equal(groundAt(SPAWN.x, SPAWN.z), ROAD.kerbHeight);
  assert.equal(groundAt(0, 0), 0, 'the carriageway is the datum');
  assert.equal(SPAWN.x, APARTMENT.entranceX);
  assert.ok(
    Math.abs(SPAWN.z - SIDEWALK.north.z1) < Math.abs(SPAWN.z - SIDEWALK.north.z0),
    'he starts nearer the door than the kerb',
  );
  // And he can reach the kerb: no collider between the doorstep and the road.
  const walk = new THREE.Box3(
    new THREE.Vector3(SPAWN.x - 0.35, 0.2, SIDEWALK.north.z0 + 0.1),
    new THREE.Vector3(SPAWN.x + 0.35, 1.6, SPAWN.z),
  );
  const blocked = block.colliders.filter((box) => box.max.y > 0.3 && box.intersectsBox(walk));
  assert.deepEqual(blocked.map((box) => box.min.x.toFixed(1)), []);
});

test('the door he came out of is the one interactable the block owns', () => {
  const { block } = build();
  assert.equal(block.interactables.length, 1);
  const [door] = block.interactables;
  assert.equal(door.id, 'apartment-door');
  assert.equal(door.mesh.name, 'entrance.doors');
  assert.match(door.label, /door/i);
});

test('the arrival route stays on the carriageway once it is on the block', () => {
  for (const node of ARRIVAL_ROUTE) {
    if (node.x < -40) continue;                    // still on the cross street
    assert.ok(onRoad(node.x, node.z), `route node ${node.x},${node.z} is off the road`);
  }
});

test('dispose lets go of the block', () => {
  const { scene, block } = build();
  assert.ok(scene.children.includes(block.group));
  block.dispose();
  assert.equal(scene.children.includes(block.group), false);
});

test('the headless geometry builder produces both authored states', () => {
  /* The strict geometry gate needs a builder Node can import without WebGL.
   * It is not registered in tools/geometry-scenes.mjs yet — that registry and
   * its exhaustiveness test belong to whoever lands this scene's page and
   * campaign id — so this is what keeps the builder honest until then. */
  assert.deepEqual([...SPECIAL_MEETING_GEOMETRY_STATES], ['waiting', 'arrived']);
  assert.throws(
    () => buildSpecialMeetingRuntimeGeometry(new THREE.Scene(), { state: 'nonsense' }),
    /unknown state/,
  );

  const waiting = buildSpecialMeetingRuntimeGeometry(new THREE.Scene(), { state: 'waiting' });
  const arrived = buildSpecialMeetingRuntimeGeometry(new THREE.Scene(), { state: 'arrived' });
  for (const built of [waiting, arrived]) {
    assert.deepEqual(built.roots.map(({ id }) => id),
      ['specialmeeting.block', 'specialmeeting.sedan']);
    for (const { root } of built.roots) assert.equal(typeof root.traverse, 'function');
    assert.ok(built.colliders.length > 20);
  }

  assert.ok(waiting.sedan.vehicle.z < -20, 'waiting: the car is off the block');
  assert.equal(waiting.sedan.headlightsOn, false);
  assert.ok(Math.abs(arrived.sedan.vehicle.z - SEDAN_STOP.z) < 0.01, 'arrived: at the kerb');
  assert.equal(arrived.sedan.headlightsOn, true);
  assert.ok(arrived.sedan.trunk.hinge.rotation.z < -0.9, 'with the boot open');
});
