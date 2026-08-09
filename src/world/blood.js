/**
 * Shared blood left by a real hit.
 *
 * Two effects deliberately live behind two interfaces:
 *
 * - BloodImpactSystem puts a pooled wound at the ray's world-space hit point
 *   and reparents it to a caller-supplied, uniformly-scaled body anchor. The
 *   mark therefore follows the body through a fall without inheriting the
 *   shear of a scaled torso mesh.
 * - DeathBloodPool owns bounded floor pools. A floor point is not a wound
 *   point, so callers must provide the floor height instead of quietly
 *   dropping a chest-height decal onto whatever plane happens to be nearby.
 *
 * The visual vocabulary comes from the two implementations that already
 * worked: Silver Case's attached BulletHoles and Silent Squatch's slowly
 * spreading, irregular floor stain. Scene code supplies hit ownership,
 * damage and death rules; this module supplies only the reusable evidence.
 */
import * as THREE from 'three';
import { BulletHoles } from './bullets.js';

export const BLOOD_MARK_NAME = 'blood.impact';
export const BLOOD_SPATTER_NAME = 'blood.spatter';
export const BLOOD_POOL_NAME = 'blood.death-pool';

const FLOOR_LIFT = 0.006;
const DEFAULT_CAPACITY = 12;
const DEFAULT_GROWTH_SECONDS = 1 / 0.85;

const _v = new THREE.Vector3();
const _textures = new Map();

function finiteVector(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function directionFor({ point, normal, from }) {
  if (finiteVector(normal) && normal.lengthSq() > 1e-8) return normal.clone().normalize();
  if (finiteVector(from)) {
    const toward = from.clone().sub(point);
    if (toward.lengthSq() > 1e-8) return toward.normalize();
  }
  return new THREE.Vector3(0, 0, 1);
}

/** Small deterministic generator used only to paint one stain texture. */
function seeded(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Irregular, alpha-cut floor stain; the same seed always paints the same pool. */
function poolTexture(seed = 1) {
  const key = Math.trunc(seed) || 1;
  const cached = _textures.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const random = seeded(key);
  g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(${40 + random() * 30 | 0},${8 + random() * 8 | 0},${10 + random() * 8 | 0},${0.22 + random() * 0.5})`;
    g.beginPath();
    g.ellipse(
      64 + (random() - 0.5) * 74,
      64 + (random() - 0.5) * 74,
      6 + random() * 34,
      5 + random() * 30,
      random() * 3,
      0,
      Math.PI * 2,
    );
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  _textures.set(key, texture);
  return texture;
}

function discardUnusedFlash(holes) {
  holes.flash?.parent?.remove(holes.flash);
  holes.flash.visible = false;
  holes.flash.intensity = 0;
}

/**
 * Pooled entry wounds and body spatter at explicit ray hit points.
 *
 * The caller owns actor lookup and chooses the attachment anchor. `anchor`
 * must be a plain/uniformly-scaled Group such as a figure's head or body,
 * never the non-uniformly-scaled box mesh the ray happened to hit.
 */
export class BloodImpactSystem {
  constructor(scene, { random = Math.random } = {}) {
    this.scene = scene;
    this.random = random;
    this.wounds = new BulletHoles(scene, 'blood');
    this.spatter = new BulletHoles(scene, 'blood');
    discardUnusedFlash(this.wounds);
    discardUnusedFlash(this.spatter);
    this._marks = new Map();
  }

  /**
   * Mark one real body hit.
   *
   * @param {object} hit
   * @param {*} hit.actor stable owner used by marksOn/clearActor
   * @param {THREE.Object3D} hit.anchor uniformly-scaled body/head Group
   * @param {THREE.Vector3} hit.point exact world-space ray intersection
   * @param {THREE.Vector3} [hit.normal] direction the decal faces
   * @param {THREE.Vector3} [hit.from] shooter origin; used when normal omitted
   * @param {boolean} [hit.spatter=true] add the lower secondary mark
   * @param {THREE.Object3D} [hit.spatterAnchor=anchor]
   */
  hit({ actor, anchor, point, normal = null, from = null, spatter = true, spatterAnchor = anchor } = {}) {
    if (!actor) throw new TypeError('BloodImpactSystem.hit requires an actor owner');
    if (!anchor?.isObject3D) throw new TypeError('BloodImpactSystem.hit requires a body anchor');
    if (!finiteVector(point)) throw new TypeError('BloodImpactSystem.hit requires the ray hit point');
    const facing = directionFor({ point, normal, from });
    const marks = this._marks.get(actor) ?? [];

    const wound = this.wounds.punchAttached(anchor, point, facing);
    wound.name = BLOOD_MARK_NAME;
    wound.userData.reusableSystem = 'blood';
    wound.userData.bloodEffect = 'impact';
    wound.userData.hitOwner = actor;
    marks.push(wound);

    let secondary = null;
    if (spatter) {
      if (!spatterAnchor?.isObject3D) {
        throw new TypeError('BloodImpactSystem.hit requires a spatter anchor when spatter is enabled');
      }
      const low = _v.copy(point);
      low.x += (this.random() - 0.5) * 0.22;
      low.y -= 0.26 + this.random() * 0.12;
      low.z += (this.random() - 0.5) * 0.22;
      secondary = this.spatter.punchAttached(spatterAnchor, low, facing);
      secondary.name = BLOOD_SPATTER_NAME;
      secondary.userData.reusableSystem = 'blood';
      secondary.userData.bloodEffect = 'spatter';
      secondary.userData.hitOwner = actor;
      marks.push(secondary);
    }
    this._marks.set(actor, marks);
    return { wound, spatter: secondary };
  }

  marksFor(actor) {
    return (this._marks.get(actor) ?? []).filter(
      (mark) => mark.visible && mark.userData.hitOwner === actor,
    );
  }

  marksOn(actor) {
    return this.marksFor(actor).length;
  }

  clearActor(actor) {
    const marks = this._marks.get(actor);
    if (!marks) return false;
    for (const mark of marks) {
      /* A bounded BulletHoles pool may have recycled this mesh for a later
       * actor. The old owner's ledger still remembers the object, but it no
       * longer owns the mark and must not be able to hide somebody else's. */
      if (mark.userData.hitOwner !== actor) continue;
      if (mark.parent !== this.scene) this.scene.attach(mark);
      mark.visible = false;
      delete mark.userData.hitOwner;
    }
    this._marks.delete(actor);
    return true;
  }

  update(dt) {
    this.wounds.update(dt);
    this.spatter.update(dt);
  }

  reset() {
    this.wounds.reset();
    this.spatter.reset();
    this._marks.clear();
  }
}

/** Bounded, slowly spreading pools placed on an explicit floor surface. */
export class DeathBloodPool {
  constructor(scene, {
    capacity = DEFAULT_CAPACITY,
    growthSeconds = DEFAULT_GROWTH_SECONDS,
    random = Math.random,
  } = {}) {
    if (!scene?.add) throw new TypeError('DeathBloodPool requires a scene or parent Group');
    this.scene = scene;
    this.capacity = Math.max(1, Math.trunc(capacity) || DEFAULT_CAPACITY);
    this.growthSeconds = Math.max(0.001, Number(growthSeconds) || DEFAULT_GROWTH_SECONDS);
    this.random = random;
    this.meshes = [];
    this._entries = [];
    this._next = 0;

    const geometry = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < this.capacity; i++) {
      const material = new THREE.MeshStandardMaterial({
        map: poolTexture(i + 1),
        transparent: true,
        opacity: 0,
        roughness: 0.6,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${BLOOD_POOL_NAME}.${String(i + 1).padStart(2, '0')}`;
      mesh.userData.reusableSystem = 'blood';
      mesh.userData.bloodEffect = 'death-pool';
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 3;
      scene.add(mesh);
      this.meshes.push(mesh);
      this._entries.push({ mesh, elapsed: 0, delay: 0, size: 0.62, opacity: 0.88 });
    }
  }

  /**
   * Start one floor pool. `point.x/z` select the body; `floorY` selects the
   * surface. Keeping those separate prevents a chest-height death decal.
   */
  spill(point, {
    floorY,
    size = 0.62,
    opacity = 0.88,
    delay = 0,
    seed = null,
  } = {}) {
    if (!finiteVector(point)) throw new TypeError('DeathBloodPool.spill requires a world point');
    if (!Number.isFinite(floorY)) throw new TypeError('DeathBloodPool.spill requires an explicit floorY');
    const entry = this._entries[this._next];
    this._next = (this._next + 1) % this._entries.length;
    const { mesh } = entry;
    const finalSize = Math.max(0.05, Number(size) || 0.62);
    const targetOpacity = Math.max(0, Math.min(1, Number(opacity) || 0));
    const textureSeed = seed ?? this._next;

    mesh.material.map = poolTexture(textureSeed);
    mesh.material.needsUpdate = true;
    mesh.material.opacity = 0;
    mesh.position.set(point.x, floorY + FLOOR_LIFT, point.z);
    mesh.rotation.z = (seed === null ? this.random() : seeded(seed)()) * Math.PI * 2;
    mesh.scale.set(finalSize * 0.55, finalSize * 0.55, 1);
    mesh.visible = true;
    mesh.userData.seed = textureSeed;
    entry.elapsed = 0;
    entry.delay = Math.max(0, Number(delay) || 0);
    entry.size = finalSize;
    entry.opacity = targetOpacity;
    return mesh;
  }

  update(dt) {
    const step = Math.max(0, Number(dt) || 0);
    for (const entry of this._entries) {
      if (!entry.mesh.visible) continue;
      if (entry.delay > 0) {
        entry.delay = Math.max(0, entry.delay - step);
        if (entry.delay > 0) continue;
      }
      entry.elapsed = Math.min(this.growthSeconds, entry.elapsed + step);
      const progress = entry.elapsed / this.growthSeconds;
      entry.mesh.material.opacity = progress * entry.opacity;
      const scale = entry.size * (0.55 + progress * 0.45);
      entry.mesh.scale.set(scale, scale, 1);
    }
  }

  get visibleCount() {
    return this.meshes.filter((mesh) => mesh.visible).length;
  }

  reset() {
    for (const entry of this._entries) {
      entry.mesh.visible = false;
      entry.mesh.material.opacity = 0;
      entry.elapsed = 0;
      entry.delay = 0;
    }
    this._next = 0;
  }
}
