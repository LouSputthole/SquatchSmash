import { SPEAKERS } from './script.js';

const wallSeconds = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;

/**
 * Plays SEQUENCES from script.js and presents CHOICES. Deliberately does not
 * touch player movement, camera, or interaction — see the mission brief this
 * scene is built from: nothing here should ever take control away. States
 * that want a soft camera nudge read `line.look` themselves via `onLook`.
 *
 * Mirrors the split used across the rest of the game (Bing's dialogue.js,
 * Squatchfather's DialogueController.js): this file is the machine, script.js
 * is the writing, and the mission/main.js supplies the HUD/audio hooks.
 */
export class DialogueController {
  /**
   * @param {object} hooks
   * @param {(cue:string, voice:?string, line?:object)=>number|void} [hooks.playCue] starts a
   *   line and RETURNS ITS LENGTH IN SECONDS (0/undefined when there is no
   *   recording). The length is what stops the next line talking over it —
   *   see `_advance()`.
   * @param {()=>void} [hooks.stopVoice] cuts whatever is currently being said.
   *   Called before every line and whenever a sequence replaces another.
   */
  constructor({
    onLine, onLineEnd, onLook, onChoiceOpen, onChoiceClose, playCue, stopVoice,
    now = wallSeconds,
  } = {}) {
    this.onLine = onLine;
    this.onLineEnd = onLineEnd;
    this.onLook = onLook;
    this.onChoiceOpen = onChoiceOpen;
    this.onChoiceClose = onChoiceClose;
    this.playCue = playCue;
    this.stopVoice = stopVoice;
    this.now = now;

    this.queue = [];
    this.active = null;
    this.timer = 0;
    this._lineWallTime = null;
    this._onDone = null;

    this.choice = null;
    this.choiceTimer = 0;
    this._choiceWallTime = null;
    this._onChoiceResolved = null;

    /** Every cue name this controller ever attempted, played or not — the
     * hook headless verify scripts read to prove wiring without needing a
     * real recording (same idiom as `game.voLog` elsewhere in the repo). */
    this.cueLog = [];

    /**
     * The real audio/subtitle event log, one entry per line, in play order.
     *
     * `cueLog` only ever proves a cue was ASKED for — it says nothing about
     * whether the take was actually reachable at that instant, which is
     * exactly the gap the mission's first line fell through: `hasSample()`
     * checked at play time, not whenever a verify script happens to check
     * later (by which point an in-flight manifest load may well have
     * finished, hiding the very race that broke it). `playedAudio` is
     * `playCue`'s own return value at the moment this line ran — a real
     * decoded take started, not a retroactive guess — so a verify script can
     * assert the FIRST line of a fresh playthrough actually sounded rather
     * than merely being logged as attempted. */
    this.voiceLog = [];
  }

  get busy() {
    return Boolean(this.active) || Boolean(this.choice);
  }

  /** Queue a SEQUENCES[...] array. Calls onDone() once it drains. */
  play(sequence, { onDone } = {}) {
    /* Whatever was being said, stop saying it. `play()` REPLACES the queue,
     * so a sequence started while a line is still in the air used to leave the
     * old take running underneath the new one — two men talking at once, and
     * the commonest way this scene got there. */
    this.stopVoice?.();
    this.queue = sequence.slice();
    this._onDone = onDone || null;
    this._advance();
  }

  /** Insert a one-shot bark ahead of anything queued, without disturbing it. */
  interject(sequence) {
    this.queue = [...sequence, ...this.queue];
    if (!this.active) this._advance();
  }

  skipLine() {
    if (this.active) this.timer = 0;
  }

  _advance() {
    const line = this.queue.shift();
    if (!line) {
      const prev = this.active;
      this.active = null;
      this._lineWallTime = null;
      const done = this._onDone;
      this._onDone = null;
      this.onLineEnd?.(prev);
      done?.();
      return;
    }
    this.active = line;
    const speaker = SPEAKERS[line.speaker] || { name: line.speaker, voice: null };
    this.cueLog.push(line.cue || null);
    /* Cut the previous take before starting this one. Nothing here used to,
     * so a line whose recording ran past its authored `hold` was still
     * speaking when the next one began. */
    this.stopVoice?.();
    /* Give the scene adapter the authored line as well as the legacy cue and
     * voice arguments. Spatial dialogue cannot choose the correct live actor
     * from a cue string alone (the car and apartment even have separate Ape
     * rigs), and asking every adapter to reverse-engineer that relationship is
     * how world speech gets flattened into non-positional playback. Existing
     * two-argument adapters remain valid because JavaScript ignores extras. */
    const spoken = this.playCue?.(line.cue, speaker.voice, line);
    /* Logged from `spoken` — playCue's own real-time report — not from a
     * post-hoc `hasSample(cue)` re-check, which is exactly what would have
     * missed the race: by the time anything asks again, the manifest may
     * have already finished loading. */
    this.voiceLog.push({
      speaker: line.speaker,
      cue: line.cue || null,
      text: line.text || null,
      playedAudio: typeof spoken === 'number' && spoken > 0,
    });
    this.onLine?.({ ...line, speakerName: speaker.name });
    if (line.look) this.onLook?.(line.look);

    /* HOW LONG THE LINE HOLDS. Owner playtest, 2026-08-06: "the voicelines are
     * playing over eachother."
     *
     * `hold` is an AUTHORED GUESS — written before any of these lines were
     * recorded, and where it is absent this falls back to counting characters.
     * A real take that runs longer than its guess was simply talked over by
     * the next line, every time, for everybody. That is not a timing tweak
     * away from correct; the number was never measured against the audio.
     *
     * So `playCue` now returns the take's real length and the line holds for
     * whichever is longer, plus a short breath. The authored `hold` still
     * wins when it is longer, because some beats want a pause after the words
     * stop, and it is still the only number available for a line nobody has
     * recorded yet. */
    const authored = line.hold ?? Math.max(1.2, (line.text?.length || 0) * 0.045);
    const real = typeof spoken === 'number' && spoken > 0 ? spoken + 0.35 : 0;
    this.timer = Math.max(authored, real);
    this._lineWallTime = this.now();
  }

  /**
   * Present a CHOICES[...] entry. `onResolved(outcome, option|null)` fires
   * either when the player presses the bound key or when the timeout
   * expires (option is null, outcome is choiceDef.defaultOutcome).
   */
  presentChoice(choiceDef, { onResolved } = {}) {
    this.choice = choiceDef;
    this.choiceTimer = choiceDef.timeout ?? 6;
    this._choiceWallTime = this.now();
    this._onChoiceResolved = onResolved || null;
    this.onChoiceOpen?.(choiceDef);
  }

  /**
   * Restart the active-time wall clock without spending time elapsed while the
   * game was paused or hidden. The scene calls this on resume; keeping it here
   * also makes the timing policy explicit and independently testable.
   */
  syncClock() {
    if (this.active) this._lineWallTime = this.now();
    if (this.choice) this._choiceWallTime = this.now();
  }

  /** Returns true if `key` matched an open choice's option. */
  chooseKey(key) {
    if (!this.choice) return false;
    const opt = this.choice.options?.find((o) => o.key === key);
    if (!opt) return false;
    this._resolveChoice(opt.outcome, opt);
    return true;
  }

  /** For hold-to-confirm choices (the prayer finish) rather than 1-4 picks. */
  resolveChoice(outcome, option = null) {
    if (!this.choice) return false;
    this._resolveChoice(outcome, option);
    return true;
  }

  _resolveChoice(outcome, option) {
    const choice = this.choice;
    this.choice = null;
    this._choiceWallTime = null;
    const resolve = this._onChoiceResolved;
    this._onChoiceResolved = null;
    this.onChoiceClose?.(choice);
    resolve?.(outcome, option);
  }

  update(dt) {
    if (this.choice) {
      /* A decision window is a promise in human seconds, not rendered frames.
       * Under software rendering the scene can advance only a few clamped-dt
       * seconds during 25 wall seconds, which made Winston wait far past the
       * authored 27-second default. Use whichever active interval is larger:
       * wall time gives the player the advertised real window, while `dt`
       * preserves deterministic verifier/game-clock stepping. */
      const now = this.now();
      const wallDt = this._choiceWallTime === null
        ? 0
        : Math.max(0, now - this._choiceWallTime);
      this._choiceWallTime = now;
      const gameDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
      this.choiceTimer -= Math.max(gameDt, wallDt);
      if (this.choiceTimer <= 0) {
        this._resolveChoice(this.choice.defaultOutcome ?? null, null);
      }
      return;
    }
    if (!this.active) return;
    /* Subtitle/sequence holds obey the same human-time contract as choices.
     * Recorded audio already plays in wall time; advancing its dialogue queue
     * only in clamped render dt makes low-frame-rate clients leave stale text
     * up and delay the next playable affordance long after the take ended. */
    const now = this.now();
    const wallDt = this._lineWallTime === null
      ? 0
      : Math.max(0, now - this._lineWallTime);
    this._lineWallTime = now;
    const gameDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.timer -= Math.max(gameDt, wallDt);
    if (this.timer <= 0) this._advance();
  }
}
