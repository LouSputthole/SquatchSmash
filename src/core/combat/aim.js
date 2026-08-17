import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3(0, 0, 0);

const DEFAULTS = Object.freeze({
  turnRate: 6,
  pitchRate: 8,
  minimumPitchRate: 2.5,
  boreRate: 22,
  tolerance: 0.14,
  pitchLimit: 0.85,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finite(value, fallback));
}

function angleDelta(wanted, current) {
  let delta = wanted - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function vectorLike(value) {
  return value && Number.isFinite(value.x)
    && Number.isFinite(value.y) && Number.isFinite(value.z);
}

/** Turns an NPC and its catalog weapon toward one sampled world-space point. */
export class CombatWeaponAim {
  constructor(options = {}) {
    const config = { ...DEFAULTS, ...options };
    this.turnRate = nonNegative(config.turnRate, DEFAULTS.turnRate);
    this.pitchRate = nonNegative(config.pitchRate, DEFAULTS.pitchRate);
    this.minimumPitchRate = nonNegative(
      config.minimumPitchRate, DEFAULTS.minimumPitchRate,
    );
    this.boreRate = nonNegative(config.boreRate, DEFAULTS.boreRate);
    this.tolerance = nonNegative(config.tolerance, DEFAULTS.tolerance);
    this.pitchLimit = nonNegative(config.pitchLimit, DEFAULTS.pitchLimit);
    this.localBore = options.localBore?.isVector3
      ? options.localBore.clone().normalize()
      : new THREE.Vector3(0, 0, -1);

    this._muzzle = new THREE.Vector3();
    this._bore = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._localAim = new THREE.Vector3();
    this._localUp = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._basis = new THREE.Matrix4();
    this._worldQuaternion = new THREE.Quaternion();
    this._parentInverse = new THREE.Quaternion();
    this._targetQuaternion = new THREE.Quaternion();
    /* The roll-stable basis in `_boreTarget` is built for the catalog's own
     * -Z bore convention; an exotic bore keeps the plain shortest arc. */
    this._rollFree = Math.abs(this.localBore.z + 1) < 1e-6;
    this.reset();
  }

  reset() {
    this.yaw = 0;
    this.desiredYaw = 0;
    this.pitch = 0;
    this.desiredPitch = 0;
    this.aimError = Infinity;
    this.boreError = Infinity;
    this.aligned = false;
    return this;
  }

  update(dt, {
    root = null,
    weaponModel = null,
    weaponController = null,
    targetPoint = null,
    muzzleHeight = 1.35,
    settleScale = 1,
    interrupted = false,
    pose = null,
  } = {}) {
    const step = nonNegative(dt);
    const hasRoot = root?.position && root?.rotation;
    const hasTarget = hasRoot && vectorLike(targetPoint);
    const isInterrupted = interrupted === true;

    if (hasTarget) {
      const dx = targetPoint.x - root.position.x;
      const dz = targetPoint.z - root.position.z;
      this.desiredYaw = Math.hypot(dx, dz) > 1e-5
        ? Math.atan2(dx, dz)
        : root.rotation.y;
      const beforeTurn = angleDelta(this.desiredYaw, root.rotation.y);
      root.rotation.y += beforeTurn * Math.min(1, step * this.turnRate);
      this.yaw = root.rotation.y;

      const horizontal = Math.max(0.001, Math.hypot(dx, dz));
      const approximateMuzzleY = root.position.y + finite(muzzleHeight, 1.35);
      this.desiredPitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit,
        Math.atan2(targetPoint.y - approximateMuzzleY, horizontal)));
      const woundScale = nonNegative(settleScale, 1);
      const pitchSettle = Math.max(this.minimumPitchRate, this.pitchRate * woundScale);
      this.pitch += (this.desiredPitch - this.pitch) * Math.min(1, step * pitchSettle);
      const yawError = Math.abs(angleDelta(this.desiredYaw, root.rotation.y));
      const pitchError = Math.abs(this.desiredPitch - this.pitch);
      this.aimError = Math.hypot(yawError, pitchError);
    } else {
      this.desiredYaw = hasRoot ? root.rotation.y : this.yaw;
      this.yaw = hasRoot ? root.rotation.y : this.yaw;
      this.desiredPitch = 0;
      const pitchSettle = Math.max(this.minimumPitchRate, this.pitchRate);
      this.pitch += (this.desiredPitch - this.pitch) * Math.min(1, step * pitchSettle);
      this.aimError = Infinity;
    }

    const poseFrame = {
      hasTarget,
      interrupted: isInterrupted,
      yaw: this.yaw,
      desiredYaw: this.desiredYaw,
      pitch: this.pitch,
      desiredPitch: this.desiredPitch,
      aimError: this.aimError,
      targetPoint: hasTarget ? new THREE.Vector3().copy(targetPoint) : null,
    };
    pose?.(poseFrame);

    const sampled = hasTarget
      ? this._steerAndSample(root, weaponModel, targetPoint, step, isInterrupted)
      : null;
    this.boreError = sampled?.boreError ?? Infinity;
    this.aligned = hasTarget && !isInterrupted
      && this.aimError <= this.tolerance
      && this.boreError <= this.tolerance;
    weaponController?.setAimed?.(this.aligned);

    return {
      ...poseFrame,
      aligned: this.aligned,
      boreError: this.boreError,
      origin: sampled?.origin.clone() ?? null,
      direction: sampled?.direction.clone() ?? null,
    };
  }

  /**
   * WHICH WAY UP THE GUN IS, AND WHY IT USED TO BE THE WRONG ONE.
   *
   * Owner, playtest 2026-08-13, verbatim: *"all the main characters are holding
   * their guns upsidedown"*. Measured on the real siege before this change:
   * thirteen of the fifteen weapons in the house had a world up-vector of
   * -0.42 (the long guns) to -0.99 (the pistols). Sights down, grip up, on
   * everybody.
   *
   * `setFromUnitVectors(localBore, localAim)` was the whole of it. It returns
   * the SHORTEST ARC from one direction to another, which pins the bore
   * exactly and leaves the roll to fall out of the arithmetic -- and the
   * shortest arc from a model's -Z to an arm's -Y is a -90 degree turn about
   * X, which lands the model's +Y (its rib, its sights, its ejection port) on
   * the arm's -Z. That points at the floor for every pose an aiming man holds.
   *
   * Aiming does not have one fewer degree of freedom than the model does. A
   * bore direction plus an UP reference is a complete frame, so this builds
   * one: `Matrix4.lookAt` gives a basis whose -Z is the aim and whose +Y is as
   * close to world up as that aim allows. The bore is identical to what the old
   * line produced -- `boreError` and every alignment/fire contract are
   * untouched -- and the roll is now a decision rather than a remainder.
   *
   * SHARED. Every scene that mounts `CombatWeaponAim` gets this: the Mansion
   * Siege's hostiles and its friendly ensemble, and the Cartel Palace's
   * security.
   */
  _boreTarget(out, localAim) {
    if (!this._rollFree) return out.setFromUnitVectors(this.localBore, localAim);
    /* World up, expressed in the weapon's parent frame -- `_parentInverse` is
     * already the inverse of the parent's world rotation. */
    this._localUp.copy(WORLD_UP).applyQuaternion(this._parentInverse);
    if (Math.abs(this._localUp.dot(localAim)) > 0.999) {
      /* Straight up or straight down the barrel: no usable up reference, so
       * keep the minimal arc rather than let lookAt pick one at random. */
      return out.setFromUnitVectors(this.localBore, localAim);
    }
    this._origin.copy(localAim);
    this._basis.lookAt(ORIGIN, this._origin, this._localUp);
    return out.setFromRotationMatrix(this._basis);
  }

  _steerAndSample(root, weaponModel, targetPoint, dt, interrupted) {
    const muzzle = weaponModel?.userData?.muzzle;
    if (!muzzle?.isVector3 || !weaponModel?.getWorldQuaternion) return null;

    root.updateWorldMatrix?.(true, true);
    weaponModel.localToWorld(this._muzzle.copy(muzzle));
    this._aim.copy(targetPoint).sub(this._muzzle);
    if (this._aim.lengthSq() <= 1e-8) return null;

    if (!interrupted && weaponModel.parent?.getWorldQuaternion) {
      weaponModel.parent.getWorldQuaternion(this._parentInverse).invert();
      this._localAim.copy(this._aim).normalize()
        .applyQuaternion(this._parentInverse).normalize();
      this._boreTarget(this._targetQuaternion, this._localAim);
      weaponModel.quaternion.slerp(
        this._targetQuaternion,
        1 - Math.exp(-dt * this.boreRate),
      );
      weaponModel.updateWorldMatrix?.(false, true);
    }

    weaponModel.localToWorld(this._muzzle.copy(muzzle));
    this._bore.copy(this.localBore)
      .applyQuaternion(weaponModel.getWorldQuaternion(this._worldQuaternion))
      .normalize();
    this._aim.copy(targetPoint).sub(this._muzzle);
    const boreError = this._aim.lengthSq() > 1e-8
      ? this._bore.angleTo(this._aim.normalize())
      : Infinity;
    return { boreError, origin: this._muzzle, direction: this._bore };
  }

  snapshot() {
    return {
      yaw: finite(this.yaw),
      desiredYaw: finite(this.desiredYaw),
      pitch: Math.max(-this.pitchLimit, Math.min(this.pitchLimit, finite(this.pitch))),
      desiredPitch: Math.max(-this.pitchLimit,
        Math.min(this.pitchLimit, finite(this.desiredPitch))),
      aimError: Number.isFinite(this.aimError) ? Math.max(0, this.aimError) : null,
      boreError: Number.isFinite(this.boreError) ? Math.max(0, this.boreError) : null,
    };
  }

  restore(snapshot = {}, { root = null, weaponController = null } = {}) {
    this.yaw = finite(snapshot?.yaw);
    this.desiredYaw = finite(snapshot?.desiredYaw, this.yaw);
    this.pitch = Math.max(-this.pitchLimit,
      Math.min(this.pitchLimit, finite(snapshot?.pitch)));
    this.desiredPitch = Math.max(-this.pitchLimit,
      Math.min(this.pitchLimit, finite(snapshot?.desiredPitch)));
    this.aimError = snapshot?.aimError == null
      ? Infinity : nonNegative(snapshot.aimError, Infinity);
    this.boreError = snapshot?.boreError == null
      ? Infinity : nonNegative(snapshot.boreError, Infinity);
    /* A checkpoint cannot restore the target reference or the model's exact
     * pose, so it cannot safely restore permission to fire. The next update
     * must prove both body and bore alignment again. */
    this.aligned = false;
    if (root?.rotation) root.rotation.y = this.yaw;
    weaponController?.setAimed?.(false);
    return this;
  }
}
