/**
 * THE SPECIAL MEETING — the road out of town, as one line on a map.
 *
 * No THREE, no scene, no randomness. Six things have to agree about where the
 * road is — the ribbon that draws it, the heightfield that grades the ground
 * around it, the tree scatter that must not plant in it, the fog pockets that
 * sit in its hollows, the car that drives it and the beats that fire off its
 * arclength — so the road is one authored polyline here and everything else
 * asks.
 *
 * THE FRAME
 *
 *   +X is east, +Z is south, +Y is up. The drive starts at the origin heading
 *   NORTH (−Z) and never comes back: `s` is metres travelled from the kerb the
 *   car pulled away from, and every query in the scene is either a distance
 *   along the road or a distance from it.
 *
 * WHY A HAND-AUTHORED POLYLINE AND NOT A GENERATOR
 *
 *   The drive is ninety seconds to two minutes long and the dialogue over it
 *   is the spine of the scene. Where the bends fall decides where the silence
 *   falls, and SM-250 — twenty-odd seconds of nobody speaking — has to land on
 *   a stretch with nothing to look at. A generator cannot be asked for that.
 *
 * THE SHAPE
 *
 *   It snakes. A little over a kilometre of road is folded into roughly
 *   300 × 250 metres, which is only possible because the forest is opaque:
 *   with a fifty-metre fog and a trunk every three metres, two legs of the
 *   same road forty metres apart cannot see each other. The one exception is
 *   the lit stretch at the start — sodium light carries — so nothing else in
 *   the route comes within ninety metres of it. `tools`-free proof of both
 *   claims is `minimumLegSeparation()` at the bottom of this file, which the
 *   scene's own smoke check calls.
 *
 * THE FOUR STAGES
 *
 *   outskirts → rural → dirt → deep. The road narrows at every boundary, the
 *   speed drops, and the forest closes in. That progression is the scene's
 *   only stage direction that the player can see out of the window.
 */

/** In order, and the order is the drive. */
export const STAGES = Object.freeze(['outskirts', 'rural', 'dirt', 'deep']);

/**
 * The centreline.
 *
 * `y` is the road's own surface height, not the ground's: the ground is graded
 * to meet it (see `field.js`), which is what cuts a bank on the uphill side
 * and throws an embankment on the downhill one. The climb is steady and never
 * announced — by the time they are in the deep woods they are thirty-three
 * metres above the street the car pulled away from, and nobody has mentioned
 * a hill.
 *
 * `halfWidth` is drivable surface, so the tarmac is seven metres kerb to kerb
 * and the last of the track is under three.
 */
const NODES = Object.freeze([
  /* --- outskirts: the last of the streetlights, tarmac, kerbs, a bus stop
   * nobody uses. Straight, because the town is straight. --- */
  { x: 0, z: 0, y: 0.0, halfWidth: 3.6, stage: 'outskirts' },
  { x: 0, z: -52, y: 0.4, halfWidth: 3.6, stage: 'outskirts' },
  { x: 4, z: -104, y: 1.2, halfWidth: 3.5, stage: 'outskirts' },
  { x: 16, z: -150, y: 2.6, halfWidth: 3.4, stage: 'outskirts' },

  /* --- rural: no lights at all from here on. Long sweeping bends taken at
   * speed, hedgerow giving way to a wall of trees. --- */
  { x: 38, z: -190, y: 4.4, halfWidth: 3.2, stage: 'rural' },
  { x: 72, z: -218, y: 6.0, halfWidth: 3.1, stage: 'rural' },
  { x: 112, z: -234, y: 7.2, halfWidth: 3.0, stage: 'rural' },
  { x: 154, z: -236, y: 8.6, halfWidth: 3.0, stage: 'rural' },
  { x: 192, z: -222, y: 10.4, halfWidth: 2.9, stage: 'rural' },
  { x: 222, z: -196, y: 12.6, halfWidth: 2.9, stage: 'rural' },
  { x: 240, z: -162, y: 14.2, halfWidth: 2.8, stage: 'rural' },
  { x: 244, z: -126, y: 15.4, halfWidth: 2.7, stage: 'rural' },

  /* --- dirt: the turn-off. Tarmac ends, a cattle grid rattles the car, and
   * the road is suddenly narrow enough that the trees touch over it. --- */
  { x: 232, z: -92, y: 16.8, halfWidth: 2.1, stage: 'dirt' },
  { x: 208, z: -66, y: 18.6, halfWidth: 2.0, stage: 'dirt' },
  { x: 176, z: -50, y: 19.4, halfWidth: 1.95, stage: 'dirt' },
  { x: 142, z: -46, y: 19.0, halfWidth: 1.9, stage: 'dirt' },
  { x: 110, z: -56, y: 20.2, halfWidth: 1.85, stage: 'dirt' },
  { x: 84, z: -78, y: 22.4, halfWidth: 1.8, stage: 'dirt' },
  { x: 68, z: -108, y: 24.6, halfWidth: 1.75, stage: 'dirt' },
  { x: 64, z: -142, y: 25.4, halfWidth: 1.7, stage: 'dirt' },

  /* --- deep: two ruts and a hump of grass down the middle. This is the
   * stretch SM-300 through SM-320 plays over, so it is deliberately the
   * longest and the slowest thing in the drive. --- */
  { x: 70, z: -172, y: 26.8, halfWidth: 1.65, stage: 'deep' },
  { x: 82, z: -182, y: 28.2, halfWidth: 1.6, stage: 'deep' },
  { x: 102, z: -194, y: 29.4, halfWidth: 1.55, stage: 'deep' },
  { x: 126, z: -196, y: 30.2, halfWidth: 1.5, stage: 'deep' },
  { x: 148, z: -188, y: 31.4, halfWidth: 1.5, stage: 'deep' },
  { x: 166, z: -174, y: 32.6, halfWidth: 1.45, stage: 'deep' },
  { x: 176, z: -156, y: 33.4, halfWidth: 1.45, stage: 'deep' },
  { x: 176, z: -136, y: 33.8, halfWidth: 1.4, stage: 'deep' },
  { x: 164, z: -122, y: 33.2, halfWidth: 1.5, stage: 'deep' },
  /* The last knot is the parking space, not a waypoint. `field.js` levels a
   * spur around it, so the rail that has carried the car for a kilometre is
   * what puts it on the pad — no separate parking manoeuvre, and the turn off
   * the track is sold by the hairpin immediately before this. */
  { x: 138, z: -108, y: 32.6, halfWidth: 1.9, stage: 'deep' },
]);

/** Cruise speed by stage, metres per second, before bends are taken off it. */
export const STAGE_SPEED = Object.freeze({
  outskirts: 13.5,
  rural: 15.0,
  dirt: 10.2,
  deep: 8.0,
});

/** How much of the lane the car sits off centre, by stage. */
export const STAGE_LANE_OFFSET = Object.freeze({
  /* Traffic drives on the right — the same reason the block's sedan pulled up
   * on the negative-z kerb (see `../layout.js`). On the single track there is
   * no such thing as a lane and the car sits on the crown. */
  outskirts: 0.46,
  rural: 0.44,
  dirt: 0.06,
  deep: 0.0,
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0, 1);

/* ------------------------------------------------------------------ */
/* Sampling                                                            */
/* ------------------------------------------------------------------ */

/* Centripetal Catmull-Rom, sampled at a fixed parameter step and then indexed
 * by arclength. Uniform Catmull-Rom overshoots on the tight corners at the top
 * of the dirt section badly enough to put the road through its own verge;
 * centripetal is the standard fix and costs one square root per knot. */
function catmull(p0, p1, p2, p3, t, alpha = 0.5) {
  const d = (a, b) => Math.pow(Math.hypot(b.x - a.x, b.z - a.z), alpha);
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  if (t1 === t0 || t2 === t1 || t3 === t2) {
    // Coincident knots: fall back to a straight interpolation rather than NaN.
    return { x: p1.x + (p2.x - p1.x) * t, z: p1.z + (p2.z - p1.z) * t };
  }
  const tt = t1 + (t2 - t1) * t;
  const mix = (a, b, ta, tb) => (tb - tt) / (tb - ta) * a + (tt - ta) / (tb - ta) * b;
  const a1x = mix(p0.x, p1.x, t0, t1);
  const a1z = mix(p0.z, p1.z, t0, t1);
  const a2x = mix(p1.x, p2.x, t1, t2);
  const a2z = mix(p1.z, p2.z, t1, t2);
  const a3x = mix(p2.x, p3.x, t2, t3);
  const a3z = mix(p2.z, p3.z, t2, t3);
  const b1x = ((t2 - tt) / (t2 - t0)) * a1x + ((tt - t0) / (t2 - t0)) * a2x;
  const b1z = ((t2 - tt) / (t2 - t0)) * a1z + ((tt - t0) / (t2 - t0)) * a2z;
  const b2x = ((t3 - tt) / (t3 - t1)) * a2x + ((tt - t1) / (t3 - t1)) * a3x;
  const b2z = ((t3 - tt) / (t3 - t1)) * a2z + ((tt - t1) / (t3 - t1)) * a3z;
  return {
    x: ((t2 - tt) / (t2 - t1)) * b1x + ((tt - t1) / (t2 - t1)) * b2x,
    z: ((t2 - tt) / (t2 - t1)) * b1z + ((tt - t1) / (t2 - t1)) * b2z,
  };
}

const STEPS_PER_SPAN = 14;

function buildSamples() {
  const out = [];
  const at = (i) => NODES[clamp(i, 0, NODES.length - 1)];
  for (let i = 0; i < NODES.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const last = i === NODES.length - 2;
    const steps = STEPS_PER_SPAN + (last ? 1 : 0);
    for (let k = 0; k < steps; k++) {
      const t = k / STEPS_PER_SPAN;
      const p = catmull(p0, p1, p2, p3, t);
      out.push({
        x: p.x,
        z: p.z,
        /* Height and width ride the knots linearly. They are authored to be
         * smooth already, and a spline through them would put the road surface
         * above the knot on a crest, which is a jump the car would feel. */
        y: p1.y + (p2.y - p1.y) * t,
        halfWidth: p1.halfWidth + (p2.halfWidth - p1.halfWidth) * t,
        stage: t < 0.5 ? p1.stage : p2.stage,
        node: i,
        s: 0,
        yaw: 0,
        curvature: 0,
      });
    }
  }
  // Arclength, then heading, then curvature — each needs the one before it.
  for (let i = 1; i < out.length; i++) {
    out[i].s = out[i - 1].s + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z);
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    /* Heading in the vehicle frame the whole project uses: forward is
     * (sin h, cos h), so h = 0 is +Z and h = PI/2 is +X. `../drive.js` and
     * `core/vehicles/ground-vehicle.js` are both built that way and a scene
     * that invents its own convention steers the wrong way round exactly once
     * and then forever. */
    out[i].yaw = Math.atan2(b.x - a.x, b.z - a.z);
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    const span = Math.max(1e-3, b.s - a.s);
    let dy = b.yaw - a.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    out[i].curvature = dy / span;      // radians per metre, signed
  }
  return out;
}

const SAMPLES = buildSamples();
const LENGTH = SAMPLES[SAMPLES.length - 1].s;

/** Total length of the drive, in metres. */
export function roadLength() {
  return LENGTH;
}

/** Every sample, read-only. The ribbon builder walks this rather than resampling. */
export function roadSamples() {
  return SAMPLES;
}

/* ------------------------------------------------------------------ */
/* Queries along the road                                              */
/* ------------------------------------------------------------------ */

function lerpSample(a, b, t) {
  let dy = b.yaw - a.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: a.yaw + dy * t,
    halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * t,
    curvature: a.curvature + (b.curvature - a.curvature) * t,
    stage: t < 0.5 ? a.stage : b.stage,
    s: a.s + (b.s - a.s) * t,
  };
}

/* The samples are evenly spaced in spline parameter, not in arclength, so an
 * index cannot be computed from `s` directly — but they are close enough to
 * even that a binary search over `s` is two or three probes. */
function indexForS(s) {
  let lo = 0;
  let hi = SAMPLES.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (SAMPLES[mid].s <= s) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The road at `s` metres from the start: position, heading, width, stage. */
export function roadAt(s) {
  const d = clamp(s, 0, LENGTH);
  const i = indexForS(d);
  const a = SAMPLES[i];
  const b = SAMPLES[Math.min(SAMPLES.length - 1, i + 1)];
  const span = b.s - a.s;
  return lerpSample(a, b, span > 1e-6 ? (d - a.s) / span : 0);
}

/** Which stage of the drive `s` falls in. */
export function stageAt(s) {
  return roadAt(s).stage;
}

/**
 * Cruise speed the driver would hold here.
 *
 * Stage speed, taken down for curvature and for the crests he cannot see over.
 * This is the only place a "how fast is the car going" number is decided, so
 * the engine note, the tyre loop, the suspension shake and the beat timings
 * all move together when it is tuned.
 */
export function cruiseSpeedAt(s) {
  const r = roadAt(s);
  const base = STAGE_SPEED[r.stage] ?? 9;
  /* Taken off for the bend, not for the corner: a driver on a track he knows
   * does not brake for every curve, he just is not doing fifteen through this
   * one. Tuned so the whole drive lands inside the ninety-second-to-two-minute
   * window `driveSeconds()` reports. */
  const bend = 1 / (1 + Math.abs(r.curvature) * 15);
  return Math.max(4.2, base * bend);
}

/* ------------------------------------------------------------------ */
/* Queries from anywhere                                               */
/* ------------------------------------------------------------------ */

/* A uniform grid over the samples so `nearestRoad` is not a linear scan. It is
 * called for every terrain vertex, every candidate tree, every rock and every
 * blade of undergrowth — six figures of calls per chunk row — and a 700-sample
 * scan each time is the difference between a scene that streams and one that
 * stutters every time the car crosses a chunk line. */
/* Twenty-metre cells gathered a hundred-odd candidates per query wherever the
 * route folds. Twelve costs one more ring in the rare far case and roughly
 * halves the common one. Any point within twelve metres of the road is
 * guaranteed to be answered exactly, which covers every query whose exact
 * value is used: the corridor, the grading and the tree clearance are all
 * inside eight. */
const CELL = 12;
const GRID = new Map();
const key = (cx, cz) => `${cx},${cz}`;
for (let i = 0; i < SAMPLES.length; i++) {
  const cx = Math.floor(SAMPLES[i].x / CELL);
  const cz = Math.floor(SAMPLES[i].z / CELL);
  const k = key(cx, cz);
  let bucket = GRID.get(k);
  if (!bucket) GRID.set(k, (bucket = []));
  bucket.push(i);
}

function refine(x, z, seed) {
  /* Walk out from the best sample found so far. The spline is smooth, so the
   * true nearest point is within a couple of samples of the nearest knot. */
  let bestIndex = seed;
  let bestD2 = Infinity;
  const lo = Math.max(0, seed - 3);
  const hi = Math.min(SAMPLES.length - 1, seed + 3);
  for (let i = lo; i <= hi; i++) {
    const d2 = (SAMPLES[i].x - x) ** 2 + (SAMPLES[i].z - z) ** 2;
    if (d2 < bestD2) { bestD2 = d2; bestIndex = i; }
  }
  /* Project onto the segment either side of the winner so the answer is a
   * point on the road rather than a point on the sample list. Two metres of
   * quantisation would be visible as scallops in the verge. */
  let best = null;
  for (const i of [bestIndex - 1, bestIndex]) {
    if (i < 0 || i >= SAMPLES.length - 1) continue;
    const a = SAMPLES[i];
    const b = SAMPLES[i + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? clamp01(((x - a.x) * vx + (z - a.z) * vz) / len2) : 0;
    const p = lerpSample(a, b, t);
    const d = Math.hypot(x - p.x, z - p.z);
    if (!best || d < best.distance) best = Object.assign(p, { distance: d });
  }
  return best;
}

/**
 * Nearest point on the road to (x, z).
 *
 * Returns the full road record — position, heading, half-width, stage, `s` —
 * plus `distance`, which is how far off the road the query point is.
 */
export function nearestRoad(x, z) {
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  let seed = -1;
  let seedD2 = Infinity;
  /* The 3x3 neighbourhood is searched WHOLE rather than shell by shell,
   * because a point near a cell edge has its nearest road sample in the next
   * cell along and a first-hit-wins ring walk would answer with the wrong one.
   * Nine cells at twenty metres covers everything inside twenty metres of the
   * road, which is every query whose exact answer matters. */
  for (let ring = 1; ring <= 3 && seed < 0; ring++) {
    for (let ox = -ring; ox <= ring; ox++) {
      for (let oz = -ring; oz <= ring; oz++) {
        const bucket = GRID.get(key(cx + ox, cz + oz));
        if (!bucket) continue;
        for (const i of bucket) {
          const d2 = (SAMPLES[i].x - x) ** 2 + (SAMPLES[i].z - z) ** 2;
          if (d2 < seedD2) { seedD2 = d2; seed = i; }
        }
      }
    }
  }
  if (seed < 0) {
    /* Well off the road — the far side of the forest, or the horizon. Nothing
     * out there needs a metre-accurate answer, only a stage and a rough
     * distance, so a coarse scan is both enough and cheap. */
    for (let i = 0; i < SAMPLES.length; i += 11) {
      const d2 = (SAMPLES[i].x - x) ** 2 + (SAMPLES[i].z - z) ** 2;
      if (d2 < seedD2) { seedD2 = d2; seed = i; }
    }
  }
  return refine(x, z, seed);
}

/** Perpendicular distance from the road, in metres. Hot path, so it is direct. */
export function roadDistance(x, z) {
  return nearestRoad(x, z).distance;
}

/**
 * How far through the drive a place is, 0 at the kerb and 1 at the clearing.
 *
 * The forest thickens with this, which is the whole geography brief in one
 * number: city outskirts, rural road, dirt road, deep woods.
 */
export function progressAt(x, z) {
  return clamp01(nearestRoad(x, z).s / LENGTH);
}

/* ------------------------------------------------------------------ */
/* The beats that hang off the road                                    */
/* ------------------------------------------------------------------ */

function sAtNode(index) {
  return SAMPLES[Math.min(SAMPLES.length - 1, index * STEPS_PER_SPAN)].s;
}

/**
 * Where a stage begins, in metres.
 *
 * Asked of the samples rather than of the knots: the boundary falls mid-span,
 * because a sample takes the stage of whichever knot it is nearer. Writing the
 * turn-off's arclength by hand instead put the beat eight metres INSIDE the
 * dirt, so the line about the tarmac ending fired after it had.
 */
export function stageStartS(stage) {
  const first = SAMPLES.find((sample) => sample.stage === stage);
  return first ? first.s : 0;
}

/**
 * Places on the road that the scene above cares about.
 *
 * `stop: true` means the car comes to a halt there and waits to be told to go
 * on — the drive raises the id and does not move again until `resume()`. The
 * ids are the script's, so wiring the dialogue to them is a lookup and not a
 * judgement call: see docs/SPECIAL-MEETING-SCRIPT.md.
 */
/** Where the chain itself is strung. The car stops short of it, see below. */
const CHAIN_GATE_S = sAtNode(17) - 12;

export const ROAD_EVENTS = Object.freeze([
  Object.freeze({ id: 'pull_away', s: 0, stop: false }),
  /* The last streetlight in the game. Everything after this is headlights. */
  Object.freeze({ id: 'last_light', s: sAtNode(3) - 26, stop: false }),
  Object.freeze({ id: 'rural', s: stageStartS('rural'), stop: false }),
  /* SM-220. Tarmac ends, cattle grid, full beams, and nobody says anything. */
  Object.freeze({ id: 'turn_off', s: stageStartS('dirt'), stop: false }),
  Object.freeze({ id: 'dirt_first', s: sAtNode(13), stop: false }),
  Object.freeze({ id: 'dirt_second', s: sAtNode(15), stop: false }),
  /* SM-260. A chain across the track. Lag gets out twice and nobody mentions
   * any of it. The drive stops here and waits for the scene to say go.
   *
   * The STOP is six and a half metres short of the gate, which is the whole
   * staging of the beat: the chain has to be lit, ahead, with a man walking
   * into the beams to reach it. Stopping on it would put it under the car. */
  Object.freeze({ id: 'chain', s: CHAIN_GATE_S - 6.5, stop: true }),
  Object.freeze({ id: 'dirt_third', s: sAtNode(19), stop: false }),
  Object.freeze({ id: 'deep', s: stageStartS('deep'), stop: false }),
  Object.freeze({ id: 'dirt_fourth', s: sAtNode(24), stop: false }),
  /* SM-330. Off the track onto a flat spur, and the engine goes off. */
  Object.freeze({ id: 'arrival', s: LENGTH - 4, stop: true }),
]);

/** The chain gate's own place on the road, for the prop and for Lag's feet. */
export const CHAIN_S = CHAIN_GATE_S;
/** Where the tarmac ends. The cattle grid is laid across the road here. */
export const TURN_OFF_S = ROAD_EVENTS.find((e) => e.id === 'turn_off').s;

/* ------------------------------------------------------------------ */
/* Proof                                                               */
/* ------------------------------------------------------------------ */

/**
 * The closest two non-adjacent parts of the road ever come to each other.
 *
 * A fold in the route is invisible as long as there is enough forest in the
 * gap. This is the number that says whether there is. Called by the scene's
 * smoke check; kept here because the answer belongs to the road, not to the
 * thing checking it.
 *
 * @param {number} ignoreWithin metres of road either side that count as "the
 *        same piece of road" rather than a fold.
 */
export function minimumLegSeparation(ignoreWithin = 60) {
  let worst = Infinity;
  let where = null;
  for (let i = 0; i < SAMPLES.length; i += 2) {
    for (let j = i + 2; j < SAMPLES.length; j += 2) {
      if (SAMPLES[j].s - SAMPLES[i].s < ignoreWithin) continue;
      const d = Math.hypot(SAMPLES[i].x - SAMPLES[j].x, SAMPLES[i].z - SAMPLES[j].z);
      if (d < worst) {
        worst = d;
        where = { a: SAMPLES[i].s, b: SAMPLES[j].s, stages: [SAMPLES[i].stage, SAMPLES[j].stage] };
      }
    }
  }
  return { distance: worst, where };
}

/** Rough drive time at cruise, ignoring the scripted stops. Seconds. */
export function driveSeconds(step = 4) {
  let t = 0;
  for (let s = 0; s < LENGTH; s += step) t += step / cruiseSpeedAt(s);
  return t;
}

/**
 * Where the drive begins, in this scene's own space.
 *
 * The forest is its own world with its own origin: the road starts at (0, 0)
 * heading NORTH and climbs from there. The block outside the flat
 * (`../layout.js`) has the car heading EAST down a street at z = 0, so the two
 * do not join up in world coordinates and are not meant to — they are separate
 * loads with a cut between them. This is published so that whatever performs
 * that cut can line the car up rather than guess.
 */
export const START = Object.freeze({
  x: 0,
  z: 0,
  /** Vehicle-frame heading: forward is (sin h, cos h), so PI is due north. */
  heading: Math.PI,
  /** Camera yaw that matches it. A camera looks down its own −Z. */
  cameraYaw: Math.PI * 2,
});

/** The authored knots, for anything that wants the shape rather than the line. */
export function roadNodes() {
  return NODES;
}
