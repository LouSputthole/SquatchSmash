/**
 * Squatchbourg — the small city the Fat Squatch is addressed to, and the hole
 * that is left where it used to be.
 *
 * The owner's brief for both halves, verbatim: "I want a good target we need a
 * small city. It doesn't have to be super detailed as we are only going to see
 * it from the air, but I want it to be more extensive", and "I want a giant
 * crater where the city used to be."
 *
 * ---------------------------------------------------------------------------
 * DRAW-CALL BUDGET (the reason this file looks the way it does)
 *
 * This is a browser game and the city is only ever seen from a few thousand
 * feet, so the whole place is five instanced meshes and a handful of one-off
 * landmarks:
 *
 *   1  street grid          one plane, one canvas texture
 *   1  river                one plane
 *   1  buildings            ~780 instances, BoxGeometry(1,1,1) scaled per
 *                           instance, one shared night-window texture, colour
 *                           varied through `setColorAt`
 *   1  rooftop clutter      ~200 instances (tanks, stair huts, vents)
 *   1  street lights        ~300 instances of one small unlit box
 *   ~9 landmarks            the civic dome, two stacks, the mast, the bridge,
 *                           the two grain silos — individually placed because
 *                           they are what makes an aerial view legible as a
 *                           PLACE rather than as noise
 *
 * That is roughly 15 draw calls and about 22,000 triangles for the entire
 * target — less than the airfield the mission takes off from. Nothing here
 * streams, because the city is a single 1.1 km disc that is either in front of
 * the aeroplane or behind it.
 *
 * Every building is remembered in `this.lots` (position, footprint, height)
 * so the detonation can rewrite instance matrices rather than rebuild
 * anything: inside the fireball they are scaled to nothing, in the ring beyond
 * it they are knocked flat and scorched.
 * ---------------------------------------------------------------------------
 */
import * as THREE from 'three';
import {
  mat, solid, unlit, boxGeo, cylGeo, coneGeo, mesh, flatMesh, group,
  clamp, lerp, smoothstep, fbm, rng,
} from '../../beefrun/util.js';
import { TARGET_CITY, CRATER } from '../config.js';

/* ------------------------------------------------------------------ */
/* Textures                                                            */
/* ------------------------------------------------------------------ */

/**
 * One wall texture for every building in the city: a grid of windows, most of
 * them dark, a scattering lit. Buildings are scaled boxes so the grid stretches
 * per instance, which at three thousand feet reads as "different buildings have
 * different window spacing" rather than as a mistake.
 *
 * Returned as a pair — the colour map and a matching emissive map with ONLY
 * the lit windows on it — so the lit ones actually glow at night instead of
 * being pale grey squares.
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
  // Concrete mottling.
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
      const lit = rand() < 0.24;
      c.fillStyle = lit ? '#ffd894' : '#20222c';
      c.fillRect(x, y, w, h);
      if (lit) {
        e.fillStyle = rand() < 0.3 ? '#ffe6b0' : '#ffc86a';
        e.fillRect(x, y, w, h);
      }
    }
    // Floor bands.
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

/** The street grid, painted once into one big canvas. */
function streetTexture(seed) {
  const rand = rng(seed);
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2e2b26';
  ctx.fillRect(0, 0, S, S);
  // Blocks: slightly lighter ground between the roads, so the grid reads even
  // where no building stands.
  const cells = 16;
  const step = S / cells;
  ctx.fillStyle = '#3a352d';
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      ctx.fillRect(i * step + 5, j * step + 5, step - 10, step - 10);
    }
  }
  // Roads.
  ctx.strokeStyle = '#191817';
  ctx.lineWidth = 9;
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(S, i * step); ctx.stroke();
  }
  // Two avenues, wider and lit.
  ctx.strokeStyle = '#232120';
  ctx.lineWidth = 20;
  ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
  // Centre lines.
  ctx.strokeStyle = 'rgba(216,200,140,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 14]);
  ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
  ctx.setLineDash([]);
  // Dirt and yards.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(90,74,52,${0.1 + rand() * 0.2})`;
    ctx.fillRect(rand() * S, rand() * S, 8 + rand() * 26, 8 + rand() * 26);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
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
    this.destroyed = false;
    this.crater = null;

    this.build();
  }

  build() {
    const cfg = this.cfg;
    const rand = rng(cfg.seed);
    const y = this.groundY;

    /* ---- Ground plate and the street grid ---- */
    const plateGeo = new THREE.PlaneGeometry(cfg.radius * 2.1, cfg.radius * 2.1);
    plateGeo.rotateX(-Math.PI / 2);
    const streets = new THREE.Mesh(plateGeo, mat({
      map: streetTexture(cfg.seed ^ 0x77), roughness: 0.95, unique: true,
    }));
    streets.position.y = y + 0.35;
    streets.receiveShadow = false;
    this.group.add(streets);
    this.parts = { streets };

    /* ---- The river, cutting the north-east corner off ---- */
    const riverGeo = new THREE.PlaneGeometry(cfg.radius * 2.4, 78);
    riverGeo.rotateX(-Math.PI / 2);
    const river = new THREE.Mesh(riverGeo, mat({
      color: 0x1b2634, roughness: 0.16, metalness: 0.3, unique: true,
    }));
    river.position.set(0, y + 0.5, -cfg.radius * 0.52);
    river.rotation.y = 0.22;
    this.group.add(river);
    this.parts.river = river;

    /* ---- Buildings, one InstancedMesh for the lot ---- */
    const { map, emissive } = windowTextures(cfg.seed);
    const buildingMat = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: emissive,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      roughness: 0.92,
      metalness: 0.02,
    });
    // A box's UVs are 0..1 per face, so repeat has to be modest or a 90 m
    // tower ends up with windows the size of doors.
    map.repeat.set(2.2, 3.4);
    emissive.repeat.set(2.2, 3.4);

    const half = Math.ceil(cfg.radius / cfg.blockSize);
    const lots = this.lots;
    for (let bi = -half; bi <= half; bi++) {
      for (let bj = -half; bj <= half; bj++) {
        const bx = bi * cfg.blockSize;
        const bz = bj * cfg.blockSize;
        const r = Math.hypot(bx, bz);
        if (r > cfg.radius) continue;
        // The river's channel takes a strip out of the grid.
        if (Math.abs(bz + cfg.radius * 0.52 + bx * 0.22) < 52) continue;

        const inner = cfg.blockSize - cfg.streetWidth;
        // Downtown blocks are cut into fewer, bigger lots; the outskirts into
        // more, smaller ones, which is the difference a player actually sees.
        const div = r < cfg.downtownRadius ? 1 + (rand() < 0.45 ? 1 : 0)
          : r < cfg.midRadius ? 2 : 2 + (rand() < 0.5 ? 1 : 0);
        const lot = inner / div;
        for (let li = 0; li < div; li++) {
          for (let lj = 0; lj < div; lj++) {
            if (rand() < (r > cfg.midRadius ? 0.34 : 0.12)) continue;   // vacant
            const px = bx - inner / 2 + lot * (li + 0.5);
            const pz = bz - inner / 2 + lot * (lj + 0.5);
            const pr = Math.hypot(px, pz);
            if (pr > cfg.radius) continue;

            /* Height falls off from the middle: a downtown of towers, a
             * mid-rise ring, then two and three storeys out to the edge. The
             * noise term keeps the skyline from being a smooth cone. */
            const core = smoothstep(cfg.midRadius, 0, pr);
            const noise = fbm(px / 140, pz / 140, 3);
            const base = lerp(9, cfg.maxHeight, core * core) * (0.45 + noise * 1.05);
            const h = clamp(base, 7, cfg.maxHeight);
            const w = lot * (0.62 + rand() * 0.26);
            const d = lot * (0.62 + rand() * 0.26);
            lots.push({
              x: px, z: pz, w, d, h,
              rot: (rand() - 0.5) * 0.06,
              tint: 0.62 + rand() * 0.5,
              warm: rand() < 0.4,
            });
          }
        }
      }
    }

    const buildings = new THREE.InstancedMesh(boxGeo(1, 1, 1), buildingMat, lots.length);
    buildings.name = 'squatchbourg-buildings';
    buildings.castShadow = false;
    buildings.receiveShadow = false;
    lots.forEach((l, i) => {
      _dummy.position.set(l.x, y + l.h / 2, l.z);
      _dummy.rotation.set(0, l.rot, 0);
      _dummy.scale.set(l.w, l.h, l.d);
      _dummy.updateMatrix();
      buildings.setMatrixAt(i, _dummy.matrix);
      _colour.setHex(l.warm ? 0x8a7a62 : 0x6e7280).multiplyScalar(l.tint);
      buildings.setColorAt(i, _colour);
    });
    buildings.instanceMatrix.needsUpdate = true;
    if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
    this.group.add(buildings);
    this.parts.buildings = buildings;

    /* ---- Rooftop clutter: water tanks, stair huts, vents ---- */
    const clutterCount = Math.min(220, Math.floor(lots.length * 0.28));
    const clutter = new THREE.InstancedMesh(
      cylGeo(0.5, 0.5, 1, 7),
      solid(0x4a4238, { roughness: 0.95 }),
      clutterCount,
    );
    clutter.name = 'squatchbourg-rooftops';
    this.clutterOwner = [];
    for (let i = 0; i < clutterCount; i++) {
      const l = lots[Math.floor(rand() * lots.length)];
      const s = 2.2 + rand() * 3.4;
      _dummy.position.set(
        l.x + (rand() - 0.5) * l.w * 0.5,
        y + l.h + s * 0.5,
        l.z + (rand() - 0.5) * l.d * 0.5,
      );
      _dummy.rotation.set(0, rand() * Math.PI, 0);
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      clutter.setMatrixAt(i, _dummy.matrix);
      this.clutterOwner.push({ x: l.x, z: l.z });
    }
    clutter.instanceMatrix.needsUpdate = true;
    this.group.add(clutter);
    this.parts.clutter = clutter;

    /* ---- Street lights: one unlit box each, one draw call for the town ---- */
    const lightCount = 300;
    const lights = new THREE.InstancedMesh(boxGeo(1, 1, 1), unlit(0xffdc9a), lightCount);
    lights.name = 'squatchbourg-streetlights';
    this.lightPos = [];
    let placed = 0;
    for (let guard = 0; guard < lightCount * 6 && placed < lightCount; guard++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * cfg.radius;
      const lx = Math.cos(a) * rr;
      const lz = Math.sin(a) * rr;
      // Snap onto the nearest street centreline so they run in lines.
      const sx = Math.round(lx / cfg.blockSize) * cfg.blockSize;
      const sz = Math.round(lz / cfg.blockSize) * cfg.blockSize;
      const onX = Math.abs(lx - sx) < Math.abs(lz - sz);
      const px = onX ? sx : lx;
      const pz = onX ? lz : sz;
      _dummy.position.set(px, y + 7.5, pz);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1.5, 1.5, 1.5);
      _dummy.updateMatrix();
      lights.setMatrixAt(placed, _dummy.matrix);
      this.lightPos.push({ x: px, z: pz });
      placed++;
    }
    lights.count = placed;
    lights.instanceMatrix.needsUpdate = true;
    this.group.add(lights);
    this.parts.lights = lights;

    /* ---- Landmarks: the handful of individual shapes that make an aerial
     * view read as a town and not as a scatter plot. ---- */
    this.landmarks = [];
    const stone = solid(0xa89a80, { roughness: 0.92 });
    const brick = solid(0x6b4436, { roughness: 0.95 });
    const steel = solid(0x8a8f96, { roughness: 0.5, metalness: 0.6 });

    // Civic hall with a dome, on the main crossroads.
    const hall = group('civic-hall');
    hall.position.set(cfg.blockSize * 0.5, y, cfg.blockSize * 0.5);
    hall.add(mesh(boxGeo(58, 26, 40), stone, 0, 13, 0));
    hall.add(mesh(cylGeo(13, 13, 8, 16), stone, 0, 30, 0));
    const dome = mesh(new THREE.SphereGeometry(13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), solid(0x3f6a5a, { roughness: 0.6, metalness: 0.3 }), 0, 34, 0);
    hall.add(dome);
    hall.add(mesh(coneGeo(2.2, 9, 8), steel, 0, 50, 0));
    this.group.add(hall);
    this.landmarks.push(hall);

    // Two brick stacks over the industrial quarter, south-west.
    for (const [sx, sz] of [[-cfg.radius * 0.62, cfg.radius * 0.5], [-cfg.radius * 0.7, cfg.radius * 0.62]]) {
      const stack = mesh(cylGeo(4.2, 6.4, 74, 12), brick, sx, y + 37, sz);
      this.group.add(stack);
      this.landmarks.push(stack);
      const shed = mesh(boxGeo(70, 16, 46), solid(0x5a5248, { roughness: 0.96 }), sx + 24, y + 8, sz + 8);
      this.group.add(shed);
      this.landmarks.push(shed);
    }

    // Two grain silos, because every town this size has them.
    for (const off of [-14, 14]) {
      const silo = mesh(cylGeo(9, 9, 44, 14), solid(0xb0a894, { roughness: 0.9 }), cfg.radius * 0.6 + off, y + 22, cfg.radius * 0.42);
      this.group.add(silo);
      this.landmarks.push(silo);
    }

    // The radio mast, with its red lamp — the thing the bombardier calls.
    const mast = group('radio-mast');
    mast.position.set(-cfg.blockSize * 1.5, y, -cfg.blockSize * 2.5);
    mast.add(mesh(cylGeo(0.9, 2.4, 96, 8), steel, 0, 48, 0));
    for (const ly of [26, 52, 78]) {
      mast.add(mesh(boxGeo(11, 0.6, 0.6), steel, 0, ly, 0));
      mast.add(mesh(boxGeo(0.6, 0.6, 11), steel, 0, ly, 0));
    }
    const lamp = flatMesh(new THREE.SphereGeometry(1.6, 8, 6), unlit(0xff3a24), 0, 98, 0);
    mast.add(lamp);
    this.parts.mastLamp = lamp;
    this.group.add(mast);
    this.landmarks.push(mast);

    // The bridge over the river.
    const bridge = group('bridge');
    bridge.position.set(0, y, -cfg.radius * 0.52);
    bridge.rotation.y = 0.22;
    bridge.add(mesh(boxGeo(16, 2.4, 96), stone, 0, 6, 0));
    for (const bz of [-26, 26]) {
      bridge.add(mesh(boxGeo(14, 12, 6), stone, 0, 1, bz));
    }
    for (const bz of [-40, 0, 40]) {
      bridge.add(mesh(boxGeo(0.9, 14, 0.9), steel, -7, 14, bz));
      bridge.add(mesh(boxGeo(0.9, 14, 0.9), steel, 7, 14, bz));
    }
    this.group.add(bridge);
    this.landmarks.push(bridge);

    /* Rail yard south of downtown: five sidings, so the ground reads as
     * something other than blocks near the edge. */
    const yard = group('rail-yard');
    yard.position.set(cfg.radius * 0.2, y + 0.6, cfg.radius * 0.66);
    for (let i = 0; i < 5; i++) {
      yard.add(mesh(boxGeo(300, 0.3, 2.6), solid(0x3a352e, { roughness: 1 }), 0, 0, -12 + i * 6));
    }
    for (let i = 0; i < 7; i++) {
      yard.add(mesh(boxGeo(16, 5, 4), solid(0x4a3a2e, { roughness: 0.95 }), -120 + i * 34, 2.6, -12 + (i % 5) * 6));
    }
    this.group.add(yard);
    this.landmarks.push(yard);
  }

  /**
   * A rough count of the built city, for the verifier and for anyone deciding
   * whether the frame cost is where it should be.
   */
  stats() {
    return {
      buildings: this.lots.length,
      rooftops: this.parts.clutter?.count ?? 0,
      streetLights: this.parts.lights?.count ?? 0,
      landmarks: this.landmarks.length,
      /* Instanced meshes + one-off landmark groups + the two ground planes. */
      drawCallsApprox: 3 + 2 + this.landmarks.length,
    };
  }

  /* ---------------------------------------------------------------- */
  /* The end of it                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Take the city away and put the crater there.
   *
   * Three passes, all of them cheap:
   *
   *  1. Every building whose centre is inside the crater lip is scaled to
   *     nothing — it is not there any more, and neither is the ground it stood
   *     on. Every building in the ring beyond it is knocked to a fifth of its
   *     height, blackened, and tipped; that ring is what makes the crater read
   *     as an edge instead of as a circular hole cut with scissors.
   *  2. Rooftop clutter and street lights inside the lip go out.
   *  3. A crater mesh is built once from `craterOffset()` — the same function
   *     `main.js`'s ground sampler uses, so what the player sees and what the
   *     aeroplane would hit are the same surface.
   *
   * @param {THREE.Vector3} point world-space impact point
   * @returns {object} the crater record (also stored on `this.crater`)
   */
  destroy(point) {
    if (this.destroyed) return this.crater;
    this.destroyed = true;

    const cfg = CRATER;
    const cx = point.x;
    const cz = point.z;
    const y = this.groundY;
    const outer = cfg.radius + cfg.rimWidth;

    // ---- 1. The buildings ----
    const buildings = this.parts.buildings;
    const scorched = new THREE.Color(0x1a1512);
    this.lots.forEach((l, i) => {
      const d = Math.hypot(this.x + l.x - cx, this.z + l.z - cz);
      if (d < cfg.radius * 0.98) {
        _dummy.position.set(l.x, y - 200, l.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(0.0001, 0.0001, 0.0001);
      } else {
        // Flattened and thrown over, harder the closer in it stood.
        const k = clamp(1 - (d - cfg.radius) / (outer * 1.35), 0, 1);
        const h = l.h * lerp(1, 0.16, k);
        _dummy.position.set(l.x, y + h / 2 + craterOffset(d, cfg), l.z);
        _dummy.rotation.set((Math.random() - 0.5) * k * 0.8, l.rot, (Math.random() - 0.5) * k * 0.8);
        _dummy.scale.set(l.w * lerp(1, 1.25, k), h, l.d * lerp(1, 1.25, k));
        _colour.setHex(l.warm ? 0x8a7a62 : 0x6e7280).multiplyScalar(l.tint).lerp(scorched, k);
        buildings.setColorAt(i, _colour);
      }
      _dummy.updateMatrix();
      buildings.setMatrixAt(i, _dummy.matrix);
    });
    buildings.instanceMatrix.needsUpdate = true;
    if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
    // The lit windows are out — the town has no power and no windows.
    buildings.material.emissiveIntensity = 0.04;

    // ---- 2. Rooftops and street lights ----
    const clutter = this.parts.clutter;
    for (let i = 0; i < clutter.count; i++) {
      const o = this.clutterOwner[i];
      const d = Math.hypot(this.x + o.x - cx, this.z + o.z - cz);
      if (d < outer) {
        _dummy.position.set(o.x, y - 300, o.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(0.0001, 0.0001, 0.0001);
        _dummy.updateMatrix();
        clutter.setMatrixAt(i, _dummy.matrix);
      }
    }
    clutter.instanceMatrix.needsUpdate = true;
    const lights = this.parts.lights;
    for (let i = 0; i < lights.count; i++) {
      const o = this.lightPos[i];
      const d = Math.hypot(this.x + o.x - cx, this.z + o.z - cz);
      if (d < outer) {
        _dummy.position.set(o.x, y - 300, o.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(0.0001, 0.0001, 0.0001);
        _dummy.updateMatrix();
        lights.setMatrixAt(i, _dummy.matrix);
      }
    }
    lights.instanceMatrix.needsUpdate = true;
    if (this.parts.mastLamp) this.parts.mastLamp.material = unlit(0x2a0f0a);

    // Landmarks inside the lip simply are not there.
    for (const lm of this.landmarks) {
      const wx = this.x + lm.position.x;
      const wz = this.z + lm.position.z;
      if (Math.hypot(wx - cx, wz - cz) < outer) lm.visible = false;
    }
    this.parts.streets.visible = false;

    // ---- 3. The hole ----
    this.crater = this.buildCraterMesh(cx, cz, y);
    return this.crater;
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
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
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
    const k = clamp(1 - cr.t / 34, 0, 1);
    cr.glow.material.opacity = k * k * 0.9;
    cr.glow.material.color.setHex(k > 0.5 ? 0xff8a3a : 0xc4321a);
    if (cr.t > 34) {
      this.scene.remove(cr.glow);
      cr.glow.material.dispose();
      cr.glow.geometry.dispose();
      cr.glow = null;
    }
  }
}
