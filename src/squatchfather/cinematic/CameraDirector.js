import { CameraShake } from '../effects/CameraShake.js';
import { shakeScale } from '../../core/settings.js';

// Owns the final camera transform: rides Prospect's eye, applies the shake
// stack, drives field of view, and can steer the aim toward a target (the
// scene's only aim assistance, used for the two shots).

export const FOV = {
  base: 62,
  tight: 53,   // the walk back from the bathroom
  pressure: 49, // train bearing down during the final exchange
};

/* Scratch for the scaled shake. `update()` runs every frame of a cinematic
 * camera, and building a fresh six-key object there was 3,600 short-lived
 * objects a minute in the one place a GC hitch is most visible. */
const _felt = {
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
};

export class CameraDirector {
  constructor(camera, ui) {
    this.camera = camera;
    this.ui = ui;
    this.shake = new CameraShake();
    this.fov = FOV.base;
    this.fovTarget = FOV.base;
    this.steer = null;
    this.extraShake = 0; // continuous rumble, 0..1
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  setFov(v, immediate = false) {
    this.fovTarget = v;
    if (immediate) this.fov = v;
  }

  letterbox(on) {
    this.ui.letterbox.classList.toggle('cine', on);
  }

  vignette(tight) {
    this.ui.vig.classList.toggle('tight', tight);
  }

  // Pull the view toward a world point over `dur` seconds. The player can still
  // move the mouse; the steer keeps pulling until it expires.
  steerTo(point, dur = 0.4, strength = 1) {
    this.steer = { point: point.clone(), t: 0, dur, strength };
  }

  clearSteer() {
    this.steer = null;
  }

  impulse(power) {
    this.shake.impulse(power);
  }

  update(dt, prospect, clamp = null) {
    if (this.steer) {
      this.steer.t += dt;
      const eye = prospect.eye;
      const dx = this.steer.point.x - eye.x;
      const dy = this.steer.point.y - eye.y;
      const dz = this.steer.point.z - eye.z;
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
      const k = Math.min(1, dt * 9 * this.steer.strength);
      let d = ((wantYaw - prospect.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      prospect.yaw += d * k;
      prospect.pitch += (wantPitch - prospect.pitch) * k;
      if (this.steer.t >= this.steer.dur) this.steer = null;
    }

    if (clamp) prospect.look(0, 0, clamp);

    this.shake.update(dt);
    /* One multiplier on everything the camera adds on top of where he is
     * looking — the trauma shake and the train rumble both — so the player's
     * "reduce camera shake" setting is honoured at the one place it lands. */
    const felt = shakeScale();
    const o = this.shake.offset;
    let s = o;
    if (felt !== 1) {
      _felt.x = o.x * felt;
      _felt.y = o.y * felt;
      _felt.z = o.z * felt;
      _felt.yaw = o.yaw * felt;
      _felt.pitch = o.pitch * felt;
      _felt.roll = o.roll * felt;
      s = _felt;
    }
    const rumble = this.extraShake * felt;
    const rx = rumble ? (Math.sin(dt * 0 + performance.now() * 0.021) * 0.0026 * rumble) : 0;
    const ry = rumble ? (Math.sin(performance.now() * 0.017) * 0.0022 * rumble) : 0;

    const eye = prospect.eye;
    this.camera.position.set(eye.x + s.x, eye.y + s.y, eye.z + s.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = prospect.yaw + s.yaw + ry;
    this.camera.rotation.x = prospect.pitch + s.pitch + rx;
    this.camera.rotation.z = s.roll;

    this.fov += (this.fovTarget - this.fov) * Math.min(1, dt * 2.2);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
