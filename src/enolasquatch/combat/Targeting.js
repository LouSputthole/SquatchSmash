/**
 * Targeting — the bomb-sight for the bombing-approach phase.
 *
 * Deliberately not a Norden-anything: this reads the aircraft's current
 * alignment against the compound (heading error, bank, pitch, altitude band,
 * distance) and turns it into two things the mission needs — a reticle
 * position to draw and a boolean the release prompt can gate on — plus a
 * running score of how well the corridor was flown, for the "EXPRESS
 * SHIPPING" achievement (deliver without missing the target).
 *
 * No THREE dependency and no live scene needed: `update()` takes the same
 * `phys` (AircraftPhysics) object the rest of the mission already reads
 * every frame, plus an optional terrain sampler for the target's ground
 * elevation. The reticle is expressed in boresight-relative normalized
 * coordinates (-1..1 each axis, 0 = dead ahead) rather than real screen
 * pixels, so it doesn't need to know about a camera's FOV or aspect ratio —
 * a render layer maps that onto the glass however it likes, the same way
 * `src/beefrun/mission.js`'s `projectNav()` maps its own nav point onto the
 * HUD using the live camera it has and Targeting.js does not.
 */
import { clamp, headingDelta } from '../../beefrun/util.js';
import { LANDMARKS_EAST } from '../config.js';

const DEFAULT_TARGET = LANDMARKS_EAST.find((l) => l.id === 'compound');

export class Targeting {
  /**
   * @param {object} [opts]
   * @param {{x:number, z:number}} [opts.target] world position of the aiming
   *   point — defaults to `LANDMARKS_EAST`'s compound entry.
   * @param {number} [opts.targetElevation] ground elevation at the target,
   *   metres. Used only for the reticle's vertical placement and the
   *   altitude band below; a flat guess is fine since this is a cinematic
   *   sight, not a stores-release computer.
   * @param {number} [opts.corridorHeading] compass heading the bombing run is
   *   flown on — same as `TURN_POINT.newHeading` (090) unless the mission
   *   sets up a different final leg.
   * @param {[number, number]} [opts.altitudeBand] AGL-over-target band (m)
   *   that counts as "on altitude" — [floor, ceiling].
   * @param {number} [opts.headingTolDeg] heading error, in degrees, that
   *   still counts as "on heading".
   * @param {number} [opts.bankTolDeg] bank angle, in degrees, that still
   *   counts as "level".
   * @param {number} [opts.pitchTolDeg] pitch angle, in degrees, that still
   *   counts as "level".
   * @param {number} [opts.holdSeconds] how long `aligned` must be
   *   continuously true before `readyToRelease` goes true — long enough that
   *   a lucky instant doesn't count, short enough that a genuinely steady
   *   approach isn't punished for it.
   * @param {number} [opts.fovDeg] half-angle, in degrees, the reticle's -1..1
   *   range represents on each axis — a cinematic sight FOV, not the real
   *   camera's.
   */
  constructor({
    target = DEFAULT_TARGET,
    targetElevation = 250,
    corridorHeading = 90,
    altitudeBand = [280, 520],
    headingTolDeg = 6,
    bankTolDeg = 8,
    pitchTolDeg = 7,
    holdSeconds = 1.6,
    fovDeg = 46,
  } = {}) {
    this.target = { x: target.x, z: target.z };
    this.targetElevation = targetElevation;
    this.corridorHeading = corridorHeading;
    this.altitudeBand = altitudeBand;
    this.headingTolDeg = headingTolDeg;
    this.bankTolDeg = bankTolDeg;
    this.pitchTolDeg = pitchTolDeg;
    this.holdSeconds = holdSeconds;
    this.fovDeg = fovDeg;

    this.headingError = 0;
    this.distance = Infinity;
    this.altitudeAgl = 0;
    this.onHeading = false;
    this.onBank = false;
    this.onAltitude = false;
    this.aligned = false;
    this.reticle = { x: 0, y: 0, onScreen: false };
    this._holdT = 0;
    this.readyToRelease = false;

    // Corridor-flying grade: a running, time-weighted average of alignment
    // quality (see `_alignmentQuality()` below), sampled every `update()`
    // call while the caller considers the corridor active. Not gated on
    // `aligned` alone — a player who is close but not quite perfect for a
    // couple of seconds should score worse than one who nailed it the whole
    // way, not the same "pass/fail" number.
    this._scoreSum = 0;
    this._scoreT = 0;
  }

  /** Distance from the aircraft to the target this frame, for HUD text. */
  get distanceMetres() { return this.distance; }

  /** 0..1 running average of how well the corridor has been flown so far. */
  get corridorScore() {
    return this._scoreT > 0 ? clamp(this._scoreSum / this._scoreT, 0, 1) : 0;
  }

  /**
   * @param {number} dt
   * @param {object} phys AircraftPhysics — reads position/headingDeg/
   *   rollDeg/pitchDeg.
   * @param {boolean} [scoring] whether this frame counts toward
   *   `corridorScore` — the mission passes `false` outside the bombApproach
   *   phase (e.g. before the corridor is entered) so meandering cruise
   *   flight doesn't drag the average down before the run has even begun.
   */
  update(dt, phys, scoring = true) {
    const dx = this.target.x - phys.position.x;
    const dz = this.target.z - phys.position.z;
    this.distance = Math.hypot(dx, dz);
    const bearing = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
    this.headingError = headingDelta(phys.headingDeg, bearing);

    this.altitudeAgl = phys.position.y - this.targetElevation;
    this.onHeading = Math.abs(this.headingError) < this.headingTolDeg;
    this.onBank = Math.abs(phys.rollDeg) < this.bankTolDeg && Math.abs(phys.pitchDeg) < this.pitchTolDeg;
    this.onAltitude = this.altitudeAgl >= this.altitudeBand[0] && this.altitudeAgl <= this.altitudeBand[1];
    this.aligned = this.onHeading && this.onBank && this.onAltitude;

    if (this.aligned) {
      this._holdT += dt;
    } else {
      this._holdT = 0;
    }
    this.readyToRelease = this._holdT >= this.holdSeconds;

    // Reticle: boresight-relative, not screen-relative. Elevation angle to
    // the target minus the aircraft's own pitch gives "how far up/down the
    // nose is from the target", which is what a bombsight's vertical line
    // actually shows — the target drifting up the sight picture as you
    // close in and undershoot the drop point.
    const elevToTargetDeg = (Math.atan2(-this.altitudeAgl, Math.max(this.distance, 1)) * 180) / Math.PI;
    const vertOffsetDeg = elevToTargetDeg + phys.pitchDeg;
    const rx = clamp(this.headingError / this.fovDeg, -1, 1);
    const ry = clamp(-vertOffsetDeg / this.fovDeg, -1, 1);
    const onScreen = Math.abs(this.headingError) < this.fovDeg && Math.abs(vertOffsetDeg) < this.fovDeg
      && dz * Math.cos((phys.headingDeg * Math.PI) / 180) + dx * Math.sin((phys.headingDeg * Math.PI) / 180) > 0;
    this.reticle = { x: rx, y: ry, onScreen };

    if (scoring) {
      this._scoreSum += this._alignmentQuality(phys) * dt;
      this._scoreT += dt;
    }
  }

  /**
   * 0..1: how close to a perfect bomb run this single frame is. Each factor
   * has its own, more generous falloff than the hard `on*` gates above —
   * being a little off costs a little score, rather than the reticle simply
   * flipping from "aligned" to "not" at the tolerance edge.
   */
  _alignmentQuality(phys) {
    const heading = clamp(1 - Math.abs(this.headingError) / (this.headingTolDeg * 2.5), 0, 1);
    const level = clamp(1 - Math.abs(phys.rollDeg) / (this.bankTolDeg * 2.5), 0, 1)
      * clamp(1 - Math.abs(phys.pitchDeg) / (this.pitchTolDeg * 2.5), 0, 1);
    const [lo, hi] = this.altitudeBand;
    const mid = (lo + hi) / 2;
    const half = (hi - lo) / 2 || 1;
    const altitude = clamp(1 - Math.abs(this.altitudeAgl - mid) / (half * 2.2), 0, 1);
    return heading * 0.45 + level * 0.35 + altitude * 0.2;
  }

  /** Forget the corridor score and hold timer — a fresh bombing attempt. */
  reset() {
    this._scoreSum = 0;
    this._scoreT = 0;
    this._holdT = 0;
    this.readyToRelease = false;
  }
}
