/**
 * Squatchbourg — the city the Fat Squatch is addressed to, the shock front
 * crossing it, and the hole that is left where it used to be.
 *
 * The owner's brief, in order: "I want a good target we need a small city...
 * I want it to be more extensive", then "I want a giant crater where the city
 * used to be", and then, on seeing the first version: "I want it detailed. We
 * don't need fine texture but i want quite an elaborate city to drop the bomb
 * on so it's a powerful scene."
 *
 * ---------------------------------------------------------------------------
 * DRAW-CALL BUDGET (the reason this file looks the way it does)
 *
 * The city has to read as a PLACE from three thousand feet — districts you can
 * tell apart, a waterfront, heavy industry with its own skyline, a marshalling
 * yard, landmarks worth aiming at — and it has to do it in a browser. So
 * nothing here is a mesh per object. The whole city is:
 *
 *   1  ground plate       one subdivided plane following the real heightfield,
 *                          painted once into one canvas (districts, roads,
 *                          rail, park, docks, river)
 *   1  river              one strip following the carved channel
 *   6  tower blocks       ONE InstancedMesh — downtown, mid-rise, warehouses
 *                          and factory sheds — drawn once per box face group,
 *                          because the four walls carry the shared
 *                          night-window texture and the roof and the underside
 *                          deliberately do not. See `buildBlocks()`: a box's
 *                          six faces share one UV square, so a single material
 *                          put lit windows on every rooftop in the city.
 *   1  houses             InstancedMesh — terraces and the outskirts
 *   1  roofs              InstancedMesh — pitched roofs on the houses
 *   1  rooftop clutter    InstancedMesh — tanks, stair huts, vents
 *   1  chimneys           InstancedMesh
 *   1  street lights      InstancedMesh — the lamp heads
 *   1  lamp columns       InstancedMesh — what the lamp heads stand on
 *   1  trees              InstancedMesh — the park, the avenues, the allotments
 *   1  rolling stock      InstancedMesh — the marshalling yard and the sidings
 *   1  river craft        InstancedMesh — barges and lighters at the quays
 *  ~6  landmark kit       `./PartKit.js` — EVERY landmark (cathedral, stadium,
 *                          gasworks, refinery, power station, cranes, bridges,
 *                          silos, station, masts) is a list of primitives that
 *                          all go into a handful of InstancedMeshes keyed by
 *                          shape and finish. Twenty landmarks for six draw
 *                          calls instead of two hundred and fifty.
 *
 * Roughly twenty-five draw calls for the entire target. `stats()` reports the
 * real numbers and `tools/verify-enolasquatch.mjs` measures the whole frame
 * with a real render rather than trusting this comment.
 *
 * ---------------------------------------------------------------------------
 * THE END OF IT
 *
 * `destroy(point)` takes away everything inside the fireball at once — that
 * part genuinely is instantaneous — and then arms a queue. `advanceShock(r)`
 * is called every frame by the detonation with the radius its front has
 * reached, and knocks over exactly the ring of city the front has just crossed.
 * That is why the city is now WIDER than the crater: the old one was 560 m
 * across inside an 810 m lip, so the whole place vanished on the frame of the
 * flash and there was nothing left to watch the blast wave do anything to.
 *
 * `restore()` is the undo for both of them, and it exists because a checkpoint
 * restart before the drop has to hand the player a city to bomb rather than a
 * hole to bomb again. See its own comment for the whole of that bug.
 * ---------------------------------------------------------------------------
 */
import * as THREE from 'three';
import {
  mat, solid, unlit, boxGeo, cylGeo, coneGeo, group,
  clamp, lerp, smoothstep, fbm, rng,
} from '../../beefrun/util.js';
import { TARGET_CITY, CRATER } from '../config.js';
import { PartKit } from './PartKit.js';

/* ------------------------------------------------------------------ */
/* The river — shared with the mission's own ground function            */
/* ------------------------------------------------------------------ */

/**
 * Signed distance from the river's centreline, in city-local coordinates.
 * Positive one side, negative the other; zero on the line.
 */
export function riverSignedDistance(lx, lz, cfg = TARGET_CITY) {
  const nx = -Math.sin(cfg.riverAngle);
  const nz = Math.cos(cfg.riverAngle);
  return lx * nx + lz * nz - cfg.riverOffset;
}

/**
 * How far the ground drops for the river channel, in city-local coordinates.
 *
 * Exported because TWO things have to agree about it or the water sits on a
 * hillside: this file, which lays the river surface and the quays, and
 * `main.js`'s `rawEastHeight`, which is what the aeroplane and the payload
 * actually collide with. A river drawn on flat ground is a blue ribbon; a
 * river in a carved channel is a river.
 */
export function riverCarve(lx, lz, cfg = TARGET_CITY) {
  const s = Math.abs(riverSignedDistance(lx, lz, cfg));
  const half = cfg.riverWidth / 2;
  const bank = half + 110;
  if (s > bank) return 0;
  const inChannel = smoothstep(bank, half, s);
  // Runs out past the edge of town rather than scoring a trench across the
  // whole desert.
  const reach = 1 - smoothstep(cfg.radius * 1.1, cfg.radius * 1.6, Math.hypot(lx, lz));
  return -15 * inChannel * reach;
}

/* ------------------------------------------------------------------ */
/* Textures                                                            */
/* ------------------------------------------------------------------ */

/**
 * One wall texture for every block in the city: a grid of windows, most of
 * them dark, a scattering lit. Buildings are scaled boxes so the grid stretches
 * per instance, which at three thousand feet reads as "different buildings have
 * different window spacing" rather than as a mistake.
 *
 * Returned as a pair — the colour map and a matching emissive map with ONLY
 * the lit windows on it — so the lit ones actually glow at night instead of
 * being pale grey squares.
 *
 * Owner playtest, 2026-08-06: "building lights too dense." At 24% lit and a
 * pale amber-white (`#ffe6b0`/`#ffc86a`, both close enough to white that a
 * whole tower reads as one bright slab rather than individual windows), a
 * 130 m tower shows on the order of two hundred windows at once through the
 * texture's 2.2x3.4 repeat — from three thousand feet that is a lit wall, not
 * a lit CITY. Down to 13% and warmed toward orange (`#ffa542`/`#ff8a2e`,
 * pushed further from white than the old pair), which is sparser and reads
 * as individual points of light rather than a glowing slab, and warmer in the
 * literal colour-temperature sense the owner asked for.
 */
function windowTextures(seed) {
  const rand = rng(seed);
  const COLS = 12;
  const ROWS = 20;
  const W = 256;
  const H = 512;
  const colour = document.createElement('canvas');
  colour.width = W; colour.height = H;
  const glow = document.createElement('canvas');
  glow.width = W; glow.height = H;
  const c = colour.getContext('2d');
  const e = glow.getContext('2d');

  c.fillStyle = '#3c3a42';
  c.fillRect(0, 0, W, H);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    c.fillStyle = `rgba(0,0,0,${rand() * 0.09})`;
    c.fillRect(rand() * W, rand() * H, rand() * 22, rand() * 6);
  }
  const cw = W / COLS;
  const ch = H / ROWS;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * cw + cw * 0.22;
      const y = row * ch + ch * 0.22;
      const w = cw * 0.56;
      const h = ch * 0.5;
      const lit = rand() < 0.13;
      c.fillStyle = lit ? '#e69454' : '#20222c';
      c.fillRect(x, y, w, h);
      if (lit) {
        e.fillStyle = rand() < 0.3 ? '#ffa542' : '#ff8a2e';
        e.fillRect(x, y, w, h);
      }
    }
    c.fillStyle = 'rgba(0,0,0,0.16)';
    c.fillRect(0, row * ch + ch * 0.86, W, 2);
  }
  const map = new THREE.CanvasTexture(colour);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const emissive = new THREE.CanvasTexture(glow);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  return { map, emissive };
}

/**
 * The ground plate: streets, districts, the park, the rail yard, the docks,
 * and the river channel, painted once into one canvas.
 *
 * Drawn in CITY-LOCAL metres and then scaled onto the plate, so everything in
 * here can be written in the same coordinates the geometry uses.
 */
function groundTexture(cfg, seed) {
  const rand = rng(seed);
  const S = 2048;
  const span = cfg.radius * 2.1;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const px = S / span;                                   // pixels per metre
  const toX = (lx) => (lx + span / 2) * px;
  const toY = (lz) => (lz + span / 2) * px;

  ctx.fillStyle = '#2a2820';
  ctx.fillRect(0, 0, S, S);

  /* Blocks: lighter ground between the roads, so the grid reads even where no
   * building stands. Density falls off toward the edge of town. */
  const step = cfg.blockSize * px;
  const cells = Math.ceil(span / cfg.blockSize);
  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j <= cells; j++) {
      const lx = -span / 2 + i * cfg.blockSize;
      const lz = -span / 2 + j * cfg.blockSize;
      const r = Math.hypot(lx, lz);
      if (r > cfg.radius * 1.02) continue;
      const near = 1 - smoothstep(cfg.midRadius, cfg.radius, r);
      ctx.fillStyle = `rgba(62,58,48,${0.35 + near * 0.5})`;
      ctx.fillRect(toX(lx) + 3, toY(lz) + 3, step - 6, step - 6);
    }
  }

  /* Roads. */
  ctx.strokeStyle = '#171614';
  ctx.lineWidth = Math.max(2, cfg.streetWidth * px * 0.55);
  for (let i = 0; i <= cells; i++) {
    const p = -span / 2 + i * cfg.blockSize;
    ctx.beginPath(); ctx.moveTo(toX(p), 0); ctx.lineTo(toX(p), S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toY(p)); ctx.lineTo(S, toY(p)); ctx.stroke();
  }
  /* Four avenues out of the middle, wider, with a centre line. */
  ctx.strokeStyle = '#232120';
  ctx.lineWidth = Math.max(4, cfg.streetWidth * px * 1.5);
  ctx.beginPath(); ctx.moveTo(toX(0), 0); ctx.lineTo(toX(0), S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, toY(0)); ctx.lineTo(S, toY(0)); ctx.stroke();
  ctx.save();
  ctx.translate(toX(0), toY(0));
  ctx.rotate(Math.PI / 4);
  ctx.beginPath(); ctx.moveTo(-S, 0); ctx.lineTo(S, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -S); ctx.lineTo(0, S); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(216,200,140,0.34)';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 16]);
  ctx.beginPath(); ctx.moveTo(toX(0), 0); ctx.lineTo(toX(0), S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, toY(0)); ctx.lineTo(S, toY(0)); ctx.stroke();
  ctx.setLineDash([]);

  /* The park. */
  ctx.fillStyle = '#26361f';
  ctx.beginPath();
  ctx.ellipse(toX(-cfg.downtownRadius * 1.35), toY(cfg.downtownRadius * 0.9),
    190 * px, 140 * px, 0.3, 0, Math.PI * 2);
  ctx.fill();

  /* The marshalling yard: ballast, then eight sidings. */
  ctx.save();
  ctx.translate(toX(cfg.midRadius * 0.55), toY(cfg.midRadius * 0.92));
  ctx.rotate(0.12);
  ctx.fillStyle = '#3b3730';
  ctx.fillRect(-460 * px, -46 * px, 920 * px, 92 * px);
  ctx.strokeStyle = '#5a544a';
  ctx.lineWidth = Math.max(1, 1.6 * px);
  for (let i = 0; i < 8; i++) {
    const y = (-38 + i * 11) * px;
    ctx.beginPath(); ctx.moveTo(-455 * px, y); ctx.lineTo(455 * px, y); ctx.stroke();
  }
  ctx.restore();

  /* Two main lines running out of town. */
  ctx.strokeStyle = '#4a443c';
  ctx.lineWidth = Math.max(1, 3 * px);
  ctx.beginPath();
  ctx.moveTo(toX(-span / 2), toY(cfg.midRadius * 1.05));
  ctx.lineTo(toX(span / 2), toY(cfg.midRadius * 0.75));
  ctx.stroke();

  /* Industry: hardstanding over the whole wedge, plus oil staining. */
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(0));
  ctx.arc(toX(0), toY(0), cfg.radius * px,
    cfg.industryAngle - cfg.industrySpread, cfg.industryAngle + cfg.industrySpread);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = 'rgba(38,34,28,0.85)';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 320; i++) {
    ctx.fillStyle = `rgba(20,17,14,${0.1 + rand() * 0.3})`;
    ctx.fillRect(rand() * S, rand() * S, 6 + rand() * 40, 6 + rand() * 30);
  }
  ctx.restore();

  /* The river channel and its quays. */
  ctx.save();
  ctx.translate(toX(0), toY(0));
  ctx.rotate(-cfg.riverAngle);
  const off = cfg.riverOffset * px;
  ctx.fillStyle = '#43413a';
  ctx.fillRect(-S, off - (cfg.riverWidth / 2 + 34) * px, S * 2, (cfg.riverWidth + 68) * px);
  ctx.fillStyle = '#141c26';
  ctx.fillRect(-S, off - (cfg.riverWidth / 2) * px, S * 2, cfg.riverWidth * px);
  ctx.fillStyle = '#5a5348';
  for (let i = -14; i <= 14; i++) {
    ctx.fillRect(i * 74 * px, off - (cfg.riverWidth / 2 + 30) * px, 46 * px, 26 * px);
    ctx.fillRect(i * 74 * px, off + (cfg.riverWidth / 2 + 4) * px, 46 * px, 26 * px);
  }
  ctx.restore();

  /* Dirt, yards and wear. */
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(90,74,52,${0.08 + rand() * 0.2})`;
    ctx.fillRect(rand() * S, rand() * S, 6 + rand() * 30, 6 + rand() * 30);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ------------------------------------------------------------------ */
/* The crater profile — shared by the mesh, the ground and the physics */
/* ------------------------------------------------------------------ */

/**
 * How far below (or above) the original ground the crater sits, `d` metres
 * from its centre. Continuous everywhere: a parabolic bowl from `-depth` at
 * the middle up to `+rimHeight` at the lip, then the thrown-up lip decaying to
 * nothing over `rimWidth`.
 *
 * Exported because THREE things have to agree about it or the player flies
 * into invisible ground: the crater mesh, the coarse east-ground mesh that is
 * pushed down under it, and `groundHeightCombined()` in `main.js`, which is
 * what `AircraftPhysics` and the payload's impact test both sample.
 */
export function craterOffset(d, cfg = CRATER) {
  const outer = cfg.radius + cfg.rimWidth;
  if (d >= outer) return 0;
  if (d <= cfg.radius) {
    const t = d / cfg.radius;
    return lerp(-cfg.depth, cfg.rimHeight, smoothstep(0, 1, t * t));
  }
  const t = (d - cfg.radius) / cfg.rimWidth;
  return cfg.rimHeight * (1 - t) * (1 - t);
}

/* ------------------------------------------------------------------ */

const _dummy = new THREE.Object3D();
const _colour = new THREE.Color();
const _scorched = new THREE.Color(0x1a1512);

/**
 * How brightly the lit windows burn while the town still has power.
 *
 * Named because TWO places need to agree about it — `buildBlocks()`, which sets
 * it, and `restore()`, which has to put it back after `destroy()` knocked it
 * down to `DEAD_WINDOW_GLOW`. It was a bare literal in one place and a second
 * bare literal in the other, which is exactly how a restored city ends up dark.
 *
 * 0.72 -> 0.5, alongside `windowTextures()`'s sparser, warmer palette (owner
 * playtest, 2026-08-06: "building lights too dense"): fewer lit windows at
 * full brightness still reads as a wall of light, so both numbers had to move
 * together — density in the texture, brightness here.
 */
export const WINDOW_GLOW = 0.5;
/** And what it is turned down to once the town has no power and no windows. */
export const DEAD_WINDOW_GLOW = 0.04;

/**
 * The instanced meshes a restore has to put back, in `this.parts` key order.
 *
 * Everything in this list is written once at build time from a source record
 * and then only ever hidden, flattened or scorched — so a byte-for-byte copy of
 * its `instanceMatrix`/`instanceColor` taken before the first `destroy()` is a
 * complete description of the standing city. The alternative — re-deriving each
 * transform from `rooftopOwner`/`lightPos`/`treePos`/… — cannot work, because
 * those lists only ever kept the (x, z) the shock front sorts on and never the
 * height, scale or rotation the matrix was built from.
 */
const RESTORABLE = [
  'buildings', 'houses', 'roofs', 'clutter', 'chimneys',
  'lights', 'lightPoles', 'trees', 'railStock', 'riverCraft',
];

/** Districts, in the order the block loop tests them. */
export const DISTRICTS = ['water', 'docks', 'rail', 'park', 'industry', 'downtown', 'midrise', 'terraces', 'edge'];

export class TargetCity {
  /**
   * @param {THREE.Object3D} scene
   * @param {object} o { x, z, getHeight } — the city centre, and the ground
   *   sampler it sits on (the same one physics uses, so nothing floats).
   */
  constructor(scene, { x, z, getHeight }) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.getHeight = getHeight;
    this.cfg = TARGET_CITY;
    this.groundY = getHeight(x, z);
    this.group = group('squatchbourg');
    this.group.position.set(x, 0, z);
    scene.add(this.group);

    /** Every building, so the detonation can rewrite them. */
    this.lots = [];
    /** False again after `restore()` — a restart before the drop rebuilds it. */
    this.destroyed = false;
    this.crater = null;
    /** A copy of every instance buffer as built. See `_takePristine()`. */
    this._pristine = null;
    /** Sorted queue the shock front eats through. See `advanceShock()`. */
    this._queue = [];
    this._queueAt = 0;
    this.shockRadius = 0;
    this.flattened = 0;

    this.kit = new PartKit('squatchbourg-kit');
    this.landmarks = [];

    this.build();
  }

  /** Ground elevation under a city-local point. */
  groundAt(lx, lz) { return this.getHeight(this.x + lx, this.z + lz); }

  /** Which district a city-local point belongs to. */
  districtAt(lx, lz) {
    const cfg = this.cfg;
    const r = Math.hypot(lx, lz);
    const s = riverSignedDistance(lx, lz, cfg);
    if (Math.abs(s) < cfg.riverWidth / 2 + 12) return 'water';
    if (Math.abs(s) < cfg.riverWidth / 2 + 120 && r < cfg.radius * 0.95) return 'docks';
    // The marshalling yard.
    const ry = { x: lx - cfg.midRadius * 0.55, z: lz - cfg.midRadius * 0.92 };
    const ca = Math.cos(-0.12); const sa = Math.sin(-0.12);
    const rx2 = ry.x * ca - ry.z * sa;
    const rz2 = ry.x * sa + ry.z * ca;
    if (Math.abs(rx2) < 470 && Math.abs(rz2) < 56) return 'rail';
    // The park.
    if (Math.hypot((lx + cfg.downtownRadius * 1.35) / 190, (lz - cfg.downtownRadius * 0.9) / 140) < 1) return 'park';
    // The industrial wedge.
    let ang = Math.atan2(lz, lx) - cfg.industryAngle;
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    if (Math.abs(ang) < cfg.industrySpread && r > cfg.downtownRadius * 1.5) return 'industry';
    if (r < cfg.downtownRadius) return 'downtown';
    if (r < cfg.midRadius) return 'midrise';
    if (r < cfg.suburbRadius) return 'terraces';
    return 'edge';
  }

  /* ---------------------------------------------------------------- */
  /* Build                                                             */
  /* ---------------------------------------------------------------- */

  build() {
    const cfg = this.cfg;
    const rand = rng(cfg.seed);

    this.parts = {};
    this.buildGround();
    this.buildRiver();
    const plan = this.planLots(rand);
    this.buildBlocks(plan.blocks);
    this.buildHouses(plan.houses);
    this.buildRooftops(rand);
    this.buildChimneys(rand);
    this.buildStreetLights(rand);
    this.buildTrees(rand);
    this.buildRailStock(rand);
    this.buildRiverCraft(rand);
    this.buildLandmarks();
    this.kit.mount(this.group);
  }

  /** The ground plate, following the real heightfield rather than sitting on it. */
  buildGround() {
    const cfg = this.cfg;
    const span = cfg.radius * 2.1;
    const geo = new THREE.PlaneGeometry(span, span, 72, 72);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.groundAt(pos.getX(i), pos.getZ(i)) + 0.4);
    }
    geo.computeVertexNormals();
    const streets = new THREE.Mesh(geo, mat({
      map: groundTexture(cfg, cfg.seed ^ 0x77), roughness: 0.96, unique: true,
    }));
    streets.name = 'squatchbourg-ground';
    streets.receiveShadow = false;
    this.group.add(streets);
    this.parts.streets = streets;
  }

  /** The river, laid into the channel `riverCarve()` cuts for it. */
  buildRiver() {
    const cfg = this.cfg;
    const len = cfg.radius * 2.6;
    const segs = 40;
    const geo = new THREE.PlaneGeometry(len, cfg.riverWidth, segs, 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const dirX = Math.cos(cfg.riverAngle);
    const dirZ = Math.sin(cfg.riverAngle);
    const nX = -Math.sin(cfg.riverAngle);
    const nZ = Math.cos(cfg.riverAngle);
    for (let i = 0; i < pos.count; i++) {
      const along = pos.getX(i);
      const across = pos.getZ(i);
      const lx = dirX * along + nX * (cfg.riverOffset + across);
      const lz = dirZ * along + nZ * (cfg.riverOffset + across);
      // The channel bottom is 15 m down at the centreline; the water sits 10 m
      // above that, so it runs about five metres below the surrounding grade.
      pos.setX(i, lx);
      pos.setZ(i, lz);
      pos.setY(i, this.groundAt(lx, lz) + 10.2);
    }
    geo.computeVertexNormals();
    const river = new THREE.Mesh(geo, mat({
      color: 0x16202c, roughness: 0.14, metalness: 0.42, unique: true,
    }));
    river.name = 'squatchbourg-river';
    this.group.add(river);
    this.parts.river = river;
  }

  /**
   * Walk the block grid and decide what stands on every lot.
   *
   * Returns two lists because they end up in two different InstancedMeshes:
   * `blocks` are the window-textured boxes (downtown, mid-rise, warehouses,
   * factory sheds) and `houses` are the plain low-rise that carry a pitched
   * roof. Everything either list produces is also pushed onto `this.lots`,
   * which is the record the detonation rewrites.
   */
  planLots(rand) {
    const cfg = this.cfg;
    const blocks = [];
    const houses = [];
    const half = Math.ceil(cfg.radius / cfg.blockSize);

    for (let bi = -half; bi <= half; bi++) {
      for (let bj = -half; bj <= half; bj++) {
        const bx = bi * cfg.blockSize;
        const bz = bj * cfg.blockSize;
        const r = Math.hypot(bx, bz);
        if (r > cfg.radius) continue;
        const district = this.districtAt(bx, bz);
        if (district === 'water' || district === 'park') continue;

        const inner = cfg.blockSize - cfg.streetWidth;
        let div;
        let vacancy;
        if (district === 'downtown') { div = 1 + (rand() < 0.5 ? 1 : 0); vacancy = 0.06; } else if (district === 'midrise') { div = 2; vacancy = 0.12; } else if (district === 'industry') { div = 1 + (rand() < 0.4 ? 1 : 0); vacancy = 0.3; } else if (district === 'docks') { div = 2; vacancy = 0.34; } else if (district === 'rail') { div = 1; vacancy = 0.82; } else if (district === 'terraces') { div = 3; vacancy = 0.16; } else { div = 2; vacancy = 0.46; }

        const lot = inner / div;
        for (let li = 0; li < div; li++) {
          for (let lj = 0; lj < div; lj++) {
            if (rand() < vacancy) continue;
            /* A little jitter off the perfect lot centre — real streets are
             * not a rigid grid of identical setbacks, and a lot snapped dead
             * centre every time is part of what a playtest called "buildings
             * look bad": correct shapes in a placement too regular to read as
             * a place. Downtown stays close to the line (a business district
             * IS built to the property line); everywhere else gets more play,
             * capped well inside the lot so nothing crosses into its
             * neighbour's or the street's. */
            const jitter = district === 'downtown' ? 0.04 : district === 'midrise' ? 0.08 : 0.12;
            const px = bx - inner / 2 + lot * (li + 0.5) + (rand() - 0.5) * lot * jitter;
            const pz = bz - inner / 2 + lot * (lj + 0.5) + (rand() - 0.5) * lot * jitter;
            const pr = Math.hypot(px, pz);
            if (pr > cfg.radius) continue;
            if (this.districtAt(px, pz) === 'water') continue;

            const y = this.groundAt(px, pz);
            const noise = fbm(px / 150, pz / 150, 3);
            let record;
            if (district === 'downtown' || district === 'midrise') {
              /* Height falls off from the middle: a downtown of towers, a
               * mid-rise ring, then two and three storeys out to the edge. The
               * noise term keeps the skyline from being a smooth cone. */
              const core = smoothstep(cfg.midRadius, 0, pr);
              const base = lerp(14, cfg.maxHeight, core * core) * (0.42 + noise * 1.1);
              record = {
                x: px, z: pz, y,
                w: lot * (0.64 + rand() * 0.26),
                d: lot * (0.64 + rand() * 0.26),
                h: clamp(base, 11, cfg.maxHeight),
                rot: (rand() - 0.5) * 0.06,
                tint: 0.6 + rand() * 0.5,
                warm: rand() < 0.4,
                district,
              };
              blocks.push(record);

              /* THE WEDDING CAKE. Owner playtest, 2026-08-06: "buildings look
               * bad" — every one of them a single flat-topped box was a real
               * part of that, on the towers most of all, since those are the
               * ones close enough to the camera on a bombing run to actually
               * read as a shape. A second, smaller box set back on top of the
               * taller ones is the classic real-world setback silhouette, and
               * it costs nothing extra: it is one more instance in the SAME
               * `blocks` InstancedMesh (still `squatchbourg-buildings`, still
               * one draw call for the walls and one for the roofs), not a new
               * mesh or a new material. Only the taller buildings get one —
               * a two-storey terrace with a wedding-cake top would read as a
               * mistake, not a variety. */
              if (record.h > cfg.maxHeight * 0.42 && rand() < (district === 'downtown' ? 0.4 : 0.2)) {
                const step = {
                  x: px, z: pz, y: y + record.h,
                  w: record.w * (0.48 + rand() * 0.22),
                  d: record.d * (0.48 + rand() * 0.22),
                  h: record.h * (0.24 + rand() * 0.3),
                  rot: record.rot + (rand() - 0.5) * 0.08,
                  tint: record.tint,
                  warm: record.warm,
                  district,
                };
                blocks.push(step);
                this.lots.push(step);
              }
            } else if (district === 'industry' || district === 'docks' || district === 'rail') {
              /* Long, low, wide — sheds and warehouses, not offices. */
              const long = rand() < 0.5;
              record = {
                x: px, z: pz, y,
                w: lot * (long ? 0.92 : 0.5),
                d: lot * (long ? 0.5 : 0.92),
                h: 9 + rand() * 16 + (district === 'docks' ? 4 : 0),
                rot: 0,
                tint: 0.44 + rand() * 0.3,
                warm: false,
                district,
              };
              blocks.push(record);
            } else {
              /* Terraces and the outskirts: small, warm, pitched. */
              const w = lot * (0.66 + rand() * 0.22);
              const d = lot * (0.62 + rand() * 0.24);
              const h = 5.4 + rand() * 4.2 + (district === 'terraces' ? 2.4 : 0);
              record = {
                x: px, z: pz, y, w, d, h,
                rot: (rand() - 0.5) * 0.05,
                tint: 0.55 + rand() * 0.55,
                warm: rand() < 0.72,
                district,
                roof: 3.0 + rand() * 2.4,
              };
              houses.push(record);
            }
            this.lots.push(record);
          }
        }
      }
    }
    return { blocks, houses };
  }

  buildBlocks(records) {
    const { map, emissive } = windowTextures(this.cfg.seed);
    const material = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: emissive,
      emissive: 0xffffff,
      emissiveIntensity: WINDOW_GLOW,
      roughness: 0.92,
      metalness: 0.02,
    });
    // A box's UVs are 0..1 per face, so repeat has to be modest or a 130 m
    // tower ends up with windows the size of doors.
    map.repeat.set(2.2, 3.4);
    emissive.repeat.set(2.2, 3.4);

    /* ---- THE GLOWING ROOFTOPS ----
     *
     * Owner playtest, 2026-08-04: "the city looks pretty funky. Theres light
     * all over the top of the buildings."
     *
     * There was, and this is where it came from. A `BoxGeometry` gives every
     * one of its six faces the same 0..1 UV square, so the night-window map —
     * and, worse, its emissive twin — was painted onto the TOP of each
     * building as well as onto its walls. From the only angle this city is
     * ever seen, which is three thousand feet directly above it, every
     * warehouse and every tower wore a glowing grid of lit windows on its
     * roof. Several thousand of them. That is the "funky", and it is why a
     * night city read as a field of illuminated waffles.
     *
     * The fix is a material per face rather than a material per mesh. A
     * `BoxGeometry` already carries one group per face in the order
     * +X, -X, +Y, -Y, +Z, -Z, and three.js honours that for an `InstancedMesh`
     * exactly as it does for a `Mesh`, so slots 2 and 3 — the roof and the
     * underside — take plain dark asphalt with no map and no emissive map at
     * all, and the four walls keep the windows. It costs five extra draw calls
     * across the entire city (see the budget note at the top of this file) and
     * no extra geometry: the cached unit box is shared and untouched.
     *
     * `instanceColor` still tints all six slots, which is what we want — a
     * building's roof is the same weathered colour as the building. */
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x55565c, roughness: 0.98, metalness: 0,
    });
    this.parts.buildingWallMat = material;
    this.parts.buildingRoofMat = roofMaterial;
    const faces = [material, material, roofMaterial, roofMaterial, material, material];

    const im = new THREE.InstancedMesh(boxGeo(1, 1, 1), faces, Math.max(records.length, 1));
    im.name = 'squatchbourg-buildings';
    im.castShadow = false;
    im.receiveShadow = false;
    records.forEach((l, i) => {
      l.mesh = 'blocks';
      l.index = i;
      _dummy.position.set(l.x, l.y + l.h / 2, l.z);
      _dummy.rotation.set(0, l.rot, 0);
      _dummy.scale.set(l.w, l.h, l.d);
      _dummy.updateMatrix();
      im.setMatrixAt(i, _dummy.matrix);
      _colour.setHex(l.warm ? 0x8a7a62 : 0x6e7280).multiplyScalar(l.tint);
      im.setColorAt(i, _colour);
    });
    im.count = records.length;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    this.group.add(im);
    this.parts.buildings = im;
  }

  buildHouses(records) {
    const body = new THREE.InstancedMesh(
      boxGeo(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }),
      Math.max(records.length, 1),
    );
    body.name = 'squatchbourg-houses';
    // A four-sided cone is a pyramid, which is a pitched roof from the air and
    // costs eight triangles.
    const roofs = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.72, 1, 4),
      new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }),
      Math.max(records.length, 1),
    );
    roofs.name = 'squatchbourg-roofs';

    records.forEach((l, i) => {
      l.mesh = 'houses';
      l.index = i;
      _dummy.position.set(l.x, l.y + l.h / 2, l.z);
      _dummy.rotation.set(0, l.rot, 0);
      _dummy.scale.set(l.w, l.h, l.d);
      _dummy.updateMatrix();
      body.setMatrixAt(i, _dummy.matrix);
      _colour.setHex(l.warm ? 0x7a5a44 : 0x5e5b52).multiplyScalar(l.tint);
      body.setColorAt(i, _colour);

      _dummy.position.set(l.x, l.y + l.h + l.roof / 2, l.z);
      _dummy.rotation.set(0, l.rot + Math.PI / 4, 0);
      _dummy.scale.set(l.w * 1.06, l.roof, l.d * 1.06);
      _dummy.updateMatrix();
      roofs.setMatrixAt(i, _dummy.matrix);
      _colour.setHex(0x40342c).multiplyScalar(0.7 + l.tint * 0.4);
      roofs.setColorAt(i, _colour);
    });
    body.count = records.length;
    roofs.count = records.length;
    body.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    this.group.add(body, roofs);
    this.parts.houses = body;
    this.parts.roofs = roofs;
  }

  /** Water tanks, stair huts and vents, on the flat roofs only. */
  buildRooftops(rand) {
    const flat = this.lots.filter((l) => l.mesh === 'blocks');
    const count = Math.min(420, Math.floor(flat.length * 0.55));
    const im = new THREE.InstancedMesh(cylGeo(0.5, 0.5, 1, 7), solid(0x4a4238, { roughness: 0.95 }), Math.max(count, 1));
    im.name = 'squatchbourg-rooftops';
    this.rooftopOwner = [];
    for (let i = 0; i < count; i++) {
      const l = flat[Math.floor(rand() * flat.length)] || flat[0];
      if (!l) break;
      const s = 2.4 + rand() * 4.0;
      _dummy.position.set(
        l.x + (rand() - 0.5) * l.w * 0.5,
        l.y + l.h + s * 0.5,
        l.z + (rand() - 0.5) * l.d * 0.5,
      );
      _dummy.rotation.set(0, rand() * Math.PI, 0);
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      im.setMatrixAt(i, _dummy.matrix);
      this.rooftopOwner.push({ x: l.x, z: l.z });
    }
    im.count = this.rooftopOwner.length;
    im.instanceMatrix.needsUpdate = true;
    this.group.add(im);
    this.parts.clutter = im;
  }

  /** Chimney pots on the terraces and stacks over the works. */
  buildChimneys(rand) {
    const hosts = this.lots.filter((l) => l.mesh === 'houses' || l.district === 'industry');
    const count = Math.min(520, hosts.length);
    const im = new THREE.InstancedMesh(boxGeo(1, 1, 1), solid(0x3a2e26, { roughness: 1 }), Math.max(count, 1));
    im.name = 'squatchbourg-chimneys';
    this.chimneyOwner = [];
    for (let i = 0; i < count; i++) {
      const l = hosts[Math.floor(rand() * hosts.length)];
      if (!l) break;
      const industrial = l.district === 'industry';
      const h = industrial ? 16 + rand() * 26 : 2.2 + rand() * 1.6;
      const w = industrial ? 2.2 + rand() * 1.6 : 0.8;
      _dummy.position.set(l.x + (rand() - 0.5) * l.w * 0.4, l.y + l.h + (l.roof || 0) + h / 2, l.z);
      _dummy.rotation.set(0, l.rot, 0);
      _dummy.scale.set(w, h, w);
      _dummy.updateMatrix();
      im.setMatrixAt(i, _dummy.matrix);
      this.chimneyOwner.push({ x: l.x, z: l.z });
    }
    im.count = this.chimneyOwner.length;
    im.instanceMatrix.needsUpdate = true;
    this.group.add(im);
    this.parts.chimneys = im;
  }

  /**
   * Street lighting.
   *
   * Part of the same refinement pass as the rooftops (owner: "the city looks
   * pretty funky… lets do a refinement of the city"). These were 1.6 m cubes
   * of pure unlit yellow floating 7.5 m up with nothing under them — six
   * hundred of them, and at the size and brightness they were set to, a
   * significant share of the "light all over" the city was theirs. They are
   * now a lamp head a third of the size on a real column, which is what makes
   * a street read as a street from the air: the LINES matter, the individual
   * blobs do not.
   */
  buildStreetLights(rand) {
    const cfg = this.cfg;
    const want = 620;
    const im = new THREE.InstancedMesh(boxGeo(1, 1, 1), unlit(0xffdc9a), want);
    im.name = 'squatchbourg-streetlights';
    // The columns. One extra draw call for six hundred lamp posts.
    const poles = new THREE.InstancedMesh(
      cylGeo(0.16, 0.2, 1, 5),
      new THREE.MeshStandardMaterial({ color: 0x2e3038, roughness: 0.95, metalness: 0.1 }),
      want,
    );
    poles.name = 'squatchbourg-streetlight-poles';
    this.lightPos = [];
    let placed = 0;
    for (let guard = 0; guard < want * 8 && placed < want; guard++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * cfg.radius;
      const lx = Math.cos(a) * rr;
      const lz = Math.sin(a) * rr;
      if (this.districtAt(lx, lz) === 'water') continue;
      // Snap onto the nearest street centreline so they run in lines.
      const sx = Math.round(lx / cfg.blockSize) * cfg.blockSize;
      const sz = Math.round(lz / cfg.blockSize) * cfg.blockSize;
      const onX = Math.abs(lx - sx) < Math.abs(lz - sz);
      const px = onX ? sx : lx;
      const pz = onX ? lz : sz;
      const ground = this.groundAt(px, pz);
      const h = 7.2;
      _dummy.position.set(px, ground + h, pz);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(0.95, 0.42, 0.95);
      _dummy.updateMatrix();
      im.setMatrixAt(placed, _dummy.matrix);
      _dummy.position.set(px, ground + h / 2, pz);
      _dummy.scale.set(1, h, 1);
      _dummy.updateMatrix();
      poles.setMatrixAt(placed, _dummy.matrix);
      this.lightPos.push({ x: px, z: pz });
      placed++;
    }
    im.count = placed;
    poles.count = placed;
    im.instanceMatrix.needsUpdate = true;
    poles.instanceMatrix.needsUpdate = true;
    this.group.add(im, poles);
    this.parts.lights = im;
    this.parts.lightPoles = poles;
  }

  /** The park, the avenues and the allotments out past the terraces. */
  buildTrees(rand) {
    const cfg = this.cfg;
    const want = 900;
    const im = new THREE.InstancedMesh(coneGeo(3.4, 11, 6), solid(0x243a26, { roughness: 1 }), want);
    im.name = 'squatchbourg-trees';
    this.treePos = [];
    let placed = 0;
    for (let guard = 0; guard < want * 6 && placed < want; guard++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * cfg.radius * 1.04;
      let lx = Math.cos(a) * rr;
      let lz = Math.sin(a) * rr;
      const district = this.districtAt(lx, lz);
      // Densest in the park, thin along the avenues, scattered at the edge.
      let keep = district === 'park' ? 1
        : district === 'edge' ? 0.5
          : district === 'terraces' ? 0.22 : 0.04;
      if (district === 'water' || district === 'rail') keep = 0;
      if (rand() > keep) continue;
      if (district === 'park') {
        lx += (rand() - 0.5) * 10;
        lz += (rand() - 0.5) * 10;
      }
      const s = 0.7 + rand() * 0.7;
      _dummy.position.set(lx, this.groundAt(lx, lz) + 5.2 * s, lz);
      _dummy.rotation.set(0, rand() * Math.PI, 0);
      _dummy.scale.set(s, s * (0.8 + rand() * 0.6), s);
      _dummy.updateMatrix();
      im.setMatrixAt(placed, _dummy.matrix);
      _colour.setHex(0x243a26).multiplyScalar(0.7 + rand() * 0.6);
      im.setColorAt(placed, _colour);
      this.treePos.push({ x: lx, z: lz });
      placed++;
    }
    im.count = placed;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    this.group.add(im);
    this.parts.trees = im;
  }

  /** Wagons standing in the marshalling yard, and a rake on the main line. */
  buildRailStock(rand) {
    const cfg = this.cfg;
    const ox = cfg.midRadius * 0.55;
    const oz = cfg.midRadius * 0.92;
    const ca = Math.cos(0.12);
    const sa = Math.sin(0.12);
    const cars = [];
    for (let siding = 0; siding < 8; siding++) {
      const across = -38 + siding * 11;
      let along = -440 + rand() * 60;
      while (along < 430) {
        const len = 12 + rand() * 6;
        if (rand() < 0.28) { along += len + 20 + rand() * 90; continue; }
        cars.push({ along: along + len / 2, across, len });
        along += len + 2.4;
      }
    }
    const im = new THREE.InstancedMesh(boxGeo(1, 1, 1), solid(0x4a3a2e, { roughness: 0.95 }), Math.max(cars.length, 1));
    im.name = 'squatchbourg-rolling-stock';
    this.railPos = [];
    cars.forEach((c, i) => {
      const lx = ox + c.along * ca - c.across * sa;
      const lz = oz + c.along * sa + c.across * ca;
      _dummy.position.set(lx, this.groundAt(lx, lz) + 2.6, lz);
      _dummy.rotation.set(0, -0.12, 0);
      _dummy.scale.set(c.len, 4.2, 3.2);
      _dummy.updateMatrix();
      im.setMatrixAt(i, _dummy.matrix);
      _colour.setHex(i % 4 === 0 ? 0x5a4030 : i % 4 === 1 ? 0x3a4238 : i % 4 === 2 ? 0x4a4a4e : 0x60503a);
      im.setColorAt(i, _colour);
      this.railPos.push({ x: lx, z: lz });
    });
    im.count = cars.length;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    this.group.add(im);
    this.parts.railStock = im;
  }

  /** Barges and lighters tied up along the quays. */
  buildRiverCraft(rand) {
    const cfg = this.cfg;
    const dirX = Math.cos(cfg.riverAngle);
    const dirZ = Math.sin(cfg.riverAngle);
    const nX = -Math.sin(cfg.riverAngle);
    const nZ = Math.cos(cfg.riverAngle);
    const craft = [];
    for (let i = -9; i <= 9; i++) {
      if (rand() < 0.32) continue;
      const along = i * 100 + (rand() - 0.5) * 30;
      const side = rand() < 0.5 ? -1 : 1;
      const across = cfg.riverOffset + side * (cfg.riverWidth / 2 - 8);
      craft.push({
        lx: dirX * along + nX * across,
        lz: dirZ * along + nZ * across,
        len: 24 + rand() * 22,
      });
    }
    const im = new THREE.InstancedMesh(boxGeo(1, 1, 1), solid(0x2e3238, { roughness: 0.8 }), Math.max(craft.length, 1));
    im.name = 'squatchbourg-river-craft';
    this.craftPos = [];
    craft.forEach((c, i) => {
      _dummy.position.set(c.lx, this.groundAt(c.lx, c.lz) + 11.2, c.lz);
      _dummy.rotation.set(0, -cfg.riverAngle, 0);
      _dummy.scale.set(c.len, 3.0, 7.4);
      _dummy.updateMatrix();
      im.setMatrixAt(i, _dummy.matrix);
      this.craftPos.push({ x: c.lx, z: c.lz });
    });
    im.count = craft.length;
    im.instanceMatrix.needsUpdate = true;
    this.group.add(im);
    this.parts.riverCraft = im;
  }

  /* ---------------------------------------------------------------- */
  /* Landmarks — every one of them through the PartKit                 */
  /* ---------------------------------------------------------------- */

  /** Register a named landmark and remember which kit parts belong to it. */
  _landmark(name, lx, lz, build) {
    const first = this.kit.partCount;
    const handles = [];
    const record = { name, x: lx, z: lz, handles, alive: true };
    build((h) => { handles.push(h); return h; });
    record.partsAdded = this.kit.partCount - first;
    this.landmarks.push(record);
    return record;
  }

  buildLandmarks() {
    const cfg = this.cfg;
    const kit = this.kit;
    const STONE = 0xa89a80;
    const BRICK = 0x6b4436;
    const STEEL = 0x8a8f96;
    const DARK = 0x4a4238;

    /* ---- The civic hall, on the main crossroads ---- */
    this._landmark('civic hall', cfg.blockSize * 0.5, cfg.blockSize * 0.5, (add) => {
      const x = cfg.blockSize * 0.5;
      const z = cfg.blockSize * 0.5;
      const y = this.groundAt(x, z);
      add(kit.box({ x, y: y + 15, z, w: 72, h: 30, d: 50, colour: STONE }));
      add(kit.box({ x, y: y + 32, z, w: 78, h: 4, d: 56, colour: STONE }));
      for (const sx of [-30, -18, -6, 6, 18, 30]) {
        add(kit.cyl({ x: x + sx, y: y + 15, z: z + 26, r: 1.6, h: 30, colour: STONE }));
      }
      add(kit.cyl({ x, y: y + 38, z, r: 15, h: 10, colour: STONE }));
      add(kit.sphere({ x, y: y + 43, z, r: 15, ry: 13, colour: 0x3f6a5a }));
      add(kit.cone({ x, y: y + 58, z, r: 2.6, h: 11, colour: STEEL, finish: 'metal' }));
      add(kit.sphere({ x, y: y + 65, z, r: 1.6, ry: 1.6, colour: 0xffd27a, finish: 'glow' }));
    });

    /* ---- The cathedral: twin spires, and the thing that reads first ---- */
    this._landmark('cathedral', -cfg.blockSize * 2.4, -cfg.blockSize * 1.2, (add) => {
      const x = -cfg.blockSize * 2.4;
      const z = -cfg.blockSize * 1.2;
      const y = this.groundAt(x, z);
      add(kit.box({ x, y: y + 14, z, w: 34, h: 28, d: 92, colour: STONE }));
      add(kit.box({ x, y: y + 16, z: z + 12, w: 76, h: 22, d: 26, colour: STONE }));
      add(kit.box({ x, y: y + 30, z, w: 26, h: 6, d: 88, colour: 0x4a5a52 }));
      for (const sx of [-19, 19]) {
        add(kit.box({ x: x + sx, y: y + 30, z: z - 34, w: 15, h: 60, d: 15, colour: STONE }));
        add(kit.cone({ x: x + sx, y: y + 76, z: z - 34, r: 9, h: 34, colour: 0x4a5a52 }));
        add(kit.sphere({ x: x + sx, y: y + 94, z: z - 34, r: 1.4, ry: 1.4, colour: 0xff6a4a, finish: 'glow' }));
      }
      add(kit.cyl({ x, y: y + 34, z: z - 34, r: 8, h: 2, rx: Math.PI / 2, colour: 0x2a3038 }));
    });

    /* ---- The stadium ---- */
    this._landmark('stadium', cfg.midRadius * 0.72, -cfg.midRadius * 0.5, (add) => {
      const x = cfg.midRadius * 0.72;
      const z = -cfg.midRadius * 0.5;
      const y = this.groundAt(x, z);
      add(kit.cyl({ x, y: y + 13, z, r: [98, 78], h: 26, colour: 0x6e6a5e }));
      add(kit.cyl({ x, y: y + 15, z, r: [82, 62], h: 26, colour: 0x243a26 }));
      add(kit.cyl({ x, y: y + 2, z, r: [76, 56], h: 3, colour: 0x2c4a2c }));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(kit.box({
          x: x + Math.cos(a) * 100, y: y + 30, z: z + Math.sin(a) * 80,
          w: 3, h: 60, d: 3, colour: STEEL, finish: 'metal',
        }));
        add(kit.sphere({
          x: x + Math.cos(a) * 100, y: y + 62, z: z + Math.sin(a) * 80,
          r: 4, ry: 2.4, colour: 0xfff0c0, finish: 'glow',
        }));
      }
    });

    /* ---- The gasworks: three holders and their guide frames ---- */
    for (let i = 0; i < 3; i++) {
      const a = cfg.industryAngle + (i - 1) * 0.14;
      const r = cfg.midRadius * 1.05;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      this._landmark(`gasholder ${i + 1}`, x, z, (add) => {
        const y = this.groundAt(x, z);
        add(kit.cyl({ x, y: y + 22, z, r: 34, h: 44, colour: 0x4a5450, finish: 'metal' }));
        add(kit.cyl({ x, y: y + 45, z, r: 34.5, h: 2, colour: 0x2e3634, finish: 'metal' }));
        for (let k = 0; k < 10; k++) {
          const ka = (k / 10) * Math.PI * 2;
          add(kit.box({
            x: x + Math.cos(ka) * 37, y: y + 26, z: z + Math.sin(ka) * 37,
            w: 1.6, h: 52, d: 1.6, colour: STEEL, finish: 'metal',
          }));
        }
      });
    }

    /* ---- The refinery, with its flare ---- */
    this._landmark('refinery', Math.cos(cfg.industryAngle - 0.34) * cfg.midRadius * 1.4,
      Math.sin(cfg.industryAngle - 0.34) * cfg.midRadius * 1.4, (add) => {
        const x = Math.cos(cfg.industryAngle - 0.34) * cfg.midRadius * 1.4;
        const z = Math.sin(cfg.industryAngle - 0.34) * cfg.midRadius * 1.4;
        const y = this.groundAt(x, z);
        for (let i = 0; i < 5; i++) {
          const ox = (i - 2) * 22;
          add(kit.cyl({ x: x + ox, y: y + 26 + i % 2 * 10, z, r: 6 - i % 3, h: 52 + (i % 2) * 20, colour: 0x9aa0a6, finish: 'metal' }));
        }
        for (const oz of [-30, 30]) {
          add(kit.cyl({ x, y: y + 9, z: z + oz, r: 22, h: 18, colour: 0x7a8078, finish: 'metal' }));
          add(kit.cyl({ x, y: y + 18.4, z: z + oz, r: 22, h: 1.4, colour: 0x5a605a, finish: 'metal' }));
        }
        // The flare stack, alight, which is what makes an aerial view of a
        // refinery legible at night.
        add(kit.cyl({ x: x + 70, y: y + 44, z, r: 3, h: 88, colour: 0x6a6f74, finish: 'metal' }));
        add(kit.cone({ x: x + 70, y: y + 96, z, r: 5, h: 18, colour: 0xff8a2a, finish: 'glow' }));
      });

    /* ---- The power station ---- */
    this._landmark('power station', Math.cos(cfg.industryAngle + 0.42) * cfg.midRadius * 1.35,
      Math.sin(cfg.industryAngle + 0.42) * cfg.midRadius * 1.35, (add) => {
        const x = Math.cos(cfg.industryAngle + 0.42) * cfg.midRadius * 1.35;
        const z = Math.sin(cfg.industryAngle + 0.42) * cfg.midRadius * 1.35;
        const y = this.groundAt(x, z);
        add(kit.box({ x, y: y + 16, z, w: 120, h: 32, d: 52, colour: DARK }));
        for (const [ox, oz] of [[-46, 60], [26, 66]]) {
          // A cooling tower is a hyperboloid; two stacked cones read as one
          // from three thousand feet and cost sixteen triangles.
          add(kit.cone({ x: x + ox, y: y + 22, z: z + oz, r: 36, h: 44, colour: 0x8a8a84 }));
          add(kit.cone({ x: x + ox, y: y + 62, z: z + oz, r: 25, h: 36, rx: Math.PI, colour: 0x8a8a84 }));
        }
        for (const ox of [-30, 0, 30]) {
          add(kit.cyl({ x: x + ox, y: y + 60, z: z - 22, r: 4.6, h: 120, colour: BRICK }));
          add(kit.sphere({ x: x + ox, y: y + 121, z: z - 22, r: 1.4, ry: 1.4, colour: 0xff3a24, finish: 'glow' }));
        }
      });

    /* ---- The brick stacks over the old works ---- */
    for (let i = 0; i < 4; i++) {
      const a = cfg.industryAngle + (i - 1.5) * 0.3;
      const r = cfg.midRadius * (0.72 + (i % 2) * 0.12);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      this._landmark(`works stack ${i + 1}`, x, z, (add) => {
        const y = this.groundAt(x, z);
        add(kit.cyl({ x, y: y + 46, z, r: [5.6, 5.6], h: 92, colour: BRICK }));
        add(kit.cyl({ x, y: y + 92, z, r: 6.6, h: 3, colour: 0x4a2e26 }));
        add(kit.box({ x: x + 28, y: y + 9, z: z + 10, w: 74, h: 18, d: 48, colour: 0x5a5248 }));
      });
    }

    /* ---- Grain elevator and silos ---- */
    this._landmark('grain elevator', cfg.midRadius * 0.9, cfg.midRadius * 1.15, (add) => {
      const x = cfg.midRadius * 0.9;
      const z = cfg.midRadius * 1.15;
      const y = this.groundAt(x, z);
      for (let i = 0; i < 7; i++) {
        add(kit.cyl({ x: x + (i - 3) * 19, y: y + 27, z, r: 9.2, h: 54, colour: 0xb0a894 }));
      }
      add(kit.box({ x, y: y + 60, z, w: 138, h: 14, d: 22, colour: 0x9a9280 }));
      add(kit.box({ x: x + 60, y: y + 44, z, w: 20, h: 88, d: 24, colour: 0x9a9280 }));
    });

    /* ---- The station and its train shed ---- */
    this._landmark('station', cfg.blockSize * 2.2, cfg.midRadius * 0.62, (add) => {
      const x = cfg.blockSize * 2.2;
      const z = cfg.midRadius * 0.62;
      const y = this.groundAt(x, z);
      add(kit.box({ x, y: y + 12, z: z - 24, w: 120, h: 24, d: 26, colour: STONE }));
      add(kit.box({ x: x - 46, y: y + 24, z: z - 24, w: 18, h: 48, d: 18, colour: STONE }));
      add(kit.sphere({ x: x - 46, y: y + 50, z: z - 24, r: 5, ry: 5, colour: 0xffe6b0, finish: 'glow' }));
      add(kit.cyl({ x, y: y + 16, z: z + 14, r: [56, 26], h: 132, rz: Math.PI / 2, colour: 0x5a6068, finish: 'metal' }));
    });

    /* ---- The docks: quay cranes and the transit sheds ---- */
    const dirX = Math.cos(cfg.riverAngle);
    const dirZ = Math.sin(cfg.riverAngle);
    const nX = -Math.sin(cfg.riverAngle);
    const nZ = Math.cos(cfg.riverAngle);
    for (let i = 0; i < 6; i++) {
      const along = -320 + i * 128;
      const across = cfg.riverOffset + (i % 2 ? 1 : -1) * (cfg.riverWidth / 2 + 26);
      const x = dirX * along + nX * across;
      const z = dirZ * along + nZ * across;
      this._landmark(`quay crane ${i + 1}`, x, z, (add) => {
        const y = this.groundAt(x, z);
        for (const s of [-1, 1]) {
          add(kit.box({
            x: x + dirX * s * 9, y: y + 17, z: z + dirZ * s * 9,
            w: 2.4, h: 34, d: 2.4, ry: cfg.riverAngle, colour: 0xb0602a, finish: 'metal',
          }));
        }
        add(kit.box({ x, y: y + 36, z, w: 22, h: 5, d: 5, ry: cfg.riverAngle, colour: 0xb0602a, finish: 'metal' }));
        add(kit.box({
          x: x - nX * 22, y: y + 40, z: z - nZ * 22,
          w: 4, h: 4, d: 62, ry: cfg.riverAngle, colour: 0xb0602a, finish: 'metal',
        }));
        add(kit.box({
          x: x + nX * 8, y: y + 30, z: z + nZ * 8,
          w: 8, h: 8, d: 10, ry: cfg.riverAngle, colour: 0x30343a, finish: 'metal',
        }));
      });
    }

    /* ---- Three crossings ---- */
    for (let i = 0; i < 3; i++) {
      const along = (i - 1) * 300;
      const x = dirX * along + nX * cfg.riverOffset;
      const z = dirZ * along + nZ * cfg.riverOffset;
      this._landmark(`bridge ${i + 1}`, x, z, (add) => {
        const y = this.groundAt(x, z);
        add(kit.box({
          x, y: y + 12, z, w: 18, h: 2.6, d: cfg.riverWidth + 90,
          ry: cfg.riverAngle + Math.PI / 2, colour: STONE,
        }));
        for (const s of [-1, 1]) {
          add(kit.box({
            x: x + nX * s * (cfg.riverWidth / 2 + 6), y: y + 5, z: z + nZ * s * (cfg.riverWidth / 2 + 6),
            w: 16, h: 14, d: 8, ry: cfg.riverAngle + Math.PI / 2, colour: STONE,
          }));
        }
        if (i === 1) {
          // The one with a truss, so all three are not the same bridge.
          for (const s of [-1, 1]) {
            add(kit.box({
              x: x + dirX * s * 9, y: y + 24, z: z + dirZ * s * 9,
              w: 1.2, h: 22, d: cfg.riverWidth + 20,
              ry: cfg.riverAngle + Math.PI / 2, colour: STEEL, finish: 'metal',
            }));
          }
          add(kit.box({
            x, y: y + 35, z, w: 19, h: 1.2, d: cfg.riverWidth + 20,
            ry: cfg.riverAngle + Math.PI / 2, colour: STEEL, finish: 'metal',
          }));
        }
      });
    }

    /* ---- The radio mast, with its red lamp — the thing the bombardier calls ---- */
    this._landmark('radio mast', -cfg.blockSize * 1.5, -cfg.blockSize * 3.5, (add) => {
      const x = -cfg.blockSize * 1.5;
      const z = -cfg.blockSize * 3.5;
      const y = this.groundAt(x, z);
      add(kit.cyl({ x, y: y + 62, z, r: 1.6, h: 124, colour: STEEL, finish: 'metal' }));
      for (const ly of [32, 64, 96]) {
        add(kit.box({ x, y: y + ly, z, w: 13, h: 0.8, d: 0.8, colour: STEEL, finish: 'metal' }));
        add(kit.box({ x, y: y + ly, z, w: 0.8, h: 0.8, d: 13, colour: STEEL, finish: 'metal' }));
      }
      add(kit.sphere({ x, y: y + 126, z, r: 2.2, ry: 2.2, colour: 0xff3a24, finish: 'glow' }));
    });

    /* ---- The water tower, and a clock tower to give the terraces a middle ---- */
    this._landmark('water tower', -cfg.midRadius * 0.9, cfg.midRadius * 0.35, (add) => {
      const x = -cfg.midRadius * 0.9;
      const z = cfg.midRadius * 0.35;
      const y = this.groundAt(x, z);
      for (const [ox, oz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
        add(kit.box({ x: x + ox, y: y + 15, z: z + oz, w: 1.4, h: 30, d: 1.4, colour: STEEL, finish: 'metal' }));
      }
      add(kit.cyl({ x, y: y + 37, z, r: 11, h: 16, colour: 0x7a6a52, finish: 'metal' }));
      add(kit.cone({ x, y: y + 48, z, r: 11.5, h: 7, colour: 0x5a4c3a }));
    });

    this._landmark('clock tower', cfg.midRadius * 0.2, -cfg.midRadius * 0.9, (add) => {
      const x = cfg.midRadius * 0.2;
      const z = -cfg.midRadius * 0.9;
      const y = this.groundAt(x, z);
      add(kit.box({ x, y: y + 26, z, w: 13, h: 52, d: 13, colour: BRICK }));
      add(kit.box({ x, y: y + 54, z, w: 16, h: 5, d: 16, colour: STONE }));
      add(kit.cone({ x, y: y + 62, z, r: 8, h: 14, colour: 0x3f5a4e }));
      for (const [ox, oz] of [[6.9, 0], [-6.9, 0], [0, 6.9], [0, -6.9]]) {
        add(kit.sphere({ x: x + ox, y: y + 44, z: z + oz, r: 3.4, ry: 3.4, colour: 0xffeec0, finish: 'glow' }));
      }
    });

  }

  /**
   * A rough count of the built city, for the verifier and for anyone deciding
   * whether the frame cost is where it should be.
   */
  stats() {
    const instanced = [];
    this.group.traverse((o) => { if (o.isInstancedMesh) instanced.push(o); });
    const plain = [];
    this.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) plain.push(o); });
    let triangles = 0;
    for (const im of instanced) {
      const idx = im.geometry.index;
      const tris = idx ? idx.count / 3 : im.geometry.attributes.position.count / 3;
      triangles += tris * im.count;
    }
    for (const m of plain) {
      const idx = m.geometry.index;
      triangles += idx ? idx.count / 3 : m.geometry.attributes.position.count / 3;
    }
    return {
      buildings: this.lots.length,
      blocks: this.parts.buildings?.count ?? 0,
      houses: this.parts.houses?.count ?? 0,
      rooftops: this.parts.clutter?.count ?? 0,
      chimneys: this.parts.chimneys?.count ?? 0,
      streetLights: this.parts.lights?.count ?? 0,
      trees: this.parts.trees?.count ?? 0,
      railStock: this.parts.railStock?.count ?? 0,
      riverCraft: this.parts.riverCraft?.count ?? 0,
      landmarks: this.landmarks.length,
      landmarkParts: this.kit.partCount,
      kitDrawCalls: this.kit.drawCalls,
      instancedMeshes: instanced.length,
      plainMeshes: plain.length,
      drawCallsApprox: instanced.length + plain.length,
      trianglesApprox: Math.round(triangles),
    };
  }

  /* ---------------------------------------------------------------- */
  /* The end of it                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Take the middle of the city away and put the crater there — and arm the
   * queue the shock front works through afterwards.
   *
   * The split matters. Everything inside the fireball genuinely does go at
   * once, and that is what this does immediately: buildings scaled to nothing,
   * lights out, landmarks gone, the street plate and the river hidden, the hole
   * built. Everything OUTSIDE it is left standing and pushed onto `_queue`,
   * sorted by how far it is from ground zero, so `advanceShock()` can knock it
   * down in the order the blast wave actually reaches it. That ring is the
   * whole reason the city is wider than the crater.
   *
   * @param {THREE.Vector3} point world-space impact point
   * @returns {object} the crater record (also stored on `this.crater`)
   */
  destroy(point) {
    if (this.destroyed) return this.crater;
    this.destroyed = true;
    /* Photograph the standing city before anything happens to it. Deferred to
     * here rather than done in `build()` so a page that never drops the bomb
     * never pays the ~600 kB: nothing touches these buffers between the build
     * and this line, so the copy taken now IS the pristine city. */
    this._takePristine();

    const cfg = CRATER;
    const cx = point.x;
    const cz = point.z;
    const vaporised = cfg.radius * 0.98;
    const queue = this._queue;

    /* ---- Buildings ---- */
    for (const l of this.lots) {
      const d = Math.hypot(this.x + l.x - cx, this.z + l.z - cz);
      if (d < vaporised) {
        this._vaporiseLot(l);
      } else {
        queue.push({ d, kind: 'lot', lot: l });
      }
    }

    /* ---- Everything smaller ---- */
    const sweep = (list, mesh, kind) => {
      if (!list || !mesh) return;
      for (let i = 0; i < mesh.count; i++) {
        const o = list[i];
        if (!o) continue;
        const d = Math.hypot(this.x + o.x - cx, this.z + o.z - cz);
        if (d < vaporised) this._hideInstance(mesh, i);
        else queue.push({ d, kind, mesh, index: i });
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    sweep(this.rooftopOwner, this.parts.clutter, 'instance');
    sweep(this.chimneyOwner, this.parts.chimneys, 'instance');
    // Lamp heads and their columns share `lightPos`, so they go together —
    // a street of poles standing under lamps that are no longer there would
    // be a strange thing to leave behind.
    sweep(this.lightPos, this.parts.lights, 'instance');
    sweep(this.lightPos, this.parts.lightPoles, 'instance');
    sweep(this.treePos, this.parts.trees, 'instance');
    sweep(this.railPos, this.parts.railStock, 'instance');
    sweep(this.craftPos, this.parts.riverCraft, 'instance');

    /* ---- Landmarks: kit parts, by landmark, so one goes at a time ---- */
    for (const lm of this.landmarks) {
      const d = Math.hypot(this.x + lm.x - cx, this.z + lm.z - cz);
      if (d < vaporised) {
        this._removeLandmark(lm);
      } else {
        queue.push({ d, kind: 'landmark', landmark: lm });
      }
    }

    this.parts.buildings.instanceMatrix.needsUpdate = true;
    if (this.parts.buildings.instanceColor) this.parts.buildings.instanceColor.needsUpdate = true;
    this.parts.houses.instanceMatrix.needsUpdate = true;
    this.parts.roofs.instanceMatrix.needsUpdate = true;
    /* The lit windows are out — the town has no power and no windows. Off the
     * stored WALL material rather than off `parts.buildings.material`, which
     * is an array of six face slots now (see `buildBlocks()`); writing
     * `emissiveIntensity` onto an array quietly does nothing. */
    this.parts.buildingWallMat.emissiveIntensity = DEAD_WINDOW_GLOW;
    /* The ground plate and the river go with the middle: both run right across
     * ground zero, and leaving them drawn puts a street map and a flat blue
     * ribbon lying across the floor of a hundred-metre hole. */
    this.parts.streets.visible = false;
    this.parts.river.visible = false;

    queue.sort((a, b) => a.d - b.d);
    this._queueAt = 0;
    this.shockRadius = 0;

    this.crater = this.buildCraterMesh(cx, cz, this.groundY);
    return this.crater;
  }

  /**
   * The blast wave has reached `radius`. Knock over everything it just passed.
   *
   * Called every frame by `../vfx/Detonation.js` through its `onShockFront`
   * hook. The queue is sorted by distance and a pointer walks it, so the total
   * cost across the whole event is one pass over the city, no matter how many
   * frames it takes.
   *
   * @param {number} radius metres from ground zero
   * @returns {number} how many things went down this call
   */
  advanceShock(radius) {
    if (!this.destroyed || radius <= this.shockRadius) return 0;
    this.shockRadius = radius;
    const q = this._queue;
    let touched = 0;
    const dirty = new Set();
    while (this._queueAt < q.length && q[this._queueAt].d <= radius) {
      const item = q[this._queueAt++];
      if (item.kind === 'lot') {
        this._flattenLot(item.lot, item.d);
        dirty.add(item.lot.mesh === 'blocks' ? this.parts.buildings : this.parts.houses);
        if (item.lot.mesh === 'houses') dirty.add(this.parts.roofs);
      } else if (item.kind === 'instance') {
        this._hideInstance(item.mesh, item.index);
        dirty.add(item.mesh);
      } else if (item.kind === 'landmark') {
        this._removeLandmark(item.landmark);
      }
      touched++;
    }
    for (const m of dirty) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.flattened += touched;
    return touched;
  }

  /** True once the front has been past everything there was. */
  get shockComplete() { return this._queueAt >= this._queue.length; }

  /* ---------------------------------------------------------------- */
  /* Putting it back                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Copy every restorable instance buffer, once.
   *
   * Called from `destroy()`, which is the last moment the city is still whole.
   * Idempotent: a second raid after a restore re-uses the FIRST photograph
   * rather than photographing the city it is about to flatten again — which
   * matters, because a restore is not required to have happened in between.
   */
  _takePristine() {
    if (this._pristine) return this._pristine;
    this._pristine = [];
    for (const key of RESTORABLE) {
      const mesh = this.parts[key];
      if (!mesh?.isInstancedMesh) continue;
      this._pristine.push({
        mesh,
        count: mesh.count,
        matrix: mesh.instanceMatrix.array.slice(),
        colour: mesh.instanceColor ? mesh.instanceColor.array.slice() : null,
      });
    }
    return this._pristine;
  }

  /**
   * Rebuild Squatchbourg exactly as it was before the Fat Squatch arrived.
   *
   * THE UNWINNABLE RESTART, second half — owner, 2026-08-06: "The enola restart
   * from latest checkpoint bug still happens where everything is already blown
   * up and I cant redrop the bomb."
   *
   * `MissionController.rearmPayload()` fixed the bomb in an earlier pass and
   * its comment then claimed the flattened target was fine, because "you get to
   * drop it again on what is left". It is not fine: restarting a bombing run
   * over a hole with no city in it is not the mission, and the owner said so.
   * There was no way back at all — `destroy()` set `destroyed = true` and
   * NOTHING anywhere ever set it false again, so every restart after a drop was
   * a run at an empty crater.
   *
   * What comes back, and it is everything `destroy()` and `advanceShock()` did:
   *   every building, house and pitched roof — position, scale, rotation AND
   *     colour, so nothing is left flattened, tipped over or scorched;
   *   the rooftop clutter, the chimneys, the lamp heads and their columns, the
   *     trees, the rolling stock and the river craft;
   *   every landmark, through `PartKit.show()`;
   *   the lit windows (`WINDOW_GLOW`), the street plate and the river;
   *   the crater mesh and its cooling glow, removed from the scene and freed.
   *
   * What this canNOT put back, because it does not own it: the hole in the
   * MISSION's own ground-height function and the sunken vertices in the coarse
   * east ground mesh. Both live in `../main.js` — see `mission.onCrater`, which
   * is now called with `null` to undo exactly those two things. A city restored
   * without that would stand in mid-air over a hundred-metre pit.
   *
   * @returns {boolean} whether there was anything to put back
   */
  restore() {
    if (!this.destroyed) return false;

    /* ---- Every instanced thing, back to its build-time matrix ---- */
    for (const snap of this._pristine || []) {
      snap.mesh.instanceMatrix.array.set(snap.matrix);
      snap.mesh.instanceMatrix.needsUpdate = true;
      if (snap.colour && snap.mesh.instanceColor) {
        snap.mesh.instanceColor.array.set(snap.colour);
        snap.mesh.instanceColor.needsUpdate = true;
      }
      snap.mesh.count = snap.count;
    }

    /* ---- The bookkeeping the flattening wrote onto the lot records ---- */
    for (const l of this.lots) l.gone = false;

    /* ---- The landmarks ---- */
    for (const lm of this.landmarks) {
      if (lm.alive) continue;
      lm.alive = true;
      for (const h of lm.handles) this.kit.show(h);
    }

    /* ---- The lights, the streets and the water ---- */
    this.parts.buildingWallMat.emissiveIntensity = WINDOW_GLOW;
    this.parts.streets.visible = true;
    this.parts.river.visible = true;

    /* ---- And the hole ---- */
    this.removeCrater();

    this._queue.length = 0;
    this._queueAt = 0;
    this.shockRadius = 0;
    this.flattened = 0;
    this.destroyed = false;
    return true;
  }

  /**
   * Take the crater mesh and its cooling glow off the scene and free them.
   *
   * Both are built per-detonation with their own geometry and their own
   * material (see `buildCraterMesh()`), so unlike the rest of the city they are
   * genuinely this object's to dispose — nothing else shares them.
   */
  removeCrater() {
    const cr = this.crater;
    if (!cr) return false;
    this.crater = null;
    for (const m of [cr.mesh, cr.glow]) {
      if (!m) continue;
      this.scene.remove(m);
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    }
    return true;
  }

  _hideInstance(mesh, i) {
    _dummy.position.set(0, -400, 0);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(0.0001, 0.0001, 0.0001);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  }

  _vaporiseLot(l) {
    const target = l.mesh === 'blocks' ? this.parts.buildings : this.parts.houses;
    this._hideInstance(target, l.index);
    if (l.mesh === 'houses') this._hideInstance(this.parts.roofs, l.index);
    l.gone = true;
  }

  /** Knocked to a fifth of its height, blackened, tipped over. */
  _flattenLot(l, d) {
    if (l.gone) return;
    l.gone = true;
    const outer = CRATER.radius + CRATER.rimWidth;
    const k = clamp(1 - (d - CRATER.radius) / (outer * 2.1), 0, 1);
    const h = l.h * lerp(1, 0.16, k);
    const target = l.mesh === 'blocks' ? this.parts.buildings : this.parts.houses;
    _dummy.position.set(l.x, l.y + h / 2 + craterOffset(d, CRATER), l.z);
    _dummy.rotation.set((Math.random() - 0.5) * k * 0.9, l.rot, (Math.random() - 0.5) * k * 0.9);
    _dummy.scale.set(l.w * lerp(1, 1.3, k), h, l.d * lerp(1, 1.3, k));
    _dummy.updateMatrix();
    target.setMatrixAt(l.index, _dummy.matrix);
    _colour.setHex(l.warm ? 0x8a7a62 : 0x6e7280).multiplyScalar(l.tint).lerp(_scorched, k);
    target.setColorAt(l.index, _colour);
    // The roof is off long before the walls come down.
    if (l.mesh === 'houses') this._hideInstance(this.parts.roofs, l.index);
  }

  _removeLandmark(lm) {
    if (!lm.alive) return;
    lm.alive = false;
    for (const h of lm.handles) this.kit.hide(h);
  }

  /**
   * The crater itself: a ring of concentric bands displaced by
   * `craterOffset()`, vertex-coloured from a burnt black floor out through
   * fused glassy grey to the thrown-up earth of the lip.
   *
   * `RingGeometry(inner, outer, thetaSegments, phiSegments)` gives concentric
   * rings rather than a triangle fan, which is exactly what a bowl needs —
   * `CircleGeometry` would have one vertex in the middle and no radial
   * subdivision at all, so the bowl would be a cone.
   */
  buildCraterMesh(cx, cz, groundY) {
    const cfg = CRATER;
    const outer = cfg.radius + cfg.rimWidth;
    const geo = new THREE.RingGeometry(0.5, outer, 96, 44);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colours = new Float32Array(pos.count * 3);
    const floor = new THREE.Color(0x14100e);
    const fused = new THREE.Color(0x3a3230);
    const earth = new THREE.Color(0x6b5540);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const d = Math.hypot(vx, vz);
      // The rim is not a smooth ring; earth does not land evenly.
      const rough = (fbm(vx / 90, vz / 90, 3) - 0.5) * (d > cfg.radius * 0.7 ? 26 : 9);
      pos.setY(i, craterOffset(d, cfg) + rough);
      const t = clamp(d / cfg.radius, 0, 1);
      c.copy(floor).lerp(fused, smoothstep(0.15, 0.75, t)).lerp(earth, smoothstep(0.8, 1.15, d / cfg.radius));
      colours[i * 3] = c.r; colours[i * 3 + 1] = c.g; colours[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.computeVertexNormals();

    const craterMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.98, metalness: 0,
    }));
    craterMesh.name = 'squatchbourg-crater';
    craterMesh.position.set(cx, groundY, cz);
    craterMesh.receiveShadow = true;
    this.scene.add(craterMesh);

    /* The floor is still white-hot for a while. A separate unlit disc that
     * fades out over half a minute — much cheaper than making the crater
     * material emissive and animating a uniform, and it can simply be removed
     * when it is done. */
    const glowGeo = new THREE.RingGeometry(0.5, cfg.radius * 0.92, 64, 20);
    glowGeo.rotateX(-Math.PI / 2);
    const gpos = glowGeo.attributes.position;
    for (let i = 0; i < gpos.count; i++) {
      const d = Math.hypot(gpos.getX(i), gpos.getZ(i));
      gpos.setY(i, craterOffset(d, cfg) + 1.5);
    }
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
      color: 0xff6a24, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    }));
    glow.position.set(cx, groundY, cz);
    this.scene.add(glow);

    return {
      x: cx, z: cz, groundY, mesh: craterMesh, glow, t: 0,
      radius: cfg.radius, depth: cfg.depth,
    };
  }

  /** Cool the crater floor down. Called every frame once it exists. */
  update(dt) {
    const cr = this.crater;
    if (!cr || !cr.glow) return;
    cr.t += dt;
    const k = clamp(1 - cr.t / 44, 0, 1);
    cr.glow.material.opacity = k * k * 0.9;
    cr.glow.material.color.setHex(k > 0.5 ? 0xff8a3a : 0xc4321a);
    if (cr.t > 44) {
      this.scene.remove(cr.glow);
      cr.glow.material.dispose();
      cr.glow.geometry.dispose();
      cr.glow = null;
    }
  }
}
