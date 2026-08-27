/**
 * The three hard cases that have to leave room twelve after the deal turns.
 *
 * Keep this ledger independent of meshes and actors. Rico can move the money,
 * Chino can throw the Reserve into the pool, and the premium case can start
 * under a bed; none of those presentation choices are allowed to change what
 * the getaway requires or make the car guess from unrelated inventory flags.
 */
export const MOTEL_EVIDENCE_CASES = Object.freeze([
  Object.freeze({ id: 'reserve', label: 'Reserve shipment case', short: 'Reserve case' }),
  Object.freeze({ id: 'money', label: "Lou's money case", short: "Lou's money case" }),
  Object.freeze({ id: 'premium', label: "Rico's premium evidence case", short: 'premium case' }),
]);

const CASE_BY_ID = new Map(MOTEL_EVIDENCE_CASES.map((entry) => [entry.id, entry]));

function assertEvidenceId(id) {
  if (!CASE_BY_ID.has(id)) throw new RangeError(`Unknown Motel evidence case: ${id}`);
  return id;
}

/** One authority for collection, car gating, the counter, and missing copy. */
export class MotelEvidenceLedger {
  constructor(collected = []) {
    this.collected = new Set();
    for (const id of collected) this.collected.add(assertEvidenceId(id));
  }

  collect(id) {
    const checkedId = assertEvidenceId(id);
    if (this.collected.has(checkedId)) return false;
    this.collected.add(checkedId);
    return true;
  }

  has(id) {
    return this.collected.has(assertEvidenceId(id));
  }

  reset(collected = []) {
    this.collected.clear();
    for (const id of collected) this.collected.add(assertEvidenceId(id));
    return this.snapshot();
  }

  snapshot() {
    const missing = MOTEL_EVIDENCE_CASES.filter(({ id }) => !this.collected.has(id));
    return Object.freeze({
      collected: Object.freeze(MOTEL_EVIDENCE_CASES
        .filter(({ id }) => this.collected.has(id))
        .map(({ id }) => id)),
      count: this.collected.size,
      total: MOTEL_EVIDENCE_CASES.length,
      complete: missing.length === 0,
      missing: Object.freeze(missing.map(({ id }) => id)),
      missingLabels: Object.freeze(missing.map(({ short }) => short)),
    });
  }
}

export function evidenceCounter(snapshot) {
  return `Evidence Cases ${snapshot.count}/${snapshot.total}`;
}

export function evidenceMissingCopy(snapshot) {
  if (snapshot.complete) return 'All three evidence cases are secured.';
  const names = snapshot.missingLabels;
  if (names.length === 1) return `One evidence case remains: ${names[0]}.`;
  if (names.length === 2) return `Two evidence cases remain: ${names[0]} and ${names[1]}.`;
  return `Three evidence cases remain: ${names[0]}, ${names[1]}, and ${names[2]}.`;
}

export function evidenceObjectiveCopy(snapshot) {
  return `${evidenceCounter(snapshot)} · ${evidenceMissingCopy(snapshot)}`;
}
