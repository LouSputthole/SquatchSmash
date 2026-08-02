import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { selectApproachCall } from '../src/beefrun/approach-coaching.js';
import { CameraManager } from '../src/beefrun/cameras.js';
import { FlightInput } from '../src/beefrun/input.js';
import { MissionController } from '../src/beefrun/mission.js';
import { AircraftPhysics } from '../src/beefrun/physics.js';
import { stageRemoteDeparture } from '../src/beefrun/remote-departure.js';

function cockpitHorizonAfter(keyCode) {
  const input = new FlightInput();
  input.pollGamepad = () => null;
  input.key(keyCode, true);
  input.update(0.3);

  const physics = new AircraftPhysics({ getHeight: () => 0 });
  physics.setPose(new THREE.Vector3(0, 500, 0), 0, 55);
  physics.controls.parkingBrake = false;
  physics.assist = {
    stability: 0,
    autoRudder: 0,
    stallGuard: 0,
    groundAssist: 0,
    torque: 0,
  };
  input.applyTo(physics.controls);
  for (let i = 0; i < 60; i++) physics.step(1 / 120);

  const body = new THREE.Group();
  body.position.copy(physics.position);
  body.quaternion.copy(physics.quat);
  const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 5000);
  new CameraManager(camera).update(0, physics, body, new THREE.Vector3());
  camera.updateMatrixWorld();

  const horizon = [
    new THREE.Vector3(-100, 500, 1000).project(camera),
    new THREE.Vector3(100, 500, 1000).project(camera),
  ].sort((a, b) => a.x - b.x);
  return { leftY: horizon[0].y, rightY: horizon[1].y };
}

test('A banks left and D banks right in the cockpit view', () => {
  const a = cockpitHorizonAfter('KeyA');
  const d = cockpitHorizonAfter('KeyD');

  assert.ok(a.leftY > a.rightY,
    `A showed a right bank: ${JSON.stringify(a)}`);
  assert.ok(d.leftY < d.rightY,
    `D showed a left bank: ${JSON.stringify(d)}`);
});

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

test('a generic Chrome Shift event raises and releases the throttle', () => {
  const input = new FlightInput();
  input.pollGamepad = () => null;

  input.keyEvent({ key: 'Shift', code: '' }, true);
  input.update(0.5);
  assert.ok(input.keys.has('Shift'));
  assert.ok(input.throttle > 0.3, `Shift throttle was ${input.throttle}`);

  input.keyEvent({ key: 'Shift', code: '' }, false);
  assert.ok(!input.keys.has('Shift'));
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

test('gamepad right roll and rudder match D and E in the cockpit', () => {
  const right = new FlightInput();
  right.pollGamepad = () => ({ axes: [1, 0, 1, 0], buttons: [] });
  right.update(0.016);

  const left = new FlightInput();
  left.pollGamepad = () => ({ axes: [-1, 0, -1, 0], buttons: [] });
  left.update(0.016);

  assert.ok(right.axes.roll < 0, `right-stick roll was ${right.axes.roll}`);
  assert.ok(right.axes.yaw < 0, `right-stick rudder was ${right.axes.yaw}`);
  assert.ok(left.axes.roll > 0, `left-stick roll was ${left.axes.roll}`);
  assert.ok(left.axes.yaw > 0, `left-stick rudder was ${left.axes.yaw}`);
});

test('R is inert so checkpoint restart requires the pause menu', () => {
  const input = new FlightInput();
  const actions = [];
  input.onAction = (action) => actions.push(action);

  input.key('KeyR', true);

  assert.deepEqual(actions, []);
});

test('restart cannot skip the apron flow before a checkpoint exists', () => {
  const restored = [];
  const fake = {
    finished: false,
    checkpoint: null,
    restoreCheckpoint: (name) => { restored.push(name); return true; },
  };

  assert.equal(MissionController.prototype.requestRestart.call(fake), false);
  assert.deepEqual(restored, []);

  fake.checkpoint = 'departure';
  assert.equal(MissionController.prototype.requestRestart.call(fake), true);
  assert.deepEqual(restored, ['departure']);
});
