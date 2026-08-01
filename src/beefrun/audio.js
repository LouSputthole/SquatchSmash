/**
 * The Beef Run's sound.
 *
 * One-shots and the room keep the apartment AudioEngine's cue names, playback,
 * and synth fallback. BeefAudioEngine only narrows which recorded samples are
 * decoded for this page. What the apartment has no need for is sound that never
 * stops and never repeats: two piston engines whose pitch is an RPM readout,
 * airframe wind that is an airspeed readout, and rain.
 *
 * So those are built here as live graphs on the engine's own AudioContext and
 * bussed through it, which means one mute switch, one limiter, and one
 * listener still control everything.
 */
import { AudioEngine } from '../core/audio.js';
import { isBundled, loadJson } from '../core/assets.js';
import { loadOnceRetriable } from '../core/load-queue.js';
import { clamp, lerp } from './util.js';

const MAX_RPM = 2450;
const SFX_DIR = 'assets/sfx/';

/* One-off recordings shared with the apartment that Beef Run calls by name.
 * Keeping this list beside the scene-specific engine makes an accidental new
 * cue visible in review instead of quietly re-expanding the resident bank to
 * the whole campaign. */
export const BEEF_SHARED_CUES = new Set([
  'gun.dry',
  'neighbours.thump',
  'switch.click',
  'gun.impact',
  'can.set',
  'pc.boot',
  'can.crack',
  'gun.shot',
  'can.crush',
  'glue.slip',
  'ui.select',
  'frame.adjust',
  'door.knob',
  'closet.slide',
]);

/** Recorded cues that the airstrip page can request. */
export function isBeefPreloadCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  return !!name && (
    name.startsWith('vo.beefrun.')
    || name.startsWith('beefrun.')
    || name.startsWith('footstep.')
    || name.startsWith('ambience.')
    || BEEF_SHARED_CUES.has(name)
  );
}

/**
 * Keep the shared playback/synthesis behavior while decoding only recordings
 * that this self-contained mission can use.
 */
export class BeefAudioEngine extends AudioEngine {
  loadManifest() {
    return loadOnceRetriable(this, '_manifestLoadPromise', () => this._loadBeefManifestOnce());
  }

  async _loadBeefManifestOnce() {
    this.manifest = (await loadJson(SFX_DIR, 'manifest.json')) || this.manifest;
    const cues = this.manifest.sfx || [];
    let availableCues;

    if (isBundled()) {
      availableCues = cues.filter((cue) => /^data:/.test(cue.file || ''));
    } else {
      const index = await loadJson(SFX_DIR, 'index.json');
      const available = index ? new Set(index.files || []) : null;
      this._fileVersions = index?.versions || {};
      availableCues = available
        ? cues.filter((cue) => available.has(cue.file || `${cue.name}.mp3`))
        : cues;
    }

    const wanted = availableCues.filter(isBeefPreloadCue);
    this.preloadStats = {
      manifestTotal: cues.length,
      selected: wanted.length,
    };
    await this._loadWanted(wanted);
    return { total: wanted.length, loaded: this.loadedCount };
  }
}

export class MissionAudio {
  constructor(engine) {
    this.engine = engine;      // AudioEngine from src/core/audio.js
    this.ready = false;
    this.headset = false;
    this.nodes = null;
    this.music = null;
    this.phase = null;
    this._musicTimer = null;
    this._step = 0;
  }

  get ctx() { return this.engine?.ctx; }

  /** Called after AudioEngine.init(), from the same user gesture. */
  init() {
    const ctx = this.ctx;
    if (!ctx || this.ready) return;

    const bus = this.engine.busSfx;

    // ---- Two engines ----
    const engines = [];
    for (let i = 0; i < 2; i++) {
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) pan.pan.value = i === 0 ? -0.55 : 0.55;
      const out = ctx.createGain();
      out.gain.value = 0;

      // Firing order: a sawtooth an octave apart from a square, both driven
      // from one frequency so a rough engine detunes as a unit.
      const fund = ctx.createOscillator();
      fund.type = 'sawtooth';
      fund.frequency.value = 30;
      const growl = ctx.createOscillator();
      growl.type = 'square';
      growl.frequency.value = 15;
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.5;
      const growlGain = ctx.createGain();
      growlGain.gain.value = 0.34;

      // Prop wash: filtered noise whose corner rises with RPM.
      const noise = ctx.createBufferSource();
      noise.buffer = makeNoise(ctx);
      noise.loop = true;
      const noiseFilt = ctx.createBiquadFilter();
      noiseFilt.type = 'bandpass';
      noiseFilt.frequency.value = 240;
      noiseFilt.Q.value = 0.7;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.5;

      // The body of the aeroplane between the engine and the ear.
      const body = ctx.createBiquadFilter();
      body.type = 'lowpass';
      body.frequency.value = 1400;
      body.Q.value = 0.6;

      fund.connect(oscGain).connect(body);
      growl.connect(growlGain).connect(body);
      noise.connect(noiseFilt).connect(noiseGain).connect(body);
      body.connect(out);
      if (pan) out.connect(pan).connect(bus);
      else out.connect(bus);

      fund.start();
      growl.start();
      noise.start();
      engines.push({ fund, growl, noise, noiseFilt, out, body, rough: 0 });
    }

    // ---- Airframe wind ----
    const wind = ctx.createBufferSource();
    wind.buffer = makeNoise(ctx);
    wind.loop = true;
    const windFilt = ctx.createBiquadFilter();
    windFilt.type = 'bandpass';
    windFilt.frequency.value = 600;
    windFilt.Q.value = 0.4;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilt).connect(windGain).connect(bus);
    wind.start();

    // ---- Rain on the airframe ----
    const rain = ctx.createBufferSource();
    rain.buffer = makeNoise(ctx);
    rain.loop = true;
    const rainFilt = ctx.createBiquadFilter();
    rainFilt.type = 'highpass';
    rainFilt.frequency.value = 2600;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rain.connect(rainFilt).connect(rainGain).connect(bus);
    rain.start();

    // ---- Stall horn: a reed that only ever plays one note ----
    const horn = ctx.createOscillator();
    horn.type = 'square';
    horn.frequency.value = 780;
    const hornFilt = ctx.createBiquadFilter();
    hornFilt.type = 'bandpass';
    hornFilt.frequency.value = 900;
    hornFilt.Q.value = 2.2;
    const hornGain = ctx.createGain();
    hornGain.gain.value = 0;
    horn.connect(hornFilt).connect(hornGain).connect(bus);
    horn.start();

    this.nodes = { engines, windGain, windFilt, rainGain, hornGain, horn };
    this.ready = true;
  }

  /** Left/right engine state, straight off EngineSystem. */
  setEngine(i, { rpm, running, roughness = 0, health = 1 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const e = this.nodes.engines[i];
    const t = ctx.currentTime;
    const frac = clamp(rpm / MAX_RPM, 0, 1.2);
    // Two cylinders firing per revolution, transposed into something audible.
    const base = 22 + frac * 78;
    const detune = roughness * (Math.random() - 0.5) * 14;
    e.fund.frequency.setTargetAtTime(base + detune, t, 0.05);
    e.growl.frequency.setTargetAtTime(base * 0.5 + detune * 0.4, t, 0.06);
    e.noiseFilt.frequency.setTargetAtTime(180 + frac * 1500, t, 0.06);
    e.body.frequency.setTargetAtTime(
      (this.headset ? 900 : 1600) + frac * 900,
      t, 0.12,
    );
    const level = running ? lerp(0.06, 0.2, frac) * lerp(0.6, 1, health) : (rpm > 60 ? 0.03 : 0);
    e.out.gain.setTargetAtTime(level, t, 0.08);
  }

  /** Wind noise tracks airspeed; it is also the cue that a stall is coming. */
  setAirspeed(tas) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const v = clamp(tas / 90, 0, 1.2);
    this.nodes.windGain.gain.setTargetAtTime(v * v * 0.16, t, 0.15);
    this.nodes.windFilt.frequency.setTargetAtTime(320 + v * 1400, t, 0.15);
  }

  setRain(amount) {
    if (!this.ready) return;
    this.nodes.rainGain.gain.setTargetAtTime(clamp(amount, 0, 1) * 0.09, this.ctx.currentTime, 0.6);
  }

  setStallHorn(on) {
    if (!this.ready) return;
    this.nodes.hornGain.gain.setTargetAtTime(on ? 0.05 : 0, this.ctx.currentTime, on ? 0.02 : 0.12);
  }

  /**
   * Inside the aeroplane everything gets duller and the voices come through an
   * intercom instead of across a windy apron.
   */
  setHeadset(on) {
    this.headset = on;
    this.engine?.setMuffle?.(on, 2200);
  }

  /** One-shots, by cue name. Falls through to the engine's synth. */
  play(name, opts) {
    this.engine?.play(name, opts);
  }

  /**
   * A spoken line, if that exact line has been recorded.
   *
   * `say()` has no procedural fallback on purpose, so an unrecorded line shows
   * on screen and plays nothing — which is the whole mission today. The cue is
   * per line rather than per speaker so that when a clip does exist, the words
   * coming out match the words on screen.
   */
  line(line) {
    const cue = line.cue ?? `beefrun.${String(line.who || 'sasole').toLowerCase()}`;
    this.engine?.say(cue, { chance: 1, volume: this.headset ? 0.9 : 1 });
  }

  /* ---------------------------------------------------------------- */
  /* Music                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * The score is a step sequencer, the same shape as the campground game's:
   * a bar of sixteenths, a bass line, a lead phrase, and drums, with a
   * different pattern per phase of the mission. It starts almost empty at the
   * airport and drops out entirely on the last approach.
   */
  setPhase(name) {
    if (this.phase === name) return;
    this.phase = name;
    if (!this.ready) return;
    if (name === 'silent' || !PHASES[name]) {
      this.stopMusic();
      return;
    }
    this.startMusic();
  }

  startMusic() {
    if (this._musicTimer || !this.ready) return;
    const ctx = this.ctx;
    let next = ctx.currentTime + 0.12;
    this._step = 0;
    this._musicTimer = setInterval(() => {
      const phase = PHASES[this.phase];
      if (!phase || !this.ctx) return;
      const step = 60 / phase.bpm / 4;      // sixteenths
      while (next < this.ctx.currentTime + 0.35) {
        this.tick(next, phase, this._step);
        next += step;
        this._step++;
      }
    }, 90);
  }

  stopMusic() {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
  }

  tick(t, phase, step) {
    const ctx = this.ctx;
    const bus = this.engine.busMusic;
    const s16 = step % 16;
    const s64 = step % 64;

    if (phase.kick?.includes(s16)) drum(ctx, bus, t, 120, 42, 0.16 * phase.gain, 0.2);
    if (phase.snare?.includes(s16)) noiseHit(ctx, bus, t, 1900, 0.9, 0.07 * phase.gain, 0.13);
    if (phase.hat?.includes(s16)) noiseHit(ctx, bus, t, 8000, 0.7, 0.02 * phase.gain, 0.035, 'highpass');
    if (phase.shaker && s16 % 2 === 1) noiseHit(ctx, bus, t, 6000, 0.6, 0.012 * phase.gain, 0.05, 'highpass');

    const bass = phase.bass?.[step % phase.bass.length];
    if (bass) pluck(ctx, bus, t, bass, 0.09 * phase.gain, phase.bassType || 'square', 0.36);

    const lead = phase.lead?.[s64];
    if (lead) pluck(ctx, bus, t, lead, 0.055 * phase.gain, phase.leadType || 'triangle', 0.5, phase.echo);

    if (phase.brass && phase.brass[s64]) {
      pluck(ctx, bus, t, phase.brass[s64], 0.07 * phase.gain, 'sawtooth', 0.55);
    }
  }

  /** The end-card sting: triumphant, and slightly cheap. */
  sting() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const bus = this.engine.busMusic;
    const t = ctx.currentTime;
    [220, 277, 330, 440].forEach((f, i) => {
      pluck(ctx, bus, t + i * 0.11, f, 0.13, 'sawtooth', 0.34);
      pluck(ctx, bus, t + i * 0.11, f * 2, 0.06, 'square', 0.3);
    });
    pluck(ctx, bus, t + 0.5, 587, 0.14, 'sawtooth', 0.7);
  }

  dispose() {
    this.stopMusic();
  }
}

/* ------------------------------------------------------------------ */
/* Score data                                                          */
/* ------------------------------------------------------------------ */

const N = {
  E1: 41.2, G1: 49, A1: 55, B1: 61.7, D2: 73.4, E2: 82.4, G2: 98, A2: 110, B2: 123.5,
  D3: 146.8, E3: 164.8, G3: 196, A3: 220, B3: 246.9, D4: 293.7, E4: 329.6, G4: 392,
};

const PHASES = {
  // Whispering Pines: a guitar figure, a shaker, and nothing else.
  airport: {
    bpm: 88, gain: 0.55, shaker: true,
    kick: [0, 8],
    bass: [N.E2, 0, 0, 0, 0, 0, N.B1, 0, N.G2, 0, 0, 0, 0, 0, N.D2, 0],
    lead: { 0: N.E3, 6: N.G3, 12: N.B3, 22: N.A3, 32: N.E3, 44: N.D3 },
    leadType: 'triangle', echo: true,
  },
  // First takeoff: the bass arrives and does not leave.
  takeoff: {
    bpm: 108, gain: 0.8,
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14],
    bass: [N.E2, 0, N.E2, 0, N.G2, 0, N.E2, 0, N.A2, 0, N.G2, 0, N.E2, 0, N.D2, 0],
    lead: { 32: N.E4, 36: N.G4, 42: N.E4, 48: N.B3, 56: N.A3 },
  },
  // Southbound: breezy, slightly pleased with itself.
  south: {
    bpm: 102, gain: 0.62, shaker: true,
    kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14],
    bass: [N.A2, 0, 0, N.A2, 0, N.G2, 0, 0, N.E2, 0, 0, N.E2, 0, N.D2, 0, 0],
    lead: { 0: N.A3, 8: N.B3, 16: N.D4, 26: N.B3, 40: N.G3, 52: N.E3 },
    leadType: 'triangle', echo: true,
  },
  // Into the valley: the pleased-with-itself part stops.
  approach: {
    bpm: 96, gain: 0.7,
    kick: [0, 6, 10], hat: [3, 7, 11, 15],
    bass: [N.E1, 0, 0, 0, 0, 0, 0, 0, N.G1, 0, 0, 0, 0, 0, N.E1, 0],
    lead: { 16: N.E3, 30: N.D3, 48: N.B2 },
    leadType: 'sawtooth',
  },
  // The strip: percussion and something low with a valve in it.
  loading: {
    bpm: 94, gain: 0.62, shaker: true,
    kick: [0, 3, 8, 11], snare: [12],
    bass: [N.A1, 0, 0, N.A1, 0, 0, N.E2, 0, N.A1, 0, 0, N.A1, 0, N.G1, 0, 0],
    brass: { 0: N.A3, 12: N.E3, 32: N.G3, 44: N.A3 },
  },
  // Home, heavy, and in a hurry.
  ret: {
    bpm: 118, gain: 0.78,
    kick: [0, 3, 6, 8, 11, 14], snare: [4, 12], hat: [2, 6, 10, 14],
    bass: [N.E2, N.E2, 0, N.E2, 0, N.G2, 0, N.E2, N.A2, 0, N.A2, 0, N.B2, 0, N.G2, 0],
    lead: { 32: N.B3, 38: N.A3, 44: N.G3, 52: N.E3, 60: N.D3 },
  },
  // Being followed.
  chase: {
    bpm: 138, gain: 0.9,
    kick: [0, 2, 4, 6, 8, 10, 12, 14], snare: [4, 12], hat: [1, 3, 5, 7, 9, 11, 13, 15],
    bass: [N.E2, N.E2, N.E2, 0, N.E2, N.E2, N.G2, 0, N.E2, N.E2, N.E2, 0, N.D2, 0, N.B1, 0],
    bassType: 'sawtooth',
    lead: { 0: N.E4, 4: N.G4, 8: N.E4, 12: N.B3, 32: N.E4, 40: N.A3, 48: N.G3 },
    leadType: 'sawtooth',
  },
};

/* ------------------------------------------------------------------ */
/* Small synth helpers                                                 */
/* ------------------------------------------------------------------ */

let _noise = null;
function makeNoise(ctx) {
  if (_noise && _noise.sampleRate === ctx.sampleRate) return _noise;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = white * 0.7 + last * 3;
  }
  _noise = buf;
  return buf;
}

function drum(ctx, dest, t, from, to, gain, dur) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noiseHit(ctx, dest, t, freq, q, gain, dur, type = 'bandpass') {
  const src = ctx.createBufferSource();
  src.buffer = makeNoise(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t);
  src.stop(t + dur + 0.05);
}

function pluck(ctx, dest, t, freq, gain, type, dur, echo = false) {
  const voices = echo ? [[0, gain], [0.21, gain * 0.38]] : [[0, gain]];
  for (const [delay, level] of voices) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.max(freq * 6, 700), t + delay);
    f.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.6, 240), t + delay + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(Math.max(level, 0.0002), t + delay + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    o.connect(f).connect(g).connect(dest);
    o.start(t + delay);
    o.stop(t + delay + dur + 0.05);
  }
}
