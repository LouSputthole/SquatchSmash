import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHARACTER_IDS,
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import {
  DAY_FOUR_LOU_HEIST_CALL,
  HEIST_CLEANUP_ITEMS,
  HEIST_PREPARATION_ITEMS,
  NEW_SPACE_LOU_CALL,
  createApartmentStory,
} from '../src/core/apartment-story.js';
import { computeHeistSettlement, createBankHeistStory } from '../src/core/bank-heist-story.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

/**
 * The morning of THE TAKE, which is Day 5 now.
 *
 * It used to be Day 4 with Silver Pines and the Silver Room already finished,
 * because the round and the date both came first. The owner's ruling reversed
 * that -- home from the Motel, do the heist, THEN Lou rings about the new
 * space -- so the only thing behind him here is the Jerky Motel, and the
 * chapter's own pastime has to be done before the door opens.
 */
function heistDayCampaign() {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.story.chapter = 'heist_day';
    state.story.day = 5;
    state.story.timeMinutes = 12 * 60;
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.activities.playedCounterSquatch = true;
  });
  return campaign;
}

test('THE TAKE cannot start before the Jerky Motel sends him home', () => {
  const campaign = heistDayCampaign();
  campaign.update((state) => {
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'locked';
    state.missions[MISSION_IDS.BANK_HEIST].status = 'available';
    state.events[EVENT_IDS.LOU_HEIST_CALL].status = 'answered';
    Object.keys(state.missions[MISSION_IDS.BANK_HEIST].preparation)
      .filter((key) => key !== 'extraMagazine')
      .forEach((key) => { state.missions[MISSION_IDS.BANK_HEIST].preparation[key] = true; });
    state.missions[MISSION_IDS.BANK_HEIST].preparationComplete = true;
  });

  /* The gate that used to stand here was `golf_incomplete`, and before that
   * `silver_incomplete`. Both were the old order stated as a precondition. */
  assert.deepEqual(createBankHeistStory({ campaign }).begin(), {
    ok: false, reason: 'motel_incomplete',
  });
  assert.equal(campaign.state.missions[MISSION_IDS.BANK_HEIST].status, 'available');
});

test('Lou gates THE TAKE until every required apartment item is physically collected', () => {
  const campaign = heistDayCampaign();
  const apartment = createApartmentStory({ campaign, ring: () => true });

  assert.equal(apartment.margoWakeOwed(), false);
  assert.deepEqual(apartment.tryLeave(campaign.state.activities), {
    kind: 'call',
    id: EVENT_IDS.LOU_HEIST_CALL,
    line: 'Lou said he would call. Today is not a day to guess.',
    vo: 'door.refusal.heist_call',
  });
  assert.equal(apartment.callAnswered(DAY_FOUR_LOU_HEIST_CALL), true);
  assert.equal(campaign.state.missions[MISSION_IDS.BANK_HEIST].status, 'available');

  for (const item of HEIST_PREPARATION_ITEMS) {
    assert.equal(apartment.collectHeistPreparation(item.id), true);
  }
  assert.equal(campaign.state.missions[MISSION_IDS.BANK_HEIST].preparationComplete, true);
  assert.deepEqual(apartment.tryLeave(campaign.state.activities), {
    kind: 'go', destination: SCENE_IDS.BANK_HEIST,
  });
});

test('THE TAKE records authored checkpoints exactly once and folds its result into campaign', () => {
  const campaign = heistDayCampaign();
  const apartment = createApartmentStory({ campaign, ring: () => true });
  apartment.callAnswered(DAY_FOUR_LOU_HEIST_CALL);
  for (const item of HEIST_PREPARATION_ITEMS) apartment.collectHeistPreparation(item.id);
  const story = createBankHeistStory({ campaign });

  assert.deepEqual(story.begin(), { ok: true, resumed: false, checkpoint: null });
  assert.equal(story.checkpoint('bank_secured'), false);
  assert.equal(story.checkpoint('safehouse_ready'), true);
  assert.equal(story.checkpoint('safehouse_ready'), false);
  assert.equal(story.checkpoint('bank_secured', { guardsDisarmed: 2 }), true);
  assert.equal(story.checkpoint('vault_open', { bagsStaged: 8 }), true);
  assert.equal(story.checkpoint('street_withdrawal', { policeHeat: 62 }), true);
  assert.equal(story.checkpoint('mercer_garage', {
    bagsRecovered: 7,
    droppedBagRecovered: true,
    crewInjuries: { [CHARACTER_IDS.RIPPINFLOW]: 'moderate' },
  }), true);
  assert.equal(story.checkpoint('vehicle_swap', {
    playerDroveEscape: true, vehicleDamage: 38,
  }), true);
  assert.equal(story.complete({
    bagsRecovered: 7,
    grossTake: 1_260_000,
    compromisedCash: 0,
    followedSnow: true,
    disciplinedFire: true,
  }), true);

  const state = campaign.state;
  assert.equal(state.story.chapter, 'post_heist');
  assert.equal(state.missions[MISSION_IDS.BANK_HEIST].status, 'complete');
  assert.equal(state.missions[MISSION_IDS.BANK_HEIST].outcome, 'professional');
  assert.equal(state.missions[MISSION_IDS.BANK_HEIST].grossTake, 1_260_000);
  assert.deepEqual({
    operationalLoss: state.missions[MISSION_IDS.BANK_HEIST].operationalLoss,
    familyShare: state.missions[MISSION_IDS.BANK_HEIST].familyShare,
    crewShare: state.missions[MISSION_IDS.BANK_HEIST].crewShare,
    prospectShare: state.missions[MISSION_IDS.BANK_HEIST].prospectShare,
  }, computeHeistSettlement({
    grossTake: 1_260_000,
    compromisedCash: 0,
    vehicleDamage: 38,
    primaryVanLost: true,
    crewInjuries: { [CHARACTER_IDS.RIPPINFLOW]: 'moderate' },
  }));
  assert.ok(state.missions[MISSION_IDS.BANK_HEIST].prospectShare > 0);
  assert.equal(state.missions[MISSION_IDS.BANK_HEIST]
    .crewInjuries[CHARACTER_IDS.RIPPINFLOW], 'moderate');
  assert.equal(state.missions[MISSION_IDS.SILVER_CASE].status, 'available');
  assert.equal(state.missions[MISSION_IDS.INITIATION].status, 'locked');

  /* BEAT 12. Home after dark, the flat to clean, and then the telephone.
   * The lay-low message and the drive north used to stand here; the luxury
   * apartment owns the Silver Case doorway now. */
  for (const item of HEIST_CLEANUP_ITEMS) {
    assert.equal(apartment.completeHeistCleanup(item.id), true);
  }
  assert.equal(campaign.state.missions[MISSION_IDS.BANK_HEIST].cleanupComplete, true);
  assert.equal(apartment.tryLeave(campaign.state.activities).id, EVENT_IDS.LOU_GOLF_CALL);
  assert.equal(apartment.callAnswered(NEW_SPACE_LOU_CALL), true);
  assert.equal(apartment.tryLeave(campaign.state.activities).kind, 'stay');
  assert.deepEqual(apartment.sleep(), {
    ok: true, chapter: 'golf_morning', day: 6, timeMinutes: 7 * 60,
  });
});

test('required heist progress refuses to advance when persistence is unavailable', () => {
  const campaign = heistDayCampaign();
  const apartment = createApartmentStory({ campaign, ring: () => true });
  apartment.callAnswered(DAY_FOUR_LOU_HEIST_CALL);
  for (const item of HEIST_PREPARATION_ITEMS) apartment.collectHeistPreparation(item.id);
  campaign.storage = null;
  const story = createBankHeistStory({ campaign });

  assert.throws(() => story.begin(), /could not be saved/i);
  assert.equal(campaign.state.missions[MISSION_IDS.BANK_HEIST].status, 'available');
});
