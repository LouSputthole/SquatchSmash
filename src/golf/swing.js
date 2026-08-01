/**
 * The three-click swing.
 *
 * Click to start it, click to set power, click to set the strike. It is the
 * oldest golf interface there is because it is the one a player understands
 * inside a single shot, which is the requirement here.
 *
 * The forgiving bit is deliberate and central: a strike inside the dead zone
 * is *pure*, not merely good. A player should be able to hit the middle of the
 * green without practising, and should still be able to miss it by trying to
 * squeeze the last five yards out of the meter. The punishment lives at the
 * top of the power bar, not in the timing.
 *
 * No DOM and no Three.js — main.js draws it, this decides it.
 */

export const SWING_PHASE = {
  IDLE: 'idle',
  POWER: 'power',
  STRIKE: 'strike',
  DONE: 'done',
};

/* Seconds for the marker to sweep the full power bar. Slow enough to aim at,
 * fast enough that a full swing is a decision rather than a wait. */
const POWER_TIME = 1.05;
/* The strike sweep is quicker — this is the part that is supposed to be a
 * reflex — and it runs past zero so that being late is a real miss. */
const STRIKE_SPEED = 1.55;
const STRIKE_FLOOR = -0.30;

/** Inside this of the line, the strike is pure. */
export const DEAD_ZONE = 0.085;
/** Beyond this, it is as bad as it gets. */
const MISS_SCALE = 0.34;

export class Swing {
  constructor() {
    this.phase = SWING_PHASE.IDLE;
    this.marker = 0;
    this.power = 0;
    this.accuracy = 0;
    /** True while the marker is on its way back down the power bar. */
    this.falling = false;
    this.result = null;
  }

  get active() {
    return this.phase === SWING_PHASE.POWER || this.phase === SWING_PHASE.STRIKE;
  }

  reset() {
    this.phase = SWING_PHASE.IDLE;
    this.marker = 0;
    this.power = 0;
    this.accuracy = 0;
    this.falling = false;
    this.result = null;
  }

  /**
   * One click. Returns the phase it moved into, so the caller knows whether
   * this was the swing landing.
   */
  click() {
    switch (this.phase) {
      case SWING_PHASE.IDLE:
        this.reset();
        this.phase = SWING_PHASE.POWER;
        return this.phase;

      case SWING_PHASE.POWER:
        this.power = clamp01(this.marker);
        this.phase = SWING_PHASE.STRIKE;
        return this.phase;

      case SWING_PHASE.STRIKE:
        this._resolve(this.marker);
        return this.phase;

      default:
        return this.phase;
    }
  }

  update(dt) {
    if (this.phase === SWING_PHASE.POWER) {
      /* Up, then back down if he waits. Letting it run off the top and
       * resolve at full power would take the choice away, and letting it
       * bounce forever would make the meter a metronome instead of a shot. */
      this.marker += (this.falling ? -1 : 1) * (dt / POWER_TIME);
      if (this.marker >= 1) { this.marker = 1; this.falling = true; }
      if (this.marker <= 0 && this.falling) {
        // He let the whole thing go by. That is a decision too: a tap.
        this.marker = 0;
        this.power = 0.06;
        this.phase = SWING_PHASE.STRIKE;
      }
      return;
    }

    if (this.phase === SWING_PHASE.STRIKE) {
      this.marker -= dt * STRIKE_SPEED;
      if (this.marker <= STRIKE_FLOOR) this._resolve(STRIKE_FLOOR);
    }
  }

  _resolve(at) {
    /* `at` is where the marker was when he hit it, measured against the line
     * at zero. Positive is early — the club arrives open and the ball leaks
     * right; negative is late and it goes left. */
    const raw = at;
    const outside = Math.abs(raw) <= DEAD_ZONE
      ? 0
      : Math.sign(raw) * (Math.abs(raw) - DEAD_ZONE);
    this.accuracy = clamp(outside / MISS_SCALE, -1, 1);
    this.phase = SWING_PHASE.DONE;
    this.result = { power: this.power, accuracy: this.accuracy, strike: raw };
  }

  /**
   * A quality word for the strike, for the HUD and for what the group says
   * about it. Purely presentational — the physics only ever sees `accuracy`.
   */
  strikeLabel() {
    const a = Math.abs(this.accuracy);
    if (a === 0) return 'PURED';
    if (a < 0.3) return 'SOLID';
    if (a < 0.65) return this.accuracy > 0 ? 'FADED' : 'DRAWN';
    return this.accuracy > 0 ? 'SLICED' : 'HOOKED';
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function clamp01(v) { return clamp(v, 0, 1); }

/**
 * The swing an NPC makes.
 *
 * They go through `launchFor` and the same ball as the player; only the way
 * the numbers are arrived at differs. Personality is in the spread: Erican is
 * boringly repeatable, Rippin swings out of his shoes, Lou does not miss by
 * much because he is not trying to do anything difficult.
 */
export function npcSwing(power, accuracy = 0) {
  return { power: clamp01(power), accuracy: clamp(accuracy, -1, 1) };
}
