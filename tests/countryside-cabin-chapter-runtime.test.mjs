import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  CABIN_HOSTAGE_IDS,
  COUNTRYSIDE_CABIN_LANDMARKS,
  createCountrysideCabinStory,
} from '../src/core/countryside-cabin-story.js';
import {
  CabinChapterRuntime,
  DUNGEON_TO_STORY_HOSTAGE,
  STORY_TO_CLEANUP_BODY,
} from '../src/cabin/chapter-runtime.js';
import { CabinDialogueDirector } from '../src/cabin/dialogue-director.js';
import { CabinExecutionChoice } from '../src/cabin/execution-choice.js';
import { CABIN_PHONE_CALLS, MARGO_CALL_READY } from '../src/cabin/script.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

class PhoneDouble {
  constructor() {
    this.call = null;
    this.rings = [];
    this.onCallState = null;
    this.onAnswered = null;
  }

  ring(definition) {
    if (this.call) return false;
    this.call = { def: definition, state: 'ringing' };
    this.rings.push(definition.id);
    return true;
  }

  answer() {
    if (this.call?.state !== 'ringing') return false;
    this.call.state = 'talking';
    this.onCallState?.(true, this.call.def);
    this.onAnswered?.(this.call.def);
    return true;
  }

  finish() {
    if (this.call?.state !== 'talking') return false;
    const definition = this.call.def;
    this.call = null;
    this.onCallState?.(false, definition);
    return true;
  }

  hangUp({ force = false } = {}) {
    if (!this.call) return false;
    const { def, state } = this.call;
    if (state === 'talking' && def.allowHangup === false && !force) return false;
    this.call = null;
    if (state === 'talking') this.onCallState?.(false, def);
    return true;
  }
}

function audioDouble() {
  return {
    manifest: { sfx: [] },
    sampleDuration() { return 0.01; },
    hasSample() { return false; },
    play() { return null; },
    hold() {},
  };
}

/**
 * The Act-One cabin, at the moment the driver pulls away. He has just come
 * from the restaurant; the bed is the first thing that happens here.
 */
function seedCabinCampaign(storage = new MemoryStorage()) {
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.scene = { id: SCENE_IDS.SQUATCHFATHER, spawn: 'restaurant_exterior' };
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
  });
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_CABIN_LAY_LOW, (state) => {
    state.scene = { id: SCENE_IDS.COUNTRYSIDE_CABIN, spawn: 'arrival' };
  });
  return { campaign, storage };
}

/**
 * The same seed, plus the sleep the chapter opens on. Most of this file is
 * about what the phone and the dialogue director do once the day has started,
 * so it starts them there rather than repeating the bed in every case.
 */
function seedWokenCabin(storage = new MemoryStorage()) {
  const seeded = seedCabinCampaign(storage);
  createCountrysideCabinStory({ campaign: seeded.campaign }).completeArrivalRest();
  return seeded;
}

function runtimeHarness(campaign, { callbacks = {}, hud = null } = {}) {
  const story = createCountrysideCabinStory({ campaign });
  const phone = new PhoneDouble();
  const dialogue = new CabinDialogueDirector({ audio: audioDouble() });
  const choice = new CabinExecutionChoice();
  const runtime = new CabinChapterRuntime({ story, phone, dialogue, choice, callbacks, hud });
  return { campaign, story, phone, dialogue, choice, runtime };
}

function reloadHarness(storage, options = {}) {
  return runtimeHarness(createCampaign({ storage }), options);
}

function tick(harness, seconds, frame = {}) {
  let remaining = seconds;
  while (remaining > 0.000001) {
    const dt = Math.min(0.1, remaining);
    harness.runtime.update(dt, frame);
    remaining -= dt;
  }
}

function advanceUntil(harness, predicate, message, { frames = 5000, frame = {} } = {}) {
  for (let index = 0; index < frames; index += 1) {
    if (predicate()) return;
    harness.runtime.update(0.1, frame);
  }
  assert.fail(`${message}; snapshot=${JSON.stringify(harness.runtime.snapshot())}`);
}

function drainDialogue(harness, message = 'dialogue did not drain') {
  advanceUntil(
    harness,
    () => !harness.dialogue.running && harness.runtime.beatQueue.length === 0,
    message,
  );
}

function finishCurrentCall(harness) {
  assert.equal(harness.phone.answer(), true);
  assert.equal(harness.phone.finish(), true);
}

/**
 * Everything the campaign does before the cellar: the bed, Lou, all four
 * walks, Margo, Booski, the flight, the drive back and the second night.
 */
/** Visit one, the flight, the drive back and the second night -- but not the
 * call that starts the dungeon. Everything Gratin has to wait for. */
function reachGratin(story) {
  story.completeArrivalRest();
  story.completeOpeningCall();
  for (const { id } of COUNTRYSIDE_CABIN_LANDMARKS) story.visit(id);
  story.consumeMargoReady();
  story.completeMargoCall();
  story.completeBooskiSasoleCall();
  story.campaign.update((state) => {
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'complete';
  });
  story.recordReturnFromAirstrip();
  story.completeSecondRest();
  return story;
}

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

function prepareIntel(story) {
  reachDungeon(story);
  story.hitHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER, { hits: 2 });
  story.hitHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER, { hits: 6 });
  story.learnAteamIntel();
  return story;
}

function prepareDeaths(story, execution = 'player') {
  prepareIntel(story);
  story.chooseExecution(execution);
  for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
    const hostage = story.hostageState(id);
    story.damageHostage(id, { hits: hostage.remaining });
    story.killHostage(id);
  }
  return story;
}

function prepareNightfall(story) {
  prepareDeaths(story);
  story.completeNightfall();
  return story;
}

test('runtime maps dungeon and cleanup ids onto the two durable hostage records', () => {
  assert.equal(DUNGEON_TO_STORY_HOSTAGE.counterStrike, CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER);
  assert.equal(DUNGEON_TO_STORY_HOSTAGE['a-team-member'], CABIN_HOSTAGE_IDS.ATEAM_MEMBER);
  assert.equal(
    STORY_TO_CLEANUP_BODY[CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER],
    'counterstrike-player',
  );
  assert.equal(STORY_TO_CLEANUP_BODY[CABIN_HOSTAGE_IDS.ATEAM_MEMBER], 'a-team-member');
  assert.throws(() => new CabinChapterRuntime(), /requires story, phone, dialogue and choice/);
});

test('Lou, Margo, Gratin, hidden doors, return line, and forty-second clue follow authored gates', () => {
  const { campaign } = seedWokenCabin();
  const margo = [];
  const doors = [];
  const ringing = [];
  const harness = runtimeHarness(campaign, {
    callbacks: {
      onMargoReady: (detail) => margo.push(detail),
      onDungeonDoorOpen: (detail) => doors.push(detail ?? null),
      onCallRinging: (definition) => ringing.push(definition.id),
    },
  });
  const { runtime, story, phone, dialogue } = harness;

  assert.equal(runtime.start(), 'opening_call');
  assert.equal(runtime.canRevealBasement(), false);
  assert.equal(runtime.openCellar().reason, 'basement_hidden');
  tick(harness, 0.1);
  assert.equal(phone.call.def.id, CABIN_PHONE_CALLS.LOU_ARRIVAL.id);
  finishCurrentCall(harness);
  assert.equal(story.openingCallComplete(), true);

  const first = story.visit('creek');
  assert.equal(runtime.notifyLandmark(first), true);
  assert.equal(story.margoHookHandled(), false);
  assert.equal(margo.length, 0);
  assert.equal(dialogue.current, 'FIRST_EXPLORATION');
  drainDialogue(harness);
  assert.equal(story.margoHookHandled(), true);
  assert.equal(margo.length, 1);
  assert.equal(margo[0].eventName, MARGO_CALL_READY.eventName);
  assert.equal(margo[0].restored, false);
  assert.equal(dialogue.receipts.some(({ beat }) => beat === 'FIRST_EXPLORATION'), true);

  const repeat = story.visit('creek');
  assert.equal(runtime.notifyLandmark(repeat), false);
  assert.equal(margo.length, 1);

  /* THE FOUR WALKS, THEN THE TWO CALLS THAT END VISIT ONE. Gratin is a day
   * and a flight away yet: nothing here can reach the cellar. */
  for (const { id } of COUNTRYSIDE_CABIN_LANDMARKS) {
    runtime.notifyLandmark(story.visit(id));
  }
  drainDialogue(harness);
  tick(harness, 0.1);
  assert.equal(phone.call.def.id, CABIN_PHONE_CALLS.MARGO_FIRST_CALL.id);
  finishCurrentCall(harness);
  assert.equal(story.margoCallComplete(), true);
  tick(harness, 2);
  assert.equal(phone.call.def.id, CABIN_PHONE_CALLS.BOOSKI_SASOLE.id);
  finishCurrentCall(harness);
  assert.equal(story.visitOneComplete(), true);
  assert.equal(runtime.canRevealBasement(), false,
    'the cellar cannot open on the first visit');

  /* The Beef Run, the drive back, and the second night. */
  campaign.update((state) => {
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'complete';
  });
  story.recordReturnFromAirstrip();
  story.completeSecondRest();
  tick(harness, 2);
  assert.equal(phone.call.def.id, CABIN_PHONE_CALLS.GRATIN_BASEMENT.id);
  finishCurrentCall(harness);
  assert.equal(runtime.canRevealBasement(), true);
  assert.equal(story.returnToCabinLineComplete(), false);
  assert.equal(dialogue.current, null);
  tick(harness, 20, { playerPosition: { x: 40, z: 0 }, cabinPosition: { x: 0, z: 0 } });
  assert.equal(dialogue.receipts.some(({ beat }) => beat === 'RETURN_TO_CABIN'), false);
  tick(harness, 0.1, { playerPosition: { x: 20, z: 0 }, cabinPosition: { x: 0, z: 0 } });
  assert.equal(dialogue.current, 'RETURN_TO_CABIN');
  assert.equal(story.returnToCabinLineComplete(), false);
  drainDialogue(harness, 'return-to-cabin dialogue did not drain');
  assert.equal(story.returnToCabinLineComplete(), true);
  assert.equal(dialogue.receipts.some(({ beat }) => beat === 'RETURN_TO_CABIN'), true);

  tick(harness, 39.8, { playerPosition: { x: 2, z: 2 }, cabinPosition: { x: 0, z: 0 } });
  assert.equal(dialogue.receipts.some(({ beat }) => beat === 'SUPREME_LEADER_HINT'), false);
  tick(harness, 0.3, { playerPosition: { x: 2, z: 2 }, cabinPosition: { x: 0, z: 0 } });
  assert.equal(dialogue.current, 'SUPREME_LEADER_HINT');
  tick(harness, 0.2, { playerPosition: { x: 2, z: 2 }, cabinPosition: { x: 0, z: 0 } });
  assert.equal(dialogue.receipts.some(({ beat }) => beat === 'SUPREME_LEADER_HINT'), true);
  drainDialogue(harness);

  assert.equal(runtime.openCellar().firstTime, true);
  assert.equal(runtime.enterDungeon().firstTime, true);
  assert.equal(story.phase(), 'interrogation');
  assert.equal(doors.length, 1);
  assert.deepEqual(ringing, [
    CABIN_PHONE_CALLS.LOU_ARRIVAL.id,
    CABIN_PHONE_CALLS.MARGO_FIRST_CALL.id,
    CABIN_PHONE_CALLS.BOOSKI_SASOLE.id,
    CABIN_PHONE_CALLS.GRATIN_BASEMENT.id,
  ]);
});

test('stopping during a connected call does not complete that call as a story event', () => {
  const { campaign } = seedWokenCabin();
  const harness = runtimeHarness(campaign);
  harness.runtime.start();
  tick(harness, 0.1);
  assert.equal(harness.phone.answer(), true);
  harness.runtime.stop();
  assert.equal(harness.phone.call, null);
  assert.equal(harness.story.openingCallComplete(), false);
  harness.runtime.start();
  tick(harness, 0.1);
  assert.equal(harness.phone.call.def.id, CABIN_PHONE_CALLS.LOU_ARRIVAL.id);
});

test('manually hanging up a required Cabin call cannot award its story marker', () => {
  const { campaign } = seedWokenCabin();
  const harness = runtimeHarness(campaign);
  harness.runtime.start();
  tick(harness, 0.1);
  assert.equal(harness.phone.answer(), true);

  assert.equal(harness.phone.hangUp(), false);
  assert.equal(harness.phone.call?.state, 'talking');
  assert.equal(harness.story.openingCallComplete(), false);

  assert.equal(harness.phone.finish(), true);
  assert.equal(harness.story.openingCallComplete(), true);
});

test('tool-gated torture reaches 2/6, reveals Short Bus intel, and arms the player branch', () => {
  const { campaign } = seedWokenCabin();
  const tortureHits = [];
  const deaths = [];
  const equip = [];
  const night = [];
  const toasts = [];
  const harness = runtimeHarness(campaign, {
    hud: { toast: (message) => toasts.push(message) },
    callbacks: {
      onTortureHit: (...args) => tortureHits.push(args),
      onEquipPistol: (detail) => equip.push(detail ?? null),
      onHostageDeath: (...args) => deaths.push(args),
      onNightfall: (detail) => night.push(detail),
    },
  });
  reachDungeon(harness.story);
  harness.runtime.start();

  assert.equal(harness.runtime.torture('counterStrike').reason, 'tool_required');
  assert.match(toasts[0], /Pick a tool/);
  assert.equal(harness.runtime.selectTool('pliers'), 'pliers');
  drainDialogue(harness, 'tool introduction did not drain');
  assert.equal(
    harness.dialogue.receipts.filter(({ beat }) => beat === 'TOOLS').length,
    3,
    'the three-line tool introduction must only play once',
  );

  for (const id of ['counterStrike', 'counterStrike']) {
    assert.equal(harness.runtime.torture(id).ok, true);
    drainDialogue(harness, 'baiter reaction did not drain');
  }
  for (let index = 0; index < 6; index += 1) {
    assert.equal(harness.runtime.torture('a-team-member').ok, true);
    /* The sixth hit begins the reveal -> offer chain. Do not "drain" through
     * its ten-second action, because that would deliberately exercise timeout. */
    if (index < 5 && harness.dialogue.running) {
      drainDialogue(harness, 'A-Team reaction did not drain');
    }
  }

  assert.equal(harness.story.hostageState(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).hits, 2);
  assert.equal(harness.story.hostageState(CABIN_HOSTAGE_IDS.ATEAM_MEMBER).hits, 6);
  assert.equal(harness.story.ateamIntelLearned(), false);
  assert.equal(harness.dialogue.current, 'ATEAM_REVEAL');
  advanceUntil(harness, () => harness.choice.active, 'execution offer never opened');
  assert.equal(harness.story.ateamIntelLearned(), true);
  const spokenBeats = new Set(harness.dialogue.receipts.map(({ beat }) => beat));
  for (const beat of [
    'BAITER_FIRST_HIT',
    'BAITER_SECOND_HIT',
    'ATEAM_FIRST_HIT',
    'ATEAM_MID_HIT',
    'ATEAM_REVEAL',
    'INTERROGATION_DONE',
    'EXECUTION_OFFER',
  ]) assert.equal(spokenBeats.has(beat), true, `${beat} should be spoken`);
  assert.equal(tortureHits.length, 8);

  assert.equal(harness.choice.handleKey('Digit1'), true);
  advanceUntil(harness, () => equip.length === 1, 'pistol was not equipped after YES');
  assert.equal(harness.story.executionChoice(), 'player');
  assert.equal(harness.runtime.shootHostage('not-a-prisoner').reason, 'unknown_hostage');
  assert.equal(harness.runtime.shootHostage('counterStrike', { hitUnits: 4 }).killed, false);
  assert.equal(harness.runtime.shootHostage('counterStrike', { hitUnits: 4 }).killed, true);
  assert.equal(harness.runtime.shootHostage('ateam', { hitUnits: 4 }).killed, true);
  assert.equal(deaths.length, 2);
  assert.deepEqual(deaths.map((entry) => entry[2]), ['player', 'player']);
  tick(harness, 0.1);
  assert.equal(harness.story.nightfallComplete(), true);
  assert.equal(harness.story.phase(), 'wrap_bodies');
  assert.equal(night.at(-1).restored, false);
});

test('explicit NO and the full ten-second timeout both make Gratin execute the captives', async (t) => {
  for (const branch of [
    { name: 'explicit no', choose: (choice) => choice.handleKey('Digit2'), reason: 'player' },
    {
      name: 'timeout',
      choose: (choice, harness) => {
        tick(harness, 9.9);
        assert.equal(choice.active, true);
        tick(harness, 0.1);
        return true;
      },
      reason: 'timeout',
    },
  ]) {
    await t.test(branch.name, () => {
      const { campaign } = seedWokenCabin();
      const shots = [];
      const choices = [];
      const starts = [];
      const harness = runtimeHarness(campaign, {
        callbacks: {
          onChoiceClosed: (selected, reason) => choices.push({ selected, reason }),
          onGratinExecutionStart: (detail) => starts.push(detail),
          onGratinShot: (id) => shots.push(id),
        },
      });
      prepareIntel(harness.story);
      harness.runtime.start();
      advanceUntil(harness, () => harness.choice.active, 'restored execution offer never opened');
      assert.equal(branch.choose(harness.choice, harness), true);
      advanceUntil(harness, () => harness.story.deathsComplete(), 'Gratin did not finish both captives');
      tick(harness, 0.1);
      assert.equal(harness.story.executionChoice(), 'gratin');
      assert.deepEqual(shots, [
        CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER,
        CABIN_HOSTAGE_IDS.ATEAM_MEMBER,
      ]);
      assert.deepEqual(choices, [{ selected: 'gratin', reason: branch.reason }]);
      assert.deepEqual(starts, [{ restored: false }]);
      advanceUntil(harness, () => harness.story.nightfallComplete(), 'Gratin aftermath did not reach nightfall');
      assert.equal(harness.story.nightfallComplete(), true);
    });
  }
});

test('Gratin speaks his execution aftermath only after both authored shots land', () => {
  const { campaign, storage } = seedWokenCabin();
  const shots = [];
  const harness = runtimeHarness(campaign, {
    callbacks: { onGratinShot: (id) => shots.push(id) },
  });
  prepareIntel(harness.story);
  harness.story.chooseExecution('gratin');
  harness.story.completeExecutionBranchVo();
  harness.runtime.start();

  assert.equal(harness.runtime.snapshot().executionRunning, true);
  assert.equal(harness.dialogue.current, null);
  tick(harness, 0.8);
  assert.deepEqual(shots, [CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER]);
  assert.equal(harness.dialogue.current, null);
  assert.equal(harness.dialogue.receipts.some(({ beat }) => beat === 'GRATIN_EXECUTES'), false);

  tick(harness, 1.1);
  assert.deepEqual(shots, [
    CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER,
    CABIN_HOSTAGE_IDS.ATEAM_MEMBER,
  ]);
  assert.equal(harness.dialogue.current, 'GRATIN_EXECUTES');
  assert.equal(harness.story.nightfallComplete(), false);
  tick(harness, 0.1);
  harness.runtime.stop();

  const restored = reloadHarness(storage);
  restored.runtime.start();
  assert.equal(restored.dialogue.current, 'GRATIN_EXECUTES');
  assert.equal(restored.story.nightfallComplete(), false);
  advanceUntil(restored, () => restored.story.nightfallComplete(), 'restored aftermath never reached nightfall');
  assert.equal(restored.dialogue.receipts.some(({ beat }) => beat === 'GRATIN_EXECUTES'), true);
  assert.equal(restored.dialogue.current, 'BOTH_DEAD');
});

test('body wrapping, carry, gas, fire, drinking, blackout, and Ape morning call form one complete flow', () => {
  const { campaign } = seedWokenCabin();
  let allowWrap = false;
  let allowCarry = false;
  let allowPlace = false;
  let allowGas = false;
  let allowIgnite = false;
  let blackoutDone = null;
  const wrapped = [];
  const staged = [];
  const movedCast = [];
  const intoxication = [];
  const wakes = [];
  const complete = [];
  const harness = runtimeHarness(campaign, {
    callbacks: {
      onWrapBody: (cleanupId) => {
        wrapped.push(cleanupId);
        return allowWrap;
      },
      onStageBody: (cleanupId) => staged.push(cleanupId),
      onMoveCastToFire: (detail) => movedCast.push(detail),
      onBeginCarry: () => allowCarry,
      onPlaceBodyAtFire: () => allowPlace,
      onPourGas: () => allowGas,
      onIgniteBonfire: () => allowIgnite,
      onIntoxication: (amount, item) => intoxication.push({ amount, item }),
      onBlackout: (done) => { blackoutDone = done; },
      onWakeMorning: (detail) => wakes.push(detail),
      onChapterComplete: (detail) => complete.push(detail ?? null),
    },
  });
  prepareNightfall(harness.story);
  harness.runtime.start();

  assert.equal(harness.runtime.wrapBody('counterStrike').reason, 'presentation_refused');
  assert.equal(harness.story.hostageState(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER).wrapped, false);
  allowWrap = true;
  assert.equal(harness.runtime.wrapBody('counterStrike').firstTime, true);
  assert.equal(harness.runtime.wrapBody('ateam').firstTime, true);
  assert.deepEqual(staged, [], 'wrapping must not teleport either body to the yard');
  assert.deepEqual(movedCast, [], 'Gratin stays in the dungeon until both bodies reach the pyre');
  assert.equal(harness.runtime.snapshot().bodyCarryReady, true);
  drainDialogue(harness, 'wrapping dialogue did not drain');

  assert.equal(harness.runtime.beginCarry('counterStrike'), false);
  allowCarry = true;
  assert.equal(harness.runtime.beginCarry('counterStrike'), true);
  assert.equal(harness.runtime.placeBodyAtFire('counterStrike').reason, 'presentation_refused');
  assert.equal(harness.story.bodyAtFire(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER), false);
  allowPlace = true;
  assert.equal(harness.runtime.placeBodyAtFire('counterStrike').firstTime, true);
  assert.deepEqual(movedCast, []);
  assert.equal(harness.runtime.beginCarry('counterStrike'), false, 'a burned-body slot cannot be carried twice');
  assert.equal(harness.runtime.placeBodyAtFire('ateam').firstTime, true);
  assert.equal(harness.story.bodiesAtFire(), true);
  assert.deepEqual(movedCast, [{ restored: false }]);
  assert.equal(harness.runtime.snapshot().castAtFire, true);
  drainDialogue(harness, 'body-at-fire dialogue did not drain');

  assert.equal(harness.runtime.pourGas().reason, 'presentation_refused');
  assert.equal(harness.story.gasPoured(), false, 'visual refusal must not persist gas');
  allowGas = true;
  assert.equal(harness.runtime.pourGas().firstTime, true);
  drainDialogue(harness, 'gas dialogue did not drain');
  assert.equal(harness.runtime.igniteBonfire().reason, 'presentation_refused');
  assert.equal(harness.story.bonfireIgnited(), false, 'visual refusal must not persist ignition');
  allowIgnite = true;
  assert.equal(harness.runtime.igniteBonfire().firstTime, true);

  advanceUntil(harness, () => harness.runtime.pendingConsume?.item === 'beer', 'beer toast never paused');
  assert.equal(harness.story.fireCleanupComplete(), true);
  assert.equal(harness.runtime.consume('whiskey'), false);
  assert.equal(harness.runtime.consume('beer'), true);
  assert.equal(harness.story.drankAfterCleanup(), true);
  advanceUntil(harness, () => harness.runtime.pendingConsume?.item === 'whiskey', 'whiskey pull never paused');
  assert.equal(harness.runtime.consume('whiskey'), true);
  advanceUntil(harness, () => harness.runtime.pendingConsume?.item === 'cigs', 'optional smoke never paused');
  assert.equal(harness.runtime.skipOptionalAction(), true);
  advanceUntil(harness, () => harness.runtime.pendingConsume?.item === 'whiskey', 'last pull never paused');
  assert.equal(harness.runtime.consume('whiskey'), true);
  advanceUntil(harness, () => harness.story.blackedOut(), 'blackout marker was not reached');
  assert.equal(typeof blackoutDone, 'function');
  assert.equal(harness.phone.call, null);
  tick(harness, 2);
  assert.equal(harness.phone.call, null, 'morning cannot ring during the blackout transition');
  blackoutDone();
  tick(harness, 0.7);
  assert.equal(harness.phone.call, null);
  tick(harness, 0.2);
  assert.equal(harness.phone.call.def.id, CABIN_PHONE_CALLS.APE_MORNING.id);
  finishCurrentCall(harness);

  /* Ape gets him upright; Booski tells him where to go. Beat 7 is not over
   * until the second of those, and neither is the cabin. */
  assert.equal(harness.story.morningWakeComplete(), true);
  assert.equal(harness.story.chapterComplete(), false);
  tick(harness, 2);
  assert.equal(harness.phone.call.def.id, CABIN_PHONE_CALLS.BOOSKI_BILLY.id);
  finishCurrentCall(harness);
  assert.equal(harness.story.chapterComplete(), true);
  assert.deepEqual(
    intoxication.map(({ amount, item }) => ({ amount: Number(amount.toFixed(2)), item })),
    [
      { amount: 0.2, item: 'beer' },
      { amount: 0.54, item: 'whiskey' },
      { amount: 0.88, item: 'whiskey' },
    ],
  );
  assert.deepEqual(wakes, [{ restored: false }]);
  assert.deepEqual(complete, [null]);
  assert.equal(wrapped.includes('counterstrike-player'), true);
  assert.equal(wrapped.includes('a-team-member'), true);
});

test('reload restoration resumes Margo, Gratin execution, staged bodies, an ignited fire, and morning', async (t) => {
  await t.test('the return-to-Cabin line remains owed until approach and replays after a mid-line reload', () => {
    const { campaign, storage } = seedWokenCabin();
    const story = reachGratin(createCountrysideCabinStory({ campaign }));
    story.completeGratinCall();

    const interrupted = reloadHarness(storage);
    interrupted.runtime.start();
    tick(interrupted, 1, {
      playerPosition: { x: 80, z: 0 },
      cabinPosition: { x: 0, z: 0 },
    });
    assert.equal(interrupted.dialogue.current, null);
    assert.equal(interrupted.story.returnToCabinLineComplete(), false);
    tick(interrupted, 0.1, {
      playerPosition: { x: 20, z: 0 },
      cabinPosition: { x: 0, z: 0 },
    });
    assert.equal(interrupted.dialogue.current, 'RETURN_TO_CABIN');
    interrupted.runtime.stop();
    assert.equal(interrupted.story.returnToCabinLineComplete(), false);

    const restored = reloadHarness(storage);
    restored.runtime.start();
    tick(restored, 0.1, {
      playerPosition: { x: 20, z: 0 },
      cabinPosition: { x: 0, z: 0 },
    });
    assert.equal(restored.dialogue.current, 'RETURN_TO_CABIN');
    drainDialogue(restored, 'restored return-to-Cabin line did not finish');
    assert.equal(restored.story.returnToCabinLineComplete(), true);

    const completed = reloadHarness(storage);
    completed.runtime.start();
    tick(completed, 1, {
      playerPosition: { x: 20, z: 0 },
      cabinPosition: { x: 0, z: 0 },
    });
    assert.equal(completed.dialogue.current, null);
    assert.equal(completed.dialogue.receipts.length, 0);
  });

  await t.test('a Margo setup interrupted by reload replays before emitting once and unblocking Gratin', () => {
    const { campaign, storage } = seedWokenCabin();
    const story = createCountrysideCabinStory({ campaign });
    story.completeOpeningCall();
    for (const { id } of COUNTRYSIDE_CABIN_LANDMARKS) story.visit(id);
    const interrupted = reloadHarness(storage);
    interrupted.runtime.start();
    assert.equal(interrupted.dialogue.current, 'FIRST_EXPLORATION');
    assert.equal(interrupted.story.margoHookHandled(), false);
    tick(interrupted, 0.1);
    interrupted.runtime.stop();

    const margo = [];
    const harness = reloadHarness(storage, {
      callbacks: { onMargoReady: (detail) => margo.push(detail) },
    });
    harness.runtime.start();
    assert.equal(harness.dialogue.current, 'FIRST_EXPLORATION');
    assert.equal(harness.story.margoHookHandled(), false);
    assert.equal(margo.length, 0);
    drainDialogue(harness, 'restored Margo setup did not finish');
    assert.equal(harness.story.margoHookHandled(), true);
    assert.equal(margo.length, 1);
    assert.equal(margo[0].restored, true);
    /* The setup line's own payoff is the call to HER, not to Gratin. Gratin is
     * a flight and a night away. */
    tick(harness, 0.1);
    assert.equal(harness.phone.call.def.id, CABIN_PHONE_CALLS.MARGO_FIRST_CALL.id);
  });

  await t.test('a mid-reveal reload repeats the Short Bus disclosure before making the intel durable', () => {
    const { campaign, storage } = seedWokenCabin();
    const story = reachDungeon(createCountrysideCabinStory({ campaign }));
    story.hitHostage(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER, { hits: 2 });
    story.hitHostage(CABIN_HOSTAGE_IDS.ATEAM_MEMBER, { hits: 6 });

    const interrupted = reloadHarness(storage);
    interrupted.runtime.start();
    assert.equal(interrupted.dialogue.current, 'ATEAM_REVEAL');
    assert.equal(interrupted.story.ateamIntelLearned(), false);
    tick(interrupted, 0.1);
    interrupted.runtime.stop();

    const restored = reloadHarness(storage);
    restored.runtime.start();
    assert.equal(restored.dialogue.current, 'ATEAM_REVEAL');
    assert.equal(restored.story.ateamIntelLearned(), false);
    advanceUntil(restored, () => restored.choice.active, 'restored reveal never reached the execution offer');
    assert.equal(restored.story.ateamIntelLearned(), true);
    assert.equal(restored.dialogue.receipts.some(({ beat }) => beat === 'ATEAM_REVEAL'), true);

    restored.runtime.stop();
    const completed = reloadHarness(storage);
    completed.runtime.start();
    assert.equal(completed.dialogue.current, 'EXECUTION_OFFER');
    assert.equal(completed.dialogue.receipts.some(({ beat }) => beat === 'ATEAM_REVEAL'), false);
  });

  await t.test('a persisted player choice replays YES before restoring the pistol', () => {
    const { campaign, storage } = seedWokenCabin();
    const story = prepareIntel(createCountrysideCabinStory({ campaign }));
    story.chooseExecution('player');
    assert.equal(story.executionBranchVoComplete(), false);

    const interruptedEquip = [];
    const interrupted = reloadHarness(storage, {
      callbacks: { onEquipPistol: (detail) => interruptedEquip.push(detail ?? null) },
    });
    interrupted.runtime.start();
    assert.equal(interrupted.dialogue.current, 'EXECUTION_YES');
    assert.deepEqual(interruptedEquip, []);
    tick(interrupted, 0.1);
    interrupted.runtime.stop();
    assert.equal(interrupted.story.executionBranchVoComplete(), false);

    const restoredEquip = [];
    const restored = reloadHarness(storage, {
      callbacks: { onEquipPistol: (detail) => restoredEquip.push(detail ?? null) },
    });
    restored.runtime.start();
    assert.equal(restored.dialogue.current, 'EXECUTION_YES');
    assert.deepEqual(restoredEquip, []);
    advanceUntil(restored, () => restoredEquip.length === 1, 'restored YES never equipped the pistol');
    assert.equal(restored.story.executionBranchVoComplete(), true);
    assert.deepEqual(restoredEquip, [{ restored: true }]);
  });

  await t.test('a saved explicit NO finishes its response before restarting only living execution shots', () => {
    const { campaign, storage } = seedWokenCabin();
    const story = prepareIntel(createCountrysideCabinStory({ campaign }));
    story.chooseExecution('gratin');
    const baiter = story.hostageState(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER);
    story.damageHostage(baiter.id, { hits: baiter.remaining });
    story.killHostage(baiter.id);
    const starts = [];
    const shots = [];
    const harness = reloadHarness(storage, {
      callbacks: {
        onGratinExecutionStart: (detail) => starts.push(detail),
        onGratinShot: (id) => shots.push(id),
      },
    });
    harness.runtime.start();
    assert.equal(harness.dialogue.current, 'EXECUTION_NO');
    assert.equal(harness.runtime.snapshot().executionRunning, false);
    advanceUntil(harness, () => harness.runtime.snapshot().executionRunning, 'restored NO never started Gratin');
    assert.equal(harness.story.executionBranchVoComplete(), true);
    advanceUntil(harness, () => harness.story.deathsComplete(), 'restored Gratin execution stalled');
    assert.deepEqual(starts, [{ restored: true }]);
    assert.deepEqual(shots, [CABIN_HOSTAGE_IDS.ATEAM_MEMBER]);
    assert.equal(harness.dialogue.receipts.some(({ beat }) => beat === 'EXECUTION_NO'), true);
  });

  await t.test('a timeout-selected Gratin choice replays TIMEOUT rather than explicit NO after reload', () => {
    const { campaign, storage } = seedWokenCabin();
    const story = prepareIntel(createCountrysideCabinStory({ campaign }));
    story.chooseExecution('gratin', { reason: 'timeout' });
    assert.equal(story.executionBranch(), 'timeout');

    const interrupted = reloadHarness(storage);
    interrupted.runtime.start();
    assert.equal(interrupted.dialogue.current, 'EXECUTION_TIMEOUT');
    tick(interrupted, 0.1);
    interrupted.runtime.stop();
    assert.equal(interrupted.story.executionBranchVoComplete(), false);

    const starts = [];
    const restored = reloadHarness(storage, {
      callbacks: { onGratinExecutionStart: (detail) => starts.push(detail) },
    });
    restored.runtime.start();
    assert.equal(restored.dialogue.current, 'EXECUTION_TIMEOUT');
    advanceUntil(restored, () => restored.runtime.snapshot().executionRunning, 'restored TIMEOUT never started Gratin');
    assert.equal(restored.story.executionBranchVoComplete(), true);
    assert.deepEqual(starts, [{ restored: true }]);
    assert.equal(restored.dialogue.receipts.some(({ beat }) => beat === 'EXECUTION_TIMEOUT'), true);
    assert.equal(restored.dialogue.receipts.some(({ beat }) => beat === 'EXECUTION_NO'), false);
  });

  await t.test('nightfall saved mid-briefing replays BOTH_DEAD and WRAP_INSTRUCTIONS before completion', () => {
    const { campaign, storage } = seedWokenCabin();
    prepareDeaths(createCountrysideCabinStory({ campaign }));

    const interrupted = reloadHarness(storage);
    interrupted.runtime.start();
    assert.equal(interrupted.story.nightfallComplete(), true);
    assert.equal(interrupted.story.nightfallBriefingComplete(), false);
    assert.equal(interrupted.dialogue.current, 'BOTH_DEAD');
    tick(interrupted, 0.1);
    interrupted.runtime.stop();

    const restored = reloadHarness(storage);
    restored.runtime.start();
    assert.equal(restored.dialogue.current, 'BOTH_DEAD');
    assert.equal(restored.story.nightfallBriefingComplete(), false);
    drainDialogue(restored, 'restored nightfall briefing did not finish');
    assert.equal(restored.story.nightfallBriefingComplete(), true);
    assert.equal(restored.dialogue.receipts.some(({ beat }) => beat === 'BOTH_DEAD'), true);
    assert.equal(restored.dialogue.receipts.some(({ beat }) => beat === 'WRAP_INSTRUCTIONS'), true);

    const completed = reloadHarness(storage);
    completed.runtime.start();
    assert.equal(completed.dialogue.current, null);
    assert.equal(completed.dialogue.receipts.length, 0);
  });

  await t.test('wrapped bodies stay in the dungeon on reload while a body already at the pyre stays unavailable', () => {
    const { campaign, storage } = seedWokenCabin();
    const story = prepareNightfall(createCountrysideCabinStory({ campaign }));
    for (const id of Object.values(CABIN_HOSTAGE_IDS)) story.wrapHostage(id);
    story.moveBodyToFire(CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER);
    const staged = [];
    const carries = [];
    const harness = reloadHarness(storage, {
      callbacks: {
        onStageBody: (id) => staged.push(id),
        onBeginCarry: (cleanupId) => { carries.push(cleanupId); return true; },
      },
    });
    harness.runtime.start();
    assert.equal(harness.runtime.snapshot().bodyCarryReady, true);
    assert.equal(harness.runtime.snapshot().bodiesStagedOutside, false);
    assert.deepEqual(staged, []);
    assert.equal(harness.runtime.beginCarry('counterStrike'), false);
    assert.equal(harness.runtime.beginCarry('ateam'), true);
    assert.deepEqual(carries, ['a-team-member']);
  });

  await t.test('an ignition saved before its dialogue resumes cleanup and fire talk', () => {
    const { campaign, storage } = seedWokenCabin();
    const story = prepareNightfall(createCountrysideCabinStory({ campaign }));
    for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
      story.wrapHostage(id);
      story.moveBodyToFire(id);
    }
    story.pourGas();
    story.igniteBonfire();
    assert.equal(story.phase(), 'fire_cleanup');
    const staged = [];
    const gas = [];
    const ignited = [];
    const fire = [];
    const movedCast = [];
    const harness = reloadHarness(storage, {
      callbacks: {
        onStageBody: (id) => staged.push(id),
        onMoveCastToFire: (detail) => movedCast.push(detail),
        onPourGas: (detail) => gas.push(detail),
        onIgniteBonfire: (detail) => ignited.push(detail),
        onFireSequenceStart: (detail) => fire.push(detail),
      },
    });
    harness.runtime.start();
    assert.equal(harness.runtime.snapshot().bodiesStagedOutside, true);
    assert.deepEqual(staged, []);
    assert.deepEqual(movedCast, [{ restored: true }]);
    assert.deepEqual(gas, [{ restored: true }]);
    assert.deepEqual(ignited, [{ restored: true }]);
    advanceUntil(harness, () => harness.runtime.pendingConsume?.item === 'beer', 'restored fire never reached beer');
    assert.equal(harness.story.fireCleanupComplete(), true);
    assert.deepEqual(fire, [{ restored: true }]);
  });

  await t.test('a reload after the durable first drink resumes at Squatch talk and the next whiskey pull', () => {
    const { campaign, storage } = seedWokenCabin();
    const story = prepareNightfall(createCountrysideCabinStory({ campaign }));
    for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
      story.wrapHostage(id);
      story.moveBodyToFire(id);
    }
    story.pourGas();
    story.igniteBonfire();
    story.completeFireCleanup();
    story.drink();

    const harness = reloadHarness(storage);
    harness.runtime.start();
    assert.equal(harness.dialogue.current, 'FIRE_TALK_SQUATCHES');
    assert.equal(harness.runtime.pendingConsume, null);
    advanceUntil(harness, () => harness.runtime.pendingConsume?.item === 'whiskey', 'restored fire talk never reached whiskey');
    assert.equal(harness.dialogue.receipts.some(({ beat }) => beat === 'FIRE_TALK_ONE'), false);
    assert.equal(harness.dialogue.receipts.some(({ beat }) => beat === 'FIRE_TALK_SQUATCHES'), true);
  });

  await t.test('blackout restores the bed before ringing Ape', () => {
    const { campaign, storage } = seedWokenCabin();
    const story = prepareNightfall(createCountrysideCabinStory({ campaign }));
    for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
      story.wrapHostage(id);
      story.moveBodyToFire(id);
    }
    story.pourGas();
    story.igniteBonfire();
    story.completeFireCleanup();
    story.drink();
    story.blackout();
    const wakes = [];
    const harness = reloadHarness(storage, {
      callbacks: { onWakeMorning: (detail) => wakes.push(detail) },
    });
    assert.equal(harness.runtime.start(), 'morning_call');
    assert.deepEqual(wakes, [{ restored: true }]);
    tick(harness, 0.1);
    assert.equal(harness.phone.call.def.id, CABIN_PHONE_CALLS.APE_MORNING.id);
    assert.equal(harness.dialogue.current, 'MORNING');
  });

  await t.test('a persisted morning call completes the wake marker and rings Booski', () => {
    const { campaign, storage } = seedWokenCabin();
    const story = prepareNightfall(createCountrysideCabinStory({ campaign }));
    for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
      story.wrapHostage(id);
      story.moveBodyToFire(id);
    }
    story.pourGas();
    story.igniteBonfire();
    story.completeFireCleanup();
    story.drink();
    story.blackout();
    story.completeMorningCall();
    assert.equal(story.phase(), 'morning_wake');
    const complete = [];
    const harness = reloadHarness(storage, {
      callbacks: { onChapterComplete: (detail) => complete.push(detail) },
    });
    /* Restoring gets him on his feet -- and stops there. The chapter ends on
     * Booski's call about Billy, and a reload owes the player that call rather
     * than quietly awarding it. */
    assert.equal(harness.runtime.start(), 'billy_call');
    assert.equal(harness.story.morningWakeComplete(), true);
    assert.equal(harness.story.chapterComplete(), false);
    assert.deepEqual(complete, []);

    tick(harness, 0.2);
    assert.equal(harness.phone.call.def.id, CABIN_PHONE_CALLS.BOOSKI_BILLY.id);
    finishCurrentCall(harness);
    assert.equal(harness.story.chapterComplete(), true);
    assert.deepEqual(complete, [undefined]);
  });
});
