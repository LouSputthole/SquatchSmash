import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const { ImpactKit, MARK_NAME } = await import('../src/silvercase/combat/Shooting.js');

/** The slice of Actor that ImpactKit.body() actually touches. */
function fakeActor(scene, x = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, 0);
  scene.add(group);
  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  const body = new THREE.Group();
  body.position.set(0, 1.0, 0);
  group.add(head, body);
  scene.updateMatrixWorld(true);
  return { group, parts: { head, body } };
}

const chestOf = (actor) => actor.group.position.clone().setY(1.1);
const TOWARD = new THREE.Vector3(0, 0, 1);

test('checkpoint revert wipes attempt-scoped decals and keeps pre-checkpoint history', () => {
  const scene = new THREE.Scene();
  const impacts = new ImpactKit(scene);
  const deke = fakeActor(scene, 0);
  const chester = fakeActor(scene, 2);

  // Pre-checkpoint history: one plaster hole, one wound (plus spatter) on Deke.
  const preHole = impacts.surface(new THREE.Vector3(4, 1.2, -2), new THREE.Vector3(0, 0, 1));
  const preHolePosition = preHole.position.clone();
  impacts.body(deke, chestOf(deke), TOWARD);
  assert.equal(impacts.marksOn(deke), 2, 'wound + spatter on Deke before the checkpoint');

  impacts.captureCheckpoint();

  // The failed attempt: two missed shots into the wall, Chester shot.
  impacts.surface(new THREE.Vector3(5, 1.4, -2), new THREE.Vector3(0, 0, 1));
  impacts.surface(new THREE.Vector3(5.4, 1.1, -2), new THREE.Vector3(0, 0, 1));
  impacts.body(chester, chestOf(chester), TOWARD);
  assert.equal(impacts.marksOn(chester), 2);
  assert.equal(impacts.holes.pool.filter((m) => m.visible).length, 3);

  assert.equal(impacts.revertToCheckpoint(), true);

  const visibleHoles = impacts.holes.pool.filter((m) => m.visible);
  assert.equal(visibleHoles.length, 1, 'only the pre-checkpoint hole survives');
  assert.equal(visibleHoles[0], preHole);
  assert.ok(visibleHoles[0].position.distanceTo(preHolePosition) <= 1e-9);
  assert.equal(impacts.marksOn(chester), 0, 'the attempt blood comes off Chester');
  assert.equal(impacts.marksOn(deke), 2, 'Deke keeps what happened to him');
  for (const mark of impacts.marksFor(deke)) {
    assert.equal(mark.name, MARK_NAME);
    assert.ok(mark.parent === deke.parts.body || mark.parent === deke.parts.head,
      'restored wounds still ride the body they were punched into');
  }
});

test('a recycled pooled quad is restored to its checkpoint placement', () => {
  const scene = new THREE.Scene();
  const impacts = new ImpactKit(scene);
  const poolSize = impacts.holes.pool.length;

  const first = impacts.surface(new THREE.Vector3(1, 1, -3), new THREE.Vector3(0, 0, 1));
  const firstPosition = first.position.clone();
  impacts.captureCheckpoint();

  // Enough attempt shots to wrap the ring and re-punch the checkpoint quad.
  for (let shot = 0; shot < poolSize; shot++) {
    impacts.surface(new THREE.Vector3(2 + shot * 0.1, 1, -3), new THREE.Vector3(0, 0, 1));
  }
  assert.ok(first.position.distanceTo(firstPosition) > 0.1,
    'the fixture really recycled the checkpoint quad');

  assert.equal(impacts.revertToCheckpoint(), true);
  assert.equal(impacts.holes.pool.filter((m) => m.visible).length, 1);
  assert.ok(first.visible);
  assert.ok(first.position.distanceTo(firstPosition) <= 1e-9);
  assert.equal(impacts.holes.next, 1, 'the ring cursor rolls back with the quads');
});

test('revert refuses without a capture, and reset() drops a stale capture', () => {
  const scene = new THREE.Scene();
  const impacts = new ImpactKit(scene);
  assert.equal(impacts.revertToCheckpoint(), false);

  impacts.surface(new THREE.Vector3(0, 1, -1), new THREE.Vector3(0, 0, 1));
  impacts.captureCheckpoint();
  impacts.reset();
  assert.equal(impacts.revertToCheckpoint(), false,
    'a wiped room must not resurrect pre-reset decals');
  assert.equal(impacts.holes.pool.filter((m) => m.visible).length, 0);
});

test('revert is repeatable: a second retry restores the same checkpoint', () => {
  const scene = new THREE.Scene();
  const impacts = new ImpactKit(scene);
  const actor = fakeActor(scene, 1);

  impacts.body(actor, chestOf(actor), TOWARD, { spatter: false });
  impacts.captureCheckpoint();

  for (let attempt = 0; attempt < 2; attempt++) {
    impacts.surface(new THREE.Vector3(3, 1, -1), new THREE.Vector3(0, 0, 1));
    impacts.body(actor, chestOf(actor), TOWARD, { spatter: false });
    assert.equal(impacts.revertToCheckpoint(), true, `attempt ${attempt}`);
    assert.equal(impacts.marksOn(actor), 1, `attempt ${attempt}`);
    assert.equal(impacts.holes.pool.filter((m) => m.visible).length, 0, `attempt ${attempt}`);
  }
});
