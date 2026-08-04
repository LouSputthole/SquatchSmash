/**
 * Interceptors — night fighters up after the Enola Squatch.
 *
 * Owner, 2026-08-04: "They will need good NPC behavior not too hard not too
 * easy. they try and shoot you down."
 *
 * This is the air half of the threat. `./Defense.js` is the ground half and
 * stays exactly that — it owns the searchlights, the batteries, the flak and,
 * critically, the DAMAGE MODEL. Everything a fighter does to the aeroplane is
 * routed back through `Defense.damageEngine/damageRudder/damageElectrical/
 * damageFuel`, so there is one place that decides what a hit costs, one HUD
 * warning set, one score term and one "that one found us" line. Extending the
 * existing combat directory rather than starting a parallel one was the brief;
 * this is what that means in practice.
 *
 * ---------------------------------------------------------------------------
 * THE AI
 *
 * Each fighter is a small state machine flying kinematically — a position, a
 * velocity, a turn-rate limit and a speed limit. It is not `AircraftPhysics`,
 * and it should not be: an NPC that has to be trimmed is an NPC that flies into
 * a hill.
 *
 *   ingress      climbing and closing from wherever it was scrambled, aiming
 *                at a PERCH — a point behind, above and off to one side of the
 *                bomber. It does not fly at the bomber, it flies to a position
 *                it can attack FROM, which is the difference between a fighter
 *                and a missile.
 *   pursuit      rolls in from the perch onto a lead point (where the bomber
 *                will be, not where it is), converging.
 *   attack       inside `FIRE_RANGE` and inside the cone: bursts of tracer with
 *                real travel time and real dispersion.
 *   breakoff     past minimum range, or out of burst: pulls up and away across
 *                the bomber's tail, which is when the rear gunner gets his
 *                best shot at it.
 *   reposition   extends to a couple of kilometres, turns round, waits out a
 *                cooldown, and comes again.
 *   dead         trailing fire, rolling over, going down.
 *
 * FAIR, NOT EASY. Four things keep this beatable:
 *
 *   1. AT MOST `MAX_ENGAGED` fighters are ever allowed into `pursuit`/`attack`
 *      at once. The rest orbit and wait their turn. Being jumped by six at
 *      once is not difficulty, it is a coin flip.
 *   2. A fighter TELEGRAPHS. It is called out on the intercom when it commits,
 *      and its first burst is deliberately wide — `onCallout` fires before the
 *      first round leaves the guns.
 *   3. EVASION WORKS. `aimError` scales with how hard the bomber is manoeuvring
 *      (roll rate, g deviation, sideslip). A heavy four-engine bomber cannot
 *      outrun a fighter and is not supposed to; it can spoil the shot, and a
 *      player who flies it like a truck will take hits.
 *   4. THEY DIE. Three cannon hits from the rear turret and one is finished.
 *      `damage()` is the whole interface the gunner needs.
 *
 * AND THEY PUNISH AUTOPILOT. `setPredictability(k)` is raised by
 * `../systems/Autopilot.js` while nobody is flying: straight and level is the
 * easiest gunnery problem there is, and that is the price of leaving the seat
 * to man the guns.
 * ---------------------------------------------------------------------------
 */
import * as THREE from 'three';
import {
  solid, unlit, boxGeo, coneGeo, sphereGeo, cylGeo,
  mesh, flatMesh, group, clamp, lerp, damp, smoothstep, rng,
} from '../../beefrun/util.js';
import { TracerPool } from './Tracers.js';

/** How many may be pressing an attack at any one moment. */
export const MAX_ENGAGED = 2;
/** Cannon hits a fighter takes before it is finished. */
export const FIGHTER_HEALTH = 3;

const FIRE_RANGE = 940;          // m — outside this they do not shoot
const MIN_RANGE = 190;           // m — inside this they break off, always
const FIRE_CONE = 0.30;          // rad — 17 deg of angle-off to open fire
const BURST = [0.55, 1.35];      // seconds
const REST = [1.1, 2.6];         // seconds between bursts in one pass
const PASS_COOLDOWN = [5.0, 9.5];// seconds between passes

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _leadPoint = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

/* ------------------------------------------------------------------ */
/* The aeroplane                                                       */
/* ------------------------------------------------------------------ */

/**
 * A single-engine night fighter: seven meshes, built once per airframe.
 *
 * Deliberately a different silhouette from `Defense.js`'s decorative patrol
 * aircraft — twin-tail, blunt nose, exhaust glow either side of the cowl — so
 * a player can tell at a glance which of the things in the sky is the one
 * shooting at him.
 */
function makeFighter(colour) {
  const g = group('night-fighter');
  const skin = solid(colour, { roughness: 0.62, metalness: 0.3 });
  const dark = solid(0x1c1e22, { roughness: 0.8 });

  // Nose is +Z, same convention as everything else in this project.
  g.add(mesh(boxGeo(1.25, 1.35, 7.6), skin, 0, 0, 0));
  const nose = mesh(coneGeo(0.62, 2.0, 10), skin, 0, 0, 4.4);
  nose.rotation.x = Math.PI / 2;
  g.add(nose);
  g.add(mesh(boxGeo(10.6, 0.24, 1.9), skin, 0, 0.12, 0.4));
  // Twin fins on a tailplane.
  g.add(mesh(boxGeo(4.0, 0.18, 1.1), skin, 0, 0.3, -3.4));
  for (const sx of [-1.8, 1.8]) g.add(mesh(boxGeo(0.16, 1.5, 1.0), skin, sx, 1.0, -3.4));
  // Canopy.
  const canopy = mesh(sphereGeo(0.6, 10, 8), dark, 0, 0.7, 0.6);
  canopy.scale.set(0.8, 0.7, 1.8);
  g.add(canopy);
  // Exhaust glow either side of the cowl, and wingtip lights.
  const exhaust = [];
  for (const sx of [-0.55, 0.55]) {
    const e = flatMesh(sphereGeo(0.22, 8, 6), unlit(0xff7a2a, {
      transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }), sx, -0.1, 2.6);
    g.add(e);
    exhaust.push(e);
  }
  for (const sx of [-1, 1]) {
    g.add(flatMesh(sphereGeo(0.13), unlit(sx < 0 ? 0xff2a1e : 0x37ff6a), sx * 5.3, 0.14, 0.3));
  }
  // Wing-root muzzle flashes.
  const flashes = [];
  for (const sx of [-1.5, 1.5]) {
    const f = flatMesh(sphereGeo(0.3, 8, 6), unlit(0xfff0b0, {
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }), sx, 0, 3.0);
    g.add(f);
    flashes.push(f);
  }
  // Damage: a smoke trail that only appears once it has been hurt.
  const smoke = flatMesh(cylGeo(0.9, 0.2, 9, 8, true), unlit(0x2a2622, {
    transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }), 0, 0, -6.5);
  smoke.rotation.x = Math.PI / 2;
  g.add(smoke);

  return { group: g, exhaust, flashes, smoke };
}

/* ------------------------------------------------------------------ */

let _uid = 0;

class Fighter {
  constructor(root, colour, seedRand) {
    const built = makeFighter(colour);
    this.id = ++_uid;
    this.name = `fighter-${this.id}`;
    this.group = built.group;
    this.exhaust = built.exhaust;
    this.flashes = built.flashes;
    this.smokeMesh = built.smoke;
    root.add(this.group);

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.speed = 118;
    this.health = FIGHTER_HEALTH;
    this.state = 'ingress';
    this.stateT = 0;
    this.engaged = false;
    this.burstT = 0;
    this.restT = 0;
    this.cooldown = 0;
    this.passes = 0;
    this.calledOut = false;
    this.rand = seedRand;
    /** Which side and how far above it likes to set up. */
    this.side = seedRand() < 0.5 ? -1 : 1;
    this.high = 90 + seedRand() * 220;
    this.bank = 0;
  }

  get alive() { return this.health > 0; }

  /** Point the model along its own flight path, with a bit of bank in a turn. */
  orient(dt, turnRate) {
    if (this.velocity.lengthSq() < 1) return;
    _v.copy(this.position).add(this.velocity);
    this.group.position.copy(this.position);
    this.group.lookAt(_v);
    this.bank = damp(this.bank, clamp(-turnRate * 5.2, -1.15, 1.15), 3.0, dt);
    this.group.rotateZ(this.bank);
  }
}

export class Interceptors {
  /**
   * @param {THREE.Scene} scene
   * @param {object} [opts]
   * @param {(x:number,z:number)=>number} [opts.getHeight] so a dying fighter
   *   hits the ground rather than falling through it.
   */
  constructor(scene, { getHeight = null } = {}) {
    this.scene = scene;
    this.getHeight = getHeight;
    this.root = group('interceptors');
    scene.add(this.root);
    this.tracers = new TracerPool(this.root, 180);

    this.fighters = [];
    this.deployed = false;
    this.wave = 0;
    this._spawnT = 0;
    this._rand = rng(0x4E19);
    this._pendingWave = 0;
    this._predictability = 0;

    /** Raised by the mission; 0.6 is a gentle night, 1.4 is a bad one. */
    this.aggression = 1;

    this.kills = 0;
    this.hitsTaken = 0;
    this.roundsAtUs = 0;

    this.onCallout = null;     // (kind, fighter) => void
    this.onHit = null;         // (severity:number) => void
    this.onNearMiss = null;    // () => void
    this.onKill = null;        // (fighter) => void
    this.onFirstContact = null;// () => void
  }

  /** How many are alive and in the air. */
  get activeCount() { return this.fighters.filter((f) => f.alive).length; }

  /** How many are actually pressing an attack right now. */
  get engagedCount() { return this.fighters.filter((f) => f.alive && f.engaged).length; }

  /**
   * Straight-and-level is an easy shot. `../systems/Autopilot.js` pushes this
   * up while the aeroplane is flying itself; 0 is a pilot working at it, 1 is
   * an aeroplane on rails.
   */
  setPredictability(k) { this._predictability = clamp(k, 0, 1); }

  /**
   * Put a wave up.
   *
   * @param {object} o
   * @param {THREE.Vector3} o.around where the bomber is now
   * @param {number} [o.count] how many
   * @param {number} [o.delay] seconds before the first one appears
   */
  deploy({ around, count = 3, delay = 0 }) {
    this.deployed = true;
    this._pendingWave = count;
    this._spawnT = delay;
    this._spawnAround = around.clone();
  }

  _spawnOne(bomber) {
    const rand = this._rand;
    const colours = [0x3a4048, 0x44403a, 0x2e3a34, 0x4a3a3a];
    const f = new Fighter(this.root, colours[this.fighters.length % colours.length], rand);
    // In from ahead and off to one side, high — the way a controller vectors
    // them onto a bomber stream, not straight up from underneath it.
    const bearing = Math.atan2(bomber.x - this._spawnAround.x, bomber.z - this._spawnAround.z);
    const off = (rand() - 0.5) * 1.6 + (rand() < 0.5 ? Math.PI * 0.42 : -Math.PI * 0.42);
    const r = 2600 + rand() * 1400;
    f.position.set(
      bomber.x + Math.sin(bearing + off) * r,
      Math.max(bomber.y + 120 + rand() * 320, 260),
      bomber.z + Math.cos(bearing + off) * r,
    );
    _v.subVectors(bomber, f.position).normalize();
    f.velocity.copy(_v).multiplyScalar(f.speed);
    f.group.position.copy(f.position);
    this.fighters.push(f);
    this.wave++;
    if (this.fighters.length === 1) this.onFirstContact?.();
    return f;
  }

  /**
   * @param {number} dt
   * @param {object} target
   * @param {THREE.Vector3} target.position   the bomber
   * @param {THREE.Vector3} target.velocity
   * @param {number} [target.evasion] 0..1 — how hard the bomber is being
   *   thrown about this frame. The mission computes it from roll rate and g.
   */
  update(dt, { position, velocity, evasion = 0 } = {}) {
    if (!this.deployed || !position) return;

    if (this._pendingWave > 0) {
      this._spawnT -= dt;
      if (this._spawnT <= 0) {
        this._spawnOne(position);
        this._pendingWave--;
        // Loose pairs rather than a queue of singletons.
        this._spawnT = this._pendingWave % 2 === 0 ? 6 + this._rand() * 8 : 1.4;
      }
    }

    // Only so many are allowed to commit. Everybody else stands off.
    let slots = MAX_ENGAGED;
    for (const f of this.fighters) {
      if (f.alive && f.engaged) slots--;
    }

    for (const f of this.fighters) {
      if (!f.alive) { this._updateDying(dt, f); continue; }
      f.stateT += dt;
      const toUs = _w.subVectors(position, f.position);
      const range = toUs.length();
      const heading = f.velocity.clone().normalize();
      const angleOff = range > 1 ? Math.acos(clamp(heading.dot(toUs.clone().normalize()), -1, 1)) : 0;

      switch (f.state) {
        case 'ingress': {
          const perch = this._perch(position, velocity, f);
          const turn = this._steer(dt, f, perch, 0.42, 132);
          f.orient(dt, turn);
          if (f.position.distanceTo(perch) < 340 || f.stateT > 26) {
            if (slots > 0) { slots--; f.engaged = true; this._enter(f, 'pursuit'); } else this._enter(f, 'reposition');
          }
          break;
        }
        case 'pursuit': {
          this._lead(position, velocity, f, _leadPoint);
          const turn = this._steer(dt, f, _leadPoint, 0.66, 148);
          f.orient(dt, turn);
          if (!f.calledOut && range < 1500) {
            f.calledOut = true;
            this.onCallout?.('committing', f);
          }
          if (range < FIRE_RANGE && angleOff < FIRE_CONE) this._enter(f, 'attack');
          if (range < MIN_RANGE) this._enter(f, 'breakoff');
          if (f.stateT > 20) this._enter(f, 'breakoff');
          break;
        }
        case 'attack': {
          this._lead(position, velocity, f, _leadPoint);
          const turn = this._steer(dt, f, _leadPoint, 0.72, 152);
          f.orient(dt, turn);
          this._shoot(dt, f, position, velocity, range, evasion);
          if (range < MIN_RANGE || range > FIRE_RANGE * 1.35 || angleOff > FIRE_CONE * 2.2) {
            this._enter(f, 'breakoff');
          }
          break;
        }
        case 'breakoff': {
          // Up and across the tail — which is exactly where the rear gun is.
          _v.copy(position)
            .addScaledVector(velocity.clone().normalize(), -420)
            .add(new THREE.Vector3(f.side * 700, 320, f.side * 300));
          const turn = this._steer(dt, f, _v, 0.85, 160);
          f.orient(dt, turn);
          for (const fl of f.flashes) fl.material.opacity = 0;
          if (f.stateT > 3.6 || range > 900) {
            f.engaged = false;
            f.passes++;
            f.cooldown = lerp(PASS_COOLDOWN[0], PASS_COOLDOWN[1], this._rand()) / clamp(this.aggression, 0.4, 2);
            this._enter(f, 'reposition');
          }
          break;
        }
        case 'reposition': {
          f.cooldown -= dt;
          const perch = this._perch(position, velocity, f);
          const turn = this._steer(dt, f, perch, 0.4, 138);
          f.orient(dt, turn);
          if (f.cooldown <= 0 && slots > 0 && f.position.distanceTo(perch) < 700) {
            slots--;
            f.engaged = true;
            f.calledOut = false;
            this._enter(f, 'pursuit');
            this.onCallout?.('again', f);
          }
          break;
        }
        default:
          break;
      }

      // Never let one fly into the ground while it is still alive.
      if (this.getHeight) {
        const floor = this.getHeight(f.position.x, f.position.z) + 90;
        if (f.position.y < floor) {
          f.position.y = floor;
          f.velocity.y = Math.max(f.velocity.y, 14);
        }
      }

      const flicker = 0.5 + Math.random() * 0.4;
      for (const e of f.exhaust) e.material.opacity = flicker * 0.75;
    }

    this.tracers.update(dt);
  }

  _enter(f, state) {
    f.state = state;
    f.stateT = 0;
    if (state === 'attack') {
      f.burstT = 0;
      f.restT = 0.25 + this._rand() * 0.4;
    }
  }

  /** Where a fighter wants to be before it rolls in. */
  _perch(position, velocity, f) {
    const fwd = velocity.lengthSq() > 1 ? velocity.clone().normalize() : new THREE.Vector3(0, 0, 1);
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(f.side * 900);
    return position.clone()
      .addScaledVector(fwd, -1500)
      .add(side)
      .add(new THREE.Vector3(0, f.high, 0));
  }

  /** Where the bomber will be when the fighter's rounds get there. */
  _lead(position, velocity, f, out) {
    const range = f.position.distanceTo(position);
    const t = clamp(range / 700, 0, 2.2);
    return out.copy(position).addScaledVector(velocity, t * 0.7);
  }

  /**
   * Fly toward `to`, turning no faster than `turnRate` rad/s.
   * @returns {number} the turn rate actually used, signed, for the bank.
   */
  _steer(dt, f, to, turnRate, speed) {
    _v.subVectors(to, f.position);
    const d = _v.length();
    if (d < 1) return 0;
    _v.multiplyScalar(1 / d);
    const cur = f.velocity.clone().normalize();
    const angle = Math.acos(clamp(cur.dot(_v), -1, 1));
    const step = Math.min(angle, turnRate * dt);
    // Signed, about the world up axis, purely so the model banks the right way.
    const cross = cur.x * _v.z - cur.z * _v.x;
    if (angle > 1e-4) {
      const axis = new THREE.Vector3().crossVectors(cur, _v).normalize();
      cur.applyAxisAngle(axis, step);
    }
    f.speed = damp(f.speed, speed, 1.2, dt);
    f.velocity.copy(cur).multiplyScalar(f.speed);
    f.position.addScaledVector(f.velocity, dt);
    return angle > 1e-4 ? Math.sign(cross) * (step / Math.max(dt, 1e-4)) * 0.35 : 0;
  }

  /**
   * A burst.
   *
   * The dispersion cone is the whole difficulty knob and it is deliberately
   * legible: base accuracy, degraded by how hard the bomber is manoeuvring,
   * improved by how predictable it is (autopilot), degraded again with range.
   * A hit is decided when the round is FIRED — the streak still has to travel,
   * so the player sees the burst coming past before anything registers, which
   * is what makes it feel like gunnery rather than like a dice roll.
   */
  _shoot(dt, f, position, velocity, range, evasion) {
    if (f.burstT > 0) {
      f.burstT -= dt;
      f._roundT = (f._roundT ?? 0) - dt;
      if (f._roundT <= 0) {
        f._roundT = 1 / 11;
        this._round(f, position, velocity, range, evasion);
      }
      const lit = 0.55 + Math.random() * 0.45;
      for (const fl of f.flashes) fl.material.opacity = lit;
      if (f.burstT <= 0) {
        f.restT = lerp(REST[0], REST[1], this._rand());
        for (const fl of f.flashes) fl.material.opacity = 0;
      }
      return;
    }
    f.restT -= dt;
    if (f.restT <= 0) {
      f.burstT = lerp(BURST[0], BURST[1], this._rand()) * clamp(this.aggression, 0.5, 1.6);
      f._roundT = 0;
    }
  }

  _round(f, position, velocity, range, evasion) {
    // Base hit chance per ROUND, before anything degrades it.
    const base = 0.055 * clamp(this.aggression, 0.4, 1.8);
    const closeness = smoothstep(FIRE_RANGE, 220, range);          // nearer is better
    const spoiled = 1 - clamp(evasion, 0, 1) * 0.82;                // manoeuvring works
    const rails = 1 + this._predictability * 0.85;                  // autopilot is punished
    const chance = clamp(base * (0.35 + closeness) * spoiled * rails, 0, 0.4);
    const hit = Math.random() < chance;

    // The aim point: the lead point, plus a miss vector when it is a miss.
    const aim = _leadPoint.clone();
    if (!hit) {
      const spread = lerp(9, 46, clamp(range / FIRE_RANGE, 0, 1)) * (0.5 + Math.random() * 1.2);
      aim.add(new THREE.Vector3(
        (Math.random() - 0.5) * 2 * spread,
        (Math.random() - 0.5) * 2 * spread * 0.7,
        (Math.random() - 0.5) * 2 * spread,
      ));
    } else {
      aim.copy(position);
    }
    f.group.updateWorldMatrix(true, false);
    _muzzle.set((Math.random() < 0.5 ? -1.5 : 1.5), 0, 3.0).applyMatrix4(f.group.matrixWorld);
    this.roundsAtUs++;
    this.tracers.fire({
      from: _muzzle,
      to: aim,
      speed: 820,
      colour: 0xfff4c8,
      width: 0.55,
      onArrive: () => {
        if (hit) {
          this.hitsTaken++;
          this.onHit?.(clamp(0.4 + closeness * 0.6, 0, 1));
        } else if (aim.distanceTo(position) < 70) {
          this.onNearMiss?.();
        }
      },
    });
    void velocity;
  }

  /**
   * The rear gun got one.
   * @param {Fighter} f
   * @param {number} [amount] hits' worth of damage
   * @returns {'hit'|'killed'|'nothing'}
   */
  damage(f, amount = 1) {
    if (!f || !f.alive) return 'nothing';
    f.health -= amount;
    f.smokeMesh.material.opacity = clamp((FIGHTER_HEALTH - f.health) / FIGHTER_HEALTH, 0, 1) * 0.7;
    if (f.health > 0) return 'hit';
    f.state = 'dead';
    f.engaged = false;
    f.stateT = 0;
    this.kills++;
    this.onKill?.(f);
    return 'killed';
  }

  /** Rolling over, burning, going in. */
  _updateDying(dt, f) {
    f.stateT += dt;
    f.velocity.y -= 11 * dt;
    f.velocity.multiplyScalar(1 - 0.06 * dt);
    f.position.addScaledVector(f.velocity, dt);
    f.group.position.copy(f.position);
    f.group.rotateZ(dt * 3.2);
    f.group.rotateX(dt * 0.8);
    f.smokeMesh.material.opacity = 0.85;
    for (const e of f.exhaust) e.material.opacity = 0.2 + Math.random() * 0.6;
    const floor = this.getHeight ? this.getHeight(f.position.x, f.position.z) : 0;
    if (f.position.y <= floor + 4 || f.stateT > 26) {
      this.root.remove(f.group);
      const i = this.fighters.indexOf(f);
      if (i >= 0) this.fighters.splice(i, 1);
    }
  }

  /** Everybody goes home. Used when a phase ends or a checkpoint restarts. */
  clear() {
    for (const f of this.fighters) this.root.remove(f.group);
    this.fighters.length = 0;
    this.tracers.clear();
    this.deployed = false;
    this._pendingWave = 0;
  }

  dispose() {
    this.clear();
    this.tracers.dispose();
    this.scene.remove(this.root);
  }
}
