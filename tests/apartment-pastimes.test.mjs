/**
 * Every return to the flat has one thing in it that is his.
 *
 * Owner note, 2026-08-20: *"for the different times we return to the apartment
 * through the campaign. I want different objectives to justify each return.
 * Maybe one is watch TV (completes after 30 seconds of watching TV) one is
 * play Counter strike in computer another is play squatch smash and take the
 * mushrooms, etc"*
 *
 * The table is CHAPTER_PASTIMES in src/core/apartment-story.js and it has to
 * agree with three separate ledgers it cannot see: the campaign's `activities`
 * block (or the flag never survives a save), DEPARTURE_REFUSALS (or the door
 * has nothing to say and no cue to record), and TIME_EVENTS (or
 * `completeApartmentActivity` throws the first time somebody watches the
 * news). Nothing in the runtime notices any of those three going wrong until a
 * player is standing at a door that will not open, so they are checked here.
 *
 * The behavioural half is the same shape for all four chapters: the call comes
 * first, the pastime second, the door third. That ORDER is the design -- a
 * door that answers an unanswered telephone with "you have not played your
 * game yet" has this campaign's priorities backwards -- so it is asserted
 * rather than assumed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  SHOOT_TARGET_SCORE,
  SMASH_PLAY_SECONDS,
  TV_WATCH_SECONDS,
  chapterPastimes,
  createApartmentStory,
} from '../src/core/apartment-story.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

/** The four chores, all done, which is what every later morning assumes. */
const CHORES_DONE = Object.freeze({
  eaten: true, showered: true, peed: true, pooped: true, changedClothes: true,
});

/**
 * Each chapter staged at the point the door is next asked: mission history
 * behind it, its own call answered, its own mission still to do.
 */
const CHAPTERS = Object.freeze([
  {
    chapter: 'day_two',
    call: EVENT_IDS.BOOSKI_DAY_TWO_CALL,
    destination: SCENE_IDS.AIRSTRIP_SMUGGLING,
    before: (state) => {
      state.story.day = 2;
      state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
      state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    },
  },
  /* THE MORNING OF THE TAKE. This entry read `no_wake` until beats 12-19
   * moved the harbour job to the luxury apartment on Day 7; the pastime, its
   * cue and its recording came with it to the chapter that now owns a man
   * killing an hour in this flat before a job. */
  {
    chapter: 'heist_day',
    call: EVENT_IDS.LOU_HEIST_CALL,
    destination: SCENE_IDS.BANK_HEIST,
    before: (state) => {
      state.story.day = 5;
      state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
      /* The kit is Lou's errand, not his own thing, and it sits BELOW the
       * pastime in the door's order. Pre-collected so this table measures
       * the pastime rather than the packing. */
      for (const key of Object.keys(state.missions[MISSION_IDS.BANK_HEIST].preparation)) {
        if (key !== 'extraMagazine') {
          state.missions[MISSION_IDS.BANK_HEIST].preparation[key] = true;
        }
      }
      state.missions[MISSION_IDS.BANK_HEIST].preparationComplete = true;
    },
  },
  /* The round, which no longer waits on a telephone: beat 12 rang the night
   * before. The pastime is the only thing between him and the car, so the
   * `call` here is the one that was already taken. */
  {
    chapter: 'golf_morning',
    call: EVENT_IDS.LOU_GOLF_CALL,
    destination: SCENE_IDS.SILVER_PINES,
    answeredBefore: true,
    before: (state) => {
      state.story.day = 6;
      state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
      state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
    },
  },
  {
    chapter: 'big_night',
    call: EVENT_IDS.BOOSKI_BIG_NIGHT_CALL,
    destination: SCENE_IDS.INITIATION,
    before: (state) => { state.story.day = 5; },
  },
]);

function stage({ chapter, call, before }) {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.story.chapter = chapter;
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    before?.(state);
  });
  const story = createApartmentStory({ campaign, ring: () => true });
  return { campaign, story, call };
}

/** Mark a chapter's call answered without going through the phone. */
function answer(campaign, eventId) {
  campaign.update((state) => { state.events[eventId].status = 'answered'; });
}

test('every chapter that sends him home asks for exactly one thing of his own', () => {
  const table = chapterPastimes();
  assert.deepEqual(Object.keys(table).sort(),
    ['big_night', 'day_two', 'golf_morning', 'heist_day']);
  for (const [chapter, list] of Object.entries(table)) {
    assert.ok(Array.isArray(list) && list.length, `${chapter} has an empty pastime list`);
    for (const item of list) {
      assert.equal(typeof item.id, 'string', `${chapter}: a pastime with no id`);
      assert.ok(item.label, `${chapter}/${item.id}: no label`);
      assert.equal(typeof item.refusal, 'string', `${chapter}/${item.id}: no refusal key`);
      assert.ok(item.hint, `${chapter}/${item.id}: no hint — the door would refuse and say`
        + ' nothing about where the thing it wants actually is');
    }
  }
});

test('every pastime flag is a real slot on the campaign, or it never survives a save', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const slots = Object.keys(campaign.state.activities);
  for (const list of Object.values(chapterPastimes())) {
    for (const item of list) {
      assert.ok(slots.includes(item.id),
        `activities has no "${item.id}" — set it and the next normalize drops it on the floor`);
    }
  }
});

test('every pastime has a line at the door, which is to say a cue to record', async () => {
  const { DEPARTURE_REFUSALS, departureRefusalCues } = await import('../src/core/apartment-story.js');
  const cues = new Set(departureRefusalCues().map((cue) => cue.name));
  for (const list of Object.values(chapterPastimes())) {
    for (const item of list) {
      assert.ok(DEPARTURE_REFUSALS[item.refusal],
        `no refusal line keyed "${item.refusal}" for ${item.id}`);
      assert.ok(cues.has(`vo.door.refusal.${item.refusal}.1`),
        `${item.refusal} never reaches the booth sheet`);
    }
  }
});

test('every pastime is on the clock, so the morning it fills costs something', () => {
  /* `completeApartmentActivity` in src/main.js hands each of these to
   * `campaign.advanceTime`, which THROWS on an id it does not know -- so a
   * pastime without a time event is a crash the first time somebody does it. */
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const events = {
    watchedTv: TIME_EVENT_IDS.WATCH_TV,
    playedCounterSquatch: TIME_EVENT_IDS.PLAY_COUNTER_SQUATCH,
    playedSquatchShoot: TIME_EVENT_IDS.PLAY_SQUATCH_SHOOT,
    playedSquatchSmash: TIME_EVENT_IDS.PLAY_SQUATCH_SMASH,
    tookShrooms: TIME_EVENT_IDS.EAT_SHROOMS,
  };
  for (const list of Object.values(chapterPastimes())) {
    for (const item of list) {
      const eventId = events[item.id];
      assert.ok(eventId, `no time event mapped for ${item.id} in this test or in main.js`);
      assert.doesNotThrow(() => campaign.advanceTime(eventId, (state) => {
        state.activities[item.id] = true;
      }), `advanceTime rejects ${eventId}`);
    }
  }
});

test('the call comes first, then his own thing, then the door opens', () => {
  for (const spec of CHAPTERS) {
    const { campaign, story, call } = stage(spec);
    const pastimes = chapterPastimes()[spec.chapter];

    /* Before the call, the door is about the call and nothing else. A man who
     * has not been told where he is going is not being kept in by a video
     * game.
     *
     * `answeredBefore` is the round's exception and it is a real one: beat 12
     * rings on the previous evening, so there is no telephone owed on the
     * morning itself and the pastime is the only thing in the way. */
    if (!spec.answeredBefore) {
      const waiting = story.tryLeave(CHORES_DONE);
      assert.equal(waiting.kind, 'call', `${spec.chapter}: door is not waiting on the phone`);
      assert.equal(waiting.id, call);
    }

    answer(campaign, call);

    /* Now it is about his own thing, in order, one at a time. */
    for (const item of pastimes) {
      const done = Object.fromEntries(
        pastimes.slice(0, pastimes.indexOf(item)).map((prior) => [prior.id, true]),
      );
      const refusal = story.tryLeave({ ...CHORES_DONE, ...done });
      assert.equal(refusal.kind, 'activity', `${spec.chapter}: expected an activity refusal`);
      assert.equal(refusal.id, item.id, `${spec.chapter}: wrong pastime in the way`);
      assert.ok(refusal.line, `${spec.chapter}/${item.id}: refused without saying anything`);
      assert.ok(refusal.vo, `${spec.chapter}/${item.id}: refused with no cue to play`);
      assert.ok(refusal.hint, `${spec.chapter}/${item.id}: refused with no hint`);
    }

    /* And with all of them done, he goes. */
    const allDone = Object.fromEntries(pastimes.map((item) => [item.id, true]));
    const out = story.tryLeave({ ...CHORES_DONE, ...allDone });
    assert.equal(out.kind, 'go', `${spec.chapter}: still refusing with everything done`);
    assert.equal(out.destination, spec.destination);
  }
});

test('the morning list carries the chapter’s own thing, marked required', () => {
  for (const spec of CHAPTERS) {
    const { campaign, story, call } = stage(spec);
    answer(campaign, call);
    const items = story.objectives(CHORES_DONE).items;
    for (const pastime of chapterPastimes()[spec.chapter]) {
      const row = items.find((item) => item.id === pastime.id);
      assert.ok(row, `${spec.chapter}: ${pastime.id} is not on the panel`);
      assert.equal(row.required, true, `${spec.chapter}: ${pastime.id} reads as optional`);
      assert.equal(row.done, false);
      assert.ok(row.label, `${spec.chapter}: ${pastime.id} has an empty label`);
    }
    // And it sits under the call, because that is the order the door enforces.
    // The round has no call of its own -- see `answeredBefore` above.
    if (spec.answeredBefore) continue;
    const callRow = items.findIndex((item) => item.id === call);
    const firstPastime = items.findIndex(
      (item) => item.id === chapterPastimes()[spec.chapter][0].id,
    );
    assert.ok(callRow >= 0 && firstPastime > callRow,
      `${spec.chapter}: the pastime is listed above the call`);
  }
});

test('the telly counts down on the panel rather than saying the same thing for half a minute', () => {
  const { campaign, story, call } = stage(CHAPTERS[0]);
  answer(campaign, call);

  const cold = story.objectives({ ...CHORES_DONE }).items.find((i) => i.id === 'watchedTv');
  assert.match(cold.label, /news/i);
  assert.ok(!/\d+s/.test(cold.label), 'a set nobody has switched on is counting down');

  const partway = story.objectives({ ...CHORES_DONE, tvSeconds: TV_WATCH_SECONDS - 12 })
    .items.find((i) => i.id === 'watchedTv');
  assert.match(partway.label, /12s/, 'the telly is not showing what is left of the half minute');

  const done = story.objectives({ ...CHORES_DONE, watchedTv: true, tvSeconds: TV_WATCH_SECONDS })
    .items.find((i) => i.id === 'watchedTv');
  assert.equal(done.done, true);
  assert.ok(!/\d+s/.test(done.label), 'a finished objective is still counting');
});

test('a pastime belongs to its chapter — sleeping into the next one clears it', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.story.chapter = 'day_two';
    state.story.day = 2;
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    // Everything he did on Wednesday, done.
    for (const list of Object.values(chapterPastimes())) {
      for (const item of list) state.activities[item.id] = true;
    }
  });
  const story = createApartmentStory({ campaign, ring: () => true });
  assert.equal(story.sleep().chapter, 'heist_day');

  for (const list of Object.values(chapterPastimes())) {
    for (const item of list) {
      assert.equal(campaign.state.activities[item.id], false,
        `${item.id} carried over into a chapter that did not earn it`);
    }
  }
});

test('a pastime never collides with a chore, an errand or the whiskey', () => {
  const taken = new Set([
    'eaten', 'showered', 'peed', 'pooped', 'changedClothes',
    'emailChecked', 'whiskeyRelaxed', 'pcUsed', 'playedGame', 'killtime',
  ]);
  const seen = new Set();
  for (const list of Object.values(chapterPastimes())) {
    for (const item of list) {
      assert.ok(!taken.has(item.id), `${item.id} is already something else's flag`);
      assert.ok(!seen.has(item.id), `${item.id} is asked for by two chapters`);
      seen.add(item.id);
    }
  }
});

test('the thresholds are the ones the owner asked for, and are reachable', () => {
  // "completes after 30 seconds of watching TV", in as many words.
  assert.equal(TV_WATCH_SECONDS, 30);
  /* The other two are only ever compared against a live reading, so all this
   * can say is that they are finite and small enough that a person doing the
   * thing on purpose reaches them. Squatch Shoot pays 100 a hit at the bottom
   * of its table (see src/arcade/squatchshoot.js), so this is twenty of them. */
  assert.ok(SHOOT_TARGET_SCORE > 0 && SHOOT_TARGET_SCORE <= 5000);
  assert.ok(SMASH_PLAY_SECONDS > 0 && SMASH_PLAY_SECONDS <= 120);
});
