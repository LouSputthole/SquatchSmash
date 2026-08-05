/**
 * The will to keep fighting, as one number with opinions.
 *
 * Morale 0..1 sinks on events (allies down, the leader down, being hit,
 * flanked, isolated, hosed with automatic fire) and creeps back in quiet.
 * The BAND it sits in is what the brain reads:
 *
 *   steady  >= 0.55   fights the plan
 *   shaken  >= 0.3    hesitates: worse aim, longer in cover, no pushes
 *   broken  <  0.3    retreats, hides, blind-fires — and may surrender
 *
 * A `fightToDeath` archetype (the armored heavy, loyal crew) never leaves
 * steady behaviour, whatever the number does — per-mission configurable,
 * exactly as the owner asked.
 */
export const MORALE_EVENTS = Object.freeze({
  allyDown: -0.12,
  leaderDown: -0.22,
  hit: -0.08,
  flanked: -0.15,
  isolated: -0.1,
  suppressedHeavily: -0.06,
  overwhelmed: -0.1, // player fire vastly outweighing return fire
  enemyDown: 0.08, // the fight turning their way
});

export class MoraleModel {
  /**
   * @param {object} o
   * @param {number} [o.start] 0..1
   * @param {boolean} [o.fightToDeath]
   * @param {number} [o.recovery] per second, in quiet
   * @param {number} [o.surrenderBelow] chance gate; 0 disables surrender
   */
  constructor({ start = 0.75, fightToDeath = false, recovery = 0.02, surrenderBelow = 0.12 } = {}) {
    this.value = Math.min(1, Math.max(0, start));
    this.fightToDeath = fightToDeath === true;
    this.recovery = recovery;
    this.surrenderBelow = surrenderBelow;
    this.quiet = 0;
    this.surrendered = false;
  }

  get band() {
    if (this.fightToDeath) return 'steady';
    if (this.value >= 0.55) return 'steady';
    if (this.value >= 0.3) return 'shaken';
    return 'broken';
  }

  get accuracyPenalty() {
    // Shaken hands spread wider; steady is untouched.
    return this.band === 'steady' ? 1 : this.band === 'shaken' ? 1.35 : 1.9;
  }

  note(event, scale = 1) {
    const delta = MORALE_EVENTS[event];
    if (delta === undefined) return this.value;
    this.value = Math.min(1, Math.max(0, this.value + delta * scale));
    if (delta < 0) this.quiet = 0;
    return this.value;
  }

  update(dt, { nearLeader = false } = {}) {
    const step = Math.max(0, dt);
    this.quiet += step;
    if (this.quiet > 3) {
      const rate = this.recovery * (nearLeader ? 2 : 1);
      this.value = Math.min(1, this.value + rate * step);
    }
  }

  /** Broken and low enough — does he throw the gun down? Rolled once. */
  considerSurrender(rng = Math.random) {
    if (this.fightToDeath || this.surrendered) return false;
    if (this.surrenderBelow <= 0) return false;
    if (this.value >= this.surrenderBelow) return false;
    if (rng() < 0.5) return false;
    this.surrendered = true;
    return true;
  }

  snapshot() { return { value: this.value, surrendered: this.surrendered }; }

  restore(s) {
    if (!s) return;
    this.value = s.value ?? this.value;
    this.surrendered = s.surrendered === true;
    this.quiet = 0;
  }
}
