import * as THREE from 'three';

const FIXED_STEP = 1 / 120;
const MAX_STEPS = 10;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Arcade-realistic displacement-hull handling on the Beef Run fixed-step pattern. */
export class BoatPhysics {
  constructor() {
    this.position = new THREE.Vector2(0, 0);
    this.heading = 0;
    this.speed = 0;
    this.yawRate = 0;
    this.throttle = 0;
    this.steer = 0;
    this.rpm = 0;
    this.distance = 0;
    this.time = 0;
    this.running = false;
    this.mooringReleased = false;
    this._acc = 0;
  }

  reset() {
    this.position.set(0, 0);
    this.heading = 0;
    this.speed = 0;
    this.yawRate = 0;
    this.throttle = 0;
    this.steer = 0;
    this.rpm = 0;
    this.distance = 0;
    this.time = 0;
    this.running = false;
    this.mooringReleased = false;
    this._acc = 0;
  }

  advance(dt) {
    this._acc += Math.min(0.25, Math.max(0, dt));
    let steps = 0;
    while (this._acc >= FIXED_STEP && steps < MAX_STEPS) {
      this.step(FIXED_STEP);
      this._acc -= FIXED_STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this._acc = 0;
  }

  step(dt) {
    this.time += dt;
    const requested = this.running && this.mooringReleased ? this.throttle : 0;
    const targetSpeed = requested >= 0 ? requested * 10.5 : requested * 3.4;
    const thrustResponse = requested === 0 ? 0.65 : 0.42;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-dt / thrustResponse));
    this.speed *= Math.exp(-dt * (0.055 + Math.abs(this.steer) * 0.018));

    // Rudder authority grows with flow, but a turning hull carries inertia.
    const authority = clamp(Math.abs(this.speed) / 4.5, 0.12, 1.35);
    const desiredYaw = -this.steer * authority * 0.48 * Math.sign(this.speed || 1);
    this.yawRate += (desiredYaw - this.yawRate) * (1 - Math.exp(-dt / 0.48));
    this.yawRate *= Math.exp(-dt * 0.3);
    this.heading += this.yawRate * dt;

    const dx = Math.sin(this.heading) * this.speed * dt;
    const dz = -Math.cos(this.heading) * this.speed * dt;
    this.position.x += dx;
    this.position.y += dz;
    this.distance += Math.hypot(dx, dz);
    this.rpm += ((this.running ? 700 + Math.abs(this.throttle) * 3600 : 0) - this.rpm)
      * (1 - Math.exp(-dt / 0.35));
  }

  motion() {
    const waveA = Math.sin(this.time * 1.15 + this.position.y * 0.018);
    const waveB = Math.sin(this.time * 1.83 + this.position.x * 0.027 + 1.7);
    const speedK = clamp(Math.abs(this.speed) / 10.5, 0, 1);
    return {
      heave: waveA * 0.08 + waveB * 0.035 + speedK * 0.10,
      roll: waveB * 0.018 - this.yawRate * 0.12,
      pitch: waveA * 0.012 - speedK * 0.032,
      bowLift: speedK,
    };
  }
}

export const BOAT_FIXED_STEP = FIXED_STEP;
