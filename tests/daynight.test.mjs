import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthoredClock } from '../src/core/authored-clock.js';

test('the apartment clock changes only when authored campaign time is applied', () => {
  const time = new AuthoredClock(6 + 4 / 60);

  time.update(15 * 60);
  assert.equal(time.day, 1);
  assert.equal(time.minutes, 6 * 60 + 4);
  assert.equal(time.elapsedReal, 15 * 60);

  time.setTime(1, 6 * 60 + 29);
  assert.equal(time.day, 1);
  assert.equal(time.minutes, 6 * 60 + 29);
  assert.equal(time.clock12, '6:29 AM');
});
