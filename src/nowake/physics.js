import * as THREE from 'three';

const FIXED_STEP = 1 / 120;
const MAX_STEPS = 10;
/* Owner, 2026-09-01: "the boat is very slow. Let me go at least 20." The
 * helm readout multiplies by 1.944, so 10.8 m/s shows 21 kn wide open. The
 * channel stretched with her (INLET moved to the measured 90-second landing
 * in world.js), so the authored run keeps its ninety seconds and its four
 * lines of cruise dialogue at the same clock. Drag settles her ~7% under
 * target, so 11.2 is what actually shows 20 on the dial: measured steady
 * 10.41 m/s = 20.2 kn wide open. */
export const BOAT_FORWARD_TARGET_SPEED = 11.2;
export const BOAT_REVERSE_TARGET_SPEED = 2.9;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** One presentation/handling scale for every consumer of hull speed. */
export const boatSpeedFraction = (speed) => {
  const value = Number(speed) || 0;
  const target = value < 0 ? BOAT_REVERSE_TARGET_SPEED : BOAT_FORWARD_TARGET_SPEED;
  return clamp(Math.abs(value) / target, 0, 1);
};

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
    /** False once nobody is standing at the wheel. See `step`. */
    this.helmAttended = true;
    /**
     * Kinematically locked.
     *
     * "Anchor or kinematically lock the boat during the confrontation." From
     * the moment the engines are killed in the inlet until the player restarts
     * them to leave, the hull does not move at all -- not a heave, not a roll.
     * A cinematic interior with a moving floor is an invitation to the physics
     * engine, and this is the one beat in the mission that cannot afford it.
     */
    this.anchored = false;
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
    this.helmAttended = true;
    this.anchored = false;
    this._acc = 0;
  }

  advance(dt) {
    if (this.anchored) return;
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
    /* The authored run is 90 seconds to the inlet at z -430. An 8.6 m/s
     * target carried the swept bow through inlet-head land around minute one.
     * 5.2 m/s is the measured displacement-cruise target: the fixed-step hull
     * reaches the inlet at 90 s with forty metres still ahead of its bow. */
    const targetSpeed = requested >= 0
      ? requested * BOAT_FORWARD_TARGET_SPEED
      : requested * BOAT_REVERSE_TARGET_SPEED;
    // Twin diesels move a 42-foot cruiser, not a jet ski. Neutral coasts down
    // instead of applying an invisible brake, while reverse builds sooner.
    const thrustResponse = requested === 0 ? 3.4 : requested > 0 ? 2.35 : 1.75;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-dt / thrustResponse));
    /* A helm nobody is standing at settles. Neutral already stops the thrust,
     * but a 42-foot hull carries its way for the best part of a minute, and
     * from the deck that reads as a boat that has taken itself out of the
     * player's hands -- "when I get out it just starts drifting". Once the
     * wheel is unattended the shafts are stopped rather than freewheeling and
     * the rudder is amidships, so she comes off the way in a few seconds and
     * then holds her heading instead of rounding up on her own. */
    const unattended = !this.helmAttended;
    this.speed *= Math.exp(-dt * (0.032 + Math.abs(this.steer) * 0.022 + (unattended ? 0.42 : 0)));

    // Rudder authority grows with flow, but a turning hull carries inertia.
    const authority = Math.max(.035, boatSpeedFraction(this.speed));
    const desiredYaw = unattended
      ? 0 : -this.steer * authority * 0.31 * Math.sign(this.speed || 1);
    this.yawRate += (desiredYaw - this.yawRate) * (1 - Math.exp(-dt / (unattended ? .34 : .92)));
    this.yawRate *= Math.exp(-dt * (unattended ? 1.8 : .42));
    this.heading += this.yawRate * dt;

    /* She travels where her bow points. `heading` is the hull's yaw in the same
     * sense the scene writes to `boat.root.rotation.y`, so forward is the
     * mesh's own -Z axis rotated by it: (-sin, -cos). The x term used to be
     * +sin, which is the mirror of that -- press starboard and the cruiser
     * swung her nose right and then crabbed away to port. The turn itself is
     * unchanged; only the direction of travel now agrees with it. */
    const dx = -Math.sin(this.heading) * this.speed * dt;
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
    const speedK = boatSpeedFraction(this.speed);
    return {
      heave: waveA * .065 + waveB * .028 + speedK * .075,
      roll: waveB * .014 - this.yawRate * .10,
      pitch: waveA * .010 - speedK * .022,
      bowLift: speedK,
    };
  }
}

export const BOAT_FIXED_STEP = FIXED_STEP;

