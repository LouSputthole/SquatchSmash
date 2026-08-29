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
import {
  CAMPAIGN_STAT_MISSION_IDS,
  buildProspectsRecord,
  initialCampaignStatistics,
  prospectRecordCreditEntries,
  recordCampaignMissionBoundary,
} from '../src/core/campaign-stats.js';
import { buildCreditsTrack } from '../src/core/campaign-credits-view.js';

class MemoryStorage {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed));
  }

  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function legacyState(edit = () => {}) {
  const state = createCampaign({ storage: new MemoryStorage() }).state;
  state.version = 23;
  delete state.statistics;
  edit(state);
  return state;
}

function loadLegacy(state) {
  const storage = new MemoryStorage({
    [CAMPAIGN_STORAGE_KEY]: JSON.stringify(state),
  });
  return { storage, campaign: createCampaign({ storage }) };
}

test('the current schema keeps the bounded statistics block introduced in v24', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  assert.equal(CAMPAIGN_VERSION, 26);
  assert.deepEqual(campaign.state.statistics, initialCampaignStatistics());
  assert.equal(Object.hasOwn(campaign.state.statistics, 'events'), false);
  assert.equal(Object.hasOwn(campaign.state.statistics, 'grades'), false);
});

test('a pre-statistics save migrates without a false recovery warning', () => {
  const legacy = legacyState((state) => {
    state.story.day = 7;
    state.missions[MISSION_IDS.NO_WAKE] = {
      ...state.missions[MISSION_IDS.NO_WAKE],
      status: 'complete',
      playerFired: true,
      betrayalConfirmed: true,
      bodyDisposed: true,
    };
  });
  const { storage, campaign } = loadLegacy(legacy);

  assert.equal(campaign.recoveredNow, false);
  assert.equal(storage.getItem(CAMPAIGN_RECOVERY_KEY), null);
  assert.equal(campaign.state.version, CAMPAIGN_VERSION);
  assert.equal(campaign.state.statistics.missionsCompleted, 1);
  assert.deepEqual(campaign.state.statistics.completedMissionIds, [MISSION_IDS.NO_WAKE]);
  assert.equal(campaign.state.statistics.campaignDaysElapsed, 7);
  assert.equal(campaign.state.statistics.shotsFired, 1);
  assert.equal(campaign.state.statistics.peopleKilled, 1);
});

test('a partially populated v23 block preserves totals and fills only missing seams', () => {
  const legacy = legacyState((state) => {
    state.story.day = 8;
    state.statistics = {
      shotsFired: 10,
      peopleKilled: 4,
      campaignDaysElapsed: 6,
      completedMissionIds: [MISSION_IDS.BANK_HEIST, 'not-a-real-mission'],
    };
    state.missions[MISSION_IDS.BANK_HEIST] = {
      ...state.missions[MISSION_IDS.BANK_HEIST],
      status: 'complete',
      grossTake: 1_200_000,
      civiliansHarmed: 2,
    };
    state.missions[MISSION_IDS.NO_WAKE] = {
      ...state.missions[MISSION_IDS.NO_WAKE],
      status: 'complete',
      playerFired: true,
    };
    state.story.timeEvents.push(
      TIME_EVENT_IDS.CABIN_EXECUTION_PLAYER,
      TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_DEAD,
      TIME_EVENT_IDS.CABIN_ATEAM_DEAD,
    );
  });
  const { campaign } = loadLegacy(legacy);
  const stats = campaign.state.statistics;

  assert.deepEqual(stats.completedMissionIds,
    [MISSION_IDS.NO_WAKE, MISSION_IDS.BANK_HEIST]);
  assert.equal(stats.missionsCompleted, 2);
  assert.equal(stats.campaignDaysElapsed, 8);
  assert.equal(stats.shotsFired, 11, 'only the missing NO WAKE shot is added');
  assert.equal(stats.peopleKilled, 7, 'one NO WAKE and two cabin kills are added once');
  assert.equal(stats.grossTake, 1_200_000);
  assert.equal(stats.cabinExecutionByProspect, true);
});

test('a partially populated current block is filled without a recovery warning', () => {
  const seed = createCampaign({ storage: new MemoryStorage() });
  seed.update((state) => {
    state.missions[MISSION_IDS.NO_WAKE].status = 'complete';
    state.missions[MISSION_IDS.NO_WAKE].playerFired = true;
  });
  const state = structuredClone(seed.state);
  state.statistics = { shotsFired: 7 };
  const storage = new MemoryStorage({
    [CAMPAIGN_STORAGE_KEY]: JSON.stringify(state),
  });
  const campaign = createCampaign({ storage });

  assert.equal(campaign.recoveredNow, false);
  assert.equal(storage.getItem(CAMPAIGN_RECOVERY_KEY), null);
  assert.equal(campaign.state.statistics.shotsFired, 8);
  assert.deepEqual(campaign.state.statistics.completedMissionIds, [MISSION_IDS.NO_WAKE]);
  assert.deepEqual(
    Object.keys(campaign.state.statistics),
    Object.keys(initialCampaignStatistics()),
  );
});

test('normalizing and reloading the migrated record is stable', () => {
  const { storage, campaign } = loadLegacy(legacyState((state) => {
    state.story.day = 12;
    state.missions[MISSION_IDS.SILENT_SQUATCH] = {
      ...state.missions[MISSION_IDS.SILENT_SQUATCH],
      status: 'complete',
      scientistsLost: 4,
    };
  }));
  const first = campaign.state.statistics;
  const secondCampaign = createCampaign({ storage });
  const second = secondCampaign.state.statistics;
  const third = createCampaign({ storage }).state.statistics;

  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.equal(secondCampaign.recoveredNow, false);
});

test('mission-boundary aggregation is exact once across a reload', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    assert.equal(recordCampaignMissionBoundary(state, MISSION_IDS.JERKY_MOTEL, {
      shotsFired: 12,
      peopleKilled: 2,
    }), true);
  });
  assert.equal(campaign.state.statistics.shotsFired, 12);
  assert.equal(campaign.state.statistics.peopleKilled, 2);

  campaign = createCampaign({ storage });
  campaign.update((state) => {
    assert.equal(recordCampaignMissionBoundary(state, MISSION_IDS.JERKY_MOTEL, {
      shotsFired: 999,
      peopleKilled: 999,
    }), false);
  });
  assert.equal(campaign.state.statistics.shotsFired, 12);
  assert.equal(campaign.state.statistics.peopleKilled, 2);
  assert.equal(campaign.state.statistics.missionsCompleted, 1);
});

test('mission reports cannot erase durable minimum kills after a checkpoint reload', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.CARTEL_PALACE] = {
      ...state.missions[MISSION_IDS.CARTEL_PALACE],
      status: 'complete',
      markEliminated: true,
      sauceEliminated: true,
    };
    assert.equal(recordCampaignMissionBoundary(state, MISSION_IDS.CARTEL_PALACE, {
      shotsFired: 0,
      peopleKilled: 0,
    }), true);
  });

  assert.equal(campaign.state.statistics.peopleKilled, 2);
});

test('the cabin execution choice changes only the record and counts Tony exactly once', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  const sceneBefore = campaign.state.scene;
  campaign.update((state) => {
    state.story.timeEvents.push(
      TIME_EVENT_IDS.CABIN_EXECUTION_PLAYER,
      TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_DEAD,
      TIME_EVENT_IDS.CABIN_ATEAM_DEAD,
    );
  });
  assert.equal(campaign.state.statistics.cabinExecutionByProspect, true);
  assert.equal(campaign.state.statistics.peopleKilled, 2);
  assert.deepEqual(campaign.state.scene, sceneBefore);

  campaign = createCampaign({ storage });
  campaign.update(() => {});
  assert.equal(campaign.state.statistics.peopleKilled, 2);

  const gratin = createCampaign({ storage: new MemoryStorage() });
  gratin.update((state) => {
    state.story.timeEvents.push(
      TIME_EVENT_IDS.CABIN_EXECUTION_GRATIN,
      TIME_EVENT_IDS.CABIN_COUNTER_STRIKE_DEAD,
      TIME_EVENT_IDS.CABIN_ATEAM_DEAD,
    );
  });
  assert.equal(gratin.state.statistics.cabinExecutionByProspect, false);
  assert.equal(gratin.state.statistics.peopleKilled, 0);
});

test('a complete mission set produces the bounded final record used by the marathon', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    for (const missionId of CAMPAIGN_STAT_MISSION_IDS) {
      state.missions[missionId].status = 'complete';
    }
    state.story.day = 13;
    state.story.timeEvents.push(TIME_EVENT_IDS.COMPLETE_INITIATION);
  });
  const stats = campaign.state.statistics;
  const record = buildProspectsRecord(stats);
  assert.equal(stats.missionsCompleted, 16);
  assert.equal(stats.completedMissionIds.length, 16);
  assert.equal(stats.campaignDaysElapsed, 13);
  assert.equal(record.title, "THE PROSPECT'S RECORD");
  assert.equal(record.rows[0].value, '16 / 16');
});

test('credits render absent optional choices as Not recorded', () => {
  const made = [];
  const element = () => {
    const node = {
      className: '', textContent: '', children: [],
      appendChild(child) { node.children.push(child); return child; },
      append(...children) { node.children.push(...children); },
    };
    made.push(node);
    return node;
  };
  const documentRef = { createElement: element };
  const track = element();
  const roll = prospectRecordCreditEntries(initialCampaignStatistics());
  buildCreditsTrack(documentRef, track, roll);

  const rows = track.children.filter((child) => child.className === 'credits-row');
  const values = rows.map((row) => row.children[1].textContent);
  assert.equal(track.children[0].textContent, "THE PROSPECT'S RECORD");
  assert.equal(values.filter((value) => value === 'Not recorded').length, 2);
});
