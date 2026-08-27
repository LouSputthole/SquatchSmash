import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BANK_HEIST_CHECKPOINT_IDS,
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  CHARACTER_IDS,
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
  navigateCampaign,
} from '../src/core/campaign.js';

class MemoryStorage {
  constructor(raw = null) {
    this.values = new Map();
    if (raw !== null) this.values.set(CAMPAIGN_STORAGE_KEY, raw);
  }

  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function v2Save(overrides = {}) {
  return JSON.stringify({
    version: 2,
    revision: 17,
    scene: { id: SCENE_IDS.APARTMENT, spawn: 'wake' },
    story: {
      chapter: 'big_night', day: 4, timeMinutes: 10 * 60,
      meetingKnown: true, meetingLearnedFrom: 'lou_call', timeEvents: [],
    },
    activities: {},
    inventory: { carried: [], concealed: [] },
    missions: {
      [MISSION_IDS.SILVER_ROOM]: { status: 'complete', outcome: 'strong', woo: 74 },
      [MISSION_IDS.INITIATION]: { status: 'locked' },
    },
    events: {},
    ...overrides,
  });
}

test('the current campaign schema registers THE TAKE and a normalized durable mission record', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const mission = campaign.state.missions[MISSION_IDS.BANK_HEIST];

  assert.equal(campaign.state.version, CAMPAIGN_VERSION);
  assert.equal(mission.status, 'locked');
  assert.equal(mission.checkpoint, null);
  assert.equal(mission.crewSurvived, true);
  assert.deepEqual(mission.crewInjuries, {
    [CHARACTER_IDS.SNOW]: 'none',
    [CHARACTER_IDS.RIPPINFLOW]: 'none',
    [CHARACTER_IDS.SHUBENATOR]: 'none',
    [CHARACTER_IDS.DEATHMEGATRON]: 'none',
    [CHARACTER_IDS.NUMBSKULL]: 'none',
  });

  const assigned = [];
  navigateCampaign(campaign, SCENE_IDS.BANK_HEIST, {
    location: { assign: (href) => assigned.push(href) },
  });
  assert.deepEqual(assigned, ['heist.html']);
  assert.deepEqual(campaign.state.scene, { id: SCENE_IDS.BANK_HEIST, spawn: 'safehouse' });
  campaign.transition(SCENE_IDS.APARTMENT, { spawn: 'front_door' });
  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
});

test('v2 saves still waiting on the old big-night call receive Golf before heist day', () => {
  const storage = new MemoryStorage(v2Save());
  const state = createCampaign({ storage }).state;

  assert.equal(state.version, CAMPAIGN_VERSION);
  /* MIGRATIONS[9] inserted the round and put this save in `golf_morning`;
   * MIGRATIONS[20] carries it forward again, because beats 12-19 put the
   * round AFTER the bank and the starter flat no longer opens on a golf
   * morning it has not earned. THE TAKE is not done, so `heist_day`. */
  assert.equal(state.story.chapter, 'heist_day');
  assert.equal(state.missions[MISSION_IDS.SILVER_PINES].status, 'locked');
  assert.equal(state.events[EVENT_IDS.LOU_GOLF_CALL].status, 'pending');
  assert.equal(state.missions[MISSION_IDS.BANK_HEIST].status, 'locked');
  assert.equal(state.events[EVENT_IDS.LOU_HEIST_CALL].status, 'pending');
});

test('v2 saves that already exposed Initiation keep their old terminal route', () => {
  const raw = JSON.parse(v2Save());
  raw.missions[MISSION_IDS.INITIATION].status = 'available';
  raw.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL] = { status: 'answered' };
  const state = createCampaign({ storage: new MemoryStorage(JSON.stringify(raw)) }).state;

  assert.equal(state.story.chapter, 'big_night');
  assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'available');
  assert.equal(state.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status, 'answered');
});

test('heist mission normalization rejects impossible persisted values', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    Object.assign(state.missions[MISSION_IDS.BANK_HEIST], {
      status: 'complete',
      checkpoint: 'not_a_checkpoint',
      bagsRecovered: 40,
      grossTake: -20,
      playerInjury: 'dramatic',
      crewInjuries: {
        [CHARACTER_IDS.RIPPINFLOW]: 'moderate',
        [CHARACTER_IDS.SNOW]: 'dead',
      },
      outcome: 'five_stars',
    });
  });
  const mission = campaign.state.missions[MISSION_IDS.BANK_HEIST];

  assert.equal(mission.status, 'complete');
  assert.equal(mission.checkpoint, null);
  assert.equal(mission.bagsRecovered, 10);
  assert.equal(mission.grossTake, 0);
  assert.equal(mission.playerInjury, 'none');
  assert.equal(mission.crewInjuries[CHARACTER_IDS.RIPPINFLOW], 'moderate');
  assert.equal(mission.crewInjuries[CHARACTER_IDS.SNOW], 'none');
  assert.equal(mission.outcome, null);
  assert.ok(BANK_HEIST_CHECKPOINT_IDS.includes('vehicle_swap'));
});

test('THE TAKE preview seeds temporary prerequisites and never reads canonical storage', () => {
  const sentinel = '{"canonical":"untouched"}';
  let reads = 0;
  let writes = 0;
  globalThis.localStorage = {
    getItem() { reads++; return sentinel; },
    setItem() { writes++; },
  };
  globalThis.location = { pathname: '/heist.html', search: '?preview=1' };

  try {
    const campaign = createCampaign();
    const state = campaign.state;
    assert.equal(state.scene.id, SCENE_IDS.BANK_HEIST);
    /* Owner route: THE TAKE happens before the new-space call, Golf, the
     * luxury hub, Front & Center, and NO WAKE. Preview prerequisites must not
     * resurrect the older Silver Room-first campaign order. */
    assert.equal(state.story.chapter, 'heist_day');
    assert.equal(state.story.day, 5);
    assert.equal(state.story.timeMinutes, 12 * 60 + 45);
    assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete');
    assert.equal(state.missions[MISSION_IDS.SILVER_ROOM].status, 'locked');
    assert.equal(state.missions[MISSION_IDS.SILVER_PINES].status, 'locked');
    assert.equal(state.missions[MISSION_IDS.NO_WAKE].status, 'locked');
    assert.equal(state.events[EVENT_IDS.LOU_HEIST_CALL].status, 'answered');
    assert.equal(state.missions[MISSION_IDS.BANK_HEIST].status, 'available');
    assert.equal(state.missions[MISSION_IDS.BANK_HEIST].preparationComplete, true);
    assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'locked');
    assert.equal(reads, 0);
    assert.equal(writes, 0);
  } finally {
    delete globalThis.location;
    delete globalThis.localStorage;
  }
});
