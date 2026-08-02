import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { FlightInput } from '../src/beefrun/input.js';
import { MissionController, PREVIEW_SKIP_PHASES } from '../src/beefrun/mission.js';
import { MissionAudio } from '../src/beefrun/audio.js';
import { setPose } from '../src/beefrun/npc.js';
import { TAMMY_STICKER_FILE } from '../src/beefrun/aircraft.js';
import { REMOTE_AIRFIELD_DETAIL_NAMES } from '../src/beefrun/airstrip.js';

function figureRig() {
  return {
    group: new THREE.Group(), hips: new THREE.Group(), pose: 'idle',
    arms: [0, 1].map(() => ({
      shoulder: { rotation: new THREE.Euler() }, elbow: { rotation: new THREE.Euler() },
    })),
    legs: [0, 1].map(() => ({
      hip: { rotation: new THREE.Euler() }, knee: { rotation: new THREE.Euler() },
    })),
  };
}

function withNoGamepad(run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => [] },
  });
  try { return run(); } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
}

test('the cockpit keyboard banks toward the key the player presses', () => withNoGamepad(() => {
  const axisFor = (code) => {
    const input = new FlightInput();
    input.key(code, true);
    input.update(0.2);
    return input.axes.roll;
  };

  // The cockpit camera faces body +Z. In that authored frame positive roll is
  // the visible left bank and negative roll is the visible right bank.
  assert.ok(axisFor('KeyA') > 0, 'A banks left in the cockpit view');
  assert.ok(axisFor('KeyD') < 0, 'D banks right in the cockpit view');
}));

test('entering the cockpit always puts Captain Sasole in the copilot seat', () => {
  const aircraft = { group: new THREE.Group(), copilotSeat: new THREE.Vector3(0.42, -0.28, 1.66) };
  const lou = figureRig();
  const mission = {
    aircraft,
    lou,
    louBoarding: { t: 0.2, from: new THREE.Vector3(-2, 0, 0) },
    flags: { inCockpit: false, louAboard: false },
    player: { enabled: true, mode: 'walk' },
    interaction: { setPaused() {} },
    cameras: { setView() {}, lookYaw: 9, lookPitch: 9 },
    audio: { setHeadset() {} },
    dialogue: { setHeadset() {} },
    input: {},
    flightHud: { show() {}, showControls() {} },
    phase: 'boarding',
    disarmBoardingTarget() {},
    setPhase(name) { this.phase = name; },
  };
  Object.setPrototypeOf(mission, MissionController.prototype);

  MissionController.prototype.enterCockpit.call(mission);

  assert.equal(lou.group.parent, aircraft.group);
  assert.ok(lou.group.position.distanceTo(aircraft.copilotSeat) < 0.001);
  assert.equal(mission.flags.louAboard, true);
  assert.equal(mission.louBoarding, null);
  assert.equal(mission.phase, 'startup');
});

test('the Old Stove phase pulls both men closer and authors a quick camera look', () => {
  const lou = figureRig();
  lou.group.position.set(-52.4, 42, 380.3);
  const stove = figureRig();
  stove.group.position.set(-60.5, 42, 384);
  const mission = {
    lou, stove,
    airfield: { anchors: { louStoveStand: new THREE.Vector3(-55, 42, 382) } },
    preflight: { disarm() {} },
    flightHud: { showChecklist() {} },
    setObjective() {},
  };

  MissionController.prototype.onEnterPhase.call(mission, 'stove');

  assert.deepEqual(
    { x: lou.walk?.x, z: lou.walk?.z },
    { x: mission.airfield.anchors.louStoveStand.x, z: mission.airfield.anchors.louStoveStand.z },
  );
  assert.equal(mission.groundLook?.target, stove.group);
  assert.ok(mission.groundLook?.duration >= 0.8 && mission.groundLook.duration <= 1.6);
});

test("Captain Sasole's leaning left arm stays outside his torso", () => {
  const lou = figureRig();
  setPose(lou, 'lean');
  assert.ok(lou.arms[0].shoulder.rotation.z < 0, 'left shoulder angles away from the chest');
});

test('the dashboard reuses the canonical Tammy fridge sticker', () => {
  assert.equal(TAMMY_STICKER_FILE, 'sticker-pinup.png');
});

test('developer preview skips cover preflight, both takeoffs, flight, and both landings', () => {
  assert.deepEqual(PREVIEW_SKIP_PHASES.map((entry) => entry.id), [
    'preflight', 'takeoff', 'flight', 'mountain-landing', 'remote-takeoff', 'home-landing',
  ]);
  const actions = [];
  const mission = {
    flags: { inCockpit: false },
    airfield: { anchors: { parking: new THREE.Vector3(-55, 42, 385) } },
    player: { position: new THREE.Vector3(), ground: 0, yaw: 0, mode: 'walk', enabled: true },
    setPhase(name) { actions.push(['phase', name]); },
    restoreCheckpoint(name) { actions.push(['checkpoint', name]); },
  };
  MissionController.prototype.previewSkip.call(mission, 'preflight');
  MissionController.prototype.previewSkip.call(mission, 'flight');
  MissionController.prototype.previewSkip.call(mission, 'home-landing');
  assert.deepEqual(actions, [
    ['phase', 'preflight'], ['checkpoint', 'cruise'], ['checkpoint', 'return'],
  ]);
});

test('terrain brushes are survivable but a hard crash destroys and explodes the plane once', () => {
  const events = [];
  const mission = {
    physics: {
      damage: { wing: 0 },
      controls: { throttleL: 0.7, throttleR: 0.7 },
      velocity: new THREE.Vector3(0, -10, 40),
      omega: new THREE.Vector3(1, 1, 1),
    },
    cameras: { addShake(amount) { events.push(['shake', amount]); } },
    audio: {
      play(name) { events.push(['play', name]); },
      explosion() { events.push(['explosion']); },
    },
    aircraft: { destroyed: false, explode() { this.destroyed = true; events.push(['visual']); } },
    engines: { kill(index, reason) { events.push(['kill', index, reason]); } },
    fail(message) { events.push(['fail', message]); },
  };

  MissionController.prototype.onImpact.call(mission, 7.3, 'terrain');
  assert.equal(events.some(([name]) => name === 'explosion' || name === 'fail'), false);

  MissionController.prototype.onImpact.call(mission, 7.8, 'terrain');
  assert.equal(events.filter(([name]) => name === 'explosion').length, 1);
  MissionController.prototype.onImpact.call(mission, 10, 'terrain');
  assert.equal(events.filter(([name]) => name === 'explosion').length, 1);
  assert.equal(events.filter(([name]) => name === 'visual').length, 1);
  assert.deepEqual(events.filter(([name]) => name === 'kill'), [
    ['kill', 0, 'destroyed'], ['kill', 1, 'destroyed'],
  ]);
  assert.equal(events.filter(([name]) => name === 'fail').length, 1);
});

test('the hard crash starts with a dedicated aircraft explosion cue', () => {
  const played = [];
  const audio = new MissionAudio({
    play(name, options) { played.push([name, options]); },
  });

  audio.explosion();

  assert.equal(played[0][0], 'plane.crash.explosion');
  assert.equal(played[0][1].volume, 1);
  assert.ok(played.some(([name]) => name === 'gun.impact'), 'mechanical impact layer remains');
});

test('El Hueso has authored runway, utility, and camp detail groups', () => {
  assert.deepEqual(REMOTE_AIRFIELD_DETAIL_NAMES, [
    'el-hueso-edge-markers',
    'el-hueso-threshold',
    'el-hueso-generator',
    'el-hueso-workbench',
    'el-hueso-clothesline',
    'el-hueso-sign',
  ]);
});
