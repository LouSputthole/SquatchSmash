const VALID_STATES = new Set(['idle', 'armed', 'neutralized', 'expired']);

function seconds(value) {
  return Math.round(Math.max(0, value) * 1000) / 1000;
}

/**
 * The bathroom-ambush timer — Pruitt's reaction window. Modeled directly on
 * src/heist/bank-threat.js's `BankGuardThreat` (idle -> armed -> resolved),
 * with names matched to this mission's own beat instead of the bank's.
 *
 * Pure, presentation-free state machine: no THREE, no DOM, no scene refs.
 * main.js (a later phase) reads start()/update()/resolve()'s return values
 * to drive Pruitt's reveal(), the HUD countdown, and the damage()/kill()
 * calls that follow — none of that belongs here.
 */
export class ReactionWindow {
  constructor({ windowSeconds = 2.2 } = {}) {
    this.baseWindowSeconds = Math.max(0.2, Number(windowSeconds) || 2.2);
    this.reset();
  }

  /**
   * idle -> armed. `readinessBonus` (stored read-only-by-convention on
   * `this.readinessBonus`) is set true by main.js when the player has
   * already clocked the environmental tells — the four glasses / the
   * bathroom door ajar (see script.js's `bathroomFastWithClues` line) —
   * and gets a slightly friendlier window as a result: +0.3s. That number
   * is this file's own judgment call, not derived from anything upstream;
   * tune it freely if the beat plays too generous or too cruel.
   */
  start({ readinessBonus = false } = {}) {
    if (this.state !== 'idle') return false;
    this.readinessBonus = Boolean(readinessBonus);
    this.windowSeconds = this.baseWindowSeconds + (this.readinessBonus ? 0.3 : 0);
    this.state = 'armed';
    this.elapsed = 0;
    return true;
  }

  /**
   * Only advances while "armed". Once `elapsed >= windowSeconds` this
   * transitions to "expired" and returns `{event: "expired"}` exactly once
   * — every other call (including every call after that) returns null.
   */
  update(dt) {
    if (this.state !== 'armed') return null;
    this.elapsed = Math.min(this.windowSeconds, this.elapsed + Math.max(0, Number(dt) || 0));
    if (this.elapsed < this.windowSeconds) return null;
    this.state = 'expired';
    return { event: 'expired' };
  }

  /**
   * The player shot back in time. Only succeeds while still "armed" —
   * resolving after "expired" or "neutralized" (or before start()) fails
   * cleanly instead of throwing, so main.js can call this speculatively.
   */
  resolve(source) {
    void source; // accepted per the brief's signature; not branched on
    if (this.state !== 'armed') {
      return { ok: false, reason: this.state === 'idle' ? 'not_armed' : 'already_resolved' };
    }
    const remaining = seconds(this.windowSeconds - this.elapsed);
    this.state = 'neutralized';
    return { ok: true, event: 'neutralized', remaining };
  }

  reset() {
    this.state = 'idle';
    this.elapsed = 0;
    this.windowSeconds = this.baseWindowSeconds;
    this.readinessBonus = false;
  }

  snapshot() {
    return {
      state: this.state,
      elapsed: seconds(this.elapsed),
      windowSeconds: seconds(this.windowSeconds),
      readinessBonus: this.readinessBonus,
    };
  }

  restore(snap = {}) {
    this.state = VALID_STATES.has(snap.state) ? snap.state : 'idle';
    this.windowSeconds = Math.max(0.2, Number(snap.windowSeconds) || this.baseWindowSeconds);
    this.elapsed = Math.max(0, Math.min(this.windowSeconds, Number(snap.elapsed) || 0));
    this.readinessBonus = Boolean(snap.readinessBonus);
  }
}
