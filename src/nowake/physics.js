import * as THREE from 'three';

const FIXED_STEP = 1 / 120;
const MAX_STEPS = 10;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Weighty displacement-hull handling on the Beef Run fixed-step pattern. */
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
    const targetSpeed = requested >= 0 ? requested * 8.6 : requested * 2.9;
    // Twin diesels move a 42-foot cruiser, not a jet ski. Neutral coasts down
    // instead of applying an invisible brake, while reverse builds sooner.
    const thrustResponse = requested === 0 ? 3.4 : requested > 0 ? 2.35 : 1.75;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-dt / thrustResponse));
    this.speed *= Math.exp(-dt * (0.032 + Math.abs(this.steer) * 0.022));

    // Rudder authority grows with flow, but a turning hull carries inertia.
    const authority = clamp(Math.abs(this.speed) / 5.2, 0.035, 1);
    const desiredYaw = -this.steer * authority * 0.31 * Math.sign(this.speed || 1);
    this.yawRate += (desiredYaw - this.yawRate) * (1 - Math.exp(-dt / .92));
    this.yawRate *= Math.exp(-dt * .42);
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
    const speedK = clamp(Math.abs(this.speed) / 8.6, 0, 1);
    return {
      heave: waveA * .065 + waveB * .028 + speedK * .075,
      roll: waveB * .014 - this.yawRate * .10,
      pitch: waveA * .010 - speedK * .022,
      bowLift: speedK,
    };
  }
}

export const BOAT_FIXED_STEP = FIXED_STEP;

