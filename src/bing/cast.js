/**
 * Everyone in the Bing.
 *
 * They are people. The sasquatch is the club's mark -- it is on the sign, on
 * the machine, on the bandana half the crew wear -- but the Silver Sasquatches
 * are men and women who drink here, work here, and in Lou's case run the place
 * from a back room with a desk lamp on.
 *
 * One human figure, built from the same primitives as everything else, dressed
 * a dozen ways and driven at three levels of effort:
 *
 *   hero       - Lou, the bouncer, the bartender, the dealer, the guards.
 *                Full animation, gaze tracking, dialogue states.
 *   ambient    - patrons and staff. A short behaviour loop at 20Hz.
 *   background - the far end of the room, updated every sixth frame.
 *
 * Proportions are real ones: 1.78m to the top of the head, eyes at 1.66, which
 * is exactly where the player's camera sits. Standing in front of somebody in
 * here should feel like standing in front of somebody.
 */
import * as THREE from 'three';
import { mat, box, sphere, cylinder, group } from '../world/build.js';
import { rand, pick } from './kit.js';

const SKINS = [0xd9a97f, 0xc08a5e, 0xe8c39c, 0x8d5a3a, 0xf0cba6, 0x6f4529];
const HAIRS = [0x2a1c14, 0x14100e, 0x5a3a20, 0x8a7a5a, 0x9a9a9a, 0x4a2a18];
const SHIRTS = [0x2a2f3a, 0x3a2a2a, 0x1f2b22, 0x2e2438, 0x3a3320, 0x24303a, 0x6a5a3a];
const TRACKSUITS = [0x1c2f4a, 0x3a1c2a, 0x1f3a2a, 0x2a2a1c];
const BANDANA = 0xd92e2e;

/**
 * One person.
 *
 * Built to real proportions, because this is the first level with anybody
 * else in it and a figure that is off by 20% reads as a mannequin from across
 * a room. Seven and a half heads tall, shoulders about a quarter of the
 * height across, elbows at the navel, fingertips at mid-thigh, and a neck.
 * `build` thickens the body without widening the frame -- Lou is a big man,
 * not a big doorway.
 *
 * @param {object} o
 *   height   metres to the top of the head (1.78 is the default adult)
 *   build    1.0 average, 1.4 is Lou
 *   dress    'suit' | 'shirt' | 'tracksuit' | 'tee' | 'waistcoat' | 'bikini' | 'work'
 *   hair     'short' | 'crop' | 'receding' | 'bald' | 'long' | 'tied'
 *   bandana  club colours, worn by the crew and the prospect
 */
export function makePerson(o = {}) {
  const {
    height = 1.78, build = 1, dress = 'shirt', hair = 'short',
    skin = pick(SKINS), hairColour = pick(HAIRS), shirt = pick(SHIRTS),
    bandana = false, chain = false, beard = false, glasses = false,
    gender = 'unspecified', bodyShape = 'average', adult = true,
    castShadow = true,
  } = o;

  const skinMat = mat({ color: skin, roughness: 0.68 });
  const hairMat = mat({ color: hairColour, roughness: 0.96 });
  const performanceWear = dress === 'bikini';
  const cloth = mat({
    color: shirt,
    roughness: performanceWear ? 0.34 : 0.9,
    metalness: performanceWear ? 0.35 : 0,
  });
  const jacketColour = dress === 'suit' ? 0x1b1b22 : shirt;
  const jacket = mat({ color: jacketColour, roughness: 0.88 });
  const trousers = performanceWear
    ? skinMat
    : mat({
      color: dress === 'suit' ? 0x1b1b22 : dress === 'tracksuit' ? shirt : 0x232631,
      roughness: 0.92,
    });
  const shoe = mat({ color: 0x14141a, roughness: 0.5 });
  /* Sleeves: a tee and a bikini leave the arms bare, everything else
   * covers them, and a waistcoat is a shirt with something over the chest. */
  const sleeve = dress === 'tee' || performanceWear
    ? skinMat
    : (dress === 'suit' || dress === 'tracksuit' ? jacket : cloth);

  const g = group('person');
  const body = group('body');
  g.add(body);

  /* Everything below is in metres on a 1.78m frame; `g.scale` handles the
   * rest, so `height` means height. `t` thickens with build; the frame does
   * not, or a heavy man ends up shaped like a wardrobe. */
  const curvy = bodyShape === 'curvy';
  const female = gender === 'female';
  const t = 0.55 + build * 0.45;          // 1.0 at build 1
  const SH = (female ? 0.198 : 0.215) * (0.85 + build * 0.15); // half shoulder width
  const D = (curvy ? 0.145 : 0.135) * t;                       // half chest depth

  /* ---- legs ---- */
  function leg(side) {
    const pivot = group('leg');
    pivot.position.set(side * (curvy ? 0.108 : 0.095) * t, 0.90, 0);
    // Thigh and shin taper, and the knee is a joint rather than a corner
    pivot.add(cylinder({ rTop: 0.085 * t, rBottom: 0.068 * t, h: 0.44, seg: 10, pos: [0, -0.22, 0], mat: trousers }));
    const shin = group('shin');
    shin.position.set(0, -0.44, 0);
    shin.add(sphere({ r: 0.072 * t, pos: [0, 0, 0], mat: trousers }));
    shin.add(cylinder({ rTop: 0.068 * t, rBottom: 0.052 * t, h: 0.42, seg: 10, pos: [0, -0.21, 0], mat: trousers }));
    shin.add(box({ size: [0.095, 0.055, 0.26], pos: [0, -0.44, 0.05], mat: shoe }));
    shin.add(sphere({ r: 0.05, ry: 0.045, rz: 0.06, pos: [0, -0.42, -0.03], mat: shoe }));
    pivot.add(shin);
    return pivot;
  }
  const legL = leg(-1);
  const legR = leg(1);
  g.add(legL, legR);

  /* ---- torso ----
   * Rounded hips, waist, ribcage and shoulders keep the primitive figure
   * human at close range. Earlier box-on-box torsos read as malformed
   * mannequins, especially while a walk cycle moved the narrower limbs. */
  const hipHalf = (curvy ? 0.205 : 0.155) * t * (build > 1.15 ? 1.06 : 1);
  const hips = sphere({
    r: hipHalf,
    ry: curvy ? 0.14 : 0.105,
    rz: curvy ? D * 1.08 : D * 0.94,
    pos: [0, 1.0, 0],
    mat: performanceWear ? cloth : trousers,
  });
  body.add(hips);
  const waist = sphere({
    r: (curvy ? 0.142 : 0.145) * t,
    ry: 0.135,
    rz: D * 0.9,
    pos: [0, 1.15, 0],
    mat: performanceWear ? skinMat : (dress === 'suit' ? jacket : cloth),
  });
  body.add(waist);
  /* A big man is big at the middle, not at the shoulders. Anything over about
   * 1.15 build gets a front on him, which is most of what makes Lou Lou. */
  if (build > 1.15) {
    const heavy = (build - 1) * 0.9;
    // Wide and shallow, sunk into the torso: a front, not a beach ball
    body.add(sphere({
      r: 0.185 * t, ry: 0.135 * t, rz: 0.105 * t,
      pos: [0, 1.18, D * (0.45 + heavy * 0.2)], mat: dress === 'suit' ? jacket : cloth,
    }));
    // The shirt hangs over the belt, so the lower half is still shirt
    body.add(sphere({
      r: 0.165 * t, ry: 0.10 * t, rz: 0.09 * t,
      pos: [0, 1.05, D * (0.3 + heavy * 0.2)], mat: dress === 'suit' ? jacket : cloth,
    }));
  }
  const torso = sphere({
    r: (curvy ? 0.182 : 0.173) * t,
    ry: 0.19,
    rz: D,
    pos: [0, 1.34, 0],
    mat: performanceWear ? skinMat : cloth,
  });
  body.add(torso);
  // Shoulders: a slab the width of the frame, capped with deltoids
  body.add(box({ size: [SH * 2, 0.11, D * 1.95], pos: [0, 1.47, 0], mat: dress === 'suit' || dress === 'tracksuit' ? jacket : cloth }));
  for (const sx of [-1, 1]) {
    body.add(sphere({ r: 0.072 * t, ry: 0.062, pos: [sx * SH, 1.45, 0], mat: sleeve === skinMat ? skinMat : (dress === 'suit' || dress === 'tracksuit' ? jacket : cloth) }));
  }

  // Adult performer silhouette. The coloured rounded forms are the bikini
  // itself, not exposed anatomy: two cups and straps above, a full bottom and
  // rounded rear panels below. It stays non-nude from every camera angle.
  const curves = {};
  if (female && curvy && performanceWear && adult) {
    for (const sx of [-1, 1]) {
      const cup = sphere({
        r: 0.11 * t, ry: 0.105, rz: 0.095,
        pos: [sx * 0.09 * t, 1.39, D * 0.92],
        mat: cloth,
      });
      cup.name = `performer.bikini-top.${sx < 0 ? 'left' : 'right'}`;
      body.add(cup);
      curves[sx < 0 ? 'bustL' : 'bustR'] = cup;

      const rear = sphere({
        r: 0.118 * t, ry: 0.112, rz: 0.105,
        pos: [sx * 0.10 * t, 1.02, -D * 0.72],
        mat: cloth,
      });
      rear.name = `performer.bikini-bottom.rear.${sx < 0 ? 'left' : 'right'}`;
      body.add(rear);
      curves[sx < 0 ? 'rearL' : 'rearR'] = rear;

      const strap = box({
        name: `performer.bikini-top.strap.${sx < 0 ? 'left' : 'right'}`,
        size: [0.024, 0.26, 0.018],
        pos: [sx * 0.12, 1.49, D * 1.08],
        mat: cloth,
      });
      strap.rotation.z = sx * -0.12;
      body.add(strap);
    }
    const topBand = box({
      name: 'performer.bikini-top.band',
      size: [0.34 * t, 0.055, 0.028],
      pos: [0, 1.31, D * 1.05],
      mat: cloth,
    });
    const bottomBand = box({
      name: 'performer.bikini-bottom.band',
      size: [0.36 * t, 0.15, D * 1.94],
      pos: [0, 1.03, 0],
      mat: cloth,
    });
    body.add(topBand, bottomBand);
    curves.topBand = topBand;
    curves.bottomBand = bottomBand;
  }

  if (dress === 'suit') {
    // A jacket is a slightly bigger torso with a shirt front cut out of it
    body.add(box({ size: [0.365 * t, 0.46, D * 2.1], pos: [0, 1.28, 0], mat: jacket }));
    body.add(box({ size: [0.075, 0.36, 0.02], pos: [0, 1.36, D * 1.06], mat: mat({ color: 0xe4e0d8, roughness: 0.9 }) }));
    for (const sx of [-1, 1]) {
      const lap = box({ size: [0.07, 0.26, 0.02], pos: [sx * 0.06, 1.36, D * 1.07], mat: jacket });
      lap.rotation.z = sx * 0.22;
      body.add(lap);
    }
    body.add(box({ size: [0.038, 0.2, 0.018], pos: [0, 1.35, D * 1.09], mat: mat({ color: 0x6a1a24, roughness: 0.7 }) }));
  }
  if (dress === 'waistcoat') {
    body.add(box({ size: [0.35 * t, 0.32, D * 2.06], pos: [0, 1.34, 0], mat: mat({ color: 0x191920, roughness: 0.82 }) }));
    body.add(box({ size: [0.075, 0.05, 0.02], pos: [0, 1.5, D * 1.05], mat: mat({ color: 0x6a1a24, roughness: 0.6 }) }));
  }
  if (dress === 'work') {
    body.add(box({ size: [0.35 * t, 0.22, D * 2.06], pos: [0, 1.1, 0], mat: mat({ color: 0x2a2a30, roughness: 0.95 }) }));
  }
  if (chain) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.009, 6, 18), mat({ color: 0xd9b64a, roughness: 0.2, metalness: 0.95 }));
    ring.position.set(0, 1.44, D * 1.4);
    ring.rotation.x = 1.42;
    body.add(ring);
  }

  /* ---- head ----
   * Sat on a neck, with a jaw, a nose and a brow. The features are small and
   * the brow is what actually reads at three metres. */
  const head = group('head');
  head.position.set(0, 1.50, 0);
  head.add(cylinder({ rTop: 0.048, rBottom: 0.056, h: 0.10, seg: 10, pos: [0, 0.04, -0.005], mat: skinMat }));
  head.add(sphere({ r: 0.093, ry: 0.108, rz: 0.10, pos: [0, 0.165, 0], mat: skinMat }));
  head.add(box({ size: [0.115, 0.085, 0.075], pos: [0, 0.115, 0.045], mat: skinMat }));   // jaw
  head.add(sphere({ r: 0.045, ry: 0.035, rz: 0.03, pos: [0, 0.09, 0.05], mat: skinMat })); // chin
  for (const sx of [-1, 1]) {
    head.add(sphere({ r: 0.019, ry: 0.028, rz: 0.012, pos: [sx * 0.088, 0.165, -0.005], mat: skinMat }));
  }
  head.add(box({ size: [0.12, 0.022, 0.03], pos: [0, 0.203, 0.078], mat: skinMat }));      // brow
  const eyes = [];
  for (const sx of [-1, 1]) {
    head.add(sphere({ r: 0.016, ry: 0.012, rz: 0.01, pos: [sx * 0.034, 0.181, 0.083], mat: mat({ color: 0xf2f0ec, roughness: 0.35 }) }));
    const iris = sphere({ r: 0.007, pos: [sx * 0.034, 0.181, 0.09], mat: mat({ color: pick([0x3a2a18, 0x2a3a4a, 0x2a4a2a]), roughness: 0.3 }) });
    head.add(iris);
    eyes.push(iris);
  }
  head.add(box({ size: [0.022, 0.042, 0.028], pos: [0, 0.158, 0.092], mat: skinMat }));    // nose
  const mouth = box({ size: [0.042, 0.009, 0.012], pos: [0, 0.112, 0.082], mat: mat({ color: 0x8a4a48, roughness: 0.6 }) });
  head.add(mouth);

  if (hair !== 'bald') {
    const cap = sphere({ r: 0.098, ry: 0.1, rz: 0.104, pos: [0, 0.178, -0.008], mat: hairMat });
    if (hair === 'receding') {
      cap.scale.set(0.094, 0.08, 0.09);
      cap.position.set(0, 0.204, -0.022);
    }
    if (hair === 'crop') cap.scale.multiplyScalar(0.98);
    head.add(cap);
    if (hair === 'long') {
      head.add(box({ size: [0.17, 0.19, 0.12], pos: [0, 0.09, -0.055], mat: hairMat }));
    }
    if (hair === 'tied') {
      head.add(sphere({ r: 0.042, pos: [0, 0.15, -0.115], mat: hairMat }));
    }
  }
  if (beard) {
    head.add(box({ size: [0.115, 0.075, 0.07], pos: [0, 0.105, 0.045], mat: hairMat }));
  }
  if (glasses) {
    for (const sx of [-1, 1]) {
      head.add(box({ size: [0.042, 0.032, 0.004], pos: [sx * 0.034, 0.181, 0.096], mat: mat({ color: 0x14141a, roughness: 0.35 }) }));
    }
    head.add(box({ size: [0.03, 0.004, 0.004], pos: [0, 0.181, 0.096], mat: mat({ color: 0x14141a, roughness: 0.35 }) }));
  }
  if (bandana) {
    head.add(box({ size: [0.185, 0.048, 0.195], pos: [0, 0.222, -0.006], mat: mat({ color: BANDANA, roughness: 0.92 }) }));
    const tail = box({ size: [0.035, 0.115, 0.018], pos: [0.012, 0.185, -0.1], mat: mat({ color: BANDANA, roughness: 0.92 }) });
    tail.rotation.x = 0.5;
    head.add(tail);
  }
  body.add(head);

  /* ---- arms ----
   * Elbow at the navel, fingertips at mid-thigh. The forearm is its own group
   * so a raised glass or a dealt card bends at the right place.
   */
  function arm(side) {
    const pivot = group('arm');
    pivot.position.set(side * SH, 1.44, 0);
    pivot.add(cylinder({ rTop: 0.055 * t, rBottom: 0.046 * t, h: 0.30, seg: 9, pos: [0, -0.15, 0], mat: sleeve }));
    const fore = group('forearm');
    fore.position.set(0, -0.30, 0);
    fore.add(sphere({ r: 0.048 * t, pos: [0, 0, 0], mat: sleeve }));
    fore.add(cylinder({ rTop: 0.046 * t, rBottom: 0.038 * t, h: 0.27, seg: 9, pos: [0, -0.135, 0], mat: dress === 'waistcoat' ? cloth : sleeve }));
    fore.add(sphere({ r: 0.042, ry: 0.055, rz: 0.028, pos: [0, -0.3, 0.005], mat: skinMat }));
    pivot.add(fore);
    pivot.userData.fore = fore;
    return pivot;
  }
  const armL = arm(-1);
  const armR = arm(1);
  body.add(armL, armR);

  const heightScale = height / 1.78;
  g.scale.setScalar(heightScale);
  g.userData.profile = {
    adult,
    gender,
    bodyShape,
    outfit: dress,
    height,
  };
  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = castShadow;
      m.receiveShadow = false;
    }
  });

  /* box() and sphere() in world/build.js put an object's SIZE in its scale --
   * they all share one unit geometry. So anything animated by scale has to be
   * animated relative to what it already is, or it snaps to a one-metre cube.
   * Breathing did exactly that, and the club filled up with pale boxes. */
  torso.userData.base = torso.scale.clone();
  mouth.userData.base = mouth.scale.clone();

  return {
    group: g, body, head, eyes, mouth, torso, waist, hips, curves,
    profile: g.userData.profile,
    heightScale,
    armL, armR, legL, legR,
    foreL: armL.userData.fore, foreR: armR.userData.fore,
    shinL: legL.children.find((c) => c.name === 'shin'),
    shinR: legR.children.find((c) => c.name === 'shin'),
  };
}

/* ------------------------------------------------------------------ */
/* Behaviour                                                           */
/* ------------------------------------------------------------------ */

const _v = new THREE.Vector3();

export class Npc {
  /**
   * @param {object} o
   *   name, tier ('hero' | 'ambient' | 'background')
   *   x, z, yaw, y
   *   job: 'stand' | 'sit' | 'lean' | 'work' | 'deal' | 'dance' | 'patrol' | 'drink'
   */
  constructor(scene, o = {}) {
    const {
      name = 'somebody', tier = 'ambient', x = 0, z = 0, yaw = 0, y = 0,
      job = 'stand', look = true, route = null, model = {}, colliders = null,
    } = o;
    this.name = name;
    this.tier = tier;
    this.job = job;
    this.look = look;
    this.route = route;
    this.routeAt = 0;
    this.colliders = colliders;
    this.parts = makePerson({
      ...model,
      castShadow: model.castShadow ?? tier === 'hero',
    });
    this.group = this.parts.group;
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    this.group.userData.npc = {
      name,
      tier,
      role: model.role ?? null,
      ...this.parts.profile,
    };
    this.homeYaw = yaw;
    this.baseY = y;
    scene.add(this.group);

    this.t = rand(0, 10);
    this.phase = rand(0, 6.28);
    this.gaze = 0;
    this.speaking = 0;
    this.folded = false;
    this.targetYaw = undefined;
    this._acc = 0;
    this._every = 0;
    this._lastJob = null;
    this._syncJob(true);
  }

  get position() { return this.group.position; }

  /**
   * Fold at the hips and the knees and drop onto the seat.
   *
   * The drop is 0.42 because that is where the chairs in here are: thighs
   * horizontal at seat height, shins vertical, feet on the floor. Getting it
   * wrong by ten centimetres is the difference between sitting down and
   * hovering, and everybody in this club is sitting down.
   */
  sit() {
    this._neutralPose();
    this.seated = true;
    this.parts.legL.rotation.x = -1.45;
    this.parts.legR.rotation.x = -1.45;
    this.parts.shinL.rotation.x = 1.4;
    this.parts.shinR.rotation.x = 1.4;
    this.parts.armL.rotation.x = -0.5;
    this.parts.armR.rotation.x = -0.5;
    this.parts.foreL.rotation.x = -0.5;
    this.parts.foreR.rotation.x = -0.5;
    this.group.position.y = this.baseY - 0.42 * this.parts.heightScale;
  }

  stand() {
    this._neutralPose();
    this.seated = false;
    this.group.position.y = this.baseY;
  }

  _neutralPose() {
    this.parts.body.rotation.set(0, 0, 0);
    this.parts.head.rotation.set(0, 0, 0);
    for (const part of [
      this.parts.legL, this.parts.legR, this.parts.shinL, this.parts.shinR,
      this.parts.armL, this.parts.armR, this.parts.foreL, this.parts.foreR,
    ]) {
      part.rotation.set(0, 0, 0);
    }
  }

  _syncJob(force = false) {
    if (!force && this.job === this._lastJob) return;
    if (this.job === 'sit' || this.job === 'drink') this.sit();
    else this.stand();
    // Movers need visually smooth transforms even when their behavioural tier
    // is background. Thirty updates a second removes the old 18 cm jumps
    // without making every idle patron a per-frame actor.
    this._every = this.job === 'patrol' || this.job === 'dance'
      ? 1 / 30
      : this.tier === 'hero' ? 0 : this.tier === 'ambient' ? 1 / 20 : 1 / 6;
    this._lastJob = this.job;
  }

  _navClear(x, z) {
    if (!this.colliders?.length) return true;
    const radius = 0.24;
    for (const b of this.colliders) {
      if (this.baseY > b.max.y || this.baseY + 1.8 < b.min.y) continue;
      const cx = Math.max(b.min.x, Math.min(b.max.x, x));
      const cz = Math.max(b.min.z, Math.min(b.max.z, z));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < radius * radius) return false;
    }
    return true;
  }

  /** Say something: the head moves and one hand comes up for `secs`. */
  say(secs = 2) {
    this.speaking = secs;
  }

  faceToward(x, z, snap = false) {
    const yaw = Math.atan2(x - this.group.position.x, z - this.group.position.z);
    if (snap) this.group.rotation.y = yaw;
    else this.targetYaw = yaw;
    return yaw;
  }

  update(dt, playerPos) {
    this._syncJob();
    if (this._every > 0) {
      this._acc += dt;
      if (this._acc < this._every) return;
      dt = this._acc;
      this._acc = 0;
    }
    this.t += dt;
    const t = this.t + this.phase;

    // Breathing, always. It is most of what separates a person from a prop.
    const breathe = 1 + Math.sin(t * 1.5) * 0.02;
    const base = this.parts.torso.userData.base;
    this.parts.torso.scale.set(base.x * breathe, base.y, base.z * breathe);
    if (this.speaking > 0) this.speaking -= dt;
    // Clear transient speaking/job rotations before applying this frame's
    // authored pose. Previously a speaker could keep a tilted head or raised
    // arm forever after the line ended or the job changed.
    this.parts.body.rotation.z = 0;
    this.parts.head.rotation.x = 0;
    this.parts.armL.rotation.y = 0;
    this.parts.armL.rotation.z = 0;
    this.parts.armR.rotation.y = 0;
    this.parts.armR.rotation.z = 0;
    this.parts.foreL.rotation.y = 0;
    this.parts.foreL.rotation.z = 0;
    this.parts.foreR.rotation.y = 0;
    this.parts.foreR.rotation.z = 0;

    switch (this.job) {
      case 'work': {
        // Wiping, pouring, checking the till, and never still
        const cycle = (t * 0.5) % 4;
        if (cycle < 1.6) {
          // Wiping: the shoulder swings a little, the elbow a lot
          this.parts.armR.rotation.x = -0.45 + Math.sin(t * 6) * 0.16;
          this.parts.foreR.rotation.x = -1.0 + Math.sin(t * 6) * 0.3;
          this.parts.armL.rotation.x = -0.2;
          this.parts.foreL.rotation.x = -0.5;
        } else if (cycle < 2.8) {
          // Pouring, both hands up
          this.parts.armR.rotation.x = -0.7;
          this.parts.foreR.rotation.x = -1.1;
          this.parts.armL.rotation.x = -0.6 + Math.sin(t * 2) * 0.08;
          this.parts.foreL.rotation.x = -1.0;
        } else {
          this.parts.armR.rotation.x = -0.25 + Math.sin(t * 1.4) * 0.12;
          this.parts.foreR.rotation.x = -0.85;
          this.parts.armL.rotation.x = -0.25 - Math.sin(t * 1.4) * 0.12;
          this.parts.foreL.rotation.x = -0.8;
        }
        break;
      }
      case 'deal': {
        // Deal, collect, pay, wait. Mostly wait.
        const cycle = (t * 0.6) % 6;
        const swing = cycle < 1 ? Math.sin(cycle * Math.PI) : 0;
        this.parts.armR.rotation.x = -0.32 - swing * 0.35;
        this.parts.foreR.rotation.x = -1.15 - swing * 0.5;
        this.parts.armL.rotation.x = -0.3;
        this.parts.foreL.rotation.x = -1.1;
        break;
      }
      case 'dance': {
        // Clothed, on the beat, and doing this for a living
        const b = t * 3.2;
        this.group.rotation.y = this.homeYaw + Math.sin(b * 0.5) * 0.7;
        this.parts.body.rotation.z = Math.sin(b) * 0.09;
        this.parts.armL.rotation.z = 0.45 + Math.sin(b) * 0.45;
        this.parts.armR.rotation.z = -0.45 - Math.sin(b + 1) * 0.45;
        this.parts.armL.rotation.x = Math.sin(b * 0.5) * 0.5;
        this.parts.armR.rotation.x = Math.sin(b * 0.5 + 2) * 0.5;
        this.group.position.y = this.baseY + Math.abs(Math.sin(b)) * 0.04;
        this.parts.legL.rotation.x = Math.sin(b) * 0.22;
        this.parts.legR.rotation.x = -Math.sin(b) * 0.22;
        break;
      }
      case 'drink': {
        // Sitting with a glass, raising it about once every eight seconds.
        // The shoulder barely moves; it is the elbow that does the work.
        const cycle = t % 8;
        const lift = cycle < 1.4 ? Math.sin((cycle / 1.4) * Math.PI) : 0;
        this.parts.armR.rotation.x = -0.5 - lift * 0.35;
        this.parts.foreR.rotation.x = -0.8 - lift * 1.1;
        this.parts.head.rotation.x = lift > 0.6 ? -0.12 : 0;
        break;
      }
      case 'patrol': {
        this.group.position.y = this.baseY;
        if (this.route && this.route.length > 1) {
          const target = this.route[this.routeAt];
          const dx = target.x - this.group.position.x;
          const dz = target.z - this.group.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.4) {
            this.routeAt = (this.routeAt + 1) % this.route.length;
          } else {
            const speed = 1.1;
            const stepX = (dx / d) * speed * dt;
            const stepZ = (dz / d) * speed * dt;
            let moved = false;
            if (this._navClear(this.group.position.x + stepX, this.group.position.z)) {
              this.group.position.x += stepX;
              moved = true;
            }
            if (this._navClear(this.group.position.x, this.group.position.z + stepZ)) {
              this.group.position.z += stepZ;
              moved = true;
            }
            if (!moved) {
              // An authored waypoint ended up behind furniture. Advance
              // rather than walking through it or vibrating against it.
              this.routeAt = (this.routeAt + 1) % this.route.length;
              break;
            }
            const yaw = Math.atan2(dx, dz);
            const diff = Math.atan2(Math.sin(yaw - this.group.rotation.y), Math.cos(yaw - this.group.rotation.y));
            this.group.rotation.y += diff * Math.min(1, dt * 4);
            const gait = Math.sin(t * 5.2) * 0.42;
            this.parts.legL.rotation.x = gait;
            this.parts.legR.rotation.x = -gait;
            this.parts.armL.rotation.x = -gait * 0.55;
            this.parts.armR.rotation.x = gait * 0.55;
            this.group.position.y = this.baseY + Math.abs(Math.sin(t * 5.2)) * 0.012;
          }
        }
        break;
      }
      case 'lean':
        this.parts.body.rotation.z = 0.05;
        this.parts.armR.rotation.x = -0.25;
        break;
      case 'sit':
        this.parts.armL.rotation.x = -0.5 + Math.sin(t * 0.7) * 0.05;
        this.parts.armR.rotation.x = -0.5 + Math.sin(t * 0.6 + 1) * 0.05;
        break;
      default: {
        this.parts.body.rotation.z = Math.sin(t * 0.4) * 0.018;
        if (this.folded) {
          // Arms crossed: shoulders in, elbows hard, forearms across the chest
          this.parts.armL.rotation.set(-0.35, 0, 0.42);
          this.parts.armR.rotation.set(-0.35, 0, -0.42);
          this.parts.foreL.rotation.set(-1.45, 0.55, 0);
          this.parts.foreR.rotation.set(-1.45, -0.55, 0);
        } else {
          this.parts.armL.rotation.x = Math.sin(t * 0.5) * 0.045;
          this.parts.armR.rotation.x = Math.sin(t * 0.5 + 1) * 0.045;
        }
      }
    }

    // Talking: the jaw works, the head nods, one hand does the explaining
    if (this.speaking > 0) {
      const mb = this.parts.mouth.userData.base;
      this.parts.mouth.scale.set(mb.x, mb.y * (1 + Math.abs(Math.sin(t * 11)) * 2.6), mb.z);
      this.parts.head.rotation.x = Math.sin(t * 6) * 0.05;
      this.parts.armR.rotation.x = -0.35 + Math.sin(t * 4.5) * 0.14;
      this.parts.armR.rotation.z = -0.18;
      this.parts.foreR.rotation.x = -1.0 + Math.sin(t * 4.5 + 1) * 0.35;
    } else {
      this.parts.mouth.scale.copy(this.parts.mouth.userData.base);
    }

    // Heroes track the player once he is close enough to matter
    if (this.look && playerPos) {
      _v.copy(playerPos).sub(this.group.position);
      const dist = _v.length();
      if (dist < 7) {
        const want = Math.atan2(_v.x, _v.z) - this.group.rotation.y;
        const wrapped = Math.atan2(Math.sin(want), Math.cos(want));
        this.gaze += (Math.max(-1.0, Math.min(1.0, wrapped)) - this.gaze) * Math.min(1, dt * 3);
      } else {
        this.gaze += (0 - this.gaze) * Math.min(1, dt * 2);
      }
      this.parts.head.rotation.y = this.gaze;
    }

    if (this.targetYaw !== undefined) {
      const diff = Math.atan2(Math.sin(this.targetYaw - this.group.rotation.y), Math.cos(this.targetYaw - this.group.rotation.y));
      this.group.rotation.y += diff * Math.min(1, dt * 5);
    }
  }
}

/* ------------------------------------------------------------------ */
/* The population                                                      */
/* ------------------------------------------------------------------ */

/**
 * Twenty-nine people, which is a busy Tuesday.
 * @returns {{ all: Npc[], byName: Object<string, Npc> }}
 */
export function populate(scene, club) {
  const a = club.anchors;
  const all = [];
  const by = {};
  const add = (key, npc) => {
    npc.colliders ??= club.colliders;
    all.push(npc);
    if (key) by[key] = npc;
    return npc;
  };

  /* ---- heroes ---- */

  // Lou: broad, heavy-lidded, patterned short-sleeve shirt, gold chain, and a
  // hairline that lost interest some years ago.
  add('lou', new Npc(scene, {
    name: 'Lou', tier: 'hero', job: 'sit',
    x: a.louSeat.x, z: a.louSeat.z, yaw: 0,
    model: {
      height: 1.8, build: 1.4, dress: 'shirt', shirt: 0x6a5a3a,
      hair: 'receding', hairColour: 0x4a4a48, chain: true, skin: 0xd2a074,
    },
  }));

  add('bouncer', new Npc(scene, {
    name: 'the bouncer', tier: 'hero', job: 'stand',
    x: a.bouncerPost.x, z: a.bouncerPost.z, yaw: Math.PI,
    model: { height: 1.94, build: 1.45, dress: 'tee', shirt: 0x14141a, hair: 'bald', beard: true },
  }));
  by.bouncer.folded = true;

  add('bartender', new Npc(scene, {
    name: 'the bartender', tier: 'hero', job: 'work',
    x: a.bartender.x, z: a.bartender.z, yaw: Math.PI / 2,
    model: { height: 1.7, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'tied' },
  }));

  add('barback', new Npc(scene, {
    name: 'the barback', tier: 'ambient', job: 'work',
    x: a.barback.x, z: a.barback.z, yaw: Math.PI / 2,
    model: { height: 1.74, dress: 'tee', shirt: 0x1f2b22, hair: 'crop' },
  }));

  // The dealer: sharply dressed, older, and says almost nothing
  add('dealer', new Npc(scene, {
    name: 'the dealer', tier: 'hero', job: 'deal',
    x: a.dealer.x, z: a.dealer.z, yaw: 0,
    model: { height: 1.76, build: 0.95, dress: 'waistcoat', shirt: 0xe6e2da, hair: 'short', hairColour: 0x9a9a9a, glasses: true },
  }));

  add('hallGuard', new Npc(scene, {
    name: 'the guard', tier: 'hero', job: 'sit',
    x: a.hallGuard.x, z: a.hallGuard.z, yaw: -Math.PI / 2,
    model: { height: 1.82, build: 1.2, dress: 'tracksuit', shirt: pick(TRACKSUITS), hair: 'crop', bandana: false },
  }));

  add('security', new Npc(scene, {
    name: 'security', tier: 'hero', job: 'patrol',
    x: -6.3, z: -4.5, yaw: 0,
    route: [
      { x: -6.3, z: -4.5 }, { x: -6.3, z: 5.7 },
      { x: -18.5, z: 5.7 }, { x: -18.5, z: -2.3 },
      { x: -6.3, z: -2.3 },
    ],
    model: { height: 1.88, build: 1.3, dress: 'tee', shirt: 0x14141a, hair: 'bald' },
  }));

  add('security2', new Npc(scene, {
    name: 'security', tier: 'ambient', job: 'stand',
    x: 4.5, z: -9.4, yaw: -0.8,
    model: { height: 1.86, build: 1.28, dress: 'tee', shirt: 0x14141a, hair: 'crop', beard: true },
  }));
  by.security2.folded = true;

  add('dj', new Npc(scene, {
    name: 'the DJ', tier: 'ambient', job: 'work',
    x: a.dj.x, z: a.dj.z, yaw: Math.PI + 0.25,
    model: { height: 1.75, dress: 'tee', shirt: 0x2e2438, hair: 'long', bandana: true },
  }));

  /* ---- the stage ---- */
  [...a.poles, a.runway].forEach((p, i) => {
    add(`performer${i}`, new Npc(scene, {
      name: 'a dancer', tier: i === 3 ? 'ambient' : 'background', job: 'dance',
      x: p.x, z: p.z, y: p.y, yaw: 0, look: false,
      model: {
        role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
        height: rand(1.68, 1.76), build: rand(1.02, 1.12), dress: 'bikini',
        shirt: pick([0xd94f9a, 0x9a4fd9, 0xd9c04f, 0x4fd9c0]),
        hair: pick(['long', 'tied']),
      },
    }));
  });

  /* ---- the table ---- */
  const seats = a.blackjackSeats;
  add('contractor', new Npc(scene, {
    name: 'the contractor', tier: 'ambient', job: 'sit',
    x: seats[0].x, z: seats[0].z, yaw: seats[0].faceYaw,
    model: { height: 1.79, build: 1.12, dress: 'shirt', shirt: 0x3a3320, hair: 'short', beard: true },
  }));
  add('regular', new Npc(scene, {
    name: 'the regular', tier: 'ambient', job: 'sit',
    x: seats[4].x, z: seats[4].z, yaw: seats[4].faceYaw,
    model: { height: 1.72, dress: 'tracksuit', shirt: pick(TRACKSUITS), hair: 'receding', glasses: true },
  }));

  /* ---- the floor ---- */
  const seatedSpots = [
    [a.booths[0], 0.6], [a.booths[1], -0.4], [a.booths[3], 0.2],
    [a.booths[5], 0.1], [a.booths[6], -0.2], [a.booths[7], 0.4],
  ];
  seatedSpots.forEach(([spot, off], i) => {
    add(`patron${i}`, new Npc(scene, {
      name: 'a regular', tier: i < 3 ? 'ambient' : 'background', job: i % 2 ? 'drink' : 'sit',
      x: spot.x + off, z: spot.z,
      yaw: spot.x > 0 ? -Math.PI / 2 : (spot.z > 5 ? Math.PI : 0),
      model: {
        height: rand(1.66, 1.9), build: rand(0.95, 1.3),
        dress: pick(['shirt', 'tracksuit', 'suit']),
        hair: pick(['short', 'crop', 'receding', 'long', 'tied']),
        bandana: Math.random() < 0.2,
      },
    }));
  });
  a.tables.slice(0, 3).forEach((t, i) => {
    add(`tabler${i}`, new Npc(scene, {
      name: 'a regular', tier: 'background', job: 'drink',
      x: t.x - 0.85, z: t.z + 0.2, yaw: 1.2,
      model: { height: rand(1.66, 1.84), dress: pick(['shirt', 'tracksuit']), hair: pick(['short', 'crop', 'tied']) },
    }));
  });

  const standing = [[-18.4, 0.6], [-18.4, 4.4], [-17.6, 7.4]];
  standing.forEach(([sx, sz], i) => {
    add(`stander${i}`, new Npc(scene, {
      name: 'a regular', tier: i === 0 ? 'ambient' : 'background', job: 'lean',
      x: sx, z: sz, yaw: -Math.PI / 2,
      model: {
        height: rand(1.68, 1.88), build: rand(1, 1.3),
        dress: pick(['shirt', 'tracksuit']), hair: pick(['short', 'crop', 'bald']),
      },
    }));
  });

  add('waiter1', new Npc(scene, {
    name: 'a waitress', tier: 'ambient', job: 'patrol',
    x: -10, z: 5, yaw: 0,
    route: [{ x: -10, z: 5 }, { x: -17, z: 2 }, { x: -19, z: 6.5 }, { x: -8, z: 8 }],
    model: { height: 1.68, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'tied' },
  }));
  add('waiter2', new Npc(scene, {
    name: 'a waiter', tier: 'background', job: 'patrol',
    x: -4, z: 2, yaw: 0,
    route: [{ x: -4, z: 2 }, { x: -13, z: -1 }, { x: -6, z: 6 }],
    model: { height: 1.77, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'crop' },
  }));
  add('cleaner', new Npc(scene, {
    name: 'the cleaner', tier: 'background', job: 'work',
    x: 6.9, z: 1.4, yaw: Math.PI,
    model: { height: 1.64, dress: 'work', shirt: 0x3a3a42, hair: 'tied', skin: 0x8d5a3a },
  }));
  add('delivery', new Npc(scene, {
    name: 'a delivery driver', tier: 'background', job: 'patrol',
    x: 22.5, z: 8, yaw: Math.PI,
    route: [{ x: 22.5, z: 8 }, { x: 22.5, z: -4 }, { x: 24, z: -5 }, { x: 22.5, z: 8 }],
    model: { height: 1.8, build: 1.15, dress: 'work', shirt: 0x3a3320, hair: 'crop', beard: true },
  }));

  // Two by the coat check with opinions about the butcher union
  add('gossip1', new Npc(scene, {
    name: 'a regular', tier: 'ambient', job: 'stand',
    x: -1.2, z: 9.4, yaw: 1.9,
    model: { height: 1.81, build: 1.15, dress: 'tracksuit', shirt: pick(TRACKSUITS), hair: 'crop', bandana: true },
  }));
  add('gossip2', new Npc(scene, {
    name: 'a regular', tier: 'ambient', job: 'stand',
    x: -0.2, z: 8.6, yaw: -1.2,
    model: { height: 1.74, dress: 'shirt', hair: 'receding', beard: true },
  }));

  return { all, byName: by };
}

/**
 * Lou's associate: sent out to fetch the prospect when he has been playing
 * cards too long. He is not in the room until he is needed.
 */
export function makeAssociate(scene, from, colliders = null) {
  const npc = new Npc(scene, {
    name: "Lou's associate", tier: 'hero', job: 'patrol',
    x: from.x, z: from.z, yaw: 0,
    colliders,
    model: { height: 1.84, build: 1.22, dress: 'tracksuit', shirt: 0x1c2f4a, hair: 'crop', bandana: true },
  });
  npc.group.visible = false;
  return npc;
}

export { BANDANA };
