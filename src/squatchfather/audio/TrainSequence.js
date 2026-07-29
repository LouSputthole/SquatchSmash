import * as core from './core.js';

// The elevated line. Intensity ramps from a distant rumble to a roar directly
// overhead — it's the pressure the whole final beat is built on, and the cover
// for what happens under it.

export class TrainSequence {
  constructor() {
    this.started = false;
    this.intensity = 0;
    this.target = 0;
    this.clatterT = 0;
    this.t = 0;
  }

  start() {
    if (this.started || !core.isReady()) return;
    this.started = true;
    this.rumble = core.noiseLoop({ type: 'lowpass', freq: 110, q: 0.9, gain: 0, rate: 0.25 });
    this.body = core.noiseLoop({ type: 'bandpass', freq: 320, q: 0.7, gain: 0, rate: 0.6 });

    // Sub oscillator under the noise so it's felt as much as heard
    const ctx = core.audioCtx();
    this.sub = ctx.createOscillator();
    this.sub.type = 'sine';
    this.sub.frequency.value = 38;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    this.sub.connect(this.subGain).connect(core.bus());
    this.sub.start();
  }

  setIntensity(v) {
    this.target = Math.max(0, Math.min(1, v));
  }

  // Long, flat, and a long way off.
  horn() {
    if (!core.isReady()) return;
    const t = core.now();
    for (const [f, p] of [[196, 0.11], [233, 0.09], [294, 0.06]]) {
      core.tone(t, { type: 'sawtooth', from: f, to: f * 0.97, dur: 1.5, peak: p });
    }
  }

  update(dt) {
    if (!this.started) return;
    this.t += dt;
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 0.9);
    const v = this.intensity;
    const t = core.now();

    this.rumble.gain.gain.setTargetAtTime(0.42 * v * v, t, 0.2);
    this.rumble.filt.frequency.setTargetAtTime(80 + 120 * v, t, 0.2);
    this.body.gain.gain.setTargetAtTime(0.2 * v * v * v, t, 0.2);
    this.body.filt.frequency.setTargetAtTime(240 + 500 * v, t, 0.2);
    this.subGain.gain.setTargetAtTime(0.16 * v * v, t, 0.2);
    this.sub.frequency.setTargetAtTime(34 + 16 * v, t, 0.3);

    // Wheels over rail joints — faster and louder as it arrives
    if (v > 0.12) {
      this.clatterT -= dt;
      if (this.clatterT <= 0) {
        this.clatterT = 0.34 - 0.2 * v + Math.random() * 0.05;
        core.noise(t, { peak: 0.1 * v * v, attack: 0.002, decay: 0.07, type: 'bandpass', freq: 900 + Math.random() * 700, q: 1.2 });
        core.noise(t + 0.09, { peak: 0.07 * v * v, attack: 0.002, decay: 0.06, type: 'bandpass', freq: 700, q: 1.2 });
      }
    }
  }
}
