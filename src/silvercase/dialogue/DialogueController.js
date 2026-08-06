import { SPEAKERS } from './script.js';

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
   * @param {(cue:string, voice:?string)=>number|void} [hooks.playCue] starts a
   *   line and RETURNS ITS LENGTH IN SECONDS (0/undefined when there is no
   *   recording). The length is what stops the next line talking over it —
   *   see `_advance()`.
   * @param {()=>void} [hooks.stopVoice] cuts whatever is currently being said.
   *   Called before every line and whenever a sequence replaces another.
   */
  constructor({
    onLine, onLineEnd, onLook, onChoiceOpen, onChoiceClose, playCue, stopVoice,
  } = {}) {
    this.onLine = onLine;
    this.onLineEnd = onLineEnd;
    this.onLook = onLook;
    this.onChoiceOpen = onChoiceOpen;
    this.onChoiceClose = onChoiceClose;
    this.playCue = playCue;
    this.stopVoice = stopVoice;

    this.queue = [];
    this.active = null;
    this.timer = 0;
    this._onDone = null;

    this.choice = null;
    this.choiceTimer = 0;
    this._onChoiceResolved = null;

    /** Every cue name this controller ever attempted, played or not — the
     * hook headless verify scripts read to prove wiring without needing a
     * real recording (same idiom as `game.voLog` elsewhere in the repo). */
    this.cueLog = [];
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
    const spoken = this.playCue?.(line.cue, speaker.voice);
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
  }

  /**
   * Present a CHOICES[...] entry. `onResolved(outcome, option|null)` fires
   * either when the player presses the bound key or when the timeout
   * expires (option is null, outcome is choiceDef.defaultOutcome).
   */
  presentChoice(choiceDef, { onResolved } = {}) {
    this.choice = choiceDef;
    this.choiceTimer = choiceDef.timeout ?? 6;
    this._onChoiceResolved = onResolved || null;
    this.onChoiceOpen?.(choiceDef);
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
    const resolve = this._onChoiceResolved;
    this._onChoiceResolved = null;
    this.onChoiceClose?.(choice);
    resolve?.(outcome, option);
  }

  update(dt) {
    if (this.choice) {
      this.choiceTimer -= dt;
      if (this.choiceTimer <= 0) {
        this._resolveChoice(this.choice.defaultOutcome ?? null, null);
      }
      return;
    }
    if (!this.active) return;
    this.timer -= dt;
    if (this.timer <= 0) this._advance();
  }
}
