/**
 * THE COMBAT LAB -- level geometry for the combat test map.
 *
 * A gunnery school on a flat concrete pad: a six lane range, a wall of test
 * materials to shoot holes in, a two storey killhouse, a cover yard, a 100m
 * sniper lane and a sheltered armory wall. Nothing in here knows about the
 * player, the NPCs, the weapons or the HUD -- it builds the world, hands back
 * the collision/nav data and the shootable meshes, and lets the scene module
 * populate it.
 *
 * PLAN (north is -z, east is +x; the pad is 80m across by 120m deep)
 *
 *      -z  NORTH
 *      +--------------------------------------------------------------+
 *      |   [BACKSTOP BERM]                              |            | |
 *      |   ####################                         |   L        | |
 *      |   | 6 FIRING LANES   |   50m frames            |   O   gong | |
 *      |   |  == fast rail == |   40m                   |   N        | |
 *      |   |  -- slow rail -- |   25m                   |   G        | |
 *      |   |   frames 10m     |                         |            | |
 *      |   [BENCH]  z=-8      |  [MATERIAL WALL z=-20]  |   L        | |
 *      |                      |   drywall wood glass    |   A        | |
 *      |                      |   metal brick concrete  |   N        | |
 *      |          +-----------------------+             |   E        | |
 *      |          |      KILLHOUSE        |             |            | |
 *      |  [ARM]   |  hall / main / rooms  |             |   100m     | |
 *      |  [ORY]   |  stair -> upper floor |             |            | |
 *      |  [WALL]  +-----------------------+             |   ^ fire   | |
 *      |   P>     |      COVER YARD       |             |   | pt     | |
 *      |          |  barriers  drums cars |             |            | |
 *      |          +--------[GATE]---------+             |            | |
 *      +--------------------------------------------------------------+
 *      +z  SOUTH
 *
 * IMPORT RULES. This module imports 'three' and nothing else. No `document`
 * anywhere in the graph, so `node tests/run.mjs`'s three-shim can load it
 * headlessly -- the same rule src/core/weapons/build.js follows, and the reason
 * the local box/cylinder/mat helpers below are copied rather than imported from
 * src/world/build.js (that one is reached through world/textures.js, which
 * builds canvas materials at import time).
 *
 * GROUNDAT AND TWO STOREYS. `groundAt(x, z)` is single valued, so directly
 * under the balcony or the loft it reports the UPPER floor -- that is what the
 * AI and the tests want ("what is the top walkable surface here"). A first
 * person controller must not teleport up a storey when it walks under the
 * balcony, so groundAt takes an optional third argument: the height the query
 * is being made FROM. Pass the player's current ground and it resolves to the
 * highest surface within one step of the feet:
 *
 *     world.groundAt = (x, z) => lab.groundAt(x, z, player.ground);
 *
 * Colliders are per storey (a ground floor wall spans y 0..3.2, an upper floor
 * wall 3.5..6.5), which is what makes src/core/player.js's y-window test in
 * `_resolve()` do the right thing on both floors.
 */
import * as THREE from 'three';

/* ================================================================== */
/* Local build helpers -- shared unit geometry, cached materials.       */
/* ================================================================== */

const _boxGeo = new THREE.BoxGeometry(1, 1, 1);
const _cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
const _geoCache = new Map();
const _matCache = new Map();

/** A shared MeshStandardMaterial, keyed by its parameters. */
function mat(params = {}) {
  const key = JSON.stringify(params);
  const hit = _matCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...params });
  _matCache.set(key, m);
  return m;
}

function cylGeo(seg) {
  if (seg === 14) return _cylGeo;
  const key = `c${seg}`;
  let g = _geoCache.get(key);
  if (!g) { g = new THREE.CylinderGeometry(1, 1, 1, seg); _geoCache.set(key, g); }
  return g;
}

function b3(x0, y0, z0, x1, y1, z1, pad = 0.02) {
  return new THREE.Box3(
    new THREE.Vector3(Math.min(x0, x1) - pad, Math.min(y0, y1), Math.min(z0, z1) - pad),
    new THREE.Vector3(Math.max(x0, x1) + pad, Math.max(y0, y1), Math.max(z0, z1) + pad),
  );
}

function v3(x, z) {
  const v = new THREE.Vector3(x, 0, z);
  if (v.lengthSq() > 0) v.normalize();
  return v;
}

/** Yaw such that an actor at `from` looks toward `to` (matches player.yaw). */
function yawToward(fx, fz, tx, tz) {
  return Math.atan2(-(tx - fx), -(tz - fz));
}

const PALETTE = {
  berm: mat({ color: 0x7a6a4c, roughness: 1 }),
  pad: mat({ color: 0x8c8a84, roughness: 0.96 }),
  concrete: mat({ color: 0x9a978f, roughness: 0.94 }),
  concreteDark: mat({ color: 0x63615c, roughness: 0.95 }),
  drywall: mat({ color: 0xd9d3c6, roughness: 0.95 }),
  ply: mat({ color: 0xb98a4e, roughness: 0.88 }),
  plyDark: mat({ color: 0x8a6236, roughness: 0.9 }),
  wood: mat({ color: 0x6f4d29, roughness: 0.85 }),
  woodDark: mat({ color: 0x4a3520, roughness: 0.85 }),
  steel: mat({ color: 0x9aa0a6, roughness: 0.38, metalness: 0.7 }),
  steelDark: mat({ color: 0x4c5257, roughness: 0.5, metalness: 0.6 }),
  rust: mat({ color: 0x7d4a2c, roughness: 0.95 }),
  glass: mat({
    color: 0xa8c8d0, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.3,
  }),
  brick: mat({ color: 0x8e4a38, roughness: 0.95 }),
  sandbag: mat({ color: 0x9b8c63, roughness: 1 }),
  paper: mat({ color: 0xf1ecdc, roughness: 0.95 }),
  paint: mat({ color: 0xc4402f, roughness: 0.85 }),
  paintWhite: mat({ color: 0xe6e2d6, roughness: 0.85 }),
  paintYellow: mat({ color: 0xd6b13a, roughness: 0.85 }),
  carBlue: mat({ color: 0x35566f, roughness: 0.55, metalness: 0.4 }),
  carTan: mat({ color: 0x8b7c58, roughness: 0.6, metalness: 0.35 }),
  carRed: mat({ color: 0x7a2f28, roughness: 0.6, metalness: 0.35 }),
  carGlass: mat({
    color: 0x2a3a42, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.55,
  }),
  rubber: mat({ color: 0x17181a, roughness: 1 }),
  fabric: mat({ color: 0x5a4a3c, roughness: 1 }),
  brass: mat({ color: 0xb08a30, roughness: 0.3, metalness: 0.85 }),
  bulb: mat({
    color: 0x000000, emissive: 0xffe6bb, emissiveIntensity: 1.8, roughness: 1,
  }),
};

/* ================================================================== */
/* Named layout constants.                                              */
/*                                                                      */
/* Rectangles are {x, z, w, d} with x/z the CENTRE and w/d the full      */
/* width (x) and depth (z). `rectMin`/`rectMax`/`inRect` below turn them */
/* into extents so the AI and the tests do not each re-derive them.      */
/* ================================================================== */

const UPPER_Y = 3.5;
const GROUND_CEIL = 3.2;
const UPPER_CEIL = 6.5;
const ROOF_Y = 6.8;
const RAIL_H = 1.1;

const T_EXT = 0.3; // exterior wall thickness
const T_INT = 0.2; // interior partition thickness

/* Killhouse shell, in absolute coordinates. */
const KH = { x0: -11, x1: 11, z0: -4, z1: 12 };
/* Stair well: two flights of 5m with a 1.2m landing, climbing north. */
const ST = { x0: 8.7, x1: 10.7, bottomZ: 11.6, landZ0: 5.4, landZ1: 6.6, topZ: 0.4 };
const LAND_Y = UPPER_Y / 2;

export const LAB = Object.freeze({
  /** Whole pad. 80m across (x), 120m deep (z). */
  BOUNDS: Object.freeze({ x: 0, z: 0, w: 80, d: 120 }),
  GROUND_Y: 0,
  UPPER_Y,
  GROUND_CEIL,
  UPPER_CEIL,
  ROOF_Y,
  RAIL_H,

  /** Six lane range on the north side; lanes are shot down -z. */
  RANGE: Object.freeze({
    x: -15, z: -33, w: 22, d: 54,
    firingZ: -8,
    laneCount: 6,
    laneWidth: 3,
    laneX: Object.freeze([-22.5, -19.5, -16.5, -13.5, -10.5, -7.5]),
    distances: Object.freeze([10, 25, 50]),
    frameZ: Object.freeze([-18, -33, -58]),
    /* The carrier rails sit just behind the frame line they belong to, so the
     * carriers do not saw through the 25m paper frames on their way past. */
    slowRailZ: -34.6,
    fastRailZ: -48,
    bermZ: -59.5,
  }),

  /** Penetration test panels, 2m apart, shot from the north-east firing line. */
  MATERIAL_WALL: Object.freeze({
    x: 11, z: -20, w: 28, d: 2,
    firingZ: -12,
    spacing: 2,
    panelX: Object.freeze([-2, 0, 2, 4, 6, 8, 10, 12, 14]),
    carX: 19,
    furnitureX: 24,
  }),

  /** Two storey killhouse, 22m x 16m. */
  KILLHOUSE: Object.freeze({ x: 0, z: 4, w: 22, d: 16 }),
  KILLHOUSE_ROOMS: Object.freeze({
    hall: Object.freeze({ x: 0, z: -2.5, w: 22, d: 3 }),
    main: Object.freeze({ x: -5, z: 3.5, w: 12, d: 9 }),
    east: Object.freeze({ x: 6, z: 3.5, w: 10, d: 9 }),
    south: Object.freeze({ x: 4, z: 10, w: 14, d: 4 }),
    southWest: Object.freeze({ x: -7, z: 10, w: 8, d: 4 }),
    upperNorth: Object.freeze({ x: 0, z: -2.5, w: 22, d: 3 }),
    upperCorridor: Object.freeze({ x: 4.85, z: 4.2, w: 7.7, d: 7.6 }),
    upperLoft: Object.freeze({ x: -1.15, z: 10, w: 19.7, d: 4 }),
  }),

  /** Interior balcony over the main room; its rail is a nav blocker. */
  BALCONY: Object.freeze({
    x: -5, z: 0.2, w: 12, d: 2.4, y: UPPER_Y, railY: UPPER_Y + RAIL_H, railZ: 1.4,
  }),

  /** Stair well and its two flights (y varies linearly with z). */
  STAIR: Object.freeze({
    x: (ST.x0 + ST.x1) / 2,
    z: (ST.topZ + ST.bottomZ) / 2,
    w: ST.x1 - ST.x0,
    d: ST.bottomZ - ST.topZ,
    y0: 0,
    y1: UPPER_Y,
    landingY: LAND_Y,
    flights: Object.freeze([
      Object.freeze({
        x0: ST.x0, x1: ST.x1, z0: ST.landZ1, z1: ST.bottomZ, y0: LAND_Y, y1: 0,
      }),
      Object.freeze({
        x0: ST.x0, x1: ST.x1, z0: ST.topZ, z1: ST.landZ0, y0: UPPER_Y, y1: LAND_Y,
      }),
    ]),
    landing: Object.freeze({
      x0: ST.x0, x1: ST.x1, z0: ST.landZ0, z1: ST.landZ1, y: LAND_Y,
    }),
  }),

  /** Open arena south of the killhouse. */
  YARD: Object.freeze({ x: 0, z: 30.5, w: 30, d: 25, gateZ: 43, gateX: 0 }),

  /** 100m sniper lane down the east edge. */
  LANE: Object.freeze({
    x: 30, z: -5, w: 8, d: 100,
    firingZ: 45,
    gongZ: -55,
    marks: Object.freeze([25, 50, 75, 100]),
    markZ: Object.freeze([20, -5, -30, -55]),
  }),

  /** Sheltered wall the scene module hangs the weapon racks on. */
  ARMORY: Object.freeze({ x: -32.6, z: 20, w: 1.2, d: 8, roofY: 3.2 }),

  /** Perimeter. */
  FENCE: Object.freeze({ x: 0, z: 0, w: 78, d: 118, height: 3 }),
});

/** Minimum corner of a LAB rect. */
export function rectMin(r) { return { x: r.x - r.w / 2, z: r.z - r.d / 2 }; }
/** Maximum corner of a LAB rect. */
export function rectMax(r) { return { x: r.x + r.w / 2, z: r.z + r.d / 2 }; }
/** Is (x, z) inside a LAB rect? */
export function inRect(r, x, z) {
  return Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2;
}

/** One step up: how far groundAt will lift a query that supplies its height. */
const STEP_UP = 0.75;

/* ================================================================== */
/* Build context                                                        */
/* ================================================================== */

function makeCtx(root) {
  return {
    group: root,
    colliders: [],
    navBlockers: [],
    floorZones: [],
    hitMeshes: [],
    coverPoints: [],
    floors: [],
    doors: [],

    tag(mesh, material, thickness) {
      mesh.userData.material = material;
      if (thickness !== undefined) mesh.userData.materialThickness = thickness;
      this.hitMeshes.push(mesh);
      return mesh;
    },
    solid(box) { this.colliders.push(box); return box; },
    blocker(box) { this.navBlockers.push(box); return box; },
    /** A flat walkable surface (upper floor, landing, balcony). */
    floor(x0, z0, x1, z1, y) {
      this.floors.push({ x0, x1, z0, z1, y });
    },
    /** A ramp whose height runs linearly with z from y0 at z0 to y1 at z1. */
    ramp(x0, z0, x1, z1, y0, y1) {
      this.floors.push({ x0, x1, z0, z1, y0, y1, axis: 'z' });
    },
    zone(x0, z0, x1, z1, surface, y0 = -0.1, y1 = 0.1) {
      this.floorZones.push({ box: b3(x0, y0, z0, x1, y1, z1, 0), surface });
    },
    cover(id, x, z, facingX, facingZ, height, y = 0) {
      this.coverPoints.push({
        id, x, z, y, facing: v3(facingX, facingZ), height,
      });
    },
  };
}

/**
 * Axis aligned box given by its extents. Registers the mesh as a hit mesh when
 * `material` is given, and as a collider when `solid` is true.
 */
function slab(ctx, o) {
  const w = Math.abs(o.x1 - o.x0);
  const h = Math.abs(o.y1 - o.y0);
  const d = Math.abs(o.z1 - o.z0);
  const m = new THREE.Mesh(_boxGeo, o.mat);
  m.scale.set(Math.max(w, 1e-3), Math.max(h, 1e-3), Math.max(d, 1e-3));
  m.position.set((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, (o.z0 + o.z1) / 2);
  if (o.rotY) m.rotation.y = o.rotY;
  m.castShadow = o.cast ?? (Math.max(w, h, d) >= 1.5);
  m.receiveShadow = o.receive ?? true;
  if (o.name) m.name = o.name;
  (o.parent ?? ctx.group).add(m);
  if (o.material) ctx.tag(m, o.material, o.thickness);
  if (o.solid) ctx.solid(b3(o.x0, o.y0, o.z0, o.x1, o.y1, o.z1));
  if (o.blocker) ctx.blocker(b3(o.x0, o.y0, o.z0, o.x1, o.y1, o.z1, 0));
  return m;
}

/** A vertical cylinder: posts, drums, pipes, the gong. */
function post(ctx, o) {
  const m = new THREE.Mesh(cylGeo(o.seg ?? 14), o.mat);
  m.scale.set(o.r, o.h, o.r);
  m.position.set(o.x, o.y, o.z);
  if (o.rotX) m.rotation.x = o.rotX;
  if (o.rotZ) m.rotation.z = o.rotZ;
  m.castShadow = o.cast ?? (o.h >= 1.5);
  m.receiveShadow = true;
  if (o.name) m.name = o.name;
  (o.parent ?? ctx.group).add(m);
  if (o.material) ctx.tag(m, o.material, o.thickness);
  if (o.solid) {
    ctx.solid(b3(o.x - o.r, o.y - o.h / 2, o.z - o.r, o.x + o.r, o.y + o.h / 2, o.z + o.r));
  }
  return m;
}

/**
 * A wall with openings cut out of it.
 *
 * `axis: 'x'` runs the wall along x at z = `at`; `axis: 'z'` runs it along z at
 * x = `at`. Openings are given in the along-wall coordinate:
 *   { u0, u1 }                  -- a doorway: no geometry, no collider
 *   { u0, u1, sill, head }      -- a window: sill + header geometry, a glass
 *                                 pane, and a full height collider (you can
 *                                 shoot through it, you cannot walk through it)
 */
function wallRun(ctx, o) {
  const {
    axis, at, t = T_INT, u0, u1, y0, y1,
    mat: m, material = 'drywall', thickness, name = 'wall',
    openings = [], solid = true, glass = true,
  } = o;
  const v0 = at - t / 2;
  const v1 = at + t / 2;
  const piece = (a, b, yA, yB, opts = {}) => {
    if (b - a <= 1e-4 || yB - yA <= 1e-4) return null;
    const box = axis === 'x'
      ? { x0: a, x1: b, z0: v0, z1: v1 }
      : { x0: v0, x1: v1, z0: a, z1: b };
    return slab(ctx, {
      ...box, y0: yA, y1: yB, mat: m, material, thickness, name, ...opts,
    });
  };
  const sorted = [...openings].sort((a, b) => a.u0 - b.u0);
  let cursor = u0;
  for (const op of sorted) {
    piece(cursor, op.u0, y0, y1, { solid });
    if (op.sill !== undefined) {
      // Window: sill below, header above, glass in between.
      piece(op.u0, op.u1, y0, op.sill, { solid: false });
      piece(op.u0, op.u1, op.head, y1, { solid: false });
      if (glass) {
        const g = axis === 'x'
          ? { x0: op.u0 + 0.03, x1: op.u1 - 0.03, z0: at - 0.005, z1: at + 0.005 }
          : { x0: at - 0.005, x1: at + 0.005, z0: op.u0 + 0.03, z1: op.u1 - 0.03 };
        slab(ctx, {
          ...g, y0: op.sill, y1: op.head, mat: PALETTE.glass,
          material: 'glass', thickness: 0.01, name: `${name}-glass`, cast: false,
        });
      }
      if (solid) {
        const box = axis === 'x'
          ? b3(op.u0, y0, v0, op.u1, y1, v1)
          : b3(v0, y0, op.u0, v1, y1, op.u1);
        ctx.solid(box);
      }
    } else if (op.head !== undefined) {
      // Doorway with a header over it (harmless: it sits above head height).
      piece(op.u0, op.u1, op.head, y1, { solid: false });
    }
    cursor = op.u1;
  }
  piece(cursor, u1, y0, y1, { solid });
}

/* ================================================================== */
/* Lighting                                                             */
/* ================================================================== */

function buildLights(ctx) {
  const hemi = new THREE.HemisphereLight(0xbcd2e8, 0x6a6250, 0.75);
  hemi.position.set(0, 40, 0);
  ctx.group.add(hemi);

  const key = new THREE.DirectionalLight(0xfff2dc, 1.15);
  key.position.set(48, 62, -34);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const cam = key.shadow.camera;
  cam.near = 10;
  cam.far = 180;
  cam.left = -60;
  cam.right = 60;
  cam.top = 60;
  cam.bottom = -60;
  ctx.group.add(key);
  ctx.group.add(key.target);
  key.target.position.set(0, 0, 0);

  const fill = new THREE.DirectionalLight(0x9fb6d0, 0.35);
  fill.position.set(-50, 34, 46);
  ctx.group.add(fill);

  return { hemi, key, fill };
}

/* ================================================================== */
/* 0. Ground pad and perimeter                                          */
/* ================================================================== */

function buildGround(ctx) {
  slab(ctx, {
    x0: -42, x1: 42, z0: -62, z1: 62, y0: -0.3, y1: 0,
    mat: PALETTE.pad, material: 'concrete', name: 'lab-pad', cast: false,
  });
  // The whole pad reads as concrete unless a more specific zone claims it.
  ctx.zone(-42, -62, 42, 62, 'concrete', -0.4, 0.05);
}

function buildPerimeter(ctx) {
  const X = 39;
  const Z = 59;
  const H = 3;
  const runs = [
    { x0: -X, x1: X, z0: -Z - 0.1, z1: -Z + 0.1, name: 'fence-north' },
    { x0: -X, x1: X, z0: Z - 0.1, z1: Z + 0.1, name: 'fence-south' },
    { x0: -X - 0.1, x1: -X + 0.1, z0: -Z, z1: Z, name: 'fence-west' },
    { x0: X - 0.1, x1: X + 0.1, z0: -Z, z1: Z, name: 'fence-east' },
  ];
  for (const r of runs) {
    slab(ctx, {
      ...r, y0: 0, y1: H, mat: PALETTE.steelDark,
      material: 'metal', thickness: 0.004, solid: true, cast: false,
    });
  }
  // Corner posts and a berm skirt outside the wire so nothing reads as void.
  for (const [px, pz] of [[-X, -Z], [X, -Z], [-X, Z], [X, Z]]) {
    post(ctx, {
      x: px, y: H / 2 + 0.2, z: pz, r: 0.14, h: H + 0.4,
      mat: PALETTE.steel, material: 'metal', name: 'fence-post',
    });
  }
  const skirt = [
    { x0: -42, x1: 42, z0: -62, z1: -Z - 1, name: 'berm-north' },
    { x0: -42, x1: 42, z0: Z + 1, z1: 62, name: 'berm-south' },
    { x0: -42, x1: -X - 1, z0: -Z - 1, z1: Z + 1, name: 'berm-west' },
    { x0: X + 1, x1: 42, z0: -Z - 1, z1: Z + 1, name: 'berm-east' },
  ];
  for (const r of skirt) {
    slab(ctx, {
      ...r, y0: 0, y1: 1.6, mat: PALETTE.berm, material: 'concrete', solid: true,
    });
  }
  // South gate: two leaves either side of the yard entrance.
  for (const sx of [-1, 1]) {
    slab(ctx, {
      x0: sx > 0 ? 2 : -6, x1: sx > 0 ? 6 : -2, z0: Z - 0.14, z1: Z + 0.14,
      y0: 0, y1: 2.4, mat: PALETTE.steel, material: 'metal', thickness: 0.004,
      solid: true, name: 'perimeter-gate', cast: false,
    });
  }
}

/* ================================================================== */
/* 1. Shooting range (north)                                            */
/* ================================================================== */

function buildRange(ctx) {
  const R = LAB.RANGE;
  const xW = -26;
  const xE = -4;

  // Firing point slab + bench.
  slab(ctx, {
    x0: xW, x1: xE, z0: -11, z1: -6, y0: 0, y1: 0.06,
    mat: PALETTE.concrete, material: 'concrete', name: 'range-pad', cast: false,
  });
  ctx.zone(xW, -11, xE, -6, 'concrete', -0.1, 0.2);

  slab(ctx, {
    x0: -24.6, x1: -5.4, z0: R.firingZ - 0.55, z1: R.firingZ + 0.55,
    y0: 1.0, y1: 1.1, mat: PALETTE.ply, material: 'wood', thickness: 0.03,
    solid: true, name: 'range-bench-top',
  });
  for (let i = 0; i < 5; i++) {
    const bx = -24.2 + i * 4.7;
    slab(ctx, {
      x0: bx, x1: bx + 0.16, z0: R.firingZ - 0.45, z1: R.firingZ + 0.45,
      y0: 0, y1: 1.0, mat: PALETTE.steelDark, material: 'metal',
      name: 'range-bench-leg',
    });
  }

  // Lane dividers -- plywood fins running downrange from the bench.
  for (let i = 0; i <= R.laneCount; i++) {
    const dx = xW + 2 + i * R.laneWidth;
    slab(ctx, {
      x0: dx - 0.04, x1: dx + 0.04, z0: -13.5, z1: -6.5, y0: 0.9, y1: 2.1,
      mat: PALETTE.plyDark, material: 'wood', thickness: 0.03,
      name: `range-divider-${i}`,
    });
    slab(ctx, {
      x0: dx - 0.09, x1: dx + 0.09, z0: -6.7, z1: -6.5, y0: 0, y1: 2.1,
      mat: PALETTE.steelDark, material: 'metal', name: `range-divider-post-${i}`,
    });
  }

  // Paper target frames at 10 / 25 / 50m in every lane.
  R.frameZ.forEach((fz, di) => {
    for (const lx of R.laneX) {
      const h = 1.75;
      slab(ctx, {
        x0: lx - 0.06, x1: lx + 0.06, z0: fz - 0.05, z1: fz + 0.05,
        y0: 0, y1: h, mat: PALETTE.woodDark, material: 'wood', thickness: 0.06,
        name: `range-frame-post-${di}`,
      });
      const board = slab(ctx, {
        x0: lx - 0.36, x1: lx + 0.36, z0: fz - 0.015, z1: fz + 0.015,
        y0: 0.85, y1: 1.75, mat: PALETTE.paper, material: 'wood', thickness: 0.03,
        name: `range-target-${R.distances[di]}m`, cast: false,
      });
      board.userData.targetId = `paper-${R.distances[di]}-${lx}`;
      ctx.blocker(b3(lx - 0.4, 0, fz - 0.25, lx + 0.4, h, fz + 0.25, 0));
    }
  });

  // Side berms and the backstop.
  for (const sx of [xW, xE]) {
    slab(ctx, {
      x0: sx - 1.2, x1: sx + 1.2, z0: -60, z1: -12, y0: 0, y1: 3,
      mat: PALETTE.berm, material: 'concrete', solid: true, name: 'range-side-berm',
    });
  }
  const berm = [
    { inset: 0, y: 2.2 },
    { inset: 1.1, y: 3.8 },
    { inset: 2.2, y: 5.0 },
  ];
  berm.forEach((b, i) => {
    slab(ctx, {
      x0: xW - 1, x1: xE + 1, z0: R.bermZ - 2.2 + b.inset, z1: R.bermZ + 2.2,
      y0: 0, y1: b.y, mat: PALETTE.berm, material: 'concrete',
      solid: i === 0, name: `range-backstop-${i}`,
    });
  });

  ctx.cover('range-bench-w', -22.5, -7.2, 0, -1, 'low');
  ctx.cover('range-bench-e', -9.0, -7.2, 0, -1, 'low');

  return buildMovingTargets(ctx, xW + 2.4, xE - 2.4);
}

/**
 * Two carrier rails: a slow one at 25m and a fast one at 40m. The carriers are
 * groups whose x is driven by update(dt); the boards on them are ordinary hit
 * meshes tagged 'wood' with a targetId.
 */
function buildMovingTargets(ctx, xMin, xMax) {
  const targets = [];
  const rails = [
    { id: 'slow', z: LAB.RANGE.slowRailZ, speed: 2.1, count: 2 },
    { id: 'fast', z: LAB.RANGE.fastRailZ, speed: 5.4, count: 1 },
  ];
  for (const rail of rails) {
    slab(ctx, {
      x0: xMin - 0.6, x1: xMax + 0.6, z0: rail.z - 0.07, z1: rail.z + 0.07,
      y0: 1.86, y1: 2.0, mat: PALETTE.steel, material: 'metal', thickness: 0.004,
      name: `rail-${rail.id}`, cast: false,
    });
    for (const ex of [xMin - 0.6, xMax + 0.6]) {
      slab(ctx, {
        x0: ex - 0.09, x1: ex + 0.09, z0: rail.z - 0.09, z1: rail.z + 0.09,
        y0: 0, y1: 2.0, mat: PALETTE.steelDark, material: 'metal',
        name: `rail-${rail.id}-post`,
      });
      ctx.blocker(b3(ex - 0.2, 0, rail.z - 0.2, ex + 0.2, 2, rail.z + 0.2, 0));
    }
    for (let i = 0; i < rail.count; i++) {
      const carrier = new THREE.Group();
      carrier.name = `carrier-${rail.id}-${i}`;
      const span = xMax - xMin;
      const x = xMin + (span * (i + 0.5)) / rail.count;
      carrier.position.set(x, 0, rail.z);
      ctx.group.add(carrier);
      slab(ctx, {
        parent: carrier, x0: -0.05, x1: 0.05, z0: -0.05, z1: 0.05,
        y0: 0.9, y1: 1.86, mat: PALETTE.steelDark, material: 'metal',
        name: 'carrier-post', cast: false,
      });
      const board = slab(ctx, {
        parent: carrier, x0: -0.32, x1: 0.32, z0: -0.02, z1: 0.02,
        y0: 0.95, y1: 1.75, mat: PALETTE.paper, material: 'wood', thickness: 0.03,
        name: `moving-target-${rail.id}-${i}`, cast: false,
      });
      board.userData.targetId = `moving-${rail.id}-${i}`;
      targets.push({
        id: `moving-${rail.id}-${i}`,
        rail: rail.id,
        group: carrier,
        mesh: board,
        speed: rail.speed,
        dir: i % 2 === 0 ? 1 : -1,
        min: xMin,
        max: xMax,
      });
    }
  }
  return {
    targets,
    update(dt) {
      const step = Math.min(Math.max(dt, 0), 0.1);
      for (const t of targets) {
        let x = t.group.position.x + t.dir * t.speed * step;
        if (x > t.max) { x = t.max - (x - t.max); t.dir = -1; }
        if (x < t.min) { x = t.min + (t.min - x); t.dir = 1; }
        t.group.position.x = x;
      }
    },
  };
}

/* ================================================================== */
/* 2. Material wall                                                     */
/* ================================================================== */

function buildMaterialWall(ctx) {
  const M = LAB.MATERIAL_WALL;
  const z = M.z;
  const specs = [
    { key: 'drywall', material: 'drywall', thickness: 0.02, mat: PALETTE.drywall, w: 1.2, h: 2.4, t: 0.02 },
    { key: 'wood', material: 'wood', thickness: 0.03, mat: PALETTE.ply, w: 1.2, h: 2.4, t: 0.03 },
    { key: 'glass-a', material: 'glass', thickness: 0.01, mat: PALETTE.glass, w: 1.2, h: 2.0, t: 0.01 },
    { key: 'glass-b', material: 'glass', thickness: 0.01, mat: PALETTE.glass, w: 1.2, h: 2.0, t: 0.01 },
    { key: 'metal', material: 'metal', thickness: 0.004, mat: PALETTE.steel, w: 1.2, h: 2.0, t: 0.01 },
    { key: 'brick', material: 'brick', mat: PALETTE.brick, w: 0.8, h: 2.4, t: 0.8, heavy: true },
    { key: 'concrete', material: 'concrete', mat: PALETTE.concreteDark, w: 1.6, h: 1.5, t: 0.4, heavy: true },
    { key: 'drywall-double', material: 'drywall', thickness: 0.02, mat: PALETTE.drywall, w: 1.2, h: 2.4, t: 0.02 },
    { key: 'wood-stud', material: 'wood', thickness: 0.03, mat: PALETTE.plyDark, w: 1.2, h: 2.4, t: 0.03 },
  ];

  specs.forEach((s, i) => {
    const x = M.panelX[i];
    // Frame: two posts holding the sample.
    for (const sx of [-1, 1]) {
      slab(ctx, {
        x0: x + sx * (s.w / 2 + 0.06) - 0.06, x1: x + sx * (s.w / 2 + 0.06) + 0.06,
        z0: z - 0.06, z1: z + 0.06, y0: 0, y1: s.h + 0.2,
        mat: PALETTE.woodDark, material: 'wood', thickness: 0.06,
        name: `matwall-frame-${s.key}`,
      });
    }
    const y0 = s.heavy ? 0 : 0.35;
    slab(ctx, {
      x0: x - s.w / 2, x1: x + s.w / 2, z0: z - s.t / 2, z1: z + s.t / 2,
      y0, y1: y0 + s.h, mat: s.mat, material: s.material, thickness: s.thickness,
      name: `matwall-${s.key}`, solid: !!s.heavy, cast: !!s.heavy,
    });
    ctx.blocker(b3(x - s.w / 2 - 0.2, 0, z - 0.4, x + s.w / 2 + 0.2, s.h, z + 0.4, 0));
  });

  // Junker car body: panels + glazing, both penetrable.
  buildCar(ctx, M.carX, z + 0.4, Math.PI / 2, PALETTE.carTan, 'matwall-car');

  // Furniture stack: couch, table, cabinet.
  const fx = M.furnitureX;
  slab(ctx, {
    x0: fx - 1.1, x1: fx + 1.1, z0: z - 0.45, z1: z + 0.45, y0: 0.22, y1: 0.72,
    mat: PALETTE.fabric, material: 'furniture', name: 'matwall-couch', solid: true,
  });
  slab(ctx, {
    x0: fx - 1.1, x1: fx + 1.1, z0: z + 0.2, z1: z + 0.45, y0: 0.72, y1: 1.16,
    mat: PALETTE.fabric, material: 'furniture', name: 'matwall-couch-back',
  });
  slab(ctx, {
    x0: fx - 0.9, x1: fx + 0.9, z0: z - 1.6, z1: z - 0.7, y0: 0.72, y1: 0.8,
    mat: PALETTE.wood, material: 'furniture', name: 'matwall-table', solid: true,
  });
  for (const lx of [-0.78, 0.78]) {
    for (const lz of [-1.48, -0.82]) {
      slab(ctx, {
        x0: fx + lx - 0.05, x1: fx + lx + 0.05, z0: z + lz - 0.05, z1: z + lz + 0.05,
        y0: 0, y1: 0.72, mat: PALETTE.woodDark, material: 'furniture',
        name: 'matwall-table-leg', cast: false,
      });
    }
  }
  slab(ctx, {
    x0: fx - 2.3, x1: fx - 1.4, z0: z - 0.35, z1: z + 0.35, y0: 0, y1: 1.5,
    mat: PALETTE.wood, material: 'furniture', thickness: 0.03,
    name: 'matwall-cabinet', solid: true,
  });

  // Its own low catch berm behind the samples.
  slab(ctx, {
    x0: -4, x1: 24, z0: -24.6, z1: -22.6, y0: 0, y1: 3.4,
    mat: PALETTE.berm, material: 'concrete', solid: true, name: 'matwall-berm',
  });

  ctx.cover('matwall-firing-w', 2, M.firingZ, 0, -1, 'low');
  ctx.cover('matwall-firing-e', 16, M.firingZ, 0, -1, 'low');
}

/** A junked car: body panels ('vehicle'), glazing ('glass'), wheels. */
function buildCar(ctx, x, z, rotY, bodyMat, name) {
  const car = new THREE.Group();
  car.name = name;
  car.position.set(x, 0, z);
  car.rotation.y = rotY;
  ctx.group.add(car);
  const P = { parent: car };
  slab(ctx, {
    ...P, x0: -2.0, x1: 2.0, z0: -0.9, z1: 0.9, y0: 0.42, y1: 1.02,
    mat: bodyMat, material: 'vehicle', thickness: 0.01, name: `${name}-body`,
  });
  slab(ctx, {
    ...P, x0: -1.05, x1: 0.85, z0: -0.82, z1: 0.82, y0: 1.02, y1: 1.5,
    mat: bodyMat, material: 'vehicle', thickness: 0.01, name: `${name}-cabin`,
  });
  slab(ctx, {
    ...P, x0: -0.9, x1: 0.7, z0: -0.79, z1: -0.75, y0: 1.08, y1: 1.44,
    mat: PALETTE.carGlass, material: 'glass', thickness: 0.01,
    name: `${name}-glass-l`, cast: false,
  });
  slab(ctx, {
    ...P, x0: -0.9, x1: 0.7, z0: 0.75, z1: 0.79, y0: 1.08, y1: 1.44,
    mat: PALETTE.carGlass, material: 'glass', thickness: 0.01,
    name: `${name}-glass-r`, cast: false,
  });
  slab(ctx, {
    ...P, x0: 0.82, x1: 0.9, z0: -0.78, z1: 0.78, y0: 1.05, y1: 1.46,
    mat: PALETTE.carGlass, material: 'glass', thickness: 0.01,
    name: `${name}-windscreen`, cast: false,
  });
  slab(ctx, {
    ...P, x0: -2.02, x1: -1.1, z0: -0.86, z1: 0.86, y0: 1.0, y1: 1.06,
    mat: bodyMat, material: 'vehicle', thickness: 0.01, name: `${name}-boot`, cast: false,
  });
  for (const wx of [-1.35, 1.3]) {
    for (const wz of [-0.86, 0.86]) {
      post(ctx, {
        parent: car, x: wx, y: 0.36, z: wz, r: 0.36, h: 0.26,
        rotX: Math.PI / 2, mat: PALETTE.rubber, material: 'vehicle',
        name: `${name}-wheel`, cast: false,
      });
    }
  }
  // Two colliders in world space: cars are only ever axis aligned or turned 90.
  const halfX = Math.abs(Math.cos(rotY)) > 0.5 ? 2.1 : 1.0;
  const halfZ = Math.abs(Math.cos(rotY)) > 0.5 ? 1.0 : 2.1;
  ctx.solid(b3(x - halfX, 0, z - halfZ, x + halfX, 1.5, z + halfZ));
  ctx.blocker(b3(x - halfX - 0.3, 0, z - halfZ - 0.3, x + halfX + 0.3, 1.5, z + halfZ + 0.3, 0));
  return car;
}

/* ================================================================== */
/* 3. Killhouse (centre)                                                */
/* ================================================================== */

/**
 * Ground floor:
 *
 *      z=-4  +-------------------------------------------+
 *            |  HALL (front door n, side door w)         |
 *      z=-1  +---[D1]------+-------------------+---------+
 *            |             |                   | s      |
 *            |   MAIN      | [win]  EAST       | t      |
 *            |   (double   |                   | a      |
 *            |    height)  |                   | i      |
 *      z=8   +------+------+------[D2]---------+ r      |
 *            | S-W  |        SOUTH        [D3]|         |
 *      z=12  +------+---------------------+-------------+
 *          x=-11   -3      1              8.7          11
 */
function buildKillhouse(ctx) {
  const y1 = GROUND_CEIL;
  const uy0 = UPPER_Y;
  const uy1 = UPPER_CEIL;
  const doors = [];

  /* ---- floor slabs, ceilings, roof ------------------------------- */
  slab(ctx, {
    x0: KH.x0, x1: KH.x1, z0: KH.z0, z1: KH.z1, y0: -0.05, y1: 0.02,
    mat: PALETTE.concrete, material: 'concrete', name: 'kh-floor', cast: false,
  });
  ctx.zone(KH.x0, KH.z0, KH.x1, KH.z1, 'concrete', -0.1, 0.1);
  ctx.zone(-11, 8, -3, 12, 'carpet', -0.1, 0.1);

  /* Upper floor slabs. The main room (x -11..1, z 1.4..8) and the stair well
   * (x 8.7..10.7, z 0.4..11.6) are the two holes in this deck. */
  const upper = [
    { x0: -11, x1: 11, z0: -4, z1: -1, name: 'kh-upper-north' },
    { x0: -11, x1: 1, z0: -1, z1: 1.4, name: 'kh-balcony' },
    { x0: 1, x1: 11, z0: -1, z1: 0.4, name: 'kh-upper-deck' },
    { x0: 1, x1: 8.7, z0: 0.4, z1: 8, name: 'kh-upper-corridor' },
    { x0: -11, x1: 8.7, z0: 8, z1: 12, name: 'kh-upper-loft' },
  ];
  for (const u of upper) {
    slab(ctx, {
      ...u, y0: GROUND_CEIL, y1: UPPER_Y, mat: PALETTE.plyDark,
      material: 'wood', thickness: 0.3, cast: false,
    });
    ctx.floor(u.x0, u.z0, u.x1, u.z1, UPPER_Y);
    ctx.zone(u.x0, u.z0, u.x1, u.z1, 'wood', UPPER_Y - 0.1, UPPER_Y + 0.1);
  }
  slab(ctx, {
    x0: KH.x0, x1: KH.x1, z0: KH.z0, z1: KH.z1, y0: UPPER_CEIL, y1: ROOF_Y,
    mat: PALETTE.concreteDark, material: 'concrete', name: 'kh-roof', cast: false,
  });

  /* ---- exterior shell -------------------------------------------- */
  // North wall: front door opening plus two windows.
  wallRun(ctx, {
    axis: 'x', at: KH.z0, t: T_EXT, u0: KH.x0, u1: KH.x1, y0: 0, y1: y1,
    mat: PALETTE.drywall, material: 'drywall', thickness: 0.02, name: 'kh-n-wall',
    openings: [
      { u0: -0.9, u1: 0.9, head: 2.1 },
      { u0: -6.4, u1: -5.0, sill: 1.0, head: 2.2 },
      { u0: 5.0, u1: 6.4, sill: 1.0, head: 2.2 },
    ],
  });
  wallRun(ctx, {
    axis: 'x', at: KH.z0, t: T_EXT, u0: KH.x0, u1: KH.x1, y0: uy0, y1: uy1,
    mat: PALETTE.drywall, material: 'drywall', thickness: 0.02, name: 'kh-n-wall-up',
    openings: [
      { u0: -3.2, u1: -1.8, sill: 0.9, head: 2.1 },
      { u0: 1.8, u1: 3.2, sill: 0.9, head: 2.1 },
    ],
  });
  // South wall: the rear door (reinforcement entry) plus a window.
  wallRun(ctx, {
    axis: 'x', at: KH.z1, t: T_EXT, u0: KH.x0, u1: KH.x1, y0: 0, y1: y1,
    mat: PALETTE.drywall, material: 'drywall', thickness: 0.02, name: 'kh-s-wall',
    openings: [
      { u0: 4.4, u1: 6.0, head: 2.1 },
      { u0: -8.4, u1: -7.0, sill: 1.0, head: 2.2 },
    ],
  });
  wallRun(ctx, {
    axis: 'x', at: KH.z1, t: T_EXT, u0: KH.x0, u1: KH.x1, y0: uy0, y1: uy1,
    mat: PALETTE.drywall, material: 'drywall', thickness: 0.02, name: 'kh-s-wall-up',
    openings: [{ u0: -2.2, u1: -0.8, sill: 0.9, head: 2.1 }],
  });
  // West wall: side entry into the hall.
  wallRun(ctx, {
    axis: 'z', at: KH.x0, t: T_EXT, u0: KH.z0, u1: KH.z1, y0: 0, y1: y1,
    mat: PALETTE.drywall, material: 'drywall', thickness: 0.02, name: 'kh-w-wall',
    openings: [
      { u0: -3.4, u1: -2.0, head: 2.1 },
      { u0: 3.0, u1: 4.4, sill: 1.0, head: 2.2 },
    ],
  });
  wallRun(ctx, {
    axis: 'z', at: KH.x0, t: T_EXT, u0: KH.z0, u1: KH.z1, y0: uy0, y1: uy1,
    mat: PALETTE.drywall, material: 'drywall', thickness: 0.02, name: 'kh-w-wall-up',
    openings: [{ u0: 9.0, u1: 10.6, sill: 0.9, head: 2.1 }],
  });
  // East wall: solid downstairs bar two windows, one window over the stair.
  wallRun(ctx, {
    axis: 'z', at: KH.x1, t: T_EXT, u0: KH.z0, u1: KH.z1, y0: 0, y1: y1,
    mat: PALETTE.drywall, material: 'drywall', thickness: 0.02, name: 'kh-e-wall',
    openings: [{ u0: 1.4, u1: 2.8, sill: 1.0, head: 2.2 }],
  });
  wallRun(ctx, {
    axis: 'z', at: KH.x1, t: T_EXT, u0: KH.z0, u1: KH.z1, y0: uy0, y1: uy1,
    mat: PALETTE.drywall, material: 'drywall', thickness: 0.02, name: 'kh-e-wall-up',
    openings: [{ u0: 0.6, u1: 2.0, sill: 0.9, head: 2.1 }],
  });

  /* ---- ground floor partitions ----------------------------------- */
  // Hall / rooms, at z = -1. D1 is a working door into the main room.
  wallRun(ctx, {
    axis: 'x', at: -1, u0: KH.x0, u1: KH.x1, y0: 0, y1: y1,
    mat: PALETTE.plyDark, material: 'wood', thickness: 0.03, name: 'kh-hall-wall',
    openings: [
      { u0: -5.6, u1: -4.2, head: 2.05 },
      { u0: 3.0, u1: 4.4, head: 2.05 },
      { u0: -9.6, u1: -8.2, sill: 1.05, head: 2.05 },
    ],
  });
  // Main / east, at x = 1: an interior window plus a doorway.
  wallRun(ctx, {
    axis: 'z', at: 1, u0: -1, u1: 8, y0: 0, y1: y1,
    mat: PALETTE.plyDark, material: 'wood', thickness: 0.03, name: 'kh-main-east-wall',
    openings: [
      { u0: 2.0, u1: 3.6, sill: 1.0, head: 2.2 },
      { u0: 5.6, u1: 7.0, head: 2.05 },
    ],
  });
  // Rooms / south block, at z = 8. D2 is a working door.
  wallRun(ctx, {
    axis: 'x', at: 8, u0: KH.x0, u1: ST.x0, y0: 0, y1: y1,
    mat: PALETTE.drywall, material: 'drywall', thickness: 0.02, name: 'kh-south-wall',
    openings: [
      { u0: 2.2, u1: 3.6, head: 2.05 },
      { u0: -8.5, u1: -7.1, head: 2.05 },
    ],
  });
  // South-west store room divider, at x = -3.
  wallRun(ctx, {
    axis: 'z', at: -3, u0: 8, u1: KH.z1, y0: 0, y1: y1,
    mat: PALETTE.drywall, material: 'drywall', thickness: 0.02, name: 'kh-sw-wall',
    openings: [{ u0: 9.4, u1: 10.8, head: 2.05 }],
  });

  /* ---- upper partitions ------------------------------------------ */
  wallRun(ctx, {
    axis: 'x', at: 0.4, u0: 1, u1: ST.x0, y0: uy0, y1: uy1,
    mat: PALETTE.plyDark, material: 'wood', thickness: 0.03, name: 'kh-upper-n-wall',
    openings: [{ u0: 4.2, u1: 5.6, head: uy0 + 2.05 }],
  });
  wallRun(ctx, {
    axis: 'x', at: 8, u0: KH.x0, u1: ST.x0, y0: uy0, y1: uy1,
    mat: PALETTE.plyDark, material: 'wood', thickness: 0.03, name: 'kh-upper-s-wall',
    openings: [
      { u0: 3.0, u1: 4.4, head: uy0 + 2.05 },
      { u0: -6.0, u1: -4.6, sill: uy0 + 1.0, head: uy0 + 2.1 },
    ],
  });

  /* ---- the void edges: balcony rail, corridor parapet, stair rail --- */
  const rail = (x0, z0, x1, z1, name) => {
    slab(ctx, {
      x0, x1, z0, z1, y0: UPPER_Y, y1: UPPER_Y + RAIL_H,
      mat: PALETTE.steelDark, material: 'metal', thickness: 0.004,
      solid: true, blocker: true, name, cast: false,
    });
  };
  rail(-11, 1.28, 1, 1.4, 'kh-balcony-rail');
  rail(0.88, 1.4, 1, 8, 'kh-corridor-parapet');
  // The stair well's open (west) side. Its head at z=0.4 is deliberately left
  // clear -- that is where you step off the top flight onto the deck.
  rail(ST.x0 - 0.06, 0.4, ST.x0 + 0.06, ST.bottomZ, 'kh-stair-rail');

  /* ---- staircase -------------------------------------------------- */
  buildStair(ctx);

  /* ---- doors ------------------------------------------------------ */
  doors.push(makeDoor(ctx, {
    id: 'kh-hall-main', x0: -5.6, x1: -4.2, z: -1, hingeAt: 'min', swing: -1,
  }));
  doors.push(makeDoor(ctx, {
    id: 'kh-east-south', x0: 2.2, x1: 3.6, z: 8, hingeAt: 'max', swing: 1,
  }));
  doors.push(makeDoor(ctx, {
    id: 'kh-rear', x0: 4.4, x1: 6.0, z: KH.z1, hingeAt: 'min', swing: -1,
  }));

  /* ---- furniture, cover, lights ----------------------------------- */
  buildKillhouseProps(ctx);
  for (const [lx, ly, lz] of [[-5, 2.9, 4], [5.5, 2.9, 3], [-2, 6.2, 10]]) {
    const lamp = new THREE.PointLight(0xffd9a0, 0.75, 13, 2);
    lamp.position.set(lx, ly, lz);
    ctx.group.add(lamp);
    post(ctx, {
      x: lx, y: ly + 0.12, z: lz, r: 0.1, h: 0.06, mat: PALETTE.bulb,
      material: 'glass', thickness: 0.01, name: 'kh-lamp', cast: false,
    });
  }

  return doors;
}

/** Two 5m flights and a landing, climbing north up the east wall. */
function buildStair(ctx) {
  // Bottom flight: y goes LAND_Y at z=6.6 down to 0 at z=11.6.
  ctx.ramp(ST.x0, ST.landZ1, ST.x1, ST.bottomZ, LAND_Y, 0);
  // Landing.
  ctx.floor(ST.x0, ST.landZ0, ST.x1, ST.landZ1, LAND_Y);
  // Top flight: UPPER_Y at z=0.4 down to LAND_Y at z=5.4.
  ctx.ramp(ST.x0, ST.topZ, ST.x1, ST.landZ0, UPPER_Y, LAND_Y);
  ctx.zone(ST.x0, ST.topZ, ST.x1, ST.bottomZ, 'wood', 0, UPPER_Y);

  const TREADS = 10;
  const cut = (z0, z1, yLo, yHi, name) => {
    const run = (z1 - z0) / TREADS;
    const rise = (yHi - yLo) / TREADS;
    for (let i = 0; i < TREADS; i++) {
      // Treads are laid so that the walked surface matches the ramp exactly.
      const zA = z1 - (i + 1) * run;
      const zB = z1 - i * run;
      const top = yLo + rise * (i + 1);
      slab(ctx, {
        x0: ST.x0, x1: ST.x1, z0: zA, z1: zB, y0: Math.max(0, top - 0.18), y1: top,
        mat: PALETTE.ply, material: 'wood', name: `${name}-tread`, cast: false,
      });
      if (i > 0) {
        slab(ctx, {
          x0: ST.x0, x1: ST.x1, z0: zB - 0.05, z1: zB, y0: top - rise - 0.18, y1: top - rise,
          mat: PALETTE.woodDark, material: 'wood', name: `${name}-riser`, cast: false,
        });
      }
    }
  };
  cut(ST.landZ1, ST.bottomZ, 0, LAND_Y, 'kh-stair-lower');
  cut(ST.topZ, ST.landZ0, LAND_Y, UPPER_Y, 'kh-stair-upper');
  slab(ctx, {
    x0: ST.x0, x1: ST.x1, z0: ST.landZ0, z1: ST.landZ1,
    y0: LAND_Y - 0.18, y1: LAND_Y, mat: PALETTE.ply, material: 'wood',
    name: 'kh-stair-landing', cast: false,
  });
  // Handrail on the open (west) side of both flights: nav blocker only, so the
  // player rides the treads and the AI keeps off the edge.
  for (const f of [[ST.landZ1, ST.bottomZ], [ST.topZ, ST.landZ0]]) {
    ctx.blocker(b3(ST.x0 - 0.1, 0, f[0], ST.x0 + 0.02, UPPER_Y + 1, f[1], 0));
  }
}

/**
 * A rotating door panel. The closed panel's Box3 lives in `colliders`;
 * toggle() splices it out when the door opens and pushes it back when it shuts,
 * so the collider list stays correct without a rebuild.
 */
function makeDoor(ctx, o) {
  const { id, x0, x1, z, hingeAt = 'min', swing = 1, height = 2.05 } = o;
  const w = x1 - x0;
  const hingeX = hingeAt === 'min' ? x0 : x1;
  const dir = hingeAt === 'min' ? 1 : -1;

  const pivot = new THREE.Group();
  pivot.name = `door-${id}`;
  pivot.position.set(hingeX, 0, z);
  ctx.group.add(pivot);

  const panel = new THREE.Mesh(_boxGeo, PALETTE.wood);
  panel.scale.set(w - 0.04, height, 0.06);
  panel.position.set(dir * w / 2, height / 2, 0);
  panel.castShadow = true;
  panel.name = `door-${id}-panel`;
  pivot.add(panel);
  ctx.tag(panel, 'wood', 0.04);

  const knob = new THREE.Mesh(cylGeo(8), PALETTE.brass);
  knob.scale.set(0.05, 0.09, 0.05);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(dir * (w - 0.18), 1.02, 0.06);
  pivot.add(knob);
  ctx.tag(knob, 'metal', 0.01);

  const box = b3(x0, 0, z - 0.06, x1, height, z + 0.06);
  ctx.solid(box);
  ctx.blocker(b3(x0, 0, z - 0.4, x1, height, z + 0.4, 0));

  const door = {
    id,
    group: pivot,
    panel,
    open: false,
    box,
    toggle() {
      this.open = !this.open;
      pivot.rotation.y = this.open ? swing * Math.PI * 0.52 : 0;
      const i = ctx.colliders.indexOf(box);
      if (this.open) {
        if (i >= 0) ctx.colliders.splice(i, 1);
      } else if (i < 0) {
        ctx.colliders.push(box);
      }
      return this.open;
    },
  };
  return door;
}

/** Crates, tables and cabinets -- the killhouse's cover, plus its cover nodes. */
function buildKillhouseProps(ctx) {
  const crate = (x, z, s = 0.8, h = 0.8, y = 0, name = 'kh-crate') => {
    slab(ctx, {
      x0: x - s / 2, x1: x + s / 2, z0: z - s / 2, z1: z + s / 2, y0: y, y1: y + h,
      mat: PALETTE.ply, material: 'furniture', thickness: 0.03, solid: true, name,
    });
  };
  const table = (x, z, w, d, y = 0, name = 'kh-table') => {
    slab(ctx, {
      x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2,
      y0: y + 0.72, y1: y + 0.8, mat: PALETTE.wood, material: 'furniture',
      thickness: 0.03, solid: true, name,
    });
    for (const lx of [-w / 2 + 0.1, w / 2 - 0.1]) {
      for (const lz of [-d / 2 + 0.1, d / 2 - 0.1]) {
        slab(ctx, {
          x0: x + lx - 0.04, x1: x + lx + 0.04, z0: z + lz - 0.04, z1: z + lz + 0.04,
          y0: y, y1: y + 0.72, mat: PALETTE.woodDark, material: 'furniture',
          cast: false, name: `${name}-leg`,
        });
      }
    }
  };
  const cabinet = (x, z, w, d, h, y = 0, name = 'kh-cabinet') => {
    slab(ctx, {
      x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: y, y1: y + h,
      mat: PALETTE.woodDark, material: 'furniture', thickness: 0.03,
      solid: true, name,
    });
  };

  /* Main room (double height, watched from the balcony). */
  crate(-8.6, 3.2, 1.0, 1.0, 0, 'kh-crate-main-a');
  crate(-8.6, 4.3, 1.0, 0.8, 0, 'kh-crate-main-b');
  crate(-8.0, 3.7, 0.9, 0.9, 1.0, 'kh-crate-main-c');
  crate(-2.4, 6.2, 1.0, 1.2, 0, 'kh-crate-main-d');
  table(-5.4, 2.2, 1.8, 0.9, 0, 'kh-table-main');
  cabinet(-10.2, 6.6, 0.6, 1.8, 1.7, 0, 'kh-cabinet-main');
  ctx.cover('kh-main-crate-n', -8.6, 2.3, 0, -1, 'high');
  ctx.cover('kh-main-crate-s', -8.6, 5.2, 0, 1, 'low');
  ctx.cover('kh-main-table', -5.4, 3.0, 0, -1, 'low');
  ctx.cover('kh-main-crate-d', -2.4, 7.0, 0, 1, 'high');
  ctx.cover('kh-main-door', -4.0, -0.2, 0, 1, 'high');
  ctx.cover('kh-main-window', -8.9, -0.2, 0, 1, 'low');

  /* East room. */
  table(4.4, 1.6, 2.0, 0.9, 0, 'kh-table-east');
  crate(6.6, 5.8, 1.0, 1.0, 0, 'kh-crate-east');
  cabinet(2.0, 6.4, 0.6, 1.6, 1.8, 0, 'kh-cabinet-east');
  ctx.cover('kh-east-table', 4.4, 2.4, 0, -1, 'low');
  ctx.cover('kh-east-crate', 6.6, 4.9, 0, -1, 'high');
  ctx.cover('kh-east-window', 1.6, 2.8, -1, 0, 'low');

  /* South rooms. */
  crate(0.0, 10.6, 1.1, 1.1, 0, 'kh-crate-south-a');
  crate(1.2, 10.6, 1.1, 0.9, 0, 'kh-crate-south-b');
  cabinet(6.9, 9.0, 1.4, 0.6, 1.9, 0, 'kh-cabinet-south');
  table(-6.6, 10.2, 1.6, 0.9, 0, 'kh-table-sw');
  crate(-9.6, 10.8, 1.0, 1.0, 0, 'kh-crate-sw');
  ctx.cover('kh-south-crate', 0.6, 9.6, 0, -1, 'high');
  ctx.cover('kh-south-door', 4.0, 9.0, 0, 1, 'high');
  ctx.cover('kh-sw-table', -6.6, 9.4, 0, -1, 'low');
  ctx.cover('kh-rear-door', 5.2, 11.0, 0, 1, 'high');

  /* Hall. */
  cabinet(-10.0, -2.5, 0.6, 1.6, 1.8, 0, 'kh-cabinet-hall');
  crate(9.4, -2.6, 0.9, 0.9, 0, 'kh-crate-hall');
  ctx.cover('kh-hall-west', -9.4, -2.5, 1, 0, 'high');
  ctx.cover('kh-hall-east', 8.6, -2.6, -1, 0, 'high');

  /* Upper floor. */
  crate(-3.2, 0.4, 0.9, 0.9, UPPER_Y, 'kh-crate-balcony');
  crate(-7.4, 0.4, 0.9, 0.9, UPPER_Y, 'kh-crate-balcony-b');
  table(4.6, 3.0, 1.6, 0.8, UPPER_Y, 'kh-table-upper');
  cabinet(-9.8, 10.4, 0.6, 1.6, 1.8, UPPER_Y, 'kh-cabinet-loft');
  crate(2.0, 10.2, 1.0, 1.0, UPPER_Y, 'kh-crate-loft');
  ctx.cover('kh-balcony-w', -7.4, 1.0, 0, 1, 'low', UPPER_Y);
  ctx.cover('kh-balcony-e', -3.2, 1.0, 0, 1, 'low', UPPER_Y);
  ctx.cover('kh-balcony-mid', -5.4, 1.05, 0, 1, 'high', UPPER_Y);
  ctx.cover('kh-upper-parapet', 1.6, 4.0, -1, 0, 'low', UPPER_Y);
  ctx.cover('kh-upper-stairhead', 7.9, 1.4, 1, 0, 'high', UPPER_Y);
  ctx.cover('kh-loft-crate', 2.0, 9.2, 0, -1, 'high', UPPER_Y);
  ctx.cover('kh-loft-window', -5.3, 8.6, 0, 1, 'low', UPPER_Y);
}

/* ================================================================== */
/* 4. Cover yard (south)                                                */
/* ================================================================== */

function buildYard(ctx) {
  const Y = LAB.YARD;
  const min = rectMin(Y);
  const max = rectMax(Y);
  slab(ctx, {
    x0: min.x, x1: max.x, z0: min.z, z1: max.z, y0: -0.02, y1: 0.03,
    mat: PALETTE.concrete, material: 'concrete', name: 'yard-pad', cast: false,
  });
  ctx.zone(min.x, min.z, max.x, max.z, 'concrete', -0.1, 0.1);

  /* Jersey barriers: high (1.6m) and low (0.9m), alternating cover. */
  const barriers = [
    { x: -11, z: 21, rot: 0, high: true },
    { x: -3.5, z: 20.5, rot: 0, high: false },
    { x: 5, z: 21.5, rot: 0, high: true },
    { x: 12, z: 24, rot: Math.PI / 2, high: false },
    { x: -12.5, z: 28, rot: Math.PI / 2, high: true },
    { x: -1, z: 27.5, rot: 0, high: false },
    { x: 8, z: 30, rot: Math.PI / 2, high: true },
    { x: -7, z: 34, rot: 0, high: false },
    { x: 2.5, z: 35.5, rot: 0, high: true },
    { x: 12, z: 37, rot: Math.PI / 2, high: false },
    { x: -12, z: 39.5, rot: 0, high: true },
  ];
  barriers.forEach((b, i) => {
    const h = b.high ? 1.6 : 0.9;
    const along = b.rot === 0 ? 'x' : 'z';
    const halfA = 1.75;
    const halfB = 0.32;
    const hx = along === 'x' ? halfA : halfB;
    const hz = along === 'x' ? halfB : halfA;
    slab(ctx, {
      x0: b.x - hx, x1: b.x + hx, z0: b.z - hz, z1: b.z + hz, y0: 0, y1: h,
      mat: PALETTE.concreteDark, material: 'concrete', solid: true,
      name: `yard-barrier-${i}`,
    });
    // Sloped skirt, purely visual.
    slab(ctx, {
      x0: b.x - hx, x1: b.x + hx, z0: b.z - hz - 0.14, z1: b.z + hz + 0.14,
      y0: 0, y1: 0.28, mat: PALETTE.concreteDark, material: 'concrete',
      name: `yard-barrier-${i}-foot`, cast: false,
    });
    // The protected side faces the killhouse (north) unless the barrier is
    // turned; the AI stands on the far side and shoots over/around.
    const fx = along === 'x' ? 0 : (b.x < 0 ? 1 : -1);
    const fz = along === 'x' ? -1 : 0;
    ctx.cover(
      `yard-barrier-${i}`,
      b.x - fx * (hx + 0.45), b.z - fz * (hz + 0.45),
      fx, fz, b.high ? 'high' : 'low',
    );
  });

  /* Sandbag lines. */
  const sandbags = [
    { x: -8, z: 24.5 },
    { x: 3, z: 31.5 },
    { x: -5, z: 39 },
  ];
  sandbags.forEach((s, i) => {
    for (let row = 0; row < 3; row++) {
      const shrink = row * 0.18;
      slab(ctx, {
        x0: s.x - 1.6 + shrink, x1: s.x + 1.6 - shrink,
        z0: s.z - 0.36 + shrink * 0.5, z1: s.z + 0.36 - shrink * 0.5,
        y0: row * 0.28, y1: (row + 1) * 0.28,
        mat: PALETTE.sandbag, material: 'concrete', solid: row === 0,
        name: `yard-sandbags-${i}`, cast: row === 0,
      });
    }
    ctx.solid(b3(s.x - 1.6, 0, s.z - 0.4, s.x + 1.6, 0.85, s.z + 0.4));
    ctx.cover(`yard-sandbags-${i}`, s.x, s.z + 0.9, 0, -1, 'low');
  });

  /* Oil drums. */
  const drums = [
    [-10.5, 31.5], [-9.2, 32.6], [6.5, 26.5], [13, 32], [0.5, 41.5], [-14, 35],
  ];
  drums.forEach(([dx, dz], i) => {
    post(ctx, {
      x: dx, y: 0.45, z: dz, r: 0.3, h: 0.9,
      mat: i % 2 ? PALETTE.rust : PALETTE.paint, material: 'metal',
      thickness: 0.004, solid: true, name: `yard-drum-${i}`,
    });
    slab(ctx, {
      x0: dx - 0.31, x1: dx + 0.31, z0: dz - 0.31, z1: dz + 0.31,
      y0: 0.9, y1: 0.94, mat: PALETTE.steelDark, material: 'metal',
      thickness: 0.004, name: `yard-drum-${i}-lid`, cast: false,
    });
    if (i % 2 === 0) {
      ctx.cover(`yard-drum-${i}`, dx, dz + 0.85, 0, -1, 'low');
    }
  });

  /* Two junked cars, parked nose to tail. */
  buildCar(ctx, -6.5, 28.5, 0, PALETTE.carBlue, 'yard-car-a');
  buildCar(ctx, 9.5, 34.5, Math.PI / 2, PALETTE.carRed, 'yard-car-b');
  ctx.cover('yard-car-a-n', -6.5, 30.2, 0, -1, 'high');
  ctx.cover('yard-car-a-w', -8.9, 28.5, 1, 0, 'low');
  ctx.cover('yard-car-b-e', 11.0, 34.5, -1, 0, 'high');
  ctx.cover('yard-car-b-s', 9.5, 36.9, 0, -1, 'low');

  /* A short breaching wall pair so the yard has one hard corner. */
  slab(ctx, {
    x0: -15, x1: -9.5, z0: 43.4, z1: 43.7, y0: 0, y1: 2.6,
    mat: PALETTE.concreteDark, material: 'concrete', solid: true,
    name: 'yard-gate-wall-w',
  });
  slab(ctx, {
    x0: 9.5, x1: 15, z0: 43.4, z1: 43.7, y0: 0, y1: 2.6,
    mat: PALETTE.concreteDark, material: 'concrete', solid: true,
    name: 'yard-gate-wall-e',
  });
  for (const gx of [-9.5, 9.5]) {
    post(ctx, {
      x: gx, y: 1.5, z: 43.55, r: 0.16, h: 3, mat: PALETTE.steel,
      material: 'metal', solid: true, name: 'yard-gate-post',
    });
  }
  ctx.cover('yard-gate-w', -10.4, 42.6, 0, -1, 'high');
  ctx.cover('yard-gate-e', 10.4, 42.6, 0, -1, 'high');
}

/* ================================================================== */
/* 5. Long lane (east)                                                  */
/* ================================================================== */

function buildLongLane(ctx) {
  const L = LAB.LANE;
  const min = rectMin(L);
  const max = rectMax(L);

  slab(ctx, {
    x0: min.x, x1: max.x, z0: min.z, z1: max.z, y0: -0.02, y1: 0.02,
    mat: PALETTE.pad, material: 'concrete', name: 'lane-pad', cast: false,
  });
  // Firing platform: steel deck, so footsteps read differently.
  slab(ctx, {
    x0: 26.5, x1: 33.5, z0: L.firingZ - 2.5, z1: L.firingZ + 1.5, y0: 0, y1: 0.2,
    mat: PALETTE.steelDark, material: 'metal', thickness: 0.004,
    name: 'lane-platform', cast: false,
  });
  ctx.zone(26.5, L.firingZ - 2.5, 33.5, L.firingZ + 1.5, 'metal', -0.1, 0.3);
  ctx.floor(26.5, L.firingZ - 2.5, 33.5, L.firingZ + 1.5, 0.2);
  slab(ctx, {
    x0: 27.5, x1: 32.5, z0: L.firingZ - 1.2, z1: L.firingZ - 0.4, y0: 0.2, y1: 0.75,
    mat: PALETTE.ply, material: 'wood', thickness: 0.03, solid: true,
    name: 'lane-rest',
  });

  // Containing berms down both sides.
  for (const sx of [min.x - 0.8, max.x + 0.8]) {
    slab(ctx, {
      x0: sx - 1, x1: sx + 1, z0: L.gongZ - 3, z1: L.firingZ, y0: 0, y1: 2.6,
      mat: PALETTE.berm, material: 'concrete', solid: true, name: 'lane-berm',
    });
  }

  /* Distance boards, hung off the lane sides in pairs so the centre of the
   * lane stays clear all the way to the gong. */
  L.markZ.forEach((mz, i) => {
    const label = L.marks[i];
    for (const side of [-1, 1]) {
      const px = 30 + side * 3.6;
      slab(ctx, {
        x0: px - 0.08, x1: px + 0.08, z0: mz - 0.08, z1: mz + 0.08, y0: 0, y1: 1.9,
        mat: PALETTE.woodDark, material: 'wood', thickness: 0.06,
        name: `lane-board-post-${label}`,
      });
      const board = slab(ctx, {
        x0: px - (side < 0 ? 0.7 : 0.1), x1: px + (side < 0 ? 0.1 : 0.7),
        z0: mz - 0.03, z1: mz + 0.03, y0: 1.25, y1: 1.9,
        mat: i % 2 ? PALETTE.paintWhite : PALETTE.paintYellow,
        material: 'wood', thickness: 0.03, name: `lane-board-${label}m`, cast: false,
      });
      board.userData.targetId = `lane-mark-${label}-${side < 0 ? 'w' : 'e'}`;
      ctx.blocker(b3(px - 0.8, 0, mz - 0.3, px + 0.8, 1.9, mz + 0.3, 0));
    }
  });

  // The gong: a steel plate hung in an A-frame at 100m.
  for (const sx of [28.4, 31.6]) {
    slab(ctx, {
      x0: sx - 0.1, x1: sx + 0.1, z0: L.gongZ - 0.12, z1: L.gongZ + 0.12,
      y0: 0, y1: 2.6, mat: PALETTE.steelDark, material: 'metal',
      name: 'lane-gong-post', solid: true,
    });
  }
  slab(ctx, {
    x0: 28.3, x1: 31.7, z0: L.gongZ - 0.09, z1: L.gongZ + 0.09, y0: 2.5, y1: 2.66,
    mat: PALETTE.steelDark, material: 'metal', name: 'lane-gong-beam', cast: false,
  });
  const gong = post(ctx, {
    x: 30, y: 1.55, z: L.gongZ, r: 0.55, h: 0.02, seg: 20, rotX: Math.PI / 2,
    mat: PALETTE.brass, material: 'metal', thickness: 0.02, name: 'lane-gong',
  });
  gong.userData.targetId = 'gong-100m';
  for (const sx of [29.6, 30.4]) {
    slab(ctx, {
      x0: sx - 0.02, x1: sx + 0.02, z0: L.gongZ - 0.02, z1: L.gongZ + 0.02,
      y0: 2.05, y1: 2.55, mat: PALETTE.steel, material: 'metal', thickness: 0.004,
      name: 'lane-gong-chain', cast: false,
    });
  }
  ctx.blocker(b3(28.2, 0, L.gongZ - 0.5, 31.8, 2.7, L.gongZ + 0.5, 0));

  ctx.cover('lane-rest-w', 28.2, L.firingZ, 0, -1, 'low');
  ctx.cover('lane-rest-e', 31.8, L.firingZ, 0, -1, 'low');
}

/* ================================================================== */
/* 6. Armory wall (west, by the player spawn)                           */
/* ================================================================== */

function buildArmoryWall(ctx) {
  const A = LAB.ARMORY;
  const z0 = A.z - A.d / 2;
  const z1 = A.z + A.d / 2;
  const wallX = A.x;

  slab(ctx, {
    x0: wallX - 0.15, x1: wallX + 0.15, z0, z1, y0: 0, y1: 3.0,
    mat: PALETTE.concrete, material: 'concrete', solid: true, name: 'armory-wall',
  });
  slab(ctx, {
    x0: wallX - 0.2, x1: wallX + 3.4, z0: z0 - 0.4, z1: z1 + 0.4, y0: 3.0, y1: 3.2,
    mat: PALETTE.steelDark, material: 'metal', thickness: 0.004,
    name: 'armory-roof', cast: true,
  });
  for (const pz of [z0 - 0.2, z1 + 0.2]) {
    slab(ctx, {
      x0: wallX + 3.05, x1: wallX + 3.35, z0: pz - 0.15, z1: pz + 0.15,
      y0: 0, y1: 3.0, mat: PALETTE.steelDark, material: 'metal',
      solid: true, name: 'armory-post',
    });
  }
  slab(ctx, {
    x0: wallX, x1: wallX + 3.6, z0: z0 - 0.5, z1: z1 + 0.5, y0: 0, y1: 0.12,
    mat: PALETTE.concrete, material: 'concrete', name: 'armory-pad', cast: false,
  });
  ctx.zone(wallX, z0 - 0.5, wallX + 3.6, z1 + 0.5, 'concrete', -0.1, 0.3);
  ctx.floor(wallX, z0 - 0.5, wallX + 3.6, z1 + 0.5, 0.12);
  // A bench along the back wall so the shelter reads as a prep area.
  slab(ctx, {
    x0: wallX + 0.2, x1: wallX + 0.9, z0: z0 + 0.6, z1: z1 - 0.6, y0: 0.85, y1: 0.93,
    mat: PALETTE.ply, material: 'wood', thickness: 0.03, solid: true,
    name: 'armory-bench',
  });
  ctx.cover('armory-bench', wallX + 1.5, A.z, 1, 0, 'low');
}

/* ================================================================== */
/* Spawns                                                               */
/* ================================================================== */

function makeSpawns() {
  const player = { x: -30, z: 26, yaw: yawToward(-30, 26, 0, 4) };
  return {
    player,
    friendly: { x: -28.5, z: 22.5 },
    armoryWall: { x: LAB.ARMORY.x + 0.6, z: LAB.ARMORY.z, rotY: -Math.PI / 2 },
    rangeBench: { x: -16.5, z: -6.6, yaw: 0 },
    materialWall: { x: 11, z: LAB.MATERIAL_WALL.firingZ, yaw: 0 },
    laneFiringPoint: { x: 30, z: LAB.LANE.firingZ - 1.8, yaw: 0 },
    enemyGroups: {
      yard: [
        { x: -11.5, z: 22.2 }, { x: -3.5, z: 21.8 }, { x: 5.5, z: 22.8 },
        { x: 12.5, z: 26.5 }, { x: -12.5, z: 30.5 }, { x: -1, z: 29 },
        { x: 6.0, z: 31.5 }, { x: 2.5, z: 37 }, { x: -12, z: 41 },
      ],
      killhouseGround: [
        { x: -7.5, z: 4.5 }, { x: -4.0, z: 6.8 }, { x: 5.5, z: 2.5 },
        { x: 3.0, z: 10.4 }, { x: -8.4, z: 10.2 }, { x: 8.6, z: -2.5 },
      ],
      killhouseUpper: [
        { x: -5.5, z: 0.6, y: UPPER_Y }, { x: 3.5, z: 4.5, y: UPPER_Y },
        { x: -4.0, z: 10.2, y: UPPER_Y }, { x: 7.6, z: -0.2, y: UPPER_Y },
      ],
      lane: [
        { x: 29.2, z: 8 }, { x: 30.8, z: -22 },
      ],
    },
    reinforcementDoors: [
      { id: 'yard-gate', x: LAB.YARD.gateX, z: 43.6, yaw: 0 },
      { id: 'killhouse-rear', x: 5.2, z: 12.9, yaw: 0 },
    ],
    stress: [
      { x: -24, z: 40 }, { x: -14, z: 46 }, { x: 0, z: 48 }, { x: 14, z: 46 },
      { x: 22, z: 40 }, { x: 30, z: 30 }, { x: 22, z: 14 }, { x: 20, z: -2 },
      { x: -22, z: 12 }, { x: -30, z: 2 }, { x: -20, z: -4 }, { x: -6, z: -14 },
      { x: 8, z: -14 }, { x: 22, z: -30 }, { x: -30, z: 34 }, { x: 16, z: 6 },
    ],
  };
}

/* ================================================================== */
/* Entry point                                                          */
/* ================================================================== */

/**
 * Build the whole combat lab into `scene`.
 * @param {THREE.Scene|{add:Function}} scene
 */
export function buildCombatLab(scene) {
  const root = new THREE.Group();
  root.name = 'combat-lab';
  const ctx = makeCtx(root);

  buildLights(ctx);
  buildGround(ctx);
  const movingTargets = buildRange(ctx);
  buildMaterialWall(ctx);
  const doors = buildKillhouse(ctx);
  buildYard(ctx);
  buildLongLane(ctx);
  buildArmoryWall(ctx);
  buildPerimeter(ctx);

  // Specific floor surfaces are pushed before the pad-wide fallback in
  // buildGround, but zone order is "first match wins" in player.surfaceAt(),
  // so the pad zone is rotated to the back here.
  const padIndex = ctx.floorZones.findIndex((z) => z.surface === 'concrete'
    && z.box.min.x <= -41 && z.box.max.x >= 41);
  if (padIndex >= 0) ctx.floorZones.push(ctx.floorZones.splice(padIndex, 1)[0]);

  const floors = ctx.floors;

  /**
   * Height of the walkable surface at (x, z).
   * @param {number} x
   * @param {number} z
   * @param {number|null} fromY height the query is made from. Omit for "the
   *   topmost surface here" (what the AI and the layout tests want); pass the
   *   querying actor's current ground to get the surface it can actually step
   *   to, which is what a first person controller needs indoors.
   */
  function groundAt(x, z, fromY = null) {
    let best = 0;
    for (const f of floors) {
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
      let h;
      if (f.axis === 'z') {
        const t = (z - f.z0) / (f.z1 - f.z0);
        h = f.y0 + (f.y1 - f.y0) * t;
      } else {
        h = f.y;
      }
      if (h <= best) continue;
      if (fromY !== null && h > fromY + STEP_UP) continue;
      best = h;
    }
    return best;
  }

  /** Every walkable height at (x, z), low to high -- for AI floor picking. */
  function floorsAt(x, z) {
    const out = [0];
    for (const f of floors) {
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
      out.push(f.axis === 'z'
        ? f.y0 + (f.y1 - f.y0) * ((z - f.z0) / (f.z1 - f.z0))
        : f.y);
    }
    return [...new Set(out.map((h) => Math.round(h * 1000) / 1000))].sort((a, b) => a - b);
  }

  scene.add(root);

  return {
    group: root,
    colliders: ctx.colliders,
    navBlockers: ctx.navBlockers,
    floorZones: ctx.floorZones,
    groundAt,
    floorsAt,
    hitMeshes: ctx.hitMeshes,
    coverPoints: ctx.coverPoints,
    spawns: makeSpawns(),
    movingTargets,
    doors,
    /** Drop the level from the scene (materials/geometry are shared caches). */
    dispose() {
      root.parent?.remove(root);
    },
  };
}
