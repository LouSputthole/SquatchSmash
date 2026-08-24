import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  COUNTRYSIDE_CABIN_LANDMARKS,
  createCountrysideCabinStory,
} from '../src/core/countryside-cabin-story.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function cabinCampaign({ silverCase = 'available' } = {}) {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'post_heist';
    state.story.day = 4;
    state.story.timeMinutes = 18 * 60 + 55;
    state.scene = { id: SCENE_IDS.COUNTRYSIDE_CABIN, spawn: 'arrival' };
    state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
    state.missions[MISSION_IDS.BANK_HEIST].cleanupComplete = true;
    state.missions[MISSION_IDS.SILVER_CASE].status = silverCase;
    state.story.timeEvents.push(
      TIME_EVENT_IDS.PHONE_READ_CABIN,
      TIME_EVENT_IDS.DEPART_COUNTRYSIDE_CABIN,
    );
  });
  return { campaign, storage };
}

test('cabin landmarks are optional, authored, and exact-once across a reload', () => {
  const { campaign, storage } = cabinCampaign();
  const story = createCountrysideCabinStory({ campaign });
  const before = campaign.state.story.timeMinutes;

  const first = story.visit('creek');
  assert.equal(first.ok, true);
  assert.equal(first.firstVisit, true);
  assert.equal(first.landmark.id, 'creek');
  assert.equal(first.timeMinutes, before + 20);

  const repeat = story.visit('creek');
  assert.equal(repeat.ok, true);
  assert.equal(repeat.firstVisit, false);
  assert.equal(repeat.timeMinutes, first.timeMinutes);
  assert.equal(campaign.state.story.timeEvents.filter(
    (eventId) => eventId === TIME_EVENT_IDS.CABIN_EXPLORE_CREEK,
  ).length, 1);

  const reloaded = createCountrysideCabinStory({ campaign: createCampaign({ storage }) });
  assert.deepEqual(reloaded.explored().map(({ id }) => id), ['creek']);
  const objectives = reloaded.objectives();
  for (const landmark of COUNTRYSIDE_CABIN_LANDMARKS) {
    const objective = objectives.find(({ id }) => id === landmark.id);
    assert.ok(objective, landmark.id);
    assert.equal(objective.required, false, `${landmark.id} must remain optional`);
    assert.equal(objective.done, landmark.id === 'creek');
  }
});

test('an unknown property landmark is rejected without changing durable state', () => {
  const { campaign } = cabinCampaign();
  const story = createCountrysideCabinStory({ campaign });
  const before = structuredClone(campaign.state);

  assert.deepEqual(story.visit('abandoned_theme_park'), {
    ok: false,
    reason: 'unknown_landmark',
  });
  assert.deepEqual(campaign.state, before);
});

test('one cabin rest is required before the car can continue to The Silver Case', () => {
  const { campaign, storage } = cabinCampaign();
  const story = createCountrysideCabinStory({ campaign });

  assert.deepEqual(story.tryLeave(), {
    kind: 'stay',
    id: 'cabin_rest_first',
    line: 'Lou said disappear for a while. One night, at least.',
  });
  const restObjective = story.objectives().find(
    ({ id }) => id === TIME_EVENT_IDS.CABIN_REST,
  );
  assert.deepEqual(restObjective, {
    id: TIME_EVENT_IDS.CABIN_REST,
    label: 'Lay low until Lou calls tomorrow',
    done: false,
    required: true,
  });

  assert.deepEqual(story.rest(), {
    ok: true,
    reason: null,
    day: 5,
    timeMinutes: 14 * 60 + 30,
  });
  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.COUNTRYSIDE_CABIN,
    spawn: 'wake',
  });
  assert.deepEqual(story.tryLeave(), {
    kind: 'go',
    destination: SCENE_IDS.SILVER_CASE,
  });
  assert.equal(story.objectives().find(
    ({ id }) => id === TIME_EVENT_IDS.CABIN_REST,
  ).done, true);

  const afterRest = structuredClone(campaign.state);
  assert.deepEqual(story.rest(), {
    ok: false,
    reason: 'already_rested',
    day: 5,
    timeMinutes: 14 * 60 + 30,
  });
  assert.deepEqual(campaign.state, afterRest);
  assert.deepEqual(
    createCountrysideCabinStory({ campaign: createCampaign({ storage }) }).tryLeave(),
    { kind: 'go', destination: SCENE_IDS.SILVER_CASE },
  );
});

test('the cabin car remains locked when the next mission is not available', () => {
  const { campaign } = cabinCampaign({ silverCase: 'locked' });
  const story = createCountrysideCabinStory({ campaign });
  story.rest();

  assert.deepEqual(story.tryLeave(), {
    kind: 'stay',
    id: 'cabin_wait',
    line: 'Lou said stay put. The road can wait until the phone says otherwise.',
  });
});
