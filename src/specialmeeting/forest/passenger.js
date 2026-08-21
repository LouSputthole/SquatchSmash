/**
 * THE SPECIAL MEETING — sitting in the front seat and not driving.
 *
 * The player is a passenger for two minutes. He can look anywhere he likes and
 * he can do nothing at all, and the second half of that is the point: the
 * scene is three men being polite to him in a car and his only move is to
 * watch them do it.
 *
 * WHICH PLAYER MODE, AND WHY IT IS NOT 'frozen'
 *
 * `Player.mode = 'frozen'` returns immediately from `handleMouseMove`
 * (`src/core/player.js`), so a frozen passenger cannot turn his head at all.
 * Golf gets away with it because its cart camera belongs to the DRIVER, who is
 * looking where he is going. Here it would weld the view to the windscreen and
 * delete the entire scene: he could not look at Seff, could not check the
 * mirror, and could not turn round to look at the man sitting behind him,
 * which is the shot the whole thing is built for.
 *
 * So: `'seated'` plus a clamped cone, which is what The Silver Case worked out
 * for exactly this problem (`src/silvercase/main.js`, and its comment says so).
 *
 * THE PART THAT IS NEW
 *
 * The Silver Case's car does not go anywhere — it is a cabin with a scrolling
 * texture outside it, so its cone is fixed in world space. This one drives a
 * kilometre of bends, so the cone has to TURN WITH THE CAR. Every frame the
 * car's heading moves, that delta is added to the player's own yaw as well as
 * to the centre of his cone. Without the first half his head stays pointing at
 * a compass bearing while the car turns underneath him, which reads as a man
 * slowly and deliberately staring out of the side window on every bend.
 */

import * as THREE from 'three';
import { SEATS } from './car.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function shortestAngle(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * How far round he can look, from the front passenger seat.
 *
 * 2.45 radians is a hundred and forty degrees each way: enough to put the man
 * in the seat behind his right shoulder fully in frame, and not so much that
 * he can spin his head round like an owl. The pitch cone is asymmetric because
 * there is more to look at down here — the footwell, the handbrake, his own
 * hands — than up at a headliner.
 */
export const LOOK_CONE = Object.freeze({
  yawRange: 2.45,
  pitchMin: -0.95,
  pitchMax: 0.55,
});

/**
 * How far back along the car the man getting out of it is turned to look.
 *
 * A quarter of the car's length behind its middle, and the fraction is
 * measured rather than chosen. See `exitYaw()`.
 */
const EXIT_LOOK_BACK = 0.25;

/**
 * Which way he is turned when he gets out at the spur.
 *
 * AT THE CAR, NOT ALONG IT, and this is the second time this scene has had to
 * learn that. `src/specialmeeting/cast.js` fixed it for the bodies months
 * before anything could see it -- its `placeBeside()` comment is explicit:
 * *"everybody who got out used to be turned to `facingYaw() + PI`, which is
 * where the car's NOSE points, so a man standing at an open door with the
 * Prospect beside it was looking down the street past the wing."* Every NPC
 * who gets out of this car was turned round by that fix. The PLAYER was not,
 * because `leave()` took `#forwardYaw()` -- the nose -- and the `yaw` argument
 * that exists to override it was never passed by anybody.
 *
 * The framing gate measured what that costs, on the built spur: at SM-400,
 * with all four of them out of the car and about to spend Act Four talking to
 * him, EVERY ONE of them was behind the camera. Seff at 0.05 m of depth, Lag
 * and Numbskull at 1.73 m behind, and Kittenboss -- who climbs out of the boot
 * saying *"Jesus Christ. Finally."*, which is the first thing anybody says in
 * the act -- 3.85 m behind. The whole of Act Four opened on a dark trail with
 * the scene happening over his shoulder.
 *
 * The heading is the car's own long axis, a quarter of its length back from
 * the middle, and that fraction is the measurement: at the car's CENTRE two of
 * the four are in frame and Kittenboss is outside the left edge; at the middle
 * of the BOOT LID three are in and Seff is outside the right; at a quarter
 * back, Seff, Lag and Kittenboss are all in frame and the only one out is
 * Numbskull, standing 0.67 m off his elbow, which no lens holds and which
 * SM-400 puts there on purpose ("Numbskull stands beside Tony's door and steps
 * back to give him room").
 *
 * `exitLookPoint()` is the point itself, exported so the shot list can name
 * what the beat is aimed at without owning a second copy of the rule.
 *
 * @param {object} car the object `buildNightSedan` returned.
 * @param {THREE.Vector3} from where he is standing.
 */
export function exitLookPoint(car, out = new THREE.Vector3()) {
  return car.group.localToWorld(out.set(-car.length * EXIT_LOOK_BACK, 0, 0));
}

export function exitYaw(car, from) {
  const at = exitLookPoint(car);
  /* `Player`'s convention: forward is (-sin yaw, ., -cos yaw), so the yaw that
   * looks from one point at another is atan2(-dx, -dz). Half a turn from the
   * `makePerson` rig's, which is the mistake this scene has already paid for
   * twice -- see `cast.js`'s `carFacing()`. */
  return Math.atan2(-(at.x - from.x), -(at.z - from.z));
}

export class PassengerRig {
  /**
   * @param {object} player the core `Player`.
   * @param {object} car the object `buildNightSedan` returned.
   * @param {object} [options]
   * @param {string} [options.seat] which seat. It is the front one. It is
   *        always the front one — that is the scene.
   */
  constructor(player, car, { seat = 'frontPassenger', cone = LOOK_CONE } = {}) {
    this.player = player;
    this.car = car;
    this.seat = seat;
    this.cone = cone;
    this.seated = false;
    this._lastCarYaw = null;
    this._eye = new THREE.Vector3();
  }

  /** Yaw the camera must hold to be looking where the car is going. */
  #forwardYaw() {
    /* The car's mesh yaw is `heading − PI/2` (its body is long on local +X).
     * A camera looks down its own −Z, so the yaw that matches the car's nose
     * is `heading + PI`, which in terms of the mesh is `rotation.y + 3PI/2`.
     * Taken from the mesh rather than from the drive so that anything else
     * that moves the car — a nudge, a cutscene, a test — is followed too. */
    return this.car.group.rotation.y + Math.PI * 1.5;
  }

  /**
   * Get in.
   *
   * Called once the car is where it is going to be, because the first frame
   * places the eye exactly and there is nothing to interpolate from.
   */
  board() {
    const player = this.player;
    player.mode = 'seated';
    player.velocity.set(0, 0, 0);
    player.clearKeys?.();
    const forward = this.#forwardYaw();
    player.yaw = forward;
    player.yawCenter = forward;
    player.yawRange = this.cone.yawRange;
    player.pitchMin = this.cone.pitchMin;
    player.pitchMax = this.cone.pitchMax;
    player.pitch = -0.03;
    this._lastCarYaw = forward;
    this.seated = true;
    this.update(0);
    return this;
  }

  /**
   * Ride. Call AFTER the drive has moved the car this frame, never before —
   * a seat read from last frame's transform is a head that lags the car by
   * one frame, which at nine metres a second is fifteen centimetres of
   * juddering every time the road turns.
   */
  update() {
    if (!this.seated) return this;
    const player = this.player;

    const forward = this.#forwardYaw();
    if (this._lastCarYaw !== null) {
      /* Carry his head round with the car, then move the cone under it. The
       * two have to move by the SAME delta: turn only the cone and a player
       * looking at the driver gets slowly clamped back to the windscreen on
       * every left-hander. */
      const delta = shortestAngle(this._lastCarYaw, forward);
      player.yaw += delta;
    }
    this._lastCarYaw = forward;
    player.yawCenter = forward;
    player.yawRange = this.cone.yawRange;
    player.pitchMin = this.cone.pitchMin;
    player.pitchMax = this.cone.pitchMax;
    player.yaw = clamp(player.yaw, forward - this.cone.yawRange, forward + this.cone.yawRange);

    /* The eye is a point on the car, so it inherits the pitch, the roll and
     * every pothole the suspension found. Nothing else is needed to make the
     * drive felt: the camera is bolted to the body, which is what a head in a
     * car is. */
    this.car.seatWorld(this.seat, 'eye', this._eye);
    player.position.copy(this._eye);
    return this;
  }

  /**
   * Get out, onto the ground beside the door.
   *
   * SM-400. Nobody opens it for him this time.
   */
  leave({ yaw = null } = {}) {
    const player = this.player;
    this.car.exitWorld(this.seat, this._eye);
    player.mode = 'walk';
    player.position.set(this._eye.x, this._eye.y + 1.66, this._eye.z);
    player.yawCenter = null;
    player.pitchMin = -Math.PI / 2 + 0.05;
    player.pitchMax = Math.PI / 2 - 0.05;
    /* Turned at the car rather than along it. `exitYaw()` has the incident and
     * the numbers; the short version is that this line used to read
     * `this.#forwardYaw()` and pointed him up an empty trail while all four of
     * the people he is in the woods with talked to the back of his head. */
    player.yaw = yaw ?? exitYaw(this.car, player.position);
    player.pitch = 0;
    this.seated = false;
    return this;
  }

  /** World position of the eye, for anything that wants to aim at the player. */
  eyeWorld(out = new THREE.Vector3()) {
    return this.car.seatWorld(this.seat, 'eye', out);
  }
}

/** Where each man sits, by name, so the scene above does not restate it. */
export const CREW_SEATS = Object.freeze({
  /* Seff drives. Lag is behind him. Numbskull is behind the Prospect, and the
   * car quietly puts him back there if the Prospect ever asks him to move
   * (SM-322) — the arrangement survives being offered a change, which is the
   * one thing about it nobody explains. */
  seff: 'driver',
  prospect: 'frontPassenger',
  lag: 'rearLeft',
  numbskull: 'rearRight',
});

export { SEATS };
