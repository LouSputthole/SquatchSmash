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

/**
 * Owner, playtest 2026-08-26: *"I would like the car to be able to go a little
 * bit faster, so like at least 90."*
 *
 * The clamp used to be pinned to 24-28 m/s, which is 54-63 mph, and the car
 * settled at 58.2. The interesting part is that the clamp was never what held
 * it there: raising `maxForwardSpeed` alone and leaving `drag` at 0.014 gets
 * 65.4 mph and stops, because drag is what the car actually balances against.
 * Both had to move. Measured on this runner at full throttle: 91.7 mph
 * steady, 89.0 within the seven seconds this test allows.
 */
const MPH_PER_MS = 2.23694;
const ESCAPE_STEP = 1 / 120;

function accelerateEscapeCar(targetMph, maxSeconds = 20) {
  const car = new GroundVehicle(HEIST_ESCAPE_VEHICLE_CONFIG);
  car.setInput({ throttle: 1 });
  let steps = 0;
  let distance = 0;
  while (car.speed * MPH_PER_MS < targetMph && steps * ESCAPE_STEP < maxSeconds) {
    const beforeX = car.x;
    const beforeZ = car.z;
    car.step(ESCAPE_STEP);
    distance += Math.hypot(car.x - beforeX, car.z - beforeZ);
    steps++;
  }
  return { car, seconds: steps * ESCAPE_STEP, distance };
}

test('THE TAKE escape car reaches a cinematic road speed without losing fixed-step control', () => {
  const topMph = HEIST_ESCAPE_VEHICLE_CONFIG.maxForwardSpeed * MPH_PER_MS;
  assert.ok(topMph >= 90,
    `the owner asked for at least 90 mph and the clamp allows ${topMph.toFixed(1)}`);
  assert.ok(topMph <= 100, `${topMph.toFixed(1)} mph is no longer an escape car`);
  assert.ok(HEIST_ESCAPE_VEHICLE_CONFIG.acceleration >= 10);

  const car = new GroundVehicle(HEIST_ESCAPE_VEHICLE_CONFIG);
  const runner = new FixedStepRunner({ hz: 120, maxSteps: 8 });
  car.setInput({ throttle: 1 });
  for (let frame = 0; frame < 60 * 7; frame++) {
    runner.advance(1 / 60, (dt) => car.step(dt));
  }

  /* Reaching the clamp is not the same as being allowed to. Drag is the real
   * limiter, so assert what the car DOES, not what the constant permits. */
  assert.ok(car.speed * MPH_PER_MS >= 85,
    `only reached ${(car.speed * MPH_PER_MS).toFixed(1)} mph in seven seconds -- `
    + 'raising the clamp without lowering drag looks like this');
  assert.ok(car.speed <= HEIST_ESCAPE_VEHICLE_CONFIG.maxForwardSpeed);
});

test('THE TAKE escape-car acceleration and steady top speed stay inside the measured envelope', () => {
  /* These are the concrete version of the owner's *"at least 90"*. A clamp
   * can be green while drag quietly keeps the car at 65 mph, so this contract
   * measures both when the road speed arrives and where the drivetrain really
   * settles. The same 120 Hz GroundVehicle is used by the browser scene. */
  const sixty = accelerateEscapeCar(60);
  const ninety = accelerateEscapeCar(90);
  const top = accelerateEscapeCar(HEIST_ESCAPE_VEHICLE_CONFIG.maxForwardSpeed * MPH_PER_MS);

  assert.ok(sixty.seconds >= 2.75 && sixty.seconds <= 2.9,
    `60 mph arrived in ${sixty.seconds.toFixed(3)} s`);
  assert.ok(sixty.distance >= 38 && sixty.distance <= 41,
    `60 mph took ${sixty.distance.toFixed(2)} m`);
  assert.ok(ninety.seconds >= 7.5 && ninety.seconds <= 7.7,
    `90 mph arrived in ${ninety.seconds.toFixed(3)} s`);
  assert.ok(ninety.distance >= 208 && ninety.distance <= 215,
    `90 mph took ${ninety.distance.toFixed(2)} m`);
  assert.ok(top.seconds >= 9.6 && top.seconds <= 9.9,
    `the 91.7 mph clamp arrived in ${top.seconds.toFixed(3)} s`);
  assert.ok(Math.abs(top.car.speed * MPH_PER_MS - 91.71454) < 0.001,
    `steady top speed is ${(top.car.speed * MPH_PER_MS).toFixed(5)} mph`);
});

test('THE TAKE escape car stops from a representative 60 mph without a hidden brake delay', () => {
  const { car } = accelerateEscapeCar(60);
  const startX = car.x;
  const startZ = car.z;
  car.setInput({ throttle: 0, brake: 1 });
  let steps = 0;
  while (car.speed > 0 && steps < 120 * 5) {
    car.step(ESCAPE_STEP);
    steps++;
  }
  const seconds = steps * ESCAPE_STEP;
  const distance = Math.hypot(car.x - startX, car.z - startZ);

  assert.ok(seconds >= 1.55 && seconds <= 1.75,
    `full braking from 60 mph took ${seconds.toFixed(3)} s`);
  assert.ok(distance >= 21.5 && distance <= 24.5,
    `full braking from 60 mph took ${distance.toFixed(2)} m`);
});

test('THE TAKE escape car answers a quarter-second steering input at 60 mph', () => {
  /* A whole second of full lock is not a lane change; it is an authored city
   * corner. A quarter-second press is the useful response sample for whether
   * the player can place the car without waiting on the steering state. */
  const { car } = accelerateEscapeCar(60);
  const startX = car.x;
  const startZ = car.z;
  const startHeading = car.heading;
  car.setInput({ throttle: 1, steer: 1 });
  for (let step = 0; step < 30; step++) car.step(ESCAPE_STEP);
  const yawDegrees = Math.abs(car.heading - startHeading) * 180 / Math.PI;
  const distance = Math.hypot(car.x - startX, car.z - startZ);

  assert.ok(yawDegrees >= 33 && yawDegrees <= 38,
    `quarter-second full steer produced ${yawDegrees.toFixed(2)} degrees of yaw`);
  assert.ok(distance >= 6.4 && distance <= 7.1,
    `quarter-second steering sample travelled ${distance.toFixed(2)} m`);
  assert.ok(car.steerAngle > 0.25,
    `steering only reached ${car.steerAngle.toFixed(3)} rad`);
});
