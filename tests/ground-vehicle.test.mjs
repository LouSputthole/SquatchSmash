import assert from 'node:assert/strict';
import test from 'node:test';

import { FixedStepRunner } from '../src/core/vehicles/fixed-step.js';
import { GroundVehicle } from '../src/core/vehicles/ground-vehicle.js';
import { HEIST_ESCAPE_VEHICLE_CONFIG } from '../src/heist/config.js';

function simulate(fps, seconds) {
  const runner = new FixedStepRunner({ hz: 120, maxSteps: 8 });
  const car = new GroundVehicle();
  car.setInput({ throttle: 1, steer: 0.32 });
  for (let i = 0; i < fps * seconds; i++) {
    runner.advance(1 / fps, (dt) => car.step(dt));
  }
  return { runner, car };
}

test('ground handling is frame-rate independent at 30, 60 and 120 fps', () => {
  const at30 = simulate(30, 4).car.snapshot();
  const at60 = simulate(60, 4).car.snapshot();
  const at120 = simulate(120, 4).car.snapshot();

  for (const key of ['x', 'z', 'heading', 'speed', 'lateralSlip']) {
    assert.ok(Math.abs(at30[key] - at60[key]) < 1e-8, `${key} differs at 30/60`);
    assert.ok(Math.abs(at60[key] - at120[key]) < 1e-8, `${key} differs at 60/120`);
  }
});

test('fixed-step runner bounds catch-up after a stalled render frame', () => {
  const runner = new FixedStepRunner({ hz: 120, maxSteps: 8 });
  let steps = 0;
  runner.advance(0.25, () => { steps++; });

  assert.equal(steps, 8);
  assert.equal(runner.lastSteps, 8);
  assert.ok(runner.droppedTime > 0);
  assert.ok(runner.accumulator < runner.fixedDt);
});

test('vehicle damage changes handling and survives checkpoint restore', () => {
  const car = new GroundVehicle();
  car.setInput({ throttle: 1 });
  for (let i = 0; i < 240; i++) car.step(1 / 120);
  const speedBefore = car.speed;
  const damage = car.applyCollision({ severity: 0.8, windshield: true, tire: true });
  car.markStableNode('canal_entry');
  const snapshot = car.snapshot();

  assert.ok(damage > 0);
  assert.ok(car.speed < speedBefore);
  assert.ok(car.engineHealth < 100);
  assert.ok(car.windshieldHealth < 100);
  assert.ok(car.tireGrip < 1);

  const restored = new GroundVehicle();
  restored.restore(snapshot);
  assert.deepEqual(restored.snapshot(), snapshot);
  assert.equal(restored.lastStableNode, 'canal_entry');
});

test('THE TAKE escape car reaches a cinematic road speed without losing fixed-step control', () => {
  assert.ok(HEIST_ESCAPE_VEHICLE_CONFIG.maxForwardSpeed >= 24);
  assert.ok(HEIST_ESCAPE_VEHICLE_CONFIG.maxForwardSpeed <= 28);
  assert.ok(HEIST_ESCAPE_VEHICLE_CONFIG.acceleration >= 10);

  const car = new GroundVehicle(HEIST_ESCAPE_VEHICLE_CONFIG);
  const runner = new FixedStepRunner({ hz: 120, maxSteps: 8 });
  car.setInput({ throttle: 1 });
  for (let frame = 0; frame < 60 * 7; frame++) {
    runner.advance(1 / 60, (dt) => car.step(dt));
  }

  assert.ok(car.speed * 2.237 >= 45, `only reached ${(car.speed * 2.237).toFixed(1)} mph`);
  assert.ok(car.speed <= HEIST_ESCAPE_VEHICLE_CONFIG.maxForwardSpeed);
});
