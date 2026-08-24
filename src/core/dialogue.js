/**
 * THE ONE WAY A CHARACTER TALKS.
 *
 * Every scene in this game used to play its own dialogue its own way. The
 * Initiation had `sayFrom()` with a researched positional mix and a gain of
 * 0.95; the heist called `audio.play(line.cue, { volume: 0.85 })` with no mix
 * at all, so a bank robber ten metres down the lobby was exactly as loud as
 * one standing on your foot; the Silver Case and the siege used 0.9; Silent
 * Squatch used 0.8; `AudioEngine.say()` defaulted to 0.85. None of those
 * numbers is wrong on its own. Together they are a game whose dialogue volume
 * depends on which room you are standing in, which is what the owner heard
 * and reported as "random volume differences".
 *
 * The gain problem is fixed in the graph, not here -- `src/core/audio.js` now
 * has a voice bus with one trim on it, and ducks music and ambience under a
 * line. What is left is the part that has to be shared in CODE, and this is
 * it:
 *
 *   - ONE positional mix for a person talking, so a line carries the same
 *     distance in every scene.
 *   - ONE way to say "this line is quieter because he is behind a door",
 *     which is what a per-call gain is FOR and all it is for.
 *   - Timing off the REAL LENGTH of the recording rather than off a number
 *     somebody typed while watching it once. A scene that waits 2.4 s for a
 *     3.1 s line talks over itself; a scene that waits 2.4 s for a 0.9 s line
 *     has a hole in it. Both are in this codebase, and both are unfixable by
 *     hand because the recordings get re-cut.
 *   - ONE record of what was said and when, so a verifier can answer "did the
 *     right character say the right line in the right order" without hearing
 *     anything.
 *
 * WHAT THIS IS NOT. It is not a replacement for `AudioEngine.say()`, which
 * picks a random take from a bank of interchangeable barks and is the right
 * tool for a grunt. This is for AUTHORED lines: a specific cue, from a
 * specific character, in a specific order.
 */

/**
 * The mix for one person talking, in the open, at conversational distance.
 *
 * These are the Initiation's numbers, which were arrived at by standing at the
 * far kneel mark and listening: `ref` 2.2 keeps a man at talking distance at
 * full level, `maxDist` 30 covers a clearing plus the trail out of it, and
 * `rolloff` 0.7 is half the engine's default because 1.4 is right for a bottle
 * breaking and wrong for a man speaking. They are here, once, instead of in
 * one scene that got it right and eight that never tried.
 */
export const SPEECH_MIX = Object.freeze({ ref: 2.2, maxDist: 30, rolloff: 0.7 });

/**
 * Indoors, where the walls do the work the rolloff would otherwise have to.
 *
 * A lobby, an office, a cabin: shorter reach, and a faster falloff so a voice
 * across a room is a voice across a room rather than a voice in your ear.
 */
export const SPEECH_MIX_INDOORS = Object.freeze({ ref: 1.8, maxDist: 16, rolloff: 1.0 });

/**
 * A line that is NOT in the world -- a phone, a radio, a voice in his head.
 *
 * No panner at all. Giving a phone call a position is how a phone call ends up
 * quieter when the player turns his head.
 */
export const SPEECH_MIX_CLOSE = Object.freeze({ ref: null, maxDist: null, rolloff: null });

/**
 * Deliberate level changes, named.
 *
 * The whole point of taking per-scene gains away is that a number here now
 * MEANS something. If a line is quieter, it is quieter for one of these
 * reasons, and the reason is in the call.
 */
export const SPEECH_GAIN = Object.freeze({
  /** Normal. The overwhelming majority of lines. */
  normal: 1,
  /** Said under his breath, to himself, or to one person. */
  muttered: 0.72,
  /** Through a door, a wall, or a car window. Pair it with `muffle`. */
  muffled: 0.55,
  /** Shouted across a street or over gunfire. */
  shouted: 1.2,
});

/** The lowpass corner for a line arriving through fabric, in Hz. */
export const SPEECH_MUFFLE_HZ = Object.freeze({ door: 900, wall: 520, glass: 620, car: 1100 });

/**
 * How long to leave between two lines of the same conversation.
 *
 * A beat, not a gap. Two people who answer each other in 30 ms are reading;
 * two who leave a second are waiting for a cue. 0.28 s is a person drawing
 * breath.
 */
export const SPEECH_GAP_S = 0.28;

/** What to assume a line runs for when the recording does not exist yet. */
export const SPEECH_FALLBACK_S = 1.8;

/**
 * Discriminants for a queue deciding what to do with one authored line.
 *
 * Existing `speak()` callers keep their legacy result shape. DialogueSequence
 * consumes this status itself: RETRY leaves the line at the head of the queue,
 * while DROP records the permanent routing failure and advances deliberately.
 */
export const DIALOGUE_ACCEPTANCE = Object.freeze({
  ACCEPTED: 'accepted',
  RETRY: 'retry',
  DROP: 'drop',
});

const RETRYABLE_PLAYBACK_REASONS = new Set([
  'engine-not-ready',
  'context-suspended',
  'autoplay-blocked',
]);

/** @returns {{status:'accepted'|'retry'|'drop', reason:string|null, receipt:object|null}} */
function acceptanceResult({ routed, receipt }) {
  if (!routed) {
    return Object.freeze({
      status: DIALOGUE_ACCEPTANCE.DROP,
      reason: 'audio-unavailable',
      receipt: null,
    });
  }
  if (!receipt || receipt.started) {
    return Object.freeze({
      status: DIALOGUE_ACCEPTANCE.ACCEPTED,
      reason: null,
      receipt: receipt ?? null,
    });
  }
  const reason = receipt.fallbackReason ?? 'playback-not-started';
  return Object.freeze({
    status: RETRYABLE_PLAYBACK_REASONS.has(reason)
      ? DIALOGUE_ACCEPTANCE.RETRY : DIALOGUE_ACCEPTANCE.DROP,
    reason,
    receipt,
  });
}

/**
 * How long a cue actually runs.
 *
 * The decoded buffer if there is one, the manifest's authored duration if the
 * take has not been recorded yet, and only then a constant. That order matters:
 * a scene sequenced off the manifest still reads correctly before the VO is
 * cut, and re-times itself the moment the real recording lands.
 *
 * @param {object} audio  an AudioEngine
 * @param {string} cue
 * @param {number} [fallback]
 * @returns {number} seconds
 */
export function speechDuration(audio, cue, fallback = SPEECH_FALLBACK_S) {
  const decoded = audio?.sampleDuration?.(cue);
  if (Number.isFinite(decoded) && decoded > 0) return decoded;
  const authored = manifestDuration(audio, cue);
  if (Number.isFinite(authored) && authored > 0) return authored;
  return fallback;
}

function manifestDuration(audio, cue) {
  const entries = audio?.manifest?.sfx;
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    if (entry && entry.name === cue) return Number(entry.duration) || null;
  }
  return null;
}

/**
 * True when the cue has a decoded recording behind it.
 *
 * The thing this is for: a scene that plays an unrecorded cue is SILENT at
 * that beat and nothing anywhere says so. Silent Squatch's coughing scientists
 * were exactly that -- `silent.cough.dry`, `.fit` and `.choke` are in the
 * manifest, the trigger fires, and no file was ever generated, so the owner
 * heard the room bed and no coughs and reported the effect as broken. The code
 * was fine. Use this to decide whether to sequence off a line at all.
 */
export function hasSpeech(audio, cue) {
  return Boolean(audio?.hasSample?.(cue));
}

/**
 * Say one authored line.
 *
 * @param {object} audio          an AudioEngine
 * @param {string} cue            the exact cue, not a bank
 * @param {object} [options]
 * @param {*} [options.speaker]   anything with a world position -- an
 *        Object3D, a {x,y,z}, or a function returning one. A line from a
 *        speaker FOLLOWS him, so a man walking away gets quieter as he walks.
 * @param {*} [options.position]  a fixed point, for a speaker who cannot move.
 * @param {object} [options.mix]  SPEECH_MIX (default), _INDOORS, or _CLOSE.
 * @param {number} [options.gain] one of SPEECH_GAIN, or a number with a reason.
 * @param {number} [options.muffle] a SPEECH_MUFFLE_HZ corner, for through-a-wall.
 * @param {number} [options.delay]
 * @param {boolean} [options.requiredRecorded] strict-QA recording policy; true by default
 * @returns {{cue: string, seconds: number, source: *, silent: boolean,
 *   receipt: object|null, acceptance: {status:'accepted'|'retry'|'drop', reason:string|null,
 *   receipt:object|null}}}
 */
export function speak(audio, cue, options = {}) {
  const {
    speaker = null,
    position = null,
    mix = SPEECH_MIX,
    gain = SPEECH_GAIN.normal,
    muffle = 0,
    delay = 0,
    requiredRecorded = true,
    ...rest
  } = options;

  const seconds = speechDuration(audio, cue);
  const silent = !hasSpeech(audio, cue);
  /* No readiness check here on purpose. `AudioEngine.play()` already refuses
   * before `init()`, and duplicating that test in the router changed
   * behaviour rather than guarding it: every scene test double implements
   * `play` and none of them implements `ready`, so a guard here silently
   * skipped playback the doubles were written to observe. A router routes. */
  const canPlayWithReceipt = typeof audio?.playWithReceipt === 'function';
  const canPlayLegacy = typeof audio?.play === 'function';
  if (!canPlayWithReceipt && !canPlayLegacy) {
    const acceptance = acceptanceResult({ routed: false, receipt: null });
    return { cue, seconds, source: null, silent: true, receipt: null, acceptance };
  }

  const opts = {
    ...rest,
    /* `bus: 'voice'` is how a cue outside the `vo.` namespace declares itself
     * to be dialogue. Most of this game's authored lines are named for their
     * scene rather than for their kind -- `heist.snow.commit` is a line and
     * `heist.cash.lift` is a sound effect -- so the engine cannot tell them
     * apart by name and does not guess. */
    bus: 'voice',
    volume: gain,
    delay,
    /* The mouth system reads the analyser this puts inline, so a character's
     * jaw moves on the amplitude that is really reaching the speakers. */
    analyse: true,
    requiredRecorded,
  };
  if (muffle) opts.muffle = muffle;
  if (mix?.ref != null) {
    opts.ref = mix.ref;
    opts.maxDist = mix.maxDist;
    opts.rolloff = mix.rolloff;
    /* BOTH, when a caller has both. They are not alternatives: `position`
     * SEEDS the panner at the point the line starts from and `follow` is what
     * keeps it there afterwards, which is the difference between a line that
     * stays with a walking man and one pinned to where he was when he opened
     * his mouth. A caller with only a rig gets the seed read off it. */
    if (position) opts.position = position;
    if (speaker) opts.follow = speaker;
  }

  let source;
  let receipt = null;
  if (canPlayWithReceipt) {
    ({ source, receipt } = audio.playWithReceipt(cue, opts));
  } else {
    source = audio.play(cue, opts);
  }
  const acceptance = acceptanceResult({ routed: true, receipt });
  /* Claim the floor for the length of the line, so the things that hold off
   * under speech -- a fart, a bark, an idle grunt -- actually hold off. */
  if (acceptance.status === DIALOGUE_ACCEPTANCE.ACCEPTED) {
    audio.hold?.(delay + seconds + SPEECH_GAP_S);
  }
  return { cue, seconds, source, silent, receipt, acceptance };
}

/**
 * A conversation, sequenced off the real length of its recordings.
 *
 * Feed it lines; call `update(dt)` from the frame loop; it plays each one when
 * the one before it has finished, plus a beat. Nothing here uses a hard-coded
 * delay, which is the point: the two failure modes a typed delay produces --
 * a line stepping on the end of the previous one, and a hole where the scene
 * waits for a line that finished a second ago -- are both invisible in code
 * review and obvious the first time anybody listens.
 *
 * A line may carry `after`, an EXTRA pause before it, for a deliberate beat:
 * somebody deciding whether to answer. That is a different thing from a delay
 * standing in for a clip length, and it survives the recording being re-cut.
 */
export class DialogueSequence {
  /**
   * @param {object} audio an AudioEngine
   * @param {object} [options]
   * @param {number} [options.gap] the beat between lines
   * @param {Function} [options.onLine] called as each line starts, with the
   *        line and its measured duration -- the seam for subtitles.
   * @param {Function} [options.onDone]
   */
  constructor(audio, {
    gap = SPEECH_GAP_S,
    retryDelay = 0.1,
    onLine = null,
    onDone = null,
  } = {}) {
    this.audio = audio;
    this.gap = gap;
    this.retryDelay = Math.max(0.01, Number(retryDelay) || 0.1);
    this.onLine = onLine;
    this.onDone = onDone;
    this.lines = [];
    this.index = -1;
    this.wait = 0;
    this.running = false;
    /** What was said, in order, with when and for how long. For verifiers. */
    this.spoken = [];
    /** Refused starts remain visible without being misreported as spoken. */
    this.attempts = [];
  }

  /**
   * @param {Array} lines each `{ cue, speaker?, position?, mix?, gain?,
   *        muffle?, after?, text? }`
   */
  play(lines) {
    this.lines = [...lines];
    this.index = -1;
    this.wait = 0;
    this.running = this.lines.length > 0;
    this.spoken = [];
    this.attempts = [];
    return this;
  }

  stop() {
    this.running = false;
    this.lines = [];
    return this;
  }

  get done() {
    return !this.running;
  }

  /** The line being spoken, or null between lines. */
  get current() {
    return this.running && this.index >= 0 ? this.lines[this.index] ?? null : null;
  }

  update(dt) {
    if (!this.running) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    const candidateIndex = this.index + 1;
    if (candidateIndex >= this.lines.length) {
      this.running = false;
      this.onDone?.();
      return;
    }
    const line = this.lines[candidateIndex];
    const spoken = speak(this.audio, line.cue, line);
    this.attempts.push({
      cue: line.cue,
      index: candidateIndex,
      acceptance: spoken.acceptance.status,
      reason: spoken.acceptance.reason,
      receipt: spoken.receipt,
    });
    if (spoken.acceptance.status === DIALOGUE_ACCEPTANCE.RETRY) {
      /* Do not consume a line merely because its engine was temporarily
       * unavailable. The same authored line owns the next attempt. */
      this.wait = this.retryDelay;
      return;
    }
    this.index = candidateIndex;
    /* The NEXT line waits for this one plus a beat plus whatever pause it
     * asked for itself. A line with no recording still takes its authored
     * duration, so an unrecorded scene plays at the right pace with subtitles
     * instead of collapsing into one frame. */
    const next = this.lines[this.index + 1];
    this.wait = spoken.seconds + this.gap + (next?.after ?? 0);
    this.spoken.push({
      cue: line.cue,
      speaker: line.speakerId ?? null,
      seconds: spoken.seconds,
      silent: spoken.silent,
      acceptance: spoken.acceptance.status,
      receipt: spoken.receipt,
      index: candidateIndex,
    });
    this.onLine?.(line, spoken);
  }
}

/**
 * Scheduling jitter, in seconds, that is not two people talking at once.
 *
 * `DialogueSequence` leaves `SPEECH_GAP_S` (0.28 s) between its own lines, so
 * anything that genuinely overlaps does so by a lot. This is here only so that
 * two lines butted end to end by the audio clock -- where one source's
 * scheduled end and the next one's scheduled start land on the same
 * millisecond from opposite sides of a float -- do not read as a fault.
 */
export const VOICE_OVERLAP_GRACE_S = 0.02;

/**
 * Two people talking at once, found in the engine's own playback log.
 *
 * THE PROBLEM THIS IS FOR. `DialogueSequence` cannot talk over itself -- it
 * waits for the real clip length plus a beat before the next line. What it
 * cannot see is anything ELSE: a second sequence started by another system, an
 * ambient bark, a scripted beat firing while a hangout conversation is still
 * running. `AudioEngine.hold()` exists for that and is advisory: it makes the
 * cues that CHOOSE to check `busy()` wait, and stops nothing that does not.
 * So the only instrument for "are lines playing over each other" was the
 * owner listening, which is exactly the kind of note this project turns into
 * arithmetic.
 *
 * Pure on purpose, like the geometry and staging gates: playbacks in,
 * findings out. The recording is `AudioEngine.playbacks`, which already
 * carried the timings and now carries `voice`, `speakerId` and `interrupt`
 * beside them.
 *
 * A line marked `interrupt` is allowed to start inside the one before it,
 * because cutting somebody off is a thing scenes do on purpose. It is not
 * allowed to be *interrupted* in turn by an unmarked line, and it does not
 * excuse a third voice.
 *
 * @param {Array} playbacks entries from `AudioEngine.playbacks`
 * @param {object} [options]
 * @param {number} [options.grace] seconds of overlap to forgive
 * @returns {Array} `{ kind, a, b, overlapS, speakerA, speakerB }`
 */
export function voiceOverlaps(playbacks = [], { grace = VOICE_OVERLAP_GRACE_S } = {}) {
  const lines = playbacks
    .filter((entry) => entry?.voice && Number.isFinite(entry.scheduledAt))
    .map((entry) => {
      /* The real sounding window. `endedAt` is the truth when the source has
       * finished; before that, the scheduled start plus the clip length at its
       * playback rate is the best available and is what the sequencer used. */
      const seconds = Number.isFinite(entry.seconds) ? entry.seconds : 0;
      const end = Number.isFinite(entry.endedAt)
        ? entry.endedAt : entry.scheduledAt + seconds;
      return { ...entry, start: entry.scheduledAt, end };
    })
    .sort((a, b) => a.start - b.start);

  const findings = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const a = lines[i];
      const b = lines[j];
      /* Sorted by start, so once b begins after a has finished, so does
       * everything after it. */
      if (b.start >= a.end - grace) break;
      const overlapS = Math.min(a.end, b.end) - b.start;
      if (overlapS <= grace) continue;
      /* The LATER line is the one that chose to come in early, so it is the
       * one that has to declare itself. */
      if (b.interrupt) continue;
      /* Room murmur is allowed to sit under anything, including other room
       * murmur. It is scenery made of voices. What this gate is for is two
       * SUBTITLED lines colliding, which is what the owner hears as the
       * scene talking over itself. */
      if (a.ambient || b.ambient) continue;
      const sameMouth = a.speakerId != null && a.speakerId === b.speakerId;
      findings.push({
        kind: sameMouth ? 'SPEAKER_TALKS_OVER_SELF' : 'VOICES_OVERLAP',
        a: a.name,
        b: b.name,
        speakerA: a.speakerId ?? null,
        speakerB: b.speakerId ?? null,
        overlapS: Math.round(overlapS * 1000) / 1000,
      });
    }
  }
  return findings;
}
