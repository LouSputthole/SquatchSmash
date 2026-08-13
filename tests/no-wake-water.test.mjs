/** The open sea must stop at NO WAKE's moving tapered hull, not fill it. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { BoatPhysics } = await import('../src/nowake/physics.js');
const {
  CABIN,
  CABIN_COLLIDERS,
  CAPSULE_RADIUS,
  cabinColliderBoxes,
  deckPenetration,
} = await import('../src/nowake/deck-collision.js');
const {
  buildNoWakeWorld,
  cruiserHullHalfBeamAt,
} = await import('../src/nowake/world.js');

const EYE_HEIGHT = 1.66;

const INSIDE = Object.freeze([
  Object.freeze({ name: 'occupied cabin centre', x: 0, z: -4.10 }),
  Object.freeze({ name: 'occupied cabin dinette', x: 1.12, z: -3.20 }),
  Object.freeze({ name: 'occupied cockpit centre', x: 0.20, z: 1.80 }),
  Object.freeze({ name: 'occupied cockpit seating', x: -1.20, z: 3.50 }),
]);

const OUTSIDE = Object.freeze([
  Object.freeze({ name: 'open water off port', x: -3.20, z: 0 }),
  Object.freeze({ name: 'open water off starboard', x: 3.20, z: 2.60 }),
  Object.freeze({ name: 'open water ahead of tapered bow', x: 0, z: -6.55 }),
  Object.freeze({ name: 'open water behind transom', x: 0, z: 5.85 }),
  Object.freeze({ name: 'open water beside fine bow section', x: 1.40, z: -5.70 }),
]);

/** World point on the horizontal sea directly through one boat-local x/z. */
function waterPoint(root, level, x, z) {
  root.updateMatrixWorld(true);
  const base = new THREE.Vector3(x, 0, z).applyMatrix4(root.matrixWorld);
  const localY = new THREE.Vector3().setFromMatrixColumn(root.matrixWorld, 1);
  const y = (level - base.y) / localY.y;
  return new THREE.Vector3(x, y, z).applyMatrix4(root.matrixWorld);
}

function assertWaterContract(world, label) {
  const { water, boat } = world;
  assert.equal(typeof water.excludes, 'function', 'world.water has no public exclusion predicate');
  assert.ok(Array.isArray(water.exclusion?.sections) && water.exclusion.sections.length >= 8,
    'water exclusion is not backed by the authored tapered hull sections');
  const shaderSections = water.material.uniforms.uHullSections?.value ?? [];
  assert.deepEqual(
    shaderSections.map((section) => [section.x, section.y]),
    water.exclusion.sections.map((section) => [section.z, section.w]),
    'CPU predicate and water shader do not share one section contract',
  );
  const shaderVertical = water.material.uniforms.uHullVertical?.value;
  assert.deepEqual(
    [shaderVertical?.x, shaderVertical?.y, shaderVertical?.z],
    [water.exclusion.keelY, water.exclusion.chineY, water.exclusion.sheerY],
    'CPU predicate and water shader do not share one vertical hull contract',
  );
  assert.equal(water.material.uniforms.uHullInset?.value, water.exclusion.inset,
    'CPU predicate and water shader do not share one shell-overlap inset');

  /* Freshness is observed before the CPU predicate gets any opportunity to
   * refresh the shared inverse. The shader is bound to the visible hull mesh,
   * whose +.02 local-Y placement is part of the geometry contract. */
  boat.hull.updateWorldMatrix(true, false);
  const expectedInverse = boat.hull.matrixWorld.clone().invert();
  const shaderInverse = water.material.uniforms.uBoatWorldInverse?.value;
  assert.ok(shaderInverse?.isMatrix4, `${label}: shader has no boat inverse matrix`);
  const maxError = Math.max(...expectedInverse.elements.map(
    (value, index) => Math.abs(value - shaderInverse.elements[index]),
  ));
  assert.ok(maxError < 1e-9, `${label}: shader visible-hull inverse is stale by ${maxError}`);

  for (const sample of INSIDE) {
    const point = waterPoint(boat.root, water.level, sample.x, sample.z);
    assert.ok(Math.abs(point.y - water.level) < 1e-8, `${label}: ${sample.name} missed the waterline`);
    assert.equal(water.excludes(point), true,
      `${label}: open water still renders through ${sample.name}`);
  }
  for (const sample of OUTSIDE) {
    const point = waterPoint(boat.root, water.level, sample.x, sample.z);
    assert.equal(water.excludes(point), false,
      `${label}: hull exclusion punched a moat at ${sample.name}`);
  }

  assert.match(water.material.fragmentShader, /uBoatWorldInverse/);
  assert.match(water.material.fragmentShader, /discard/);
}

function hullWorldPoint(hull, x, y, z) {
  hull.updateWorldMatrix(true, false);
  return new THREE.Vector3(x, y, z).applyMatrix4(hull.matrixWorld);
}

/** One sea-plane point exactly 10 mm outside the visible hull at this station. */
function visibleHullExteriorPoint(hull, level, side, z) {
  let x = side;
  for (let iteration = 0; iteration < 4; iteration++) {
    const point = waterPoint(hull, level, x, z);
    const local = point.clone().applyMatrix4(hull.matrixWorld.clone().invert());
    x = side * (cruiserHullHalfBeamAt(local.y, local.z) + .01);
  }
  return waterPoint(hull, level, x, z);
}

function forwardCabinWaterLeaks(world, label) {
  const vBerth = CABIN_COLLIDERS.find(({ name }) => name.includes('V-berth'));
  const galley = CABIN_COLLIDERS.find(({ name }) => name.includes('galley counter'));
  assert.ok(vBerth && galley, `${label}: real forward-cabin fixtures are missing`);

  const boxes = cabinColliderBoxes();
  const leaks = [];
  let walkableSamples = 0;
  const step = .05;
  const minZ = vBerth.max[2] + step;
  const maxZ = galley.min[2] - step;
  for (let xi = 0; xi <= Math.round(CABIN.halfBeam * 2 / step); xi++) {
    const x = -CABIN.halfBeam + xi * step;
    for (let zi = 0; zi <= Math.round((maxZ - minZ) / step); zi++) {
      const z = minZ + zi * step;
      const penetration = deckPenetration(
        boxes,
        x,
        z,
        CAPSULE_RADIUS,
        CABIN.height + EYE_HEIGHT,
        EYE_HEIGHT,
      );
      if (penetration.depth > 1e-6) continue;
      walkableSamples++;
      if (!world.water.excludes(waterPoint(world.boat.root, world.water.level, x, z))) {
        leaks.push({ x, z });
      }
    }
  }
  assert.ok(walkableSamples >= 40,
    `${label}: only ${walkableSamples} real player-accessible forward-walkway samples`);
  return { leaks, walkableSamples };
}

test('real player-accessible forward cabin stays dry without punching an exterior moat', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const physics = new BoatPhysics();
  const poses = [{ label: 'rest' }];

  physics.running = true;
  physics.mooringReleased = true;
  physics.throttle = .82;
  physics.steer = .58;
  for (let i = 0; i < 12 * 60; i++) physics.advance(1 / 60);
  poses.push({ label: 'underway', physics });

  const failures = [];
  for (const pose of poses) {
    if (pose.physics) {
      const motion = pose.physics.motion();
      world.boat.root.position.set(
        pose.physics.position.x,
        world.boat.floatY + motion.heave,
        pose.physics.position.y,
      );
      world.boat.root.rotation.set(motion.pitch, pose.physics.heading, motion.roll, 'YXZ');
      world.update(pose.physics.time, 1 / 60);
    } else {
      world.update(0, 0);
    }

    for (const z of [-5.05, -4.50]) {
      for (const side of [-1, 1]) {
        const point = visibleHullExteriorPoint(world.boat.hull, world.water.level, side, z);
        assert.equal(world.water.excludes(point), false,
          `${pose.label}: exclusion punches a dry moat 10 mm outside the visible hull at z ${z}`);
      }
    }

    const { leaks, walkableSamples } = forwardCabinWaterLeaks(world, pose.label);
    if (leaks.length) failures.push({ label: pose.label, walkableSamples, leaks });
  }

  assert.deepEqual(failures, [], failures.map(({ label, walkableSamples, leaks }) => {
    const first = leaks[0];
    return `${label}: ${leaks.length}/${walkableSamples} player-accessible forward-cabin samples are wet; first at boat-local (${first.x.toFixed(2)}, ${first.z.toFixed(2)})`;
  }).join('\n'));
});

test('every longitudinal end of applied hull trim is supported by the tapered visible skin', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  world.update(0, 0);
  const { boat } = world;
  boat.root.updateMatrixWorld(true);
  const rootInverse = boat.root.matrixWorld.clone().invert();
  const names = [
    'burgundy sheer stripe port', 'burgundy sheer stripe starboard',
    'burgundy accent stripe port', 'burgundy accent stripe starboard',
    'rub strip port', 'rub strip starboard',
    'gunwale cap port', 'gunwale cap starboard',
  ];

  const unsupported = [];
  const overProud = [];
  const underSampled = [];
  const inwardExteriorFaces = [];
  for (const name of names) {
    const object = boat.root.getObjectByName(name);
    assert.ok(object?.isMesh, `missing applied hull trim ${name}`);
    const supportY = object.userData.hullTrim?.supportY;
    assert.ok(Number.isFinite(supportY), `${name} does not publish its authored hull support surface`);
    object.updateWorldMatrix(true, false);
    const position = object.geometry.getAttribute('position');
    const slices = new Map();
    const localPoints = [];
    for (let i = 0; i < position.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i)
        .applyMatrix4(object.matrixWorld).applyMatrix4(rootInverse);
      localPoints.push(point);
      const key = point.z.toFixed(5);
      if (!slices.has(key)) slices.set(key, []);
      slices.get(key).push(point);
    }
    if (slices.size < 4) underSampled.push({ name, slices: slices.size });
    const outerAt = new Map();
    for (const [zKey, points] of slices) {
      const z = Number(zKey);
      const skin = cruiserHullHalfBeamAt(supportY, z);
      const radial = points.map((point) => Math.abs(point.x));
      const bestSupportGap = skin > 0 ? Math.min(...radial) - skin : Infinity;
      const proud = skin > 0 ? Math.max(...radial) - skin : Infinity;
      outerAt.set(zKey, Math.max(...radial));
      if (bestSupportGap > .06) unsupported.push({ name, z, bestSupportGap });
      if (proud > .06) overProud.push({ name, z, proud });
    }
    for (let i = 0; i < localPoints.length; i += 3) {
      const triangle = localPoints.slice(i, i + 3);
      const isExterior = triangle.every((point) => (
        Math.abs(Math.abs(point.x) - outerAt.get(point.z.toFixed(5))) <= 1e-5
      ));
      if (!isExterior) continue;
      const normal = triangle[1].clone().sub(triangle[0])
        .cross(triangle[2].clone().sub(triangle[0])).normalize();
      const side = Math.sign(triangle.reduce((sum, point) => sum + point.x, 0));
      if (normal.x * side <= 1e-6) inwardExteriorFaces.push({ name, triangle: i / 3 });
    }
  }

  assert.deepEqual(unsupported, [], unsupported.map(({ name, z, bestSupportGap }) => (
    `${name} at z ${z.toFixed(2)} is ${Number.isFinite(bestSupportGap)
      ? `${(bestSupportGap * 1000).toFixed(1)} mm`
      : 'entirely'} beyond the tapered visible skin`
  )).join('\n'));
  assert.deepEqual(overProud, [], overProud.map(({ name, z, proud }) => (
    `${name} at z ${z.toFixed(2)} stands ${(proud * 1000).toFixed(1)} mm proud of its authored support skin`
  )).join('\n'));
  assert.deepEqual(underSampled, [], underSampled
    .map(({ name, slices }) => `${name} has only ${slices} longitudinal slices`)
    .join('\n'));
  assert.deepEqual(inwardExteriorFaces, [], inwardExteriorFaces
    .map(({ name, triangle }) => `${name} exterior triangle ${triangle} faces into the hull`)
    .join('\n'));
});

test('rub strips and gunwale caps do not share coplanar mixed-material faces', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  world.update(0, 0);
  const { root } = world.boat;
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();

  const exteriorProfile = (name) => {
    const object = root.getObjectByName(name);
    assert.ok(object?.isMesh, `missing applied hull trim ${name}`);
    object.updateWorldMatrix(true, false);
    const position = object.geometry.getAttribute('position');
    const slices = new Map();
    for (let i = 0; i < position.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i)
        .applyMatrix4(object.matrixWorld).applyMatrix4(rootInverse);
      const key = point.z.toFixed(5);
      if (!slices.has(key)) slices.set(key, []);
      slices.get(key).push(point);
    }
    return {
      name,
      material: object.material,
      slices: new Map([...slices].map(([key, points]) => {
      const outer = Math.max(...points.map((point) => Math.abs(point.x)));
      const face = points.filter((point) => Math.abs(Math.abs(point.x) - outer) <= 1e-5);
      return [key, {
        outer,
        outerX: face.reduce((sum, point) => sum + point.x, 0) / face.length,
        minY: Math.min(...face.map((point) => point.y)),
        maxY: Math.max(...face.map((point) => point.y)),
      }];
      })),
    };
  };

  const names = [
    'burgundy sheer stripe port', 'burgundy sheer stripe starboard',
    'burgundy accent stripe port', 'burgundy accent stripe starboard',
    'rub strip port', 'rub strip starboard',
    'gunwale cap port', 'gunwale cap starboard',
  ];
  const profiles = names.map(exteriorProfile);
  const conflicts = [];
  for (let a = 0; a < profiles.length; a++) {
    for (let b = a + 1; b < profiles.length; b++) {
      const first = profiles[a];
      const second = profiles[b];
      if (first.material === second.material) continue;
      for (const key of first.slices.keys()) {
        if (!second.slices.has(key)) continue;
        const firstAt = first.slices.get(key);
        const secondAt = second.slices.get(key);
        const verticalOverlap = Math.min(firstAt.maxY, secondAt.maxY)
          - Math.max(firstAt.minY, secondAt.minY);
        const planeSeparation = Math.abs(firstAt.outerX - secondAt.outerX);
        if (verticalOverlap > 1e-5 && planeSeparation <= 1e-5) {
          conflicts.push({
            first: first.name, second: second.name, z: Number(key), verticalOverlap,
          });
        }
      }
    }
  }

  const underSeparated = [];
  for (const side of ['port', 'starboard']) {
    const rub = profiles.find(({ name }) => name === `rub strip ${side}`).slices;
    const cap = profiles.find(({ name }) => name === `gunwale cap ${side}`).slices;
    const shared = [...rub.keys()].filter((key) => cap.has(key));
    assert.ok(shared.length >= 4, `${side}: only ${shared.length} real shared trim stations`);
    for (const key of shared) {
      const rubAt = rub.get(key);
      const capAt = cap.get(key);
      const radialSeparation = rubAt.outer - capAt.outer;
      if (radialSeparation < .008) {
        underSeparated.push({ side, z: Number(key), radialSeparation });
      }
    }
  }

  assert.deepEqual(conflicts, [], conflicts.map(({ first, second, z, verticalOverlap }) => (
    `${first} / ${second} z ${z.toFixed(2)} share ${(verticalOverlap * 1000).toFixed(1)} mm`
      + ' of one mixed-material exterior plane'
  )).join('\n'));
  assert.deepEqual(underSeparated, [], underSeparated.map(({ side, z, radialSeparation }) => (
    `${side} z ${z.toFixed(2)}: rub rail is only ${(radialSeparation * 1000).toFixed(1)} mm`
      + ' beyond the gunwale cap'
  )).join('\n'));
});

test('the tapered mask follows the visible hull boundary through trough, chine, crest, joins, bow, and stern', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  world.update(0, 0);
  const { hull } = world.boat;
  const { water } = world;
  const overlap = water.exclusion.inset;

  const levels = [
    { name: 'wave trough', y: -.29 },
    { name: 'chine', y: water.exclusion.chineY },
    { name: 'wave crest', y: .15 },
  ];
  const sectionZ = water.exclusion.sections.map((section) => section.z);
  const boundaryZ = sectionZ.map((z, index) => (
    index === 0 ? z + .05 : index === sectionZ.length - 1 ? z - .05 : z
  ));
  for (const { name, y } of levels) {
    for (const z of boundaryZ) {
      const skin = cruiserHullHalfBeamAt(y, z);
      assert.ok(skin > overlap, `${name} at z ${z} has no testable hull beam`);
      assert.equal(water.excludes(hullWorldPoint(hull, skin + .01, y, z)), false,
        `${name} z ${z}: mask escapes 10 mm outside the visible skin`);
      assert.equal(water.excludes(hullWorldPoint(hull, skin - .02, y, z)), false,
        `${name} z ${z}: the intentional 35 mm shell overlap was erased`);
      assert.equal(water.excludes(hullWorldPoint(hull, skin - .05, y, z)), true,
        `${name} z ${z}: water leaks past the overlap into the hull`);
    }
  }

  const y = -.08;
  const firstZ = sectionZ[0];
  const lastZ = sectionZ.at(-1);
  assert.equal(water.excludes(hullWorldPoint(hull, 0, y, firstZ - .01)), false,
    'mask punches a dry moat ahead of the bow');
  assert.equal(water.excludes(hullWorldPoint(hull, 0, y, firstZ + .02)), false,
    'the bow lost its intentional 35 mm longitudinal shell overlap');
  assert.equal(water.excludes(hullWorldPoint(hull, 0, y, firstZ + .05)), true,
    'water leaks through the bow-side hull boundary');
  assert.equal(water.excludes(hullWorldPoint(hull, 0, y, lastZ - .05)), true,
    'water leaks through the stern-side hull boundary');
  assert.equal(water.excludes(hullWorldPoint(hull, 0, y, lastZ - .02)), false,
    'the stern lost its intentional 35 mm longitudinal shell overlap');
  assert.equal(water.excludes(hullWorldPoint(hull, 0, y, lastZ + .01)), false,
    'mask punches a dry moat behind the transom');
});

test('moving tapered hull excludes sea from cabin and cockpit without a rectangular moat', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  world.update(0, 0);
  assertWaterContract(world, 'rest');

  const physics = new BoatPhysics();
  physics.running = true;
  physics.mooringReleased = true;
  physics.throttle = 0.82;
  physics.steer = 0.58;
  for (let i = 0; i < 12 * 60; i++) physics.advance(1 / 60);
  const motion = physics.motion();
  world.boat.root.position.set(
    physics.position.x,
    world.boat.floatY + motion.heave,
    physics.position.y,
  );
  world.boat.root.rotation.set(motion.pitch, physics.heading, motion.roll, 'YXZ');
  world.update(physics.time, 1 / 60);

  assert.ok(physics.distance > 20, `underway regression only moved ${physics.distance.toFixed(2)} m`);
  assert.ok(Math.abs(physics.heading) > 0.05, 'underway regression never turned the full hull matrix');
  assertWaterContract(world, 'underway');
});
