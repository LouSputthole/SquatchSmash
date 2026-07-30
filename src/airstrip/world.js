import * as THREE from 'three';
import {
  box,
  collider,
  cylinder,
  group,
  mat,
  sphere,
} from '../world/build.js';

export const HOME_STRIP = Object.freeze({ x: 0, z: 0, halfWidth: 18, halfLength: 190 });
export const REMOTE_STRIP = Object.freeze({ x: 0, z: -1500, halfWidth: 16, halfLength: 175 });
export const BORDER_Z = -760;

const M = {
  grass: mat({ color: 0x586643, roughness: 1 }),
  remoteGrass: mat({ color: 0x334a31, roughness: 1 }),
  runway: mat({ color: 0x373b3d, roughness: 0.96 }),
  dirt: mat({ color: 0x705b43, roughness: 1 }),
  white: mat({ color: 0xe6e2d4, roughness: 0.9 }),
  hangar: mat({ color: 0x737b7c, roughness: 0.72, metalness: 0.25 }),
  hangarDark: mat({ color: 0x333a3c, roughness: 0.78, metalness: 0.2 }),
  wood: mat({ color: 0x6d4d31, roughness: 1 }),
  jerky: mat({ color: 0x8f3b28, roughness: 0.95 }),
  coat: mat({ color: 0x394c63, roughness: 0.95 }),
  skin: mat({ color: 0xb98261, roughness: 0.9 }),
  black: mat({ color: 0x171a1c, roughness: 0.8 }),
  tree: mat({ color: 0x244128, roughness: 1 }),
  trunk: mat({ color: 0x4d3627, roughness: 1 }),
  mountain: mat({ color: 0x39433d, roughness: 1 }),
  red: new THREE.MeshBasicMaterial({ color: 0xff2d20, toneMapped: false }),
};

export function buildAirstripWorld(scene) {
  const root = group('airstrip world');
  scene.add(root);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 4000),
    M.grass,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -800;
  ground.receiveShadow = true;
  root.add(ground);

  buildStrip(root, HOME_STRIP, M.runway);
  buildStrip(root, REMOTE_STRIP, M.dirt);
  buildHangar(root);
  buildRemoteCamp(root);
  const captain = buildCaptain(root);
  const cargo = buildCargo(root);
  const border = buildBorder(root);
  buildForest(root);
  buildMountains(root);

  const colliders = [
    collider([-43, 0, 45], [-13, 8, 46]),
    collider([-43, 0, 45], [-42, 8, 88]),
    collider([-14, 0, 45], [-13, 8, 88]),
  ];
  const floorZones = [
    {
      box: new THREE.Box3(
        new THREE.Vector3(-HOME_STRIP.halfWidth, -1, -HOME_STRIP.halfLength),
        new THREE.Vector3(HOME_STRIP.halfWidth, 1, HOME_STRIP.halfLength),
      ),
      surface: 'tile',
    },
    {
      box: new THREE.Box3(
        new THREE.Vector3(-REMOTE_STRIP.halfWidth, -1, REMOTE_STRIP.z - REMOTE_STRIP.halfLength),
        new THREE.Vector3(REMOTE_STRIP.halfWidth, 1, REMOTE_STRIP.z + REMOTE_STRIP.halfLength),
      ),
      surface: 'wood',
    },
  ];

  return {
    root,
    captain,
    cargo,
    border,
    colliders,
    floorZones,
    groundAt: () => 0,
    anchors: {
      playerStart: new THREE.Vector3(18, 1.66, 78),
      captain: new THREE.Vector3(13, 0, 70),
      planeHome: new THREE.Vector3(0, 0, 120),
      playerRemote: new THREE.Vector3(7, 1.66, -1490),
      cargo: new THREE.Vector3(18, 0, -1510),
    },
    atRemoteStrip(x, z) {
      return Math.abs(x - REMOTE_STRIP.x) <= REMOTE_STRIP.halfWidth + 8
        && Math.abs(z - REMOTE_STRIP.z) <= REMOTE_STRIP.halfLength;
    },
    atHomeStrip(x, z) {
      return Math.abs(x - HOME_STRIP.x) <= HOME_STRIP.halfWidth + 8
        && Math.abs(z - HOME_STRIP.z) <= HOME_STRIP.halfLength;
    },
    update(dt, elapsed) {
      for (let i = 0; i < border.lights.length; i++) {
        border.lights[i].material.opacity = 0.35 + Math.sin(elapsed * 4 + i) * 0.3;
      }
      captain.rotation.y = Math.sin(elapsed * 0.35) * 0.03;
      cargo.rotation.y += dt * 0.03;
    },
  };
}

function buildStrip(root, strip, material) {
  root.add(box({
    size: [strip.halfWidth * 2, 0.08, strip.halfLength * 2],
    pos: [strip.x, 0.01, strip.z],
    mat: material,
    cast: false,
  }));
  for (let z = strip.z - strip.halfLength + 16;
    z < strip.z + strip.halfLength - 10; z += 28) {
    root.add(box({
      size: [0.55, 0.025, 9],
      pos: [strip.x, 0.07, z],
      mat: M.white,
      cast: false,
    }));
  }
  for (const x of [strip.x - strip.halfWidth + 0.5, strip.x + strip.halfWidth - 0.5]) {
    root.add(box({
      size: [0.22, 0.03, strip.halfLength * 2 - 4],
      pos: [x, 0.07, strip.z],
      mat: M.white,
      cast: false,
    }));
  }
}

function buildHangar(root) {
  root.add(box({ size: [30, 8, 1], pos: [-28, 4, 45], mat: M.hangar }));
  root.add(box({ size: [1, 8, 43], pos: [-43, 4, 66.5], mat: M.hangar }));
  root.add(box({ size: [1, 8, 43], pos: [-13, 4, 66.5], mat: M.hangar }));
  root.add(box({ size: [31, 0.5, 44], pos: [-28, 8.2, 66.5], mat: M.hangarDark }));
  root.add(box({ size: [8, 2.5, 0.25], pos: [-28, 5.3, 44.4], mat: M.hangarDark }));
  const label = makeLabel('SASOLE AIR', '#f1e4c3', '#253442', 640, 120);
  label.position.set(-28, 5.3, 43.8);
  label.scale.set(8, 1.5, 1);
  root.add(label);

  root.add(box({ size: [2.2, 3, 2.2], pos: [-8, 1.5, 15], mat: M.hangarDark }));
  root.add(box({ size: [6, 0.3, 6], pos: [-8, 3.15, 15], mat: M.hangar }));
}

function buildCaptain(root) {
  const g = group('Captain Lou Sasole');
  g.position.set(13, 0, 70);
  g.add(cylinder({ r: 0.34, h: 1.25, pos: [0, 1.05, 0], mat: M.coat }));
  g.add(sphere({ r: 0.31, pos: [0, 1.9, 0], mat: M.skin }));
  g.add(box({ size: [0.78, 0.08, 0.52], pos: [0, 2.16, 0], mat: M.black }));
  g.add(box({ size: [0.55, 0.16, 0.2], pos: [0, 2.08, -0.22], mat: M.black }));
  for (const x of [-0.2, 0.2]) {
    g.add(cylinder({ r: 0.11, h: 0.8, pos: [x, 0.4, 0], mat: M.black }));
  }
  const label = makeLabel('CAPT. LOU SASOLE', '#f4e7c9', '#22344a', 640, 96);
  label.position.set(0, 2.72, 0);
  label.scale.set(3.7, 0.55, 1);
  g.add(label);
  root.add(g);
  return g;
}

function buildRemoteCamp(root) {
  root.add(box({ size: [18, 4, 10], pos: [28, 2, -1510], mat: M.wood }));
  root.add(box({ size: [20, 0.4, 12], pos: [28, 4.2, -1510], mat: M.black }));
  const sign = makeLabel('NORTH WOODS OUTFITTERS', '#e8d7af', '#4c2e1d', 720, 100);
  sign.position.set(28, 3, -1504.85);
  sign.scale.set(8, 1.1, 1);
  root.add(sign);
}

function buildCargo(root) {
  const g = group('jerky cargo');
  g.position.set(18, 0, -1510);
  for (let i = 0; i < 8; i++) {
    const x = (i % 3) * 0.9 - 0.9;
    const y = Math.floor(i / 3) * 0.7 + 0.35;
    const z = (i % 2) * 0.75 - 0.35;
    g.add(box({ size: [0.78, 0.62, 0.68], pos: [x, y, z], mat: M.wood }));
    g.add(box({ size: [0.48, 0.04, 0.7], pos: [x, y + 0.18, z - 0.35], mat: M.jerky }));
  }
  const label = makeLabel('BEEF JERKY', '#ffe2a3', '#7c241d', 480, 100);
  label.position.set(0, 2.7, 0);
  label.scale.set(3.5, 0.75, 1);
  g.add(label);
  root.add(g);
  return g;
}

function buildBorder(root) {
  const groupNode = group('border watch');
  const lights = [];
  for (const x of [-120, 120]) {
    groupNode.add(cylinder({ r: 0.35, h: 18, pos: [x, 9, BORDER_Z], mat: M.hangarDark }));
    groupNode.add(box({ size: [4, 2.5, 4], pos: [x, 17, BORDER_Z], mat: M.hangar }));
    const light = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xff3322,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }));
    light.position.set(x, 19, BORDER_Z);
    light.scale.set(5, 5, 1);
    groupNode.add(light);
    lights.push(light);
  }
  const line = box({
    size: [500, 0.08, 1.3],
    pos: [0, 0.08, BORDER_Z],
    mat: M.red,
    cast: false,
  });
  groupNode.add(line);
  root.add(groupNode);
  return { group: groupNode, lights };
}

function buildForest(root) {
  const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.32, 4, 6);
  const crownGeometry = new THREE.ConeGeometry(1.7, 5.5, 7);
  const trunks = new THREE.InstancedMesh(trunkGeometry, M.trunk, 220);
  const crowns = new THREE.InstancedMesh(crownGeometry, M.tree, 220);
  const matrix = new THREE.Matrix4();
  let seed = 0x51a5cafe;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < 220; i++) {
    let x;
    let z;
    do {
      x = (rand() - 0.5) * 700;
      z = 250 - rand() * 2400;
    } while (
      Math.abs(x) < 34
      && (Math.abs(z) < 240 || Math.abs(z - REMOTE_STRIP.z) < 230)
    );
    const scale = 0.75 + rand() * 1.5;
    matrix.makeScale(scale, scale, scale);
    matrix.setPosition(x, 2 * scale, z);
    trunks.setMatrixAt(i, matrix);
    matrix.makeScale(scale, scale, scale);
    matrix.setPosition(x, 5.7 * scale, z);
    crowns.setMatrixAt(i, matrix);
  }
  trunks.castShadow = crowns.castShadow = true;
  root.add(trunks, crowns);
}

function buildMountains(root) {
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (210 + (i % 4) * 55);
    const z = -1050 - Math.floor(i / 2) * 110;
    const h = 75 + (i % 5) * 18;
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(55 + (i % 3) * 12, h, 7),
      M.mountain,
    );
    mountain.position.set(x, h / 2 - 2, z);
    mountain.receiveShadow = true;
    root.add(mountain);
  }
}

function makeLabel(text, color, background, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, width - 16, height - 16);
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.floor(height * 0.42)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: false,
  }));
  return sprite;
}
