// Shared WebAudio plumbing for the scene. Everything is synthesised — no audio
// files, same as the rest of the game.
//
// Chain:  sources → bus → duck (lowpass) → master → destination
//         ringing oscillator → master   (bypasses the duck so it stays on top)

let ctx = null;
let master = null;
let busNode = null;
let duckFilter = null;
let duckGain = null;
let noiseBuf = null;
let muted = false;
let ringOsc = null;
let ringOsc2 = null;
let ringGain = null;

export function init() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);

  duckGain = ctx.createGain();
  duckGain.gain.value = 1;
  duckGain.connect(master);

  duckFilter = ctx.createBiquadFilter();
  duckFilter.type = 'lowpass';
  duckFilter.frequency.value = 20000;
  duckFilter.connect(duckGain);

  busNode = ctx.createGain();
  busNode.gain.value = 1;
  busNode.connect(duckFilter);

  const len = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  return ctx;
}

export function resume() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

// Pausing the scene has to take the room with it — the ambience and the train
// are looping sources that would otherwise play on behind the pause overlay.
export function suspend() {
  if (ctx && ctx.state === 'running') ctx.suspend();
}

export const isReady = () => !!ctx;
export const now = () => (ctx ? ctx.currentTime : 0);
export const audioCtx = () => ctx;
export const bus = () => busNode;
export const noiseBuffer = () => noiseBuf;

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
}

export const isMuted = () => muted;

// Pushes everything except the ringing behind a low-pass.
export function duck(gain, cutoff) {
  if (!ctx) return;
  duckGain.gain.setTargetAtTime(gain, ctx.currentTime, 0.08);
  duckFilter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.08);
}

// ---------- Ear ringing ----------

export function startRinging() {
  if (!ctx || ringOsc) return;
  ringGain = ctx.createGain();
  ringGain.gain.value = 0;
  ringGain.connect(master);
  ringOsc = ctx.createOscillator();
  ringOsc.type = 'sine';
  ringOsc.frequency.value = 4380;
  ringOsc2 = ctx.createOscillator();
  ringOsc2.type = 'sine';
  ringOsc2.frequency.value = 6210;
  const g2 = ctx.createGain();
  g2.gain.value = 0.35;
  ringOsc.connect(ringGain);
  ringOsc2.connect(g2).connect(ringGain);
  ringOsc.start();
  ringOsc2.start();
  ringGain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.01);
}

export function setRinging(level) {
  if (!ringGain) return;
  ringGain.gain.setTargetAtTime(0.05 * Math.max(0, level), ctx.currentTime, 0.2);
}

export function stopRinging() {
  if (!ringOsc) return;
  const t = ctx.currentTime;
  ringGain.gain.setTargetAtTime(0, t, 0.25);
  const o1 = ringOsc;
  const o2 = ringOsc2;
  ringOsc = null;
  ringOsc2 = null;
  setTimeout(() => { try { o1.stop(); o2.stop(); } catch { /* already stopped */ } }, 1200);
}

// ---------- Primitives ----------

export function env(gainNode, t0, peak, attack, decay) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

export function noise(t0, {
  peak = 0.3, attack = 0.005, decay = 0.15, type = 'lowpass', freq = 800, q = 1, rate = null,
} = {}, dest = null) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = rate || 0.7 + Math.random() * 0.6;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, peak, attack, decay);
  src.connect(filt).connect(g).connect(dest || busNode);
  src.start(t0, Math.random() * 0.9);
  src.stop(t0 + attack + decay + 0.08);
}

export function tone(t0, {
  type = 'sine', from = 90, to = 40, dur = 0.2, peak = 0.4, detune = 0,
} = {}, dest = null) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
  const g = ctx.createGain();
  env(g, t0, peak, 0.006, dur);
  osc.connect(g).connect(dest || busNode);
  osc.start(t0);
  osc.stop(t0 + dur + 0.06);
}

// A looping noise source with its own filter + gain, for beds and rumbles.
export function noiseLoop({ type = 'lowpass', freq = 600, q = 1, gain = 0.1, rate = 1 } = {}) {
  if (!ctx) return null;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.value = rate;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filt).connect(g).connect(busNode);
  src.start();
  return { src, filt, gain: g };
}
