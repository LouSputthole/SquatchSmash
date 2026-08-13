const DEFAULTS = Object.freeze({
  headStagger: 0.55,
  chestStagger: 0.42,
  limbStagger: 0.3,
  legBase: 0.18,
  legDamageDivisor: 160,
  armBase: 0.2,
  armDamageDivisor: 150,
  legSpeedPenalty: 0.5,
  armAccuracyPenalty: 0.55,
  armAimPenalty: 0.45,
  reactionSeconds: 0.42,
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

  get reaction() {
    const seconds = Math.max(1e-6, finiteNonNegative(this.config.reactionSeconds));
    return Math.min(1, this.stagger / seconds);
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
