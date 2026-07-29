// Scene flow, exactly as storyboarded:
//
// START_EXTERIOR → ENTER_RESTAURANT → APPROACH_TABLE → SIT_DOWN → OPENING_DIALOGUE
// → EXCUSE_TO_BATHROOM → WALK_TO_BATHROOM → SEARCH_TOILET → RETRIEVE_WEAPON
// → RETURN_TO_TABLE → FINAL_DIALOGUE → TRAIN_APPROACH → DRAW_WEAPON → SHOOT_SAL
// → SHOOT_MCCLAWSKY → DROP_WEAPON → WALK_TO_EXIT → ENTER_CAR → SCENE_COMPLETE
//
// Each state is { enter?, update?(dt), exit? }. The machine only owns
// sequencing; everything visual lives in the systems the states drive.

export const S = {
  START_EXTERIOR: 'START_EXTERIOR',
  ENTER_RESTAURANT: 'ENTER_RESTAURANT',
  APPROACH_TABLE: 'APPROACH_TABLE',
  SIT_DOWN: 'SIT_DOWN',
  OPENING_DIALOGUE: 'OPENING_DIALOGUE',
  EXCUSE_TO_BATHROOM: 'EXCUSE_TO_BATHROOM',
  WALK_TO_BATHROOM: 'WALK_TO_BATHROOM',
  SEARCH_TOILET: 'SEARCH_TOILET',
  RETRIEVE_WEAPON: 'RETRIEVE_WEAPON',
  RETURN_TO_TABLE: 'RETURN_TO_TABLE',
  FINAL_DIALOGUE: 'FINAL_DIALOGUE',
  TRAIN_APPROACH: 'TRAIN_APPROACH',
  DRAW_WEAPON: 'DRAW_WEAPON',
  SHOOT_SAL: 'SHOOT_SAL',
  SHOOT_MCCLAWSKY: 'SHOOT_MCCLAWSKY',
  DROP_WEAPON: 'DROP_WEAPON',
  WALK_TO_EXIT: 'WALK_TO_EXIT',
  ENTER_CAR: 'ENTER_CAR',
  SCENE_COMPLETE: 'SCENE_COMPLETE',
  FAILED: 'FAILED',
};

// The one checkpoint in the scene — a botched draw restarts here, not at the door.
export const CHECKPOINT = S.RETURN_TO_TABLE;

export class SquatchfatherStateMachine {
  constructor(states, onChange = null) {
    this.states = states;
    this.onChange = onChange;
    this.current = null;
    this.name = null;
    this.time = 0;
    this.pending = null;
  }

  start(name) {
    this.#enter(name);
  }

  // Deferred so a state can call go() from inside its own update().
  go(name) {
    if (name === this.name) return;
    this.pending = name;
  }

  is(...names) {
    return names.includes(this.name);
  }

  // True once the scene has reached `name` (states are strictly ordered).
  reached(name) {
    const order = Object.keys(S);
    return order.indexOf(this.name) >= order.indexOf(name);
  }

  #enter(name) {
    const next = this.states[name];
    if (!next) throw new Error(`unknown scene state: ${name}`);
    if (this.current && this.current.exit) this.current.exit();
    const prev = this.name;
    this.current = next;
    this.name = name;
    this.time = 0;
    if (this.onChange) this.onChange(name, prev);
    if (next.enter) next.enter();
  }

  update(dt) {
    if (this.pending) {
      const name = this.pending;
      this.pending = null;
      this.#enter(name);
    }
    if (!this.current) return;
    this.time += dt;
    if (this.current.update) this.current.update(dt);
  }
}
