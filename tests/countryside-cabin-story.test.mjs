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

function cabinCampaign({ silverCase = 'available', legacyEvents = [] } = {}) {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'post_heist';
    state.story.day = 4;
    state.story.timeMinutes = 17 * 60 + 20;
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
    state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
    state.missions[MISSION_IDS.BANK_HEIST].cleanupComplete = true;
    state.missions[MISSION_IDS.SILVER_CASE].status = silverCase;
    state.story.timeEvents.push(TIME_EVENT_IDS.PHONE_READ_CABIN, ...legacyEvents);
  });
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_COUNTRYSIDE_CABIN, (state) => {
    state.scene = { id: SCENE_IDS.COUNTRYSIDE_CABIN, spawn: 'arrival' };
  });
  return { campaign, storage };
}

function reloadStory(storage) {
  return createCountrysideCabinStory({ campaign: createCampaign({ storage }) });
}

function reachDungeon(story) {
  story.completeOpeningCall();
  story.visit('creek');
  story.consumeMargoReady();
  story.visit('overlook');
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

test('Cabin arrival and opening call use exact-once Day 5 daytime timing', () => {
  const { campaign, storage } = cabinCampaign();
  const story = createCountrysideCabinStory({ campaign });

  assert.equal(campaign.state.story.day, 5);
  assert.equal(campaign.state.story.timeMinutes, 11 * 60 + 15);
  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.COUNTRYSIDE_CABIN,
    spawn: 'arrival',
  });
  assert.equal(campaign.state.story.timeEvents.filter(
    (id) => id === TIME_EVENT_IDS.DEPART_COUNTRYSIDE_CABIN,
  ).length, 1);
  assert.deepEqual(story.completeOpeningCall(), {
    ok: true,
    firstTime: true,
    applied: true,
    day: 5,
    timeMinutes: 11 * 60 + 18,
    minutesAdvanced: 3,
  });

  const afterFirst = structuredClone(campaign.state);
  assert.equal(story.completeOpeningCall().firstTime, false);
  assert.deepEqual(campaign.state, afterFirst);
  assert.equal(reloadStory(storage).openingCallComplete(), true);

  const repeatedTravel = campaign.advanceTime(TIME_EVENT_IDS.DEPART_COUNTRYSIDE_CABIN);
  assert.equal(repeatedTravel.applied, false);
  assert.equal(repeatedTravel.minutesAdvanced, 0);
  assert.deepEqual(campaign.state, afterFirst);
});

test('Lou must finish the opening call before exploration or the Margo handoff can progress', () => {
  const { campaign } = cabinCampaign();
  const story = createCountrysideCabinStory({ campaign });

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
  const story = createCountrysideCabinStory({ campaign });
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
});

test('first exploration emits Margo once and second exploration enables Gratin', () => {
  const { campaign, storage } = cabinCampaign();
  let story = createCountrysideCabinStory({ campaign });

  assert.equal(story.basementVisible(), false);
  assert.deepEqual(story.consumeMargoReady(), { ok: false, reason: 'opening_call_incomplete' });
  assert.deepEqual(story.completeGratinCall(), {
    ok: false,
    reason: 'gratin_call_not_ready',
  });
  story.completeOpeningCall();
  story.visit('creek');
  assert.equal(story.explorationCount(), 1);
  assert.equal(story.margoReady(), true);
  assert.equal(story.consumeMargoReady().firstTime, true);
  assert.equal(story.margoReady(), false);
  assert.equal(story.consumeMargoReady().firstTime, false);
  story.visit('creek');
  assert.equal(story.explorationCount(), 1, 'a repeat walk cannot unlock Gratin');
  assert.equal(story.gratinCallReady(), false);
  story.visit('overlook');
  assert.equal(story.gratinCallReady(), true);

  story = reloadStory(storage);
  assert.equal(story.gratinCallReady(), true);
  assert.equal(story.completeGratinCall().firstTime, true);
  assert.equal(story.completeGratinCall().firstTime, false);
  assert.equal(story.basementVisible(), true);
  assert.equal(story.phase(), 'open_cellar');
  assert.deepEqual(story.objectivePlan(), {
    id: 'cabin.find_gratin',
    label: 'Find Gratin',
    step: 'Return to the cabin · follow the Supreme Leader',
  });
  assert.equal(story.objectives().length, 1);
  assert.equal(
    story.objectives().some(({ label }) => /creek|ridge|shed|range/i.test(label)),
    false,
    'unfinished exploration sites should not remain as HUD objectives',
  );
});

test('the HUD projection exposes one parent objective and only its current soft step', () => {
  const { campaign } = cabinCampaign();
  const story = createCountrysideCabinStory({ campaign });
  const expectPlan = (label, step) => {
    assert.equal(story.objectives().length, 1);
    assert.equal(story.objectives()[0].label, label);
    assert.equal(story.objectives()[0].step, step);
    assert.equal(story.objectives()[0].current, true);
  };

  expectPlan('Lay low at the cabin', 'Answer Lou’s call');
  story.completeOpeningCall();
  expectPlan('Lay low at the cabin', 'Explore the property · 0/2 sites checked');
  story.visit('creek');
  expectPlan('Lay low at the cabin', 'Explore the property · 1/2 sites checked');
  story.consumeMargoReady();
  story.visit('range');
  expectPlan('Lay low at the cabin', 'Answer Gratin’s call');
  story.completeGratinCall();
  expectPlan('Find Gratin', 'Return to the cabin · follow the Supreme Leader');
  story.openCellar();
  expectPlan('Find Gratin', 'Search the cellar');
  story.enterDungeon();
  expectPlan('Help Gratin get answers', 'Use the tools on both prisoners · 0/2 talking');
  story.hitHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER, { hits: 2 });
  expectPlan('Help Gratin get answers', 'Use the tools on both prisoners · 1/2 talking');
  story.hitHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER, { hits: 6 });
  expectPlan('Help Gratin get answers', 'Hear the prisoner out');
  story.learnAteamIntel();
  expectPlan('Help Gratin get answers', 'Listen to Gratin');
  story.chooseExecution('player');
  expectPlan('Finish the job', 'Use Gratin’s pistol on both prisoners');

  for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
    const hostage = story.hostageState(id);
    story.damageHostage(id, { hits: hostage.remaining });
    story.killHostage(id);
  }
  expectPlan('Finish the job', 'Listen to Gratin');
  story.completeNightfall();
  expectPlan('Finish the job', 'Listen to Gratin');
  story.completeNightfallBriefing();
  expectPlan('Burn the bodies', 'Wrap them up · 0/2');
  story.wrapHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER);
  expectPlan('Burn the bodies', 'Wrap them up · 1/2');
  story.wrapHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER);
  expectPlan('Burn the bodies', 'Carry them to the fire · 0/2');
  story.moveBodyToFire(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER);
  expectPlan('Burn the bodies', 'Carry them to the fire · 1/2');
  story.moveBodyToFire(CABIN_HOSTAGE_IDS.ATEAM_MEMBER);
  expectPlan('Burn the bodies', 'Soak the pyre with gasoline');
  story.pourGas();
  expectPlan('Burn the bodies', 'Light the pyre');
  story.igniteBonfire();
  expectPlan('Burn the bodies', 'Stay with the fire');
  story.completeFireCleanup();
  expectPlan('Sit with Lag and Gratin', 'Take the drink when it comes around');
  story.drink();
  expectPlan('Sit with Lag and Gratin', 'Stay by the fire');
  story.blackout();
  expectPlan('Answer Ape’s call', 'Pick up the phone');
  story.completeMorningCall();
  expectPlan('Meet Ape at the car', 'Head outside');
  story.completeMorningWake();
  expectPlan('Take the car to Lou’s next job', 'Use the car when you are ready');
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
  assert.equal(story.objectives().length, 1);
  assert.equal(story.objectives().some(({ label }) => /unmask|mole/i.test(label)), false);
  assert.equal(story.objectives()[0].label, 'Burn the bodies');
  assert.equal(story.objectives()[0].step, 'Soak the pyre with gasoline');
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
  assert.equal(nightfall.day, 5);
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
  assert.equal(fire.day, 5);
  assert.equal(fire.timeMinutes, 21 * 60 + 4);
  assert.equal(story.completeFireCleanup().minutesAdvanced, 0);
  assert.equal(story.drink().timeMinutes, 21 * 60 + 9);
  const blackout = story.blackout();
  assert.equal(blackout.day, 6);
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
  assert.deepEqual(story.tryLeave(), {
    kind: 'go',
    destination: SCENE_IDS.SILVER_CASE,
  });

  story = reloadStory(storage);
  assert.equal(story.chapterComplete(), true);
  assert.equal(story.phase(), 'complete');
  assert.deepEqual(story.tryLeave(), {
    kind: 'go',
    destination: SCENE_IDS.SILVER_CASE,
  });
  const departure = story.campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_CASE);
  assert.equal(departure.applied, true);
  assert.equal(departure.day, 6);
  assert.equal(departure.timeMinutes, 16 * 60);
  assert.equal(story.campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_CASE).applied, false);
  assert.equal(story.campaign.state.story.timeEvents.filter(
    (id) => id === TIME_EVENT_IDS.DEPART_SILVER_CASE,
  ).length, 1);
});

test('legacy Cabin rest remains readable but cannot bypass the morning gate', () => {
  const { campaign, storage } = cabinCampaign();
  let story = createCountrysideCabinStory({ campaign });
  assert.equal(story.rested(), false);
  assert.equal(story.rest().ok, true);
  assert.equal(story.rested(), true);
  assert.equal(story.tryLeave().id, 'cabin_chapter_incomplete');

  story = reloadStory(storage);
  assert.equal(story.rested(), true);
  assert.equal(story.rest().reason, 'already_rested');
  assert.equal(story.tryLeave().id, 'cabin_chapter_incomplete');
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
