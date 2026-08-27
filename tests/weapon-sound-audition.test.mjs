import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  WEAPON_AUDITION_DIRECTIONS,
  WEAPON_AUDITION_STORAGE_KEY,
  WEAPON_AUDITION_WEAPONS,
  weaponAuditionFavorite,
  weaponAuditionOffsets,
} from '../src/core/weapons/audition.js';
import { WEAPON_ORDER } from '../src/core/weapons/catalog.js';

test('every catalog weapon gets its current report plus five delivered audition directions', () => {
  const manifestUrl = new URL('../assets/audio/auditions/manifest.json', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(manifestUrl, 'utf8'));
  assert.equal(manifest.schema, 'squatchsmash.weapon-auditions.v1');
  assert.equal(manifest.productionRouting, false);
  assert.equal(manifest.candidates.length, WEAPON_ORDER.length * WEAPON_AUDITION_DIRECTIONS.length);
  const receipts = new Map(manifest.candidates.map((receipt) => [receipt.filename, receipt]));

  assert.deepEqual(WEAPON_AUDITION_WEAPONS.map(({ id }) => id), WEAPON_ORDER);
  assert.equal(WEAPON_AUDITION_DIRECTIONS.length, 5);
  for (const weapon of WEAPON_AUDITION_WEAPONS) {
    assert.equal(weapon.candidates.length, 6, weapon.id);
    assert.equal(weapon.candidates[0].id, 'current');
    assert.equal(new Set(weapon.candidates.map(({ id }) => id)).size, 6);
    const delivered = new URL(`../assets/sfx/${weapon.candidates[0].filename}`, import.meta.url);
    assert.equal(fs.existsSync(delivered), true, `${weapon.id} current report is missing`);
    for (const candidate of weapon.candidates.slice(1)) {
      assert.equal(candidate.url, `./assets/audio/auditions/${candidate.filename}`);
      assert.match(candidate.filename, new RegExp(`^weapon\\.${weapon.id}\\.fire\\.`));
      assert.equal(candidate.delivered, true);
      const file = new URL(`../assets/audio/auditions/${candidate.filename}`, import.meta.url);
      const bytes = fs.readFileSync(file);
      assert.ok(bytes.length > 512, `${candidate.filename} is not usable audio`);
      const receipt = receipts.get(candidate.filename);
      assert.equal(receipt?.weapon, weapon.id);
      assert.equal(receipt?.direction, candidate.id);
      assert.equal(receipt?.bytes, bytes.length);
      assert.equal(receipt?.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    }
  }
});

test('automatic previews use catalog cadence while semi-automatic previews stay single', () => {
  for (const weapon of WEAPON_AUDITION_WEAPONS) {
    assert.deepEqual(weaponAuditionOffsets(weapon, 'single'), [0]);
    const burst = weaponAuditionOffsets(weapon, 'burst');
    const automatic = weaponAuditionOffsets(weapon, 'automatic');
    if (!weapon.automatic) {
      assert.deepEqual(burst, [0], weapon.id);
      assert.deepEqual(automatic, [0], weapon.id);
      continue;
    }
    assert.equal(burst.length, 4, weapon.id);
    assert.equal(automatic.length, 12, weapon.id);
    assert.ok(Math.abs(burst[1] - 1 / weapon.rps) < 1e-12, weapon.id);
  }
});

test('favorites are validated per weapon and fall back safely to current', () => {
  const gun = WEAPON_AUDITION_WEAPONS[0];
  assert.match(WEAPON_AUDITION_STORAGE_KEY, /^squatchsmash\./);
  assert.equal(weaponAuditionFavorite({ [gun.id]: 'deep-cinematic' }, gun.id), 'deep-cinematic');
  assert.equal(weaponAuditionFavorite({ [gun.id]: 'not-a-slot' }, gun.id), 'current');
  assert.equal(weaponAuditionFavorite({}, 'not-a-weapon'), 'current');
});

test('the audition page exposes play, stop, replay, modes, and persistent favorites', () => {
  const page = fs.readFileSync(new URL('../weapon-sound-audition.html', import.meta.url), 'utf8');
  for (const word of ['Play', 'Stop', 'Replay', 'Favorite', '4-round burst', '12-round auto']) {
    assert.match(page, new RegExp(word, 'i'));
  }
  assert.match(page, /localStorage\.setItem\(WEAPON_AUDITION_STORAGE_KEY/);
  assert.match(page, /stopAll\(\)/);
  assert.match(page, /weaponAuditionOffsets\(weapon, mode\)/);
});
