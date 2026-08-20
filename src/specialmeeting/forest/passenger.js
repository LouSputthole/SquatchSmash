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
    player.yaw = yaw ?? this.#forwardYaw();
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
