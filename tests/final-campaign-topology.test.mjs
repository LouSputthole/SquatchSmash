import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  EVENT_IDS,
  MISSION_IDS,
  SCENES,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  navigateCampaign,
  normalizeCartelPalaceCheckpointSnapshot,
} from '../src/core/campaign.js';
import {
  HEIST_CLEANUP_ITEMS,
  NEW_SPACE_LOU_CALL,
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

function follow(campaign, sceneId, href, spawn) {
  const assigned = [];
  navigateCampaign(campaign, sceneId, {
    spawn,
    location: { assign: (next) => assigned.push(next) },
  });
  assert.deepEqual(assigned, [href]);
  assert.equal(campaign.state.scene.id, sceneId);
}

test('the final arc has stable scene ids, URLs, spawns, and one ending edge home', () => {
  assert.equal(SCENE_IDS.COUNTRYSIDE_CABIN, 'countryside_cabin');
  assert.equal(SCENE_IDS.SILVER_CASE, 'silver_case');
  assert.equal(SCENE_IDS.MANSION, 'mansion');
  assert.equal(SCENE_IDS.MANSION_SIEGE, 'mansion_siege');
  assert.equal(SCENE_IDS.ENOLA_SQUATCH, 'enola_squatch');
  assert.equal(SCENE_IDS.MANSION_RETURN, 'mansion_return');
  assert.equal(SCENE_IDS.CARTEL_PALACE, 'cartel_palace');
  assert.equal(SCENES[SCENE_IDS.APARTMENT].next.includes(SCENE_IDS.SILVER_CASE), false);
  /* THE LUXURY APARTMENT IS THE SILVER CASE'S ONLY DOORWAY, and that is the
   * thing worth asserting rather than the exact length of any array.
   *
   * The cabin held it while the post-heist lay-low was the only route into
   * the last third of the game. Beat 19 -- "after a quiet period, Lou/Booski
   * contacts Prospect about moving a highly sensitive Silver Case" -- is
   * where the bible always had it, and once something routed through that
   * edge the cabin's could come out. Add first, remove last. */
  assert.equal(SCENES[SCENE_IDS.COUNTRYSIDE_CABIN].next.includes(SCENE_IDS.SILVER_CASE), false);
  const caseDoorways = Object.entries(SCENES)
    .filter(([, scene]) => scene.next.includes(SCENE_IDS.SILVER_CASE))
    .map(([id]) => id);
  assert.deepEqual(caseDoorways, [SCENE_IDS.LUXURY_APARTMENT],
    'exactly one scene may reach the Silver Case, and it is the flat he lives in');

  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.enter(SCENE_IDS.LUXURY_APARTMENT);
  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.LUXURY_APARTMENT,
    spawn: 'arrival',
  });
  campaign.enter(SCENE_IDS.SILVER_CASE);
  assert.deepEqual(campaign.state.scene, { id: SCENE_IDS.SILVER_CASE, spawn: 'car_ride' });
  follow(campaign, SCENE_IDS.MANSION, 'mansion.html');
  follow(campaign, SCENE_IDS.MANSION_SIEGE, 'mansion-siege.html');
  follow(campaign, SCENE_IDS.ENOLA_SQUATCH, 'enolasquatch.html');
  follow(campaign, SCENE_IDS.MANSION_RETURN, 'mansion.html?visit=return');
  follow(campaign, SCENE_IDS.CARTEL_PALACE, 'cartel-palace.html');
  /* Palace goes home for the call in the apartment the Prospect owns. The
   * private lift reaches the kerb; the Meeting then hands off at the treeline. */
  follow(campaign, SCENE_IDS.LUXURY_APARTMENT, 'luxury-apartment.html', 'main');
  follow(campaign, SCENE_IDS.SPECIAL_MEETING, 'specialmeeting.html');
  follow(campaign, SCENE_IDS.INITIATION, 'initiation.html');

  assert.deepEqual(campaign.state.scene, { id: SCENE_IDS.INITIATION, spawn: 'gathering' });
  /* Initiation remains frozen and owns the ceremony; its one edge home is
   * now the durable Apartment credits, career recap, and freeplay handoff. */
  assert.throws(
    () => campaign.transition(SCENE_IDS.MANSION, { spawn: 'gate' }),
    /Cannot transition from "initiation" to "mansion"/,
  );
  follow(campaign, SCENE_IDS.APARTMENT, 'index.html');
  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
});

test('a fresh schema carries locked durable records for every final-arc mission', () => {
  assert.equal(CAMPAIGN_VERSION, 23);
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
    status: 'locked', checkpoint: null, checkpointSnapshot: null, attackersDown: 0,
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
    status: 'locked', checkpoint: null, checkpointSnapshot: null, evidenceFound: [],
    sauceBetrayalConfirmed: false, alarmRaised: false, alarmReason: null,
    markEliminated: false,
    sauceEliminated: false, outcome: null,
  });
});

test('a valid v14 Siege save gains the compact checkpoint field without corruption recovery', () => {
  const storage = new MemoryStorage();
  const legacy = createCampaign({ storage: new MemoryStorage() }).state;
  legacy.version = 14;
  legacy.revision = 37;
  legacy.scene = { id: SCENE_IDS.MANSION_SIEGE, spawn: 'guest_suite' };
  legacy.story.chapter = 'mansion_siege';
  Object.assign(legacy.missions[MISSION_IDS.MANSION_SIEGE], {
    status: 'in_progress',
    checkpoint: 'briefed',
    attackersDown: 5,
    littleFriendSaid: true,
    sasoleMet: false,
  });
  delete legacy.missions[MISSION_IDS.MANSION_SIEGE].checkpointSnapshot;
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const migrated = createCampaign({ storage });
  assert.equal(migrated.recoveredNow, false);
  assert.equal(migrated.recovery, null);
  assert.equal(migrated.state.version, CAMPAIGN_VERSION);
  assert.equal(migrated.state.revision, 37);
  assert.deepEqual(migrated.state.scene, {
    id: SCENE_IDS.MANSION_SIEGE,
    spawn: 'guest_suite',
  });
  assert.equal(migrated.state.story.chapter, 'mansion_siege');
  assert.deepEqual(migrated.state.missions[MISSION_IDS.MANSION_SIEGE], {
    status: 'in_progress',
    checkpoint: 'briefed',
    checkpointSnapshot: null,
    attackersDown: 5,
    littleFriendSaid: true,
    sasoleMet: false,
  });
});

test('a valid v15 Palace save gains combat durability without changing its facts or revision', () => {
  const storage = new MemoryStorage();
  const legacy = createCampaign({ storage: new MemoryStorage() }).state;
  legacy.version = 15;
  legacy.revision = 52;
  legacy.scene = { id: SCENE_IDS.CARTEL_PALACE, spawn: 'approach' };
  legacy.story.chapter = 'cartel_palace';
  Object.assign(legacy.missions[MISSION_IDS.CARTEL_PALACE], {
    status: 'in_progress',
    checkpoint: 'estate',
    evidenceFound: ['sauce_belongings'],
    sauceBetrayalConfirmed: false,
    alarmRaised: true,
    alarmReason: 'guard_contact',
    markEliminated: false,
    sauceEliminated: false,
    outcome: null,
  });
  delete legacy.missions[MISSION_IDS.CARTEL_PALACE].checkpointSnapshot;
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const migrated = createCampaign({ storage });
  assert.equal(migrated.recoveredNow, false);
  assert.equal(migrated.recovery, null);
  assert.equal(migrated.state.version, CAMPAIGN_VERSION);
  assert.equal(migrated.state.revision, 52);
  assert.deepEqual(migrated.state.scene, {
    id: SCENE_IDS.CARTEL_PALACE,
    spawn: 'approach',
  });
  assert.equal(migrated.state.story.chapter, 'cartel_palace');
  assert.deepEqual(migrated.state.missions[MISSION_IDS.CARTEL_PALACE], {
    status: 'in_progress',
    checkpoint: 'estate',
    checkpointSnapshot: null,
    evidenceFound: ['sauce_belongings'],
    sauceBetrayalConfirmed: false,
    alarmRaised: true,
    alarmReason: 'guard_contact',
    markEliminated: false,
    sauceEliminated: false,
    outcome: null,
  });
});

function palaceCombatCheckpoint(name = 'estate') {
  return normalizeCartelPalaceCheckpointSnapshot({
    version: 1,
    name,
    player: {
      actor: {
        version: 1, id: 'prospect', health: 43, armor: 9, maxArmor: 30,
        injury: 'minor', incapacitated: false, suppression: 0, role: null,
      },
      suppression: { version: 1, value: 0.37 },
    },
    loadout: {
      version: 1,
      slots: ['pistol9', 'carbine', null, null, null],
      selected: 1,
      equipped: 'carbine',
      ammo: { pistol9: { rounds: 8, reserve: 41 }, carbine: { rounds: 17, reserve: 63 } },
    },
    security: {
      version: 1,
      alarm: true,
      alarmReason: 'guard_contact',
      stats: {
        takedowns: 1, alerts: 1, roundsFired: 7, targetsDown: ['gate-one'],
        blockedMoves: 2, nearMisses: 3,
      },
      fireControl: { version: 1, whizCooldown: 0.14 },
      entries: [{
        id: 'gate-one', active: false, down: true, phase: null,
        position: [9.2, 0, 54], yaw: Math.PI, patrolIndex: 1,
        actor: {
          version: 1, id: 'palace-gate-one', health: 0, armor: 0, maxArmor: 8,
          injury: 'severe', incapacitated: true, suppression: 0, role: 'guard',
        },
        firearm: { id: 'pistol9', rounds: 6, reserve: 45 },
        perception: { version: 1, awareness: 1, memory: 1.2, lastSeen: [8, 1.5, 48] },
        impairments: { stagger: 0.2, armWound: 0.4, legWound: 0.1 },
        aim: {
          yaw: 0.4, desiredYaw: 0.5, pitch: 0.1, desiredPitch: 0.12,
          aimError: 0.08, boreError: 0.09,
        },
        shotClock: 0.62,
      }],
    },
  }, name);
}

test('Cartel Palace combat checkpoint round-trips player, loadout, suppression, and guards', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.CARTEL_PALACE].status = 'available';
  });
  let story = createCartelPalaceCampaignStory({ campaign });
  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  const checkpointSnapshot = palaceCombatCheckpoint();
  assert.ok(checkpointSnapshot);
  assert.equal(story.checkpoint('estate', {
    evidenceFound: ['sauce_belongings'],
    checkpointSnapshot,
  }), true);

  campaign = createCampaign({ storage });
  story = createCartelPalaceCampaignStory({ campaign });
  assert.deepEqual(story.begin(), {
    ok: true,
    resumed: true,
    checkpoint: 'estate',
    checkpointSnapshot,
  });
  assert.equal(story.mission.checkpointSnapshot.player.actor.health, 43);
  assert.equal(story.mission.checkpointSnapshot.player.actor.armor, 9);
  assert.equal(story.mission.checkpointSnapshot.player.suppression.value, 0.37);
  assert.equal(story.mission.checkpointSnapshot.loadout.ammo.carbine.rounds, 17);
  assert.equal(story.mission.checkpointSnapshot.security.entries[0].down, true);

  const updated = palaceCombatCheckpoint();
  updated.player.actor.health = 31;
  updated.loadout.ammo.carbine.rounds = 11;
  assert.equal(story.checkpoint('estate', { checkpointSnapshot: updated }), true,
    'same-beat checkpoints must refresh combat durability');
  const refreshed = createCartelPalaceCampaignStory({
    campaign: createCampaign({ storage }),
  }).begin();
  assert.equal(refreshed.checkpointSnapshot.player.actor.health, 31);
  assert.equal(refreshed.checkpointSnapshot.loadout.ammo.carbine.rounds, 11);
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

test('v12 saves before the old invitation retain The Silver Case behind the cabin hub', () => {
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

/**
 * THE TAKE's cleanup routes through beat 12's telephone, not a road north.
 *
 * The old shape of this test drove the post-heist flat to Lou's lay-low
 * message, up the county road to a cabin the campaign had already finished,
 * and out the far side into the Silver Case. All three of those were the
 * pre-bible order. What the flat's last evening does now is wash the bank
 * off, take a call about a new space, and go to bed.
 */
test('THE TAKE cleanup routes through beat 12’s call and into the round', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    const heist = state.missions[MISSION_IDS.BANK_HEIST];
    heist.status = 'in_progress';
    heist.checkpoint = 'vehicle_swap';
    heist.vaultOpened = true;
    heist.crewSurvived = true;
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
  });

  assert.equal(createBankHeistStory({ campaign }).complete(), true);
  assert.equal(campaign.state.story.chapter, 'post_heist');
  assert.equal(campaign.state.missions[MISSION_IDS.SILVER_CASE].status, 'available');
  assert.equal(campaign.state.missions[MISSION_IDS.INITIATION].status, 'locked');
  /* Available, and still two days early. Beat 19's telephone is what actually
   * opens that door -- see the narrow inference on BOOSKI_SILVER_CASE_CALL in
   * `normalize()`, which deliberately does NOT read `available` as proof. */
  assert.equal(campaign.state.events[EVENT_IDS.BOOSKI_SILVER_CASE_CALL].status, 'pending');

  const apartment = createApartmentStory({ campaign, ring: () => true });
  for (const item of HEIST_CLEANUP_ITEMS) {
    assert.equal(apartment.completeHeistCleanup(item.id), true);
  }
  assert.equal(
    apartment.tryLeave(campaign.state.activities).id,
    EVENT_IDS.LOU_GOLF_CALL,
  );
  assert.equal(apartment.callAnswered(NEW_SPACE_LOU_CALL), true);
  assert.equal(apartment.tryLeave(campaign.state.activities).kind, 'stay');
  assert.equal(apartment.sleep().chapter, 'golf_morning');
  assert.deepEqual(apartment.tryLeave({ playedSquatchShoot: true }), {
    kind: 'go', destination: SCENE_IDS.SILVER_PINES,
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

  let story = createMansionSiegeCampaignStory({ campaign });
  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  const checkpointSnapshot = {
    name: 'briefed',
    health: 38.5,
    armor: 12,
    supplies: { triageCharges: 1, resupplyCharges: 0 },
  };
  assert.equal(story.checkpoint('briefed', {
    attackersDown: 5,
    littleFriendSaid: true,
    checkpointSnapshot,
  }), true);

  campaign = createCampaign({ storage });
  story = createMansionSiegeCampaignStory({ campaign });
  assert.deepEqual(story.begin(), {
    ok: true,
    resumed: true,
    checkpoint: 'briefed',
    checkpointSnapshot,
  });
  assert.equal(story.complete({
    attackersDown: 27,
    littleFriendSaid: true,
    sasoleMet: true,
  }), true);

  campaign = createCampaign({ storage });
  assert.deepEqual(campaign.state.missions[MISSION_IDS.MANSION_SIEGE], {
    status: 'complete',
    checkpoint: 'wave_one',
    checkpointSnapshot: null,
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
    checkpointSnapshot: null,
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

  // Home for Special Meeting Act One, then through the existing car scene.
  follow(campaign, SCENE_IDS.LUXURY_APARTMENT, 'luxury-apartment.html', 'main');
  assert.equal(campaign.state.missions[MISSION_IDS.INITIATION].status, 'available');
  follow(campaign, SCENE_IDS.SPECIAL_MEETING, 'specialmeeting.html');
  assert.equal(campaign.state.missions[MISSION_IDS.INITIATION].status, 'available');
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_INITIATION, (next) => {
    next.missions[MISSION_IDS.INITIATION].status = 'in_progress';
  });
  follow(campaign, SCENE_IDS.INITIATION, 'initiation.html');
  campaign = createCampaign({ storage });
  state = campaign.state;
  assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'in_progress');
  assert.deepEqual(state.scene, { id: SCENE_IDS.INITIATION, spawn: 'gathering' });
});
