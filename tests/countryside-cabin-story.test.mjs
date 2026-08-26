import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  CABIN_HOSTAGE_HIT_EVENTS,
  CABIN_HOSTAGE_IDS,
  CABIN_HOSTAGE_MAX_HITS,
  COUNTRYSIDE_CABIN_LANDMARKS,
  createCountrysideCabinStory,
} from '../src/core/countryside-cabin-story.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

/**
 * THE ACT-ONE CABIN, ARRIVED AT THE WAY THE CAMPAIGN ARRIVES AT IT.
 *
 * The Squatchfather ends near midnight on Day 1 and the same driver goes
 * straight out of the city, so this fixture is a man getting out of a car at
 * two in the morning with a bag -- not a man who has just robbed a bank.
 *
 * `silverCase` is still a parameter because the post-heist route survives for
 * saves that took it, and `tryLeave` still answers them.
 */
function cabinCampaign({ silverCase = 'locked', legacyEvents = [] } = {}) {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.scene = { id: SCENE_IDS.SQUATCHFATHER, spawn: 'restaurant_exterior' };
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.missions[MISSION_IDS.SILVER_CASE].status = silverCase;
    state.story.timeEvents.push(...legacyEvents);
  });
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_CABIN_LAY_LOW, (state) => {
    state.scene = { id: SCENE_IDS.COUNTRYSIDE_CABIN, spawn: 'arrival' };
  });
  return { campaign, storage };
}

/** Everything up to and including the bed he falls into on arrival. */
function afterArrivalRest(campaign) {
  const story = createCountrysideCabinStory({ campaign });
  story.completeArrivalRest();
  return story;
}

function reloadStory(storage) {
  return createCountrysideCabinStory({ campaign: createCampaign({ storage }) });
}

/**
 * The whole of visit one, the flight, and the night that follows it -- which
 * is what beat 7 costs to reach now. The Beef Run is marked complete rather
 * than flown; this file is about the cabin, and the airstrip has its own.
 */
function reachDungeon(story) {
  story.completeArrivalRest();
  story.completeOpeningCall();
  for (const { id } of COUNTRYSIDE_CABIN_LANDMARKS) story.visit(id);
  story.completeMargoCall();
  story.completeBooskiSasoleCall();
  story.campaign.update((state) => {
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'complete';
  });
  story.recordReturnFromAirstrip();
  story.completeSecondRest();
  story.completeGratinCall();
  story.openCellar();
  story.enterDungeon();
  return story;
}

function finishInterrogations(story) {
  story.hitHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER, { hits: 2 });
  story.hitHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER, { hits: 6 });
  story.learnAteamIntel();
  return story;
}

test('Cabin arrival, the bed, and the opening call use exact-once Day 2 timing', () => {
  const { campaign, storage } = cabinCampaign();
  const story = createCountrysideCabinStory({ campaign });

  /* The restaurant ends at 03:00 on Day 2 and the county road is two hours
   * and twenty minutes of it, so he gets out of the car at 05:20. */
  assert.equal(campaign.state.story.day, 2);
  assert.equal(campaign.state.story.timeMinutes, 5 * 60 + 20);
  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.COUNTRYSIDE_CABIN,
    spawn: 'arrival',
  });
  assert.equal(campaign.state.story.timeEvents.filter(
    (id) => id === TIME_EVENT_IDS.DEPART_CABIN_LAY_LOW,
  ).length, 1);

  /* THE BED COMES FIRST, AND LOU'S CALL WILL NOT HAPPEN WITHOUT IT. Nobody
   * rings a man at half past five in the morning to tell him to relax. */
  assert.deepEqual(story.completeOpeningCall(), {
    ok: false, reason: 'arrival_rest_incomplete',
  });
  assert.equal(story.phase(), 'arrival_rest');
  const rest = story.completeArrivalRest();
  assert.equal(rest.applied, true);
  assert.equal(rest.day, 2);
  assert.equal(rest.timeMinutes, 9 * 60 + 20, 'the lay-low wakes him at 09:20');

  assert.deepEqual(story.completeOpeningCall(), {
    ok: true,
    firstTime: true,
    applied: true,
    day: 2,
    timeMinutes: 9 * 60 + 23,
    minutesAdvanced: 3,
  });

  const afterFirst = structuredClone(campaign.state);
  assert.equal(story.completeOpeningCall().firstTime, false);
  assert.deepEqual(campaign.state, afterFirst);
  assert.equal(reloadStory(storage).openingCallComplete(), true);

  const repeatedTravel = campaign.advanceTime(TIME_EVENT_IDS.DEPART_CABIN_LAY_LOW);
  assert.equal(repeatedTravel.applied, false);
  assert.equal(repeatedTravel.minutesAdvanced, 0);
  assert.deepEqual(campaign.state, afterFirst);
});

test('Lou must finish the opening call before exploration or the Margo handoff can progress', () => {
  const { campaign } = cabinCampaign();
  const story = afterArrivalRest(campaign);

  assert.deepEqual(story.visit('creek'), {
    ok: false,
    reason: 'opening_call_incomplete',
  });
  assert.equal(story.explorationCount(), 0);
  assert.equal(story.margoReady(), false);
  assert.deepEqual(story.consumeMargoReady(), {
    ok: false,
    reason: 'opening_call_incomplete',
  });

  story.completeOpeningCall();
  assert.equal(story.visit('creek').firstVisit, true);
  assert.equal(story.margoReady(), true);
});

test('the range replaces the firepit in four durable exploration goals', () => {
  assert.deepEqual(
    COUNTRYSIDE_CABIN_LANDMARKS.map(({ id }) => id),
    ['creek', 'overlook', 'shed', 'range'],
  );

  const { campaign, storage } = cabinCampaign();
  const story = afterArrivalRest(campaign);
  story.completeOpeningCall();
  const before = campaign.state.story.timeMinutes;
  const first = story.visit('range');
  assert.equal(first.firstVisit, true);
  assert.equal(first.timeMinutes, before + 15);
  assert.equal(story.visit('range').firstVisit, false);
  assert.equal(campaign.state.story.timeEvents.filter(
    (id) => id === TIME_EVENT_IDS.CABIN_EXPLORE_RANGE,
  ).length, 1);
  assert.deepEqual(reloadStory(storage).explored().map(({ id }) => id), ['range']);

  const legacy = cabinCampaign({ legacyEvents: [TIME_EVENT_IDS.CABIN_EXPLORE_FIREPIT] });
  const legacyStory = createCountrysideCabinStory({ campaign: legacy.campaign });
  const legacyBefore = structuredClone(legacy.campaign.state);
  assert.deepEqual(legacyStory.explored().map(({ id }) => id), ['range']);
  assert.equal(legacyStory.visit('range').firstVisit, false);
  assert.equal(legacyStory.has(TIME_EVENT_IDS.CABIN_EXPLORE_RANGE), false);
  assert.deepEqual(legacy.campaign.state, legacyBefore);
  assert.equal(legacyStory.objectives().find(({ id }) => id === 'range').done, true);
});

test('the four walks lead to Margo and Booski, and Gratin waits for the second night', () => {
  const { campaign, storage } = cabinCampaign();
  let story = afterArrivalRest(campaign);

  assert.equal(story.basementVisible(), false);
  assert.deepEqual(story.consumeMargoReady(), { ok: false, reason: 'opening_call_incomplete' });
  assert.deepEqual(story.completeGratinCall(), {
    ok: false,
    reason: 'opening_call_incomplete',
  });
  story.completeOpeningCall();
  story.visit('creek');
  assert.equal(story.explorationCount(), 1);
  assert.equal(story.margoReady(), true);
  assert.equal(story.consumeMargoReady().firstTime, true);
  assert.equal(story.margoReady(), false);
  assert.equal(story.consumeMargoReady().firstTime, false);
  story.visit('creek');
  assert.equal(story.explorationCount(), 1, 'a repeat walk cannot unlock anything');

  /* THE BIBLE COUNTS FOUR WALKS, SO THE CALL COUNTS FOUR WALKS. */
  assert.deepEqual(story.completeMargoCall(), { ok: false, reason: 'explore_first' });
  for (const { id } of COUNTRYSIDE_CABIN_LANDMARKS) story.visit(id);
  assert.equal(story.propertyWalked(), true);
  assert.deepEqual(story.completeBooskiSasoleCall(), {
    ok: false, reason: 'margo_call_incomplete',
  });
  assert.equal(story.completeMargoCall().firstTime, true);
  assert.equal(story.completeBooskiSasoleCall().firstTime, true);
  assert.equal(story.visitOneComplete(), true);

  /* And Gratin still does not ring, because the aeroplane has not flown. */
  assert.equal(story.gratinCallReady(), false);
  assert.deepEqual(story.completeGratinCall(), {
    ok: false, reason: 'second_visit_not_ready',
  });
  story.recordReturnFromAirstrip();
  story.completeSecondRest();

  story = reloadStory(storage);
  assert.equal(story.gratinCallReady(), true);
  assert.equal(story.completeGratinCall().firstTime, true);
  assert.equal(story.completeGratinCall().firstTime, false);
  assert.equal(story.basementVisible(), true);
  assert.equal(story.phase(), 'open_cellar');
  for (const landmark of COUNTRYSIDE_CABIN_LANDMARKS) {
    assert.equal(
      story.objectives().find(({ id }) => id === landmark.id).required,
      false,
      `${landmark.id} should become optional once the dungeon is primary`,
    );
  }
});

test('cellar and dungeon order is guarded and survives reload', () => {
  const { campaign, storage } = cabinCampaign();
  let story = createCountrysideCabinStory({ campaign });

  assert.deepEqual(story.openCellar(), { ok: false, reason: 'basement_hidden' });
  reachDungeon(story);
  assert.equal(story.cellarOpen(), true);
  assert.equal(story.dungeonEntered(), true);
  assert.equal(story.phase(), 'interrogation');
  assert.equal(story.openCellar().firstTime, false);
  assert.equal(story.enterDungeon().firstTime, false);

  story = reloadStory(storage);
  assert.equal(story.basementVisible(), true);
  assert.equal(story.cellarOpen(), true);
  assert.equal(story.dungeonEntered(), true);
  assert.equal(story.phase(), 'interrogation');
  assert.deepEqual(story.hitHostage('not_a_hostage'), {
    ok: false,
    reason: 'unknown_hostage',
  });
});

test('interrogation stops at 2/6 while all eight durability slots persist for pistol damage', () => {
  const { campaign, storage } = cabinCampaign();
  let story = reachDungeon(createCountrysideCabinStory({ campaign }));

  let damage = story.hitHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER, { hits: 4 });
  assert.equal(damage.hitsApplied, 2, 'torture damage caps at the baiter threshold');
  assert.equal(damage.hostage.threshold, 2);
  assert.equal(damage.hostage.interrogationReady, true);
  assert.equal(damage.hostage.health, 6);
  const stoppedBaiter = structuredClone(story.campaign.state);
  assert.equal(
    story.hitHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).reason,
    'interrogation_ready',
  );
  assert.deepEqual(story.campaign.state, stoppedBaiter);

  damage = story.hitHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER, { hits: 5 });
  assert.equal(damage.hostage.hits, 5);
  assert.equal(damage.hostage.interrogationReady, false);
  assert.deepEqual(story.learnAteamIntel(), {
    ok: false,
    reason: 'interrogation_incomplete',
  });
  damage = story.hitHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER, { hits: 4 });
  assert.equal(damage.hitsApplied, 1, 'torture damage caps at the A-Team threshold');
  assert.equal(damage.hostage.threshold, 6);
  assert.equal(damage.hostage.interrogationReady, true);
  assert.equal(damage.hostage.health, 2);

  story = reloadStory(storage);
  const counterStrike = story.hostageState(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER);
  const ateam = story.hostageState(CABIN_HOSTAGE_IDS.ATEAM_MEMBER);
  assert.equal(counterStrike.maxHits, CABIN_HOSTAGE_MAX_HITS);
  assert.equal(ateam.maxHits, CABIN_HOSTAGE_MAX_HITS);
  assert.equal(counterStrike.hits, 2);
  assert.equal(counterStrike.health, 6);
  assert.equal(ateam.hits, 6);
  assert.equal(ateam.health, 2);
  assert.equal(story.interrogationComplete(), true);
  assert.equal(story.damageHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).reason,
    'execution_not_chosen');
  assert.equal(story.learnAteamIntel().firstTime, true);
  assert.equal(story.learnAteamIntel().firstTime, false);
  story.chooseExecution('player');
  assert.equal(story.damageHostage(
    CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER,
    { hits: 4 },
  ).hostage.health, 2);
  story = reloadStory(storage);
  assert.equal(story.hostageState(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).health, 2);
  assert.equal(story.damageHostage(
    CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER,
    { hits: 4 },
  ).hostage.health, 0);
  assert.equal(story.damageHostage(
    CABIN_HOSTAGE_IDS.ATEAM_MEMBER,
    { hits: 4 },
  ).hostage.health, 0);
  for (const hitEvents of Object.values(CABIN_HOSTAGE_HIT_EVENTS)) {
    assert.equal(hitEvents.length, 8);
    for (const eventId of hitEvents) {
      assert.equal(story.campaign.state.story.timeEvents.filter((id) => id === eventId).length, 1);
    }
  }
  assert.equal(reloadStory(storage).ateamIntelLearned(), true);
});

test('player execution branch is mutually exclusive and cleanup state reloads', () => {
  const { campaign, storage } = cabinCampaign();
  let story = finishInterrogations(reachDungeon(createCountrysideCabinStory({ campaign })));

  assert.deepEqual(story.killHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).reason,
    'execution_not_chosen');
  assert.equal(story.chooseExecution('player').choice, 'player');
  assert.equal(story.chooseExecution('gratin').choice, 'player');
  assert.equal(story.has(TIME_EVENT_IDS.CABIN_EXECUTION_PLAYER), true);
  assert.equal(story.has(TIME_EVENT_IDS.CABIN_EXECUTION_GRATIN), false);

  story = reloadStory(storage);
  assert.equal(story.executionChoice(), 'player');
  assert.equal(story.chooseExecution('timeout').choice, 'player');
  assert.equal(story.killHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).reason,
    'hostage_not_depleted');
  story.damageHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER, { hits: 4 });
  story.damageHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER, { hits: 4 });
  story.damageHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER, { hits: 4 });
  assert.equal(story.killHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).firstTime, true);
  assert.equal(story.killHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER).firstTime, true);
  assert.equal(story.deathsComplete(), true);
  assert.equal(story.phase(), 'nightfall');
  assert.equal(story.wrapHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).reason,
    'nightfall_not_reached');
  assert.equal(story.completeNightfall().firstTime, true);
  assert.equal(story.completeNightfall().firstTime, false);
  assert.equal(story.campaign.state.story.timeEvents.filter(
    (id) => id === TIME_EVENT_IDS.CABIN_NIGHTFALL,
  ).length, 1);
  story = reloadStory(storage);
  assert.equal(story.phase(), 'wrap_bodies');
  assert.equal(story.wrapHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).firstTime, true);
  assert.equal(story.wrapHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER).firstTime, true);
  assert.equal(story.wrappingComplete(), true);
  assert.equal(story.moveBodyToFire(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).firstTime, true);
  story = reloadStory(storage);
  assert.equal(story.bodyAtFire(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER), true);
  assert.equal(story.bodyAtFire(CABIN_HOSTAGE_IDS.ATEAM_MEMBER), false);
  assert.equal(story.moveBodyToFire(CABIN_HOSTAGE_IDS.ATEAM_MEMBER).firstTime, true);
  assert.equal(story.stageBodies().firstTime, true);
  assert.equal(story.stageBodies().firstTime, false);

  story = reloadStory(storage);
  assert.equal(story.hostageState(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).dead, true);
  assert.equal(story.hostageState(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).wrapped, true);
  assert.equal(story.hostageState(CABIN_HOSTAGE_IDS.ATEAM_MEMBER).dead, true);
  assert.equal(story.hostageState(CABIN_HOSTAGE_IDS.ATEAM_MEMBER).wrapped, true);
  assert.equal(story.bodiesStaged(), true);
  assert.equal(story.bodyAtFire(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER), true);
  assert.equal(story.bodyAtFire(CABIN_HOSTAGE_IDS.ATEAM_MEMBER), true);
  assert.equal(story.phase(), 'pour_gas');
  assert.equal(story.objectives().some(({ label }) => /unmask|mole/i.test(label)), false);
  assert.equal(story.objectives().find(
    ({ id }) => id === TIME_EVENT_IDS.CABIN_ATEAM_INTEL_LEARNED,
  ).label, 'Learn what the A-Team member knows');
});

test('no response, explicit no, and timeout all choose Gratin', async (t) => {
  for (const [name, choice] of [
    ['no response', undefined],
    ['explicit no', 'no'],
    ['timeout', 'timeout'],
  ]) {
    await t.test(name, () => {
      const { campaign, storage } = cabinCampaign();
      const story = finishInterrogations(reachDungeon(createCountrysideCabinStory({ campaign })));
      const result = story.chooseExecution(choice);
      assert.equal(result.choice, 'gratin');
      assert.equal(result.firstTime, true);
      assert.equal(story.has(TIME_EVENT_IDS.CABIN_EXECUTION_GRATIN), true);
      assert.equal(story.has(TIME_EVENT_IDS.CABIN_EXECUTION_PLAYER), false);
      assert.equal(reloadStory(storage).executionChoice(), 'gratin');
    });
  }
});

test('nightfall, blackout, morning call, and departure are reload-safe authored times', () => {
  const { campaign, storage } = cabinCampaign();
  let story = finishInterrogations(reachDungeon(createCountrysideCabinStory({ campaign })));
  story.chooseExecution('player');
  story.damageHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER, { hits: 4 });
  story.damageHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER, { hits: 4 });
  story.damageHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER, { hits: 4 });
  story.killHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER);
  story.killHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER);

  assert.equal(story.tryLeave().id, 'cabin_chapter_incomplete');
  assert.equal(story.completeFireCleanup().reason, 'bonfire_not_ignited');
  const nightfall = story.completeNightfall();
  assert.equal(nightfall.firstTime, true);
  assert.equal(nightfall.day, 3);
  assert.equal(nightfall.timeMinutes, 20 * 60 + 45);
  assert.equal(story.completeNightfall().minutesAdvanced, 0);
  story.wrapHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER);
  story.wrapHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER);
  assert.equal(story.pourGas().reason, 'bodies_not_at_fire');
  assert.equal(story.moveBodyToFire(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).firstTime, true);
  assert.equal(story.moveBodyToFire(CABIN_HOSTAGE_IDS.ATEAM_MEMBER).firstTime, true);
  assert.equal(story.pourGas().firstTime, true);
  assert.equal(story.pourGas().firstTime, false);
  assert.equal(story.igniteBonfire().firstTime, true);
  assert.equal(story.igniteBonfire().firstTime, false);
  const fire = story.completeFireCleanup();
  assert.equal(fire.firstTime, true);
  assert.equal(fire.day, 3);
  assert.equal(fire.timeMinutes, 21 * 60 + 4);
  assert.equal(story.completeFireCleanup().minutesAdvanced, 0);
  assert.equal(story.drink().timeMinutes, 21 * 60 + 9);
  const blackout = story.blackout();
  assert.equal(blackout.day, 4);
  assert.equal(blackout.timeMinutes, 9 * 60 + 30);
  assert.deepEqual(story.campaign.state.scene, {
    id: SCENE_IDS.COUNTRYSIDE_CABIN,
    spawn: 'wake',
  });
  assert.equal(story.blackout().minutesAdvanced, 0);

  story = reloadStory(storage);
  assert.equal(story.nightfallComplete(), true);
  assert.equal(story.bodiesAtFire(), true);
  assert.equal(story.gasPoured(), true);
  assert.equal(story.bonfireIgnited(), true);
  assert.equal(story.fireCleanupComplete(), true);
  assert.equal(story.phase(), 'morning_call');
  assert.equal(story.completeMorningCall().timeMinutes, 9 * 60 + 33);
  assert.equal(story.tryLeave().id, 'cabin_chapter_incomplete');
  assert.equal(story.completeMorningWake().firstTime, true);
  /* Getting ready to leave is not the same as being told where to go. Beat 7
   * ends on Booski's call about Billy, and the car waits for it. */
  assert.equal(story.tryLeave().id, 'cabin_chapter_incomplete');
  assert.equal(story.completeBillyCall().firstTime, true);
  assert.deepEqual(story.tryLeave(), {
    kind: 'go',
    destination: SCENE_IDS.BADA_BING_TWO,
  });

  story = reloadStory(storage);
  assert.equal(story.chapterComplete(), true);
  assert.equal(story.phase(), 'complete');
  assert.deepEqual(story.tryLeave(), {
    kind: 'go',
    destination: SCENE_IDS.BADA_BING_TWO,
  });
  const departure = story.campaign.advanceTime(TIME_EVENT_IDS.DEPART_CABIN_FOR_TOWN);
  assert.equal(departure.applied, true);
  assert.equal(departure.day, 4, 'the county road is two hours and twenty minutes');
  assert.equal(departure.minutesAdvanced, 140);
  assert.equal(story.campaign.advanceTime(TIME_EVENT_IDS.DEPART_CABIN_FOR_TOWN).applied, false);
  assert.equal(story.campaign.state.story.timeEvents.filter(
    (id) => id === TIME_EVENT_IDS.DEPART_CABIN_FOR_TOWN,
  ).length, 1);
});

test('legacy Cabin rest remains readable but cannot bypass any gate', () => {
  const { campaign, storage } = cabinCampaign();
  let story = createCountrysideCabinStory({ campaign });
  assert.equal(story.rested(), false);
  assert.equal(story.rest().ok, true);
  assert.equal(story.rested(), true);
  /* CABIN_REST is a marker old saves carry and nothing else. It is not the
   * arrival's own sleep, so a man who "rested" has still been told to stay
   * put -- and the door says so in those words. */
  assert.equal(story.tryLeave().id, 'cabin_wait');
  assert.equal(story.arrivalRestComplete(), false);

  story = reloadStory(storage);
  assert.equal(story.rested(), true);
  assert.equal(story.rest().reason, 'already_rested');
  assert.equal(story.tryLeave().id, 'cabin_wait');
});

/**
 * THE POST-HEIST SAVE, WHICH STILL HAS TO BE ABLE TO FINISH THE GAME.
 *
 * The bible retired this route -- there is one cabin and it is in Act One --
 * but `SILVER_CASE` has no other entrance until the luxury apartment takes the
 * doorway at beat 19, and `Campaign.transition()` throws on an edge nobody
 * declared. A player parked in that chapter must still get to the last third.
 */
test('a save that reached the cabin the old way still leaves for the Silver Case', () => {
  const { campaign } = cabinCampaign({ silverCase: 'available' });
  const story = createCountrysideCabinStory({ campaign });
  assert.equal(story.tryLeave().id, 'cabin_chapter_incomplete');

  finishInterrogations(reachDungeon(story));
  story.chooseExecution('gratin');
  for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
    story.damageHostage(id, { hits: story.hostageState(id).remaining });
    story.killHostage(id);
  }
  story.completeNightfall();
  for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
    story.wrapHostage(id);
    story.moveBodyToFire(id);
  }
  story.stageBodies();
  story.pourGas();
  story.igniteBonfire();
  story.completeFireCleanup();
  story.drink();
  story.blackout();
  story.completeMorningCall();
  story.completeMorningWake();

  assert.deepEqual(story.tryLeave(), {
    kind: 'go', destination: SCENE_IDS.SILVER_CASE,
  });
});

test('unknown landmarks and invalid execution choices do not mutate durable state', () => {
  const { campaign } = cabinCampaign();
  const story = createCountrysideCabinStory({ campaign });
  const beforeLandmark = structuredClone(campaign.state);
  assert.deepEqual(story.visit('abandoned_theme_park'), {
    ok: false,
    reason: 'unknown_landmark',
  });
  assert.deepEqual(campaign.state, beforeLandmark);

  finishInterrogations(reachDungeon(story));
  const beforeChoice = structuredClone(campaign.state);
  assert.deepEqual(story.chooseExecution('flip_a_coin'), {
    ok: false,
    reason: 'unknown_execution_choice',
  });
  assert.deepEqual(campaign.state, beforeChoice);
});
