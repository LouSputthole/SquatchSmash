/**
 * The Silver Case — mission state machine.
 *
 * A small, generic FSM engine, modeled on the shape of
 * src/squatchfather/state/SquatchfatherStateMachine.js: states are plain
 * `{ enter?, update?(dt), exit? }` objects keyed by name, `go(name)` only
 * *requests* a transition (a state's own update() can safely call go() mid
 * frame without re-entering itself or corrupting the current frame), and the
 * pending name is applied once real transition happens.
 *
 * One deliberate difference from Squatchfather's own machine: here
 * `update(dt)` runs the CURRENT state's update() first, and only applies any
 * pending transition afterward — so a newly-entered state's own enter() runs
 * at the tail of the frame that requested it, and that state's first real
 * update(dt) call happens on the NEXT frame, never the same one. This is the
 * safer of the two orderings (no state ever receives a partial-dt update()
 * call on the very frame it was entered) and is what main.js's beat wiring
 * assumes throughout.
 */

/** The mission's beats, in authored order. Frozen so nothing can mutate it. */
export const STATE_NAMES = Object.freeze([
  'MENU',
  'CAR_RIDE',
  'ARRIVE_HALLWAY',
  'KNOCK',
  'ENTER_APARTMENT',
  'ESTABLISH_CONTROL',
  'CASE_REVEAL',
  'COUCH_SHOOTING',
  'LOU_QUESTION',
  'SQUATCH_PRAYER',
  /** The man in the chair — the player's shot and Ape's, together. */
  'CHAIR_SHOOTING',
  'BATHROOM_AMBUSH',
  'AFTERMATH',
  /** Only entered if the player picks "kill him" at the aftermath choice. */
  'EXECUTE_WINSTON',
  'PICK_UP_CASE',
  'EXIT',
  'SCENE_COMPLETE',
  'FAILED',
]);

/** name -> name enum, e.g. `S.CAR_RIDE === 'CAR_RIDE'` — derived from STATE_NAMES
 * so the two can never drift apart. */
export const S = Object.freeze(
  Object.fromEntries(STATE_NAMES.map((name) => [name, name])),
);

/**
 * The one checkpoint in the mission. A failure at BATHROOM_AMBUSH (the player
 * too slow against Pruitt) restarts from the start of the prayer beat, not
 * from the top of the mission — punishing enough to matter, not so punishing
 * it repeats the couch shooting or the Lou question. It does replay the man in
 * the chair, which is the beat immediately before the ambush and the one that
 * puts the gun back in the player's hands pointing the right way.
 */
export const CHECKPOINT = S.SQUATCH_PRAYER;

export class SilverCaseStateMachine {
  /**
   * @param {Record<string, {enter?: Function, update?: (dt:number)=>void, exit?: Function}>} states
   * @param {(name: string, prev: string|null) => void} [onChange] fired whenever a transition completes
   */
  constructor(states, onChange = null) {
    this.states = states;
    this.onChange = onChange;
    this.current = null;
    this.name = null;
    this.time = 0;
    this.pending = null;
  }

  /** Enter `name` immediately — used exactly once, to boot the machine. */
  start(name) {
    this.#enter(name);
  }

  /** Request a transition. Deferred: applied at the tail of this update(). */
  go(name) {
    if (name === this.name) return;
    this.pending = name;
  }

  /** True if the machine's current beat is any of `names`. */
  is(...names) {
    return names.includes(this.name);
  }

  #enter(name) {
    const next = this.states[name];
    if (!next) throw new Error(`unknown silvercase state: ${name}`);
    if (this.current && this.current.exit) this.current.exit();
    const prev = this.name;
    this.current = next;
    this.name = name;
    this.time = 0;
    if (this.onChange) this.onChange(name, prev);
    if (next.enter) next.enter();
  }

  update(dt) {
    if (!this.current) return;
    this.time += dt;
    if (this.current.update) this.current.update(dt);
    if (this.pending) {
      const name = this.pending;
      this.pending = null;
      this.#enter(name);
    }
  }
}
