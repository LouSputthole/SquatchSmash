import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { FIRST_PERSON_CAPTURE_MODES } from '../src/core/first-person-input.js';
import { createFlightFirstPersonPolicy } from '../src/beefrun/first-person-controls.js';

function policyFixture() {
  let onFoot = true;
  const events = [];
  const flightInput = {
    keyEvent(event, down) {
      events.push(['flight-key', event.code, down]);
      return event.code;
    },
  };
  const policy = createFlightFirstPersonPolicy({
    isActive: () => true,
    isOnFoot: () => onFoot,
    flightInput,
    lookAircraft: (x, y) => events.push(['aircraft-look', x, y]),
    pressPrimary: () => events.push(['primary', true]),
    releasePrimary: () => events.push(['primary', false]),
    beforeKeyDown: (event) => event.code === 'Digit5',
    afterKeyDown: (event) => {
      events.push(['after-key', event.code]);
      return false;
    },
  });
  return { policy, events, setOnFoot: (value) => { onFoot = value; } };
}

test('flight policy makes capture lifecycle canonical while keeping modes scene-authored', () => {
  const fixture = policyFixture();
  assert.equal(fixture.policy.captureMode, FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG);
  assert.deepEqual(fixture.policy.controlState(), {
    playerEnabled: true,
    movementEnabled: true,
    lookEnabled: true,
    interactionEnabled: true,
  });
  fixture.setOnFoot(false);
  assert.deepEqual(fixture.policy.controlState(), {
    playerEnabled: false,
    movementEnabled: false,
    lookEnabled: false,
    interactionEnabled: false,
  });
});

test('flight capture can spend the start gesture before gameplay input becomes active', () => {
  const events = [];
  const policy = createFlightFirstPersonPolicy({
    isActive: () => false,
    canCapture: () => true,
    isOnFoot: () => true,
    flightInput: { keyEvent: () => events.push('flight-key') },
    lookAircraft: () => {},
    pressPrimary: () => {},
    releasePrimary: () => {},
  });
  assert.equal(policy.canEnable(), true);
  assert.equal(policy.canHandleInput(), false);
});

test('flight policy routes cockpit look and controls without swallowing on-foot defaults', () => {
  const fixture = policyFixture();
  assert.equal(fixture.policy.routes.mouseMove({ movementX: 2, movementY: -3 }), false);
  fixture.setOnFoot(false);
  assert.equal(fixture.policy.routes.mouseMove({ movementX: 4, movementY: -5 }), true);

  let prevented = 0;
  assert.equal(fixture.policy.routes.keyDown({
    code: 'Space', key: ' ', repeat: false, preventDefault: () => { prevented += 1; },
  }, { code: 'Space' }), false);
  assert.equal(prevented, 1);
  assert.equal(fixture.policy.routes.keyDown({ code: 'Digit5', repeat: false }, { code: 'Digit5' }), true);
  fixture.policy.routes.keyUp({ code: 'Space' }, { code: 'Space' });
  assert.deepEqual(fixture.events, [
    ['aircraft-look', 4, -5],
    ['flight-key', 'Space', true],
    ['after-key', 'Space'],
    ['flight-key', 'Space', false],
  ]);
});

test('flight roots no longer own duplicate browser-to-Player plumbing', () => {
  for (const file of ['src/beefrun/main.js', 'src/enolasquatch/main.js']) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /createFirstPersonInput/);
    assert.match(source, /createFlightFirstPersonPolicy/);
    assert.doesNotMatch(source, /addEventListener\(['"]pointerlockchange/);
    assert.doesNotMatch(source, /player\.handleMouseMove\(/);
    assert.doesNotMatch(source, /player\.setKey\(/);
  }
});
