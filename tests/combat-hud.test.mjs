import assert from 'node:assert/strict';
import test from 'node:test';

import { CombatStatusHud, combatVitals } from '../src/core/combat/hud.js';

function fakeClassList(...initial) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
  };
}

test('the shared combat HUD view reports readable health and armour from a CombatActor', () => {
  const view = combatVitals({
    health: 64.2, maxHealth: 100, armor: 37.1, maxArmor: 75, incapacitated: false,
  });

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
    armor: 37.1,
    maxArmor: 75,
    armorCurrent: 38,
    armorMaximum: 75,
    armorRatio: 37.1 / 75,
    armorPercent: 49,
    armored: true,
    armorLabel: 'ARMOR',
    aria: 'Health 65 of 100, armor 38 of 75',
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
    armor: 0,
    maxArmor: 0,
    armorCurrent: 0,
    armorMaximum: 0,
    armorRatio: 0,
    armorPercent: 0,
    armored: false,
    armorLabel: 'ARMOR',
    aria: 'Health 0 of 1, down',
  });
});

test('checkpoint reset clears all discarded damage feedback and refreshes vitals', () => {
  const styleValues = { '--combat-damage-bearing': '1.2rad' };
  const hud = Object.create(CombatStatusHud.prototype);
  hud.root = {
    classList: fakeClassList('hit', 'armor-hit', 'armor-break'),
    dataset: {
      lastDamage: '23',
      lastAbsorbed: '8',
      damageBearing: '1.2',
      damageDirection: 'right',
    },
  };
  hud.direction = {
    classList: fakeClassList('active', 'armor-hit'),
    dataset: { bearing: '1.2', sector: 'right' },
    style: { removeProperty: (name) => { delete styleValues[name]; } },
  };
  hud._signature = 'discarded-timeline';
  hud._hitTimer = setTimeout(() => {}, 10_000);
  let updates = 0;
  hud.update = () => { updates++; return { state: 'healthy' }; };

  assert.deepEqual(hud.reset(), { state: 'healthy' });
  assert.equal(hud._hitTimer, null);
  assert.equal(hud._signature, '');
  assert.equal(updates, 1);
  for (const name of ['hit', 'armor-hit', 'armor-break']) {
    assert.equal(hud.root.classList.contains(name), false);
  }
  for (const name of ['active', 'armor-hit']) {
    assert.equal(hud.direction.classList.contains(name), false);
  }
  assert.deepEqual(hud.root.dataset, {});
  assert.deepEqual(hud.direction.dataset, {});
  assert.deepEqual(styleValues, {});

  assert.deepEqual(hud.clear(), { state: 'healthy' });
  assert.equal(updates, 2);
});
