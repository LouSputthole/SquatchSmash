/**
 * Tiny DOM-free geometry helpers for the shared weapon models.
 *
 * These are `src/world/build.js`'s `box` / `cylinder` / `group` / `mat`, cut
 * down to what a gun needs and with the canvas textures left behind. The
 * reason they are not simply imported: `world/build.js` is reached through
 * `world/props.js` and `world/textures.js`, which build canvas-backed
 * materials at import time. A `document` in the import graph means the shared
 * weapon module cannot be loaded by `node --test`, and a weapon system nobody
 * can unit-test is exactly the thing this module exists to stop being.
 *
 * The same three sharing rules the flat uses are kept, because a house full of
 * racked weapons is a lot of small meshes:
 *   - one unit BoxGeometry and one unit CylinderGeometry, scaled per mesh;
 *   - materials cached by their parameters, so eleven AK magazines are one
 *     material and not eleven;
 *   - torus and lathe shapes, which cannot be a scaled unit, are cached by
 *     their own parameters instead.
 */
import * as THREE from 'three';

const _box = new THREE.BoxGeometry(1, 1, 1);
const _cyl = new THREE.CylinderGeometry(1, 1, 1, 16);
const _sph = new THREE.SphereGeometry(1, 12, 8);

const _matCache = new Map();
const _geoCache = new Map();

/** A shared MeshStandardMaterial, keyed by its parameters. */
export function mat(params = {}) {
  const key = JSON.stringify(params);
  const hit = _matCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...params });
  _matCache.set(key, m);
  return m;
}

export function group(name, ...children) {
  const g = new THREE.Group();
  g.name = name;
  for (const c of children) if (c) g.add(c);
  return g;
}

export function box({ size, pos = [0, 0, 0], mat: material, rotX = 0, rotY = 0, rotZ = 0, name = '', cast = true }) {
  const m = new THREE.Mesh(_box, material);
  m.scale.set(size[0], size[1], size[2]);
  m.position.set(pos[0], pos[1], pos[2]);
  if (rotX) m.rotation.x = rotX;
  if (rotY) m.rotation.y = rotY;
  if (rotZ) m.rotation.z = rotZ;
  m.castShadow = cast;
  m.receiveShadow = false;
  if (name) m.name = name;
  return m;
}

export function cylinder({
  r, rTop, rBottom, h = 1, pos = [0, 0, 0], mat: material,
  rotX = 0, rotY = 0, rotZ = 0, name = '', seg = 16, cast = true,
}) {
  const rt = rTop ?? r ?? 0.1;
  const rb = rBottom ?? r ?? 0.1;
  let m;
  if (rt === rb && seg === 16) {
    m = new THREE.Mesh(_cyl, material);
    m.scale.set(rt, h, rt);
  } else {
    const key = `c${rt},${rb},${h},${seg}`;
    let geo = _geoCache.get(key);
    if (!geo) { geo = new THREE.CylinderGeometry(rt, rb, h, seg); _geoCache.set(key, geo); }
    m = new THREE.Mesh(geo, material);
  }
  m.position.set(pos[0], pos[1], pos[2]);
  if (rotX) m.rotation.x = rotX;
  if (rotY) m.rotation.y = rotY;
  if (rotZ) m.rotation.z = rotZ;
  m.castShadow = cast;
  m.receiveShadow = false;
  if (name) m.name = name;
  return m;
}

export function sphere({ r = 0.1, pos = [0, 0, 0], mat: material, name = '', cast = true }) {
  const m = new THREE.Mesh(_sph, material);
  m.scale.setScalar(r);
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = cast;
  m.receiveShadow = false;
  if (name) m.name = name;
  return m;
}

/**
 * A trigger guard, a sling loop, a bolt handle knob — anything bent round.
 *
 * `postRotX` is applied AFTER the euler, the way `Object3D.rotateX` does, not
 * folded into it. Every trigger guard in this project is built as
 * `rotation.set(PI/2, 0, PI)` followed by `rotateX(PI/2)`, which is not the
 * same orientation as any single euler triple — so the two-step is preserved
 * rather than "simplified" into something that faces the wrong way.
 */
export function torus({
  r = 0.02, tube = 0.004, arc = Math.PI, seg = 6, ring = 14,
  pos = [0, 0, 0], rot = [0, 0, 0], postRotX = 0, mat: material, name = '',
}) {
  const key = `t${r},${tube},${arc},${seg},${ring}`;
  let geo = _geoCache.get(key);
  if (!geo) { geo = new THREE.TorusGeometry(r, tube, seg, ring, arc); _geoCache.set(key, geo); }
  const m = new THREE.Mesh(geo, material);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  if (postRotX) m.rotateX(postRotX);
  m.castShadow = true;
  m.receiveShadow = false;
  if (name) m.name = name;
  return m;
}

/** The standard trigger guard orientation: a half torus, opening down. */
export const GUARD_ROT = Object.freeze({ rot: [Math.PI / 2, 0, Math.PI], postRotX: Math.PI / 2 });

/** How many meshes are in a built thing — used by the model tests. */
export function meshCount(object3d) {
  let n = 0;
  object3d.traverse((o) => { if (o.isMesh) n++; });
  return n;
}
