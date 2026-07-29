// Impulse-driven camera shake. Gunshots hit it hard and briefly; the train
// feeds it a low continuous rumble through CameraDirector.extraShake.

const noise = (t, seed) =>
  Math.sin(t * 12.9898 + seed) * 0.5 + Math.sin(t * 7.233 + seed * 2.1) * 0.32 + Math.sin(t * 21.7 + seed * 3.7) * 0.18;

export class CameraShake {
  constructor() {
    this.trauma = 0;
    this.t = 0;
    this.offset = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  }

  impulse(power = 0.5) {
    this.trauma = Math.min(1, this.trauma + power);
  }

  update(dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const s = this.trauma * this.trauma; // falls off fast, like a real jolt
    const o = this.offset;
    o.x = noise(this.t * 34, 1.1) * 0.035 * s;
    o.y = noise(this.t * 41, 5.7) * 0.03 * s;
    o.z = noise(this.t * 29, 9.3) * 0.02 * s;
    o.yaw = noise(this.t * 37, 3.3) * 0.028 * s;
    o.pitch = noise(this.t * 44, 7.9) * 0.026 * s;
    o.roll = noise(this.t * 26, 11.5) * 0.02 * s;
  }
}
