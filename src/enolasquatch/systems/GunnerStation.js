/**
 * GunnerStation — the player, in the tail, with the gun.
 *
 * The other half of `./Autopilot.js`. The turret, the barrels, the flashes and
 * the traverse already existed (`../scenes/EnolaSquatch.js`, `buildRearGun`) and
 * the Shubenator already worked them off the mission's own state; what did not
 * exist was a way for the PLAYER to sit in it. This is that: a camera at the
 * gunner's eye inside the glass, mouse traverse and elevation inside the
 * turret's real arc, a trigger, a finite belt, a barrel that gets too hot, and
 * a hit test that rewards leading a crossing target rather than holding the
 * button down.
 *
 * WHO IS ACTUALLY SHOOTING. Exactly one of the two of them is on the gun at
 * any moment. Take it and Shubes gets out of the way (and says so); leave it
 * and he takes it back. That is why `manned` is read by
 * `../mission/MissionController.js` before it runs `updateRearGunner()` — two
 * gunners on one gun would double the fire rate and halve the tension.
 *
 * THE HIT TEST is geometric, not a dice roll. Each round is a ray from the
 * muzzle with a small dispersion cone; a fighter is hit if the ray passes
 * within `HIT_RADIUS` of where that fighter will be when the round gets there.
 * Leading a target that is crossing at a hundred and fifty metres a second is
 * therefore a real skill and a burst held on a straight-line closing fighter
 * genuinely connects. Rounds are drawn by the shared `../combat/Tracers.js`
 * pool, so two hundred of them in the air is still one draw call.
 *
 * CAMERA CONVENTION. The airframe's nose is +Z, so an unrotated camera in the
 * aeroplane's own frame is already looking aft, which is where this camera
 * lives. Traverse is a rotation about local +Y and elevation about local +X,
 * in that order (`YXZ`), which is exactly the pair `EnolaSquatch.updateRearGun`
 * reads back out of the world aim point — so the barrels always point where
 * the reticle is, with no second convention to keep in step.
 */
import * as THREE from 'three';
import { clamp } from '../../beefrun/util.js';
import { bindLookSensitivity, shakeScale } from '../../core/settings.js';

/** How far off the round's path a fighter can be and still be hit, in metres. */
export const HIT_RADIUS = 12;
/** The belt. Runs out, and does not come back. */
export const BELT = 1400;
/** Rounds a second, per barrel pair. */
export const RATE = 11;
/** Effective range. Past this the rounds are still drawn and hit nothing. */
export const GUN_RANGE = 1250;

const TRAVERSE = 1.02;                 // rad each side, inside the model's stops
const ELEVATION = { down: -0.38, up: 0.58 };
const MUZZLE_SPEED = 860;

const _eye = new THREE.Vector3();
const _eyeLocal = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _muzzle = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _lead = new THREE.Vector3();
const _shake = new THREE.Quaternion();

export class GunnerStation {
  /**
   * @param {object} o
   * @param {object} o.aircraft EnolaSquatch — for `anchors.rearGunSeat` and the
   *   world matrix everything below is expressed in.
   * @param {object} o.interceptors Interceptors — the things to shoot at.
   * @param {object} [o.tracers] a TracerPool; the interceptors' own is reused
   *   by default so there is one pool for the whole scene.
   */
  constructor({ aircraft, interceptors, tracers = null }) {
    this.aircraft = aircraft;
    this.interceptors = interceptors;
    this.tracers = tracers || interceptors?.tracers || null;

    this.manned = false;
    this.firing = false;
    this.yaw = 0;
    this.pitch = 0;
    this.rounds = BELT;
    this.heat = 0;
    this.jammed = 0;
    this.shots = 0;
    this.hits = 0;
    this.kills = 0;
    this._roundT = 0;
    this._kick = 0;
    bindLookSensitivity(this, 0.0016); // × the player's sensitivity setting, live

    this.onShot = null;        // () => void — for the audio
    this.onHit = null;         // (fighter, result) => void
    this.onDry = null;         // () => void
    this.onJam = null;         // () => void
  }

  /** Rounds left, as a fraction of a full belt. */
  get beltFraction() { return clamp(this.rounds / BELT, 0, 1); }

  take() {
    if (this.manned) return false;
    this.manned = true;
    this.firing = false;
    return true;
  }

  leave() {
    if (!this.manned) return false;
    this.manned = false;
    this.firing = false;
    return true;
  }

  /** Mouse deltas, in the same units `CameraManager.look()` takes. */
  look(dx, dy) {
    if (!this.manned) return;
    // Right on the mouse swings the barrels to the gunner's right, which is
    // the airframe's +X — see the camera-convention note in the header.
    this.yaw = clamp(this.yaw - dx * this.sensitivity, -TRAVERSE, TRAVERSE);
    this.pitch = clamp(this.pitch - dy * this.sensitivity, ELEVATION.down, ELEVATION.up);
  }

  /**
   * Swing the turret onto a world point, if it is inside the arc.
   *
   * Clamped exactly the way `look()` is, so this cannot aim somewhere a player
   * could not — which is the whole value of it as a verification handle: a
   * fighter that can only be hit from outside the turret's stops is a fighter
   * nobody can hit.
   *
   * @returns {boolean} whether the point is actually inside the arc
   */
  pointAt(target) {
    this.aircraft.group.updateWorldMatrix(true, false);
    const local = this.aircraft.group.worldToLocal(target.clone());
    const eye = this.aircraft.rearGunEyeLocal?.(_eyeLocal)
      ?? _eyeLocal.set(
        this.aircraft.anchors.rearGunSeat.x,
        this.aircraft.anchors.rearGunSeat.y + 0.52,
        this.aircraft.anchors.rearGunSeat.z - 0.3,
      );
    const dx = local.x - eye.x;
    const dy = local.y - eye.y;
    const dz = local.z - eye.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.yaw = clamp(wantYaw, -TRAVERSE, TRAVERSE);
    this.pitch = clamp(wantPitch, ELEVATION.down, ELEVATION.up);
    return Math.abs(wantYaw - this.yaw) < 1e-6 && Math.abs(wantPitch - this.pitch) < 1e-6;
  }

  setFiring(on) {
    if (!this.manned) { this.firing = false; return; }
    this.firing = !!on && this.rounds > 0 && this.jammed <= 0;
    if (on && this.rounds <= 0) this.onDry?.();
  }

  /** The gunner's eye, in world space. */
  eyeWorld(out = new THREE.Vector3()) {
    if (this.aircraft.rearGunEyeWorld) return this.aircraft.rearGunEyeWorld(out);
    const seat = this.aircraft.anchors.rearGunSeat;
    out.set(seat.x, seat.y + 0.52, seat.z - 0.3);
    this.aircraft.group.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.aircraft.group.matrixWorld);
  }

  /** Where the barrels are pointing, in world space, as a unit vector. */
  aimWorld(out = new THREE.Vector3()) {
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    out.set(0, 0, -1).applyQuaternion(_q);
    return out.applyQuaternion(this.aircraft.group.quaternion).normalize();
  }

  /**
   * The world point the mission hands to `EnolaSquatch.updateRearGun()` so the
   * turret model follows the reticle.
   */
  aimPoint(out = new THREE.Vector3()) {
    this.eyeWorld(_eye);
    this.aimWorld(_dir);
    return out.copy(_eye).addScaledVector(_dir, 600);
  }

  /**
   * Put the camera in the turret. Called instead of `CameraManager.update()`
   * while the station is manned — see `../main.js`.
   */
  applyCamera(camera) {
    if (!this.manned) return false;
    this.eyeWorld(_eye);
    camera.position.copy(_eye);
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    camera.quaternion.copy(this.aircraft.group.quaternion).multiply(_q);
    if (this._kick > 0.001) {
      // The gun shakes the man holding it, not the aeroplane.
      const kick = this._kick * shakeScale();
      _shake.setFromEuler(new THREE.Euler(
        (Math.random() - 0.5) * kick * 0.05,
        (Math.random() - 0.5) * kick * 0.05,
        (Math.random() - 0.5) * kick * 0.06,
        'YXZ',
      ));
      camera.quaternion.multiply(_shake);
    }
    camera.updateMatrixWorld();
    return true;
  }

  /**
   * @param {number} dt
   * @returns {?object} a state block for the HUD, or null when nobody is there
   */
  update(dt) {
    this._kick = Math.max(0, this._kick - dt * 6);
    if (this.jammed > 0) {
      this.jammed = Math.max(0, this.jammed - dt);
      this.heat = Math.max(0, this.heat - dt * 0.5);
      this.firing = false;
    } else if (this.firing) {
      this.heat = clamp(this.heat + dt * 0.22, 0, 1.2);
      if (this.heat >= 1) {
        this.jammed = 3.2;
        this.firing = false;
        this.onJam?.();
      }
    } else {
      this.heat = Math.max(0, this.heat - dt * 0.16);
    }

    if (!this.manned) return null;

    if (this.firing && this.rounds > 0) {
      this._roundT -= dt;
      while (this._roundT <= 0 && this.rounds > 0) {
        this._roundT += 1 / RATE;
        this._fireRound();
      }
      if (this.rounds <= 0) {
        this.firing = false;
        this.onDry?.();
      }
    } else {
      this._roundT = Math.min(this._roundT, 0);
    }

    return this.readout();
  }

  _fireRound() {
    this.rounds -= 2;                       // two barrels, one trigger
    this.shots++;
    this._kick = 1;
    this.onShot?.();

    this.aimWorld(_dir);
    /* Fire from the steel the player can see, not an eye-relative estimate.
     * The old 2.6 m eye offset agreed only at neutral (and was still 0.46 m
     * short); at the elevation stops it separated from the modeled flashes by
     * 1.45..2.85 m. */
    if (this.aircraft.rearGunMuzzleWorld) this.aircraft.rearGunMuzzleWorld(_muzzle);
    else {
      this.eyeWorld(_eye);
      _muzzle.copy(_eye).addScaledVector(_dir, 2.6);
    }
    // Dispersion: a real cone, wider as the barrels heat up.
    const spread = 0.0022 + this.heat * 0.005;
    _dir.x += (Math.random() - 0.5) * spread * 2;
    _dir.y += (Math.random() - 0.5) * spread * 2;
    _dir.z += (Math.random() - 0.5) * spread * 2;
    _dir.normalize();

    const target = this._resolve(_muzzle, _dir);
    _aimPoint.copy(_muzzle).addScaledVector(_dir, target ? target.range : GUN_RANGE);

    this.tracers?.fire({
      from: _muzzle,
      to: _aimPoint,
      speed: MUZZLE_SPEED,
      colour: 0xa8ff7a,
      width: 0.6,
      onArrive: () => {
        if (!target) return;
        const result = this.interceptors.damage(target.fighter, 1);
        if (result === 'killed') this.kills++;
        if (result !== 'nothing') this.hits++;
        this.onHit?.(target.fighter, result);
      },
    });
  }

  /**
   * Does this round pass close enough to anything?
   *
   * The fighter is not tested where it IS, it is tested where it will be when
   * the round arrives — which is the whole of aerial gunnery and the reason a
   * player has to lead a crossing target rather than point at it.
   */
  _resolve(from, dir) {
    if (!this.interceptors) return null;
    let best = null;
    for (const f of this.interceptors.fighters) {
      if (!f.alive) continue;
      const straight = _rel.subVectors(f.position, from).dot(dir);
      if (straight <= 20 || straight > GUN_RANGE) continue;
      const flight = straight / MUZZLE_SPEED;
      _lead.copy(f.position).addScaledVector(f.velocity, flight);
      _rel.subVectors(_lead, from);
      const along = _rel.dot(dir);
      if (along <= 0) continue;
      const miss = Math.sqrt(Math.max(0, _rel.lengthSq() - along * along));
      if (miss > HIT_RADIUS) continue;
      if (!best || along < best.range) best = { fighter: f, range: along, miss };
    }
    return best;
  }

  /** What the HUD draws while the player is back there. */
  readout() {
    return {
      manned: this.manned,
      firing: this.firing,
      rounds: this.rounds,
      belt: this.beltFraction,
      heat: this.heat,
      jammed: this.jammed > 0,
      hits: this.hits,
      kills: this.kills,
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }

  /** A checkpoint restart puts the player back in the seat with a fresh belt. */
  reset() {
    this.leave();
    this.rounds = BELT;
    this.heat = 0;
    this.jammed = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.shots = 0;
    this.hits = 0;
    this.kills = 0;
  }
}
