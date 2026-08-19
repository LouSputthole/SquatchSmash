/**
 * The Enola Squatch's sound.
 *
 * The scene shipped with no audio engine at all — `main.js` had a
 * `visibilitychange` handler whose whole body was a comment saying there was
 * nothing to mute. That is why none of the eighty-seven authored lines in
 * `dialogue/script.js` could ever have been heard even after they are
 * recorded, and why the owner's "I also want the drop of the bomb to have the
 * pheeeeeew (Classic falling sound effect)" had nowhere to go.
 *
 * This wires the mission to the same stack the Beef Run uses:
 *
 *   `EnolaAudioEngine` — `src/core/audio.js`'s AudioEngine, narrowed to decode
 *     only the recordings THIS page can use, exactly the way
 *     `BeefAudioEngine` narrows it for the airstrip. It accepts
 *     `vo.enolasquatch.*` (the cue namespace `dialogue/script.js`'s `cueOf`
 *     mints and `tools/enolasquatch-vo.mjs` writes into the manifest), so the
 *     moment those takes are recorded they play with no further code change.
 *
 *   `EnolaMissionAudio extends MissionAudio` — engine loops, airframe wind,
 *     the stall horn, the headset muffle and the per-line VO lookup all come
 *     from the Beef Run's own class unmodified. Two things are added:
 *
 *       fallingWhistle()  the falling-bomb whistle
 *       detonation()      the blast
 *
 * BOTH OF THOSE WERE SYNTHESISED, and both of them still are whenever the
 * recordings are not on the machine. On 2026-08-06 the owner delivered four
 * clips — one falling bomb and three separate blasts — and asked for the three
 * blasts to go off together: "the falling sound should line up with the bomb
 * fallling then I want the boom on all three of those to hit at the same time
 * and play at the same time then let the full clips play". So the two methods
 * above are now dispatchers: sample if the sample is decoded, synth if it is
 * not. Nothing procedural was deleted — a page that has not loaded the mp3s
 * (the bundle, a cold cache, a failed decode) still gets the whole event.
 *
 * See BLAST_LAYERS below for where the boom is in each clip and why that
 * number has to exist at all.
 */
import { AudioEngine } from '../core/audio.js';
import { isBundled, loadJson } from '../core/assets.js';
import { loadOnceRetriable } from '../core/load-queue.js';
import { MissionAudio } from '../beefrun/audio.js';
import { clamp, lerp } from '../beefrun/util.js';

const SFX_DIR = 'assets/sfx/';

/** One-off recordings shared with the apartment that this page calls by name. */
export const ENOLA_SHARED_CUES = new Set([
  'switch.click',
  'ui.select',
  'frame.adjust',
  'door.knob',
  'can.set',
  'gun.dry',
  'gun.shot',
  'gun.impact',
  'closet.slide',
  'plane.crash.explosion',
  'can.crush',
]);

/** Recorded cues the Enola Squatch page is allowed to decode. */
export function isEnolaPreloadCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  return !!name && (
    name.startsWith('vo.enolasquatch.')
    || name.startsWith('enolasquatch.')
    /* `enola.` — the bomb bank. NOT covered by `enolasquatch.` above:
     * 'enola.blast.a'.startsWith('enolasquatch.') is false, so the owner's
     * four delivered clips were in the manifest, on disk, in the index, and
     * filtered out of the decode list by one dot. Nothing would have said so;
     * `detonation()` would simply have gone on synthesising. */
    || name.startsWith('enola.')
    || name.startsWith('footstep.')
    || name.startsWith('ambience.')
    || ENOLA_SHARED_CUES.has(name)
  );
}

/* ------------------------------------------------------------------ */
/* The owner's bomb recordings                                         */
/* ------------------------------------------------------------------ */

/** The Fat Squatch on its way down. 4.5 s; the fall is eight or nine. */
export const FALLING_CUE = 'enola.bomb.falling';

/**
 * The three blast layers, and WHERE THE BOOM IS IN EACH ONE.
 *
 * Owner: "I want the boom on all three of those to hit at the same time and
 * play at the same time." Those are two different requirements and only the
 * second is free. Starting three files at the same instant does NOT make
 * their transients coincide, because each clip carries its own lead-in:
 *
 *   enola.blast.a  44.00 s   silent to 0.3 s, then a rising rumble, BOOM at 1.68 s
 *   enola.blast.b   8.06 s   BOOM at 0.15 s — it opens on the bang
 *   enola.blast.c  22.31 s   digital silence to 0.9 s, BOOM at 1.03 s
 *
 * `onset` is measured, not guessed: each clip decoded through an
 * `OfflineAudioContext`, summed to mono, 10 ms RMS windows, and the onset is
 * the first window within 6 dB of the clip's peak window. Cross-checked at
 * 3 dB and 10 dB (which agree to a window) and against the loudest window,
 * which is much later in every clip and is the body of the roar rather than
 * the transient. Measured 2026-08-06 by `tools/verify-enola-bomb-audio.mjs`,
 * which re-measures on every run and fails if these numbers have drifted from
 * the files — so a re-delivered clip cannot silently smear the boom.
 *
 * Alignment is done by SKIPPING INTO each buffer (`start(when, offset)`)
 * rather than by delaying the ones that bang early. A delay would push the
 * whole event 1.68 s later than the moment the mission computed for it, which
 * is the moment the pressure front reaches the aeroplane — the bang has to
 * arrive with the buffet, not a second and a half after it. What is skipped
 * is 1.53 s of a −35 dB rumble in `a` and 0.88 s of literal silence in `c`.
 */
export const BLAST_LAYERS = Object.freeze([
  Object.freeze({ name: 'enola.blast.a', onset: 1.68, level: 1.00 }),
  Object.freeze({ name: 'enola.blast.b', onset: 0.15, level: 0.72 }),
  Object.freeze({ name: 'enola.blast.c', onset: 1.03, level: 0.85 }),
]);

/**
 * How much air is kept in front of the transient, in seconds.
 *
 * The alignment point is `BOOM_LEAD` after the three sources start, so the
 * earliest-banging clip (`b`, at 0.15 s) plays from its first sample and
 * nothing has to be delayed. Raising this keeps more of `a`'s lead-in rumble
 * at the cost of delaying the bang by the same amount.
 */
export const BOOM_LEAD = 0.15;

/** A bed of wind that keeps going, and the city's sirens. Neither is recorded
 *  yet; both have manifest briefs and both are silent until they are. */
export const WIND_CUE = 'enola.wind.high';
export const SIREN_CUE = 'enola.siren.airraid';
/** Beyond this the sirens are not in the mix at all. */
export const SIREN_RANGE = 9000;

/* ------------------------------------------------------------------ */
/* Residency banks                                                     */
/* ------------------------------------------------------------------ */

/**
 * Which residency bank a cue this page may decode belongs to.
 *
 * The mission's cue names carry their beat in the third segment —
 * `vo.enolasquatch.<who>.<beat-with-dashes>-<n>.<take>` — so membership is
 * the beat's top-level group, not a hand-kept list per line. The split
 * follows the night's own shape:
 *
 *   start      the apron: the call, the hangar reveal, the whole walkaround
 *              and boarding (call/hangar/preflight/nightfall/taxi, plus the
 *              walkaround idle barks), and every shared effect the walk can
 *              trigger — footsteps, ambience, the switch/door/can one-offs.
 *   nextBeat   the flight out: takeoff through the run-in — climb, cruise,
 *              nav, detection, flak, fighters, autopilot and the tail gun,
 *              their bark pools, and the flight's own effect beds (the wind
 *              bed, the rear gun, the interceptor screams).
 *   background the far end of the night: the drop, the blast (the owner's
 *              three delivered clips are big files nobody needs on the
 *              apron), the escape, emergencies, landing and Lou.
 *
 * A group this table has never heard of lands in `background` — decoded
 * late rather than dropped, and the dialogue dispatch gate in main.js still
 * holds any line of it until that bank settles.
 */
const ENOLA_START_GROUPS = new Set(['call', 'hangar', 'preflight', 'nightfall', 'taxi']);
const ENOLA_FLIGHT_GROUPS = new Set([
  'takeoff', 'climb', 'cruise', 'nav', 'detect', 'defense', 'fighters', 'auto', 'gun',
]);
const ENOLA_START_BARK_POOLS = new Set(['walkaroundIdle']);
const ENOLA_FLIGHT_EFFECTS = new Set([
  'enolasquatch.gun.rear', 'enolasquatch.gun.rear.cabin',
  'enola.wind.high', 'enola.interceptor.breakup', 'enola.interceptor.scream',
]);

export function enolaBankOfCue(cue) {
  const raw = typeof cue === 'string' ? cue : cue?.name;
  if (!raw) return 'background';
  const name = raw.startsWith('vo.') ? raw.slice(3) : raw;
  if (ENOLA_FLIGHT_EFFECTS.has(name)) return 'nextBeat';
  if (name.startsWith('footstep.') || name.startsWith('ambience.') || ENOLA_SHARED_CUES.has(name)) {
    return 'start';
  }
  if (name.startsWith('enolasquatch.')) {
    /* vo.enolasquatch.<who>.<beat>-<n>: the beat's top-level group is the
     * text before the first dash; a bark's pool is the segment after it. */
    const segment = name.split('.')[2] ?? '';
    const group = segment.split('-')[0];
    if (group === 'bark') {
      return ENOLA_START_BARK_POOLS.has(segment.split('-')[1]) ? 'start' : 'nextBeat';
    }
    if (ENOLA_START_GROUPS.has(group)) return 'start';
    if (ENOLA_FLIGHT_GROUPS.has(group)) return 'nextBeat';
    return 'background';
  }
  /* enola.siren.airraid, enola.bomb.falling, enola.blast.* — the far end. */
  return 'background';
}

export class EnolaAudioEngine extends AudioEngine {
  /**
   * The START bank only — the apron. `_manifestLoadPromise` keeps its
   * loadOnceRetriable meaning (a transient failure may be retried, a
   * success is immutable); the later banks come through `loadBank()` below,
   * kicked by main.js the moment this settles and awaited by the dialogue
   * dispatch gate at each beat boundary.
   */
  loadManifest() {
    return loadOnceRetriable(this, '_manifestLoadPromise', () => this._loadEnolaBankOnce('start'));
  }

  /** Decode one later bank, once, after the start bank has had the pipe. */
  loadBank(bank) {
    if (bank === 'start') return this.loadManifest();
    if (!this._enolaBankLoads) this._enolaBankLoads = new Map();
    if (!this._enolaBankLoads.has(bank)) {
      const task = this.loadManifest()
        .catch(() => null)
        .then(() => this._loadEnolaBankOnce(bank))
        .catch((error) => {
          /* A transient failure may be retried, same as loadManifest. */
          this._enolaBankLoads.delete(bank);
          throw error;
        });
      this._enolaBankLoads.set(bank, task);
    }
    return this._enolaBankLoads.get(bank);
  }

  async _loadEnolaBankOnce(bank) {
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
    const wanted = availableCues.filter((cue) => isEnolaPreloadCue(cue)
      && enolaBankOfCue(cue.name) === bank
      && !this.buffers.has(cue.name));
    /* Accumulated across the banks, so `selected` still reads as "how much
     * of the manifest this page asked for" once everything has settled —
     * the number tools/verify-enolasquatch.mjs holds against the scope. */
    this.preloadStats = {
      manifestTotal: cues.length,
      selected: (this.preloadStats?.selected ?? 0) + wanted.length,
    };
    await this._loadWanted(wanted);
    return { total: wanted.length, loaded: this.loadedCount };
  }
}

export class EnolaMissionAudio extends MissionAudio {
  constructor(engine) {
    super(engine);
    this._whistle = null;
    /* Live handles on the three blast layers, and a plain-numbers record of
     * how they were scheduled. The record is diagnostics in the same spirit as
     * `AudioEngine.playbacks`: a browser cannot be asked whether the booms
     * landed together, but it can be asked what time each source was told to
     * start, how far into its buffer it started, and when it ended. */
    this._blast = null;
    this.lastBlast = null;
    this.lastFall = null;
    this._wind = false;
    this._windLevel = -1;
    this._siren = false;
  }

  /**
   * Play one line of dialogue and say how long it runs.
   *
   * THIS METHOD DID NOT EXIST, and eighty-seven recorded takes were
   * unreachable because of it. `DialogueSystem.next()` calls
   * `this.audio?.line(line)` and uses the answer as the subtitle hold. The
   * optional chain meant the missing method was not an error: it returned
   * `undefined`, the hold fell back to the authored `line.hold`, the subtitle
   * appeared exactly as designed, and the mission ran mute over a folder of
   * finished audio. The comment two lines below the call even says "a cue with
   * no recording simply does not play audio, and the subtitle still reads" --
   * which described the symptom perfectly while the cause was that nothing
   * ever tried to play anything.
   *
   * Same shape as the Beef Run's, which is what `DialogueSystem`'s own
   * docstring points at: find the bank, start it, and return its real length
   * so the subtitle holds for as long as the man is actually talking rather
   * than for a number somebody guessed while writing the line.
   *
   * @returns {number} seconds of recording started, or 0 when there is none
   */
  line(line) {
    if (!this.engine || !line?.cue) return 0;
    /* A new subtitle owns the intercom even when this particular take is
     * still missing -- otherwise the previous line keeps talking underneath
     * the new one. */
    this.engine._vo?.stop?.();
    this.engine._vo = null;
    const prefix = `vo.${line.cue}.`;
    const duration = Math.max(0, ...[...this.engine.buffers.entries()]
      .filter(([name]) => name.startsWith(prefix))
      .flatMap(([, bank]) => bank.map((buffer) => buffer.duration || 0)));
    /* Everyone on this aeroplane is on the intercom except the man beside
     * you, and the headset ducks the airframe rather than the voice. */
    const started = this.engine.say(line.cue, { chance: 1, volume: 0.95 });
    /* The take that just started, for the speaker's mouth -- see
     * src/core/mouth.js. `say()` is the engine's one-voice-at-a-time channel,
     * so this is the line being spoken and not a list. */
    this.lastTake = started
      ? { audio: this.engine, source: this.engine.spokenSource() }
      : null;
    return started ? duration : 0;
  }

  /** The take of the line most recently started by `line()`, or null. */
  voiceTake() {
    return this.lastTake ?? null;
  }

  /* ---------------------------------------------------------------- */
  /* The pheeeeeew                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * The Fat Squatch on its way down.
   *
   * TWO owner requirements, and both hold at once:
   *
   *   "The falling sound should line up with the bomb fallling" (2026-08-06)
   *   "The Pheeeeeww sound effect needs to play right away when you drop the
   *    bomb. It's a few [seconds] delayed." (2026-08-18)
   *
   * The recording is 4.5 s and the fall the mission computes is eight or
   * nine. The first cut of this scheduled the clip to END on the impact,
   * which meant its START sat four seconds after the release — the delay the
   * second note is about. So the sampled path now behaves exactly like the
   * synthesised one always has: it starts ON THE RELEASE FRAME, and the
   * whole sweep is stretched across the real fall (`playbackRate = clip
   * length / fall time`) so its bottom still arrives with the bomb. See
   * `_sampledFall` for the rate bounds.
   *
   * Falls back to the synthesised sweep below when the recording is not
   * decoded — which is also the only version a bundled build has.
   *
   * @param {number} seconds ballistic time to the ground, from `updateRelease`
   */
  fallingWhistle(seconds = 8) {
    if (!this.ctx || !this.ready) return false;
    this.endFallingWhistle(0.02);
    return this._sampledFall(seconds) || this._syntheticWhistle(seconds);
  }

  /**
   * The delivered clip: audible from the first frame of the drop, bottoming
   * out on the impact. @returns {boolean} started
   */
  _sampledFall(seconds) {
    const ctx = this.ctx;
    const buffer = this.engine?.buffers?.get(FALLING_CUE)?.[0];
    if (!ctx || !buffer || !this.engine.busSfx) return false;
    const t = ctx.currentTime;
    const dur = buffer.duration;
    const fall = Math.max(0.5, seconds);
    /* Stretched over the fall so it starts NOW and still ends on the impact.
     * The bounds keep a degenerate fall from mangling the recording: 0.42 is
     * enough for any release the route actually flies (a 4.5 s clip covers a
     * fall of up to ~10.7 s), and 2.5 caps how far a checkpoint-on-the-deck
     * release can chipmunk it — beyond either bound the impact cut in
     * `endFallingWhistle` trims whatever no longer lines up. */
    const rate = clamp(dur / fall, 0.42, 2.5);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const out = ctx.createGain();
    out.gain.value = 0.9;
    src.connect(out).connect(this.engine.busSfx);
    src.start(t);
    this._whistle = { out, sources: [src], startedAt: t, sampled: true };
    this.lastFall = {
      sampled: true,
      cue: FALLING_CUE,
      plannedFall: fall,
      duration: dur,
      rate,
      startAt: t,
      endsAt: t + dur / rate,
      scheduledAt: t,
      cutAt: null,
      /* Filled in by `endFallingWhistle`: how much of the clip was still to
       * run when the bomb actually arrived. Zero is a clip that landed on the
       * impact; negative means it had already finished. This is the number the
       * browser check reads. */
      remainingAtCut: null,
    };
    return true;
  }

  /**
   * The classic falling whistle, SYNTHESISED — the fallback for a page that
   * has not decoded `enola.bomb.falling`, and the only version a bundled
   * build has. Started the instant the Fat Squatch leaves the mount and
   * stopped by `endFallingWhistle()` at impact.
   *
   * Three layers, because one swept sine is a theremin and not a bomb:
   *
   *   - the whistle itself: a sine sweeping down through about three octaves,
   *     with a small amount of exponential droop so it falls fastest at the
   *     end (which is what sells the last second),
   *   - a second sine a fifth above at a fifth of the level, detuned, so it
   *     has a body rather than being a test tone,
   *   - a band-passed noise bed tracking the same sweep, which is the air.
   *
   * A slow vibrato on the pair keeps it from sounding synthesised even though
   * it is entirely synthesised.
   *
   * @param {number} seconds how long the fall is expected to take. The sweep
   *   is scheduled to land at the bottom of its range at that moment; if the
   *   bomb arrives early `endFallingWhistle()` simply cuts it there, which is
   *   the right behaviour and not an error.
   */
  _syntheticWhistle(seconds = 8) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return false;
    const t = ctx.currentTime;
    const dur = clamp(seconds, 1.2, 20);
    const bus = this.engine.busSfx;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.24, t + 0.28);
    out.connect(bus);

    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.2;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = 14;
    vibrato.connect(vibratoGain);

    const tones = [];
    for (const [mult, level, type] of [[1, 1, 'sine'], [1.5, 0.2, 'sine'], [0.5, 0.16, 'triangle']]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      // Down through three octaves, fastest at the end.
      osc.frequency.setValueAtTime(1500 * mult, t);
      osc.frequency.exponentialRampToValueAtTime(620 * mult, t + dur * 0.45);
      osc.frequency.exponentialRampToValueAtTime(165 * mult, t + dur);
      vibratoGain.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(out);
      osc.start(t);
      tones.push(osc);
    }

    // The air around it: white noise through a band-pass riding the sweep.
    const noiseLen = Math.ceil(ctx.sampleRate * Math.min(dur + 0.5, 6));
    const buffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 3.4;
    band.frequency.setValueAtTime(1500, t);
    band.frequency.exponentialRampToValueAtTime(165, t + dur);
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.26;
    noise.connect(band).connect(noiseGain).connect(out);
    noise.start(t);

    vibrato.start(t);
    this._whistle = { out, sources: [...tones, noise, vibrato], startedAt: t, sampled: false };
    this.lastFall = { sampled: false, plannedFall: dur, startAt: t, endsAt: t + dur, cutAt: null, remainingAtCut: null };
    return true;
  }

  /** Cut the whistle — at impact, or when a checkpoint restart wipes the beat. */
  endFallingWhistle(fade = 0.06) {
    const w = this._whistle;
    if (!w) return;
    this._whistle = null;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.lastFall && this.lastFall.cutAt === null) {
      this.lastFall.cutAt = t;
      this.lastFall.remainingAtCut = this.lastFall.endsAt - t;
    }
    try {
      w.out.gain.cancelScheduledValues(t);
      w.out.gain.setValueAtTime(Math.max(w.out.gain.value, 0.0001), t);
      w.out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    } catch { /* a context that has gone away is not an error worth throwing */ }
    const stopAt = t + fade + 0.05;
    for (const node of w.sources) { try { node.stop(stopAt); } catch { /* already stopped, or never started */ } }
  }

  get whistling() { return !!this._whistle; }

  /* ---------------------------------------------------------------- */
  /* The blast                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * The Fat Squatch going off, as the aeroplane hears it.
   *
   * Three delivered recordings if they are decoded, the synthesised event
   * below if they are not. Fired by `MissionController.updateDetonation()` at
   * the moment the pressure front is nearly at the aeroplane, which is why
   * neither version may be delayed to suit itself.
   *
   * @param {number} scale 0..1.5 — how big. 1 is the Fat Squatch.
   * @returns {boolean}
   */
  detonation(scale = 1) {
    if (!this.ctx || !this.ready) return false;
    return this._sampledDetonation(scale) || this._syntheticDetonation(scale);
  }

  /**
   * The owner's three blasts, banging together.
   *
   * Each layer starts at the same instant and is skipped into by
   * `onset - BOOM_LEAD`, so every transient lands `BOOM_LEAD` after that
   * instant however different the three lead-ins are. See `BLAST_LAYERS`.
   *
   * NOTHING IS SCHEDULED TO STOP. Owner: "let the full clips play and well see
   * if we get the power we want." The longest is 44 s against a 30 s
   * `Detonation` timeline, and that mismatch is deliberate — the column is
   * still going up when the picture's own clock has run out, and the sound
   * outliving the set-piece is the reason it reads as enormous. The sources
   * are held on `this._blast` only so that a checkpoint restart can take the
   * previous attempt's explosion away; nothing else stops them.
   */
  _sampledDetonation(scale = 1) {
    const ctx = this.ctx;
    const engine = this.engine;
    if (!ctx || !engine?.busSfx) return false;
    const layers = BLAST_LAYERS
      .map((layer) => ({ ...layer, buffer: engine.buffers.get(layer.name)?.[0] ?? null }))
      .filter((layer) => !!layer.buffer);
    if (!layers.length) return false;

    /* The mission asks for 1.45 and these are finished recordings at full
     * scale, so `scale` shapes them gently rather than multiplying them: three
     * clips at 1.45 would be three clips into the limiter and a quieter,
     * flatter bang than one. */
    const k = clamp(scale, 0.2, 1.5);
    const level = lerp(0.55, 1, clamp((k - 0.2) / 1.3, 0, 1));
    const startAt = ctx.currentTime + 0.02;   // one buffer of scheduling slack
    const boomAt = startAt + BOOM_LEAD;

    this.stopBlast(0.25);
    const live = [];
    const record = [];
    for (const layer of layers) {
      const offset = Math.max(0, layer.onset - BOOM_LEAD);
      const src = ctx.createBufferSource();
      src.buffer = layer.buffer;
      const gain = ctx.createGain();
      gain.gain.value = layer.level * level;
      src.connect(gain).connect(engine.busSfx);
      const entry = {
        name: layer.name,
        onset: layer.onset,
        offset,
        startAt,
        boomAt,
        duration: layer.buffer.duration,
        endsAt: startAt + (layer.buffer.duration - offset),
        endedAt: null,
        naturalEnd: false,
      };
      src.onended = () => {
        entry.endedAt = ctx.currentTime;
        entry.naturalEnd = entry.endedAt >= entry.endsAt - 0.12;
      };
      src.start(startAt, offset);
      live.push({ ...entry, src, gain });
      record.push(entry);
    }
    this._blast = { layers: live, boomAt };
    this.lastBlast = { sampled: true, scale: k, startAt, boomAt, layers: record };
    return true;
  }

  /**
   * Take the blast away — only for a checkpoint restart, which un-does the
   * whole attempt. `MissionController.restoreCheckpoint()` already puts the
   * turbulence, the screen wash and the crater's camera shake back; a
   * forty-four-second explosion still roaring over the aeroplane on the way
   * back in to the target it has not dropped on yet belongs in that list.
   */
  stopBlast(fade = 0.4) {
    const b = this._blast;
    this._blast = null;
    const ctx = this.ctx;
    if (!b || !ctx) return false;
    const t = ctx.currentTime;
    for (const layer of b.layers) {
      try {
        layer.gain.gain.cancelScheduledValues(t);
        layer.gain.gain.setValueAtTime(Math.max(layer.gain.gain.value, 0.0001), t);
        layer.gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      } catch { /* a context that has gone away is not worth throwing over */ }
      try { layer.src.stop(t + fade + 0.05); } catch { /* already finished */ }
    }
    return true;
  }

  /** Whether the sampled blast is still running. */
  get blasting() { return !!this._blast; }

  /**
   * "I want the explosion to be absolutely earth shattering and massive."
   *
   * SYNTHESISED — the fallback, and what the page did before the recordings
   * arrived. Not `MissionAudio.explosion()` — that one is the Brushrunner hitting a
   * hillside, three short cues stacked, about a second long. This is a
   * different order of event and is built as one:
   *
   *   0.00  the crack: broadband noise through a lowpass that slams open and
   *         then closes over a second and a half
   *   0.00  the punch: a sine dropping 70 Hz -> 22 Hz, which is the part felt
   *         rather than heard
   *   0.28  the second front, quieter and duller — the sound reaching you off
   *         the ground rather than through the air
   *   0.00  a nine-second rumble tail on a slow filter sweep, which is what
   *         makes it read as enormous instead of merely loud
   *
   * @param {number} scale 0..1.5 — how big. 1 is the Fat Squatch.
   */
  _syntheticDetonation(scale = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return false;
    const bus = this.engine.busSfx;
    const t = ctx.currentTime;
    const k = clamp(scale, 0.2, 1.5);
    this.lastBlast = { sampled: false, scale: k, startAt: t, boomAt: t, layers: [] };

    const noiseBuffer = (seconds) => {
      const n = Math.ceil(ctx.sampleRate * seconds);
      const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // Pink-ish: white noise with a one-pole smoother, which has far more
      // low-end energy than white and is what a blast actually is.
      let last = 0;
      for (let i = 0; i < n; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.035 * white) / 1.035;
        data[i] = last * 3.2 + white * 0.35;
      }
      return buffer;
    };

    const burst = (delay, level, len, openHz, closeHz) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(len);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(openHz, t + delay);
      lp.frequency.exponentialRampToValueAtTime(closeHz, t + delay + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(level * k, t + delay + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + len);
      src.connect(lp).connect(g).connect(bus);
      src.start(t + delay);
      src.stop(t + delay + len + 0.05);
    };

    burst(0, 0.95, 1.8, 9000, 300);        // the crack
    burst(0.28, 0.5, 2.6, 1800, 120);      // the ground-borne second front
    burst(0.05, 0.62, 9.0, 400, 45);       // the rumble tail

    // The punch. Nothing about this is audible on a laptop speaker and it is
    // the whole event on anything with a woofer.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(72, t);
    sub.frequency.exponentialRampToValueAtTime(22, t + 1.5);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.exponentialRampToValueAtTime(0.85 * k, t + 0.03);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    sub.connect(subGain).connect(bus);
    sub.start(t);
    sub.stop(t + 3.3);

    // And the debris, thrown for a long time afterwards.
    for (let i = 0; i < 5; i++) {
      burst(1.1 + i * 0.55 + Math.random() * 0.3, 0.16, 0.7, 2600, 200);
    }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* The flak                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * One burst, heard from `distance` metres.
   *
   * Owner: "the flak coming from the ground is bad ass. Let's really refine
   * that." Most of what makes a near miss frightening is not the volume, it is
   * the SPECTRUM: a burst two hundred metres away is a dull thud through the
   * airframe because the air has taken the top off it, and one thirty metres
   * away is a flat crack with all of it still in. So the lowpass corner and the
   * attack both move with distance, rather than one sample being played
   * quieter.
   *
   * Synthesised on purpose, like everything else on this page — see the file
   * header. `assets/sfx/manifest.json` is owner-generated and off limits, and a
   * bandwidth-limited noise burst is genuinely the right tool for this anyway.
   *
   * @param {number} distance metres
   * @param {number} [severity] 0..1, as `Defense` computed it
   */
  flakBurst(distance = 200, severity = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return false;
    const bus = this.engine.busSfx;
    const near = clamp(1 - distance / 320, 0, 1);
    // Sound takes time to get there. Under a fifth of a second at these
    // ranges, and it is exactly what separates "a burst" from "a burst NEAR
    // YOU" — the near ones arrive with the light.
    const t = ctx.currentTime + clamp(distance / 336, 0, 1.2);

    const len = 0.5 + near * 0.5;
    const n = Math.ceil(ctx.sampleRate * len);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.06 * white) / 1.06;
      data[i] = last * 2.6 + white * 0.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    // 380 Hz at three hundred metres, 6.5 kHz right on top of you.
    lp.frequency.setValueAtTime(lerp(380, 6500, near * near), t);
    lp.frequency.exponentialRampToValueAtTime(lerp(120, 400, near), t + len);
    const g = ctx.createGain();
    const peak = clamp(0.16 + near * 0.7, 0, 0.9) * clamp(0.4 + severity, 0.2, 1.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + lerp(0.03, 0.004, near));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(lp).connect(g).connect(bus);
    src.start(t);
    src.stop(t + len + 0.05);

    // The thump you feel rather than hear, only when it is genuinely close.
    if (near > 0.35) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(lerp(70, 130, near), t);
      sub.frequency.exponentialRampToValueAtTime(34, t + 0.5);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(near * 0.5, t + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      sub.connect(sg).connect(bus);
      sub.start(t);
      sub.stop(t + 0.75);
    }
    return true;
  }

  /**
   * Splinters arriving on the skin.
   *
   * The sound a crew actually remembers: not the bang, the gravel on the
   * fuselage half a second afterwards. A short burst of filtered impulses,
   * which is what it is.
   *
   * @param {number} [k] 0..1 — how much of it there was
   */
  shrapnel(k = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return false;
    const bus = this.engine.busSfx;
    const t0 = ctx.currentTime;
    const hits = 4 + Math.round(clamp(k, 0, 1) * 12);
    for (let i = 0; i < hits; i++) {
      const at = t0 + Math.random() * 0.28;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(900 + Math.random() * 2600, at);
      osc.frequency.exponentialRampToValueAtTime(180 + Math.random() * 300, at + 0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.6;
      bp.frequency.value = 1400 + Math.random() * 2200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.06 + Math.random() * 0.09 * clamp(k, 0, 1), at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      osc.connect(bp).connect(g).connect(bus);
      osc.start(at);
      osc.stop(at + 0.08);
    }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* The blast wave arriving                                           */
  /* ---------------------------------------------------------------- */

  /**
   * The front reaching the aeroplane.
   *
   * `detonation()` above is the event itself; this is the moment it gets to
   * YOU, which is a completely different sound — a crack with no distance in
   * it at all, then the airframe ringing, then a long roar of disturbed air
   * going past. Fired by `MissionController.onShockWave()` at whatever range
   * the player actually managed to get, which is why the break turn is worth
   * flying.
   *
   * @param {number} [severity] 0..3 as the mission computed it
   */
  blastWave(severity = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return false;
    const bus = this.engine.busSfx;
    const t = ctx.currentTime;
    const k = clamp(severity, 0.15, 3);

    // The slap.
    const n = Math.ceil(ctx.sampleRate * 2.4);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 4.2 + white * 0.3;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 2.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(clamp(0.5 * k, 0.05, 1), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    src.connect(lp).connect(g).connect(bus);
    src.start(t);
    src.stop(t + 2.4);

    // The airframe, complaining about it for a second and a half.
    for (const f of [148, 233, 391]) {
      const ring = ctx.createOscillator();
      ring.type = 'triangle';
      ring.frequency.setValueAtTime(f * (0.98 + Math.random() * 0.04), t + 0.02);
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.0001, t + 0.02);
      rg.gain.exponentialRampToValueAtTime(0.05 * clamp(k, 0.2, 1.4), t + 0.05);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      ring.connect(rg).connect(bus);
      ring.start(t + 0.02);
      ring.stop(t + 1.7);
    }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Wind that keeps going, and the city's sirens                       */
  /* ---------------------------------------------------------------- */

  /**
   * Airframe wind, plus a recorded bed under it.
   *
   * Owner: "A nice wind sound to continue playing." `MissionAudio.setAirspeed`
   * (the Beef Run's, unchanged) is a synthesised bandpass that IS the airspeed
   * readout — it has to move with the aeroplane and it is thin on purpose. The
   * bed is the other half: a recorded roar that comes up once and then simply
   * keeps going, through the release, through the detonation and all the way
   * home. Nothing stops it — not the drop, not the blast, not a checkpoint
   * restart, which leaves the aeroplane flying and therefore leaves the wind
   * where it was. Only `dispose()` takes it away.
   *
   * Silent until `enola.wind.high` is recorded — see the manifest brief. This
   * deliberately does NOT go through `AudioEngine.startLoop`'s synth fallback,
   * which would put a generic noise bed under an aeroplane that already has a
   * good synthesised wind: two synth winds is worse than one.
   */
  setAirspeed(tas) {
    super.setAirspeed(tas);
    this._updateWindBed(tas);
  }

  _updateWindBed(tas) {
    const engine = this.engine;
    if (!this.ready || !engine?.hasSample?.(WIND_CUE)) return false;
    if (!this._wind) {
      if (!(tas > 20)) return false;
      engine.startLoop(WIND_CUE, { name: WIND_CUE, volume: 0.0001, fade: 0.05, ambience: true });
      this._wind = true;
      this._windLevel = -1;
    }
    /* Same shape as the synth wind above it, and quieter: this is the body,
     * not the readout. Down to nothing on the ground — a parked aeroplane with
     * a slipstream over it is a bed nobody turned off. */
    const v = clamp(tas / 90, 0, 1.2);
    const level = tas < 12 ? 0 : clamp(0.05 + v * v * 0.2, 0, 0.3);
    // Only when it has actually moved. `setLoopVolume` anchors its ramp (see
    // ENGINE-TRAPS.md 1), but a fresh automation event every frame is still
    // work nobody asked for.
    if (Math.abs(level - this._windLevel) > 0.012) {
      this._windLevel = level;
      engine.setLoopVolume(WIND_CUE, level, 0.5);
    }
    return true;
  }

  /**
   * The city's air-raid sirens, on the run in.
   *
   * Owner: "maybe an air raid siren as we approach would be good as wlel."
   * THEY ARE THE CITY'S, not the cockpit's — Squatchbourg has heard the
   * engines and is winding its sirens up, and what the crew get is that sound
   * arriving from out there, across several kilometres of night air. So the
   * loop is positioned AT the city with a real panner: it comes from the
   * direction of the target, it gets louder as the run closes, and it swings
   * across the aeroplane on the break turn because the listener turns with the
   * camera. The lowpass closes with distance on top of that, because distance
   * takes the top off a sound as well as the level, and a bright siren is a
   * siren in the room with you.
   *
   * Silent until `enola.siren.airraid` is recorded. No synth fallback on
   * purpose: this page's convention is that an unrecorded cue is silent rather
   * than approximated, and two oscillators sweeping past each other would be a
   * police car, not a raid.
   *
   * @param {?{x:number,y:number,z:number}} at where the sirens are, or null to
   *   let them fall away — the target has been hit, or is behind you.
   * @param {number} range metres from the aeroplane to it
   */
  setAirRaidSiren(at, range = Infinity) {
    const engine = this.engine;
    if (!this.ready || !engine?.hasSample?.(SIREN_CUE)) return false;
    if (!at || !(range < SIREN_RANGE)) {
      if (this._siren) {
        engine.stopLoop(SIREN_CUE, 3.5);
        this._siren = false;
      }
      return false;
    }
    if (!this._siren) {
      engine.startLoop(SIREN_CUE, {
        name: SIREN_CUE,
        volume: 0.85,
        fade: 4,
        ambience: true,
        position: at,
        // Metres, not the apartment's furniture distances: the falloff has to
        // still be doing something five kilometres out.
        ref: 600,
        maxDist: SIREN_RANGE * 1.4,
      });
      this._siren = true;
    }
    const near = clamp(1 - range / SIREN_RANGE, 0, 1);
    engine.setLoopCutoff(SIREN_CUE, Math.round(lerp(420, 3200, near * near)), 1.2);
    return true;
  }

  dispose() {
    this.endFallingWhistle(0.02);
    this.stopBlast(0.2);
    this.engine?.stopLoop?.(WIND_CUE, 0.3);
    this.engine?.stopLoop?.(SIREN_CUE, 0.3);
    this._wind = false;
    this._siren = false;
    super.dispose();
  }
}
