import * as THREE from 'three';

import { makeClub } from './cast.js';
import { CLUB_IDS } from './clubs.js';

export const PLAYER_CLUB_SHAFT_PITCH = 0.65;

/** Build the world-space landing estimate used while aiming a shot. */
export function createGolfLandingPreview(scene) {
  const group = new THREE.Group();
  group.name = 'golf-landing-preview';

  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffd84a,
      transparent: true,
      opacity: 0.11,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.name = 'golf-landing-preview-fill';
  fill.renderOrder = 900;
  group.add(fill);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffdf57,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.name = 'golf-landing-preview-ring';
  ring.renderOrder = 901;
  group.add(ring);

  for (const rotation of [0, Math.PI / 2]) {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.025, 0.035),
      new THREE.MeshBasicMaterial({
        color: 0xffe36b,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
      }),
    );
    line.name = 'golf-landing-preview-crosshair';
    line.rotation.y = rotation;
    line.position.y = 0.018;
    line.renderOrder = 902;
    group.add(line);
  }

  group.visible = false;
  group.renderOrder = 4;
  scene.add(group);
  return group;
}

/**
 * Build the camera-mounted club and overlapping hands used at address.
 * The function is import-safe in Node and is shared by the browser and gate.
 */
export function createPlayerClubRig(camera) {
  const rig = new THREE.Group();
  rig.name = 'player-club-rig';
  rig.position.set(0.36, -0.12, -0.55);
  rig.visible = false;

  const tilt = new THREE.Group();
  tilt.name = 'player-club-tilt';
  tilt.rotation.x = PLAYER_CLUB_SHAFT_PITCH;
  rig.add(tilt);

  const hold = new THREE.Group();
  hold.name = 'player-club-hold';
  hold.scale.setScalar(0.66);
  tilt.add(hold);

  for (const kind of CLUB_IDS) {
    const model = makeClub(kind);
    model.userData.kind = kind;
    model.visible = kind === 'iron';
    model.rotation.y = Math.PI - 0.22;
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.renderOrder = 1000;
      object.material = new THREE.MeshBasicMaterial({
        color: object.material.color?.clone?.() ?? new THREE.Color(0xffffff),
        transparent: object.material.transparent,
        opacity: object.material.opacity,
        side: object.material.side,
        fog: false,
      });
      object.material.depthTest = true;
      object.material.depthWrite = false;
    });
    hold.add(model);
  }

  const handMaterial = new THREE.MeshStandardMaterial({ color: 0xc8916d, roughness: 0.82 });
  for (const hand of [
    { y: -0.030, rz: -0.18, scale: 1.0 },
    { y: -0.132, rz: 0.15, scale: 0.94 },
  ]) {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.040, 0.030, 4, 10),
      handMaterial.clone(),
    );
    mesh.name = 'player-hand';
    mesh.position.set(0, hand.y, 0);
    mesh.scale.set(0.94 * hand.scale, 1.0 * hand.scale, 0.88 * hand.scale);
    mesh.rotation.set(0.10, 0, hand.rz);
    mesh.renderOrder = 1001;
    mesh.material.depthTest = true;
    mesh.material.depthWrite = false;
    hold.add(mesh);
  }

  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.038, 0.024, 10),
    new THREE.MeshBasicMaterial({ color: 0x2a2d34, fog: false }),
  );
  cuff.name = 'player-glove-cuff';
  cuff.position.set(0, -0.082, 0);
  cuff.rotation.z = -0.02;
  cuff.renderOrder = 1002;
  cuff.material.depthWrite = false;
  hold.add(cuff);

  camera.add(rig);
  return Object.freeze({ rig, tilt, hold });
}
