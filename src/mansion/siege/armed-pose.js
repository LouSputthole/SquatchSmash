/**
 * One weapon-in-hands contract for both sides of Mansion Siege.
 *
 * The shared weapon models all point down local -Z, but their origins are at
 * different places in their receivers. A universal forearm offset therefore
 * put the long-gun grips 12-13 cm outside the firing hand and left the support
 * hand more than half a metre away. These per-model anchors name the actual
 * grip and the useful part of the fore-end. Authored poses get the full CCD
 * solve; live aim uses a bounded warm-started correction only when the hand
 * has actually drifted, so steering the rendered bore cannot tear the support
 * hand loose or add the full authoring cost to every frame.
 */
import * as THREE from 'three';

/**
 * WHICH WAY UP A MOUNTED GUN GOES.
 *
 * Owner, playtest 2026-08-13: *"all the main characters are holding their guns
 * upsidedown"*. Measured, and he is right about all of them: before this
 * change every visible weapon in the house had a world up-vector between
 * -0.42 (long guns) and -0.99 (pistols).
 *
 * `RX` alone -- a -90 degree turn about X -- lays the model's bore (local -Z,
 * the convention `src/core/weapons/models.js` states at the top) down the
 * forearm's own -Y, which is right, and takes the model's UP (local +Y: the
 * rib, the sights, the top strap) round to the forearm's -Z, which is not.
 * With the arm raised into any aiming pose the forearm's -Z points at the
 * floor, so the sights did too and the grip stood up out of the fist.
 *
 * `RZ` is the missing half: 180 degrees about the model's own bore, applied
 * BEFORE the X turn, so the barrel direction is untouched and only the roll
 * changes. Model +Y now lands on the forearm's +Z, which is the back of the
 * hand -- sights up, grip in the palm.
 *
 * Rolling the model over also mirrors its X, so a support point authored at
 * local x = -0.02 would now sit on the other side of the fore-end. Those x
 * values are lateral bias on hands that were solved against the old frame, so
 * they are negated here to keep each support hand on the side of the gun it
 * was tuned for. Every grip is on x = 0 and is unaffected.
 */
const RX = -Math.PI / 2;
const RZ = Math.PI;
const MOUNT_ROTATION = Object.freeze([RX, 0, RZ]);

export const SIEGE_WEAPON_MOUNTS = Object.freeze({
  revolver: Object.freeze({
    scale: 0.85,
    rotation: MOUNT_ROTATION,
    grip: Object.freeze([0, -0.0153926682, 0.0662709406]),
    support: null,
  }),
  shotgun: Object.freeze({
    scale: 0.80,
    rotation: MOUNT_ROTATION,
    grip: Object.freeze([0, -0.05, 0.09]),
    support: Object.freeze([0, -0.002, -0.31]),
  }),
  pistol9: Object.freeze({
    scale: 0.85,
    rotation: MOUNT_ROTATION,
    grip: Object.freeze([0, -0.0377123373, 0.0557002539]),
    support: null,
  }),
  carbine: Object.freeze({
    scale: 0.85,
    rotation: MOUNT_ROTATION,
    grip: Object.freeze([0, -0.0818282691, 0.0815725017]),
    support: Object.freeze([0.02, -0.01, 0.04]),
  }),
  saw: Object.freeze({
    scale: 0.80,
    rotation: MOUNT_ROTATION,
    grip: Object.freeze([0, -0.0638515066, 0.0783417901]),
    support: Object.freeze([0.03, 0.025, 0.05]),
  }),
  barrett: Object.freeze({
    scale: 0.72,
    rotation: MOUNT_ROTATION,
    grip: Object.freeze([0, -0.1005384285, 0.1830228086]),
    support: Object.freeze([0.02, 0.03, 0.10]),
  }),
  ak47: Object.freeze({
    scale: 0.85,
    rotation: MOUNT_ROTATION,
    grip: Object.freeze([0, -0.0756661815, 0.0777549423]),
    support: Object.freeze([0.02, 0.012, 0.05]),
  }),
});

/** The mount's roll, for the two live-aim adapters that re-set it by hand. */
export const SIEGE_WEAPON_MOUNT_ROLL = RZ;

const _grip = new THREE.Vector3();
const _target = new THREE.Vector3();
const _joint = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _toHand = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _bore = new THREE.Vector3();
const _delta = new THREE.Quaternion();
const _world = new THREE.Quaternion();
const _parent = new THREE.Quaternion();
const _local = new THREE.Quaternion();

function configFor(weaponId) {
  const config = SIEGE_WEAPON_MOUNTS[weaponId];
  if (!config) throw new Error(`No Mansion Siege hand mount for ${weaponId}`);
  return config;
}

function handMesh(forearm) {
  let hand = null;
  forearm?.traverse?.((object) => {
    if (!hand && object.isMesh && /(^|\.)hand$/.test(object.name ?? '')) hand = object;
  });
  return hand;
}

/** Put the real model's primary grip at the centre of the visible right hand. */
function alignPrimaryGrip(figure, weaponId, gun) {
  const config = configFor(weaponId);
  const hand = handMesh(figure.parts.foreR);
  if (!hand) throw new Error(`${figure.root.name} has no right-hand mesh`);
  gun.rotation.set(...config.rotation);
  gun.scale.setScalar(config.scale);
  _grip.fromArray(config.grip).multiplyScalar(config.scale).applyEuler(gun.rotation);
  gun.position.copy(hand.position).sub(_grip);
  gun.userData.siegeWeaponId = weaponId;
  gun.userData.siegeMount = {
    grip: [...config.grip],
    support: config.support ? [...config.support] : null,
    scale: config.scale,
  };
  /* A newly authored pose invalidates the cheap live-aim signature below. */
  gun.userData.siegeSupportTrack = null;
  return gun;
}

/**
 * Move the left two-bone arm onto the authored fore-end point.
 *
 * CCD is used here because the wardrobe has several heights/builds. A fixed
 * Euler tuned on a 1.78 m body is exactly how the heavy gunner's hand ended up
 * floating. Eight two-joint passes converge below a millimetre on every
 * authored Siege body while retaining the braced pose as the starting bend.
 */
function solveSupportHand(figure, gun, support, {
  passes = 8,
  tolerance = 0.012,
} = {}) {
  const fore = figure.parts.foreL;
  const upper = figure.parts.armL;
  const hand = handMesh(fore);
  if (!hand) return false;
  const passLimit = Math.max(1, Math.min(8, Math.trunc(Number(passes) || 1)));
  const wantedTolerance = Math.max(0.001, Number(tolerance) || 0.012);
  figure.root.updateMatrixWorld(true);
  _target.fromArray(support);
  gun.localToWorld(_target);
  hand.getWorldPosition(_hand);
  if (_hand.distanceTo(_target) <= wantedTolerance) return true;

  for (let pass = 0; pass < passLimit; pass++) {
    for (const joint of [fore, upper]) {
      figure.root.updateMatrixWorld(true);
      joint.getWorldPosition(_joint);
      hand.getWorldPosition(_hand);
      _toHand.copy(_hand).sub(_joint);
      _toTarget.copy(_target).sub(_joint);
      if (_toHand.lengthSq() < 1e-8 || _toTarget.lengthSq() < 1e-8) continue;
      _delta.setFromUnitVectors(_toHand.normalize(), _toTarget.normalize());
      joint.getWorldQuaternion(_world);
      joint.parent.getWorldQuaternion(_parent).invert();
      _local.copy(_parent).multiply(_delta).multiply(_world).normalize();
      joint.quaternion.copy(_local);
    }
  }
  figure.root.updateMatrixWorld(true);
  return hand.getWorldPosition(_hand).distanceTo(_target) <= wantedTolerance;
}

/** Attach a newly built catalog model and align its primary grip. */
export function mountSiegeWeapon(figure, weaponId, gun, { name = null } = {}) {
  if (!figure?.parts?.foreR || !gun?.isObject3D) return null;
  if (name) gun.name = name;
  figure.parts.foreR.add(gun);
  return alignPrimaryGrip(figure, weaponId, gun);
}

/** Re-align after an authored pose and optionally put the support hand on it. */
export function syncSiegeWeaponPose(figure, gun, { support = true } = {}) {
  const weaponId = gun?.userData?.siegeWeaponId;
  if (!weaponId || !gun.visible) return false;
  const config = configFor(weaponId);
  if (support) {
    if (config.support) {
      // Bring the firing hand across the chest before solving the support arm.
      // The previous shoulder-level Euler put the receiver outside the left
      // arm's reach even though the gun itself was attached correctly.
      figure.parts.armR.rotation.set(-0.8, 0.95, -0.8);
      figure.parts.foreR.rotation.set(-0.16, 0, 0);
      figure.parts.armL.rotation.set(-1.2, 0, -0.34);
      figure.parts.foreL.rotation.set(-0.3, 0.3, 0);
    } else {
      // Pistols are deliberately one-handed: raised and readable, with the
      // other arm relaxed instead of pretending there is a rifle fore-end.
      figure.parts.armR.rotation.set(-1.28, 0, 0.16);
      figure.parts.foreR.rotation.set(-0.16, 0, 0);
      figure.parts.armL.rotation.set(0, 0, 0);
      figure.parts.foreL.rotation.set(0, 0, 0);
    }
  }
  alignPrimaryGrip(figure, weaponId, gun);
  if (support) {
    /* Live bore steering rotates the weapon inside this forearm frame. Keep
     * the authored shoulder frame separately so a combat adapter can restore
     * it without resetting the gun quaternion or repeating the mount solve. */
    gun.userData.siegeAimArmR = figure.parts.armR.quaternion.clone();
  }
  if (!support || !config.support) return true;
  return solveSupportHand(figure, gun, config.support);
}

/**
 * Keep both authored hands on a gun while live aim steers its visible bore.
 * The primary grip is translated back into the firing hand and a long gun's
 * independent support arm is solved afterward. This deliberately does not call
 * `alignPrimaryGrip`: resetting the weapon quaternion after CombatWeaponAim
 * would make the hand look right by making the shot point wrong.
 */
export function trackSiegeWeaponSupport(figure, gun, {
  passes = 8,
  tolerance = 0.003,
  aimFrame = null,
} = {}) {
  const weaponId = gun?.userData?.siegeWeaponId;
  if (!weaponId || !gun.visible) return false;
  const config = configFor(weaponId);
  const joints = [
    gun, figure.parts.armR, figure.parts.foreR, figure.parts.armL, figure.parts.foreL,
  ];
  const previous = gun.userData.siegeSupportTrack;
  /* Root motion rotates both the gun and both hands together, so only these
   * local joint quaternions can change their relationship. Avoid even a world
   * matrix walk when live aim has settled and those locals are unchanged. */
  const unchanged = previous?.supported === true
    && joints.every((joint, index) => (
      1 - Math.abs(joint.quaternion.dot(previous.quaternions[index])) <= 1e-7
  ));
  if (unchanged) return true;

  /* CombatWeaponAim has to rotate the catalog model around its receiver
   * origin to own the rendered bore. Every primary grip is offset from that
   * origin, so the rotation also swings the grip out of the firing hand.
   * Translate only -- never rotate -- to put that real grip back in the hand
   * without changing the bore direction. */
  const firingHand = handMesh(figure.parts.foreR);
  if (!firingHand) return false;
  _grip.fromArray(config.grip).multiply(gun.scale).applyQuaternion(gun.quaternion);
  gun.position.copy(firingHand.position).sub(_grip);
  figure.root.updateMatrixWorld(true);

  /* The shot/tracer frame must start at the muzzle that is actually rendered
   * after that translation. Direction is sampled too so this helper cannot
   * turn a presentation correction into a stale fire-control endpoint. */
  if (aimFrame?.origin?.isVector3 && gun.userData.muzzle?.isVector3) {
    gun.localToWorld(aimFrame.origin.copy(gun.userData.muzzle));
    if (aimFrame.direction?.isVector3) {
      gun.getWorldQuaternion(_world);
      aimFrame.direction.copy(_bore.set(0, 0, -1).applyQuaternion(_world).normalize());
    }
  }

  const supported = !config.support
    || solveSupportHand(figure, gun, config.support, { passes, tolerance });
  gun.userData.siegeSupportTrack = {
    supported,
    quaternions: joints.map((joint) => joint.quaternion.clone()),
  };
  return supported;
}

/** The common ready stance used when a cartel actor is spawned/recycled. */
export function braceSiegeWeapon(figure, gun) {
  figure.pose = 'aiming';
  syncSiegeWeaponPose(figure, gun, { support: true });
  return figure;
}
