/**
 * The Silver Room.
 *
 * A supper club on a wet street, built the way the Bing is built: primitives,
 * procedural textures, no asset files. What is different is the shape. The
 * whole building exists to support one walk — pavement, alley, service door,
 * stair, cellar, store, walk-in, prep, kitchen, dish, corridor, coat check,
 * service bar, curtain, host station, dining room, stage — in that order,
 * continuously, with no loading screen anywhere in it.
 *
 * That constraint is why the plan loops. You go in at the east side, drop a
 * level, work south and west through the back of house, and come up into the
 * north-east corner of the dining room. The best table in the building is at
 * the far end of it, by the stage, which means the staff have to carry one
 * thirty metres across a full room in front of everybody. That is the shot.
 *
 * The cellar sits *under* the prep kitchen rather than beside it, so `roomAt`
 * takes a height as well. Rooms carrying `y1` only answer below it.
 */
import * as THREE from 'three';
import { mat, box, cylinder, sphere, collider, group } from '../world/build.js';
import { makeMaterials } from '../world/materials.js';
import {
  makeChair, makeWhiskeyBottle, makeShotGlass, makeWallClock, makeFrame, makePlant,
} from '../world/props.js';
import {
  asphalt, brick, panelling, backTile, printed, neonText, sign, tiled, rand, pick,
} from '../bing/kit.js';
import { Door } from '../bing/club.js';

export const CEIL_FLOOR = 5.2;    // the dining room
export const CEIL_BACK = 2.75;    // back of house
export const CEIL_CELLAR = 2.4;
export const DOOR_H = 2.05;
export const STAGE_H = 0.75;
export const CELLAR_Y = -2.9;

/**
 * The plan. Order matters: `roomAt` returns the first match, so the cellar
 * level is listed before the floor above it and gated on `y1`.
 */
export const ROOMS = {
  /* ---- below ---- */
  cellar:    { x0: 15, x1: 28.5, z0: -6,  z1: 8.6, y1: -0.8 },
  drystore:  { x0: 15, x1: 21,   z0: -14, z1: -6,  y1: -0.8 },
  walkin:    { x0: 21, x1: 28.5, z0: -14, z1: -6,  y1: -0.8 },

  /* ---- the way in ---- */
  street:    { x0: -40, x1: 44, z0: 34,  z1: 66 },
  alley:     { x0: 30,  x1: 38, z0: -22, z1: 34 },
  stair:     { x0: 15,  x1: 22, z0: 8,   z1: 15 },

  /* ---- back of house ---- */
  prep:      { x0: 15, x1: 24, z0: -2,  z1: 8 },
  kitchen:   { x0: 15, x1: 30, z0: -18, z1: -2 },
  dish:      { x0: 24, x1: 30, z0: -18, z1: -10 },
  corridor:  { x0: 10, x1: 15, z0: -18, z1: 26 },

  /* ---- front of house ---- */
  lobby:     { x0: -9, x1: 9,  z0: 26,  z1: 34 },
  floor:     { x0: -30, x1: 10, z0: -8, z1: 26 },
  stage:     { x0: -26, x1: -6, z0: -15, z1: -8 },
  backstage: { x0: -30, x1: -26, z0: -22, z1: -15 },
  restrooms: { x0: -6,  x1: 0,  z0: -22, z1: -15 },
  manager:   { x0: 0,   x1: 10, z0: -22, z1: -15 },
};

/**
 * Which room a point is in.
 * @param {number} y optional height; rooms with `y1` only answer below it.
 */
export function roomAt(x, z, y = 0) {
  for (const [name, r] of Object.entries(ROOMS)) {
    if (r.y1 !== undefined && y > r.y1) continue;
    if (r.y0 !== undefined && y < r.y0) continue;
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return name;
  }
  return 'outside';
}

/** The five audio zones, and which rooms belong to each. */
export const ZONES = {
  exterior: ['street', 'alley'],
  cellar: ['stair', 'cellar', 'drystore', 'walkin'],
  kitchen: ['prep', 'kitchen', 'dish'],
  corridor: ['corridor'],
  club: ['lobby', 'floor', 'stage', 'backstage', 'restrooms', 'manager'],
};

export function zoneAt(room) {
  for (const [zone, rooms] of Object.entries(ZONES)) {
    if (rooms.includes(room)) return zone;
  }
  return 'exterior';
}

/**
 * The route, as a polyline. Not pathfinding — an authored spline that the
 * companion walks and the game measures progress along, because there is no
 * navmesh in this engine and a working kitchen is the worst possible place to
 * find that out.
 */
export const ROUTE = [
  { x: 6,   z: 40,  room: 'street' },
  { x: 20,  z: 38,  room: 'street' },
  { x: 34,  z: 30,  room: 'alley' },
  { x: 34,  z: 16,  room: 'alley' },
  { x: 31,  z: 12,  room: 'alley' },
  { x: 24,  z: 12,  room: 'stair' },
  { x: 19,  z: 11.5, room: 'stair' },
  { x: 15.8, z: 11,  room: 'stair', y: CELLAR_Y },
  { x: 16.4, z: 5,   room: 'cellar', y: CELLAR_Y },
  { x: 21,  z: 1,   room: 'cellar', y: CELLAR_Y },
  { x: 25,  z: -4,  room: 'cellar', y: CELLAR_Y },
  { x: 24,  z: -8,  room: 'walkin', y: CELLAR_Y },
  { x: 19,  z: -10, room: 'drystore', y: CELLAR_Y },
  { x: 16.4, z: -3, room: 'cellar', y: CELLAR_Y },
  { x: 16.4, z: 1,  room: 'cellar', y: CELLAR_Y },
  { x: 19.5, z: 1,  room: 'prep' },
  { x: 19,  z: -2,  room: 'prep' },
  { x: 20,  z: -8,  room: 'kitchen' },
  { x: 25,  z: -13, room: 'dish' },
  { x: 19,  z: -16, room: 'kitchen' },
  { x: 13,  z: -14, room: 'corridor' },
  { x: 12.5, z: -4, room: 'corridor' },
  { x: 12.5, z: 10, room: 'corridor' },
  { x: 12.5, z: 20, room: 'corridor' },
  { x: 11,  z: 24,  room: 'corridor' },
  { x: 6,   z: 24,  room: 'floor' },
  { x: 0.5, z: 23,  room: 'floor' },
];

/* ------------------------------------------------------------------ */

export function buildRoom(scene, { renderer } = {}) {
  const M = makeMaterials();

  const root = new THREE.Group();
  scene.add(root);

  const colliders = [];
  const floorZones = [];
  const platforms = [];   // raised or lowered floors: { box, y }
  const doors = {};
  const anchors = {};
  const neon = [];
  const ticking = [];
  /* The two ramps, declared up here because the stair builds the one going
   * down and the prep kitchen builds the one coming back up, and `groundAt`
   * needs both. */
  const ramps = [];
  const lamps = [];       // table lamps: stay on when the house lights go down
  const houseLights = []; // the ones that dim
  const stageLights = [];

  const M_BRICK = mat({ map: tiled(brick('#3d2420'), 8, 2), roughness: 0.96 });
  const M_BRICK_IN = mat({ map: tiled(brick('#4a3a34'), 4, 1.6), roughness: 0.97 });
  const M_PANEL = mat({ map: tiled(panelling('#3a2418'), 8, 1), roughness: 0.88 });
  const M_WAINSCOT = mat({ map: tiled(panelling('#2e1c12'), 6, 1), roughness: 0.86 });
  const M_TILE = mat({ map: tiled(backTile(), 8, 3), roughness: 0.42 });
  const M_DARKWOOD = mat({ color: 0x2a1a12, roughness: 0.7 });
  const M_WOOD = mat({ color: 0x412a1c, roughness: 0.78 });
  const M_BURGUNDY = mat({ color: 0x5a1420, roughness: 0.66 });
  const M_BURGUNDY_D = mat({ color: 0x3e0d17, roughness: 0.64 });
  const M_CLOTH = mat({ color: 0xece7dc, roughness: 0.94 });
  const M_BRASS = mat({ color: 0xb08d3a, roughness: 0.28, metalness: 0.88 });
  const M_STEEL = mat({ color: 0x77808c, roughness: 0.4, metalness: 0.72 });
  const M_STEEL_D = mat({ color: 0x4a525c, roughness: 0.55, metalness: 0.6 });
  const M_CONCRETE = mat({ color: 0x33333a, roughness: 0.97 });
  const M_CONCRETE_L = mat({ color: 0x45454e, roughness: 0.96 });
  const M_CARPET = mat({ color: 0x3a0f18, roughness: 1 });
  const M_GLASS = mat({ color: 0x9fb4cc, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.26 });
  const M_VELVET = mat({ color: 0x4a0d18, roughness: 1 });
  const M_ASPHALT = mat({ map: tiled(asphalt(), 10, 6), roughness: 0.98 });

  /**
   * An actual lamp.
   *
   * `power` is in "ordinary fitting" units where 1 is a table lamp, because
   * every light in here is dimmed by multiplying against its own base and that
   * arithmetic wants to be readable. Three.js wants inverse-square watts, so
   * the conversion happens once, here, rather than in twenty call sites.
   *
   * (kit.js exports `lit`, which sounds like this and is not: it makes an
   * emissive *material* for the glowing panel a lamp is usually inside.)
   */
  const LUMENS = 13;
  function pointLight(colour, power, distance = 10) {
    const l = new THREE.PointLight(colour, power * LUMENS, distance, 2);
    /* Stashed on the light, because the dimmer reads it back every frame and
     * reading back the *unconverted* number is exactly what went wrong: it
     * reset every fitting in the building to a thirteenth of its brightness on
     * the first frame, and the first render of the dining room was a black
     * rectangle with two hundred people in it. */
    l.userData.base = power * LUMENS;
    return l;
  }

  function add(...objs) {
    let first = null;
    for (const o of objs) {
      if (!o) continue;
      const obj = o.isObject3D ? o : o.group;
      if (!obj) continue;
      root.add(obj);
      first ??= obj;
    }
    return first;
  }

  function solid(minX, minZ, maxX, maxZ, minY = 0, maxY = 3) {
    const b = collider([minX, minY, minZ], [maxX, maxY, maxZ]);
    colliders.push(b);
    return b;
  }

  function floor(r, material, surface, y = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    add(m);
    floorZones.push({
      box: new THREE.Box3(new THREE.Vector3(r.x0, y - 1, r.z0), new THREE.Vector3(r.x1, y + 1, r.z1)),
      surface,
    });
    if (y !== 0) {
      platforms.push({
        box: new THREE.Box3(new THREE.Vector3(r.x0, y, r.z0), new THREE.Vector3(r.x1, y, r.z1)),
        y,
      });
    }
    return m;
  }

  function ceiling(r, material, y) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), material);
    m.rotation.x = Math.PI / 2;
    m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    add(m);
    return m;
  }

  function wall(x0, z0, x1, z1, h, material, t = 0.2, y0 = 0) {
    const w = Math.max(Math.abs(x1 - x0), t);
    const d = Math.max(Math.abs(z1 - z0), t);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    add(box({ size: [w, h, d], pos: [cx, y0 + h / 2, cz], mat: material }));
    solid(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y0, y0 + h);
  }

  /** Wall with a doorway punched through it. */
  function wallGap(axis, fixed, from, to, gapFrom, gapTo, h, material, t = 0.2, y0 = 0) {
    if (axis === 'x') {
      wall(from, fixed, gapFrom, fixed, h, material, t, y0);
      wall(gapTo, fixed, to, fixed, h, material, t, y0);
      if (h > DOOR_H) {
        add(box({
          size: [gapTo - gapFrom, h - DOOR_H, t],
          pos: [(gapFrom + gapTo) / 2, y0 + DOOR_H + (h - DOOR_H) / 2, fixed], mat: material,
        }));
      }
    } else {
      wall(fixed, from, fixed, gapFrom, h, material, t, y0);
      wall(fixed, gapTo, fixed, to, h, material, t, y0);
      if (h > DOOR_H) {
        add(box({
          size: [t, h - DOOR_H, gapTo - gapFrom],
          pos: [fixed, y0 + DOOR_H + (h - DOOR_H) / 2, (gapFrom + gapTo) / 2], mat: material,
        }));
      }
    }
  }

  /** Hang a swinging leaf in a doorway. Same machine as the Bing's. */
  function hangDoor(id, {
    axis, fixed, from, to, y0 = 0, material = M_DARKWOOD, locked = false,
    label, swing = -1.9, hinge = 'low', alarmed = false, glass = false,
  }) {
    const width = to - from;
    const pivot = new THREE.Group();
    const leafMat = glass ? M_GLASS : material;
    const sgn = hinge === 'low' ? 1 : -1;
    const leaf = box({
      size: axis === 'x' ? [width, DOOR_H, 0.06] : [0.06, DOOR_H, width],
      pos: axis === 'x' ? [(width / 2) * sgn, DOOR_H / 2, 0] : [0, DOOR_H / 2, (width / 2) * sgn],
      mat: leafMat,
    });
    pivot.add(leaf);
    pivot.position.set(
      axis === 'x' ? (hinge === 'low' ? from : to) : fixed,
      y0,
      axis === 'x' ? fixed : (hinge === 'low' ? from : to),
    );
    add(pivot);

    const cbox = axis === 'x'
      ? collider([from, y0, fixed - 0.09], [to, y0 + DOOR_H, fixed + 0.09])
      : collider([fixed - 0.09, y0, from], [fixed + 0.09, y0 + DOOR_H, to]);
    colliders.push(cbox);

    const d = new Door({ pivot, leaf, colliders, box: cbox, locked, label, swing, alarmed });
    doors[id] = d;
    return d;
  }

  /* ================================================================ */
  /* Night                                                             */
  /* ================================================================ */

  /* The mistake worth writing down: every light in this building is a lamp,
   * every lamp has a falloff, and with nothing global there is simply no light
   * more than nine metres from a fitting. The first render of the street was a
   * black rectangle with a subtitle on it.
   *
   * A cold hemisphere and a moon, the same pair the Bing uses, so a wet street
   * outside and a dark room inside both have something to be dark *against*.
   * Both are deliberately weak: the warm pools of the fittings are supposed to
   * be what you see by, and the club is meant to be darker than it needs to be.
   */
  scene.background = new THREE.Color(0x06060a);
  scene.fog = new THREE.FogExp2(0x08080e, 0.013);

  add(new THREE.HemisphereLight(0x2c3752, 0x0c0c12, 0.55));
  const moon = new THREE.DirectionalLight(0x9fb4e8, 0.7);
  moon.position.set(-40, 46, 60);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -50;
  moon.shadow.camera.right = 50;
  moon.shadow.camera.top = 50;
  moon.shadow.camera.bottom = -50;
  moon.shadow.camera.far = 160;
  moon.shadow.bias = -0.0012;
  add(moon, moon.target);

  /* And a floor under the whole city, so the drop-off is on a road rather than
   * on the edge of the world. */
  {
    const tex = tiled(asphalt(), 30, 30);
    if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      mat({ map: tex, roughness: 0.44, metalness: 0.08 }),
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set(0, -0.02, 20);
    g.receiveShadow = true;
    add(g);
  }

  /* ================================================================ */
  /* The street                                                        */
  /* ================================================================ */

  window.__squatchStage?.('Wetting the pavement…');
  {
    const S = ROOMS.street;
    floor(S, M_ASPHALT, 'concrete', 0);
    // Pavement, a step up, running the width of the frontage
    const kerbY = 0.14;
    floor({ x0: -20, x1: 20, z0: 30, z1: 34.2 }, mat({ color: 0x3c3c42, roughness: 0.94 }), 'concrete', kerbY);
    add(box({ size: [40, kerbY, 0.3], pos: [0, kerbY / 2, 30], mat: mat({ color: 0x55555c, roughness: 0.9 }) }));

    // The frontage: brick, a canopy, and the sign
    wallGap('x', 34.2, -22, 22, -3.4, 3.4, 9, M_BRICK, 0.4);
    wall(-22, 34.2, -22, 26, 9, M_BRICK, 0.4);
    /* The east return of the frontage, z 26..34.2 -- not 34.2 down to -22,
     * which is an x value in a z slot and builds a brick wall fifty-six metres
     * long straight through the cellar, the kitchen and the dining room. */
    wall(22, 34.2, 22, 26, 9, M_BRICK, 0.4);

    // Canopy over the public door, and the queue under it
    add(box({ size: [11, 0.16, 4.6], pos: [0, 3.3, 32], mat: M_BURGUNDY }));
    for (const px of [-5.2, 5.2]) {
      add(cylinder({ r: 0.09, h: 3.3, pos: [px, 1.65, 30.2], mat: M_BRASS }));
      solid(px - 0.14, 30.06, px + 0.14, 30.34, 0, 3.3);
    }
    // Rope and posts, and the thirty people who have been there an hour
    for (let i = 0; i < 5; i++) {
      const px = -4.4 + i * 2.2;
      add(cylinder({ r: 0.06, h: 0.95, pos: [px, 0.62, 29.2], mat: M_BRASS }));
      add(sphere({ r: 0.075, pos: [px, 1.11, 29.2], mat: M_BRASS }));
      if (i < 4) {
        const rope = cylinder({ r: 0.035, h: 2.2, pos: [px + 1.1, 0.98, 29.2], mat: M_VELVET, rotZ: Math.PI / 2 });
        add(rope);
      }
    }
    anchors.publicDoor = new THREE.Vector3(0, 0, 33);
    anchors.queue = new THREE.Vector3(0, 0, 28.6);
    anchors.dropOff = new THREE.Vector3(6, 0, 38.5);
    anchors.doorman = new THREE.Vector3(2.6, 0, 32.6);

    // THE SILVER ROOM, in brass, lit from below and slightly too big
    const nameTex = neonText('silver-name', 'THE SILVER ROOM', '#e8d9a8', { size: 128 });
    const nameSign = sign(nameTex, 10, 1.9, { x: 0, y: 5.6, z: 34.05, emissive: '#e8d9a8', intensity: 1.5 });
    add(nameSign);
    const nameLight = pointLight(0xe8d9a8, 3.2);
    nameLight.position.set(0, 4.4, 32.4);
    nameLight.distance = 13;
    add(nameLight);
    houseLights.push({ light: nameLight, exterior: true });

    const smallTex = printed('silver-tonight', ['TONIGHT', 'THE MIDNIGHT PINES', 'TWO SETS'], {
      w: 256, h: 200, bg: '#120c08', fg: '#d8c48a',
    });
    add(sign(smallTex, 1.5, 1.2, { x: -4.6, y: 2.2, z: 34.02, emissive: '#d8c48a', intensity: 0.5 }));

    // A wet street reads mostly as reflections of things you cannot see
    for (let i = 0; i < 9; i++) {
      const px = rand(-18, 18);
      const pz = rand(35, 52);
      add(box({
        size: [rand(1.2, 3.4), 0.01, rand(0.8, 2.2)], pos: [px, 0.008, pz],
        mat: mat({ color: 0x1a1c24, roughness: 0.06, metalness: 0.55 }), cast: false,
      }));
    }
    // Street lamps, cold, on the far side
    for (const pz of [38, 48, 58]) {
      add(cylinder({ r: 0.11, h: 6.4, pos: [-24, 3.2, pz], mat: M_STEEL_D }));
      add(box({ size: [1.6, 0.18, 0.5], pos: [-23.2, 6.3, pz], mat: M_STEEL_D }));
      const l = pointLight(0xbdd0e8, 2.6);
      l.position.set(-22.6, 6.1, pz);
      l.distance = 20;
      add(l);
      houseLights.push({ light: l, exterior: true });
    }
  }

  /* ================================================================ */
  /* The alley                                                         */
  /* ================================================================ */

  window.__squatchStage?.('Putting the bins out…');
  {
    const A = ROOMS.alley;
    floor(A, mat({ map: tiled(asphalt(), 4, 12), roughness: 0.98 }), 'concrete', 0);
    // East wall of the club, west wall of whatever is next door
    wallGap('z', 30, -20, 32, 10, 13.4, 9, M_BRICK, 0.4);
    wall(38.2, -22, 38.2, 34, 7.5, M_BRICK, 0.4);
    wall(30, -22, 38.2, -22, 7.5, M_BRICK, 0.4);

    anchors.serviceDoor = new THREE.Vector3(30, 0, 11.7);
    anchors.alleyMouth = new THREE.Vector3(34, 0, 30);

    // The service door: a steel fire door with a bulb over it
    hangDoor('service', {
      axis: 'z', fixed: 30.1, from: 10, to: 13.4, material: M_STEEL,
      label: 'the <b>service door</b>', swing: -1.75, hinge: 'high',
    });
    const bulb = box({ size: [0.42, 0.3, 0.3], pos: [30.6, 2.5, 11.7], mat: M_STEEL_D });
    add(bulb);
    const doorLight = pointLight(0xffd9a0, 2.4);
    doorLight.position.set(30.9, 2.35, 11.7);
    doorLight.distance = 9;
    add(doorLight);
    houseLights.push({ light: doorLight, exterior: true });

    // A milk crate holding a fire door open two metres further down
    add(box({ size: [0.42, 0.34, 0.42], pos: [30.9, 0.17, 6.2], mat: mat({ color: 0x2a4a2a, roughness: 0.9 }) }));

    // Bins, crates, a pallet, a puddle with something in it
    const binMat = mat({ color: 0x2c3a2c, roughness: 0.88 });
    for (const [bx, bz] of [[36.6, 18], [36.6, 20.6], [36.4, 4]]) {
      add(box({ size: [1.5, 1.35, 2.2], pos: [bx, 0.68, bz], mat: binMat }));
      add(box({ size: [1.56, 0.1, 2.26], pos: [bx, 1.4, bz], mat: mat({ color: 0x22301f, roughness: 0.9 }) }));
      solid(bx - 0.78, bz - 1.12, bx + 0.78, bz + 1.12, 0, 1.45);
    }
    anchors.smoker = new THREE.Vector3(35.4, 0, 15.4);
    for (let i = 0; i < 7; i++) {
      const cx = rand(31, 33);
      const cz = rand(-14, 26);
      add(box({ size: [0.6, 0.42, 0.5], pos: [cx, 0.21 + (i % 2) * 0.42, cz], mat: M_WOOD }));
    }

    // A fire escape, because every alley has one and it takes the eye upward
    for (let i = 1; i <= 3; i++) {
      add(box({ size: [0.12, 0.06, 3.4], pos: [37.4, 2.4 * i, 24], mat: M_STEEL_D }));
      add(box({ size: [2.4, 0.06, 0.1], pos: [36.4, 2.4 * i, 22.4], mat: M_STEEL_D }));
    }
  }

  /* ================================================================ */
  /* The stair, and the cellar                                         */
  /* ================================================================ */

  window.__squatchStage?.('Racking the cellar…');
  {
    const T = ROOMS.stair;
    /* A ramp, not steps: the player controller has no stair logic, and a ramp
     * is what a building with a thousand crates a week would have anyway. */
    floor({ x0: 22, x1: 29.4, z0: 8.4, z1: 14.6 }, M_CONCRETE, 'concrete', 0);
    const rampLen = 7;
    const rampMesh = box({
      size: [rampLen, 0.16, 6.2], pos: [18.5, CELLAR_Y / 2, 11.5], mat: M_CONCRETE_L,
      rotZ: Math.atan2(-CELLAR_Y, rampLen),
    });
    add(rampMesh);
    // Sampled rather than solved: the ramp is one plane and this is one lerp.
    /* `from` is the height at x0 and `to` the height at x1, so the deep end is
     * the low x -- this was the wrong way round, and the effect was that
     * walking down the ramp took you *up* it, popping anybody who reached the
     * bottom back onto the kitchen floor a metre above the wine. */
    ramps.push({ x0: 15, x1: 22, z0: 8.4, z1: 14.6, from: CELLAR_Y, to: 0 });
    floorZones.push({
      box: new THREE.Box3(new THREE.Vector3(15, CELLAR_Y - 1, 8.4), new THREE.Vector3(29.4, 1, 14.6)),
      surface: 'concrete',
    });
    /* The south side is wall only where the landing is. The first seven metres
     * of it are the mouth of the ramp, and putting a wall across those is
     * putting a wall across the route -- which the player never noticed,
     * because a cutscene camera and a debug teleport both go through walls,
     * and she does not. */
    wall(22, 8.2, 29.6, 8.2, 3.2, M_CONCRETE, 0.3, CELLAR_Y);
    wall(15, 14.8, 29.6, 14.8, 3.2, M_CONCRETE, 0.3, CELLAR_Y);
    wall(29.6, 8.2, 29.6, 14.8, 3.2, M_CONCRETE, 0.3, 0);
    ceiling(T, M_CONCRETE, CEIL_BACK);

    // A handrail down the ramp, because otherwise it reads as a hole
    for (const rz of [8.7, 14.3]) {
      for (let i = 0; i <= 6; i++) {
        const rx = 15.5 + i;
        const ry = CELLAR_Y * (1 - i / 6) + 0.95;
        add(cylinder({ r: 0.045, h: 0.95, pos: [rx, ry - 0.47, rz], mat: M_STEEL_D }));
      }
      add(box({ size: [7.2, 0.06, 0.06], pos: [18.5, CELLAR_Y / 2 + 0.95, rz], mat: M_STEEL_D, rotZ: Math.atan2(-CELLAR_Y, rampLen) }));
    }

    const C = ROOMS.cellar;
    floor(C, M_CONCRETE, 'concrete', CELLAR_Y);
    ceiling(C, M_CONCRETE, CELLAR_Y + CEIL_CELLAR);
    wall(15, -6.2, 28.7, -6.2, CEIL_CELLAR, M_BRICK_IN, 0.3, CELLAR_Y);
    wall(28.7, -6.2, 28.7, 8.2, CEIL_CELLAR, M_BRICK_IN, 0.3, CELLAR_Y);
    wall(14.8, -6.2, 14.8, 8.2, CEIL_CELLAR, M_BRICK_IN, 0.3, CELLAR_Y);

    anchors.cellarman = new THREE.Vector3(24.5, CELLAR_Y, 3.2);
    anchors.cellarMid = new THREE.Vector3(21, CELLAR_Y, 1);
    anchors.spokenForCrate = new THREE.Vector3(27.4, CELLAR_Y, -4);

    // Wine racks: the whole point of the room
    const rackMat = mat({ color: 0x38251a, roughness: 0.9 });
    const bottleMat = mat({ color: 0x1c2a1a, roughness: 0.25, metalness: 0.05 });
    for (const [rx, rz, rot] of [[27.6, 2, 0], [27.6, -2, 0], [16, 2, 0], [16, -2, 0], [22, 6.6, Math.PI / 2]]) {
      const g = group('rack');
      for (let shelf = 0; shelf < 5; shelf++) {
        g.add(box({ size: [0.7, 0.05, 3.4], pos: [0, 0.35 + shelf * 0.42, 0], mat: rackMat }));
        for (let b = 0; b < 11; b++) {
          g.add(cylinder({
            r: 0.037, h: 0.3, rotZ: Math.PI / 2,
            pos: [0.04, 0.42 + shelf * 0.42, -1.5 + b * 0.3], mat: bottleMat,
          }));
        }
      }
      g.add(box({ size: [0.76, 2.3, 0.08], pos: [0, 1.15, -1.72], mat: rackMat }));
      g.add(box({ size: [0.76, 2.3, 0.08], pos: [0, 1.15, 1.72], mat: rackMat }));
      g.position.set(rx, CELLAR_Y, rz);
      g.rotation.y = rot;
      add(g);
      const hw = rot ? 1.8 : 0.42;
      const hd = rot ? 0.42 : 1.8;
      solid(rx - hw, rz - hd, rx + hw, rz + hd, CELLAR_Y, CELLAR_Y + 2.3);
    }

    // The crate that is spoken for, on its own, with a chalk mark on it
    const crate = box({ size: [1.1, 0.75, 0.9], pos: [27.4, CELLAR_Y + 0.38, -4], mat: M_WOOD });
    add(crate);
    solid(26.85, -4.45, 27.95, -3.55, CELLAR_Y, CELLAR_Y + 0.75);
    anchors.crateMesh = crate;

    // Strip lights: two, and one of them is going
    for (const lz of [4, -2]) {
      add(box({ size: [0.14, 0.09, 1.5], pos: [22, CELLAR_Y + 2.3, lz], mat: mat({ color: 0xdfe6ee, roughness: 1, emissive: 0xbfd0e0, emissiveIntensity: 0.8 }) }));
      const l = pointLight(0xcfe0f0, 2.4);
      l.position.set(22, CELLAR_Y + 2.15, lz);
      l.distance = 12;
      add(l);
      if (lz === -2) neon.push({ light: l, base: l.userData.base, next: 0, on: true, kind: 'flicker' });
      houseLights.push({ light: l, back: true });
    }

    /* ---- dry store and walk-in ---- */
    const D = ROOMS.drystore;
    floor(D, M_CONCRETE, 'concrete', CELLAR_Y);
    ceiling(D, M_CONCRETE, CELLAR_Y + CEIL_CELLAR);
    wall(15, -14.2, 28.7, -14.2, CEIL_CELLAR, M_BRICK_IN, 0.3, CELLAR_Y);
    wall(14.8, -14.2, 14.8, -6, CEIL_CELLAR, M_BRICK_IN, 0.3, CELLAR_Y);
    wallGap('z', 21, -14, -6, -11.4, -8.6, CEIL_CELLAR, M_BRICK_IN, 0.25, CELLAR_Y);
    // Shelving, floor to ceiling, full of tins
    for (const sz of [-8, -11, -13]) {
      const g = group('shelving');
      for (let s = 0; s < 5; s++) {
        g.add(box({ size: [3.4, 0.05, 0.65], pos: [0, 0.3 + s * 0.44, 0], mat: M_STEEL_D }));
        for (let t = 0; t < 8; t++) {
          g.add(cylinder({
            r: 0.075, h: 0.16, pos: [-1.5 + t * 0.43, 0.4 + s * 0.44, rand(-0.16, 0.16)],
            mat: mat({ color: pick([0xa8a29a, 0x8a7050, 0x9a4a3a]), roughness: 0.55, metalness: 0.4 }),
          }));
        }
      }
      g.position.set(17.8, CELLAR_Y, sz);
      add(g);
      solid(16, sz - 0.36, 19.6, sz + 0.36, CELLAR_Y, CELLAR_Y + 2.1);
    }
    anchors.drystore = new THREE.Vector3(19, CELLAR_Y, -10);

    const W = ROOMS.walkin;
    floor(W, mat({ color: 0x8a9099, roughness: 0.5, metalness: 0.25 }), 'tile', CELLAR_Y);
    ceiling(W, M_STEEL, CELLAR_Y + CEIL_CELLAR);
    wall(28.7, -14.2, 28.7, -6, CEIL_CELLAR, M_STEEL, 0.3, CELLAR_Y);
    hangDoor('walkin', {
      axis: 'z', fixed: 21.1, from: -11.4, to: -8.6, y0: CELLAR_Y, material: M_STEEL,
      label: 'the <b>walk-in</b>', swing: -1.6,
    });
    const coldLight = pointLight(0xdaeaff, 1.6);
    coldLight.position.set(25, CELLAR_Y + 2.1, -10);
    coldLight.distance = 10;
    add(coldLight);
    houseLights.push({ light: coldLight, back: true });
    for (const hx of [23, 26.5]) {
      for (let h = 0; h < 3; h++) {
        add(box({ size: [0.16, 0.5, 0.24], pos: [hx, CELLAR_Y + 1.7, -8 - h * 1.8], mat: mat({ color: 0x8a4a44, roughness: 0.75 }) }));
      }
      add(box({ size: [0.1, 0.06, 5.4], pos: [hx, CELLAR_Y + 2.05, -10.6], mat: M_STEEL }));
    }
    anchors.walkin = new THREE.Vector3(24.5, CELLAR_Y, -10);
  }

  /* ================================================================ */
  /* Prep, kitchen, dish                                               */
  /* ================================================================ */

  window.__squatchStage?.('Lighting the pass…');
  {
    const P = ROOMS.prep;
    // The ramp back up, at the cellar's west end
    const upLen = 4.5;
    add(box({
      size: [upLen, 0.16, 3.2], pos: [17.75, CELLAR_Y / 2, 1], mat: M_CONCRETE_L,
      rotZ: Math.atan2(CELLAR_Y, upLen),
    }));
    floorZones.push({
      box: new THREE.Box3(new THREE.Vector3(15.5, CELLAR_Y - 1, -0.6), new THREE.Vector3(20, 1, 2.6)),
      surface: 'concrete',
    });
    ramps.push({ x0: 15.5, x1: 20, z0: -0.6, z1: 2.6, from: CELLAR_Y, to: 0 });

    floor(P, mat({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.18 }), 'tile', 0);
    ceiling(P, mat({ color: 0x4a4e56, roughness: 0.9 }), CEIL_BACK);
    wall(15, 8.2, 24.2, 8.2, CEIL_BACK, M_TILE, 0.25);
    wall(24.2, -2, 24.2, 8.2, CEIL_BACK, M_TILE, 0.25);

    const K = ROOMS.kitchen;
    floor(K, mat({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.18 }), 'tile', 0);
    ceiling(K, mat({ color: 0x3e424a, roughness: 0.9 }), CEIL_BACK);
    wall(15, -18.2, 30.2, -18.2, CEIL_BACK, M_TILE, 0.25);
    wall(30.2, -18.2, 30.2, -2, CEIL_BACK, M_TILE, 0.25);
    wall(24.2, -2, 30.2, -2, CEIL_BACK, M_TILE, 0.25);
    // The wall between the kitchen and the corridor, with the swing doors in it
    wallGap('z', 15, -18, 8, -9.2, -6.4, CEIL_BACK, M_TILE, 0.25);
    hangDoor('kitchenSwing', {
      axis: 'z', fixed: 15.1, from: -9.2, to: -6.4, material: mat({ color: 0xb8bcc4, roughness: 0.5 }),
      label: 'the <b>kitchen doors</b>', swing: -1.9,
    });

    anchors.pass = new THREE.Vector3(19, 0, -6.6);
    anchors.chef = new THREE.Vector3(20.5, 0, -5.4);
    anchors.prepCook = new THREE.Vector3(18.5, 0, 4.2);
    anchors.hotPan = new THREE.Vector3(21.5, 0, -9.5);
    anchors.dishwasher = new THREE.Vector3(26.6, 0, -13.5);
    anchors.porter = new THREE.Vector3(17.5, 0, -13);

    // The pass: a heated shelf, ticket rail, and the light over it
    add(box({ size: [5.6, 0.1, 0.9], pos: [19, 0.95, -6.6], mat: mat({ color: 0xc8ccd2, roughness: 0.28, metalness: 0.65 }) }));
    add(box({ size: [5.6, 0.85, 0.9], pos: [19, 0.45, -6.6], mat: M_STEEL_D }));
    solid(16.2, -7.05, 21.8, -6.15, 0, 1.05);
    add(box({ size: [5.6, 0.06, 0.1], pos: [19, 1.72, -6.9], mat: M_STEEL }));
    for (let i = 0; i < 9; i++) {
      add(box({ size: [0.14, 0.2, 0.01], pos: [16.6 + i * 0.6, 1.6, -6.88], mat: mat({ color: 0xf0ece0, roughness: 1 }) }));
    }
    const passLight = pointLight(0xffd9a8, 3.4);
    passLight.position.set(19, 1.9, -6.6);
    passLight.distance = 8;
    add(passLight);
    houseLights.push({ light: passLight, back: true });

    // The line: ranges, a salamander, and a lot of steel
    for (let i = 0; i < 4; i++) {
      const rx = 17 + i * 2.6;
      add(box({ size: [2.4, 0.9, 1.1], pos: [rx, 0.45, -10.5], mat: M_STEEL_D }));
      add(box({ size: [2.4, 0.06, 1.1], pos: [rx, 0.93, -10.5], mat: mat({ color: 0x1a1c20, roughness: 0.55 }) }));
      solid(rx - 1.2, -11.05, rx + 1.2, -9.95, 0, 0.95);
      for (const bz of [-10.85, -10.15]) {
        for (const bx of [rx - 0.6, rx + 0.6]) {
          add(cylinder({ r: 0.16, h: 0.03, pos: [bx, 0.96, bz], mat: mat({ color: 0x2a1210, roughness: 0.7, emissive: 0x501008, emissiveIntensity: 0.7 }) }));
        }
      }
    }
    // Extraction hood over the line, which is most of what makes a kitchen read
    add(box({ size: [11.4, 0.9, 2.2], pos: [20.4, 2.2, -10.5], mat: mat({ color: 0xb0b6bc, roughness: 0.3, metalness: 0.7 }) }));
    add(box({ size: [11.4, 0.5, 0.16], pos: [20.4, 1.6, -9.35], mat: M_STEEL }));

    // Prep benches
    for (const [bx, bz] of [[18.5, 4.6], [22, 4.6], [18.5, 0.6]]) {
      add(box({ size: [2.6, 0.06, 1.2], pos: [bx, 0.92, bz], mat: mat({ color: 0xc0c6cc, roughness: 0.3, metalness: 0.6 }) }));
      for (const lx of [-1.15, 1.15]) for (const lz of [-0.5, 0.5]) {
        add(cylinder({ r: 0.035, h: 0.9, pos: [bx + lx, 0.45, bz + lz], mat: M_STEEL_D }));
      }
      solid(bx - 1.3, bz - 0.6, bx + 1.3, bz + 0.6, 0, 0.95);
    }

    // The dish station
    const DS = ROOMS.dish;
    add(box({ size: [1.6, 0.95, 6.4], pos: [26.6, 0.48, -13.6], mat: M_STEEL_D }));
    solid(25.8, -16.8, 27.4, -10.4, 0, 1);
    add(box({ size: [1.5, 0.05, 6.2], pos: [26.6, 0.97, -13.6], mat: mat({ color: 0xa8b0b8, roughness: 0.24, metalness: 0.75 }) }));
    for (let i = 0; i < 5; i++) {
      add(box({ size: [0.9, 0.5, 0.9], pos: [28.6, 0.9 + (i % 2) * 0.05, -12 - i * 1.1], mat: mat({ color: 0x3a5a7a, roughness: 0.8 }) }));
    }
    // A hose on a spring, which is the one thing everybody recognises
    add(cylinder({ r: 0.04, h: 1.3, pos: [26.4, 1.6, -13.6], mat: M_STEEL }));
    add(cylinder({ r: 0.05, h: 0.5, pos: [26.4, 2.1, -13.2], mat: M_STEEL, rotX: 0.6 }));
    // Wet floor
    floorZones.push({
      box: new THREE.Box3(new THREE.Vector3(24, -1, -18), new THREE.Vector3(30, 1, -10)),
      surface: 'tile',
    });

    // Strip lights the whole way down, unglamorous and even
    for (const lz of [4, -2, -8, -14]) {
      for (const lx of [18, 25]) {
        if (lz === 4 && lx === 25) continue;
        add(box({ size: [0.14, 0.08, 1.6], pos: [lx, CEIL_BACK - 0.14, lz], mat: mat({ color: 0xeef2f6, roughness: 1, emissive: 0xd0e0f0, emissiveIntensity: 0.9 }) }));
        const l = pointLight(0xdce8f4, 2.2);
        l.position.set(lx, CEIL_BACK - 0.3, lz);
        l.distance = 11;
        add(l);
        houseLights.push({ light: l, back: true });
      }
    }

  }

  /* ================================================================ */
  /* The employee corridor                                             */
  /* ================================================================ */

  window.__squatchStage?.('Hanging the coats…');
  {
    const C = ROOMS.corridor;
    // Three surfaces in nine metres: this is the building explained
    floor({ x0: 10, x1: 15, z0: -18, z1: -2 }, mat({ color: 0x8e949c, roughness: 0.4, metalness: 0.15 }), 'tile', 0);
    floor({ x0: 10, x1: 15, z0: -2, z1: 14 }, mat({ color: 0x2c2e34, roughness: 0.98 }), 'concrete', 0);
    floor({ x0: 10, x1: 15, z0: 14, z1: 26 }, M_CARPET, 'carpet', 0);
    ceiling(C, mat({ color: 0x35383e, roughness: 0.92 }), CEIL_BACK);
    wall(9.8, -18, 9.8, 22.4, CEIL_BACK, M_WAINSCOT, 0.25);
    wall(10, -18.2, 15, -18.2, CEIL_BACK, M_TILE, 0.25);
    // East wall of the corridor above the cellar, with the prep doorway in it
    wallGap('z', 15, -2, 8, 1.6, 4.4, CEIL_BACK, M_TILE, 0.25);
    wall(15, 8, 15, 26, CEIL_BACK, M_WAINSCOT, 0.25);

    anchors.corridorMid = new THREE.Vector3(12.5, 0, 6);
    anchors.serviceBar = new THREE.Vector3(12.4, 0, 10.5);
    anchors.coatCheck = new THREE.Vector3(12.4, 0, 20);
    anchors.curtain = new THREE.Vector3(10.4, 0, 24);

    // The service bar: a hatch onto the main bar, from the working side
    add(box({ size: [0.5, 1.1, 4.2], pos: [14.6, 0.55, 10.5], mat: M_DARKWOOD }));
    add(box({ size: [0.68, 0.07, 4.4], pos: [14.6, 1.13, 10.5], mat: M_BRASS }));
    solid(14.3, 8.4, 14.95, 12.6, 0, 1.2);
    for (let i = 0; i < 5; i++) {
      add(makeWhiskeyBottle(M, { x: 14.75, y: 1.16, z: 9 + i * 0.7 }));
    }
    for (let i = 0; i < 8; i++) {
      add(makeShotGlass(M, { x: 14.4, y: 1.17, z: 8.8 + i * 0.45 }));
    }
    const barLight = pointLight(0xffcb8a, 2.2);
    barLight.position.set(13.6, 2.3, 10.5);
    barLight.distance = 8;
    add(barLight);
    houseLights.push({ light: barLight, back: true });

    // Coat check: a counter, a rail, ninety-two numbered tickets
    add(box({ size: [0.5, 1.1, 3.4], pos: [14.6, 0.55, 20], mat: M_DARKWOOD }));
    add(box({ size: [0.72, 0.07, 3.6], pos: [14.6, 1.13, 20], mat: M_BRASS }));
    solid(14.3, 18.2, 14.95, 21.8, 0, 1.2);
    const railG = group('coat-rail');
    railG.add(cylinder({ r: 0.03, h: 3.2, pos: [0, 1.75, 0], mat: M_BRASS, rotX: Math.PI / 2 }));
    for (let i = 0; i < 16; i++) {
      railG.add(box({
        size: [0.34, 0.95, 0.1], pos: [0, 1.24, -1.5 + i * 0.2],
        mat: mat({ color: pick([0x24242c, 0x3a2a20, 0x2a3040, 0x1e1e24]), roughness: 0.92 }),
      }));
    }
    railG.position.set(15.6, 0, 20);
    add(railG);

    // The route gets warmer and quieter as it goes north
    for (const [lz, colour, power] of [
      [-14, 0xdce8f4, 2.2], [-6, 0xdce8f4, 2.0], [2, 0xe8dcc0, 1.8],
      [10, 0xffcb8a, 1.7], [18, 0xffbe72, 1.6], [24, 0xffb45e, 1.5],
    ]) {
      const l = pointLight(colour, power);
      l.position.set(12.4, CEIL_BACK - 0.35, lz);
      l.distance = 10;
      add(l);
      add(box({ size: [0.5, 0.1, 0.5], pos: [12.4, CEIL_BACK - 0.06, lz], mat: mat({ color: 0x2a2a30, roughness: 0.9 }) }));
      houseLights.push({ light: l, back: lz < 6 });
    }

    // The curtain: heavy, floor to lintel, and the last thing between you and it
    const curtain = group('curtain');
    for (let i = 0; i < 6; i++) {
      curtain.add(box({
        size: [0.14, 3.1, 0.5], pos: [0, 1.55, -1.25 + i * 0.5],
        mat: M_VELVET, rotY: (i % 2 ? 0.14 : -0.14),
      }));
    }
    curtain.position.set(9.9, 0, 24);
    add(curtain);
    anchors.curtainMesh = curtain;
    // The doorway it hangs in
    wallGap('z', 9.8, 22.4, 26.2, 22.6, 25.6, CEIL_BACK, M_WAINSCOT, 0.25);
  }

  /* ================================================================ */
  /* The dining room                                                   */
  /* ================================================================ */

  window.__squatchStage?.('Laying two hundred covers…');
  {
    const F = ROOMS.floor;
    floor(F, M_CARPET, 'carpet', 0);
    ceiling({ x0: -30, x1: 10, z0: -16, z1: 26 }, mat({ color: 0x1a1218, roughness: 0.96 }), CEIL_FLOOR);

    wall(-30.2, -16, -30.2, 26, CEIL_FLOOR, M_PANEL, 0.3);
    wall(-30, 26.2, 10, 26.2, CEIL_FLOOR, M_PANEL, 0.3);
    wall(-30, -16.2, -26, -16.2, CEIL_FLOOR, M_PANEL, 0.3);
    // East wall, with the curtain doorway already punched by the corridor
    wall(10.1, -8, 10.1, 22.4, CEIL_FLOOR, M_PANEL, 0.3);
    wall(10.1, 25.6, 10.1, 26.2, CEIL_FLOOR, M_PANEL, 0.3);

    // Wainscoting all the way round, at seated eye height
    for (const [x0, z0, x1, z1] of [[-30, -16, -30, 26], [-30, 26, 10, 26], [10, -8, 10, 26]]) {
      add(box({
        size: [Math.max(Math.abs(x1 - x0), 0.06), 1.15, Math.max(Math.abs(z1 - z0), 0.06)],
        pos: [(x0 + x1) / 2 + (x0 === x1 ? (x0 < 0 ? 0.12 : -0.12) : 0), 0.58,
          (z0 + z1) / 2 + (z0 === z1 ? -0.12 : 0)],
        mat: M_WAINSCOT, cast: false,
      }));
    }

    /* ---- the lobby, visible from the floor so the front door is real ---- */
    const L = ROOMS.lobby;
    floor(L, mat({ color: 0x2a1a1e, roughness: 0.95 }), 'tile', 0);
    ceiling(L, mat({ color: 0x1a1218, roughness: 0.95 }), 3.6);
    wallGap('x', 26.2, -9, 9, -2.2, 2.2, CEIL_FLOOR, M_PANEL, 0.3);
    wall(-9.2, 26, -9.2, 34, 3.6, M_PANEL, 0.3);
    wall(9.2, 26, 9.2, 34, 3.6, M_PANEL, 0.3);
    hangDoor('front', {
      axis: 'x', fixed: 34.1, from: -1.7, to: 1.7, glass: true,
      label: 'the <b>front door</b>', swing: 1.7,
    });
    anchors.lobby = new THREE.Vector3(0, 0, 30);

    /* ---- the host station ---- */
    const hostDesk = group('host-station');
    hostDesk.add(box({ size: [1.5, 1.12, 0.6], pos: [0, 0.56, 0], mat: M_DARKWOOD }));
    hostDesk.add(box({ size: [1.62, 0.06, 0.72], pos: [0, 1.15, 0], mat: M_BRASS }));
    // The book. It is the book. The book does not lie.
    hostDesk.add(box({ size: [0.42, 0.05, 0.3], pos: [0, 1.2, 0.02], mat: mat({ color: 0x2a1a12, roughness: 0.8 }) }));
    hostDesk.position.set(0.5, 0, 24.2);
    add(hostDesk);
    solid(-0.35, 23.85, 1.35, 24.55, 0, 1.2);
    anchors.hostStation = new THREE.Vector3(0.5, 0, 23.2);
    anchors.host = new THREE.Vector3(0.5, 0, 24.9);
    anchors.hostMark = new THREE.Vector3(2.2, 0, 23.4);   // where the two of them wait

    const hostLamp = pointLight(0xffc27a, 1.5);
    hostLamp.position.set(0.5, 1.5, 24.2);
    hostLamp.distance = 5;
    add(hostLamp);
    lamps.push({ light: hostLamp });

    /* ---- the stage ---- */
    const S = ROOMS.stage;
    floor(S, mat({ color: 0x241812, roughness: 0.7 }), 'wood', STAGE_H);
    add(box({ size: [20, STAGE_H, 7], pos: [-16, STAGE_H / 2, -11.5], mat: M_DARKWOOD }));
    solid(-26, -15, -6, -8, 0, STAGE_H);
    add(box({ size: [20.3, 0.08, 0.14], pos: [-16, STAGE_H, -8.05], mat: M_BRASS }));
    wall(-26.2, -15.2, -5.8, -15.2, CEIL_FLOOR, mat({ color: 0x1a0f14, roughness: 0.95 }), 0.3);

    // Stage curtains, drawn, until they are not
    const stageCurtain = group('stage-curtain');
    for (let i = 0; i < 22; i++) {
      stageCurtain.add(box({
        size: [0.8, 4.2, 0.22], pos: [-25.4 + i * 0.9, 2.1, 0],
        mat: M_VELVET, rotY: (i % 2 ? 0.1 : -0.1),
      }));
    }
    stageCurtain.position.set(0, STAGE_H, -9.4);
    add(stageCurtain);
    anchors.stageCurtain = stageCurtain;
    anchors.stageFront = new THREE.Vector3(-16, STAGE_H, -9.6);
    anchors.stageCentre = new THREE.Vector3(-16, STAGE_H, -11);

    // Pelmet and proscenium
    add(box({ size: [21, 1.1, 0.5], pos: [-16, 4.9, -9.4], mat: M_VELVET }));
    for (const px of [-26.2, -5.8]) {
      add(box({ size: [0.7, 5.2, 0.7], pos: [px, 2.6, -9.4], mat: M_WAINSCOT }));
      solid(px - 0.35, -9.75, px + 0.35, -9.05, 0, 5.2);
    }

    // Spots on a bar, off until the announcer says otherwise
    for (let i = 0; i < 5; i++) {
      const sx = -23 + i * 3.5;
      add(cylinder({ r: 0.16, h: 0.34, pos: [sx, 4.5, -8.6], mat: M_STEEL_D, rotX: 0.6 }));
      const l = pointLight(0xfff0d0, 4.2, 16);
      l.intensity = 0;                      // until the announcer says otherwise
      l.position.set(sx, 4.3, -8.8);
      add(l);
      stageLights.push({ light: l });
    }
    // The backstage door, off the stage-left wing
    const B = ROOMS.backstage;
    floor(B, M_CONCRETE, 'concrete', 0);
    hangDoor('backstage', {
      axis: 'x', fixed: -15.1, from: -29.4, to: -26.6, material: M_STEEL,
      label: 'the <b>backstage door</b>', locked: true, swing: -1.7,
    });

    /* ---- the room itself: tables, banquettes, columns ---- */
    anchors.tables = [];
    const seatsAt = [];
    const tableTop = mat({ color: 0xece7dc, roughness: 0.95 });
    function diningTable(x, z, seats = 4, { r = 0.72 } = {}) {
      const g = group('table');
      g.add(cylinder({ r: 0.09, h: 0.72, pos: [0, 0.36, 0], mat: M_DARKWOOD }));
      g.add(cylinder({ r: 0.36, h: 0.05, pos: [0, 0.03, 0], mat: M_DARKWOOD }));
      g.add(cylinder({ r, h: 0.05, pos: [0, 0.74, 0], mat: tableTop }));
      // The cloth hangs; a tabletop with no skirt reads as a mushroom
      g.add(cylinder({ rTop: r, rBottom: r * 0.94, h: 0.46, pos: [0, 0.52, 0], mat: tableTop }));
      // The shaded lamp, which is the whole look of the room
      g.add(cylinder({ r: 0.05, h: 0.2, pos: [0, 0.86, 0], mat: M_BRASS }));
      g.add(cylinder({ rTop: 0.1, rBottom: 0.15, h: 0.19, pos: [0, 1.03, 0], mat: mat({ color: 0xd8a860, roughness: 0.85, emissive: 0xc07a2a, emissiveIntensity: 0.55 }) }));
      /* The shade glows whatever happens -- that is what you see from across
       * the room -- but only the nearest handful actually cast light. Thirty
       * live point lights in a forward renderer are thirty per-pixel terms in
       * every shader in the scene, and twenty-four of them are lighting a
       * tablecloth nobody is looking at. */
      const l = pointLight(0xffb45e, 2.2, 5.2);
      l.position.set(x, 1.0, z);
      l.intensity = 0;
      add(l);
      lamps.push({ light: l, x, z });
      g.position.set(x, 0, z);
      add(g);
      solid(x - r, z - r, x + r, z + r, 0, 0.8);
      anchors.tables.push(new THREE.Vector3(x, 0, z));
      for (let i = 0; i < seats; i++) {
        const a = (i / seats) * Math.PI * 2 + 0.4;
        const sx = x + Math.sin(a) * (r + 0.5);
        const sz = z + Math.cos(a) * (r + 0.5);
        add(makeChair(M, { x: sx, y: 0, z: sz, rotY: a + Math.PI }));
        seatsAt.push({ x: sx, z: sz, yaw: a + Math.PI });
      }
      return g;
    }

    // A packed floor: rows that leave a service lane down the middle
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const tx = -25 + col * 5.4;
        const tz = -4.5 + row * 5.4;
        if (tx > 4 && tz > 18) continue;             // keep the host station clear
        if (Math.abs(tx - (-16)) < 3 && tz < -2) continue;  // and the front of the stage
        diningTable(tx + rand(-0.4, 0.4), tz + rand(-0.4, 0.4), col % 2 ? 4 : 2);
      }
    }
    // Banquettes down the east wall
    for (let i = 0; i < 5; i++) {
      const bz = -3 + i * 5.2;
      add(box({ size: [1.5, 0.45, 3.6], pos: [8.6, 0.28, bz], mat: M_BURGUNDY }));
      add(box({ size: [0.35, 1.15, 3.6], pos: [9.4, 0.62, bz], mat: M_BURGUNDY_D }));
      solid(7.85, bz - 1.8, 9.6, bz + 1.8, 0, 0.75);
      anchors.tables.push(new THREE.Vector3(7.2, 0, bz));
      diningTable(7.0, bz, 2, { r: 0.6 });
    }

    // Columns, with framed photographs on them, because everything in here has
    // a photograph of somebody on it
    for (const [cx, cz] of [[-8, 6], [-8, 16], [-20, 6], [-20, 16]]) {
      add(box({ size: [0.8, CEIL_FLOOR, 0.8], pos: [cx, CEIL_FLOOR / 2, cz], mat: M_WAINSCOT }));
      solid(cx - 0.4, cz - 0.4, cx + 0.4, cz + 0.4, 0, CEIL_FLOOR);
      for (const [ox, oz, ry] of [[0.42, 0, Math.PI / 2], [-0.42, 0, -Math.PI / 2]]) {
        add(makeFrame(M, { x: cx + ox, y: 1.9, z: cz + oz, rotY: ry, w: 0.4, h: 0.5 }));
      }
    }

    /* Sconces. A forty-metre room lit only from the middle of the ceiling has
     * dark walls and dark faces at every table against them, and the brief on
     * this was explicit: not so dark that you cannot read a face or a prompt.
     * Brass, shaded, at head height, all the way round. */
    for (const [sx, sz, ry] of [
      [-29.6, -2, Math.PI / 2], [-29.6, 6, Math.PI / 2], [-29.6, 14, Math.PI / 2], [-29.6, 22, Math.PI / 2],
      [9.7, -4, -Math.PI / 2], [9.7, 6, -Math.PI / 2], [9.7, 16, -Math.PI / 2], [9.7, 24, -Math.PI / 2],
      [-24, 25.7, Math.PI], [-14, 25.7, Math.PI], [-4, 25.7, Math.PI],
    ]) {
      const sc = group('sconce');
      sc.add(cylinder({ r: 0.04, h: 0.3, pos: [0, 0, 0], mat: M_BRASS, rotX: 0.5 }));
      sc.add(cylinder({
        rTop: 0.13, rBottom: 0.09, h: 0.2, pos: [0, 0.2, 0.06],
        mat: mat({ color: 0xd8a860, roughness: 0.85, emissive: 0xc07a2a, emissiveIntensity: 0.7 }),
      }));
      sc.position.set(sx, 2.35, sz);
      sc.rotation.y = ry;
      add(sc);
      const l = pointLight(0xffb45e, 1.35, 9);
      l.position.set(sx + Math.sin(ry) * 0.35, 2.4, sz + Math.cos(ry) * 0.35);
      add(l);
      houseLights.push({ light: l });
    }

    // Chandeliers: the house lights, and the thing that dims
    for (const [cx, cz] of [
      [-24, -2], [-24, 10], [-24, 22],
      [-13, -2], [-13, 10], [-13, 22],
      [-2, -2], [-2, 10], [-2, 22],
      [6, 4], [6, 18],
    ]) {
      const ch = group('chandelier');
      ch.add(cylinder({ r: 0.03, h: 1.1, pos: [0, 0.55, 0], mat: M_BRASS }));
      ch.add(cylinder({ rTop: 0.55, rBottom: 0.3, h: 0.34, pos: [0, -0.12, 0], mat: mat({ color: 0xc9a24a, roughness: 0.35, metalness: 0.7, emissive: 0x6a4a10, emissiveIntensity: 0.4 }) }));
      ch.position.set(cx, CEIL_FLOOR - 1.1, cz);
      add(ch);
      const l = pointLight(0xffbe72, 3.4, 17);
      l.position.set(cx, CEIL_FLOOR - 1.3, cz);
      add(l);
      houseLights.push({ light: l, chandelier: ch });
    }

    // Framed photographs, the length of the north wall
    for (let i = 0; i < 9; i++) {
      add(makeFrame(M, { x: -26 + i * 3.6, y: 2.1, z: 25.9, rotY: Math.PI, w: 0.5, h: 0.62 }));
    }
    add(makeWallClock(M, { x: 9.8, y: 3.2, z: 14, rotY: -Math.PI / 2 }));
    for (const [px, pz] of [[-28.4, 24], [8.2, 24.6]]) add(makePlant(M, { x: px, y: 0, z: pz }));

    /* ---- restrooms and the manager's station ---- */
    floor(ROOMS.restrooms, mat({ color: 0x6a7078, roughness: 0.4 }), 'tile', 0);
    floor(ROOMS.manager, mat({ color: 0x33251c, roughness: 0.9 }), 'wood', 0);
    wallGap('x', -15.2, -6, 0, -3.4, -1.6, CEIL_FLOOR, M_PANEL, 0.25);
    wallGap('x', -15.2, 0, 10, 3, 4.8, CEIL_FLOOR, M_PANEL, 0.25);
    hangDoor('manager', {
      axis: 'x', fixed: -15.3, from: 3, to: 4.8, locked: true,
      label: 'the <b>manager’s office</b>',
    });
    anchors.managerDesk = new THREE.Vector3(5, 0, -18.5);
    anchors.rearExit = new THREE.Vector3(-3, 0, -21);
    hangDoor('rear', {
      axis: 'z', fixed: -21.6, from: -4.4, to: -1.6, material: M_STEEL,
      label: 'the <b>rear exit</b>', alarmed: true,
    });

    anchors.diningSeats = seatsAt;
  }

  /* ================================================================ */
  /* The table that does not exist yet                                 */
  /* ================================================================ */

  /**
   * Built now, hidden, and carried into place by the staff during the cutscene.
   * There is exactly one of these. Spawning a cinematic prop and swapping it
   * for a gameplay one afterwards is the single most obvious way to make the
   * best moment in the mission look like a trick, so it is not done.
   */
  const front = group('front-table');
  {
    const cloth = mat({ color: 0xf2ede2, roughness: 0.95 });
    front.add(cylinder({ r: 0.09, h: 0.72, pos: [0, 0.36, 0], mat: M_DARKWOOD }));
    front.add(cylinder({ r: 0.34, h: 0.05, pos: [0, 0.03, 0], mat: M_DARKWOOD }));
    const top = cylinder({ r: 0.68, h: 0.05, pos: [0, 0.74, 0], mat: cloth });
    front.add(top);
    const skirt = cylinder({ rTop: 0.68, rBottom: 0.64, h: 0.46, pos: [0, 0.52, 0], mat: cloth });
    skirt.visible = false;                      // laid during the cutscene
    front.add(skirt);
    top.visible = false;

    const lampG = group('front-lamp');
    lampG.add(cylinder({ r: 0.05, h: 0.2, pos: [0, 0.86, 0], mat: M_BRASS }));
    lampG.add(cylinder({ rTop: 0.1, rBottom: 0.15, h: 0.19, pos: [0, 1.03, 0], mat: mat({ color: 0xd8a860, roughness: 0.85, emissive: 0xc07a2a, emissiveIntensity: 0.6 }) }));
    lampG.visible = false;
    front.add(lampG);
    const frontLight = pointLight(0xffb45e, 1.6, 4.8);
    frontLight.intensity = 0;               // lit last, which is what makes it a table
    frontLight.position.set(0, 1.0, 0);
    front.add(frontLight);

    // Two settings, hidden until a waiter lays them
    const settings = [];
    for (const side of [-1, 1]) {
      const s = group('setting');
      s.add(cylinder({ r: 0.13, h: 0.012, pos: [0, 0.775, 0], mat: mat({ color: 0xf6f3ec, roughness: 0.4 }) }));
      s.add(box({ size: [0.015, 0.006, 0.14], pos: [-0.19, 0.775, 0], mat: mat({ color: 0xc8ccd4, roughness: 0.24, metalness: 0.85 }) }));
      s.add(box({ size: [0.015, 0.006, 0.14], pos: [0.19, 0.775, 0], mat: mat({ color: 0xc8ccd4, roughness: 0.24, metalness: 0.85 }) }));
      s.add(cylinder({ rTop: 0.045, rBottom: 0.028, h: 0.11, pos: [0.15, 0.83, -0.16], mat: M_GLASS }));
      s.position.set(0, 0, side * 0.44);
      s.rotation.y = side > 0 ? 0 : Math.PI;
      s.visible = false;
      settings.push(s);
      front.add(s);
    }

    front.visible = false;
    add(front);
  }

  const frontChairs = [];
  for (const side of [-1, 1]) {
    const c = makeChair(M, { x: 0, y: 0, z: 0, rotY: side > 0 ? Math.PI : 0 });
    const obj = c.isObject3D ? c : c.group;
    obj.visible = false;
    add(obj);
    frontChairs.push(obj);
  }

  /* Front and center: four metres out from the stage lip, dead on the middle
   * of it, which is the only place in this room worth carrying a table to. */
  anchors.frontTable = new THREE.Vector3(-16, 0, -5.2);
  anchors.frontSeats = [
    { x: -16, z: -5.9, yaw: Math.PI, faceYaw: 0 },     // his: back to the room
    { x: -16, z: -4.5, yaw: 0, faceYaw: Math.PI },     // hers: facing the stage
  ];
  anchors.tableStaging = new THREE.Vector3(-9.5, 0, 0.5);

  /* ================================================================ */
  /* Ground height, and the update loop                                */
  /* ================================================================ */

  const STAGE = ROOMS.stage;

  /**
   * How high the floor is at a point.
   *
   * The cellar is *under* the kitchen rather than beside it, so x and z alone
   * cannot answer this: standing at (19, -4) you are either on the kitchen
   * floor or in the wine store, and the only difference is which one you
   * walked in from. So callers pass their own current height and get the floor
   * that belongs to it. The two ramps are the only places the answer changes,
   * which is what makes it stable rather than a guess.
   *
   * @param {number} fromY where the asker currently is. Omitted means ground.
   */
  function groundAt(x, z, fromY = 0) {
    if (x >= STAGE.x0 && x <= STAGE.x1 && z >= STAGE.z0 && z <= STAGE.z1) return STAGE_H;
    for (const r of ramps) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
        const k = (x - r.x0) / (r.x1 - r.x0);
        return r.from + (r.to - r.from) * k;
      }
    }
    if (fromY > CELLAR_Y / 2) return 0;              // upstairs, and staying there
    for (const r of [ROOMS.cellar, ROOMS.drystore, ROOMS.walkin]) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return CELLAR_Y;
    }
    return 0;
  }

  /* ---- the house lights, and the two moments they change ---- */
  const lighting = { house: 1, stage: 0, target: { house: 1, stage: 0 } };

  function setHouse(level, stageLevel, immediate = false) {
    lighting.target.house = level;
    lighting.target.stage = stageLevel;
    if (immediate) { lighting.house = level; lighting.stage = stageLevel; applyLighting(); }
  }

  /**
   * What each fitting is doing this frame.
   *
   * Two things multiply together and neither owns the other: the dimmer (the
   * house goes down for the band; the back of house and the street do not) and
   * the pool (a light more than a room away is switched off entirely).
   *
   * The pool is the performance answer. This is a forward renderer: every
   * enabled point light is a per-pixel term in every shader in the scene, and
   * a supper club that wants a lamp on every table has eighty of them. Keeping
   * the nearest few and switching the rest off costs nothing visually, because
   * the *shades* still glow — the warm dots you see across the room are
   * emissive geometry, not lights.
   */
  function applyLighting() {
    for (const h of houseLights) {
      if (h.exterior) continue;             // the street does not care about the show
      h.light.intensity = h.light.userData.base
        * (h.back ? 1 : lighting.house) * (h.off ? 0 : 1);
    }
    /* The table lamps never dim with the house -- that is the whole look of
     * the second half -- but whether they are on at all is the pool's call. */
    for (const l of lamps) l.light.intensity = l.off ? 0 : l.light.userData.base;
    for (const st of stageLights) st.light.intensity = st.light.userData.base * lighting.stage;
  }
  applyLighting();

  let curtainOpen = 0;
  function openStageCurtain(k) { curtainOpen = k; }

  /**
   * Switch off everything that is too far away to be seen by.
   *
   * Run at 4Hz rather than per frame: it is a sort over eighty entries and the
   * answer does not change in a quarter of a second of walking. The one thing
   * it must not do is flicker, so the budget is generous and the ordering is
   * stable.
   */
  const LAMP_BUDGET = 8;
  const HOUSE_BUDGET = 14;
  let poolAt = 0;
  function pool(p, dt) {
    poolAt -= dt;
    if (!p || poolAt > 0) return;
    poolAt = 0.25;
    for (const [list, budget] of [[lamps, LAMP_BUDGET], [houseLights, HOUSE_BUDGET]]) {
      const near = list
        .map((e) => ({
          e,
          d: Math.abs(e.light.position.x - p.x) + Math.abs(e.light.position.z - p.z),
        }))
        .sort((a, b) => a.d - b.d);
      for (let i = 0; i < near.length; i++) {
        /* Two rules, and the radius is the one that matters: a fitting more
         * than about a room away contributes nothing you can see and costs a
         * per-pixel term in every shader in the scene. The count is a backstop
         * for standing in the middle of the dining room with eleven
         * chandeliers in range.
         *
         * The street is exempt. The sign over the front door is meant to be
         * visible from the far end of the alley, which is the only reason the
         * player believes there is a front door.
         */
        near[i].e.off = !near[i].e.exterior && (near[i].d > 26 || i >= budget);
      }
    }
    applyLighting();
  }

  function update(dt, playerPos) {
    // Lights ease rather than cut; a hard cut reads as a bug in a warm room
    for (const key of ['house', 'stage']) {
      const d = lighting.target[key] - lighting[key];
      if (Math.abs(d) > 0.001) lighting[key] += d * Math.min(1, dt * 1.6);
    }
    pool(playerPos, dt);
    applyLighting();

    for (const d of Object.values(doors)) d.update(dt);

    // The one bad tube in the cellar
    for (const n of neon) {
      n.next -= dt;
      if (n.next <= 0) {
        n.on = !n.on;
        n.next = n.on ? rand(1.5, 6) : rand(0.03, 0.12);
        n.light.intensity = n.on ? n.base : n.base * 0.15;
      }
    }

    // The stage curtain, when it goes
    if (anchors.stageCurtain) {
      const g = anchors.stageCurtain;
      for (let i = 0; i < g.children.length; i++) {
        const half = g.children.length / 2;
        const dir = i < half ? -1 : 1;
        const from = i < half ? (half - 1 - i) : (i - half);
        g.children[i].position.x = (-25.4 + i * 0.9) + dir * curtainOpen * (2.4 + from * 0.55);
      }
    }

    for (const t of ticking) t(dt, playerPos);
  }

  return {
    root, colliders, floorZones, platforms, doors, anchors,
    groundAt, update, roomAt, zoneAt, ROOMS, ROUTE,
    frontTable: { group: front, chairs: frontChairs },
    setHouse, openStageCurtain, lighting,
    lamps, houseLights, stageLights,
    M,
  };
}
