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
 *   onLandmark, onDiscover, onDrawingBoard, onCar, onWoodpile, onFirepit, onPorch,
 *   onCreekListen,
 *   onLag, canTalkToLag, onBasementTransition, onBasementInspect.
 */

import * as THREE from 'three';
import { ENVIRONMENT_VISIBILITY } from '../core/environment-visibility.js';
import { markSemanticPlacement } from '../core/semantic-placement.js';
import { markSpatialPrimitive } from '../core/spatial-contract.js';
import { box, boxFrom, cylinder, plane, mat, collider, group, yawToward } from '../world/build.js';
import { makeMaterials } from '../world/materials.js';
import * as P from '../world/props.js';
import { resolveGear } from '../world/gear.js';
import { loadModels } from '../world/models.js';
import { Inventory, bindHeldItem } from '../core/inventory.js';
import { WEAPON_IDS } from '../core/weapons/catalog.js';
import { buildCabinBasement, resolveCabinFloor } from './basement.js';
import { CABIN_CLEANUP_LAYOUT, buildCabinBodyCleanup } from './body-cleanup.js';
import { buildLagActor } from './lag.js';
import { buildCabinShootingRange } from './shooting-range.js';
import {
  PROPERTY,
  CABIN,
  LANDMARKS,
  LANDMARK_VIEWPOINTS,
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

/**
 * THE RIFLES ARE ON THE WALL, AND THEY ARE THERE FROM THE FIRST MINUTE.
 *
 * Owner, cabin playtest: *"Rifles should be accessible before the night time
 * scene.. And the hint at the shooting yard totally gives it away.. Need that
 * not to be the case and have rifles on one of the walls in the cabin. Lot of
 * space. Leave the other ones in the basement as well."*
 *
 * The cellar armory is untouched -- the AK and the Barrett still hang in the
 * dungeon anteroom behind Gratin's door, which is where the second half of the
 * chapter wants them. This is a third rack in the main room, mountable on the
 * hour the player walks in, so the shooting range is a thing he can actually
 * do on the Day Two walk instead of a promissory note about the cellar.
 *
 * WHERE, MEASURED. Every ground-floor collider and every hung frame in the
 * main room was swept for a clear stretch of wall. The north wall east of the
 * desk is the only span with nothing on it at all: the corkboard ends at
 * x 3.195, the Twitch banner at 3.225 (and sits at y 2.35 regardless), and the
 * north-east corner post starts at 5.76. The rack is 1.32 m wide and 1.295 m
 * tall, so 4.50 centres it in that 2.53 m gap with 0.60 m to spare each side
 * and 1.05 m of clear wall above it.
 *
 * `z` puts the backboard's rear face on the wall face at MAIN.z0: the board
 * sits at rack-local z -0.055, so the origin is 0.055 in front of it.
 */
const WALL_RACK_Z_INSET = 0.055;
/* A short carbine, not the cellar's AK or Barrett. Those are the job; this is
 * the hunting rifle that lives in a hunting cabin, and it is the one the range
 * downhill is sighted for. */
const CABIN_WALL_RACK_WEAPON = WEAPON_IDS.CARBINE;

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

function addBounds(colliders, bounds, name, {
  id = name,
  kind,
  ownerActorId,
  blocks,
} = {}) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('Cabin collider requires a stable semantic name');
  }
  if (typeof id !== 'string' || !id.trim()) {
    throw new TypeError(`Cabin collider ${name} requires a stable spatial id`);
  }
  if (typeof kind !== 'string' || !kind.trim()) {
    throw new TypeError(`Cabin collider ${name} requires a spatial kind`);
  }
  const c = collider(bounds[0], bounds[1]);
  c.name = name;
  markSpatialPrimitive(c, {
    id,
    kind,
    ...(ownerActorId ? { ownerActorId } : {}),
    ...(blocks ? { blocks } : {}),
  });
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
  const propertyGroundAt = (x, z) => {
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
  return (x, z, feetY = 0) => resolveCabinFloor(x, z, feetY, propertyGroundAt);
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
  let shootingRange = null;
  shootingRange = buildCabinShootingRange({
    parent: landscapeRoot,
    groundAt,
    bestScore: Number(ctx.rangeBestScore) || 0,
    onEvent: (event) => ctx.onRangeEvent?.(event),
    onInteract: (snapshot) => {
      ctx.onDiscover?.('range');
      const progress = ctx.onLandmark?.('range');
      ctx.onRange?.(shootingRange, progress, snapshot);
    },
  });
  interactionTargets.range = shootingRange.interactTarget;
  shootingRange.interactTarget.userData.interact = shootingRange.interaction;
  interaction.register(shootingRange.interactTarget, shootingRange.interaction);
  colliders.push(...shootingRange.colliders);

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
  const basement = buildCabinBasement({
    root: cabinRoot,
    M,
    colliders,
    occluders,
    interaction,
    utilityTargets,
    wardrobeState: hub.state,
    wardrobe: hub.publicSurface.closet,
    ctx,
  });
  const bodyCleanup = buildCabinBodyCleanup({
    parent: root,
    camera: ctx.camera ?? null,
    groundAt,
    layout: basement.dungeon?.cleanupLayout ?? basement.dungeon?.cleanup?.layout,
    callbacks: {
      onWrap: (id, snapshot) => ctx.onCleanupWrap?.(id, snapshot),
      onCarry: (id, snapshot) => ctx.onCleanupCarry?.(id, snapshot),
      onStage: (id, snapshot) => ctx.onCleanupStage?.(id, snapshot),
      onPlaceAtFire: (id, snapshot) => ctx.onCleanupPlaceAtFire?.(id, snapshot),
      onPourGas: (snapshot) => ctx.onCleanupPourGas?.(snapshot),
      onIgnite: (snapshot) => ctx.onCleanupIgnite?.(snapshot),
    },
    onEvent: (event) => ctx.onCleanupEvent?.(event),
  });
  colliders.push(...bodyCleanup.colliders);

  // The body-cleanup builder publishes presentation-only descriptors. The
  // scene owns campaign truth and explicitly accepts each callback before
  // calling the corresponding mutation method. Fire placement and ignition
  // share one physical target, so register one dynamic descriptor rather than
  // silently replacing one with the other in InteractionSystem.register().
  const cleanupDescriptors = bodyCleanup.interactionDescriptors;
  const registerCleanupRows = (rows, canUse) => {
    for (const [id, descriptor] of Object.entries(rows)) {
      interaction.register(descriptor.target, {
        ...descriptor,
        enabled: () => descriptor.enabled() && canUse(id),
      });
    }
  };
  registerCleanupRows(cleanupDescriptors.wrap, (id) => ctx.canCleanupWrap?.(id) === true);
  registerCleanupRows(cleanupDescriptors.bodies, (id) => ctx.canCleanupCarry?.(id) === true);
  registerCleanupRows(cleanupDescriptors.stage, (id) => ctx.canCleanupStage?.(id) === true);
  interaction.register(cleanupDescriptors.gasCan.target, {
    ...cleanupDescriptors.gasCan,
    enabled: () => cleanupDescriptors.gasCan.enabled() && (ctx.canCleanupPourGas?.() ?? true),
  });
  const cleanupFireDescriptor = {
    label: () => {
      if (cleanupDescriptors.ignition.enabled()) return cleanupDescriptors.ignition.label();
      return cleanupDescriptors.fire.label();
    },
    enabled: () => cleanupDescriptors.fire.enabled() || cleanupDescriptors.ignition.enabled(),
    onUse: () => {
      if (cleanupDescriptors.ignition.enabled()) cleanupDescriptors.ignition.onUse();
      else cleanupDescriptors.fire.onUse();
    },
  };
  interaction.register(cleanupDescriptors.fire.target, cleanupFireDescriptor);
  interactionTargets.cleanupFire = cleanupDescriptors.fire.target;
  interactionTargets.cleanupGas = cleanupDescriptors.gasCan.target;

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
    basement.update(dt, elapsedInternal, playerPosition);
    shootingRange.update(dt);
    bodyCleanup.update(dt);

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
    audio.stopLoop?.('cabin.creek', 0.4);
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
    basement: basement.spawns.down,
    wardrobeReturn: basement.spawns.up,
  };

  const viewpoints = Object.fromEntries(Object.entries(LANDMARK_VIEWPOINTS).map(([id, authored]) => {
    const position = new THREE.Vector3(
      authored.x,
      groundAt(authored.x, authored.z) + 1.68,
      authored.z,
    );
    const lookAt = new THREE.Vector3(
      authored.lookX,
      groundAt(authored.lookX, authored.lookZ) + 0.85,
      authored.lookZ,
    );
    return [id, Object.freeze({
      id,
      position,
      lookAt,
      yaw: yawToward(position, lookAt),
      pitch: authored.pitch,
    })];
  }));
  root.updateMatrixWorld(true);
  const interactionViewpoints = Object.fromEntries(Object.entries(viewpoints).map(([id, viewpoint]) => {
    const target = interactionTargets[id];
    if (!target?.geometry) return [id, viewpoint];
    target.geometry.computeBoundingBox();
    target.updateWorldMatrix(true, false);
    const bounds = target.geometry.boundingBox.clone().applyMatrix4(target.matrixWorld);
    const centre = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const approach = viewpoint.position.clone().sub(centre).setY(0);
    if (approach.lengthSq() < 1e-6) approach.set(0, 0, 1);
    approach.normalize();
    const edgeDistance = Math.min(
      Math.abs(approach.x) > 1e-6 ? size.x / 2 / Math.abs(approach.x) : Infinity,
      Math.abs(approach.z) > 1e-6 ? size.z / 2 / Math.abs(approach.z) : Infinity,
    );
    // The range target is mounted immediately west of a deep firing bench.
    // Give its interaction stance enough east-side clearance for the Player's
    // 0.30 m collision radius; the ordinary landmark gap remains unchanged.
    const standDistance = edgeDistance + (id === 'range' ? 1.34 : 1.20);
    const position = new THREE.Vector3(
      centre.x + approach.x * standDistance,
      0,
      centre.z + approach.z * standDistance,
    );
    position.y = groundAt(position.x, position.z) + 1.68;
    // Aim just inside the nearest target face. Aiming at its centre can miss a
    // broad, low proxy because the 2.7m ray expires before descending enough;
    // starting inside a proxy is equally unreliable because only the far exit
    // face raycasts. This stance remains outside with a generous 1.2m gap.
    const lookAt = bounds.clampPoint(position, new THREE.Vector3()).lerp(centre, 0.08);
    const horizontal = Math.hypot(lookAt.x - position.x, lookAt.z - position.z);
    return [id, Object.freeze({
      id,
      position,
      lookAt,
      yaw: yawToward(position, lookAt),
      pitch: Math.atan2(lookAt.y - position.y, Math.max(0.001, horizontal)),
    })];
  }));
  /* A deterministic close approach for visual proof and accessibility tools.
   * It lives only in interactionViewpoints: Lag is a resident, not another
   * property landmark or optional objective. */
  const lagAt = exterior.lag.group.position;
  const lagPosition = new THREE.Vector3(lagAt.x + 1.45, 0, lagAt.z + 1.15);
  lagPosition.y = groundAt(lagPosition.x, lagPosition.z) + 1.68;
  const lagLookAt = new THREE.Vector3(lagAt.x, lagAt.y + 1.52, lagAt.z);
  const lagHorizontal = Math.hypot(lagLookAt.x - lagPosition.x, lagLookAt.z - lagPosition.z);
  interactionViewpoints.lag = Object.freeze({
    id: 'lag',
    position: lagPosition,
    lookAt: lagLookAt,
    yaw: yawToward(lagPosition, lagLookAt),
    pitch: Math.atan2(lagLookAt.y - lagPosition.y, Math.max(0.001, lagHorizontal)),
  });
  const transitionViewpoint = (id, spawn, target) => {
    target.updateWorldMatrix(true, false);
    const bounds = new THREE.Box3().setFromObject(target);
    const lookAt = bounds.getCenter(new THREE.Vector3());
    const position = spawn.position.clone();
    const horizontal = Math.hypot(lookAt.x - position.x, lookAt.z - position.z);
    return Object.freeze({
      id,
      position,
      lookAt,
      yaw: yawToward(position, lookAt),
      pitch: Math.atan2(lookAt.y - position.y, Math.max(0.001, horizontal)),
    });
  };
  interactionViewpoints.basementEntrance = transitionViewpoint(
    'basementEntrance',
    basement.spawns.up,
    basement.entryTarget,
  );
  interactionViewpoints.basementExit = transitionViewpoint(
    'basementExit',
    basement.spawns.down,
    basement.exitTarget,
  );
  Object.assign(interactionViewpoints, basement.inspectionViewpoints ?? {});
  Object.assign(interactionViewpoints, basement.dungeon?.viewpoints ?? {});

  const landscape = Object.freeze({
    bounds: PROPERTY,
    trail: Object.freeze({ loop: TRAIL_LOOP, overlook: OVERLOOK_TRAIL }),
    creek: CREEK_PATH,
    bridgeY: exterior.bridgeY,
    counts: Object.freeze({ ...exterior.counts }),
    footings: Object.freeze(exterior.footings.map((entry) => Object.freeze({ ...entry }))),
    lod: Object.freeze({
      near: ENVIRONMENT_VISIBILITY.wildernessHub.nearFoliage,
      undergrowth: ENVIRONMENT_VISIBILITY.wildernessHub.undergrowth,
      far: ENVIRONMENT_VISIBILITY.wildernessHub.farFoliage,
      chunk: ENVIRONMENT_VISIBILITY.wildernessHub.chunkSize,
    }),
  });

  const landmarkMetadata = Object.fromEntries(Object.entries(LANDMARKS).map(([id, landmark]) => {
    const point = new THREE.Vector3(landmark.x, groundAt(landmark.x, landmark.z), landmark.z);
    return [id, {
      ...landmark,
      id,
      point,
      position: point,
      viewpoint: viewpoints[id] ?? null,
      interactionViewpoint: interactionViewpoints[id] ?? null,
    }];
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
    viewpoints,
    observationViewpoints: viewpoints,
    interactionViewpoints,
    utilityTargets,
    carTarget: interactionTargets.car,
    lag: exterior.lag,
    wallRack: Object.freeze({
      racks: Object.freeze([Object.freeze({
        id: CABIN_WALL_RACK_WEAPON,
        x: 4.50,
        y: CABIN.floorY,
        z: MAIN.z0 + WALL_RACK_Z_INSET,
        rotY: 0,
      })]),
    }),
    splitWood: exterior.splitWood,
    woodpileState: exterior.woodpileState,
    setFireLit: exterior.setFireLit,
    shootingRange,
    bodyCleanup,
    cleanup: bodyCleanup,
    basement,
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
    if (exteriorFace) {
      for (const span of exteriorSpansOf(bounds, exteriorFace)) addCladding(structure, M, span, exteriorFace);
    }
    return mesh;
  };

  /* THE NORTH WALL IS ONLY EXTERIOR WHERE THE BATHROOM ISN'T BEHIND IT.
   *
   * Owner, cabin playtest: *"Exterior wall around the bathroom is coming into
   * the interior."*
   *
   * The bathroom is a lean-to hung off the main room's north face, x -3.05 to
   * -0.05. Its own three walls are clad correctly, on their outside. The main
   * room's north wall is a PARTY wall over that span -- and it was clad along
   * its whole 12 m length regardless, so horizontal log siding hung on the
   * inside of the bathroom's south wall. Measured in the built cabin: 26
   * boards, each standing 0.0725 m proud of the wall face at z = -5.20, in
   * three bands -- x -3.05..-2.12 and -1.02..-0.05 from the two wall halves,
   * plus the full 1.10 m of the door header directly over the bathroom door.
   * Floor to ceiling, the entire 3.0 m width of the room.
   *
   * `exteriorSpansOf` clips a north face to the stretches that genuinely face
   * outdoors, and returns nothing at all for the header, which does not.
   */
  const exteriorSpansOf = ([a, b], face) => {
    if (face !== 'north' || b[0] <= BATH.x0 || a[0] >= BATH.x1) return [[a, b]];
    const spans = [];
    if (a[0] < BATH.x0) spans.push([a, [BATH.x0, b[1], b[2]]]);
    if (b[0] > BATH.x1) spans.push([[BATH.x1, a[1], a[2]], b]);
    return spans;
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
  addBounds(colliders, [[MAIN.x0 - 0.45, 0, MAIN.z0 - 0.42], [BATH_DOOR.x0, WALL_H, MAIN.z0]], 'cabin-shell-north-west', { kind: 'world' });
  addBounds(colliders, [[BATH_DOOR.x1, 0, MAIN.z0 - 0.42], [MAIN.x1 + 0.45, WALL_H, MAIN.z0]], 'cabin-shell-north-east', { kind: 'world' });
  addBounds(colliders, [[MAIN.x0 - 0.45, 0, MAIN.z1], [FRONT_DOOR.x0, WALL_H, MAIN.z1 + 0.45]], 'cabin-shell-south-west', { kind: 'world' });
  addBounds(colliders, [[FRONT_DOOR.x1, 0, MAIN.z1], [MAIN.x1 + 0.45, WALL_H, MAIN.z1 + 0.45]], 'cabin-shell-south-east', { kind: 'world' });
  addBounds(colliders, [[MAIN.x0 - 0.45, 0, MAIN.z0 - 0.35], [MAIN.x0, WALL_H, MAIN.z1 + 0.35]], 'cabin-shell-west', { kind: 'world' });
  addBounds(colliders, [[MAIN.x1, 0, MAIN.z0 - 0.35], [MAIN.x1 + 0.45, WALL_H, MAIN.z1 + 0.35]], 'cabin-shell-east', { kind: 'world' });
  addBounds(colliders, [[BATH.x0 - 0.35, 0, BATH.z0 - 0.42], [BATH.x1 + 0.35, WALL_H, BATH.z0]], 'cabin-bath-north', { kind: 'world' });
  addBounds(colliders, [[BATH.x0 - 0.42, 0, BATH.z0], [BATH.x0, WALL_H, BATH.z1]], 'cabin-bath-west', { kind: 'world' });
  addBounds(colliders, [[BATH.x1, 0, BATH.z0], [BATH.x1 + 0.42, WALL_H, BATH.z1]], 'cabin-bath-east', { kind: 'world' });

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
  const doorCollider = addBounds(
    colliders,
    [[0, 0, 0], [0, FRONT_DOOR.h, 0]],
    'cabin-front-door-leaf',
    { kind: 'door' },
  );
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

  /* Stone chimney through the north roof plane. The old 2.5 m stack started
   * at y=2.50, more than half a metre below the cabin ceiling, so the exterior
   * stack became a large block hanging over the kitchen. Keep enough masonry
   * below the roof skin to close the penetration without putting any of the
   * stack in the room. */
  root.add(box({
    name: 'cabin-roof-chimney-stack',
    size: [0.78, 1.50, 0.72],
    pos: [4.25, 4.30, -2.8],
    mat: M.stone,
  }));
  root.add(box({
    name: 'cabin-roof-chimney-cap',
    size: [0.93, 0.16, 0.87],
    pos: [4.25, 5.08, -2.8],
    mat: M.stone,
  }));
}

function buildFoundation(root, M) {
  for (let x = MAIN.x0 - 0.1; x <= MAIN.x1 + 0.1; x += 0.62) {
    for (const z of [MAIN.z0 - 0.15, MAIN.z1 + 0.15]) {
      /* Same lean-to, same rule as the cladding above: the north perimeter
       * piers run under the bathroom floor over x -3.05..-0.05, where they
       * are not a perimeter at all. Measured before this clip, five of them
       * stood 0.09 m proud of a bathroom floor laid at 0.016 -- rough field
       * stone indoors, along the whole width of the wall. */
      if (z < MAIN.z0 && x > BATH.x0 - 0.28 && x < BATH.x1 + 0.28) continue;
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
  const footings = [];
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
  const firepit = buildFirepit(root, M, colliders, footings);
  const woodpile = buildWoodpile(root, M);
  /* Lag is a person, not a marker: the shared Npc/makePerson rig supplies his
   * outfit, mouth, gaze and staging identity. He stands just outside the broad
   * woodpile proxy so looking at him cannot accidentally select the activity
   * box behind him. */
  const lagX = LANDMARKS.woodpile.x + 2.35;
  const lagZ = LANDMARKS.woodpile.z + 1.65;
  const lag = buildLagActor({
    scene: root,
    x: lagX,
    y: heightAt(lagX, lagZ),
    z: lagZ,
    /* HE FACES THE BLOCK, AND HE WAS NOT.
     *
     * `yawToward` is the PLAYER's convention -- `atan2(-dx, -dz)`, because a
     * camera looks down its own -Z. A `makePerson` figure's face is on +Z and
     * `Npc.faceToward` uses `atan2(dx, dz)`, so handing an Npc a yawToward
     * result aims it exactly 180 degrees wrong. This call names the splitting
     * block as its target and then turned its back on it: measured in the
     * built world, the round on the block sat at Lag-local z = -1.2787, dead
     * behind him, while he swung at open ground. */
    yaw: Math.atan2(
      LANDMARKS.woodpile.x + 2.0 - lagX,
      LANDMARKS.woodpile.z + 0.45 - lagZ,
    ),
  });
  addBounds(
    colliders,
    [[lagX - 0.28, heightAt(lagX, lagZ), lagZ - 0.28], [lagX + 0.28, heightAt(lagX, lagZ) + 1.86, lagZ + 0.28]],
    'cabin-lag-body',
    { kind: 'actor-body', ownerActorId: 'cabin.lag' },
  );
  const car = buildParkedCar(root, M, colliders);
  const overlook = buildOverlook(root, M, colliders, footings);
  const wayfinding = buildTrailWayfinding(root, M, footings);
  const forest = buildForest(root, M, colliders, disposables);
  const groundScatter = buildGroundScatter(root, M, colliders, disposables, forest.trees);
  buildPropertyBoundary(root, M, colliders);

  const storyLandmarkIds = new Set(['creek', 'overlook', 'shed']);
  const registerLandmark = (id, target, label, dedicated = null, extra = {}) => {
    target.name ||= `cabin-landmark-${id}`;
    interactionTargets[id] = target;
    /* A wide aim volume standing over other things is exactly what
     * `InteractionSystem`'s `soft` flag is for: it is taken only when nothing
     * solid was found anywhere along the same ray, so the footbridge inside
     * the creek's volume, and the pyre and the two men inside the firepit's,
     * still win the crosshair. Every proxy sized by `makeLandmarkProxy` — and
     * the firepit, sized by the same rule — declares itself. */
    const descriptor = {
      ...(target.userData?.softAimVolume ? { soft: true } : {}),
      label,
      onUse: () => {
        ctx.onDiscover?.(id);
        const progress = storyLandmarkIds.has(id) ? ctx.onLandmark?.(id) : null;
        dedicated?.(progress);
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
  registerLandmark('trailhead', makeLandmarkProxy(root, 'trailhead', LANDMARKS.trailhead, 2.4), 'Follow the <b>loop trail</b>', () => {
    hud.say?.('The blazes make one circuit of the property and come back here.', 3200);
  });
  registerLandmark('creek', creek.target, 'Listen to the <b>creek</b>', () => ctx.onCreekListen?.(), {
    hold: 0.55,
    holdLabel: 'Listening to the <b>creek</b>…',
    onLook: () => audio.play?.('water.splash', {
      position: new THREE.Vector3(LANDMARKS.creek.x, creekWaterAt(LANDMARKS.creek.x, LANDMARKS.creek.z), LANDMARKS.creek.z),
      volume: 0.14,
    }),
  });
  registerLandmark('bridge', bridge.target, 'The old <b>footbridge</b>', () => {
    hud.say?.('Hand-cut cedar, silvered by rain. It holds.', 3000);
  });
  registerLandmark('overlook', overlook.target, 'Look out from the <b>ridge</b>');
  registerLandmark('shed', shed.target, 'Check the <b>forestry shed</b>');
  registerLandmark('firepit', firepit.target, 'Tend the <b>firepit</b>', (progress) => {
    if (ctx.onFirepit) ctx.onFirepit(progress);
    else hud.say?.('Dry cedar, old smoke, and nobody close enough to ask questions.', 3800);
  }, {
    enabled: () => ctx.canUseOrdinaryFirepit?.() ?? true,
  });
  registerLandmark('woodpile', woodpile.target, 'Split some <b>firewood</b>', () => ctx.onWoodpile?.(), {
    holdLabel: 'Lining up the <b>axe</b>…',
    hold: 0.68,
  });
  registerLandmark('car', car.target, 'Leave in the <b>wagon</b>', () => {
    if (ctx.onCar) ctx.onCar();
    else ctx.onLeave?.();
  });

  const lagDescriptor = {
    label: 'Talk to <b>Lag</b>',
    enabled: () => ctx.canTalkToLag?.() ?? true,
    onUse: () => ctx.onLag?.(lag),
  };
  interactionTargets.lag = lag.group;
  lag.group.userData.interact = lagDescriptor;
  interaction.register(lag.group, lagDescriptor);

  return {
    bridgeY: bridge.y,
    shedY: shed.y,
    counts: {
      trees: forest.counts.trees,
      treeSpecies: forest.counts.species,
      forestChunks: forest.counts.chunks,
      undergrowth: forest.counts.undergrowth,
      saplings: forest.counts.saplings,
      rocks: groundScatter.rocks,
      deadfall: groundScatter.logs,
      stumps: groundScatter.stumps,
      trailBlazes: wayfinding.blazes,
      duskBeacons: wayfinding.beacons,
      firepitSeats: firepit.seatCount,
      overlookSeats: overlook.seatCount,
      overlookVistaFeatures: overlook.vistaFeatures,
      residents: 1,
      lagActivities: 4,
      exteriorFootings: footings.length,
      trailMetres: Math.round(polylineLength(TRAIL_LOOP) + polylineLength(OVERLOOK_TRAIL)),
      creekMetres: Math.round(polylineLength(CREEK_PATH)),
    },
    footings,
    lag,
    splitWood: woodpile.split,
    woodpileState: woodpile.state,
    setFireLit: firepit.setLit,
    update(dt, elapsed, playerPosition) {
      creek.update(elapsed);
      firepit.update(elapsed);
      woodpile.update(dt);
      lag.update(dt, playerPosition);
      wayfinding.update(elapsed);
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
  const sunlight = new THREE.Color(0xd8c99d);
  const surfaces = new Set();
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let iz = 0; iz < depth; iz++) {
    const z = PROPERTY.minZ + iz * step;
    for (let ix = 0; ix < width; ix++) {
      const x = PROPERTY.minX + ix * step;
      const at = (iz * width + ix) * 3;
      positions[at] = x;
      /* Keep the heightfield continuous under the building instead of
       * deleting coarse 2 m cells around its outline. The cabin floor hides
       * these vertices; lowering them avoids z-fighting while the connected
       * edge triangles guarantee there is no blue void beside the foundation. */
      const underBuilding = insideRect(x, z, CABIN.main, 0.02)
        || insideRect(x, z, CABIN.bath, 0.02);
      positions[at + 1] = heightAt(x, z) - (underBuilding ? 0.08 : 0);
      positions[at + 2] = z;
      const surface = surfaceAt(x, z);
      surfaces.add(surface);
      colour.setHex(surfaceProps(surface).colour)
        .lerp(sunlight, hashAt(x, z, 302) * 0.035);
      const shade = 0.92 + hashAt(x, z, 301) * 0.16;
      colours[at] = colour.r * shade;
      colours[at + 1] = colour.g * shade;
      colours[at + 2] = colour.b * shade;
      minHeight = Math.min(minHeight, positions[at + 1]);
      maxHeight = Math.max(maxHeight, positions[at + 1]);
    }
  }
  const indices = [];
  for (let iz = 0; iz < depth - 1; iz++) {
    for (let ix = 0; ix < width - 1; ix++) {
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
  mesh.userData.cabinTerrain = Object.freeze({
    sampleSpacing: step,
    minHeight,
    maxHeight,
    relief: maxHeight - minHeight,
    surfaceCount: surfaces.size,
  });
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
  const target = makeLandmarkProxy(g, 'creek', LANDMARKS.creek, 3.5);
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
  const deckCollider = addBounds(
    colliders,
    [[p.x0, -0.04, p.z0], [p.x1, 0.10, p.z1]],
    'cabin-porch-deck',
    { kind: 'world' },
  );
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
  /* Owner, cabin playtest: "The collision on the bridge is weird going over
   * the creek."
   *
   * The deck box was a blocking world volume laid over the SAME footprint
   * `makeGroundAt` already publishes as the walking surface, and the player
   * capsule cannot be pushed out of a box it is standing inside. Measured
   * headlessly with the real `Player` at 60 Hz, walking straight up the
   * planked approach at x = 4.000:
   *
   *   from the south bank  stopped dead at z = -31.802, jittering 2.2 cm
   *   from the north bank  stopped dead at z = -42.212, jittering 2.2 cm
   *
   * (the deck spans z -41.920 to -32.080, so both stops are exactly the box
   * face plus the 0.30 m capsule radius: he never set foot on the span.)
   * Dropped onto the deck centre instead, `_resolve`'s dead-centre ejection
   * fired every frame and shot him sideways from x 4.000 to x 5.740 — out
   * through the east rail and into the creek, feet -1.878 against a deck at
   * -0.933.
   *
   * The deck is CONTAINMENT, not a wall: it caps the creek gap flush with the
   * floor `groundAt` already returns across |x-4| <= 1.35, |z+37| <= 5.2. So
   * it keeps its volume for sight and bullets and stops pushing the capsule.
   * After: he crosses the full 9.8 m span at a constant x = 4.000. */
  addBounds(colliders, [[p.x - 1.30, y - 0.16, p.z - 4.9], [p.x + 1.30, y, p.z + 4.9]], 'cabin-bridge-deck', {
    kind: 'world',
    blocks: { collision: false, vision: true, navigation: true, ballistics: true },
  });
  addBounds(colliders, [[p.x - 1.42, y, p.z - 4.9], [p.x - 1.18, y + 1.05, p.z + 4.9]], 'cabin-bridge-rail-west', { kind: 'world' });
  addBounds(colliders, [[p.x + 1.18, y, p.z - 4.9], [p.x + 1.42, y + 1.05, p.z + 4.9]], 'cabin-bridge-rail-east', { kind: 'world' });
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
  /* All four shed walls have a level 2.45 m top plate. A tilted single slab
   * can only touch one of those plates; the opposite edge was visibly floating.
   * This compact forestry shed gets a level roof that overlaps every plate by
   * three centimetres, rather than pretending the rectangular walls are raked. */
  const roof = box({
    name: 'cabin-forestry-shed-roof',
    size: [7.0, 0.14, 5.8],
    pos: [p.x, y + 2.49, p.z],
    mat: M.roof,
  });
  g.add(roof);
  // Axe, bowsaw and fuel cans give it a job, not just walls.
  g.add(box({ size: [0.06, 1.25, 0.06], pos: [p.x - 2.35, y + 0.78, z0 + 0.34], mat: M.lightWood, rotZ: 0.18 }));
  g.add(box({ size: [0.36, 0.18, 0.06], pos: [p.x - 2.48, y + 1.38, z0 + 0.34], mat: M.darkSteel, rotZ: 0.18 }));
  for (const dx of [1.55, 2.18]) g.add(box({ size: [0.42, 0.52, 0.26], pos: [p.x + dx, y + 0.26, z0 + 0.5], mat: mat({ color: 0xa53a27, roughness: 0.7 }) }));
  root.add(g);
  for (const shedCollider of [
    addBounds(colliders, [[x0, y, z0], [x0 + 0.18, y + 2.5, z1]], 'cabin-shed-west', { kind: 'world' }),
    addBounds(colliders, [[x1 - 0.18, y, z0], [x1, y + 2.5, z1]], 'cabin-shed-east', { kind: 'world' }),
    addBounds(colliders, [[x0, y, z0], [x1, y + 2.5, z0 + 0.18]], 'cabin-shed-back', { kind: 'world' }),
  ]) ownGeometry(shedCollider, 'cabin-shed-collision');
  const target = targetBox('cabin-shed-target', [2.0, 1.8, 1.0], [p.x, y + 0.9, z1 - 0.35]);
  g.add(target);
  return { group: g, target, y };
}

function buildFirepit(root, M, colliders, footings) {
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
  const seatAngles = [0.15, 2.25, 4.35];
  for (let i = 0; i < seatAngles.length; i++) {
    const angle = seatAngles[i];
    const x = p.x + Math.cos(angle) * 3.15;
    const z = p.z + Math.sin(angle) * 3.15;
    const seatY = heightAt(x, z);
    const bench = group(`cabin-firepit-bench-${i}`);
    bench.position.set(x, seatY, z);
    bench.rotation.y = Math.PI / 2 - angle;
    ownGeometry(bench, `cabin-firepit-seat:${i}`, { checkSupport: false });
    bench.add(box({ size: [1.90, 0.16, 0.48], pos: [0, 0.52, 0], mat: M.cabinLog }));
    bench.add(box({ size: [1.90, 0.15, 0.20], pos: [0, 0.91, 0.30], mat: M.cabinLogDark }));
    for (const lx of [-0.64, 0.64]) {
      bench.add(box({ size: [0.18, 0.52, 0.24], pos: [lx, 0.26, 0], mat: M.cabinLogDark }));
      bench.add(box({ size: [0.14, 0.48, 0.14], pos: [lx, 0.72, 0.30], mat: M.cabinLogDark }));
    }
    g.add(bench);
    addBounds(
      colliders,
      [[x - 1.02, seatY, z - 1.02], [x + 1.02, seatY + 1.02, z + 1.02]],
      `cabin-firepit-bench-${i}`,
      { kind: 'seat' },
    );
    noteFooting(footings, `firepit-bench-${i}`, x, z, seatY, 'firepit-seat');
  }
  // Layered low-poly tongues read as a fire from every approach. Flat crossed
  // cards showed their rectangular silhouette whenever the player faced one
  // head-on, which made the otherwise grounded fire ring look unfinished.
  const flameOuter = new THREE.MeshBasicMaterial({ color: 0xff6424, transparent: true, opacity: 0.82, depthWrite: false });
  const flameInner = new THREE.MeshBasicMaterial({ color: 0xffc04a, transparent: true, opacity: 0.92, depthWrite: false });
  const flamePlans = [
    { x: 0, z: 0, radius: 0.36, height: 1.08, material: flameOuter, tilt: 0 },
    { x: -0.22, z: 0.08, radius: 0.20, height: 0.72, material: flameOuter, tilt: -0.24 },
    { x: 0.23, z: -0.06, radius: 0.18, height: 0.66, material: flameOuter, tilt: 0.27 },
    { x: 0.02, z: 0.02, radius: 0.19, height: 0.74, material: flameInner, tilt: 0.04 },
  ];
  const flames = flamePlans.map((plan, index) => {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(plan.radius, plan.height, 7), plan.material);
    flame.name = `cabin-fire-tongue-${index}`;
    flame.position.set(p.x + plan.x, y + 0.18 + plan.height / 2, p.z + plan.z);
    flame.rotation.z = plan.tilt;
    flame.userData.baseY = flame.position.y;
    flame.userData.height = plan.height;
    flame.renderOrder = 2;
    g.add(flame);
    return flame;
  });
  const glow = new THREE.PointLight(0xff6a28, 3.2, 14, 1.7);
  glow.position.set(p.x, y + 1.0, p.z);
  g.add(glow);
  /* Same eye-band rule as `makeLandmarkProxy`. At 1.5 m the lid stood 16 cm
   * under the standing eye and 0 of 1880 level rays from clear ground found
   * it; you could only tend the fire by looking at your boots. It spans the
   * eye now — and it is registered `soft`, because the pyre's own placement
   * and ignition targets and the two men standing at the fire all live inside
   * this footprint, and a soft volume is taken only when nothing solid was
   * found anywhere along the same ray. */
  const target = targetBox(
    'cabin-firepit-target',
    [2.7, PROXY_FOOT + PROXY_EYE + PROXY_HEADROOM, 2.7],
    [p.x, y + (PROXY_EYE + PROXY_HEADROOM - PROXY_FOOT) / 2, p.z],
  );
  target.userData.softAimVolume = true;
  g.add(target);
  root.add(g);
  let lit = false;
  const setLit = (on) => {
    lit = Boolean(on);
    for (const flame of flames) flame.visible = lit;
    glow.intensity = lit ? 3.2 : 0;
    return lit;
  };
  setLit(false);
  return {
    group: g,
    target,
    seatCount: seatAngles.length,
    get lit() { return lit; },
    setLit,
    update(elapsed) {
      if (!lit) return;
      const flicker = 0.90 + Math.sin(elapsed * 12.3) * 0.08 + Math.sin(elapsed * 19.7) * 0.04;
      glow.intensity = 3.2 * flicker;
      for (let i = 0; i < flames.length; i++) {
        const scaleY = flicker + Math.sin(elapsed * (8.7 + i) + i * 1.8) * 0.055;
        flames[i].scale.set(1 / Math.sqrt(scaleY), scaleY, 1 / Math.sqrt(scaleY));
        flames[i].position.y = flames[i].userData.baseY
          + (scaleY - 1) * flames[i].userData.height / 2;
      }
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

  /* A real response to the splitting interaction. The intact round becomes
   * two visible pieces which kick off the block, then a new round is set for
   * the next swing. This keeps the repeatable activity honest without adding
   * an inventory or crafting system the scene does not need. */
  const blockX = p.x + 2.0;
  const blockZ = p.z + 0.45;
  const round = cylinder({
    r: 0.15,
    h: 0.46,
    pos: [blockX, y + 0.89, blockZ],
    mat: M.cabinLog,
  });
  round.name = 'cabin-woodpile-round';
  const halves = [-1, 1].map((side) => {
    const half = cylinder({
      r: 0.105,
      h: 0.44,
      pos: [blockX + side * 0.07, y + 0.89, blockZ],
      mat: M.cabinLog,
    });
    half.name = `cabin-woodpile-split-${side < 0 ? 'left' : 'right'}`;
    half.userData.homeX = half.position.x;
    half.userData.homeY = half.position.y;
    half.visible = false;
    g.add(half);
    return half;
  });
  g.add(round);
  const target = targetBox('cabin-woodpile-target', [3.6, 1.7, 1.7], [p.x, y + 0.85, p.z]);
  g.add(target);
  root.add(g);
  let splitTime = 0;
  let splitCount = 0;
  const state = {};
  Object.defineProperties(state, {
    splitting: { enumerable: true, get: () => splitTime > 0 },
    splitCount: { enumerable: true, get: () => splitCount },
  });
  const resetRound = () => {
    splitTime = 0;
    round.visible = true;
    for (const half of halves) {
      half.visible = false;
      half.position.x = half.userData.homeX;
      half.position.y = half.userData.homeY;
      half.rotation.set(0, 0, 0);
    }
  };
  return {
    group: g,
    target,
    state: Object.freeze(state),
    split() {
      if (splitTime > 0) return false;
      splitTime = 0.0001;
      splitCount++;
      round.visible = false;
      for (const half of halves) half.visible = true;
      return true;
    },
    update(dt = 0) {
      if (splitTime <= 0) return;
      splitTime += Math.max(0, Number(dt) || 0);
      const progress = Math.min(1, splitTime / 0.82);
      const eased = 1 - (1 - progress) ** 3;
      for (let i = 0; i < halves.length; i++) {
        const side = i === 0 ? -1 : 1;
        const half = halves[i];
        half.position.x = half.userData.homeX + side * eased * 0.34;
        half.position.y = half.userData.homeY - Math.sin(progress * Math.PI) * 0.05;
        half.rotation.z = side * eased * 0.82;
        half.rotation.x = side * eased * 0.18;
      }
      if (splitTime >= 1.18) resetRound();
    },
  };
}

function buildParkedCar(root, M, colliders) {
  const p = LANDMARKS.car;
  const y = heightAt(p.x, p.z) + 0.34;
  const g = group('cabin-parked-wagon');
  ownGeometry(g, 'cabin-parked-wagon');
  const yaw = 0.18;
  g.position.set(p.x, y, p.z);
  g.rotation.y = yaw;
  const body = mat({ color: 0x33463d, roughness: 0.55, metalness: 0.25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x91a4a6, roughness: 0.16, metalness: 0.25, transparent: true, opacity: 0.72 });
  g.add(box({ name: 'cabin-parked-wagon-body', size: [2.02, 0.62, 4.55], pos: [0, 0.45, 0], mat: body }));
  g.add(box({ name: 'cabin-parked-wagon-cabin', size: [1.82, 0.68, 2.45], pos: [0, 0.98, -0.22], mat: body }));
  for (const dz of [-0.88, 0.88]) {
    const pane = box({
      name: dz < 0 ? 'cabin-parked-wagon-window-front' : 'cabin-parked-wagon-window-rear',
      size: [1.84, 0.44, 0.04],
      pos: [0, 1.04, dz],
      mat: glass,
    });
    g.add(pane);
  }
  const wheelMat = mat({ color: 0x121313, roughness: 0.95 });
  const suspensionMat = mat({ color: 0x242a29, roughness: 0.72, metalness: 0.62 });
  /* The wagon used to be two boxes with four wheels pushed through the lower
   * box. Their centres were technically symmetrical, but there was no wheel
   * well or suspension to make that overlap read as a vehicle. Keep one local
   * vehicle transform and give every axle, shock and arch the same authored
   * wheel stations, so a future adjustment cannot drift the body and running
   * gear independently. */
  const wheelStations = Object.freeze([-1.45, 1.45]);
  const frame = box({
    name: 'cabin-parked-wagon-chassis-frame',
    size: [1.48, 0.12, 3.62],
    pos: [0, 0.20, 0],
    mat: suspensionMat,
  });
  ownGeometry(frame, 'cabin-parked-wagon', { structural: true });
  g.add(frame);
  for (const sz of wheelStations) {
    const axle = cylinder({
      r: 0.07,
      h: 1.94,
      pos: [0, 0.12, sz],
      rotZ: Math.PI / 2,
      mat: suspensionMat,
    });
    axle.name = `cabin-parked-wagon-axle-${sz < 0 ? 'front' : 'rear'}`;
    ownGeometry(axle, 'cabin-parked-wagon', { structural: true });
    g.add(axle);
  }
  for (const sx of [-1, 1]) {
    for (const sz of wheelStations) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 16), wheelMat);
      wheel.name = `cabin-parked-wagon-wheel-${sx < 0 ? 'left' : 'right'}-${sz < 0 ? 'front' : 'rear'}`;
      wheel.position.set(sx * 0.94, 0.02, sz);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      ownGeometry(wheel, 'cabin-parked-wagon', { structural: true });
      g.add(wheel);

      const shock = cylinder({
        r: 0.045,
        h: 0.42,
        pos: [sx * 0.72, 0.34, sz],
        rotZ: sx * 0.18,
        mat: suspensionMat,
      });
      shock.name = `cabin-parked-wagon-shock-${sx < 0 ? 'left' : 'right'}-${sz < 0 ? 'front' : 'rear'}`;
      ownGeometry(shock, 'cabin-parked-wagon', { structural: true });
      g.add(shock);

      const well = new THREE.Mesh(
        new THREE.TorusGeometry(0.44, 0.055, 6, 24, Math.PI),
        body,
      );
      well.name = `cabin-parked-wagon-wheel-well-${sx < 0 ? 'left' : 'right'}-${sz < 0 ? 'front' : 'rear'}`;
      well.position.set(sx * 1.025, 0.12, sz);
      well.rotation.y = Math.PI / 2;
      well.castShadow = true;
      ownGeometry(well, 'cabin-parked-wagon', { structural: true });
      g.add(well);
    }
  }
  for (const sx of [-0.62, 0.62]) {
    g.add(box({
      name: `cabin-parked-wagon-headlight-${sx < 0 ? 'left' : 'right'}`,
      size: [0.28, 0.18, 0.06],
      pos: [sx, 0.48, -2.32],
      mat: M.ledAmber,
    }));
  }
  const target = targetBox('cabin-car-departure-target', [2.5, 1.8, 4.9], [0, 0.9, 0]);
  g.add(target);
  root.add(g);
  const halfX = Math.abs(Math.cos(yaw)) * 1.15 + Math.abs(Math.sin(yaw)) * 2.45;
  const halfZ = Math.abs(Math.sin(yaw)) * 1.15 + Math.abs(Math.cos(yaw)) * 2.45;
  addBounds(
    colliders,
    [[p.x - halfX, y - 0.35, p.z - halfZ], [p.x + halfX, y + 1.45, p.z + halfZ]],
    'cabin-parked-car',
    { kind: 'vehicle' },
  );
  return { group: g, target };
}

/** The standing eye, `WALK_EYE_HEIGHT` in src/cabin/main.js. */
const PROXY_EYE = 1.66;
/** Lid clearance above the tallest eye that can look at the proxy. */
const PROXY_HEADROOM = 1.15;
/** Floor clearance below the lowest boot that can stand around it. */
const PROXY_FOOT = 0.35;
/** How far outside its own footprint the authored approach stance must sit. */
const PROXY_STANCE_CLEAR = 0.55;

/**
 * A landmark's aim proxy.
 *
 * Owner, cabin playtest: *"I cant listen to the creek or look out over the
 * ridge overlook."*
 *
 * Both were CLAUDE.md's documented trap — a box is invisible to a ray that
 * starts inside it — and THIS BUILDER was the mechanism, because it sized
 * every proxy as a wide, low slab and then took its height from the terrain
 * under the CENTRE, which is not the ground the player is standing on.
 * Measured headlessly by driving the real `InteractionSystem` ray from each
 * landmark's own authored approach pose (`LANDMARK_VIEWPOINTS`) at the
 * authored pitch:
 *
 *   creek     7.0 x 7.0 m, 1.50 m tall, y -1.88..-0.38. The bank stands the
 *             eye at 0.72, which is 1.09 m ABOVE the lid, so a level ray
 *             passes clean over it. Nothing acquired.
 *   overlook  6.4 x 6.4 m, 2.00 m tall, y 6.24..8.24 — and the authored stance
 *             is INSIDE that footprint with the eye at 7.92, inside the box.
 *             No pitch anywhere between -60 and +60 degrees acquired it.
 *   trailhead 4.8 x 4.8 m, 1.80 m tall: same wide-low slab, and 0 of the 36
 *             bearings on the two nearest approach rings acquired it.
 *
 * Two rules size every proxy now, and they are the two the trap implies:
 *
 *  1. **The side face covers the standing eye band.** The vertical span is
 *     measured across the whole footprint AND the approach ring around it,
 *     and runs from below the lowest boot to above the highest eye. A level
 *     ray from anywhere around it enters the side rather than sailing over
 *     the lid or under the floor.
 *  2. **The proxy never contains its own authored approach stance.** The
 *     footprint is clamped so that stance stays PROXY_STANCE_CLEAR outside
 *     it — which is what stops rule 1 from turning a wide proxy into a box
 *     the player is standing inside.
 */
function makeLandmarkProxy(root, id, p, radius = 2) {
  const stance = LANDMARK_VIEWPOINTS[id] ?? null;
  let half = radius;
  if (stance) {
    /* Axis-aligned box, so the stance is outside it as soon as EITHER axis
     * clears the half-extent. Take the larger separation. */
    const clear = Math.max(Math.abs(stance.x - p.x), Math.abs(stance.z - p.z)) - PROXY_STANCE_CLEAR;
    if (clear >= 0.8) half = Math.min(half, clear);
  }
  let lowest = Infinity;
  let highest = -Infinity;
  // The footprint itself, then the ring the player actually walks in on.
  for (const reach of [half, half * 1.45]) {
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const g = heightAt(p.x + (i / 2) * reach, p.z + (j / 2) * reach);
        if (g < lowest) lowest = g;
        if (g > highest) highest = g;
      }
    }
  }
  const minY = lowest - PROXY_FOOT;
  const maxY = highest + PROXY_EYE + PROXY_HEADROOM;
  const target = targetBox(
    `cabin-${id}-target`,
    [half * 2, maxY - minY, half * 2],
    [p.x, (minY + maxY) / 2, p.z],
  );
  target.userData.softAimVolume = true;
  root.add(target);
  return target;
}

function polylineLength(path) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
  return total;
}

function noteFooting(footings, id, x, z, bottom, kind) {
  footings.push({
    id,
    kind,
    x,
    z,
    bottom,
    ground: heightAt(x, z),
  });
}

function buildTrailWayfinding(root, M, footings) {
  const g = group('cabin-trail-wayfinding');
  root.add(g);
  const postMaterial = M.cabinLogDark;
  const blazeMaterial = M.ledAmber;
  const seen = new Set();
  let blazes = 0;

  for (const path of [TRAIL_LOOP, OVERLOOK_TRAIL]) {
    const points = samplePolyline(path, 14.5);
    for (let i = 1; i < points.length - 1; i++) {
      const point = points[i];
      const key = `${Math.round(point.x)}:${Math.round(point.z)}`;
      if (seen.has(key) || creekFrame(point.x, point.z).distance < 6.2) continue;
      seen.add(key);
      const prev = points[i - 1];
      const next = points[i + 1];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const length = Math.hypot(dx, dz) || 1;
      const side = i % 2 ? -1 : 1;
      const x = point.x + (-dz / length) * 1.62 * side;
      const z = point.z + (dx / length) * 1.62 * side;
      const y = heightAt(x, z);
      const marker = group(`cabin-trail-blaze-${blazes}`);
      ownGeometry(marker, `cabin-wayfinding:blaze:${blazes}`, { checkSupport: false });
      marker.add(box({ size: [0.11, 1.28, 0.11], pos: [x, y + 0.64, z], mat: postMaterial }));
      marker.add(box({ size: [0.19, 0.20, 0.19], pos: [x, y + 1.10, z], mat: blazeMaterial }));
      marker.add(box({ size: [0.15, 0.05, 0.15], pos: [x, y + 1.305, z], mat: M.roof }));
      g.add(marker);
      noteFooting(footings, `trail-blaze-${blazes}`, x, z, y, 'trail-blaze');
      blazes++;
    }
  }

  const beaconPlans = [
    { id: 'trailhead', x: 7.45, z: 11.75 },
    { id: 'creek', x: 6.05, z: -31.45 },
    { id: 'shed', x: -24.45, z: 21.65 },
    { id: 'firepit', x: -18.25, z: 16.75 },
    { id: 'overlook', x: 67.1, z: -64.8 },
  ];
  const lights = [];
  for (const plan of beaconPlans) {
    const y = heightAt(plan.x, plan.z);
    const beacon = group(`cabin-dusk-beacon-${plan.id}`);
    ownGeometry(beacon, `cabin-wayfinding:beacon:${plan.id}`, { checkSupport: false });
    beacon.add(box({ size: [0.13, 1.55, 0.13], pos: [plan.x, y + 0.775, plan.z], mat: postMaterial }));
    beacon.add(box({ size: [0.34, 0.38, 0.30], pos: [plan.x, y + 1.55, plan.z], mat: M.ledAmber }));
    beacon.add(box({ size: [0.42, 0.07, 0.38], pos: [plan.x, y + 1.78, plan.z], mat: M.roof }));
    const light = new THREE.PointLight(0xffa13c, 0.72, 9.5, 1.8);
    light.position.set(plan.x, y + 1.58, plan.z);
    beacon.add(light);
    lights.push(light);
    g.add(beacon);
    noteFooting(footings, `dusk-beacon-${plan.id}`, plan.x, plan.z, y, 'dusk-beacon');
  }

  return {
    blazes,
    beacons: beaconPlans.length,
    update(elapsed) {
      for (let i = 0; i < lights.length; i++) {
        lights[i].intensity = 0.68 + Math.sin(elapsed * 1.7 + i * 1.3) * 0.04;
      }
    },
  };
}

function buildOverlook(root, M, colliders, footings) {
  const p = LANDMARKS.overlook;
  const y = heightAt(p.x, p.z);
  const g = group('cabin-ridge-overlook');
  ownGeometry(g, 'cabin-overlook-focal', { checkSupport: false });

  const yaw = yawToward(
    new THREE.Vector3(p.x, y, p.z),
    new THREE.Vector3(LANDMARKS.cabin.x, y, LANDMARKS.cabin.z),
  );
  const bench = group('cabin-overlook-bench');
  bench.position.set(p.x, y, p.z);
  bench.rotation.y = yaw;
  bench.add(box({ size: [2.15, 0.16, 0.55], pos: [0, 0.56, 0], mat: M.cabinLog }));
  bench.add(box({ size: [2.15, 0.16, 0.22], pos: [0, 1.02, 0.31], mat: M.cabinLog }));
  for (const x of [-0.78, 0.78]) {
    bench.add(box({ size: [0.18, 0.56, 0.28], pos: [x, 0.28, 0.02], mat: M.cabinLogDark }));
    bench.add(box({ size: [0.16, 0.58, 0.16], pos: [x, 0.79, 0.31], mat: M.cabinLogDark }));
  }
  g.add(bench);

  /* A low split rail and survey marker turn the cleared shelf into an actual
   * destination while keeping the cabin-valley sightline above them open. */
  const viewRail = group('cabin-overlook-view-rail');
  viewRail.position.set(p.x, y, p.z);
  viewRail.rotation.y = yaw;
  for (const x of [-2.15, 2.15]) {
    viewRail.add(box({ size: [0.16, 0.86, 0.16], pos: [x, 0.43, -2.25], mat: M.cabinLogDark }));
  }
  viewRail.add(box({ size: [4.45, 0.14, 0.14], pos: [0, 0.76, -2.25], mat: M.cabinLog }));
  ownGeometry(viewRail, 'cabin-overlook-focal', { checkSupport: false });
  g.add(viewRail);

  const survey = group('cabin-overlook-survey-marker');
  survey.add(cylinder({ r: 0.16, h: 0.82, pos: [0, 0.41, 0], mat: M.stone }));
  survey.add(cylinder({ r: 0.19, h: 0.045, pos: [0, 0.845, 0], mat: M.chrome }));
  survey.position.set(p.x - 2.35, y, p.z - 0.35);
  ownGeometry(survey, 'cabin-overlook-focal', { checkSupport: false });
  g.add(survey);

  // A small USGS-style cairn makes the destination read before the player
  // reaches the bench without blocking the opened view corridor.
  for (let i = 0; i < 4; i++) {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34 - i * 0.045, 0), M.stone);
    stone.position.set(p.x + 2.45, y + 0.16 + i * 0.28, p.z + 0.85);
    stone.scale.y = 0.56;
    stone.rotation.set(0.18 * i, 0.73 * i, -0.09 * i);
    stone.castShadow = true;
    g.add(stone);
  }
  root.add(g);
  addBounds(
    colliders,
    [[p.x - 1.25, y, p.z - 1.05], [p.x + 1.25, y + 1.15, p.z + 1.05]],
    'cabin-overlook-bench',
    { kind: 'seat' },
  );
  noteFooting(footings, 'overlook-bench', p.x, p.z, y, 'overlook-seat');
  noteFooting(footings, 'overlook-cairn', p.x + 2.45, p.z + 0.85, y, 'overlook-focal');
  /* THE PROXY SITS IN THE VIEW, NOT ON THE FURNITURE. The authored stance is
   * the last node of the overlook trail and faces the valley -- 174 degrees
   * away from the furniture cluster at `p` -- so a proxy centred on `p` sat
   * 0.55 m BEHIND the player's shoulder at the exact spot the trail delivers
   * them to, and the centre-screen interaction ray never touched it: prompt
   * logic aside, E at the overlook did nothing. The target now sits on the
   * stance's own sightline, just past the split rail, dead centre of the
   * frame at the one place the scene tells the player to stand and look. */
  const stance = LANDMARK_VIEWPOINTS.overlook;
  const gaze = Math.hypot(stance.lookX - stance.x, stance.lookZ - stance.z);
  const view = {
    x: stance.x + ((stance.lookX - stance.x) / gaze) * 2.4,
    z: stance.z + ((stance.lookZ - stance.z) / gaze) * 2.4,
  };
  const target = makeLandmarkProxy(root, 'overlook', view, 3.2);
  return { group: g, target, seatCount: 1, vistaFeatures: 2 };
}

function makeUndergrowthGeometry() {
  const positions = [];
  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const sx = -dz;
    const sz = dx;
    const reach = i % 2 ? 0.62 : 0.76;
    const tipY = i % 3 === 0 ? 0.48 : 0.34;
    const base = [sx * -0.045, 0.015, sz * -0.045];
    const left = [dx * reach * 0.48 + sx * 0.14, 0.16, dz * reach * 0.48 + sz * 0.14];
    const tip = [dx * reach, tipY, dz * reach];
    const right = [dx * reach * 0.48 - sx * 0.14, 0.16, dz * reach * 0.48 - sz * 0.14];
    positions.push(...base, ...left, ...tip, ...base, ...tip, ...right);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Owner, cabin playtest: *"We need some tree variety"*.
 *
 * The treeline was 558 copies of one tree. Every trunk was 0x3b281a, every
 * crown 0x183321, and the only authored difference between the two `kind`s
 * was a crown spread of 3.5 against 4.2 and a 7% height bump — invisible at
 * any distance you actually look at a treeline from.
 *
 * Five species now share the SAME four instanced draw calls per chunk. What
 * separates them is instance data only: proportions, how many cone tiers the
 * crown gets, whether the lowest tier is flipped into a rounded broadleaf
 * lozenge, and a per-instance colour off `setColorAt`. Variety therefore
 * costs no geometry, no material and no extra draw call — which is the
 * budget this no-build game has.
 *
 * `share` sums to 1 and is walked cumulatively against one field hash, so
 * the mix is deterministic and a species can be re-weighted without moving
 * every other tree on the property.
 */
const TREE_SPECIES = Object.freeze([
  {
    id: 'fir', share: 0.30, shape: 'spire',
    height: [8.6, 15.4], radius: [0.14, 0.26], broad: 3.4,
    tiers: 3, crownBase: 0.50, tierRise: 0.17, tierHeight: 0.33, tierTaper: 0.025,
    lean: 0.035, trunk: [0x3b281a, 0x2d2015], crown: [0x16301f, 0x1e3c27],
  },
  {
    // Lodgepole: tall, bare to two thirds, a thin crown right at the top.
    id: 'pine', share: 0.22, shape: 'spire',
    height: [9.8, 17.2], radius: [0.15, 0.28], broad: 2.9,
    tiers: 2, crownBase: 0.62, tierRise: 0.16, tierHeight: 0.27, tierTaper: 0.02,
    lean: 0.030, trunk: [0x5a3a20, 0x6e4527], crown: [0x27492a, 0x315a34],
  },
  {
    // Hemlock: short, and much wider than it is tall.
    id: 'hemlock', share: 0.20, shape: 'spire',
    height: [6.2, 11.0], radius: [0.16, 0.31], broad: 4.7,
    tiers: 3, crownBase: 0.38, tierRise: 0.20, tierHeight: 0.36, tierTaper: 0.030,
    lean: 0.045, trunk: [0x33241a, 0x241a12], crown: [0x1d3f28, 0x2a5233],
  },
  {
    // The only broadleaf, and the reason the treeline stops repeating: pale
    // trunk, yellow-green crown, and a ROUND silhouette among the spires.
    id: 'birch', share: 0.21, shape: 'round',
    height: [5.6, 9.9], radius: [0.10, 0.19], broad: 3.9,
    tiers: 3, crownBase: 0.52, tierRise: 0, tierHeight: 0, tierTaper: 0,
    lean: 0.075, trunk: [0xb9b3a4, 0x8b8676], crown: [0x51702c, 0x718e36],
  },
  {
    // Dead standing. Trunk only — its crown tiers are the gate's documented
    // all-axes-zero visibility sentinel, so nothing is drawn and nothing is
    // audited above the snapped top.
    id: 'snag', share: 0.07, shape: 'bare',
    height: [4.2, 9.4], radius: [0.13, 0.24], broad: 0,
    tiers: 0, crownBase: 0, tierRise: 0, tierHeight: 0, tierTaper: 0,
    lean: 0.16, trunk: [0x6d6459, 0x4b453c], crown: null,
  },
]);

/**
 * A sapling's needles: young growth, so the pale end of the fir and hemlock
 * ranges rather than a sixth species with a share of its own.
 */
const SAPLING_CROWN = Object.freeze([0x24512c, 0x36683a]);

function speciesAt(pick) {
  let run = 0;
  for (const species of TREE_SPECIES) {
    run += species.share;
    if (pick < run) return species;
  }
  return TREE_SPECIES[TREE_SPECIES.length - 1];
}

const _speciesColour = new THREE.Color();
const _speciesColourTo = new THREE.Color();
function speciesColour(range, t, dim = 1) {
  _speciesColour.setHex(range[0]).lerp(_speciesColourTo.setHex(range[1]), t);
  if (dim !== 1) _speciesColour.multiplyScalar(dim);
  return _speciesColour;
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
        saplings: [],
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
      const species = speciesAt(hashAt(x, z, 106));
      const grow = hashAt(x, z, 104);
      const girth = hashAt(x, z, 105);
      const plan = {
        x,
        z,
        y: heightAt(x, z),
        height: species.height[0] + grow * (species.height[1] - species.height[0]),
        radius: species.radius[0] + girth * (species.radius[1] - species.radius[0]),
        yaw: hashAt(x, z, 107) * Math.PI * 2,
        lean: (hashAt(x, z, 108) - 0.5) * species.lean,
        // 109 is the species' own colour axis: young/pale at 0, old/dark at 1.
        tone: hashAt(x, z, 109),
        kind: species.id,
        species,
      };
      /* What the trunk actually occupies on the ground, which is NOT its
       * radius: a leaning trunk's AABB grows by half its height times the
       * sine of the lean, and a snag leans up to 0.08 rad over 9.4 m — 38 cm
       * of reach the old circle test could not see. Ground scatter avoids
       * THIS, so a boulder or a deadfall log cannot be planted inside a tree
       * it thought it had cleared. Eight of them were, by 10 to 45 cm, and
       * they only ever showed up once the far LOD started drawing trunks.
       *
       * `spread` stays for the round tests that only want one number; the
       * footprint is the box the collector will build, from the trunk's own
       * rotation. See `instanceFootprint`. */
      plan.spread = plan.radius + (plan.height / 2) * Math.abs(Math.sin(plan.lean));
      _footEuler.set(plan.lean, plan.yaw, 0);
      const trunkFoot = instanceFootprint(_footEuler, plan.radius, plan.height / 2, plan.radius);
      plan.footX = trunkFoot.hx;
      plan.footZ = trunkFoot.hz;
      getChunk(x, z).trees.push(plan);
      plantedTrees.push(plan);
      addBounds(
        colliders,
        [
          [x - plan.radius - 0.08, plan.y, z - plan.radius - 0.08],
          [x + plan.radius + 0.08, plan.y + plan.height, z + plan.radius + 0.08],
        ],
        'cabin-tree-trunk',
        { id: `cabin-tree-trunk:${plantedTrees.length}`, kind: 'world' },
      );
    }
  }

  /* THE FOREST FLOOR. Ferns, salal and grass, near LOD only.
   *
   * Owner, cabin playtest: *"we need a bit more detail in the forest."* It
   * was 1,617 identical plants over a 220 m property — one every 30 m², all
   * the same 0x31502d frond cluster at the same proportions, which from the
   * bridge reads as scattered weeds rather than as ground cover.
   *
   * 2.20 m of grid instead of 3.15 is 2.05x the cells, and the same
   * acceptance hash then puts one plant every 14 m². Three FORMS share the
   * one geometry and the one instanced draw call per chunk, separated by
   * instance scale and `setColorAt` exactly as the five tree species are:
   * a low spreading fern, a compact shrub, and a narrow grass tuft that is
   * nearly twice its own width tall. No second mesh, no second material, no
   * extra draw call — the same trade the species mix already made.
   *
   * -1.0 rather than -0.6 on the shared exclusion: the plants stop 0.78 m
   * clear of the 2.45 m trail ribbon instead of 1.18 m, which closes the bald
   * verge either side of every path without putting a frond on one. Every
   * other authored margin — the pad, the range lane, the bridge, the creek,
   * the overlook's view corridor — relaxes by the same metre and keeps its
   * clearance.
   */
  const BRUSH_FORMS = Object.freeze([
    // share, xz, y, colour range: a fern is wider than it is tall.
    { id: 'fern', share: 0.42, spread: 1.12, rise: 0.82, tint: [0x2c4a28, 0x3d6033] },
    { id: 'salal', share: 0.33, spread: 0.74, rise: 1.24, tint: [0x22401e, 0x2f5028] },
    { id: 'grass', share: 0.25, spread: 0.54, rise: 1.90, tint: [0x5a6b30, 0x7d8a44] },
  ]);
  const brushFormAt = (pick) => {
    let run = 0;
    for (const form of BRUSH_FORMS) {
      run += form.share;
      if (pick < run) return form;
    }
    return BRUSH_FORMS[BRUSH_FORMS.length - 1];
  };
  const brushStep = 2.20;
  for (let gx = PROPERTY.minX + 2; gx < PROPERTY.maxX - 2; gx += brushStep) {
    for (let gz = PROPERTY.minZ + 2; gz < PROPERTY.maxZ - 2; gz += brushStep) {
      const x = gx + (hashAt(gx, gz, 121) - 0.5) * 1.7;
      const z = gz + (hashAt(gx, gz, 122) - 0.5) * 1.7;
      if (!canPlantTree(x, z, -1.0)) continue;
      if (hashAt(x, z, 123) > 0.31 + treeDensityAt(x, z) * 0.18) continue;
      getChunk(x, z).brush.push({
        x,
        z,
        y: heightAt(x, z),
        scale: 0.42 + hashAt(x, z, 124) * 0.68,
        yaw: hashAt(x, z, 125) * Math.PI * 2,
        form: brushFormAt(hashAt(x, z, 126)),
        tone: hashAt(x, z, 127),
      });
    }
  }

  /* SAPLINGS, in the crowns' own instanced mesh.
   *
   * A young conifer is one cone, and `cabin-tree-crowns-near` is already an
   * instanced mesh of cones with a per-instance tint that switches off at
   * `nearFoliage`. Allocating a few more instances in it is therefore the
   * whole feature: no geometry, no material, no draw call, and the LOD band
   * is correct for free, because a 1.6 m tree is detail you only ever see
   * close up. Their footing is `heightAt(x, z)` like every trunk's.
   */
  const saplingStep = 7.4;
  for (let gx = PROPERTY.minX + 5; gx < PROPERTY.maxX - 5; gx += saplingStep) {
    for (let gz = PROPERTY.minZ + 5; gz < PROPERTY.maxZ - 5; gz += saplingStep) {
      const x = gx + (hashAt(gx, gz, 131) - 0.5) * 5.6;
      const z = gz + (hashAt(gx, gz, 132) - 0.5) * 5.6;
      if (!canPlantTree(x, z, 0.9)) continue;
      const density = treeDensityAt(x, z);
      if (!density || hashAt(x, z, 133) > density * 0.62) continue;
      const height = 1.05 + hashAt(x, z, 134) * 1.55;
      const spread = 0.34 + hashAt(x, z, 135) * 0.42;
      // Clear of the standing trunks' true footprint, same rule as the
      // deadfall: a sapling growing out of a fir is a gate violation.
      if (plantedTrees.some((tree) => (
        Math.hypot(x - tree.x, z - tree.z) < spread + (tree.spread ?? tree.radius) + 0.25
      ))) continue;
      getChunk(x, z).saplings.push({
        x,
        z,
        y: heightAt(x, z),
        height,
        spread,
        yaw: hashAt(x, z, 136) * Math.PI * 2,
        tone: hashAt(x, z, 137),
      });
    }
  }

  const trunkGeometry = new THREE.CylinderGeometry(1, 1, 1, 7);
  const crownGeometry = new THREE.ConeGeometry(1, 1, 8);
  const farCrownGeometry = new THREE.ConeGeometry(1, 1, 6);
  const brushGeometry = makeUndergrowthGeometry();
  /* White base colours: every trunk and crown carries its own species tint on
   * `instanceColor`, and the shader multiplies the two. These are built
   * directly rather than through `mat()` so a 0xffffff standard material
   * cached for something else can never end up wearing the forest's
   * DoubleSide, and so the forest owns its own disposal. */
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const crownMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const farCrownMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  // White here for the same reason as the trunks and crowns: the plant's
  // form carries its own tint on `instanceColor` and the shader multiplies.
  const brushMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  disposables.push(
    trunkGeometry, crownGeometry, farCrownGeometry, brushGeometry,
    trunkMaterial, crownMaterial, farCrownMaterial, brushMaterial,
  );
  /* Distance already costs the far crowns their near-LOD lighting detail;
   * 0.86 keeps the same instance tint reading as haze rather than as a
   * different, brighter tree suddenly appearing at the LOD line. */
  const FAR_CROWN_DIM = 0.86;
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  const dummy = new THREE.Object3D();
  const built = [];
  const speciesCounts = Object.fromEntries(TREE_SPECIES.map(({ id }) => [id, 0]));
  for (const tree of plantedTrees) speciesCounts[tree.kind] += 1;
  let trees = 0;
  let undergrowth = 0;
  let saplings = 0;
  for (const chunk of chunks.values()) {
    const chunkGroup = group(`cabin-forest-chunk-${chunk.cx}-${chunk.cz}`);
    const near = group('forest-near-lod');
    const far = group('forest-far-lod');
    const brushGroup = group('forest-undergrowth-lod');
    chunkGroup.add(near, far, brushGroup);

    /* Saplings ride the crowns' allocation, so a chunk that grew none of the
     * standing trees has nowhere to put them and drops them rather than
     * opening a second instanced mesh for a handful of cones. */
    const chunkSaplings = chunk.trees.length ? chunk.saplings : [];

    if (chunk.trees.length) {
      const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, chunk.trees.length);
      const crowns = new THREE.InstancedMesh(
        crownGeometry, crownMaterial, chunk.trees.length * 3 + chunkSaplings.length,
      );
      const farCrowns = new THREE.InstancedMesh(farCrownGeometry, farCrownMaterial, chunk.trees.length);
      trunks.name = 'cabin-tree-trunks';
      crowns.name = 'cabin-tree-crowns-near';
      farCrowns.name = 'cabin-tree-crowns-far';
      // Needles naturally interlock, and near/far crowns are alternate LODs
      // for the same authored trees. Their instance AABBs are not collision
      // solids and their footing comes from the matching planted trunks.
      proceduralSurface(crowns);
      proceduralSurface(farCrowns);
      /* Every trunk stands at `heightAt(x, z)` by construction — the same
       * deterministic footing the undergrowth declares, and the same reason
       * `cabin-property-heightfield` opts out of being a support witness: its
       * AABB is the whole 224 m property, so the gate can never see it as
       * "below" anything standing on a low part of it.
       *
       * This used to be implicit and invisible. The trunks shared the
       * `forest-near-lod` group with the crowns, the crowns carry
       * `checkSupport: false`, and one `false` in a support bucket skips the
       * whole connected component — so 558 trunks were silently exempt
       * because of a metadata flag on their needles. Lifting the trunks out
       * of that group to fix the draw distance made all 558 report FLOATING
       * at once. Their footing did not change; only who was declaring it.
       * Overlap stays audited: a log or a boulder inside a trunk is still a
       * bug, and eight of them were. */
      trunks.userData.geometryGate = {
        ...(trunks.userData.geometryGate ?? {}),
        checkSupport: false,
      };
      let crownAt = 0;
      for (let i = 0; i < chunk.trees.length; i++) {
        const tree = chunk.trees[i];
        const species = tree.species;
        dummy.position.set(tree.x, tree.y + tree.height / 2, tree.z);
        dummy.rotation.set(tree.lean, tree.yaw, 0);
        dummy.scale.set(tree.radius, tree.height, tree.radius);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);

        trunks.setColorAt(i, speciesColour(species.trunk, tree.tone));

        const broad = tree.radius * species.broad;
        const crownTint = species.crown
          ? speciesColour(species.crown, tree.tone).clone()
          : null;

        for (let tier = 0; tier < 3; tier++) {
          if (tier >= species.tiers) {
            // The gate's documented all-axes-zero visibility sentinel: a snag
            // has no foliage, and a two-tier pine has no third whorl.
            crowns.setMatrixAt(crownAt, HIDDEN);
            crowns.setColorAt(crownAt, _speciesColour.setHex(0x000000));
            crownAt += 1;
            continue;
          }
          if (species.shape === 'round') {
            /* Two cones sharing one equator make the broadleaf lozenge, with
             * a small upright cap for a crown that is not a perfect ball.
             * Tier 0 is the underside and is rotated PI about X rather than
             * given a negative Y scale — a mirrored instance would flip its
             * normals, and the geometry gate reads decomposed scale. */
            const equator = tree.y + tree.height * (species.crownBase + 0.22);
            const lower = tree.height * 0.22;
            const upper = tree.height * 0.28;
            if (tier === 0) {
              dummy.position.set(tree.x, equator - lower / 2, tree.z);
              dummy.rotation.set(Math.PI, tree.yaw, 0);
              dummy.scale.set(broad, lower, broad);
            } else if (tier === 1) {
              dummy.position.set(tree.x, equator + upper / 2, tree.z);
              dummy.rotation.set(0, tree.yaw + 0.73, 0);
              dummy.scale.set(broad * 0.98, upper, broad * 0.98);
            } else {
              dummy.position.set(tree.x, equator + upper * 0.82, tree.z);
              dummy.rotation.set(0, tree.yaw + 1.46, 0);
              dummy.scale.set(broad * 0.58, tree.height * 0.16, broad * 0.58);
            }
          } else {
            const tierScale = 1 - tier * 0.17;
            dummy.position.set(
              tree.x,
              tree.y + tree.height * (species.crownBase + tier * species.tierRise),
              tree.z,
            );
            dummy.rotation.set(0, tree.yaw + tier * 0.73, 0);
            dummy.scale.set(
              broad * tierScale,
              tree.height * (species.tierHeight - tier * species.tierTaper),
              broad * tierScale,
            );
          }
          dummy.updateMatrix();
          crowns.setMatrixAt(crownAt, dummy.matrix);
          crowns.setColorAt(crownAt, crownTint);
          crownAt += 1;
        }

        if (!species.crown) {
          farCrowns.setMatrixAt(i, HIDDEN);
          farCrowns.setColorAt(i, _speciesColour.setHex(0x000000));
        } else {
          /* One cone stands in for the whole crown past the LOD line. A
           * broadleaf gets a squatter, lower one so its silhouette still
           * reads round-ish rather than turning into a spire at 70 m. */
          const round = species.shape === 'round';
          dummy.position.set(
            tree.x,
            tree.y + tree.height * (round ? species.crownBase + 0.20 : species.crownBase + 0.17),
            tree.z,
          );
          dummy.rotation.set(0, tree.yaw, 0);
          dummy.scale.set(
            broad * (round ? 1.02 : 0.92),
            tree.height * (round ? 0.50 : species.tiers * 0.26),
            broad * (round ? 1.02 : 0.92),
          );
          dummy.updateMatrix();
          farCrowns.setMatrixAt(i, dummy.matrix);
          farCrowns.setColorAt(i, speciesColour(species.crown, tree.tone, FAR_CROWN_DIM));
        }
      }
      /* The saplings, after the last authored crown tier. One cone standing
       * on the ground: a young conifer is not a trunk plus a canopy at this
       * distance, and giving it one would put a 4 cm stem in the trunks'
       * instanced mesh, which lives at every distance out to 158 m. */
      for (const sapling of chunkSaplings) {
        dummy.position.set(sapling.x, sapling.y + sapling.height / 2, sapling.z);
        dummy.rotation.set(0, sapling.yaw, 0);
        dummy.scale.set(sapling.spread, sapling.height, sapling.spread);
        dummy.updateMatrix();
        crowns.setMatrixAt(crownAt, dummy.matrix);
        crowns.setColorAt(crownAt, speciesColour(SAPLING_CROWN, sapling.tone));
        crownAt += 1;
        saplings += 1;
      }
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      farCrowns.instanceMatrix.needsUpdate = true;
      if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      if (farCrowns.instanceColor) farCrowns.instanceColor.needsUpdate = true;
      trunks.castShadow = true;
      trunks.receiveShadow = true;
      crowns.castShadow = true;
      farCrowns.castShadow = false;
      /* Owner, cabin playtest: *"We need greater draw distance on the tree
       * trunks. as they are floating trees in the distance."*
       *
       * The trunks used to live in `near`, and `near` switched off at
       * `nearFoliage` (66 m of CHUNK-CENTRE distance) while the crowns
       * carried on to `farFoliage` (158 m). Measured headlessly by driving
       * this LOD loop and reading back every visible instance's world
       * position:
       *
       *   from the porch      trunks to  86.2 m, canopies to 153.9 m
       *   from the overlook   trunks to  78.9 m, canopies to 164.3 m
       *   from the bridge     trunks to  79.3 m, canopies to 163.4 m
       *
       * — a 68 to 85 m band with 210 to 376 canopies hanging in it over
       * nothing at all. It was never a fog band or a frustum cull: it was one
       * `add`.
       *
       * The trunk is the cheapest thing in the forest (one 7-sided cylinder,
       * one instanced draw call per chunk, ~28 triangles a tree), so it does
       * not belong to an LOD tier at all. It hangs off the chunk and lives
       * exactly as long as the chunk does, which is exactly as long as the
       * crowns above it. Only the CROWN swaps near for far. */
      chunkGroup.add(trunks);
      near.add(crowns);
      far.add(farCrowns);
      trees += chunk.trees.length;
    }

    if (chunk.brush.length) {
      const brush = new THREE.InstancedMesh(brushGeometry, brushMaterial, chunk.brush.length);
      brush.name = 'cabin-fern-undergrowth';
      // Each plant is one tapered low-poly frond cluster, not two rectangular
      // cards. Its origin is the exact deterministic heightfield footing.
      proceduralSurface(brush);
      for (let i = 0; i < chunk.brush.length; i++) {
        const plant = chunk.brush[i];
        dummy.position.set(plant.x, plant.y, plant.z);
        dummy.rotation.set(0, plant.yaw, 0);
        // The form is the whole difference between a fern, a shrub and a
        // tuft of grass: one geometry, three proportions, three tints.
        dummy.scale.set(
          plant.scale * plant.form.spread,
          plant.scale * plant.form.rise,
          plant.scale * plant.form.spread,
        );
        dummy.updateMatrix();
        brush.setMatrixAt(i, dummy.matrix);
        brush.setColorAt(i, speciesColour(plant.form.tint, plant.tone));
      }
      brush.instanceMatrix.needsUpdate = true;
      if (brush.instanceColor) brush.instanceColor.needsUpdate = true;
      brush.castShadow = false;
      brush.receiveShadow = true;
      brushGroup.add(brush);
      undergrowth += chunk.brush.length;
    }

    const d0 = Math.hypot(chunk.x, chunk.z);
    near.visible = d0 < ENVIRONMENT_VISIBILITY.wildernessHub.nearFoliage;
    far.visible = d0 >= ENVIRONMENT_VISIBILITY.wildernessHub.nearFoliage;
    brushGroup.visible = d0 < ENVIRONMENT_VISIBILITY.wildernessHub.undergrowth;
    root.add(chunkGroup);
    built.push({ root: chunkGroup, near, far, brush: brushGroup, x: chunk.x, z: chunk.z });
  }

  let visibilityClock = 0;
  let lastX = Infinity;
  let lastZ = Infinity;
  return {
    counts: {
      trees,
      undergrowth,
      saplings,
      chunks: built.length,
      species: Object.freeze({ ...speciesCounts }),
    },
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
        chunk.root.visible = d < ENVIRONMENT_VISIBILITY.wildernessHub.farFoliage;
        chunk.near.visible = d < ENVIRONMENT_VISIBILITY.wildernessHub.nearFoliage;
        chunk.far.visible = d >= ENVIRONMENT_VISIBILITY.wildernessHub.nearFoliage;
        chunk.brush.visible = d < ENVIRONMENT_VISIBILITY.wildernessHub.undergrowth;
      }
    },
  };
}

/**
 * The X and Z half extents the geometry collector will actually measure for
 * one instance — which is not its radius, and not a capsule's swept bound.
 *
 * `Box3.applyMatrix4` transforms the eight CORNERS of the local bounding box
 * and takes their bounds, so a rotated body's footprint is the rotation
 * row's absolute terms against the scaled half extents. Nothing else is a
 * bound on it:
 *
 *   a 0.86 m boulder tilted 0.5 rad measures 1.27 m across — 1.48 x its own
 *   radius, where the previous "scaled 0.75..1.20 on Z, so 1.20 x radius"
 *   estimate said 1.03, and that 24 cm is exactly how a fallen log came to
 *   sit 19 cm inside a boulder it had been told to clear
 *
 *   a stump is a plain cylinder and its footprint is still 1.41 x radius,
 *   because a square rotated 45 degrees about Y has a wider box than the
 *   square
 *
 * So every scatter body computes this from the same rotation it is rendered
 * with, and clearance is a box test between two of them.
 */
function instanceFootprint(rotation, hx, hy, hz) {
  if (rotation.isQuaternion) _footMatrix.makeRotationFromQuaternion(rotation);
  else _footMatrix.makeRotationFromEuler(rotation);
  const e = _footMatrix.elements;
  return {
    hx: Math.abs(e[0]) * hx + Math.abs(e[4]) * hy + Math.abs(e[8]) * hz,
    hz: Math.abs(e[2]) * hx + Math.abs(e[6]) * hy + Math.abs(e[10]) * hz,
  };
}
const _footMatrix = new THREE.Matrix4();
const _footEuler = new THREE.Euler();
const _footQuaternion = new THREE.Quaternion();
const _footUp = new THREE.Vector3(0, 1, 0);
const _footAxis = new THREE.Vector3();

function buildGroundScatter(root, M, colliders, disposables, plantedTrees = []) {
  /* EVERY PIECE OF SCATTER CLEARS EVERY TRUNK AND EVERY PIECE ALREADY DOWN,
   * and all of it is a box test on purpose. The gate audits one AABB per
   * rendered instance, and a centre-to-centre distance does not bound a box:
   * two footprints 1.3 radii apart on the diagonal are 0.92 radii apart on
   * BOTH axes, which is an overlap on both axes and therefore a finding.
   * One list, seeded with the trunks, and everything that lands adds itself
   * to it. */
  const footprints = plantedTrees.map((tree) => ({
    x: tree.x,
    z: tree.z,
    hx: tree.footX ?? tree.radius,
    hz: tree.footZ ?? tree.radius,
  }));
  /* The two yard skids are authored ground furniture west of the fire ring,
   * 6.8 m out from it and therefore outside every landmark radius the shared
   * exclusion knows about. A 23 cm stone landed 12 cm inside one. They stand
   * on the same ground as the scatter, so they belong in the same list; the
   * 0.90 x 2.55 m box is the skid's own target volume. */
  for (const skid of Object.values(CABIN_CLEANUP_LAYOUT.staging)) {
    _footEuler.set(0, skid.rotationY ?? 0, 0);
    const foot = instanceFootprint(_footEuler, 0.63, 0.35, 1.28);
    footprints.push({ x: skid.x, z: skid.z, hx: foot.hx, hz: foot.hz });
  }
  const footprintClear = (x, z, hx, hz, margin = 0.06) => !footprints.some((f) => (
    Math.abs(f.x - x) < f.hx + hx + margin && Math.abs(f.z - z) < f.hz + hz + margin
  ));

  /* One rock, decided once. Its tilt and its three scales used to be hashed
   * again in the render loop, which meant the clearance test could only ever
   * guess at the box the instance would occupy. The plan carries them, so
   * the footprint below and the matrix further down are the same body. */
  const rockPlan = (x, z, radius, salt) => {
    const tiltX = hashAt(x, z, salt + 1) * 0.5;
    const tiltZ = hashAt(x, z, salt + 2) * 0.4;
    const yaw = hashAt(x, z, salt) * Math.PI * 2;
    const scaleY = radius * (0.48 + hashAt(x, z, salt + 3) * 0.32);
    const scaleZ = radius * (0.75 + hashAt(x, z, salt + 4) * 0.45);
    _footEuler.set(tiltX, yaw, tiltZ);
    return {
      x,
      z,
      y: heightAt(x, z),
      radius,
      yaw,
      tiltX,
      tiltZ,
      scaleY,
      scaleZ,
      foot: instanceFootprint(_footEuler, radius, scaleY, scaleZ),
    };
  };

  const rockPlans = [];
  for (let gx = PROPERTY.minX + 6; gx < PROPERTY.maxX - 6; gx += 11.5) {
    for (let gz = PROPERTY.minZ + 6; gz < PROPERTY.maxZ - 6; gz += 11.5) {
      const x = gx + (hashAt(gx, gz, 151) - 0.5) * 7.0;
      const z = gz + (hashAt(gx, gz, 152) - 0.5) * 7.0;
      if (insideRect(x, z, CABIN.pad, 4) || trailFrame(x, z).distance < 2.5) continue;
      /* 0.36 -> 0.385 -> 0.40, and the same trade in the deadfall pass
       * below. Clearing a trunk's true AABB instead of its centre line is
       * stricter, and it cost the property three boulders and three logs --
       * 102 rocks to 99 and 25 deadfall to 22, both under the density floors
       * `countryside-cabin-world.test.mjs` holds (>= 100 and >= 25). The
       * clearance is the correctness fix and stays; the acceptance threshold
       * buys the density back from the same deterministic hash. */
      if (hashAt(x, z, 153) > 0.40) continue;
      const radius = 0.30 + hashAt(x, z, 154) * 0.80;
      const plan = rockPlan(x, z, radius, 155);
      if (!footprintClear(x, z, plan.foot.hx, plan.foot.hz)) continue;
      rockPlans.push(plan);
      footprints.push({ x, z, hx: plan.foot.hx, hz: plan.foot.hz });
    }
  }

  /* A SECOND, FINER PASS OF STONES, in the same instanced mesh.
   *
   * Owner: *"we need a bit more detail in the forest."* The boulder grid is
   * 11.5 m and half of it lands under a tree, so the floor between the
   * trunks had nothing on it at all. These are 13 to 34 cm — under the 72 cm
   * at which a rock becomes a thing you can walk into, so not one of them
   * adds a collider — and they ride the boulders' own draw call.
   */
  const stoneGrid = 6.9;
  for (let gx = PROPERTY.minX + 5; gx < PROPERTY.maxX - 5; gx += stoneGrid) {
    for (let gz = PROPERTY.minZ + 5; gz < PROPERTY.maxZ - 5; gz += stoneGrid) {
      const x = gx + (hashAt(gx, gz, 161) - 0.5) * 4.4;
      const z = gz + (hashAt(gx, gz, 162) - 0.5) * 4.4;
      // Closer to the paths than a boulder may come: a stone beside a trail
      // is dressing, and it is 30 cm tall.
      if (insideRect(x, z, CABIN.pad, 3) || trailFrame(x, z).distance < 1.9) continue;
      if (hashAt(x, z, 163) > 0.30) continue;
      const radius = 0.13 + hashAt(x, z, 164) * 0.21;
      const plan = rockPlan(x, z, radius, 165);
      if (!footprintClear(x, z, plan.foot.hx, plan.foot.hz)) continue;
      rockPlans.push(plan);
      footprints.push({ x, z, hx: plan.foot.hx, hz: plan.foot.hz });
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
    dummy.rotation.set(p.tiltX, p.yaw, p.tiltZ);
    dummy.scale.set(p.radius, p.scaleY, p.scaleZ);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    if (p.radius > 0.72) addBounds(
      colliders,
      [[p.x - p.radius * 0.75, p.y, p.z - p.radius * 0.75], [p.x + p.radius * 0.75, p.y + p.radius * 0.75, p.z + p.radius * 0.75]],
      'cabin-field-rock',
      { id: `cabin-field-rock:${i}`, kind: 'world' },
    );
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  root.add(rocks);

  /* 13.2 m of grid, not 17.5: a 224 m property with twenty-eight fallen
   * trees on it has one every 1,800 m², which is a wood nobody has ever
   * walked through. The same acceptance hash over 1.76x the cells is the
   * cheapest honest way to raise it, and the clearance below is unchanged. */
  const logPlans = [];
  for (let gx = PROPERTY.minX + 10; gx < PROPERTY.maxX - 10; gx += 13.2) {
    for (let gz = PROPERTY.minZ + 10; gz < PROPERTY.maxZ - 10; gz += 13.2) {
      const x = gx + (hashAt(gx, gz, 171) - 0.5) * 9;
      const z = gz + (hashAt(gx, gz, 172) - 0.5) * 9;
      if (!canPlantTree(x, z, 1.0) || hashAt(x, z, 173) > 0.325) continue;
      const length = 2.2 + hashAt(x, z, 174) * 3.2;
      const radius = 0.16 + hashAt(x, z, 175) * 0.16;
      const yaw = hashAt(x, z, 176) * Math.PI * 2;
      const ax = Math.sin(yaw);
      const az = Math.cos(yaw);
      const half = length / 2;
      const y0 = heightAt(x - ax * length / 2, z - az * length / 2) + radius;
      const y1 = heightAt(x + ax * length / 2, z + az * length / 2) + radius;
      const pitch = Math.atan2(y1 - y0, length);
      /* Clear the trunk's BOX, not its centre line.
       *
       * The old test measured the distance from each trunk to the log's axis,
       * and that is not what the geometry gate measures: it audits one AABB
       * per rendered instance, and the AABB of a 5.4 m log lying at 45
       * degrees is 3.8 m square, most of it empty corner. Four logs cleared
       * the cylinder and still buried a trunk 18 to 45 cm inside the box —
       * invisible while distant trunks were not drawn, and four gate
       * violations the moment they were. The box is now taken from the
       * quaternion the instance is rendered with, by the same
       * `instanceFootprint` every other body uses. */
      _footAxis.set(ax * Math.cos(pitch), Math.sin(pitch), az * Math.cos(pitch)).normalize();
      _footQuaternion.setFromUnitVectors(_footUp, _footAxis);
      const foot = instanceFootprint(_footQuaternion, radius, half, radius);
      if (!footprintClear(x, z, foot.hx, foot.hz)) continue;
      logPlans.push({ x, z, y: (y0 + y1) / 2, length, radius, yaw, pitch, ax, az });
      footprints.push({ x, z, hx: foot.hx, hz: foot.hz });
    }
  }

  /* CUT STUMPS, in the deadfall's own instanced mesh.
   *
   * A stump is the same cylinder standing up, so it costs no geometry, no
   * material and no draw call — and it is the one piece of forest dressing
   * that says somebody has worked this land, which is what the forestry shed
   * and the woodpile are already claiming. They are 30 to 52 cm across and
   * up to 95 cm tall, so they block like the boulders do and get the same
   * kind of collider.
   */
  const stumpPlans = [];
  for (let gx = PROPERTY.minX + 9; gx < PROPERTY.maxX - 9; gx += 15.0) {
    for (let gz = PROPERTY.minZ + 9; gz < PROPERTY.maxZ - 9; gz += 15.0) {
      const x = gx + (hashAt(gx, gz, 181) - 0.5) * 10.5;
      const z = gz + (hashAt(gx, gz, 182) - 0.5) * 10.5;
      const radius = 0.30 + hashAt(x, z, 183) * 0.22;
      if (!canPlantTree(x, z, radius + 0.6) || hashAt(x, z, 184) > 0.34) continue;
      const height = 0.42 + hashAt(x, z, 185) * 0.53;
      const yaw = hashAt(x, z, 186) * Math.PI * 2;
      _footEuler.set(0, yaw, 0);
      const foot = instanceFootprint(_footEuler, radius, height / 2, radius);
      if (!footprintClear(x, z, foot.hx, foot.hz)) continue;
      stumpPlans.push({ x, z, y: heightAt(x, z), radius, height, yaw, foot });
      footprints.push({ x, z, hx: foot.hx, hz: foot.hz });
    }
  }

  const logGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  const logMaterial = M.cabinLogDark;
  const logs = new THREE.InstancedMesh(
    logGeometry, logMaterial, logPlans.length + stumpPlans.length,
  );
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
        { id: `cabin-deadfall-log:${i}:${segment}`, kind: 'world' },
      );
      ownGeometry(logCollider, `cabin-deadfall-log-collision:${i}`);
    }
  }
  for (let i = 0; i < stumpPlans.length; i++) {
    const p = stumpPlans[i];
    dummy.position.set(p.x, p.y + p.height / 2, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.scale.set(p.radius, p.height, p.radius);
    dummy.updateMatrix();
    logs.setMatrixAt(logPlans.length + i, dummy.matrix);
    // The collider is the footprint the instance really occupies, so the
    // thing you walk into is the thing you can see.
    const stumpCollider = addBounds(
      colliders,
      [
        [p.x - p.foot.hx, p.y, p.z - p.foot.hz],
        [p.x + p.foot.hx, p.y + p.height, p.z + p.foot.hz],
      ],
      'cabin-deadfall-stump',
      { id: `cabin-deadfall-stump:${i}`, kind: 'world' },
    );
    ownGeometry(stumpCollider, `cabin-deadfall-stump-collision:${i}`);
  }
  logs.instanceMatrix.needsUpdate = true;
  logs.castShadow = true;
  logs.receiveShadow = true;
  root.add(logs);
  disposables.push(rockGeometry, logGeometry);
  return { rocks: rockPlans.length, logs: logPlans.length, stumps: stumpPlans.length };
}

function buildPropertyBoundary(root, M, colliders) {
  const low = -12;
  const high = 22;
  for (const boundaryCollider of [
    addBounds(colliders, [[PROPERTY.minX - 3, low, PROPERTY.minZ - 3], [PROPERTY.minX + 0.5, high, PROPERTY.maxZ + 3]], 'cabin-property-boundary-west', { kind: 'world' }),
    addBounds(colliders, [[PROPERTY.maxX - 0.5, low, PROPERTY.minZ - 3], [PROPERTY.maxX + 3, high, PROPERTY.maxZ + 3]], 'cabin-property-boundary-east', { kind: 'world' }),
    addBounds(colliders, [[PROPERTY.minX - 3, low, PROPERTY.minZ - 3], [PROPERTY.maxX + 3, high, PROPERTY.minZ + 0.5]], 'cabin-property-boundary-north', { kind: 'world' }),
    addBounds(colliders, [[PROPERTY.minX - 3, low, PROPERTY.maxZ - 0.5], [PROPERTY.maxX + 3, high, PROPERTY.maxZ + 3]], 'cabin-property-boundary-south', { kind: 'world' }),
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
  const addProp = (built, colliderName = '', { kind = 'prop' } = {}) => {
    const propName = (built.group.name || 'unnamed').replace(/[^A-Za-z0-9._:+-]/g, '-');
    ownGeometry(
      built.group,
      `cabin-prop:${propName}:${++propAssemblyOrdinal}`,
    );
    interior.add(built.group);
    if (built.bounds) {
      addBounds(
        colliders,
        built.bounds,
        colliderName || `cabin-${built.group.name}`,
        { kind },
      );
    }
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
  const chair = addProp(
    P.makeChair(M, { x: 0.70, z: -3.70, rotY: Math.PI + 0.10 }),
    'cabin-desk-chair',
    { kind: 'seat' },
  );
  const zyn = P.makeZynCan(M, { x: 1.20, y: desk.top, z: -4.40, rotY: 0.4, lidTexture: propTexture('zyn.lid') });
  ownGeometry(zyn.group, 'cabin-prop:zyn');
  interior.add(zyn.group);
  const bobble = P.makeBobblehead(M, { x: 1.66, y: desk.top + 0.008, z: -4.67, rotY: -0.4 });
  ownGeometry(bobble.group, 'cabin-prop:bobblehead');
  interior.add(bobble.group);

  const couch = addProp(
    P.makeCouch(M, { x: -5.50, z: 2.20 }),
    'cabin-couch',
    { kind: 'seat' },
  );
  const coffeeTable = addProp(P.makeCoffeeTable(M, { x: -3.75, z: 2.15, w: 1.18, d: 0.66, rotY: 0.05 }), 'cabin-coffee-table');
  const pizza = P.makePizzaBox(M, { x: -3.82, y: coffeeTable.top, z: 2.10, rotY: 0.10 });
  const bong = P.makeBong(M, { x: -3.42, y: coffeeTable.top, z: 2.22, rotY: -0.2 });
  const shrooms = P.makeMushrooms(M, { x: -4.08, y: coffeeTable.top, z: 2.32, rotY: 0.4 });
  interior.add(pizza.group, bong.group, shrooms.group);

  const tv = addProp(P.makeTv(M, { x: -2.30, z: 2.15, rotY: -Math.PI / 2, w: 1.18 }), 'cabin-tv');
  const tvGlow = new THREE.PointLight(0x8ab6ff, 0, 3.8, 2);
  tvGlow.position.copy(tv.screenPos).add(new THREE.Vector3(-0.45, 0, 0));
  interior.add(tvGlow);

  /* makeSideboard's fronts face local +Z. Build it around a local origin, then
   * turn that face into the room and mount its back two centimetres off the
   * south wall. This scene-owned placement avoids changing the shared prop
   * while keeping its collider honest. */
  const sideboardWidth = 1.72;
  const sideboardDepth = 0.44;
  const sideboardCentre = new THREE.Vector3(-1.52, 0, MAIN.z1 - sideboardDepth / 2 - 0.02);
  const sideboardBuilt = P.makeSideboard(M, { x: 0, z: 0, w: sideboardWidth, d: sideboardDepth });
  sideboardBuilt.group.name = 'cabin-entertainment-sideboard';
  sideboardBuilt.group.position.copy(sideboardCentre);
  sideboardBuilt.group.rotation.y = Math.PI;
  sideboardBuilt.bounds = [
    [sideboardCentre.x - sideboardWidth / 2, 0, sideboardCentre.z - sideboardDepth / 2],
    [sideboardCentre.x + sideboardWidth / 2, sideboardBuilt.top, sideboardCentre.z + sideboardDepth / 2],
  ];
  const sideboard = addProp(sideboardBuilt, 'cabin-sideboard');
  const radioPos = new THREE.Vector3(sideboardCentre.x, sideboard.top + 0.12, sideboardCentre.z - 0.08);
  const radio = P.makeRadio(M, { x: radioPos.x, y: sideboard.top, z: radioPos.z, rotY: Math.PI });
  ownGeometry(radio.group, 'cabin-prop:radio');
  interior.add(radio.group);
  const wallClock = P.makeWallClock(M, {
    // Offset from the window's centre mullion while staying visibly above
    // the glazing and the entertainment stand below it.
    x: sideboardCentre.x - 0.28,
    // The 16 cm case occupies the narrow, solid strip between the picture
    // window head (2.24 m) and the porch-awning envelope (2.47 m).
    y: 2.37,
    z: MAIN.z1 - 0.01,
    rotY: Math.PI,
    r: 0.08,
  });
  wallClock.group.name = 'cabin-south-wall-clock';
  markSemanticPlacement(wallClock.group, {
    id: 'cabin.bedroom.south-wall-clock',
    surface: {
      kind: 'wall', axis: 'z', coordinate: MAIN.z1, side: 'negative',
      maxGap: 0.035, maxPenetration: 0.035,
    },
    upright: { maxDegrees: 1 },
  });
  ownGeometry(wallClock.group, 'cabin-fixture:wall-clock', { checkSupport: false });
  interior.add(wallClock.group);

  // A modest breakfast/game table gives the broad one-room cabin a centre
  // without blocking the front-door, kitchen, bathroom or sleeping aisles.
  const centralCluster = group('cabin-central-table-cluster');
  ownGeometry(centralCluster, 'cabin-prop:central-table-cluster');
  const rugMaterial = mat({ color: 0x6f3f2d, roughness: 1 });
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.78, 1.78, 0.022, 32), rugMaterial);
  rug.name = 'cabin-central-braided-rug';
  rug.position.set(0.72, 0.016, 0.62);
  rug.scale.z = 0.68;
  rug.receiveShadow = true;
  centralCluster.add(rug);
  centralCluster.add(cylinder({ r: 0.72, h: 0.10, pos: [0.72, 0.76, 0.62], mat: M.darkWood }));
  centralCluster.add(cylinder({ r: 0.14, h: 0.70, pos: [0.72, 0.36, 0.62], mat: M.cabinLogDark }));
  centralCluster.add(cylinder({ r: 0.43, h: 0.07, pos: [0.72, 0.045, 0.62], mat: M.cabinLogDark }));
  centralCluster.add(cylinder({ r: 0.055, h: 0.12, pos: [0.48, 0.87, 0.52], mat: M.paper }));
  centralCluster.add(box({ size: [0.34, 0.055, 0.24], pos: [0.92, 0.84, 0.72], mat: M.paper, rotY: -0.24 }));
  interior.add(centralCluster);
  addBounds(
    colliders,
    [[0.0, 0, -0.10], [1.44, 0.84, 1.34]],
    'cabin-central-table',
    { kind: 'prop' },
  );
  const westChair = P.makeChair(M, { x: -0.38, z: 0.62, rotY: Math.PI / 2 });
  westChair.group.name = 'cabin-central-chair-west';
  addProp(westChair, 'cabin-central-chair-west', { kind: 'seat' });
  const eastChair = P.makeChair(M, { x: 1.82, z: 0.62, rotY: -Math.PI / 2 });
  eastChair.group.name = 'cabin-central-chair-east';
  addProp(eastChair, 'cabin-central-chair-east', { kind: 'seat' });

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
    z0: 3.78,
    // makeCloset adds a 14 cm back carcass beyond z1; reserve exactly that
    // depth so its outer face, rather than its inner panel, meets the wall.
    z1: MAIN.z1 - 0.14,
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
  closet.group.name = 'cabin-wardrobe';
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
  /* Practical long guns live upstairs for the optional range. These are new
   * shared-armory mounts, not relocations: the dungeon keeps its AK-47 and
   * Barrett racks and their independent taken/ammunition state. The carbine
   * uses the open north-wall return; the shotgun occupies the clear east-wall
   * bay between the bathroom corner and kitchen. */
  const rifleRack = Object.freeze({
    parent: interior,
    racks: Object.freeze([
      Object.freeze({ id: 'carbine', x: 4.42, y: 0, z: MAIN.z0 + 0.24, rotY: 0 }),
      Object.freeze({ id: 'shotgun', x: MAIN.x1 - 0.24, y: 0, z: -3.18, rotY: -Math.PI / 2 }),
    ]),
  });
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
  /* A thin native tile liner belongs to the room, not to the exterior shell.
   * It masks the timber envelope from every interior bathroom view while
   * preserving the structural wall and collision volumes behind it. */
  for (const liner of [
    boxFrom(BATH.x0 + 0.035, 0.018, BATH.z0 + 0.010, BATH.x1 - 0.035, 2.42, BATH.z0 + 0.042, M.splash, {
      name: 'cabin-bathroom-liner-north', cast: false,
    }),
    boxFrom(BATH.x0 + 0.010, 0.018, BATH.z0 + 0.035, BATH.x0 + 0.042, 2.42, BATH.z1 - 0.035, M.splash, {
      name: 'cabin-bathroom-liner-west', cast: false,
    }),
    boxFrom(BATH.x1 - 0.042, 0.018, BATH.z0 + 0.035, BATH.x1 - 0.010, 2.42, BATH.z1 - 0.035, M.splash, {
      name: 'cabin-bathroom-liner-east', cast: false,
    }),
  ]) {
    ownGeometry(liner, 'cabin-bathroom-liner', { structural: true });
    bathroom.add(liner);
  }
  /* The lean-to shares the main cabin's north wall. Tile the two returns and
   * the door header on the bathroom side so the thick timber blocks do not
   * read as protruding into the room around the open door. */
  for (const liner of [
    boxFrom(BATH.x0 + 0.035, 0.018, BATH.z1 - 0.042, BATH_DOOR.x0, 2.42, BATH.z1 - 0.010, M.splash, {
      name: 'cabin-bathroom-liner-south-west', cast: false,
    }),
    boxFrom(BATH_DOOR.x1, 0.018, BATH.z1 - 0.042, BATH.x1 - 0.035, 2.42, BATH.z1 - 0.010, M.splash, {
      name: 'cabin-bathroom-liner-south-east', cast: false,
    }),
    boxFrom(BATH_DOOR.x0, BATH_DOOR.h, BATH.z1 - 0.042, BATH_DOOR.x1, 2.42, BATH.z1 - 0.010, M.splash, {
      name: 'cabin-bathroom-liner-south-header', cast: false,
    }),
  ]) {
    ownGeometry(liner, 'cabin-bathroom-liner', { structural: true });
    bathroom.add(liner);
  }
  const tub = P.makeTub(M, { x0: -2.90, z0: -8.12, x1: -1.83, z1: -6.20 });
  const toilet = P.makeToilet(M, { x: -0.74, z: -7.94, rotY: 0 });
  toilet.group.name = 'cabin-bath-toilet';
  /* Collider boxes are padded by two centimetres on every horizontal face.
   * Leave the matching allowance on both fixtures and their wall colliders,
   * so the gameplay volumes meet at the tiled interior face instead of
   * penetrating the structural north/east walls. */
  toilet.bounds[0][2] = BATH.z0 + 0.04;
  const toiletAssembly = 'cabin-fixture:toilet-and-wall-roll';
  ownGeometry(toilet.group, toiletAssembly, { checkSupport: false });
  const bathSink = P.makeBathSink(M, { x: -0.39, z: -5.75, rotY: -Math.PI / 2 });
  bathSink.group.name = 'cabin-bath-sink';
  /* makeBathSink's returned bounds are authored for its unrotated footprint.
   * This sink faces the east wall, so describe the rotated footprint rather
   * than leaving a collider in its former orientation. */
  bathSink.bounds = [[-0.64, 0, -6.05], [BATH.x1 - 0.04, 0.84, -5.45]];
  ownGeometry(bathSink.group, 'cabin-fixture:bath-sink', { checkSupport: false });
  bathroom.add(tub.group, toilet.group, bathSink.group);
  /* makeToilet supplies the roll and crossbar, while this room supplies the
   * wall bracket. Two short returns visibly join that holder to the tiled
   * north wall, so it is no longer a roll suspended beside the pan. */
  const toiletRollBracket = group('cabin-bath-toilet-roll-wall-bracket');
  const rollX = toilet.group.position.x - 0.34;
  const rollZ = toilet.group.position.z - 0.10;
  toiletRollBracket.add(box({
    name: 'cabin-bath-toilet-roll-backplate',
    size: [0.18, 0.12, 0.026],
    pos: [rollX, 0.62, BATH.z0 + 0.055],
    mat: M.chrome,
  }));
  for (const sx of [-0.055, 0.055]) {
    toiletRollBracket.add(box({
      name: 'cabin-bath-toilet-roll-return',
      size: [0.022, 0.022, rollZ - (BATH.z0 + 0.068)],
      pos: [rollX + sx, 0.62, (rollZ + BATH.z0 + 0.068) / 2],
      mat: M.chrome,
    }));
  }
  ownGeometry(toiletRollBracket, toiletAssembly, { checkSupport: false });
  bathroom.add(toiletRollBracket);
  addBounds(colliders, tub.bounds, 'cabin-bath-tub', { kind: 'prop' });
  const toiletCollider = addBounds(
    colliders,
    toilet.bounds,
    'cabin-bath-toilet',
    { kind: 'seat' },
  );
  addBounds(colliders, bathSink.bounds, 'cabin-bath-sink', { kind: 'prop' });

  const bathDoorBuilt = makeTimberDoor(M, {
    name: 'cabin-bathroom-door',
    hingeX: BATH_DOOR.x0 + 0.04,
    hingeZ: MAIN.z0 - 0.03,
    width: BATH_DOOR.x1 - BATH_DOOR.x0 - 0.08,
    height: BATH_DOOR.h - 0.05,
  });
  ownGeometry(bathDoorBuilt.group, 'cabin-shell');
  interior.add(bathDoorBuilt.group);
  const bathDoorCollider = addBounds(
    colliders,
    [[0, 0, 0], [0, BATH_DOOR.h, 0]],
    'cabin-bathroom-door-leaf',
    { kind: 'door' },
  );
  ownGeometry(bathDoorCollider, 'cabin-shell-collision');

  /* ---------------------------------------------------------------- */
  /* Lighting and persistent domestic state.                          */
  /* ---------------------------------------------------------------- */

  const ceilingFixtures = [
    P.makeCeilingLight(M, { x: -2.7, z: 0.8, y: 2.78 }),
    P.makeCeilingLight(M, { x: 0.5, z: -1.6, y: 2.78 }),
    P.makeCeilingLight(M, { x: 3.55, z: 1.15, y: 2.78 }),
  ];
  const ceilingLights = ceilingFixtures.map((fixture) => {
    ownGeometry(fixture.group, `cabin-fixture:ceiling-light:${fixture.pos.x}`, { checkSupport: false });
    interior.add(fixture.group);
    const light = new THREE.PointLight(0xffd6a0, 0, 8.8, 1.75);
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
  const interiorFill = new THREE.PointLight(0xffdfbd, 0, 12.5, 2);
  interiorFill.position.set(0.35, 1.72, 0.15);
  interior.add(interiorFill);

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
    logsSplit: 0,
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
      light.intensity = state.lightsOn ? 1.30 : 0;
    }
    interiorFill.intensity = state.lightsOn ? 0.46 : 0;
    return state.lightsOn;
  };
  const setLamp = (on, { automatic = false } = {}) => {
    if (automatic && state.lampManual) return state.lampOn;
    state.lampOn = Boolean(on);
    lamp.bulb.material = state.lampOn ? M.bulbOn : M.bulbOff;
    lampLight.intensity = state.lampOn ? 1.08 : 0;
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
    onUse: () => {
      ctx.onDrawingBoard?.();
      hud.say?.('<em>LAY LOW. KEEP THE PHONE CLOSE. DO NOT COME BACK UNTIL LOU CALLS.</em>', 5200);
    },
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
      rifleRack,
      radioNeedle: radio.needle,
      phoneProp: phone,
      chair: chair.group,
      fridgePos,
      bathroom: BATH,
      mirrorMesh: bathSink.mirror,
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
  const heroSlots = new Set(['bed.poster', 'couch.left', 'south.wide', 'poster.pinup', 'feature.denver']);
  const westZ = [-4.42, -3.72, -3.02, -2.30, 1.66, 2.34, 3.04, 3.74, 4.42];
  const eastZ = [-4.36, -3.66, -2.96, -2.24, 2.15, 2.88, 3.60, 4.32];
  for (const y of [1.48, 2.14]) {
    for (const z of westZ) anchors.push({ x: -5.86, y, z, rotY: Math.PI / 2 });
  }
  for (const y of [1.48, 2.14]) {
    for (const z of eastZ) anchors.push({ x: 5.86, y, z, rotY: -Math.PI / 2 });
  }
  /* Bathroom art is keyed by meaning instead of appended to a positional
   * array. The old array had 34 main-room anchors for 33 main-room slots, so
   * bath.toilet landed on the east wall of the cabin and every remaining bath
   * picture shifted one position. These five anchors also keep every frame
   * away from the tub riser and curtain rail. */
  const bathroomAnchors = Object.freeze({
    'bath.toilet': { x: BATH.x1 - 0.03, y: 1.98, z: -7.54, rotY: -Math.PI / 2, h: 0.34 },
    'bath.toilet.poster': { x: BATH.x1 - 0.03, y: 2.06, z: -6.82, rotY: -Math.PI / 2, h: 0.42 },
    'bath.far': { x: -0.78, y: 2.12, z: BATH.z0 + 0.05, rotY: 0, h: 0.36 },
    /* This picture used to occupy the same east-wall rectangle as the real
     * sink mirror. Give it its own west-wall bay above the tub instead. */
    'bath.mirror': { x: BATH.x0 + 0.03, y: 2.22, z: -6.34, rotY: Math.PI / 2, h: 0.30 },
    'bath.high': { x: BATH.x0 + 0.03, y: 2.22, z: -5.52, rotY: Math.PI / 2, h: 0.28 },
  });

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
    const at = bathroomAnchors[slot] ?? anchors[i];
    if (!info || !at) return;
    const feature = slot.startsWith('feature.');
    const h = at.h ?? (feature ? 0.56 : heroSlots.has(slot) ? 0.38 : 0.25 + (i % 3) * 0.025);
    const w = h * THREE.MathUtils.clamp(info.aspect || 0.8, 0.55, feature ? 1.65 : 1.45);
    const frame = P.makeFrame(M, { ...at, w, h, texture: info.texture });
    root.add(frame.group);
    registerArt(frame.group, slot, info);
    frames.push({ slot, mesh: frame.group, info });
  });

  // Cloth and crest keep the apartment's non-frame art types intact.
  for (const spec of [
    /* The main banner belongs on the solid south-mid wall, between the
     * picture window and front door. Its old edge sat across the glazing at
     * awning height; this placement leaves both architectural openings clear. */
    { slot: 'banner.main', x: 0.70, y: 1.85, z: MAIN.z1 - 0.04, rotY: Math.PI, w: 1.15, h: 0.48 },
    { slot: 'banner.twitch', x: 2.75, y: 2.55, z: MAIN.z0 + 0.04, rotY: 0, w: 0.95, h: 0.40 },
  ]) {
    const info = gear.get(spec.slot);
    if (!info) continue;
    const banner = P.makeBanner(M, { ...spec, texture: info.texture });
    if (spec.slot === 'banner.main') markSemanticPlacement(banner.group, {
      id: 'cabin.bedroom.austin-banner-wall-mount',
      surface: {
        kind: 'wall', axis: 'z', coordinate: MAIN.z1, side: 'negative',
        maxGap: 0.055, maxPenetration: 0.055,
      },
      upright: { maxDegrees: 1 },
    });
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
    {
      slot: 'sideboard.photo',
      x: sideboard.group.position.x - 0.43,
      y: sideboard.top,
      z: sideboard.group.position.z - 0.08,
      rotY: Math.PI - 0.25,
      h: 0.18,
    },
    /* Left of the desk mat and against the back half of the desktop. The old
     * x=0.24/z=-4.39 position sat directly on the mouse-pad corner. */
    { slot: 'desk.photo', x: -0.08, y: desk.top, z: -4.76, rotY: 0.25, h: 0.14 },
    /* Back-left corner of the nightstand: visible from the bed and clear of
     * both the alarm clock and the physical phone/interaction volume. */
    { slot: 'night.photo', x: -4.08, y: nightstand.top, z: -4.56, rotY: 0.18, h: 0.15 },
    // This was in the apartment closet shrine. It remains a deliberately
    // separate, propped photograph rather than becoming generic wall art.
    {
      slot: 'shrine.b',
      x: sideboard.group.position.x + 0.57,
      y: sideboard.top,
      z: sideboard.group.position.z - 0.10,
      rotY: Math.PI + 0.22,
      h: 0.19,
    },
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
