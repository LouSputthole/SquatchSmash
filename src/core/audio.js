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
import { loadJson, assetUrl, isBundled } from './assets.js';
import { loadOnceRetriable, runWorkerPool } from './load-queue.js';
import { bindAudioVolume } from './settings.js';
import { registerSceneAudioContext } from './scene-lifecycle.js';

/** Scratch for readWorldPosition, which runs per follower per frame. */
const _follow = new THREE.Vector3();

/**
 * The world position of whatever a caller handed us: an Object3D (a character,
 * a radio on a moving cart), a plain {x,y,z}, or a function returning either
 * so a caller can defer the lookup. Returns null for anything else, which is
 * how play() decides a sound is not positional at all.
 */
function readWorldPosition(target) {
  if (!target) return null;
  if (typeof target === 'function') return readWorldPosition(target());
  if (typeof target.getWorldPosition === 'function') return target.getWorldPosition(_follow);
  if (typeof target.x === 'number' && typeof target.y === 'number'
    && typeof target.z === 'number') return target;
  if (target.position) return readWorldPosition(target.position);
  return null;
}

const SFX_DIR = 'assets/sfx/';

/**
 * The bytes out of a `data:...;base64,...` URI, without going through fetch().
 *
 * fetch() handles data: URIs perfectly well, but it is a fetch, so it answers
 * to connect-src -- and a page served with a strict policy can refuse it even
 * though the bytes are already sitting in the document. atob is just string
 * work and nothing can block it.
 */
function decodeDataUri(uri) {
  const comma = uri.indexOf(',');
  if (comma < 0) return null;
  const body = uri.slice(comma + 1);
  const bin = uri.slice(0, comma).includes(';base64')
    ? atob(body)
    : decodeURIComponent(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * The one trim every spoken line in the game passes through.
 *
 * Set once, here, rather than nine times across nine scenes. It sits a little
 * under the sfx bus because dialogue is recorded hot and a limiter is not a
 * mix.
 */
export const VOICE_BUS_GAIN = 0.85;

/**
 * How far music and ambience step back while somebody is talking.
 *
 * A duck, not a mute: the room is still there behind him. 0.45 on music and
 * 0.62 on ambience is roughly seven and four decibels, which is enough to
 * clear a voice without the player noticing the bed move.
 */
export const VOICE_DUCK = Object.freeze({ music: 0.45, ambience: 0.62 });
/** Down fast enough to be under the first syllable, up slow enough to hide. */
export const VOICE_DUCK_ATTACK_S = 0.12;
export const VOICE_DUCK_RELEASE_S = 0.55;
/** How long after the last line ends before the bed comes back up. */
export const VOICE_DUCK_HOLD_S = 0.35;

/** The exhaustive delivery kinds written to `playbackReceipts`. */
export const AUDIO_PLAYBACK_SOURCE = Object.freeze({
  BUFFER: 'buffer',
  SYNTH: 'synth',
  STAND_IN: 'stand-in',
  SILENT: 'silent',
});

/** A required authored recording reached anything other than its own buffer. */
export class RequiredRecordedAudioError extends Error {
  constructor(receipt) {
    super(`Required recorded audio ${receipt.requested} used ${receipt.source}`);
    this.name = 'RequiredRecordedAudioError';
    this.receipt = receipt;
  }
}

/**
 * Cue namespaces that ARE dialogue.
 *
 * `vo.` is the bulk of it and always has been. The rest of the game names its
 * cues by scene rather than by kind -- `heist.snow.commit` is a line and
 * `heist.cash.lift` is a sound effect, and both start with `heist.` -- so a
 * prefix test cannot classify those and does not try. Anything outside this
 * list declares itself by passing `bus: 'voice'`, which is what
 * `src/core/dialogue.js` does for every line it plays.
 */
const VOICE_CUE_PREFIXES = Object.freeze(['vo.']);

export function isVoiceCue(name, opts = {}) {
  if (opts.bus === 'voice') return true;
  if (opts.bus) return false;
  const cue = String(name ?? '');
  return VOICE_CUE_PREFIXES.some((prefix) => cue.startsWith(prefix));
}

function receiptPosition(target) {
  try {
    const at = readWorldPosition(target);
    return at ? Object.freeze({ x: at.x, y: at.y, z: at.z }) : null;
  } catch {
    /* Evidence must never make a previously ignored not-ready request throw
     * because a deferred scene object cannot be resolved yet. */
    return null;
  }
}

function receiptPositioning(opts = {}, facts = {}) {
  /* Evidence collection must be inert. A deferred `follow` callback was
   * already resolved by play() when a source was routed; invoking it again
   * here can advance scene-owned state, and invoking it on an early return can
   * touch a cast that does not exist yet. Static requested positions remain
   * useful on silent receipts. */
  const target = Object.hasOwn(facts, 'positionalSeed')
    ? facts.positionalSeed
    : (typeof opts.position === 'function' ? null : (opts.position ?? null));
  const position = receiptPosition(target);
  return Object.freeze({
    enabled: position !== null,
    position,
    follows: opts.follow != null,
    ref: opts.ref ?? 1.4,
    maxDist: opts.maxDist ?? 18,
    rolloff: opts.rolloff ?? 1.4,
    distanceModel: opts.distanceModel ?? 'inverse',
  });
}

export class AudioEngine {
  constructor(options = {}) {
    /* Browser certification installs this policy before scene modules load.
     * Runtime remains opt-in; QA no longer needs every scene root to expose
     * its private AudioEngine merely to make required-recording fallback
     * fail closed. */
    const qaPolicy = globalThis.__SQUATCH_QA_AUDIO__ ?? null;
    const strictQa = options?.strictQa ?? qaPolicy?.strictRequiredRecordings ?? false;
    const onQaViolation = options?.onQaViolation ?? qaPolicy?.onViolation ?? null;
    this.ctx = null;
    this.ready = false;
    this.buffers = new Map();
    this.loops = new Map();
    /** Output gain for each active one-shot source, without changing play()'s API. */
    this.playbackGains = new WeakMap();
    /* An AnalyserNode sitting INLINE in the chain of a voice playback, so the
     * shared mouth system (src/core/mouth.js) can open a character's mouth on
     * the amplitude that is really reaching the speakers rather than on a
     * timer. Weak, and keyed by the source, so it dies with the line: one
     * analyser per line being spoken, never one per character. */
    this.playbackAnalysers = new WeakMap();
    /** The PannerNode of each active one-shot, so a started sound can be moved. */
    this.playbackPanners = new WeakMap();
    /* One-shots that have asked to FOLLOW something that moves. A panner's
     * position is set once at play() time, which is correct for a gunshot and
     * wrong for every line spoken by a walking character or played out of a
     * moving vehicle: the sound is pinned to wherever the speaker was when the
     * clip started, and the listener drives away from it. Entries here are
     * re-sampled every frame and drop themselves when the source ends. */
    this._following = new Set();
    this._followPump = null;
    this.manifest = { sfx: [] };
    this.loadedCount = 0;
    /* Every cue that was SUPPOSED to decode and did not: a 404, a truncated
     * file, a decode failure. `loadedCount` only ever counts successes, so
     * without this a corrupted mp3 is indistinguishable from a cue that was
     * never recorded — permanently silent, and nothing anywhere says so.
     * Verifiers assert this stays empty ({ name, reason } per failure). */
    this.failedCues = [];
    this._manifestLoadPromise = null;
    this._availableFiles = null;
    this._additionalLoads = new Map();
    this._lastStep = 0;
    /* A small, factual record of sample playback.  `voLog` says that a scene
     * asked for a line; this says whether a decoded buffer was really put on
     * the audible graph and whether it was allowed to finish.  It is useful
     * both for the browser verifier and for finding a future accidental
     * interruption without pretending a headless browser can hear speakers. */
    this.playbacks = [];
    /** Every request, including fallback and silence, in call order. */
    this.playbackReceipts = [];
    this._playbackReceiptId = 0;
    /** Strict-QA failures remain inspectable even when the caller catches. */
    this.qaViolations = [];
    this.strictQa = strictQa === true;
    this.onQaViolation = typeof onQaViolation === 'function' ? onQaViolation : null;
    if (Array.isArray(qaPolicy?.engines)) qaPolicy.engines.push(this);
    /* Two numbers multiply into the master gain: the scene's own level (its
     * mute toggles call setMasterVolume) and the player's volume setting
     * (src/core/settings.js), so an unmute puts the level back to what the
     * player chose rather than to 0.9. */
    this.masterLevel = 0.9;
    this.userVolume = 1;
    /* Subscribed from init(), not from here: a subscription taken in the
     * constructor is never released, so every engine ever built stays in the
     * settings store's listener set for the life of the process — three of
     * them at once in the test runner, each answering a volume change on a
     * context it never opened. */
    this._unbindVolume = null;
  }

  get lastPlaybackReceipt() {
    return this.playbackReceipts.at(-1) ?? null;
  }

  /** Receipt-aware companion to `play()`; `play()` itself keeps returning its legacy handle. */
  playWithReceipt(name, opts = {}) {
    const before = this._playbackReceiptId;
    const source = this.play(name, opts);
    const receipt = this.lastPlaybackReceipt;
    return {
      source,
      receipt: receipt?.id > before ? receipt : null,
    };
  }

  _recordPlaybackReceipt(name, opts, facts) {
    const requested = String(opts.requestedCue ?? name);
    const voice = isVoiceCue(name, opts);
    const receiptSource = opts.receiptSource === AUDIO_PLAYBACK_SOURCE.STAND_IN
      ? AUDIO_PLAYBACK_SOURCE.STAND_IN : facts.source;
    const receipt = Object.freeze({
      id: ++this._playbackReceiptId,
      requested,
      actual: facts.actual ?? null,
      source: receiptSource,
      /* Direct VO calls are still required in strict QA. That makes bypassing
       * `speak()` observable instead of turning a local dialogue fork into an
       * escape hatch from recording validation. Callers may explicitly mark
       * a deliberately procedural voice with requiredRecorded:false. */
      requiredRecorded: opts.requiredRecorded ?? voice,
      started: facts.started === true,
      fallbackReason: opts.fallbackReason ?? facts.fallbackReason ?? null,
      scheduledAt: facts.scheduledAt ?? null,
      voice,
      speakerId: opts.speakerId ?? null,
      ambient: opts.ambientVoice === true,
      positional: receiptPositioning(opts, facts),
    });
    this.playbackReceipts.push(receipt);
    if (this.playbackReceipts.length > 256) this.playbackReceipts.shift();
    const deliveredRequestedRecording = receipt.source === AUDIO_PLAYBACK_SOURCE.BUFFER
      && receipt.actual === receipt.requested;
    if (this.strictQa && receipt.requiredRecorded && !deliveredRequestedRecording) {
      this.qaViolations.push(receipt);
      if (this.qaViolations.length > 256) this.qaViolations.shift();
      let reportError = null;
      try { this.onQaViolation?.(receipt); } catch (error) { reportError = error; }
      const failure = new RequiredRecordedAudioError(receipt);
      if (reportError) failure.reportError = reportError;
      throw failure;
    }
    return receipt;
  }

  /** Opt into or out of fail-closed required-recording checks at runtime. */
  setStrictQa(enabled = true, { onViolation = this.onQaViolation } = {}) {
    this.strictQa = enabled === true;
    this.onQaViolation = typeof onViolation === 'function' ? onViolation : null;
    return this.strictQa;
  }

  /** Must be called from a user gesture (browsers block autoplay otherwise). */
  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    registerSceneAudioContext(this.ctx);

    /* Before the master gain is created below, so it opens at the volume the
     * player chose. The kept handle is both the once-guard and the only way
     * to release the subscription. */
    this._unbindVolume ??= bindAudioVolume(this);

    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterLevel * this.userVolume;

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
    /* THE VOICE BUS.
     *
     * Every spoken line in the game used to arrive on `busSfx` at whatever
     * per-call gain its scene happened to type: 0.95 in the Initiation, 0.9 in
     * the Silver Case and the siege, 0.85 in the heist, 0.8 in Silent Squatch,
     * 0.85 by default in `say()`. Nothing was wrong with any one of those and
     * the result was a game where the volume of a line depended on which scene
     * you were standing in.
     *
     * One bus fixes it in the only place it can be fixed: the graph. Dialogue
     * now has a single trim that a mix change moves ONCE, and a per-call
     * `volume` goes back to meaning what it should always have meant --
     * this line is quieter than normal, because he is behind a door -- rather
     * than being each scene's guess at how loud dialogue is.
     *
     * It also gives the ducking below something to key off. You cannot duck
     * music under dialogue when dialogue is indistinguishable from a
     * footstep. */
    this.busVoice = this.ctx.createGain();
    this.busSfx.gain.value = 1.0;
    this.busAmb.gain.value = 0.55;
    this.busMusic.gain.value = 0.7;
    this.busVoice.gain.value = VOICE_BUS_GAIN;
    /* The bus `play()` compares against before it reroutes -- see the note in
     * `play()`. A scene send (the reinforced glass in Silent Squatch, the
     * suppressor in the Palace) works by swapping `busSfx` for the duration of
     * one call, and rerouting out from under it would silently unhook it. */
    this._busSfxDefault = this.busSfx;

    // A muffling filter on everything, used when the player is "inside" the
    // arcade game and the room should recede.
    this.duck = this.ctx.createBiquadFilter();
    this.duck.type = 'lowpass';
    this.duck.frequency.value = 20000;

    for (const bus of [this.busSfx, this.busAmb, this.busMusic, this.busVoice]) {
      bus.connect(this.duck);
    }
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
  loadManifest({ names = null, prefixes = [], filter = null } = {}) {
    // A transient failure may be retried, while a successful load remains
    // immutable for this page and coalesces double-clicked starts.
    return loadOnceRetriable(
      this,
      '_manifestLoadPromise',
      () => this._loadManifestOnce({ names, prefixes, filter }),
    );
  }

  async _loadManifestOnce({ names = null, prefixes = [], filter = null } = {}) {
    this.manifest = (await loadJson(SFX_DIR, 'manifest.json')) || this.manifest;

    const allCues = this.manifest.sfx || [];
    const selectedNames = names ? new Set(names) : null;
    /* `filter` widens a names/prefixes selection rather than narrowing it, so
     * a scene can say "my own dialogue prefix, plus every shared effect" —
     * the shared pool has no common prefix to name. */
    const cues = selectedNames || prefixes.length || filter
      ? allCues.filter((cue) => selectedNames?.has(cue.name)
        || prefixes.some((prefix) => cue.name.startsWith(prefix))
        || (filter ? filter(cue) : false))
      : allCues;
    let wanted;
    if (isBundled()) {
      /* A bundle has no folder to look in. Whatever was baked in is a data
       * URI on the cue itself; everything else has no file anywhere and goes
       * to the synth without a request. */
      wanted = cues.filter((cue) => /^data:/.test(cue.file || ''));
    } else {
      const index = await loadJson(SFX_DIR, 'index.json');
      const available = index ? new Set(index.files || []) : null;
      this._availableFiles = available;
      this._fileVersions = index?.versions || {};
      wanted = available
        ? cues.filter((cue) => available.has(cue.file || `${cue.name}.mp3`))
        : cues;
    }

    await this._loadWanted(wanted, 24);
    return { total: cues.length, loaded: this.loadedCount };
  }

  /**
   * Decode another narrow manifest slice after the first playable slice has
   * loaded. This deliberately does not replace loadManifest(): most scenes
   * still want one immutable bank. Large, chaptered scenes can put Hole/Act 1
   * on the critical path and prefetch later dialogue after interaction begins.
   */
  async loadAdditional({ names = null, prefixes = [] } = {}) {
    if (this._manifestLoadPromise) await this._manifestLoadPromise;
    else {
      this.manifest = (await loadJson(SFX_DIR, 'manifest.json')) || this.manifest;
      if (!isBundled()) {
        const index = await loadJson(SFX_DIR, 'index.json');
        this._availableFiles = index ? new Set(index.files || []) : null;
        this._fileVersions = index?.versions || {};
      }
    }

    const selectedNames = names ? new Set(names) : null;
    const key = JSON.stringify([
      selectedNames ? [...selectedNames].sort() : null,
      [...prefixes].sort(),
    ]);
    if (this._additionalLoads.has(key)) return this._additionalLoads.get(key);

    const task = (async () => {
      const cues = (this.manifest.sfx || []).filter((cue) => (
        (selectedNames?.has(cue.name) || prefixes.some((prefix) => cue.name.startsWith(prefix)))
        && !this.buffers.has(cue.name)
      ));
      const wanted = isBundled()
        ? cues.filter((cue) => /^data:/.test(cue.file || ''))
        : this._availableFiles
          ? cues.filter((cue) => this._availableFiles.has(cue.file || `${cue.name}.mp3`))
          : cues;
      const before = this.loadedCount;
      await this._loadWanted(wanted, 12);
      return { total: cues.length, loaded: this.loadedCount - before };
    })();
    this._additionalLoads.set(key, task);
    try {
      return await task;
    } catch (error) {
      this._additionalLoads.delete(key);
      throw error;
    }
  }

  /**
   * Fetching more than fifteen hundred clips at once can exhaust Chromium's
   * request/decode resources and silently drop recordings. A small worker pool
   * keeps the pipe busy without turning first start into a browser stress test.
   */
  async _loadWanted(wanted, concurrency = 32) {
    await runWorkerPool(wanted, (cue) => this._loadOne(cue), concurrency);
  }

  async _loadOne(cue) {
    const file = cue.file || `${cue.name}.mp3`;
    try {
      // The content hash from index.json rides along as a query so the URL
      // changes whenever a recording is regenerated under the same name --
      // force-cache is then never a way to keep hearing last week's take.
      const version = this._fileVersions?.[file];
      let raw;
      if (/^data:/.test(file)) {
        raw = decodeDataUri(file);
        if (!raw) return this._noteFailedCue(cue.name, 'unreadable data: URI');
      } else {
        const res = await fetch(
          assetUrl(SFX_DIR, file) + (version ? `?v=${version}` : ''),
          { cache: 'force-cache' },
        );
        if (!res.ok) return this._noteFailedCue(cue.name, `HTTP ${res.status} for ${file}`);
        raw = await res.arrayBuffer();
      }
      if (raw.byteLength < 512) {
        return this._noteFailedCue(cue.name,
          `placeholder or truncated file (${raw.byteLength} bytes in ${file})`);
      }
      const buf = await this.ctx.decodeAudioData(raw);
      const list = this.buffers.get(cue.name) || [];
      list.push(buf);
      this.buffers.set(cue.name, list);
      this.loadedCount++;
    } catch (error) {
      this._noteFailedCue(cue.name, `decode failed: ${error?.message || error}`);
    }
    return undefined;
  }

  /**
   * Playback still degrades to the synth (or, for voice, to subtitles), but a
   * cue that reached the loader and did not decode is a delivery defect and
   * must be visible: everything that lands here was selected because the
   * manifest names it AND the file index says its bytes exist.
   */
  _noteFailedCue(name, reason) {
    this.failedCues.push({ name, reason });
    console.warn(`AudioEngine: cue "${name}" failed to load — ${reason}`);
  }

  /**
   * Drop every decoded buffer whose cue name starts with `prefix`.
   *
   * Decoded PCM is enormous next to the mp3s it came from (~480 MB resident in
   * the apartment alone — docs/WEB-PERFORMANCE-AND-PWA.md), and nothing else
   * in this module ever lets go of a buffer. Chapter and scene boundaries call
   * this for banks that cannot sound again — deliberately a prefix drop, not
   * an LRU. Re-decode stays possible: `loadAdditional` skips only names still
   * present in `buffers`, so a forgotten bank can be requested again and the
   * bytes come back out of the HTTP cache.
   *
   * @returns {number} how many cue banks were dropped
   */
  forget(prefix) {
    if (!prefix) return 0;
    let dropped = 0;
    for (const name of [...this.buffers.keys()]) {
      if (!name.startsWith(prefix)) continue;
      this.buffers.delete(name);
      dropped++;
    }
    if (!dropped) return 0;
    /* The memoised loadAdditional scopes would otherwise answer "already
     * decoded" forever; clearing them costs one cheap re-filter on the next
     * request and makes the reload real. */
    this._additionalLoads.clear();
    /* The Apartment engine keeps its own per-file receipt set
     * (src/core/apartment-audio.js); forgetting a bank must forget the
     * receipts too or its re-decode is skipped at the dedupe gate. Keys are
     * `${name}\0${file}`, so the name prefix test holds. */
    if (this._apartmentLoadedCueFiles) {
      for (const key of [...this._apartmentLoadedCueFiles]) {
        if (key.startsWith(prefix)) this._apartmentLoadedCueFiles.delete(key);
      }
    }
    /* say()'s per-group banks may still name buffers that are gone — and a
     * stale pick would fall through play()'s bank check into the SYNTH, which
     * for a voice line is worse than silence. Force a rebuild. */
    this._voBanksAt = undefined;
    return dropped;
  }

  /* ---------------------------------------------------------------- */
  /* Playback                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * @param {string} name  cue name, e.g. "fridge.open"
   * @param {object} opts  { volume, rate, position: THREE.Vector3, ref, delay,
   *                         analyse, requiredRecorded, requestedCue,
   *                         receiptSource, fallbackReason }
   *
   * `analyse` puts an AnalyserNode inline in this playback's own chain so
   * something can read how loud it is, frame by frame — which is how a
   * character's mouth is driven (src/core/mouth.js). It defaults to ON for
   * `vo.*`, this repo's own naming convention for a spoken line, and is
   * available explicitly for the scenes whose dialogue is not on that prefix
   * (THE TAKE names its 112 lines `heist.*`; see ENGINE-TRAPS.md entry 4).
   * The node is a genuine link in the audible chain, not a dangling tap, so
   * what it measures is what the player hears.
   */
  play(name, opts = {}) {
    if (!this.ready) {
      this._recordPlaybackReceipt(name, opts, {
        source: 'silent', started: false, fallbackReason: 'engine-not-ready',
      });
      return null;
    }
    const bank = this.buffers.get(name);
    const requested = String(opts.requestedCue ?? name);
    const requiredRecorded = opts.requiredRecorded ?? isVoiceCue(name, opts);
    const standIn = opts.receiptSource === AUDIO_PLAYBACK_SOURCE.STAND_IN
      || requested !== String(name);
    /* Strict certification is genuinely fail-closed: do not connect or start
     * a substitute and only then announce that it was forbidden. */
    if (this.strictQa && requiredRecorded && (standIn || !bank?.length)) {
      this._recordPlaybackReceipt(name, opts, {
        actual: name,
        source: standIn ? AUDIO_PLAYBACK_SOURCE.STAND_IN : AUDIO_PLAYBACK_SOURCE.SYNTH,
        started: false,
        fallbackReason: opts.fallbackReason
          ?? (standIn ? 'requested-recording-not-decoded' : 'recording-not-decoded'),
      });
    }
    const {
      volume = 1, rate = 1, position = null, delay = 0, muffle = 0,
      analyse = String(name).startsWith('vo.'),
    } = opts;

    const out = this.ctx.createGain();
    out.gain.value = volume;

    /* WHICH BUS.
     *
     * A spoken line goes to the voice bus so it has one trim and so the duck
     * below has something to key off -- unless a scene send has temporarily
     * hijacked `busSfx`, in which case that send wins and the line goes
     * through it. Those sends (the reinforced glass in Silent Squatch, the
     * suppressor in the Palace) work by swapping `busSfx` for exactly one
     * call, and quietly rerouting a voice line past the swap would unhook a
     * filter chain that the scene believes is in the path. `bus: 'sfx'`
     * forces the old behaviour for anything that wants it. */
    const voice = isVoiceCue(name, opts) && this.busSfx === this._busSfxDefault;
    let sink = voice ? this.busVoice : this.busSfx;
    /* `muffle` is a lowpass corner in Hz for anything arriving through
     * building fabric. Distance attenuation alone makes a sound quieter, not
     * duller, and quiet-but-bright still reads as in-the-room. Two poles,
     * because one leaves too much of the consonants. */
    let head = out;
    if (muffle) {
      const lp1 = this.ctx.createBiquadFilter();
      lp1.type = 'lowpass';
      lp1.frequency.value = muffle;
      lp1.Q.value = 0.5;
      const lp2 = this.ctx.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = muffle * 1.35;
      lp2.Q.value = 0.5;
      out.connect(lp1);
      lp1.connect(lp2);
      head = lp2;
    }
    /* `follow` is anything with a world position that can move while the clip
     * runs: an Object3D, a {x,y,z}, or a function returning either. It seeds
     * the panner and then keeps it there, so the sound stays on the speaker. */
    const follow = opts.follow ?? null;
    const seed = position ?? (follow ? readWorldPosition(follow) : null);
    let panner = null;
    if (seed) {
      panner = this._makePanner(seed, opts.ref ?? 1.4, opts.maxDist ?? 18,
        opts.rolloff ?? 1.4, opts.distanceModel ?? 'inverse');
      head.connect(panner);
      panner.connect(sink);
    } else {
      head.connect(sink);
    }

    const when = this.ctx.currentTime + delay;
    if (bank && bank.length) {
      const src = this.ctx.createBufferSource();
      src.buffer = bank[(Math.random() * bank.length) | 0];
      src.playbackRate.value = rate;
      /* 256 samples is a fifth of a frame at 48 kHz — short enough that a
       * consonant is not smeared into the vowel before it, long enough that
       * the RMS of one read is a stable number. No smoothing here: the mouth
       * does its own, and an analyser that has already smoothed is an analyser
       * whose gaps between words have been filled in. */
      const analyser = analyse && this.ctx.createAnalyser ? this.ctx.createAnalyser() : null;
      if (analyser) {
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0;
        src.connect(analyser);
        analyser.connect(out);
        this.playbackAnalysers.set(src, analyser);
        this._lastVoice = { name, source: src, analyser, at: when };
      } else {
        src.connect(out);
      }
      this.playbackGains.set(src, out.gain);
      if (panner) this.playbackPanners.set(src, panner);
      if (panner && follow) this._follow(src, panner, follow);
      const playback = {
        name,
        source: 'buffer',
        decodedDuration: src.buffer.duration,
        gain: volume,
        rate,
        scheduledAt: when,
        connectedToSfx: true,
        naturalEnd: false,
        endedAt: null,
        /* WHO IS TALKING, AND FOR HOW LONG.
         *
         * `hold()` above claims the floor so a fart waits for a line, but it
         * is advisory -- it makes held-back cues wait and stops nothing. Two
         * authored lines from two different systems can and do sound at once,
         * and the only instrument for noticing was the owner's ears. These
         * three fields are what `voiceOverlaps()` in core/dialogue.js reads
         * to answer it in arithmetic instead.
         *
         * `interrupt` is the line saying it MEANS to talk over the one before
         * it, which is a real thing a scene does and has to be sayable. */
        voice,
        speakerId: opts.speakerId ?? null,
        interrupt: opts.interrupt === true,
        /* Room murmur, not dialogue. The Silver Room plays its overheard
         * diners deliberately under the scene -- that is what a restaurant
         * sounds like -- and two of them talking at once is the effect
         * working, not a fault. Declared per call rather than guessed from
         * the cue name, because `silver.margo.invitation` and
         * `silver.diner.overheard` are the same shape and opposite things. */
        ambient: opts.ambientVoice === true,
        seconds: src.buffer.duration / Math.max(0.001, Math.abs(rate)),
      };
      if (voice) {
        this._duckForVoice(when, src.buffer.duration / Math.max(0.001, Math.abs(rate)));
        /* Every live spoken line, so `stopSpeech()` can cut the room off
         * without stopping the room. See it below. */
        (this._voiceSources ??= new Set()).add(src);
      }
      this.playbacks.push(playback);
      /* So `stopSpeech()` can stamp the moment it cut this one. See there. */
      (this._playbackBySource ??= new WeakMap()).set(src, playback);
      // Keep diagnostics bounded. A busy apartment can make several hundred
      // tiny sounds over an evening; diagnostics must not become save-state.
      if (this.playbacks.length > 160) this.playbacks.splice(0, this.playbacks.length - 160);
      src.onended = () => {
        this._unfollow(src);
        /* Off the live-speech roll, however it ended. `onended` rather than an
         * 'ended' listener because that is the handler this engine has always
         * used and a source that never fires it is a source that never
         * started -- the set would grow without bound on either path. */
        this._voiceSources?.delete(src);
        const endedAt = this.ctx.currentTime;
        /* NOT over a stamp `stopSpeech()` has already written. This callback
         * arrives whenever the browser gets round to it -- measured at 0.169 s
         * after the cut under a software renderer -- and overwriting the exact
         * moment with the late one put every cut line's recorded end AFTER the
         * start of the line that replaced it. That read as a fixed ~0.19 s of
         * two voices on every consecutive pair of the Initiation's ceremony,
         * for lines that are stopped before the next one is played. */
        if (playback.endedAt === null) playback.endedAt = endedAt;
        /* `onended` also fires for stop().  A natural end must therefore have
         * survived its decoded duration at its selected playback rate. */
        const expected = src.buffer.duration / Math.max(0.001, Math.abs(rate));
        playback.naturalEnd = endedAt >= when + expected - 0.06;
      };
      src.start(when);
      this._recordPlaybackReceipt(name, opts, {
        actual: name, source: 'buffer', started: true, scheduledAt: when,
        positionalSeed: seed,
      });
      return src;
    }
    synth(this, name, out, when, rate);
    this._recordPlaybackReceipt(name, opts, {
      actual: name,
      source: 'synth',
      started: true,
      fallbackReason: 'recording-not-decoded',
      scheduledAt: when,
      positionalSeed: seed,
    });
    return null;
  }

  /**
   * Pull the music and ambience beds back under a spoken line.
   *
   * Keyed off the LINE, not off a scene remembering to duck: the engine knows
   * a voice cue is starting and how long it runs, so the bed steps down under
   * the first syllable and comes back up when the room is quiet. Overlapping
   * lines extend the same duck rather than stacking two of them, which is why
   * this tracks a single release time instead of a count.
   *
   * @param {number} startsAt context time the line begins
   * @param {number} seconds how long it runs at its playback rate
   */
  _duckForVoice(startsAt, seconds) {
    if (!this.ready || !this.busMusic || !this.busAmb) return;
    const until = startsAt + Math.max(0, seconds) + VOICE_DUCK_HOLD_S;
    /* A line landing inside an existing duck only ever pushes the release
     * later. Re-attacking a bed that is already down is a second dip the
     * player hears as pumping. */
    const already = (this._voiceDuckUntil ?? 0) > this.ctx.currentTime;
    this._voiceDuckUntil = Math.max(this._voiceDuckUntil ?? 0, until);
    if (!already) {
      this._rampBus(this.busMusic, this._busMusicLevel(), VOICE_DUCK.music, startsAt);
      this._rampBus(this.busAmb, this._busAmbLevel(), VOICE_DUCK.ambience, startsAt);
    }
    clearTimeout(this._voiceDuckTimer);
    const wait = Math.max(0, (this._voiceDuckUntil - this.ctx.currentTime) * 1000);
    this._voiceDuckTimer = setTimeout(() => this._releaseVoiceDuck(), wait);
  }

  /** Put the beds back where the scene had them. */
  _releaseVoiceDuck() {
    if (!this.ready) return;
    this._voiceDuckUntil = 0;
    const now = this.ctx.currentTime;
    this._rampBus(this.busMusic, this._busMusicLevel(), 1, now, VOICE_DUCK_RELEASE_S);
    this._rampBus(this.busAmb, this._busAmbLevel(), 1, now, VOICE_DUCK_RELEASE_S);
  }

  /**
   * The level a bus would sit at with nobody talking.
   *
   * The duck is a MULTIPLIER on whatever the scene has set, so a scene that
   * fades its music down for a cutscene and a duck that fires during it do not
   * fight: the duck reads the scene's level, scales it, and restores to the
   * scene's level rather than to the engine default. The stored level is
   * updated by `setLoopVolume`-style callers through `busLevel()`.
   */
  /* `??` catches an unset level and does NOT catch NaN, which is the one that
   * actually turned up: a scene that computes its bed level from something
   * undefined stores a NaN, the getter hands it straight back, and the duck
   * release below asks the Web Audio API to ramp to it. Finite or the
   * authored resting value. */
  _busMusicLevel() {
    return Number.isFinite(this._musicLevel) ? this._musicLevel : 0.7;
  }

  _busAmbLevel() {
    return Number.isFinite(this._ambienceLevel) ? this._ambienceLevel : 0.55;
  }

  /**
   * Set a bus's resting level, so a later duck restores to it.
   *
   * Anything that wants to move the music or ambience bed itself should come
   * through here rather than writing `busMusic.gain.value`, or the next duck
   * release will put the bed back to a level the scene abandoned.
   */
  busLevel(which, value, ramp = 0.3) {
    const level = Math.max(0, Number(value) || 0);
    if (which === 'music') this._musicLevel = level;
    else if (which === 'ambience') this._ambienceLevel = level;
    else return false;
    if (!this.ready) return true;
    const bus = which === 'music' ? this.busMusic : this.busAmb;
    const ducked = (this._voiceDuckUntil ?? 0) > this.ctx.currentTime;
    const scale = ducked ? (which === 'music' ? VOICE_DUCK.music : VOICE_DUCK.ambience) : 1;
    this._rampBus(bus, level, scale, this.ctx.currentTime, ramp);
    return true;
  }

  /** One ramp, so every caller above schedules the same shape. */
  _rampBus(bus, level, scale, at, seconds = VOICE_DUCK_ATTACK_S) {
    if (!bus?.gain) return;
    const target = level * scale;
    /* THE BOUNDARY WITH THE API, so nothing past here can throw.
     *
     * `linearRampToValueAtTime` rejects a non-finite double, and the whole
     * graph's gain scheduling goes down with it. This surfaced the first time
     * the Initiation stopped a spoken line on every advance rather than once
     * a scene: the release ran forty times instead of twice and found the one
     * moment a bed level was NaN. Refusing the ramp leaves the bed where it
     * is, which is audible and recoverable; throwing is neither. */
    if (!Number.isFinite(target)) return;
    const t = Math.max(at, this.ctx.currentTime);
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(target, t + Math.max(0.001, seconds));
  }

  /**
   * Cut every line that is currently being spoken. Nothing else.
   *
   * A scene that is skipped, restarted, or transitioned away from has to
   * silence its dialogue or the next scene opens with the last one's argument
   * still going. Every scene that noticed this wrote its own version --
   * `activeDialogueSource?.stop?.()` in the heist, `hushCrew()` beside it,
   * `stopVoice()` in the Silver Case, `hush()` in the Motel -- and each of
   * them only knew about the one source it had started, so a bark from an NPC
   * and a line from a mission could not both be cut by either.
   *
   * The engine knows all of them, because they all go through the voice bus.
   *
   * @returns {number} how many lines were cut
   */
  stopSpeech() {
    const live = this._voiceSources;
    if (!live?.size) return 0;
    let cut = 0;
    for (const source of live) {
      try {
        source.stop();
        /* STAMP THE END HERE, not in `onended`.
         *
         * `stop()` silences the source on this line; `onended` arrives whenever
         * the browser gets round to it, measured at about 0.2 s later under a
         * software renderer. Until this, the playback log said a cut line ran
         * to its full length, so the voice overlap gate reported a fixed ~0.2 s
         * of two voices on every consecutive pair of the Initiation's ceremony
         * -- lines that cannot overlap, because the scene stops the previous
         * one on the line above the one that starts the next.
         *
         * The engine knows the truth at the moment it cuts the source, so it
         * writes it down. Widening the gate's tolerance to swallow the lag
         * would have hidden a real 0.2 s overlap everywhere else in the game.
         * `onended` still fires and still sets `naturalEnd` false. */
        const playback = this._playbackBySource?.get(source);
        if (playback && playback.endedAt === null) playback.endedAt = this.ctx.currentTime;
        cut += 1;
      } catch { /* already ended: onended has not fired yet */ }
    }
    live.clear();
    this._vo = null;
    this._busyUntil = 0;
    /* And put the beds back, or a scene skipped mid-line leaves the music
     * ducked for the rest of the night. */
    this._releaseVoiceDuck();
    return cut;
  }

  /** Is anybody talking right now? */
  get speaking() {
    return (this._voiceSources?.size ?? 0) > 0;
  }

  /** The dialogue trim, for a settings slider that wants its own control. */
  setVoiceVolume(v) {
    this._voiceLevel = Math.max(0, Number(v) || 0);
    if (this.busVoice) this.busVoice.gain.value = VOICE_BUS_GAIN * this._voiceLevel;
    return this._voiceLevel;
  }

  /**
   * Move an already-playing one-shot. The counterpart to `moveLoop`, which
   * loops have had all along -- without this a one-shot's panner is frozen at
   * whatever position it was given when the clip started.
   *
   * Returns false for a sound that was played without a position, because
   * there is no panner in its chain to move.
   */
  setPlaybackPosition(source, position) {
    const panner = source && this.playbackPanners.get(source);
    const at = readWorldPosition(position);
    if (!panner || !at) return false;
    if (panner.positionX) {
      const t = this.ctx.currentTime;
      /* Smoothed, like the listener: a per-frame step into `value` zipper-
       * noises on a fast mover, and a gunshot is not the only thing that
       * travels. 0.02s is short enough to stay glued to the object. */
      panner.positionX.setTargetAtTime(at.x, t, 0.02);
      panner.positionY.setTargetAtTime(at.y, t, 0.02);
      panner.positionZ.setTargetAtTime(at.z, t, 0.02);
    } else {
      panner.setPosition(at.x, at.y, at.z);
    }
    return true;
  }

  /** Keep `source` glued to `target` until it ends. See play()'s `follow`. */
  _follow(source, panner, target) {
    this._following.add({ source, panner, target });
    this._startFollowPump();
  }

  _unfollow(source) {
    for (const entry of this._following) {
      if (entry.source === source) this._following.delete(entry);
    }
    if (!this._following.size) this._stopFollowPump();
  }

  /**
   * Re-sample every follower's position. Called from `updateListener`, which
   * most scenes run every frame -- but not all of them do, and a scene that
   * forgets would get the old frozen-panner behaviour back without any sign
   * that it had. So this also drives itself off rAF while anything is
   * following, and the two are idempotent.
   */
  serviceFollowers() {
    if (!this.ready || !this._following.size) return;
    for (const entry of this._following) {
      const at = readWorldPosition(entry.target);
      if (at) this.setPlaybackPosition(entry.source, at);
    }
  }

  _startFollowPump() {
    if (this._followPump !== null || typeof requestAnimationFrame !== 'function') return;
    const pump = () => {
      if (!this._following.size) { this._followPump = null; return; }
      this.serviceFollowers();
      this._followPump = requestAnimationFrame(pump);
    };
    this._followPump = requestAnimationFrame(pump);
  }

  _stopFollowPump() {
    if (this._followPump === null) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._followPump);
    this._followPump = null;
  }

  /** Ramp an already-playing sampled cue without stopping or restarting it. */
  setPlaybackVolume(source, volume, ramp = 0.25) {
    const gain = source && this.playbackGains.get(source);
    if (!gain || !this.ctx) return false;
    const t = this.ctx.currentTime;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(Math.max(0.0001, volume), t + ramp);
    return true;
  }

  /**
   * The AnalyserNode tapped onto a playback started with `{ analyse: true }`
   * (or onto any `vo.*` cue, which is the default). Null for anything else —
   * `Mouth.speak()` treats that as "no recording to read" and falls back.
   */
  analyserFor(source) {
    return source ? this.playbackAnalysers.get(source) ?? null : null;
  }

  /**
   * The voice playback that started within the last `within` seconds, if any.
   *
   * For the awkward but real case where the code that PLAYS a line and the
   * code that MOVES the speaker's mouth are in different modules and cannot
   * hand a take between them. The mansion is the one: two DialogueControllers
   * (the cast's and PROJECT SILENT SQUATCH's) share one subtitle bar, and the
   * mouths are driven by a wrapper on that bar rather than by either
   * controller — see "THE MOUTHS THE MISSION MOVES" in src/mansion/cast.js.
   *
   * The window is what keeps it honest. Both of those calls happen in the same
   * JS turn as the `play()` they belong to, so a quarter of a second is
   * enormous slack; a line with no recording finds nothing here rather than
   * inheriting the previous speaker's take. Prefer passing the take directly
   * wherever the call sites can see each other.
   */
  lastVoicePlayback(within = 0.25) {
    const last = this._lastVoice;
    if (!last || !this.ctx) return null;
    return this.ctx.currentTime - last.at <= within ? last : null;
  }

  /** Clear only transient playback evidence; never samples or active sound. */
  clearPlaybackLog() {
    this.playbacks.length = 0;
    this.playbackReceipts.length = 0;
  }

  /** Start a deliberately new certification window. Ordinary log rotation cannot erase failures. */
  clearQaViolations() {
    this.qaViolations.length = 0;
  }

  /** Whether a cue has a decoded recording ready for immediate playback. */
  hasSample(name) {
    return (this.buffers.get(name)?.length ?? 0) > 0;
  }

  /** Duration of the first decoded take, used to hold subtitles to delivery. */
  sampleDuration(name) {
    return this.buffers.get(name)?.[0]?.duration ?? null;
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

    /* Cached per group, but only for as long as the library has not moved.
     *
     * This used to cache unconditionally, and an EMPTY bank is a perfectly
     * good cache entry, so any group asked for before its takes had decoded
     * was cached silent and stayed silent for the whole session. Most banks
     * get away with it because they are asked for late; the ones that do not
     * are exactly the ones that fire in the first minute -- the front door
     * being the worst of them, since a player who tries the handle while the
     * background bank is still filling in never hears the door again.
     *
     * `loadedCount` only ever increases, so comparing it is a cheap way of
     * asking "has anything arrived since I last looked". */
    if (this._voBanksAt !== this.loadedCount) {
      this._voBanks = new Map();
      this._voBanksAt = this.loadedCount;
    }
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
    /* Note how long he will be talking for, so anything that can afford to
     * wait -- a fart, mostly -- can hold off rather than land on the line. */
    const secs = this._vo?.buffer ? this._vo.buffer.duration : 1.6;
    this._busyUntil = Math.max(this._busyUntil || 0, this.ctx.currentTime + delay + secs + 0.25);
    return true;
  }

  /**
   * The playback `say()` most recently started, for anything that has to
   * FOLLOW the line rather than merely start it — the mouth system above all.
   * `say()` is a one-voice-at-a-time channel by design ("he is not a chorus"),
   * so this is the line being spoken, not a list. Null when the group had no
   * takes and nothing was played.
   */
  spokenSource() {
    return this._vo ?? null;
  }

  /**
   * True while the character is mid-sentence, or a cue that asked to hold the
   * floor is still sounding.
   *
   * Used by the things that are funny on their own and merely noise on top of
   * something else. A fart under a voice line is not a joke twice, it is one
   * joke ruined, so those wait and fire when the room is quiet again.
   */
  busy() {
    return this.ready && this.ctx.currentTime < (this._busyUntil || 0);
  }

  /** Claim the floor for `secs`, so held-back cues wait that long. */
  hold(secs) {
    if (!this.ready) return;
    this._busyUntil = Math.max(this._busyUntil || 0, this.ctx.currentTime + secs);
  }

  /** Footsteps get their own entry point so cadence + surface stay in one place. */
  footstep(surface = 'wood', intensity = 1) {
    const now = performance.now();
    if (now - this._lastStep < 140) return;
    this._lastStep = now;
    /* Alternate the two boards on wood -- left foot, right foot, different
     * plank. One cue repeating is what makes a floor sound like a tape. */
    let cue = `footstep.${surface}`;
    if (surface === 'wood') {
      this._woodFoot = !this._woodFoot;
      cue = this._woodFoot ? 'footstep.wood.a' : 'footstep.wood.b';
    }
    this.play(cue, {
      volume: 0.30 * intensity,
      rate: 0.92 + Math.random() * 0.18,
    });
  }

  _makePanner(position, refDistance, maxDistance, rolloff = 1.4, distanceModel = 'inverse') {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = distanceModel;
    p.refDistance = refDistance;
    p.maxDistance = maxDistance;
    /* Dialogue wants a gentler curve than a footstep: a line that has to be
     * understood cannot lose a third of its level because the speaker took two
     * steps. Callers pass `rolloff` for that; everything else keeps 1.4. */
    p.rolloffFactor = rolloff;
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

    const { gain, filter, panner } = this._loopChain(position, ambience, opts);

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
    const handle = { node, gain, filter, panner, volume, cutoff: 20000 };
    this.loops.set(key, handle);
    return handle;
  }

  /** gain → lowpass (open by default) → panner/bus, shared by every loop. */
  _loopChain(position, ambience, opts = {}) {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    gain.connect(filter);
    const bus = opts.bus === 'music' ? this.busMusic : ambience ? this.busAmb : this.busSfx;
    let panner = null;
    if (position) {
      panner = this._makePanner(position, opts.ref ?? 1.2, opts.maxDist ?? 14);
      filter.connect(panner);
      panner.connect(bus);
    } else {
      filter.connect(bus);
    }
    return { gain, filter, panner };
  }

  /** Disconnect every node this loop owns, including a positional tail. */
  _disconnectLoopChain(handle) {
    for (const node of [handle?.gain, handle?.filter, handle?.panner]) {
      try { node?.disconnect(); } catch { /* already disconnected */ }
    }
  }

  /**
   * Start a looping music track from a URL (assets/music/*, not the sfx
   * manifest). Long records stay in an HTMLMediaElement so the browser can
   * decode them as they play instead of retaining the whole song as PCM. The
   * MediaElementSource still enters the normal WebAudio graph, so spatial
   * falloff, room filters, fades and global ducking remain unchanged.
   */
  startMusicLoop(key, url, opts = {}) {
    if (!this.ready || this.loops.has(key)) return this.loops.get(key);
    const {
      volume = 0.3,
      fade = 1.6,
      loop = true,
      preload = 'auto',
      onEnded = null,
      onError = null,
    } = opts;
    const { gain, filter, panner } = this._loopChain(
      opts.position ?? null,
      opts.ambience ?? true,
      opts,
    );
    const element = new Audio();
    if (!/^data:/.test(url)) element.crossOrigin = 'anonymous';
    element.preload = preload;
    element.loop = loop !== false;
    element.volume = 1;

    const node = this.ctx.createMediaElementSource(element);
    node.connect(gain);
    const handle = {
      node,
      element,
      gain,
      filter,
      panner,
      volume,
      cutoff: 20000,
      streamed: true,
      released: false,
      autoplayBlocked: false,
      retryPlayback: null,
      ended: false,
      failed: false,
    };

    const ended = () => {
      if (handle.released || handle.ended) return;
      handle.ended = true;
      if (typeof onEnded === 'function') onEnded(handle);
    };

    /* Play a window out of the middle of a record.
     *
     * Same vocabulary the station already uses for a track it talks over
     * (`start` / `cutAt` in the radio manifest) — seek in once the duration is
     * known, then stop at the mark. Done here rather than by trimming the mp3
     * so the file on disk stays the delivered master: the in and out points are
     * two numbers somebody can read and change, and nothing has been
     * re-encoded to hit them. `timeupdate` fires about four times a second,
     * which is loose for a hard cut, so the fade is what covers the seam. */
    const { start: seekTo = null, cutAt = null } = opts;
    if (seekTo != null) {
      const seek = () => {
        try { element.currentTime = seekTo; } catch { /* not seekable yet */ }
      };
      element.addEventListener('loadedmetadata', seek, { once: true });
    }
    if (cutAt != null) {
      const watchCut = () => {
        if (handle.released || element.currentTime < cutAt) return;
        element.removeEventListener('timeupdate', watchCut);
        if (element.loop && seekTo != null) { try { element.currentTime = seekTo; } catch { /* nope */ } return; }
        this.stopLoop(key, opts.cutFade ?? 0.35);
        ended();
      };
      element.addEventListener('timeupdate', watchCut);
    }

    const retryEvents = ['pointerdown', 'keydown', 'touchend'];
    let retryTarget = null;
    let retryListener = null;

    const disarmRetry = () => {
      if (retryTarget && retryListener) {
        for (const event of retryEvents) {
          retryTarget.removeEventListener(event, retryListener, true);
        }
      }
      retryTarget = null;
      retryListener = null;
      handle.retryPlayback = null;
    };

    const release = () => {
      if (handle.released) return;
      handle.released = true;
      disarmRetry();
      element.removeEventListener('error', failed);
      element.removeEventListener('ended', ended);
      try { element.pause(); } catch { /* already stopped */ }
      element.removeAttribute('src');
      try { element.load(); } catch { /* detached media element */ }
      try { node.disconnect(); } catch { /* already disconnected */ }
      this._disconnectLoopChain(handle);
    };
    const failed = (error) => {
      if (handle.released || handle.failed) return;
      handle.failed = true;
      handle.lastError = error?.name || 'media-error';
      if (this.loops.get(key) === handle) this.loops.delete(key);
      try {
        if (typeof onError === 'function') onError(handle, error);
      } catch (callbackError) {
        /* A scene's fallback must not prevent the media graph from being
         * released. Keep the diagnostic on the handle for a verifier/debugger
         * without turning one bad recovery hook into a second unhandled error. */
        handle.callbackError = callbackError;
      } finally {
        release();
      }
    };
    const retryOrFail = (error) => {
      handle.playPending = false;
      if (handle.released) return;
      if (this.loops.get(key) !== handle) {
        release();
        return;
      }
      if (error?.name !== 'NotAllowedError') {
        failed(error);
        return;
      }

      // Safari/Firefox may expire transient activation while a scene awaits
      // its voice bank. Keep the valid media graph and retry synchronously on
      // the player's next input instead of turning one policy rejection into
      // permanent silence for this page.
      handle.autoplayBlocked = true;
      handle.retryPlayback = attemptPlayback;
      if (retryListener) return;
      const target = globalThis.window;
      if (!target?.addEventListener) return;
      retryTarget = target;
      retryListener = () => {
        disarmRetry();
        attemptPlayback();
      };
      for (const event of retryEvents) {
        target.addEventListener(event, retryListener, { capture: true });
      }
    };
    const attemptPlayback = () => {
      if (handle.released || handle.playPending || this.loops.get(key) !== handle) return;
      handle.playPending = true;
      let playback;
      try {
        // Keep play() on the caller's stack when possible: some browsers grant
        // media playback only to the interaction that started the scene.
        playback = element.play();
      } catch (error) {
        retryOrFail(error);
        return;
      }
      Promise.resolve(playback)
        .then(() => {
          handle.playPending = false;
          if (this.loops.get(key) !== handle) {
            release();
            return;
          }
          disarmRetry();
          handle.autoplayBlocked = false;
          gain.gain.linearRampToValueAtTime(handle.volume, this.ctx.currentTime + fade);
        })
        .catch(retryOrFail);
    };
    handle.release = release;
    element.addEventListener('error', failed, { once: true });
    element.addEventListener('ended', ended, { once: true });
    this.loops.set(key, handle);
    element.src = url;
    attemptPlayback();
    return handle;
  }

  /** Replace a streamed record under the same mix key with a short crossfade. */
  replaceMusicLoop(key, url, opts = {}) {
    this.stopLoop(key, opts.crossfade ?? 0.65);
    return this.startMusicLoop(key, url, opts);
  }

  stopLoop(key, fadeIn = 0.5) {
    const h = this.loops.get(key);
    if (!h) return;
    this.loops.delete(key);
    /* Seconds. A caller that hands over `{ fade: 1.2 }` — and one did, in the
     * Initiation's cabin ambience — makes `t + fade` NaN and takes the whole
     * gain schedule down with it. The boundary with the API is where that
     * stops, and the authored default is a better answer than a throw. */
    const fade = Number.isFinite(fadeIn) ? fadeIn : 0.5;
    const t = this.ctx.currentTime;
    h.gain.gain.cancelScheduledValues(t);
    h.gain.gain.setValueAtTime(h.gain.gain.value, t);
    h.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => {
      if (h.release) {
        h.release();
        return;
      }
      try {
        h.node.stop ? h.node.stop() : h.node.forEach?.((n) => n.stop());
      } catch {
        /* already stopped */
      }
      this._disconnectLoopChain(h);
    }, fade * 1000 + 60);
  }

  /**
   * Ramp an AudioParam from wherever it is right now, discarding automation
   * still queued behind it.
   *
   * A bare linearRampToValueAtTime does NOT do this. Automation events live on
   * one timeline sorted by time, so a shorter ramp scheduled while a longer one
   * is still running gets inserted *before* it: the param reaches the new value
   * on schedule and then keeps travelling to the old target. Every room change
   * in the game lands inside startLoop's 1.2s fade-in, which is how the closed
   * party ended up playing full outdoor rain volume indoors -- the ducking ramp
   * ran, then the fade-in it interrupted carried the gain back up to 0.30.
   * stopLoop has always anchored correctly; this is the same three lines.
   */
  _rampParam(param, value, ramp) {
    const t = this.ctx.currentTime;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
    }
    param.linearRampToValueAtTime(value, t + ramp);
  }

  /**
   * Move a positional loop's source without restarting it.
   *
   * Added for the mansion's janitor cart, which is a bed that walks: four
   * castors and a bucket of water crossing a basement while a conversation
   * runs over the top of it. The alternative every scene had before this was
   * stop-and-restart per frame, which is a new panner, a new gain, a new fade
   * and a click, sixty times a second.
   *
   * Returns false for a loop that is not running or was started without a
   * position, so a caller can tell "moved" from "there was nothing to move".
   */
  moveLoop(key, position) {
    const h = this.loops.get(key);
    if (!h?.panner || !position || !Number.isFinite(position.x)) return false;
    const p = h.panner;
    if (p.positionX) {
      p.positionX.value = position.x;
      p.positionY.value = position.y ?? 0;
      p.positionZ.value = position.z;
    } else {
      p.setPosition(position.x, position.y ?? 0, position.z);
    }
    return true;
  }

  setLoopVolume(key, v, ramp = 0.3) {
    const h = this.loops.get(key);
    if (!h) return;
    h.volume = v;
    this._rampParam(h.gain.gain, v, ramp);
  }

  /** Low-pass one loop — a wall between the listener and the music. */
  setLoopCutoff(key, hz, ramp = 0.6) {
    const h = this.loops.get(key);
    if (!h || !h.filter || h.cutoff === hz) return;
    h.cutoff = hz;
    this._rampParam(h.filter.frequency, hz, ramp);
  }

  /**
   * Re-pitch a running loop — whichever of the two things is playing it.
   *
   * A vehicle engine is the case this exists for. THE TAKE's escape car ran
   * one bed at one pitch and only moved its VOLUME with speed, which is an
   * engine getting NEARER rather than an engine working — the owner's
   * *"engine sounds are bad"*. Pitch is what an ear reads as revs, and the
   * Beef Run proves the point the expensive way: its two piston engines are a
   * live oscillator graph precisely because *"pitch is an RPM readout"*.
   *
   * THE TRAP THIS ALMOST FELL INTO. A first cut moved `node.playbackRate` and
   * gave up otherwise, on the assumption that a loop is a decoded sample. Two
   * of the three loops it was written for — `heist.vehicle.engine.load` and
   * `heist.vehicle.tires.road` — have no recording on disk and are served by
   * `synthLoop`, whose "node" is a `{ stop() }` façade over a handful of
   * oscillators. `playbackRate` was `undefined` on all of them, so the whole
   * gearbox would have been a silent no-op that still passed every test.
   *
   * So both paths are real:
   *
   * - **A recorded loop** moves `playbackRate`, which shifts the whole
   *   recording together the way a tape does.
   * - **A synthesised loop** moves every voice off its authored frequency.
   *   Oscillators track the rate exactly, because an oscillator *is* the note.
   *   Noise bands travel half as far: the filter corner is the texture around
   *   the note, and dragging it the whole way turns road roar into a kettle.
   *
   * Ramped through `_rampParam` like every other loop parameter, so a rate
   * change arriving inside `startLoop`'s fade cannot stack behind it
   * (`docs/ENGINE-TRAPS.md` entry 1).
   *
   * @param {string} key
   * @param {number} rate 1 is the loop's authored pitch. Clamped to a range a
   *   sample survives — past about 4× a loop is a whistle, not an engine.
   * @param {number} [ramp] seconds
   * @returns {boolean} whether anything was actually re-pitched
   */
  setLoopRate(key, rate, ramp = 0.12) {
    const h = this.loops.get(key);
    if (!h?.node) return false;
    const sample = h.node.playbackRate;
    const voices = h.node.voices;
    if (!sample && !voices?.length) return false;
    const value = Math.max(0.25, Math.min(4, rate));
    if (h.rate === value) return true;
    h.rate = value;
    if (sample) {
      this._rampParam(sample, value, ramp);
      return true;
    }
    for (const voice of voices) {
      const scale = voice.kind === 'osc' ? value : 1 + (value - 1) * 0.5;
      this._rampParam(voice.param, Math.max(20, Math.min(18000, voice.base * scale)), ramp);
    }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Listener + global shaping                                         */
  /* ---------------------------------------------------------------- */

  updateListener(camera) {
    if (!this.ready) return;
    this.serviceFollowers();
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

  /** The scene's level (mute toggles and the like); the setting multiplies it. */
  setMasterVolume(v) {
    this.masterLevel = Math.max(0, Number(v) || 0);
    this._applyMaster();
  }

  /** The player's master-volume setting, 0..1. Driven by src/core/settings.js. */
  setUserVolume(v) {
    this.userVolume = Math.min(1, Math.max(0, Number(v) || 0));
    this._applyMaster();
  }

  _applyMaster() {
    /* `ready` is set by init(), but tests and mixing harnesses set it by hand
     * on an engine that has no graph; the gain is the thing being written, so
     * it is the thing to check for. */
    if (this.ready && this.master) {
      this._rampParam(this.master.gain, this.masterLevel * this.userVolume, 0.15);
    }
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
 * A fist landing on a body, in the four layers a real one has: the knuckle and
 * jacket fabric at the top, the flat slap of the hit itself, the chest cavity
 * underneath it, and the room answering a beat later. Anything less than this
 * reads as a door closing — which is what the HotDog beating sounded like when
 * it was two bursts.
 *
 * `weight` moves the whole thing lower and longer, `snap` trades fabric for
 * knuckle, and `room` is how much of the bar comes back.
 */
function bodyImpact(ctx, dest, t, { weight = 1, snap = 1, room = 1, gain = 1 } = {}) {
  burst(ctx, dest, t, {
    dur: 0.022 / snap, type: 'highpass', freq: 2400 * snap, q: 0.7,
    gain: 0.085 * snap * gain,
  });
  burst(ctx, dest, t + 0.004, {
    dur: 0.07 * weight, type: 'bandpass', freq: 540 / weight, q: 0.95,
    gain: 0.2 * gain, sweep: 0.45,
  });
  tone(ctx, dest, t + 0.006, {
    freq: 98 / weight, to: 44 / weight, dur: 0.15 * weight,
    gain: 0.32 * gain, type: 'triangle',
  });
  burst(ctx, dest, t + 0.03, {
    dur: 0.3 * room, type: 'lowpass', freq: 360, gain: 0.05 * room * gain, sweep: 0.38,
  });
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
    /* Two boards rather than one.
     *
     * A single step cue on a loop is the fastest way to make a floor sound
     * like a tape: the ear locks onto the repeat within about four paces.
     * These are a pair -- a tighter board and a looser, hollower one -- picked
     * alternately by footstep(), each with its own resonance so the room reads
     * as a floor with boards in it rather than one sample under your feet.
     *
     * Both are more wooden than the old one: a body thump for the heel, a
     * short knock for the board flexing, and a ring on top. The old cue was a
     * lowpassed noise burst, which is the sound of standing on carpet. */
    case 'footstep.wood':
    case 'footstep.wood.a':
      // Tighter board, closer to a joist. Higher knock, shorter ring.
      tone(ctx, dest, t, { freq: 96, to: 58, dur: r(0.075), gain: 0.26, type: 'triangle' });
      burst(ctx, dest, t, { dur: r(0.035), type: 'bandpass', freq: 1650, q: 2.2, gain: 0.24 });
      tone(ctx, dest, t + 0.006, { freq: 430, to: 300, dur: r(0.10), gain: 0.11, type: 'sine' });
      burst(ctx, dest, t, { dur: r(0.055), type: 'lowpass', freq: 520, gain: 0.30, sweep: 0.5 });
      break;
    case 'footstep.wood.b':
      // The board that has a bit of air under it. Lower, longer, hollower.
      tone(ctx, dest, t, { freq: 74, to: 44, dur: r(0.095), gain: 0.28, type: 'triangle' });
      burst(ctx, dest, t, { dur: r(0.042), type: 'bandpass', freq: 1150, q: 1.7, gain: 0.22 });
      tone(ctx, dest, t + 0.008, { freq: 268, to: 176, dur: r(0.17), gain: 0.13, type: 'sine' });
      tone(ctx, dest, t + 0.012, { freq: 388, to: 300, dur: r(0.13), gain: 0.07, type: 'sine' });
      burst(ctx, dest, t, { dur: r(0.070), type: 'lowpass', freq: 400, gain: 0.28, sweep: 0.6 });
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
    case 'plane.crash.explosion':
      // A usable hard-crash fallback while the authored take is absent:
      // sub-bass impact, fuel blast, tearing metal, then a short fire wash.
      // The mission only calls this above its damage gate.
      tone(ctx, dest, t, { freq: 72, to: 34, dur: 0.65, gain: 0.95, type: 'sine' });
      burst(ctx, dest, t, { dur: 0.18, type: 'lowpass', freq: 280, gain: 1, sweep: 0.22 });
      burst(ctx, dest, t + 0.035, { dur: 1.25, type: 'bandpass', freq: 760, q: 0.55, gain: 0.52, sweep: 0.24 });
      for (let i = 0; i < 8; i++) {
        burst(ctx, dest, t + 0.12 + i * 0.055 + Math.random() * 0.035, {
          dur: 0.055,
          type: 'bandpass',
          freq: 850 + Math.random() * 2600,
          q: 2.8,
          gain: 0.08,
        });
      }
      burst(ctx, dest, t + 0.28, { dur: 2.1, type: 'lowpass', freq: 520, gain: 0.18, sweep: 0.3 });
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
    case 'chat.ping':
      // Two notes up, quiet, from the other monitor. Easy to miss on purpose.
      tone(ctx, dest, t, { freq: 1180, to: 1180, dur: 0.055, gain: 0.13, type: 'sine' });
      tone(ctx, dest, t + 0.07, { freq: 1580, to: 1580, dur: 0.10, gain: 0.11, type: 'sine' });
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
    /* A hinge turning slowly under its own weight. Two narrow bands walking
     * downward, because a creak is a resonance moving, not an impact -- and it
     * has to be quiet enough that you are not sure you heard it. */
    /* A gunshot indoors is three things: the crack, the room slapping back,
     * and the ring left in your ears. Leave any of them out and it reads as a
     * door slamming. */
    case 'gun.shot':
      burst(ctx, dest, t, { dur: 0.035, type: 'highpass', freq: 1800, gain: 0.95 });
      burst(ctx, dest, t + 0.004, { dur: 0.28, type: 'lowpass', freq: 320, gain: 0.85, sweep: 0.35 });
      burst(ctx, dest, t + 0.05, { dur: 0.65, type: 'bandpass', freq: 900, q: 0.7, gain: 0.16, sweep: 0.4 });
      tone(ctx, dest, t + 0.06, { freq: 3100, dur: 1.1, gain: 0.028, type: 'sine' });
      break;
    case 'pizza.take':
      burst(ctx, dest, t, { dur: 0.16, type: 'bandpass', freq: 900, q: 1.1, gain: 0.14, sweep: 0.6 });
      burst(ctx, dest, t + 0.10, { dur: 0.12, type: 'highpass', freq: 3200, gain: 0.05 });
      break;
    case 'tv.click':
      burst(ctx, dest, t, { dur: 0.03, type: 'bandpass', freq: 1400, q: 2.2, gain: 0.26 });
      tone(ctx, dest, t + 0.06, { freq: 5200, dur: 0.05, gain: 0.03, type: 'sine' });
      break;
    case 'gun.dry':
      burst(ctx, dest, t, { dur: 0.02, type: 'bandpass', freq: 2600, q: 3, gain: 0.30 });
      burst(ctx, dest, t + 0.02, { dur: 0.05, type: 'lowpass', freq: 700, gain: 0.10 });
      break;
    case 'gun.impact':
      burst(ctx, dest, t, { dur: 0.05, type: 'bandpass', freq: 1500, q: 1.4, gain: 0.42, sweep: 0.4 });
      for (let i = 0; i < 4; i++) {
        burst(ctx, dest, t + 0.06 + i * 0.045 + Math.random() * 0.03, {
          dur: 0.04, type: 'bandpass', freq: 700 + Math.random() * 900, q: 3, gain: 0.06,
        });
      }
      break;
    /* A ringtone plus the rattle of a phone against wood. The rattle is what
     * makes it a phone on a nightstand rather than a phone in the abstract. */
    case 'phone.ring':
      for (let i = 0; i < 2; i++) {
        tone(ctx, dest, t + i * 0.42, { freq: 880, dur: 0.20, gain: 0.10, type: 'sine' });
        tone(ctx, dest, t + i * 0.42 + 0.10, { freq: 1180, dur: 0.20, gain: 0.09, type: 'sine' });
      }
      for (let i = 0; i < 14; i++) {
        burst(ctx, dest, t + i * 0.035, { dur: 0.02, type: 'lowpass', freq: 260, gain: 0.05 });
      }
      break;
    /* A phone buzzing in a pocket, which is a different sound from a phone
     * ringing on a nightstand: no tone at all, just the motor and the body of
     * the handset knocking against whatever it is lying against. Two short
     * pulses, because two short pulses is a text and one long one is a call —
     * and the thing this plays for is a text.
     *
     * Deliberately synthesis-only. It carries no manifest entry and therefore
     * requests no file, so it cannot 404 while nobody has recorded it; if a
     * `phone.vibrate` recording is ever added it takes over here for free,
     * the same way every other cue in this table works. */
    case 'phone.vibrate':
      for (let i = 0; i < 2; i++) {
        const at = t + i * 0.30;
        // The motor: a low buzz, felt more than heard.
        tone(ctx, dest, at, { freq: 62, to: 54, dur: 0.17, gain: 0.30, type: 'square' });
        tone(ctx, dest, at, { freq: 124, to: 108, dur: 0.16, gain: 0.10, type: 'triangle' });
        // The handset against cloth: dry, dull, and over almost at once.
        for (let k = 0; k < 5; k++) {
          burst(ctx, dest, at + k * 0.034, {
            dur: 0.026, type: 'lowpass', freq: 300, gain: 0.07,
          });
        }
      }
      break;
    case 'phone.hangup':
      tone(ctx, dest, t, { freq: 760, to: 420, dur: 0.16, gain: 0.10, type: 'sine' });
      break;
    case 'phone.pickup':
      burst(ctx, dest, t, { dur: 0.07, type: 'bandpass', freq: 1700, q: 1.8, gain: 0.14, sweep: 0.6 });
      break;
    case 'ammo.take':
      for (let i = 0; i < 6; i++) {
        burst(ctx, dest, t + i * 0.055 + Math.random() * 0.03, {
          dur: 0.035, type: 'bandpass', freq: 2400 + Math.random() * 1800, q: 5, gain: 0.10,
        });
      }
      break;
    /* Three beats: the cylinder out, the rounds in, the cylinder shut. One
     * click for all of it reads as a light switch. */
    case 'gun.reload':
      burst(ctx, dest, t, { dur: 0.09, type: 'bandpass', freq: 1200, q: 2.6, gain: 0.24, sweep: 0.7 });
      for (let i = 0; i < 6; i++) {
        burst(ctx, dest, t + 0.22 + i * 0.13, {
          dur: 0.03, type: 'bandpass', freq: 2100 + i * 90, q: 4, gain: 0.13,
        });
      }
      burst(ctx, dest, t + 1.10, { dur: 0.06, type: 'bandpass', freq: 900, q: 2, gain: 0.30 });
      tone(ctx, dest, t + 1.10, { freq: 320, to: 180, dur: 0.10, gain: 0.16, type: 'square' });
      break;
    case 'gun.pickup':
      burst(ctx, dest, t, { dur: 0.10, type: 'bandpass', freq: 2200, q: 2.4, gain: 0.20, sweep: 0.5 });
      tone(ctx, dest, t + 0.05, { freq: 190, to: 120, dur: 0.14, gain: 0.10, type: 'triangle' });
      break;
    /* Air let out slowly through a filter that opens and closes again. Not a
     * gasp -- the shape is the whole point, and a burst with no movement in it
     * reads as a hiss rather than as a person. */
    case 'relief.sigh': {
      const g1 = burst(ctx, dest, t, { dur: 1.1, type: 'bandpass', freq: 620, q: 1.3, gain: 0.055, sweep: 0.55 });
      void g1;
      burst(ctx, dest, t + 0.08, { dur: 0.85, type: 'lowpass', freq: 1500, gain: 0.03, sweep: 0.4 });
      break;
    }
    /* Hangers first, fabric second. The metal is what tells you what happened;
     * the cloth is what tells you how much of it there was. */
    case 'closet.slide':
      for (let i = 0; i < 5; i++) {
        burst(ctx, dest, t + i * 0.055 + Math.random() * 0.02, {
          dur: 0.05, type: 'bandpass', freq: 2600 + Math.random() * 1400, q: 6, gain: 0.09,
        });
      }
      burst(ctx, dest, t + 0.04, { dur: 0.52, type: 'lowpass', freq: 900, gain: 0.07, sweep: 0.5 });
      break;
    case 'door.creak':
      burst(ctx, dest, t, { dur: 1.5, type: 'bandpass', freq: 640, q: 14, gain: 0.10, sweep: 0.72 });
      burst(ctx, dest, t + 0.34, { dur: 1.1, type: 'bandpass', freq: 980, q: 18, gain: 0.055, sweep: 0.8 });
      break;
    /* A loaded bookcase on a concealed pivot. Heavier and slower than a door
     * -- the latch first, then a low groan that carries the weight, then the
     * books shifting on their shelves. */
    case 'mansion.suite.bookcase.open':
      burst(ctx, dest, t, { dur: 0.07, type: 'bandpass', freq: 2200, q: 6, gain: 0.16 });
      burst(ctx, dest, t + 0.06, { dur: 1.7, type: 'lowpass', freq: 420, gain: 0.13, sweep: 0.55 });
      burst(ctx, dest, t + 0.22, { dur: 1.3, type: 'bandpass', freq: 520, q: 11, gain: 0.07, sweep: 0.75 });
      for (let i = 0; i < 4; i++) {
        burst(ctx, dest, t + 0.5 + i * 0.18 + Math.random() * 0.08, {
          dur: 0.09, type: 'bandpass', freq: 1400 + Math.random() * 900, q: 4, gain: 0.05,
        });
      }
      break;
    case 'mansion.suite.bookcase.shut':
      burst(ctx, dest, t, { dur: 1.2, type: 'bandpass', freq: 480, q: 10, gain: 0.07, sweep: 0.7 });
      burst(ctx, dest, t + 1.05, { dur: 0.26, type: 'lowpass', freq: 190, gain: 0.24, sweep: 0.4 });
      burst(ctx, dest, t + 1.08, { dur: 0.1, type: 'bandpass', freq: 1300, q: 3, gain: 0.06 });
      break;
    /* Mains sagging for a moment: the hum drops in pitch and comes back. No
     * click, because nothing switched. */
    case 'light.dip':
      tone(ctx, dest, t, { freq: 120, to: 96, dur: 0.22, gain: 0.045, type: 'sine' });
      tone(ctx, dest, t + 0.22, { freq: 96, to: 120, dur: 0.5, gain: 0.03, type: 'sine' });
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
    case 'chair.roll.loop':
      // Castors turning on a hard floor, held while you are actually moving.
      burst(ctx, dest, t, { dur: 0.9, type: 'bandpass', freq: 520, q: 1.1, gain: 0.16 });
      burst(ctx, dest, t, { dur: 0.9, type: 'highpass', freq: 2400, gain: 0.05 });
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
    case 'cs.step':
      // One boot on grit: the only warning you get.
      burst(ctx, dest, t, { dur: 0.07, type: 'bandpass', freq: 1100, q: 1.4, gain: 0.20 });
      burst(ctx, dest, t + 0.05, { dur: 0.10, type: 'lowpass', freq: 420, gain: 0.12, sweep: 0.5 });
      break;
    case 'cs.headshot':
      // The one that lands: your shot, then the confirmation ping.
      burst(ctx, dest, t, { dur: 0.10, type: 'highpass', freq: 1700, gain: 0.34, sweep: 0.7 });
      tone(ctx, dest, t + 0.05, { freq: 1900, to: 1900, dur: 0.07, gain: 0.20, type: 'sine' });
      tone(ctx, dest, t + 0.14, { freq: 2550, to: 2550, dur: 0.16, gain: 0.16, type: 'sine' });
      break;

    case 'bong.bubble':
      // Water pulling through the stem: a low burble that climbs as the
      // chamber fills, then stops dead on the pull.
      burst(ctx, dest, t, { dur: 1.5, type: 'lowpass', freq: 420, gain: 0.26, sweep: 1.6 });
      burst(ctx, dest, t, { dur: 1.5, type: 'bandpass', freq: 900, q: 2.4, gain: 0.16, sweep: 1.9 });
      tone(ctx, dest, t, { freq: 92, to: 148, dur: 1.4, gain: 0.09, type: 'sine' });
      break;

    case 'egg.crack':
      for (const at of [0, 0.42]) {
        burst(ctx, dest, t + at, { dur: 0.05, type: 'highpass', freq: 3600, gain: 0.26 });
        burst(ctx, dest, t + at + 0.09, { dur: 0.20, type: 'lowpass', freq: 900, gain: 0.16, sweep: 0.5 });
      }
      break;
    case 'egg.eat':
      for (let i = 0; i < 4; i++) {
        burst(ctx, dest, t + i * 0.34, { dur: 0.14, type: 'bandpass', freq: 1500, q: 1.2, gain: 0.14 });
        tone(ctx, dest, t + i * 0.34, { freq: 2400, to: 1900, dur: 0.03, gain: 0.07, type: 'triangle' });
      }
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

    /* -------- the glue --------
     * These are doing a job. The whole bit is that a bottle of PVA that has
     * gone solid round the nozzle sounds, beat for beat, like something else
     * entirely -- right up until the glue lands on the wall and it is very
     * obviously glue. So: wet, rhythmic, effortful, and every one of them
     * literally the sound of a plastic bottle being squeezed.
     */
    case 'glue.pickup':
      burst(ctx, dest, t, { dur: 0.10, type: 'bandpass', freq: 1800, q: 1.2, gain: 0.16 });
      tone(ctx, dest, t + 0.05, { freq: 240, to: 180, dur: 0.09, gain: 0.10, type: 'triangle' });
      break;
    case 'glue.squeeze': {
      // Air and adhesive shifting inside a bottle that does not want to give.
      burst(ctx, dest, t, { dur: 0.26, type: 'bandpass', freq: 620, q: 2.6, gain: 0.26, sweep: 1.5 });
      burst(ctx, dest, t + 0.04, { dur: 0.18, type: 'lowpass', freq: 900, gain: 0.16, sweep: 0.6 });
      tone(ctx, dest, t, { freq: 118, to: 168, dur: 0.22, gain: 0.11, type: 'triangle' });
      break;
    }
    case 'glue.slip':
      // Hand skids off the bottle. Nothing comes out.
      burst(ctx, dest, t, { dur: 0.13, type: 'highpass', freq: 2200, gain: 0.13, sweep: 0.7 });
      break;
    case 'glue.effort': {
      // Him, not the bottle.
      const f0 = 108 + Math.random() * 22;
      tone(ctx, dest, t, { freq: f0, to: f0 * 1.24, dur: 0.20, gain: 0.15, type: 'sawtooth' });
      burst(ctx, dest, t, { dur: 0.24, type: 'bandpass', freq: 520, q: 2.6, gain: 0.07, sweep: 0.7 });
      break;
    }
    case 'glue.groan': {
      // Five seconds of a man leaning on a bottle with his whole chest.
      const g0 = 96;
      tone(ctx, dest, t, { freq: g0, to: g0 * 1.32, dur: 1.6, gain: 0.17, type: 'sawtooth' });
      tone(ctx, dest, t + 1.5, { freq: g0 * 1.32, to: g0 * 1.44, dur: 2.0, gain: 0.19, type: 'sawtooth' });
      tone(ctx, dest, t + 3.4, { freq: g0 * 1.44, to: g0 * 0.78, dur: 1.7, gain: 0.16, type: 'sawtooth' });
      burst(ctx, dest, t, { dur: 5.0, type: 'bandpass', freq: 560, q: 3.0, gain: 0.055, sweep: 1.4 });
      break;
    }
    case 'glue.burst':
      // The nozzle gives. All of it, at once, at the wall.
      burst(ctx, dest, t, { dur: 0.34, type: 'bandpass', freq: 780, q: 1.1, gain: 0.42, sweep: 2.2 });
      burst(ctx, dest, t + 0.05, { dur: 0.55, type: 'lowpass', freq: 1300, gain: 0.24, sweep: 0.5 });
      tone(ctx, dest, t, { freq: 210, to: 74, dur: 0.40, gain: 0.16, type: 'triangle' });
      // And the several wet arrivals on the plaster.
      for (let i = 0; i < 5; i++) {
        burst(ctx, dest, t + 0.16 + i * 0.055 + Math.random() * 0.04, {
          dur: 0.09, type: 'bandpass', freq: 1500 + Math.random() * 900, q: 2.2, gain: 0.13,
        });
      }
      break;

    /* -------- the other thing -------- */
    case 'tap.squeak':
      // Quarter-turn valve, slightly stiff.
      tone(ctx, dest, t, { freq: 1300, to: 780, dur: 0.11, gain: 0.09, type: 'sine' });
      burst(ctx, dest, t, { dur: 0.06, type: 'bandpass', freq: 2400, q: 3.0, gain: 0.07 });
      break;
    case 'tap.run':
      // Mains into a steel basin: broadband hiss with a hollow ring under it.
      burst(ctx, dest, t, { dur: 0.9, type: 'highpass', freq: 1500, gain: 0.16 });
      burst(ctx, dest, t, { dur: 0.9, type: 'bandpass', freq: 620, q: 1.3, gain: 0.11 });
      break;
    case 'toilet.lid':
      // Plastic swinging up and knocking against the cistern.
      burst(ctx, dest, t, { dur: 0.09, type: 'bandpass', freq: 900, q: 1.4, gain: 0.16, sweep: 0.6 });
      tone(ctx, dest, t + 0.16, { freq: 320, to: 190, dur: 0.09, gain: 0.16, type: 'triangle' });
      break;
    case 'poop.strain':
      // Held breath and no result: a tight, quiet effort that goes nowhere.
      tone(ctx, dest, t, { freq: 128, to: 152, dur: r(0.42), gain: 0.10, type: 'sawtooth' });
      burst(ctx, dest, t, { dur: r(0.40), type: 'bandpass', freq: 340, q: 3.2, gain: 0.07 });
      break;
    case 'poop.grunt': {
      // A short one from the chest, pitched down at the end.
      const g0 = 95 + Math.random() * 25;
      tone(ctx, dest, t, { freq: g0, to: g0 * 1.18, dur: r(0.14), gain: 0.20, type: 'sawtooth' });
      tone(ctx, dest, t + 0.13, { freq: g0 * 1.18, to: g0 * 0.72, dur: r(0.22), gain: 0.17, type: 'sawtooth' });
      burst(ctx, dest, t, { dur: r(0.34), type: 'bandpass', freq: 480, q: 2.4, gain: 0.09, sweep: 0.6 });
      break;
    }
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
    case 'water.splash':
      burst(ctx, dest, t, { dur: 0.65, type: 'lowpass', freq: 720, gain: 0.32 });
      burst(ctx, dest, t + 0.05, { dur: 1.1, type: 'bandpass', freq: 1450, gain: 0.18 });
      tone(ctx, dest, t, { freq: 92, to: 48, dur: 0.48, gain: 0.12, type: 'sine' });
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

    /* -------- the Bada Bing --------
     * A club is mostly other people's noise. These are the events that happen
     * on top of the beds in synthLoop(): a machine eating money, cards on
     * felt, a door with an opinion, and one alarm nobody wants going off.
     */
    case 'slot.pull':
      // A sprung lever coming down and the drum letting go.
      burst(ctx, dest, t, { dur: 0.16, type: 'bandpass', freq: 520, q: 2.4, gain: 0.24, sweep: 0.5 });
      tone(ctx, dest, t + 0.06, { freq: 240, to: 120, dur: 0.14, gain: 0.16, type: 'square' });
      break;
    case 'slot.reel':
      // The reels turning: a fast tick that thins out as they slow.
      for (let i = 0; i < 26; i++) {
        burst(ctx, dest, t + i * (0.045 + i * 0.0022), {
          dur: 0.015, type: 'bandpass', freq: 2100, q: 5, gain: 0.09,
        });
      }
      break;
    case 'slot.stop':
      burst(ctx, dest, t, { dur: 0.05, type: 'bandpass', freq: 900, q: 3.2, gain: 0.22 });
      tone(ctx, dest, t, { freq: 180, to: 90, dur: 0.08, gain: 0.12, type: 'square' });
      break;
    case 'slot.win':
      for (let i = 0; i < 6; i++) {
        tone(ctx, dest, t + i * 0.09, { freq: 700 + i * 180, dur: 0.1, gain: 0.13, type: 'square' });
      }
      break;
    /* The jackpot alarm, which Lou can hear through a wall and a hallway.
     * Deliberately too much: a two-tone siren, a bell, and coins. */
    case 'slot.jackpot':
      for (let i = 0; i < 10; i++) {
        tone(ctx, dest, t + i * 0.28, { freq: 980, to: 1320, dur: 0.14, gain: 0.16, type: 'square' });
        tone(ctx, dest, t + i * 0.28 + 0.14, { freq: 1320, to: 980, dur: 0.14, gain: 0.16, type: 'square' });
      }
      for (let i = 0; i < 40; i++) {
        burst(ctx, dest, t + 0.4 + Math.random() * 2.6, {
          dur: 0.03, type: 'bandpass', freq: 2600 + Math.random() * 2600, q: 6, gain: 0.10,
        });
      }
      break;
    case 'card.deal':
      // Card off the shoe and onto felt: a short scrape and a soft landing.
      burst(ctx, dest, t, { dur: 0.055, type: 'bandpass', freq: 3200, q: 1.4, gain: 0.16, sweep: 1.4 });
      burst(ctx, dest, t + 0.05, { dur: 0.04, type: 'lowpass', freq: 700, gain: 0.10 });
      break;
    case 'chips.place':
      for (let i = 0; i < 4; i++) {
        burst(ctx, dest, t + i * 0.035, { dur: 0.03, type: 'bandpass', freq: 1400 + i * 220, q: 4, gain: 0.13 });
      }
      break;
    case 'card.flip':
      // The hole card turned over: a sharper snap than the deal, then flat.
      burst(ctx, dest, t, { dur: 0.03, type: 'highpass', freq: 2600, gain: 0.18 });
      burst(ctx, dest, t + 0.035, { dur: 0.05, type: 'lowpass', freq: 900, gain: 0.12 });
      break;
    case 'chip.stack':
      // A paid stack set down and squared up: heavier and happier than a bet.
      for (let i = 0; i < 7; i++) {
        burst(ctx, dest, t + i * 0.03, { dur: 0.028, type: 'bandpass', freq: 1250 + (i % 3) * 260, q: 4, gain: 0.15 });
      }
      tone(ctx, dest, t + 0.22, { freq: 320, to: 240, dur: 0.06, gain: 0.08, type: 'triangle' });
      break;
    case 'duck.quack':
      // One rubber duck, exactly as the store room's manifest promised.
      tone(ctx, dest, t, { freq: 620, to: 380, dur: 0.16, gain: 0.22, type: 'sawtooth' });
      tone(ctx, dest, t + 0.05, { freq: 940, to: 520, dur: 0.12, gain: 0.1, type: 'square' });
      break;
    case 'glass.set':
      tone(ctx, dest, t, { freq: 1500, to: 1200, dur: 0.07, gain: 0.10, type: 'sine' });
      burst(ctx, dest, t, { dur: 0.03, type: 'highpass', freq: 4200, gain: 0.09 });
      break;
    case 'till.ring':
      tone(ctx, dest, t, { freq: 1760, dur: 0.22, gain: 0.13, type: 'sine' });
      burst(ctx, dest, t + 0.06, { dur: 0.2, type: 'lowpass', freq: 900, gain: 0.14, sweep: 0.4 });
      break;
    case 'rope.clip':
      burst(ctx, dest, t, { dur: 0.06, type: 'bandpass', freq: 2400, q: 3, gain: 0.14 });
      break;
    case 'alarm.chirp':
      tone(ctx, dest, t, { freq: 2400, dur: 0.09, gain: 0.2, type: 'square' });
      tone(ctx, dest, t + 0.16, { freq: 2400, dur: 0.09, gain: 0.2, type: 'square' });
      break;
    case 'neon.zap':
      burst(ctx, dest, t, { dur: 0.07, type: 'bandpass', freq: 3800, q: 2, gain: 0.14, sweep: 1.6 });
      tone(ctx, dest, t, { freq: 120, dur: 0.05, gain: 0.06, type: 'sawtooth' });
      break;
    case 'car.start':
      tone(ctx, dest, t, { freq: 42, to: 88, dur: 0.9, gain: 0.30, type: 'sawtooth' });
      burst(ctx, dest, t, { dur: 0.7, type: 'lowpass', freq: 320, gain: 0.22, sweep: 0.5 });
      break;
    case 'car.door':
      tone(ctx, dest, t, { freq: 150, to: 60, dur: 0.18, gain: 0.28, type: 'triangle' });
      burst(ctx, dest, t, { dur: 0.12, type: 'bandpass', freq: 700, q: 1.6, gain: 0.2 });
      break;

    /* -------- Bada Bing: the HotDog Incident -------- */
    case 'hotdog.knife.draw':
      // A short folded-knife draw: metal, leather, then stillness. It is a
      // warning prop, not a stab cue; Ape finishes this with his fists.
      burst(ctx, dest, t, { dur: 0.12, type: 'bandpass', freq: 3100, q: 5, gain: 0.13, sweep: 1.6 });
      tone(ctx, dest, t + 0.06, { freq: 1150, to: 1720, dur: 0.08, gain: 0.055, type: 'triangle' });
      break;
    /* Four hits, four distinct sounds, escalating. The first is the surprise
     * and has the most knuckle in it; by the fourth there is very little snap
     * left and a great deal of body, because by then HotDog is not standing up
     * to be hit any more. Identical repeats read as a loop, not a beating. */
    case 'hotdog.fist.impact.1':
      bodyImpact(ctx, dest, t, { weight: 0.92, snap: 1.25, room: 0.85 });
      break;
    case 'hotdog.fist.impact.2':
      bodyImpact(ctx, dest, t, { weight: 1.05, snap: 0.95, room: 1, gain: 1.05 });
      break;
    case 'hotdog.fist.impact.3':
      bodyImpact(ctx, dest, t, { weight: 1.18, snap: 0.75, room: 1.15, gain: 1.1 });
      break;
    case 'hotdog.fist.impact.4':
      bodyImpact(ctx, dest, t, { weight: 1.4, snap: 0.55, room: 1.4, gain: 1.2 });
      // The one that ends it also puts something through the bar behind them.
      tone(ctx, dest, t + 0.02, { freq: 62, to: 31, dur: 0.42, gain: 0.2, type: 'sine' });
      break;
    case 'hotdog.body.floor':
      // Dead weight onto boards: no bounce, a long floor boom, jacket, and the
      // stool it takes down on the way.
      tone(ctx, dest, t, { freq: 104, to: 41, dur: 0.34, gain: 0.36, type: 'triangle' });
      tone(ctx, dest, t + 0.01, { freq: 57, to: 28, dur: 0.5, gain: 0.22, type: 'sine' });
      burst(ctx, dest, t + 0.015, { dur: 0.22, type: 'lowpass', freq: 210, gain: 0.2, sweep: 0.4 });
      burst(ctx, dest, t + 0.05, { dur: 0.16, type: 'bandpass', freq: 1900, q: 0.8, gain: 0.05, sweep: 0.6 });
      burst(ctx, dest, t + 0.14, { dur: 0.26, type: 'bandpass', freq: 720, q: 2.4, gain: 0.06, sweep: 1.5 });
      break;

    /* -------- the Silver Room --------
     * Money changing hands, a kitchen, and a room going quiet.
     */
    case 'tip.fold':
      /* Folded notes going from one hand into another. Almost nothing: a
       * paper rustle and the cuff of a jacket. It has to be quiet — the whole
       * character of tipping in this place is that nobody acknowledges it, and
       * a satisfying noise would make it a transaction. */
      burst(ctx, dest, t, { dur: 0.09, type: 'highpass', freq: 3400, gain: 0.055, sweep: 0.7 });
      burst(ctx, dest, t + 0.07, { dur: 0.07, type: 'bandpass', freq: 1500, q: 1.2, gain: 0.04 });
      break;
    case 'woo.up':
      // Restrained on purpose. This is not a slot machine paying out.
      tone(ctx, dest, t, { freq: 587, dur: 0.09, gain: 0.055, type: 'sine' });
      tone(ctx, dest, t + 0.07, { freq: 880, dur: 0.13, gain: 0.045, type: 'sine' });
      break;
    case 'woo.down':
      tone(ctx, dest, t, { freq: 392, to: 294, dur: 0.2, gain: 0.055, type: 'sine' });
      break;
    case 'woo.streak':
      for (let i = 0; i < 3; i++) {
        tone(ctx, dest, t + i * 0.1, { freq: 587 + i * 147, dur: 0.14, gain: 0.05, type: 'sine' });
      }
      break;
    case 'kitchen.plate':
      tone(ctx, dest, t, { freq: 2400, to: 2100, dur: 0.06, gain: 0.10, type: 'sine' });
      burst(ctx, dest, t, { dur: 0.04, type: 'highpass', freq: 5200, gain: 0.10 });
      break;
    case 'kitchen.pan':
      burst(ctx, dest, t, { dur: 0.22, type: 'bandpass', freq: 1100, q: 1.1, gain: 0.18, sweep: 0.6 });
      tone(ctx, dest, t, { freq: 320, to: 180, dur: 0.16, gain: 0.10, type: 'triangle' });
      break;
    case 'kitchen.spray':
      burst(ctx, dest, t, { dur: 0.7, type: 'bandpass', freq: 3800, q: 0.8, gain: 0.14 });
      break;
    case 'cooler.door':
      tone(ctx, dest, t, { freq: 90, to: 52, dur: 0.34, gain: 0.20, type: 'triangle' });
      burst(ctx, dest, t + 0.18, { dur: 0.3, type: 'highpass', freq: 2200, gain: 0.10, sweep: 0.4 });
      break;
    case 'crate.drag':
      burst(ctx, dest, t, { dur: 0.5, type: 'bandpass', freq: 620, q: 0.9, gain: 0.16, sweep: 0.3 });
      break;
    case 'cloth.snap':
      // A tablecloth going out over a table, which is one of the best sounds
      // in the mission and lasts about a fifth of a second.
      burst(ctx, dest, t, { dur: 0.16, type: 'highpass', freq: 2600, gain: 0.16, sweep: 1.5 });
      break;
    case 'table.set':
      tone(ctx, dest, t, { freq: 140, to: 90, dur: 0.12, gain: 0.16, type: 'triangle' });
      burst(ctx, dest, t, { dur: 0.07, type: 'lowpass', freq: 500, gain: 0.12 });
      break;
    case 'chair.pull':
      burst(ctx, dest, t, { dur: 0.3, type: 'bandpass', freq: 420, q: 1.4, gain: 0.14, sweep: 0.5 });
      break;
    case 'cutlery.set':
      for (let i = 0; i < 2; i++) {
        burst(ctx, dest, t + i * 0.09, { dur: 0.05, type: 'bandpass', freq: 4200 + i * 900, q: 5, gain: 0.08 });
      }
      break;
    case 'pour':
      // Liquid into a glass: the pitch climbs as the glass fills.
      burst(ctx, dest, t, { dur: 0.9, type: 'bandpass', freq: 900, q: 1.6, gain: 0.11, sweep: 2.2 });
      break;
    case 'ice.drop':
      tone(ctx, dest, t, { freq: 2600, to: 1900, dur: 0.07, gain: 0.09, type: 'sine' });
      break;
    case 'cork.pop':
      tone(ctx, dest, t, { freq: 700, to: 180, dur: 0.06, gain: 0.30, type: 'sine' });
      burst(ctx, dest, t + 0.04, { dur: 0.5, type: 'highpass', freq: 4000, gain: 0.09, sweep: 0.4 });
      break;
    case 'curtain.draw':
      burst(ctx, dest, t, { dur: 1.4, type: 'lowpass', freq: 900, gain: 0.14, sweep: 0.5 });
      break;
    case 'stage.clunk':
      // A lighting bar taking load: a contactor, then the lamps.
      tone(ctx, dest, t, { freq: 70, dur: 0.06, gain: 0.24, type: 'square' });
      burst(ctx, dest, t + 0.05, { dur: 0.5, type: 'lowpass', freq: 300, gain: 0.07, sweep: 0.3 });
      break;
    case 'mic.handle':
      burst(ctx, dest, t, { dur: 0.12, type: 'lowpass', freq: 260, gain: 0.20 });
      break;
    /* `applause` also plays as a ONE-SHOT (`Performance.applaud()` calls
     * both `audio.play('applause', ...)` and `startLoop('applause', ...)`).
     * The loop's own fallback is `synthLoop`'s case below; without this one
     * the one-shot fell through to the generic default tick, which is what
     * every one-shot round of applause in the room sounded like before a
     * recording existed. */
    case 'applause':
      burst(ctx, dest, t, { dur: 1.8, type: 'bandpass', freq: 1900, q: 0.5, gain: 0.22, sweep: 0.7 });
      burst(ctx, dest, t + 0.02, { dur: 1.5, type: 'highpass', freq: 4600, q: 0.4, gain: 0.12, sweep: 0.6 });
      break;
    /* -------- The Word From The Violinist -------- */
    case 'crowd.whistle':
      // One sharp two-fingered whistle: up on the intake, down on the note.
      tone(ctx, dest, t, { freq: 1600, to: 3200, dur: 0.35, gain: 0.14, type: 'sine' });
      tone(ctx, dest, t + 0.32, { freq: 3100, to: 1500, dur: 0.55, gain: 0.11, type: 'sine' });
      break;
    case 'crowd.laughter': {
      // Several distinct "ha" pulses rather than one wash, easing off at the end.
      const HA = [0, 0.16, 0.30, 0.48, 0.66, 0.90, 1.2];
      for (let i = 0; i < HA.length; i++) {
        burst(ctx, dest, t + HA[i], {
          dur: 0.14 + (i % 2) * 0.03, type: 'bandpass', freq: 700 + (i % 3) * 220, q: 1.4,
          gain: 0.10 * (1 - i / (HA.length + 2)), sweep: 0.6,
        });
      }
      break;
    }
    case 'band.rimshot':
      // Ba-dum-tss: two tight snare cracks, then the cymbal wash.
      burst(ctx, dest, t, { dur: 0.05, type: 'bandpass', freq: 1700, q: 2.2, gain: 0.30 });
      tone(ctx, dest, t, { freq: 210, to: 90, dur: 0.06, gain: 0.20, type: 'triangle' });
      burst(ctx, dest, t + 0.16, { dur: 0.05, type: 'bandpass', freq: 1700, q: 2.2, gain: 0.30 });
      tone(ctx, dest, t + 0.16, { freq: 210, to: 90, dur: 0.06, gain: 0.20, type: 'triangle' });
      burst(ctx, dest, t + 0.32, { dur: 0.55, type: 'highpass', freq: 5200, q: 0.5, gain: 0.16, sweep: 0.5 });
      break;
    case 'camera.flash':
      burst(ctx, dest, t, { dur: 0.05, type: 'highpass', freq: 3600, gain: 0.16 });
      tone(ctx, dest, t + 0.04, { freq: 1400, to: 4200, dur: 0.6, gain: 0.03, type: 'sine' });
      break;

    /* -------- THE TAKE -------- */
    case 'heist.weapon.carbine':
      burst(ctx, dest, t, { dur: 0.028, type: 'highpass', freq: 2100, gain: 0.82 });
      burst(ctx, dest, t + 0.004, { dur: 0.24, type: 'lowpass', freq: 360, gain: 0.64, sweep: 0.3 });
      burst(ctx, dest, t + 0.035, { dur: 0.42, type: 'bandpass', freq: 1100, q: 0.8, gain: 0.12, sweep: 0.45 });
      break;
    case 'heist.weapon.empty':
      burst(ctx, dest, t, { dur: 0.025, type: 'bandpass', freq: 2300, q: 4, gain: 0.25 });
      break;
    case 'heist.weapon.reload':
    case 'heist.weapon.check':
    case 'heist.swap.weapons':
    case 'heist.weapon.down':
      for (let i = 0; i < 4; i++) {
        burst(ctx, dest, t + i * 0.12, { dur: 0.035, type: 'bandpass', freq: 1000 + i * 420, q: 3, gain: 0.16 });
      }
      break;
    case 'heist.vault.panel':
      for (let i = 0; i < 5; i++) tone(ctx, dest, t + i * 0.11, { freq: 720 + i * 95, dur: 0.05, gain: 0.09, type: 'square' });
      break;
    case 'heist.vault.open':
      tone(ctx, dest, t, { freq: 62, to: 38, dur: 1.8, gain: 0.28, type: 'sawtooth' });
      for (let i = 0; i < 5; i++) burst(ctx, dest, t + 0.25 + i * 0.23, { dur: 0.09, type: 'lowpass', freq: 420, gain: 0.22 });
      break;
    case 'heist.vehicle.impact':
      burst(ctx, dest, t, { dur: 0.22, type: 'lowpass', freq: 480, gain: 0.65, sweep: 0.3 });
      burst(ctx, dest, t + 0.04, { dur: 0.8, type: 'highpass', freq: 2800, gain: 0.18, sweep: 0.35 });
      break;
    case 'heist.vehicle.curbstone':
    case 'heist.player.hit':
      burst(ctx, dest, t, { dur: 0.16, type: 'lowpass', freq: 380, gain: 0.38, sweep: 0.35 });
      break;
    case 'heist.armor.strap':
    case 'heist.apartment.pack':
    case 'heist.apartment.changed':
    case 'heist.apartment.gearSecured':
    case 'heist.swap.fabric':
      burst(ctx, dest, t, { dur: 0.42, type: 'bandpass', freq: 1500, q: 0.8, gain: 0.18, sweep: 0.55 });
      break;
    case 'heist.apartment.washed':
    case 'heist.swap.wipe':
      burst(ctx, dest, t, { dur: 0.58, type: 'highpass', freq: 2100, gain: 0.14, sweep: 0.65 });
      break;
    case 'heist.swap.trunk':
      tone(ctx, dest, t, { freq: 150, to: 66, dur: 0.22, gain: 0.24, type: 'triangle' });
      burst(ctx, dest, t + 0.04, { dur: 0.18, type: 'bandpass', freq: 780, q: 2, gain: 0.18 });
      break;

    /* -------- NO WAKE production fallbacks -------- */
    case 'boat.board.step':
      tone(ctx, dest, t, { freq: 115, to: 72, dur: r(0.11), gain: 0.24, type: 'triangle' });
      burst(ctx, dest, t + r(0.018), { dur: r(0.12), type: 'bandpass', freq: 880, q: 1.7, gain: 0.16, sweep: 0.55 });
      tone(ctx, dest, t + r(0.055), { freq: 310, to: 205, dur: r(0.16), gain: 0.07, type: 'sine' });
      break;
    case 'boat.engine.start':
      burst(ctx, dest, t, { dur: r(0.55), type: 'lowpass', freq: 240, q: 0.8, gain: 0.22, sweep: 1.35 });
      tone(ctx, dest, t + r(0.12), { freq: 31, to: 57, dur: r(0.72), gain: 0.20, type: 'sawtooth' });
      tone(ctx, dest, t + r(0.42), { freq: 35, to: 61, dur: r(0.68), gain: 0.17, type: 'sawtooth' });
      break;
    case 'boat.engine.shutdown':
      tone(ctx, dest, t, { freq: 58, to: 26, dur: r(0.72), gain: 0.22, type: 'sawtooth' });
      tone(ctx, dest, t + r(0.16), { freq: 62, to: 25, dur: r(0.82), gain: 0.16, type: 'triangle' });
      burst(ctx, dest, t + r(0.72), { dur: r(0.16), type: 'bandpass', freq: 1450, q: 4.2, gain: 0.08 });
      break;
    case 'boat.rope.release':
      burst(ctx, dest, t, { dur: r(0.34), type: 'bandpass', freq: 720, q: 0.9, gain: 0.16, sweep: 1.55 });
      burst(ctx, dest, t + r(0.16), { dur: r(0.12), type: 'highpass', freq: 2600, q: 1.2, gain: 0.10 });
      tone(ctx, dest, t + r(0.25), { freq: 690, to: 430, dur: r(0.10), gain: 0.08, type: 'triangle' });
      break;
    case 'boat.body.drag':
      burst(ctx, dest, t, { dur: r(0.76), type: 'bandpass', freq: 430, q: 0.8, gain: 0.24, sweep: 0.58 });
      burst(ctx, dest, t + r(0.16), { dur: r(0.52), type: 'bandpass', freq: 1500, q: 0.7, gain: 0.12, sweep: 0.72 });
      tone(ctx, dest, t + r(0.38), { freq: 104, to: 64, dur: r(0.16), gain: 0.18, type: 'triangle' });
      break;
    case 'boat.body.rail':
      tone(ctx, dest, t, { freq: 92, to: 48, dur: r(0.24), gain: 0.34, type: 'triangle' });
      burst(ctx, dest, t + r(0.035), { dur: r(0.25), type: 'bandpass', freq: 1180, q: 2.8, gain: 0.16, sweep: 0.58 });
      burst(ctx, dest, t + r(0.11), { dur: r(0.22), type: 'highpass', freq: 2350, q: 1.6, gain: 0.09 });
      break;
    case 'boat.gunshot.deck':
      burst(ctx, dest, t, { dur: r(0.035), type: 'highpass', freq: 2450, gain: 0.78 });
      burst(ctx, dest, t + r(0.004), { dur: r(0.30), type: 'lowpass', freq: 410, gain: 0.56, sweep: 0.28 });
      burst(ctx, dest, t + r(0.07), { dur: r(0.72), type: 'bandpass', freq: 920, q: 0.55, gain: 0.13, sweep: 0.38 });
      break;

    /* -------- THE TAKE production fallbacks -------- */
    case 'heist.map.paper':
      burst(ctx, dest, t, { dur: r(0.52), type: 'highpass', freq: 1900, q: 0.7, gain: 0.15, sweep: 1.45 });
      burst(ctx, dest, t + r(0.18), { dur: r(0.38), type: 'bandpass', freq: 1150, q: 0.9, gain: 0.11, sweep: 0.68 });
      tone(ctx, dest, t + r(0.46), { freq: 760, to: 510, dur: r(0.08), gain: 0.08, type: 'triangle' });
      break;
    case 'heist.gear.armor.pickup':
      burst(ctx, dest, t, { dur: r(0.44), type: 'bandpass', freq: 980, q: 0.85, gain: 0.19, sweep: 0.62 });
      tone(ctx, dest, t + r(0.08), { freq: 122, to: 82, dur: r(0.20), gain: 0.17, type: 'triangle' });
      burst(ctx, dest, t + r(0.31), { dur: r(0.06), type: 'bandpass', freq: 2600, q: 4.5, gain: 0.09 });
      break;
    case 'heist.gear.carbine.pickup':
      tone(ctx, dest, t, { freq: 180, to: 115, dur: r(0.16), gain: 0.14, type: 'triangle' });
      burst(ctx, dest, t + r(0.07), { dur: r(0.045), type: 'bandpass', freq: 1880, q: 4, gain: 0.14 });
      burst(ctx, dest, t + r(0.18), { dur: r(0.05), type: 'bandpass', freq: 2850, q: 4.8, gain: 0.11 });
      break;
    case 'heist.van.door':
      tone(ctx, dest, t, { freq: 138, to: 66, dur: r(0.28), gain: 0.30, type: 'triangle' });
      burst(ctx, dest, t, { dur: r(0.08), type: 'bandpass', freq: 1450, q: 3, gain: 0.20 });
      burst(ctx, dest, t + r(0.23), { dur: r(0.28), type: 'lowpass', freq: 520, q: 0.8, gain: 0.18, sweep: 0.48 });
      break;
    case 'heist.bank.entry':
      burst(ctx, dest, t, { dur: r(0.14), type: 'highpass', freq: 2200, q: 0.8, gain: 0.24 });
      tone(ctx, dest, t + r(0.025), { freq: 170, to: 92, dur: r(0.22), gain: 0.23, type: 'triangle' });
      burst(ctx, dest, t + r(0.08), { dur: r(0.48), type: 'bandpass', freq: 880, q: 0.55, gain: 0.12, sweep: 0.52 });
      break;
    case 'heist.guard.draw':
      burst(ctx, dest, t, { dur: r(0.20), type: 'bandpass', freq: 1250, q: 1.1, gain: 0.14, sweep: 1.35 });
      burst(ctx, dest, t + r(0.11), { dur: r(0.035), type: 'bandpass', freq: 3300, q: 5.5, gain: 0.17 });
      break;
    case 'heist.guard.weapon.drop':
      burst(ctx, dest, t, { dur: r(0.045), type: 'bandpass', freq: 2450, q: 4.8, gain: 0.27 });
      tone(ctx, dest, t + r(0.04), { freq: 980, to: 610, dur: r(0.14), gain: 0.13, type: 'triangle' });
      burst(ctx, dest, t + r(0.16), { dur: r(0.16), type: 'highpass', freq: 1750, q: 1.2, gain: 0.08, sweep: 0.52 });
      break;
    case 'heist.weapon.carbine.indoor':
      burst(ctx, dest, t, { dur: r(0.026), type: 'highpass', freq: 2600, gain: 0.88 });
      burst(ctx, dest, t + r(0.003), { dur: r(0.34), type: 'lowpass', freq: 440, gain: 0.72, sweep: 0.25 });
      burst(ctx, dest, t + r(0.028), { dur: r(0.82), type: 'bandpass', freq: 1250, q: 0.65, gain: 0.23, sweep: 0.42 });
      break;
    case 'heist.crowd.react':
      burst(ctx, dest, t, { dur: r(0.74), type: 'bandpass', freq: 610, q: 1.3, gain: 0.20, sweep: 0.72 });
      burst(ctx, dest, t + r(0.035), { dur: r(0.58), type: 'bandpass', freq: 1550, q: 1.0, gain: 0.13, sweep: 0.58 });
      burst(ctx, dest, t + r(0.20), { dur: r(0.46), type: 'highpass', freq: 3100, q: 0.7, gain: 0.08 });
      break;
    case 'heist.body.marble':
      tone(ctx, dest, t, { freq: 104, to: 48, dur: r(0.26), gain: 0.40, type: 'triangle' });
      burst(ctx, dest, t + r(0.025), { dur: r(0.22), type: 'lowpass', freq: 590, q: 0.9, gain: 0.28, sweep: 0.42 });
      burst(ctx, dest, t + r(0.12), { dur: r(0.30), type: 'bandpass', freq: 1300, q: 0.7, gain: 0.10, sweep: 0.48 });
      break;
    case 'heist.cash.lift':
      burst(ctx, dest, t, { dur: r(0.55), type: 'bandpass', freq: 820, q: 0.8, gain: 0.18, sweep: 0.62 });
      burst(ctx, dest, t + r(0.06), { dur: r(0.42), type: 'highpass', freq: 2350, q: 0.7, gain: 0.10, sweep: 0.78 });
      tone(ctx, dest, t + r(0.24), { freq: 118, to: 86, dur: r(0.21), gain: 0.12, type: 'triangle' });
      break;
    case 'heist.cash.drop':
      tone(ctx, dest, t, { freq: 112, to: 51, dur: r(0.25), gain: 0.34, type: 'triangle' });
      burst(ctx, dest, t + r(0.018), { dur: r(0.32), type: 'lowpass', freq: 660, q: 0.8, gain: 0.20, sweep: 0.48 });
      burst(ctx, dest, t + r(0.15), { dur: r(0.08), type: 'bandpass', freq: 2150, q: 4.2, gain: 0.08 });
      break;
    case 'heist.police.gunshot':
      burst(ctx, dest, t, { dur: r(0.028), type: 'highpass', freq: 2850, gain: 0.68 });
      burst(ctx, dest, t + r(0.006), { dur: r(0.26), type: 'lowpass', freq: 390, gain: 0.42, sweep: 0.30 });
      burst(ctx, dest, t + r(0.10), { dur: r(0.68), type: 'bandpass', freq: 980, q: 0.55, gain: 0.12, sweep: 0.40 });
      break;
    case 'heist.bullet.whiz':
      tone(ctx, dest, t, { freq: 4400, to: 980, dur: r(0.14), gain: 0.18, type: 'sine' });
      burst(ctx, dest, t + r(0.012), { dur: r(0.18), type: 'highpass', freq: 4200, q: 0.9, gain: 0.22, sweep: 0.35 });
      break;
    case 'heist.bullet.impact':
      burst(ctx, dest, t, { dur: r(0.045), type: 'bandpass', freq: 1900, q: 2.8, gain: 0.35, sweep: 0.42 });
      tone(ctx, dest, t + r(0.006), { freq: 220, to: 86, dur: r(0.16), gain: 0.20, type: 'triangle' });
      burst(ctx, dest, t + r(0.05), { dur: r(0.24), type: 'highpass', freq: 3100, q: 0.8, gain: 0.12, sweep: 0.54 });
      break;

    /* -------- The Enola Squatch's tail gun --------
     *
     * Owner playtest, 2026-08-04: "better bigger machine guns sounds for the
     * rear gun." The rear turret was playing `gun.shot` — the apartment's
     * REVOLVER, a single indoor pistol crack with a room slap on it — eleven
     * times a second out of a pair of half-inch belt-fed guns at four thousand
     * feet. It sounded like somebody shooting a pistol into a bathroom.
     *
     * A heavy aircraft gun is a different animal and is three things a
     * revolver is not: an enormous low thump you feel before you hear it, a
     * hard supersonic crack riding on top, and — the part that actually makes
     * it read as a MACHINE gun — the mechanism, a big reciprocating bolt
     * slamming in a steel receiver a foot from the gunner's head. There is no
     * room tail, because there is no room; what comes back instead is the
     * slipstream, which is the wide, short noise wash at the end.
     */
    case 'enolasquatch.gun.rear':
      // The thump. Two low sines an octave apart so it has weight without mud.
      tone(ctx, dest, t, { freq: 88, to: 34, dur: r(0.20), gain: 0.62, type: 'sine' });
      tone(ctx, dest, t + r(0.004), { freq: 172, to: 62, dur: r(0.13), gain: 0.34, type: 'triangle' });
      // The crack, off the muzzle: brief, bright, and much louder than a pistol.
      burst(ctx, dest, t, { dur: r(0.026), type: 'highpass', freq: 2400, gain: 1.0 });
      burst(ctx, dest, t + r(0.003), { dur: r(0.16), type: 'lowpass', freq: 280, gain: 0.92, sweep: 0.30 });
      // The receiver: bolt back, bolt home. This is the machine part.
      burst(ctx, dest, t + r(0.030), { dur: r(0.05), type: 'bandpass', freq: 640, q: 3.4, gain: 0.30, sweep: 0.5 });
      burst(ctx, dest, t + r(0.062), { dur: r(0.04), type: 'bandpass', freq: 1250, q: 5.0, gain: 0.22 });
      // Brass on the chute, because the chute is right there.
      burst(ctx, dest, t + r(0.09), { dur: r(0.05), type: 'bandpass', freq: 3400, q: 4.5, gain: 0.09 });
      // Slipstream wash rather than a room tail.
      burst(ctx, dest, t + r(0.02), { dur: r(0.34), type: 'bandpass', freq: 760, q: 0.5, gain: 0.16, sweep: 0.55 });
      break;
    /* The same guns heard from the flight deck, thirteen metres up the
     * fuselage with the Shubenator working them: all the low end, none of the
     * mechanism, and a duller crack. Played instead of the close cue whenever
     * the player is NOT in the turret, so the gun sounds like it is somewhere
     * else in the aeroplane — which it is. */
    case 'enolasquatch.gun.rear.cabin':
      tone(ctx, dest, t, { freq: 76, to: 30, dur: r(0.26), gain: 0.44, type: 'sine' });
      burst(ctx, dest, t + r(0.004), { dur: r(0.20), type: 'lowpass', freq: 210, gain: 0.50, sweep: 0.26 });
      burst(ctx, dest, t + r(0.01), { dur: r(0.09), type: 'bandpass', freq: 520, q: 1.1, gain: 0.16, sweep: 0.4 });
      burst(ctx, dest, t + r(0.05), { dur: r(0.30), type: 'lowpass', freq: 900, q: 0.5, gain: 0.07, sweep: 0.5 });
      break;
    /* A night fighter's engine screaming — wounded and running, or on its way
     * down. The caller pitches it: up for the runner, down for the kill. A
     * long sawtooth falling most of an octave with the supercharger whine an
     * octave and a half over it, both under a widening wind wash. */
    case 'enola.interceptor.scream':
      tone(ctx, dest, t, { freq: 620, to: 260, dur: r(2.4), gain: 0.16, type: 'sawtooth' });
      tone(ctx, dest, t + r(0.03), { freq: 1900, to: 760, dur: r(2.2), gain: 0.07, type: 'sine' });
      tone(ctx, dest, t + r(0.05), { freq: 92, to: 46, dur: r(2.4), gain: 0.14, type: 'triangle' });
      burst(ctx, dest, t + r(0.2), { dur: r(2.2), type: 'bandpass', freq: 900, q: 0.6, gain: 0.08, sweep: 1.4 });
      break;
    /* A fighter coming apart under cannon fire: the structural crunch, the
     * tear of skin, the whump of fuel, and the small stuff whistling away. */
    case 'enola.interceptor.breakup':
      tone(ctx, dest, t, { freq: 120, to: 32, dur: r(0.5), gain: 0.5, type: 'sine' });
      burst(ctx, dest, t, { dur: r(0.16), type: 'lowpass', freq: 420, gain: 0.6, sweep: 0.4 });
      burst(ctx, dest, t + r(0.05), { dur: r(0.6), type: 'bandpass', freq: 2300, q: 1.4, gain: 0.26, sweep: 0.8 });
      burst(ctx, dest, t + r(0.24), { dur: r(0.7), type: 'lowpass', freq: 240, gain: 0.34, sweep: 0.7 });
      tone(ctx, dest, t + r(0.5), { freq: 3200, to: 900, dur: r(0.9), gain: 0.05, type: 'sine' });
      tone(ctx, dest, t + r(0.8), { freq: 2600, to: 700, dur: r(1.0), gain: 0.04, type: 'sine' });
      burst(ctx, dest, t + r(0.4), { dur: r(1.4), type: 'bandpass', freq: 700, q: 0.5, gain: 0.1, sweep: 1.2 });
      break;

    /* -------- the Silver Room's kitchen, and its dining room --------
     *
     * The extraction bed (`ambience.kitchen`) is the thing everybody shouts
     * over; these are the work happening under it. A kitchen reads as a
     * kitchen because of steel landing on steel at irregular intervals, not
     * because of a louder hum -- so these are all one-shots, rationed and
     * positioned by the scene, in the way `kitchen.pan` and `kitchen.plate`
     * already were and were the only two of.
     */
    case 'kitchen.clatter':
      // A stack of pans finding its own level. Three knocks, none of them even.
      burst(ctx, dest, t, { dur: r(0.05), type: 'bandpass', freq: 2600, q: 3.4, gain: 0.24, sweep: 0.5 });
      tone(ctx, dest, t + r(0.004), { freq: 640, to: 300, dur: r(0.13), gain: 0.13, type: 'triangle' });
      burst(ctx, dest, t + r(0.07), { dur: r(0.06), type: 'bandpass', freq: 1850, q: 2.6, gain: 0.17, sweep: 0.56 });
      burst(ctx, dest, t + r(0.16), { dur: r(0.09), type: 'bandpass', freq: 3300, q: 2.0, gain: 0.11, sweep: 0.62 });
      tone(ctx, dest, t + r(0.17), { freq: 880, to: 410, dur: r(0.18), gain: 0.07, type: 'sine' });
      break;
    case 'kitchen.chop':
      // A knife through something soft onto a board: the board is the sound.
      burst(ctx, dest, t, { dur: r(0.018), type: 'highpass', freq: 3200, q: 0.8, gain: 0.14 });
      tone(ctx, dest, t + r(0.004), { freq: 196, to: 92, dur: r(0.09), gain: 0.20, type: 'triangle' });
      burst(ctx, dest, t + r(0.01), { dur: r(0.07), type: 'lowpass', freq: 700, q: 0.9, gain: 0.12, sweep: 0.45 });
      break;
    case 'kitchen.oven':
      // A heavy door on a sprung hinge, and the latch after it.
      burst(ctx, dest, t, { dur: r(0.12), type: 'bandpass', freq: 420, q: 1.1, gain: 0.20, sweep: 0.4 });
      tone(ctx, dest, t + r(0.02), { freq: 128, to: 58, dur: r(0.24), gain: 0.26, type: 'triangle' });
      burst(ctx, dest, t + r(0.20), { dur: r(0.04), type: 'bandpass', freq: 2400, q: 4.0, gain: 0.13 });
      break;
    case 'kitchen.ticket':
      // The printer at the pass. Two chirps and a tear, which is the whole job.
      tone(ctx, dest, t, { freq: 1580, dur: r(0.035), gain: 0.10, type: 'square' });
      tone(ctx, dest, t + r(0.06), { freq: 1860, dur: r(0.035), gain: 0.09, type: 'square' });
      burst(ctx, dest, t + r(0.13), { dur: r(0.11), type: 'highpass', freq: 3600, q: 0.7, gain: 0.10, sweep: 0.7 });
      break;
    case 'kitchen.sizzle':
      // Food hitting hot fat: a hard wet onset that settles into a fast simmer.
      burst(ctx, dest, t, { dur: r(0.10), type: 'highpass', freq: 4200, q: 0.7, gain: 0.20, sweep: 0.5 });
      burst(ctx, dest, t + r(0.04), { dur: r(0.9), type: 'bandpass', freq: 5200, q: 0.6, gain: 0.12, sweep: 0.35 });
      burst(ctx, dest, t + r(0.30), { dur: r(0.5), type: 'bandpass', freq: 3400, q: 0.9, gain: 0.06, sweep: 0.5 });
      break;
    case 'kitchen.steam':
      // Steam off a lid: a hiss that rises, holds a beat, and dies.
      burst(ctx, dest, t, { dur: r(0.75), type: 'bandpass', freq: 6200, q: 0.7, gain: 0.11, sweep: 1.4 });
      burst(ctx, dest, t + r(0.05), { dur: r(0.5), type: 'highpass', freq: 7800, q: 0.6, gain: 0.06, sweep: 0.8 });
      tone(ctx, dest, t + r(0.02), { freq: 2900, to: 2200, dur: r(0.10), gain: 0.02, type: 'sine' });
      break;
    case 'kitchen.chop.fast':
      // A prep run: eight quick chops, the rhythm tightening slightly.
      for (let i = 0; i < 8; i++) {
        const at = t + i * (0.135 - i * 0.004);
        burst(ctx, dest, at, { dur: r(0.014), type: 'highpass', freq: 3200, q: 0.8, gain: 0.09 });
        tone(ctx, dest, at + 0.003, { freq: 190 + (i % 3) * 14, to: 90, dur: r(0.07), gain: 0.13, type: 'triangle' });
      }
      break;
    case 'kitchen.glasses':
      // A rack of glasses at a brisk walk: dense small chimes, no casualties.
      for (let i = 0; i < 9; i++) {
        const at = t + i * 0.075 + (((i * 37) % 10) / 10) * 0.03;
        tone(ctx, dest, at, { freq: 2100 + ((i * 53) % 7) * 190, dur: r(0.06), gain: 0.035, type: 'sine' });
      }
      burst(ctx, dest, t, { dur: r(0.7), type: 'bandpass', freq: 2900, q: 1.4, gain: 0.05, sweep: 0.4 });
      break;

    /* The floor. Under the band and under the conversation, so every one of
     * these is quiet and short: the note was "not overbearing", and a dining
     * room that competes with the table it is dressing is worse than a silent
     * one. */
    case 'dining.cutlery':
      // Fork set down on a plate, not dropped on one.
      burst(ctx, dest, t, { dur: r(0.03), type: 'bandpass', freq: 3400, q: 3.8, gain: 0.10, sweep: 0.6 });
      tone(ctx, dest, t + r(0.006), { freq: 1240, to: 760, dur: r(0.10), gain: 0.055, type: 'sine' });
      break;
    case 'dining.glass.clink':
      // Two glasses meeting, briefly, somewhere else in the room.
      tone(ctx, dest, t, { freq: 2350, dur: r(0.20), gain: 0.075, type: 'sine' });
      tone(ctx, dest, t + r(0.008), { freq: 3520, dur: r(0.13), gain: 0.038, type: 'sine' });
      burst(ctx, dest, t, { dur: r(0.02), type: 'highpass', freq: 5200, q: 0.8, gain: 0.05 });
      break;
    case 'dining.chair':
      // A chair taking somebody's weight on carpet. Mostly cloth and frame.
      burst(ctx, dest, t, { dur: r(0.26), type: 'lowpass', freq: 340, q: 0.7, gain: 0.09, sweep: 0.55 });
      tone(ctx, dest, t + r(0.03), { freq: 92, to: 62, dur: r(0.20), gain: 0.07, type: 'triangle' });
      break;

    /* Somebody asleep in the next room, from the doorway. Deliberately at the
     * bottom of the mix: the note asked for "a low key snore", which is a
     * person breathing and not a comedy sound effect. One slow intake, one
     * slower release, both nose rather than throat. */
    case 'margo.snore':
      burst(ctx, dest, t, { dur: r(0.62), type: 'bandpass', freq: 176, q: 1.6, gain: 0.085, sweep: 1.28 });
      tone(ctx, dest, t + r(0.05), { freq: 78, to: 96, dur: r(0.52), gain: 0.045, type: 'triangle' });
      burst(ctx, dest, t + r(0.86), { dur: r(0.74), type: 'lowpass', freq: 260, q: 0.8, gain: 0.05, sweep: 0.5 });
      break;

    default:
      // Unknown cue: a soft neutral tick rather than silence, which makes
      // missing wiring obvious during development without being ugly.
      tone(ctx, dest, t, { freq: 800, dur: 0.03, gain: 0.06, type: 'sine' });
  }
}

/**
 * Looping fallback beds. Returns a node-shaped façade with `stop()`.
 *
 * It also carries `voices`: every oscillator frequency and every filter corner
 * this bed was authored with, paired with the value it was authored AT. That
 * list is the only way `AudioEngine.setLoopRate` can re-pitch a bed that has
 * no recording behind it — a synth loop has no `playbackRate`, and a vehicle
 * engine that cannot change pitch is a volume knob pretending to be an engine.
 * Every bed gets the list; only the ones somebody calls `setLoopRate` on move.
 */
function synthLoop(engine, name, dest) {
  const ctx = engine.ctx;
  const nodes = [];
  const voices = [];

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
    voices.push({ kind: 'noise', param: f.frequency, base: freq });
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
    voices.push({ kind: 'osc', param: o.frequency, base: freq });
    return o;
  };

  switch (name) {
    case 'heist.ambience.safehouse':
    case 'heist.ambience.safehouse.prep':
      // Rebuilt prep room: warehouse air and fluorescent ballast, never the
      // washing-machine rhythm that made the old staging read as a laundromat.
      noise('lowpass', 460, 0.75, 0.055);
      osc('sine', 100, 0.020);
      osc('sine', 200.4, 0.008);
      noise('highpass', 5900, 2.4, 0.010);
      break;
    case 'heist.ambience.van':
      noise('lowpass', 680, 0.72, 0.085);
      noise('bandpass', 1450, 2.2, 0.020);
      osc('sawtooth', 46, 0.026);
      break;
    case 'heist.ambience.bank':
      noise('lowpass', 900, 0.5, 0.045);
      osc('sine', 48, 0.014);
      break;
    case 'heist.ambience.street':
      noise('bandpass', 1050, 0.6, 0.09);
      noise('lowpass', 240, 0.8, 0.07);
      break;
    case 'heist.ambience.garage':
      noise('lowpass', 580, 1.2, 0.06);
      osc('sine', 72, 0.025);
      break;
    case 'heist.ambience.driving':
      noise('lowpass', 720, 0.8, 0.1);
      osc('sawtooth', 55, 0.025);
      break;
    case 'heist.bank.alarm':
      // Two close alarm oscillators beat against each other without an
      // envelope seam; the recorded replacement can provide the real room.
      osc('square', 760, 0.022);
      osc('square', 970, 0.018);
      noise('highpass', 4200, 1.4, 0.010);
      break;
    case 'heist.vehicle.engine.load':
      osc('sawtooth', 58, 0.042);
      osc('sine', 116, 0.024);
      noise('lowpass', 330, 0.9, 0.075);
      break;
    case 'heist.vehicle.tires.road':
      noise('lowpass', 520, 0.72, 0.080);
      noise('bandpass', 1350, 0.85, 0.055);
      noise('highpass', 3400, 0.75, 0.018);
      break;
    case 'heist.police.sirens': {
      const a = osc('sine', 710, 0.025);
      const b = osc('sine', 920, 0.018);
      a.frequency.linearRampToValueAtTime(920, ctx.currentTime + 1.4);
      b.frequency.linearRampToValueAtTime(710, ctx.currentTime + 1.4);
      break;
    }
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
    case 'shower.run':
      noise('bandpass', 3200, 0.7, 0.30);
      noise('bandpass', 1100, 1.2, 0.20);
      noise('lowpass', 300, 0.7, 0.12);
      break;
    case 'pan.sizzle':
      // Fat in a hot pan: bright, sparse, no low end at all.
      noise('highpass', 5200, 0.6, 0.20);
      noise('bandpass', 2600, 2.0, 0.10);
      break;
    case 'pee.stream':
      // Splashing water: bright filtered noise with a low burble under it.
      noise('bandpass', 2600, 0.8, 0.34);
      noise('bandpass', 900, 1.4, 0.20);
      noise('lowpass', 260, 0.7, 0.14);
      break;
    /* -------- the mansion's third floor -------- */
    case 'mansion.suite.tone':
      /* A big warm room with the air on: almost nothing, and deliberately
       * quieter than the cellar's. Two sines a semitone apart beat slowly
       * against each other, which is what plant in a duct actually does. */
      noise('lowpass', 300, 0.7, 0.030);
      osc('sine', 84, 0.014);
      osc('sine', 84.7, 0.010);
      noise('highpass', 6400, 2.0, 0.006);
      break;
    /* -------- Mark's estate (src/cartel-palace/acoustics.js) -------- */
    case 'ambience.palace.interior':
      /* The service wing's own quiet: plant hum through stucco and a
       * pressurised stillness. The `mansion.suite.tone` recipe a floor
       * lower and a shade colder — the beating pair sits at duct pitch and
       * the hiss corner is higher, because these halls are stone and tile,
       * not carpet. Stands in until the recording lands (see the manifest
       * brief); volume automation lives entirely in the room mix. */
      noise('lowpass', 260, 0.7, 0.034);
      osc('sine', 92, 0.013);
      osc('sine', 92.8, 0.009);
      noise('highpass', 7200, 2.0, 0.005);
      break;
    case 'ambience.palace.dining':
      /* The dining room reads as an ARRIVAL, so its tone is a different
       * sound from the halls, not a louder one: lower and warmer — the
       * beating pair drops nearly a fifth — with a narrow mid band for the
       * long room's own presence and no hiss at all. Candles, not ducts. */
      noise('lowpass', 180, 0.8, 0.030);
      osc('sine', 62, 0.015);
      osc('sine', 62.4, 0.011);
      noise('bandpass', 420, 2.4, 0.010);
      break;
    case 'mansion.suite.hottub': {
      /* BUBBLING = FILTERED NOISE, and the LFO is what makes it bubbles
       * rather than a hiss. A hot tub is a broad wet churn with a bright
       * surface on top of it, and the surface SWELLS -- jets in a bowl beat
       * against each other at well under a hertz. So: three noise bands for
       * the body, and a slow sine on the brightest one's gain. */
      noise('lowpass', 240, 0.8, 0.11);
      noise('bandpass', 780, 1.1, 0.075);
      const surface = noise('bandpass', 2400, 0.7, 0.05);
      const swell = ctx.createOscillator();
      swell.type = 'sine';
      swell.frequency.value = 0.37;
      const depth = ctx.createGain();
      depth.gain.value = 0.028;
      swell.connect(depth);
      depth.connect(surface.g.gain);
      swell.start();
      nodes.push(swell);
      break;
    }
    case 'radio.cut':
      // A transmission stepping on itself: full-level broadband hiss with no
      // attack, so it lands on the same frame the music stops.
      noise('highpass', 1200, 0.55, 0.55);
      noise('bandpass', 3200, 0.4, 0.3);
      break;
    case 'pee.miss':
      // Same stream, hard floor: keep the bright splatter, drop the burble.
      // Tile has no volume of water to resonate in, which is the whole tell.
      noise('bandpass', 3400, 0.9, 0.36);
      noise('highpass', 1800, 1.1, 0.18);
      break;
    /* -------- the Bada Bing --------
     * Four beds, crossfaded by where the player is standing. The club track is
     * a bassline rather than a noise wash, because a strip club with no beat
     * in it is just a warm room.
     */
    case 'ambience.rain': {
      noise('bandpass', 1400, 0.5, 0.26);
      noise('highpass', 4200, 0.5, 0.10);
      noise('lowpass', 260, 0.7, 0.16);
      break;
    }
    case 'ambience.club': {
      /* Four-to-the-floor at 104bpm. The kick is a sine through its own gain,
       * pulsed by a sawtooth LFO at the beat rate -- a falling ramp is exactly
       * the envelope a kick drum has, so one oscillator does the whole job. */
      const kick = ctx.createOscillator();
      kick.type = 'sine';
      kick.frequency.value = 52;
      const kickGain = ctx.createGain();
      kickGain.gain.value = 0;
      kick.connect(kickGain);
      kickGain.connect(dest);
      const lfo = ctx.createOscillator();
      lfo.type = 'sawtooth';
      lfo.frequency.value = 104 / 60;
      const depth = ctx.createGain();
      depth.gain.value = -0.20;          // inverted: the ramp falls after the hit
      lfo.connect(depth);
      depth.connect(kickGain.gain);
      kick.start();
      lfo.start();
      nodes.push(kick, lfo);
      // A bassline under it, and the hats the room has mostly eaten
      osc('triangle', 78, 0.055);
      noise('bandpass', 2600, 0.8, 0.035);
      break;
    }
    /* Rain, heard from inside a building with a band playing in it.
     *
     * `ambience.rain` is rain you are STANDING in: a bandpass hiss with a
     * highpass layer on top for the spatter, which is right on a pavement
     * and is unlistenable through a wall. Turned down far enough to be
     * plausible indoors it stops being rain and reads as tape hiss -- which
     * is exactly what it read as at the Bing, where the owner heard it as
     * static and could not place it.
     *
     * Weather through brick has no top end at all. This is the low half of
     * the same storm and nothing above it, so it can sit up at an audible
     * level indoors and still be rain. A recorded version is authored in the
     * manifest under this name; until it lands, this is the bed.
     */
    case 'ambience.bing.rain.muffled': {
      noise('lowpass', 190, 0.7, 0.30);
      noise('bandpass', 380, 0.4, 0.09);
      break;
    }
    case 'ambience.crowd': {
      // Two hundred people talking, none of them audibly.
      noise('bandpass', 520, 1.1, 0.16);
      noise('bandpass', 1500, 0.9, 0.07);
      noise('lowpass', 200, 0.8, 0.06);
      break;
    }
    case 'neon.buzz':
      osc('sawtooth', 120, 0.012);
      noise('bandpass', 5600, 6, 0.02);
      break;
    case 'fluoro.hum':
      osc('sine', 100, 0.03);
      osc('sine', 200, 0.012);
      noise('highpass', 6200, 2, 0.012);
      break;
    case 'engine.idle':
    case 'boat.engine.idle':
      osc('sawtooth', 34, 0.06);
      osc('sine', 68, 0.03);
      noise('lowpass', 220, 0.8, 0.10);
      break;
    case 'boat.engine.underway':
      osc('sawtooth', 43, 0.072);
      osc('sine', 86, 0.034);
      noise('lowpass', 320, 0.82, 0.12);
      break;
    case 'boat.hull.wake':
      noise('lowpass', 230, 0.72, 0.11);
      noise('bandpass', 860, 0.68, 0.13);
      noise('highpass', 2700, 0.75, 0.035);
      break;

    /* -------- the Silver Room --------
     * Five zone beds, crossfaded by which room the player is standing in, and
     * the band in separate stems so the mix can duck the melody under a line
     * of dialogue without flattening the room the line is being said in.
     */
    case 'ambience.alley':
      // Wet, wide, and a long way from anything: traffic two streets over.
      noise('lowpass', 300, 0.6, 0.30);
      noise('bandpass', 900, 0.5, 0.06);
      break;
    case 'ambience.cellar':
      // A room with no daylight in it: plant hum, a compressor, and pipes.
      osc('sine', 49, 0.12);
      osc('sine', 98.4, 0.05);
      noise('lowpass', 160, 0.9, 0.20);
      noise('bandpass', 700, 3.5, 0.025);
      break;
    case 'ambience.kitchen':
      /* Extraction is the loudest thing in a working kitchen and it is what
       * everybody has to shout over, so it is the bed rather than the clatter.
       * The clatter is one-shots on top, which is also what it is in life. */
      noise('lowpass', 480, 0.7, 0.34);
      noise('bandpass', 2100, 1.2, 0.07);
      noise('highpass', 5600, 0.7, 0.05);
      break;
    case 'ambience.diners':
      // Two hundred people over dinner: lower and slower than a club crowd,
      // with cutlery on top of it.
      noise('bandpass', 430, 1.2, 0.17);
      noise('bandpass', 1250, 1.0, 0.06);
      noise('highpass', 6800, 1.4, 0.028);
      noise('lowpass', 190, 0.9, 0.05);
      break;

    /* The Midnight Pines. Four stems, started together and mixed separately. */
    case 'band.rhythm': {
      /* Brushes and an upright: 118bpm, swung by leaving the offbeat late.
       * The bass walks four notes because a walking bass that does not walk is
       * just a drone with ambitions. */
      const WALK = [55, 65.4, 73.4, 61.7];
      const bass = ctx.createOscillator();
      bass.type = 'triangle';
      bass.frequency.value = WALK[0];
      const bassGain = ctx.createGain();
      bassGain.gain.value = 0.09;
      bass.connect(bassGain);
      bassGain.connect(dest);
      bass.start();
      nodes.push(bass);
      const beat = 60 / 118;
      let step = 0;
      const walker = setInterval(() => {
        step = (step + 1) % WALK.length;
        try {
          bass.frequency.setTargetAtTime(WALK[step], ctx.currentTime, 0.02);
        } catch { /* context closed */ }
      }, beat * 1000);
      nodes.push({ stop: () => clearInterval(walker) });
      // Brushes: a wash pulsed on the beat rather than a hit
      const brush = noise('highpass', 4200, 0.6, 0);
      const swish = ctx.createOscillator();
      swish.type = 'triangle';
      swish.frequency.value = 1 / beat;
      const swishDepth = ctx.createGain();
      swishDepth.gain.value = 0.035;
      swish.connect(swishDepth);
      swishDepth.connect(brush.g.gain);
      brush.g.gain.value = 0.04;
      swish.start();
      nodes.push(swish);
      break;
    }
    case 'band.horns': {
      /* Four horns is four sawtooths a chord apart, detuned enough to beat
       * against each other. Detuning is most of what makes a section sound
       * like people rather than like an organ. */
      for (const [f, g] of [[233, 0.045], [293.7, 0.038], [349.2, 0.034], [466.2, 0.022]]) {
        osc('sawtooth', f * (1 + (Math.random() - 0.5) * 0.006), g);
      }
      noise('bandpass', 1800, 0.9, 0.02);
      break;
    }
    case 'band.piano':
      osc('triangle', 130.8, 0.03);
      osc('triangle', 196, 0.024);
      osc('sine', 392, 0.012);
      break;
    case 'band.vocal':
      // A voice on a microphone in a warm room, with nothing intelligible in
      // it. The subtitles do the words, the same way the radio's do.
      noise('bandpass', 520, 2.2, 0.16);
      noise('bandpass', 1400, 3.0, 0.07);
      break;
    case 'applause':
      noise('bandpass', 1900, 0.5, 0.30);
      noise('highpass', 4600, 0.4, 0.16);
      break;

    /* Two beds that sit UNDER ones that already exist rather than replacing
     * them. `ambience.kitchen` is the extraction fan and nothing else, and
     * `ambience.diners` is the wash of two hundred people; what neither of
     * them had was the thing being done in the room. */
    case 'ambience.kitchen.line':
      /* Gas under a row of pans: a burner's roar is low broadband, and the
       * simmer on top of it is a narrow band of bubbling well above it.
       * Slowly detuned against itself so the two never phase-lock into a
       * single held note, which is what makes a bed sound like a synthesiser. */
      noise('lowpass', 210, 0.9, 0.16);
      noise('bandpass', 640, 1.4, 0.055);
      noise('bandpass', 3100, 2.4, 0.030);
      noise('highpass', 6400, 0.9, 0.018);
      osc('sine', 61.5, 0.020);
      break;
    case 'ambience.diners.chatter':
      /* Conversation heard through other conversation. The band is 200-3000Hz
       * and the date is sitting in it, so this is deliberately narrower and
       * lower than `ambience.diners` -- it occupies the vowel range and leaves
       * the consonants, which is exactly what a room of talking sounds like
       * from four tables away and is why nothing in it is intelligible. */
      noise('bandpass', 300, 1.8, 0.105);
      noise('bandpass', 720, 2.2, 0.052);
      noise('bandpass', 1650, 1.6, 0.020);
      break;

    default:
      noise('lowpass', 400, 0.5, 0.12);
  }

  return {
    voices,
    stop() {
      for (const n of nodes) {
        try { n.stop(); } catch { /* already stopped */ }
      }
    },
  };
}
