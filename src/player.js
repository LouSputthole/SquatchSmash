import * as THREE from 'three';

const FUR = 0x5a4230;
const FUR_DARK = 0x46331f;
const SKIN = 0x8a6f52;

function box(w, h, d, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.castShadow = true;
  return m;
}

// Smash animation timing (seconds)
const WINDUP_END = 0.18;
const IMPACT_T = 0.26;
const SMASH_END = 0.5;

export class Sasquatch {
  constructor() {
    this.group = new THREE.Group();
    this.heading = 0;
    this.walkT = 0;
    this.swing = 0;
    this.smashT = -1;
    this.impactFired = false;

    // Torso
    const torso = box(1.7, 1.6, 1.0, FUR);
    torso.position.y = 2.05;
    this.group.add(torso);
    const belly = box(1.3, 1.0, 0.25, SKIN);
    belly.position.set(0, 1.85, 0.45);
    this.group.add(belly);

    // Head
    const head = new THREE.Group();
    head.position.set(0, 3.2, 0.1);
    const skull = box(0.95, 0.95, 0.9, FUR);
    head.add(skull);
    const face = box(0.62, 0.55, 0.12, SKIN);
    face.position.set(0, -0.08, 0.48);
    head.add(face);
    const brow = box(0.72, 0.16, 0.16, FUR_DARK);
    brow.position.set(0, 0.24, 0.5);
    head.add(brow);
    for (const s of [-1, 1]) {
      const eye = box(0.13, 0.11, 0.06, 0x1a1008);
      eye.position.set(0.17 * s, 0.1, 0.56);
      head.add(eye);
    }
    this.group.add(head);
    this.head = head;

    // Arms — pivot at the shoulder so rotation.x swings them
    this.armL = this.buildArm(-1);
    this.armR = this.buildArm(1);
    this.group.add(this.armL, this.armR);

    // Legs — pivot at the hip
    this.legL = this.buildLeg(-1);
    this.legR = this.buildLeg(1);
    this.group.add(this.legL, this.legR);
  }

  buildArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(1.05 * side, 2.65, 0);
    const upper = box(0.5, 1.8, 0.55, FUR);
    upper.position.y = -0.9;
    pivot.add(upper);
    const hand = box(0.58, 0.45, 0.6, SKIN);
    hand.position.y = -1.95;
    pivot.add(hand);
    return pivot;
  }

  buildLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.42 * side, 1.35, 0);
    const leg = box(0.58, 1.35, 0.62, FUR_DARK);
    leg.position.y = -0.68;
    pivot.add(leg);
    const foot = box(0.6, 0.25, 0.9, SKIN);
    foot.position.set(0, -1.28, 0.15);
    pivot.add(foot);
    return pivot;
  }

  get position() {
    return this.group.position;
  }

  facing(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  startSmash() {
    if (this.smashT >= 0) return false;
    this.smashT = 0;
    this.impactFired = false;
    return true;
  }

  // Returns true exactly once per smash, at the moment the arms hit the ground.
  consumeImpact() {
    if (this.smashT >= IMPACT_T && !this.impactFired) {
      this.impactFired = true;
      return true;
    }
    return false;
  }

  get smashing() {
    return this.smashT >= 0;
  }

  update(dt, moveVec, speed) {
    const moving = moveVec.lengthSq() > 0.0001;

    if (moving) {
      const target = Math.atan2(moveVec.x, moveVec.z);
      const diff = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      this.heading += diff * Math.min(1, 14 * dt);
      this.group.rotation.y = this.heading;
      // Move slower mid-smash so the slam feels weighty
      const spd = this.smashing ? speed * 0.35 : speed;
      this.group.position.addScaledVector(moveVec, spd * dt);
      this.walkT += dt * spd * 0.85;
      this.swing = Math.min(1, this.swing + dt * 6);
    } else {
      this.swing = Math.max(0, this.swing - dt * 6);
    }

    const gait = Math.sin(this.walkT) * 0.65 * this.swing;
    this.legL.rotation.x = gait;
    this.legR.rotation.x = -gait;
    this.group.position.y = Math.abs(Math.sin(this.walkT)) * 0.14 * this.swing;

    if (this.smashT >= 0) {
      this.smashT += dt;
      let armX;
      if (this.smashT < WINDUP_END) {
        armX = THREE.MathUtils.lerp(0, -2.3, this.smashT / WINDUP_END);
      } else if (this.smashT < IMPACT_T) {
        armX = THREE.MathUtils.lerp(-2.3, 1.0, (this.smashT - WINDUP_END) / (IMPACT_T - WINDUP_END));
      } else if (this.smashT < SMASH_END) {
        armX = THREE.MathUtils.lerp(1.0, 0, (this.smashT - IMPACT_T) / (SMASH_END - IMPACT_T));
      } else {
        armX = 0;
        this.smashT = -1;
      }
      this.armL.rotation.x = armX;
      this.armR.rotation.x = armX;
      this.head.rotation.x = armX * 0.15;
    } else {
      this.armL.rotation.x = gait * 0.8;
      this.armR.rotation.x = -gait * 0.8;
      this.head.rotation.x = 0;
    }
  }
}
