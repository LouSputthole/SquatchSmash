/**
 * INITIATION NIGHT — who is walked out, by whom, onto which mark, and who is
 * standing behind them when it happens.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ONE KILLING PATH
 *
 * `main.js`'s `startExecution()` is the only thing in this scene that kills
 * anybody, and it stays that way. What it gained for the rewrite is two
 * optional fields — a named `shooter` instead of "whichever member happens to
 * be nearest", and a `stance` to walk him to instead of "two point two metres
 * away, facing the target". Prospect One goes through it with neither, exactly
 * as he does today: standing, frontal, eight rounds. The four that follow go
 * through it with both: kneeling, from behind, one round.
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
import { KNEEL_MARKS, PLAYER_EYE, STAND_MARK, facingOf } from './cabin/site.js';

/** Everybody who is standing in the line when the speech starts. */
export const LINE_UP = Object.freeze([
  Object.freeze({ id: 'prospect-one', name: 'PROSPECT ONE', x: -4.4, speaks: true }),
  Object.freeze({ id: 'player', name: 'PROSPECT TWO', x: -2.2, player: true }),
  Object.freeze({ id: 'prospect-three', name: 'PROSPECT THREE', x: 0, speaks: true }),
  Object.freeze({ id: 'prospect-four', name: 'PROSPECT FOUR', x: 2.2, speaks: false }),
  Object.freeze({ id: 'prospect-five', name: 'PROSPECT FIVE', x: 4.4, speaks: true }),
  /**
   * KITTENBOSS, on the end.
   *
   * She gets a slot of her own rather than a sixth entry in `PROSPECT_XS`,
   * because `cabin/site.js` copies those four numbers out of `main.js` and a
   * test asserts the copy still matches. Growing the array would break that
   * assertion to add a body the array was never about. 2.2 m of spacing, the
   * same as everybody else, which puts her in front of the boot car she was
   * driven out here in — the lid is still standing open behind her and nobody
   * shuts it and nobody refers to it.
   */
  Object.freeze({ id: 'kittenboss', name: 'KITTENBOSS', x: 6.6, speaks: true, she: true }),
]);

/** Where Kittenboss stands. Named because `main.js` places her from it. */
export const KITTENBOSS_SLOT = Object.freeze({ x: 6.6 });

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
  shooter: 'SEFF',
  kneeling: false,
  rounds: 8,
});

/**
 * The four, IN THE ORDER THEY ARE USED.
 *
 * ONE ROUND EACH. Eight rounds apiece is twenty-five seconds of shooting and
 * it turns four murders into a montage; one round each is the owner's "one at
 * a time" and it is also what leaves room for the silence between them, which
 * is where the whole act lives.
 *
 * `walker` is who goes down the line and brings them out, and it is Gratin
 * every time. `shooter` is who is standing behind them, and it changes hands
 * once, at IN-140, when the pistol is empty — Seff takes the first two, Gratin
 * takes the last two. `second` is whoever is not shooting; he stands on the
 * mark's escort stance, out of the player's line of sight.
 */
export const KNEELING_EXECUTIONS = Object.freeze([
  Object.freeze({
    index: 0, beat: 'IN-120', victim: 'PROSPECT THREE', markId: 'kneel-1',
    walker: 'GRATIN', shooter: 'SEFF', second: 'GRATIN', rounds: 1, kneeling: true,
    gapAfter: true, reloadAfter: false,
  }),
  Object.freeze({
    index: 1, beat: 'IN-130', victim: 'PROSPECT FOUR', markId: 'kneel-2',
    walker: 'GRATIN', shooter: 'SEFF', second: 'GRATIN', rounds: 1, kneeling: true,
    /* The pistol is empty after this one. The gap comes first, then IN-140. */
    gapAfter: true, reloadAfter: true,
  }),
  Object.freeze({
    index: 2, beat: 'IN-145', victim: 'PROSPECT FIVE', markId: 'kneel-3',
    walker: 'GRATIN', shooter: 'GRATIN', second: 'SEFF', rounds: 1, kneeling: true,
    gapAfter: true, reloadAfter: false,
  }),
  Object.freeze({
    index: 3, beat: 'IN-160', victim: 'KITTENBOSS', markId: 'kneel-4',
    walker: 'GRATIN', shooter: 'GRATIN', second: 'SEFF', rounds: 1, kneeling: true,
    /* Nothing follows her. IN-170 is two men counting. */
    gapAfter: false, reloadAfter: false,
  }),
]);

/**
 * THE ORDER OF THE ACT, as data.
 *
 * `main.js` walks this list with a cursor rather than carrying the ordering
 * rules in its own control flow, so the sequence a test checks is the sequence
 * the scene runs. Three gaps, one reload, four people:
 *
 *   kneel THREE · gap · kneel FOUR · gap · reload · kneel FIVE · gap · kneel KITTENBOSS
 *
 * The reload sits AFTER the second gap and BEFORE the third victim is shot,
 * which is what puts Prospect Five on his knees listening to a man load a
 * pistol behind him. That is the longest silence in the act.
 */
export function executionRunOrder() {
  const out = [];
  let gap = 0;
  KNEELING_EXECUTIONS.forEach((step, index) => {
    const next = KNEELING_EXECUTIONS[index + 1] ?? null;
    out.push(Object.freeze({ kind: 'kneel', step }));
    if (step.gapAfter) out.push(Object.freeze({ kind: 'gap', gap: ++gap }));
    if (step.reloadAfter) {
      out.push(Object.freeze({ kind: 'reload', next, to: next ? next.shooter : step.shooter }));
    }
  });
  return Object.freeze(out);
}

/** Everybody in the line who does not walk out of the clearing. */
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
    if (geometry.towardPlayerDot < limits.MIN_TOWARD_PLAYER_DOT) {
      findings.push(`${step.beat}: ${step.victim} is turned away from the line — `
        + `the player never gets their face (towardPlayerDot ${geometry.towardPlayerDot.toFixed(3)})`);
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

  /* They walk toward him. Each mark is closer than the last, and the last one
   * is Kittenboss. The escalation is the staging doing work no line is
   * allowed to do. */
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

  /* The pistol changes hands exactly once, and only when it is empty. */
  const handovers = KNEELING_EXECUTIONS.filter(
    (step, i) => i > 0 && step.shooter !== KNEELING_EXECUTIONS[i - 1].shooter,
  );
  if (handovers.length !== 1) {
    findings.push(`the pistol changes hands ${handovers.length} time(s); IN-140 is the only handover`);
  } else if (!KNEELING_EXECUTIONS[handovers[0].index - 1].reloadAfter) {
    findings.push('the pistol changes hands somewhere other than the reload at IN-140');
  }

  /* Kittenboss is last and is not skipped. This is the assertion the whole
   * scene exists for and it is worth stating twice. */
  const last = KNEELING_EXECUTIONS[KNEELING_EXECUTIONS.length - 1];
  if (last.victim !== 'KITTENBOSS') {
    findings.push('KITTENBOSS is not the last one walked out');
  }
  if (!DOOMED.includes('KITTENBOSS')) {
    findings.push('KITTENBOSS is not among the dead');
  }

  return findings;
}
