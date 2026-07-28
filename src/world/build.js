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
  return m;
}

export function sphere(o) {
  const m = new THREE.Mesh(_sph, o.mat);
  const r = o.r ?? 0.1;
  m.scale.set(r, o.ry ?? r, o.rz ?? r);
  m.position.set(o.pos[0], o.pos[1], o.pos[2]);
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  return m;
}

/** Flat quad, useful for screens, pictures and light spill decals. */
export function plane(w, h, mat) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

export function mat(params) {
  return new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0, ...params });
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
