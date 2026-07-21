// Procedural sound effects via WebAudio — no audio assets needed.

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

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
  src.connect(filt).connect(g).connect(master);
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
  osc.connect(g).connect(master);
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

// Fist meets rock: metallic clang, rock wins.
export function clang() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'square', from: 320, to: 240, dur: 0.16, peak: 0.14 });
  tone(t, { type: 'triangle', from: 620, to: 580, dur: 0.1, peak: 0.08 });
  noise(t, { peak: 0.18, attack: 0.002, decay: 0.12, freq: 4500, type: 'highpass' });
}

// Soft heavy footfall.
export function step() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 70, to: 38, dur: 0.09, peak: 0.09 });
}

// Panicked camper: a cartoonish "waAAH" glide.
export function scream() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(480 + Math.random() * 120, t);
  osc.frequency.linearRampToValueAtTime(820 + Math.random() * 120, t + 0.09);
  osc.frequency.exponentialRampToValueAtTime(240, t + 0.42);
  const vib = ctx.createOscillator();
  vib.frequency.value = 22;
  const vibGain = ctx.createGain();
  vibGain.gain.value = 30;
  vib.connect(vibGain).connect(osc.frequency);
  const g = ctx.createGain();
  env(g, t, 0.11, 0.03, 0.42);
  osc.connect(g).connect(master);
  osc.start(t);
  vib.start(t);
  osc.stop(t + 0.5);
  vib.stop(t + 0.5);
}

// Golden cooler time bonus.
export function chime() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 880, to: 880, dur: 0.22, peak: 0.16 });
  tone(t + 0.1, { type: 'sine', from: 1318, to: 1318, dur: 0.3, peak: 0.14 });
}

// Camper meets fist: wet thwack.
export function squish() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 170, to: 45, dur: 0.13, peak: 0.32 });
  noise(t, { peak: 0.26, attack: 0.003, decay: 0.16, freq: 380, type: 'lowpass' });
  noise(t + 0.02, { peak: 0.1, attack: 0.002, decay: 0.08, freq: 900, type: 'bandpass', q: 2 });
}

// Vehicle explosion.
export function boom() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 75, to: 22, dur: 0.5, peak: 0.6 });
  noise(t, { peak: 0.5, attack: 0.005, decay: 0.5, freq: 320, type: 'lowpass' });
  noise(t, { peak: 0.14, attack: 0.002, decay: 0.16, freq: 2400, type: 'highpass' });
}

// ---------- Background music: a simple tribal drum loop ----------
let musicTimer = null;
let musicBeat = 0;

function drum(t0, from, to, peak, dur) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, peak, 0.005, dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export function startMusic() {
  if (!ctx || musicTimer) return;
  const STEP = 60 / 112 / 2; // 112 BPM, eighth notes
  let next = ctx.currentTime + 0.1;
  musicBeat = 0;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    while (next < ctx.currentTime + 0.25) {
      const b = musicBeat % 16;
      if (b === 0 || b === 6 || b === 10) drum(next, 110, 42, 0.16, 0.22); // kick
      if (b === 4 || b === 12) drum(next, 190, 80, 0.11, 0.16); // tom
      if (b === 14 && Math.random() < 0.5) drum(next, 240, 100, 0.09, 0.12); // fill
      if (b % 2 === 0) noise(next, { peak: 0.028, attack: 0.001, decay: 0.04, freq: 6000, type: 'highpass' }); // hat
      next += STEP;
      musicBeat++;
    }
  }, 100);
}

export function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
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
    osc.connect(filt).connect(g).connect(master);
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
