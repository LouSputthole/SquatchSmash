/**
 * Loose two-abreast walking formation and narrative contract for the
 * Initiation trail.
 *
 * `along` is a fraction of the authored path ahead of (+) or behind (-) the
 * player. `lateral` is metres to either side of the path tangent. Keeping the
 * data here makes "not a conga line" a testable scene contract rather than a
 * comment beside fifteen centre-line offsets.
 */
export const INITIATION_TRAIL_FORMATION = Object.freeze([
  row('BOOSKIBRO', 0.145, -0.58, 3.28), row('LOU', 0.145, 0.58, 3.12),
  row('RIPPINFLOW', 0.105, -0.52, 3.18), row('HOGMAMA', 0.105, 0.52, 3.34),
  row('IRISH', 0.068, -0.62, 3.22), row('SASOLE', 0.068, 0.62, 3.08),
  row('ERIC', 0.035, -0.48, 3.36), row('SNOW', 0.035, 0.48, 3.16),
  row('APE', -0.035, -0.56, 3.10), row('NUMBSKULL', -0.035, 0.56, 3.30),
  row('SHUBENATOR', -0.072, -0.50, 3.26), row('LAG', -0.072, 0.50, 3.14),
  row('DEATHMEGATRON', -0.112, -0.58, 3.34), row('SEFF', -0.112, 0.58, 3.18),
  row('GRATIN', -0.145, 0, 3.06),
]);

/**
 * Every authored conversation marker that must be consumed before the cabin.
 *
 * These lived beside the frame loop, where the cabin-distance check could
 * advance first and silently discard whichever markers a fast player had
 * passed while another line was speaking. Keeping them in the trail contract
 * lets the runtime, verifier, and unit tests ask the same question: did the
 * whole walk happen?
 */
export const INITIATION_TRAIL_BEATS = Object.freeze([
  Object.freeze({ id: 'IN-210', at: 0.16 }),
  Object.freeze({ id: 'IN-220', at: 0.34 }),
  Object.freeze({ id: 'IN-230', at: 0.50 }),
  Object.freeze({ id: 'IN-240', at: 0.64 }),
]);

/** The phases that form the deliberate, roughly twenty-second procession. */
export const INITIATION_PROCESSION_PHASES = Object.freeze([
  'walk_out',
  'trail',
  'trail_choice',
  'trail_reply',
  'cabin_arrive',
]);

/**
 * Scene policy, not another movement implementation. Shared Player still owns
 * locomotion; this only tunes it for a group walking together. At 0.78 the
 * shared 2.35 m/s walk becomes about 1.83 m/s, matching the authored twenty
 * seconds over this trail. Sprint is withheld so it cannot become a dialogue
 * skip button. Recorded takes own subtitle duration during the walk rather
 * than a second text-length estimate stretching a 20-second exchange to 40.
 */
export const INITIATION_PROCESSION_POLICY = Object.freeze({
  moveScale: 0.78,
  allowSprint: false,
  dialogueTiming: 'recorded',
});

/**
 * Single-file order through the cabin's 1.15 m door.
 *
 * Lou and Rippin are already near the head of the trail. Booski holds the
 * door for Tony, then enters third; this is early enough that the ceremony
 * never waits on the tail of a fifteen-person procession, but late enough for
 * the player to see him physically come in behind. Everyone else follows in
 * loose pairs only after the previous entrant has cleared the threshold.
 */
export const INITIATION_CABIN_PROCESSION = Object.freeze([
  'LOU', 'RIPPINFLOW', 'BOOSKIBRO', 'HOGMAMA', 'IRISH', 'SASOLE',
  'ERIC', 'SNOW', 'APE', 'NUMBSKULL', 'SHUBENATOR', 'LAG',
  'DEATHMEGATRON', 'SEFF', 'GRATIN',
]);

/** Dialogue may begin once the principals are physically on their marks. */
export const INITIATION_CABIN_REQUIRED_AT_MARK = Object.freeze([
  'LOU', 'RIPPINFLOW', 'BOOSKIBRO',
]);

/**
 * Door-centred route for one entrant.
 *
 * `door` is `{x, frontZ, outsideZ}` and `final` is the member's measured room
 * mark. The two tiny lane offsets disappear at the threshold: they keep the
 * waiting line from stacking but never ask a shoulder to pass through a jamb.
 */
export function cabinProcessionRoute({ door, final, index = 0 } = {}) {
  if (!door || !final) return [];
  const side = index % 2 === 0 ? -1 : 1;
  const lane = side * 0.14;
  const fan = Math.sign(final.x - door.x) * Math.min(0.82, Math.abs(final.x - door.x));
  return [
    Object.freeze({ x: door.x + lane, z: door.outsideZ - 0.34, stage: 'queue' }),
    Object.freeze({ x: door.x + lane * 0.35, z: door.outsideZ + 0.34, stage: 'porch' }),
    Object.freeze({ x: door.x, z: door.frontZ + 0.62, stage: 'threshold' }),
    Object.freeze({ x: door.x + fan, z: door.frontZ + 1.48, stage: 'fan' }),
    Object.freeze({ x: final.x, z: final.z, heading: final.heading, stage: 'mark' }),
  ];
}

/**
 * Pure status calculation used by both the production gate and certification.
 * `choiceUsed` means the prompt appeared; `choiceResolved` means its reply (or
 * silent keep-walking option) finished. They are deliberately separate so
 * merely opening the choice can never authorize the cabin transition.
 */
export function trailNarrativeStatus({
  firedBeatIds = [],
  choiceUsed = false,
  choiceResolved = false,
  dialogActive = false,
  choiceOpen = false,
} = {}) {
  const fired = new Set(firedBeatIds);
  const requiredBeatIds = INITIATION_TRAIL_BEATS.map(({ id }) => id);
  const pendingBeatIds = requiredBeatIds.filter((id) => !fired.has(id));
  const storyComplete = pendingBeatIds.length === 0
    && choiceUsed
    && choiceResolved;
  const readyForCabin = storyComplete && !dialogActive && !choiceOpen;
  return {
    requiredBeatIds,
    firedBeatIds: requiredBeatIds.filter((id) => fired.has(id)),
    pendingBeatIds,
    choiceUsed: Boolean(choiceUsed),
    choiceResolved: Boolean(choiceResolved),
    dialogActive: Boolean(dialogActive),
    choiceOpen: Boolean(choiceOpen),
    storyComplete,
    readyForCabin,
  };
}

function row(key, along, lateral, speed) {
  return Object.freeze({ key, along, lateral, speed });
}

/** Offset a sampled path point sideways without changing its heading. */
export function formationTarget(point, lateral = 0) {
  const heading = Number(point?.heading) || 0;
  return {
    x: (Number(point?.x) || 0) + Math.cos(heading) * lateral,
    z: (Number(point?.z) || 0) - Math.sin(heading) * lateral,
    heading,
  };
}
