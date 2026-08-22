/**
 * The beat framing gate's allowlist.
 *
 * WHY IT EXISTS. The framing gate reported five findings across the two
 * Initiation states and every one of them was the same artifact: the scene
 * authors its collision as height-less `{x, z, r}` circles, and the collider
 * reader gives a circle it cannot measure the game's standing band, -0.5 m to
 * 4 m. Testing the ray against the circle rather than its circumscribing
 * square lifted three of the five outright. The two left are the parked cars,
 * whose roofs are at 2.26 m and whose colliders claim four metres of air above
 * them -- a camera 3.6 m up reads as buried in a Lincoln, and a sightline
 * passing 1.7 m over one reads as stopped by it.
 *
 * Those two are not shot faults and they are not this change's to fix: the fix
 * is authored heights on the car colliders, the same move that took the cabin
 * furniture from six findings to one. Until somebody makes it, a gate that
 * cannot go blocking is a gate that lets the SIXTH finding -- a real one -- in
 * unnoticed. So the known two are written down, with a reason apiece, and
 * everything else fails the build.
 *
 * THE SHAPE IS THE ONE THE REPO ALREADY USES -- tools/staging-allowlist.mjs
 * and tools/line-reachability.mjs, deliberately, down to the sorted ids and
 * the minimum reason length. Each gate owns its own vocabulary of finding
 * kinds and its own idea of what an entry must name, which is why this is a
 * third file of the same shape rather than a fourth caller of a generalised
 * one: the shared part is a convention, and the different part is all of it.
 *
 * THE RATCHET, and it is the whole point. An entry that matched nothing this
 * run is an ERROR. docs/ENGINE-TRAPS.md entry 10: a stale entry reads like
 * good news and is just as likely to mean the gate went blind -- forty-two
 * mansion recliner entries went stale at once because `isOwnBody` had started
 * eating the chairs, and deleting them as tidy-up would have destroyed the
 * only written record of a live defect.
 *
 * Pure: JSON in, verdicts out. tools/verify-framing.mjs does the building and
 * the reading from disk.
 */

export const ALLOWLIST_SCHEMA = 'squatchsmash.framing-allowlist.v1';

/** Entry keys every kind needs. */
const REQUIRED_KEYS = Object.freeze(['id', 'state', 'beat', 'kind', 'reason', 'source']);

/** Keys an entry may carry beyond the required ones. */
const OPTIONAL_KEYS = Object.freeze(['sourceAnchor', 'speaker', 'subject', 'solid', 'actor']);

/**
 * What each finding kind must name, so an entry cannot be vaguer than the
 * fault it excuses.
 *
 * A beat and a kind alone would excuse whatever that beat does next: the shot
 * that is allowed to have a car in front of it would then also be allowed to
 * point at nothing. Every kind therefore names its subject, and the two
 * beat-level faults name nothing further because there is nothing further --
 * they are about the beat itself.
 */
export const KIND_SUBJECTS = Object.freeze({
  SPEAKER_OCCLUDED: ['speaker', 'solid'],
  SPEAKER_OFF_CAMERA: ['speaker'],
  CAMERA_INSIDE_SOLID: ['solid'],
  CAMERA_AIM_MISS: ['subject'],
  CAMERA_LOOK_MISS: ['subject'],
  BEAT_ACTOR_MISSING: ['actor'],
  BEAT_ID_DUPLICATE: [],
});

/** A reason has to be a sentence, not a shrug -- tools/staging-allowlist.mjs. */
export const MIN_REASON_CHARS = 40;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * Check one allowlist document.
 *
 * Returns `{ entries, issues }`. Issues mean REFUSE TO RUN rather than run
 * with a half-understood file: an allowlist nobody can trust is worse than no
 * allowlist, because the run it produces is green.
 */
export function validateFramingAllowlist(doc) {
  const issues = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { entries: [], issues: ['Allowlist must be an object'] };
  }
  if (doc.$schema !== ALLOWLIST_SCHEMA) {
    issues.push(`Unknown allowlist schema ${JSON.stringify(doc.$schema)}`);
  }
  const entries = Array.isArray(doc.entries) ? doc.entries : null;
  if (!entries) {
    issues.push('Allowlist needs an entries array');
    return { entries: [], issues };
  }

  const seen = new Set();
  let previousId = '';
  entries.forEach((entry, index) => {
    const at = `entries[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push(`${at} is not an object`);
      return;
    }
    for (const key of REQUIRED_KEYS) {
      if (!isNonEmptyString(entry[key])) issues.push(`${at}.${key} must be a non-empty string`);
    }
    for (const key of Object.keys(entry)) {
      if (!REQUIRED_KEYS.includes(key) && !OPTIONAL_KEYS.includes(key)) {
        issues.push(`${at} has unknown key ${JSON.stringify(key)}`);
      }
    }
    if (isNonEmptyString(entry.id)) {
      if (seen.has(entry.id)) issues.push(`${at}.id ${JSON.stringify(entry.id)} is used twice`);
      seen.add(entry.id);
      if (entry.id <= previousId) issues.push(`${at}.id must sort after ${JSON.stringify(previousId)}`);
      previousId = entry.id;
    }
    if (isNonEmptyString(entry.reason) && entry.reason.trim().length < MIN_REASON_CHARS) {
      issues.push(`${at}.reason must be at least ${MIN_REASON_CHARS} characters: say why this is not a defect`);
    }
    /* A wildcard is how an allowlist stops being a list. */
    for (const key of ['state', 'beat', 'speaker', 'subject', 'solid', 'actor']) {
      if (typeof entry[key] === 'string' && entry[key].includes('*')) {
        issues.push(`${at}.${key} may not contain a wildcard`);
      }
    }
    const subjects = KIND_SUBJECTS[entry.kind];
    if (!subjects) {
      if (isNonEmptyString(entry.kind)) {
        issues.push(`${at}.kind ${JSON.stringify(entry.kind)} is not a finding this gate reports`);
      }
      return;
    }
    for (const subject of subjects) {
      if (!isNonEmptyString(entry[subject])) {
        issues.push(`${at}.${subject} is required for ${entry.kind}`);
      }
    }
  });
  return { entries, issues };
}

/** Does this entry excuse this finding, in this state? */
function matches(entry, finding, stateId) {
  if (entry.state !== stateId || entry.kind !== finding.kind) return false;
  if (entry.beat !== (finding.beat ?? null)) return false;
  for (const subject of KIND_SUBJECTS[entry.kind] ?? []) {
    if (entry[subject] !== (finding[subject] ?? null)) return false;
  }
  return true;
}

/**
 * Split one state's findings into those that stand and those an entry excuses.
 *
 * `used` feeds the ratchet below; a caller that does not report unused entries
 * has built a file that can only grow.
 */
export function applyFramingAllowlist(findings, entries, stateId) {
  const used = new Set();
  const kept = [];
  const suppressed = [];
  for (const finding of findings) {
    const entry = entries.find((candidate) => matches(candidate, finding, stateId));
    if (entry) {
      used.add(entry.id);
      suppressed.push({ finding, entryId: entry.id });
    } else {
      kept.push(finding);
    }
  }
  return { kept, suppressed, used };
}

/**
 * Entries that excused nothing this run.
 *
 * Judged only against states this run actually built, because a filtered run
 * (`verify-framing initiation`) has not looked at the rest and knows nothing
 * about them. Reporting those as stale would teach people to ignore the
 * ratchet, which is the same as not having one.
 */
export function unusedEntries(entries, builtStateIds, usedIds) {
  const built = new Set(builtStateIds);
  return entries
    .filter((entry) => built.has(entry.state) && !usedIds.has(entry.id))
    .map((entry) => entry.id);
}
