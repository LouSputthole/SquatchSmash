import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { createNoWakeStory } from '../src/core/no-wake-story.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function readyCampaign(storage = new MemoryStorage()) {
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'no_wake';
    state.story.day = 3;
    state.story.timeMinutes = 12 * 60 + 45;
    state.scene = { id: SCENE_IDS.NO_WAKE, spawn: 'gate_c' };
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status = 'answered';
    state.missions[MISSION_IDS.NO_WAKE].status = 'available';
  });
  return campaign;
}

test('NO WAKE eligibility is read-only until Start commits the mission', () => {
  const campaign = readyCampaign();
  campaign.enter(SCENE_IDS.APARTMENT, { spawn: 'front_door' });
  const story = createNoWakeStory({ campaign });
  const before = campaign.state;

  assert.deepEqual(story.canBegin(), { ok: true, resumed: false });
  assert.deepEqual(campaign.state, before);
  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  assert.equal(campaign.state.missions[MISSION_IDS.NO_WAKE].status, 'in_progress');
  assert.deepEqual(campaign.state.scene, { id: SCENE_IDS.APARTMENT, spawn: 'front_door' });
});

test('NO WAKE requires the real Motel and Lou call prerequisites', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const story = createNoWakeStory({ campaign });
  assert.deepEqual(story.begin(), { ok: false, reason: 'motel_incomplete' });
  campaign.update((state) => { state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete'; });
  assert.deepEqual(story.begin(), { ok: false, reason: 'lou_call_incomplete' });
});

test('NO WAKE checkpoints are monotonic and completion opens the date on Day 3', () => {
  const storage = new MemoryStorage();
  const campaign = readyCampaign(storage);
  const story = createNoWakeStory({ campaign });
  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  assert.equal(story.checkpoint('underway'), true);
  assert.equal(story.checkpoint('dock'), false);
  assert.equal(story.checkpoint('open_water'), true);
  assert.equal(story.complete({ betrayalConfirmed: true, playerFired: false, bodyDisposed: true }), false);
  assert.equal(story.complete({ betrayalConfirmed: true, playerFired: true, bodyDisposed: true }), true);

  const restored = createCampaign({ storage }).state;
  assert.equal(restored.version, CAMPAIGN_VERSION);
  assert.equal(restored.story.chapter, 'date');
  assert.equal(restored.story.day, 3);
  assert.equal(restored.story.timeMinutes, 16 * 60 + 40);
  assert.deepEqual(restored.missions[MISSION_IDS.NO_WAKE], {
    status: 'complete', checkpoint: 'returned', betrayalConfirmed: true,
    playerFired: true, bodyDisposed: true,
  });
});

test('schema v3 date saves migrate past NO WAKE without replaying Willy', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  const legacy = campaign.state;
  legacy.version = 3;
  legacy.story.chapter = 'date';
  delete legacy.missions[MISSION_IDS.NO_WAKE];
  delete legacy.events[EVENT_IDS.LOU_NO_WAKE_CALL];
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const migrated = createCampaign({ storage }).state;
  assert.equal(migrated.version, CAMPAIGN_VERSION);
  assert.equal(migrated.missions[MISSION_IDS.NO_WAKE].status, 'complete');
  assert.equal(migrated.events[EVENT_IDS.LOU_NO_WAKE_CALL].status, 'answered');
});

test('schema v2 saves chain through whiskey v3 and NO WAKE v4 migrations', () => {
  const storage = new MemoryStorage();
  const legacy = createCampaign({ storage: new MemoryStorage() }).state;
  legacy.version = 2;
  legacy.story.chapter = 'date';
  delete legacy.activities.whiskeyRelaxed;
  delete legacy.missions[MISSION_IDS.NO_WAKE];
  delete legacy.events[EVENT_IDS.LOU_NO_WAKE_CALL];
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const migrated = createCampaign({ storage }).state;
  assert.equal(migrated.version, CAMPAIGN_VERSION);
  assert.equal(migrated.activities.whiskeyRelaxed, false);
  assert.equal(migrated.missions[MISSION_IDS.NO_WAKE].status, 'complete');
  assert.equal(migrated.events[EVENT_IDS.LOU_NO_WAKE_CALL].status, 'answered');
});

test('schema v3 saves before Day Three receive NO WAKE without false progress', () => {
  const storage = new MemoryStorage();
  const legacy = createCampaign({ storage: new MemoryStorage() }).state;
  legacy.version = 3;
  delete legacy.missions[MISSION_IDS.NO_WAKE];
  delete legacy.events[EVENT_IDS.LOU_NO_WAKE_CALL];
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const migrated = createCampaign({ storage }).state;
  assert.equal(migrated.version, CAMPAIGN_VERSION);
  assert.equal(migrated.missions[MISSION_IDS.NO_WAKE].status, 'locked');
  assert.equal(migrated.events[EVENT_IDS.LOU_NO_WAKE_CALL].status, 'pending');
});
