/**
 * The Hideout's concealed lower room occupies the same X/Z footprint as the
 * cabin above it. `resolveCabinFloor` therefore takes the caller's current
 * foot height, just as the mansion's multi-storey resolver does, and leaves
 * the outdoor property function in charge everywhere else.
 */

import * as THREE from 'three';

import { markSpatialPrimitive } from '../core/spatial-contract.js';
import { box, boxFrom, collider, cylinder, group, mat } from '../world/build.js';

export const CABIN_BASEMENT = Object.freeze({
  x0: -5.45,
  x1: 5.45,
  z0: -4.55,
  z1: 4.65,
  floorY: -3.15,
  ceilingY: -0.42,
  levelSplitY: -1.20,
});

function insideBasement(x, z) {
  return x >= CABIN_BASEMENT.x0 && x <= CABIN_BASEMENT.x1
    && z >= CABIN_BASEMENT.z0 && z <= CABIN_BASEMENT.z1;
}

export function resolveCabinFloor(x, z, feetY = 0, baseGroundAt = () => 0) {
  if (insideBasement(x, z) && Number(feetY) < CABIN_BASEMENT.levelSplitY) {
    return CABIN_BASEMENT.floorY;
  }
  return typeof baseGroundAt === 'function' ? baseGroundAt(x, z) : Number(baseGroundAt) || 0;
}

const WALK_EYE_HEIGHT = 1.66;
const UTILITY_LIGHT_INTENSITY = 2.10;

function markAssembly(object, assemblyId, metadata = {}) {
  object.userData ??= {};
  object.userData.geometryGate = {
    ...(object.userData.geometryGate ?? {}),
    assemblyId,
    ...metadata,
  };
  return object;
}

function addBasementCollider(colliders, bounds, name, kind = 'world') {
  const volume = collider(bounds[0], bounds[1]);
  volume.name = name;
  markSpatialPrimitive(volume, { id: name, kind });
  markAssembly(volume, 'cabin-basement-collision');
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
 * The public surface is intentionally small: two transition targets and two
 * complete player poses. The scene composition root owns the actual transfer,
 * so this geometry module never reaches into Player or campaign state.
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
  const utilityMetal = mat({ color: 0x596064, roughness: 0.66, metalness: 0.38 });
  const crateWood = mat({ color: 0x745233, roughness: 0.96 });
  const supplyCanvas = mat({ color: 0x59604c, roughness: 0.98 });

  const addStructure = (mesh, { occludes = true } = {}) => {
    markAssembly(mesh, 'cabin-basement', { structural: true });
    room.add(mesh);
    if (occludes) occluders.push(mesh);
    return mesh;
  };

  addStructure(boxFrom(B.x0, B.floorY - 0.14, B.z0, B.x1, B.floorY, B.z1, M.floor, {
    name: 'cabin-basement-timber-floor', cast: false,
  }), { occludes: false });
  addStructure(boxFrom(B.x0, B.ceilingY, B.z0, B.x1, B.ceilingY + 0.14, B.z1, agedWood, {
    name: 'cabin-basement-timber-ceiling', cast: false,
  }));

  const wallH = B.ceilingY - B.floorY;
  const wallY = B.floorY + wallH / 2;
  const wallT = 0.22;
  for (const [name, size, pos, bounds] of [
    ['cabin-basement-wall-west', [wallT, wallH, B.z1 - B.z0], [B.x0 + wallT / 2, wallY, (B.z0 + B.z1) / 2], [[B.x0, B.floorY, B.z0], [B.x0 + wallT, B.ceilingY, B.z1]]],
    ['cabin-basement-wall-east', [wallT, wallH, B.z1 - B.z0], [B.x1 - wallT / 2, wallY, (B.z0 + B.z1) / 2], [[B.x1 - wallT, B.floorY, B.z0], [B.x1, B.ceilingY, B.z1]]],
    ['cabin-basement-wall-north', [B.x1 - B.x0, wallH, wallT], [(B.x0 + B.x1) / 2, wallY, B.z0 + wallT / 2], [[B.x0, B.floorY, B.z0], [B.x1, B.ceilingY, B.z0 + wallT]]],
    ['cabin-basement-wall-south', [B.x1 - B.x0, wallH, wallT], [(B.x0 + B.x1) / 2, wallY, B.z1 - wallT / 2], [[B.x0, B.floorY, B.z1 - wallT], [B.x1, B.ceilingY, B.z1]]],
  ]) {
    addStructure(box({ name, size, pos, mat: wall, cast: false }));
    addBasementCollider(colliders, bounds, name, 'world');
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
  for (let index = 0; index < 7; index += 1) {
    room.add(markAssembly(box({
      name: `cabin-basement-hand-tool-${index + 1}`,
      size: [0.055, 0.28 + (index % 3) * 0.07, 0.035],
      pos: [-2.05 + index * 0.37, B.floorY + 1.50, B.z0 + 0.225],
      mat: utilityMetal,
      rotZ: (index % 2 ? -1 : 1) * 0.12,
    }), 'cabin-basement-workbench'));
  }
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
  room.add(cot);
  addBasementCollider(colliders, [
    [3.10, B.floorY, -0.72],
    [4.34, B.floorY + 0.48, 1.52],
  ], 'cabin-basement-emergency-cot', 'prop');

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

  const bulbMaterial = mat({ color: 0xffe0a1, emissive: 0xffaa43, emissiveIntensity: 1.6, roughness: 0.4 });
  const utilityLights = [];
  for (const [index, x] of [-2.35, 2.25].entries()) {
    const fixture = group(`cabin-basement-utility-light-${index + 1}`);
    markAssembly(fixture, 'cabin-basement-lighting', { structural: true });
    fixture.add(box({ size: [0.78, 0.08, 0.22], pos: [x, B.ceilingY - 0.12, 0], mat: utilityMetal }));
    fixture.add(box({ size: [0.56, 0.045, 0.14], pos: [x, B.ceilingY - 0.18, 0], mat: bulbMaterial, cast: false }));
    // These are strictly lower-storey lights. They start dark and are gated
    // from the live player's feet so two extra forward-light terms cannot
    // leak through the cabin floor or follow Tony around the property.
    const light = new THREE.PointLight(0xffcb86, 0, 8.5, 2);
    light.position.set(x, B.ceilingY - 0.28, 0);
    fixture.add(light);
    utilityLights.push(light);
    room.add(fixture);
  }
  const warmFill = new THREE.PointLight(0x9b6d47, 0, 14, 1.25);
  warmFill.name = 'cabin-basement-warm-fill';
  warmFill.position.set(0, B.ceilingY - 0.25, 0);
  room.add(warmFill);

  const state = { discovered: false };
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
    addEntryPart(box({ name, size, pos, mat: panelWood, cast: false }));
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
  addEntryPart(latch);
  root.add(upperAccess);

  const exitTarget = invisibleTarget(
    'cabin-basement-return-ladder-target',
    [0.80, 1.75, 0.20],
    [4.95, B.floorY + 1.25, B.z1 - 0.34],
  );
  markAssembly(exitTarget, 'cabin-basement-exit');
  room.add(exitTarget);

  const discover = () => {
    if (state.discovered) return false;
    state.discovered = true;
    ctx.onDiscover?.('basement');
    return true;
  };
  utilityTargets.basementEntrance = entranceTarget;
  interaction.register(entranceTarget, {
    label: 'Push through the hangers and open the <b>concealed panel</b>',
    enabled: () => wardrobeState?.closetOpen === true && wardrobeState.closetT >= 0.82,
    onLook: discover,
    onUse: () => {
      discover();
      ctx.onBasementTransition?.('down');
    },
  });
  utilityTargets.basementExit = exitTarget;
  interaction.register(exitTarget, {
    label: 'Climb back up through the <b>wardrobe</b>',
    onUse: () => ctx.onBasementTransition?.('up'),
  });

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
  });

  const update = (playerPosition = null) => {
    const feetY = playerPosition ? playerPosition.y - WALK_EYE_HEIGHT : 0;
    const occupied = Boolean(playerPosition)
      && insideBasement(playerPosition.x, playerPosition.z)
      && Number(feetY) < B.levelSplitY;
    for (const light of utilityLights) light.intensity = occupied ? UTILITY_LIGHT_INTENSITY : 0;
    warmFill.intensity = occupied ? 0.78 : 0;
    return occupied;
  };

  return Object.freeze({
    root: room,
    entryAssembly: upperAccess,
    panelArt: wardrobe?.picture ?? null,
    entryTarget: entranceTarget,
    exitTarget,
    spawns,
    lights: Object.freeze(utilityLights),
    fillLight: warmFill,
    update,
    get discovered() { return state.discovered; },
  });
}
