/**
 * The three-click swing.
 *
 * Click to start it, click to set power, click to set the strike. It is the
 * oldest golf interface there is because it is the one a player understands
 * inside a single shot, which is the requirement here.
 *
 * The forgiving bit is deliberate and central: a controlled strike inside the
 * dead zone is *pure*, not merely good. Chasing the red end of the power bar
 * narrows that dead zone, quickens the return sweep, and adds an open-face
 * bias. A perfect player can hold a hard swing to a fade; an early third click
 * compounds that bias into a slice. Club and lie decide how much help remains.
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
const STRIKE_FLOOR = -0.30;

/** The iron's clean-lie sweet spot. Kept public for old verifier call sites. */
export const DEAD_ZONE = 0.09;

/**
 * Each club has its own tempo and amount of face control. `safePower` is not a
 * distance target; it is the point beyond which the player is swinging harder
 * than that club can be controlled comfortably. The distance target is worked
 * out per shot in clubs.js.
 */
export const SWING_CONTROL = Object.freeze({
  driver: Object.freeze({
    safePower: 0.86, deadZone: 0.075, missScale: 0.27,
    strikeSpeed: 1.68, fadeBias: 0.22,
  }),
  iron: Object.freeze({
    safePower: 0.91, deadZone: DEAD_ZONE, missScale: 0.34,
    strikeSpeed: 1.52, fadeBias: 0.14,
  }),
  putter: Object.freeze({
    safePower: 0.97, deadZone: 0.115, missScale: 0.44,
    strikeSpeed: 1.18, fadeBias: 0.025,
  }),
});

/**
 * The live timing window for one selected swing.
 *
 * Power above the club's control point progressively removes forgiveness. A
 * difficult lie also shrinks the band, but never enough to turn golf into a
 * one-frame input. Returning this as data lets the HUD draw the exact rule the
 * physics will use.
 */
export function controlWindow({ club = 'iron', power = 0, lieSpread = 0 } = {}) {
  const tuning = SWING_CONTROL[club] ?? SWING_CONTROL.iron;
  const p = clamp01(power);
  const overswing = clamp01((p - tuning.safePower) / (1 - tuning.safePower));
  const risk = smoothstep(overswing);
  const lieRisk = clamp01(Math.max(0, lieSpread) / 8);

  return {
    club: SWING_CONTROL[club] ? club : 'iron',
    safePower: tuning.safePower,
    risk,
    lieRisk,
    deadZone: tuning.deadZone * (1 - 0.48 * risk) * (1 - 0.28 * lieRisk),
    missScale: tuning.missScale * (1 - 0.20 * risk) * (1 - 0.18 * lieRisk),
    strikeSpeed: tuning.strikeSpeed * (1 + 0.18 * risk) * (1 + 0.08 * lieRisk),
    fadeBias: tuning.fadeBias,
  };
}

/** Translate the signed face result into the shot shape the player sees. */
export function shotShape(accuracy) {
  const a = Math.abs(accuracy);
  if (a <= 0.08) return 'straight';
  if (a < 0.42) return accuracy > 0 ? 'fade' : 'draw';
  return accuracy > 0 ? 'slice' : 'hook';
}

/** Pure resolution function used by Swing, tests, and balance tools. */
export function resolveStrike({
  club = 'iron', power = 0, strike = 0, lieSpread = 0,
} = {}) {
  const control = controlWindow({ club, power, lieSpread });
  const raw = Number.isFinite(strike) ? strike : 0;
  const outside = Math.abs(raw) <= control.deadZone
    ? 0
    : Math.sign(raw) * (Math.abs(raw) - control.deadZone);
  const timingAccuracy = clamp(outside / control.missScale, -1, 1);

  /* An overswing tends to leave the face open. A late click can counter it;
   * an early click adds to it. Even at full power the centered result is a
   * playable fade, not a dice-roll penalty. */
  const faceBias = control.risk * control.fadeBias
    * (0.65 + 0.35 * clamp01(Math.abs(raw) / Math.max(control.deadZone, 0.001)));
  const accuracy = clamp(timingAccuracy + faceBias, -1, 1);

  return {
    power: clamp01(power), strike: raw, accuracy, timingAccuracy, faceBias,
    shape: shotShape(accuracy), ...control,
  };
}

export class Swing {
  constructor({ club = 'iron', lieSpread = 0 } = {}) {
    this.club = SWING_CONTROL[club] ? club : 'iron';
    this.lieSpread = Math.max(0, lieSpread);
    this.phase = SWING_PHASE.IDLE;
    this.marker = 0;
    this.power = 0;
    this.accuracy = 0;
    /** True while the marker is on its way back down the power bar. */
    this.falling = false;
    this.result = null;
    this._applyControl(controlWindow({ club: this.club, lieSpread: this.lieSpread }));
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
    this._applyControl(controlWindow({ club: this.club, lieSpread: this.lieSpread }));
  }

  /** Configure the shot before the first click. */
  configure({ club = this.club, lieSpread = this.lieSpread } = {}) {
    this.club = SWING_CONTROL[club] ? club : 'iron';
    this.lieSpread = Math.max(0, lieSpread);
    this._applyControl(controlWindow({
      club: this.club, power: this.power, lieSpread: this.lieSpread,
    }));
    return this;
  }

  _applyControl(control) {
    this.safePower = control.safePower;
    this.risk = control.risk;
    this.deadZone = control.deadZone;
    this.missScale = control.missScale;
    this.strikeSpeed = control.strikeSpeed;
  }

  _setPower(power) {
    this.power = clamp01(power);
    this._applyControl(controlWindow({
      club: this.club, power: this.power, lieSpread: this.lieSpread,
    }));
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
        this._setPower(this.marker);
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
        this._setPower(0.06);
        this.phase = SWING_PHASE.STRIKE;
      }
      return;
    }

    if (this.phase === SWING_PHASE.STRIKE) {
      this.marker -= dt * this.strikeSpeed;
      if (this.marker <= STRIKE_FLOOR) this._resolve(STRIKE_FLOOR);
    }
  }

  _resolve(at) {
    /* `at` is where the marker was when he hit it, measured against the line
     * at zero. Positive is early — the club arrives open and the ball leaks
     * right; negative is late and it goes left. */
    const resolved = resolveStrike({
      club: this.club, power: this.power, strike: at, lieSpread: this.lieSpread,
    });
    this._applyControl(resolved);
    this.accuracy = resolved.accuracy;
    this.phase = SWING_PHASE.DONE;
    this.result = resolved;
  }

  /**
   * A quality word for the strike, for the HUD and for what the group says
   * about it. Purely presentational — the physics only ever sees `accuracy`.
   */
  strikeLabel() {
    const shape = this.result?.shape ?? shotShape(this.accuracy);
    if (shape === 'straight') return 'PURED';
    if (shape === 'fade') return 'FADED';
    if (shape === 'draw') return 'DRAWN';
    return shape === 'slice' ? 'SLICED' : 'HOOKED';
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function clamp01(v) { return clamp(v, 0, 1); }
function smoothstep(v) {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
}

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
