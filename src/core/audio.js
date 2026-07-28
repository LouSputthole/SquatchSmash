/**
 * Audio engine.
 *
 * Two sources of sound:
 *   1. Baked samples in assets/sfx/, generated from ElevenLabs by
 *      `npm run sfx` (see tools/generate-sfx.mjs). Listed in
 *      assets/sfx/manifest.json.
 *   2. A procedural WebAudio fallback for every cue, so the apartment is
 *      fully audible before a single byte has been generated.
 *
 * Cues are addressed by name ("fridge.open"). play() prefers the sample and
 * silently degrades to the synth, which means adding a file to assets/sfx/
 * upgrades the sound with no code change.
 */
import * as THREE from 'three';
import { loadJson, assetUrl } from './assets.js';

const SFX_DIR = 'assets/sfx/';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.buffers = new Map();
    this.loops = new Map();
    this.manifest = { sfx: [] };
    this.loadedCount = 0;
    this._lastStep = 0;
  }

  /** Must be called from a user gesture (browsers block autoplay otherwise). */
  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    // A gentle limiter keeps stacked cues from clipping.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.18;

    this.busSfx = this.ctx.createGain();
    this.busAmb = this.ctx.createGain();
    this.busMusic = this.ctx.createGain();
    this.busSfx.gain.value = 1.0;
    this.busAmb.gain.value = 0.55;
    this.busMusic.gain.value = 0.7;

    // A muffling filter on everything, used when the player is "inside" the
    // arcade game and the room should recede.
    this.duck = this.ctx.createBiquadFilter();
    this.duck.type = 'lowpass';
    this.duck.frequency.value = 20000;

    for (const bus of [this.busSfx, this.busAmb, this.busMusic]) bus.connect(this.duck);
    this.duck.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(this.ctx.destination);

    if (this.ctx.listener.forwardX) {
      this.ctx.listener.forwardX.value = 0;
      this.ctx.listener.forwardY.value = 0;
      this.ctx.listener.forwardZ.value = -1;
      this.ctx.listener.upY.value = 1;
    }
    this.ready = true;
  }

  /**
   * Fetch the cue list and decode the samples that exist on disk.
   *
   * assets/sfx/index.json lists which files have actually been generated, so
   * the common case (no samples yet) costs one request instead of a wall of
   * 404s. `npm run sfx` rewrites it; hand-added files can be listed manually.
   * If the index is missing entirely we fall back to probing every cue.
   */
  async loadManifest() {
    this.manifest = (await loadJson(SFX_DIR, 'manifest.json')) || this.manifest;

    const index = await loadJson(SFX_DIR, 'index.json');
    const available = index ? new Set(index.files || []) : null;

    const cues = this.manifest.sfx || [];
    const wanted = available
      ? cues.filter((cue) => available.has(cue.file || `${cue.name}.mp3`))
      : cues;

    await Promise.all(wanted.map((cue) => this._loadOne(cue)));
    return { total: cues.length, loaded: this.loadedCount };
  }

  async _loadOne(cue) {
    const file = cue.file || `${cue.name}.mp3`;
    try {
      const res = await fetch(assetUrl(SFX_DIR, file), { cache: 'force-cache' });
      if (!res.ok) return;
      const raw = await res.arrayBuffer();
      if (raw.byteLength < 512) return; // placeholder / empty file
      const buf = await this.ctx.decodeAudioData(raw);
      const list = this.buffers.get(cue.name) || [];
      list.push(buf);
      this.buffers.set(cue.name, list);
      this.loadedCount++;
    } catch {
      /* fall back to the synth for this cue */
    }
  }

  /* ---------------------------------------------------------------- */
  /* Playback                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * @param {string} name  cue name, e.g. "fridge.open"
   * @param {object} opts  { volume, rate, position: THREE.Vector3, ref, delay }
   */
  play(name, opts = {}) {
    if (!this.ready) return null;
    const { volume = 1, rate = 1, position = null, delay = 0 } = opts;

    const out = this.ctx.createGain();
    out.gain.value = volume;

    let sink = this.busSfx;
    if (position) {
      const panner = this._makePanner(position, opts.ref ?? 1.4, opts.maxDist ?? 18);
      out.connect(panner);
      panner.connect(sink);
    } else {
      out.connect(sink);
    }

    const when = this.ctx.currentTime + delay;
    const bank = this.buffers.get(name);
    if (bank && bank.length) {
      const src = this.ctx.createBufferSource();
      src.buffer = bank[(Math.random() * bank.length) | 0];
      src.playbackRate.value = rate;
      src.connect(out);
      src.start(when);
      return src;
    }
    synth(this, name, out, when, rate);
    return null;
  }

  /**
   * Say one of the character's lines.
   *
   * Cues are named `vo.<moment>.<n>`; this picks among whichever ones exist,
   * never the same one twice running, and does nothing at all if none of them
   * have been generated yet. There is no procedural fallback on purpose --
   * a synthesised voice would be worse than silence.
   *
   * @param {string} group e.g. 'beer.open'
   * @param {object} opts  { chance, volume, delay }
   */
  say(group, opts = {}) {
    if (!this.ready) return false;
    const { chance = 1, volume = 0.85, delay = 0 } = opts;
    if (chance < 1 && Math.random() > chance) return false;

    let bank = this._voBanks?.get(group);
    if (!bank) {
      bank = [];
      for (const name of this.buffers.keys()) {
        if (name.startsWith(`vo.${group}.`)) bank.push(name);
      }
      bank.sort();
      (this._voBanks ??= new Map()).set(group, bank);
    }
    if (!bank.length) return false;

    // Never the same line twice running -- that is what makes VO feel canned.
    this._voLast ??= new Map();
    let pick = bank[(Math.random() * bank.length) | 0];
    if (bank.length > 1) {
      let guard = 0;
      while (pick === this._voLast.get(group) && guard++ < 8) {
        pick = bank[(Math.random() * bank.length) | 0];
      }
    }
    this._voLast.set(group, pick);

    // One voice at a time. He is not a chorus.
    this._vo?.stop?.();
    this._vo = this.play(pick, { volume, delay });
    return true;
  }

  /** Footsteps get their own entry point so cadence + surface stay in one place. */
  footstep(surface = 'wood', intensity = 1) {
    const now = performance.now();
    if (now - this._lastStep < 140) return;
    this._lastStep = now;
    this.play(`footstep.${surface}`, {
      volume: 0.30 * intensity,
      rate: 0.9 + Math.random() * 0.25,
    });
  }

  _makePanner(position, refDistance, maxDistance) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.maxDistance = maxDistance;
    p.rolloffFactor = 1.4;
    if (p.positionX) {
      p.positionX.value = position.x;
      p.positionY.value = position.y;
      p.positionZ.value = position.z;
    } else {
      p.setPosition(position.x, position.y, position.z);
    }
    return p;
  }

  /* ---------------------------------------------------------------- */
  /* Loops (fridge hum, PC fan, city ambience)                          */
  /* ---------------------------------------------------------------- */

  /**
   * Start a named looping bed. Uses the sample if one was loaded, otherwise a
   * synthesised noise/tone bed. Idempotent per key.
   */
  startLoop(key, opts = {}) {
    if (!this.ready || this.loops.has(key)) return this.loops.get(key);
    const {
      name = key,
      volume = 0.3,
      position = null,
      ambience = false,
      fade = 1.2,
    } = opts;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    const bus = ambience ? this.busAmb : this.busSfx;
    if (position) {
      const panner = this._makePanner(position, opts.ref ?? 1.2, opts.maxDist ?? 14);
      gain.connect(panner);
      panner.connect(bus);
    } else {
      gain.connect(bus);
    }

    let node;
    const bank = this.buffers.get(name);
    if (bank && bank.length) {
      node = this.ctx.createBufferSource();
      node.buffer = bank[0];
      node.loop = true;
      node.connect(gain);
      node.start();
    } else {
      node = synthLoop(this, name, gain);
    }

    gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + fade);
    const handle = { node, gain, volume };
    this.loops.set(key, handle);
    return handle;
  }

  stopLoop(key, fade = 0.5) {
    const h = this.loops.get(key);
    if (!h) return;
    this.loops.delete(key);
    const t = this.ctx.currentTime;
    h.gain.gain.cancelScheduledValues(t);
    h.gain.gain.setValueAtTime(h.gain.gain.value, t);
    h.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => {
      try {
        h.node.stop ? h.node.stop() : h.node.forEach?.((n) => n.stop());
      } catch {
        /* already stopped */
      }
    }, fade * 1000 + 60);
  }

  setLoopVolume(key, v, ramp = 0.3) {
    const h = this.loops.get(key);
    if (!h) return;
    h.volume = v;
    h.gain.gain.linearRampToValueAtTime(v, this.ctx.currentTime + ramp);
  }

  /* ---------------------------------------------------------------- */
  /* Listener + global shaping                                         */
  /* ---------------------------------------------------------------- */

  updateListener(camera) {
    if (!this.ready) return;
    const L = this.ctx.listener;
    const p = camera.getWorldPosition(_v1);
    const q = camera.getWorldQuaternion(_q1);
    const fwd = _v2.set(0, 0, -1).applyQuaternion(q);
    const up = _v3.set(0, 1, 0).applyQuaternion(q);
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setTargetAtTime(p.x, t, 0.02);
      L.positionY.setTargetAtTime(p.y, t, 0.02);
      L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      L.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.setTargetAtTime(up.x, t, 0.02);
      L.upY.setTargetAtTime(up.y, t, 0.02);
      L.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  /** Muffle the room (used while the player is heads-down in the arcade game). */
  setMuffle(on, cutoff = 900) {
    if (!this.ready) return;
    this.duck.frequency.linearRampToValueAtTime(
      on ? cutoff : 20000,
      this.ctx.currentTime + 0.5,
    );
  }

  setMasterVolume(v) {
    if (this.ready) this.master.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.15);
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

/* ------------------------------------------------------------------ */
/* Procedural fallback synthesis                                       */
/* ------------------------------------------------------------------ */

let _noiseBuf = null;
function noiseBuffer(ctx) {
  if (_noiseBuf) return _noiseBuf;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02; // slight brown tilt, easier on the ears
    d[i] = white * 0.7 + last * 3;
  }
  _noiseBuf = buf;
  return buf;
}

/** Filtered noise burst — the workhorse for impacts, rustles and hisses. */
function burst(ctx, dest, t, { dur = 0.2, type = 'bandpass', freq = 900, q = 1, gain = 0.5, sweep = 0, curve = 3 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.15));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + dur + 0.05);
  void curve;
  return g;
}

/** Pitched blip / thump. */
function tone(ctx, dest, t, { freq = 220, to = null, dur = 0.2, gain = 0.3, type = 'sine' }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return g;
}

/**
 * One-shot fallback voices. Each is a rough sketch of the real thing — enough
 * to read as the right object without a sample present.
 */
function synth(engine, name, dest, t, rate = 1) {
  const ctx = engine.ctx;
  const r = (v) => v / rate;

  switch (name) {
    /* -------- movement -------- */
    case 'footstep.wood':
      burst(ctx, dest, t, { dur: r(0.09), type: 'lowpass', freq: 420, gain: 0.5, sweep: 0.4 });
      tone(ctx, dest, t, { freq: 92, to: 55, dur: r(0.07), gain: 0.22, type: 'triangle' });
      break;
    case 'footstep.rug':
      burst(ctx, dest, t, { dur: r(0.11), type: 'lowpass', freq: 240, gain: 0.34, sweep: 0.5 });
      break;
    case 'footstep.tile':
      burst(ctx, dest, t, { dur: r(0.07), type: 'bandpass', freq: 2400, q: 1.6, gain: 0.34 });
      tone(ctx, dest, t, { freq: 150, to: 90, dur: r(0.05), gain: 0.16, type: 'triangle' });
      break;

    /* -------- bed -------- */
    case 'bed.rustle':
      burst(ctx, dest, t, { dur: r(0.75), type: 'bandpass', freq: 2600, q: 0.7, gain: 0.30, sweep: 0.45 });
      break;
    case 'bed.creak':
      tone(ctx, dest, t, { freq: 300, to: 168, dur: r(0.55), gain: 0.11, type: 'sawtooth' });
      burst(ctx, dest, t, { dur: r(0.5), type: 'bandpass', freq: 700, q: 5, gain: 0.09, sweep: 0.6 });
      break;

    /* -------- fridge -------- */
    case 'fridge.open':
      burst(ctx, dest, t, { dur: r(0.30), type: 'lowpass', freq: 900, gain: 0.42, sweep: 0.35 });
      tone(ctx, dest, t + r(0.02), { freq: 140, to: 62, dur: r(0.32), gain: 0.24, type: 'triangle' });
      break;
    case 'fridge.close':
      tone(ctx, dest, t, { freq: 120, to: 44, dur: r(0.26), gain: 0.42, type: 'sine' });
      burst(ctx, dest, t, { dur: r(0.14), type: 'lowpass', freq: 500, gain: 0.34, sweep: 0.3 });
      break;
    case 'fridge.bottles':
      for (let i = 0; i < 4; i++) {
        tone(ctx, dest, t + i * 0.055 * Math.random() + 0.02, {
          freq: 1400 + Math.random() * 900, dur: 0.10, gain: 0.10, type: 'sine',
        });
      }
      break;

    /* -------- beer -------- */
    case 'can.crack':
      burst(ctx, dest, t, { dur: 0.045, type: 'highpass', freq: 3200, gain: 0.55 });
      burst(ctx, dest, t + 0.04, { dur: 0.55, type: 'highpass', freq: 5200, gain: 0.20, sweep: 0.35 });
      break;
    case 'can.sip':
      burst(ctx, dest, t, { dur: 0.42, type: 'bandpass', freq: 620, q: 1.4, gain: 0.24, sweep: 1.7 });
      break;
    case 'can.set':
      tone(ctx, dest, t, { freq: 520, to: 300, dur: 0.10, gain: 0.24, type: 'triangle' });
      burst(ctx, dest, t, { dur: 0.06, type: 'bandpass', freq: 2600, q: 2, gain: 0.18 });
      break;
    case 'can.crush':
      burst(ctx, dest, t, { dur: 0.34, type: 'bandpass', freq: 2100, q: 0.8, gain: 0.42, sweep: 0.4 });
      break;

    /* -------- switches, doors, knobs -------- */
    case 'switch.click':
    case 'radio.click':
    case 'ui.select':
      tone(ctx, dest, t, { freq: 1500, to: 700, dur: 0.035, gain: 0.30, type: 'square' });
      burst(ctx, dest, t, { dur: 0.03, type: 'highpass', freq: 4200, gain: 0.22 });
      break;
    case 'ui.hover':
      tone(ctx, dest, t, { freq: 900, dur: 0.03, gain: 0.09, type: 'sine' });
      break;

    /* -------- station stings -------- */
    case 'radio.airhorn':
      for (let i = 0; i < 3; i++) {
        tone(ctx, dest, t + i * 0.015, { freq: 415 + i * 3, dur: 0.7, gain: 0.14, type: 'sawtooth' });
      }
      break;
    case 'radio.riff':
      // Four power chords and an eagle, approximately.
      for (let i = 0; i < 4; i++) {
        const f = [110, 110, 147, 165][i];
        tone(ctx, dest, t + i * 0.19, { freq: f, dur: 0.20, gain: 0.20, type: 'sawtooth' });
        tone(ctx, dest, t + i * 0.19, { freq: f * 1.5, dur: 0.20, gain: 0.13, type: 'square' });
      }
      tone(ctx, dest, t + 0.80, { freq: 2600, to: 1500, dur: 0.42, gain: 0.11, type: 'sawtooth' });
      break;
    case 'radio.jingle':
      [523, 659, 784, 1047].forEach((f, i) => {
        tone(ctx, dest, t + i * 0.11, { freq: f, dur: 0.24, gain: 0.13, type: 'triangle' });
      });
      break;
    case 'radio.slots':
      for (let i = 0; i < 10; i++) {
        tone(ctx, dest, t + i * 0.075, { freq: 1400 + (i % 3) * 260, dur: 0.05, gain: 0.10, type: 'square' });
      }
      break;
    case 'radio.kazoo':
      // Serious news music, derailed.
      tone(ctx, dest, t, { freq: 196, dur: 0.34, gain: 0.14, type: 'sawtooth' });
      [392, 440, 349, 392].forEach((f, i) => {
        tone(ctx, dest, t + 0.36 + i * 0.14, { freq: f, dur: 0.16, gain: 0.15, type: 'square' });
      });
      break;
    case 'radio.crowd':
      burst(ctx, dest, t, { dur: 1.1, type: 'bandpass', freq: 900, q: 0.8, gain: 0.14 });
      break;
    case 'radio.ident.squatch':
      tone(ctx, dest, t, { freq: 147, dur: 0.5, gain: 0.17, type: 'sawtooth' });
      tone(ctx, dest, t + 0.5, { freq: 220, to: 110, dur: 0.7, gain: 0.15, type: 'sawtooth' });
      break;
    case 'radio.ident.uncle':
      [262, 330, 392, 523, 392].forEach((f, i) => {
        tone(ctx, dest, t + i * 0.16, { freq: f, dur: 0.3, gain: 0.11, type: 'sine' });
      });
      break;
    case 'radio.ident.ksqch':
      // A garage-band station sting: one chord, one cymbal, done.
      [147, 185, 220].forEach((f) => {
        tone(ctx, dest, t, { freq: f, dur: 0.85, gain: 0.11, type: 'sawtooth' });
      });
      burst(ctx, dest, t, { dur: 0.9, type: 'highpass', freq: 6200, gain: 0.13, sweep: 0.5 });
      break;
    case 'door.locked':
      tone(ctx, dest, t, { freq: 210, to: 150, dur: 0.13, gain: 0.34, type: 'square' });
      tone(ctx, dest, t + 0.16, { freq: 200, to: 145, dur: 0.13, gain: 0.28, type: 'square' });
      break;
    case 'door.knob':
      burst(ctx, dest, t, { dur: 0.16, type: 'bandpass', freq: 1700, q: 2.2, gain: 0.26, sweep: 0.6 });
      break;
    case 'window.blinds':
      for (let i = 0; i < 12; i++) {
        burst(ctx, dest, t + i * 0.028, { dur: 0.04, type: 'bandpass', freq: 2600 + Math.random() * 1600, q: 3, gain: 0.13 });
      }
      break;
    case 'frame.adjust':
      burst(ctx, dest, t, { dur: 0.13, type: 'bandpass', freq: 1200, q: 2, gain: 0.16, sweep: 0.7 });
      break;
    case 'clock.tick':
      burst(ctx, dest, t, { dur: 0.02, type: 'highpass', freq: 5000, gain: 0.14 });
      break;

    /* -------- computer -------- */
    case 'pc.boot':
      tone(ctx, dest, t, { freq: 180, to: 480, dur: 1.1, gain: 0.16, type: 'sawtooth' });
      tone(ctx, dest, t + 0.55, { freq: 660, dur: 0.16, gain: 0.14, type: 'sine' });
      tone(ctx, dest, t + 0.72, { freq: 880, dur: 0.30, gain: 0.14, type: 'sine' });
      break;
    case 'pc.keyboard':
      tone(ctx, dest, t, { freq: 1900 + Math.random() * 700, to: 900, dur: 0.028, gain: 0.16, type: 'square' });
      break;
    case 'pc.mouseclick':
      tone(ctx, dest, t, { freq: 2600, to: 1300, dur: 0.018, gain: 0.20, type: 'square' });
      break;
    case 'chair.sit':
      burst(ctx, dest, t, { dur: 0.36, type: 'lowpass', freq: 620, gain: 0.30, sweep: 0.35 });
      tone(ctx, dest, t, { freq: 130, to: 70, dur: 0.3, gain: 0.14, type: 'triangle' });
      break;
    case 'chair.roll':
      burst(ctx, dest, t, { dur: 0.5, type: 'bandpass', freq: 380, q: 0.9, gain: 0.20 });
      break;
    /* -------- Counter-Squatch -------- */
    case 'cs.round':
      // The round-start bell, pitched slightly wrong.
      tone(ctx, dest, t, { freq: 880, to: 880, dur: 0.10, gain: 0.12, type: 'square' });
      tone(ctx, dest, t + 0.13, { freq: 1170, to: 1170, dur: 0.10, gain: 0.12, type: 'square' });
      tone(ctx, dest, t + 0.26, { freq: 1480, to: 1400, dur: 0.30, gain: 0.13, type: 'square' });
      break;
    case 'cs.shot':
      burst(ctx, dest, t, { dur: 0.10, type: 'highpass', freq: 1700, gain: 0.34, sweep: 0.7 });
      tone(ctx, dest, t, { freq: 220, to: 60, dur: 0.09, gain: 0.24, type: 'square' });
      break;
    case 'cs.death':
      // Their shot, then yours ending.
      burst(ctx, dest, t, { dur: 0.13, type: 'highpass', freq: 1300, gain: 0.42, sweep: 0.8 });
      tone(ctx, dest, t, { freq: 170, to: 40, dur: 0.22, gain: 0.30, type: 'sawtooth' });
      tone(ctx, dest, t + 0.16, { freq: 300, to: 96, dur: 0.75, gain: 0.16, type: 'triangle' });
      break;

    case 'bong.bubble':
      // Water pulling through the stem: a low burble that climbs as the
      // chamber fills, then stops dead on the pull.
      burst(ctx, dest, t, { dur: 1.5, type: 'lowpass', freq: 420, gain: 0.26, sweep: 1.6 });
      burst(ctx, dest, t, { dur: 1.5, type: 'bandpass', freq: 900, q: 2.4, gain: 0.16, sweep: 1.9 });
      tone(ctx, dest, t, { freq: 92, to: 148, dur: 1.4, gain: 0.09, type: 'sine' });
      break;

    case 'couch.sit':
      // Soft cushion compressing: a broad muffled whump, no gas cylinder.
      burst(ctx, dest, t, { dur: 0.52, type: 'lowpass', freq: 380, gain: 0.34, sweep: 0.5 });
      tone(ctx, dest, t, { freq: 96, to: 52, dur: 0.42, gain: 0.16, type: 'sine' });
      burst(ctx, dest, t + 0.10, { dur: 0.30, type: 'bandpass', freq: 1900, q: 0.7, gain: 0.09 });
      break;

    /* -------- cigarettes -------- */
    case 'cig.pack':
      burst(ctx, dest, t, { dur: 0.18, type: 'bandpass', freq: 3400, q: 1.1, gain: 0.22, sweep: 0.6 });
      burst(ctx, dest, t + 0.22, { dur: 0.26, type: 'highpass', freq: 4600, gain: 0.16 });
      break;
    case 'cig.light':
      // Two dry flint scrapes, then the flame catching.
      burst(ctx, dest, t, { dur: 0.07, type: 'bandpass', freq: 2800, q: 1.4, gain: 0.30 });
      burst(ctx, dest, t + 0.20, { dur: 0.07, type: 'bandpass', freq: 3100, q: 1.4, gain: 0.32 });
      burst(ctx, dest, t + 0.30, { dur: 0.55, type: 'lowpass', freq: 1500, gain: 0.20, sweep: 0.45 });
      break;
    case 'cig.drag':
      // Airy inhale with paper crackle riding on top.
      burst(ctx, dest, t, { dur: 1.15, type: 'bandpass', freq: 900, q: 0.7, gain: 0.24, sweep: 1.9 });
      for (let i = 0; i < 9; i++) {
        burst(ctx, dest, t + 0.1 + Math.random() * 0.9, {
          dur: 0.02, type: 'highpass', freq: 5200, gain: 0.05 + Math.random() * 0.05,
        });
      }
      break;
    case 'cig.exhale':
      burst(ctx, dest, t, { dur: 1.5, type: 'lowpass', freq: 1200, gain: 0.26, sweep: 0.35 });
      burst(ctx, dest, t + 0.06, { dur: 1.3, type: 'bandpass', freq: 620, q: 0.5, gain: 0.14, sweep: 0.5 });
      break;
    case 'cig.stub':
      burst(ctx, dest, t, { dur: 0.34, type: 'bandpass', freq: 2200, q: 0.9, gain: 0.20, sweep: 0.5 });
      tone(ctx, dest, t, { freq: 480, to: 300, dur: 0.09, gain: 0.10, type: 'triangle' });
      break;

    /* -------- farts --------
     * Seven variants, all built from a buzzy sawtooth whose pitch wobbles,
     * gated by a filtered noise puff. Crude, but so is the subject.
     */
    case 'fart.1': case 'fart.2': case 'fart.3':
    case 'fart.4': case 'fart.5': case 'fart.6': case 'fart.7': {
      const v = Number(name.slice(-1));
      const dur = [0, 0.34, 0.95, 0.26, 1.10, 0.42, 1.55, 0.20][v];
      const f0 = [0, 118, 74, 260, 96, 150, 62, 205][v];
      const f1 = [0, 62, 44, 150, 70, 58, 36, 90][v];
      const wob = [0, 22, 14, 46, 34, 26, 10, 30][v];

      const o = ctx.createOscillator();
      o.type = v === 3 || v === 7 ? 'square' : 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(24, f1), t + dur);

      // Wobble gives it the flutter; a stuttering one is gated harder.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = v === 4 ? 19 : v === 6 ? 5.5 : 11;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = wob;
      lfo.connect(lfoGain);
      lfoGain.connect(o.frequency);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(v === 3 ? 2600 : 900, t);
      lp.frequency.exponentialRampToValueAtTime(v === 3 ? 900 : 260, t + dur);
      lp.Q.value = 6;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.42, t + 0.02);
      if (v === 4) {
        // Sputter: chop the tail into bursts.
        for (let i = 0; i < 5; i++) {
          g.gain.setValueAtTime(0.42, t + 0.06 + i * 0.19);
          g.gain.exponentialRampToValueAtTime(0.05, t + 0.16 + i * 0.19);
        }
      }
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      o.connect(lp); lp.connect(g); g.connect(dest);
      o.start(t); o.stop(t + dur + 0.05);
      lfo.start(t); lfo.stop(t + dur + 0.05);

      if (v === 5) burst(ctx, dest, t, { dur, type: 'bandpass', freq: 700, q: 1.4, gain: 0.14, sweep: 0.4 });
      break;
    }

    /* -------- zyns -------- */
    case 'zyn.tin':
      burst(ctx, dest, t, { dur: 0.10, type: 'bandpass', freq: 3200, q: 2.2, gain: 0.22, sweep: 1.4 });
      tone(ctx, dest, t + 0.09, { freq: 1500, to: 800, dur: 0.04, gain: 0.20, type: 'square' });
      break;
    case 'zyn.pack':
      tone(ctx, dest, t, { freq: 900, to: 420, dur: 0.05, gain: 0.14, type: 'sine' });
      burst(ctx, dest, t, { dur: 0.07, type: 'bandpass', freq: 1800, q: 1.6, gain: 0.09 });
      break;

    /* -------- neighbours -------- */
    case 'neighbours.argue': {
      // Two muffled voices through a wall: bandpassed noise pulsed into
      // syllables, so it reads as speech without being any actual words.
      const syllables = 4 + ((Math.random() * 4) | 0);
      const low = Math.random() < 0.5;
      let at = t;
      for (let i = 0; i < syllables; i++) {
        const len = 0.10 + Math.random() * 0.16;
        burst(ctx, dest, at, {
          dur: len, type: 'bandpass',
          freq: (low ? 300 : 520) * (0.85 + Math.random() * 0.5),
          q: 3.5, gain: 0.16 + Math.random() * 0.12, sweep: 0.7 + Math.random() * 0.5,
        });
        at += len + 0.03 + Math.random() * 0.09;
      }
      break;
    }
    case 'neighbours.thump':
      tone(ctx, dest, t, { freq: 74, to: 38, dur: 0.30, gain: 0.42, type: 'sine' });
      burst(ctx, dest, t, { dur: 0.18, type: 'lowpass', freq: 190, gain: 0.20, sweep: 0.4 });
      break;

    /* -------- the other thing -------- */
    case 'poop.1': case 'poop.2': case 'poop.3': case 'poop.4': {
      const v = Number(name.slice(-1));
      const dur = [0, 0.55, 1.05, 0.35, 1.45][v];
      // Low wet burble: a wobbling saw through a tight lowpass.
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(46, t + dur);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7 + v * 2;
      const lg = ctx.createGain();
      lg.gain.value = 20;
      lfo.connect(lg); lg.connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 5;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.30, t + 0.05);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g2); g2.connect(dest);
      o.start(t); o.stop(t + dur + 0.05);
      lfo.start(t); lfo.stop(t + dur + 0.05);
      burst(ctx, dest, t, { dur, type: 'lowpass', freq: 700, gain: 0.14, sweep: 0.4 });
      break;
    }
    case 'toilet.plop':
      tone(ctx, dest, t, { freq: 620, to: 150, dur: 0.13, gain: 0.30, type: 'sine' });
      burst(ctx, dest, t + 0.10, { dur: 0.30, type: 'bandpass', freq: 1400, q: 1.2, gain: 0.10, sweep: 0.5 });
      break;
    case 'belly.rumble':
      tone(ctx, dest, t, { freq: 58, to: 34, dur: 1.6, gain: 0.30, type: 'sine' });
      burst(ctx, dest, t, { dur: 1.6, type: 'lowpass', freq: 300, q: 4, gain: 0.22, sweep: 0.5 });
      burst(ctx, dest, t + 0.6, { dur: 0.9, type: 'bandpass', freq: 180, q: 6, gain: 0.14, sweep: 1.6 });
      break;

    /* -------- bathroom -------- */
    case 'pee.zip':
      burst(ctx, dest, t, { dur: 0.16, type: 'bandpass', freq: 2400, q: 1.2, gain: 0.26, sweep: 2.4 });
      break;
    case 'toilet.flush':
      burst(ctx, dest, t, { dur: 2.4, type: 'lowpass', freq: 1400, gain: 0.42, sweep: 0.28 });
      tone(ctx, dest, t, { freq: 210, to: 90, dur: 1.6, gain: 0.10, type: 'sine' });
      burst(ctx, dest, t + 2.2, { dur: 1.6, type: 'bandpass', freq: 700, q: 0.8, gain: 0.16, sweep: 1.4 });
      break;
    case 'sink.tap':
      burst(ctx, dest, t, { dur: 2.6, type: 'bandpass', freq: 2000, q: 0.6, gain: 0.22 });
      break;

    /* -------- whiskey -------- */
    case 'whiskey.cap':
      burst(ctx, dest, t, { dur: 0.22, type: 'bandpass', freq: 2600, q: 3, gain: 0.20, sweep: 1.5 });
      tone(ctx, dest, t + 0.20, { freq: 900, to: 520, dur: 0.05, gain: 0.12, type: 'square' });
      break;
    case 'whiskey.pour': {
      // Glugs: a few descending blips as the neck clears.
      for (let i = 0; i < 5; i++) {
        const at = t + i * 0.14;
        tone(ctx, dest, at, { freq: 420 - i * 34, to: 210 - i * 20, dur: 0.10, gain: 0.20, type: 'sine' });
        burst(ctx, dest, at, { dur: 0.09, type: 'bandpass', freq: 1500, q: 1.4, gain: 0.10 });
      }
      break;
    }
    case 'whiskey.swig':
      burst(ctx, dest, t, { dur: 0.36, type: 'bandpass', freq: 500, q: 1.6, gain: 0.24, sweep: 1.9 });
      tone(ctx, dest, t + 0.05, { freq: 190, to: 120, dur: 0.20, gain: 0.12, type: 'sine' });
      break;
    case 'whiskey.gasp':
      // Sharp hiss in through the teeth, then a low shudder.
      burst(ctx, dest, t, { dur: 0.55, type: 'highpass', freq: 3600, gain: 0.24, sweep: 0.55 });
      tone(ctx, dest, t + 0.30, { freq: 150, to: 92, dur: 0.45, gain: 0.14, type: 'triangle' });
      break;

    /* -------- intoxication -------- */
    case 'drunk.hiccup':
      tone(ctx, dest, t, { freq: 260, to: 620, dur: 0.06, gain: 0.28, type: 'triangle' });
      tone(ctx, dest, t + 0.05, { freq: 500, to: 180, dur: 0.13, gain: 0.22, type: 'sine' });
      burst(ctx, dest, t, { dur: 0.05, type: 'bandpass', freq: 1400, q: 2, gain: 0.10 });
      break;
    case 'drunk.collapse':
      tone(ctx, dest, t, { freq: 90, to: 38, dur: 0.55, gain: 0.50, type: 'sine' });
      burst(ctx, dest, t, { dur: 0.36, type: 'lowpass', freq: 380, gain: 0.34, sweep: 0.3 });
      burst(ctx, dest, t + 0.16, { dur: 0.28, type: 'lowpass', freq: 260, gain: 0.18, sweep: 0.4 });
      break;
    case 'drunk.heartbeat':
      // Two thumps per beat, four beats, slowing down.
      for (let i = 0; i < 4; i++) {
        const b = t + i * 0.86 + i * i * 0.05;
        tone(ctx, dest, b, { freq: 62, to: 34, dur: 0.24, gain: 0.42, type: 'sine' });
        tone(ctx, dest, b + 0.24, { freq: 54, to: 30, dur: 0.20, gain: 0.26, type: 'sine' });
      }
      break;
    case 'drunk.snore':
      tone(ctx, dest, t, { freq: 74, to: 108, dur: 1.1, gain: 0.22, type: 'sawtooth' });
      burst(ctx, dest, t, { dur: 1.1, type: 'lowpass', freq: 420, q: 3, gain: 0.20, sweep: 1.6 });
      burst(ctx, dest, t + 1.25, { dur: 0.8, type: 'lowpass', freq: 300, gain: 0.12, sweep: 0.6 });
      break;

    /* -------- radio -------- */
    case 'radio.tune':
      burst(ctx, dest, t, { dur: 0.5, type: 'bandpass', freq: 2400, q: 4, gain: 0.20, sweep: 0.25 });
      break;

    /* -------- arcade -------- */
    case 'arcade.hit':
      tone(ctx, dest, t, { freq: 320, to: 60, dur: 0.16, gain: 0.42, type: 'square' });
      burst(ctx, dest, t, { dur: 0.13, type: 'lowpass', freq: 1500, gain: 0.34, sweep: 0.25 });
      break;
    case 'arcade.miss':
      tone(ctx, dest, t, { freq: 260, to: 150, dur: 0.13, gain: 0.20, type: 'triangle' });
      break;
    case 'arcade.roar':
      tone(ctx, dest, t, { freq: 130, to: 62, dur: 0.85, gain: 0.30, type: 'sawtooth' });
      burst(ctx, dest, t, { dur: 0.85, type: 'lowpass', freq: 800, q: 2, gain: 0.24, sweep: 0.4 });
      break;
    case 'arcade.combo':
      tone(ctx, dest, t, { freq: 700 * rate, dur: 0.09, gain: 0.20, type: 'square' });
      tone(ctx, dest, t + 0.07, { freq: 1050 * rate, dur: 0.11, gain: 0.18, type: 'square' });
      break;
    case 'arcade.golden':
      for (let i = 0; i < 5; i++) {
        tone(ctx, dest, t + i * 0.06, { freq: 700 + i * 220, dur: 0.12, gain: 0.16, type: 'sine' });
      }
      break;
    case 'arcade.hurt':
      tone(ctx, dest, t, { freq: 400, to: 90, dur: 0.42, gain: 0.34, type: 'sawtooth' });
      break;
    case 'arcade.wave':
      tone(ctx, dest, t, { freq: 440, dur: 0.16, gain: 0.18, type: 'square' });
      tone(ctx, dest, t + 0.14, { freq: 660, dur: 0.16, gain: 0.18, type: 'square' });
      tone(ctx, dest, t + 0.28, { freq: 880, dur: 0.30, gain: 0.20, type: 'square' });
      break;
    case 'arcade.gameover':
      tone(ctx, dest, t, { freq: 440, to: 220, dur: 0.3, gain: 0.22, type: 'square' });
      tone(ctx, dest, t + 0.3, { freq: 330, to: 165, dur: 0.3, gain: 0.22, type: 'square' });
      tone(ctx, dest, t + 0.6, { freq: 220, to: 82, dur: 0.9, gain: 0.24, type: 'square' });
      break;

    default:
      // Unknown cue: a soft neutral tick rather than silence, which makes
      // missing wiring obvious during development without being ugly.
      tone(ctx, dest, t, { freq: 800, dur: 0.03, gain: 0.06, type: 'sine' });
  }
}

/** Looping fallback beds. Returns a node (or array of nodes) with stop(). */
function synthLoop(engine, name, dest) {
  const ctx = engine.ctx;
  const nodes = [];

  const noise = (filterType, freq, q, gain) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start();
    nodes.push(src);
    return { f, g };
  };

  const osc = (type, freq, gain) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g);
    g.connect(dest);
    o.start();
    nodes.push(o);
    return o;
  };

  switch (name) {
    case 'fridge.hum':
      osc('sine', 60, 0.35);
      osc('sine', 120.6, 0.12); // slight detune gives the compressor its beat
      noise('bandpass', 340, 1.2, 0.10);
      break;
    case 'pc.fan':
      noise('lowpass', 620, 0.8, 0.30);
      osc('sine', 47, 0.10);
      break;
    case 'ambience.city':
      noise('lowpass', 380, 0.6, 0.42);
      noise('bandpass', 1100, 0.4, 0.08);
      break;
    case 'ambience.city.day':
      // Busier and brighter: traffic plus a hint of everything else.
      noise('lowpass', 520, 0.6, 0.44);
      noise('bandpass', 1500, 0.4, 0.14);
      noise('highpass', 3600, 0.4, 0.05);
      break;
    case 'ambience.city.night':
      // Sparser, further away, with a thin high shimmer for the crickets.
      noise('lowpass', 240, 0.7, 0.34);
      noise('bandpass', 620, 0.5, 0.07);
      noise('bandpass', 5200, 8, 0.05);
      break;
    case 'ambience.room':
      noise('lowpass', 180, 0.5, 0.24);
      break;
    case 'radio.static':
      noise('bandpass', 1800, 0.7, 0.30);
      noise('highpass', 4000, 0.5, 0.10);
      break;
    case 'radio.talk':
      // Somebody talking two rooms away: speech-band noise with the
      // consonants filtered off, so you hear that it is a voice, not what
      // it is saying. The words are on screen instead.
      noise('bandpass', 480, 1.6, 0.30);
      noise('bandpass', 1250, 2.4, 0.16);
      noise('lowpass', 220, 0.7, 0.10);
      break;
    case 'pee.stream':
      // Splashing water: bright filtered noise with a low burble under it.
      noise('bandpass', 2600, 0.8, 0.34);
      noise('bandpass', 900, 1.4, 0.20);
      noise('lowpass', 260, 0.7, 0.14);
      break;
    default:
      noise('lowpass', 400, 0.5, 0.12);
  }

  return {
    stop() {
      for (const n of nodes) {
        try { n.stop(); } catch { /* already stopped */ }
      }
    },
  };
}
