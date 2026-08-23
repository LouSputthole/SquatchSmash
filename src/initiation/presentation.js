/**
 * Initiation execution presentation, isolated from the scene director.
 *
 * The director decides who is shot and when a beat begins. This module owns
 * what the shared catalog revolver looks like in a character hand and the one
 * intentionally absurd eight-shot volley's deterministic rhythm. Keeping the
 * rhythm as data makes it a joke with timing, not eight random timer calls.
 */
import * as THREE from 'three';

import { WEAPON_IDS } from '../core/weapons/catalog.js';
import { mountCharacterWeapon } from '../core/weapons/character-mount.js';
import { buildWeaponModel } from '../core/weapons/models.js';

export const INITIATION_EXECUTION_WEAPON = WEAPON_IDS.REVOLVER;
export const INITIATION_MUZZLE_FLASH_SECONDS = 0.085;

/** Two shots, a breath; three, a longer breath; the final three. */
export const INITIATION_BARRAGE_SHOTS = Object.freeze([
  Object.freeze({ at: 0.00, group: 0, inGroup: 0 }),
  Object.freeze({ at: 0.28, group: 0, inGroup: 1 }),
  Object.freeze({ at: 0.68, group: 1, inGroup: 0 }),
  Object.freeze({ at: 0.94, group: 1, inGroup: 1 }),
  Object.freeze({ at: 1.22, group: 1, inGroup: 2 }),
  Object.freeze({ at: 1.72, group: 2, inGroup: 0 }),
  Object.freeze({ at: 2.01, group: 2, inGroup: 1 }),
  Object.freeze({ at: 2.32, group: 2, inGroup: 2 }),
]);

function buildMuzzleFlash(gun) {
  const flash = new THREE.Group();
  flash.name = 'initiation.revolver.muzzle-flash';
  const material = new THREE.MeshBasicMaterial({
    color: 0xffd486,
    transparent: true,
    opacity: 0,
    toneMapped: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  for (const rotation of [[0, Math.PI / 2, Math.PI / 2], [Math.PI / 2, 0, 0]]) {
    const petal = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.22), material);
    petal.rotation.set(...rotation);
    flash.add(petal);
  }
  flash.position.copy(gun.userData.muzzle);
  flash.position.z -= 0.035;
  flash.visible = false;
  gun.add(flash);
  gun.userData.initiationFlash = flash;
  gun.userData.initiationFlashMaterial = material;
  gun.userData.initiationFlashTtl = 0;
}
/** Build the same six-shot model and muzzle contract the weapon system uses. */
export function buildInitiationExecutionRevolver() {
  const gun = buildWeaponModel(INITIATION_EXECUTION_WEAPON);
  gun.name = 'initiation.execution.revolver';
  buildMuzzleFlash(gun);
  return gun;
}

/**
 * Put the catalog revolver in either a makePerson figure or the legacy
 * Initiation Person while its remaining cast migration is in flight.
 */
export function mountInitiationExecutionRevolver(holder, gun, {
  name = 'initiation.execution.revolver',
  scale = null,
} = {}) {
  const modern = Boolean(holder?.parts?.foreR);
  const mounted = mountCharacterWeapon(holder, INITIATION_EXECUTION_WEAPON, gun, {
    name,
    parent: modern ? holder.parts.foreR : holder?.armR,
    hand: modern ? holder.parts.handR : null,
    handPosition: modern ? null : [0, -0.95, 0],
    scale: Number.isFinite(scale) ? scale : modern ? 0.85 : 1.35,
  });
  if (!mounted) return null;
  mounted.userData.initiationBasePosition = mounted.position.clone();
  mounted.userData.initiationBaseQuaternion = mounted.quaternion.clone();
  mounted.userData.initiationRecoil = 0;
  return mounted;
}

/** Trigger one deterministic flash/recoil pulse; the director reacts victims. */
export function fireInitiationExecutionRevolver(gun, shotIndex = 0) {
  if (!gun?.userData?.initiationFlash) return false;
  const index = Math.max(0, Math.trunc(shotIndex));
  const flash = gun.userData.initiationFlash;
  flash.visible = true;
  flash.rotation.z = (index % 6) * (Math.PI / 6);
  flash.scale.setScalar(0.92 + (index % 3) * 0.09);
  gun.userData.initiationFlashMaterial.opacity = 1;
  gun.userData.initiationFlashTtl = INITIATION_MUZZLE_FLASH_SECONDS;
  gun.userData.initiationRecoil = 1;
  return true;
}

/** Age flash and recoil on the scene's simulation clock, never wall timers. */
export function updateInitiationExecutionRevolver(gun, dt) {
  if (!gun?.userData?.initiationBasePosition) return 0;
  const delta = Math.max(0, Number(dt) || 0);
  const flash = gun.userData.initiationFlash;
  let flashTtl = Math.max(0, (gun.userData.initiationFlashTtl ?? 0) - delta);
  gun.userData.initiationFlashTtl = flashTtl;
  if (flash) {
    flash.visible = flashTtl > 0;
    gun.userData.initiationFlashMaterial.opacity = Math.min(1, flashTtl / 0.045);
  }

  const recoil = Math.max(0, (gun.userData.initiationRecoil ?? 0) - delta * 8.5);
  gun.userData.initiationRecoil = recoil;
  gun.position.copy(gun.userData.initiationBasePosition);
  gun.quaternion.copy(gun.userData.initiationBaseQuaternion);
  gun.translateZ(recoil * 0.055);
  gun.rotateX(-recoil * 0.22);
  return recoil;
}

/** World-space flash/light origin from the rendered catalog muzzle. */
export function initiationRevolverMuzzleWorld(gun, out = new THREE.Vector3()) {
  if (!gun?.userData?.muzzle) return null;
  return gun.localToWorld(out.copy(gun.userData.muzzle));
}

/**
 * Deterministic event source for the standing execution barrage.
 * `update(dt)` returns every shot crossed this frame, so a slow frame cannot
 * silently turn an eight-shot bit into six.
 */
export class InitiationBarrageClock {
  constructor(shots = INITIATION_BARRAGE_SHOTS) {
    this.shots = shots;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.next = 0;
    this.running = false;
    return this;
  }

  start() {
    this.reset();
    this.running = true;
    return this;
  }

  update(dt) {
    if (!this.running) return [];
    this.elapsed += Math.max(0, Number(dt) || 0);
    const due = [];
    while (this.next < this.shots.length && this.shots[this.next].at <= this.elapsed + 1e-9) {
      due.push(Object.freeze({ index: this.next, ...this.shots[this.next] }));
      this.next++;
    }
    if (this.next >= this.shots.length) this.running = false;
    return due;
  }

  get done() { return this.next >= this.shots.length; }
}
