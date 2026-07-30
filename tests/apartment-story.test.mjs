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
  DAY_ONE_LOU_CALL,
  DAY_TWO_BOOSKI_CALL,
  DAY_TWO_LOU_SECOND_CALL,
  GOLF_LOU_CALL,
  createApartmentStory,
} from '../src/core/apartment-story.js';

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
  assert.deepEqual(calls, []);
  assert.deepEqual(story.tryLeave({}), {
    kind: 'stay',
    id: 'sleep',
    line: 'That is enough going out for one night.',
  });
  assert.deepEqual(story.sleep(), {
    ok: true, chapter: 'day_two', day: 2, timeMinutes: 420,
  });
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

test('Lou rings about the golf before Booskibro rings about the night', () => {
  /* Two one-shot calls land in the same chapter and the order is the story:
   * nobody tells him the night is his until the morning has happened. */
  const storage = new MemoryStorage();
  const story = createApartmentStory({
    campaign: afterTheDate(storage),
    ring: () => true,
  });
  story.sleep();

  const first = [];
  const morning = createApartmentStory({
    campaign: createCampaign({ storage }),
    ring: (definition) => {
      first.push(definition);
      return true;
    },
  });
  morning.beginMorning();
  morning.update(6.1);
  assert.deepEqual(first, [GOLF_LOU_CALL], 'Lou rings first, about golf');
  assert.equal(GOLF_LOU_CALL.characterId, CHARACTER_IDS.LOU);
  assert.equal(GOLF_LOU_CALL.targetSceneId, SCENE_IDS.SILVER_PINES);
  assert.equal(GOLF_LOU_CALL.vo, 'call.lou.golf');
  assert.notEqual(GOLF_LOU_CALL.vo, DAY_ONE_LOU_CALL.vo);
  assert.equal(morning.callAnswered(GOLF_LOU_CALL), true);
  assert.equal(
    createCampaign({ storage }).state.missions[MISSION_IDS.SILVER_PINES].status,
    'available',
  );

  // Booskibro stays quiet until the round is on the card.
  const tooEarly = [];
  const waiting = createApartmentStory({
    campaign: createCampaign({ storage }),
    ring: (definition) => { tooEarly.push(definition); return true; },
  });
  waiting.beginMorning();
  waiting.update(60);
  assert.deepEqual(tooEarly, [], 'the big night waits for the morning');

  const played = createCampaign({ storage });
  played.update((state) => {
    state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
  });

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
  /* Ten o'clock, plus three minutes for Lou's call and five for Booskibro's:
   * the morning costs authored time like everything else does. */
  assert.equal(answered.story.timeMinutes, 10 * 60 + 8);
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

test('the Day 4 door plays the round first and the ceremony second', () => {
  const campaign = afterTheDate();
  const story = createApartmentStory({ campaign, ring: () => true });
  story.sleep();

  // Nothing to do until Lou rings, and what he rings about is golf.
  assert.deepEqual(story.tryLeave({}), {
    kind: 'call',
    id: EVENT_IDS.LOU_GOLF_CALL,
    line: 'Lou said he would ring this morning. Nowhere to be until he does.',
  });

  story.callAnswered(GOLF_LOU_CALL);
  assert.deepEqual(story.tryLeave({}), {
    kind: 'go',
    destination: SCENE_IDS.SILVER_PINES,
  });

  /* A round in progress is not a round played: the door keeps sending him back
   * out to the course rather than on to the ceremony. */
  campaign.update((state) => {
    state.missions[MISSION_IDS.SILVER_PINES].status = 'in_progress';
  });
  assert.deepEqual(story.tryLeave({}), {
    kind: 'go',
    destination: SCENE_IDS.SILVER_PINES,
  });

  campaign.update((state) => {
    state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
  });
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
