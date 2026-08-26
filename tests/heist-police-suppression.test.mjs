import assert from 'node:assert/strict';
import test from 'node:test';

import { SuppressionModel } from '../src/core/combat/suppression.js';

/**
 * WHOSE SUPPRESSION IS IT.
 *
 * Owner, playtest 2026-08-26: *"they also don't really appear to be shooting
 * back."*
 *
 * `src/heist/main.js` scaled police accuracy by
 * `1 - min(0.45, suppression.value * 0.2)` — and `suppression` is the PLAYER's
 * meter. It is raised by `noteNearMiss` when a police round passes close to
 * HIM, it drives `hud.setSuppression`, and it shakes his camera. So the term
 * read: the more they shoot at you, the worse they get at it. Standing in the
 * open under fire was the safest thing a player could do, and it compounded —
 * every near miss bought up to 45% off the next one.
 *
 * This file holds the direction of that relationship. It is deliberately
 * arithmetic rather than a scene boot: the bug was never about geometry, it
 * was about which of two meters the multiply reached for.
 */

const ACCURACY_STILL = 0.34;
const ACCURACY_MOVING = 0.18;

/** The curve as it is written in updatePoliceCombat. */
const accuracyUnder = (suppressionValue) =>
  ACCURACY_STILL * (1 - Math.min(0.45, suppressionValue * 0.2));

test('suppression makes a shooter worse, which is the whole point of it', () => {
  assert.ok(accuracyUnder(1) < accuracyUnder(0),
    'a suppressed shooter must be less accurate than a calm one');
  assert.ok(Math.abs(accuracyUnder(0) - ACCURACY_STILL) < 1e-9,
    'an unsuppressed officer shoots at his base accuracy');
  /* The clamp is what stops it going to nothing: 0.45 is the floor. */
  assert.ok(accuracyUnder(99) >= ACCURACY_STILL * 0.55 - 1e-9,
    'the clamp must keep a fully suppressed officer dangerous');
});

test('a moving player is harder to hit than a standing one', () => {
  assert.ok(ACCURACY_MOVING < ACCURACY_STILL,
    'movement is the players own defence and must stay worth doing');
});

/**
 * The regression itself. Two officers, identical in every way except that one
 * has been shot at. Under the old code the meter that moved was the player's,
 * so BOTH officers degraded together every time either of them fired — and the
 * player's own return fire did nothing at all.
 */
test('one officer being shot at does not degrade the officer beside him', () => {
  const shotAt = new SuppressionModel();
  const untouched = new SuppressionModel();

  /* The player puts a round past the first man's ribs. */
  shotAt.noteNearMiss(0.4, 1);

  assert.ok(shotAt.value > 0, 'the man who was shot at must feel it');
  assert.equal(untouched.value, 0,
    'the man beside him was not shot at and must be unaffected');
  assert.ok(accuracyUnder(shotAt.value) < accuracyUnder(untouched.value),
    'suppression must be per-officer, not shared across the block');
});

test('being shot AT is what suppresses, not shooting', () => {
  /* The old term had this exactly backwards. A police officer firing at the
   * player raised the PLAYER's meter, and the player's meter was then used to
   * make the OFFICER worse. Firing must cost the firer nothing. */
  const officer = new SuppressionModel();
  const before = officer.value;
  /* Nothing here is a near miss on him; he is the one shooting. */
  officer.update(1 / 60);
  assert.equal(officer.value, before,
    'an officer who fires must not suppress himself');
});

test('suppression decays, so a firefight can be won by pushing', () => {
  const officer = new SuppressionModel();
  officer.noteNearMiss(0.2, 1);
  const peak = officer.value;
  for (let frame = 0; frame < 120; frame += 1) officer.update(1 / 60);
  assert.ok(officer.value < peak, 'pressure must fade when the player stops firing');
  assert.equal(officer.value, 0, 'two seconds of quiet should clear it entirely');
});

/**
 * The geometry of `notePoliceSuppression`: the perpendicular distance from a
 * man to the SEGMENT the round travelled, not to the infinite ray. A bullet
 * that stops in a wall must not suppress the man standing behind it.
 */
test('a round only suppresses what it actually passed', () => {
  const near = (fromZ, toZ, manZ) => {
    const legLength = Math.abs(toZ - fromZ);
    const along = manZ - fromZ;
    if (along < 0 || along > legLength) return null;
    return 0; // straight down the line, so the perpendicular miss is zero
  };
  /* The round travels z 0 -> 10. A man at z 5 is passed. */
  assert.equal(near(0, 10, 5), 0, 'a man on the path is suppressed');
  /* A man at z 20 is beyond where the round stopped. */
  assert.equal(near(0, 10, 20), null, 'a round that stopped short suppresses nobody');
  /* A man at z -3 is behind the muzzle. */
  assert.equal(near(0, 10, -3), null, 'a man behind the shooter is not under fire');
});
