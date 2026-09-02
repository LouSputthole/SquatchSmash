import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_STORAGE_KEY,
  CAMPAIGN_VERSION,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  CAMPAIGN_FINALE_STATUS,
  buildCampaignCareerRecap,
  enterCampaignFreeplay,
  isCampaignFinaleEligible,
  shouldPresentCampaignFinale,
} from '../src/core/campaign-finale.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function completeInitiation(campaign) {
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_INITIATION, (state) => {
    state.missions[MISSION_IDS.INITIATION].status = 'complete';
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
  }, { required: true });
}

test('an unfinished campaign cannot present or unlock the finale', () => {
  const campaign = createCampaign({ storage: memoryStorage() });
  assert.equal(isCampaignFinaleEligible(campaign.state), false);
  assert.equal(shouldPresentCampaignFinale(campaign.state), false);
  assert.equal(buildCampaignCareerRecap(campaign.state), null);
  assert.deepEqual(enterCampaignFreeplay(campaign), {
    applied: false,
    reason: 'not_complete',
    state: campaign.state,
  });
});

test('Initiation completion makes one durable recap ready at the Apartment', () => {
  const storage = memoryStorage();
  const campaign = createCampaign({ storage });
  completeInitiation(campaign);

  assert.equal(isCampaignFinaleEligible(campaign.state), true);
  assert.equal(shouldPresentCampaignFinale(campaign.state), true);
  assert.equal(campaign.state.finale.status, CAMPAIGN_FINALE_STATUS.READY);
  assert.deepEqual(campaign.state.finale.completedAt, {
    day: campaign.state.story.day,
    timeMinutes: campaign.state.story.timeMinutes,
  });

  const recap = buildCampaignCareerRecap(campaign.state);
  assert.equal(recap.title, "THE PROSPECT'S RECORD");
  /* Nine rows of the record, plus the run code that packs them. */
  assert.equal(recap.stats.length, 10);
  assert.match(recap.stats.at(-1).value, /^SQ-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{4}$/);
  assert.equal(recap.runCode, recap.stats.at(-1).value);
  assert.equal(recap.stats.find(({ label }) => label === 'Cabin execution').value,
    'Not recorded');
  assert.equal(recap.credits.at(-1).name, 'Thanks for playing');

  const reloaded = createCampaign({ storage });
  assert.equal(shouldPresentCampaignFinale(reloaded.state), true);
  assert.deepEqual(reloaded.state.finale.completedAt, campaign.state.finale.completedAt);
});

test('acknowledging credits enters persistent freeplay exactly once', () => {
  const storage = memoryStorage();
  const campaign = createCampaign({ storage });
  completeInitiation(campaign);

  const entered = enterCampaignFreeplay(campaign);
  assert.equal(entered.applied, true);
  assert.equal(entered.state.finale.status, CAMPAIGN_FINALE_STATUS.FREEPLAY);
  assert.equal(entered.state.finale.creditsViewed, true);
  assert.equal(entered.state.finale.freeplayUnlocked, true);
  assert.equal(shouldPresentCampaignFinale(entered.state), false);

  const repeat = enterCampaignFreeplay(campaign);
  assert.equal(repeat.applied, false);
  assert.equal(repeat.reason, 'already_freeplay');
  assert.equal(createCampaign({ storage }).state.finale.status, CAMPAIGN_FINALE_STATUS.FREEPLAY);
});

test('a v16 completed save migrates forward and receives the finale once', () => {
  const source = createCampaign({ storage: memoryStorage() });
  completeInitiation(source);
  const legacy = source.state;
  legacy.version = 16;
  delete legacy.finale;
  const storage = memoryStorage({ [CAMPAIGN_STORAGE_KEY]: JSON.stringify(legacy) });

  const migrated = createCampaign({ storage });
  assert.equal(migrated.state.version, CAMPAIGN_VERSION);
  assert.equal(migrated.state.finale.status, CAMPAIGN_FINALE_STATUS.READY);
  assert.equal(migrated.state.finale.creditsViewed, false);
  assert.equal(migrated.state.finale.freeplayUnlocked, false);
});
