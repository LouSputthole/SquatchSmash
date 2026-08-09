import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { FlightInput } = await import('../src/beefrun/input.js');
const { AircraftPhysics } = await import('../src/beefrun/physics.js');
const { AC_ENOLA } = await import('../src/enolasquatch/config.js');
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
