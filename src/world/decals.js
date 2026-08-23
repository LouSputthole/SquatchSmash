/**
 * One pooled mark, for everything in the game that leaves one.
 *
 * There were two of these, and each was better than the other at exactly the
 * things it had been forced to get right.
 *
 * `world/bullets.js` grew up in the Squatchfather's restaurant: quads laid
 * flat against whatever was shot and ORIENTED TO THE SURFACE NORMAL, with the
 * lookAt sign worked out, the recycling rule that puts a mark taken off a
 * falling body back into world space before anything writes world coordinates
 * into it, and a lift plus polygonOffset pair that survives a glancing angle.
 * What it did not have was a capacity you could ask for, an injected `random`,
 * or any idea that a mark might age.
 *
 * `world/blood.js` grew up in the Mansion and the lab: bounded capacity with
 * the argument clamped rather than trusted, `random` injected so a test can
 * pin a spatter, floors named by the caller instead of guessed at, userData
 * tagging so tooling can tell a man from what was done to him, and a stain
 * that spreads and fades in rather than appearing. It got all of that by
 * building ON TOP of the other one -- constructing two BulletHoles pools and
 * then deleting the muzzle light it never wanted.
 *
 * This is the half both of them were writing separately:
 *
 * - THE RING. A fixed number of meshes, a cursor that wraps, and the
 *   world-space rule above.
 * - PROJECTION. Facing a mark out of a surface, or laying it flat on a floor
 *   height the caller named. Two problems, each solved once here rather than
 *   once per module with different lifts.
 * - AGEING. Delay, then spread and fade in. Only floor stains use it, but it
 *   is the pool's clock, not the pool's subject.
 *
 * What is NOT here is what a mark MEANS: whose body it is on, whether a hole
 * in plaster is worth a light, how much blood a man has left. Those questions
 * belong to `bullets.js` and `blood.js`, which stay thin over this.
 */
import * as THREE from 'three';

/** How far off a surface a mark floats, to beat z-fighting. */
export const DECAL_LIFT = 0.004;

/**
 * The same job on a floor, and a bigger number: a floor stain is a metre
 * across and shares its plane with rugs, thresholds and marble borders rather
 * than with one flat wall.
 */
export const FLOOR_DECAL_LIFT = 0.006;

/** Every decal in the game is painted at this size. */
const TEXTURE_SIZE = 128;

const _look = new THREE.Vector3();
const _textures = new Map();

export function finiteVector(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

/**
 * Which way a mark faces, written into `target` so a hit costs no allocation.
 *
 * The surface normal when there is one; otherwise back along the line the
 * round came in on, because a wound whose normal was never captured still
 * has to face the man who fired. A degenerate input faces +Z rather than
 * producing the NaN quaternion a zero-length lookAt gives.
 */
export function decalDirection({ point, normal = null, from = null }, target = new THREE.Vector3()) {
  if (finiteVector(normal) && normal.lengthSq() > 1e-8) return target.copy(normal).normalize();
  if (finiteVector(from) && finiteVector(point)) {
    target.copy(from).sub(point);
    if (target.lengthSq() > 1e-8) return target.normalize();
  }
  return target.set(0, 0, 1);
}

/** Small deterministic generator used only to paint one texture. */
export function seededRandom(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * A painted decal texture, kept.
 *
 * Keyed by the caller, so a fixed skin -- the hole, the wound -- paints once
 * for the run, and a seeded family of stains gets one entry per seed and the
 * same seed always paints the same stain. Painting a 128px canvas is cheap
 * once and ruinous per mark.
 */
export function decalTexture(key, paint) {
  const cached = _textures.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  paint(canvas.getContext('2d'), TEXTURE_SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  _textures.set(key, texture);
  return texture;
}

/**
 * The meshes of one ring, built once, hidden, and parked in the scene.
 *
 * `material` may be one instance shared by the whole ring or a factory called
 * per index, because the two cases are genuinely different: eight bullet
 * holes are eight draws of one material, while a floor stain gets its own so
 * a scene can tint, light or dull one man's blood without touching anybody
 * else's.
 */
export function poolMeshes(scene, {
  count,
  geometry,
  material,
  name = '',
  renderOrder = 0,
  userData = null,
} = {}) {
  const meshes = [];
  for (let index = 0; index < count; index++) {
    const mesh = new THREE.Mesh(
      geometry,
      typeof material === 'function' ? material(index) : material,
    );
    if (name) mesh.name = `${name}.${String(index + 1).padStart(2, '0')}`;
    if (userData) Object.assign(mesh.userData, userData);
    mesh.renderOrder = renderOrder;
    mesh.visible = false;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

/**
 * Face one mark out of the surface it is on.
 *
 * lookAt orients -Z at the target and a plane's face is +Z, so the aim point
 * is OUT from the surface rather than at the surface itself -- otherwise
 * every mark is drawn facing into the wall.
 */
export function faceAlongNormal(mesh, point, normal, { lift = DECAL_LIFT, roll = 0 } = {}) {
  mesh.position.copy(point).addScaledVector(normal, lift);
  mesh.lookAt(_look.copy(point).addScaledVector(normal, 1));
  if (roll) mesh.rotateZ(roll);
  return mesh;
}

/**
 * Lay one mark flat on a floor the CALLER named.
 *
 * `point.x/z` choose where on the floor; `floorY` chooses the floor. A wound
 * point is not a floor point, and a system that guesses the difference drops
 * a chest-height stain onto whatever plane happens to be nearby.
 */
export function layOnFloor(mesh, point, floorY, { lift = FLOOR_DECAL_LIFT, spin = 0 } = {}) {
  mesh.position.set(point.x, floorY + lift, point.z);
  mesh.rotation.set(-Math.PI / 2, 0, spin);
  return mesh;
}

/**
 * A bounded ring of marks in one scene.
 *
 * The pool never allocates after construction: past `capacity`, the oldest
 * mark is recycled where it stands. That is a decision, not a limitation --
 * an unbounded decal system is an unbounded draw call count in a firefight,
 * and every scene in this game has a decal budget it can name.
 */
export class DecalPool {
  constructor(scene, {
    capacity = 8,
    size = 1,
    geometry = null,
    material = null,
    lift = DECAL_LIFT,
    renderOrder = 3,
    name = '',
    userData = null,
    random = Math.random,
    growthSeconds = 0,
    spreadFrom = 0.55,
  } = {}) {
    if (!scene?.add) throw new TypeError('DecalPool requires a scene or parent Group');
    this.scene = scene;
    this.capacity = Math.max(1, Math.trunc(Number(capacity)) || 1);
    this.lift = Number.isFinite(lift) ? lift : DECAL_LIFT;
    this.random = typeof random === 'function' ? random : Math.random;
    this.growthSeconds = Math.max(0, Number(growthSeconds) || 0);
    this.spreadFrom = Math.max(0, Math.min(1, Number(spreadFrom) || 0));
    /* One geometry for the whole ring. Every mark is the same quad at a
     * different transform, and eight identical PlaneGeometries was eight
     * uploads for one shape. */
    this.geometry = geometry ?? new THREE.PlaneGeometry(size, size);
    this.pool = poolMeshes(scene, {
      count: this.capacity,
      geometry: this.geometry,
      material,
      name,
      renderOrder,
      userData,
    });
    /* Ageing state lives beside the mesh rather than on it: a mark's userData
     * belongs to whoever put it there (an owner id, a seed, a scene's own
     * tag) and survives recycling, which per-frame numbers must not. */
    this.entries = this.pool.map((mesh) => ({
      mesh, elapsed: 0, delay: 0, size: 1, opacity: 1,
    }));
    this.next = 0;
  }

  /** The next mark in the ring, back in world space and ready to be placed. */
  claim() {
    const entry = this.entries[this.next];
    this.next = (this.next + 1) % this.entries.length;
    /* A pooled mark may have been attached to a falling character on its
     * previous use. Put it back in world space BEFORE writing world-space
     * coordinates into it. */
    if (entry.mesh.parent !== this.scene) this.scene.attach(entry.mesh);
    entry.elapsed = 0;
    entry.delay = 0;
    return entry;
  }

  /** Put one mark on a surface, facing out of it. */
  place(point, normal) {
    const { mesh } = this.claim();
    faceAlongNormal(mesh, point, normal, {
      lift: this.lift,
      roll: this.random() * Math.PI * 2,
    });
    const size = 0.85 + this.random() * 0.4;
    mesh.scale.set(size, size, 1);
    mesh.visible = true;
    return mesh;
  }

  /** The same mark, on a moving actor, so it follows their fall, not the room. */
  placeOn(parent, point, normal) {
    const mesh = this.place(point, normal);
    parent.attach(mesh);
    return mesh;
  }

  /**
   * Start one claimed mark spreading: it opens at `spreadFrom` of its final
   * size, fully transparent, and `update` carries it the rest of the way.
   */
  spread(entry, { size = 1, opacity = 1, delay = 0 } = {}) {
    entry.size = size;
    entry.opacity = opacity;
    entry.delay = delay;
    entry.elapsed = 0;
    entry.mesh.material.opacity = 0;
    const start = size * this.spreadFrom;
    entry.mesh.scale.set(start, start, 1);
    return entry.mesh;
  }

  /**
   * The pool's own clock: wait out the delay, then spread and fade in. A pool
   * that does neither -- a hole in plaster is the same hole a minute later --
   * leaves on the first line.
   */
  update(dt) {
    if (this.growthSeconds <= 0) return;
    const step = Math.max(0, Number(dt) || 0);
    for (const entry of this.entries) {
      if (!entry.mesh.visible) continue;
      if (entry.delay > 0) {
        entry.delay = Math.max(0, entry.delay - step);
        if (entry.delay > 0) continue;
      }
      entry.elapsed = Math.min(this.growthSeconds, entry.elapsed + step);
      const progress = entry.elapsed / this.growthSeconds;
      entry.mesh.material.opacity = progress * entry.opacity;
      const scale = entry.size * (this.spreadFrom + progress * (1 - this.spreadFrom));
      entry.mesh.scale.set(scale, scale, 1);
    }
  }

  get visibleCount() {
    return this.pool.filter((mesh) => mesh.visible).length;
  }

  /** Wipe the marks, for a fresh run. */
  reset() {
    for (const entry of this.entries) {
      if (entry.mesh.parent !== this.scene) this.scene.attach(entry.mesh);
      entry.mesh.visible = false;
      entry.elapsed = 0;
      entry.delay = 0;
      /* Only a pool that fades in owns its material's opacity. A ring of
       * holes shares one opaque material, and zeroing it here would wipe
       * every hole the rest of the run leaves too. */
      if (this.growthSeconds > 0) entry.mesh.material.opacity = 0;
    }
    this.next = 0;
  }
}

/**
 * The wound skin: dark centre, bright arterial edge, a scatter of droplets.
 *
 * It is HERE, in the shared file, because two systems put blood on people --
 * BloodImpactSystem's attached wounds, and the `blood` flavour of BulletHoles
 * that the Silver Case and the Squatchfather still punch by hand -- and a
 * second painting of the same wound is precisely the drift this module exists
 * to stop. The hole stays in bullets.js: nothing else in the game shoots
 * plaster.
 */
export function woundTexture() {
  return decalTexture('decal.wound', (g, S) => {
    const core = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S * 0.30);
    /* These sit on dark suits in a dim restaurant. The old near-black centre
     * and five-centimetre visible core read as no wound at all during the fall. */
    core.addColorStop(0, 'rgba(105,0,6,1)');
    core.addColorStop(0.52, 'rgba(188,10,18,0.96)');
    core.addColorStop(1, 'rgba(224,24,28,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, S, S);

    // Droplets thrown out from the centre, heavier on one side.
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + (i % 5) * 0.21;
      const d = S * (0.18 + ((i * 11) % 7) / 24);
      const r = 1.2 + ((i * 5) % 4);
      g.fillStyle = `rgba(${146 + (i % 3) * 22},8,12,${0.62 + (i % 3) * 0.14})`;
      g.beginPath();
      g.arc(S / 2 + Math.cos(a) * d * (i % 2 ? 1 : 0.6), S / 2 + Math.sin(a) * d, r, 0, 7);
      g.fill();
    }
  });
}

/**
 * Pool options for wounds, so both wound users agree on the size, the render
 * order and the two material decisions underneath them.
 *
 * A fresh material per pool, not one shared instance: a scene that tints its
 * own wounds must not tint everybody's.
 */
export function woundDecalOptions() {
  return {
    size: 0.31,
    renderOrder: 4,
    material: new THREE.MeshBasicMaterial({
      map: woundTexture(),
      transparent: true,
      depthWrite: false,
      /* A wound starts facing Tony, then the actor falls and may roll the
       * plane through its back face. Blood must survive that movement. */
      side: THREE.DoubleSide,
      /* Sits in front of whatever it is on, and must not fight it. The lift
       * handles most of that; polygonOffset covers surfaces at a glancing
       * angle, where a fixed lift is not enough. */
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  };
}
