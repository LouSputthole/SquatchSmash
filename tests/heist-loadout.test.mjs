import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  HEIST_ITEM_CATALOG, HEIST_SLOT_ORDER, HEIST_WEAPON_DEFS, HeistLoadout,
} from '../src/heist/loadout.js';
import { HeistObjectiveLedger } from '../src/heist/objective.js';
import {
  makeBalaclava, makeCashBag, makeHeistCarbine, makeHeistSidearm, makeHeistViewModel,
} from '../src/heist/weapons.js';

test('the bar has five fixed slots and never repacks under the player', () => {
  const loadout = new HeistLoadout();
  assert.equal(loadout.items.length, 5);
  assert.equal(HEIST_SLOT_ORDER.length, 5);
  loadout.setSlots({ armed: false, mask: false, bag: 'duffel' });
  assert.deepEqual(loadout.items, [null, null, null, 'duffel', null]);
  loadout.setSlots({ armed: true, mask: true, bag: 'duffel' });
  assert.deepEqual(loadout.items, ['carbine', 'sidearm', 'mask', 'duffel', null]);
});

test('every item the bar can hold has a catalog entry with an icon', () => {
  const loadout = new HeistLoadout();
  loadout.setSlots({ armed: true, mask: true, bag: 'cash_bag', keys: true });
  loadout.wearMask(true);
  const seen = new Set([...loadout.items, 'duffel', 'mask'].filter(Boolean));
  for (const key of seen) {
    assert.ok(HEIST_ITEM_CATALOG[key]?.icon, `no icon for ${key}`);
    assert.ok(HEIST_ITEM_CATALOG[key]?.name, `no name for ${key}`);
  }
});

test('number keys pick a slot, empty slots refuse, and the wheel skips them', () => {
  const loadout = new HeistLoadout();
  loadout.setSlots({ armed: true, mask: false, bag: 'duffel' });
  assert.equal(loadout.selected, 0);
  assert.equal(loadout.select(1), true);
  assert.equal(loadout.selectedItem, 'sidearm');
  assert.equal(loadout.select(2), false, 'picked an empty slot');
  assert.equal(loadout.selectedItem, 'sidearm');
  assert.equal(loadout.select(3), true);
  assert.equal(loadout.selectedItem, 'duffel');
  // Wheel forward from slot 3 wraps past the empty slot 4 back to the carbine.
  loadout.cycle(1);
  assert.equal(loadout.selectedItem, 'carbine');
  loadout.cycle(-1);
  assert.equal(loadout.selectedItem, 'duffel');
});

test('the selection decides whether there is a trigger at all', () => {
  const loadout = new HeistLoadout();
  loadout.setSlots({ armed: true, mask: true, bag: 'cash_bag' });
  assert.equal(loadout.selectedIsWeapon, true);
  assert.equal(loadout.activeWeapon, loadout.weapons.carbine);
  loadout.select(1);
  assert.equal(loadout.activeWeapon, loadout.weapons.sidearm);
  loadout.select(2);
  assert.equal(loadout.selectedIsWeapon, false);
  assert.equal(loadout.activeWeapon, null, 'a balaclava should not fire');
  loadout.select(3);
  assert.equal(loadout.activeWeapon, null, 'a bag of money should not fire');
});

test('the two weapons are genuinely different guns, and they are the catalog guns', () => {
  assert.notEqual(HEIST_WEAPON_DEFS.carbine.name, HEIST_WEAPON_DEFS.sidearm.name);
  assert.ok(HEIST_WEAPON_DEFS.carbine.damage > HEIST_WEAPON_DEFS.sidearm.damage);
  assert.ok(HEIST_WEAPON_DEFS.carbine.magazineSize > HEIST_WEAPON_DEFS.sidearm.magazineSize);
  assert.ok(HEIST_WEAPON_DEFS.carbine.penetration > HEIST_WEAPON_DEFS.sidearm.penetration);
  /* The numbers are the shared catalog's now — the 30-round armory carbine
   * and Lou's fifteen-round 9mm — behind the mission's own display names. */
  assert.equal(HEIST_WEAPON_DEFS.carbine.weaponId, 'carbine');
  assert.equal(HEIST_WEAPON_DEFS.sidearm.weaponId, 'pistol9');
  const loadout = new HeistLoadout();
  loadout.setSlots({ armed: true });
  loadout.weapons.carbine.fire();
  assert.equal(loadout.weapons.carbine.magazine, HEIST_WEAPON_DEFS.carbine.magazineSize - 1);
  assert.equal(loadout.weapons.sidearm.magazine, HEIST_WEAPON_DEFS.sidearm.magazineSize,
    'firing one gun emptied the other');
});

test('the mask slot becomes the zip ties the moment the mask goes on', () => {
  const loadout = new HeistLoadout();
  loadout.setSlots({ armed: true, mask: true, bag: 'duffel' });
  assert.equal(loadout.items[2], 'mask');
  loadout.select(2);
  assert.equal(loadout.maskInHand, true);
  loadout.wearMask(true);
  assert.equal(loadout.items[2], 'zip_ties');
  assert.equal(loadout.tiesInHand, true);
  assert.equal(loadout.maskWorn, true);
  // And it survives a slot rebuild, so a checkpoint cannot put it back on the
  // table after Tony has pulled it down.
  loadout.setSlots({ armed: true, mask: true, bag: 'duffel' });
  assert.equal(loadout.items[2], 'zip_ties');
});

test('a loadout snapshot round-trips, including the mask and both magazines', () => {
  const loadout = new HeistLoadout();
  loadout.setSlots({ armed: true, mask: true, bag: 'duffel' });
  loadout.wearMask(true);
  loadout.select(1);
  loadout.weapons.sidearm.fire();
  loadout.update(0.4);   // the Commander is deliberately slow; let it cycle
  loadout.weapons.sidearm.fire();
  const snapshot = JSON.parse(JSON.stringify(loadout.snapshot()));
  const restored = new HeistLoadout();
  restored.restore(snapshot);
  assert.equal(restored.selected, 1);
  assert.equal(restored.selectedItem, 'sidearm');
  assert.equal(restored.maskWorn, true);
  assert.equal(restored.weapons.sidearm.magazine, HEIST_WEAPON_DEFS.sidearm.magazineSize - 2);
  assert.equal(restored.weapons.carbine.magazine, HEIST_WEAPON_DEFS.carbine.magazineSize);
});

test('the view-model shows exactly one thing, and it is the selected thing', () => {
  const camera = new THREE.PerspectiveCamera();
  const view = makeHeistViewModel(camera);
  const loadout = new HeistLoadout();
  loadout.setSlots({ armed: true, mask: true, bag: 'cash_bag', keys: true });
  for (const index of [0, 1, 2, 3, 4]) {
    if (!loadout.items[index]) continue;
    loadout.selected = index;
    view.show(loadout.selectedItem);
    const visible = [...view.holders.entries()].filter(([, group]) => group.visible);
    assert.equal(visible.length, 1, `slot ${index} shows ${visible.length} props`);
    assert.equal(visible[0][0], loadout.selectedItem);
  }
  view.show(null);
  assert.equal([...view.holders.values()].filter((group) => group.visible).length, 0);
});

test('the guns are modelled rather than four boxes on a stick', () => {
  const carbine = makeHeistCarbine({ sling: true });
  for (const part of [
    'carbine-barrel', 'carbine-flash-hider', 'carbine-gas-block', 'carbine-front-sight',
    'carbine-handguard', 'carbine-upper', 'carbine-lower', 'carbine-magazine',
    'carbine-charging-handle', 'carbine-rear-sight', 'carbine-grip', 'carbine-stock',
    'carbine-buttplate', 'carbine-buffer-tube', 'carbine-sling',
  ]) assert.ok(carbine.getObjectByName(part), `carbine is missing ${part}`);
  let meshes = 0;
  carbine.traverse((object) => { if (object.isMesh) meshes++; });
  assert.ok(meshes >= 30, `carbine is only ${meshes} meshes`);
  assert.ok(carbine.userData.muzzle.z < 0, 'the muzzle must point down local -Z');

  const sidearm = makeHeistSidearm();
  for (const part of [
    'sidearm-slide', 'sidearm-frame', 'sidearm-grip', 'sidearm-trigger',
    'sidearm-muzzle', 'sidearm-front-sight', 'sidearm-floorplate',
  ]) assert.ok(sidearm.getObjectByName(part), `sidearm is missing ${part}`);
  assert.ok(sidearm.userData.muzzle.z < 0);

  assert.ok(makeBalaclava({ rolled: false }).children.length > 0);
  assert.ok(makeCashBag({ full: true }).getObjectByName('bag-spill'));
});

test('the objective ledger only calls a job professional when it was one', () => {
  const ledger = new HeistObjectiveLedger({ totalBags: 8, civiliansPresent: 22 });
  ledger.syncLoot({ recoveredBags: 8, grossRecovered: 1470000, abandonedBags: 0 });
  assert.equal(ledger.disciplinedFire, true);
  assert.equal(ledger.followedSnow, true);
  assert.equal(ledger.grade(), 'professional');

  ledger.syncHostages({ robbed: 2, personalCashTaken: 640, casualties: 0, restrained: 6 });
  assert.equal(ledger.followedSnow, false);
  assert.equal(ledger.grade(), 'hard_exit', 'robbing the customers is not professional');

  const clean = new HeistObjectiveLedger({ totalBags: 8, civiliansPresent: 22 });
  clean.syncLoot({ recoveredBags: 8, grossRecovered: 1470000 });
  clean.noteCivilianHit({ fatal: true });
  assert.equal(clean.disciplinedFire, false);
  assert.equal(clean.civiliansSafe, 21);
  assert.equal(clean.grade(), 'costly_success');

  const messy = new HeistObjectiveLedger({ totalBags: 8, civiliansPresent: 22 });
  messy.syncLoot({ recoveredBags: 3, grossRecovered: 540000 });
  assert.equal(messy.grade(), 'costly_success');
});

test('the ledger reports the exact shape the campaign write expects', () => {
  const ledger = new HeistObjectiveLedger({ totalBags: 8, civiliansPresent: 22 });
  ledger.syncLoot({ recoveredBags: 7, grossRecovered: 1260000 });
  ledger.noteFriendlyFire();
  const report = ledger.report();
  assert.deepEqual(Object.keys(report).sort(),
    ['civiliansHarmed', 'disciplinedFire', 'followedSnow', 'outcome']);
  assert.equal(report.disciplinedFire, false, 'friendly fire is not discipline');
  assert.equal(report.civiliansHarmed, 0);
  const card = ledger.scorecard();
  assert.equal(card[0].key, 'civilians', 'people are the first line of the debrief');
  assert.equal(card[1].key, 'bags');
  assert.ok(card.every((row) => typeof row.value === 'string' && row.label));
});

test('the ledger survives a checkpoint', () => {
  const ledger = new HeistObjectiveLedger();
  ledger.noteShot({ hitActor: true });
  ledger.noteCivilianHit({ fatal: true });
  ledger.noteOfficerDown();
  const snapshot = JSON.parse(JSON.stringify(ledger.capture()));
  const restored = new HeistObjectiveLedger();
  restored.restore(snapshot);
  assert.equal(restored.civilianCasualties, 1);
  assert.equal(restored.officersDown, 1);
  assert.equal(restored.shotsOnTarget, 1);
});
