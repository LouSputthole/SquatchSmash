import { SPEAKERS } from '../script.js';

/**
 * Plays SEQUENCES from ../script.js.
 *
 * Same shape as The Silver Case's controller (src/silvercase/dialogue/
 * DialogueController.js) with two differences this mission needs:
 *
 *  1. `onLine` receives the whole authored line, including `muffled`, so the
 *     mission can route a line spoken behind the reinforced glass through
 *     `lab.glassAudio` and out of the right scientist's body rather than
 *     playing it dry in the observation room.
 *  2. A line may be a pure STAGE DIRECTION (`{ stage: 'door.lock' }`, no text,
 *     no cue). Those never reach the subtitle; they are handed to `onStage`,
 *     which is where the mission opens the door, sends the drawer, starts the
 *     gas. Writing them into the sequence rather than into the state machine
 *     keeps the mission's timing in the same file as its words.
 *
 * Nothing here touches movement, camera or interaction: the player keeps full
 * control through every line of this mission, which is the spec's "not a
 * cutscene" requirement.
 */
export class DialogueController {
  constructor({
    onLine, onLineEnd, onStage, playCue,
  } = {}) {
    this.onLine = onLine;
    this.onLineEnd = onLineEnd;
    this.onStage = onStage;
    this.playCue = playCue;

    this.queue = [];
    this.active = null;
    this.timer = 0;
    this._onDone = null;
    /* The take the active line is being spoken on, when `playCue` returned
     * one (`{ duration, source }`) rather than a bare length — kept so hush()
     * can stop the actual sound and not just the subtitle. */
    this._take = null;

    /** Every cue this controller attempted, in order — the hook a headless
     * verifier reads to prove wiring without needing a recording. */
    this.cueLog = [];
    /** Every spoken line successfully dispatched through the subtitle hook.
     * Unlike the shared HUD's current text, this cannot be overwritten by the
     * other Mansion dialogue controller before a verifier samples it. */
    this.captionLog = [];
    /** Every stage direction performed, in order. */
    this.stageLog = [];
  }

  get busy() {
    return Boolean(this.active) || this.queue.length > 0;
  }

  /** Queue a sequence, replacing anything queued. Calls onDone once drained. */
  play(sequence, { onDone } = {}) {
    /* A spoken line replaced by another spoken line is an interruption, and
     * the take goes with the subtitle. Replaced by a stage direction it may
     * finish under the business, the way its caption stays up. */
    if (this.active && sequence[0] && !sequence[0].stage) this.hush();
    this.queue = sequence.slice();
    this._onDone = onDone || null;
    this._advance();
  }

  /** Slip a bark in front of whatever is queued without disturbing it. */
  interject(sequence) {
    this.queue = [...sequence, ...this.queue];
    if (!this.active) this._advance();
  }

  /** Drop everything, without firing the pending onDone. */
  clear() {
    this.hush();
    this.queue = [];
    this.active = null;
    this._onDone = null;
  }

  /**
   * Stop the take the active line is being spoken on.
   *
   * Same contract as `Dialogue.hush()` in src/bing/dialogue.js: since mouths
   * became audio-driven (src/core/mouth.js) a line that was cut off — a
   * sequence replaced mid-sentence, a man killed mid-plea — kept sounding
   * after its subtitle went. A line that ran its full hold has already
   * finished and needs nothing stopped. Only takes returned through
   * `playCue` as `{ duration, source }` can be reached; a body that plays its
   * own line (`lab.scientists[i].say`) owns its own stop.
   */
  hush() {
    const source = this._take?.source;
    this._take = null;
    if (!source?.stop) return false;
    try { source.stop(); } catch { /* never started, or already ended */ }
    return true;
  }

  _advance() {
    const line = this.queue.shift();
    if (!line) {
      const prev = this.active;
      this.active = null;
      this._take = null;
      const done = this._onDone;
      this._onDone = null;
      this.onLineEnd?.(prev);
      done?.();
      return;
    }
    this.active = line;
    const authored = line.hold ?? Math.max(1.2, (line.text?.length || 0) * 0.045);
    this.timer = authored;

    if (line.stage) {
      /* The take is KEPT, not dropped. A stage direction is business the
       * previous line may finish under (see play()), so the sound is still
       * running — and dropping the handle here orphaned it: no later hush()
       * or clear() could reach it, and it kept sounding under whatever spoke
       * next, with mouth.js driving both mouths. */
      this.stageLog.push(line.stage);
      this.onStage?.(line.stage, line);
      return;
    }
    const speaker = SPEAKERS[line.speaker] || { name: line.speaker, voice: null };
    if (line.cue) this.cueLog.push(line.cue);
    const played = this.playCue?.(line.cue ?? null, speaker.voice, line);
    /* `playCue` answers with the take's length, or with the take itself
     * (`{ duration, source }`) when the caller can hand the source over — the
     * only way hush() can reach the sound. Either way the hold below reads a
     * number. */
    this._take = played && typeof played === 'object' ? played : null;
    const spoken = this._take ? Number(this._take.duration) || 0 : played;
    const caption = { ...line, speakerName: speaker.name };
    if (this.onLine) {
      this.onLine(caption);
      this.captionLog.push(Object.freeze({
        speaker: line.speaker ?? null,
        speakerName: speaker.name,
        text: line.text ?? '',
        cue: line.cue ?? null,
      }));
    }

    /* HOLD FOR THE RECORDING, not for the guess.
     *
     * `hold` was authored when this scene had no audio at all — the comment in
     * `mount.js` still said "none of this mission's cues have been generated
     * yet" — so it is a reading time for a subtitle, measured against nothing.
     * A hundred and seventy-five of these lines are now recorded, and any take
     * longer than its guess was talked over by the next line.
     *
     * AND ONLY FOR THE RECORDING, when there demonstrably is one. Owner
     * playtest, 2026-08-19: *"he pauses a bit too long"* — Booski's takes run
     * shorter than their authored guesses ("Good." is 0.8 s against a 1.6 s
     * hold; "Handle it." 1.2 against 1.6) and `max(authored, real)` kept the
     * guess, so every short line trailed up to a second of dead air. A take
     * handed over as an OBJECT (`{ duration, source }` — mount.js builds one
     * only when `hasSample()` says the recording exists) is measured against
     * the audio, so it holds for the take plus a breath, floored for subtitle
     * readability, and the guess is retired. The siege's script.js made the
     * same call: "the recording's own length beats the authored guess."
     *
     * A bare NUMBER from `playCue` still takes `max(authored, real)`: the
     * scientist-body route reports a guessed 1.7 s for its unrecorded lines,
     * indistinguishable from a real take, so the authored hold must keep its
     * vote there. And a line with no take at all keeps the authored hold
     * outright — it is the only number there is. Deliberate dead air is not
     * flattened by any of this: the script authors its beats as HUD stage
     * lines (`booski.pause`, `booski.silent`), which never reach this branch. */
    const real = typeof spoken === 'number' && spoken > 0 ? spoken + 0.35 : 0;
    this.timer = this._take && real > 0
      ? Math.max(real, 1.2)
      : Math.max(authored, real);
  }

  update(dt) {
    if (!this.active) return;
    this.timer -= dt;
    if (this.timer <= 0) this._advance();
  }
}
