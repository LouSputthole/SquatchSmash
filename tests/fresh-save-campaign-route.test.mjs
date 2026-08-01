import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  navigateCampaign,
} from '../src/core/campaign.js';
import {
  BIG_NIGHT_BOOSKI_CALL,
  DATE_MARGO_CALL,
  DAY_ONE_LOU_CALL,
  DAY_TWO_BOOSKI_CALL,
  DAY_TWO_LOU_SECOND_CALL,
  NO_WAKE_LOU_CALL,
  createApartmentStory,
} from '../src/core/apartment-story.js';
import { createAirstripStory } from '../src/core/airstrip-story.js';
import {
  BADA_BING_TWO_CLEANUP_TASKS,
  createBadaBingTwoStory,
} from '../src/core/bada-bing-two-story.js';
import { createGraveyardStory } from '../src/core/graveyard-story.js';
import { createMotelStory } from '../src/core/motel-story.js';
import { createNoWakeStory } from '../src/core/no-wake-story.js';
import { createSilverStory } from '../src/core/silver-story.js';
import { createSquatchfatherStory } from '../src/core/squatchfather-story.js';

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
}

/** Route as a browser scene does, while retaining the URL assertion in Node. */
function route(campaign, sceneId, spawn, href) {
  const assigned = [];
  navigateCampaign(campaign, sceneId, {
    spawn,
    location: { assign: (next) => assigned.push(next) },
  });
  assert.deepEqual(assigned, [href]);
}

function reload(storage) {
  return createCampaign({ storage });
}

function apartmentExit(story, campaign) {
  return story.tryLeave(campaign.state.activities);
}

test('a fresh Tony campaign persists the complete route to an in-progress Initiation', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  let apartment = createApartmentStory({ campaign, ring: () => true });

  // Day One: do the compulsory morning routine, answer Big Uncle Lou, then
  // leave normally for the first Bing visit.
  for (const [eventId, activity] of [
    [TIME_EVENT_IDS.EAT, 'eaten'],
    [TIME_EVENT_IDS.SHOWER, 'showered'],
    [TIME_EVENT_IDS.POOP, 'pooped'],
    [TIME_EVENT_IDS.CHANGE_CLOTHES, 'changedClothes'],
  ]) {
    campaign.advanceTime(eventId, (state) => { state.activities[activity] = true; });
  }
  assert.equal(apartment.callAnswered(DAY_ONE_LOU_CALL), true);
  assert.deepEqual(apartmentExit(apartment, campaign), {
    kind: 'go', destination: SCENE_IDS.BADA_BING_ONE,
  });
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_ONE, (state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'in_progress';
  });
  route(campaign, SCENE_IDS.BADA_BING_ONE, 'driver_seat', 'bing.html');

  // The first Bing scene owns the package handoff and its own ending. Its
  // durable actions are deliberately exercised through Campaign's public API.
  campaign.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.BADA_BING_ONE].packageReceived = true;
    state.missions[MISSION_IDS.BADA_BING_ONE].ending = 'warned';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'available';
  });
  route(campaign, SCENE_IDS.APARTMENT, 'front_door', 'index.html');

  // A browser reload at home must retain Lou's parcel and first-visit result.
  campaign = reload(storage);
  assert.equal(campaign.hasItem(ITEM_IDS.LOU_PACKAGE), true);
  assert.equal(campaign.state.missions[MISSION_IDS.BADA_BING_ONE].status, 'complete');
  apartment = createApartmentStory({ campaign, ring: () => true });
  assert.equal(apartmentExit(apartment, campaign).id, 'whiskeyRelaxed');
  campaign.update((state) => { state.activities.whiskeyRelaxed = true; });
  assert.deepEqual(apartmentExit(apartment, campaign), {
    kind: 'go', destination: SCENE_IDS.SQUATCHFATHER,
  });
  route(campaign, SCENE_IDS.SQUATCHFATHER, 'restaurant_exterior', 'squatchfather.html');

  const squatchfather = createSquatchfatherStory({ campaign });
  assert.deepEqual(squatchfather.begin(), { ok: true, resumed: false });
  assert.equal(campaign.hasItem(ITEM_IDS.LOU_PACKAGE), false);
  assert.equal(squatchfather.complete(), true);
  route(campaign, SCENE_IDS.APARTMENT, 'front_door', 'index.html');
  // This is the apartment's actual on-arrival clock handoff for Squatchfather.
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER);
  apartment = createApartmentStory({ campaign, ring: () => true });
  assert.deepEqual(apartment.sleep(), {
    ok: true, chapter: 'day_two', day: 2, timeMinutes: 7 * 60,
  });

  // Day Two: Booskibro authorizes the Beef Run; the real mission checkpoint
  // API carries the cargo/detection/landing state to a reload.
  assert.equal(apartment.callAnswered(DAY_TWO_BOOSKI_CALL), true);
  assert.deepEqual(apartmentExit(apartment, campaign), {
    kind: 'go', destination: SCENE_IDS.AIRSTRIP_SMUGGLING,
  });
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_AIRSTRIP);
  route(campaign, SCENE_IDS.AIRSTRIP_SMUGGLING, 'hangar', 'beefrun.html');
  const airstrip = createAirstripStory({ campaign });
  assert.deepEqual(airstrip.begin(), { ok: true, resumed: false, checkpoint: 'airstrip' });
  assert.equal(airstrip.checkpoint('remote_strip'), true);
  assert.equal(airstrip.loadCargo(), true);
  assert.equal(airstrip.markDetected(), true);
  assert.equal(airstrip.checkpoint('returning'), true);
  assert.equal(airstrip.checkpoint('landed_home'), true);
  assert.equal(airstrip.complete({ landingQuality: 'clean' }), true);
  route(campaign, SCENE_IDS.APARTMENT, 'front_door', 'index.html');

  campaign = reload(storage);
  assert.deepEqual(campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING], {
    status: 'complete',
    checkpoint: 'landed_home',
    cargoLoaded: true,
    detected: true,
    landingQuality: 'clean',
  });
  apartment = createApartmentStory({ campaign, ring: () => true });
  assert.equal(apartment.callAnswered(DAY_TWO_LOU_SECOND_CALL), true);
  assert.deepEqual(apartmentExit(apartment, campaign), {
    kind: 'go', destination: SCENE_IDS.BADA_BING_TWO,
  });
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_TWO);
  route(campaign, SCENE_IDS.BADA_BING_TWO, 'driver_seat', 'bing.html?visit=2');

  const bingTwo = createBadaBingTwoStory({ campaign });
  assert.deepEqual(bingTwo.begin(), { ok: true, resumed: false, checkpoint: 'party' });
  assert.equal(bingTwo.recordAttack({ gunKicked: true }), true);
  for (const task of BADA_BING_TWO_CLEANUP_TASKS) assert.equal(bingTwo.recordCleanup(task), true);
  assert.equal(bingTwo.completeClub({
    assignment: 'reserve_pickup', bodyWrapped: true, bodyLoaded: true,
  }), true);
  route(campaign, SCENE_IDS.SQUATCH_GRAVEYARD, 'headlights', 'graveyard.html');
  const graveyard = createGraveyardStory({ campaign });
  assert.deepEqual(graveyard.begin(), { ok: true, resumed: false });
  assert.equal(graveyard.complete({ bodyBuried: true }), true);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_JERKY_MOTEL);
  route(campaign, SCENE_IDS.JERKY_MOTEL, 'passenger_seat', 'motel.html');
  const motel = createMotelStory({ campaign });
  assert.deepEqual(motel.begin(), { ok: true, resumed: false });
  assert.equal(motel.complete({
    ending: 'home', cargoRecovered: true, packagesIntact: 7, freshness: 81, policeHeat: 24,
  }), true);
  route(campaign, SCENE_IDS.APARTMENT, 'front_door', 'index.html');

  // The post-Motel reload proves NO WAKE opens only after sleeping at home.
  campaign = reload(storage);
  apartment = createApartmentStory({ campaign, ring: () => true });
  assert.equal(campaign.state.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete');
  assert.deepEqual(apartment.sleep(), {
    ok: true, chapter: 'no_wake', day: 3, timeMinutes: 12 * 60,
  });
  assert.equal(apartment.callAnswered(NO_WAKE_LOU_CALL), true);
  assert.deepEqual(apartmentExit(apartment, campaign), {
    kind: 'go', destination: SCENE_IDS.NO_WAKE,
  });
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_NO_WAKE);
  route(campaign, SCENE_IDS.NO_WAKE, 'gate_c', 'nowake.html');
  const noWake = createNoWakeStory({ campaign });
  assert.deepEqual(noWake.begin(), { ok: true, resumed: false });
  assert.equal(noWake.complete({
    betrayalConfirmed: true, playerFired: true, bodyDisposed: true,
  }), true);
  route(campaign, SCENE_IDS.APARTMENT, 'front_door', 'index.html');

  apartment = createApartmentStory({ campaign, ring: () => true });
  assert.equal(apartment.callAnswered(DATE_MARGO_CALL), true);
  assert.deepEqual(apartmentExit(apartment, campaign), {
    kind: 'go', destination: SCENE_IDS.SILVER_ROOM,
  });
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_ROOM);
  route(campaign, SCENE_IDS.SILVER_ROOM, 'kerb', 'silver.html');
  const silver = createSilverStory({ campaign });
  assert.deepEqual(silver.begin(), { ok: true, resumed: false });
  assert.equal(silver.complete({
    outcome: 'strong', woo: 74, band: 'midnight_pines', tippedEverybody: true,
    rememberedDrink: true, seeingHerAgain: true, date: { knowsWhatHeDoes: true },
  }), true);
  route(campaign, SCENE_IDS.APARTMENT, 'front_door', 'index.html');

  apartment = createApartmentStory({ campaign, ring: () => true });
  assert.deepEqual(apartment.sleep(), {
    ok: true, chapter: 'big_night', day: 4, timeMinutes: 10 * 60,
  });
  assert.equal(apartment.callAnswered(BIG_NIGHT_BOOSKI_CALL), true);
  assert.deepEqual(apartmentExit(apartment, campaign), {
    kind: 'go', destination: SCENE_IDS.INITIATION,
  });
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_INITIATION, (state) => {
    state.missions[MISSION_IDS.INITIATION].status = 'in_progress';
  });
  route(campaign, SCENE_IDS.INITIATION, 'gathering', 'initiation.html');

  // The current Initiation build is intentionally a terminal work-in-progress:
  // it can be entered through the story, but must never be reported complete.
  campaign = reload(storage);
  assert.equal(campaign.state.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status, 'answered');
  assert.deepEqual(campaign.state.scene, { id: SCENE_IDS.INITIATION, spawn: 'gathering' });
  assert.equal(campaign.state.missions[MISSION_IDS.INITIATION].status, 'in_progress');
  assert.notEqual(campaign.state.missions[MISSION_IDS.INITIATION].status, 'complete');
  assert.throws(
    () => campaign.transition(SCENE_IDS.APARTMENT, { spawn: 'wake' }),
    /Cannot transition from "initiation" to "apartment"/,
  );
});
