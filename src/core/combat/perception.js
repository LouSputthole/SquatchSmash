/**
 * What an NPC knows about the player, and how surely.
 *
 * One enemy seeing you does not teach the whole map your coordinates. Each
 * Perception owns a CONFIDENCE (0..1) and a LAST KNOWN position; sight
 * raises confidence at a rate driven by distance, angle, light and motion,
 * silence erodes it, and shooting through a wall at a ghost is impossible
 * because the brain only gets the last known point, ageing, to aim at.
 *
 * The world is injected: `canSee(from, to)` is the scene's own line-of-sight
 * test (raycast against level geometry), so this module stays pure and the
 * scene keeps its collision acceleration.
 */
export class Perception {
  /**
   * @param {object} o
   * @param {number} [o.fov]        radians, full cone
   * @param {number} [o.sightRange] metres
   * @param {number} [o.hearingScale] multiplies incoming noise radii
   * @param {number} [o.reaction]   seconds of confirmed sight before reacting
   * @param {(a:{x,y,z}, b:{x,y,z})=>boolean} o.canSee
   */
  constructor({
    fov = Math.PI * 0.62, sightRange = 45, hearingScale = 1,
    reaction = 0.55, canSee = () => true,
  } = {}) {
    this.fov = fov;
    this.sightRange = sightRange;
    this.hearingScale = hearingScale;
    this.reaction = reaction;
    this.canSee = canSee;

    this.confidence = 0;
    this.lastKnown = null; // {x, z, age}
    this.seeing = false;
    this.sightTime = 0; // continuous seconds of confirmed sight
    this.sinceSeen = 999;
    this.investigate = null; // {x, z, priority} — a noise worth walking to
  }

  get alerted() { return this.confidence >= 0.65; }

  get suspicious() { return this.confidence >= 0.25; }

  /** The brain reacts only after `reaction` seconds of real sight. */
  get reacted() { return this.seeing && this.sightTime >= this.reaction; }

  /**
   * @param {number} dt
   * @param {object} me     {x, y, z, heading} — heading in radians, atan2(dx,dz) convention
   * @param {object} target {x, y, z, crouched, moving, lit} — lit defaults 1
   */
  update(dt, me, target) {
    const step = Math.max(0, dt);
    const dx = target.x - me.x;
    const dz = target.z - me.z;
    const dist = Math.hypot(dx, dz);

    let visible = false;
    if (dist <= this.sightRange) {
      const bearing = Math.atan2(dx, dz);
      let off = bearing - (me.heading ?? 0);
      while (off > Math.PI) off -= Math.PI * 2;
      while (off < -Math.PI) off += Math.PI * 2;
      if (Math.abs(off) <= this.fov / 2) {
        visible = this.canSee(me, target);
      }
    }

    this.seeing = visible;
    if (visible) {
      this.sightTime += step;
      this.sinceSeen = 0;
      /* Close, moving, well-lit targets register fast; a still, crouched
       * shape at the edge of range takes seconds to resolve. */
      const closeness = 1 - Math.min(1, dist / this.sightRange);
      let rate = 0.9 + closeness * 2.4;
      if (target.moving) rate *= 1.6;
      if (target.crouched) rate *= 0.6;
      rate *= target.lit ?? 1;
      this.confidence = Math.min(1, this.confidence + rate * step);
      this.lastKnown = { x: target.x, z: target.z, age: 0 };
    } else {
      this.sightTime = 0;
      this.sinceSeen += step;
      /* Knowledge decays: quickly from a glimpse, slowly from a firefight's
       * certainty. After long silence the ghost is gone entirely. */
      const decay = this.confidence > 0.65 ? 0.045 : 0.12;
      this.confidence = Math.max(0, this.confidence - decay * step);
      if (this.lastKnown) {
        this.lastKnown.age += step;
        if (this.lastKnown.age > 25) this.lastKnown = null;
      }
    }
    if (this.investigate) {
      this.investigate.age = (this.investigate.age ?? 0) + step;
      if (this.investigate.age > 20) this.investigate = null;
    }
  }

  /**
   * A noise happened: gunfire, an impact nearby, a shout, a body falling.
   * @param {object} o {x, z, radius, priority} — radius already scaled for
   *   suppressors/indoors by the caller (config.hearing).
   */
  hear({ x, z, radius, priority = 0.5 }, me) {
    const dist = Math.hypot(x - me.x, z - me.z);
    if (dist > radius * this.hearingScale) return false;
    this.confidence = Math.max(this.confidence, Math.min(0.6, priority));
    if (!this.investigate || priority >= (this.investigate.priority ?? 0)) {
      this.investigate = { x, z, priority, age: 0 };
    }
    return true;
  }

  /** Squad intel: someone else saw the player. Slightly stale by design. */
  inform({ x, z, confidence = 0.55 }) {
    if (!this.lastKnown || this.lastKnown.age > 1.5) {
      this.lastKnown = { x, z, age: 1.0 };
    }
    this.confidence = Math.max(this.confidence, Math.min(0.75, confidence));
  }

  snapshot() {
    return {
      confidence: this.confidence,
      lastKnown: this.lastKnown ? { ...this.lastKnown } : null,
      sinceSeen: this.sinceSeen,
    };
  }

  restore(s) {
    if (!s) return;
    this.confidence = s.confidence ?? 0;
    this.lastKnown = s.lastKnown ? { ...s.lastKnown } : null;
    this.sinceSeen = s.sinceSeen ?? 999;
    this.seeing = false;
    this.sightTime = 0;
  }
}
