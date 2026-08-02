import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_IDS,
  MISSION_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { createAirstripStory } from '../src/core/airstrip-story.js';

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

function campaignReadyForAirstrip(storage = new MemoryStorage()) {
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'day_two';
    state.story.day = 2;
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'available';
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status = 'answered';
  });
  return campaign;
}

test('the airstrip starts only after Booski and resumes its durable checkpoint', () => {
  const storage = new MemoryStorage();
  const story = createAirstripStory({
    campaign: campaignReadyForAirstrip(storage),
  });

  assert.deepEqual(story.begin(), {
    ok: true,
    resumed: false,
    checkpoint: 'airstrip',
  });
  assert.equal(story.checkpoint('remote_strip'), true);

  const resumed = createAirstripStory({
    campaign: createCampaign({ storage }),
  });
  assert.deepEqual(resumed.begin(), {
    ok: true,
    resumed: true,
    checkpoint: 'remote_strip',
  });
});

test('the airstrip remains locked when Booski has not authorized it', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.story.day = 2;
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
  });
  const story = createAirstripStory({ campaign });

  assert.deepEqual(story.begin(), { ok: false, reason: 'booski_call_incomplete' });
  assert.equal(story.checkpoint('remote_strip'), false);
  assert.equal(story.complete({ landingQuality: 'clean' }), false);
});

test('cargo, detection, landing, and completion survive a reload', () => {
  const storage = new MemoryStorage();
  const story = createAirstripStory({
    campaign: campaignReadyForAirstrip(storage),
  });
  story.begin();

  assert.equal(story.loadCargo(), false);
  assert.equal(story.checkpoint('remote_strip'), true);
  assert.equal(story.loadCargo(), true);
  assert.equal(story.markDetected(), true);
  assert.equal(story.checkpoint('returning'), true);
  assert.equal(story.complete({ landingQuality: 'clean' }), false);
  assert.equal(story.checkpoint('landed_home'), true);
  assert.equal(story.complete({ landingQuality: 'clean' }), true);

  const saved = createCampaign({ storage }).state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
  assert.deepEqual(saved, {
    status: 'complete',
    checkpoint: 'landed_home',
    cargoLoaded: true,
    detected: true,
    landingQuality: 'clean',
  });
});

test('preview flight starts prime only the campaign facts their leg needs', () => {
  const expected = {
    takeoff: { checkpoint: 'airstrip', cargoLoaded: false },
    approach: { checkpoint: 'remote_strip', cargoLoaded: false },
    departure: { checkpoint: 'returning', cargoLoaded: true },
    return: { checkpoint: 'landed_home', cargoLoaded: true },
    landing: { checkpoint: 'landed_home', cargoLoaded: true },
  };

  for (const [checkpoint, want] of Object.entries(expected)) {
    const campaign = campaignReadyForAirstrip();
    const story = createAirstripStory({ campaign });
    assert.equal(story.begin().ok, true, checkpoint);
    assert.equal(story.primePreviewFlightCheckpoint(checkpoint), true, checkpoint);
    const saved = campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
    assert.equal(saved.checkpoint, want.checkpoint, checkpoint);
    assert.equal(saved.cargoLoaded, want.cargoLoaded, checkpoint);
  }
});
