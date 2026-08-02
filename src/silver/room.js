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
 * The footprint of the ramp back up out of the cellar.
 *
 * Three separate pieces of the building have to agree about where this hole
 * is — the ramp itself, the hole in the cellar ceiling above it, and the hole
 * in the prep kitchen's floor above that — and when they disagree the symptom
 * is a man walking up a slope with his feet 1.3m under a tiled floor he can
 * see. So it is written down once.
 */
export const RAMP_UP = { x0: 15.5, x1: 20, z0: -0.6, z1: 2.6 };

/**
 * The footprint of the entry ramp's well, below grade.
 *
 * Not a room — the ramp is its floor and its ceiling is the night sky. It is
 * written down because `groundAt` has to know that the ground under it is the
 * cellar's slab and not the street: for six months the answer here was 0, and
 * a man who walked down the ramp and kept walking got 2.9m of free lift onto
 * the corridor carpet beside the service bar.
 */
export const WELL = { x0: 14.6, x1: 22, z0: 8.4, z1: 14.6 };

/**
 * The tallest lift that counts as a step rather than as a teleport.
 *
 * Nothing reads this to decide a floor height — that ended badly, see
 * `groundAt`. It is the number the building is *built* to and the number the
 * verifier holds it to: walk anywhere below grade and no step you can take
 * may raise you further than this. A clamber onto the mouth of a ramp is a
 * metre; being posted up beside the bar was two and nine.
 */
export const STEP_UP = 1.0;

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
  /* Out to the service door, because the concrete landing you come in onto is
   * part of the stair and not a hole in the plan: it answered 'outside', so
   * the first room inside the building played street audio. */
  stair:     { x0: 15,  x1: 30,   z0: 8,   z1: 15 },

  /* ---- back of house ----
   * `dish` before `kitchen`: `roomAt` returns the first match and the kitchen
   * box contains the whole dish pit, so the dish room could never be answered
   * and the pot wash was the kitchen with a different name. */
  prep:      { x0: 15, x1: 24, z0: -2,  z1: 8 },
  dish:      { x0: 24, x1: 30, z0: -18, z1: -10 },
  kitchen:   { x0: 15, x1: 30, z0: -18, z1: -2 },
  corridor:  { x0: 10, x1: 15, z0: -18, z1: 26 },

  /* ---- front of house ---- */
  lobby:     { x0: -9, x1: 9,  z0: 26,  z1: 34 },
  floor:     { x0: -30, x1: 10, z0: -8, z1: 26 },
  stage:     { x0: -26, x1: -6, z0: -15, z1: -8 },
  backstage: { x0: -30, x1: -26, z0: -22, z1: -15 },
  restrooms: { x0: -6,  x1: 0,  z0: -22, z1: -15 },
  manager:   { x0: 0,   x1: 10, z0: -22, z1: -15 },
  /* The back corridor behind the dining room's south wall. It is what the
   * restrooms and the office are off, and without it the south edge of the
   * dining room was 15.7m of open carpet onto nothing at all. */
  service:   { x0: -6,  x1: 10, z0: -15, z1: -8 },
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
  club: ['lobby', 'floor', 'stage', 'backstage', 'restrooms', 'manager', 'service'],
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
 *
 * Which is exactly why it has to be surveyed rather than sketched. Ten of the
 * old twenty-six legs ran through something solid — a wine rack, the pass, the
 * range line, the wall at the bottom of the kitchen — and two nodes were
 * labelled with rooms they were not in. None of that showed up, because the
 * only thing that had ever walked it was a test driver that sets positions and
 * a companion who teleports when she gets stuck. She got stuck a lot.
 *
 * Two rules for anybody editing this: every leg is clear of every collider at
 * the walking height it is walked at, and `roomAt(node)` is the room on the
 * node. Both are asserted in `tools/verify-silver.mjs`.
 */
export const ROUTE = [
  /* ---- the pavement, and along the front to the alley mouth ---- */
  { x: 9,    z: 39,   room: 'street' },
  { x: 22,   z: 37.5, room: 'street' },
  { x: 33,   z: 36,   room: 'street' },
  /* ---- the alley, down the east side to the service door ---- */
  { x: 34,   z: 30,   room: 'alley' },
  { x: 34,   z: 20,   room: 'alley' },
  { x: 34,   z: 13.5, room: 'alley' },
  { x: 31.6, z: 11.7, room: 'alley' },
  /* ---- the landing, and the ramp down ---- */
  { x: 28.4, z: 11.7, room: 'stair' },
  { x: 24,   z: 11.6, room: 'stair' },
  { x: 20,   z: 11.5, room: 'stair', y: CELLAR_Y },
  { x: 15.6, z: 10.6, room: 'stair', y: CELLAR_Y },
  /* ---- the cellar, west aisle then east across the racks ---- */
  { x: 15.9, z: 8,    room: 'cellar', y: CELLAR_Y },
  { x: 17.6, z: 7.6,  room: 'cellar', y: CELLAR_Y },
  { x: 20,   z: 4,    room: 'cellar', y: CELLAR_Y },
  { x: 23.5, z: 1.5,  room: 'cellar', y: CELLAR_Y },
  { x: 25.4, z: -3,   room: 'cellar', y: CELLAR_Y },
  /* ---- out to the walk-in, through it, and into the dry store ---- */
  { x: 24.4, z: -7,   room: 'walkin', y: CELLAR_Y },
  { x: 24.4, z: -10.5, room: 'walkin', y: CELLAR_Y },
  { x: 21.8, z: -10,  room: 'walkin', y: CELLAR_Y },
  { x: 19.6, z: -10,  room: 'drystore', y: CELLAR_Y },
  { x: 19.8, z: -7,   room: 'drystore', y: CELLAR_Y },
  /* ---- back into the cellar and up the other ramp ---- */
  { x: 19.8, z: -5,   room: 'cellar', y: CELLAR_Y },
  { x: 17.5, z: -3,   room: 'cellar', y: CELLAR_Y },
  { x: 17.4, z: -1.4, room: 'cellar', y: CELLAR_Y },
  { x: 15.9, z: -1.2, room: 'cellar', y: CELLAR_Y },
  { x: 15.9, z: 0.8,  room: 'cellar', y: CELLAR_Y },
  { x: 18,   z: 1,    room: 'cellar', y: CELLAR_Y },
  { x: 20.8, z: 1,    room: 'prep' },
  /* ---- the kitchen: east of the pass, east of the range line ---- */
  { x: 22.5, z: -3,   room: 'kitchen' },
  { x: 23,   z: -8.5, room: 'kitchen' },
  { x: 27.6, z: -8.9, room: 'kitchen' },
  { x: 28.4, z: -12,  room: 'dish' },
  { x: 28.4, z: -15.5, room: 'dish' },
  { x: 27.9, z: -17.4, room: 'dish' },
  /* ---- back up the west side of the line to the swing doors ---- */
  { x: 25.2, z: -17.4, room: 'dish' },
  { x: 20,   z: -16.5, room: 'kitchen' },
  { x: 17.2, z: -14.2, room: 'kitchen' },
  { x: 15.9, z: -10.5, room: 'kitchen' },
  { x: 16.2, z: -8.6, room: 'kitchen' },
  { x: 14,   z: -7.9, room: 'corridor' },
  /* ---- the corridor, getting warmer all the way north ---- */
  { x: 12.5, z: -12,  room: 'corridor' },
  { x: 12.5, z: -2,   room: 'corridor' },
  { x: 12.5, z: 8,    room: 'corridor' },
  { x: 12.3, z: 16,   room: 'corridor' },
  { x: 12.3, z: 22,   room: 'corridor' },
  { x: 11,   z: 24,   room: 'corridor' },
  /* ---- through the curtain, onto the floor ---- */
  { x: 7.5,  z: 24,   room: 'floor' },
  { x: 2.2,  z: 23.4, room: 'floor' },
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
  /* One authored route shared by floor layout, cutscene choreography and the
   * verifier. The middle mark gives the carry a gentle curve through the
   * service lane instead of a diagonal through whichever table random jitter
   * happened to put there on this load. */
  const TABLE_CARRY_ROUTE = [
    new THREE.Vector3(-11.7, 0, 1.4),
    new THREE.Vector3(-13.2, 0, -1.0),
    new THREE.Vector3(-16.0, 0, -5.2),
  ];
  anchors.tableCarryRoute = TABLE_CARRY_ROUTE.map((p) => p.clone());
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
  /* Every glowing lampshade in the building. The base colour is near-black on
   * purpose: the glow is the emissive term, and a pale albedo under a bulb a
   * hand-span away multiplies into hundreds — which is what had every table
   * lamp blooming like a headlight and the owner asking why he could not see
   * the woman across the table. A black shade cannot be scorched by its own
   * bulb; what you see is exactly the emissive, which is exactly a number. */
  const M_SHADE = mat({ color: 0x1a1008, roughness: 0.85, emissive: 0xc07a2a, emissiveIntensity: 0.4 });

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

  /* And a moon you can look at, not just one you are lit by.
   *
   * The light above has been in the scene since the first render and there
   * has never been anything in the sky: a wet street, a hemisphere the colour
   * of a bruise, and shadows cast by nothing. It is on the light's own axis,
   * so the disc is where the shadows say it is — north-north-west, about 33°
   * up, which is exactly where a player is looking when the car pulls away,
   * because arrival leaves him facing up the street.
   *
   * Kept 200m from the camera rather than parked in world space: the far
   * plane is 300 and the set is 90m across, so anything fixed would clip out
   * of the sky halfway down the alley. Depth testing stays on, so the club's
   * own brick still eats it from inside the alley, which is what a moon does.
   *
   * MeshBasicMaterial at plain white is 1.0 in linear, and the bloom
   * threshold this scene runs at is 1.35 — so the disc is the brightest thing
   * on the street and still contributes nothing to the flare that the marquee
   * fix exists to keep out of it. The glow around it is drawn, not bloomed:
   * one additive gradient at a fifth strength, which cannot clip because it is
   * adding a fifth of a stop to a sky that is at 0.02. */
  {
    const moonDir = moon.position.clone().normalize();
    const moonG = group('moon');
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(4.4, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, depthWrite: false }),
    );
    disc.renderOrder = -2;
    moonG.add(disc);
    // The halo: a radial falloff painted once, added rather than lit
    const hc = document.createElement('canvas');
    hc.width = 128; hc.height = 128;
    const hg = hc.getContext('2d');
    const grad = hg.createRadialGradient(64, 64, 6, 64, 64, 64);
    grad.addColorStop(0, 'rgba(214,228,255,0.85)');
    grad.addColorStop(0.28, 'rgba(178,200,246,0.30)');
    grad.addColorStop(0.62, 'rgba(150,176,232,0.09)');
    grad.addColorStop(1, 'rgba(120,150,210,0)');
    hg.fillStyle = grad;
    hg.fillRect(0, 0, 128, 128);
    const haloTex = new THREE.CanvasTexture(hc);
    haloTex.colorSpace = THREE.SRGBColorSpace;
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(38, 38),
      new THREE.MeshBasicMaterial({
        map: haloTex, transparent: true, opacity: 0.2, fog: false,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    halo.renderOrder = -3;
    moonG.add(halo);
    // The seas, so it is a moon rather than a bulb: three faint grey blots
    for (const [mx, my, mr, ma] of [[-1.3, 0.9, 1.5, 0.16], [1.1, -0.6, 1.9, 0.12], [0.2, 1.8, 1.0, 0.1]]) {
      const sea = new THREE.Mesh(
        new THREE.CircleGeometry(mr, 20),
        new THREE.MeshBasicMaterial({
          color: 0x8fa2c4, fog: false, transparent: true, opacity: ma, depthWrite: false,
        }),
      );
      sea.position.set(mx, my, 0.02);
      sea.renderOrder = -1;
      moonG.add(sea);
    }
    moonG.position.copy(moonDir).multiplyScalar(200);
    add(moonG);
    ticking.push((dt, p) => {
      if (!p) return;
      moonG.position.copy(moonDir).multiplyScalar(200).add(p);
      moonG.lookAt(p.x, p.y, p.z);
    });
  }

  /* And a floor under the whole city, so the drop-off is on a road rather than
   * on the edge of the world.
   *
   * In four pieces, with a hole left over the cellar's footprint. It used to
   * be one 300m sheet, which also ran *under the building* at y=-0.02 — and
   * the cellar is at -2.9, so both stairwells had a street-sized asphalt lid
   * across them exactly at the eye line of anybody standing at the top. The
   * whole descent read as opaque: you walked down into a surface you could
   * not see through and the room below only existed once your head was under
   * it. The hole covers the two ramp wells and everything below grade; the
   * ground floors of the building sit at y=0 and hide the seams. */
  {
    const HOLE = { x0: 14.7, x1: 29.6, z0: -14.5, z1: 14.9 };
    for (const [x0, z0, x1, z1] of [
      [-150, -130, HOLE.x0, 170],
      [HOLE.x1, -130, 150, 170],
      [HOLE.x0, HOLE.z1, HOLE.x1, 170],
      [HOLE.x0, -130, HOLE.x1, HOLE.z0],
    ]) {
      const tex = tiled(asphalt(), (x1 - x0) / 10, (z1 - z0) / 10);
      if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(x1 - x0, z1 - z0),
        mat({ map: tex, roughness: 0.44, metalness: 0.08 }),
      );
      g.rotation.x = -Math.PI / 2;
      g.position.set((x0 + x1) / 2, -0.02, (z0 + z1) / 2);
      g.receiveShadow = true;
      add(g);
    }
  }

  /* ================================================================ */
  /* The street                                                        */
  /* ================================================================ */

  window.__squatchStage?.('Wetting the pavement…');
  {
    const S = ROOMS.street;
    floor(S, M_ASPHALT, 'concrete', 0);

    /* Everything from here to the street lamps is *outside*, and the whole set
     * used to be built inside the building.
     *
     * The frontage is a brick wall at z=34.2 and the street is the +z side of
     * it, so a pavement at z 30..34.2 is four metres of paving slab laid across
     * the lobby carpet, with a canopy over the host station, a rope line
     * through the front-of-house wall, and the sign facing the wrong way into
     * a dark room. `roomAt` agreed: standing under the marquee answered
     * 'lobby', so the marquee played interior audio and the pooling switched
     * the sign off as an interior fitting nobody was near.
     *
     * Every z here is now the reflection of the old one about the facade,
     * z' = 68.4 - z, which is why the drop-off never moved: 38.5 was already
     * on the correct side and is what said the reflection was the intent.
     */
    const kerbY = 0.14;
    floor({ x0: -20, x1: 20, z0: 34.2, z1: 38.4 }, mat({ color: 0x3c3c42, roughness: 0.94 }), 'concrete', kerbY);
    add(box({ size: [40, kerbY, 0.3], pos: [0, kerbY / 2, 38.4], mat: mat({ color: 0x55555c, roughness: 0.9 }) }));

    /* The frontage: brick, a canopy, and the sign.
     *
     * It runs to x=30, which is the club's own east elevation, so the
     * building has one north-east corner and the alley has one mouth. It used
     * to stop at x=22 and leave eight metres of nothing between the end of
     * the frontage and the start of the alley — a second opening, wider than
     * the alley, nearer than the alley, and directly under the sign that
     * points at the alley. Every player walked into it first, followed it to
     * a dead end against the old return wall, and came back out. The service
     * plate stays exactly where it is; what changes is that the only thing it
     * can be pointing at now is the way in. */
    wallGap('x', 34.2, -22, 30, -3.4, 3.4, 9, M_BRICK, 0.4);
    wall(-22, 34.2, -22, 26, 9, M_BRICK, 0.4);
    /* The old east return, now the back of the frontage rather than a corner
     * anybody sees -- kept because it is what closes the void behind it, and
     * because it is an x value in a z slot away from a brick wall fifty-six
     * metres long straight through the cellar, the kitchen and the dining
     * room, which is what it was before. */
    wall(22, 34.2, 22, 26, 9, M_BRICK, 0.4);

    // Canopy over the public door, and the queue under it
    add(box({ size: [11, 0.16, 4.6], pos: [0, 3.3, 36.4], mat: M_BURGUNDY }));
    for (const px of [-5.2, 5.2]) {
      /* On the pavement, which is 140mm up: a post whose base is at road level
       * is a post buried to the ankle in its own paving. */
      add(cylinder({ r: 0.09, h: 3.3, pos: [px, kerbY + 1.65, 38.2], mat: M_BRASS }));
      solid(px - 0.14, 38.06, px + 0.14, 38.34, kerbY, kerbY + 3.3);
    }
    // Rope and posts, and the thirty people who have been there an hour
    for (let i = 0; i < 5; i++) {
      const px = -4.4 + i * 2.2;
      add(cylinder({ r: 0.06, h: 0.95, pos: [px, kerbY + 0.62, 37.9], mat: M_BRASS }));
      add(sphere({ r: 0.075, pos: [px, kerbY + 1.11, 37.9], mat: M_BRASS }));
      if (i < 4) {
        const rope = cylinder({ r: 0.035, h: 2.2, pos: [px + 1.1, kerbY + 0.98, 37.9], mat: M_VELVET, rotZ: Math.PI / 2 });
        add(rope);
      }
    }
    anchors.publicDoor = new THREE.Vector3(0, 0, 35.4);
    anchors.queue = new THREE.Vector3(0, 0, 39.8);
    /* Where the two of them land: on the pavement at the kerb, east of the
     * canopy. It used to be (6, 38.5) — half a metre off the queue's rope with
     * a canopy post at arm's length, and the car stopped ON it, nose across
     * the kerb. Clear of the posts (±5.2), clear of the rope run (x ≤ 4.4),
     * with the whole car on the road. */
    anchors.dropOff = new THREE.Vector3(9, 0, 38.2);
    anchors.doorman = new THREE.Vector3(2.6, 0, 35.8);

    // THE SILVER ROOM, in brass, lit from below and slightly too big
    /* `neonText` takes `w`, `h` and `font`. It does not take `size`, which is
     * what this asked for — so the default 150px face ran off the end of a
     * 1024px canvas and the sign over the door has always read HE SILVER ROO.
     * A wider canvas and a face that fits on it. */
    const nameTex = neonText('silver-name', 'THE SILVER ROOM', '#e8d9a8', {
      w: 1400, h: 256, font: '900 124px "Trebuchet MS", sans-serif',
    });
    /* Proud of the brick, not inside it. The frontage is 400mm thick, so it
     * runs z 34.0..34.4 and a sign at 34.35 is 50mm *into* the wall — which is
     * where this one has always been, on one side or the other. All you ever
     * saw was the uplight washing bare brick.
     *
     * Emissive 0.55, not 1.5. The letter cores in the neon texture are
     * near-white, and 1.5 put them over the bloom threshold from the far end
     * of the street: the whole sign read as one gold flare and THE SILVER
     * ROOM was not readable off its own marquee. At 0.55 the tone mapper
     * keeps the glyphs under the threshold and the sign is bright, lit, and a
     * sign. */
    const nameSign = sign(nameTex, 10, 1.9, { x: 0, y: 5.6, z: 34.45, emissive: '#e8d9a8', intensity: 0.55 });
    nameSign.name = 'marquee';
    add(nameSign);
    const nameLight = pointLight(0xe8d9a8, 3.2);
    nameLight.position.set(0, 4.4, 36);
    nameLight.distance = 13;
    add(nameLight);
    houseLights.push({ light: nameLight, exterior: true });

    const smallTex = printed('silver-tonight', ['TONIGHT', 'THE MIDNIGHT PINES', 'TWO SETS'], {
      w: 256, h: 200, bg: '#120c08', fg: '#d8c48a',
    });
    add(sign(smallTex, 1.5, 1.2, { x: -4.6, y: 2.2, z: 34.44, emissive: '#d8c48a', intensity: 0.5 }));

    /* The nudge towards the side door. The whole bit of the scene is that he
     * does not stand in that queue, so the east corner of the frontage — the
     * corner you land facing — carries a small service plate with an arrow at
     * the alley, and a bulb over it so the eye finds it before the rope does.
     * Facing the frontage (looking −z), +x is on your right: the alley is the
     * way the arrow points. */
    const serviceTex = printed('silver-service', ['THE SILVER ROOM', 'SERVICE & DELIVERIES', 'IN REAR →'], {
      w: 420, h: 220, bg: '#14100a', fg: '#c8b070', border: '#5a4a28',
      font: '700 40px "Trebuchet MS", sans-serif',
    });
    const servicePlate = sign(serviceTex, 1.7, 0.9, { x: 19.6, y: 2.3, z: 34.44, emissive: '#c8b070', intensity: 0.4 });
    servicePlate.name = 'service-plate';
    add(servicePlate);
    const serviceLight = pointLight(0xffd9a0, 1.2);
    serviceLight.position.set(19.6, 3.1, 35.1);
    serviceLight.distance = 7;
    add(serviceLight);
    houseLights.push({ light: serviceLight, exterior: true });

    // A wet street reads mostly as reflections of things you cannot see.
    // Keep the patches authored and separated instead of letting seeded
    // random rectangles overlap by a few pixels and shimmer at street range.
    const puddleSpots = [
      [-15.0, 37.0], [-10.0, 43.0], [-5.0, 49.0],
      [0.0, 38.0], [5.0, 45.0], [10.0, 51.0],
      [15.0, 40.0], [-14.0, 52.0], [14.0, 35.5],
    ];
    for (const [px, pz] of puddleSpots) {
      /* 25mm off the tarmac, not 3. At 3mm these are inside what the depth
       * buffer can tell apart forty metres down a street with a 300m far
       * plane, and the whole road shimmered as you walked along it. */
      add(box({
        size: [rand(1.2, 3.4), 0.01, rand(0.8, 2.2)], pos: [px, 0.025, pz],
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
    /* East wall of the club, west wall of whatever is next door.
     *
     * Both ends used to stop short of the alley's own walls and leave a way
     * out of the world at each corner: z 32..34.2 at the top, which is the
     * false opening the service plate appeared to be pointing at, and
     * z −22..−20 at the bottom, where you could walk off the south end of the
     * alley into the void behind the kitchen. The elevation is continuous
     * brick now, with the one doorway in it. */
    wallGap('z', 30, -22, 34.2, 10, 13.4, 9, M_BRICK, 0.4);
    wall(38.2, -22, 38.2, 34, 7.5, M_BRICK, 0.4);
    // Lapped past x=30 so the south-west corner is a corner, not a mitre
    wall(29.8, -22, 38.2, -22, 7.5, M_BRICK, 0.4);

    anchors.serviceDoor = new THREE.Vector3(30, 0, 11.7);
    anchors.alleyMouth = new THREE.Vector3(34, 0, 30);

    // The service door: a steel fire door with a bulb over it
    hangDoor('service', {
      axis: 'z', fixed: 30.1, from: 10, to: 13.4, material: M_STEEL,
      label: 'the <b>service door</b>', swing: -1.75, hinge: 'high',
    });
    /* The lamp housing sits ON the wall face (30.2), not 400mm out in the
     * air over the doorway. */
    const bulb = box({ size: [0.42, 0.3, 0.3], pos: [30.34, 2.5, 11.7], mat: M_STEEL_D });
    add(bulb);
    // 1.7, not 2.4: at 900mm off the brick the old one washed the whole
    // elevation to flat white and the alley lost its wall
    const doorLight = pointLight(0xffd9a0, 1.7);
    doorLight.position.set(30.62, 2.35, 11.7);
    doorLight.distance = 9;
    add(doorLight);
    houseLights.push({ light: doorLight, exterior: true });

    // A milk crate holding a fire door open two metres further down
    add(box({ size: [0.42, 0.34, 0.42], pos: [30.9, 0.17, 6.2], mat: mat({ color: 0x2a4a2a, roughness: 0.9 }) }));

    // Bins, crates, a pallet, a puddle with something in it
    const binMat = mat({ color: 0x2c3a2c, roughness: 0.88 });
    for (const [bx, bz] of [[36.6, 18], [36.6, 20.6], [36.4, 4]]) {
      // 0.675, not 0.68: a 1.35 box centred at 0.68 stands 5mm off the tarmac
      add(box({ size: [1.5, 1.35, 2.2], pos: [bx, 0.675, bz], mat: binMat }));
      add(box({ size: [1.56, 0.1, 2.26], pos: [bx, 1.4, bz], mat: mat({ color: 0x22301f, roughness: 0.9 }) }));
      solid(bx - 0.78, bz - 1.12, bx + 0.78, bz + 1.12, 0, 1.45);
    }
    anchors.smoker = new THREE.Vector3(35.4, 0, 15.4);
    /* Stacked against the club wall at fixed places rather than scattered by
     * `rand` down the middle of the alley, and solid.
     *
     * Seven crates with no collider anywhere between z=-14 and z=26 meant the
     * route through the alley walked through a different number of them every
     * time the page loaded, and she walked through all of them every time.
     * Nothing here is inside z 9..17, which is the run up to the service door. */
    /* And the top of a stack is on top of the one below it.
     *
     * The two `stack: 1` crates were 800mm and 700mm away from the crates
     * they were stacked on, so both of them hung in the air at knee height
     * over bare tarmac with nothing underneath at all — and the second one is
     * beside the route at z=20, which is the one the owner kept walking past.
     * The offset is 60mm and a few degrees now, which is a crate put down on
     * another crate by somebody in a hurry rather than a crate in orbit. */
    for (const [cx, cz, stack, rot] of [
      [31.4, -12, 0, 0.12], [31.46, -11.94, 1, -0.22], [31.5, -5.4, 0, -0.08],
      [32.4, 2.2, 0, 0.3], [31.6, 19.8, 0, -0.15], [31.66, 19.87, 1, 0.24],
      [31.5, 24.2, 0, 0.06],
    ]) {
      add(box({ size: [0.6, 0.42, 0.5], pos: [cx, 0.21 + stack * 0.42, cz], mat: M_WOOD, rotY: rot }));
      solid(cx - 0.34, cz - 0.31, cx + 0.34, cz + 0.31, 0, 0.42 + stack * 0.42);
    }

    /* A fire escape, because every alley has one and it takes the eye upward.
     *
     * Hung off the brick (face at 38.0) rather than standing in space 600mm
     * clear of it. It used to be six loose sticks — two 60mm bars per storey,
     * one along the wall and one across it, holding nothing up and joined to
     * nothing — which from the alley floor read as scaffolding somebody had
     * dropped. It is a landing now: a grating, a kick rail, a handrail on
     * posts, brackets back to the brick, and a ladder down to the next one.
     * Still eight boxes a storey, and still nothing anybody can climb. */
    for (let i = 1; i <= 3; i++) {
      const y = 2.4 * i;
      // The grating, 1.1m out from the brick, and the angle brackets under it
      add(box({ size: [1.1, 0.05, 3.4], pos: [37.45, y, 24], mat: M_STEEL_D }));
      for (const bz of [22.5, 24, 25.4]) {
        // 37.58, so the 0.9 bracket tilted 0.36rad lands its top on the brick
        add(box({ size: [0.9, 0.05, 0.05], pos: [37.58, y - 0.34, bz], mat: M_STEEL_D, rotZ: 0.36 }));
      }
      // Kick rail, handrail, and the posts between them, on the alley side
      add(box({ size: [0.04, 0.14, 3.4], pos: [36.92, y + 0.09, 24], mat: M_STEEL_D }));
      add(box({ size: [0.05, 0.05, 3.4], pos: [36.92, y + 1.0, 24], mat: M_STEEL_D }));
      for (const pz of [22.4, 24, 25.6]) {
        add(cylinder({ r: 0.025, h: 1.0, pos: [36.92, y + 0.5, pz], mat: M_STEEL_D }));
      }
      // Stringers of the ladder up from the landing below, and four rungs
      if (i < 3) {
        for (const sz of [25.35, 25.75] ) {
          add(box({ size: [0.05, 2.45, 0.05], pos: [37.3, y + 1.2, sz], mat: M_STEEL_D, rotX: 0.16 }));
        }
        for (let r = 0; r < 4; r++) {
          add(cylinder({
            r: 0.02, h: 0.4, rotZ: Math.PI / 2,
            pos: [37.3, y + 0.35 + r * 0.55, 25.55 - r * 0.09], mat: M_STEEL_D,
          }));
        }
      }
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
    // Out to the doorway itself: at 29.4 the threshold you step over is void
    floor({ x0: 22, x1: 29.6, z0: 8.4, z1: 14.6 }, M_CONCRETE, 'concrete', 0);
    const rampRun = 7;
    /* The slab is the hypotenuse, not the run. A 7m box tilted to climb 2.9m
     * covers 6.46m of floor and leaves half a metre of daylight at the top of
     * the ramp, which reads as a hole in the concrete right where somebody is
     * about to walk into it. */
    const rampLen = Math.hypot(rampRun, -CELLAR_Y);
    const rampMesh = box({
      size: [rampLen, 0.16, 6.2], pos: [18.5, CELLAR_Y / 2, 11.5], mat: M_CONCRETE_L,
      rotZ: Math.atan2(-CELLAR_Y, rampRun),
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
    /* A second course on top of both.
     *
     * The first one starts at the cellar floor and is 3.2m tall, so it tops
     * out at y=0.3 -- which is fine down in the ramp cutting and is a
     * three-hundred-millimetre parapet by the time you are standing on the
     * landing. Above it was open sky into the plenum on two sides of the room
     * you walk into first. */
    wall(22, 8.2, 29.6, 8.2, CEIL_BACK - 0.3, M_CONCRETE, 0.3, 0.3);
    wall(15, 14.8, 29.6, 14.8, CEIL_BACK - 0.3, M_CONCRETE, 0.3, 0.3);
    /* The east wall of the landing is the one the service door is in. It was
     * a solid slab across the only entrance a player who obeys collision has,
     * and the door outside it opened onto brick. */
    wallGap('z', 29.6, 8.2, 14.8, 10, 13.4, 3.2, M_CONCRETE, 0.3, 0);
    /* The west end of the ramp well, and the reason the whole back-of-house
     * route was unplayable.
     *
     * The ramp bottoms out at x=15 and there was nothing there. Below grade
     * the cellar's west wall stops at z=8.2, the corridor's east wall starts
     * at y=0 and is skipped by anybody whose head is 1.2m under it, and
     * `groundAt` answers 0 for x<15 at these z — so a man who walked down the
     * ramp and kept walking, which is the one thing the ramp invites you to
     * do, crossed x=15 at feet −2.9, was handed street level, and rode the
     * floor-follow smoothing 2.9m straight up onto the corridor carpet beside
     * the service bar. It read as being teleported back upstairs because that
     * is exactly what it was.
     *
     * The face lands on x=15.00, flush with the head of the ramp slab and
     * with the corridor floor's east edge above it, and it stops 20mm short
     * of that floor for the same reason the cellar's west wall does. */
    wall(14.85, 8.2, 14.85, 14.8, -CELLAR_Y - 0.02, M_CONCRETE, 0.3, CELLAR_Y);
    /* The haunch under the entry ramp.
     *
     * The cellar runs to z=8.6 and the ramp starts at z=8.4, so 200mm of the
     * cellar's north edge is *underneath* a slab that climbs to kitchen
     * level: step north anywhere along it and the old `groundAt` put you on
     * top of the ramp, up to 2.6m over your own head. Concrete under the
     * slab, stepped to follow it, from the point the climb stops being a
     * step. West of it is the mouth of the ramp, which is where the route
     * goes and where the ramp is at cellar height anyway. */
    for (let i = 0; i < 6; i++) {
      const hx0 = 17.4 + i * 0.767;
      const top = CELLAR_Y + (-CELLAR_Y / rampRun) * (hx0 - 15) - 0.04;
      wall(hx0, 8.45, hx0 + 0.767, 8.45, top - CELLAR_Y, M_CONCRETE, 0.3, CELLAR_Y);
    }
    ceiling(T, M_CONCRETE, CEIL_BACK);

    /* A handrail down the ramp, because otherwise it reads as a hole.
     *
     * It used to be seven bare stanchions and one 60mm bar laid across the
     * top of them — no mid-rail, no return at either end, and the top of each
     * post left square in the air. From the landing you were looking down a
     * ramp at a row of sticks. It is a handrail now: top rail, mid-rail at
     * half height, a ball on each post, and a return at both ends so the run
     * finishes into something instead of stopping. */
    const rampTilt = Math.atan2(-CELLAR_Y, rampRun);
    for (const rz of [8.7, 14.3]) {
      for (let i = 0; i <= 6; i++) {
        const rx = 15.5 + i;
        const ry = CELLAR_Y * (1 - i / 6) + 0.95;
        add(cylinder({ r: 0.045, h: 0.95, pos: [rx, ry - 0.47, rz], mat: M_STEEL_D }));
        add(sphere({ r: 0.055, pos: [rx, ry, rz], mat: M_BRASS }));
      }
      for (const drop of [0, 0.46]) {
        add(box({
          size: [rampLen + 0.2, drop ? 0.045 : 0.06, drop ? 0.045 : 0.06],
          pos: [18.5, CELLAR_Y / 2 + 0.95 - drop, rz], mat: M_STEEL_D, rotZ: rampTilt,
        }));
      }
      // The returns, into the concrete at each end
      add(box({ size: [0.05, 0.05, 0.42], pos: [15.5, CELLAR_Y + 0.95, rz + (rz > 11 ? 0.24 : -0.24)], mat: M_STEEL_D }));
      add(box({ size: [0.05, 0.05, 0.42], pos: [21.5, 0.95, rz + (rz > 11 ? 0.24 : -0.24)], mat: M_STEEL_D }));
    }

    const C = ROOMS.cellar;
    floor(C, M_CONCRETE, 'concrete', CELLAR_Y);
    /* The cellar ceiling, with the up-ramp's shaft left out of it.
     *
     * It used to be one slab over the whole room at y=-0.5, and the ramp back
     * up to the prep kitchen climbs from -2.9 to 0 underneath it: from x=16.3
     * onwards the concrete is through your head, and at the top of the ramp
     * you are half a metre inside it. Somebody walking the route did not
     * notice, because the debug driver sets positions and does not have a
     * head. */
    for (const c of [
      { x0: 15, x1: 28.5, z0: -6, z1: RAMP_UP.z0 },
      { x0: RAMP_UP.x1, x1: 28.5, z0: RAMP_UP.z0, z1: RAMP_UP.z1 },
      /* Stopped short of z=8.6 over the down-ramp: the last 200mm of the
       * cellar is the mouth of the other ramp, and that one is at kitchen
       * height by the time it gets there. */
      { x0: 15, x1: 22, z0: RAMP_UP.z1, z1: 8.4 },
      { x0: 22, x1: 28.5, z0: RAMP_UP.z1, z1: 8.6 },
    ]) ceiling(c, M_CONCRETE, CELLAR_Y + CEIL_CELLAR);
    /* And the cheek walls of the shaft, so the 500mm of plenum between the
     * cellar ceiling and the prep floor is not a slot of daylight either side
     * of the ramp. They stop 20mm short of the prep floor on purpose: a
     * collider whose top is exactly the floor you are standing on is a wall
     * you cannot see, and this one ran the length of the room. The thing that
     * stops you walking into the well is the rail above it, which you can. */
    for (const fz of [RAMP_UP.z0, RAMP_UP.z1]) {
      wall(15, fz, RAMP_UP.x1, fz, 0.48, M_CONCRETE, 0.2, CELLAR_Y + CEIL_CELLAR);
    }
    /* Two doorways, because the route goes through this wall twice: out to the
     * walk-in at the east end and back in from the dry store at the west. It
     * was a solid thirteen metres of brick, which made the entire lower floor
     * of the building a sealed box that only a teleport could get into. */
    wallGap('x', -6.2, 15, 21, 19, 20.6, CEIL_CELLAR, M_BRICK_IN, 0.3, CELLAR_Y);
    wallGap('x', -6.2, 21, 28.7, 23, 25.8, CEIL_CELLAR, M_BRICK_IN, 0.3, CELLAR_Y);
    wall(28.7, -6.2, 28.7, 8.2, CEIL_CELLAR, M_BRICK_IN, 0.3, CELLAR_Y);
    /* Up to the prep floor rather than to the cellar ceiling, so the shaft has
     * no slot down its west side — but stopping 20mm short of it, for the same
     * reason the shaft cheeks do: a collider whose top is exactly the floor
     * somebody is standing on is a wall they cannot see, and this one runs the
     * length of the building straight through the corridor's prep doorway. */
    wall(14.8, -6.2, 14.8, 8.2, -CELLAR_Y - 0.02, M_BRICK_IN, 0.3, CELLAR_Y);

    anchors.cellarman = new THREE.Vector3(24.5, CELLAR_Y, 3.2);
    anchors.cellarMid = new THREE.Vector3(21, CELLAR_Y, 1);
    anchors.spokenForCrate = new THREE.Vector3(27.4, CELLAR_Y, -4);

    // Wine racks: the whole point of the room
    const rackMat = mat({ color: 0x38251a, roughness: 0.9 });
    const bottleMat = mat({ color: 0x1c2a1a, roughness: 0.25, metalness: 0.05 });
    /* The two west racks used to be at z=±2, which is the mouth of the ramp
     * back up to the kitchen: 3.6m of oak standing in the only way out of the
     * room, half-buried in the concrete of the ramp itself, with a 0.40m slot
     * left between them and the wall. Moved clear of `RAMP_UP` in z, which
     * leaves the aisle they were meant to make. */
    for (const [rx, rz, rot] of [[27.6, 2, 0], [27.6, -2, 0], [16, 5.2, 0], [16, -3.6, 0], [22, 6.6, Math.PI / 2]]) {
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
      // Screwed to the slab, not hovering 45mm under it
      add(box({ size: [0.14, 0.09, 1.5], pos: [22, CELLAR_Y + CEIL_CELLAR - 0.045, lz], mat: mat({ color: 0xdfe6ee, roughness: 1, emissive: 0xbfd0e0, emissiveIntensity: 0.8 }) }));
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
      /* Racked against the west wall rather than down the middle of the room.
       * Three runs at x 16..19.6 left a 0.68m slot between the last one and
       * the walk-in wall, which is a 0.60m-wide person's whole margin, and it
       * is the only way from the walk-in back into the cellar. */
      g.position.set(17, CELLAR_Y, sz);
      add(g);
      solid(15.2, sz - 0.36, 18.8, sz + 0.36, CELLAR_Y, CELLAR_Y + 2.1);
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
        // On the rail: its underside is at 2.02, so the top of this is too
        add(box({ size: [0.16, 0.5, 0.24], pos: [hx, CELLAR_Y + 1.77, -8 - h * 1.8], mat: mat({ color: 0x8a4a44, roughness: 0.75 }) }));
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
    /* The ramp back up.
     *
     * Two things were wrong with it and they hid each other. The slab was
     * tilted the wrong way -- `atan2(CELLAR_Y, run)` descends towards +x while
     * `ramps` climbs towards +x -- so the concrete you could see and the floor
     * you walked on crossed over in the middle and agreed nowhere else. And
     * the prep kitchen's floor was laid straight across the top of the whole
     * thing, so even where they did agree there was a tiled slab in the way:
     * a metre and a third of solid floor between the ramp and the man on it.
     */
    const upRun = RAMP_UP.x1 - RAMP_UP.x0;
    const upTilt = Math.atan2(-CELLAR_Y, upRun);
    add(box({
      size: [Math.hypot(upRun, CELLAR_Y), 0.16, RAMP_UP.z1 - RAMP_UP.z0],
      pos: [(RAMP_UP.x0 + RAMP_UP.x1) / 2, CELLAR_Y / 2, (RAMP_UP.z0 + RAMP_UP.z1) / 2],
      mat: M_CONCRETE_L, rotZ: upTilt,
    }));
    floorZones.push({
      box: new THREE.Box3(
        new THREE.Vector3(RAMP_UP.x0, CELLAR_Y - 1, RAMP_UP.z0),
        new THREE.Vector3(RAMP_UP.x1, 1, RAMP_UP.z1),
      ),
      surface: 'concrete',
    });
    ramps.push({ ...RAMP_UP, from: CELLAR_Y, to: 0 });
    /* The haunch under this one, for the same reason as the entry ramp's.
     *
     * The cellar runs underneath the whole well, and the cheeks that close
     * the shaft only start at the cellar ceiling — so from x≈17 eastwards a
     * man standing on the cellar floor could walk sideways into a slab three
     * metres over his head and be stood on top of it. Stepped concrete from
     * the cellar floor up to the soffit, starting where the climb stops
     * being a step; west of that is the mouth the route uses. */
    for (const fz of [RAMP_UP.z0, RAMP_UP.z1]) {
      for (let i = 0; i < 4; i++) {
        const hx0 = 17 + i * 0.75;
        const top = CELLAR_Y + (-CELLAR_Y / upRun) * (hx0 - RAMP_UP.x0) - 0.04;
        wall(hx0, fz, hx0 + 0.75, fz, top - CELLAR_Y, M_CONCRETE, 0.2, CELLAR_Y);
      }
    }
    /* A rail round the well, on the kitchen side, where there is a drop.
     *
     * The same treatment as the entry ramp's, and for the same reason: one
     * bar on five posts over a three-metre hole in a working kitchen is not a
     * guard rail, it is a trip hazard with a stripe on it. Top rail, mid-rail,
     * a kickplate at the floor so a dropped pan does not go over the edge,
     * and a post at each corner rather than a bar ending in mid-air. */
    for (const fz of [RAMP_UP.z0, RAMP_UP.z1]) {
      const run = RAMP_UP.x1 - 15;
      const mid = (15 + RAMP_UP.x1) / 2;
      add(box({ size: [run, 0.06, 0.06], pos: [mid, 0.95, fz], mat: M_STEEL_D }));
      add(box({ size: [run, 0.045, 0.045], pos: [mid, 0.5, fz], mat: M_STEEL_D }));
      add(box({ size: [run, 0.12, 0.02], pos: [mid, 0.06, fz], mat: M_STEEL_D }));
      for (let i = 0; i <= 4; i++) {
        add(cylinder({ r: 0.04, h: 0.95, pos: [15.4 + i * 1.15, 0.48, fz], mat: M_STEEL_D }));
      }
      /* An end post at the open end only. The west end of this run dies into
       * the corridor's east wall, which is where a handrail is supposed to
       * finish -- a post there would be a post inside 250mm of tiled
       * blockwork. */
      add(cylinder({ r: 0.045, h: 0.98, pos: [RAMP_UP.x1 - 0.04, 0.49, fz], mat: M_STEEL_D }));
      add(sphere({ r: 0.055, pos: [RAMP_UP.x1 - 0.04, 0.98, fz], mat: M_BRASS }));
      solid(15, fz - 0.05, RAMP_UP.x1, fz + 0.05, 0, 0.95);
    }

    /* The prep floor, with the ramp well left out of it. `floor()` also
     * records a walking surface, so the pieces have to tile the room exactly
     * or the footsteps go quiet in the gaps. */
    const preTile = mat({ color: 0x8b9199, roughness: 0.55, metalness: 0.06 });
    for (const f of [
      { x0: RAMP_UP.x1, x1: 24, z0: -2, z1: 8 },
      { x0: 15, x1: RAMP_UP.x1, z0: -2, z1: RAMP_UP.z0 },
      { x0: 15, x1: RAMP_UP.x1, z0: RAMP_UP.z1, z1: 8 },
    ]) floor(f, preTile, 'tile', 0);
    ceiling(P, mat({ color: 0x4a4e56, roughness: 0.9 }), CEIL_BACK);
    wall(15, 8.2, 24.2, 8.2, CEIL_BACK, M_TILE, 0.25);
    wall(24.2, -2, 24.2, 8.2, CEIL_BACK, M_TILE, 0.25);

    const K = ROOMS.kitchen;
    floor(K, preTile, 'tile', 0);
    ceiling(K, mat({ color: 0x3e424a, roughness: 0.9 }), CEIL_BACK);
    wall(15, -18.2, 29.7, -18.2, CEIL_BACK, M_TILE, 0.25);
    /* Inside the alley's brick rather than 200mm outside it: the tiled skin
     * used to sit at x=30.2 and the club's east elevation at x=30, which is
     * 7.4 cubic metres of wall inside another wall and a tiled stripe on the
     * outside of the building. */
    wall(29.6, -18.2, 29.6, -2, CEIL_BACK, M_TILE, 0.25);
    wall(24.2, -2, 29.7, -2, CEIL_BACK, M_TILE, 0.25);
    /* The wall between the kitchen and the corridor, with the swing doors in
     * it -- and it stops at z=-2, where the kitchen stops.
     *
     * It used to run to z=8, straight over the top of the prep doorway the
     * corridor punches at the same x further down this file, so the building
     * had a doorway drawn in it with a solid tiled wall standing in it. Two
     * `wallGap`s on the same line is one wall too many; each owns its own
     * stretch now. */
    wallGap('z', 15, -18, -2, -9.2, -6.4, CEIL_BACK, M_TILE, 0.25);
    hangDoor('kitchenSwing', {
      axis: 'z', fixed: 15.1, from: -9.2, to: -6.4, material: mat({ color: 0xb8bcc4, roughness: 0.5 }),
      label: 'the <b>kitchen doors</b>', swing: -1.9,
    });

    anchors.pass = new THREE.Vector3(19, 0, -6.6);
    anchors.chef = new THREE.Vector3(20.5, 0, -5.4);
    anchors.prepCook = new THREE.Vector3(18.5, 0, 3.1);   // in front of his bench, not inside it
    anchors.hotPan = new THREE.Vector3(21.5, 0, -9.5);
    /* At the sink, not IN it: 26.6 is the centre line of the dish station he
     * is supposed to be working at. He stands on its west side, facing it. */
    anchors.dishwasher = new THREE.Vector3(25.35, 0, -13.5);
    anchors.porter = new THREE.Vector3(17.5, 0, -13);

    // The pass: a heated shelf, ticket rail, and the light over it
    add(box({ size: [5.6, 0.1, 0.9], pos: [19, 0.95, -6.6], mat: mat({ color: 0xc8ccd2, roughness: 0.28, metalness: 0.65 }) }));
    add(box({ size: [5.6, 0.85, 0.9], pos: [19, 0.45, -6.6], mat: M_STEEL_D }));
    solid(16.2, -7.05, 21.8, -6.15, 0, 1.05);
    add(box({ size: [5.6, 0.06, 0.1], pos: [19, 1.72, -6.9], mat: M_STEEL }));
    for (let i = 0; i < 9; i++) {
      add(box({ size: [0.14, 0.2, 0.01], pos: [16.6 + i * 0.6, 1.6, -6.88], mat: mat({ color: 0xf0ece0, roughness: 1 }) }));
    }
    const passLight = pointLight(0xffd9a8, 2.7);
    passLight.position.set(19, 1.9, -6.6);
    passLight.distance = 8;
    add(passLight);
    houseLights.push({ light: passLight, back: true });

    /* The line: ranges, a salamander, and a lot of steel.
     *
     * Three of them, from x=16.6 to x=24.2, rather than four from 15.8 to 26.
     * Four made a single unbroken block of range across the whole kitchen with
     * a 0.65m slot at the corridor end and the dish pit hard against the
     * other, which is to say no way past it at all for anything 0.6m wide.
     * The room reads the same and you can now walk round both ends of it,
     * which is the only reason a kitchen line ever has ends. */
    for (let i = 0; i < 3; i++) {
      const rx = 17.8 + i * 2.6;
      add(box({ size: [2.4, 0.9, 1.1], pos: [rx, 0.45, -10.5], mat: M_STEEL_D }));
      add(box({ size: [2.4, 0.06, 1.1], pos: [rx, 0.93, -10.5], mat: mat({ color: 0x1a1c20, roughness: 0.55 }) }));
      solid(rx - 1.2, -11.05, rx + 1.2, -9.95, 0, 0.95);
      for (const bz of [-10.85, -10.15]) {
        for (const bx of [rx - 0.6, rx + 0.6]) {
          add(cylinder({ r: 0.16, h: 0.03, pos: [bx, 0.96, bz], mat: mat({ color: 0x2a1210, roughness: 0.7, emissive: 0x501008, emissiveIntensity: 0.7 }) }));
        }
      }
    }
    /* Extraction hood over the line, which is most of what makes a kitchen
     * read. Its front valance used to hang from 1.35 to 1.85 and start at
     * x=14.7 -- a half-metre steel plate at eye height, right across the aisle
     * you walk down, ending inside the corridor wall. Lifted clear of a head
     * and pulled back inside the room. */
    const hoodX0 = 16.4;
    const hoodX1 = 24.4;
    add(box({
      size: [hoodX1 - hoodX0, 0.9, 2.2], pos: [(hoodX0 + hoodX1) / 2, 2.3, -10.5],
      mat: mat({ color: 0xb0b6bc, roughness: 0.3, metalness: 0.7 }),
    }));
    add(box({ size: [hoodX1 - hoodX0, 0.4, 0.16], pos: [(hoodX0 + hoodX1) / 2, 2.25, -9.35], mat: M_STEEL }));

    // Prep benches
    for (const [bx, bz] of [[18.5, 4.6], [22, 4.6], [18.5, 6.8]]) {
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

    /* Strip lights the whole way down, unglamorous and even.
     *
     * Seven of them at 2.2 over a floor that was mixing 0.35 roughness with
     * 0.18 metalness came out at a mean of 160 with a seventh of the frame
     * clipped to white: a kitchen you cannot look at, next door to a dining
     * room the whole mission is about being able to see faces in. The floor
     * is the bigger half of it -- see `preTile` -- and the tubes come down to
     * match. */
    for (const lz of [4, -2, -8, -14]) {
      for (const lx of [18, 25]) {
        if (lz === 4 && lx === 25) continue;
        // Flush to the ceiling. At CEIL_BACK-0.14 it hung 100mm under it.
        add(box({ size: [0.14, 0.08, 1.6], pos: [lx, CEIL_BACK - 0.04, lz], mat: mat({ color: 0xeef2f6, roughness: 1, emissive: 0xd0e0f0, emissiveIntensity: 0.7 }) }));
        const l = pointLight(0xdce8f4, 1.4);
        l.position.set(lx, CEIL_BACK - 0.3, lz);
        l.distance = 11;
        add(l);
        houseLights.push({ light: l, back: true });
      }
    }

    /* One fitting over the ramp well, which was a black hole in the floor of
     * a lit room: the cellar's tubes are under the ceiling you just came up
     * through and light none of it. */
    add(box({
      size: [0.14, 0.08, 1.4], pos: [17.6, CEIL_BACK - 0.04, 1], mat: mat({ color: 0xeef2f6, roughness: 1, emissive: 0xd0e0f0, emissiveIntensity: 0.7 }),
    }));
    const rampLight = pointLight(0xdce8f4, 2.1);
    rampLight.position.set(17.6, CEIL_BACK - 0.3, 1);
    rampLight.distance = 12;
    add(rampLight);
    houseLights.push({ light: rampLight, back: true });

    /* ---- the way out to the floor, painted on the floor ----
     *
     * The playtest note was blunt: coming up out of the cellar into a working
     * kitchen, nothing says which way the dining room is. Working kitchens
     * answer this the same way everywhere — a painted walkway lane — so one
     * runs from the top of the ramp, east of the pass, along the aisle between
     * pass and line, to the swing doors. Worn safety yellow, flat on the tile,
     * no collider. A lit FLOOR plate over the swing doors on the kitchen side
     * finishes the sentence, and its twin in the corridor points the turn
     * north (facing −x, +z is on your LEFT). */
    const M_LANE = mat({ color: 0x8a742c, roughness: 0.95 });
    const lane = [
      [20.6, 0.8], [22.6, -3.2], [22.6, -8.35], [16.4, -7.9], [15.3, -7.8],
    ];
    for (let i = 0; i + 1 < lane.length; i++) {
      const [x0, z0] = lane[i];
      const [x1, z1] = lane[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const stripe = box({
        size: [0.14, 0.008, len + 0.14],
        pos: [(x0 + x1) / 2, 0.012, (z0 + z1) / 2],
        rotY: Math.atan2(x1 - x0, z1 - z0),
        mat: M_LANE, cast: false,
      });
      stripe.name = 'service-lane';
      add(stripe);
    }
    const floorTex = printed('silver-floor-plate', ['FLOOR'], {
      w: 256, h: 110, bg: '#141410', fg: '#c8b070', border: '#5a4a28',
      font: '800 54px "Trebuchet MS", sans-serif',
    });
    const floorPlate = sign(floorTex, 1.1, 0.45, { x: 15.16, y: 2.4, z: -7.8, rotY: Math.PI / 2, emissive: '#c8b070', intensity: 0.4 });
    floorPlate.name = 'floor-plate';
    add(floorPlate);
    const floorTurnTex = printed('silver-floor-turn', ['← FLOOR'], {
      w: 256, h: 110, bg: '#141410', fg: '#c8b070', border: '#5a4a28',
      font: '800 50px "Trebuchet MS", sans-serif',
    });
    const floorTurn = sign(floorTurnTex, 1.1, 0.45, { x: 9.94, y: 2.2, z: -7.8, rotY: Math.PI / 2, emissive: '#c8b070', intensity: 0.4 });
    floorTurn.name = 'floor-plate';
    add(floorTurn);
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
    /* East wall of the corridor above the cellar, with the prep doorway in it.
     * North of the ramp well: at z 1.6..4.4 the near half of the opening was
     * over a three-metre drop into the cellar. */
    wallGap('z', 15, -2, 8, 3.4, 6.2, CEIL_BACK, M_TILE, 0.25);
    wall(15, 8, 15, 26, CEIL_BACK, M_WAINSCOT, 0.25);

    anchors.corridorMid = new THREE.Vector3(12.5, 0, 6);
    anchors.serviceBar = new THREE.Vector3(12.4, 0, 10.5);
    anchors.coatCheck = new THREE.Vector3(12.4, 0, 20);
    anchors.curtain = new THREE.Vector3(10.4, 0, 24);

    /* The service bar, working side out.
     *
     * It was built as a hatch: a counter with its serving lip and its whole
     * back-bar pressed against x=15, which on this side of the building is
     * 250mm of solid wainscot with a wine cellar behind it. Nothing was ever
     * going to be passed through it. Turned round instead — the gantry is
     * against the wall where a back-bar goes, the bottles stand on it, and the
     * brass lip and the glasses face the corridor, which is where the waiters
     * are.
     *
     * The tops all sit at 1.165: the counter is 70mm thick centred at 1.13,
     * and both prop makers take the height of the surface the thing stands on.
     * At 1.16 the bottles were 5mm into the brass and at 1.17 the glasses were
     * 5mm above it. */
    const BAR_TOP = 1.165;
    add(box({ size: [0.5, 1.1, 4.2], pos: [14.6, 0.55, 10.5], mat: M_DARKWOOD }));
    add(box({ size: [0.6, 0.07, 4.4], pos: [14.5, 1.13, 10.5], mat: M_BRASS }));
    // Shelf above, against the wall, which is what a back-bar actually is
    add(box({ size: [0.28, 0.05, 4.2], pos: [14.72, 1.72, 10.5], mat: M_DARKWOOD }));
    solid(14.3, 8.4, 14.95, 12.6, 0, 1.2);
    for (let i = 0; i < 5; i++) {
      add(makeWhiskeyBottle(M, { x: 14.72, y: BAR_TOP, z: 9 + i * 0.7 }));
    }
    for (let i = 0; i < 8; i++) {
      add(makeShotGlass(M, { x: 14.32, y: BAR_TOP, z: 8.8 + i * 0.45 }));
    }
    const barLight = pointLight(0xffcb8a, 2.2);
    barLight.position.set(13.6, 2.3, 10.5);
    barLight.distance = 8;
    add(barLight);
    houseLights.push({ light: barLight, back: true });

    /* Coat check: a counter, a rail, ninety-two numbered tickets.
     *
     * Pulled 700mm off the wall so there is a staff side to it. There was not
     * one before — the counter was hard against x=15 and the rail was at 15.6,
     * which is 600mm inside the wainscot, so every coat in the building was
     * hanging in masonry. */
    add(box({ size: [0.5, 1.1, 3.4], pos: [13.9, 0.55, 20], mat: M_DARKWOOD }));
    add(box({ size: [0.72, 0.07, 3.6], pos: [13.9, 1.13, 20], mat: M_BRASS }));
    solid(13.6, 18.2, 14.25, 21.8, 0, 1.2);
    const railG = group('coat-rail');
    railG.add(cylinder({ r: 0.03, h: 3.2, pos: [0, 1.75, 0], mat: M_BRASS, rotX: Math.PI / 2 }));
    for (let i = 0; i < 16; i++) {
      railG.add(box({
        size: [0.34, 0.95, 0.1], pos: [0, 1.24, -1.5 + i * 0.2],
        mat: mat({ color: pick([0x24242c, 0x3a2a20, 0x2a3040, 0x1e1e24]), roughness: 0.92 }),
      }));
    }
    railG.position.set(14.6, 0, 20);      // behind the counter, in front of the wall
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
      add(box({ size: [0.5, 0.1, 0.5], pos: [12.4, CEIL_BACK - 0.05, lz], mat: mat({ color: 0x2a2a30, roughness: 0.9 }) }));
      houseLights.push({ light: l, back: lz < 6 });
    }

    /* The curtain: heavy, floor to lintel, and the last thing between you and
     * it. Floor to *lintel*, which is 2.05 — at 3.1 it went 350mm through a
     * 2.75 ceiling and hung in the corridor above. */
    const curtain = group('curtain');
    for (let i = 0; i < 6; i++) {
      curtain.add(box({
        size: [0.14, DOOR_H, 0.5], pos: [0, DOOR_H / 2, -1.25 + i * 0.5],
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
    /* The north wall, in the two stretches either side of the lobby.
     *
     * It used to run -30..10 in one piece, straight across the front-of-house
     * doorway that the lobby punches into the same plane thirty lines below —
     * so the dining room had an opening drawn in it with a solid panelled wall
     * standing in the opening, and the only way in from the lobby was through
     * the staff corridor. Same mistake as the prep doorway: two `wallGap`s on
     * one line is one wall too many, and each owns its own stretch now. */
    wall(-30, 26.2, -9, 26.2, CEIL_FLOOR, M_PANEL, 0.3);
    wall(9, 26.2, 10, 26.2, CEIL_FLOOR, M_PANEL, 0.3);
    wall(-30, -16.2, -26, -16.2, CEIL_FLOOR, M_PANEL, 0.3);
    // East wall, with the curtain doorway already punched by the corridor
    wall(10.1, -8, 10.1, 22.4, CEIL_FLOOR, M_PANEL, 0.3);
    wall(10.1, 25.6, 10.1, 26.2, CEIL_FLOOR, M_PANEL, 0.3);
    /* The south edge, east of the stage.
     *
     * The dining room's carpet stops at z=-8 and the stage only covers x
     * -26..-6, so from x=-6 to x=10 the room ended in fifteen and a half
     * metres of open edge onto nothing — you walked off the floor of the club
     * into the void, in the direction the restrooms are signposted. It is a
     * wall now, with the two doorways that were already drawn twelve metres
     * further south lined up on it. */
    wallGap('x', -8.1, -6.2, 0, -3.4, -1.6, CEIL_FLOOR, M_PANEL, 0.3);
    wallGap('x', -8.1, 0, 10.1, 3, 4.8, CEIL_FLOOR, M_PANEL, 0.3);

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

    /* Pelmet and proscenium, and one warm fitting tucked behind the pelmet.
     *
     * Before the band, `lighting.stage` is zero and the five spots with it, so
     * the thing the whole seated half of the evening is pointed at was 79%
     * black from his chair: a closed curtain in an unlit hole, at the end of a
     * room lit warm enough to read a face in. This one is a house fitting and
     * is not on the stage dimmer — it is the pelmet wash that says there is a
     * stage there, and it stays on when the spots come up. */
    add(box({ size: [21, 1.1, 0.5], pos: [-16, 4.9, -9.4], mat: M_VELVET }));
    const pelmet = pointLight(0xffc98a, 0.9, 20);
    // A metre clear of the velvet: any closer and it is a hotspot, not a wash
    pelmet.position.set(-16, 4.35, -8.3);
    add(pelmet);
    houseLights.push({ light: pelmet });
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
    /* Every laid table with its actual chairs: { x, z, seats: [{x, z, yaw}] }.
     * The diners are dealt onto these, so a person sitting down in this room
     * is sitting on a chair that exists, at the table the chair belongs to —
     * rather than at ±1.15m of the centre, which was usually the gap between
     * two chairs and occasionally the inside of one. */
    anchors.tableSeats = [];
    const seatsAt = [];
    const tableTop = mat({ color: 0xece7dc, roughness: 0.95 });
    function diningTable(x, z, seats = 4, { r = 0.72, seatBase = 0.4, seatR = null, reserved = false } = {}) {
      const g = group('table');
      g.add(cylinder({ r: 0.09, h: 0.72, pos: [0, 0.36, 0], mat: M_DARKWOOD }));
      g.add(cylinder({ r: 0.36, h: 0.05, pos: [0, 0.03, 0], mat: M_DARKWOOD }));
      g.add(cylinder({ r, h: 0.05, pos: [0, 0.74, 0], mat: tableTop }));
      // The cloth hangs; a tabletop with no skirt reads as a mushroom
      g.add(cylinder({ rTop: r, rBottom: r * 0.94, h: 0.46, pos: [0, 0.52, 0], mat: tableTop }));
      // The shaded lamp, which is the whole look of the room
      g.add(cylinder({ r: 0.05, h: 0.2, pos: [0, 0.86, 0], mat: M_BRASS }));
      g.add(cylinder({ rTop: 0.1, rBottom: 0.15, h: 0.19, pos: [0, 1.03, 0], mat: M_SHADE }));
      /* The shade glows whatever happens -- that is what you see from across
       * the room -- but only the nearest handful actually cast light. Thirty
       * live point lights in a forward renderer are thirty per-pixel terms in
       * every shader in the scene, and twenty-four of them are lighting a
       * tablecloth nobody is looking at.
       *
       * The bulb sits *above* the shade rather than inside it. A point light
       * ten centimetres from a surface is inverse-square fire whatever its
       * wattage: at (x, 1.0, z) it scorched its own shade and the cloth under
       * it to white, bloom picked the whole blob up, and the person across
       * the table was a silhouette behind a flare. */
      const l = pointLight(0xffb45e, 0.6, 5.2);
      l.position.set(x, 1.55, z);
      l.intensity = 0;
      add(l);
      lamps.push({ light: l, x, z });
      g.position.set(x, 0, z);
      add(g);
      solid(x - r, z - r, x + r, z + r, 0, 0.8);
      anchors.tables.push(new THREE.Vector3(x, 0, z));
      const placed = [];
      for (let i = 0; i < seats; i++) {
        const a = (i / seats) * Math.PI * 2 + seatBase;
        const ring = seatR ?? (r + 0.5);
        const sx = x + Math.sin(a) * ring;
        const sz = z + Math.cos(a) * ring;
        /* The column guard tests the TABLE. Its chairs stand half a metre
         * further out, so a table that just cleared a column could still deal
         * a chair into the oak — which is exactly what the pillar-adjacent
         * tables did. A chair that would foul a column is not laid. */
        if (COLUMNS.some(([cx, cz]) => Math.abs(sx - cx) < 0.78 && Math.abs(sz - cz) < 0.78)) continue;
        add(makeChair(M, { x: sx, y: 0, z: sz, rotY: a + Math.PI }));
        seatsAt.push({ x: sx, z: sz, yaw: a + Math.PI });
        placed.push({ x: sx, z: sz, yaw: a + Math.PI });
      }
      if (!reserved) anchors.tableSeats.push({ x, z, seats: placed });
      g.userData.seats = placed;
      return g;
    }

    /* A packed floor: rows that leave a service lane down the middle.
     *
     * The jitter is applied first and then tested, because testing the grid
     * position and laying the table 400mm away from it is how three tables
     * ended up inside the four columns — a 800mm oak post through the middle
     * of a laid table, with two of the chairs entirely inside it. The old
     * `tx > 4 && tz > 18` guard for the host station never fired at all: the
     * grid tops out at x=-3.4.
     */
    const COLUMNS = [[-8, 6], [-8, 16], [-20, 6], [-20, 16]];
    const inAColumn = (x, z) => COLUMNS.some(([cx, cz]) => Math.abs(x - cx) < 1.45
      && Math.abs(z - cz) < 1.45);
    const tableJitter = (row, col, salt) => {
      /* Stable integer hash: the dining room is authored scenery, not a new
       * procedural floor plan every time the player reloads a checkpoint. */
      let n = ((row + 1) * 73856093) ^ ((col + 1) * 19349663) ^ (salt * 83492791);
      n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
      n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
      n ^= n >>> 16;
      return ((n >>> 0) / 4294967295) * 0.8 - 0.4;
    };
    const carryAt = (k) => {
      const u = 1 - k;
      const [a, m, z] = TABLE_CARRY_ROUTE;
      return new THREE.Vector3(
        u * u * a.x + 2 * u * k * m.x + k * k * z.x,
        0,
        u * u * a.z + 2 * u * k * m.z + k * k * z.z,
      );
    };
    const inCarryLane = (x, z) => {
      for (let i = 0; i <= 20; i++) {
        const p = carryAt(i / 20);
        /* Table radius + carrier + elbow room. */
        if (Math.hypot(x - p.x, z - p.z) < 2.05) return true;
      }
      return false;
    };
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const tx = -25 + col * 5.4 + tableJitter(row, col, 1);
        const tz = -4.5 + row * 5.4 + tableJitter(row, col, 2);
        if (inAColumn(tx, tz)) continue;
        if (Math.hypot(tx - 0.5, tz - 24.2) < 4) continue;   // keep the host station clear
        if (Math.abs(tx - (-16)) < 3 && tz < -2) continue;   // and the front of the stage
        if (inCarryLane(tx, tz)) continue;                    // two staff and a table pass here
        if (Math.hypot(tx - (-8.6), tz - 1.6) < 2.6) continue; // the crew's table is authored below
        diningTable(tx, tz, col % 2 ? 4 : 2);
      }
    }

    /* A low-contrast burgundy runner makes the service line legible without
     * spoiling the reveal. Eight short pieces follow the same curve the table
     * and camera use; they are decorative and deliberately have no collider. */
    const runnerMat = mat({ color: 0x32161b, roughness: 0.98 });
    let lastRunner = carryAt(0);
    for (let i = 1; i <= 8; i++) {
      const next = carryAt(i / 8);
      const dx = next.x - lastRunner.x;
      const dz = next.z - lastRunner.z;
      const runner = box({
        name: 'front-service-runner',
        size: [0.92, 0.018, Math.hypot(dx, dz) + 0.06],
        pos: [(lastRunner.x + next.x) / 2, 0.012, (lastRunner.z + next.z) / 2],
        rotY: Math.atan2(dx, dz),
        mat: runnerMat,
        cast: false,
      });
      add(runner);
      lastRunner = next;
    }

    /* The table by the pillar, laid by hand. The men who send the champagne
     * sit at it, so its four chairs are the four seats the cast puts them in
     * — `anchors.crewSeats` hands the exact chair positions across — instead
     * of the grid dropping its own four-top somewhere near the spot and the
     * crew sitting half in the cloth with spare chairs through their backs.
     * `reserved` keeps it off the diner deal, because those seats are taken. */
    const crewTable = diningTable(-8.6, 1.6, 4, { r: 0.72, seatBase: 0.6, seatR: 1.2, reserved: true });
    anchors.crewSeats = crewTable.userData.seats;
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
    for (const [cx, cz] of COLUMNS) {
      add(box({ size: [0.8, CEIL_FLOOR, 0.8], pos: [cx, CEIL_FLOOR / 2, cz], mat: M_WAINSCOT }));
      solid(cx - 0.4, cz - 0.4, cx + 0.4, cz + 0.4, 0, CEIL_FLOOR);
      for (const [ox, oz, ry] of [[0.42, 0, Math.PI / 2], [-0.42, 0, -Math.PI / 2]]) {
        add(makeFrame(M, { x: cx + ox, y: 1.9, z: cz + oz, rotY: ry, w: 0.4, h: 0.5 }));
      }
    }

    /* Sconces. A forty-metre room lit only from the middle of the ceiling has
     * dark walls and dark faces at every table against them, and the brief on
     * this was explicit: not so dark that you cannot read a face or a prompt.
     * Brass, shaded, at head height, all the way round — and ON the walls:
     * the first pass hung them 250–450mm out into the room, a ring of light
     * fittings floating in mid-air. Each sits at its wall's inner face now,
     * stem into the plaster. */
    for (const [sx, sz, ry] of [
      [-30.0, -2, Math.PI / 2], [-30.0, 6, Math.PI / 2], [-30.0, 14, Math.PI / 2], [-30.0, 22, Math.PI / 2],
      [9.92, -4, -Math.PI / 2], [9.92, 6, -Math.PI / 2], [9.92, 16, -Math.PI / 2], [9.92, 24, -Math.PI / 2],
      [-24, 26.0, Math.PI], [-14, 26.0, Math.PI], [-4, 26.0, Math.PI],
    ]) {
      const sc = group('sconce');
      sc.add(cylinder({ r: 0.04, h: 0.3, pos: [0, 0, 0], mat: M_BRASS, rotX: 0.5 }));
      sc.add(cylinder({
        rTop: 0.13, rBottom: 0.09, h: 0.2, pos: [0, 0.2, 0.06], mat: M_SHADE,
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

    /* Framed photographs, the length of the north wall — hung on it, not
     * eleven centimetres off it. The wall's inner face is 26.05 and a frame's
     * back sits 35mm behind its origin. Same arithmetic for the clock. */
    for (let i = 0; i < 9; i++) {
      add(makeFrame(M, { x: -26 + i * 3.6, y: 2.1, z: 26.01, rotY: Math.PI, w: 0.5, h: 0.62 }));
    }
    add(makeWallClock(M, { x: 9.94, y: 3.2, z: 14, rotY: -Math.PI / 2 }));
    for (const [px, pz] of [[-28.4, 24], [8.2, 24.6]]) add(makePlant(M, { x: px, y: 0, z: pz }));

    /* ---- the back corridor, the restrooms and the manager's station ----
     *
     * Three rooms were listed in the plan and none of them was built: two
     * floor planes, no walls, no ceiling and not one light between them, at
     * the end of two doorways the dining room advertises. The brief is not
     * three more rooms — it is that the doorways go somewhere, and that
     * somewhere is lit. So: a service corridor behind the dining room's south
     * wall, walled and lit, with the restrooms and the office off it, dressed
     * only as far as a door and a bulb.
     */
    const SV = ROOMS.service;
    const CEIL_SV = 2.9;
    floor(SV, mat({ color: 0x6a7078, roughness: 0.5 }), 'tile', 0);
    ceiling(SV, mat({ color: 0x2a2c32, roughness: 0.94 }), CEIL_SV);
    /* Its west end is the back of the proscenium. The wall stands on the last
     * 400mm of the stage deck, which is exactly where a stage-right wall goes
     * and is the only line here that clears the proscenium leg at x=-5.8. */
    wall(-6.4, -15.2, -6.4, -8.1, CEIL_FLOOR, M_PANEL, 0.2);
    wall(10.1, -15.2, 10.1, -8.1, CEIL_FLOOR, M_PANEL, 0.3);

    floor(ROOMS.restrooms, mat({ color: 0x6a7078, roughness: 0.4 }), 'tile', 0);
    floor(ROOMS.manager, mat({ color: 0x33251c, roughness: 0.9 }), 'wood', 0);
    ceiling(ROOMS.restrooms, mat({ color: 0x2a2c32, roughness: 0.94 }), CEIL_SV);
    ceiling(ROOMS.manager, mat({ color: 0x2a2c32, roughness: 0.94 }), CEIL_SV);
    wallGap('x', -15.2, -6.4, 0, -3.4, -1.6, CEIL_SV, M_PANEL, 0.25);
    wallGap('x', -15.2, 0, 10.1, 3, 4.8, CEIL_SV, M_PANEL, 0.25);
    // The three sides of the two back rooms that were never there at all
    wall(-6.3, -21.8, -6.3, -15.2, CEIL_SV, M_PANEL, 0.25);
    wall(0.1, -21.8, 0.1, -15.2, CEIL_SV, M_PANEL, 0.25);
    wall(10.1, -21.8, 10.1, -15.2, CEIL_SV, M_PANEL, 0.25);
    wall(0, -21.8, 10.1, -21.8, CEIL_SV, M_PANEL, 0.25);
    hangDoor('manager', {
      axis: 'x', fixed: -15.3, from: 3, to: 4.8, locked: true,
      label: 'the <b>manager’s office</b>',
    });
    anchors.managerDesk = new THREE.Vector3(5, 0, -18.5);
    anchors.rearExit = new THREE.Vector3(-3, 0, -20.6);
    /* The fire door is in the south wall of the restroom lobby, so it is an
     * `x` run at a fixed `z`. As a `z` run at a fixed `x` it was a
     * free-standing steel door leaf lying across the middle of the floor with
     * nothing either side of it, alarmed, three metres from the wall it was
     * supposed to be in. */
    wallGap('x', -21.6, -6.3, 0, -4.4, -1.6, CEIL_SV, M_PANEL, 0.25);
    hangDoor('rear', {
      axis: 'x', fixed: -21.6, from: -4.4, to: -1.6, material: M_STEEL,
      label: 'the <b>rear exit</b>', alarmed: true,
    });

    /* Four bulbs, which is the whole of the dressing: a lit corridor reads as
     * a building that carries on, and an unlit one reads as the edge of the
     * map with a doorway cut in it. */
    for (const [lx, lz] of [[-3.5, -11.5], [5, -11.5], [-3, -18], [5, -18]]) {
      add(box({ size: [0.36, 0.1, 0.36], pos: [lx, CEIL_SV - 0.05, lz], mat: mat({ color: 0x2a2a30, roughness: 0.9 }) }));
      const l = pointLight(0xdcd0b4, 1.5);
      l.position.set(lx, CEIL_SV - 0.28, lz);
      l.distance = 10;
      add(l);
      houseLights.push({ light: l, back: true });
    }

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
    const pedestal = cylinder({ r: 0.09, h: 0.72, pos: [0, 0.36, 0], mat: M_DARKWOOD });
    pedestal.name = 'front-pedestal';
    front.add(pedestal);
    const foot = cylinder({ r: 0.34, h: 0.05, pos: [0, 0.03, 0], mat: M_DARKWOOD });
    foot.name = 'front-foot';
    front.add(foot);
    /* A real bare table comes out first. The first cutscene used to hide the
     * top, so the staff carried a pedestal across the room and a white disc
     * appeared only once it landed. The linen is a second, paper-thin top
     * laid over this one with the skirt. */
    const top = cylinder({ r: 0.68, h: 0.05, pos: [0, 0.74, 0], mat: M_DARKWOOD });
    top.name = 'front-top';
    front.add(top);
    const clothTop = cylinder({ r: 0.69, h: 0.012, pos: [0, 0.771, 0], mat: cloth, cast: false });
    clothTop.name = 'front-cloth-top';
    clothTop.visible = false;
    front.add(clothTop);
    const skirt = cylinder({ rTop: 0.68, rBottom: 0.64, h: 0.46, pos: [0, 0.52, 0], mat: cloth });
    skirt.name = 'front-cloth';
    skirt.visible = false;                      // laid during the cutscene
    front.add(skirt);

    const lampG = group('front-lamp');
    lampG.add(cylinder({ r: 0.05, h: 0.2, pos: [0, 0.86, 0], mat: M_BRASS }));
    lampG.add(cylinder({ rTop: 0.1, rBottom: 0.15, h: 0.19, pos: [0, 1.03, 0], mat: M_SHADE }));
    lampG.visible = false;
    front.add(lampG);
    /* Above the shade, same as every other lamp in the room: this is the one
     * fitting the player spends twenty minutes eighty centimetres from, and
     * it must light her face, not flare over it. Its height and wattage are
     * held by a measured check in verify-silver — the renderer is sampled
     * from his chair and the white pool under the lamp is counted in pixels. */
    const frontLight = pointLight(0xffb45e, 0.55, 4.8);
    frontLight.intensity = 0;               // lit last, which is what makes it a table
    frontLight.position.set(0, 1.55, 0);
    front.add(frontLight);

    // Two settings, hidden until a waiter lays them
    const settings = [];
    for (const side of [-1, 1]) {
      const s = group('setting');
      s.add(cylinder({ r: 0.13, h: 0.012, pos: [0, 0.775, 0], mat: mat({ color: 0xf6f3ec, roughness: 0.4 }) }));
      s.add(box({ size: [0.015, 0.006, 0.14], pos: [-0.19, 0.775, 0], mat: mat({ color: 0xc8ccd4, roughness: 0.24, metalness: 0.85 }) }));
      s.add(box({ size: [0.015, 0.006, 0.14], pos: [0.19, 0.775, 0], mat: mat({ color: 0xc8ccd4, roughness: 0.24, metalness: 0.85 }) }));
      s.add(cylinder({ rTop: 0.045, rBottom: 0.028, h: 0.11, pos: [0.15, 0.83, -0.16], mat: M_GLASS }));
      /* Laid across the table rather than along it, because that is where the
       * chairs are now: the two of them sit either side of the stage axis
       * rather than one in front of the other. */
      s.position.set(side * 0.44, 0, 0);
      s.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
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
  anchors.frontTable = TABLE_CARRY_ROUTE[2].clone();
  /**
   * The two chairs, either side of the line between the table and the stage.
   *
   * They used to be one behind the other on that line, and the seated view was
   * pointed down it — which meant the whole seated half of the mission was
   * spent looking at a closed curtain with her sitting behind his head, outside
   * the yaw clamp, unlookable-at while she talked. Across the table instead:
   * she is dead centre of the view, the stage is a ninety-degree turn away and
   * inside the clamp, and nobody has to be told which one to look at.
   *
   * `yaw` faces an object (+z at zero); `faceYaw` faces the camera (-z at
   * zero). They are a half-turn apart on purpose — the two conventions are not
   * the same and pretending they are is how she ended up facing the wall.
   */
  /*
   * 1.02m out from the middle rather than 0.75m. The cloth on this table falls
   * to a radius of 0.68 and a chair is 0.32 from its own centre to the outside
   * of a castor, so at 0.75 both chairs were a quarter of a metre inside the
   * tablecloth — the linen through the seat, the castors through the skirt.
   * At 1.02 the castors just clear the cloth, which is a chair pulled in to
   * the table. (`verify-silver` holds them between 1m and 2.2m apart, so 1.1
   * is the ceiling and there is not much room above this.)
   */
  anchors.frontSeats = [
    { x: -14.98, z: -5.2, yaw: -Math.PI / 2, faceYaw: Math.PI / 2 },   // his: looking at her, stage a quarter-turn right
    { x: -17.02, z: -5.2, yaw: Math.PI / 2, faceYaw: -Math.PI / 2 },   // hers: looking at him
  ];
  /** Where the seated view has to be able to reach: the middle of the stage. */
  anchors.frontSeatStageYaw = Math.atan2(
    -(anchors.stageCentre.x - anchors.frontSeats[0].x),
    -(anchors.stageCentre.z - anchors.frontSeats[0].z),
  );
  /* Where the staff pick the table up. In the service lane between the two
   * ranks of tables — it used to be at (-9.5, 0.5), which is 640mm inside a
   * laid four-top, so the manager stood in a table to look at a table. */
  anchors.tableStaging = TABLE_CARRY_ROUTE[0].clone();

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
   * Nothing may ever hand somebody a floor that is over their head — a ramp
   * is a floor to the man on it and a soffit to the man under it, and the
   * teleport this scene shipped with was `groundAt` failing to tell them
   * apart. It is not decided here, though, and the attempt is written down
   * because it was tried and is wrong: refusing a ramp more than a step above
   * `fromY` reads a number that the *controller* smooths, so anything that
   * places a man on a ramp rather than walking him onto it — a checkpoint, a
   * cutscene, the headless driver — asks with a height a metre and a half
   * stale and gets told the ramp it is standing on is a ceiling. It is
   * decided by concrete instead: the well has an end wall and both ramps have
   * a haunch under them, so there is nowhere left to stand underneath one.
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
    /* Raised floors. `floor()` has always recorded these and nothing has ever
     * read one, which is why the pavement was a step the camera went up and
     * the feet did not: he walked the whole frontage shin-deep in his own
     * paving, and the only reason it was survivable is that nothing else in
     * the building is raised by less than a stage. Sunken floors are the
     * cellar's business and are answered below, against `fromY`. */
    for (const p of platforms) {
      if (p.y <= 0) continue;
      if (x >= p.box.min.x && x <= p.box.max.x && z >= p.box.min.z && z <= p.box.max.z) return p.y;
    }
    if (fromY > CELLAR_Y / 2) return 0;              // upstairs, and staying there
    /* `WELL` is not a room in the plan and has no floor mesh of its own — the
     * entry ramp is its floor. It is in this list because the answer for
     * somebody already below grade at the foot of that ramp must be the
     * cellar's slab and not the street's asphalt, which is what it was, and
     * which is what launched him back up beside the bar. The end wall is what
     * stops him getting here at all; this is what it costs if he ever does. */
    for (const r of [ROOMS.cellar, ROOMS.drystore, ROOMS.walkin, WELL]) {
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
