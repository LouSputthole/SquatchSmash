import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  EVENT_IDS,
  MISSION_IDS,
  NO_WAKE_CHECKPOINT_IDS,
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

/**
 * Gate C, a quarter to one, on the afternoon of Day 7.
 *
 * The bible's beat 18 is a family call after Margo leaves, so the date is
 * behind him and this is the day AFTER the stayover. It used to seed Day 3
 * with the Silver Room untouched, because the harbour job was the first thing
 * he did off the back of the Motel and the date came after it.
 */
function readyCampaign(storage = new MemoryStorage()) {
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'luxury_apartment';
    state.story.day = 7;
    state.story.timeMinutes = 12 * 60 + 45;
    state.scene = { id: SCENE_IDS.NO_WAKE, spawn: 'gate_c' };
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.missions[MISSION_IDS.SILVER_ROOM].status = 'complete';
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

test('NO WAKE requires the Motel, the date, and Lou’s call', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const story = createNoWakeStory({ campaign });
  assert.deepEqual(story.begin(), { ok: false, reason: 'motel_incomplete' });
  campaign.update((state) => { state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete'; });
  /* The middle gate is new with beats 12-19. The bible's entry trigger for
   * this beat is "family call after Margo leaves", which is only a sentence
   * that means anything if Front & Center has happened. */
  assert.deepEqual(story.begin(), { ok: false, reason: 'silver_incomplete' });
  campaign.update((state) => { state.missions[MISSION_IDS.SILVER_ROOM].status = 'complete'; });
  assert.deepEqual(story.begin(), { ok: false, reason: 'lou_call_incomplete' });
});

test('NO WAKE checkpoints are monotonic and completion sends him home on Day 7', () => {
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
  /* Completion used to open the date, because the date came after the boat.
   * It comes home to the luxury apartment now, into beat 19's quiet hour. */
  assert.equal(restored.story.chapter, 'luxury_apartment');
  assert.equal(restored.story.day, 7);
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

test('every NO WAKE checkpoint survives being written and read back', () => {
  /* Persisted campaign state is normalised against a whitelist on every read,
   * and the story banks checkpoints against its own list. When `weighted` was
   * added to the story and not to the campaign, the mission wrote it, the next
   * read turned it into null, and a player who stopped after clipping the
   * ballast on would have resumed from nothing. The only symptom was a
   * checkpoint that came back null -- no error, no warning.
   *
   * So: bank each one in order through the real story, reload from the same
   * storage, and require it to still be there. This is the gate that makes the
   * two lists one list. */
  const storage = new MemoryStorage();
  const campaign = readyCampaign(storage);
  const story = createNoWakeStory({ campaign });
  assert.deepEqual(story.begin(), { ok: true, resumed: false });

  const resumable = NO_WAKE_CHECKPOINT_IDS.filter((id) => id !== 'returned');
  for (const id of resumable) {
    if (id !== 'dock') assert.equal(story.checkpoint(id), true, `${id} was refused`);
    assert.equal(campaign.state.missions[MISSION_IDS.NO_WAKE].checkpoint, id,
      `${id} did not stick in live state`);
    assert.equal(createCampaign({ storage }).state.missions[MISSION_IDS.NO_WAKE].checkpoint, id,
      `${id} was discarded when the save was read back`);
  }

  // And the terminal one, which only `complete()` may write.
  assert.equal(story.complete({
    betrayalConfirmed: true, playerFired: true, bodyDisposed: true,
  }), true);
  assert.equal(createCampaign({ storage }).state.missions[MISSION_IDS.NO_WAKE].checkpoint,
    'returned');
});

test('the redesign authored three checkpoints and all of them persist', () => {
  // "Checkpoints after the inlet, after the execution, and after the weights."
  for (const id of ['open_water', 'execution', 'weighted']) {
    assert.ok(NO_WAKE_CHECKPOINT_IDS.includes(id), `${id} is not a persistable checkpoint`);
  }
  assert.equal(new Set(NO_WAKE_CHECKPOINT_IDS).size, NO_WAKE_CHECKPOINT_IDS.length);
});
