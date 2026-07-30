// Procedural audio for THE JERKY MOTEL — humid, cheap, tense.
// Same WebAudio-only approach as the campground scene: no asset files.

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

// Ambience nodes (started once, gain-tweened by tension)
let amb = null;
let tension = 0;         // 0..1, drives the bass pulse and the room falling away
let musicTimer = null;
let musicStep = 0;
let musicMode = 'none';  // 'none' | 'tense' | 'fight' | 'chase'

export function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  const len = ctx.sampleRate * 1.5;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  loadSamples([
    'car.engine.start', 'car.engine.idle', 'car.engine.rev',
    'car.tire.skid', 'car.horn', 'car.impact.metal', 'gun.shot',
  ]);
}

// ---------- Recorded samples ----------
// Preferred when decoded; every caller keeps its synth fallback, so nothing
// in the scene depends on the files existing.
const samples = new Map();

function loadSamples(names) {
  for (const name of names) {
    if (samples.has(name)) continue;
    samples.set(name, null);
    fetch(`assets/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => samples.set(name, decoded))
      .catch(() => samples.delete(name));
  }
}

function playSample(name, { volume = 1, rate = 1 } = {}) {
  const buf = samples.get(name);
  if (!buf || !ctx) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(master);
  src.start();
  return true;
}

// The drive scene's engine: the recorded start, then a looped idle whose
// pitch follows road speed.
let engineLoop = null;

function startEngineIdle(delay = 0) {
  const buf = samples.get('car.engine.idle');
  if (!buf || engineLoop) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = 0.3;
  src.connect(g).connect(master);
  src.start(ctx.currentTime + delay);
  engineLoop = { src, g };
}

export function setEngineSpeed(k) {
  if (!engineLoop) return;
  const t = ctx.currentTime;
  engineLoop.src.playbackRate.setTargetAtTime(0.85 + 0.55 * k, t, 0.15);
  engineLoop.g.gain.setTargetAtTime(0.28 + 0.22 * k, t, 0.2);
}

export function stopEngine() {
  if (!engineLoop) return;
  const { src, g } = engineLoop;
  engineLoop = null;
  g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  setTimeout(() => { try { src.stop(); } catch { /* stopped */ } }, 1200);
}

export function resume() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 1;
}

export function isMuted() {
  return muted;
}

function env(gainNode, t0, peak, attack, decay) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function noise(t0, { peak = 0.3, attack = 0.005, decay = 0.15, type = 'lowpass', freq = 800, q = 1 } = {}) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, peak, attack, decay);
  src.connect(filt).connect(g).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + attack + decay + 0.05);
}

function tone(t0, { type = 'sine', from = 90, to = 40, dur = 0.2, peak = 0.4 } = {}) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
  const g = ctx.createGain();
  env(g, t0, peak, 0.008, dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// ---------- Ambience: the motel itself ----------
// A continuous bed of neon buzz, an air-conditioner rattle and a room tone.
// Gains are cross-faded as tension rises so the world falls away and the
// bathroom starts to stand out.

export function startAmbience() {
  if (!ctx || amb) return;
  const now = ctx.currentTime;

  const mk = (nodeChain, gainValue) => {
    const g = ctx.createGain();
    g.gain.value = gainValue;
    nodeChain.connect(g).connect(master);
    return g;
  };

  // Neon sign: 60Hz-ish hum with a thin harmonic
  const hum = ctx.createOscillator();
  hum.type = 'sawtooth';
  hum.frequency.value = 61;
  const humFilt = ctx.createBiquadFilter();
  humFilt.type = 'lowpass';
  humFilt.frequency.value = 420;
  hum.connect(humFilt);
  const humGain = mk(humFilt, 0.028);
  hum.start(now);

  // Air conditioner: filtered noise loop with a slow rattle tremolo
  const acSrc = ctx.createBufferSource();
  acSrc.buffer = noiseBuf;
  acSrc.loop = true;
  const acFilt = ctx.createBiquadFilter();
  acFilt.type = 'lowpass';
  acFilt.frequency.value = 620;
  acSrc.connect(acFilt);
  const acGain = mk(acFilt, 0.05);
  const rattle = ctx.createOscillator();
  rattle.type = 'sine';
  rattle.frequency.value = 5.5;
  const rattleAmt = ctx.createGain();
  rattleAmt.gain.value = 0.014;
  rattle.connect(rattleAmt).connect(acGain.gain);
  acSrc.start(now);
  rattle.start(now);

  // Distant traffic / night air
  const airSrc = ctx.createBufferSource();
  airSrc.buffer = noiseBuf;
  airSrc.loop = true;
  airSrc.playbackRate.value = 0.35;
  const airFilt = ctx.createBiquadFilter();
  airFilt.type = 'bandpass';
  airFilt.frequency.value = 240;
  airFilt.Q.value = 0.5;
  airSrc.connect(airFilt);
  const airGain = mk(airFilt, 0.035);
  airSrc.start(now);

  // Tension bass pulse — silent until the suspicion meter climbs
  const pulse = ctx.createOscillator();
  pulse.type = 'sine';
  pulse.frequency.value = 41.2; // low E
  const pulseGain = mk(pulse, 0.0);
  pulse.start(now);
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 1.1;
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.value = 0.05;
  lfo.connect(lfoAmt).connect(pulseGain.gain);
  lfo.start(now);

  amb = { hum, humGain, acGain, airGain, pulseGain, lfo, lfoAmt, nodes: [hum, acSrc, rattle, airSrc, pulse, lfo] };
}

export function stopAmbience() {
  if (!amb) return;
  for (const n of amb.nodes) {
    try { n.stop(); } catch { /* already stopped */ }
  }
  amb = null;
}

// k: 0..1 — how close the room is to going bad.
export function setTension(k) {
  tension = Math.max(0, Math.min(1, k));
  if (!amb || !ctx) return;
  const t = ctx.currentTime;
  amb.pulseGain.gain.setTargetAtTime(0.02 + tension * 0.1, t, 0.4);
  amb.lfoAmt.gain.setTargetAtTime(0.03 + tension * 0.06, t, 0.4);
  amb.lfo.frequency.setTargetAtTime(1.0 + tension * 1.6, t, 0.6); // heartbeat speeds up
  amb.airGain.gain.setTargetAtTime(0.035 * (1 - tension * 0.8), t, 0.8);
  amb.acGain.gain.setTargetAtTime(0.05 * (1 - tension * 0.55), t, 0.8);
}

// ---------- One-shots ----------

export function knock() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    tone(t + i * 0.19, { type: 'sine', from: 150, to: 60, dur: 0.09, peak: 0.32 });
    noise(t + i * 0.19, { peak: 0.16, attack: 0.002, decay: 0.07, freq: 900, type: 'bandpass', q: 1.4 });
  }
}

export function doorOpen() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.1, attack: 0.03, decay: 0.35, freq: 700, type: 'bandpass', q: 1.2 });
  tone(t, { type: 'triangle', from: 210, to: 160, dur: 0.3, peak: 0.05 });
}

export function doorSlam() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 130, to: 38, dur: 0.24, peak: 0.5 });
  noise(t, { peak: 0.32, attack: 0.002, decay: 0.2, freq: 500, type: 'lowpass' });
}

export function lockClick() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.2, attack: 0.001, decay: 0.04, freq: 2600, type: 'bandpass', q: 3 });
  tone(t + 0.05, { type: 'square', from: 420, to: 300, dur: 0.05, peak: 0.06 });
}

export function punch(heavy = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: heavy ? 150 : 120, to: 40, dur: 0.16, peak: heavy ? 0.5 : 0.34 });
  noise(t, { peak: heavy ? 0.32 : 0.2, attack: 0.002, decay: 0.14, freq: 420, type: 'lowpass' });
  noise(t + 0.01, { peak: 0.09, attack: 0.002, decay: 0.07, freq: 2200, type: 'bandpass', q: 2 });
}

export function whiff() {
  if (!ctx) return;
  noise(ctx.currentTime, { peak: 0.1, attack: 0.02, decay: 0.12, freq: 1100, type: 'bandpass', q: 2 });
}

export function bodyFall() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 95, to: 30, dur: 0.3, peak: 0.34 });
  noise(t, { peak: 0.22, attack: 0.004, decay: 0.26, freq: 340, type: 'lowpass' });
}

export function glassSmash() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.3, attack: 0.001, decay: 0.35, freq: 5200, type: 'highpass' });
  for (let i = 0; i < 6; i++) {
    tone(t + i * 0.045, { type: 'triangle', from: 2400 + Math.random() * 2600, to: 1200, dur: 0.09, peak: 0.05 });
  }
}

export function woodBreak() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.28, attack: 0.002, decay: 0.16, freq: 1500, type: 'bandpass', q: 0.8 });
  tone(t, { type: 'triangle', from: 240, to: 70, dur: 0.12, peak: 0.16 });
}

export function gunshot() {
  if (!ctx) return;
  if (playSample('gun.shot', { volume: 0.9 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'square', from: 320, to: 40, dur: 0.12, peak: 0.4 });
  noise(t, { peak: 0.55, attack: 0.001, decay: 0.18, freq: 1800, type: 'highpass' });
  noise(t + 0.02, { peak: 0.3, attack: 0.004, decay: 0.4, freq: 420, type: 'lowpass' }); // room slap
}

export function sliceWhir() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.linearRampToValueAtTime(520, t + 0.5);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 1400;
  filt.Q.value = 3;
  const g = ctx.createGain();
  env(g, t, 0.07, 0.12, 0.7);
  osc.connect(filt).connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 1.0);
}

export function tvStatic() {
  if (!ctx) return;
  noise(ctx.currentTime, { peak: 0.09, attack: 0.02, decay: 0.6, freq: 3000, type: 'highpass' });
}

export function packaging() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 5; i++) {
    noise(t + i * 0.04 + Math.random() * 0.02, {
      peak: 0.07, attack: 0.001, decay: 0.05, freq: 4200, type: 'highpass',
    });
  }
}

export function chew() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    noise(t + i * 0.16, { peak: 0.05, attack: 0.01, decay: 0.1, freq: 700, type: 'lowpass' });
  }
}

export function iceDrop() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 4; i++) {
    tone(t + i * 0.06 + Math.random() * 0.03, {
      type: 'triangle', from: 900 + Math.random() * 700, to: 400, dur: 0.07, peak: 0.05,
    });
  }
}

export function plumbing() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 180, to: 120, dur: 0.9, peak: 0.05 });
  noise(t, { peak: 0.05, attack: 0.2, decay: 0.8, freq: 900, type: 'bandpass', q: 1.5 });
}

export function knifeTap() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    tone(t + i * 0.22, { type: 'square', from: 1500, to: 1400, dur: 0.03, peak: 0.05 });
  }
}

export function siren(far = true) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const peak = far ? 0.035 : 0.11;
  osc.frequency.setValueAtTime(far ? 620 : 780, t);
  for (let i = 0; i < 4; i++) {
    osc.frequency.linearRampToValueAtTime(far ? 820 : 1080, t + i * 0.9 + 0.45);
    osc.frequency.linearRampToValueAtTime(far ? 620 : 780, t + i * 0.9 + 0.9);
  }
  const g = ctx.createGain();
  env(g, t, peak, 0.4, 3.4);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 4.0);
}

export function carStart() {
  if (!ctx) return;
  if (playSample('car.engine.start', { volume: 0.8 })) {
    startEngineIdle(2.4);
    return;
  }
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    tone(t + i * 0.13, { type: 'sawtooth', from: 60, to: 110, dur: 0.11, peak: 0.14 });
  }
  tone(t + 0.42, { type: 'sawtooth', from: 90, to: 150, dur: 0.5, peak: 0.12 });
}

export function tires() {
  if (!ctx) return;
  if (playSample('car.tire.skid', { volume: 0.55 })) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.2, attack: 0.02, decay: 0.7, freq: 2400, type: 'bandpass', q: 1.2 });
  tone(t, { type: 'sawtooth', from: 420, to: 260, dur: 0.6, peak: 0.06 });
}

export function crash() {
  if (!ctx) return;
  if (playSample('car.impact.metal', { volume: 0.85 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 110, to: 30, dur: 0.4, peak: 0.5 });
  noise(t, { peak: 0.4, attack: 0.002, decay: 0.4, freq: 900, type: 'lowpass' });
  noise(t + 0.03, { peak: 0.2, attack: 0.002, decay: 0.3, freq: 5000, type: 'highpass' });
}

// Heavy sasquatch footfall. The surface changes the filter, not the weight.
const STEP_SURFACES = {
  concrete: { freq: 520, peak: 0.13, tone: 72 },
  carpet: { freq: 260, peak: 0.09, tone: 62 },
  tile: { freq: 1400, peak: 0.12, tone: 88 },
  asphalt: { freq: 700, peak: 0.12, tone: 68 },
  pool: { freq: 1000, peak: 0.14, tone: 80 },
  stairs: { freq: 900, peak: 0.15, tone: 96 },
};

export function step(surface = 'concrete') {
  if (!ctx) return;
  const s = STEP_SURFACES[surface] || STEP_SURFACES.concrete;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: s.tone, to: s.tone * 0.5, dur: 0.1, peak: s.peak });
  noise(t, { peak: s.peak * 0.6, attack: 0.002, decay: 0.08, freq: s.freq, type: 'lowpass' });
}

// Take-off and landing. `hard` is a big drop from the balcony or into the pool.
export function land(hard = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: hard ? 110 : 80, to: 26, dur: hard ? 0.34 : 0.16, peak: hard ? 0.5 : 0.2 });
  noise(t, { peak: hard ? 0.3 : 0.12, attack: 0.002, decay: hard ? 0.3 : 0.12, freq: 420, type: 'lowpass' });
}

// Two large bodies wrestling over a suitcase.
export function grapple() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.16, attack: 0.02, decay: 0.22, freq: 900, type: 'bandpass', q: 0.8 });
  tone(t, { type: 'sine', from: 130, to: 90, dur: 0.2, peak: 0.16 });
}

// A jar of classified seasoning going into somebody's eyes.
export function spice() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.22, attack: 0.004, decay: 0.4, freq: 3400, type: 'highpass' });
  tone(t, { type: 'triangle', from: 620, to: 240, dur: 0.2, peak: 0.08 });
}

// A television taking a man and dying.
export function tvBreak() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'square', from: 900, to: 90, dur: 0.24, peak: 0.22 });
  noise(t, { peak: 0.34, attack: 0.001, decay: 0.5, freq: 4200, type: 'highpass' });
  noise(t + 0.05, { peak: 0.2, attack: 0.01, decay: 0.6, freq: 500, type: 'lowpass' });
}

// Ceiling fan overspeeding, then throwing sparks.
export function sparks() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 7; i++) {
    noise(t + i * 0.09 + Math.random() * 0.05, {
      peak: 0.12, attack: 0.001, decay: 0.06, freq: 5200 + Math.random() * 2500, type: 'highpass',
    });
  }
  tone(t, { type: 'sawtooth', from: 220, to: 700, dur: 0.7, peak: 0.06 });
}

// The motel sign going off its wiring.
export function neonShort() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'square', from: 120, to: 30, dur: 0.3, peak: 0.35 });
  noise(t, { peak: 0.3, attack: 0.001, decay: 0.4, freq: 3000, type: 'highpass' });
  tone(t + 0.1, { type: 'sawtooth', from: 61, to: 20, dur: 0.9, peak: 0.1 }); // the hum dying
}

// The Reserve meeting an open flame.
export function fire() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.3, attack: 0.08, decay: 1.6, freq: 900, type: 'lowpass' });
  noise(t + 0.1, { peak: 0.12, attack: 0.1, decay: 1.4, freq: 2600, type: 'highpass' });
  tone(t, { type: 'sine', from: 90, to: 40, dur: 0.6, peak: 0.2 });
}

// Stun prod arcing.
export function prod() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 5; i++) {
    noise(t + i * 0.03, { peak: 0.14, attack: 0.001, decay: 0.04, freq: 6000, type: 'highpass' });
  }
  tone(t, { type: 'square', from: 90, to: 60, dur: 0.18, peak: 0.1 });
}

// Suitcase latches.
export function caseLatch() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const d of [0, 0.11]) {
    tone(t + d, { type: 'square', from: 1400, to: 900, dur: 0.04, peak: 0.09 });
    noise(t + d, { peak: 0.1, attack: 0.001, decay: 0.05, freq: 3200, type: 'bandpass', q: 2 });
  }
}

// One deliberate bite of eleven-year cure.
export function bite() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.22, attack: 0.002, decay: 0.14, freq: 2200, type: 'bandpass', q: 0.7 });
  noise(t + 0.18, { peak: 0.1, attack: 0.01, decay: 0.3, freq: 800, type: 'lowpass' });
  tone(t, { type: 'triangle', from: 180, to: 90, dur: 0.12, peak: 0.08 });
}

// Heavy car door.
export function carDoor() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.14, attack: 0.01, decay: 0.16, freq: 1200, type: 'bandpass', q: 1.2 });
  tone(t + 0.16, { type: 'sine', from: 120, to: 45, dur: 0.2, peak: 0.32 });
}

// Crawling through the pool drain.
export function tunnel() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.16, attack: 0.15, decay: 1.4, freq: 600, type: 'lowpass' });
  for (let i = 0; i < 4; i++) {
    tone(t + 0.2 + i * 0.32, { type: 'sine', from: 300 + Math.random() * 200, to: 140, dur: 0.12, peak: 0.05 });
  }
}

// Hammer on an empty chamber.
export function dryFire() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.12, attack: 0.001, decay: 0.03, freq: 3600, type: 'bandpass', q: 3 });
  tone(t, { type: 'square', from: 520, to: 380, dur: 0.04, peak: 0.05 });
}

// Shards settling a second after the window goes.
export function glassSettle() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 5; i++) {
    tone(t + 0.15 + i * 0.14 + Math.random() * 0.1, {
      type: 'triangle', from: 1800 + Math.random() * 2200, to: 900, dur: 0.06, peak: 0.03,
    });
  }
}

// A door leaving its frame with somebody attached.
export function doorSplinter() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 140, to: 34, dur: 0.35, peak: 0.5 });
  noise(t, { peak: 0.34, attack: 0.002, decay: 0.3, freq: 1400, type: 'bandpass', q: 0.7 });
  noise(t + 0.06, { peak: 0.18, attack: 0.005, decay: 0.4, freq: 500, type: 'lowpass' });
}

// A window sliding open an inch, and stopping.
export function windowSlide() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.09, attack: 0.03, decay: 0.34, freq: 1800, type: 'bandpass', q: 1.6 });
  tone(t + 0.3, { type: 'square', from: 900, to: 700, dur: 0.03, peak: 0.04 });
}

export function blip() {
  if (!ctx) return;
  tone(ctx.currentTime, { type: 'square', from: 720, to: 720, dur: 0.03, peak: 0.03 });
}

export function select() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'triangle', from: 520, to: 520, dur: 0.07, peak: 0.07 });
  tone(t + 0.05, { type: 'triangle', from: 780, to: 780, dur: 0.09, peak: 0.06 });
}

export function objective() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [523, 784].forEach((f, i) => tone(t + i * 0.1, { type: 'sine', from: f, to: f, dur: 0.2, peak: 0.09 }));
}

export function achievement() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [659, 784, 988, 1319].forEach((f, i) => {
    tone(t + i * 0.08, { type: 'triangle', from: f, to: f, dur: 0.24, peak: 0.08 });
  });
}

export function alarm() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 4; i++) {
    tone(t + i * 0.26, { type: 'square', from: 980, to: 980, dur: 0.16, peak: 0.09 });
  }
}

export function sting() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [110, 138.6, 164.8, 220].forEach((f, i) => {
    tone(t + i * 0.13, { type: 'sawtooth', from: f, to: f, dur: 0.4, peak: 0.12 });
  });
}

// ---------- Music ----------
// 'tense': a sparse two-note pulse under the deal.
// 'fight': fast percussion, brass stabs, distorted guitar chug, clave rhythm.
// 'chase': the fight groove with a driving bass and a siren-ish topline.

function kick(t0, peak = 0.28) {
  tone(t0, { type: 'sine', from: 150, to: 42, dur: 0.2, peak });
}

function snare(t0, peak = 0.12) {
  noise(t0, { peak, attack: 0.001, decay: 0.13, freq: 1900, type: 'bandpass', q: 0.9 });
  tone(t0, { type: 'triangle', from: 220, to: 170, dur: 0.07, peak: peak * 0.4 });
}

function conga(t0, freq, peak = 0.1) {
  tone(t0, { type: 'sine', from: freq, to: freq * 0.55, dur: 0.16, peak });
  noise(t0, { peak: peak * 0.4, attack: 0.001, decay: 0.06, freq: 2600, type: 'bandpass', q: 2 });
}

function brass(t0, freq, dur) {
  for (const det of [0, 3]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq + det;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(900, t0);
    filt.frequency.linearRampToValueAtTime(2400, t0 + 0.06);
    filt.frequency.linearRampToValueAtTime(800, t0 + dur);
    const g = ctx.createGain();
    env(g, t0, 0.055, 0.02, dur);
    osc.connect(filt).connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
}

function guitarChug(t0, freq, dur) {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(129);
  for (let i = 0; i < 129; i++) {
    const x = (i / 64) - 1;
    curve[i] = Math.tanh(x * 4);
  }
  shaper.curve = curve;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 700;
  filt.Q.value = 1.1;
  const g = ctx.createGain();
  env(g, t0, 0.05, 0.005, dur);
  osc.connect(shaper).connect(filt).connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

const NOTE = { E1: 41.2, E2: 82.4, G2: 98.0, A2: 110.0, B2: 123.5, C3: 130.8, D3: 146.8, E3: 164.8, G3: 196.0, A3: 220.0, B3: 246.9, C4: 261.6, E4: 329.6 };
// 3-2 clave, 16 eighth-note slots
const CLAVE = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0];
const FIGHT_BASS = [
  NOTE.E2, 0, NOTE.E2, NOTE.G2, 0, NOTE.E2, 0, NOTE.A2,
  NOTE.E2, 0, NOTE.E2, NOTE.B2, 0, NOTE.A2, 0, NOTE.G2,
];
const FIGHT_BRASS = { 0: NOTE.E4, 3: NOTE.D3 * 2, 6: NOTE.C4, 10: NOTE.B3, 12: NOTE.E4 };

export function setMusic(mode) {
  if (musicMode === mode) return;
  musicMode = mode;
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  if (!ctx || mode === 'none') return;

  const bpm = mode === 'tense' ? 84 : mode === 'chase' ? 148 : 138;
  const STEP = 60 / bpm / 2;
  let next = ctx.currentTime + 0.1;
  musicStep = 0;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    while (next < ctx.currentTime + 0.35) {
      const s = musicStep % 16;
      if (musicMode === 'tense') {
        if (s === 0 || s === 8) kick(next, 0.16);
        if (s === 6) noise(next, { peak: 0.03, attack: 0.002, decay: 0.18, freq: 5200, type: 'highpass' });
        if (s === 0) tone(next, { type: 'triangle', from: NOTE.E2, to: NOTE.E2, dur: STEP * 5, peak: 0.05 });
        if (s === 10) tone(next, { type: 'triangle', from: NOTE.G2, to: NOTE.G2, dur: STEP * 3, peak: 0.04 });
      } else {
        if (s % 4 === 0 || s === 7 || s === 11) kick(next, 0.26);
        if (s === 4 || s === 12) snare(next, 0.13);
        if (CLAVE[s]) conga(next, s % 3 ? 240 : 180, 0.09);
        noise(next, { peak: s % 2 ? 0.012 : 0.024, attack: 0.001, decay: 0.03, freq: 8000, type: 'highpass' });
        const b = FIGHT_BASS[s];
        if (b) guitarChug(next, b, STEP * 1.5);
        const br = FIGHT_BRASS[s];
        if (br && (musicMode === 'fight' || s % 6 === 0)) brass(next, br, STEP * 2.2);
        if (musicMode === 'chase' && s % 8 === 0) {
          tone(next, { type: 'sawtooth', from: NOTE.E3, to: NOTE.B3, dur: STEP * 3, peak: 0.045 });
        }
      }
      next += STEP;
      musicStep++;
    }
  }, 100);
}

export function stopMusic() {
  setMusic('none');
}

export function shutdown() {
  stopMusic();
  stopAmbience();
}
