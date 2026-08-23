/**
 * One catalog-weapon mount for the campaign's articulated characters.
 *
 * Every catalog model points down local -Z and uses local +Y for its sights.
 * A forearm points at the target down local -Y, so Rx(-90deg) aligns the bore.
 * The equally important Rz(180deg) happens first (Three's XYZ Euler order): it
 * rolls the model about that bore without changing aim, leaving the sights on
 * the back-of-hand side and the grip in the palm instead of upside down.
 *
 * Scenes may still own poses, recoil and support-hand IK. They must not own a
 * second copy of the catalog grip anchors or quietly omit the roll again.
 */
import * as THREE from 'three';

import { WEAPON_IDS } from './catalog.js';

export const CHARACTER_WEAPON_MOUNT_PITCH = -Math.PI / 2;
export const CHARACTER_WEAPON_MOUNT_ROLL = Math.PI;
export const CHARACTER_WEAPON_MOUNT_ROTATION = Object.freeze([
  CHARACTER_WEAPON_MOUNT_PITCH,
  0,
  CHARACTER_WEAPON_MOUNT_ROLL,
]);

/**
 * Primary-grip and useful support-hand anchors in catalog-model local space.
 *
 * These were measured against the real models, not against receiver origins.
 * `support` remains data here; a scene with two-bone arms decides how and when
 * to solve onto it. This keeps a live-aim scene from paying an IK cost merely
 * because it shares the same correctly rolled firing-hand mount.
 */
export const CHARACTER_WEAPON_MOUNTS = Object.freeze({
  [WEAPON_IDS.REVOLVER]: Object.freeze({
    scale: 0.85,
    rotation: CHARACTER_WEAPON_MOUNT_ROTATION,
    grip: Object.freeze([0, -0.0153926682, 0.0662709406]),
    support: null,
  }),
  [WEAPON_IDS.SHOTGUN]: Object.freeze({
    scale: 0.80,
    rotation: CHARACTER_WEAPON_MOUNT_ROTATION,
    grip: Object.freeze([0, -0.05, 0.09]),
    support: Object.freeze([0, -0.002, -0.31]),
  }),
  [WEAPON_IDS.PISTOL9]: Object.freeze({
    scale: 0.85,
    rotation: CHARACTER_WEAPON_MOUNT_ROTATION,
    grip: Object.freeze([0, -0.0377123373, 0.0557002539]),
    support: null,
  }),
  [WEAPON_IDS.CARBINE]: Object.freeze({
    scale: 0.85,
    rotation: CHARACTER_WEAPON_MOUNT_ROTATION,
    grip: Object.freeze([0, -0.0818282691, 0.0815725017]),
    support: Object.freeze([0.02, -0.01, 0.04]),
  }),
  [WEAPON_IDS.SAW]: Object.freeze({
    scale: 0.80,
    rotation: CHARACTER_WEAPON_MOUNT_ROTATION,
    grip: Object.freeze([0, -0.0638515066, 0.0783417901]),
    support: Object.freeze([0.03, 0.025, 0.05]),
  }),
  [WEAPON_IDS.BARRETT]: Object.freeze({
    scale: 0.72,
    rotation: CHARACTER_WEAPON_MOUNT_ROTATION,
    grip: Object.freeze([0, -0.1005384285, 0.1830228086]),
    support: Object.freeze([0.02, 0.03, 0.10]),
  }),
  [WEAPON_IDS.AK47]: Object.freeze({
    scale: 0.85,
    rotation: CHARACTER_WEAPON_MOUNT_ROTATION,
    grip: Object.freeze([0, -0.0756661815, 0.0777549423]),
    support: Object.freeze([0.02, 0.012, 0.05]),
  }),
});

const _handLocal = new THREE.Vector3();
const _gripLocal = new THREE.Vector3();
const _worldHand = new THREE.Vector3();

/** Return the immutable catalog mount row or fail at the authoring boundary. */
export function characterWeaponMount(weaponId) {
  const config = CHARACTER_WEAPON_MOUNTS[weaponId];
  if (!config) throw new Error(`No character weapon mount for ${weaponId}`);
  return config;
}

function partsOf(figure) {
  return figure?.parts ?? figure ?? null;
}

function namedHand(parent) {
  let hand = null;
  parent?.traverse?.((object) => {
    if (hand || object === parent) return;
    if (/(^|\.)hand(?:\.socket)?$/i.test(object.name ?? '')) hand = object;
  });
  return hand;
}

/**
 * Resolve the unscaled hand socket used by `makePerson`, with a named hand
 * mesh fallback for older figures. Callers on a private legacy rig may pass
 * `parent` and `handPosition`; the mount math remains shared even when that
 * rig has not exposed a socket yet.
 */
export function characterWeaponHand(figure, {
  side = 'R',
  parent = null,
  hand = null,
  handPosition = null,
} = {}) {
  const parts = partsOf(figure);
  const suffix = String(side).toUpperCase() === 'L' ? 'L' : 'R';
  const mountParent = parent ?? parts?.[`fore${suffix}`] ?? figure?.[`fore${suffix}`] ?? null;
  if (!mountParent?.isObject3D) return null;

  const socket = hand ?? parts?.[`hand${suffix}`] ?? namedHand(mountParent);
  if (socket?.isObject3D) {
    if (socket.parent === mountParent) {
      _handLocal.copy(socket.position);
    } else {
      socket.updateWorldMatrix?.(true, false);
      mountParent.updateWorldMatrix?.(true, false);
      socket.getWorldPosition(_worldHand);
      _handLocal.copy(mountParent.worldToLocal(_worldHand));
    }
  } else if (Array.isArray(handPosition) || handPosition?.isVector3) {
    if (handPosition?.isVector3) _handLocal.copy(handPosition);
    else _handLocal.fromArray(handPosition);
  } else {
    return null;
  }

  return { parent: mountParent, hand: socket ?? null, position: _handLocal.clone() };
}

/**
 * Align a mounted model's real primary grip with the visible hand centre.
 *
 * `rotation`, `scale` and `grip` are narrow scene-variant escape hatches (a
 * deliberately oversized prop, for example). Omitted values always come from
 * the catalog row, so an override cannot accidentally lose only the roll.
 */
export function alignCharacterWeaponGrip(figure, weaponId, gun, {
  side = 'R',
  parent = null,
  hand = null,
  handPosition = null,
  rotation = null,
  scale = null,
  grip = null,
} = {}) {
  if (!gun?.isObject3D) return null;
  const resolved = characterWeaponHand(figure, { side, parent, hand, handPosition });
  if (!resolved) return null;
  const config = characterWeaponMount(weaponId);
  const mountRotation = rotation ?? config.rotation;
  const mountGrip = grip ?? config.grip;
  const mountScale = Number.isFinite(scale) ? scale : config.scale;

  gun.rotation.set(...mountRotation);
  gun.scale.setScalar(mountScale);
  _gripLocal.fromArray(mountGrip).multiply(gun.scale).applyEuler(gun.rotation);
  gun.position.copy(resolved.position).sub(_gripLocal);
  gun.userData.characterWeaponId = weaponId;
  gun.userData.characterWeaponMount = {
    grip: [...mountGrip],
    support: config.support ? [...config.support] : null,
    rotation: [...mountRotation],
    scale: mountScale,
  };
  return gun;
}

/** Attach a catalog model to the firing forearm and align its primary grip. */
export function mountCharacterWeapon(figure, weaponId, gun, {
  name = null,
  ...options
} = {}) {
  if (!gun?.isObject3D) return null;
  const resolved = characterWeaponHand(figure, options);
  if (!resolved) return null;
  if (name) gun.name = name;
  resolved.parent.add(gun);
  return alignCharacterWeaponGrip(figure, weaponId, gun, {
    ...options,
    parent: resolved.parent,
    hand: resolved.hand,
    handPosition: resolved.position,
  });
}
