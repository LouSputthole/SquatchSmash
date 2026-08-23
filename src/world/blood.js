/**
 * Shared blood left by a real hit.
 *
 * Three effects deliberately live behind three interfaces:
 *
 * - BloodImpactSystem puts a pooled wound at the ray's world-space hit point
 *   and reparents it to a caller-supplied, uniformly-scaled body anchor. The
 *   mark therefore follows the body through a fall without inheriting the
 *   shear of a scaled torso mesh.
 * - BloodSpurtSystem throws droplets into the air off that wound and reports
 *   where each one comes down.
 * - DeathBloodPool owns bounded floor pools. A floor point is not a wound
 *   point, so callers must provide the floor height instead of quietly
 *   dropping a chest-height decal onto whatever plane happens to be nearby.
 *
 * The visual vocabulary comes from the two implementations that already
 * worked: Silver Case's attached BulletHoles and Silent Squatch's slowly
 * spreading, irregular floor stain. Scene code supplies hit ownership,
 * damage and death rules; this module supplies only the reusable evidence.
 *
 * The ring, the projection, the recycling rule and the spread-and-fade clock
 * are `world/decals.js` now -- the same foundation `world/bullets.js` stands
 * on. This file used to reach them by constructing two BulletHoles pools and
 * then deleting the muzzle light it never wanted; what is left here is what
 * is actually about blood.
 */
import * as THREE from 'three';
import {
  DecalPool,
  FLOOR_DECAL_LIFT,
  decalDirection,
  decalTexture,
  finiteVector,
  layOnFloor,
  poolMeshes,
  seededRandom,
  woundDecalOptions,
} from './decals.js';

export const BLOOD_MARK_NAME = 'blood.impact';
export const BLOOD_SPATTER_NAME = 'blood.spatter';
export const BLOOD_POOL_NAME = 'blood.death-pool';
export const BLOOD_SPURT_NAME = 'blood.spurt';

const DEFAULT_CAPACITY = 12;
const DEFAULT_GROWTH_SECONDS = 1 / 0.85;

/**
 * Marks per wound pool.
 *
 * The number a revolver's cylinder set, kept because it is also about right
 * for a body: past eight, a man's next wound recycles his first, which is a
 * cheaper failure than a torso wearing thirty quads.
 */
const WOUND_CAPACITY = 8;

const _low = new THREE.Vector3();
const _facing = new THREE.Vector3();

/** Irregular, alpha-cut floor stain; the same seed always paints the same pool. */
function stainTexture(seed = 1) {
  const key = Math.trunc(seed) || 1;
  return decalTexture(`blood.stain.${key}`, (g) => {
    const random = seededRandom(key);
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
  });
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
    /* Two rings rather than one, so a second hit on the same man cannot push
     * his own first wound off him to make room for its spatter. */
    this.wounds = new DecalPool(scene, {
      capacity: WOUND_CAPACITY, random, ...woundDecalOptions(),
    });
    this.spatter = new DecalPool(scene, {
      capacity: WOUND_CAPACITY, random, ...woundDecalOptions(),
    });
    this._marks = new Map();
  }

  /** Transfer one recycled mesh into exactly one bounded ownership ledger. */
  _claim(mark, actor) {
    const previous = mark.userData.hitOwner;
    if (previous && previous !== actor) {
      const oldMarks = this._marks.get(previous);
      oldMarks?.delete(mark);
      if (oldMarks?.size === 0) this._marks.delete(previous);
    }
    const marks = this._marks.get(actor) ?? new Set();
    marks.add(mark);
    this._marks.set(actor, marks);
    mark.userData.hitOwner = actor;
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
    const facing = decalDirection({ point, normal, from }, _facing);
    const wound = this.wounds.placeOn(anchor, point, facing);
    wound.name = BLOOD_MARK_NAME;
    wound.userData.reusableSystem = 'blood';
    wound.userData.bloodEffect = 'impact';
    this._claim(wound, actor);

    let secondary = null;
    if (spatter) {
      if (!spatterAnchor?.isObject3D) {
        throw new TypeError('BloodImpactSystem.hit requires a spatter anchor when spatter is enabled');
      }
      const low = _low.copy(point);
      low.x += (this.random() - 0.5) * 0.22;
      low.y -= 0.26 + this.random() * 0.12;
      low.z += (this.random() - 0.5) * 0.22;
      secondary = this.spatter.placeOn(spatterAnchor, low, facing);
      secondary.name = BLOOD_SPATTER_NAME;
      secondary.userData.reusableSystem = 'blood';
      secondary.userData.bloodEffect = 'spatter';
      this._claim(secondary, actor);
    }
    return { wound, spatter: secondary };
  }

  marksFor(actor) {
    return [...(this._marks.get(actor) ?? [])].filter(
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
      /* A bounded pool may have recycled this mesh for a later actor. The old
       * owner's ledger still remembers the object, but it no longer owns the
       * mark and must not be able to hide somebody else's. */
      if (mark.userData.hitOwner !== actor) continue;
      if (mark.parent !== this.scene) this.scene.attach(mark);
      mark.visible = false;
      delete mark.userData.hitOwner;
    }
    this._marks.delete(actor);
    return true;
  }

  /* Wounds do not age -- a hit does not stop having happened -- but every
   * scene drives its blood the same way, and a pool owns whatever clock it
   * has rather than making the caller know which ones have none. */
  update(dt) {
    this.wounds.update(dt);
    this.spatter.update(dt);
  }

  reset() {
    for (const mark of [...this.wounds.pool, ...this.spatter.pool]) {
      delete mark.userData.hitOwner;
    }
    this.wounds.reset();
    this.spatter.reset();
    this._marks.clear();
  }
}

/**
 * Airborne arterial spurts: pooled droplets thrown INTO THE AIR off a wound
 * and pulled back down by gravity until they cross an explicit floor height.
 *
 * The other two systems are decals -- evidence that a hit already happened.
 * This one is the hit itself, mid-air, which neither of them could fake:
 * an attached mark cannot arc across a room and a floor pool never leaves
 * it. That is also why it does not sit on DecalPool: nothing about a lift, a
 * surface normal or a spreading stain applies to a droplet. It shares the
 * ring's construction and the same contracts -- bounded pool, injected
 * `random` for deterministic tests, explicit `floorY` because a droplet does
 * not know which surface it is falling toward, and zero per-frame allocations
 * -- because every droplet's state lives in a preallocated entry.
 */
export class BloodSpurtSystem {
  constructor(scene, {
    capacity = 48,
    gravity = 9.8,
    random = Math.random,
  } = {}) {
    if (!scene?.add) throw new TypeError('BloodSpurtSystem requires a scene or parent Group');
    this.scene = scene;
    this.capacity = Math.max(1, Math.trunc(capacity) || 48);
    this.gravity = Math.max(0.1, Number(gravity) || 9.8);
    this.random = random;
    this._next = 0;
    this._entries = poolMeshes(scene, {
      count: this.capacity,
      geometry: new THREE.SphereGeometry(1, 5, 4),
      material: new THREE.MeshBasicMaterial({ color: 0x6e1010 }),
      name: BLOOD_SPURT_NAME,
      userData: { reusableSystem: 'blood', bloodEffect: 'spurt' },
    }).map((mesh) => ({
      mesh, vx: 0, vy: 0, vz: 0, floorY: 0, onLand: null, active: false,
    }));
  }

  /**
   * Throw one burst of droplets off a wound.
   *
   * @param {THREE.Vector3} point world-space wound point the spurt leaves
   * @param {THREE.Vector3} direction rough away-from-the-body direction; the
   *   upward arc is added here, so callers pass the wound normal, not "up"
   * @param {object} [options]
   * @param {number} [options.count=10] droplets in this burst (pool-bounded)
   * @param {number} [options.speed=2.6] outward speed in m/s
   * @param {number} [options.upward=2.4] extra vertical throw in m/s
   * @param {number} [options.floorY=0] explicit landing height
   * @param {(x: number, z: number) => void} [options.onLand] told where each
   *   droplet comes down, so the caller can put a splatter decal there
   */
  burst(point, direction, {
    count = 10,
    speed = 2.6,
    upward = 2.4,
    floorY = 0,
    onLand = null,
  } = {}) {
    if (!finiteVector(point)) throw new TypeError('BloodSpurtSystem.burst requires a world point');
    const out = decalDirection({ point, normal: direction }, _facing);
    const droplets = Math.max(1, Math.trunc(count) || 1);
    let launched = 0;
    for (let i = 0; i < droplets && i < this.capacity; i++) {
      const entry = this._entries[this._next];
      this._next = (this._next + 1) % this._entries.length;
      const jitterX = (this.random() - 0.5) * 1.4;
      const jitterZ = (this.random() - 0.5) * 1.4;
      const pace = speed * (0.55 + this.random() * 0.75);
      entry.vx = out.x * pace + jitterX;
      entry.vy = upward * (0.6 + this.random() * 0.8);
      entry.vz = out.z * pace + jitterZ;
      entry.floorY = Number.isFinite(floorY) ? floorY : 0;
      entry.onLand = onLand;
      entry.active = true;
      const size = 0.014 + this.random() * 0.022;
      entry.mesh.scale.set(size, size, size);
      entry.mesh.position.copy(point);
      entry.mesh.visible = true;
      launched += 1;
    }
    return launched;
  }

  update(dt) {
    const step = Math.max(0, Number(dt) || 0);
    if (step === 0) return;
    for (const entry of this._entries) {
      if (!entry.active) continue;
      entry.vy -= this.gravity * step;
      const { position } = entry.mesh;
      position.x += entry.vx * step;
      position.y += entry.vy * step;
      position.z += entry.vz * step;
      /* A droplet only lands on the way DOWN: a burst may start below its
       * own floor plane for a frame while it is still being thrown upward. */
      if (entry.vy < 0 && position.y <= entry.floorY) {
        entry.active = false;
        entry.mesh.visible = false;
        entry.onLand?.(position.x, position.z);
        entry.onLand = null;
      }
    }
  }

  get airborneCount() {
    return this._entries.filter((entry) => entry.active).length;
  }

  reset() {
    for (const entry of this._entries) {
      entry.active = false;
      entry.onLand = null;
      entry.mesh.visible = false;
    }
    this._next = 0;
  }
}

/** Bounded, slowly spreading pools placed on an explicit floor surface. */
export class DeathBloodPool extends DecalPool {
  constructor(scene, {
    capacity = DEFAULT_CAPACITY,
    growthSeconds = DEFAULT_GROWTH_SECONDS,
    random = Math.random,
  } = {}) {
    if (!scene?.add) throw new TypeError('DeathBloodPool requires a scene or parent Group');
    super(scene, {
      capacity: Math.max(1, Math.trunc(capacity) || DEFAULT_CAPACITY),
      growthSeconds: Math.max(0.001, Number(growthSeconds) || DEFAULT_GROWTH_SECONDS),
      random,
      /* A unit quad, scaled to the stain's final size as it spreads. */
      size: 1,
      lift: FLOOR_DECAL_LIFT,
      renderOrder: 3,
      name: BLOOD_POOL_NAME,
      userData: { reusableSystem: 'blood', bloodEffect: 'death-pool' },
      /* A material EACH, unlike the wound rings: scenes tint, light and dull
       * individual stains -- the Siege lifts every one of them out of mansion
       * walnut and gives Eric's a dark absorbent underlay -- and one shared
       * material would put one man's blood treatment on everybody. */
      material: (index) => new THREE.MeshStandardMaterial({
        map: stainTexture(index + 1),
        transparent: true,
        opacity: 0,
        roughness: 0.6,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    });
  }

  /** The stains themselves, for prewarm lists and scenes that dress one. */
  get meshes() {
    return this.pool;
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
    const entry = this.claim();
    const { mesh } = entry;
    /* The cursor has already moved on, so an unseeded spill takes the NEXT
     * slot's number: a wrapped, bounded value, which is what keeps the stain
     * texture cache from painting a fresh canvas for every death in a run. */
    const textureSeed = seed ?? this.next;

    mesh.material.map = stainTexture(textureSeed);
    mesh.material.needsUpdate = true;
    layOnFloor(mesh, point, floorY, {
      lift: this.lift,
      spin: (seed === null ? this.random() : seededRandom(seed)()) * Math.PI * 2,
    });
    this.spread(entry, {
      size: Math.max(0.05, Number(size) || 0.62),
      opacity: Math.max(0, Math.min(1, Number(opacity) || 0)),
      delay: Math.max(0, Number(delay) || 0),
    });
    mesh.visible = true;
    mesh.userData.seed = textureSeed;
    return mesh;
  }
}
