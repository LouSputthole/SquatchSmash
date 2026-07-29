import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  DAY_ONE_LOU_CALL,
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

  story.callAnswered(calls[0]);
  const saved = createCampaign({ storage }).state;
  assert.equal(saved.events[EVENT_IDS.LOU_FIRST_CALL].status, 'answered');
  assert.equal(saved.missions[MISSION_IDS.BADA_BING_ONE].status, 'available');

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
    line: 'Lou said he would call. I should answer before I go anywhere.',
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
