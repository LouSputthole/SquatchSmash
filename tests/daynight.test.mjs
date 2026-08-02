import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthoredClock } from '../src/core/authored-clock.js';
import { DayNight } from '../src/core/daynight.js';

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

test('the first apartment wake shows a committed dawn sky instead of night', () => {
  const time = new DayNight(6 + 4 / 60);
  time.update(0);

  assert.equal(time.phase, 'dawn');
  assert.equal(time.skyFrom, 'dawn');
  assert.equal(time.skyTo, 'dawn');
  assert.ok(time.dayness >= 0.18, `expected readable dawn light, got ${time.dayness}`);
});
