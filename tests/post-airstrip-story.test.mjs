import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHARACTER_IDS,
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
  navigateCampaign,
} from '../src/core/campaign.js';
import {
  DAY_TWO_LOU_SECOND_CALL,
  createApartmentStory,
} from '../src/core/apartment-story.js';
import { createBadaBingTwoStory } from '../src/core/bada-bing-two-story.js';
import { createMotelStory } from '../src/core/motel-story.js';

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

function campaignAfterAirstrip(storage = new MemoryStorage()) {
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.story.chapter = 'day_two';
    state.story.day = 2;
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'complete';
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].checkpoint = 'landed_home';
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].cargoLoaded = true;
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status = 'answered';
  });
  return campaign;
}

test('Lou calls once after the airstrip and unlocks the reused Bing second visit', () => {
  const storage = new MemoryStorage();
  const calls = [];
  const campaign = campaignAfterAirstrip(storage);
  const story = createApartmentStory({
    campaign,
    ring: (definition) => {
      calls.push(definition);
      return true;
    },
  });

  story.beginMorning();
  story.update(6.1);
  assert.deepEqual(calls, [DAY_TWO_LOU_SECOND_CALL]);
  assert.equal(DAY_TWO_LOU_SECOND_CALL.characterId, CHARACTER_IDS.LOU);
  assert.equal(DAY_TWO_LOU_SECOND_CALL.targetSceneId, SCENE_IDS.BADA_BING_TWO);
  assert.equal(story.callAnswered(DAY_TWO_LOU_SECOND_CALL), true);

  const saved = createCampaign({ storage }).state;
  assert.equal(saved.events[EVENT_IDS.LOU_SECOND_CALL].status, 'answered');
  assert.equal(saved.missions[MISSION_IDS.BADA_BING_TWO].status, 'available');
  assert.equal(saved.missions[MISSION_IDS.JERKY_MOTEL].status, 'locked');
  assert.deepEqual(story.tryLeave({}), {
    kind: 'go',
    destination: SCENE_IDS.BADA_BING_TWO,
  });

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

test('the apartment door waits for Lou after the airstrip', () => {
  const story = createApartmentStory({
    campaign: campaignAfterAirstrip(),
    ring: () => true,
  });

  assert.deepEqual(story.tryLeave({}), {
    kind: 'call',
    id: EVENT_IDS.LOU_SECOND_CALL,
    line: 'Lou said he would call when he wanted you back at the Bing.',
  });
});

test('Bada Bing Scene Two requires Lou, then unlocks a direct motel transition', () => {
  const storage = new MemoryStorage();
  const campaign = campaignAfterAirstrip(storage);
  const apartment = createApartmentStory({ campaign, ring: () => true });
  apartment.callAnswered(DAY_TWO_LOU_SECOND_CALL);
  const story = createBadaBingTwoStory({ campaign });

  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  assert.equal(campaign.state.missions[MISSION_IDS.BADA_BING_TWO].status, 'in_progress');
  assert.equal(story.complete({ assignment: 'reserve_pickup' }), true);
  const state = campaign.state;
  assert.equal(state.missions[MISSION_IDS.BADA_BING_TWO].status, 'complete');
  assert.equal(state.missions[MISSION_IDS.BADA_BING_TWO].assignment, 'reserve_pickup');
  assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'available');

  campaign.enter(SCENE_IDS.BADA_BING_TWO, { spawn: 'club_entrance' });
  const calls = [];
  navigateCampaign(campaign, SCENE_IDS.JERKY_MOTEL, {
    spawn: 'passenger_seat',
    location: { assign: (href) => calls.push(href) },
  });
  assert.deepEqual(calls, ['motel.html']);
  assert.deepEqual(campaign.state.lastTransition, {
    from: SCENE_IDS.BADA_BING_TWO,
    to: SCENE_IDS.JERKY_MOTEL,
    spawn: 'passenger_seat',
  });
});

test('the motel records its actual outcome and returns to the apartment', () => {
  const storage = new MemoryStorage();
  const campaign = campaignAfterAirstrip(storage);
  campaign.update((state) => {
    state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
    state.missions[MISSION_IDS.BADA_BING_TWO].status = 'complete';
    state.missions[MISSION_IDS.BADA_BING_TWO].assignment = 'reserve_pickup';
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'available';
  });
  const story = createMotelStory({ campaign });

  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  assert.equal(story.complete({ ending: 'walked' }), false);
  assert.equal(story.complete({
    ending: 'home',
    cargoRecovered: true,
    packagesIntact: 7,
    freshness: 81,
    policeHeat: 24,
  }), true);

  const restored = createCampaign({ storage }).state.missions[MISSION_IDS.JERKY_MOTEL];
  assert.deepEqual(restored, {
    status: 'complete',
    ending: 'home',
    cargoRecovered: true,
    packagesIntact: 7,
    freshness: 81,
    policeHeat: 24,
  });
});
