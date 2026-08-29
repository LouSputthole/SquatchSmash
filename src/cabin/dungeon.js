/**
 * The Hideout's second secret: a same-level service passage and interrogation
 * dungeon beyond the finished storage cellar.
 *
 * This module owns presentation only. It builds geometry, restrained actors,
 * interaction targets and an animated concealed door, then reports intent
 * through callbacks. Campaign order, dialogue, damage and choices remain with
 * the Cabin composition root.
 */

import * as THREE from 'three';

import { Npc } from '../bing/cast.js';
import { FAMILY } from '../bing/family.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { getCharacter } from '../core/characters.js';
import { markSpatialPrimitive } from '../core/spatial-contract.js';
import { WEAPON_IDS } from '../core/weapons/catalog.js';
import { dressInATeamColours } from '../world/ateam.js';
import { box, boxFrom, collider, cylinder, group, mat } from '../world/build.js';

export const CABIN_DUNGEON_DOOR = Object.freeze({
  x0: 0.12,
  x1: 1.72,
  z: 4.65,
  floorY: -3.15,
  topY: -0.92,
  thickness: 0.24,
});

export const CABIN_DUNGEON_CORRIDOR = Object.freeze({
  x0: 0.04,
  x1: 1.80,
  z0: 4.43,
  z1: 8.92,
  // The door threshold remains on the finished cellar datum. Beyond it, a
  // short service ramp drops the bunker below the trail's lowest terrain.
  floorY: -3.15,
  floorY0: -3.15,
  floorY1: -5.05,
  ceilingY: -0.42,
  ceilingY0: -0.42,
  ceilingY1: -1.82,
  levelSplitY: -2.25,
});

export const CABIN_DUNGEON = Object.freeze({
  x0: -8.20,
  x1: 8.35,
  z0: 8.92,
  z1: 21.10,
  floorY: -5.05,
  ceilingY: -1.82,
  levelSplitY: -2.25,
});

export const CABIN_CAPTIVE_IDS = Object.freeze({
  ATEAM: 'ateam',
  COUNTER_STRIKE: 'counterStrike',
});

export const CABIN_CAPTIVE_CLEANUP_BODY_IDS = Object.freeze({
  [CABIN_CAPTIVE_IDS.ATEAM]: 'a-team-member',
  [CABIN_CAPTIVE_IDS.COUNTER_STRIKE]: 'counterstrike-player',
});

/** Layout override consumed directly by buildCabinBodyCleanup(). */
export const CABIN_DUNGEON_CLEANUP_LAYOUT = Object.freeze({
  dungeon: Object.freeze({
    'counterstrike-player': Object.freeze({
      x: -3.18, y: CABIN_DUNGEON.floorY + 0.004, z: 16.42, rotationY: 0.04,
    }),
    'a-team-member': Object.freeze({
      x: 6.24, y: CABIN_DUNGEON.floorY + 0.004, z: 14.46, rotationY: -0.07,
    }),
  }),
});

const WALK_EYE_HEIGHT = 1.66;
const DOOR_TRAVEL = 1.82;
const DOOR_SPEED = 1.55;
const CELL_DOOR_SPEED = 2.20;
const CELL_DOOR_OPEN_ANGLE = -Math.PI * 0.52;
const CAPTIVE_FEEDBACK_IDS = new Set([
  'impact', 'pinch', 'saw', 'shock', 'jab', 'smother', 'arc', 'douse',
]);

const NO_CAPTIVE_FEEDBACK = Object.freeze({
  groupRoll: 0,
  bodyPitch: 0,
  bodyRoll: 0,
  headRoll: 0,
  armL: 0,
  armR: 0,
  foreL: 0,
  foreR: 0,
  legL: 0,
  legR: 0,
});

function captiveFeedbackFrame(state) {
  if (!state.feedback || state.feedbackRemaining <= 0 || state.dead || state.wrapped) {
    return NO_CAPTIVE_FEEDBACK;
  }
  const progress = 1 - state.feedbackRemaining / Math.max(0.001, state.feedbackDuration);
  const envelope = Math.sin(THREE.MathUtils.clamp(progress, 0, 1) * Math.PI)
    * state.feedbackStrength;
  const frame = { ...NO_CAPTIVE_FEEDBACK };
  if (state.feedback === 'pinch') {
    frame.groupRoll = 0.025 * envelope;
    frame.bodyRoll = 0.11 * envelope;
    frame.headRoll = -0.10 * envelope;
    frame.foreL = 0.16 * envelope;
    frame.foreR = -0.12 * envelope;
  } else if (state.feedback === 'saw') {
    const sweep = Math.sin(progress * Math.PI * 8) * envelope;
    frame.groupRoll = 0.12 * sweep;
    frame.bodyRoll = -0.14 * sweep;
    frame.headRoll = 0.10 * sweep;
    frame.armL = -0.18 * envelope;
    frame.armR = 0.06 * envelope;
  } else if (state.feedback === 'shock') {
    const jolt = Math.sin(progress * Math.PI * 18) * envelope;
    frame.groupRoll = 0.10 * jolt;
    frame.bodyPitch = -0.12 * envelope;
    frame.bodyRoll = -0.08 * jolt;
    frame.headRoll = 0.15 * jolt;
    frame.armL = -0.18 * envelope;
    frame.armR = -0.18 * envelope;
    frame.legL = 0.08 * jolt;
    frame.legR = -0.08 * jolt;
  } else if (state.feedback === 'jab') {
    frame.groupRoll = -0.02 * envelope;
    frame.bodyPitch = -0.08 * envelope;
    frame.bodyRoll = 0.03 * envelope;
    frame.headRoll = -0.14 * envelope;
    frame.armL = -0.03 * envelope;
    frame.armR = -0.12 * envelope;
  } else if (state.feedback === 'smother') {
    frame.groupRoll = -0.07 * envelope;
    frame.bodyPitch = 0.18 * envelope;
    frame.bodyRoll = -0.04 * envelope;
    frame.headRoll = 0.16 * envelope;
    frame.armL = 0.12 * envelope;
    frame.armR = 0.12 * envelope;
  } else if (state.feedback === 'arc') {
    const jolt = Math.sin(progress * Math.PI * 12) * envelope;
    frame.groupRoll = 0.15 * jolt;
    frame.bodyPitch = -0.06 * envelope;
    frame.bodyRoll = 0.12 * jolt;
    frame.headRoll = -0.18 * jolt;
    frame.foreL = -0.14 * envelope;
    frame.foreR = -0.18 * envelope;
  } else if (state.feedback === 'douse') {
    frame.groupRoll = 0.14 * envelope;
    frame.bodyPitch = 0.24 * envelope;
    frame.bodyRoll = 0.08 * envelope;
    frame.headRoll = -0.22 * envelope;
    frame.armL = 0.16 * envelope;
    frame.armR = 0.10 * envelope;
  } else {
    frame.groupRoll = 0.05 * envelope;
    frame.bodyRoll = 0.08 * envelope;
    frame.headRoll = -0.06 * envelope;
    frame.armL = -0.05 * envelope;
    frame.armR = -0.05 * envelope;
  }
  return frame;
}

export function insideCabinDungeon(x, z) {
  const corridor = x >= CABIN_DUNGEON_CORRIDOR.x0 && x <= CABIN_DUNGEON_CORRIDOR.x1
    && z >= CABIN_DUNGEON_CORRIDOR.z0 && z <= CABIN_DUNGEON_CORRIDOR.z1;
  const room = x >= CABIN_DUNGEON.x0 && x <= CABIN_DUNGEON.x1
    && z >= CABIN_DUNGEON.z0 && z <= CABIN_DUNGEON.z1;
  return corridor || room;
}

function corridorProgress(z) {
  return THREE.MathUtils.clamp(
    (Number(z) - CABIN_DUNGEON_CORRIDOR.z0)
      / (CABIN_DUNGEON_CORRIDOR.z1 - CABIN_DUNGEON_CORRIDOR.z0),
    0,
    1,
  );
}

export function cabinDungeonFloorAt(x, z) {
  if (x >= CABIN_DUNGEON.x0 && x <= CABIN_DUNGEON.x1
    && z >= CABIN_DUNGEON.z0 && z <= CABIN_DUNGEON.z1) {
    return CABIN_DUNGEON.floorY;
  }
  if (x >= CABIN_DUNGEON_CORRIDOR.x0 && x <= CABIN_DUNGEON_CORRIDOR.x1
    && z >= CABIN_DUNGEON_CORRIDOR.z0 && z <= CABIN_DUNGEON_CORRIDOR.z1) {
    return THREE.MathUtils.lerp(
      CABIN_DUNGEON_CORRIDOR.floorY0,
      CABIN_DUNGEON_CORRIDOR.floorY1,
      corridorProgress(z),
    );
  }
  return null;
}

export function cabinDungeonCeilingAt(x, z) {
  if (x >= CABIN_DUNGEON.x0 && x <= CABIN_DUNGEON.x1
    && z >= CABIN_DUNGEON.z0 && z <= CABIN_DUNGEON.z1) {
    return CABIN_DUNGEON.ceilingY;
  }
  if (x >= CABIN_DUNGEON_CORRIDOR.x0 && x <= CABIN_DUNGEON_CORRIDOR.x1
    && z >= CABIN_DUNGEON_CORRIDOR.z0 && z <= CABIN_DUNGEON_CORRIDOR.z1) {
    return THREE.MathUtils.lerp(
      CABIN_DUNGEON_CORRIDOR.ceilingY0,
      CABIN_DUNGEON_CORRIDOR.ceilingY1,
      corridorProgress(z),
    );
  }
  return null;
}

export function resolveCabinDungeonFloor(x, z, feetY = 0, fallback = null) {
  const floorY = cabinDungeonFloorAt(x, z);
  if (floorY !== null && Number(feetY) < CABIN_DUNGEON.levelSplitY) {
    return floorY;
  }
  return typeof fallback === 'function' ? fallback(x, z) : fallback;
}

function markAssembly(object, assemblyId, metadata = {}) {
  object.userData ??= {};
  object.userData.geometryGate = {
    ...(object.userData.geometryGate ?? {}),
    assemblyId,
    ...metadata,
  };
  return object;
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

function yawToward(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function tagCaptiveTree(root, id) {
  root?.traverse?.((part) => {
    part.userData ??= {};
    part.userData.cabinCaptiveId = id;
    part.userData.cabinDisposable = true;
  });
}

function actorAnchor(parent, name, position, captiveId = null) {
  const anchor = new THREE.Object3D();
  anchor.name = name;
  anchor.position.set(...position);
  anchor.userData.cabinActorAnchor = name;
  if (captiveId) anchor.userData.cabinCaptiveId = captiveId;
  parent.add(anchor);
  return anchor;
}

function smoothUnit(value) {
  const t = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
  return t * t * (3 - 2 * t);
}

function finiteStep(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;
}

/**
 * Build the Cabin-local dungeon. No Mansion scene objects or state are used.
 */
export function buildCabinDungeon({
  root,
  M = {},
  colliders,
  occluders = [],
  interaction,
  utilityTargets = {},
  ctx = {},
} = {}) {
  if (!root?.add || !Array.isArray(colliders) || !interaction?.register) {
    throw new TypeError('buildCabinDungeon requires root, colliders and interaction');
  }

  const dungeonRoot = group('cabin-hideout-dungeon');
  markAssembly(dungeonRoot, 'cabin-dungeon');
  root.add(dungeonRoot);

  const D = CABIN_DUNGEON;
  const C = CABIN_DUNGEON_CORRIDOR;
  const doorSpec = CABIN_DUNGEON_DOOR;
  const materials = Object.freeze({
    concrete: mat({ color: 0x343637, roughness: 0.99 }),
    concreteDark: mat({ color: 0x202223, roughness: 1 }),
    mortar: mat({ color: 0x242627, roughness: 1 }),
    floor: mat({ color: 0x292a29, roughness: 0.98 }),
    wet: mat({ color: 0x111719, roughness: 0.54, metalness: 0.04 }),
    steel: mat({ color: 0x62686b, roughness: 0.54, metalness: 0.52 }),
    blackSteel: mat({ color: 0x25292b, roughness: 0.48, metalness: 0.58 }),
    rust: mat({ color: 0x6a3725, roughness: 0.91, metalness: 0.18 }),
    wood: mat({ color: 0x4a2f20, roughness: 0.98 }),
    oldWood: mat({ color: 0x30241d, roughness: 1 }),
    canvas: mat({ color: 0x8b8170, roughness: 1 }),
    towel: mat({ color: 0xc3bba9, roughness: 1 }),
    rubber: mat({ color: 0x18191a, roughness: 0.84 }),
    redRubber: mat({ color: 0x842d2b, roughness: 0.82 }),
    acid: mat({ color: 0xb19534, roughness: 0.75 }),
    blood: mat({ color: 0x4d0909, roughness: 0.42, metalness: 0.02 }),
    bloodFresh: mat({ color: 0x760b0b, roughness: 0.34, metalness: 0.03 }),
    paleLight: mat({
      color: 0xd9eff2,
      emissive: 0x9bcbd1,
      emissiveIntensity: 2.8,
      roughness: 0.25,
    }),
    amberLight: mat({
      color: 0xffc678,
      emissive: 0xff8a35,
      emissiveIntensity: 2.4,
      roughness: 0.30,
    }),
    tarp: mat({ color: 0x343b35, roughness: 1 }),
  });

  const add = (mesh, assembly = 'cabin-dungeon', { occludes = false, structural = true } = {}) => {
    markAssembly(mesh, assembly, { structural });
    dungeonRoot.add(mesh);
    if (occludes) occluders.push(mesh);
    return mesh;
  };

  const addCollider = (bounds, name, kind = 'world', assembly = 'cabin-lower-level-collision') => {
    const volume = collider(bounds[0], bounds[1]);
    volume.name = name;
    markSpatialPrimitive(volume, { id: name, kind });
    markAssembly(volume, assembly);
    colliders.push(volume);
    return volume;
  };

  // The threshold shares the finished cellar datum, then a steep service
  // ramp descends below the outdoor trail. Both rendered slabs follow the
  // exact resolver endpoints; this is buried architecture, not geometry
  // hidden by turning off a terrain-overlap check.
  const corridorRun = C.z1 - C.z0;
  const slopedSlab = ({ name, y0, y1, thickness, material, underside = false }) => {
    const rise = y1 - y0;
    const length = Math.hypot(corridorRun, rise);
    const angle = Math.atan2(-rise, corridorRun);
    const normalOffset = (underside ? 1 : -1) * thickness * Math.cos(angle) / 2;
    return box({
      name,
      size: [C.x1 - C.x0, thickness, length],
      pos: [(C.x0 + C.x1) / 2, (y0 + y1) / 2 + normalOffset, (C.z0 + C.z1) / 2],
      rotX: angle,
      mat: material,
      cast: false,
    });
  };
  add(slopedSlab({
    name: 'cabin-dungeon-corridor-floor',
    y0: C.floorY0,
    y1: C.floorY1,
    thickness: 0.16,
    material: materials.floor,
  }), 'cabin-dungeon-shell');
  add(slopedSlab({
    name: 'cabin-dungeon-corridor-ceiling',
    y0: C.ceilingY0,
    y1: C.ceilingY1,
    thickness: 0.15,
    material: materials.concreteDark,
    underside: true,
  }), 'cabin-dungeon-shell', { occludes: true });
  for (let index = 0; index < 10; index += 1) {
    const tRamp = (index + 0.65) / 10.6;
    const z = THREE.MathUtils.lerp(C.z0, C.z1, tRamp);
    add(box({
      name: `cabin-dungeon-corridor-traction-rib-${index + 1}`,
      size: [C.x1 - C.x0 - 0.54, 0.025, 0.075],
      pos: [(C.x0 + C.x1) / 2, cabinDungeonFloorAt((C.x0 + C.x1) / 2, z) + 0.016, z],
      mat: materials.blackSteel,
      cast: false,
    }), 'cabin-dungeon-corridor-detail');
  }
  add(boxFrom(D.x0, D.floorY - 0.18, D.z0, D.x1, D.floorY, D.z1, materials.floor, {
    name: 'cabin-dungeon-floor', cast: false,
  }), 'cabin-dungeon-shell');
  add(boxFrom(D.x0, D.ceilingY, D.z0, D.x1, D.ceilingY + 0.18, D.z1, materials.concreteDark, {
    name: 'cabin-dungeon-ceiling', cast: false,
  }), 'cabin-dungeon-shell', { occludes: true });

  const t = 0.24;
  const corridorWallSegments = 12;
  for (const [side, x0, x1] of [
    ['west', C.x0, C.x0 + t],
    ['east', C.x1 - t, C.x1],
  ]) {
    for (let index = 0; index < corridorWallSegments; index += 1) {
      const z0 = THREE.MathUtils.lerp(C.z0, C.z1, index / corridorWallSegments);
      const z1 = THREE.MathUtils.lerp(C.z0, C.z1, (index + 1) / corridorWallSegments);
      const floor0 = cabinDungeonFloorAt((x0 + x1) / 2, z0);
      const floor1 = cabinDungeonFloorAt((x0 + x1) / 2, z1);
      const ceiling0 = cabinDungeonCeilingAt((x0 + x1) / 2, z0);
      const ceiling1 = cabinDungeonCeilingAt((x0 + x1) / 2, z1);
      const low = Math.min(floor0, floor1) - 0.03;
      const high = Math.max(ceiling0, ceiling1) + 0.03;
      const name = `cabin-dungeon-corridor-wall-${side}-${index + 1}`;
      add(boxFrom(x0, low, z0, x1, high, z1, materials.concrete, {
        name, cast: false,
      }), 'cabin-dungeon-shell', { occludes: true });
      addCollider([[x0, low, z0], [x1, high, z1]], name);
    }
  }

  const dWallH = D.ceilingY - D.floorY;
  const northOpenX0 = C.x0;
  const northOpenX1 = C.x1;
  for (const spec of [
    ['west', D.x0, D.x0 + t, D.z0, D.z1],
    ['east', D.x1 - t, D.x1, D.z0, D.z1],
    ['south', D.x0, D.x1, D.z1 - t, D.z1],
    ['north-west', D.x0, northOpenX0, D.z0, D.z0 + t],
    ['north-east', northOpenX1, D.x1, D.z0, D.z0 + t],
  ]) {
    const [name, x0, x1, z0, z1] = spec;
    add(boxFrom(x0, D.floorY, z0, x1, D.ceilingY, z1, materials.concrete, {
      name: `cabin-dungeon-wall-${name}`, cast: false,
    }), 'cabin-dungeon-shell', { occludes: true });
    addCollider([[x0, D.floorY, z0], [x1, D.ceilingY, z1]], `cabin-dungeon-wall-${name}`);
  }

  // Regular formwork seams and a damp lower course break up the long shell.
  for (let z = D.z0 + 1.1, index = 0; z < D.z1 - 0.5; z += 1.12, index += 1) {
    for (const [name, x] of [['west', D.x0 + t + 0.012], ['east', D.x1 - t - 0.012]]) {
      add(box({
        name: `cabin-dungeon-formwork-${name}-${index}`,
        size: [0.016, dWallH - 0.28, 0.030],
        pos: [x, D.floorY + dWallH / 2, z],
        mat: materials.mortar,
        cast: false,
      }), 'cabin-dungeon-surface');
    }
  }
  for (const [name, size, pos] of [
    ['west', [0.020, 0.38, D.z1 - D.z0 - 0.60], [D.x0 + t + 0.016, D.floorY + 0.20, (D.z0 + D.z1) / 2]],
    ['east', [0.020, 0.38, D.z1 - D.z0 - 0.60], [D.x1 - t - 0.016, D.floorY + 0.20, (D.z0 + D.z1) / 2]],
    ['south', [D.x1 - D.x0 - 0.60, 0.38, 0.020], [(D.x0 + D.x1) / 2, D.floorY + 0.20, D.z1 - t - 0.016]],
  ]) add(box({ name: `cabin-dungeon-damp-course-${name}`, size, pos, mat: materials.wet, cast: false }), 'cabin-dungeon-surface');

  // Concealed masonry leaf. It is indistinguishable from the cellar wall
  // when shut, has no handle, and slides into the west pocket after use.
  const doorRoot = group('cabin-dungeon-secret-door');
  markAssembly(doorRoot, 'cabin-dungeon-door', { structural: true });
  doorRoot.position.set((doorSpec.x0 + doorSpec.x1) / 2, 0, doorSpec.z - doorSpec.thickness / 2);
  const doorWidth = doorSpec.x1 - doorSpec.x0;
  const doorHeight = doorSpec.topY - doorSpec.floorY;
  const doorLeaf = box({
    name: 'cabin-dungeon-secret-door-leaf',
    size: [doorWidth, doorHeight, doorSpec.thickness],
    pos: [0, doorSpec.floorY + doorHeight / 2, 0],
    mat: M.stone ?? materials.concrete,
    cast: false,
  });
  markAssembly(doorLeaf, 'cabin-dungeon-door', { structural: true });
  doorRoot.add(doorLeaf);
  occluders.push(doorLeaf);
  for (let y = doorSpec.floorY + 0.39, index = 0; y < doorSpec.topY - 0.12; y += 0.40, index += 1) {
    const seam = box({
      name: `cabin-dungeon-secret-door-mortar-${index}`,
      size: [doorWidth - 0.12, 0.024, 0.018],
      pos: [0, y, -doorSpec.thickness / 2 - 0.010],
      mat: materials.mortar,
      cast: false,
    });
    markAssembly(seam, 'cabin-dungeon-door', { structural: true });
    doorRoot.add(seam);
  }
  dungeonRoot.add(doorRoot);

  const doorTarget = invisibleTarget('cabin-dungeon-secret-door-target', [doorWidth - 0.10, 1.76, 0.20], [
    (doorSpec.x0 + doorSpec.x1) / 2,
    doorSpec.floorY + 1.05,
    doorSpec.z - 0.30,
  ]);
  add(doorTarget, 'cabin-dungeon-interaction');
  let doorCollider = addCollider([
    [doorSpec.x0, doorSpec.floorY, doorSpec.z - doorSpec.thickness],
    [doorSpec.x1, doorSpec.topY, doorSpec.z + 0.05],
  ], 'cabin-dungeon-secret-door-live', 'door');

  const doorState = {
    desiredOpen: false,
    t: 0,
    colliderLive: true,
  };

  const canOpenDoor = () => ctx.canOpenDungeonDoor?.() === true;
  const notify = (kind, id, action = 'use', detail = {}) => {
    const event = Object.freeze({ kind, id, action, ...detail });
    ctx.onDungeonInteract?.(event);
    if (kind === 'door') ctx.onDungeonDoor?.(action, event);
    if (kind === 'gratin') ctx.onDungeonGratin?.(action, event);
    if (kind === 'captive') ctx.onDungeonCaptive?.(id, action, event);
    if (kind === 'tool') ctx.onDungeonTool?.(id, action, event);
    return event;
  };

  const removeDoorCollider = () => {
    if (!doorState.colliderLive || !doorCollider) return false;
    const index = colliders.indexOf(doorCollider);
    if (index >= 0) colliders.splice(index, 1);
    doorState.colliderLive = false;
    return true;
  };
  const restoreDoorCollider = () => {
    if (doorState.colliderLive) return false;
    if (!colliders.includes(doorCollider)) colliders.push(doorCollider);
    doorState.colliderLive = true;
    return true;
  };

  utilityTargets.dungeonDoor = doorTarget;
  interaction.register(doorTarget, {
    label: () => canOpenDoor()
      ? 'Press the loose stone to open the <b>second concealed door</b>'
      : 'A seamless run of old <b>cellar masonry</b>',
    enabled: () => canOpenDoor() && doorState.t < 0.96,
    onLook: () => notify('door', 'dungeonDoor', 'look', { allowed: canOpenDoor() }),
    onUse: () => {
      const allowed = canOpenDoor();
      notify('door', 'dungeonDoor', 'open', { allowed, firstOpen: !doorState.desiredOpen });
      if (allowed) doorState.desiredOpen = true;
      return allowed;
    },
  });

  // Drainage gulley and grating: continuous enough to lead the eye, shallow
  // enough that the full central route remains walkable.
  add(box({
    name: 'cabin-dungeon-drainage-gulley',
    size: [0.48, 0.026, D.z1 - D.z0 - 1.10],
    pos: [-1.08, D.floorY + 0.010, (D.z0 + D.z1) / 2],
    mat: materials.wet,
    cast: false,
  }), 'cabin-dungeon-drain');
  for (let z = D.z0 + 0.75, index = 0; z < D.z1 - 0.50; z += 0.34, index += 1) {
    add(box({
      name: `cabin-dungeon-drain-grate-${index}`,
      size: [0.58, 0.030, 0.045],
      pos: [-1.08, D.floorY + 0.030, z],
      mat: materials.blackSteel,
      cast: false,
    }), 'cabin-dungeon-drain');
  }
  add(cylinder({
    name: 'cabin-dungeon-floor-drain', r: 0.27, h: 0.025,
    pos: [-4.45, D.floorY + 0.020, 16.78], mat: materials.blackSteel, cast: false,
  }), 'cabin-dungeon-drain');

  // Surface services: two water pipes, electrical conduit and junction boxes.
  for (const [index, z] of [11.1, 11.42].entries()) {
    add(cylinder({
      name: `cabin-dungeon-water-main-${index + 1}`,
      r: index ? 0.055 : 0.072,
      h: D.x1 - D.x0 - 1.0,
      pos: [(D.x0 + D.x1) / 2, D.ceilingY - 0.42 - index * 0.13, z],
      rotZ: Math.PI / 2,
      mat: index ? materials.rust : materials.steel,
      cast: false,
    }), 'cabin-dungeon-services');
  }
  for (const [index, x] of [-7.70, 7.82].entries()) {
    add(cylinder({
      name: `cabin-dungeon-wall-conduit-${index + 1}`,
      r: 0.030,
      h: 8.8,
      pos: [x, D.floorY + 2.22, 14.50],
      rotX: Math.PI / 2,
      mat: materials.steel,
      cast: false,
    }), 'cabin-dungeon-services');
    add(box({
      name: `cabin-dungeon-junction-box-${index + 1}`,
      size: [0.10, 0.46, 0.56],
      pos: [x, D.floorY + 1.62, 12.30],
      mat: materials.blackSteel,
    }), 'cabin-dungeon-services');
  }

  // Ceiling beam, chain and hooks over the hanging captive.
  add(box({
    name: 'cabin-dungeon-overhead-beam',
    size: [7.50, 0.24, 0.28],
    pos: [-2.20, D.ceilingY - 0.20, 14.78],
    mat: materials.blackSteel,
  }), 'cabin-dungeon-overhead-rig');
  const chainLinks = [];
  for (let index = 0; index < 5; index += 1) {
    const link = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.018, 7, 14),
      materials.steel,
    );
    link.name = `cabin-dungeon-chain-link-${index + 1}`;
    link.position.set(-3.18, D.ceilingY - 0.30 - index * 0.11, 14.78);
    link.rotation.y = index % 2 ? Math.PI / 2 : 0;
    add(link, 'cabin-dungeon-overhead-rig');
    chainLinks.push(link);
  }
  for (const [index, x] of [-3.35, -3.01].entries()) {
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 18, Math.PI * 1.5), materials.rust);
    hook.name = `cabin-dungeon-ankle-hook-${index + 1}`;
    hook.position.set(x, D.ceilingY - 0.78, 14.78);
    hook.rotation.z = Math.PI / 2;
    add(hook, 'cabin-dungeon-overhead-rig');
  }

  // The rack: broad timber rails, a toothed wheel, wrist/ankle stocks and
  // leather restraints. Its west side stays clear for the player and Gratin.
  const rack = group('cabin-dungeon-rack');
  markAssembly(rack, 'cabin-dungeon-rack', { structural: true });
  const rackAt = Object.freeze({ x: 3.65, y: D.floorY, z: 14.30 });
  rack.add(box({ name: 'cabin-dungeon-rack-bed', size: [1.72, 0.20, 3.34], pos: [rackAt.x, D.floorY + 0.92, rackAt.z], mat: materials.oldWood }));
  for (const x of [rackAt.x - 0.76, rackAt.x + 0.76]) {
    rack.add(box({ name: `cabin-dungeon-rack-rail-${x < rackAt.x ? 'west' : 'east'}`, size: [0.18, 0.26, 3.82], pos: [x, D.floorY + 0.94, rackAt.z], mat: materials.wood }));
  }
  for (const z of [rackAt.z - 1.75, rackAt.z + 1.75]) {
    rack.add(box({ name: `cabin-dungeon-rack-cross-${z < rackAt.z ? 'north' : 'south'}`, size: [2.00, 0.26, 0.20], pos: [rackAt.x, D.floorY + 0.94, z], mat: materials.wood }));
  }
  for (const [x, z] of [[rackAt.x - 0.74, rackAt.z - 1.60], [rackAt.x + 0.74, rackAt.z - 1.60], [rackAt.x - 0.74, rackAt.z + 1.60], [rackAt.x + 0.74, rackAt.z + 1.60]]) {
    rack.add(box({ name: `cabin-dungeon-rack-leg-${x}-${z}`, size: [0.16, 0.92, 0.16], pos: [x, D.floorY + 0.46, z], mat: materials.oldWood }));
  }
  const rackWheel = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.045, 8, 22), materials.rust);
  rackWheel.name = 'cabin-dungeon-rack-wheel';
  rackWheel.position.set(rackAt.x + 1.02, D.floorY + 0.96, rackAt.z + 1.38);
  rackWheel.rotation.y = Math.PI / 2;
  rack.add(rackWheel);
  for (let index = 0; index < 8; index += 1) {
    const a = index * Math.PI / 4;
    rack.add(box({
      name: `cabin-dungeon-rack-wheel-spoke-${index + 1}`,
      size: [0.06, 0.06, 0.72],
      pos: [rackAt.x + 1.02, D.floorY + 0.96 + Math.sin(a) * 0.02, rackAt.z + 1.38],
      mat: materials.rust,
      rotX: a,
    }));
  }
  for (const [name, z, width] of [['chest', rackAt.z - 0.30, 1.54], ['waist', rackAt.z + 0.50, 1.48], ['ankles', rackAt.z + 1.48, 0.78]]) {
    rack.add(box({
      name: `cabin-dungeon-rack-strap-${name}`,
      size: [width, 0.045, 0.17],
      pos: [rackAt.x, D.floorY + 1.08, z],
      mat: materials.rubber,
    }));
  }
  dungeonRoot.add(rack);
  addCollider([[rackAt.x - 1.02, D.floorY, rackAt.z - 2.00], [rackAt.x + 1.15, D.floorY + 1.18, rackAt.z + 2.00]], 'cabin-dungeon-rack', 'prop');

  // Worktable and every tool named in the scene direction.
  const worktable = group('cabin-dungeon-worktable');
  markAssembly(worktable, 'cabin-dungeon-worktable', { structural: true });
  const workAt = Object.freeze({ x: -5.50, z: 10.55, topY: D.floorY + 0.92 });
  worktable.add(box({ name: 'cabin-dungeon-worktable-top', size: [3.18, 0.16, 1.18], pos: [workAt.x, workAt.topY, workAt.z], mat: materials.steel }));
  for (const [x, z] of [[-6.84, 10.12], [-4.16, 10.12], [-6.84, 10.98], [-4.16, 10.98]]) {
    worktable.add(box({ name: `cabin-dungeon-worktable-leg-${x}-${z}`, size: [0.14, 0.90, 0.14], pos: [x, D.floorY + 0.45, z], mat: materials.blackSteel }));
  }
  const toolY = workAt.topY + 0.12;
  const tools = {};
  const toolAssemblies = {};
  const toolPart = (id, mesh) => {
    mesh.userData.dungeonToolId = id;
    markAssembly(mesh, 'cabin-dungeon-tools', { structural: true });
    worktable.add(mesh);
    tools[id] ??= mesh;
    toolAssemblies[id] ??= [];
    toolAssemblies[id].push(mesh);
    return mesh;
  };
  toolPart('pliers', box({ name: 'cabin-dungeon-pliers', size: [0.10, 0.055, 0.48], pos: [-6.42, toolY, 10.24], mat: materials.steel, rotY: -0.34 }));
  toolPart('saw', box({ name: 'cabin-dungeon-medical-saw', size: [0.44, 0.060, 0.18], pos: [-5.90, toolY, 10.28], mat: materials.steel, rotY: 0.18 }));
  toolPart('saw', box({ name: 'cabin-dungeon-medical-saw-handle', size: [0.20, 0.095, 0.22], pos: [-6.20, toolY + 0.02, 10.20], mat: materials.oldWood, rotY: 0.18 }));
  toolPart('battery', box({ name: 'cabin-dungeon-car-battery', size: [0.54, 0.34, 0.38], pos: [-4.48, workAt.topY + 0.24, 10.55], mat: materials.blackSteel }));
  for (const [id, x, material] of [['positive', -4.62, materials.redRubber], ['negative', -4.34, materials.rubber]]) {
    toolPart('battery', cylinder({ name: `cabin-dungeon-battery-${id}-post`, r: 0.045, h: 0.10, pos: [x, workAt.topY + 0.46, 10.55], mat: material }));
  }
  for (const [index, x] of [-5.42, -5.14, -4.88].entries()) {
    toolPart('syringes', cylinder({
      name: `cabin-dungeon-syringe-${index + 1}`,
      r: 0.025,
      h: 0.42,
      pos: [x, toolY + 0.025, 10.28 + index * 0.06],
      rotZ: Math.PI / 2,
      mat: index === 1 ? materials.acid : materials.steel,
      cast: false,
    }));
  }
  for (const [index, z] of [10.48, 10.73, 10.90].entries()) {
    toolPart('towels', box({
      name: `cabin-dungeon-folded-towel-${index + 1}`,
      size: [0.70 - index * 0.05, 0.07, 0.20],
      pos: [-5.80, workAt.topY + 0.12 + index * 0.075, z],
      mat: materials.towel,
      cast: false,
    }));
  }
  const leadMaterial = [materials.redRubber, materials.rubber];
  for (const [index, x] of [-6.75, -6.35].entries()) {
    const lead = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.018, 7, 22, Math.PI * 1.6), leadMaterial[index]);
    lead.name = `cabin-dungeon-electrical-lead-${index + 1}`;
    lead.position.set(x, workAt.topY + 0.20, 10.78);
    lead.rotation.x = Math.PI / 2;
    toolPart('leads', lead);
  }
  dungeonRoot.add(worktable);
  addCollider([[-7.12, D.floorY, 9.92], [-3.88, D.floorY + 1.34, 11.18]], 'cabin-dungeon-worktable', 'prop');

  // Bucket and gas can sit below the table, reachable but outside the aisle.
  const bucket = cylinder({ name: 'cabin-dungeon-bucket', r: 0.29, h: 0.52, pos: [-6.32, D.floorY + 0.26, 11.45], mat: materials.steel });
  add(bucket, 'cabin-dungeon-tools');
  tools.bucket = bucket;
  toolAssemblies.bucket = [bucket];
  const gasCan = group('cabin-dungeon-gas-can');
  gasCan.add(box({ name: 'cabin-dungeon-gas-can-body', size: [0.46, 0.62, 0.28], pos: [-5.55, D.floorY + 0.31, 11.50], mat: materials.redRubber }));
  gasCan.add(box({ name: 'cabin-dungeon-gas-can-handle', size: [0.26, 0.12, 0.12], pos: [-5.55, D.floorY + 0.68, 11.50], mat: materials.rubber }));
  add(gasCan, 'cabin-dungeon-tools');
  tools.gasCan = gasCan;

  // Two holding cells at the back. Each fence is continuous from slab to
  // ceiling except for one authored central door. The doors only open inward
  // and never relatch during the page instance: they have honest closed
  // collision, but cannot close behind Tony and strand him inside a cell.
  const cellSpecs = [
    { id: 'west', x0: D.x0 + t, x1: -1.45, gateX: -4.55 },
    { id: 'east', x0: 1.62, x1: D.x1 - t, gateX: 4.70 },
  ];
  const cellDoorRecords = [];
  const cellDoors = {};
  const cellDoorTargets = {};
  for (const cell of cellSpecs) {
    const frontZ = 17.72;
    const openingX0 = cell.gateX - 0.62;
    const openingX1 = cell.gateX + 0.62;
    const cellHeight = D.ceilingY - D.floorY;
    for (let x = cell.x0 + 0.24, index = 0; x <= cell.x1 - 0.20; x += 0.36, index += 1) {
      if (Math.abs(x - cell.gateX) < 0.62) continue;
      add(cylinder({
        name: `cabin-dungeon-cell-${cell.id}-bar-${index}`,
        r: 0.026,
        h: cellHeight,
        pos: [x, (D.floorY + D.ceilingY) / 2, frontZ],
        mat: materials.blackSteel,
      }), 'cabin-dungeon-cells');
    }
    for (const [side, x] of [['west', cell.x0], ['east', cell.x1]]) {
      add(box({
        name: `cabin-dungeon-cell-${cell.id}-front-jamb-${side}`,
        size: [0.075, cellHeight, 0.075],
        pos: [x, (D.floorY + D.ceilingY) / 2, frontZ],
        mat: materials.blackSteel,
      }), 'cabin-dungeon-cells');
    }
    for (const [railIndex, y] of [D.floorY + 0.18, D.ceilingY - 0.18].entries()) {
      for (const [side, x0, x1] of [
        ['west', cell.x0, openingX0],
        ['east', openingX1, cell.x1],
      ]) {
        add(box({
          name: `cabin-dungeon-cell-${cell.id}-rail-${railIndex + 1}-${side}`,
          size: [x1 - x0, 0.075, 0.075],
          pos: [(x0 + x1) / 2, y, frontZ],
          mat: materials.blackSteel,
        }), 'cabin-dungeon-cells');
      }
    }
    const innerX = cell.id === 'west' ? cell.x1 : cell.x0;
    const backZ = D.z1 - t;
    for (let z = frontZ, index = 0; z <= backZ; z += 0.36, index += 1) {
      add(cylinder({
        name: `cabin-dungeon-cell-${cell.id}-inner-side-bar-${index + 1}`,
        r: 0.026,
        h: cellHeight,
        pos: [innerX, (D.floorY + D.ceilingY) / 2, z],
        mat: materials.blackSteel,
      }), 'cabin-dungeon-cells');
    }
    for (const [railIndex, y] of [D.floorY + 0.18, D.ceilingY - 0.18].entries()) {
      add(box({
        name: `cabin-dungeon-cell-${cell.id}-inner-side-rail-${railIndex + 1}`,
        size: [0.075, 0.075, backZ - frontZ],
        pos: [innerX, y, (frontZ + backZ) / 2],
        mat: materials.blackSteel,
      }), 'cabin-dungeon-cells');
    }
    const sideCollider = addCollider([
      [innerX - 0.08, D.floorY, frontZ],
      [innerX + 0.08, D.ceilingY, backZ],
    ], `cabin-dungeon-cell-${cell.id}-inner-side`, 'prop');
    add(box({
      name: `cabin-dungeon-cell-${cell.id}-bench`,
      size: [2.55, 0.16, 0.72],
      pos: [(cell.x0 + cell.x1) / 2, D.floorY + 0.46, D.z1 - 0.84],
      mat: materials.oldWood,
    }), 'cabin-dungeon-cells');
    addCollider([[cell.x0, D.floorY, frontZ - 0.08], [openingX0, D.ceilingY, frontZ + 0.08]], `cabin-dungeon-cell-${cell.id}-front-a`, 'prop');
    addCollider([[openingX1, D.floorY, frontZ - 0.08], [cell.x1, D.ceilingY, frontZ + 0.08]], `cabin-dungeon-cell-${cell.id}-front-b`, 'prop');
    addCollider([[cell.x0 + 1.80, D.floorY, D.z1 - 1.24], [cell.x1 - 1.80, D.floorY + 0.54, D.z1 - 0.45]], `cabin-dungeon-cell-${cell.id}-bench`, 'prop');
    for (const [index, offset] of [-0.52, 0.18, 0.58].entries()) {
      add(box({
        name: `cabin-dungeon-cell-${cell.id}-blanket-${index + 1}`,
        size: [0.52 - index * 0.04, 0.06, 0.44],
        pos: [(cell.x0 + cell.x1) / 2 + offset, D.floorY + 0.575 + index * 0.058, D.z1 - 0.84],
        mat: index === 1 ? materials.tarp : materials.canvas,
        cast: false,
      }), 'cabin-dungeon-cells');
    }
    add(cylinder({
      name: `cabin-dungeon-cell-${cell.id}-water-cup`, r: 0.09, h: 0.16,
      pos: [cell.gateX + (cell.id === 'west' ? -0.95 : 0.95), D.floorY + 0.08, D.z1 - 1.18],
      mat: materials.steel, cast: false,
    }), 'cabin-dungeon-cells');

    const doorRoot = group(`cabin-dungeon-cell-${cell.id}-door`);
    markAssembly(doorRoot, 'cabin-dungeon-cells', { structural: true });
    const pivot = group(`cabin-dungeon-cell-${cell.id}-door-hinge`);
    pivot.position.set(openingX0 + 0.05, 0, frontZ);
    markAssembly(pivot, 'cabin-dungeon-cells', { structural: true });
    const leaf = group(`cabin-dungeon-cell-${cell.id}-door-leaf`);
    markAssembly(leaf, 'cabin-dungeon-cells', { structural: true });
    const leafWidth = openingX1 - openingX0 - 0.10;
    for (const x of [0.035, leafWidth - 0.035]) {
      leaf.add(box({
        name: `cabin-dungeon-cell-${cell.id}-door-stile-${x < leafWidth / 2 ? 'hinge' : 'latch'}`,
        size: [0.07, cellHeight, 0.075],
        pos: [x, (D.floorY + D.ceilingY) / 2, 0],
        mat: materials.blackSteel,
      }));
    }
    for (let x = 0.18, index = 0; x < leafWidth - 0.12; x += 0.22, index += 1) {
      leaf.add(cylinder({
        name: `cabin-dungeon-cell-${cell.id}-door-bar-${index + 1}`,
        r: 0.024,
        h: cellHeight,
        pos: [x, (D.floorY + D.ceilingY) / 2, 0],
        mat: materials.blackSteel,
      }));
    }
    for (const [rail, y] of [['bottom', D.floorY + 0.18], ['middle', D.floorY + 1.12], ['top', D.ceilingY - 0.18]]) {
      leaf.add(box({
        name: `cabin-dungeon-cell-${cell.id}-door-rail-${rail}`,
        size: [leafWidth, 0.075, 0.075],
        pos: [leafWidth / 2, y, 0],
        mat: materials.blackSteel,
      }));
    }
    const hinges = [];
    for (const [index, y] of [D.floorY + 0.42, D.floorY + 1.60, D.ceilingY - 0.42].entries()) {
      const hinge = cylinder({
        name: `cabin-dungeon-cell-${cell.id}-door-hinge-barrel-${index + 1}`,
        r: 0.055,
        h: 0.24,
        pos: [0, y, 0],
        mat: materials.rust,
      });
      hinges.push(hinge);
      leaf.add(hinge);
    }
    const latch = box({
      name: `cabin-dungeon-cell-${cell.id}-door-latch`,
      size: [0.28, 0.11, 0.12],
      pos: [leafWidth - 0.12, D.floorY + 1.13, -0.06],
      mat: materials.rust,
    });
    leaf.add(latch);
    add(box({
      name: `cabin-dungeon-cell-${cell.id}-door-latch-receiver`,
      size: [0.10, 0.22, 0.14],
      pos: [openingX1 + 0.015, D.floorY + 1.13, frontZ],
      mat: materials.rust,
    }), 'cabin-dungeon-cells');
    pivot.add(leaf);
    doorRoot.add(pivot);
    dungeonRoot.add(doorRoot);

    const target = invisibleTarget(`cabin-dungeon-cell-${cell.id}-door-target`, [leafWidth - 0.10, 1.72, 0.16], [
      cell.gateX,
      D.floorY + 1.10,
      frontZ - 0.18,
    ]);
    target.userData.cabinCellDoorId = cell.id;
    add(target, 'cabin-dungeon-interaction');
    utilityTargets[`dungeonCellDoor${cell.id[0].toUpperCase()}${cell.id.slice(1)}`] = target;
    cellDoorTargets[cell.id] = target;

    const doorCollider = addCollider([
      [openingX0, D.floorY, frontZ - 0.09],
      [openingX1, D.ceilingY, frontZ + 0.09],
    ], `cabin-dungeon-cell-${cell.id}-door-live`, 'door');
    const doorState = { desiredOpen: false, t: 0, colliderLive: true };
    const removeCollider = () => {
      if (!doorState.colliderLive) return false;
      const index = colliders.indexOf(doorCollider);
      if (index >= 0) colliders.splice(index, 1);
      doorState.colliderLive = false;
      return true;
    };
    const open = () => {
      if (doorState.desiredOpen) return false;
      doorState.desiredOpen = true;
      notify('cellDoor', cell.id, 'open', { oneWay: true });
      return true;
    };
    interaction.register(target, {
      label: () => doorState.desiredOpen
        ? `The <b>${cell.id} cell door</b> stands open`
        : `Lift the latch on the <b>${cell.id} cell door</b>`,
      enabled: () => !doorState.desiredOpen,
      onUse: open,
    });

    const record = { id: cell.id, pivot, leaf, state: doorState, collider: doorCollider, removeCollider };
    cellDoorRecords.push(record);
    cellDoors[cell.id] = Object.freeze({
      id: cell.id,
      root: doorRoot,
      pivot,
      leaf,
      target,
      hinges: Object.freeze(hinges),
      latch,
      opening: Object.freeze({ x0: openingX0, x1: openingX1, z: frontZ }),
      sideCollider,
      get collider() { return doorCollider; },
      get colliderLive() { return doorState.colliderLive; },
      get t() { return doorState.t; },
      get open() { return doorState.desiredOpen; },
      openDoor: open,
    });
  }

  // Blood is restrained but unmistakable: old cleaning arcs, a rack stain
  // and the hanging man's smaller drip field.
  for (const [index, spec] of [
    [-3.18, 14.78, 0.70, 0.46, -0.10],
    [-3.62, 15.22, 0.38, 0.26, 0.22],
    [3.52, 14.10, 0.78, 0.30, -0.32],
    [2.98, 13.45, 0.34, 0.18, 0.18],
    [-0.12, 16.72, 0.50, 0.20, 0.50],
  ].entries()) {
    const stain = new THREE.Mesh(new THREE.CircleGeometry(spec[2], 20), index < 2 ? materials.bloodFresh : materials.blood);
    stain.name = `cabin-dungeon-blood-stain-${index + 1}`;
    stain.position.set(spec[0], D.floorY + 0.014, spec[1]);
    stain.rotation.x = -Math.PI / 2;
    stain.scale.y = spec[3] / spec[2];
    stain.rotation.z = spec[4];
    add(stain, 'cabin-dungeon-blood');
  }

  // Harsh ceiling tubes, one deliberately failing, plus a weak amber throat.
  // Two short-range caged task lamps keep the cleanup stations legible after
  // the exterior rig falls to night. They stay warm and local so the broad
  // room retains its cold pools, hard shadow and failing-rack-light mood.
  const lights = [];
  const fixtures = [];
  const cleanupFills = [];
  const makeFixture = (name, x, z, failing = false) => {
    const fixture = group(name);
    markAssembly(fixture, 'cabin-dungeon-lighting', { structural: true });
    const y = D.ceilingY - 0.17;
    fixture.add(box({ name: `${name}-housing`, size: [1.42, 0.10, 0.28], pos: [x, y, z], mat: materials.blackSteel }));
    const tube = box({ name: `${name}-tube`, size: [1.12, 0.045, 0.15], pos: [x, y - 0.08, z], mat: materials.paleLight, cast: false });
    fixture.add(tube);
    const light = new THREE.PointLight(0xc9edf0, 0, 10.5, 1.72);
    light.name = `${name}-light`;
    light.position.set(x, y - 0.18, z);
    fixture.add(light);
    dungeonRoot.add(fixture);
    lights.push(light);
    fixtures.push({ fixture, tube, light, failing });
    return fixture;
  };
  makeFixture('cabin-dungeon-light-north', -3.20, 11.55, false);
  makeFixture('cabin-dungeon-light-rack', 3.70, 13.35, true);
  makeFixture('cabin-dungeon-light-cells', 0.20, 18.55, false);
  const makeCleanupLamp = (id, x, z, intensity) => {
    const fixture = group(`cabin-dungeon-cleanup-fixture-${id}`);
    markAssembly(fixture, 'cabin-dungeon-lighting', { structural: true });
    const y = D.ceilingY - 0.46;
    fixture.add(box({
      name: `cabin-dungeon-cleanup-fixture-${id}-housing`,
      size: [0.46, 0.12, 0.36],
      pos: [x, y, z],
      mat: materials.blackSteel,
    }));
    fixture.add(box({
      name: `cabin-dungeon-cleanup-fixture-${id}-bulb`,
      size: [0.22, 0.10, 0.18],
      pos: [x, y - 0.13, z],
      mat: materials.amberLight,
      cast: false,
    }));
    for (const sx of [-0.15, 0.15]) {
      fixture.add(box({
        name: `cabin-dungeon-cleanup-fixture-${id}-cage-${sx < 0 ? 'west' : 'east'}`,
        size: [0.025, 0.28, 0.025],
        pos: [x + sx, y - 0.13, z],
        mat: materials.rust,
      }));
    }
    for (const sz of [-0.11, 0.11]) {
      fixture.add(box({
        name: `cabin-dungeon-cleanup-fixture-${id}-cage-${sz < 0 ? 'north' : 'south'}`,
        size: [0.34, 0.025, 0.025],
        pos: [x, y - 0.13, z + sz],
        mat: materials.rust,
      }));
    }
    const light = new THREE.PointLight(0xffb56b, 0, 7.2, 1.72);
    light.name = `cabin-dungeon-cleanup-light-${id}`;
    light.position.set(x, y - 0.22, z);
    fixture.add(light);
    dungeonRoot.add(fixture);
    lights.push(light);
    cleanupFills.push({ light, intensity });
    return fixture;
  };
  makeCleanupLamp('counterstrike', -3.10, 16.05, 5.2);
  makeCleanupLamp('ateam', 5.85, 14.55, 5.8);
  const corridorLight = new THREE.PointLight(0xffa24f, 0, 6.0, 2);
  corridorLight.name = 'cabin-dungeon-corridor-light';
  corridorLight.position.set(0.92, cabinDungeonCeilingAt(0.92, 6.65) - 0.24, 6.65);
  dungeonRoot.add(corridorLight);
  lights.push(corridorLight);
  add(box({
    name: 'cabin-dungeon-corridor-bulb', size: [0.34, 0.08, 0.18],
    pos: [0.92, cabinDungeonCeilingAt(0.92, 6.65) - 0.10, 6.65], mat: materials.amberLight, cast: false,
  }), 'cabin-dungeon-lighting');

  // A real security camera silhouette with bracket, body and glass lens.
  const cameraRig = group('cabin-dungeon-security-camera');
  markAssembly(cameraRig, 'cabin-dungeon-surveillance', { structural: true });
  cameraRig.position.set(D.x1 - 0.48, D.ceilingY - 0.56, 10.20);
  cameraRig.rotation.y = -2.18;
  cameraRig.add(box({ name: 'cabin-dungeon-camera-bracket', size: [0.10, 0.38, 0.10], pos: [0, 0.14, 0], mat: materials.blackSteel }));
  cameraRig.add(box({ name: 'cabin-dungeon-camera-body', size: [0.36, 0.24, 0.64], pos: [0, -0.10, 0.24], mat: materials.steel, rotX: 0.18 }));
  cameraRig.add(cylinder({ name: 'cabin-dungeon-camera-lens', r: 0.085, h: 0.08, pos: [0, -0.16, 0.59], rotX: Math.PI / 2, mat: materials.wet }));
  dungeonRoot.add(cameraRig);

  // main.js mounts the real shared Armory runtime at these coordinates. Keep
  // this module to specs and an anchor: even decorative placeholder boards
  // would overlap the runtime's own backboards, guns, crates and collision.
  const armoryMounts = Object.freeze([
    Object.freeze({ id: WEAPON_IDS.AK47, x: C.x0 + t + 0.13, y: cabinDungeonFloorAt(0.92, 5.68), z: 5.68, rotY: Math.PI / 2 }),
    // Leave enough longitudinal separation for a 0.30 m Player capsule to
    // cross between the opposed rack footprints instead of sealing the ramp.
    Object.freeze({ id: WEAPON_IDS.BARRETT, x: C.x1 - t - 0.13, y: cabinDungeonFloorAt(0.92, 7.72), z: 7.72, rotY: -Math.PI / 2 }),
  ]);
  const armoryAnchor = actorAnchor(dungeonRoot, 'cabin-dungeon-armory-anchor', [
    0.92,
    cabinDungeonFloorAt(0.92, 6.64),
    6.64,
  ]);

  // Canonical Gratin, but a new Cabin-owned instance. No Mansion cast handle
  // or mission state is shared.
  const gratinIdentity = getCharacter(CHARACTER_IDS.GRATIN);
  const gratinMember = FAMILY.find(({ id }) => id === CHARACTER_IDS.GRATIN);
  if (!gratinIdentity || !gratinMember) throw new Error('Cabin dungeon requires canonical Gratin records');
  const gratinAt = Object.freeze({ x: 0.42, y: D.floorY, z: 12.92 });
  const gratin = new Npc(dungeonRoot, {
    name: gratinIdentity.canonicalName,
    actorId: 'cabin.dungeon.gratin',
    tier: 'hero',
    job: 'stand',
    look: true,
    x: gratinAt.x,
    y: gratinAt.y,
    z: gratinAt.z,
    yaw: yawToward(gratinAt, rackAt),
    model: { ...gratinMember.model, role: gratinIdentity.role, face: 'assets/faces/gratin.png' },
  });
  gratin.characterId = CHARACTER_IDS.GRATIN;
  gratin.group.name = 'cabin-dungeon-gratin';
  gratin.group.userData.cabinDungeonActor = 'gratin';
  gratin.group.userData.npc.characterId = CHARACTER_IDS.GRATIN;
  const gratinTarget = invisibleTarget('cabin-dungeon-gratin-target', [0.82, 1.78, 0.72], [gratinAt.x, D.floorY + 0.90, gratinAt.z]);
  add(gratinTarget, 'cabin-dungeon-interaction');
  utilityTargets.dungeonGratin = gratinTarget;
  interaction.register(gratinTarget, {
    label: 'Talk to <b>Gratin</b>',
    onUse: () => notify('gratin', 'gratin'),
  });

  // Generic A-Team cartel captive. The existing shared pinnie makes his
  // affiliation unambiguous without turning him into any named Palace actor.
  const ateamId = CABIN_CAPTIVE_IDS.ATEAM;
  const ateamOrigin = Object.freeze({ x: rackAt.x, y: D.floorY + 1.12, z: rackAt.z + 1.22 });
  const ateamNpc = new Npc(dungeonRoot, {
    name: 'A-Team captive',
    actorId: 'cabin.dungeon.captive.ateam',
    tier: 'hero',
    job: 'stand',
    look: true,
    x: ateamOrigin.x,
    y: ateamOrigin.y,
    z: ateamOrigin.z,
    yaw: Math.PI,
    model: {
      height: 1.84, build: 1.16, dress: 'tee', shirt: 0x24282b,
      pants: 0x22272d, hair: 'crop', hairColour: 0x16120f, beard: true,
      skin: 0xc99168, role: 'cartel_captive', bandana: false,
    },
  });
  ateamNpc.group.name = 'cabin-dungeon-captive-ateam';
  dressInATeamColours(ateamNpc.parts.body, {
    name: 'cabin.dungeon.ateam.colours',
    extra: { cabinCaptiveId: ateamId, cabinDisposable: true },
  });

  // Generic CS baiter: hoodie palette, cheap headset, no xXx identity.
  const csId = CABIN_CAPTIVE_IDS.COUNTER_STRIKE;
  // Npc's origin is at its planted feet. After the whole rig is inverted that
  // origin becomes the ankle attachment, so it belongs at the hook, not at
  // chest height; otherwise the hanging head passes through the floor.
  const csOrigin = Object.freeze({ x: -3.18, y: D.ceilingY - 0.78, z: 14.78 });
  const csNpc = new Npc(dungeonRoot, {
    name: 'Counter-Strike baiter',
    actorId: 'cabin.dungeon.captive.counter-strike',
    tier: 'hero',
    job: 'stand',
    look: true,
    x: csOrigin.x,
    y: csOrigin.y,
    z: csOrigin.z,
    yaw: 0,
    model: {
      height: 1.78, build: 0.96, dress: 'tee', shirt: 0x26344a,
      pants: 0x22252b, hair: 'messy', hairColour: 0x2b2018,
      skin: 0xe1b18b, role: 'gamer_captive', bandana: false,
    },
  });
  csNpc.group.name = 'cabin-dungeon-captive-counter-strike';
  const headset = group('cabin-dungeon-cs-headset');
  headset.add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 7, 20, Math.PI), materials.blackSteel));
  for (const x of [-0.15, 0.15]) headset.add(box({ size: [0.055, 0.16, 0.10], pos: [x, -0.02, 0], mat: materials.redRubber }));
  headset.position.set(0, 0.03, 0.01);
  headset.rotation.z = Math.PI / 2;
  csNpc.parts.head.add(headset);

  const buildCaptive = ({ id, npc, pose, targetSize, targetPosition, headTargetPosition }) => {
    const cleanupBodyId = CABIN_CAPTIVE_CLEANUP_BODY_IDS[id];
    const state = {
      pain: 0,
      flinch: 0,
      feedback: null,
      feedbackDuration: 0,
      feedbackRemaining: 0,
      feedbackStrength: 0,
      dead: false,
      wrapped: false,
      cause: null,
    };
    const bodyAnchor = actorAnchor(npc.parts.body, `cabin-dungeon-${id}-body-anchor`, [0, 1.20, 0], id);
    const headAnchor = actorAnchor(npc.parts.head, `cabin-dungeon-${id}-head-anchor`, [0, 0.08, 0.05], id);
    tagCaptiveTree(npc.group, id);
    npc.group.userData.cleanupBodyId = cleanupBodyId;

    const bodyTarget = invisibleTarget(`cabin-dungeon-${id}-body-target`, targetSize, targetPosition);
    bodyTarget.userData.cabinCaptiveId = id;
    bodyTarget.userData.cabinCaptiveHitZone = 'body';
    bodyTarget.userData.cabinDisposable = true;
    add(bodyTarget, 'cabin-dungeon-captive-target');
    const headTarget = invisibleTarget(`cabin-dungeon-${id}-head-target`, [0.54, 0.50, 0.54], headTargetPosition);
    headTarget.userData.cabinCaptiveId = id;
    headTarget.userData.cabinCaptiveHitZone = 'head';
    headTarget.userData.cabinDisposable = true;
    add(headTarget, 'cabin-dungeon-captive-target');

    const blood = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), materials.bloodFresh);
    blood.name = `cabin-dungeon-${id}-impact-blood`;
    blood.position.set(targetPosition[0], D.floorY + 0.018, targetPosition[2]);
    blood.rotation.x = -Math.PI / 2;
    blood.visible = false;
    add(blood, 'cabin-dungeon-blood');
    const controller = {
      id,
      cleanupBodyId,
      npc,
      group: npc.group,
      bodyAnchor,
      headAnchor,
      bodyTarget,
      headTarget,
      blood,
      // Wrapped presentation belongs exclusively to buildCabinBodyCleanup's
      // canonical shared prefab. This controller only retires the live actor.
      wrap: null,
      speak(seconds = 2, take = null) {
        if (state.dead || state.wrapped) return false;
        npc.say(Math.max(0.35, Number(seconds) || 2), take);
        return true;
      },
      flinch(amount = 1) {
        return controller.react('impact', { flinch: amount, duration: 0.30 }) !== false;
      },
      react(feedback = 'impact', profile = {}) {
        if (state.dead || state.wrapped) return false;
        const next = CAPTIVE_FEEDBACK_IDS.has(feedback) ? feedback : 'impact';
        const strength = THREE.MathUtils.clamp(Number(profile.flinch) || 0.65, 0.08, 1);
        const duration = Math.max(0.18, Number(profile.duration) || 0.42);
        state.flinch = Math.max(state.flinch, strength);
        state.pain = Math.max(state.pain, state.flinch * 0.65);
        state.feedback = next;
        state.feedbackDuration = duration;
        state.feedbackRemaining = duration;
        state.feedbackStrength = strength;
        blood.visible = true;
        return next;
      },
      setPain(amount = 0) {
        state.pain = THREE.MathUtils.clamp(Number(amount) || 0, 0, 1);
        return state.pain;
      },
      setDead(dead = true, cause = null) {
        state.dead = dead === true;
        state.cause = state.dead ? cause ?? state.cause : null;
        if (state.dead) {
          state.feedback = null;
          state.feedbackRemaining = 0;
        }
        npc.look = !state.dead;
        if (state.dead) npc.hush();
        blood.visible = state.dead || state.flinch > 0.01;
        return state.dead;
      },
      setWrapped(wrapped = true) {
        state.wrapped = wrapped === true;
        if (state.wrapped) {
          state.feedback = null;
          state.feedbackRemaining = 0;
        }
        npc.group.visible = !state.wrapped;
        bodyTarget.visible = !state.wrapped;
        headTarget.visible = !state.wrapped;
        if (state.wrapped) npc.hush();
        return state.wrapped;
      },
      sync(snapshot = {}) {
        if (!snapshot || typeof snapshot !== 'object') return controller.snapshot;
        if (Object.hasOwn(snapshot, 'pain')) controller.setPain(snapshot.pain);
        if (snapshot.flinch) controller.flinch(snapshot.flinch === true ? 1 : snapshot.flinch);
        if (Object.hasOwn(snapshot, 'dead')) controller.setDead(snapshot.dead, snapshot.cause);
        if (Object.hasOwn(snapshot, 'alive')) controller.setDead(snapshot.alive === false, snapshot.cause);
        if (Object.hasOwn(snapshot, 'wrapped')) controller.setWrapped(snapshot.wrapped);
        return controller.snapshot;
      },
      update(dt, playerPosition) {
        const step = finiteStep(dt);
        state.flinch = Math.max(0, state.flinch - step * 3.8);
        state.pain = Math.max(0, state.pain - step * 0.11);
        if (state.feedbackRemaining > 0) {
          state.feedbackRemaining = Math.max(0, state.feedbackRemaining - step);
          if (state.feedbackRemaining <= 0) state.feedback = null;
        }
        npc.update(step, playerPosition);
        // Npc owns mouth and head gaze. The restraint pose is re-applied only
        // to the group/body/limbs after that update, so neither gets erased.
        pose(npc, state, step);
      },
      get snapshot() {
        return Object.freeze({
          id,
          pain: state.pain,
          flinch: state.flinch,
          feedback: state.feedback,
          feedbackRemaining: state.feedbackRemaining,
          dead: state.dead,
          alive: !state.dead,
          wrapped: state.wrapped,
          cause: state.cause,
        });
      },
    };
    return Object.freeze(controller);
  };

  const applyRackPose = (npc, state) => {
    const feedback = captiveFeedbackFrame(state);
    const painTremor = state.dead ? 0 : Math.sin((npc.t ?? 0) * 7.2) * state.pain * 0.018;
    npc.group.rotation.x = -Math.PI / 2;
    npc.group.rotation.z = state.dead
      ? -0.035
      : Math.sin(state.flinch * Math.PI) * 0.025 + painTremor + feedback.groupRoll;
    npc.parts.body.rotation.x = feedback.bodyPitch;
    npc.parts.body.rotation.z = state.dead ? 0.10 : (state.flinch * 0.12 + painTremor + feedback.bodyRoll);
    npc.parts.head.rotation.z += feedback.headRoll;
    npc.parts.armL.rotation.set(-1.48 - state.pain * 0.025 + feedback.armL, 0, -0.20 - state.flinch * 0.10);
    npc.parts.armR.rotation.set(-1.48 - state.pain * 0.025 + feedback.armR, 0, 0.20 + state.flinch * 0.10);
    npc.parts.foreL.rotation.set(-0.08 + feedback.foreL, 0, 0);
    npc.parts.foreR.rotation.set(-0.08 + feedback.foreR, 0, 0);
    npc.parts.legL.rotation.set((state.dead ? -0.04 : 0.04) + feedback.legL, 0, -0.10);
    npc.parts.legR.rotation.set((state.dead ? 0.04 : -0.04) + feedback.legR, 0, 0.10);
    npc.parts.shinL.rotation.x = state.dead ? 0.08 : 0;
    npc.parts.shinR.rotation.x = state.dead ? 0.08 : 0;
  };
  const applyHangingPose = (npc, state, step) => {
    const feedback = captiveFeedbackFrame(state);
    const sway = state.dead ? 0.018 : 0.025 + state.flinch * 0.08;
    npc.group.rotation.x = 0;
    npc.group.rotation.z = Math.PI + Math.sin((npc.t ?? 0) * 1.15) * sway + feedback.groupRoll;
    npc.parts.body.rotation.x = feedback.bodyPitch;
    npc.parts.body.rotation.z = state.dead ? -0.09 : state.flinch * 0.15 + feedback.bodyRoll;
    npc.parts.head.rotation.z += feedback.headRoll;
    npc.parts.armL.rotation.set(-0.14 - state.pain * 0.10 + feedback.armL, 0, -0.18);
    npc.parts.armR.rotation.set(-0.12 - state.pain * 0.08 + feedback.armR, 0, 0.20);
    npc.parts.foreL.rotation.x = -0.38 - state.flinch * 0.30 + feedback.foreL;
    npc.parts.foreR.rotation.x = -0.42 - state.flinch * 0.26 + feedback.foreR;
    npc.parts.legL.rotation.set(feedback.legL, 0, -0.09);
    npc.parts.legR.rotation.set(feedback.legR, 0, 0.09);
    npc.parts.shinL.rotation.x = state.dead ? 0.16 : 0.05;
    npc.parts.shinR.rotation.x = state.dead ? 0.18 : 0.05;
    void step;
  };

  const ateam = buildCaptive({
    id: ateamId,
    npc: ateamNpc,
    pose: applyRackPose,
    targetSize: [1.42, 0.66, 2.36],
    targetPosition: [rackAt.x, D.floorY + 1.28, rackAt.z],
    headTargetPosition: [rackAt.x, D.floorY + 1.30, rackAt.z - 1.02],
  });
  const counterStrike = buildCaptive({
    id: csId,
    npc: csNpc,
    pose: applyHangingPose,
    targetSize: [1.04, 1.82, 0.74],
    targetPosition: [-3.18, D.floorY + 1.22, 14.78],
    headTargetPosition: [-3.18, D.floorY + 0.52, 14.78],
  });

  for (const actor of [ateam, counterStrike]) {
    const key = actor.id === ateamId ? 'dungeonAteamCaptive' : 'dungeonCounterStrikeCaptive';
    utilityTargets[key] = actor.bodyTarget;
    interaction.register(actor.bodyTarget, {
      label: () => actor.snapshot.dead
        ? `Wrap the <b>${actor.id === ateamId ? 'A-Team captive’s body' : 'CS baiter’s body'}</b>`
        : `Question the restrained <b>${actor.id === ateamId ? 'A-Team captive' : 'CS baiter'}</b>`,
      enabled: () => !actor.snapshot.wrapped
        && (!actor.snapshot.dead || ctx.canCleanupWrap?.(actor.cleanupBodyId) === true),
      onUse: () => notify('captive', actor.id, actor.snapshot.dead ? 'wrap' : 'use'),
    });
  }

  const toolTargets = {};
  const toolLabels = Object.freeze({
    pliers: 'Inspect the stained <b>pliers</b>',
    saw: 'Inspect the old <b>medical saw</b>',
    battery: 'Inspect the wired <b>car battery</b>',
    syringes: 'Inspect the row of <b>syringes</b>',
    towels: 'Inspect the folded <b>towels</b>',
    leads: 'Inspect the coiled <b>electrical leads</b>',
    bucket: 'Inspect the dented <b>bucket</b>',
    gasCan: 'Inspect the red <b>gas can</b>',
  });
  for (const [id, target] of Object.entries(tools)) {
    // A torus has a literal hole under the crosshair. Give the visible coil a
    // tight surface around its wire so aiming at its centre cannot select the
    // battery behind it. This remains local to the prop, not a table-wide
    // shortcut.
    const interactionTarget = id === 'leads'
      ? invisibleTarget('cabin-dungeon-electrical-leads-target', [0.36, 0.26, 0.26], [
        -6.75, workAt.topY + 0.20, 10.78,
      ])
      : target;
    if (interactionTarget !== target) add(interactionTarget, 'cabin-dungeon-interaction');
    toolTargets[id] = interactionTarget;
    utilityTargets[`dungeonTool${id[0].toUpperCase()}${id.slice(1)}`] = interactionTarget;
    interaction.register(interactionTarget, {
      label: () => {
        if (!['pliers', 'saw', 'battery', 'syringes', 'towels', 'leads', 'bucket'].includes(id)) {
          return toolLabels[id] ?? `Inspect the <b>${id}</b>`;
        }
        const held = ctx.dungeonToolStatus?.(id) === 'held';
        return held
          ? `Return the <b>${id}</b> to Gratin’s table`
          : `Pick up the <b>${id}</b>`;
      },
      onUse: () => notify('tool', id),
    });
  }
  for (const [id, size, position, label] of [
    ['worktable', [3.18, 0.90, 0.24], [workAt.x, D.floorY + 1.25, workAt.z + 0.72], 'Inspect the <b>interrogation tools</b>'],
    ['rack', [2.20, 1.10, 0.22], [rackAt.x, D.floorY + 1.16, rackAt.z - 2.05], 'Inspect the old <b>stretching rack</b>'],
    ['overheadRig', [2.40, 0.46, 0.22], [-3.18, D.ceilingY - 0.58, 14.42], 'Inspect the <b>beam and chain rig</b>'],
    ['armory', [1.40, 1.60, 0.20], [0.92, cabinDungeonFloorAt(0.92, 6.64) + 1.25, 6.64], 'Inspect the <b>anteroom weapon racks</b>'],
  ]) {
    const target = invisibleTarget(`cabin-dungeon-${id}-target`, size, position);
    add(target, 'cabin-dungeon-interaction');
    toolTargets[id] = target;
    utilityTargets[`dungeon${id[0].toUpperCase()}${id.slice(1)}`] = target;
    interaction.register(target, {
      label,
      // The broad table proxy is only a convenience surface. Without the
      // shared InteractionSystem's soft-target discipline it sits in front
      // of the small physical tools and turns them back into scenery.
      soft: id === 'worktable',
      onUse: () => notify('tool', id),
    });
  }

  const anchors = Object.freeze({
    door: Object.freeze({ x: 0.92, y: doorSpec.floorY, z: 4.18 }),
    anteroom: Object.freeze({ x: 0.92, y: cabinDungeonFloorAt(0.92, 7.22), z: 7.22 }),
    center: Object.freeze({ x: 0.15, y: D.floorY, z: 14.40 }),
    gratin: Object.freeze({ ...gratinAt }),
    ateam: ateam.bodyAnchor,
    ateamBody: ateam.bodyAnchor,
    ateamHead: ateam.headAnchor,
    counterStrike: counterStrike.bodyAnchor,
    counterStrikeBody: counterStrike.bodyAnchor,
    counterStrikeHead: counterStrike.headAnchor,
    armory: armoryAnchor,
    worktable: Object.freeze({ x: workAt.x, y: D.floorY, z: workAt.z }),
  });

  const spawns = Object.freeze({
    entry: Object.freeze({
      id: 'dungeonEntry', floorY: cabinDungeonFloorAt(0.92, 5.42),
      position: new THREE.Vector3(1.08, cabinDungeonFloorAt(1.08, 5.42) + WALK_EYE_HEIGHT, 5.42),
      yaw: Math.PI, pitch: -0.05,
    }),
    room: Object.freeze({
      id: 'dungeon', floorY: D.floorY,
      position: new THREE.Vector3(0.92, D.floorY + WALK_EYE_HEIGHT, 9.82),
      yaw: Math.PI, pitch: -0.08,
    }),
  });

  const makeViewpoint = (id, position, lookAt, floorY = D.floorY) => {
    const p = new THREE.Vector3(...position);
    const q = new THREE.Vector3(...lookAt);
    const horizontal = Math.hypot(q.x - p.x, q.z - p.z);
    return Object.freeze({
      id,
      floorY,
      position: p,
      lookAt: q,
      yaw: Math.atan2(-(q.x - p.x), -(q.z - p.z)),
      pitch: Math.atan2(q.y - p.y, Math.max(0.001, horizontal)),
    });
  };
  const armoryViewFloor = cabinDungeonFloorAt(0.72, 8.54);
  const armoryLookFloor = cabinDungeonFloorAt(0.92, 6.64);
  const viewpointMap = {
    dungeonDoor: makeViewpoint('dungeonDoor', [0.92, doorSpec.floorY + WALK_EYE_HEIGHT, 3.02], [0.92, doorSpec.floorY + 1.08, 4.62], doorSpec.floorY),
    dungeonGratin: makeViewpoint('dungeonGratin', [0.45, D.floorY + WALK_EYE_HEIGHT, 10.82], [gratinAt.x, D.floorY + 1.47, gratinAt.z]),
    dungeonAteamCaptive: makeViewpoint('dungeonAteamCaptive', [1.46, D.floorY + WALK_EYE_HEIGHT, 14.30], [rackAt.x, D.floorY + 1.20, rackAt.z]),
    dungeonCounterStrikeCaptive: makeViewpoint('dungeonCounterStrikeCaptive', [-1.05, D.floorY + WALK_EYE_HEIGHT, 14.78], [-3.18, D.floorY + 1.05, 14.78]),
    dungeonWorktable: makeViewpoint('dungeonWorktable', [-2.92, D.floorY + WALK_EYE_HEIGHT, 10.55], [workAt.x, D.floorY + 1.25, workAt.z + 0.72]),
    dungeonArmory: makeViewpoint('dungeonArmory', [0.72, armoryViewFloor + WALK_EYE_HEIGHT, 8.54], [0.92, armoryLookFloor + 1.26, 6.64], armoryViewFloor),
  };
  for (const [id, door] of Object.entries(cellDoors)) {
    const cameraZ = door.opening.z - 1.72;
    viewpointMap[`dungeonCellDoor${id[0].toUpperCase()}${id.slice(1)}`] = makeViewpoint(
      `dungeonCellDoor${id[0].toUpperCase()}${id.slice(1)}`,
      [(door.opening.x0 + door.opening.x1) / 2, D.floorY + WALK_EYE_HEIGHT, cameraZ],
      [(door.opening.x0 + door.opening.x1) / 2, D.floorY + 1.10, door.opening.z],
    );
  }
  for (const id of Object.keys(toolLabels).filter((toolId) => toolId !== 'gasCan')) {
    const target = toolTargets[id];
    const focus = target.getWorldPosition(new THREE.Vector3());
    viewpointMap[`dungeonTool${id[0].toUpperCase()}${id.slice(1)}`] = makeViewpoint(
      `dungeonTool${id[0].toUpperCase()}${id.slice(1)}`,
      [focus.x, D.floorY + WALK_EYE_HEIGHT, focus.z + 1.68],
      [focus.x, focus.y, focus.z],
    );
  }
  const viewpoints = Object.freeze(viewpointMap);

  const actors = Object.freeze({ gratin, ateam, counterStrike });
  const targets = Object.freeze({
    door: doorTarget,
    gratin: gratinTarget,
    ateam: ateam.bodyTarget,
    counterStrike: counterStrike.bodyTarget,
    cellDoors: Object.freeze({ ...cellDoorTargets }),
    tools: Object.freeze(toolTargets),
  });
  const hitTargets = Object.freeze([
    ateam.bodyTarget, ateam.headTarget,
    counterStrike.bodyTarget, counterStrike.headTarget,
  ]);

  let internalElapsed = 0;
  const sync = (snapshot = {}) => {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const door = snapshot.door && typeof snapshot.door === 'object' ? snapshot.door : snapshot;
    if (Object.hasOwn(door, 'open')) doorState.desiredOpen = door.open === true;
    if (Object.hasOwn(snapshot, 'doorOpen')) doorState.desiredOpen = snapshot.doorOpen === true;
    const captiveState = snapshot.captives ?? snapshot;
    ateam.sync(captiveState.ateam ?? snapshot.ateam ?? {});
    counterStrike.sync(captiveState.counterStrike ?? captiveState.counter_strike ?? snapshot.counterStrike ?? {});
    const gratinState = snapshot.gratin;
    if (gratinState?.speaking) gratin.say(gratinState.seconds ?? 2, gratinState.take ?? null);
    if (gratinState?.face) gratin.faceToward(gratinState.face.x, gratinState.face.z, true);
    return Object.freeze({
      doorOpen: doorState.desiredOpen,
      ateam: ateam.snapshot,
      counterStrike: counterStrike.snapshot,
    });
  };

  const update = (dt = 0, elapsed = undefined, playerPosition = null) => {
    const step = finiteStep(dt, 1 / 60);
    internalElapsed = Number.isFinite(elapsed) ? elapsed : internalElapsed + step;
    const direction = doorState.desiredOpen ? 1 : -1;
    doorState.t = THREE.MathUtils.clamp(doorState.t + direction * step * DOOR_SPEED, 0, 1);
    const easedDoor = smoothUnit(doorState.t);
    doorRoot.position.x = (doorSpec.x0 + doorSpec.x1) / 2 - DOOR_TRAVEL * easedDoor;
    if (doorState.t >= 0.72) removeDoorCollider();
    else if (doorState.t <= 0.08) restoreDoorCollider();
    for (const record of cellDoorRecords) {
      if (record.state.desiredOpen) {
        record.state.t = THREE.MathUtils.clamp(record.state.t + step * CELL_DOOR_SPEED, 0, 1);
      }
      record.pivot.rotation.y = CELL_DOOR_OPEN_ANGLE * smoothUnit(record.state.t);
      if (record.state.t >= 0.72) record.removeCollider();
    }

    const feetY = playerPosition ? playerPosition.y - WALK_EYE_HEIGHT : Infinity;
    const occupied = Boolean(playerPosition)
      && insideCabinDungeon(playerPosition.x, playerPosition.z)
      && feetY < D.levelSplitY;
    const failure = ((internalElapsed * 7.7) % 5.1 < 0.16)
      || ((internalElapsed * 3.1) % 7.4 > 7.18);
    for (const record of fixtures) {
      const active = occupied && (!record.failing || !failure);
      record.light.intensity = active ? (record.failing ? 5.2 : 4.25) : 0;
      record.tube.visible = !record.failing || !failure;
    }
    for (const record of cleanupFills) {
      record.light.intensity = occupied ? record.intensity : 0;
    }
    corridorLight.intensity = occupied ? 1.65 : 0;

    gratin.update(step, playerPosition);
    ateam.update(step, playerPosition);
    counterStrike.update(step, playerPosition);
    return Object.freeze({ occupied, doorT: doorState.t, doorOpen: doorState.desiredOpen, failure });
  };

  const setDoorOpen = (open = true) => {
    doorState.desiredOpen = open === true;
    return doorState.desiredOpen;
  };

  let heldToolId = null;
  const setHeldTool = (id = null) => {
    const next = Object.hasOwn(toolAssemblies, id) ? id : null;
    heldToolId = next;
    for (const [toolId, parts] of Object.entries(toolAssemblies)) {
      for (const part of parts) part.visible = toolId !== heldToolId;
    }
    return heldToolId;
  };

  const dispose = () => {
    for (const target of [
      doorTarget,
      gratinTarget,
      ateam.bodyTarget,
      counterStrike.bodyTarget,
      ...Object.values(cellDoorTargets),
      ...Object.values(toolTargets),
    ]) {
      interaction.unregister?.(target);
    }
    gratin.hush();
    ateam.npc.hush();
    counterStrike.npc.hush();
  };

  return Object.freeze({
    root: dungeonRoot,
    bounds: Object.freeze({ corridor: C, dungeon: D, door: doorSpec }),
    door: Object.freeze({
      root: doorRoot,
      leaf: doorLeaf,
      target: doorTarget,
      get collider() { return doorCollider; },
      get colliderLive() { return doorState.colliderLive; },
      get t() { return doorState.t; },
      get open() { return doorState.desiredOpen; },
      setOpen: setDoorOpen,
    }),
    cells: Object.freeze({ ...cellDoors }),
    actors,
    targets,
    hitTargets,
    anchors,
    spawns,
    viewpoints,
    tools: Object.freeze({ ...tools, rack, worktable, bucket, gasCan, overhead: Object.freeze({ chainLinks }) }),
    get heldToolId() { return heldToolId; },
    setHeldTool,
    armory: Object.freeze({ anchor: armoryAnchor, racks: armoryMounts }),
    cleanup: Object.freeze({ layout: CABIN_DUNGEON_CLEANUP_LAYOUT }),
    cleanupLayout: CABIN_DUNGEON_CLEANUP_LAYOUT,
    lights: Object.freeze(lights),
    sync,
    setDoorOpen,
    update,
    dispose,
  });
}
