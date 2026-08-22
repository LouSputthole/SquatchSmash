import * as THREE from 'three';

export const BOUNDS = 85;

// ---------- Shared material / geometry caches ----------
// Props are built from a small set of primitives, so instances share
// geometry and materials instead of allocating their own.

/* THIS LIVES HERE, AND AN EARLIER PASS OF MINE WAS WRONG TO MOVE IT.
 *
 * It looked like shared code stranded in a legacy tree -- ten files under
 * src/ import it -- so it was moved to src/world/build.js and re-exported
 * from here. Both halves of that reading were wrong. `game/` is not legacy:
 * it is Squatch Smash, the PC game the campaign opens inside, and it has
 * EIGHTY-SIX lambert call sites of its own. And it does not merely run from
 * source -- `game/tools/bundle.mjs` flattens it into one file, stripping the
 * import lines as it goes, and line 71 of that bundler expects THIS module to
 * define `lambert`. A re-export is not an import statement, so it survived
 * the strip and the bundle refused to build.
 *
 * The dependency runs one way: src/ scenes may borrow from game/, and game/
 * borrows nothing back. MansionGrounds.js says the same over its Sasquatch
 * import. */
const matCache = new Map();

export function lambert(color, extra = null) {
  const key = extra ? `${color}|${JSON.stringify(extra)}` : String(color);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({ color, ...(extra || {}) }));
  }
  return matCache.get(key);
}

const geoCache = new Map();

function boxGeo(w, h, d) {
  const key = `b${w},${h},${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}

function cylGeo(rt, rb, h, seg, thetaStart = 0) {
  const key = `c${rt},${rb},${h},${seg},${thetaStart}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.CylinderGeometry(rt, rb, h, seg, 1, false, thetaStart));
  return geoCache.get(key);
}

function coneGeo(r, h, seg) {
  const key = `k${r},${h},${seg}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.ConeGeometry(r, h, seg));
  return geoCache.get(key);
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- Prop factories ----------
// Each returns { group, radius, hp, points, type, ... }

const TREE_GREENS = [0x3d6b2f, 0x4a7a38, 0x35603a, 0x568a3e];

function makeTree() {
  const g = new THREE.Group();
  const s = 0.8 + Math.random() * 0.8;
  const green = lambert(TREE_GREENS[Math.floor(Math.random() * TREE_GREENS.length)]);
  g.add(mesh(cylGeo(0.22, 0.3, 2.2, 7), lambert(0x6b4a2a), 0, 1.1, 0));
  const tiers = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < tiers; i++) {
    g.add(mesh(coneGeo(1.9 - i * 0.5, 2.4, 8), green, 0, 2.2 + i * 1.4, 0));
  }
  g.scale.setScalar(s);
  return { group: g, radius: 0.8 * s, hp: 1, points: 100, type: 'tree', flammable: true };
}

function makeRock() {
  const g = new THREE.Group();
  const s = 0.9 + Math.random() * 1.2;
  const rock = mesh(new THREE.DodecahedronGeometry(1, 0), lambert(0x8b8f94), 0, 0.5, 0);
  rock.scale.set(1, 0.65, 1);
  rock.rotation.y = Math.random() * Math.PI;
  g.add(rock);
  g.scale.setScalar(s);
  return { group: g, radius: s * 1.05, hp: Infinity, points: 0, type: 'rock', smashable: false };
}

const TENT_COLORS = [0xd94f4f, 0x3a7bd9, 0xe8a23a, 0x4fae5c, 0x9a5bd9];

function makeTent() {
  const g = new THREE.Group();
  const color = TENT_COLORS[Math.floor(Math.random() * TENT_COLORS.length)];
  const body = mesh(coneGeo(1.9, 2.1, 4), lambert(color), 0, 1.05, 0);
  body.rotation.y = Math.PI / 4;
  g.add(body);
  const door = mesh(coneGeo(0.7, 1.0, 4), lambert(0x2a2a33), 0, 0.5, 1.15);
  door.rotation.y = Math.PI / 4;
  g.add(door);
  return { group: g, radius: 1.9, hp: 1, points: 250, type: 'tent', flammable: true };
}

const CAR_COLORS = [0xd94f4f, 0x4f7dd9, 0xe6e6e6, 0x59b559, 0xe8c04a, 0xd97eb0];

function makeCar() {
  const g = new THREE.Group();
  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  g.add(mesh(boxGeo(4.4, 1.0, 1.9), lambert(color), 0, 0.85, 0));
  g.add(mesh(boxGeo(2.3, 0.85, 1.7), lambert(0xbfe3f2), 0, 1.75, 0));
  for (const sx of [-1.4, 1.4]) {
    for (const sz of [-1, 1]) {
      const w = mesh(cylGeo(0.45, 0.45, 0.35, 10), lambert(0x1c1c22), sx, 0.45, sz * 0.95);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  }
  return { group: g, radius: 2.5, hp: 2, points: 500, type: 'car' };
}

function makeCabin() {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(5.4, 3.0, 4.4), lambert(0x8a5a30), 0, 1.5, 0));
  // Triangular prism roof: 3-sided cylinder with the apex vertex rotated to +X,
  // then laid along X so the apex points up and the flat side sits on the walls.
  const key = 'cabin-roof';
  if (!geoCache.has(key)) {
    const roofGeo = new THREE.CylinderGeometry(2.9, 2.9, 6.0, 3, 1, false, Math.PI / 2);
    roofGeo.rotateZ(Math.PI / 2);
    geoCache.set(key, roofGeo);
  }
  g.add(mesh(geoCache.get(key), lambert(0x5c3a1c), 0, 4.4, 0));
  g.add(mesh(boxGeo(1.2, 2.0, 0.2), lambert(0x3a2412), 0, 1.0, 2.25));
  g.add(mesh(boxGeo(1.1, 1.0, 0.15), lambert(0xbfe3f2), 1.7, 1.9, 2.25));
  g.add(mesh(boxGeo(1.1, 1.0, 0.15), lambert(0xbfe3f2), -1.7, 1.9, 2.25));
  return { group: g, radius: 3.6, hp: 3, points: 1000, type: 'cabin' };
}

function makeCooler() {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(0.9, 0.55, 0.55), lambert(0x3a7bd9), 0, 0.28, 0));
  g.add(mesh(boxGeo(0.95, 0.14, 0.6), lambert(0xe6e6e6), 0, 0.62, 0));
  return { group: g, radius: 0.7, hp: 1, points: 50, type: 'cooler' };
}

// Rare glowing cooler: smashing it adds time to the clock.
function makeGoldCooler() {
  const g = new THREE.Group();
  const gold = lambert(0xffc83a, { emissive: 0x8a6510 });
  g.add(mesh(boxGeo(0.9, 0.55, 0.55), gold, 0, 0.28, 0));
  g.add(mesh(boxGeo(0.95, 0.14, 0.6), lambert(0xffe27a, { emissive: 0xa8842a }), 0, 0.62, 0));
  return { group: g, radius: 0.7, hp: 1, points: 500, type: 'goldcooler', timeBonus: 8 };
}

function makeOuthouse() {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(1.5, 2.4, 1.5), lambert(0x7a6a4a), 0, 1.2, 0));
  g.add(mesh(boxGeo(1.8, 0.15, 1.8), lambert(0x4a3a22), 0, 2.5, 0));
  g.add(mesh(new THREE.CircleGeometry(0.16, 12), lambert(0x2a2015), 0, 1.8, 0.76));
  return { group: g, radius: 1.2, hp: 1, points: 300, type: 'outhouse' };
}

function makeCampfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const log = mesh(cylGeo(0.14, 0.14, 1.3, 6), lambert(0x5c3a1c), 0, 0.18, 0);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 4) * Math.PI;
    g.add(log);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8c2a });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffd75e });
  const flame = mesh(coneGeo(0.5, 1.2, 6), flameMat, 0, 0.9, 0);
  const flameCore = mesh(coneGeo(0.25, 0.8, 6), coreMat, 0, 0.8, 0);
  flame.castShadow = false;
  flameCore.castShadow = false;
  g.add(flame, flameCore);
  return { group: g, radius: 1.0, hp: 1, points: 150, type: 'campfire', flames: [flame, flameCore] };
}

function makePicnicTable() {
  const g = new THREE.Group();
  const wood = lambert(0x9a6b3a);
  g.add(mesh(boxGeo(2.2, 0.15, 1.1), wood, 0, 0.75, 0));
  g.add(mesh(boxGeo(2.2, 0.12, 0.35), wood, 0, 0.45, 0.8));
  g.add(mesh(boxGeo(2.2, 0.12, 0.35), wood, 0, 0.45, -0.8));
  for (const sx of [-0.9, 0.9]) {
    const leg = mesh(boxGeo(0.14, 0.8, 1.6), lambert(0x7a5228), sx, 0.38, 0);
    leg.rotation.x = 0.5;
    g.add(leg);
  }
  return { group: g, radius: 1.6, hp: 1, points: 200, type: 'picnic', flammable: true };
}

function makeRV() {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(6.5, 2.5, 2.3), lambert(0xf0ede4), 0, 1.85, 0));
  g.add(mesh(boxGeo(6.6, 0.5, 2.32), lambert(0x3a7bd9), 0, 1.35, 0));
  g.add(mesh(boxGeo(1.4, 0.4, 1.2), lambert(0xd9d9d9), -1.5, 3.3, 0));
  for (const sz of [-1, 1]) {
    g.add(mesh(boxGeo(1.2, 0.8, 0.06), lambert(0xbfe3f2), 1.6, 2.4, sz * 1.16));
    g.add(mesh(boxGeo(1.2, 0.8, 0.06), lambert(0xbfe3f2), -1.0, 2.4, sz * 1.16));
  }
  for (const sx of [-2.2, 2.2]) {
    for (const sz of [-1, 1]) {
      const w = mesh(cylGeo(0.55, 0.55, 0.4, 10), lambert(0x1c1c22), sx, 0.55, sz * 1.1);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  }
  return { group: g, radius: 3.5, hp: 4, points: 1500, type: 'rv' };
}

function makeWatchtower() {
  const g = new THREE.Group();
  const wood = lambert(0x7a5228);
  for (const sx of [-1.1, 1.1]) {
    for (const sz of [-1.1, 1.1]) {
      g.add(mesh(boxGeo(0.28, 5.0, 0.28), wood, sx, 2.5, sz));
    }
  }
  g.add(mesh(boxGeo(3.0, 0.3, 3.0), lambert(0x9a6b3a), 0, 5.1, 0));
  g.add(mesh(boxGeo(2.5, 1.6, 2.5), lambert(0x8a5a30), 0, 6.05, 0));
  const roof = mesh(coneGeo(2.1, 1.3, 4), lambert(0x5c3a1c), 0, 7.5, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  g.add(mesh(boxGeo(0.6, 0.9, 0.1), lambert(0x1e2a38), 0, 6.1, 1.26));
  return { group: g, radius: 2.2, hp: 3, points: 2000, type: 'tower' };
}

function makeTruck() {
  const g = new THREE.Group();
  const green = lambert(0x3f6b46);
  g.add(mesh(boxGeo(5.0, 0.9, 1.9), green, 0, 1.05, 0));
  g.add(mesh(boxGeo(2.0, 1.15, 1.85), green, 1.1, 2.0, 0));
  g.add(mesh(boxGeo(1.9, 0.7, 1.75), lambert(0xbfe3f2), 1.1, 2.15, 0));
  g.add(mesh(boxGeo(2.2, 0.5, 1.7), lambert(0x2e4a33), -1.4, 1.6, 0));
  for (const sx of [-1.7, 1.7]) {
    for (const sz of [-1, 1]) {
      const w = mesh(cylGeo(0.5, 0.5, 0.4, 10), lambert(0x1c1c22), sx, 0.5, sz * 1.0);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  }
  return { group: g, radius: 2.6, hp: 3, points: 800, type: 'truck' };
}

const CANOE_COLORS = [0xc0392b, 0x27ae60, 0xd4a017];

function makeCanoe() {
  const g = new THREE.Group();
  const color = lambert(CANOE_COLORS[Math.floor(Math.random() * CANOE_COLORS.length)]);
  g.add(mesh(boxGeo(0.8, 0.4, 3.0), color, 0, 0.25, 0));
  g.add(mesh(boxGeo(0.55, 0.3, 2.5), lambert(0x3a2a1a), 0, 0.4, 0));
  for (const sz of [-1, 1]) {
    const tip = mesh(coneGeo(0.4, 0.7, 4), color, 0, 0.25, sz * 1.75);
    tip.rotation.x = sz * Math.PI / 2;
    g.add(tip);
  }
  return { group: g, radius: 1.6, hp: 1, points: 150, type: 'canoe', flammable: true };
}

function makeWoodpile() {
  const g = new THREE.Group();
  const wood = lambert(0x6b4a2a);
  const logGeo2 = cylGeo(0.18, 0.18, 1.6, 6);
  const rows = [[3, 0.18], [2, 0.5], [1, 0.8]];
  for (const [count, y] of rows) {
    for (let i = 0; i < count; i++) {
      const log = mesh(logGeo2, wood, (i - (count - 1) / 2) * 0.4, y, 0);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = Math.PI / 2;
      g.add(log);
    }
  }
  return { group: g, radius: 1.0, hp: 1, points: 100, type: 'woodpile', flammable: true };
}

function makeTrashcan() {
  const g = new THREE.Group();
  g.add(mesh(cylGeo(0.42, 0.36, 1.0, 8), lambert(0x5f6b60), 0, 0.5, 0));
  g.add(mesh(cylGeo(0.46, 0.46, 0.12, 8), lambert(0x49544b), 0, 1.06, 0));
  return { group: g, radius: 0.6, hp: 1, points: 50, type: 'trashcan' };
}

function makeSignTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 224;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(0, 0, 512, 224);
  ctx.strokeStyle = '#5c4326';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 492, 204);
  ctx.fillStyle = '#2e2214';
  ctx.font = '900 64px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CAMP', 256, 92);
  ctx.fillText('PINEWOOD', 256, 172);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSign() {
  const g = new THREE.Group();
  const wood = lambert(0x6b4a2a);
  for (const sx of [-1.15, 1.15]) {
    g.add(mesh(boxGeo(0.2, 2.4, 0.2), wood, sx, 1.2, 0));
  }
  const board = mesh(boxGeo(2.9, 1.3, 0.15), new THREE.MeshLambertMaterial({ map: makeSignTexture() }), 0, 2.1, 0);
  g.add(board);
  return { group: g, radius: 1.6, hp: 1, points: 400, type: 'sign', flammable: true };
}

function makeFlagpole() {
  const g = new THREE.Group();
  g.add(mesh(cylGeo(0.07, 0.1, 7, 6), lambert(0xb8bdc9), 0, 3.5, 0));
  g.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), lambert(0xe8c04a), 0, 7.05, 0));
  // Team-purple flag
  const flag = mesh(boxGeo(1.5, 0.9, 0.05), lambert(0x7b4fd9), 0.82, 6.35, 0);
  g.add(flag);
  return { group: g, radius: 0.6, hp: 1, points: 350, type: 'flagpole', flammable: true, flag };
}

function makeFence() {
  const g = new THREE.Group();
  const wood = lambert(0x8a6a42);
  for (const sx of [-0.9, 0.9]) {
    g.add(mesh(boxGeo(0.16, 1.15, 0.16), wood, sx, 0.55, 0));
  }
  g.add(mesh(boxGeo(2.1, 0.16, 0.1), wood, 0, 0.55, 0));
  g.add(mesh(boxGeo(2.1, 0.16, 0.1), wood, 0, 0.95, 0));
  return { group: g, radius: 1.2, hp: 1, points: 75, type: 'fence', flammable: true };
}

function makeGnome() {
  const g = new THREE.Group();
  g.add(mesh(coneGeo(0.26, 0.5, 8), lambert(0x3a7bd9), 0, 0.25, 0));
  g.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), lambert(0xe8b88a), 0, 0.56, 0));
  g.add(mesh(coneGeo(0.17, 0.42, 8), lambert(0xd92e2e), 0, 0.82, 0));
  return { group: g, radius: 0.45, hp: 1, points: 1000, type: 'gnome' };
}

// Explodes big, chains into other explosions and fires.
function makePropane() {
  const g = new THREE.Group();
  g.add(mesh(cylGeo(0.35, 0.4, 1.0, 10), lambert(0xe6e6e6), 0, 0.5, 0));
  g.add(mesh(cylGeo(0.12, 0.12, 0.2, 6), lambert(0xd92e2e), 0, 1.1, 0));
  return { group: g, radius: 0.6, hp: 1, points: 200, type: 'propane' };
}

// Smash it and the bees come out looking for someone to blame.
function makeBeehive() {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(0.18, 1.8, 0.18), lambert(0x6b4a2a), 0, 0.9, 0));
  const hive = mesh(new THREE.SphereGeometry(0.42, 8, 6), lambert(0xd4a94e), 0, 1.9, 0);
  hive.scale.y = 0.8;
  g.add(hive);
  const hive2 = mesh(new THREE.SphereGeometry(0.32, 8, 6), lambert(0xc09a3e), 0, 2.2, 0);
  hive2.scale.y = 0.7;
  g.add(hive2);
  return { group: g, radius: 0.7, hp: 1, points: 250, type: 'beehive' };
}

function makeDock() {
  const g = new THREE.Group();
  const wood = lambert(0x8a6a42);
  for (let i = 0; i < 5; i++) {
    g.add(mesh(boxGeo(1.5, 0.12, 0.85), wood, 0, 0.55, i * 0.95 - 1.9));
  }
  for (const sz of [-1.7, 0, 1.7]) {
    for (const sx of [-0.6, 0.6]) {
      g.add(mesh(boxGeo(0.16, 0.9, 0.16), lambert(0x6b4a2a), sx, 0.25, sz));
    }
  }
  return { group: g, radius: 1.7, hp: 1, points: 300, type: 'dock', flammable: true };
}

// ---------- Ground texture ----------

function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4d7c3c';
  ctx.fillRect(0, 0, 512, 512);
  const shades = ['#457437', '#548544', '#3f6e33', '#5b8c48', '#48793a'];
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = shades[Math.floor(Math.random() * shades.length)];
    const s = 2 + Math.random() * 7;
    ctx.globalAlpha = 0.25 + Math.random() * 0.5;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- World assembly ----------

export function buildWorld(scene, renderer) {
  scene.background = new THREE.Color(0x9fc4e8);
  scene.fog = new THREE.Fog(0x9fc4e8, 70, 190);

  // Lights
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x3a5a2a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  // Ground
  const groundTex = makeGroundTexture();
  if (renderer) groundTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 320),
    new THREE.MeshLambertMaterial({ map: groundTex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Pond
  const pondAngle = Math.random() * Math.PI * 2;
  const pondDist = 45 + Math.random() * 18;
  const pond = { x: Math.cos(pondAngle) * pondDist, z: Math.sin(pondAngle) * pondDist, r: 11 };
  const rim = new THREE.Mesh(new THREE.CircleGeometry(pond.r + 1.2, 28), lambert(0xb8a87c));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(pond.x, 0.03, pond.z);
  rim.receiveShadow = true;
  scene.add(rim);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(pond.r, 28),
    new THREE.MeshLambertMaterial({ color: 0x3a7bc8, emissive: 0x102a44 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(pond.x, 0.06, pond.z);
  scene.add(water);

  // Distant mountains
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 130 + Math.random() * 40;
    const h = 30 + Math.random() * 35;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(h * 0.9, h, 5), lambert(0x6e7f96));
    mtn.position.set(Math.cos(a) * dist, h / 2 - 2, Math.sin(a) * dist);
    mtn.rotation.y = Math.random() * Math.PI;
    scene.add(mtn);
  }

  // Clouds
  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(3 + Math.random() * 3, 8, 6), lambert(0xffffff));
      puff.position.set(j * 4 - 4, Math.random() * 1.5, Math.random() * 2);
      puff.scale.y = 0.5;
      cloud.add(puff);
    }
    cloud.position.set((Math.random() - 0.5) * 240, 42 + Math.random() * 15, (Math.random() - 0.5) * 240);
    scene.add(cloud);
  }

  // ---------- Prop placement ----------
  const props = [];
  const flames = [];

  function fits(x, z, radius) {
    if (Math.hypot(x, z) < 9) return false; // keep the spawn point clear
    if (Math.hypot(x - pond.x, z - pond.z) < pond.r + radius + 1) return false;
    for (const other of props) {
      if (Math.hypot(x - other.x, z - other.z) < radius + other.radius + 1.2) return false;
    }
    return true;
  }

  function register(prop, x, z, rotY) {
    prop.group.position.set(x, 0, z);
    prop.group.rotation.y = rotY;
    prop.x = x;
    prop.z = z;
    prop.alive = true;
    prop.smashable = prop.smashable !== false;
    prop.maxHp = prop.hp;
    prop.wobble = 0;
    // Palette of the prop's own colors, used for debris puffs
    const colors = new Set();
    prop.group.traverse((o) => {
      if (o.isMesh && o.material.color && colors.size < 4) colors.add(o.material.color.getHex());
    });
    prop.colors = [...colors];
    scene.add(prop.group);
    props.push(prop);
    if (prop.flames) flames.push(...prop.flames);
  }

  function place(factory, count) {
    for (let i = 0; i < count; i++) {
      const prop = factory();
      for (let tries = 0; tries < 50; tries++) {
        const x = (Math.random() - 0.5) * 2 * (BOUNDS - 3);
        const z = (Math.random() - 0.5) * 2 * (BOUNDS - 3);
        if (!fits(x, z, prop.radius)) continue;
        register(prop, x, z, Math.random() * Math.PI * 2);
        break;
      }
    }
  }

  place(makeTree, 85);
  place(makeRock, 12);
  place(makeTent, 12);
  place(makeCar, 8);
  place(makeCabin, 5);
  place(makeRV, 3);
  place(makeTruck, 3);
  place(makeWatchtower, 2);
  place(makePicnicTable, 8);
  place(makeOuthouse, 4);
  place(makeCampfire, 5);
  place(makeCooler, 12);
  place(makeGoldCooler, 3);
  place(makeWoodpile, 6);
  place(makeTrashcan, 10);
  place(makeSign, 2);
  place(makeFlagpole, 2);
  place(makeFence, 12);
  place(makeGnome, 2);
  place(makePropane, 5);
  place(makeBeehive, 3);

  // Dock + beached canoes on the pond shore, pointing at the pond center
  {
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      const prop = i === 0 ? makeDock() : makeCanoe();
      const a = a0 + i * (0.8 + Math.random() * 0.5);
      const rr = i === 0 ? pond.r : pond.r + 1.5;
      const dx = pond.x + Math.cos(a) * rr;
      const dz = pond.z + Math.sin(a) * rr;
      if (Math.abs(dx) < BOUNDS - 2 && Math.abs(dz) < BOUNDS - 2) {
        register(prop, dx, dz, Math.atan2(pond.x - dx, pond.z - dz));
      }
    }
  }

  const smashableCount = props.filter((p) => p.smashable).length;
  const flags = props.filter((p) => p.flag).map((p) => p.flag);

  return { props, flames, flags, sun, smashableCount, pond };
}
