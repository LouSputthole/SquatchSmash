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
  DATE_MARGO_CALL,
  DAY_FOUR_LOU_HEIST_CALL,
  DAY_ONE_LOU_CALL,
  DAY_TWO_BOOSKI_CALL,
  DAY_TWO_LOU_SECOND_CALL,
  HEIST_CLEANUP_ITEMS,
  HEIST_PREPARATION_ITEMS,
  NEW_SPACE_LOU_CALL,
  NO_WAKE_LOU_CALL,
  SILVER_CASE_BOOSKI_CALL,
  createApartmentStory,
} from '../src/core/apartment-story.js';
import { createLuxuryApartmentStory } from '../src/core/luxury-apartment-story.js';
import { createAirstripStory } from '../src/core/airstrip-story.js';
import { createBankHeistStory } from '../src/core/bank-heist-story.js';
import { createCountrysideCabinStory } from '../src/core/countryside-cabin-story.js';
import {
  BADA_BING_TWO_CLEANUP_TASKS,
  createBadaBingTwoStory,
} from '../src/core/bada-bing-two-story.js';
import { createGraveyardStory } from '../src/core/graveyard-story.js';
import { createGolfStory } from '../src/core/golf-story.js';
import { createMotelStory } from '../src/core/motel-story.js';
import { createNoWakeStory } from '../src/core/no-wake-story.js';
import { createSilverStory } from '../src/core/silver-story.js';
import {
  createCartelPalaceCampaignStory,
  createEnolaSquatchCampaignStory,
  createMansionReturnCampaignStory,
  createMansionSiegeCampaignStory,
  createSilverCaseCampaignStory,
} from '../src/core/final-arc-story.js';
import { createSilentSquatchStory } from '../src/core/silent-squatch-story.js';
import { createSquatchfatherStory } from '../src/core/squatchfather-story.js';
import {
  completeCabinChapter,
  completeCabinVisitOne,
  completeCabinVisitTwo,
} from './helpers/complete-cabin-chapter.mjs';

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

/**
 * Do the chapter's own thing, the way the flat does it.
 *
 * Every chapter that sends him home now asks for one thing that is his rather
 * than the family's -- see CHAPTER_PASTIMES in core/apartment-story.js -- and
 * the door will not open until it is done. `src/main.js` ticks these through
 * `completeApartmentActivity`, which is `advanceTime` plus a flag, so that is
 * exactly what happens here: this route is the one test that proves the whole
 * campaign is walkable end to end, and a pastime with a missing time event or
 * an unreachable gate would wedge a player in his own living room.
 */
function pastime(campaign, activityId, timeEventId) {
  campaign.advanceTime(timeEventId, (state) => { state.activities[activityId] = true; });
  assert.equal(campaign.state.activities[activityId], true);
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
    [TIME_EVENT_IDS.PEE, 'peed'],
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

  /* BEAT 3'S EXIT. The driver takes him OUT OF TOWN, not home -- so this is
   * the last the starter flat sees of him until the Motel sends him back. */
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_CABIN_LAY_LOW);
  route(campaign, SCENE_IDS.COUNTRYSIDE_CABIN, 'arrival', 'cabin.html');

  /* BEATS 4 AND 5. He arrives in the small hours of Day Two, sleeps, wakes at
   * 09:20, answers Lou, walks all four corners of the property, dials the
   * number Margo wrote down, and then Booski rings about a Captain nearby. */
  let cabin = createCountrysideCabinStory({ campaign });
  assert.equal(cabin.phase(), 'arrival_rest');
  completeCabinVisitOne(cabin);
  assert.equal(campaign.state.story.day, 2,
    'the lay-low wakes him on Day Two, which is when the walks happen');
  assert.equal(cabin.visitOneComplete(), true);
  /* Booski's call at the cabin IS the Beef Run authorisation. If it stopped
   * marking the apartment's own event the aeroplane would refuse to start. */
  assert.equal(campaign.state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status, 'answered');

  /* The car only moves because the phone said so, and it goes to the strip. */
  assert.deepEqual(cabin.tryLeave(), {
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
  assert.equal(airstrip.complete({
    landingQuality: 'clean',
    rank: 'Airborne Butcher',
    unlocks: ['prospectFlightJacket', 'brushrunnerAccess', 'tammyDashboardMug', 'stoveBusinessCard'],
    packagesDelivered: 26,
    gunsDelivered: 3,
  }), true);

  /* BEAT 6 ENDS WHERE IT STARTED. Sasole runs him back to the property he was
   * collected from; a man laying low does not get driven to the flat he is
   * laying low from. */
  campaign.advanceTime(TIME_EVENT_IDS.RETURN_CABIN_FROM_AIRSTRIP);
  route(campaign, SCENE_IDS.COUNTRYSIDE_CABIN, 'arrival', 'cabin.html');

  campaign = reload(storage);
  /* The whole point of the reload: what the Beef Run's end card said you had
   * earned has to be here, on the way back to the cabin. Before the rewards
   * were recorded this record stopped at `landingQuality`, and the card's six
   * trophies existed only for as long as the card was on screen. */
  assert.deepEqual(campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING], {
    status: 'complete',
    checkpoint: 'landed_home',
    cargoLoaded: true,
    detected: true,
    landingQuality: 'clean',
    rank: 'Airborne Butcher',
    unlocks: ['prospectFlightJacket', 'brushrunnerAccess', 'tammyDashboardMug', 'stoveBusinessCard'],
    packagesDelivered: 26,
    gunsDelivered: 3,
  });
  /* BEAT 7. The dark half of the same cabin: a second night, Gratin's call,
   * the cellar, the two men in it, the pyre and the blackout. */
  cabin = createCountrysideCabinStory({ campaign });
  assert.equal(cabin.phase(), 'second_rest',
    'the aeroplane is down and he has been driven back; the night is next');
  completeCabinVisitTwo(cabin);

  /* THE CALENDAR, WHICH IS THE THING THE ANCHORS EXIST TO PROTECT. Nightfall
   * is Day Three 20:45 and the blackout ends Day Four 09:30. These read Day 5
   * and Day 6 while the cabin was a post-heist lay-low; had they been left
   * behind, `Math.max(now, atLeast)` would have thrown the clock two days
   * forward here rather than failing, and nothing would have said so. */
  assert.equal(campaign.state.story.day, 4,
    'the blackout ends on the morning of Day Four');
  assert.equal(cabin.chapterComplete(), true);
  /* Booski's summons at the cabin IS the come-back-to-the-Bing call. */
  assert.equal(campaign.state.events[EVENT_IDS.LOU_SECOND_CALL].status, 'answered');

  assert.deepEqual(cabin.tryLeave(), {
    kind: 'go', destination: SCENE_IDS.BADA_BING_TWO,
  });
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_CABIN_FOR_TOWN);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_TWO);
  route(campaign, SCENE_IDS.BADA_BING_TWO, 'driver_seat', 'bing.html?visit=2');

  const bingTwo = createBadaBingTwoStory({ campaign });
  assert.deepEqual(bingTwo.begin(), { ok: true, resumed: false, checkpoint: 'party' });
  assert.equal(bingTwo.recordAttack({ attackResolved: true }), true);
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

  /* BEAT 11 AND BEAT 11.5. The post-Motel reload proves THE TAKE opens only
   * after sleeping at home, and that the day it opens on is Day 5.
   *
   * Days 2 to 4 were spent out of the city -- the cabin, the Beef Run, the
   * dungeon -- so the first night he sleeps in his own bed is the fifth of
   * the story. `sleep()` treats the chapter table's day as a FLOOR for
   * exactly this reason: assigning it outright would wind the clock back two
   * days the moment he lay down. */
  campaign = reload(storage);
  apartment = createApartmentStory({ campaign, ring: () => true });
  assert.equal(campaign.state.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete');
  assert.deepEqual(apartment.sleep(), {
    ok: true, chapter: 'heist_day', day: 5, timeMinutes: 12 * 60,
  });
  assert.equal(apartment.callAnswered(DAY_FOUR_LOU_HEIST_CALL), true);
  /* One game with the boys, which in Counter-Squatch means losing five. */
  assert.equal(apartmentExit(apartment, campaign).id, 'playedCounterSquatch');
  pastime(campaign, 'playedCounterSquatch', TIME_EVENT_IDS.PLAY_COUNTER_SQUATCH);
  for (const item of HEIST_PREPARATION_ITEMS) {
    assert.equal(apartment.collectHeistPreparation(item.id), true);
  }
  assert.deepEqual(apartmentExit(apartment, campaign), {
    kind: 'go', destination: SCENE_IDS.BANK_HEIST,
  });
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_BANK_HEIST);
  assert.equal(campaign.state.story.day, 5, 'THE TAKE leaves on Day Five');
  route(campaign, SCENE_IDS.BANK_HEIST, 'safehouse', 'heist.html');

  const heist = createBankHeistStory({ campaign });
  assert.deepEqual(heist.begin(), { ok: true, resumed: false, checkpoint: null });
  assert.equal(heist.checkpoint('safehouse_ready'), true);
  assert.equal(heist.checkpoint('bank_secured', { guardsDisarmed: 2 }), true);
  assert.equal(heist.checkpoint('vault_open', { bagsStaged: 8 }), true);
  assert.equal(heist.checkpoint('street_withdrawal', { policeHeat: 61 }), true);
  assert.equal(heist.checkpoint('mercer_garage', {
    bagsRecovered: 7,
    crewInjuries: { rippinflow: 'moderate' },
  }), true);
  assert.equal(heist.checkpoint('vehicle_swap', {
    playerDroveEscape: true, vehicleDamage: 41,
  }), true);
  assert.equal(heist.complete({
    bagsRecovered: 7,
    grossTake: 1_260_000,
    followedSnow: true,
    disciplinedFire: true,
  }), true);
  route(campaign, SCENE_IDS.APARTMENT, 'front_door', 'index.html');

  /* BEAT 12. Home after dark on Day 5, and the flat's last evening: wash the
   * job off, and then Lou rings about a new space. The call that used to
   * stand here was "three holes, home by half ten, after that your day
   * starts" -- an invitation that only makes sense before a bank job, which
   * is now behind him. */
  campaign = reload(storage);
  assert.equal(campaign.state.story.chapter, 'post_heist');
  assert.equal(campaign.state.story.day, 5);
  assert.equal(campaign.state.story.timeMinutes, 18 * 60 + 50);
  apartment = createApartmentStory({ campaign, ring: () => true });
  for (const item of HEIST_CLEANUP_ITEMS) {
    assert.equal(apartment.completeHeistCleanup(item.id), true);
  }
  assert.equal(apartmentExit(apartment, campaign).id, EVENT_IDS.LOU_GOLF_CALL);
  assert.equal(apartment.callAnswered(NEW_SPACE_LOU_CALL), true);
  assert.equal(apartmentExit(apartment, campaign).kind, 'stay',
    'the course is in the morning; the answer tonight is bed');

  /* BEAT 13. Sleeping off THE TAKE turns the page to the round. */
  assert.deepEqual(apartment.sleep(), {
    ok: true, chapter: 'golf_morning', day: 6, timeMinutes: 7 * 60,
  });
  /* Lou is about to hand him a club in front of people. Warm the eye up. */
  assert.equal(apartmentExit(apartment, campaign).id, 'playedSquatchShoot');
  pastime(campaign, 'playedSquatchShoot', TIME_EVENT_IDS.PLAY_SQUATCH_SHOOT);
  assert.deepEqual(apartmentExit(apartment, campaign), {
    kind: 'go', destination: SCENE_IDS.SILVER_PINES,
  });
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_PINES);
  route(campaign, SCENE_IDS.SILVER_PINES, 'car_park', 'golf.html');

  const golf = createGolfStory({ campaign });
  assert.deepEqual(golf.begin(), { ok: true, resumed: false, unrouted: false });
  assert.equal(golf.recordHole({
    hole: 1, par: 3, strokes: 4, heardInvitation: true, rodeWithLou: true,
  }), true);
  assert.equal(golf.recordHole({
    hole: 2, par: 5, strokes: 6, foundWater: true,
  }), true);
  assert.equal(golf.recordHole({
    hole: 3, par: 4, strokes: 5, hitGreenInRegulation: true,
  }), true);
  assert.equal(golf.complete(), true);

  /* BEAT 14. THE STARTER FLAT GOES DARK HERE. He is not driven home from the
   * eighteenth green; he is driven to a new address, and the campaign never
   * routes back to the old one. */
  campaign.advanceTime(TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT);
  route(campaign, SCENE_IDS.LUXURY_APARTMENT, 'arrival', 'luxury-apartment.html');

  campaign = reload(storage);
  assert.equal(campaign.state.story.chapter, 'luxury_apartment');
  assert.equal(campaign.state.story.day, 6);
  assert.equal(campaign.state.story.timeMinutes, 11 * 60 + 45);
  assert.equal(campaign.state.missions[MISSION_IDS.SILVER_PINES].status, 'complete');
  assert.equal(campaign.state.missions[MISSION_IDS.SILVER_PINES].holesPlayed, 3);

  let luxury = createLuxuryApartmentStory({ campaign });
  assert.equal(luxury.arrived(), true);
  assert.equal(luxury.phase(), 'get_ready');
  assert.equal(
    luxury.tryLeave().id,
    TIME_EVENT_IDS.LUXURY_GET_READY,
    'the bible\'s beat-14 objective gates the door',
  );
  assert.deepEqual(luxury.completeGetReady(), { ok: true });
  assert.equal(luxury.tryLeave().id, EVENT_IDS.MARGO_DATE_CALL);
  assert.equal(luxury.callAnswered(DATE_MARGO_CALL), true);
  assert.deepEqual(luxury.tryLeave(), {
    kind: 'go', destination: SCENE_IDS.SILVER_ROOM,
  });

  /* BEAT 15. Half seven on the evening of Day 6, for a nine o'clock table. */
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_ROOM);
  assert.equal(campaign.state.story.day, 6);
  assert.equal(campaign.state.story.timeMinutes, 19 * 60 + 30);
  route(campaign, SCENE_IDS.SILVER_ROOM, 'kerb', 'silver.html');
  const silver = createSilverStory({ campaign });
  assert.deepEqual(silver.begin(), { ok: true, resumed: false });
  assert.equal(silver.complete({
    outcome: 'strong', woo: 74, band: 'midnight_pines', tippedEverybody: true,
    rememberedDrink: true, seeingHerAgain: true, cameHome: true,
    date: { knowsWhatHeDoes: true },
  }), true);
  /* And she comes home WITH HIM, to the flat he was given this morning. */
  route(campaign, SCENE_IDS.LUXURY_APARTMENT, 'main', 'luxury-apartment.html');

  /* BEATS 16 AND 17. The night, and the morning that ends it. */
  campaign = reload(storage);
  luxury = createLuxuryApartmentStory({ campaign });
  assert.equal(luxury.phase(), 'come_home');
  assert.equal(luxury.margoComeHomeOwed(), true);
  assert.deepEqual(luxury.sleep(), { ok: false, reason: 'margo_still_arriving' });
  assert.equal(luxury.margoComeHomeDone(), true);
  assert.deepEqual(luxury.sleep(), { ok: true, day: 7, timeMinutes: 7 * 60 + 10 });
  assert.equal(luxury.margoWakeOwed(), true);
  assert.equal(luxury.margoWakeDone(), true);

  /* BEAT 18. Nothing criminal rang all night; it rings once she has gone. */
  assert.equal(luxury.phase(), 'no_wake');
  assert.equal(luxury.tryLeave().id, EVENT_IDS.LOU_NO_WAKE_CALL);
  assert.equal(luxury.callAnswered(NO_WAKE_LOU_CALL), true);
  assert.deepEqual(luxury.tryLeave(), { kind: 'go', destination: SCENE_IDS.NO_WAKE });
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_NO_WAKE);
  assert.equal(campaign.state.story.day, 7, 'the harbour job is Day Seven');
  assert.equal(campaign.state.story.timeMinutes, 12 * 60 + 45);
  route(campaign, SCENE_IDS.NO_WAKE, 'gate_c', 'nowake.html');
  const noWake = createNoWakeStory({ campaign });
  assert.deepEqual(noWake.begin(), { ok: true, resumed: false });
  assert.equal(noWake.complete({
    betrayalConfirmed: true, playerFired: true, bodyDisposed: true,
  }), true);
  campaign.advanceTime(TIME_EVENT_IDS.RETURN_LUXURY_APARTMENT);
  route(campaign, SCENE_IDS.LUXURY_APARTMENT, 'main', 'luxury-apartment.html');

  /* BEAT 19, AND THE DOORWAY THE POST-HEIST CABIN USED TO HOLD OPEN.
   *
   * `SCENES[COUNTRYSIDE_CABIN].next` no longer names the Silver Case: this is
   * the only reachable entry to the last third of the game now, which is what
   * made it safe to take the cabin's away. Add first, remove last. */
  campaign = reload(storage);
  luxury = createLuxuryApartmentStory({ campaign });
  assert.equal(luxury.phase(), 'return');
  assert.equal(campaign.state.story.day, 7);
  assert.equal(campaign.state.story.timeMinutes, 17 * 60 + 20);
  assert.equal(luxury.tryLeave().id, EVENT_IDS.BOOSKI_SILVER_CASE_CALL);
  assert.equal(luxury.callAnswered(SILVER_CASE_BOOSKI_CALL), true);
  assert.deepEqual(luxury.tryLeave(), {
    kind: 'go', destination: SCENE_IDS.SILVER_CASE,
  });

  route(campaign, SCENE_IDS.SILVER_CASE, 'car_ride', 'silvercase.html');
  const silverCase = createSilverCaseCampaignStory({ campaign });
  assert.deepEqual(silverCase.begin(), { ok: true, resumed: false });
  assert.equal(silverCase.checkpoint('case_reveal'), true);
  assert.equal(silverCase.checkpoint('bathroom_ambush'), true);
  assert.equal(silverCase.complete({
    winstonOutcome: 'spared',
    irritatedApe: false,
  }), true);

  campaign = reload(storage);
  route(campaign, SCENE_IDS.MANSION, 'gate', 'mansion.html');
  const silentSquatch = createSilentSquatchStory({ campaign });
  assert.equal(silentSquatch.begin().ok, true);
  assert.equal(silentSquatch.checkpoint('office'), true);
  assert.equal(silentSquatch.checkpoint('lab'), true);
  assert.equal(silentSquatch.checkpoint('silent_night'), true);
  assert.equal(silentSquatch.complete({
    case: { placedOnDesk: true, delivered: true },
    keypad: { locked: true },
    aubbie: { killed: true },
    gasStages: ['armed', 'released'],
    collapsed: ['scientist_2', 'scientist_3'],
  }), true);
  assert.deepEqual(silentSquatch.restAtMansion(), {
    ok: true, chapter: 'mansion_siege',
  });

  campaign = reload(storage);
  route(campaign, SCENE_IDS.MANSION_SIEGE, 'guest_suite', 'mansion-siege.html');
  const mansionSiege = createMansionSiegeCampaignStory({ campaign });
  assert.deepEqual(mansionSiege.begin(), { ok: true, resumed: false });
  assert.equal(mansionSiege.checkpoint('armed', { littleFriendSaid: true }), true);
  assert.equal(mansionSiege.checkpoint('wave_one', {
    attackersDown: 8,
    sasoleMet: true,
  }), true);
  assert.equal(mansionSiege.complete({ attackersDown: 8 }), true);

  campaign = reload(storage);
  route(campaign, SCENE_IDS.ENOLA_SQUATCH, 'airfield', 'enolasquatch.html');
  const enola = createEnolaSquatchCampaignStory({ campaign });
  assert.deepEqual(enola.begin(), { ok: true, resumed: false });
  assert.equal(enola.checkpoint('takeoff'), true);
  assert.equal(enola.checkpoint('preRelease', { payloadReleased: true }), true);
  assert.equal(enola.checkpoint('return'), true);
  assert.equal(enola.complete({
    rank: 'A',
    score: 0.915,
    unlocks: ['precision_release'],
    payloadReleased: true,
    returnedHome: true,
  }), true);

  campaign = reload(storage);
  route(campaign, SCENE_IDS.MANSION_RETURN, 'driveway', 'mansion.html?visit=return');
  const mansionReturn = createMansionReturnCampaignStory({ campaign });
  assert.deepEqual(mansionReturn.begin(), { ok: true, resumed: false });
  assert.equal(mansionReturn.complete({
    wrongCityConfirmed: true,
    sauceMissingConfirmed: true,
    palaceLocationKnown: true,
  }), true);

  campaign = reload(storage);
  route(campaign, SCENE_IDS.CARTEL_PALACE, 'approach', 'cartel-palace.html');
  const cartelPalace = createCartelPalaceCampaignStory({ campaign });
  assert.deepEqual(cartelPalace.begin(), { ok: true, resumed: false });
  assert.equal(cartelPalace.checkpoint('betrayal', {
    evidenceFound: ['photograph'],
    sauceBetrayalConfirmed: true,
  }), true);
  assert.equal(cartelPalace.checkpoint('clear', {
    markEliminated: true,
    sauceEliminated: true,
  }), true);
  assert.equal(cartelPalace.complete({ outcome: 'clean' }), true);

  /* Palace returns home for Act One: the call, getting ready, refused door and
   * headlights. Only the Apartment front door reaches the kerb, and the
   * Special Meeting then hands off at the treeline. */
  route(campaign, SCENE_IDS.APARTMENT, 'front_door', 'index.html');
  assert.equal(campaign.state.missions[MISSION_IDS.INITIATION].status, 'available');
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_SPECIAL_MEETING);
  route(campaign, SCENE_IDS.SPECIAL_MEETING, 'kerb', 'specialmeeting.html');
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING);

  campaign.advanceTime(TIME_EVENT_IDS.DEPART_INITIATION, (state) => {
    state.missions[MISSION_IDS.INITIATION].status = 'in_progress';
  });
  route(campaign, SCENE_IDS.INITIATION, 'gathering', 'initiation.html');

  // The current Initiation build is still the frozen, owner-gated scene: it is
  // entered through the story and arrives in progress, not complete. (Its
  // completion and temporary exit are exercised below, after these assertions
  // pin the arrival state.)
  campaign = reload(storage);
  assert.equal(campaign.state.events[EVENT_IDS.LOU_HEIST_CALL].status, 'answered');
  assert.equal(campaign.state.missions[MISSION_IDS.BANK_HEIST].status, 'complete');
  for (const missionId of [
    MISSION_IDS.SILVER_CASE,
    MISSION_IDS.SILENT_SQUATCH,
    MISSION_IDS.MANSION_SIEGE,
    MISSION_IDS.ENOLA_SQUATCH,
    MISSION_IDS.MANSION_RETURN,
    MISSION_IDS.CARTEL_PALACE,
  ]) {
    assert.equal(campaign.state.missions[missionId].status, 'complete');
  }
  assert.deepEqual(campaign.state.scene, { id: SCENE_IDS.INITIATION, spawn: 'gathering' });
  assert.equal(campaign.state.missions[MISSION_IDS.INITIATION].status, 'in_progress');
  assert.notEqual(campaign.state.missions[MISSION_IDS.INITIATION].status, 'complete');
  /* Day 10, twenty to one in the morning.
   *
   * It read Day 8 before the Act-One cabin, and the two days it gained are
   * exactly the two the cabin now takes -- the lay-low and the dungeon. The
   * TIME of it has not moved at all, and that is the part worth holding: the
   * Palace finishes late; the phone call, getting changed and going down to a
   * car already running is thirty-five minutes (DEPART_SPECIAL_MEETING); the
   * drive, the spur, the boot and the walk in is sixty-five
   * (COMPLETE_SPECIAL_MEETING). `DEPART_INITIATION` is anchored at Day 4 19:00
   * and absorbs nothing this late -- it is pure carry. The ceremony starting
   * after midnight is the point of it. */
  assert.equal(campaign.state.story.day, 10);
  assert.equal(campaign.state.story.timeMinutes, 40);
  for (const eventId of [
    /* The luxury apartment's four visits, each with its own marker. */
    TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT,
    TIME_EVENT_IDS.LUXURY_GET_READY,
    TIME_EVENT_IDS.LUXURY_MARGO_COME_HOME,
    TIME_EVENT_IDS.LUXURY_STAYOVER_REST,
    TIME_EVENT_IDS.LUXURY_MARGO_WAKE,
    TIME_EVENT_IDS.RETURN_LUXURY_APARTMENT,
    TIME_EVENT_IDS.CABIN_LOU_OPENING_CALL,
    TIME_EVENT_IDS.CABIN_GRATIN_CALL,
    TIME_EVENT_IDS.CABIN_DUNGEON_ENTERED,
    TIME_EVENT_IDS.CABIN_NIGHTFALL,
    TIME_EVENT_IDS.CABIN_BLACKOUT,
    TIME_EVENT_IDS.CABIN_MORNING_WAKE_COMPLETE,
    TIME_EVENT_IDS.DEPART_SILVER_CASE,
    TIME_EVENT_IDS.COMPLETE_SILVER_CASE,
    TIME_EVENT_IDS.DEPART_MANSION,
    TIME_EVENT_IDS.COMPLETE_SILENT_SQUATCH,
    TIME_EVENT_IDS.REST_AT_MANSION,
    TIME_EVENT_IDS.COMPLETE_MANSION_SIEGE,
    TIME_EVENT_IDS.DEPART_ENOLA_SQUATCH,
    TIME_EVENT_IDS.COMPLETE_ENOLA_SQUATCH,
    TIME_EVENT_IDS.RETURN_TO_MANSION,
    TIME_EVENT_IDS.COMPLETE_MANSION_RETURN,
    TIME_EVENT_IDS.DEPART_CARTEL_PALACE,
    TIME_EVENT_IDS.COMPLETE_CARTEL_PALACE,
  ]) {
    assert.equal(campaign.state.story.timeEvents.includes(eventId), true, eventId);
  }
  assert.equal(
    campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.CABIN_REST),
    false,
    'the legacy Cabin sleep marker cannot substitute for the dungeon chapter',
  );
  /* AND THE POST-HEIST LAY-LOW IS NOT ON THE ROUTE AT ALL ANY MORE. Beat 19
   * took the Silver Case doorway, so nothing reads Lou's lay-low message and
   * nothing drives north after the bank. Asserted rather than assumed: these
   * two markers were on the walked route until this commit. */
  for (const eventId of [
    TIME_EVENT_IDS.PHONE_READ_CABIN,
    TIME_EVENT_IDS.DEPART_COUNTRYSIDE_CABIN,
  ]) {
    assert.equal(campaign.state.story.timeEvents.includes(eventId), false, eventId);
  }
  /* Gap G1 minimal relief: the anointing writes COMPLETE_INITIATION exactly
   * once and the end card has ONE temporary edge home, so no save can be
   * trapped in a terminal scene. The owner-gated rewrite replaces this exit
   * with the real one; when it does, this block moves with it. */
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_INITIATION, (state) => {
    state.missions[MISSION_IDS.INITIATION].status = 'complete';
  });
  const repeat = campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_INITIATION);
  assert.equal(repeat.applied, false, 'a replayed ceremony must not farm hours');
  route(campaign, SCENE_IDS.APARTMENT, 'front_door', 'index.html');

  campaign = reload(storage);
  assert.equal(campaign.state.missions[MISSION_IDS.INITIATION].status, 'complete');
  assert.equal(
    campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.COMPLETE_INITIATION),
    true,
  );
  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.APARTMENT,
    spawn: 'front_door',
  });
});
