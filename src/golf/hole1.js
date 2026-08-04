/**
 * HOLE 1 — THE INVITATION · PAR 3 · 167 YARDS
 *
 * Layout data only, so terrain, cast, carts, the mission and the verifier all
 * read one set of numbers. No Three.js in here either.
 *
 * World axes: the hole plays along −Z. The tee sits near the origin about
 * 4.6m above the green. +X is right from the tee, which is where the pond is,
 * and which is the way the light morning wind pushes.
 */

import { toMetres } from './course.js';

export const TEE = Object.freeze({ x: 0, y: 4.6, z: 0 });

/* 167 yards is 152.7m, so the green centre sits that far from the marker. */
export const GREEN = Object.freeze({
  x: 6, z: -152.5,
  rx: 14, rz: 11.5,          // 28m × 23m
  slopeFront: 0.36,          // metres of fall, back edge to front edge
  slopePond: 0.22,           // extra fall toward the water (+X)
  fringe: 3.2,               // collar width
});

/* Middle-right. It shortcuts the pond corner, which is the entire point. */
export const PIN = Object.freeze({ x: 11.4, z: -150.4 });

export const CUP_RADIUS = 0.108 / 2;   // regulation 4¼"
/* Regulation is seven feet. This is eight, because from the tee the stick is
 * four pixels of purple against a wall of pine and the player is supposed to
 * be able to find it without being told where it is. */
export const FLAG_HEIGHT = 2.45;

/** Short and right. Punishes the greedy line at the flag. */
/**
 * Short and right. Punishes the greedy line at the flag.
 *
 * The waterline sits just under the surrounding grade rather than a metre and
 * a half down. Sunk deep, the near bank hides the water completely from an eye
 * on an elevated tee a hundred and forty metres away — which is realistic and
 * useless: a hazard the player cannot see is not a decision, it is an ambush.
 */
export const POND = Object.freeze({ x: 25, z: -137, rx: 14.5, rz: 13.5, level: -0.55 });

/** Front-left. The bail-out miss, and where Rippin is going to be. */
export const BUNKER = Object.freeze({ x: -8.5, z: -141.5, rx: 7.0, rz: 4.8, depth: 1.0 });

/**
 * The mown corridor between tee and green. Not a fairway on a par 3, but it
 * reads as one from the tee and it keeps a topped shot playable, which matters
 * more than the rulebook does here.
 */
export const CORRIDOR = Object.freeze({
  path: Object.freeze([
    Object.freeze({ x: 0, z: -4, halfWidth: 14 }),
    Object.freeze({ x: 5, z: -140, halfWidth: 21 }),
  ]),
});

/** Down the left, past the bunker, ending short-left of the green. */
export const CART_PATH = Object.freeze([
  Object.freeze({ x: -13, z: 14 }), Object.freeze({ x: -18, z: -22 }),
  Object.freeze({ x: -22, z: -58 }), Object.freeze({ x: -24, z: -96 }),
  Object.freeze({ x: -22, z: -126 }), Object.freeze({ x: -17.5, z: -146.5 }),
]);
export const CART_PATH_WIDTH = 2.7;
export const CART_PARK = Object.freeze({ x: -17.5, z: -146.5 });

/**
 * A stocked cooler standing off the path, level with the bunker and clear of
 * it, a few strides into the rough. The club's own amenity — restocked fresh
 * for every group and separate from whatever Lou packed onto the cart.
 */
export const SIDE_COOLER = Object.freeze({ x: -20.2, z: -145.3, rot: 0.35 });

/**
 * Where a ball that found the water is dropped: back on the tee side of the
 * hazard, on dry short grass, with a real shot to the green still in front of
 * him. A drop that leaves the player in trouble reads as a second penalty.
 */
export const DROP_ZONE = Object.freeze({ x: 3.5, z: -126 });

/** Outside this is out of bounds and gets the same drop treatment. */
export const BOUNDS = Object.freeze({ minX: -72, maxX: 76, minZ: -232, maxZ: 46 });

/** Heightfield sampling. 2m cells keep the mesh near 13k verts. */
export const TERRAIN = Object.freeze({
  minX: -88, maxX: 94, minZ: -250, maxZ: 58, cell: 2.0,
});

/** Five miles an hour, left to right, and it is worth about a club. */
export const WIND = Object.freeze({
  mph: 5,
  speed: toMetres(5 * 1760) / 3600,   // ≈ 2.24 m/s
  dirX: 1, dirZ: -0.18,
  label: 'L → R',
});

/** Where everybody stands on the tee box. */
export const TEE_MARKS = Object.freeze({
  ball: Object.freeze({ x: 0.9, z: -1.4 }),
  lou: Object.freeze({ x: -2.7, z: 1.6 }),
  rippinflow: Object.freeze({ x: 3.0, z: 1.9 }),
  eric: Object.freeze({ x: -0.5, z: 2.7 }),
  prospect: Object.freeze({ x: 0.5, z: 3.5 }),
});

/** The car park, where the morning opens. */
export const LOT = Object.freeze({
  centre: Object.freeze({ x: 6, z: 30 }),
  playerStart: Object.freeze({ x: 6.5, z: 38.5 }),
  lou: Object.freeze({ x: 2.6, z: 28.4 }),
  rippinflow: Object.freeze({ x: 9.6, z: 29.2 }),
  eric: Object.freeze({ x: 6.0, z: 26.6 }),
  carts: Object.freeze([
    Object.freeze({ x: -1.5, z: 31.5, rot: -0.15 }),
    Object.freeze({ x: 3.4, z: 32.2, rot: -0.10 }),
    Object.freeze({ x: 8.6, z: 32.6, rot: -0.05 }),
    Object.freeze({ x: 13.4, z: 32.4, rot: 0.05 }),
  ]),
  sign: Object.freeze({ x: -3.5, z: 14, rot: 0.18 }),
  bag: Object.freeze({ x: 5.0, z: 27.6 }),
  scorecard: Object.freeze({ x: 2.0, z: 27.0 }),
});

export const CLUBHOUSE = Object.freeze({ x: -34, z: 48, rot: 0.42 });

/** The mown ground around the car park and the clubhouse. Hole 1 only. */
export const LOT_AREA = Object.freeze({ x: -6, z: 30, rx: 44, rz: 26 });

/**
 * Deterministic NPC tee shots.
 *
 * These are targets the shot solver aims at, not teleports. The ball is
 * actually launched and actually flies there through the same physics the
 * player's does, so the flight, the bounce and the run-out are real — the
 * outcome is authored, the shot is not faked.
 */
export const NPC_TEE_SHOTS = Object.freeze({
  /* Centre of the green, about 22 feet. He is not interested in the flag. */
  eric: Object.freeze({ target: Object.freeze({ x: 4.9, z: -149.6 }), club: 'iron', loftBias: 1.0 }),
  /* At the flag, pulled left, front bunker. Exactly where he wanted it. */
  rippinflow: Object.freeze({ target: Object.freeze({ x: -8.2, z: -142.0 }), club: 'iron', loftBias: 1.05 }),
  /* Low, lands on the front fringe, releases onto the green. The oldest-man
   * shot there is, and it finishes inside Rippin's. */
  lou: Object.freeze({ target: Object.freeze({ x: 2.0, z: -147.0 }), club: 'iron', loftBias: 0.74, runOut: true }),
});

/**
 * What each of them takes. Authored, because these three numbers are dialogue:
 * Rippin's five is what the argument on the way to the second tee is about,
 * and Lou making par from the front fringe is what "It's closer than yours"
 * has to be true of.
 */
export const NPC_PLAN = Object.freeze({
  eric: Object.freeze({ finish: 3 }),
  lou: Object.freeze({ finish: 3 }),
  rippinflow: Object.freeze({ finish: 5 }),
});

/** Tree bands, filled procedurally, framing the hole without hand placement. */
export const TREE_BANDS = Object.freeze([
  Object.freeze({ x: -44, z: -70, rx: 24, rz: 88, count: 130, kind: 'pine' }),
  Object.freeze({ x: 50, z: -80, rx: 24, rz: 90, count: 130, kind: 'pine' }),
  /* Back far enough that the flag has sky behind it. Planted two metres off
   * the back edge, the treeline swallowed the stick from the tee and the hole
   * lost the one thing a player aims at. */
  Object.freeze({ x: 6, z: -198, rx: 50, rz: 16, count: 96, kind: 'mixed' }),
  Object.freeze({ x: -32, z: 8, rx: 16, rz: 24, count: 34, kind: 'oak' }),
  Object.freeze({ x: 40, z: 14, rx: 18, rz: 28, count: 38, kind: 'mixed' }),
  Object.freeze({ x: 30, z: -168, rx: 16, rz: 16, count: 28, kind: 'oak' }),
]);

/**
 * A hint of Hole 2 beyond the trees, visible from the tee: the next tee box
 * and a strip of its fairway heading away. It is scenery today and a promise
 * about where the round goes next.
 */
export const HOLE2_HINT = Object.freeze({
  tee: Object.freeze({ x: 34, z: -166 }),
  fairway: Object.freeze([
    Object.freeze({ x: 40, z: -178 }), Object.freeze({ x: 46, z: -204 }),
  ]),
});

export const LAYOUT = Object.freeze({
  number: 1, par: 3, yards: 167,
  tee: TEE, green: GREEN, pin: PIN, pond: POND, bunker: BUNKER,
  bunkers: Object.freeze([BUNKER]),
  corridor: CORRIDOR, dropZone: DROP_ZONE, bounds: BOUNDS, terrain: TERRAIN,
  wind: WIND, cartPath: CART_PATH, cartPathWidth: CART_PATH_WIDTH,
  cartPark: CART_PARK, sideCooler: SIDE_COOLER, lot: LOT, teeMarks: TEE_MARKS,
  npcTeeShots: NPC_TEE_SHOTS, npcPlan: NPC_PLAN, treeBands: TREE_BANDS,
  clubhouse: CLUBHOUSE, lotArea: LOT_AREA, nextHint: HOLE2_HINT,
  cupRadius: CUP_RADIUS, flagHeight: FLAG_HEIGHT,
});

export default LAYOUT;
