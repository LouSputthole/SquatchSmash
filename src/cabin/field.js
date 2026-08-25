/**
 * The countryside cabin property as one deterministic field.
 *
 * Rendering, walking, scatter, the creek and every exterior prop ask this
 * module for their footing.  It deliberately has no Three.js dependency, so
 * the land can be measured in tests without constructing a scene.
 */

export const PROPERTY = Object.freeze({
  minX: -112,
  maxX: 112,
  minZ: -112,
  maxZ: 112,
  boundaryInset: 4,
});

export const CABIN = Object.freeze({
  main: Object.freeze({ x0: -6, x1: 6, z0: -5, z1: 5.5 }),
  bath: Object.freeze({ x0: -3.05, x1: -0.05, z0: -8.35, z1: -5 }),
  pad: Object.freeze({ x0: -10, x1: 10, z0: -11, z1: 10 }),
  floorY: 0,
  porch: Object.freeze({ x0: -4.9, x1: 4.2, z0: 5.5, z1: 8.15 }),
});

export const LANDMARKS = Object.freeze({
  cabin: Object.freeze({ x: 0, z: 0, radius: 10, label: 'Timber cabin' }),
  porch: Object.freeze({ x: 0, z: 7, radius: 4.8, label: 'Front porch' }),
  trailhead: Object.freeze({ x: 5.5, z: 10.5, radius: 2.4, label: 'Loop trail' }),
  firepit: Object.freeze({ x: -14, z: 14, radius: 4.3, label: 'Firepit' }),
  woodpile: Object.freeze({ x: -8.6, z: 8.9, radius: 2.0, label: 'Woodpile' }),
  shed: Object.freeze({ x: -27, z: 18, radius: 5.2, label: 'Forestry shed' }),
  car: Object.freeze({ x: 20, z: 27, radius: 5.5, label: 'Parked wagon' }),
  creek: Object.freeze({ x: 4, z: -37, radius: 4.0, label: 'Cold creek' }),
  bridge: Object.freeze({ x: 4, z: -37, radius: 5.0, label: 'Footbridge' }),
  overlook: Object.freeze({ x: 64, z: -67, radius: 6.0, label: 'Ridge overlook' }),
});

/** Safe, authored approach poses used by interaction access and visual proof. */
export const LANDMARK_VIEWPOINTS = Object.freeze({
  // Driver-side gravel stance. The world builder tightens this authored side
  // into a 1.2 m interaction gap from the wagon's rotated target bounds, so
  // the 2.7 m shared InteractionSystem can resolve the car without putting
  // Tony inside its body collider.
  car: Object.freeze({ x: 16.75, z: 27.35, lookX: 20, lookZ: 27, pitch: -0.14 }),
  creek: Object.freeze({ x: 4, z: -31.45, lookX: 4, lookZ: -37, pitch: -0.12 }),
  overlook: Object.freeze({ x: 61.6, z: -64.0, lookX: 23, lookZ: -25, pitch: -0.035 }),
  shed: Object.freeze({ x: -27, z: 22.35, lookX: -27, lookZ: 18, pitch: -0.045 }),
  // Close enough for the real 2.7m interaction ray to reach the ring's
  // authored target, while remaining behind the northwest bench collider.
  firepit: Object.freeze({ x: -14, z: 17.45, lookX: -14, lookZ: 14, pitch: -0.12 }),
});

/** A closed walking loop. The repeated first point is intentional. */
export const TRAIL_LOOP = Object.freeze([
  Object.freeze({ x: 5.5, z: 10.5 }),
  Object.freeze({ x: 16, z: 17 }),
  Object.freeze({ x: 29, z: 19 }),
  Object.freeze({ x: 34, z: 30 }),
  Object.freeze({ x: 39, z: 34 }),
  Object.freeze({ x: 55, z: 22 }),
  Object.freeze({ x: 61, z: 4 }),
  Object.freeze({ x: 53, z: -14 }),
  Object.freeze({ x: 36, z: -22 }),
  Object.freeze({ x: 18, z: -18 }),
  Object.freeze({ x: 9, z: -14 }),
  Object.freeze({ x: 1, z: -12.5 }),
  Object.freeze({ x: -9, z: -12 }),
  Object.freeze({ x: -18, z: -6 }),
  Object.freeze({ x: -21, z: 1 }),
  Object.freeze({ x: -35, z: 8 }),
  Object.freeze({ x: -35, z: 20 }),
  Object.freeze({ x: -31, z: 24 }),
  Object.freeze({ x: -24, z: 29 }),
  Object.freeze({ x: -8, z: 28 }),
  Object.freeze({ x: 3, z: 20 }),
  Object.freeze({ x: 5.5, z: 10.5 }),
]);

/** The loop's northern spur crosses the creek and climbs to the overlook. */
export const OVERLOOK_TRAIL = Object.freeze([
  Object.freeze({ x: 36, z: -22 }),
  Object.freeze({ x: 24, z: -28 }),
  Object.freeze({ x: 12, z: -30.5 }),
  Object.freeze({ x: 4, z: -29.5 }),
  Object.freeze({ x: 4, z: -37 }),
  Object.freeze({ x: 4, z: -44.5 }),
  Object.freeze({ x: 12, z: -46 }),
  Object.freeze({ x: 28, z: -53 }),
  Object.freeze({ x: 46, z: -62 }),
  Object.freeze({ x: LANDMARK_VIEWPOINTS.overlook.x, z: LANDMARK_VIEWPOINTS.overlook.z }),
]);

/** West-to-east watercourse, sampled again at a finer interval by world.js. */
export const CREEK_PATH = Object.freeze([
  Object.freeze({ x: -112, z: -49 }),
  Object.freeze({ x: -92, z: -44 }),
  Object.freeze({ x: -72, z: -46 }),
  Object.freeze({ x: -54, z: -39 }),
  Object.freeze({ x: -35, z: -42 }),
  Object.freeze({ x: -17, z: -34 }),
  Object.freeze({ x: 4, z: -37 }),
  Object.freeze({ x: 24, z: -32 }),
  Object.freeze({ x: 43, z: -37 }),
  Object.freeze({ x: 65, z: -30 }),
  Object.freeze({ x: 88, z: -28 }),
  Object.freeze({ x: 112, z: -20 }),
]);

export const SURFACE = Object.freeze({
  WOOD: 'wood',
  TILE: 'tile',
  GRAVEL: 'gravel',
  DIRT: 'dirt',
  GRASS: 'grass',
  LEAVES: 'leaves',
  ROCK: 'stone',
  MUD: 'mud',
  WATER: 'water',
});

export const SURFACE_PROPS = Object.freeze({
  [SURFACE.WOOD]: Object.freeze({ colour: 0x725332, footstep: 'wood' }),
  [SURFACE.TILE]: Object.freeze({ colour: 0x77736a, footstep: 'tile' }),
  [SURFACE.GRAVEL]: Object.freeze({ colour: 0x625c4f, footstep: 'gravel' }),
  [SURFACE.DIRT]: Object.freeze({ colour: 0x4a3b29, footstep: 'dirt' }),
  [SURFACE.GRASS]: Object.freeze({ colour: 0x39472a, footstep: 'grass' }),
  [SURFACE.LEAVES]: Object.freeze({ colour: 0x2c291e, footstep: 'leaves' }),
  [SURFACE.ROCK]: Object.freeze({ colour: 0x4b4b48, footstep: 'stone' }),
  [SURFACE.MUD]: Object.freeze({ colour: 0x282219, footstep: 'mud' }),
  [SURFACE.WATER]: Object.freeze({ colour: 0x263c3d, footstep: 'water' }),
});

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function ramp(v, a, b) {
  if (a === b) return v >= b ? 1 : 0;
  return smootherstep(clamp01((v - a) / (b - a)));
}

function hash2(i, j, salt = 0) {
  let h = Math.imul(i + salt * 1013, 0x1b873593)
    ^ Math.imul(j - salt * 7919, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/** Stable 0..1 value for procedural scatter at a world-space position. */
export function hashAt(x, z, salt = 0) {
  return (hash2(Math.floor(x * 8.31), Math.floor(z * 8.31), salt) + 1) * 0.5;
}

export function noise2(x, z, salt = 0) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smootherstep(x - ix);
  const fz = smootherstep(z - iz);
  const a = hash2(ix, iz, salt);
  const b = hash2(ix + 1, iz, salt);
  const c = hash2(ix, iz + 1, salt);
  const d = hash2(ix + 1, iz + 1, salt);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

/**
 * Nearest point on a polyline, including its segment tangent and progress.
 * Keeping this here makes paths, meshes, scatter exclusion and tests agree.
 */
export function nearestPolyline(x, z, path) {
  let best = {
    x: path[0].x,
    z: path[0].z,
    distance: Infinity,
    segment: 0,
    t: 0,
    tx: 0,
    tz: 1,
  };
  let walked = 0;
  let bestWalked = 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
  }
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len = Math.hypot(vx, vz);
    const len2 = len * len;
    const t = len2 > 0 ? clamp01(((x - a.x) * vx + (z - a.z) * vz) / len2) : 0;
    const px = a.x + vx * t;
    const pz = a.z + vz * t;
    const distance = Math.hypot(x - px, z - pz);
    if (distance < best.distance) {
      best = {
        x: px,
        z: pz,
        distance,
        segment: i,
        t,
        tx: len > 0 ? vx / len : 0,
        tz: len > 0 ? vz / len : 1,
      };
      bestWalked = walked + len * t;
    }
    walked += len;
  }
  return { ...best, progress: total > 0 ? bestWalked / total : 0, length: total };
}

export function trailFrame(x, z) {
  const loop = nearestPolyline(x, z, TRAIL_LOOP);
  const spur = nearestPolyline(x, z, OVERLOOK_TRAIL);
  return loop.distance <= spur.distance
    ? { ...loop, branch: 'loop' }
    : { ...spur, branch: 'overlook' };
}

export function creekFrame(x, z) {
  return nearestPolyline(x, z, CREEK_PATH);
}

function rectOutsideDistance(x, z, r) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

export function insideRect(x, z, r, pad = 0) {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
}

export function insideProperty(x, z, inset = 0) {
  return x >= PROPERTY.minX + inset && x <= PROPERTY.maxX - inset
    && z >= PROPERTY.minZ + inset && z <= PROPERTY.maxZ - inset;
}

/** The ungraded country: long rolls, small hummocks and the overlook ridge. */
export function baseHeightAt(x, z) {
  let h = noise2(x * 0.013, z * 0.013, 2) * 2.2;
  h += noise2(x * 0.041, z * 0.041, 7) * 0.56;
  h += noise2(x * 0.11, z * 0.11, 13) * 0.12;
  h += x * 0.006 - z * 0.003;

  // A broad shoulder gives the overlook a real reason to exist.
  const ridgeD = Math.hypot((x - 63) * 0.72, (z + 68) * 1.05);
  h += 5.5 * (1 - ramp(ridgeD, 8, 42));
  // The distant northwest corner folds down into wetter country.
  const lowD = Math.hypot(x + 73, z + 65);
  h -= 1.6 * (1 - ramp(lowD, 10, 48));
  return h;
}

/**
 * Keep the ridge payoff legible from its authored approach. The corridor is
 * deliberately narrow beside the overlook and opens toward the home valley.
 */
export function insideOverlookViewCorridor(x, z, pad = 0) {
  const origin = LANDMARKS.overlook;
  const vx = LANDMARKS.cabin.x - origin.x;
  const vz = LANDMARKS.cabin.z - origin.z;
  const length = Math.hypot(vx, vz);
  const tx = vx / length;
  const tz = vz / length;
  const dx = x - origin.x;
  const dz = z - origin.z;
  const along = dx * tx + dz * tz;
  if (along < 5 || along > 78) return false;
  const across = Math.abs(dx * -tz + dz * tx);
  return across < lerp(4.2, 10.5, along / 78) + pad;
}

/** The water drops gently eastward; all creek geometry reads this line. */
export function creekWaterAt(x, z) {
  const f = creekFrame(x, z);
  return -1.18 - f.progress * 0.72;
}

/**
 * One final height used by both the terrain mesh and Player.groundAt.
 * Feature order is deliberate: creek carves the country, trails grade over
 * that land, and the cabin pad is the one unequivocally level place.
 */
function developedHeightAt(x, z) {
  let h = baseHeightAt(x, z);

  const creek = creekFrame(x, z);
  if (creek.distance < 9.5) {
    const water = creekWaterAt(creek.x, creek.z);
    const bed = water - 0.34
      + noise2(creek.x * 0.18, creek.z * 0.18, 31) * 0.08;
    const channelWeight = 1 - ramp(creek.distance, 2.1, 9.5);
    h = lerp(h, bed, channelWeight);
  }

  // The gravel approach is flatter than the meadow but still drains away.
  const carD = Math.hypot((x - LANDMARKS.car.x) / 9.0, (z - LANDMARKS.car.z) / 7.0);
  if (carD < 1.35) h = lerp(h, 0.24, 1 - ramp(carD, 0.62, 1.35));

  // A worked yard transitions gently into the native rolls.
  const yardD = Math.hypot(x / 18, (z - 2) / 16);
  if (yardD < 1.5) h = lerp(h, 0, 1 - ramp(yardD, 0.72, 1.5));

  // The fire ring and its benches occupy a worked, level gravel clearing.
  const fireD = Math.hypot(x - LANDMARKS.firepit.x, z - LANDMARKS.firepit.z);
  if (fireD < 6.4) {
    const clearing = baseHeightAt(LANDMARKS.firepit.x, LANDMARKS.firepit.z);
    h = lerp(h, clearing, 1 - ramp(fireD, 3.5, 6.4));
  }

  const padD = rectOutsideDistance(x, z, CABIN.pad);
  if (padD < 3.2) h = lerp(h, CABIN.floorY, 1 - ramp(padD, 0, 3.2));

  // The viewpoint is a small cut shelf, not furniture balanced on a summit.
  const overlookD = Math.hypot(x - LANDMARKS.overlook.x, z - LANDMARKS.overlook.z);
  if (overlookD < 8) {
    const shelf = baseHeightAt(LANDMARKS.overlook.x, LANDMARKS.overlook.z);
    h = lerp(h, shelf, 1 - ramp(overlookD, 3.8, 8));
  }

  return h;
}

export function heightAt(x, z) {
  let h = developedHeightAt(x, z);

  // Interpolate between authored route nodes before blending across the path.
  // This removes small-noise/car-pad spikes without ironing out the property.
  const trail = trailFrame(x, z);
  if (trail.distance < 3.2) {
    const path = trail.branch === 'loop' ? TRAIL_LOOP : OVERLOOK_TRAIL;
    const a = path[trail.segment];
    const b = path[Math.min(path.length - 1, trail.segment + 1)];
    const grade = lerp(
      developedHeightAt(a.x, a.z),
      developedHeightAt(b.x, b.z),
      trail.t,
    );
    h = lerp(h, grade, 1 - ramp(trail.distance, 1.15, 3.2));
  }

  return h;
}

export const groundAt = heightAt;

export function normalAt(x, z, step = 0.45) {
  const dx = heightAt(x + step, z) - heightAt(x - step, z);
  const dz = heightAt(x, z + step) - heightAt(x, z - step);
  const nx = -dx / (step * 2);
  const nz = -dz / (step * 2);
  const len = Math.hypot(nx, 1, nz);
  return { x: nx / len, y: 1 / len, z: nz / len };
}

export function slopeAt(x, z, step = 0.75) {
  const dx = heightAt(x + step, z) - heightAt(x - step, z);
  const dz = heightAt(x, z + step) - heightAt(x, z - step);
  return Math.hypot(dx, dz) / (step * 2);
}

export function surfaceAt(x, z) {
  if (insideRect(x, z, CABIN.main) || insideRect(x, z, CABIN.bath)) return SURFACE.WOOD;
  if (insideRect(x, z, CABIN.porch)) return SURFACE.WOOD;

  const bridge = LANDMARKS.bridge;
  if (Math.abs(x - bridge.x) <= 1.35 && Math.abs(z - bridge.z) <= 5.2) return SURFACE.WOOD;

  const fireD = Math.hypot(x - LANDMARKS.firepit.x, z - LANDMARKS.firepit.z);
  if (fireD < 3.1) return SURFACE.ROCK;

  const carD = Math.hypot((x - LANDMARKS.car.x) / 8.5, (z - LANDMARKS.car.z) / 6.5);
  if (carD < 1) return SURFACE.GRAVEL;

  const creek = creekFrame(x, z);
  if (creek.distance < 2.35) return SURFACE.WATER;
  if (creek.distance < 4.5) return SURFACE.MUD;

  const trail = trailFrame(x, z);
  if (trail.distance < 1.45) return SURFACE.DIRT;

  const yardD = Math.hypot(x / 18, (z - 2) / 16);
  if (yardD < 1) return SURFACE.GRASS;

  const slope = slopeAt(x, z, 1.2);
  if (slope > 0.46 && hashAt(x, z, 19) > 0.58) return SURFACE.ROCK;
  if (hashAt(x, z, 23) > 0.74) return SURFACE.GRASS;
  return SURFACE.LEAVES;
}

export function surfaceProps(surface) {
  return SURFACE_PROPS[surface] ?? SURFACE_PROPS[SURFACE.LEAVES];
}

/** Shared exclusion policy for trees, brush and large rocks. */
export function canPlantTree(x, z, radius = 0) {
  if (!insideProperty(x, z, PROPERTY.boundaryInset + radius)) return false;
  if (insideRect(x, z, CABIN.pad, 4 + radius)) return false;
  if (trailFrame(x, z).distance < 3.0 + radius) return false;
  if (creekFrame(x, z).distance < 6.0 + radius) return false;
  const bridge = LANDMARKS.bridge;
  if (
    Math.abs(x - bridge.x) < 3.4 + radius
    && Math.abs(z - bridge.z) < 9.0 + radius
  ) return false;
  if (insideOverlookViewCorridor(x, z, radius)) return false;
  for (const key of ['firepit', 'woodpile', 'shed', 'car', 'overlook']) {
    const p = LANDMARKS[key];
    if (Math.hypot(x - p.x, z - p.z) < p.radius + 2 + radius) return false;
  }
  return slopeAt(x, z, 1.5) < 0.72;
}

/** 0..1 natural tree density, used after canPlantTree. */
export function treeDensityAt(x, z) {
  if (!canPlantTree(x, z)) return 0;
  const yardD = Math.hypot(x / 30, (z - 2) / 25);
  const yardThin = ramp(yardD, 0.55, 1.25);
  const edge = Math.min(
    x - PROPERTY.minX,
    PROPERTY.maxX - x,
    z - PROPERTY.minZ,
    PROPERTY.maxZ - z,
  );
  const edgeDense = lerp(1.18, 0.86, ramp(edge, 5, 24));
  return clamp01((0.50 + noise2(x * 0.025, z * 0.025, 47) * 0.23) * yardThin * edgeDense);
}

/** Resample any authored polyline at approximately `spacing` metres. */
export function samplePolyline(path, spacing = 3) {
  const out = [{ ...path[0], segment: 0, t: 0 }];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), segment: i, t });
    }
  }
  return out;
}
