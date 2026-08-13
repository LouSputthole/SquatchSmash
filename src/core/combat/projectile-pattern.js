/**
 * Deterministic multi-projectile sampling for weapons such as shotguns.
 *
 * The Module owns geometry only: it does not raycast, apply damage, play
 * presentation or spend ammunition. Callers receive independent world-space
 * rays and can feed each one through their existing ballistic path.
 */
export class CombatProjectilePattern {
  constructor({ random = Math.random } = {}) {
    this.random = typeof random === 'function' ? random : Math.random;
  }

  /**
   * Sample normalized rays within a circular cone.
   *
   * @returns {Array<{index:number,origin:object,direction:object,end:object}>}
   */
  sample({ origin, direction, right = null, up = null, count = 1, spread = 0, range = 1 } = {}) {
    if (!origin?.isVector3 || !direction?.isVector3) {
      throw new TypeError('CombatProjectilePattern.sample requires Vector3 origin and direction');
    }
    const forward = direction.clone();
    if (forward.lengthSq() <= 1e-12) throw new RangeError('projectile direction must be non-zero');
    forward.normalize();

    const side = right?.isVector3
      ? right.clone()
      : forward.clone().set(Math.abs(forward.y) < 0.95 ? 0 : 1,
        Math.abs(forward.y) < 0.95 ? 1 : 0, 0).cross(forward);
    side.addScaledVector(forward, -side.dot(forward));
    if (side.lengthSq() <= 1e-12) {
      side.set(Math.abs(forward.y) < 0.95 ? 0 : 1,
        Math.abs(forward.y) < 0.95 ? 1 : 0, 0).cross(forward);
    }
    side.normalize();

    const vertical = up?.isVector3 ? up.clone() : forward.clone().cross(side);
    vertical.addScaledVector(forward, -vertical.dot(forward));
    vertical.addScaledVector(side, -vertical.dot(side));
    if (vertical.lengthSq() <= 1e-12) vertical.copy(forward).cross(side);
    vertical.normalize();

    const total = Math.max(1, Math.trunc(Number(count) || 1));
    const cone = Math.max(0, Number(spread) || 0);
    const distance = Math.max(0, Number(range) || 0);
    const radiusAtUnit = Math.tan(Math.min(cone, Math.PI * 0.499));
    const rays = [];
    for (let index = 0; index < total; index++) {
      const radial = Math.sqrt(this.#unit()) * radiusAtUnit;
      const angle = this.#unit() * Math.PI * 2;
      const rayDirection = forward.clone()
        .addScaledVector(side, Math.cos(angle) * radial)
        .addScaledVector(vertical, Math.sin(angle) * radial)
        .normalize();
      const rayOrigin = origin.clone();
      rays.push({
        index,
        origin: rayOrigin,
        direction: rayDirection,
        end: rayOrigin.clone().addScaledVector(rayDirection, distance),
      });
    }
    return rays;
  }

  #unit() {
    const value = Number(this.random());
    if (!Number.isFinite(value)) return 0.5;
    return Math.max(0, Math.min(1 - Number.EPSILON, value));
  }
}
