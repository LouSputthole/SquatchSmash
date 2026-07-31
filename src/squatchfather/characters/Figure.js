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
  // ---- face ----
  iris: 0x3a2a18,       // eye colour, for whoever leans in close
  brow: null,           // defaults to a shade darker than the hair
  browTilt: 0.09,       // radians of arch, outer end up; 0 reads flat
  browHeavy: false,     // thicker, lower brows — the bored-cop look
  lidHeavy: false,      // upper lids drooped over the eye whites
  lipTone: 0x9a6050,    // lip-tone, not lipstick
  hairStyle: 'short',   // 'short' | 'crop'
  temples: null,        // a colour greys the temples (the composed boss look)
};

/**
 * The head, to the game's current character standard (the Bing cast rebuild
 * and Margo, in this scene's own slab language): arched brows, eyes about an
 * eye-width apart with whites, irises and pupils, a two-part nose that stops
 * short of a snout, and a real mouth — an upper lip on the skull and a fuller
 * lower lip riding the jaw so talking reads as a shaped mouth opening.
 *
 * Face meshes are named `sf.face.*` and carry their sizes in userData.dim so
 * the verifier can measure the proportions instead of squinting. Returns the
 * animated pieces: `jaw` (a group the lower lip lives in) and `mouth` (the
 * lower lip itself, opened by scale against userData.base).
 */
export function buildHead(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const b = o.bulk;
  const browColor = o.brow ?? Math.max(0, (o.hair & 0xfefefe) >> 1); // darker than the hair
  const head = new THREE.Group();

  const put = (name, w, h, d, color, x, y, z, rotZ = 0) => {
    const m = box(w, h, d, color, x, y, z);
    m.name = name;
    m.rotation.z = rotZ;
    m.userData.dim = { w, h, d };
    head.add(m);
    return m;
  };

  // Skull and neck stub. The front plane lands at z=0.112; every feature
  // below is placed to clear the plane it stands on.
  put('sf.face.neck', 0.13 * b, 0.12, 0.13, o.skin, 0, 0.0, -0.01);
  const skull = put('sf.face.skull', 0.26 * b, 0.25, 0.235, o.skin, 0, 0.175, -0.005);
  for (const sx of [-1, 1]) {
    put(`sf.face.ear.${sx < 0 ? 'right' : 'left'}`, 0.024, 0.06, 0.036, o.skin, sx * 0.135 * b, 0.17, -0.015);
  }

  // The jaw is a group so the chin and the lower lip drop with it when he
  // talks. Its rest height is what the talk animation returns to.
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.065, 0.008);
  jaw.userData.baseY = jaw.position.y;
  head.add(jaw);
  const jawBox = box(0.2 * b, 0.09, 0.215, o.skin, 0, 0, 0);
  jawBox.name = 'sf.face.jaw';
  jawBox.userData.dim = { w: 0.2 * b, h: 0.09, d: 0.215 };
  jaw.add(jawBox);
  const chin = box(0.09 * b, 0.045, 0.05, o.skin, 0, -0.005, 0.1);
  chin.name = 'sf.face.chin';
  jaw.add(chin);

  // ---- brows and eyes ----
  // Two brows, never a ledge: heavy brows get thicker, not wider, and keep
  // clear skin between them.
  const browH = o.browHeavy ? 0.019 : 0.013;
  const browW = o.browHeavy ? 0.054 : 0.062;
  const browY = o.browHeavy ? 0.234 : 0.244;
  const eyes = [];
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'right' : 'left';
    put(`sf.face.brow.${side}`, browW * b, browH, 0.017, browColor,
      sx * 0.056 * b, browY, 0.118, -sx * o.browTilt);
    put(`sf.face.eye.${side}`, 0.05 * b, 0.028, 0.014, 0xe8e0d4, sx * 0.056 * b, 0.213, 0.1195);
    const iris = put(`sf.face.iris.${side}`, 0.021 * b, 0.021, 0.01, o.iris, sx * 0.056 * b, 0.212, 0.125);
    put(`sf.face.pupil.${side}`, 0.009, 0.01, 0.008, 0x100c0a, sx * 0.056 * b, 0.212, 0.129);
    if (o.lidHeavy) {
      put(`sf.face.lid.${side}`, 0.052 * b, 0.013, 0.016, o.skin, sx * 0.056 * b, 0.2255, 0.1205);
    }
    eyes.push(iris);
  }

  // ---- nose: a bridge and a tip, off the face plane but not a snout ----
  put('sf.face.nose.bridge', 0.026 * b, 0.055, 0.026, o.skin, 0, 0.188, 0.118);
  put('sf.face.nose.tip', 0.034 * b, 0.024, 0.03, o.skin, 0, 0.158, 0.122);

  // ---- mouth: upper lip on the skull, lower lip riding the jaw ----
  put('sf.face.lip.upper', 0.05 * b, 0.009, 0.014, o.lipTone, 0, 0.132, 0.12);
  const mouth = box(0.054 * b, 0.014, 0.016, o.lipTone, 0, 0.054, 0.112);
  mouth.name = 'sf.face.mouth';
  mouth.userData.dim = { w: 0.054 * b, h: 0.014, d: 0.016 };
  mouth.userData.base = { y: mouth.position.y, scaleY: 1 };
  jaw.add(mouth);
  for (const sx of [-1, 1]) {
    const corner = box(0.01, 0.008, 0.012, o.lipTone, sx * 0.03 * b, 0.059, 0.109);
    corner.name = `sf.face.lip.corner.${sx < 0 ? 'right' : 'left'}`;
    corner.rotation.z = sx * 0.35;
    jaw.add(corner);
  }

  // ---- hair ----
  let hair;
  if (o.fur) {
    // A sasquatch does not lose the pelt just because he put on a suit:
    // fur crown, a heavy ridge above the brows, and tufts down the cheeks.
    hair = put('sf.hair.crown', 0.29 * b, 0.08, 0.27, o.hair, 0, 0.325, -0.015);
    put('sf.hair.ridge', 0.15 * b, 0.05, 0.26, o.hair, 0, 0.30, 0.0);
    put('sf.face.brow.ridge', 0.17 * b, 0.032, 0.05, o.hair, 0, 0.262, 0.108);
    put('sf.hair.back', 0.27 * b, 0.22, 0.05, o.hair, 0, 0.17, -0.125);
    for (const sx of [-1, 1]) {
      put(`sf.hair.cheek.${sx < 0 ? 'right' : 'left'}`, 0.035, 0.14, 0.1, o.hair, sx * 0.14 * b, 0.13, 0.02);
    }
  } else if (o.hairStyle === 'crop') {
    // Clipped tight: a low crown, a shadow down the back, thin sides.
    hair = put('sf.hair.crown', 0.27 * b, 0.045, 0.24, o.hair, 0, 0.315, -0.012);
    put('sf.hair.back', 0.265 * b, 0.08, 0.028, o.hair, 0, 0.255, -0.122);
    for (const sx of [-1, 1]) {
      put(`sf.hair.side.${sx < 0 ? 'right' : 'left'}`, 0.02, 0.06, 0.15, o.hair, sx * 0.134 * b, 0.245, -0.025);
    }
  } else {
    // 'short': crown, fringe, back and sides — a barbered head of hair.
    hair = put('sf.hair.crown', 0.28 * b, 0.06, 0.25, o.hair, 0, 0.322, -0.015);
    put('sf.hair.fringe', 0.27 * b, 0.045, 0.032, o.hair, 0, 0.303, 0.104);
    put('sf.hair.back', 0.27 * b, 0.12, 0.035, o.hair, 0, 0.235, -0.122);
    for (const sx of [-1, 1]) {
      put(`sf.hair.side.${sx < 0 ? 'right' : 'left'}`, 0.026, 0.09, 0.17, o.hair, sx * 0.138 * b, 0.24, -0.02);
    }
  }
  if (o.temples && !o.fur) {
    for (const sx of [-1, 1]) {
      put(`sf.hair.temple.${sx < 0 ? 'right' : 'left'}`, 0.024, 0.06, 0.11, o.temples, sx * 0.139 * b, 0.245, 0.035);
    }
  }

  return { group: head, skull, jaw, mouth, eyes, hair };
}

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
  const headKit = buildHead(o);
  neck.add(headKit.group);
  const { jaw, mouth, hair, eyes } = headKit;

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

  return {
    group: g, root, pelvis, torso, neck, jaw, mouth, hair, eyes,
    head: headKit.group, chest, tie, legL, legR, armL, armR,
  };
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

  // Down on the floor, knees up, arms wrapped over the head, shaking — and
  // held there. Eases in from WHATEVER pose he was in (seated diners slide
  // off their chairs), so there is no snap to standing first.
  startCower() {
    this.cowering = true;
    this.gesture = null;
    this.gestureT = 0;
    this.talkT = 0;
    this.leanTarget = 0;
    this.seated = false;
  }

  stopCower() {
    if (!this.cowering) return;
    this.cowering = false;
    this.torso.rotation.x = 0;
    this.neck.rotation.x = 0;
    this.armL.shoulder.rotation.z = 0;
    this.armR.shoulder.rotation.z = 0;
    this.setPose('stand');
  }

  #cowerPose(dt) {
    const k = Math.min(1, dt * 3.2);
    // Two incommensurate sines so the shake never settles into a metronome.
    const tr = Math.sin(this.t * 23) * 0.02 + Math.sin(this.t * 31.7) * 0.013;
    const to = (obj, prop, target) => { obj[prop] += (target - obj[prop]) * k; };
    to(this.pelvis.position, 'y', STAND_PELVIS - 0.44 + tr * 0.1);
    to(this.legL.hip.rotation, 'x', -1.85);
    to(this.legR.hip.rotation, 'x', -1.8);
    this.legL.knee.scale.y = this.legR.knee.scale.y = 1;
    to(this.legL.knee.rotation, 'x', 2.1);
    to(this.legR.knee.rotation, 'x', 2.05);
    to(this.torso.rotation, 'x', 0.72 + tr);
    to(this.neck.rotation, 'x', 0.55);
    to(this.neck.rotation, 'y', 0);
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]]) {
      to(arm.shoulder.rotation, 'x', -2.5 + tr * 2);
      to(arm.shoulder.rotation, 'z', -side * 0.5); // elbows flared out
      to(arm.elbow.rotation, 'x', -1.9);
    }
  }

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
    if (this.cowering) {
      this.#cowerPose(dt);
      return;
    }

    if (this.talkT > 0) {
      this.talkT -= dt;
      // A shaped mouth, not a slab on a hinge: the jaw (chin + lower lip)
      // drops and the lower lip opens tall against its base — the same talk
      // read the Bing's Npcs use, syncopated on two sines so it never loops.
      const j = Math.abs(Math.sin(this.t * 16)) * 0.7 + Math.abs(Math.sin(this.t * 9.3)) * 0.3;
      this.jaw.position.y = this.jaw.userData.baseY - j * 0.038;
      this.mouth.scale.y = 1 + j * 2.4;
      this.mouth.position.y = this.mouth.userData.base.y - (this.mouth.scale.y - 1) * 0.007;
      this.neck.rotation.x = Math.sin(this.t * 3.1) * 0.05;
    } else {
      const k = Math.min(1, dt * 12);
      this.jaw.position.y += (this.jaw.userData.baseY - this.jaw.position.y) * k;
      this.mouth.scale.y += (1 - this.mouth.scale.y) * k;
      this.mouth.position.y += (this.mouth.userData.base.y - this.mouth.position.y) * k;
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
