/** Shared, side-effect-free construction for the three NO WAKE execution guns. */
import * as THREE from 'three';

import { makeNineMillimeterPistol, makeRevolver } from '../world/props.js';

export const NO_WAKE_GUN_MOUNT_ROTATION = new THREE.Euler(-Math.PI / 2, 0, Math.PI);
const NINE_MM_GRIP = new THREE.Vector3(0, -0.0377123373, 0.0557002539);
const HAND_IN_FOREARM = new THREE.Vector3(0, -0.30, 0.005);
export const NO_WAKE_MUZZLE_FLASH_SECONDS = 0.10;
export const NO_WAKE_TRACER_SECONDS = 0.12;

function buildMuzzleFlash(gun) {
  const flash = new THREE.Group();
  flash.name = `${gun.name} muzzle flash`;
  const material = new THREE.MeshBasicMaterial({
    color: 0xffd487,
    transparent: true,
    opacity: 0,
    toneMapped: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  for (const orientation of [[0, Math.PI / 2, Math.PI / 2], [Math.PI / 2, 0, 0]]) {
    const petal = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.16), material);
    petal.rotation.set(...orientation);
    flash.add(petal);
  }
  flash.position.copy(gun.userData.muzzle);
  flash.position.z -= 0.05;
  flash.visible = false;
  gun.userData.flash = flash;
  gun.userData.flashMaterial = material;
  gun.userData.flashTtl = 0;
  gun.add(flash);
  return flash;
}

function executionGun(model, name, calibre, scale = 1) {
  const gun = model.group;
  gun.name = name;
  gun.scale.setScalar(scale);
  gun.userData.weaponModel = calibre;
  gun.userData.muzzle = model.muzzle.clone();
  buildMuzzleFlash(gun);
  return gun;
}

/** Mount the exact authored runtime weapons and return their three roots. */
export function mountNoWakeExecutionGuns({ boat, camera }) {
  if (!boat?.cast?.lou?.parts?.foreR || !boat?.cast?.booski?.parts?.foreR || !camera?.add) {
    throw new Error('NO WAKE execution geometry requires Lou, Booski and a camera parent');
  }
  const louGun = executionGun(
    makeNineMillimeterPistol(null, { x: 0, y: 0, z: 0 }),
    'Lou 9mm pistol',
    '9mm semi-automatic',
    1.15,
  );
  const booskiGun = executionGun(
    makeNineMillimeterPistol(null, { x: 0, y: 0, z: 0 }),
    'Booski 9mm pistol',
    '9mm semi-automatic',
    1.15,
  );
  boat.cast.lou.parts.foreR.add(louGun);
  boat.cast.booski.parts.foreR.add(booskiGun);
  for (const gun of [louGun, booskiGun]) {
    gun.rotation.copy(NO_WAKE_GUN_MOUNT_ROTATION);
    const grip = NINE_MM_GRIP.clone()
      .multiplyScalar(gun.scale.x)
      .applyEuler(NO_WAKE_GUN_MOUNT_ROTATION);
    gun.position.copy(HAND_IN_FOREARM).sub(grip);
    gun.userData.basePosition = gun.position.clone();
    gun.userData.baseRotation = gun.rotation.clone();
    gun.userData.recoil = 0;
  }
  const playerGun = executionGun(
    makeRevolver(null, { x: 0, y: 0, z: 0 }),
    'Tony revolver',
    'six-shot revolver',
    1.35,
  );
  playerGun.position.set(0.20, -0.24, -0.34);
  playerGun.rotation.set(0.06, -0.16, 0);
  playerGun.visible = false;
  camera.add(playerGun);
  return { louGun, booskiGun, playerGun };
}

/** Both carriers need both hands after the execution. Keep the authored gun
 * mounts for the volley, then holster them before the wrapped-body lift. */
export function stowNoWakeExecutionGunsGeometry(guns = {}) {
  for (const gun of [guns.louGun, guns.booskiGun, guns.playerGun]) {
    if (gun) gun.visible = false;
  }
}

export function flashNoWakeMuzzle(gun) {
  if (!gun?.userData?.flash) return;
  gun.userData.flashTtl = NO_WAKE_MUZZLE_FLASH_SECONDS;
  gun.userData.flash.visible = true;
  gun.userData.flash.rotation.z = Math.random() * Math.PI;
  gun.userData.flashMaterial.opacity = 1;
  gun.userData.flash.scale.setScalar(1.1);
}
