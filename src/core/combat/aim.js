import * as THREE from 'three';

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
    this._worldQuaternion = new THREE.Quaternion();
    this._parentInverse = new THREE.Quaternion();
    this._targetQuaternion = new THREE.Quaternion();
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
      this._targetQuaternion.setFromUnitVectors(this.localBore, this._localAim);
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
