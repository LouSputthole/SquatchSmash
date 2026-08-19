import * as THREE from 'three';
import { reducedMotionEnabled } from '../core/settings.js';

/**
 * NO WAKE's authored camera.
 *
 * Every shot is written in the BOAT's local frame and resolved through
 * `boat.root.localToWorld` every update, which is the spec's "one stable local
 * coordinate system while aboard" applied to the camera as well as to the
 * player. A shot authored in world space would slide off the boat the moment
 * she moved, and she is moving for most of this mission.
 *
 * The scene deliberately owns very little of the camera. The player keeps it
 * for the dock, the run out, the cabin confrontation and the shot itself —
 * "movement locked, aim free, no countdown". The director takes over only for
 * the beats the spec stages: the collapse, the wrapping, the weights, the
 * carry, the disposal, the hold on the water, and one look astern.
 */

/**
 * THERE ARE NO SPEAKER SHOTS BELOW DECK, AND THAT IS THE POINT.
 *
 * The old scene cut to whoever was talking on every line. The redesign says
 * "the player keeps camera control but cannot leave, and movement is limited to
 * a small staging area so the composition holds" — so the composition is held
 * by where the four men are standing, not by the camera taking over. Willy is
 * between the bar and the booth with nothing in front of him; Lou is at the far
 * end of the dinette over a low back; Booski is behind the bar. From the mark at
 * the foot of the stairs all three are in frame at once and none of them is
 * behind anything, which is the owner's "spawning behind a wall" complaint
 * answered with staging instead of with a cut. Every position below is written
 * against the salon the 2026-08-06 playtest bought (punch list N1), which sits
 * 0.32 m lower and 0.72 m wider than the room these shots were first cut for.
 *
 * Every shot below is a beat the spec explicitly stages, and the player is
 * `frozen` for all of them.
 */

/** The last thing the mission shows: the wake spreading and smoothing over. */
const ASTERN_SHOT = Object.freeze({
  id: 'exit-astern-wake',
  position: [0, 2.95, 6.90],
  target: [0, -0.10, 16.0],
  fov: 62,
  rate: 6.0,
});

export class NoWakeCameraDirector {
  constructor(camera, boat) {
    this.camera = camera;
    this.boat = boat;
    this.active = false;
    this.shot = null;
    this.seenShots = new Set();
    this.baseFov = camera.fov;
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.targetPosition = new THREE.Vector3();
    this.targetLook = new THREE.Vector3();
    // Camera.lookAt aims its -Z axis. A generic Object3D aims +Z and would
    // produce a perfectly smooth shot facing exactly away from the speaker.
    this.ghost = new THREE.PerspectiveCamera();
    this.local = new THREE.Vector3();
  }

  setShot(id, spec, { snap = false } = {}) {
    if (this.shot?.id === id) return;
    if (reducedMotionEnabled()) {
      this.seenShots.add(id);
      this.active = false;
      this.shot = null;
      return;
    }
    if (!this.active) {
      this.position.copy(this.camera.position);
      this.quaternion.copy(this.camera.quaternion);
    }
    this.active = true;
    this.shot = { id, rate: 7.6, ...spec };
    this.seenShots.add(id);
    if (snap) this.update(1);
  }

  /** The slump: a low side profile, not a stare down at deck fragments. */
  frameCollapse() {
    this.setShot('execution-collapse-profile', {
      position: [-0.66, 0.26, -2.70],
      targetNpc: 'willy',
      targetOffset: [0, 0.55, 0],
      fov: 58,
      rate: 8.5,
    }, { snap: true });
  }

  /** The tarp, the roll, the fold and the straps. */
  frameWrap() {
    this.setShot('body-wrap-cabin', {
      position: [-0.72, 0.62, -2.78],
      target: [0.10, -0.30, -3.53],
      fov: 60,
      rate: 8,
    }, { snap: true });
  }

  /** The bow locker, in open air, with Irish's back to the whole thing. */
  frameBallast() {
    this.setShot('ballast-bow-locker', {
      position: [-1.30, 2.58, -2.70],
      target: [-0.02, 1.76, -4.56],
      fov: 58,
      rate: 8,
    }, { snap: true });
  }

  /** Two men lifting, in the room they have to get him out of. */
  frameCarryLift() {
    this.setShot('carry-lift-cabin', {
      position: [-0.15, 0.82, -4.92],
      target: [0.10, 0.08, -3.25],
      fov: 62,
      rate: 7,
    }, { snap: true });
  }

  /** Off the starboard quarter, low, with the water inches under the bag. */
  frameDisposal() {
    this.setShot('disposal-swim-platform', {
      position: [3.91, 0.88, 6.65],
      target: [0.55, 0.28, 6.16],
      fov: 58,
      rate: 7,
    }, { snap: true });
  }

  /**
   * The hold.
   *
   * "One strike on the water, it sinks, it is gone... Hold on the water for
   * several seconds. Nothing comes back up." This shot exists so that holding
   * on nothing is a decision the scene made rather than a frame it happened to
   * be on.
   */
  frameWaterHold() {
    this.setShot('disposal-water-hold', {
      position: [0.30, 1.55, 7.30],
      target: [0.30, -0.18, 8.90],
      fov: 54,
      rate: 3.2,
    }, { snap: true });
  }

  frameAstern() {
    this.setShot(ASTERN_SHOT.id, ASTERN_SHOT, { snap: true });
  }

  clear() {
    this.active = false;
    this.shot = null;
    if (this.camera.fov !== this.baseFov) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  update(dt) {
    if (reducedMotionEnabled()) {
      if (this.active) this.clear();
      return;
    }
    if (!this.active || !this.shot) return;
    const shot = this.shot;
    this.local.fromArray(shot.position);
    this.targetPosition.copy(this.local);
    this.boat.root.localToWorld(this.targetPosition);

    if (shot.targetNpc) {
      const npc = this.boat.cast[shot.targetNpc];
      this.targetLook.fromArray(shot.targetOffset ?? [0, 1.45, 0]);
      npc.group.localToWorld(this.targetLook);
    } else {
      this.targetLook.fromArray(shot.target);
      this.boat.root.localToWorld(this.targetLook);
    }

    this.ghost.position.copy(this.targetPosition);
    this.ghost.lookAt(this.targetLook);
    const blend = 1 - Math.exp(-Math.max(0, dt) * shot.rate);
    this.position.lerp(this.targetPosition, blend);
    this.quaternion.slerp(this.ghost.quaternion, blend);
    this.camera.position.copy(this.position);
    this.camera.quaternion.copy(this.quaternion);

    const fov = shot.fov ?? this.baseFov;
    const nextFov = THREE.MathUtils.lerp(this.camera.fov, fov, blend);
    if (Math.abs(nextFov - this.camera.fov) > .001) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
  }
}

/** The authored beats, in the order the mission plays them. */
export const NO_WAKE_SHOT_ORDER = Object.freeze([
  'execution-collapse-profile',
  'body-wrap-cabin',
  'ballast-bow-locker',
  'carry-lift-cabin',
  'disposal-swim-platform',
  'disposal-water-hold',
  'exit-astern-wake',
]);
