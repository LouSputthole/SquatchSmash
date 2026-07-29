import * as core from './core.js';

// The bed the whole scene sits on: wet street outside, low room tone and
// murmured conversation inside, and everything going muffled and far away once
// the bathroom door shuts.

export class RestaurantAmbience {
  constructor() {
    this.started = false;
    this.outside = 1;   // 0..1 crossfade
    this.muffle = 0;    // 0..1
    this.clinkT = 2;
    this.dripT = 1.5;
    this.hornT = 18;
    this.passT = 3;
  }

  start() {
    if (this.started || !core.isReady()) return;
    this.started = true;

    // Room tone
    this.room = core.noiseLoop({ type: 'lowpass', freq: 340, gain: 0.05, rate: 0.35 });
    // Murmured diners — two bands wobbling against each other
    this.murmurA = core.noiseLoop({ type: 'bandpass', freq: 420, q: 1.6, gain: 0.035, rate: 0.28 });
    this.murmurB = core.noiseLoop({ type: 'bandpass', freq: 780, q: 2.2, gain: 0.022, rate: 0.22 });
    // Street: traffic hiss on wet asphalt
    this.street = core.noiseLoop({ type: 'lowpass', freq: 1500, gain: 0.09, rate: 0.55 });
    this.t = 0;
  }

  // How far inside he is. 1 = on the street, 0 = at the table.
  setOutside(v) {
    this.outside = Math.max(0, Math.min(1, v));
  }

  // 1 once the bathroom door closes behind him.
  setMuffle(v) {
    this.muffle = Math.max(0, Math.min(1, v));
  }

  // A car going by on wet pavement — swells past and away.
  #carPass() {
    const t = core.now();
    core.noise(t, { peak: 0.16 * this.outside, attack: 0.5, decay: 1.1, type: 'lowpass', freq: 1800, rate: 0.9 });
  }

  update(dt) {
    if (!this.started) return;
    this.t += dt;
    const inside = 1 - this.outside;
    const muf = 1 - this.muffle * 0.88;

    this.room.gain.gain.setTargetAtTime(0.05 * inside * muf + 0.012, core.now(), 0.25);
    this.murmurA.gain.gain.setTargetAtTime(0.038 * inside * muf, core.now(), 0.25);
    this.murmurB.gain.gain.setTargetAtTime(0.024 * inside * muf, core.now(), 0.25);
    this.street.gain.gain.setTargetAtTime((0.09 * this.outside + 0.012 * inside) * muf, core.now(), 0.3);
    this.murmurA.filt.frequency.setTargetAtTime(
      (380 + Math.sin(this.t * 0.7) * 90) * (1 - this.muffle * 0.6), core.now(), 0.3
    );
    this.street.filt.frequency.setTargetAtTime(
      (this.outside > 0.5 ? 1700 : 700) * (1 - this.muffle * 0.65), core.now(), 0.3
    );

    // Cutlery, glasses, a kitchen door
    this.clinkT -= dt;
    if (this.clinkT <= 0) {
      this.clinkT = 2.5 + Math.random() * 5;
      if (inside > 0.4) {
        const t = core.now();
        const peak = (0.05 + Math.random() * 0.05) * inside * muf;
        core.tone(t, { type: 'triangle', from: 2100 + Math.random() * 1600, to: 1400, dur: 0.09, peak });
        core.noise(t, { peak: peak * 0.5, attack: 0.002, decay: 0.06, type: 'highpass', freq: 3000 });
      }
    }

    // Water dripping somewhere out of sight
    this.dripT -= dt;
    if (this.dripT <= 0) {
      this.dripT = 1.4 + Math.random() * 2.6;
      if (this.muffle > 0.5) {
        const t = core.now();
        core.tone(t, { type: 'sine', from: 900 + Math.random() * 500, to: 240, dur: 0.11, peak: 0.06 });
      }
    }

    // Traffic on the wet street: a car swelling past, and the odd horn
    if (this.outside > 0.2) {
      this.passT -= dt;
      if (this.passT <= 0) {
        this.passT = 3 + Math.random() * 5;
        this.#carPass();
      }
      this.hornT -= dt;
      if (this.hornT <= 0) {
        this.hornT = 9 + Math.random() * 16;
        const t = core.now();
        core.tone(t, { type: 'sawtooth', from: 320, to: 300, dur: 0.5, peak: 0.035 * this.outside });
        core.tone(t, { type: 'sawtooth', from: 400, to: 378, dur: 0.5, peak: 0.028 * this.outside });
      }
    }
  }
}
