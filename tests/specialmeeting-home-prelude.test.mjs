import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SPECIAL_MEETING_HOME_TIMING,
  createSpecialMeetingHomePrelude,
} from '../src/core/special-meeting-home-prelude.js';

test('the shared home prelude waits for real stillness before speaking SM-010', () => {
  const spoken = [];
  const prelude = createSpecialMeetingHomePrelude({
    isActive: () => true,
    isCallTaken: () => false,
    say: (take) => { spoken.push(take); return 0.5; },
  });

  prelude.update(SPECIAL_MEETING_HOME_TIMING.idleAfter - 0.1, { moving: false });
  assert.deepEqual(spoken, []);
  prelude.update(0.2, { moving: false });

  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].cue, 'vo.specialmeeting.tony.idle_before.1');
  assert.equal(prelude.snapshot().said.includes(spoken[0].cue), true);
});

test('the real call ending owns SM-040, the callback hint, and the car clock', () => {
  let callTaken = false;
  const spoken = [];
  const events = [];
  const prelude = createSpecialMeetingHomePrelude({
    isActive: () => true,
    isCallTaken: () => callTaken,
    say: (take) => { spoken.push(take); return 1.2; },
    onCallbackAvailable: () => events.push('callback-available'),
    onCarArrives: () => events.push('car-arrives'),
  });

  callTaken = true;
  assert.equal(prelude.callEnded(), true);
  assert.equal(spoken.at(-1).cue, 'vo.specialmeeting.tony.dead_line.1');
  assert.equal(prelude.snapshot().carIn, SPECIAL_MEETING_HOME_TIMING.carWait);

  prelude.update(1.59, { busy: true });
  assert.deepEqual(events, []);
  prelude.update(0.02, { busy: true });
  assert.deepEqual(events, ['callback-available']);

  prelude.update(SPECIAL_MEETING_HOME_TIMING.carWait - 1.62, { busy: true });
  assert.deepEqual(events, ['callback-available']);
  prelude.update(0.02, { busy: true });
  assert.deepEqual(events, ['callback-available', 'car-arrives']);
  assert.equal(prelude.snapshot().carOutside, true);
  assert.equal(prelude.callEnded(), false, 'the phone callback cannot start the wait twice');
});

test('an answered-call reload resumes every remaining authored home bank', () => {
  const spoken = [];
  const events = [];
  const prelude = createSpecialMeetingHomePrelude({
    isActive: () => true,
    isCallTaken: () => true,
    say: (take) => { spoken.push(take); return 0.25; },
    onRingbackStart: () => events.push('ringback-start'),
    onRingbackEnd: () => events.push('ringback-end'),
    onCarArrives: () => events.push('car-arrives'),
  });

  assert.equal(prelude.snapshot().carIn, SPECIAL_MEETING_HOME_TIMING.resumedCarWait);
  assert.equal(prelude.canRingBack({ phoneHeld: true }), true);
  assert.equal(prelude.ringBack({ phoneHeld: true }), true);
  prelude.update(SPECIAL_MEETING_HOME_TIMING.ringBack, { busy: true });
  assert.deepEqual(events.slice(0, 2), ['ringback-start', 'ringback-end']);
  prelude.update(SPECIAL_MEETING_HOME_TIMING.ringBackLineDelay, { busy: true });
  assert.equal(spoken.at(-1).cue, 'vo.specialmeeting.tony.call_back.1');

  assert.equal(prelude.dressed(), true);
  prelude.update(SPECIAL_MEETING_HOME_TIMING.gettingReadyDelay, { busy: true });
  assert.equal(spoken.at(-1).cue, 'vo.specialmeeting.tony.getting_ready.1');

  prelude.update(3, { busy: true });
  assert.equal(prelude.snapshot().carOutside, true);
  assert.equal(events.includes('car-arrives'), true);
  prelude.update(SPECIAL_MEETING_HOME_TIMING.headlightLineDelay, { busy: true });
  assert.equal(spoken.at(-1).cue, 'vo.specialmeeting.tony.headlights.1');

  assert.deepEqual(
    [1, 2, 3, 4].map((attempt) => prelude.doorRefusal(attempt).cue),
    [
      'vo.specialmeeting.tony.door_refusal.1',
      'vo.specialmeeting.tony.door_refusal.2',
      'vo.specialmeeting.tony.door_refusal.3',
      'vo.specialmeeting.tony.door_refusal.3',
    ],
  );
});

test('an answered save remembers its resumed car clock before the start overlay is dismissed', () => {
  let active = false;
  let arrivals = 0;
  const prelude = createSpecialMeetingHomePrelude({
    isActive: () => active,
    isCallTaken: () => true,
    onCarArrives: () => { arrivals += 1; },
  });

  assert.equal(prelude.snapshot().carIn, SPECIAL_MEETING_HOME_TIMING.resumedCarWait);
  prelude.update(SPECIAL_MEETING_HOME_TIMING.resumedCarWait + 1, { busy: true });
  assert.equal(arrivals, 0, 'the hidden start overlay advanced the pickup clock');
  active = true;
  prelude.update(SPECIAL_MEETING_HOME_TIMING.resumedCarWait + 0.1, { busy: true });
  assert.equal(arrivals, 1);
  assert.equal(prelude.snapshot().carOutside, true);
});

test('SM-060 replaces SM-010 after the durable call answer', () => {
  const spoken = [];
  const prelude = createSpecialMeetingHomePrelude({
    isActive: () => true,
    isCallTaken: () => true,
    say: (take) => { spoken.push(take); return 0.2; },
  });
  prelude.update(SPECIAL_MEETING_HOME_TIMING.idleAfter + 0.1);
  assert.equal(spoken.at(-1).cue, 'vo.specialmeeting.tony.idle_after.1');
});

test('both home runtimes consume the one prelude timing owner', () => {
  const starter = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const luxury = readFileSync(new URL('../src/luxury-apartment/main.js', import.meta.url), 'utf8');
  for (const [name, source] of [['starter', starter], ['luxury', luxury]]) {
    assert.match(source, /createSpecialMeetingHomePrelude\(/, `${name} bypasses the shared prelude`);
    assert.doesNotMatch(source, /const ACT_ONE_(?:RING_DELAY|CAR_WAIT|IDLE_AFTER|RINGBACK_SECONDS)\s*=/,
      `${name} forked a shared prelude timer`);
  }
  assert.match(
    luxury,
    /isActive:\s*\(\)\s*=>\s*routed[\s\S]{0,180}?state\.phase\s*===\s*'active'/,
    'the luxury prelude must not tick or speak beneath its start overlay',
  );
});
