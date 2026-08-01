import { HEIST_STATES, MISSION_START_STATE, PHASE_FOR_STATE } from './config.js';

const ORDER = new Map(HEIST_STATES.filter((state) => state !== 'FAILED')
  .map((state, index) => [state, index]));

export class HeistMissionMachine {
  constructor({ start = MISSION_START_STATE, onTransition = null } = {}) {
    if (!ORDER.has(start)) throw new Error(`Unknown heist start state ${start}`);
    this.state = start;
    this.previous = null;
    this.failure = null;
    this.history = [start];
    this.onTransition = onTransition;
  }

  canAdvance(to) {
    return ORDER.has(to) && ORDER.get(to) === ORDER.get(this.state) + 1;
  }

  advance(to, guard = true) {
    if (!guard) return false;
    if (!this.canAdvance(to)) return false;
    const from = this.state;
    this.previous = from;
    this.state = to;
    this.history.push(to);
    this.onTransition?.({ from, to, phase: PHASE_FOR_STATE[to] });
    return true;
  }

  fail(reason, detail = null) {
    if (this.state === 'FAILED' || this.state === 'SCENE_COMPLETE') return false;
    const from = this.state;
    this.previous = from;
    this.state = 'FAILED';
    this.failure = { reason, detail, from };
    this.history.push('FAILED');
    this.onTransition?.({ from, to: 'FAILED', phase: PHASE_FOR_STATE.FAILED });
    return true;
  }

  restore(state) {
    if (!ORDER.has(state)) throw new Error(`Unknown heist restore state ${state}`);
    const from = this.state;
    this.previous = from;
    this.state = state;
    this.failure = null;
    this.history.push(state);
    this.onTransition?.({ from, to: state, restored: true, phase: PHASE_FOR_STATE[state] });
  }
}
