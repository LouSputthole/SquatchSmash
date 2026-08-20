import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CARTEL_PALACE_EVIDENCE_IDS,
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  RECOVERABLE_CAMPAIGN_SCENES,
  createCampaignSceneRecovery,
  createCampaignSceneRestartAdapter,
  createCampaignSceneSkipAdapter,
} from '../src/core/campaign-scene-skip.js';
import { createBadaBingTwoStory } from '../src/core/bada-bing-two-story.js';
import { createSilentSquatchStory } from '../src/core/silent-squatch-story.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
}

function locationRecorder() {
  const assigned = [];
  return {
    assigned,
    location: {
      pathname: '/game/current.html',
      search: '',
      assign: (href) => assigned.push(href),
    },
  };
}

test('a refused scene completion never turns into a bare navigation', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.enter(SCENE_IDS.BADA_BING_ONE, { spawn: 'driver_seat' });
  const { assigned, location } = locationRecorder();
  const skip = createCampaignSceneSkipAdapter({
    campaign,
    sceneId: SCENE_IDS.BADA_BING_ONE,
    location,
  });

  assert.deepEqual(skip(), { ok: false, reason: 'scene_completion_refused' });
  assert.deepEqual(assigned, []);
  assert.equal(campaign.state.scene.id, SCENE_IDS.BADA_BING_ONE);
});

test('HotDog skip normalizes the attack, cleanup, and loaded body before the graveyard', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'complete';
    state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
    state.missions[MISSION_IDS.BADA_BING_TWO].status = 'available';
  });
  campaign.enter(SCENE_IDS.BADA_BING_TWO, { spawn: 'club_entrance' });
  assert.equal(createBadaBingTwoStory({ campaign }).begin().ok, true);

  const { assigned, location } = locationRecorder();
  const skip = createCampaignSceneSkipAdapter({
    campaign,
    sceneId: SCENE_IDS.BADA_BING_TWO,
    location,
  });
  assert.deepEqual(skip(), {
    ok: true,
    from: SCENE_IDS.BADA_BING_TWO,
    to: SCENE_IDS.SQUATCH_GRAVEYARD,
  });

  const incident = campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
  assert.equal(incident.attackResolved, true);
  assert.deepEqual(incident.cleanupTasks.sort(), [
    'bathrooms', 'cleaning_kit', 'final_sweep', 'missing_evidence',
  ]);
  assert.equal(incident.bodyWrapped, true);
  assert.equal(incident.bodyLoaded, true);
  assert.equal(incident.checkpoint, 'body_loaded');
  assert.equal(campaign.state.scene.id, SCENE_IDS.SQUATCH_GRAVEYARD);
  assert.deepEqual(assigned, ['graveyard.html']);
});

test('THE TAKE skip walks every durable checkpoint and settles canonical mission facts', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BANK_HEIST].status = 'in_progress';
    state.missions[MISSION_IDS.BANK_HEIST].checkpoint = null;
    state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
  });
  campaign.enter(SCENE_IDS.BANK_HEIST, { spawn: 'safehouse' });
  const { assigned, location } = locationRecorder();

  const result = createCampaignSceneSkipAdapter({
    campaign,
    sceneId: SCENE_IDS.BANK_HEIST,
    location,
  })();

  assert.deepEqual(result, {
    ok: true,
    from: SCENE_IDS.BANK_HEIST,
    to: SCENE_IDS.APARTMENT,
  });
  const heist = campaign.state.missions[MISSION_IDS.BANK_HEIST];
  assert.equal(heist.status, 'complete');
  assert.equal(heist.checkpoint, 'vehicle_swap');
  assert.equal(heist.vaultOpened, true);
  assert.equal(heist.civiliansHarmed, 0);
  assert.equal(heist.bagsRecovered, 7);
  assert.equal(heist.outcome, 'professional');
  assert.equal(campaign.state.missions[MISSION_IDS.SILVER_CASE].status, 'available');
  assert.deepEqual(assigned, ['index.html']);
});

test('restart scene rewinds durable mission checkpoints before reloading', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    Object.assign(state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING], {
      status: 'in_progress',
      checkpoint: 'returning',
      cargoLoaded: true,
      detected: true,
      landingQuality: 'rough',
      rank: 'Bent Propeller',
      unlocks: ['prospectFlightJacket'],
      packagesDelivered: 2,
      gunsDelivered: 1,
    });
  });
  campaign.enter(SCENE_IDS.AIRSTRIP_SMUGGLING, { spawn: 'hangar' });
  let reloads = 0;
  const restart = createCampaignSceneRestartAdapter({
    campaign,
    sceneId: SCENE_IDS.AIRSTRIP_SMUGGLING,
    location: { reload: () => { reloads++; } },
  });

  assert.deepEqual(restart(), { ok: true, sceneId: SCENE_IDS.AIRSTRIP_SMUGGLING });
  assert.equal(reloads, 1);
  assert.deepEqual(campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING], {
    status: 'in_progress',
    checkpoint: 'airstrip',
    cargoLoaded: false,
    detected: false,
    landingQuality: null,
    rank: null,
    unlocks: [],
    packagesDelivered: 0,
    gunsDelivered: 0,
  });
});

test('campaign recovery treats scene entry as checkpoint zero when no richer checkpoint exists', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'in_progress';
    state.scene = { id: SCENE_IDS.BADA_BING_ONE, spawn: 'driver_seat' };
  });
  const before = campaign.state.missions[MISSION_IDS.BADA_BING_ONE];
  let reloads = 0;
  const recovery = createCampaignSceneRecovery({
    campaign,
    sceneId: SCENE_IDS.BADA_BING_ONE,
    location: { pathname: '/bing.html', search: '', reload: () => { reloads++; } },
  });

  assert.equal(recovery.getState().checkpointAvailable, true);
  assert.deepEqual(recovery.restartFromCheckpoint(), {
    ok: true,
    checkpoint: 'scene_entry',
  });
  assert.equal(reloads, 1);
  assert.deepEqual(campaign.state.missions[MISSION_IDS.BADA_BING_ONE], before);
});

test('campaign recovery falls back to entry reload until a richer runtime checkpoint is ready', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'in_progress';
    state.scene = { id: SCENE_IDS.AIRSTRIP_SMUGGLING, spawn: 'hangar' };
  });
  let checkpointReady = false;
  let richRestarts = 0;
  let reloads = 0;
  const recovery = createCampaignSceneRecovery({
    campaign,
    sceneId: SCENE_IDS.AIRSTRIP_SMUGGLING,
    restartCheckpoint: () => { richRestarts++; return { ok: true, checkpoint: 'airstrip' }; },
    canRestartCheckpoint: () => checkpointReady,
    location: { pathname: '/beefrun.html', search: '', reload: () => { reloads++; } },
  });

  assert.equal(recovery.getState().checkpointAvailable, true);
  assert.equal(recovery.restartFromCheckpoint().checkpoint, 'scene_entry');
  assert.equal(reloads, 1);
  assert.equal(richRestarts, 0);

  checkpointReady = true;
  assert.equal(recovery.restartFromCheckpoint().checkpoint, 'airstrip');
  assert.equal(reloads, 1);
  assert.equal(richRestarts, 1);
});

test('the shared adapter inventory covers every non-hub campaign scene in scope', () => {
  assert.deepEqual(RECOVERABLE_CAMPAIGN_SCENES, [
    SCENE_IDS.BADA_BING_ONE,
    SCENE_IDS.SQUATCHFATHER,
    SCENE_IDS.AIRSTRIP_SMUGGLING,
    SCENE_IDS.BADA_BING_TWO,
    SCENE_IDS.SQUATCH_GRAVEYARD,
    SCENE_IDS.JERKY_MOTEL,
    SCENE_IDS.NO_WAKE,
    SCENE_IDS.SILVER_ROOM,
    SCENE_IDS.SILVER_PINES,
    SCENE_IDS.BANK_HEIST,
    SCENE_IDS.SILVER_CASE,
    SCENE_IDS.MANSION,
    SCENE_IDS.MANSION_SIEGE,
    SCENE_IDS.ENOLA_SQUATCH,
    SCENE_IDS.MANSION_RETURN,
    SCENE_IDS.CARTEL_PALACE,
  ]);
});

const MATRIX = Object.freeze([
  [SCENE_IDS.BADA_BING_ONE, MISSION_IDS.BADA_BING_ONE, SCENE_IDS.APARTMENT],
  [SCENE_IDS.SQUATCHFATHER, MISSION_IDS.SQUATCHFATHER, SCENE_IDS.APARTMENT],
  [SCENE_IDS.AIRSTRIP_SMUGGLING, MISSION_IDS.AIRSTRIP_SMUGGLING, SCENE_IDS.APARTMENT],
  [SCENE_IDS.BADA_BING_TWO, MISSION_IDS.BADA_BING_TWO, SCENE_IDS.SQUATCH_GRAVEYARD],
  [SCENE_IDS.SQUATCH_GRAVEYARD, MISSION_IDS.BADA_BING_TWO, SCENE_IDS.JERKY_MOTEL],
  [SCENE_IDS.JERKY_MOTEL, MISSION_IDS.JERKY_MOTEL, SCENE_IDS.APARTMENT],
  [SCENE_IDS.NO_WAKE, MISSION_IDS.NO_WAKE, SCENE_IDS.APARTMENT],
  [SCENE_IDS.SILVER_ROOM, MISSION_IDS.SILVER_ROOM, SCENE_IDS.APARTMENT],
  [SCENE_IDS.SILVER_PINES, MISSION_IDS.SILVER_PINES, SCENE_IDS.APARTMENT],
  [SCENE_IDS.BANK_HEIST, MISSION_IDS.BANK_HEIST, SCENE_IDS.APARTMENT],
  [SCENE_IDS.SILVER_CASE, MISSION_IDS.SILVER_CASE, SCENE_IDS.MANSION],
  [SCENE_IDS.MANSION, MISSION_IDS.SILENT_SQUATCH, SCENE_IDS.MANSION_SIEGE],
  [SCENE_IDS.MANSION_SIEGE, MISSION_IDS.MANSION_SIEGE, SCENE_IDS.ENOLA_SQUATCH],
  [SCENE_IDS.ENOLA_SQUATCH, MISSION_IDS.ENOLA_SQUATCH, SCENE_IDS.MANSION_RETURN],
  [SCENE_IDS.MANSION_RETURN, MISSION_IDS.MANSION_RETURN, SCENE_IDS.CARTEL_PALACE],
  /* The Palace skips HOME now, not to the ceremony. He goes back to a flat
   * where nobody has told him whether killing Sauce was the right call,
   * Booskibro rings, and three men come and collect him — and the Special
   * Meeting hands off to the Initiation itself, which is the row below. */
  [SCENE_IDS.CARTEL_PALACE, MISSION_IDS.CARTEL_PALACE, SCENE_IDS.SPECIAL_MEETING],
]);

const SPAWN = Object.freeze({
  [SCENE_IDS.BADA_BING_ONE]: 'driver_seat',
  [SCENE_IDS.SQUATCHFATHER]: 'restaurant_exterior',
  [SCENE_IDS.AIRSTRIP_SMUGGLING]: 'hangar',
  [SCENE_IDS.BADA_BING_TWO]: 'driver_seat',
  [SCENE_IDS.SQUATCH_GRAVEYARD]: 'headlights',
  [SCENE_IDS.JERKY_MOTEL]: 'passenger_seat',
  [SCENE_IDS.NO_WAKE]: 'gate_c',
  [SCENE_IDS.SILVER_ROOM]: 'kerb',
  [SCENE_IDS.SILVER_PINES]: 'car_park',
  [SCENE_IDS.BANK_HEIST]: 'safehouse',
  [SCENE_IDS.SILVER_CASE]: 'car_ride',
  [SCENE_IDS.MANSION]: 'gate',
  [SCENE_IDS.MANSION_SIEGE]: 'guest_suite',
  [SCENE_IDS.ENOLA_SQUATCH]: 'airfield',
  [SCENE_IDS.MANSION_RETURN]: 'driveway',
  [SCENE_IDS.CARTEL_PALACE]: 'approach',
});

function campaignAt(sceneId, missionId) {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.scene = { id: sceneId, spawn: SPAWN[sceneId] };
    state.missions[missionId].status = 'in_progress';
    if (sceneId === SCENE_IDS.SQUATCHFATHER) {
      state.missions[missionId].weaponStaged = true;
    }
    if (sceneId === SCENE_IDS.AIRSTRIP_SMUGGLING) {
      state.missions[missionId].checkpoint = 'airstrip';
    }
    if (sceneId === SCENE_IDS.BADA_BING_TWO) {
      state.missions[missionId].checkpoint = 'party';
    }
    if (sceneId === SCENE_IDS.SQUATCH_GRAVEYARD) {
      Object.assign(state.missions[missionId], {
        checkpoint: 'graveyard',
        attackResolved: true,
        bodyWrapped: true,
        bodyLoaded: true,
      });
    }
    if (sceneId === SCENE_IDS.NO_WAKE) state.missions[missionId].checkpoint = 'dock';
    if (sceneId === SCENE_IDS.MANSION) {
      state.inventory.carried.push(ITEM_IDS.SILVER_CASE);
    }
  });
  return campaign;
}

test('Mansion skip rests a completed-but-unrested night before opening the siege', () => {
  const campaign = campaignAt(SCENE_IDS.MANSION, MISSION_IDS.SILENT_SQUATCH);
  const story = createSilentSquatchStory({ campaign });
  assert.equal(story.complete({
    case: { placedOnDesk: true, delivered: true },
    keypad: { locked: true },
    aubbie: { killed: true },
    gasStages: ['released'],
    collapsed: ['one', 'two', 'three', 'four', 'five'],
  }), true);
  assert.equal(story.mission.sleptAtMansion, false);
  assert.equal(campaign.state.missions[MISSION_IDS.MANSION_SIEGE].status, 'locked');

  const completeEventsBefore = campaign.state.story.timeEvents
    .filter((eventId) => eventId === TIME_EVENT_IDS.COMPLETE_SILENT_SQUATCH).length;
  const { assigned, location } = locationRecorder();
  const result = createCampaignSceneSkipAdapter({
    campaign,
    sceneId: SCENE_IDS.MANSION,
    location,
  })();

  assert.deepEqual(result, {
    ok: true,
    from: SCENE_IDS.MANSION,
    to: SCENE_IDS.MANSION_SIEGE,
  });
  assert.equal(campaign.state.missions[MISSION_IDS.SILENT_SQUATCH].sleptAtMansion, true);
  assert.equal(campaign.state.missions[MISSION_IDS.MANSION_SIEGE].status, 'available');
  assert.equal(campaign.state.story.timeEvents
    .filter((eventId) => eventId === TIME_EVENT_IDS.COMPLETE_SILENT_SQUATCH).length,
  completeEventsBefore);
  assert.equal(campaign.state.story.timeEvents
    .filter((eventId) => eventId === TIME_EVENT_IDS.REST_AT_MANSION).length, 1);
  assert.deepEqual(assigned, ['mansion-siege.html']);
});

test('Mansion skip accepts an already-rested ending without replaying its exact-once events', () => {
  const campaign = campaignAt(SCENE_IDS.MANSION, MISSION_IDS.SILENT_SQUATCH);
  const firstLocation = locationRecorder();
  assert.equal(createCampaignSceneSkipAdapter({
    campaign,
    sceneId: SCENE_IDS.MANSION,
    location: firstLocation.location,
  })().ok, true);

  campaign.update((state) => {
    state.scene = { id: SCENE_IDS.MANSION, spawn: SPAWN[SCENE_IDS.MANSION] };
  });
  const missionBefore = campaign.state.missions[MISSION_IDS.SILENT_SQUATCH];
  const storyBefore = campaign.state.story;
  const { assigned, location } = locationRecorder();
  const result = createCampaignSceneSkipAdapter({
    campaign,
    sceneId: SCENE_IDS.MANSION,
    location,
  })();

  assert.equal(result.ok, true);
  assert.equal(result.to, SCENE_IDS.MANSION_SIEGE);
  assert.deepEqual(campaign.state.missions[MISSION_IDS.SILENT_SQUATCH], missionBefore);
  assert.deepEqual(campaign.state.story, storyBefore);
  assert.equal(campaign.state.story.timeEvents
    .filter((eventId) => eventId === TIME_EVENT_IDS.COMPLETE_SILENT_SQUATCH).length, 1);
  assert.equal(campaign.state.story.timeEvents
    .filter((eventId) => eventId === TIME_EVENT_IDS.REST_AT_MANSION).length, 1);
  assert.deepEqual(assigned, ['mansion-siege.html']);
});

test('every recovery completer records a successful canonical outcome before its transition', () => {
  for (const [sceneId, missionId, destination] of MATRIX) {
    const campaign = campaignAt(sceneId, missionId);
    const { assigned, location } = locationRecorder();
    const result = createCampaignSceneSkipAdapter({ campaign, sceneId, location })?.();
    assert.equal(result?.ok, true, `${sceneId} completion was refused`);
    assert.equal(result.to, destination, `${sceneId} chose the wrong next scene`);
    assert.equal(campaign.state.scene.id, destination, `${sceneId} navigated before committing`);
    assert.equal(assigned.length, 1, `${sceneId} did not perform exactly one transition`);

    const mission = campaign.state.missions[missionId];
    if (sceneId === SCENE_IDS.BADA_BING_TWO) {
      assert.equal(mission.status, 'in_progress');
      assert.equal(mission.checkpoint, 'body_loaded');
      assert.equal(mission.bodyWrapped, true);
      assert.equal(mission.bodyLoaded, true);
    } else {
      assert.equal(mission.status, 'complete', `${sceneId} left its mission unfinished`);
    }

    if (sceneId === SCENE_IDS.JERKY_MOTEL) {
      assert.equal(mission.cargoRecovered, true);
      assert.equal(mission.packagesIntact, 8);
      assert.equal(mission.freshness, 100);
    }
    if (sceneId === SCENE_IDS.SQUATCH_GRAVEYARD) {
      assert.equal(mission.checkpoint, 'buried');
      assert.equal(mission.bodyWrapped, true);
      assert.equal(mission.bodyLoaded, true);
      assert.equal(mission.burialComplete, true);
    }
    if (sceneId === SCENE_IDS.SILVER_ROOM) {
      assert.equal(mission.outcome, 'perfect');
      assert.equal(mission.seeingHerAgain, true);
      assert.equal(mission.cameHome, true);
    }
    if (sceneId === SCENE_IDS.SILVER_PINES) {
      assert.equal(mission.holesPlayed, 3);
      assert.equal(mission.toPar, 0);
      assert.equal(mission.heardInvitation, true);
      assert.equal(mission.rodeWithLou, true);
    }
    if (sceneId === SCENE_IDS.MANSION) {
      assert.equal(mission.caseDelivered, true);
      assert.equal(mission.basementUnlocked, true);
      assert.equal(mission.trophyAwarded, true);
      assert.equal(mission.sleptAtMansion, true);
      assert.equal(campaign.state.missions[MISSION_IDS.MANSION_SIEGE].status, 'available');
    }
    if (sceneId === SCENE_IDS.MANSION_SIEGE) {
      assert.equal(mission.attackersDown, 8);
      assert.equal(mission.littleFriendSaid, true);
      assert.equal(mission.sasoleMet, true);
    }
    if (sceneId === SCENE_IDS.ENOLA_SQUATCH) {
      assert.equal(mission.payloadReleased, true);
      assert.equal(mission.returnedHome, true);
    }
    if (sceneId === SCENE_IDS.MANSION_RETURN) {
      assert.equal(mission.briefingComplete, true);
      assert.equal(mission.wrongCityConfirmed, true);
      assert.equal(mission.sauceMissingConfirmed, true);
      assert.equal(mission.palaceLocationKnown, true);
    }
    if (sceneId === SCENE_IDS.CARTEL_PALACE) {
      assert.deepEqual(mission.evidenceFound.sort(), [...CARTEL_PALACE_EVIDENCE_IDS].sort());
      assert.equal(mission.sauceBetrayalConfirmed, true);
      assert.equal(mission.markEliminated, true);
      assert.equal(mission.sauceEliminated, true);
      assert.equal(mission.outcome, 'clean');
    }
  }
});

test('a bare complete status is never accepted without that scene\'s canonical facts', () => {
  for (const [sceneId, missionId] of MATRIX) {
    const campaign = createCampaign({ storage: new MemoryStorage() });
    campaign.update((state) => {
      state.scene = { id: sceneId, spawn: SPAWN[sceneId] };
      state.missions[missionId].status = 'complete';
    });
    const { assigned, location } = locationRecorder();

    assert.deepEqual(createCampaignSceneSkipAdapter({ campaign, sceneId, location })(), {
      ok: false,
      reason: 'scene_completion_refused',
    }, `${sceneId} accepted status=complete without its required milestones`);
    assert.deepEqual(assigned, []);
  }
});

for (const [sceneId, missionId, destination] of MATRIX) {
  test(`re-entered ${sceneId} transitions once without replaying completion`, () => {
    const campaign = campaignAt(sceneId, missionId);
    const firstLocation = locationRecorder();
    assert.equal(createCampaignSceneSkipAdapter({
      campaign,
      sceneId,
      location: firstLocation.location,
    })().ok, true);

    campaign.update((state) => {
      state.scene = { id: sceneId, spawn: SPAWN[sceneId] };
    });
    const before = campaign.state;
    const { assigned, location } = locationRecorder();
    const result = createCampaignSceneSkipAdapter({ campaign, sceneId, location })();

    assert.equal(result.ok, true, `${sceneId} refused its canonical completed state`);
    assert.equal(result.to, destination);
    assert.equal(campaign.state.scene.id, destination);
    assert.equal(assigned.length, 1, `${sceneId} did not transition exactly once`);
    assert.deepEqual(campaign.state.missions, before.missions,
      `${sceneId} replayed or rewrote durable mission completion`);
    assert.deepEqual(campaign.state.story, before.story,
      `${sceneId} replayed an exact-once time event`);
    assert.deepEqual(campaign.state.inventory, before.inventory,
      `${sceneId} duplicated or removed a completion item`);
    assert.deepEqual(campaign.state.events, before.events,
      `${sceneId} replayed a durable campaign event`);
  });
}

for (const [sceneId, missionId] of [
  [SCENE_IDS.MANSION, MISSION_IDS.SILENT_SQUATCH],
  [SCENE_IDS.MANSION_RETURN, MISSION_IDS.MANSION_RETURN],
]) {
  test(`Restart Scene preserves an already-complete ${sceneId} ending`, () => {
    const campaign = campaignAt(sceneId, missionId);
    const firstLocation = locationRecorder();
    assert.equal(createCampaignSceneSkipAdapter({
      campaign,
      sceneId,
      location: firstLocation.location,
    })().ok, true);

    campaign.update((state) => {
      state.scene = { id: sceneId, spawn: SPAWN[sceneId] };
    });
    const before = campaign.state;
    let reloads = 0;
    const restart = createCampaignSceneRestartAdapter({
      campaign,
      sceneId,
      location: { reload: () => { reloads++; } },
    });

    assert.equal(restart().ok, true);
    assert.equal(reloads, 1);
    assert.deepEqual(campaign.state.missions[missionId], before.missions[missionId]);
    assert.deepEqual(campaign.state.story, before.story);
    assert.deepEqual(campaign.state.inventory, before.inventory);
  });
}
