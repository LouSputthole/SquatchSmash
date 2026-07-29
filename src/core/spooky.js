/**
 * Things that happen in an empty flat once you are far enough gone.
 *
 * The rule is that NOTHING here is ever confirmed. No monster, no jump scare,
 * no event that could not have been the building settling or you not paying
 * attention. A door you did not open is ajar. The clock ticks out of time with
 * itself for four seconds. Somebody upstairs walks the length of the room and
 * stops. The lights dip like a fridge kicking in, and the fridge did not kick
 * in.
 *
 * Every one of them is deniable, which is the only way this stays funny rather
 * than becoming a different genre. You will not be sure any of it happened,
 * and neither is he -- the lines he has for it are all "did that just", never
 * "there is something in here".
 *
 * It only starts once the trip is properly up, gets more frequent as it peaks,
 * and stops the moment you come down. Weed alone does not trigger it; being
 * stoned makes you slow, not haunted.
 */

/** Below this the flat behaves itself. */
const THRESHOLD = 0.45;
/** Seconds between candidate events at full trip, roughly. */
const GAP_MIN = 22;
const GAP_MAX = 52;

export class Spooky {
  /**
   * @param {object} hooks  one callback per thing that can happen
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.next = GAP_MIN;
    /** Everything that has happened this run, for the narrator. */
    this.seen = [];
    this._last = null;
  }

  reset() {
    this.next = GAP_MIN;
    this._last = null;
  }

  /**
   * @param {number} dt
   * @param {number} trip 0..1
   */
  update(dt, trip) {
    if (trip < THRESHOLD) {
      // Coming down resets the timer, so the first one after a new dose is
      // not instant just because you were high an hour ago.
      this.next = GAP_MIN;
      return;
    }
    this.next -= dt * (0.6 + trip);
    if (this.next > 0) return;

    const deep = (trip - THRESHOLD) / (1 - THRESHOLD);
    this.next = GAP_MAX - (GAP_MAX - GAP_MIN) * deep;

    /* Never the same one twice running -- a light that dips twice in a row is
     * a bug, and it reads as one. */
    const names = Object.keys(this.hooks).filter((k) => k !== this._last);

    /* A hook returns false when there was nothing for it to do: no lights on
     * to dip, no radio on to interrupt. Spending the event on it anyway is how
     * you get a five-minute stretch where nothing happens at all, so try the
     * next one instead. */
    while (names.length) {
      const i = (Math.random() * names.length) | 0;
      const pick = names.splice(i, 1)[0];
      if (this.hooks[pick]?.(deep) === false) continue;
      this._last = pick;
      this.seen.push(pick);
      return;
    }
  }
}
