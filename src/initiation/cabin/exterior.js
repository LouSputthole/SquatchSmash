/**
 * INITIATION NIGHT — the cabin, from outside.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OLD, PRIVATE, IMPORTANT. NOT RUNDOWN.
 *
 * That distinction is the owner's and it is the whole brief for this file. A
 * derelict shack in the woods is a horror film. THIS is a building somebody
 * has kept up for sixty years and does not talk about: squared timber, a real
 * stone chimney, a roof in good order, and no decoration of any kind. Nothing
 * on it is picturesque. There is one light, over the door, and it is on.
 *
 * WHAT THE PLAYER GETS, IN THIS ORDER, coming up the trail:
 *
 *   1. Smoke. Before the building — a pale column above black trees, lit from
 *      underneath by a chimney that has been going for hours.
 *   2. The porch light, through trunks, at the second bend.
 *   3. Two cars in the yard, which is the fact that lands: people are already
 *      here, and they came separately, and they arrived before he did.
 *   4. The windows. Warm, small, and too high to see into from the yard.
 *
 * And under all of it, from inside, music — slow, heavy, old. Nobody comments
 * on it. See ambience.js.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TWO NUMBERS THAT ARE LOAD-BEARING FOR REASONS THAT ARE NOT ARCHITECTURAL
 *
 * The porch deck is 12 cm. A real one is 45, and 45 would be an invisible wall
 * across the only door in the level, because this scene's player is a
 * flat-ground walker with circle colliders and no step-up.
 *
 * The chimney's inner face lands EXACTLY on the outer face of the back wall.
 * The geometry gate calls anything sunk more than 2 cm into a wall embedded,
 * and it is right: a chimney pushed into a cabin to look attached is a
 * chimney inside somebody's kitchen.
 */

import * as THREE from 'three';

import {
  assembly, bakedTexture, between, boxPart, casts, cylinderPart, effect,
  glowMaterial, namedGroup, rng, slab, speckle, structural, wallPart,
} from './kit.js';
import { CABIN, CABIN_DOOR, CHIMNEY, PORCH, ROOM } from './site.js';

const TIMBER = 0x4a3720;
const TIMBER_SHADOW = 0x2e2214;
const STONE = 0x4a4c50;
const SHINGLE = 0x241f1c;
const WINDOW_GLOW = 0xffb455;

/** How far the eaves overhang, on every side. */
const OVERHANG = 0.45;
const ROOF_THICKNESS = 0.17;

/**
 * Grain.
 *
 * Baked once and shared by every course in the building, light and dark, which
 * is why the two materials are made here rather than pulled from `lambert()`:
 * a cached flat colour cannot carry a map, and a wall of flat colour at night
 * is a wall made of cardboard.
 */
let timberMaterials = null;
function timberFace(dark) {
  if (!timberMaterials) {
    const map = bakedTexture(256, (context, size) => {
      speckle(context, size, '#4a3720', ['#3d2c19', '#573f25', '#2f2213', '#63492c'], 900,
        { grain: [2, 26], alpha: [0.15, 0.5] });
    }, { repeat: 3 });
    timberMaterials = {
      light: new THREE.MeshLambertMaterial({ map, color: TIMBER }),
      dark: new THREE.MeshLambertMaterial({ map, color: TIMBER_SHADOW }),
    };
  }
  return dark ? timberMaterials.dark : timberMaterials.light;
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

/**
 * Walls, in courses.
 *
 * Squared timber laid in courses rather than one flat slab, because at night
 * the only thing that tells you what a wall is made of is the shadow line
 * between two courses. Each course is inset a couple of millimetres from the
 * one below on alternate rows, which is what makes that line exist at all.
 *
 * `axis` is the THIN one, which is what the gate needs to measure an embed
 * against: a picture hung on this wall is 2 cm from a finding either way.
 */
function buildWallRun(group, { fromX, toX, fromZ, toZ, height, axis, name }) {
  const courses = 9;
  const courseHeight = height / courses;
  for (let i = 0; i < courses; i++) {
    const inset = i % 2 === 0 ? 0 : 0.012;
    const y0 = i * courseHeight;
    const course = slab(`${name}.course`, [
      fromX + (axis === 'x' ? inset : 0), y0, fromZ + (axis === 'z' ? inset : 0),
    ], [
      toX - (axis === 'x' ? inset : 0), y0 + courseHeight - 0.006, toZ - (axis === 'z' ? inset : 0),
    ], i % 2 === 0 ? TIMBER : TIMBER_SHADOW);
    course.material = timberFace(i % 2 !== 0);
    course.castShadow = true;
    group.add(wallPart(course, axis));
  }
}

/**
 * A gable end, stacked.
 *
 * Eight courses of decreasing length. A log gable really is built this way —
 * the courses get shorter as the roof closes in — so the stepped profile is
 * not an approximation of a triangle, it is what the triangle is made of.
 */
function buildGable(group, { x, thickness, baseY, apexY, minZ, maxZ, name }) {
  const courses = 8;
  const courseHeight = (apexY - baseY) / courses;
  const centreZ = (minZ + maxZ) / 2;
  const halfDepth = (maxZ - minZ) / 2;
  for (let i = 0; i < courses; i++) {
    const k = i / courses;
    const half = halfDepth * (1 - k) + 0.12;
    const y0 = baseY + i * courseHeight;
    const course = slab(`${name}.course`,
      [x, y0, centreZ - half], [x + thickness, y0 + courseHeight - 0.005, centreZ + half],
      i % 2 === 0 ? TIMBER : TIMBER_SHADOW);
    course.material = timberFace(i % 2 !== 0);
    course.castShadow = true;
    group.add(wallPart(course, 'x'));
  }
}

/** One roof plane, from the ridge down to the eaves. */
function buildRoofPlane(group, side) {
  const rise = CABIN.ridgeHeight - CABIN.wallHeight;
  const run = CABIN.depth / 2 + OVERHANG;
  const length = Math.hypot(run, rise);
  const pitch = Math.atan2(rise, run);
  const plane = boxPart('cabin.roof.plane',
    [CABIN.width + OVERHANG * 2, ROOF_THICKNESS, length],
    [CABIN.x, (CABIN.ridgeHeight + CABIN.wallHeight) / 2 + 0.06, CABIN.z + side * run / 2],
    SHINGLE);
  plane.rotation.x = side * pitch;
  casts(plane);
  group.add(plane);

  /* Purlins under the eave, visible from the yard and from the porch. */
  for (const along of [-0.34, 0.34]) {
    group.add(boxPart('cabin.roof.purlin',
      [CABIN.width + OVERHANG * 1.4, 0.1, 0.12],
      [CABIN.x, CABIN.wallHeight + 0.12 + Math.abs(along) * 0.02, CABIN.z + side * (run - 0.28)],
      TIMBER_SHADOW));
  }
}

/**
 * The porch.
 *
 * Two metres deep, which is a working porch — boots come off on it and men
 * stand on it to smoke — and it is the only part of the building the player
 * touches before he is inside.
 */
function buildPorch(group) {
  const deck = structural(slab('porch.deck.floor',
    [PORCH.minX, 0, PORCH.minZ], [PORCH.maxX, PORCH.deckY, PORCH.maxZ], 0x4d3a22));
  deck.receiveShadow = true;
  group.add(deck);

  /* One shallow step. The deck is low enough that this is honesty, not access. */
  group.add(slab('porch.step',
    [CABIN_DOOR.x - 1.5, 0, PORCH.minZ - 0.46], [CABIN_DOOR.x + 1.5, PORCH.deckY * 0.5, PORCH.minZ],
    0x453320));

  for (const x of [PORCH.minX + 0.35, CABIN.x - 3.2, CABIN.x + 3.2, PORCH.maxX - 0.35]) {
    const post = casts(boxPart('porch.post', [0.18, PORCH.roofY - PORCH.deckY, 0.18],
      [x, (PORCH.roofY + PORCH.deckY) / 2, PORCH.minZ + 0.22], TIMBER));
    group.add(post);
  }

  const roof = casts(boxPart('porch.roof.plane',
    [PORCH.maxX - PORCH.minX + 0.5, 0.13, PORCH.maxZ - PORCH.minZ + 0.55],
    [CABIN.x, PORCH.roofY, (PORCH.minZ + PORCH.maxZ) / 2 - 0.18], SHINGLE));
  roof.rotation.x = -0.13;
  group.add(roof);

  /**
   * Firewood, stacked against the front wall where it stays dry.
   *
   * Three centimetres clear of the timber, because touching it is fine and
   * being INSIDE it by three centimetres is a wall-embed finding. Everything
   * that leans on this building leans on it from that distance.
   */
  const stack = assembly('porch.firewood', 'initiation.cabin.firewood');
  const random = rng(0x0f17e);
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < 7; i++) {
      const log = cylinderPart('firewood.log', 0.075, 0.085, 0.44, 6, row % 2 ? 0x50412a : 0x3f3220, [
        PORCH.minX + 0.75 + (row % 2 ? 0.06 : 0) + i * 0.17,
        PORCH.deckY + 0.09 + row * 0.16,
        CABIN.frontZ - 0.28,
      ]);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = between(random, -0.03, 0.03);
      stack.add(log);
    }
  }
  group.add(stack);
}

/**
 * The door, standing open.
 *
 * It is open because the man walking the player up here does not knock, and
 * because a lit rectangle in a dark wall is the only thing on this building
 * that has to read from thirty metres.
 */
function buildDoorway(group) {
  const half = CABIN_DOOR.width / 2;
  const frameColour = 0x3a2c19;
  for (const side of [-1, 1]) {
    group.add(slab('door.jamb',
      [CABIN_DOOR.x + side * half - (side < 0 ? 0.09 : 0), 0, CABIN.frontZ - 0.02],
      [CABIN_DOOR.x + side * half + (side < 0 ? 0 : 0.09), CABIN_DOOR.height, ROOM.minZ + 0.02],
      frameColour));
  }
  group.add(slab('door.head',
    [CABIN_DOOR.x - half - 0.09, CABIN_DOOR.height, CABIN.frontZ - 0.02],
    [CABIN_DOOR.x + half + 0.09, CABIN_DOOR.height + 0.11, ROOM.minZ + 0.02],
    frameColour));

  /* The leaf, swung back against the inside of the wall. */
  const hinge = new THREE.Group();
  hinge.position.set(CABIN_DOOR.x + half, 0, ROOM.minZ);
  hinge.rotation.y = -1.42;
  const leaf = casts(boxPart('door.leaf', [CABIN_DOOR.width, CABIN_DOOR.height - 0.04, 0.06],
    [CABIN_DOOR.width / 2, (CABIN_DOOR.height - 0.04) / 2, 0.03], 0x33260f));
  hinge.add(leaf);
  group.add(hinge);
}

/**
 * A window: frame, sill, and a pane with the room behind it.
 *
 * The pane is emissive rather than transparent. From the yard these are the
 * only warm thing in the frame and they have to bloom; from inside, the room
 * has its own light and nobody is looking out.
 */
function buildWindow(group, { x, z, facing, width = 0.95, height = 0.8, sill = 1.35 }) {
  const half = width / 2;
  const frame = 0.07;
  /**
   * EVERY PART OF THIS IS OUTSIDE THE WALL.
   *
   * `x`/`z` name the wall's OUTER FACE and the whole window is built in the
   * 12 cm in front of it, because a frame modelled across the face — which is
   * how the first pass drew it, straddling by 7 cm — is 38 wall-embed findings
   * and, in the world, a window sunk into the middle of the timber.
   */
  const DEPTH = 0.12;
  const box = (name, dx0, dy0, dx1, dy1) => {
    const minimum = facing === 'z'
      ? [x + dx0, sill + dy0, z - DEPTH]
      : [x - DEPTH, sill + dy0, z + dx0];
    const maximum = facing === 'z'
      ? [x + dx1, sill + dy1, z]
      : [x, sill + dy1, z + dx1];
    return slab(name, minimum, maximum, 0x2f2416);
  };
  group.add(box('window.frame.left', -half - frame, -frame, -half, height + frame));
  group.add(box('window.frame.right', half, -frame, half + frame, height + frame));
  group.add(box('window.frame.head', -half - frame, height, half + frame, height + frame));
  group.add(box('window.sill', -half - 0.11, -frame - 0.05, half + 0.11, 0));

  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    glowMaterial(WINDOW_GLOW, 1.25),
  );
  pane.name = 'window.pane';
  if (facing === 'z') {
    pane.position.set(x, sill + height / 2, z - 0.05);
    pane.rotation.y = Math.PI;
  } else {
    pane.position.set(x - 0.05, sill + height / 2, z);
    pane.rotation.y = -Math.PI / 2;
  }
  group.add(pane);

  const light = new THREE.PointLight(WINDOW_GLOW, 6, 7, 2);
  light.position.set(
    facing === 'z' ? x : x - 0.6,
    sill + height / 2,
    facing === 'z' ? z - 0.6 : z,
  );
  group.add(light);
  return light;
}

/* ------------------------------------------------------------------ */
/* Chimney                                                             */
/* ------------------------------------------------------------------ */

/**
 * The stack.
 *
 * Built INTO the shell assembly rather than as its own object, and that is a
 * statement about what a chimney is: it passes through the roof, because that
 * is what chimneys do, and two objects sharing that space is only a fault if
 * they are two objects. Left standing alone it reported seven
 * interpenetrations against its own roof — all of them correct, and all of
 * them meaningless.
 */
function buildChimney(group) {
  const random = rng(0xc417e);
  const halfWidth = CHIMNEY.width / 2;
  const halfDepth = CHIMNEY.depth / 2;

  /* The stack: courses of rubble, each one nudged, so no edge is straight. */
  const courses = 14;
  for (let i = 0; i < courses; i++) {
    const y0 = (i / courses) * CHIMNEY.height;
    const y1 = ((i + 1) / courses) * CHIMNEY.height - 0.02;
    const taper = 1 - (i / courses) * 0.14;
    const jitterX = between(random, -0.03, 0.03);
    const course = slab('chimney.course', [
      CHIMNEY.x - halfWidth * taper + jitterX, y0, CHIMNEY.z - halfDepth * taper,
    ], [
      CHIMNEY.x + halfWidth * taper + jitterX, y1, CHIMNEY.z + halfDepth * taper,
    ], i % 2 === 0 ? STONE : 0x3f4145);
    course.castShadow = true;
    group.add(course);
  }
  /* The cap, and the pot. */
  group.add(slab('chimney.cap',
    [CHIMNEY.x - halfWidth * 0.94, CHIMNEY.height, CHIMNEY.z - halfDepth * 0.94],
    [CHIMNEY.x + halfWidth * 0.94, CHIMNEY.height + 0.12, CHIMNEY.z + halfDepth * 0.94],
    0x35373b));
  group.add(cylinderPart('chimney.pot', 0.18, 0.2, 0.34, 8, 0x2a2724,
    [CHIMNEY.x, CHIMNEY.height + 0.29, CHIMNEY.z]));
  return group;
}


/**
 * Smoke.
 *
 * Sprites, not meshes: this is weather, it has no bounds worth measuring, and
 * the geometry gate would be right to ask what it is resting on. It goes up
 * slowly and leans, because the fire has been in for hours and there is a
 * little wind — the same wind that is in the branches on the way up.
 */
function buildChimneySmoke() {
  const count = 22;
  const texture = bakedTexture(64, (context, size) => {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(190,196,205,0.55)');
    gradient.addColorStop(0.55, 'rgba(150,157,168,0.22)');
    gradient.addColorStop(1, 'rgba(120,128,140,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }, { srgb: true });
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthWrite: false, opacity: 0.5,
  });
  const group = namedGroup('cabin.chimney.smoke.plume');
  effect(group);
  const random = rng(0x5c0e);
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const sprite = new THREE.Sprite(material);
    sprite.name = 'chimney.smoke.puff';
    const life = between(random, 0, 1);
    puffs.push({ sprite, t: life, speed: between(random, 0.55, 0.95), drift: between(random, 0.4, 1.1) });
    group.add(sprite);
  }
  group.position.set(CHIMNEY.x, CHIMNEY.height + 0.45, CHIMNEY.z);
  return { group, puffs };
}

/* ------------------------------------------------------------------ */
/* The building                                                        */
/* ------------------------------------------------------------------ */

/**
 * Build the cabin.
 *
 * Returns the group, the circle colliders that keep the player out of the
 * walls (with a gap left at the door, because the whole point is that he goes
 * in), the lights, and an `update(dt)` for the smoke.
 */
export function buildCabinExterior() {
  const group = namedGroup('initiation.cabin.exterior');
  const shell = assembly('cabin.shell', 'initiation.cabin.shell');
  const lights = [];
  const thickness = CABIN.wallThickness;

  /* Floor: a slab under the whole footprint, and the thing everything inside
   * this building rests on. */
  const floor = structural(slab('cabin.floor.deck',
    [CABIN.minX, -0.07, CABIN.frontZ], [CABIN.maxX, 0, CABIN.backZ], 0x3c2e1b));
  floor.receiveShadow = true;
  shell.add(floor);

  /* Front wall, in two runs with the doorway between them. */
  const doorHalf = CABIN_DOOR.width / 2;
  buildWallRun(shell, {
    fromX: CABIN.minX, toX: CABIN_DOOR.x - doorHalf, fromZ: CABIN.frontZ, toZ: ROOM.minZ,
    height: CABIN.wallHeight, axis: 'z', name: 'cabin.wall.front',
  });
  buildWallRun(shell, {
    fromX: CABIN_DOOR.x + doorHalf, toX: CABIN.maxX, fromZ: CABIN.frontZ, toZ: ROOM.minZ,
    height: CABIN.wallHeight, axis: 'z', name: 'cabin.wall.front',
  });
  /* …and the lintel course over the door itself. */
  shell.add(wallPart(slab('cabin.wall.front.lintel',
    [CABIN_DOOR.x - doorHalf, CABIN_DOOR.height + 0.11, CABIN.frontZ],
    [CABIN_DOOR.x + doorHalf, CABIN.wallHeight, ROOM.minZ], TIMBER), 'z'));

  buildWallRun(shell, {
    fromX: CABIN.minX, toX: CABIN.maxX, fromZ: ROOM.maxZ, toZ: CABIN.backZ,
    height: CABIN.wallHeight, axis: 'z', name: 'cabin.wall.back',
  });
  buildWallRun(shell, {
    fromX: CABIN.minX, toX: ROOM.minX, fromZ: ROOM.minZ, toZ: ROOM.maxZ,
    height: CABIN.wallHeight, axis: 'x', name: 'cabin.wall.west',
  });
  buildWallRun(shell, {
    fromX: ROOM.maxX, toX: CABIN.maxX, fromZ: ROOM.minZ, toZ: ROOM.maxZ,
    height: CABIN.wallHeight, axis: 'x', name: 'cabin.wall.east',
  });

  buildGable(shell, {
    x: CABIN.minX, thickness, baseY: CABIN.wallHeight, apexY: CABIN.ridgeHeight,
    minZ: CABIN.frontZ, maxZ: CABIN.backZ, name: 'cabin.gable.west',
  });
  buildGable(shell, {
    x: CABIN.maxX - thickness, thickness, baseY: CABIN.wallHeight, apexY: CABIN.ridgeHeight,
    minZ: CABIN.frontZ, maxZ: CABIN.backZ, name: 'cabin.gable.east',
  });

  /* The ceiling the room actually has, under the rafters. */
  const ceiling = slab('cabin.ceiling.boards',
    [ROOM.minX, ROOM.ceilingY, ROOM.minZ], [ROOM.maxX, ROOM.ceilingY + 0.08, ROOM.maxZ], 0x3a2c1a);
  shell.add(ceiling);

  buildRoofPlane(shell, 1);
  buildRoofPlane(shell, -1);
  shell.add(casts(boxPart('cabin.roof.ridge', [CABIN.width + OVERHANG * 2, 0.16, 0.28],
    [CABIN.x, CABIN.ridgeHeight + 0.05, CABIN.z], TIMBER_SHADOW)));

  buildPorch(shell);
  buildDoorway(shell);
  group.add(shell);

  const windows = assembly('cabin.windows', 'initiation.cabin.windows');
  lights.push(buildWindow(windows, { x: CABIN.x - 3.6, z: CABIN.frontZ, facing: 'z' }));
  lights.push(buildWindow(windows, { x: CABIN.x + 3.6, z: CABIN.frontZ, facing: 'z' }));
  lights.push(buildWindow(windows, { x: CABIN.minX, z: CABIN.z - 1.6, facing: 'x' }));
  group.add(windows);

  buildChimney(shell);

  /**
   * The porch light.
   *
   * One bulb in a tin shade over the door. It is the only artificial light on
   * the whole approach, it is warm, and it is what the player walks toward for
   * the last eight seconds without being told to.
   */
  const lantern = assembly('cabin.porch.lantern', 'initiation.cabin.lantern');
  /* Under the porch roof, not through it: the soffit is at 2.55 and a bracket
   * at 2.52 with a 13 cm roof on top of it is a lamp inside a ceiling. */
  lantern.add(boxPart('lantern.bracket', [0.1, 0.1, 0.22],
    [CABIN_DOOR.x, CABIN_DOOR.height + 0.20, CABIN.frontZ - 0.11], 0x2a2622));
  lantern.add(cylinderPart('lantern.shade', 0.19, 0.09, 0.16, 9, 0x2f2b26,
    [CABIN_DOOR.x, CABIN_DOOR.height + 0.14, CABIN.frontZ - 0.24]));
  const bulb = effect(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glowMaterial(0xffd08a, 2.4)));
  bulb.name = 'lantern.bulb.flame';
  bulb.position.set(CABIN_DOOR.x, CABIN_DOOR.height + 0.06, CABIN.frontZ - 0.24);
  lantern.add(bulb);
  const porchLight = new THREE.PointLight(0xffc98a, 42, 16, 2);
  porchLight.position.set(CABIN_DOOR.x, CABIN_DOOR.height + 0.08, CABIN.frontZ - 0.4);
  lantern.add(porchLight);
  lights.push(porchLight);
  group.add(lantern);

  const smoke = buildChimneySmoke();
  group.add(smoke.group);

  /**
   * Colliders.
   *
   * This scene's movement is circles, so the walls are a row of them — with a
   * DELIBERATE GAP at the doorway. A ring of colliders round a building with
   * a door in it and no gap is a building nobody can be made in, which is the
   * kind of dead end that stranded a player in the siege armoury.
   */
  const colliders = [];
  const step = 0.8;
  /* THE WALL RUNS OVERLAP ON PURPOSE, and the gate has to be told so.
   *
   * These are 1 m circles laid down every 0.8 m, so consecutive ones share
   * 0.2 m of each other. That is the whole point: a row of circles that only
   * touched would let a player squeeze between two of them, and a wall with a
   * gap in it is the fault above, one line up. Collider-collider penetration
   * is blocking by default in the geometry gate -- rightly, because two solid
   * volumes in the same place is usually a mistake -- so a tessellated run
   * like this is exactly the "source-proven join" the gate reserves
   * `overlap: false` for. Marked at the point the decision is made, rather
   * than as 106 pair entries in an allowlist nobody could read. */
  const wall = (x, z) => ({ x, z, r: 0.5, overlap: false });
  for (let x = CABIN.minX; x <= CABIN.maxX; x += step) {
    const inDoorway = Math.abs(x - CABIN_DOOR.x) < doorHalf + 0.45;
    if (!inDoorway) colliders.push(wall(x, CABIN.frontZ + thickness / 2));
    colliders.push(wall(x, CABIN.backZ - thickness / 2));
  }
  for (let z = CABIN.frontZ; z <= CABIN.backZ; z += step) {
    colliders.push(wall(CABIN.minX + thickness / 2, z));
    colliders.push(wall(CABIN.maxX - thickness / 2, z));
  }
  /* The chimney stands in the back wall run and shares ground with it. */
  colliders.push({
    x: CHIMNEY.x,
    z: CHIMNEY.z,
    r: Math.max(CHIMNEY.width, CHIMNEY.depth) / 2 + 0.2,
    overlap: false,
  });

  let smokeT = 0;
  const update = (dt) => {
    smokeT += dt;
    for (const puff of smoke.puffs) {
      puff.t += dt * 0.12 * puff.speed;
      if (puff.t > 1) puff.t -= 1;
      const rise = puff.t * 9.5;
      puff.sprite.position.set(
        Math.sin(smokeT * 0.3 + puff.drift * 6) * puff.drift * (0.3 + puff.t * 1.9),
        rise,
        Math.cos(smokeT * 0.22 + puff.drift * 4) * puff.drift * (0.2 + puff.t * 1.2),
      );
      const scale = 0.7 + puff.t * 3.4;
      puff.sprite.scale.set(scale, scale, 1);
      puff.sprite.material.opacity = 0.5;
      puff.sprite.material.needsUpdate = false;
      /* Individual fade is done with scale and the shared material's opacity;
       * per-sprite opacity would need 22 materials for weather nobody looks
       * straight at. */
      puff.sprite.visible = puff.t > 0.02;
    }
  };

  return { group, colliders, lights, update };
}
