import assert from 'node:assert/strict';
import test from 'node:test';

import { CombatActor } from '../src/core/combat/actors.js';
import { resolveBallisticHits, lineOfFireClear } from '../src/core/combat/ballistics.js';
import { FACTIONS, FactionMatrix } from '../src/core/combat/factions.js';
import { SuppressionModel } from '../src/core/combat/suppression.js';
import { BurstController, WeaponController } from '../src/core/combat/weapon.js';

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

test('core crew report a fatal checkpoint condition without becoming dead actors', () => {
  const snow = new CombatActor({ id: 'snow', faction: FACTIONS.CREW, core: true });
  const officer = { faction: FACTIONS.POLICE };
  const result = snow.applyHit({ amount: 500, attacker: officer });

  assert.equal(result.fatal, true);
  assert.equal(result.protectedCore, true);
  assert.equal(snow.health, 1);
  assert.equal(snow.incapacitated, false);
  assert.equal(snow.injury, 'severe');
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
  suppression.update(0.5);
  assert.ok(suppression.value < before);

  const burst = new BurstController({ min: 2, max: 3, pause: 0.5 });
  assert.equal(burst.update(0, true), true);
  assert.equal(burst.update(0, true), true);
  assert.equal(burst.update(0, true), false);
  assert.equal(burst.update(0.5, true), true);
});
