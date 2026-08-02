import assert from 'node:assert/strict';
import test from 'node:test';

import { SILVER_WAITER_FACE } from '../src/silver/cast.js';
import { PROFILE_OF } from '../src/silver/script.js';

test('the Silver Room waiter uses his authored face and dedicated voice', () => {
  assert.equal(SILVER_WAITER_FACE, 'assets/faces/silver-waiter.png');
  assert.equal(PROFILE_OF.waiter, 'silver-waiter');
});
