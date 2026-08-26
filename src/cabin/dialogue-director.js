import {
  DialogueSequence,
  SPEECH_MIX,
  SPEECH_MIX_INDOORS,
} from '../core/dialogue.js';
import { cabinBeat } from './script.js';

const OUTDOOR_BEATS = new Set([
  'FIRST_AT_FIRE',
  'GASOLINE',
  'IGNITION',
  'FIRE_TALK_ONE',
  'FIRE_TALK_SQUATCHES',
  'FIRE_TALK_TWO',
  'FIRE_TALK_THREE',
  'BLACKOUT',
]);

/**
 * Small Cabin adapter around the shared measured dialogue sequencer.
 *
 * It owns subtitles and the speaking rig for a line, but not story state.
 * Every completion goes back to the chapter director, which decides what the
 * line unlocked. That makes reload restoration independent from audio timing.
 */
export class CabinDialogueDirector {
  constructor({
    audio,
    hud = null,
    actors = {},
    onDone = null,
    onAction = null,
    onStage = null,
  } = {}) {
    if (!audio) throw new TypeError('CabinDialogueDirector requires audio');
    this.audio = audio;
    this.hud = hud;
    this.actors = new Map(Object.entries(actors));
    this.onDone = onDone;
    this.onAction = onAction;
    this.onStage = onStage;
    this.beatId = null;
    this._beatDone = null;
    this._entries = [];
    this._cursor = 0;
    this.waitingAction = null;
    this.receipts = [];
    this.sequence = new DialogueSequence(audio, {
      onLine: (line, spoken) => this._lineStarted(line, spoken),
      onDone: () => this._segmentFinished(),
    });
  }

  setActor(key, actor) {
    if (actor) this.actors.set(key, actor);
    else this.actors.delete(key);
    return this;
  }

  actor(key) {
    return this.actors.get(key) || null;
  }

  play(beatId, { onDone = null, force = false } = {}) {
    const beat = cabinBeat(beatId);
    if (!beat) throw new RangeError('Unknown Cabin dialogue beat ' + beatId);
    if (this.sequence.running && !force) return false;
    if (force) this.stop();
    this.beatId = beatId;
    this._beatDone = onDone;
    this._entries = [...beat.lines];
    this._cursor = 0;
    this.waitingAction = null;
    this._advance();
    return true;
  }

  _spokenLines(entries) {
    const mix = OUTDOOR_BEATS.has(this.beatId) ? SPEECH_MIX : SPEECH_MIX_INDOORS;
    return entries.map((entry) => {
      const actor = this.actor(entry.who);
      const speakerObject = actor?.group || actor || null;
      return {
        ...entry,
        speakerMeta: entry.speaker,
        speaker: speakerObject,
        follow: speakerObject,
        speakerId: entry.who,
        mix,
        subtitle: entry.text,
        requiredRecorded: false,
      };
    });
  }

  _advance() {
    if (!this.beatId) return;
    while (this._cursor < this._entries.length) {
      const entry = this._entries[this._cursor];
      if (entry.stage) {
        this._cursor += 1;
        this.onStage?.(entry, this.beatId);
        continue;
      }
      if (entry.action) {
        this._cursor += 1;
        this.waitingAction = entry;
        this.onAction?.(entry, () => this.resolveAction(entry.action), this.beatId);
        return;
      }
      const spoken = [];
      while (this._cursor < this._entries.length && this._entries[this._cursor].cue) {
        spoken.push(this._entries[this._cursor]);
        this._cursor += 1;
      }
      if (spoken.length) {
        this.sequence.play(this._spokenLines(spoken));
        return;
      }
      this._cursor += 1;
    }
    this._finished();
  }

  resolveAction(kind = null) {
    if (!this.waitingAction) return false;
    if (kind && this.waitingAction.action !== kind) return false;
    this.waitingAction = null;
    this._advance();
    return true;
  }

  stop() {
    this.sequence.stop();
    for (const actor of this.actors.values()) actor?.hush?.();
    this.beatId = null;
    this._beatDone = null;
    this._entries = [];
    this._cursor = 0;
    this.waitingAction = null;
  }

  update(dt) {
    this.sequence.update(dt);
  }

  get running() {
    return this.beatId !== null;
  }

  get current() {
    return this.beatId;
  }

  _lineStarted(line, spoken) {
    const actor = this.actor(line.who);
    if (typeof actor?.say === 'function') {
      actor.say(spoken.seconds, { audio: this.audio, source: spoken.source });
    } else if (typeof actor?.speakTo === 'function') {
      actor.speakTo(null, spoken.seconds, { audio: this.audio, source: spoken.source });
    }
    const name = line.speakerMeta?.name || line.who;
    this.hud?.say?.('<b>' + name + ':</b> ' + line.text, Math.ceil((spoken.seconds + 0.2) * 1000));
    this.receipts.push(Object.freeze({
      beat: this.beatId,
      cue: line.cue,
      speaker: line.who,
      seconds: spoken.seconds,
      silent: spoken.silent,
      acceptance: spoken.acceptance?.status || null,
    }));
  }

  _segmentFinished() {
    this._advance();
  }

  _finished() {
    const beat = this.beatId;
    const localDone = this._beatDone;
    this.beatId = null;
    this._beatDone = null;
    this._entries = [];
    this._cursor = 0;
    this.waitingAction = null;
    localDone?.(beat);
    this.onDone?.(beat);
  }
}

export function createCabinDialogueDirector(options) {
  return new CabinDialogueDirector(options);
}
