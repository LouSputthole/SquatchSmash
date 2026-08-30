import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import { buildPalaceCast } from '../src/cartel-palace/cast.js';
import { PalaceNavigation } from '../src/cartel-palace/navigation.js';
import { PalaceSecurity } from '../src/cartel-palace/security.js';

const NAVMESH = new URL('../assets/navigation/cartel-palace-navmesh.bin', import.meta.url);

function responseFor(bytes) {
  return {
    ok: true,
    status: 200,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

test('the checked-in Palace navmesh crosses the real service-wing route without oscillating', async () => {
  const bytes = fs.readFileSync(NAVMESH);
  let clock = 0;
  const navigation = new PalaceNavigation({
    fetchImpl: async () => responseFor(bytes),
    clock: () => clock,
  });
  assert.equal(await navigation.start(), true);
  assert.equal(navigation.ready, true);
  assert.equal(navigation.report().assetBytes, 32400);

  const position = new THREE.Vector3(14.4, 0, -1.5);
  const goal = new THREE.Vector3(-6.4, 0, -29);
  let prior = null;
  let reversals = 0;
  let frames = 0;
  for (; frames < 1800 && position.distanceTo(goal) > 0.42; frames++) {
    clock += 1 / 60;
    const step = navigation.step('service-hall', position, goal, 2.2 / 60);
    assert.ok(step?.isVector3, `navigation returned no step at frame ${frames}`);
    if (prior && prior.dot(step) / (prior.length() * step.length()) < -0.5) reversals++;
    position.add(step);
    prior = step;
  }
  assert.ok(position.distanceTo(goal) <= 0.42,
    `service-hall path stopped ${position.distanceTo(goal).toFixed(2)}m away`);
  assert.ok(frames / 60 < 20.5, `service-hall path took ${(frames / 60).toFixed(2)}s`);
  assert.equal(reversals, 0);
  const report = navigation.report();
  assert.ok(report.queries > 0);
  assert.equal(report.queryFailures, 0);
  assert.ok(report.steps >= frames);
  navigation.destroy();
  assert.equal(navigation.status, 'destroyed');
});

test('an alarm guard with stale contact selects and reaches his authored post', () => {
  const scene = new THREE.Group();
  const cast = buildPalaceCast(scene);
  const calls = [];
  const navigation = {
    step(id, position, goal, stride) {
      calls.push({ id, goal: goal.toArray() });
      const toward = goal.clone().sub(position).setY(0);
      const distance = toward.length();
      return distance > 1e-8 ? toward.multiplyScalar(Math.min(distance, stride) / distance) : null;
    },
    forget() {},
  };
  const security = new PalaceSecurity({ cast, navigation });
  const guard = cast.guards.find((entry) => entry.id === 'service-hall');
  assert.ok(guard);
  for (const entry of cast.all) entry.active = entry === guard;
  const authored = security.runtime.get(guard.id).authoredPosition.clone();
  guard.root.position.set(-6.4, 0, -29);
  security.alarm = true;
  security.contactPoint = null;
  security.contactAge = Infinity;

  const player = new THREE.Vector3(100, 0, 100);
  for (let frame = 0; frame < 2400 && guard.root.position.distanceTo(authored) > 0.55; frame++) {
    security.update(1 / 60, { playerPosition: player });
  }
  assert.ok(guard.root.position.distanceTo(authored) <= 0.55,
    `stale-contact guard froze ${guard.root.position.distanceTo(authored).toFixed(2)}m from post`);
  assert.ok(calls.length > 0);
  assert.ok(calls.every((call) => call.id === 'service-hall'));
  assert.ok(calls.every((call) => new THREE.Vector3().fromArray(call.goal).distanceTo(authored) <= 1e-9));
  assert.equal(security.stats.roundsFired, 0);
});
