import * as THREE from 'three';
import { markActor } from '../core/staging.js';
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

/* Poses whose settle lift is measured rather than zero. Blending into or out
 * of one has to re-ground every frame, or the rig drives through the floor
 * halfway across. `seated` is in here for the same reason `kneeling` is: it
 * ends 45 cm below where it started. */
const FLOOR_POSES = new Set(['kneeling', 'prone', 'restrained', 'bolting', 'alarm', 'fallen']);

/** THE TAKE's pose vocabulary, in the four words the staging marker knows. */
const HEIST_ACTOR_POSTURES = Object.freeze({
  stand: 'stand', startled: 'stand', pleading: 'stand', bolting: 'stand',
  alarm: 'stand', aiming: 'stand',
  seated: 'sit',
  kneeling: 'kneel', restrained: 'kneel',
  prone: 'lie', fallen: 'lie',
});

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
    role = 'bystander', seat, lookAt,
  } = {}) {
    this.root = new THREE.Group();
    this.root.name = name;
    this.root.userData.geometryGate = { assemblyId: `heist.figure.${name}` };
    /* Everybody in this bank is a marked actor, so the staging gate can ask
     * where they are looking without knowing this file exists.
     * src/core/staging.js. The mark goes on before the first `this.pose =`
     * below, because that assignment runs through the posture setter. */
    markActor(this.root, { id: name, role, posture: 'stand', ...(seat ? { seat } : {}), ...(lookAt ? { lookAt } : {}) });
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
    /** Look-and-hold idle state, and what it put on the rig last frame. */
    this._idleLook = null;
    this._lookApplied = null;
    /** Where the walk cycle is, for a figure that moves. See `gait()`. */
    this._gaitPhase = 0;
    /** A floor-length skirt, if this outfit has one — see `seated()`. */
    this._skirt = this.parts.group.getObjectByName('gown.skirt') ?? null;
    this._skirtY = this._skirt ? this._skirt.position.y : 0;
    this.root.userData.figure = this;
    this.stand();
  }

  get group() { return this.root; }
  get position() { return this.root.position; }

  /* THE TAKE's pose names are its own -- `bolting`, `restrained`, `alarm` --
   * and the staging gate speaks the four the shared marker defines. Making
   * `pose` an accessor means every one of the dozen `this.pose = ...` lines
   * below keeps the marker honest without each of them having to remember. */
  get pose() { return this._pose; }

  set pose(name) {
    this._pose = name;
    if (this.root.userData.actor) {
      this.root.userData.actorPosture = HEIST_ACTOR_POSTURES[name] ?? 'stand';
    }
  }

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
    if (this._skirt) this._skirt.position.y = this._skirtY;
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
   * Sat on a bench, which is what a man in the back of a van is doing.
   *
   * Owner, on the ride to the bank: *"they are all standing in the seats once
   * u are in the van instead of sitting in the seats"*. They were: the van
   * formation put five standing figures at floor level beside the benches,
   * because `stand()` was the only pose this rig had that was not a floor
   * pose, and a hostage kneeling on marble is not a passenger.
   *
   * Thigh forward, shin down, hands on the knees, and then `_ground()` — so
   * the FEET land on the van floor and the hips end up wherever the leg
   * lengths put them, rather than at a lift guessed per bench. `buildVan`
   * sets its cushion at that measured height (`VAN_SEAT_HEIGHT`), which is
   * why the seat is under the man instead of the man being under the seat.
   *
   * @param {object} [options]
   * @param {number} [options.slouch] 0 upright, 1 sprawled back — nobody in
   *   the back of a van two blocks out is sitting the same way.
   * @param {number} [options.seatY] the height of the bench surface. With it,
   *   the PELVIS is the contact and the boots reach the floor or do not, which
   *   is what sitting on a fixed bench means: five crew members are five
   *   different heights, so grounding them all by the boot puts five different
   *   backsides at five different heights over one cushion. Without it the
   *   figure grounds on its feet, for a chair whose height is not known here.
   */
  seated({ slouch = 0, seatY = null } = {}) {
    this._clear();
    const s = Math.max(0, Math.min(1, slouch));
    this.parts.legL.rotation.set(-1.52 + s * 0.16, 0.05 + s * 0.06, 0);
    this.parts.legR.rotation.set(-1.52 + s * 0.16, -0.05 - s * 0.06, 0);
    this.parts.shinL.rotation.x = 1.5 - s * 0.34;
    this.parts.shinR.rotation.x = 1.5 - s * 0.28;
    this.parts.armL.rotation.set(-0.42 - s * 0.1, 0, -0.2);
    this.parts.armR.rotation.set(-0.42 - s * 0.1, 0, 0.2);
    this.parts.foreL.rotation.set(-0.72, 0.16, 0);
    this.parts.foreR.rotation.set(-0.72, -0.16, 0);
    this.parts.body.rotation.x = 0.05 + s * 0.13;
    this.parts.head.rotation.x = -s * 0.06;
    this.pose = 'seated';
    if (!Number.isFinite(seatY)) return this._settle();
    /* Pelvis onto the cushion first: the bench does not move for anybody. */
    this.tilt.position.y = 0;
    this.root.updateMatrixWorld(true);
    const seat = this._bounds.setFromObject(this.parts.hips);
    if (!Number.isFinite(seat.min.y)) return this;
    this.tilt.position.y += seatY - seat.min.y;
    /* AND THEN THE KNEE TAKES UP THE DIFFERENCE.
     *
     * These five are 1.70 m to 1.95 m on one 50 cm bench. Grounded by the
     * boot they end up at five different seat heights; pinned by the pelvis
     * with one authored leg angle, Snow's boots hang 4 cm in the air and
     * DeathMegatron's go 14 cm through the van floor.
     *
     * A person on a bench too low for them sits with their knees ABOVE their
     * hips; a person on one too high lets their thigh fall away. Both are the
     * thigh angle, and the shin gives back what the thigh takes so it stays
     * hanging plumb — which is where a shin is when a boot is flat. Four
     * secant steps against a 0.45 m thigh converge to under 4 mm. */
    for (let i = 0; i < 4; i++) {
      this.root.updateMatrixWorld(true);
      /* The SHOES, not the whole rig: DeathMegatron wears a floor-length gown
       * whose hem is the lowest thing on him by 14 cm, and no amount of knee
       * would ever have satisfied a rig-box measurement. */
      const error = this._soleHeight() - this.baseY;
      if (!Number.isFinite(error) || Math.abs(error) < 0.004) break;
      const step = Math.max(-0.24, Math.min(0.24, error / 0.45));
      for (const [thigh, shin] of [[this.parts.legL, this.parts.shinL],
        [this.parts.legR, this.parts.shinR]]) {
        thigh.rotation.x = Math.max(-1.92, Math.min(-1.05, thigh.rotation.x + step));
        shin.rotation.x -= step;
      }
    }
    /* A floor-length coat does not stay floor-length when its wearer sits
     * down: the hem gathers over the knees. The gown is authored to a standing
     * ankle, so a seated figure drags a skirt through the floor. */
    if (this._skirt) {
      this.root.updateMatrixWorld(true);
      const hem = this._bounds.setFromObject(this._skirt);
      if (Number.isFinite(hem.min.y) && hem.min.y < this.baseY) {
        this._skirt.position.y += (this.baseY - hem.min.y) / (this.scale || 1);
      }
    }
    return this;
  }

  /** The lowest point of the two shoes, in world metres. */
  _soleHeight() {
    let lowest = Infinity;
    for (const shin of [this.parts.shinL, this.parts.shinR]) {
      for (const child of shin.children) {
        if (!child.isMesh) continue;
        if (!/shoe|foot/.test(child.name)) continue;
        const box = this._bounds.setFromObject(child);
        if (box.min.y < lowest) lowest = box.min.y;
      }
    }
    return lowest;
  }

  /* ---------------------------------------------------------------- *
   * Idle looking-about
   *
   * The other half of the same note: *"instead of looking around naturally
   * they are all looking foward at the same spot"*. They were, and there was
   * nothing in this class that could have done otherwise — `update()` drives
   * breath, tremble, a bolt cycle and a talking nod, and the head's YAW is
   * only ever whatever the pose wrote.
   *
   * A sine would be worse than nothing: five men swinging their heads on the
   * same curve is a windscreen wiper, not a van. This is look-and-hold —
   * pick somewhere, take a third of a second to get there, then stay on it
   * for a beat or two — which is what a person's neck actually does, and the
   * hold lengths and targets are drawn per figure from an injectable seed so
   * a headless test gets the same van twice.
   * ---------------------------------------------------------------- */

  /**
   * @param {object|null} spec `null` turns it off.
   * @param {number} [spec.seed] per-figure, so five men do not share a neck.
   * @param {number} [spec.range] radians of yaw either side of the pose.
   * @param {number[]} [spec.hold] seconds to stay on a target, [min, max].
   */
  setIdleLook(spec) {
    if (!spec) { this._clearIdleLook(); this._idleLook = null; return this; }
    const seed = Number.isFinite(spec.seed) ? spec.seed : 1;
    this._clearIdleLook();
    this._idleLook = {
      /* A tiny LCG rather than Math.random: the same figure has to look the
       * same way twice or the van cannot be verified. */
      state: (Math.floor(Math.abs(seed)) * 2654435761 + 12345) >>> 0,
      range: Number.isFinite(spec.range) ? spec.range : 0.62,
      hold: Array.isArray(spec.hold) ? spec.hold : [1.1, 3.2],
      yaw: 0, pitch: 0, fromYaw: 0, fromPitch: 0, toYaw: 0, toPitch: 0,
      clock: 0, t: 1, duration: 0.4,
    };
    return this;
  }

  _lookRandom() {
    const look = this._idleLook;
    look.state = (look.state * 1664525 + 1013904223) >>> 0;
    return look.state / 4294967296;
  }

  /** Take last frame's look back off the rig, so the pose is read clean. */
  _clearIdleLook() {
    const applied = this._lookApplied;
    if (!applied) return;
    this.parts.head.rotation.y -= applied.headY;
    this.parts.head.rotation.x -= applied.headX;
    this.parts.body.rotation.y -= applied.bodyY;
    this._lookApplied = null;
  }

  _updateIdleLook(dt) {
    const look = this._idleLook;
    if (!look) return;
    look.clock -= dt;
    if (look.clock <= 0) {
      look.fromYaw = look.yaw;
      look.fromPitch = look.pitch;
      look.toYaw = (this._lookRandom() - 0.5) * look.range * 2;
      look.toPitch = (this._lookRandom() - 0.5) * 0.22;
      look.duration = 0.3 + this._lookRandom() * 0.34;
      look.clock = look.duration + look.hold[0]
        + this._lookRandom() * Math.max(0, look.hold[1] - look.hold[0]);
      look.t = 0;
    }
    if (look.t < 1) {
      look.t = Math.min(1, look.t + dt / look.duration);
      const e = look.t * look.t * (3 - 2 * look.t);
      look.yaw = look.fromYaw + (look.toYaw - look.fromYaw) * e;
      look.pitch = look.fromPitch + (look.toPitch - look.fromPitch) * e;
    }
    /* Shoulders follow a neck a little way round. Past about 40 degrees a
     * person turns their chest instead of straining, and that is the whole
     * difference between a head on a swivel and somebody looking at
     * something. */
    const bodyY = look.yaw * 0.3;
    this.parts.head.rotation.y += look.yaw;
    this.parts.head.rotation.x += look.pitch;
    this.parts.body.rotation.y += bodyY;
    this._lookApplied = { headY: look.yaw, headX: look.pitch, bodyY };
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

  /**
   * Keep the currently interpolated rig touching its authored floor.
   *
   * MEASURES THE RIG, NOT THE ROOT. Scenes hang things off `root` that are not
   * body: `level.js` gives every lobby civilian an invisible 1.75 m aim proxy
   * at y 0.9, and `cast.js` gives every crew member one, so the lowest point of
   * `root` was that box's bottom edge at y 0.025 — not a boot. Every grounded
   * pose in the bank has therefore been floating 2.5 cm off the marble, and a
   * seated crew member came to rest 2.5 cm above the van's bench.
   *
   * `parts.group` is the figure: everything a pose moves and everything worn
   * (the carrier, the sling, the balaclava) hangs inside it, and nothing a
   * scene bolts onto `root` for raycasting does.
   */
  _ground() {
    this.root.updateMatrixWorld(true);
    const box = this._bounds.setFromObject(this.parts.group);
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
    this._gaitPhase = 0;
    return this;
  }

  /**
   * Legs for a man moving while his upper body stays on his weapon.
   *
   * Owner, on the street: *"Everyones just standing ther"*. Once the police
   * bound between fire positions (`updatePoliceMovement` in the heist's
   * `main.js`) they slide across the road with their boots welded together,
   * which is worse than standing still — a static man reads as covering an
   * angle, a gliding one reads as broken.
   *
   * This writes the FOUR LEG JOINTS and nothing else, so it composes with
   * `aiming()` above rather than replacing it: the shared `CombatWeaponAim`
   * keeps the shoulders and the muzzle, and this carries what is underneath.
   * At zero speed it puts the legs back and returns, so a man who has reached
   * cover stops walking on the spot.
   *
   * @param {number} dt simulated seconds
   * @param {number} speed metres per second, from the mover
   */
  gait(dt, speed) {
    const pace = Math.max(0, Number(speed) || 0);
    const legs = [this.parts.legL, this.parts.legR, this.parts.shinL, this.parts.shinR];
    if (pace <= 0.06) {
      if (this._gaitPhase === 0) return this;
      this._gaitPhase = 0;
      for (const part of legs) part.rotation.x = 0;
      return this;
    }
    this._gaitPhase = (this._gaitPhase ?? 0) + dt * (3.4 + pace * 1.5);
    const stride = Math.sin(this._gaitPhase);
    // A jog swings further than a walk, and a sprint does not swing double.
    const swing = Math.min(0.66, 0.18 + pace * 0.15);
    this.parts.legL.rotation.x = -stride * swing;
    this.parts.legR.rotation.x = stride * swing;
    this.parts.shinL.rotation.x = Math.max(0, stride) * swing * 1.35;
    this.parts.shinR.rotation.x = Math.max(0, -stride) * swing * 1.35;
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
    if (to === 'kneeling' || to === 'seated') return 0.5;
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
    /* Last frame's idle look comes OFF before anything reads the rig, so the
     * pose blend, `_poseHeadX` and the talking nod all see the authored pose
     * rather than the pose plus wherever the neck happened to be pointing. */
    this._clearIdleLook();
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
    if (this.voiceMouth.photo) {
      if (talk === 0) this._poseHeadX = this.parts.head.rotation.x;
      else this.parts.head.rotation.x = (this._poseHeadX ?? 0) - talk * 0.085;
    }
    // Last, and on top of everything: see `setIdleLook`.
    this._updateIdleLook(dt);
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
    role: 'civilian',
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
/**
 * A bank security guard.
 *
 * Owner, on the lobby: *"make him clearly a guard, needs a better outfit with
 * a bulletproof verst and a clear badge"*, and then *"Does the guard even
 * have a gun?"*
 *
 * The answer to the last one was NO, visibly. The pistol existed but was
 * built `visible = false` and only appeared once he was already drawing it —
 * so up to the moment he pulled, the one armed man in the room was a bloke in
 * a blue work shirt with a 3 cm brass disc on his chest, an empty holster
 * shape and a peaked cap. Nothing about him said what he was, which made
 * shooting him first read as murdering a customer.
 *
 * So he is dressed for what he is, and every piece of it is legible across a
 * 22 m lobby:
 *
 *   - a **vest**, the shared modelled carrier in security navy rather than
 *     tactical black, with no rifle magazines on it — he is not a soldier;
 *   - SECURITY across the chest and the back, which is how you know from
 *     behind;
 *   - a **shield badge**, 9 cm rather than 3, on the vest instead of under it,
 *     with a name bar under it and a patch on the shoulder;
 *   - a **holstered sidearm** that is there the whole time: the butt of it
 *     stands out of the holster, so the threat is visible before it is aimed.
 *
 * When he draws, the holstered copy goes away in the same instant the one in
 * his hand appears, so there is never two of them.
 */
export function makeBankGuardFigure({ name, x, z, yaw, height = HEIST_HEIGHTS.guard }) {
  const figure = new HeistFigure({
    name, x, z, yaw, tier: 'hero', role: 'guard',
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
  // The cap badge: the same shield as the chest, so the two read as one job.
  const capBadge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.032, 0.012), brass);
  capBadge.position.set(0, 0.262, 0.104);
  figure.parts.head.add(capBadge);
  // Named so the level-presentation test can still find a head on this man.
  const headMark = new THREE.Group();
  headMark.name = `${name}-head`;
  figure.parts.head.add(headMark);

  /* THE VEST. The shared carrier, unloaded — a guard wears body armour, not a
   * combat rig, so there are no rifle magazines across his belly. */
  const vest = makePlateCarrier({ colour: 0x1b2430, loaded: false });
  vest.name = `${name}-vest`;
  vest.position.set(0, 1.26, 0.012);
  vest.scale.setScalar(1.04);
  figure.parts.body.add(vest);

  const marking = new THREE.MeshStandardMaterial({ color: 0xd9dee6, roughness: 0.85 });
  // SECURITY, front and back. The band is the word at this distance.
  const chestBand = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.038, 0.012), marking);
  chestBand.position.set(0, 1.17, 0.196);
  chestBand.name = `${name}-chest-legend`;
  figure.parts.body.add(chestBand);
  const backBand = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.05, 0.012), marking);
  backBand.position.set(0, 1.3, -0.19);
  backBand.name = `${name}-back-legend`;
  figure.parts.body.add(backBand);

  /* THE BADGE: a shield, on the outside of the vest, three times the size of
   * the disc it replaces, with a dark centre so it is a badge and not a coin
   * — and a name bar under it. */
  const badge = new THREE.Group();
  badge.name = `${name}-badge`;
  const shieldTop = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.058, 0.014), brass);
  shieldTop.position.y = 0.018;
  badge.add(shieldTop);
  const shieldPoint = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.03, 0.014), brass);
  shieldPoint.position.y = -0.026;
  badge.add(shieldPoint);
  const shieldFace = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.03, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x1a2b45, roughness: 0.5 }));
  shieldFace.position.set(0, 0.02, 0.008);
  badge.add(shieldFace);
  badge.position.set(-0.098, 1.33, 0.2);
  figure.parts.body.add(badge);
  const nameBar = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.02, 0.01), marking);
  nameBar.position.set(0.09, 1.31, 0.198);
  figure.parts.body.add(nameBar);
  // A shoulder patch, which is the read from the side.
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.045), brass);
  patch.position.set(-0.105, 0.02, 0.01);
  figure.parts.armL.add(patch);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.24), dark);
  belt.position.set(0, 1.03, 0);
  figure.parts.body.add(belt);
  const holster = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.065), dark);
  holster.position.set(0.17, 0.94, 0.02);
  holster.name = `${name}-holster`;
  figure.parts.body.add(holster);

  const steel = new THREE.MeshStandardMaterial({ color: 0x2e3338, metalness: 0.7, roughness: 0.36 });

  /* THE GUN IN THE HOLSTER. Not the drawn one — a second, static copy whose
   * butt and hammer stand above the leather, so the man is visibly armed from
   * the moment the doors come in. It goes away the instant the drawn one
   * appears; `setThreatProgress` owns both. */
  const holstered = new THREE.Group();
  holstered.name = `${name}-holstered-sidearm`;
  const buttStock = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.09, 0.038), dark);
  buttStock.rotation.x = -0.2;
  holstered.add(buttStock);
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.055), steel);
  hammer.position.set(0, 0.05, -0.026);
  holstered.add(hammer);
  holstered.position.set(0.17, 1.045, 0.026);
  figure.parts.body.add(holstered);

  const gun = new THREE.Group();
  gun.name = `${name}-gun`;
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
    // One pistol at a time: it is out of the holster or it is in it.
    holstered.visible = !gun.visible;
    figure.parts.armR.rotation.set(-p * 1.62, 0, p * 0.18);
    figure.parts.foreR.rotation.x = -p * 0.25;
    figure.parts.armL.rotation.set(-p * 0.9, 0, -p * 0.32);
    figure.parts.body.rotation.y = -p * 0.2;
    figure.parts.head.rotation.y = -p * 0.18;
    root.userData.threatProgress = p;
  };
  root.userData.setNeutralized = ({ blend = true } = {}) => {
    gun.visible = false;
    holstered.visible = false;
    figure.setState('down', { blend, roll: -0.42 });
    root.userData.neutralized = true;
  };
  root.userData.resetThreatPose = () => {
    gun.visible = false;
    holstered.visible = true;
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
    name, x, z, yaw, tier: 'hero', role: 'principal',
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
    name, x, z, yaw, role: 'enemy', tier: index < 4 ? 'hero' : 'ambient',
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
  /* The muzzle end of the 0.24 m slide, on the project's -Z bore axis. The
   * shared `CombatWeaponAim` samples this to steer the visible gun and to give
   * `CombatFireControl` the true origin of every round — an officer's shot now
   * leaves his weapon, not an invented point 1.35 m over his feet. */
  gun.userData.muzzle = new THREE.Vector3(0, 0, -0.12);
  figure.parts.foreR.add(gun);

  figure.aiming();
  figure.root.userData.weapon = gun;
  return figure;
}

/** The measurement the tests assert against: nobody in here is a giant. */
export function figureHeight(figure) {
  return figure?.parts?.profile?.height ?? 0;
}
