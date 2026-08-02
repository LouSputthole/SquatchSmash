import * as THREE from 'three';

import { Npc, makePerson } from '../bing/cast.js';
import { assetUrl, inlineManifest } from '../core/assets.js';
import { BILLY_HOTDOG_MODEL } from '../core/hotdog-model.js';
import { box, collider, cylinder, emissive, group, mat, sphere } from '../world/build.js';
import { GRAVES } from './mission.js';

const STONE = mat({ color: 0x666a67, roughness: 0.98 });
const STONE_LIGHT = mat({ color: 0x8c8f88, roughness: 0.94 });
const STONE_DARK = mat({ color: 0x343735, roughness: 1 });
const DIRT = mat({ color: 0x24180f, roughness: 1 });
const FRESH_DIRT = mat({ color: 0x382315, roughness: 1 });
const GRASS = mat({ color: 0x101d13, roughness: 1 });
const ROAD = mat({ color: 0x241f19, roughness: 1 });
const BARK = mat({ color: 0x281b14, roughness: 1 });
const NEEDLES = mat({ color: 0x0a1a10, roughness: 1 });
const BLACK = mat({ color: 0x050505, roughness: 0.8 });
const CHROME = mat({ color: 0x9ba2a3, roughness: 0.25, metalness: 0.82 });

/**
 * The five authored Family memorials supplied for this scene. Keeping the
 * presentation data separate from GRAVES means story tier and interaction
 * data remain authoritative while the world builder has one testable source
 * for the artwork treatment. Colton's name is already carved into his image;
 * every other portrait receives a physical nameplate below the relief.
 */
export const GRAVE_ART_PRESENTATION = Object.freeze({
  babs: Object.freeze({
    slot: 'grave.babs', file: 'graveyard/babs.webp', aspect: 0.8, panelHeight: 1.35,
    embeddedName: false,
  }),
  brawny: Object.freeze({
    slot: 'grave.brawny', file: 'graveyard/brawny.webp', aspect: 853 / 1280, panelHeight: 0.72,
    embeddedName: false,
  }),
  whiplash: Object.freeze({
    slot: 'grave.whiplash', file: 'graveyard/whiplash.webp', aspect: 853 / 1280,
    panelHeight: 0.56, panelBottom: 0.39, panelZ: 0.147,
    nameplateHeight: 0.14, nameplateY: 0.27, nameplateZ: 0.174,
    embeddedName: false, transparent: true,
  }),
  echo: Object.freeze({
    slot: 'grave.echo', file: 'graveyard/echo.jpg', aspect: 1, panelHeight: 0.62,
    embeddedName: false,
  }),
  colton: Object.freeze({
    slot: 'grave.colton', file: 'graveyard/colton.webp', aspect: 0.75, panelHeight: 0.95,
    embeddedName: true,
  }),
});

export const BABS_BENCH_PRESENTATION = Object.freeze({
  position: Object.freeze([-9.35, 0, -2.25]),
  yaw: Math.PI / 2,
  colliderMin: Object.freeze([-9.7, 0, -3.3]),
  colliderMax: Object.freeze([-9, 1.25, -1.2]),
});

const GRAVE_ART_DIR = 'assets/art/';
const graveArtLoader = new THREE.TextureLoader();

function graveArtTexture(art) {
  const manifest = inlineManifest(GRAVE_ART_DIR, 'manifest.json');
  const bundled = manifest?.art?.find((entry) => entry.slot === art.slot)?.file;
  const texture = graveArtLoader.load(assetUrl(GRAVE_ART_DIR, bundled || art.file));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function seeded(seed = 0x5a51e) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
}

function labelTexture(name, epitaph = '') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = 'rgba(20, 22, 20, .88)';
  g.fillRect(16, 18, 480, 194);
  g.strokeStyle = '#b8a978';
  g.lineWidth = 8;
  g.strokeRect(22, 24, 468, 182);
  g.textAlign = 'center';
  g.fillStyle = '#eee4c7';
  g.shadowColor = 'rgba(0, 0, 0, .85)';
  g.shadowBlur = 8;
  g.font = '700 62px Georgia, serif';
  g.fillText(name, 256, 104);
  if (epitaph) {
    g.font = 'italic 25px Georgia, serif';
    g.fillText(epitaph, 256, 152);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function memorialNameTexture(name, epitaph = '') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = 'rgba(19, 20, 19, .96)';
  g.fillRect(12, 10, 488, 140);
  g.strokeStyle = '#c0ad76';
  g.lineWidth = 7;
  g.strokeRect(19, 17, 474, 126);
  g.textAlign = 'center';
  g.fillStyle = '#f2e8ca';
  g.shadowColor = 'rgba(0, 0, 0, .9)';
  g.shadowBlur = 7;
  g.font = epitaph ? '700 58px Georgia, serif' : '700 72px Georgia, serif';
  g.fillText(name, 256, epitaph ? 72 : 104);
  if (epitaph) {
    g.font = 'italic 25px Georgia, serif';
    g.fillText(epitaph, 256, 120);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function graveMarker(id, x, z, yaw = 0) {
  const data = GRAVES[id];
  const art = GRAVE_ART_PRESENTATION[id] ?? null;
  const g = group(`grave.${id}`);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  g.userData.graveId = id;
  const ruined = data.tier === 'ruined';
  const monument = data.tier === 'monument';
  const reserved = data.open;
  const height = monument ? 1.65 : reserved ? 0.65 : ruined ? 0.82 : 1.05;
  const width = monument ? 1.5 : reserved ? 0.9 : 0.82;
  const stone = monument ? STONE_LIGHT : ruined ? STONE_DARK : STONE;

  const base = box({ size: [width + 0.34, 0.16, 0.42], pos: [0, 0.08, 0], mat: stone });
  const slab = box({ size: [width, height, 0.24], pos: [0, 0.16 + height / 2, 0], mat: stone });
  if (ruined) {
    slab.rotation.z = id === 'brawny' ? -0.18 : 0.14;
    slab.rotation.x = 0.05;
  }
  g.add(base, slab);

  if (art) {
    const panelWidth = art.panelHeight * art.aspect;
    const panelBottom = art.panelBottom
      ?? (id === 'babs' ? 0.35 : id === 'colton' ? 0.22 : id === 'echo' ? 0.42 : 0.24);
    const panelY = panelBottom + art.panelHeight / 2;
    const panelZ = art.panelZ ?? 0.147;
    const frame = box({
      size: [panelWidth + 0.055, art.panelHeight + 0.055, 0.035],
      pos: [0, panelY, 0.127],
      mat: STONE_DARK,
    });
    frame.name = `grave.${id}.art-frame`;
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(panelWidth, art.panelHeight),
      new THREE.MeshBasicMaterial({
        map: graveArtTexture(art),
        color: 0xd8d8d3,
        fog: true,
        transparent: art.transparent === true,
        alphaTest: art.transparent ? 0.025 : 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    panel.name = `grave.${id}.art`;
    panel.position.set(0, panelY, panelZ);
    panel.renderOrder = art.transparent ? 1 : 0;
    panel.userData.memorialArt = {
      graveId: id,
      file: `${GRAVE_ART_DIR}${art.file}`,
      embeddedName: art.embeddedName,
    };
    g.add(frame, panel);

    if (!art.embeddedName) {
      const nameplateHeight = art.nameplateHeight ?? (monument ? 0.23 : 0.16);
      const nameplate = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.78, nameplateHeight),
        new THREE.MeshBasicMaterial({
          map: memorialNameTexture(data.name, monument ? 'FAMILY FIRST' : ruined ? 'TRAITOR' : ''),
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
        }),
      );
      nameplate.name = `grave.${id}.name`;
      nameplate.position.set(
        0,
        art.nameplateY ?? (monument ? 0.31 : 0.32),
        art.nameplateZ ?? 0.154,
      );
      nameplate.renderOrder = 2;
      nameplate.userData.memorialName = data.name;
      g.add(nameplate);
    }
  } else {
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.82, Math.min(0.68, height * 0.58)),
      new THREE.MeshBasicMaterial({
        map: labelTexture(data.name, monument ? 'FAMILY FIRST' : ruined ? 'TRAITOR' : ''),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    plaque.name = `grave.${id}.name`;
    plaque.userData.memorialName = data.name;
    // The plots extend toward +Z, which is also the player's approach. These
    // used to sit on -Z, behind the slab, so every name was physically hidden.
    plaque.position.set(0, 0.2 + height * 0.56, 0.127);
    g.add(plaque);
  }

  if (monument) {
    const cap = box({ size: [1.78, 0.16, 0.46], pos: [0, height + 0.24, 0], mat: STONE_LIGHT });
    const urn = cylinder({ rTop: 0.17, rBottom: 0.24, h: 0.45, seg: 12, pos: [0, height + 0.53, 0], mat: STONE_LIGHT });
    g.add(cap, urn);
    for (const sx of [-1, 1]) {
      const flowers = group('babs.flowers');
      flowers.position.set(sx * 0.82, 0.18, 0.41);
      flowers.add(cylinder({ r: 0.11, h: 0.24, pos: [0, 0, 0], mat: mat({ color: 0x6e6255, roughness: 0.9 }) }));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        flowers.add(sphere({
          r: 0.09,
          pos: [Math.cos(a) * 0.18, 0.22 + (i % 2) * 0.065, Math.sin(a) * 0.18],
          mat: mat({ color: i % 2 ? 0x8f2638 : 0xe4d5ad, roughness: 0.9 }),
        }));
      }
      g.add(flowers);
    }
  }

  if (ruined) {
    for (let i = 0; i < 5; i++) {
      const weed = cylinder({ rTop: 0.008, rBottom: 0.016, h: 0.35 + i * 0.04, seg: 5, pos: [-0.48 + i * 0.22, 0.18, -0.15], mat: mat({ color: 0x394122, roughness: 1 }) });
      weed.rotation.z = (i - 2) * 0.12;
      g.add(weed);
    }
  }

  return { group: g, slab, collider: collider([x - width / 2, 0, z - 0.18], [x + width / 2, height + 0.6, z + 0.18], 0.04) };
}

function openPlot(name, x, z, { occupied = false } = {}) {
  const g = group(name);
  const pitDepth = 0.22;
  const pit = box({ size: [1.05, 0.025, 2.15], pos: [x, -pitDepth, z], mat: BLACK, cast: false });
  pit.material = pit.material.clone();
  pit.material.color.setHex(0x050403);
  const innerLeft = box({ size: [0.1, 0.34, 2.15], pos: [x - 0.57, -0.06, z], mat: DIRT });
  const innerRight = box({ size: [0.1, 0.34, 2.15], pos: [x + 0.57, -0.06, z], mat: DIRT });
  const innerHead = box({ size: [1.25, 0.34, 0.1], pos: [x, -0.06, z - 1.1], mat: DIRT });
  const innerFoot = box({ size: [1.25, 0.34, 0.1], pos: [x, -0.06, z + 1.1], mat: DIRT });
  const left = box({ size: [0.38, 0.24, 2.35], pos: [x - 0.76, 0.12, z], mat: FRESH_DIRT });
  const right = box({ size: [0.38, 0.24, 2.35], pos: [x + 0.76, 0.12, z], mat: FRESH_DIRT });
  const end = box({ size: [1.85, 0.18, 0.34], pos: [x, 0.09, z + 1.26], mat: FRESH_DIRT });
  g.add(pit, innerLeft, innerRight, innerHead, innerFoot, left, right, end);
  if (occupied) {
    const mound = box({ size: [1.08, 0.08, 2.06], pos: [x, 0.055, z], mat: DIRT });
    mound.visible = false;
    mound.name = `${name}.mound`;
    g.add(mound);
  }
  return g;
}

function pine(x, z, scale = 1) {
  const g = group('pine');
  const trunk = cylinder({ rTop: 0.17 * scale, rBottom: 0.24 * scale, h: 5.2 * scale, seg: 8, pos: [x, 2.6 * scale, z], mat: BARK });
  g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry((2.0 - i * 0.28) * scale, 2.8 * scale, 9),
      NEEDLES,
    );
    crown.position.set(x, (4.0 + i * 1.05) * scale, z);
    crown.castShadow = i < 2;
    g.add(crown);
  }
  return g;
}

function parkedCar() {
  const car = group('snow.car');
  car.position.set(0, 0, 15.2);
  const paint = mat({ color: 0x314554, roughness: 0.38, metalness: 0.42 });
  const glass = mat({ color: 0x182a34, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.72 });
  car.add(
    box({ size: [2.0, 0.52, 4.55], pos: [0, 0.55, 0], mat: paint }),
    box({ size: [1.72, 0.72, 2.25], pos: [0, 1.05, 0.22], mat: paint }),
    box({ size: [1.6, 0.48, 0.04], pos: [0, 1.12, -0.92], mat: glass, rotX: -0.22 }),
    box({ size: [1.6, 0.42, 0.04], pos: [0, 1.12, 1.24], mat: glass, rotX: 0.22 }),
    box({ size: [2.04, 0.12, 0.16], pos: [0, 0.43, -2.34], mat: CHROME }),
    box({ size: [2.04, 0.12, 0.16], pos: [0, 0.43, 2.34], mat: CHROME }),
    box({ size: [0.58, 0.2, 0.035], pos: [0, 0.61, 2.43], mat: emissive(0xd8d2bb, 0.38), cast: false }),
  );
  // Snow leaves the trunk standing open while they unload HotDog. It gives
  // the arrival composition an immediate story read instead of a parked-car
  // silhouette with a body inexplicably lying by the headlights.
  const trunkLid = box({
    size: [1.7, 0.13, 0.9],
    pos: [0, 1.24, 2.18],
    mat: paint,
    rotX: -1.05,
  });
  car.add(trunkLid);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.22, 16);
  for (const x of [-1.04, 1.04]) for (const z of [-1.45, 1.45]) {
    const wheel = new THREE.Mesh(wheelGeo, BLACK);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    car.add(wheel);
  }
  for (const x of [-0.62, 0.62]) {
    const lamp = box({ size: [0.43, 0.22, 0.045], pos: [x, 0.67, -2.3], mat: emissive(0xffe3ad, 4.2), cast: false });
    car.add(lamp);
  }
  for (const x of [-0.7, 0.7]) {
    car.add(box({ size: [0.32, 0.19, 0.04], pos: [x, 0.68, 2.3], mat: emissive(0x7a100c, 0.72), cast: false }));
  }
  return car;
}

export function hotDogBody() {
  const body = group('hotdog.body');
  body.userData.characterId = 'billy_hotdog';
  body.userData.presentation = 'character';
  body.userData.bodyPhase = 'trunk';

  const parts = makePerson({ ...BILLY_HOTDOG_MODEL, castShadow: true });
  const figure = parts.group;
  figure.name = 'hotdog.figure';
  // Centre the real standing rig around this prop root, then put it on its
  // back. Local -Z is HotDog's head and +Z is his feet from here on out.
  figure.position.set(0, 0, 0.9);
  figure.rotation.x = -Math.PI / 2;
  parts.head.rotation.z = 0.1;
  parts.armL.rotation.set(-0.18, 0, -0.34);
  parts.armR.rotation.set(-0.1, 0, 0.28);
  parts.foreL.rotation.x = -0.22;
  parts.foreR.rotation.x = -0.16;
  parts.legL.rotation.x = 0.05;
  parts.legR.rotation.x = -0.04;
  for (const eye of parts.eyes ?? []) eye.scale.y *= 0.16;
  body.add(figure);

  // He was wrapped at the club, but the plastic now reads as bands around a
  // recognizable suit, face, shoes and belly instead of replacing him with a
  // capsule. The actual HotDog rig remains the thing being carried.
  const plastic = new THREE.MeshStandardMaterial({
    color: 0xe8e2d5, roughness: 0.7, transparent: true, opacity: 0.33,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const wraps = [
    { z: -0.42, width: 0.27, height: 0.16 },
    { z: 0.14, width: 0.34, height: 0.21 },
    { z: 0.63, width: 0.25, height: 0.13 },
  ];
  for (const { z, width, height } of wraps) {
    // A broad, flat sheet of plastic reads as wrapping. The old curved
    // TubeGeometry left a literal hose end sticking out of Billy's side.
    const band = new THREE.Mesh(new THREE.PlaneGeometry(width * 2, 0.075), plastic);
    band.name = 'hotdog.wrap-band';
    band.userData.presentation = 'flat-wrap';
    band.position.set(0, height + 0.008, z);
    band.rotation.x = -Math.PI / 2;
    band.castShadow = false;
    body.add(band);
  }

  // Open trunk: head inward, shoes protruding toward the player.
  body.position.set(0, 0.87, 17.46);
  body.userData.parts = parts;
  return { group: body, parts };
}

function moonVisual() {
  const moon = group('graveyard.moon');
  const disc = new THREE.Mesh(
    new THREE.SphereGeometry(1.9, 28, 18),
    new THREE.MeshBasicMaterial({ color: 0xcad9df, fog: false }),
  );
  disc.name = 'graveyard.moon.disc';
  moon.add(disc);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const glow = g.createRadialGradient(128, 128, 22, 128, 128, 126);
  glow.addColorStop(0, 'rgba(210, 230, 238, .29)');
  glow.addColorStop(0.42, 'rgba(158, 194, 209, .09)');
  glow.addColorStop(1, 'rgba(120, 160, 180, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
  }));
  halo.name = 'graveyard.moon.halo';
  halo.scale.set(10.2, 10.2, 1);
  moon.add(halo);
  moon.position.set(-18, 25, -48);
  return moon;
}

export function buildGraveyard(scene) {
  const root = group('squatch.graveyard');
  scene.add(root);
  const visibleMoon = moonVisual();
  root.add(visibleMoon);
  const colliders = [];
  const floorZones = [{ box: new THREE.Box3(new THREE.Vector3(-50, -1, -50), new THREE.Vector3(50, 1, 50)), surface: 'grass' }];

  root.add(box({ size: [72, 0.12, 72], pos: [0, -0.07, 0], mat: GRASS, cast: false }));
  root.add(
    box({ size: [7.2, 0.035, 22], pos: [0, 0.008, 24], mat: ROAD, cast: false }),
    box({ size: [1.8, 0.024, 30], pos: [0, 0.012, -2], mat: ROAD, cast: false }),
  );
  floorZones.unshift({ box: new THREE.Box3(new THREE.Vector3(-3.6, -1, -10), new THREE.Vector3(3.6, 1, 35)), surface: 'dirt' });

  const rng = seeded();
  for (let i = 0; i < 62; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (10 + rng() * 24);
    const z = -27 + rng() * 62;
    const s = 0.78 + rng() * 0.58;
    root.add(pine(x, z, s));
    if (Math.abs(x) < 14) colliders.push(collider([x - 0.22 * s, 0, z - 0.22 * s], [x + 0.22 * s, 5.2 * s, z + 0.22 * s], 0.04));
  }
  for (let i = 0; i < 22; i++) {
    const x = -12 + rng() * 24;
    const z = -31 - rng() * 7;
    root.add(pine(x, z, 0.78 + rng() * 0.5));
  }

  // Invisible forest boundary: the clearing feels open while the playable
  // ground remains compact and every edge is backed by trees.
  colliders.push(
    collider([-31, 0, -38], [-15, 5, 35], 0),
    collider([15, 0, -38], [31, 5, 35], 0),
    collider([-31, 0, -40], [31, 5, -34], 0),
    collider([-31, 0, 34], [31, 5, 40], 0),
  );

  const layout = [
    ['babs', -6.0, -3.5, 0.01],
    ['brawny', -2.3, -4.2, -0.05],
    ['whiplash', 2.0, -4.1, 0.07],
    ['sheep', 5.7, -3.6, -0.02],
    ['echo', -6.0, -10.1, 0.02],
    ['colton', -2.2, -10.3, -0.03],
    ['geewiz', 2.1, -10.2, 0.01],
    ['sauce', 5.8, -10.0, 0.02],
  ];
  const graves = {};
  const plotMeshes = {};
  for (const [id, x, z, yaw] of layout) {
    const marker = graveMarker(id, x, z, yaw);
    root.add(marker.group);
    colliders.push(marker.collider);
    graves[id] = marker.group;
    if (id !== 'sauce') {
      const plot = box({ size: [1.25, 0.06, 2.25], pos: [x, 0.035, z + 1.23], mat: DIRT, cast: false });
      root.add(plot);
      plotMeshes[id] = plot;
    }
  }
  const saucePlot = openPlot('grave.sauce.open', 5.8, -8.42);
  root.add(saucePlot);
  // The pits read as deep set pieces, but the shared walking controller has no
  // pit traversal. Block their dark openings so Tony cannot stand on empty air.
  colliders.push(collider([5.17, 0, -9.48], [6.43, 1.2, -7.34], 0.02));

  const freshPlot = openPlot('grave.hotdog.fresh', 0, -17.0, { occupied: true });
  const freshMound = freshPlot.getObjectByName('grave.hotdog.fresh.mound');
  root.add(freshPlot);
  colliders.push(collider([-0.63, 0, -18.08], [0.63, 1.2, -15.92], 0.02));
  const temporary = graveMarker('geewiz', 0, -18.55, 0).group;
  temporary.name = 'hotdog.temporary-marker';
  const label = temporary.children.find((child) => child.material?.map);
  if (label) {
    label.material = label.material.clone();
    label.material.map = labelTexture('BILLY HOTDOG', 'HOME, BRIEFLY');
    label.material.needsUpdate = true;
  }
  temporary.visible = false;
  root.add(temporary);

  // Move Babs's bench into the west tree line and turn it 180 degrees back
  // toward the clearing. It keeps the headstone approach and central aisle
  // open while giving the requested forest-edge view.
  const bench = group('babs.bench');
  bench.position.set(...BABS_BENCH_PRESENTATION.position);
  bench.rotation.y = BABS_BENCH_PRESENTATION.yaw;
  bench.add(
    box({ size: [2.0, 0.14, 0.52], pos: [0, 0.52, 0], mat: STONE_LIGHT }),
    box({ size: [2.0, 0.65, 0.13], pos: [0, 0.86, -0.25], mat: STONE_LIGHT }),
    box({ size: [0.15, 0.48, 0.42], pos: [-0.7, 0.25, 0], mat: STONE_LIGHT }),
    box({ size: [0.15, 0.48, 0.42], pos: [0.7, 0.25, 0], mat: STONE_LIGHT }),
  );
  root.add(bench);
  colliders.push(collider(
    BABS_BENCH_PRESENTATION.colliderMin,
    BABS_BENCH_PRESENTATION.colliderMax,
    0.03,
  ));

  const car = parkedCar();
  root.add(car);
  colliders.push(collider([-1.18, 0, 12.85], [1.18, 1.45, 17.55], 0.08));
  const trunkLight = new THREE.PointLight(0xffcf91, 13.5, 7, 1.8);
  trunkLight.position.set(-0.15, 1.55, 17.75);
  scene.add(trunkLight);

  const headlightTargets = [];
  for (const x of [-0.62, 0.62]) {
    const light = new THREE.SpotLight(0xffdfaa, 110, 36, Math.PI / 6.8, 0.78, 1.18);
    light.position.set(x, 0.78, 12.75);
    const target = new THREE.Object3D();
    target.position.set(x * 1.8, 0.05, -17.5);
    scene.add(target);
    light.target = target;
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0003;
    scene.add(light);
    headlightTargets.push({ light, target });
  }
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(8.5, 30),
    new THREE.MeshBasicMaterial({ color: 0xffdca0, transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.018, -1.8);
  root.add(pool);

  const hotdog = hotDogBody();
  const body = hotdog.group;
  root.add(body);
  const shovel = group('burial.shovel');
  shovel.add(
    cylinder({ r: 0.035, h: 1.45, seg: 10, pos: [0, 0.73, 0], mat: mat({ color: 0x6b482b, roughness: 0.92 }) }),
    box({ size: [0.34, 0.42, 0.055], pos: [0, 0.08, 0], mat: CHROME }),
    box({ size: [0.34, 0.08, 0.06], pos: [0, 1.48, 0], mat: mat({ color: 0x6b482b, roughness: 0.92 }) }),
  );
  shovel.position.set(1.15, 0, -16.6);
  shovel.rotation.z = -0.18;
  root.add(shovel);

  const snow = new Npc(scene, {
    name: 'Snow', tier: 'hero', job: 'stand', x: -2.1, z: -15.7, yaw: 0.25,
    colliders,
    model: {
      height: 1.7, build: 0.95, dress: 'work', shirt: 0x303a44,
      hairColour: 0x9a9a9a, skin: 0xf0cba6, face: 'assets/faces/snow.png',
    },
  });
  snow.characterId = 'snow';

  // A small key ring and flashlight make Snow read as the man who came ready.
  const keyRing = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16), CHROME);
  keyRing.position.set(0.23, 0.84, 0.1);
  snow.parts.body.add(keyRing);
  const flashlight = cylinder({ r: 0.045, h: 0.28, seg: 12, pos: [-0.2, 0.84, 0.12], mat: BLACK, rotZ: Math.PI / 2 });
  snow.parts.body.add(flashlight);

  const fireflies = [];
  const fireflyMat = emissive(0xb8d977, 2.2);
  for (let i = 0; i < 32; i++) {
    const dot = sphere({ r: 0.018, pos: [-10 + rng() * 20, 0.35 + rng() * 2.2, -27 + rng() * 35], mat: fireflyMat, cast: false, receive: false });
    dot.userData.phase = rng() * Math.PI * 2;
    dot.userData.baseY = dot.position.y;
    root.add(dot);
    fireflies.push(dot);
  }

  const echoSoil = plotMeshes.echo;

  const state = {
    echoRumble: 0,
    bodyTween: null,
    bodyPhase: 'trunk',
    burialTween: 0,
  };

  const carryPosition = new THREE.Vector3(0, -0.92, -1.72);
  const carryQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  const gravePosition = new THREE.Vector3(0, 0.07, -17.0);
  const graveQuaternion = new THREE.Quaternion();

  function startEchoRumble() {
    state.echoRumble = 2.8;
  }

  function pickUpBody(carryAnchor) {
    if (state.bodyPhase !== 'trunk' || !carryAnchor) return false;
    carryAnchor.attach(body);
    body.position.copy(carryPosition);
    body.quaternion.copy(carryQuaternion);
    state.bodyPhase = 'carrying';
    body.userData.bodyPhase = state.bodyPhase;
    return true;
  }

  function placeBody(done) {
    if (state.bodyPhase !== 'carrying' || state.bodyTween) return false;
    root.attach(body);
    state.bodyPhase = 'placing';
    body.userData.bodyPhase = state.bodyPhase;
    state.bodyTween = {
      t: 0,
      from: body.position.clone(),
      fromQuaternion: body.quaternion.clone(),
      done,
    };
    return true;
  }

  function finishBurial() {
    if (state.bodyPhase !== 'placed') return false;
    body.visible = false;
    freshMound.visible = true;
    temporary.visible = true;
    state.burialTween = 1;
    state.bodyPhase = 'buried';
    body.userData.bodyPhase = state.bodyPhase;
    return true;
  }

  function bodyPresentation() {
    const head = new THREE.Vector3();
    const feet = new THREE.Vector3();
    hotdog.parts.head.getWorldPosition(head);
    hotdog.parts.group.localToWorld(feet.set(0, 0.03, 0));
    return {
      uuid: body.uuid,
      phase: state.bodyPhase,
      characterId: body.userData.characterId,
      presentation: body.userData.presentation,
      parent: body.parent?.name ?? '',
      visible: body.visible,
      position: body.getWorldPosition(new THREE.Vector3()).toArray(),
      head: head.toArray(),
      feet: feet.toArray(),
    };
  }

  function update(dt, elapsed, playerPosition) {
    snow.update(dt, playerPosition);
    for (const dot of fireflies) {
      dot.position.y = dot.userData.baseY + Math.sin(elapsed * 0.7 + dot.userData.phase) * 0.16;
      dot.material.emissiveIntensity = 1.3 + (Math.sin(elapsed * 2.1 + dot.userData.phase) * 0.5 + 0.5) * 1.8;
    }
    if (state.echoRumble > 0) {
      state.echoRumble -= dt;
      const k = Math.min(1, state.echoRumble / 2.8);
      echoSoil.position.x = -6 + Math.sin(elapsed * 27) * 0.025 * k;
      echoSoil.position.y = 0.035 + Math.sin(elapsed * 19) * 0.008 * k;
    }
    if (state.bodyTween) {
      state.bodyTween.t = Math.min(1, state.bodyTween.t + dt / 2.3);
      const k = state.bodyTween.t;
      const smooth = k * k * (3 - 2 * k);
      body.position.lerpVectors(state.bodyTween.from, gravePosition, smooth);
      body.quaternion.slerpQuaternions(state.bodyTween.fromQuaternion, graveQuaternion, smooth);
      if (k >= 1) {
        const done = state.bodyTween.done;
        state.bodyTween = null;
        state.bodyPhase = 'placed';
        body.userData.bodyPhase = state.bodyPhase;
        done?.();
      }
    } else if (state.bodyPhase === 'carrying') {
      body.position.y = carryPosition.y + Math.sin(elapsed * 5.2) * 0.012;
    }
    if (state.burialTween > 0) {
      state.burialTween = Math.max(0, state.burialTween - dt * 0.7);
      const k = 1 - state.burialTween;
      freshMound.scale.y = Math.max(0.05, k);
      freshMound.position.y = 0.055 * Math.max(0.05, k);
    }
  }

  return {
    root,
    visibleMoon,
    colliders,
    floorZones,
    graves,
    saucePlot,
    freshPlot,
    body,
    bodyParts: hotdog.parts,
    shovel,
    snow,
    car,
    headlightTargets,
    echoPosition: new THREE.Vector3(-6, 0, -8.9),
    freshPosition: new THREE.Vector3(0, 0, -17),
    startEchoRumble,
    pickUpBody,
    placeBody,
    finishBurial,
    bodyPresentation,
    update,
  };
}
