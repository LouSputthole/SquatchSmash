import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_IDS,
  ITEM_IDS,
  MANSION_EVENING_BEATS_REQUIRED,
  MANSION_EVENING_BEAT_IDS,
  MISSION_IDS,
  SCENES,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  navigateCampaign,
} from '../src/core/campaign.js';
import {
  DAY_FOUR_LOU_HEIST_CALL,
  DAY_ONE_LOU_ATTABOY_CALL,
  DAY_ONE_LOU_CALL,
  DAY_TWO_BOOSKI_CALL,
  DAY_TWO_LOU_SECOND_CALL,
  HEIST_CLEANUP_ITEMS,
  HEIST_PREPARATION_ITEMS,
  BIG_NIGHT_BOOSKI_CALL,
  NEW_SPACE_LOU_CALL,
  NO_WAKE_LOU_CALL,
  SILVER_CASE_BOOSKI_CALL,
  SPECIAL_MEETING_BOOSKI_CALL,
  createApartmentStory,
} from '../src/core/apartment-story.js';
import {
  CABIN_HOSTAGE_IDS,
  COUNTRYSIDE_CABIN_LANDMARKS,
  createCountrysideCabinStory,
} from '../src/core/countryside-cabin-story.js';
import { createLuxuryApartmentStory } from '../src/core/luxury-apartment-story.js';
import { createSilentSquatchStory } from '../src/core/silent-squatch-story.js';
import { activeObjectiveItems } from '../src/core/objective-panel.js';
import { CABIN_PHONE_CALLS } from '../src/cabin/script.js';
import { cabinRuntimeHarness } from './helpers/cabin-runtime-harness.mjs';

/* The rest of the route, driven exactly as the scenes drive it. This file is
 * not the route's gate -- tests/fresh-save-campaign-route.test.mjs is -- so
 * everything between the hubs is fast-forwarded through the same public story
 * APIs and asserted only far enough to prove it happened. */
import { createAirstripStory } from '../src/core/airstrip-story.js';
import { createBankHeistStory } from '../src/core/bank-heist-story.js';
import {
  BADA_BING_TWO_CLEANUP_TASKS,
  createBadaBingTwoStory,
} from '../src/core/bada-bing-two-story.js';
import { createGraveyardStory } from '../src/core/graveyard-story.js';
import { createGolfStory } from '../src/core/golf-story.js';
import { createMotelStory } from '../src/core/motel-story.js';
import { createNoWakeStory } from '../src/core/no-wake-story.js';
import { createSilverStory } from '../src/core/silver-story.js';
import { createSquatchfatherStory } from '../src/core/squatchfather-story.js';
import {
  createCartelPalaceCampaignStory,
  createEnolaSquatchCampaignStory,
  createMansionReturnCampaignStory,
  createMansionSiegeCampaignStory,
  createSilverCaseCampaignStory,
} from '../src/core/final-arc-story.js';

/**
 * THE CAMPAIGN FLOW GATE.
 *
 * There are already two gates on the route itself.
 * `fresh-save-campaign-route.test.mjs` proves the SAVE walks end to end, and
 * `tools/verify-campaign-marathon.mjs` proves the PAGES hand off to each other
 * in a real browser. Both were green through every bug below, because neither
 * of them ever reads the thing the player actually reads.
 *
 * Two shipped examples of the class, both found by the owner playing:
 *
 *   - Day Two's evening panel showed every row ticked while the door held out
 *     for Lou's second call -- a call the list did not mention, because the
 *     chapter plan table only knows a chapter's FIRST telephone. Fixed with the
 *     `call` branch in `objectives()`; nothing but a person playing it could
 *     have noticed.
 *   - The cabin's opening phase drew "Get some sleep" over a bed that refused
 *     and a Lou call gated on a rest no runtime caller could ever award: a
 *     frame-one hard lock, on the live route, that every gate in the repo
 *     called green.
 *
 * So this file walks the same fresh save and, at every hub state on the way --
 * before and after each gate, and BETWEEN the intermediate activities, because
 * that is where the Day Two bug lived -- asks five questions of the story
 * layer that no other gate asks:
 *
 *   1. DOOR <-> PANEL COHERENCE. Whatever the door says it is waiting on, the
 *      panel has a not-done row that says the same thing. An all-ticked or
 *      empty panel over a shut door is a failure, and an open door with the
 *      panel still calling other work required is the same failure backwards.
 *   2. CALL SATISFIABILITY. When a door -- or a phase -- waits on a telephone,
 *      the machinery that rings it names the same event AND its preconditions
 *      are already met at that stop. The cabin runs the real
 *      `CabinChapterRuntime` here: the question is not "is the flag set" but
 *      "would this phone ring at this stop", which is the only question that
 *      would have caught the frame-one lock.
 *   3. GRAPH LEGALITY. Every `go` names a destination in `SCENES[here].next`.
 *      `Campaign.transition()` throws on the rest, at runtime, in front of the
 *      player.
 *   4. NAMED-CALLER TRUTH. A row that says "Answer X's call" is checked
 *      against the call definition the story would actually ring. Naming
 *      Booskibro while the door holds out for Lou is the Day Two bug's second
 *      half.
 *   5. EXACT-ONCE SANITY. No clock ledger id is spent twice, the clock never
 *      runs backwards, and doing what the door asked always changes what the
 *      player is being shown. A door that asks twice for the same thing is a
 *      lock with better manners.
 */

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

/** Route the way a scene page does. The href is `fresh-save`'s assertion. */
function go(campaign, sceneId, spawn) {
  navigateCampaign(campaign, sceneId, { spawn, location: { assign() {} } });
}

function reload(storage) {
  return createCampaign({ storage });
}

/* ------------------------------------------------------------------ */
/* The lexicons the panel is judged against                            */
/* ------------------------------------------------------------------ */

/**
 * Every telephone a panel row can name, and the definition behind it.
 *
 * Keyed by the id the row carries: the two apartments key their call rows by
 * campaign EVENT, the cabin's durable ledger keys its by the TIME EVENT that
 * records the conversation. Both end up at a definition with a `from`, which
 * is the name the panel is allowed to print.
 */
const CALL_DEFINITIONS = new Map([
  [EVENT_IDS.LOU_FIRST_CALL, DAY_ONE_LOU_CALL],
  [EVENT_IDS.LOU_ATTABOY_CALL, DAY_ONE_LOU_ATTABOY_CALL],
  [EVENT_IDS.BOOSKI_DAY_TWO_CALL, DAY_TWO_BOOSKI_CALL],
  [EVENT_IDS.LOU_SECOND_CALL, DAY_TWO_LOU_SECOND_CALL],
  [EVENT_IDS.LOU_NO_WAKE_CALL, NO_WAKE_LOU_CALL],
  [EVENT_IDS.LOU_GOLF_CALL, NEW_SPACE_LOU_CALL],
  [EVENT_IDS.LOU_HEIST_CALL, DAY_FOUR_LOU_HEIST_CALL],
  [EVENT_IDS.BOOSKI_BIG_NIGHT_CALL, BIG_NIGHT_BOOSKI_CALL],
  [EVENT_IDS.BOOSKI_SILVER_CASE_CALL, SILVER_CASE_BOOSKI_CALL],
  [EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL, SPECIAL_MEETING_BOOSKI_CALL],
  [TIME_EVENT_IDS.CABIN_LOU_OPENING_CALL, CABIN_PHONE_CALLS.LOU_ARRIVAL],
  [TIME_EVENT_IDS.CABIN_LAY_LOW_MARGO_CALL, CABIN_PHONE_CALLS.MARGO_FIRST_CALL],
  [TIME_EVENT_IDS.CABIN_LAY_LOW_BOOSKI_CALL, CABIN_PHONE_CALLS.BOOSKI_SASOLE],
  [TIME_EVENT_IDS.CABIN_GRATIN_CALL, CABIN_PHONE_CALLS.GRATIN_BASEMENT],
  [TIME_EVENT_IDS.CABIN_SECOND_BILLY_CALL, CABIN_PHONE_CALLS.BOOSKI_BILLY],
]);

/**
 * The words a panel is allowed to use for somewhere it is sending him.
 *
 * Three tables author these -- `SCENE_LABELS` in the starter flat,
 * `LUXURY_SCENE_LABELS` in the new one, `DEPARTURE_LABELS` at the cabin -- and
 * none of them can see the others. A departure row matches its door either by
 * carrying the canonical `depart.<scene>` id or by using one of these words.
 * The Special Meeting's entry is the interesting one: Act One is not allowed
 * to name what he is going to, so the only thing the panel may call it is the
 * car at the kerb (docs/SPECIAL-MEETING-SCRIPT.md).
 */
const DESTINATION_WORDS = Object.freeze({
  [SCENE_IDS.BADA_BING_ONE]: ['bing'],
  [SCENE_IDS.SQUATCHFATHER]: ['squatchfather'],
  [SCENE_IDS.AIRSTRIP_SMUGGLING]: ['airstrip'],
  [SCENE_IDS.BADA_BING_TWO]: ['bing'],
  [SCENE_IDS.SQUATCH_GRAVEYARD]: ['graveyard'],
  [SCENE_IDS.JERKY_MOTEL]: ['motel'],
  [SCENE_IDS.NO_WAKE]: ['south harbor'],
  [SCENE_IDS.SILVER_ROOM]: ['silver room', 'front & center'],
  [SCENE_IDS.SILVER_PINES]: ['silver pines'],
  [SCENE_IDS.BANK_HEIST]: ['bank', 'mercer'],
  [SCENE_IDS.LUXURY_APARTMENT]: ['new place'],
  [SCENE_IDS.COUNTRYSIDE_CABIN]: ['cabin'],
  [SCENE_IDS.SILVER_CASE]: ['silver case', 'lou’s next job'],
  [SCENE_IDS.SPECIAL_MEETING]: ['car downstairs'],
  [SCENE_IDS.INITIATION]: ['initiation'],
  [SCENE_IDS.MANSION]: ['mansion'],
});

/** "Answer Big Uncle Lou's call", "Wait for Booskibro about Billy Hotdog". */
const NAMES_A_CALLER = /\b(?:Answer|Wait for)\s+(.+?)(?:’s\b|\s+about\b)/;

/** Surname rule: "Lou" and "Big Uncle Lou" are the same man. */
const lastWord = (name) => String(name).trim().toLowerCase().split(/\s+/).pop();

function namesDestination(text, destination) {
  const words = DESTINATION_WORDS[destination] ?? [];
  const lower = String(text ?? '').toLowerCase();
  return words.some((word) => lower.includes(word));
}

/** What the door is holding out for, as one comparable string. */
function doorDemand(door) {
  return door.kind === 'go' ? `go:${door.destination}` : `${door.kind}:${door.id ?? ''}`;
}

/** The rows the player actually sees: `pending` hidden, finished work retired. */
const drawn = (items) => activeObjectiveItems(items);

/** Does this row say the same thing the door just said? */
function rowNamesDoor(row, door) {
  if (!row || row.done || !row.label) return false;
  if (door.kind === 'go') {
    return row.id === `depart.${door.destination}`
      || namesDestination(row.label, door.destination)
      || namesDestination(row.step, door.destination);
  }
  if (row.id === door.id) return true;
  if (door.label && row.label === door.label) return true;
  if (door.kind !== 'call') return false;
  const caller = CALL_DEFINITIONS.get(door.id)?.from;
  return Boolean(caller) && `${row.label} ${row.step ?? ''}`.toLowerCase()
    .includes(lastWord(caller));
}

/* ------------------------------------------------------------------ */
/* The gate itself                                                     */
/* ------------------------------------------------------------------ */

const DEMANDING_KINDS = new Set(['go', 'call', 'activity', 'item']);

function createFlowGate(campaignRef) {
  let hub = null;
  let spent = [];
  let clock = -1;
  let stopCount = 0;
  const hubNames = [];

  /**
   * A hub is one place the player stands in while its state changes under him.
   *
   * `ledger: false` says this hub's panel is a one-row projection of the
   * current phase rather than a durable checklist -- the cabin's is -- so the
   * orphan sweep below has nothing to sweep.
   */
  function begin(name, { ledger = true } = {}) {
    end();
    hub = { name, ledger, required: new Map(), demanded: new Set() };
    hubNames.push(name);
  }

  /**
   * REQUIRED WORK NOBODY EVER ASKS FOR.
   *
   * A row marked required that no door ever demanded and nothing ever ticked
   * is a lie told for the length of a whole chapter. It is the shape of the
   * retired-route leftover: the beat moves somewhere else, the door's branch
   * goes with it, and the panel keeps asking.
   */
  function end() {
    if (!hub) return;
    if (hub.ledger) {
      const orphans = [...hub.required].filter(([id]) => !hub.demanded.has(id)).map(([id]) => id);
      assert.deepEqual(orphans, [],
        `${hub.name}: the panel called work required that no door ever asked for `
        + 'and nothing ever ticked');
    }
    hub = null;
  }

  /**
   * One state, judged.
   *
   * @param {string} label where he is standing and what has happened so far
   * @param {object} probe the door's verdict, the panel's rows, and -- when a
   *   telephone is in the way -- the machinery that would ring it
   */
  function stop(label, {
    door,
    items = [],
    canRing = null,
    expectedCaller = null,
  }) {
    const where = `${hub?.name ?? 'nowhere'} · ${label}`;
    const state = campaignRef().state;
    stopCount += 1;

    assert.ok(door && typeof door.kind === 'string', `${where}: the door said nothing at all`);

    /* 5. EXACT-ONCE, and a clock that only goes one way. */
    const ledger = state.story.timeEvents;
    assert.equal(new Set(ledger).size, ledger.length,
      `${where}: a clock ledger id was spent twice`);
    for (const id of spent) {
      assert.ok(ledger.includes(id), `${where}: the ledger lost ${id}`);
    }
    spent = [...ledger];
    const absolute = (state.story.day - 1) * 24 * 60 + state.story.timeMinutes;
    assert.ok(absolute >= clock,
      `${where}: the clock ran backwards to day ${state.story.day} ${state.story.timeMinutes}`);
    clock = absolute;

    const rows = drawn(items);
    const open = rows.filter((row) => !row.done);

    /* 1. DOOR <-> PANEL COHERENCE. */
    if (door.kind !== 'go') {
      assert.ok(open.length > 0,
        `${where}: the door refused (${doorDemand(door)}) and the panel had nothing left to do`);
      assert.deepEqual(open.filter((row) => String(row.id).startsWith('depart.')), [],
        `${where}: the door refused and the panel still says he can leave`);
    }
    if (DEMANDING_KINDS.has(door.kind)) {
      assert.ok(items.some((row) => rowNamesDoor(row, door)),
        `${where}: the door is waiting on ${doorDemand(door)} and no row says so `
        + `(panel: ${JSON.stringify(rows.map((row) => row.label))})`);
    }
    if (door.kind === 'go') {
      const stragglers = open
        .filter((row) => row.required !== false && !rowNamesDoor(row, door))
        .map((row) => row.id);
      assert.deepEqual(stragglers, [],
        `${where}: the door is open and the panel still calls other work required`);
    }

    /* 2. CALL SATISFIABILITY. */
    if (door.kind === 'call') {
      assert.ok(canRing, `${where}: a call door with no telephone behind it`);
      assert.equal(canRing(door.id), true,
        `${where}: the door waits on ${door.id} and nothing can ring it here`);
    }

    /* 3. GRAPH LEGALITY. */
    if (door.kind === 'go') {
      const here = state.scene.id;
      assert.ok(SCENES[here].next.includes(door.destination),
        `${where}: ${here} -> ${door.destination} is not on the whitelist and transition() throws`);
    }

    /* 4. NAMED-CALLER TRUTH.
     *
     * The two apartments key a call row by its campaign event, so the
     * definition comes off the row itself. The cabin's panel is a phase
     * projection whose id names the beat rather than the call ("cabin.lay_low"
     * is Lou on the first morning and Gratin on the second), so that hub hands
     * in the caller its own phase table says is on the other end. */
    for (const row of items) {
      const text = row.step ? `${row.label} · ${row.step}` : (row.label ?? '');
      const named = NAMES_A_CALLER.exec(text);
      if (!named) continue;
      const caller = CALL_DEFINITIONS.get(row.id)?.from ?? expectedCaller;
      assert.ok(caller,
        `${where}: "${text}" names a caller but ${row.id} is not a call this story rings`);
      assert.equal(lastWord(named[1]), lastWord(caller),
        `${where}: the panel says "${text}" and the phone would ring ${caller}`);
    }

    /* Bookkeeping for the hub sweep. */
    if (hub) {
      hub.demanded.add(door.kind === 'go' ? `depart.${door.destination}` : door.id);
      for (const row of items) {
        if (row.required !== true) continue;
        if (row.done) hub.required.delete(row.id);
        else if (!hub.required.has(row.id)) hub.required.set(row.id, row.label);
      }
    }
    return { where, door, items, rows, demand: doorDemand(door) };
  }

  /**
   * He did what was asked, and the game moved.
   *
   * The failure this exists for is a door that demands an action, accepts it,
   * and demands it again -- the panel unchanged, the player repeating himself
   * looking for the thing he has already done. The player-facing state is the
   * door's demand AND the row the panel is pointing at, because a beat can
   * legitimately keep the same door while the list moves on.
   */
  function advanced(before, after) {
    const shown = (stopRecord) => [
      stopRecord.demand,
      stopRecord.rows
        .filter((row) => !row.done)
        /* The step is part of what he reads: the cabin's four walks are one
         * row whose step counts them off, and a tour that never says which
         * corner is left is the report that reached the owner. */
        .map((row) => `${row.id}:${row.label}:${row.step ?? ''}`)
        .join('|'),
    ].join(' -- ');
    assert.notEqual(shown(after), shown(before),
      `${after.where}: doing what the door asked left it asking for the same thing `
      + `(${shown(before)})`);
  }

  return {
    begin,
    end,
    stop,
    advanced,
    get stops() { return stopCount; },
    get hubs() { return [...hubNames]; },
  };
}

/* ------------------------------------------------------------------ */
/* The cabin's telephone, asked the only question that matters         */
/* ------------------------------------------------------------------ */

/**
 * Would this phone ring, here, on its own?
 *
 * A fresh runtime is built on the live save at each call stop and ticked. It
 * is thrown away afterwards -- `stop()` hangs up under `_suppressCallEnd`, so
 * a ring that nobody answers awards nothing and the walk keeps ownership of
 * the story. Twelve simulated seconds is well inside the two-minute lay-low
 * fallback and the five-minute walk concession, so neither of the owner's
 * mercy timers can stand in for a call that would never come.
 */
function cabinPhoneOffers(campaign, definitionId, { seconds = 12 } = {}) {
  const harness = cabinRuntimeHarness(campaign);
  harness.runtime.start();
  for (let frame = 0; frame < seconds * 10; frame += 1) {
    if (harness.phone.rings.includes(definitionId)) break;
    harness.runtime.update(0.1);
  }
  const rang = harness.phone.rings.includes(definitionId);
  harness.runtime.stop();
  return rang;
}

/** Margo's is the one he places himself, so ask the interaction instead. */
function cabinCanCallMargo(campaign) {
  const harness = cabinRuntimeHarness(campaign);
  harness.runtime.start();
  const started = harness.runtime.startMargoCall();
  harness.runtime.stop();
  return started;
}

/**
 * The cabin phases that stand still until a telephone moves, and what has to
 * be true for one to. `ready` is the story predicate `_updateCalls` consults
 * before it dials; the walk then makes the runtime prove it by ringing.
 */
const CABIN_CALL_PHASES = Object.freeze({
  opening_call: {
    definition: CABIN_PHONE_CALLS.LOU_ARRIVAL,
    ready: (story) => story.arrivalRestComplete() && !story.openingCallComplete(),
  },
  margo_call: {
    definition: CABIN_PHONE_CALLS.MARGO_FIRST_CALL,
    ready: (story) => story.margoCallReady(),
    outgoing: true,
  },
  booski_call: {
    definition: CABIN_PHONE_CALLS.BOOSKI_SASOLE,
    ready: (story) => story.booskiSasoleCallReady(),
  },
  gratin_call: {
    definition: CABIN_PHONE_CALLS.GRATIN_BASEMENT,
    ready: (story) => story.gratinCallReady(),
  },
  billy_call: {
    definition: CABIN_PHONE_CALLS.BOOSKI_BILLY,
    ready: (story) => story.billyCallReady(),
  },
});

test('every hub state on the fresh-save route agrees with its own front door', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  const flow = createFlowGate(() => campaign);

  /* ============================================================== *
   * BEAT 1. The starter flat, four minutes past five PM on Day One.
   * ============================================================== */
  let apartment = createApartmentStory({ campaign, ring: () => true });
  const flat = (extra = {}) => {
    const activities = { ...campaign.state.activities, ...extra };
    return {
      door: apartment.tryLeave(activities),
      items: apartment.objectives(activities).items,
      canRing: (eventId) => apartment.pendingCall()?.eventId === eventId,
    };
  };

  flow.begin('the starter flat · Day One');
  const wakeUp = flow.stop('awake, nothing done', flat());
  assert.equal(wakeUp.door.kind, 'call');
  /* The chapter's own telephone is `pending` until it rings, on purpose: a
   * call he cannot answer, listed and unticked, reads as a thing he failed to
   * do. It has to be ON the list all the same -- that is invariant 1 -- and it
   * has to be the row the panel points at the moment the phone goes. */
  const ringing = flow.stop('the phone is ringing',
    flat({ ringingCallId: EVENT_IDS.LOU_FIRST_CALL }));
  assert.equal(drawn(ringing.items).find((row) => row.current)?.id, EVENT_IDS.LOU_FIRST_CALL);

  assert.equal(apartment.callAnswered(DAY_ONE_LOU_CALL), true);
  let previous = flow.stop('Lou answered, the four chores ahead', flat());
  flow.advanced(ringing, previous);

  /* The chores, one at a time, because the panel and the door disagreeing
   * about which one is next is exactly the class of thing this file exists
   * for. `advanceTime` + a flag is what `completeApartmentActivity` does. */
  for (const [activity, eventId] of [
    ['eaten', TIME_EVENT_IDS.EAT],
    ['showered', TIME_EVENT_IDS.SHOWER],
    ['peed', TIME_EVENT_IDS.PEE],
    ['pooped', TIME_EVENT_IDS.POOP],
    ['changedClothes', TIME_EVENT_IDS.CHANGE_CLOTHES],
  ]) {
    assert.equal(previous.door.id, activity, 'the door is asking for the chores out of order');
    campaign.advanceTime(eventId, (state) => { state.activities[activity] = true; });
    const next = flow.stop(`${activity} done`, flat());
    flow.advanced(previous, next);
    previous = next;
  }
  assert.deepEqual(previous.door, { kind: 'go', destination: SCENE_IDS.BADA_BING_ONE });
  flow.end();

  /* Beats 2 and 3, fast-forwarded. */
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_ONE, (state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'in_progress';
  });
  go(campaign, SCENE_IDS.BADA_BING_ONE, 'driver_seat');
  campaign.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.BADA_BING_ONE].packageReceived = true;
    state.missions[MISSION_IDS.BADA_BING_ONE].ending = 'warned';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'available';
  });
  go(campaign, SCENE_IDS.SQUATCHFATHER, 'restaurant_exterior');
  const squatchfather = createSquatchfatherStory({ campaign });
  assert.equal(squatchfather.begin().ok, true);
  assert.equal(squatchfather.complete(), true);
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_CABIN_LAY_LOW);
  go(campaign, SCENE_IDS.COUNTRYSIDE_CABIN, 'arrival');

  /* ============================================================== *
   * BEATS 4 TO 7. The cabin, which is one scene the Beef Run cuts in half.
   *
   * Its panel is a single row projected from `phase()` rather than a
   * checklist, so the hub sweep is off and the phase is the thing under
   * test: every phase that waits on a telephone is asked whether the real
   * runtime would actually ring it there.
   * ============================================================== */
  let cabin = createCountrysideCabinStory({ campaign });
  const atTheCabin = () => {
    const phase = cabin.phase();
    const waiting = CABIN_CALL_PHASES[phase];
    if (waiting) {
      assert.equal(waiting.ready(cabin), true,
        `the cabin sits in ${phase} and its own readiness gate says the call cannot come`);
      const reachable = waiting.outgoing
        ? cabinCanCallMargo(campaign)
        : cabinPhoneOffers(campaign, waiting.definition.id);
      assert.equal(reachable, true,
        `the cabin sits in ${phase} and the runtime never gets `
        + `${waiting.definition.id} to the player`);
      const plan = cabin.objectivePlan();
      assert.ok(
        `${plan.label} ${plan.step}`.toLowerCase().includes(lastWord(waiting.definition.from)),
        `${phase}: the panel says "${plan.label} · ${plan.step}" and the caller is `
        + `${waiting.definition.from}`,
      );
    }
    return {
      door: cabin.tryLeave(),
      items: cabin.objectives(),
      expectedCaller: waiting?.definition.from ?? null,
    };
  };

  flow.begin('the countryside cabin · visit one', { ledger: false });
  let atCabin = flow.stop('out of the car at 05:20', atTheCabin());
  assert.equal(cabin.phase(), 'arrival_rest');
  /* Nothing rings before the bed. The one joke this scene must not make. */
  assert.equal(cabinPhoneOffers(campaign, CABIN_PHONE_CALLS.LOU_ARRIVAL.id, { seconds: 5 }), false,
    'Lou rings at half five in the morning to tell a man to relax');

  assert.equal(cabin.completeArrivalRest().ok, true);
  let nextStop = flow.stop('awake at 09:20', atTheCabin());
  flow.advanced(atCabin, nextStop);
  atCabin = nextStop;
  assert.equal(cabin.phase(), 'opening_call');

  assert.equal(cabin.completeOpeningCall().ok, true);
  nextStop = flow.stop('Lou answered, four corners to walk', atTheCabin());
  flow.advanced(atCabin, nextStop);
  atCabin = nextStop;

  for (const { id, shortLabel } of COUNTRYSIDE_CABIN_LANDMARKS) {
    assert.equal(cabin.visit(id).ok, true);
    nextStop = flow.stop(`walked as far as the ${shortLabel.toLowerCase()}`, atTheCabin());
    flow.advanced(atCabin, nextStop);
    atCabin = nextStop;
  }
  assert.equal(cabin.phase(), 'margo_call');

  assert.equal(cabin.completeMargoCall().ok, true);
  nextStop = flow.stop('the date is made', atTheCabin());
  flow.advanced(atCabin, nextStop);
  atCabin = nextStop;
  assert.equal(cabin.phase(), 'booski_call');

  assert.equal(cabin.completeBooskiSasoleCall().ok, true);
  nextStop = flow.stop('Booskibro has said the word', atTheCabin());
  flow.advanced(atCabin, nextStop);
  assert.deepEqual(nextStop.door, {
    kind: 'go', destination: SCENE_IDS.AIRSTRIP_SMUGGLING,
  });
  flow.end();

  /* Beat 6, fast-forwarded, and back to the property he left from. */
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_AIRSTRIP);
  go(campaign, SCENE_IDS.AIRSTRIP_SMUGGLING, 'hangar');
  const airstrip = createAirstripStory({ campaign });
  assert.equal(airstrip.begin().ok, true);
  assert.equal(airstrip.checkpoint('remote_strip'), true);
  assert.equal(airstrip.loadCargo(), true);
  assert.equal(airstrip.checkpoint('returning'), true);
  assert.equal(airstrip.checkpoint('landed_home'), true);
  assert.equal(airstrip.complete({ landingQuality: 'clean' }), true);
  campaign.advanceTime(TIME_EVENT_IDS.RETURN_CABIN_FROM_AIRSTRIP);
  go(campaign, SCENE_IDS.COUNTRYSIDE_CABIN, 'arrival');

  campaign = reload(storage);
  cabin = createCountrysideCabinStory({ campaign });
  flow.begin('the countryside cabin · the dungeon', { ledger: false });
  atCabin = flow.stop('the aeroplane is down', atTheCabin());
  /* `src/beefrun/main.js` charges the seventy-minute drive back before it
   * navigates, so a live save is never in the cabin's `return_to_cabin`
   * phase -- it walks in the door already owing the second night. */
  assert.equal(cabin.returnedFromAirstrip(), true);
  assert.equal(cabin.phase(), 'second_rest');

  const cabinSteps = [
    ['a second night slept', () => cabin.completeSecondRest()],
    ['Gratin answered', () => cabin.completeGratinCall()],
    ['the cellar is open', () => cabin.openCellar()],
    ['down in the dungeon', () => cabin.enterDungeon()],
  ];
  for (const [label, act] of cabinSteps) {
    assert.equal(act().ok, true, label);
    nextStop = flow.stop(label, atTheCabin());
    flow.advanced(atCabin, nextStop);
    atCabin = nextStop;
  }

  assert.equal(cabin.phase(), 'interrogation');
  for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
    const hostage = cabin.hostageState(id);
    assert.equal(cabin.hitHostage(id, { hits: hostage.threshold }).ok, true);
    nextStop = flow.stop(`${id} is talking`, atTheCabin());
    flow.advanced(atCabin, nextStop);
    atCabin = nextStop;
  }
  assert.equal(cabin.learnAteamIntel().ok, true);
  nextStop = flow.stop('the Short Bus, and no name to go with it', atTheCabin());
  flow.advanced(atCabin, nextStop);
  atCabin = nextStop;

  /* THE ONE DECISION IN THIRTY-ONE BEATS. Either branch has to leave the
   * panel and the door agreeing; the walk takes the Prospect's. */
  assert.equal(cabin.chooseExecution('player').ok, true);
  nextStop = flow.stop('the Prospect takes the pistol', atTheCabin());
  flow.advanced(atCabin, nextStop);
  atCabin = nextStop;

  for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
    const hostage = cabin.hostageState(id);
    assert.equal(cabin.damageHostage(id, { hits: hostage.remaining }).ok, true);
    assert.equal(cabin.killHostage(id).ok, true);
    nextStop = flow.stop(`${id} is finished`, atTheCabin());
    flow.advanced(atCabin, nextStop);
    atCabin = nextStop;
  }

  /* NIGHTFALL IS THE CLOCK, NOT AN INSTRUCTION. The panel deliberately reads
   * the same on both sides of 20:45 -- he is listening to Gratin before it and
   * he is listening to Gratin after it -- so this pair is the one place the
   * walk does not ask for the shown state to change. The beat that ends it is
   * the briefing, and that one does have to move the panel. */
  assert.equal(cabin.completeNightfall().ok, true);
  atCabin = flow.stop('20:45 and dark', atTheCabin());
  assert.equal(cabin.completeNightfallBriefing().ok, true);
  nextStop = flow.stop('Gratin has said his piece', atTheCabin());
  flow.advanced(atCabin, nextStop);
  atCabin = nextStop;

  for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
    assert.equal(cabin.wrapHostage(id).ok, true);
    nextStop = flow.stop(`${id} wrapped`, atTheCabin());
    flow.advanced(atCabin, nextStop);
    atCabin = nextStop;
  }
  for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
    assert.equal(cabin.moveBodyToFire(id).ok, true);
    nextStop = flow.stop(`${id} carried to the fire`, atTheCabin());
    flow.advanced(atCabin, nextStop);
    atCabin = nextStop;
  }
  assert.equal(cabin.stageBodies().ok, true);

  for (const [label, act] of [
    ['gasoline poured', () => cabin.pourGas()],
    ['the pyre is lit', () => cabin.igniteBonfire()],
    ['the dungeon is cleared', () => cabin.completeFireCleanup()],
    ['a drink by the fire', () => cabin.drink()],
    ['the night goes dark', () => cabin.blackout()],
    ['Booskibro about Billy', () => cabin.completeBillyCall()],
  ]) {
    assert.equal(act().ok, true, label);
    nextStop = flow.stop(label, atTheCabin());
    flow.advanced(atCabin, nextStop);
    atCabin = nextStop;
  }
  assert.equal(cabin.phase(), 'complete');
  assert.deepEqual(atCabin.door, { kind: 'go', destination: SCENE_IDS.BADA_BING_TWO });
  flow.end();

  /* Beats 8 to 10, fast-forwarded: the party, the burial, the motel. */
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_CABIN_FOR_TOWN);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_TWO);
  go(campaign, SCENE_IDS.BADA_BING_TWO, 'driver_seat');
  const bingTwo = createBadaBingTwoStory({ campaign });
  assert.equal(bingTwo.begin().ok, true);
  assert.equal(bingTwo.recordAttack({ attackResolved: true }), true);
  for (const task of BADA_BING_TWO_CLEANUP_TASKS) assert.equal(bingTwo.recordCleanup(task), true);
  assert.equal(bingTwo.completeClub({
    assignment: 'reserve_pickup', bodyWrapped: true, bodyLoaded: true,
  }), true);
  go(campaign, SCENE_IDS.SQUATCH_GRAVEYARD, 'headlights');
  const graveyard = createGraveyardStory({ campaign });
  assert.equal(graveyard.begin().ok, true);
  assert.equal(graveyard.complete({ bodyBuried: true }), true);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_JERKY_MOTEL);
  go(campaign, SCENE_IDS.JERKY_MOTEL, 'passenger_seat');
  const motel = createMotelStory({ campaign });
  assert.equal(motel.begin().ok, true);
  assert.equal(motel.complete({
    ending: 'home', cargoRecovered: true, packagesIntact: 7, freshness: 81, policeHeat: 24,
  }), true);
  go(campaign, SCENE_IDS.APARTMENT, 'front_door');

  /* ============================================================== *
   * BEAT 11. Home from the Motel before dawn, with nothing left on the
   * list -- and this is the state the pastime table used to answer with
   * "put the news on", twenty-two hours after the morning that asked for
   * it. The door was fixed; the panel is what this stop watches.
   * ============================================================== */
  campaign = reload(storage);
  apartment = createApartmentStory({ campaign, ring: () => true });
  flow.begin('the starter flat · home from the Motel');
  const homeFromTheMotel = flow.stop('06:30, everything done', flat());
  assert.equal(homeFromTheMotel.door.kind, 'stay');
  flow.end();

  /* ============================================================== *
   * BEAT 11.5. THE TAKE, from the flat's own morning.
   * ============================================================== */
  assert.deepEqual(apartment.sleep(), {
    ok: true, chapter: 'heist_day', day: 5, timeMinutes: 12 * 60,
  });
  flow.begin('the starter flat · the morning of THE TAKE');
  let heistStop = flow.stop('noon, and Lou has not rung', flat());
  const heistRinging = flow.stop('the phone is ringing',
    flat({ ringingCallId: EVENT_IDS.LOU_HEIST_CALL }));
  flow.advanced(heistStop, heistRinging);

  assert.equal(apartment.callAnswered(DAY_FOUR_LOU_HEIST_CALL), true);
  heistStop = flow.stop('the job is named', flat());
  assert.equal(heistStop.door.id, 'playedCounterSquatch');
  campaign.advanceTime(TIME_EVENT_IDS.PLAY_COUNTER_SQUATCH, (state) => {
    state.activities.playedCounterSquatch = true;
  });
  let kitStop = flow.stop('one game with the boys', flat());
  flow.advanced(heistStop, kitStop);

  for (const item of HEIST_PREPARATION_ITEMS) {
    assert.equal(kitStop.door.id, item.id, 'the door is packing the kit out of order');
    assert.equal(apartment.collectHeistPreparation(item.id), true);
    const next = flow.stop(`${item.id} packed`, flat());
    flow.advanced(kitStop, next);
    kitStop = next;
  }
  assert.deepEqual(kitStop.door, { kind: 'go', destination: SCENE_IDS.BANK_HEIST });
  flow.end();

  campaign.advanceTime(TIME_EVENT_IDS.DEPART_BANK_HEIST);
  go(campaign, SCENE_IDS.BANK_HEIST, 'safehouse');
  const heist = createBankHeistStory({ campaign });
  assert.equal(heist.begin().ok, true);
  for (const checkpoint of [
    'safehouse_ready', 'bank_secured', 'vault_open', 'street_withdrawal',
    'mercer_garage', 'vehicle_swap', 'safehouse_debrief',
  ]) {
    assert.equal(heist.checkpoint(checkpoint), true);
  }
  assert.equal(heist.answerDebriefCall(), true);
  assert.equal(heist.complete({ bagsRecovered: 7, grossTake: 1_260_000 }), true);
  go(campaign, SCENE_IDS.APARTMENT, 'front_door');

  /* ============================================================== *
   * BEAT 12. The flat's last evening: wash the bank off, and then a
   * telephone about a new space.
   * ============================================================== */
  campaign = reload(storage);
  apartment = createApartmentStory({ campaign, ring: () => true });
  assert.equal(campaign.state.story.chapter, 'post_heist');
  flow.begin('the starter flat · the evening of THE TAKE');
  let eveningStop = flow.stop('in the door with the bank still on him', flat());
  for (const item of HEIST_CLEANUP_ITEMS) {
    assert.equal(eveningStop.door.id, item.id, 'the door is cleaning up out of order');
    assert.equal(apartment.completeHeistCleanup(item.id), true);
    const next = flow.stop(`${item.id} done`, flat());
    flow.advanced(eveningStop, next);
    eveningStop = next;
  }
  assert.equal(eveningStop.door.id, EVENT_IDS.LOU_GOLF_CALL);
  const newSpaceRinging = flow.stop('the phone is ringing',
    flat({ ringingCallId: EVENT_IDS.LOU_GOLF_CALL }));
  flow.advanced(eveningStop, newSpaceRinging);

  assert.equal(apartment.callAnswered(NEW_SPACE_LOU_CALL), true);
  const bedTime = flow.stop('a new space, and a tee time', flat());
  flow.advanced(newSpaceRinging, bedTime);
  assert.equal(bedTime.door.kind, 'stay');
  flow.end();

  /* ============================================================== *
   * BEAT 13. The morning of the round, and the last morning this flat
   * is ever used for.
   * ============================================================== */
  assert.deepEqual(apartment.sleep(), {
    ok: true, chapter: 'golf_morning', day: 6, timeMinutes: 7 * 60,
  });
  flow.begin('the starter flat · the morning of the round');
  const beforeTheRound = flow.stop('seven o’clock, nobody is calling', flat());
  assert.equal(beforeTheRound.door.id, 'playedSquatchShoot');
  campaign.advanceTime(TIME_EVENT_IDS.PLAY_SQUATCH_SHOOT, (state) => {
    state.activities.playedSquatchShoot = true;
  });
  const leavingForGolf = flow.stop('the eye is warm', flat());
  flow.advanced(beforeTheRound, leavingForGolf);
  assert.deepEqual(leavingForGolf.door, { kind: 'go', destination: SCENE_IDS.SILVER_PINES });
  flow.end();

  campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_PINES);
  go(campaign, SCENE_IDS.SILVER_PINES, 'car_park');
  const golf = createGolfStory({ campaign });
  assert.equal(golf.begin().ok, true);
  assert.equal(golf.recordHole({
    hole: 1, par: 3, strokes: 4, heardInvitation: true, rodeWithLou: true,
  }), true);
  assert.equal(golf.recordHole({ hole: 2, par: 5, strokes: 6 }), true);
  assert.equal(golf.recordHole({ hole: 3, par: 4, strokes: 5 }), true);
  assert.equal(golf.complete(), true);
  campaign.advanceTime(TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT);
  go(campaign, SCENE_IDS.LUXURY_APARTMENT, 'arrival');

  /* ============================================================== *
   * BEAT 14. The new address, and the one thing it asks for.
   * ============================================================== */
  campaign = reload(storage);
  let luxury = createLuxuryApartmentStory({ campaign });
  const upstairs = (leaveContext) => ({
    door: luxury.tryLeave(leaveContext),
    items: luxury.objectives(leaveContext).items,
    canRing: (eventId) => luxury.pendingCall()?.eventId === eventId,
  });

  flow.begin('the luxury apartment · the keys');
  const handover = flow.stop('in the door with a set of keys', upstairs());
  assert.equal(handover.door.id, TIME_EVENT_IDS.LUXURY_GET_READY);
  assert.deepEqual(luxury.completeGetReady(), { ok: true });
  const readyForDinner = flow.stop('showered and dressed', upstairs());
  flow.advanced(handover, readyForDinner);
  assert.deepEqual(readyForDinner.door, { kind: 'go', destination: SCENE_IDS.SILVER_ROOM });
  flow.end();

  campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_ROOM);
  go(campaign, SCENE_IDS.SILVER_ROOM, 'kerb');
  const silver = createSilverStory({ campaign });
  assert.equal(silver.begin().ok, true);
  assert.equal(silver.complete({
    outcome: 'strong', woo: 74, band: 'midnight_pines', tippedEverybody: true,
    rememberedDrink: true, seeingHerAgain: true, cameHome: true,
    date: { knowsWhatHeDoes: true },
  }), true);
  go(campaign, SCENE_IDS.LUXURY_APARTMENT, 'main');

  /* ============================================================== *
   * BEATS 16 TO 18. She comes home, the night passes, she goes, and
   * only then does anything criminal ring.
   * ============================================================== */
  campaign = reload(storage);
  luxury = createLuxuryApartmentStory({ campaign });
  flow.begin('the luxury apartment · the stayover');
  let night = flow.stop('she came home with him', upstairs());
  assert.equal(luxury.phase(), 'come_home');
  /* The bed refuses here, so the panel must not be the thing saying "Sleep":
   * a list that names the one action the story will not accept sends a man to
   * a bed that says no, and then he assumes the bed is broken. */
  assert.deepEqual(luxury.sleep(), { ok: false, reason: 'margo_still_arriving' });
  assert.equal(night.rows[0].label, 'Follow Margo upstairs');
  /* AND ONE HALF OF THIS THAT THE GATE CANNOT CLOSE, WRITTEN DOWN RATHER THAN
   * QUIETLY DROPPED. The door's spoken refusal on this beat is still the
   * stayover's -- "She is asleep. Whatever is out there can stay out there.
   * Bed." -- and she is on the stairs, not asleep;
   * `src/luxury-apartment/main.js` says that line at the bed when `sleep()`
   * refuses. It is not fixed here because the keys of DEPARTURE_REFUSALS ARE
   * CUE NAMES (see that table's banner in core/apartment-story.js): a fourth
   * key is a new line on the voice sheet and a recording to make, which is an
   * owner's call and not a test's. The panel is this file's business and the
   * panel is now honest. */
  assert.equal(luxury.margoComeHomeDone(), true);
  let after = flow.stop('she is in, and asleep', upstairs());
  flow.advanced(night, after);
  night = after;

  assert.deepEqual(luxury.sleep(), { ok: true, day: 7, timeMinutes: 7 * 60 + 10 });
  after = flow.stop('the morning after', upstairs());
  flow.advanced(night, after);
  night = after;
  assert.equal(luxury.phase(), 'morning');

  assert.equal(luxury.margoWakeDone(), true);
  after = flow.stop('she has gone', upstairs());
  flow.advanced(night, after);
  assert.equal(after.door.id, EVENT_IDS.LOU_NO_WAKE_CALL);

  assert.equal(luxury.callAnswered(NO_WAKE_LOU_CALL), true);
  const leavingForTheHarbour = flow.stop('Lou has named the harbour', upstairs());
  flow.advanced(after, leavingForTheHarbour);
  assert.deepEqual(leavingForTheHarbour.door, { kind: 'go', destination: SCENE_IDS.NO_WAKE });
  flow.end();

  campaign.advanceTime(TIME_EVENT_IDS.DEPART_NO_WAKE);
  go(campaign, SCENE_IDS.NO_WAKE, 'gate_c');
  const noWake = createNoWakeStory({ campaign });
  assert.equal(noWake.begin().ok, true);
  assert.equal(noWake.complete({
    betrayalConfirmed: true, playerFired: true, bodyDisposed: true,
  }), true);
  campaign.advanceTime(TIME_EVENT_IDS.RETURN_LUXURY_APARTMENT);
  go(campaign, SCENE_IDS.LUXURY_APARTMENT, 'main');

  /* ============================================================== *
   * BEAT 19. A quiet evening, and the only reachable door into the
   * last third of the game.
   * ============================================================== */
  campaign = reload(storage);
  luxury = createLuxuryApartmentStory({ campaign });
  flow.begin('the luxury apartment · the quiet evening');
  const quiet = flow.stop('home from the dock', upstairs());
  assert.equal(quiet.door.id, EVENT_IDS.BOOSKI_SILVER_CASE_CALL);
  assert.equal(luxury.callAnswered(SILVER_CASE_BOOSKI_CALL), true);
  const leavingForTheCase = flow.stop('something sensitive is coming', upstairs());
  flow.advanced(quiet, leavingForTheCase);
  assert.deepEqual(leavingForTheCase.door, { kind: 'go', destination: SCENE_IDS.SILVER_CASE });
  flow.end();

  go(campaign, SCENE_IDS.SILVER_CASE, 'car_ride');
  const silverCase = createSilverCaseCampaignStory({ campaign });
  assert.equal(silverCase.begin().ok, true);
  assert.equal(silverCase.checkpoint('case_reveal'), true);
  assert.equal(silverCase.checkpoint('bathroom_ambush'), true);
  assert.equal(silverCase.complete({ winstonOutcome: 'spared', irritatedApe: false }), true);

  /* ============================================================== *
   * BEAT 22. The mansion evening.
   *
   * There is no door here and no panel this side of the browser -- the
   * guest bed's gate and the pause-menu list both live in
   * src/mansion/main.js -- so what the story layer owes is the ledger
   * the bed reads: five things on offer, any two of them, banked once
   * each, and a night that cannot be slept twice.
   * ============================================================== */
  campaign = reload(storage);
  go(campaign, SCENE_IDS.MANSION, 'gate');
  const silentSquatch = createSilentSquatchStory({ campaign });
  assert.equal(silentSquatch.begin().ok, true);
  for (const checkpoint of ['office', 'lab', 'silent_night']) {
    assert.equal(silentSquatch.checkpoint(checkpoint), true);
  }
  assert.equal(silentSquatch.complete({
    case: { placedOnDesk: true, delivered: true },
    keypad: { locked: true },
    aubbie: { killed: true },
    gasStages: ['armed', 'released'],
    collapsed: ['scientist_2', 'scientist_3'],
  }), true);

  assert.equal(silentSquatch.windDown.ready, false,
    'the guest bed is available the moment Lou says goodnight, which is the bug');
  let banked = 0;
  for (const beat of MANSION_EVENING_BEAT_IDS) {
    const before = silentSquatch.windDown;
    assert.equal(silentSquatch.logEveningBeat(beat), true, beat);
    assert.equal(silentSquatch.logEveningBeat(beat), false,
      `${beat}: a settling-in beat banked itself twice`);
    banked += 1;
    const now = silentSquatch.windDown;
    assert.equal(now.done.length, before.done.length + 1, `${beat}: the tally did not move`);
    assert.equal(now.ready, banked >= MANSION_EVENING_BEATS_REQUIRED,
      `${beat}: the bed and the tally disagree about whether he has wound down`);
  }
  assert.deepEqual(silentSquatch.restAtMansion(), { ok: true, chapter: 'mansion_siege' });
  assert.deepEqual(silentSquatch.restAtMansion(), { ok: false, reason: 'already_rested' });
  assert.equal(
    campaign.state.story.timeEvents.filter((id) => id === TIME_EVENT_IDS.REST_AT_MANSION).length,
    1,
    'the guest room charged its night to the clock more than once',
  );
  assert.equal(silentSquatch.logEveningBeat(MANSION_EVENING_BEAT_IDS[0]), false,
    'the evening is still taking bookings after he has gone to bed');

  /* Beats 23 to 26, fast-forwarded: the siege, Enola, the repaired house
   * and the Palace. */
  campaign = reload(storage);
  go(campaign, SCENE_IDS.MANSION_SIEGE, 'guest_suite');
  const siege = createMansionSiegeCampaignStory({ campaign });
  assert.equal(siege.begin().ok, true);
  assert.equal(siege.checkpoint('armed', { littleFriendSaid: true }), true);
  assert.equal(siege.checkpoint('wave_one', { attackersDown: 8, sasoleMet: true }), true);
  assert.equal(siege.complete({ attackersDown: 8 }), true);

  campaign = reload(storage);
  go(campaign, SCENE_IDS.ENOLA_SQUATCH, 'airfield');
  const enola = createEnolaSquatchCampaignStory({ campaign });
  assert.equal(enola.begin().ok, true);
  assert.equal(enola.checkpoint('takeoff'), true);
  assert.equal(enola.checkpoint('preRelease', { payloadReleased: true }), true);
  assert.equal(enola.checkpoint('return'), true);
  assert.equal(enola.complete({
    rank: 'A', score: 0.915, payloadReleased: true, returnedHome: true,
  }), true);

  campaign = reload(storage);
  go(campaign, SCENE_IDS.MANSION_RETURN, 'driveway');
  const repaired = createMansionReturnCampaignStory({ campaign });
  assert.equal(repaired.begin().ok, true);
  assert.equal(repaired.complete({
    wrongCityConfirmed: true, sauceMissingConfirmed: true, palaceLocationKnown: true,
  }), true);

  campaign = reload(storage);
  go(campaign, SCENE_IDS.CARTEL_PALACE, 'approach');
  const palace = createCartelPalaceCampaignStory({ campaign });
  assert.equal(palace.begin().ok, true);
  assert.equal(palace.checkpoint('betrayal', {
    evidenceFound: ['photograph'], sauceBetrayalConfirmed: true,
  }), true);
  assert.equal(palace.checkpoint('clear', {
    markEliminated: true, sauceEliminated: true,
  }), true);
  assert.equal(palace.complete({ outcome: 'clean' }), true);
  go(campaign, SCENE_IDS.LUXURY_APARTMENT, 'main');

  /* ============================================================== *
   * BEAT 27. Home from the Palace, and three men come for him.
   * ============================================================== */
  campaign = reload(storage);
  luxury = createLuxuryApartmentStory({ campaign });
  flow.begin('the luxury apartment · the special meeting');
  const homeFromThePalace = flow.stop('nobody has said a word', upstairs());
  assert.equal(luxury.phase(), 'special_meeting');
  assert.equal(homeFromThePalace.door.id, EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL);
  assert.equal(luxury.callAnswered(SPECIAL_MEETING_BOOSKI_CALL), true);
  /* Owner, 2026-09-02: the suit first, then the wait for Lag's text, then
   * the lift. The car cannot take a man who has not put the suit on. */
  const somethingDecent = flow.stop('put on something decent, he said', upstairs({ carOutside: true }));
  flow.advanced(homeFromThePalace, somethingDecent);
  assert.equal(somethingDecent.door.kind, 'activity');
  assert.equal(somethingDecent.door.id, 'special_meeting_suit');
  assert.equal(luxury.dressForMeeting(), true);
  const waitingOnTheText = flow.stop('suited, waiting on the text', upstairs());
  flow.advanced(somethingDecent, waitingOnTheText);
  assert.equal(waitingOnTheText.door.kind, 'wait');
  assert.equal(waitingOnTheText.door.id, 'special_meeting_car');
  const carDownstairs = flow.stop('a special one, he said', upstairs({ carOutside: true }));
  flow.advanced(waitingOnTheText, carDownstairs);
  assert.deepEqual(carDownstairs.door, { kind: 'go', destination: SCENE_IDS.SPECIAL_MEETING });
  /* And nothing on this panel names what he is going to. */
  for (const stop of [somethingDecent, waitingOnTheText, carDownstairs]) {
    assert.equal(
      stop.items.some((row) => /initiation|ceremony|special meeting/i.test(row.label)),
      false,
      'the flat told him what the meeting is',
    );
  }
  flow.end();

  /* A walk that stopped early proves nothing, so the count is asserted. */
  assert.ok(flow.stops >= 71, `only ${flow.stops} states were walked`);
  assert.equal(flow.hubs.length, 11);
});
