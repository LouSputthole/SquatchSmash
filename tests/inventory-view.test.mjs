import test from 'node:test';
import assert from 'node:assert/strict';
import { inventorySlotView } from '../src/core/inventory-view.js';

test('every scene inventory keeps the same five visible bottom slots when empty', () => {
  assert.deepEqual(inventorySlotView({ slots: 5, items: [], selected: 0 }), [
    { key: '1', icon: '', label: 'Empty slot 1', selected: true },
    { key: '2', icon: '', label: 'Empty slot 2', selected: false },
    { key: '3', icon: '', label: 'Empty slot 3', selected: false },
    { key: '4', icon: '', label: 'Empty slot 4', selected: false },
    { key: '5', icon: '', label: 'Empty slot 5', selected: false },
  ]);
});

test('a scene loadout replaces the contents without changing the inventory shape', () => {
  const view = inventorySlotView({
    slots: 5,
    selected: 1,
    items: [
      { icon: '🔫', label: 'Revolver' },
      { icon: '💼', label: 'Jerky money' },
    ],
  });
  assert.equal(view.length, 5);
  assert.deepEqual(view.slice(0, 2), [
    { key: '1', icon: '🔫', label: 'Revolver', selected: false },
    { key: '2', icon: '💼', label: 'Jerky money', selected: true },
  ]);
  assert.equal(view[4].label, 'Empty slot 5');
});

test('the shared view accepts the apartment inventory ids and item catalog', () => {
  const view = inventorySlotView({
    slots: 3,
    selected: 2,
    items: ['beer', null, 'phone'],
    catalog: {
      beer: { icon: '🍺', name: 'Cold beer' },
      phone: { icon: '📱', name: 'Your phone' },
    },
  });
  assert.deepEqual(view.map(({ icon, label, selected }) => ({ icon, label, selected })), [
    { icon: '🍺', label: 'Cold beer', selected: false },
    { icon: '', label: 'Empty slot 2', selected: false },
    { icon: '📱', label: 'Your phone', selected: true },
  ]);
});
