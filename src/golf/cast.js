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
  [CHARACTER_IDS.ERIC]: {
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
  driver: { shaft: 1.10, lean: 0.105, hosel: 0.070, carryAngle: 1.17 },
  iron: { shaft: 0.96, lean: 0.090, hosel: 0.065, carryAngle: 1.02 },
  putter: { shaft: 0.92, lean: 0.065, hosel: 0.060, carryAngle: 0.91 },
};

const UP = new THREE.Vector3(0, 1, 0);

/** A low-poly tube aligned between authored endpoints. */
function tubeBetween(from, to, radius, material, name, segments = 7) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), segments),
    material,
  );
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  mesh.name = name;
  mesh.castShadow = true;
  return mesh;
}

function addDriverHead(group, heel) {
  /* A wood is a volume, not a stretched putter. The crown is deliberately
   * oversized enough to read from the gallery and deep from face to back. */
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 9),
    mat({ color: 0x171a20, roughness: 0.27, metalness: 0.62 }),
  );
  head.name = 'club-head-driver';
  head.scale.set(0.19, 0.105, 0.145);
  head.position.set(heel.x + 0.115, heel.y - 0.025, heel.z + 0.018);
  head.rotation.set(0.04, -0.08, -0.05);
  head.castShadow = true;
  group.add(head);

  const face = new THREE.Mesh(
    new THREE.BoxGeometry(0.205, 0.078, 0.014),
    mat({ color: 0xb8bec6, roughness: 0.35, metalness: 0.78 }),
  );
  face.name = 'club-face-driver';
  face.position.set(heel.x + 0.095, heel.y - 0.035, heel.z - 0.105);
  face.rotation.y = -0.08;
  group.add(face);

  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.012, 0.10),
    mat({ color: 0x7653bd, roughness: 0.48, metalness: 0.35 }),
  );
  sole.position.set(heel.x + 0.12, heel.y - 0.115, heel.z + 0.015);
  sole.rotation.z = -0.05;
  group.add(sole);

  const alignment = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.008, 0.070),
    mat({ color: 0xe8e5d7, roughness: 0.68 }),
  );
  alignment.name = 'club-alignment-driver';
  alignment.position.set(heel.x + 0.135, heel.y + 0.073, heel.z + 0.005);
  group.add(alignment);
}

function addIronHead(group, heel) {
  /* Classic cavity-blade outline: high at the heel, lower toward the toe,
   * thin through the face, with the sole wider than the top line. */
  const outline = new THREE.Shape();
  outline.moveTo(0.000, 0.055);
  outline.lineTo(0.135, 0.030);
  outline.lineTo(0.185, -0.025);
  outline.lineTo(0.160, -0.115);
  outline.lineTo(0.018, -0.098);
  outline.closePath();
  const head = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outline, {
      depth: 0.042, steps: 1, curveSegments: 1,
      bevelEnabled: true, bevelSegments: 1, bevelSize: 0.006, bevelThickness: 0.005,
    }),
    mat({ color: 0xb9bec5, roughness: 0.32, metalness: 0.78 }),
  );
  head.name = 'club-head-iron';
  head.position.set(heel.x - 0.005, heel.y - 0.050, heel.z - 0.021);
  head.rotation.z = -0.08;
  head.castShadow = true;
  group.add(head);

  /* Three dark score lines make the face read as an iron instead of a silver
   * wedge of scenery, even at the low-poly scale of the cast. */
  for (let i = 0; i < 3; i++) {
    const groove = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.004, 0.004),
      mat({ color: 0x555a60, roughness: 0.75, metalness: 0.35 }),
    );
    groove.position.set(heel.x + 0.095, heel.y - 0.070 - i * 0.025, heel.z - 0.027);
    groove.rotation.z = -0.08;
    group.add(groove);
  }

  const cavity = new THREE.Mesh(
    new THREE.BoxGeometry(0.105, 0.060, 0.008),
    mat({ color: 0x60666d, roughness: 0.55, metalness: 0.62 }),
  );
  cavity.name = 'club-cavity-iron';
  cavity.position.set(heel.x + 0.095, heel.y - 0.064, heel.z + 0.027);
  cavity.rotation.z = -0.08;
  group.add(cavity);
}

function addPutterHead(group, heel) {
  /* A blade putter: long heel-to-toe, nearly flat vertically, with a shallow
   * face-to-back body and a contrasting strike insert. */
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.245, 0.038, 0.076),
    mat({ color: 0x777e87, roughness: 0.38, metalness: 0.72 }),
  );
  head.name = 'club-head-putter';
  head.position.set(heel.x + 0.095, heel.y - 0.035, heel.z + 0.006);
  head.rotation.z = -0.025;
  head.castShadow = true;
  group.add(head);

  const insert = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.021, 0.007),
    mat({ color: 0xe6e2d5, roughness: 0.7, metalness: 0.1 }),
  );
  insert.name = 'club-face-putter';
  insert.position.set(heel.x + 0.105, heel.y - 0.036, heel.z - 0.036);
  insert.rotation.z = -0.025;
  group.add(insert);

  const line = new THREE.Mesh(
    new THREE.BoxGeometry(0.010, 0.006, 0.048),
    mat({ color: 0xf0e8c8, roughness: 0.72 }),
  );
  line.name = 'club-alignment-putter';
  line.position.set(heel.x + 0.095, heel.y - 0.013, heel.z + 0.006);
  group.add(line);
}

/**
 * A club, hung off the right forearm so it inherits the arm's motion.
 *
 * This is why the swing does not need inverse kinematics: the hands are on the
 * end of the arms and the club is on the end of the hands, so rotating the arm
 * is the swing.
 */
export function makeClub(kind = 'iron') {
  const look = CLUB_LOOK[kind] ?? CLUB_LOOK.iron;
  const g = new THREE.Group();
  g.name = `golf-club-${kind}`;

  const gripTop = new THREE.Vector3(0, 0.02, 0);
  const shaftTop = new THREE.Vector3(0, -0.23, 0);
  const shaftBottom = new THREE.Vector3(-look.lean, -0.23 - look.shaft, 0);
  const heel = new THREE.Vector3(
    shaftBottom.x + look.hosel,
    shaftBottom.y - (kind === 'putter' ? 0.075 : 0.09),
    kind === 'driver' ? 0.015 : 0,
  );

  const grip = tubeBetween(
    gripTop, shaftTop, 0.017,
    mat({ color: 0x17181c, roughness: 0.94 }),
    'club-grip', 8,
  );
  g.add(grip);

  const shaft = tubeBetween(
    shaftTop, shaftBottom, 0.0095,
    mat({ color: 0xcbd0d6, roughness: 0.26, metalness: 0.82 }),
    'club-shaft', 7,
  );
  g.add(shaft);

  /* The visible angled neck is the detail the old centered box heads lacked:
   * the shaft finishes heel-side, then the hosel turns down and into the head. */
  const hosel = tubeBetween(
    shaftBottom, heel, kind === 'driver' ? 0.013 : 0.011,
    mat({ color: 0xaeb4bc, roughness: 0.3, metalness: 0.78 }),
    'club-hosel', 7,
  );
  g.add(hosel);

  if (kind === 'driver') addDriverHead(g, heel);
  else if (kind === 'putter') addPutterHead(g, heel);
  else addIronHead(g, heel);

  g.userData.kind = kind;
  g.userData.hoselOffset = heel.x - shaftBottom.x;
  g.userData.carryAngle = look.carryAngle;
  return g;
}

/** A proper stand bag with three complete clubs stored head-up. */
export function makeBag(scene, x, z, yaw = 0) {
  const g = new THREE.Group();
  g.name = 'three-club-stand-bag';
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = yaw;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.195, 0.255, 0.90, 12),
    mat({ color: 0x252b36, roughness: 0.78 }),
  );
  body.name = 'bag-body';
  body.position.y = 0.49;
  body.castShadow = true;
  g.add(body);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.245, 0.265, 0.09, 12),
    mat({ color: 0x141820, roughness: 0.86 }),
  );
  base.position.y = 0.045;
  base.castShadow = true;
  g.add(base);

  const opening = new THREE.Mesh(
    new THREE.CylinderGeometry(0.175, 0.175, 0.038, 12),
    mat({ color: 0x080a0e, roughness: 0.96 }),
  );
  opening.name = 'bag-opening';
  opening.position.y = 0.955;
  g.add(opening);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.202, 0.024, 6, 14),
    mat({ color: 0x7252b7, roughness: 0.65, metalness: 0.10 }),
  );
  rim.name = 'bag-rim';
  rim.position.y = 0.962;
  rim.rotation.x = Math.PI / 2;
  g.add(rim);

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.207, 0.220, 0.16, 12),
    mat({ color: 0x6846aa, roughness: 0.72 }),
  );
  band.position.y = 0.73;
  g.add(band);

  const pocket = new THREE.Mesh(
    new THREE.SphereGeometry(1, 10, 7),
    mat({ color: 0x343b48, roughness: 0.82 }),
  );
  pocket.name = 'bag-front-pocket';
  pocket.scale.set(0.165, 0.255, 0.085);
  pocket.position.set(0, 0.42, 0.205);
  pocket.castShadow = true;
  g.add(pocket);

  const patch = new THREE.Mesh(
    new THREE.BoxGeometry(0.105, 0.115, 0.014),
    mat({ color: 0x8a63db, roughness: 0.70 }),
  );
  patch.position.set(0, 0.48, 0.286);
  patch.rotation.x = -0.10;
  g.add(patch);

  const legMaterial = mat({ color: 0xaeb4bc, roughness: 0.42, metalness: 0.62 });
  for (const side of [-1, 1]) {
    const leg = tubeBetween(
      new THREE.Vector3(side * 0.13, 0.72, -0.13),
      new THREE.Vector3(side * 0.29, 0.035, -0.42),
      0.014, legMaterial, 'bag-stand-leg', 6,
    );
    g.add(leg);
  }

  const strapMaterial = mat({ color: 0x11151c, roughness: 0.92 });
  const strapTop = new THREE.Vector3(-0.20, 0.80, 0.00);
  const strapMid = new THREE.Vector3(-0.34, 0.55, 0.02);
  const strapBottom = new THREE.Vector3(-0.22, 0.23, 0.02);
  g.add(tubeBetween(strapTop, strapMid, 0.022, strapMaterial, 'bag-shoulder-strap', 6));
  g.add(tubeBetween(strapMid, strapBottom, 0.022, strapMaterial, 'bag-shoulder-strap', 6));

  /* A club is stored grip-first. Reusing the exact in-hand model means the
   * three heads in the bag cannot drift from the three heads the golfers use. */
  const stored = [
    { kind: 'driver', x: -0.095, z: 0.015, rz: Math.PI + 0.24, ry: 0, rx: 0.045, scale: 0.90 },
    { kind: 'iron', x: 0.070, z: -0.035, rz: Math.PI + 0.015, ry: 0, rx: -0.025, scale: 0.92 },
    { kind: 'putter', x: 0.165, z: 0.030, rz: Math.PI - 0.24, ry: Math.PI, rx: 0.040, scale: 0.90 },
  ];
  for (const spec of stored) {
    const club = makeClub(spec.kind);
    club.name = `bag-${spec.kind}`;
    club.position.set(spec.x, 0.70, spec.z);
    club.rotation.set(spec.rx, spec.ry, spec.rz);
    club.scale.setScalar(spec.scale);
    g.add(club);
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

/**
 * Ground-level finder for the Prospect's ball.
 *
 * The ball remains regulation size. This is a separate translucent course
 * marker, so readability never changes collision or shot physics.
 */
export function makeBallMarker(scene) {
  const group = new THREE.Group();
  group.name = 'player-ball-ground-marker';
  group.userData.radius = 0.52;

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.43, 32),
    new THREE.MeshBasicMaterial({
      color: 0xb998ff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  glow.name = 'ball-marker-glow';
  glow.rotation.x = -Math.PI / 2;
  group.add(glow);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.035, 8, 40),
    new THREE.MeshBasicMaterial({
      color: 0xd8c5ff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    }),
  );
  ring.name = 'ball-marker-ring';
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  scene.add(group);
  return group;
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
    this.club.rotation.x = this.club.userData.carryAngle;
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
    if ([GOLF_STATE.ADDRESS, GOLF_STATE.PRACTICE, GOLF_STATE.SWING,
      GOLF_STATE.WATCH, GOLF_STATE.PICKUP, GOLF_STATE.LEAN,
      GOLF_STATE.MARK, GOLF_STATE.RETRIEVE].includes(this.state)) {
      this._setPlayingClubPose();
    } else {
      this._setCarryClubPose();
    }
  }

  _setCarryClubPose() {
    if (!this.club) return;
    /* Carry the head clear of uneven tee turf. The playing pose restores the
     * authored hand height, so this never changes address or swing geometry. */
    this.club.position.y = -0.24;
    this.club.rotation.set(this.club.userData.carryAngle ?? 0, 0, 0);
  }

  _setPlayingClubPose() {
    if (!this.club) return;
    this.club.position.y = -0.30;
    this.club.rotation.set(0, 0, 0);
  }

  say(secs = 2) { this.npc.say(secs); }

  faceToward(x, z, snap = false) { this.npc.faceToward(x, z, snap); }

  /**
   * Walk over there.
   *
   * Not a route system — a straight line at walking pace with a gait on it.
   * What it is for is that nobody in this scene may ever arrive somewhere by
   * being teleported into it: the group walks from the car park to the tee,
   * and from the carts to their own balls, on their own feet.
   */
  walkTo(x, z, { speed = 1.55, onArrive = null } = {}) {
    this._walk = { x, z, speed, onArrive };
    this.state = GOLF_STATE.WALK;
    this._setCarryClubPose();
    return this;
  }

  get walking() { return !!this._walk; }

  _updateWalk(dt) {
    const w = this._walk;
    const p = this.group.position;
    const dx = w.x - p.x;
    const dz = w.z - p.z;
    const d = Math.hypot(dx, dz);

    if (d < 0.35) {
      this._walk = null;
      this._gait = 0;
      this._resetPose();
      this.state = GOLF_STATE.IDLE;
      w.onArrive?.();
      return;
    }

    const step = Math.min(d, w.speed * dt);
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    p.y = heightAt(p.x, p.z);

    // Face where he is going, without snapping round.
    const want = Math.atan2(dx, dz);
    let diff = want - this.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y += diff * Math.min(1, dt * 6);
    this.npc.homeYaw = this.group.rotation.y;
    this.npc.homeX = p.x;
    this.npc.homeZ = p.z;

    this._gait = (this._gait ?? 0) + dt * w.speed * 3.4;
    const swing = Math.sin(this._gait) * 0.52;
    const parts = this.parts;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.shinL.rotation.x = Math.max(0, -swing) * 0.7;
    parts.shinR.rotation.x = Math.max(0, swing) * 0.7;
    parts.armL.rotation.x = -swing * 0.55;
    parts.armR.rotation.x = swing * 0.55;
    parts.body.rotation.x = 0.04;
  }

  /** Drop him at a spot on the course, standing on the ground. */
  placeAt(x, z, yaw = null) {
    this._walk = null;
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
    this._setPlayingClubPose();
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
    this._setPlayingClubPose();
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
    this._setPlayingClubPose();
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
    this._setCarryClubPose();
    this.npc.sit();
    return this;
  }

  standUp() {
    if (this.state === GOLF_STATE.CART) this.npc.stand();
    this.state = GOLF_STATE.IDLE;
    this._setCarryClubPose();
    return this;
  }

  idle() {
    this.state = GOLF_STATE.IDLE;
    this._t = 0;
    this._setCarryClubPose();
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

    if (this._walk) {
      this._updateWalk(dt);
      return;
    }
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
    this._setPlayingClubPose();
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
    this._setCarryClubPose();
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
  for (const id of [CHARACTER_IDS.LOU, CHARACTER_IDS.RIPPINFLOW, CHARACTER_IDS.ERIC]) {
    const key = id;
    const at = marks[key] ?? { x: 0, z: 0 };
    golfers[id] = new Golfer(scene, id, { x: at.x, z: at.z, yaw: Math.PI });
  }
  return golfers;
}
