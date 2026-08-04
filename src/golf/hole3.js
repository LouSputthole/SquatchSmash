/**
 * HOLE 3 — THE BIG NIGHT · PAR 4 · 395 YARDS
 *
 * Layout data only. Same conventions as the first two: tee near the origin,
 * the hole plays along −Z, and it is the only hole loaded while it is being
 * played, so its coordinates are its own.
 *
 * The last hole has one job the other two do not: it has to end somewhere.
 * So it bends gently left and finishes with the clubhouse standing square
 * behind the green — the building he walked past three hours ago, back in
 * front of him, with the round over and seven o'clock still to come. Nobody
 * says anything about that. It is just there, and it is the reason the green
 * is where it is.
 *
 * Mechanically it is the most ordinary hole on the course, deliberately. A
 * driver and a mid iron, no water, no forced carry, nothing clever. The last
 * hole of this round is not the place to be asking a player to concentrate on
 * golf.
 */

import { toMetres } from './course.js';

export const TEE = Object.freeze({ x: 0, y: 2.4, z: 0 });

/**
 * A long, easy bend to the left. 361 metres of centreline, 395 on the marker.
 *
 * Wide enough to be generous — this is the hole where the conversation is
 * supposed to be the difficult part.
 */
export const CORRIDOR = Object.freeze({
  path: Object.freeze([
    Object.freeze({ x: 0, z: -6, halfWidth: 20 }),
    Object.freeze({ x: -6, z: -150, halfWidth: 18 }),
    Object.freeze({ x: -14, z: -260, halfWidth: 16 }),
    Object.freeze({ x: -18, z: -330, halfWidth: 18 }),
  ]),
});

export const GREEN = Object.freeze({
  x: -21, z: -361,
  rx: 13, rz: 11,            // 26m × 22m
  slopeFront: 0.32,
  slopePond: 0.14,
  fringe: 3.0,
});

/** Front-right, so the approach is a decision without being a punishment. */
export const PIN = Object.freeze({ x: -16, z: -357 });

export const CUP_RADIUS = 0.108 / 2;
export const FLAG_HEIGHT = 2.45;

/** No water. The last hole is not the place to lose a ball. */
export const POND = null;

/** Two flanking the green, and one out where a good drive wants to finish. */
export const LEFT_BUNKER = Object.freeze({ x: -38, z: -357, rx: 7, rz: 5.5, depth: 1.0 });
export const RIGHT_BUNKER = Object.freeze({ x: -5, z: -349, rx: 6.5, rz: 5, depth: 0.95 });
export const FAIRWAY_BUNKER = Object.freeze({ x: -4, z: -218, rx: 8, rz: 6.5, depth: 1.05 });
export const BUNKER = LEFT_BUNKER;

export const CART_PATH = Object.freeze([
  Object.freeze({ x: 20, z: 10 }), Object.freeze({ x: 16, z: -120 }),
  Object.freeze({ x: 8, z: -250 }), Object.freeze({ x: 0, z: -330 }),
  Object.freeze({ x: -6, z: -372 }),
]);
export const CART_PATH_WIDTH = 2.7;

/** Beside the last green, in front of the clubhouse. Where the morning ends. */
export const CART_PARK = Object.freeze({ x: -6, z: -372 });

/** On the opposite side of the cart park from the gallery, so nobody has to
 * walk through the crew to reach it. Last one of the round. */
export const SIDE_COOLER = Object.freeze({ x: -1.5, z: -368.5, rot: 0.15 });

export const DROP_ZONE = Object.freeze({ x: -14, z: -310 });

export const BOUNDS = Object.freeze({ minX: -78, maxX: 62, minZ: -412, maxZ: 42 });

export const TERRAIN = Object.freeze({
  minX: -92, maxX: 76, minZ: -430, maxZ: 56, cell: 2.0,
});

export const WIND = Object.freeze({
  mph: 5,
  speed: toMetres(5 * 1760) / 3600,
  dirX: 1, dirZ: -0.18,
  label: 'L → R',
});

export const TEE_MARKS = Object.freeze({
  ball: Object.freeze({ x: 0.7, z: -1.4 }),
  lou: Object.freeze({ x: -2.7, z: 1.6 }),
  rippinflow: Object.freeze({ x: 3.0, z: 2.0 }),
  eric: Object.freeze({ x: -0.4, z: 2.8 }),
  prospect: Object.freeze({ x: 0.6, z: 3.5 }),
});

/** He is not arriving. He has been here all morning. */
export const LOT = null;
export const LOT_AREA = null;

/**
 * Square behind the green, close enough to read the windows.
 *
 * On Hole 1 this building was scenery in the distance and the place he parked.
 * Here it is the backstop of the last green, which is the only staging this
 * hole does and the only thing it needs to say.
 */
export const CLUBHOUSE = Object.freeze({ x: -24, z: -392, rot: 0.06 });

/** The apron of mown ground round the clubhouse, so it is not standing in hay. */
export const CLUBHOUSE_AREA = Object.freeze({ x: -22, z: -388, rx: 34, rz: 22 });

/**
 * Drives, and the last authored shots of the morning.
 *
 * Eric down the middle, as he has been all day. Lou short and straight and
 * absolutely fine. Rippin enormous and in the fairway bunker, which is the
 * only place on this hole it is possible to be inconvenienced, and he has
 * found it — the last joke the course makes at his expense.
 */
export const NPC_TEE_SHOTS = Object.freeze({
  eric: Object.freeze({ target: Object.freeze({ x: -9, z: -228 }), club: 'driver', loftBias: 1.0 }),
  rippinflow: Object.freeze({ target: Object.freeze({ x: -4, z: -218 }), club: 'driver', loftBias: 0.98 }),
  lou: Object.freeze({ target: Object.freeze({ x: -7, z: -186 }), club: 'driver', loftBias: 0.92 }),
});

/** Rippin takes five again, and this time nobody argues about it. */
export const NPC_PLAN = Object.freeze({
  eric: Object.freeze({ finish: 4 }),
  lou: Object.freeze({ finish: 4 }),
  rippinflow: Object.freeze({ finish: 5 }),
});

export const TREE_BANDS = Object.freeze([
  Object.freeze({ x: -52, z: -180, rx: 20, rz: 150, count: 130, kind: 'pine' }),
  Object.freeze({ x: 40, z: -170, rx: 18, rz: 150, count: 120, kind: 'pine' }),
  /* Old hardwoods round the clubhouse rather than pines. Somebody planted
   * these when the club still had a waiting list. */
  Object.freeze({ x: -54, z: -390, rx: 18, rz: 20, count: 34, kind: 'oak' }),
  Object.freeze({ x: 14, z: -392, rx: 20, rz: 20, count: 36, kind: 'oak' }),
  Object.freeze({ x: 30, z: 8, rx: 20, rz: 24, count: 34, kind: 'mixed' }),
]);

/**
 * The gallery behind the last green.
 *
 * Lou's invitation was three holes "before the big job", and the big job is
 * THE TAKE. So the crew for it is already here, stood between the green and
 * the clubhouse with nothing to do but watch the fourth man finish: Booskibro,
 * The Shubenator, DeathMegatron, Numbskull and Snow. Rippinflow is not in this
 * list because he is playing.
 *
 * They are the reason the last hole has an audience and the reason the walk
 * off the green goes somewhere. Nobody announces them. They are just standing
 * there when Tony looks up, in a line between him and the building, and the
 * round stops being a morning off.
 *
 * Marks are authored on the clubhouse side of the green (`GREEN` is at
 * -21,-361 and the building at -24,-392), spread wide enough to read as a
 * loose group rather than a rank, and far enough back not to stand on the
 * putting surface or in the cart park at -6,-372. `yaw` faces each of them at
 * the pin.
 */
export const GALLERY = Object.freeze([
  Object.freeze({ id: 'booski', x: -27.5, z: -376.0, yaw: 0.34 }),
  Object.freeze({ id: 'shubenator', x: -22.0, z: -378.5, yaw: 0.19 }),
  Object.freeze({ id: 'deathmegatron', x: -17.2, z: -377.0, yaw: 0.03 }),
  Object.freeze({ id: 'numbskull', x: -12.4, z: -374.5, yaw: -0.17 }),
  Object.freeze({ id: 'snow', x: -31.6, z: -373.0, yaw: 0.50 }),
]);

/** Nothing after this one. */
export const NEXT_HINT = null;

export const LAYOUT = Object.freeze({
  number: 3, par: 4, yards: 395,
  tee: TEE, green: GREEN, pin: PIN, pond: POND, bunker: BUNKER,
  bunkers: Object.freeze([LEFT_BUNKER, RIGHT_BUNKER, FAIRWAY_BUNKER]),
  corridor: CORRIDOR, dropZone: DROP_ZONE, bounds: BOUNDS, terrain: TERRAIN,
  wind: WIND, cartPath: CART_PATH, cartPathWidth: CART_PATH_WIDTH,
  cartPark: CART_PARK, sideCooler: SIDE_COOLER, lot: LOT, lotArea: CLUBHOUSE_AREA, teeMarks: TEE_MARKS,
  npcTeeShots: NPC_TEE_SHOTS, npcPlan: NPC_PLAN, treeBands: TREE_BANDS,
  gallery: GALLERY,
  clubhouse: CLUBHOUSE, nextHint: NEXT_HINT,
  cupRadius: CUP_RADIUS, flagHeight: FLAG_HEIGHT,
});

export default LAYOUT;
