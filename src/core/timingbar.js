/**
 * A sweeping bar with a target window: hit the key while the marker is inside
 * it, N times, and the thing you are doing finishes.
 *
 * This is the generic mechanic, not a specific activity. The apartment has one
 * timing game already in the toilet (see tryPush in main.js) but that one is
 * "press the key that is showing" -- a reaction test. This is the other kind:
 * the marker's position is public and always visible, so failure is never a
 * surprise, only impatience. That difference matters for anything you are
 * meant to settle into rather than react to.
 *
 * The window sits wherever the caller puts it. Off-centre is more interesting
 * than centred, because a centred window is hit by mashing.
 */

/** Sweep speed in bar-widths per second. */
const SPEED = 0.86;
/** How much faster every success makes it. */
const RAMP = 1.11;
/** How long a hit or a miss stays lit on the bar. */
const FLASH = 0.22;

export class TimingBar {
  /**
   * @param {object} opts
   *   hits    how many good ones it takes
   *   window  [from, to] as fractions of the bar, e.g. [0.72, 0.86]
   *   speed   sweeps per second
   *   ramp    multiplied into the speed on every success
   *   onHit   (n, total) => void
   *   onMiss  () => void
   *   onDone  () => void
   */
  constructor({ hits = 6, window = [0.72, 0.86], speed = SPEED, ramp = RAMP,
    onHit, onMiss, onDone } = {}) {
    this.total = hits;
    this.window = window;
    /* Kept separate from `speed`, which is climbing the whole time the bar is
     * up: reset() used to leave the sweep wherever the last run had wound it
     * to, so a second go started at the pace the first one finished at. */
    this.baseSpeed = speed;
    this.ramp = ramp;
    this.onHit = onHit;
    this.onMiss = onMiss;
    this.onDone = onDone;
    this.reset();
  }

  reset() {
    this.active = false;
    this.done = false;
    this.hits = 0;
    this.speed = this.baseSpeed;
    /** 0..1 across the bar. */
    this.pos = 0;
    this._dir = 1;
    this.flash = null;     // 'hit' | 'miss'
    this._flashT = 0;
  }

  start() {
    this.reset();
    this.active = true;
  }

  stop() {
    this.active = false;
  }

  /** True while the marker is inside the target. */
  get onTarget() {
    return this.pos >= this.window[0] && this.pos <= this.window[1];
  }

  update(dt) {
    if (!this.active) return;
    if (this.flash) {
      this._flashT -= dt;
      if (this._flashT <= 0) this.flash = null;
    }
    // Bounces rather than wrapping: a wrap makes the marker teleport, and the
    // eye reads a teleport as the bar having skipped rather than turned round.
    this.pos += this._dir * this.speed * dt;
    if (this.pos >= 1) { this.pos = 1; this._dir = -1; }
    if (this.pos <= 0) { this.pos = 0; this._dir = 1; }
  }

  /**
   * The key went down.
   * @returns {boolean} true if that was a good hit
   */
  press() {
    if (!this.active || this.done) return false;
    const good = this.onTarget;
    this.flash = good ? 'hit' : 'miss';
    this._flashT = FLASH;

    if (!good) {
      this.onMiss?.();
      return false;
    }

    this.hits++;
    this.onHit?.(this.hits, this.total);
    /* It speeds up as it goes. A run at one pace is a chore; a run that gets
     * harder is a build, and the last one is worth something. */
    this.speed *= this.ramp;
    if (this.hits >= this.total) {
      this.done = true;
      this.active = false;
      this.onDone?.();
    }
    return true;
  }

  /** What the HUD needs to draw it. Null when there is nothing to show. */
  get view() {
    if (!this.active && !this.flash) return null;
    return {
      pos: this.pos,
      from: this.window[0],
      to: this.window[1],
      hits: this.hits,
      total: this.total,
      flash: this.flash,
    };
  }
}
