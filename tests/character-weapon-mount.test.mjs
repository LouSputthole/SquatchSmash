import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { makePerson } from '../src/bing/cast.js';
import { WEAPON_IDS, WEAPON_ORDER } from '../src/core/weapons/catalog.js';
import {
  CHARACTER_WEAPON_MOUNTS,
  CHARACTER_WEAPON_MOUNT_PITCH,
  CHARACTER_WEAPON_MOUNT_ROLL,
  alignCharacterWeaponGrip,
  mountCharacterWeapon,
} from '../src/core/weapons/character-mount.js';
import { buildWeaponModel } from '../src/core/weapons/models.js';
import { makeBankGuardFigure, makePoliceFigure } from '../src/heist/people.js';
import { mountNoWakeExecutionGuns } from '../src/nowake/execution-geometry.js';
import { mountHandRevolver } from '../src/silvercase/props/weapon.js';

const worldDirection = (object, local) => {
  const q = object.getWorldQuaternion(new THREE.Quaternion());
  return local.clone().applyQuaternion(q).normalize();
};

function assertRightSideUp(figure, gun, label) {
  figure.group.updateMatrixWorld(true);
  const bore = worldDirection(gun, new THREE.Vector3(0, 0, -1));
  const sights = worldDirection(gun, new THREE.Vector3(0, 1, 0));
  const foreDown = worldDirection(figure.foreR, new THREE.Vector3(0, -1, 0));
  const handBack = worldDirection(figure.foreR, new THREE.Vector3(0, 0, 1));
  assert.ok(bore.dot(foreDown) > 0.999999, `${label} bore left the firing forearm`);
  assert.ok(sights.dot(handBack) > 0.999999, `${label} sights are upside down`);
}

test('every catalog weapon has one immutable right-side-up character mount', () => {
  assert.deepEqual(Object.keys(CHARACTER_WEAPON_MOUNTS).sort(), [...WEAPON_ORDER].sort());
  for (const id of WEAPON_ORDER) {
    const config = CHARACTER_WEAPON_MOUNTS[id];
    assert.ok(Object.isFrozen(config), `${id} mount is mutable`);
    assert.deepEqual(config.rotation,
      [CHARACTER_WEAPON_MOUNT_PITCH, 0, CHARACTER_WEAPON_MOUNT_ROLL]);
    assert.equal(config.grip.length, 3);
  }
});
test('the shared mount puts every real catalog grip in the visible hand', () => {
  for (const [bodyIndex, look] of [
    { height: 1.62, build: 0.9, gender: 'female', bodyShape: 'curvy' },
    { height: 1.95, build: 1.45, gut: 0.5 },
  ].entries()) {
    for (const id of WEAPON_ORDER) {
      const parts = makePerson({ ...look, dress: 'suit', trim: true, face: null });
      const gun = buildWeaponModel(id);
      assert.equal(mountCharacterWeapon(parts, id, gun), gun);
      parts.group.updateMatrixWorld(true);

      const grip = gun.localToWorld(new THREE.Vector3().fromArray(CHARACTER_WEAPON_MOUNTS[id].grip));
      const hand = parts.handR.getWorldPosition(new THREE.Vector3());
      assert.ok(grip.distanceTo(hand) < 1e-8,
        `body ${bodyIndex} ${id} grip missed by ${grip.distanceTo(hand)}`);
      assertRightSideUp(parts, gun, `${bodyIndex}.${id}`);
    }
  }
});

test('a scene pitch variant cannot lose the canonical roll or grip alignment', () => {
  const parts = makePerson({ height: 1.84, build: 1.2, dress: 'suit', face: null });
  const gun = buildWeaponModel(WEAPON_IDS.REVOLVER);
  const rotation = [CHARACTER_WEAPON_MOUNT_PITCH + 0.12, 0, CHARACTER_WEAPON_MOUNT_ROLL];
  parts.foreR.add(gun);
  assert.equal(alignCharacterWeaponGrip(parts, WEAPON_IDS.REVOLVER, gun, {
    rotation, scale: 1.35,
  }), gun);
  parts.group.updateMatrixWorld(true);
  const grip = gun.localToWorld(new THREE.Vector3().fromArray(CHARACTER_WEAPON_MOUNTS.revolver.grip));
  const hand = parts.handR.getWorldPosition(new THREE.Vector3());
  assert.ok(grip.distanceTo(hand) < 1e-8);
  assert.equal(gun.rotation.z, Math.PI);
});

test('Silver Case, Heist and NO WAKE adapters all consume the shared mount contract', () => {
  const silver = makePerson({ height: 1.8, build: 1.1, dress: 'suit', face: null });
  const silverGun = mountHandRevolver(silver.foreR);
  assert.equal(silverGun.userData.characterWeaponId, WEAPON_IDS.REVOLVER);
  assert.ok(worldDirection(silverGun, new THREE.Vector3(0, 1, 0))
    .dot(worldDirection(silver.foreR, new THREE.Vector3(0, 0, 1))) > 0.99);

  const guard = makeBankGuardFigure({ name: 'mount-guard', x: 0, z: 0, yaw: 0 });
  const guardGun = guard.root.getObjectByName('mount-guard-gun');
  assert.equal(guardGun.userData.characterWeaponId, WEAPON_IDS.PISTOL9);
  const officer = makePoliceFigure({ name: 'mount-officer', x: 0, z: 0, yaw: 0 });
  assert.equal(officer.root.userData.weapon.userData.characterWeaponId, WEAPON_IDS.PISTOL9);

  const lou = { parts: makePerson({ height: 1.83, dress: 'suit', face: null }) };
  const booski = { parts: makePerson({ height: 1.8, dress: 'suit', face: null }) };
  const camera = new THREE.Group();
  const guns = mountNoWakeExecutionGuns({ boat: { cast: { lou, booski } }, camera });
  assert.equal(guns.louGun.userData.characterWeaponId, WEAPON_IDS.PISTOL9);
  assert.equal(guns.booskiGun.userData.characterWeaponId, WEAPON_IDS.PISTOL9);
  assert.equal(guns.playerGun.parent, camera, 'the first-person gun stays a camera viewmodel');
});
