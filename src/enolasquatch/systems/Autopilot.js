/**
 * Autopilot — "maybe you can put the plane on auto pilot and gun them down."
 *
 * The mechanic is the TRADE, not the convenience. Engaging this hands the
 * aeroplane to a box that can hold a heading and an altitude and can do
 * absolutely nothing else, and then leaves it there while the player climbs
 * into the tail. What it costs:
 *
 *   - It flies STRAIGHT AND LEVEL, which is the easiest gunnery problem in the
 *     world. `Interceptors.setPredictability()` and `Defense.intensity` are
 *     both driven off `predictability` below, so the flak tightens up and the
 *     fighters' hit chance goes up the moment nobody is flying.
 *   - It cannot evade. Nothing the player does at the gun spoils an aimed
 *     burst, because spoiling one means throwing the aeroplane about and
 *     nobody is in the seat to do it.
 *   - It has LIMITED AUTHORITY (`ROLL_LIMIT`/`PITCH_LIMIT`). An engine out on
 *     one side, a rudder hit or a real gust is more than it can hold, so the
 *     aeroplane wanders, and a wander at four hundred feet over a defended
 *     target is a problem that has to be flown out of.
 *   - It DROPS OUT. A stall, an attitude past `HARD_LIMIT`, a blast wave or a
 *     serious hit kicks it off and it will not take the aeroplane back for
 *     `REENGAGE_DELAY` seconds. Coming back to an empty seat and a bomber on
 *     its side is the failure this system is designed to be able to produce.
 *
 * IT IS NOT A CHEAT AND IT IS NOT A CUTSCENE. The control law below writes
 * into the same `physics.controls` fields a human writes into, through the
 * same aerodynamics, with tighter limits than a human has. Every sign in it
 * was established by running `src/beefrun/physics.js` headless rather than by
 * reading it:
 *
 *   controls.roll  = +1  ->  rollDeg rises AND heading rises  (a LEFT turn:
 *                            the nose is +Z so the pilot's left is +X, and
 *                            heading counts round toward +X)
 *   controls.pitch = +1  ->  pitchDeg rises, the aeroplane climbs
 *   controls.yaw   = +1  ->  heading rises, sideslip goes negative
 *
 * so a positive `headingDelta(current, target)` wants a positive roll command,
 * and sideslip is nulled with `yaw = k * beta`.
 */
import { clamp, lerp, damp, headingDelta } from '../../beefrun/util.js';

/** How far it will bank to make a heading correction. */
export const ROLL_LIMIT = 16;
/** How much elevator it will ever ask for. */
export const PITCH_LIMIT = 0.55;
/** Past this attitude it gives up and hands back a bomber that is already wrong. */
export const HARD_LIMIT = { roll: 52, pitch: 26 };
/** How long it sulks before it will take the aeroplane again. */
export const REENGAGE_DELAY = 3.0;

export class Autopilot {
  /**
   * @param {object} o
   * @param {object} o.physics AircraftPhysics
   * @param {object} [o.engines] EngineSystem — only read, for the speed hold
   */
  constructor({ physics, engines = null }) {
    this.physics = physics;
    this.engines = engines;
    this.engaged = false;
    this.targetHeading = 0;
    this.targetAltitude = 0;
    this.targetSpeed = 62;
    this.lockout = 0;
    this.reason = null;         // why it last dropped out
    this.holdError = { heading: 0, altitude: 0 };
    /** 0..1 — how much of an easy shot the aeroplane currently is. */
    this.predictability = 0;
    this.onDisengage = null;    // (reason) => void
    this.onEngage = null;       // () => void
    this._t = 0;
  }

  /** True when this thing is not allowed to take the aeroplane. */
  get lockedOut() { return this.lockout > 0; }

  /**
   * Take the aeroplane.
   *
   * Refuses on the ground, in a stall, out of the envelope, or during the
   * lockout after it has just been thrown off — an autopilot that can be
   * re-engaged the instant it fails is not a trade, it is a pause button.
   *
   * @returns {boolean} whether it took it
   */
  engage({ heading = null, altitude = null, speed = null } = {}) {
    const p = this.physics;
    if (this.engaged) return true;
    if (this.lockout > 0) return false;
    if (p.onGround || p.tas < 30) return false;
    if (Math.abs(p.rollDeg) > HARD_LIMIT.roll || Math.abs(p.pitchDeg) > HARD_LIMIT.pitch) return false;
    if (p.stallT > 0.2) return false;
    this.engaged = true;
    this.reason = null;
    this.targetHeading = heading ?? p.headingDeg;
    this.targetAltitude = altitude ?? p.position.y;
    this.targetSpeed = speed ?? Math.max(52, p.tas);
    // Start the trim from where the aeroplane is actually flying rather than
    // from a guess, so it does not have to integrate its way out of a hole.
    this._trim = clamp(p.pitchDeg, -6, 6);
    this._vsFilter = p.vspeed;
    this._throttle = clamp(p.controls.throttleL || 0.6, 0.25, 1);
    this.onEngage?.();
    return true;
  }

  /**
   * Hand it back.
   * @param {?string} reason null when the player asked for it; a string when
   *   the aeroplane took it away, which also starts the lockout.
   */
  disengage(reason = null) {
    if (!this.engaged) return false;
    this.engaged = false;
    this.reason = reason;
    this.predictability = 0;
    if (reason) this.lockout = REENGAGE_DELAY;
    this.onDisengage?.(reason);
    return true;
  }

  /** Nudge the held heading/altitude — the player can still trim from the gun. */
  adjust({ heading = 0, altitude = 0 }) {
    if (!this.engaged) return;
    this.targetHeading = (this.targetHeading + heading + 360) % 360;
    this.targetAltitude = clamp(this.targetAltitude + altitude, 60, 6000);
  }

  /**
   * Fly it. Call every frame AFTER `FlightInput.applyTo(controls)` and BEFORE
   * `physics.advance(dt)` — it overwrites the three axes and the two throttle
   * levers, and it must be the last word on them or the player's centred stick
   * fights it every frame.
   *
   * @returns {boolean} whether it is flying
   */
  update(dt) {
    this._t += dt;
    if (this.lockout > 0) this.lockout = Math.max(0, this.lockout - dt);
    if (!this.engaged) return false;
    const p = this.physics;
    const c = p.controls;

    /* ---- Reasons to hand it back ---- */
    if (p.onGround) { this.disengage('on the ground'); return false; }
    if (p.stallT > 0.35) { this.disengage('stall'); return false; }
    if (Math.abs(p.rollDeg) > HARD_LIMIT.roll) { this.disengage('bank angle'); return false; }
    if (Math.abs(p.pitchDeg) > HARD_LIMIT.pitch) { this.disengage('attitude'); return false; }

    /* ---- Heading, through bank ---- */
    const hErr = headingDelta(p.headingDeg, this.targetHeading);
    this.holdError.heading = hErr;
    const wantRoll = clamp(hErr * 1.35, -ROLL_LIMIT, ROLL_LIMIT);
    // Rate term off the real roll rate, so it stops the bank rather than
    // hunting round it. `omega.z` is the body-frame roll rate.
    const rollCmd = clamp((wantRoll - p.rollDeg) * 0.075 + p.omega.z * 0.55, -0.62, 0.62);

    /* ---- Altitude, through vertical speed, through pitch attitude ----
     *
     * Three things here that a bare proportional loop does not have, and all
     * three earned their place by being needed:
     *
     *   THE FILTER. `p.vspeed` over a defended target is mostly gust —
     *     `WeatherSystem` is running real turbulence — and feeding raw gust
     *     into a pitch command means the autopilot spends its authority
     *     chasing air. Damped at about half a second, which is slow enough to
     *     ignore a bump and fast enough to catch a real climb.
     *
     *   THE TRIM INTEGRATOR. No proportional loop can hold an altitude in a
     *     steady updraft or at a trim speed it was not set for: it settles
     *     wherever the error balances the gain. This is the pitch attitude the
     *     aeroplane actually needs, accumulated slowly and bounded, and it is
     *     what turns a two-hundred-metre wander over three quarters of a
     *     minute into a few metres.
     *
     *   THE BOUND. +/- 6 degrees of trim, so a runaway integrator cannot fly
     *     the aeroplane into the ground or into the stall — it can only ever
     *     ask for an attitude a pilot would also have asked for. */
    const aErr = this.targetAltitude - p.position.y;
    this.holdError.altitude = aErr;
    const wantVs = clamp(aErr * 0.09, -6.0, 5.5);
    this._vsFilter = damp(this._vsFilter ?? p.vspeed, p.vspeed, 2.2, dt);
    const vsErr = wantVs - this._vsFilter;
    this._trim = clamp((this._trim ?? 1.6) + vsErr * 0.55 * dt, -6, 6);
    const wantPitch = clamp(vsErr * 1.5 + this._trim, -10, 12);
    const pitchCmd = clamp((wantPitch - p.pitchDeg) * 0.13 + p.omega.x * 0.45, -PITCH_LIMIT, PITCH_LIMIT);

    /* ---- Sideslip, through rudder. Positive yaw drives beta negative. ---- */
    const yawCmd = clamp(p.beta * 2.6, -0.55, 0.55);

    c.roll = rollCmd;
    c.pitch = pitchCmd;
    c.yaw = yawCmd;

    /* ---- Speed hold. It writes the levers, not the player's lever, so the
     * throttle the player left set is exactly what comes back on disengage. ---- */
    const sErr = this.targetSpeed - p.tas;
    this._throttle = clamp((this._throttle ?? c.throttleL ?? 0.6) + sErr * 0.06 * dt, 0.25, 1);
    c.throttleL = this._throttle;
    c.throttleR = this._throttle;
    c.airBrake = 0;
    c.brake = 0;
    c.parkingBrake = false;

    /* ---- What it costs ----
     *
     * Predictability is what the fighters and the flak read. It climbs while
     * the aeroplane is genuinely settled and falls back while the autopilot is
     * still fighting something, because a bomber wallowing after an engine
     * failure is not actually an easy shot. */
    const settled = clamp(1 - Math.abs(p.rollDeg) / 18, 0, 1)
      * clamp(1 - Math.abs(hErr) / 12, 0, 1)
      * clamp(1 - Math.abs(p.vspeed) / 7, 0, 1);
    this.predictability = lerp(this.predictability, settled, clamp(dt * 0.7, 0, 1));
    return true;
  }

  /** One line of HUD, or null when it is not flying. */
  readout() {
    if (!this.engaged) return null;
    const hdg = String(Math.round(this.targetHeading)).padStart(3, '0');
    const alt = Math.round(this.targetAltitude * 3.28084 / 10) * 10;
    return `AUTOPILOT · HDG ${hdg} · ALT ${alt} ft`;
  }
}
