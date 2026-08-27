import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SUBTITLE_PRIORITIES,
  SubtitlePriorityLane,
} from '../src/core/subtitle-priority.js';

function harness() {
  let now = 0;
  let nextId = 1;
  const jobs = new Map();
  const events = [];
  const scheduler = {
    setTimeout(fn, delay) {
      const id = nextId++;
      jobs.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimeout(id) { jobs.delete(id); },
  };
  const lane = new SubtitlePriorityLane({
    scheduler,
    now: () => now,
    show: (text) => events.push(['show', text]),
    hide: () => events.push(['hide']),
  });
  const advance = (ms) => {
    now += ms;
    for (const [id, job] of [...jobs].sort((a, b) => a[1].at - b[1].at)) {
      if (job.at > now) continue;
      jobs.delete(id);
      job.fn();
    }
  };
  return { lane, events, advance };
}

test('story subtitles preempt ambient flavor and ambient cannot cover them', () => {
  const { lane, events } = harness();
  assert.equal(lane.say('room chatter', 5_000, { priority: 'ambient' }), true);
  assert.equal(lane.say('Lou has the story floor', 4_000, { priority: 'story' }), true);
  assert.equal(lane.say('late nearby bark', 2_000, { priority: 'nearby' }), false);
  assert.deepEqual(events, [
    ['show', 'room chatter'],
    ['show', 'Lou has the story floor'],
  ]);
  assert.equal(lane.priority, SUBTITLE_PRIORITIES.STORY);
  assert.equal(lane.busy, true);
});

test('equal-priority story lines retain legacy replace behavior', () => {
  const { lane, events } = harness();
  lane.say('first', 4_000, { priority: 'story' });
  lane.say('second', 4_000, { priority: 'story' });
  assert.deepEqual(events, [['show', 'first'], ['show', 'second']]);
  assert.equal(lane.currentText, 'second');
});

test('expiry and clear release the floor deterministically', () => {
  const { lane, events, advance } = harness();
  lane.say('story', 1_000, { priority: 'story' });
  advance(999);
  assert.equal(lane.busy, true);
  advance(1);
  assert.equal(lane.busy, false);
  assert.deepEqual(events.at(-1), ['hide']);

  lane.say('ambient', 2_000, { priority: 'ambient' });
  lane.clear();
  assert.equal(lane.busy, false);
  assert.deepEqual(events.at(-1), ['hide']);
});
