/*
 * How a hit reads, and why these numbers are what they are.
 *
 * `stagger` is the interruption: how long the man is off his aim. `reaction`
 * is the VISIBLE flinch both scenes' pose code multiplies into authored joint
 * rotations. Until 2026-08-19 the flinch was a straight linear fade from 1
 * over 0.42 s, which is the shape you get when the numbers are right and
 * nobody watches the result: full size for a single frame, half gone by the
 * time an eye finds the man, and the owner's note was that hits registered
 * and still felt like nothing happened.
 *
 * AMPLITUDE is not the lever it looks like. Mansion Siege adds the flinch on
 * top of a contact-tested long-gun shoulder, and `tests/mansion-siege-people`
 * caps the weapon arm at 0.37 rad of total deviation precisely so the two
 * cannot compound into the corkscrew that shipped once already. A peak of 1
 * already spends 0.335 of that. So the readability is bought where there is
 * room for it -- in the WINDOW and the ENVELOPE:
 *
 *   - the stagger windows are ~40% longer, so a hit man is visibly off his
 *     weapon long enough to see, and
 *   - `reaction` now HOLDS at full size for the part of the stagger beyond
 *     `reactionSeconds` and then releases slightly slower than linear, so the
 *     knock is a held, broken posture that snaps back rather than a one-frame
 *     spike. Roughly twice the flinch, frame for frame, at the same amplitude
 *     the corkscrew guard allows.
 */
const DEFAULTS = Object.freeze({
  headStagger: 0.74,
  chestStagger: 0.58,
  limbStagger: 0.4,
  legBase: 0.18,
  legDamageDivisor: 160,
  armBase: 0.2,
  armDamageDivisor: 150,
  legSpeedPenalty: 0.5,
  armAccuracyPenalty: 0.55,
  armAimPenalty: 0.45,
  /* The release, not the whole knock: stagger beyond this is held at peak. */
  reactionSeconds: 0.42,
  /* Ceiling on the visible flinch. 1 is not a tuning shrug -- it is what the
   * Mansion Siege corkscrew guard leaves once the braced shoulder has taken
   * its share. Raising it must be paid for in that scene's pose offsets. */
  reactionPeak: 1,
  /* Sub-linear: the knock lets go a little slower than it arrives. */
  reactionFalloff: 0.8,
});

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function unit(value) {
  return Math.max(0, Math.min(1, finiteNonNegative(value)));
}

function finiteSigned(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Convert an immutable world-space shot direction into a bounded rig reaction.
 * The scene still owns animation and floor placement; this keeps left/right
 * hits, front/back pushes and fatal fall choice physically consistent.
 */
export function resolveCombatReaction({ direction = null, actorYaw = 0, fatal = false } = {}) {
  const yaw = finiteSigned(actorYaw);
  const dx = finiteSigned(direction?.x);
  const dz = finiteSigned(direction?.z);
  const length = Math.hypot(dx, dz) || 1;
  const worldX = dx / length;
  const worldZ = dz / length;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const sideValue = worldX * cos - worldZ * sin;
  const forwardValue = worldZ * cos + worldX * sin;
  const side = Math.abs(sideValue) < 1e-6 ? 0 : Math.sign(sideValue);
  const forward = Math.abs(forwardValue) < 1e-6 ? 0 : Math.sign(forwardValue);
  const roll = Math.max(-0.72, Math.min(0.72, sideValue * 0.72));
  const fall = Math.abs(sideValue) > Math.abs(forwardValue)
    ? (sideValue >= 0 ? 'right' : 'left')
    : (forwardValue >= 0 ? 'forward' : 'backward');
  return Object.freeze({
    side,
    forward,
    roll,
    fall,
    fatal: fatal === true,
    pitch: Math.max(-0.34, Math.min(0.34, forwardValue * 0.34)),
  });
}

/** Durable limb wounds and the short interruption caused by a resolved hit. */
export class CombatImpairments {
  constructor(options = {}) {
    this.config = Object.freeze({ ...DEFAULTS, ...options });
    this.reset();
  }

  applyResolvedHit({ zone = 'chest', part = zone, result = null } = {}) {
    if (result?.applied !== true) return false;
    const damage = finiteNonNegative(result.damage);
    const stagger = zone === 'head' ? this.config.headStagger
      : zone === 'chest' ? this.config.chestStagger
        : this.config.limbStagger;
    this.stagger = Math.max(this.stagger, finiteNonNegative(stagger));
    if (part === 'leg') {
      this.legWound = unit(
        this.legWound + this.config.legBase + damage / this.config.legDamageDivisor,
      );
    } else if (part === 'arm') {
      this.armWound = unit(
        this.armWound + this.config.armBase + damage / this.config.armDamageDivisor,
      );
    }
    return true;
  }

  update(dt) {
    this.stagger = Math.max(0, this.stagger - finiteNonNegative(dt));
    return this.stagger;
  }

  reset() {
    this.stagger = 0;
    this.armWound = 0;
    this.legWound = 0;
    return this;
  }

  get speedScale() {
    return Math.max(0, 1 - this.legWound * this.config.legSpeedPenalty);
  }

  get accuracyScale() {
    return Math.max(0, 1 - this.armWound * this.config.armAccuracyPenalty);
  }

  get aimSettleScale() {
    return Math.max(0, 1 - this.armWound * this.config.armAimPenalty);
  }

  get interrupted() { return this.stagger > 0; }

  /**
   * The visible hit reaction: `reactionPeak` while the stagger still has more
   * than `reactionSeconds` to run, then a sub-linear release to 0 as it ends.
   * Scenes multiply it into authored rotations, so this one number is the
   * shared lever that makes a hit readable in every scene at once.
   */
  get reaction() {
    const seconds = Math.max(1e-6, finiteNonNegative(this.config.reactionSeconds));
    const phase = Math.min(1, this.stagger / seconds);
    if (phase <= 0) return 0;
    const peak = Math.max(0, finiteNonNegative(this.config.reactionPeak));
    const falloff = Math.max(1e-6, finiteNonNegative(this.config.reactionFalloff));
    return peak * phase ** falloff;
  }

  snapshot() {
    return {
      stagger: finiteNonNegative(this.stagger),
      armWound: unit(this.armWound),
      legWound: unit(this.legWound),
    };
  }

  restore(snapshot = {}) {
    this.stagger = finiteNonNegative(snapshot?.stagger);
    this.armWound = unit(snapshot?.armWound);
    this.legWound = unit(snapshot?.legWound);
    return this;
  }
}
