import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CHARACTER_IDS,
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  BIG_NIGHT_BOOSKI_CALL,
  BIG_NIGHT_MARGO_WAKE,
  DAY_FOUR_LOU_HEIST_CALL,
  HEIST_CLEANUP_ITEMS,
  HEIST_PREPARATION_ITEMS,
  DAY_ONE_LOU_ATTABOY_CALL,
  DAY_ONE_LOU_CALL,
  DAY_TWO_BOOSKI_CALL,
  DAY_TWO_LOU_SECOND_CALL,
  NEW_SPACE_LOU_CALL,
  NO_WAKE_LOU_CALL,
  SILVER_CASE_BOOSKI_CALL,
  SILVER_ROOM_COME_HOME,
  createApartmentStory,
} from '../src/core/apartment-story.js';
import { createGolfStory } from '../src/core/golf-story.js';
import { RING_SECONDS, callScript } from '../src/core/phone.js';
import { conciseObjectiveItems } from '../src/core/objective-panel.js';

/**
 * Every call the campaign makes, in the order Tony gets them.
 *
 * Two of these no longer ring in this flat -- Lou's about the boat and
 * Booskibro's about the case belong to the luxury apartment from beat 14 on.
 * Margo's later date call is deliberately absent: the cabin conversation is
 * now the one place the date is scheduled.
 */
const CAMPAIGN_CALLS = [
  DAY_ONE_LOU_CALL,
  DAY_ONE_LOU_ATTABOY_CALL,
  DAY_TWO_BOOSKI_CALL,
  DAY_TWO_LOU_SECOND_CALL,
  DAY_FOUR_LOU_HEIST_CALL,
  NEW_SPACE_LOU_CALL,
  NO_WAKE_LOU_CALL,
  SILVER_CASE_BOOSKI_CALL,
  BIG_NIGHT_BOOSKI_CALL,
];

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

test('Tony answers every campaign call out loud, from the caller’s own bank', () => {
  for (const call of CAMPAIGN_CALLS) {
    assert.equal(call.replies?.length, call.lines.length, `${call.vo} is missing replies`);
    for (const reply of call.replies) {
      assert.equal(typeof reply, 'string', `${call.vo} has a reply that is not a line`);
      assert.ok(reply.trim().length > 0, `${call.vo} has an empty reply`);
    }
    const turns = callScript(call);
    // Caller, him, caller, him -- and nobody talks over anybody.
    assert.deepEqual(turns.map((t) => t.who),
      call.lines.flatMap(() => ['them', 'me']));
    assert.deepEqual(
      turns.filter((t) => t.who === 'me').map((t) => t.cue),
      call.lines.map((_, i) => `vo.${call.vo}.tony.${i + 1}`),
    );
  }

  // One bank per call: nobody's answers end up in somebody else's call.
  const banks = CAMPAIGN_CALLS.map((call) => call.vo);
  assert.equal(new Set(banks).size, banks.length);
});

test('answering Lou’s first call unlocks Bada Bing and prevents a replay', () => {
  const storage = new MemoryStorage();
  const calls = [];
  const campaign = createCampaign({ storage });
  const story = createApartmentStory({
    campaign,
    ring: (definition) => {
      calls.push(definition);
      return true;
    },
  });

  story.beginMorning();
  story.update(5.9);
  assert.equal(calls.length, 0);
  story.update(0.2);
  assert.deepEqual(calls, [DAY_ONE_LOU_CALL]);
  assert.equal(DAY_ONE_LOU_CALL.from, 'Big Uncle Lou');

  story.callAnswered(calls[0]);
  const saved = createCampaign({ storage }).state;
  assert.equal(saved.events[EVENT_IDS.LOU_FIRST_CALL].status, 'answered');
  assert.equal(saved.missions[MISSION_IDS.BADA_BING_ONE].status, 'available');
  assert.equal(saved.story.timeMinutes, 6 * 60 + 7);
  assert.deepEqual(saved.story.timeEvents, [TIME_EVENT_IDS.LOU_FIRST_CALL]);

  const afterReloadCalls = [];
  const afterReload = createApartmentStory({
    campaign: createCampaign({ storage }),
    ring: (definition) => {
      afterReloadCalls.push(definition);
      return true;
    },
  });
  afterReload.beginMorning();
  afterReload.update(60);
  assert.deepEqual(afterReloadCalls, []);
});

test('a missed story call rings back ten seconds after the caller gives up', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const rings = [];
  const story = createApartmentStory({
    campaign,
    ring: () => { rings.push(story.elapsed); return true; },
  });

  // A tenth of a second at a time, so the answer does not depend on where the
  // frame boundaries happen to land.
  story.beginMorning();
  for (let t = 0; t < 80; t += 0.1) story.update(0.1);

  assert.equal(rings.length, 3, `rang at ${rings}`);
  assert.ok(Math.abs(rings[0] - 6) < 0.2, `first ring at ${rings[0]}`);
  // Ringing out, then ten seconds of nothing, then he tries again. Once per
  // miss, not a burst, and never a ring back before he has stopped ringing.
  assert.ok(Math.abs((rings[1] - rings[0]) - (RING_SECONDS + 10)) < 0.2,
    `second ring ${rings[1] - rings[0]}s later`);
  assert.ok(Math.abs((rings[2] - rings[1]) - (RING_SECONDS + 10)) < 0.2,
    `third ring ${rings[2] - rings[1]}s later`);

  /* These calls are the only thing that unlocks the next place he is allowed
   * to go, so the caller never gives up for good -- but the moment it is
   * answered he stops, and the clock is charged for it exactly once. */
  assert.equal(story.callAnswered(DAY_ONE_LOU_CALL), true);
  assert.equal(story.callAnswered(DAY_ONE_LOU_CALL), false);
  for (let t = 0; t < 300; t += 1) story.update(1);
  assert.equal(rings.length, 3);
  assert.deepEqual(campaign.state.story.timeEvents, [TIME_EVENT_IDS.LOU_FIRST_CALL]);
});

test('the morning list is the door’s own requirements, chapter by chapter', () => {
  const nothingDone = {
    eaten: false, showered: false, peed: false, pooped: false,
    changedClothes: false, emailChecked: false,
  };
  const allDone = {
    eaten: true, showered: true, peed: true, pooped: true,
    changedClothes: true, emailChecked: false,
  };

  /* Day One. Four chores the door genuinely refuses on, Lou's call, and
   * somewhere to be -- and the chores are marked required, because here they
   * are. */
  const dayOne = createApartmentStory({
    campaign: createCampaign({ storage: new MemoryStorage() }),
    ring: () => true,
  });
  const listed = dayOne.objectives(nothingDone);
  assert.equal(listed.day, 1);
  assert.deepEqual(listed.items.map((i) => i.id), [
    // Two bathroom errands, not one: they are separate tanks and separate jobs.
    'eaten', 'showered', 'peed', 'pooped', 'changedClothes', EVENT_IDS.LOU_FIRST_CALL,
    // The tutorial's optional half, which the door never checks, and the one
    // line that says what a seventeen-hour day with nothing in it is for.
    'emailChecked', 'pcUsed', 'playedGame', 'killtime',
  ]);
  assert.ok(listed.items.every((i) => !i.done));
  assert.deepEqual(listed.items.filter((i) => !i.required).map((i) => i.id),
    ['emailChecked', 'pcUsed', 'playedGame', 'killtime']);

  // Ticks follow the real flags, not a copy of them.
  dayOne.callAnswered(DAY_ONE_LOU_CALL);
  const half = dayOne.objectives({ ...nothingDone, eaten: true });
  assert.deepEqual(half.items.filter((i) => i.done).map((i) => i.id),
    ['eaten', EVENT_IDS.LOU_FIRST_CALL]);
  // And once the chores are done the list says where he is going -- and, on
  // Day One only, that there is a whole day to fill before he goes.
  const ready = dayOne.objectives(allDone);
  assert.equal(ready.items.at(-1).id, 'killtime');
  assert.equal(ready.items.at(-1).required, false);
  assert.equal(ready.items.at(-2).label, 'Leave for the Bada Bing');
  assert.match(ready.items.at(-1).label, /sleep it off|have a drink/i);
  // The optional half ticks off the same way the required half does.
  const busy = dayOne.objectives({ ...allDone, pcUsed: true, playedGame: true });
  assert.deepEqual(busy.items.filter((i) => !i.required && i.done).map((i) => i.id),
    ['pcUsed', 'playedGame']);

  /* Day Two. Same shape of morning -- he still eats, still showers -- but the
   * door does not count those, so they are listed and not marked required. */
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.story.chapter = 'day_two';
    state.story.day = 2;
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
  });
  const dayTwo = createApartmentStory({ campaign, ring: () => true });
  const morning = dayTwo.objectives(nothingDone);
  assert.equal(morning.day, 2);
  /* `watchedTv` is Day Two's PASTIME -- see CHAPTER_PASTIMES in
   * core/apartment-story.js. Every chapter that sends him home now asks for
   * one thing that is his rather than the family's, and it is listed under the
   * call because that is the order the door enforces. */
  assert.deepEqual(morning.items.map((i) => i.id), [
    'eaten', 'showered', 'peed', 'pooped', 'changedClothes',
    EVENT_IDS.BOOSKI_DAY_TWO_CALL, 'watchedTv',
  ]);
  assert.equal(morning.items.find((i) => i.id === 'eaten').required, false);
  assert.equal(morning.items.find((i) => i.id === 'watchedTv').required, true);
  assert.equal(morning.items.at(-1).required, true);
  // Nobody from yesterday is on today's list.
  assert.ok(!morning.items.some((i) => i.id === EVENT_IDS.LOU_FIRST_CALL));

  dayTwo.callAnswered(DAY_TWO_BOOSKI_CALL);
  /* The call is answered and the telly is not: the door is about the telly. */
  assert.equal(dayTwo.objectives(nothingDone).items.at(-1).id, 'watchedTv');
  assert.equal(
    dayTwo.objectives({ ...nothingDone, watchedTv: true }).items.at(-1).label,
    'Leave for the airstrip',
  );
});

/*
 * The one hint in the flat that has to name a mechanic, because it is the one
 * thing in the flat that cannot be worked out by looking at the room: nothing
 * gets you onto that toilet until your body asks, and nothing asks until you
 * have had a dart, a zyn or the raw milk. A player who has done neither can
 * stand in that bathroom all morning.
 */
test('the door tells him how to get things started when it refuses over the dump', () => {
  const story = createApartmentStory({
    campaign: createCampaign({ storage: new MemoryStorage() }),
    ring: () => true,
  });
  story.callAnswered(DAY_ONE_LOU_CALL);

  const refusal = story.tryLeave({
    eaten: true, showered: true, peed: true, pooped: false, changedClothes: true,
  });
  assert.equal(refusal.id, 'pooped');
  assert.match(refusal.hint, /dart|zyn/i);
  assert.match(refusal.hint, /milk/i);

  // And the quick one says where to do it rather than how to want to.
  const earlier = story.tryLeave({
    eaten: true, showered: true, peed: false, pooped: false, changedClothes: true,
  });
  assert.equal(earlier.id, 'peed');
  assert.match(earlier.hint, /toilet/i);
});

test('the two bathroom errands read as two different jobs on the panel', () => {
  const story = createApartmentStory({
    campaign: createCampaign({ storage: new MemoryStorage() }),
    ring: () => true,
  });
  const items = story.objectives({
    eaten: false, showered: false, peed: false, pooped: false, changedClothes: false,
  }).items;
  const labels = Object.fromEntries(items.map((item) => [item.id, item.label]));
  assert.notEqual(labels.peed, labels.pooped);
  assert.ok(labels.peed && labels.pooped);

  // Emptying one must never tick the other. This is the bug the split fixes.
  const halfWay = story.objectives({
    eaten: false, showered: false, peed: true, pooped: false, changedClothes: false,
  }).items;
  assert.equal(halfWay.find((item) => item.id === 'peed').done, true);
  assert.equal(halfWay.find((item) => item.id === 'pooped').done, false);
});

test('the morning list never disagrees with what the door would say', () => {
  /* The whole reason the list is derived rather than authored. Whatever the
   * door is refusing on has to be a line on the panel that is not ticked. */
  const cases = [
    { chapter: 'day_one', setup: () => {} },
    {
      chapter: 'day_two',
      setup: (state) => {
        state.story.chapter = 'day_two';
        state.story.day = 2;
        state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
        state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
        state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
      },
    },
  ];
  const activities = {
    eaten: false, showered: false, peed: false, pooped: false,
    changedClothes: false, emailChecked: false,
  };

  for (const { chapter, setup } of cases) {
    const campaign = createCampaign({ storage: new MemoryStorage() });
    campaign.update(setup);
    const story = createApartmentStory({ campaign, ring: () => true });
    const door = story.tryLeave(activities);
    const items = story.objectives(activities).items;
    const blocking = door.kind === 'activity' ? door.id : door.id ?? `depart.${door.destination}`;
    const match = items.find((i) => i.id === blocking);
    assert.ok(match, `${chapter}: the door wants ${blocking}, which is not on the list`);
    assert.equal(match.done, false, `${chapter}: ${blocking} is ticked but the door refuses`);
    assert.equal(match.required, true, `${chapter}: ${blocking} is not marked required`);
  }
});

test('the apartment door waits for Lou’s call even when every chore is done', () => {
  const story = createApartmentStory({
    campaign: createCampaign({ storage: new MemoryStorage() }),
    ring: () => true,
  });

  const result = story.tryLeave({
    eaten: true,
    showered: true,
    peed: true,
    pooped: true,
    changedClothes: true,
    emailChecked: false,
    whiskeyRelaxed: false,
  });

  assert.deepEqual(result, {
    kind: 'call',
    id: EVENT_IDS.LOU_FIRST_CALL,
    line: 'Big Uncle Lou said he would call. I should answer before I go anywhere.',
    vo: 'door.refusal.first_call',
  });
});

test('the apartment hides future calls, promotes the physical ring, and does not resurrect them', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  let story = createApartmentStory({ campaign, ring: () => true });
  const chores = {
    eaten: true, showered: true, peed: true, pooped: true,
    changedClothes: true, emailChecked: false,
  };

  const waiting = story.objectives(chores);
  const call = waiting.items.find((item) => item.id === EVENT_IDS.LOU_FIRST_CALL);
  assert.equal(call.pending, true);
  assert.equal(conciseObjectiveItems(waiting.items).some((item) => item.id === call.id), false,
    'a phone call the player cannot answer is already on screen');

  const ringing = conciseObjectiveItems(story.objectives({
    ...chores,
    ringingCallId: EVENT_IDS.LOU_FIRST_CALL,
  }).items);
  assert.deepEqual(ringing.map((item) => item.id), [EVENT_IDS.LOU_FIRST_CALL]);
  assert.equal(ringing[0].current, true);

  assert.equal(story.callAnswered(DAY_ONE_LOU_CALL), true);
  story = createApartmentStory({ campaign: createCampaign({ storage }), ring: () => true });
  const restored = conciseObjectiveItems(story.objectives(chores).items);
  assert.equal(restored.some((item) => item.id === EVENT_IDS.LOU_FIRST_CALL), false,
    'reload resurrected an answered call');
  assert.equal(restored[0].id, 'depart.bada_bing_one');
});

test('the apartment door names each required chore while email stays optional', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const story = createApartmentStory({
    campaign,
    ring: () => true,
  });
  story.callAnswered(DAY_ONE_LOU_CALL);

  const activities = {
    eaten: false,
    showered: false,
    peed: false,
    pooped: false,
    changedClothes: false,
    emailChecked: false,
  };

  assert.equal(story.tryLeave(activities).id, 'eaten');
  activities.eaten = true;
  assert.equal(story.tryLeave(activities).id, 'showered');
  activities.showered = true;
  /* The two bathroom jobs are refused separately and in the order he would
   * think of them. Emptying one used to satisfy both. */
  assert.equal(story.tryLeave(activities).id, 'peed');
  activities.peed = true;
  assert.equal(story.tryLeave(activities).id, 'pooped');
  activities.pooped = true;
  assert.equal(story.tryLeave(activities).id, 'changedClothes');
  activities.changedClothes = true;

  assert.deepEqual(story.tryLeave(activities), {
    kind: 'go',
    destination: 'bada_bing_one',
  });
});

test('existing Bada Bing progress implies Lou’s call was already answered', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
  });

  const calls = [];
  const reloaded = createCampaign({ storage });
  const story = createApartmentStory({
    campaign: reloaded,
    ring: (definition) => {
      calls.push(definition);
      return true;
    },
  });
  story.beginMorning();
  story.update(60);

  assert.equal(reloaded.state.events[EVENT_IDS.LOU_FIRST_CALL].status, 'answered');
  assert.equal(reloaded.state.missions[MISSION_IDS.BADA_BING_ONE].status, 'complete');
  assert.deepEqual(calls, []);
});

test('a legacy Bada Bing home landing requires the package but not the retired whiskey gate', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'available';
  });
  const story = createApartmentStory({ campaign, ring: () => true });
  const activities = {
    eaten: true,
    showered: true,
    pooped: true,
    changedClothes: true,
    emailChecked: false,
  };

  assert.deepEqual(story.tryLeave(activities), {
    kind: 'item',
    id: ITEM_IDS.LOU_PACKAGE,
    line: 'I am not going anywhere until I find Lou’s package.',
    vo: 'door.refusal.lou_package',
  });

  campaign.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });
  assert.deepEqual(story.tryLeave(activities), {
    kind: 'go',
    destination: SCENE_IDS.SQUATCHFATHER,
  });
});

test('an in-progress Squatchfather mission resumes after the package is staged', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'in_progress';
    state.missions[MISSION_IDS.SQUATCHFATHER].weaponStaged = true;
  });
  const story = createApartmentStory({ campaign, ring: () => true });

  assert.deepEqual(story.tryLeave({}), {
    kind: 'go',
    destination: SCENE_IDS.SQUATCHFATHER,
  });
});

test('sleep after Squatchfather creates a persistent Day Two wake checkpoint', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.timeMinutes = 23 * 60 + 20;
    state.activities.eaten = true;
    state.activities.showered = true;
    state.activities.peed = true;
    state.activities.pooped = true;
    state.activities.changedClothes = true;
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].weaponStaged = true;
    state.missions[MISSION_IDS.SQUATCHFATHER].weaponDropped = true;
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
  });
  const story = createApartmentStory({ campaign, ring: () => true });

  assert.deepEqual(story.sleep(), {
    ok: true, chapter: 'day_two', day: 2, timeMinutes: 420,
  });

  const restored = createCampaign({ storage }).state;
  assert.equal(restored.story.chapter, 'day_two');
  assert.equal(restored.story.day, 2);
  assert.equal(restored.story.timeMinutes, 7 * 60);
  assert.deepEqual(restored.scene, { id: SCENE_IDS.APARTMENT, spawn: 'wake' });
  assert.equal(restored.missions[MISSION_IDS.BADA_BING_ONE].status, 'complete');
  assert.equal(restored.missions[MISSION_IDS.SQUATCHFATHER].status, 'complete');
  assert.equal(restored.events[EVENT_IDS.LOU_FIRST_CALL].status, 'answered');
  /* The night's work survives; the morning's does not. Waking on Day Two he
   * has not eaten today, has not showered today, and is in what he slept in --
   * which is what makes it a morning rather than yesterday with a new number
   * on the clock. */
  assert.deepEqual(restored.activities, {
    eaten: false,
    showered: false,
    peed: false,
    pooped: false,
    changedClothes: false,
    emailChecked: false,
    whiskeyRelaxed: false,
    /* And the chapter's own thing, which belongs to its chapter for the same
     * reason: a man who sat through the news on Tuesday night has not thereby
     * watched Wednesday's. See CHAPTER_PASTIMES in core/apartment-story.js;
     * `sleep()` clears all of them on a chapter turn, which is why they read
     * false here rather than absent. */
    watchedTv: false,
    playedCounterSquatch: false,
    playedSquatchShoot: false,
    playedSquatchSmash: false,
    tookShrooms: false,
  });
});

test('each chapter of sleep refuses until its own mission is finished', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const story = createApartmentStory({ campaign, ring: () => true });

  assert.deepEqual(story.sleep(), { ok: false, reason: 'day_one_incomplete' });

  campaign.update((state) => {
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
  });
  assert.equal(story.sleep().ok, true);
  // Day Two is open now, so sleeping again waits on the Motel instead of
  // silently repeating the Day One checkpoint.
  assert.deepEqual(story.sleep(), { ok: false, reason: 'day_two_incomplete' });

  campaign.update((state) => {
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
  });
  /* The Motel opens THE TAKE. It used to open NO WAKE and then the date, both
   * of which the bible plays from the luxury apartment three beats later. */
  assert.equal(story.sleep().chapter, 'heist_day');
  assert.deepEqual(story.sleep(), { ok: false, reason: 'unknown_chapter' });

  campaign.update((state) => {
    state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
    state.story.chapter = 'post_heist';
  });
  assert.equal(story.sleep().chapter, 'golf_morning');
  /* And the round is the last thing this flat is ever used for. */
  assert.deepEqual(story.sleep(), { ok: false, reason: 'already_golf_morning' });
});

test('crossing midnight does not start the Day Two chapter before Tony sleeps', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.story.chapter = 'day_one';
    state.story.day = 2;
    state.story.timeMinutes = 2 * 60 + 26;
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
  });
  const calls = [];
  const story = createApartmentStory({
    campaign,
    ring: (definition) => {
      calls.push(definition);
      return true;
    },
  });

  story.beginMorning();
  story.update(60);
  /* Lou rings to say well done and nobody rings about tomorrow: the calendar
   * has turned over but the chapter has not, and the only call this state has
   * in it is the one that unlocks nothing. */
  assert.deepEqual(calls, [DAY_ONE_LOU_ATTABOY_CALL]);
  assert.deepEqual(story.tryLeave({}), {
    kind: 'stay',
    id: 'sleep',
    line: 'That is enough going out for one night.',
    vo: 'door.refusal.sleep_after_squatchfather',
  });
  assert.deepEqual(story.sleep(), {
    ok: true, chapter: 'day_two', day: 2, timeMinutes: 420,
  });
});

test('Lou rings once to say well done, and it gates nothing', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'day_one';
    state.story.day = 2;
    state.story.timeMinutes = 2 * 60 + 26;
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
  });
  const calls = [];
  const story = createApartmentStory({
    campaign,
    ring: (definition) => { calls.push(definition); return true; },
  });

  // Not until the Squatchfather business is actually settled.
  story.beginMorning();
  story.update(60);
  assert.deepEqual(calls, []);

  campaign.update((state) => {
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
  });
  story.update(60);
  assert.deepEqual(calls, [DAY_ONE_LOU_ATTABOY_CALL]);
  assert.equal(DAY_ONE_LOU_ATTABOY_CALL.from, 'Big Uncle Lou');
  assert.equal(DAY_ONE_LOU_ATTABOY_CALL.vo, 'call.lou.attaboy');
  // Its own bank, or the kind words come out in the voice of the job.
  assert.notEqual(DAY_ONE_LOU_ATTABOY_CALL.vo, DAY_ONE_LOU_CALL.vo);
  // Nowhere in the script does he say what it was. Whole words only -- an
  // unanchored `body` also matches "somebody", which is not Lou naming a job.
  for (const line of [...DAY_ONE_LOU_ATTABOY_CALL.lines, ...DAY_ONE_LOU_ATTABOY_CALL.replies]) {
    assert.doesNotMatch(line, /\b(squatchfather|weapons?|guns?|bodies|body|kill(ed|ing)?)\b/i, line);
  }

  /* The door and the bed are exactly where they were: answering it changes
   * two minutes on the clock and nothing else in the campaign. */
  const doorBefore = story.tryLeave({});
  assert.equal(story.callAnswered(DAY_ONE_LOU_ATTABOY_CALL), true);
  const saved = createCampaign({ storage }).state;
  assert.equal(saved.events[EVENT_IDS.LOU_ATTABOY_CALL].status, 'answered');
  assert.equal(saved.story.timeMinutes, 2 * 60 + 28);
  assert.ok(saved.story.timeEvents.includes(TIME_EVENT_IDS.LOU_ATTABOY_CALL));
  assert.equal(saved.missions[MISSION_IDS.SQUATCHFATHER].status, 'complete');
  assert.deepEqual(story.tryLeave({}), doorBefore);

  // Once, and never again -- not on a second ring and not after a reload.
  assert.equal(story.callAnswered(DAY_ONE_LOU_ATTABOY_CALL), false);
  story.update(600);
  assert.deepEqual(calls, [DAY_ONE_LOU_ATTABOY_CALL]);
  const replayed = [];
  const afterReload = createApartmentStory({
    campaign: createCampaign({ storage }),
    ring: (definition) => { replayed.push(definition); return true; },
  });
  afterReload.beginMorning();
  afterReload.update(600);
  assert.deepEqual(replayed, []);
});

test('missing Lou’s well-done costs nothing and does not follow him into Day Two', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.story.chapter = 'day_one';
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
  });
  const calls = [];
  const story = createApartmentStory({
    campaign,
    ring: (definition) => { calls.push(definition); return true; },
  });

  // He never picks it up, and the night still ends.
  story.beginMorning();
  story.update(60);
  assert.ok(calls.length > 0);
  assert.equal(story.sleep().chapter, 'day_two');
  assert.equal(campaign.state.events[EVENT_IDS.LOU_ATTABOY_CALL].status, 'pending');

  // And Lou does not chase him about it in the morning. Booskibro does.
  const morning = [];
  const dayTwo = createApartmentStory({
    campaign,
    ring: (definition) => { morning.push(definition); return true; },
  });
  dayTwo.beginMorning();
  dayTwo.update(60);
  assert.deepEqual(morning, [DAY_TWO_BOOSKI_CALL]);
});

test('Booskibro rings once on Day Two and unlocks Captain Lou Sasole at the airstrip', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'day_two';
    state.story.day = 2;
    state.story.timeMinutes = 7 * 60;
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
  });
  const calls = [];
  const story = createApartmentStory({
    campaign,
    ring: (definition) => {
      calls.push(definition);
      return true;
    },
  });

  story.beginMorning();
  story.update(5.9);
  assert.deepEqual(calls, []);
  story.update(0.2);
  assert.deepEqual(calls, [DAY_TWO_BOOSKI_CALL]);
  assert.equal(DAY_TWO_BOOSKI_CALL.characterId, CHARACTER_IDS.BOOSKI);
  assert.equal(DAY_TWO_BOOSKI_CALL.from, 'Booskibro');
  assert.equal(DAY_TWO_BOOSKI_CALL.voiceProfile, 'booski');
  assert.equal(DAY_TWO_BOOSKI_CALL.targetCharacterId, CHARACTER_IDS.CAPTAIN_LOU_SASOLE);
  assert.notEqual(DAY_TWO_BOOSKI_CALL.targetCharacterId, CHARACTER_IDS.LOU);

  assert.equal(story.callAnswered(DAY_TWO_BOOSKI_CALL), true);
  const restored = createCampaign({ storage }).state;
  assert.equal(restored.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status, 'answered');
  assert.equal(restored.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status, 'available');

  const replayed = [];
  const afterReload = createApartmentStory({
    campaign: createCampaign({ storage }),
    ring: (definition) => {
      replayed.push(definition);
      return true;
    },
  });
  afterReload.beginMorning();
  afterReload.update(60);
  assert.deepEqual(replayed, []);
});

test('the Day Two door waits for Booskibro, then routes to the Beef Run', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.story.chapter = 'day_two';
    state.story.day = 2;
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
  });
  const story = createApartmentStory({ campaign, ring: () => true });

  assert.deepEqual(story.tryLeave({}), {
    kind: 'call',
    id: EVENT_IDS.BOOSKI_DAY_TWO_CALL,
    line: 'Booskibro said he would call with the next job.',
    vo: 'door.refusal.day_two_call',
  });

  story.callAnswered(DAY_TWO_BOOSKI_CALL);
  /* And then Day Two's own thing, before the airstrip. He put a man in the
   * ground last night and the local news does a bulletin on the hour -- see
   * CHAPTER_PASTIMES in core/apartment-story.js. */
  const ownThing = story.tryLeave({});
  assert.equal(ownThing.kind, 'activity');
  assert.equal(ownThing.id, 'watchedTv');
  assert.equal(ownThing.vo, 'door.refusal.watch_tv');

  assert.deepEqual(story.tryLeave({ watchedTv: true }), {
    kind: 'go',
    destination: SCENE_IDS.AIRSTRIP_SMUGGLING,
  });
});

/** Home from the Motel after Snow's daylight wait: the overnight run is done. */
function afterTheMotel(storage = new MemoryStorage()) {
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'day_two';
    state.story.day = 5;
    state.story.timeMinutes = 6 * 60 + 30;
    state.activities.eaten = true;
    state.activities.showered = true;
    state.activities.pooped = true;
    state.activities.changedClothes = true;
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'complete';
    state.missions[MISSION_IDS.BADA_BING_TWO].status = 'complete';
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.missions[MISSION_IDS.JERKY_MOTEL].ending = 'home';
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status = 'answered';
    state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
  });
  return campaign;
}


test('the door sends Tony to bed after the Motel instead of straight to the Circle', () => {
  const campaign = afterTheMotel();
  const calls = [];
  const story = createApartmentStory({
    campaign,
    ring: (definition) => {
      calls.push(definition);
      return true;
    },
  });

  assert.deepEqual(story.tryLeave({}), {
    kind: 'stay',
    id: 'sleep_before_big_night',
    line: 'It is not even light out. Whatever is next can wait until I have slept.',
    vo: 'door.refusal.sleep_after_motel',
  });

  // Nobody rings before he has slept.
  story.beginMorning();
  story.update(60);
  assert.deepEqual(calls, []);
  assert.equal(campaign.state.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status, 'pending');
  assert.equal(campaign.state.missions[MISSION_IDS.INITIATION].status, 'locked');
});

test('sleep after the Motel creates a persistent Day Five checkpoint for THE TAKE', () => {
  const storage = new MemoryStorage();
  const campaign = afterTheMotel(storage);
  const story = createApartmentStory({ campaign, ring: () => true });

  /* Snow held him until half six, so noon of the same calendar day: the chapter
   * turns without the day turning with it. THE TAKE comes first now -- the
   * harbour job and the date are both after the handover, from the flat he
   * has not been given yet. And it is Day 5, not Day 3, because Days 2 to 4
   * were spent at the Act-One cabin. */
  assert.deepEqual(story.sleep(), {
    ok: true, chapter: 'heist_day', day: 5, timeMinutes: 12 * 60,
  });

  const restored = createCampaign({ storage }).state;
  assert.equal(restored.story.chapter, 'heist_day');
  assert.equal(restored.story.day, 5);
  assert.equal(restored.story.timeMinutes, 12 * 60);
  assert.deepEqual(restored.scene, { id: SCENE_IDS.APARTMENT, spawn: 'wake' });
  assert.equal(restored.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete');
  assert.equal(restored.missions[MISSION_IDS.NO_WAKE].status, 'locked');
  assert.equal(restored.missions[MISSION_IDS.SILVER_ROOM].status, 'locked');
  assert.equal(restored.missions[MISSION_IDS.INITIATION].status, 'locked');
  assert.equal(restored.events[EVENT_IDS.MARGO_DATE_CALL].status, 'pending');
  assert.equal(restored.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status, 'pending');
});

test('the starter apartment names the canonical Day Five heist and Day Six golf wakes', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source,
    /Day Five, 12:00 PM\. THE TAKE is today\. Lou said he would call\./);
  assert.match(source,
    /Day Six, 7:00 AM\. Silver Pines at eight\. Lou gave you the time last night\./);
  assert.match(source, /heist_day: 'The Jerky Motel is behind you'/);
  assert.match(source, /heist_day: 'THE TAKE is today\. Lou said he would call\.'/);
  assert.match(source, /golf_morning: 'THE TAKE is behind you'/);
  assert.match(source,
    /golf_morning: 'Silver Pines at eight\. Lou gave you the time last night\.'/);
  assert.doesNotMatch(source,
    /(?:heist_day|golf_morning): 'Margo is still here\. Lou can wait until she leaves\.'/);
});

/* MARGO'S DUPLICATE CALL AND THE DATE DOOR LEFT THIS FILE WITH THE ROUTE.
 *
 * Both used to be tested here because both used to be played here: she rang
 * the flat on the afternoon of Day 3 and he walked out of this front door for
 * a nine o'clock table. The bible has Front & Center after Lou hands over the
 * keys, and the cabin call has already booked it; the luxury apartment's door
 * opens after Tony gets ready without ringing her a second time.
 */

/**
 * The starter flat on the night of the Silver Room, SEEDED rather than walked.
 *
 * It used to be reachable: sleep off the Motel, do the harbour job, take
 * Margo's call, come home. Beats 12-19 moved all three of those beats to the
 * luxury apartment, so nothing on the live route puts this flat in the `date`
 * chapter any more -- which is exactly why the state is written directly here
 * instead of being played into existence.
 *
 * The machinery below it is not dead code and is not deleted: it is the
 * come-home beat, the dress mini-game hand-off and the morning after, and it
 * is what beats 16 and 17 port across when the luxury flat learns to stage
 * her. `campaign-spine.js` calls those two `pending` for the same reason.
 */
function afterTheDate(storage) {
  const campaign = afterTheMotel(storage);
  campaign.update((state) => {
    state.story.chapter = 'date';
    state.story.day = 6;
    state.story.timeMinutes = 23 * 60 + 20;
    state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
    state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status = 'answered';
    state.missions[MISSION_IDS.NO_WAKE].status = 'complete';
    state.missions[MISSION_IDS.SILVER_ROOM].status = 'complete';
    state.missions[MISSION_IDS.SILVER_ROOM].outcome = 'strong';
  });
  return campaign;
}

test('SCENE 9 is owed only the night she actually came home with him', () => {
  const campaign = afterTheDate();
  const story = createApartmentStory({ campaign, ring: () => true });

  // 'strong' outcome, but `SilverStory.complete` never ran here, so there is
  // no `cameHome` at all yet -- and unlike `margoWakeOwed`, there is no
  // pre-existing save to be lenient toward: this scene never shipped before.
  assert.equal(story.margoComeHomeOwed(), false, 'no cameHome verdict yet');

  campaign.update((state) => {
    state.missions[MISSION_IDS.SILVER_ROOM].cameHome = true;
  });
  assert.equal(story.margoComeHomeOwed(), true);
  assert.equal(story.margoHomeForTheNight(), false, 'owed is not yet done');

  assert.equal(story.margoComeHomeDone(), true);
  assert.equal(story.margoComeHomeOwed(), false, 'the one-shot marker prevents replay');
  assert.equal(story.margoHomeForTheNight(), true, 'she is in bed for the rest of the night');

  // A second call is a no-op, same shape as `margoWakeDone`.
  assert.equal(story.margoComeHomeDone(), false);
});

test('SCENE 9 never fires on a bad night, and never past the night it happened', () => {
  const badNight = afterTheDate();
  setSilverOutcome(badNight, 'awkward', false);
  const badStory = createApartmentStory({ campaign: badNight, ring: () => true });
  assert.equal(badStory.margoComeHomeOwed(), false, 'she did not come home');
  assert.equal(badStory.margoHomeForTheNight(), false);

  const goodNight = afterTheDate();
  setSilverOutcome(goodNight, 'strong', true);
  const goodStory = createApartmentStory({ campaign: goodNight, ring: () => true });
  assert.equal(goodStory.margoComeHomeOwed(), true);

  /* The come-home beat belongs to the night it happened and to nothing
   * after it. The chapter turning is what ends it -- which used to be a
   * night's sleep in this bed and is a change of address now. */
  goodStory.margoComeHomeDone();
  goodNight.update((state) => { state.story.chapter = 'golf_morning'; });
  assert.equal(goodStory.margoComeHomeOwed(), false);
  assert.equal(goodStory.margoHomeForTheNight(), false, 'the night is over');
});

test('golf morning has no redundant voicemail or borrowed exact-once id', () => {
  const campaign = afterTheDate();
  campaign.update((state) => { state.story.chapter = 'golf_morning'; });
  const story = createApartmentStory({ campaign, ring: () => true });

  assert.deepEqual(story.messages(), {
    chapter: 'golf_morning',
    eventId: null,
    heard: true,
    list: [],
  });
  assert.equal(story.hearMessages(), false);
  assert.equal(
    campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.HEAR_MESSAGES_BIG_NIGHT),
    false,
    'checking the empty golf machine must not consume the later message id',
  );

  campaign.update((state) => { state.story.chapter = 'heist_day'; });
  assert.equal(story.messages().eventId, TIME_EVENT_IDS.HEAR_MESSAGES_BIG_NIGHT);
  assert.equal(story.messages().list.length, 1);
  assert.equal(story.hearMessages(), true, 'the later authored message remains playable');
});

test('an absent cameHome verdict survives normalize, and the fourth morning survives with it', () => {
  /* The pre-existing-save shim: a save from before the verdict existed has no
   * `cameHome` at all, and `margoWakeOwed` deliberately reads that as "yes".
   * normalize used to coerce the absence to an explicit false on the very
   * next update -- the one value the shim cannot survive -- so one reload
   * cancelled the fourth morning for every old save. Absent must round-trip
   * as absent. */
  const campaign = afterTheDate();
  // A pre-verdict save has no key at all; a fresh seed carries `false` from
  // birth, so the old-save shape has to be made, not assumed.
  campaign.update((state) => {
    delete state.missions[MISSION_IDS.SILVER_ROOM].cameHome;
  });
  campaign.update(() => {});
  const silver = campaign.state.missions[MISSION_IDS.SILVER_ROOM];
  assert.equal('cameHome' in silver, false, 'absent verdict must stay absent through normalize');

  const story = createApartmentStory({ campaign, ring: () => true });
  campaign.update((state) => { state.story.chapter = 'golf_morning'; });
  assert.equal(story.margoWakeOwed(), true, 'the shim keeps the old save\'s morning');

  // The explicit verdicts still round-trip untouched in both directions.
  setSilverOutcome(campaign, 'strong', true);
  campaign.update(() => {});
  assert.equal(campaign.state.missions[MISSION_IDS.SILVER_ROOM].cameHome, true);
  assert.equal(story.margoWakeOwed(), true);
  setSilverOutcome(campaign, 'awkward', false);
  campaign.update(() => {});
  assert.equal(campaign.state.missions[MISSION_IDS.SILVER_ROOM].cameHome, false);
  assert.equal(story.margoWakeOwed(), false, 'an explicit no still blocks the morning');
});

/** Set the Silver Room's outcome and cameHome verdict directly, mid-test. */
function setSilverOutcome(campaign, outcome, cameHome) {
  campaign.update((state) => {
    state.missions[MISSION_IDS.SILVER_ROOM].outcome = outcome;
    state.missions[MISSION_IDS.SILVER_ROOM].cameHome = cameHome;
  });
}

test('the come-home dialogue is cast as Margo and shares no cue names with the wake', () => {
  assert.equal(SILVER_ROOM_COME_HOME.characterId, CHARACTER_IDS.MARGO);
  assert.equal(SILVER_ROOM_COME_HOME.from, 'Margo');
  assert.equal(SILVER_ROOM_COME_HOME.voiceProfile, 'margo');
  assert.ok(SILVER_ROOM_COME_HOME.lines.length >= 1);
  assert.equal(SILVER_ROOM_COME_HOME.lines.length, SILVER_ROOM_COME_HOME.replies.length);
  assert.notEqual(SILVER_ROOM_COME_HOME.vo, BIG_NIGHT_MARGO_WAKE.vo);
});

/** The starter flat's last evening: home from THE TAKE, with the flat dirty. */
function afterTheTake(storage) {
  const campaign = afterTheMotel(storage);
  campaign.update((state) => {
    state.story.chapter = 'post_heist';
    state.story.day = 5;
    state.story.timeMinutes = 18 * 60 + 50;
    state.events[EVENT_IDS.LOU_HEIST_CALL].status = 'answered';
    state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
    state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
  });
  return campaign;
}

test('Lou rings once on the evening of THE TAKE about a new space', () => {
  const storage = new MemoryStorage();
  const campaign = afterTheTake(storage);
  const cleanUp = createApartmentStory({ campaign, ring: () => true });
  for (const item of HEIST_CLEANUP_ITEMS) {
    assert.equal(cleanUp.completeHeistCleanup(item.id), true);
  }

  const calls = [];
  const woken = createApartmentStory({
    campaign: createCampaign({ storage }),
    ring: (definition) => {
      calls.push(definition);
      return true;
    },
  });
  woken.beginMorning();
  woken.update(5.9);
  assert.deepEqual(calls, []);
  woken.update(0.2);
  assert.deepEqual(calls, [NEW_SPACE_LOU_CALL]);
  assert.equal(NEW_SPACE_LOU_CALL.characterId, CHARACTER_IDS.LOU);
  assert.equal(NEW_SPACE_LOU_CALL.from, 'Big Uncle Lou');
  assert.equal(NEW_SPACE_LOU_CALL.voiceProfile, 'lou1');
  /* THE RETIRED TAKE. `call.lou.golf` was four recordings ending "three
   * holes, home by half ten, after that your day starts" -- a call that only
   * makes sense before a bank job, and the bank job is the day before now.
   * The cue name is what proves those takes are gone. */
  assert.equal(NEW_SPACE_LOU_CALL.vo, 'call.lou.new_space');
  assert.equal(NEW_SPACE_LOU_CALL.targetSceneId, SCENE_IDS.SILVER_PINES);
  assert.notEqual(NEW_SPACE_LOU_CALL.vo, DAY_FOUR_LOU_HEIST_CALL.vo);
  assert.match(NEW_SPACE_LOU_CALL.lines.join(' '), /tomorrow at eight/i,
    'Lou did not say that the Day Six round is tomorrow');
  assert.match(NEW_SPACE_LOU_CALL.replies.join(' '), /tomorrow at eight/i,
    'Tony did not repeat the Day Six time back');
  /* And Margo is not in it. Her whole thread is four touches and the course
   * is not one of them; an earlier draft of the spine invented "bring that
   * girl from the Bing" and the owner caught it before it was built. */
  for (const line of [...NEW_SPACE_LOU_CALL.lines, ...NEW_SPACE_LOU_CALL.replies]) {
    assert.equal(/margo|girl/i.test(line), false, `beat 12 must not mention her: ${line}`);
  }

  assert.equal(woken.callAnswered(NEW_SPACE_LOU_CALL), true);
  const answered = createCampaign({ storage }).state;
  assert.equal(answered.events[EVENT_IDS.LOU_GOLF_CALL].status, 'answered');
  assert.equal(answered.missions[MISSION_IDS.SILVER_PINES].status, 'available');
  assert.equal(answered.story.day, 5);
  assert.equal(answered.story.timeMinutes, 18 * 60 + 53);
  assert.ok(answered.story.timeEvents.includes(TIME_EVENT_IDS.LOU_GOLF_CALL));
  assert.equal(woken.callAnswered(NEW_SPACE_LOU_CALL), false);

  const replayed = [];
  const afterReload = createApartmentStory({
    campaign: createCampaign({ storage }),
    ring: (definition) => {
      replayed.push(definition);
      return true;
    },
  });
  afterReload.beginMorning();
  afterReload.update(60);
  assert.deepEqual(replayed, []);
});

test('the flat\'s last two doors: the new-space call, a bed, and the course', () => {
  const campaign = afterTheTake();
  const story = createApartmentStory({ campaign, ring: () => true });

  /* The bank is still on him and on the flat. */
  assert.equal(story.tryLeave({}).kind, 'activity');
  for (const item of HEIST_CLEANUP_ITEMS) {
    assert.equal(story.completeHeistCleanup(item.id), true);
  }

  assert.deepEqual(story.tryLeave({}), {
    kind: 'call',
    id: EVENT_IDS.LOU_GOLF_CALL,
    line: 'Lou said he would ring tonight. Whatever it is, it waits for the phone.',
    vo: 'door.refusal.new_space_call',
  });
  story.callAnswered(NEW_SPACE_LOU_CALL);
  assert.deepEqual(story.tryLeave({}), {
    kind: 'stay',
    id: 'sleep_before_the_course',
    line: 'Eight o’clock at Silver Pines, and it is a drive. <em>Bed.</em>',
    vo: 'door.refusal.sleep_after_take',
  });

  assert.deepEqual(story.sleep(), {
    ok: true, chapter: 'golf_morning', day: 6, timeMinutes: 7 * 60,
  });
  /* No second telephone: he was told eight o'clock last night. What stands
   * between him and the car is the one thing that is his. */
  const warmUp = story.tryLeave({});
  assert.equal(warmUp.kind, 'activity');
  assert.equal(warmUp.id, 'playedSquatchShoot');
  assert.deepEqual(story.tryLeave({ playedSquatchShoot: true }), {
    kind: 'go',
    destination: SCENE_IDS.SILVER_PINES,
  });

  campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_PINES);
  campaign.enter(SCENE_IDS.SILVER_PINES, { spawn: 'car_park' });
  const golf = createGolfStory({ campaign });
  assert.equal(golf.begin().ok, true);
  for (const card of [
    { hole: 1, par: 3, strokes: 4 },
    { hole: 2, par: 5, strokes: 6 },
    { hole: 3, par: 4, strokes: 5 },
  ]) assert.equal(golf.recordHole(card), true);
  assert.equal(golf.complete(), true);
  assert.equal(campaign.state.story.chapter, 'luxury_apartment',
    'the round hands control to the new address, not to another morning here');
});

/**
 * BEAT 14, from the wrong side of the door.
 *
 * A save that comes back to this flat with the round already played -- a
 * mid-round reload, or one MIGRATIONS[20] walked here -- has nothing left in
 * it. THE STARTER FLAT GOES DARK at Silver Pines, so the door takes him to
 * the address rather than refusing in an empty room.
 */
test('a finished round turns this flat\'s door into the way out of it', () => {
  const campaign = afterTheTake();
  campaign.update((state) => {
    state.story.chapter = 'golf_morning';
    state.story.day = 6;
    state.story.timeMinutes = 10 * 60 + 30;
    state.events[EVENT_IDS.LOU_GOLF_CALL].status = 'answered';
    state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
  });
  const story = createApartmentStory({ campaign, ring: () => true });
  assert.deepEqual(story.tryLeave({}), {
    kind: 'go', destination: SCENE_IDS.LUXURY_APARTMENT,
  });
});

test('grandfathered big-night saves still route through Booskibro to Initiation', () => {
  const campaign = afterTheDate();
  campaign.update((state) => {
    state.story.chapter = 'big_night';
    state.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status = 'pending';
  });
  const story = createApartmentStory({ campaign, ring: () => true });
  assert.equal(story.callAnswered(BIG_NIGHT_BOOSKI_CALL), true);
  /* The big night asks for two things, in order, and neither of them is an
   * errand: a run of Squatch Smash and then the caps, which take ninety
   * minutes to arrive and are therefore timed to land somewhere around the
   * speeches. See CHAPTER_PASTIMES in core/apartment-story.js. */
  assert.equal(story.tryLeave({}).id, 'playedSquatchSmash');
  assert.equal(story.tryLeave({ playedSquatchSmash: true }).id, 'tookShrooms');
  assert.deepEqual(story.tryLeave({ playedSquatchSmash: true, tookShrooms: true }), {
    kind: 'go', destination: SCENE_IDS.INITIATION,
  });
});

test('Margo leaves without anticipating the family call that has not happened yet', () => {
  const morning = BIG_NIGHT_MARGO_WAKE.lines.join('\n');
  assert.match(morning, /pretend you are not thinking about work/i);
  assert.doesNotMatch(morning, /big day|important face|anything stupid tonight/i);
});
