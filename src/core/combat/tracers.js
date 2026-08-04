/**
 * Tracers — every round in the air, in one draw call.
 *
 * Lifted here verbatim from `src/enolasquatch/combat/Tracers.js` (which now
 * re-exports this file) because it stopped being one scene's problem the
 * moment the shared weapon system in `src/core/weapons/` needed it: the raid
 * puts a couple of hundred streaks up over the target, and Lou's armory puts
 * a belt of two hundred through a SAW. Both want the same thing and neither
 * wants a mesh per round.
 *
 * The original note, which is still the whole argument:
 *
 *   The compound's guns, the interceptors and the Enola Squatch's own rear
 *   turret all put tracer up, and at the density this scene wants that is a
 *   couple of hundred streaks in flight at the peak. Built the obvious way, as
 *   a mesh per round, that is a couple of hundred draw calls for something the
 *   player perceives as texture.
 *
 *   So they are one `THREE.InstancedMesh` of a unit box, stretched along Z per
 *   instance and pointed down its own flight path. Colour is per-instance,
 *   which is what lets the ground batteries fire yellow, the fighters fire
 *   white-hot and the turret fire green without a second mesh.
 *
 *   A round is pure kinematics: an origin, a velocity, a life. Whether it HITS
 *   anything is not decided here — the shooter decides that when it fires, and
 *   this class just calls `onArrive` when the round reaches the end of its run.
 *
 * The two helpers it used to borrow from `src/beefrun/util.js` are inlined
 * below. That module reaches for `document` for its canvas-backed materials,
 * and a core module that cannot be imported by a Node test is a core module
 * nobody can write a test against.
 */
import * as THREE from 'three';

/** The one unit box every tracer instance is a scaled copy of. */
const _unitBox = new THREE.BoxGeometry(1, 1, 1);

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

const _dummy = new THREE.Object3D();
const _colour = new THREE.Color();
const _hidden = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _end = new THREE.Vector3();

export class TracerPool {
  /**
   * @param {THREE.Object3D} parent
   * @param {number} [capacity] rounds in flight at once. Older rounds are
   *   recycled when it is full, which is the correct behaviour for tracer:
   *   nobody notices the oldest streak vanishing a tenth of a second early.
   * @param {object} [o]
   * @param {number} [o.minLength] shortest streak, in metres. The raid is read
   *   at a kilometre and wants a 6 m minimum so a round is visible at all; a
   *   basement is read at four metres and wants a short one, or every shot is
   *   a rod through the far wall.
   */
  constructor(parent, capacity = 220, { minLength = 6 } = {}) {
    this.capacity = capacity;
    this.minLength = minLength;
    this.mesh = new THREE.InstancedMesh(
      _unitBox,
      new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.95, fog: false }),
      capacity,
    );
    this.mesh.name = 'tracer-pool';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, _hidden);
    this.mesh.instanceMatrix.needsUpdate = true;
    parent.add(this.mesh);

    this.rounds = new Array(capacity).fill(null);
    this._next = 0;
    this.live = 0;
    /** Total rounds this pool has ever put up. Verifiers read it. */
    this.fired = 0;
  }

  /**
   * @param {object} shot
   * @param {THREE.Vector3} shot.from  muzzle, world space
   * @param {THREE.Vector3} shot.to    where this round is going
   * @param {number} [shot.speed]      m/s
   * @param {number} [shot.colour]
   * @param {number} [shot.width]      metres
   * @param {Function} [shot.onArrive] called once, at the far end
   */
  fire({ from, to, speed = 780, colour = 0xfff0a0, width = 0.5, onArrive = null }) {
    const i = this._next;
    this._next = (this._next + 1) % this.capacity;
    const dist = from.distanceTo(to);
    this.rounds[i] = {
      from: from.clone(),
      to: to.clone(),
      life: 0,
      duration: clamp(dist / speed, 0.05, 3.2),
      width,
      onArrive,
    };
    _colour.setHex(colour);
    this.mesh.setColorAt(i, _colour);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.live++;
    this.fired++;
    return i;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.capacity; i++) {
      const r = this.rounds[i];
      if (!r) continue;
      any = true;
      r.life += dt;
      const k = clamp(r.life / r.duration, 0, 1);
      _end.lerpVectors(r.from, r.to, k);
      // The streak is the last stretch of the round's path, not a point.
      const tailK = clamp(k - 0.055, 0, 1);
      _dir.lerpVectors(r.from, r.to, tailK);
      const len = Math.max(this.minLength, _end.distanceTo(_dir));
      _dummy.position.lerpVectors(_dir, _end, 0.5);
      _dummy.up.copy(_up);
      _dummy.lookAt(_end);
      _dummy.scale.set(r.width, r.width, len);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
      if (k >= 1) {
        this.rounds[i] = null;
        this.live = Math.max(0, this.live - 1);
        this.mesh.setMatrixAt(i, _hidden);
        r.onArrive?.();
      }
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.rounds[i] = null;
      this.mesh.setMatrixAt(i, _hidden);
    }
    this.live = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.material.dispose();
  }
}
