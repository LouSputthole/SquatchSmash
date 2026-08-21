/**
 * The staging gate's allowlist.
 *
 * WHY IT EXISTS. The staging gate reports 106 findings in the Bing and 70 in
 * the mansion, and most of them are the scene working: a man in a booth is
 * inside the booth's collider, and two dancers in a hot tub are inside one
 * solid 4.1 x 4.1 x 1.04 m box, because you cannot sit in a tub without being
 * inside the tub. A gate whose output is mostly correct-and-ignorable is a
 * gate nobody reads, and a gate nobody reads is not running.
 *
 * So this is the same instrument the geometry gate already carries, and
 * deliberately the same shape: every suppression is an ENTRY, every entry
 * names one finding in one state, carries a reason a human wrote and a line of
 * source it can be checked against, and the file is sorted so a diff reads.
 * No wildcards, no per-kind blanket switches, no "ignore this scene".
 *
 * THE RATCHET. An entry that no longer matches anything is an ERROR, not a
 * tidy-up. It means the defect it excused has been fixed, and the entry has to
 * go with it -- otherwise the file silently accumulates permission to be
 * broken in ways nobody has checked for years. Counts may fall freely and can
 * only rise by somebody writing a reason.
 *
 * Pure: JSON in, verdicts out. tools/verify-staging.mjs does the building.
 */

/** Entry keys every kind needs. */
const REQUIRED_KEYS = Object.freeze(['id', 'state', 'kind', 'reason', 'source']);

/** Keys an entry may carry beyond the required ones. */
const OPTIONAL_KEYS = Object.freeze([
  'sourceAnchor', 'actor', 'solid', 'seat', 'cohort', 'role',
]);

/** What each finding kind must name, so an entry cannot be vaguer than the fault. */
export const KIND_SUBJECTS = Object.freeze({
  ACTOR_INSIDE_SOLID: ['actor', 'solid'],
  FACING_INTO_SOLID: ['actor', 'solid'],
  FACING_UNIFORM: ['cohort'],
  SEAT_STANDING: ['actor', 'seat'],
  SEAT_MISSING: ['actor', 'seat'],
  SPAWN_BEHIND_PLAYER: ['actor'],
  ACTOR_ID_DUPLICATE: ['actor'],
  /* Scene-level: it is about the scene's collision model, not one person, so
   * it matches on the state alone and names nobody. */
  SIGHTLINES_NOT_EVIDENCE: [],
});

/** A reason has to be a sentence, not a shrug. */
export const MIN_REASON_CHARS = 40;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * Check one allowlist document.
 *
 * Returns `{ scene, entries, issues }`. Issues are strings; a caller with any
 * of them must refuse to run rather than run with a half-understood file --
 * the geometry gate's own rule, and it is the reason that gate can be trusted.
 */
export function validateStagingAllowlist(doc, { scene } = {}) {
  const issues = [];
  if (!doc || typeof doc !== 'object') {
    return { scene: scene ?? null, entries: [], issues: ['Allowlist must be an object'] };
  }
  if (doc.$schema !== 'squatchsmash.staging-allowlist.v1') {
    issues.push(`Unknown allowlist schema ${JSON.stringify(doc.$schema)}`);
  }
  if (scene && doc.scene !== scene) {
    issues.push(`Allowlist says scene ${JSON.stringify(doc.scene)} but lives under ${scene}`);
  }
  const entries = Array.isArray(doc.entries) ? doc.entries : null;
  if (!entries) {
    issues.push('Allowlist needs an entries array');
    return { scene: doc.scene ?? scene ?? null, entries: [], issues };
  }

  const seen = new Set();
  let previousId = '';
  entries.forEach((entry, index) => {
    const at = `entries[${index}]`;
    if (!entry || typeof entry !== 'object') {
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
    for (const key of ['actor', 'solid', 'seat', 'role']) {
      if (typeof entry[key] === 'string' && entry[key].includes('*')) {
        issues.push(`${at}.${key} may not contain a wildcard`);
      }
    }
    const subjects = KIND_SUBJECTS[entry.kind];
    if (!subjects) {
      if (isNonEmptyString(entry.kind)) issues.push(`${at}.kind ${JSON.stringify(entry.kind)} is not a finding this gate reports`);
      return;
    }
    for (const subject of subjects) {
      if (subject === 'cohort') {
        if (!Array.isArray(entry.cohort) || entry.cohort.length < 2
          || !entry.cohort.every(isNonEmptyString)) {
          issues.push(`${at}.cohort must name the actors that share the heading`);
        }
      } else if (!isNonEmptyString(entry[subject])) {
        issues.push(`${at}.${subject} is required for ${entry.kind}`);
      }
    }
  });
  return { scene: doc.scene ?? scene ?? null, entries, issues };
}

/** Does this entry excuse this finding? */
function matches(entry, finding, state) {
  if (entry.state !== state || entry.kind !== finding.kind) return false;
  if (entry.kind === 'FACING_UNIFORM') {
    const cohort = [...(finding.cohort ?? [])].sort();
    const allowed = [...entry.cohort].sort();
    return cohort.length === allowed.length && cohort.every((id, i) => id === allowed[i]);
  }
  /* A kind with no subjects is about the whole state, so state and kind are
   * the whole match. Falling through to the actor comparison below would
   * compare an absent `entry.actor` against a null `finding.id` and never
   * match, which is how the first scene-level entry read as stale on the run
   * that created it. */
  if (KIND_SUBJECTS[entry.kind].length === 0) return true;
  if (entry.actor !== finding.id) return false;
  if ('solid' in entry && entry.solid !== (finding.solid ?? null)) return false;
  if ('seat' in entry && entry.seat !== (finding.seat ?? null)) return false;
  return true;
}

/**
 * Split findings into those that stand and those an entry excuses.
 *
 * `unused` is the ratchet: entries that matched nothing this run. A caller
 * should treat them as errors, because an entry excusing a defect that no
 * longer happens is permission nobody re-examined.
 */
export function applyStagingAllowlist(findings, entries, state) {
  const used = new Set();
  const kept = [];
  const suppressed = [];
  for (const finding of findings) {
    const entry = entries.find((candidate) => matches(candidate, finding, state));
    if (entry) {
      used.add(entry.id);
      suppressed.push({ finding, entryId: entry.id });
    } else {
      kept.push(finding);
    }
  }
  return { kept, suppressed, used };
}

/** Entries for this scene that no run of these states ever needed. */
export function unusedEntries(entries, states, usedIds) {
  return entries
    .filter((entry) => states.includes(entry.state) && !usedIds.has(entry.id))
    .map((entry) => entry.id);
}
