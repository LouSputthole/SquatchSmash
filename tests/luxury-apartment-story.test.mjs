import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_STORAGE_KEY,
  CHARACTER_IDS,
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  BIG_NIGHT_BOOSKI_CALL,
  DATE_MARGO_CALL,
  NO_WAKE_LOU_CALL,
  SILVER_CASE_BOOSKI_CALL,
  SPECIAL_MEETING_BOOSKI_CALL,
} from '../src/core/apartment-story.js';
import {
  LUXURY_APARTMENT_PHASES,
  createLuxuryApartmentStory,
} from '../src/core/luxury-apartment-story.js';
import { createNoWakeStory } from '../src/core/no-wake-story.js';
import { createSilverStory } from '../src/core/silver-story.js';

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

/**
 * Off the eighteenth green, keys in hand, at a quarter to twelve on Day 6.
 *
 * Everything behind him is finished the way the route finishes it: the
 * Motel, THE TAKE, Lou's call about a new space, and three holes.
 */
function afterTheHandover(storage = new MemoryStorage()) {
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'luxury_apartment';
    state.story.day = 6;
    state.story.timeMinutes = 10 * 60 + 30;
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
    state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
    state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
    state.events[EVENT_IDS.LOU_GOLF_CALL].status = 'answered';
  });
  campaign.advanceTime(TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT);
  campaign.enter(SCENE_IDS.LUXURY_APARTMENT, { spawn: 'arrival' });
  return campaign;
}

/** The four visits, driven end to end, with the date's verdict in hand. */
function walkToPhase(campaign, target, { cameHome = true } = {}) {
  const story = createLuxuryApartmentStory({ campaign });
  if (target === 'get_ready') return story;
  story.completeGetReady();
  if (target === 'date') return story;
  story.callAnswered(DATE_MARGO_CALL);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_ROOM);
  campaign.enter(SCENE_IDS.SILVER_ROOM, { spawn: 'kerb' });
  const silver = createSilverStory({ campaign });
  assert.equal(silver.begin().ok, true);
  assert.equal(silver.complete({
    outcome: cameHome ? 'perfect' : 'awkward',
    woo: cameHome ? 100 : 20,
    seeingHerAgain: cameHome,
    cameHome,
  }), true);
  campaign.enter(SCENE_IDS.LUXURY_APARTMENT, { spawn: 'main' });
  if (target === 'come_home') return story;
  story.margoComeHomeDone();
  if (target === 'stayover') return story;
  story.sleep();
  if (target === 'morning') return story;
  story.margoWakeDone();
  if (target === 'no_wake') return story;
  story.callAnswered(NO_WAKE_LOU_CALL);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_NO_WAKE);
  campaign.enter(SCENE_IDS.NO_WAKE, { spawn: 'gate_c' });
  const noWake = createNoWakeStory({ campaign });
  assert.equal(noWake.begin().ok, true);
  assert.equal(noWake.complete({
    betrayalConfirmed: true, playerFired: true, bodyDisposed: true,
  }), true);
  campaign.advanceTime(TIME_EVENT_IDS.RETURN_LUXURY_APARTMENT);
  campaign.enter(SCENE_IDS.LUXURY_APARTMENT, { spawn: 'main' });
  if (target === 'return') return story;
  story.callAnswered(SILVER_CASE_BOOSKI_CALL);
  if (target === 'special_meeting') {
    campaign.update((state) => {
      state.story.chapter = 'big_night';
      state.missions[MISSION_IDS.CARTEL_PALACE].status = 'complete';
      state.missions[MISSION_IDS.CARTEL_PALACE].checkpoint = 'clear';
      state.missions[MISSION_IDS.INITIATION].status = 'available';
    });
  }
  return story;
}

test('the four visits happen in the bible’s order and nothing skips ahead', () => {
  /* A fresh campaign per target, because the walk is a one-way route: the
   * Silver Room and NO WAKE both refuse a second `begin()`, which is the
   * point of them. */
  const seen = LUXURY_APARTMENT_PHASES.map(
    (target) => walkToPhase(afterTheHandover(), target).phase(),
  );
  assert.deepEqual(seen, [...LUXURY_APARTMENT_PHASES]);
});

test('beat 14 gates the door on getting ready, then on her call', () => {
  const campaign = afterTheHandover();
  const story = createLuxuryApartmentStory({ campaign });

  assert.equal(story.arrived(), true, 'the drive from Silver Pines must be booked');
  assert.equal(story.phase(), 'get_ready');
  const chore = story.tryLeave();
  assert.equal(chore.kind, 'activity');
  assert.equal(chore.id, TIME_EVENT_IDS.LUXURY_GET_READY);
  assert.equal(chore.label, 'Get ready for your date');
  assert.equal(chore.vo, 'door.refusal.luxury_get_ready');

  /* Forty-five minutes, and it cannot move the table: DEPART_SILVER_ROOM is
   * anchored at half seven for a nine o'clock booking. */
  assert.deepEqual(story.completeGetReady(), { ok: true });
  assert.equal(campaign.state.story.timeMinutes, 12 * 60 + 30);
  assert.deepEqual(story.completeGetReady(), { ok: false, reason: 'wrong_phase' });

  assert.deepEqual(story.tryLeave(), {
    kind: 'call',
    id: EVENT_IDS.MARGO_DATE_CALL,
    line: 'She said she would ring about tonight. I am not turning up at nine on a guess.',
    vo: 'door.refusal.date_call',
  });
});

test('Margo rings once in the new flat and unlocks Front & Center', () => {
  const storage = new MemoryStorage();
  const campaign = afterTheHandover(storage);
  const story = walkToPhase(campaign, 'date');

  assert.equal(story.pendingCall(), DATE_MARGO_CALL);
  /* She is a civilian and she is not on the family's radio station, so she
   * carries her own character id, her own voice profile, and her own bank.
   * The lines are the ones already recorded: she names the Silver Room and
   * the hour and nothing about where he is standing, which is why the move
   * from the starter flat cost no re-record. */
  assert.equal(DATE_MARGO_CALL.characterId, CHARACTER_IDS.MARGO);
  assert.equal(DATE_MARGO_CALL.from, 'Margo');
  assert.equal(DATE_MARGO_CALL.voiceProfile, 'margo');
  assert.equal(DATE_MARGO_CALL.vo, 'call.margo.date');
  assert.equal(DATE_MARGO_CALL.targetSceneId, SCENE_IDS.SILVER_ROOM);
  assert.notEqual(DATE_MARGO_CALL.eventId, BIG_NIGHT_BOOSKI_CALL.eventId);

  assert.equal(story.callAnswered(DATE_MARGO_CALL), true);
  const answered = createCampaign({ storage }).state;
  assert.equal(answered.events[EVENT_IDS.MARGO_DATE_CALL].status, 'answered');
  assert.equal(answered.missions[MISSION_IDS.SILVER_ROOM].status, 'available');
  assert.ok(answered.story.timeEvents.includes(TIME_EVENT_IDS.MARGO_DATE_CALL));
  assert.equal(story.callAnswered(DATE_MARGO_CALL), false, 'she does not ring twice');
  assert.equal(story.pendingCall(), null);

  assert.deepEqual(story.tryLeave(), {
    kind: 'go', destination: SCENE_IDS.SILVER_ROOM,
  });
});

test('beats 16 and 17: she comes home, the night passes, and only then a telephone', () => {
  const campaign = afterTheHandover();
  const story = walkToPhase(campaign, 'come_home');

  assert.equal(story.phase(), 'come_home');
  assert.equal(story.margoComeHomeOwed(), true);
  /* The bed cannot be used to skip her arrival. */
  assert.deepEqual(story.sleep(), { ok: false, reason: 'margo_still_arriving' });
  assert.deepEqual(story.tryLeave(), {
    kind: 'stay',
    id: 'luxury_stayover',
    line: 'She is asleep. Whatever is out there can stay out there. <em>Bed.</em>',
    vo: 'door.refusal.luxury_stayover',
  });

  assert.equal(story.margoComeHomeDone(), true);
  assert.equal(story.margoComeHomeDone(), false, 'the one-shot marker prevents replay');

  /* NOTHING CRIMINAL RINGS TONIGHT -- the bible's own words for beat 16. */
  assert.equal(story.pendingCall(), null);
  assert.deepEqual(story.sleep(), { ok: true, day: 7, timeMinutes: 7 * 60 + 10 });
  assert.deepEqual(story.sleep(), { ok: false, reason: 'wrong_phase' });

  assert.equal(story.phase(), 'morning');
  assert.equal(story.margoWakeOwed(), true);
  assert.equal(story.pendingCall(), null, 'the call waits until she has gone');
  assert.equal(story.tryLeave().id, 'luxury_margo_morning');
  assert.equal(story.margoWakeDone(), true);

  assert.equal(story.phase(), 'no_wake');
  assert.equal(story.pendingCall(), NO_WAKE_LOU_CALL);
});

/** Legacy low-score saves still receive the canonical, non-gated route. */
test('an old cameHome false verdict cannot skip the now-canonical Margo beats', () => {
  const campaign = afterTheHandover();
  const story = walkToPhase(campaign, 'come_home', { cameHome: false });

  assert.equal(campaign.state.missions[MISSION_IDS.SILVER_ROOM].cameHome, false);
  assert.equal(story.phase(), 'come_home');
  assert.equal(story.margoComeHomeOwed(), true);
  assert.equal(story.margoComeHomeDone(), true);
  assert.equal(story.phase(), 'stayover');
  assert.deepEqual(story.sleep(), { ok: true, day: 7, timeMinutes: 7 * 60 + 10 });
  assert.equal(story.margoWakeOwed(), true);
  assert.equal(story.phase(), 'morning');
  assert.equal(story.margoWakeDone(), true);
  assert.equal(story.phase(), 'no_wake');
});

test('beat 18 leaves for South Harbor on Day 7 and comes back to this flat', () => {
  const campaign = afterTheHandover();
  const story = walkToPhase(campaign, 'no_wake');

  assert.deepEqual(story.tryLeave(), {
    kind: 'call',
    id: EVENT_IDS.LOU_NO_WAKE_CALL,
    line: 'Lou said he would call when he knew. I am not chasing him today.',
    vo: 'door.refusal.no_wake_call',
  });
  assert.equal(story.callAnswered(NO_WAKE_LOU_CALL), true);
  assert.equal(campaign.state.missions[MISSION_IDS.NO_WAKE].status, 'available');
  assert.deepEqual(story.tryLeave(), { kind: 'go', destination: SCENE_IDS.NO_WAKE });

  /* The harbour job's anchor moved two days with the route. On its old Day 5
   * anchor `Math.max(now, atLeast)` would have absorbed it whole and the
   * afternoon on the boat would have named no hour at all. */
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_NO_WAKE);
  assert.equal(campaign.state.story.day, 7);
  assert.equal(campaign.state.story.timeMinutes, 12 * 60 + 45);
});

test('beat 19 is a quiet evening and then the only doorway to the Silver Case', () => {
  const campaign = afterTheHandover();
  const story = walkToPhase(campaign, 'return');

  assert.equal(story.phase(), 'return');
  assert.equal(campaign.state.story.day, 7);
  assert.equal(campaign.state.story.timeMinutes, 17 * 60 + 20);
  assert.deepEqual(story.tryLeave(), {
    kind: 'call',
    id: EVENT_IDS.BOOSKI_SILVER_CASE_CALL,
    line: 'Bank’s done. Nobody’s called. And when nobody calls, you sit down.',
    vo: 'door.refusal.final_arc_locked',
  });

  /* Booskibro, not Lou: the case is going TO Lou, and a man does not ring
   * ahead to say he is expecting a delivery from you. */
  assert.equal(SILVER_CASE_BOOSKI_CALL.characterId, CHARACTER_IDS.BOOSKI);
  assert.equal(SILVER_CASE_BOOSKI_CALL.vo, 'call.booski.silver_case');
  assert.notEqual(SILVER_CASE_BOOSKI_CALL.vo, BIG_NIGHT_BOOSKI_CALL.vo);
  assert.notEqual(SILVER_CASE_BOOSKI_CALL.eventId, BIG_NIGHT_BOOSKI_CALL.eventId);

  assert.equal(story.callAnswered(SILVER_CASE_BOOSKI_CALL), true);
  assert.equal(story.callAnswered(SILVER_CASE_BOOSKI_CALL), false);
  assert.equal(story.phase(), 'complete');
  assert.deepEqual(story.tryLeave(), {
    kind: 'go', destination: SCENE_IDS.SILVER_CASE,
  });
});

test('beat 27 rings in the luxury apartment and leaves for the existing pickup', () => {
  const storage = new MemoryStorage();
  const campaign = afterTheHandover(storage);
  const story = walkToPhase(campaign, 'special_meeting');

  assert.equal(story.phase(), 'special_meeting');
  assert.equal(story.pendingCall(), SPECIAL_MEETING_BOOSKI_CALL);
  assert.deepEqual(story.tryLeave(), {
    kind: 'call',
    id: EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL,
    line: 'Nobody’s rung. Nobody’s rung all day.',
    hint: 'Answer Booskibro’s call.',
  });
  assert.equal(SPECIAL_MEETING_BOOSKI_CALL.allowHangup, false,
    'the player must hear who is collecting him before the lift opens');
  assert.match(SPECIAL_MEETING_BOOSKI_CALL.lines.join(' '), /Special one/);
  assert.match(SPECIAL_MEETING_BOOSKI_CALL.lines.join(' '), /Seff, Lag and Numbskull/);

  assert.equal(story.callAnswered(SPECIAL_MEETING_BOOSKI_CALL), true);
  assert.equal(story.callAnswered(SPECIAL_MEETING_BOOSKI_CALL), false,
    'SM-030 must be exact-once');
  assert.equal(campaign.state.story.timeEvents.filter(
    (id) => id === TIME_EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL,
  ).length, 1);
  assert.deepEqual(story.tryLeave(), {
    kind: 'go', destination: SCENE_IDS.SPECIAL_MEETING,
  });

  const reloaded = createLuxuryApartmentStory({ campaign: createCampaign({ storage }) });
  assert.equal(reloaded.pendingCall(), null, 'reload replayed the answered call');
  assert.deepEqual(reloaded.tryLeave(), {
    kind: 'go', destination: SCENE_IDS.SPECIAL_MEETING,
  });
});

test('the v21 Palace landing migration survives the v23 clock repair without eating the call', () => {
  const storage = new MemoryStorage();
  const current = afterTheHandover(storage);
  current.update((state) => {
    state.story.chapter = 'big_night';
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
    state.lastTransition = {
      from: SCENE_IDS.CARTEL_PALACE,
      to: SCENE_IDS.APARTMENT,
      spawn: 'front_door',
    };
    state.missions[MISSION_IDS.CARTEL_PALACE].status = 'complete';
    state.missions[MISSION_IDS.INITIATION].status = 'available';
    state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL].status = 'pending';
  });
  const oldLanding = current.state;
  oldLanding.version = 21;
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(oldLanding));

  const migrated = createCampaign({ storage });
  assert.equal(migrated.recoveredNow, false);
  assert.deepEqual(migrated.state.scene, {
    id: SCENE_IDS.LUXURY_APARTMENT, spawn: 'main',
  });
  assert.deepEqual(migrated.state.lastTransition, {
    from: SCENE_IDS.CARTEL_PALACE,
    to: SCENE_IDS.LUXURY_APARTMENT,
    spawn: 'main',
  });
  assert.equal(migrated.state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL].status, 'pending');
  assert.equal(createLuxuryApartmentStory({ campaign: migrated }).pendingCall(),
    SPECIAL_MEETING_BOOSKI_CALL);
});

/**
 * THE LEDGER IS EXACT-ONCE BY ID, AND THIS FLAT HAS FOUR VISITS.
 *
 * Two of its markers are anchored (the handover and the morning after) and
 * five are spans; a shared id between any two of them would price one beat
 * and hand the next one over for nothing. Asserted as a set rather than
 * spot-checked, so a sixth beat added here cannot quietly borrow a fifth id.
 */
test('every luxury-apartment marker is distinct and spent exactly once', () => {
  const ids = [
    TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT,
    TIME_EVENT_IDS.LUXURY_GET_READY,
    TIME_EVENT_IDS.LUXURY_MARGO_COME_HOME,
    TIME_EVENT_IDS.LUXURY_STAYOVER_REST,
    TIME_EVENT_IDS.LUXURY_MARGO_WAKE,
    TIME_EVENT_IDS.RETURN_LUXURY_APARTMENT,
  ];
  assert.equal(new Set(ids).size, ids.length, 'two luxury beats share one marker');
  /* And none of them is the starter flat's. Those two are still registered
   * for the saves that spent them under the old order. */
  for (const id of ids) {
    assert.notEqual(id, TIME_EVENT_IDS.MARGO_COME_HOME);
    assert.notEqual(id, TIME_EVENT_IDS.MARGO_WAKE);
  }

  const campaign = afterTheHandover();
  walkToPhase(campaign, 'complete');
  for (const id of ids) {
    assert.equal(campaign.state.story.timeEvents.filter((entry) => entry === id).length, 1, id);
  }
});

test('the whole flat survives a reload at every phase without replaying a beat', () => {
  for (const target of LUXURY_APARTMENT_PHASES) {
    const storage = new MemoryStorage();
    const campaign = afterTheHandover(storage);
    walkToPhase(campaign, target);
    const before = createLuxuryApartmentStory({ campaign }).phase();
    const reloaded = createLuxuryApartmentStory({ campaign: createCampaign({ storage }) });
    assert.equal(reloaded.phase(), before, `${target} did not survive a reload`);
  }
});

test('the objective panel says exactly what the door is waiting on', () => {
  const ready = walkToPhase(afterTheHandover(), 'get_ready').objectives();
  assert.equal(ready.phase, 'get_ready');
  assert.deepEqual(ready.items.map((item) => item.id), [TIME_EVENT_IDS.LUXURY_GET_READY]);

  const waiting = walkToPhase(afterTheHandover(), 'date').objectives();
  assert.deepEqual(waiting.items.map((item) => item.id), [EVENT_IDS.MARGO_DATE_CALL]);

  const quiet = walkToPhase(afterTheHandover(), 'return').objectives();
  assert.deepEqual(quiet.items.map((item) => item.id), [EVENT_IDS.BOOSKI_SILVER_CASE_CALL]);

  const leaving = walkToPhase(afterTheHandover(), 'complete').objectives();
  assert.deepEqual(leaving.items.map((item) => item.label),
    ['Leave for the Silver Case pickup']);
});
