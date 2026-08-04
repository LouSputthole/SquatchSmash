/**
 * Things that leave a gun and land on the floor.
 *
 * Discarded magazines, spent brass, an empty belt box. The owner asked for
 * "magazine ejections when they reload" and specifically for the old magazine
 * to be a real object that leaves the gun and falls, so this does not fake it
 * with a puff or a sound: `drop()` takes the very Object3D that was parented
 * to the weapon, reparents it into the world at the world transform it already
 * had, and throws it.
 *
 * WHY NOT INSTANCED, when the tracers next door are. Because there are single
 * digits of these in the air at once, they are different shapes, and one of
 * them is a 27-part object that has to keep looking like itself while it
 * tumbles. Instancing is the right answer for two hundred identical streaks
 * and the wrong answer for four magazines. The cap below is what keeps that
 * true: `capacity` pieces live at a time, oldest recycled, so a player who
 * empties a rack into the basement floor still ends up with a floor and not a
 * scrapyard.
 *
 * The physics is deliberately the cheap kind — constant gravity, one restitution
 * coefficient, a spin that decays — because a magazine is on screen for under a
 * second and nobody is measuring its coefficient of restitution. What matters
 * is that it leaves in the right direction, lands where the floor is, and makes
 * its noise when it gets there.
 */
import * as THREE from 'three';

const GRAVITY = -9.81;

export class EjectaPool {
  /**
   * @param {THREE.Object3D} parent  what dropped pieces are parented to
   * @param {object} [o]
   * @param {(x:number, z:number) => number} [o.groundAt] floor height under a
   *   point. Defaults to a flat 0.
   * @param {number} [o.capacity] pieces alive at once.
   * @param {number} [o.life] seconds a settled piece stays before it is taken
   *   away. Long enough to walk over and look at, short enough that a basement
   *   does not fill up.
   */
  constructor(parent, { groundAt = () => 0, capacity = 24, life = 22 } = {}) {
    this.parent = parent;
    this.groundAt = groundAt;
    this.capacity = capacity;
    this.life = life;
    /** @type {Array<object>} */
    this.pieces = [];
    /** Total pieces ever dropped. Verifiers read it. */
    this.dropped = 0;
    /** Total pieces that have touched the floor. Verifiers read it. */
    this.landed = 0;
  }

  /** How many are in the air right now. */
  get airborne() { return this.pieces.filter((p) => !p.resting).length; }

  /** How many are on the floor right now. */
  get resting() { return this.pieces.filter((p) => p.resting).length; }

  /**
   * Throw one object.
   *
   * @param {THREE.Object3D} object   already built; may still be parented to
   *   the gun, in which case its world transform is preserved on the way out.
   * @param {object} o
   * @param {THREE.Vector3} o.position world space
   * @param {THREE.Quaternion} [o.quaternion] world space
   * @param {THREE.Vector3} o.velocity world space, m/s
   * @param {number} [o.spin] radians/second, roughly
   * @param {number} [o.radius] half-height used for the floor test
   * @param {Function} [o.onLand] called once, when it first touches the floor
   */
  drop(object, {
    position, quaternion = null, velocity,
    spin = 6, radius = 0.05, onLand = null,
  }) {
    if (!object) return null;
    object.parent?.remove(object);
    object.position.copy(position);
    if (quaternion) object.quaternion.copy(quaternion);
    this.parent.add(object);

    const piece = {
      object,
      vel: velocity.clone(),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * spin,
        (Math.random() - 0.5) * spin * 0.6,
        (Math.random() - 0.5) * spin,
      ),
      radius,
      age: 0,
      resting: false,
      bounces: 0,
      onLand,
    };
    this.pieces.push(piece);
    this.dropped++;
    while (this.pieces.length > this.capacity) this._retire(this.pieces.shift());
    return piece;
  }

  _retire(piece) {
    if (!piece) return;
    piece.object.parent?.remove(piece.object);
  }

  update(dt) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    if (step <= 0) return;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.age += step;
      if (p.age > this.life) {
        this._retire(p);
        this.pieces.splice(i, 1);
        continue;
      }
      if (p.resting) continue;

      p.vel.y += GRAVITY * step;
      p.object.position.addScaledVector(p.vel, step);
      p.object.rotation.x += p.spin.x * step;
      p.object.rotation.y += p.spin.y * step;
      p.object.rotation.z += p.spin.z * step;

      const floor = this.groundAt(p.object.position.x, p.object.position.z) + p.radius;
      if (p.object.position.y > floor) continue;

      p.object.position.y = floor;
      const impact = Math.abs(p.vel.y);
      p.bounces++;
      if (p.bounces === 1) {
        this.landed++;
        p.onLand?.(impact);
      }
      /* Two bounces and it is down. A magazine is not a superball, and a
       * piece that keeps skittering is a piece that ends up under the rack. */
      if (p.bounces >= 3 || impact < 0.9) {
        p.resting = true;
        p.vel.set(0, 0, 0);
        p.spin.set(0, 0, 0);
        // Lie it flat, the way a dropped magazine ends up.
        p.object.rotation.x = Math.PI / 2;
        p.object.rotation.z = 0;
      } else {
        p.vel.y = impact * 0.32;
        p.vel.x *= 0.55;
        p.vel.z *= 0.55;
        p.spin.multiplyScalar(0.5);
      }
    }
  }

  /** Take everything away — leaving a scene, or a verifier resetting. */
  clear() {
    for (const p of this.pieces) this._retire(p);
    this.pieces.length = 0;
  }

  dispose() { this.clear(); }
}
