import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { FlightInput } = await import('../src/beefrun/input.js');
const { createFlightFirstPersonPolicy } = await import('../src/beefrun/first-person-controls.js');
const { AircraftPhysics } = await import('../src/beefrun/physics.js');
const { AC_ENOLA } = await import('../src/enolasquatch/config.js');
const {
  consumeEnolaChoiceKey, consumeRetiredEnolaSplitThrottleKey,
} = await import('../src/enolasquatch/choice-input.js');
const { MissionController } = await import('../src/enolasquatch/mission/MissionController.js');
const { EnolaSquatch } = await import('../src/enolasquatch/scenes/EnolaSquatch.js');

function flyEnola({ key = null, stick = null }) {
  // This is deliberately the shared, option-free input used by both flights.
  // A scene-local inversion would make this regression fail even if an axis
  // sign looked plausible in isolation.
  const input = new FlightInput();
  input.pollGamepad = () => (stick === null ? null : {
    connected: true,
    axes: [stick, 0, 0, 0],
    buttons: [],
  });
  if (key) input.key(key, true);
  input.update(0.3);

  const physics = new AircraftPhysics({ getHeight: () => 0, ac: AC_ENOLA });
  physics.setPose(new THREE.Vector3(0, 900, 0), 0, 68);
  physics.controls.parkingBrake = false;
  physics.assist = {
    stability: 0,
    autoRudder: 0,
    stallGuard: 0,
    groundAssist: 0,
    torque: 0,
  };
  input.applyTo(physics.controls);
  for (let i = 0; i < 120; i++) physics.step(1 / 120);

  // Sync the real authored bomber, then read its named port/starboard panels.
  // This catches a mismatch between the shared simulation and Enola's visible
  // body frame that a controls.roll assertion alone cannot see.
  const aircraft = new EnolaSquatch({ withCockpit: false });
  aircraft.syncTo(physics);
  aircraft.group.updateMatrixWorld(true);
  const left = aircraft.group.getObjectByName('air-brake-left');
  const right = aircraft.group.getObjectByName('air-brake-right');
  assert.ok(left && right, 'the visible Enola wing references are present');

  const leftY = left.getWorldPosition(new THREE.Vector3()).y;
  const rightY = right.getWorldPosition(new THREE.Vector3()).y;
  const headingDelta = ((physics.headingDeg + 540) % 360) - 180;
  return {
    controlRoll: physics.controls.roll,
    rollDeg: physics.rollDeg,
    headingDelta,
    leftY,
    rightY,
  };
}

test('shared A/D and gamepad input visibly bank the Enola Squatch in the commanded direction', () => {
  const keyboardLeft = flyEnola({ key: 'KeyA' });
  const keyboardRight = flyEnola({ key: 'KeyD' });
  const stickLeft = flyEnola({ stick: -1 });
  const stickRight = flyEnola({ stick: 1 });

  for (const [name, result] of [
    ['A', keyboardLeft],
    ['left stick', stickLeft],
  ]) {
    assert.ok(result.leftY < result.rightY,
      `${name} raised the visible left wing: ${JSON.stringify(result)}`);
    assert.ok(result.rollDeg > 0 && result.headingDelta > 0,
      `${name} turned the bomber right: ${JSON.stringify(result)}`);
  }
  for (const [name, result] of [
    ['D', keyboardRight],
    ['right stick', stickRight],
  ]) {
    assert.ok(result.rightY < result.leftY,
      `${name} raised the visible right wing: ${JSON.stringify(result)}`);
    assert.ok(result.rollDeg < 0 && result.headingDelta < 0,
      `${name} turned the bomber left: ${JSON.stringify(result)}`);
  }

  assert.equal(Math.sign(keyboardLeft.controlRoll), Math.sign(stickLeft.controlRoll),
    'keyboard A and left stick diverged');
  assert.equal(Math.sign(keyboardRight.controlRoll), Math.sign(stickRight.controlRoll),
    'keyboard D and right stick diverged');
});

test('SQUATCHOLA GAY uses Beef Run’s left-side numbered cockpit card', () => {
  const html = fs.readFileSync(path.join(ROOT, 'enolasquatch.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'src/beefrun/beefrun.css'), 'utf8');
  const controls = css.match(/#br-controls\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body ?? '';
  assert.match(controls, /left\s*:\s*1\.4rem\s*;/, 'the shared cockpit card belongs on the left');
  assert.doesNotMatch(controls, /right\s*:/, 'the Enola must not fork Beef Run into a right-side card');
  assert.match(html, /<kbd>1<\/kbd><kbd>2<\/kbd><span>start \/ stop engines three &amp; four<\/span>/);
  assert.match(html, /<kbd>3<\/kbd><kbd>4<\/kbd><span>battery · fuel<\/span>/);
});

test('a Fat Squatch choice consumes 1-5 before FlightInput can touch an engine or selector', () => {
  for (const digit of ['1', '2', '3', '4', '5']) {
    const actions = [];
    const chosen = [];
    const flightInput = new FlightInput();
    flightInput.onAction = (action) => actions.push(action);
    const mission = {
      phase: 'release',
      _releaseStep: 'awaitChoice',
      chooseReleaseLine(key) { chosen.push(key); return true; },
    };
    const policy = createFlightFirstPersonPolicy({
      isActive: () => true,
      isOnFoot: () => false,
      flightInput,
      lookAircraft() {},
      pressPrimary() {},
      releasePrimary() {},
      beforeKeyDown(event, code) {
        if (!consumeEnolaChoiceKey(mission, code)) return false;
        event.preventDefault();
        return true;
      },
    });
    let prevented = false;
    const code = `Digit${digit}`;
    const event = {
      code, key: digit, repeat: false,
      preventDefault() { prevented = true; },
    };

    assert.equal(policy.routes.keyDown(event, { code }), true);
    assert.deepEqual(chosen, [digit]);
    assert.deepEqual(actions, [], `${code} leaked into the aircraft action map`);
    assert.equal(flightInput.keys.has(code), false, `${code} was left held in FlightInput`);
    assert.equal(prevented, true);
  }
});

test('number keys remain ordinary aircraft controls when no mission choice is active', () => {
  const actions = [];
  const flightInput = new FlightInput();
  flightInput.onAction = (action) => actions.push(action);
  const mission = { phase: 'cruise', _releaseStep: null, _emergencyResolved: true };
  const policy = createFlightFirstPersonPolicy({
    isActive: () => true,
    isOnFoot: () => false,
    flightInput,
    lookAircraft() {},
    pressPrimary() {},
    releasePrimary() {},
    beforeKeyDown: (_event, code) => consumeEnolaChoiceKey(mission, code),
  });
  const event = { code: 'Digit3', key: '3', repeat: false, preventDefault() {} };

  policy.routes.keyDown(event, { code: 'Digit3' });
  assert.deepEqual(actions, ['battery']);
  assert.equal(flightInput.keys.has('Digit3'), true);
});

test('the retired bracket trim cannot disagree with Enola’s visible common throttle', () => {
  for (const code of ['BracketLeft', 'BracketRight']) {
    const flightInput = new FlightInput();
    flightInput.throttleSplit = code === 'BracketLeft' ? -0.8 : 0.8;
    flightInput.key(code, true);
    assert.equal(consumeRetiredEnolaSplitThrottleKey(flightInput, code), true);
    assert.equal(flightInput.throttleSplit, 0);
    assert.equal(flightInput.keys.has(code), false);
  }
  assert.equal(consumeRetiredEnolaSplitThrottleKey(new FlightInput(), 'KeyZ'), false,
    'the visible throttle-back control must still reach FlightInput');
});

test('entering and restoring the cockpit raise the shared left-side controls card', () => {
  const calls = [];
  const flightHud = {
    show: (on) => calls.push(['hud', on]),
    showControls: (on) => calls.push(['controls', on]),
  };
  const mission = {
    phase: 'walkaround',
    disarmBoardingTarget() {},
    preflight: { disarm() {} },
    player: { enabled: true, mode: 'walk' },
    interaction: { setPaused() {} },
    crew: { takeSeats() {} },
    aircraft: { parts: {}, setCrewDoorOpen() {} },
    cameras: { setView() {}, lookYaw: 1, lookPitch: 1 },
    audio: { setHeadset() {} },
    dialogue: { setHeadset() {} },
    input: { rudderKeys: false },
    flightHud,
  };

  MissionController.prototype.enterCockpit.call(mission, { advance: false });
  assert.deepEqual(calls, [['hud', true], ['controls', true]]);
  assert.equal(mission.input.rudderKeys, true);
});
