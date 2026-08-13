import assert from 'node:assert/strict';
import test from 'node:test';

import { CombatActor } from '../src/core/combat/actors.js';
import { resolveBallisticHits, lineOfFireClear } from '../src/core/combat/ballistics.js';
import { FACTIONS, FactionMatrix } from '../src/core/combat/factions.js';
import { SuppressionModel } from '../src/core/combat/suppression.js';
import { BurstController, WeaponController } from '../src/core/combat/weapon.js';
import * as groundCombat from '../src/core/combat/index.js';

test('the canonical ground-combat import surface exposes every deep Module', () => {
  for (const name of [
    'CombatActor', 'AabbCombatSpace', 'CombatPerception', 'CombatWeaponAim',
    'CombatImpairments', 'CombatImpactResolver', 'CombatFireControl',
    'CombatSupplyState', 'SuppressionModel',
  ]) assert.equal(typeof groundCombat[name], 'function', `${name} is missing`);
});

test('faction policy structurally prevents crew friendly fire and NPC civilian targeting', () => {
  const matrix = new FactionMatrix();
  const crew = { faction: FACTIONS.CREW };
  const police = { faction: FACTIONS.POLICE };
  const civilian = { faction: FACTIONS.CIVILIAN };

  assert.equal(matrix.canTarget(crew, police), true);
  assert.equal(matrix.canTarget(police, crew), true);
  assert.equal(matrix.canTarget(crew, crew), false);
  assert.equal(matrix.canTarget(crew, civilian), false);
  assert.equal(matrix.canTarget(police, civilian), false);
  assert.equal(matrix.canDamage(crew, civilian, { playerShot: true }), true);
  assert.equal(matrix.canDamage(crew, civilian), false);
});

test('core crew report a prevented fatal transition without becoming dead actors', () => {
  const snow = new CombatActor({ id: 'snow', faction: FACTIONS.CREW, core: true });
  const officer = { faction: FACTIONS.POLICE };
  const result = snow.applyHit({ amount: 500, attacker: officer });

  assert.equal(result.fatal, false);
  assert.equal(result.fatalPrevented, true);
  assert.equal(result.protectedCore, true);
  assert.equal(snow.health, 1);
  assert.equal(snow.incapacitated, false);
  assert.equal(snow.injury, 'severe');
});

test('lethal hits bypass armour but preserve core-character protection', () => {
  const attacker = { faction: FACTIONS.CREW };
  const armored = new CombatActor({
    id: 'armored', faction: FACTIONS.POLICE, maxHealth: 120, armor: 80, maxArmor: 80,
  });
  const result = armored.applyHit({ amount: 1, attacker, playerShot: true, lethal: true });

  assert.equal(result.applied, true);
  assert.equal(result.fatal, true);
  assert.equal(result.lethal, true);
  assert.equal(result.absorbed, 0);
  assert.equal(armored.health, 0);
  assert.equal(armored.incapacitated, true);

  const core = new CombatActor({
    id: 'core', faction: FACTIONS.POLICE, maxHealth: 100, armor: 50, maxArmor: 50, core: true,
  });
  const protectedResult = core.applyHit({ amount: 1, attacker, playerShot: true, lethal: true });
  assert.equal(protectedResult.lethal, true);
  assert.equal(protectedResult.fatal, false);
  assert.equal(protectedResult.fatalPrevented, true);
  assert.equal(protectedResult.protectedCore, true);
  assert.equal(core.health, 1);
  assert.equal(core.incapacitated, false);
});

test('player armour reports absorption, can break and restores through snapshots', () => {
  const actor = new CombatActor({
    id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100, armor: 60, maxArmor: 75,
  });
  const hit = actor.applyHit({ amount: 40, attacker: { faction: FACTIONS.POLICE } });

  assert.equal(hit.absorbed, 22);
  assert.equal(hit.damage, 18);
  assert.equal(hit.armorBefore, 60);
  assert.equal(hit.armorAfter, 38);
  assert.equal(hit.armorBroken, false);
  assert.equal(actor.health, 82);
  assert.equal(actor.replenishArmor(50), 37);
  assert.equal(actor.armor, 75);
  assert.equal(actor.heal(50), 18);
  assert.equal(actor.health, 100);

  const snapshot = actor.snapshot();
  actor.applyHit({ amount: 500, attacker: { faction: FACTIONS.POLICE } });
  actor.restore(snapshot);
  assert.equal(actor.maxArmor, 75);
  assert.equal(actor.armor, 75);
  assert.equal(actor.health, 100);
});

test('durable actor state is JSON-safe and preserves live scene relationships', () => {
  const actor = new CombatActor({
    id: 'durable-prospect', faction: FACTIONS.CREW, maxHealth: 120, armor: 45,
  });
  const anchor = { sceneObject: true };
  const carrying = { prop: true };
  actor.anchor = anchor;
  actor.carrying = carrying;
  actor.applyHit({ amount: 20, attacker: { faction: FACTIONS.CARTEL } });
  const saved = JSON.parse(JSON.stringify(actor.durableSnapshot()));

  assert.equal(saved.anchor, undefined);
  assert.equal(saved.carrying, undefined);
  actor.health = 1;
  actor.armor = 0;
  actor.restoreDurable(saved);

  assert.equal(actor.health, saved.health);
  assert.equal(actor.armor, saved.armor);
  assert.equal(actor.anchor, anchor);
  assert.equal(actor.carrying, carrying);
});

test('weapon magazines, cadence, reload and snapshot restore are deterministic', () => {
  const weapon = new WeaponController({
    magazineSize: 3, reserveMagazines: 1, roundsPerSecond: 10, reloadSeconds: 1,
  });
  assert.equal(weapon.fire().fired, true);
  assert.equal(weapon.fire().reason, 'cooldown');
  weapon.update(0.1);
  assert.equal(weapon.fire().fired, true);
  weapon.update(0.1);
  assert.equal(weapon.fire().fired, true);
  weapon.update(0.1);
  assert.equal(weapon.fire().reason, 'empty');
  assert.equal(weapon.beginReload(), true);
  weapon.update(0.5);
  const midReload = weapon.snapshot();
  weapon.update(0.5);
  assert.equal(weapon.magazine, 3);
  assert.equal(weapon.reserveMagazines, 0);

  const restored = new WeaponController({
    magazineSize: 3, reserveMagazines: 1, roundsPerSecond: 10, reloadSeconds: 1,
  });
  restored.restore(midReload);
  assert.equal(restored.reloading, 0.5);
  restored.update(0.5);
  assert.equal(restored.magazine, 3);
});

test('ballistics penetrate one thin surface but stop on protected actors and concrete', () => {
  const matrix = new FactionMatrix();
  const attacker = { faction: FACTIONS.CREW };
  const civilian = new CombatActor({ id: 'civilian', faction: FACTIONS.CIVILIAN });
  const officer = new CombatActor({ id: 'officer', faction: FACTIONS.POLICE });
  const hits = resolveBallisticHits([
    { distance: 2, material: 'glass', thickness: 0.1 },
    { distance: 3, actor: civilian },
    { distance: 4, actor: officer },
  ], { attacker, damage: 30, penetration: 0.4, matrix });

  assert.equal(hits.length, 2);
  assert.equal(hits[1].result.applied, false);
  assert.equal(officer.health, 100);
  assert.equal(lineOfFireClear([
    { distance: 1, actor: civilian }, { distance: 2, actor: officer },
  ], officer, matrix, attacker), false);
  assert.equal(lineOfFireClear([
    { distance: 1, material: 'concrete' }, { distance: 2, actor: officer },
  ], officer, matrix, attacker), false, 'geometry in front of the target was ignored');

  const careless = resolveBallisticHits([
    { distance: 2, actor: civilian },
  ], { attacker, damage: 20, matrix, playerShot: true });
  assert.equal(careless[0].result.applied, true);
});

test('suppression decays without removing control and NPC bursts stay bounded', () => {
  const suppression = new SuppressionModel();
  suppression.noteNearMiss(0.5, 1);
  assert.ok(suppression.value > 0);
  assert.ok(suppression.aimStability > 0.6);
  const before = suppression.value;
  const checkpoint = suppression.snapshot();
  suppression.update(0.5);
  assert.ok(suppression.value < before);
  suppression.restore(checkpoint);
  assert.equal(suppression.value, checkpoint.value);
  suppression.restore({ value: 7 });
  assert.equal(suppression.value, 1);
  suppression.reset();
  assert.equal(suppression.value, 0);

  const burst = new BurstController({ min: 2, max: 3, pause: 0.5 });
  assert.equal(burst.update(0, true), true);
  assert.equal(burst.update(0, true), true);
  assert.equal(burst.update(0, true), false);
  assert.equal(burst.update(0.5, true), true);
});
