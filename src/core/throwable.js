import * as THREE from 'three';

const EPSILON = 1e-8;

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function requireVector3(value, label) {
  if (!value?.isVector3) throw new TypeError(`${label} must be a THREE.Vector3`);
  return value;
}

/**
 * Reusable hold-to-charge state. The consumer decides what the returned
 * power means; this module deliberately knows nothing about darts, grenades,
 * inventory, animation, or input bindings.
 */
export class ThrowCharge {
  constructor({ minPower = 5, maxPower = 15, chargeSeconds = 1.1, curve = null } = {}) {
    this.minPower = finite(minPower, 5);
    this.maxPower = finite(maxPower, 15);
    this.chargeSeconds = finite(chargeSeconds, 1.1);
    if (!(this.maxPower >= this.minPower)) {
      throw new RangeError('ThrowCharge maxPower must be at least minPower');
    }
    if (!(this.chargeSeconds > 0)) throw new RangeError('ThrowCharge chargeSeconds must be positive');
    if (curve !== null && typeof curve !== 'function') throw new TypeError('ThrowCharge curve must be a function');
    this.curve = curve ?? ((amount) => amount * amount * (3 - 2 * amount));
    this.active = false;
    this.elapsed = 0;
  }

  get amount() {
    return THREE.MathUtils.clamp(this.elapsed / this.chargeSeconds, 0, 1);
  }

  get power() {
    const shaped = THREE.MathUtils.clamp(finite(this.curve(this.amount), this.amount), 0, 1);
    return THREE.MathUtils.lerp(this.minPower, this.maxPower, shaped);
  }

  begin() {
    if (this.active) return false;
    this.active = true;
    this.elapsed = 0;
    return true;
  }

  update(dt) {
    if (!this.active) return this.amount;
    this.elapsed = Math.min(this.chargeSeconds, this.elapsed + Math.max(0, finite(dt, 0)));
    return this.amount;
  }

  release() {
    if (!this.active) return null;
    const receipt = Object.freeze({
      amount: this.amount,
      power: this.power,
      elapsed: this.elapsed,
    });
    this.active = false;
    return receipt;
  }

  cancel() {
    const wasActive = this.active;
    this.active = false;
    this.elapsed = 0;
    return wasActive;
  }
}

/** Build an initial velocity without assigning any scene-specific meaning. */
export function composeThrowVelocity(direction, power, { upwardBias = 0 } = {}) {
  requireVector3(direction, 'composeThrowVelocity direction');
  const velocity = direction.clone();
  if (velocity.lengthSq() <= EPSILON) throw new RangeError('Throw direction must be non-zero');
  velocity.normalize();
  velocity.y += finite(upwardBias, 0);
  velocity.normalize().multiplyScalar(Math.max(0, finite(power, 0)));
  return velocity;
}

/**
 * Continuous segment/plane collision. `maxRadius` optionally clips the
 * infinite plane to a circular target while keeping scoring out of core.
 */
export function segmentPlaneImpact({
  from,
  to,
  planePoint,
  planeNormal,
  radius = 0,
  maxRadius = Infinity,
  target = null,
  oneSided = false,
} = {}) {
  requireVector3(from, 'segmentPlaneImpact from');
  requireVector3(to, 'segmentPlaneImpact to');
  requireVector3(planePoint, 'segmentPlaneImpact planePoint');
  requireVector3(planeNormal, 'segmentPlaneImpact planeNormal');
  const normal = planeNormal.clone();
  if (normal.lengthSq() <= EPSILON) throw new RangeError('Plane normal must be non-zero');
  normal.normalize();

  const motion = to.clone().sub(from);
  const motionAlongNormal = motion.dot(normal);
  if (Math.abs(motionAlongNormal) <= EPSILON) return null;
  if (oneSided && motionAlongNormal >= 0) return null;

  // Orient the contact normal against travel before expanding the plane by
  // the projectile shell. For a two-sided plane the reverse approach touches
  // at -radius, not +radius in the authored normal's coordinate system.
  if (motionAlongNormal > 0) normal.negate();

  const shell = Math.max(0, finite(radius, 0));
  const startDistance = from.clone().sub(planePoint).dot(normal) - shell;
  const endDistance = to.clone().sub(planePoint).dot(normal) - shell;
  if (startDistance === 0) {
    if (motionAlongNormal > 0) return null;
  } else if (startDistance * endDistance > 0) {
    return null;
  }

  const denominator = startDistance - endDistance;
  if (Math.abs(denominator) <= EPSILON) return null;
  const t = THREE.MathUtils.clamp(startDistance / denominator, 0, 1);
  const point = from.clone().lerp(to, t);
  const contactPoint = point.clone().addScaledVector(normal, -shell);
  const radial = contactPoint.clone().sub(planePoint).addScaledVector(
    normal,
    -contactPoint.clone().sub(planePoint).dot(normal),
  );
  if (Number.isFinite(maxRadius) && radial.lengthSq() > maxRadius * maxRadius) return null;

  return {
    t,
    point,
    contactPoint,
    normal,
    target,
    radialDistance: radial.length(),
  };
}

/** Return the earliest valid result from reusable segment collider callbacks. */
export function firstSegmentImpact(from, to, colliders = [], context = {}) {
  requireVector3(from, 'firstSegmentImpact from');
  requireVector3(to, 'firstSegmentImpact to');
  let first = null;
  for (const collider of colliders ?? []) {
    const hit = typeof collider === 'function'
      ? collider({ from, to, ...context })
      : collider?.intersectSegment?.(from, to, context);
    if (!hit || !Number.isFinite(hit.t) || hit.t < 0 || hit.t > 1) continue;
    if (!first || hit.t < first.t) first = hit;
  }
  return first;
}

/**
 * Small continuous ballistic body. It substeps long frames and asks supplied
 * segment colliders for impacts, preventing fast thrown props tunnelling
 * through thin targets. Consumers own meshes, sounds, damage, and scoring.
 */
export class BallisticProjectile {
  constructor({
    gravity = new THREE.Vector3(0, -9.81, 0),
    radius = 0,
    maxLifetime = 6,
    maxStep = 1 / 120,
  } = {}) {
    requireVector3(gravity, 'BallisticProjectile gravity');
    this.gravity = gravity.clone();
    this.radius = Math.max(0, finite(radius, 0));
    this.maxLifetime = Math.max(EPSILON, finite(maxLifetime, 6));
    this.maxStep = Math.max(1 / 1000, finite(maxStep, 1 / 120));
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.active = false;
    this.age = 0;
    this.impact = null;
  }

  launch(origin, velocity) {
    requireVector3(origin, 'BallisticProjectile launch origin');
    requireVector3(velocity, 'BallisticProjectile launch velocity');
    this.position.copy(origin);
    this.velocity.copy(velocity);
    this.active = true;
    this.age = 0;
    this.impact = null;
    return this;
  }

  stop() {
    const wasActive = this.active;
    this.active = false;
    return wasActive;
  }

  update(dt, colliders = []) {
    if (!this.active) return { active: false, expired: false, impact: this.impact };
    let remaining = Math.max(0, finite(dt, 0));
    let impact = null;
    while (this.active && remaining > EPSILON) {
      const step = Math.min(this.maxStep, remaining, this.maxLifetime - this.age);
      if (step <= EPSILON) {
        this.active = false;
        break;
      }
      const from = this.position.clone();
      const to = from.clone()
        .addScaledVector(this.velocity, step)
        .addScaledVector(this.gravity, 0.5 * step * step);
      impact = firstSegmentImpact(from, to, colliders, {
        radius: this.radius,
        projectile: this,
      });
      if (impact) {
        const impactDt = step * impact.t;
        this.position.copy(impact.point);
        this.velocity.addScaledVector(this.gravity, impactDt);
        this.age += impactDt;
        this.active = false;
        this.impact = Object.freeze({
          ...impact,
          point: impact.point.clone(),
          contactPoint: impact.contactPoint?.clone?.() ?? impact.point.clone(),
          normal: impact.normal?.clone?.() ?? new THREE.Vector3(),
          velocity: this.velocity.clone(),
          age: this.age,
        });
        break;
      }
      this.position.copy(to);
      this.velocity.addScaledVector(this.gravity, step);
      this.age += step;
      remaining -= step;
      if (this.age >= this.maxLifetime - EPSILON) this.active = false;
    }
    return {
      active: this.active,
      expired: !this.active && !this.impact && this.age >= this.maxLifetime - EPSILON,
      impact: this.impact,
      position: this.position,
      velocity: this.velocity,
      age: this.age,
    };
  }
}
