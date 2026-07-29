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
 * @param {object} o
 *   height   metres to the top of the head (1.78 is the default adult)
 *   build    1.0 average, 1.4 is Lou
 *   dress    'suit' | 'shirt' | 'tracksuit' | 'tee' | 'waistcoat' | 'stage' | 'work'
 *   hair     'short' | 'crop' | 'receding' | 'bald' | 'long' | 'tied'
 *   bandana  club colours, worn by the crew and the prospect
 */
export function makePerson(o = {}) {
  const {
    height = 1.78, build = 1, dress = 'shirt', hair = 'short',
    skin = pick(SKINS), hairColour = pick(HAIRS), shirt = pick(SHIRTS),
    bandana = false, chain = false, beard = false, glasses = false,
  } = o;

  const skinMat = mat({ color: skin, roughness: 0.72 });
  const hairMat = mat({ color: hairColour, roughness: 0.95 });
  const cloth = mat({
    color: shirt,
    roughness: dress === 'stage' ? 0.34 : 0.88,
    metalness: dress === 'stage' ? 0.55 : 0,
  });
  const jacket = mat({ color: dress === 'suit' ? 0x1b1b22 : shirt, roughness: 0.86 });
  const trousers = mat({
    color: dress === 'suit' ? 0x1b1b22 : dress === 'tracksuit' ? shirt : 0x232631,
    roughness: 0.9,
  });
  const shoe = mat({ color: 0x14141a, roughness: 0.55 });

  const g = group('person');
  const body = group('body');
  g.add(body);

  // Scale everything off a 1.78m frame, so `height` is genuinely height
  const S = height / 1.78;
  const W = 0.38 * build;   // shoulder half-width contribution
  const D = 0.21 * build;   // depth

  /* ---- legs ---- */
  function leg(side) {
    const pivot = group('leg');
    pivot.position.set(side * 0.10 * build, 0.88, 0);
    pivot.add(box({ size: [0.16 * build, 0.46, 0.18 * build], pos: [0, -0.23, 0], mat: trousers }));
    pivot.add(box({ size: [0.14 * build, 0.42, 0.16 * build], pos: [0, -0.66, 0.01], mat: trousers }));
    pivot.add(box({ size: [0.15, 0.08, 0.27], pos: [0, -0.885, 0.05], mat: shoe }));
    return pivot;
  }
  const legL = leg(-1);
  const legR = leg(1);
  g.add(legL, legR);

  /* ---- torso ---- */
  const hips = box({ size: [0.31 * build, 0.18, D * 1.05], pos: [0, 0.96, 0], mat: trousers });
  body.add(hips);
  const torso = box({ size: [0.36 * build, 0.42, D], pos: [0, 1.26, 0], mat: cloth });
  body.add(torso);
  // Shoulders: a slab plus two rounded caps, which is what stops a person
  // reading as a wardrobe with a head on it
  body.add(box({ size: [W * 2, 0.13, D * 1.02], pos: [0, 1.44, 0], mat: dress === 'suit' || dress === 'tracksuit' ? jacket : cloth }));
  for (const sx of [-1, 1]) {
    body.add(sphere({ r: 0.085 * build, ry: 0.075, pos: [sx * W, 1.44, 0], mat: dress === 'suit' || dress === 'tracksuit' ? jacket : cloth }));
  }

  if (dress === 'suit') {
    body.add(box({ size: [0.38 * build, 0.44, D * 1.04], pos: [0, 1.26, 0], mat: jacket }));
    body.add(box({ size: [0.1, 0.4, 0.02], pos: [0, 1.28, D * 0.53], mat: mat({ color: 0xe4e0d8, roughness: 0.9 }) }));
    for (const sx of [-1, 1]) {
      const lap = box({ size: [0.08, 0.3, 0.02], pos: [sx * 0.07, 1.3, D * 0.54], mat: jacket });
      lap.rotation.z = sx * 0.2;
      body.add(lap);
    }
    body.add(box({ size: [0.05, 0.22, 0.02], pos: [0, 1.3, D * 0.56], mat: mat({ color: 0x6a1a24, roughness: 0.7 }) }));
  }
  if (dress === 'waistcoat') {
    body.add(box({ size: [0.37 * build, 0.4, D * 1.03], pos: [0, 1.24, 0], mat: mat({ color: 0x191920, roughness: 0.8 }) }));
    body.add(box({ size: [0.11, 0.06, 0.03], pos: [0, 1.42, D * 0.54], mat: mat({ color: 0x6a1a24, roughness: 0.6 }) }));
  }
  if (dress === 'work') {
    body.add(box({ size: [0.38 * build, 0.2, D * 1.04], pos: [0, 1.06, 0], mat: mat({ color: 0x2a2a30, roughness: 0.95 }) }));
  }
  if (chain) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.011, 6, 16), mat({ color: 0xd9b64a, roughness: 0.2, metalness: 0.95 }));
    ring.position.set(0, 1.38, D * 0.45);
    ring.rotation.x = 1.3;
    body.add(ring);
  }

  /* ---- head ---- */
  const head = group('head');
  head.position.set(0, 1.52, 0);
  head.add(cylinder({ r: 0.055, h: 0.09, pos: [0, 0.03, 0], mat: skinMat }));      // neck
  const skull = sphere({ r: 0.105, ry: 0.125, rz: 0.115, pos: [0, 0.16, 0], mat: skinMat });
  head.add(skull);
  head.add(box({ size: [0.13, 0.1, 0.06], pos: [0, 0.115, 0.09], mat: skinMat })); // jaw and chin
  for (const sx of [-1, 1]) {
    head.add(sphere({ r: 0.026, ry: 0.034, pos: [sx * 0.1, 0.16, 0], mat: skinMat })); // ears
  }
  const eyes = [];
  for (const sx of [-1, 1]) {
    const white = sphere({ r: 0.019, pos: [sx * 0.037, 0.175, 0.093], mat: mat({ color: 0xf2f0ec, roughness: 0.4 }) });
    const iris = sphere({ r: 0.009, pos: [sx * 0.037, 0.175, 0.107], mat: mat({ color: pick([0x3a2a18, 0x2a3a4a, 0x2a4a2a]), roughness: 0.35 }) });
    head.add(white, iris);
    eyes.push(iris);
  }
  head.add(box({ size: [0.032, 0.008, 0.012], pos: [-0.037, 0.202, 0.096], mat: hairMat }));
  head.add(box({ size: [0.032, 0.008, 0.012], pos: [0.037, 0.202, 0.096], mat: hairMat }));
  head.add(box({ size: [0.022, 0.03, 0.03], pos: [0, 0.163, 0.108], mat: skinMat })); // nose
  const mouth = box({ size: [0.045, 0.008, 0.01], pos: [0, 0.118, 0.098], mat: mat({ color: 0x8a4a48, roughness: 0.6 }) });
  head.add(mouth);

  if (hair !== 'bald') {
    const cap = sphere({ r: 0.112, ry: 0.115, rz: 0.12, pos: [0, 0.185, -0.008], mat: hairMat });
    if (hair === 'receding') {
      cap.scale.z = 0.8;
      cap.position.z = -0.03;
      cap.position.y = 0.2;
    }
    if (hair === 'crop') cap.scale.multiplyScalar(0.96);
    head.add(cap);
    if (hair === 'long') {
      head.add(box({ size: [0.2, 0.2, 0.14], pos: [0, 0.09, -0.07], mat: hairMat }));
    }
    if (hair === 'tied') {
      head.add(sphere({ r: 0.05, pos: [0, 0.16, -0.13], mat: hairMat }));
    }
  }
  if (beard) {
    head.add(box({ size: [0.13, 0.09, 0.08], pos: [0, 0.108, 0.075], mat: hairMat }));
  }
  if (glasses) {
    for (const sx of [-1, 1]) {
      head.add(box({ size: [0.045, 0.04, 0.005], pos: [sx * 0.037, 0.175, 0.115], mat: mat({ color: 0x14141a, roughness: 0.4 }) }));
    }
  }
  if (bandana) {
    head.add(box({ size: [0.215, 0.055, 0.225], pos: [0, 0.225, -0.005], mat: mat({ color: BANDANA, roughness: 0.92 }) }));
    const tail = box({ size: [0.04, 0.13, 0.02], pos: [0.015, 0.18, -0.115], mat: mat({ color: BANDANA, roughness: 0.92 }) });
    tail.rotation.x = 0.45;
    head.add(tail);
  }
  body.add(head);

  /* ---- arms ---- */
  function arm(side) {
    const pivot = group('arm');
    pivot.position.set(side * (W + 0.02), 1.42, 0);
    const sleeve = dress === 'tee' || dress === 'stage' ? skinMat : (dress === 'suit' || dress === 'tracksuit' ? jacket : cloth);
    pivot.add(cylinder({ r: 0.055 * build, h: 0.3, pos: [0, -0.16, 0], mat: sleeve }));
    pivot.add(cylinder({ r: 0.048 * build, h: 0.28, pos: [0, -0.44, 0], mat: dress === 'waistcoat' ? cloth : sleeve }));
    pivot.add(sphere({ r: 0.05, ry: 0.06, pos: [0, -0.61, 0.01], mat: skinMat }));
    return pivot;
  }
  const armL = arm(-1);
  const armR = arm(1);
  body.add(armL, armR);

  g.scale.setScalar(S);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });

  return { group: g, body, head, eyes, mouth, armL, armR, legL, legR, torso };
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
      job = 'stand', look = true, route = null, model = {},
    } = o;
    this.name = name;
    this.tier = tier;
    this.job = job;
    this.look = look;
    this.route = route;
    this.routeAt = 0;
    this.parts = makePerson(model);
    this.group = this.parts.group;
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
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
    this._every = tier === 'hero' ? 0 : tier === 'ambient' ? 1 / 20 : 1 / 6;

    if (job === 'sit') this.sit();
  }

  get position() { return this.group.position; }

  /** Fold at the hips and knees, and drop to chair height. */
  sit() {
    this.seated = true;
    this.parts.legL.rotation.x = -1.5;
    this.parts.legR.rotation.x = -1.5;
    this.parts.legL.children[1].rotation.x = 1.45;
    this.parts.legR.children[1].rotation.x = 1.45;
    this.group.position.y = this.baseY - 0.34;
  }

  stand() {
    this.seated = false;
    this.parts.legL.rotation.x = 0;
    this.parts.legR.rotation.x = 0;
    this.parts.legL.children[1].rotation.x = 0;
    this.parts.legR.children[1].rotation.x = 0;
    this.group.position.y = this.baseY;
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
    if (this._every > 0) {
      this._acc += dt;
      if (this._acc < this._every) return;
      dt = this._acc;
      this._acc = 0;
    }
    this.t += dt;
    const t = this.t + this.phase;

    // Breathing, always. It is most of what separates a person from a prop.
    const breathe = 1 + Math.sin(t * 1.5) * 0.012;
    this.parts.torso.scale.set(breathe, 1, breathe);
    if (this.speaking > 0) this.speaking -= dt;

    switch (this.job) {
      case 'work': {
        // Wiping, pouring, checking the till, and never still
        const cycle = (t * 0.5) % 4;
        if (cycle < 1.6) {
          this.parts.armR.rotation.x = -0.7 + Math.sin(t * 6) * 0.32;
          this.parts.armL.rotation.x = -0.25;
        } else if (cycle < 2.8) {
          this.parts.armR.rotation.x = -1.15;
          this.parts.armL.rotation.x = -0.95 + Math.sin(t * 2) * 0.1;
        } else {
          this.parts.armR.rotation.x = -0.35 + Math.sin(t * 1.4) * 0.18;
          this.parts.armL.rotation.x = -0.35 - Math.sin(t * 1.4) * 0.18;
        }
        break;
      }
      case 'deal': {
        // Deal, collect, pay, wait. Mostly wait.
        const cycle = (t * 0.6) % 6;
        const swing = cycle < 1 ? Math.sin(cycle * Math.PI) : 0;
        this.parts.armR.rotation.x = -0.6 - swing * 0.75;
        this.parts.armL.rotation.x = -0.55;
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
        // Sitting with a glass, raising it about once every eight seconds
        const cycle = t % 8;
        const lift = cycle < 1.4 ? Math.sin((cycle / 1.4) * Math.PI) : 0;
        this.parts.armR.rotation.x = -0.55 - lift * 1.45;
        this.parts.head.rotation.x = lift > 0.6 ? -0.14 : 0;
        break;
      }
      case 'patrol': {
        if (this.route && this.route.length > 1) {
          const target = this.route[this.routeAt];
          const dx = target.x - this.group.position.x;
          const dz = target.z - this.group.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.4) {
            this.routeAt = (this.routeAt + 1) % this.route.length;
          } else {
            const speed = 1.1;
            this.group.position.x += (dx / d) * speed * dt;
            this.group.position.z += (dz / d) * speed * dt;
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
          this.parts.armL.rotation.x = -1.25;
          this.parts.armR.rotation.x = -1.25;
          this.parts.armL.rotation.z = 0.5;
          this.parts.armR.rotation.z = -0.5;
        } else {
          this.parts.armL.rotation.x = Math.sin(t * 0.5) * 0.045;
          this.parts.armR.rotation.x = Math.sin(t * 0.5 + 1) * 0.045;
        }
      }
    }

    // Talking: the jaw works, the head nods, one hand does the explaining
    if (this.speaking > 0) {
      const m = 0.006 + Math.abs(Math.sin(t * 11)) * 0.022;
      this.parts.mouth.scale.y = m / 0.008;
      this.parts.head.rotation.x = Math.sin(t * 6) * 0.05;
      this.parts.armR.rotation.x = -0.75 + Math.sin(t * 4.5) * 0.3;
      this.parts.armR.rotation.z = -0.22;
    } else {
      this.parts.mouth.scale.y = 1;
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
    x: -6, z: -4, yaw: 0,
    route: [{ x: -6, z: -4 }, { x: -6, z: 6 }, { x: -18, z: 6 }, { x: -18, z: -2 }],
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
        height: rand(1.68, 1.76), dress: 'stage',
        shirt: pick([0xd94f9a, 0x9a4fd9, 0xd9c04f, 0x4fd9c0]),
        hair: pick(['long', 'tied', 'short']),
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
export function makeAssociate(scene, from) {
  const npc = new Npc(scene, {
    name: "Lou's associate", tier: 'hero', job: 'patrol',
    x: from.x, z: from.z, yaw: 0,
    model: { height: 1.84, build: 1.22, dress: 'tracksuit', shirt: 0x1c2f4a, hair: 'crop', bandana: true },
  });
  npc.group.visible = false;
  return npc;
}

export { BANDANA };
