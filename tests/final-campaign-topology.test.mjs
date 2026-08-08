import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
  navigateCampaign,
} from '../src/core/campaign.js';
import {
  HEIST_CLEANUP_ITEMS,
  createApartmentStory,
} from '../src/core/apartment-story.js';
import { createBankHeistStory } from '../src/core/bank-heist-story.js';
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

function follow(campaign, sceneId, href) {
  const assigned = [];
  navigateCampaign(campaign, sceneId, {
    location: { assign: (next) => assigned.push(next) },
  });
  assert.deepEqual(assigned, [href]);
  assert.equal(campaign.state.scene.id, sceneId);
}

test('the final arc has stable scene ids, URLs, spawns, and no edge past Initiation', () => {
  assert.equal(SCENE_IDS.SILVER_CASE, 'silver_case');
  assert.equal(SCENE_IDS.MANSION, 'mansion');
  assert.equal(SCENE_IDS.MANSION_SIEGE, 'mansion_siege');
  assert.equal(SCENE_IDS.ENOLA_SQUATCH, 'enola_squatch');
  assert.equal(SCENE_IDS.MANSION_RETURN, 'mansion_return');
  assert.equal(SCENE_IDS.CARTEL_PALACE, 'cartel_palace');

  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.enter(SCENE_IDS.SILVER_CASE);
  assert.deepEqual(campaign.state.scene, { id: SCENE_IDS.SILVER_CASE, spawn: 'car_ride' });
  follow(campaign, SCENE_IDS.MANSION, 'mansion.html');
  follow(campaign, SCENE_IDS.MANSION_SIEGE, 'mansion-siege.html');
  follow(campaign, SCENE_IDS.ENOLA_SQUATCH, 'enolasquatch.html');
  follow(campaign, SCENE_IDS.MANSION_RETURN, 'mansion.html?visit=return');
  follow(campaign, SCENE_IDS.CARTEL_PALACE, 'cartel-palace.html');
  follow(campaign, SCENE_IDS.INITIATION, 'initiation.html');

  assert.deepEqual(campaign.state.scene, { id: SCENE_IDS.INITIATION, spawn: 'gathering' });
  assert.throws(
    () => campaign.transition(SCENE_IDS.APARTMENT, { spawn: 'wake' }),
    /Cannot transition from "initiation" to "apartment"/,
  );
});

test('a fresh schema carries locked durable records for every final-arc mission', () => {
  assert.equal(CAMPAIGN_VERSION, 14);
  assert.equal(MISSION_IDS.SILVER_CASE, 'silver_case');
  assert.equal(MISSION_IDS.MANSION_SIEGE, 'mansion_siege');
  assert.equal(MISSION_IDS.ENOLA_SQUATCH, 'enola_squatch');
  assert.equal(MISSION_IDS.MANSION_RETURN, 'mansion_return');
  assert.equal(MISSION_IDS.CARTEL_PALACE, 'cartel_palace');

  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update(() => {});
  const state = createCampaign({ storage }).state;
  assert.deepEqual(state.missions[MISSION_IDS.SILVER_CASE], {
    status: 'locked', checkpoint: null, caseRecovered: false,
    winstonOutcome: null, irritatedApe: false,
    apeFinishedChester: false, apeFinishedWinston: false,
  });
  assert.deepEqual(state.missions[MISSION_IDS.MANSION_SIEGE], {
    status: 'locked', checkpoint: null, attackersDown: 0,
    littleFriendSaid: false, sasoleMet: false,
  });
  assert.deepEqual(state.missions[MISSION_IDS.ENOLA_SQUATCH], {
    status: 'locked', checkpoint: null, checkpointSnapshot: null, rank: null, score: 0,
    unlocks: [], payloadReleased: false, returnedHome: false,
  });
  assert.deepEqual(state.missions[MISSION_IDS.MANSION_RETURN], {
    status: 'locked', briefingComplete: false, wrongCityConfirmed: false,
    sauceMissingConfirmed: false, palaceLocationKnown: false,
  });
  assert.deepEqual(state.missions[MISSION_IDS.CARTEL_PALACE], {
    status: 'locked', checkpoint: null, evidenceFound: [],
    sauceBetrayalConfirmed: false, alarmRaised: false, alarmReason: null,
    markEliminated: false,
    sauceEliminated: false, outcome: null,
  });
});

function legacyV12(overrides = {}) {
  const state = createCampaign({ storage: new MemoryStorage() }).state;
  state.version = 12;
  for (const id of [
    MISSION_IDS.SILVER_CASE,
    MISSION_IDS.MANSION_SIEGE,
    MISSION_IDS.ENOLA_SQUATCH,
    MISSION_IDS.MANSION_RETURN,
    MISSION_IDS.CARTEL_PALACE,
  ]) delete state.missions[id];
  return Object.assign(state, overrides);
}

test('v12 saves that already unlocked Initiation remain on their terminal route', () => {
  const storage = new MemoryStorage();
  const legacy = legacyV12();
  legacy.scene = { id: SCENE_IDS.INITIATION, spawn: 'gathering' };
  legacy.story.chapter = 'big_night';
  legacy.missions[MISSION_IDS.INITIATION].status = 'in_progress';
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const state = createCampaign({ storage }).state;
  assert.equal(state.version, CAMPAIGN_VERSION);
  assert.deepEqual(state.scene, { id: SCENE_IDS.INITIATION, spawn: 'gathering' });
  assert.equal(state.story.chapter, 'big_night');
  assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'in_progress');
  for (const id of [
    MISSION_IDS.SILVER_CASE,
    MISSION_IDS.MANSION_SIEGE,
    MISSION_IDS.ENOLA_SQUATCH,
    MISSION_IDS.MANSION_RETURN,
    MISSION_IDS.CARTEL_PALACE,
  ]) {
    assert.equal(state.missions[id].status, 'complete', id);
    assert.equal(state.missions[id].grandfathered, true, id);
  }
});

test('a v12 save already standing in Initiation cannot migrate back to locked', () => {
  const storage = new MemoryStorage();
  const legacy = legacyV12();
  legacy.scene = { id: SCENE_IDS.INITIATION, spawn: 'gathering' };
  legacy.missions[MISSION_IDS.INITIATION].status = 'locked';
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const state = createCampaign({ storage }).state;
  assert.deepEqual(state.scene, { id: SCENE_IDS.INITIATION, spawn: 'gathering' });
  assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'in_progress');
});

test('v12 saves before the old invitation open the final arc at The Silver Case', () => {
  const storage = new MemoryStorage();
  const legacy = legacyV12();
  legacy.story.chapter = 'post_heist';
  legacy.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
  legacy.missions[MISSION_IDS.INITIATION].status = 'locked';
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const state = createCampaign({ storage }).state;
  assert.equal(state.missions[MISSION_IDS.SILVER_CASE].status, 'available');
  assert.equal(state.missions[MISSION_IDS.MANSION_SIEGE].status, 'locked');
  assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'locked');
  assert.equal(state.scene.id, SCENE_IDS.APARTMENT);
});

test('THE TAKE cleanup opens The Silver Case instead of skipping to Initiation', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    const heist = state.missions[MISSION_IDS.BANK_HEIST];
    heist.status = 'in_progress';
    heist.checkpoint = 'vehicle_swap';
    heist.vaultOpened = true;
    heist.crewSurvived = true;
  });

  assert.equal(createBankHeistStory({ campaign }).complete(), true);
  assert.equal(campaign.state.story.chapter, 'post_heist');
  assert.equal(campaign.state.missions[MISSION_IDS.SILVER_CASE].status, 'available');
  assert.equal(campaign.state.missions[MISSION_IDS.INITIATION].status, 'locked');

  const apartment = createApartmentStory({ campaign, ring: () => true });
  for (const item of HEIST_CLEANUP_ITEMS) {
    assert.equal(apartment.completeHeistCleanup(item.id), true);
  }
  assert.deepEqual(apartment.tryLeave(campaign.state.activities), {
    kind: 'go', destination: SCENE_IDS.SILVER_CASE,
  });
});

test('The Silver Case persists its result, carries the real case forward, and opens the mansion', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
  });
  campaign.enter(SCENE_IDS.SILVER_CASE, { spawn: 'car_ride' });

  const story = createSilverCaseCampaignStory({ campaign });
  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  assert.equal(story.checkpoint('case_reveal'), true);
  assert.equal(story.complete({
    winstonOutcome: 'spared',
    irritatedApe: true,
    apeFinishedChester: true,
  }), true);

  campaign = createCampaign({ storage });
  const mission = campaign.state.missions[MISSION_IDS.SILVER_CASE];
  assert.equal(mission.status, 'complete');
  assert.equal(mission.checkpoint, 'case_recovered');
  assert.equal(mission.caseRecovered, true);
  assert.equal(mission.winstonOutcome, 'spared');
  assert.equal(mission.irritatedApe, true);
  assert.equal(mission.apeFinishedChester, true);
  assert.equal(campaign.hasItem('silver_case'), true);
  assert.equal(campaign.state.missions[MISSION_IDS.SILENT_SQUATCH].status, 'available');
  assert.equal(campaign.state.story.chapter, 'mansion');
});

test('sleeping at the mansion is the load seam that opens Mansion Under Siege', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.SILENT_SQUATCH].status = 'available';
  });
  campaign.addItem('silver_case');
  campaign.enter(SCENE_IDS.MANSION, { spawn: 'gate' });
  const story = createSilentSquatchStory({ campaign });

  assert.equal(story.begin().ok, true);
  assert.equal(story.complete({
    case: { placedOnDesk: true, delivered: true },
    keypad: { locked: true },
    aubbie: { killed: true },
    gasStages: ['release'],
    collapsed: [1, 2, 3, 4, 5],
  }), true);
  assert.equal(campaign.state.story.chapter, 'mansion_evening');
  assert.equal(campaign.state.missions[MISSION_IDS.SILENT_SQUATCH].eveningReady, true);
  assert.equal(campaign.state.missions[MISSION_IDS.MANSION_SIEGE].status, 'locked');

  assert.deepEqual(story.restAtMansion(), {
    ok: true,
    chapter: 'mansion_siege',
  });
  assert.equal(story.restAtMansion().ok, false);

  campaign = createCampaign({ storage });
  assert.equal(campaign.state.missions[MISSION_IDS.SILENT_SQUATCH].sleptAtMansion, true);
  assert.equal(campaign.state.missions[MISSION_IDS.MANSION_SIEGE].status, 'available');
  assert.equal(campaign.state.story.chapter, 'mansion_siege');
  assert.ok(campaign.state.story.timeEvents.includes('sleep.mansion'));
});

test('Mansion Under Siege persists its campaign summary and opens Enola Squatch', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.MANSION_SIEGE].status = 'available';
  });
  campaign.enter(SCENE_IDS.MANSION_SIEGE, { spawn: 'guest_suite' });

  const story = createMansionSiegeCampaignStory({ campaign });
  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  assert.equal(story.checkpoint('briefed', {
    attackersDown: 5,
    littleFriendSaid: true,
  }), true);
  assert.equal(story.complete({
    attackersDown: 27,
    littleFriendSaid: true,
    sasoleMet: true,
  }), true);

  campaign = createCampaign({ storage });
  assert.deepEqual(campaign.state.missions[MISSION_IDS.MANSION_SIEGE], {
    status: 'complete',
    checkpoint: 'wave_one',
    attackersDown: 27,
    littleFriendSaid: true,
    sasoleMet: true,
  });
  assert.equal(campaign.state.missions[MISSION_IDS.ENOLA_SQUATCH].status, 'available');
  assert.equal(campaign.state.story.chapter, 'enola_squatch');
});

test('Enola Squatch persists its flight result and opens the repaired-mansion return', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.ENOLA_SQUATCH].status = 'available';
  });
  campaign.enter(SCENE_IDS.ENOLA_SQUATCH, { spawn: 'airfield' });

  const story = createEnolaSquatchCampaignStory({ campaign });
  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  assert.equal(story.checkpoint('preRelease', { payloadReleased: true }), true);
  assert.equal(story.complete({
    rank: 'Night Ops Professional',
    score: 0.84,
    unlocks: ['Enola Squatch Flight Jacket', 'Fat Squatch Dashboard Ornament'],
    payloadReleased: true,
    returnedHome: true,
  }), true);

  campaign = createCampaign({ storage });
  assert.deepEqual(campaign.state.missions[MISSION_IDS.ENOLA_SQUATCH], {
    status: 'complete',
    checkpoint: 'return',
    checkpointSnapshot: null,
    rank: 'Night Ops Professional',
    score: 0.84,
    unlocks: ['Enola Squatch Flight Jacket', 'Fat Squatch Dashboard Ornament'],
    payloadReleased: true,
    returnedHome: true,
  });
  assert.equal(campaign.state.missions[MISSION_IDS.MANSION_RETURN].status, 'available');
  assert.equal(campaign.state.story.chapter, 'mansion_return');
});

test('the repaired-mansion briefing persists all three reveals and opens the Palace', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.MANSION_RETURN].status = 'available';
  });
  campaign.enter(SCENE_IDS.MANSION_RETURN, { spawn: 'driveway' });

  const story = createMansionReturnCampaignStory({ campaign });
  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  assert.equal(story.complete({ wrongCityConfirmed: true }), false);
  assert.equal(campaign.state.missions[MISSION_IDS.CARTEL_PALACE].status, 'locked');
  assert.equal(story.complete({
    wrongCityConfirmed: true,
    sauceMissingConfirmed: true,
    palaceLocationKnown: true,
  }), true);

  campaign = createCampaign({ storage });
  assert.deepEqual(campaign.state.missions[MISSION_IDS.MANSION_RETURN], {
    status: 'complete',
    briefingComplete: true,
    wrongCityConfirmed: true,
    sauceMissingConfirmed: true,
    palaceLocationKnown: true,
  });
  assert.equal(campaign.state.missions[MISSION_IDS.CARTEL_PALACE].status, 'available');
  assert.equal(campaign.state.story.chapter, 'cartel_palace');
});

test('Cartel Palace records the betrayal and only opens Initiation after the final targets fall', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.CARTEL_PALACE].status = 'available';
  });
  campaign.enter(SCENE_IDS.CARTEL_PALACE, { spawn: 'approach' });

  const story = createCartelPalaceCampaignStory({ campaign });
  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  assert.equal(story.checkpoint('betrayal', {
    evidenceFound: ['sauce_belongings', 'sauce_payment_ledger'],
    sauceBetrayalConfirmed: true,
  }), true);
  assert.equal(story.complete({ markEliminated: true }), false);
  assert.equal(campaign.state.missions[MISSION_IDS.INITIATION].status, 'locked');
  assert.equal(story.complete({
    evidenceFound: ['sauce_payment_ledger', 'sauce_security_still'],
    sauceBetrayalConfirmed: true,
    markEliminated: true,
    sauceEliminated: true,
    outcome: 'clean',
  }), true);

  let state = campaign.state;
  assert.deepEqual(state.missions[MISSION_IDS.CARTEL_PALACE], {
    status: 'complete',
    checkpoint: 'clear',
    evidenceFound: ['sauce_belongings', 'sauce_payment_ledger', 'sauce_security_still'],
    sauceBetrayalConfirmed: true,
    alarmRaised: false,
    alarmReason: null,
    markEliminated: true,
    sauceEliminated: true,
    outcome: 'clean',
  });
  assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'available');
  assert.equal(state.story.chapter, 'big_night');

  campaign.update((next) => {
    next.missions[MISSION_IDS.INITIATION].status = 'in_progress';
  });
  follow(campaign, SCENE_IDS.INITIATION, 'initiation.html');
  campaign = createCampaign({ storage });
  state = campaign.state;
  assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'in_progress');
  assert.deepEqual(state.scene, { id: SCENE_IDS.INITIATION, spawn: 'gathering' });
});
