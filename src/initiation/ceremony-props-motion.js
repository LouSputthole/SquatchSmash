/**
 * Hand-prop motion for Initiation Night.
 *
 * These props used to be attached correctly but posed incorrectly: Booskibro's
 * founder staff and the execution revolver both occupied his right hand, the
 * staff followed the full walking arm swing through his coat, and the revolver
 * appeared already drawn. This module keeps the visual contract together:
 * staff in the quiet hand, sidearm on the opposite hip, one visible copy of
 * the pistol, and explicit draw/holster poses on the simulation clock.
 */
import * as THREE from 'three';

import { attachToHand } from './cabin/staging.js';

export const FOUNDER_STAFF_HAND = 'L';
export const EXECUTION_SIDEARM_HAND = 'R';

const clamp01 = (value) => THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
const smooth = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/** Build the founder's dark staff with its origin at the actual grip. */
export function buildFounderStaff() {
  const staff = new THREE.Group();
  staff.name = 'booskibro.founder.staff';
  staff.userData.intendedProp = 'founder-staff';
  staff.userData.gripAtOrigin = true;

  const darkWood = new THREE.MeshLambertMaterial({ color: 0x24140b });
  const silver = new THREE.MeshLambertMaterial({ color: 0x6f7480 });
  const amethyst = new THREE.MeshLambertMaterial({ color: 0x5d1c91 });
  const add = (geometry, material, y, name) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.y = y;
    part.name = name;
    staff.add(part);
    return part;
  };

  /* The old shaft was centred 16 cm BELOW the fist and extended 58 cm below
   * the floor at rest. With the grip 40 cm from the foot, it clears the mud,
   * reaches just above Booski's head, and can stay vertical beside his coat. */
  add(new THREE.CylinderGeometry(0.035, 0.05, 1.72, 8), darkWood, 0.48, 'staff.shaft');
  add(new THREE.CylinderGeometry(0.07, 0.055, 0.16, 8), silver, 1.39, 'staff.collar');
  add(new THREE.OctahedronGeometry(0.115, 0), amethyst, 1.56, 'staff.stone');
  add(new THREE.CylinderGeometry(0.055, 0.045, 0.11, 8), silver, -0.43, 'staff.foot');
  return staff;
}

/** Put the staff in the hand that never draws the execution revolver. */
export function mountFounderStaff(holder, staff) {
  const socket = attachToHand(holder, FOUNDER_STAFF_HAND, staff);
  if (socket) socket.userData.heldProp = 'founder-staff';
  return socket;
}

/**
 * Reapply the staff arm after the shared walk/gesture update.
 *
 * The elbow splays outward while the forearm counters it, leaving the shaft
 * nearly vertical and a full hand-width outside the torso. A restrained
 * fore/aft swing still reads while walking; the full gait swing is for the
 * free arm and would drive a 1.8 m pole through his body.
 */
export function poseFounderStaffGrip(holder, gaitPitch = 0) {
  if (!holder?.armL || !holder?.foreL) return false;
  const pitch = THREE.MathUtils.clamp(Number(gaitPitch) || 0, -0.14, 0.14);
  /* Equal counter-rotation keeps the pole vertical while the elbow moves a
   * full hand-span outboard. The previous 0.19 rad splay left only a few
   * millimetres between shaft and jacket during a turn. */
  holder.armL.rotation.set(pitch, 0, -0.44);
  holder.foreL.rotation.set(-pitch * 0.32, 0, 0.44);
  return true;
}

/** A visible leather holster and the part of a sidearm that stands above it. */
export function buildExecutionHolster(holder, { name = 'execution-sidearm' } = {}) {
  const body = holder?.parts?.body ?? holder?.body;
  if (!body) return null;
  const root = new THREE.Group();
  root.name = `${name}.holster-rig`;
  const leather = new THREE.MeshLambertMaterial({ color: 0x1d1510 });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x33383d, metalness: 0.7, roughness: 0.34,
  });
  const holster = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.075), leather);
  holster.name = `${name}.holster`;
  holster.position.set(0.20, 0.94, 0.015);
  root.add(holster);

  const holstered = new THREE.Group();
  holstered.name = `${name}.holstered-copy`;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.10, 0.045), leather);
  grip.rotation.x = -0.2;
  holstered.add(grip);
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.034, 0.06), steel);
  hammer.position.set(0, 0.055, -0.026);
  holstered.add(hammer);
  holstered.position.set(0.20, 1.055, 0.024);
  root.add(holstered);
  body.add(root);
  return { root, holster, holstered, holder, drawn: false };
}

/** Exactly one pistol is visible: on the hip or in the hand. */
export function setExecutionSidearmDrawn(receipt, gun, drawn) {
  const next = drawn === true;
  if (receipt?.holstered) receipt.holstered.visible = !next;
  if (gun) gun.visible = next;
  if (receipt) receipt.drawn = next;
  return next;
}

/** Hand reaches the hip, closes on the grip, then raises the rendered gun. */
export function poseExecutionDraw(holder, receipt, gun, progress, aimPitch = -1.42) {
  if (!holder?.armR || !holder?.foreR) return false;
  const p = clamp01(progress);
  const reach = smooth(Math.min(1, p / 0.42));
  const raise = smooth(Math.max(0, (p - 0.34) / 0.66));
  if (p >= 0.34 && receipt?.drawn !== true) setExecutionSidearmDrawn(receipt, gun, true);
  holder.armR.rotation.set(
    THREE.MathUtils.lerp(0.12 * reach, aimPitch, raise),
    0,
    THREE.MathUtils.lerp(0.18 * reach, 0.04, raise),
  );
  holder.foreR.rotation.set(THREE.MathUtils.lerp(-1.28 * reach, 0, raise), 0, 0);
  return true;
}

/** Lower the gun, return the hand to the hip, and restore the holstered copy. */
export function poseExecutionHolster(holder, receipt, gun, progress, aimPitch = -1.42) {
  if (!holder?.armR || !holder?.foreR) return false;
  const p = clamp01(progress);
  const lower = smooth(Math.min(1, p / 0.58));
  const seat = smooth(Math.max(0, (p - 0.42) / 0.58));
  holder.armR.rotation.set(
    THREE.MathUtils.lerp(aimPitch, 0.12, lower),
    0,
    THREE.MathUtils.lerp(0.04, 0.18, lower),
  );
  holder.foreR.rotation.set(THREE.MathUtils.lerp(0, -1.28, lower), 0, 0);
  if (p >= 0.78 && receipt?.drawn !== false) setExecutionSidearmDrawn(receipt, gun, false);
  if (seat >= 1) {
    holder.armR.rotation.set(0, 0, 0);
    holder.foreR.rotation.set(0, 0, 0);
  }
  return true;
}

/** One restrained hand-to-heart / raised-glass acknowledgment. */
export function poseCeremonySalute(holder, amount = 1) {
  if (!holder?.armR || !holder?.foreR) return false;
  const k = smooth(amount);
  holder.armR.rotation.set(-0.38 * k, 0, 0.18 * k);
  holder.foreR.rotation.set(-1.32 * k, 0, 0.10 * k);
  holder.head.rotation.z = -0.035 * k;
  return true;
}

/** Hold a small glass out where the person in front can visibly take it. */
export function poseCeremonyOffer(holder, amount = 1) {
  if (!holder?.armR || !holder?.foreR) return false;
  const k = smooth(amount);
  holder.armR.rotation.set(-0.74 * k, -0.05 * k, 0.26 * k);
  holder.foreR.rotation.set(-0.84 * k, 0, 0.03 * k);
  holder.head.rotation.x = -0.025 * k;
  return true;
}
