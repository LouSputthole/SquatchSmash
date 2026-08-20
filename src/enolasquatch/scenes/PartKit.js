/**
 * PartKit — arbitrary detail for a fixed, tiny number of draw calls.
 *
 * The problem this solves: Squatchbourg's landmarks are the thing that make an
 * aerial view read as a PLACE rather than as a scatter plot — the cathedral,
 * the gasholders, the marshalling yard, the dock cranes, the cooling towers —
 * and every one of them is a dozen boxes and cylinders. Built the obvious way,
 * as `THREE.Group`s of `THREE.Mesh`es, twenty landmarks is two hundred and
 * fifty draw calls on its own, which is more than the whole scene's budget.
 *
 * So a landmark here is not a group of meshes. It is a LIST OF PARTS — each one
 * a primitive, a transform and a colour — and every part in the city goes into
 * one of a handful of `THREE.InstancedMesh`es keyed by (shape, finish). Four
 * shapes and three finishes is at most twelve draw calls no matter how much
 * gets built, and in practice Squatchbourg's twenty-six landmarks — one hundred
 * and eighty-seven parts between them — come out at nine.
 *
 * Usage:
 *
 *   const kit = new PartKit();
 *   kit.box({ x, y, z, w, h, d, ry, colour, finish });   // collect
 *   kit.cyl({ x, y, z, r, h, colour });
 *   kit.mount(parent);                                    // build, once
 *
 * `mount()` sizes each InstancedMesh to exactly the number of parts collected
 * for it, so nothing is allocated that is not drawn. Parts are remembered in
 * order with their world position, which is what lets the detonation take them
 * away one shock-front radius at a time (`hide(handle)`).
 *
 * The geometries are UNIT sized and scaled per instance, so a cylinder scaled
 * unevenly is an elliptical cylinder and a sphere is an ellipsoid — which is
 * exactly what a gasholder, a cooling tower and a stadium bowl want anyway.
 */
import * as THREE from 'three';

const _dummy = new THREE.Object3D();
const _colour = new THREE.Color();
const _hidden = new THREE.Matrix4().makeScale(0.00001, 0.00001, 0.00001);
const _unitBounds = new THREE.Box3(
  new THREE.Vector3(-0.5, -0.5, -0.5),
  new THREE.Vector3(0.5, 0.5, 0.5),
);

/** The finishes a part can have. One material each, shared by every shape. */
const FINISHES = {
  matte: () => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.02 }),
  metal: () => new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.62 }),
  glow: () => new THREE.MeshBasicMaterial({ toneMapped: false }),
};

/** Unit primitives, built once per kit. */
function makeGeometry(shape) {
  switch (shape) {
    case 'box': return new THREE.BoxGeometry(1, 1, 1);
    case 'cyl': return new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    case 'cone': return new THREE.ConeGeometry(0.5, 1, 12);
    case 'sphere': return new THREE.SphereGeometry(0.5, 14, 10);
    default: throw new Error(`PartKit: unknown shape ${shape}`);
  }
}

export class PartKit {
  constructor(name = 'part-kit') {
    this.name = name;
    /** shape|finish -> array of part records, in insertion order. */
    this.buckets = new Map();
    /** shape|finish -> the InstancedMesh built for it. */
    this.meshes = new Map();
    this.mounted = false;
    this.activeAssemblyId = null;
  }

  /** How many parts have been collected in total. */
  get partCount() {
    let n = 0;
    for (const list of this.buckets.values()) n += list.length;
    return n;
  }

  /** How many draw calls this kit will cost once mounted. */
  get drawCalls() { return this.buckets.size; }

  /** Collect every part built by `build` under one logical landmark owner. */
  withAssembly(assemblyId, build) {
    const normalizedId = typeof assemblyId === 'string' ? assemblyId.trim() : '';
    if (!normalizedId) throw new TypeError('PartKit.withAssembly requires a stable non-empty ID');
    if (typeof build !== 'function') throw new TypeError('PartKit.withAssembly requires a builder');
    const previous = this.activeAssemblyId;
    this.activeAssemblyId = normalizedId;
    try {
      return build();
    } finally {
      this.activeAssemblyId = previous;
    }
  }

  _push(shape, finish, record) {
    const key = `${shape}|${finish}`;
    let list = this.buckets.get(key);
    if (!list) { list = []; this.buckets.set(key, list); }
    list.push({ ...record, assemblyId: this.activeAssemblyId });
    return { key, index: list.length - 1, x: record.x, z: record.z };
  }

  /**
   * @param {object} p { x, y, z, w, h, d, rx, ry, rz, colour, finish }
   * @returns {{key:string,index:number,x:number,z:number}} a handle, for `hide()`
   */
  box({ x = 0, y = 0, z = 0, w = 1, h = 1, d = 1, rx = 0, ry = 0, rz = 0, colour = 0x808080, finish = 'matte' }) {
    return this._push('box', finish, { x, y, z, sx: w, sy: h, sz: d, rx, ry, rz, colour });
  }

  /** A cylinder standing on its Y axis unless rotated. `r` may be `[rx, rz]`. */
  cyl({ x = 0, y = 0, z = 0, r = 1, h = 1, rx = 0, ry = 0, rz = 0, colour = 0x808080, finish = 'matte' }) {
    const [ax, az] = Array.isArray(r) ? r : [r, r];
    return this._push('cyl', finish, { x, y, z, sx: ax * 2, sy: h, sz: az * 2, rx, ry, rz, colour });
  }

  cone({ x = 0, y = 0, z = 0, r = 1, h = 1, rx = 0, ry = 0, rz = 0, colour = 0x808080, finish = 'matte' }) {
    return this._push('cone', finish, { x, y, z, sx: r * 2, sy: h, sz: r * 2, rx, ry, rz, colour });
  }

  sphere({ x = 0, y = 0, z = 0, r = 1, ry: yr = 1, colour = 0x808080, finish = 'matte' }) {
    return this._push('sphere', finish, { x, y, z, sx: r * 2, sy: yr * 2, sz: r * 2, rx: 0, ry: 0, rz: 0, colour });
  }

  /** Exact authored bounds for a set of handles before the kit is mounted. */
  boundsFor(handles) {
    const bounds = new THREE.Box3().makeEmpty();
    for (const handle of handles) {
      const part = this.buckets.get(handle?.key)?.[handle?.index];
      if (!part) throw new Error('PartKit.boundsFor received an unknown handle');
      _dummy.position.set(part.x, part.y, part.z);
      _dummy.rotation.set(part.rx, part.ry, part.rz);
      _dummy.scale.set(part.sx, part.sy, part.sz);
      _dummy.updateMatrix();
      bounds.union(_unitBounds.clone().applyMatrix4(_dummy.matrix));
    }
    if (bounds.isEmpty()) throw new Error('PartKit.boundsFor requires at least one part');
    return bounds;
  }

  /** Build every bucket into an InstancedMesh and add them to `parent`. */
  mount(parent) {
    if (this.mounted) return this;
    this.mounted = true;
    for (const [key, list] of this.buckets) {
      const [shape, finish] = key.split('|');
      const geo = makeGeometry(shape);
      const material = (FINISHES[finish] || FINISHES.matte)();
      const im = new THREE.InstancedMesh(geo, material, list.length);
      im.name = `${this.name}-${shape}-${finish}`;
      const assemblyIds = list.map(({ assemblyId }) => assemblyId);
      const hasAssemblyIds = assemblyIds.some(Boolean);
      if (hasAssemblyIds && assemblyIds.some((assemblyId) => !assemblyId)) {
        throw new Error(`PartKit ${this.name} bucket ${key} mixes owned and unowned parts`);
      }
      if (hasAssemblyIds) {
        im.userData.geometryGate = { instanceAssemblyIds: assemblyIds };
      }
      im.castShadow = false;
      im.receiveShadow = false;
      list.forEach((p, i) => {
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.rotation.set(p.rx, p.ry, p.rz);
        _dummy.scale.set(p.sx, p.sy, p.sz);
        _dummy.updateMatrix();
        im.setMatrixAt(i, _dummy.matrix);
        im.setColorAt(i, _colour.setHex(p.colour));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.meshes.set(key, im);
      parent.add(im);
    }
    return this;
  }

  /** Scale one part to nothing. Cheap enough to call per shock-front frame. */
  hide(handle) {
    if (!handle) return false;
    const im = this.meshes.get(handle.key);
    if (!im) return false;
    im.setMatrixAt(handle.index, _hidden);
    im.instanceMatrix.needsUpdate = true;
    return true;
  }

  /**
   * Put a hidden part back exactly where `mount()` put it.
   *
   * The undo for `hide()`, and the reason `mount()` keeps `buckets` rather than
   * throwing the part records away once the meshes are built: the record IS the
   * transform, so a restore recomputes the original matrix rather than trusting
   * a snapshot of it. Needed by `TargetCity.restore()` — a checkpoint restart
   * before the drop has to give the cathedral and the gasholders back, and the
   * landmarks are the one part of the city that goes away through this class.
   *
   * @param {?{key:string,index:number}} handle the handle `box`/`cyl`/… returned
   * @returns {boolean} whether a part was actually put back
   */
  show(handle) {
    if (!handle) return false;
    const im = this.meshes.get(handle.key);
    const p = this.buckets.get(handle.key)?.[handle.index];
    if (!im || !p) return false;
    _dummy.position.set(p.x, p.y, p.z);
    _dummy.rotation.set(p.rx, p.ry, p.rz);
    _dummy.scale.set(p.sx, p.sy, p.sz);
    _dummy.updateMatrix();
    im.setMatrixAt(handle.index, _dummy.matrix);
    im.instanceMatrix.needsUpdate = true;
    return true;
  }

  dispose() {
    for (const im of this.meshes.values()) {
      im.parent?.remove(im);
      im.geometry.dispose();
      im.material.dispose();
    }
    this.meshes.clear();
    this.buckets.clear();
  }
}
