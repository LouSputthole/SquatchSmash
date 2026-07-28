/**
 * The apartment: shell, layout, lighting and every interaction in the room.
 *
 * Coordinate convention
 *   x: -5 (west) .. +5 (east)
 *   z: -4.5 (north) .. +4.5 (south)
 *   y: 0 (floor) .. 2.75 (ceiling)
 *
 * Yaw 0 looks north (-z); +x is east.
 */
import * as THREE from 'three';
import { box, boxFrom, cylinder, plane, mat, collider, group, yawToward } from './build.js';
import { makeMaterials } from './materials.js';
import * as P from './props.js';
import { resolveGear } from './gear.js';

export const ROOM = { x0: -5, x1: 5, z0: -4.5, z1: 4.5, h: 2.75, wall: 0.16 };

/**
 * Where the player's own art hangs. Keys match assets/art/manifest.json.
 * `h` is the picture height in metres; width follows the image's aspect ratio.
 */
export const WALL_SLOTS = [
  // West wall: over the bed, the gap by the lamp, then two over the couch.
  { slot: 'bed.above', x: -4.97, y: 1.86, z: -3.40, rotY: Math.PI / 2, h: 0.62 },
  { slot: 'west.gap', x: -4.97, y: 1.86, z: -1.30, rotY: Math.PI / 2, h: 0.54 },
  { slot: 'couch.left', x: -4.97, y: 1.68, z: 0.10, rotY: Math.PI / 2, h: 0.56 },
  { slot: 'couch.right', x: -4.97, y: 1.68, z: 1.44, rotY: Math.PI / 2, h: 0.56 },
  // North wall: either side of the monitor.
  { slot: 'desk.left', x: 0.92, y: 1.76, z: -4.40, rotY: 0, h: 0.54 },
  { slot: 'desk.right', x: 2.80, y: 1.76, z: -4.40, rotY: 0, h: 0.56 },
  // South wall gallery, running away from the front door.
  { slot: 'door.side', x: 0.90, y: 1.64, z: 4.40, rotY: Math.PI, h: 0.56 },
  { slot: 'south.hawaii', x: -2.05, y: 1.66, z: 4.40, rotY: Math.PI, h: 0.52 },
  { slot: 'south.wide', x: -3.35, y: 1.72, z: 4.40, rotY: Math.PI, h: 0.42 },
  { slot: 'south.portrait', x: -4.45, y: 1.58, z: 4.40, rotY: Math.PI, h: 0.62 },
];

const BANNER_SLOT = { slot: 'banner.main', x: 4.10, y: 1.52, z: -4.38, rotY: 0, h: 0.78 };

/** Round crest hung above the bookshelf on the north wall. */
const CREST_SLOT = { slot: 'crest.round', x: -2.70, y: 2.13, z: -4.40, rotY: 0, r: 0.21 };

/** Photo frames that stand on furniture rather than hanging. */
const STANDING_SLOTS = [
  { slot: 'shelf.photo', x: -0.52, y: 0.723, z: 4.14, rotY: Math.PI - 0.30, h: 0.19 },
  { slot: 'desk.photo', x: 0.98, y: 0.740, z: -4.22, rotY: 0.22, h: 0.13 },
];

/** Sticker stuck to the fridge door. */
const FRIDGE_MAGNET = { slot: 'fridge.magnet', w: 0.27 };

export async function buildApartment(ctx) {
  const { scene, audio, hud, interaction } = ctx;
  const M = makeMaterials();

  const root = group('apartment');
  scene.add(root);

  const colliders = [];
  const floorZones = [];
  const ticks = [];        // per-frame updaters
  const addCollider = (b) => colliders.push(collider(b[0], b[1]));

  /* ================================================================ */
  /* Shell                                                             */
  /* ================================================================ */

  const { x0, x1, z0, z1, h, wall } = ROOM;

  const floor = boxFrom(x0, -0.1, z0, x1, 0, z1, M.floor, { cast: false });
  root.add(floor);
  const ceiling = boxFrom(x0, h, z0, x1, h + 0.1, z1, M.ceiling, { cast: false });
  root.add(ceiling);

  // Walls, with openings left for the two doors and the window.
  // North wall (z0): bathroom door at x -1.9..-0.9, otherwise solid.
  addWallRun(root, M, 'north', [[x0, -1.90], [-0.90, x1]], z0, wall, h);
  addDoorHeader(root, M, 'north', -1.90, -0.90, z0, wall, h, 2.05);

  // South wall (z1): front door at x 2.30..3.30.
  addWallRun(root, M, 'south', [[x0, 2.30], [3.30, x1]], z1, wall, h);
  addDoorHeader(root, M, 'south', 2.30, 3.30, z1, wall, h, 2.05);

  // West wall: solid.
  addWallRunSide(root, M, 'west', [[z0, z1]], x0, wall, h);

  // East wall: window opening at z -3.90..-2.30, y 0.95..2.15.
  addWallRunSide(root, M, 'east', [[z0, -3.90], [-2.30, z1]], x1, wall, h);
  root.add(boxFrom(x1, 0, -3.90, x1 + wall, 0.95, -2.30, M.wall, { cast: false }));       // sill wall
  root.add(boxFrom(x1, 2.15, -3.90, x1 + wall, h, -2.30, M.wall, { cast: false }));       // header

  // Skirting board all the way round.
  const skirt = M.trim;
  root.add(boxFrom(x0, 0, z0, x1, 0.09, z0 + 0.02, skirt, { cast: false }));
  root.add(boxFrom(x0, 0, z1 - 0.02, x1, 0.09, z1, skirt, { cast: false }));
  root.add(boxFrom(x0, 0, z0, x0 + 0.02, 0.09, z1, skirt, { cast: false }));
  root.add(boxFrom(x1 - 0.02, 0, z0, x1, 0.09, z1, skirt, { cast: false }));

  // Room colliders (walls). Made tall so the player can never leave.
  addCollider([[x0 - 0.5, 0, z0 - 0.5], [x1 + 0.5, h, z0]]);
  addCollider([[x0 - 0.5, 0, z1], [x1 + 0.5, h, z1 + 0.5]]);
  addCollider([[x0 - 0.5, 0, z0 - 0.5], [x0, h, z1 + 0.5]]);
  addCollider([[x1, 0, z0 - 0.5], [x1 + 0.5, h, z1 + 0.5]]);

  /* ---- rug + floor surfaces ---- */
  const rug = boxFrom(-4.90, 0.001, -0.60, -2.30, 0.014, 2.00, M.rug, { cast: false });
  root.add(rug);
  floorZones.push({ box: new THREE.Box3(new THREE.Vector3(-4.90, 0, -0.60), new THREE.Vector3(-2.30, 1, 2.00)), surface: 'rug' });
  // Kitchen vinyl.
  const vinyl = boxFrom(3.60, 0.001, -2.30, x1, 0.008, 2.70, M.splash, { cast: false });
  root.add(vinyl);
  floorZones.push({ box: new THREE.Box3(new THREE.Vector3(3.60, 0, -2.30), new THREE.Vector3(x1, 1, 2.70)), surface: 'tile' });

  /* ---- kitchen splashback ---- */
  const splash = plane(4.0, 0.56, M.splash);
  splash.position.set(x1 - 0.005, 1.20, -0.20);
  splash.rotation.y = -Math.PI / 2;
  root.add(splash);

  /* ================================================================ */
  /* Window + the world outside                                        */
  /* ================================================================ */

  const win = group('window');
  const wz0 = -3.90, wz1 = -2.30, wy0 = 0.95, wy1 = 2.15;
  // Reveal + frame.
  win.add(boxFrom(x1, wy0 - 0.06, wz0 - 0.05, x1 + 0.05, wy0, wz1 + 0.05, M.trim, { cast: false }));
  for (const [a, b] of [[wz0 - 0.05, wz0 + 0.03], [wz1 - 0.03, wz1 + 0.05]]) {
    win.add(boxFrom(x1 - 0.02, wy0, a, x1 + 0.05, wy1, b, M.trim, { cast: false }));
  }
  win.add(boxFrom(x1 - 0.02, wy1 - 0.05, wz0 - 0.05, x1 + 0.05, wy1, wz1 + 0.05, M.trim, { cast: false }));
  // Centre mullion.
  win.add(boxFrom(x1 - 0.01, wy0, (wz0 + wz1) / 2 - 0.02, x1 + 0.03, wy1, (wz0 + wz1) / 2 + 0.02, M.trim, { cast: false }));
  // Glass.
  const glass = plane(wz1 - wz0, wy1 - wy0, M.windowGlass);
  glass.position.set(x1 + 0.01, (wy0 + wy1) / 2, (wz0 + wz1) / 2);
  glass.rotation.y = -Math.PI / 2;
  win.add(glass);
  // Backdrop, set back so it parallaxes a little as the player moves.
  const sky = plane(9, 4.6, M.sky);
  sky.position.set(x1 + 2.6, 1.9, (wz0 + wz1) / 2);
  sky.rotation.y = -Math.PI / 2;
  win.add(sky);
  root.add(win);

  // Venetian blinds: a stack of slats that rolls up.
  const blinds = new THREE.Group();
  blinds.position.set(x1 - 0.06, wy1 - 0.02, (wz0 + wz1) / 2);
  const slatMat = mat({ color: 0xd6cdb8, roughness: 0.9, side: THREE.DoubleSide });
  const slats = [];
  const SLAT_N = 22;
  const SLAT_GAP = 0.053;
  for (let i = 0; i < SLAT_N; i++) {
    const s = box({ size: [0.055, 0.008, wz1 - wz0 - 0.06], pos: [0, -0.02 - i * SLAT_GAP, 0], mat: slatMat });
    blinds.add(s);
    slats.push(s);
  }
  root.add(blinds);
  let blindsOpen = false;   // "open" = rolled up
  let blindsT = 0;

  /* ================================================================ */
  /* Doors                                                             */
  /* ================================================================ */

  const frontDoor = makeDoor(M, { x: 2.80, z: z1 - 0.02, w: 1.0, rotY: Math.PI });
  root.add(frontDoor.group);
  const bathDoor = makeDoor(M, { x: -1.40, z: z0 + 0.02, w: 1.0, rotY: 0 });
  root.add(bathDoor.group);

  /* ================================================================ */
  /* Furniture                                                         */
  /* ================================================================ */

  const bed = P.makeBed(M, { x: -4.15, z: -3.40 });
  root.add(bed.group);
  addCollider(bed.bounds);

  const nightstand = P.makeNightstand(M, { x: -3.15, z: -4.12 });
  root.add(nightstand.group);
  addCollider(nightstand.bounds);

  const clock = P.makeAlarmClock(M, { x: -3.15, y: nightstand.top, z: -4.12, rotY: 2.4 });
  root.add(clock.group);
  // A glass of water, mostly gone.
  root.add(cylinder({ r: 0.035, h: 0.11, pos: [-3.30, nightstand.top + 0.055, -3.98], mat: M.glass }));

  const desk = P.makeDesk(M, { x: 1.90, z: -4.07 });
  root.add(desk.group);
  addCollider(desk.bounds);

  const chair = P.makeChair(M, { x: 1.68, z: -3.22, rotY: 0.12 });
  root.add(chair.group);

  const bobble = P.makeBobblehead(M, { x: 2.86, y: desk.top, z: -4.24, rotY: -0.5 });
  root.add(bobble.group);
  // Invisible proxy so a 4cm mascot is still comfortable to look at and poke.
  const bobbleHit = box({
    size: [0.20, 0.24, 0.20], pos: [2.86, desk.top + 0.10, -4.24],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(bobbleHit);
  // Desk clutter: a can and a notepad.
  const deskCan = P.makeBeerCan(M, { x: 2.62, y: desk.top, z: -3.86, rotY: 0.6 });
  root.add(deskCan.group);
  root.add(box({ size: [0.16, 0.006, 0.22], pos: [0.95, desk.top + 0.003, -3.86], mat: M.paper, rotY: -0.2 }));

  const fridge = P.makeFridge(M, { x: 4.64, z: 1.95 });
  root.add(fridge.group);
  addCollider(fridge.bounds);

  const kitchen = P.makeKitchen(M, { z0: -1.90, z1: 1.45, wallX: x1 });
  root.add(kitchen.group);
  addCollider(kitchen.bounds);

  // Smokes and an ashtray on the countertop, clear of the sink and the hob.
  const cigsPos = new THREE.Vector3(4.62, kitchen.top, 1.16);
  const cigs = P.makeCigarettePack(M, { x: cigsPos.x, y: cigsPos.y, z: cigsPos.z, rotY: -0.55 });
  root.add(cigs.group);
  // A 4cm pack is a fiddly thing to aim at; give it a proxy like the bobblehead.
  const cigsHit = box({
    size: [0.22, 0.20, 0.20], pos: [cigsPos.x + 0.02, cigsPos.y + 0.08, cigsPos.z],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(cigsHit);

  const ashtray = P.makeAshtray(M, { x: 4.60, y: kitchen.top, z: 0.86, rotY: 0.4 });
  root.add(ashtray.group);

  // Bottle of whiskey. Hits about twice as hard as a beer.
  const whiskeyPos = new THREE.Vector3(4.62, kitchen.top, 0.42);
  const whiskey = P.makeWhiskeyBottle(M, { x: whiskeyPos.x, y: whiskeyPos.y, z: whiskeyPos.z, rotY: -0.35 });
  root.add(whiskey.group);
  const whiskeyHit = box({
    size: [0.22, 0.34, 0.22], pos: [whiskeyPos.x, whiskeyPos.y + 0.15, whiskeyPos.z],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(whiskeyHit);
  root.add(P.makeShotGlass(M, { x: 4.52, y: kitchen.top, z: 0.18 }).group);

  const couch = P.makeCouch(M, { x: -4.55, z: 0.70 });
  root.add(couch.group);
  addCollider(couch.bounds);

  const table = P.makeCoffeeTable(M, { x: -3.30, z: 0.70 });
  root.add(table.group);
  addCollider(table.bounds);

  const pizza = P.makePizzaBox(M, { x: -3.34, y: table.top, z: 0.62, rotY: 0.3 });
  root.add(pizza.group);
  root.add(P.makeBeerCan(M, { x: -3.02, y: table.top, z: 0.92, crushed: true, rotY: 1.1 }).group);
  root.add(P.makeBeerCan(M, { x: -3.62, y: table.top, z: 0.88, crushed: true, rotY: -0.4 }).group);

  const sideboard = P.makeSideboard(M, { x: -1.00, z: 4.22 });
  root.add(sideboard.group);
  addCollider(sideboard.bounds);

  const radio = P.makeRadio(M, { x: -1.10, y: sideboard.top, z: 4.16, rotY: Math.PI });
  root.add(radio.group);

  const plant = P.makePlant(M, { x: 3.95, z: 3.75 });
  root.add(plant.group);
  addCollider(plant.bounds);

  const lamp = P.makeFloorLamp(M, { x: -4.60, z: -1.30 });
  root.add(lamp.group);
  addCollider(lamp.bounds);

  const ceilLight = P.makeCeilingLight(M, { x: -0.40, z: 0.20 });
  root.add(ceilLight.group);

  const shelf = P.makeShelf(M, { x: -2.70, y: 1.46, z: -4.34 });
  root.add(shelf.group);
  const books = P.makeBooks(M, { x: -3.14, y: 1.478, z: -4.34, count: 9 });
  root.add(books.group);
  root.add(P.makeBeerCan(M, { x: -2.30, y: 1.478, z: -4.34, crushed: true }).group);

  const cork = P.makeCorkboard(M, { x: -0.10, y: 1.58, z: -4.40, rotY: 0 });
  root.add(cork.group);

  const wallClock = P.makeWallClock(M, { x: -1.00, y: 1.95, z: 4.40, rotY: Math.PI });
  root.add(wallClock.group);

  root.add(P.makeBoots(M, { x: 2.20, z: 3.90, rotY: 0.4 }).group);
  root.add(P.makeLaundry(M, { x: -2.55, z: -3.55 }).group);
  root.add(P.makeCapOnPeg(M, { x: 0.10, y: 1.78, z: 4.42, rotY: Math.PI }).group);

  const sign = P.makeCrossingSign(M, { x: 4.42, z: 4.05, rotY: -0.7 });
  root.add(sign.group);
  addCollider(sign.bounds);

  /* ---- light switch by the front door ---- */
  const switchPlate = group('switchplate');
  switchPlate.position.set(1.95, 1.18, z1 - 0.01);
  switchPlate.add(box({ size: [0.09, 0.13, 0.012], pos: [0, 0, 0], mat: M.trim }));
  const toggle = box({ size: [0.03, 0.05, 0.016], pos: [0, 0.01, -0.012], mat: M.trim });
  switchPlate.rotation.y = Math.PI;
  switchPlate.add(toggle);
  root.add(switchPlate);

  /* ================================================================ */
  /* Wall art                                                          */
  /* ================================================================ */

  const slotNames = [
    ...WALL_SLOTS.map((s) => s.slot),
    BANNER_SLOT.slot,
    CREST_SLOT.slot,
    ...STANDING_SLOTS.map((s) => s.slot),
    FRIDGE_MAGNET.slot,
  ];
  const gear = await resolveGear(slotNames);
  const frames = [];

  for (const slot of WALL_SLOTS) {
    const g = gear.get(slot.slot);
    const height = slot.h * (g.scale || 1);
    const width = height * (g.aspect || 0.8);
    const f = P.makeFrame(M, {
      x: slot.x, y: slot.y, z: slot.z, rotY: slot.rotY,
      w: width, h: height, texture: g.texture,
    });
    root.add(f.group);
    frames.push({ ...slot, mesh: f.group, info: g });
  }

  const bannerGear = gear.get(BANNER_SLOT.slot);
  const bannerH = BANNER_SLOT.h * (bannerGear.scale || 1);
  const banner = P.makeBanner(M, {
    x: BANNER_SLOT.x, y: BANNER_SLOT.y, z: BANNER_SLOT.z, rotY: BANNER_SLOT.rotY,
    w: bannerH * (bannerGear.aspect || 0.8), h: bannerH, texture: bannerGear.texture,
  });
  root.add(banner.group);

  // Round crest above the bookshelf.
  const crestGear = gear.get(CREST_SLOT.slot);
  const crest = P.makeRoundCrest(M, {
    x: CREST_SLOT.x, y: CREST_SLOT.y, z: CREST_SLOT.z, rotY: CREST_SLOT.rotY,
    r: CREST_SLOT.r * (crestGear.scale || 1), texture: crestGear.texture,
  });
  root.add(crest.group);
  frames.push({ ...CREST_SLOT, mesh: crest.group, info: crestGear });

  // Framed photos standing on the sideboard and the desk.
  for (const slot of STANDING_SLOTS) {
    const g = gear.get(slot.slot);
    const height = slot.h * (g.scale || 1);
    const sf = P.makeStandingFrame(M, {
      x: slot.x, y: slot.y, z: slot.z, rotY: slot.rotY,
      w: height * (g.aspect || 0.8), h: height, texture: g.texture,
    });
    root.add(sf.group);
    frames.push({ ...slot, mesh: sf.group, info: g });
  }

  // Sticker on the fridge door, parented so it swings with it.
  const magnetGear = gear.get(FRIDGE_MAGNET.slot);
  const magnetW = FRIDGE_MAGNET.w * (magnetGear.scale || 1);
  const magnet = P.makeDecal(M, {
    texture: magnetGear.texture,
    w: magnetW,
    h: magnetW / (magnetGear.aspect || 1),
    magnet: true,
  });
  magnet.group.position.set(-0.034, 0.86, -0.36);
  magnet.group.rotation.set(0, -Math.PI / 2, 0.06);
  fridge.door.add(magnet.group);
  frames.push({ slot: FRIDGE_MAGNET.slot, mesh: magnet.group, info: magnetGear });

  /* ================================================================ */
  /* Lighting                                                          */
  /* ================================================================ */

  scene.add(new THREE.HemisphereLight(0x6d7d9e, 0x352a20, 0.85));
  const ambient = new THREE.AmbientLight(0x8d94a8, 0.45);
  scene.add(ambient);

  // Dawn through the east window.
  const sun = new THREE.DirectionalLight(0xffc49a, 1.35);
  sun.position.set(11.5, 4.2, -3.1);
  sun.target.position.set(-1.0, 0.6, -1.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 24;
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 5;
  sun.shadow.camera.bottom = -3;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.022;
  scene.add(sun, sun.target);

  // Cool fill bouncing off the far wall so shadows are not pitch black.
  const fill = new THREE.DirectionalLight(0x8fa6cf, 0.55);
  fill.position.set(-6, 3.5, 4);
  scene.add(fill);

  // Ceiling fixture.
  const ceilSpot = new THREE.SpotLight(0xffe0b0, 0, 7.5, 1.24, 0.62, 1.4);
  ceilSpot.position.copy(ceilLight.pos);
  ceilSpot.target.position.set(ceilLight.pos.x, 0, ceilLight.pos.z);
  ceilSpot.castShadow = false;   // enabled with the switch; see the tick below
  ceilSpot.shadow.mapSize.set(1024, 1024);
  ceilSpot.shadow.bias = -0.0018;
  ceilSpot.shadow.normalBias = 0.02;
  scene.add(ceilSpot, ceilSpot.target);

  const lampLight = new THREE.PointLight(0xffcf90, 0, 5.2, 1.9);
  lampLight.position.copy(lamp.pos);
  scene.add(lampLight);

  // Monitor glow, driven by whatever is on screen.
  const screenGlow = new THREE.PointLight(0x88b8ff, 0, 3.4, 2.0);
  screenGlow.position.set(desk.monitorPos.x, desk.monitorPos.y, desk.monitorPos.z + 0.35);
  scene.add(screenGlow);

  const towerGlow = new THREE.PointLight(0x4aa8ff, 0, 1.5, 2.2);
  towerGlow.position.set(2.76, 0.30, -4.00);
  scene.add(towerGlow);

  /* ================================================================ */
  /* State                                                             */
  /* ================================================================ */

  const state = {
    fridgeOpen: false,
    fridgeT: 0,
    beersLeft: fridge.beerSlots.length,
    lightsOn: false,
    lampOn: false,
    pcOn: false,
    radioOn: false,
    blindsOpen: false,
    heldItem: null,       // 'beer' | 'empty' | 'cigs' | null
    beersDrunk: 0,
    cigsLeft: 17,
    cigsSmoked: 0,
    whiskeyLeft: 6,      // pulls remaining in the bottle
    whiskeyDrunk: 0,
  };

  /* ---- fridge ---- */
  audio.startLoop('fridge.hum', {
    volume: 0.16, position: new THREE.Vector3(4.5, 1.0, 1.95), ambience: true, ref: 1.0, maxDist: 9,
  });

  const setFridge = (open) => {
    if (state.fridgeOpen === open) return;
    state.fridgeOpen = open;
    audio.play(open ? 'fridge.open' : 'fridge.close', {
      position: new THREE.Vector3(4.3, 1.0, 1.6), volume: 0.9,
    });
    if (open) audio.play('fridge.bottles', { position: new THREE.Vector3(4.5, 0.8, 1.9), volume: 0.5, delay: 0.25 });
    hud.say(open
      ? 'Cold air. Six beers, half a lime, and something you should throw out.'
      : '', open ? 3600 : 1);
  };

  interaction.register(fridge.doorPivot, {
    label: () => (state.fridgeOpen ? 'Close the <b>fridge</b>' : 'Open the <b>fridge</b>'),
    onUse: () => setFridge(!state.fridgeOpen),
  });

  // Each beer in the door is grabbable while the door is open.
  fridge.beerSlots.forEach((can, i) => {
    interaction.register(can, {
      label: () => 'Take a <b>beer</b>',
      enabled: () => state.fridgeOpen && can.visible && !state.heldItem,
      onUse: () => {
        can.visible = false;
        state.beersLeft--;
        state.heldItem = 'beer';
        hud.setHand({ icon: '🍺', name: 'Cold beer', hint: 'Hold [F] to drink' });
        audio.play('can.set', { volume: 0.5 });
        hud.toast('Picked up a beer', 'good');
        void i;
      },
    });
  });

  /* ---- cigarettes ---- */
  interaction.register(cigsHit, {
    label: () => (state.cigsLeft > 0
      ? `Take the <b>smokes</b> <span style="opacity:.6">(${state.cigsLeft})</span>`
      : 'An empty <b>pack</b>'),
    enabled: () => !state.heldItem && cigs.group.visible,
    onUse: () => {
      if (state.cigsLeft <= 0) {
        hud.say('Empty. You knew it was empty.');
        return;
      }
      cigs.group.visible = false;
      state.heldItem = 'cigs';
      hud.setHand({ icon: '🚬', name: `Smokes (${state.cigsLeft})`, hint: 'Hold [F] to light one' });
      audio.play('cig.pack', { position: cigsPos, volume: 0.7 });
      hud.toast('Picked up the smokes', 'good');
    },
  });

  interaction.register(ashtray.group, {
    label: () => 'The <b>ashtray</b>',
    onUse: () => {
      audio.play('frame.adjust', { volume: 0.3 });
      hud.say(state.cigsSmoked > 2
        ? 'Filling up nicely. You are having a morning.'
        : 'Three dead ones and a lot of ash.');
    },
  });

  /* ---- whiskey ---- */
  interaction.register(whiskeyHit, {
    label: () => (state.whiskeyLeft > 0
      ? 'Pick up the <b>whiskey</b>'
      : 'An empty <b>bottle</b>'),
    enabled: () => !state.heldItem && whiskey.group.visible,
    onUse: () => {
      if (state.whiskeyLeft <= 0) {
        hud.say('Dead soldier. You did that.');
        return;
      }
      whiskey.group.visible = false;
      state.heldItem = 'whiskey';
      hud.setHand({ icon: '🥃', name: "Jack & Daniel's", hint: 'Hold [F] to take a pull' });
      audio.play('whiskey.cap', { position: whiskeyPos, volume: 0.7 });
      hud.toast('Picked up the whiskey');
      hud.say('Old No. 7½. Sour mash. A questionable decision, at this hour.');
    },
  });

  /* ---- radio ---- */
  const radioPos = new THREE.Vector3(-1.10, sideboard.top + 0.12, 4.16);
  interaction.register(radio.group, {
    label: () => (state.radioOn
      ? 'Turn off the <b>radio</b> &nbsp;<span style="opacity:.6">[R] next track</span>'
      : 'Turn on the <b>radio</b>'),
    onUse: () => ctx.onRadioToggle?.(),
  });

  /* ---- lights ---- */
  const setCeiling = (on) => {
    state.lightsOn = on;
    ceilLight.bulb.material = on ? M.bulbOn : M.bulbOff;
    audio.play('switch.click', { position: new THREE.Vector3(1.95, 1.18, 4.4), volume: 0.7 });
  };
  interaction.register(switchPlate, {
    label: () => (state.lightsOn ? 'Lights <b>off</b>' : 'Lights <b>on</b>'),
    onUse: () => setCeiling(!state.lightsOn),
  });

  const setLamp = (on) => {
    state.lampOn = on;
    lamp.bulb.material = on ? M.bulbOn : M.bulbOff;
    audio.play('switch.click', { position: lamp.pos, volume: 0.6 });
  };
  interaction.register(lamp.group, {
    label: () => (state.lampOn ? 'Switch off the <b>lamp</b>' : 'Switch on the <b>lamp</b>'),
    onUse: () => setLamp(!state.lampOn),
  });

  /* ---- blinds ---- */
  interaction.register(blinds, {
    label: () => (state.blindsOpen ? 'Lower the <b>blinds</b>' : 'Raise the <b>blinds</b>'),
    onUse: () => {
      state.blindsOpen = !state.blindsOpen;
      blindsOpen = state.blindsOpen;
      audio.play('window.blinds', { position: new THREE.Vector3(4.8, 1.7, -3.1), volume: 0.8 });
      hud.say(state.blindsOpen
        ? 'Sunrise, whether you asked for it or not.'
        : 'Better. Gaming light.');
    },
  });

  /* ---- PC ---- */
  interaction.register(desk.panel, {
    label: () => (state.pcOn ? 'Sit down and <b>play</b>' : 'Sit down at the <b>PC</b>'),
    onUse: () => ctx.onSitPC?.(),
  });
  interaction.register(chair.group, {
    label: () => 'Sit down at the <b>PC</b>',
    onUse: () => ctx.onSitPC?.(),
  });

  /* ---- flavour interactions ---- */
  interaction.register(frontDoor.group, {
    label: () => 'Leave the <b>apartment</b>',
    onUse: () => {
      audio.play('door.locked', { position: new THREE.Vector3(2.8, 1.1, 4.3), volume: 0.8 });
      hud.say('Outside is a whole thing. There is a fridge and a PC in here.');
    },
  });
  interaction.register(bathDoor.group, {
    label: () => 'Open the <b>bathroom</b>',
    onUse: () => {
      audio.play('door.knob', { position: new THREE.Vector3(-1.4, 1.1, -4.3), volume: 0.7 });
      hud.say('You have seen it. It is fine. The light buzzes.');
    },
  });
  interaction.register(cork.group, {
    label: () => 'Read the <b>evidence board</b>',
    onUse: () => {
      audio.play('frame.adjust', { volume: 0.5 });
      hud.say('Nine pins, five sightings, one very confident length of red string.');
    },
  });
  interaction.register(bobbleHit, {
    label: () => 'Boop the <b>bobblehead</b>',
    onUse: () => {
      bobbleVel += 7;
      audio.play('ui.select', { volume: 0.4 });
    },
  });
  interaction.register(pizza.group, {
    label: () => 'Inspect the <b>pizza</b>',
    onUse: () => hud.say('One slice left. It has gone the colour of the box.'),
  });
  interaction.register(bed.group, {
    label: () => 'Go back to <b>sleep</b>',
    onUse: () => {
      audio.play('bed.rustle', { position: new THREE.Vector3(-4.15, 0.7, -3.4), volume: 0.7 });
      hud.say(state.beersDrunk > 0
        ? 'Tempting. But the PC is right there and the beer is already open.'
        : 'You just got up. Give it an hour.');
    },
  });

  for (const f of frames) {
    interaction.register(f.mesh, {
      label: () => `Look at <b>${f.info.title}</b>`,
      onUse: () => {
        audio.play('frame.adjust', { volume: 0.4 });
        hud.say(f.info.caption
          ? `<em>${f.info.title}.</em> ${f.info.caption}`
          : `<em>${f.info.title}.</em>`);
      },
    });
  }

  interaction.register(banner.group, {
    label: () => `Look at <b>${bannerGear.title}</b>`,
    onUse: () => {
      audio.play('frame.adjust', { volume: 0.4 });
      hud.say(`<em>${bannerGear.title}.</em> ${bannerGear.caption}`);
    },
  });

  /* ================================================================ */
  /* Animation                                                         */
  /* ================================================================ */

  let bobblePhase = 0;
  let bobbleVel = 0;
  let clockAcc = 0;
  let tickAcc = 0;
  let seconds = 0;
  let minutes = 6 * 60 + 4;

  ticks.push((dt, elapsed) => {
    /* fridge door swing */
    const target = state.fridgeOpen ? 1 : 0;
    state.fridgeT += (target - state.fridgeT) * Math.min(1, dt * 6);
    fridge.doorPivot.rotation.y = state.fridgeT * 2.0;
    fridge.light.intensity = state.fridgeT * 0.85;

    /* blinds roll */
    blindsT += ((blindsOpen ? 1 : 0) - blindsT) * Math.min(1, dt * 3.5);
    for (let i = 0; i < slats.length; i++) {
      const rest = -0.02 - i * SLAT_GAP;
      const stacked = -0.02 - i * 0.006;
      slats[i].position.y = rest + (stacked - rest) * blindsT;
      // Shut: slats stand on edge and overlap. Open: flat, stacked at the top.
      slats[i].rotation.z = (1 - blindsT) * 1.35;
    }
    // Sun only really gets in once the blinds are up.
    sun.intensity = 0.55 + blindsT * 1.35;

    /* lights */
    ceilSpot.intensity += ((state.lightsOn ? 9.5 : 0) - ceilSpot.intensity) * Math.min(1, dt * 8);
    ceilSpot.castShadow = ceilSpot.intensity > 0.05;
    lampLight.intensity += ((state.lampOn ? 4.2 : 0) - lampLight.intensity) * Math.min(1, dt * 8);
    towerGlow.intensity = state.pcOn ? 0.7 + Math.sin(elapsed * 1.7) * 0.12 : 0;
    for (const strip of desk.rgb) {
      strip.material.emissiveIntensity = state.pcOn ? 1.6 + Math.sin(elapsed * 2.1) * 0.4 : 0;
    }
    desk.powerLed.material = state.pcOn ? M.ledGreen : M.bulbOff;

    /* bobblehead */
    bobbleVel += -bobblePhase * 42 * dt;
    bobbleVel *= 1 - Math.min(1, dt * 2.6);
    bobblePhase += bobbleVel * dt;
    bobble.head.rotation.z = bobblePhase * 0.09;
    bobble.head.position.y = 0.098 - Math.abs(bobblePhase) * 0.002;

    /* radio dial shimmer */
    if (state.radioOn) {
      radio.needle.position.x = Math.sin(elapsed * 0.6) * 0.052;
      radio.led.material = M.ledRed;
    } else {
      radio.led.material = M.bulbOff;
    }

    /* clocks */
    clockAcc += dt;
    if (clockAcc > 4) {
      clockAcc = 0;
      minutes = (minutes + 1) % (24 * 60);
      const hh = Math.floor(minutes / 60) % 12 || 12;
      const mm = String(minutes % 60).padStart(2, '0');
      clock.draw(`${hh}:${mm}`);
      // The hour hand creeps between numerals rather than jumping on the hour.
      wallClock.hourHand.rotation.z = -((minutes % 720) / 720) * Math.PI * 2;
      wallClock.minHand.rotation.z = -((minutes % 60) / 60) * Math.PI * 2;
    }
    tickAcc += dt;
    if (tickAcc > 1) {
      tickAcc = 0;
      seconds = (seconds + 1) % 60;
      wallClock.secHand.rotation.z = -(seconds / 60) * Math.PI * 2;
      audio.play('clock.tick', { position: new THREE.Vector3(-1.0, 1.95, 4.3), volume: 0.25 });
    }
  });

  /* ================================================================ */
  /* Public surface                                                    */
  /* ================================================================ */

  const bedPose = {
    position: new THREE.Vector3(-4.15, 0.86, -3.35),
    yaw: Math.PI,
  };
  const bedExit = new THREE.Vector3(-3.05, 0, -3.05);

  const deskPose = {
    position: new THREE.Vector3(1.68, 1.24, -3.34),
    yaw: 0,
    pitch: -0.04,
  };
  const deskExit = new THREE.Vector3(1.05, 0, -2.85);

  return {
    root,
    materials: M,
    colliders,
    floorZones,
    state,
    frames,

    bedPose,
    bedExit,
    bedLookYaw: yawToward(bedExit, new THREE.Vector3(2.0, 0, -1.0)),
    deskPose,
    deskExit,

    screen: desk.screen,
    screenGlow,
    radioPos,
    radioNeedle: radio.needle,
    chair: chair.group,
    fridgePos: new THREE.Vector3(4.4, 1.1, 1.95),

    setFridge,
    setCeiling,
    setLamp,

    setPcOn(on) {
      state.pcOn = on;
    },

    /** Drop the currently held item back onto the world. */
    consumeBeer() {
      state.beersDrunk++;
      state.heldItem = 'empty';
    },

    /** Take a pull. Returns false when the bottle is dry. */
    consumeWhiskey() {
      if (state.whiskeyLeft <= 0) return false;
      state.whiskeyLeft--;
      state.whiskeyDrunk++;
      // Drop the level in the bottle to match.
      whiskey.liquid.scale.y = Math.max(0.04, state.whiskeyLeft / 6);
      return true;
    },

    /** Put the bottle back on the counter. */
    returnWhiskey() {
      whiskey.group.visible = true;
    },

    /** Burn one from the pack. Returns false when it is empty. */
    consumeCigarette() {
      if (state.cigsLeft <= 0) return false;
      state.cigsLeft--;
      state.cigsSmoked++;
      return true;
    },

    /** Put the pack back on the counter (used when the player drops it). */
    returnCigarettes() {
      cigs.group.visible = true;
    },

    cigsPos,

    /** Push the wall clock and alarm clock forward, e.g. after passing out. */
    advanceClock(mins) {
      minutes = (minutes + mins) % (24 * 60);
      clockAcc = 99;
    },

    update(dt, elapsed) {
      for (const t of ticks) t(dt, elapsed);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Shell helpers                                                       */
/* ------------------------------------------------------------------ */

/** Build a north/south wall as a set of x-ranges, leaving gaps for doors. */
function addWallRun(root, M, side, ranges, zAt, thick, h) {
  const inner = side === 'north' ? zAt - thick : zAt;
  const outer = side === 'north' ? zAt : zAt + thick;
  for (const [a, b] of ranges) {
    root.add(boxFrom(a, 0, inner, b, h, outer, M.wall, { cast: false }));
  }
}

/** Build a west/east wall as a set of z-ranges. */
function addWallRunSide(root, M, side, ranges, xAt, thick, h) {
  const inner = side === 'west' ? xAt - thick : xAt;
  const outer = side === 'west' ? xAt : xAt + thick;
  for (const [a, b] of ranges) {
    root.add(boxFrom(inner, 0, a, outer, h, b, M.wall, { cast: false }));
  }
}

/** The bit of wall above a door opening. */
function addDoorHeader(root, M, side, a, b, zAt, thick, h, doorH) {
  const inner = side === 'north' ? zAt - thick : zAt;
  const outer = side === 'north' ? zAt : zAt + thick;
  root.add(boxFrom(a, doorH, inner, b, h, outer, M.wall, { cast: false }));
  // Casing.
  root.add(boxFrom(a - 0.05, 0, inner, a, doorH + 0.05, outer, M.trim, { cast: false }));
  root.add(boxFrom(b, 0, inner, b + 0.05, doorH + 0.05, outer, M.trim, { cast: false }));
  root.add(boxFrom(a - 0.05, doorH, inner, b + 0.05, doorH + 0.05, outer, M.trim, { cast: false }));
}

/** A closed panel door with handle. */
function makeDoor(M, { x, z, w = 1.0, rotY = 0, h = 2.02 }) {
  const g = group('door');
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const doorMat = mat({ color: 0xd9d2c2, roughness: 0.75 });
  g.add(box({ size: [w - 0.04, h, 0.045], pos: [0, h / 2, 0], mat: doorMat }));
  // Recessed panels.
  for (const py of [h * 0.28, h * 0.70]) {
    g.add(box({ size: [w - 0.28, h * 0.30, 0.012], pos: [0, py, 0.024], mat: mat({ color: 0xc6bfae, roughness: 0.8 }) }));
  }
  g.add(cylinder({ r: 0.026, h: 0.05, pos: [w / 2 - 0.14, 1.02, 0.045], rotX: Math.PI / 2, mat: M.chrome }));
  return { group: g };
}
