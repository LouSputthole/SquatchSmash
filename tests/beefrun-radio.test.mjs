import assert from 'node:assert/strict';
import test from 'node:test';

import { FlightInput } from '../src/beefrun/input.js';

test('the cockpit exposes the shared receiver controls without stealing flight axes', () => {
  const input = new FlightInput();
  const actions = [];
  input.onAction = (action) => actions.push(action);

  input.key('KeyR', true);
  input.key('KeyT', true);
  input.key('KeyN', true);
  input.update(1 / 60);

  assert.deepEqual(actions, ['radioPower', 'radioTune', 'radioNext']);
  assert.deepEqual(input.axes, { pitch: 0, roll: 0, yaw: 0 });
});
