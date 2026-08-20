// Shared human character rig for story scenes.
import * as THREE from 'three';
import { markActor } from './staging.js';

// The shared story-scene API is heading/facing/position, update, and
// startSmash/consumeImpact, so a mission can animate Tony or a Circle member
// without inventing another player rig.
//
// `bandana: null` swaps the headband for plain hair (a prospect hasn't
// earned theirs yet). `face` is an optional image URL rendered on the
// front of the head — how real Circle members get their real faces.
export const MEMBER_PALETTE = {
  shirt: 0x9aa0ab,
  shirtDark: 0x6e747f,
  pants: 0x2e3e55,
  skin: 0xe8b88a,
  bandana: 0xd92e2e,
  hair: 0x2a2018,
  face: null,
};

const faceTexCache = new Map();
function faceTexture(url) {
  if (!faceTexCache.has(url)) {
    const tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    faceTexCache.set(url, tex);
  }
  return faceTexCache.get(url);
}

// Punch animation timing (seconds) — matches the Sasquatch smash so
// shared choreography (punch scheduling, impact windows) lines up.
const WINDUP_END = 0.18;
const IMPACT_T = 0.26;
const SMASH_END = 0.5;

function box(w, h, d, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.castShadow = true;
  return m;
}

export class Person {
  constructor(palette = {}) {
    const pal = { ...MEMBER_PALETTE, ...palette };
    this.palette = pal;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // tilts forward when sprinting
    this.group.add(this.body);
    this.heading = 0;
    this.walkT = 0;
    this.swing = 0;
    this.smashT = -1;
    this.impactFired = false;
    this.lean = 0;
    this.breatheT = 0;
    this.lastStepSign = 0;
    this.stepSide = 1;

    // Torso with broad shoulders and a belt line
    const torso = box(0.78, 0.85, 0.42, pal.shirt);
    torso.position.y = 1.62;
    this.body.add(torso);
    this.torso = torso;
    const shoulders = box(0.95, 0.2, 0.46, pal.shirtDark);
    shoulders.position.y = 2.06;
    this.body.add(shoulders);
    const belt = box(0.72, 0.12, 0.4, pal.pants);
    belt.position.y = 1.16;
    this.body.add(belt);

    // Head
    const head = new THREE.Group();
    head.position.set(0, 2.3, 0);
    if (pal.face) {
      // Photo head: the picture on the front, hair/skin wrapping the rest.
      // The photo brings its own hair and eyes, so the blocky ones stay off.
      const wrap = new THREE.MeshLambertMaterial({ color: pal.hair ?? pal.skin });
      const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(pal.face) });
      const skull = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.52, 0.48),
        [wrap, wrap, wrap, wrap, faceMat, wrap] // +z is the face
      );
      skull.castShadow = true;
      head.add(skull);
    } else {
      const skull = box(0.42, 0.46, 0.44, pal.skin);
      head.add(skull);
      const hairTop = box(0.46, 0.16, 0.48, pal.hair);
      hairTop.position.y = 0.26;
      head.add(hairTop);
      for (const s of [-1, 1]) {
        const eye = box(0.06, 0.06, 0.04, 0x232a3d);
        eye.position.set(0.1 * s, 0.04, 0.23);
        head.add(eye);
      }
    }
    this.tails = [];
    if (pal.bandana !== null) {
      // The Circle's red bandana, worn on the brow, tails at the back
      // (photo heads are slightly bigger, so the band widens to fit)
      const bw = pal.face ? 0.56 : 0.48;
      const band = box(bw, 0.13, bw + 0.02, pal.bandana);
      band.position.y = 0.16;
      head.add(band);
      const knot = box(0.13, 0.13, 0.08, pal.bandana);
      knot.position.set(0, 0.1, -(bw / 2 + 0.05));
      head.add(knot);
      for (const s of [-1, 1]) {
        const tail = box(0.08, 0.3, 0.04, pal.bandana);
        tail.position.set(0.06 * s, -0.05, -0.32);
        tail.rotation.x = 0.5;
        tail.rotation.z = 0.25 * s;
        head.add(tail);
        this.tails.push(tail);
      }
    } else {
      // No bandana yet: just more hair
      const back = box(0.46, 0.26, 0.14, pal.hair);
      back.position.set(0, 0.06, -0.2);
      head.add(back);
    }
    this.body.add(head);
    this.head = head;

    // Arms — pivot at the shoulder
    this.armL = this.buildArm(-1);
    this.armR = this.buildArm(1);
    this.body.add(this.armL, this.armR);

    // Legs — pivot at the hip (on the root so the sprint lean doesn't lift them)
    this.legL = this.buildLeg(-1);
    this.legR = this.buildLeg(1);
    this.group.add(this.legL, this.legR);

    // The rig tags its own parts so a machine can find a body, and the front
    // of its head, without knowing which scene built it.  Tags go in userData
    // and NOT in .name on purpose: the geometry gate groups assemblies by
    // name, so naming these parts would move that gate's recorded buckets
    // underneath every scene at once for a change that buys nothing.
    // src/core/staging.js explains what reads these.
    this.group.userData.rig = 'person';
    this.body.userData.rigPart = 'body';
    this.head.userData.rigPart = 'head';
    this.torso.userData.rigPart = 'torso';
    this.armL.userData.rigPart = 'armL';
    this.armR.userData.rigPart = 'armR';
    this.legL.userData.rigPart = 'legL';
    this.legR.userData.rigPart = 'legR';
  }

  /**
   * Opt this body into the staging gate under a stable id.
   *
   * Ids are the scene's to choose because they end up in allowlists; a
   * counter here would renumber every entry the first time a scene added a
   * body in the middle of its cast.
   */
  markAs(spec) {
    markActor(this.group, {
      eyeHeight: this.head.position.y,
      hipHeight: this.legL.position.y,
      ...spec,
    });
    return this;
  }

  buildArm(side) {
    const pal = this.palette;
    const pivot = new THREE.Group();
    pivot.position.set(0.51 * side, 2.02, 0);
    const sleeve = box(0.2, 0.44, 0.22, pal.shirt);
    sleeve.position.y = -0.24;
    pivot.add(sleeve);
    const fore = box(0.17, 0.42, 0.19, pal.skin);
    fore.position.y = -0.66;
    pivot.add(fore);
    const hand = box(0.16, 0.16, 0.17, pal.skin);
    hand.position.y = -0.95;
    pivot.add(hand);
    return pivot;
  }

  buildLeg(side) {
    const pal = this.palette;
    const pivot = new THREE.Group();
    pivot.position.set(0.19 * side, 1.16, 0);
    const leg = box(0.26, 1.1, 0.28, pal.pants);
    leg.position.y = -0.55;
    pivot.add(leg);
    const foot = box(0.28, 0.12, 0.44, 0x1c1c22);
    foot.position.set(0, -1.1, 0.08);
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

  // Returns true exactly once per punch, the moment the fist lands.
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

  // onStep(side) fires each time a foot lands while moving.
  update(dt, moveVec, speed, sprinting = false, onStep = null) {
    const moving = moveVec.lengthSq() > 0.0001;

    if (moving) {
      const target = Math.atan2(moveVec.x, moveVec.z);
      const diff = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      this.heading += diff * Math.min(1, 14 * dt);
      this.group.rotation.y = this.heading;
      // Slower mid-punch so the swing feels planted
      const spd = this.smashing ? speed * 0.35 : speed;
      this.group.position.addScaledVector(moveVec, spd * dt);
      this.walkT += dt * spd * 1.1;
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

    const gait = Math.sin(this.walkT) * 0.7 * this.swing;
    this.legL.rotation.x = gait;
    this.legR.rotation.x = -gait;
    this.group.position.y = Math.abs(Math.sin(this.walkT)) * 0.08 * this.swing;

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
    const flutter = 0.5 + this.swing * 0.5;
    for (let i = 0; i < this.tails.length; i++) {
      this.tails[i].rotation.x = flutter + Math.sin(this.breatheT * 9 + i * 1.7) * (0.12 + this.swing * 0.25);
    }

    if (this.smashT >= 0) {
      // Haymaker: wind the right arm back, swing it through, recover
      this.smashT += dt;
      let armR;
      let armL;
      if (this.smashT < WINDUP_END) {
        const k = this.smashT / WINDUP_END;
        armR = THREE.MathUtils.lerp(0, -2.0, k);
        armL = THREE.MathUtils.lerp(0, 0.5, k);
      } else if (this.smashT < IMPACT_T) {
        const k = (this.smashT - WINDUP_END) / (IMPACT_T - WINDUP_END);
        armR = THREE.MathUtils.lerp(-2.0, 1.35, k);
        armL = THREE.MathUtils.lerp(0.5, -0.4, k);
      } else if (this.smashT < SMASH_END) {
        const k = (this.smashT - IMPACT_T) / (SMASH_END - IMPACT_T);
        armR = THREE.MathUtils.lerp(1.35, 0, k);
        armL = THREE.MathUtils.lerp(-0.4, 0, k);
      } else {
        armR = 0;
        armL = 0;
        this.smashT = -1;
      }
      this.armR.rotation.x = armR;
      this.armL.rotation.x = armL;
      this.head.rotation.x = armR * 0.08;
    } else {
      this.armL.rotation.x = gait * 0.7;
      this.armR.rotation.x = -gait * 0.7;
      this.head.rotation.x = 0;
    }
  }
}
