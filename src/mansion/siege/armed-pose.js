/**
 * One weapon-in-hands contract for both sides of Mansion Siege.
 *
 * The shared weapon models all point down local -Z, but their origins are at
 * different places in their receivers. A universal forearm offset therefore
 * put the long-gun grips 12-13 cm outside the firing hand and left the support
 * hand more than half a metre away. These per-model anchors name the actual
 * grip and the useful part of the fore-end; the tiny CCD pass moves only the
 * support arm and runs only when a pose is authored, never per frame.
 */
import * as THREE from 'three';

const RX = -Math.PI / 2;

export const SIEGE_WEAPON_MOUNTS = Object.freeze({
  revolver: Object.freeze({
    scale: 0.85,
    rotation: Object.freeze([RX, 0, 0]),
    grip: Object.freeze([0, -0.0153926682, 0.0662709406]),
    support: null,
  }),
  pistol9: Object.freeze({
    scale: 0.85,
    rotation: Object.freeze([RX, 0, 0]),
    grip: Object.freeze([0, -0.0377123373, 0.0557002539]),
    support: null,
  }),
  carbine: Object.freeze({
    scale: 0.85,
    rotation: Object.freeze([RX, 0, 0]),
    grip: Object.freeze([0, -0.0818282691, 0.0815725017]),
    support: Object.freeze([-0.02, -0.01, 0.04]),
  }),
  saw: Object.freeze({
    scale: 0.80,
    rotation: Object.freeze([RX, 0, 0]),
    grip: Object.freeze([0, -0.0638515066, 0.0783417901]),
    support: Object.freeze([-0.03, 0.025, 0.05]),
  }),
  barrett: Object.freeze({
    scale: 0.72,
    rotation: Object.freeze([RX, 0, 0]),
    grip: Object.freeze([0, -0.1005384285, 0.1830228086]),
    support: Object.freeze([-0.02, 0.03, 0.10]),
  }),
  ak47: Object.freeze({
    scale: 0.85,
    rotation: Object.freeze([RX, 0, 0]),
    grip: Object.freeze([0, -0.0756661815, 0.0777549423]),
    support: Object.freeze([-0.02, 0.012, 0.05]),
  }),
});

const _grip = new THREE.Vector3();
const _target = new THREE.Vector3();
const _joint = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _toHand = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
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
function solveSupportHand(figure, gun, support) {
  const fore = figure.parts.foreL;
  const upper = figure.parts.armL;
  const hand = handMesh(fore);
  if (!hand) return false;
  _target.fromArray(support);
  gun.localToWorld(_target);

  for (let pass = 0; pass < 8; pass++) {
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
  return hand.getWorldPosition(_hand).distanceTo(_target) <= 0.012;
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
  if (!support || !config.support) return true;
  return solveSupportHand(figure, gun, config.support);
}

/** The common ready stance used when a cartel actor is spawned/recycled. */
export function braceSiegeWeapon(figure, gun) {
  figure.pose = 'aiming';
  syncSiegeWeaponPose(figure, gun, { support: true });
  return figure;
}
