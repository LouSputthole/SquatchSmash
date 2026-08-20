import * as THREE from 'three';
import { ZONES, WP, EH, LANDMARKS } from './config.js';
import { clamp, lerp, smoothstep, fbm, ridged, rng, solid, mat } from './util.js';

// TerrainStreamingSystem
// ---------------------
// One continuous procedural heightfield covering the whole route. Chunks are
// built on demand around the aircraft at three levels of detail and released
// behind it; fog and cloud layers hide the seams.

const CHUNK = 500;
const RADIUS = 5;                           // ~2.5 km of ground, then fog
const DETAIL = [28, 24, 18, 12, 8, 6];      // segments per chunk by ring distance
// One terrain chunk includes a full tree scatter. Keep the build on a single
// frame's budget so flying never turns into a slideshow while new ground
// streams in.
const BUILD_BUDGET = 1;

// ---------- Elevation ----------

function zoneIndexFor(z) {
  for (let i = 0; i < ZONES.length; i++) if (z > ZONES[i].to) return i;
  return ZONES.length - 1;
}

// Blend factor between zone i and i+1 across the seam.
function zoneMix(z) {
  const i = zoneIndexFor(z);
  const edge = ZONES[i].to;
  const band = 420;
  if (i < ZONES.length - 1 && z < edge + band) {
    return { i, j: i + 1, t: smoothstep(edge + band, edge, z) };
  }
  return { i, j: i, t: 0 };
}

export function zoneAt(z) {
  return ZONES[zoneIndexFor(z)];
}

// Lerped palette/fog for the current position — used for sky + fog drift.
export function zonePalette(z, out = {}) {
  const { i, j, t } = zoneMix(z);
  const a = ZONES[i], b = ZONES[j];
  out.fog = new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), t);
  out.sky = new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), t);
  out.fogNear = lerp(a.fogNear, b.fogNear, t);
  out.fogFar = lerp(a.fogFar, b.fogFar, t);
  out.name = t > 0.5 ? b.name : a.name;
  out.id = t > 0.5 ? b.id : a.id;
  return out;
}

function zoneHeight(zone, x, z) {
  const s = zone.scale;
  const soft = fbm(x / s, z / s, 4);
  const sharp = ridged(x / s, z / s, 4);
  const h = lerp(soft, sharp, clamp(zone.ridge, 0, 1));
  return zone.base + h * zone.relief;
}

// El Hueso sits in a carved valley; the strip itself is a sloped shelf with a
// cliff off the low end and a mountain wall past the high end.
function elHuesoShape(x, z, h) {
  const zc = (EH.zLow + EH.zHigh) / 2;
  const dz = z - zc;
  const halfLen = (EH.zLow - EH.zHigh) / 2;
  const dx = x - EH.x;

  // Valley bowl: pull terrain down toward strip elevation near the axis.
  const valley = smoothstep(900, 220, Math.hypot(dx * 1.5, dz));
  const stripElev = lerp(EH.elevHigh, EH.elevLow, clamp((z - EH.zHigh) / (EH.zLow - EH.zHigh), 0, 1));
  h = lerp(h, stripElev + 30, valley * 0.85);

  /* The shelf itself, plus a run-out past the uphill end.
   *
   * Without the run-out, a landing that uses the whole strip arrives at the
   * point where the valley wall starts climbing while still doing thirty knots,
   * and the aeroplane drives into the mountain having done nothing wrong. */
  const past = Math.max(0, EH.zHigh - z);                 // beyond the top end
  const effective = Math.abs(dz) - smoothstep(0, EH.runOut, past) * EH.runOut;
  const onLen = smoothstep(halfLen + 170, halfLen - 10, effective);
  const onWid = smoothstep(90, 30, Math.abs(dx));
  h = lerp(h, stripElev, onLen * onWid);

  // Cliff past the low (departure) end.
  if (z > EH.zLow) {
    const drop = smoothstep(EH.zLow + 10, EH.zLow + 120, z) * smoothstep(240, 90, Math.abs(dx));
    h = lerp(h, EH.elevLow - 300, drop);
  }
  return h;
}

export function terrainHeight(x, z) {
  const { i, j, t } = zoneMix(z);
  let h = t > 0
    ? lerp(zoneHeight(ZONES[i], x, z), zoneHeight(ZONES[j], x, z), t)
    : zoneHeight(ZONES[i], x, z);

  // Whispering Pines pad — flat bowl around the field.
  const dWP = Math.hypot((x - WP.x) / 1.5, z - WP.z);
  const pad = smoothstep(900, 480, dWP);
  h = lerp(h, WP.elev, pad);

  /* The pass out of the valley, south along the route.
   *
   * The pad is a radial bowl that stops 480 m from the middle of the field —
   * barely past the end of the runway — so the noise took over immediately and
   * put five hundred metres of mountain three hundred metres off the departure
   * end. The mission departs southbound. The first takeoff of the whole thing
   * flew into a hill, empty or loaded, at full power and best climb, and there
   * was not room to turn round either.
   *
   * So the ground gives way ahead of the aeroplane, and hands over to real
   * country a few kilometres out where there is height to spare. It only ever
   * lowers terrain — the mountains further along the route are the scenery and
   * stay where they are.
   *
   * The gradient is set by the harder of the two directions, and that is not the
   * climb. You come home up this same pass, and a floor rising at the rate an
   * approach descends means you can never get on profile: the aeroplane arrives
   * thirty metres over rising ground, the ground levels off underneath it, and
   * it floats the length of the runway and lands in the trees past the far end.
   * So it is a sixteenth — comfortably under both an approach slope and what a
   * loaded Brushrunner climbs at. */
  const outbound = (WP.z - WP.rwyHalf) - z;
  if (outbound > 0) {
    const lateral = smoothstep(820, 300, Math.abs(x - WP.x));
    const fade = smoothstep(5200, 3000, outbound);
    // Flat for a few hundred metres past the end first, so there is somewhere to
    // be low on an approach. A floor that starts climbing at the threshold
    // leaves an aeroplane on profile three metres over the dirt.
    const ceiling = WP.elev + Math.max(0, outbound - 380) * 0.062;
    h = lerp(h, Math.min(h, ceiling), lateral * fade);
  }

  /* The notch in the ridge north of El Hueso.
   *
   * The same problem as the pass above, in the other direction and worse. You
   * leave the strip heavy off the cliff end, the ground falls away to 390 m, and
   * eleven hundred metres of ridge stands 1.4 km ahead. That needs a third of a
   * gradient to clear and the aeroplane has an eighth of one, and there was no
   * way round it either — the lowest crossing anywhere within a kilometre and a
   * half either side was still too steep. The heavy departure was a trap: fall
   * off a cliff into a bowl you cannot climb out of.
   *
   * It gets a saddle rather than a flattening, because Lou calls this ridge out
   * by name on the way home and it should still be a ridge. Four hundred metres
   * wide on the route axis, climbable, and untouched to either side. */
  if (z > EH.zLow - 200 && z < -7200) {
    const north = z - (EH.zLow - 200);
    const lateral = smoothstep(520, 200, Math.abs(x - EH.x));
    const fade = smoothstep(2600, 1500, Math.abs(z - (-8200)));
    const ceiling = EH.elevLow + north * 0.055;
    h = lerp(h, Math.min(h, ceiling), lateral * Math.max(fade, 0.55));
  }

  if (z < -8600) h = elHuesoShape(x, z, h);

  return h;
}

/**
 * Height of the RENDERED ground at (x, z).
 *
 * A chunk is a grid of `segs` quads per 500 m side, each split into two
 * triangles, and between the vertices the surface is a plane -- not the
 * heightfield. On the valley wall beside El Hueso the two disagree by a
 * metre or more (16 m at worst on the cliff), which is a tree standing on
 * air. Anything planted on the ground should ask THIS, for the detail level
 * the chunk under it is built at (`TERRAIN_DETAIL[0]` up close), and sink its
 * roots a little besides. Same triangulation as `build()`: PlaneGeometry's
 * (a, b, d) / (b, c, d) split, rotated -90 about X, so the diagonal runs from
 * (x0, z1) to (x1, z0).
 */
export function terrainMeshHeight(x, z, segs = DETAIL[0]) {
  const cx = Math.round(x / CHUNK), cz = Math.round(z / CHUNK);
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const step = CHUNK / segs;
  const lx = clamp(x - ox + CHUNK / 2, 0, CHUNK - 1e-6);
  const lz = clamp(z - oz + CHUNK / 2, 0, CHUNK - 1e-6);
  const i = Math.floor(lx / step), j = Math.floor(lz / step);
  const x0 = ox - CHUNK / 2 + i * step, z0 = oz - CHUNK / 2 + j * step;
  const u = (x - x0) / step, v = (z - z0) / step;
  const ha = terrainHeight(x0, z0);
  const hb = terrainHeight(x0, z0 + step);
  const hc = terrainHeight(x0 + step, z0 + step);
  const hd = terrainHeight(x0 + step, z0);
  if (u + v <= 1) return ha + u * (hd - ha) + v * (hb - ha);
  return hc + (1 - u) * (hb - hc) + (1 - v) * (hd - hc);
}

/** Segments per chunk side by ring distance from the aircraft; [0] is underfoot. */
export const TERRAIN_DETAIL = DETAIL;

export function terrainNormal(x, z, out = new THREE.Vector3()) {
  const e = 6;
  const hL = terrainHeight(x - e, z), hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e), hU = terrainHeight(x, z + e);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}

// Slope in radians (0 = flat) — used for scatter and landing checks.
export function terrainSlope(x, z) {
  const n = terrainNormal(x, z);
  return Math.acos(clamp(n.y, -1, 1));
}

// ---------- Chunk meshes ----------

const treeTrunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 6, 5);
treeTrunkGeo.translate(0, 3, 0);
const treeCanopyGeo = new THREE.ConeGeometry(4.2, 13, 6);
treeCanopyGeo.translate(0, 11, 0);

const _c = new THREE.Color();
const _obj = new THREE.Object3D();

function insideRotatedRectangle(dx, dz, halfWidth, halfDepth, heading = 0) {
  const c = Math.cos(heading), s = Math.sin(heading);
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  return Math.abs(lx) <= halfWidth && Math.abs(lz) <= halfDepth;
}

/**
 * True when procedural tree scatter would occupy an authored landmark mass.
 *
 * The landmark models are permanent while terrain chunks stream in and out.
 * Keeping this decision in world coordinates makes the result independent of
 * chunk build order and stops a reloaded chunk from growing a new tree through
 * the radio-tower wreck, volcano, red cliff, or waterfall rockwork.
 */
export function treeScatterBlockedByLandmark(wx, wz) {
  for (const landmark of LANDMARKS) {
    const dx = wx - landmark.x;
    const dz = wz - landmark.z;
    if (landmark.kind === 'tower') {
      // Upright lattice plus the detached top lying forty metres downrange.
      if (Math.hypot(dx, dz) <= 18) return true;
      if (dx >= 25 && dx <= 55 && dz >= 7 && dz <= 45) return true;
    } else if (landmark.kind === 'volcano') {
      // The authored talus cone has a 700 m basal radius.
      if (Math.hypot(dx, dz) <= 706) return true;
    } else if (landmark.kind === 'cliff') {
      // Seven rotated slabs: widest is 420 x 150 m. Six metres clear the
      // largest possible procedural trunk at either edge.
      if (insideRotatedRectangle(dx, dz, 216, 81, 0.3)) return true;
    } else if (landmark.kind === 'falls') {
      // Main cliff/header and the authored river leaving its plunge basin.
      if (dx >= -370 && dx <= 370 && dz >= -200 && dz <= 75) return true;
      if (dx >= -395 && dx <= -135 && dz >= 50 && dz <= 505) return true;
    }
  }
  return false;
}

export class TerrainStreamingSystem {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.queue = [];
    this.groundMat = mat({ vertexColors: true, roughness: 0.97, metalness: 0 });
    this.trunkMat = solid(0x5a4126, { roughness: 1 });
    this.center = { cx: 9999, cz: 9999 };
    this.sea = null;
  }

  key(cx, cz) { return `${cx},${cz}`; }

  // Rebuild the working set around a world position.
  update(x, z, dt) {
    const cx = Math.round(x / CHUNK);
    const cz = Math.round(z / CHUNK);
    if (cx !== this.center.cx || cz !== this.center.cz) {
      this.center = { cx, cz };
      this.reschedule(cx, cz);
    }
    let built = 0;
    while (this.queue.length && built < BUILD_BUDGET) {
      const item = this.queue.shift();
      if (!this.chunks.has(item.k)) {
        this.chunks.set(item.k, this.build(item.cx, item.cz, item.detail));
        built++;
      }
    }
  }

  reschedule(cx, cz) {
    const want = new Set();
    const pending = [];
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      for (let dz = -RADIUS; dz <= RADIUS; dz++) {
        const d = Math.max(Math.abs(dx), Math.abs(dz));
        if (d > RADIUS) continue;
        const k = this.key(cx + dx, cz + dz);
        want.add(k);
        const detail = DETAIL[Math.min(d, DETAIL.length - 1)];
        const existing = this.chunks.get(k);
        if (existing && existing.detail !== detail && d <= 2) {
          this.dispose(existing);
          this.chunks.delete(k);
        }
        if (!this.chunks.has(k)) {
          pending.push({ k, cx: cx + dx, cz: cz + dz, detail, d });
        }
      }
    }
    pending.sort((a, b) => a.d - b.d);
    this.queue = pending;
    for (const [k, chunk] of this.chunks) {
      if (!want.has(k)) {
        this.dispose(chunk);
        this.chunks.delete(k);
      }
    }
  }

  build(cx, cz, segs) {
    const group = new THREE.Group();
    group.name = `beefrun-terrain-chunk-${cx}-${cz}`;
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const zone = zoneAt(oz);
    const groundCol = new THREE.Color(zone.ground);
    const rockCol = new THREE.Color(zone.rock);

    for (let i = 0; i < pos.count; i++) {
      const wx = ox + pos.getX(i);
      const wz = oz + pos.getZ(i);
      const h = terrainHeight(wx, wz);
      pos.setY(i, h);
      // Slope shading: steep faces go rocky, high ground goes pale.
      const hx = terrainHeight(wx + 8, wz) - terrainHeight(wx - 8, wz);
      const hz = terrainHeight(wx, wz + 8) - terrainHeight(wx, wz - 8);
      const steep = clamp(Math.hypot(hx, hz) / 22, 0, 1);
      _c.copy(groundCol).lerp(rockCol, steep * 0.9);
      const tint = 0.86 + fbm(wx / 90, wz / 90, 2) * 0.28;
      _c.multiplyScalar(tint);
      if (h > 900) _c.lerp(new THREE.Color(0xdfe6ee), smoothstep(900, 1250, h) * 0.8);
      colors[i * 3] = _c.r; colors[i * 3 + 1] = _c.g; colors[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.groundMat);
    m.name = `${group.name}-ground`;
    /* The rendered heightfield is a triangulated surface, not the solid AABB
     * enclosing a whole 500 m relief range. Its own support is procedural and
     * every planted object below uses the matching rendered mesh height. */
    m.userData.geometryGate = {
      overlap: false,
      checkSupport: false,
      // The heightfield is a walkable triangulated surface, never a vertical
      // wall. Its relief AABB must not classify distant route landmarks as
      // embedded merely because both occupy the same 500 m chunk envelope.
      checkWallEmbed: false,
    };
    m.position.set(ox, 0, oz);
    m.receiveShadow = segs >= 20;
    group.add(m);

    // Scatter trees on the near rings only.
    const near = Math.max(Math.abs(cx - this.center.cx), Math.abs(cz - this.center.cz)) <= 3;
    let trunks = null, canopies = null;
    if (near && zone.trees > 0) {
      const rand = rng(cx * 73856093 ^ cz * 19349663);
      const n = zone.trees;
      trunks = new THREE.InstancedMesh(treeTrunkGeo, this.trunkMat, n);
      canopies = new THREE.InstancedMesh(treeCanopyGeo, solid(zone.tree, { roughness: 1 }), n);
      const treePrefix = `${group.name}-tree`;
      trunks.name = `${treePrefix}-trunks`;
      trunks.userData.geometryGate = {
        instanceAssemblyPrefix: treePrefix,
        checkSupport: false,
      };
      canopies.name = `${treePrefix}-canopies`;
      canopies.userData.geometryGate = {
        instanceAssemblyPrefix: treePrefix,
        // Needle crowns are porous silhouettes; their trunks remain audited.
        overlap: false,
      };
      trunks.castShadow = canopies.castShadow = false;
      let used = 0;
      const planted = [];
      for (let i = 0; i < n; i++) {
        const wx = ox + (rand() - 0.5) * CHUNK;
        const wz = oz + (rand() - 0.5) * CHUNK;
        /* Both runways are flattened pads, so the "too steep" test below waves
         * trees straight through them. Keep the scatter off the asphalt and off
         * the dirt, with enough margin either side to clear the wingtips. */
        if (Math.abs(wx - WP.x) < 40 && Math.abs(wz - WP.z) < WP.rwyHalf + 60) continue;
        /* The west-side apron is a flattened pad too — hangar, ops shack, fuel
         * tank, the wrecks, the entrance road — and the runway margin above
         * stops at x -40, which is how a pine ended up growing hard against
         * the hangar wall. Everything anybody walks between lives inside this
         * rectangle, so nothing may sprout in it. */
        if (wx > -130 && wx < -12 && wz > 320 && wz < 450) continue;
        /* El Hueso owns its own slope-aware palm and jungle producers out to
         * roughly 105 m either side of the strip. Procedural route trees must
         * not add a second forest inside that authored stand. */
        if (Math.abs(wx - EH.x) < 120 && wz > EH.zHigh - 90 && wz < EH.zLow + 80) continue;
        if (treeScatterBlockedByLandmark(wx, wz)) continue;
        const h = terrainHeight(wx, wz);
        const hx = terrainHeight(wx + 8, wz) - terrainHeight(wx - 8, wz);
        const hz = terrainHeight(wx, wz + 8) - terrainHeight(wx, wz - 8);
        if (Math.hypot(hx, hz) > 16) continue;          // too steep
        if (h < 3) continue;                             // in the water
        const s = zone.treeScale * (0.7 + rand() * 0.7);
        /* The scatter used to validate terrain and runways but never another
         * tree. Three current chunks therefore grew trunks through trunks.
         * Keep their solid 0.8 m base radii apart; crowns remain porous and
         * are intentionally allowed to mingle above this rooted clearance. */
        const overlapsTree = planted.some((other) => {
          /* The gate deliberately compares world AABBs. A radial distance can
           * still let two diagonal AABBs cross, so reserve the largest trunk
           * half-extent independently on x and z. */
          // Rotating the five-sided trunk's asymmetric local box can project
          // 1.09 times its scale onto either horizontal axis.
          const clearance = 1.12 * (s + other.scale) + 0.06;
          return Math.abs(wx - other.x) < clearance && Math.abs(wz - other.z) < clearance;
        });
        if (overlapsTree) continue;
        /* Plant it on the surface this chunk actually draws, not on the
         * heightfield the surface approximates, and a little under it: a
         * trunk that reaches half a metre into the hill reads as rooted, one
         * that stops half a metre above it reads as hung there. */
        _obj.position.set(wx, Math.min(h, terrainMeshHeight(wx, wz, segs)) - 0.5 * s, wz);
        _obj.rotation.set(0, rand() * Math.PI, 0);
        _obj.scale.setScalar(s);
        _obj.updateMatrix();
        trunks.setMatrixAt(used, _obj.matrix);
        canopies.setMatrixAt(used, _obj.matrix);
        planted.push({ x: wx, z: wz, scale: s });
        used++;
      }
      trunks.count = used;
      canopies.count = used;
      trunks.instanceMatrix.needsUpdate = true;
      canopies.instanceMatrix.needsUpdate = true;
      group.add(trunks, canopies);
    }

    this.scene.add(group);
    return { group, geo, detail: segs, trunks, canopies };
  }

  dispose(chunk) {
    this.scene.remove(chunk.group);
    chunk.geo.dispose();
    if (chunk.trunks) chunk.trunks.dispose();
    if (chunk.canopies) chunk.canopies.dispose();
  }

  clear() {
    for (const [, c] of this.chunks) this.dispose(c);
    this.chunks.clear();
    this.queue.length = 0;
    this.center = { cx: 9999, cz: 9999 };
  }

  // Warm the centre and its immediate neighbours when teleporting to a
  // checkpoint. Collision height is procedural and independent of meshes, so
  // the remaining rings can keep streaming under fog instead of blocking the
  // restart on all 121 chunks and their forest scatter.
  prime(x, z) {
    this.update(x, z, 0);
    let warmed = 1;
    while (this.queue.length && warmed < 9) {
      const item = this.queue.shift();
      if (!this.chunks.has(item.k)) {
        this.chunks.set(item.k, this.build(item.cx, item.cz, item.detail));
        warmed++;
      }
    }
  }
}
