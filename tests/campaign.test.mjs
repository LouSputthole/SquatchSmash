import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_RECOVERY_KEY,
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  CHARACTER_IDS,
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  createCampaignRadioAdapter,
  navigateCampaign,
} from '../src/core/campaign.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test('a new campaign starts in the apartment with both Lous kept distinct', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });

  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
  assert.equal(CHARACTER_IDS.LOU, 'lou');
  assert.equal(CHARACTER_IDS.CAPTAIN_LOU_SASOLE, 'captain_lou_sasole');
  assert.notEqual(CHARACTER_IDS.LOU, CHARACTER_IDS.CAPTAIN_LOU_SASOLE);
  assert.equal(campaign.state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status, 'pending');
  assert.equal(campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status, 'locked');
  assert.equal(campaign.state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status, 'pending');
  assert.equal(campaign.state.missions[MISSION_IDS.NO_WAKE].status, 'locked');
});

test('radio running order, receiver power and bulletin history persist across scenes', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  const apartment = createCampaignRadioAdapter(campaign, {
    receiverId: 'apartment', defaultPower: true,
  });

  apartment.save({
    volume: 0.49,
    cursor: 3,
    cycle: 17,
    selections: { 'squatch:show:Lou & Lou': 4 },
    songReactionCursor: 2,
    adReactionCursor: 1,
    power: false,
  });
  assert.equal(apartment.markBulletinHeard('news.radio.day_two'), true);
  assert.equal(apartment.markBulletinHeard('news.radio.day_two'), false);

  const reloaded = createCampaign({ storage });
  const savedApartment = createCampaignRadioAdapter(reloaded, {
    receiverId: 'apartment', defaultPower: true,
  }).load();
  const car = createCampaignRadioAdapter(reloaded, {
    receiverId: 'bing_car', defaultPower: true,
  }).load();

  assert.equal(savedApartment.volume, 0.49);
  assert.equal(savedApartment.cursor, 3);
  assert.equal(savedApartment.cycle, 17);
  assert.equal(savedApartment.selections['squatch:show:Lou & Lou'], 4);
  assert.equal(savedApartment.power, false);
  assert.deepEqual(savedApartment.heardBulletins, ['news.radio.day_two']);
  assert.equal(car.power, true, 'power belongs to the physical receiver');
});

test('schema v9 preserves heist/graveyard progress and grandfathers the inserted round', () => {
  const storage = new MemoryStorage();
  const legacy = createCampaign({ storage: new MemoryStorage() }).state;
  legacy.version = 7;
  delete legacy.radio;
  legacy.missions[MISSION_IDS.BADA_BING_TWO].status = 'complete';
  legacy.missions[MISSION_IDS.BADA_BING_TWO].checkpoint = 'buried';
  legacy.missions[MISSION_IDS.BANK_HEIST].status = 'in_progress';
  legacy.missions[MISSION_IDS.BANK_HEIST].checkpoint = 'vault_open';
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const migrated = createCampaign({ storage }).state;
  assert.equal(migrated.version, CAMPAIGN_VERSION);
  assert.equal(migrated.missions[MISSION_IDS.BADA_BING_TWO].checkpoint, 'buried');
  assert.equal(migrated.missions[MISSION_IDS.BANK_HEIST].checkpoint, 'vault_open');
  assert.equal(migrated.missions[MISSION_IDS.SILVER_PINES].status, 'complete');
  assert.equal(migrated.missions[MISSION_IDS.SILVER_PINES].grandfathered, true);
  assert.equal(migrated.events[EVENT_IDS.LOU_GOLF_CALL].status, 'answered');
  assert.deepEqual(migrated.radio, {
    volume: 0.7,
    cursor: 0,
    cycle: 0,
    selections: {},
    songReactionCursor: 0,
    adReactionCursor: 0,
    heardBulletins: [],
    receivers: {},
  });
});

test('schema v9 inserts Golf only for a pristine old Day Four wake', () => {
  const storage = new MemoryStorage();
  const legacy = createCampaign({ storage: new MemoryStorage() }).state;
  legacy.version = 8;
  legacy.story.chapter = 'heist_day';
  legacy.story.day = 4;
  legacy.story.timeMinutes = 10 * 60;
  legacy.missions[MISSION_IDS.SILVER_ROOM].status = 'complete';
  legacy.missions[MISSION_IDS.BANK_HEIST].status = 'locked';
  legacy.events[EVENT_IDS.LOU_HEIST_CALL].status = 'pending';
  delete legacy.missions[MISSION_IDS.SILVER_PINES];
  delete legacy.events[EVENT_IDS.LOU_GOLF_CALL];
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(legacy));

  const migrated = createCampaign({ storage }).state;
  assert.equal(migrated.story.chapter, 'golf_morning');
  assert.equal(migrated.story.day, 4);
  assert.equal(migrated.story.timeMinutes, 7 * 60);
  assert.equal(migrated.missions[MISSION_IDS.SILVER_PINES].status, 'locked');
  assert.equal(migrated.missions[MISSION_IDS.SILVER_PINES].grandfathered, false);
  assert.equal(migrated.events[EVENT_IDS.LOU_GOLF_CALL].status, 'pending');
  assert.equal(migrated.missions[MISSION_IDS.BANK_HEIST].status, 'locked');
  assert.equal(migrated.events[EVENT_IDS.LOU_HEIST_CALL].status, 'pending');
});

test('Golf card normalization deduplicates holes and derives every total', () => {
  const storage = new MemoryStorage();
  const raw = createCampaign({ storage: new MemoryStorage() }).state;
  Object.assign(raw.missions[MISSION_IDS.SILVER_PINES], {
    status: 'in_progress',
    holesPlayed: 99,
    strokes: 999,
    penalties: 999,
    toPar: 999,
    holes: [
      { hole: 3, par: 4, strokes: 6, penalties: 1 },
      { hole: 1, par: 3, strokes: 5, penalties: 2 },
      { hole: 1, par: 3, strokes: 4, penalties: 0 },
      { hole: 8, par: 7, strokes: 1000, penalties: -4 },
      { hole: 2, strokes: 'bad' },
    ],
  });
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(raw));

  const golf = createCampaign({ storage }).state.missions[MISSION_IDS.SILVER_PINES];
  assert.deepEqual(golf.holes, [
    { hole: 1, par: 3, strokes: 4, penalties: 0 },
    { hole: 3, par: 4, strokes: 6, penalties: 1 },
  ]);
  assert.equal(golf.holesPlayed, 2);
  assert.equal(golf.strokes, 10);
  assert.equal(golf.penalties, 1);
  assert.equal(golf.toPar, 3);
});

test('radio save normalization bounds counters and rejects malformed maps', () => {
  const storage = new MemoryStorage();
  const raw = createCampaign({ storage: new MemoryStorage() }).state;
  raw.radio = {
    volume: 8,
    cursor: -2,
    cycle: 2_000_000,
    selections: { good: 12, negative: -1, decimal: 1.5, ["x".repeat(121)]: 3 },
    songReactionCursor: 2_000_000,
    adReactionCursor: -5,
    heardBulletins: [...Array.from({ length: 70 }, (_, i) => `bulletin.${i}`), 'bulletin.69'],
    receivers: { apartment: false, bad: 'yes', ["r".repeat(81)]: true },
  };
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(raw));

  const radio = createCampaign({ storage }).state.radio;
  assert.equal(radio.volume, 1);
  assert.equal(radio.cursor, 0);
  assert.equal(radio.cycle, 1_000_000);
  assert.deepEqual(radio.selections, { good: 12 });
  assert.equal(radio.songReactionCursor, 1_000_000);
  assert.equal(radio.adReactionCursor, 0);
  assert.equal(radio.heardBulletins.length, 64);
  assert.deepEqual(radio.receivers, { apartment: false });
});

test('a confirmed campaign reset replaces story progress and clears obsolete recovery data', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });
  campaign.advanceTime(TIME_EVENT_IDS.EAT, (state) => { state.activities.eaten = true; });
  storage.setItem(CAMPAIGN_RECOVERY_KEY, JSON.stringify({ reason: 'old_test_recovery', raw: '{}' }));

  const reset = campaign.reset();

  assert.equal(reset.scene.id, SCENE_IDS.APARTMENT);
  assert.equal(reset.scene.spawn, 'wake');
  assert.equal(reset.story.day, 1);
  assert.equal(reset.activities.eaten, false);
  assert.equal(reset.inventory.concealed.includes(ITEM_IDS.LOU_PACKAGE), false);
  assert.equal(storage.getItem(CAMPAIGN_RECOVERY_KEY), null);
  assert.deepEqual(createCampaign({ storage }).state, reset);
});

test('authored task time advances once and survives a reload', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });

  assert.deepEqual(campaign.advanceTime(TIME_EVENT_IDS.EAT), {
    applied: true,
    day: 1,
    timeMinutes: 6 * 60 + 24,
    minutesAdvanced: 20,
  });
  assert.deepEqual(campaign.advanceTime(TIME_EVENT_IDS.EAT), {
    applied: false,
    day: 1,
    timeMinutes: 6 * 60 + 24,
    minutesAdvanced: 0,
  });

  const restored = createCampaign({ storage }).state;
  assert.equal(restored.story.day, 1);
  assert.equal(restored.story.timeMinutes, 6 * 60 + 24);
  assert.deepEqual(restored.story.timeEvents, [TIME_EVENT_IDS.EAT]);
});

test('a completed task and its authored time are committed as one campaign beat', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });

  campaign.advanceTime(TIME_EVENT_IDS.SHOWER, (state) => {
    state.activities.showered = true;
  });

  const restored = createCampaign({ storage }).state;
  assert.equal(restored.activities.showered, true);
  assert.equal(restored.story.timeMinutes, 6 * 60 + 19);
  assert.deepEqual(restored.story.timeEvents, [TIME_EVENT_IDS.SHOWER]);
});

test('morning tasks consume authored time and departure lands at the Bing opening', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });

  for (const eventId of [
    TIME_EVENT_IDS.EAT,
    TIME_EVENT_IDS.SHOWER,
    TIME_EVENT_IDS.POOP,
    TIME_EVENT_IDS.CHANGE_CLOTHES,
    TIME_EVENT_IDS.LOU_FIRST_CALL,
  ]) {
    campaign.advanceTime(eventId);
  }
  assert.equal(campaign.state.story.timeMinutes, 6 * 60 + 57);

  const departure = campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_ONE);
  assert.deepEqual(departure, {
    applied: true,
    day: 1,
    timeMinutes: 23 * 60 + 41,
    minutesAdvanced: 16 * 60 + 44,
  });
});

test('the Day Two through Day Four mission beats land on their authored clocks', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });

  const beats = [
    [TIME_EVENT_IDS.DEPART_AIRSTRIP, 2, 9 * 60 + 10],
    [TIME_EVENT_IDS.COMPLETE_AIRSTRIP, 2, 20 * 60 + 30],
    [TIME_EVENT_IDS.DEPART_BADA_BING_TWO, 2, 23 * 60],
    [TIME_EVENT_IDS.ARRIVE_SQUATCH_GRAVEYARD, 3, 15],
    [TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO, 3, 45],
    [TIME_EVENT_IDS.DEPART_JERKY_MOTEL, 3, 60 + 30],
    [TIME_EVENT_IDS.COMPLETE_JERKY_MOTEL, 3, 4 * 60 + 30],
    [TIME_EVENT_IDS.DEPART_NO_WAKE, 3, 12 * 60 + 45],
    [TIME_EVENT_IDS.COMPLETE_NO_WAKE, 3, 16 * 60 + 40],
    /* Day 3 is the date. He sleeps the morning off, she rings in the
     * afternoon, and he leaves at half seven for a nine o'clock table. */
    [TIME_EVENT_IDS.DEPART_SILVER_ROOM, 3, 19 * 60 + 30],
    [TIME_EVENT_IDS.COMPLETE_SILVER_ROOM, 3, 23 * 60 + 20],
    // And the ceremony is the next day: Day 4, seven sharp.
    [TIME_EVENT_IDS.DEPART_INITIATION, 4, 19 * 60],
  ];
  for (const [eventId, day, timeMinutes] of beats) {
    const result = campaign.advanceTime(eventId);
    assert.equal(result.applied, true, eventId);
    assert.equal(result.day, day, eventId);
    assert.equal(result.timeMinutes, timeMinutes, eventId);
  }

  // Replaying a completed beat cannot farm time across the midnight boundary,
  // and cannot drag the clock back to the beat's own authored hour either.
  const replay = campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO);
  assert.deepEqual(replay, {
    applied: false, day: 4, timeMinutes: 19 * 60, minutesAdvanced: 0,
  });
});

test('Lou’s parcel persists as concealed inventory across a reload', () => {
  const storage = new MemoryStorage();
  const firstPage = createCampaign({ storage });

  firstPage.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });

  const nextPage = createCampaign({ storage });
  assert.equal(nextPage.hasItem(ITEM_IDS.LOU_PACKAGE), true);
  assert.deepEqual(nextPage.state.inventory.concealed, [ITEM_IDS.LOU_PACKAGE]);
  assert.deepEqual(nextPage.state.inventory.carried, []);
});

test('scene navigation saves the target and spawn before changing pages', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  const calls = [];
  const location = {
    assign(href) {
      calls.push({
        href,
        saved: createCampaign({ storage }).state.scene,
      });
    },
  };

  navigateCampaign(campaign, SCENE_IDS.BADA_BING_ONE, {
    spawn: 'driver_seat',
    location,
  });

  assert.deepEqual(calls, [{
    href: 'bing.html',
    saved: {
      id: SCENE_IDS.BADA_BING_ONE,
      spawn: 'driver_seat',
    },
  }]);
  assert.deepEqual(campaign.state.lastTransition, {
    from: SCENE_IDS.APARTMENT,
    to: SCENE_IDS.BADA_BING_ONE,
    spawn: 'driver_seat',
  });
});

test('invalid saved spawn points recover to the registered scene default', () => {
  const storage = new MemoryStorage();
  storage.setItem('squatchlife.campaign', JSON.stringify({
    version: 1,
    revision: 12,
    scene: {
      id: SCENE_IDS.BADA_BING_ONE,
      spawn: 'through_the_office_ceiling',
    },
  }));

  const campaign = createCampaign({ storage });
  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.BADA_BING_ONE,
    spawn: 'driver_seat',
  });
});

test('scene entry and transition reject unregistered spawn points atomically', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const before = campaign.state.scene;

  assert.throws(
    () => campaign.enter(SCENE_IDS.BADA_BING_ONE, { spawn: 'roof' }),
    /Unknown spawn "roof"/,
  );
  assert.deepEqual(campaign.state.scene, before);

  assert.throws(
    () => campaign.transition(SCENE_IDS.BADA_BING_ONE, { spawn: 'roof' }),
    /Unknown spawn "roof"/,
  );
  assert.deepEqual(campaign.state.scene, before);
});

test('every registered scene has a deterministic default spawn', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const expected = new Map([
    [SCENE_IDS.APARTMENT, 'wake'],
    [SCENE_IDS.BADA_BING_ONE, 'driver_seat'],
    [SCENE_IDS.SQUATCHFATHER, 'restaurant_exterior'],
    [SCENE_IDS.AIRSTRIP_SMUGGLING, 'hangar'],
    [SCENE_IDS.BADA_BING_TWO, 'driver_seat'],
    [SCENE_IDS.SQUATCH_GRAVEYARD, 'headlights'],
    [SCENE_IDS.JERKY_MOTEL, 'passenger_seat'],
    [SCENE_IDS.NO_WAKE, 'gate_c'],
    [SCENE_IDS.SILVER_ROOM, 'kerb'],
    [SCENE_IDS.INITIATION, 'gathering'],
  ]);

  for (const [sceneId, spawn] of expected) {
    campaign.enter(sceneId);
    assert.deepEqual(campaign.state.scene, { id: sceneId, spawn });
  }
});

test('the apartment door is a registered route to the Initiation', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  const hrefs = [];

  navigateCampaign(campaign, SCENE_IDS.INITIATION, {
    location: { assign: (href) => hrefs.push(href) },
  });

  assert.deepEqual(hrefs, ['initiation.html']);
  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.INITIATION,
    spawn: 'gathering',
  });
  assert.deepEqual(createCampaign({ storage }).state.scene, {
    id: SCENE_IDS.INITIATION,
    spawn: 'gathering',
  });
  // The unchanged Initiation build never navigates anywhere, so it has no
  // outbound edge and must not be given one by accident.
  assert.throws(
    () => campaign.transition(SCENE_IDS.APARTMENT, { spawn: 'wake' }),
    /Cannot transition from "initiation" to "apartment"/,
  );
});

test('an exposed Initiation implies Booskibro’s big-night call already landed', () => {
  const storage = new MemoryStorage();
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify({
    version: 1,
    revision: 31,
    scene: { id: SCENE_IDS.APARTMENT, spawn: 'wake' },
    story: { chapter: 'big_night', day: 3, timeMinutes: 12 * 60 + 5 },
    activities: {},
    inventory: { carried: [], concealed: [] },
    missions: {
      [MISSION_IDS.JERKY_MOTEL]: { status: 'complete', ending: 'home' },
      [MISSION_IDS.INITIATION]: { status: 'available' },
    },
    events: {},
  }));

  const restored = createCampaign({ storage }).state;
  assert.equal(restored.story.chapter, 'big_night');
  assert.equal(restored.missions[MISSION_IDS.INITIATION].status, 'available');
  assert.equal(restored.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status, 'answered');
});

test('failed browser navigation rolls campaign state back to the source scene', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });

  assert.throws(
    () => navigateCampaign(campaign, SCENE_IDS.BADA_BING_ONE, {
      spawn: 'driver_seat',
      location: {
        assign() {
          throw new Error('navigation blocked');
        },
      },
    }),
    /navigation blocked/,
  );

  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.APARTMENT,
    spawn: 'wake',
  });
  assert.equal(campaign.state.lastTransition, undefined);
  assert.deepEqual(createCampaign({ storage }).state.scene, {
    id: SCENE_IDS.APARTMENT,
    spawn: 'wake',
  });
});

test('a missing browser location fails before campaign state changes', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });

  assert.throws(
    () => navigateCampaign(campaign, SCENE_IDS.BADA_BING_ONE, {
      spawn: 'driver_seat',
      location: {},
    }),
    /location with assign/,
  );
  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.APARTMENT,
    spawn: 'wake',
  });
});

test('Bada Bing completion and its parcel survive the return to the apartment', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });

  campaign.transition(SCENE_IDS.BADA_BING_ONE, { spawn: 'driver_seat' });
  campaign.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.BADA_BING_ONE].packageReceived = true;
    state.missions[MISSION_IDS.BADA_BING_ONE].ending = 'warned';
  });
  campaign.transition(SCENE_IDS.APARTMENT, { spawn: 'front_door' });

  const atHome = createCampaign({ storage }).state;
  assert.deepEqual(atHome.scene, {
    id: SCENE_IDS.APARTMENT,
    spawn: 'front_door',
  });
  assert.deepEqual(atHome.inventory.concealed, [ITEM_IDS.LOU_PACKAGE]);
  assert.deepEqual(atHome.missions[MISSION_IDS.BADA_BING_ONE], {
    status: 'complete',
    packageReceived: true,
    ending: 'warned',
  });
});

test('a direct Bada Bing entry can still return through the campaign router', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });

  campaign.enter(SCENE_IDS.BADA_BING_ONE, { spawn: 'driver_seat' });
  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.BADA_BING_ONE,
    spawn: 'driver_seat',
  });
  assert.equal(campaign.state.lastTransition, undefined);

  campaign.transition(SCENE_IDS.APARTMENT, { spawn: 'front_door' });
  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
});

test('blocked browser storage falls back to the live in-memory campaign', () => {
  const storage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error('storage disabled');
    },
  };
  const campaign = createCampaign({ storage });

  assert.doesNotThrow(() => {
    campaign.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });
  });
  assert.equal(campaign.hasItem(ITEM_IDS.LOU_PACKAGE), true);
  assert.throws(
    () => campaign.transition(SCENE_IDS.BADA_BING_ONE, { spawn: 'driver_seat' }),
    /could not be saved/i,
  );
  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
});

test('apartment readiness and learned story context survive a reload', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });

  campaign.update((state) => {
    state.activities.eaten = true;
    state.activities.showered = true;
    state.activities.peed = true;
    state.activities.pooped = true;
    state.activities.changedClothes = true;
    state.story.meetingKnown = true;
    state.story.meetingLearnedFrom = 'lou_call';
  });

  const restored = createCampaign({ storage }).state;
  assert.deepEqual(restored.activities, {
    eaten: true,
    showered: true,
    peed: true,
    pooped: true,
    changedClothes: true,
    emailChecked: false,
    whiskeyRelaxed: false,
  });
  assert.equal(restored.story.meetingKnown, true);
  assert.equal(restored.story.meetingLearnedFrom, 'lou_call');
});

test('a valid version two save gains the whiskey flag without corruption recovery', () => {
  const storage = new MemoryStorage();
  const versionTwo = createCampaign({ storage: new MemoryStorage() }).state;
  versionTwo.version = 2;
  versionTwo.activities.eaten = true;
  delete versionTwo.activities.whiskeyRelaxed;
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(versionTwo));

  const campaign = createCampaign({ storage });
  const persisted = JSON.parse(storage.getItem(CAMPAIGN_STORAGE_KEY));

  assert.equal(campaign.state.activities.eaten, true);
  assert.equal(campaign.state.activities.whiskeyRelaxed, false);
  assert.equal(campaign.recoveredNow, false);
  assert.equal(campaign.recovery, null);
  assert.equal(persisted.version, CAMPAIGN_VERSION);
  assert.equal(persisted.activities.whiskeyRelaxed, false);
});

/*
 * The morning routine grew a fifth errand between version 10 and 11, and the
 * split is the whole point of it: a save that had ticked the old combined
 * bathroom chore has plainly been to the bathroom and keeps both halves, while
 * one that had not keeps neither. Getting this backwards either un-does a
 * chore a player finished this morning or hands them one they never did.
 */
test('a version ten save splits the bathroom chore in two without losing it', () => {
  const withBoth = new MemoryStorage();
  const done = createCampaign({ storage: new MemoryStorage() }).state;
  done.version = 10;
  done.activities.pooped = true;
  delete done.activities.peed;
  withBoth.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(done));

  const inherited = createCampaign({ storage: withBoth });
  assert.equal(inherited.state.activities.pooped, true);
  assert.equal(inherited.state.activities.peed, true);
  assert.equal(inherited.recoveredNow, false);
  assert.equal(inherited.recovery, null);
  assert.equal(
    JSON.parse(withBoth.getItem(CAMPAIGN_STORAGE_KEY)).version, CAMPAIGN_VERSION,
  );

  const withNeither = new MemoryStorage();
  const notDone = createCampaign({ storage: new MemoryStorage() }).state;
  notDone.version = 10;
  notDone.activities.pooped = false;
  delete notDone.activities.peed;
  withNeither.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(notDone));

  const owing = createCampaign({ storage: withNeither });
  assert.equal(owing.state.activities.pooped, false);
  assert.equal(owing.state.activities.peed, false);
  assert.equal(owing.recoveredNow, false);
});

/** Two errands means two clock costs, and the quick one is the cheap one. */
test('the two bathroom errands cost the clock separately', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const start = campaign.state.story.timeMinutes;
  campaign.advanceTime(TIME_EVENT_IDS.PEE, (state) => { state.activities.peed = true; });
  const afterPee = campaign.state.story.timeMinutes;
  campaign.advanceTime(TIME_EVENT_IDS.POOP, (state) => { state.activities.pooped = true; });
  const afterPoop = campaign.state.story.timeMinutes;

  assert.equal(afterPee - start, 3);
  assert.equal(afterPoop - afterPee, 10);
  assert.equal(campaign.state.activities.peed, true);
  assert.equal(campaign.state.activities.pooped, true);
  assert.ok(campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.PEE));
});

test('older Day One saves gain the Day Two event and airstrip mission without losing progress', () => {
  const storage = new MemoryStorage();
  storage.setItem('squatchlife.campaign', JSON.stringify({
    version: 1,
    revision: 4,
    scene: { id: SCENE_IDS.APARTMENT, spawn: 'front_door' },
    story: {
      chapter: 'day_one',
      day: 1,
      timeMinutes: 22 * 60,
      meetingKnown: true,
      meetingLearnedFrom: 'lou_call',
    },
    activities: {
      eaten: true,
      showered: true,
      pooped: true,
      changedClothes: true,
      emailChecked: false,
    },
    inventory: { carried: [], concealed: [] },
    missions: {
      [MISSION_IDS.BADA_BING_ONE]: {
        status: 'complete',
        packageReceived: true,
        ending: 'front',
      },
      [MISSION_IDS.SQUATCHFATHER]: {
        status: 'complete',
        weaponStaged: true,
        weaponDropped: true,
      },
    },
    events: {
      [EVENT_IDS.LOU_FIRST_CALL]: { status: 'answered' },
    },
  }));

  const restored = createCampaign({ storage }).state;
  const migrated = JSON.parse(storage.getItem(CAMPAIGN_STORAGE_KEY));
  assert.equal(restored.version, CAMPAIGN_VERSION);
  assert.equal(migrated.version, CAMPAIGN_VERSION);
  assert.equal(restored.missions[MISSION_IDS.SQUATCHFATHER].status, 'complete');
  assert.equal(restored.activities.eaten, true);
  assert.equal(restored.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status, 'pending');
  assert.equal(restored.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status, 'locked');
  assert.equal(restored.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status, 'pending');
  assert.equal(restored.missions[MISSION_IDS.INITIATION].status, 'locked');
});

test('malformed save JSON is backed up before a clean campaign replaces it', () => {
  const storage = new MemoryStorage();
  const raw = '{"version":1,"scene":';
  storage.setItem(CAMPAIGN_STORAGE_KEY, raw);

  const campaign = createCampaign({ storage });
  const recovery = JSON.parse(storage.getItem(CAMPAIGN_RECOVERY_KEY));
  const persisted = JSON.parse(storage.getItem(CAMPAIGN_STORAGE_KEY));

  assert.equal(campaign.state.version, CAMPAIGN_VERSION);
  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
  assert.deepEqual(recovery, {
    reason: 'invalid_json',
    raw,
  });
  assert.deepEqual(campaign.recovery, recovery);
  assert.equal(persisted.version, CAMPAIGN_VERSION);
});

test('unsupported future saves are preserved instead of being silently discarded', () => {
  const storage = new MemoryStorage();
  const future = {
    version: CAMPAIGN_VERSION + 10,
    revision: 99,
    scene: { id: SCENE_IDS.JERKY_MOTEL, spawn: 'passenger_seat' },
  };
  const raw = JSON.stringify(future);
  storage.setItem(CAMPAIGN_STORAGE_KEY, raw);

  const campaign = createCampaign({ storage });
  const recovery = JSON.parse(storage.getItem(CAMPAIGN_RECOVERY_KEY));

  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
  assert.equal(storage.getItem(CAMPAIGN_STORAGE_KEY), raw);
  assert.deepEqual(recovery, {
    reason: 'unsupported_version',
    raw,
  });
  assert.deepEqual(campaign.recovery, recovery);
  assert.equal(campaign.persistent, false);
});

test('a recovery record remains discoverable after the repaired save reloads', () => {
  const storage = new MemoryStorage();
  const raw = '{"version":1,"story":';
  storage.setItem(CAMPAIGN_STORAGE_KEY, raw);

  const recovered = createCampaign({ storage });
  assert.equal(recovered.recoveredNow, true);

  const reloaded = createCampaign({ storage });
  assert.equal(reloaded.recoveredNow, false);
  assert.deepEqual(reloaded.recovery, {
    reason: 'invalid_json',
    raw,
  });
});

test('parseable but structurally broken current saves are backed up before repair', () => {
  const storage = new MemoryStorage();
  const raw = JSON.stringify({ version: CAMPAIGN_VERSION });
  storage.setItem(CAMPAIGN_STORAGE_KEY, raw);

  const campaign = createCampaign({ storage });
  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
  assert.deepEqual(campaign.recovery, {
    reason: 'invalid_shape',
    raw,
  });
  assert.equal(JSON.parse(storage.getItem(CAMPAIGN_STORAGE_KEY)).version, CAMPAIGN_VERSION);
});

test('navigation never leaves the page when its transition cannot be persisted', () => {
  let assignments = 0;
  const storage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error('quota exceeded');
    },
  };
  const campaign = createCampaign({ storage });

  assert.throws(
    () => navigateCampaign(campaign, SCENE_IDS.BADA_BING_ONE, {
      spawn: 'driver_seat',
      location: {
        assign() {
          assignments++;
        },
      },
    }),
    /could not be saved/i,
  );
  assert.equal(assignments, 0);
  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
});

test('a failed navigation rollback exposes the hard save mismatch', () => {
  const values = new Map();
  let writes = 0;
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      writes++;
      if (writes === 2) throw new Error('rollback write failed');
      values.set(key, String(value));
    },
  };
  const campaign = createCampaign({ storage });

  assert.throws(
    () => navigateCampaign(campaign, SCENE_IDS.BADA_BING_ONE, {
      location: {
        assign() {
          throw new Error('navigation blocked');
        },
      },
    }),
    (error) => error instanceof AggregateError
      && /rollback could not be saved/i.test(error.message),
  );

  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
  assert.equal(
    JSON.parse(values.get(CAMPAIGN_STORAGE_KEY)).scene.id,
    SCENE_IDS.BADA_BING_ONE,
  );
  assert.equal(campaign.persistent, false);
});

test('storage read failures fall back to a coherent in-memory campaign', () => {
  const storage = {
    getItem() {
      throw new Error('read disabled');
    },
    setItem() {
      throw new Error('write disabled');
    },
  };

  const campaign = createCampaign({ storage });
  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
  assert.doesNotThrow(() => {
    campaign.update((state) => {
      state.activities.eaten = true;
    });
  });
  assert.equal(campaign.state.activities.eaten, true);
});

test('a failed recovery backup never overwrites the damaged primary save', () => {
  const raw = '{"version":1,"inventory":';
  const values = new Map([[CAMPAIGN_STORAGE_KEY, raw]]);
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (key === CAMPAIGN_RECOVERY_KEY) throw new Error('recovery quota exceeded');
      values.set(key, String(value));
    },
  };

  const campaign = createCampaign({ storage });
  assert.equal(storage.getItem(CAMPAIGN_STORAGE_KEY), raw);
  assert.equal(campaign.persistent, false);
  assert.equal(campaign.recovery.reason, 'invalid_json');
});

test('a failed repaired-save write preserves both the damaged primary and its backup', () => {
  const raw = '{"version":1,"story":';
  const values = new Map([[CAMPAIGN_STORAGE_KEY, raw]]);
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (key === CAMPAIGN_STORAGE_KEY) throw new Error('primary quota exceeded');
      values.set(key, String(value));
    },
  };

  const campaign = createCampaign({ storage });
  assert.equal(values.get(CAMPAIGN_STORAGE_KEY), raw);
  assert.deepEqual(JSON.parse(values.get(CAMPAIGN_RECOVERY_KEY)), {
    reason: 'invalid_json',
    raw,
  });
  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
  assert.equal(campaign.persistent, false);
});

test('a damaged recovery record does not hide a valid primary save', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.activities.eaten = true;
  });
  storage.setItem(CAMPAIGN_RECOVERY_KEY, '{not valid json');

  const reloaded = createCampaign({ storage });
  assert.equal(reloaded.state.activities.eaten, true);
  assert.equal(reloaded.recovery, null);
});
