/**
 * Time of day.
 *
 * One in-game day is 15 real minutes, so an in-game hour is 37.5 seconds and
 * the light is always visibly moving. Everything that depends on the hour --
 * sun angle and colour, ambient fill, fog, which city ambience is playing,
 * whether the lamps should be on -- reads from here rather than keeping its
 * own idea of the time.
 *
 * Lighting is a keyframe table interpolated by hour. Adding a moment to the
 * day means adding a row, not editing code.
 */
import * as THREE from 'three';

export const DAY_MINUTES = 24 * 60;
/** A whole day, in real seconds. */
export const REAL_SECONDS_PER_DAY = 15 * 60;
/** In-game minutes per real second. */
const RATE = DAY_MINUTES / REAL_SECONDS_PER_DAY;

/** Hour boundaries for the four named phases. */
const DAWN_START = 5;
const DAY_START = 7.5;
const DUSK_START = 19;
const NIGHT_START = 21;

/**
 * Keyframes round the clock. `sun` is the key light (the sun by day, the moon
 * at night); `hemi`/`amb` are the fill; `sky` names the backdrop painting.
 * Interpolated circularly, so 23:00 blends into 00:00.
 */
const KEYS = [
  {
    h: 0, sky: 'night',
    sun: { i: 0.22, c: 0x7d95d8 }, hemi: { i: 0.30, sky: 0x2b3557, ground: 0x0d0f16 },
    amb: { i: 0.16, c: 0x44506e }, fog: 0x070a12, fill: 0.14, exposure: 1.30,
  },
  {
    h: 5, sky: 'night',
    sun: { i: 0.26, c: 0x8fa4dd }, hemi: { i: 0.34, sky: 0x33405f, ground: 0x111219 },
    amb: { i: 0.20, c: 0x4c587a }, fog: 0x0a0e18, fill: 0.18, exposure: 1.28,
  },
  {
    h: 6.5, sky: 'dawn',
    sun: { i: 1.55, c: 0xffb478 }, hemi: { i: 0.75, sky: 0x6d7d9e, ground: 0x352a20 },
    amb: { i: 0.42, c: 0x8d94a8 }, fog: 0x1b1a22, fill: 0.50, exposure: 1.18,
  },
  {
    h: 9, sky: 'day',
    sun: { i: 2.10, c: 0xfff0d6 }, hemi: { i: 1.05, sky: 0x9db8dc, ground: 0x4a4036 },
    amb: { i: 0.52, c: 0xa8b4c8 }, fog: 0x38414f, fill: 0.62, exposure: 1.05,
  },
  {
    h: 13, sky: 'day',
    sun: { i: 2.30, c: 0xfffaf0 }, hemi: { i: 1.20, sky: 0xa9c4e8, ground: 0x54493d },
    amb: { i: 0.58, c: 0xb2becf }, fog: 0x475060, fill: 0.68, exposure: 1.00,
  },
  {
    h: 17, sky: 'day',
    sun: { i: 1.70, c: 0xffe2b4 }, hemi: { i: 0.98, sky: 0x9bb2d4, ground: 0x4e4234 },
    amb: { i: 0.50, c: 0xa6b0c2 }, fog: 0x3c4453, fill: 0.58, exposure: 1.06,
  },
  {
    h: 19.8, sky: 'dusk',
    sun: { i: 0.90, c: 0xff9a52 }, hemi: { i: 0.62, sky: 0x6a5a72, ground: 0x2e2420 },
    amb: { i: 0.34, c: 0x7d7288 }, fog: 0x241c26, fill: 0.40, exposure: 1.16,
  },
  {
    h: 21.5, sky: 'night',
    sun: { i: 0.24, c: 0x8298d8 }, hemi: { i: 0.32, sky: 0x2d3859, ground: 0x0e1017 },
    amb: { i: 0.18, c: 0x47536f }, fog: 0x080b14, fill: 0.16, exposure: 1.30,
  },
];

export class DayNight {
  /** @param {number} startHour e.g. 6.07 for 06:04 */
  constructor(startHour = 6 + 4 / 60) {
    this.minutes = startHour * 60;
    this.day = 1;
    /** Real seconds the player has been in the apartment. */
    this.elapsedReal = 0;

    this.sunPos = new THREE.Vector3();
    this.sunColour = new THREE.Color();
    this.hemiSky = new THREE.Color();
    this.hemiGround = new THREE.Color();
    this.ambColour = new THREE.Color();
    this.fogColour = new THREE.Color();
    this.sunIntensity = 0;
    this.hemiIntensity = 0;
    this.ambIntensity = 0;
    this.fillIntensity = 0;
    this.exposure = 1;

    /** 0 at deep night, 1 at midday. Drives ambience mixing. */
    this.dayness = 0;
    this.skyFrom = 'night';
    this.skyTo = 'night';
    this.skyBlend = 0;

    this.phase = 'night';
    this.onPhaseChange = null;
    this.onHour = null;
    this._lastHour = -1;

    this._recompute();
  }

  get hour() { return this.minutes / 60; }

  /** "06:04" */
  get clock() {
    const h = Math.floor(this.hour) % 24;
    const m = Math.floor(this.minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** "6:04 AM" */
  get clock12() {
    const h24 = Math.floor(this.hour) % 24;
    const m = String(Math.floor(this.minutes % 60)).padStart(2, '0');
    const h = h24 % 12 || 12;
    return `${h}:${m} ${h24 < 12 ? 'AM' : 'PM'}`;
  }

  get isDark() {
    return this.hour >= DUSK_START || this.hour < DAWN_START + 1.2;
  }

  /** Jump the clock forward, e.g. after passing out. */
  skipHours(n) {
    this.minutes += n * 60;
    while (this.minutes >= DAY_MINUTES) {
      this.minutes -= DAY_MINUTES;
      this.day++;
    }
    this._lastHour = -1;
    this._recompute();
  }

  update(dt) {
    this.elapsedReal += dt;
    this.minutes += dt * RATE;
    if (this.minutes >= DAY_MINUTES) {
      this.minutes -= DAY_MINUTES;
      this.day++;
    }

    const h = Math.floor(this.hour);
    if (h !== this._lastHour) {
      this._lastHour = h;
      this.onHour?.(h, this.day);
    }

    const phase = this.hour < DAWN_START ? 'night'
      : this.hour < DAY_START ? 'dawn'
        : this.hour < DUSK_START ? 'day'
          : this.hour < NIGHT_START ? 'dusk' : 'night';
    if (phase !== this.phase) {
      const prev = this.phase;
      this.phase = phase;
      this.onPhaseChange?.(phase, prev);
    }

    this._recompute();
  }

  _recompute() {
    const h = this.hour;

    // Bracketing keyframes, wrapping round midnight.
    let a = KEYS[KEYS.length - 1];
    let b = KEYS[0];
    for (let i = 0; i < KEYS.length; i++) {
      const cur = KEYS[i];
      const next = KEYS[(i + 1) % KEYS.length];
      const hi = next.h > cur.h ? next.h : next.h + 24;
      const hh = h >= cur.h ? h : h + 24;
      if (hh >= cur.h && hh < hi) { a = cur; b = next; break; }
    }
    const span = (b.h > a.h ? b.h : b.h + 24) - a.h;
    const at = (h >= a.h ? h : h + 24) - a.h;
    const t = span > 0 ? smooth(at / span) : 0;

    this.sunIntensity = lerp(a.sun.i, b.sun.i, t);
    this.sunColour.setHex(a.sun.c).lerp(_tmpC.setHex(b.sun.c), t);
    this.hemiIntensity = lerp(a.hemi.i, b.hemi.i, t);
    this.hemiSky.setHex(a.hemi.sky).lerp(_tmpC.setHex(b.hemi.sky), t);
    this.hemiGround.setHex(a.hemi.ground).lerp(_tmpC.setHex(b.hemi.ground), t);
    this.ambIntensity = lerp(a.amb.i, b.amb.i, t);
    this.ambColour.setHex(a.amb.c).lerp(_tmpC.setHex(b.amb.c), t);
    this.fogColour.setHex(a.fog).lerp(_tmpC.setHex(b.fog), t);
    this.fillIntensity = lerp(a.fill, b.fill, t);
    this.exposure = lerp(a.exposure, b.exposure, t);

    this.skyFrom = a.sky;
    this.skyTo = b.sky;
    this.skyBlend = a.sky === b.sky ? 1 : t;

    // Where the key light sits. The sun tracks east to west across the day;
    // after dark a moon takes over from the north-west so the room is never
    // pitch black, just unhelpfully lit.
    if (h >= DAWN_START && h < NIGHT_START) {
      const arc = ((h - 6) / 12) * Math.PI;
      this.sunPos.set(Math.cos(arc) * 12, Math.max(0.4, Math.sin(arc) * 8.5), -3.1);
    } else {
      this.sunPos.set(-7.5, 6.5, -4.5);
    }

    // Midday is 1, deep night is 0, with the shoulders following the sun.
    this.dayness = clamp01((this.sunIntensity - 0.24) / (2.1 - 0.24));
  }
}

const _tmpC = new THREE.Color();
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
