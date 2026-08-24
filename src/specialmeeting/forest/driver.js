/**
 * THE SPECIAL MEETING — Seff driving, which is to say: nobody driving.
 *
 * WHY THIS IS A RAIL AND THE BLOCK OUTSIDE THE FLAT IS NOT
 *
 * `../drive.js` steers a real `GroundVehicle` at a list of nodes, and it is
 * the right answer there: a sedan pulling up at a kerb has to look unhurried
 * and slightly too careful, and a rail cannot do unhurried. It is the wrong
 * answer here. This is a kilometre of unlit single track with fifteen-metre
 * bends and trunks two metres off the edge, and the most important dialogue in
 * the campaign plays over it. A pursuit controller that loses the line once,
 * on one machine, on one bend, puts the car in the trees while Numbskull is
 * saying "Relax." That is not a risk worth a physics model.
 *
 * So the car is ON the road, always, by construction — and everything that
 * makes a rail look like a rail is then taken back out:
 *
 *   The NOSE LAGS. Heading is filtered toward the road's tangent instead of
 *   snapped to it, so the car swings into a bend and settles out of it rather
 *   than tracking round like a train. (Golf's cart snaps its yaw per segment,
 *   which is exactly the tell.)
 *
 *   The BODY LEANS on the lateral load, dips under braking and squats under
 *   power. Three numbers, and they are most of what "being driven" feels like
 *   from a passenger seat.
 *
 *   The WHEELS FOLLOW THE GROUND. Four `heightAt` samples at the corners, run
 *   through a sprung filter, which is what turns the washboard and the
 *   potholes the surface model already has into something the camera feels.
 *
 *   The SPEED IS A DRIVER'S. Stage cruise, taken off for the bends, eased
 *   rather than stepped, and braked into the two places the script stops.
 *
 * The player never touches any of it. He is in the other seat.
 */

import {
  cruiseSpeedAt, roadAt, roadLength, ROAD_EVENTS, STAGE_LANE_OFFSET, TURN_OFF_S,
} from './road.js';
import { heightAt } from './field.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function shortestAngle(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** How hard the car is willing to accelerate and brake, m/s². */
const ACCEL = 2.1;
const BRAKE = 2.6;
/** Comfortable planned deceleration into a stop. Below `BRAKE`, deliberately. */
const PLANNED = 1.5;

export class ForestDrive {
  /**
   * @param {object} car the object `buildNightSedan` returned.
   * @param {object} [options]
   * @param {(id: string, drive: ForestDrive) => void} [options.onNode] fired
   *        once as each authored place on the road goes by. The ids are the
   *        script's beats; see `ROAD_EVENTS` in `road.js`.
   * @param {(strength: number) => void} [options.onJolt] fired when the car
   *        hits something worth hearing — the cattle grid, mostly.
   * @param {number} [options.timeScale] stretches or shortens the whole drive
   *        without moving a bend. The dialogue is the master and this is the
   *        knob that fits the drive to it.
   */
  constructor(car, { onNode = null, onJolt = null, timeScale = 1 } = {}) {
    this.car = car;
    this.onNode = onNode;
    this.onJolt = onJolt;
    this.timeScale = timeScale;

    this.distance = 0;
    this.speed = 0;
    this.running = false;
    /** Node id the car is stopped at and waiting to be released from. */
    this.waitingAt = null;

    this.heading = roadAt(0).yaw;
    this.pitch = 0;
    this.roll = 0;
    this.height = 0;
    this._heightRate = 0;
    this._pitchRate = 0;
    this._rollRate = 0;
    this._steer = 0;
    this._braking = false;
    /* Read by `_place` for the brake dip, and `_place` runs once from this
     * constructor. Left undefined it multiplies into NaN, the car's Euler
     * angles go NaN, and a NaN transform is a car that vanishes. */
    this._accelLast = 0;
    this._events = ROAD_EVENTS.map((event) => ({ ...event, fired: false }));
    this._grid = { fired: false };

    this._place(true);
  }

  /** Everything about the road under the car right now. */
  get road() {
    return roadAt(this.distance);
  }

  get stage() {
    return this.road.stage;
  }

  /** 0 at the kerb, 1 at the clearing. */
  get progress() {
    return this.distance / roadLength();
  }

  get arrived() {
    return this.waitingAt === 'arrival';
  }

  /** Pull away. */
  start() {
    this.running = true;
    return this;
  }

  /** Let the car go on from a scripted stop. SM-260, once the chain is down. */
  resume() {
    if (!this.waitingAt) return this;
    this.waitingAt = null;
    this.running = true;
    return this;
  }

  /** Stop where it is, without an authored node. For a beat that runs long. */
  hold() {
    this.running = false;
    return this;
  }

  /* ---------------------------------------------------------------- */

  /** The next stop the car has to plan a deceleration for, or null. */
  #nextStop() {
    for (const event of this._events) {
      if (!event.stop || event.fired) continue;
      if (event.s >= this.distance - 0.5) return event;
    }
    return null;
  }

  #targetSpeed() {
    if (!this.running || this.waitingAt) return 0;
    let want = cruiseSpeedAt(this.distance);
    const stop = this.#nextStop();
    if (stop) {
      const gap = Math.max(0, stop.s - this.distance);
      /* The speed he could still be doing here and stop on the planned
       * deceleration. Far out this is bigger than cruise and does nothing;
       * close in it is what makes the last thirty metres a long roll rather
       * than a stamp on the brake — the same shape `../drive.js` uses on the
       * block, because it is the same driver. */
      want = Math.min(want, Math.sqrt(2 * PLANNED * gap));
    }
    return want;
  }

  /**
   * Put the car where the road says, and lean it.
   *
   * @param {boolean} snap skip the filters — used once, at construction, so the
   *        first frame is not the car falling into the road from two metres up.
   */
  _place(snap = false, dt = 0) {
    const road = roadAt(this.distance);
    const rx = -Math.cos(road.yaw);
    const rz = Math.sin(road.yaw);

    /* Which part of the road he uses. On tarmac he keeps right, like the block
     * outside the flat; on a single track there is no such thing as a lane and
     * he sits on the crown, which is also where the ruts are not. */
    const lane = STAGE_LANE_OFFSET[road.stage] ?? 0;
    const offset = lane * road.halfWidth;
    const x = road.x + rx * offset;
    const z = road.z + rz * offset;

    // The nose lags the road. This one line is most of the difference.
    const turn = shortestAngle(this.heading, road.yaw);
    this.heading += snap ? turn : turn * Math.min(1, dt * 7.5);

    /* Four wheels, four samples. The wheelbase and track are the shell's own —
     * `makeCar` puts the axles at ±(L/2 − 1.1) and the wheels just inside the
     * body — so the car pitches and rolls over exactly the ground the tyres
     * are on rather than over an average of somewhere near it. */
    const halfBase = this.car.length / 2 - 1.1;
    const halfTrack = this.car.width / 2 - 0.06;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const lx = -fz;
    const lz = fx;
    const corner = (along, across) => heightAt(
      x + fx * along + lx * across,
      z + fz * along + lz * across,
    );
    const fl = corner(halfBase, halfTrack);
    const fr = corner(halfBase, -halfTrack);
    const rl = corner(-halfBase, halfTrack);
    const rr = corner(-halfBase, -halfTrack);

    const wantHeight = (fl + fr + rl + rr) * 0.25;
    const wantPitch = Math.atan2((rl + rr) * 0.5 - (fl + fr) * 0.5, halfBase * 2);
    /* Positive rotation about local +X tips the roof toward the car's LEFT,
     * so a road that is higher on the left has to be a negative roll. */
    const wantRoll = -Math.atan2((fl + rl) * 0.5 - (fr + rr) * 0.5, halfTrack * 2);

    if (snap) {
      this.height = wantHeight;
      this.pitch = wantPitch;
      this.roll = wantRoll;
      this._heightRate = 0;
      this._pitchRate = 0;
      this._rollRate = 0;
    } else {
      /* Springs, not lerps. A pothole in the surface model is eleven
       * centimetres deep and arrives in a twentieth of a second; a lerp would
       * make the car dip into it and out of it as a smooth swell, which is
       * exactly wrong. A sprung mass overshoots and settles, which is what a
       * suspension does and what a passenger's head does. */
      const spring = (value, rate, target, stiffness, damping) => {
        const accel = (target - value) * stiffness - rate * damping;
        const nextRate = rate + accel * dt;
        return [value + nextRate * dt, nextRate];
      };
      [this.height, this._heightRate] = spring(this.height, this._heightRate, wantHeight, 190, 21);
      [this.pitch, this._pitchRate] = spring(this.pitch, this._pitchRate, wantPitch, 150, 19);
      [this.roll, this._rollRate] = spring(this.roll, this._rollRate, wantRoll, 165, 20);
    }

    /* Load transfer on top of the ground. Lean out of the bend, dip under the
     * brakes, squat under power — all small, all felt. */
    const lateral = road.curvature * this.speed * this.speed;
    const bodyRoll = clamp(lateral * 0.030, -0.09, 0.09);
    const bodyPitch = clamp(-this._accelLast * 0.016, -0.05, 0.05);

    const group = this.car.group;
    group.position.set(x, this.height + 0.02, z);
    /* Yaw about world +Y, then pitch about the car's own +Z, then roll about
     * its +X. `YZX` is exactly Ry·Rz·Rx, which is that order — checked, rather
     * than assumed, because getting an Euler order wrong here rolls the car
     * when it should pitch and the mistake looks like a suspension bug. */
    group.rotation.order = 'YZX';
    group.rotation.set(this.roll + bodyRoll, this.heading - Math.PI / 2, this.pitch + bodyPitch);
    group.updateMatrix();
    group.updateMatrixWorld(true);

    // The wheel in Seff's hands, and the wheels on the ground.
    const wantSteer = clamp(road.curvature * 22, -1, 1);
    this._steer += (wantSteer - this._steer) * Math.min(1, (dt || 0.016) * 6);
    this.car.steer(this._steer);
    return { x, z, road };
  }

  /**
   * One frame.
   *
   * @param {number} dt seconds. Clamped: a tab that has been in the background
   *        comes back with a two-second frame, and a two-second step at nine
   *        metres a second is eighteen metres of road nobody drove.
   */
  update(rawDt) {
    const dt = Math.min(0.05, Math.max(0, rawDt)) * this.timeScale;
    if (dt <= 0) return this;

    const want = this.#targetSpeed();
    const gap = want - this.speed;
    this._accelLast = clamp(gap / Math.max(dt, 1e-3), -BRAKE, ACCEL);
    if (gap > 0) this.speed = Math.min(want, this.speed + ACCEL * dt);
    else this.speed = Math.max(want, this.speed - BRAKE * dt);

    const braking = gap < -0.25;
    if (braking !== this._braking) {
      this._braking = braking;
      this.car.setBrakeLights(braking);
    }

    const before = this.distance;
    this.distance = Math.min(roadLength(), this.distance + this.speed * dt);
    this.car.rollWheels(this.distance - before);
    this._place(false, dt);

    /* The cattle grid. SM-220 is the moment the scene changes and the loudest
     * thing in it, so it is a real event rather than a note in a comment: the
     * car crosses it, the caller gets a jolt to play, and the beams go on. */
    if (!this._grid.fired && before < TURN_OFF_S && this.distance >= TURN_OFF_S) {
      this._grid.fired = true;
      this.onJolt?.(Math.min(1, this.speed / 9));
    }

    for (const event of this._events) {
      if (event.fired || this.distance < event.s) continue;
      if (event.stop) {
        /* Do not fire until the car has actually stopped. A beat that starts
         * while the car is still rolling to a halt reads as the car being
         * pulled up BY the beat. */
        if (this.speed > 0.12) continue;
        this.speed = 0;
        this.running = false;
        this.waitingAt = event.id;
      }
      event.fired = true;
      /* An event is marked spent before it is announced, and it is never
       * retried -- so one listener that throws would silently delete a beat
       * for the rest of the drive. The rail is not the place to find that out.
       * See the note on ordering in `./index.js`'s own onNode. */
      try {
        this.onNode?.(event.id, this);
      } catch (error) {
        console.error(`a listener threw on the '${event.id}' road node`, error);
      }
    }

    return this;
  }

  /** Kill it. SM-330: the engine goes off and the lights stay on a moment. */
  shutDown() {
    this.running = false;
    this.speed = 0;
    this.car.setBrakeLights(false);
    return this;
  }
}

/** Convenience: the drive, already wired to a car. */
export function createForestDrive(car, options) {
  return new ForestDrive(car, options);
}
