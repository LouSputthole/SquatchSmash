import assert from 'node:assert/strict';
import test from 'node:test';

import { SafehousePreparation } from '../src/heist/safehouse.js';

test('safehouse armor and weapons visibly equip once and gate the van together', () => {
  const prep = new SafehousePreparation();

  assert.deepEqual(prep.snapshot(), {
    armorReady: false,
    loadoutReady: false,
    ready: false,
  });
  assert.deepEqual(prep.equipArmor(), { changed: true, item: 'armor' });
  assert.deepEqual(prep.equipArmor(), { changed: false, item: 'armor' });
  assert.equal(prep.ready, false);
  assert.deepEqual(prep.readyWeapons(), { changed: true, item: 'weapons' });
  assert.deepEqual(prep.readyWeapons(), { changed: false, item: 'weapons' });
  assert.equal(prep.ready, true);
});
