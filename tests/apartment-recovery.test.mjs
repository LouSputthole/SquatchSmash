import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  apartmentRecoveryBeatId,
  createApartmentRecoverySkipAdapter,
} from '../src/core/apartment-recovery.js';
import { createApartmentStory } from '../src/core/apartment-story.js';
import { createSceneRecovery } from '../src/core/scene-recovery.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
}

function apartmentHarness() {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const story = createApartmentStory({ campaign, ring: () => true });
  const activities = {
    eaten: false,
    showered: false,
    peed: false,
    pooped: false,
    changedClothes: false,
    emailChecked: false,
    whiskeyRelaxed: false,
    pcUsed: false,
    playedGame: false,
  };
  const destinations = [];
  const skip = createApartmentRecoverySkipAdapter({
    campaign,
    story,
    getActivities: () => ({ ...activities }),
    completeActivity: (id) => {
      activities[id] = true;
      campaign.update((state) => { state.activities[id] = true; });
      return true;
    },
    navigate: (destination) => {
      destinations.push(destination);
      return true;
    },
  });
  return { campaign, story, activities, destinations, skip };
}

test('Apartment recovery clears only the blocking morning beats before routing to Bada Bing', () => {
  const { campaign, destinations, skip } = apartmentHarness();

  assert.deepEqual(skip(), {
    ok: true,
    from: SCENE_IDS.APARTMENT,
    to: SCENE_IDS.BADA_BING_ONE,
  });
  assert.deepEqual(destinations, [SCENE_IDS.BADA_BING_ONE]);
  assert.equal(campaign.state.events[EVENT_IDS.LOU_FIRST_CALL].status, 'answered');
  assert.equal(campaign.state.missions[MISSION_IDS.BADA_BING_ONE].status, 'available');
  for (const id of ['eaten', 'showered', 'peed', 'pooped', 'changedClothes']) {
    assert.equal(campaign.state.activities[id], true, `${id} was not normalized`);
  }
  assert.equal(campaign.state.activities.emailChecked, false, 'optional HR email was skipped too');
});

test('Apartment recovery turns the post-date sleep/call seam into the next playable mission', () => {
  const { campaign, destinations, skip } = apartmentHarness();
  campaign.update((state) => {
    state.story.chapter = 'date';
    state.story.day = 3;
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
    state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
    state.missions[MISSION_IDS.SILVER_ROOM].status = 'complete';
  });

  assert.equal(skip().ok, true);
  assert.deepEqual(destinations, [SCENE_IDS.SILVER_PINES]);
  assert.equal(campaign.state.story.chapter, 'golf_morning');
  assert.equal(campaign.state.events[EVENT_IDS.LOU_GOLF_CALL].status, 'answered');
  assert.equal(campaign.state.missions[MISSION_IDS.SILVER_PINES].status, 'available');
});

test('Apartment recovery packs every required heist item but leaves optional gear alone', () => {
  const { campaign, destinations, skip } = apartmentHarness();
  campaign.update((state) => {
    state.story.chapter = 'heist_day';
    state.story.day = 4;
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'wake' };
    state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
  });

  assert.equal(skip().ok, true);
  assert.deepEqual(destinations, [SCENE_IDS.BANK_HEIST]);
  const prep = campaign.state.missions[MISSION_IDS.BANK_HEIST].preparation;
  for (const id of ['armor', 'gloves', 'mask', 'carbine', 'sidearm', 'magazines', 'duffel']) {
    assert.equal(prep[id], true, `${id} was not packed`);
  }
  assert.notEqual(prep.extraMagazine, true, 'optional extra magazine was silently granted');
});

test('Apartment recovery repairs a stale final-arc apartment return by routing to the mansion', () => {
  const { campaign, destinations, skip } = apartmentHarness();
  campaign.update((state) => {
    state.story.chapter = 'mansion';
    state.story.day = 4;
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
    state.missions[MISSION_IDS.SILVER_CASE].status = 'complete';
    state.missions[MISSION_IDS.SILENT_SQUATCH].status = 'available';
  });

  assert.equal(skip().ok, true);
  assert.deepEqual(destinations, [SCENE_IDS.MANSION]);
});

test('Apartment recovery refuses an unknown locked seam instead of navigating naked', () => {
  const { campaign, destinations, skip } = apartmentHarness();
  campaign.update((state) => {
    state.story.chapter = 'post_heist';
    state.story.day = 4;
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
    state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
    state.missions[MISSION_IDS.BANK_HEIST].cleanup = {
      washed: true, changed: true, gearSecured: true, finalCalls: true,
    };
    state.missions[MISSION_IDS.SILVER_CASE].status = 'complete';
    state.missions[MISSION_IDS.SILENT_SQUATCH].status = 'locked';
    state.missions[MISSION_IDS.INITIATION].status = 'locked';
  });

  const result = skip();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'apartment_recovery_blocked');
  assert.deepEqual(destinations, []);
});

test('Apartment retry unlocks are isolated to the current blocking return beat', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const beforeBing = apartmentRecoveryBeatId(campaign.state);
  const recovery = createSceneRecovery({
    sceneId: () => apartmentRecoveryBeatId(campaign.state),
    storage,
    restartScene: () => {},
    completeAndSkip: () => {},
  });
  recovery.restartScene();
  recovery.restartScene();
  assert.equal(recovery.getState().skipUnlocked, true);

  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'available';
  });
  const beforeSquatchfather = apartmentRecoveryBeatId(campaign.state);
  assert.notEqual(beforeSquatchfather, beforeBing);
  assert.equal(recovery.getState().sceneRestarts, 0,
    'the live hub must switch ledgers without requiring a page reload');
  assert.equal(recovery.getState().skipUnlocked, false);
});
