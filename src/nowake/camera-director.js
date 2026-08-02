import * as THREE from 'three';

const SPEAKER_SHOTS = Object.freeze({
  lou: {
    position: [0, 2.58, 1.55],
    targetNpc: 'lou',
    targetOffset: [0, 1.48, 0],
    fov: 57,
  },
  willy: {
    position: [0, 2.50, 2.32],
    targetNpc: 'willy',
    targetOffset: [0, 1.42, 0],
    fov: 57,
  },
  booski: {
    position: [0, 2.58, 1.50],
    targetNpc: 'booski',
    targetOffset: [0, 1.46, 0],
    fov: 58,
  },
});

const RETURN_SHOTS = Object.freeze([
  {
    id: 'return-wake-wide', until: 5.35,
    position: [-5.6, 3.45, 8.6], target: [0, 1.35, 1.4], fov: 63,
  },
  {
    id: 'return-silent-deck', until: 10.7,
    position: [-4.20, 3.25, 6.70], target: [1.0, 1.25, 3.45], fov: 62,
  },
  {
    id: 'return-harbor-ahead', until: Infinity,
    position: [-.8, 3.25, -8.2], target: [0, 1.28, -.35], fov: 61,
  },
]);

/**
 * NO WAKE owns its authored camera independently of Player.  Player updates
 * first; this director writes the final render pose afterwards, so a frozen
 * player's normal yaw/pitch application cannot reset a cinematic blend.
 */
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
    if (!this.active) {
      this.position.copy(this.camera.position);
      this.quaternion.copy(this.camera.quaternion);
    }
    this.active = true;
    this.shot = { id, rate: 7.6, ...spec };
    this.seenShots.add(id);
    if (snap) this.update(1);
  }

  frameSpeaker(id) {
    const shot = SPEAKER_SHOTS[id];
    if (!shot) return;
    this.setShot(`reveal-${id}`, shot, { snap: true });
  }

  frameExecution() {
    this.setShot('execution-over-shoulder', {
      position: [0, 2.76, .82],
      target: [0, 2.08, 4.34],
      fov: 68,
      rate: 8.5,
    }, { snap: true });
  }

  frameCollapse() {
    this.setShot('execution-collapse-profile', {
      position: [-1.92, 2.38, 3.65],
      targetNpc: 'willy',
      targetOffset: [0, .92, 0],
      fov: 61,
      rate: 9,
    }, { snap: true });
  }

  frameDisposal() {
    this.setShot('disposal-transom-side', {
      position: [4.45, 3.58, 6.50],
      target: [1.32, 1.04, 4.32],
      fov: 62,
      rate: 9,
    }, { snap: true });
  }

  frameReturn(time) {
    const shot = RETURN_SHOTS.find((candidate) => time < candidate.until) ?? RETURN_SHOTS.at(-1);
    this.setShot(shot.id, shot, { snap: true });
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
