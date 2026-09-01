import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyHubContinuity,
  resolveHubContinuity,
} from '../src/core/hub-continuity.js';
import { makeLuxuryMorningMugs } from '../src/luxury-apartment/continuity-props.js';

test('the shared hub contract resolves campaign phases into physical continuity obligations', () => {
  assert.deepEqual(resolveHubContinuity('apartment', 'no_wake').visible, [
    'apartment.motel-key',
    'apartment.willy-gap',
  ]);
  assert.deepEqual(resolveHubContinuity('apartment', 'no_wake').hidden, [
    'apartment.willy-photo',
  ]);

  assert.equal(resolveHubContinuity('cabin', 'interrogation').callback,
    'cabin.cellar-work');
  assert.ok(resolveHubContinuity('cabin', 'explore').hidden.includes('cabin.cellar-entry'),
    'the first visit must not reveal the later torture-room entrance');
  assert.ok(resolveHubContinuity('cabin', 'second_rest').hidden.includes('cabin.cellar-entry'),
    'the cellar remains concealed until Gratin finishes the reveal call');
  assert.deepEqual(resolveHubContinuity('cabin', 'open_cellar').visible,
    ['cabin.cellar-entry']);
  assert.deepEqual(resolveHubContinuity('cabin', 'interrogation').visible, [
    'cabin.cellar-entry',
    'cabin.dungeon',
  ]);
  assert.equal(resolveHubContinuity('cabin', 'wrap_bodies').cleanup,
    'cabin.body-cleanup');

  assert.deepEqual(resolveHubContinuity('luxury_apartment', 'morning').visible, [
    'luxury.margo-morning-mugs',
  ]);
  assert.deepEqual(resolveHubContinuity('luxury_apartment', 'no_wake').visible, [
    'luxury.margo-morning-mugs',
  ]);
  assert.deepEqual(resolveHubContinuity('luxury_apartment', 'stayover').hidden, [
    'luxury.margo-morning-mugs',
  ]);

  const repaired = resolveHubContinuity('mansion', 'return');
  assert.deepEqual(repaired.visible, ['mansion.foyer-repair-site']);
  assert.equal(repaired.news, 'mansion.return.wrong-city-and-palace');
  assert.equal(repaired.cleanup, 'mansion.siege-repairs-in-progress');
});

test('applying continuity changes real scene objects and refuses to call missing content visible', () => {
  const guestMugs = { visible: false, userData: {} };
  const morning = applyHubContinuity({
    hub: 'luxury_apartment',
    phase: 'morning',
    props: new Map([['luxury.margo-morning-mugs', guestMugs]]),
  });
  assert.equal(guestMugs.visible, true);
  assert.deepEqual(morning.visible, ['luxury.margo-morning-mugs']);
  assert.deepEqual(morning.missing, []);
  assert.equal(guestMugs.userData.hubContinuity.phase, 'morning');

  const afterSheLeaves = applyHubContinuity({
    hub: 'luxury_apartment',
    phase: 'no_wake',
    props: new Map([['luxury.margo-morning-mugs', guestMugs]]),
  });
  assert.equal(guestMugs.visible, true,
    'the cups remain after Margo leaves and make the empty room read as a continuation');
  assert.deepEqual(afterSheLeaves.visible, ['luxury.margo-morning-mugs']);

  const absentRepairSite = applyHubContinuity({
    hub: 'mansion',
    phase: 'return',
    props: new Map(),
  });
  assert.deepEqual(absentRepairSite.visible, []);
  assert.deepEqual(absentRepairSite.missing, ['mansion.foyer-repair-site']);
  assert.equal(absentRepairSite.ok, false,
    'a plan with no mounted player-visible object must not report green');
});

test('the luxury stayover trace is real renderable geometry, not continuity metadata', () => {
  const mugs = makeLuxuryMorningMugs();
  assert.equal(mugs.name, 'luxury-margo-morning-mugs');
  assert.equal(mugs.visible, false, 'the current phase must opt the trace in');
  assert.equal(mugs.children.filter((child) => child.userData.continuityMug).length, 2);
  assert.ok(mugs.children.every((mug) => mug.children.some((child) => child.isMesh)),
    'each promised mug must contain a mesh a player can actually see');
});
