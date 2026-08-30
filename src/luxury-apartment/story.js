export const LUXURY_READY_TASKS = Object.freeze([
  Object.freeze({ id: 'showered', label: 'shower' }),
  Object.freeze({ id: 'dressed', label: 'change clothes' }),
  Object.freeze({ id: 'phoneTaken', label: 'take your phone' }),
]);

/**
 * Beat 14's three chores, counted.
 *
 * Furniture owns the physical state -- the shower knows it ran, the wardrobe
 * knows he changed, the console table knows the phone left it -- and this
 * counts them. It does NOT own the lift: `core/luxury-apartment-story.js` is
 * the campaign adapter and its `tryLeave` is the only door in this flat, so a
 * second refusal here would be two rules over one handle, and they would
 * eventually disagree. What this owns is the answer to "how much is left",
 * which the door has no way to say and the panel has no way to find out.
 */
export class LuxuryReadyTally {
  constructor(initial = {}) {
    this.facts = Object.fromEntries(LUXURY_READY_TASKS.map(({ id }) => [id, initial[id] === true]));
  }

  sync(source = {}) {
    let changed = false;
    for (const { id } of LUXURY_READY_TASKS) {
      if (source[id] === true && !this.facts[id]) {
        this.facts[id] = true;
        changed = true;
      }
    }
    return changed;
  }

  complete(id) {
    if (!Object.hasOwn(this.facts, id) || this.facts[id]) return false;
    this.facts[id] = true;
    return true;
  }

  get completedCount() {
    return LUXURY_READY_TASKS.reduce((count, { id }) => count + Number(this.facts[id]), 0);
  }

  get ready() {
    return this.completedCount === LUXURY_READY_TASKS.length;
  }

  get objective() {
    return this.ready
      ? 'Use the private elevator.'
      : `Get ready for Front & Center · ${this.completedCount}/${LUXURY_READY_TASKS.length}`;
  }


  snapshot() {
    return Object.freeze({
      facts: Object.freeze({ ...this.facts }),
      completedCount: this.completedCount,
      ready: this.ready,
      objective: this.objective,
    });
  }
}

export function createLuxuryReadyTally(initial) {
  return new LuxuryReadyTally(initial);
}
