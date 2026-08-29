import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_RECOVERY_KEY,
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  MISSION_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';

class MemoryStorage {
  constructor(seed = {}) { this.values = new Map(Object.entries(seed)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function loadV24(configure) {
  const state = createCampaign({ storage: new MemoryStorage() }).state;
  state.version = 24;
  configure(state);
  const storage = new MemoryStorage({
    [CAMPAIGN_STORAGE_KEY]: JSON.stringify(state),
  });
  return { storage, campaign: createCampaign({ storage }) };
}

function assertHealthyMigration({ storage, campaign }) {
  assert.equal(campaign.state.version, CAMPAIGN_VERSION);
  assert.equal(campaign.recoveredNow, false);
  assert.equal(campaign.recovery, null);
  assert.equal(storage.getItem(CAMPAIGN_RECOVERY_KEY), null);
}

test('v24 mansion rest and siege clocks repair only their exact eight-hour shapes', () => {
  const restedMarkers = [TIME_EVENT_IDS.REST_AT_MANSION];
  const rested = loadV24((state) => {
    state.story.day = 9;
    state.story.timeMinutes = 4 * 60 + 10;
    state.story.timeEvents = [...restedMarkers];
    state.missions[MISSION_IDS.SILENT_SQUATCH].status = 'complete';
    state.missions[MISSION_IDS.SILENT_SQUATCH].sleptAtMansion = true;
    state.missions[MISSION_IDS.MANSION_SIEGE].status = 'available';
  });
  assertHealthyMigration(rested);
  assert.deepEqual(
    [rested.campaign.state.story.day, rested.campaign.state.story.timeMinutes],
    [9, 2 * 60 + 10],
  );
  assert.deepEqual(rested.campaign.state.story.timeEvents, restedMarkers,
    'repair replayed or removed the mansion-rest marker');

  const siegeMarkers = [
    TIME_EVENT_IDS.REST_AT_MANSION,
    TIME_EVENT_IDS.COMPLETE_MANSION_SIEGE,
  ];
  const completed = loadV24((state) => {
    state.story.day = 9;
    state.story.timeMinutes = 6 * 60 + 10;
    state.story.timeEvents = [...siegeMarkers];
    state.missions[MISSION_IDS.MANSION_SIEGE].status = 'complete';
    state.missions[MISSION_IDS.ENOLA_SQUATCH].status = 'available';
  });
  assertHealthyMigration(completed);
  assert.deepEqual(
    [completed.campaign.state.story.day, completed.campaign.state.story.timeMinutes],
    [9, 4 * 60 + 10],
  );
  assert.deepEqual(completed.campaign.state.story.timeEvents, siegeMarkers,
    'repair replayed or removed the siege-completion marker');
});

test('v24 Motel completion floors to Snow’s daylight landing without replaying it', () => {
  const markers = [
    TIME_EVENT_IDS.DEPART_JERKY_MOTEL,
    TIME_EVENT_IDS.COMPLETE_JERKY_MOTEL,
  ];
  const migrated = loadV24((state) => {
    state.story.day = 5;
    state.story.timeMinutes = 4 * 60 + 30;
    state.story.timeEvents = [...markers];
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.missions[MISSION_IDS.JERKY_MOTEL].ending = 'home';
  });
  assertHealthyMigration(migrated);
  assert.deepEqual(
    [migrated.campaign.state.story.day, migrated.campaign.state.story.timeMinutes],
    [5, 6 * 60 + 30],
  );
  assert.deepEqual(migrated.campaign.state.story.timeEvents, markers,
    'daylight floor replayed or removed a Motel marker');
});

test('v24 clock migration does not rewind later or already-correct clocks', () => {
  const cases = [
    {
      label: 'later post-siege clock',
      day: 9,
      timeMinutes: 7 * 60 + 45,
      markers: [TIME_EVENT_IDS.REST_AT_MANSION, TIME_EVENT_IDS.COMPLETE_MANSION_SIEGE],
    },
    {
      label: 'new six-hour rest clock already written under v24',
      day: 9,
      timeMinutes: 2 * 60 + 10,
      markers: [TIME_EVENT_IDS.REST_AT_MANSION],
    },
    {
      label: 'new siege completion clock already written under v24',
      day: 9,
      timeMinutes: 4 * 60 + 10,
      markers: [TIME_EVENT_IDS.REST_AT_MANSION, TIME_EVENT_IDS.COMPLETE_MANSION_SIEGE],
    },
    {
      label: 'later Motel return',
      day: 5,
      timeMinutes: 8 * 60,
      markers: [TIME_EVENT_IDS.COMPLETE_JERKY_MOTEL],
      motelComplete: true,
    },
    {
      label: 'unrelated matching timestamp',
      day: 9,
      timeMinutes: 4 * 60 + 10,
      markers: [],
    },
  ];

  for (const item of cases) {
    const migrated = loadV24((state) => {
      state.story.day = item.day;
      state.story.timeMinutes = item.timeMinutes;
      state.story.timeEvents = [...item.markers];
      if (item.motelComplete) state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    });
    assertHealthyMigration(migrated);
    assert.deepEqual(
      [migrated.campaign.state.story.day, migrated.campaign.state.story.timeMinutes],
      [item.day, item.timeMinutes],
      item.label,
    );
    assert.deepEqual(migrated.campaign.state.story.timeEvents, item.markers, item.label);
  }
});

test('a v24 clock repair is byte-stable after current migrations', () => {
  const { storage, campaign } = loadV24((state) => {
    state.story.day = 9;
    state.story.timeMinutes = 6 * 60 + 10;
    state.story.timeEvents = [
      TIME_EVENT_IDS.REST_AT_MANSION,
      TIME_EVENT_IDS.COMPLETE_MANSION_SIEGE,
    ];
    state.missions[MISSION_IDS.MANSION_SIEGE].status = 'complete';
  });
  assertHealthyMigration({ storage, campaign });

  const firstState = campaign.state;
  const firstPersisted = storage.getItem(CAMPAIGN_STORAGE_KEY);
  const reloaded = createCampaign({ storage });
  assert.equal(reloaded.recoveredNow, false);
  assert.deepEqual(reloaded.state, firstState);
  assert.equal(storage.getItem(CAMPAIGN_STORAGE_KEY), firstPersisted,
    'a stable current-schema reload rewrote the save');
});
