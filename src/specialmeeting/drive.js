/**
 * Driving a car down an authored line, with nobody at the wheel.
 *
 * The repo had two halves of this and not the whole thing. `GroundVehicle`
 * (src/core/vehicles/ground-vehicle.js) is a real bicycle-model car with slip,
 * body roll and a brake, and it is driven by a human everywhere it appears.
 * The golf cart drives itself, but on a rail: it walks a hardcoded arclength
 * along the module-global `HOLE.cartPath`, snaps its yaw per segment, and
 * takes no path argument at all.
 *
 * This is the missing middle: a pursuit controller that STEERS an ordinary
 * `GroundVehicle` along a list of `{ x, z, speed }` nodes. The car is still
 * the car — it accelerates, understeers a little on the corner, takes its time
 * on the brakes — so a sedan pulling up outside a building is the physics
 * arriving somewhere, not an animation being played at the player. That
 * matters here, because the arrival has to look unhurried and slightly too
 * careful, and a rail cannot do unhurried.
 *
 * No THREE, no scene, no audio: the whole thing is arithmetic over the
 * vehicle's own state, so the approach can be simulated in a test at 120 Hz
 * and asserted to end up against the kerb.
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Fold an angle into (-PI, PI]. */
export function wrapAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Bearing from a point to a point in the vehicle's frame.
 *
 * `GroundVehicle` integrates `x += sin(heading) * speed` and
 * `z += cos(heading) * speed`, so heading 0 is +Z and heading PI/2 is +X. Any
 * bearing here has to be built the same way round or the steering sign flips
 * and the car drives away from every node it is given.
 */
export function bearingTo(fromX, fromZ, toX, toZ) {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

const DEFAULTS = Object.freeze({
  /** How hard the wheel is turned per radian of heading error. */
  steerGain: 1.9,
  /** Comfortable deceleration used to plan the run into a slower node, m/s². */
  decel: 1.5,
  /** Nothing on this block is a chase; the driver is being watched. */
  maxSpeed: 13,
  /** A pass-through node is reached at this range. */
  arriveRadius: 3.2,
  /** The last node is a parking space, not a waypoint. */
  stopRadius: 0.7,
  /** Below this the car is stopped, not crawling. */
  stopSpeed: 0.09,
  /** Slow into a turn: desired speed is divided by 1 + |error| * this. */
  cornerCaution: 1.35,
  /**
   * What the last node means.
   *
   * `true` is a parking space: brake into it and stay there. `false` is the
   * end of the block — the car passes the node and the route is finished with
   * the throttle still down, which is what leaving looks like. Without this
   * the driver treats "gone" as "stop here" and, having overshot a node it was
   * never going to hit at speed, turns round and comes back for it.
   */
  stopAtEnd: true,
});

/** Pursues a route with an ordinary `GroundVehicle`. */
export class RouteDriver {
  constructor(vehicle, route = [], options = {}) {
    this.vehicle = vehicle;
    this.options = Object.freeze({ ...DEFAULTS, ...options });
    this.setRoute(route);
  }

  /** Point the driver at a new list of nodes, from the top. */
  setRoute(route) {
    this.route = [...route];
    this.index = 0;
    this.done = this.route.length === 0;
    this.holding = false;
    this.vehicle.setInput({ throttle: 0, steer: 0, brake: this.done ? 1 : 0 });
    return this;
  }

  /** The node being driven at, or null once the route is finished. */
  get target() {
    return this.route[this.index] ?? null;
  }

  /** True while the last node is the one being driven at. */
  get onFinalNode() {
    return this.index === this.route.length - 1;
  }

  /** Straight-line distance to the current node, or Infinity when done. */
  distanceToTarget() {
    const node = this.target;
    if (!node) return Infinity;
    return Math.hypot(node.x - this.vehicle.x, node.z - this.vehicle.z);
  }

  /**
   * Choose this frame's inputs. The caller still has to `step()` the vehicle —
   * usually inside a `FixedStepRunner`, so the physics rate does not depend on
   * how the machine is feeling.
   */
  update() {
    const v = this.vehicle;
    const o = this.options;
    const node = this.target;
    if (!node) {
      this.done = true;
      v.setInput({ throttle: 0, steer: 0, brake: o.stopAtEnd ? 1 : 0 });
      return this;
    }

    const dx = node.x - v.x;
    const dz = node.z - v.z;
    const distance = Math.hypot(dx, dz);
    const error = wrapAngle(bearingTo(v.x, v.z, node.x, node.z) - v.heading);

    /* Have we passed it? A node behind the front axle is a node the car is
     * never getting closer to, and steering at it turns a straight street into
     * a U-turn. `ahead` is the component of the offset along the car's nose. */
    const ahead = Math.sin(v.heading) * dx + Math.cos(v.heading) * dz;
    const passThrough = !this.onFinalNode || !o.stopAtEnd;
    if (passThrough && (distance <= o.arriveRadius || ahead <= 0)) {
      this.index++;
      return this.update();
    }

    /* Speed the car could still be doing here and stop (or slow) into the node
     * on the planned deceleration. Far away this is bigger than the cruise cap
     * and does nothing; close in it is what makes the last thirty metres a
     * long, deliberate roll rather than a stamp on the brake at the end. */
    const planned = Math.sqrt(node.speed * node.speed + 2 * o.decel * Math.max(0, distance));
    let desired = Math.min(o.maxSpeed, planned);
    desired /= 1 + Math.abs(error) * o.cornerCaution;

    const steer = clamp(error * o.steerGain, -1, 1);
    const gap = desired - v.speed;

    if (this.onFinalNode && o.stopAtEnd && distance <= o.stopRadius) {
      v.setInput({ throttle: 0, steer, brake: 1 });
      if (Math.abs(v.speed) <= o.stopSpeed) {
        v.speed = 0;
        v.lateralSlip = 0;
        this.done = true;
        this.holding = true;
      }
    } else if (gap > 0.12) {
      v.setInput({ throttle: clamp(gap * 0.6, 0, 1), steer, brake: 0 });
    } else if (gap < -0.2) {
      v.setInput({ throttle: 0, steer, brake: clamp(-gap * 0.45, 0, 1) });
    } else {
      // Holding a speed: a whisker of throttle, because rolling resistance is real.
      v.setInput({ throttle: 0.08, steer, brake: 0 });
    }
    return this;
  }

  /** Keep the car where it stopped: brake on, wheels straight-ish, no drift. */
  hold() {
    this.vehicle.setInput({ throttle: 0, steer: 0, brake: 1 });
    this.vehicle.speed = 0;
    this.vehicle.lateralSlip = 0;
    this.holding = true;
    return this;
  }
}

export function createRouteDriver(vehicle, route, options) {
  return new RouteDriver(vehicle, route, options);
}
