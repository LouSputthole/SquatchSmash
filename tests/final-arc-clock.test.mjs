import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  MISSION_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { PreviewMemoryStorage } from '../src/core/preview-mode.js';
import { createSilentSquatchStory } from '../src/core/silent-squatch-story.js';
import {
  createCartelPalaceCampaignStory,
  createEnolaSquatchCampaignStory,
  createMansionReturnCampaignStory,
  createMansionSiegeCampaignStory,
  createSilverCaseCampaignStory,
} from '../src/core/final-arc-story.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function setPostHeistClock(campaign) {
  campaign.update((state) => {
    state.story.chapter = 'post_heist';
    /* COMPLETE_BANK_HEIST's own anchor, which moved from Day 4 to Day 6 with
     * the rest of the calendar when the Act-One cabin took Days 2 to 4. */
    state.story.day = 6;
    state.story.timeMinutes = 17 * 60 + 20;
    state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
    state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
  });
}

test('the exact-once final arc reaches every authored Day 8 through Day 13 seam', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  setPostHeistClock(campaign);

  const beats = [
    [TIME_EVENT_IDS.DEPART_SILVER_CASE, 8, 16 * 60],
    [TIME_EVENT_IDS.COMPLETE_SILVER_CASE, 8, 17 * 60 + 30],
    [TIME_EVENT_IDS.DEPART_MANSION, 8, 17 * 60 + 55],
    [TIME_EVENT_IDS.COMPLETE_SILENT_SQUATCH, 8, 20 * 60 + 10],
    /* Six hours in Lou's guest room wakes Tony inside the bible's 2-3 AM
     * assault window; the two-hour siege then ends at 4:10. */
    [TIME_EVENT_IDS.REST_AT_MANSION, 9, 2 * 60 + 10],
    [TIME_EVENT_IDS.COMPLETE_MANSION_SIEGE, 9, 4 * 60 + 10],
    [TIME_EVENT_IDS.DEPART_ENOLA_SQUATCH, 9, 14 * 60],
    [TIME_EVENT_IDS.COMPLETE_ENOLA_SQUATCH, 9, 18 * 60],
    /* "A few days on": the repaired house and Palace are Day 12. */
    [TIME_EVENT_IDS.RETURN_TO_MANSION, 12, 18 * 60 + 30],
    [TIME_EVENT_IDS.COMPLETE_MANSION_RETURN, 12, 19 * 60 + 15],
    [TIME_EVENT_IDS.DEPART_CARTEL_PALACE, 12, 20 * 60 + 30],
    [TIME_EVENT_IDS.COMPLETE_CARTEL_PALACE, 12, 23 * 60],
    /* The next evening: pickup 17:55; 42 minutes in Seff's car plus 23 at
     * the spur and on the trail lands the ceremony at 19:00 exactly. */
    [TIME_EVENT_IDS.DEPART_SPECIAL_MEETING, 13, 17 * 60 + 55],
    [TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING, 13, 19 * 60],
    [TIME_EVENT_IDS.DEPART_INITIATION, 13, 19 * 60],
    [TIME_EVENT_IDS.COMPLETE_INITIATION, 13, 20 * 60 + 50],
  ];

  for (const [eventId, day, timeMinutes] of beats) {
    const result = campaign.advanceTime(eventId);
    assert.equal(result.applied, true, eventId);
    assert.equal(result.day, day, eventId);
    assert.equal(result.timeMinutes, timeMinutes, eventId);
  }

  const beforeReplay = campaign.state;
  for (const [eventId] of beats) {
    assert.deepEqual(campaign.advanceTime(eventId), {
      applied: false,
      day: 13,
      timeMinutes: 20 * 60 + 50,
      minutesAdvanced: 0,
    }, eventId);
  }
  const afterReplay = campaign.state;
  assert.equal(afterReplay.revision, beforeReplay.revision);
  assert.deepEqual(afterReplay.story.timeEvents, beforeReplay.story.timeEvents);
});

test('the real final-arc story handoffs apply the authored clock as one atomic beat each', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  setPostHeistClock(campaign);

  const silver = createSilverCaseCampaignStory({ campaign });
  assert.deepEqual(silver.begin(), { ok: true, resumed: false });
  assert.deepEqual(
    [campaign.state.story.day, campaign.state.story.timeMinutes],
    [8, 16 * 60],
  );
  assert.equal(silver.complete({ winstonOutcome: 'spared' }), true);
  assert.deepEqual(
    [campaign.state.story.day, campaign.state.story.timeMinutes],
    [8, 17 * 60 + 30],
  );

  const silent = createSilentSquatchStory({ campaign });
  assert.equal(silent.begin().ok, true);
  assert.deepEqual(
    [campaign.state.story.day, campaign.state.story.timeMinutes],
    [8, 17 * 60 + 55],
  );
  assert.equal(silent.complete({
    case: { placedOnDesk: true, delivered: true },
    keypad: { locked: true },
    aubbie: { killed: true },
    gasStages: ['release'],
    collapsed: [1, 2, 3, 4, 5],
  }), true);
  assert.deepEqual(
    [campaign.state.story.day, campaign.state.story.timeMinutes],
    [8, 20 * 60 + 10],
  );
  assert.equal(silent.restAtMansion().ok, true);
  assert.deepEqual(
    [campaign.state.story.day, campaign.state.story.timeMinutes],
    [9, 2 * 60 + 10],
  );

  const siege = createMansionSiegeCampaignStory({ campaign });
  assert.equal(siege.begin().ok, true);
  assert.equal(siege.complete({ attackersDown: 8, sasoleMet: true }), true);
  assert.deepEqual(
    [campaign.state.story.day, campaign.state.story.timeMinutes],
    [9, 4 * 60 + 10],
  );

  const enola = createEnolaSquatchCampaignStory({ campaign });
  assert.equal(enola.begin().ok, true);
  assert.deepEqual(
    [campaign.state.story.day, campaign.state.story.timeMinutes],
    [9, 14 * 60],
  );
  assert.equal(enola.complete({
    rank: 'A', score: 0.9, payloadReleased: true, returnedHome: true,
  }), true);
  assert.deepEqual(
    [campaign.state.story.day, campaign.state.story.timeMinutes],
    [9, 18 * 60],
  );

  const mansionReturn = createMansionReturnCampaignStory({ campaign });
  assert.equal(mansionReturn.begin().ok, true);
  assert.deepEqual(
    [campaign.state.story.day, campaign.state.story.timeMinutes],
    [12, 18 * 60 + 30],
  );
  assert.equal(mansionReturn.complete({
    wrongCityConfirmed: true,
    sauceMissingConfirmed: true,
    palaceLocationKnown: true,
  }), true);
  assert.deepEqual(
    [campaign.state.story.day, campaign.state.story.timeMinutes],
    [12, 19 * 60 + 15],
  );

  const palace = createCartelPalaceCampaignStory({ campaign });
  assert.equal(palace.begin().ok, true);
  assert.deepEqual(
    [campaign.state.story.day, campaign.state.story.timeMinutes],
    [12, 20 * 60 + 30],
  );
  assert.equal(palace.checkpoint('betrayal', {
    sauceBetrayalConfirmed: true,
    markEliminated: true,
    sauceEliminated: true,
  }), true);
  assert.equal(palace.complete({ outcome: 'clean' }), true);
  assert.deepEqual(
    [campaign.state.story.day, campaign.state.story.timeMinutes],
    [12, 23 * 60],
  );
  assert.equal(campaign.state.story.chapter, 'big_night');

  assert.deepEqual(campaign.advanceTime(TIME_EVENT_IDS.DEPART_SPECIAL_MEETING), {
    applied: true, day: 13, timeMinutes: 17 * 60 + 55,
    minutesAdvanced: 18 * 60 + 55,
  });
  assert.deepEqual(campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING), {
    applied: true, day: 13, timeMinutes: 19 * 60, minutesAdvanced: 65,
  });
  assert.deepEqual(campaign.advanceTime(TIME_EVENT_IDS.DEPART_INITIATION), {
    applied: true, day: 13, timeMinutes: 19 * 60, minutesAdvanced: 0,
  });

  const beforeReplay = campaign.state;
  assert.equal(palace.complete({ outcome: 'clean' }), false);
  assert.equal(silent.restAtMansion().ok, false);
  assert.deepEqual(campaign.state.story, beforeReplay.story);
});

test('the authored final-arc clock persists without duplicating markers on reload', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  setPostHeistClock(campaign);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_CASE);
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SILVER_CASE);

  campaign = createCampaign({ storage });
  assert.equal(campaign.state.story.day, 8);
  assert.equal(campaign.state.story.timeMinutes, 17 * 60 + 30);
  assert.deepEqual(
    campaign.state.story.timeEvents.slice(-2),
    [TIME_EVENT_IDS.DEPART_SILVER_CASE, TIME_EVENT_IDS.COMPLETE_SILVER_CASE],
  );
  assert.equal(
    JSON.parse(storage.getItem(CAMPAIGN_STORAGE_KEY)).story.timeEvents
      .filter((id) => id === TIME_EVENT_IDS.COMPLETE_SILVER_CASE).length,
    1,
  );
});

function legacyV13() {
  const state = createCampaign({ storage: new MemoryStorage() }).state;
  state.version = 13;
  state.story.chapter = 'post_heist';
  state.story.day = 4;
  state.story.timeMinutes = 17 * 60 + 20;
  state.story.timeEvents = [];
  state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
  state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
  return state;
}

function migrateV13(configure) {
  const storage = new MemoryStorage();
  const state = legacyV13();
  configure(state);
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(state));
  return createCampaign({ storage }).state;
}

test('v13 partial final-arc saves migrate only through the handoff their status proves', () => {
  const cases = [
    {
      label: 'Silver Case begun',
      configure(state) { state.missions[MISSION_IDS.SILVER_CASE].status = 'in_progress'; },
      day: 8,
      time: 16 * 60,
      count: 1,
    },
    {
      label: 'Silver Case complete; mansion not begun',
      configure(state) {
        state.missions[MISSION_IDS.SILVER_CASE].status = 'complete';
        state.missions[MISSION_IDS.SILENT_SQUATCH].status = 'available';
      },
      day: 8,
      time: 17 * 60 + 30,
      count: 2,
    },
    {
      label: 'mansion sleep complete; siege not begun',
      configure(state) {
        state.missions[MISSION_IDS.SILVER_CASE].status = 'complete';
        Object.assign(state.missions[MISSION_IDS.SILENT_SQUATCH], {
          status: 'complete', sleptAtMansion: true,
        });
        state.missions[MISSION_IDS.MANSION_SIEGE].status = 'available';
      },
      day: 9,
      time: 2 * 60 + 10,
      count: 5,
    },
    {
      label: 'siege complete; Enola not begun',
      configure(state) {
        state.missions[MISSION_IDS.MANSION_SIEGE].status = 'complete';
        state.missions[MISSION_IDS.ENOLA_SQUATCH].status = 'available';
      },
      day: 9,
      time: 4 * 60 + 10,
      count: 6,
    },
    {
      label: 'Enola complete; return drive not begun',
      configure(state) {
        state.missions[MISSION_IDS.ENOLA_SQUATCH].status = 'complete';
        state.missions[MISSION_IDS.MANSION_RETURN].status = 'available';
      },
      day: 9,
      time: 18 * 60,
      count: 8,
    },
    {
      label: 'return briefing complete; Palace not begun',
      configure(state) {
        state.missions[MISSION_IDS.MANSION_RETURN].status = 'complete';
        state.missions[MISSION_IDS.CARTEL_PALACE].status = 'available';
      },
      day: 12,
      time: 19 * 60 + 15,
      count: 10,
    },
    {
      label: 'Palace complete',
      configure(state) {
        state.missions[MISSION_IDS.CARTEL_PALACE].status = 'complete';
        state.missions[MISSION_IDS.INITIATION].status = 'available';
      },
      day: 12,
      time: 23 * 60,
      count: 12,
    },
  ];

  for (const item of cases) {
    const migrated = migrateV13(item.configure);
    assert.equal(migrated.version, CAMPAIGN_VERSION, item.label);
    assert.equal(migrated.story.day, item.day, item.label);
    assert.equal(migrated.story.timeMinutes, item.time, item.label);
    assert.deepEqual(
      migrated.story.timeEvents.slice(-item.count),
      [
        TIME_EVENT_IDS.DEPART_SILVER_CASE,
        TIME_EVENT_IDS.COMPLETE_SILVER_CASE,
        TIME_EVENT_IDS.DEPART_MANSION,
        TIME_EVENT_IDS.COMPLETE_SILENT_SQUATCH,
        TIME_EVENT_IDS.REST_AT_MANSION,
        TIME_EVENT_IDS.COMPLETE_MANSION_SIEGE,
        TIME_EVENT_IDS.DEPART_ENOLA_SQUATCH,
        TIME_EVENT_IDS.COMPLETE_ENOLA_SQUATCH,
        TIME_EVENT_IDS.RETURN_TO_MANSION,
        TIME_EVENT_IDS.COMPLETE_MANSION_RETURN,
        TIME_EVENT_IDS.DEPART_CARTEL_PALACE,
        TIME_EVENT_IDS.COMPLETE_CARTEL_PALACE,
      ].slice(0, item.count),
      item.label,
    );
  }
});

const DAY_TWELVE_TAIL = Object.freeze([
  TIME_EVENT_IDS.RETURN_TO_MANSION,
  TIME_EVENT_IDS.COMPLETE_MANSION_RETURN,
  TIME_EVENT_IDS.DEPART_CARTEL_PALACE,
  TIME_EVENT_IDS.COMPLETE_CARTEL_PALACE,
  TIME_EVENT_IDS.DEPART_SPECIAL_MEETING,
  TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING,
  TIME_EVENT_IDS.DEPART_INITIATION,
  TIME_EVENT_IDS.COMPLETE_INITIATION,
]);

function loadV22Tail({ markerCount, day, timeMinutes, later = false, grandfathered = false }) {
  const storage = new MemoryStorage();
  const state = createCampaign({ storage: new MemoryStorage() }).state;
  state.version = 22;
  state.story.chapter = 'big_night';
  state.story.day = day;
  state.story.timeMinutes = timeMinutes;
  state.story.timeEvents = DAY_TWELVE_TAIL.slice(0, markerCount);
  state.missions[MISSION_IDS.CARTEL_PALACE].status = 'complete';
  state.missions[MISSION_IDS.CARTEL_PALACE].grandfathered = grandfathered;
  state.missions[MISSION_IDS.INITIATION].status = markerCount >= 8 ? 'complete' : 'available';
  if (later) state.story.chapter = 'campaign_complete';
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(state));
  return { campaign: createCampaign({ storage }), storage };
}

test('v22 tail saves floor to the highest exact-once Day 12/13 marker they consumed', () => {
  const cases = [
    [1, 9, 18 * 60 + 30, 12, 18 * 60 + 30, 'repaired-mansion arrival'],
    [2, 9, 19 * 60 + 15, 12, 19 * 60 + 15, 'return briefing'],
    [3, 9, 20 * 60 + 30, 12, 20 * 60 + 30, 'Palace departure'],
    [4, 9, 23 * 60, 12, 23 * 60, 'Palace extraction'],
    [5, 9, 23 * 60 + 35, 13, 17 * 60 + 55, 'Special Meeting pickup'],
    [6, 10, 40, 13, 19 * 60, 'ride and trail complete'],
    [7, 10, 40, 13, 19 * 60, 'Initiation arrival'],
    [8, 10, 2 * 60 + 30, 13, 20 * 60 + 50, 'ceremony complete'],
  ];

  for (const [markerCount, oldDay, oldTime, day, timeMinutes, label] of cases) {
    const { campaign } = loadV22Tail({
      markerCount, day: oldDay, timeMinutes: oldTime,
    });
    assert.equal(campaign.recoveredNow, false, label);
    assert.equal(campaign.state.version, CAMPAIGN_VERSION, label);
    assert.equal(campaign.state.story.day, day, label);
    assert.equal(campaign.state.story.timeMinutes, timeMinutes, label);
    assert.deepEqual(campaign.state.story.timeEvents, DAY_TWELVE_TAIL.slice(0, markerCount),
      `${label}: migration invented or removed an exact-once marker`);
  }
});

test('the v22 tail repair never rewinds, skips grandfathered runs, and is stable on reload', () => {
  const later = loadV22Tail({
    markerCount: 8, day: 14, timeMinutes: 7 * 60, later: true,
  }).campaign;
  assert.equal(later.state.story.day, 14);
  assert.equal(later.state.story.timeMinutes, 7 * 60);

  const grandfathered = loadV22Tail({
    markerCount: 4, day: 9, timeMinutes: 23 * 60, grandfathered: true,
  }).campaign;
  assert.equal(grandfathered.state.story.day, 9);
  assert.equal(grandfathered.state.story.timeMinutes, 23 * 60);

  const { campaign, storage } = loadV22Tail({
    markerCount: 6, day: 10, timeMinutes: 40,
  });
  const first = campaign.state;
  const persisted = storage.getItem(CAMPAIGN_STORAGE_KEY);
  const reloaded = createCampaign({ storage });
  assert.equal(reloaded.recoveredNow, false);
  assert.deepEqual(reloaded.state, first, 'normalizing v23 twice changed the repaired save');
  assert.equal(storage.getItem(CAMPAIGN_STORAGE_KEY), persisted,
    'a stable v23 reload rewrote the save');
});

test('v13 clock repair never rewinds a later clock and preserves grandfathered Initiation', () => {
  const later = migrateV13((state) => {
    /* Later than DEPART_SILVER_CASE's own anchor, which is Day 8 16:00. The
     * whole point of this case is a save the repair must not wind back. */
    state.story.day = 9;
    state.story.timeMinutes = 21 * 60;
    state.missions[MISSION_IDS.SILVER_CASE].status = 'in_progress';
  });
  assert.equal(later.story.day, 9);
  assert.equal(later.story.timeMinutes, 21 * 60);
  assert.deepEqual(later.story.timeEvents, [TIME_EVENT_IDS.DEPART_SILVER_CASE]);

  const storage = new MemoryStorage();
  const grandfathered = legacyV13();
  grandfathered.story = {
    ...grandfathered.story,
    chapter: 'big_night', day: 4, timeMinutes: 19 * 60,
    timeEvents: ['legacy.marker'], familyRespect: 0,
  };
  grandfathered.scene = { id: 'initiation', spawn: 'gathering' };
  for (const missionId of [
    MISSION_IDS.SILVER_CASE,
    MISSION_IDS.MANSION_SIEGE,
    MISSION_IDS.ENOLA_SQUATCH,
    MISSION_IDS.MANSION_RETURN,
    MISSION_IDS.CARTEL_PALACE,
  ]) {
    grandfathered.missions[missionId].status = 'complete';
    grandfathered.missions[missionId].grandfathered = true;
  }
  grandfathered.missions[MISSION_IDS.INITIATION].status = 'in_progress';
  const beforeStory = structuredClone(grandfathered.story);
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(grandfathered));

  const restored = createCampaign({ storage }).state;
  assert.deepEqual(restored.story, beforeStory);
  assert.equal(restored.missions[MISSION_IDS.INITIATION].status, 'in_progress');
});

test('preview-memory reset discards final-arc clock markers without touching durable storage', () => {
  const durable = new MemoryStorage();
  durable.setItem(CAMPAIGN_STORAGE_KEY, 'real-campaign-sentinel');
  const previewStorage = new PreviewMemoryStorage();
  const preview = createCampaign({ storage: previewStorage });
  setPostHeistClock(preview);
  preview.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_CASE);
  preview.advanceTime(TIME_EVENT_IDS.COMPLETE_SILVER_CASE);
  assert.equal(preview.state.story.day, 8);

  const reset = preview.reset();
  assert.equal(reset.story.day, 1);
  assert.equal(reset.story.timeMinutes, 6 * 60 + 4);
  assert.deepEqual(reset.story.timeEvents, []);
  assert.equal(durable.getItem(CAMPAIGN_STORAGE_KEY), 'real-campaign-sentinel');
});
