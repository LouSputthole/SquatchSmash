/**
 * The authored clock for the front table.
 *
 * A beat can be late, but it cannot jump the social order of the evening.
 * In particular, Ape does not approach until the waiter has served the drinks
 * and the champagne waiter has finished identifying the sender.
 */
export const SEATED_BEATS = Object.freeze([
  { id: 'table', after: 0 },
  { id: 'entrance', after: 6 },
  { id: 'work', after: 26 },
  { id: 'drinks', after: 48 },
  { id: 'champagne', after: 74, needs: 'drinks' },
  { id: 'family', after: 96, needs: 'champagne' },
  { id: 'funny', after: 150 },
  { id: 'personal', after: 186 },
  { id: 'show', after: 240 },
  { id: 'another', after: 300 },
  { id: 'toast', after: 355 },
  { id: 'dessert', after: 360 },
  { id: 'invitation', after: 366, needs: 'dessert' },
]);

export class SeatedDinnerFlow {
  constructor({ elapsed = 0, index = 0 } = {}) {
    this.elapsed = elapsed;
    this.index = index;
  }

  advance(dt) {
    this.elapsed += Math.max(0, Number(dt) || 0);
    return this.elapsed;
  }

  /** Return at most one due beat. The caller owns the scene/dialogue work. */
  next({
    busy = false,
    roundsDone = new Set(),
    champagneComplete = false,
    dessertComplete = false,
    invitationReady = false,
  } = {}) {
    if (busy) return null;
    const beat = SEATED_BEATS[this.index];
    if (!beat || this.elapsed < beat.after) return null;
    if (beat.needs === 'drinks' && !roundsDone.has('drinks')) return null;
    if (beat.needs === 'champagne' && !champagneComplete) return null;
    if (beat.needs === 'dessert' && (!dessertComplete || !invitationReady)) return null;
    this.index++;
    return beat.id;
  }

  checkpoint() {
    return { elapsed: this.elapsed, index: this.index };
  }

  restore({ elapsed = 0, index = 0 } = {}) {
    this.elapsed = elapsed;
    this.index = index;
    return this;
  }
}
