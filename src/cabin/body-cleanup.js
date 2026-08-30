/**
 * Cabin dungeon body-cleanup presentation.
 *
 * Exactly two canonical wrapped-body prefabs are built. This module moves
 * those same objects between the dungeon stations, outside skids, the camera,
 * and the existing firepit; it never swaps in a capsule or second bag mesh.
 * Interaction descriptors call outward only. The scene/campaign owns whether
 * an action is allowed and calls the explicit methods after accepting it.
 */
import * as THREE from 'three';

import { buildWrappedBody } from '../core/props/wrapped-body.js';
import { markSpatialPrimitive } from '../core/spatial-contract.js';
import { box, collider, cylinder, group, mat } from '../world/build.js';
import { LANDMARKS, groundAt as cabinGroundAt } from './field.js';

export const CLEANUP_BODY_PHASES = Object.freeze([
  'awaiting-wrap',
  'wrapped',
  'staged',
  'carrying',
  'at-fire',
  'burning',
  'burned',
]);

export const CABIN_CLEANUP_BODIES = Object.freeze([
  Object.freeze({
    id: 'counterstrike-player',
    label: 'Counter-Strike player',
    length: 1.84,
    build: 0.98,
    stain: 0.62,
    seed: 5.4,
  }),
  Object.freeze({
    id: 'a-team-member',
    label: 'A-Team member',
    length: 1.91,
    build: 1.08,
    stain: 0.70,
    seed: 8.2,
  }),
]);

const BODY_IDS = Object.freeze(CABIN_CLEANUP_BODIES.map(({ id }) => id));

const point = (x, y, z, rotationY = 0) => Object.freeze({ x, y, z, rotationY });

export const CABIN_CLEANUP_LAYOUT = Object.freeze({
  // Defaults fit the concealed Cabin lower room. A dungeon builder may pass
  // its own station coordinates without changing the state contract.
  dungeon: Object.freeze({
    'counterstrike-player': point(-2.25, -3.13, 1.65, 0.04),
    'a-team-member': point(2.15, -3.13, 1.58, -0.07),
  }),
  staging: Object.freeze({
    // Keep the optional yard skids west of the fire circle. The former first
    // station occupied the exact footprint of the southwest stump seat.
    'counterstrike-player': point(-19.72, null, 15.10, 1.45),
    'a-team-member': point(-19.72, null, 17.72, 1.68),
  }),
  pyre: Object.freeze({
    'counterstrike-player': point(LANDMARKS.firepit.x - 0.26, null, LANDMARKS.firepit.z, 0.12),
    'a-team-member': point(LANDMARKS.firepit.x + 0.28, null, LANDMARKS.firepit.z + 0.05, -0.10),
  }),
  // North of the seating ring, clear of both the permanent benches and the
  // optional body skids, but still close enough to reach from the fire.
  gasCan: point(LANDMARKS.firepit.x, null, LANDMARKS.firepit.z + 5.30, -0.35),
  firepit: Object.freeze({ x: LANDMARKS.firepit.x, z: LANDMARKS.firepit.z }),
});

export const BODY_CARRY_POSITION = Object.freeze([0, -0.92, -1.72]);
export const BODY_CARRY_YAW = Math.PI / 2;
export const BODY_CARRY_BOB_SPEED = 5.2;
export const BODY_CARRY_BOB_METRES = 0.012;
export const BODY_BURN_DURATION_S = 18;

const PHASES = new Set(CLEANUP_BODY_PHASES);
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/**
 * Translate campaign-owned Cabin cleanup truth into the physical cleanup
 * presentation. `story.bodyAtFire()` is deliberately authoritative here: old
 * saves may carry only the aggregate CABIN_BODIES_STAGED marker, without the
 * two newer per-body markers exposed by hostageState().
 */
export function cabinCleanupRestoreState({ story, storyToCleanupBody } = {}) {
  if (!story?.hostageState || !story?.bodyAtFire || !storyToCleanupBody) {
    throw new TypeError('Cabin cleanup restore requires story truth and body id mapping');
  }
  const ignited = Boolean(story.bonfireIgnited?.());
  const bodies = {};
  for (const [storyId, cleanupId] of Object.entries(storyToCleanupBody)) {
    const hostage = story.hostageState(storyId);
    let phase = 'awaiting-wrap';
    if (story.bodyAtFire(storyId)) phase = ignited ? 'burning' : 'at-fire';
    else if (hostage?.wrapped) phase = 'wrapped';
    bodies[cleanupId] = Object.freeze({ phase });
  }
  return Object.freeze({
    bodies: Object.freeze(bodies),
    gasPoured: Boolean(story.gasPoured?.()),
    ignited,
    burnProgress: story.blackedOut?.() ? 1 : 0,
  });
}

// Shared Npc.sit() is authored against a 0.53 m chair cushion. Adjusting the
// actor base by the difference between that reference and the stump top keeps
// both men seated on the geometry instead of hovering or sinking into it.
const NPC_REFERENCE_SEAT_HEIGHT = 0.53;

function bonfireNpc(actor) {
  return actor?.npc ?? actor ?? null;
}

function captureBonfireNpc(actor) {
  return Object.freeze({
    position: actor.group.position.clone(),
    quaternion: actor.group.quaternion.clone(),
    baseY: actor.baseY,
    homeX: actor.homeX,
    homeZ: actor.homeZ,
    homeYaw: actor.homeYaw,
    targetYaw: actor.targetYaw,
    job: actor.job,
    seated: Boolean(actor.seated),
  });
}

function pointInParent(object, parent, point = null) {
  object.updateWorldMatrix?.(true, false);
  const world = point ?? object.getWorldPosition(new THREE.Vector3());
  parent?.updateWorldMatrix?.(true, false);
  return parent?.worldToLocal ? parent.worldToLocal(world.clone()) : world.clone();
}

function placeBonfireNpc(actor, seat, fireTarget) {
  const parent = actor.group.parent;
  seat.updateWorldMatrix(true, true);
  const seatWorld = seat.getWorldPosition(new THREE.Vector3());
  const bounds = new THREE.Box3().setFromObject(seat);
  const surfaceWorld = new THREE.Vector3(seatWorld.x, bounds.max.y, seatWorld.z);
  const seatAt = pointInParent(seat, parent, seatWorld);
  const surfaceAt = pointInParent(seat, parent, surfaceWorld);
  const fireAt = pointInParent(fireTarget, parent);
  const heightScale = Math.max(0.1, Number(actor.parts?.heightScale) || 1);

  actor.baseY = surfaceAt.y - NPC_REFERENCE_SEAT_HEIGHT * heightScale;
  actor.homeX = seatAt.x;
  actor.homeZ = seatAt.z;
  actor.group.position.set(seatAt.x, actor.baseY, seatAt.z);
  actor.job = 'drink';
  actor.sit?.();
  actor.faceToward?.(fireAt.x, fireAt.z, true);
  actor.homeYaw = actor.group.rotation.y;
}

function restoreBonfireNpc(actor, home) {
  actor.baseY = home.baseY;
  actor.homeX = home.homeX;
  actor.homeZ = home.homeZ;
  actor.homeYaw = home.homeYaw;
  actor.job = home.job;
  if (home.seated) actor.sit?.();
  else actor.stand?.();
  actor.group.position.copy(home.position);
  actor.group.quaternion.copy(home.quaternion);
  actor.targetYaw = home.targetYaw;
}

/**
 * Own the temporary bonfire blocking for Lag and Gratin. The returned staging
 * object is idempotent across restore callbacks and remembers their authored
 * daytime posts so morning can return Lag to work and Gratin to the dungeon.
 */
export function createCabinBonfireCastStaging({ lag, gratin, seats, fireTarget } = {}) {
  const lagNpc = bonfireNpc(lag);
  const gratinNpc = bonfireNpc(gratin);
  const authoredSeats = Array.from(seats ?? []).slice(0, 2);
  let staged = false;
  let homes = null;

  const valid = () => Boolean(
    lagNpc?.group && gratinNpc?.group
      && authoredSeats.length === 2
      && authoredSeats.every((seat) => seat?.getWorldPosition)
      && fireTarget?.getWorldPosition,
  );

  return Object.freeze({
    stage() {
      if (staged) return true;
      if (!valid()) return false;
      homes = Object.freeze({
        lag: captureBonfireNpc(lagNpc),
        gratin: captureBonfireNpc(gratinNpc),
      });
      lag.setBonfireMode?.(true);
      placeBonfireNpc(lagNpc, authoredSeats[0], fireTarget);
      placeBonfireNpc(gratinNpc, authoredSeats[1], fireTarget);
      staged = true;
      return true;
    },
    restore() {
      if (!staged || !homes) return false;
      lag.setBonfireMode?.(false);
      restoreBonfireNpc(lagNpc, homes.lag);
      restoreBonfireNpc(gratinNpc, homes.gratin);
      homes = null;
      staged = false;
      return true;
    },
    snapshot() {
      return Object.freeze({ staged, seatCount: authoredSeats.length });
    },
  });
}

function clonePoint(value, fallback) {
  const source = value ?? fallback;
  return {
    x: Number(source?.x) || 0,
    y: source?.y === null || source?.y === undefined ? null : Number(source.y) || 0,
    z: Number(source?.z) || 0,
    rotationY: Number(source?.rotationY) || 0,
  };
}

function resolveLayout(override = {}) {
  const mergeRows = (key) => Object.fromEntries(BODY_IDS.map((id) => [
    id,
    clonePoint(override?.[key]?.[id], CABIN_CLEANUP_LAYOUT[key][id]),
  ]));
  return {
    dungeon: mergeRows('dungeon'),
    staging: mergeRows('staging'),
    pyre: mergeRows('pyre'),
    gasCan: clonePoint(override.gasCan, CABIN_CLEANUP_LAYOUT.gasCan),
    firepit: {
      x: Number(override.firepit?.x ?? CABIN_CLEANUP_LAYOUT.firepit.x),
      z: Number(override.firepit?.z ?? CABIN_CLEANUP_LAYOUT.firepit.z),
    },
  };
}

function invisibleTarget(name, size, position) {
  const target = box({
    name,
    size,
    pos: position,
    mat: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    cast: false,
    receive: false,
  });
  target.userData.interactionProxy = true;
  return target;
}

function markCleanupAssembly(object, assemblyId, metadata = {}) {
  object.userData ??= {};
  object.userData.geometryGate = {
    ...(object.userData.geometryGate ?? {}),
    assemblyId,
    ...metadata,
  };
  return object;
}

function materialList(root) {
  const out = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => material.clone());
      out.push(...object.material);
    } else {
      object.material = object.material.clone();
      out.push(object.material);
    }
  });
  return [...new Set(out)].map((material) => ({
    material,
    color: material.color?.clone?.() ?? null,
    emissive: material.emissive?.clone?.() ?? null,
    emissiveIntensity: Number(material.emissiveIntensity) || 0,
    opacity: Number.isFinite(material.opacity) ? material.opacity : 1,
  }));
}

function buildWrapStation(id, at, y, materials) {
  const root = group(`cabin-cleanup.wrap-station.${id}`);
  root.position.set(at.x, y, at.z);
  root.rotation.y = at.rotationY;
  root.add(box({
    name: `cabin-cleanup.wrap-station.${id}.tarp`,
    size: [0.94, 0.018, 2.28],
    pos: [0, 0.012, 0],
    mat: materials.tarp,
    cast: false,
  }));
  for (const x of [-0.40, 0.40]) {
    root.add(box({
      name: `cabin-cleanup.wrap-station.${id}.fold`,
      size: [0.08, 0.022, 2.08],
      pos: [x, 0.026, 0],
      mat: materials.tarpEdge,
      cast: false,
    }));
  }
  const tape = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.026, 8, 18),
    materials.tape,
  );
  tape.name = `cabin-cleanup.wrap-station.${id}.tape-roll`;
  tape.rotation.x = Math.PI / 2;
  tape.position.set(0.58, 0.075, -0.72);
  root.add(tape);
  const target = invisibleTarget(
    `cabin-cleanup.wrap-station.${id}.target`,
    [1.2, 0.42, 2.5],
    [0, 0.21, 0],
  );
  root.add(target);
  return { root, target };
}

function buildStagingSkid(id, at, y, materials) {
  const root = group(`cabin-cleanup.staging.${id}`);
  markCleanupAssembly(root, `cabin-cleanup:staging:${id}`, { fixedSupportAnchor: true });
  root.position.set(at.x, y, at.z);
  root.rotation.y = at.rotationY;
  for (const x of [-0.34, 0.34]) {
    root.add(box({
      name: `cabin-cleanup.staging.${id}.runner`,
      size: [0.13, 0.12, 2.25],
      pos: [x, 0.06, 0],
      mat: materials.skid,
    }));
  }
  for (const z of [-0.76, 0, 0.76]) {
    root.add(box({
      name: `cabin-cleanup.staging.${id}.slat`,
      size: [0.90, 0.08, 0.18],
      pos: [0, 0.15, z],
      mat: materials.skidTop,
    }));
  }
  const target = invisibleTarget(
    `cabin-cleanup.staging.${id}.target`,
    [1.25, 0.70, 2.55],
    [0, 0.35, 0],
  );
  root.add(target);
  return { root, target };
}

function buildGasCan(at, y, materials) {
  const root = group('cabin-cleanup.gas-can');
  markCleanupAssembly(root, 'cabin-cleanup:gas-can', { checkSupport: false });
  root.position.set(at.x, y, at.z);
  root.rotation.y = at.rotationY;
  root.add(box({
    name: 'cabin-cleanup.gas-can.body',
    size: [0.38, 0.54, 0.18],
    pos: [0, 0.27, 0],
    mat: materials.gasCan,
  }));
  root.add(box({
    name: 'cabin-cleanup.gas-can.handle-gap',
    size: [0.19, 0.13, 0.20],
    pos: [0, 0.47, 0],
    mat: materials.dark,
  }));
  for (const x of [-0.13, 0.13]) {
    root.add(box({
      name: 'cabin-cleanup.gas-can.handle',
      size: [0.055, 0.18, 0.055],
      pos: [x, 0.54, 0],
      mat: materials.gasCan,
    }));
  }
  root.add(box({
    name: 'cabin-cleanup.gas-can.handle-top',
    size: [0.31, 0.055, 0.055],
    pos: [0, 0.63, 0],
    mat: materials.gasCan,
  }));
  root.add(cylinder({
    name: 'cabin-cleanup.gas-can.spout',
    r: 0.045,
    h: 0.26,
    pos: [0.23, 0.58, 0],
    rotZ: -0.72,
    mat: materials.metal,
  }));
  root.userData.cleanupItem = 'gas-can';
  return root;
}

function buildFireDressing(firepit, groundAt, materials) {
  const root = group('cabin-cleanup.fire-dressing');
  const baseY = groundAt(firepit.x, firepit.z);

  const seats = [];
  for (const [index, angle] of [0.92, 3.45].entries()) {
    const x = firepit.x + Math.cos(angle) * 4.35;
    const z = firepit.z + Math.sin(angle) * 4.35;
    const y = groundAt(x, z);
    const seat = group(`cabin-cleanup.fire-seat.${index}`);
    markCleanupAssembly(seat, `cabin-cleanup:fire-seat:${index}`, { fixedSupportAnchor: true });
    seat.position.set(x, y, z);
    seat.rotation.y = -angle;
    seat.add(cylinder({
      name: `cabin-cleanup.fire-seat.${index}.stump`,
      r: 0.34,
      h: 0.54,
      pos: [0, 0.27, 0],
      mat: materials.bark,
    }));
    seat.add(cylinder({
      name: `cabin-cleanup.fire-seat.${index}.cut`,
      r: 0.30,
      h: 0.025,
      pos: [0, 0.55, 0],
      mat: materials.cutWood,
    }));
    seats.push(seat);
    root.add(seat);
  }

  const beerCans = [];
  const beerCanCluster = group('cabin-cleanup.beer-cans');
  // Tiny tilted cans are placed with exact terrain samples, while the Cabin's
  // relief mesh intentionally cannot serve as a per-can support witness.
  markCleanupAssembly(beerCanCluster, 'cabin-cleanup:beer-cans', { checkSupport: false });
  const canOffsets = [
    [-3.25, 2.72, 0.08], [-2.96, 2.86, -0.18], [-3.44, 2.38, 0.20],
    [2.55, -3.28, -0.25], [2.82, -3.02, 0.14], [3.10, -2.72, -0.08],
  ];
  for (const [index, [dx, dz, tilt]] of canOffsets.entries()) {
    const x = firepit.x + dx;
    const z = firepit.z + dz;
    const can = cylinder({
      name: `cabin-cleanup.beer-can.${index}`,
      r: 0.034,
      h: 0.118,
      pos: [x, groundAt(x, z) + 0.06, z],
      rotZ: tilt,
      mat: index % 2 ? materials.beerRed : materials.beerGreen,
    });
    beerCans.push(can);
    beerCanCluster.add(can);
  }
  root.add(beerCanCluster);

  const whiskey = group('cabin-cleanup.whiskey-bottle');
  markCleanupAssembly(whiskey, 'cabin-cleanup:whiskey-bottle', { checkSupport: false });
  whiskey.position.set(firepit.x + 3.28, groundAt(firepit.x + 3.28, firepit.z + 2.0), firepit.z + 2.0);
  whiskey.rotation.z = 1.33;
  whiskey.add(box({ size: [0.13, 0.29, 0.10], pos: [0, 0.145, 0], mat: materials.whiskeyGlass }));
  whiskey.add(cylinder({ r: 0.032, h: 0.15, pos: [0, 0.365, 0], mat: materials.whiskeyGlass }));
  whiskey.add(cylinder({ r: 0.035, h: 0.035, pos: [0, 0.455, 0], mat: materials.dark }));
  root.add(whiskey);

  const smokeTable = group('cabin-cleanup.smoking-mess');
  markCleanupAssembly(smokeTable, 'cabin-cleanup:smoking-mess');
  // Use the southwest stump as the cigarette table instead of burying the
  // ashtray in that stump and in the old body skid position.
  const smokeSeat = seats[1];
  smokeTable.position.set(
    smokeSeat.position.x,
    smokeSeat.position.y + 0.565,
    smokeSeat.position.z,
  );
  smokeTable.rotation.y = smokeSeat.rotation.y;
  const pack = box({
    name: 'cabin-cleanup.cigarette-pack.0',
    size: [0.075, 0.023, 0.115],
    pos: [0, 0.035, 0],
    mat: materials.pack,
    rotY: 0.28,
  });
  const sparePack = box({
    name: 'cabin-cleanup.cigarette-pack.1',
    size: [0.075, 0.023, 0.115],
    pos: [0.13, 0.035, -0.04],
    mat: materials.packRed,
    rotY: -0.18,
  });
  const ashtray = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.035, 8, 24),
    materials.ashtray,
  );
  ashtray.name = 'cabin-cleanup.ashtray';
  ashtray.rotation.x = Math.PI / 2;
  ashtray.position.set(-0.18, 0.045, 0.08);
  smokeTable.add(pack, sparePack, ashtray);
  for (let i = 0; i < 3; i++) {
    smokeTable.add(cylinder({
      name: `cabin-cleanup.ashtray.butt.${i}`,
      r: 0.006,
      h: 0.10 - i * 0.012,
      pos: [-0.18 + i * 0.028, 0.065, 0.08 + (i % 2) * 0.025],
      rotZ: Math.PI / 2 + (i - 1) * 0.22,
      mat: materials.cigarette,
      cast: false,
    }));
  }
  root.add(smokeTable);

  root.userData.dressing = Object.freeze({
    beerCans: beerCans.length,
    whiskeyBottles: 1,
    cigarettePacks: 2,
    ashtrays: 1,
    seats: seats.length,
    baseY,
  });
  return { root, seats, beerCans, whiskey, smokeTable };
}

function buildBurnFx(firepit, y) {
  const root = group('cabin-cleanup.burn-fx');
  root.position.set(firepit.x, y, firepit.z);
  const flameMaterials = [
    new THREE.MeshBasicMaterial({ color: 0xff5b1f, transparent: true, opacity: 0.86, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: 0xffb32c, transparent: true, opacity: 0.92, depthWrite: false }),
  ];
  const flames = [];
  const plan = [
    [-0.34, -0.30, 0.36, 1.35, 0], [0.28, -0.12, 0.31, 1.18, 1],
    [-0.08, 0.34, 0.28, 1.02, 1], [0.40, 0.31, 0.24, 0.91, 0],
    [-0.43, 0.20, 0.22, 0.84, 0], [0.03, 0.02, 0.32, 1.48, 1],
  ];
  for (const [index, [x, z, radius, height, material]] of plan.entries()) {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 7),
      flameMaterials[material],
    );
    flame.name = `cabin-cleanup.burn-flame.${index}`;
    flame.position.set(x, 0.30 + height / 2, z);
    flame.userData.baseY = flame.position.y;
    flame.userData.height = height;
    flame.renderOrder = 3;
    flames.push(flame);
    root.add(flame);
  }

  const glow = new THREE.PointLight(0xff6327, 0, 15, 1.7);
  glow.name = 'cabin-cleanup.burn-glow';
  glow.position.set(0, 1.2, 0);
  root.add(glow);

  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0x2a2824,
    transparent: true,
    opacity: 0.20,
    depthWrite: false,
  });
  const smoke = [];
  for (let i = 0; i < 12; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), smokeMaterial.clone());
    puff.name = `cabin-cleanup.burn-smoke.${i}`;
    puff.castShadow = false;
    smoke.push(puff);
    root.add(puff);
  }
  root.visible = false;
  return { root, flames, glow, smoke };
}

function buildGasSheen(firepit, y) {
  const root = group('cabin-cleanup.gas-sheen');
  root.position.set(firepit.x, y + 0.025, firepit.z);
  const material = new THREE.MeshStandardMaterial({
    color: 0x251f19,
    roughness: 0.18,
    metalness: 0.12,
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 4; i++) {
    const spill = new THREE.Mesh(new THREE.CircleGeometry(0.42 + i * 0.09, 18), material);
    spill.name = `cabin-cleanup.gas-sheen.${i}`;
    spill.rotation.x = -Math.PI / 2;
    spill.scale.y = 0.42 + i * 0.05;
    spill.position.set((i - 1.5) * 0.30, i % 2 ? 0.008 : 0, (i % 2 ? 1 : -1) * 0.22);
    root.add(spill);
  }
  root.visible = false;
  return root;
}

/** Build the callback-only cleanup presentation and state manager. */
export function buildCabinBodyCleanup({
  parent = null,
  camera = null,
  groundAt = cabinGroundAt,
  bodySpecs = CABIN_CLEANUP_BODIES,
  layout: layoutOverride = null,
  callbacks = {},
  burnDuration = BODY_BURN_DURATION_S,
  onEvent = null,
} = {}) {
  if (!Array.isArray(bodySpecs) || bodySpecs.length !== 2) {
    throw new RangeError('Cabin cleanup requires exactly two body specifications');
  }
  const ids = bodySpecs.map(({ id }) => String(id));
  if (new Set(ids).size !== 2) throw new RangeError('Cabin cleanup body ids must be unique');

  const root = group('cabin-body-cleanup');
  parent?.add?.(root);
  const layout = resolveLayout(layoutOverride ?? {});
  // Custom ids retain the two authored positions by index.
  if (ids.some((id) => !layout.dungeon[id])) {
    for (let i = 0; i < ids.length; i++) {
      const defaultId = BODY_IDS[i];
      layout.dungeon[ids[i]] = clonePoint(layoutOverride?.dungeon?.[ids[i]], layout.dungeon[defaultId]);
      layout.staging[ids[i]] = clonePoint(layoutOverride?.staging?.[ids[i]], layout.staging[defaultId]);
      layout.pyre[ids[i]] = clonePoint(layoutOverride?.pyre?.[ids[i]], layout.pyre[defaultId]);
    }
  }

  const materials = {
    tarp: mat({ color: 0x59645f, roughness: 0.96 }),
    tarpEdge: mat({ color: 0x313c38, roughness: 0.98 }),
    tape: mat({ color: 0x7a7d76, roughness: 0.62, metalness: 0.10 }),
    // These are night-time task stations, and their interaction proxies are
    // deliberately invisible. A restrained self-lit value keeps the slats and
    // can readable if the nearby dusk beacon loses the dynamic-light budget;
    // it does not cast light or brighten the surrounding fire-circle grade.
    skid: mat({
      color: 0x4a3322,
      emissive: 0x24170d,
      emissiveIntensity: 0.34,
      roughness: 0.99,
    }),
    skidTop: mat({
      color: 0x674a30,
      emissive: 0x3a2512,
      emissiveIntensity: 0.40,
      roughness: 0.97,
    }),
    gasCan: mat({
      color: 0xa62821,
      emissive: 0x741713,
      emissiveIntensity: 0.48,
      roughness: 0.68,
      metalness: 0.38,
    }),
    dark: mat({ color: 0x1e201d, roughness: 0.75 }),
    metal: mat({ color: 0x777a75, roughness: 0.55, metalness: 0.72 }),
    bark: mat({ color: 0x382a1d, roughness: 1 }),
    cutWood: mat({ color: 0x806241, roughness: 0.96 }),
    beerRed: mat({ color: 0x8f241f, roughness: 0.48, metalness: 0.50 }),
    beerGreen: mat({ color: 0x235e3b, roughness: 0.48, metalness: 0.50 }),
    whiskeyGlass: mat({ color: 0x6d4822, roughness: 0.20, metalness: 0.05, transparent: true, opacity: 0.78 }),
    pack: mat({ color: 0xe1d7bd, roughness: 0.91 }),
    packRed: mat({ color: 0x8b2d27, roughness: 0.91 }),
    ashtray: mat({ color: 0x6f7b7d, roughness: 0.24, metalness: 0.30 }),
    cigarette: mat({ color: 0xd7c9aa, roughness: 0.94 }),
  };

  const stations = {};
  const staging = {};
  const records = new Map();
  const interactionTargets = { wrap: {}, bodies: {}, stage: {} };

  for (const [index, spec] of bodySpecs.entries()) {
    const id = ids[index];
    const dungeonAt = layout.dungeon[id];
    const dungeonY = dungeonAt.y ?? groundAt(dungeonAt.x, dungeonAt.z);
    stations[id] = buildWrapStation(id, dungeonAt, dungeonY, materials);
    root.add(stations[id].root);
    interactionTargets.wrap[id] = stations[id].target;

    const stageAt = layout.staging[id];
    const stageY = stageAt.y ?? groundAt(stageAt.x, stageAt.z);
    staging[id] = buildStagingSkid(id, stageAt, stageY, materials);
    root.add(staging[id].root);
    interactionTargets.stage[id] = staging[id].target;

    const wrapped = buildWrappedBody({
      length: Number(spec.length) || 1.86,
      build: Number(spec.build) || 1,
      stain: clamp01(spec.stain ?? 0.65),
      seed: Number(spec.seed) || 1 + index * 3,
      name: `cabin-cleanup.body.${id}`,
    });
    wrapped.group.userData.cleanupBodyId = id;
    wrapped.group.userData.cleanupCanonicalPrefab = true;
    wrapped.group.userData.cleanupPhase = 'awaiting-wrap';
    wrapped.group.visible = false;
    root.add(wrapped.group);
    interactionTargets.bodies[id] = wrapped.group;
    const burnMaterials = materialList(wrapped.group);
    records.set(id, {
      id,
      label: String(spec.label ?? id),
      wrapped,
      group: wrapped.group,
      burnMaterials,
      phase: 'awaiting-wrap',
      pyreIndex: index,
    });
  }

  const firepitY = groundAt(layout.firepit.x, layout.firepit.z);
  const gasAt = layout.gasCan;
  const gasY = gasAt.y ?? groundAt(gasAt.x, gasAt.z);
  const gasCan = buildGasCan(gasAt, gasY, materials);
  root.add(gasCan);
  interactionTargets.gasCan = gasCan;

  const dressing = buildFireDressing(layout.firepit, groundAt, materials);
  root.add(dressing.root);
  const burnFx = buildBurnFx(layout.firepit, firepitY);
  root.add(burnFx.root);
  const gasSheen = buildGasSheen(layout.firepit, firepitY);
  root.add(gasSheen);

  const fireTarget = invisibleTarget(
    'cabin-cleanup.firepit-placement-target',
    [2.8, 1.5, 2.8],
    [layout.firepit.x, firepitY + 0.75, layout.firepit.z],
  );
  root.add(fireTarget);
  interactionTargets.fire = fireTarget;
  interactionTargets.ignition = fireTarget;

  const colliders = dressing.seats.map((seat, index) => {
    const at = seat.position;
    const box3 = collider(
      [at.x - 0.39, at.y, at.z - 0.39],
      [at.x + 0.39, at.y + 0.58, at.z + 0.39],
    );
    markSpatialPrimitive(box3, { id: `cabin-cleanup-fire-seat-${index}`, kind: 'seat' });
    return box3;
  });

  const state = {
    elapsed: 0,
    carryingId: null,
    gasPoured: false,
    ignited: false,
    burnProgress: 0,
  };
  const carryPosition = new THREE.Vector3(...BODY_CARRY_POSITION);
  const carryQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, BODY_CARRY_YAW, 0));
  const charColour = new THREE.Color(0x171310);

  function emit(type, fields = {}) {
    const event = Object.freeze({ type, ...fields, snapshot: snapshot() });
    try { onEvent?.(event); } catch { /* presentation callbacks are non-fatal */ }
    return event;
  }

  function worldY(at, extra = 0) {
    return (at.y ?? groundAt(at.x, at.z)) + extra;
  }

  function attachWorld(record) {
    if (record.group.parent !== root) root.attach(record.group);
  }

  function place(record, at, extraY = 0) {
    attachWorld(record);
    record.group.position.set(at.x, worldY(at, extraY), at.z);
    record.group.quaternion.setFromEuler(new THREE.Euler(0, at.rotationY, 0));
  }

  function applyBurn(record, progress) {
    const p = clamp01(progress);
    for (const entry of record.burnMaterials) {
      if (entry.color && entry.material.color) entry.material.color.copy(entry.color).lerp(charColour, p * 0.92);
      if (entry.emissive && entry.material.emissive) {
        entry.material.emissive.copy(entry.emissive).lerp(new THREE.Color(0x4b1105), Math.sin(p * Math.PI) * 0.55);
        entry.material.emissiveIntensity = entry.emissiveIntensity + Math.sin(p * Math.PI) * 0.75;
      }
      if (entry.material.transparent) entry.material.opacity = entry.opacity * (1 - p * 0.30);
    }
    record.group.scale.set(1 - p * 0.10, 1 - p * 0.42, 1 - p * 0.08);
  }

  function present(record) {
    record.group.userData.cleanupPhase = record.phase;
    record.group.visible = record.phase !== 'awaiting-wrap';
    if (!record.group.visible) {
      attachWorld(record);
      place(record, layout.dungeon[record.id]);
      applyBurn(record, 0);
      return;
    }
    if (record.phase === 'carrying' && camera) {
      camera.attach(record.group);
      record.group.position.copy(carryPosition);
      record.group.quaternion.copy(carryQuaternion);
      record.group.scale.set(1, 1, 1);
      return;
    }
    if (record.phase === 'wrapped') place(record, layout.dungeon[record.id]);
    else if (record.phase === 'staged') place(record, layout.staging[record.id], 0.18);
    else if (['at-fire', 'burning', 'burned'].includes(record.phase)) {
      // Existing crossed firepit logs top out near 0.33 m. The second body is
      // genuinely stacked above the first, not coplanar with it.
      place(record, layout.pyre[record.id], 0.38 + record.pyreIndex * 0.29);
    }
    applyBurn(record, ['burning', 'burned'].includes(record.phase) ? state.burnProgress : 0);
  }

  function applyFx() {
    gasSheen.visible = state.gasPoured && !state.ignited;
    gasCan.rotation.z = state.gasPoured ? 1.25 : 0;
    gasCan.position.y = gasY + (state.gasPoured ? 0.18 : 0);
    burnFx.root.visible = state.ignited;
    const life = state.ignited ? Math.max(0.24, 1 - state.burnProgress * 0.72) : 0;
    burnFx.glow.intensity = state.ignited
      ? (3.6 + Math.sin(state.elapsed * 12.3) * 0.45) * life
      : 0;
    for (let i = 0; i < burnFx.flames.length; i++) {
      const flame = burnFx.flames[i];
      const pulse = 0.90 + Math.sin(state.elapsed * (9.1 + i * 0.43) + i) * 0.10;
      flame.scale.set(1 / Math.sqrt(pulse), pulse * life, 1 / Math.sqrt(pulse));
      flame.position.y = flame.userData.baseY + (pulse - 1) * flame.userData.height / 2;
      flame.visible = state.ignited;
    }
    for (let i = 0; i < burnFx.smoke.length; i++) {
      const puff = burnFx.smoke[i];
      const phase = (state.elapsed * 0.17 + i / burnFx.smoke.length) % 1;
      const angle = i * 2.17 + state.elapsed * 0.31;
      puff.position.set(
        Math.sin(angle) * (0.18 + phase * 0.48),
        1.05 + phase * 3.7,
        Math.cos(angle * 0.83) * (0.14 + phase * 0.42),
      );
      const scale = 0.65 + phase * 2.3;
      puff.scale.setScalar(scale);
      puff.material.opacity = state.ignited ? Math.sin(phase * Math.PI) * 0.20 * life : 0;
    }
  }

  function recordFor(id) {
    return records.get(String(id)) ?? null;
  }

  function wrap(id) {
    const record = recordFor(id);
    if (!record || record.phase !== 'awaiting-wrap') return false;
    record.phase = 'wrapped';
    present(record);
    emit('wrap', { id: record.id });
    return true;
  }

  function stage(id) {
    const record = recordFor(id);
    if (!record || !['wrapped', 'staged', 'carrying'].includes(record.phase)) return false;
    if (state.carryingId === record.id) state.carryingId = null;
    record.phase = 'staged';
    present(record);
    emit('stage', { id: record.id });
    return true;
  }

  function beginCarry(id, carryCamera = camera) {
    const record = recordFor(id);
    if (!record || !carryCamera || state.carryingId) return false;
    if (!['wrapped', 'staged'].includes(record.phase)) return false;
    camera = carryCamera;
    record.phase = 'carrying';
    state.carryingId = record.id;
    present(record);
    emit('begin-carry', { id: record.id });
    return true;
  }

  function placeAtFire(id = state.carryingId) {
    const record = recordFor(id);
    if (!record || record.phase !== 'carrying' || state.carryingId !== record.id) return false;
    state.carryingId = null;
    record.phase = 'at-fire';
    present(record);
    emit('place-at-fire', { id: record.id });
    return true;
  }

  function pourGas() {
    if (state.gasPoured) return false;
    if ([...records.values()].some((record) => record.phase !== 'at-fire')) return false;
    state.gasPoured = true;
    applyFx();
    emit('pour-gas');
    return true;
  }

  function ignite() {
    if (!state.gasPoured || state.ignited) return false;
    if ([...records.values()].some((record) => record.phase !== 'at-fire')) return false;
    state.ignited = true;
    state.burnProgress = 0;
    for (const record of records.values()) {
      record.phase = 'burning';
      present(record);
    }
    applyFx();
    emit('ignite');
    return true;
  }

  function update(dt) {
    const step = Math.max(0, Math.min(0.25, Number(dt) || 0));
    state.elapsed += step;
    if (state.carryingId) {
      const record = records.get(state.carryingId);
      if (record?.group.parent === camera) {
        record.group.position.y = BODY_CARRY_POSITION[1]
          + Math.sin(state.elapsed * BODY_CARRY_BOB_SPEED) * BODY_CARRY_BOB_METRES;
      }
    }
    if (state.ignited && state.burnProgress < 1) {
      state.burnProgress = Math.min(1, state.burnProgress + step / Math.max(1, Number(burnDuration) || BODY_BURN_DURATION_S));
      for (const record of records.values()) {
        applyBurn(record, state.burnProgress);
        if (state.burnProgress >= 1) record.phase = 'burned';
        record.group.userData.cleanupPhase = record.phase;
      }
      if (state.burnProgress >= 1) emit('burn-complete');
    }
    applyFx();
    return snapshot();
  }

  function snapshot() {
    return Object.freeze({
      version: 1,
      elapsed: state.elapsed,
      carryingId: state.carryingId,
      gasPoured: state.gasPoured,
      ignited: state.ignited,
      burnProgress: state.burnProgress,
      complete: state.burnProgress >= 1,
      bodies: Object.freeze(Object.fromEntries([...records].map(([id, record]) => [
        id,
        Object.freeze({ id, label: record.label, phase: record.phase, visible: record.group.visible }),
      ]))),
    });
  }

  function sync(saved = {}) {
    state.elapsed = Math.max(0, Number(saved.elapsed) || 0);
    state.gasPoured = Boolean(saved.gasPoured);
    state.ignited = Boolean(saved.ignited);
    state.burnProgress = clamp01(saved.burnProgress);
    state.carryingId = null;

    let carried = null;
    for (const [id, record] of records) {
      const candidate = String(saved.bodies?.[id]?.phase ?? 'awaiting-wrap');
      record.phase = PHASES.has(candidate) ? candidate : 'awaiting-wrap';
      if (record.phase === 'carrying') {
        if (carried || !camera) record.phase = 'staged';
        else carried = id;
      }
      if (state.burnProgress >= 1 && ['at-fire', 'burning', 'burned'].includes(record.phase)) record.phase = 'burned';
      else if (state.ignited && record.phase === 'at-fire') record.phase = 'burning';
    }
    state.carryingId = carried;
    if ([...records.values()].some((record) => ['burning', 'burned'].includes(record.phase))) {
      state.gasPoured = true;
      state.ignited = true;
    }
    for (const record of records.values()) present(record);
    applyFx();
    return snapshot();
  }

  const callback = (name, ...args) => callbacks?.[name]?.(...args, snapshot());
  const interactionDescriptors = {
    wrap: {},
    bodies: {},
    stage: {},
  };
  for (const [id, record] of records) {
    interactionDescriptors.wrap[id] = Object.freeze({
      target: interactionTargets.wrap[id],
      label: () => `Wrap <b>${record.label}</b>`,
      enabled: () => record.phase === 'awaiting-wrap',
      onUse: () => callback('onWrap', id),
    });
    interactionDescriptors.bodies[id] = Object.freeze({
      target: interactionTargets.bodies[id],
      label: () => `Carry <b>${record.label}</b>`,
      enabled: () => ['wrapped', 'staged'].includes(record.phase) && !state.carryingId,
      onUse: () => callback('onCarry', id),
    });
    interactionDescriptors.stage[id] = Object.freeze({
      target: interactionTargets.stage[id],
      label: () => `Set down <b>${record.label}</b> outside`,
      enabled: () => record.phase === 'carrying' && state.carryingId === id,
      onUse: () => callback('onStage', id),
    });
  }
  interactionDescriptors.fire = Object.freeze({
    target: fireTarget,
    label: () => state.carryingId ? 'Place the body on the <b>pyre</b>' : 'The <b>firepit pyre</b>',
    enabled: () => Boolean(state.carryingId),
    onUse: () => callback('onPlaceAtFire', state.carryingId),
  });
  interactionDescriptors.gasCan = Object.freeze({
    target: gasCan,
    label: () => 'Pour <b>gasoline</b> over the pyre',
    enabled: () => !state.gasPoured && [...records.values()].every((record) => record.phase === 'at-fire'),
    onUse: () => callback('onPourGas'),
  });
  interactionDescriptors.ignition = Object.freeze({
    target: fireTarget,
    label: () => 'Ignite the <b>pyre</b>',
    enabled: () => state.gasPoured && !state.ignited,
    onUse: () => callback('onIgnite'),
  });

  for (const descriptor of [
    ...Object.values(interactionDescriptors.wrap),
    ...Object.values(interactionDescriptors.bodies),
    ...Object.values(interactionDescriptors.stage),
    interactionDescriptors.fire,
    interactionDescriptors.gasCan,
    interactionDescriptors.ignition,
  ]) {
    descriptor.target.userData.cleanupInteraction ??= [];
    descriptor.target.userData.cleanupInteraction.push(descriptor);
  }

  const geometry = Object.freeze({
    bodyCount: records.size,
    canonicalPrefabCount: records.size,
    dungeonStations: Object.freeze(Object.fromEntries(ids.map((id) => [id, Object.freeze({ ...layout.dungeon[id] })]))),
    stagingPositions: Object.freeze(Object.fromEntries(ids.map((id) => [id, Object.freeze({ ...layout.staging[id] })]))),
    pyrePositions: Object.freeze(Object.fromEntries(ids.map((id) => [id, Object.freeze({ ...layout.pyre[id] })]))),
    firepit: Object.freeze({ ...layout.firepit, y: firepitY }),
    dressing: dressing.root.userData.dressing,
  });

  sync();
  return Object.freeze({
    root,
    bodies: records,
    stations: Object.freeze(stations),
    staging: Object.freeze(staging),
    gasCan,
    gasSheen,
    burnFx,
    dressing,
    colliders: Object.freeze(colliders),
    interactionTargets: Object.freeze(interactionTargets),
    interactionDescriptors: Object.freeze(interactionDescriptors),
    geometry,
    sync,
    snapshot,
    wrap,
    stage,
    beginCarry,
    placeAtFire,
    pourGas,
    ignite,
    update,
  });
}
