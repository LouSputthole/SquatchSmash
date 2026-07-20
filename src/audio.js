// Procedural sound effects via WebAudio — no audio assets needed.

let ctx = null;
let noiseBuf = null;

export function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const len = ctx.sampleRate * 1.5;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
}

function env(gainNode, t0, peak, attack, decay) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(peak, t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function noise(t0, { peak = 0.3, attack = 0.005, decay = 0.15, type = 'lowpass', freq = 800, q = 1 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, peak, attack, decay);
  src.connect(filt).connect(g).connect(ctx.destination);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + attack + decay + 0.05);
}

function tone(t0, { type = 'sine', from = 90, to = 40, dur = 0.2, peak = 0.4 } = {}) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
  const g = ctx.createGain();
  env(g, t0, peak, 0.008, dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// Heavy ground-shaking smash impact.
export function smash(big = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: big ? 120 : 95, to: 30, dur: 0.28, peak: big ? 0.55 : 0.4 });
  noise(t, { peak: big ? 0.4 : 0.28, decay: 0.22, freq: 500, type: 'lowpass' });
  noise(t, { peak: 0.15, decay: 0.1, freq: 3000, type: 'highpass' });
}

// Wood/structure cracking (non-final hit).
export function crack() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.3, attack: 0.002, decay: 0.09, freq: 1800, type: 'bandpass', q: 0.8 });
  tone(t, { type: 'triangle', from: 220, to: 70, dur: 0.08, peak: 0.15 });
}

// Arms swishing through empty air.
export function whiff() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.12, attack: 0.02, decay: 0.12, freq: 1200, type: 'bandpass', q: 2 });
}

// Sasquatch roar: layered detuned saws swept through a lowpass, plus breath noise.
export function roar() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const det of [0, 4, -6]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55 + det, t);
    osc.frequency.linearRampToValueAtTime(140 + det, t + 0.35);
    osc.frequency.linearRampToValueAtTime(70 + det, t + 1.1);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(400, t);
    filt.frequency.linearRampToValueAtTime(1200, t + 0.3);
    filt.frequency.linearRampToValueAtTime(300, t + 1.1);
    const g = ctx.createGain();
    env(g, t, 0.16, 0.08, 1.05);
    osc.connect(filt).connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.3);
  }
  noise(t, { peak: 0.12, attack: 0.1, decay: 0.9, freq: 900, type: 'lowpass' });
}

// Short victory-ish sting for the end screen.
export function sting() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [220, 277, 330, 440].forEach((f, i) => {
    tone(t + i * 0.12, { type: 'triangle', from: f, to: f, dur: 0.3, peak: 0.18 });
  });
}
