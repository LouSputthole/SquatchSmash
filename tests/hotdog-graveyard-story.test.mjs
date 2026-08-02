import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  BADA_BING_TWO_CLEANUP_TASKS,
  createBadaBingTwoStory,
} from '../src/core/bada-bing-two-story.js';
import { createGraveyardStory } from '../src/core/graveyard-story.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function readyCampaign() {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'complete';
    state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
    state.missions[MISSION_IDS.BADA_BING_TWO].status = 'available';
  });
  campaign.enter(SCENE_IDS.BADA_BING_TWO, { spawn: 'driver_seat' });
  return campaign;
}

test('HotDog must be secured and loaded before the graveyard, and burial alone unlocks the Motel', () => {
  const campaign = readyCampaign();
  const club = createBadaBingTwoStory({ campaign });

  assert.deepEqual(club.begin(), { ok: true, resumed: false, checkpoint: 'party' });
  assert.equal(club.completeClub({ assignment: 'reserve_pickup' }), false);
  assert.equal(club.recordAttack({ gunKicked: true }), true);
  for (const task of BADA_BING_TWO_CLEANUP_TASKS) {
    assert.equal(club.recordCleanup(task), true, task);
  }
  const revisionBeforeLoading = campaign.state.revision;
  assert.equal(club.completeClub({
    assignment: 'reserve_pickup',
    bodyWrapped: true,
    bodyLoaded: true,
  }), true);

  let state = campaign.state;
  assert.equal(state.revision, revisionBeforeLoading + 1);
  assert.equal(state.missions[MISSION_IDS.BADA_BING_TWO].status, 'in_progress');
  assert.equal(state.missions[MISSION_IDS.BADA_BING_TWO].checkpoint, 'body_loaded');
  assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'locked');
  assert.equal(state.story.day, 3);
  assert.equal(state.story.timeMinutes, 15);
  assert.equal(state.story.timeEvents
    .filter((eventId) => eventId === TIME_EVENT_IDS.ARRIVE_SQUATCH_GRAVEYARD).length, 1);

  campaign.transition(SCENE_IDS.SQUATCH_GRAVEYARD, { spawn: 'headlights' });
  const graveyard = createGraveyardStory({ campaign });
  assert.deepEqual(graveyard.begin(), { ok: true, resumed: false });
  assert.equal(graveyard.complete({ bodyBuried: false }), false);
  assert.equal(graveyard.recordInspection('babs'), true);
  assert.equal(graveyard.recordRespect('babs'), true);
  assert.equal(graveyard.noteEcho(), true);
  assert.equal(graveyard.recordUrination('brawny'), true);
  assert.equal(graveyard.recordUrination('whiplash'), true);
  const revisionBeforeBurial = campaign.state.revision;
  assert.equal(graveyard.complete({ bodyBuried: true }), true);

  state = campaign.state;
  assert.equal(state.revision, revisionBeforeBurial + 1);
  assert.equal(state.missions[MISSION_IDS.BADA_BING_TWO].status, 'complete');
  assert.equal(state.missions[MISSION_IDS.BADA_BING_TWO].checkpoint, 'buried');
  assert.equal(state.missions[MISSION_IDS.BADA_BING_TWO].burialComplete, true);
  assert.equal(state.missions[MISSION_IDS.BADA_BING_TWO].echoHeard, true);
  assert.deepEqual(
    state.missions[MISSION_IDS.BADA_BING_TWO].inspectedGraves,
    ['babs', 'brawny', 'whiplash'],
  );
  assert.deepEqual(state.missions[MISSION_IDS.BADA_BING_TWO].respectedGraves, ['babs']);
  assert.deepEqual(state.missions[MISSION_IDS.BADA_BING_TWO].urinatedOn, ['brawny', 'whiplash']);
  assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'available');
  assert.equal(state.story.day, 3);
  assert.equal(state.story.timeMinutes, 45);
  assert.equal(state.story.timeEvents
    .filter((eventId) => eventId === TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO).length, 1);
});

test('current saves carry a durable HotDog incident shape', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const incident = campaign.state.missions[MISSION_IDS.BADA_BING_TWO];

  assert.equal(CAMPAIGN_VERSION, 8);
  assert.deepEqual(incident, {
    status: 'locked',
    checkpoint: null,
    assignment: null,
    gunKicked: false,
    cleanupTasks: [],
    bodyWrapped: false,
    bodyLoaded: false,
    burialComplete: false,
    echoHeard: false,
    inspectedGraves: [],
    respectedGraves: [],
    urinatedOn: [],
  });
});

test('v5 graveyard saves migrate the memorial ledger without losing disrespect', () => {
  const storage = new MemoryStorage();
  const legacy = createCampaign({ storage: new MemoryStorage() }).state;
  legacy.version = 5;
  const incident = legacy.missions[MISSION_IDS.BADA_BING_TWO];
  incident.status = 'in_progress';
  incident.checkpoint = 'graveyard';
  incident.bodyLoaded = true;
  incident.urinatedOn = ['brawny'];
  delete incident.inspectedGraves;
  delete incident.respectedGraves;
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const campaign = createCampaign({ storage });
  const migrated = campaign.state.missions[MISSION_IDS.BADA_BING_TWO];

  assert.equal(campaign.state.version, CAMPAIGN_VERSION);
  assert.deepEqual(migrated.inspectedGraves, ['brawny']);
  assert.deepEqual(migrated.respectedGraves, []);
  assert.deepEqual(migrated.urinatedOn, ['brawny']);
  assert.equal(campaign.recovery, null);
});

test('an in-progress graveyard resumes from persisted evidence state', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    const incident = state.missions[MISSION_IDS.BADA_BING_TWO];
    incident.status = 'in_progress';
    incident.checkpoint = 'graveyard';
    incident.assignment = 'reserve_pickup';
    incident.gunKicked = true;
    incident.cleanupTasks = [...BADA_BING_TWO_CLEANUP_TASKS];
    incident.bodyWrapped = true;
    incident.bodyLoaded = true;
  });
  campaign.enter(SCENE_IDS.SQUATCH_GRAVEYARD, { spawn: 'headlights' });
  const firstVisit = createGraveyardStory({ campaign });
  assert.equal(firstVisit.noteEcho(), true);
  assert.equal(firstVisit.recordInspection('babs'), true);
  assert.equal(firstVisit.recordInspection('brawny'), true);
  assert.equal(firstVisit.recordRespect('babs'), true);
  assert.equal(firstVisit.recordUrination('brawny'), true);

  const reloaded = createCampaign({ storage });
  const resumed = createGraveyardStory({ campaign: reloaded });

  assert.deepEqual(reloaded.state.scene, {
    id: SCENE_IDS.SQUATCH_GRAVEYARD,
    spawn: 'headlights',
  });
  assert.deepEqual(resumed.begin(), { ok: true, resumed: true });
  assert.equal(reloaded.state.missions[MISSION_IDS.BADA_BING_TWO].echoHeard, true);
  assert.deepEqual(
    reloaded.state.missions[MISSION_IDS.BADA_BING_TWO].inspectedGraves,
    ['babs', 'brawny'],
  );
  assert.deepEqual(
    reloaded.state.missions[MISSION_IDS.BADA_BING_TWO].respectedGraves,
    ['babs'],
  );
  assert.deepEqual(
    reloaded.state.missions[MISSION_IDS.BADA_BING_TWO].urinatedOn,
    ['brawny'],
  );
  assert.equal(reloaded.recovery, null);
});

test('a completed Bing fallback routes through the graveyard and preserves preview mode', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    const incident = state.missions[MISSION_IDS.BADA_BING_TWO];
    incident.status = 'complete';
    incident.checkpoint = 'buried';
    incident.burialComplete = true;
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'available';
  });
  campaign.enter(SCENE_IDS.BADA_BING_TWO, { spawn: 'club_entrance' });
  const navigated = [];
  globalThis.location = {
    pathname: '/bing.html',
    search: '?visit=2&preview=1',
    assign: (href) => navigated.push(href),
  };

  try {
    const routed = createBadaBingTwoStory({ campaign }).continueAfterCompletion({
      location: globalThis.location,
    });
    assert.equal(routed.scene.id, SCENE_IDS.SQUATCH_GRAVEYARD);
    assert.equal(routed.scene.spawn, 'headlights');
    assert.deepEqual(navigated, ['graveyard.html?preview=1']);
  } finally {
    delete globalThis.location;
  }
});

test('a completed graveyard fallback applies Motel departure time through the router', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    const incident = state.missions[MISSION_IDS.BADA_BING_TWO];
    incident.status = 'complete';
    incident.checkpoint = 'buried';
    incident.burialComplete = true;
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'available';
    state.story.day = 3;
    state.story.timeMinutes = 45;
    state.story.timeEvents.push(TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO);
  });
  campaign.enter(SCENE_IDS.SQUATCH_GRAVEYARD, { spawn: 'headlights' });
  const navigated = [];
  globalThis.location = {
    pathname: '/graveyard.html',
    search: '?preview=1',
    assign: (href) => navigated.push(href),
  };

  try {
    const routed = createGraveyardStory({ campaign }).continueAfterCompletion({
      location: globalThis.location,
    });
    assert.equal(routed.scene.id, SCENE_IDS.JERKY_MOTEL);
    assert.equal(routed.scene.spawn, 'passenger_seat');
    assert.equal(routed.story.day, 3);
    assert.equal(routed.story.timeMinutes, 90);
    assert.equal(routed.story.timeEvents.includes(TIME_EVENT_IDS.DEPART_JERKY_MOTEL), true);
    assert.deepEqual(navigated, ['motel.html?preview=1']);
  } finally {
    delete globalThis.location;
  }
});

test('a v4 Bada Bing Two save resumes the new incident from the party', () => {
  const storage = new MemoryStorage();
  const legacy = createCampaign({ storage: new MemoryStorage() }).state;
  legacy.version = 4;
  legacy.scene = { id: SCENE_IDS.BADA_BING_TWO, spawn: 'club_entrance' };
  legacy.missions[MISSION_IDS.BADA_BING_TWO] = {
    status: 'in_progress',
    assignment: null,
  };
  legacy.missions[MISSION_IDS.JERKY_MOTEL].status = 'locked';
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const campaign = createCampaign({ storage });
  const incident = campaign.state.missions[MISSION_IDS.BADA_BING_TWO];

  assert.deepEqual(incident, {
    status: 'in_progress',
    checkpoint: 'party',
    assignment: null,
    gunKicked: false,
    cleanupTasks: [],
    bodyWrapped: false,
    bodyLoaded: false,
    burialComplete: false,
    echoHeard: false,
    inspectedGraves: [],
    respectedGraves: [],
    urinatedOn: [],
  });
  assert.deepEqual(createBadaBingTwoStory({ campaign }).begin(), {
    ok: true,
    resumed: true,
    checkpoint: 'party',
  });
  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.BADA_BING_TWO,
    spawn: 'club_entrance',
  });
  assert.equal(campaign.recovery, null);
});

test('a completed v4 Bada Bing Two save migrates past the inserted burial atomically', () => {
  const storage = new MemoryStorage();
  const legacy = createCampaign({ storage: new MemoryStorage() }).state;
  legacy.version = 4;
  legacy.story.day = 2;
  legacy.story.timeMinutes = 23 * 60;
  legacy.story.timeEvents = legacy.story.timeEvents
    .filter((eventId) => eventId !== TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO);
  legacy.missions[MISSION_IDS.BADA_BING_TWO] = {
    status: 'complete',
    assignment: 'reserve_pickup',
  };
  // Schema v4 committed mission state and authored time separately. This is
  // the valid crash boundary the v5 migration must close rather than strand.
  legacy.missions[MISSION_IDS.JERKY_MOTEL].status = 'locked';
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const campaign = createCampaign({ storage });
  const state = campaign.state;
  const incident = state.missions[MISSION_IDS.BADA_BING_TWO];

  assert.equal(incident.status, 'complete');
  assert.equal(incident.checkpoint, 'buried');
  assert.equal(incident.assignment, 'reserve_pickup');
  assert.equal(incident.gunKicked, true);
  assert.deepEqual(incident.cleanupTasks, BADA_BING_TWO_CLEANUP_TASKS);
  assert.equal(incident.bodyWrapped, true);
  assert.equal(incident.bodyLoaded, true);
  assert.equal(incident.burialComplete, true);
  assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'available');
  assert.equal(state.story.day, 3);
  assert.equal(state.story.timeMinutes, 45);
  assert.equal(state.story.timeEvents.includes(TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO), true);
  assert.deepEqual(createBadaBingTwoStory({ campaign }).begin(), {
    ok: false,
    reason: 'already_complete',
  });
  assert.equal(JSON.parse(storage.getItem(CAMPAIGN_STORAGE_KEY)).version, CAMPAIGN_VERSION);
  assert.equal(campaign.recovery, null);
});

test('v4 Motel progress repairs a stale in-progress Bada Bing Two save', () => {
  const storage = new MemoryStorage();
  const legacy = createCampaign({ storage: new MemoryStorage() }).state;
  legacy.version = 4;
  legacy.scene = { id: SCENE_IDS.JERKY_MOTEL, spawn: 'passenger_seat' };
  legacy.story.day = 3;
  legacy.story.timeMinutes = 30;
  legacy.story.timeEvents = legacy.story.timeEvents
    .filter((eventId) => eventId !== TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO);
  legacy.missions[MISSION_IDS.BADA_BING_TWO] = {
    status: 'in_progress',
    assignment: null,
  };
  legacy.missions[MISSION_IDS.JERKY_MOTEL].status = 'in_progress';
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const campaign = createCampaign({ storage });
  const state = campaign.state;
  const incident = state.missions[MISSION_IDS.BADA_BING_TWO];

  assert.equal(incident.status, 'complete');
  assert.equal(incident.checkpoint, 'buried');
  assert.equal(incident.assignment, 'reserve_pickup');
  assert.equal(incident.burialComplete, true);
  assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'in_progress');
  assert.equal(state.story.day, 3);
  assert.equal(state.story.timeMinutes, 45);
  assert.equal(state.story.timeEvents.includes(TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO), true);
  assert.deepEqual(createBadaBingTwoStory({ campaign }).begin(), {
    ok: false,
    reason: 'already_complete',
  });
  assert.equal(campaign.recovery, null);
});
