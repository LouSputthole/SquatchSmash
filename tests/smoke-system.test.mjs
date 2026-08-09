import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { ensureDomShim } from '../tools/three-shim.mjs';
import { SmokeSystem, emitCigaretteExhale } from '../src/world/smoke.js';

ensureDomShim();

test('pooled smoke objects have stable reusable names for scene inspection', () => {
  const smoke = new SmokeSystem(new THREE.Scene());
  const names = smoke.puffs.map(({ sprite }) => sprite.name);

  assert.equal(new Set(names).size, smoke.puffs.length);
  assert.ok(names.every((name) => /^shared-smoke-puff-\d{2}$/.test(name)));
  assert.ok(smoke.puffs.every(({ sprite }) => sprite.userData.reusableSystem === 'smoke'));
});

test('a cigarette exhale uses the apartment plume and trailing cloud', () => {
  const calls = [];
  const smoke = {
    emit(origin, direction, options) {
      calls.push({ origin: origin.clone(), direction: direction.clone(), options });
    },
  };
  const origin = new THREE.Vector3(1, 2, 3);
  const direction = new THREE.Vector3(0, 0, -1);

  emitCigaretteExhale(smoke, origin, direction);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ options }) => options), [
    {
      count: 18, speed: 2.20, spread: 0.26,
      size0: 0.045, size1: 0.38, life: 2.8, peak: 0.22, rise: 0.24,
    },
    {
      count: 10, speed: 0.90, spread: 0.18,
      size0: 0.035, size1: 0.32, life: 4.0, peak: 0.14, rise: 0.18,
    },
  ]);
  assert.deepEqual(calls[0].origin.toArray(), [1, 1.93, 2.45]);
  assert.deepEqual(calls[1].origin.toArray(), [1, 1.93, 2.45]);
  assert.deepEqual(calls[0].direction.toArray(), [0, 0, -1]);
  assert.deepEqual(calls[1].direction.toArray(), [0, 0, -1]);
  assert.deepEqual(origin.toArray(), [1, 2, 3], 'the caller-owned origin stays unchanged');
});
