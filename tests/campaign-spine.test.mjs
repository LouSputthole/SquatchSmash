import assert from 'node:assert/strict';
import test from 'node:test';

import { SCENE_IDS, SCENES } from '../src/core/campaign.js';
import {
  CAMPAIGN_SPINE,
  CHAPTERS,
  PENDING_BEATS,
  RESIDENCE,
  RESIDENCE_LADDER,
  TEMPORARY_RESIDENCES,
  beatsForScene,
  residenceAfter,
  spineBeat,
} from '../src/core/campaign-spine.js';

/**
 * How many beats the built campaign does not yet play in the position the
 * bible puts them. This number is allowed to fall and nothing else. Raising it
 * means a beat that used to be wired stopped being wired, which is a
 * regression whatever the commit message says.
 */
const PENDING_BUDGET = 15;

test('the spine runs in order and every number is distinct', () => {
  const numbers = CAMPAIGN_SPINE.map((b) => b.n);
  assert.deepEqual([...numbers].sort((a, b) => a - b), numbers,
    'beats must be listed in the order they are played');
  assert.equal(new Set(numbers).size, numbers.length,
    'two beats share a scene number');
});

test('every beat id is unique and findable', () => {
  const ids = CAMPAIGN_SPINE.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate beat id');
  for (const id of ids) assert.equal(spineBeat(id)?.id, id);
  assert.equal(spineBeat('no-such-beat'), null,
    'an unknown id is a null, not a throw');
});

test('every beat names a real scene, and a real spawn when it travels', () => {
  for (const b of CAMPAIGN_SPINE) {
    const scene = SCENES[b.scene];
    assert.ok(scene, `beat ${b.id} names scene ${b.scene}, which does not exist`);
    if (b.spawn === null) continue;
    assert.ok(scene.spawns.includes(b.spawn),
      `beat ${b.id} spawns at ${b.spawn}, which ${b.scene} does not offer`);
  }
});

/**
 * The check that caught THE TAKE. The bible has thirty scenes and the campaign
 * has more than thirty things in it; a mission nobody wrote a beat for is a
 * mission that quietly stops being reachable when the spine is wired.
 */
test('no scene is left out of the spine', () => {
  const placed = new Set(CAMPAIGN_SPINE.map((b) => b.scene));
  const orphans = Object.values(SCENE_IDS).filter((id) => !placed.has(id));
  assert.deepEqual(orphans, [],
    `these scenes are built but have no beat: ${orphans.join(', ')}`);
});

test('the first beat is the fake-out and the last one is the ceremony', () => {
  assert.equal(CAMPAIGN_SPINE.at(0).id, 'squatch_smash_intro');
  assert.equal(CAMPAIGN_SPINE.at(-1).id, 'initiation');
  assert.equal(CAMPAIGN_SPINE.at(-1).scene, SCENE_IDS.INITIATION);
});

test('chapters arrive in order and never resume once left', () => {
  const order = CHAPTERS.map((c) => c.id);
  const seen = [];
  for (const b of CAMPAIGN_SPINE) {
    assert.ok(order.includes(b.chapter), `beat ${b.id} is in no chapter`);
    if (seen.at(-1) !== b.chapter) {
      assert.ok(!seen.includes(b.chapter),
        `chapter ${b.chapter} resumes after it ended, at ${b.id}`);
      seen.push(b.chapter);
    }
  }
  assert.deepEqual(seen, order, 'a chapter is missing or out of order');
});

/**
 * The Home Ladder. Every residence is either a rung he owns or a bed the
 * family found him, and it climbs the owned ones without ever going back.
 */
test('the home ladder climbs and never falls back', () => {
  let highest = 0;
  for (const b of CAMPAIGN_SPINE) {
    assert.ok(Object.values(RESIDENCE).includes(b.residence),
      `beat ${b.id} lives at ${b.residence}, which is not a residence`);
    if (TEMPORARY_RESIDENCES.includes(b.residence)) continue;
    const rung = RESIDENCE_LADDER.indexOf(b.residence);
    assert.ok(rung >= 0, `beat ${b.id} lives at ${b.residence}, which is no rung`);
    assert.ok(rung >= highest,
      `beat ${b.id} moves him back down to ${b.residence}`);
    highest = rung;
  }
  assert.equal(highest, RESIDENCE_LADDER.length - 1,
    'the campaign never gets him to the top of the ladder');
});

test('the cabin and the guest suite are beds, not homes', () => {
  for (const id of ['cabin_lay_low', 'booski_sasole_call', 'beef_run']) {
    assert.ok(TEMPORARY_RESIDENCES.includes(spineBeat(id).residence),
      `${id} treats the cabin as somewhere he moved to`);
  }
  assert.equal(residenceAfter('cabin_two'), RESIDENCE.STARTER,
    'the lay-low ends by sending him back to the flat he already had');
  assert.ok(TEMPORARY_RESIDENCES.includes(residenceAfter('silent_squatch')),
    'a guest room is not a promotion');
});

test('the starter flat goes dark the moment Lou hands over the keys', () => {
  const handover = CAMPAIGN_SPINE.findIndex((b) => b.id === 'luxury_apartment_intro');
  assert.ok(handover > 0, 'the luxury apartment introduction is missing');
  const after = CAMPAIGN_SPINE.slice(handover);
  const backHome = after.filter((b) => b.residence === RESIDENCE.STARTER);
  assert.deepEqual(backHome.map((b) => b.id), [],
    'the campaign moves him back into the starter apartment after the upgrade');
  const spawnsThere = after.filter((b) => b.scene === SCENE_IDS.APARTMENT);
  assert.deepEqual(spawnsThere.map((b) => b.id), [],
    'a beat after the upgrade still plays in the starter apartment');
});

test('the luxury apartment carries its five story states', () => {
  const beats = beatsForScene(SCENE_IDS.LUXURY_APARTMENT);
  assert.deepEqual(beats.map((b) => b.id), [
    'luxury_apartment_intro',
    'margo_stayover',
    'luxury_apartment_morning',
    'luxury_apartment_return',
    'special_meeting_call',
  ]);
});

/**
 * ONE CABIN, IN ACT ONE, AND BEEF RUN CUTS IT IN HALF.
 *
 * The Cabin Hideaway chapter -- cellar, dungeon, interrogation, executions,
 * pyre, blackout -- is not a post-heist lay-low that happens to share a
 * location. It is this scene. Beats 4 and 5 are its light half and beat 7 is
 * its dark one, and nothing about it may drift back to the end of the
 * campaign without somebody deciding to move it.
 */
test('the cabin is one Act-One scene, split around the Beef Run', () => {
  const beats = beatsForScene(SCENE_IDS.COUNTRYSIDE_CABIN);
  assert.deepEqual(beats.map((b) => b.id),
    ['cabin_lay_low', 'booski_sasole_call', 'cabin_two']);
  for (const b of beats) {
    assert.equal(b.chapter, 'prospect',
      `${b.id} left Act One -- the cabin chapter belongs to the Prospect`);
  }

  /* The dark half must sit AFTER the flight. Front-loading it would have him
   * interrogating and burning two men before he had done a job for anybody. */
  const n = (id) => spineBeat(id).n;
  assert.ok(n('cabin_lay_low') < n('beef_run'), 'the light half comes first');
  assert.ok(n('beef_run') < n('cabin_two'), 'the dungeon comes after the flight');

  /* And it must still be Act One when it happens: no beat from a later
   * chapter may slip between the two halves. */
  const between = CAMPAIGN_SPINE.filter((b) => b.n > n('cabin_lay_low') && b.n < n('cabin_two'));
  for (const b of between) {
    assert.equal(b.chapter, 'prospect',
      `${b.id} interrupts the cabin chapter from a later act`);
  }

  assert.equal(spineBeat('initiation').scene, SCENE_IDS.INITIATION,
    'the ceremony cabin is its own scene, not a third visit to this one');
});

test('Beef Run happens while he is already out at the cabin', () => {
  assert.equal(residenceAfter('beef_run'), RESIDENCE.CABIN);
  const n = (id) => spineBeat(id).n;
  assert.ok(n('cabin_lay_low') < n('beef_run'),
    'Sasole cannot be met before the Prospect is sent out of the city');
  assert.ok(n('beef_run') < n('cabin_two'));
  assert.ok(n('beef_run') < n('enola_squatch'),
    'Enola must remember Beef Run, so Beef Run must come first');
});

test('Margo is met, called, taken out, and stays over, in that order', () => {
  const n = (id) => spineBeat(id).n;
  assert.ok(n('bada_bing_one') < n('cabin_lay_low'),
    'he cannot call a number he has not been given');
  assert.ok(n('cabin_lay_low') < n('front_and_center'));
  assert.ok(n('front_and_center') < n('margo_stayover'));
  assert.ok(n('margo_stayover') < n('luxury_apartment_morning'));
  assert.ok(n('luxury_apartment_intro') < n('margo_stayover'),
    'Margo cannot come home to an apartment the player has never seen');
});

test('THE TAKE sits between coming home and the new-space call', () => {
  const n = (id) => spineBeat(id).n;
  assert.ok(n('return_to_old_apartment') < n('bank_heist'));
  assert.ok(n('bank_heist') < n('new_space_call'));
  assert.equal(residenceAfter('bank_heist'), RESIDENCE.STARTER,
    'the loadout collection and the cleanup both live in the starter flat');
});

test('every war mission causes the next one', () => {
  const n = (id) => spineBeat(id).n;
  const war = ['silver_case_setup', 'silver_case_mansion', 'silent_squatch',
    'mansion_siege', 'enola_squatch', 'mansion_return', 'cartel_palace'];
  for (let i = 1; i < war.length; i += 1) {
    assert.ok(n(war[i - 1]) < n(war[i]),
      `${war[i]} is played before ${war[i - 1]}`);
  }
  assert.ok(n('cartel_palace') < n('special_meeting_call'),
    'the war must be over before anybody talks about making him');
});

test('the pending count only ever falls', () => {
  assert.ok(PENDING_BEATS.length <= PENDING_BUDGET,
    `${PENDING_BEATS.length} beats are pending and the budget is ${PENDING_BUDGET}: `
    + `${PENDING_BEATS.join(', ')}`);
  assert.equal(PENDING_BEATS.length, PENDING_BUDGET,
    `${PENDING_BUDGET - PENDING_BEATS.length} beat(s) got wired -- lower `
    + 'PENDING_BUDGET to lock the win in');
});

test('a wired beat plays in a scene that actually exists on disk', () => {
  for (const b of CAMPAIGN_SPINE) {
    if (b.status !== 'wired') continue;
    assert.ok(SCENES[b.scene]?.href,
      `beat ${b.id} is marked wired but ${b.scene} has no page`);
  }
});

test('every beat says where it goes next', () => {
  for (const b of CAMPAIGN_SPINE) {
    assert.equal(typeof b.exit, 'string');
    assert.ok(b.exit.length > 12, `beat ${b.id} has no exit written`);
  }
});
