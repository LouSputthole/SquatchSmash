import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  FINAL_ARC_LOADOUT_STORAGE_KEY,
  createFinalArcLoadout,
} from '../src/core/final-arc-loadout.js';
import { Firearm, READY } from '../src/core/weapons/Firearm.js';
import * as THREE from 'three';
import { mountArmory } from '../src/core/weapons/Armory.js';
import { createMansionLoadout } from '../src/mansion/loadout.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
}

test('earned guns keep their five-slot order and selection across scenes', () => {
  const storage = new MemoryStorage();
  const mansion = createFinalArcLoadout({ storage });

  assert.deepEqual(mansion.items, [null, null, null, null, null]);
  assert.deepEqual(mansion.acquire('pistol9'), { ok: true, slot: 0 });
  assert.deepEqual(mansion.acquire('carbine'), { ok: true, slot: 1 });
  mansion.select(0);

  const siege = createFinalArcLoadout({ storage });
  assert.deepEqual(siege.items, ['pistol9', 'carbine', null, null, null]);
  assert.equal(siege.selected, 0);
  assert.equal(siege.equipped, 'pistol9');
  assert.ok(storage.getItem(FINAL_ARC_LOADOUT_STORAGE_KEY));
});

function fakeWeapons() {
  const firearms = new Map();
  return {
    equipped: null,
    firearm(id) {
      if (!firearms.has(id)) {
        firearms.set(id, {
          rounds: 0,
          reserve: 0,
          snapshot() { return { id, rounds: this.rounds, reserve: this.reserve }; },
          restore(value) {
            this.rounds = value.rounds;
            this.reserve = value.reserve;
          },
        });
      }
      return firearms.get(id);
    },
    equip(id) { this.equipped = id; return true; },
    stow() { this.equipped = null; return true; },
  };
}

test('ammo and a deliberately stowed gun restore without losing ownership', () => {
  const storage = new MemoryStorage();
  const mansion = createFinalArcLoadout({ storage });
  const mansionWeapons = fakeWeapons();
  mansion.acquire('pistol9');
  mansionWeapons.equip('pistol9');
  mansionWeapons.firearm('pistol9').rounds = 4;
  mansionWeapons.firearm('pistol9').reserve = 31;

  mansion.capture(mansionWeapons);
  mansion.stow(mansionWeapons);

  const siege = createFinalArcLoadout({ storage });
  const siegeWeapons = fakeWeapons();
  siege.apply(siegeWeapons);

  assert.equal(siege.has('pistol9'), true);
  assert.equal(siege.equipped, null);
  assert.equal(siegeWeapons.equipped, null);
  assert.deepEqual(siegeWeapons.firearm('pistol9').snapshot(), {
    id: 'pistol9', rounds: 4, reserve: 31,
  });

  siege.select(0, siegeWeapons);
  assert.equal(siegeWeapons.equipped, 'pistol9');
});

test('checkpoint restore puts slot selection and per-gun ammo back together', () => {
  const loadout = createFinalArcLoadout({ storage: new MemoryStorage() });
  const weapons = fakeWeapons();
  loadout.acquire('pistol9', { rounds: 12, reserve: 45 });
  loadout.acquire('saw', { rounds: 83, reserve: 100 });
  loadout.select(1, weapons);
  loadout.apply(weapons);
  const checkpoint = loadout.checkpoint();

  weapons.firearm('saw').rounds = 2;
  weapons.firearm('saw').reserve = 0;
  loadout.capture(weapons);
  loadout.select(0, weapons);

  loadout.restore(checkpoint, weapons);
  assert.deepEqual(loadout.items, ['pistol9', 'saw', null, null, null]);
  assert.equal(loadout.selected, 1);
  assert.equal(loadout.equipped, 'saw');
  assert.equal(weapons.equipped, 'saw');
  assert.deepEqual(weapons.firearm('saw').snapshot(), {
    id: 'saw', rounds: 83, reserve: 100,
  });
});

test('restoring firearm ammo cancels transient trigger and reload state', () => {
  const firearm = new Firearm('pistol9', { rounds: 2, reserve: 5 });
  firearm.setTrigger(true);
  assert.equal(firearm.reload(), true);

  firearm.restore({ rounds: 11, reserve: 27 });

  assert.equal(firearm.state, READY);
  assert.equal(firearm.rounds, 11);
  assert.equal(firearm.reserve, 27);
  assert.equal(firearm.triggerHeld, false);
  assert.equal(firearm.reloading, false);
});

test('a sixth gun returns an explicit full result without replacing an owned gun', () => {
  const loadout = createFinalArcLoadout({ storage: new MemoryStorage() });
  for (const id of ['revolver', 'pistol9', 'carbine', 'ak47', 'saw']) {
    assert.equal(loadout.acquire(id).ok, true);
  }

  assert.deepEqual(loadout.acquire('barrett'), { ok: false, reason: 'full' });
  assert.deepEqual(loadout.items, ['revolver', 'pistol9', 'carbine', 'ak47', 'saw']);
});

test('the shared final-arc contract rejects scene-owned story props', () => {
  const loadout = createFinalArcLoadout({ storage: new MemoryStorage() });

  assert.deepEqual(loadout.acquire('phone'), { ok: false, reason: 'unknown_weapon' });
  assert.deepEqual(loadout.acquire('case'), { ok: false, reason: 'unknown_weapon' });
  assert.deepEqual(loadout.items, [null, null, null, null, null]);
});

test('an explicit rack return removes only that gun and keeps the other slot positions', () => {
  const loadout = createFinalArcLoadout({ storage: new MemoryStorage() });
  loadout.replaceSlots([null, 'pistol9', null, 'saw', null], {
    selected: 3,
    equipped: 'saw',
  });

  assert.equal(loadout.remove('saw'), true);
  assert.deepEqual(loadout.items, [null, 'pistol9', null, null, null]);
  assert.equal(loadout.has('pistol9'), true);
  assert.equal(loadout.equipped, null);
});

test('Mansion hydrates durable guns and adding one never deletes the others', () => {
  const durable = createFinalArcLoadout({ storage: new MemoryStorage() });
  durable.replaceSlots(['pistol9', null, 'carbine', null, null], {
    selected: 2,
    equipped: 'carbine',
  });
  const weapons = fakeWeapons();
  const bar = { catalog: {}, set() {}, show() {}, hide() {} };
  const mansion = createMansionLoadout({ weapons, durableLoadout: durable, bar });

  assert.deepEqual(mansion.inventory.items, ['pistol9', null, 'carbine', null, null]);
  assert.equal(mansion.syncWeapon('ak47'), true);
  assert.deepEqual(mansion.inventory.items, ['pistol9', 'ak47', 'carbine', null, null]);

  mansion.stow();
  assert.equal(durable.has('pistol9'), true);
  assert.equal(durable.has('ak47'), true);
  assert.equal(durable.has('carbine'), true);

  mansion.rackWeapon('ak47');
  assert.deepEqual(durable.items, ['pistol9', null, 'carbine', null, null]);
});

test('a retaining armory keeps each earned rack gun off the wall while another is selected', () => {
  const system = fakeWeapons();
  const armory = mountArmory({
    parent: new THREE.Group(),
    system,
    interaction: { register() {}, unregister() {} },
    racks: [
      { id: 'pistol9', x: 0, z: 0 },
      { id: 'carbine', x: 2, z: 0 },
    ],
    retainTaken: true,
  });

  assert.equal(armory.take('pistol9'), true);
  assert.equal(armory.take('carbine'), true);
  const report = armory.report();
  assert.equal(report.pistol9.onWall, report.pistol9.copies - 1);
  assert.equal(report.carbine.onWall, report.carbine.copies - 1);
  assert.equal(system.equipped, 'carbine');
});

test('taking an inherited owned rack gun is idempotent and returns its one claimed copy', () => {
  const system = fakeWeapons();
  const events = [];
  const armory = mountArmory({
    parent: new THREE.Group(),
    system,
    interaction: { register() {}, unregister() {} },
    racks: [{ id: 'pistol9', x: 0, z: 0 }],
    retainTaken: true,
    onEvent: (event) => events.push(event.type),
  });
  const copies = armory.report().pistol9.copies;

  assert.equal(armory.claim('pistol9'), true);
  assert.equal(armory.report().pistol9.onWall, copies - 1);
  assert.equal(armory.take('pistol9'), true);
  assert.equal(system.equipped, 'pistol9');
  assert.equal(armory.report().pistol9.onWall, copies - 1,
    'taking the already-claimed gun hid a second wall copy');
  assert.equal(armory.put(), true);
  assert.equal(armory.report().pistol9.onWall, copies,
    'returning the inherited gun left its original claimed copy hidden');
  assert.deepEqual(events, ['take', 'rack']);
});

test('Siege consumes the durable five-slot contract and the shared rounds HUD field', async () => {
  const source = await readFile(new URL('../src/mansion/siege/main.js', import.meta.url), 'utf8');
  assert.match(source, /createFinalArcLoadout/);
  assert.match(source, /SceneInventoryBar/);
  assert.match(source, /Digit\[1-5\]/);
  assert.match(source, /hud\.rounds/);
  assert.doesNotMatch(source, /hud\.mag/);
  assert.match(source, /F -- say it, once, from the top of the stairs with any weapon in your hands\./);
  assert.doesNotMatch(source, /F --[^\n]*heavy in your hands/);
});

test('Enola displays durable carry without treating the tail gun as a hotbar weapon', async () => {
  const source = await readFile(new URL('../src/enolasquatch/main.js', import.meta.url), 'utf8');
  assert.match(source, /createFinalArcLoadout/);
  assert.match(source, /hud\.setInventory/);
  assert.match(source, /!mission\.inCockpit[\s\S]{0,180}Digit\[1-5\]/);
  assert.doesNotMatch(source, /acquire\(['"]tail/);
});
