import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ITEM_IDS,
  MISSION_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { createSquatchfatherStory } from '../src/core/squatchfather-story.js';

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

function campaignReadyForSquatchfather(storage = new MemoryStorage()) {
  const campaign = createCampaign({ storage });
  campaign.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'available';
  });
  return campaign;
}

test('starting Squatchfather stages Lou’s package as the bathroom weapon exactly once', () => {
  const storage = new MemoryStorage();
  const campaign = campaignReadyForSquatchfather(storage);
  const story = createSquatchfatherStory({ campaign });

  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  let state = campaign.state;
  assert.equal(campaign.hasItem(ITEM_IDS.LOU_PACKAGE), false);
  assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].status, 'in_progress');
  assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].weaponStaged, true);

  const reloaded = createSquatchfatherStory({
    campaign: createCampaign({ storage }),
  });
  assert.deepEqual(reloaded.begin(), { ok: true, resumed: true });
  state = reloaded.campaign.state;
  assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].status, 'in_progress');
  assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].weaponStaged, true);
});

test('Squatchfather cannot start without the package and cannot complete before staging it', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'available';
  });
  const story = createSquatchfatherStory({ campaign });

  assert.deepEqual(story.begin(), { ok: false, reason: 'missing_package' });
  assert.equal(story.complete(), false);
  assert.equal(campaign.state.missions[MISSION_IDS.SQUATCHFATHER].status, 'available');
});

test('completing Squatchfather records the dropped weapon and survives reload', () => {
  const storage = new MemoryStorage();
  const story = createSquatchfatherStory({
    campaign: campaignReadyForSquatchfather(storage),
  });
  story.begin();

  assert.equal(story.complete(), true);
  const saved = createCampaign({ storage }).state.missions[MISSION_IDS.SQUATCHFATHER];
  assert.equal(saved.status, 'complete');
  assert.equal(saved.weaponStaged, true);
  assert.equal(saved.weaponDropped, true);
});
