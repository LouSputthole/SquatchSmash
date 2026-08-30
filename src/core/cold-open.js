/**
 * THE COLD OPEN.
 *
 * The game does not start in an apartment. It starts in SQUATCH SMASH, full
 * screen, with a menu and a score and a quit option, and it lets the player
 * believe for as long as he likes that this is the product he downloaded.
 * Then he quits it, and the camera pulls back off the monitor.
 *
 * THE TRICK, AND WHY IT IS NOT A TRICK. There is no fake. `ScreenOverlay`
 * already lays the real Squatch Smash page onto the monitor's screen mesh by
 * projecting that mesh's four corners through the camera every frame. So if
 * the camera is parked hard against the monitor -- close enough that the
 * screen quad covers the viewport -- the homography puts the genuine game
 * genuinely full screen, at correct perspective, with the keyboard and mouse
 * going straight to it. The reveal is then only a camera move: dolly back to
 * where a man sitting at that desk would have his head, and the game shrinks
 * onto the monitor because it was always on the monitor.
 *
 * Nothing is composited, nothing is scaled by hand, and no second copy of
 * Squatch Smash exists. The apartment is live behind it the whole time.
 *
 * This module owns the arithmetic and the clock. main.js owns the camera and
 * the room.
 */

/** Radians per degree, because the camera speaks degrees and the maths does not. */
const RAD = Math.PI / 180;

/**
 * How far from a screen the camera has to sit for that screen to COVER the
 * viewport.
 *
 * Cover, not fit: at the fitting distance the screen exactly touches the top
 * and bottom and leaves the game letterboxed inside the page, which is
 * precisely the tell that would give the whole thing away. Taking the smaller
 * of the two distances overflows the other axis instead, so the player sees
 * screen and nothing else.
 *
 * Pure numbers in, one number out, so the framing can be tested without a
 * renderer -- and so the "does it actually fill it" question has an answer
 * that is not somebody's eye on one monitor.
 */
export function monitorFillDistance({
  screenW, screenH, fovDeg, aspect, overscan = 1.04,
} = {}) {
  if (!(screenW > 0 && screenH > 0)) throw new RangeError('The screen needs a size');
  if (!(fovDeg > 0 && fovDeg < 180)) throw new RangeError('The camera needs a field of view');
  if (!(aspect > 0)) throw new RangeError('The viewport needs an aspect');
  const halfV = Math.tan(fovDeg * RAD / 2);
  const distanceForHeight = (screenH / 2) / halfV;
  const distanceForWidth = (screenW / 2) / (aspect * halfV);
  /* Dividing by the overscan brings it CLOSER, which grows the screen past
   * the frustum edge. A value of 1 would put the edge exactly on the border
   * and let a pixel of room show on a rounding error. */
  return Math.min(distanceForHeight, distanceForWidth) / overscan;
}

/** The beats, in order. */
export const COLD_OPEN_PHASES = Object.freeze([
  'playing',    // he thinks this is the game
  'shutdown',   // he has said yes to quitting, and it looks like it is closing
  'pullback',   // the camera comes off the monitor
  'beat',       // nothing happens, on purpose
  'done',       // the apartment has him, and Lou has rung
]);

/** How long the "closing" flicker lasts before the camera moves. Seconds. */
export const SHUTDOWN_S = 0.55;

/** The pull-back itself. Slow: this is the whole point of the opening. */
export const PULLBACK_S = 5.2;

/**
 * How long the player is left alone after the reveal before the phone rings.
 *
 * The owner's note: *"Do nothing for roughly 45 seconds. This silence is
 * valuable."* He needs to get from "I quit the game" to "I am still playing"
 * to "Squatch Smash was a game inside this game" on his own, and a phone
 * ringing during that walks over all three.
 */
export const BEAT_S = 40;

/**
 * Ease for the dolly.
 *
 * Slow out of the monitor, slow into the chair, and quickest in the middle
 * where the desk and the room arrive. A linear pull reads as a cutscene; this
 * reads as somebody leaning back.
 */
export function pullbackEase(t) {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

/**
 * The cold open's clock.
 *
 * Deliberately not a camera and not a scene: it is told how much time has
 * passed and says which beat we are in and how far through it. main.js reads
 * that and moves the camera. Keeping it this dumb is what lets the whole
 * sequence be tested in milliseconds instead of by sitting through it.
 */
export class ColdOpen {
  constructor({
    shutdown = SHUTDOWN_S, pullback = PULLBACK_S, beat = BEAT_S,
  } = {}) {
    this.shutdownFor = shutdown;
    this.pullbackFor = pullback;
    this.beatFor = beat;
    this.reset();
  }

  reset() {
    this.phase = 'playing';
    this.t = 0;
    /** Fires once, when the camera starts to move: the radio comes on here. */
    this.revealed = false;
    /** Fires once, when the camera has arrived and he has control. */
    this.landed = false;
    /** Fires once, when the phone should ring. */
    this.called = false;
    /* Every phase this run has entered, with the pull-back value at entry.
     * The receipt exists because the phases themselves can be UNOBSERVABLE
     * from outside: on a renderer slow enough that one frame carries more
     * than `shutdownFor`, shutdown is entered and left inside a single
     * update() and no poller at any rate can sample it. The opening's whole
     * contract is that its claims are checkable from outside; a transient
     * the outside cannot see needs a ledger. */
    this.phaseLog = [{ phase: 'playing', k: 0 }];
    return this;
  }

  /** He said yes to quitting. Nothing visible happens for half a second. */
  quit() {
    if (this.phase !== 'playing') return false;
    this.phase = 'shutdown';
    this.t = 0;
    this.phaseLog.push({ phase: 'shutdown', k: 0 });
    return true;
  }

  /** 0..1 through the pull-back, eased. Meaningless in any other phase. */
  get pullbackK() {
    if (this.phase === 'playing' || this.phase === 'shutdown') return 0;
    if (this.phase !== 'pullback') return 1;
    return pullbackEase(this.t / this.pullbackFor);
  }

  /** True while the camera should be under this module's control. */
  get owningCamera() {
    return this.phase === 'playing' || this.phase === 'shutdown' || this.phase === 'pullback';
  }

  /**
   * Advance, and report what just became true.
   *
   * Events rather than state comparisons, because "the radio starts when the
   * camera starts moving" is a thing that happens once and a caller should not
   * have to remember whether it has.
   */
  update(dt) {
    const events = [];
    if (!(dt > 0) || this.phase === 'playing' || this.phase === 'done') return events;
    this.t += dt;

    if (this.phase === 'shutdown' && this.t >= this.shutdownFor) {
      /* Keep the elapsed wall time that crossed this seam. Resetting to zero
       * made a slow rendered frame disappear once per phase, and feeding this
       * state machine the physics-clamped delta turned a 5.2-second reveal
       * into minutes on the deployed software renderer. */
      this.t -= this.shutdownFor;
      this.phase = 'pullback';
      this.phaseLog.push({ phase: 'pullback', k: this.pullbackK });
      this.revealed = true;
      events.push('reveal');
    }
    if (this.phase === 'pullback' && this.t >= this.pullbackFor) {
      this.t -= this.pullbackFor;
      this.phase = 'beat';
      this.phaseLog.push({ phase: 'beat', k: 1 });
      this.landed = true;
      events.push('land');
    }
    if (this.phase === 'beat' && this.t >= this.beatFor) {
      this.phase = 'done';
      this.t = 0;
      this.phaseLog.push({ phase: 'done', k: 1 });
      this.called = true;
      events.push('call');
    }
    return events;
  }
}
