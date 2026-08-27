import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LUXURY_READY_TASKS,
  createLuxuryApartmentStory,
} from '../src/luxury-apartment/story.js';

test('luxury apartment get-ready beat progressively reveals one departure objective', () => {
  const story = createLuxuryApartmentStory();
  assert.equal(LUXURY_READY_TASKS.length, 3);
  assert.equal(story.objective, 'Get ready for Front & Center · 0/3');

  const early = story.elevator(false);
  assert.equal(early.ok, false);
  assert.equal(early.action, 'blocked');
  assert.match(early.line, /Shower|get ready/i);

  assert.equal(story.complete('showered'), true);
  assert.equal(story.complete('showered'), false);
  assert.equal(story.objective, 'Get ready for Front & Center · 1/3');
  assert.equal(story.sync({ dressed: true, phoneTaken: true }), true);
  assert.equal(story.objective, 'Use the private elevator.');
  assert.equal(story.ready, true);
});

test('luxury apartment elevator calls once ready and permits only one departure', () => {
  const story = createLuxuryApartmentStory({ showered: true, dressed: true, phoneTaken: true });
  assert.deepEqual(story.elevator(false), { ok: true, action: 'call' });
  assert.deepEqual(story.elevator(true), { ok: true, action: 'depart' });
  assert.deepEqual(story.elevator(true), { ok: false, action: 'duplicate' });
  assert.equal(story.snapshot().departed, true);
});
