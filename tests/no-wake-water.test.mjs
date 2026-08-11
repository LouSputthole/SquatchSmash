/** The open sea must stop at NO WAKE's moving tapered hull, not fill it. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { BoatPhysics } = await import('../src/nowake/physics.js');
const {
  buildNoWakeWorld,
  cruiserHullHalfBeamAt,
} = await import('../src/nowake/world.js');

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
