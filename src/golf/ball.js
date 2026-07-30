/**
 * One ball, one set of rules, four players.
 *
 * Lou's tee shot and the player's tee shot go through this same integrator, so
 * when Lou's low iron lands on the front fringe and releases onto the green
 * that is the physics doing it and not a cutscene. The NPC outcomes are
 * authored by choosing *where they aim*, never by moving the ball.
 *
 * Deliberately a small model: gravity, drag, a lift term standing in for
 * backspin, wind, one bounce, another bounce, then roll with surface friction
 * and green slope. No spin axis, no shot shaping, no wind gusts. It has to be
 * readable enough that a player understands why the ball did what it did.
 *
 * No Three.js: the ball is three numbers and a velocity, so node can run it.
 */

import { SURFACE, surfaceProps } from './course.js';
import { launchFor } from './clubs.js';
import { HOLE } from './hole.js';
import {
  heightAt, surfaceAt, slopeAt, normalAt, isOutOfBounds,
  distanceToPin, dropPointFor, recoveryPointFor,
} from './field.js';

const GRAVITY = 9.81;

/* Drag and lift, both quadratic in speed. The lift term is standing in for
 * backspin: it is what makes a golf ball hang and then fall out of the sky
 * rather than trace a cannonball arc, and without it a driver cannot reach
 * the distances the brief asks for no matter how hard it is hit. */
const DRAG = 0.00380;
const LIFT = 0.00165;

/* Wind is felt as air that is already moving: drag is computed against the
 * ball's speed *through the air*, which is the only place wind belongs.
 *
 * Read per shot rather than captured at import, because each hole carries its
 * own wind and a ball frozen to Hole 1's breeze would be drifting the wrong
 * way on the other two. */
const windX = () => HOLE.wind.dirX * HOLE.wind.speed;
const windZ = () => HOLE.wind.dirZ * HOLE.wind.speed;

/** Below this vertical speed on contact, the ball stops bouncing and rolls. */
const BOUNCE_FLOOR = 1.35;
/** Rolling slower than this on ground that will not move it: stopped. */
const STOP_SPEED = 0.09;
/** Fastest a ball can be going and still stay in the cup rather than lip out. */
const CAPTURE_SPEED = 1.85;

const SUBSTEP = 1 / 240;

export const BALL_STATE = {
  READY: 'ready',
  FLIGHT: 'flight',
  ROLL: 'roll',
  STOPPED: 'stopped',
  WATER: 'water',
  OUT_OF_BOUNDS: 'oob',
  HOLED: 'holed',
};

export class Ball {
  /**
   * @param {object} hooks optional callbacks, all of them fire-and-forget:
   *   onBounce(surface, speed), onSplash(pos), onLand(surface, pos),
   *   onHoled(), onStop(surface, pos), onOutOfBounds(pos)
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.state = BALL_STATE.READY;
    this.surface = SURFACE.TEE;
    this.bounces = 0;
    this.airborneTime = 0;
    this.travelled = 0;
    /* Where the shot started, so a penalty drop can be worked out from the
     * line the ball actually took rather than from wherever it ended up. */
    this.origin = { x: 0, z: 0 };
    this.apex = 0;
    this.carry = 0;
    /* Where it first touched down, and on what. Distinct from where it stops:
     * a low iron that lands on the fringe and releases onto the green did two
     * different things and the scene talks about both. */
    this.landing = null;
    this._carryDone = false;
    this._stuckTimer = 0;
  }

  get moving() {
    return this.state === BALL_STATE.FLIGHT || this.state === BALL_STATE.ROLL;
  }

  get resting() {
    return this.state === BALL_STATE.STOPPED || this.state === BALL_STATE.READY;
  }

  /** Drop the ball on the ground at a point, at rest. */
  placeAt(x, z, { surface = null } = {}) {
    this.position.x = x;
    this.position.z = z;
    this.position.y = heightAt(x, z);
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.surface = surface ?? surfaceAt(x, z);
    this.state = BALL_STATE.STOPPED;
    this.bounces = 0;
    this.travelled = 0;
    this.apex = this.position.y;
    this.carry = 0;
    this.landing = null;
    this._carryDone = true;
    this._stuckTimer = 0;
    return this;
  }

  /**
   * Hit it.
   *
   * `aimRad` is the compass direction of the shot, `launch` is what came out
   * of `launchFor()`. The ball is lifted a hair off the deck so the very first
   * substep cannot immediately register a ground contact.
   */
  strike(aimRad, launch) {
    const dir = aimRad + (launch.offsetDeg * Math.PI) / 180;
    const loft = (launch.loftDeg * Math.PI) / 180;
    const horizontal = launch.grounded ? launch.speed : launch.speed * Math.cos(loft);
    const vertical = launch.grounded ? 0 : launch.speed * Math.sin(loft);

    this.origin.x = this.position.x;
    this.origin.z = this.position.z;
    this.velocity.x = Math.sin(dir) * horizontal;
    this.velocity.z = Math.cos(dir) * horizontal;
    this.velocity.y = vertical;
    this.position.y = heightAt(this.position.x, this.position.z) + 0.03;

    this.state = launch.grounded ? BALL_STATE.ROLL : BALL_STATE.FLIGHT;
    this.bounces = 0;
    this.airborneTime = 0;
    this.travelled = 0;
    this.apex = this.position.y;
    this.carry = 0;
    this.landing = null;
    this._carryDone = launch.grounded;
    this._stuckTimer = 0;
    return this;
  }

  /** Advance the ball. Safe to call with a long dt; it substeps internally. */
  update(dt) {
    if (!this.moving) return this.state;
    let remaining = Math.min(dt, 0.25);
    while (remaining > 0 && this.moving) {
      const h = Math.min(SUBSTEP, remaining);
      remaining -= h;
      if (this.state === BALL_STATE.FLIGHT) this._flightStep(h);
      else this._rollStep(h);
    }
    return this.state;
  }

  /* ---------------------------------------------------------------- */

  _flightStep(dt) {
    const v = this.velocity;
    const p = this.position;

    // Speed through the air, which is what drag and lift actually see.
    const ax = v.x - windX();
    const az = v.z - windZ();
    const ay = v.y;
    const air = Math.hypot(ax, ay, az) || 1e-6;

    let fx = -DRAG * air * ax;
    let fy = -DRAG * air * ay - GRAVITY;
    let fz = -DRAG * air * az;

    /* Lift acts perpendicular to the airflow, in the vertical plane that
     * contains it — up and slightly back while the ball is climbing, up and
     * slightly forward once it has started to fall. */
    const horiz = Math.hypot(ax, az) || 1e-6;
    const lift = LIFT * air * air;
    const lx = (-ax / horiz) * (ay / air);
    const lz = (-az / horiz) * (ay / air);
    const ly = horiz / air;
    fx += lift * lx;
    fy += lift * ly;
    fz += lift * lz;

    v.x += fx * dt;
    v.y += fy * dt;
    v.z += fz * dt;

    const px = p.x;
    const pz = p.z;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;
    this.travelled += Math.hypot(p.x - px, p.z - pz);
    this.airborneTime += dt;
    if (p.y > this.apex) this.apex = p.y;

    if (isOutOfBounds(p.x, p.z)) {
      // Let it land first — a ball still in the air is not yet anywhere.
      if (p.y <= heightAt(p.x, p.z)) {
        /* Still record the carry. A shot that flew a long way and then went
         * out of bounds flew a long way, and the stat that says so is the
         * only nice thing about it. */
        if (!this._carryDone) {
          this.carry = Math.hypot(p.x - this.origin.x, p.z - this.origin.z);
          this._carryDone = true;
        }
        this._goOutOfBounds();
      }
      return;
    }

    const ground = heightAt(p.x, p.z);
    if (p.y > ground) return;

    // It has arrived somewhere.
    p.y = ground;
    const surface = surfaceAt(p.x, p.z);
    this.surface = surface;

    if (!this._carryDone) {
      this.carry = Math.hypot(p.x - this.origin.x, p.z - this.origin.z);
      this.landing = { x: p.x, z: p.z, surface };
      this._carryDone = true;
      this.hooks.onLand?.(surface, { ...p });
    }

    if (surface === SURFACE.WATER) return this._splash();

    this._bounce(surface);
  }

  _bounce(surface) {
    const props = surfaceProps(surface);
    const v = this.velocity;
    const n = normalAt(this.position.x, this.position.z);

    // Split the impact into "into the ground" and "along the ground".
    const dot = v.x * n.x + v.y * n.y + v.z * n.z;
    const nx = n.x * dot;
    const ny = n.y * dot;
    const nz = n.z * dot;
    const tx = v.x - nx;
    const ty = v.y - ny;
    const tz = v.z - nz;

    const impact = Math.abs(dot);
    this.bounces++;
    this.hooks.onBounce?.(surface, impact, { ...this.position });

    if (impact < BOUNCE_FLOOR || this.bounces > 6) {
      // Done bouncing. Everything left over becomes roll.
      v.x = tx * props.tangent;
      v.y = 0;
      v.z = tz * props.tangent;
      this.state = BALL_STATE.ROLL;
      return;
    }

    v.x = tx * props.tangent - nx * props.restitution;
    v.y = ty * props.tangent - ny * props.restitution;
    v.z = tz * props.tangent - nz * props.restitution;
    // Nudge clear so the next substep is not immediately another contact.
    this.position.y += 0.012;
  }

  _rollStep(dt) {
    const p = this.position;
    const v = this.velocity;

    const surface = surfaceAt(p.x, p.z);
    this.surface = surface;

    if (surface === SURFACE.WATER) return this._splash();
    if (isOutOfBounds(p.x, p.z)) return this._goOutOfBounds();

    /* Gravity along the ground. On the green this is the whole game: the fall
     * toward the front and the extra tilt toward the pond are exactly what
     * make a straight putt not go straight. */
    const g = slopeAt(p.x, p.z);
    let ax = GRAVITY * g.x;
    let az = GRAVITY * g.z;

    const speed = Math.hypot(v.x, v.z);
    const friction = surfaceProps(surface).roll;

    if (speed > 1e-4) {
      ax -= (v.x / speed) * friction;
      az -= (v.z / speed) * friction;
    }

    v.x += ax * dt;
    v.z += az * dt;
    v.y = 0;

    const px = p.x;
    const pz = p.z;
    p.x += v.x * dt;
    p.z += v.z * dt;
    p.y = heightAt(p.x, p.z);
    this.travelled += Math.hypot(p.x - px, p.z - pz);

    if (this._checkCup()) return;

    const newSpeed = Math.hypot(v.x, v.z);
    if (newSpeed < STOP_SPEED) {
      /* Stop only where it would actually stay. On a slope steep enough to
       * beat friction the ball keeps trickling, which is how a putt that dies
       * above the hole ends up below it. */
      const slopePull = GRAVITY * Math.hypot(g.x, g.z);
      if (slopePull <= friction) {
        v.x = v.z = 0;
        this._stop(surface);
      }
    }
  }

  _checkCup() {
    const p = this.position;
    const d = Math.hypot(p.x - HOLE.pin.x, p.z - HOLE.pin.z);
    if (d > HOLE.cupRadius * 2.6) return false;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    /* Over the edge too fast and it rides the lip back out, which is the
     * correct amount of cruelty and also a line Rippin already has. */
    if (speed > CAPTURE_SPEED) return false;
    if (d > HOLE.cupRadius * 1.35 && speed > CAPTURE_SPEED * 0.55) return false;

    this.position.x = HOLE.pin.x;
    this.position.z = HOLE.pin.z;
    this.position.y = heightAt(HOLE.pin.x, HOLE.pin.z) - 0.1;
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.state = BALL_STATE.HOLED;
    this.hooks.onHoled?.({ ...this.position });
    return true;
  }

  _stop(surface) {
    this.state = BALL_STATE.STOPPED;
    this.surface = surface;
    this.position.y = heightAt(this.position.x, this.position.z);
    this.hooks.onStop?.(surface, { ...this.position });
  }

  _splash() {
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.position.y = HOLE.pond ? HOLE.pond.level : this.position.y;
    this.state = BALL_STATE.WATER;
    this.surface = SURFACE.WATER;
    this.hooks.onSplash?.({ ...this.position });
    return true;
  }

  _goOutOfBounds() {
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.state = BALL_STATE.OUT_OF_BOUNDS;
    this.hooks.onOutOfBounds?.({ ...this.position });
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Recovery                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Where this ball should be dropped, given how it got here.
   *
   * Water and out of bounds are worked out along the line the shot travelled;
   * a stuck ball is recovered where it lies if that spot is legal. Both come
   * back to `field.js`, which guarantees dry, in-bounds, playable ground.
   */
  dropPoint() {
    if (this.state === BALL_STATE.WATER || this.state === BALL_STATE.OUT_OF_BOUNDS) {
      return dropPointFor(this.position.x, this.position.z, this.origin.x, this.origin.z);
    }
    return recoveryPointFor(this.position.x, this.position.z);
  }

  /**
   * Nothing that happens to a golf ball may end the scene.
   *
   * Called every frame by the mission. It catches the cases the integrator
   * cannot: a ball under the terrain, a ball wedged against a collider that
   * never quite stops, a ball rolling forever on a slope, a ball that has been
   * "moving" for longer than any golf shot lasts.
   */
  watchdog(dt) {
    if (!this.moving) return null;
    const ground = heightAt(this.position.x, this.position.z);

    if (this.position.y < ground - 1.2) return 'below_terrain';

    this._stuckTimer += dt;
    if (this._stuckTimer > 45) return 'too_long';

    const speed = Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z);
    if (this.state === BALL_STATE.ROLL && speed < STOP_SPEED * 0.5) {
      // Rolling but not actually going anywhere.
      this._settleTimer = (this._settleTimer || 0) + dt;
      if (this._settleTimer > 1.5) {
        this._settleTimer = 0;
        this._stop(surfaceAt(this.position.x, this.position.z));
      }
    } else {
      this._settleTimer = 0;
    }
    return null;
  }

  /** Feet from the pin, which is the unit golfers actually use up close. */
  distanceToPin() {
    return distanceToPin(this.position.x, this.position.z);
  }
}

/* ------------------------------------------------------------------ */
/* Aiming                                                              */
/* ------------------------------------------------------------------ */

/**
 * Run a shot to its conclusion without rendering it. Used by the solver and
 * by the verifier; never by the scene, which watches the ball fly.
 */
export function simulate(from, aimRad, launch, limit = 45) {
  const b = new Ball();
  b.placeAt(from.x, from.z);
  b.strike(aimRad, launch);
  let t = 0;
  while (b.moving && t < limit) {
    b.update(1 / 120);
    t += 1 / 120;
  }
  return b;
}

/**
 * Find the swing that puts the ball on a spot.
 *
 * This is how the NPC tee shots are authored. Lou's ball genuinely flies low,
 * lands on the front fringe and releases onto the green; it is not placed
 * there. What is authored is the target — everything between the clubface and
 * the grass is the same physics the player gets, which is the only reason the
 * three of them playing looks like three people playing.
 *
 * Power is bisected, then the aim is corrected for the drift the wind put on
 * that flight, and both are repeated. Converges in well under a hundred
 * simulated shots, which is a few milliseconds at load time.
 */
export function solveShot({ from, target, club, lie, loftBias = 1, passes = 3 }) {
  let aim = Math.atan2(target.x - from.x, target.z - from.z);
  let power = 0.75;

  const shoot = (p, a) => {
    const launch = launchFor(club, { power: p, accuracy: 0, lie });
    launch.loftDeg *= loftBias;
    return simulate(from, a, launch);
  };

  const wanted = Math.hypot(target.x - from.x, target.z - from.z);

  for (let pass = 0; pass < passes; pass++) {
    // --- distance, by bisection on power ---
    let lo = 0.05;
    let hi = 1.0;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      const b = shoot(mid, aim);
      const got = Math.hypot(b.position.x - from.x, b.position.z - from.z);
      if (got < wanted) lo = mid; else hi = mid;
      power = mid;
    }

    // --- direction, by measuring where that shot actually finished ---
    const b = shoot(power, aim);
    const err = Math.atan2(b.position.x - from.x, b.position.z - from.z) - aim;
    const wantedAngle = Math.atan2(target.x - from.x, target.z - from.z);
    aim = wantedAngle - err;
  }

  const launch = launchFor(club, { power, accuracy: 0, lie });
  launch.loftDeg *= loftBias;
  const final = simulate(from, aim, launch);
  return {
    aim,
    power,
    launch,
    /* How close the solver actually got. The caller logs this rather than
     * trusting it: a target inside the pond would converge on a splash and
     * report it honestly instead of pretending. */
    landedAt: { x: final.position.x, z: final.position.z },
    landing: final.landing,
    error: Math.hypot(final.position.x - target.x, final.position.z - target.z),
    state: final.state,
    surface: final.surface,
  };
}

