import * as THREE from 'three';

// Shared blocky humanoid for everyone in the scene. Built from primitives with
// named joints so the controllers can pose it: standing, walking, seated,
// talking, leaning, reaching into a jacket, and going down.
//
// Local forward is +Z — the eyes, tie, shirt front and every gesture live on
// the +Z face, same as the game's crowd builder (yaw 0 looks along +Z). That
// is the OPPOSITE of the player's yaw (camera forward is -Z), so the mirror
// body adds pi when it follows the camera. The steering below (lookAt,
// walkTo, the seated legs) aims the +Z face; placements pass yaws in the
// same convention.

function box(w, h, d, color, x = 0, y = 0, z = 0, opts = null) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, ...(opts || {}) })
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export const DEFAULTS = {
  coat: 0x1e1f28,
  shirt: 0xe6e2d8,
  tie: 0x5a1e22,
  skin: 0xc79a72,
  hair: 0x2a2018,
  bulk: 1,
  height: 1,
  fur: false,
};

const STAND_PELVIS = 0.92;
const SIT_PELVIS = 0.6;
// Seated, the shin has further to travel to reach the floor from a chair than
// it does when standing; stretching the lower leg keeps both ends in contact.
const SIT_SHIN_STRETCH = 1.2;

export function buildFigure(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const g = new THREE.Group();
  const bw = 0.52 * o.bulk;
  const bd = 0.3 * o.bulk;

  // `root` tips the whole body in the character's own frame — used for falling.
  const root = new THREE.Group();
  g.add(root);

  const pelvis = new THREE.Group();
  pelvis.position.y = STAND_PELVIS;
  root.add(pelvis);
  pelvis.add(box(bw * 0.92, 0.2, bd, o.coat, 0, -0.04, 0));

  // ---- Legs: hip pivot → thigh → knee pivot → shin → shoe
  function leg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.15 * o.bulk, -0.1, 0);
    pelvis.add(hip);
    hip.add(box(0.2 * o.bulk, 0.4, 0.21, o.coat, 0, -0.2, 0));
    const knee = new THREE.Group();
    knee.position.set(0, -0.4, 0);
    hip.add(knee);
    knee.add(box(0.18 * o.bulk, 0.37, 0.19, o.coat, 0, -0.185, 0));
    knee.add(box(0.19 * o.bulk, 0.1, 0.3, 0x14141a, 0, -0.37, 0.06)); // toes on the face side
    return { hip, knee };
  }
  const legL = leg(-1);
  const legR = leg(1);

  // ---- Torso
  const torso = new THREE.Group();
  torso.position.set(0, 0.04, 0);
  pelvis.add(torso);

  const chest = box(bw, 0.62 * o.height, bd, o.coat, 0, 0.31 * o.height, 0);
  torso.add(chest);
  torso.add(box(bw * 0.44, 0.5 * o.height, bd * 0.62, o.shirt, 0, 0.34 * o.height, bd * 0.4));
  const tie = box(bw * 0.13, 0.4 * o.height, 0.03, o.tie, 0, 0.3 * o.height, bd * 0.6);
  torso.add(tie);
  const lapelL = box(bw * 0.2, 0.4 * o.height, 0.06, o.coat, -bw * 0.24, 0.36 * o.height, bd * 0.45);
  const lapelR = lapelL.clone();
  lapelR.position.x = bw * 0.24;
  torso.add(lapelL, lapelR);
  torso.add(box(bw * 1.18, 0.16, bd * 1.05, o.coat, 0, 0.6 * o.height, 0));

  // ---- Head
  const neck = new THREE.Group();
  neck.position.set(0, 0.68 * o.height, 0);
  torso.add(neck);
  neck.add(box(0.26 * o.bulk, 0.28, 0.26, o.skin, 0, 0.15, 0));
  const hair = box(0.28 * o.bulk, 0.09, 0.28, o.hair, 0, 0.29, -0.01);
  neck.add(hair);
  const jaw = box(0.2 * o.bulk, 0.08, 0.2, o.skin, 0, 0.04, 0.02);
  neck.add(jaw);
  for (const s of [-1, 1]) neck.add(box(0.045, 0.035, 0.03, 0x1a1410, s * 0.07 * o.bulk, 0.19, 0.13));
  if (o.fur) {
    // A sasquatch does not lose the brow just because he put on a suit
    neck.add(box(0.3 * o.bulk, 0.06, 0.07, o.hair, 0, 0.24, 0.11));
    for (const [fx, fy, fz] of [[-0.15, 0.05, 0.04], [0.15, 0.07, -0.05], [0, -0.03, -0.14]]) {
      neck.add(box(0.1, 0.1, 0.1, o.hair, fx * o.bulk, fy, fz));
    }
  }

  // ---- Arms
  function arm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * bw * 0.62, 0.55 * o.height, 0);
    torso.add(shoulder);
    shoulder.add(box(0.15 * o.bulk, 0.34, 0.16, o.coat, 0, -0.17, 0));
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.34, 0);
    shoulder.add(elbow);
    elbow.add(box(0.13 * o.bulk, 0.32, 0.14, o.coat, 0, -0.16, 0));
    const hand = box(0.13, 0.13, 0.15, o.skin, 0, -0.36, 0.02);
    elbow.add(hand);
    return { shoulder, elbow, hand };
  }
  const armL = arm(-1);
  const armR = arm(1);

  return { group: g, root, pelvis, torso, neck, jaw, hair, chest, tie, legL, legR, armL, armR };
}

// Per-frame behaviour shared by everyone: breathing, talking, gestures,
// walking, and the two-stage hit → down.
export class Figure {
  constructor(opts = {}) {
    Object.assign(this, buildFigure(opts));
    this.t = Math.random() * 10;
    this.talkT = 0;
    this.lean = 0;
    this.leanTarget = 0;
    this.gesture = null;
    this.gestureT = 0;
    this.neckTarget = 0;
    this.seated = false;
    this.down = false;
    this.deathT = 0;
    this.hitT = 0;
    this.walkT = 0;
    this.walkAmt = 0;
    this.setPose('stand');
  }

  place(x, z, facing) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = facing;
  }

  setPose(pose) {
    this.seated = pose === 'sit';
    if (this.seated) {
      this.pelvis.position.y = SIT_PELVIS;
      // Thighs swing up toward +Z — the knees end up under whatever the face
      // is pointed at, not poking out through the chair back.
      this.legL.hip.rotation.x = this.legR.hip.rotation.x = -Math.PI / 2;
      this.legL.knee.rotation.x = this.legR.knee.rotation.x = Math.PI / 2;
      this.legL.knee.scale.y = this.legR.knee.scale.y = SIT_SHIN_STRETCH;
      this.armL.shoulder.rotation.x = this.armR.shoulder.rotation.x = 0.35;
      this.armL.elbow.rotation.x = this.armR.elbow.rotation.x = -1.25;
    } else {
      this.pelvis.position.y = STAND_PELVIS;
      this.legL.hip.rotation.x = this.legR.hip.rotation.x = 0;
      this.legL.knee.rotation.x = this.legR.knee.rotation.x = 0;
      this.legL.knee.scale.y = this.legR.knee.scale.y = 1;
      this.armL.shoulder.rotation.x = this.armR.shoulder.rotation.x = 0.08;
      this.armL.elbow.rotation.x = this.armR.elbow.rotation.x = -0.22;
    }
  }

  speak(dur) { this.talkT = dur; }
  leanForward(on) { this.leanTarget = on ? 0.3 : 0; }
  playGesture(name, dur = 1.8) { this.gesture = name; this.gestureT = dur; }
  hit() { this.hitT = 0.22; this.gestureT = 0; this.talkT = 0; }

  // Yaw the head toward a world point, clamped so nobody's neck snaps around.
  lookAt(target) {
    if (this.down) return;
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    // The face is on +Z, so the yaw that meets the target is atan2(dx, dz).
    const want = Math.atan2(dx, dz) - this.group.rotation.y;
    let a = ((want + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.neckTarget = Math.max(-1.0, Math.min(1.0, a));
  }

  // Walk toward a point; returns true once it arrives.
  walkTo(x, z, dt, speed = 1.5, faceTarget = true) {
    const dx = x - this.group.position.x;
    const dz = z - this.group.position.z;
    const d = Math.hypot(dx, dz);
    const step = Math.min(d, speed * dt);
    // Snap on the last step so a long frame can't overshoot and orbit forever
    if (d < 0.08 || d <= speed * dt) {
      this.group.position.x = x;
      this.group.position.z = z;
      this.walkAmt += (0 - this.walkAmt) * Math.min(1, dt * 8);
      return true;
    }
    this.group.position.x += (dx / d) * step;
    this.group.position.z += (dz / d) * step;
    if (faceTarget) {
      const want = Math.atan2(dx, dz); // face (+Z) leads the walk
      let diff = ((want - this.group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.group.rotation.y += diff * Math.min(1, dt * 6);
    }
    this.walkT += dt * speed * 3.4;
    this.walkAmt += (1 - this.walkAmt) * Math.min(1, dt * 8);
    return false;
  }

  update(dt) {
    this.t += dt;
    const breathe = Math.sin(this.t * 1.6) * 0.012;
    this.chest.scale.set(1, 1 + breathe, 1 + breathe * 0.6);

    if (this.hitT > 0) {
      this.hitT -= dt;
      const k = Math.sin(((0.22 - this.hitT) / 0.22) * Math.PI);
      this.torso.rotation.x = -0.45 * k;
      this.neck.rotation.x = -0.3 * k;
      return;
    }
    if (this.down) {
      this.deathT += dt;
      return; // controllers drive their own collapse
    }

    if (this.talkT > 0) {
      this.talkT -= dt;
      const j = Math.abs(Math.sin(this.t * 16)) * 0.035 + Math.abs(Math.sin(this.t * 9.3)) * 0.018;
      this.jaw.position.y = 0.04 - j;
      this.neck.rotation.x = Math.sin(this.t * 3.1) * 0.05;
    } else {
      this.jaw.position.y += (0.04 - this.jaw.position.y) * Math.min(1, dt * 12);
      this.neck.rotation.x += (0 - this.neck.rotation.x) * Math.min(1, dt * 6);
    }
    this.neck.rotation.y += (this.neckTarget - this.neck.rotation.y) * Math.min(1, dt * 4);

    this.lean += (this.leanTarget - this.lean) * Math.min(1, dt * 3);
    this.torso.rotation.x = this.lean;
    this.torso.position.z = this.lean * -0.1;

    if (this.gestureT > 0) {
      this.gestureT -= dt;
      this.#applyGesture(dt);
    } else if (this.seated) {
      this.#relaxSeated(dt);
    }

    if (!this.seated) this.#walkPose(dt);
  }

  #walkPose(dt) {
    const s = Math.sin(this.walkT) * this.walkAmt;
    const c = Math.sin(this.walkT + Math.PI) * this.walkAmt;
    // Strides mirror the sit pose: negative hip x swings a leg toward the +Z
    // face, and the trailing knee folds the shin back behind it.
    this.legL.hip.rotation.x = -s * 0.55;
    this.legR.hip.rotation.x = -c * 0.55;
    this.legL.knee.rotation.x = Math.max(0, -s) * 0.75;
    this.legR.knee.rotation.x = Math.max(0, -c) * 0.75;
    if (this.gestureT <= 0) {
      const k = Math.min(1, dt * 6);
      this.armL.shoulder.rotation.x += (0.08 - c * 0.35 - this.armL.shoulder.rotation.x) * k;
      this.armR.shoulder.rotation.x += (0.08 - s * 0.35 - this.armR.shoulder.rotation.x) * k;
      this.armL.elbow.rotation.x += (-0.22 - this.armL.elbow.rotation.x) * k;
      this.armR.elbow.rotation.x += (-0.22 - this.armR.elbow.rotation.x) * k;
    }
    this.pelvis.position.y = STAND_PELVIS + Math.abs(s) * 0.03;
  }

  #relaxSeated(dt) {
    const k = Math.min(1, dt * 5);
    const idle = Math.sin(this.t * 0.8) * 0.03;
    for (const a of [this.armL, this.armR]) {
      a.shoulder.rotation.x += (0.35 + idle - a.shoulder.rotation.x) * k;
      a.shoulder.rotation.z += (0 - a.shoulder.rotation.z) * k;
      a.elbow.rotation.x += (-1.25 - a.elbow.rotation.x) * k;
    }
  }

  #applyGesture(dt) {
    const k = Math.min(1, dt * 7);
    const p = Math.sin(this.t * 5);
    const set = (arm, sx, sz, ex) => {
      arm.shoulder.rotation.x += (sx - arm.shoulder.rotation.x) * k;
      arm.shoulder.rotation.z += (sz - arm.shoulder.rotation.z) * k;
      arm.elbow.rotation.x += (ex - arm.elbow.rotation.x) * k;
    };
    switch (this.gesture) {
      case 'shrug': set(this.armL, 0.5, -0.55, -1.0); set(this.armR, 0.5, 0.55, -1.0); break;
      case 'hands': set(this.armL, 0.55 + p * 0.12, -0.3, -1.35); set(this.armR, 0.55 - p * 0.12, 0.3, -1.35); break;
      case 'drink': set(this.armR, 0.15, 0.1, -2.3); set(this.armL, 0.35, 0, -1.25); break;
      case 'eat': set(this.armR, 0.3 + p * 0.18, 0.05, -1.9 - p * 0.2); set(this.armL, 0.4, 0, -1.2); break;
      case 'point': set(this.armR, 0.85, 0.1, -0.45); set(this.armL, 0.35, 0, -1.25); break;
      case 'reach': set(this.armR, 0.25, -0.8, -2.1); set(this.armL, 0.35, 0, -1.25); break;
      case 'open': set(this.armR, 1.15, 0.15, -0.35); set(this.armL, 0.08, 0, -0.22); break;
      default: break;
    }
  }
}
