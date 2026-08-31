/**
 * THE CABIN CHAPTER RUNTIME, HEADLESS.
 *
 * `CabinChapterRuntime` is the only thing in the Act-One cabin that knows when
 * a telephone is allowed to ring, so any test that wants to prove a call can
 * actually reach the player has to build one. That takes a phone, a dialogue
 * director, an audio engine and an execution choice, and two files now want
 * exactly the same four -- `countryside-cabin-chapter-runtime.test.mjs`, which
 * exercises the runtime itself, and `campaign-flow-consistency.test.mjs`,
 * which asks the narrower question of whether the phase the panel is showing
 * is one the phone can get him out of.
 *
 * docs/REUSE-FIRST.md: one implementation, imported twice, rather than a
 * second copy that drifts the first time the runtime's constructor changes.
 *
 * The phone is a double rather than `src/core/phone.js` because the real one
 * owns a DOM overlay and a ringtone; everything the runtime asks of it is
 * `ring`, `startOutgoing`, `hangUp` and the two callbacks it re-wraps.
 */
import { createCountrysideCabinStory } from '../../src/core/countryside-cabin-story.js';
import { CabinChapterRuntime } from '../../src/cabin/chapter-runtime.js';
import { CabinDialogueDirector } from '../../src/cabin/dialogue-director.js';
import { CabinExecutionChoice } from '../../src/cabin/execution-choice.js';

export class PhoneDouble {
  constructor() {
    this.call = null;
    this.rings = [];
    this.outgoing = [];
    this.onCallState = null;
    this.onAnswered = null;
  }

  ring(definition) {
    if (this.call) return false;
    this.call = { def: definition, state: 'ringing' };
    this.rings.push(definition.id);
    return true;
  }

  startOutgoing(definition) {
    if (this.call) return false;
    this.call = { def: definition, state: 'talking', direction: 'outgoing' };
    this.outgoing.push(definition.id);
    this.onCallState?.(true, definition);
    this.onAnswered?.(definition);
    return true;
  }

  answer() {
    if (this.call?.state !== 'ringing') return false;
    this.call.state = 'talking';
    this.onCallState?.(true, this.call.def);
    this.onAnswered?.(this.call.def);
    return true;
  }

  finish() {
    if (this.call?.state !== 'talking') return false;
    const definition = this.call.def;
    this.call = null;
    this.onCallState?.(false, definition);
    return true;
  }

  hangUp({ force = false } = {}) {
    if (!this.call) return false;
    const { def, state } = this.call;
    if (state === 'talking' && def.allowHangup === false && !force) return false;
    this.call = null;
    if (state === 'talking') this.onCallState?.(false, def);
    return true;
  }
}

/** Enough of an AudioEngine for the dialogue director to time its lines. */
export function audioDouble() {
  return {
    manifest: { sfx: [] },
    sampleDuration() { return 0.01; },
    hasSample() { return false; },
    play() { return null; },
    hold() {},
  };
}

/** A runtime wired to a live campaign, with every collaborator to hand. */
export function cabinRuntimeHarness(campaign, { callbacks = {}, hud = null } = {}) {
  const story = createCountrysideCabinStory({ campaign });
  const phone = new PhoneDouble();
  const dialogue = new CabinDialogueDirector({ audio: audioDouble() });
  const choice = new CabinExecutionChoice();
  const runtime = new CabinChapterRuntime({ story, phone, dialogue, choice, callbacks, hud });
  return { campaign, story, phone, dialogue, choice, runtime };
}
