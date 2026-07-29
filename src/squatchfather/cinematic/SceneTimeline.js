// Tiny deferred-callback timeline. The shooting sequence and the exit beats
// are written as "at t seconds, do this" rather than as nested timeouts, so a
// checkpoint restart can wipe everything pending in one call.

export class SceneTimeline {
  constructor() {
    this.events = [];
    this.t = 0;
  }

  // Run fn after `delay` seconds of scene time.
  after(delay, fn) {
    this.events.push({ at: this.t + delay, fn });
    return this;
  }

  clear() {
    this.events.length = 0;
  }

  update(dt) {
    this.t += dt;
    if (!this.events.length) return;
    const due = this.events.filter((e) => e.at <= this.t);
    if (!due.length) return;
    this.events = this.events.filter((e) => e.at > this.t);
    for (const e of due) e.fn();
  }
}
