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
/* The strike sweep runs past zero so that being late is a real miss.
 *
 * Exported because it is also the LEFT-HAND END OF THE BAR: anything drawing
 * this meter has to map [STRIKE_FLOOR, 1] onto its track, and golf/main.js
 * kept its own `METER_FLOOR = -0.30` copy of that number for a year. The
 * mansion's pool panel now draws the same meter, and a third copy of a
 * constant three files have to agree on is exactly the drift
 * docs/REUSE-FIRST.md is about. */
export const STRIKE_FLOOR = -0.30;

/**
 * Where the third click's marker starts from, at the very least.
 *
 * The strike sweep used to begin wherever the power marker happened to stop,
 * which quietly made the *tempo of the third click a function of how hard you
 * were swinging*. A full iron gave you 833 ms to read the line; a six-foot
 * putt gave you 389 ms; a two-foot tap gave you 133 ms and resolved itself
 * before a human could react, at `STRIKE_FLOOR`, as a full hook. The shortest
 * shot on the course was the hardest input in the game, which is exactly
 * backwards, and it is most of what "the swing still needs work" was.
 *
 * A floor fixes it without touching the shape of the swing: the marker still
 * falls from the power he chose whenever that is a real backswing, and a soft
 * shot simply gets the same readable run-up a full one does. The club's own
 * `strikeSpeed` and `deadZone` still decide how wide the window is, so a
 * driver stays sharper than a putter — the difference is that all three now
 * *arrive* at a pace a person can play.
 */
const STRIKE_START_FLOOR = 0.55;

/** The iron's clean-lie sweet spot. Kept public for old verifier call sites. */
export const DEAD_ZONE = 0.09;

/**
 * Each club has its own tempo and amount of face control. `safePower` is not a
 * distance target; it is the point beyond which the player is swinging harder
 * than that club can be controlled comfortably. The distance target is worked
 * out per shot in clubs.js.
 *
 * `strikeSpeed` is in bar-widths per second and every one of them is below the
 * power sweep's 0.952, which the gameplay spec asks for in as many words: "the
 * strike sweep stays slower than the power sweep so a first-time player can
 * read the second click". Driver and iron used to sit at 1.15 and 1.08 —
 * *faster* than the power bar, and the opposite of what was written down. The
 * only thing that now runs quicker than the power sweep is a driver held past
 * its control point, and being punished for that is the point of the risk
 * multiplier in `controlWindow`.
 */
export const SWING_CONTROL = Object.freeze({
  driver: Object.freeze({
    safePower: 0.86, deadZone: 0.075, missScale: 0.27,
    strikeSpeed: 0.90, fadeBias: 0.22,
  }),
  iron: Object.freeze({
    safePower: 0.91, deadZone: DEAD_ZONE, missScale: 0.34,
    strikeSpeed: 0.85, fadeBias: 0.14,
  }),
  putter: Object.freeze({
    safePower: 0.97, deadZone: 0.115, missScale: 0.44,
    strikeSpeed: 0.66, fadeBias: 0.025,
  }),
  /* A POOL CUE IS NOT A GOLF CLUB, AND IT IS IN HERE ANYWAY.
   *
   * Owner: "a power bar similar to golf" for the mansion billiard table, and
   * the standing complaint behind docs/REUSE-FIRST.md is that we keep writing
   * a third of something we already have twice. Everything this meter is --
   * the two clicks, the dead zone, the overswing band past `safePower`, the
   * signed timing error that `resolveStrike` turns into a number the physics
   * can use -- is exactly what a pool stroke wants, so src/mansion/pool.js
   * asks for `club: 'cue'` and gets the whole meter rather than a fork of it.
   *
   * What does NOT carry over is named where it is used, not here: a golf
   * swing has a backswing ARC and a face angle that bends the ball in flight,
   * and a cue has neither -- it slides down a bridge hand in a straight line
   * and the cue ball leaves in a straight line too. So `accuracy` is read in
   * pool.js as radians off the aimed line rather than as shape, and
   * `strikeLabel()`'s FADED/SLICED vocabulary is left to golf.
   *
   * The numbers: `safePower` 0.82 is the point past which a man is hitting it
   * harder than he can keep the butt straight (break power is above it on
   * purpose -- a break is meant to be a risk); `deadZone` 0.1 is wider than an
   * iron's because a straight stroke is the easiest thing on this list;
   * `strikeSpeed` 0.72 stays under the power sweep's 0.952 like every other
   * row, per the note above; `fadeBias` 0.3 is the squirt a hard stroke puts
   * on the cue ball even when the timing was clean. */
  cue: Object.freeze({
    safePower: 0.82, deadZone: 0.1, missScale: 0.3,
    strikeSpeed: 0.72, fadeBias: 0.3,
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
    /** Where this swing's strike sweep began. Drives the meter and the arms. */
    this.strikeStart = STRIKE_START_FLOOR;
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
    this.strikeStart = STRIKE_START_FLOOR;
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
        /* The strike sweep starts from the backswing, floored so that a tap-in
         * gets the same readable run-up as a full driver. See
         * STRIKE_START_FLOOR. */
        this.strikeStart = Math.max(this.power, STRIKE_START_FLOOR);
        this.marker = this.strikeStart;
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
        this._setPower(0.06);
        this.strikeStart = STRIKE_START_FLOOR;
        this.marker = this.strikeStart;
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
 * the numbers are arrived at differs. Personality is in the spread: Eric is
 * boringly repeatable, Rippin swings out of his shoes, Lou does not miss by
 * much because he is not trying to do anything difficult.
 */
export function npcSwing(power, accuracy = 0) {
  return { power: clamp01(power), accuracy: clamp(accuracy, -1, 1) };
}
