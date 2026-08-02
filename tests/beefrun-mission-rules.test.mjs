import assert from 'node:assert/strict';
import test from 'node:test';

import { selectApproachCall } from '../src/beefrun/approach-coaching.js';
import { FlightInput } from '../src/beefrun/input.js';
import { stageRemoteDeparture } from '../src/beefrun/remote-departure.js';

test('the terminal high-approach warning cannot repeat forever', () => {
  let approachCalls = 0;
  let highFinalSeen = false;
  const heard = [];

  for (let i = 0; i < 6; i++) {
    const next = selectApproachCall({
      height: 260,
      wantHeight: 80,
      toGo: 900,
      ias: 78,
      approachCalls,
      highFinalSeen,
    });
    approachCalls = next.approachCalls;
    if (next.call) heard.push(next.call);
    if (next.call === 'approach.high3') highFinalSeen = true;
  }

  assert.deepEqual(heard, ['approach.high', 'approach.high2', 'approach.high3']);
});

test('the remote handoff services and stages a flyable aeroplane', () => {
  const calls = [];
  const physics = {
    position: { clone: () => ({ set(x, y, z) { Object.assign(this, { x, y, z }); return this; } }) },
    velocity: { set(x, y, z) { calls.push({ velocity: [x, y, z] }); } },
    controls: { flaps: 0, brake: 1, parkingBrake: true, airBrake: 1 },
    damage: { wing: 0.7, gear: 0.4, tireBurst: true },
    setPose(pos, heading, speed) { calls.push({ pose: { pos, heading, speed } }); },
  };
  const input = {
    throttle: 0.8, throttleSplit: -0.4, flaps: 0, brake: 1, parkingBrake: true, airBrake: 1,
    clear() { calls.push({ inputCleared: true }); },
  };
  const engines = {
    reset(full) { calls.push({ reset: full }); },
    forceRunning() { calls.push({ running: true }); },
    setThrottles(value) { calls.push({ throttles: value }); },
  };
  const aircraft = { syncTo(value) { calls.push({ sync: value }); } };

  const staged = stageRemoteDeparture({
    physics, input, engines, aircraft,
    runway: { x: 40, y: 726, z: -10222 },
    gearHeight: 1.62,
    heading: 0,
  });

  assert.deepEqual(staged, { x: 40, y: 727.62, z: -10222, heading: 0 });
  assert.deepEqual(physics.damage, { wing: 0, gear: 0, tireBurst: false });
  assert.equal(input.throttle, 0);
  assert.equal(input.throttleSplit, 0);
  assert.equal(input.flaps, 0.5);
  assert.equal(input.brake, 0);
  assert.equal(input.airBrake, 0);
  assert.equal(input.parkingBrake, true);
  assert.equal(physics.controls.flaps, 0.5);
  assert.equal(physics.controls.airBrake, 0);
  assert.equal(physics.controls.parkingBrake, true);
  assert.ok(calls.some((call) => call.reset === true));
  assert.ok(calls.some((call) => call.running === true));
  assert.ok(calls.some((call) => call.sync === physics));
});

test('Space is a hold-to-deploy air brake and clears without latching', () => {
  const input = new FlightInput();
  const controls = {};

  input.key('Space', true);
  input.update(0.016);
  input.applyTo(controls);
  assert.equal(input.airBrake, 1);
  assert.equal(controls.airBrake, 1);

  input.key('Space', false);
  input.update(0.016);
  input.applyTo(controls);
  assert.equal(input.airBrake, 0);
  assert.equal(controls.airBrake, 0);
});

test('Q and E use the corrected cockpit rudder polarity', () => {
  const q = new FlightInput();
  q.rudderKeys = true;
  q.key('KeyQ', true);
  q.update(0.25);

  const e = new FlightInput();
  e.rudderKeys = true;
  e.key('KeyE', true);
  e.update(0.25);

  assert.ok(q.axes.yaw > 0, `Q rudder was ${q.axes.yaw}`);
  assert.ok(e.axes.yaw < 0, `E rudder was ${e.axes.yaw}`);
});
