/**
 * A late-game countryside hub built for the cabin rather than wearing the
 * apartment shell as a disguise.
 *
 * The apartment's deep seams are reused (prop builders, material palette,
 * manifest art, inventory and model replacement), while placement, collision
 * and interactions belong to this scene.  All ctx callbacks are optional:
 *
 *   onBedTap, onBedRest, onCouch, onDesk, onTvTap, onTvHold,
 *   onRadioTap, onRadioHold, onPhone, onFridge, onCook, onEat,
 *   onShower, onWardrobe, onToilet, onArt, onFrontDoor,
 *   onLandmark, onCar, onWoodpile, onPorch.
 */

import * as THREE from 'three';
import { box, boxFrom, cylinder, plane, mat, collider, group, yawToward } from '../world/build.js';
import { makeMaterials } from '../world/materials.js';
import * as P from '../world/props.js';
import { resolveGear } from '../world/gear.js';
import { loadModels } from '../world/models.js';
import { Inventory, bindHeldItem } from '../core/inventory.js';
import {
  PROPERTY,
  CABIN,
  LANDMARKS,
  TRAIL_LOOP,
  OVERLOOK_TRAIL,
  CREEK_PATH,
  SURFACE,
  heightAt,
  surfaceAt,
  surfaceProps,
  hashAt,
  canPlantTree,
  treeDensityAt,
  trailFrame,
  creekFrame,
  creekWaterAt,
  insideRect,
  samplePolyline,
} from './field.js';

const WALL = 0.20;
const WALL_H = 3.05;
const MAIN = CABIN.main;
const BATH = CABIN.bath;
const FRONT_DOOR = Object.freeze({ x0: 1.90, x1: 3.08, z: MAIN.z1, h: 2.24 });
const BATH_DOOR = Object.freeze({ x0: -2.12, x1: -1.02, z: MAIN.z0, h: 2.16 });

/** Every apartment-wall memory is rehung in the cabin, never silently lost. */
export const CABIN_ART_SLOTS = Object.freeze([
  'bed.above', 'bed.poster', 'bed.mid', 'bed.right',
  'gap.high', 'gap.low', 'gap.mid',
  'couch.left', 'feature.stacks', 'couch.right',
  'west.late', 'west.low', 'west.corner',
  'north.corner', 'shelf.left', 'shelf.above', 'cork.above',
  'desk.left', 'desk.right', 'desk.high',
  'south.shield', 'east.square', 'east.small',
  'east.golf-trip', 'east.casa-bonita', 'door.side',
  'south.a', 'south.b', 'south.wide', 'south.stands',
  'south.portrait', 'poster.pinup', 'feature.denver',
  'bath.toilet', 'bath.toilet.poster', 'bath.far', 'bath.mirror', 'bath.high',
]);

const CABIN_PROP_SLOTS = Object.freeze([
  'banner.main', 'banner.twitch', 'crest.round',
  'shelf.photo', 'sideboard.photo', 'desk.photo', 'night.photo',
  'closet.back', 'closet.shirt.a', 'closet.shirt.b', 'shrine.b', 'bed.under',
  'fridge.magnet', 'fridge.photo.a', 'fridge.photo.b',
  'sticker.tower', 'sticker.fridge', 'sticker.fridge.b',
  'zyn.lid', 'label.beer', 'label.whiskey', 'eggs.carton', 'cereal.box',
]);

const noopHud = Object.freeze({
  say() {}, toast() {}, setHand() {}, showPrompt() {}, hidePrompt() {}, setHold() {},
});
const noopAudio = Object.freeze({
  play() {}, say() {}, startLoop() { return null; }, stopLoop() {}, setLoopVolume() {},
});
const noopInteraction = Object.freeze({ register(target, desc) { target.userData.interact = desc; return target; } });

function invisibleMaterial() {
  return new THREE.MeshBasicMaterial({ visible: false });
}

function targetBox(name, size, pos) {
  return box({
    name,
    size,
    pos,
    mat: invisibleMaterial(),
    cast: false,
    receive: false,
  });
}

function ownGeometry(target, assemblyId, metadata = {}) {
  target.userData ??= {};
  target.userData.geometryGate = {
    ...(target.userData.geometryGate ?? {}),
    assemblyId,
    ...metadata,
  };
  return target;
}

function proceduralSurface(target) {
  target.userData.geometryGate = {
    ...(target.userData.geometryGate ?? {}),
    overlap: false,
    checkSupport: false,
    checkWallEmbed: false,
  };
  return target;
}

function addBounds(colliders, bounds, name = '') {
  const c = collider(bounds[0], bounds[1]);
  if (name) c.name = name;
  colliders.push(c);
  return c;
}

function pointInBridge(x, z, pad = 0) {
  return Math.abs(x - LANDMARKS.bridge.x) <= 1.35 + pad
    && Math.abs(z - LANDMARKS.bridge.z) <= 5.2 + pad;
}

function bridgeDeckHeight() {
  const p = LANDMARKS.bridge;
  return Math.max(
    heightAt(p.x, p.z - 5.2),
    heightAt(p.x, p.z + 5.2),
    creekWaterAt(p.x, p.z) + 0.62,
  );
}

/** Cabin/porch/bridge walking surfaces laid over the shared natural field. */
function makeGroundAt(bridgeY, shedY) {
  return (x, z) => {
    if (insideRect(x, z, CABIN.main) || insideRect(x, z, CABIN.bath)) return CABIN.floorY;
    if (insideRect(x, z, CABIN.porch)) return 0.10;
    const bridge = LANDMARKS.bridge;
    const bridgeX = Math.abs(x - bridge.x);
    const bridgeZ = Math.abs(z - bridge.z);
    if (bridgeX <= 1.35 && bridgeZ <= 5.2) return bridgeY;
    if (bridgeX <= 1.35 && bridgeZ < 8.0) {
      const u = (bridgeZ - 5.2) / 2.8;
      const eased = u * u * (3 - 2 * u);
      return THREE.MathUtils.lerp(bridgeY, heightAt(x, z), eased);
    }
    const shed = LANDMARKS.shed;
    if (Math.abs(x - shed.x) <= 3.35 && Math.abs(z - shed.z) <= 2.75) return shedY;
    return heightAt(x, z);
  };
}

/**
 * Build the complete cabin hub and property.
 * @param {object} ctx scene plus optional audio/hud/interaction/time/callbacks
 */
export async function buildCountrysideCabin(ctx) {
  if (!ctx?.scene?.add) throw new TypeError('buildCountrysideCabin requires ctx.scene');
  const scene = ctx.scene;
  const audio = ctx.audio ?? noopAudio;
  const hud = ctx.hud ?? noopHud;
  const interaction = ctx.interaction ?? noopInteraction;
  const time = ctx.time ?? { minutes: 12 * 60 };

  const gear = await resolveGear([...CABIN_ART_SLOTS, ...CABIN_PROP_SLOTS]);
  const propTexture = (slot) => gear.get(slot)?.real ? gear.get(slot).texture : null;
  P.beerLabelMaterial(propTexture('label.beer'));

  const M = makeMaterials();
  M.cabinLog = mat({ color: 0x5a371f, roughness: 0.96 });
  M.cabinLogDark = mat({ color: 0x342014, roughness: 0.98 });
  M.cabinBeam = mat({ color: 0x25160d, roughness: 0.90 });
  M.roof = mat({ color: 0x292b2b, roughness: 0.72, metalness: 0.25 });
  M.stone = mat({ color: 0x55514a, roughness: 1 });

  const root = group('countryside-cabin');
  const cabinRoot = group('cabin-building');
  const landscapeRoot = group('cabin-landscape');
  root.add(landscapeRoot, cabinRoot);
  scene.add(root);

  const colliders = [];
  const occluders = [];
  const floorZones = [];
  const utilityTargets = {};
  const interactionTargets = {};
  const ticks = [];
  const disposables = [];

  const shell = buildCabinShell({ root: cabinRoot, M, colliders, occluders });
  const exterior = buildProperty({
    root: landscapeRoot,
    M,
    colliders,
    floorZones,
    interaction,
    interactionTargets,
    ctx,
    hud,
    audio,
    disposables,
  });
  const groundAt = makeGroundAt(exterior.bridgeY, exterior.shedY);

  const hub = buildDomesticHub({
    root: cabinRoot,
    M,
    gear,
    propTexture,
    colliders,
    floorZones,
    interaction,
    utilityTargets,
    ticks,
    ctx,
    hud,
    audio,
    time,
    shell,
  });

  // The natural ground is the last fallback; authored indoor/path zones win.
  addOutdoorFloorZones(floorZones, exterior.bridgeY);

  let hemi = null;
  let sun = null;
  let interiorAmbient = null;
  if (ctx.externalLighting !== true) {
    hemi = new THREE.HemisphereLight(0x9db8cc, 0x24261d, 0.78);
    sun = new THREE.DirectionalLight(0xffdfad, 1.55);
    sun.position.set(-34, 52, 28);
    sun.castShadow = true;
    if (sun.shadow?.mapSize) sun.shadow.mapSize.set(2048, 2048);
    if (sun.shadow?.camera) {
      Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 1, far: 180 });
    }
    interiorAmbient = new THREE.AmbientLight(0xffe4c0, 0.18);
    root.add(hemi, sun, interiorAmbient);
  }

  const models = loadModels(root).then((result) => {
    if (result.loaded) console.log(`cabin models: placed ${result.loaded}`);
    for (const failure of result.failed) console.warn(`cabin models: ${failure}`);
    return result;
  });

  let elapsedInternal = 0;
  const update = (dt = 0, elapsed = undefined, playerPosition = null) => {
    elapsedInternal = Number.isFinite(elapsed) ? elapsed : elapsedInternal + dt;
    shell.updateDoor(dt);
    hub.update(dt, elapsedInternal);
    exterior.update(dt, elapsedInternal, playerPosition);

    // DayNight is an Interface, not a requirement. If the campaign supplies
    // it the outside follows authored time; otherwise the cabin keeps a safe
    // late-afternoon rig for standalone previews.
    if (sun && hemi && interiorAmbient && time.sunPos) {
      sun.position.copy(time.sunPos).multiplyScalar(5.2);
      sun.intensity = time.sunIntensity ?? sun.intensity;
      if (time.sunColour) sun.color.copy(time.sunColour);
      hemi.intensity = time.hemiIntensity ?? hemi.intensity;
      if (time.hemiSky) hemi.color.copy(time.hemiSky);
      if (time.hemiGround) hemi.groundColor.copy(time.hemiGround);
      interiorAmbient.intensity = Math.max(0.10, (time.ambIntensity ?? 0.3) * 0.42);
    }
  };

  const dispose = () => {
    audio.stopLoop?.('cabin.forest', 0.4);
    audio.stopLoop?.('cabin.fridge', 0.2);
    audio.stopLoop?.('cabin.firepit', 0.3);
    for (const d of disposables) d?.dispose?.();
    root.removeFromParent();
  };

  const arrivalPos = new THREE.Vector3(
    LANDMARKS.car.x - 3.8,
    groundAt(LANDMARKS.car.x - 3.8, LANDMARKS.car.z + 1.2) + 1.68,
    LANDMARKS.car.z + 1.2,
  );
  const porchPos = new THREE.Vector3(2.48, groundAt(2.48, 7.25) + 1.68, 7.25);
  const wakePos = new THREE.Vector3(hub.publicSurface.bedExit.x, CABIN.floorY + 1.68, hub.publicSurface.bedExit.z);
  const spawns = {
    arrival: {
      position: arrivalPos,
      yaw: yawToward(arrivalPos, new THREE.Vector3(0, arrivalPos.y, 0)),
      pitch: -0.04,
    },
    wake: { position: wakePos, yaw: -Math.PI / 2, pitch: -0.08 },
    porch: {
      position: porchPos,
      yaw: yawToward(porchPos, new THREE.Vector3(12, porchPos.y, 22)),
      pitch: -0.03,
    },
  };

  const landscape = Object.freeze({
    bounds: PROPERTY,
    trail: Object.freeze({ loop: TRAIL_LOOP, overlook: OVERLOOK_TRAIL }),
    creek: CREEK_PATH,
    bridgeY: exterior.bridgeY,
    counts: Object.freeze({ ...exterior.counts }),
    lod: Object.freeze({ near: 66, undergrowth: 52, far: 158, chunk: 32 }),
  });

  const landmarkMetadata = Object.fromEntries(Object.entries(LANDMARKS).map(([id, landmark]) => {
    const point = new THREE.Vector3(landmark.x, groundAt(landmark.x, landmark.z), landmark.z);
    return [id, { ...landmark, id, point, position: point }];
  }));

  return {
    root,
    cabinRoot,
    landscapeRoot,
    materials: M,
    colliders,
    occluders,
    floorZones,
    groundAt,
    surfaceAt,
    state: hub.state,
    inventory: hub.inventory,
    models,
    update,
    dispose,
    landscape,
    landmarks: landmarkMetadata,
    interactionTargets,
    landmarkTargets: interactionTargets,
    utilityTargets,
    carTarget: interactionTargets.car,
    setFireLit: exterior.setFireLit,
    door: shell.door,
    cabinDoor: shell.door,
    toggleDoor: shell.door.toggle,
    frontDoorPivot: shell.door.pivot,
    bathDoorPivot: hub.bathDoorPivot,
    spawns,
    ...hub.publicSurface,
  };
}

function buildCabinShell({ root, M, colliders, occluders }) {
  const colliderStart = colliders.length;
  const structure = group('cabin-timber-envelope');
  ownGeometry(structure, 'cabin-shell');
  root.add(structure);

  // Floors sit at authored y=0; props.js uses the same zero.
  structure.add(boxFrom(MAIN.x0, -0.14, MAIN.z0, MAIN.x1, 0, MAIN.z1, M.floor, { cast: false }));
  structure.add(boxFrom(BATH.x0, -0.14, BATH.z0, BATH.x1, 0, BATH.z1, M.splash, { cast: false }));

  const wallBlock = (name, bounds, exteriorFace = null) => {
    const mesh = boxFrom(...bounds[0], ...bounds[1], M.wall, { name, cast: false });
    mesh.userData.geometryGate = { assemblyId: 'cabin-shell', structural: true };
    structure.add(mesh);
    occluders.push(mesh);
    if (exteriorFace) addCladding(structure, M, bounds, exteriorFace);
    return mesh;
  };

  // North wall, split around the bathroom opening.
  wallBlock('cabin-north-west', [[MAIN.x0, 0, MAIN.z0 - WALL], [BATH_DOOR.x0, WALL_H, MAIN.z0]], 'north');
  wallBlock('cabin-north-east', [[BATH_DOOR.x1, 0, MAIN.z0 - WALL], [MAIN.x1, WALL_H, MAIN.z0]], 'north');
  wallBlock('cabin-north-door-header', [[BATH_DOOR.x0, BATH_DOOR.h, MAIN.z0 - WALL], [BATH_DOOR.x1, WALL_H, MAIN.z0]], 'north');

  // South wall has a picture window and the actual front door.
  const winS = { x0: -2.70, x1: -0.35, y0: 0.92, y1: 2.24 };
  wallBlock('cabin-south-west', [[MAIN.x0, 0, MAIN.z1], [winS.x0, WALL_H, MAIN.z1 + WALL]], 'south');
  wallBlock('cabin-south-window-sill', [[winS.x0, 0, MAIN.z1], [winS.x1, winS.y0, MAIN.z1 + WALL]], 'south');
  wallBlock('cabin-south-window-head', [[winS.x0, winS.y1, MAIN.z1], [winS.x1, WALL_H, MAIN.z1 + WALL]], 'south');
  wallBlock('cabin-south-mid', [[winS.x1, 0, MAIN.z1], [FRONT_DOOR.x0, WALL_H, MAIN.z1 + WALL]], 'south');
  wallBlock('cabin-south-door-header', [[FRONT_DOOR.x0, FRONT_DOOR.h, MAIN.z1], [FRONT_DOOR.x1, WALL_H, MAIN.z1 + WALL]], 'south');
  wallBlock('cabin-south-east', [[FRONT_DOOR.x1, 0, MAIN.z1], [MAIN.x1, WALL_H, MAIN.z1 + WALL]], 'south');

  // West picture window looks straight into live forest, not a backdrop.
  const winW = { z0: -1.35, z1: 1.25, y0: 1.04, y1: 2.38 };
  wallBlock('cabin-west-north', [[MAIN.x0 - WALL, 0, MAIN.z0], [MAIN.x0, WALL_H, winW.z0]], 'west');
  wallBlock('cabin-west-window-sill', [[MAIN.x0 - WALL, 0, winW.z0], [MAIN.x0, winW.y0, winW.z1]], 'west');
  wallBlock('cabin-west-window-head', [[MAIN.x0 - WALL, winW.y1, winW.z0], [MAIN.x0, WALL_H, winW.z1]], 'west');
  wallBlock('cabin-west-south', [[MAIN.x0 - WALL, 0, winW.z1], [MAIN.x0, WALL_H, MAIN.z1]], 'west');

  wallBlock('cabin-east', [[MAIN.x1, 0, MAIN.z0], [MAIN.x1 + WALL, WALL_H, MAIN.z1]], 'east');

  // Bathroom lean-to: three native timber outer walls.
  wallBlock('cabin-bath-north', [[BATH.x0 - WALL, 0, BATH.z0 - WALL], [BATH.x1 + WALL, WALL_H, BATH.z0]], 'north');
  wallBlock('cabin-bath-west', [[BATH.x0 - WALL, 0, BATH.z0], [BATH.x0, WALL_H, BATH.z1]], 'west');
  wallBlock('cabin-bath-east', [[BATH.x1, 0, BATH.z0], [BATH.x1 + WALL, WALL_H, BATH.z1]], 'east');

  // Collision remains continuous across windows, but not across doors.
  addBounds(colliders, [[MAIN.x0 - 0.45, 0, MAIN.z0 - 0.42], [BATH_DOOR.x0, WALL_H, MAIN.z0]], 'cabin-shell-north-west');
  addBounds(colliders, [[BATH_DOOR.x1, 0, MAIN.z0 - 0.42], [MAIN.x1 + 0.45, WALL_H, MAIN.z0]], 'cabin-shell-north-east');
  addBounds(colliders, [[MAIN.x0 - 0.45, 0, MAIN.z1], [FRONT_DOOR.x0, WALL_H, MAIN.z1 + 0.45]], 'cabin-shell-south-west');
  addBounds(colliders, [[FRONT_DOOR.x1, 0, MAIN.z1], [MAIN.x1 + 0.45, WALL_H, MAIN.z1 + 0.45]], 'cabin-shell-south-east');
  addBounds(colliders, [[MAIN.x0 - 0.45, 0, MAIN.z0 - 0.35], [MAIN.x0, WALL_H, MAIN.z1 + 0.35]], 'cabin-shell-west');
  addBounds(colliders, [[MAIN.x1, 0, MAIN.z0 - 0.35], [MAIN.x1 + 0.45, WALL_H, MAIN.z1 + 0.35]], 'cabin-shell-east');
  addBounds(colliders, [[BATH.x0 - 0.35, 0, BATH.z0 - 0.42], [BATH.x1 + 0.35, WALL_H, BATH.z0]], 'cabin-bath-north');
  addBounds(colliders, [[BATH.x0 - 0.42, 0, BATH.z0], [BATH.x0, WALL_H, BATH.z1]], 'cabin-bath-west');
  addBounds(colliders, [[BATH.x1, 0, BATH.z0], [BATH.x1 + 0.42, WALL_H, BATH.z1]], 'cabin-bath-east');

  buildWindows(structure, M, winS, winW);
  buildRoof(structure, M);
  buildFoundation(structure, M);
  buildInteriorTimbers(structure, M);

  const doorBuilt = makeTimberDoor(M, {
    name: 'cabin-front-door',
    hingeX: FRONT_DOOR.x0 + 0.04,
    hingeZ: MAIN.z1 - 0.03,
    width: FRONT_DOOR.x1 - FRONT_DOOR.x0 - 0.08,
    height: FRONT_DOOR.h - 0.06,
    inwardSign: 1,
  });
  structure.add(doorBuilt.group);
  const doorCollider = addBounds(colliders, [[0, 0, 0], [0, FRONT_DOOR.h, 0]], 'cabin-front-door-leaf');
  for (const cabinCollider of colliders.slice(colliderStart)) {
    ownGeometry(cabinCollider, 'cabin-shell-collision');
  }
  let doorOpen = false;
  let doorTarget = 0;
  let doorT = 0;
  const toggle = (force = undefined) => {
    doorOpen = typeof force === 'boolean' ? force : !doorOpen;
    doorTarget = doorOpen ? 1 : 0;
    return doorOpen;
  };
  const syncCollider = () => {
    const angle = doorBuilt.pivot.rotation.y;
    const hx = doorBuilt.hinge.x;
    const hz = doorBuilt.hinge.z;
    const ex = hx + Math.cos(angle) * doorBuilt.width;
    const ez = hz - Math.sin(angle) * doorBuilt.width;
    doorCollider.min.set(Math.min(hx, ex) - 0.08, 0, Math.min(hz, ez) - 0.08);
    doorCollider.max.set(Math.max(hx, ex) + 0.08, FRONT_DOOR.h, Math.max(hz, ez) + 0.08);
  };
  syncCollider();

  return {
    door: {
      target: doorBuilt.group,
      pivot: doorBuilt.pivot,
      collider: doorCollider,
      get open() { return doorOpen; },
      get openness() { return doorT; },
      toggle,
    },
    updateDoor(dt) {
      doorT += (doorTarget - doorT) * Math.min(1, dt * 7.5);
      if (Math.abs(doorTarget - doorT) < 0.001) doorT = doorTarget;
      doorBuilt.pivot.rotation.y = doorT * 1.38;
      syncCollider();
    },
  };
}

function addCladding(root, M, bounds, face) {
  const [a, b] = bounds;
  const row = 0.255;
  for (let y = a[1] + row / 2; y < b[1] - 0.01; y += row) {
    if (face === 'north' || face === 'south') {
      const z = face === 'north' ? a[2] - 0.035 : b[2] + 0.035;
      root.add(box({
        size: [b[0] - a[0], row * 0.86, 0.075],
        pos: [(a[0] + b[0]) / 2, y, z],
        mat: M.cabinLog,
        cast: false,
      }));
    } else {
      const x = face === 'west' ? a[0] - 0.035 : b[0] + 0.035;
      root.add(box({
        size: [0.075, row * 0.86, b[2] - a[2]],
        pos: [x, y, (a[2] + b[2]) / 2],
        mat: M.cabinLog,
        cast: false,
      }));
    }
  }
}

function buildWindows(root, M, south, west) {
  const frameWindow = ({ name, orientation, a0, a1, y0, y1, fixed }) => {
    const g = group(name);
    const centre = (a0 + a1) / 2;
    const width = a1 - a0;
    const frame = 0.075;
    if (orientation === 'south') {
      for (const x of [a0, a1, centre]) {
        g.add(box({ size: [frame, y1 - y0 + 0.16, 0.10], pos: [x, (y0 + y1) / 2, fixed - 0.02], mat: M.trim }));
      }
      for (const y of [y0, y1]) g.add(box({ size: [width + 0.15, frame, 0.10], pos: [centre, y, fixed - 0.02], mat: M.trim }));
      const glass = plane(width, y1 - y0, M.windowGlass);
      glass.position.set(centre, (y0 + y1) / 2, fixed - 0.04);
      glass.rotation.y = Math.PI;
      glass.name = `${name}-live-forest-glass`;
      g.add(glass);
    } else {
      for (const z of [a0, a1, centre]) {
        g.add(box({ size: [0.10, y1 - y0 + 0.16, frame], pos: [fixed + 0.02, (y0 + y1) / 2, z], mat: M.trim }));
      }
      for (const y of [y0, y1]) g.add(box({ size: [0.10, frame, width + 0.15], pos: [fixed + 0.02, y, centre], mat: M.trim }));
      const glass = plane(width, y1 - y0, M.windowGlass);
      glass.position.set(fixed + 0.04, (y0 + y1) / 2, centre);
      glass.rotation.y = Math.PI / 2;
      glass.name = `${name}-live-forest-glass`;
      g.add(glass);
    }
    g.userData.view = 'live-forest';
    root.add(g);
  };
  frameWindow({ name: 'cabin-south-window', orientation: 'south', a0: south.x0, a1: south.x1, y0: south.y0, y1: south.y1, fixed: MAIN.z1 });
  frameWindow({ name: 'cabin-west-window', orientation: 'west', a0: west.z0, a1: west.z1, y0: west.y0, y1: west.y1, fixed: MAIN.x0 });
}

function buildRoof(root, M) {
  const rise = 2.0;
  const run = (MAIN.z1 - MAIN.z0) / 2 + 0.75;
  const slope = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);
  const centreZ = (MAIN.z0 + MAIN.z1) / 2;
  const ridgeY = WALL_H + rise;
  for (const side of [-1, 1]) {
    const slab = box({
      name: side < 0 ? 'cabin-roof-north' : 'cabin-roof-south',
      size: [MAIN.x1 - MAIN.x0 + 1.35, 0.16, slope],
      pos: [0, WALL_H + rise / 2, centreZ + side * run / 2],
      mat: M.roof,
      rotX: side * angle,
    });
    root.add(slab);
  }
  root.add(box({ size: [MAIN.x1 - MAIN.x0 + 1.45, 0.10, 0.18], pos: [0, ridgeY, centreZ], mat: M.roof }));

  // Lean-to over the bathroom extension.
  const lean = box({
    name: 'cabin-bath-lean-to-roof',
    size: [BATH.x1 - BATH.x0 + 0.65, 0.14, BATH.z1 - BATH.z0 + 0.8],
    pos: [(BATH.x0 + BATH.x1) / 2, WALL_H + 0.18, (BATH.z0 + BATH.z1) / 2 - 0.12],
    mat: M.roof,
    rotX: -0.075,
  });
  root.add(lean);

  // Stone chimney through the north roof plane.
  root.add(box({ size: [0.78, 2.5, 0.72], pos: [4.25, 3.75, -2.8], mat: M.stone }));
  root.add(box({ size: [0.93, 0.16, 0.87], pos: [4.25, 5.02, -2.8], mat: M.stone }));
}

function buildFoundation(root, M) {
  for (let x = MAIN.x0 - 0.1; x <= MAIN.x1 + 0.1; x += 0.62) {
    for (const z of [MAIN.z0 - 0.15, MAIN.z1 + 0.15]) {
      root.add(box({ size: [0.56, 0.30, 0.30], pos: [x, -0.06, z], mat: M.stone, rotY: hashAt(x, z, 4) * 0.12 }));
    }
  }
  for (let z = MAIN.z0 + 0.45; z < MAIN.z1; z += 0.62) {
    for (const x of [MAIN.x0 - 0.15, MAIN.x1 + 0.15]) {
      root.add(box({ size: [0.30, 0.30, 0.56], pos: [x, -0.06, z], mat: M.stone, rotY: hashAt(x, z, 5) * 0.12 }));
    }
  }
}

function buildInteriorTimbers(root, M) {
  for (const x of [MAIN.x0 + 0.18, -3, 0, 3, MAIN.x1 - 0.18]) {
    root.add(box({ size: [0.18, 0.18, MAIN.z1 - MAIN.z0 - 0.35], pos: [x, WALL_H - 0.11, (MAIN.z0 + MAIN.z1) / 2], mat: M.cabinBeam }));
  }
  for (const [x, z] of [[MAIN.x0 + 0.12, MAIN.z0 + 0.12], [MAIN.x1 - 0.12, MAIN.z0 + 0.12], [MAIN.x0 + 0.12, MAIN.z1 - 0.12], [MAIN.x1 - 0.12, MAIN.z1 - 0.12]]) {
    root.add(box({ size: [0.24, WALL_H, 0.24], pos: [x, WALL_H / 2, z], mat: M.cabinBeam }));
  }
}

function makeTimberDoor(M, { name, hingeX, hingeZ, width, height }) {
  const g = group(name);
  const pivot = new THREE.Group();
  pivot.name = `${name}-pivot`;
  pivot.position.set(hingeX, 0, hingeZ);
  const leaf = group(`${name}-leaf`);
  leaf.add(box({ size: [width, height, 0.10], pos: [width / 2, height / 2, 0], mat: M.cabinLogDark }));
  for (const y of [0.25, height / 2, height - 0.25]) {
    leaf.add(box({ size: [width - 0.10, 0.075, 0.035], pos: [width / 2, y, -0.065], mat: M.cabinLog }));
  }
  leaf.add(cylinder({ r: 0.035, h: 0.05, pos: [width - 0.13, 1.08, -0.08], rotX: Math.PI / 2, mat: M.chrome }));
  pivot.add(leaf);
  g.add(pivot);
  return { group: g, pivot, leaf, hinge: new THREE.Vector3(hingeX, 0, hingeZ), width };
}

function buildProperty({
  root,
  M,
  colliders,
  floorZones,
  interaction,
  interactionTargets,
  ctx,
  hud,
  audio,
  disposables,
}) {
  const terrain = buildTerrain(disposables);
  root.add(terrain);

  const trailMat = mat({ color: 0x4b3a27, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
  const loopTrail = makeRibbon(TRAIL_LOOP, 2.45, trailMat, (x, z) => heightAt(x, z) + 0.025, 'cabin-trail-loop');
  const overlookTrail = makeRibbon(OVERLOOK_TRAIL, 2.10, trailMat, (x, z) => heightAt(x, z) + 0.027, 'cabin-overlook-trail');
  root.add(loopTrail, overlookTrail);
  disposables.push(loopTrail.geometry, overlookTrail.geometry);

  const creek = buildCreek(disposables);
  root.add(creek.group);

  const porch = buildPorch(root, M, colliders);
  const bridge = buildBridge(root, M, colliders);
  const shed = buildShed(root, M, colliders);
  const firepit = buildFirepit(root, M);
  const woodpile = buildWoodpile(root, M);
  const car = buildParkedCar(root, M, colliders);
  const forest = buildForest(root, M, colliders, disposables);
  const groundScatter = buildGroundScatter(root, M, colliders, disposables, forest.trees);
  buildPropertyBoundary(root, M, colliders);

  const storyLandmarkIds = new Set(['creek', 'overlook', 'shed', 'firepit']);
  const registerLandmark = (id, target, label, dedicated = null, extra = {}) => {
    target.name ||= `cabin-landmark-${id}`;
    interactionTargets[id] = target;
    const descriptor = {
      label,
      onUse: () => {
        if (storyLandmarkIds.has(id)) ctx.onLandmark?.(id);
        dedicated?.();
      },
      ...extra,
    };
    // Some headless geometry collectors deliberately make register() a pure
    // observation. Keep the descriptor on its owner as the runtime Interface
    // promises, so source/test adapters do not have to impersonate it.
    target.userData.interact = descriptor;
    interaction.register(target, descriptor);
  };

  registerLandmark('porch', porch.target, 'Take in the <b>front porch</b>', () => ctx.onPorch?.());
  registerLandmark('trailhead', makeLandmarkProxy(root, 'trailhead', LANDMARKS.trailhead, 2.4, 1.8), 'Follow the <b>loop trail</b>', () => {
    hud.say?.('The blazes make one circuit of the property and come back here.', 3200);
  });
  registerLandmark('creek', creek.target, 'Listen to the <b>creek</b>', null, {
    onLook: () => audio.play?.('water.splash', {
      position: new THREE.Vector3(LANDMARKS.creek.x, creekWaterAt(LANDMARKS.creek.x, LANDMARKS.creek.z), LANDMARKS.creek.z),
      volume: 0.14,
    }),
  });
  registerLandmark('bridge', bridge.target, 'The old <b>footbridge</b>', () => {
    hud.say?.('Hand-cut cedar, silvered by rain. It holds.', 3000);
  });
  registerLandmark('overlook', makeLandmarkProxy(root, 'overlook', LANDMARKS.overlook, 3.2, 2.0), 'Look out from the <b>ridge</b>');
  registerLandmark('shed', shed.target, 'Check the <b>forestry shed</b>');
  registerLandmark('firepit', firepit.target, 'Sit by the <b>firepit</b>', () => {
    hud.say?.('Dry cedar, old smoke, and nobody close enough to ask questions.', 3800);
  });
  registerLandmark('woodpile', woodpile.target, 'Split some <b>firewood</b>', () => ctx.onWoodpile?.());
  registerLandmark('car', car.target, 'Leave in the <b>wagon</b>', () => {
    if (ctx.onCar) ctx.onCar();
    else ctx.onLeave?.();
  });

  return {
    bridgeY: bridge.y,
    shedY: shed.y,
    counts: {
      trees: forest.counts.trees,
      forestChunks: forest.counts.chunks,
      undergrowth: forest.counts.undergrowth,
      rocks: groundScatter.rocks,
      deadfall: groundScatter.logs,
      trailMetres: Math.round(polylineLength(TRAIL_LOOP) + polylineLength(OVERLOOK_TRAIL)),
      creekMetres: Math.round(polylineLength(CREEK_PATH)),
    },
    setFireLit: firepit.setLit,
    update(dt, elapsed, playerPosition) {
      creek.update(elapsed);
      firepit.update(elapsed);
      forest.update(dt, playerPosition);
    },
  };
}

function buildTerrain(disposables) {
  const step = 2;
  const width = Math.round((PROPERTY.maxX - PROPERTY.minX) / step) + 1;
  const depth = Math.round((PROPERTY.maxZ - PROPERTY.minZ) / step) + 1;
  const positions = new Float32Array(width * depth * 3);
  const colours = new Float32Array(width * depth * 3);
  const colour = new THREE.Color();
  for (let iz = 0; iz < depth; iz++) {
    const z = PROPERTY.minZ + iz * step;
    for (let ix = 0; ix < width; ix++) {
      const x = PROPERTY.minX + ix * step;
      const at = (iz * width + ix) * 3;
      positions[at] = x;
      positions[at + 1] = heightAt(x, z);
      positions[at + 2] = z;
      colour.setHex(surfaceProps(surfaceAt(x, z)).colour);
      const shade = 0.86 + hashAt(x, z, 301) * 0.20;
      colours[at] = colour.r * shade;
      colours[at + 1] = colour.g * shade;
      colours[at + 2] = colour.b * shade;
    }
  }
  const indices = [];
  for (let iz = 0; iz < depth - 1; iz++) {
    for (let ix = 0; ix < width - 1; ix++) {
      const cx = PROPERTY.minX + (ix + 0.5) * step;
      const cz = PROPERTY.minZ + (iz + 0.5) * step;
      if (insideRect(cx, cz, CABIN.main, 0.15) || insideRect(cx, cz, CABIN.bath, 0.15)) continue;
      const a = iz * width + ix;
      const b = a + 1;
      const c = a + width;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'cabin-property-heightfield';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  // The strict geometry collector sees the relief mesh through one large
  // world-space AABB. It is a triangulated surface driven by field.js, not a
  // solid volume or a useful support witness for every prop on the property.
  mesh.userData.geometryGate = {
    overlap: false,
    checkSupport: false,
    checkWallEmbed: false,
  };
  disposables.push(geometry, material);
  return mesh;
}

function makeRibbon(path, width, material, yAt, name, spacing = 2.2) {
  const points = samplePolyline(path, spacing);
  const positions = [];
  const uvs = [];
  const indices = [];
  let walked = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tx0 = next.x - prev.x;
    const tz0 = next.z - prev.z;
    const len = Math.hypot(tx0, tz0) || 1;
    const nx = -tz0 / len;
    const nz = tx0 / len;
    if (i) walked += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    for (const side of [-1, 1]) {
      const x = p.x + nx * width * 0.5 * side;
      const z = p.z + nz * width * 0.5 * side;
      positions.push(x, yAt(x, z), z);
      uvs.push(side < 0 ? 0 : 1, walked / Math.max(1, width));
    }
    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  // A trail or stream ribbon is a triangulated skin whose AABB spans every
  // bend in the route. Treating that box as a solid reports the whole cabin
  // and forest as buried in the path.
  return proceduralSurface(mesh);
}

function buildCreek(disposables) {
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x18383b) },
    uShallow: { value: new THREE.Color(0x5c8b85) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 p = position;
        float wave = sin(p.x * 0.29 + p.z * 0.17 + uTime * 1.4) * 0.018
                   + sin(p.x * 0.11 - p.z * 0.31 - uTime * 0.8) * 0.012;
        p.y += wave;
        vWave = wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        float ripple = 0.5 + 0.5 * sin(vUv.y * 18.0 - uTime * 1.8 + vUv.x * 7.0);
        vec3 colour = mix(uDeep, uShallow, 0.30 + ripple * 0.20 + vWave * 4.0);
        gl_FragColor = vec4(colour, 0.74);
      }
    `,
  });
  const water = makeRibbon(
    CREEK_PATH,
    4.5,
    material,
    (x, z) => creekWaterAt(x, z) + 0.035,
    'cabin-creek-water',
    1.8,
  );
  const g = group('cabin-creek', water);
  const target = makeLandmarkProxy(g, 'creek', LANDMARKS.creek, 3.5, 1.5);
  disposables.push(water.geometry, material);
  return {
    group: g,
    target,
    update(elapsed) { uniforms.uTime.value = elapsed; },
  };
}

function buildPorch(root, M, colliders) {
  const g = group('cabin-porch');
  // It is framed directly into the cabin sill, so the visible join belongs
  // to the same physical assembly rather than reading as intersecting props.
  ownGeometry(g, 'cabin-shell');
  const p = CABIN.porch;
  const cx = (p.x0 + p.x1) / 2;
  const cz = (p.z0 + p.z1) / 2;
  g.add(boxFrom(p.x0, -0.04, p.z0, p.x1, 0.10, p.z1, M.darkWood));
  for (let x = p.x0 + 0.18; x < p.x1; x += 0.34) {
    g.add(box({ size: [0.28, 0.025, p.z1 - p.z0 - 0.08], pos: [x, 0.112, cz], mat: M.lightWood, cast: false }));
  }
  // Two shallow steps make the deck enterable from uneven country.
  g.add(box({ size: [4.0, 0.08, 0.58], pos: [0.6, 0.045, p.z1 + 0.25], mat: M.darkWood }));
  g.add(box({ size: [3.4, 0.055, 0.52], pos: [0.6, 0.02, p.z1 + 0.72], mat: M.darkWood }));
  for (const x of [p.x0 + 0.18, p.x1 - 0.18]) {
    g.add(box({ size: [0.18, 2.75, 0.18], pos: [x, 1.37, p.z1 - 0.20], mat: M.cabinBeam }));
  }
  const awning = box({
    size: [p.x1 - p.x0 + 0.55, 0.12, p.z1 - p.z0 + 0.65],
    pos: [cx, 2.66, cz + 0.12],
    mat: M.roof,
    rotX: 0.08,
  });
  g.add(awning);
  root.add(g);
  const deckCollider = addBounds(colliders, [[p.x0, -0.04, p.z0], [p.x1, 0.10, p.z1]], 'cabin-porch-deck');
  ownGeometry(deckCollider, 'cabin-shell-collision');
  const target = targetBox('cabin-porch-target', [2.4, 1.8, 1.1], [0.2, 0.95, p.z1 - 0.3]);
  g.add(target);
  return { group: g, target };
}

function buildBridge(root, M, colliders) {
  const p = LANDMARKS.bridge;
  const y = bridgeDeckHeight();
  const g = group('cabin-creek-bridge');
  ownGeometry(g, 'cabin-bridge');
  for (let z = p.z - 4.75; z <= p.z + 4.75; z += 0.46) {
    g.add(box({ size: [2.6, 0.16, 0.38], pos: [p.x, y - 0.08, z], mat: M.darkWood, rotY: (hashAt(p.x, z, 33) - 0.5) * 0.025 }));
  }
  // Planked approaches follow the same eased ramp returned by groundAt, so
  // the bridge is walkable from both banks rather than a 70 cm first step.
  for (const side of [-1, 1]) {
    for (let d = 5.05; d <= 7.75; d += 0.44) {
      const z = p.z + side * d;
      const u = THREE.MathUtils.clamp((d - 5.2) / 2.8, 0, 1);
      const eased = u * u * (3 - 2 * u);
      const plankY = THREE.MathUtils.lerp(y, heightAt(p.x, z), eased);
      g.add(box({ size: [2.6, 0.13, 0.38], pos: [p.x, plankY - 0.065, z], mat: M.darkWood }));
    }
  }
  for (const x of [p.x - 1.28, p.x + 1.28]) {
    g.add(box({ size: [0.14, 0.18, 9.7], pos: [x, y - 0.20, p.z], mat: M.cabinBeam }));
    for (const z of [p.z - 4.4, p.z - 2.2, p.z, p.z + 2.2, p.z + 4.4]) {
      g.add(box({ size: [0.12, 1.05, 0.12], pos: [x, y + 0.44, z], mat: M.cabinBeam }));
    }
    g.add(box({ size: [0.12, 0.12, 9.3], pos: [x, y + 0.94, p.z], mat: M.cabinBeam }));
  }
  // Four real piers carry the span down into the creek bed. Besides reading
  // better from the water, these are the bridge's exact support witnesses.
  for (const x of [p.x - 1.08, p.x + 1.08]) {
    for (const z of [p.z - 3.5, p.z + 3.5]) {
      const footY = heightAt(x, z);
      const topY = y - 0.16;
      const h = Math.max(0.24, topY - footY);
      const pier = box({ size: [0.22, h, 0.22], pos: [x, footY + h / 2, z], mat: M.cabinBeam });
      ownGeometry(pier, 'cabin-bridge', { structural: true });
      g.add(pier);
    }
  }
  root.add(g);
  addBounds(colliders, [[p.x - 1.30, y - 0.16, p.z - 4.9], [p.x + 1.30, y, p.z + 4.9]], 'cabin-bridge-deck');
  addBounds(colliders, [[p.x - 1.42, y, p.z - 4.9], [p.x - 1.18, y + 1.05, p.z + 4.9]], 'cabin-bridge-rail-west');
  addBounds(colliders, [[p.x + 1.18, y, p.z - 4.9], [p.x + 1.42, y + 1.05, p.z + 4.9]], 'cabin-bridge-rail-east');
  const target = targetBox('cabin-bridge-target', [2.2, 1.5, 1.7], [p.x, y + 0.75, p.z]);
  g.add(target);
  return { group: g, target, y };
}

function buildShed(root, M, colliders) {
  const p = LANDMARKS.shed;
  const y = heightAt(p.x, p.z) + 0.08;
  const g = group('cabin-forestry-shed');
  ownGeometry(g, 'cabin-shed');
  const x0 = p.x - 3.2;
  const x1 = p.x + 3.2;
  const z0 = p.z - 2.5;
  const z1 = p.z + 2.5;
  const shedFloor = boxFrom(x0, y - 0.12, z0, x1, y, z1, M.darkWood);
  ownGeometry(shedFloor, 'cabin-shed', { structural: true });
  g.add(shedFloor);
  g.add(boxFrom(x0, y, z0, x0 + 0.16, y + 2.45, z1, M.cabinLog));
  g.add(boxFrom(x1 - 0.16, y, z0, x1, y + 2.45, z1, M.cabinLog));
  g.add(boxFrom(x0, y, z0, x1, y + 2.45, z0 + 0.16, M.cabinLog));
  // Front is open in the middle: tools are visible from the trail.
  g.add(boxFrom(x0, y, z1 - 0.16, p.x - 1.05, y + 2.45, z1, M.cabinLog));
  g.add(boxFrom(p.x + 1.05, y, z1 - 0.16, x1, y + 2.45, z1, M.cabinLog));
  g.add(boxFrom(p.x - 1.05, y + 2.05, z1 - 0.16, p.x + 1.05, y + 2.45, z1, M.cabinLog));
  const roof = box({ size: [7.0, 0.14, 5.8], pos: [p.x, y + 2.62, p.z], mat: M.roof, rotX: -0.10 });
  g.add(roof);
  // Axe, bowsaw and fuel cans give it a job, not just walls.
  g.add(box({ size: [0.06, 1.25, 0.06], pos: [p.x - 2.35, y + 0.78, z0 + 0.34], mat: M.lightWood, rotZ: 0.18 }));
  g.add(box({ size: [0.36, 0.18, 0.06], pos: [p.x - 2.48, y + 1.38, z0 + 0.34], mat: M.darkSteel, rotZ: 0.18 }));
  for (const dx of [1.55, 2.18]) g.add(box({ size: [0.42, 0.52, 0.26], pos: [p.x + dx, y + 0.26, z0 + 0.5], mat: mat({ color: 0xa53a27, roughness: 0.7 }) }));
  root.add(g);
  for (const shedCollider of [
    addBounds(colliders, [[x0, y, z0], [x0 + 0.18, y + 2.5, z1]], 'cabin-shed-west'),
    addBounds(colliders, [[x1 - 0.18, y, z0], [x1, y + 2.5, z1]], 'cabin-shed-east'),
    addBounds(colliders, [[x0, y, z0], [x1, y + 2.5, z0 + 0.18]], 'cabin-shed-back'),
  ]) ownGeometry(shedCollider, 'cabin-shed-collision');
  const target = targetBox('cabin-shed-target', [2.0, 1.8, 1.0], [p.x, y + 0.9, z1 - 0.35]);
  g.add(target);
  return { group: g, target, y };
}

function buildFirepit(root, M) {
  const p = LANDMARKS.firepit;
  const y = heightAt(p.x, p.z);
  const g = group('cabin-firepit');
  ownGeometry(g, 'cabin-firepit', { checkSupport: false });
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2;
    g.add(new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.28 + (i % 3) * 0.025, 0),
      M.stone,
    ));
    const stone = g.children[g.children.length - 1];
    stone.position.set(p.x + Math.cos(a) * 1.25, y + 0.15, p.z + Math.sin(a) * 1.25);
    stone.scale.y = 0.62;
    stone.rotation.set(hashAt(i, 1, 2), a, hashAt(i, 2, 3) * 0.3);
    stone.castShadow = true;
  }
  for (const a of [-0.58, 0.58]) {
    g.add(cylinder({ r: 0.14, h: 1.65, pos: [p.x, y + 0.19, p.z], rotZ: Math.PI / 2, rotY: a, mat: M.cabinLogDark }));
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a2d, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
  const flames = [];
  for (const rotY of [0, Math.PI / 2]) {
    const flame = plane(0.72, 1.12, flameMat);
    flame.position.set(p.x, y + 0.70, p.z);
    flame.rotation.y = rotY;
    g.add(flame);
    flames.push(flame);
  }
  const glow = new THREE.PointLight(0xff6a28, 1.45, 12, 2);
  glow.position.set(p.x, y + 1.0, p.z);
  g.add(glow);
  const target = targetBox('cabin-firepit-target', [2.7, 1.5, 2.7], [p.x, y + 0.75, p.z]);
  g.add(target);
  root.add(g);
  let lit = false;
  const setLit = (on) => {
    lit = Boolean(on);
    for (const flame of flames) flame.visible = lit;
    glow.intensity = lit ? 1.45 : 0;
    return lit;
  };
  setLit(false);
  return {
    group: g,
    target,
    get lit() { return lit; },
    setLit,
    update(elapsed) {
      if (!lit) return;
      const flicker = 0.90 + Math.sin(elapsed * 12.3) * 0.08 + Math.sin(elapsed * 19.7) * 0.04;
      glow.intensity = 1.45 * flicker;
      for (let i = 0; i < flames.length; i++) flames[i].scale.y = flicker + i * 0.025;
    },
  };
}

function buildWoodpile(root, M) {
  const p = LANDMARKS.woodpile;
  const y = heightAt(p.x, p.z);
  const g = group('cabin-woodpile');
  ownGeometry(g, 'cabin-woodpile', { checkSupport: false });
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 6 - row; i++) {
      const x = p.x - 1.25 + i * 0.49 + row * 0.24;
      const z = p.z + (i % 2 ? 0.05 : -0.04);
      g.add(cylinder({ r: 0.18, h: 1.05, pos: [x, y + 0.18 + row * 0.31, z], rotX: Math.PI / 2, mat: M.cabinLogDark }));
    }
  }
  // Splitting block and axe.
  g.add(cylinder({ r: 0.40, h: 0.66, pos: [p.x + 2.0, y + 0.33, p.z + 0.45], mat: M.cabinLogDark }));
  g.add(box({ size: [0.05, 1.05, 0.05], pos: [p.x + 2.15, y + 0.95, p.z + 0.45], mat: M.lightWood, rotZ: -0.18 }));
  g.add(box({ size: [0.10, 0.30, 0.34], pos: [p.x + 2.25, y + 1.45, p.z + 0.45], mat: M.darkSteel, rotZ: -0.18 }));
  const target = targetBox('cabin-woodpile-target', [3.6, 1.7, 1.7], [p.x, y + 0.85, p.z]);
  g.add(target);
  root.add(g);
  return { group: g, target };
}

function buildParkedCar(root, M, colliders) {
  const p = LANDMARKS.car;
  const y = heightAt(p.x, p.z) + 0.34;
  const g = group('cabin-parked-wagon');
  ownGeometry(g, 'cabin-parked-wagon');
  const body = mat({ color: 0x33463d, roughness: 0.55, metalness: 0.25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x91a4a6, roughness: 0.16, metalness: 0.25, transparent: true, opacity: 0.72 });
  g.add(box({ size: [2.02, 0.62, 4.55], pos: [p.x, y + 0.45, p.z], mat: body, rotY: 0.18 }));
  g.add(box({ size: [1.82, 0.68, 2.45], pos: [p.x, y + 0.98, p.z - 0.22], mat: body, rotY: 0.18 }));
  for (const dz of [-0.88, 0.88]) {
    const pane = box({ size: [1.84, 0.44, 0.04], pos: [p.x, y + 1.04, p.z + dz], mat: glass, rotY: 0.18 });
    g.add(pane);
  }
  const wheelMat = mat({ color: 0x121313, roughness: 0.95 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 16), wheelMat);
      wheel.position.set(p.x + sx * 0.94, y + 0.02, p.z + sz * 1.45);
      wheel.rotation.z = Math.PI / 2;
      wheel.rotation.y = 0.18;
      wheel.castShadow = true;
      ownGeometry(wheel, 'cabin-parked-wagon', { structural: true });
      g.add(wheel);
    }
  }
  for (const sx of [-0.62, 0.62]) {
    g.add(box({ size: [0.28, 0.18, 0.06], pos: [p.x + sx, y + 0.48, p.z - 2.32], mat: M.ledAmber, rotY: 0.18 }));
  }
  const target = targetBox('cabin-car-departure-target', [2.5, 1.8, 4.9], [p.x, y + 0.9, p.z]);
  g.add(target);
  root.add(g);
  addBounds(colliders, [[p.x - 1.15, y - 0.35, p.z - 2.45], [p.x + 1.15, y + 1.45, p.z + 2.45]], 'cabin-parked-car');
  return { group: g, target };
}

function makeLandmarkProxy(root, id, p, radius = 2, height = 1.8) {
  const y = heightAt(p.x, p.z);
  const target = targetBox(`cabin-${id}-target`, [radius * 2, height, radius * 2], [p.x, y + height / 2, p.z]);
  root.add(target);
  return target;
}

function polylineLength(path) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
  return total;
}

function buildForest(root, M, colliders, disposables) {
  const chunks = new Map();
  const plantedTrees = [];
  const chunkSize = 32;
  const getChunk = (x, z) => {
    const cx = Math.floor((x - PROPERTY.minX) / chunkSize);
    const cz = Math.floor((z - PROPERTY.minZ) / chunkSize);
    const key = `${cx}:${cz}`;
    if (!chunks.has(key)) {
      chunks.set(key, {
        cx,
        cz,
        x: PROPERTY.minX + (cx + 0.5) * chunkSize,
        z: PROPERTY.minZ + (cz + 0.5) * chunkSize,
        trees: [],
        brush: [],
      });
    }
    return chunks.get(key);
  };

  // A jittered grid keeps trunks separated while density still grows and
  // thins naturally. Every random-looking choice is a salted field hash.
  const spacing = 5.35;
  for (let gx = PROPERTY.minX + 3; gx <= PROPERTY.maxX - 3; gx += spacing) {
    for (let gz = PROPERTY.minZ + 3; gz <= PROPERTY.maxZ - 3; gz += spacing) {
      const x = gx + (hashAt(gx, gz, 101) - 0.5) * spacing * 0.68;
      const z = gz + (hashAt(gx, gz, 102) - 0.5) * spacing * 0.68;
      const density = treeDensityAt(x, z);
      if (!density || hashAt(x, z, 103) > density * 0.88) continue;
      const height = 7.8 + hashAt(x, z, 104) * 7.8;
      const radius = 0.13 + hashAt(x, z, 105) * 0.15;
      const kind = hashAt(x, z, 106) < 0.22 ? 'pine' : 'fir';
      const plan = {
        x,
        z,
        y: heightAt(x, z),
        height: kind === 'pine' ? height * 1.07 : height,
        radius,
        yaw: hashAt(x, z, 107) * Math.PI * 2,
        lean: (hashAt(x, z, 108) - 0.5) * 0.035,
        kind,
      };
      getChunk(x, z).trees.push(plan);
      plantedTrees.push(plan);
      addBounds(
        colliders,
        [[x - radius - 0.08, plan.y, z - radius - 0.08], [x + radius + 0.08, plan.y + plan.height, z + radius + 0.08]],
        'cabin-tree-trunk',
      );
    }
  }

  // Ferns, salal and young conifers live only in near LOD.
  const brushStep = 3.15;
  for (let gx = PROPERTY.minX + 2; gx < PROPERTY.maxX - 2; gx += brushStep) {
    for (let gz = PROPERTY.minZ + 2; gz < PROPERTY.maxZ - 2; gz += brushStep) {
      const x = gx + (hashAt(gx, gz, 121) - 0.5) * 2.4;
      const z = gz + (hashAt(gx, gz, 122) - 0.5) * 2.4;
      if (!canPlantTree(x, z, -0.6)) continue;
      if (hashAt(x, z, 123) > 0.31 + treeDensityAt(x, z) * 0.18) continue;
      getChunk(x, z).brush.push({
        x,
        z,
        y: heightAt(x, z),
        scale: 0.42 + hashAt(x, z, 124) * 0.68,
        yaw: hashAt(x, z, 125) * Math.PI * 2,
      });
    }
  }

  const trunkGeometry = new THREE.CylinderGeometry(1, 1, 1, 7);
  const crownGeometry = new THREE.ConeGeometry(1, 1, 8);
  const farCrownGeometry = new THREE.ConeGeometry(1, 1, 6);
  const brushGeometry = new THREE.PlaneGeometry(1, 1);
  const trunkMaterial = mat({ color: 0x3b281a, roughness: 1 });
  const crownMaterial = mat({ color: 0x183321, roughness: 1, side: THREE.DoubleSide });
  const farCrownMaterial = mat({ color: 0x142a1c, roughness: 1 });
  const brushMaterial = new THREE.MeshStandardMaterial({
    color: 0x31502d,
    roughness: 1,
    side: THREE.DoubleSide,
    alphaTest: 0.05,
  });
  disposables.push(trunkGeometry, crownGeometry, farCrownGeometry, brushGeometry, brushMaterial);

  const dummy = new THREE.Object3D();
  const built = [];
  let trees = 0;
  let undergrowth = 0;
  for (const chunk of chunks.values()) {
    const chunkGroup = group(`cabin-forest-chunk-${chunk.cx}-${chunk.cz}`);
    const near = group('forest-near-lod');
    const far = group('forest-far-lod');
    const brushGroup = group('forest-undergrowth-lod');
    chunkGroup.add(near, far, brushGroup);

    if (chunk.trees.length) {
      const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, chunk.trees.length);
      const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, chunk.trees.length * 3);
      const farCrowns = new THREE.InstancedMesh(farCrownGeometry, farCrownMaterial, chunk.trees.length);
      trunks.name = 'cabin-pine-trunks';
      crowns.name = 'cabin-pine-crowns-near';
      farCrowns.name = 'cabin-pine-crowns-far';
      // Needles naturally interlock, and near/far crowns are alternate LODs
      // for the same authored trees. Their instance AABBs are not collision
      // solids and their footing comes from the matching planted trunks.
      proceduralSurface(crowns);
      proceduralSurface(farCrowns);
      let crownAt = 0;
      for (let i = 0; i < chunk.trees.length; i++) {
        const tree = chunk.trees[i];
        dummy.position.set(tree.x, tree.y + tree.height / 2, tree.z);
        dummy.rotation.set(tree.lean, tree.yaw, 0);
        dummy.scale.set(tree.radius, tree.height, tree.radius);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);

        const broad = tree.kind === 'pine' ? 3.5 : 4.2;
        for (let tier = 0; tier < 3; tier++) {
          const tierScale = 1 - tier * 0.17;
          dummy.position.set(tree.x, tree.y + tree.height * (0.52 + tier * 0.17), tree.z);
          dummy.rotation.set(0, tree.yaw + tier * 0.73, 0);
          dummy.scale.set(
            tree.radius * broad * tierScale,
            tree.height * (0.31 - tier * 0.025),
            tree.radius * broad * tierScale,
          );
          dummy.updateMatrix();
          crowns.setMatrixAt(crownAt++, dummy.matrix);
        }

        dummy.position.set(tree.x, tree.y + tree.height * 0.69, tree.z);
        dummy.rotation.set(0, tree.yaw, 0);
        dummy.scale.set(tree.radius * broad * 0.92, tree.height * 0.72, tree.radius * broad * 0.92);
        dummy.updateMatrix();
        farCrowns.setMatrixAt(i, dummy.matrix);
      }
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      farCrowns.instanceMatrix.needsUpdate = true;
      trunks.castShadow = true;
      trunks.receiveShadow = true;
      crowns.castShadow = true;
      farCrowns.castShadow = false;
      near.add(trunks, crowns);
      far.add(farCrowns);
      trees += chunk.trees.length;
    }

    if (chunk.brush.length) {
      const brushA = new THREE.InstancedMesh(brushGeometry, brushMaterial, chunk.brush.length);
      const brushB = new THREE.InstancedMesh(brushGeometry, brushMaterial, chunk.brush.length);
      brushA.name = 'cabin-fern-undergrowth-a';
      brushB.name = 'cabin-fern-undergrowth-b';
      // The crossed planes intentionally occupy the same plant and are
      // planted directly from the deterministic heightfield.
      proceduralSurface(brushA);
      proceduralSurface(brushB);
      for (let i = 0; i < chunk.brush.length; i++) {
        const plant = chunk.brush[i];
        for (const [mesh, extraYaw] of [[brushA, 0], [brushB, Math.PI / 2]]) {
          dummy.position.set(plant.x, plant.y + plant.scale * 0.48, plant.z);
          dummy.rotation.set(0, plant.yaw + extraYaw, 0);
          dummy.scale.set(plant.scale, plant.scale, plant.scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
      }
      brushA.instanceMatrix.needsUpdate = true;
      brushB.instanceMatrix.needsUpdate = true;
      brushA.castShadow = false;
      brushB.castShadow = false;
      brushGroup.add(brushA, brushB);
      undergrowth += chunk.brush.length;
    }

    const d0 = Math.hypot(chunk.x, chunk.z);
    near.visible = d0 < 70;
    far.visible = !near.visible;
    brushGroup.visible = d0 < 54;
    root.add(chunkGroup);
    built.push({ root: chunkGroup, near, far, brush: brushGroup, x: chunk.x, z: chunk.z });
  }

  let visibilityClock = 0;
  let lastX = Infinity;
  let lastZ = Infinity;
  return {
    counts: { trees, undergrowth, chunks: built.length },
    trees: plantedTrees,
    update(dt, playerPosition) {
      visibilityClock += dt;
      if (!playerPosition || visibilityClock < 0.22) return;
      const px = Number(playerPosition.x);
      const pz = Number(playerPosition.z);
      if (!Number.isFinite(px) || !Number.isFinite(pz)) return;
      if (Math.hypot(px - lastX, pz - lastZ) < 3.5 && visibilityClock < 0.8) return;
      visibilityClock = 0;
      lastX = px;
      lastZ = pz;
      for (const chunk of built) {
        const d = Math.hypot(px - chunk.x, pz - chunk.z);
        chunk.root.visible = d < 158;
        chunk.near.visible = d < 66;
        chunk.far.visible = d >= 58;
        chunk.brush.visible = d < 52;
      }
    },
  };
}

function buildGroundScatter(root, M, colliders, disposables, plantedTrees = []) {
  const hitsTree = (x, z, radius) => plantedTrees.some((tree) => (
    Math.hypot(x - tree.x, z - tree.z) < radius + tree.radius + 0.16
  ));
  const rockPlans = [];
  for (let gx = PROPERTY.minX + 6; gx < PROPERTY.maxX - 6; gx += 11.5) {
    for (let gz = PROPERTY.minZ + 6; gz < PROPERTY.maxZ - 6; gz += 11.5) {
      const x = gx + (hashAt(gx, gz, 151) - 0.5) * 7.0;
      const z = gz + (hashAt(gx, gz, 152) - 0.5) * 7.0;
      if (insideRect(x, z, CABIN.pad, 4) || trailFrame(x, z).distance < 2.5) continue;
      if (hashAt(x, z, 153) > 0.34) continue;
      const radius = 0.30 + hashAt(x, z, 154) * 0.80;
      if (hitsTree(x, z, radius * 1.02)) continue;
      rockPlans.push({ x, z, y: heightAt(x, z), radius, yaw: hashAt(x, z, 155) * Math.PI * 2 });
    }
  }
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  const rockMaterial = mat({ color: 0x4c4e49, roughness: 1 });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockPlans.length);
  rocks.name = 'cabin-field-rocks';
  rocks.userData.geometryGate = { checkSupport: false };
  const dummy = new THREE.Object3D();
  for (let i = 0; i < rockPlans.length; i++) {
    const p = rockPlans[i];
    dummy.position.set(p.x, p.y + p.radius * 0.35, p.z);
    dummy.rotation.set(hashAt(p.x, p.z, 156) * 0.5, p.yaw, hashAt(p.x, p.z, 157) * 0.4);
    dummy.scale.set(p.radius, p.radius * (0.48 + hashAt(p.x, p.z, 158) * 0.32), p.radius * (0.75 + hashAt(p.x, p.z, 159) * 0.45));
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    if (p.radius > 0.72) addBounds(
      colliders,
      [[p.x - p.radius * 0.75, p.y, p.z - p.radius * 0.75], [p.x + p.radius * 0.75, p.y + p.radius * 0.75, p.z + p.radius * 0.75]],
      'cabin-field-rock',
    );
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  root.add(rocks);

  const logPlans = [];
  for (let gx = PROPERTY.minX + 10; gx < PROPERTY.maxX - 10; gx += 17.5) {
    for (let gz = PROPERTY.minZ + 10; gz < PROPERTY.maxZ - 10; gz += 17.5) {
      const x = gx + (hashAt(gx, gz, 171) - 0.5) * 9;
      const z = gz + (hashAt(gx, gz, 172) - 0.5) * 9;
      if (!canPlantTree(x, z, 1.0) || hashAt(x, z, 173) > 0.27) continue;
      const length = 2.2 + hashAt(x, z, 174) * 3.2;
      const radius = 0.16 + hashAt(x, z, 175) * 0.16;
      const yaw = hashAt(x, z, 176) * Math.PI * 2;
      const ax = Math.sin(yaw);
      const az = Math.cos(yaw);
      const half = length / 2;
      const hitsStandingTree = plantedTrees.some((tree) => {
        const along = THREE.MathUtils.clamp(
          (tree.x - x) * ax + (tree.z - z) * az,
          -half,
          half,
        );
        const closestX = x + ax * along;
        const closestZ = z + az * along;
        return Math.hypot(tree.x - closestX, tree.z - closestZ) < radius + tree.radius + 0.32;
      });
      if (hitsStandingTree) continue;
      const y0 = heightAt(x - ax * length / 2, z - az * length / 2) + radius;
      const y1 = heightAt(x + ax * length / 2, z + az * length / 2) + radius;
      logPlans.push({ x, z, y: (y0 + y1) / 2, length, radius, yaw, pitch: Math.atan2(y1 - y0, length), ax, az });
    }
  }
  const logGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  const logMaterial = M.cabinLogDark;
  const logs = new THREE.InstancedMesh(logGeometry, logMaterial, logPlans.length);
  logs.name = 'cabin-deadfall';
  logs.userData.geometryGate = { checkSupport: false };
  const up = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3();
  for (let i = 0; i < logPlans.length; i++) {
    const p = logPlans[i];
    axis.set(p.ax * Math.cos(p.pitch), Math.sin(p.pitch), p.az * Math.cos(p.pitch)).normalize();
    dummy.position.set(p.x, p.y, p.z);
    dummy.quaternion.setFromUnitVectors(up, axis);
    dummy.scale.set(p.radius, p.length, p.radius);
    dummy.updateMatrix();
    logs.setMatrixAt(i, dummy.matrix);
    // A single AABB around a diagonal five-metre log blocks and audits its
    // empty corners. Short segments follow the actual cylinder closely.
    const segments = Math.max(4, Math.ceil(p.length / 0.45));
    const segmentLength = p.length / segments;
    for (let segment = 0; segment < segments; segment++) {
      const along = -p.length / 2 + segmentLength * (segment + 0.5);
      const sx = p.x + axis.x * along;
      const sy = p.y + axis.y * along;
      const sz = p.z + axis.z * along;
      const hx = Math.abs(axis.x) * segmentLength / 2 + p.radius;
      const hy = Math.abs(axis.y) * segmentLength / 2 + p.radius;
      const hz = Math.abs(axis.z) * segmentLength / 2 + p.radius;
      const logCollider = addBounds(
        colliders,
        [[sx - hx, sy - hy, sz - hz], [sx + hx, sy + hy, sz + hz]],
        'cabin-deadfall-log',
      );
      ownGeometry(logCollider, `cabin-deadfall-log-collision:${i}`);
    }
  }
  logs.instanceMatrix.needsUpdate = true;
  logs.castShadow = true;
  logs.receiveShadow = true;
  root.add(logs);
  disposables.push(rockGeometry, logGeometry);
  return { rocks: rockPlans.length, logs: logPlans.length };
}

function buildPropertyBoundary(root, M, colliders) {
  const low = -12;
  const high = 22;
  for (const boundaryCollider of [
    addBounds(colliders, [[PROPERTY.minX - 3, low, PROPERTY.minZ - 3], [PROPERTY.minX + 0.5, high, PROPERTY.maxZ + 3]], 'cabin-property-boundary-west'),
    addBounds(colliders, [[PROPERTY.maxX - 0.5, low, PROPERTY.minZ - 3], [PROPERTY.maxX + 3, high, PROPERTY.maxZ + 3]], 'cabin-property-boundary-east'),
    addBounds(colliders, [[PROPERTY.minX - 3, low, PROPERTY.minZ - 3], [PROPERTY.maxX + 3, high, PROPERTY.minZ + 0.5]], 'cabin-property-boundary-north'),
    addBounds(colliders, [[PROPERTY.minX - 3, low, PROPERTY.maxZ - 0.5], [PROPERTY.maxX + 3, high, PROPERTY.maxZ + 3]], 'cabin-property-boundary-south'),
  ]) ownGeometry(boundaryCollider, 'cabin-property-boundary-collision');

  // Weathered corner blazes make the invisible containment legible.
  const g = group('cabin-property-boundary-markers');
  for (const [x, z] of [
    [PROPERTY.minX + 2.2, PROPERTY.minZ + 2.2],
    [PROPERTY.maxX - 2.2, PROPERTY.minZ + 2.2],
    [PROPERTY.minX + 2.2, PROPERTY.maxZ - 2.2],
    [PROPERTY.maxX - 2.2, PROPERTY.maxZ - 2.2],
  ]) {
    const y = heightAt(x, z);
    const markerId = `cabin-property-marker:${x.toFixed(1)}:${z.toFixed(1)}`;
    const post = ownGeometry(
      box({ size: [0.18, 2.2, 0.18], pos: [x, y + 1.1, z], mat: M.cabinBeam }),
      markerId,
      { structural: true },
    );
    const blaze = ownGeometry(
      box({ size: [0.62, 0.34, 0.08], pos: [x, y + 1.65, z], mat: M.cabinLog }),
      markerId,
    );
    g.add(post, blaze);
  }
  root.add(g);
}

function addOutdoorFloorZones(floorZones, bridgeY) {
  const zone = (x0, z0, x1, z1, surface) => floorZones.push({
    box: new THREE.Box3(new THREE.Vector3(x0, -30, z0), new THREE.Vector3(x1, 30, z1)),
    surface,
  });
  zone(CABIN.main.x0, CABIN.main.z0, CABIN.main.x1, CABIN.main.z1, 'wood');
  zone(CABIN.bath.x0, CABIN.bath.z0, CABIN.bath.x1, CABIN.bath.z1, 'tile');
  zone(CABIN.porch.x0, CABIN.porch.z0, CABIN.porch.x1, CABIN.porch.z1 + 0.9, 'wood');
  zone(LANDMARKS.bridge.x - 1.35, LANDMARKS.bridge.z - 8.0, LANDMARKS.bridge.x + 1.35, LANDMARKS.bridge.z + 8.0, 'wood');
  void bridgeY;
  zone(LANDMARKS.shed.x - 3.25, LANDMARKS.shed.z - 2.5, LANDMARKS.shed.x + 3.25, LANDMARKS.shed.z + 2.5, 'wood');
  zone(LANDMARKS.firepit.x - 3.2, LANDMARKS.firepit.z - 3.2, LANDMARKS.firepit.x + 3.2, LANDMARKS.firepit.z + 3.2, 'concrete');
  zone(LANDMARKS.car.x - 8.5, LANDMARKS.car.z - 6.5, LANDMARKS.car.x + 8.5, LANDMARKS.car.z + 6.5, 'gravel');
  for (const path of [TRAIL_LOOP, OVERLOOK_TRAIL]) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      zone(Math.min(a.x, b.x) - 1.45, Math.min(a.z, b.z) - 1.45, Math.max(a.x, b.x) + 1.45, Math.max(a.z, b.z) + 1.45, 'dirt');
    }
  }
  for (let i = 0; i < CREEK_PATH.length - 1; i++) {
    const a = CREEK_PATH[i];
    const b = CREEK_PATH[i + 1];
    zone(Math.min(a.x, b.x) - 3.1, Math.min(a.z, b.z) - 3.1, Math.max(a.x, b.x) + 3.1, Math.max(a.z, b.z) + 3.1, 'puddle');
  }
  zone(-19, -14, 19, 20, 'grass');
  zone(PROPERTY.minX, PROPERTY.minZ, PROPERTY.maxX, PROPERTY.maxZ, 'leaves');
}

function buildDomesticHub({
  root,
  M,
  gear,
  propTexture,
  colliders,
  interaction,
  utilityTargets,
  ticks,
  ctx,
  hud,
  audio,
  time,
  shell,
}) {
  const interior = group('cabin-domestic-hub');
  root.add(interior);

  let propAssemblyOrdinal = 0;
  const addProp = (built, colliderName = '') => {
    const propName = (built.group.name || 'unnamed').replace(/[^A-Za-z0-9._:+-]/g, '-');
    ownGeometry(
      built.group,
      `cabin-prop:${propName}:${++propAssemblyOrdinal}`,
    );
    interior.add(built.group);
    if (built.bounds) addBounds(colliders, built.bounds, colliderName || `cabin-${built.group.name}`);
    return built;
  };
  const proxy = (name, size, pos) => {
    const target = targetBox(name, size, pos);
    interior.add(target);
    return target;
  };

  /* ---------------------------------------------------------------- */
  /* The apartment's practical life, cabin-native in position.       */
  /* ---------------------------------------------------------------- */

  const bed = addProp(P.makeBed(M, { x: -5.05, z: -3.74 }), 'cabin-bed');
  const nightstand = addProp(P.makeNightstand(M, { x: -3.90, z: -4.44 }), 'cabin-nightstand');
  const alarm = P.makeAlarmClock(M, { x: -3.90, y: nightstand.top, z: -4.42, rotY: 2.55 });
  interior.add(alarm.group);

  const desk = addProp(P.makeDesk(M, {
    x: 0.72,
    z: -4.58,
    towerSticker: propTexture('sticker.tower'),
  }), 'cabin-desk');
  const chair = addProp(P.makeChair(M, { x: 0.70, z: -3.70, rotY: Math.PI + 0.10 }), 'cabin-desk-chair');
  const zyn = P.makeZynCan(M, { x: 1.20, y: desk.top, z: -4.40, rotY: 0.4, lidTexture: propTexture('zyn.lid') });
  ownGeometry(zyn.group, 'cabin-prop:zyn');
  interior.add(zyn.group);
  const bobble = P.makeBobblehead(M, { x: 1.66, y: desk.top + 0.008, z: -4.67, rotY: -0.4 });
  ownGeometry(bobble.group, 'cabin-prop:bobblehead');
  interior.add(bobble.group);

  const couch = addProp(P.makeCouch(M, { x: -5.50, z: 2.20 }), 'cabin-couch');
  const coffeeTable = addProp(P.makeCoffeeTable(M, { x: -3.75, z: 2.15, w: 1.18, d: 0.66, rotY: 0.05 }), 'cabin-coffee-table');
  const pizza = P.makePizzaBox(M, { x: -3.82, y: coffeeTable.top, z: 2.10, rotY: 0.10 });
  const bong = P.makeBong(M, { x: -3.42, y: coffeeTable.top, z: 2.22, rotY: -0.2 });
  const shrooms = P.makeMushrooms(M, { x: -4.08, y: coffeeTable.top, z: 2.32, rotY: 0.4 });
  interior.add(pizza.group, bong.group, shrooms.group);

  const tv = addProp(P.makeTv(M, { x: -2.30, z: 2.15, rotY: -Math.PI / 2, w: 1.18 }), 'cabin-tv');
  const tvGlow = new THREE.PointLight(0x8ab6ff, 0, 3.8, 2);
  tvGlow.position.copy(tv.screenPos).add(new THREE.Vector3(-0.45, 0, 0));
  interior.add(tvGlow);

  const sideboard = addProp(P.makeSideboard(M, { x: -0.55, z: 4.58, w: 1.72 }), 'cabin-sideboard');
  const radioPos = new THREE.Vector3(-0.55, sideboard.top + 0.12, 4.52);
  const radio = P.makeRadio(M, { x: radioPos.x, y: sideboard.top, z: radioPos.z, rotY: Math.PI });
  ownGeometry(radio.group, 'cabin-prop:radio');
  interior.add(radio.group);
  const wallClock = P.makeWallClock(M, { x: -1.15, y: 2.38, z: 4.88, rotY: Math.PI });
  ownGeometry(wallClock.group, 'cabin-fixture:wall-clock', { checkSupport: false });
  interior.add(wallClock.group);

  const kitchen = addProp(P.makeKitchen(M, { x: 5.8, wallX: 5.8, z0: -1.78, z1: 1.62 }), 'cabin-kitchen');
  const fridge = addProp(P.makeFridge(M, { x: 5.42, z: 2.62 }), 'cabin-fridge');
  const fridgePos = new THREE.Vector3(5.38, 1.0, 2.62);
  const eggs = P.makeEggCarton(M, {
    x: (fridge.interior.x0 + fridge.interior.x1) / 2,
    y: fridge.interior.shelfY[2] + 0.024,
    z: fridge.interior.z0 + 0.22,
    rotY: Math.PI / 2,
    texture: propTexture('eggs.carton'),
  });
  const milk = P.makeMilkJug(M, {
    x: (fridge.interior.x0 + fridge.interior.x1) / 2,
    y: fridge.interior.shelfY[2] + 0.014,
    z: fridge.interior.z1 - 0.14,
    rotY: -Math.PI / 2,
  });
  const cereal = P.makeCerealBox(M, {
    x: fridge.centre.x,
    y: fridge.top,
    z: fridge.centre.z,
    rotY: -Math.PI / 2 - 0.1,
    texture: propTexture('cereal.box'),
  });
  interior.add(eggs.group, milk.group, cereal.group);

  dressFridgeDoor(fridge, M, gear);

  const panPos = kitchen.hob.clone();
  const pan = P.makePan(M, { x: panPos.x, y: panPos.y, z: panPos.z, rotY: -1.1 });
  interior.add(pan.group);
  const cigsPos = kitchen.spots.smokes.clone();
  const cigs = P.makeCigarettePack(M, { x: cigsPos.x, y: cigsPos.y, z: cigsPos.z, rotY: -0.55 });
  const ashtray = P.makeAshtray(M, { x: kitchen.spots.ashtray.x, y: kitchen.top, z: kitchen.spots.ashtray.z, rotY: 0.3 });
  const whiskeyPos = kitchen.spots.bottle.clone();
  const whiskey = P.makeWhiskeyBottle(M, {
    x: whiskeyPos.x,
    y: whiskeyPos.y,
    z: whiskeyPos.z,
    rotY: -Math.PI / 2 + 0.15,
    labelImage: propTexture('label.whiskey')?.image || null,
  });
  interior.add(cigs.group, ashtray.group, whiskey.group);
  interior.add(P.makeShotGlass(M, { x: kitchen.spots.shot.x, y: kitchen.top, z: kitchen.spots.shot.z }).group);

  const closetBack = gear.get('closet.back');
  const closet = P.makeCloset(M, {
    x0: 4.48,
    x1: 5.72,
    z0: 3.22,
    z1: 4.86,
    h: 2.34,
    architectureAssembly: 'cabin-shell',
    railAssembly: 'cabin-prop:closet-rail',
    garments: [
      { cut: gear.get('closet.shirt.a')?.texture, w: 0.42 },
      { cut: gear.get('closet.shirt.b')?.texture, w: 0.42 },
      { colour: 0x22252a, w: 0.40 },
      { colour: 0x6b655c, w: 0.40 },
    ],
    back: closetBack ? { texture: closetBack.texture, w: 0.48, h: 0.64, y: 1.28 } : null,
  });
  addProp(closet, 'cabin-closet');
  closet.group.traverse((object) => {
    if (object.name !== 'closet-rail') return;
    object.userData.geometryGate = {
      ...(object.userData.geometryGate ?? {}),
      checkSupport: false,
    };
  });

  const shelf = P.makeShelf(M, { x: -2.70, y: 1.34, z: -4.86, w: 1.3, rotY: 0 });
  const books = P.makeBooks(M, { x: -2.96, y: 1.37, z: -4.80, count: 9, along: 'x' });
  const corkboard = P.makeCorkboard(M, { x: 2.65, y: 1.78, z: -4.88, rotY: 0, w: 1.05, h: 0.72 });
  const corkNote = P.makeCorkNote(M, { x: 2.65, y: 1.78, z: -4.84, rotY: 0.03 });
  ownGeometry(corkboard.group, 'cabin-fixture:corkboard', { checkSupport: false });
  ownGeometry(corkNote.group, 'cabin-fixture:cork-note-main', { checkSupport: false });
  interior.add(shelf.group, books.group, corkboard.group, corkNote.group);
  interior.add(P.makeBoots(M, { x: 3.62, z: 4.56, rotY: 0.2 }).group);
  interior.add(P.makeLaundry(M, { x: 3.78, z: 3.68 }).group);
  const plant = addProp(P.makePlant(M, { x: -5.58, z: 4.38, scale: 1.05 }), 'cabin-plant');
  void plant;

  const gluekit = P.makeGlueAndTissues(M, { x: -0.14, y: desk.top, z: -4.42 });
  interior.add(gluekit.group);
  const note = P.makeCorkNote(M, { x: 3.12, y: 1.70, z: -4.84, rotY: -0.03 });
  ownGeometry(note.group, 'cabin-fixture:cork-note-lay-low', { checkSupport: false });
  interior.add(note.group);

  let revolver = null;
  if (ctx.gunUnlocked === true) {
    revolver = P.makeRevolver(M, { x: -3.63, y: coffeeTable.top + 0.015, z: 2.40, rotY: 0.65 });
    interior.add(revolver.group);
  }

  /* ---------------------------------------------------------------- */
  /* Proper bathroom in the north lean-to.                            */
  /* ---------------------------------------------------------------- */

  const bathroom = group('cabin-bathroom');
  interior.add(bathroom);
  bathroom.add(boxFrom(BATH.x0 + 0.03, 0.002, BATH.z0 + 0.03, BATH.x1 - 0.03, 0.016, BATH.z1, M.splash, { cast: false }));
  const tub = P.makeTub(M, { x0: -2.90, z0: -8.12, x1: -1.83, z1: -6.20 });
  const toilet = P.makeToilet(M, { x: -0.74, z: -7.53, rotY: 0 });
  const bathSink = P.makeBathSink(M, { x: -0.55, z: -5.70, rotY: -Math.PI / 2 });
  ownGeometry(bathSink.group, 'cabin-fixture:bath-sink', { checkSupport: false });
  bathroom.add(tub.group, toilet.group, bathSink.group);
  addBounds(colliders, tub.bounds, 'cabin-bath-tub');
  const toiletCollider = addBounds(colliders, toilet.bounds, 'cabin-bath-toilet');
  addBounds(colliders, bathSink.bounds, 'cabin-bath-sink');

  const bathDoorBuilt = makeTimberDoor(M, {
    name: 'cabin-bathroom-door',
    hingeX: BATH_DOOR.x0 + 0.04,
    hingeZ: MAIN.z0 - 0.03,
    width: BATH_DOOR.x1 - BATH_DOOR.x0 - 0.08,
    height: BATH_DOOR.h - 0.05,
  });
  ownGeometry(bathDoorBuilt.group, 'cabin-shell');
  interior.add(bathDoorBuilt.group);
  const bathDoorCollider = addBounds(colliders, [[0, 0, 0], [0, BATH_DOOR.h, 0]], 'cabin-bathroom-door-leaf');
  ownGeometry(bathDoorCollider, 'cabin-shell-collision');

  /* ---------------------------------------------------------------- */
  /* Lighting and persistent domestic state.                          */
  /* ---------------------------------------------------------------- */

  const ceilingFixtures = [
    P.makeCeilingLight(M, { x: -2.0, z: 0.5, y: 2.78 }),
    P.makeCeilingLight(M, { x: 2.7, z: -1.7, y: 2.78 }),
  ];
  const ceilingLights = ceilingFixtures.map((fixture) => {
    ownGeometry(fixture.group, `cabin-fixture:ceiling-light:${fixture.pos.x}`, { checkSupport: false });
    interior.add(fixture.group);
    const light = new THREE.PointLight(0xffd6a0, 0, 7.5, 1.9);
    light.position.copy(fixture.pos);
    interior.add(light);
    return { fixture, light };
  });
  const lamp = P.makeFloorLamp(M, { x: -5.34, z: -1.78 });
  interior.add(lamp.group);
  const lampLight = new THREE.PointLight(0xffc77e, 0, 5.5, 1.9);
  lampLight.position.copy(lamp.pos);
  interior.add(lampLight);
  const bathLight = new THREE.PointLight(0xdfefff, 0, 5.2, 1.8);
  bathLight.position.set(-1.5, 2.55, -6.7);
  bathroom.add(bathLight);

  const inventory = new Inventory(5);
  const state = {
    fridgeOpen: false,
    fridgeT: 0,
    beersLeft: fridge.beerSlots.length,
    milkLeft: 4,
    lightsOn: false,
    ceilingManual: false,
    lampOn: false,
    lampManual: false,
    pcOn: false,
    tapOn: false,
    radioOn: false,
    tvOn: false,
    phoneTaken: false,
    bathDoorOpen: false,
    bathDoorT: 0,
    bathLightOn: false,
    showered: false,
    dressed: false,
    closetOpen: false,
    closetT: 0,
    fed: false,
    hasEggs: false,
    panState: null,
    panCookTime: 0,
    beersDrunk: 0,
    cigsLeft: 17,
    whiskeyLeft: 6,
    zynsLeft: 15,
    rounds: 6,
    spareRounds: 0,
  };
  bindHeldItem(state, inventory);

  const setFridge = (open) => {
    state.fridgeOpen = Boolean(open);
    return state.fridgeOpen;
  };
  const setCeiling = (on, { automatic = false } = {}) => {
    if (automatic && state.ceilingManual) return state.lightsOn;
    state.lightsOn = Boolean(on);
    for (const { fixture, light } of ceilingLights) {
      fixture.bulb.material = state.lightsOn ? M.bulbOn : M.bulbOff;
      light.intensity = state.lightsOn ? 1.05 : 0;
    }
    return state.lightsOn;
  };
  const setLamp = (on, { automatic = false } = {}) => {
    if (automatic && state.lampManual) return state.lampOn;
    state.lampOn = Boolean(on);
    lamp.bulb.material = state.lampOn ? M.bulbOn : M.bulbOff;
    lampLight.intensity = state.lampOn ? 0.92 : 0;
    return state.lampOn;
  };
  const setBathLight = (on) => {
    state.bathLightOn = Boolean(on);
    bathLight.intensity = state.bathLightOn ? 1.0 : 0;
    return state.bathLightOn;
  };
  const setPcOn = (on) => {
    state.pcOn = Boolean(on);
    desk.powerLed.material = state.pcOn ? M.ledGreen : M.bulbOff;
    desk.micLed.material = state.pcOn ? M.ledRed : M.bulbOff;
    desk.sideScreen.material = state.pcOn ? desk.sideOn : desk.sideOff;
    return state.pcOn;
  };

  /* ---------------------------------------------------------------- */
  /* Utility interaction Adapter: geometry never leaks into main.     */
  /* ---------------------------------------------------------------- */

  utilityTargets.frontDoor = shell.door.target;
  interaction.register(shell.door.target, {
    label: () => (shell.door.open ? 'Close the <b>cabin door</b>' : 'Open the <b>cabin door</b>'),
    onUse: () => {
      if (ctx.onFrontDoor) {
        ctx.onFrontDoor();
      } else {
        shell.door.toggle();
        audio.play?.('door.knob', { position: new THREE.Vector3(2.48, 1.05, MAIN.z1), volume: 0.72 });
      }
    },
  });

  let bathDoorWant = 0;
  utilityTargets.bathDoor = bathDoorBuilt.group;
  interaction.register(bathDoorBuilt.group, {
    label: () => (state.bathDoorOpen ? 'Close the <b>bathroom</b>' : 'Open the <b>bathroom</b>'),
    onUse: () => {
      state.bathDoorOpen = !state.bathDoorOpen;
      bathDoorWant = state.bathDoorOpen ? 1 : 0;
      if (state.bathDoorOpen) setBathLight(true);
      audio.play?.('door.knob', { position: new THREE.Vector3(-1.55, 1.0, MAIN.z0), volume: 0.65 });
    },
  });

  const bedTarget = proxy('cabin-bed-target', [1.55, 0.55, 2.10], [-5.03, 0.86, -3.72]);
  utilityTargets.bed = bedTarget;
  interaction.register(bedTarget, {
    label: 'Sit on the <b>bed</b> &middot; hold to <b>rest</b>',
    holdLabel: 'Settling <b>down</b>…',
    hold: 0.58,
    enabled: () => !ctx.isSeated?.(),
    onTap: () => ctx.onBedTap?.(),
    onUse: () => ctx.onBedRest?.(),
  });

  const couchTarget = proxy('cabin-couch-target', [1.0, 0.70, 2.1], [-5.35, 0.82, 2.20]);
  utilityTargets.couch = couchTarget;
  interaction.register(couchTarget, {
    label: 'Sit on the <b>couch</b>',
    enabled: () => !ctx.isSeated?.(),
    onUse: () => ctx.onCouch?.(),
  });

  utilityTargets.desk = desk.panel;
  for (const target of [desk.panel, chair.group]) interaction.register(target, {
    label: () => (state.pcOn ? 'Sit down at the <b>PC</b>' : 'Sit down and wake the <b>PC</b>'),
    onUse: () => ctx.onDesk?.(),
  });

  utilityTargets.tv = tv.group;
  interaction.register(tv.group, {
    label: () => (state.tvOn ? 'Turn off the <b>TV</b> &middot; hold to watch' : 'Turn on the <b>TV</b> &middot; hold to watch'),
    holdLabel: 'Watching the <b>TV</b>…',
    hold: 0.62,
    onTap: () => {
      if (ctx.onTvTap) ctx.onTvTap();
      else state.tvOn = !state.tvOn;
      tvGlow.intensity = state.tvOn ? 0.62 : 0;
    },
    onUse: () => ctx.onTvHold?.(),
  });

  utilityTargets.radio = radio.group;
  interaction.register(radio.group, {
    label: () => (state.radioOn ? 'Turn off the <b>radio</b> &middot; hold to tune' : 'Turn on the <b>radio</b> &middot; hold to tune'),
    holdLabel: 'Tuning the <b>radio</b>…',
    hold: 0.60,
    onTap: () => {
      if (ctx.onRadioTap) ctx.onRadioTap();
      else state.radioOn = !state.radioOn;
    },
    onUse: () => ctx.onRadioHold?.(),
  });

  const phone = P.makePhone(M, { x: -3.88, y: nightstand.top + 0.008, z: -4.38, rotY: -0.4 });
  interior.add(phone.group);
  const phoneTarget = proxy('cabin-phone-target', [0.25, 0.26, 0.28], [-3.88, nightstand.top + 0.12, -4.38]);
  utilityTargets.phone = phoneTarget;
  interaction.register(phoneTarget, {
    label: () => (state.phoneTaken ? 'Use your <b>phone</b>' : 'Pick up your <b>phone</b>'),
    onUse: () => {
      if (ctx.onPhone) {
        ctx.onPhone();
      } else if (!state.phoneTaken && !inventory.full) {
        inventory.add('phone');
      }
      state.phoneTaken = inventory.has('phone');
      phone.group.visible = !state.phoneTaken;
    },
  });

  utilityTargets.fridge = fridge.doorPivot;
  interaction.register(fridge.doorPivot, {
    label: () => (state.fridgeOpen ? 'Close the <b>fridge</b>' : 'Open the <b>fridge</b>'),
    onUse: () => {
      if (ctx.onFridge) ctx.onFridge(!state.fridgeOpen);
      else {
        setFridge(!state.fridgeOpen);
        audio.play?.(state.fridgeOpen ? 'fridge.open' : 'fridge.close', { position: fridgePos, volume: 0.8 });
      }
    },
  });
  fridge.beerSlots.forEach((can) => interaction.register(can, {
    label: 'Take a <b>beer</b>',
    enabled: () => state.fridgeOpen && can.visible && !inventory.full,
    onUse: () => {
      if (!inventory.add('beer')) return;
      can.visible = false;
      state.beersLeft--;
      hud.toast?.('Picked up a beer', 'good');
    },
  }));

  utilityTargets.cigs = cigs.group;
  interaction.register(cigs.group, {
    label: 'Take the <b>smokes</b>',
    enabled: () => cigs.group.visible && !inventory.has('cigs') && !inventory.full,
    onUse: () => {
      if (!inventory.add('cigs')) return;
      cigs.group.visible = false;
      audio.play?.('cig.pack', { volume: 0.5, position: cigsPos });
      hud.toast?.('Picked up the smokes', 'good');
    },
  });

  utilityTargets.whiskey = whiskey.group;
  interaction.register(whiskey.group, {
    label: 'Take the <b>whiskey</b>',
    enabled: () => whiskey.group.visible && !inventory.has('whiskey') && !inventory.full,
    onUse: () => {
      if (!inventory.add('whiskey')) return;
      whiskey.group.visible = false;
      audio.play?.('whiskey.cap', { volume: 0.45, position: whiskeyPos });
      hud.toast?.('Picked up the whiskey', 'good');
    },
  });

  const pizzaTarget = proxy('cabin-pizza-target', [0.38, 0.20, 0.38], [
    pizza.group.position.x,
    coffeeTable.top + 0.08,
    pizza.group.position.z,
  ]);
  utilityTargets.pizza = pizzaTarget;
  interaction.register(pizzaTarget, {
    label: () => (pizza.slicesLeft() ? 'Take a <b>slice</b>' : 'The box is <b>empty</b>'),
    enabled: () => pizza.slicesLeft() > 0 && !inventory.full,
    onUse: () => {
      if (!inventory.add('slice')) return;
      pizza.takeSlice();
      audio.play?.('pizza.take', { volume: 0.5, position: pizza.group.position });
      hud.toast?.('Picked up a slice', 'good');
      hud.say?.('Cold. Still pizza. <em>Hold F to eat it.</em>', 3200);
    },
  });

  const eggTarget = proxy('cabin-eggs-target', [0.38, 0.28, 0.32], [eggs.group.position.x, fridge.interior.shelfY[2] + 0.15, eggs.group.position.z]);
  utilityTargets.eggs = eggTarget;
  interaction.register(eggTarget, {
    label: 'Take the <b>eggs</b>',
    enabled: () => state.fridgeOpen && !state.hasEggs && !state.fed && !inventory.full,
    onUse: () => {
      state.hasEggs = true;
      inventory.add('eggs');
      eggs.group.visible = false;
      hud.toast?.('Picked up the eggs', 'good');
    },
  });

  const panTarget = proxy('cabin-pan-target', [0.42, 0.48, 0.42], [panPos.x, panPos.y + 0.22, panPos.z]);
  utilityTargets.pan = panTarget;
  interaction.register(panTarget, {
    label: () => state.panState === 'done'
      ? 'Eat the <b>eggs</b>'
      : state.panState === 'raw'
        ? 'The eggs are <b>cooking</b>'
        : state.hasEggs ? 'Crack the eggs into the <b>pan</b>' : 'An empty <b>pan</b>',
    onUse: () => {
      if (state.panState === 'done') {
        const result = ctx.onEat?.();
        if (result !== false) {
          state.panState = null;
          state.fed = true;
          pan.cook(0);
        }
      } else if (state.hasEggs && !state.panState) {
        const result = ctx.onCook?.();
        if (result !== false) {
          state.hasEggs = false;
          state.panState = 'raw';
          state.panCookTime = 0;
          inventory.remove('eggs');
          pan.cook(0.12);
        }
      } else if (!state.panState) {
        hud.say?.('There are eggs in the fridge.', 2800);
      }
    },
  });

  utilityTargets.shower = tub.group;
  interaction.register(tub.group, {
    label: () => (state.showered ? 'The <b>shower</b>' : 'Have a <b>shower</b>'),
    onUse: () => {
      const result = ctx.onShower?.();
      if (result !== false) state.showered = true;
    },
  });

  utilityTargets.wardrobe = closet.group;
  interaction.register(closet.group, {
    label: () => (state.closetOpen ? 'Close the <b>wardrobe</b>' : 'Choose clothes from the <b>wardrobe</b>'),
    onUse: () => {
      state.closetOpen = !state.closetOpen;
      const result = ctx.onWardrobe?.(state.closetOpen);
      if (result !== false && state.closetOpen) state.dressed = true;
    },
  });

  utilityTargets.toilet = toilet.group;
  interaction.register(toilet.group, {
    label: 'Use the <b>toilet</b>',
    onUse: () => ctx.onToilet?.(),
  });

  utilityTargets.ceilingLight = ceilingFixtures[0].group;
  interaction.register(ceilingFixtures[0].group, {
    label: () => (state.lightsOn ? 'Cabin lights <b>off</b>' : 'Cabin lights <b>on</b>'),
    onUse: () => {
      state.ceilingManual = true;
      setCeiling(!state.lightsOn);
    },
  });
  utilityTargets.lamp = lamp.group;
  interaction.register(lamp.group, {
    label: () => (state.lampOn ? 'Switch off the <b>lamp</b>' : 'Switch on the <b>lamp</b>'),
    onUse: () => {
      state.lampManual = true;
      setLamp(!state.lampOn);
    },
  });

  utilityTargets.corkboard = note.group;
  interaction.register(note.group, {
    label: 'Read the <b>note</b>',
    onUse: () => hud.say?.('<em>LAY LOW. KEEP THE PHONE CLOSE. DO NOT COME BACK UNTIL LOU CALLS.</em>', 5200),
  });

  if (revolver) {
    utilityTargets.gun = revolver.group;
    interaction.register(revolver.group, {
      label: 'Take the <b>revolver</b>',
      enabled: () => !inventory.has('gun') && !inventory.full,
      onUse: () => {
        inventory.add('gun');
        revolver.group.visible = false;
      },
    });
  }

  const frames = hangCabinArt({ root: interior, M, gear, interaction, ctx, sideboard, nightstand, desk });
  utilityTargets.art = frames.map((frame) => frame.mesh);

  const syncBathDoorCollider = () => {
    const angle = bathDoorBuilt.pivot.rotation.y;
    const hx = bathDoorBuilt.hinge.x;
    const hz = bathDoorBuilt.hinge.z;
    const ex = hx + Math.cos(angle) * bathDoorBuilt.width;
    const ez = hz - Math.sin(angle) * bathDoorBuilt.width;
    bathDoorCollider.min.set(Math.min(hx, ex) - 0.07, 0, Math.min(hz, ez) - 0.07);
    bathDoorCollider.max.set(Math.max(hx, ex) + 0.07, BATH_DOOR.h, Math.max(hz, ez) + 0.07);
  };
  syncBathDoorCollider();

  const bedPose = { position: new THREE.Vector3(-5.02, 0.88, -3.70), yaw: Math.PI };
  const bedExit = new THREE.Vector3(-4.02, 0, -2.75);
  const bedSitPose = {
    position: new THREE.Vector3(-4.70, 1.22, -2.82),
    yaw: -Math.PI / 2,
    pitch: -0.08,
    yawRange: 1.5,
    pitchMin: -0.85,
    pitchMax: 0.70,
  };
  const bedSitExit = new THREE.Vector3(-3.90, 0, -2.72);
  const couchPose = {
    position: new THREE.Vector3(-5.18, 1.13, 2.18),
    yaw: -Math.PI / 2,
    pitch: -0.05,
    yawRange: 1.55,
    pitchMin: -0.85,
    pitchMax: 0.70,
  };
  const couchExit = new THREE.Vector3(-4.20, 0, 2.18);
  const deskPose = { position: new THREE.Vector3(0.68, 1.24, -3.78), yaw: 0, pitch: -0.04 };
  const deskExit = new THREE.Vector3(-0.12, 0, -3.22);

  let secondsReal = 0;
  let shownMinute = -1;
  const update = (dt, elapsed) => {
    state.fridgeT += ((state.fridgeOpen ? 1 : 0) - state.fridgeT) * Math.min(1, dt * 7);
    fridge.doorPivot.rotation.y = -state.fridgeT * 1.42;
    fridge.light.intensity = state.fridgeT * 0.82;

    state.bathDoorT += (bathDoorWant - state.bathDoorT) * Math.min(1, dt * 7);
    bathDoorBuilt.pivot.rotation.y = state.bathDoorT * 1.35;
    syncBathDoorCollider();

    state.closetT += ((state.closetOpen ? 1 : 0) - state.closetT) * Math.min(1, dt * 6);
    for (let i = 0; i < closet.hangers.length; i++) {
      const hanger = closet.hangers[i];
      hanger.mesh.position.x = THREE.MathUtils.lerp(hanger.home, hanger.bunch, state.closetT);
      hanger.mesh.rotation.y = THREE.MathUtils.lerp(hanger.homeYaw, hanger.bunchYaw, state.closetT);
    }

    if (state.panState === 'raw') {
      state.panCookTime += dt;
      const cook = Math.min(1, state.panCookTime / 6.5);
      pan.cook(cook);
      if (cook >= 1) state.panState = 'done';
    }

    if (state.radioOn) {
      radio.needle.position.x = Math.sin(elapsed * 0.7) * 0.052;
      radio.led.material = M.ledRed;
    } else {
      radio.led.material = M.bulbOff;
    }
    bobble.head.rotation.z = Math.sin(elapsed * 1.7) * 0.025;

    const minutes = Math.floor(Number(time.minutes) || 0);
    if (minutes !== shownMinute) {
      shownMinute = minutes;
      const hh = Math.floor(minutes / 60) % 12 || 12;
      const mm = String(minutes % 60).padStart(2, '0');
      alarm.draw(`${hh}:${mm}`);
    }
    const tau = Math.PI * 2;
    wallClock.hourHand.rotation.z = -((minutes % 720) / 720) * tau;
    wallClock.minHand.rotation.z = -((minutes % 60) / 60) * tau;
    secondsReal += dt;
    wallClock.secHand.rotation.z = -((secondsReal % 60) / 60) * tau;
    for (const tick of ticks) tick(dt, elapsed);
  };

  return {
    state,
    inventory,
    fridgePos,
    bathDoorPivot: bathDoorBuilt.pivot,
    bedPose,
    update,
    publicSurface: {
      bedPose,
      bedExit,
      bedLookYaw: yawToward(bedExit, new THREE.Vector3(1.8, 0, -1.0)),
      bedSitPose,
      bedSitExit,
      couchPose,
      couchExit,
      deskPose,
      deskExit,
      screen: desk.screen,
      desk,
      tv,
      tvGlow,
      radioPos,
      radioNeedle: radio.needle,
      phoneProp: phone,
      chair: chair.group,
      fridgePos,
      bathroom: BATH,
      showerStand: tub.standPos,
      showerHead: tub.headPos,
      tubDrain: new THREE.Vector3(tub.standPos.x, 0.03, tub.standPos.z + 0.10),
      toiletSeat: new THREE.Vector3(toilet.bowl.x, 0.98, toilet.bowl.z + 0.06),
      toiletStand: new THREE.Vector3(toilet.bowl.x, 0, toilet.bowl.z + 0.86),
      toiletLid: toilet.lidPivot,
      toiletSeatPivot: toilet.seatPivot,
      toiletBowl: toilet.bowl,
      toiletBowlRadius: toilet.bowlRadius + 0.02,
      toiletWaterY: toilet.waterY,
      toiletCollider,
      pan,
      panPos,
      closet,
      frames,
      pizza,
      coffeeTable,
      coffeeTableRotation: coffeeTable.group.rotation,
      coffeeTableItems: {
        pizza: pizza.group,
        bong: bong.group,
        shrooms: shrooms.group,
        revolver: revolver?.group ?? null,
      },
      gluePos: gluekit.gluePos,
      setPcOn,
      setFridge,
      setCeiling,
      setLamp,
      setBathLight,
    },
  };
}

function dressFridgeDoor(fridge, M, gear) {
  const entries = [
    { slot: 'fridge.magnet', y: 1.48, z: -0.30, w: 0.22, magnet: true },
    { slot: 'fridge.photo.a', y: 1.12, z: -0.50, w: 0.18, magnet: true },
    { slot: 'fridge.photo.b', y: 0.52, z: -0.30, w: 0.17, magnet: true },
    { slot: 'sticker.fridge', y: 0.84, z: -0.48, w: 0.18, sticker: true },
    { slot: 'sticker.fridge.b', y: 1.28, z: -0.13, w: 0.16, sticker: true },
  ];
  for (const entry of entries) {
    const info = gear.get(entry.slot);
    if (!info) continue;
    const h = entry.w / Math.max(0.5, info.aspect || 1);
    const decal = P.makeDecal(M, {
      texture: info.texture,
      w: entry.w,
      h,
      magnet: entry.magnet,
      sticker: entry.sticker,
    });
    // Door exterior faces local -X; turn a +Z decal onto it.
    decal.group.position.set(-0.066, entry.y, entry.z);
    decal.group.rotation.y = -Math.PI / 2;
    fridge.door.add(decal.group);
  }
}

function hangCabinArt({ root, M, gear, interaction, ctx, sideboard, nightstand, desk }) {
  const frames = [];
  const anchors = [];
  const westZ = [-4.42, -3.72, -3.02, -2.30, 1.66, 2.34, 3.04, 3.74, 4.42];
  const eastZ = [-4.36, -3.66, -2.96, -2.24, 2.15, 2.88, 3.60, 4.32];
  for (const y of [1.48, 2.14]) {
    for (const z of westZ) anchors.push({ x: -5.86, y, z, rotY: Math.PI / 2 });
  }
  for (const y of [1.48, 2.14]) {
    for (const z of eastZ) anchors.push({ x: 5.86, y, z, rotY: -Math.PI / 2 });
  }
  for (const x of [-2.60, -1.94, -1.28, -0.62]) {
    anchors.push({ x, y: 2.18, z: BATH.z0 + 0.13, rotY: 0 });
  }

  const registerArt = (target, slot, info) => {
    target.name = `cabin-art:${slot}`;
    // Frames are either wall-fixed or deliberately propped in a precise
    // furnishing slot. Their own backing/frame overlap is one art assembly,
    // and vertical wall support is not inferred by a floor-only check.
    ownGeometry(target, `cabin-art:${slot}`, { checkSupport: false });
    interaction.register(target, {
      label: () => `<b>${info?.title || 'Squatch gear'}</b>`,
      onUse: () => ctx.onArt?.({ slot, ...(info || {}) }),
    });
  };

  CABIN_ART_SLOTS.forEach((slot, i) => {
    const info = gear.get(slot);
    const at = anchors[i];
    if (!info || !at) return;
    const feature = slot.startsWith('feature.');
    const h = feature ? 0.50 : 0.27 + (i % 3) * 0.025;
    const w = h * THREE.MathUtils.clamp(info.aspect || 0.8, 0.55, feature ? 1.65 : 1.45);
    const frame = P.makeFrame(M, { ...at, w, h, texture: info.texture });
    root.add(frame.group);
    registerArt(frame.group, slot, info);
    frames.push({ slot, mesh: frame.group, info });
  });

  // Cloth and crest keep the apartment's non-frame art types intact.
  for (const spec of [
    { slot: 'banner.main', x: -0.35, y: 2.52, z: 4.86, rotY: Math.PI, w: 1.15, h: 0.48 },
    { slot: 'banner.twitch', x: 2.75, y: 2.55, z: -4.86, rotY: 0, w: 0.95, h: 0.40 },
  ]) {
    const info = gear.get(spec.slot);
    if (!info) continue;
    const banner = P.makeBanner(M, { ...spec, texture: info.texture });
    root.add(banner.group);
    registerArt(banner.group, spec.slot, info);
    frames.push({ slot: spec.slot, mesh: banner.group, info, banner: true });
  }
  const crestInfo = gear.get('crest.round');
  if (crestInfo) {
    const crest = P.makeRoundCrest(M, { x: -2.70, y: 2.46, z: -4.86, rotY: 0, r: 0.22, texture: crestInfo.texture });
    root.add(crest.group);
    registerArt(crest.group, 'crest.round', crestInfo);
    frames.push({ slot: 'crest.round', mesh: crest.group, info: crestInfo, crest: true });
  }

  const standing = [
    { slot: 'shelf.photo', x: -2.45, y: 1.37, z: -4.68, rotY: 0.18, h: 0.18 },
    { slot: 'sideboard.photo', x: -0.98, y: sideboard.top, z: 4.50, rotY: Math.PI - 0.25, h: 0.18 },
    { slot: 'desk.photo', x: 0.24, y: desk.top, z: -4.39, rotY: 0.25, h: 0.14 },
    { slot: 'night.photo', x: -4.04, y: nightstand.top, z: -4.30, rotY: -0.85, h: 0.15 },
    // This was in the apartment closet shrine. It remains a deliberately
    // separate, propped photograph rather than becoming generic wall art.
    { slot: 'shrine.b', x: 0.02, y: sideboard.top, z: 4.48, rotY: Math.PI + 0.22, h: 0.19 },
  ];
  for (const spec of standing) {
    const info = gear.get(spec.slot);
    if (!info) continue;
    const w = spec.h * THREE.MathUtils.clamp(info.aspect || 0.78, 0.55, 1.45);
    const frame = P.makeStandingFrame(M, { ...spec, w, texture: info.texture });
    root.add(frame.group);
    registerArt(frame.group, spec.slot, info);
    frames.push({ slot: spec.slot, mesh: frame.group, info, standing: true });
  }

  // The face-up photograph under the bed is intentionally still there.
  const underInfo = gear.get('bed.under');
  if (underInfo) {
    const under = P.makeStandingFrame(M, {
      x: -4.34,
      y: 0.018,
      z: -3.10,
      w: 0.22 * THREE.MathUtils.clamp(underInfo.aspect || 0.75, 0.60, 1.35),
      h: 0.22,
      texture: underInfo.texture,
    });
    under.leg.removeFromParent();
    under.art.parent.rotation.x = 0;
    under.group.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + 0.10);
    root.add(under.group);
    const underTarget = targetBox('cabin-art:bed.under', [0.76, 0.28, 0.82], [-4.10, 0.14, -3.08]);
    root.add(underTarget);
    registerArt(underTarget, 'bed.under', underInfo);
    frames.push({ slot: 'bed.under', mesh: underTarget, artMesh: under.group, info: underInfo, onFloor: true });
  }

  return frames;
}
