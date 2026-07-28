/**
 * Intoxication.
 *
 * One number, 0..1, that everything else reads from:
 *   - the camera sways and rolls
 *   - walking drifts off the direction you asked for
 *   - the screen blurs and the edges close in
 *   - your aim in Squatch Smash wanders
 *   - at 1.0 you pass out and wake up back in bed
 *
 * A cigarette does not sober you up, but it steadies you for a while, which
 * is the trade the player is actually making: beer buys you a Steady Hands
 * charge, and past two beers it starts costing you more than it gives.
 */

/** One beer. Four of them will put you on the floor. */
export const BEER_UNITS = 0.26;

/** One pull of whiskey. Roughly two beers, and it lands faster. */
export const WHISKEY_UNITS = 0.44;

/** Per second. A beer wears off in a bit under two minutes. */
const DECAY = 0.0024;

/** Below this nothing happens at all. */
const ONSET = 0.16;

const STAGES = [
  { at: 0.70, name: 'hammered', label: 'Hammered' },
  { at: 0.42, name: 'drunk', label: 'Drunk' },
  { at: ONSET, name: 'buzzed', label: 'Buzzed' },
  { at: 0, name: 'sober', label: '' },
];

export class Drunk {
  constructor() {
    this.level = 0;
    this.time = 0;

    /** Cigarette steadiness, in seconds remaining. */
    this.steady = 0;
    /** Short head-rush spike right after lighting up. */
    this.rush = 0;

    this.sway = { yaw: 0, pitch: 0, roll: 0 };
    this.blur = 0;
    this.vignette = 0;
    this.warmth = 0;

    this.passedOut = false;
    this._hiccupAt = 0;
    this.onHiccup = null;
  }

  get stage() {
    return STAGES.find((s) => this.level >= s.at) ?? STAGES[STAGES.length - 1];
  }

  /** How much the world should wobble, 0..1, after cigarettes are accounted for. */
  get swayStrength() {
    if (this.level <= ONSET) return this.rush;
    const raw = (this.level - ONSET) / (1 - ONSET);
    const damped = this.steady > 0 ? raw * 0.45 : raw;
    return Math.min(1.4, damped + this.rush);
  }

  drink(units = BEER_UNITS) {
    this.level = Math.min(1.35, this.level + units);
  }

  /** Nicotine: a jolt, then a steadier ~25 seconds. */
  smoke() {
    this.rush = 1.0;
    this.steady = 25;
  }

  /** Waking up after passing out: still rough, but upright. */
  sleepItOff() {
    this.level = 0.30;
    this.steady = 0;
    this.rush = 0;
    this.passedOut = false;
  }

  reset() {
    this.level = 0;
    this.steady = 0;
    this.rush = 0;
    this.passedOut = false;
  }

  update(dt) {
    this.time += dt;

    if (this.level > 0) this.level = Math.max(0, this.level - DECAY * dt);
    if (this.steady > 0) this.steady = Math.max(0, this.steady - dt);
    if (this.rush > 0) this.rush = Math.max(0, this.rush - dt * 0.55);

    const s = this.swayStrength;
    const t = this.time;

    // Two detuned sines per axis so the motion never reads as a clean loop.
    this.sway.yaw = (Math.sin(t * 0.62) * 0.030 + Math.sin(t * 0.23 + 2.1) * 0.018) * s;
    this.sway.pitch = (Math.sin(t * 0.47 + 1.3) * 0.020 + Math.sin(t * 0.81) * 0.008) * s;
    this.sway.roll = (Math.sin(t * 0.35) * 0.075 + Math.sin(t * 0.90 + 0.7) * 0.022) * s;

    // Screen treatment only kicks in once you are past "buzzed".
    const heavy = Math.max(0, (this.level - 0.40) / 0.60);
    this.blur = heavy * (this.steady > 0 ? 1.1 : 2.2);
    this.vignette = Math.max(0, (this.level - 0.28) / 0.72) * 0.62;
    this.warmth = Math.min(1, this.level * 0.9);

    // Hiccups, once there is something to hiccup about.
    if (this.level > 0.35 && t > this._hiccupAt) {
      this._hiccupAt = t + 11 + Math.random() * 14;
      this.onHiccup?.();
    }

    if (this.level >= 1 && !this.passedOut) {
      this.passedOut = true;
      return true; // caller runs the pass-out sequence
    }
    return false;
  }
}
