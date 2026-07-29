import * as THREE from 'three';

// Silver Sasquatches team colors — the default look for a full member.
// Other characters (prospects, elders) pass palette overrides.
export const SILVER_PALETTE = {
  fur: 0x9aa0ab,
  furDark: 0x6e747f,
  furLight: 0xc3c8d4,
  skin: 0xe2e5ec,
  bandana: 0xd92e2e,
};

// Smash animation timing (seconds)
const WINDUP_END = 0.18;
const IMPACT_T = 0.26;
const SMASH_END = 0.5;
// Ground stomp timing: hop up, slam down, recover
const STOMP_IMPACT = 0.34;
const STOMP_END = 0.6;

const _paletteColor = new THREE.Color();

export class Sasquatch {
  constructor(palette = {}) {
    this.palette = { ...SILVER_PALETTE, ...palette };
    // Materials grouped by role so a palette swap can recolor the whole body
    this.roleMats = { fur: [], furDark: [], furLight: [], skin: [], bandana: [] };
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // tilts forward when sprinting
    this.group.add(this.body);
    this.heading = 0;
    this.walkT = 0;
    this.swing = 0;
    this.smashT = -1;
    this.impactFired = false;
    this.stompT = -1;
    this.stompImpactFired = false;
    this.lean = 0;
    this.breatheT = 0;
    this.lastStepSign = 0;
    this.stepSide = 1;

    // Torso, wider at the shoulders
    const torso = this.box(1.7, 1.6, 1.05, 'fur');
    torso.position.y = 2.05;
    this.body.add(torso);
    this.torso = torso;
    const shoulders = this.box(2.15, 0.55, 1.1, 'furDark');
    shoulders.position.y = 2.75;
    this.body.add(shoulders);
    const belly = this.box(1.3, 1.0, 0.25, 'skin');
    belly.position.set(0, 1.85, 0.5);
    this.body.add(belly);

    // Shaggy fur tufts
    for (const [x, y, z, s] of [
      [-0.7, 1.45, 0.3, 0.4], [0.65, 1.5, -0.3, 0.45], [0, 1.35, -0.45, 0.5],
      [-0.5, 2.5, -0.45, 0.4], [0.55, 2.4, 0.42, 0.35],
    ]) {
      const tuft = this.box(s, s * 1.4, s * 0.7, 'furLight');
      tuft.position.set(x, y, z);
      tuft.rotation.z = (Math.random() - 0.5) * 0.5;
      this.body.add(tuft);
    }

    // Head
    const head = new THREE.Group();
    head.position.set(0, 3.25, 0.1);
    const skull = this.box(0.95, 0.95, 0.9, 'fur');
    head.add(skull);
    const crest = this.box(0.6, 0.4, 0.7, 'furDark');
    crest.position.set(0, 0.55, -0.1);
    head.add(crest);
    const face = this.box(0.62, 0.55, 0.12, 'skin');
    face.position.set(0, -0.08, 0.48);
    head.add(face);
    const brow = this.box(0.72, 0.16, 0.16, 'furDark');
    brow.position.set(0, 0.2, 0.5);
    head.add(brow);
    this.eyeMats = [];
    for (const s of [-1, 1]) {
      // Eyes keep their own material — never recolored by palette swaps
      const eye = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.11, 0.06),
        new THREE.MeshLambertMaterial({ color: 0x232a3d })
      );
      eye.castShadow = true;
      eye.position.set(0.17 * s, 0.06, 0.56);
      head.add(eye);
      this.eyeMats.push(eye.material);
    }

    // Bandana, mascot-style, with fluttering tails at the back
    const band = this.box(1.02, 0.2, 0.97, 'bandana');
    band.position.set(0, 0.36, 0);
    head.add(band);
    const knot = this.box(0.22, 0.22, 0.14, 'bandana');
    knot.position.set(0, 0.32, -0.52);
    head.add(knot);
    this.tails = [];
    for (const s of [-1, 1]) {
      const tail = this.box(0.14, 0.55, 0.05, 'bandana');
      tail.position.set(0.1 * s, 0.05, -0.6);
      tail.rotation.x = 0.55;
      tail.rotation.z = 0.25 * s;
      head.add(tail);
      this.tails.push(tail);
    }

    this.body.add(head);
    this.head = head;

    // Arms — pivot at the shoulder so rotation.x swings them
    this.armL = this.buildArm(-1);
    this.armR = this.buildArm(1);
    this.body.add(this.armL, this.armR);

    // Legs — pivot at the hip (on the root so the sprint lean doesn't lift them)
    this.legL = this.buildLeg(-1);
    this.legR = this.buildLeg(1);
    this.group.add(this.legL, this.legR);
  }

  box(w, h, d, role) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: this.palette[role] })
    );
    m.castShadow = true;
    this.roleMats[role].push(m.material);
    return m;
  }

  buildArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(1.1 * side, 2.7, 0);
    const upper = this.box(0.58, 1.15, 0.62, 'fur');
    upper.position.y = -0.6;
    pivot.add(upper);
    const fore = this.box(0.52, 0.95, 0.56, 'furDark');
    fore.position.y = -1.55;
    pivot.add(fore);
    const hand = this.box(0.6, 0.45, 0.62, 'skin');
    hand.position.y = -2.2;
    pivot.add(hand);
    return pivot;
  }

  buildLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.42 * side, 1.35, 0);
    const leg = this.box(0.58, 1.35, 0.62, 'furDark');
    leg.position.y = -0.68;
    pivot.add(leg);
    const foot = this.box(0.6, 0.25, 0.95, 'skin');
    foot.position.set(0, -1.28, 0.18);
    pivot.add(foot);
    return pivot;
  }

  // Instantly recolor every body part to a new palette.
  setPalette(palette) {
    this.palette = { ...this.palette, ...palette };
    for (const role in this.roleMats) {
      for (const m of this.roleMats[role]) m.color.setHex(this.palette[role]);
    }
  }

  // Blend toward a palette by factor k (call per-frame for a slow transform).
  lerpPalette(palette, k) {
    for (const role in this.roleMats) {
      if (palette[role] === undefined) continue;
      _paletteColor.setHex(palette[role]);
      for (const m of this.roleMats[role]) m.color.lerp(_paletteColor, k);
    }
  }

  get position() {
    return this.group.position;
  }

  facing(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  // Glowing red eyes while raging
  setRage(on) {
    for (const m of this.eyeMats) {
      m.color.setHex(on ? 0xff2222 : 0x232a3d);
      m.emissive.setHex(on ? 0xd91a1a : 0x000000);
    }
  }

  startSmash() {
    if (this.smashT >= 0 || this.stompT >= 0) return false;
    this.smashT = 0;
    this.impactFired = false;
    return true;
  }

  startStomp() {
    if (this.smashT >= 0 || this.stompT >= 0) return false;
    this.stompT = 0;
    this.stompImpactFired = false;
    return true;
  }

  // Fires exactly once per stomp, the moment the body lands.
  consumeStompImpact() {
    if (this.stompT >= STOMP_IMPACT && !this.stompImpactFired) {
      this.stompImpactFired = true;
      return true;
    }
    return false;
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
    return this.smashT >= 0 || this.stompT >= 0;
  }

  // onStep(side) fires each time a foot lands while moving.
  update(dt, moveVec, speed, sprinting = false, onStep = null) {
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

    // Footfall detection: each sign flip of the gait sine is a foot landing
    const stepSign = Math.sign(Math.sin(this.walkT));
    if (moving && stepSign !== 0 && stepSign !== this.lastStepSign) {
      this.lastStepSign = stepSign;
      this.stepSide = -this.stepSide;
      if (onStep) onStep(this.stepSide);
    }

    const gait = Math.sin(this.walkT) * 0.65 * this.swing;
    this.legL.rotation.x = gait;
    this.legR.rotation.x = -gait;
    this.group.position.y = Math.abs(Math.sin(this.walkT)) * 0.14 * this.swing;

    // Sprint lean + idle breathing
    const targetLean = sprinting && moving ? 0.22 : 0;
    this.lean += (targetLean - this.lean) * Math.min(1, 8 * dt);
    this.body.rotation.x = this.lean;
    this.breatheT += dt;
    if (this.swing < 0.1 && !this.smashing) {
      const b = 1 + Math.sin(this.breatheT * 2.2) * 0.02;
      this.torso.scale.set(b, 1, b);
    } else {
      this.torso.scale.set(1, 1, 1);
    }

    // Bandana tails flutter harder the faster you move
    const flutter = 0.55 + this.swing * 0.5;
    for (let i = 0; i < this.tails.length; i++) {
      this.tails[i].rotation.x = flutter + Math.sin(this.breatheT * 9 + i * 1.7) * (0.12 + this.swing * 0.25);
    }

    if (this.stompT >= 0) {
      this.stompT += dt;
      if (this.stompT >= STOMP_END) {
        this.stompT = -1;
        this.armL.rotation.x = 0;
        this.armR.rotation.x = 0;
      } else {
        // Parabolic hop that lands hard at STOMP_IMPACT
        const hop = this.stompT < STOMP_IMPACT
          ? Math.sin((this.stompT / STOMP_IMPACT) * Math.PI) * 1.6
          : 0;
        this.group.position.y = hop;
        const k = Math.min(1, this.stompT / STOMP_IMPACT);
        const armX = this.stompT < STOMP_IMPACT ? -2.4 * Math.sin(k * Math.PI * 0.9) : 0.6 * (1 - (this.stompT - STOMP_IMPACT) / (STOMP_END - STOMP_IMPACT));
        this.armL.rotation.x = armX;
        this.armR.rotation.x = armX;
        this.head.rotation.x = armX * 0.1;
      }
    } else if (this.smashT >= 0) {
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
