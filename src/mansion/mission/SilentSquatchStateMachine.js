/**
 * PROJECT SILENT SQUATCH — the mission's beats.
 *
 * A small generic FSM plus the authored beat list, modelled directly on
 * src/silvercase/state/SilverCaseStateMachine.js (same `go()`-defers-the-
 * transition semantics, same "the current state's update() runs before any
 * pending transition is applied" ordering, so a state can safely request the
 * next one from inside its own update).
 *
 * The spec (docs/MISSION-SILENT-SQUATCH.md) is written as eleven beats. This
 * machine has more states than that, because several of the spec's beats
 * contain two separate things the PLAYER has to do — beat 2 is "watch Lou open
 * it" and then "pick it back up", beat 8 is "lock the door" and then "kill the
 * man standing next to you". Every state carries the spec beat it belongs to,
 * so the mission can report progress in the spec's own numbering and a
 * verifier can assert the eleven beats were reached in order.
 */

/**
 * `{ [state]: beat }` — every state in authored order, with the beat of the
 * spec it serves. Object key order is the mission's canonical order and the
 * order tests/silent-squatch-mission.test.mjs asserts.
 */
export const BEAT_OF = Object.freeze({
  /** Beat 1 — arrival. The case is already in his hands, from The Silver Case. */
  ARRIVAL: 1,
  /** Beat 2 — Lou's office: carry it in, put it on the desk. */
  LOU_OFFICE: 2,
  /** Beat 2 — Lou turns it to face him and opens it. */
  LOU_OPENS_CASE: 2,
  /** Beat 2 — he slides it back; the player picks it up again himself. */
  TAKE_CASE_BACK: 2,
  /** Beat 3 — the wine cellar, the bust, and the switch under it. */
  HIDDEN_ENTRANCE: 3,
  /** Beat 3 — concrete, pipes, drains, and no music. */
  STAIRWELL: 3,
  /** Beat 4 — the interrogation area, Irish, and xXx. */
  INTERROGATION: 4,
  /** Beat 5 — the observation area, the glass, and DeathMegatron. */
  OBSERVATION: 5,
  /** Beat 6 — the case goes on the transfer table and through the drawer. */
  DELIVERY: 6,
  /** Beat 6 — six people building it, in front of him. */
  BUILD: 6,
  /** Beat 7 — the core locks and every monitor turns purple. */
  COMPLETION: 7,
  /** Beat 7 — Aubbie comes out through the glass door. */
  AUBBIE_OUT: 7,
  /** Beat 8 — "Lock the lab." */
  LOCK_ORDER: 8,
  /** Beat 8 — the keypad. 6969. */
  LOCK_THE_LAB: 8,
  /** Beat 8 — the execution, in the observation area, in front of the glass. */
  EXECUTION: 8,
  /** Beat 9 — five people finding out what the glass is for. */
  REACTION: 9,
  /** Beat 10 — Booski lifts the cover and does not pull it. */
  SILENT_NIGHT_ORDER: 10,
  /** Beat 10 — the player pulls it. */
  SILENT_NIGHT: 10,
  /** Beat 10 — the gas, in the spec's seven stages. */
  GASSING: 10,
  /** Beat 10 — LIFE SIGNS: 0. "Efficient." */
  AFTERMATH: 10,
  /** Beat 11 — Snow on the intercom. */
  SNOW_CALL: 11,
  /** Beat 11 — past xXx, up, and the wall closes. */
  EXIT: 11,
  /** MISSION COMPLETE: SILENT SQUATCH. */
  COMPLETE: 11,
});

/** Beat names in authored order. */
export const STATE_NAMES = Object.freeze(Object.keys(BEAT_OF));

/** name -> name enum, derived from STATE_NAMES so the two cannot drift. */
export const S = Object.freeze(
  Object.fromEntries(STATE_NAMES.map((name) => [name, name])),
);

export class SilentSquatchStateMachine {
  /**
   * @param {Record<string, {enter?: Function, update?: (dt:number)=>void, exit?: Function}>} states
   * @param {(name: string, prev: string|null) => void} [onChange]
   */
  constructor(states, onChange = null) {
    this.states = states;
    this.onChange = onChange;
    this.current = null;
    this.name = null;
    this.time = 0;
    this.pending = null;
    /** Every state entered, in order. The mission's own progress record. */
    this.history = [];
  }

  /** Enter `name` immediately — used exactly once, to boot the machine. */
  start(name) {
    this.#enter(name);
  }

  /** Request a transition; applied at the tail of this update(). */
  go(name) {
    if (name === this.name) return;
    this.pending = name;
  }

  is(...names) {
    return names.includes(this.name);
  }

  /** The spec beat number of the current state, 1..11. */
  get beat() {
    return BEAT_OF[this.name] ?? 0;
  }

  #enter(name) {
    const next = this.states[name];
    if (!next) throw new Error(`unknown Silent Squatch state: ${name}`);
    if (this.current?.exit) this.current.exit();
    const prev = this.name;
    this.current = next;
    this.name = name;
    this.time = 0;
    this.history.push(name);
    this.onChange?.(name, prev);
    next.enter?.();
  }

  update(dt) {
    if (!this.current) return;
    this.time += dt;
    this.current.update?.(dt);
    if (this.pending) {
      const name = this.pending;
      this.pending = null;
      this.#enter(name);
    }
  }
}
