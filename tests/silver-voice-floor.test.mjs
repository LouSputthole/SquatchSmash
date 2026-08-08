import assert from 'node:assert/strict';
import test from 'node:test';

import { enqueueVoiceFloor } from '../src/silver/voice-floor.js';

const beat = (id, priority = false) => ({ id, priority, job() {} });

test('a direct authored response waits ahead of optional narration without interrupting', () => {
  const queue = [beat('old-one'), beat('old-two')];
  enqueueVoiceFloor(queue, beat('chair-response', true));

  assert.deepEqual(queue.map((entry) => entry.id), [
    'chair-response', 'old-one', 'old-two',
  ]);
});

test('a full floor drops optional narration before a required performance line', () => {
  const queue = [beat('required-one', true), beat('optional-one'), beat('optional-two'), beat('optional-three')];
  enqueueVoiceFloor(queue, beat('featured-introduction', true), 4);

  assert.deepEqual(queue.map((entry) => entry.id), [
    'required-one', 'featured-introduction', 'optional-two', 'optional-three',
  ]);
});
