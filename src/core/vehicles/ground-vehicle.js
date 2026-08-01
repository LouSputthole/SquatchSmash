function approach(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  if (value > target) return Math.max(target, value - amount);
  return value;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

const DEFAULTS = Object.freeze({
  acceleration: 8.5,
  reverseAcceleration: 5,
  brakeForce: 14,
  drag: 0.018,
  rollingResistance: 0.7,
  maxForwardSpeed: 43,
  maxReverseSpeed: 10,
  maxSteer: 0.56,
  steerRate: 2.8,
  throttleRate: 3.5,
  brakeRate: 5,
  wheelBase: 2.7,
  lateralGrip: 6.8,
  bodyRollRate: 5,
  suspensionRate: 8,
});

/** Allocation-free arcade-realistic ground vehicle state. */
export class GroundVehicle {
  constructor(config = {}) {
    this.config = Object.freeze({ ...DEFAULTS, ...config });
    this.x = 0;
    this.z = 0;
    this.heading = 0;
    this.speed = 0;
    this.lateralSlip = 0;
    this.steerAngle = 0;
    this.throttle = 0;
    this.brake = 0;
    this.inputThrottle = 0;
    this.inputSteer = 0;
    this.inputBrake = 0;
    this.bodyRoll = 0;
    this.suspension = 0;
    this.engineHealth = 100;
    this.windshieldHealth = 100;
    this.tireGrip = 1;
    this.collisionDamage = 0;
    this.lastStableNode = null;
  }

  setInput({ throttle = 0, steer = 0, brake = 0 } = {}) {
    this.inputThrottle = clamp(Number(throttle) || 0, -1, 1);
    this.inputSteer = clamp(Number(steer) || 0, -1, 1);
    this.inputBrake = clamp(Number(brake) || 0, 0, 1);
  }

  step(dt) {
    const c = this.config;
    this.throttle = approach(this.throttle, this.inputThrottle, c.throttleRate * dt);
    this.brake = approach(this.brake, this.inputBrake, c.brakeRate * dt);

    const steerAuthority = c.maxSteer / (1 + Math.abs(this.speed) * 0.045);
    const steerTarget = this.inputSteer * steerAuthority;
    this.steerAngle = approach(this.steerAngle, steerTarget, c.steerRate * dt);

    const healthFactor = 0.35 + 0.65 * (this.engineHealth / 100);
    const drive = this.throttle >= 0
      ? this.throttle * c.acceleration * healthFactor
      : this.throttle * c.reverseAcceleration * healthFactor;
    const brakeDirection = Math.sign(this.speed || drive);
    const braking = this.brake * c.brakeForce * brakeDirection;
    const drag = this.speed * Math.abs(this.speed) * c.drag;
    const rolling = Math.abs(this.speed) > 0.05
      ? Math.sign(this.speed) * c.rollingResistance : 0;
    this.speed += (drive - braking - drag - rolling) * dt;
    this.speed = clamp(this.speed, -c.maxReverseSpeed, c.maxForwardSpeed);
    if (Math.abs(this.speed) < 0.025 && Math.abs(drive) < 0.05) this.speed = 0;

    const grip = c.lateralGrip * this.tireGrip;
    const slipTarget = this.steerAngle * this.speed * 0.16;
    this.lateralSlip = approach(this.lateralSlip, slipTarget, grip * dt);
    this.lateralSlip *= Math.max(0, 1 - grip * 0.35 * dt);

    const yawRate = Math.tan(this.steerAngle) * this.speed / c.wheelBase;
    this.heading += yawRate * dt;
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    this.x += (sin * this.speed + cos * this.lateralSlip) * dt;
    this.z += (cos * this.speed - sin * this.lateralSlip) * dt;

    const rollTarget = -this.steerAngle * this.speed * 0.035;
    this.bodyRoll = approach(this.bodyRoll, rollTarget, c.bodyRollRate * dt);
    this.suspension = approach(this.suspension, -Math.abs(yawRate) * 0.018, c.suspensionRate * dt);
  }

  applyCollision({ severity = 0, windshield = false, tire = false } = {}) {
    const force = clamp(Number(severity) || 0, 0, 1);
    this.speed *= 1 - force * 0.72;
    const damage = force * 34;
    this.collisionDamage = clamp(this.collisionDamage + damage, 0, 100);
    this.engineHealth = clamp(this.engineHealth - damage * 0.65, 0, 100);
    if (windshield) this.windshieldHealth = clamp(this.windshieldHealth - damage, 0, 100);
    if (tire) this.tireGrip = clamp(this.tireGrip - force * 0.38, 0.35, 1);
    this.suspension = force * 0.16;
    return damage;
  }

  markStableNode(nodeId) { this.lastStableNode = nodeId ?? null; }

  snapshot() {
    return {
      x: this.x, z: this.z, heading: this.heading, speed: this.speed,
      lateralSlip: this.lateralSlip, steerAngle: this.steerAngle,
      bodyRoll: this.bodyRoll, suspension: this.suspension,
      engineHealth: this.engineHealth, windshieldHealth: this.windshieldHealth,
      tireGrip: this.tireGrip, collisionDamage: this.collisionDamage,
      lastStableNode: this.lastStableNode,
    };
  }

  restore(state = {}) {
    for (const key of [
      'x', 'z', 'heading', 'speed', 'lateralSlip', 'steerAngle',
      'bodyRoll', 'suspension', 'engineHealth', 'windshieldHealth',
      'tireGrip', 'collisionDamage',
    ]) this[key] = Number.isFinite(state[key]) ? state[key] : this[key];
    this.lastStableNode = state.lastStableNode ?? null;
    this.throttle = 0;
    this.brake = 0;
    this.setInput();
  }
}
