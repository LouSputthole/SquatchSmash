import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { buildPalaceCast } from '../src/cartel-palace/cast.js';
import { PalaceSecurity } from '../src/cartel-palace/security.js';
import { CombatActor } from '../src/core/combat/actors.js';
import { FACTIONS } from '../src/core/combat/factions.js';
import { WEAPON_IDS } from '../src/core/weapons/catalog.js';

/**
 * The security-side truths the in-memory death retry leans on
 * (src/cartel-palace/main.js retryFromCheckpoint / restoreCombatCheckpoint).
 * The browser verifier proves the full wiring; these prove the state
 * machinery itself, headlessly.
 */

function harness() {
  const scene = new THREE.Group();
  const cast = buildPalaceCast(scene);
  const playerActor = new CombatActor({
    id: 'palace-prospect', faction: FACTIONS.CREW, maxHealth: 100, armor: 30,
  });
  const security = new PalaceSecurity({ cast, colliders: [], playerActor });
  return { cast, security, playerActor };
}

function shootDown(security, entry) {
  for (let round = 0; round < 6 && !entry.down; round++) {
    security.applyPlayerShot(entry.figure.parts.head, WEAPON_IDS.CARBINE);
  }
  assert.ok(entry.down, `${entry.id} must be down for the fixture to mean anything`);
}

test('a retry restore revives a guard the failed attempt killed, exactly per the snapshot', () => {
  const { cast, security } = harness();
  const guard = cast.guards[0];
  const snapshot = security.snapshot();

  shootDown(security, guard);
  assert.equal(security.alarm, true, 'the shot raised the alarm');
  assert.equal(guard.weaponModel.visible, false, 'a downed guard drops his rendered weapon');

  security.restore(snapshot);
  assert.equal(guard.down, false);
  assert.equal(guard.active, true);
  assert.equal(guard.actor.health, guard.actor.maxHealth);
  assert.equal(guard.actor.incapacitated, false);
  assert.equal(guard.weaponModel.visible, true, 'the revived guard holds his weapon again');
  assert.equal(security.alarm, false, 'the transient alarm belongs to the discarded attempt');
  assert.equal(security.contactPoint, null, 'the shared contact call is forgotten, not resurrected');
});

test('a snapshot captured before activateFinalEncounter needs the re-assert to wake the bosses', () => {
  const { cast, security } = harness();
  /* enterDiningRoom()'s own transition persists the checkpoint one call
   * BEFORE activateFinalEncounter() — this snapshot is that capture. */
  const snapshot = security.snapshot();
  assert.equal(cast.mark.active, false);
  assert.equal(cast.sauce.active, false);

  /* Since the 2026-08-25 rewire the doors opening activate the CHEF, not both
   * targets: Mark walks out of the room and the finale director brings him
   * back for stage one. The checkpoint contract this test is about is
   * unchanged -- a raw snapshot restores the pre-activation staging, and the
   * beat has to re-assert -- so it is the same assertions about Sauce. */
  security.activateFinalEncounter();
  assert.equal(cast.sauce.active, true);
  shootDown(security, cast.sauce);

  security.restore(snapshot);
  assert.equal(cast.sauce.down, false, 'Sauce is back on his feet');
  assert.equal(cast.mark.active, false, 'the raw snapshot restores the pre-activation staging…');
  assert.equal(cast.sauce.active, false);
  assert.equal(security.alarm, false);

  /* …so restoreCombatCheckpoint must re-assert the encounter for the
   * dining-room beat, or the chef comes back passive. */
  security.activateFinalEncounter();
  assert.equal(cast.mark.active, false, 'a restore woke the boss the doors no longer wake');
  assert.equal(cast.sauce.active, true);
  assert.equal(security.alarm, true, 'the dining-room alarm comes back with the encounter');
});

test('restore keeps a target the checkpoint itself says is down, down', () => {
  const { cast, security } = harness();
  security.activateFinalEncounter();
  shootDown(security, cast.sauce);
  const snapshot = security.snapshot();

  security.restore(snapshot);
  assert.equal(cast.sauce.down, true, 'the checkpoint owns his death; retry must not undo it');
  assert.equal(cast.sauce.active, false);
  assert.equal(cast.sauce.weaponModel.visible, false);
});
