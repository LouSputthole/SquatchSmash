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

/* BEAT 12'S SEAM, which is the one the reorder moved.
 *
 * This used to seed `date` with the Silver Room finished, because the night
 * of the date was the last thing the flat did before the round. It is
 * `post_heist` now: home from the bank after dark, the flat to clean, Lou's
 * call about a new space, and a bed. Recovery has to walk all four -- the
 * cleanup items, the telephone, the sleep, and then the morning's pastime --
 * or a player stuck on any one of them is stuck for good. */
test('Apartment recovery turns the post-heist cleanup/call/sleep seam into the round', () => {
  const { campaign, destinations, skip } = apartmentHarness();
  campaign.update((state) => {
    state.story.chapter = 'post_heist';
    state.story.day = 5;
    state.story.timeMinutes = 18 * 60 + 50;
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
    state.missions[MISSION_IDS.SILVER_PINES].status = 'locked';
  });

  assert.equal(skip().ok, true);
  assert.deepEqual(destinations, [SCENE_IDS.SILVER_PINES]);
  assert.equal(campaign.state.story.chapter, 'golf_morning');
  assert.equal(campaign.state.story.day, 6);
  assert.equal(campaign.state.events[EVENT_IDS.LOU_GOLF_CALL].status, 'answered');
  assert.equal(campaign.state.missions[MISSION_IDS.SILVER_PINES].status, 'available');
});

/**
 * And beat 14, which is a doorway rather than a dead end.
 *
 * A save that comes back to this flat with the round already played has
 * nothing left here: the keys are in his hand and the campaign has moved
 * address. Recovery must take him there rather than reporting itself
 * blocked in a room the story has finished with.
 */
test('Apartment recovery sends a finished round on to the new address', () => {
  const { campaign, destinations, skip } = apartmentHarness();
  campaign.update((state) => {
    state.story.chapter = 'golf_morning';
    state.story.day = 6;
    state.story.timeMinutes = 10 * 60 + 30;
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
    state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
    state.events[EVENT_IDS.LOU_GOLF_CALL].status = 'answered';
  });

  assert.equal(skip().ok, true);
  assert.deepEqual(destinations, [SCENE_IDS.LUXURY_APARTMENT]);
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
  /* A save that says the flat is in its post-heist evening while THE TAKE is
   * still running. `completeHeistCleanup` refuses to wash the bank off a job
   * that has not ended, so the loop meets an activity it cannot finish --
   * which is exactly the case this affordance must report rather than paper
   * over by navigating somewhere plausible.
   *
   * It used to be posed with the Silver Case complete and the Initiation
   * locked, which was the old post-heist cul-de-sac. That branch is gone:
   * beat 12 gave this chapter a telephone and a bed instead of a road north. */
  campaign.update((state) => {
    state.story.chapter = 'post_heist';
    state.story.day = 5;
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
    state.missions[MISSION_IDS.BANK_HEIST].status = 'in_progress';
    state.missions[MISSION_IDS.BANK_HEIST].cleanup = {
      washed: false, changed: false, gearSecured: false, finalCalls: false,
    };
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
