import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  SCENES,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';

class MemoryStorage {
  constructor(seed) {
    this.values = new Map();
    if (seed) this.values.set(CAMPAIGN_STORAGE_KEY, JSON.stringify(seed));
  }

  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const load = (seed) => createCampaign({ storage: new MemoryStorage(seed) });

/** A v19 save on the chapter the split is about to delete. */
const dayTwoSave = (airstrip) => ({
  version: 19,
  story: { chapter: 'day_two', day: 2, timeMinutes: 7 * 60, timeEvents: [] },
  scene: { id: SCENE_IDS.APARTMENT, spawn: 'wake' },
  missions: {
    [MISSION_IDS.SQUATCHFATHER]: { status: 'complete' },
    [MISSION_IDS.AIRSTRIP_SMUGGLING]: { status: airstrip },
  },
});

test('the schema is 24 and the cabin calls exist', () => {
  /* 20 when this file was written for the Act-One cabin; 21 since beats
   * 12-19 added beat 19's telephone to the events map; 22 moves Beat 27's
   * landing from the retired starter flat to the luxury apartment; 23 repairs
   * already-consumed final-tail clocks to Days 12 and 13. The assertion is
   * kept pinned rather than loosened -- a schema that moves without somebody
   * writing a migration is the failure this whole file is about. */
  assert.equal(CAMPAIGN_VERSION, 24);
  for (const id of ['CABIN_MARGO_CALL', 'CABIN_BOOSKI_SASOLE_CALL', 'CABIN_BILLY_CALL']) {
    assert.equal(typeof EVENT_IDS[id], 'string', `${id} is missing`);
  }
  const fresh = load(null);
  for (const id of [EVENT_IDS.CABIN_MARGO_CALL, EVENT_IDS.CABIN_BOOSKI_SASOLE_CALL,
    EVENT_IDS.CABIN_BILLY_CALL]) {
    assert.equal(fresh.state.events[id].status, 'pending',
      'a fresh save has taken none of the cabin calls');
  }
});

/**
 * The reason this migration is not optional.
 *
 * `normalize()` rebuilds the events block from initialState's keys, so three
 * new keys with no migration to set `changed` make `structurallyBroken`
 * (`!migrated.changed && normalizedChanged`) true for every save on disk, and
 * the loader tells each of their owners the save was recovered. Migrations 17
 * and 18 both carry that warning in their own comments.
 */
test('no save, new or old, is announced to its owner as recovered', () => {
  const saves = [
    ['fresh', null],
    ['day_two before the Beef Run', dayTwoSave('available')],
    ['day_two after the Beef Run', dayTwoSave('complete')],
    ['post-heist at the cabin', {
      version: 19,
      story: { chapter: 'post_heist', day: 5, timeMinutes: 14 * 60, timeEvents: [] },
      scene: { id: SCENE_IDS.COUNTRYSIDE_CABIN, spawn: 'arrival' },
      missions: {
        [MISSION_IDS.BANK_HEIST]: { status: 'complete' },
        [MISSION_IDS.SILVER_CASE]: { status: 'available' },
      },
    }],
  ];
  for (const [name, seed] of saves) {
    assert.equal(load(seed).recoveredNow, false, `${name} was flagged as recovered`);
  }
});

/**
 * The soft lock this migration exists to rescue.
 *
 * day_two splits: Booski's call and the Beef Run go to the cabin, and Lou's
 * call, the Bing, the graveyard and the motel stay in the flat. A save left on
 * the old string finds no door branch answering to it, falls through to the
 * day-one tail and is told to go to bed -- while sleep() refuses, because the
 * motel it wants is not complete.
 */
test('a day_two save is moved to the chapter that owns what it has left to do', () => {
  assert.equal(load(dayTwoSave('available')).state.story.chapter, 'cabin_lay_low',
    'a save that has not flown the Beef Run still owes the whole cabin lay-low');
  assert.equal(load(dayTwoSave('complete')).state.story.chapter, 'day_two_town',
    'a save that has flown it is done with the cabin and owes the town half');
  assert.equal(load(dayTwoSave('available')).state.story.chapter !== 'day_two', true);
});

test('a post-heist save at the cabin is left exactly where it stands', () => {
  const campaign = load({
    version: 19,
    story: { chapter: 'post_heist', day: 5, timeMinutes: 14 * 60, timeEvents: [] },
    scene: { id: SCENE_IDS.COUNTRYSIDE_CABIN, spawn: 'porch' },
    missions: { [MISSION_IDS.SILVER_CASE]: { status: 'available' } },
  });
  assert.equal(campaign.state.story.chapter, 'post_heist');
  assert.deepEqual(campaign.state.scene,
    { id: SCENE_IDS.COUNTRYSIDE_CABIN, spawn: 'porch' });
});

/**
 * Inference, and its limit. Booski's cabin call is reconstructible because the
 * airstrip being unlocked proves somebody authorised it. The other two unlock
 * nothing, so there is no fact to read back -- and guessing would either
 * answer Margo on the player's behalf or replay a call in an empty room.
 */
test('only the call with a mission behind it is inferred', () => {
  const flown = load(dayTwoSave('complete')).state.events;
  assert.equal(flown[EVENT_IDS.CABIN_BOOSKI_SASOLE_CALL].status, 'answered');
  assert.equal(flown[EVENT_IDS.CABIN_MARGO_CALL].status, 'pending');
  assert.equal(flown[EVENT_IDS.CABIN_BILLY_CALL].status, 'pending');

  const locked = load({
    version: 19,
    story: { chapter: 'day_one', day: 1, timeMinutes: 6 * 60, timeEvents: [] },
    scene: { id: SCENE_IDS.APARTMENT, spawn: 'wake' },
    missions: { [MISSION_IDS.AIRSTRIP_SMUGGLING]: { status: 'locked' } },
  }).state.events;
  assert.equal(locked[EVENT_IDS.CABIN_BOOSKI_SASOLE_CALL].status, 'pending',
    'a save that never reached the airstrip has not taken the call that unlocks it');
});

/**
 * The clock trap. The post-heist cabin block is anchored at day 5, 14:30, and
 * advanceTime takes Math.max(now, atLeast) -- so an Act-One lay-low that
 * borrowed CABIN_REST would throw a Day 2 save three days forward in one bed
 * interaction, and spend the exact-once id so the later visit could never rest.
 */
test('the Act-One cabin keeps its own clock ledger, separate from the post-heist one', () => {
  const actOne = [
    TIME_EVENT_IDS.DEPART_CABIN_LAY_LOW,
    TIME_EVENT_IDS.CABIN_LAY_LOW_REST,
    TIME_EVENT_IDS.CABIN_LAY_LOW_MARGO_CALL,
    TIME_EVENT_IDS.CABIN_LAY_LOW_BOOSKI_CALL,
    TIME_EVENT_IDS.CABIN_LAY_LOW_EXPLORE_CREEK,
    TIME_EVENT_IDS.CABIN_LAY_LOW_EXPLORE_OVERLOOK,
    TIME_EVENT_IDS.CABIN_LAY_LOW_EXPLORE_SHED,
    TIME_EVENT_IDS.CABIN_LAY_LOW_EXPLORE_FIREPIT,
    TIME_EVENT_IDS.RETURN_CABIN_FROM_AIRSTRIP,
    TIME_EVENT_IDS.CABIN_SECOND_REST,
    TIME_EVENT_IDS.CABIN_SECOND_BILLY_CALL,
    TIME_EVENT_IDS.DEPART_CABIN_FOR_TOWN,
  ];
  const postHeist = [
    TIME_EVENT_IDS.DEPART_COUNTRYSIDE_CABIN,
    TIME_EVENT_IDS.CABIN_REST,
    TIME_EVENT_IDS.CABIN_EXPLORE_CREEK,
    TIME_EVENT_IDS.CABIN_EXPLORE_OVERLOOK,
    TIME_EVENT_IDS.CABIN_EXPLORE_SHED,
    TIME_EVENT_IDS.CABIN_EXPLORE_FIREPIT,
  ];
  for (const id of [...actOne, ...postHeist]) {
    assert.equal(typeof id, 'string');
  }
  const overlap = actOne.filter((id) => postHeist.includes(id));
  assert.deepEqual(overlap, [],
    'an Act-One beat is sharing an exact-once id with the post-heist visit');
  assert.equal(new Set(actOne).size, actOne.length, 'duplicate Act-One event id');

  /* The two rests must also not share an id with each other: the ledger fires
   * once per id, so Cabin II could otherwise never sleep. */
  assert.notEqual(TIME_EVENT_IDS.CABIN_LAY_LOW_REST, TIME_EVENT_IDS.CABIN_SECOND_REST);
});

/**
 * transition() is a whitelist that throws, so a missing edge strands a player
 * on a finished end card. These are the edges the new order needs.
 */
test('the scene graph carries the Act-One cabin edges', () => {
  assert.equal(SCENES[SCENE_IDS.SQUATCHFATHER].next.includes(SCENE_IDS.COUNTRYSIDE_CABIN), true,
    'the driver cannot take him to the cabin');
  assert.equal(SCENES[SCENE_IDS.AIRSTRIP_SMUGGLING].next.includes(SCENE_IDS.COUNTRYSIDE_CABIN), true,
    'Sasole cannot run him back to the cabin');
  assert.equal(SCENES[SCENE_IDS.COUNTRYSIDE_CABIN].next.includes(SCENE_IDS.AIRSTRIP_SMUGGLING), true,
    'Cabin I cannot leave for the Beef Run');
  assert.equal(SCENES[SCENE_IDS.COUNTRYSIDE_CABIN].next.includes(SCENE_IDS.APARTMENT), true,
    'Cabin II cannot go back to town');
  /* AND THE EDGE THAT CAME OUT, which is the other half of the same rule.
   *
   * The cabin held the Silver Case doorway open while it was the only way
   * into the last third of the game. Beat 19 gives that doorway to the
   * luxury apartment, so the cabin gives it up -- add first, remove last --
   * and the finale still has exactly one entrance. */
  assert.equal(SCENES[SCENE_IDS.COUNTRYSIDE_CABIN].next.includes(SCENE_IDS.SILVER_CASE), false,
    'the post-heist lay-low still claims the Silver Case');
  assert.equal(SCENES[SCENE_IDS.LUXURY_APARTMENT].next.includes(SCENE_IDS.SILVER_CASE), true,
    'the finale lost its only doorway');
});
