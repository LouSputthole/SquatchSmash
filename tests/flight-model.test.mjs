import assert from 'node:assert/strict';
import test from 'node:test';

import { FlightModel } from '../src/airstrip/flight.js';

function step(model, seconds, input, dt = 0.05) {
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) {
    model.update(Math.min(dt, seconds - elapsed), input);
  }
}

test('the aircraft accelerates, rotates, and leaves the runway under player control', () => {
  const plane = new FlightModel({ z: 120, heading: 0 });

  step(plane, 9, { throttle: 1, pitch: 0 });
  assert.equal(plane.onGround, true);
  assert.ok(plane.speed > 34);

  step(plane, 2, { throttle: 1, pitch: 1 });
  assert.equal(plane.onGround, false);
  assert.ok(plane.altitude > 2);
  assert.ok(plane.z < 120);
});

test('banking turns an airborne aircraft while pitch changes altitude', () => {
  const plane = new FlightModel({
    altitude: 80,
    speed: 55,
    throttle: 0.75,
    heading: 0,
    onGround: false,
  });

  step(plane, 3, { throttle: 0, pitch: 0.5, bank: 0.8 });

  assert.ok(plane.heading > 0.08);
  assert.ok(plane.altitude > 80);
  assert.ok(plane.bank > 0.2);
});

test('a controlled touchdown lands while an excessive descent crashes', () => {
  const safe = new FlightModel({
    altitude: 2,
    speed: 27,
    throttle: 0.2,
    pitch: -0.04,
    verticalSpeed: -1.2,
    onGround: false,
  });
  step(safe, 2, { throttle: -1, pitch: 0 });
  assert.equal(safe.onGround, true);
  assert.equal(safe.crashed, false);
  assert.equal(safe.lastTouchdown?.quality, 'clean');

  const hard = new FlightModel({
    altitude: 2,
    speed: 45,
    throttle: 0,
    pitch: -0.4,
    verticalSpeed: -7,
    onGround: false,
  });
  step(hard, 1, { throttle: -1, pitch: -1 });
  assert.equal(hard.crashed, true);
  assert.equal(hard.onGround, true);
});

test('reset restores a supplied checkpoint without stale crash state', () => {
  const plane = new FlightModel({ altitude: 20, onGround: false });
  plane.crashed = true;

  plane.reset({
    x: 4,
    z: -1500,
    heading: Math.PI,
    speed: 0,
    altitude: 0,
    onGround: true,
  });

  assert.equal(plane.crashed, false);
  assert.equal(plane.x, 4);
  assert.equal(plane.z, -1500);
  assert.equal(plane.heading, Math.PI);
  assert.equal(plane.onGround, true);
});
