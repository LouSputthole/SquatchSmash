import * as THREE from 'three';

import { cylinder, group, mat } from '../world/build.js';

/**
 * The one physical trace the luxury stayover was missing: Tony's and Margo's
 * unfinished coffees on opposite bedside tables. Kept as a pure builder so a
 * verifier can prove the contract resolves to renderable geometry without
 * booting the whole WebGL scene.
 */
export function makeLuxuryMorningMugs({
  left = [5.84, 0.56, -7.54],
  right = [8.27, 0.56, -7.54],
} = {}) {
  const root = group('luxury-margo-morning-mugs');
  const coffee = mat({ color: 0x2a1308, roughness: 0.72 });
  const finishes = [
    mat({ color: 0xeee4d1, roughness: 0.34 }),
    mat({ color: 0x2b2338, roughness: 0.30, metalness: 0.05 }),
  ];

  const makeMug = (name, position, finish) => {
    const cup = group(name);
    cup.position.set(...position);
    cup.userData.continuityMug = true;
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.045, 0.105, 18, 1, true),
      finish,
    );
    wall.name = `${name}-wall`;
    wall.position.y = 0.055;
    const base = cylinder({
      name: `${name}-base`, r: 0.045, h: 0.008, pos: [0, 0.006, 0], mat: finish,
    });
    const drink = cylinder({
      name: `${name}-coffee`, r: 0.044, h: 0.004, pos: [0, 0.103, 0], mat: coffee,
      cast: false,
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.051, 0.0045, 7, 22), finish);
    rim.name = `${name}-rim`;
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.107;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.006, 7, 18), finish);
    handle.name = `${name}-handle`;
    handle.position.set(0.048, 0.058, 0);
    cup.add(wall, base, drink, rim, handle);
    return cup;
  };

  root.add(
    makeMug('luxury-margo-morning-mug-tony', left, finishes[0]),
    makeMug('luxury-margo-morning-mug-margo', right, finishes[1]),
  );
  root.visible = false;
  root.userData.continuityId = 'luxury.margo-morning-mugs';
  return root;
}
