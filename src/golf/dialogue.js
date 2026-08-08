/**
 * Conversation on a golf course, without taking the game off the player.
 *
 * Same rule as the Bing and the Silver Room: you never lose control because
 * somebody important started talking. Lou can say his piece while you line up
 * a putt, walk to the bunker, look at the clubhouse or change club. Nothing is
 * modal, nothing pauses, and walking away ends it the way walking away ends a
 * conversation.
 *
 * Two systems, deliberately separate:
 *
 *   CueQueue     one voice at a time, ordered, priority-aware. Everything
 *                anybody says goes through here, so two people can never talk
 *                over each other and a bark can never step on the line the
 *                scene is built around.
 *
 *   Dialogue     the Bing's node tree, reused unchanged, for the three moments
 *                where the player answers rather than listens.
 *
 * The one input rule that matters: number keys pick a reply when replies are
 * on screen and pick a club when they are not. Never both, never ambiguous.
 */

import { Dialogue } from '../bing/dialogue.js';
import { CUES, SEQUENCES, PRIORITY } from './script.js';

const RANK = { [PRIORITY.STORY]: 3, [PRIORITY.REACTION]: 2, [PRIORITY.BANTER]: 1 };

/** Reading time when there is no recorded clip to time against. */
function readingTime(text) {
  return Math.max(1.5, Math.min(7, text.length / 15.5));
}

export class CueQueue {
  /**
   * @param {object} hooks
   *   say(cue, seconds)        put it on screen and make the speaker's mouth move
   *   clear()                  take the subtitle down
   *   clipLength(cueId)        recorded duration in seconds, or null
   *   speakerAt(speakerId)     { x, z } for range checks, or null
   *   listenerAt()             the player, for range checks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.queue = [];
    this.current = null;
    this.timer = 0;
    this.hold = 0;
    this.played = new Set();
    this.lastAt = new Map();
    this.clock = 0;
    /* Set while a story beat owns the floor. Banter checks this and stays
     * quiet rather than queueing up behind it, because six ambient lines
     * arriving after the important one is worse than never hearing them. */
    this.suppressed = false;
  }

  /** Fire one cue by id. Returns false if it was declined. */
  play(id, { force = false, orderedSequence = false } = {}) {
    const cue = CUES[id];
    if (!cue) {
      // A missing cue is a script bug, not a runtime one. Say so, do not throw.
      console.warn(`Silver Pines: no cue "${id}"`);
      return false;
    }
    if (cue.once && this.played.has(id)) return false;

    if (!force) {
      if (cue.cooldown > 0) {
        const last = this.lastAt.get(id);
        if (last !== undefined && this.clock - last < cue.cooldown) return false;
      }
      /* Ambient chatter stands down while the scene is saying something. This
       * is the whole reason the priority field exists. */
      if (cue.priority === PRIORITY.BANTER
        && (this.suppressed || (!orderedSequence && this.busy))) return false;
      if (cue.when && !cue.when()) return false;
    }

    this.queue.push(cue);
    /* Standalone cues are priority-sorted but never reorder equals. An authored
     * sequence that claimed an empty floor already owns its exact order. */
    if (!orderedSequence) this.queue.sort((a, b) => RANK[b.priority] - RANK[a.priority]);
    return true;
  }

  /** Fire a named sequence, or a raw list of cue ids, in order. */
  playSequence(nameOrIds, opts = {}) {
    const ids = Array.isArray(nameOrIds) ? nameOrIds : SEQUENCES[nameOrIds];
    if (!ids) {
      console.warn(`Silver Pines: no sequence "${nameOrIds}"`);
      return false;
    }
    /* A complete authored conversation that begins on an empty floor owns its
     * exact order, including lower-priority banter. Standalone ambient lines
     * still yield to a busy or suppressed floor, and play() still applies the
     * once, cooldown, and `when` eligibility checks to every sequence member. */
    const orderedSequence = !this.busy && !this.suppressed;
    let any = false;
    for (const id of ids) any = this.play(id, { ...opts, orderedSequence }) || any;
    return any;
  }

  /** How long a sequence will take, for a caller that needs to wait it out. */
  lengthOf(nameOrIds) {
    const ids = Array.isArray(nameOrIds) ? nameOrIds : SEQUENCES[nameOrIds] ?? [];
    let total = 0;
    for (const id of ids) {
      const cue = CUES[id];
      if (!cue) continue;
      total += (this.hooks.clipLength?.(id) ?? readingTime(cue.text)) + cue.hold + 0.25;
    }
    return total;
  }

  get busy() {
    return this.current !== null || this.queue.length > 0;
  }

  /** True while a line that must not be talked over is sounding. */
  get locked() {
    return this.current !== null && this.current.interruptible === false;
  }

  /**
   * Stop everything that can be stopped.
   *
   * Used when the player walks out of range, and when a story beat needs the
   * floor. An uninterruptible line survives — that is what the flag is for.
   */
  interrupt(reason = 'interrupted') {
    this.queue = this.queue.filter((c) => c.interruptible === false);
    if (this.current && this.current.interruptible !== false) {
      this.current = null;
      this.timer = 0;
      this.hold = 0;
      this.hooks.clear?.(reason);
    }
  }

  /** Silence the ambient layer entirely, for the length of a story beat. */
  suppressBanter(on) {
    this.suppressed = on;
    if (on) {
      this.queue = this.queue.filter((c) => c.priority !== PRIORITY.BANTER);
    }
  }

  update(dt) {
    this.clock += dt;

    if (this.current) {
      this.timer -= dt;
      if (this.timer > 0) return;
      if (this.hold > 0) {
        /* The authored silence after a line. It is a real part of the writing:
         * `lou.invited_you` is two sentences and three seconds of nobody
         * saying anything, and the third is doing as much work as the first
         * two. Nothing may be spoken during it. */
        this.hold -= dt;
        this.hooks.clear?.('hold');
        return;
      }
      this.current = null;
    }

    if (!this.queue.length) return;

    const cue = this.queue.shift();
    if (cue.once) this.played.add(cue.id);
    this.lastAt.set(cue.id, this.clock);

    /* Recorded audio owns the timing when a clip exists; subtitle reading time
     * is the fallback. Neither is guessed at from the other. */
    const spoken = this.hooks.clipLength?.(cue.id) ?? readingTime(cue.text);
    this.current = cue;
    this.timer = spoken;
    this.hold = cue.hold;
    this.hooks.say?.(cue, spoken);
  }

  /** Has this line been heard? Drives the mission's save flags. */
  heard(id) {
    return this.played.has(id);
  }

  reset() {
    this.queue = [];
    this.current = null;
    this.timer = 0;
    this.hold = 0;
    this.played.clear();
    this.lastAt.clear();
    this.suppressed = false;
    this.hooks.clear?.('reset');
  }
}

/**
 * Which input the number keys belong to right now.
 *
 * The single most important function in this file. `1` is the driver and `1`
 * is also the first reply, and a player who takes a driver out because he
 * meant to say "You needed a fourth" has been failed by the game. Replies win
 * whenever replies are on screen, and there is no third case.
 */
export function numberKeyOwner(dialogue) {
  return dialogue?.active && dialogue.options.length > 0 ? 'dialogue' : 'clubs';
}

export { Dialogue };
