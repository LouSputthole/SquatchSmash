// Procedural audio for THE JERKY MOTEL — humid, cheap, tense.
// Same WebAudio-only approach as the campground scene: no asset files.
//
// One exception, and it is deliberate: the .45 Tony carries is the shared
// weapon system's .45, so its shot, its reload and its dry click come out of
// `assets/sfx` through `weaponAudio` below rather than out of an oscillator.
import { WEAPON_IDS, weaponCue, weaponCueSlots } from '../core/weapons/catalog.js';
import { registerSceneAudioContext } from '../core/scene-lifecycle.js';

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
/** The player's master-volume setting, 0..1 (src/core/settings.js). */
let userVolume = 1;

// Ambience nodes (started once, gain-tweened by tension)
let amb = null;
/** Resolves once `SAMPLE_CUES` has finished decoding. Tests await it. */
export let samplesReady = Promise.resolve();
let tension = 0;         // 0..1, drives the bass pulse and the room falling away
let musicTimer = null;
let musicStep = 0;
let musicMode = 'none';  // 'none' | 'tense' | 'fight' | 'chase'

/** Non-diegetic score for the Motel drive; never attached to a world source. */
export const DRIVE_MUSIC_URL = 'assets/music/driving-jerky-hotel.mp3';
export const DRIVE_MUSIC_VOLUME = 0.16;
let driveMusic = null;

/** A short, bounded receipt used by the live Motel verifier. */
export const audioEvents = [];
function recordAudioEvent(type, detail = {}) {
  audioEvents.push({ type, at: ctx?.currentTime ?? 0, ...detail });
  if (audioEvents.length > 160) audioEvents.shift();
}

/**
 * @param {{ priorityVoice?: string[] }} [options] cues whose takes are decoded
 * before the rest of the voice library is fetched. The scene's opening line is
 * spoken about a second after this call and lost the race against 167 parallel
 * voice downloads every single time, which read on screen as an unrecorded
 * line even though the take was on disk.
 */
export function init(options = {}) {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  registerSceneAudioContext(ctx);
  master = ctx.createGain();
  master.gain.value = muted ? 0 : userVolume;
  master.connect(ctx.destination);
  const len = ctx.sampleRate * 1.5;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  /* `startAmbience()` is called three lines after this one and these files are
   * still in flight, so the beds cannot simply be read out of `samples` there.
   * Hold the promise: the room starts on its oscillators and upgrades itself
   * to the recordings the moment they decode. */
  samplesReady = loadSamples(SAMPLE_CUES);
  loadVoiceIndex(options.priorityVoice || []);
}

/**
 * The .45's own five recordings, plus the stand-ins `playWeaponCue` falls back
 * to and the two handling noises `equip`/`stow` play.
 *
 * Named from the catalog rather than typed out, so a slot added to the shared
 * weapon system arrives here as well. ONLY THE REVOLVER: the Motel racks one
 * gun off `src/core/weapons/`, and preloading the other six weapons' banks
 * would be fifty files this scene never plays. Every name below is a file that
 * exists in `assets/sfx` — a 404 here is a 404 the Motel's own verifier fails
 * on, which is the correct place for that to hurt.
 */
const WEAPON_CUES = [
  ...weaponCueSlots(WEAPON_IDS.REVOLVER).map((slot) => weaponCue(WEAPON_IDS.REVOLVER, slot)),
  'gun.shot', 'gun.reload', 'gun.dry', 'heist.weapon.check',
  'gun.pickup', 'heist.weapon.down',
];

/* Recorded cues this scene prefers over its own synthesis. Everything here
 * keeps its procedural fallback, so a missing file costs nothing. */
const SAMPLE_CUES = [...new Set([
  'car.engine.start', 'car.engine.idle', 'car.engine.rev',
  'car.tire.skid', 'car.horn', 'car.impact.metal', 'gun.shot',
  // The motel was synthesising all of these while the recordings sat on disk.
  'door.locked', 'car.door', 'ice.drop', 'pipe.knock.cistern',
  /* Owner playtest: the old shared samples sounded like forks scraping
   * plates. Motel movement owns a recorded two-take bank per surface now;
   * the shared footsteps remain untouched for scenes already mixed to them. */
  'motel.footstep.concrete.a', 'motel.footstep.concrete.b',
  'motel.footstep.asphalt.a', 'motel.footstep.asphalt.b',
  'motel.footstep.carpet.a', 'motel.footstep.carpet.b',
  'motel.footstep.tile.a', 'motel.footstep.tile.b',
  'motel.footstep.stairs.a', 'motel.footstep.stairs.b',
  'motel.footstep.pool.a', 'motel.footstep.pool.b',
  // Promoted from assets/audio/sound-queue.json — see tools/legacy-sfx.
  'alarm.counter', 'body.fall.carpet', 'door.knock.motel', 'door.open.motel',
  'door.slam', 'door.splinter', 'fan.sparks',
  'glass.settle', 'grapple.struggle', 'gun.dry',
  'jerky.bite', 'jerky.chew', 'knife.tap', 'land.heavy',
  'neon.short', 'punch.heavy', 'punch.light', 'shipment.burn',
  'siege.glass.shatter', 'silent.case.latches', 'siren.close', 'siren.distant',
  'slicer.spin', 'spice.throw', 'sting.scene.end', 'stunprod.arc',
  'swing.whiff', 'tunnel.crawl', 'tv.implode', 'tv.static',
  'ui.achievement', 'ui.objective', 'vacuum.pack.handle', 'window.slide',
  'wood.break',
  /* The nine briefs that had no code hook until now — see tools/sound-queue. */
  'cleaver.swipe', 'curtain.rip', 'jerky.bend', 'wax.seal.break', 'sealer.run',
  'fan.click', 'ac.drip', 'vending.bump',
  /* The ambience beds. Four of these replace an oscillator arm below; the
   * other four are places the room has always had and never made a noise. */
  'ambience.motel.neon', 'ambience.motel.ac', 'ambience.motel.night',
  'ambience.motel.tension', 'ambience.motel.room', 'ambience.motel.tv',
  'ambience.motel.pool', 'ambience.motel.alley',
  ...WEAPON_CUES,
])];

/**
 * What `src/core/weapons/` calls an AudioEngine.
 *
 * Two methods, and the Motel has both already: can this recording be played,
 * and play it. The scene's own synthesis is deliberately NOT a fallback here —
 * `playWeaponCue` already owns that decision and falls through to a verified
 * stand-in recording, and a synthesised blip standing in for a .45 is exactly
 * the "one gun with seven models on it" the shared bank exists to avoid.
 */
export const weaponAudio = {
  hasSample: (name) => samples.get(name) != null,
  /* Hand the WHOLE option bag down, rather than picking three fields out of
   * it. This used to destructure `{ volume, rate, delay }` and rebuild the
   * object, which silently ate `position`, `ref` and `maxDist` — so a gun
   * fired anywhere but in the player's hands would have played flat and
   * full-volume with nothing anywhere saying so. `playWeaponCue` fills those
   * in for every positional call now, which is exactly the kind of argument
   * a hand-copied wrapper drops. */
  play: (name, opts = {}) => {
    const { delay = 0 } = opts;
    if (delay > 0) {
      setTimeout(() => playSample(name, opts), delay * 1000);
      return true;
    }
    return playSample(name, opts);
  },
};

/**
 * Where the ear is, in the scene's own world coordinates.
 *
 * A `PannerNode` is measured against `ctx.listener`, and this module has no
 * camera. Until something tells it where the player's head is, a positional
 * cue is played FLAT rather than panned against an unset listener sitting at
 * the origin — attenuating a sound against an ear that is not really there is
 * a worse lie than not attenuating it at all.
 */
let listenerPlaced = false;

/** Move the ear. Call it from the scene's frame loop with the camera. */
export function setListenerPose(position, forward = null) {
  if (!ctx || !position || !Number.isFinite(position.x)) return false;
  const L = ctx.listener;
  if (L.positionX) {
    L.positionX.value = position.x;
    L.positionY.value = position.y ?? 0;
    L.positionZ.value = position.z;
  } else {
    L.setPosition(position.x, position.y ?? 0, position.z);
  }
  if (forward && Number.isFinite(forward.x)) {
    if (L.forwardX) {
      L.forwardX.value = forward.x;
      L.forwardY.value = forward.y ?? 0;
      L.forwardZ.value = forward.z;
      L.upY.value = 1;
    } else {
      L.setOrientation(forward.x, forward.y ?? 0, forward.z, 0, 1, 0);
    }
  }
  listenerPlaced = true;
  return true;
}

// ---------- Recorded samples ----------
// Preferred when decoded; every caller keeps its synth fallback, so nothing
// in the scene depends on the files existing.
const samples = new Map();
/** One promise per file, so a caller can wait for a specific take to land. */
const sampleLoads = new Map();

function loadSamples(names) {
  const waits = [];
  for (const name of names) {
    if (samples.has(name)) {
      const pending = sampleLoads.get(name);
      if (pending) waits.push(pending);
      continue;
    }
    samples.set(name, null);
    const load = fetch(`assets/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => { samples.set(name, decoded); })
      .catch(() => { samples.delete(name); })
      .finally(() => { sampleLoads.delete(name); });
    sampleLoads.set(name, load);
    waits.push(load);
  }
  return Promise.all(waits);
}

function makePanner(position, ref, maxDist) {
  if (!ctx?.createPanner) return null;
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = ref;
  p.maxDistance = maxDist;
  if (p.positionX) {
    p.positionX.value = position.x;
    p.positionY.value = position.y ?? 0;
    p.positionZ.value = position.z;
  } else {
    p.setPosition(position.x, position.y ?? 0, position.z);
  }
  return p;
}

function playSample(name, {
  volume = 1, rate = 1, position = null, ref = 3, maxDist = 55,
} = {}) {
  const buf = samples.get(name);
  if (!buf || !ctx) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = volume;
  /* `ref`/`maxDist` are the shared weapon system's names for a panner's
   * reference and maximum distance, so a cue routed through `weaponAudio`
   * lands here already carrying a gunshot's falloff rather than a prop's. */
  const p = position && listenerPlaced ? makePanner(position, ref, maxDist) : null;
  if (p) src.connect(g).connect(p).connect(master);
  else src.connect(g).connect(master);
  src.start();
  return true;
}

// ---------- Recorded voice ----------
// The scene asks for a line by cue; if that line has been recorded it plays,
// and the caller is told how long it runs so the subtitle can hold for the
// real thing instead of an authored guess. Nothing is synthesised — a fake
// voice is worse than silence — so an unrecorded line is simply subtitled.
//
// Cues are `vo.motel.<speaker>.<beat>.<take>`, matching the naming the rest of
// the campaign uses. Which files exist is read from assets/sfx/index.json, so
// a scene with no VO recorded yet costs exactly one request and no 404s.

const VOICE_PREFIX = 'vo.motel.';
const voiceFiles = new Set();
const voiceBanks = new Map();
const voiceLast = new Map();
/** Every cue the scene has asked for, recorded or not — the wiring's receipt. */
export const voiceRequested = new Set();
/**
 * Every take that actually started, in order. `voiceRequested` only proves the
 * scene asked; this proves a recording came out of the speakers, which is the
 * difference a player hears and the only thing that can catch a line losing a
 * race against its own download.
 */
export const voicePlayed = [];
let voiceIndexPromise = null;
let currentVoice = null;
/** The amplitude tap on whatever line is sounding — see prepareVoice/voiceTap. */
let currentVoiceAnalyser = null;
let voiceUntil = 0;

/** Every file on disk whose name is a take of `cue`. */
function takesOf(cue) {
  const stem = `${cue.startsWith(VOICE_PREFIX) ? cue : `${VOICE_PREFIX}${cue}`}.`;
  return [...voiceFiles].filter((name) => name.startsWith(stem));
}

function loadVoiceIndex(priorityCues = []) {
  if (voiceIndexPromise) return voiceIndexPromise;
  voiceIndexPromise = (async () => {
    try {
      const res = await fetch('assets/sfx/index.json', { cache: 'force-cache' });
      if (!res.ok) return;
      const index = await res.json();
      for (const file of index.files || []) {
        if (file.startsWith(VOICE_PREFIX) && file.endsWith('.mp3')) {
          voiceFiles.add(file.slice(0, -4));
        }
      }
      voiceBanks.clear();
      if (!voiceFiles.size) return;
      /* The lines the scene opens on go first and alone. Firing all of them at
       * once puts the first line of the scene behind a hundred and sixty-six
       * downloads it does not need, and it arrives after the subtitle has
       * already come and gone. */
      const first = priorityCues.flatMap(takesOf);
      if (first.length) await loadSamples(first);
      loadSamples([...voiceFiles]);
    } catch {
      /* No index: the scene runs on subtitles alone rather than failing. */
    }
  })();
  return voiceIndexPromise;
}

/**
 * Wait until the named cues can actually be spoken.
 *
 * Resolves true when at least one take of one of them is decoded, false when
 * the ceiling runs out first — the caller speaks either way, because a late
 * subtitle is still worse than a silent one.
 */
export async function primeVoice(cues, { timeoutMs = 6000 } = {}) {
  if (!ctx || !cues?.length) return false;
  let expired = false;
  const ceiling = new Promise((resolve) => {
    setTimeout(() => { expired = true; resolve(); }, timeoutMs);
  });
  await Promise.race([loadVoiceIndex(cues), ceiling]);
  if (expired) return cues.some((cue) => takesOf(cue).some((name) => samples.get(name)));
  const wanted = cues.flatMap(takesOf);
  if (!wanted.length) return false;
  await Promise.race([loadSamples(wanted), ceiling]);
  return wanted.some((name) => samples.get(name));
}

/** True when a recorded take of this cue is decoded and ready to play. */
export function voiceReady(cue) {
  return takesOf(cue).some((name) => samples.get(name));
}

/**
 * Speak a line, if that line has been recorded.
 * @returns {number} seconds of audio started, or 0 when nothing played.
 */
export function prepareVoice(cue, { volume = 0.95 } = {}) {
  const silent = { duration: 0, play: () => 0 };
  if (!cue) return silent;
  const fullCue = cue.startsWith(VOICE_PREFIX) ? cue : `${VOICE_PREFIX}${cue}`;
  voiceRequested.add(fullCue);
  if (!ctx) return silent;

  const chooseTake = () => {
    let bank = voiceBanks.get(fullCue);
    if (!bank || !bank.length) {
      bank = takesOf(fullCue).sort();
      if (bank.length) voiceBanks.set(fullCue, bank);
    }
    if (!bank.length) return null;
    // Never the same take twice running — that is what makes VO sound canned.
    let pick = bank[(Math.random() * bank.length) | 0];
    for (let guard = 0; bank.length > 1 && pick === voiceLast.get(fullCue) && guard < 8; guard++) {
      pick = bank[(Math.random() * bank.length) | 0];
    }
    return samples.get(pick) ? pick : bank.find((name) => samples.get(name)) || null;
  };

  const start = (pick) => {
    const buf = samples.get(pick);
    if (!buf) return 0;
    // Playback begins only when the dialogue reservation owns the floor.
    stopVoice();
    voiceLast.set(fullCue, pick);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = volume;
    /* An AnalyserNode INLINE in the voice path, so the speaker's mouth opens
     * on the amplitude that is really reaching the speakers rather than on a
     * timer -- src/core/mouth.js. The Motel has its own audio stack rather
     * than the shared AudioEngine, so it grows its own tap; one node, on the
     * one line that can be sounding at a time. */
    currentVoiceAnalyser = ctx.createAnalyser ? ctx.createAnalyser() : null;
    if (currentVoiceAnalyser) {
      currentVoiceAnalyser.fftSize = 256;
      currentVoiceAnalyser.smoothingTimeConstant = 0;
      src.connect(g).connect(currentVoiceAnalyser).connect(master);
    } else {
      src.connect(g).connect(master);
    }
    src.start();
    currentVoice = src;
    voiceUntil = ctx.currentTime + buf.duration;
    voicePlayed.push({ cue: fullCue, take: pick, duration: buf.duration });
    if (voicePlayed.length > 200) voicePlayed.shift();
    return buf.duration;
  };

  const ready = chooseTake();
  if (ready) {
    return { duration: samples.get(ready).duration, play: () => start(ready) };
  }
  /* Nothing decoded yet. A line reserved now can still be spoken four seconds
   * from now, by which time the take has usually landed, so the decision is
   * deferred to the moment it speaks rather than settled at queue time — which
   * used to condemn everything in the scene's first seconds to silence. */
  return { duration: 0, play: () => start(chooseTake()) };
}

export function voice(cue, options = {}) {
  // Compatibility callers still mean "speak now", so an unavailable pickup
  // clears the old soloist. The Motel runtime itself uses prepareVoice() and
  // only starts a take once its queued turn owns the floor.
  stopVoice();
  if (!ctx) return 0;
  const prepared = prepareVoice(cue, options);
  prepared.play();
  return prepared.duration;
}

export function stopVoice() {
  if (currentVoice) {
    try { currentVoice.stop(); } catch { /* already finished */ }
  }
  currentVoice = null;
  currentVoiceAnalyser = null;
  if (ctx) voiceUntil = ctx.currentTime;
}

/**
 * The tap on the line currently being spoken, or null when nothing is.
 * `Mouth.speak({ source, analyser })` is what reads it.
 */
export function voiceTap() {
  return currentVoice ? { source: currentVoice, analyser: currentVoiceAnalyser } : null;
}

/** True while somebody is still mid-sentence. */
export function voiceBusy() {
  return !!ctx && ctx.currentTime < voiceUntil;
}

/** Which of the cues the scene asked for actually have a recording. */
export function voiceCoverage() {
  const recorded = [...voiceRequested].filter((cue) =>
    [...voiceFiles].some((n) => n.startsWith(`${cue}.`)));
  return { requested: [...voiceRequested], recorded, onDisk: [...voiceFiles] };
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
  if (master) master.gain.value = m ? 0 : userVolume;
  syncDriveMusicVolume();
}

/** Same shape as `AudioEngine.setUserVolume`, so `bindAudioVolume` drives it. */
export function setUserVolume(v) {
  userVolume = Math.min(1, Math.max(0, Number(v) || 0));
  if (master && !muted) master.gain.setTargetAtTime(userVolume, ctx.currentTime, 0.05);
  syncDriveMusicVolume();
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

  amb = {
    hum, humGain, acSrc, rattle, acGain, airSrc, airGain, pulse, pulseGain, lfo, lfoAmt,
    tensionSrc: null, recorded: false,
    nodes: [hum, acSrc, rattle, airSrc, pulse, lfo],
  };
  /* The beds are still downloading when this runs (see `init`). Start on the
   * oscillators, then take the recordings the moment they decode. A settled
   * promise lands on the next microtask, so a restarted scene upgrades at
   * once rather than waiting for a second fetch. */
  samplesReady.then(() => upgradeAmbience());
}

/**
 * Beds that belong to a place rather than to the whole room.
 *
 * There is no oscillator arm under these four: the bottom of the drained pool,
 * the rear alley, room twelve's own tone and the television through the wall
 * of room eleven have all been drawn since the scene was built and none of
 * them has ever made a sound. The panner is the zone system -- no phase, no
 * trigger volume, no state to get wrong. Walk closer and the bed comes up.
 */
const AMBIENCE_PLACES = Object.freeze([
  ['ambience.motel.room', { x: 0, y: 1.5, z: -10 }, 0.16, 5, 14],
  ['ambience.motel.tv', { x: -7.5, y: 1.5, z: -10 }, 0.12, 3, 11],
  ['ambience.motel.pool', { x: 22, y: -2, z: 13 }, 0.2, 5, 20],
  ['ambience.motel.alley', { x: 0, y: 1.2, z: -19.5 }, 0.18, 6, 22],
]);

/**
 * Start a recording looping, or answer null if we do not have that file.
 *
 * Pass `gain` to feed an existing node -- that is how a recorded bed takes
 * over from an oscillator without anything downstream noticing: the same gain
 * keeps being the handle `setTension` tweens.
 */
function loopSample(name, {
  volume = 1, position = null, gain = null, ref = 6, maxDist = 26,
} = {}) {
  const buf = samples.get(name);
  if (!buf || !ctx) return null;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  if (gain) {
    src.connect(gain);
    src.start();
    return { src, gain };
  }
  const g = ctx.createGain();
  g.gain.value = volume;
  /* Unlike `playSample`, a bed is panned whether or not the listener has been
   * placed yet. A one-shot fired against an unset ear is a lie that lasts a
   * fifth of a second; a bed flattened for the same reason is a lie that lasts
   * the whole scene, and `setListenerPose` runs every frame regardless. */
  const p = position ? makePanner(position, ref, maxDist) : null;
  if (p) src.connect(g).connect(p).connect(master);
  else src.connect(g).connect(master);
  src.start();
  return { src, gain: g };
}

/**
 * Swap the recorded beds in over the oscillators, once they have decoded.
 *
 * Each swap feeds the gain node its oscillator was feeding and then stops the
 * oscillator, so the graph below this function is unchanged and `setTension`
 * goes on tweening the same four handles. A bed with no file on disk keeps its
 * oscillator and nobody hears the difference except in the good direction.
 */
function upgradeAmbience() {
  if (!ctx || !amb || amb.recorded) return;
  amb.recorded = true;

  const swap = (name, gain, ...oscillators) => {
    const loop = loopSample(name, { gain });
    if (!loop) return null;
    for (const osc of oscillators) {
      if (!osc) continue;
      try { osc.stop(); } catch { /* already stopped */ }
    }
    amb.nodes.push(loop.src);
    return loop.src;
  };

  swap('ambience.motel.neon', amb.humGain, amb.hum);
  /* The loose panel rattles inside the recording, so the tremolo LFO that was
   * standing in for it goes out with the noise buffer it was modulating. */
  swap('ambience.motel.ac', amb.acGain, amb.acSrc, amb.rattle);
  swap('ambience.motel.night', amb.airGain, amb.airSrc);
  /* The suspense bed is the one arm that loses something real to a recording:
   * a sine's pulse could speed up with the suspicion meter and a rendered one
   * cannot. `setTension` drives `playbackRate` instead, which is the same
   * promise the brief made -- "a low pulse that speeds up as the room turns". */
  const tensionSrc = swap('ambience.motel.tension', amb.pulseGain, amb.pulse, amb.lfo);
  if (tensionSrc) {
    amb.tensionSrc = tensionSrc;
    amb.lfo = null;
    amb.lfoAmt = null;
  }

  for (const [name, position, volume, ref, maxDist] of AMBIENCE_PLACES) {
    const loop = loopSample(name, { volume, position, ref, maxDist });
    if (loop) amb.nodes.push(loop.src);
  }
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
  /* Two arms, one heartbeat. The oscillator bed speeds up by moving its LFO;
   * the recorded bed speeds up by playing faster. Whichever is in, the other
   * one's handles are null -- unguarded, this threw a TypeError on every
   * suspicion write, which is a thing `setTension`'s callers would never see. */
  if (amb.lfoAmt) amb.lfoAmt.gain.setTargetAtTime(0.03 + tension * 0.06, t, 0.4);
  if (amb.lfo) amb.lfo.frequency.setTargetAtTime(1.0 + tension * 1.6, t, 0.6);
  if (amb.tensionSrc) amb.tensionSrc.playbackRate.setTargetAtTime(0.92 + tension * 0.3, t, 0.6);
  amb.airGain.gain.setTargetAtTime(0.035 * (1 - tension * 0.8), t, 0.8);
  amb.acGain.gain.setTargetAtTime(0.05 * (1 - tension * 0.55), t, 0.8);
}

// ---------- One-shots ----------

export function knock() {
  if (!ctx) return;
  if (playSample('door.knock.motel', { volume: 0.85 })) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    tone(t + i * 0.19, { type: 'sine', from: 150, to: 60, dur: 0.09, peak: 0.32 });
    noise(t + i * 0.19, { peak: 0.16, attack: 0.002, decay: 0.07, freq: 900, type: 'bandpass', q: 1.4 });
  }
}

export function doorOpen() {
  if (!ctx) return;
  if (playSample('door.open.motel', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.1, attack: 0.03, decay: 0.35, freq: 700, type: 'bandpass', q: 1.2 });
  tone(t, { type: 'triangle', from: 210, to: 160, dur: 0.3, peak: 0.05 });
}

export function doorSlam() {
  if (!ctx) return;
  if (playSample('door.slam', { volume: 0.9 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 130, to: 38, dur: 0.24, peak: 0.5 });
  noise(t, { peak: 0.32, attack: 0.002, decay: 0.2, freq: 500, type: 'lowpass' });
}

export function lockClick() {
  if (!ctx) return;
  if (playSample('door.locked', { volume: 0.6 })) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.2, attack: 0.001, decay: 0.04, freq: 2600, type: 'bandpass', q: 3 });
  tone(t + 0.05, { type: 'square', from: 420, to: 300, dur: 0.05, peak: 0.06 });
}

export function punch(heavy = false) {
  if (!ctx) return;
  if (playSample(heavy ? 'punch.heavy' : 'punch.light', { volume: heavy ? 0.9 : 0.7 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: heavy ? 150 : 120, to: 40, dur: 0.16, peak: heavy ? 0.5 : 0.34 });
  noise(t, { peak: heavy ? 0.32 : 0.2, attack: 0.002, decay: 0.14, freq: 420, type: 'lowpass' });
  noise(t + 0.01, { peak: 0.09, attack: 0.002, decay: 0.07, freq: 2200, type: 'bandpass', q: 2 });
}

export function whiff() {
  if (!ctx) return;
  if (playSample('swing.whiff', { volume: 0.5 })) return;
  noise(ctx.currentTime, { peak: 0.1, attack: 0.02, decay: 0.12, freq: 1100, type: 'bandpass', q: 2 });
}

export function bodyFall() {
  if (!ctx) return;
  if (playSample('body.fall.carpet', { volume: 0.8 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 95, to: 30, dur: 0.3, peak: 0.34 });
  noise(t, { peak: 0.22, attack: 0.004, decay: 0.26, freq: 340, type: 'lowpass' });
}

export function glassSmash() {
  if (!ctx) return;
  if (playSample('siege.glass.shatter', { volume: 0.8 })) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.3, attack: 0.001, decay: 0.35, freq: 5200, type: 'highpass' });
  for (let i = 0; i < 6; i++) {
    tone(t + i * 0.045, { type: 'triangle', from: 2400 + Math.random() * 2600, to: 1200, dur: 0.09, peak: 0.05 });
  }
}

export function woodBreak() {
  if (!ctx) return;
  if (playSample('wood.break', { volume: 0.8 })) return;
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
  if (playSample('slicer.spin', { volume: 0.7 })) return;
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
  if (playSample('tv.static', { volume: 0.6 })) return;
  noise(ctx.currentTime, { peak: 0.09, attack: 0.02, decay: 0.6, freq: 3000, type: 'highpass' });
}

export function packaging() {
  if (!ctx) return;
  if (playSample('vacuum.pack.handle', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 5; i++) {
    noise(t + i * 0.04 + Math.random() * 0.02, {
      peak: 0.07, attack: 0.001, decay: 0.05, freq: 4200, type: 'highpass',
    });
  }
}

export function chew() {
  if (!ctx) return;
  if (playSample('jerky.chew', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    noise(t + i * 0.16, { peak: 0.05, attack: 0.01, decay: 0.1, freq: 700, type: 'lowpass' });
  }
}

export function iceDrop() {
  if (!ctx) return;
  if (playSample('ice.drop', { volume: 0.5 })) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 4; i++) {
    tone(t + i * 0.06 + Math.random() * 0.03, {
      type: 'triangle', from: 900 + Math.random() * 700, to: 400, dur: 0.07, peak: 0.05,
    });
  }
}

export function plumbing() {
  if (!ctx) return;
  if (playSample('pipe.knock.cistern', { volume: 0.45 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 180, to: 120, dur: 0.9, peak: 0.05 });
  noise(t, { peak: 0.05, attack: 0.2, decay: 0.8, freq: 900, type: 'bandpass', q: 1.5 });
}

export function knifeTap() {
  if (!ctx) return;
  if (playSample('knife.tap', { volume: 0.6 })) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    tone(t + i * 0.22, { type: 'square', from: 1500, to: 1400, dur: 0.03, peak: 0.05 });
  }
}

export function siren(far = true) {
  if (!ctx) return;
  if (playSample(far ? 'siren.distant' : 'siren.close', { volume: far ? 0.35 : 0.8 })) return;
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

// Heavy feet. The surface changes the texture; a quiet low thump carries the
// weight so the bright recorded transient never has to be turned up to do it.
const STEP_SURFACES = {
  concrete: { freq: 440, peak: 0.060, tone: 64 },
  carpet: { freq: 220, peak: 0.052, tone: 58 },
  tile: { freq: 720, peak: 0.055, tone: 68 },
  asphalt: { freq: 520, peak: 0.058, tone: 61 },
  pool: { freq: 680, peak: 0.062, tone: 64 },
  stairs: { freq: 600, peak: 0.060, tone: 70 },
};

/* Small banks keep consecutive steps from repeating the same bright edge.
 * The old mapping ran a single tile/rug/wood file at 0.5 gain every time;
 * those full-volume transients are the fork-on-a-plate sound from the
 * playtest. These are surface texture at 0.14-0.2, not the whole foot. */
const STEP_SAMPLES = {
  concrete: ['motel.footstep.concrete.a', 'motel.footstep.concrete.b'],
  asphalt: ['motel.footstep.asphalt.a', 'motel.footstep.asphalt.b'],
  carpet: ['motel.footstep.carpet.a', 'motel.footstep.carpet.b'],
  tile: ['motel.footstep.tile.a', 'motel.footstep.tile.b'],
  stairs: ['motel.footstep.stairs.a', 'motel.footstep.stairs.b'],
  pool: ['motel.footstep.pool.a', 'motel.footstep.pool.b'],
};

const lastStepAt = new Map();
const lastStepSample = new Map();

export function step(surface = 'concrete', {
  sourceId = 'player', position = null, running = false, volume = 1,
} = {}) {
  if (!ctx) return false;
  const now = ctx.currentTime;
  const minGap = running ? 0.245 : 0.31;
  if (now - (lastStepAt.get(sourceId) ?? -Infinity) < minGap) {
    recordAudioEvent('step-suppressed', { sourceId, surface });
    return false;
  }
  lastStepAt.set(sourceId, now);

  const bank = STEP_SAMPLES[surface] || STEP_SAMPLES.concrete;
  let recorded = bank[(Math.random() * bank.length) | 0];
  if (bank.length > 1 && recorded === lastStepSample.get(sourceId)) {
    recorded = bank[(bank.indexOf(recorded) + 1) % bank.length];
  }
  lastStepSample.set(sourceId, recorded);
  const actorMix = sourceId === 'player' ? 1 : 0.72;
  const sampleVolume = (running ? 0.20 : 0.16) * actorMix * volume;
  const played = playSample(recorded, {
    volume: sampleVolume,
    rate: (running ? 0.91 : 0.84) + (Math.random() - 0.5) * 0.08,
    position,
    ref: 2.4,
    maxDist: 24,
  });
  const s = STEP_SURFACES[surface] || STEP_SURFACES.concrete;
  /* The synthetic weight stays intentionally soft and low. Positional texture
   * supplies location for NPCs; this layer is felt more than located. */
  tone(now, {
    type: 'sine', from: s.tone, to: s.tone * 0.48,
    dur: running ? 0.12 : 0.15, peak: s.peak * actorMix * volume,
  });
  noise(now, {
    peak: s.peak * 0.26 * actorMix * volume,
    attack: 0.004, decay: 0.065, freq: s.freq, type: 'lowpass',
  });
  recordAudioEvent('step', {
    sourceId, surface, running, sample: played ? recorded : null,
    volume: Number(sampleVolume.toFixed(3)), positional: !!position,
  });
  return true;
}

// Take-off and landing. `hard` is a big drop from the balcony or into the pool.
export function land(hard = false) {
  if (!ctx) return;
  if (hard && playSample('land.heavy', { volume: 0.9 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: hard ? 110 : 80, to: 26, dur: hard ? 0.34 : 0.16, peak: hard ? 0.5 : 0.2 });
  noise(t, { peak: hard ? 0.3 : 0.12, attack: 0.002, decay: hard ? 0.3 : 0.12, freq: 420, type: 'lowpass' });
}

// Two large bodies wrestling over a suitcase.
export function grapple() {
  if (!ctx) return;
  if (playSample('grapple.struggle', { volume: 0.6 })) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.16, attack: 0.02, decay: 0.22, freq: 900, type: 'bandpass', q: 0.8 });
  tone(t, { type: 'sine', from: 130, to: 90, dur: 0.2, peak: 0.16 });
}

// A jar of classified seasoning going into somebody's eyes.
export function spice() {
  if (!ctx) return;
  if (playSample('spice.throw', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.22, attack: 0.004, decay: 0.4, freq: 3400, type: 'highpass' });
  tone(t, { type: 'triangle', from: 620, to: 240, dur: 0.2, peak: 0.08 });
}

// A television taking a man and dying.
export function tvBreak() {
  if (!ctx) return;
  if (playSample('tv.implode', { volume: 0.85 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'square', from: 900, to: 90, dur: 0.24, peak: 0.22 });
  noise(t, { peak: 0.34, attack: 0.001, decay: 0.5, freq: 4200, type: 'highpass' });
  noise(t + 0.05, { peak: 0.2, attack: 0.01, decay: 0.6, freq: 500, type: 'lowpass' });
}

// Ceiling fan overspeeding, then throwing sparks.
export function sparks() {
  if (!ctx) return;
  if (playSample('fan.sparks', { volume: 0.7 })) return;
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
  if (playSample('neon.short', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'square', from: 120, to: 30, dur: 0.3, peak: 0.35 });
  noise(t, { peak: 0.3, attack: 0.001, decay: 0.4, freq: 3000, type: 'highpass' });
  tone(t + 0.1, { type: 'sawtooth', from: 61, to: 20, dur: 0.9, peak: 0.1 }); // the hum dying
}

// The Reserve meeting an open flame.
export function fire() {
  if (!ctx) return;
  if (playSample('shipment.burn', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.3, attack: 0.08, decay: 1.6, freq: 900, type: 'lowpass' });
  noise(t + 0.1, { peak: 0.12, attack: 0.1, decay: 1.4, freq: 2600, type: 'highpass' });
  tone(t, { type: 'sine', from: 90, to: 40, dur: 0.6, peak: 0.2 });
}

// Stun prod arcing.
export function prod() {
  if (!ctx) return;
  if (playSample('stunprod.arc', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 5; i++) {
    noise(t + i * 0.03, { peak: 0.14, attack: 0.001, decay: 0.04, freq: 6000, type: 'highpass' });
  }
  tone(t, { type: 'square', from: 90, to: 60, dur: 0.18, peak: 0.1 });
}

// Suitcase latches.
export function caseLatch() {
  if (!ctx) return;
  if (playSample('silent.case.latches', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  for (const d of [0, 0.11]) {
    tone(t + d, { type: 'square', from: 1400, to: 900, dur: 0.04, peak: 0.09 });
    noise(t + d, { peak: 0.1, attack: 0.001, decay: 0.05, freq: 3200, type: 'bandpass', q: 2 });
  }
}

// One deliberate bite of eleven-year cure.
export function bite() {
  if (!ctx) return;
  if (playSample('jerky.bite', { volume: 0.8 })) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.22, attack: 0.002, decay: 0.14, freq: 2200, type: 'bandpass', q: 0.7 });
  noise(t + 0.18, { peak: 0.1, attack: 0.01, decay: 0.3, freq: 800, type: 'lowpass' });
  tone(t, { type: 'triangle', from: 180, to: 90, dur: 0.12, peak: 0.08 });
}

// Heavy car door. One door voice at a time: arrival and exit can happen less
// than a frame of input apart, and stacking the same metallic transient makes
// a flanged scrape that sounds like collision geometry.
let lastCarDoorAt = -Infinity;
export function carDoor() {
  if (!ctx) return false;
  const now = ctx.currentTime;
  if (now - lastCarDoorAt < 0.48) {
    recordAudioEvent('car-door-suppressed');
    return false;
  }
  lastCarDoorAt = now;
  recordAudioEvent('car-door');
  if (playSample('car.door', { volume: 0.52 })) return true;
  const t = ctx.currentTime;
  noise(t, { peak: 0.10, attack: 0.01, decay: 0.16, freq: 1000, type: 'bandpass', q: 1.0 });
  tone(t + 0.16, { type: 'sine', from: 110, to: 45, dur: 0.2, peak: 0.24 });
  return true;
}

// Crawling through the pool drain.
export function tunnel() {
  if (!ctx) return;
  if (playSample('tunnel.crawl', { volume: 0.6 })) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.16, attack: 0.15, decay: 1.4, freq: 600, type: 'lowpass' });
  for (let i = 0; i < 4; i++) {
    tone(t + 0.2 + i * 0.32, { type: 'sine', from: 300 + Math.random() * 200, to: 140, dur: 0.12, peak: 0.05 });
  }
}

// Hammer on an empty chamber.
export function dryFire() {
  if (!ctx) return;
  if (playSample('gun.dry', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  noise(t, { peak: 0.12, attack: 0.001, decay: 0.03, freq: 3600, type: 'bandpass', q: 3 });
  tone(t, { type: 'square', from: 520, to: 380, dur: 0.04, peak: 0.05 });
}

// Shards settling a second after the window goes.
export function glassSettle() {
  if (!ctx) return;
  if (playSample('glass.settle', { volume: 0.6 })) return;
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
  if (playSample('door.splinter', { volume: 0.9 })) return;
  const t = ctx.currentTime;
  tone(t, { type: 'sine', from: 140, to: 34, dur: 0.35, peak: 0.5 });
  noise(t, { peak: 0.34, attack: 0.002, decay: 0.3, freq: 1400, type: 'bandpass', q: 0.7 });
  noise(t + 0.06, { peak: 0.18, attack: 0.005, decay: 0.4, freq: 500, type: 'lowpass' });
}

// A window sliding open an inch, and stopping.
export function windowSlide() {
  if (!ctx) return;
  if (playSample('window.slide', { volume: 0.6 })) return;
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
  if (playSample('ui.objective', { volume: 0.6 })) return;
  const t = ctx.currentTime;
  [523, 784].forEach((f, i) => tone(t + i * 0.1, { type: 'sine', from: f, to: f, dur: 0.2, peak: 0.09 }));
}

export function achievement() {
  if (!ctx) return;
  if (playSample('ui.achievement', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  [659, 784, 988, 1319].forEach((f, i) => {
    tone(t + i * 0.08, { type: 'triangle', from: f, to: f, dur: 0.24, peak: 0.08 });
  });
}

export function alarm() {
  if (!ctx) return;
  if (playSample('alarm.counter', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 4; i++) {
    tone(t + i * 0.26, { type: 'square', from: 980, to: 980, dur: 0.16, peak: 0.09 });
  }
}

export function sting() {
  if (!ctx) return;
  if (playSample('sting.scene.end', { volume: 0.8 })) return;
  const t = ctx.currentTime;
  [110, 138.6, 164.8, 220].forEach((f, i) => {
    tone(t + i * 0.13, { type: 'sawtooth', from: f, to: f, dur: 0.4, peak: 0.12 });
  });
}

// ---------- The props that were drawn but never heard ----------
//
// Nine briefs in `assets/audio/sound-queue.json` carried no `call` for as long
// as the queue has existed. Every one of them is built in `src/motel/level.js`
// -- a butcher's cleaver, a shower curtain on a rod, a wax seal, the counter
// sealer, the uneven ceiling fan, eight dripping air conditioners, the vending
// machine and the second car in the lot -- and every one of them was either
// silent or borrowed somebody else's sound. `sfx.packaging()` was standing in
// for tearing a curtain off a wall.
//
// These are recordings only. There is no oscillator arm underneath them, and
// writing eight of them would be inventing a fallback for sounds that never
// had one: if a file is missing these props go back to the silence they have
// had all along, which costs the scene exactly what it already cost.

export function cleaverSwipe(position = null) {
  playSample('cleaver.swipe', { volume: 0.8, position });
}

export function curtainRip(position = null) {
  playSample('curtain.rip', { volume: 0.75, position });
}

export function jerkyBend() {
  playSample('jerky.bend', { volume: 0.8 });
}

export function waxSeal() {
  playSample('wax.seal.break', { volume: 0.8 });
}

export function sealerRun(position = null) {
  playSample('sealer.run', { volume: 0.4, position, ref: 2.5, maxDist: 16 });
}

export function fanClick(position = null) {
  playSample('fan.click', { volume: 0.25, position, ref: 2, maxDist: 12 });
}

export function acDrip(position = null) {
  playSample('ac.drip', { volume: 0.35, position, ref: 2, maxDist: 18 });
}

export function vendingBump(position = null) {
  playSample('vending.bump', { volume: 0.4, position, ref: 3, maxDist: 22 });
}

/**
 * The second car in the lot, idling with nobody in it.
 *
 * `car.engine.idle` is already that recording, already seamless, and already
 * in this scene's sample list. The brief gets the code hook it was missing
 * rather than a second idle nobody could pick out of a line-up next to the
 * first. Idempotent: the lot has one second car, so it starts once and stops
 * with the rest of the ambience.
 */
export function engineIdle(position = null) {
  if (!amb || amb.lotIdle) return;
  const loop = loopSample('car.engine.idle', {
    volume: 0.22, position, ref: 5, maxDist: 30,
  });
  if (!loop) return;
  amb.lotIdle = loop.src;
  amb.nodes.push(loop.src);
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

function syncDriveMusicVolume() {
  if (!driveMusic) return;
  driveMusic.volume = muted ? 0 : DRIVE_MUSIC_VOLUME * userVolume;
}

function ensureDriveMusic() {
  if (driveMusic || typeof Audio === 'undefined') return driveMusic;
  driveMusic = new Audio(DRIVE_MUSIC_URL);
  driveMusic.preload = 'auto';
  driveMusic.loop = true;
  driveMusic.dataset.role = 'non-diegetic-score';
  syncDriveMusicVolume();
  return driveMusic;
}

export function startDriveMusic() {
  const track = ensureDriveMusic();
  if (!track) return false;
  syncDriveMusicVolume();
  const started = track.play();
  if (started?.catch) started.catch(() => {});
  recordAudioEvent('music-start', {
    url: DRIVE_MUSIC_URL, volume: DRIVE_MUSIC_VOLUME, diegetic: false,
  });
  return true;
}

export function stopDriveMusic({ rewind = true } = {}) {
  if (!driveMusic) return;
  driveMusic.pause();
  if (rewind) {
    try { driveMusic.currentTime = 0; } catch { /* metadata not ready */ }
  }
  recordAudioEvent('music-stop', { url: DRIVE_MUSIC_URL });
}

export function driveMusicStatus() {
  return {
    url: DRIVE_MUSIC_URL,
    volume: driveMusic?.volume ?? (muted ? 0 : DRIVE_MUSIC_VOLUME * userVolume),
    playing: !!driveMusic && !driveMusic.paused,
    loop: driveMusic?.loop ?? true,
    diegetic: false,
  };
}

export function setMusic(mode) {
  if (musicMode === mode) return;
  if (musicMode === 'chase') stopDriveMusic();
  musicMode = mode;
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  if (!ctx || mode === 'none') return;

  /* The authored track replaces the procedural chase loop. It is score, not
   * a car radio: no panner, no vehicle source, and a deliberately low 0.16
   * scene gain under engine noise and dialogue. */
  if (mode === 'chase') {
    startDriveMusic();
    return;
  }

  const bpm = mode === 'tense' ? 84 : 138;
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
  stopDriveMusic();
  stopEngine();
  stopAmbience();
}
