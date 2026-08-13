import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CombatPerception } from '../src/core/combat/perception.js';
import { AabbCombatSpace } from '../src/core/combat/spatial.js';

function box(id, min, max) {
  const collider = new THREE.Box3(
    new THREE.Vector3(...min),
    new THREE.Vector3(...max),
  );
  collider.id = id;
  return collider;
}

test('AabbCombatSpace trace returns the nearest deterministic cloned impact point', () => {
  const lateTie = box('wall-z', [-1, 0, 4], [1, 3, 4.4]);
  const earlyTie = box('wall-a', [-1, 0, 4], [1, 3, 4.4]);
  const farther = box('wall-far', [-1, 0, 8], [1, 3, 8.4]);
  const space = new AabbCombatSpace({ boxes: [lateTie, farther, earlyTie] });
  const from = new THREE.Vector3(0, 1.5, 0);
  const to = new THREE.Vector3(0, 1.5, 10);

  const hit = space.trace(from, to);
  assert.equal(hit.box, earlyTie, 'equal-distance collisions did not use stable ids');
  assert.ok(Math.abs(hit.distance - 4) < 1e-9);
  assert.deepEqual(hit.point.toArray(), [0, 1.5, 4]);
  assert.notEqual(hit.point, from);
  assert.notEqual(hit.point, to);

  to.set(9, 9, 9);
  assert.deepEqual(hit.point.toArray(), [0, 1.5, 4], 'the impact point aliased a caller vector');

  const inside = new THREE.Vector3(0, 1.5, 4.2);
  const escaped = space.trace(inside, new THREE.Vector3(0, 1.5, 10));
  assert.equal(escaped.box, farther, 'the containing box was not ignored independently');
  assert.equal(new AabbCombatSpace({ boxes: [earlyTie] })
    .trace(inside, new THREE.Vector3(0, 1.5, 10)), null,
  'the shooter was blinded by the collider containing its origin');
});

test('AabbCombatSpace sweeps thin walls, slides on the open axis and clamps bounds', () => {
  const wall = box('thin-wall', [-1, 1.1, 4], [1, 4, 4.08]);
  const position = new THREE.Vector3(0, 1.2, 0);
  const space = new AabbCombatSpace({
    boxes: [wall],
    radius: 0.29,
    height: 1.72,
    bounds: { x0: -3, x1: 3, y0: 0, y1: 8, z0: -2, z1: 8 },
  });

  const moved = space.move(position, new THREE.Vector3(0.5, 0, 10));
  assert.equal(position.x, 0.5, 'the clear axis did not slide along the wall');
  assert.ok(Math.abs(position.z - 3.71) < 1e-9,
    `the swept body stopped at ${position.z} instead of its leading edge`);
  assert.equal(moved.blocked, true);
  assert.equal(moved.clamped, false);
  assert.deepEqual(moved.displacement.toArray(), [0.5, 0, 3.71]);

  const bounded = space.move(position, new THREE.Vector3(10, 0, 0));
  assert.equal(position.x, 3);
  assert.equal(bounded.clamped, true);
  assert.equal(bounded.blocked, true);
});

test('AabbCombatSpace separates exact overlaps by stable id and respects configurable spacing', () => {
  const space = new AabbCombatSpace({ separation: 0.6, verticalSeparation: 1.2 });
  const alpha = { id: 'alpha', position: new THREE.Vector3(0, 1.2, 0) };
  const zulu = { id: 'zulu', position: new THREE.Vector3(0, 1.2, 0) };

  const left = space.separate(alpha, [zulu]);
  assert.ok(Math.abs(alpha.position.x + 0.6) < 1e-9);
  assert.equal(alpha.position.z, 0);
  assert.equal(left.overlaps, 1);

  alpha.position.set(0, 1.2, 0);
  zulu.position.set(0, 1.2, 0);
  const right = space.separate(zulu, [alpha]);
  assert.ok(Math.abs(zulu.position.x - 0.6) < 1e-9);
  assert.equal(right.overlaps, 1);

  alpha.position.set(0, 1.2, 0);
  zulu.position.set(0, 2.41, 0);
  const otherFloor = space.separate(alpha, [zulu]);
  assert.equal(otherFloor.overlaps, 0);
  assert.deepEqual(alpha.position.toArray(), [0, 1.2, 0]);
});

test('CombatPerception requires both field of view and an unobstructed segment', () => {
  const wall = box('cover', [-0.5, 0, 4], [0.5, 3, 4.5]);
  const space = new AabbCombatSpace({ boxes: [wall] });
  const perception = new CombatPerception({
    range: 20,
    fov: Math.PI / 2,
    space,
    awareness: 0.55,
  });
  const origin = new THREE.Vector3(0, 1.5, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const behind = { id: 'behind', position: new THREE.Vector3(0, 0, -3), eye: 1.5 };
  const blocked = { id: 'blocked', position: new THREE.Vector3(0, 0, 8), eye: 1.5 };

  assert.equal(perception.scan({ origin, forward, candidates: [behind, blocked] }), null);
  assert.equal(perception.target, null);
  assert.equal(perception.targetVisible, false);

  const clear = { id: 'clear', position: new THREE.Vector3(3, 0, 8), eye: 1.5 };
  const seen = perception.scan({ origin, forward, candidates: [behind, blocked, clear] });
  assert.equal(seen.target, clear);
  assert.deepEqual(seen.point.toArray(), [3, 1.5, 8]);
  assert.equal(perception.targetVisible, true);
  assert.ok(Math.abs(perception.awareness - 0.78) < 1e-12);

  clear.position.set(30, 9, 30);
  assert.deepEqual(seen.point.toArray(), [3, 1.5, 8], 'the scan result followed the live target');
  assert.deepEqual(perception.sampledPoint.toArray(), [3, 1.5, 8],
    'perception retained the target position by reference');
  assert.deepEqual(perception.lastSeen.toArray(), [3, 1.5, 8],
    'last-seen memory retained the target position by reference');
});

test('CombatPerception remembers only a sampled point and expires it on tick', () => {
  const perception = new CombatPerception({
    range: 20,
    fov: Math.PI,
    memorySeconds: 2.4,
    awareness: 0.55,
  });
  const origin = new THREE.Vector3(0, 1.5, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const target = { id: 'runner', position: new THREE.Vector3(1, 0, 6), eye: 1.5 };

  perception.scan({ origin, forward, candidates: [target] });
  const remembered = perception.lastSeen.clone();
  target.position.set(10, 0, 10);
  perception.scan({ origin, forward, candidates: [] });

  assert.equal(perception.target, null, 'a remembered target remained live');
  assert.equal(perception.targetVisible, false);
  assert.equal(perception.sampledPoint, null);
  assert.deepEqual(perception.lastSeen.toArray(), remembered.toArray());
  assert.equal(perception.memory, 2.4);
  assert.ok(Math.abs(perception.awareness - 0.86) < 1e-12);

  perception.tick(1.4);
  assert.ok(Math.abs(perception.memory - 1) < 1e-12);
  assert.deepEqual(perception.lastSeen.toArray(), remembered.toArray());
  perception.tick(1);
  assert.equal(perception.memory, 0);
  assert.equal(perception.lastSeen, null);
  assert.equal(perception.hasMemory, false);
});

test('CombatPerception snapshot is JSON-safe and restore clears every live target reference', () => {
  const perception = new CombatPerception({
    range: 20,
    fov: Math.PI,
    awareness: 0.4,
  });
  const target = { id: 'circular', position: new THREE.Vector3(1, 0, 5), eye: 1.5 };
  target.self = target;
  perception.scan({
    origin: new THREE.Vector3(0, 1.5, 0),
    forward: new THREE.Vector3(0, 0, 1),
    candidates: [target],
  });
  perception.tick(0.4);

  const encoded = JSON.stringify(perception.snapshot());
  const snapshot = JSON.parse(encoded);
  assert.deepEqual(Object.keys(snapshot).sort(), ['awareness', 'lastSeen', 'memory', 'version']);

  const restored = new CombatPerception().restore(snapshot);
  assert.equal(restored.target, null);
  assert.equal(restored.targetVisible, false);
  assert.equal(restored.sampledPoint, null);
  assert.equal(restored.distance, Infinity);
  assert.deepEqual(restored.lastSeen.toArray(), [1, 1.5, 5]);
  assert.equal(restored.memory, 2.4, 'visible memory should not decay before target loss');
  assert.equal(restored.awareness, 0.75);
});
