/**
 * One wrapped body, for every scene that has to move one.
 *
 * The Bada Bing cleanup and the graveyard burial are the same object seen an
 * hour apart, so they are built here once rather than improvised twice. What
 * this replaced in the club was a CapsuleGeometry with three rings round it,
 * and a capsule is exactly the wrong shape: it is symmetrical end to end, so
 * the eye cannot tell which end the head is, and it is a smooth extrusion, so
 * nothing about it says sheeting. Both of those are fixed here on purpose.
 *
 * WHAT MAKES IT READ AS A BODY. The silhouette is lofted through a table of
 * authored cross-sections down a real human -- skull, the hollow of the neck,
 * shoulders at the widest point, ribs, a belly, a narrowing waist, hips, the
 * knees, and ankles that pinch before the feet flare back out. Shoulder wider
 * than hip wider than ankle is the whole trick; a viewer reads the taper and
 * knows instantly which end to pick up.
 *
 * WHAT MAKES IT READ AS SHEETING. Fourteen radial segments and flat shading,
 * so the surface is faceted rather than smooth, plus a low-frequency crease
 * term that stops the facets from forming a tidy prism. The sheet is drawn as
 * a free ellipse per station and then CLAMPED at floor height, which is what
 * gives the prop its weight for free: where the section would sink below the
 * floor -- shoulders, hips, heels -- it flattens out and spreads, and where it
 * would not -- the neck, the waist, between the ankles -- it bridges.
 *
 * The sheet is drawn twice, back faces then front faces, because one
 * double-sided transparent mesh sorts its own two sides arbitrarily and the
 * plastic ends up looking like a bug. A dark mass sits inside it so something
 * reads through the milk; pass `hollow` when the caller has a real figure to
 * put in there instead.
 *
 * DOM-FREE, deliberately. This imports `src/world/build.js` directly and
 * nothing else from the world layer. `world/props.js` and `world/textures.js`
 * build canvas-backed materials at import time, so reaching the shared helpers
 * through either of those would put a `document` in the import graph and make
 * this untestable under `node --test`. Same rule the shared weapon models
 * follow, and for the same reason.
 */
import * as THREE from 'three';

import { box, cylinder, group, mat, sphere } from '../../world/build.js';

/**
 * The body, as cross-sections down its length.
 *
 * `z` runs from the crown of the head to the tip of the toes. `hw` is the half
 * width; `bottom` and `top` are the FREE extents of the section before the
 * floor gets a say, which is why several of them are negative -- those are the
 * points bearing the weight, and the clamp turns them into flat contact.
 *
 * `cleft` presses a groove down the centre line of the top of the section. It
 * is what turns one lozenge at the end into two feet, and what puts a seam
 * between the legs; without it the taper is right and the read is still wrong.
 */
const STATIONS = Object.freeze([
  { id: 'crown', z: 0.000, hw: 0.072, bottom: 0.086, top: 0.196 },
  { id: 'brow', z: 0.075, hw: 0.122, bottom: 0.044, top: 0.266 },
  { id: 'nose', z: 0.140, hw: 0.126, bottom: 0.036, top: 0.288 },
  { id: 'jaw', z: 0.205, hw: 0.116, bottom: 0.034, top: 0.250 },
  { id: 'neck', z: 0.268, hw: 0.072, bottom: 0.086, top: 0.172 },
  { id: 'shoulder-top', z: 0.318, hw: 0.192, bottom: 0.026, top: 0.268 },
  { id: 'shoulder', z: 0.398, hw: 0.300, bottom: -0.022, top: 0.318 },
  { id: 'chest', z: 0.548, hw: 0.278, bottom: -0.016, top: 0.348 },
  { id: 'ribs', z: 0.700, hw: 0.256, bottom: 0.006, top: 0.396 },
  { id: 'belly', z: 0.832, hw: 0.262, bottom: 0.010, top: 0.428 },
  { id: 'waist', z: 0.946, hw: 0.228, bottom: 0.042, top: 0.362 },
  { id: 'hip-crest', z: 1.032, hw: 0.246, bottom: 0.004, top: 0.336 },
  { id: 'hip', z: 1.092, hw: 0.262, bottom: -0.018, top: 0.330 },
  { id: 'crotch', z: 1.172, hw: 0.240, bottom: 0.022, top: 0.300, cleft: 0.030 },
  { id: 'thigh', z: 1.300, hw: 0.216, bottom: 0.006, top: 0.286, cleft: 0.026 },
  { id: 'knee', z: 1.470, hw: 0.180, bottom: 0.002, top: 0.256, cleft: 0.018 },
  { id: 'calf', z: 1.592, hw: 0.166, bottom: 0.030, top: 0.236, cleft: 0.022 },
  { id: 'shin', z: 1.720, hw: 0.142, bottom: 0.034, top: 0.202, cleft: 0.028 },
  { id: 'ankle', z: 1.816, hw: 0.106, bottom: 0.046, top: 0.166, cleft: 0.030 },
  { id: 'heel', z: 1.862, hw: 0.124, bottom: -0.010, top: 0.188, cleft: 0.034 },
  { id: 'toe', z: 1.924, hw: 0.130, bottom: 0.052, top: 0.238, cleft: 0.058 },
  { id: 'toe-tip', z: 1.962, hw: 0.078, bottom: 0.078, top: 0.180, cleft: 0.030 },
]);

/** Crown to toe, before any `length` scaling. */
const BASE_LENGTH = STATIONS[STATIONS.length - 1].z;

/** Low enough to facet, high enough that the shoulders still read as round. */
const RADIAL = 14;

/** Where the sheet meets the floor. Sections below this are flattened onto it. */
const REST_Y = 0.012;

/*
 * Tape, in unscaled station coordinates. Wound at an angle rather than square
 * to the body, unevenly spaced, and doubled at the knee because whoever put it
 * on did not trust the first lap. `tilt` shears the band along Z per metre of
 * X, which is what a band wound by hand actually does.
 */
const TAPE = Object.freeze([
  { id: 'neck', at: 0.285, width: 0.082, tilt: 0.17, outset: 0.010 },
  { id: 'chest', at: 0.560, width: 0.118, tilt: -0.12, outset: 0.010, lap: true },
  { id: 'waist', at: 0.958, width: 0.106, tilt: 0.20, outset: 0.011 },
  { id: 'knee', at: 1.452, width: 0.100, tilt: -0.09, outset: 0.010 },
  { id: 'knee-again', at: 1.526, width: 0.088, tilt: 0.22, outset: 0.015 },
  { id: 'ankle', at: 1.810, width: 0.094, tilt: 0.25, outset: 0.010 },
]);

/*
 * Blood does not spray about in here. It collects at the bottom of the bag, so
 * it goes where the sheet sags: the hollow of the neck, the small of the back
 * under the waist, and behind the knees. Anything past that belongs to the
 * scenes that are allowed it, and this prop is not one of them.
 */
const STAINS = Object.freeze([
  { at: 0.155, y: 0.052, r: 0.058, ry: 0.022, rz: 0.075 },
  { at: 0.255, y: 0.058, r: 0.076, ry: 0.028, rz: 0.130 },
  { at: 0.950, y: 0.062, r: 0.102, ry: 0.030, rz: 0.160 },
  { at: 1.505, y: 0.038, r: 0.070, ry: 0.024, rz: 0.100 },
]);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** The section at an arbitrary z, interpolated between the authored stations. */
function sectionAt(stations, z) {
  if (z <= stations[0].z) return stations[0];
  const last = stations[stations.length - 1];
  if (z >= last.z) return last;
  for (let i = 1; i < stations.length; i++) {
    const b = stations[i];
    if (z > b.z) continue;
    const a = stations[i - 1];
    const t = (z - a.z) / (b.z - a.z);
    return {
      id: `${a.id}~${b.id}`,
      z,
      hw: lerp(a.hw, b.hw, t),
      bottom: lerp(a.bottom, b.bottom, t),
      top: lerp(a.top, b.top, t),
      cleft: lerp(a.cleft ?? 0, b.cleft ?? 0, t),
    };
  }
  return last;
}

/**
 * One ring of the sheet at one station.
 *
 * The roll is small and grows toward the feet, because a body rolled onto a
 * sheet does not end up perfectly supine and the legs go over further than the
 * shoulders do. The crease term is two low harmonics: enough to stop the loft
 * looking machined, not so much that the silhouette stops being a person.
 */
function sheetRing(station, { outset = 0, seed = 0, roll = 0, clampY = REST_Y, tilt = 0 }) {
  const cy = (station.top + station.bottom) / 2;
  const hh = (station.top - station.bottom) / 2;
  const cos = Math.cos(roll);
  const sin = Math.sin(roll);
  const ring = [];
  for (let i = 0; i < RADIAL; i++) {
    const a = (i / RADIAL) * Math.PI * 2;
    const crease = 1
      + 0.050 * Math.sin(3 * a + station.z * 6.1 + seed)
      + 0.028 * Math.sin(5 * a - station.z * 3.3 + seed * 1.7);
    const ex = (station.hw + outset) * Math.cos(a) * crease;
    let ey = (hh + outset) * Math.sin(a) * crease;
    // The groove between two feet, or between two legs: sheeting drops into the
    // gap rather than tenting across it.
    if (station.cleft && ey > 0) {
      const across = Math.min(1, Math.abs(Math.cos(a)) * 2);
      ey -= station.cleft * (1 - across * across);
    }
    const x = ex * cos - ey * sin;
    const y = Math.max(clampY, cy + ex * sin + ey * cos);
    ring.push(x, y, station.z + tilt * x);
  }
  return ring;
}

/**
 * Stitch rings into a surface.
 *
 * Rings must arrive in increasing z or every normal points inward. The winding
 * below was chosen so the outward face is the front face; if you reorder the
 * rings, reorder the indices with them.
 */
function loft(rings, { capStart = false, capEnd = false } = {}) {
  const positions = [];
  for (const ring of rings) positions.push(...ring);
  const indices = [];
  for (let s = 0; s < rings.length - 1; s++) {
    const a = s * RADIAL;
    const b = (s + 1) * RADIAL;
    for (let i = 0; i < RADIAL; i++) {
      const j = (i + 1) % RADIAL;
      indices.push(a + i, b + j, b + i, a + i, a + j, b + j);
    }
  }
  const capAt = (ringIndex, facingPositive) => {
    const ring = rings[ringIndex];
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < RADIAL; i++) {
      cx += ring[i * 3];
      cy += ring[i * 3 + 1];
    }
    const centre = positions.length / 3;
    positions.push(cx / RADIAL, cy / RADIAL, ring[2]);
    const base = ringIndex * RADIAL;
    for (let i = 0; i < RADIAL; i++) {
      const j = (i + 1) % RADIAL;
      if (facingPositive) indices.push(centre, base + i, base + j);
      else indices.push(centre, base + j, base + i);
    }
  };
  if (capStart) capAt(0, false);
  if (capEnd) capAt(rings.length - 1, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The excess past the head and past the feet, gathered and twisted.
 *
 * This is the detail that kills the capsule read on its own: a capsule ends,
 * and a wrapped body does not -- there is always a metre of spare sheet that
 * somebody screwed up in their fist and taped. The fold term is a harmonic at
 * half the radial count, so the surface pleats rather than tapering smoothly,
 * and the whole thing rotates as it narrows so the pleats spiral.
 */
function gather({ from, to, r0, r1, y0, y1, drift, twist }) {
  const steps = 7;
  const rings = [];
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const r = lerp(r0, r1, u);
    const cy = lerp(y0, y1, u);
    const cx = drift * u * u;
    const z = lerp(from, to, u);
    const spin = twist * u;
    const ring = [];
    for (let i = 0; i < RADIAL; i++) {
      const a = (i / RADIAL) * Math.PI * 2 + spin;
      const fold = 1 + 0.24 * Math.sin((RADIAL / 2) * a) * (0.3 + u);
      ring.push(cx + r * fold * Math.cos(a), cy + r * fold * Math.sin(a) * 0.86, z);
    }
    rings.push(ring);
  }
  if (to < from) rings.reverse();
  return loft(rings, { capStart: to < from, capEnd: to > from });
}

/**
 * Build one wrapped body lying along local Z, head at -Z, feet at +Z, with the
 * group origin on the floor beneath the middle of it.
 *
 * @param {object} [options]
 * @param {number} [options.length]  crown to toe in metres; the gathered ends add more.
 * @param {number} [options.build]   girth multiplier, 1 being an ordinary adult male.
 * @param {'flat'|'propped'} [options.pose]  lying on the floor, or head end raised.
 * @param {number} [options.stain]   0 for clean, 1 for as far as this prop goes.
 * @param {boolean} [options.hollow] skip the dark inner mass because the caller
 *                                   has a real figure to put inside the sheet.
 * @param {number} [options.seed]    shifts the creases, so two of these differ.
 * @param {string} [options.name]    prefix for every mesh name in the result.
 */
export function buildWrappedBody({
  length = BASE_LENGTH,
  build = 1,
  pose = 'flat',
  stain = 0.6,
  hollow = false,
  seed = 3,
  name = 'wrapped-body',
} = {}) {
  const lengthScale = length / BASE_LENGTH;
  const girth = 1 + (build - 1) * 0.55;
  const propped = pose === 'propped';

  const stations = STATIONS.map((s) => ({
    id: s.id,
    z: s.z * lengthScale - (length / 2),
    hw: s.hw * build,
    bottom: s.bottom * girth,
    top: s.top * girth,
    cleft: (s.cleft ?? 0) * girth,
  }));
  const headZ = stations[0].z;
  const footZ = stations[stations.length - 1].z;
  // Propped up, the head half is off the floor, so it must not be flattened
  // against it. Below the hips it still bears, and still spreads.
  const clampFor = (station) => (propped && station.z < 0 ? -Infinity : REST_Y);
  const rollFor = (station) => 0.045 + 0.15 * ((station.z - headZ) / length);

  const g = group(name);

  const sheetGeometry = loft(
    stations.map((station) => sheetRing(station, {
      seed, roll: rollFor(station), clampY: clampFor(station),
    })),
    { capStart: true, capEnd: true },
  );

  /*
   * Cheap contractor sheeting: milky, dull, and thick enough to hide a face
   * without hiding that there is one. Two passes over one geometry -- back
   * faces first -- because a single DoubleSide transparent mesh has no way to
   * sort its own far side behind its near side.
   */
  const sheetParams = {
    // Grey, not white. Contractor sheeting off a roll is dull and a bit dirty,
    // and a near-white albedo blows straight out under any close practical --
    // the graveyard's trunk lamp sits two feet from this thing.
    color: 0xa3aaa5,
    roughness: 0.82,
    metalness: 0,
    transparent: true,
    opacity: hollow ? 0.5 : 0.58,
    depthWrite: false,
    flatShading: true,
  };
  const sheetInner = new THREE.Mesh(sheetGeometry, mat({ ...sheetParams, side: THREE.BackSide, opacity: sheetParams.opacity * 0.75 }));
  sheetInner.name = `${name}.sheet-inner`;
  sheetInner.renderOrder = 1;
  sheetInner.castShadow = false;
  const sheet = new THREE.Mesh(sheetGeometry, mat({ ...sheetParams, side: THREE.FrontSide }));
  sheet.name = `${name}.sheet`;
  sheet.renderOrder = 2;
  sheet.castShadow = true;
  sheet.receiveShadow = false;

  let mass = null;
  if (!hollow) {
    mass = new THREE.Mesh(
      loft(
        stations.map((station) => sheetRing(station, {
          outset: -0.026, seed: seed + 1.4, roll: rollFor(station),
          clampY: clampFor(station) === -Infinity ? -Infinity : REST_Y + 0.012,
        })),
        { capStart: true, capEnd: true },
      ),
      mat({ color: 0x1d1a19, roughness: 0.95 }),
    );
    mass.name = `${name}.mass`;
    mass.castShadow = false;
    mass.receiveShadow = false;
    g.add(mass);
  }

  const stains = [];
  if (stain > 0) {
    const stainMat = mat({
      color: 0x38100d,
      roughness: 1,
      transparent: true,
      opacity: Math.min(0.92, 0.55 + stain * 0.4),
    });
    for (const [index, spot] of STAINS.entries()) {
      const z = spot.at * lengthScale - length / 2;
      const section = sectionAt(stations, z);
      const scale = 0.65 + stain * 0.5;
      const ry = spot.ry * scale;
      const blob = sphere({
        // Anchored to the underside the sheet actually has at this point down
        // the body. Authoring these at a fixed height put them through the
        // plastic wherever the body was thin.
        r: Math.min(spot.r * build, section.hw * 0.6) * scale,
        ry,
        rz: spot.rz * lengthScale * scale,
        pos: [(index % 2 ? 0.03 : -0.045) * build, Math.max(REST_Y, section.bottom) + ry * 1.1, z],
        mat: stainMat,
        cast: false,
        receive: false,
      });
      blob.name = `${name}.stain.${index}`;
      stains.push(blob);
      g.add(blob);
    }
  }

  g.add(sheetInner, sheet);

  // Darker than the sheeting it is holding down, or a band of tape reads as
  // nothing more than a slightly proud fold in the plastic.
  const tapeMat = mat({ color: 0x62655f, roughness: 0.66, metalness: 0.12 });
  const tape = [];
  for (const band of TAPE) {
    const centre = band.at * lengthScale - length / 2;
    const half = (band.width / 2) * lengthScale;
    const rings = [-half, -half * 0.34, half * 0.34, half].map((offset) => {
      const station = sectionAt(stations, centre + offset);
      // The edges of a tape lap pinch into the sheet; the middle stands proud.
      const edge = Math.abs(offset) > half * 0.8;
      return sheetRing(station, {
        outset: band.outset * (edge ? 0.35 : 1) * build,
        seed,
        roll: rollFor(station),
        clampY: clampFor(station),
        tilt: band.tilt,
      });
    });
    const mesh = new THREE.Mesh(loft(rings), tapeMat);
    mesh.name = `${name}.tape.${band.id}`;
    mesh.castShadow = false;
    tape.push(mesh);
    g.add(mesh);

    if (!band.lap) continue;
    // Where the roll was started and torn off, sitting proud of its own band.
    const station = sectionAt(stations, centre);
    const lapTop = station.top + band.outset * build + 0.006;
    const lapStart = box({
      size: [0.13 * build, 0.005, band.width * 0.86 * lengthScale],
      pos: [0.055 * build, lapTop, centre + 0.012],
      mat: tapeMat,
      rotX: band.tilt,
      rotZ: -0.22,
      receive: false,
    });
    lapStart.name = `${name}.tape.${band.id}.lap`;
    const lapTail = box({
      size: [0.075 * build, 0.004, band.width * 0.6 * lengthScale],
      pos: [0.145 * build, lapTop - 0.018, centre + 0.02],
      mat: tapeMat,
      rotX: band.tilt + 0.2,
      rotZ: -0.5,
      receive: false,
    });
    lapTail.name = `${name}.tape.${band.id}.lap-tail`;
    tape.push(lapStart, lapTail);
    g.add(lapStart, lapTail);
  }

  const gatherMat = mat({
    color: 0xafb5b1, roughness: 0.8, transparent: true, opacity: 0.86, flatShading: true,
  });
  const gathers = {};
  const gatherSpecs = [
    {
      id: 'head',
      from: headZ + 0.004,
      to: headZ - 0.185 * lengthScale,
      r0: 0.062 * build, r1: 0.021 * build,
      y0: 0.132 * girth, y1: 0.062 * girth,
      drift: -0.035 * build, twist: 1.15,
    },
    {
      id: 'feet',
      from: footZ - 0.004,
      to: footZ + 0.198 * lengthScale,
      r0: 0.076 * build, r1: 0.026 * build,
      y0: 0.126 * girth, y1: 0.055 * girth,
      drift: 0.042 * build, twist: -0.95,
    },
  ];
  for (const spec of gatherSpecs) {
    const mesh = new THREE.Mesh(gather(spec), gatherMat);
    mesh.name = `${name}.gather.${spec.id}`;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    g.add(mesh);
    gathers[spec.id] = mesh;

    // Taped off a third of the way along, which is where a hand stops twisting.
    const t = 0.36;
    const tie = cylinder({
      r: lerp(spec.r0, spec.r1, t) * 1.24,
      h: 0.034 * lengthScale,
      seg: 10,
      pos: [spec.drift * t * t, lerp(spec.y0, spec.y1, t), lerp(spec.from, spec.to, t)],
      mat: tapeMat,
      rotX: Math.PI / 2,
      receive: false,
    });
    tie.name = `${name}.gather.${spec.id}.tie`;
    tape.push(tie);
    g.add(tie);
  }

  if (propped) {
    // Rotating about the origin drops the feet by as much as it lifts the head,
    // so the whole thing comes back up to stand on them.
    const tilt = 0.15;
    g.rotation.x = tilt;
    g.position.y = Math.sin(tilt) * (length / 2 + 0.2);
  }

  const at = (id) => stations.find((station) => station.id === id);
  const shoulder = at('shoulder');
  const belly = at('belly');
  const measurements = Object.freeze({
    length,
    headZ,
    footZ,
    width: shoulder.hw * 2,
    height: belly.top,
    /** Mid-thickness of the body above the group origin, for callers with a
     *  centre-origin figure to line up inside the sheet. */
    centreY: (belly.top + REST_Y) / 2,
    // The landmarks anything measuring this prop wants to slice at.
    noseZ: at('nose').z,
    neckZ: at('neck').z,
    shoulderZ: shoulder.z,
    hipZ: at('hip').z,
    ankleZ: at('ankle').z,
    pose,
    hollow,
  });
  g.userData.wrappedBody = measurements;
  g.userData.presentation = 'wrapped-body';

  return { group: g, sheet, sheetInner, mass, tape, gathers, stains, ...measurements };
}

/**
 * Measure a built wrapped body from its actual vertices.
 *
 * Tests and the browser verifiers both need to prove this thing is not a pill,
 * and a number the builder wrote into `userData` proves nothing about the mesh
 * it handed back. So this reads the sheet's position buffer and reports what is
 * really there. Accepts the group or the sheet mesh.
 */
export function measureWrappedBody(target) {
  const sheet = target?.isMesh
    ? target
    : target?.children?.find((child) => child.isMesh && /\.sheet$/.test(child.name));
  if (!sheet) throw new TypeError('measureWrappedBody needs a wrapped body group or its sheet mesh');
  const position = sheet.geometry.getAttribute('position');

  let minX = Infinity; let maxX = -Infinity;
  let minY = Infinity; let maxY = -Infinity;
  let minZ = Infinity; let maxZ = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  /** Width and height of the sheet within a slice of Z. */
  const sliceAt = (z, tolerance = 0.02) => {
    let lo = Infinity; let hi = -Infinity;
    let bottom = Infinity; let top = -Infinity;
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getZ(i) - z) > tolerance) continue;
      const x = position.getX(i);
      const y = position.getY(i);
      if (x < lo) lo = x;
      if (x > hi) hi = x;
      if (y < bottom) bottom = y;
      if (y > top) top = y;
    }
    return { width: hi - lo, height: top - bottom, bottom };
  };

  /*
   * Which end is the head is answered by mass, not by a label: sum the section
   * area down each half of the body and the half carrying the skull, shoulders,
   * chest and belly comes out heavier than the half carrying two legs.
   */
  const half = (from, to) => {
    let total = 0;
    const step = (to - from) / 24;
    for (let z = from; z <= to; z += step) {
      const slice = sliceAt(z, Math.abs(step));
      if (Number.isFinite(slice.width)) total += slice.width * slice.height;
    }
    return total;
  };
  const mid = (minZ + maxZ) / 2;

  const data = target?.userData?.wrappedBody ?? sheet.parent?.userData?.wrappedBody ?? null;
  // End slices are taken as fractions of the body so a short one and a long one
  // are measured at the same place on the anatomy rather than the same metre.
  const span = maxZ - minZ;
  return {
    length: span,
    width: maxX - minX,
    height: maxY - minY,
    minZ,
    maxZ,
    head: sliceAt(data?.noseZ ?? minZ + span * 0.07),
    neck: sliceAt(data?.neckZ ?? minZ + span * 0.14),
    shoulder: sliceAt(data?.shoulderZ ?? mid - 0.58),
    hip: sliceAt(data?.hipZ ?? mid + 0.11),
    ankle: sliceAt(data?.ankleZ ?? mid + 0.83),
    headEnd: sliceAt(minZ + span * 0.005, span * 0.012),
    footEnd: sliceAt(maxZ - span * 0.005, span * 0.012),
    feet: sliceAt(maxZ - span * 0.035, span * 0.02),
    headHalfArea: half(minZ, mid),
    footHalfArea: half(mid, maxZ),
  };
}

export { STATIONS as WRAPPED_BODY_STATIONS, BASE_LENGTH as WRAPPED_BODY_LENGTH };
