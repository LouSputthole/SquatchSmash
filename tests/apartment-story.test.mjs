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
  DAY_ONE_LOU_CALL,
  DAY_TWO_BOOSKI_CALL,
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

  assert.deepEqual(story.sleep(), { ok: true, day: 2, timeMinutes: 420 });

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

test('sleep cannot advance the story before Squatchfather or advance Day Two twice', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const story = createApartmentStory({ campaign, ring: () => true });

  assert.deepEqual(story.sleep(), { ok: false, reason: 'day_one_incomplete' });

  campaign.update((state) => {
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
  });
  assert.equal(story.sleep().ok, true);
  assert.deepEqual(story.sleep(), { ok: false, reason: 'already_day_two' });
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
  assert.deepEqual(story.sleep(), { ok: true, day: 2, timeMinutes: 420 });
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

test('the Day Two door waits for Booskibro, then names the unconnected airstrip mission', () => {
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
    kind: 'mission',
    id: MISSION_IDS.AIRSTRIP_SMUGGLING,
    characterId: CHARACTER_IDS.CAPTAIN_LOU_SASOLE,
    line: 'Captain Lou Sasole is waiting at the airstrip. The travel route is not connected yet.',
  });
});
