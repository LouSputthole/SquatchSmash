import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { createLuxuryApartmentStory } from '../src/core/luxury-apartment-story.js';
import { LUXURY_READY_TASKS, createLuxuryReadyTally } from '../src/luxury-apartment/story.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

/** Off the eighteenth green with the keys, which is where beat 14 starts. */
function afterTheHandover() {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.story.chapter = 'luxury_apartment';
    state.story.day = 6;
    state.story.timeMinutes = 10 * 60 + 30;
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
    state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
    state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
    state.events[EVENT_IDS.LOU_GOLF_CALL].status = 'answered';
    state.events[EVENT_IDS.CABIN_MARGO_CALL].status = 'answered';
    state.story.timeEvents.push(TIME_EVENT_IDS.CABIN_LAY_LOW_MARGO_CALL);
  });
  campaign.advanceTime(TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT);
  campaign.enter(SCENE_IDS.LUXURY_APARTMENT, { spawn: 'arrival' });
  return campaign;
}

test('the tally counts the three chores and says how many are left', () => {
  const tally = createLuxuryReadyTally();
  assert.equal(LUXURY_READY_TASKS.length, 3);
  assert.equal(tally.completedCount, 0);
  assert.equal(tally.objective, 'Get ready for Front & Center · 0/3');

  assert.equal(tally.complete('showered'), true);
  assert.equal(tally.complete('showered'), false, 'a second shower is not a second tick');
  assert.equal(tally.objective, 'Get ready for Front & Center · 1/3');
  assert.equal(tally.ready, false);

  tally.complete('dressed');
  tally.complete('phoneTaken');
  assert.equal(tally.ready, true);
  assert.equal(tally.objective, 'Use the private elevator.');
});

test('the tally reads the room, and an unknown chore is not a chore', () => {
  const tally = createLuxuryReadyTally();
  assert.equal(tally.sync({ showered: true, dressed: true }), true);
  assert.equal(tally.completedCount, 2);
  assert.equal(tally.sync({ showered: true }), false, 'nothing new is no change');
  assert.equal(tally.complete('brushedTeeth'), false);
  assert.equal(tally.completedCount, 2);
});

/*
 * THE BUG THIS HOLDS.
 *
 * `LuxuryApartmentStory.phase()` decides he is still getting ready by asking
 * whether LUXURY_GET_READY has been spent, and nothing in the flat ever spent
 * it: `completeGetReady()` shipped with no caller. The door therefore refused
 * the lift on every routed save, forever, waiting on a signal the room had no
 * way to send. The tally is that signal now, so the two are held together
 * here rather than in two files that can drift apart.
 */
test('finishing the three chores is what opens beat 14’s door', () => {
  const campaign = afterTheHandover();
  const story = createLuxuryApartmentStory({ campaign });

  const before = story.tryLeave();
  assert.equal(before.kind, 'activity', 'the lift refuses while the chores are open');
  assert.equal(before.id, TIME_EVENT_IDS.LUXURY_GET_READY);

  const tally = createLuxuryReadyTally();
  tally.sync({ showered: true, dressed: true, phoneTaken: true });
  assert.equal(tally.ready, true);

  assert.deepEqual(story.completeGetReady(), { ok: true });
  assert.deepEqual(story.tryLeave(), {
    kind: 'go', destination: SCENE_IDS.SILVER_ROOM,
  }, 'the chores release the appointment already made at the cabin');

  assert.deepEqual(
    story.completeGetReady(),
    { ok: false, reason: 'wrong_phase' },
    'the forty-five minutes are exact-once; a re-entered flat cannot farm them',
  );
});
