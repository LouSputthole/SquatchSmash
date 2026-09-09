import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { buildPalaceCast } from '../src/cartel-palace/cast.js';
import { PalaceFinaleDirector } from '../src/cartel-palace/finale.js';
import { EVIDENCE_IDS } from '../src/cartel-palace/mission.js';
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

/* ------------------------------------------------------------------ *
 * THE MARK-FIGHT RETRY.
 *
 * Owner, 2026-09-09: *"The mark scene at the cartel palace, losing and
 * restarting the checkpoint broke it."* Measured in the browser before the
 * fix (die in stage one, retryFromCheckpoint): the director's one-way
 * skipConfrontation refused an engaged room, so the DEAD attempt's stage,
 * reaction ledger and dive latch ran the new one — and Mark came back
 * `active: false, phase: 'away'`, a visible statue the impact resolver
 * refuses as `inactive`, with nothing left to call onMarkReturn. These prove
 * the director-side staging headlessly; the browser verifier proves the
 * full wiring by dying in the real room and finishing the fight after.
 * ------------------------------------------------------------------ */

function finaleHarness() {
  const scene = new THREE.Group();
  const cast = buildPalaceCast(scene);
  const log = { engaged: 0, returns: [], retreats: 0, waves: 0 };
  const finale = new PalaceFinaleDirector({
    cast,
    hud: { say: () => {}, toast: () => {} },
    audio: null,
    onEngage: () => { log.engaged++; cast.activateFinalEncounter(); },
    onScramble: () => cast.markScramblesAway(),
    onMarkReturn: (options) => {
      log.returns.push(options);
      cast.activateMark({ armored: options.armored });
    },
    onMarkRetreat: () => { log.retreats++; cast.markScramblesAway(); },
    onWave: () => { log.waves++; cast.releaseWave(); },
  });
  return { cast, finale, log };
}

function drain(finale, { step = 0.1, limit = 2400 } = {}) {
  for (let index = 0; index < limit; index++) {
    finale.update(step);
    if (!finale.queue.length && !finale.current && finale.timer <= 0) return;
  }
  throw new Error('finale dialogue never drained');
}

function playToStageOne({ cast, finale }) {
  finale.beginConfrontation({ evidenceFound: Object.values(EVIDENCE_IDS) });
  drain(finale);
  cast.markDown(cast.sauce);
  finale.onTargetDown('sauce');
  drain(finale);
  assert.equal(finale.report().stage, 'reprisal-one', 'the fixture never reached stage one');
}

test('skipConfrontation resets an engaged director instead of refusing the retry', () => {
  const fixture = finaleHarness();
  playToStageOne(fixture);
  const { finale } = fixture;

  assert.equal(finale.skipConfrontation(), true,
    'the engaged room refused the checkpoint staging — the exact 2026-09-09 break');
  const report = finale.report();
  assert.equal(report.phase, 'combat');
  assert.equal(report.stage, 'sauce');
  assert.equal(report.engaged, true);
  assert.equal(report.pendingCues.length, 0, 'the dead attempt\'s speech leaked through');
  assert.deepEqual([...finale._reacted], [], 'the dead attempt\'s reaction ledger survived');
  assert.equal(finale._after, null, 'a pending door callback survived the reset');
});

test('a chef-dead checkpoint restages stage one and replays Mark\'s return entrance', () => {
  const fixture = finaleHarness();
  playToStageOne(fixture);
  const { cast, finale, log } = fixture;

  /* The scene normalizes the bodies exactly as stageFinaleForCheckpoint does:
   * Mark off stage, the wave back behind its walls, then the director. */
  finale.clearLines();
  cast.clearPresentation();
  cast.markScramblesAway({ instant: true });
  cast.stageWaveWaiting();
  assert.equal(finale.stageForCheckpoint({ sauceEliminated: true }), true);

  const staged = finale.report();
  assert.equal(staged.stage, 'reprisal-one');
  assert.equal(staged.phase, 'combat');
  assert.equal(staged.enraged, false, 'a revived pair cannot leave the enrage latched');
  assert.equal(staged.dived, true, 'the trio resumes on the floor the chef\'s kill sent them to');
  assert.deepEqual([...finale._reacted].sort(), ['first', 'sauce'],
    'the reaction ledger must hold exactly the durable kill');
  assert.ok(staged.pendingCues.some((cue) => cue.includes('reprisal.enter.cold')),
    'Mark\'s return entrance was not queued, so nothing can ever activate him');

  drain(finale);
  assert.deepEqual(log.returns.at(-1), { armored: true, enraged: false });
  assert.equal(cast.mark.active, true, 'Mark never came back after the retry');
  assert.equal(cast.mark.root.visible, true);

  /* And the wave ledger is clean: all four kills count on the new attempt. */
  finale.onArmorBroken();
  drain(finale);
  for (const man of cast.wave) {
    cast.markDown(man);
    finale.onTargetDown(man.id);
  }
  drain(finale);
  assert.equal(finale.report().stage, 'reprisal-final',
    'a wave kill from the discarded attempt was still on the ledger');
});

test('both targets down stages the aftermath; Mark down alone leaves the chef the last name', () => {
  const cleared = finaleHarness();
  cleared.finale.stageForCheckpoint({ sauceEliminated: true, markEliminated: true });
  assert.equal(cleared.finale.report().phase, 'aftermath');
  assert.equal(cleared.finale.report().stage, 'done');

  const chefAlone = finaleHarness();
  chefAlone.cast.markDown(chefAlone.cast.mark);
  chefAlone.finale.stageForCheckpoint({ markEliminated: true });
  assert.equal(chefAlone.finale.report().stage, 'sauce');
  assert.equal(chefAlone.finale.report().phase, 'combat');

  /* Killing the chef must NOT bring the dead boss back through the door. */
  chefAlone.cast.markDown(chefAlone.cast.sauce);
  chefAlone.finale.onTargetDown('sauce');
  drain(chefAlone.finale);
  assert.deepEqual(chefAlone.log.returns, [], 'a corpse walked back in for the reprisal');
});

test('stageWaveWaiting hides the living reprisal behind its walls; reviveCivilians discards the attempt\'s corpses', () => {
  const { cast } = finaleHarness();
  cast.releaseWave({ instant: true });
  cast.markDown(cast.wave[1]);
  const staged = cast.stageWaveWaiting();

  assert.equal(staged, 3, 'only the living are re-staged');
  for (const entry of cast.wave) {
    if (entry.down) continue;
    assert.equal(entry.root.visible, false, `${entry.id} is a shootable statue in the room`);
    assert.equal(entry.active, false);
    assert.equal(entry.presentation, 'waiting');
    assert.equal(entry.root.position.distanceTo(entry.stagingTarget) < 1e-6, true);
  }
  assert.equal(cast.wave[1].down, true, 'restaging must never resurrect a recorded kill');

  const lola = cast.civilians.find((entry) => entry.id === 'lola');
  const cleaner = cast.bystanders[0];
  const lolaHome = lola.home.clone();
  cast.civilianDown(lola);
  cast.civilianDown(cleaner);
  lola.root.position.set(8, 0, -46);
  const revived = cast.reviveCivilians();

  assert.deepEqual(revived.sort(), ['cleaner', 'lola']);
  assert.equal(lola.down, false);
  assert.equal(lola.health, lola.healthMax);
  assert.equal(lola.root.position.distanceTo(lolaHome) < 1e-6, true,
    'a revived civilian must stand back up at her own post');
  assert.equal(cleaner.down, false);
  assert.equal(cleaner.panicked, false);
});
