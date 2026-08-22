/** Small geometry helpers shared by every prop builder. */
import * as THREE from 'three';

const _box = new THREE.BoxGeometry(1, 1, 1);
const _cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
const _sph = new THREE.SphereGeometry(1, 20, 14);

/**
 * Axis-aligned box positioned by its centre.
 * @param {object} o { size:[x,y,z], pos:[x,y,z], mat, name, rotY }
 */
export function box(o) {
  const m = new THREE.Mesh(_box, o.mat);
  m.scale.set(o.size[0], o.size[1], o.size[2]);
  m.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o.rotY) m.rotation.y = o.rotY;
  if (o.rotX) m.rotation.x = o.rotX;
  if (o.rotZ) m.rotation.z = o.rotZ;
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  if (o.name) m.name = o.name;
  return m;
}

/** Box specified by its min/max extents instead of centre + size. */
export function boxFrom(minX, minY, minZ, maxX, maxY, maxZ, mat, opts = {}) {
  return box({
    size: [maxX - minX, maxY - minY, maxZ - minZ],
    pos: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    mat,
    ...opts,
  });
}

export function cylinder(o) {
  const rt = o.rTop ?? o.r ?? 0.1;
  const rb = o.rBottom ?? o.r ?? 0.1;
  const h = o.h ?? 1;
  let m;
  if (rt === rb) {
    // Uniform radius: reuse the shared unit cylinder and scale it.
    m = new THREE.Mesh(_cyl, o.mat);
    m.scale.set(rt, h, rt);
  } else {
    m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 20), o.mat);
  }
  m.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o.rotX) m.rotation.x = o.rotX;
  if (o.rotZ) m.rotation.z = o.rotZ;
  if (o.rotY) m.rotation.y = o.rotY;
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  /* SILENTLY DROPPED UNTIL 2026-08-05, and `sphere()` did the same.
   *
   * Only `box()` kept `name`, so a hundred and twenty-four call sites across
   * the game were passing one — `ak-barrel`, `barrett-scope-glass`,
   * `basement-boiler`, names nobody types by accident — into a function that
   * threw it away. Every verifier that identifies geometry by name was blind
   * to all of it, and the failure mode was the worst kind: the author writes
   * the name, the check that looks for it finds nothing, and the honest
   * conclusion "that mesh is not there" is wrong.
   *
   * Checked before changing it: no `getObjectByName` call anywhere in the
   * project asks for a name that only a cylinder or a sphere supplies, so
   * nothing that works today starts resolving to something different. */
  if (o.name) m.name = o.name;
  return m;
}

export function sphere(o) {
  const m = new THREE.Mesh(_sph, o.mat);
  const r = o.r ?? 0.1;
  m.scale.set(r, o.ry ?? r, o.rz ?? r);
  m.position.set(o.pos[0], o.pos[1], o.pos[2]);
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  if (o.name) m.name = o.name;      // see the note in `cylinder()`
  return m;
}

/** Flat quad, useful for screens, pictures and light spill decals. */
export function plane(w, h, mat) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

/*
 * Materials are shared between everything asking for the same thing.
 *
 * This used to mint a fresh MeshStandardMaterial per call, and it is called
 * from about 350 places, so the flat was carrying 500 distinct materials for
 * maybe forty distinct looks -- 500 programs to sort, bind and switch between
 * for 33,000 triangles. The scene was never geometry-bound; it was bound by
 * how many different things it claimed to be made of.
 *
 * The obvious danger is aliasing: share a material and anything that MUTATES
 * one mutates all of them. Every site in the project that does that already
 * clones first -- the eggs clone so they do not all cook as one object, the
 * RGB strips clone so they can pulse independently -- and the rest build their
 * materials directly rather than through here. That is the rule to keep: if
 * you are going to write to a material at runtime, clone() it at build time.
 * Pass `unique` to opt out entirely.
 */
const _matCache = new Map();
/** Cache hits, i.e. materials this saved. Read by tools; see check/perf runs. */
export const matStats = { made: 0, shared: 0, unique: 0 };

/** Stable key for a params object, including maps and colours. */
function matKey(params) {
  const parts = [];
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v == null) parts.push(`${k}:null`);
    else if (v.isTexture) parts.push(`${k}:tex#${v.uuid}`);
    else if (v.isColor) parts.push(`${k}:#${v.getHexString()}`);
    else if (typeof v === 'object') return null;        // not safely comparable
    else parts.push(`${k}:${v}`);
  }
  return parts.join('|');
}

export function mat(params = {}) {
  const { unique, ...rest } = params;
  const key = unique ? null : matKey(rest);
  if (key !== null) {
    const hit = _matCache.get(key);
    if (hit) { matStats.shared++; return hit; }
  } else {
    matStats.unique++;
  }
  matStats.made++;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0, ...rest });
  if (key !== null) _matCache.set(key, m);
  return m;
}

/** Drop the shared materials, for a rebuild. */
export function disposeMaterialCache() {
  for (const m of _matCache.values()) m.dispose?.();
  _matCache.clear();
}

export function emissive(color, intensity = 1) {
  return new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 1,
  });
}

/** Collider box grown slightly so the player never clips a corner. */
export function collider(min, max, pad = 0.02) {
  return new THREE.Box3(
    new THREE.Vector3(min[0] - pad, min[1], min[2] - pad),
    new THREE.Vector3(max[0] + pad, max[1], max[2] + pad),
  );
}

/** Yaw such that the player looks from `from` toward `to`. */
export function yawToward(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.atan2(-dx, -dz);
}

export function group(name, ...children) {
  const g = new THREE.Group();
  g.name = name;
  for (const c of children) if (c) g.add(c);
  return g;
}
