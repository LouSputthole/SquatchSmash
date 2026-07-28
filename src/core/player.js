/**
 * First-person player controller.
 *
 * Modes:
 *   'bed'    - lying down, camera pitched at the ceiling, look only
 *   'walk'   - normal WASD + mouselook with collision + head bob
 *   'seated' - locked to a fixed pose (desk chair); look is clamped to a cone
 *   'frozen' - cutscene / transition, no input
 */
import * as THREE from 'three';

const EYE_STAND = 1.66;
const EYE_CROUCH = 1.02;
const RADIUS = 0.30;

const SPEED_WALK = 2.35;
const SPEED_SPRINT = 4.05;
const SPEED_CROUCH = 1.25;
const ACCEL = 12;
const FRICTION = 11;

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world; // { colliders: [Box3], floorZones: [{box, surface}] }

    this.mode = 'bed';
    this.position = new THREE.Vector3(0, EYE_STAND, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    this.eyeHeight = EYE_STAND;
    this.targetEye = EYE_STAND;
    this.crouching = false;
    this.sprinting = false;

    this.bobPhase = 0;
    this.bobAmount = 0;
    this.rollTarget = 0;
    this.roll = 0;

    // Look constraints, overridden per mode.
    this.pitchMin = -Math.PI / 2 + 0.05;
    this.pitchMax = Math.PI / 2 - 0.05;
    this.yawCenter = null;
    this.yawRange = Math.PI;

    this.sensitivity = 0.0022;
    this.enabled = false;
    this.keys = new Set();
    this.onFootstep = null;
    this._stepDist = 0;

    // Transition tween state.
    this._tween = null;
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  handleMouseMove(dx, dy) {
    if (!this.enabled || this.mode === 'frozen') return;
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;
    this.pitch = clamp(this.pitch, this.pitchMin, this.pitchMax);
    if (this.yawCenter !== null) {
      this.yaw = clamp(
        this.yaw,
        this.yawCenter - this.yawRange,
        this.yawCenter + this.yawRange,
      );
    }
  }

  setKey(code, down) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  clearKeys() {
    this.keys.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Mode changes                                                      */
  /* ---------------------------------------------------------------- */

  /** Wake up: swing from lying on the bed to standing beside it. */
  standUpFromBed(target, lookYaw, done) {
    this.mode = 'frozen';
    this._tween = {
      t: 0,
      dur: 1.5,
      fromPos: this.position.clone(),
      toPos: new THREE.Vector3(target.x, EYE_STAND, target.z),
      fromPitch: this.pitch,
      toPitch: -0.12,
      fromYaw: this.yaw,
      toYaw: lookYaw,
      onDone: () => {
        this.mode = 'walk';
        this.pitchMin = -Math.PI / 2 + 0.05;
        this.pitchMax = Math.PI / 2 - 0.05;
        this.yawCenter = null;
        this.eyeHeight = EYE_STAND;
        this.targetEye = EYE_STAND;
        done?.();
      },
    };
  }

  /** Sit at the desk: glide into a fixed pose and clamp the view. */
  sitAt(pose, done) {
    this.mode = 'frozen';
    this._tween = {
      t: 0,
      dur: 1.0,
      fromPos: this.position.clone(),
      toPos: pose.position.clone(),
      fromPitch: this.pitch,
      toPitch: pose.pitch,
      fromYaw: this.yaw,
      toYaw: pose.yaw,
      onDone: () => {
        this.mode = 'seated';
        this.yawCenter = pose.yaw;
        this.yawRange = 0.85;
        this.pitchMin = -0.75;
        this.pitchMax = 0.45;
        this.velocity.set(0, 0, 0);
        done?.();
      },
    };
  }

  /** Stand back up from the chair. */
  standFrom(target, done) {
    this.mode = 'frozen';
    this.yawCenter = null;
    this._tween = {
      t: 0,
      dur: 0.85,
      fromPos: this.position.clone(),
      toPos: new THREE.Vector3(target.x, EYE_STAND, target.z),
      fromPitch: this.pitch,
      toPitch: 0,
      fromYaw: this.yaw,
      toYaw: this.yaw,
      onDone: () => {
        this.mode = 'walk';
        this.pitchMin = -Math.PI / 2 + 0.05;
        this.pitchMax = Math.PI / 2 - 0.05;
        this.eyeHeight = EYE_STAND;
        this.targetEye = EYE_STAND;
        done?.();
      },
    };
  }

  /** Place the player lying in bed at the start of the game. */
  layInBed(pos, yaw) {
    this.mode = 'bed';
    this.position.set(pos.x, pos.y, pos.z);
    this.yaw = yaw;
    this.pitch = 0.95; // staring at the ceiling
    this.pitchMin = 0.15;
    this.pitchMax = Math.PI / 2 - 0.05;
    this.yawCenter = yaw;
    this.yawRange = 1.15;
  }

  /* ---------------------------------------------------------------- */
  /* Update                                                            */
  /* ---------------------------------------------------------------- */

  update(dt) {
    if (this._tween) {
      const tw = this._tween;
      tw.t += dt;
      const k = clamp(tw.t / tw.dur, 0, 1);
      const e = easeInOutCubic(k);
      this.position.lerpVectors(tw.fromPos, tw.toPos, e);
      this.pitch = lerp(tw.fromPitch, tw.toPitch, e);
      this.yaw = lerp(tw.fromYaw, shortestAngle(tw.fromYaw, tw.toYaw), e);
      this.eyeHeight = this.position.y;
      if (k >= 1) {
        this._tween = null;
        tw.onDone?.();
      }
      this._applyCamera(dt);
      return;
    }

    if (this.mode === 'walk' && this.enabled) this._updateWalk(dt);
    else this.velocity.set(0, 0, 0);

    this._applyCamera(dt);
  }

  _updateWalk(dt) {
    const k = this.keys;
    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);

    this.crouching = k.has('KeyC');
    this.sprinting = (k.has('ShiftLeft') || k.has('ShiftRight')) && !this.crouching && fwd > 0;

    this.targetEye = this.crouching ? EYE_CROUCH : EYE_STAND;
    this.eyeHeight += (this.targetEye - this.eyeHeight) * Math.min(1, dt * 9);

    const maxSpeed = this.crouching
      ? SPEED_CROUCH
      : this.sprinting
        ? SPEED_SPRINT
        : SPEED_WALK;

    // Desired velocity in world space.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * strafe;
    let wz = -cos * fwd - sin * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }

    const desiredX = wx * maxSpeed;
    const desiredZ = wz * maxSpeed;
    const rate = len > 0 ? ACCEL : FRICTION;
    this.velocity.x += (desiredX - this.velocity.x) * Math.min(1, dt * rate);
    this.velocity.z += (desiredZ - this.velocity.z) * Math.min(1, dt * rate);

    if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
    if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;

    // Move + resolve, one axis at a time so we slide along walls.
    const before = _tmpV.set(this.position.x, 0, this.position.z);
    this.position.x += this.velocity.x * dt;
    this._resolve('x');
    this.position.z += this.velocity.z * dt;
    this._resolve('z');

    const moved = Math.hypot(this.position.x - before.x, this.position.z - before.z);

    // Head bob + footsteps driven by distance travelled, not time, so they
    // stay in step when the player changes speed.
    const speed = moved / Math.max(dt, 1e-4);
    this.bobAmount += (Math.min(speed / SPEED_WALK, 1.4) - this.bobAmount) * Math.min(1, dt * 8);
    this.bobPhase += moved * 3.4;
    this.rollTarget = -strafe * 0.014 * (this.sprinting ? 1.5 : 1);

    this._stepDist += moved;
    const stride = this.crouching ? 1.05 : this.sprinting ? 0.92 : 0.78;
    if (this._stepDist >= stride) {
      this._stepDist = 0;
      this.onFootstep?.(this.surfaceAt(this.position), this.crouching ? 0.4 : this.sprinting ? 1.15 : 1);
    }
  }

  /** Push the player capsule out of any collider it is overlapping. */
  _resolve(axis) {
    const p = this.position;
    for (const box of this.world.colliders) {
      if (p.y + 0.05 < box.min.y || p.y - this.eyeHeight > box.max.y) continue;

      const cx = clamp(p.x, box.min.x, box.max.x);
      const cz = clamp(p.z, box.min.z, box.max.z);
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= RADIUS * RADIUS) continue;

      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = RADIUS - d;
        if (axis === 'x') {
          p.x += (dx / d) * push;
          this.velocity.x = 0;
        } else {
          p.z += (dz / d) * push;
          this.velocity.z = 0;
        }
      } else {
        // Dead centre inside the box: eject along the shallowest axis.
        const toMinX = p.x - box.min.x;
        const toMaxX = box.max.x - p.x;
        const toMinZ = p.z - box.min.z;
        const toMaxZ = box.max.z - p.z;
        const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
        if (m === toMinX) p.x = box.min.x - RADIUS;
        else if (m === toMaxX) p.x = box.max.x + RADIUS;
        else if (m === toMinZ) p.z = box.min.z - RADIUS;
        else p.z = box.max.z + RADIUS;
        this.velocity.set(0, 0, 0);
      }
    }
  }

  /** Which floor material the player is standing on (drives footstep cue). */
  surfaceAt(p) {
    for (const zone of this.world.floorZones) {
      if (p.x >= zone.box.min.x && p.x <= zone.box.max.x &&
          p.z >= zone.box.min.z && p.z <= zone.box.max.z) {
        return zone.surface;
      }
    }
    return 'wood';
  }

  _applyCamera(dt) {
    const cam = this.camera;

    let y = this.mode === 'walk' ? this.eyeHeight : this.position.y;
    let bobX = 0;
    if (this.mode === 'walk') {
      y += Math.sin(this.bobPhase * 2) * 0.022 * this.bobAmount;
      bobX = Math.cos(this.bobPhase) * 0.026 * this.bobAmount;
    }

    this.roll += (this.rollTarget - this.roll) * Math.min(1, dt * 7);

    const sideX = Math.cos(this.yaw) * bobX;
    const sideZ = -Math.sin(this.yaw) * bobX;
    cam.position.set(this.position.x + sideX, y, this.position.z + sideZ);

    // In YXZ order the components are (pitch, yaw, roll).
    _euler.set(this.pitch, this.yaw, this.roll, 'YXZ');
    cam.quaternion.setFromEuler(_euler);
  }
}

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _tmpV = new THREE.Vector3();

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
/** Return a target angle rewritten so lerping from `from` takes the short way. */
function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d;
}
