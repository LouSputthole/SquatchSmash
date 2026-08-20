/**
 * The saint card, burning in a closed fist.
 *
 * IN-440 is the beat the whole scene has been walking toward, and until now
 * nothing in the code did it: `runBurn()` put the card in the player's hand,
 * said the line, and left a printed rectangle sitting in a palm. The prop file
 * has claimed *"the card burns in the player's hand"* since the day it was
 * written.
 *
 * The rules come straight off the script and every one of them matters:
 *
 *   - **It catches, and he winces.** One sound, involuntary, not a scream.
 *   - **The hold is real for about a second and a half.** Release inside that
 *     window and the card drops. Lou picks it up off the boards, relights it
 *     from the candle and puts it back in the hand, without a word and without
 *     any change of expression. Nobody reacts. Nothing appears on screen. It
 *     can be done again as many times as it takes.
 *   - **After that window it cannot dead-end.** Lou's hand closes over the
 *     player's and the burn no longer depends on him. A player who cannot or
 *     will not hold the button is held.
 *   - **It burns down.** Then there is ash, and a burn, and blood, and he does
 *     not wipe it.
 *
 * Pure on purpose: no THREE, no audio, no DOM. It is a clock and a state
 * machine, so the awkward parts -- the release window, the relight loop, the
 * commit -- are unit-testable without a browser, and main.js reads `char` and
 * `flame` off it to drive what you actually see.
 */

/** How long the player has to keep hold of it before Lou takes over. Seconds. */
export const MIN_HOLD_S = 1.5;

/** How long the card takes to be consumed, once it is properly alight. */
export const BURN_DURATION_S = 4.2;

/** Lou picking it up, relighting it, and putting it back. Seconds. */
export const RELIGHT_S = 2.4;

/**
 * The moment Lou is still placing it, during which letting go cannot drop it.
 *
 * Without this the relight loop is absurd: Lou puts a lit card into a palm
 * whose button is -- of course -- not currently held, and it falls straight
 * back out of it on the very next frame, forever. A man setting something into
 * your hand has hold of it until you do.
 */
export const PLACE_S = 0.6;

/** How far the char gets before the card is too far gone to drop. 0..1. */
export const COMMIT_CHAR = 0.999;

export const CARD_BURN_STATES = Object.freeze([
  'unlit', 'lit', 'dropped', 'spent',
]);

export const CARD_BURN_EVENTS = Object.freeze([
  'catch', 'drop', 'relight', 'spent',
]);

export class CardBurn {
  constructor({
    minHold = MIN_HOLD_S,
    burnDuration = BURN_DURATION_S,
    relight = RELIGHT_S,
    place = PLACE_S,
  } = {}) {
    this.minHold = minHold;
    this.burnDuration = burnDuration;
    this.relight = relight;
    this.place = place;
    this.reset();
  }

  reset() {
    this.state = 'unlit';
    /** 0..1, how much of the face has gone. Never goes back down. */
    this.char = 0;
    /** Seconds the player has held it since the last light. */
    this.heldT = 0;
    /** Seconds since it hit the boards. */
    this.droppedT = 0;
    /** True once Lou's hand is over the top and the button stopped mattering. */
    this.committed = false;
    /** How many times it has been dropped and relit. Nobody reacts to this. */
    this.drops = 0;
    /** Seconds left of Lou's hand still being on it. */
    this.placingT = 0;
    return this;
  }

  /** Lou lights one corner off the candle. */
  ignite() {
    if (this.state === 'spent') return this;
    this.state = 'lit';
    this.heldT = 0;
    this.placingT = this.place;
    return this;
  }

  /** True while there is a flame on it to draw. */
  get flame() {
    return this.state === 'lit' && this.char < 1;
  }

  /** True once it is ash in a closed fist. */
  get spent() {
    return this.state === 'spent';
  }

  /**
   * Advance the burn.
   *
   * `holding` is the player's button. It stops being consulted the moment
   * `committed` goes true, which is the whole point of that flag: the beat
   * cannot dead-end on a player who will not hold it.
   *
   * Returns the events that happened this tick, oldest first, so the caller
   * can put a sound and a wince on them without inspecting state transitions.
   */
  update(dt, holding) {
    const events = [];
    if (!(dt > 0)) return events;

    if (this.state === 'dropped') {
      this.droppedT += dt;
      if (this.droppedT >= this.relight) {
        this.droppedT = 0;
        this.state = 'lit';
        this.heldT = 0;
        this.placingT = this.place;
        events.push('relight');
      }
      return events;
    }

    if (this.state !== 'lit') return events;

    if (this.placingT > 0) {
      /* Lou has not let go of it yet. Nothing the player does matters, and it
       * is not burning down in his palm either -- it is still in Lou's. */
      this.placingT = Math.max(0, this.placingT - dt);
      return events;
    }

    const wasAlight = this.char > 0;
    const keeping = this.committed || holding;

    if (!keeping) {
      /* Inside the window, letting go drops it. Lou will pick it up. */
      this.state = 'dropped';
      this.droppedT = 0;
      this.drops += 1;
      events.push('drop');
      return events;
    }

    this.heldT += dt;
    this.char = Math.min(1, this.char + dt / this.burnDuration);
    if (!wasAlight && this.char > 0) events.push('catch');

    if (!this.committed && this.heldT >= this.minHold) {
      /* Lou's hand closes over the player's. From here it finishes on its
       * own, and releasing the button does nothing at all. */
      this.committed = true;
    }

    if (this.char >= COMMIT_CHAR) {
      this.char = 1;
      this.state = 'spent';
      events.push('spent');
    }
    return events;
  }
}
