/**
 * INITIATION NIGHT — who kneels, who is executed, and who walks away.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ONE KILLING PATH
 *
 * `main.js`'s execution primitive is the only thing in this scene that kills
 * anybody. Prospect One still receives the deliberately excessive frontal
 * barrage. The three doomed prospects then receive one round each. Tony's
 * threat carries zero rounds and Kittenboss never enters the fatal array.
 *
 * That contrast is the horror and it is deliberate. The first one is temper.
 * The rest is work.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE OWNS AND WHAT site.js OWNS
 *
 * `cabin/site.js` owns every MEASUREMENT: where the marks are, where a man
 * stands to shoot somebody on one, which side of the spine he steps to, where
 * the second man waits, and where the body ends up. None of that is repeated
 * here.
 *
 * This file owns the CASTING and the ORDER — which is script, not survey — and
 * the verification that ties the two together in world-space vectors rather
 * than by eye. `verifyExecutionStaging()` is what the test runs and it is what
 * a debug build can run at boot.
 */
import {
  KNEEL_MARKS, PLAYER_EYE, STAND_MARK, STANDING_SHOOTER_MARK, facingOf,
} from './cabin/site.js';

/**
 * Where Kittenboss stands.
 *
 * A constant of its own rather than a fifth entry in `PROSPECT_XS`, because
 * `cabin/site.js` copies those four numbers out of `main.js` and a test
 * asserts the copy still matches; growing the array would break that assertion
 * to add a body the array was never about. 2.2 m of spacing, the same as
 * everybody else, which puts her in front of the boot car she was driven out
 * here in — the lid is still standing open behind her and nobody shuts it and
 * nobody refers to it.
 */
export const KITTENBOSS_SLOT = Object.freeze({ x: 6.6 });

/** Everybody who is standing in the line when the speech starts. */
export const LINE_UP = Object.freeze([
  Object.freeze({ id: 'prospect-one', name: 'PROSPECT ONE', x: -4.4, speaks: true }),
  Object.freeze({ id: 'player', name: 'PROSPECT TWO', x: -2.2, player: true }),
  Object.freeze({ id: 'prospect-three', name: 'PROSPECT THREE', x: 0, speaks: true }),
  Object.freeze({ id: 'prospect-four', name: 'PROSPECT FOUR', x: 2.2, speaks: false }),
  Object.freeze({ id: 'prospect-five', name: 'PROSPECT FIVE', x: 4.4, speaks: true }),
  /** KITTENBOSS, on the end. See KITTENBOSS_SLOT above. */
  Object.freeze({
    id: 'kittenboss', name: 'KITTENBOSS', x: KITTENBOSS_SLOT.x, speaks: true, she: true,
  }),
]);

/** Lou stops the revolver on Tony. He is the only surviving prospect. */
export const SURVIVORS = Object.freeze(['PROSPECT TWO']);

/**
 * Prospect One.
 *
 * Standing, frontal, eight rounds, at the mark he steps forward onto — the
 * staging that ships today, unchanged. Seff is pinned rather than picked,
 * because "whichever member is nearest" is emergent behaviour and this is the
 * man who walks around the front of the line in the script.
 */
export const STANDING_EXECUTION = Object.freeze({
  beat: 'IN-060',
  victim: 'PROSPECT ONE',
  mark: STAND_MARK,
  stance: STANDING_SHOOTER_MARK,
  shooter: 'SEFF',
  weapon: 'revolver',
  kneeling: false,
  rounds: 8,
});

/**
 * The four fatal kneeling shots, IN THE ORDER THEY ARE USED.
 *
 * Everyone is already kneeling before the first entry runs. `shooter` and
 * `second` are explicit so presentation never chooses an executioner by
 * proximity. Tony's later aim is deliberately separate.
 */
export const KNEELING_EXECUTIONS = Object.freeze([
  Object.freeze({
    index: 0, beat: 'IN-120', victim: 'PROSPECT THREE', markId: 'kneel-1',
    shooter: 'GRATIN', second: 'SEFF', weapon: 'revolver', rounds: 1, kneeling: true,
  }),
  Object.freeze({
    index: 1, beat: 'IN-130', victim: 'PROSPECT FOUR', markId: 'kneel-2',
    shooter: 'GRATIN', second: 'SEFF', weapon: 'revolver', rounds: 1, kneeling: true,
  }),
  Object.freeze({
    index: 2, beat: 'IN-145', victim: 'PROSPECT FIVE', markId: 'kneel-3',
    shooter: 'GRATIN', second: 'SEFF', weapon: 'revolver', rounds: 1, kneeling: true,
  }),
  Object.freeze({
    index: 3, beat: 'IN-150', victim: 'KITTENBOSS', markId: 'kneel-4',
    shooter: 'GRATIN', second: 'SEFF', weapon: 'revolver', rounds: 1, kneeling: true,
    besidePlayer: true, she: true,
  }),
]);

/** Everyone ordered down at once. Only Tony is absent from the fatal array. */
export const MASS_KNEEL = Object.freeze([
  ...KNEELING_EXECUTIONS.map((step) => Object.freeze({
    victim: step.victim, markId: step.markId, doomed: true,
    ...(step.she ? { she: true } : {}),
  })),
  Object.freeze({ victim: 'PROSPECT TWO', player: true, survivor: true }),
]);

/** The muzzle reaches Tony, but Lou's interruption wins before a shot. */
export const PLAYER_THREAT = Object.freeze({
  beat: 'IN-160', victim: 'PROSPECT TWO', shooter: 'GRATIN',
  weapon: 'revolver', player: true, rounds: 0, fires: false,
});

/** The authored interruption and its explicit survival result. */
export const LOU_INTERRUPTION = Object.freeze({
  beat: 'IN-170', speaker: 'LOU', beforeShot: true, survivors: SURVIVORS,
});

/**
 * THE ORDER OF THE ACT, as data.
 *
 * `main.js` walks this list with a cursor rather than carrying story truth in
 * ad-hoc branches: kneel everyone, execute four, aim at Tony, let Lou stop it,
 * release Tony, the only survivor.
 */
export function executionRunOrder() {
  return Object.freeze([
    Object.freeze({ kind: 'mass_kneel', lineup: MASS_KNEEL, beat: 'IN-110' }),
    ...KNEELING_EXECUTIONS.map((step) => Object.freeze({ kind: 'shot', step })),
    Object.freeze({ kind: 'aim', threat: PLAYER_THREAT }),
    Object.freeze({ kind: 'interrupt', interruption: LOU_INTERRUPTION }),
    Object.freeze({ kind: 'release', survivors: SURVIVORS }),
  ]);
}

/** Everybody killed in the clearing. */
export const DOOMED = Object.freeze([
  STANDING_EXECUTION.victim,
  ...KNEELING_EXECUTIONS.map((step) => step.victim),
]);

/** The mark a step uses, resolved out of site.js. */
export function markForStep(step) {
  return KNEEL_MARKS.find((mark) => mark.id === step.markId) ?? null;
}

/* ------------------------------------------------------------------ */
/* VERIFICATION                                                        */
/*                                                                     */
/* In world-space vectors, because every one of these is invisible in a  */
/* screenshot of a dark clearing and obvious in a dot product.           */
/* ------------------------------------------------------------------ */

/** Unit vector from a to b in the ground plane, or null if they coincide. */
function direction(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return null;
  return { x: dx / length, z: dz / length, length };
}

const dot2 = (a, b) => a.x * b.x + a.z * b.z;

/**
 * The geometry of one kneeling execution, as numbers a test can assert on.
 *
 *   behindDot   the shooter's bearing from the head, against the way the
 *               kneeling figure is facing. -1 is directly behind. Anything
 *               above about -0.9 is a man standing at somebody's shoulder.
 *   awayDot     the same thing from the other end: how squarely the kneeling
 *               figure faces AWAY from the man behind them. +1 is dead away.
 *   towardPlayerDot  how squarely they face the line the player is standing
 *               in. Positive means the player gets their face.
 *   shooterGap  how much further from the player's eye the shooter is than
 *               the victim. Positive means he cannot occlude the thing the
 *               player is meant to be watching.
 *   muzzleClearance  how far off the eye→head line the muzzle sits. This is
 *               the only reason the flash is visible past the skull.
 *   secondClearance  the same, for the man who is not shooting.
 */
export function executionGeometry(step) {
  const mark = markForStep(step);
  if (!mark) return null;
  const facing = facingOf(mark.heading);
  const head = { x: mark.head.x, z: mark.head.z };
  const fromHeadToShooter = direction(head, mark.shooter);
  const fromShooterToHead = direction(mark.shooter, head);
  const toPlayer = direction(head, PLAYER_EYE);
  const eyeToHead = direction(PLAYER_EYE, head);

  const lateral = (point) => {
    if (!eyeToHead) return Infinity;
    const px = point.x - PLAYER_EYE.x;
    const pz = point.z - PLAYER_EYE.z;
    return Math.abs(eyeToHead.x * pz - eyeToHead.z * px);
  };

  return {
    step,
    mark,
    behindDot: fromHeadToShooter ? dot2(fromHeadToShooter, facing) : 0,
    awayDot: fromShooterToHead ? dot2(fromShooterToHead, facing) : 0,
    towardPlayerDot: toPlayer ? dot2(toPlayer, facing) : 0,
    shooterReach: fromHeadToShooter ? fromHeadToShooter.length : 0,
    shooterGap: Math.hypot(mark.shooter.x - PLAYER_EYE.x, mark.shooter.z - PLAYER_EYE.z)
      - Math.hypot(head.x - PLAYER_EYE.x, head.z - PLAYER_EYE.z),
    playerDistance: eyeToHead ? eyeToHead.length : 0,
    muzzleClearance: lateral(mark.muzzle),
    secondClearance: lateral(mark.escort),
  };
}

/**
 * The thresholds. Named so a failure reads as a sentence rather than a number.
 *
 * `MIN_MUZZLE_CLEARANCE` is 0.12 m rather than something generous because the
 * whole offset a man makes when he steps off somebody's spine is 0.26 m, and
 * most of that is spent on the angle: what is left across the player's
 * sightline is small and is still the difference between a flash and a black
 * head with a bang behind it.
 */
export const STAGING_LIMITS = Object.freeze({
  MAX_BEHIND_DOT: -0.9,
  MIN_AWAY_DOT: 0.9,
  MIN_TOWARD_PLAYER_DOT: 0.35,
  MIN_SHOOTER_GAP: 0.4,
  MIN_MUZZLE_CLEARANCE: 0.12,
  MIN_SECOND_CLEARANCE: 0.9,
  MAX_PLAYER_DISTANCE: 9.0,
});

/**
 * Check the whole act. Returns a list of sentences; empty is the pass.
 *
 * Every one of these is a defect this scene has already had a version of
 * somewhere in the codebase: a man facing the wrong way because an ambient
 * turn won, a second body parked on the sightline, an executioner standing
 * between the camera and the thing the camera is for.
 */
export function verifyExecutionStaging() {
  const findings = [];
  const limits = STAGING_LIMITS;

  /* The casting has to agree with site.js's own default, or one of the two is
   * describing a night that is not being played. */
  for (const step of KNEELING_EXECUTIONS) {
    const mark = markForStep(step);
    if (!mark) {
      findings.push(`${step.beat}: no mark "${step.markId}" on the site`);
      continue;
    }
    if (mark.victim !== step.victim) {
      findings.push(`${step.beat}: site.js casts ${mark.victim} on ${step.markId}, the script walks out ${step.victim}`);
    }
    if (step.shooter === step.second) {
      findings.push(`${step.beat}: ${step.shooter} cannot be both the shooter and the second`);
    }

    const geometry = executionGeometry(step);
    if (geometry.behindDot > limits.MAX_BEHIND_DOT) {
      findings.push(`${step.beat}: ${step.shooter} is not behind ${step.victim} `
        + `(behindDot ${geometry.behindDot.toFixed(3)} > ${limits.MAX_BEHIND_DOT})`);
    }
    if (geometry.awayDot < limits.MIN_AWAY_DOT) {
      findings.push(`${step.beat}: ${step.victim} is not facing away from ${step.shooter} `
        + `(awayDot ${geometry.awayDot.toFixed(3)} < ${limits.MIN_AWAY_DOT})`);
    }
    if (!step.besidePlayer && geometry.towardPlayerDot < limits.MIN_TOWARD_PLAYER_DOT) {
      findings.push(`${step.beat}: ${step.victim} is turned away from the line — `
        + `the player never gets their face (towardPlayerDot ${geometry.towardPlayerDot.toFixed(3)})`);
    }
    if (step.besidePlayer) {
      const lateral = Math.abs(mark.x - PLAYER_EYE.x);
      const foreAft = Math.abs(mark.z - PLAYER_EYE.z);
      if (lateral < 1.2 || lateral > 1.5 || foreAft > 0.5) {
        findings.push(`${step.beat}: ${step.victim} is not beside the player `
          + `(lateral ${lateral.toFixed(2)} m, fore/aft ${foreAft.toFixed(2)} m)`);
      }
      const playerToFall = Math.hypot(mark.fall.x - PLAYER_EYE.x, mark.fall.z - PLAYER_EYE.z);
      if (playerToFall < 0.9) {
        findings.push(`${step.beat}: ${step.victim} falls into the player (${playerToFall.toFixed(2)} m)`);
      }
    }
    if (geometry.shooterGap < limits.MIN_SHOOTER_GAP) {
      findings.push(`${step.beat}: ${step.shooter} is not further from the player than `
        + `${step.victim} and can occlude the shot (gap ${geometry.shooterGap.toFixed(3)} m)`);
    }
    if (geometry.muzzleClearance < limits.MIN_MUZZLE_CLEARANCE) {
      findings.push(`${step.beat}: the muzzle is on the player's line of sight to the head — `
        + `the flash happens behind the skull (clearance ${geometry.muzzleClearance.toFixed(3)} m)`);
    }
    if (geometry.secondClearance < limits.MIN_SECOND_CLEARANCE) {
      findings.push(`${step.beat}: ${step.second} is standing on the player's sightline `
        + `(clearance ${geometry.secondClearance.toFixed(3)} m)`);
    }
    if (geometry.playerDistance > limits.MAX_PLAYER_DISTANCE) {
      findings.push(`${step.beat}: ${geometry.playerDistance.toFixed(2)} m from the line is too far to read`);
    }
  }

  /* The four doomed prospects close on Tony. The last one is beside Tony, so
   * its visibility and body-clearance checks are deliberately local. */
  const distances = KNEELING_EXECUTIONS.map((step) => executionGeometry(step).playerDistance);
  for (let i = 1; i < distances.length; i++) {
    if (distances[i] >= distances[i - 1]) {
      findings.push(`${KNEELING_EXECUTIONS[i].beat}: mark ${i + 1} is not closer to the player than mark ${i}`);
    }
  }

  /* A body lands on the mark's fall point. Nobody may be put on their knees
   * on top of somebody who is already lying there. */
  for (let i = 0; i < KNEELING_EXECUTIONS.length; i++) {
    const fall = markForStep(KNEELING_EXECUTIONS[i]).fall;
    for (let j = i + 1; j < KNEELING_EXECUTIONS.length; j++) {
      const later = markForStep(KNEELING_EXECUTIONS[j]);
      const gap = Math.hypot(fall.x - later.x, fall.z - later.z);
      if (gap < 1.0) {
        findings.push(`${KNEELING_EXECUTIONS[j].beat}: ${KNEELING_EXECUTIONS[j].victim} is put down `
          + `${gap.toFixed(2)} m from where ${KNEELING_EXECUTIONS[i].victim} fell`);
      }
    }
  }

  for (const survivor of SURVIVORS) {
    if (DOOMED.includes(survivor)) {
      findings.push(`${survivor} is both a survivor and among the dead`);
    }
  }
  if (PLAYER_THREAT.rounds !== 0 || PLAYER_THREAT.fires !== false) {
    findings.push('the player threat can fire before Lou interrupts');
  }
  if (LOU_INTERRUPTION.beforeShot !== true) {
    findings.push('Lou is not guaranteed to interrupt before the player shot');
  }

  return findings;
}
