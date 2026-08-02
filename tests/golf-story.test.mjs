import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { createGolfStory } from '../src/core/golf-story.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
    this.failWrites = false;
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    if (this.failWrites) throw new Error('storage disabled for test');
    this.values.set(key, String(value));
  }
}

function authorizedGolfCampaign(storage = new MemoryStorage(), {
  depart = true,
  route = true,
} = {}) {
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'golf_morning';
    state.story.day = 4;
    state.story.timeMinutes = 7 * 60;
    state.story.timeEvents = [
      TIME_EVENT_IDS.MARGO_WAKE,
      TIME_EVENT_IDS.LOU_GOLF_CALL,
    ];
    state.missions[MISSION_IDS.SILVER_ROOM].status = 'complete';
    state.events[EVENT_IDS.LOU_GOLF_CALL].status = 'answered';
    state.missions[MISSION_IDS.SILVER_PINES].status = 'available';
  });
  if (depart) campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_PINES);
  if (route) campaign.transition(SCENE_IDS.SILVER_PINES, { spawn: 'car_park' });
  return { campaign, storage };
}

function startRound(storage = new MemoryStorage()) {
  const ready = authorizedGolfCampaign(storage);
  const story = createGolfStory({ campaign: ready.campaign });
  const started = story.begin();
  assert.equal(started.ok, true);
  assert.equal(started.resumed, false);
  return { ...ready, story };
}

test('Silver Pines refuses a locked direct entry without mutating campaign state', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const before = campaign.state;

  const result = createGolfStory({ campaign }).begin();

  assert.equal(result.ok, false);
  assert.deepEqual(campaign.state, before);
});

test('an invitation without the apartment departure cannot claim Silver Pines', () => {
  const { campaign } = authorizedGolfCampaign(new MemoryStorage(), {
    depart: false,
    route: false,
  });
  const before = campaign.state;

  assert.deepEqual(createGolfStory({ campaign }).begin(), {
    ok: false,
    reason: 'travel_incomplete',
  });
  assert.deepEqual(campaign.state, before);
});

test('a travel marker without the Silver Pines scene transition cannot claim the round', () => {
  const { campaign } = authorizedGolfCampaign(new MemoryStorage(), { route: false });
  const before = campaign.state;

  assert.deepEqual(createGolfStory({ campaign }).begin(), {
    ok: false,
    reason: 'wrong_scene',
  });
  assert.deepEqual(campaign.state, before);
});

test('an authorized Silver Pines round begins once and resumes after reload', () => {
  const { campaign, storage } = authorizedGolfCampaign();
  const story = createGolfStory({ campaign });

  const started = story.begin();
  assert.equal(started.ok, true);
  assert.equal(started.resumed, false);
  assert.equal(campaign.state.missions[MISSION_IDS.SILVER_PINES].status, 'in_progress');

  const reloaded = createCampaign({ storage });
  const resumed = createGolfStory({ campaign: reloaded }).begin();
  assert.equal(resumed.ok, true);
  assert.equal(resumed.resumed, true);
  assert.equal(reloaded.state.missions[MISSION_IDS.SILVER_PINES].status, 'in_progress');
});

test('each completed hole persists and replaying a hole replaces its card', () => {
  const { story, storage } = startRound();

  assert.equal(story.recordHole({
    hole: 1,
    par: 4,
    strokes: 5,
    penalties: 1,
    foundWater: true,
    heardInvitation: true,
  }), true);

  let reloaded = createCampaign({ storage });
  let card = reloaded.state.missions[MISSION_IDS.SILVER_PINES];
  assert.equal(card.holesPlayed, 1);
  assert.deepEqual(card.holes, [{ hole: 1, par: 4, strokes: 5, penalties: 1 }]);
  assert.equal(card.strokes, 5);
  assert.equal(card.penalties, 1);
  assert.equal(card.toPar, 1);
  assert.equal(card.foundWater, true);
  assert.equal(card.heardInvitation, true);

  assert.equal(createGolfStory({ campaign: reloaded }).recordHole({
    hole: 1,
    par: 4,
    strokes: 3,
    penalties: 0,
  }), true);

  reloaded = createCampaign({ storage });
  card = reloaded.state.missions[MISSION_IDS.SILVER_PINES];
  assert.equal(card.holesPlayed, 1);
  assert.deepEqual(card.holes, [{ hole: 1, par: 4, strokes: 3, penalties: 0 }]);
  assert.equal(card.strokes, 3);
  assert.equal(card.penalties, 0);
  assert.equal(card.toPar, -1);
});

test('Silver Pines completes only after three holes and returns to heist day at 10:30', () => {
  const { campaign, story } = startRound();

  assert.equal(story.recordHole({ hole: 1, par: 4, strokes: 5 }), true);
  assert.equal(story.recordHole({ hole: 2, par: 5, strokes: 6 }), true);
  assert.equal(story.complete(), false);
  assert.equal(campaign.state.missions[MISSION_IDS.SILVER_PINES].status, 'in_progress');

  assert.equal(story.recordHole({
    hole: 3,
    par: 4,
    strokes: 4,
    rodeWithLou: true,
  }), true);
  assert.equal(story.complete(), true);

  const state = campaign.state;
  assert.equal(state.missions[MISSION_IDS.SILVER_PINES].status, 'complete');
  assert.equal(state.missions[MISSION_IDS.SILVER_PINES].holesPlayed, 3);
  assert.equal(state.missions[MISSION_IDS.SILVER_PINES].rodeWithLou, true);
  assert.equal(state.story.chapter, 'heist_day');
  assert.equal(state.story.day, 4);
  assert.equal(state.story.timeMinutes, 10 * 60 + 30);
  assert.equal(state.events[EVENT_IDS.LOU_HEIST_CALL].status, 'pending');
  assert.equal(state.missions[MISSION_IDS.BANK_HEIST].status, 'locked');
});

test('a required-save failure cannot complete the round or advance the clock', () => {
  const { campaign, storage, story } = startRound();
  story.recordHole({ hole: 1, par: 4, strokes: 4 });
  story.recordHole({ hole: 2, par: 5, strokes: 5 });
  story.recordHole({ hole: 3, par: 4, strokes: 4 });
  const before = campaign.state;

  storage.failWrites = true;
  assert.throws(() => story.complete(), /could not be saved/i);

  assert.deepEqual(campaign.state, before);
  const persisted = createCampaign({ storage }).state;
  assert.equal(persisted.missions[MISSION_IDS.SILVER_PINES].status, 'in_progress');
  assert.equal(persisted.story.chapter, 'golf_morning');
  assert.equal(persisted.story.timeMinutes, 7 * 60 + 30);
});
