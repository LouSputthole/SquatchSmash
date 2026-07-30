/**
 * Lou, Rippin, Eric and the Prospect, dressed for a Thursday morning.
 *
 * Built on the Bing's `makePerson` and `Npc` — the same slabs, the same faces,
 * the same behaviour class — with golf added on top and nothing else changed.
 * They are recognisably the men from the club because they are literally the
 * figures from the club.
 *
 * The swing is one timeline driven by a single parameter, and every difference
 * between these four is a number on that timeline. Lou takes no practice swing
 * and has picked up his tee before the ball lands. Rippin takes three, and
 * holds the follow-through long after it has stopped being interesting. Eric
 * takes one and does not react to a good one. That is the characterisation,
 * and it is in the data rather than in four hand-written animations.
 */

import * as THREE from 'three';
import { Npc } from '../bing/cast.js';
import { mat } from '../world/build.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { getCharacter } from '../core/characters.js';
import { FOURSOME_BY_ID } from './course.js';
import { heightAt } from './field.js';

/* ------------------------------------------------------------------ */
/* Wardrobe                                                            */
/* ------------------------------------------------------------------ */

/**
 * What each of them turned up in.
 *
 * Lou has no bandana here. Golf is not club business and the photo is
 * authoritative without it — the docs are explicit about that and this is the
 * scene where it reads most clearly: he is not working this morning.
 */
const WARDROBE = {
  [CHARACTER_IDS.LOU]: {
    height: 1.80, build: 1.12, dress: 'shirt', hair: 'receding',
    shirt: 0x2f3a4e, face: 'assets/faces/lou.png', bandana: false,
  },
  [CHARACTER_IDS.RIPPINFLOW]: {
    /* A shirt you can see from the next fairway, which is the intention. */
    height: 1.83, build: 1.05, dress: 'shirt', hair: 'crop',
    shirt: 0x7b3f95, face: 'assets/faces/rippinflow.png', bandana: false,
  },
  [CHARACTER_IDS.ERICAN]: {
    height: 1.76, build: 0.98, dress: 'shirt', hair: 'short',
    shirt: 0xdfe2e8, face: 'assets/faces/erican.png', bandana: false,
  },
  [CHARACTER_IDS.PROSPECT]: {
    /* No face photo and no bandana. He has not earned either. */
    height: 1.79, build: 1.0, dress: 'shirt', hair: 'short',
    shirt: 0x4a5260, bandana: false,
  },
};

/* ------------------------------------------------------------------ */
/* The club in his hands                                               */
/* ------------------------------------------------------------------ */

const CLUB_LOOK = {
  driver: { shaft: 1.10, headW: 0.15, headH: 0.10, headD: 0.11, headColour: 0x1c1c22 },
  iron: { shaft: 0.95, headW: 0.10, headH: 0.08, headD: 0.035, headColour: 0xb9bcc0 },
  putter: { shaft: 0.92, headW: 0.12, headH: 0.035, headD: 0.05, headColour: 0x8d939c },
};

/**
 * A club, hung off the right forearm so it inherits the arm's motion.
 *
 * This is why the swing does not need inverse kinematics: the hands are on the
 * end of the arms and the club is on the end of the hands, so rotating the arm
 * is the swing.
 */
function makeClub(kind = 'iron') {
  const look = CLUB_LOOK[kind] ?? CLUB_LOOK.iron;
  const g = new THREE.Group();

  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.017, 0.015, 0.24, 6),
    mat({ color: 0x1a1a1f, roughness: 0.95 }),
  );
  grip.position.y = -0.10;
  g.add(grip);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.011, look.shaft, 6),
    mat({ color: 0xc8ccd4, roughness: 0.35, metalness: 0.5 }),
  );
  shaft.position.y = -0.22 - look.shaft / 2;
  g.add(shaft);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(look.headW, look.headH, look.headD),
    mat({ color: look.headColour, roughness: 0.4, metalness: 0.45 }),
  );
  head.position.set(look.headW * 0.28, -0.22 - look.shaft - look.headH * 0.3, 0.02);
  g.add(head);

  g.userData.kind = kind;
  return g;
}

/** A stand bag with three clubs sticking out of it. */
export function makeBag(scene, x, z, yaw = 0) {
  const g = new THREE.Group();
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = yaw;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.19, 0.92, 10),
    mat({ color: 0x2b2f3a, roughness: 0.9 }),
  );
  body.position.y = 0.46;
  body.castShadow = true;
  g.add(body);

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.165, 0.165, 0.13, 10),
    mat({ color: 0x7b4fd9, roughness: 0.85 }),
  );
  band.position.y = 0.62;
  g.add(band);

  // Exactly three. That is the joke and also the inventory.
  const kinds = ['driver', 'iron', 'putter'];
  for (let i = 0; i < kinds.length; i++) {
    const a = (i - 1) * 0.30;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 1.0, 5),
      mat({ color: 0xc8ccd4, roughness: 0.4, metalness: 0.5 }),
    );
    shaft.position.set(Math.sin(a) * 0.09, 1.24, Math.cos(a) * 0.09 - 0.04);
    shaft.rotation.x = -0.20;
    shaft.rotation.z = a * 0.5;
    g.add(shaft);
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.017, 0.2, 6),
      mat({ color: 0x1a1a1f, roughness: 0.95 }),
    );
    grip.position.set(Math.sin(a) * 0.13, 1.74, Math.cos(a) * 0.13 - 0.14);
    grip.rotation.x = -0.20;
    grip.rotation.z = a * 0.5;
    g.add(grip);
  }

  scene.add(g);
  return g;
}

/** The ball itself. Small, white, and the only thing anybody is looking at. */
export function makeBall(scene, colour = 0xf4f6f8) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.0213, 12, 10),
    mat({ color: colour, roughness: 0.42 }),
  );
  m.castShadow = true;
  scene.add(m);
  return m;
}

/* ------------------------------------------------------------------ */
/* The swing                                                           */
/* ------------------------------------------------------------------ */

/* One timeline, in normalised time. Everything about a swing is where these
 * three numbers sit and how fast the whole thing is played. */
const TOP = 0.52;        // top of the backswing
const IMPACT = 0.70;     // the ball leaves
const FINISH = 1.0;      // full follow-through

/** Address, top, impact, finish — arm angle, torso turn, torso bend. */
const POSE = {
  address: { arm: 0.62, turn: 0.00, bend: 0.30 },
  top: { arm: -1.15, turn: -0.92, bend: 0.26 },
  impact: { arm: 0.66, turn: 0.14, bend: 0.30 },
  finish: { arm: -1.75, turn: 1.05, bend: 0.10 },
};

function lerp(a, b, t) { return a + (b - a) * t; }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeIn(t) { return t * t; }

export const GOLF_STATE = {
  IDLE: 'idle',
  WALK: 'walk',
  ADDRESS: 'address',
  PRACTICE: 'practice',
  SWING: 'swing',
  WATCH: 'watch',
  PICKUP: 'pickup',
  LEAN: 'lean',
  CART: 'cart',
  MARK: 'mark',
  RETRIEVE: 'retrieve',
};

/**
 * One of the four.
 *
 * Wraps the Bing's `Npc` rather than replacing it: walking, gaze, idle
 * fidgeting and speaking are all still that class's job, and this only takes
 * the body over while a golf pose is running.
 */
export class Golfer {
  constructor(scene, id, { x = 0, z = 0, yaw = 0 } = {}) {
    const who = getCharacter(id);
    const profile = FOURSOME_BY_ID[id];
    if (!who || !profile) throw new Error(`Silver Pines: no golfer "${id}"`);

    this.id = id;
    this.name = who.subtitleName;
    this.full = who.canonicalName;
    this.voice = who.voiceProfile;
    this.tempo = profile.tempo;
    this.practiceSwings = profile.practiceSwings;
    this.watchesBall = profile.watchesBall;

    this.npc = new Npc(scene, {
      name: who.subtitleName,
      tier: 'hero',
      x, z, y: heightAt(x, z), yaw,
      job: 'stand',
      look: true,
      model: { ...WARDROBE[id], role: who.role },
    });
    this.parts = this.npc.parts;
    this.group = this.npc.group;

    /* The club hangs off the right forearm. `foreR` is a group pivoting at the
     * elbow with the forearm running down −Y, so a club parented here points
     * at the ball at address and swings when the arm does. */
    this.club = makeClub('iron');
    this.club.position.y = -0.30;
    this.parts.foreR.add(this.club);

    this.state = GOLF_STATE.IDLE;
    this._t = 0;
    this._swings = 0;
    this._practiceTarget = 0;
    this._onImpact = null;
    this._impactFired = false;
    this._holdFinish = 0;
    this._done = null;
    this._teePicked = false;
  }

  get position() { return this.group.position; }

  /** Put a different club in his hands. */
  setClub(kind) {
    if (this.club?.userData.kind === kind) return;
    this.parts.foreR.remove(this.club);
    this.club = makeClub(kind);
    this.club.position.y = -0.30;
    this.parts.foreR.add(this.club);
  }

  say(secs = 2) { this.npc.say(secs); }

  faceToward(x, z, snap = false) { this.npc.faceToward(x, z, snap); }

  /** Drop him at a spot on the course, standing on the ground. */
  placeAt(x, z, yaw = null) {
    this.group.position.set(x, heightAt(x, z), z);
    if (yaw !== null) {
      this.group.rotation.y = yaw;
      this.npc.homeYaw = yaw;
    }
    this.npc.homeX = x;
    this.npc.homeZ = z;
  }

  /* ---------------------------------------------------------------- */
  /* Golf actions                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Take the stance. Everything from here until the ball is struck is this
   * character standing over it, which is the part Rippin cannot do quietly.
   */
  address({ practice = null } = {}) {
    this.state = GOLF_STATE.ADDRESS;
    this._t = 0;
    this._swings = 0;
    this._practiceTarget = practice ?? this.practiceSwings;
    this._teePicked = false;
    if (this._practiceTarget > 0) {
      this.state = GOLF_STATE.PRACTICE;
    }
    return this;
  }

  /**
   * Swing at it.
   *
   * `onImpact` fires exactly once, at the frame the clubhead reaches the ball,
   * so the ball is launched by the animation rather than alongside it.
   */
  swing({ onImpact = null, onDone = null } = {}) {
    this.state = GOLF_STATE.SWING;
    this._t = 0;
    this._onImpact = onImpact;
    this._impactFired = false;
    this._done = onDone;
    /* How long he stands there admiring it. Lou is already bending down for
     * his tee; Rippin is still holding the finish. */
    this._holdFinish = 0.35 + this.watchesBall * 2.1;
    return this;
  }

  /** Bend down and pick the tee up. Lou does this before the ball lands. */
  pickUpTee() {
    this.state = GOLF_STATE.PICKUP;
    this._t = 0;
    return this;
  }

  /** Stand on the club and wait for somebody to finish being interesting. */
  leanOnClub() {
    this.state = GOLF_STATE.LEAN;
    this._t = 0;
    return this;
  }

  /** Crouch, mark the ball, stand up. */
  markBall() {
    this.state = GOLF_STATE.MARK;
    this._t = 0;
    return this;
  }

  /** Reach into the cup. The nicest animation in golf. */
  retrieveFromCup() {
    this.state = GOLF_STATE.RETRIEVE;
    this._t = 0;
    return this;
  }

  sitInCart() {
    this.state = GOLF_STATE.CART;
    this.npc.sit();
    return this;
  }

  standUp() {
    if (this.state === GOLF_STATE.CART) this.npc.stand();
    this.state = GOLF_STATE.IDLE;
    return this;
  }

  idle() {
    this.state = GOLF_STATE.IDLE;
    this._t = 0;
    return this;
  }

  get busy() {
    return this.state === GOLF_STATE.SWING
      || this.state === GOLF_STATE.PRACTICE
      || this.state === GOLF_STATE.PICKUP
      || this.state === GOLF_STATE.MARK
      || this.state === GOLF_STATE.RETRIEVE;
  }

  /* ---------------------------------------------------------------- */

  update(dt, playerPos) {
    // Idle life, gaze and speech stay the Bing's job.
    this.npc.update(dt, playerPos);
    if (this.state === GOLF_STATE.IDLE
      || this.state === GOLF_STATE.WALK
      || this.state === GOLF_STATE.CART) return;

    this._t += dt;
    switch (this.state) {
      case GOLF_STATE.ADDRESS: this._poseAt(POSE.address); break;
      case GOLF_STATE.PRACTICE: this._practice(); break;
      case GOLF_STATE.SWING: this._swing(); break;
      case GOLF_STATE.WATCH: this._watch(); break;
      case GOLF_STATE.PICKUP: this._pickup(); break;
      case GOLF_STATE.LEAN: this._lean(); break;
      case GOLF_STATE.MARK: this._crouchAction(0.9); break;
      case GOLF_STATE.RETRIEVE: this._crouchAction(1.15); break;
      default: break;
    }
  }

  _poseAt(pose) {
    const p = this.parts;
    p.armL.rotation.x = pose.arm;
    p.armR.rotation.x = pose.arm;
    p.body.rotation.x = pose.bend;
    p.body.rotation.y = pose.turn;
    // The head stays down on the ball while the shoulders turn under it.
    p.head.rotation.y = -pose.turn * 0.45;
    p.head.rotation.x = 0.22 - pose.bend * 0.3;
  }

  /** Interpolate the swing timeline at normalised time `k`. */
  _swingPose(k) {
    if (k < TOP) {
      const t = easeIn(k / TOP);
      return {
        arm: lerp(POSE.address.arm, POSE.top.arm, t),
        turn: lerp(POSE.address.turn, POSE.top.turn, t),
        bend: lerp(POSE.address.bend, POSE.top.bend, t),
      };
    }
    if (k < IMPACT) {
      /* The fast bit. Linear on purpose — easing the downswing makes it look
       * like he changed his mind halfway through. */
      const t = (k - TOP) / (IMPACT - TOP);
      return {
        arm: lerp(POSE.top.arm, POSE.impact.arm, t),
        turn: lerp(POSE.top.turn, POSE.impact.turn, t),
        bend: lerp(POSE.top.bend, POSE.impact.bend, t),
      };
    }
    const t = easeOut(Math.min(1, (k - IMPACT) / (FINISH - IMPACT)));
    return {
      arm: lerp(POSE.impact.arm, POSE.finish.arm, t),
      turn: lerp(POSE.impact.turn, POSE.finish.turn, t),
      bend: lerp(POSE.impact.bend, POSE.finish.bend, t),
    };
  }

  _practice() {
    const dur = 1.05 / this.tempo;
    const k = this._t / dur;
    if (k >= 1) {
      this._swings++;
      this._t = 0;
      if (this._swings >= this._practiceTarget) {
        this.state = GOLF_STATE.ADDRESS;
        this._poseAt(POSE.address);
      }
      return;
    }
    /* A practice swing is a real swing that stops short of the finish — which
     * is exactly why three of them in a row is annoying to stand next to. */
    this._poseAt(this._swingPose(k * 0.82));
  }

  _swing() {
    const dur = 1.15 / this.tempo;
    const k = this._t / dur;

    if (!this._impactFired && k >= IMPACT) {
      this._impactFired = true;
      this._onImpact?.();
    }

    if (k < 1) {
      this._poseAt(this._swingPose(k));
      return;
    }

    this._poseAt(POSE.finish);
    if (this._t > dur + this._holdFinish) {
      /* Lou is bent down getting his tee before the ball has landed; the other
       * two are still watching it. Same branch, different numbers. */
      this.state = this.watchesBall < 0.5 ? GOLF_STATE.PICKUP : GOLF_STATE.WATCH;
      this._t = 0;
      const done = this._done;
      this._done = null;
      done?.();
    }
  }

  _watch() {
    // Holding the finish, chin up, following the ball out.
    const p = this.parts;
    this._poseAt(POSE.finish);
    p.head.rotation.x = -0.12;
    p.head.rotation.y = 0.35;
    if (this._t > 1.2 + this.watchesBall * 1.4) {
      this.state = GOLF_STATE.PICKUP;
      this._t = 0;
    }
  }

  _pickup() {
    const dur = 0.85;
    const k = Math.min(1, this._t / dur);
    // Down, pinch, up.
    const bend = Math.sin(k * Math.PI) * 0.95;
    const p = this.parts;
    p.body.rotation.x = 0.25 + bend;
    p.body.rotation.y *= 0.9;
    p.armR.rotation.x = 0.5 + bend * 0.9;
    p.armL.rotation.x = 0.3;
    p.head.rotation.x = 0.3;
    if (k >= 1) {
      this._teePicked = true;
      this._resetPose();
      this.state = GOLF_STATE.IDLE;
    }
  }

  _lean() {
    const p = this.parts;
    // Both hands stacked on the grip, weight on it, in no hurry at all.
    p.armR.rotation.x = 0.95;
    p.armL.rotation.x = 0.85;
    p.body.rotation.x = 0.12 + Math.sin(this._t * 0.9) * 0.012;
    p.body.rotation.y = 0.10;
  }

  _crouchAction(dur) {
    const k = Math.min(1, this._t / dur);
    const down = Math.sin(k * Math.PI);
    const p = this.parts;
    p.legL.rotation.x = -down * 0.75;
    p.legR.rotation.x = -down * 0.75;
    p.shinL.rotation.x = down * 0.95;
    p.shinR.rotation.x = down * 0.95;
    p.body.rotation.x = 0.15 + down * 0.5;
    p.armR.rotation.x = 0.4 + down * 1.1;
    if (k >= 1) {
      this._resetPose();
      this.state = GOLF_STATE.IDLE;
    }
  }

  _resetPose() {
    const p = this.parts;
    p.armL.rotation.x = 0;
    p.armR.rotation.x = 0;
    p.legL.rotation.x = 0;
    p.legR.rotation.x = 0;
    p.shinL.rotation.x = 0;
    p.shinR.rotation.x = 0;
    p.body.rotation.set(0, 0, 0);
    p.head.rotation.set(0, 0, 0);
  }
}

/**
 * Build the three of them, plus a handle for the Prospect's own figure.
 *
 * The player is first-person and has no body on screen, but he still needs a
 * scorecard line and the others still need something to look at when they turn
 * round, so his position is tracked as a plain object rather than a figure.
 */
export function buildFoursome(scene, marks) {
  const golfers = {};
  for (const id of [CHARACTER_IDS.LOU, CHARACTER_IDS.RIPPINFLOW, CHARACTER_IDS.ERICAN]) {
    const key = id;
    const at = marks[key] ?? { x: 0, z: 0 };
    golfers[id] = new Golfer(scene, id, { x: at.x, z: at.z, yaw: Math.PI });
  }
  return golfers;
}
