import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_STORAGE_KEY,
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
  navigateCampaign,
} from '../src/core/campaign.js';
import { createMotelStory } from '../src/core/motel-story.js';
import {
  isPreviewMode,
  previewApartmentReturnForLocation,
  previewNavigationHref,
  previewSceneForLocation,
} from '../src/core/preview-mode.js';

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

test('preview query and route resolution preserve existing query parameters', () => {
  const current = {
    pathname: '/game/bing.html',
    search: '?visit=2&preview=1',
  };
  assert.equal(isPreviewMode(current), true);
  assert.equal(previewSceneForLocation(current), SCENE_IDS.BADA_BING_TWO);
  assert.equal(previewApartmentReturnForLocation(current), null);
  assert.equal(
    previewNavigationHref('bing.html?visit=2#lot', current),
    'bing.html?visit=2&preview=1#lot',
  );
  assert.equal(
    previewNavigationHref('index.html', { pathname: '/game/index.html', search: '' }),
    'index.html',
  );
});

test('every authored apartment return preview receives its exact temporary homecoming state', () => {
  const sentinel = '{"canonical":"apartment returns stay temporary"}';
  const canonicalStorage = new WatchStorage(sentinel);
  globalThis.localStorage = canonicalStorage;
  const cases = [
    {
      id: 'bing', day: 1, time: 23 * 60 + 41,
      verify: (state) => state.inventory.concealed.includes(ITEM_IDS.LOU_PACKAGE)
        && state.missions[MISSION_IDS.BADA_BING_ONE].status === 'complete',
    },
    {
      id: 'squatchfather', day: 2, time: 3 * 60,
      verify: (state) => state.missions[MISSION_IDS.SQUATCHFATHER].status === 'complete'
        && state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status === 'locked',
    },
    {
      id: 'beef-run', day: 2, time: 20 * 60 + 30,
      verify: (state) => state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status === 'complete'
        && state.missions[MISSION_IDS.JERKY_MOTEL].status === 'locked',
    },
    {
      id: 'motel', day: 3, time: 4 * 60 + 30,
      verify: (state) => state.missions[MISSION_IDS.JERKY_MOTEL].status === 'complete'
        && state.missions[MISSION_IDS.NO_WAKE].status === 'locked',
    },
    {
      id: 'no-wake', day: 3, time: 16 * 60 + 40,
      verify: (state) => state.missions[MISSION_IDS.NO_WAKE].status === 'complete'
        && state.missions[MISSION_IDS.SILVER_ROOM].status === 'locked',
    },
    {
      id: 'silver-room', day: 3, time: 23 * 60 + 20,
      verify: (state) => state.missions[MISSION_IDS.SILVER_ROOM].status === 'complete'
        && state.missions[MISSION_IDS.INITIATION].status === 'locked',
    },
  ];

  try {
    for (const entry of cases) {
      globalThis.location = {
        pathname: '/game/index.html',
        search: `?preview=1&return=${entry.id}`,
      };
      assert.equal(previewApartmentReturnForLocation(globalThis.location), entry.id);
      const campaign = createCampaign();
      const state = campaign.state;
      assert.deepEqual(state.scene, { id: SCENE_IDS.APARTMENT, spawn: 'front_door' });
      assert.equal(state.story.day, entry.day);
      assert.equal(state.story.timeMinutes, entry.time);
      assert.equal(entry.verify(state), true, `${entry.id} state`);
      assert.equal(canonicalStorage.raw, sentinel);
    }
    assert.equal(canonicalStorage.reads, 0);
    assert.equal(canonicalStorage.writes, 0);
  } finally {
    delete globalThis.location;
    delete globalThis.localStorage;
  }
});

test('motel preview starts unlocked without reading or writing canonical localStorage', () => {
  const sentinel = '{"canonical":"leave me alone"}';
  const canonicalStorage = new WatchStorage(sentinel);
  globalThis.localStorage = canonicalStorage;
  globalThis.location = {
    pathname: '/game/motel.html',
    search: '?preview=1',
  };

  try {
    const campaign = createCampaign();
    assert.equal(campaign.state.scene.id, SCENE_IDS.JERKY_MOTEL);
    assert.equal(
      campaign.state.missions[MISSION_IDS.BADA_BING_TWO].status,
      'complete',
    );
    assert.equal(
      campaign.state.missions[MISSION_IDS.JERKY_MOTEL].status,
      'available',
    );
    assert.deepEqual(createMotelStory({ campaign }).begin(), {
      ok: true,
      resumed: false,
    });
    assert.equal(canonicalStorage.raw, sentinel);
    assert.equal(canonicalStorage.reads, 0);
    assert.equal(canonicalStorage.writes, 0);

    const navigated = [];
    navigateCampaign(campaign, SCENE_IDS.APARTMENT, {
      spawn: 'front_door',
      location: { assign: (href) => navigated.push(href) },
    });
    assert.deepEqual(navigated, ['index.html?preview=1']);
    assert.equal(canonicalStorage.raw, sentinel);
  } finally {
    delete globalThis.location;
    delete globalThis.localStorage;
  }
});

test('Squatchfather and Bing Two previews receive only temporary prerequisites', () => {
  const cases = [
    {
      location: { pathname: '/squatchfather.html', search: '?preview=1' },
      scene: SCENE_IDS.SQUATCHFATHER,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.BADA_BING_ONE].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].status, 'available');
        assert.ok(state.inventory.concealed.includes(ITEM_IDS.LOU_PACKAGE));
      },
    },
    {
      location: { pathname: '/bing.html', search: '?visit=2&preview=1' },
      scene: SCENE_IDS.BADA_BING_TWO,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status, 'complete');
        assert.equal(state.events[EVENT_IDS.LOU_SECOND_CALL].status, 'answered');
        assert.equal(state.missions[MISSION_IDS.BADA_BING_TWO].status, 'available');
      },
    },
    {
      location: { pathname: '/silver.html', search: '?preview=1' },
      scene: SCENE_IDS.SILVER_ROOM,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete');
        assert.equal(state.events[EVENT_IDS.MARGO_DATE_CALL].status, 'answered');
        assert.equal(state.missions[MISSION_IDS.SILVER_ROOM].status, 'available');
        assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'locked');
        assert.equal(state.story.chapter, 'date');
        assert.equal(state.story.day, 3);
      },
    },
    {
      location: { pathname: '/initiation.html', search: '?preview=1' },
      scene: SCENE_IDS.INITIATION,
      verify(state) {
        assert.equal(state.missions[MISSION_IDS.JERKY_MOTEL].status, 'complete');
        assert.equal(state.missions[MISSION_IDS.SILVER_ROOM].status, 'complete');
        assert.equal(state.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status, 'answered');
        assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'available');
        // The date is behind him, so the big night is the next calendar day.
        assert.equal(state.story.chapter, 'big_night');
        assert.equal(state.story.day, 4);
      },
    },
  ];

  for (const entry of cases) {
    globalThis.location = entry.location;
    try {
      const campaign = createCampaign();
      assert.equal(campaign.state.scene.id, entry.scene);
      entry.verify(campaign.state);
    } finally {
      delete globalThis.location;
    }
  }
});
