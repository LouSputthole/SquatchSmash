import {
  ENOLA_SQUATCH_RANKS,
  ENOLA_SQUATCH_UNLOCKS,
  normalizeEnolaCheckpointSnapshot,
} from '../core/campaign.js';

const RESUME_PHASE_BY_CHECKPOINT = Object.freeze({
  takeoff: 'takeoff',
  turnOnCourse: 'cruise',
  preRelease: 'bombApproach',
  return: 'return',
});

const TIER_BY_RANK = Object.freeze({
  'Woke the Neighbours': 0,
  'Delivered, Eventually': 1,
  'Certified Heavy Aviator': 2,
  'Night Ops Professional': 3,
  'Express Shipping': 4,
});

const grade = (score) => (score > 0.75 ? 'good' : score > 0.45 ? 'ok' : 'bad');

/**
 * Rebuild the established FlightHud card from the subset the campaign saves.
 * It does not invent the eleven per-flight rows that were never persisted;
 * the three rows below are exactly the durable facts available after reload.
 */
export function enolaCompletionReportFromSave(mission = {}) {
  if (mission?.status !== 'complete') return null;
  const score = Number.isFinite(mission.score)
    ? Math.max(0, Math.min(1, mission.score)) : 0;
  const payloadReleased = mission.payloadReleased === true;
  const returnedHome = mission.returnedHome === true;
  const rank = ENOLA_SQUATCH_RANKS.includes(mission.rank)
    ? mission.rank : 'Mission Complete';
  const scoreTier = score > 0.78 ? 3 : score > 0.58 ? 2 : score > 0.36 ? 1 : 0;

  return {
    stats: [
      { label: 'Mission score', value: `${Math.round(score * 100)}%`, grade: grade(score) },
      { label: 'Payload released', value: payloadReleased ? 'YES' : 'NO', grade: payloadReleased ? 'good' : 'bad' },
      { label: 'Returned home', value: returnedHome ? 'YES' : 'NO', grade: returnedHome ? 'good' : 'bad' },
    ],
    rank,
    tier: TIER_BY_RANK[rank] ?? scoreTier,
    total: score,
    unlocks: Array.isArray(mission.unlocks)
      ? [...new Set(mission.unlocks.filter((value) => ENOLA_SQUATCH_UNLOCKS.includes(value)))]
      : [],
  };
}

/** Map the save vocabulary onto `main.js`'s existing go()/restore paths. */
export function enolaResumePhase(checkpoint) {
  return RESUME_PHASE_BY_CHECKPOINT[checkpoint] ?? null;
}

/**
 * Build a reload plan around the scene's existing go()/restore path. Old
 * checkpoint-only saves restart at takeoff so every score row is re-earned;
 * they never jump late with a fabricated fresh/default score ledger.
 */
export function enolaResumePlan(checkpoint, checkpointSnapshot) {
  const phase = enolaResumePhase(checkpoint);
  if (!phase) return null;
  const checkpointData = normalizeEnolaCheckpointSnapshot(
    checkpointSnapshot,
    checkpoint,
  );
  if (!checkpointData) {
    return { phase: 'takeoff', checkpointData: null, legacyFallback: true };
  }
  return { phase, checkpointData, legacyFallback: false };
}
