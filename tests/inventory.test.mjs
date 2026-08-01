import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../src/core/inventory.js';

test('removeAt removes only the expected copy after selection changes', () => {
  const inventory = new Inventory(5);
  inventory.add('whiskey');
  const olderWhiskeySlot = inventory.selected;
  inventory.add('beer');
  inventory.add('whiskey');
  const deliveredWhiskeySlot = inventory.selected;

  inventory.select(olderWhiskeySlot);

  assert.equal(inventory.removeAt(deliveredWhiskeySlot, 'whiskey'), true);
  assert.equal(inventory.items[olderWhiskeySlot], 'whiskey');
  assert.equal(inventory.items[deliveredWhiskeySlot], null);
  assert.equal(inventory.selected, olderWhiskeySlot);
});

test('removeAt refuses a stale slot identity', () => {
  const inventory = new Inventory(2);
  inventory.add('beer');

  assert.equal(inventory.removeAt(0, 'whiskey'), false);
  assert.equal(inventory.items[0], 'beer');
});
