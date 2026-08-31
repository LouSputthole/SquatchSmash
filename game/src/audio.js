// Procedural sound effects via WebAudio, with the campaign's recordings
// preferred when they can be reached.
//
// Every cue keeps its oscillator. The recordings live at the repo root, so a
// page served from `game/` finds them and `dist/squatchsmash.html` — which is
// deliberately one self-contained file with no server behind it — does not,
// and falls back to synthesis without noticing. That is the whole contract:
// this module still needs no audio assets, it just sounds better with them.
//
// ponytail: one flat fetch per cue at init, no preload budget or priority
// queue. Twenty small mp3s; add one if the first frame ever waits on them.

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
  loadSamples();
}

// ---------- Recorded samples ----------
// Promoted from assets/audio/sound-queue.json — see tools/legacy-sfx.
const SAMPLE_CUES = [
  'smash.structure', 'structure.crack', 'swing.whiff.outdoor', 'fist.on.rock',
  'ground.stomp', 'camper.squish', 'vehicle.explosion', 'footstep.forest',
  'camper.scream', 'sasquatch.roar', 'bee.swarm', 'tranq.fire', 'tranq.hit',
  'ui.time.bonus', 'ui.powerup', 'ui.goal.complete', 'ui.final.frenzy',
  'sting.run.end', 'boss.hit', 'boss.down',
  'ambience.campground.day',
];
const samples = new Map();

/** Fetch and decode every cue. A miss is deleted, so `playSample` says false. */
function loadSamples() {
  for (const name of SAMPLE_CUES) {
    if (samples.has(name)) continue;
    samples.set(name, null);
    fetch(`../assets/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => { samples.set(name, decoded); })
      .catch(() => { samples.delete(name); });
  }
}

/** True when a decoded take played, false when the caller should synthesise. */
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
  if (playSample('smash.structure', { volume: big ? 0.95 : 0.7, rate: big ? 0.9 : 1.05 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: big ? 120 : 95, to: 30, dur: 0.28, peak: big ? 0.55 : 0.4 });
  noise(t, { peak: big ? 0.4 : 0.28, decay: 0.22, freq: 500, type: 'lowpass' });
  noise(t, { peak: 0.15, decay: 0.1, freq: 3000, type: 'highpass' });
}

// Wood/structure cracking (non-final hit).
export function crack() {
  if (!ctx) return;
  if (playSample('structure.crack', { volume: 0.8 })) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.3, attack: 0.002, decay: 0.09, freq: 1800, type: 'bandpass', q: 0.8 });
  tone(t, { type: 'triangle', from: 220, to: 70, dur: 0.08, peak: 0.15 });
}

// Arms swishing through empty air.
export function whiff() {
  if (!ctx) return;
  if (playSample('swing.whiff.outdoor', { volume: 0.5 })) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.12, attack: 0.02, decay: 0.12, freq: 1200, type: 'bandpass', q: 2 });
}

// Fist meets rock: metallic clang, rock wins.
export function clang() {
  if (!ctx) return;
  if (playSample('fist.on.rock', { volume: 0.8 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'square', from: 320, to: 240, dur: 0.16, peak: 0.14 });
  tone(t, { type: 'triangle', from: 620, to: 580, dur: 0.1, peak: 0.08 });
  noise(t, { peak: 0.18, attack: 0.002, decay: 0.12, freq: 4500, type: 'highpass' });
}

// Soft heavy footfall.
export function step() {
  if (!ctx) return;
  if (playSample('footstep.forest', { volume: 0.5 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 70, to: 38, dur: 0.09, peak: 0.09 });
}

// Panicked camper: a cartoonish "waAAH" glide.
export function scream() {
  if (!ctx) return;
  if (playSample('camper.scream', { volume: 0.8 })) return;
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
  if (playSample('ui.time.bonus', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 880, to: 880, dur: 0.22, peak: 0.16 });
  tone(t + 0.1, { type: 'sine', from: 1318, to: 1318, dur: 0.3, peak: 0.14 });
}

// Camper meets fist: wet thwack.
export function squish() {
  if (!ctx) return;
  if (playSample('camper.squish', { volume: 0.8 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 170, to: 45, dur: 0.13, peak: 0.32 });
  noise(t, { peak: 0.26, attack: 0.003, decay: 0.16, freq: 380, type: 'lowpass' });
  noise(t + 0.02, { peak: 0.1, attack: 0.002, decay: 0.08, freq: 900, type: 'bandpass', q: 2 });
}

// Vehicle explosion.
export function boom() {
  if (!ctx) return;
  if (playSample('vehicle.explosion', { volume: 0.9 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 75, to: 22, dur: 0.5, peak: 0.6 });
  noise(t, { peak: 0.5, attack: 0.005, decay: 0.5, freq: 320, type: 'lowpass' });
  noise(t, { peak: 0.14, attack: 0.002, decay: 0.16, freq: 2400, type: 'highpass' });
}

// ---------- Background music: driving rampage groove in E minor ----------
// Four-on-the-floor kick, snare backbeat, ticking hats, a filtered square
// bass riff, and a sparse triangle lead with a slap-back echo.
let musicTimer = null;
let musicStep = 0;

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

function bassNote(t0, freq, dur) {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(520, t0);
  filt.frequency.exponentialRampToValueAtTime(180, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, 0.085, 0.01, dur);
  osc.connect(filt).connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function leadNote(t0, freq, dur) {
  for (const [delay, peak] of [[0, 0.05], [0.19, 0.02]]) { // slap-back echo
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const vib = ctx.createOscillator();
    vib.frequency.value = 6;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 4;
    vib.connect(vibGain).connect(osc.frequency);
    const g = ctx.createGain();
    env(g, t0 + delay, peak, 0.02, dur);
    osc.connect(g).connect(master);
    osc.start(t0 + delay);
    osc.stop(t0 + delay + dur + 0.05);
    vib.start(t0 + delay);
    vib.stop(t0 + delay + dur + 0.05);
  }
}

const N = { D2: 73.42, E2: 82.41, G2: 98.0, A2: 110.0, B2: 123.47, D3: 146.83, E3: 164.81, G3: 196.0, A3: 220.0, B3: 246.94 };
// Two-bar bass riff (16th of a 32-step loop each entry = eighth note)
const BASS = [
  N.E2, 0, N.E2, 0, N.G2, 0, N.E2, 0, N.A2, 0, N.G2, 0, N.E2, 0, N.D2, 0,
  N.E2, 0, N.E2, 0, N.G2, 0, N.E2, 0, N.A2, 0, N.B2, 0, N.D3, 0, N.B2, 0,
];
// Sparse lead phrase over the back half of a 64-step (4-bar) loop
const LEAD = { 32: N.E3, 36: N.G3, 40: N.A3, 44: N.G3, 46: N.E3, 48: N.B3, 54: N.A3, 58: N.G3, 62: N.E3 };

/**
 * The campground bed: birds, wind in the pines, a generator somewhere else.
 *
 * The scene has never had one -- it went straight from silence to a square-bass
 * groove. This is recording-only and idempotent, and it is safe to call every
 * frame: the file is still downloading for the first second of a run, and a
 * call that finds nothing decoded yet simply does nothing and gets asked again.
 */
let ambience = null;

export function startAmbience() {
  if (!ctx || ambience) return;
  const buf = samples.get('ambience.campground.day');
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = 0.18;
  src.connect(g).connect(master);
  src.start();
  ambience = src;
}

export function stopAmbience() {
  if (!ambience) return;
  try { ambience.stop(); } catch { /* already stopped */ }
  ambience = null;
}

export function startMusic() {
  if (!ctx || musicTimer) return;
  const STEP = 60 / 122 / 2; // 122 BPM, eighth notes
  let next = ctx.currentTime + 0.1;
  musicStep = 0;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    while (next < ctx.currentTime + 0.3) {
      const s16 = musicStep % 16;
      const s64 = musicStep % 64;
      if (s16 % 4 === 0) drum(next, 120, 40, 0.15, 0.18); // kick: four on the floor
      if (s16 === 4 || s16 === 12) noise(next, { peak: 0.07, attack: 0.001, decay: 0.12, freq: 1800, type: 'bandpass', q: 0.9 }); // snare
      noise(next, { peak: s16 % 2 ? 0.014 : 0.026, attack: 0.001, decay: 0.035, freq: 7000, type: 'highpass' }); // hats
      const bass = BASS[musicStep % 32];
      if (bass) bassNote(next, bass, STEP * 1.8);
      const lead = LEAD[s64];
      if (lead) leadNote(next, lead, STEP * 3.2);
      next += STEP;
      musicStep++;
    }
  }, 100);
}

export function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

// Ground stomp: deeper and meaner than a regular smash.
export function stomp() {
  if (!ctx) return;
  if (playSample('ground.stomp', { volume: 0.9 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 65, to: 18, dur: 0.42, peak: 0.6 });
  noise(t, { peak: 0.4, attack: 0.004, decay: 0.4, freq: 260, type: 'lowpass' });
  noise(t, { peak: 0.1, attack: 0.002, decay: 0.1, freq: 2600, type: 'highpass' });
}

// Angry bee swarm.
export function buzz() {
  if (!ctx) return;
  if (playSample('bee.swarm', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(165 + Math.random() * 25, t);
  const trem = ctx.createOscillator();
  trem.frequency.value = 28;
  const tremGain = ctx.createGain();
  tremGain.gain.value = 22;
  trem.connect(tremGain).connect(osc.frequency);
  const g = ctx.createGain();
  env(g, t, 0.05, 0.08, 1.0);
  osc.connect(g).connect(master);
  osc.start(t);
  trem.start(t);
  osc.stop(t + 1.2);
  trem.stop(t + 1.2);
}

// Tranq dart: pfft on fire, thwip on hit.
export function dart() {
  if (!ctx) return;
  if (playSample('tranq.fire', { volume: 0.7 })) return;
  noise(ctx.currentTime, { peak: 0.12, attack: 0.002, decay: 0.09, freq: 2200, type: 'bandpass', q: 1.5 });
}

export function dartHit() {
  if (!ctx) return;
  if (playSample('tranq.hit', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'triangle', from: 900, to: 160, dur: 0.14, peak: 0.16 });
  noise(t, { peak: 0.08, attack: 0.002, decay: 0.06, freq: 1400, type: 'bandpass', q: 2 });
}

// Power-up collect: quick ascending sparkle.
export function powerup() {
  if (!ctx) return;
  if (playSample('ui.powerup', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  [523, 659, 784, 1046].forEach((f, i) => {
    tone(t + i * 0.05, { type: 'sine', from: f, to: f, dur: 0.14, peak: 0.1 });
  });
}

// Final frenzy alarm.
export function frenzyJingle() {
  if (!ctx) return;
  if (playSample('ui.final.frenzy', { volume: 0.8 })) return;
  const t = ctx.currentTime;
  [440, 554, 659, 554, 440, 659].forEach((f, i) => {
    tone(t + i * 0.09, { type: 'square', from: f, to: f, dur: 0.1, peak: 0.07 });
  });
}

// Sasquatch roar: layered detuned saws swept through a lowpass, plus breath noise.
export function roar() {
  if (!ctx) return;
  if (playSample('sasquatch.roar', { volume: 0.9 })) return;
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

// Goal completed: bright three-note flourish.
export function goalDing() {
  if (!ctx) return;
  if (playSample('ui.goal.complete', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  [784, 988, 1319].forEach((f, i) => {
    tone(t + i * 0.07, { type: 'triangle', from: f, to: f, dur: 0.22, peak: 0.13 });
  });
}

// Boss arrival: two-tone ranger siren.
export function siren() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 4; i++) {
    tone(t + i * 0.3, { type: 'square', from: i % 2 ? 660 : 880, to: i % 2 ? 660 : 880, dur: 0.26, peak: 0.09 });
  }
}

// Boss takes a hit but stays up: dull armored thud.
export function bossHit() {
  if (!ctx) return;
  if (playSample('boss.hit', { volume: 0.8 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'square', from: 220, to: 70, dur: 0.16, peak: 0.16 });
  noise(t, { peak: 0.14, attack: 0.003, decay: 0.12, freq: 900, type: 'bandpass', q: 1.2 });
}

// Boss goes down: descending fanfare over a boom.
export function bossDown() {
  if (!ctx) return;
  if (playSample('boss.down', { volume: 0.85 })) return;
  const t = ctx.currentTime;
  [880, 740, 587, 440].forEach((f, i) => {
    tone(t + i * 0.13, { type: 'sawtooth', from: f, to: f * 0.98, dur: 0.3, peak: 0.13 });
  });
  tone(t + 0.5, { type: 'sine', from: 120, to: 30, dur: 0.7, peak: 0.4 });
  noise(t + 0.5, { peak: 0.32, decay: 0.6, freq: 380, type: 'lowpass' });
}

// Short victory-ish sting for the end screen.
export function sting() {
  if (!ctx) return;
  if (playSample('sting.run.end', { volume: 0.8 })) return;
  const t = ctx.currentTime;
  [220, 277, 330, 440].forEach((f, i) => {
    tone(t + i * 0.12, { type: 'triangle', from: f, to: f, dur: 0.3, peak: 0.18 });
  });
}
