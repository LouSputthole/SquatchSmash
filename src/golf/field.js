/**
 * The ground itself: one height function, one surface function, no Three.js.
 *
 * Everything that needs to know the shape of the hole asks this module — the
 * mesh builder, the ball, the walking player, the carts, the NPC shot solver
 * and the node tests. That is the whole reason it is separate from
 * `terrain.js`: a green that slopes one way in the renderer and another way in
 * the physics is the single worst bug this scene could have, so there is only
 * one green.
 *
 * All heights are metres, all angles radians, +X is right from the tee and the
 * hole plays along −Z.
 */

import { SURFACE } from './course.js';
import LAYOUT, {
  GREEN, PIN, POND, BUNKER, CORRIDOR, TEE, CART_PATH, CART_PATH_WIDTH, BOUNDS,
} from './hole1.js';

/* ------------------------------------------------------------------ */
/* Deterministic value noise                                           */
/* ------------------------------------------------------------------ */
/* Seeded and pure: the course is identical on every load and in every test.
 * A golf hole that is subtly different each time you play it is not a golf
 * hole, it is a rumour. */

function hash2(i, j) {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

function smootherstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function noise2(x, z) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = smootherstep(x - i);
  const fz = smootherstep(z - j);
  const a = hash2(i, j);
  const b = hash2(i + 1, j);
  const c = hash2(i, j + 1);
  const d = hash2(i + 1, j + 1);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

/* ------------------------------------------------------------------ */
/* Region helpers                                                      */
/* ------------------------------------------------------------------ */

/** Normalised radius inside an ellipse: 0 at the centre, 1 on the edge. */
export function ellipseT(x, z, e) {
  const dx = (x - e.x) / e.rx;
  const dz = (z - e.z) / e.rz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Centre of the mown corridor at a given distance down the hole. */
function corridorCentreX(z) {
  const { from, to } = CORRIDOR;
  const t = clamp01((z - from.z) / (to.z - from.z));
  return lerp(from.x, to.x, t);
}

function corridorHalfWidth(z) {
  const { from, to, halfWidth, endHalfWidth } = CORRIDOR;
  const t = clamp01((z - from.z) / (to.z - from.z));
  return lerp(halfWidth, endHalfWidth, t);
}

/** How far off the mown line, as a fraction of its half-width. */
export function corridorT(x, z) {
  if (z > CORRIDOR.from.z || z < CORRIDOR.to.z - 14) return Infinity;
  return Math.abs(x - corridorCentreX(z)) / corridorHalfWidth(z);
}

/** Nearest point on the cart path, and how far off it we are. */
export function nearestCartPathPoint(x, z) {
  let best = { x: CART_PATH[0].x, z: CART_PATH[0].z, distance: Infinity };
  for (let i = 0; i < CART_PATH.length - 1; i++) {
    const a = CART_PATH[i];
    const b = CART_PATH[i + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? clamp01(((x - a.x) * vx + (z - a.z) * vz) / len2) : 0;
    const px = a.x + vx * t;
    const pz = a.z + vz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.distance) best = { x: px, z: pz, distance: d };
  }
  return best;
}

/** Perpendicular distance to the cart path, in metres. */
export function cartPathDistance(x, z) {
  return nearestCartPathPoint(x, z).distance;
}

/* The tee box: a mown shelf, deliberately generous so a player who wanders
 * about up there is still on the tee. */
const TEE_BOX = { x: TEE.x, z: TEE.z + 1, rx: 8.5, rz: 7.0 };

/* The car park and the walk down to the first tee. Somebody mows this: it is
 * the first thing anybody sees of the club, and a clubhouse standing in
 * knee-deep hay is a different story about Lou's membership than the one this
 * scene is telling. */
const LOT_AREA = { x: -6, z: 30, rx: 44, rz: 26 };

/* ------------------------------------------------------------------ */
/* Height                                                              */
/* ------------------------------------------------------------------ */

/** The putting surface, before anything else is blended in. */
function greenSurfaceHeight(x, z) {
  /* Back-to-front, and a further tilt toward the water. Both gentle: this is
   * a green you can read by looking at it, which is the requirement. */
  const back = (GREEN.z - z) / GREEN.rz;      // +1 at the back edge
  const right = (x - GREEN.x) / GREEN.rx;     // +1 at the pond side
  return GREEN.slopeFront * back - GREEN.slopePond * right;
}

/** Everything except the authored features: the fall, the run-out, the roll. */
function baseHeight(x, z) {
  /* One continuous fall from the tee shelf down to green level, across the
   * whole length of the hole.
   *
   * This used to level out forty-five metres from the tee, and it made the
   * hole unreadable: from an eye six metres up looking at a green a hundred
   * and fifty metres away the depression angle is barely two degrees, so any
   * ground left standing in the middle hides everything the player is
   * supposed to be deciding about. A green you cannot see is a green you
   * cannot aim at, and the brief for this hole is that it explains itself
   * from the tee without a tutorial box. */
  const fall = smootherstep(clamp01((-z + 6) / 140));
  let h = TEE.y * (1 - fall);

  /* Past the green the ground lifts into the treeline and the next hole —
   * but well beyond the green rather than immediately behind it, so the
   * flagstick has sky behind it from the tee instead of a wall of pine. */
  h += 2.6 * smootherstep(clamp01((-z - 186) / 34));

  /* Long roll, then finer texture — but damped to nothing down the middle.
   * The rough keeps its lumps, which is where lumps are interesting; the
   * sightline from the tee to the flag stays clean, which is where they are
   * not. */
  const off = Math.abs(x - corridorCentreX(clamp(z, CORRIDOR.to.z, CORRIDOR.from.z)));
  const openness = 1 - clamp01((off - 6) / 26);
  const roll = 1 - 0.82 * openness;
  h += noise2(x * 0.013, z * 0.013) * 1.45 * roll;
  h += noise2(x * 0.048, z * 0.048) * 0.32 * roll;

  /* The sides rise toward the pines so the hole reads as a corridor rather
   * than a field with a flag in it. */
  h += 0.035 * Math.max(0, off - 27);

  return h;
}

/**
 * Ground height at a point, with every feature blended in.
 *
 * Order matters and is deliberate: the green flattens the roll under it, the
 * bunker is dug out of whatever is already there, and the pond is carved last
 * so nothing can fill it back in.
 */
export function heightAt(x, z) {
  let h = baseHeight(x, z);

  // The tee shelf is mown flat on top.
  const dt = ellipseT(x, z, TEE_BOX);
  if (dt < 1.5) {
    const w = 1 - smootherstep(clamp01((dt - 0.65) / 0.85));
    h = lerp(h, TEE.y, w);
  }

  /* The green is a plateau: full weight inside the edge, fading out across the
   * collar so the fringe is a real slope and not a step. */
  const dg = ellipseT(x, z, GREEN);
  if (dg < 2.0) {
    const collar = GREEN.fringe / ((GREEN.rx + GREEN.rz) / 2);
    const w = 1 - smootherstep(clamp01((dg - 1) / (collar + 0.35)));
    h = lerp(h, greenSurfaceHeight(x, z), w);
  }

  // The bunker is a bowl dug into whatever the ground was doing.
  const db = ellipseT(x, z, BUNKER);
  if (db < 1.25) {
    const bowl = 1 - smootherstep(clamp01(db / 1.05));
    h -= BUNKER.depth * bowl;
  }

  /* The pond basin, carved last.
   *
   * The carve has to cover the whole region the surface model calls water,
   * with the bank outside it — otherwise the edge of the pond is painted blue
   * at grass height and reads as a blue rug lying on the green. It is fully
   * carved by the time it reaches the waterline and drops well under the water
   * plane in the middle, so a ball that gets there is unambiguously wet with
   * no shallow lip to balance on. */
  const dp = ellipseT(x, z, POND);
  if (dp < 1.35) {
    const bottom = POND.level - 1.6;
    const w = 1 - smootherstep(clamp01((dp - 0.92) / 0.30));
    h = lerp(h, Math.min(h, lerp(bottom, POND.level - 0.35, clamp01(dp))), w);
  }

  /* The cart path is graded: it follows the ground along its length but is
   * flat across its width, which is why a ball that finds it kicks sideways
   * and runs instead of stopping. Sampling the height at the centreline rather
   * than here is what removes the cross-slope. */
  const cp = nearestCartPathPoint(x, z);
  if (cp.distance < CART_PATH_WIDTH * 1.6) {
    const w = 1 - smootherstep(clamp01(
      (cp.distance - CART_PATH_WIDTH * 0.5) / CART_PATH_WIDTH,
    ));
    if (w > 0) h = lerp(h, baseHeight(cp.x, cp.z) + 0.05, w);
  }

  return h;
}

/**
 * Surface normal, by central difference on `heightAt`.
 *
 * Returned as a plain object so the physics and the tests can use it without
 * a Vector3. `step` is a metre by default — wide enough to ignore the fine
 * noise octave, narrow enough to feel every slope that matters on a green.
 */
export function normalAt(x, z, step = 0.75) {
  const hL = heightAt(x - step, z);
  const hR = heightAt(x + step, z);
  const hD = heightAt(x, z - step);
  const hU = heightAt(x, z + step);
  const nx = (hL - hR) / (2 * step);
  const nz = (hD - hU) / (2 * step);
  const len = Math.hypot(nx, 1, nz);
  return { x: nx / len, y: 1 / len, z: nz / len };
}

/** Downhill gradient, metres of fall per metre travelled. Drives putt break. */
export function slopeAt(x, z, step = 0.75) {
  const hL = heightAt(x - step, z);
  const hR = heightAt(x + step, z);
  const hD = heightAt(x, z - step);
  const hU = heightAt(x, z + step);
  return { x: (hL - hR) / (2 * step), z: (hD - hU) / (2 * step) };
}

/* ------------------------------------------------------------------ */
/* Surface                                                             */
/* ------------------------------------------------------------------ */

/**
 * What a point is made of.
 *
 * Priority is deliberate. Water wins over everything so a ball that reaches
 * the pond is never quietly classified as rough; the green and its collar win
 * over the corridor; the corridor wins over rough. Out of bounds is not a
 * surface — the ball still lands on something — so it is asked separately.
 */
export function surfaceAt(x, z) {
  if (ellipseT(x, z, POND) <= 1) return SURFACE.WATER;

  const dg = ellipseT(x, z, GREEN);
  if (dg <= 1) return SURFACE.GREEN;
  const collar = GREEN.fringe / ((GREEN.rx + GREEN.rz) / 2);
  if (dg <= 1 + collar) return SURFACE.FRINGE;

  if (ellipseT(x, z, BUNKER) <= 1) return SURFACE.BUNKER;
  if (ellipseT(x, z, TEE_BOX) <= 1) return SURFACE.TEE;
  if (cartPathDistance(x, z) <= CART_PATH_WIDTH * 0.5) return SURFACE.PATH;
  if (ellipseT(x, z, LOT_AREA) <= 1) return SURFACE.FAIRWAY;

  const ct = corridorT(x, z);
  if (ct <= 1) return SURFACE.FAIRWAY;
  /* Rough gets heavier the further off line he is, and the wet stuff behind
   * the green is heavy everywhere. */
  if (ct <= 1.55) return SURFACE.ROUGH;
  if (z < GREEN.z - GREEN.rz - 4) return SURFACE.DEEP_ROUGH;
  return ct <= 2.4 ? SURFACE.ROUGH : SURFACE.DEEP_ROUGH;
}

export function isOutOfBounds(x, z) {
  return x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ;
}

/* ------------------------------------------------------------------ */
/* Queries the rest of the scene asks                                  */
/* ------------------------------------------------------------------ */

export function pinPosition() {
  return { x: PIN.x, y: heightAt(PIN.x, PIN.z), z: PIN.z };
}

export function distanceToPin(x, z) {
  return Math.hypot(x - PIN.x, z - PIN.z);
}

export function isOnGreen(x, z) {
  return surfaceAt(x, z) === SURFACE.GREEN;
}

/**
 * A legal, sensible place to drop.
 *
 * Walks back toward the tee along the line the ball travelled until it finds
 * dry, in-bounds, playable ground, and falls back to the hole's authored drop
 * zone if that search runs out. The contract the scene depends on: this never
 * returns water, never returns out of bounds, and never returns a spot the
 * player cannot hit a ball from.
 */
export function dropPointFor(fromX, fromZ, towardX = TEE.x, towardZ = TEE.z) {
  const dx = towardX - fromX;
  const dz = towardZ - fromZ;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;

  for (let d = 2; d <= len; d += 2) {
    const x = fromX + ux * d;
    const z = fromZ + uz * d;
    if (isOutOfBounds(x, z)) continue;
    const s = surfaceAt(x, z);
    if (s === SURFACE.WATER) continue;
    // Do not drop him in the sand as a favour.
    if (s === SURFACE.BUNKER) continue;
    return { x, z, y: heightAt(x, z), surface: s };
  }

  const { x, z } = LAYOUT.dropZone;
  return { x, z, y: heightAt(x, z), surface: surfaceAt(x, z) };
}

/**
 * The safe-recovery drop, for a ball that is stuck rather than lost: under a
 * cart, inside a tree, below the terrain, wedged somewhere unreachable.
 * Same guarantees as `dropPointFor`, but it keeps the player where he is if
 * where he is happens to be fine.
 */
export function recoveryPointFor(x, z) {
  if (!isOutOfBounds(x, z)) {
    const s = surfaceAt(x, z);
    if (s !== SURFACE.WATER) return { x, z, y: heightAt(x, z), surface: s };
  }
  return dropPointFor(x, z);
}

export { LAYOUT };
