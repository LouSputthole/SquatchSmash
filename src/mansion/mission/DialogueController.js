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

    /** Every cue this controller attempted, in order — the hook a headless
     * verifier reads to prove wiring without needing a recording. */
    this.cueLog = [];
    /** Every stage direction performed, in order. */
    this.stageLog = [];
  }

  get busy() {
    return Boolean(this.active) || this.queue.length > 0;
  }

  /** Queue a sequence, replacing anything queued. Calls onDone once drained. */
  play(sequence, { onDone } = {}) {
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
    this.queue = [];
    this.active = null;
    this._onDone = null;
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
    this.timer = line.hold ?? Math.max(1.2, (line.text?.length || 0) * 0.045);

    if (line.stage) {
      this.stageLog.push(line.stage);
      this.onStage?.(line.stage, line);
      return;
    }
    const speaker = SPEAKERS[line.speaker] || { name: line.speaker, voice: null };
    if (line.cue) this.cueLog.push(line.cue);
    this.playCue?.(line.cue ?? null, speaker.voice, line);
    this.onLine?.({ ...line, speakerName: speaker.name });
  }

  update(dt) {
    if (!this.active) return;
    this.timer -= dt;
    if (this.timer <= 0) this._advance();
  }
}
