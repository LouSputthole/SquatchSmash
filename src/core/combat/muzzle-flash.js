/**
 * Muzzle flash — the light that says a man over there pulled a trigger.
 *
 * Lifted here from `HostileMuzzleFlashPool` in `src/cartel-palace/main.js`,
 * which is where it was written and where it stayed, so THE TAKE's police
 * fought a whole street battle with no flash on any of it. The owner's note on
 * the bank job was *"they also don't really appear to be shooting back"*, and
 * a round with no flash, no tracer and no report is a round the player has no
 * way of perceiving at all: the only evidence he was being shot at was his own
 * health bar going down.
 *
 * Two shapes of the same idea already existed:
 *
 *   - the palace's pool — a flare card plus a point light per slot, recycled
 *     round-robin, which is what this file is; and
 *   - `src/mansion/siege/attackers.js`'s single pool-wide `PointLight`, moved
 *     to whoever fired, because *"Twenty-two lights in a house lit by two is
 *     not a look, it is a frame-rate bug"*.
 *
 * The siege's version is deliberately NOT converted. Its light is offered to
 * the scene's own light budget through `registerLight` and may be refused, its
 * decay timer is part of the attacker pool's checkpoint record, and it carries
 * no flare mesh — adding one would put new geometry into six damage states the
 * geometry gate pins by traversal path. That is a fork with a reason, so the
 * reason is written at the fork rather than left for the next reader to
 * rediscover. `capacity: 1` here is otherwise the same behaviour.
 *
 * The pool owns presentation and nothing else. It never decides who fired,
 * what it hit, or whether it hurt anybody.
 */
import * as THREE from 'three';

/**
 * How long one flash is on screen.
 *
 * The palace's measured value, kept: 65 ms is about four frames at 60 Hz —
 * long enough to catch out of the corner of an eye, short enough that six
 * officers firing bursts do not leave the street permanently lit.
 */
const FLASH_SECONDS = 0.065;

export class MuzzleFlashPool {
  /**
   * @param {THREE.Object3D} parent
   * @param {object} [o]
   * @param {number} [o.capacity] flashes that may overlap. The palace runs 12
   *   for an estate full of guards; a six-officer street wants fewer.
   * @param {string} [o.name] prefix for each slot root's name. Scene-owned,
   *   because a scene's own tooling addresses these by name.
   * @param {number} [o.colour] the flare card's colour.
   * @param {number} [o.lightColour] the point light's colour.
   * @param {number} [o.distance] light falloff distance, metres.
   * @param {number} [o.peak] light intensity of an ordinary shot.
   * @param {number} [o.heavyPeak] light intensity of a `heavy: true` shot.
   */
  constructor(parent, {
    capacity = 12,
    name = 'muzzle-flash',
    colour = 0xffcf72,
    lightColour = 0xffb85f,
    distance = 6,
    peak = 7,
    heavyPeak = 11,
  } = {}) {
    this.parent = parent;
    this.capacity = Math.max(1, Math.trunc(Number(capacity) || 12));
    this.peak = Math.max(0, Number(peak) || 0);
    this.heavyPeak = Math.max(0, Number(heavyPeak) || 0);
    this.pool = [];
    this.next = 0;
    this.lastOrigin = null;
    /** Total flashes this pool has ever put up. Verifiers and tests read it. */
    this.flashes = 0;
    const geometry = new THREE.SphereGeometry(0.065, 7, 5);
    for (let index = 0; index < this.capacity; index++) {
      const root = new THREE.Group();
      root.name = `${name}-${index}`;
      root.visible = false;
      const flare = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }));
      const light = new THREE.PointLight(lightColour, 0, distance, 2);
      root.add(flare, light);
      parent?.add?.(root);
      this.pool.push({ root, flare, light, time: 0, peak: this.peak });
    }
  }

  /**
   * Put one flash on a world-space muzzle.
   *
   * @param {THREE.Vector3} origin the sampled muzzle. `CombatWeaponAim`'s
   *   `frame.origin` is exactly this point, which is why a flash sits on the
   *   modelled barrel rather than in the middle of a man's chest.
   * @param {object} [o]
   * @param {boolean} [o.heavy] a long gun rather than a sidearm.
   * @returns {THREE.Object3D|null} the slot root, or null for a bad origin.
   */
  flash(origin, { heavy = false } = {}) {
    if (!origin?.isVector3) return null;
    const slot = this.pool[this.next % this.pool.length];
    this.next++;
    this.flashes++;
    slot.root.position.copy(origin);
    slot.root.scale.setScalar(heavy ? 1.45 : 1);
    slot.root.visible = true;
    slot.flare.material.opacity = 0.95;
    slot.peak = heavy ? this.heavyPeak : this.peak;
    slot.light.intensity = slot.peak;
    slot.time = FLASH_SECONDS;
    this.lastOrigin = origin.clone();
    return slot.root;
  }

  update(dt) {
    const step = Math.max(0, Number(dt) || 0);
    for (const slot of this.pool) {
      if (slot.time <= 0) continue;
      slot.time = Math.max(0, slot.time - step);
      const strength = slot.time / FLASH_SECONDS;
      slot.flare.material.opacity = strength * 0.95;
      slot.light.intensity = strength * slot.peak;
      if (slot.time <= 0) slot.root.visible = false;
    }
  }

  /** Checkpoint restore and mission retry: nothing left lit from the old run. */
  reset() {
    for (const slot of this.pool) {
      slot.time = 0;
      slot.root.visible = false;
      slot.flare.material.opacity = 0;
      slot.light.intensity = 0;
    }
    this.next = 0;
    this.lastOrigin = null;
  }

  report() {
    return Object.freeze({
      capacity: this.capacity,
      active: this.pool.filter((slot) => slot.root.visible).length,
      lastOrigin: this.lastOrigin?.toArray() ?? null,
    });
  }
}
