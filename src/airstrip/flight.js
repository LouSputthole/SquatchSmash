const MAX_SPEED = 78;
const STALL_SPEED = 24;
const ROTATE_SPEED = 32;

/**
 * Small deterministic aircraft model used by both the live scene and the
 * browser verifier. Distances are metres, speed is metres per second, and
 * heading zero points north along negative Z.
 */
export class FlightModel {
  constructor(initial = {}) {
    this.reset(initial);
  }

  reset(initial = {}) {
    this.x = number(initial.x, 0);
    this.z = number(initial.z, 120);
    this.altitude = Math.max(0, number(initial.altitude, 0));
    this.heading = number(initial.heading, 0);
    this.pitch = number(initial.pitch, 0);
    this.bank = number(initial.bank, 0);
    this.speed = Math.max(0, number(initial.speed, 0));
    this.throttle = clamp(number(initial.throttle, 0), 0, 1);
    this.verticalSpeed = number(initial.verticalSpeed, 0);
    this.onGround = initial.onGround ?? this.altitude <= 0;
    this.crashed = false;
    this.lastTouchdown = null;
    return this;
  }

  update(dt, controls = {}) {
    if (this.crashed || !Number.isFinite(dt) || dt <= 0) return this;
    dt = Math.min(dt, 0.1);

    const throttleInput = clamp(number(controls.throttle, 0), -1, 1);
    const pitchInput = clamp(number(controls.pitch, 0), -1, 1);
    const bankInput = clamp(number(controls.bank, 0), -1, 1);
    const yawInput = clamp(number(controls.yaw, 0), -1, 1);
    this.throttle = clamp(this.throttle + throttleInput * dt * 0.32, 0, 1);

    const targetSpeed = this.onGround
      ? this.throttle * MAX_SPEED
      : STALL_SPEED + this.throttle * (MAX_SPEED - STALL_SPEED);
    const acceleration = targetSpeed > this.speed ? 8.5 : 11;
    this.speed = moveToward(this.speed, targetSpeed, acceleration * dt);

    if (this.onGround) {
      const steer = yawInput + bankInput * 0.65;
      this.heading += steer * Math.min(1, this.speed / 20) * dt * 0.55;
      const targetPitch = this.speed > 15 ? Math.max(0, pitchInput) * 0.24 : 0;
      this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 3.5);
      this.bank += (0 - this.bank) * Math.min(1, dt * 5);
      this.verticalSpeed = 0;

      if (this.speed >= ROTATE_SPEED && this.pitch > 0.065) {
        this.onGround = false;
        this.verticalSpeed = 2.2;
      }
    } else {
      const targetPitch = pitchInput * 0.36;
      const targetBank = bankInput * 0.82;
      this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 2.4);
      this.bank += (targetBank - this.bank) * Math.min(1, dt * 2.8);
      this.heading += (
        Math.sin(this.bank) * this.speed * 0.009
        + yawInput * 0.28
      ) * dt;

      const lift = (this.speed - STALL_SPEED) * 0.035;
      const desiredVertical = Math.sin(this.pitch) * this.speed + lift - 1.1;
      const stallSink = this.speed < STALL_SPEED
        ? (STALL_SPEED - this.speed) * 0.45 : 0;
      this.verticalSpeed += (
        desiredVertical - stallSink - this.verticalSpeed
      ) * Math.min(1, dt * 2.2);
      this.altitude += this.verticalSpeed * dt;

      if (this.altitude <= 0) this.#touchDown();
    }

    const horizontal = Math.cos(this.pitch) * this.speed;
    this.x += Math.sin(this.heading) * horizontal * dt;
    this.z -= Math.cos(this.heading) * horizontal * dt;
    return this;
  }

  #touchDown() {
    const impact = this.verticalSpeed;
    const safe = impact >= -3.2
      && this.speed <= 35
      && Math.abs(this.bank) <= 0.32;
    const clean = safe
      && impact >= -1.8
      && this.speed <= 29
      && Math.abs(this.bank) <= 0.18;
    this.altitude = 0;
    this.onGround = true;
    this.pitch = Math.max(-0.04, this.pitch);
    this.bank *= 0.25;
    this.verticalSpeed = 0;
    this.crashed = !safe;
    this.lastTouchdown = {
      quality: safe ? (clean ? 'clean' : 'rough') : 'crash',
      impact,
      speed: this.speed,
    };
  }
}

function moveToward(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

function number(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
