import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_IDS,
  MISSION_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { createSilverStory } from '../src/core/silver-story.js';

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

function completedDate(outcome, report = {}) {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.update((state) => {
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.missions[MISSION_IDS.NO_WAKE].status = 'complete';
    state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
    state.missions[MISSION_IDS.SILVER_ROOM].status = 'available';
  });

  const silver = createSilverStory({ campaign });
  assert.deepEqual(silver.begin(), { ok: true, resumed: false });
  assert.equal(silver.complete({ outcome, woo: 20, ...report }), true);
  return createCampaign({ storage }).state.missions[MISSION_IDS.SILVER_ROOM];
}

test('every ending authored by the Silver Room mission survives the campaign handoff', () => {
  assert.equal(completedDate('polite').outcome, 'polite');
  assert.equal(completedDate('from-a-distance').outcome, 'from-a-distance');
});

test('the explicit take-home choice survives the Silver Room campaign handoff', () => {
  assert.equal(completedDate('strong', { tookMargoHome: true }).tookMargoHome, true);
  assert.equal(completedDate('strong', { tookMargoHome: false }).tookMargoHome, false);
});
