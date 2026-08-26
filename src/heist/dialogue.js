import { SPEECH_MIX_CLOSE, SPEECH_MIX_INDOORS } from '../core/dialogue.js';

export const DIALOGUE_PRIORITY = Object.freeze({
  BANTER: 1,
  BARK: 2,
  WARNING: 3,
  INJURY: 4,
  OBJECTIVE: 5,
  TACTICAL: 6,
});

/**
 * Which mix a line gets: the room, or the inside of the escape car.
 *
 * ## The conversation nobody ever heard
 *
 * Owner, playtest 2026-08-26: *"the crew conversation in the escape car never
 * plays"*. Every line of it is authored, recorded, and dispatched — the drive
 * pushes six of them, one per junction, and a browser run confirms they reach
 * the bus. What they do not reach is the player's ears.
 *
 * The crew do not ride in the car. `HEIST_SQUAD_FORMATIONS.driving` stands all
 * five of them in the swap yard at x 16–24, z -649 to -653, for the whole
 * escape, and `dialogue.onStart` hands the speaker's rig to `speak()` as the
 * position of the voice. The listener is the chase camera, which starts the
 * drive 700 m away at the garage. Measured, car to Rippinflow's rig, at the
 * point each line is pushed:
 *
 *   rippin_drive        838 m      rippin_market_left  898 m
 *   rippin_tower_right  790 m      snow_roadblock      478 m
 *   rippin_canal        419 m      rippin_swap_ahead   401 m
 *
 * `SPEECH_MIX_INDOORS` is an inverse-distance panner with `ref` 1.8, and the
 * inverse model ignores `maxDistance`, so the gain is 1.8 / d: between 0.0020
 * and 0.0045 — 47 to 54 dB down, under an engine loop, a tyre loop and a siren
 * bed. The line played. Nobody could possibly hear it.
 *
 * ## The fix, and why it forks from the shared mix
 *
 * A voice in the car with you is not a voice in the room: it is the same case
 * `SPEECH_MIX_CLOSE` already exists for — a phone, a radio, somebody at your
 * shoulder — a line that is not in the world and must not be panned. Giving
 * the drive a mix of its own would be a second speech system; this picks a
 * different member of the shared set, which is the shape `docs/REUSE-FIRST.md`
 * asks for.
 *
 * The alternative — actually seating the crew in the escape car and moving
 * five rigs along the route every frame — is a staging change, not a mix
 * change, and it would put five men inside a car body for the geometry gate to
 * find. When the crew are in a room, they are mixed as being in a room.
 *
 * @param {object} [context]
 * @param {boolean} [context.driving] the player is at the wheel
 * @param {object|null} [context.figure] the rig the line belongs to, if any
 * @returns {object} one of the shared `SPEECH_MIX_*` constants
 */
export function heistSpeechMix({ driving = false, figure = null } = {}) {
  if (driving) return SPEECH_MIX_CLOSE;
  return figure ? SPEECH_MIX_INDOORS : SPEECH_MIX_CLOSE;
}

export class DialogueArbiter {
  constructor({ maxQueue = 4, onStart = null, onInterrupt = null } = {}) {
    this.maxQueue = maxQueue;
    this.onStart = onStart;
    this.onInterrupt = onInterrupt;
    this.current = null;
    this.queue = [];
    this.state = null;
  }

  setState(state) {
    this.state = state;
    this.queue = this.queue.filter((line) => !line.states || line.states.includes(state));
    if (this.current?.states && !this.current.states.includes(state)) this.finish('stale');
  }

  push(line) {
    const entry = {
      interruptible: true,
      priority: DIALOGUE_PRIORITY.BARK,
      expiresAt: Infinity,
      ...line,
    };
    if (entry.states && !entry.states.includes(this.state)) return false;
    if (!this.current) { this.#start(entry); return true; }
    if (entry.priority > this.current.priority && this.current.interruptible) {
      this.onInterrupt?.(this.current, entry);
      this.#start(entry);
      return true;
    }
    this.queue.push(entry);
    this.queue.sort((a, b) => b.priority - a.priority);
    if (this.queue.length > this.maxQueue) this.queue.length = this.maxQueue;
    return true;
  }

  /**
   * Deliver a mission command even when ambient chatter already owns the bus.
   * Commands are intentionally state-independent once triggered: the player
   * cannot erase Lou's radio order by completing the next interaction before
   * the current bark finishes.
   */
  pushCommand(line) {
    return this.push({
      ...line,
      priority: DIALOGUE_PRIORITY.TACTICAL,
      interruptible: false,
      states: null,
    });
  }

  update(now) {
    this.queue = this.queue.filter((line) => line.expiresAt > now
      && (!line.states || line.states.includes(this.state)));
  }

  finish(reason = 'complete') {
    const finished = this.current;
    this.current = null;
    const next = this.queue.shift();
    if (next) this.#start(next);
    return { finished, reason };
  }

  #start(line) { this.current = line; this.onStart?.(line); }

  capture() { return { current: this.current, queue: this.queue, state: this.state }; }
  restore(s = {}) { this.current = s.current ?? null; this.queue = [...(s.queue ?? [])]; this.state = s.state ?? null; }
  reset() { this.current = null; this.queue = []; }
}
