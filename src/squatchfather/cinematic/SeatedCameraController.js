import * as THREE from 'three';
import { POS } from '../scenes/SquatchfatherScene.js';

// While Prospect is at the table the player keeps their head but not their
// legs: look freely between Sal, McClawsky and the bathroom hallway, and no
// further. Dialogue "look" cues nudge the view; any mouse movement cancels the
// nudge so the player never loses control.

const YAW_CENTER = Math.PI;    // facing across the table
const YAW_RANGE = 1.15;        // ±66°
const PITCH_MIN = -0.55;
const PITCH_MAX = 0.4;

export class SeatedCameraController {
  constructor(director) {
    this.director = director;
    this.active = false;
    this.nudge = null;
    this.targets = {};
  }

  setTargets(targets) {
    this.targets = targets;
  }

  enter() {
    this.active = true;
    this.nudge = null;
  }

  exit() {
    this.active = false;
    this.nudge = null;
  }

  get clamp() {
    return this.active
      ? { yawCenter: YAW_CENTER, yawRange: YAW_RANGE, pitchMin: PITCH_MIN, pitchMax: PITCH_MAX }
      : null;
  }

  // Called from the dialogue hook: 'SAL' | 'MCCLAWSKY' | 'HALLWAY'
  lookCue(id) {
    if (!this.active) return;
    const p = this.targets[id];
    if (!p) return;
    this.nudge = { point: p.clone(), t: 0 };
  }

  playerMoved() {
    this.nudge = null;
  }

  update(dt, prospect) {
    if (!this.active || !this.nudge) return;
    this.nudge.t += dt;
    if (this.nudge.t > 1.4) { this.nudge = null; return; }
    const eye = prospect.eye;
    const dx = this.nudge.point.x - eye.x;
    const dy = this.nudge.point.y - eye.y;
    const dz = this.nudge.point.z - eye.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    const k = Math.min(1, dt * 3.4);
    let d = ((wantYaw - prospect.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    prospect.yaw += d * k;
    prospect.pitch += (wantPitch - prospect.pitch) * k;
  }
}

// Where the seated look cues point.
export function seatedLookTargets(sal, mcclawsky) {
  return {
    SAL: sal.eyePoint,
    MCCLAWSKY: mcclawsky.eyePoint,
    HALLWAY: new THREE.Vector3(POS.hallMouth.x, 1.5, POS.hallMouth.z + 1.0),
    TABLE: new THREE.Vector3(POS.tableCenter.x, 0.8, POS.tableCenter.z),
  };
}
