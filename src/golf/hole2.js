/**
 * HOLE 2 — THE LONG WALK · PAR 5 · 520 YARDS
 *
 * Layout data only, same as Hole 1. No Three.js and no logic.
 *
 * The par 3 was a single decision made once from an elevated tee. This one is
 * three decisions in a row and a lot of walking in between, which is what it
 * is for: it is the hole with room in it for a conversation that does not fit
 * between two shots.
 *
 * The shape is a dogleg right around a stand of pines. Off the tee it is
 * enormously wide — twenty-six metres of half-width, which is the game saying
 * *hit the driver, we mean it* after a hole where the driver was the wrong
 * answer. It then narrows to fifteen at the corner, so the second shot is the
 * one that costs something. The inside of the dogleg has a bunker in it,
 * because the corner is exactly where a player who has just been given a
 * driver will try to go.
 */

import { toMetres } from './course.js';

export const TEE = Object.freeze({ x: 0, y: 3.2, z: 0 });

/**
 * The mown centreline, bending right around the trees.
 *
 * Measured end to end this is 475 metres, which is 520 yards on the marker.
 * A dogleg's *played* length is the path, not the straight line — a player who
 * cuts the corner covers less ground than the card says, and gets a bunker for
 * his trouble.
 */
export const CORRIDOR = Object.freeze({
  path: Object.freeze([
    Object.freeze({ x: 0, z: -8, halfWidth: 26 }),      // wide open. Hit it.
    Object.freeze({ x: 12, z: -140, halfWidth: 24 }),
    Object.freeze({ x: 28, z: -270, halfWidth: 15 }),   // the corner, and it narrows
    Object.freeze({ x: 95, z: -370, halfWidth: 17 }),
    Object.freeze({ x: 150, z: -412, halfWidth: 20 }),
  ]),
});

export const GREEN = Object.freeze({
  x: 160, z: -422,
  rx: 15, rz: 12.5,          // 30m × 25m, bigger than the par 3's
  slopeFront: 0.30,
  slopePond: 0.10,           // a slight tilt to the right, and no water to fall into
  fringe: 3.0,
});

/** Back-left, so the long second shot is rewarded and the lay-up is not. */
export const PIN = Object.freeze({ x: 155, z: -426 });

export const CUP_RADIUS = 0.108 / 2;
export const FLAG_HEIGHT = 2.45;

/** No water on this hole. Hole 1 owns the pond. */
export const POND = null;

/**
 * The one that matters is the corner bunker: it sits on the inside of the
 * dogleg exactly where a driver aimed at the shortest line finishes.
 */
export const CORNER_BUNKER = Object.freeze({ x: 52, z: -286, rx: 10, rz: 8, depth: 1.15 });
export const BUNKER = Object.freeze({ x: 146, z: -409, rx: 7.5, rz: 5.5, depth: 1.0 });

export const CART_PATH = Object.freeze([
  Object.freeze({ x: -22, z: 8 }), Object.freeze({ x: -18, z: -110 }),
  Object.freeze({ x: -6, z: -240 }), Object.freeze({ x: 34, z: -330 }),
  Object.freeze({ x: 96, z: -396 }), Object.freeze({ x: 140, z: -430 }),
]);
export const CART_PATH_WIDTH = 2.7;
export const CART_PARK = Object.freeze({ x: 140, z: -430 });

export const DROP_ZONE = Object.freeze({ x: 120, z: -395 });

export const BOUNDS = Object.freeze({ minX: -62, maxX: 214, minZ: -472, maxZ: 44 });

/* Bigger ground than Hole 1, so a coarser grid: two and a half metres a cell
 * keeps the mesh near the same vertex count as the par 3 on nearly twice the
 * area, and this hole has no green-side slope subtle enough to need better. */
export const TERRAIN = Object.freeze({
  minX: -76, maxX: 228, minZ: -488, maxZ: 58, cell: 2.5,
});

/** The same morning, so the same breeze — but it is a crosswind out here. */
export const WIND = Object.freeze({
  mph: 5,
  speed: toMetres(5 * 1760) / 3600,
  dirX: 1, dirZ: -0.18,
  label: 'L → R',
});

export const TEE_MARKS = Object.freeze({
  ball: Object.freeze({ x: 0.6, z: -1.4 }),
  lou: Object.freeze({ x: -2.8, z: 1.5 }),
  rippinflow: Object.freeze({ x: 3.1, z: 2.0 }),
  erican: Object.freeze({ x: -0.4, z: 2.8 }),
  prospect: Object.freeze({ x: 0.6, z: 3.6 }),
});

/** No car park on this hole. He arrived at the course an hour ago. */
export const LOT = null;
export const LOT_AREA = null;

/** Visible over the trees from the second landing zone, not walked into. */
export const CLUBHOUSE = Object.freeze({ x: 196, z: -486, rot: -0.6 });

/**
 * Deterministic tee shots, and this time they are drives.
 *
 * Eric plays the corner properly — out to the wide side, leaving the angle.
 * Rippin aims at the corner itself, because of course he does, and finds the
 * bunker that is there for precisely that reason. Lou hits it nowhere near as
 * far as either of them and is in the middle of the fairway, which is the
 * whole man in one shot.
 */
export const NPC_TEE_SHOTS = Object.freeze({
  erican: Object.freeze({ target: Object.freeze({ x: 6, z: -218 }), club: 'driver', loftBias: 1.0 }),
  rippinflow: Object.freeze({ target: Object.freeze({ x: 50, z: -282 }), club: 'driver', loftBias: 0.98 }),
  lou: Object.freeze({ target: Object.freeze({ x: 10, z: -176 }), club: 'driver', loftBias: 0.92 }),
});

/** Par for the two who can play; Rippin gets out of the corner in one more. */
export const NPC_PLAN = Object.freeze({
  erican: Object.freeze({ finish: 5 }),
  lou: Object.freeze({ finish: 5 }),
  rippinflow: Object.freeze({ finish: 6 }),
});

/** The stand of pines the hole bends around, and the walls either side. */
export const TREE_BANDS = Object.freeze([
  /* The dogleg itself. Big, close, and the reason the corner is a decision
   * rather than a straight line. */
  Object.freeze({ x: 78, z: -276, rx: 30, rz: 46, count: 150, kind: 'pine' }),
  Object.freeze({ x: -46, z: -150, rx: 22, rz: 130, count: 150, kind: 'pine' }),
  Object.freeze({ x: 60, z: -60, rx: 34, rz: 60, count: 90, kind: 'mixed' }),
  Object.freeze({ x: 120, z: -470, rx: 60, rz: 20, count: 90, kind: 'mixed' }),
  Object.freeze({ x: 190, z: -370, rx: 22, rz: 60, count: 70, kind: 'oak' }),
  Object.freeze({ x: 20, z: -430, rx: 40, rz: 24, count: 60, kind: 'oak' }),
]);

/** Hole 3's tee, off past the green. */
export const NEXT_HINT = Object.freeze({
  tee: Object.freeze({ x: 186, z: -444 }),
});

export const LAYOUT = Object.freeze({
  number: 2, par: 5, yards: 520,
  tee: TEE, green: GREEN, pin: PIN, pond: POND, bunker: BUNKER,
  bunkers: Object.freeze([BUNKER, CORNER_BUNKER]),
  cornerBunker: CORNER_BUNKER,
  corridor: CORRIDOR, dropZone: DROP_ZONE, bounds: BOUNDS, terrain: TERRAIN,
  wind: WIND, cartPath: CART_PATH, cartPathWidth: CART_PATH_WIDTH,
  cartPark: CART_PARK, lot: LOT, lotArea: LOT_AREA, teeMarks: TEE_MARKS,
  npcTeeShots: NPC_TEE_SHOTS, npcPlan: NPC_PLAN, treeBands: TREE_BANDS,
  clubhouse: CLUBHOUSE, nextHint: NEXT_HINT,
  cupRadius: CUP_RADIUS, flagHeight: FLAG_HEIGHT,
});

export default LAYOUT;
