/**
 * THE SPECIAL MEETING — the ground the road is cut into.
 *
 * One height function, one surface function, no THREE. Everything that needs
 * to know the shape of the forest asks here: the chunk mesher, the car's four
 * wheels, the walking player at the far end, the tree scatter, the rocks, the
 * undergrowth ring and the fog pockets. Golf keeps render and physics honest
 * the same way (`src/golf/field.js`), and for the same reason — ground that
 * slopes one way in the mesh and another under the tyres is the worst bug this
 * scene could have, because the whole scene is a car on that ground.
 *
 * WHAT THIS IS NOT
 *
 * Golf's field is tuned to make a corridor readable from the tee: it damps its
 * own noise to nothing down the middle, lifts the sides away from the mown
 * line and lays one continuous fall from tee to green. Every one of those is
 * the opposite of the brief here, so none of it is imported. What is taken
 * from it is the SHAPE of the module — pure functions, deterministic value
 * noise, features blended in a deliberate order, and one file that render and
 * physics both read.
 *
 * HOW THE GROUND IS BUILT, IN ORDER
 *
 *   1. The road's own surface height is the trend. Relief is added AROUND it
 *      rather than under it, which is what stops a thirty-metre climb from
 *      turning into a thirty-metre cliff where the grading blend runs out.
 *   2. Ridges, rolls and a fine lumpiness, all of them scaled up with distance
 *      from the road. Close in, the ground is what the graders left. Fifty
 *      metres out it is hillside.
 *   3. The road is graded in: crowned across its width, cut into the bank on
 *      the high side, and ditched on both.
 *   4. Ruts, and on the last stretch the hump of grass between them.
 *
 * There are no fairways, no mown anything, and nothing here is flat except the
 * spur at the end that they park on.
 */

import { nearestRoad, roadLength } from './road.js';

/* ------------------------------------------------------------------ */
/* Deterministic value noise                                           */
/* ------------------------------------------------------------------ */

/* Seeded and pure. The forest must be identical on every load: the geometry
 * gate hashes it, the tests measure it, and a wood that is subtly different
 * each time is a wood nobody can fix a report against. Different constants
 * from golf's on purpose — the same numbers would grow the same hillside. */
function hash2(i, j) {
  let h = Math.imul(i, 0x1b873593) ^ Math.imul(j, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

export function smootherstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function noise2(x, z) {
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

/** A 0..1 value that is stable for a place — used for "is there a rock here". */
export function hashAt(x, z, salt = 0) {
  return (hash2(Math.floor(x * 8.31) + salt * 7919, Math.floor(z * 8.31) - salt * 104729) + 1) * 0.5;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
/** 0 below `a`, 1 above `b`, smooth between. The workhorse of this file. */
const ramp = (v, a, b) => smootherstep(clamp01((v - a) / (b - a)));

/* ------------------------------------------------------------------ */
/* What a patch of ground is made of                                   */
/* ------------------------------------------------------------------ */

/**
 * Nine surfaces, and not one of them is grass anybody cut.
 *
 * `colour` is what the chunk mesher paints into vertex colour; `footstep` is
 * the cue group the walking player's boots ask for at the far end. The one
 * tarmac entry exists for the first ninety seconds and then never again.
 */
export const SURFACE = Object.freeze({
  TARMAC: 'tarmac',
  DIRT: 'dirt',
  RUT: 'rut',
  CROWN: 'crown',
  MUD: 'mud',
  VERGE: 'verge',
  DUFF: 'duff',
  FERN: 'fern',
  ROCK: 'rock',
  BOG: 'bog',
});

export const SURFACE_PROPS = Object.freeze({
  [SURFACE.TARMAC]: Object.freeze({ colour: 0x1d1f22, footstep: 'concrete', rough: 0.02 }),
  [SURFACE.DIRT]: Object.freeze({ colour: 0x4a3d2e, footstep: 'gravel', rough: 0.55 }),
  [SURFACE.RUT]: Object.freeze({ colour: 0x35291c, footstep: 'gravel', rough: 0.85 }),
  [SURFACE.CROWN]: Object.freeze({ colour: 0x3c4029, footstep: 'grass', rough: 0.7 }),
  [SURFACE.MUD]: Object.freeze({ colour: 0x2b2118, footstep: 'mud', rough: 1.0 }),
  [SURFACE.VERGE]: Object.freeze({ colour: 0x33361f, footstep: 'grass', rough: 0.8 }),
  [SURFACE.DUFF]: Object.freeze({ colour: 0x241f16, footstep: 'grass', rough: 0.6 }),
  [SURFACE.FERN]: Object.freeze({ colour: 0x22301c, footstep: 'grass', rough: 0.75 }),
  [SURFACE.ROCK]: Object.freeze({ colour: 0x3a3a3d, footstep: 'stone', rough: 0.4 }),
  [SURFACE.BOG]: Object.freeze({ colour: 0x1b1d16, footstep: 'mud', rough: 1.0 }),
});

export function surfaceProps(surface) {
  return SURFACE_PROPS[surface] ?? SURFACE_PROPS[SURFACE.DUFF];
}

/** True where a vehicle or a boot is on made road rather than on forest. */
export function isRoadSurface(surface) {
  return surface === SURFACE.TARMAC || surface === SURFACE.DIRT
    || surface === SURFACE.RUT || surface === SURFACE.CROWN;
}

/* ------------------------------------------------------------------ */
/* The road, seen from a point off it                                  */
/* ------------------------------------------------------------------ */

/**
 * Everything about a point's relationship with the road, in one call.
 *
 * `nearestRoad` is the expensive part of this file and half a dozen callers
 * used to ask for it twice — once for the height and again for the surface.
 * They ask for this instead and pass it back in.
 */
export function roadFrame(x, z) {
  const near = nearestRoad(x, z);
  /* Right of the direction of travel. Forward is (sin h, cos h), so right —
   * forward turned a quarter turn clockwise about +Y — is (-cos h, sin h).
   * The sign is what tells a cut bank from an embankment, so it is worth the
   * two lines of proof rather than a guess and a minus sign later. */
  const rx = -Math.cos(near.yaw);
  const rz = Math.sin(near.yaw);
  const offset = (x - near.x) * rx + (z - near.z) * rz;
  return {
    near,
    s: near.s,
    distance: near.distance,
    offset,
    halfWidth: near.halfWidth,
    stage: near.stage,
    /** Distance from the edge of the carriageway, negative while on it. */
    fromEdge: near.distance - near.halfWidth,
    paved: near.stage === 'outskirts' || near.stage === 'rural',
  };
}

/* ------------------------------------------------------------------ */
/* The lie of the land                                                 */
/* ------------------------------------------------------------------ */

/**
 * A smooth elevation for the whole map, solved FROM the road.
 *
 * The first version of this file took its trend from `nearestRoad().y`, which
 * is obvious, cheap and wrong: the route folds, and where the deep-woods track
 * passes thirty-five metres from the rural road it is twenty-two metres above
 * it. Reading the nearest road's height means the ground jumps those
 * twenty-two metres across the line halfway between them — a sheer wall
 * through the middle of the forest, on the Voronoi boundary of a data
 * structure, which is not a landform anybody would build.
 *
 * So the trend is a HARMONIC field instead. The road's own height is pinned
 * onto a coarse grid and the gaps are relaxed until they satisfy Laplace —
 * which is to say, until the ground between two switchbacks is the smoothest
 * surface that can join them. That is what a hillside with a road cut across
 * it actually is, and it is continuous everywhere by construction.
 *
 * Built once, lazily, in about the time one frame takes, and never again.
 */
const TREND = Object.freeze({
  minX: -140, maxX: 360, minZ: -320, maxZ: 100, cell: 8,
});
const TREND_W = Math.round((TREND.maxX - TREND.minX) / TREND.cell) + 1;
const TREND_H = Math.round((TREND.maxZ - TREND.minZ) / TREND.cell) + 1;
let _trend = null;

function buildTrend() {
  const n = TREND_W * TREND_H;
  const height = new Float32Array(n);
  const pinned = new Uint8Array(n);
  const sum = new Float64Array(n);
  const count = new Uint16Array(n);

  /* Pin every node the road comes NEAR — not only the ones it passes through.
   *
   * The first version pinned a node only if a road sample rounded onto it,
   * which on an eight-metre grid is one node every few samples. Between them
   * the relaxation sagged toward the unpinned country either side, so the
   * trend ran a metre and a half BELOW its own road: the whole track ended up
   * standing on an embankment nobody built, with a hundred-and-seventy-five
   * per cent fill slope down off both shoulders, and the headlights pointed
   * straight at it.
   *
   * A road is graded into the land on a bench. Pinning the bench — every node
   * within about a cell of the road, at the height of the road beside it — is
   * both the honest model and the thing that makes the shoulders gentle,
   * because there is then almost nothing for the grading blend to absorb.
   */
  const PIN_RADIUS = 7;
  for (let i = 0; i < n; i++) {
    const cx = i % TREND_W;
    const cz = (i - cx) / TREND_W;
    const x = TREND.minX + cx * TREND.cell;
    const z = TREND.minZ + cz * TREND.cell;
    const near = nearestRoad(x, z);
    if (near.distance > PIN_RADIUS) continue;
    sum[i] += near.y;
    count[i]++;
  }
  let mean = 0;
  let pinnedCount = 0;
  for (let i = 0; i < n; i++) {
    if (!count[i]) continue;
    height[i] = sum[i] / count[i];
    pinned[i] = 1;
    mean += height[i];
    pinnedCount++;
  }
  mean = pinnedCount ? mean / pinnedCount : 0;
  for (let i = 0; i < n; i++) if (!pinned[i]) height[i] = mean;

  /* Gauss-Seidel, in place, sweeping alternate directions so the solution does
   * not crawl across the grid one row per pass. Two hundred sweeps of a
   * 63 x 53 grid converges this to well under a centimetre and costs about a
   * megaflop, once, at load. Free boundaries: an edge cell simply copies its
   * neighbour, so the land flattens off at the horizon instead of being pinned
   * to a number nobody chose. */
  const at = (cx, cz) => height[
    clamp(cz, 0, TREND_H - 1) * TREND_W + clamp(cx, 0, TREND_W - 1)
  ];
  for (let pass = 0; pass < 200; pass++) {
    const forward = (pass & 1) === 0;
    for (let k = 0; k < n; k++) {
      const i = forward ? k : n - 1 - k;
      if (pinned[i]) continue;
      const cx = i % TREND_W;
      const cz = (i - cx) / TREND_W;
      height[i] = (at(cx - 1, cz) + at(cx + 1, cz) + at(cx, cz - 1) + at(cx, cz + 1)) * 0.25;
    }
  }
  return height;
}

/**
 * Elevation of the underlying land at a point, bilinear off the solved grid.
 *
 * Eight-metre cells: the creases bilinear leaves at that spacing are a couple
 * of centimetres on a hillside, and the relief noise added on top of this is
 * an order of magnitude bigger than they are.
 */
export function trendAt(x, z) {
  if (!_trend) _trend = buildTrend();
  const fx = clamp((x - TREND.minX) / TREND.cell, 0, TREND_W - 1.0001);
  const fz = clamp((z - TREND.minZ) / TREND.cell, 0, TREND_H - 1.0001);
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = fx - x0;
  const tz = fz - z0;
  const i = z0 * TREND_W + x0;
  const a = _trend[i];
  const b = _trend[i + 1];
  const c = _trend[i + TREND_W];
  const d = _trend[i + TREND_W + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/**
 * How wide the road's own mesh is — carriageway, shoulder and gutter.
 *
 * ONE number, because three things have to agree about it exactly. The ribbon
 * in `roadmesh.js` is drawn out to here at a fine cross-section, the terrain
 * chunks are sunk under it so a three-metre triangle can never poke through a
 * ten-centimetre camber, and the tree scatter refuses to plant inside it. When
 * these were three separate constants the deep-woods track had firs growing in
 * its own gutter and the verge tore through the road on every crest.
 *
 * The paved stretches get a real gutter and room for it. The track does not:
 * out there the trees come down to about two metres off the edge, which is
 * the whole feeling of the last forty seconds and is not worth trading for
 * drainage.
 */
export function corridorHalfWidth(frame) {
  return frame.paved ? frame.halfWidth + 4.4 : frame.halfWidth * 2.3;
}

/**
 * Steepness of the LAND, without the litter on it.
 *
 * `slopeAt` is the honest answer and it costs four `heightAt` calls, each of
 * which does its own `nearestRoad` — about twenty-five microseconds. Three of
 * the hottest loops in the scene were paying that per sample: the vertex
 * colour of every chunk vertex, the density test of every candidate tree, and
 * the rock test inside `surfaceAt`. Between them they turned a chunk build
 * into a fifty-millisecond hitch you could feel from the passenger seat.
 *
 * None of the three wants the fine answer. "Is this a hillside" is a question
 * about the land, and the land is already solved on a grid — so this is two
 * bilinear lookups instead of four full evaluations, and it is roughly forty
 * times cheaper. `slopeAt` stays exported for anything that needs the truth.
 */
export function landSlopeAt(x, z, step = 3) {
  const dx = trendAt(x + step, z) - trendAt(x - step, z);
  const dz = trendAt(x, z + step) - trendAt(x, z - step);
  return Math.hypot(dx, dz) / (2 * step);
}

/* ------------------------------------------------------------------ */
/* The one flat thing in the forest                                    */
/* ------------------------------------------------------------------ */

/**
 * The spur they park on, as numbers.
 *
 * Everything that needs it agrees here: the ground flattens over it, the
 * scatter refuses to plant on it, the parked cars stand on it and the trail
 * leaves from the far edge. It is the only levelled ground in the scene, and
 * what levelled it was tyres.
 *
 * It sits ON the end of the road rather than beside it, because the road's
 * last knot is the parking space — the car is delivered onto the pad by the
 * same line it has been following for a kilometre, and what sells the turn off
 * the track is the hairpin immediately before it, not a separate manoeuvre.
 */
export const CLEARING = Object.freeze({
  x: 136,
  z: -105,
  radius: 14.5,
  /** Where the trail leaves, and it leaves into the trees, not along the road. */
  trailhead: Object.freeze({ x: 126.5, z: -97.5 }),
});

/** 1 in the middle of the spur, 0 outside it. */
export function clearingWeight(x, z) {
  const d = Math.hypot(x - CLEARING.x, z - CLEARING.z);
  return 1 - ramp(d, CLEARING.radius * 0.62, CLEARING.radius);
}

/**
 * Height of the pad.
 *
 * Taken from the road at the pad's own centre rather than written down, so the
 * ribbon that draws the last of the track and the ground it is graded into
 * cannot end up at two different heights — which, at the one moment in the
 * scene when the player gets out and walks, would be a step in the dark.
 * Computed once: `nearestRoad` is the expensive call in this file and this one
 * never changes.
 */
let _padHeight = null;
export function clearingHeight() {
  if (_padHeight === null) _padHeight = roadFrame(CLEARING.x, CLEARING.z).near.y;
  return _padHeight;
}

/* ------------------------------------------------------------------ */
/* Height                                                              */
/* ------------------------------------------------------------------ */

/**
 * The hillside, before the road is cut into it.
 *
 * Relief is measured from the road's own height and ramped UP with distance,
 * so the ground the road runs through is only ever a metre or two off the
 * tarmac and the hills happen out where nobody is driving. That is the trick
 * that lets the route climb thirty-three metres without a single retaining
 * wall: the terrain is not a landscape the road was laid on, it is a landscape
 * derived from the road.
 */
function reliefAt(frame, x, z) {
  const d = frame.distance;

  /* A cross-slope, so the two sides of the road are never the same. Where this
   * is positive the right-hand side is uphill: the headlights sweep a cut bank
   * of roots and stone on the bends, and fall away into blackness on the
   * other. This one term does most of the work of making a road feel cut.
   *
   * SATURATED, not linear. Written as `tilt * offset` it kept climbing with
   * distance — a nineteen-degree cross-slope is right beside the road and
   * absurd sixty metres out, where it was stacking ten metres on top of the
   * ridges and standing the forest on a cliff. `tanh` holds the angle at the
   * roadside and flattens the term out once it has done its job. */
  const reach = 20;
  const tilt = noise2(frame.s * 0.006, 11.5) * 0.34;
  /* AND IT HAS TO DIE OUT BEFORE THE MEDIAL AXIS.
   *
   * Both `frame.s` and `frame.offset` are properties of the NEAREST road, and
   * the route folds — so halfway between two legs they both jump: the
   * arclength to a different part of the road, and the offset to the other
   * side of it. Any term built on them is discontinuous along that line.
   * Ramped merely UP with distance this one was worth six metres out there,
   * and the jump across the line was a three-metre step in the ground with
   * trees standing in mid-air over it, thirty-five metres from a road nobody
   * would have thought to look at.
   *
   * So the cross-slope is a ROADSIDE feature and is written as one: it comes
   * in over the first few metres, does its work in the cut-bank zone, and is
   * gone by sixteen — comfortably inside the seventeen and a half metres that
   * `minimumLegSeparation()` guarantees for the medial axis. Everything
   * further out is the trend and the noise, both of which are continuous
   * everywhere by construction. */
  const tiltReach = ramp(d, 1.5, 5) * (1 - ramp(d, 8, 16));
  let h = tilt * Math.tanh(frame.offset / reach) * reach * tiltReach;

  // Ridges: the shape of the country. Only felt properly away from the road.
  h += noise2(x * 0.0075, z * 0.0075) * 8.0 * ramp(d, 8, 70);
  h += noise2(x * 0.019, z * 0.019) * 2.8 * ramp(d, 4, 34);

  // Rolls and hummocks: the shape of the ground you would trip over.
  h += noise2(x * 0.055, z * 0.055) * 0.95 * ramp(d, 1.5, 12);
  h += noise2(x * 0.145, z * 0.145) * 0.28 * ramp(d, 0.8, 5);

  /* Hollows. Wide, shallow, and where the fog collects and the ground goes
   * soft — see `hollowAt`, which the fog pockets and the bog both read. */
  h -= hollowAt(x, z) * 2.6 * ramp(d, 1.5, 14);

  return h;
}

/**
 * How deep a hollow a place sits in, 0 to 1.
 *
 * Its own function because three separate things want the same answer and none
 * of them wants to re-derive it: the height (which digs it), the surface
 * (which calls the bottom of one bog) and the fog pockets (which sit in them).
 */
export function hollowAt(x, z) {
  const n = noise2(x * 0.011 + 40.3, z * 0.011 - 17.9);
  /* Tuned so that a good half of the forest is in a dip of some sort. The
   * first pass wanted `n` over 0.18 before anything counted as a hollow at
   * all, which this noise almost never reaches — so the ground had no basins
   * in it, the fog pockets that sit in basins never appeared anywhere in the
   * whole drive, and the one atmospheric effect the scene was built around was
   * silently absent. Broad and shallow is the shape wanted: uneven ground with
   * damp in the low bits, not a landscape of craters. */
  return smootherstep(clamp01((n + 0.02) / 0.5));
}

/**
 * The road's own surface, crowned and rutted.
 *
 * Returned separately from the ground so the ribbon mesh and the heightfield
 * cannot drift apart: the ribbon is drawn at exactly this height and the
 * terrain is graded to meet it.
 */
export function roadSurfaceHeight(frame) {
  const hw = frame.halfWidth;
  const off = Math.abs(frame.offset);
  let h = frame.near.y;

  /* Camber. Water has to come off it, so the middle is a few centimetres up
   * on the edges — about 2.5%, which is what a real road is built to. */
  h -= (off / hw) * (off / hw) * (frame.paved ? 0.075 : 0.06) * hw;

  if (!frame.paved) {
    /* Two ruts worn where the wheels go, and on the last stretch a hump of
     * grass down the middle that has never been driven on. A road that is two
     * lines in the ground reads as unmaintained from fifty metres, which is
     * the whole point of the last twenty minutes of driving. */
    const rut = Math.exp(-((off - hw * 0.52) ** 2) / (2 * (hw * 0.20) ** 2));
    h -= rut * 0.085;
    const hump = frame.stage === 'deep' ? Math.exp(-(off ** 2) / (2 * (hw * 0.26) ** 2)) : 0;
    h += hump * 0.045;
    // Washboard and potholes. Small, and the suspension finds every one.
    h += noise2(frame.s * 0.42, off * 0.6) * 0.028;
    h -= Math.max(0, noise2(frame.s * 0.11 + 5.2, off * 0.4) - 0.55) * 0.11;
  }
  return h;
}

/**
 * How far the grading blend may ever reach, in metres.
 *
 * Hard-capped, and the cap is not a taste judgement. `roadSurfaceHeight` is a
 * property of the NEAREST road, so it jumps where two legs are equidistant —
 * and anything multiplied by it has to be zero by then or the jump becomes a
 * cliff. `minimumLegSeparation()` guarantees the medial axis is never closer
 * than seventeen and a half metres, so thirteen is safe with margin, and the
 * inside of the tightest bend (a fifteen-metre radius) clears it too.
 *
 * Raising this to let the blend swallow a bigger drop is exactly the mistake
 * that put a three-and-a-half-metre step through the woods at s = 196.
 */
const BLEND_LIMIT = 13;

/**
 * Ground height at a point, with the road blended in.
 *
 * @param {number} x
 * @param {number} z
 * @param {object} [frame] a `roadFrame` already computed for this point.
 */
export function heightAt(x, z, frame = roadFrame(x, z)) {
  const base = trendAt(x, z) + reliefAt(frame, x, z);
  const hw = frame.halfWidth;
  const road = roadSurfaceHeight(frame);

  /* Grade the road in. Full weight across the carriageway, feathering out over
   * the verge — which is what turns the difference between the road and the
   * hillside into a cut bank on one side and a shoulder that falls away on the
   * other, without either of them being authored.
   *
   * THE BLEND IS AS LONG AS IT NEEDS TO BE, AND NOT LONGER.
   *
   * Two things pull against each other here. It should finish INSIDE the road
   * corridor, because the ribbon is drawn at half-metre resolution and the
   * ground beside it at three, so any curvature left outside the ribbon is
   * curvature a terrain triangle will cut the corner of and stand up through
   * the road. But it also has to absorb whatever the difference is between the
   * road and the hillside — and on the switchback, where the track runs along
   * the top of a bank twenty-two metres above the road it passed ten minutes
   * ago, a fixed blend was forcing that whole drop through a metre and a
   * quarter of shoulder. A three-hundred-and-seventy-per-cent bank. Not a
   * bank: a wall, and one the headlights point straight at.
   *
   * So the blend is the corridor's width normally — the poke-safe case, which
   * is nearly everywhere — and stretches beyond it only where the drop demands
   * it, capping the shoulder at about two in three. Out there the ground is a
   * long even slope, which is the one shape a coarse triangle CAN follow.
   */
  const drop = Math.abs(base - road);
  const blendEnd = Math.max(
    corridorHalfWidth(frame) * 0.72,
    Math.min(BLEND_LIMIT, drop * 1.5),
  );
  const w = 1 - ramp(frame.distance, hw * 0.85, blendEnd);
  let h = lerp(base, road, w);

  /* The ditch. Both sides, deeper where the track is unpaved, and it is what
   * makes the shoulder read as somewhere you would get stuck rather than
   * somewhere you would pull over. Cut after the grading blend so it survives
   * it, and rolled off before the trees start so nothing is planted in a
   * trench. */
  const ditchCentre = frame.paved ? hw + 1.45 : hw * 1.52;
  const ditchWidth = frame.paved ? 0.72 : hw * 0.28;
  const ditch = Math.exp(-((frame.distance - ditchCentre) ** 2) / (2 * ditchWidth ** 2))
    /* Masked off the carriageway itself. A Gaussian has no edges, and the tail
     * of this one was digging twenty-nine centimetres out of the nearside
     * wheel track — the ribbon drew a flat road and the ground under it had a
     * gutter in it. */
    * ramp(frame.distance, hw * 1.02, hw * 1.45);
  h -= ditch * (frame.paved ? 0.30 : 0.13);

  /* And the spur, last, so nothing can put a ditch or a rut back through the
   * one piece of ground anybody stands on. Flat, but not machined: a truck has
   * turned round on this a hundred times and it still has ridges in it. */
  const pad = clearingWeight(x, z);
  if (pad > 0) h = lerp(h, clearingHeight() + noise2(x * 0.26, z * 0.26) * 0.04, pad);

  return h;
}

/* THE ROAD IS THE GROUND.
 *
 * There is deliberately no second height function for the road surface. The
 * camber, the ruts, the hump and the gutter are all inside `heightAt`, and the
 * ribbon `roadmesh.js` draws is nothing but the SAME function tessellated
 * finely across the corridor while the terrain chunks tessellate it coarsely
 * and sit a few centimetres under it. Two functions were tried first and they
 * drifted apart within an afternoon — a road drawn flat over ground with a
 * gutter cut in it — which is what a second source of truth always does.
 */

/** Surface normal by central difference. Plain object, so tests need no THREE. */
export function normalAt(x, z, step = 0.7) {
  const hL = heightAt(x - step, z);
  const hR = heightAt(x + step, z);
  const hD = heightAt(x, z - step);
  const hU = heightAt(x, z + step);
  const nx = (hL - hR) / (2 * step);
  const nz = (hD - hU) / (2 * step);
  const len = Math.hypot(nx, 1, nz);
  return { x: nx / len, y: 1 / len, z: nz / len };
}

/** Steepness, metres of fall per metre travelled. Rocks and ferns read it. */
export function slopeAt(x, z, step = 1.2) {
  const hL = heightAt(x - step, z);
  const hR = heightAt(x + step, z);
  const hD = heightAt(x, z - step);
  const hU = heightAt(x, z + step);
  return Math.hypot((hR - hL) / (2 * step), (hU - hD) / (2 * step));
}

/* ------------------------------------------------------------------ */
/* Surface                                                             */
/* ------------------------------------------------------------------ */

/**
 * What a point is made of.
 *
 * Order is deliberate and it is the order a driver would see it in: the thing
 * he is driving on, then the mess at the edge of it, then the wood.
 */
export function surfaceAt(x, z, frame = roadFrame(x, z)) {
  const hw = frame.halfWidth;
  const d = frame.distance;
  const off = Math.abs(frame.offset);

  /* The spur, before anything else. It is a hole punched through the road's
   * own bands as well as through the forest — the track runs across it and is
   * the same bare dirt once it does, so asking about the carriageway first
   * would answer "verge" in the middle of the car park. */
  const pad = clearingWeight(x, z);
  if (pad > 0.3) return pad > 0.62 ? SURFACE.DIRT : SURFACE.MUD;

  if (d <= hw) {
    if (frame.paved) return SURFACE.TARMAC;
    if (frame.stage === 'deep' && off < hw * 0.24) return SURFACE.CROWN;
    if (off > hw * 0.30 && off < hw * 0.76) return SURFACE.RUT;
    return SURFACE.DIRT;
  }

  if (frame.paved) {
    // A metre of gravel and then whatever grows in a ditch.
    if (d <= hw + 0.9) return SURFACE.VERGE;
  } else {
    /* Churned. Everything that has ever turned round out here did it in this
     * strip, and it has not been dry since. Widened on the bends, where a car
     * running wide puts a wheel off the edge. */
    const churn = hw * (1.85 + Math.abs(frame.near.curvature) * 9);
    if (d <= churn) return SURFACE.MUD;
    if (d <= hw * 3.1) return SURFACE.VERGE;
  }

  // Forest floor, from here to the fog.
  if (hollowAt(x, z) > 0.9 && landSlopeAt(x, z) < 0.14) return SURFACE.BOG;
  if (landSlopeAt(x, z) > 0.5 && hashAt(x, z, 3) > 0.45) return SURFACE.ROCK;
  if (noise2(x * 0.085 + 3.1, z * 0.085 - 8.7) > 0.06) return SURFACE.FERN;
  return SURFACE.DUFF;
}

/** Ground under the player's boots at the far end. Signature the Player wants. */
export function groundAt(x, z) {
  return heightAt(x, z);
}

/* ------------------------------------------------------------------ */
/* How much forest, and where                                          */
/* ------------------------------------------------------------------ */

/**
 * Trees per square metre.
 *
 * This is the brief's progression, as one number: city outskirts, rural road,
 * dirt road, deep woods. It climbs with distance along the drive and again
 * with distance from the road, so the first stretch has a treeline forty
 * metres back across a field and the last has trunks a metre off the wing
 * mirror.
 *
 * The road itself and its muddy shoulder are excluded here rather than in the
 * scatter, so anything that wants to know whether a place could hold a tree —
 * the rocks, the deadfall, the fog pockets — gets the same answer.
 */
export function treeDensityAt(x, z, frame = roadFrame(x, z)) {
  const progress = clamp01(frame.s / roadLength());
  // Nothing grows on the road, in the gutter, or in the churn beside it.
  const clear = corridorHalfWidth(frame) + (frame.paved ? 0.8 : 0.5);
  if (frame.distance < clear) return 0;

  /* Four stages, blended rather than stepped: 0.014/m² at the edge of town is
   * a hedgerow with trees in it, 0.105/m² in the deep woods is a trunk every
   * three metres. */
  const stage = 0.016 + 0.114 * smootherstep(clamp01((progress - 0.06) / 0.72));

  /* Closing in. Fourteen metres of thinning at the edge of town, two and a
   * half by the deep woods — which is what puts trunks within arm's reach of
   * the wing mirror on the last stretch. At `14 - 9 * progress` the ramp was
   * still six metres wide at the end and the track ran down the middle of a
   * clearing. */
  const edge = ramp(frame.distance - clear, 0, 14 - 11.5 * progress);

  /* Clumps and clearings, because a forest with an even density reads as an
   * orchard. The low band is where the fog pockets and the bracken go. */
  const clump = 0.55 + 0.85 * clamp01(noise2(x * 0.022 - 6.4, z * 0.022 + 2.8) + 0.45);

  // Nothing grows in standing water or off a cliff.
  const wet = 1 - hollowAt(x, z) * 0.42;
  /* Only a genuine cliff refuses to hold a tree. The first pass took a fifth
   * off the density at every slope over about forty degrees, which is most of
   * a hillside, and thinned the deep woods to an orchard. */
  const steep = 1 - clamp01((landSlopeAt(x, z) - 1.05) / 1.2) * 0.85;

  /* And nothing grows on the spur, or on the trail out of it. Folded in here
   * rather than special-cased in the scatter so the rocks, the deadfall and
   * the fog pockets all get the same answer from one place.
   *
   * The clearance is WIDER than the flattening. The rim of the pad drops two
   * metres over five, which a three-metre terrain triangle cuts the corner of
   * by most of a metre — so a tree planted on the rim at its true height
   * stands clear of the ground that is actually drawn. Keeping the trees off
   * the rim entirely is the fix, and it costs a slightly bigger clearing,
   * which is not a cost. */
  const open = clearGroundAt(x, z);

  return stage * edge * clump * wet * steep * open;
}

/**
 * Ground that has been kept clear: the spur, and the trail out of it.
 *
 * 1 in the forest, 0 on either. Asked by everything that puts something on the
 * ground — trees, rocks, deadfall, stumps — so that all four agree about where
 * the clearing is and none of them has its own idea.
 *
 * The clearance is WIDER than the flattening in `heightAt`. The rim of the pad
 * drops two metres over five, which a three-metre terrain triangle cuts the
 * corner of by most of a metre — so anything placed on the rim at its true
 * height stands clear of the ground that is actually drawn. Keeping the rim
 * empty is the fix, and a slightly bigger clearing is not a cost.
 */
export function clearGroundAt(x, z) {
  const rim = ramp(
    Math.hypot(x - CLEARING.x, z - CLEARING.z),
    CLEARING.radius * 0.5,
    CLEARING.radius * 1.2,
  );
  return rim * (1 - trailWeight(x, z));
}

/**
 * The dark trail out of the clearing, as a corridor nothing grows in.
 *
 * Two and a half metres wide, curving out of sight — the geometry that draws
 * it is in `clearing.js`, but the hole it needs in the canopy has to be cut
 * here, where the scatter is looking.
 */
export const TRAIL = Object.freeze([
  Object.freeze({ x: CLEARING.trailhead.x, z: CLEARING.trailhead.z }),
  Object.freeze({ x: 120.0, z: -90.0 }),
  Object.freeze({ x: 116.5, z: -80.0 }),
  Object.freeze({ x: 108.0, z: -71.5 }),
  Object.freeze({ x: 97.0, z: -67.0 }),
  Object.freeze({ x: 86.0, z: -68.5 }),
]);

/** How far into the trail corridor a point is, 1 on the path and 0 off it. */
export function trailWeight(x, z) {
  let best = Infinity;
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const a = TRAIL[i];
    const b = TRAIL[i + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? clamp01(((x - a.x) * vx + (z - a.z) * vz) / len2) : 0;
    const d = Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t));
    if (d < best) best = d;
  }
  return 1 - ramp(best, 1.25, 3.4);
}

/** Ferns, bracken and deadfall per square metre, for the detail ring. */
export function undergrowthAt(x, z, frame = roadFrame(x, z)) {
  /* Outside the corridor and outside the band the terrain mesh is sunk over —
   * bracken planted on `heightAt` inside that band hangs in the air above the
   * ground that is actually drawn. Same trap as the trees, one metre tall
   * instead of ten, and just as visible in a headlight. */
  if (frame.distance < corridorHalfWidth(frame) * 1.06) return 0;
  const progress = clamp01(frame.s / roadLength());
  const base = 0.5 + 0.5 * progress;
  const patch = clamp01(noise2(x * 0.075 + 12.1, z * 0.075 - 4.4) + 0.55);
  return base * patch;
}
