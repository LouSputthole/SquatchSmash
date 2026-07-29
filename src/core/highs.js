/**
 * The other two things on the coffee table.
 *
 * Neither of these costs you Wednesday -- you can be as high as you like and
 * still make the meeting. They are here because they change how the flat
 * feels, and the flat is the game.
 *
 * **Weed** slows everything down. You walk slower, the camera takes longer to
 * catch up with the mouse, the room warms and softens, and the world itself
 * runs at about three quarters speed. Sitting on the couch watching the light
 * move is a genuinely different experience stoned, which is the point.
 *
 * **Mushrooms** do not slow anything. They bend it. The hue rotates, the
 * saturation climbs, the whole frame breathes in and out, and the camera
 * drifts on a slower rhythm than the drink does. It comes up over a couple of
 * minutes rather than landing at once.
 *
 * Both layer on top of `drunk` rather than replacing it, because of course
 * they do.
 */

/** One bowl. Two is noticeably more; four is the whole evening. */
export const BONG_UNITS = 0.34;
/** A cap. There is no sensible second dose and the game does not offer one. */
export const SHROOM_UNITS = 1.0;

/* Per second, each -- same convention as drunk.js. One bowl of weed runs
 * about three and a half minutes; a full dose of mushrooms takes roughly a
 * quarter of an hour to come up, peak and fade, which is short for the real
 * thing and about right for a fifteen-minute day. */
const WEED_DECAY = 0.0016;
const TRIP_DECAY = 0.0011;

/** Mushrooms take a while to arrive. This is how long, in seconds. */
const COME_UP = 95;

export class Highs {
  constructor() {
    /** 0..1, how stoned. */
    this.weed = 0;
    /** 0..1, how far into the trip -- what you have taken. */
    this.dose = 0;
    /** 0..1, how much of it has actually arrived. */
    this.trip = 0;

    this.time = 0;
    this._sinceShrooms = 1e9;
    /* Hue is integrated rather than computed from absolute time. Deriving it
     * from `time` meant that taking mushrooms twenty minutes in snapped the
     * whole screen to whatever colour that moment happened to land on. */
    this._hue = 0;

    /** Added to the camera on top of everything else. */
    this.sway = { yaw: 0, pitch: 0, roll: 0 };
    /** Screen treatment, read by main.js and pushed into CSS. */
    this.hue = 0;
    this.saturate = 1;
    this.breathe = 1;
    this.warmth = 0;
  }

  smokeBong(units = BONG_UNITS) {
    this.weed = Math.min(1, this.weed + units);
  }

  eatShrooms(units = SHROOM_UNITS) {
    this.dose = Math.min(1, this.dose + units);
    this._sinceShrooms = 0;
  }

  /** Everything goes away when you sleep it off. */
  sleepItOff() {
    this.weed = 0;
    this.dose = 0;
    this.trip = 0;
    this._sinceShrooms = 1e9;
    this._hue = 0;
  }

  get stoned() { return this.weed > 0.12; }
  get tripping() { return this.trip > 0.10; }

  /**
   * How much slower the world runs. Weed only -- mushrooms distort time
   * rather than slowing it, and stacking both slowdowns would be unplayable.
   */
  get timeScale() {
    return 1 - this.weed * 0.30;
  }

  /** Walking speed multiplier. */
  get moveScale() {
    return 1 - this.weed * 0.34;
  }

  /** How sluggishly the camera answers the mouse, 0..1. */
  get lookDrag() {
    return this.weed * 0.55;
  }

  update(dt) {
    this.time += dt;
    this._sinceShrooms += dt;

    if (this.weed > 0) this.weed = Math.max(0, this.weed - WEED_DECAY * dt);
    if (this.dose > 0) this.dose = Math.max(0, this.dose - TRIP_DECAY * dt);

    // The come-up: what you took, gated by how long ago you took it.
    const arrived = Math.min(1, this._sinceShrooms / COME_UP);
    // Ease in, so it creeps rather than switching on.
    this.trip = this.dose * arrived * arrived;

    const t = this.time;

    /* ---- camera ----
     * Weed is a slow float. Mushrooms are a wider, slower roll on a rhythm
     * that never quite repeats, which is what makes it read as different
     * from being drunk rather than just more of it. */
    const w = this.weed;
    const p = this.trip;
    this.sway.yaw = Math.sin(t * 0.31) * 0.016 * w
      + (Math.sin(t * 0.23) + Math.sin(t * 0.37 + 1.1)) * 0.020 * p;
    this.sway.pitch = Math.sin(t * 0.27 + 0.8) * 0.013 * w
      + Math.sin(t * 0.19 + 2.2) * 0.024 * p;
    this.sway.roll = Math.sin(t * 0.17) * 0.020 * w
      + Math.sin(t * 0.13 + 0.5) * 0.055 * p;

    /* ---- screen ---- */
    /* Hue rotation turns one way while the trip is on, and unwinds back to
     * normal as it fades -- otherwise the flat is left permanently green
     * after it wears off. Kept inside one turn so the unwind is a short
     * drift back rather than a spin through four full rotations. */
    if (p > 0.02) {
      this._hue = (this._hue + p * 3.5 * dt) % 360;
    } else if (this._hue !== 0) {
      const short = this._hue > 180 ? this._hue - 360 : this._hue;
      this._hue = short - short * Math.min(1, dt * 0.6);
      if (Math.abs(this._hue) < 0.4) this._hue = 0;
    }
    this.hue = this._hue + p * (46 + Math.sin(t * 0.11) * 38);
    this.saturate = 1 + p * 1.9 + w * 0.14;
    /* Contrast pumps with the hue rather than sitting still, which is what
     * stops the whole thing reading as a coloured sheet of glass laid over an
     * ordinary room. */
    this.contrast = 1 + p * (0.34 + Math.sin(t * 0.29) * 0.20);
    this.bright = 1 + p * Math.sin(t * 0.37 + 1.4) * 0.12;
    // The frame breathing. Deliberately slow -- faster reads as a bug.
    this.breathe = 1 + Math.sin(t * 0.42) * 0.030 * p;
    this.warmth = w * 0.5 + p * 0.2;

    /* ---- the colour wash ----
     * A second layer of actual colour rolling across the room, independent of
     * the hue filter underneath it. Two counter-rotating gradients: one broad
     * and slow, one tighter and faster, so the pattern never lands in the same
     * place twice and the walls keep changing their mind. */
    this.wash = Math.min(1, p * 1.15);
    this.washAngle = (t * 11) % 360;
    this.washAngle2 = (360 - (t * 17) % 360);
    this.washHue = (t * 26) % 360;

    /* ---- chromatic aberration ----
     * Splitting the red and blue channels apart is the single thing that most
     * reads as "not right with my eyes" rather than "filter on a photo". It
     * pulses, because a fixed offset just looks like a badly aligned screen. */
    this.split = p * (2.6 + Math.sin(t * 0.53) * 1.9);

    /* ---- weed ----
     * Heavy lids and a soft edge. Where the trip pushes colour outward, this
     * pulls the frame inward: the room is fine, you are just not fully in the
     * room. */
    this.droop = w * (0.55 + Math.sin(t * 0.21) * 0.12);
    this.soften = w * 1.5;
  }
}
