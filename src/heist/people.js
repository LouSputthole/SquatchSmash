import * as THREE from 'three';
import { makePerson } from '../bing/cast.js';
import { Mouth } from '../core/mouth.js';
import { makePlateCarrier } from './weapons.js';

/**
 * Everybody in THE TAKE, on the campaign's own frame.
 *
 * The owner's first note, repeated for every phase of this mission, was
 * *"Everyone is giant."* He was right and it was measurable: the crew were
 * built from `src/core/person.js`, the Sasquatch Smash rig, whose head sits at
 * 2.30 m with 26 cm of hair on top of it — 2.56 m people standing next to 1.90 m
 * bank customers and 1.78 m police, in a lobby with a 6 m ceiling. The Silver
 * Case had the identical fault and was fixed the same way a day earlier.
 *
 * Everything here goes through `makePerson` from `src/bing/cast.js`: the shared
 * builder, 1.78 m default, eyes at 1.66 which is exactly the player's camera
 * height. Nothing in this file invents a proportion.
 *
 * ## The rig
 *
 * A figure is three nested groups:
 *
 *   root   world position and heading. Poses never touch it, so a body stays
 *          where the level put it.
 *   tilt   the pose's own rotation, about the FIGURE's axes rather than the
 *          world's — which is why a prone hostage lies along the direction she
 *          was facing instead of every body in the room pointing at +Z.
 *   person the `makePerson` part table.
 *
 * Lifting on the tilt is what stops a body lying half-buried in the marble:
 * rotating a 1.7 m figure about a point on the floor puts a third of its
 * thickness through it.
 */

/** Canonical heights, in metres to the top of the head. */
export const HEIST_HEIGHTS = Object.freeze({
  guard: 1.84,
  rearGuard: 1.79,
  manager: 1.75,
  officer: 1.83,
  civilianMin: 1.6,
  civilianMax: 1.9,
});

const HOSTAGE_LOOKS = [
  { dress: 'suit', shirt: 0x2c3138, hair: 'short', skin: 0xc79a72 },
  { dress: 'shirt', shirt: 0x8d939b, hair: 'tied', skin: 0x8c5c3c },
  { dress: 'tracksuit', shirt: 0x36413a, hair: 'crop', skin: 0xe0b58a },
  { dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'receding', skin: 0xd2a074 },
  { dress: 'shirt', shirt: 0x4a5568, hair: 'long', skin: 0xb07a52 },
  { dress: 'work', shirt: 0x51452f, hair: 'bald', skin: 0x9c6c4d, beard: true },
  { dress: 'tee', shirt: 0x6a3f42, hair: 'short', skin: 0xf0cba6 },
  { dress: 'suit', shirt: 0x1f242b, hair: 'crop', skin: 0x7a4f34, glasses: true },
];

const ROLE_LOOKS = {
  teller: { dress: 'waistcoat', shirt: 0xcfd3d8, hair: 'tied' },
  clerk: { dress: 'shirt', shirt: 0xb9c0c8, hair: 'short', glasses: true },
};

const VISUAL_POSE_BY_STATE = Object.freeze({
  startled: 'startled',
  pleading: 'pleading',
  kneeling: 'kneeling',
  prone: 'prone',
  restrained: 'restrained',
  bolting: 'bolting',
  alarm: 'alarm',
  down: 'fallen',
});

const FLOOR_POSES = new Set(['kneeling', 'prone', 'restrained', 'bolting', 'alarm', 'fallen']);

/**
 * One person, plus the poses THE TAKE puts them in.
 *
 * Poses are absolute, not additive: each one clears the rig first, so the same
 * figure can go ambient → pleading → prone → restrained → down in any order
 * without accumulating a limb.
 */
export class HeistFigure {
  constructor({
    name = 'person', x = 0, z = 0, y = 0, yaw = 0, model = {}, tier = 'ambient',
  } = {}) {
    this.root = new THREE.Group();
    this.root.name = name;
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    this.tilt = new THREE.Group();
    this.tilt.name = `${name}-tilt`;
    this.root.add(this.tilt);
    this.parts = makePerson({ castShadow: tier === 'hero', ...model });
    this.tilt.add(this.parts.group);
    this.height = this.parts.profile.height;
    this.scale = this.parts.heightScale;
    this.baseY = y;
    this.pose = 'stand';
    this.phase = Math.random() * 6.28;
    this.tremble = 0;
    this._bounds = new THREE.Box3();
    this._groundBlend = false;
    /* Everybody in this bank can talk, so everybody in it has a working mouth.
     * `makePerson` already builds one (and hides it behind a photographed
     * face); this is the shared driver that opens it on the take rather than
     * on a timer -- src/core/mouth.js. `openScale` is the Bing's, because it
     * is the Bing's figure. */
    this.voiceMouth = new Mouth(this.parts, { openScale: 2.6 });
    /** The head pitch a pose left, so a photo face can nod without erasing it. */
    this._poseHeadX = 0;
    this.root.userData.figure = this;
    this.stand();
  }

  get group() { return this.root; }
  get position() { return this.root.position; }

  _clear() {
    const p = this.parts;
    for (const part of [p.armL, p.armR, p.foreL, p.foreR, p.legL, p.legR, p.shinL, p.shinR]) {
      part.rotation.set(0, 0, 0);
    }
    /* Breathing is an animation offset, not authored pose data. Clear it
     * before measuring a floor pose or returning a recycled figure to stand;
     * otherwise `_settle()` bakes whichever breath phase happened to be live
     * into the corpse's floor contact. */
    p.body.position.y = 0;
    p.body.rotation.set(0, 0, 0);
    p.head.rotation.set(0, 0, 0);
    this.tilt.rotation.set(0, 0, 0);
    this.tilt.position.set(0, 0, 0);
  }

  stand() {
    this._clear();
    this.parts.armL.rotation.set(0.06, 0, -0.06);
    this.parts.armR.rotation.set(0.06, 0, 0.06);
    this.pose = 'stand';
    return this;
  }

  /** Frozen where they stand, shoulders up, not yet begging. */
  startled() {
    this._clear();
    this.parts.armL.rotation.set(-0.5, 0, -0.42);
    this.parts.armR.rotation.set(-0.5, 0, 0.42);
    this.parts.foreL.rotation.x = -0.75;
    this.parts.foreR.rotation.x = -0.75;
    this.parts.body.rotation.x = 0.08;
    this.parts.head.rotation.x = -0.12;
    this.pose = 'startled';
    return this;
  }

  /** Hands up, head down, and shaking. The reaction to a muzzle. */
  pleading() {
    this._clear();
    this.parts.armL.rotation.set(-2.18, 0, -0.25);
    this.parts.armR.rotation.set(-2.34, 0, 0.32);
    this.parts.foreL.rotation.set(-1.8, 0, 0.4);
    this.parts.foreR.rotation.set(-1.65, 0, -0.48);
    this.parts.body.rotation.x = 0.12;
    this.parts.head.rotation.x = 0.18;
    this.pose = 'pleading';
    return this;
  }

  /** On the knees, hands laced behind the head. */
  kneeling() {
    this._clear();
    this.parts.legL.rotation.x = -1.5;
    this.parts.legR.rotation.x = -1.5;
    this.parts.shinL.rotation.x = 2.75;
    this.parts.shinR.rotation.x = 2.75;
    this.parts.armL.rotation.set(-2.35, 0, -0.62);
    this.parts.armR.rotation.set(-2.35, 0, 0.62);
    this.parts.foreL.rotation.set(-2.1, 0, 0.3);
    this.parts.foreR.rotation.set(-2.1, 0, -0.3);
    this.parts.body.rotation.x = 0.1;
    this.parts.head.rotation.x = 0.22;
    this.tilt.position.y = -0.44 * this.scale;
    this.pose = 'kneeling';
    return this._settle();
  }

  /**
   * Sit the posed figure back down on the floor.
   *
   * Any pose that rotates the whole figure about a point at its feet swings
   * part of its own thickness below y=0 — that is how bodies end up half inside
   * the marble. Rather than guess a lift per pose, measure the posed figure and
   * put its lowest point exactly on the floor. Costs one Box3 on a pose change,
   * which happens when somebody lies down, not every frame.
   */
  _settle() {
    this.tilt.position.y = 0;
    return this._ground();
  }

  /** Keep the currently interpolated rig touching its authored floor. */
  _ground() {
    this.root.updateMatrixWorld(true);
    const box = this._bounds.setFromObject(this.root);
    if (!Number.isFinite(box.min.y)) return this;
    this.tilt.position.y += this.baseY - box.min.y;
    return this;
  }

  /**
   * Flat, face down, arms up past the head.
   *
   * The tip is on `tilt`, so it is a rotation about the FIGURE's lateral axis:
   * she lies along the way she was facing. Body-space +Y becomes world forward
   * and body-space +Z becomes world down, which is why the arms are raised
   * nearly to vertical here — anything reaching "forward" off the chest would
   * be reaching into the floor.
   */
  prone() {
    this._clear();
    this.tilt.rotation.x = Math.PI / 2;
    this.parts.armL.rotation.set(-2.94, 0, -0.34);
    this.parts.armR.rotation.set(-2.94, 0, 0.34);
    this.parts.foreL.rotation.set(-0.32, 0, 0);
    this.parts.foreR.rotation.set(-0.32, 0, 0);
    this.parts.legL.rotation.x = 0.06;
    this.parts.legR.rotation.x = -0.06;
    this.parts.head.rotation.x = -0.38;
    this.pose = 'prone';
    return this._settle();
  }

  /** Prone, with the wrists together in the small of the back. */
  restrained() {
    this.prone();
    this.parts.armL.rotation.set(-0.55, 0, -0.34);
    this.parts.armR.rotation.set(-0.55, 0, 0.34);
    this.parts.foreL.rotation.set(-2.1, 0, 0.5);
    this.parts.foreR.rotation.set(-2.1, 0, -0.5);
    this.parts.head.rotation.x = -0.26;
    this.pose = 'restrained';
    return this._settle();
  }

  /** Crouched low and moving — somebody who has decided to run for it. */
  bolting() {
    this._clear();
    this.parts.body.rotation.x = 0.42;
    this.parts.armL.rotation.x = -0.22;
    this.parts.armR.rotation.x = -0.22;
    this.parts.foreL.rotation.x = -0.75;
    this.parts.foreR.rotation.x = -0.75;
    this.parts.shinL.rotation.x = 0.1;
    this.parts.shinR.rotation.x = 0.1;
    this.pose = 'bolting';
    return this;
  }

  /** Low, one arm reaching. Somebody going for a switch nobody can see. */
  alarm() {
    this._clear();
    this.parts.body.rotation.x = 0.55;
    this.parts.legL.rotation.x = -0.85;
    this.parts.legR.rotation.x = -0.4;
    this.parts.shinL.rotation.x = 1.5;
    this.parts.shinR.rotation.x = 0.6;
    this.parts.armR.rotation.set(-1.85, 0, 0.15);
    this.parts.foreR.rotation.x = -0.35;
    this.parts.armL.rotation.set(-0.6, 0, -0.3);
    this.parts.head.rotation.x = -0.3;
    this.tilt.position.y = -0.3 * this.scale;
    this.pose = 'alarm';
    return this;
  }

  /**
   * Braced two-handed, which is how a man behind a car door stands.
   *
   * Extracted from `makePoliceFigure`, which used to write these five
   * rotations inline — so an officer who had been knocked down had no way
   * back to the pose he was built in, and a later wave could not put him on
   * his feet again. `spawnPolice`'s recycling calls this.
   */
  aiming() {
    this._clear();
    this.parts.armR.rotation.set(-1.28, 0, 0.16);
    this.parts.foreR.rotation.set(-0.16, 0, 0);
    this.parts.armL.rotation.set(-1.2, 0, -0.34);
    this.parts.foreL.rotation.set(-0.3, 0.3, 0);
    this.pose = 'aiming';
    this._poseFrom = null;
    return this;
  }

  /** Fallen. Not the same shape as prone — nobody chose this one. */
  fallen({ roll = 0.5 } = {}) {
    this._clear();
    this.tilt.rotation.set(Math.PI / 2 - 0.12, 0, roll);
    this.parts.armL.rotation.set(-2.5, 0, -0.9);
    this.parts.armR.rotation.set(-1.9, 0, 0.7);
    this.parts.foreL.rotation.set(-0.6, 0, 0);
    this.parts.legL.rotation.x = -0.35;
    this.parts.legR.rotation.x = 0.2;
    this.parts.shinL.rotation.x = 0.6;
    this.parts.head.rotation.set(0.3, 0.4, 0);
    this.pose = 'fallen';
    return this._settle();
  }

  /* ---------------------------------------------------------------- *
   * Pose blending
   *
   * Owner, on the lobby: *"takedown animations are shaky"*. Two causes, and
   * the first one is the whole of it: **poses were applied in a single
   * frame**. Every method above writes absolute rotations onto the rig and
   * returns, so a standing customer became a prone customer between one
   * `requestAnimationFrame` and the next — a 90° rotation of the whole figure
   * with nothing in between. Twenty-two of those going off across a room as
   * the crowd order lands is not an animation, it is a hard cut per person.
   *
   * The second is `_settle()`. It measures the POSED figure with a Box3 and
   * lifts it onto the floor, so the lift arrives on the same frame as the
   * rotation and the body pops vertically as well as rotating.
   *
   * The fix is to keep every pose function exactly as it is — they are
   * authored poses and they are good — and blend BETWEEN them. `setState`
   * measures the rig, applies the pose, measures it again, puts the rig back
   * where it was, and hands the pair to `update()` to walk across. The
   * settle lift is part of what is measured, so it arrives with the rotation
   * instead of ahead of it.
   * ---------------------------------------------------------------- */

  /** Every joint a pose writes to, in one fixed order. */
  _poseNodes() {
    const p = this.parts;
    return [p.armL, p.armR, p.foreL, p.foreR, p.legL, p.legR, p.shinL, p.shinR, p.body, p.head];
  }

  _capturePose() {
    return {
      rotations: this._poseNodes().map((node) => [node.rotation.x, node.rotation.y, node.rotation.z]),
      tiltRotation: [this.tilt.rotation.x, this.tilt.rotation.y, this.tilt.rotation.z],
      tiltPosition: [this.tilt.position.x, this.tilt.position.y, this.tilt.position.z],
    };
  }

  _applyPose(snapshot) {
    const nodes = this._poseNodes();
    for (let i = 0; i < nodes.length; i++) {
      const [x, y, z] = snapshot.rotations[i];
      nodes[i].rotation.set(x, y, z);
    }
    this.tilt.rotation.set(...snapshot.tiltRotation);
    this.tilt.position.set(...snapshot.tiltPosition);
  }

  /**
   * How long a given change of pose should take.
   *
   * Somebody being told to get on the floor takes most of a second about it.
   * Somebody who has been shot does not, and neither does somebody whose
   * wrists are being tied while they are already lying down.
   */
  static poseDuration(from, to) {
    if (to === 'fallen' || to === 'down') return 0.32;
    if (from === 'prone' && to === 'restrained') return 0.42;
    if (to === 'prone' || to === 'restrained') return 0.72;
    if (to === 'kneeling') return 0.5;
    if (to === 'bolting' || to === 'alarm') return 0.28;
    return 0.34;
  }

  /**
   * @param {string} state one of `HOSTAGE_STATES`
   * @param {object} [options]
   * @param {boolean} [options.blend] false to snap, for a checkpoint restore
   *   or a first build where there is no previous pose to come from.
   * @param {number} [options.roll] authored side fall for the `down` pose.
   * @returns {string} the pose actually applied
   */
  setState(state, { blend = true, roll = undefined } = {}) {
    const requestedPose = VISUAL_POSE_BY_STATE[state] ?? 'stand';
    /* State synchronization is intentionally idempotent. `main.js` may sync a
     * person again when another hostage reacts or a line is spoken; replaying
     * the pose method here would cancel the live blend and jump straight to
     * its endpoint. Explicit checkpoint restores retain the old snap path. */
    if (blend && requestedPose === this.pose) {
      this.root.userData.visualState = this.pose;
      return this.pose;
    }
    const from = this.pose;
    const before = blend ? this._capturePose() : null;
    switch (state) {
      case 'startled': this.startled(); break;
      case 'pleading': this.pleading(); break;
      case 'kneeling': this.kneeling(); break;
      case 'prone': this.prone(); break;
      case 'restrained': this.restrained(); break;
      case 'bolting': this.bolting(); break;
      case 'alarm': this.alarm(); break;
      case 'down': this.fallen(Number.isFinite(roll) ? { roll } : undefined); break;
      default: this.stand(); break;
    }
    /* `visualState` is set from the pose that was ASKED for, not from how far
     * the blend has got. Everything outside this class — the verifier, the
     * interaction prompts, `syncHostageFigure` — is asking a question about
     * the person's state, and the answer to that must not depend on a tween
     * being 40% of the way through. */
    this.root.userData.visualState = this.pose;
    if (before && this.pose !== from) {
      this._poseFrom = before;
      this._poseTo = this._capturePose();
      this._poseElapsed = 0;
      this._poseDuration = HeistFigure.poseDuration(from, this.pose);
      this._groundBlend = FLOOR_POSES.has(from) || FLOOR_POSES.has(this.pose);
      this._applyPose(before);
    } else {
      this._poseFrom = null;
      this._groundBlend = false;
    }
    return this.pose;
  }

  /** Walk the current pose blend forward. Returns true while one is running. */
  _updatePoseBlend(dt) {
    if (!this._poseFrom) return false;
    this._poseElapsed += dt;
    const raw = Math.min(1, this._poseElapsed / this._poseDuration);
    // Smoothstep: a body leaves and arrives at rest, it does not start at
    // full speed. This is the difference between "moved" and "was moved".
    const t = raw * raw * (3 - 2 * raw);
    const nodes = this._poseNodes();
    for (let i = 0; i < nodes.length; i++) {
      const a = this._poseFrom.rotations[i];
      const b = this._poseTo.rotations[i];
      nodes[i].rotation.set(
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      );
    }
    for (const key of ['tiltRotation', 'tiltPosition']) {
      const a = this._poseFrom[key];
      const b = this._poseTo[key];
      const target = key === 'tiltRotation' ? this.tilt.rotation : this.tilt.position;
      target.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    }
    /* Rotating a grounded rig changes which mesh is lowest. A linear blend of
     * the endpoint lifts therefore drives knees and shoulders through the
     * marble midway through the motion. Ground only while the short blend is
     * live; settled poses retain their measured endpoint and pay no per-frame
     * Box3 cost. */
    this.parts.body.position.y = 0;
    if (this._groundBlend) this._ground();
    if (raw >= 1) {
      this._poseFrom = null;
      this._groundBlend = false;
    }
    return true;
  }

  /**
   * Say a line.
   *
   * @param {number} seconds how long the subtitle is up — the fallback's
   *   length when the cue has no recording.
   * @param {object} [take] `{ audio, source }` from `AudioEngine.play()`.
   */
  say(seconds = 2, take = null) {
    this.voiceMouth.speak({ seconds, ...(take || {}) });
    return this;
  }

  /** Cut the line: the mouth shuts whatever the subtitle is still doing. */
  hush() {
    this.voiceMouth.stop();
    return this;
  }

  /** Breathing, the shake that says a person is frightened, and the mouth. */
  update(dt, { fear = 0 } = {}) {
    const talk = this.voiceMouth.update(dt);
    /* The pose blend runs FIRST and writes the joints; the breath and the
     * tremble below are offsets laid on top of whatever it left. */
    const blending = this._updatePoseBlend(dt);
    const fallen = this.pose === 'down' || this.pose === 'fallen';
    if (fallen) {
      /* Down means down. Mansion Siege and Cartel both keep ticking their
       * shared HeistFigure after incapacitation, so the invariant belongs here
       * rather than in three scene loops. */
      this.tremble = 0;
      this.parts.body.position.y = 0;
    } else {
      this.phase += dt * (2.1 + fear * 5);
      this.tremble += (fear - this.tremble) * Math.min(1, dt * 4);
      this.parts.body.position.y = Math.sin(this.phase) * (0.006 + this.tremble * 0.012);
    }
    /**
     * How hard this person is shaking, by what has happened to them.
     *
     * The other half of the owner's *"takedown animations are shaky"*: the
     * tremble was one amplitude at one frequency for everybody who was not
     * dead, so a customer lying face down with their wrists tied vibrated as
     * hard as one who had just been told to move. Somebody already flat and
     * restrained has stopped fighting it; somebody mid-pose is being carried
     * by the blend and does not need a second motion arguing with it.
     */
    const settle = (() => {
      if (this.pose === 'down' || this.pose === 'fallen') return 0;
      if (this.pose === 'restrained') return 0.08;
      if (this.pose === 'prone') return 0.28;
      return 1;
    })();
    const shake = blending
      ? 0
      : Math.sin(this.phase * 1.7) * this.tremble * 0.018 * settle;
    this.parts.body.rotation.z = shake;
    this.parts.head.rotation.z = -shake * 1.4;
    if (!blending && this.pose === 'bolting') {
      /* A bolt is a repeating action, not the single crouched keyframe that
       * names it. Opposite arms and legs carry a compact run cycle while the
       * figure's root remains owned by the scene/navigation layer. */
      const stride = Math.sin(this.phase * 1.2);
      this.parts.armL.rotation.x = -0.22 + stride * 0.68;
      this.parts.armR.rotation.x = -0.22 - stride * 0.68;
      this.parts.foreL.rotation.x = -0.75 - Math.max(0, -stride) * 0.28;
      this.parts.foreR.rotation.x = -0.75 - Math.max(0, stride) * 0.28;
      this.parts.legL.rotation.x = -stride * 0.62;
      this.parts.legR.rotation.x = stride * 0.62;
      this.parts.shinL.rotation.x = 0.1 + Math.max(0, stride) * 0.9;
      this.parts.shinR.rotation.x = 0.1 + Math.max(0, -stride) * 0.9;
      this._ground();
    }
    /* A PHOTOGRAPH CANNOT OPEN ITS MOUTH.
     *
     * The crew wear their real faces on the front of the skull, so there is no
     * geometry to move and drawing a lip over the picture would deface the
     * likeness. Their syllables go into the head instead -- the same envelope,
     * spent where it can be seen.
     *
     * The pitch is an OFFSET from whatever the pose left, captured while the
     * man is quiet. The poses in this file set `head.rotation.x` directly
     * (pleading tips it 0.18 forward, startled tips it back), and a nod that
     * wrote an absolute angle would quietly flatten every one of them. */
    if (!this.voiceMouth.photo) return;
    if (talk === 0) this._poseHeadX = this.parts.head.rotation.x;
    else this.parts.head.rotation.x = (this._poseHeadX ?? 0) - talk * 0.085;
  }

  dispose() {
    this.root.traverse((object) => {
      if (object.isMesh && object.geometry?.dispose) object.geometry.dispose();
    });
    this.root.removeFromParent();
  }
}

/** A lobby civilian, dressed off the roster and sized like a person. */
export function makeHostageFigure({ id, index, role, x, z, yaw }) {
  const look = HOSTAGE_LOOKS[index % HOSTAGE_LOOKS.length];
  const height = HEIST_HEIGHTS.civilianMin
    + ((index * 37) % 100) / 100 * (HEIST_HEIGHTS.civilianMax - HEIST_HEIGHTS.civilianMin);
  return new HeistFigure({
    name: id,
    x, z, yaw,
    tier: index < 6 ? 'hero' : 'ambient',
    model: {
      height: Math.round(height * 100) / 100,
      build: 0.9 + ((index * 13) % 40) / 100,
      bandana: false,
      ...look,
      ...(ROLE_LOOKS[role] ?? {}),
    },
  });
}

/**
 * The bank's own armed man.
 *
 * Uniform, cap, badge and a holstered pistol that comes out on a clock —
 * `setThreatProgress` drives the draw and `setNeutralized` ends it. The old
 * version was six boxes and a sphere; this is a person with a gun on his hip.
 */
export function makeBankGuardFigure({ name, x, z, yaw, height = HEIST_HEIGHTS.guard }) {
  const figure = new HeistFigure({
    name, x, z, yaw, tier: 'hero',
    model: {
      height, build: 1.16, dress: 'work', shirt: 0x27384b, hair: 'crop',
      hairColour: 0x241a14, skin: 0xa9764f, bandana: false,
    },
  });
  /* Body-space coordinates in `makePerson` are absolute metres on the 1.78 m
   * frame — hips at 1.00, waist at 1.15, shoulders at 1.465, head group at
   * 1.50 — and `hips`/`waist` are box() meshes whose SIZE lives in their
   * scale, so nothing may be parented to them. Everything below hangs off
   * `body` or `head` at real heights. */
  const dark = new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9c7a34, metalness: 0.72, roughness: 0.32 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.112, 0.07, 14), dark);
  cap.position.set(0, 0.255, 0);
  cap.name = `${name}-cap`;
  figure.parts.head.add(cap);
  const peak = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.016, 0.085), dark);
  peak.position.set(0, 0.228, 0.125);
  figure.parts.head.add(peak);
  // Named so the level-presentation test can still find a head on this man.
  const headMark = new THREE.Group();
  headMark.name = `${name}-head`;
  figure.parts.head.add(headMark);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), brass);
  badge.position.set(-0.1, 1.3, 0.152);
  badge.name = `${name}-badge`;
  figure.parts.body.add(badge);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.24), dark);
  belt.position.set(0, 1.03, 0);
  figure.parts.body.add(belt);
  const holster = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.06), dark);
  holster.position.set(0.17, 0.94, 0.02);
  holster.name = `${name}-holster`;
  figure.parts.body.add(holster);

  const gun = new THREE.Group();
  gun.name = `${name}-gun`;
  const steel = new THREE.MeshStandardMaterial({ color: 0x2e3338, metalness: 0.7, roughness: 0.36 });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.034, 0.15), steel);
  gun.add(slide);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.085, 0.036), dark);
  grip.position.set(0, -0.055, 0.042);
  grip.rotation.x = -0.22;
  gun.add(grip);
  gun.visible = false;
  /* In the hand, and rotated so the muzzle runs down the forearm: -Z is the
   * project's muzzle axis, rotation.x = -PI/2 maps it to -Y, and raising the
   * arm then points it where the man is looking. */
  gun.position.set(0, -0.32, 0.03);
  gun.rotation.x = -Math.PI / 2;
  figure.parts.foreR.add(gun);

  const root = figure.root;
  root.userData.setThreatProgress = (progress) => {
    const p = Math.max(0, Math.min(1, progress));
    gun.visible = p > 0.12;
    figure.parts.armR.rotation.set(-p * 1.62, 0, p * 0.18);
    figure.parts.foreR.rotation.x = -p * 0.25;
    figure.parts.armL.rotation.set(-p * 0.9, 0, -p * 0.32);
    figure.parts.body.rotation.y = -p * 0.2;
    figure.parts.head.rotation.y = -p * 0.18;
    root.userData.threatProgress = p;
  };
  root.userData.setNeutralized = ({ blend = true } = {}) => {
    gun.visible = false;
    figure.setState('down', { blend, roll: -0.42 });
    root.userData.neutralized = true;
  };
  root.userData.resetThreatPose = () => {
    gun.visible = false;
    figure.stand();
    root.userData.neutralized = false;
    root.userData.threatProgress = 0;
  };
  root.userData.figureRef = figure;
  return figure;
}

/** The manager: a suit, a lanyard, and the case he will not put down. */
export function makeBankManagerFigure({ name, x, z, yaw }) {
  const figure = new HeistFigure({
    name, x, z, yaw, tier: 'hero',
    model: {
      height: HEIST_HEIGHTS.manager, build: 1.06, dress: 'suit', shirt: 0x2b2f36,
      hair: 'receding', hairColour: 0x504336, skin: 0xd2a074, glasses: true, bandana: false,
    },
  });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3120, roughness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9c7a34, metalness: 0.7, roughness: 0.34 });
  const briefcase = new THREE.Group();
  briefcase.name = `${name}-briefcase`;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.1), wood);
  briefcase.add(shell);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 5, 12, Math.PI), brass);
  handle.position.y = 0.15;
  handle.rotation.x = Math.PI / 2;
  briefcase.add(handle);
  briefcase.position.set(0, -0.46, 0.04);
  figure.parts.foreR.add(briefcase);
  const lanyard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.008),
    new THREE.MeshStandardMaterial({ color: 0xd6d2c6, roughness: 0.9 }));
  lanyard.position.set(0.02, 1.26, 0.15);
  lanyard.name = `${name}-badge`;
  figure.parts.body.add(lanyard);
  const headMark = new THREE.Group();
  headMark.name = `${name}-head`;
  figure.parts.head.add(headMark);
  return figure;
}

/**
 * A uniformed officer, for the street and the garage.
 *
 * The old ones were a single 0.72 x 1.78 x 0.52 box each, which is why shooting
 * one made a box vanish. This is a person, so a round lands somewhere on a
 * person and the body stays where it fell.
 */
export function makePoliceFigure({ name, x, z, yaw, index = 0 }) {
  const figure = new HeistFigure({
    name, x, z, yaw, tier: index < 4 ? 'hero' : 'ambient',
    model: {
      height: HEIST_HEIGHTS.officer - (index % 3) * 0.04,
      build: 1.2 + (index % 2) * 0.08,
      dress: 'work', shirt: 0x1f2c3d, hair: 'crop', hairColour: 0x1b1512,
      skin: [0xd2a074, 0x8c5c3c, 0xb07a52][index % 3], bandana: false,
    },
  });
  const vestMat = new THREE.MeshStandardMaterial({ color: 0x13161a, roughness: 0.92 });
  /* The same modelled carrier the crew and the safehouse stand use, in police
   * navy. It was the identical 0.44 m box the crew wore, which is the vest
   * the owner called bad — and there is no reason for the men shooting at you
   * to be wearing the one piece of gear that was replaced everywhere else. */
  const vest = makePlateCarrier({ colour: 0x151a22, loaded: true });
  vest.position.set(0, 1.24, 0.015);
  vest.name = `${name}-vest`;
  figure.parts.body.add(vest);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.106, 0.114, 0.07, 12), vestMat);
  cap.position.set(0, 0.255, 0);
  figure.parts.head.add(cap);
  const peak = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.015, 0.085), vestMat);
  peak.position.set(0, 0.228, 0.125);
  figure.parts.head.add(peak);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xd8d8cf }));
  stripe.position.set(0, 1.14, 0.16);
  figure.parts.body.add(stripe);

  const gun = new THREE.Group();
  gun.name = `${name}-weapon`;
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b3035, metalness: 0.68, roughness: 0.4 });
  gun.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.24), steel));
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.09, 0.034), vestMat);
  grip.position.set(0, -0.055, 0.075);
  gun.add(grip);
  gun.position.set(0, -0.32, 0.03);
  gun.rotation.x = -Math.PI / 2;
  figure.parts.foreR.add(gun);

  figure.aiming();
  figure.root.userData.weapon = gun;
  return figure;
}

/** The measurement the tests assert against: nobody in here is a giant. */
export function figureHeight(figure) {
  return figure?.parts?.profile?.height ?? 0;
}
