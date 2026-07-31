// Shared WebAudio plumbing for the scene. Almost everything is synthesised;
// the shipped recordings (dialogue, footsteps, the revolver) are preferred
// when they load, with the synth kept as the fallback.
//
// Chain:  sources → bus → duck (lowpass) → master → destination
//         voice → voice lowpass+gain → bus   (the bathroom-door muffle)
//         ringing → master   (bypasses the duck so it stays on top)

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
let voiceFilter = null;
let voiceGain = null;
let voiceSrc = null;

// The 27 recorded dialogue clips, named for their beat in dialogue.json.
const VO_CUES = [
  'vo.sf.greeting.1',
  ...Array.from({ length: 14 }, (_, i) => `vo.sf.opening.${i + 1}`),
  'vo.sf.excuse.1', 'vo.sf.excuse.2',
  'vo.sf.sitdown.1',
  'vo.sf.wrongsearch.1',
  'vo.sf.prodding.1', 'vo.sf.prodding.2',
  ...Array.from({ length: 6 }, (_, i) => `vo.sf.final.${i + 1}`),
];

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

  // Dialogue rides its own lowpass+gain INTO the duck bus: it goes dull and
  // distant behind the shut bathroom door, and it drops with everything else
  // for the ten seconds after the shots. Never around the duck.
  voiceGain = ctx.createGain();
  voiceGain.gain.value = 1;
  voiceGain.connect(busNode);
  voiceFilter = ctx.createBiquadFilter();
  voiceFilter.type = 'lowpass';
  voiceFilter.frequency.value = 18000;
  voiceFilter.connect(voiceGain);

  const len = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  loadSamples([
    'footstep.leather.wood', 'footstep.leather.tile',
    'footstep.wood', 'footstep.tile', 'footstep.street.wet',
    'gun.shot', 'gun.reload', 'gun.drop.wood',
    'chair.scrape.wood', 'chair.knock',
    'door.restaurant.open', 'door.restaurant.close', 'door.bathroom.close',
    'cloth.suit.movement', 'wine.pour.glass', 'glass.wine.fall',
    'search.rustle', 'pipe.knock.cistern', 'heartbeat.slow', 'breath.controlled',
    'car.door.close.heavy',
    'dish.clink', 'bathroom.drip', 'street.car.pass.wet', 'street.horn.distant',
    'restaurant.room.tone', 'restaurant.murmur', 'restaurant.kitchen',
    'street.wet.night', 'bathroom.tone',
    'train.elevated.rumble', 'train.elevated.roar', 'train.elevated.sub',
    'train.rail.clatter', 'train.horn.far',
    'ear.ringing',
    ...VO_CUES,
  ]);

  return ctx;
}

// ---------- Recorded samples ----------
// A cue that fails to fetch or decode simply stays on the synth; nothing in
// the scene depends on the files existing.
const samples = new Map();
const playLogList = [];
const voLogList = [];

// The shipped index says which cue files exist, so a cue that has not been
// recorded yet is simply skipped — no 404s in the console for wishes.
let indexFiles = null; // Set of filenames, or 'all' when the index is unavailable

export function loadSamples(names) {
  const start = (name) => {
    if (samples.has(name)) return;
    if (indexFiles !== 'all' && !indexFiles.has(`${name}.mp3`)) return; // not recorded yet
    samples.set(name, null);
    fetch(`assets/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => samples.set(name, decoded))
      .catch(() => samples.delete(name));
  };
  if (indexFiles) {
    for (const name of names) start(name);
    return;
  }
  fetch('assets/sfx/index.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((idx) => { indexFiles = new Set(idx.files || []); })
    .catch(() => { indexFiles = 'all'; }) // no index: try everything
    .then(() => { for (const name of names) start(name); });
}

/** True once a cue has fetched and decoded. */
export const sampleReady = (name) => !!samples.get(name);

/** Duration of a decoded cue in seconds, or 0. */
export const sampleDuration = (name) => (samples.get(name) ? samples.get(name).duration : 0);

/** Names of every recorded cue that played, in order — for the verify tools. */
export const playLog = () => playLogList;

/** Every dialogue line asked for: { name, sample, duration }. */
export const voLog = () => voLogList;

/** Play a recorded cue. Returns false when it has not loaded (use the synth). */
export function playSample(name, { volume = 1, rate = 1 } = {}) {
  const buf = samples.get(name);
  if (!buf || !ctx) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(busNode);
  src.start();
  playLogList.push(name);
  return true;
}

/**
 * A seamless looping recording through the duck bus, with its own lowpass +
 * gain so the caller can drive exactly the envelopes the synth beds use —
 * same shape as noiseLoop's { src, filt, gain } handle. Returns null while
 * the cue has not decoded: start the synth instead, and try again later to
 * upgrade mid-scene.
 */
export function sampleLoop(name, { gain = 0, rate = 1, freq = 18000, q = 0.7 } = {}) {
  const buf = samples.get(name);
  if (!buf || !ctx) return null;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = rate;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filt).connect(g).connect(busNode);
  // Loops start at a random phase so layered beds never breathe in step.
  src.start(0, Math.random() * Math.max(0, buf.duration - 0.05));
  playLogList.push(name);
  return { src, filt, gain: g, sample: true, name };
}

// ---------- Dialogue ----------

/**
 * Play a recorded dialogue line through the voice chain (lowpass + gain into
 * the duck bus). One voice at a time. Returns the clip's real duration in
 * seconds so the subtitle beat can hold exactly that long, or 0 when the
 * clip has not loaded and the caller should keep its reading-beat timing.
 */
export function playVoice(name, { volume = 0.9 } = {}) {
  stopVoice();
  const buf = samples.get(name);
  if (!buf || !ctx) {
    voLogList.push({ name, sample: false, duration: 0 });
    return 0;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(voiceFilter);
  src.start();
  voiceSrc = src;
  voLogList.push({ name, sample: true, duration: buf.duration });
  return buf.duration;
}

/** Cut whatever line is playing (checkpoint restore, an interrupting bark). */
export function stopVoice() {
  if (!voiceSrc) return;
  try { voiceSrc.stop(); } catch { /* already ended */ }
  voiceSrc = null;
}

/**
 * How far away the dining room is. 0 at the table; 1 with the bathroom door
 * shut, which drops the voices behind the same kind of lowpass as the rest
 * of the room — the manifest's mix note applied to VO.
 */
export function setVoiceMuffle(v) {
  if (!ctx) return;
  const k = Math.max(0, Math.min(1, v));
  voiceGain.gain.setTargetAtTime(1 - 0.62 * k, ctx.currentTime, 0.25);
  voiceFilter.frequency.setTargetAtTime(18000 - (18000 - 480) * k, ctx.currentTime, 0.25);
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
// Straight into the master, past the duck, so the tinnitus stays on top of a
// mix that has dropped away. The recorded loop is preferred; the sine pair
// covers it until the file decodes.

let ringSrc = null;
let ringBase = 0.05;

export function startRinging() {
  if (!ctx || ringOsc || ringSrc) return;
  ringGain = ctx.createGain();
  ringGain.gain.value = 0;
  ringGain.connect(master);
  const buf = samples.get('ear.ringing');
  if (buf) {
    ringBase = 0.55;
    ringSrc = ctx.createBufferSource();
    ringSrc.buffer = buf;
    ringSrc.loop = true;
    ringSrc.connect(ringGain);
    ringSrc.start();
    playLogList.push('ear.ringing');
  } else {
    ringBase = 0.05;
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
  }
  ringGain.gain.setTargetAtTime(ringBase, ctx.currentTime, 0.01);
}

export function setRinging(level) {
  if (!ringGain) return;
  ringGain.gain.setTargetAtTime(ringBase * Math.max(0, level), ctx.currentTime, 0.2);
}

export function stopRinging() {
  if (!ringOsc && !ringSrc) return;
  const t = ctx.currentTime;
  ringGain.gain.setTargetAtTime(0, t, 0.25);
  const o1 = ringOsc;
  const o2 = ringOsc2;
  const s = ringSrc;
  ringOsc = null;
  ringOsc2 = null;
  ringSrc = null;
  setTimeout(() => {
    try { o1?.stop(); o2?.stop(); } catch { /* already stopped */ }
    try { s?.stop(); } catch { /* already stopped */ }
  }, 1200);
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
