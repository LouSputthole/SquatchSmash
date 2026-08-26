/**
 * The Hideout's concealed lower level begins beneath the cabin, then descends
 * through a buried connector into the dungeon. `resolveCabinFloor` therefore
 * takes the caller's current foot height, just as the mansion's multi-storey
 * resolver does, and leaves the outdoor property in charge above both rooms.
 */

import * as THREE from 'three';

import { markSpatialPrimitive } from '../core/spatial-contract.js';
import { box, boxFrom, collider, cylinder, group, mat } from '../world/build.js';
import {
  CABIN_DUNGEON,
  CABIN_DUNGEON_CORRIDOR,
  CABIN_DUNGEON_DOOR,
  buildCabinDungeon,
  insideCabinDungeon,
  resolveCabinDungeonFloor,
} from './dungeon.js';

export {
  CABIN_CAPTIVE_IDS,
  CABIN_CAPTIVE_CLEANUP_BODY_IDS,
  CABIN_DUNGEON,
  CABIN_DUNGEON_CLEANUP_LAYOUT,
  CABIN_DUNGEON_CORRIDOR,
  CABIN_DUNGEON_DOOR,
  cabinDungeonCeilingAt,
  cabinDungeonFloorAt,
  insideCabinDungeon,
  resolveCabinDungeonFloor,
} from './dungeon.js';

export const CABIN_BASEMENT = Object.freeze({
  x0: -5.45,
  x1: 5.45,
  z0: -4.55,
  z1: 4.65,
  floorY: -3.15,
  ceilingY: -0.42,
  levelSplitY: -1.20,
});

export function insideCabinCellar(x, z) {
  return x >= CABIN_BASEMENT.x0 && x <= CABIN_BASEMENT.x1
    && z >= CABIN_BASEMENT.z0 && z <= CABIN_BASEMENT.z1;
}

export function insideCabinLowerLevel(x, z) {
  return insideCabinCellar(x, z) || insideCabinDungeon(x, z);
}

export function resolveCabinFloor(x, z, feetY = 0, baseGroundAt = () => 0) {
  if (insideCabinCellar(x, z) && Number(feetY) < CABIN_BASEMENT.levelSplitY) {
    return CABIN_BASEMENT.floorY;
  }
  const dungeonFloor = resolveCabinDungeonFloor(x, z, feetY, null);
  if (dungeonFloor !== null) return dungeonFloor;
  return typeof baseGroundAt === 'function' ? baseGroundAt(x, z) : Number(baseGroundAt) || 0;
}

const WALK_EYE_HEIGHT = 1.66;
const UTILITY_LIGHT_INTENSITY = 3.00;
const WORKBENCH_FILL_INTENSITY = 1.35;
const PANEL_OPEN_ANGLE = -0.92;

function markAssembly(object, assemblyId, metadata = {}) {
  object.userData ??= {};
  object.userData.geometryGate = {
    ...(object.userData.geometryGate ?? {}),
    assemblyId,
    ...metadata,
  };
  return object;
}

function addBasementCollider(
  colliders,
  bounds,
  name,
  kind = 'world',
  assembly = 'cabin-lower-level-collision',
) {
  const volume = collider(bounds[0], bounds[1]);
  volume.name = name;
  markSpatialPrimitive(volume, { id: name, kind });
  markAssembly(volume, assembly);
  colliders.push(volume);
  return volume;
}

function invisibleTarget(name, size, position) {
  return box({
    name,
    size,
    pos: position,
    mat: new THREE.MeshBasicMaterial({ visible: false }),
    cast: false,
    receive: false,
  });
}

/**
 * Build the optional storage cellar under the late-game Hideout.
 *
 * The public surface is intentionally small: paired transition targets and
 * poses, plus three authored inspection anchors. The scene composition root
 * owns transfers and narration, so this geometry module never reaches into
 * Player, HUD, or campaign state.
 */
export function buildCabinBasement({
  root,
  M,
  colliders,
  occluders,
  interaction,
  utilityTargets,
  wardrobeState,
  wardrobe,
  ctx = {},
}) {
  if (!root?.add || !M || !Array.isArray(colliders) || !interaction?.register) {
    throw new TypeError('buildCabinBasement requires the cabin world collaborators');
  }

  const room = group('cabin-hideout-basement');
  markAssembly(room, 'cabin-basement');
  root.add(room);

  const B = CABIN_BASEMENT;
  const wall = M.stone ?? mat({ color: 0x4d4a43, roughness: 1 });
  const mortar = mat({ color: 0x343431, roughness: 1 });
  const agedWood = M.cabinLogDark ?? M.darkWood;
  const cellarFloor = mat({ color: 0x4a3424, roughness: 0.99 });
  const utilityMetal = mat({ color: 0x596064, roughness: 0.66, metalness: 0.38 });
  const wornMetal = mat({ color: 0x85867e, roughness: 0.58, metalness: 0.44 });
  const crateWood = mat({ color: 0x745233, roughness: 0.96 });
  const crateBatten = mat({ color: 0x50351f, roughness: 0.99 });
  const supplyCanvas = mat({ color: 0x59604c, roughness: 0.98 });
  const blanketCanvas = mat({ color: 0x7a4a35, roughness: 1 });
  const paper = mat({ color: 0xd4c6a4, roughness: 0.95 });
  const fadedRed = mat({ color: 0x8f3f32, roughness: 0.88 });
  const safetyYellow = mat({ color: 0xb98731, roughness: 0.88 });
  const enamel = mat({ color: 0xb8b1a0, roughness: 0.72, metalness: 0.08 });
  const damp = mat({ color: 0x252825, roughness: 1 });

  const addStructure = (mesh, { occludes = true } = {}) => {
    markAssembly(mesh, 'cabin-basement', { structural: true });
    room.add(mesh);
    if (occludes) occluders.push(mesh);
    return mesh;
  };

  addStructure(boxFrom(B.x0, B.floorY - 0.14, B.z0, B.x1, B.floorY, B.z1, cellarFloor, {
    name: 'cabin-basement-timber-floor', cast: false,
  }), { occludes: false });
  addStructure(boxFrom(B.x0, B.ceilingY, B.z0, B.x1, B.ceilingY + 0.14, B.z1, agedWood, {
    name: 'cabin-basement-timber-ceiling', cast: false,
  }));

  const wallH = B.ceilingY - B.floorY;
  const wallY = B.floorY + wallH / 2;
  const wallT = 0.22;
  const dungeonDoor = CABIN_DUNGEON_DOOR;
  const doorLintelH = B.ceilingY - dungeonDoor.topY;
  const doorLintelY = dungeonDoor.topY + doorLintelH / 2;
  for (const [name, size, pos, bounds] of [
    ['cabin-basement-wall-west', [wallT, wallH, B.z1 - B.z0], [B.x0 + wallT / 2, wallY, (B.z0 + B.z1) / 2], [[B.x0, B.floorY, B.z0], [B.x0 + wallT, B.ceilingY, B.z1]]],
    ['cabin-basement-wall-east', [wallT, wallH, B.z1 - B.z0], [B.x1 - wallT / 2, wallY, (B.z0 + B.z1) / 2], [[B.x1 - wallT, B.floorY, B.z0], [B.x1, B.ceilingY, B.z1]]],
    ['cabin-basement-wall-north', [B.x1 - B.x0, wallH, wallT], [(B.x0 + B.x1) / 2, wallY, B.z0 + wallT / 2], [[B.x0, B.floorY, B.z0], [B.x1, B.ceilingY, B.z0 + wallT]]],
    ['cabin-basement-wall-south-west', [dungeonDoor.x0 - B.x0, wallH, wallT], [(B.x0 + dungeonDoor.x0) / 2, wallY, B.z1 - wallT / 2], [[B.x0, B.floorY, B.z1 - wallT], [dungeonDoor.x0, B.ceilingY, B.z1]]],
    ['cabin-basement-wall-south-east', [B.x1 - dungeonDoor.x1, wallH, wallT], [(dungeonDoor.x1 + B.x1) / 2, wallY, B.z1 - wallT / 2], [[dungeonDoor.x1, B.floorY, B.z1 - wallT], [B.x1, B.ceilingY, B.z1]]],
    ['cabin-basement-wall-south-lintel', [dungeonDoor.x1 - dungeonDoor.x0, doorLintelH, wallT], [(dungeonDoor.x0 + dungeonDoor.x1) / 2, doorLintelY, B.z1 - wallT / 2], [[dungeonDoor.x0, dungeonDoor.topY, B.z1 - wallT], [dungeonDoor.x1, B.ceilingY, B.z1]]],
  ]) {
    addStructure(box({ name, size, pos, mat: wall, cast: false }));
    addBasementCollider(colliders, bounds, name, 'world');
  }

  // A cellar should read as laid stone and worn timber, not four featureless
  // slabs around the apartment's polished floor. Shallow courses sit just
  // proud of each inner face; the dark base strip is damp staining, not a
  // second collision wall. Everything stays outside the walking volume.
  for (let y = B.floorY + 0.42; y < B.ceilingY - 0.18; y += 0.42) {
    for (const [name, size, pos] of [
      [`north-${y}`, [B.x1 - B.x0 - 0.48, 0.026, 0.014], [0, y, B.z0 + wallT + 0.016]],
      [`south-west-${y}`, [dungeonDoor.x0 - B.x0 - 0.24, 0.026, 0.014], [(B.x0 + dungeonDoor.x0) / 2 + 0.12, y, B.z1 - wallT - 0.016]],
      [`south-east-${y}`, [B.x1 - dungeonDoor.x1 - 0.24, 0.026, 0.014], [(dungeonDoor.x1 + B.x1) / 2 - 0.12, y, B.z1 - wallT - 0.016]],
      [`west-${y}`, [0.014, 0.026, B.z1 - B.z0 - 0.48], [B.x0 + wallT + 0.016, y, 0.05]],
      [`east-${y}`, [0.014, 0.026, B.z1 - B.z0 - 0.48], [B.x1 - wallT - 0.016, y, 0.05]],
    ]) {
      room.add(markAssembly(box({
        name: `cabin-basement-mortar-course-${name}`,
        size,
        pos,
        mat: mortar,
        cast: false,
      }), 'cabin-basement-masonry', { structural: true }));
    }
  }
  for (const [name, size, pos] of [
    ['north', [B.x1 - B.x0 - 0.50, 0.30, 0.018], [0, B.floorY + 0.16, B.z0 + wallT + 0.018]],
    ['south-west', [dungeonDoor.x0 - B.x0 - 0.25, 0.30, 0.018], [(B.x0 + dungeonDoor.x0) / 2 + 0.125, B.floorY + 0.16, B.z1 - wallT - 0.018]],
    ['south-east', [B.x1 - dungeonDoor.x1 - 0.25, 0.30, 0.018], [(dungeonDoor.x1 + B.x1) / 2 - 0.125, B.floorY + 0.16, B.z1 - wallT - 0.018]],
    ['west', [0.018, 0.30, B.z1 - B.z0 - 0.50], [B.x0 + wallT + 0.018, B.floorY + 0.16, 0.05]],
    ['east', [0.018, 0.30, B.z1 - B.z0 - 0.50], [B.x1 - wallT - 0.018, B.floorY + 0.16, 0.05]],
  ]) {
    room.add(markAssembly(box({
      name: `cabin-basement-damp-course-${name}`,
      size,
      pos,
      mat: damp,
      cast: false,
    }), 'cabin-basement-masonry', { structural: true }));
  }

  const dungeon = buildCabinDungeon({
    root: room,
    M,
    colliders,
    occluders,
    interaction,
    utilityTargets,
    ctx,
  });

  // A scuffed runner and drain give the open centre a reason to exist while
  // leaving the browser-proven route completely clear.
  room.add(markAssembly(box({
    name: 'cabin-basement-worn-runner',
    size: [1.12, 0.014, 4.80],
    pos: [1.05, B.floorY + 0.008, 0.40],
    mat: mat({ color: 0x332d27, roughness: 1 }),
    cast: false,
  }), 'cabin-basement-floor-detail', { structural: true }));
  room.add(markAssembly(cylinder({
    name: 'cabin-basement-floor-drain',
    r: 0.21,
    h: 0.018,
    pos: [-0.55, B.floorY + 0.012, 1.62],
    mat: wornMetal,
    cast: false,
  }), 'cabin-basement-floor-detail', { structural: true }));
  for (const offset of [-0.105, -0.035, 0.035, 0.105]) {
    room.add(markAssembly(box({
      name: `cabin-basement-floor-drain-slot-${offset}`,
      size: [0.018, 0.010, 0.30],
      pos: [-0.55 + offset, B.floorY + 0.024, 1.62],
      mat: damp,
      cast: false,
    }), 'cabin-basement-floor-detail', { structural: true }));
  }

  // Rough timber posts and ceiling joists make the lower room belong to the
  // cabin above it rather than reading as a poured-concrete mission bunker.
  for (const x of [-4.55, -1.52, 1.52, 4.55]) {
    room.add(markAssembly(box({
      name: `cabin-basement-ceiling-joist-${x}`,
      size: [0.16, 0.18, B.z1 - B.z0 - 0.40],
      pos: [x, B.ceilingY - 0.10, (B.z0 + B.z1) / 2],
      mat: agedWood,
      cast: false,
    }), 'cabin-basement'));
  }
  for (const [index, [x, z]] of [
    [B.x0 + 0.34, B.z0 + 0.34],
    [B.x1 - 0.34, B.z0 + 0.34],
    [B.x0 + 0.34, B.z1 - 0.34],
    // Frame the west edge of the ladder bay instead of plugging its rungs
    // with the ordinary south-east corner post.
    [B.x1 - 1.07, B.z1 - 0.34],
  ].entries()) {
    room.add(markAssembly(box({
      name: `cabin-basement-timber-post-${index + 1}`,
      size: [0.22, wallH, 0.22],
      pos: [x, wallY, z],
      mat: agedWood,
    }), 'cabin-basement'));
  }

  // Workbench: repair supplies, not an armory. The broad clear centre remains
  // available for live walking proof and for future story dressing.
  const benchTopY = B.floorY + 0.90;
  room.add(markAssembly(box({
    name: 'cabin-basement-workbench-top',
    size: [3.10, 0.14, 0.72],
    pos: [-0.95, benchTopY, B.z0 + 0.58],
    mat: agedWood,
  }), 'cabin-basement-workbench'));
  for (const x of [-2.32, 0.42]) {
    room.add(markAssembly(box({
      name: `cabin-basement-workbench-leg-${x}`,
      size: [0.16, 0.86, 0.16],
      pos: [x, B.floorY + 0.43, B.z0 + 0.58],
      mat: agedWood,
    }), 'cabin-basement-workbench'));
  }
  room.add(markAssembly(box({
    name: 'cabin-basement-workbench-pegboard',
    size: [2.80, 0.92, 0.055],
    pos: [-0.95, B.floorY + 1.52, B.z0 + 0.27],
    mat: supplyCanvas,
    cast: false,
  }), 'cabin-basement-workbench'));
  const addWorkbenchPart = (mesh) => {
    room.add(markAssembly(mesh, 'cabin-basement-workbench-detail', { structural: true }));
    return mesh;
  };
  const pegboardFaceZ = B.z0 + 0.305;

  // The old seven dark bars technically counted as tools but disappeared
  // into the pegboard. A few readable silhouettes tell the repair story in a
  // glance: hammer, wrench, hand saw, screwdrivers, map and supply card.
  addWorkbenchPart(box({
    name: 'cabin-basement-hammer-handle',
    size: [0.052, 0.40, 0.035],
    pos: [-0.35, B.floorY + 1.50, pegboardFaceZ],
    mat: fadedRed,
    rotZ: -0.10,
  }));
  addWorkbenchPart(box({
    name: 'cabin-basement-hammer-head',
    size: [0.28, 0.075, 0.050],
    pos: [-0.33, B.floorY + 1.70, pegboardFaceZ + 0.002],
    mat: wornMetal,
    rotZ: -0.10,
  }));
  addWorkbenchPart(box({
    name: 'cabin-basement-wrench',
    size: [0.070, 0.46, 0.038],
    pos: [0.02, B.floorY + 1.52, pegboardFaceZ],
    mat: wornMetal,
    rotZ: 0.17,
  }));
  addWorkbenchPart(box({
    name: 'cabin-basement-hand-saw-blade',
    size: [0.48, 0.19, 0.026],
    pos: [-0.86, B.floorY + 1.33, pegboardFaceZ],
    mat: wornMetal,
    rotZ: -0.08,
  }));
  addWorkbenchPart(box({
    name: 'cabin-basement-hand-saw-handle',
    size: [0.17, 0.24, 0.050],
    pos: [-1.14, B.floorY + 1.36, pegboardFaceZ + 0.006],
    mat: safetyYellow,
    rotZ: -0.08,
  }));
  for (const [index, x] of [-0.12, 0.18, 0.40].entries()) {
    addWorkbenchPart(box({
      name: `cabin-basement-screwdriver-${index + 1}`,
      size: [0.038, 0.31 - index * 0.025, 0.032],
      pos: [x, B.floorY + 1.28, pegboardFaceZ],
      mat: index === 1 ? safetyYellow : fadedRed,
      rotZ: (index - 1) * 0.08,
    }));
  }
  for (const [name, x, y, w, h, rotZ] of [
    ['property-map', -1.67, B.floorY + 1.66, 0.58, 0.36, -0.025],
    ['supply-card', -1.42, B.floorY + 1.25, 0.32, 0.24, 0.035],
  ]) {
    addWorkbenchPart(box({
      name: `cabin-basement-${name}`,
      size: [w, h, 0.012],
      pos: [x, y, pegboardFaceZ + 0.010],
      mat: paper,
      rotZ,
      cast: false,
    }));
  }

  const benchSurfaceY = benchTopY + 0.073;
  // Open toolbox, bench vise, ledger and coiled wire form the hero vignette
  // seen from the authored arrival angle.
  addWorkbenchPart(box({
    name: 'cabin-basement-toolbox-base',
    size: [0.72, 0.22, 0.34],
    pos: [-1.78, benchSurfaceY + 0.11, B.z0 + 0.61],
    mat: fadedRed,
  }));
  addWorkbenchPart(box({
    name: 'cabin-basement-toolbox-open-lid',
    size: [0.72, 0.07, 0.30],
    pos: [-1.78, benchSurfaceY + 0.32, B.z0 + 0.45],
    mat: fadedRed,
    rotX: -0.48,
  }));
  addWorkbenchPart(box({
    name: 'cabin-basement-toolbox-handle',
    size: [0.38, 0.055, 0.055],
    pos: [-1.78, benchSurfaceY + 0.29, B.z0 + 0.70],
    mat: wornMetal,
  }));
  addWorkbenchPart(box({
    name: 'cabin-basement-bench-vise-base',
    size: [0.36, 0.10, 0.30],
    pos: [0.12, benchSurfaceY + 0.05, B.z0 + 0.58],
    mat: utilityMetal,
  }));
  for (const x of [0.01, 0.23]) {
    addWorkbenchPart(box({
      name: `cabin-basement-bench-vise-jaw-${x < 0.1 ? 'west' : 'east'}`,
      size: [0.08, 0.28, 0.30],
      pos: [x, benchSurfaceY + 0.19, B.z0 + 0.58],
      mat: wornMetal,
    }));
  }
  addWorkbenchPart(box({
    name: 'cabin-basement-supply-ledger',
    size: [0.52, 0.018, 0.36],
    pos: [-0.72, benchSurfaceY + 0.012, B.z0 + 0.62],
    mat: paper,
    rotY: -0.12,
    cast: false,
  }));
  const wireCoil = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.018, 7, 22),
    utilityMetal,
  );
  wireCoil.name = 'cabin-basement-coiled-wire';
  wireCoil.position.set(-0.70, benchSurfaceY + 0.055, B.z0 + 0.78);
  wireCoil.rotation.x = Math.PI / 2;
  addWorkbenchPart(wireCoil);
  addBasementCollider(colliders, [
    [-2.50, B.floorY, B.z0 + 0.20],
    [0.60, benchTopY + 0.08, B.z0 + 0.96],
  ], 'cabin-basement-workbench', 'prop');

  const shelfX = B.x0 + 0.47;
  for (const z of [-1.65, 1.55]) {
    for (const shelfY of [0.25, 0.86, 1.47, 2.08]) {
      room.add(markAssembly(box({
        name: `cabin-basement-supply-shelf-${z}-${shelfY}`,
        size: [0.62, 0.07, 2.55],
        pos: [shelfX, B.floorY + shelfY, z],
        mat: agedWood,
      }), 'cabin-basement-shelving'));
    }
    for (const dz of [-1.05, 1.05]) {
      room.add(markAssembly(box({
        name: `cabin-basement-shelf-upright-${z}-${dz}`,
        size: [0.12, 2.30, 0.12],
        pos: [shelfX, B.floorY + 1.15, z + dz],
        mat: utilityMetal,
      }), 'cabin-basement-shelving'));
    }
    addBasementCollider(colliders, [
      [B.x0 + 0.12, B.floorY, z - 1.30],
      [B.x0 + 0.82, B.floorY + 2.32, z + 1.30],
    ], `cabin-basement-shelving-${z > 0 ? 'south' : 'north'}`, 'prop');
  }

  const addSupplyPart = (mesh, assembly = 'cabin-basement-shelf-stock') => {
    room.add(markAssembly(mesh, assembly, { structural: true }));
    return mesh;
  };
  const shelfTop = (shelfY) => B.floorY + shelfY + 0.040;
  // Sparse clusters leave believable gaps while making the shelves read as
  // long-term provisions instead of empty carpentry.
  for (const item of [
    { name: 'first-aid-tin', shelf: 0.86, z: -2.45, xSize: 0.38, h: 0.25, zSize: 0.45, material: fadedRed },
    { name: 'battery-carton', shelf: 1.47, z: -2.48, xSize: 0.36, h: 0.24, zSize: 0.38, material: safetyYellow },
    { name: 'stove-fuel-box', shelf: 2.08, z: -1.92, xSize: 0.40, h: 0.31, zSize: 0.52, material: enamel },
    { name: 'folded-blanket-north-a', shelf: 0.86, z: -0.88, xSize: 0.42, h: 0.09, zSize: 0.66, material: blanketCanvas },
    { name: 'folded-blanket-north-b', shelf: 0.86, z: -0.88, xSize: 0.40, h: 0.08, zSize: 0.62, material: supplyCanvas, stack: 0.095 },
    { name: 'dry-goods-carton', shelf: 1.47, z: 0.72, xSize: 0.40, h: 0.34, zSize: 0.56, material: crateWood },
    { name: 'radio-battery-box', shelf: 2.08, z: 1.34, xSize: 0.38, h: 0.22, zSize: 0.44, material: fadedRed },
    { name: 'folded-blanket-south-a', shelf: 0.86, z: 2.20, xSize: 0.42, h: 0.10, zSize: 0.72, material: supplyCanvas },
    { name: 'folded-blanket-south-b', shelf: 0.86, z: 2.20, xSize: 0.40, h: 0.08, zSize: 0.66, material: blanketCanvas, stack: 0.105 },
  ]) {
    const base = shelfTop(item.shelf) + (item.stack ?? 0);
    addSupplyPart(box({
      name: `cabin-basement-${item.name}`,
      size: [item.xSize, item.h, item.zSize],
      pos: [shelfX + 0.05, base + item.h / 2, item.z],
      mat: item.material,
      cast: false,
    }));
  }
  for (const [index, item] of [
    { shelf: 1.47, z: -1.55, material: enamel },
    { shelf: 1.47, z: -1.31, material: safetyYellow },
    { shelf: 2.08, z: -0.72, material: enamel },
    { shelf: 1.47, z: 1.44, material: enamel },
    { shelf: 1.47, z: 1.68, material: fadedRed },
    { shelf: 2.08, z: 2.34, material: enamel },
  ].entries()) {
    addSupplyPart(cylinder({
      name: `cabin-basement-preserve-jar-${index + 1}`,
      r: 0.085,
      h: 0.24 + (index % 2) * 0.04,
      pos: [shelfX + 0.05, shelfTop(item.shelf) + 0.12 + (index % 2) * 0.02, item.z],
      mat: item.material,
      cast: false,
    }));
  }

  for (const [index, spec] of [
    { x: 2.20, z: -3.62, w: 0.86, h: 0.62, d: 0.82 },
    { x: 3.12, z: -3.56, w: 0.82, h: 0.48, d: 0.76 },
    { x: 2.50, z: -3.58, w: 0.72, h: 0.46, d: 0.68, y: 0.80 },
  ].entries()) {
    const y0 = B.floorY + (spec.y ?? 0);
    room.add(markAssembly(box({
      name: `cabin-basement-supply-crate-${index + 1}`,
      size: [spec.w, spec.h, spec.d],
      pos: [spec.x, y0 + spec.h / 2, spec.z],
      mat: crateWood,
    }), 'cabin-basement-supplies'));
    const frontZ = spec.z + spec.d / 2 + 0.024;
    for (const [rail, y] of [
      ['low', y0 + 0.11],
      ['high', y0 + spec.h - 0.11],
    ]) {
      addSupplyPart(box({
        name: `cabin-basement-supply-crate-${index + 1}-batten-${rail}`,
        size: [spec.w * 0.88, 0.070, 0.032],
        pos: [spec.x, y, frontZ],
        mat: crateBatten,
        cast: false,
      }), 'cabin-basement-crate-detail');
    }
    addSupplyPart(box({
      name: `cabin-basement-supply-crate-${index + 1}-label`,
      size: [Math.min(0.34, spec.w * 0.48), Math.min(0.17, spec.h * 0.34), 0.018],
      pos: [spec.x, y0 + spec.h * 0.53, frontZ + 0.028],
      mat: paper,
      cast: false,
    }), 'cabin-basement-crate-detail');
    addBasementCollider(colliders, [
      [spec.x - spec.w / 2, y0, spec.z - spec.d / 2],
      [spec.x + spec.w / 2, y0 + spec.h, spec.z + spec.d / 2],
    ], `cabin-basement-supply-crate-${index + 1}`, 'prop');
  }

  const barrelY = B.floorY + 0.55;
  for (const [index, x] of [3.85, 4.55].entries()) {
    room.add(markAssembly(cylinder({
      name: `cabin-basement-water-barrel-${index + 1}`,
      r: 0.30,
      h: 1.10,
      pos: [x, barrelY, -3.48],
      mat: utilityMetal,
    }), 'cabin-basement-supplies'));
    for (const [band, y] of [
      ['lower', B.floorY + 0.20],
      ['upper', B.floorY + 0.90],
    ]) {
      addSupplyPart(cylinder({
        name: `cabin-basement-water-barrel-${index + 1}-band-${band}`,
        r: 0.315,
        h: 0.035,
        pos: [x, y, -3.48],
        mat: wornMetal,
        cast: false,
      }), 'cabin-basement-barrel-detail');
    }
    addSupplyPart(cylinder({
      name: `cabin-basement-water-barrel-${index + 1}-lid`,
      r: 0.285,
      h: 0.030,
      pos: [x, B.floorY + 1.115, -3.48],
      mat: wornMetal,
      cast: false,
    }), 'cabin-basement-barrel-detail');
    addSupplyPart(box({
      name: `cabin-basement-water-barrel-${index + 1}-label`,
      size: [0.24, 0.18, 0.018],
      pos: [x, B.floorY + 0.57, -3.155],
      mat: paper,
      cast: false,
    }), 'cabin-basement-barrel-detail');
    addBasementCollider(colliders, [
      [x - 0.30, B.floorY, -3.78],
      [x + 0.30, B.floorY + 1.10, -3.18],
    ], `cabin-basement-water-barrel-${index + 1}`, 'prop');
  }

  const cot = group('cabin-basement-emergency-cot');
  markAssembly(cot, 'cabin-basement-cot');
  cot.add(box({ size: [1.20, 0.12, 2.25], pos: [3.72, B.floorY + 0.40, 0.40], mat: supplyCanvas }));
  for (const [x, z] of [[3.22, -0.52], [4.22, -0.52], [3.22, 1.32], [4.22, 1.32]]) {
    cot.add(box({ size: [0.08, 0.38, 0.08], pos: [x, B.floorY + 0.19, z], mat: utilityMetal }));
  }
  cot.add(box({
    name: 'cabin-basement-cot-pillow',
    size: [0.84, 0.14, 0.42],
    pos: [3.72, B.floorY + 0.53, -0.37],
    mat: enamel,
    rotY: 0.04,
  }));
  cot.add(box({
    name: 'cabin-basement-cot-folded-blanket',
    size: [1.04, 0.11, 0.62],
    pos: [3.72, B.floorY + 0.515, 1.00],
    mat: blanketCanvas,
    rotY: -0.025,
  }));
  cot.add(box({
    name: 'cabin-basement-cot-pocket-book',
    size: [0.25, 0.045, 0.34],
    pos: [3.37, B.floorY + 0.535, 0.42],
    mat: fadedRed,
    rotY: 0.18,
  }));
  room.add(cot);
  addBasementCollider(colliders, [
    [3.10, B.floorY, -0.72],
    [4.34, B.floorY + 0.48, 1.52],
  ], 'cabin-basement-emergency-cot', 'prop');

  // Modest services make the room feel maintained rather than magically
  // powered: a breaker panel, surface conduit and two water lines. They hug
  // the east wall and never narrow the traversable centre.
  addSupplyPart(box({
    name: 'cabin-basement-breaker-panel',
    size: [0.080, 0.82, 0.62],
    pos: [B.x1 - wallT - 0.075, B.floorY + 1.40, -0.90],
    mat: utilityMetal,
  }), 'cabin-basement-utilities');
  for (const [index, z] of [-1.08, -0.90, -0.72].entries()) {
    addSupplyPart(box({
      name: `cabin-basement-breaker-toggle-${index + 1}`,
      size: [0.035, 0.14, 0.095],
      pos: [B.x1 - wallT - 0.128, B.floorY + 1.42, z],
      mat: index === 1 ? safetyYellow : enamel,
      cast: false,
    }), 'cabin-basement-utilities');
  }
  addSupplyPart(cylinder({
    name: 'cabin-basement-electrical-conduit',
    r: 0.027,
    h: 1.02,
    pos: [B.x1 - wallT - 0.075, B.floorY + 2.31, -0.90],
    mat: wornMetal,
    cast: false,
  }), 'cabin-basement-utilities');
  for (const [index, z] of [0.30, 0.55].entries()) {
    addSupplyPart(cylinder({
      name: `cabin-basement-water-line-${index + 1}`,
      r: 0.032,
      h: 3.20,
      pos: [B.x1 - wallT - 0.075, B.floorY + 2.08, z],
      rotX: Math.PI / 2,
      mat: wornMetal,
      cast: false,
    }), 'cabin-basement-utilities');
  }

  // The lower ladder makes the off-screen wardrobe transfer spatially honest.
  // It occupies the south-east wall directly below the upper concealed panel.
  const ladder = group('cabin-basement-return-ladder');
  markAssembly(ladder, 'cabin-basement-ladder');
  for (const x of [4.72, 5.18]) {
    ladder.add(cylinder({
      r: 0.028,
      h: 2.28,
      pos: [x, B.floorY + 1.22, B.z1 - 0.24],
      mat: utilityMetal,
    }));
  }
  for (let y = B.floorY + 0.20; y <= B.ceilingY - 0.16; y += 0.30) {
    ladder.add(box({ size: [0.52, 0.045, 0.065], pos: [4.95, y, B.z1 - 0.24], mat: utilityMetal }));
  }
  room.add(ladder);

  const bulbMaterial = mat({ color: 0xffe7b5, emissive: 0xffaa43, emissiveIntensity: 2.35, roughness: 0.34 });
  const utilityLights = [];
  for (const [index, { x, z }] of [
    { x: -1.15, z: -2.45 },
    { x: 3.15, z: 2.45 },
  ].entries()) {
    const fixture = group(`cabin-basement-utility-light-${index + 1}`);
    markAssembly(fixture, 'cabin-basement-lighting', { structural: true });
    fixture.add(box({ size: [0.78, 0.08, 0.22], pos: [x, B.ceilingY - 0.12, z], mat: utilityMetal }));
    fixture.add(box({ size: [0.56, 0.045, 0.14], pos: [x, B.ceilingY - 0.18, z], mat: bulbMaterial, cast: false }));
    // These are strictly lower-storey lights. They start dark and are gated
    // from the live player's feet so two extra forward-light terms cannot
    // leak through the cabin floor or follow Tony around the property.
    const light = new THREE.PointLight(0xffcb86, 0, 8.5, 2);
    light.position.set(x, B.ceilingY - 0.28, z);
    fixture.add(light);
    utilityLights.push(light);
    room.add(fixture);
  }
  // A modest task lamp makes the repair bench the room's focal point. Its
  // point light remains the existing occupancy-gated fill rather than another
  // always-on light source that could leak through the cabin floor.
  for (const mesh of [
    cylinder({
      name: 'cabin-basement-work-lamp-base',
      r: 0.15,
      h: 0.045,
      pos: [-0.34, benchSurfaceY + 0.025, B.z0 + 0.50],
      mat: utilityMetal,
      cast: false,
    }),
    cylinder({
      name: 'cabin-basement-work-lamp-stem',
      r: 0.022,
      h: 0.43,
      pos: [-0.34, benchSurfaceY + 0.24, B.z0 + 0.50],
      mat: wornMetal,
      cast: false,
    }),
    cylinder({
      name: 'cabin-basement-work-lamp-shade',
      r: 0.18,
      h: 0.18,
      pos: [-0.34, benchSurfaceY + 0.47, B.z0 + 0.50],
      mat: safetyYellow,
      cast: false,
    }),
    cylinder({
      name: 'cabin-basement-work-lamp-bulb',
      r: 0.085,
      h: 0.055,
      pos: [-0.34, benchSurfaceY + 0.37, B.z0 + 0.50],
      mat: bulbMaterial,
      cast: false,
    }),
  ]) addWorkbenchPart(mesh);
  const warmFill = new THREE.PointLight(0x9b6d47, 0, 14, 1.25);
  warmFill.name = 'cabin-basement-warm-fill';
  warmFill.position.set(-0.34, benchSurfaceY + 0.34, B.z0 + 0.72);
  room.add(warmFill);

  const state = { discovered: false, entered: false, panelT: 0 };
  const canRevealBasement = () => ctx.canRevealBasement?.() === true;
  /* The old closet.back art remains the face of the secret instead of being
   * replaced by a bunker hatch. Timber stiles, inset seams and a short view
   * into the ladder shaft make it clear that the framed piece is mounted on
   * a real moving back-panel once the clothes have bunched to the side. */
  const upperAccess = group('cabin-basement-concealed-panel');
  // The back-panel hardware is a fitted part of the existing wardrobe/cabin
  // envelope. Giving it that structural owner lets the geometry gate reason
  // about the join directly, without adding suppression-policy debt.
  markAssembly(upperAccess, 'cabin-shell', { structural: true });
  const addEntryPart = (mesh) => {
    markAssembly(mesh, 'cabin-shell', { structural: true });
    upperAccess.add(mesh);
    return mesh;
  };
  const panelWood = M.darkWood ?? agedWood;
  const panelZ = 5.318;
  const panelHingeX = 5.56;
  const panelPivot = group('cabin-basement-panel-pivot');
  panelPivot.position.set(panelHingeX, 0, panelZ);
  markAssembly(panelPivot, 'cabin-shell', { structural: true });
  upperAccess.add(panelPivot);
  const addPanelPart = (mesh) => {
    markAssembly(mesh, 'cabin-shell', { structural: true });
    mesh.position.x -= panelHingeX;
    mesh.position.z -= panelZ;
    panelPivot.add(mesh);
    return mesh;
  };
  for (const [name, size, pos] of [
    ['cabin-basement-panel-stile-west', [0.065, 2.05, 0.045], [4.64, 1.18, panelZ]],
    ['cabin-basement-panel-stile-east', [0.065, 2.05, 0.045], [5.56, 1.18, panelZ]],
    ['cabin-basement-panel-rail-bottom', [0.985, 0.065, 0.045], [5.10, 0.17, panelZ]],
    ['cabin-basement-panel-rail-top', [0.985, 0.065, 0.045], [5.10, 2.19, panelZ]],
    // These four board fields surround, rather than cover, closet.back.
    ['cabin-basement-panel-board-low', [0.84, 0.70, 0.025], [5.10, 0.56, panelZ + 0.012]],
    ['cabin-basement-panel-board-high', [0.84, 0.49, 0.025], [5.10, 1.91, panelZ + 0.012]],
    ['cabin-basement-panel-board-art-west', [0.17, 0.72, 0.025], [4.755, 1.28, panelZ + 0.012]],
    ['cabin-basement-panel-board-art-east', [0.17, 0.72, 0.025], [5.445, 1.28, panelZ + 0.012]],
  ]) {
    addPanelPart(box({ name, size, pos, mat: panelWood, cast: false }));
  }

  // Preserve the original asset as the public source contract while putting
  // a shared-geometry clone on the moving leaf. This keeps closet.back as the
  // secret's face without leaving a second copy floating on the fixed wall.
  const panelArt = wardrobe?.picture ?? null;
  let movingPanelArt = null;
  if (panelArt) {
    panelArt.visible = !canRevealBasement();
    movingPanelArt = panelArt.clone();
    movingPanelArt.name = 'cabin-basement-moving-panel-art';
    movingPanelArt.visible = true;
    movingPanelArt.position.set(5.10 - panelHingeX, panelArt.position.y, panelArt.position.z - panelZ);
    markAssembly(movingPanelArt, 'cabin-shell', { structural: true });
    panelPivot.add(movingPanelArt);
  }

  // A dark opening and honest ladder hardware sell the vertical route even
  // though the climb itself is an authored transition rather than stairs.
  addEntryPart(box({
    name: 'cabin-basement-upper-shaft-mouth',
    size: [0.66, 0.54, 0.030],
    pos: [5.10, 0.50, panelZ - 0.020],
    mat: mortar,
    cast: false,
  }));
  for (const x of [4.91, 5.29]) {
    addEntryPart(box({
      name: `cabin-basement-upper-ladder-rail-${x < 5 ? 'west' : 'east'}`,
      size: [0.045, 0.48, 0.045],
      pos: [x, 0.50, panelZ - 0.045],
      mat: utilityMetal,
    }));
  }
  for (let index = 0; index < 4; index += 1) {
    addEntryPart(box({
      name: `cabin-basement-upper-ladder-rung-${index + 1}`,
      size: [0.43, 0.035, 0.050],
      pos: [5.10, 0.32 + index * 0.12, panelZ - 0.050],
      mat: utilityMetal,
    }));
  }
  for (const [index, y] of [0.62, 1.86].entries()) {
    addEntryPart(cylinder({
      name: `cabin-basement-panel-hinge-${index + 1}`,
      r: 0.028,
      h: 0.24,
      pos: [5.555, y, panelZ - 0.040],
      mat: utilityMetal,
    }));
  }

  // The thin glow sits behind the leaf and only appears once it has begun to
  // swing. Three strips imply light spilling from the shaft without turning
  // the entire opening into a luminous rectangle.
  const panelLightLeak = group('cabin-basement-panel-light-leak');
  markAssembly(panelLightLeak, 'cabin-shell', { structural: true });
  panelLightLeak.visible = false;
  const leakMaterial = mat({
    color: 0xffc06a,
    emissive: 0xff8a2c,
    emissiveIntensity: 2.6,
    roughness: 0.42,
  });
  for (const [name, size, pos] of [
    ['west', [0.035, 1.92, 0.014], [4.66, 1.18, panelZ - 0.030]],
    ['top', [0.86, 0.035, 0.014], [5.10, 2.13, panelZ - 0.030]],
    ['bottom', [0.86, 0.035, 0.014], [5.10, 0.23, panelZ - 0.030]],
  ]) {
    panelLightLeak.add(markAssembly(box({
      name: `cabin-basement-panel-light-leak-${name}`,
      size,
      pos,
      mat: leakMaterial,
      cast: false,
    }), 'cabin-shell', { structural: true }));
  }
  upperAccess.add(panelLightLeak);

  const entranceTarget = invisibleTarget(
    'cabin-basement-concealed-panel-target',
    [0.82, 1.55, 0.12],
    [5.10, 1.02, 5.22],
  );
  addEntryPart(entranceTarget);
  const latch = box({
    name: 'cabin-basement-concealed-panel-latch',
    size: [0.055, 0.20, 0.055],
    pos: [4.72, 1.27, panelZ - 0.052],
    mat: utilityMetal,
  });
  addPanelPart(latch);
  root.add(upperAccess);

  const syncRevealVisibility = () => {
    const revealed = canRevealBasement();
    upperAccess.visible = revealed;
    entranceTarget.visible = revealed;
    if (panelArt) panelArt.visible = !revealed;
    if (movingPanelArt) movingPanelArt.visible = revealed;
    return revealed;
  };
  syncRevealVisibility();

  const exitTarget = invisibleTarget(
    'cabin-basement-return-ladder-target',
    [0.80, 1.75, 0.20],
    [4.95, B.floorY + 1.25, B.z1 - 0.34],
  );
  markAssembly(exitTarget, 'cabin-basement-exit');
  room.add(exitTarget);

  const discover = () => {
    if (!canRevealBasement()) return false;
    if (state.discovered) return false;
    state.discovered = true;
    ctx.onDiscover?.('basement');
    return true;
  };
  utilityTargets.basementEntrance = entranceTarget;
  interaction.register(entranceTarget, {
    label: 'Push through the hangers and open the <b>concealed panel</b>',
    enabled: () => canRevealBasement()
      && wardrobeState?.closetOpen === true
      && wardrobeState.closetT >= 0.82,
    onLook: discover,
    onUse: () => {
      if (!canRevealBasement()) return false;
      discover();
      const firstEntry = !state.entered;
      state.entered = true;
      ctx.onBasementTransition?.('down', { firstEntry });
      return true;
    },
  });
  utilityTargets.basementExit = exitTarget;
  interaction.register(exitTarget, {
    label: 'Climb back up through the <b>wardrobe</b>',
    onUse: () => ctx.onBasementTransition?.('up'),
  });

  const inspectionSpecs = Object.freeze({
    basementWorkbench: Object.freeze({
      id: 'workbench',
      label: 'Inspect the <b>repair bench</b>',
      size: [2.90, 1.28, 0.16],
      position: [-0.95, B.floorY + 1.28, B.z0 + 1.02],
      viewpoint: Object.freeze({
        position: new THREE.Vector3(-0.95, B.floorY + WALK_EYE_HEIGHT, B.z0 + 2.20),
        lookAt: new THREE.Vector3(-0.95, B.floorY + 1.12, B.z0 + 0.92),
      }),
    }),
    basementShelves: Object.freeze({
      id: 'shelves',
      label: 'Inspect the <b>stocked shelves</b>',
      size: [0.16, 1.86, 5.45],
      position: [B.x0 + 0.86, B.floorY + 1.22, 0],
      viewpoint: Object.freeze({
        position: new THREE.Vector3(B.x0 + 2.10, B.floorY + WALK_EYE_HEIGHT, 0.15),
        lookAt: new THREE.Vector3(B.x0 + 0.78, B.floorY + 1.16, 0.15),
      }),
    }),
    basementCot: Object.freeze({
      id: 'cot',
      label: 'Inspect the <b>emergency cot</b>',
      size: [0.16, 0.70, 2.04],
      position: [3.02, B.floorY + 0.46, 0.40],
      viewpoint: Object.freeze({
        position: new THREE.Vector3(1.78, B.floorY + WALK_EYE_HEIGHT, 0.40),
        lookAt: new THREE.Vector3(3.08, B.floorY + 0.48, 0.40),
      }),
    }),
  });
  const inspectionViewpoints = {};
  for (const [key, spec] of Object.entries(inspectionSpecs)) {
    const target = invisibleTarget(`cabin-${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}-target`, spec.size, spec.position);
    markAssembly(target, 'cabin-basement-interaction', {
      overlap: false,
      checkSupport: false,
      checkWallEmbed: false,
    });
    room.add(target);
    utilityTargets[key] = target;
    interaction.register(target, {
      label: spec.label,
      onUse: () => ctx.onBasementInspect?.(spec.id),
    });
    const position = spec.viewpoint.position.clone();
    const lookAt = spec.viewpoint.lookAt.clone();
    const horizontal = Math.hypot(lookAt.x - position.x, lookAt.z - position.z);
    inspectionViewpoints[key] = Object.freeze({
      id: key,
      floorY: B.floorY,
      position,
      lookAt,
      yaw: Math.atan2(-(lookAt.x - position.x), -(lookAt.z - position.z)),
      pitch: Math.atan2(lookAt.y - position.y, Math.max(0.001, horizontal)),
    });
  }

  const spawns = Object.freeze({
    down: Object.freeze({
      id: 'basement',
      floorY: B.floorY,
      position: new THREE.Vector3(4.52, B.floorY + WALK_EYE_HEIGHT, 3.24),
      yaw: 0.92,
      pitch: -0.08,
    }),
    up: Object.freeze({
      id: 'wardrobeReturn',
      floorY: 0,
      // Stand square to the wardrobe opening. The earlier west-offset pose
      // aimed diagonally through the closet jamb, so the wardrobe owner won
      // the production interaction ray even after its hangers had cleared.
      position: new THREE.Vector3(5.10, WALK_EYE_HEIGHT, 3.42),
      yaw: Math.PI,
      pitch: -0.05,
    }),
    dungeonEntry: dungeon.spawns.entry,
    dungeon: dungeon.spawns.room,
  });

  let dungeonElapsed = 0;
  const update = (dtOrPlayer = null, elapsed = undefined, explicitPlayerPosition = null) => {
    const legacyPlayerCall = dtOrPlayer && typeof dtOrPlayer === 'object'
      && Number.isFinite(dtOrPlayer.x)
      && Number.isFinite(dtOrPlayer.y)
      && Number.isFinite(dtOrPlayer.z);
    const dt = legacyPlayerCall
      ? 1 / 60
      : Number.isFinite(Number(dtOrPlayer)) ? Math.max(0, Number(dtOrPlayer)) : 1 / 60;
    const playerPosition = legacyPlayerCall ? dtOrPlayer : explicitPlayerPosition;
    dungeonElapsed = Number.isFinite(elapsed) ? elapsed : dungeonElapsed + dt;

    const revealed = syncRevealVisibility();
    const rawPanelT = revealed
      ? THREE.MathUtils.clamp(((wardrobeState?.closetT ?? 0) - 0.68) / 0.32, 0, 1)
      : 0;
    state.panelT = rawPanelT * rawPanelT * (3 - 2 * rawPanelT);
    panelPivot.rotation.y = PANEL_OPEN_ANGLE * state.panelT;
    panelLightLeak.visible = revealed && state.panelT > 0.025;
    const feetY = playerPosition ? playerPosition.y - WALK_EYE_HEIGHT : 0;
    const occupied = Boolean(playerPosition)
      && insideCabinCellar(playerPosition.x, playerPosition.z)
      && Number(feetY) < B.levelSplitY;
    for (const light of utilityLights) light.intensity = occupied ? UTILITY_LIGHT_INTENSITY : 0;
    warmFill.intensity = occupied ? WORKBENCH_FILL_INTENSITY : 0;
    const dungeonFrame = dungeon.update(dt, dungeonElapsed, playerPosition);
    return occupied || dungeonFrame.occupied;
  };

  const dispose = () => dungeon.dispose();

  return Object.freeze({
    root: room,
    bounds: Object.freeze({
      cellar: B,
      corridor: CABIN_DUNGEON_CORRIDOR,
      dungeon: CABIN_DUNGEON,
      dungeonDoor: CABIN_DUNGEON_DOOR,
    }),
    dungeon,
    entryAssembly: upperAccess,
    panelArt,
    movingPanelArt,
    panelPivot,
    panelLightLeak,
    entryTarget: entranceTarget,
    exitTarget,
    inspectionViewpoints: Object.freeze(inspectionViewpoints),
    spawns,
    lights: Object.freeze(utilityLights),
    fillLight: warmFill,
    update,
    dispose,
    get discovered() { return state.discovered; },
    get entered() { return state.entered; },
  });
}
