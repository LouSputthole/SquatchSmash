/**
 * The Beef Run speaks in one frame: the pilot's.
 *
 * The Brushrunner's nose is +Z. In Three's right-handed frame a pilot facing
 * +Z with +Y up has his LEFT at +X and his RIGHT at -X — the mirror of what
 * you read standing on the apron looking at the aeroplane. Every left/right
 * word the mission says (the seat Sasole leaves you, which engine to start
 * first, which way she pulls) used to be authored from outside, so the
 * objective said "left seat" and put the player in the right one.
 *
 * These are the frame's contracts, in the two places they can be measured
 * without a browser: the flight model and the keyboard. The cockpit geometry
 * itself needs a canvas, so it is asserted in `tools/verify-beefrun.mjs`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { AircraftPhysics } from '../src/beefrun/physics.js';
import { EngineSystem } from '../src/beefrun/engines.js';
import { FlightInput, isBrowserReservedChord } from '../src/beefrun/input.js';

const GROUND = 42;
const dt = 1 / 60;

function runningAircraft() {
  const physics = new AircraftPhysics({ getHeight: () => GROUND });
  const engines = new EngineSystem();
  engines.masterBattery = true;
  engines.fuelSelectors = true;
  engines.rightBalks = false;
  engines.crank(0);
  engines.crank(1);
  for (let i = 0; i < 240; i++) engines.update(dt, 0);
  physics.engines = engines;
  return { physics, engines };
}

/** Yaw acceleration over half a second, in the pilot's frame: + is his left. */
function yawAccel(physics, engines, seconds = 0.5) {
  const before = physics.omega.y;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    engines.update(dt, physics.tas);
    physics.advance(dt);
  }
  return (physics.omega.y - before) / seconds;
}

test('the left engine hangs on the pilot\'s left, so its thrust alone yaws him right', () => {
  const { physics, engines } = runningAircraft();
  physics.setPose(new THREE.Vector3(0, GROUND + 3000, 0), 0, 60);
  physics.controls.parkingBrake = false;

  // Engine 0 is the one Sasole calls the left engine and the one key 1 starts.
  engines.setThrottles(0);
  engines.engines[0].throttle = 1;
  physics.controls.throttleL = 1;
  physics.controls.throttleR = 0;

  const accel = yawAccel(physics, engines);

  assert.ok(
    accel < 0,
    `left-engine-only thrust must swing the nose to the pilot's right; got ${accel} rad/s²`,
  );
});

test('the right engine is the mirror of it', () => {
  const { physics, engines } = runningAircraft();
  physics.setPose(new THREE.Vector3(0, GROUND + 3000, 0), 0, 60);
  physics.controls.parkingBrake = false;

  engines.setThrottles(0);
  engines.engines[1].throttle = 1;
  physics.controls.throttleL = 0;
  physics.controls.throttleR = 1;

  const accel = yawAccel(physics, engines);

  assert.ok(
    accel > 0,
    `right-engine-only thrust must swing the nose to the pilot's left; got ${accel} rad/s²`,
  );
});

test('she pulls left, which is what Sasole says she does', () => {
  /* His walkaround line is "She pulls left, leaks right, and the fuel gauge is
   * an optimist." The pull is P-factor and engine torque at low speed under
   * power, so it is measured where it lives: airborne, slow, both throttles
   * open, no pedal in. It used to pull the other way. */
  const { physics, engines } = runningAircraft();
  physics.setPose(new THREE.Vector3(0, GROUND + 3000, 0), 0, 26);
  physics.controls.parkingBrake = false;
  physics.controls.yaw = 0;
  engines.setThrottles(1);
  physics.controls.throttleL = physics.controls.throttleR = 1;

  const accel = yawAccel(physics, engines, 0.25);

  assert.ok(accel > 0, `the uncommanded low-speed swing must be to the left; got ${accel} rad/s²`);
});

test('Shift raises the throttle and Z lowers it', () => {
  const input = new FlightInput();
  input.usingGamepad = false;

  input.key('Shift', true);
  input.update(0.5);
  const raised = input.throttle;
  input.key('Shift', false);

  input.key('KeyZ', true);
  input.update(0.5);
  const lowered = input.throttle;

  assert.ok(raised > 0.3, `Shift must open the throttle; got ${raised}`);
  assert.ok(lowered < raised, `Z must close it again; went ${raised} -> ${lowered}`);
});

test('no browser modifier is a flight control any more', () => {
  /* `preventDefault` never reaches a browser accelerator, so a Ctrl binding is
   * not a binding the game owns. Ctrl held with W — pitch — is Ctrl+W, which
   * closes the tab. */
  for (const modifier of ['Control', 'ControlLeft', 'ControlRight', 'Meta', 'MetaLeft', 'MetaRight', 'Alt']) {
    const input = new FlightInput();
    input.usingGamepad = false;
    input.throttle = 0.5;
    input.key(modifier, true);
    input.update(0.5);
    assert.equal(
      input.throttle, 0.5,
      `${modifier} must not move the throttle`,
    );
    assert.equal(input.axes.pitch, 0, `${modifier} must not move an axis`);
    assert.equal(input.axes.roll, 0, `${modifier} must not move an axis`);
  }
});

test('a browser chord is recognised so the mission can say where the lever went', () => {
  assert.equal(isBrowserReservedChord({ code: 'KeyW', ctrlKey: true }), true);
  assert.equal(isBrowserReservedChord({ code: 'KeyW', metaKey: true }), true);
  assert.equal(isBrowserReservedChord({ code: 'KeyW' }), false);
  assert.equal(isBrowserReservedChord({ code: 'KeyW', shiftKey: true }), false);
  assert.equal(isBrowserReservedChord(null), false);
});

test('the Beef Run never advertises Ctrl or Cmd as a control', () => {
  /* The page may only mention them inside the warning that tells the player
   * not to use them. Anything else is a stale controls card teaching a chord
   * that closes the tab. */
  const html = fs.readFileSync(new URL('../beefrun.html', import.meta.url), 'utf8');
  const lines = html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/\bCtrl\b|\bCmd\b/.test(lines[i])) continue;
    const block = lines.slice(Math.max(0, i - 3), i + 3).join('\n');
    assert.match(
      block, /browser|shortcut|closes the tab|warn/i,
      `beefrun.html line ${i + 1} names Ctrl/Cmd outside the browser-shortcut warning`,
    );
  }
});
