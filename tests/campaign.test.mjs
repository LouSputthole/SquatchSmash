import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHARACTER_IDS,
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
  navigateCampaign,
} from '../src/core/campaign.js';

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

test('a new campaign starts in the apartment with both Lous kept distinct', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });

  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
  assert.equal(CHARACTER_IDS.LOU, 'lou');
  assert.equal(CHARACTER_IDS.CAPTAIN_LOU_SASOLE, 'captain_lou_sasole');
  assert.notEqual(CHARACTER_IDS.LOU, CHARACTER_IDS.CAPTAIN_LOU_SASOLE);
  assert.equal(campaign.state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status, 'pending');
  assert.equal(campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status, 'locked');
});

test('Lou’s parcel persists as concealed inventory across a reload', () => {
  const storage = new MemoryStorage();
  const firstPage = createCampaign({ storage });

  firstPage.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });

  const nextPage = createCampaign({ storage });
  assert.equal(nextPage.hasItem(ITEM_IDS.LOU_PACKAGE), true);
  assert.deepEqual(nextPage.state.inventory.concealed, [ITEM_IDS.LOU_PACKAGE]);
  assert.deepEqual(nextPage.state.inventory.carried, []);
});

test('scene navigation saves the target and spawn before changing pages', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  const calls = [];
  const location = {
    assign(href) {
      calls.push({
        href,
        saved: createCampaign({ storage }).state.scene,
      });
    },
  };

  navigateCampaign(campaign, SCENE_IDS.BADA_BING_ONE, {
    spawn: 'driver_seat',
    location,
  });

  assert.deepEqual(calls, [{
    href: 'bing.html',
    saved: {
      id: SCENE_IDS.BADA_BING_ONE,
      spawn: 'driver_seat',
    },
  }]);
  assert.deepEqual(campaign.state.lastTransition, {
    from: SCENE_IDS.APARTMENT,
    to: SCENE_IDS.BADA_BING_ONE,
    spawn: 'driver_seat',
  });
});

test('Bada Bing completion and its parcel survive the return to the apartment', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });

  campaign.transition(SCENE_IDS.BADA_BING_ONE, { spawn: 'driver_seat' });
  campaign.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.BADA_BING_ONE].packageReceived = true;
    state.missions[MISSION_IDS.BADA_BING_ONE].ending = 'warned';
  });
  campaign.transition(SCENE_IDS.APARTMENT, { spawn: 'front_door' });

  const atHome = createCampaign({ storage }).state;
  assert.deepEqual(atHome.scene, {
    id: SCENE_IDS.APARTMENT,
    spawn: 'front_door',
  });
  assert.deepEqual(atHome.inventory.concealed, [ITEM_IDS.LOU_PACKAGE]);
  assert.deepEqual(atHome.missions[MISSION_IDS.BADA_BING_ONE], {
    status: 'complete',
    packageReceived: true,
    ending: 'warned',
  });
});

test('a direct Bada Bing entry can still return through the campaign router', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });

  campaign.enter(SCENE_IDS.BADA_BING_ONE, { spawn: 'driver_seat' });
  assert.deepEqual(campaign.state.scene, {
    id: SCENE_IDS.BADA_BING_ONE,
    spawn: 'driver_seat',
  });
  assert.equal(campaign.state.lastTransition, undefined);

  campaign.transition(SCENE_IDS.APARTMENT, { spawn: 'front_door' });
  assert.equal(campaign.state.scene.id, SCENE_IDS.APARTMENT);
});

test('blocked browser storage falls back to the live in-memory campaign', () => {
  const storage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error('storage disabled');
    },
  };
  const campaign = createCampaign({ storage });

  assert.doesNotThrow(() => {
    campaign.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });
    campaign.transition(SCENE_IDS.BADA_BING_ONE, { spawn: 'driver_seat' });
  });
  assert.equal(campaign.hasItem(ITEM_IDS.LOU_PACKAGE), true);
  assert.equal(campaign.state.scene.id, SCENE_IDS.BADA_BING_ONE);
});

test('apartment readiness and learned story context survive a reload', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });

  campaign.update((state) => {
    state.activities.eaten = true;
    state.activities.showered = true;
    state.activities.pooped = true;
    state.activities.changedClothes = true;
    state.story.meetingKnown = true;
    state.story.meetingLearnedFrom = 'lou_call';
  });

  const restored = createCampaign({ storage }).state;
  assert.deepEqual(restored.activities, {
    eaten: true,
    showered: true,
    pooped: true,
    changedClothes: true,
    emailChecked: false,
  });
  assert.equal(restored.story.meetingKnown, true);
  assert.equal(restored.story.meetingLearnedFrom, 'lou_call');
});

test('older Day One saves gain the Day Two event and airstrip mission without losing progress', () => {
  const storage = new MemoryStorage();
  storage.setItem('squatchlife.campaign', JSON.stringify({
    version: 1,
    revision: 4,
    scene: { id: SCENE_IDS.APARTMENT, spawn: 'front_door' },
    story: {
      chapter: 'day_one',
      day: 1,
      timeMinutes: 22 * 60,
      meetingKnown: true,
      meetingLearnedFrom: 'lou_call',
    },
    activities: {
      eaten: true,
      showered: true,
      pooped: true,
      changedClothes: true,
      emailChecked: false,
    },
    inventory: { carried: [], concealed: [] },
    missions: {
      [MISSION_IDS.BADA_BING_ONE]: {
        status: 'complete',
        packageReceived: true,
        ending: 'front',
      },
      [MISSION_IDS.SQUATCHFATHER]: {
        status: 'complete',
        weaponStaged: true,
        weaponDropped: true,
      },
    },
    events: {
      [EVENT_IDS.LOU_FIRST_CALL]: { status: 'answered' },
    },
  }));

  const restored = createCampaign({ storage }).state;
  assert.equal(restored.missions[MISSION_IDS.SQUATCHFATHER].status, 'complete');
  assert.equal(restored.activities.eaten, true);
  assert.equal(restored.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status, 'pending');
  assert.equal(restored.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status, 'locked');
});
