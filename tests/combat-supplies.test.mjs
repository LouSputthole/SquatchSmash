import assert from 'node:assert/strict';
import test from 'node:test';

import { CombatActor } from '../src/core/combat/actors.js';
import { FACTIONS } from '../src/core/combat/factions.js';
import { CombatSupplyState } from '../src/core/combat/supplies.js';
import { Firearm } from '../src/core/weapons/Firearm.js';

test('triage and resupply are finite, useful and checkpoint-safe', () => {
  const actor = new CombatActor({
    id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100, armor: 10, maxArmor: 75,
  });
  actor.health = 35;
  const carbine = new Firearm('carbine', { rounds: 7, reserve: 0 });
  const supplies = new CombatSupplyState({ triageCharges: 2, resupplyCharges: 2 });

  const triage = supplies.useTriage(actor);
  assert.equal(triage.used, true);
  assert.equal(triage.healed, 45);
  assert.equal(actor.health, 80);
  assert.equal(supplies.triageCharges, 1);

  const resupply = supplies.useResupply({ actor, firearms: [carbine] });
  assert.equal(resupply.used, true);
  assert.ok(resupply.armor > 0);
  assert.ok(resupply.ammunition > 0);
  assert.equal(supplies.resupplyCharges, 1);

  const checkpoint = supplies.snapshot();
  supplies.useTriage(actor);
  supplies.useResupply({ actor, firearms: [carbine] });
  supplies.restore(checkpoint);
  assert.equal(supplies.triageCharges, 1);
  assert.equal(supplies.resupplyCharges, 1);
});

test('a full station does not waste its finite charge', () => {
  const actor = new CombatActor({
    id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100, armor: 75, maxArmor: 75,
  });
  const carbine = new Firearm('carbine');
  const supplies = new CombatSupplyState({ triageCharges: 1, resupplyCharges: 1 });

  assert.equal(supplies.useTriage(actor).used, false);
  assert.equal(supplies.triageCharges, 1);
  assert.equal(supplies.useResupply({ actor, firearms: [carbine] }).used, false);
  assert.equal(supplies.resupplyCharges, 1);
});
