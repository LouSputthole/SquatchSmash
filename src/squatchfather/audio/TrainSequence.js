import * as core from './core.js';

// The elevated line. Intensity ramps from a distant rumble to a roar directly
// overhead — it's the pressure the whole final beat is built on, and the cover
// for what happens under it.
//
// The three beds prefer their recordings (train.elevated.rumble/.roar/.sub)
// as seamless loops; the synth loops stand in until the files decode. Either
// way the SAME rising-gain envelopes drive them — the build is the signature,
// not the source. Clatter and the horn take train.rail.clatter and
// train.horn.far with the synth as fallback.

const LVL = {
  rumble: 0.55,
  roar: 0.5,
  sub: 0.5,
};

export class TrainSequence {
  constructor() {
    this.started = false;
    this.intensity = 0;
    this.target = 0;
    this.clatterT = 0;
    this.t = 0;
  }

  #bed(sampleName, synthFactory) {
    const bed = { name: sampleName, handle: null, isSample: false };
    bed.handle = core.sampleLoop(sampleName, { gain: 0 });
    bed.isSample = !!bed.handle;
    if (!bed.handle && synthFactory) bed.handle = synthFactory();
    return bed;
  }

  #upgrade(bed) {
    if (!bed || bed.isSample) return;
    const gain = bed.handle ? bed.handle.gain.gain.value : 0;
    const up = core.sampleLoop(bed.name, { gain });
    if (!up) return;
    if (bed.handle) {
      try { bed.handle.src.stop(); } catch { /* never started */ }
    }
    bed.handle = up;
    bed.isSample = true;
  }

  // Sub oscillator under the noise so it's felt as much as heard — the
  // stand-in for the recorded sub loop.
  #synthSub() {
    const ctx = core.audioCtx();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 38;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g).connect(core.bus());
    osc.start();
    return { src: osc, filt: null, gain: g, osc };
  }

  start() {
    if (this.started || !core.isReady()) return;
    this.started = true;
    this.beds = {
      rumble: this.#bed('train.elevated.rumble',
        () => core.noiseLoop({ type: 'lowpass', freq: 110, q: 0.9, gain: 0, rate: 0.25 })),
      body: this.#bed('train.elevated.roar',
        () => core.noiseLoop({ type: 'bandpass', freq: 320, q: 0.7, gain: 0, rate: 0.6 })),
      sub: this.#bed('train.elevated.sub', () => this.#synthSub()),
    };
  }

  setIntensity(v) {
    this.target = Math.max(0, Math.min(1, v));
  }

  // Long, flat, and a long way off.
  horn() {
    if (!core.isReady()) return;
    if (core.playSample('train.horn.far', { volume: 0.5, rate: 0.96 + Math.random() * 0.08 })) return;
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

    const { rumble, body, sub } = this.beds;
    for (const bed of [rumble, body, sub]) this.#upgrade(bed);

    if (rumble.isSample) {
      rumble.handle.gain.gain.setTargetAtTime(LVL.rumble * v * v, t, 0.2);
      rumble.handle.filt.frequency.setTargetAtTime(220 + 1400 * v, t, 0.2);
    } else {
      rumble.handle.gain.gain.setTargetAtTime(0.42 * v * v, t, 0.2);
      rumble.handle.filt.frequency.setTargetAtTime(80 + 120 * v, t, 0.2);
    }

    if (body.isSample) {
      body.handle.gain.gain.setTargetAtTime(LVL.roar * v * v * v, t, 0.2);
      body.handle.filt.frequency.setTargetAtTime(400 + 4600 * v, t, 0.2);
    } else {
      body.handle.gain.gain.setTargetAtTime(0.2 * v * v * v, t, 0.2);
      body.handle.filt.frequency.setTargetAtTime(240 + 500 * v, t, 0.2);
    }

    if (sub.isSample) {
      sub.handle.gain.gain.setTargetAtTime(LVL.sub * v * v, t, 0.2);
      // The synth swept 34→50Hz as it arrived; the loop pitches up the same.
      sub.handle.src.playbackRate.setTargetAtTime(0.9 + 0.3 * v, t, 0.3);
    } else {
      sub.handle.gain.gain.setTargetAtTime(0.16 * v * v, t, 0.2);
      sub.handle.osc.frequency.setTargetAtTime(34 + 16 * v, t, 0.3);
    }

    // Wheels over rail joints — faster and louder as it arrives
    if (v > 0.12) {
      this.clatterT -= dt;
      if (this.clatterT <= 0) {
        this.clatterT = 0.34 - 0.2 * v + Math.random() * 0.05;
        if (!core.playSample('train.rail.clatter', {
          volume: 0.7 * v * v, rate: 0.88 + Math.random() * 0.28,
        })) {
          core.noise(t, { peak: 0.1 * v * v, attack: 0.002, decay: 0.07, type: 'bandpass', freq: 900 + Math.random() * 700, q: 1.2 });
          core.noise(t + 0.09, { peak: 0.07 * v * v, attack: 0.002, decay: 0.06, type: 'bandpass', freq: 700, q: 1.2 });
        }
      }
    }
  }
}
