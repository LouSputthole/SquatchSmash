/**
 * Mouths.
 *
 * Owner, 2026-08-06: *"I want to animate the mouths for the voices. We should
 * always animate the mouths."* The second sentence is the scope. This is one
 * module that every rig in the game routes its talking through, so a moving
 * mouth is a property of the CAST rather than of whichever scene remembered to
 * write the animation.
 *
 * ------------------------------------------------------------------
 * The rule that matters: the AUDIO drives the mouth
 * ------------------------------------------------------------------
 *
 * Every rig in this repo used to flap on a fixed cadence — `Math.sin(t * 11)`
 * in the Bing, `Math.sin(t * 16)` in the Squatchfather, `Math.sin(w * 11)` in
 * the Motel — for however many seconds somebody had guessed the line would
 * last. Two things are wrong with that and only one of them is obvious.
 *
 * The obvious one: the guess and the recording disagree. `hold` was authored
 * before any of these lines existed (see the note in
 * `src/silvercase/dialogue/DialogueController.js`), so a face kept chewing
 * for seconds after the words stopped, or stopped while they were still
 * coming. A mouth flapping on after the line has finished is worse than no
 * mouth at all, because it tells the player the character is not connected to
 * the sound.
 *
 * The second one is worse and quieter: **a constant flap has no syllables in
 * it.** A real mouth is mostly SHUT. It opens on vowels and closes between
 * words, and it is the gaps that make it read as speech rather than as a
 * hinge. No timer can invent those gaps because they belong to the take.
 *
 * So the envelope comes off the sound that is actually playing.
 * `AudioEngine.play()` taps an `AnalyserNode` inline on the voice path (see
 * its `analyse` option — it is on by default for every `vo.*` cue), this reads
 * the time-domain samples once a frame, and the mouth opens on the amplitude
 * that is genuinely reaching the speakers. The gaps come for free, because
 * they are really there.
 *
 * ------------------------------------------------------------------
 * The fallback, which is unmistakably a fallback
 * ------------------------------------------------------------------
 *
 * Hundreds of authored lines have no recording yet and play as a subtitle over
 * silence — the game's own long-standing convention, and a deliberate one (a
 * synthesised voice would be worse than silence). Those lines must not sit
 * there with a dead face while a subtitle runs, so `_fallbackOpen()`
 * synthesises a syllable envelope for exactly as long as the subtitle is up.
 *
 * It is a stand-in and it is labelled as one: it lives in a single method with
 * FALLBACK in the name, it is only ever reached when there is no analyser to
 * read, and `mouth.mode` reports `'fallback'` so a check, a debug handle or a
 * future reader can tell the two apart without guessing. It is not lip sync.
 * There is nothing to sync to.
 *
 * ------------------------------------------------------------------
 * What it costs
 * ------------------------------------------------------------------
 *
 * One `AnalyserNode` per PLAYING LINE — not per character. The analyser is
 * created by `play()`, lives inline in that one playback's own chain, and is
 * collected with the source when the line ends; a scene with two hundred
 * people in it and one man talking has exactly one. Per frame, per line
 * being spoken: one `getByteTimeDomainData` into a pre-allocated 256-byte
 * array plus a 256-iteration RMS — no FFT is ever run, because the time
 * domain is all an amplitude envelope needs.
 *
 * A silent `Mouth` costs one comparison per frame and returns (`_settled`).
 * That matters: these scenes carry thousands of meshes and hundreds of
 * figures, and all but one of them is quiet at any moment.
 *
 * ------------------------------------------------------------------
 * Photographed faces
 * ------------------------------------------------------------------
 *
 * Several characters — Big Uncle Lou above all — wear a real photograph on the
 * front of a box skull (`face:` in `makePerson`, and the same technique in the
 * Motel, the Initiation and the mansion). **A photograph cannot open its
 * mouth.** There is no geometry to move and drawing a lip over the picture
 * would deface the likeness, which is the entire reason the photo is there.
 *
 * So a photo head is detected here (the builders park a hidden mouth mesh on
 * it) and reported as `mouth.photo`. This module leaves that mesh alone and
 * publishes `open` anyway, so the rig can put the SAME envelope into head
 * motion instead — he nods and shifts on his own syllables, which is what
 * actually reads on a photograph at conversational distance. The decision and
 * its reason are repeated at each rig's call site.
 */

const TAU = Math.PI * 2;

/* Below this RMS the take is silent — the gap between two words, or a line
 * that has finished. Deliberately just above the noise floor of an mp3
 * decode rather than at zero. */
const SILENCE_RMS = 0.004;
/* The quietest take that still gets a full-open mouth. Without a floor here,
 * near-silence would be auto-gained up into a scream. */
const PEAK_FLOOR = 0.02;
/* How fast the auto-gain reference forgets the loudest moment it has heard.
 * Long enough to hold across a sentence, short enough that a shouted line
 * followed by a muttered one does not leave the muttered one shut. */
const PEAK_HALF_LIFE = 0.75;

/* Opening is quick and closing is quicker, because a jaw is light. These are
 * per-second lerp rates, applied as `min(1, dt * rate)` so a stalled tab
 * cannot overshoot (see ENGINE-TRAPS.md entry 2 — the sim clock is not the
 * wall clock, and this is one of the places that shows). */
const ATTACK = 42;
const RELEASE = 18;

/* If the analyser reads silence for this long the line is over and nothing
 * told us — the `ended` listener below is the real mechanism and this is only
 * the backstop. Generous on purpose: a three-second pause inside one line
 * does not happen, but a half-second one does, all the time. */
const DEAD_AIR = 3.0;

/* ---- fallback shape (see the header) ---- */
const SYLLABLE_HZ = 5.4;   // vowels per second at a normal speaking rate
const WORD_HZ = 0.78;      // and the slower rhythm that puts gaps between them
const FALLBACK_TAIL = 0.16; // close the mouth on the last of the subtitle

const DEFAULTS = Object.freeze({
  /** `mouth.scale.y = rest.y * (1 + open * openScale)`. */
  openScale: 2.6,
  /** Metres the jaw group drops at a full-open mouth, if the rig has one. */
  jawDrop: 0,
  /** Metres the mouth slides down per unit of extra scale, if the rig wants it. */
  sink: 0,
});

function smoothstep(edge0, edge1, x) {
  const k = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return k * k * (3 - 2 * k);
}

/**
 * One character's mouth.
 *
 * @param {object} parts  `{ mouth, jaw }` — whatever the rig has. `mouth` is
 *   the mesh whose Y scale is the opening; `jaw` is an optional group that
 *   drops with it. Both are optional: a `Mouth` with neither still produces a
 *   valid `open` envelope, which is what a photographed face uses.
 * @param {object} options see DEFAULTS.
 */
export class Mouth {
  constructor(parts = {}, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    this.openScale = opts.openScale;
    this.jawDrop = opts.jawDrop;
    this.sink = opts.sink;

    /** 0 shut, 1 wide. Smoothed, and the only output anything should read. */
    this.open = 0;
    /** `null` | `'audio'` | `'fallback'` — how `open` is being produced. */
    this.mode = null;
    /** Raw RMS of the last analyser read. Diagnostics only. */
    this.level = 0;

    this.source = null;
    this.analyser = null;
    this._bytes = null;
    this._peak = PEAK_FLOOR;
    this._t = 0;
    this._seconds = 0;
    /* Every fallback mouth in a room must not open on the same beat, or four
     * people mouthing a subtitle look like a chorus line. */
    this._seed = Math.random() * TAU;
    this._silentFor = 0;
    this._settled = true;
    this._onEnded = null;

    this.bind(parts);
  }

  /**
   * Point at a rig's mouth and record where it rests.
   *
   * Separate from the constructor because a head can be REBUILT under a live
   * figure: `restyleMargoHead` throws away every child of the head group and
   * hands back a new mouth mesh, so anything holding the old one is animating
   * a mesh that is no longer in the scene. Rigs re-bind rather than
   * re-construct so the line currently being spoken is not interrupted by a
   * change of clothes.
   */
  bind(parts = {}) {
    const { mouth = null, jaw = null } = parts;
    this.mouth = mouth || null;
    this.jaw = jaw || null;

    /* Rest is captured here rather than read from `userData.base`, because the
     * three rigs that carry a base store three different shapes in it (a
     * Vector3 in the Bing, `{y, scaleY}` in the Squatchfather, nothing at all
     * in the Motel). Capturing is also correct for a rig that has not
     * published one — and `world/build.js`'s `box()` carries an object's SIZE
     * in its scale, so animating without a rest snaps the mouth to a
     * one-metre cube. That has happened before; see the breathing note in
     * src/bing/cast.js. */
    this.rest = mouth
      ? { x: mouth.scale.x, y: mouth.scale.y, z: mouth.scale.z }
      : null;
    this.restY = mouth ? mouth.position.y : 0;
    this.jawRestY = jaw ? jaw.position.y : 0;

    /**
     * A PHOTOGRAPH CANNOT OPEN ITS MOUTH.
     *
     * The builders that paint a real face on the front of a skull park a
     * hidden mouth mesh there so the rest of the rig has something to hold
     * (see `makePerson`'s photo branch). Moving it would do nothing; making it
     * visible would draw a plastic lip across a photograph of somebody's face,
     * which is exactly what the photo is there to avoid. So the geometry is
     * left alone and `open` is published for the rig to spend on head motion
     * instead.
     */
    this.photo = Boolean(mouth && mouth.visible === false);
    return this;
  }

  /**
   * Start a line.
   *
   * @param {object|number} take
   *   `{ audio, source }`  the AudioEngine and the node `play()` returned —
   *                        the honest path; the analyser is looked up from it.
   *   `{ analyser }`       an analyser directly, if the caller already has it.
   *   `{ seconds }`        how long the line is on screen. Used as the
   *                        fallback's length, and as its own trigger when
   *                        there is no recording. A bare number means this.
   * @returns {?string} the mode chosen, for a caller that wants to log it.
   */
  speak(take = null) {
    const t = typeof take === 'number' ? { seconds: take } : (take || {});
    const source = t.source ?? null;
    const analyser = t.analyser
      ?? (source && t.audio?.analyserFor ? t.audio.analyserFor(source) : null);

    this._detach();
    this._t = 0;
    this._seconds = Math.max(0, Number(t.seconds) || 0);
    this._peak = PEAK_FLOOR;
    this._silentFor = 0;
    this._settled = false;

    if (analyser && typeof analyser.getByteTimeDomainData === 'function') {
      this.analyser = analyser;
      this._bytes = new Uint8Array(analyser.fftSize || 256);
      this.source = source;
      this.mode = 'audio';
      /* The line can be CUT rather than finish — `stopVoice` in the mission
       * controllers, `audio._vo.stop()` in the Bing and the Silver Room, a
       * sequence replacing another mid-word. `stop()` fires `ended` just like
       * a natural finish, so one listener covers both and the mouth never
       * carries on past a cut. */
      if (source && typeof source.addEventListener === 'function') {
        this._onEnded = () => { if (this.source === source) this.stop(); };
        source.addEventListener('ended', this._onEnded);
      }
    } else if (this._seconds > 0) {
      /* No analyser: either the line has no recording at all (most of them,
       * still) or it was played by a call site that has not been given the
       * engine. Either way the subtitle is up and the face must not be dead. */
      this.mode = 'fallback';
    } else {
      this.mode = null;
    }
    return this.mode;
  }

  /** Cut the line. The mouth closes from wherever it is; it does not snap. */
  stop() {
    this._detach();
    this.mode = null;
    this._seconds = 0;
    this._settled = false;   // one more update, to close it
  }

  /** True while this mouth is being driven by anything at all. */
  get speaking() {
    return this.mode !== null;
  }

  _detach() {
    if (this.source && this._onEnded
      && typeof this.source.removeEventListener === 'function') {
      this.source.removeEventListener('ended', this._onEnded);
    }
    this._onEnded = null;
    this.source = null;
    this.analyser = null;
    this._bytes = null;
  }

  /**
   * Advance and apply. Call once per frame from the rig's own update, AFTER
   * whatever clears the rig's transient pose.
   *
   * @returns {number} the smoothed opening, 0..1. A rig with a photographed
   *   face should spend this on head motion; see `photo` above.
   */
  update(dt = 0) {
    if (this.mode === null && this._settled) return 0;
    const step = Math.max(0, Math.min(0.1, dt));
    this._t += step;

    let target = 0;
    if (this.mode === 'audio') target = this._audioOpen(step);
    else if (this.mode === 'fallback') target = this._fallbackOpen();

    const rate = target > this.open ? ATTACK : RELEASE;
    this.open += (target - this.open) * Math.min(1, step * rate);
    if (this.open < 0.002) this.open = 0;
    this._apply();
    if (this.mode === null && this.open === 0) this._settled = true;
    return this.open;
  }

  /**
   * The amplitude actually reaching the speakers, auto-gained.
   *
   * Time domain, not frequency: an envelope needs loudness, and asking for
   * frequency bins would run an FFT per speaking character per frame for a
   * number nothing here reads.
   */
  _audioOpen(dt) {
    const bytes = this._bytes;
    this.analyser.getByteTimeDomainData(bytes);
    let sum = 0;
    for (let i = 0; i < bytes.length; i++) {
      const v = (bytes[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / bytes.length);
    this.level = rms;

    /* Auto-gain against the loudest moment recently heard, so a quiet take
     * opens as wide as a loud one instead of mumbling — takes in this game
     * come from a dozen ElevenLabs voices at a dozen levels, and the mix
     * puts a panner and a distance rolloff between the file and this read. */
    this._peak = Math.max(rms, Math.max(PEAK_FLOOR, this._peak * (0.5 ** (dt / PEAK_HALF_LIFE))));

    if (rms <= SILENCE_RMS) {
      this._silentFor += dt;
      /* Backstop only. `ended` is what normally finishes a line; this catches
       * the case where a source was replaced or garbage-collected without one
       * so a mouth cannot be left reading a dead analyser forever. */
      if (this._silentFor > DEAD_AIR) this.stop();
      return 0;
    }
    this._silentFor = 0;
    return Math.min(1, (rms - SILENCE_RMS) / (this._peak - SILENCE_RMS));
  }

  /**
   * ---- THE FALLBACK ----
   *
   * NOT lip sync. There is no sound here to sync to: this is what a face does
   * while a subtitle runs over silence, and it exists only so that an
   * unrecorded line does not play to a dead face. Two rhythms, because one is
   * a hinge:
   *
   *   syllable — the open-and-shut, at a plausible speaking rate
   *   word     — the slower gate that shuts the mouth between words
   *
   * plus a per-mouth phase seed so a room full of unrecorded lines is not a
   * chorus line, and a short taper so the mouth is closed by the time the
   * subtitle goes.
   */
  _fallbackOpen() {
    const left = this._seconds - this._t;
    if (left <= 0) {
      this.stop();
      return 0;
    }
    const t = this._t;
    const syllable = 0.5 - 0.5 * Math.cos(t * SYLLABLE_HZ * TAU + this._seed);
    const word = 0.5 + 0.5 * Math.sin(t * WORD_HZ * TAU + this._seed * 1.7);
    const gate = smoothstep(0.16, 0.46, word);
    return syllable * gate * Math.min(1, left / FALLBACK_TAIL) * 0.9;
  }

  _apply() {
    const m = this.mouth;
    /* A photographed face has no mouth to move. Leave the hidden placeholder
     * exactly where the builder put it — `open` is still published, and the
     * rig spends it on the head. */
    if (!m || this.photo) return;
    const rest = this.rest;
    const y = rest.y * (1 + this.open * this.openScale);
    m.scale.set(rest.x, y, rest.z);
    if (this.sink) m.position.y = this.restY - (y / rest.y - 1) * this.sink;
    if (this.jaw && this.jawDrop) {
      this.jaw.position.y = this.jawRestY - this.open * this.jawDrop;
    }
  }
}

/**
 * The take a line is being spoken with, in the shape `Mouth.speak()` wants.
 *
 * Sugar for the common call site: a scene has an `AudioEngine`, the node
 * `play()` gave back (or `null` when the cue has no recording), and the
 * number of seconds the subtitle is up for.
 */
export function voiceTake(audio, source, seconds = 0) {
  return { audio, source: source || null, seconds };
}
