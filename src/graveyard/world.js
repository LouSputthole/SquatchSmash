import * as THREE from 'three';

import { Npc } from '../bing/cast.js';
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
  g.textAlign = 'center';
  g.fillStyle = '#171817';
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

function graveMarker(id, x, z, yaw = 0) {
  const data = GRAVES[id];
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

  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.82, Math.min(0.68, height * 0.58)),
    new THREE.MeshStandardMaterial({
      map: labelTexture(data.name, monument ? 'FAMILY FIRST' : ruined ? 'TRAITOR' : ''),
      transparent: true,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  plaque.position.set(0, 0.2 + height * 0.56, -0.126);
  g.add(plaque);

  if (monument) {
    const cap = box({ size: [1.78, 0.16, 0.46], pos: [0, height + 0.24, 0], mat: STONE_LIGHT });
    const urn = cylinder({ rTop: 0.17, rBottom: 0.24, h: 0.45, seg: 12, pos: [0, height + 0.53, 0], mat: STONE_LIGHT });
    g.add(cap, urn);
    for (const sx of [-1, 1]) {
      const flowers = group('babs.flowers');
      flowers.position.set(sx * 0.82, 0.18, -0.36);
      flowers.add(cylinder({ r: 0.11, h: 0.24, pos: [0, 0, 0], mat: mat({ color: 0x6e6255, roughness: 0.9 }) }));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        flowers.add(sphere({ r: 0.055, pos: [Math.cos(a) * 0.13, 0.2 + (i % 2) * 0.05, Math.sin(a) * 0.13], mat: mat({ color: i % 2 ? 0xd9c7d5 : 0xd8d0ad, roughness: 0.9 }) }));
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
  const pit = box({ size: [1.05, 0.025, 2.15], pos: [x, 0.014, z], mat: BLACK, cast: false });
  pit.material = pit.material.clone();
  pit.material.color.setHex(0x050403);
  const left = box({ size: [0.38, 0.24, 2.35], pos: [x - 0.76, 0.12, z], mat: FRESH_DIRT });
  const right = box({ size: [0.38, 0.24, 2.35], pos: [x + 0.76, 0.12, z], mat: FRESH_DIRT });
  const end = box({ size: [1.85, 0.18, 0.34], pos: [x, 0.09, z + 1.26], mat: FRESH_DIRT });
  g.add(pit, left, right, end);
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

function wrappedBody() {
  const body = group('hotdog.body');
  const plastic = new THREE.MeshStandardMaterial({
    color: 0xd7d3c8, roughness: 0.48, transparent: true, opacity: 0.88,
  });
  const torso = cylinder({ rTop: 0.35, rBottom: 0.42, h: 1.55, seg: 14, pos: [0, 0, 0], mat: plastic, rotZ: Math.PI / 2 });
  torso.scale.z = 0.72;
  const head = sphere({ r: 0.34, ry: 0.39, pos: [-0.96, 0, 0], mat: plastic });
  const feet = box({ size: [0.55, 0.42, 0.48], pos: [0.98, 0, 0], mat: plastic });
  body.add(torso, head, feet);
  // Clear the rear bumper and turn the bundle broadside to the arrival view.
  // End-on, the feet box read as loose cargo and the wrapping clipped the car.
  body.position.set(2.0, 0.43, 18.15);
  body.rotation.y = 0.72;
  return body;
}

export function buildGraveyard(scene) {
  const root = group('squatch.graveyard');
  scene.add(root);
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

  // Babs's bench makes the monument a place instead of only a larger slab.
  const bench = group('babs.bench');
  bench.add(
    box({ size: [2.0, 0.14, 0.52], pos: [-8.5, 0.52, -3.0], mat: STONE_LIGHT }),
    box({ size: [2.0, 0.65, 0.13], pos: [-8.5, 0.86, -3.25], mat: STONE_LIGHT }),
    box({ size: [0.15, 0.48, 0.42], pos: [-9.2, 0.25, -3.0], mat: STONE_LIGHT }),
    box({ size: [0.15, 0.48, 0.42], pos: [-7.8, 0.25, -3.0], mat: STONE_LIGHT }),
  );
  root.add(bench);
  colliders.push(collider([-9.55, 0, -3.35], [-7.45, 1.25, -2.65], 0.03));

  const car = parkedCar();
  root.add(car);
  colliders.push(collider([-1.18, 0, 12.85], [1.18, 1.45, 17.55], 0.08));
  const trunkLight = new THREE.PointLight(0xffcf91, 18, 7, 1.8);
  trunkLight.position.set(-0.15, 1.7, 17.75);
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

  const body = wrappedBody();
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
    burialTween: 0,
  };

  function startEchoRumble() {
    state.echoRumble = 2.8;
  }

  function lowerBody(done) {
    if (state.bodyTween) return;
    state.bodyTween = { t: 0, from: body.position.clone(), done };
  }

  function finishBurial() {
    body.visible = false;
    freshMound.visible = true;
    temporary.visible = true;
    state.burialTween = 1;
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
      body.position.lerpVectors(state.bodyTween.from, new THREE.Vector3(0, -0.18, -17.0), smooth);
      body.rotation.y = 0.72 * (1 - smooth);
      if (k >= 1) {
        const done = state.bodyTween.done;
        state.bodyTween = null;
        done?.();
      }
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
    colliders,
    floorZones,
    graves,
    saucePlot,
    freshPlot,
    body,
    shovel,
    snow,
    car,
    headlightTargets,
    echoPosition: new THREE.Vector3(-6, 0, -8.9),
    freshPosition: new THREE.Vector3(0, 0, -17),
    startEchoRumble,
    lowerBody,
    finishBurial,
    update,
  };
}
