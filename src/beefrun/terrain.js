import * as THREE from 'three';
import { ZONES, WP, EH } from './config.js';
import { clamp, lerp, smoothstep, fbm, ridged, rng, solid, mat } from './util.js';

// TerrainStreamingSystem
// ---------------------
// One continuous procedural heightfield covering the whole route. Chunks are
// built on demand around the aircraft at three levels of detail and released
// behind it; fog and cloud layers hide the seams.

const CHUNK = 500;
const RADIUS = 5;                           // ~2.5 km of ground, then fog
const DETAIL = [28, 24, 18, 12, 8, 6];      // segments per chunk by ring distance
const BUILD_BUDGET = 3;                     // chunks built per frame

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

  if (z < -8600) h = elHuesoShape(x, z, h);

  return h;
}

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
      trunks.castShadow = canopies.castShadow = false;
      let used = 0;
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
        if (Math.abs(wx - EH.x) < 30 && wz > EH.zHigh - 40 && wz < EH.zLow + 40) continue;
        const h = terrainHeight(wx, wz);
        const hx = terrainHeight(wx + 8, wz) - terrainHeight(wx - 8, wz);
        const hz = terrainHeight(wx, wz + 8) - terrainHeight(wx, wz - 8);
        if (Math.hypot(hx, hz) > 16) continue;          // too steep
        if (h < 3) continue;                             // in the water
        const s = zone.treeScale * (0.7 + rand() * 0.7);
        _obj.position.set(wx, h, wz);
        _obj.rotation.set(0, rand() * Math.PI, 0);
        _obj.scale.setScalar(s);
        _obj.updateMatrix();
        trunks.setMatrixAt(used, _obj.matrix);
        canopies.setMatrixAt(used, _obj.matrix);
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

  // Force-build everything around a point (used when teleporting to a checkpoint).
  prime(x, z) {
    this.update(x, z, 0);
    while (this.queue.length) {
      const item = this.queue.shift();
      if (!this.chunks.has(item.k)) this.chunks.set(item.k, this.build(item.cx, item.cz, item.detail));
    }
  }
}
