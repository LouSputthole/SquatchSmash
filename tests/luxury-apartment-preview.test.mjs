import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  SCENES,
  TIME_EVENT_IDS,
  createCampaign,
  luxuryApartmentPreviewCampaignState,
} from '../src/core/campaign.js';
import {
  LUXURY_APARTMENT_PHASES,
  createLuxuryApartmentStory,
} from '../src/core/luxury-apartment-story.js';
import {
  LUXURY_APARTMENT_PREVIEW_VARIANTS,
  previewLuxuryVariantForLocation,
} from '../src/core/preview-mode.js';

/**
 * THE LUXURY APARTMENT'S DEVELOPER CHECKPOINTS.
 *
 * `luxury-apartment.html?preview=1&luxury=<stage>` is the flat's half of the
 * mechanism `preview-mode.test.mjs` covers for the starter flat, and this file
 * is deliberately separate from that one rather than a section inside it.
 *
 * Every row below is a whole checkpoint stated once: where the campaign thinks
 * it is, what hour it is, which missions are behind it, which telephone is
 * owed, and what the lift does when he walks into it. A fixture that seeds a
 * phase but leaves the door pointing somewhere impossible is worse than no
 * fixture, because it looks reviewed.
 */
class WatchStorage {
  constructor(raw) {
    this.raw = raw;
    this.reads = 0;
    this.writes = 0;
  }

  getItem() {
    this.reads++;
    return this.raw;
  }

  setItem(_key, value) {
    this.writes++;
    this.raw = String(value);
  }
}

const LUXURY_PREVIEW_CASES = Object.freeze([
  Object.freeze({
    variant: 'arrival',
    spawn: 'arrival',
    phase: 'get_ready',
    chapter: 'luxury_apartment',
    day: 6,
    timeMinutes: 11 * 60 + 45,
    door: { kind: 'activity' },
    verify(state) {
      assert.equal(state.missions[MISSION_IDS.SILVER_PINES].status, 'complete');
      /* Locked until the chores are done: `completeGetReady` is what exposes
       * Front & Center, and a checkpoint that pre-unlocked it would review a
       * flat with nothing in it to do. */
      assert.equal(state.missions[MISSION_IDS.SILVER_ROOM].status, 'locked');
      assert.equal(
        state.story.timeEvents.includes(TIME_EVENT_IDS.LUXURY_GET_READY),
        false,
      );
    },
  }),
  Object.freeze({
    variant: 'date-ready',
    spawn: 'main',
    phase: 'date',
    chapter: 'date',
    day: 6,
    timeMinutes: 19 * 60 + 30,
    door: { kind: 'go', destination: SCENE_IDS.SILVER_ROOM },
    verify(state) {
      assert.equal(state.missions[MISSION_IDS.SILVER_ROOM].status, 'available');
      assert.equal(state.events[EVENT_IDS.MARGO_DATE_CALL].status, 'answered');
      assert.equal(state.story.timeEvents.includes(TIME_EVENT_IDS.LUXURY_GET_READY), true);
    },
  }),
  Object.freeze({
    variant: 'margo-home',
    spawn: 'main',
    phase: 'come_home',
    chapter: 'date',
    day: 6,
    timeMinutes: 23 * 60 + 20,
    door: { kind: 'stay' },
    verify(state) {
      const silver = state.missions[MISSION_IDS.SILVER_ROOM];
      assert.equal(silver.status, 'complete');
      assert.equal(silver.cameHome, true);
      assert.equal(
        state.story.timeEvents.includes(TIME_EVENT_IDS.LUXURY_MARGO_COME_HOME),
        false,
      );
    },
  }),
  Object.freeze({
    variant: 'stayover-night',
    spawn: 'main',
    phase: 'stayover',
    chapter: 'date',
    /* Her arrival is a zero-minute marker on purpose (see its note in
     * TIME_EVENTS), so the same twenty past eleven as the row above. */
    day: 6,
    timeMinutes: 23 * 60 + 20,
    door: { kind: 'stay' },
    verify(state) {
      assert.equal(
        state.story.timeEvents.includes(TIME_EVENT_IDS.LUXURY_MARGO_COME_HOME),
        true,
      );
      assert.equal(
        state.story.timeEvents.includes(TIME_EVENT_IDS.LUXURY_STAYOVER_REST),
        false,
      );
    },
  }),
  Object.freeze({
    variant: 'margo-morning',
    spawn: 'main',
    phase: 'morning',
    chapter: 'luxury_morning',
    day: 7,
    timeMinutes: 7 * 60 + 10,
    door: { kind: 'stay' },
    verify(state) {
      assert.equal(state.story.timeEvents.includes(TIME_EVENT_IDS.LUXURY_STAYOVER_REST), true);
      assert.equal(state.story.timeEvents.includes(TIME_EVENT_IDS.LUXURY_MARGO_WAKE), false);
      assert.equal(state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status, 'pending');
    },
  }),
  Object.freeze({
    variant: 'no-wake-call',
    spawn: 'main',
    phase: 'no_wake',
    chapter: 'luxury_morning',
    /* Her leaving is zero minutes too: the bible asks for a quiet window, and
     * a window that eats the clock is a time skip. */
    day: 7,
    timeMinutes: 7 * 60 + 10,
    door: { kind: 'call', id: EVENT_IDS.LOU_NO_WAKE_CALL },
    verify(state) {
      assert.equal(state.story.timeEvents.includes(TIME_EVENT_IDS.LUXURY_MARGO_WAKE), true);
      assert.equal(state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status, 'pending');
      assert.equal(state.missions[MISSION_IDS.NO_WAKE].status, 'locked');
    },
  }),
  Object.freeze({
    variant: 'after-no-wake',
    spawn: 'main',
    phase: 'return',
    chapter: 'luxury_return',
    day: 7,
    timeMinutes: 17 * 60 + 20,
    door: { kind: 'call', id: EVENT_IDS.BOOSKI_SILVER_CASE_CALL },
    verify(state) {
      assert.equal(state.missions[MISSION_IDS.NO_WAKE].status, 'complete');
      assert.equal(state.events[EVENT_IDS.BOOSKI_SILVER_CASE_CALL].status, 'pending');
      assert.equal(
        state.story.timeEvents.includes(TIME_EVENT_IDS.RETURN_LUXURY_APARTMENT),
        true,
      );
    },
  }),
  Object.freeze({
    variant: 'case-handoff',
    spawn: 'main',
    phase: 'complete',
    chapter: 'luxury_return',
    /* Home at twenty past five, Booskibro rings at twenty-five past: the five
     * minutes are the call's own marker, not a number typed into the table. */
    day: 7,
    timeMinutes: 17 * 60 + 25,
    door: { kind: 'go', destination: SCENE_IDS.SILVER_CASE },
    verify(state) {
      assert.equal(state.events[EVENT_IDS.BOOSKI_SILVER_CASE_CALL].status, 'answered');
      assert.equal(
        state.story.timeEvents.includes(TIME_EVENT_IDS.BOOSKI_SILVER_CASE_CALL),
        true,
      );
      assert.equal(state.missions[MISSION_IDS.SILVER_CASE].status, 'available');
    },
  }),
  Object.freeze({
    variant: 'special-meeting-night',
    spawn: 'main',
    phase: 'special_meeting',
    chapter: 'big_night',
    day: 12,
    timeMinutes: 23 * 60,
    door: { kind: 'call', id: EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL },
    verify(state) {
      const palace = state.missions[MISSION_IDS.CARTEL_PALACE];
      assert.equal(palace.status, 'complete');
      /* `phase()` reads beat 27 off `complete && grandfathered !== true`, so a
       * seeded Palace has to be a played one or the flat keeps the old
       * terminal route and this checkpoint reviews the wrong evening. */
      assert.notEqual(palace.grandfathered, true);
      assert.equal(state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL].status, 'pending');
      assert.equal(state.finale.status, 'locked');
    },
  }),
  Object.freeze({
    variant: 'freeplay',
    spawn: 'main',
    /* NOT A NEW PHASE, AND THAT IS THE FINDING. `phase()` treats the Palace as
     * beat 27's seam and knows nothing behind it, so a made man's save still
     * reports `special_meeting` and his lift still offers the car that took
     * him to the ceremony. This checkpoint exists so that gap is reviewable
     * rather than theoretical; the day it closes, this row changes with it. */
    phase: 'special_meeting',
    chapter: 'big_night',
    /* 17:55 pickup, Seff's forty-two minutes plus twenty-three at the spur,
     * then a hundred and ten at the bonfire. Every one of them an anchor. */
    day: 13,
    timeMinutes: 20 * 60 + 50,
    door: { kind: 'go', destination: SCENE_IDS.SPECIAL_MEETING },
    verify(state) {
      assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'complete');
      assert.equal(state.story.timeEvents.includes(TIME_EVENT_IDS.COMPLETE_INITIATION), true);
      assert.equal(state.finale.status, 'freeplay');
      assert.equal(state.finale.freeplayUnlocked, true);
      assert.deepEqual(state.finale.completedAt, { day: 13, timeMinutes: 20 * 60 + 50 });
    },
  }),
]);

test('the luxury preview list covers every phase the flat tells apart', () => {
  assert.deepEqual(
    LUXURY_PREVIEW_CASES.map(({ variant }) => variant),
    [...LUXURY_APARTMENT_PREVIEW_VARIANTS],
    'the cases below must be the published variant list, in order',
  );
  /* The bounding rule, stated as an assertion rather than a comment: one
   * checkpoint per authored phase, so a phase can never be added to the story
   * without a way to open it. `freeplay` is the tenth and is the finished
   * campaign rather than a tenth phase. */
  assert.deepEqual(
    LUXURY_PREVIEW_CASES.filter(({ variant }) => variant !== 'freeplay').map(({ phase }) => phase),
    [...LUXURY_APARTMENT_PHASES],
  );
  assert.equal(
    new Set(LUXURY_APARTMENT_PREVIEW_VARIANTS).size,
    LUXURY_APARTMENT_PREVIEW_VARIANTS.length,
  );
});

test('every luxury preview stage seeds its own coherent checkpoint', () => {
  for (const expected of LUXURY_PREVIEW_CASES) {
    const { state, spawn } = luxuryApartmentPreviewCampaignState(expected.variant);
    const story = createLuxuryApartmentStory({ campaign: { state } });
    assert.equal(spawn, expected.spawn, expected.variant);
    assert.ok(
      SCENES[SCENE_IDS.LUXURY_APARTMENT].spawns.includes(spawn),
      `${expected.variant} seeds a spawn the scene does not publish`,
    );
    assert.equal(story.phase(), expected.phase, expected.variant);
    assert.equal(state.story.chapter, expected.chapter, expected.variant);
    assert.equal(state.story.day, expected.day, expected.variant);
    assert.equal(state.story.timeMinutes, expected.timeMinutes, expected.variant);

    /* Every stage stands after the round, the bank and the Motel, carrying the
     * phone the flat's whole telephone thread needs. */
    assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete', expected.variant);
    assert.equal(state.missions[MISSION_IDS.BANK_HEIST].status, 'complete', expected.variant);
    assert.equal(state.missions[MISSION_IDS.SILVER_PINES].status, 'complete', expected.variant);
    assert.ok(state.inventory.carried.includes(ITEM_IDS.PHONE), expected.variant);
    assert.ok(
      state.story.timeEvents.includes(TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT),
      `${expected.variant} never drove him to the flat`,
    );

    /* The ledger is exact-once by id. A checkpoint that spends one twice would
     * still boot and would then refuse the next real beat that needs it. */
    assert.equal(
      new Set(state.story.timeEvents).size,
      state.story.timeEvents.length,
      `${expected.variant} spent a clock marker twice`,
    );

    const door = story.tryLeave();
    assert.equal(door.kind, expected.door.kind, expected.variant);
    if (expected.door.destination) {
      assert.equal(door.destination, expected.door.destination, expected.variant);
      assert.ok(
        SCENES[SCENE_IDS.LUXURY_APARTMENT].next.includes(door.destination),
        `${expected.variant} opens a door the scene graph will not let him through`,
      );
    }
    if (expected.door.id) assert.equal(door.id, expected.door.id, expected.variant);
    expected.verify(state);
  }
});

test('luxury stage URLs resolve only on the luxury page and only when published', () => {
  for (const variant of LUXURY_APARTMENT_PREVIEW_VARIANTS) {
    assert.equal(
      previewLuxuryVariantForLocation({
        pathname: '/game/luxury-apartment.html',
        search: `?preview=1&luxury=${variant}`,
      }),
      variant,
    );
  }
  assert.equal(
    previewLuxuryVariantForLocation({
      pathname: '/game/luxury-apartment.html',
      search: '?preview=1&luxury=not-a-stage',
    }),
    null,
  );
  /* A copied query string must not let one home seed the other's stages. */
  assert.equal(
    previewLuxuryVariantForLocation({
      pathname: '/game/index.html',
      search: '?preview=1&luxury=freeplay',
    }),
    null,
  );
  assert.throws(
    () => luxuryApartmentPreviewCampaignState('not-a-stage'),
    /Unknown Luxury Apartment preview variant/,
  );
});

test('opening a luxury stage never reads or writes the canonical save', () => {
  const sentinel = '{"canonical":"luxury stage previews leave this alone"}';
  const canonicalStorage = new WatchStorage(sentinel);
  globalThis.localStorage = canonicalStorage;
  try {
    for (const expected of LUXURY_PREVIEW_CASES) {
      delete globalThis.__squatchLifePreviewRuntime;
      globalThis.location = {
        pathname: '/game/luxury-apartment.html',
        search: `?preview=1&luxury=${expected.variant}`,
      };
      const campaign = createCampaign();
      assert.deepEqual(campaign.state.scene, {
        id: SCENE_IDS.LUXURY_APARTMENT,
        spawn: expected.spawn,
      }, expected.variant);
      assert.equal(
        createLuxuryApartmentStory({ campaign }).phase(),
        expected.phase,
        expected.variant,
      );
      assert.equal(campaign.state.story.day, expected.day, expected.variant);
      assert.equal(campaign.state.story.timeMinutes, expected.timeMinutes, expected.variant);
      assert.equal(canonicalStorage.raw, sentinel, expected.variant);
    }
    assert.equal(canonicalStorage.reads, 0);
    assert.equal(canonicalStorage.writes, 0);
  } finally {
    delete globalThis.location;
    delete globalThis.localStorage;
    delete globalThis.__squatchLifePreviewRuntime;
  }
});

test('an unknown stage falls back to the flat rather than to another scene', () => {
  const canonicalStorage = new WatchStorage('{"canonical":"still here"}');
  globalThis.localStorage = canonicalStorage;
  globalThis.location = {
    pathname: '/game/luxury-apartment.html',
    search: '?preview=1&luxury=not-a-stage',
  };
  try {
    const campaign = createCampaign();
    assert.deepEqual(campaign.state.scene, {
      id: SCENE_IDS.LUXURY_APARTMENT,
      spawn: 'arrival',
    });
    assert.equal(createLuxuryApartmentStory({ campaign }).phase(), 'get_ready');
    assert.equal(canonicalStorage.reads, 0);
    assert.equal(canonicalStorage.writes, 0);
  } finally {
    delete globalThis.location;
    delete globalThis.localStorage;
    delete globalThis.__squatchLifePreviewRuntime;
  }
});

test('a campaign beat still wins when both query parameters name an evening', () => {
  const canonicalStorage = new WatchStorage('{"canonical":"still here"}');
  globalThis.localStorage = canonicalStorage;
  globalThis.location = {
    pathname: '/game/luxury-apartment.html',
    search: '?preview=1&beat=margo_stayover&luxury=freeplay',
  };
  try {
    const campaign = createCampaign();
    assert.equal(createLuxuryApartmentStory({ campaign }).phase(), 'come_home');
    assert.equal(campaign.state.story.day, 6);
    assert.equal(campaign.state.finale.status, 'locked');
    assert.equal(canonicalStorage.writes, 0);
  } finally {
    delete globalThis.location;
    delete globalThis.localStorage;
    delete globalThis.__squatchLifePreviewRuntime;
  }
});

test('the launcher publishes every luxury stage inside the flat’s own spine cards', () => {
  const html = fs.readFileSync(new URL('../preview.html', import.meta.url), 'utf8');
  const links = [...html.matchAll(/<a\b[^>]*\bdata-preview-luxury="([^"]+)"[^>]*>/gi)]
    .map((match) => ({
      variant: match[1],
      href: (match[0].match(/\bhref="([^"]+)"/i)?.[1] ?? '').replaceAll('&amp;', '&'),
    }));

  assert.deepEqual(
    links.map(({ variant }) => variant),
    [...LUXURY_APARTMENT_PREVIEW_VARIANTS],
    'the launcher must offer each published stage exactly once, in story order',
  );
  for (const { variant, href } of links) {
    assert.equal(
      href,
      `${SCENES[SCENE_IDS.LUXURY_APARTMENT].href}?preview=1&luxury=${variant}`,
      `${variant} must launch the canonical luxury-apartment page`,
    );
  }
  /* Stage links hang inside the five luxury spine cards. They must never grow
   * into cards of their own: `verify-preview` holds the launcher to thirty-one
   * campaign beats and the spine is the only thing allowed to add one. */
  const stageCards = [...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)]
    .filter(([, , body]) => /data-preview-luxury=/i.test(body));
  assert.equal(stageCards.length, 5);
  for (const [, attributes] of stageCards) {
    assert.match(attributes, /data-campaign-scene="luxury_apartment"/i);
  }
  /* And they are not checkpoint links: `geometry-preview-checkpoints` claims
   * every `checkpoint=` href on this page for a headless geometry state. */
  assert.doesNotMatch(html, /href="[^"]*luxury=[^"]*checkpoint=/i);
});
