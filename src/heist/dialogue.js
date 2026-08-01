export const DIALOGUE_PRIORITY = Object.freeze({
  BANTER: 1,
  BARK: 2,
  WARNING: 3,
  INJURY: 4,
  OBJECTIVE: 5,
  TACTICAL: 6,
});

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
