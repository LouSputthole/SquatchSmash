import assert from 'node:assert/strict';
import test from 'node:test';

import { combatArmor, combatVitals } from '../src/core/combat/hud.js';

test('the shared combat HUD view reports readable health from a CombatActor', () => {
  const view = combatVitals({ health: 64.2, maxHealth: 100, incapacitated: false });

  assert.deepEqual(view, {
    health: 64.2,
    maxHealth: 100,
    current: 65,
    maximum: 100,
    ratio: 0.642,
    percent: 64,
    state: 'hurt',
    down: false,
    label: 'HEALTH',
    aria: 'Health 65 of 100',
  });
});

test('the shared combat HUD view clamps malformed values and makes downed state explicit', () => {
  assert.deepEqual(combatVitals({
    health: -40,
    maxHealth: 0,
    incapacitated: true,
  }), {
    health: 0,
    maxHealth: 1,
    current: 0,
    maximum: 1,
    ratio: 0,
    percent: 0,
    state: 'down',
    down: true,
    label: 'HEALTH',
    aria: 'Health 0 of 1, down',
  });
});

test('the shared combat HUD exposes readable mechanical armor beside health', () => {
  assert.deepEqual(combatArmor({ armor: 30, maxArmor: 40 }), {
    armor: 30,
    maxArmor: 40,
    current: 30,
    maximum: 40,
    ratio: 0.75,
    percent: 75,
    visible: true,
    label: 'ARMOR',
    aria: 'Armor 30 of 40',
  });
});
