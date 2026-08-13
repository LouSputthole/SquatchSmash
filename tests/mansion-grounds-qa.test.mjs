import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const {
  buildMansionGrounds, BUILDING, COURT_RADIUS, FOUNTAIN_POS, WALL_T,
} = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');
const { mountMansionCast } = await import('../src/mansion/cast.js');
const { Player } = await import('../src/core/player.js');

function mountGroundsCast() {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(null);
  scene.add(grounds.root);
  const cast = mountMansionCast(scene, { colliders: grounds.colliders }, {
    anchors: grounds.anchors,
    player: { position: new THREE.Vector3(999, 999, 999), eyeHeight: 1.66 },
    hud: {
      showLine() {}, hideLine() {}, setInstruction() {}, setTiming() {}, text: () => ({}),
    },
  });
  return { scene, grounds, cast };
}

function pointClearance(box, x, z) {
  const cx = Math.max(box.min.x, Math.min(box.max.x, x));
  const cz = Math.max(box.min.z, Math.min(box.max.z, z));
  return Math.hypot(x - cx, z - cz);
}

test('every authored driveway lamp is illuminated with one consistent useful throw', () => {
  const grounds = buildMansionGrounds(null);
  const fixtures = grounds.props.lamps;

  assert.ok(fixtures.length >= 10, 'the approach lost one of its authored lamp posts');
  const live = fixtures.map(([x, z]) => grounds.lights.find((light) => (
    Math.abs(light.position.x - x) < 0.01
    && Math.abs(light.position.z - z) < 0.01
  )));
  assert.equal(live.filter(Boolean).length, fixtures.length,
    'one or more driveway lamp posts exist without a powered PointLight');

  const intensities = live.map((light) => light.intensity);
  const radii = live.map((light) => light.distance);
  assert.equal(new Set(intensities).size, 1, 'driveway lamps do not share one brightness');
  assert.equal(new Set(radii).size, 1, 'driveway lamps do not share one light radius');
  assert.ok(intensities[0] >= 8, `driveway brightness ${intensities[0]} is too weak for the approach`);
  assert.ok(radii[0] >= 16 && radii[0] <= 22,
    `driveway light radius ${radii[0]} is not a useful, controlled throw`);
});

test('front flower clumps stay grounded, human-scaled, and clear of lamp hardware', () => {
  const grounds = buildMansionGrounds(null);
  const flowers = grounds.props.landscaping.flowers;
  const lamps = grounds.props.lamps;

  assert.ok(Array.isArray(flowers) && flowers.length >= 50,
    'front landscaping does not publish its physical flower placements');
  for (const flower of flowers) {
    assert.ok(flower.baseY >= 0.1, `flower at ${flower.x},${flower.z} is below its bed surface`);
    assert.ok(flower.scale >= 0.72 && flower.scale <= 1.02,
      `flower at ${flower.x},${flower.z} has distorted scale ${flower.scale}`);
    assert.ok(flower.radius <= 0.29, `flower at ${flower.x},${flower.z} is oversized`);
    assert.ok(flower.height <= 0.38, `flower at ${flower.x},${flower.z} is vertically distorted`);
    for (const [lx, lz] of lamps) {
      assert.ok(Math.hypot(flower.x - lx, flower.z - lz) - flower.radius >= 0.32,
        `flower at ${flower.x},${flower.z} buries the driveway lamp at ${lx},${lz}`);
    }
  }
});

test('the fountain approach opens into a wider court before either driveway bed begins', () => {
  const grounds = buildMansionGrounds(null);
  const approachBeds = grounds.props.landscaping.beds.filter((bed) => (
    bed.z0 < 12
    && (Math.abs(bed.x0 - 4.35) < 0.01 || Math.abs(bed.x1 + 4.35) < 0.01)
  ));

  assert.ok(COURT_RADIUS >= 15.2,
    `the motor court radius is still only ${COURT_RADIUS} m`);
  assert.equal(approachBeds.length, 3, 'the two driveway borders no longer have their authored bed runs');
  const northRuns = approachBeds.filter((bed) => bed.z1 > 10);
  assert.equal(northRuns.length, 2, 'the north end of one driveway border is missing');
  for (const bed of northRuns) {
    /* The fountain's real lower apron is radius 6. Its crossed collision
     * cover begins at z=fountain.z-6, so an ornamental bed ending at that
     * same plane leaves no capsule-width entrance into the court. Require a
     * deliberate 100 mm reveal before the masonry, not an obsolete cosmetic
     * shortening measured from the old uncollided fountain. */
    const apronSouth = FOUNTAIN_POS.z - 6;
    assert.ok(bed.z1 <= apronSouth - 0.1 + 1e-6,
      `driveway bed ends at z=${bed.z1.toFixed(2)}, inside the fountain apron approach`);
    const flare = apronSouth - bed.z1;
    assert.ok(flare >= 2.0 && flare <= 2.2,
      `driveway-to-court flare is ${flare.toFixed(2)} m instead of the authored capsule-clear opening`);
    const dz = bed.z1 - FOUNTAIN_POS.z;
    const fountainHalfWidth = Math.sqrt(Math.max(0, 6 ** 2 - dz ** 2));
    const innerEdge = bed.x0 > 0 ? bed.x0 : -bed.x1;
    assert.ok(innerEdge - fountainHalfWidth >= 3.0,
      `only ${(innerEdge - fountainHalfWidth).toFixed(2)} m remains beside the fountain at the bed end`);
  }
});

test('front guards complete several patrol laps without entering or skipping solid geometry', () => {
  const { grounds, cast } = mountGroundsCast();
  const guards = ['patrol0', 'patrol1', 'patrol2'].map((id) => ({ id, npc: cast.people[id] }));
  const routeClashes = [];

  for (const { id, npc: guard } of guards) {
    assert.ok(guard.route?.length >= 4, `${guard.name} has no complete perimeter loop`);
    for (let i = 0; i < guard.route.length; i++) {
      const from = guard.route[i];
      const to = guard.route[(i + 1) % guard.route.length];
      const samples = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.1));
      for (let step = 0; step <= samples; step++) {
        const t = step / samples;
        const x = THREE.MathUtils.lerp(from.x, to.x, t);
        const z = THREE.MathUtils.lerp(from.z, to.z, t);
        const nearest = Math.min(...grounds.colliders
          .filter((box) => guard.baseY <= box.max.y && guard.baseY + 1.8 >= box.min.y)
          .map((box) => pointClearance(box, x, z)));
        if (nearest < 0.5) routeClashes.push({
          guard: id,
          segment: i,
          clearance: +nearest.toFixed(2),
          x: +x.toFixed(2),
          z: +z.toFixed(2),
        });
      }
    }
  }
  assert.deepEqual(routeClashes, [], 'one or more patrol segments scrape landscaping or architecture');

  const transitions = new Map(guards.map(({ npc }) => [npc, 0]));
  const skipped = [];
  for (let frame = 0; frame < 180 * 60; frame++) {
    for (const { npc: guard } of guards) {
      const previousIndex = guard.routeAt;
      const previousTarget = guard.route[previousIndex];
      guard.update(1 / 60, new THREE.Vector3(999, 0, 999));
      if (guard.routeAt !== previousIndex) {
        transitions.set(guard, transitions.get(guard) + 1);
        const miss = Math.hypot(
          guard.group.position.x - previousTarget.x,
          guard.group.position.z - previousTarget.z,
        );
        if (miss >= 0.5) skipped.push({ guard: guard.name, previousIndex, miss });
      }
    }
  }
  assert.deepEqual(skipped, [], 'a patrol abandoned a blocked waypoint instead of reaching it');
  for (const { npc: guard } of guards) {
    assert.ok(transitions.get(guard) >= guard.route.length * 3,
      `${guard.name} did not complete three full loops in the three-minute simulation`);
  }
});

test('the front-door guard stands wholly outside the facade glazing', () => {
  const { scene, cast } = mountGroundsCast();
  scene.updateMatrixWorld(true);
  const guard = cast.people.gateMan;
  const bounds = new THREE.Box3().setFromObject(guard.group);
  const facadeFace = BUILDING.z0 - WALL_T;

  assert.ok(bounds.max.z <= facadeFace - 0.08,
    `front guard penetrates the facade by ${(bounds.max.z - facadeFace).toFixed(2)} m`);
});

test('kitchen exterior access is stairs to a supported landing flush with the doorway', () => {
  const grounds = buildMansionGrounds(null);
  const access = grounds.props.serviceRoad;
  const door = grounds.doors.rearService;
  const { ramp, landing, supports } = access;

  assert.ok(landing, 'the kitchen service door still has no top landing');
  assert.equal(landing.x0, door.x1, 'the landing does not meet the exterior face of the kitchen door');
  assert.ok(landing.z0 <= door.z0 && landing.z1 >= door.z1,
    'the landing is narrower than the kitchen doorway');
  assert.equal(landing.y, 1.2, 'the landing is not flush with the kitchen floor');
  assert.equal(ramp.axis, 'x', 'the stairs still climb sideways along z instead of toward the east-wall door');
  assert.equal(ramp.highAt, 'min', 'the stair head is not the edge nearest the kitchen');
  assert.equal(ramp.x0, landing.x1, 'there is a gap between stair head and landing');
  assert.ok(Array.isArray(supports) && supports.length >= 2,
    'the landing has no deliberate structural support underneath');

  const centerZ = (door.z0 + door.z1) / 2;
  assert.equal(access.groundAt((landing.x0 + landing.x1) / 2, centerZ), 1.2);
  assert.equal(access.groundAt(ramp.x0, centerZ), 1.2);
  assert.ok(Math.abs(access.groundAt((ramp.x0 + ramp.x1) / 2, centerZ) - 0.8) <= 1e-9,
    'the physical stair resolver does not use the highest rendered tread at its shared nosing');
  assert.ok(Math.abs(access.groundAt(ramp.x1, centerZ) - 0.2) <= 1e-9,
    'the road-end tread is not the first real 200 mm rise');
  assert.equal(access.groundAt(ramp.x1 + 0.5, centerZ), null);
});

test('kitchen service access supports the whole wall threshold between landing and room', () => {
  const grounds = buildMansionGrounds(null);
  const access = grounds.props.serviceRoad;
  const door = grounds.doors.rearService;
  const centerZ = (door.z0 + door.z1) / 2;

  assert.deepEqual(access.threshold, {
    x0: door.x0,
    x1: door.x1,
    z0: door.z0,
    z1: door.z1,
    y: door.y,
  }, 'the service doorway does not publish its wall-band walking support');
  for (const x of [door.x0, 16.01, 16.22, 16.39, door.x1]) {
    assert.equal(access.groundAt(x, centerZ), door.y,
      `service threshold falls away at x=${x}`);
  }
  assert.ok(grounds.root.getObjectByName('service-door-threshold'),
    'the supported threshold has no physical slab in the doorway');
});

test('a real player crosses the kitchen service threshold without dropping to grade', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const access = grounds.props.serviceRoad;
  let player;
  const world = {
    colliders: [...grounds.colliders, ...interior.colliders],
    floorZones: [],
    groundAt: (x, z) => (
      interior.floorAt(x, z, player.position.y - player.eyeHeight)
      ?? access.groundAt(x, z)
      ?? 0
    ),
  };
  player = new Player(new THREE.PerspectiveCamera(), world);
  player.mode = 'walk';
  player.enabled = true;
  player.position.set(17, 1.2 + player.eyeHeight, 66);
  player.ground = 1.2;
  player.yaw = Math.PI / 2;
  player.setKey('KeyW', true);

  let minimumGround = player.ground;
  for (let frame = 0; frame < 180 && player.position.x > 15.2; frame++) {
    player.update(1 / 60);
    minimumGround = Math.min(minimumGround, player.ground);
  }

  assert.ok(player.position.x <= 15.2,
    `player never crossed into the kitchen (stopped at x=${player.position.x.toFixed(3)})`);
  assert.ok(minimumGround >= 1.19,
    `player fell toward grade while crossing the threshold (minimum ${minimumGround.toFixed(3)} m)`);
});

test('round fountain colliders block visible stone without ejecting players from clear paving', () => {
  const grounds = buildMansionGrounds(null);
  const tiers = grounds.props.fountain.colliderTiers;
  const capsuleRadius = 0.3;
  assert.equal(tiers.length, 3, 'the fountain does not publish its three physical stone tiers');

  const probe = (tier, radius, angle) => {
    const player = new Player(new THREE.PerspectiveCamera(), {
      colliders: tier.colliders, floorZones: [], groundAt: () => tier.y0,
    });
    player.enabled = true;
    player.mode = 'walk';
    player.ground = tier.y0;
    player.position.set(
      FOUNTAIN_POS.x + Math.cos(angle) * radius,
      tier.y0 + player.eyeHeight,
      FOUNTAIN_POS.z + Math.sin(angle) * radius,
    );
    const before = player.position.clone();
    for (let frame = 0; frame < 4; frame += 1) player.update(1 / 60);
    return { player, moved: player.position.distanceTo(before) };
  };

  for (const tier of tiers) {
    for (let degrees = 0; degrees < 360; degrees += 2) {
      const angle = THREE.MathUtils.degToRad(degrees);
      const clear = probe(tier, tier.radius + capsuleRadius + 0.001, angle);
      assert.ok(clear.moved <= 1e-6,
        `${tier.name} invisible collider pushed clear paving ${(clear.moved * 1000).toFixed(1)} mm at ${degrees}°`);

      const inside = probe(tier, tier.radius - 0.05, angle);
      const finalRadius = Math.hypot(
        inside.player.position.x - FOUNTAIN_POS.x,
        inside.player.position.z - FOUNTAIN_POS.z,
      );
      assert.ok(finalRadius >= tier.radius - 0.005,
        `${tier.name} lets the player remain ${(tier.radius - finalRadius).toFixed(3)} m inside stone at ${degrees}°`);
    }
  }
});

test('both Mansion players ride the authored siege breach stairs instead of walking through them', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const breachGroundAt = grounds.props.siegeBreachGroundAt;

  assert.equal(typeof breachGroundAt, 'function',
    'the two breach stair contracts have no shared player ground resolver');
  assert.equal(grounds.props.siegeBreachEntries.length, 2,
    'the shared breach resolver is not backed by both authored entrances');

  for (const entry of grounds.props.siegeBreachEntries) {
    for (const surface of entry.surfaces) {
      const x = (surface.x0 + surface.x1) / 2;
      const z = (surface.z0 + surface.z1) / 2;
      assert.ok(Math.abs(breachGroundAt(x, z) - surface.y) <= 1e-9,
        `${entry.id} player support disagrees with ${surface.name}`);
    }

    let player;
    const surfaces = entry.surfaces;
    const first = surfaces[0];
    const last = surfaces.at(-1);
    const direction = Math.sign(((last.x0 + last.x1) - (first.x0 + first.x1)) / 2);
    const z = (first.z0 + first.z1) / 2;
    const startX = (first.x0 + first.x1) / 2;
    const endX = (last.x0 + last.x1) / 2 + direction * 0.2;
    const world = {
      colliders: [],
      floorZones: [],
      snapGroundToSurface: true,
      groundAt: (x, worldZ) => (
        interior.floorAt(x, worldZ, player.position.y - player.eyeHeight)
        ?? breachGroundAt(x, worldZ)
        ?? 0
      ),
    };
    player = new Player(new THREE.PerspectiveCamera(), world);
    player.mode = 'walk';
    player.enabled = true;
    player.ground = breachGroundAt(startX, z);
    player.position.set(startX, player.ground + player.eyeHeight, z);
    player.yaw = direction < 0 ? Math.PI / 2 : -Math.PI / 2;
    player.setKey('KeyW', true);

    let worstPenetration = 0;
    for (let frame = 0; frame < 300; frame += 1) {
      player.update(1 / 60);
      const renderedSupport = world.groundAt(player.position.x, player.position.z);
      worstPenetration = Math.max(worstPenetration, renderedSupport - player.ground);
      if ((direction < 0 && player.position.x <= endX)
          || (direction > 0 && player.position.x >= endX)) break;
    }

    assert.ok((direction < 0 && player.position.x <= endX)
      || (direction > 0 && player.position.x >= endX),
    `${entry.id} player never crossed the breach stair run`);
    assert.ok(worstPenetration <= 0.005,
      `${entry.id} player feet entered a visible tread by ${(worstPenetration * 1000).toFixed(1)} mm`);
  }

  for (const path of ['../src/mansion/main.js', '../src/mansion/siege/main.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /siegeBreachGroundAt/,
      `${path} never consumes the shared siege breach player resolver`);
  }
});

test('tour players ride the exact service, pool, and garden tread tops', () => {
  const grounds = buildMansionGrounds(null);
  const patio = grounds.props.poolPatio;
  const flights = [
    {
      id: 'service',
      surfaces: grounds.props.serviceRoad.ramp.surfaces,
      groundAt: grounds.props.serviceRoad.groundAt,
    },
    { id: 'pool-west', surfaces: patio.steps.surfaces, groundAt: patio.groundAt },
    ...patio.gardenStairs.map((flight) => ({
      id: `garden-${flight.id}`, surfaces: flight.surfaces, groundAt: patio.groundAt,
    })),
  ];

  for (const flight of flights) {
    assert.ok(Array.isArray(flight.surfaces) && flight.surfaces.length >= 6,
      `${flight.id} does not publish its discrete rendered tread tops`);
    for (const surface of flight.surfaces) {
      const mesh = grounds.root.getObjectByName(surface.name);
      assert.ok(mesh, `${surface.name} has no named rendered tread`);
      const box = new THREE.Box3().setFromObject(mesh);
      const x = (surface.x0 + surface.x1) / 2;
      const z = (surface.z0 + surface.z1) / 2;
      assert.ok(Math.abs(box.max.y - surface.y) <= 1e-9,
        `${surface.name} contract is not its rendered top`);
      assert.ok(Math.abs(box.min.x - surface.x0) <= 1e-9
        && Math.abs(box.max.x - surface.x1) <= 1e-9
        && Math.abs(box.min.z - surface.z0) <= 1e-9
        && Math.abs(box.max.z - surface.z1) <= 1e-9,
      `${surface.name} contract omits its rendered nosing footprint`);
      assert.ok(box.min.y <= 1e-9,
        `${surface.name} is a floating slab ${box.min.y.toFixed(3)} m above grade`);
      assert.ok(Math.abs(flight.groundAt(x, z) - surface.y) <= 1e-9,
        `${flight.id} player support disagrees with ${surface.name}`);
      for (const edgeX of [surface.x0 + 1e-5, surface.x1 - 1e-5]) {
        for (const edgeZ of [surface.z0 + 1e-5, surface.z1 - 1e-5]) {
          assert.ok(flight.groundAt(edgeX, edgeZ) >= surface.y - 1e-9,
            `${flight.id} support drops below ${surface.name} at its rendered nosing`);
        }
      }
    }

    for (const reverse of [false, true]) {
      const ordered = reverse ? [...flight.surfaces].reverse() : flight.surfaces;
      const first = ordered[0];
      const last = ordered.at(-1);
      const startX = (first.x0 + first.x1) / 2;
      const startZ = (first.z0 + first.z1) / 2;
      const endX = (last.x0 + last.x1) / 2;
      const endZ = (last.z0 + last.z1) / 2;
      const dx = endX - startX;
      const dz = endZ - startZ;
      let player;
      const world = {
        colliders: [], floorZones: [], snapGroundToSurface: true,
        groundAt: flight.groundAt,
      };
      player = new Player(new THREE.PerspectiveCamera(), world);
      player.enabled = true;
      player.mode = 'walk';
      player.ground = flight.groundAt(startX, startZ);
      player.position.set(startX, player.ground + player.eyeHeight, startZ);
      player.yaw = Math.atan2(-dx, -dz);
      player.setKey('KeyW', true);

      let worstError = 0;
      for (let frame = 0; frame < 360; frame += 1) {
        player.update(1 / 60);
        const support = flight.groundAt(player.position.x, player.position.z);
        if (support !== null) worstError = Math.max(worstError, Math.abs(support - player.ground));
        if (Math.hypot(player.position.x - endX, player.position.z - endZ) < 0.12) break;
      }
      assert.ok(Math.hypot(player.position.x - endX, player.position.z - endZ) < 0.12,
        `${flight.id} player did not finish the ${reverse ? 'descent' : 'ascent'}`);
      assert.ok(worstError <= 0.005,
        `${flight.id} player differs from rendered support by ${(worstError * 1000).toFixed(1)} mm`);
    }
  }
});

test('the Squatch-side brick garden uses the arch itself as a clear entrance', () => {
  const grounds = buildMansionGrounds(null);
  const gate = grounds.props.rearGarden.roseGarden.gate;
  const halfWalk = 1.0;

  assert.ok(gate.w >= 2.75 && gate.w <= 2.8,
    `garden arch width ${gate.w} m was not increased by roughly six inches`);
  assert.ok(grounds.root.getObjectByName('rose-garden-entry-arch'),
    'the brick garden has no identifiable entrance arch');
  assert.equal(grounds.root.getObjectByName('rose-gate-head'), undefined,
    'unnecessary wall geometry still sits above the garden arch');
  assert.equal(grounds.root.getObjectByName('rose-gate-coping'), undefined,
    'a second wall cap still boxes in the garden arch');

  const corridor = new THREE.Box3(
    new THREE.Vector3(gate.x - 1.2, 0, gate.z - halfWalk),
    new THREE.Vector3(gate.x + 5.5, 1.8, gate.z + halfWalk),
  );
  const blocked = grounds.colliders.filter((box) => box.intersectsBox(corridor));
  assert.deepEqual(blocked, [], 'solid geometry blocks the path through the garden arch');

  grounds.root.updateMatrixWorld(true);
  const flowers = [];
  grounds.root.traverse((object) => {
    if (object.name === 'mansion-garden-flower-clump') flowers.push(object);
  });
  const flowerBlocks = flowers.filter((flower) => (
    new THREE.Box3().setFromObject(flower).intersectsBox(corridor)
  ));
  assert.deepEqual(flowerBlocks, [], 'flower geometry still blocks the brick-garden walkway');
});

test('the trophy-room arcade is grander while retaining its supporting piers', () => {
  const grounds = buildMansionGrounds(null);
  const entrance = grounds.props.trophyEntrance;
  assert.ok(entrance, 'the trophy-room entrance has no published clearance contract');
  assert.equal(entrance.arches.length, 3, 'the trophy-room arcade lost an arch');

  const widths = entrance.arches.map((arch) => arch.z1 - arch.z0);
  assert.ok(Math.min(...widths) >= 1.5,
    `a trophy-room arch remains only ${Math.min(...widths).toFixed(2)} m wide`);
  assert.ok(widths[1] >= 1.6, 'the player-facing middle arch was not made comfortably grand');
  for (let i = 0; i < entrance.arches.length - 1; i++) {
    const pier = entrance.arches[i + 1].z0 - entrance.arches[i].z1;
    assert.ok(pier >= 0.18, `supporting pier ${i} was reduced to ${pier.toFixed(2)} m`);
  }

  const middle = entrance.arches[1];
  const corridor = new THREE.Box3(
    new THREE.Vector3(entrance.x0 - 0.5, 1.2, middle.z0 + 0.1),
    new THREE.Vector3(entrance.x1 + 0.5, 3.0, middle.z1 - 0.1),
  );
  assert.deepEqual(grounds.colliders.filter((box) => box.intersectsBox(corridor)), [],
    'the widened middle trophy arch still contains solid collision');
});
