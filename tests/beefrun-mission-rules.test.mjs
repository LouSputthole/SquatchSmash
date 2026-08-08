import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { selectApproachCall } from '../src/beefrun/approach-coaching.js';
import { FlightInput } from '../src/beefrun/input.js';
import {
  MissionController,
  resetCheckpointThrottleSplit,
  syncCheckpointParkingBrake,
} from '../src/beefrun/mission.js';
import { fromWardrobe, makeFigure, setPose } from '../src/beefrun/npc.js';
import { AircraftPhysics } from '../src/beefrun/physics.js';
import { stageRemoteDeparture } from '../src/beefrun/remote-departure.js';
import { CAPTAIN_LOU_SASOLE } from '../src/core/wardrobe.js';

function wingHeightsAfter(keyCode) {
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

  /* Measure the aeroplane the player is moving, not the sign of an internal
   * control axis.  Brushrunner's authored body frame is nose +Z, right wing
   * +X (aircraft.js), so the opposite tip is the left wing. */
  const rightWing = new THREE.Vector3(1, 0, 0).applyQuaternion(physics.quat).add(physics.position);
  const leftWing = new THREE.Vector3(-1, 0, 0).applyQuaternion(physics.quat).add(physics.position);
  return { leftY: leftWing.y, rightY: rightWing.y, rollDeg: physics.rollDeg };
}

test('A lowers the left wing and D lowers the right wing', () => {
  const a = wingHeightsAfter('KeyA');
  const d = wingHeightsAfter('KeyD');

  assert.ok(a.leftY < a.rightY,
    `A showed a right bank: ${JSON.stringify(a)}`);
  assert.ok(d.rightY < d.leftY,
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

test('gamepad right roll matches the right-wing-down D control', () => {
  const right = new FlightInput();
  right.pollGamepad = () => ({ axes: [1, 0, 1, 0], buttons: [] });
  right.update(0.016);

  const left = new FlightInput();
  left.pollGamepad = () => ({ axes: [-1, 0, -1, 0], buttons: [] });
  left.update(0.016);

  assert.ok(right.axes.roll > 0, `right-stick roll was ${right.axes.roll}`);
  assert.ok(right.axes.yaw < 0, `right-stick rudder was ${right.axes.yaw}`);
  assert.ok(left.axes.roll < 0, `left-stick roll was ${left.axes.roll}`);
  assert.ok(left.axes.yaw > 0, `left-stick rudder was ${left.axes.yaw}`);
});

test('R powers only the cockpit radio; checkpoint restart still requires the pause menu', () => {
  const input = new FlightInput();
  const actions = [];
  input.onAction = (action) => actions.push(action);

  input.key('KeyR', true);

  assert.deepEqual(actions, ['radioPower']);
  assert.equal(actions.includes('restart'), false);
});

test('airborne checkpoint restores keep the input-owned parking brake released', () => {
  const input = new FlightInput();
  const controls = { parkingBrake: true };

  syncCheckpointParkingBrake(input, controls, false);
  input.applyTo(controls);

  assert.equal(input.parkingBrake, false);
  assert.equal(controls.parkingBrake, false,
    'the next input frame must not put the parking brake back on');
});

test('checkpoint restores clear dirty split throttle before the next input frame', () => {
  const input = new FlightInput();
  const controls = {};
  input.throttle = 0.55;
  input.throttleSplit = 1;

  resetCheckpointThrottleSplit(input);
  input.applyTo(controls);

  assert.equal(input.throttleSplit, 0);
  assert.equal(controls.throttleL, 0.55);
  assert.equal(controls.throttleR, 0.55,
    'a restored leg must not respawn with one engine commanded to idle');
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

test('preview preflight starts on foot beside the first inspection without creating a flight checkpoint', () => {
  const chock = new THREE.Object3D();
  chock.position.set(-55, 41.62, 385);
  chock.updateMatrixWorld(true);
  const primed = [];
  const fake = {
    phase: 'arrival',
    checkpoint: null,
    flags: { inCockpit: false },
    player: {
      position: new THREE.Vector3(-88, 43.66, 350),
      ground: 42,
      eyeHeight: 1.66,
      mode: 'walk',
      enabled: true,
      yaw: 0,
      pitch: 0,
      velocity: new THREE.Vector3(1, 0, 1),
      clearKeys() {},
    },
    preflight: { chocks: [chock] },
    terrain: { prime: (x, z) => primed.push([x, z]) },
    interaction: { setPaused() {} },
    setPhase(name) { this.phase = name; },
  };

  const started = MissionController.prototype.startPreviewPreflight.call(fake);
  const distance = Math.hypot(
    fake.player.position.x - chock.position.x,
    fake.player.position.z - chock.position.z,
  );

  assert.equal(started, true);
  assert.equal(fake.phase, 'preflight');
  assert.equal(fake.flags.inCockpit, false);
  assert.equal(fake.checkpoint, null);
  assert.equal(fake.player.mode, 'walk');
  assert.equal(fake.player.enabled, true);
  assert.ok(distance >= 2 && distance <= 4, `player started ${distance}m from the first check`);
  assert.deepEqual(primed, [[fake.player.position.x, fake.player.position.z]]);
});

test('Old Stove reveal turns the player briefly and brings Sasole a small step toward the handoff', () => {
  const lou = makeFigure();
  const stove = makeFigure();
  lou.group.position.set(-2, 0, -1);
  stove.group.position.set(4, 0, -5);
  const player = { position: new THREE.Vector3(0, 1.66, 0), yaw: 0, pitch: 0 };
  const fake = {
    flags: { stoveRevealShown: false },
    player,
    stove,
    lou,
    stoveReveal: null,
  };
  const beforeLou = lou.group.position.clone();
  const desiredYaw = Math.atan2(
    -(stove.group.position.x - player.position.x),
    -(stove.group.position.z - player.position.z),
  );
  const beforeError = Math.abs(Math.atan2(
    Math.sin(desiredYaw - player.yaw), Math.cos(desiredYaw - player.yaw),
  ));

  assert.equal(MissionController.prototype.beginStoveReveal.call(fake), true);
  assert.equal(fake.flags.stoveRevealShown, true);
  assert.ok(lou.walk, 'Sasole should take a short step into the handoff');
  const louStep = Math.hypot(lou.walk.x - beforeLou.x, lou.walk.z - beforeLou.z);
  assert.ok(louStep >= 0.8 && louStep <= 1.8, `Sasole moved ${louStep}m`);

  for (let i = 0; i < 8; i++) MissionController.prototype.updateStoveReveal.call(fake, 0.1);
  const afterError = Math.abs(Math.atan2(
    Math.sin(desiredYaw - player.yaw), Math.cos(desiredYaw - player.yaw),
  ));
  assert.ok(afterError < beforeError * 0.35,
    `camera did not turn decisively toward Stove (${beforeError} -> ${afterError})`);
  assert.equal(MissionController.prototype.beginStoveReveal.call(fake), false,
    'the reveal cue is one-shot');
});

test('Sasole lean keeps both forearms and hands outside his torso', () => {
  /* The player sees him from the front, so calling one arm "left" is
   * ambiguous.  The useful production contract is not: neither forearm may
   * pass through his jacket while the briefing pose idles. */
  const lou = makeFigure({
    ...fromWardrobe(CAPTAIN_LOU_SASOLE),
    name: 'captain_lou_sasole',
  });
  setPose(lou, 'lean');
  lou.group.updateMatrixWorld(true);
  const torso = new THREE.Box3().setFromObject(
    lou.group.getObjectByName('captain_lou_sasole-torso'),
  );

  for (const [index, arm] of lou.arms.entries()) {
    for (const [part, object] of [['forearm', arm.elbow.children[0]], ['hand', arm.hand]]) {
      const overlap = torso.clone().intersect(new THREE.Box3().setFromObject(object));
      assert.ok(overlap.isEmpty(), `arm ${index} ${part} still passes through Sasole's torso`);
    }
  }
});
