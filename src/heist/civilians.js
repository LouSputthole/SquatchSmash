const STATES = new Set([
  'ambient', 'startled', 'freeze', 'complying', 'kneeling', 'prone',
  'hiding', 'crawling', 'protecting', 'alarm_attempt', 'panicking', 'inactive',
]);

export class CivilianController {
  constructor({ id, nerve = 0.5, anchor = null }) {
    this.id = id;
    this.nerve = Math.max(0, Math.min(1, nerve));
    this.anchor = anchor;
    this.state = 'ambient';
    this.panic = 0;
    this.compliance = 0;
  }

  command({ aim = 0, distance = 10, groupControl = 0, gunfire = 0 } = {}) {
    const proximity = 1 - Math.max(0, Math.min(1, distance / 12));
    this.panic = Math.min(1, this.panic + gunfire * 0.35 + proximity * 0.18);
    this.compliance = Math.min(1, this.compliance
      + Math.max(0, aim) * 0.34 + groupControl * 0.42 + proximity * 0.3
      - this.nerve * 0.12);
    if (this.compliance >= 0.7) this.state = 'prone';
    else if (this.compliance >= 0.45) this.state = 'kneeling';
    else if (this.panic >= 0.75) this.state = 'hiding';
    else this.state = 'freeze';
    return this.state;
  }

  setState(state) { if (!STATES.has(state)) return false; this.state = state; return true; }
  capture() { return { id: this.id, state: this.state, panic: this.panic, compliance: this.compliance, anchor: this.anchor }; }
  restore(s) { if (s.id !== this.id) throw new Error('Civilian snapshot mismatch'); Object.assign(this, s); }
}
