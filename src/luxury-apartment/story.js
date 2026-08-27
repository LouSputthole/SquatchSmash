export const LUXURY_READY_TASKS = Object.freeze([
  Object.freeze({ id: 'showered', label: 'shower' }),
  Object.freeze({ id: 'dressed', label: 'change clothes' }),
  Object.freeze({ id: 'phoneTaken', label: 'take your phone' }),
]);

const BLOCKED_ELEVATOR_LINES = Object.freeze([
  'Not yet. Shower, get dressed, grab the phone. Then the elevator.',
  'I am not going downstairs dressed like this. Get ready first.',
]);

/**
 * Small scene-local adapter for the apartment's get-ready beat.
 *
 * Furniture owns physical state, while this adapter owns reveal order and the
 * exact-once departure latch. Keeping those concerns separate lets headless
 * tests prove that an early elevator interaction cannot skip the apartment.
 */
export class LuxuryApartmentStory {
  constructor(initial = {}) {
    this.facts = Object.fromEntries(LUXURY_READY_TASKS.map(({ id }) => [id, initial[id] === true]));
    this.departed = false;
    this.blockedUses = 0;
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

  elevator(open) {
    if (!this.ready) {
      const line = BLOCKED_ELEVATOR_LINES[Math.min(this.blockedUses, BLOCKED_ELEVATOR_LINES.length - 1)];
      this.blockedUses += 1;
      return Object.freeze({ ok: false, action: 'blocked', line });
    }
    if (!open) return Object.freeze({ ok: true, action: 'call' });
    if (this.departed) return Object.freeze({ ok: false, action: 'duplicate' });
    this.departed = true;
    return Object.freeze({ ok: true, action: 'depart' });
  }

  snapshot() {
    return Object.freeze({
      facts: Object.freeze({ ...this.facts }),
      completedCount: this.completedCount,
      ready: this.ready,
      departed: this.departed,
      objective: this.objective,
    });
  }
}

export function createLuxuryApartmentStory(initial) {
  return new LuxuryApartmentStory(initial);
}
