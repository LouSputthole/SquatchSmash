/**
 * Late-game two-storey apartment world.
 *
 * This is intentionally a separate scene, not a reskin of the original flat.
 * It reuses the original apartment's prop and manifest-art seams so every
 * home activity can be mounted by the runtime, while the shell, circulation,
 * city view, collision and staging are owned here.
 */

import * as THREE from 'three';
import { box, boxFrom, cylinder, plane, mat, collider, group, yawToward } from '../world/build.js';
import { makeMaterials } from '../world/materials.js';
import * as T from '../world/textures.js';
import * as P from '../world/props.js';
import { resolveGear } from '../world/gear.js';
import { WALL_SLOTS, BATH_SLOTS } from '../world/apartment.js';
import { Inventory, bindHeldItem } from '../core/inventory.js';
import { buildInteractiveBong } from '../world/bong.js';
import { makeAnswerMachine } from '../world/dressing.js';
import {
  LUXURY_LAYOUT,
  LUXURY_STAIR_RISE,
  LUXURY_STAIR_RUN,
  luxuryGroundAt,
} from './layout.js';

const WALL = LUXURY_LAYOUT.wall;
const MAIN_Y = LUXURY_LAYOUT.mainY;
const LOFT_Y = LUXURY_LAYOUT.loftY;
const CEILING_Y = LUXURY_LAYOUT.ceilingY;
const DOOR_H = LUXURY_LAYOUT.entry.h;
const STAIR_STEPS = LUXURY_LAYOUT.stair.steps;

/** Architectural dimensions are public so a runtime and verifier never need
 * to reverse-engineer them from meshes. */
export const LUXURY_APARTMENT = LUXURY_LAYOUT;

/** Apartment art that is authored as cloth or a wall crest rather than a
 * conventional framed print. It is still visibly hung in this scene. */
const APARTMENT_HUNG_AUX_ART_SLOTS = Object.freeze([
  'banner.main', 'banner.twitch', 'crest.round',
]);

/** Personal photographs that remain physical display objects: four standing
 * frames, the closet shrine, and the photograph tucked under the bed. */
export const LUXURY_STANDING_ART_SLOTS = Object.freeze([
  'shelf.photo', 'sideboard.photo', 'desk.photo', 'night.photo', 'shrine.b', 'bed.under',
]);

/** Textures whose semantic home is the imported prop itself, never a salon
 * frame. Keeping this explicit prevents a beer label or egg carton from being
 * promoted to wall art merely to make a count pass. */
export const LUXURY_PROP_ART_SLOTS = Object.freeze([
  'closet.back', 'closet.shirt.a', 'closet.shirt.b',
  'fridge.magnet', 'fridge.photo.a', 'fridge.photo.b',
  'sticker.tower', 'sticker.fridge', 'sticker.fridge.b',
  'zyn.lid', 'label.beer', 'label.whiskey', 'eggs.carton', 'cereal.box',
]);

/** Non-wall art the original apartment resolves through the manifest. */
const APARTMENT_AUX_ART_SLOTS = Object.freeze([
  ...APARTMENT_HUNG_AUX_ART_SLOTS,
  ...LUXURY_STANDING_ART_SLOTS,
  ...LUXURY_PROP_ART_SLOTS,
]);

/** Empty manifest hooks reserved for later-game memories. Adding the real art
 * is only a manifest edit; the gallery layout and interactions already exist. */
export const LUXURY_EXTRA_ART_SLOTS = Object.freeze([
  'luxury.night-watch',
  'luxury.ascension',
  'luxury.foyer.statement',
  'luxury.city.night',
  'luxury.loft.triptych.a',
  'luxury.loft.triptych.b',
  'luxury.loft.triptych.c',
  'luxury.stair.memory.a',
  'luxury.stair.memory.b',
  'luxury.bedroom.private',
  'luxury.office.victory',
  'luxury.arcade.marquee',
  'luxury.poker.champions',
  'luxury.bath.monochrome',
]);

/** Every art-bearing slot used by the current apartment, plus the new hooks. */
export const LUXURY_ART_SLOTS = Object.freeze([...new Set([
  ...WALL_SLOTS.map(({ slot }) => slot),
  ...BATH_SLOTS.map(({ slot }) => slot),
  ...APARTMENT_AUX_ART_SLOTS,
  ...LUXURY_EXTRA_ART_SLOTS,
])]);

/** Art physically hung on a wall: inherited frames, the two banners and
 * crest, and the fourteen authored late-game works. */
export const LUXURY_HUNG_ART_SLOTS = Object.freeze([...new Set([
  ...WALL_SLOTS.map(({ slot }) => slot),
  ...BATH_SLOTS.map(({ slot }) => slot),
  ...APARTMENT_HUNG_AUX_ART_SLOTS,
  ...LUXURY_EXTRA_ART_SLOTS,
])]);

/** Every genuine piece shown as art, including the six standing/hidden-photo
 * displays. Prop graphics are tracked separately by LUXURY_PROP_ART_SLOTS. */
export const LUXURY_DISPLAY_ART_SLOTS = Object.freeze([...new Set([
  ...LUXURY_HUNG_ART_SLOTS,
  ...LUXURY_STANDING_ART_SLOTS,
])]);

const noopAudio = Object.freeze({ play() {}, startLoop() { return null; }, stopLoop() {} });
const noopInteraction = Object.freeze({
  register(target, descriptor) {
    target.userData ??= {};
    target.userData.interact = descriptor;
    return target;
  },
});

function own(target, assemblyId, metadata = {}) {
  if (!target) return target;
  target.userData ??= {};
  target.userData.geometryGate = {
    ...(target.userData.geometryGate ?? {}),
    assemblyId,
    ...metadata,
  };
  return target;
}

function structural(target, assemblyId, wallAxis = null) {
  return own(target, assemblyId, {
    structural: true,
    ...(wallAxis ? { wall: true, wallAxis } : {}),
  });
}

function addBounds(colliders, bounds, name, yOffset = 0, assemblyId = null) {
  const low = [bounds[0][0], bounds[0][1] + yOffset, bounds[0][2]];
  const high = [bounds[1][0], bounds[1][1] + yOffset, bounds[1][2]];
  const volume = collider(low, high);
  volume.name = name;
  if (assemblyId) own(volume, assemblyId);
  colliders.push(volume);
  return volume;
}

function invisibleMaterial() {
  return new THREE.MeshBasicMaterial({ visible: false });
}

function proxy(name, size, position, parent) {
  const target = box({
    name,
    size,
    pos: position,
    mat: invisibleMaterial(),
    cast: false,
    receive: false,
  });
  target.userData.interactionProxy = true;
  parent.add(target);
  return target;
}

function pose(position, lookAt, pitch = -0.04, exit = null) {
  const p = new THREE.Vector3(...position);
  const look = new THREE.Vector3(...lookAt);
  return {
    position: p,
    yaw: yawToward(p, look),
    pitch,
    exit: new THREE.Vector3(...(exit ?? [position[0], MAIN_Y, position[2] + 0.8])),
  };
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

/** Build the late-game luxury home. All callbacks are optional; the returned
 * handles let the scene runtime own story and UI state without reaching into
 * geometry by name. */
export async function buildLuxuryApartment(ctx = {}) {
  if (!ctx.scene?.add) throw new TypeError('buildLuxuryApartment requires ctx.scene');

  const scene = ctx.scene;
  const interaction = ctx.interaction ?? noopInteraction;
  const audio = ctx.audio ?? noopAudio;
  const inventory = ctx.inventory ?? new Inventory(5);
  const gear = await resolveGear(LUXURY_ART_SLOTS);
  const propTexture = (slot) => gear.get(slot)?.real ? gear.get(slot).texture : null;
  P.beerLabelMaterial(propTexture('label.beer'));

  const M = makeLuxuryMaterials(makeMaterials());
  const root = group('luxury-apartment');
  const architecture = group('luxury-architecture');
  const furnishings = group('luxury-furnishings');
  const loftContents = group('luxury-loft-contents');
  const city = group('luxury-city-view');
  loftContents.position.y = LOFT_Y;
  root.add(city, architecture, furnishings, loftContents);
  scene.add(root);

  const colliders = [];
  const occluders = [];
  const floorZones = [];
  const utilityTargets = {};
  const artTargets = {};
  const minigameAnchors = {};
  const gameStations = {};
  const ticks = [];
  const disposables = [];

  const shell = buildShell({ root: architecture, city, M, colliders, occluders, floorZones });
  const doors = buildDoors({ root: architecture, M, colliders });
  const stairs = buildStairAndLoft({ root: architecture, M, colliders, floorZones });
  const lights = buildLighting({ root, architecture, loftContents, M });

  const state = {
    mainLightsOn: false,
    loftLightsOn: false,
    mainLightsManual: false,
    loftLightsManual: false,
    frontDoorOpen: false,
    elevatorOpen: false,
    fridgeOpen: false,
    fridgeT: 0,
    tvOn: false,
    radioOn: false,
    pcOn: false,
    phoneTaken: false,
    showered: false,
    dressed: false,
    answeringMachinePlaying: false,
    messagesWaiting: 1,
    revolverTaken: false,
    ammoTaken: false,
    bongUses: 0,
    shroomsTaken: false,
    whiteLineConsumed: false,
    shadesClosed: false,
    shadesT: 0,
    cityMinutes: Number.isFinite(ctx.time?.minutes) ? ctx.time.minutes : 20 * 60 + 30,
  };
  bindHeldItem(state, inventory);

  const domestic = buildDomesticZones({
    furnishings,
    loftContents,
    M,
    gear,
    propTexture,
    colliders,
    floorZones,
  });
  const games = buildGameZone({ root: furnishings, M, colliders });
  const gallery = buildGallery({
    root,
    architecture,
    M,
    gear,
    domestic,
    interaction,
    ctx,
    artTargets,
  });

  const screens = Object.freeze({
    pc: domestic.desk.screen,
    tv: domestic.tv.screen,
    arcade: games.arcade.screen,
    console: domestic.tv.screen,
  });

  const poses = Object.freeze({
    bed: pose([7.02, LOFT_Y + 1.05, -6.20], [7.02, LOFT_Y + 0.8, -7.10], -0.08, [5.55, LOFT_Y, -5.70]),
    couch: pose([3.15, 1.12, 3.25], [7.55, 1.0, 3.25], -0.03, [1.85, MAIN_Y, 3.25]),
    desk: pose([0.12, LOFT_Y + 1.24, -5.68], [0.12, LOFT_Y + 0.88, -6.55], -0.05, [-0.75, LOFT_Y, -4.90]),
    tv: pose([3.18, 1.12, 3.25], [7.72, 0.92, 3.25], -0.03, [1.85, MAIN_Y, 3.25]),
    radio: pose([1.70, 1.10, 5.95], [1.70, 0.85, 6.70], -0.12, [1.70, MAIN_Y, 5.05]),
    kitchen: pose([8.90, 1.62, -0.20], [10.35, 0.92, -0.20], -0.25, [8.15, MAIN_Y, 0.80]),
    shower: pose([-5.85, LOFT_Y + 1.64, -6.05], [-5.85, LOFT_Y + 1.85, -6.75], -0.05, [-4.85, LOFT_Y, -5.65]),
    wardrobe: pose([9.02, LOFT_Y + 1.10, -3.65], [9.65, LOFT_Y + 1.2, -4.25], -0.02, [8.12, LOFT_Y, -3.15]),
    arcade: pose([-5.42, 1.30, 2.10], [-5.42, 1.18, 1.18], -0.04, [-4.55, MAIN_Y, 2.72]),
    poker: pose([-2.45, 1.12, 4.82], [-2.45, 0.76, 3.80], -0.15, [-1.45, MAIN_Y, 5.08]),
    darts: pose([-8.85, 1.55, 3.95], [-10.72, 1.72, 3.95], -0.02, [-8.20, MAIN_Y, 3.95]),
    console: pose([3.18, 1.12, 3.25], [7.72, 0.92, 3.25], -0.03, [1.85, MAIN_Y, 3.25]),
  });

  const spawns = Object.freeze({
    arrival: Object.freeze({ position: new THREE.Vector3(-9.30, MAIN_Y + 1.68, 5.72), yaw: -Math.PI / 2 }),
    main: Object.freeze({ position: new THREE.Vector3(0.4, MAIN_Y + 1.68, 1.2), yaw: Math.PI }),
    loft: Object.freeze({ position: new THREE.Vector3(-7.10, LOFT_Y + 1.68, -1.85), yaw: Math.PI * 0.5 }),
    bed: Object.freeze({ position: poses.bed.exit.clone().add(new THREE.Vector3(0, 1.68, 0)), yaw: poses.bed.yaw }),
    arcade: Object.freeze({ position: poses.arcade.exit.clone().add(new THREE.Vector3(0, 1.68, 0)), yaw: poses.arcade.yaw }),
  });

  const setLights = (zone, on, { automatic = false } = {}) => {
    const requested = Boolean(on);
    const applyMain = zone === 'main' || zone === 'all';
    const applyLoft = zone === 'loft' || zone === 'all';
    if (!applyMain && !applyLoft) throw new RangeError(`Unknown luxury apartment light zone: ${zone}`);

    if (applyMain && !(automatic && state.mainLightsManual)) {
      state.mainLightsOn = requested;
      if (!automatic) state.mainLightsManual = true;
      for (const fixture of lights.main) {
        fixture.light.intensity = requested ? fixture.intensity : 0;
        fixture.bulb.material = requested ? M.bulbOn : M.bulbOff;
      }
    }
    if (applyLoft && !(automatic && state.loftLightsManual)) {
      state.loftLightsOn = requested;
      if (!automatic) state.loftLightsManual = true;
      for (const fixture of lights.loft) {
        fixture.light.intensity = requested ? fixture.intensity : 0;
        fixture.bulb.material = requested ? M.bulbOn : M.bulbOff;
      }
    }
    return zone === 'main' ? state.mainLightsOn
      : zone === 'loft' ? state.loftLightsOn
        : state.mainLightsOn && state.loftLightsOn;
  };

  const setCityTime = (minutes) => {
    const day = ((Number(minutes) || 0) % 1440 + 1440) % 1440;
    state.cityMinutes = day;
    const daylight = THREE.MathUtils.smoothstep(Math.sin((day - 360) / 720 * Math.PI), -0.2, 0.7);
    const skyPhase = day < 5 * 60 ? 'night'
      : day < 7 * 60 ? 'dawn'
        : day < 17 * 60 ? 'day'
          : day < 20 * 60 ? 'dusk'
            : 'night';
    if (shell.citySky.material.userData.citySkyPhase !== skyPhase) {
      shell.citySky.material.map = T.citySkyline(skyPhase);
      shell.citySky.material.userData.citySkyPhase = skyPhase;
      shell.citySky.material.needsUpdate = true;
    }
    shell.citySky.material.color.set(0xffffff);
    shell.citySky.material.opacity = 0.72 + daylight * 0.28;
    shell.cityLights.material.opacity = 1 - daylight * 0.94;
    M.cityDark.color.set(0x101722).lerp(new THREE.Color(0x748295), daylight);
    M.cityMid.color.set(0x162131).lerp(new THREE.Color(0x8d9aaa), daylight);
    M.cityBlue.color.set(0x0d1b2b).lerp(new THREE.Color(0x667b92), daylight);
    M.cityRoof.color.set(0x25354a).lerp(new THREE.Color(0x52667a), daylight);
    // Keep the premium interior legible after dark without flattening the
    // daylight contrast from the glass walls.
    lights.ambient.intensity = 0.36 + daylight * 0.48;
    lights.sun.intensity = daylight * 1.15;
    lights.sun.color.set(day < 600 || day > 1020 ? 0xffb26e : 0xdfeaff);
    return day;
  };

  const setShades = (closed) => {
    state.shadesClosed = Boolean(closed);
    return state.shadesClosed;
  };

  const register = (id, target, descriptor) => {
    utilityTargets[id] = target;
    target.userData ??= {};
    target.userData.utilityId = id;
    interaction.register(target, descriptor);
    return target;
  };

  register('frontDoor', doors.front.target, {
    label: () => state.frontDoorOpen ? 'Close the <b>front door</b>' : 'Open the <b>front door</b>',
    onUse: () => {
      const result = ctx.onFrontDoor?.(state.frontDoorOpen);
      if (result !== false) doors.front.toggle();
    },
  });
  register('elevator', doors.elevator.target, {
    label: () => state.elevatorOpen ? 'Close the private <b>elevator</b>' : 'Call the private <b>elevator</b>',
    onUse: () => {
      const result = ctx.onElevator?.(state.elevatorOpen);
      if (result !== false) doors.elevator.toggle();
    },
  });

  register('bed', domestic.targets.bed, {
    label: 'Sit on the <b>bed</b> · hold to sleep',
    holdLabel: 'Settling into the <b>bed</b>…',
    hold: 0.62,
    onTap: () => ctx.onBed?.('sit'),
    onUse: () => ctx.onBed?.('sleep'),
  });
  register('couch', domestic.targets.couch, {
    label: 'Sit in the sunken <b>lounge</b>',
    onUse: () => ctx.onCouch?.(),
  });
  register('desk', domestic.desk.panel, {
    label: () => state.pcOn ? 'Use the <b>loft PC</b>' : 'Wake the <b>loft PC</b>',
    onUse: () => {
      state.pcOn = true;
      ctx.onDesk?.();
      ctx.onMinigame?.('pc', gameStations.pc);
    },
  });
  register('tv', domestic.tv.group, {
    label: () => state.tvOn ? 'Use the <b>cinema wall</b>' : 'Turn on the <b>cinema wall</b>',
    holdLabel: 'Opening the <b>console library</b>…',
    hold: 0.55,
    onTap: () => {
      state.tvOn = !state.tvOn;
      ctx.onTv?.(state.tvOn);
    },
    onUse: () => ctx.onMinigame?.('console', gameStations.console),
  });
  register('radio', domestic.radio.group, {
    label: () => state.radioOn ? 'Tune the <b>hi-fi</b>' : 'Turn on the <b>hi-fi</b>',
    holdLabel: 'Tuning the <b>hi-fi</b>…',
    hold: 0.55,
    onTap: () => {
      state.radioOn = !state.radioOn;
      ctx.onRadio?.(state.radioOn);
    },
    onUse: () => ctx.onRadio?.('tune'),
  });
  register('phone', domestic.targets.phone, {
    label: () => state.phoneTaken ? 'Use your <b>phone</b>' : 'Pick up your <b>phone</b>',
    onUse: () => {
      if (!state.phoneTaken && !inventory.full) inventory.add('phone');
      state.phoneTaken = inventory.has('phone');
      domestic.phone.group.visible = !state.phoneTaken;
      ctx.onPhone?.();
    },
  });
  register('fridge', domestic.fridge.doorPivot, {
    label: () => state.fridgeOpen ? 'Close the panelled <b>fridge</b>' : 'Open the panelled <b>fridge</b>',
    onUse: () => {
      state.fridgeOpen = !state.fridgeOpen;
      ctx.onFridge?.(state.fridgeOpen);
    },
  });
  register('kitchen', domestic.targets.kitchen, {
    label: 'Use the chef <b>kitchen</b>',
    onUse: () => ctx.onCook?.(),
  });
  register('shower', domestic.tub.group, {
    label: () => state.showered ? 'Use the rainfall <b>shower</b>' : 'Take a rainfall <b>shower</b>',
    onUse: () => {
      const result = ctx.onShower?.();
      if (result !== false) state.showered = true;
    },
  });
  register('wardrobe', domestic.closet.group, {
    label: 'Choose clothes from the walk-in <b>wardrobe</b>',
    onUse: () => {
      const result = ctx.onWardrobe?.();
      if (result !== false) state.dressed = true;
    },
  });
  register('toilet', domestic.toilet.group, {
    label: 'Sit at the <b>toilet</b> · hold to aim',
    holdLabel: 'Aiming at the <b>toilet</b>…',
    hold: 0.70,
    onTap: () => ctx.onToilet?.('sit'),
    onUse: () => ctx.onToilet?.('aim'),
  });
  register('mainLights', lights.main[0].fixture, {
    label: () => state.mainLightsOn ? 'Main-floor lights <b>off</b>' : 'Main-floor lights <b>on</b>',
    onUse: () => setLights('main', !state.mainLightsOn),
  });
  register('loftLights', lights.loft[0].fixture, {
    label: () => state.loftLightsOn ? 'Loft lights <b>off</b>' : 'Loft lights <b>on</b>',
    onUse: () => setLights('loft', !state.loftLightsOn),
  });
  register('cityGlass', shell.cityGlassTarget, {
    label: 'Look out over the <b>city</b>',
    onUse: () => ctx.onCityView?.(),
  });
  register('shades', shell.shadeTarget, {
    label: () => state.shadesClosed ? 'Raise the motorized <b>city shades</b>' : 'Lower the motorized <b>city shades</b>',
    onUse: () => {
      const next = !state.shadesClosed;
      const result = ctx.onShades?.(next);
      if (result !== false) setShades(next);
    },
  });
  register('answeringMachine', domestic.targets.answeringMachine, {
    label: () => state.answeringMachinePlaying
      ? 'Stop the <b>answering machine</b>'
      : `Play the <b>answering machine</b>${state.messagesWaiting ? ` · ${state.messagesWaiting} waiting` : ''}`,
    onUse: () => {
      const next = !state.answeringMachinePlaying;
      const result = ctx.onAnsweringMachine?.(next, domestic.answeringMachine);
      if (result !== false) state.answeringMachinePlaying = next;
    },
  });
  register('revolver', domestic.targets.revolver, {
    label: 'Take the <b>revolver</b>',
    enabled: () => !state.revolverTaken,
    onUse: () => {
      const result = ctx.onRevolver?.(domestic.revolver);
      if (result !== false) state.revolverTaken = true;
    },
  });
  register('ammo', domestic.targets.ammo, {
    label: 'Take the box of <b>rounds</b>',
    enabled: () => !state.ammoTaken,
    onUse: () => {
      const result = ctx.onAmmo?.(domestic.ammo);
      if (result !== false) state.ammoTaken = true;
    },
  });
  register('bong', domestic.targets.bong, {
    label: 'Pack the glass <b>bong</b>',
    holdLabel: 'Holding it…',
    hold: 0.90,
    onUse: () => {
      const result = ctx.onBong?.(domestic.bong);
      if (result !== false) state.bongUses++;
    },
  });
  register('shrooms', domestic.targets.shrooms, {
    label: 'Take the <b>mushrooms</b>',
    enabled: () => !state.shroomsTaken,
    onUse: () => {
      const result = ctx.onShrooms?.(domestic.shrooms);
      if (result !== false) state.shroomsTaken = true;
    },
  });
  register('whiteLine', domestic.targets.whiteLine, {
    label: () => state.whiteLineConsumed ? 'An empty <b>glass table</b>' : 'Use the <b>white line</b>',
    enabled: () => !state.whiteLineConsumed,
    holdLabel: 'Leaning in…',
    hold: 0.70,
    onUse: () => {
      const result = ctx.onWhiteLine?.(domestic.whiteLine);
      if (result !== false) state.whiteLineConsumed = true;
    },
  });
  if (gallery.crookedArt) {
    register('crookedArt', gallery.crookedArt.target, {
      label: 'Straighten the crooked <b>photograph</b>',
      onUse: () => ctx.onCrookedArt?.(gallery.crookedArt),
    });
    utilityTargets.crookedFrame = gallery.crookedArt.target;
  }
  utilityTargets.art = gallery.root;

  function station(id, target, stationPose, screen = null, fixtures = {}) {
    const anchor = group(`luxury-minigame-${id}`);
    anchor.position.copy(stationPose.position);
    anchor.rotation.y = stationPose.yaw;
    anchor.userData.station = { id, floor: anchor.position.y >= LOFT_Y ? 'loft' : 'main' };
    root.add(anchor);
    const value = Object.freeze({ id, anchor, target, pose: stationPose, screen, ...fixtures });
    minigameAnchors[id] = anchor;
    gameStations[id] = value;
    return value;
  }

  station('pc', domestic.desk.panel, poses.desk, screens.pc);
  station('arcade', games.arcade.target, poses.arcade, screens.arcade, { seat: games.arcade.seat });
  station('poker', games.poker.target, poses.poker, null, { seats: games.poker.seats });
  station('darts', games.darts.target, poses.darts);
  station('console', domestic.tv.group, poses.console, screens.console);

  for (const [id, stationValue] of Object.entries(gameStations)) {
    if (id === 'pc' || id === 'console') continue; // desk/TV already own prompts
    register(`minigame.${id}`, stationValue.target, {
      label: `Play <b>${id === 'arcade' ? 'Squatch arcade' : id}</b>`,
      onUse: () => ctx.onMinigame?.(id, stationValue),
    });
  }

  // Door state is mirrored onto the public state object without making the
  // door helper know anything about story or UI state.
  doors.front.onState = (open) => { state.frontDoorOpen = open; };
  doors.elevator.onState = (open) => { state.elevatorOpen = open; };
  setCityTime(state.cityMinutes);
  const afterDark = state.cityMinutes < 7 * 60 || state.cityMinutes >= 18 * 60;
  setLights('all', afterDark, { automatic: true });

  const groundAt = luxuryGroundAt;

  const metrics = Object.freeze({
    floors: 2,
    mainFloorArea: (LUXURY_APARTMENT.main.x1 - LUXURY_APARTMENT.main.x0)
      * (LUXURY_APARTMENT.main.z1 - LUXURY_APARTMENT.main.z0),
    loftFloorArea: (LUXURY_APARTMENT.loft.x1 - LUXURY_APARTMENT.loft.x0)
      * (LUXURY_APARTMENT.loft.z1 - LUXURY_APARTMENT.loft.z0),
    doubleHeightMetres: CEILING_Y,
    panoramicWindowArea: shell.windowArea,
    stairSteps: STAIR_STEPS,
    artSlots: LUXURY_ART_SLOTS.length,
    originalArtSlots: LUXURY_ART_SLOTS.length - LUXURY_EXTRA_ART_SLOTS.length,
    extraArtSlots: LUXURY_EXTRA_ART_SLOTS.length,
    resolvedArtAssets: gear.size,
    resolvedRealArtAssets: [...gear.values()].filter(({ real }) => real).length,
    displayArtSlots: LUXURY_DISPLAY_ART_SLOTS.length,
    displayOriginalArtSlots: LUXURY_DISPLAY_ART_SLOTS.length - LUXURY_EXTRA_ART_SLOTS.length,
    hungArtSlots: LUXURY_HUNG_ART_SLOTS.length,
    hungOriginalArtSlots: LUXURY_HUNG_ART_SLOTS.length - LUXURY_EXTRA_ART_SLOTS.length,
    hungExtraArtSlots: LUXURY_EXTRA_ART_SLOTS.length,
    standingArtSlots: LUXURY_STANDING_ART_SLOTS.length,
    propTextureSlots: LUXURY_PROP_ART_SLOTS.length,
    artTargets: Object.keys(artTargets).length,
    propArtPlacements: Object.keys(domestic.propArtPlacements).length,
    visibleArtAssets: Object.keys(artTargets).length + Object.keys(domestic.propArtPlacements).length,
    utilityCount: Object.keys(utilityTargets).length,
    minigameCount: Object.keys(gameStations).length,
    cityBuildings: shell.cityBuildingCount,
    cityWindows: shell.cityWindowCounts.total,
    cityWindowsSouth: shell.cityWindowCounts.south,
    cityWindowsEast: shell.cityWindowCounts.east,
    cityDepthBands: shell.cityDepthBands,
    cityMinimumSetback: shell.cityMinimumSetback,
    cityRoofFeatures: shell.cityRoofFeatures,
  });

  let elapsedLocal = 0;
  const update = (dt, elapsed = null, playerPos = null) => {
    const safeDt = Math.max(0, Math.min(Number(dt) || 0, 0.1));
    elapsedLocal = Number.isFinite(elapsed) ? elapsed : elapsedLocal + safeDt;
    doors.front.update(safeDt);
    doors.elevator.update(safeDt);
    state.fridgeT = THREE.MathUtils.damp(state.fridgeT, state.fridgeOpen ? 1 : 0, 9, safeDt);
    domestic.fridge.doorPivot.rotation.y = state.fridgeT * -Math.PI * 0.56;
    domestic.fridge.light.intensity = state.fridgeT * 0.85;
    domestic.tvGlow.intensity = state.tvOn ? 0.72 : 0;
    state.shadesT = THREE.MathUtils.damp(state.shadesT, state.shadesClosed ? 1 : 0, 5.5, safeDt);
    shell.shades.set(state.shadesT);
    domestic.answeringMachine.led.material = state.messagesWaiting > 0 && Math.sin(elapsedLocal * 4.8) > -0.15
      ? M.ledRed : M.bulbOff;
    domestic.answeringMachine.digit.material = state.messagesWaiting > 0 ? M.ledAmber : M.bulbOff;
    domestic.revolver.group.visible = !state.revolverTaken;
    domestic.ammo.group.visible = !state.ammoTaken;
    domestic.shrooms.group.visible = !state.shroomsTaken;
    domestic.whiteLine.line.visible = !state.whiteLineConsumed;
    games.update(safeDt, elapsedLocal);
    gallery.update(safeDt, elapsedLocal);
    for (const tick of ticks) tick(safeDt, elapsedLocal, playerPos);
  };

  const dispose = () => {
    audio.stopLoop?.('luxury.city', 0.2);
    for (const disposable of disposables) disposable.dispose?.();
    if (root.parent) root.parent.remove(root);
  };

  return {
    root,
    materials: M,
    colliders,
    occluders,
    floorZones,
    groundAt,
    spawns,
    poses,
    utilityTargets,
    minigameAnchors,
    gameStations,
    artTargets,
    propArtPlacements: domestic.propArtPlacements,
    artSlots: LUXURY_ART_SLOTS,
    resolvedArt: gear,
    screens,
    doors,
    lights,
    artLights: gallery.artLights,
    state,
    inventory,
    metrics,
    stairs,
    desk: domestic.desk,
    tv: domestic.tv,
    phoneProp: domestic.phone,
    radioPos: domestic.radioPos,
    showerHead: domestic.tub.headPos.clone().add(new THREE.Vector3(0, LOFT_Y, 0)),
    showerStand: domestic.tub.standPos.clone().add(new THREE.Vector3(0, LOFT_Y, 0)),
    toiletBowl: domestic.toilet.bowl.clone().add(new THREE.Vector3(0, LOFT_Y, 0)),
    toiletBowlRadius: domestic.toilet.bowlRadius,
    toiletWaterY: domestic.toilet.waterY + LOFT_Y,
    toiletSeat: new THREE.Vector3(domestic.toilet.bowl.x, LOFT_Y + 0.98, domestic.toilet.bowl.z + 0.06),
    toiletStand: new THREE.Vector3(domestic.toilet.bowl.x, LOFT_Y, domestic.toilet.bowl.z + 0.85),
    toiletLid: domestic.toilet.lidPivot,
    toiletSeatPivot: domestic.toilet.seatPivot,
    toiletCollider: domestic.toilet.collider,
    toiletFloorY: LOFT_Y,
    answeringMachine: domestic.answeringMachine,
    revolver: domestic.revolver,
    ammo: domestic.ammo,
    bong: domestic.bong,
    shrooms: domestic.shrooms,
    whiteLine: domestic.whiteLine,
    crookedArt: gallery.crookedArt,
    crookedFrame: gallery.crookedArt,
    propAnchors: Object.freeze({
      answeringMachine: domestic.targets.answeringMachine,
      revolver: domestic.targets.revolver,
      ammo: domestic.targets.ammo,
      bong: domestic.targets.bong,
      shrooms: domestic.targets.shrooms,
      whiteLine: domestic.targets.whiteLine,
      crookedArt: gallery.crookedArt?.target ?? null,
    }),
    shades: shell.shades,
    setLights,
    setCityTime,
    setShades,
    setMessagesWaiting(count) {
      state.messagesWaiting = Math.max(0, Number(count) | 0);
      return state.messagesWaiting;
    },
    update,
    dispose,
  };
}

function makeLuxuryMaterials(M) {
  M.floor = mat({ color: 0x5f4a38, roughness: 0.34 });
  M.loftFloor = mat({ color: 0x4a3729, roughness: 0.42 });
  M.marble = mat({ color: 0xe8e3db, roughness: 0.18, metalness: 0.05 });
  M.marbleDark = mat({ color: 0x242a31, roughness: 0.20, metalness: 0.12 });
  M.wall = mat({ color: 0xe1ddd5, roughness: 0.88 });
  M.wallAccent = mat({ color: 0x171b22, roughness: 0.72 });
  M.trim = mat({ color: 0xc6a568, roughness: 0.24, metalness: 0.72 });
  M.darkWood = mat({ color: 0x2e2018, roughness: 0.42 });
  M.lightWood = mat({ color: 0x8a6545, roughness: 0.48 });
  M.cabinet = mat({ color: 0x363a3e, roughness: 0.28 });
  M.counter = mat({ color: 0xe2ded6, roughness: 0.16, metalness: 0.05 });
  M.fabricCouch = mat({ color: 0xd4c8b5, roughness: 0.96 });
  M.fabricBed = mat({ color: 0x6f786f, roughness: 0.95 });
  M.sheet = mat({ color: 0xf0ede6, roughness: 0.94 });
  M.pillow = mat({ color: 0xe8dfd2, roughness: 0.98 });
  M.rug = mat({ color: 0x6e6054, roughness: 1 });
  M.bronze = mat({ color: 0x9c7745, roughness: 0.25, metalness: 0.80 });
  M.velvet = mat({ color: 0x24483f, roughness: 0.98 });
  M.cityWindow = new THREE.MeshBasicMaterial({
    color: 0xffd58a,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
  });
  M.cityDark = new THREE.MeshBasicMaterial({ color: 0x101722, toneMapped: false });
  M.cityMid = new THREE.MeshBasicMaterial({ color: 0x162131, toneMapped: false });
  M.cityBlue = new THREE.MeshBasicMaterial({ color: 0x0d1b2b, toneMapped: false });
  M.cityRoof = new THREE.MeshBasicMaterial({ color: 0x25354a, toneMapped: false });
  return M;
}

function buildShell({ root, city, M, colliders, occluders, floorZones }) {
  const { x0, x1, z0, z1, main, loft, entry } = LUXURY_APARTMENT;
  const shell = group('luxury-shell');
  own(shell, 'luxury-shell', { structural: true });
  root.add(shell);

  // The two walkable footprints are disjoint by design. The stone-clad
  // plinth beneath the loft is a solid architecture volume, not a second
  // playable floor that the shared 2-argument ground resolver could confuse.
  const mainFloor = structural(
    boxFrom(main.x0, -0.14, main.z0, main.x1, MAIN_Y, main.z1, M.floor, {
      name: 'luxury-main-floor', cast: false,
    }),
    'luxury-main-floor',
  );
  const loftFloor = structural(
    boxFrom(loft.x0, LOFT_Y - 0.24, loft.z0, loft.x1, LOFT_Y, loft.z1, M.loftFloor, {
      name: 'luxury-loft-floor', cast: false,
    }),
    'luxury-loft-floor',
  );
  shell.add(mainFloor, loftFloor);

  const serviceFront = structural(
    boxFrom(x0 + WALL, MAIN_Y, loft.z1 - 0.18, LUXURY_APARTMENT.stair.x0, LOFT_Y - 0.18, loft.z1, M.wallAccent, {
      name: 'luxury-service-plinth-front-west',
    }),
    'luxury-service-plinth',
    'z',
  );
  const serviceFrontEast = structural(
    boxFrom(LUXURY_APARTMENT.stair.x1, MAIN_Y, loft.z1 - 0.18, x1 - WALL, LOFT_Y - 0.18, loft.z1, M.wallAccent, {
      name: 'luxury-service-plinth-front-east',
    }),
    'luxury-service-plinth',
    'z',
  );
  shell.add(serviceFront, serviceFrontEast);
  occluders.push(serviceFront, serviceFrontEast);
  addBounds(colliders, [[x0 + WALL, 0, z0 + 0.04], [LUXURY_APARTMENT.stair.x0 - 0.095, LOFT_Y - 0.05, loft.z1]],
    'luxury-sealed-under-loft-west', 0, 'luxury-service-plinth-collision');
  addBounds(colliders, [[LUXURY_APARTMENT.stair.x1 + 0.095, 0, z0 + 0.04], [6.70, LOFT_Y - 0.05, loft.z1]],
    'luxury-sealed-under-loft-east-west-run', 0, 'luxury-service-plinth-collision');
  addBounds(colliders, [[9.00, 0, z0 + 0.04], [x1 - WALL, LOFT_Y - 0.05, loft.z1]],
    'luxury-sealed-under-loft-east-east-run', 0, 'luxury-service-plinth-collision');

  // North wall is split around the upper entry vestibule only visually; the
  // playable main entry lives on the west wall, outside the stacked footprint.
  const northWall = structural(
    boxFrom(x0, 0, z0 - WALL, x1, CEILING_Y, z0, M.wall, { name: 'luxury-wall-north' }),
    'luxury-shell',
    'z',
  );
  shell.add(northWall);
  occluders.push(northWall);
  addBounds(colliders, [[x0 - 0.35, 0, z0 - WALL], [x1 + 0.35, CEILING_Y, z0]],
    'luxury-wall-north-collider', 0, 'luxury-shell-collision');

  // West wall leaves a true main-floor opening for the front door.
  const westSegments = [
    [z0, entry.z0],
    [entry.z1, z1],
  ];
  for (let i = 0; i < westSegments.length; i++) {
    const [a, b] = westSegments[i];
    const wall = structural(
      boxFrom(x0 - WALL, 0, a, x0, CEILING_Y, b, M.wall, { name: `luxury-wall-west-${i}` }),
      'luxury-shell',
      'x',
    );
    shell.add(wall);
    occluders.push(wall);
    addBounds(colliders, [[x0 - WALL, 0, a], [x0, CEILING_Y, b]],
      `luxury-wall-west-${i}-collider`, 0, 'luxury-shell-collision');
  }
  const westHeader = structural(
    boxFrom(x0 - WALL, DOOR_H, entry.z0, x0, CEILING_Y, entry.z1, M.wall, { name: 'luxury-entry-header' }),
    'luxury-shell',
    'x',
  );
  shell.add(westHeader);
  occluders.push(westHeader);
  addBounds(colliders, [[x0 - WALL, DOOR_H, entry.z0], [x0, CEILING_Y, entry.z1]],
    'luxury-entry-header-collider', 0, 'luxury-shell-collision');

  // A thin, coffered ceiling keeps the double-height volume legible.
  shell.add(structural(
    boxFrom(x0, CEILING_Y, z0, x1, CEILING_Y + 0.16, z1, M.ceiling, {
      name: 'luxury-ceiling', cast: false,
    }),
    'luxury-shell',
  ));
  for (let x = -9; x <= 9; x += 3) {
    shell.add(own(box({
      name: `luxury-ceiling-rib-${x}`,
      size: [0.10, 0.15, z1 - z0],
      pos: [x, CEILING_Y - 0.08, 0],
      mat: M.trim,
      cast: false,
    }), 'luxury-ceiling-ribs'));
  }

  const southWindows = buildWindowWall({
    root: shell,
    M,
    side: 'south',
    start: x0,
    end: x1,
    fixed: z1,
    segments: 11,
  });
  const eastWindows = buildWindowWall({
    root: shell,
    M,
    side: 'east',
    start: z0,
    end: z1,
    fixed: x1,
    segments: 8,
  });
  occluders.push(...southWindows.glass, ...eastWindows.glass);
  addBounds(colliders, [[x0 + 0.04, 0, z1], [x1 - 0.04, CEILING_Y, z1 + WALL]],
    'luxury-south-glass-wall-collider', 0, 'luxury-window-collision');
  addBounds(colliders, [[x1, 0, z0 + 0.04], [x1 + WALL, CEILING_Y, z1 - 0.04]],
    'luxury-east-glass-wall-collider', 0, 'luxury-window-collision');

  const cityView = buildCityView({ root: city, M });
  const cityGlassTarget = proxy('luxury-city-glass-target', [5.2, 3.8, 0.22], [2.6, 3.3, z1 - 0.18], shell);
  const shadeTarget = proxy('luxury-city-shades-target', [0.46, 0.58, 0.25], [6.08, 1.24, loft.z1 + 0.22], shell);
  const shades = {
    south: southWindows.shades,
    east: eastWindows.shades,
    set(amount) {
      southWindows.setShade(amount);
      eastWindows.setShade(amount);
    },
  };

  // Surface metadata is Y-aware for footsteps, but groundAt remains purely
  // X/Z compatible. The service plinth is deliberately absent.
  floorZones.push({
    name: 'luxury-main-floor-zone',
    box: new THREE.Box3(
      new THREE.Vector3(main.x0, -0.05, main.z0),
      new THREE.Vector3(main.x1, 1.2, main.z1),
    ),
    surface: 'wood',
    y: MAIN_Y,
  });
  floorZones.push({
    name: 'luxury-loft-floor-zone',
    box: new THREE.Box3(
      new THREE.Vector3(loft.x0, LOFT_Y - 0.05, loft.z0),
      new THREE.Vector3(loft.x1, LOFT_Y + 1.2, loft.z1),
    ),
    surface: 'wood',
    y: LOFT_Y,
  });
  floorZones.unshift({
    name: 'luxury-lounge-rug-zone',
    box: new THREE.Box3(new THREE.Vector3(1.0, 0, 1.2), new THREE.Vector3(6.2, 1, 6.1)),
    surface: 'rug',
    y: MAIN_Y,
  });
  floorZones.unshift({
    name: 'luxury-kitchen-stone-zone',
    box: new THREE.Box3(new THREE.Vector3(7.6, 0, 0.7), new THREE.Vector3(10.8, 1, 7.5)),
    surface: 'tile',
    y: MAIN_Y,
  });

  return {
    group: shell,
    cityGlassTarget,
    shadeTarget,
    shades,
    citySky: cityView.sky,
    cityLights: cityView.lights,
    cityBuildingCount: cityView.buildings,
    cityWindowCounts: cityView.windowCounts,
    cityDepthBands: cityView.depthBands,
    cityMinimumSetback: cityView.minimumSetback,
    cityRoofFeatures: cityView.roofFeatures,
    windowArea: southWindows.area + eastWindows.area,
  };
}

function buildWindowWall({ root, M, side, start, end, fixed, segments }) {
  const g = group(`luxury-window-wall-${side}`);
  own(g, `luxury-window-wall:${side}`, { structural: true });
  root.add(g);
  const glassMeshes = [];
  const shades = [];
  const low = 0.12;
  const high = CEILING_Y - 0.16;
  const span = end - start;
  const segment = span / segments;
  const frameDepth = 0.11;

  for (let i = 0; i < segments; i++) {
    const at = start + segment * (i + 0.5);
    const glass = plane(segment - 0.10, high - low, M.windowGlass);
    glass.name = `luxury-window-${side}-pane-${i}`;
    if (side === 'south') {
      glass.position.set(at, (low + high) / 2, fixed - 0.015);
      glass.rotation.y = Math.PI;
    } else {
      glass.position.set(fixed - 0.015, (low + high) / 2, at);
      glass.rotation.y = -Math.PI / 2;
    }
    own(glass, `luxury-window-wall:${side}`, { checkWallEmbed: false });
    g.add(glass);
    glassMeshes.push(glass);

    const shadeMaterial = new THREE.MeshStandardMaterial({
      color: 0x202630,
      roughness: 0.94,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
    });
    const shade = plane(segment - 0.13, high - low, shadeMaterial);
    shade.name = `luxury-window-${side}-motor-shade-${i}`;
    if (side === 'south') {
      shade.position.set(at, high - 0.02, fixed - 0.085);
      shade.rotation.y = Math.PI;
    } else {
      shade.position.set(fixed - 0.085, high - 0.02, at);
      shade.rotation.y = -Math.PI / 2;
    }
    shade.scale.y = 0.002;
    shade.userData.fullHeight = high - low;
    shade.userData.topY = high;
    g.add(own(shade, `luxury-window-shade:${side}:${i}`, { checkSupport: false }));
    shades.push(shade);
  }

  for (let i = 0; i <= segments; i++) {
    const at = start + segment * i;
    const mullion = side === 'south'
      ? box({ name: `luxury-window-${side}-mullion-${i}`, size: [0.065, high - low + 0.18, frameDepth], pos: [at, (low + high) / 2, fixed - 0.02], mat: M.darkSteel })
      : box({ name: `luxury-window-${side}-mullion-${i}`, size: [frameDepth, high - low + 0.18, 0.065], pos: [fixed - 0.02, (low + high) / 2, at], mat: M.darkSteel });
    g.add(own(mullion, `luxury-window-frame:${side}`));
  }
  for (const y of [low, LOFT_Y, high]) {
    const rail = side === 'south'
      ? box({ name: `luxury-window-${side}-rail-${y}`, size: [span, 0.075, frameDepth], pos: [(start + end) / 2, y, fixed - 0.02], mat: M.darkSteel })
      : box({ name: `luxury-window-${side}-rail-${y}`, size: [frameDepth, 0.075, span], pos: [fixed - 0.02, y, (start + end) / 2], mat: M.darkSteel });
    g.add(own(rail, `luxury-window-frame:${side}`));
  }
  return {
    group: g,
    glass: glassMeshes,
    shades,
    area: span * (high - low),
    setShade(amount) {
      const t = THREE.MathUtils.clamp(Number(amount) || 0, 0, 1);
      for (const shade of shades) {
        shade.scale.y = Math.max(0.002, t);
        shade.position.y = shade.userData.topY - shade.userData.fullHeight * t / 2;
      }
      return t;
    },
  };
}

function buildCityView({ root, M }) {
  // Both backdrops sit 72m from the apartment. Their half-span must pass that
  // coordinate so the southeast diagonal is covered where the planes meet;
  // the former 100m planes stopped at +/-50m and left a visible dark wedge.
  const backdropSpan = 160;
  const skyMaterial = new THREE.MeshBasicMaterial({
    map: M.sky.map,
    color: 0xffffff,
    transparent: true,
    opacity: 0.88,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const sky = plane(backdropSpan, 48, skyMaterial);
  sky.name = 'luxury-city-panorama-south';
  sky.position.set(0, 18, 72);
  sky.rotation.y = Math.PI;
  root.add(own(sky, 'luxury-city-backdrop', { checkSupport: false }));
  // Share one material so the east and south horizons grade together as the
  // clock moves; the previous clone left the east view stuck at full daylight.
  const eastSky = plane(backdropSpan, 48, skyMaterial);
  eastSky.name = 'luxury-city-panorama-east';
  eastSky.position.set(72, 18, 0);
  eastSky.rotation.y = -Math.PI / 2;
  root.add(own(eastSky, 'luxury-city-backdrop', { checkSupport: false }));

  const cityLightsMaterial = M.cityWindow;
  // Three genuine depth bands leave breathing room outside the glass and
  // preserve parallax from both storeys. Width is the visible facade span;
  // depth runs away from the corresponding window wall.
  const southPlans = [
    { x: -17.0, z: 28.0, width: 6.0, height: 18, depth: 4.8, band: 'near' },
    { x: -9.2, z: 36.0, width: 7.2, height: 28, depth: 5.8, band: 'mid' },
    { x: -2.4, z: 27.5, width: 5.2, height: 21, depth: 4.5, band: 'near' },
    { x: 4.2, z: 39.0, width: 8.0, height: 31, depth: 6.2, band: 'mid' },
    { x: 11.3, z: 30.0, width: 5.8, height: 19, depth: 4.8, band: 'near' },
    { x: 18.1, z: 44.0, width: 8.2, height: 27, depth: 6.8, band: 'mid' },
    { x: -20.5, z: 55.0, width: 10.0, height: 34, depth: 8.0, band: 'far' },
    { x: 1.0, z: 60.0, width: 9.0, height: 38, depth: 7.5, band: 'far' },
  ];
  const eastPlans = [
    { x: 28.0, z: -14.0, width: 5.8, height: 18, depth: 4.8, band: 'near' },
    { x: 36.0, z: -8.0, width: 7.0, height: 29, depth: 6.0, band: 'mid' },
    { x: 29.0, z: -1.2, width: 5.2, height: 21, depth: 4.5, band: 'near' },
    { x: 42.0, z: 5.2, width: 8.0, height: 34, depth: 7.0, band: 'mid' },
    { x: 31.0, z: 11.4, width: 5.6, height: 22, depth: 4.8, band: 'near' },
    { x: 55.0, z: 18.0, width: 9.0, height: 38, depth: 8.0, band: 'far' },
  ];

  let buildings = 0;
  let roofFeatures = 0;
  const windowCounts = { south: 0, east: 0, total: 0 };
  const massMaterials = [M.cityDark, M.cityMid, M.cityBlue];

  const addFacadeWindows = (building, plan, side, index) => {
    const columns = Math.max(3, Math.floor(plan.width / 1.28));
    const rows = Math.max(5, Math.floor((plan.height - 1.2) / 1.35));
    const batches = new Map();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        if ((row * 7 + col * 11 + index * 3) % 4 === 0) continue;
        const along = -plan.width * 0.42
          + col * (plan.width * 0.84 / Math.max(1, columns - 1));
        const y = 0.65 + row * ((plan.height - 1.55) / Math.max(1, rows - 1));
        const window = plane(0.48, 0.62, cityLightsMaterial);
        const sideCode = side === 'south' ? 's' : 'e';
        window.name = `luxury-city-window-${sideCode}-${index}-${row}-${col}`;
        if (side === 'south') {
          window.position.set(plan.x + along, y, plan.z - plan.depth / 2 - 0.012);
          window.rotation.y = Math.PI;
        } else {
          window.position.set(plan.x - plan.depth / 2 - 0.012, y, plan.z + along);
          window.rotation.y = -Math.PI / 2;
        }
        // Geometry policy intentionally limits inherited opt-outs to small
        // physical regions. Four-by-four window batches stay below that cap
        // while avoiding a separate suppression source for every lit pane.
        const batchRow = Math.floor(row / 4);
        const batchColumn = Math.floor(col / 4);
        const batchKey = `${batchRow}:${batchColumn}`;
        let batch = batches.get(batchKey);
        if (!batch) {
          batch = group(`luxury-city-window-batch-${side}-${index}-${batchRow}-${batchColumn}`);
          own(batch, `luxury-city-window-batch:${side}:${index}:${batchRow}:${batchColumn}`, {
            checkSupport: false,
          });
          building.add(batch);
          batches.set(batchKey, batch);
        }
        batch.add(own(window, `luxury-city-building-window:${side}:${index}`));
        windowCounts[side]++;
        windowCounts.total++;
      }
    }
  };

  const addRoof = (building, plan, side, index) => {
    const roofHeight = 0.34 + (index % 3) * 0.18;
    const size = side === 'south'
      ? [plan.width * (0.48 + (index % 2) * 0.10), roofHeight, plan.depth * 0.58]
      : [plan.depth * 0.58, roofHeight, plan.width * (0.48 + (index % 2) * 0.10)];
    const roof = box({
      name: `luxury-city-building-${side}-${index}-roof`,
      size,
      pos: [plan.x, plan.height - 0.2 + roofHeight / 2, plan.z],
      mat: M.cityRoof,
      cast: false,
    });
    building.add(own(roof, `luxury-city-building-roof:${side}:${index}`, { checkSupport: false }));
    roofFeatures++;
    if (index % 2 === 1) {
      const antennaHeight = 1.45 + (index % 3) * 0.55;
      const antenna = cylinder({
        name: `luxury-city-building-${side}-${index}-antenna`,
        r: 0.045,
        h: antennaHeight,
        pos: [plan.x, plan.height + roofHeight + antennaHeight / 2 - 0.2, plan.z],
        mat: M.cityRoof,
      });
      building.add(own(antenna, `luxury-city-building-roof:${side}:${index}`, { checkSupport: false }));
      roofFeatures++;
    }
  };

  const addBuilding = (plan, side, index) => {
    const building = group(`luxury-city-building-${side}-${index}`);
    const size = side === 'south'
      ? [plan.width, plan.height, plan.depth]
      : [plan.depth, plan.height, plan.width];
    const mass = box({
      name: `luxury-city-building-${side}-${index}-mass`,
      size,
      pos: [plan.x, plan.height / 2 - 0.2, plan.z],
      mat: massMaterials[index % massMaterials.length],
      cast: false,
    });
    building.userData.depthBand = plan.band;
    building.add(own(mass, `luxury-city-building-mass:${side}:${index}`, { checkSupport: false }));
    addFacadeWindows(building, plan, side, index);
    addRoof(building, plan, side, index);
    root.add(own(building, `luxury-city-building:${side}:${index}`));
    buildings++;
  };

  southPlans.forEach((plan, index) => addBuilding(plan, 'south', index));
  eastPlans.forEach((plan, index) => addBuilding(plan, 'east', index));

  const minimumSetback = Math.min(
    ...southPlans.map(({ z, depth }) => z - depth / 2 - LUXURY_APARTMENT.z1),
    ...eastPlans.map(({ x, depth }) => x - depth / 2 - LUXURY_APARTMENT.x1),
  );
  const depthBands = new Set([...southPlans, ...eastPlans].map(({ band }) => band)).size;

  return {
    sky,
    lights: { material: cityLightsMaterial },
    buildings,
    windowCounts: Object.freeze(windowCounts),
    depthBands,
    minimumSetback,
    roofFeatures,
  };
}

function buildDoors({ root, M, colliders }) {
  const front = buildPivotDoor({
    root,
    M,
    colliders,
    id: 'front',
    hinge: new THREE.Vector3(LUXURY_APARTMENT.x0 + 0.12, 0, LUXURY_APARTMENT.entry.z0 + 0.07),
    width: LUXURY_APARTMENT.entry.z1 - LUXURY_APARTMENT.entry.z0 - 0.10,
    height: DOOR_H - 0.04,
    closedYaw: 0,
    openYaw: -Math.PI * 0.52,
    axis: 'z',
  });
  const elevator = buildElevatorDoor({ root, M, colliders });
  return { front, elevator };
}

function buildPivotDoor({ root, M, colliders, id, hinge, width, height, closedYaw, openYaw, axis }) {
  const g = group(`luxury-${id}-door`);
  const pivot = group(`luxury-${id}-door-pivot`);
  g.position.copy(hinge);
  const leaf = box({
    name: `luxury-${id}-door-leaf`,
    size: axis === 'z' ? [0.10, height, width] : [width, height, 0.10],
    pos: axis === 'z' ? [0, height / 2, width / 2] : [width / 2, height / 2, 0],
    mat: M.darkWood,
  });
  own(leaf, `luxury-door:${id}`);
  pivot.add(leaf);
  // Brass inlay and a tactile handle make the entry read at apartment scale.
  const inlay = axis === 'z'
    ? box({ name: `luxury-${id}-door-inlay`, size: [0.012, height * 0.72, 0.025], pos: [-0.058, height * 0.54, width * 0.52], mat: M.trim })
    : box({ name: `luxury-${id}-door-inlay`, size: [0.025, height * 0.72, 0.012], pos: [width * 0.52, height * 0.54, -0.058], mat: M.trim });
  pivot.add(own(inlay, `luxury-door:${id}`));
  const handle = cylinder({
    name: `luxury-${id}-door-handle`,
    r: 0.025,
    h: 0.10,
    pos: axis === 'z' ? [-0.09, 1.08, width * 0.82] : [width * 0.82, 1.08, -0.09],
    rotZ: axis === 'z' ? Math.PI / 2 : 0,
    rotX: axis === 'z' ? 0 : Math.PI / 2,
    mat: M.trim,
  });
  pivot.add(own(handle, `luxury-door:${id}`));
  g.add(pivot);
  root.add(own(g, `luxury-door:${id}`));

  const target = proxy(
    `luxury-${id}-door-target`,
    axis === 'z' ? [0.5, height, width] : [width, height, 0.5],
    axis === 'z' ? [hinge.x + 0.18, height / 2, hinge.z + width / 2] : [hinge.x + width / 2, height / 2, hinge.z + 0.18],
    root,
  );
  const volume = addBounds(
    colliders,
    axis === 'z'
      ? [[hinge.x - 0.08, 0, hinge.z], [hinge.x + 0.08, height, hinge.z + width]]
      : [[hinge.x, 0, hinge.z - 0.08], [hinge.x + width, height, hinge.z + 0.08]],
    `luxury-${id}-door-collider`,
    0,
    `luxury-door-collision:${id}`,
  );
  let want = 0;
  let current = 0;

  const syncCollider = () => {
    const yaw = THREE.MathUtils.lerp(closedYaw, openYaw, current);
    const end = axis === 'z'
      ? new THREE.Vector3(hinge.x - Math.sin(yaw) * width, 0, hinge.z + Math.cos(yaw) * width)
      : new THREE.Vector3(hinge.x + Math.cos(yaw) * width, 0, hinge.z + Math.sin(yaw) * width);
    volume.min.set(Math.min(hinge.x, end.x) - 0.07, 0, Math.min(hinge.z, end.z) - 0.07);
    volume.max.set(Math.max(hinge.x, end.x) + 0.07, height, Math.max(hinge.z, end.z) + 0.07);
  };
  const api = {
    group: g,
    pivot,
    leaf,
    target,
    collider: volume,
    onState: null,
    isOpen: () => want === 1,
    open() { want = 1; api.onState?.(true); return true; },
    close() { want = 0; api.onState?.(false); return false; },
    toggle() { return want ? api.close() : api.open(); },
    update(dt) {
      current = THREE.MathUtils.damp(current, want, 11, dt);
      if (Math.abs(current - want) < 0.0005) current = want;
      pivot.rotation.y = THREE.MathUtils.lerp(closedYaw, openYaw, current);
      syncCollider();
    },
  };
  syncCollider();
  return api;
}

function buildElevatorDoor({ root, M, colliders }) {
  // The private lift terminates in the sealed plinth's main-floor face. It is
  // an amenity/entry interaction, not a second route into the loft footprint.
  const g = group('luxury-elevator');
  g.position.set(7.85, 0, LUXURY_APARTMENT.loft.z1 + 0.04);
  const surround = group('luxury-elevator-surround');
  surround.add(box({ name: 'luxury-elevator-header', size: [2.35, 0.24, 0.18], pos: [0, 2.55, 0], mat: M.marbleDark }));
  for (const x of [-1.10, 1.10]) {
    surround.add(box({ name: `luxury-elevator-jamb-${x}`, size: [0.16, 2.68, 0.18], pos: [x, 1.34, 0], mat: M.marbleDark }));
  }
  const left = box({ name: 'luxury-elevator-door-left', size: [1.03, 2.42, 0.10], pos: [-0.52, 1.21, 0.01], mat: M.steel });
  const right = box({ name: 'luxury-elevator-door-right', size: [1.03, 2.42, 0.10], pos: [0.52, 1.21, 0.01], mat: M.steel });
  const seam = box({ name: 'luxury-elevator-door-seam', size: [0.018, 2.38, 0.018], pos: [0, 1.21, -0.06], mat: M.black });
  g.add(
    surround,
    own(left, 'luxury-elevator-moving-leaf:left', { checkSupport: false }),
    own(right, 'luxury-elevator-moving-leaf:right', { checkSupport: false }),
    own(seam, 'luxury-elevator-moving-seam', { checkSupport: false }),
  );
  root.add(own(g, 'luxury-elevator', { checkSupport: false }));

  const target = proxy('luxury-elevator-target', [2.25, 2.5, 0.55], [7.85, 1.25, LUXURY_APARTMENT.loft.z1 + 0.35], root);
  const volume = addBounds(colliders,
    [[6.80, 0, LUXURY_APARTMENT.loft.z1 - 0.10], [8.90, 2.45, LUXURY_APARTMENT.loft.z1 + 0.12]],
    'luxury-elevator-door-collider', 0, 'luxury-elevator-collision');
  let want = 0;
  let current = 0;
  const api = {
    group: g,
    pivot: g,
    target,
    collider: volume,
    onState: null,
    isOpen: () => want === 1,
    open() { want = 1; api.onState?.(true); return true; },
    close() { want = 0; api.onState?.(false); return false; },
    toggle() { return want ? api.close() : api.open(); },
    update(dt) {
      current = THREE.MathUtils.damp(current, want, 12, dt);
      if (Math.abs(current - want) < 0.0005) current = want;
      left.position.x = -0.52 - current * 0.56;
      right.position.x = 0.52 + current * 0.56;
      seam.visible = current < 0.88;
      if (current > 0.85) {
        volume.min.y = -2;
        volume.max.y = -1;
      } else {
        volume.min.set(6.80, 0, LUXURY_APARTMENT.loft.z1 - 0.10);
        volume.max.set(8.90, 2.45, LUXURY_APARTMENT.loft.z1 + 0.12);
      }
    },
  };
  return api;
}

function buildStairAndLoft({ root, M, colliders, floorZones }) {
  const { stair, loft } = LUXURY_APARTMENT;
  const g = group('luxury-stair-and-loft');
  root.add(own(g, 'luxury-stair-and-loft', { structural: true }));
  const width = stair.x1 - stair.x0;

  for (let i = 0; i < STAIR_STEPS; i++) {
    const top = i * LUXURY_STAIR_RISE;
    const z1 = stair.z1 - i * LUXURY_STAIR_RUN;
    const z0 = z1 - LUXURY_STAIR_RUN - 0.006;
    const tread = boxFrom(
      stair.x0 + 0.06,
      top - 0.12,
      z0,
      stair.x1 - 0.06,
      top,
      z1,
      i % 2 ? M.darkWood : M.loftFloor,
      { name: `luxury-stair-tread-${String(i).padStart(2, '0')}` },
    );
    g.add(own(tread, 'luxury-stair-treads', { structural: true }));
    floorZones.push({
      name: `luxury-stair-zone-${String(i).padStart(2, '0')}`,
      box: new THREE.Box3(
        new THREE.Vector3(stair.x0 + 0.06, top - 0.08, z0),
        new THREE.Vector3(stair.x1 - 0.06, top + 0.95, z1),
      ),
      surface: 'wood',
      y: top,
    });
  }
  // Top landing bridges the last safe rise to the full loft level.
  const landing = boxFrom(stair.x0, LOFT_Y - 0.16, stair.z0 - 0.34, stair.x1, LOFT_Y, stair.z0 + 0.06, M.loftFloor, {
    name: 'luxury-stair-top-landing',
  });
  g.add(own(landing, 'luxury-stair-and-loft', { structural: true }));

  // Glass guards retain the visual openness while collision uses narrow,
  // explicit rails. The player can never step off into the double-height void.
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd5e6ed,
    roughness: 0.05,
    transmission: 0.74,
    thickness: 0.06,
    transparent: true,
    opacity: 0.28,
  });
  for (const sideX of [stair.x0, stair.x1]) {
    const rail = group(`luxury-stair-rail-${sideX < 0 ? 'west' : 'east'}`);
    for (let i = 0; i < STAIR_STEPS; i++) {
      const y = i * LUXURY_STAIR_RISE;
      const z = stair.z1 - (i + 0.5) * LUXURY_STAIR_RUN;
      const glass = box({
        name: `luxury-stair-glass-${sideX < 0 ? 'w' : 'e'}-${i}`,
        size: [0.035, 0.88, LUXURY_STAIR_RUN + 0.025],
        pos: [sideX, y + 0.44, z],
        mat: glassMaterial,
        cast: false,
      });
      rail.add(own(glass, 'luxury-stair-glass'));
      const cap = box({
        name: `luxury-stair-cap-${sideX < 0 ? 'w' : 'e'}-${i}`,
        size: [0.075, 0.055, LUXURY_STAIR_RUN + 0.04],
        pos: [sideX, y + 0.90, z],
        mat: M.trim,
      });
      rail.add(own(cap, 'luxury-stair-rail'));
    }
    g.add(rail);
    addBounds(colliders,
      [[sideX - 0.055, 0, stair.z0], [sideX + 0.055, LOFT_Y + 1.05, stair.z1]],
      `luxury-stair-rail-${sideX < 0 ? 'west' : 'east'}-collider`,
      0,
      'luxury-stair-rail-collision');
  }

  const edgeRuns = [
    [loft.x0, stair.x0 - 0.08],
    [stair.x1 + 0.08, loft.x1],
  ];
  for (let i = 0; i < edgeRuns.length; i++) {
    const [a, b] = edgeRuns[i];
    if (b <= a) continue;
    const glass = boxFrom(a, LOFT_Y + 0.04, loft.z1 - 0.035, b, LOFT_Y + 0.98, loft.z1 + 0.035, glassMaterial, {
      name: `luxury-loft-edge-glass-${i}`,
      cast: false,
    });
    const cap = box({
      name: `luxury-loft-edge-cap-${i}`,
      size: [b - a, 0.065, 0.10],
      pos: [(a + b) / 2, LOFT_Y + 1.02, loft.z1],
      mat: M.trim,
    });
    g.add(own(glass, 'luxury-loft-edge'), own(cap, 'luxury-loft-edge'));
    addBounds(colliders, [[a, LOFT_Y, loft.z1 - 0.08], [b, LOFT_Y + 1.08, loft.z1 + 0.08]],
      `luxury-loft-edge-${i}-collider`, 0, 'luxury-loft-edge-collision');
  }

  // Open-plan dividers define private zones without turning the upper floor
  // into a corridor of ordinary closed rooms.
  const divider = (name, x, z, width, rotY = 0, collide = false) => {
    const d = group(name);
    d.position.set(x, LOFT_Y, z);
    d.rotation.y = rotY;
    for (let i = -3; i <= 3; i++) {
      const localX = i * width / 7;
      d.add(box({
        name: `${name}-slat-${i + 3}`,
        size: [0.07, 2.72, 0.10],
        pos: [localX, 1.36, 0],
        mat: i % 2 ? M.darkWood : M.trim,
      }));
      if (collide) {
        const c = Math.cos(rotY);
        const s = Math.sin(rotY);
        const worldX = x + localX * c;
        const worldZ = z - localX * s;
        const halfX = Math.abs(0.07 * c) / 2 + Math.abs(0.10 * s) / 2;
        const halfZ = Math.abs(0.07 * s) / 2 + Math.abs(0.10 * c) / 2;
        addBounds(
          colliders,
          [[worldX - halfX, 0, worldZ - halfZ], [worldX + halfX, 2.72, worldZ + halfZ]],
          `${name}-slat-${i + 3}-collider`,
          LOFT_Y,
          `luxury-loft-divider-collision:${name}`,
        );
      }
    }
    d.add(box({ name: `${name}-header`, size: [width, 0.08, 0.12], pos: [0, 2.70, 0], mat: M.darkWood }));
    g.add(own(d, `luxury-loft-divider:${name}`));
    return d;
  };
  divider('luxury-bedroom-slat-divider', 6.35, -3.22, 7.5, 0);
  divider('luxury-office-slat-divider', 2.18, -5.25, 3.8, Math.PI / 2, true);

  // A continuous bronze fascia makes the loft read as a deliberate volume
  // from the main lounge, rather than a slab left hanging in space.
  g.add(own(box({
    name: 'luxury-loft-bronze-fascia',
    size: [loft.x1 - loft.x0, 0.26, 0.16],
    pos: [(loft.x0 + loft.x1) / 2, LOFT_Y - 0.13, loft.z1],
    mat: M.trim,
  }), 'luxury-loft-edge'));

  return { group: g, stepRise: LUXURY_STAIR_RISE, stepRun: LUXURY_STAIR_RUN, width };
}

function buildLighting({ root, architecture, loftContents, M }) {
  void architecture;
  void loftContents;
  const lightRoot = group('luxury-lighting');
  root.add(own(lightRoot, 'luxury-lighting'));
  const ambient = new THREE.HemisphereLight(0xb9c7dc, 0x30251e, 0.55);
  ambient.name = 'luxury-city-ambient';
  const sun = new THREE.DirectionalLight(0xffd0a2, 0.8);
  sun.name = 'luxury-window-sun';
  sun.position.set(9, 10, 13);
  sun.target.position.set(0, 1.5, 0);
  lightRoot.add(ambient, sun, sun.target);

  const makeFixture = (id, x, y, z, intensity, distance, color = 0xffd3a0) => {
    const fixture = group(`luxury-light-${id}`);
    const stemTop = CEILING_Y - 0.04;
    const stemLength = Math.max(0.18, stemTop - y);
    fixture.add(cylinder({
      name: `luxury-light-${id}-stem`,
      r: 0.014,
      h: stemLength,
      pos: [x, y + stemLength / 2, z],
      mat: M.trim,
    }));
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.23, 0.20, 20, 1, true),
      M.lampShade,
    );
    shade.name = `luxury-light-${id}-shade`;
    shade.position.set(x, y, z);
    fixture.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), M.bulbOff);
    bulb.name = `luxury-light-${id}-bulb`;
    bulb.position.set(x, y - 0.07, z);
    fixture.add(bulb);
    const light = new THREE.PointLight(color, 0, distance, 1.75);
    light.name = `luxury-light-${id}-point`;
    light.position.set(x, y - 0.10, z);
    light.castShadow = false;
    fixture.add(light);
    own(fixture, `luxury-lighting:${id}`, { checkSupport: false });
    lightRoot.add(fixture);
    return { fixture, bulb, light, intensity };
  };

  const main = [
    makeFixture('main-lounge-a', 2.2, 5.12, 2.2, 82, 9.5),
    makeFixture('main-lounge-b', 5.1, 4.72, 4.7, 72, 8.5),
    makeFixture('main-kitchen', 8.8, 4.92, 2.3, 84, 8.2),
    makeFixture('main-games', -4.1, 4.85, 3.2, 76, 8.8),
    makeFixture('main-entry', -8.4, 4.60, 6.0, 64, 7.5),
  ];
  const loft = [
    makeFixture('loft-office', 0.0, 6.36, -5.25, 62, 6.0),
    makeFixture('loft-bedroom', 6.5, 6.28, -5.45, 68, 6.5),
    makeFixture('loft-bath', -4.8, 6.28, -5.95, 74, 5.6, 0xe9f2ff),
    makeFixture('loft-gallery', -7.5, 6.34, -2.25, 66, 5.8),
  ];

  // Three staggered rings make the double-height lounge chandelier a focal
  // point without introducing dozens of live shadow casters.
  const chandelier = group('luxury-chandelier');
  for (let ring = 0; ring < 3; ring++) {
    const radius = 0.72 + ring * 0.26;
    const y = 4.40 - ring * 0.34;
    const torus = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 10, 48), M.trim);
    torus.name = `luxury-chandelier-ring-${ring}`;
    torus.rotation.x = Math.PI / 2;
    torus.position.set(3.75, y, 3.2);
    chandelier.add(torus);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + ring * 0.18;
      const crystal = box({
        name: `luxury-chandelier-crystal-${ring}-${i}`,
        size: [0.035, 0.22 + (i % 3) * 0.06, 0.035],
        pos: [3.75 + Math.cos(a) * radius, y - 0.17, 3.2 + Math.sin(a) * radius],
        mat: M.glass,
        rotY: a,
      });
      chandelier.add(crystal);
    }
  }
  const chandelierBulb = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 12), M.bulbOff);
  chandelierBulb.name = 'luxury-chandelier-bulb';
  chandelierBulb.position.set(3.75, 3.92, 3.2);
  chandelier.add(chandelierBulb);
  const chandelierLight = new THREE.PointLight(0xffd2a0, 0, 11.5, 1.85);
  chandelierLight.name = 'luxury-chandelier-point';
  chandelierLight.position.set(3.75, 3.88, 3.2);
  chandelierLight.castShadow = false;
  chandelier.add(chandelierLight);
  lightRoot.add(own(chandelier, 'luxury-chandelier', { checkSupport: false }));
  const chandelierIntensity = 118;
  main.push({
    fixture: chandelier,
    bulb: chandelierBulb,
    light: chandelierLight,
    intensity: chandelierIntensity,
  });

  return {
    root: lightRoot,
    main,
    loft,
    ambient,
    sun,
    chandelier,
    chandelierLight,
    chandelierBulb,
    chandelierIntensity,
  };
}

function buildDomesticZones({ furnishings, loftContents, M, gear, propTexture, colliders, floorZones }) {
  const propArtPlacements = {};
  const hasAttachedTexture = (target, texture) => {
    if (!target?.traverse || !texture) return false;
    const matches = (candidate) => (
      candidate === texture
      || candidate?.userData?.derivedFromTextureUuid === texture.uuid
      || candidate?.userData?.compositedFromTextureUuid === texture.uuid
    );
    let attached = false;
    target.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((material) => (
        matches(material?.map)
        || matches(material?.alphaMap)
        || matches(material?.emissiveMap)
      ))) attached = true;
    });
    return attached;
  };
  const placePropArt = (slot, target, zone) => {
    if (!target) return null;
    const record = gear.get(slot);
    target.userData ??= {};
    target.userData.artSlot = slot;
    target.userData.artZone = zone;
    target.userData.artDisplayKind = 'prop';
    target.userData.artSource = 'apartment';
    // Headless unit builds intentionally return non-real fallback textures and
    // prop builders omit those placeholders. Live/browser builds must attach
    // the exact resolved file, so null means "not applicable in this harness"
    // while false remains a genuine production wiring failure.
    target.userData.artTextureAttached = record?.real
      ? hasAttachedTexture(target, record.texture)
      : null;
    propArtPlacements[slot] = target;
    return target;
  };
  const addProp = (parent, built, name, yOffset = 0, bounds = built.bounds) => {
    built.group.name = name;
    own(built.group, `luxury-prop:${name}`);
    parent.add(built.group);
    if (bounds) built.collider = addBounds(
      colliders,
      bounds,
      `${name}-collider`,
      yOffset,
      `luxury-prop-collision:${name}`,
    );
    return built;
  };
  const makeOrientedCouch = ({ x, z, len, depth, rotY }) => {
    // props.makeCouch is deliberately fixed east-facing. Build it at the
    // origin, then transform the complete local assembly so this scene can
    // author a true sectional without changing every existing apartment.
    const built = P.makeCouch(M, { x: 0, z: 0, len, depth });
    built.group.position.set(x, 0, z);
    built.group.rotation.y = rotY;
    built.group.userData.orientation = rotY;
    const c = Math.abs(Math.cos(rotY));
    const s = Math.abs(Math.sin(rotY));
    const halfX = depth * c / 2 + len * s / 2;
    const halfZ = depth * s / 2 + len * c / 2;
    built.bounds = [[x - halfX, 0, z - halfZ], [x + halfX, 0.66, z + halfZ]];
    return built;
  };

  /* Main floor: one double-height entertaining room. All uses stay south of
   * the sealed loft plinth, so the shared ground resolver has one answer. */
  furnishings.add(own(boxFrom(0.65, 0.006, 0.92, 6.42, 0.025, 6.05, M.rug, {
    name: 'luxury-lounge-rug', cast: false,
  }), 'luxury-lounge'));
  const couch = addProp(furnishings, P.makeCouch(M, { x: 2.88, z: 3.27, len: 3.22, depth: 1.04 }), 'luxury-lounge-sectional');
  const couchReturn = addProp(furnishings, makeOrientedCouch({
    x: 4.50,
    z: 4.40,
    len: 2.18,
    depth: 0.94,
    rotY: Math.PI / 2,
  }), 'luxury-lounge-return');
  couchReturn.group.userData.sectionalReturn = true;
  void couchReturn;
  const table = addProp(furnishings, P.makeCoffeeTable(M, { x: 4.55, z: 3.26, w: 1.48, d: 0.78 }), 'luxury-lounge-coffee-table');
  const pizza = P.makePizzaBox(M, { x: 4.42, y: table.top, z: 3.22, rotY: -0.18 });
  pizza.group.name = 'luxury-pizza-box';
  furnishings.add(own(pizza.group, 'luxury-prop:pizza'));
  const bong = buildInteractiveBong(M, { x: 4.15, y: table.top, z: 3.52, rotY: 0.18 });
  bong.group.name = 'luxury-bong';
  bong.target.name = 'luxury-bong-target';
  furnishings.add(own(bong.group, 'luxury-prop:bong'), bong.target);
  const shrooms = P.makeMushrooms(M, { x: 4.76, y: table.top, z: 3.55, rotY: -0.30 });
  shrooms.group.name = 'luxury-shrooms';
  furnishings.add(own(shrooms.group, 'luxury-prop:shrooms'));
  const shroomsTarget = proxy('luxury-shrooms-target', [0.30, 0.30, 0.30], [4.76, table.top + 0.14, 3.55], furnishings);
  const revolverTray = box({
    name: 'luxury-revolver-display-tray',
    size: [0.54, 0.10, 0.38],
    pos: [4.92, table.top + 0.05, 3.12],
    mat: M.velvet,
  });
  furnishings.add(own(revolverTray, 'luxury-prop:revolver-tray'));
  const revolver = P.makeRevolver(M, { x: 4.92, y: table.top + 0.18, z: 3.12, rotY: 0.56 });
  revolver.group.name = 'luxury-revolver';
  furnishings.add(own(revolver.group, 'luxury-prop:revolver'));
  const revolverTarget = proxy('luxury-revolver-target', [0.50, 0.38, 0.38], [4.92, table.top + 0.25, 3.12], furnishings);
  const ammo = P.makeAmmoBox(M, { x: 5.25, y: table.top + 0.012, z: 3.42, rotY: -0.42, count: 8, loose: 3 });
  ammo.group.name = 'luxury-ammo';
  furnishings.add(own(ammo.group, 'luxury-prop:ammo'));
  const ammoTarget = proxy('luxury-ammo-target', [0.36, 0.28, 0.32], [5.25, table.top + 0.14, 3.42], furnishings);

  const powderLine = box({
    name: 'luxury-white-line-powder',
    size: [0.008, 0.006, 0.27],
    pos: [4.07, table.top + 0.018, 3.06],
    mat: mat({ color: 0xf2efe8, roughness: 0.96 }),
    rotY: 0.18,
  });
  const powderCard = box({
    name: 'luxury-white-line-card',
    size: [0.086, 0.006, 0.052],
    pos: [4.19, table.top + 0.020, 3.10],
    mat: M.paper,
    rotY: 0.44,
  });
  const whiteLineGroup = group('luxury-white-line', powderLine, powderCard);
  furnishings.add(own(whiteLineGroup, 'luxury-prop:white-line'));
  const whiteLineTarget = proxy('luxury-white-line-target', [0.42, 0.28, 0.42], [4.12, table.top + 0.14, 3.08], furnishings);
  const tv = addProp(furnishings, P.makeTv(M, { x: 7.72, z: 3.28, rotY: -Math.PI / 2, w: 2.55 }), 'luxury-cinema-wall');
  const tvGlow = new THREE.PointLight(0x7aa7ff, 0, 7, 1.8);
  tvGlow.name = 'luxury-tv-glow';
  tvGlow.position.set(7.32, 1.25, 3.28);
  furnishings.add(tvGlow);

  const sideboard = addProp(furnishings, P.makeSideboard(M, { x: 1.72, z: 6.78, w: 2.25, d: 0.52 }), 'luxury-hifi-sideboard');
  const radioPos = new THREE.Vector3(1.72, sideboard.top, 6.66);
  const radio = P.makeRadio(M, { x: radioPos.x, y: radioPos.y, z: radioPos.z, rotY: Math.PI });
  radio.group.name = 'luxury-hifi';
  furnishings.add(own(radio.group, 'luxury-prop:hifi'));
  const phone = P.makePhone(M, { x: 2.36, y: sideboard.top + 0.01, z: 6.68, rotY: 0.28 });
  phone.group.name = 'luxury-phone';
  furnishings.add(own(phone.group, 'luxury-prop:phone'));
  const phoneTarget = proxy('luxury-phone-target', [0.32, 0.30, 0.34], [2.36, sideboard.top + 0.15, 6.68], furnishings);
  const answeringMachine = makeAnswerMachine(M, { x: 1.02, y: sideboard.top, z: 6.67, rotY: Math.PI });
  answeringMachine.group.name = 'luxury-answering-machine';
  furnishings.add(own(answeringMachine.group, 'luxury-prop:answering-machine'));
  const answeringMachineTarget = proxy(
    'luxury-answering-machine-target',
    [0.38, 0.30, 0.34],
    [1.02, sideboard.top + 0.14, 6.67],
    furnishings,
  );

  // Reuse the apartment kitchen at a translated Z origin. The builder's
  // returned handle positions receive the same translation exactly once.
  const kitchenOffsetZ = 3.18;
  const kitchen = P.makeKitchen(M, { x: 10.75, wallX: 10.75, z0: -2.20, z1: 2.10 });
  kitchen.group.position.z = kitchenOffsetZ;
  kitchen.group.name = 'luxury-chef-kitchen';
  furnishings.add(own(kitchen.group, 'luxury-prop:kitchen'));
  const kitchenBounds = [
    [kitchen.bounds[0][0], kitchen.bounds[0][1], kitchen.bounds[0][2] + kitchenOffsetZ],
    [kitchen.bounds[1][0], kitchen.bounds[1][1], kitchen.bounds[1][2] + kitchenOffsetZ],
  ];
  addBounds(colliders, kitchenBounds, 'luxury-chef-kitchen-collider', 0, 'luxury-prop-collision:kitchen');
  const shiftZ = (v) => v.clone().add(new THREE.Vector3(0, 0, kitchenOffsetZ));
  kitchen.hob = shiftZ(kitchen.hob);
  kitchen.sinkPos = shiftZ(kitchen.sinkPos);
  kitchen.tapPos = shiftZ(kitchen.tapPos);
  kitchen.basinPos = shiftZ(kitchen.basinPos);
  for (const key of Object.keys(kitchen.spots)) kitchen.spots[key] = shiftZ(kitchen.spots[key]);

  const fridge = addProp(furnishings, P.makeFridge(M, { x: 10.37, z: 6.92, w: 0.92, d: 0.80, h: 2.12 }), 'luxury-panelled-fridge');
  const fridgeArt = dressLuxuryFridge(fridge, M, gear);
  const pan = P.makePan(M, { x: kitchen.hob.x, y: kitchen.hob.y, z: kitchen.hob.z, rotY: -1.05 });
  pan.group.name = 'luxury-kitchen-pan';
  furnishings.add(own(pan.group, 'luxury-prop:kitchen-pan'));
  const cigs = P.makeCigarettePack(M, {
    x: kitchen.spots.smokes.x, y: kitchen.spots.smokes.y, z: kitchen.spots.smokes.z, rotY: -0.42,
  });
  const whiskey = P.makeWhiskeyBottle(M, {
    x: kitchen.spots.bottle.x,
    y: kitchen.spots.bottle.y,
    z: kitchen.spots.bottle.z,
    rotY: -Math.PI / 2 + 0.12,
    labelTexture: propTexture('label.whiskey'),
  });
  const ashtray = P.makeAshtray(M, {
    x: kitchen.spots.ashtray.x, y: kitchen.top, z: kitchen.spots.ashtray.z, rotY: 0.3,
  });
  furnishings.add(
    own(cigs.group, 'luxury-prop:smokes'),
    own(whiskey.group, 'luxury-prop:whiskey'),
    own(ashtray.group, 'luxury-prop:ashtray'),
    own(P.makeShotGlass(M, { x: kitchen.spots.shot.x, y: kitchen.top, z: kitchen.spots.shot.z }).group, 'luxury-prop:shot-glass'),
  );
  const kitchenTarget = proxy('luxury-kitchen-target', [1.0, 1.55, 2.8], [9.50, 0.92, 3.25], furnishings);

  const eggs = P.makeEggCarton(M, {
    x: (fridge.interior.x0 + fridge.interior.x1) / 2,
    y: fridge.interior.shelfY[2] + 0.02,
    z: fridge.interior.z0 + 0.22,
    rotY: Math.PI / 2,
    texture: propTexture('eggs.carton'),
  });
  const milk = P.makeMilkJug(M, {
    x: (fridge.interior.x0 + fridge.interior.x1) / 2,
    y: fridge.interior.shelfY[2] + 0.012,
    z: fridge.interior.z1 - 0.14,
    rotY: -Math.PI / 2,
  });
  const cereal = P.makeCerealBox(M, {
    x: fridge.centre.x,
    y: fridge.top,
    z: fridge.centre.z,
    rotY: -Math.PI / 2,
    texture: propTexture('cereal.box'),
  });
  furnishings.add(own(eggs.group, 'luxury-prop:eggs'), own(milk.group, 'luxury-prop:milk'), own(cereal.group, 'luxury-prop:cereal'));

  for (const [x, z, scale] of [[7.75, 7.18, 1.20], [-0.15, 7.02, 1.12], [9.1, 0.50, 1.12]]) {
    addProp(furnishings, P.makePlant(M, { x, z, scale }), `luxury-main-plant-${x}-${z}`);
  }

  /* Loft: bedroom, open office, wardrobe and spa share one upper plate and
   * look over the main room. Props stay local to loftContents (Y=3.30). */
  const bed = addProp(loftContents, P.makeBed(M, { x: 7.05, z: -6.25, w: 2.05, len: 2.35 }), 'luxury-loft-bed', LOFT_Y);
  const nightLeft = addProp(loftContents, P.makeNightstand(M, { x: 5.68, z: -6.94 }), 'luxury-nightstand-left', LOFT_Y);
  const nightRight = addProp(loftContents, P.makeNightstand(M, { x: 8.42, z: -6.94 }), 'luxury-nightstand-right', LOFT_Y);
  void nightRight;
  const desk = addProp(loftContents, P.makeDesk(M, {
    x: 0.15,
    z: -6.54,
    w: 2.85,
    d: 0.78,
    towerSticker: propTexture('sticker.tower'),
  }), 'luxury-loft-desk', LOFT_Y);
  const zyn = P.makeZynCan(M, {
    x: 1.34,
    y: desk.top + 0.01,
    z: -6.76,
    rotY: 0.34,
    lidTexture: propTexture('zyn.lid'),
  });
  zyn.group.name = 'luxury-desk-zyn';
  loftContents.add(own(zyn.group, 'luxury-prop:zyn'));
  const chair = addProp(loftContents, P.makeChair(M, { x: 0.15, z: -5.56, rotY: Math.PI }), 'luxury-loft-chair', LOFT_Y);
  void chair;
  const bedroomPhone = P.makePhone(M, { x: 5.66, y: nightLeft.top + 0.01, z: -6.93, rotY: -0.35 });
  bedroomPhone.group.name = 'luxury-bedroom-spare-phone';
  loftContents.add(own(bedroomPhone.group, 'luxury-prop:bedroom-phone'));

  const closetBack = gear.get('closet.back');
  const closet = P.makeCloset(M, {
    x0: 8.72,
    x1: 10.36,
    z0: -4.92,
    z1: -3.30,
    h: 2.72,
    architectureAssembly: 'luxury-wardrobe',
    railAssembly: 'luxury-wardrobe-rail',
    garments: [
      { cut: gear.get('closet.shirt.a')?.texture, w: 0.44 },
      { cut: gear.get('closet.shirt.b')?.texture, w: 0.44 },
      { colour: 0x1b1d22, w: 0.42 },
      { colour: 0x8b8071, w: 0.42 },
      { colour: 0x39483f, w: 0.42 },
    ],
    back: closetBack ? { texture: closetBack.texture, w: 0.62, h: 0.78, y: 1.46 } : null,
  });
  addProp(loftContents, closet, 'luxury-walk-in-wardrobe', LOFT_Y,
    [[8.60, 0, -5.05], [10.50, 2.72, -3.18]]);

  // Every non-gallery texture has one concrete, semantically named home.
  // The returned map is deliberately public so tests can prove placement
  // without treating a resolved manifest record as evidence of visibility.
  placePropArt('closet.back', closet.picture, 'loft-wardrobe-back');
  placePropArt('closet.shirt.a', closet.hangers[0]?.mesh, 'loft-wardrobe-rail');
  placePropArt('closet.shirt.b', closet.hangers[1]?.mesh, 'loft-wardrobe-rail');
  for (const [slot, target] of Object.entries(fridgeArt)) {
    placePropArt(slot, target, 'main-kitchen-fridge-door');
  }
  placePropArt('sticker.tower', desk.group, 'loft-office-pc-tower');
  placePropArt('zyn.lid', zyn.lid, 'loft-office-desktop');
  placePropArt('label.beer', fridge.beerSlots[0], 'main-kitchen-fridge-interior');
  placePropArt('label.whiskey', whiskey.group, 'main-kitchen-counter');
  placePropArt('eggs.carton', eggs.group, 'main-kitchen-fridge-interior');
  placePropArt('cereal.box', cereal.group, 'main-kitchen-fridge-top');

  const bath = LUXURY_APARTMENT.bathroom;
  const bathShell = group('luxury-loft-bathroom');
  const bathWallMat = M.marble;
  bathShell.add(boxFrom(bath.x0, 0.006, bath.z0, bath.x1, 0.028, bath.z1, M.splash, { name: 'luxury-bath-floor' }));
  const bathWalls = [
    boxFrom(bath.x0, 0, bath.z0, bath.x1, 2.80, bath.z0 + 0.10, bathWallMat, { name: 'luxury-bath-wall-north' }),
    boxFrom(bath.x0, 0, bath.z0, bath.x0 + 0.10, 2.80, bath.z1, bathWallMat, { name: 'luxury-bath-wall-west' }),
    boxFrom(bath.x1 - 0.10, 0, bath.z0, bath.x1, 2.80, bath.z1 - 1.05, bathWallMat, { name: 'luxury-bath-wall-east' }),
    boxFrom(bath.x0, 0, bath.z1 - 0.10, bath.x0 + 2.25, 2.80, bath.z1, bathWallMat, { name: 'luxury-bath-wall-south' }),
  ];
  for (const wall of bathWalls) bathShell.add(structural(wall, 'luxury-bath-shell'));
  loftContents.add(bathShell);
  addBounds(colliders, [[bath.x0, 0, bath.z0], [bath.x1, 2.8, bath.z0 + 0.10]], 'luxury-bath-north-collider', LOFT_Y, 'luxury-bath-collision');
  addBounds(colliders, [[bath.x0, 0, bath.z0], [bath.x0 + 0.10, 2.8, bath.z1]], 'luxury-bath-west-collider', LOFT_Y, 'luxury-bath-collision');
  addBounds(colliders, [[bath.x1 - 0.10, 0, bath.z0], [bath.x1, 2.8, bath.z1 - 1.05]], 'luxury-bath-east-collider', LOFT_Y, 'luxury-bath-collision');
  addBounds(colliders, [[bath.x0, 0, bath.z1 - 0.10], [bath.x0 + 2.25, 2.8, bath.z1]], 'luxury-bath-south-collider', LOFT_Y, 'luxury-bath-collision');

  const tub = P.makeTub(M, { x0: -6.72, z0: -7.45, x1: -5.25, z1: -5.30 });
  const toilet = P.makeToilet(M, { x: -4.30, z: -6.80, rotY: 0 });
  const sink = P.makeBathSink(M, { x: -2.88, z: -5.55, rotY: -Math.PI / 2 });
  addProp(loftContents, tub, 'luxury-rainfall-shower', LOFT_Y);
  addProp(loftContents, toilet, 'luxury-loft-toilet', LOFT_Y);
  addProp(loftContents, sink, 'luxury-loft-bath-sink', LOFT_Y);

  const bathZone = {
    name: 'luxury-bath-tile-zone',
    box: new THREE.Box3(
      new THREE.Vector3(bath.x0, LOFT_Y, bath.z0),
      new THREE.Vector3(bath.x1, LOFT_Y + 1.2, bath.z1),
    ),
    surface: 'tile',
    y: LOFT_Y,
  };
  // The shell caller's broad loft zone still works if a runtime does not use
  // this refinement; expose it on the root for scene verifiers.
  bathShell.userData.floorZone = bathZone;
  floorZones.unshift(bathZone);

  for (const [x, z, scale] of [[2.7, -2.15, 1.20], [10.1, -7.0, 1.05], [-8.9, -6.8, 1.12]]) {
    addProp(loftContents, P.makePlant(M, { x, z, scale }), `luxury-loft-plant-${x}-${z}`, LOFT_Y);
  }

  const bedTarget = proxy('luxury-bed-target', [2.20, 0.72, 2.45], [7.05, LOFT_Y + 0.88, -6.25], furnishings);
  const couchTarget = proxy('luxury-couch-target', [1.25, 0.86, 3.10], [2.90, 0.92, 3.27], furnishings);

  return {
    couch,
    bed,
    table,
    pizza,
    bong,
    shrooms,
    revolver,
    ammo,
    whiteLine: { group: whiteLineGroup, line: powderLine, card: powderCard, target: whiteLineTarget },
    tv,
    tvGlow,
    sideboard,
    radio,
    radioPos,
    phone,
    answeringMachine,
    kitchen,
    fridge,
    pan,
    cigs,
    whiskey,
    desk,
    zyn,
    closet,
    nightLeft,
    nightRight,
    propArtPlacements: Object.freeze(propArtPlacements),
    tub,
    toilet,
    sink,
    targets: {
      bed: bedTarget,
      couch: couchTarget,
      phone: phoneTarget,
      kitchen: kitchenTarget,
      answeringMachine: answeringMachineTarget,
      revolver: revolverTarget,
      ammo: ammoTarget,
      bong: bong.target,
      shrooms: shroomsTarget,
      whiteLine: whiteLineTarget,
    },
  };
}

function dressLuxuryFridge(fridge, M, gear) {
  const placements = {};
  const items = [
    { slot: 'fridge.magnet', y: 1.55, z: -0.28, w: 0.27, tilt: -0.07, magnet: true },
    { slot: 'fridge.photo.a', y: 1.22, z: -0.51, w: 0.23, tilt: 0.08, magnet: true },
    { slot: 'fridge.photo.b', y: 0.67, z: -0.24, w: 0.21, tilt: -0.10, magnet: true },
    { slot: 'sticker.fridge', y: 0.95, z: -0.58, w: 0.20, tilt: 0.13, sticker: true },
    { slot: 'sticker.fridge.b', y: 1.76, z: -0.55, w: 0.18, tilt: -0.16, sticker: true },
  ];
  for (const item of items) {
    const record = gear.get(item.slot);
    if (!record) continue;
    const h = item.w / Math.max(0.25, record.aspect);
    const decal = P.makeDecal(M, {
      texture: record.texture,
      w: item.w,
      h,
      magnet: item.magnet,
      sticker: item.sticker,
    });
    decal.group.name = `luxury-fridge-art-${safeName(item.slot)}`;
    decal.group.position.set(-0.039, item.y, item.z);
    decal.group.rotation.set(0, -Math.PI / 2, item.tilt);
    decal.group.userData.artSlot = item.slot;
    fridge.door.add(own(decal.group, `luxury-fridge-art:${item.slot}`, { checkSupport: false }));
    placements[item.slot] = decal.group;
  }
  return placements;
}

function buildGameZone({ root, M, colliders }) {
  const gameRoot = group('luxury-game-zone');
  root.add(own(gameRoot, 'luxury-game-zone'));

  const arcadeGroup = group('luxury-arcade-cabinet');
  const ax = -5.42;
  const az = 1.18;
  arcadeGroup.add(box({
    name: 'luxury-arcade-base',
    size: [1.02, 1.12, 0.78],
    pos: [ax, 0.56, az],
    mat: M.marbleDark,
  }));
  arcadeGroup.add(box({
    name: 'luxury-arcade-upper',
    size: [0.98, 1.10, 0.64],
    pos: [ax, 1.63, az - 0.06],
    mat: M.black,
    rotX: -0.05,
  }));
  const arcadeScreen = plane(0.75, 0.46, M.screenOff.clone());
  arcadeScreen.name = 'luxury-arcade-screen';
  arcadeScreen.position.set(ax, 1.67, az + 0.278);
  arcadeScreen.rotation.x = -0.06;
  arcadeGroup.add(arcadeScreen);
  const arcadeMarqueeMaterial = new THREE.MeshStandardMaterial({
    color: 0x190f26,
    emissive: new THREE.Color(0xb877ff),
    emissiveIntensity: 1.2,
    roughness: 0.45,
  });
  const marquee = box({
    name: 'luxury-arcade-marquee',
    size: [0.92, 0.26, 0.12],
    pos: [ax, 2.25, az + 0.17],
    mat: arcadeMarqueeMaterial,
  });
  arcadeGroup.add(marquee);
  const control = box({
    name: 'luxury-arcade-control-deck',
    size: [0.91, 0.13, 0.42],
    pos: [ax, 1.04, az + 0.30],
    mat: M.darkWood,
    rotX: -0.10,
  });
  arcadeGroup.add(control);
  arcadeGroup.add(cylinder({ name: 'luxury-arcade-stick', r: 0.035, h: 0.20, pos: [ax - 0.20, 1.18, az + 0.32], mat: M.trim }));
  for (const [dx, color] of [[0.08, 0xdb4968], [0.22, 0x65b9e8], [0.34, 0xe3c65c]]) {
    arcadeGroup.add(cylinder({
      name: `luxury-arcade-button-${dx}`,
      r: 0.036,
      h: 0.025,
      pos: [ax + dx, 1.13, az + 0.39],
      mat: mat({ color, roughness: 0.35 }),
    }));
  }
  gameRoot.add(own(arcadeGroup, 'luxury-minigame:arcade'));
  addBounds(colliders, [[ax - 0.53, 0, az - 0.42], [ax + 0.53, 2.40, az + 0.45]],
    'luxury-arcade-cabinet-collider', 0, 'luxury-minigame-collision:arcade');
  const arcadeTarget = proxy('luxury-arcade-target', [1.15, 2.20, 0.54], [ax, 1.25, az + 0.50], gameRoot);
  const arcadeSeatZ = az + 0.95;
  const arcadeSeat = group('luxury-arcade-stool');
  arcadeSeat.add(
    cylinder({ name: 'luxury-arcade-stool-base', r: 0.23, h: 0.045, pos: [ax, 0.023, arcadeSeatZ], mat: M.darkSteel }),
    cylinder({ name: 'luxury-arcade-stool-stem', r: 0.045, h: 0.43, pos: [ax, 0.24, arcadeSeatZ], mat: M.trim }),
    cylinder({ name: 'luxury-arcade-stool-seat', r: 0.29, h: 0.10, pos: [ax, 0.50, arcadeSeatZ], mat: M.velvet }),
  );
  const stoolRing = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 8, 24), M.trim);
  stoolRing.name = 'luxury-arcade-stool-foot-ring';
  stoolRing.rotation.x = Math.PI / 2;
  stoolRing.position.set(ax, 0.22, arcadeSeatZ);
  arcadeSeat.add(stoolRing);
  gameRoot.add(own(arcadeSeat, 'luxury-minigame:arcade-seat'));
  addBounds(
    colliders,
    [[ax - 0.29, 0, arcadeSeatZ - 0.29], [ax + 0.29, 0.56, arcadeSeatZ + 0.29]],
    'luxury-arcade-stool-collider',
    0,
    'luxury-minigame-collision:arcade-seat',
  );

  const pokerGroup = group('luxury-poker-table');
  const px = -2.45;
  const pz = 3.80;
  const pokerTop = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.13, 32), M.velvet);
  pokerTop.name = 'luxury-poker-felt';
  pokerTop.position.set(px, 0.78, pz);
  pokerTop.scale.z = 0.72;
  pokerGroup.add(pokerTop);
  const pokerRail = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.085, 10, 40), M.darkWood);
  pokerRail.name = 'luxury-poker-rail';
  pokerRail.rotation.x = Math.PI / 2;
  pokerRail.position.set(px, 0.83, pz);
  pokerRail.scale.z = 0.72;
  pokerGroup.add(pokerRail);
  pokerGroup.add(cylinder({ name: 'luxury-poker-pedestal', rTop: 0.32, rBottom: 0.48, h: 0.74, pos: [px, 0.37, pz], mat: M.marbleDark }));
  const chipColors = [0xb84444, 0x2c68a8, 0xe7d6a0, 0x25272b];
  const chips = [];
  for (let i = 0; i < 24; i++) {
    const a = (i * 2.399963) % (Math.PI * 2);
    const radius = 0.25 + (i % 5) * 0.13;
    const chip = cylinder({
      name: `luxury-poker-chip-${String(i).padStart(2, '0')}`,
      r: 0.038,
      h: 0.012,
      pos: [px + Math.cos(a) * radius, 0.86 + (i % 3) * 0.012, pz + Math.sin(a) * radius * 0.70],
      mat: mat({ color: chipColors[i % chipColors.length], roughness: 0.48 }),
    });
    chips.push(chip);
    pokerGroup.add(chip);
  }
  gameRoot.add(own(pokerGroup, 'luxury-minigame:poker'));
  addBounds(colliders, [[px - 1.22, 0, pz - 0.88], [px + 1.22, 0.88, pz + 0.88]],
    'luxury-poker-table-collider', 0, 'luxury-minigame-collision:poker');
  const pokerTarget = proxy('luxury-poker-target', [2.40, 0.90, 1.85], [px, 0.72, pz], gameRoot);

  const makePokerSeat = (name, x, z, rotY) => {
    const seat = group(name);
    seat.position.set(x, 0, z);
    seat.rotation.y = rotY;
    seat.add(
      box({ name: `${name}-seat`, size: [0.54, 0.12, 0.50], pos: [0, 0.50, 0], mat: M.velvet }),
      box({ name: `${name}-back`, size: [0.54, 0.62, 0.11], pos: [0, 0.82, -0.22], mat: M.velvet, rotX: 0.08 }),
      box({ name: `${name}-apron`, size: [0.46, 0.12, 0.42], pos: [0, 0.38, 0], mat: M.darkWood }),
    );
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        seat.add(cylinder({
          name: `${name}-leg-${sx}-${sz}`,
          r: 0.025,
          h: 0.38,
          pos: [sx * 0.22, 0.19, sz * 0.18],
          mat: M.trim,
        }));
      }
      seat.add(box({
        name: `${name}-arm-${sx}`,
        size: [0.07, 0.10, 0.44],
        pos: [sx * 0.29, 0.69, -0.01],
        mat: M.darkWood,
      }));
    }
    gameRoot.add(own(seat, 'luxury-minigame:poker-seating'));
    addBounds(
      colliders,
      [[x - 0.32, 0, z - 0.32], [x + 0.32, 1.14, z + 0.32]],
      `${name}-collider`,
      0,
      'luxury-minigame-collision:poker-seat',
    );
    return seat;
  };
  const pokerSeats = [
    makePokerSeat('luxury-poker-seat-player', px, pz + 1.23, Math.PI),
    makePokerSeat('luxury-poker-seat-north', px, pz - 1.23, 0),
    makePokerSeat('luxury-poker-seat-west', px - 1.57, pz, Math.PI / 2),
    makePokerSeat('luxury-poker-seat-east', px + 1.57, pz, -Math.PI / 2),
  ];

  const dartsGroup = group('luxury-darts-station');
  const dartX = LUXURY_APARTMENT.x0 + 0.26;
  const dartZ = 3.95;
  const board = new THREE.Mesh(
    new THREE.CylinderGeometry(0.43, 0.43, 0.08, 36),
    mat({ color: 0x191b1c, roughness: 0.84 }),
  );
  board.name = 'luxury-darts-board';
  board.position.set(dartX, 1.72, dartZ);
  board.rotation.z = Math.PI / 2;
  dartsGroup.add(board);
  for (let ring = 0; ring < 5; ring++) {
    const r = 0.36 - ring * 0.068;
    const marker = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 42), ring % 2 ? M.trim : M.marble);
    marker.name = `luxury-darts-ring-${ring}`;
    marker.position.set(dartX + 0.045, 1.72, dartZ);
    marker.rotation.y = Math.PI / 2;
    dartsGroup.add(marker);
  }
  const oche = box({
    name: 'luxury-darts-oche',
    size: [0.07, 0.025, 1.10],
    pos: [-8.34, 0.014, dartZ],
    mat: M.trim,
  });
  dartsGroup.add(oche);
  gameRoot.add(own(dartsGroup, 'luxury-minigame:darts'));
  const dartsTarget = proxy('luxury-darts-target', [0.54, 1.12, 1.12], [dartX + 0.28, 1.72, dartZ], gameRoot);

  return {
    root: gameRoot,
    arcade: { group: arcadeGroup, target: arcadeTarget, screen: arcadeScreen, marquee, seat: arcadeSeat },
    poker: { group: pokerGroup, target: pokerTarget, chips, seats: pokerSeats },
    darts: { group: dartsGroup, target: dartsTarget, board },
    update(_dt, elapsed) {
      arcadeMarqueeMaterial.emissiveIntensity = 1.08 + Math.sin(elapsed * 2.1) * 0.20;
      pokerRail.rotation.z = Math.sin(elapsed * 0.18) * 0.002;
    },
  };
}

function buildGallery({ root, architecture, M, gear, domestic, interaction, ctx, artTargets }) {
  const galleryRoot = group('luxury-art-collection');
  root.add(own(galleryRoot, 'luxury-art-collection'));

  const semanticPlacements = makeSemanticArtPlacements(domestic);
  const inherited = LUXURY_DISPLAY_ART_SLOTS.filter((slot) => !LUXURY_EXTRA_ART_SLOTS.includes(slot));
  const ordered = [...LUXURY_EXTRA_ART_SLOTS, ...inherited];
  const inheritedPlacements = makeGalleryPlacements(
    inherited.filter((slot) => !semanticPlacements.has(slot)).length,
  );
  let inheritedPlacementIndex = 0;
  const frames = [];

  for (let index = 0; index < ordered.length; index++) {
    const slot = ordered[index];
    const record = gear.get(slot);
    if (!record) continue;
    const placement = semanticPlacements.get(slot) ?? inheritedPlacements[inheritedPlacementIndex++];
    const forcedAspect = placement.aspect ?? null;
    const aspect = forcedAspect ?? Math.max(0.42, Math.min(1.85, record.aspect || 0.8));
    const height = placement.height;
    const width = Math.min(1.48, height * aspect * (record.scale ?? 1));
    const isCrooked = slot === 'cork.above';
    const common = {
      x: placement.x,
      y: placement.y,
      z: placement.z,
      rotY: placement.rotY,
      texture: record.texture,
    };
    let frame;
    if (placement.kind === 'banner') {
      frame = P.makeBanner(M, { ...common, w: placement.width ?? width, h: height });
      frame.art = frame.cloth ?? frame.group;
    } else if (placement.kind === 'crest') {
      frame = P.makeRoundCrest(M, { ...common, r: placement.radius ?? height / 2 });
      frame.art = frame.face;
    } else if (placement.kind === 'standing' || placement.kind === 'under-bed') {
      frame = P.makeStandingFrame(M, { ...common, w: width, h: height });
      frame.panel = frame.art.parent;
      if (placement.kind === 'under-bed') {
        frame.leg.removeFromParent();
        frame.panel.rotation.x = 0;
        frame.group.rotation.set(-Math.PI / 2, 0, placement.spin ?? Math.PI / 2 + 0.14);
      }
    } else {
      frame = P.makeFrame(M, {
        ...common,
        w: width,
        h: height,
        tint: index % 4 === 0 ? 0xa58149 : index % 3 === 0 ? 0x15191e : 0x2a211a,
        roll: isCrooked ? -0.055 : 0,
        lean: isCrooked ? -0.085 : 0,
        artRoll: isCrooked ? 0.055 : 0,
        artInset: isCrooked ? 0.955 : 1,
      });
    }
    frame.group.name = `luxury-art-${safeName(slot)}`;
    frame.group.userData.artSlot = slot;
    frame.group.userData.artSource = LUXURY_EXTRA_ART_SLOTS.includes(slot) ? 'luxury' : 'apartment';
    frame.group.userData.artAspect = forcedAspect ?? record.aspect;
    frame.group.userData.artZone = placement.zone;
    frame.group.userData.artDisplayKind = placement.kind ?? 'framed';
    own(frame.group, `luxury-art:${slot}`, { checkSupport: false });
    galleryRoot.add(frame.group);
    artTargets[slot] = frame.group;
    frames.push({ slot, mesh: frame.group, frame, record, placement });
    interaction.register(frame.group, {
      label: `Look at <b>${record.title || 'the artwork'}</b>`,
      onUse: () => ctx.onArt?.(slot, record),
    });
  }

  // Dedicated museum washes for the two new hero pieces.
  const artLights = [
    { slot: 'luxury.night-watch', color: 0x9ec5ff, intensity: 42 },
    { slot: 'luxury.ascension', color: 0xffd4aa, intensity: 38 },
  ].map(({ slot, color, intensity }) => {
    const frame = artTargets[slot];
    const light = new THREE.SpotLight(color, intensity, 5.5, Math.PI / 8.5, 0.72, 1.55);
    light.name = `luxury-art-light-${safeName(slot)}`;
    light.position.copy(frame.position).add(new THREE.Vector3(0, 0.92, 1.18));
    light.target = frame;
    light.castShadow = false;
    architecture.add(light);
    return { light, intensity };
  });

  const crookedFrame = frames.find(({ slot }) => slot === 'cork.above');
  const crookedArt = crookedFrame ? {
    slot: crookedFrame.slot,
    group: crookedFrame.mesh,
    target: crookedFrame.mesh,
    panel: crookedFrame.frame.panel,
    art: crookedFrame.frame.art,
    setCrookedness(amount = 0) {
      const t = THREE.MathUtils.clamp(Number(amount) || 0, 0, 1);
      crookedFrame.frame.panel.rotation.z = -0.055 * t;
      crookedFrame.frame.panel.rotation.x = -0.085 * t;
      crookedFrame.frame.art.rotation.z = 0.055 * t;
      crookedFrame.frame.art.scale.setScalar(1 - 0.045 * t);
      return t;
    },
  } : null;

  return {
    root: galleryRoot,
    frames,
    artLights,
    crookedArt,
    update(_dt, elapsed) {
      for (let i = 0; i < artLights.length; i++) {
        artLights[i].light.intensity = artLights[i].intensity + Math.sin(elapsed * 0.22 + i) * 1.2;
      }
    },
  };
}

function makeLuxuryExtraPlacements() {
  const plinthZ = LUXURY_APARTMENT.loft.z1 + 0.035;
  const northZ = LUXURY_APARTMENT.z0 + 0.045;
  const westX = LUXURY_APARTMENT.x0 + 0.045;
  return new Map([
    ['luxury.night-watch', { x: 2.85, y: 1.88, z: plinthZ, rotY: 0, height: 1.02, aspect: 1.5, zone: 'main-hero' }],
    ['luxury.ascension', { x: 4.48, y: 1.82, z: plinthZ, rotY: 0, height: 1.18, aspect: 2 / 3, zone: 'main-hero' }],
    ['luxury.foyer.statement', { x: 9.62, y: 1.72, z: plinthZ, rotY: 0, height: 1.02, aspect: 0.78, zone: 'foyer-elevator' }],
    ['luxury.city.night', { x: -0.75, y: 1.72, z: plinthZ, rotY: 0, height: 0.72, aspect: 1.65, zone: 'city-lounge' }],
    ['luxury.loft.triptych.a', { x: -10.00, y: LOFT_Y + 1.55, z: northZ, rotY: 0, height: 0.68, aspect: 1.2, zone: 'loft-triptych' }],
    ['luxury.loft.triptych.b', { x: -8.85, y: LOFT_Y + 1.55, z: northZ, rotY: 0, height: 0.68, aspect: 1.2, zone: 'loft-triptych' }],
    ['luxury.loft.triptych.c', { x: -7.70, y: LOFT_Y + 1.55, z: northZ, rotY: 0, height: 0.68, aspect: 1.2, zone: 'loft-triptych' }],
    ['luxury.stair.memory.a', { x: westX, y: 1.58, z: 0.78, rotY: Math.PI / 2, height: 0.62, aspect: 1.45, zone: 'stair-gallery' }],
    ['luxury.stair.memory.b', { x: westX, y: 2.42, z: 2.22, rotY: Math.PI / 2, height: 0.62, aspect: 1.45, zone: 'stair-gallery' }],
    ['luxury.bedroom.private', { x: 7.05, y: LOFT_Y + 1.56, z: northZ, rotY: 0, height: 0.78, aspect: 1.45, zone: 'bedroom' }],
    ['luxury.office.victory', { x: 0.15, y: LOFT_Y + 1.56, z: northZ, rotY: 0, height: 0.72, aspect: 1.65, zone: 'office' }],
    ['luxury.arcade.marquee', { x: -5.55, y: 1.72, z: plinthZ, rotY: 0, height: 0.58, aspect: 1.65, zone: 'arcade' }],
    ['luxury.poker.champions', { x: -3.35, y: 1.72, z: plinthZ, rotY: 0, height: 0.68, aspect: 1.50, zone: 'poker' }],
    ['luxury.bath.monochrome', { x: -4.70, y: LOFT_Y + 1.52, z: LUXURY_APARTMENT.bathroom.z0 + 0.125, rotY: 0, height: 0.70, aspect: 1.0, zone: 'bathroom' }],
  ]);
}

function makeSemanticArtPlacements(domestic) {
  const placements = makeLuxuryExtraPlacements();
  const plinthZ = LUXURY_APARTMENT.loft.z1 + 0.035;

  // Preserve the original apartment's display grammar instead of turning
  // every imported texture into an anonymous salon frame.
  for (const [slot, placement] of [
    ['banner.main', {
      kind: 'banner', x: -9.12, y: 1.72, z: plinthZ, rotY: 0,
      width: 1.28, height: 0.72, zone: 'main-entry-banner',
    }],
    ['banner.twitch', {
      kind: 'banner', x: -7.60, y: 1.72, z: plinthZ, rotY: 0,
      width: 1.05, height: 0.54, zone: 'main-games-banner',
    }],
    ['crest.round', {
      kind: 'crest', x: -6.40, y: 1.72, z: plinthZ, rotY: 0,
      radius: 0.29, height: 0.58, aspect: 1, zone: 'main-games-crest',
    }],
    ['shelf.photo', {
      kind: 'standing', x: 0.74, y: domestic.sideboard.top + 0.01, z: 6.61,
      rotY: Math.PI - 0.24, height: 0.18, zone: 'main-sideboard-display',
    }],
    ['sideboard.photo', {
      kind: 'standing', x: 2.71, y: domestic.sideboard.top + 0.01, z: 6.61,
      rotY: Math.PI + 0.20, height: 0.17, zone: 'main-sideboard-display',
    }],
    ['desk.photo', {
      kind: 'standing', x: 1.34, y: LOFT_Y + domestic.desk.top + 0.01, z: -6.58,
      rotY: 0.20, height: 0.13, zone: 'loft-office-desktop',
    }],
    ['night.photo', {
      kind: 'standing', x: 8.42, y: LOFT_Y + domestic.nightRight.top + 0.01, z: -6.92,
      rotY: -0.82, height: 0.15, zone: 'loft-bedroom-nightstand',
    }],
    ['shrine.b', {
      kind: 'standing', x: 9.46, y: LOFT_Y + 0.035, z: -4.69,
      rotY: Math.PI - 0.24, height: 0.15, zone: 'loft-wardrobe-shrine',
    }],
    ['bed.under', {
      kind: 'under-bed', x: 6.62, y: LOFT_Y + 0.018, z: -6.17,
      rotY: 0, spin: Math.PI / 2 + 0.14, height: 0.20, zone: 'loft-bedroom-under-bed',
    }],
  ]) placements.set(slot, placement);

  return placements;
}

function makeGalleryPlacements(count) {
  const placements = [];
  // Two salon rows preserve a clear middle register for the named luxury
  // triptych, office, bedroom, and bathroom works.
  const northXs = Array.from({ length: 18 }, (_, i) => -9.35 + i * 1.10);
  const northYs = [LOFT_Y + 0.62, LOFT_Y + 2.47];
  for (let row = 0; row < northYs.length; row++) {
    for (let col = 0; col < northXs.length; col++) {
      placements.push({
        x: northXs[col],
        y: northYs[row] + ((col + row) % 2) * 0.05,
        z: LUXURY_APARTMENT.z0 + 0.045,
        rotY: 0,
        height: 0.42 + ((col * 5 + row * 3) % 4) * 0.045,
        zone: 'loft-north-salon',
      });
    }
  }

  // Remaining pieces line the west gallery above and beside the entry.
  const westZs = [-7.15, -6.10, -5.05, -4.0, -2.95, -1.90, 1.00, 2.02, 3.04, 7.10];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < westZs.length; col++) {
      placements.push({
        x: LUXURY_APARTMENT.x0 + 0.045,
        y: row ? LOFT_Y + 1.75 : 1.52 + (col % 2) * 0.16,
        z: westZs[col],
        rotY: Math.PI / 2,
        height: 0.42 + ((col + row) % 3) * 0.06,
        zone: row ? 'loft-west-gallery' : 'main-west-gallery',
      });
    }
  }

  if (placements.length < count) {
    throw new RangeError(`Luxury gallery only has ${placements.length} placements for ${count} art slots`);
  }
  return placements;
}
