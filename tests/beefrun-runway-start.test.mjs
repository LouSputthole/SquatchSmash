import assert from 'node:assert/strict';
import test from 'node:test';

import { stageRunwayStartup } from '../src/beefrun/runway-start.js';

test('boarding stages the stopped aircraft on runway 18 with its brake set', () => {
  const calls = [];
  const position = {
    clone: () => ({
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
    }),
  };
  const physics = {
    position,
    controls: { parkingBrake: false },
    setPose(pos, heading, speed) { calls.push({ pos, heading, speed }); },
  };
  const input = {
    parkingBrake: false,
    throttle: 0.4,
    throttleSplit: -0.5,
    brake: 1,
    clear() { calls.push({ inputCleared: true }); },
  };
  const engines = { setThrottles(value) { calls.push({ throttles: value }); } };
  const aircraft = { syncTo(value) { calls.push({ sync: value }); } };

  const staged = stageRunwayStartup({
    physics,
    input,
    engines,
    aircraft,
    runway: { x: 2, z: 400 },
    elevation: 42,
    gearHeight: 1.35,
    heading: 180,
  });

  assert.deepEqual(staged, { x: 2, y: 43.35, z: 400, heading: 180 });
  assert.deepEqual(calls[1], {
    pos: { x: 2, y: 43.35, z: 400, set: calls[1].pos.set },
    heading: 180,
    speed: 0,
  });
  assert.deepEqual(calls[0], { inputCleared: true });
  assert.deepEqual(calls.slice(2), [{ throttles: 0 }, { sync: physics }]);
  assert.equal(input.parkingBrake, true);
  assert.equal(physics.controls.parkingBrake, true);
  assert.equal(input.throttle, 0);
  assert.equal(input.throttleSplit, 0);
  assert.equal(input.brake, 0);
});
