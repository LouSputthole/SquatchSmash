const VALID_STATES = new Set(['idle', 'drawing', 'neutralized', 'fired']);

function seconds(value) {
  return Math.round(Math.max(0, value) * 1000) / 1000;
}

/** Deterministic reaction-window state for the armed lobby guard. */
export class BankGuardThreat {
  constructor({ windowSeconds = 2.75 } = {}) {
    this.windowSeconds = Math.max(0.5, Number(windowSeconds) || 2.75);
    this.reset();
  }

  start() {
    if (this.state !== 'idle') return false;
    this.state = 'drawing';
    this.elapsed = 0;
    return true;
  }

  update(dt) {
    if (this.state !== 'drawing') return { event: null };
    this.elapsed = Math.min(this.windowSeconds, this.elapsed + Math.max(0, Number(dt) || 0));
    if (this.elapsed < this.windowSeconds) return { event: null };
    this.state = 'fired';
    return { event: 'fired', victim: 'lobby_civilian' };
  }

  resolve({ source } = {}) {
    if (this.state !== 'drawing' || source !== 'player_shot') {
      return { ok: false, reason: this.state !== 'drawing' ? 'inactive' : 'shot_required' };
    }
    this.state = 'neutralized';
    return { ok: true, event: 'neutralized', remaining: seconds(this.windowSeconds - this.elapsed) };
  }

  reset() {
    this.state = 'idle';
    this.elapsed = 0;
  }

  capture() { return this.snapshot(); }

  restore(snapshot = {}) {
    this.state = VALID_STATES.has(snapshot.state) ? snapshot.state : 'idle';
    this.elapsed = Math.max(0, Math.min(this.windowSeconds, Number(snapshot.elapsed) || 0));
  }

  snapshot() {
    const remaining = seconds(this.windowSeconds - this.elapsed);
    return {
      state: this.state,
      elapsed: seconds(this.elapsed),
      remaining,
      progress: this.state === 'drawing' ? Math.min(1, this.elapsed / this.windowSeconds) : 0,
    };
  }
}
