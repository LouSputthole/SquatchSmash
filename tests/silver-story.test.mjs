import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_IDS,
  MISSION_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { createSilverStory } from '../src/core/silver-story.js';
import { Sway } from '../src/silver/perform.js';

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

function completedDate(outcome) {
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
  assert.equal(silver.complete({ outcome, woo: 20 }), true);
  return createCampaign({ storage }).state.missions[MISSION_IDS.SILVER_ROOM];
}

test('every ending authored by the Silver Room mission survives the campaign handoff', () => {
  assert.equal(completedDate('polite').outcome, 'polite');
  assert.equal(completedDate('from-a-distance').outcome, 'from-a-distance');
});

test('the supper-club dance has forgiving default and assist windows while two of four still succeeds', () => {
  const sway = new Sway();
  sway.start(false);
  const defaultWindowMs = sway.beatLength * sway.window * 1000;
  assert.ok(defaultWindowMs >= 300, `default timing window was only ${defaultWindowMs.toFixed(0)}ms`);

  sway.start(true);
  const assistWindowMs = sway.beatLength * sway.window * 1000;
  assert.ok(assistWindowMs >= 420, `assist timing window was only ${assistWindowMs.toFixed(0)}ms`);
  assert.ok(assistWindowMs > defaultWindowMs);

  sway.start(false);
  const beat = sway.beatLength;
  sway.update(beat * 0.5);
  assert.equal(sway.press(), true);
  sway.update(beat);
  assert.equal(sway.press(), true);
  sway.update(beat * 0.5);
  assert.equal(sway.press(), false);
  sway.update(beat);
  assert.equal(sway.press(), false);
  assert.equal(sway.hits, 2);
  assert.equal(sway.result, 'good');
});
