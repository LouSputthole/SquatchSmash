import assert from 'node:assert/strict';
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
  DATE_MARGO_CALL,
  DAY_ONE_LOU_ATTABOY_CALL,
  DAY_ONE_LOU_CALL,
  DAY_TWO_BOOSKI_CALL,
  DAY_TWO_LOU_SECOND_CALL,
  createApartmentStory,
} from '../src/core/apartment-story.js';
import { RING_SECONDS, callScript } from '../src/core/phone.js';

/** Every call the campaign makes, in the order Tony gets them. */
const CAMPAIGN_CALLS = [
  DAY_ONE_LOU_CALL,
  DAY_ONE_LOU_ATTABOY_CALL,
  DAY_TWO_BOOSKI_CALL,
  DAY_TWO_LOU_SECOND_CALL,
  DATE_MARGO_CALL,
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

  // Five calls, five banks: nobody's answers end up in somebody else's call.
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

test('the apartment door waits for Lou’s call even when every chore is done', () => {
  const story = createApartmentStory({
    campaign: createCampaign({ storage: new MemoryStorage() }),
    ring: () => true,
  });

  const result = story.tryLeave({
    eaten: true,
    showered: true,
    pooped: true,
    changedClothes: true,
    emailChecked: false,
  });

  assert.deepEqual(result, {
    kind: 'call',
    id: EVENT_IDS.LOU_FIRST_CALL,
    line: 'Big Uncle Lou said he would call. I should answer before I go anywhere.',
  });
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
    pooped: false,
    changedClothes: false,
    emailChecked: false,
  };

  assert.equal(story.tryLeave(activities).id, 'eaten');
  activities.eaten = true;
  assert.equal(story.tryLeave(activities).id, 'showered');
  activities.showered = true;
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

test('returning from Bada Bing requires the package before Squatchfather', () => {
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
  assert.equal(restored.activities.changedClothes, true);
  assert.equal(restored.events[EVENT_IDS.LOU_FIRST_CALL].status, 'answered');
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
  // The Motel opens the date, not the big night.
  assert.equal(story.sleep().chapter, 'date');
  assert.deepEqual(story.sleep(), { ok: false, reason: 'date_incomplete' });

  campaign.update((state) => {
    state.missions[MISSION_IDS.SILVER_ROOM].status = 'complete';
  });
  assert.equal(story.sleep().chapter, 'big_night');
  assert.deepEqual(story.sleep(), { ok: false, reason: 'already_big_night' });
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
  // Nowhere in the script does he say what it was.
  for (const line of [...DAY_ONE_LOU_ATTABOY_CALL.lines, ...DAY_ONE_LOU_ATTABOY_CALL.replies]) {
    assert.doesNotMatch(line, /squatchfather|weapon|gun|body|kill/i, line);
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
  });

  story.callAnswered(DAY_TWO_BOOSKI_CALL);
  assert.deepEqual(story.tryLeave({}), {
    kind: 'go',
    destination: SCENE_IDS.AIRSTRIP_SMUGGLING,
  });
});

/** Home from the Motel before dawn: everything Day Two asked for is done. */
function afterTheMotel(storage = new MemoryStorage()) {
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'day_two';
    state.story.day = 3;
    state.story.timeMinutes = 4 * 60 + 30;
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
  });

  // Nobody rings before he has slept.
  story.beginMorning();
  story.update(60);
  assert.deepEqual(calls, []);
  assert.equal(campaign.state.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status, 'pending');
  assert.equal(campaign.state.missions[MISSION_IDS.INITIATION].status, 'locked');
});

test('sleep after the Motel creates a persistent Day Three date checkpoint', () => {
  const storage = new MemoryStorage();
  const campaign = afterTheMotel(storage);
  const story = createApartmentStory({ campaign, ring: () => true });

  // He was up until half four, so noon of the same calendar day: the chapter
  // turns without the day turning with it. Day 3 is the date, not the verdict.
  assert.deepEqual(story.sleep(), {
    ok: true, chapter: 'date', day: 3, timeMinutes: 12 * 60,
  });

  const restored = createCampaign({ storage }).state;
  assert.equal(restored.story.chapter, 'date');
  assert.equal(restored.story.day, 3);
  assert.equal(restored.story.timeMinutes, 12 * 60);
  assert.deepEqual(restored.scene, { id: SCENE_IDS.APARTMENT, spawn: 'wake' });
  assert.equal(restored.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete');
  assert.equal(restored.missions[MISSION_IDS.SILVER_ROOM].status, 'locked');
  assert.equal(restored.missions[MISSION_IDS.INITIATION].status, 'locked');
  assert.equal(restored.events[EVENT_IDS.MARGO_DATE_CALL].status, 'pending');
  assert.equal(restored.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status, 'pending');
});

test('Margo rings once on the afternoon of the date and unlocks the Silver Room', () => {
  const storage = new MemoryStorage();
  const story = createApartmentStory({
    campaign: afterTheMotel(storage),
    ring: () => true,
  });
  story.sleep();

  const calls = [];
  const woken = createApartmentStory({
    campaign: createCampaign({ storage }),
    ring: (definition) => {
      calls.push(definition);
      return true;
    },
  });
  woken.beginMorning();
  woken.update(6.1);
  assert.deepEqual(calls, [DATE_MARGO_CALL]);
  /* She is a civilian and she is not on the family's radio station, so she
   * carries her own character id, her own voice profile, and her own bank. */
  assert.equal(DATE_MARGO_CALL.characterId, CHARACTER_IDS.MARGO);
  assert.equal(DATE_MARGO_CALL.from, 'Margo');
  assert.equal(DATE_MARGO_CALL.voiceProfile, 'margo');
  assert.equal(DATE_MARGO_CALL.vo, 'call.margo.date');
  assert.equal(DATE_MARGO_CALL.targetSceneId, SCENE_IDS.SILVER_ROOM);
  assert.notEqual(DATE_MARGO_CALL.vo, BIG_NIGHT_BOOSKI_CALL.vo);
  assert.notEqual(DATE_MARGO_CALL.eventId, BIG_NIGHT_BOOSKI_CALL.eventId);

  assert.equal(woken.callAnswered(DATE_MARGO_CALL), true);
  const answered = createCampaign({ storage }).state;
  assert.equal(answered.events[EVENT_IDS.MARGO_DATE_CALL].status, 'answered');
  assert.equal(answered.missions[MISSION_IDS.SILVER_ROOM].status, 'available');
  // +5 minutes on the authored clock, once.
  assert.equal(answered.story.timeMinutes, 12 * 60 + 5);
  assert.ok(answered.story.timeEvents.includes(TIME_EVENT_IDS.MARGO_DATE_CALL));
  assert.equal(woken.callAnswered(DATE_MARGO_CALL), false);

  // And she does not ring twice.
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

test('the date door waits for Margo, then routes to the Silver Room', () => {
  const campaign = afterTheMotel();
  const story = createApartmentStory({ campaign, ring: () => true });
  story.sleep();

  assert.deepEqual(story.tryLeave({}), {
    kind: 'call',
    id: EVENT_IDS.MARGO_DATE_CALL,
    line: 'She said she would ring about tonight. I am not turning up at nine on a guess.',
  });

  story.callAnswered(DATE_MARGO_CALL);
  assert.deepEqual(story.tryLeave({}), {
    kind: 'go',
    destination: SCENE_IDS.SILVER_ROOM,
  });

  // Home from the date, the door sends him to bed rather than to the Circle.
  campaign.update((state) => {
    state.missions[MISSION_IDS.SILVER_ROOM].status = 'complete';
  });
  assert.deepEqual(story.tryLeave({}), {
    kind: 'stay',
    id: 'sleep_before_big_night',
    line: 'That was a good night. Tomorrow is the other kind. <em>Bed.</em>',
  });
});

/** Home from the Silver Room, with the evening on the save. */
function afterTheDate(storage) {
  const campaign = afterTheMotel(storage);
  const story = createApartmentStory({ campaign, ring: () => true });
  story.sleep();
  campaign.update((state) => {
    state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
    state.missions[MISSION_IDS.SILVER_ROOM].status = 'complete';
    state.missions[MISSION_IDS.SILVER_ROOM].outcome = 'strong';
  });
  return campaign;
}

test('Booskibro rings once about the big night and unlocks the Initiation', () => {
  const storage = new MemoryStorage();
  const story = createApartmentStory({
    campaign: afterTheDate(storage),
    ring: () => true,
  });
  story.sleep();

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
  assert.deepEqual(calls, [BIG_NIGHT_BOOSKI_CALL]);
  assert.equal(BIG_NIGHT_BOOSKI_CALL.characterId, CHARACTER_IDS.BOOSKI);
  assert.equal(BIG_NIGHT_BOOSKI_CALL.from, 'Booskibro');
  assert.equal(BIG_NIGHT_BOOSKI_CALL.voiceProfile, 'booski');
  assert.equal(BIG_NIGHT_BOOSKI_CALL.vo, 'call.booski.bignight');
  assert.equal(BIG_NIGHT_BOOSKI_CALL.targetSceneId, SCENE_IDS.INITIATION);
  // A distinct bank from his airstrip call, or the last night of the campaign
  // is delivered in the wrong lines.
  assert.notEqual(BIG_NIGHT_BOOSKI_CALL.vo, DAY_TWO_BOOSKI_CALL.vo);
  assert.notEqual(BIG_NIGHT_BOOSKI_CALL.eventId, DAY_TWO_LOU_SECOND_CALL.eventId);

  assert.equal(woken.callAnswered(BIG_NIGHT_BOOSKI_CALL), true);
  const answered = createCampaign({ storage }).state;
  assert.equal(answered.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status, 'answered');
  assert.equal(answered.missions[MISSION_IDS.INITIATION].status, 'available');
  // Day 4 now, waking at ten. +5 minutes on the authored clock, once.
  assert.equal(answered.story.day, 4);
  assert.equal(answered.story.timeMinutes, 10 * 60 + 5);
  assert.ok(answered.story.timeEvents.includes(TIME_EVENT_IDS.BOOSKI_BIG_NIGHT_CALL));
  assert.equal(woken.callAnswered(BIG_NIGHT_BOOSKI_CALL), false);

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

test('the big-night door waits for Booskibro, then routes to the Initiation', () => {
  const campaign = afterTheDate();
  const story = createApartmentStory({ campaign, ring: () => true });
  story.sleep();

  assert.deepEqual(story.tryLeave({}), {
    kind: 'call',
    id: EVENT_IDS.BOOSKI_BIG_NIGHT_CALL,
    line: 'Booskibro said he would call about tonight. I am not turning up unasked.',
  });

  story.callAnswered(BIG_NIGHT_BOOSKI_CALL);
  assert.deepEqual(story.tryLeave({}), {
    kind: 'go',
    destination: SCENE_IDS.INITIATION,
  });
  // The scene does not report its own progress yet, so the door has to keep
  // letting him back in rather than latching shut behind him.
  campaign.update((state) => {
    state.missions[MISSION_IDS.INITIATION].status = 'in_progress';
  });
  assert.deepEqual(story.tryLeave({}), {
    kind: 'go',
    destination: SCENE_IDS.INITIATION,
  });
});
