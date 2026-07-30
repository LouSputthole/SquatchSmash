/**
 * Shared helpers for the Beef Run.
 *
 * Materials come from the apartment's `build.js` cache — the same
 * MeshStandardMaterial sharing the flat uses, for the same reason: a mission
 * this size builds a few hundred props out of about thirty distinct looks, and
 * minting a material per prop is how a scene ends up bound by state changes
 * rather than by triangles. Geometry gets the same treatment here, since out
 * on the route it is boxes and cones by the thousand.
 */
import * as THREE from 'three';
import { mat, emissive } from '../world/build.js';

export { mat, emissive };

/** A plain coloured surface. `solid(0x8a5a30, { roughness: 1 })`. */
export function solid(color, extra = null) {
  return mat({ color, ...(extra || {}) });
}

/** Unlit — flames, beacons, instrument faces, anything that makes its own light. */
const _basicCache = new Map();
export function unlit(color, extra = null) {
  const key = extra ? `${color}|${JSON.stringify(extra)}` : String(color);
  if (!_basicCache.has(key)) {
    _basicCache.set(key, new THREE.MeshBasicMaterial({ color, toneMapped: false, ...(extra || {}) }));
  }
  return _basicCache.get(key);
}

const geoCache = new Map();

export function boxGeo(w, h, d) {
  const key = `b${w},${h},${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}

export function cylGeo(rt, rb, h, seg = 8, open = false) {
  const key = `c${rt},${rb},${h},${seg},${open}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
  return geoCache.get(key);
}

export function coneGeo(r, h, seg = 8) {
  const key = `k${r},${h},${seg}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.ConeGeometry(r, h, seg));
  return geoCache.get(key);
}

export function sphereGeo(r, w = 10, h = 7) {
  const key = `s${r},${w},${h}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.SphereGeometry(r, w, h));
  return geoCache.get(key);
}

export function planeGeo(w, h) {
  const key = `p${w},${h}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.PlaneGeometry(w, h));
  return geoCache.get(key);
}

export function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Same, but casts nothing — ground decals, sign faces, flames. */
export function flatMesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

export function group(name, ...children) {
  const g = new THREE.Group();
  g.name = name;
  for (const c of children) if (c) g.add(c);
  return g;
}

/* ------------------------------------------------------------------ */
/* Maths                                                               */
/* ------------------------------------------------------------------ */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent approach. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

/** Signed shortest difference between two headings, in degrees. */
export function headingDelta(from, to) {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/* ------------------------------------------------------------------ */
/* Deterministic noise                                                 */
/* ------------------------------------------------------------------ */
/* Terrain has to come back identical after a checkpoint restart, so none of
 * this may touch Math.random. */

function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x, y, octaves = 4, lac = 2.03, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(fx, fy) * amp;
    norm += amp;
    amp *= gain;
    fx *= lac;
    fy *= lac;
  }
  return sum / norm;
}

/** Ridged noise — mountain spines rather than rolling hills. */
export function ridged(x, y, octaves = 4) {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(fx, fy) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.07;
    fy *= 2.07;
  }
  return sum / norm;
}

/** Seeded RNG so scatter placement is stable per chunk. */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967295;
  };
}

/* ------------------------------------------------------------------ */
/* Hand-painted signage                                                */
/* ------------------------------------------------------------------ */

export function signTexture(lines, opts = {}) {
  const {
    w = 512, h = 256, bg = '#c9b78d', fg = '#2e2214', border = '#5c4326',
    weight = '900', rough = true, tilt = 0,
  } = opts;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (rough) {
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 30, Math.random() * 5);
    }
  }
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(4, h * 0.04);
    ctx.strokeRect(7, 7, w - 14, h - 14);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (tilt) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(tilt);
    ctx.translate(-w / 2, -h / 2);
  }
  const n = lines.length;
  lines.forEach((line, i) => {
    const size = Math.min((h / (n + 0.5)) * 0.78, (w * 1.55) / Math.max(5, line.length));
    ctx.font = `${weight} ${Math.floor(size)}px Trebuchet MS, sans-serif`;
    ctx.fillText(line, w / 2, (h / (n + 1)) * (i + 1));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A painted board, positioned by the caller. */
export function signBoard(lines, width, height, opts = {}) {
  const tex = signTexture(lines, opts);
  const m = new THREE.Mesh(boxGeo(width, height, 0.06), mat({ map: tex, roughness: 0.9 }));
  m.castShadow = m.receiveShadow = true;
  return m;
}
