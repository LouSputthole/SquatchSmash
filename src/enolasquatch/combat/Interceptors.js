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
 *                at a SETUP POINT — where its profile likes to attack FROM,
 *                which is the difference between a fighter and a missile.
 *   pursuit      rolls in from the setup onto a lead point (where the bomber
 *                will be, not where it is), converging.
 *   attack       inside `FIRE_RANGE` and inside the cone: bursts of tracer with
 *                real travel time and real dispersion.
 *   breakoff     past minimum range, or out of burst: pulls up and away across
 *                the bomber's tail, which is when the rear gunner gets his
 *                best shot at it.
 *   reposition   extends to a couple of kilometres, turns round, waits out a
 *                cooldown, and comes again.
 *   withdraw     WOUNDED. Past `WOUNDED_HEALTH` it is out of the fight and
 *                running for home, on fire, trailing smoke it cannot afford.
 *   dead         trailing fire, shedding pieces, rolling over, going down.
 *
 * ---------------------------------------------------------------------------
 * THE PROFILES (owner review, 2026-08-19: "enemy fighters largely repeat one
 * pattern, so turret play gets repetitive")
 *
 * The chain above is one way to attack a bomber, and it was the ONLY way, so
 * every pass read the same from the turret. A fighter now carries a `profile`
 * the wave director hands it at spawn, and the profile decides what "setting
 * up" and "committing" mean:
 *
 *   classic     the original ingress-pursuit-attack-breakoff pass, unchanged.
 *   crossing    a PAIR, one off each quarter, slicing across the bomber's
 *               track from opposite sides with the guns going on the crossing
 *               leg — a full-deflection shot for them and a full-deflection
 *               lead problem for the turret. After the cross each swaps sides
 *               and comes back from the other quarter.
 *   highside    climbs offstage to a perch far above the bomber, then a steep
 *               firing dive straight down through the formation and a hard
 *               pull-out BELOW it — fast, loud, and gone under the tail before
 *               the turret can follow it down.
 *   harass      hangs on a quarter outside `COMMIT_RANGE`, jinking on its own
 *               seeded rhythm, sniping long bursts that mostly miss, and
 *               REFUSING to commit — until the turret's fire discipline
 *               lapses (a jam, an overheat, a dry belt), at which point it is
 *               suddenly a `classic` attacker with a head start.
 *   priority    an undamaged fighter that reads the aeroplane before it picks
 *               a door: it sets up in the tail turret's blind arc (ahead of
 *               the beam, below the elevation stops), on whichever side the
 *               gunner has been watching LEAST (`setTurretStatus` feeds a
 *               per-side coverage clock), and it aims for a specific healthy
 *               engine (`update`'s `engines` array) — `targetEngine` rides
 *               along on the hit callback so the mission can bill the right
 *               nacelle.
 *
 * THE DIRECTOR. `deploy()` without an explicit `profiles` list assigns from
 * `WAVE_SCRIPTS`, an authored rota advanced once per wave — written so that no
 * two consecutive waves (including the wrap) read the same from the turret.
 * The mission keeps calling `scrambleFighters(count, delay)` exactly as
 * before; the variety is this file's job, not the phase machine's.
 *
 * FAIR, NOT EASY. Four things keep this beatable, profiles included:
 *
 *   1. AT MOST `MAX_ENGAGED` fighters are ever allowed to press an attack at
 *      once — a crossing pair takes both slots, a harasser holding at range
 *      takes none. Being jumped by six at once is not difficulty, it is a
 *      coin flip.
 *   2. A fighter TELEGRAPHS. It is called out on the intercom when it commits,
 *      and its first burst is deliberately wide — `onCallout` fires before the
 *      first round leaves the guns.
 *   3. EVASION WORKS. `aimError` scales with how hard the bomber is manoeuvring
 *      (roll rate, g deviation, sideslip). A heavy four-engine bomber cannot
 *      outrun a fighter and is not supposed to; it can spoil the shot, and a
 *      player who flies it like a truck will take hits.
 *   4. THEY DIE — and now they also QUIT. Three cannon hits from the rear
 *      turret and one is finished; two and it is `withdraw`ing on fire, which
 *      is a threat removed without a kill. `damage()` is still the whole
 *      interface the gunner needs.
 *
 * THE ENVELOPE IS PINNED. The profiles are variety, not escalation: measured
 * on the pre-profile build (240 s, straight and level, dt 1/30), a classic
 * wave of three at aggression 1.0 put 531 rounds at the bomber for ~24 hits
 * (range 14–29 over 40 trials), and a wave of two at 1.15 put up 493 for ~26
 * (16–36); `MAX_ENGAGED` never exceeded 2. Every authored wave script is held
 * inside those numbers by `tests/enolasquatch-interceptor-profiles.test.mjs`.
 * The gameplay-consequential dice (`_round`'s hit roll and miss spread) run on
 * the instance's own seeded rng rather than `Math.random` so that test is a
 * measurement, not a weather report; the purely visual flicker keeps
 * `Math.random`, where nondeterminism is free.
 *
 * AND THEY PUNISH AUTOPILOT. `setPredictability(k)` is raised by
 * `../systems/Autopilot.js` while nobody is flying: straight and level is the
 * easiest gunnery problem there is, and that is the price of leaving the seat
 * to man the guns.
 *
 * ---------------------------------------------------------------------------
 * FOR SHOW (owner, 2026-08-06: "Lets just have all the flak and fighters for
 * show.") Nothing in THIS file changed and nothing in it needed to, because
 * nothing in it ever touched the aeroplane: a round that connects raises
 * `hitsTaken` and calls `onHit(severity, fighter)`, and the mission's handler
 * is what turns that into torn skin and a dead engine. That handler —
 * `MissionController.onFighterHit()` — is now gated on `LIVE_FIRE.fighters`
 * (`../config.js`). So the passes, the tracer, the near misses, the callouts,
 * the shake, the barks, `roundsAtUs` and `hitsTaken` are all exactly as they
 * were, and only the consequence is switched off. Turning it back on is one
 * boolean; see that flag.
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
/** At or below this many hits left, a fighter quits and runs for home. */
export const WOUNDED_HEALTH = 1;
/** A wounded fighter is visibly out of the fight within this many seconds. */
export const WOUNDED_BREAK_SECONDS = 3.5;
/** The harasser's leash — it refuses to close inside this until the lapse. */
export const COMMIT_RANGE = 700;
/** How long a lapse in the turret's fire discipline stays exploitable. */
export const LAPSE_WINDOW = 4.5;
/** The harasser's patience. It will not nag from range for the whole raid. */
export const HARASS_PATIENCE = 45;
/** How long one bullet strike stays visible on a fighter that survived it. */
export const STRIKE_SECONDS = 0.34;

/**
 * The authored rota. One entry per wave, advanced each `deploy()`, cycled.
 * AUTHORED, not sampled: written so no two consecutive entries — including
 * the wrap from the last back to the first — read the same from the turret.
 * A wave bigger than its entry pads with `classic`.
 */
export const WAVE_SCRIPTS = [
  ['crossing', 'crossing'],             // scissors off both quarters
  ['highside', 'harass'],               // one screaming down, one nagging
  ['priority', 'crossing'],             // the surgeon and a slicer
  ['harass', 'highside'],               // the nag first this time
  ['priority', 'priority'],             // both reading the blind spots
  ['crossing', 'highside'],             // wraps against wave one: differs
];

const FIRE_RANGE = 940;          // m — outside this they do not shoot
const MIN_RANGE = 190;           // m — inside this they break off, always
const FIRE_CONE = 0.30;          // rad — 17 deg of angle-off to open fire
const CROSS_CONE = 0.62;         // rad — deflection shooting on a crossing leg
const HARASS_CONE = 1.2;         // rad — the sniper is spraying, not aiming
const BURST = [0.55, 1.35];      // seconds
const REST = [1.1, 2.6];         // seconds between bursts in one pass
const PASS_COOLDOWN = [5.0, 9.5];// seconds between passes

const CROSS_LATERAL = 1250;      // m abeam where a crossing pass sets up
const CROSS_WINDOW = 16;         // s to get across the track before bailing
const HIGH_ABOVE = 620;          // m over the bomber for the high-side perch
const DIVE_EXIT_BELOW = 80;      // m under the bomber before the pull-out ends
const HARASS_SNIPE_RANGE = 1350; // m — the nag shoots from further than it should

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _leadPoint = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _cur = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _perchPoint = new THREE.Vector3();
const _fwd = new THREE.Vector3();
/* The strike effects get their OWN scratch. `damage()` is reached from a tracer
 * arrival callback, which can land in the middle of `update()`'s per-fighter
 * loop — borrowing `_v`/`_w` there would corrupt whatever steering computation
 * was half way through using them. */
const _strikeAt = new THREE.Vector3();
const _sparkVel = new THREE.Vector3();

/** Debris throw directions — fixed table, so a breakup allocates nothing. */
const DEBRIS_DIRS = [
  new THREE.Vector3(0.7, 0.5, -0.5).normalize(),
  new THREE.Vector3(-0.6, 0.6, -0.4).normalize(),
  new THREE.Vector3(0.3, 0.8, 0.5).normalize(),
  new THREE.Vector3(-0.4, 0.3, 0.85).normalize(),
  new THREE.Vector3(0.9, -0.2, 0.3).normalize(),
  new THREE.Vector3(-0.8, -0.3, -0.5).normalize(),
];

/* ------------------------------------------------------------------ */
/* The aeroplane                                                       */
/* ------------------------------------------------------------------ */

/**
 * A single-engine night fighter: a dozen meshes, built once per airframe.
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

  /* FIRE — for a wounded withdrawal and for the way down. Its OWN materials:
   * `unlit()` caches by colour-plus-options, and a shared flame would light
   * every airframe in the wave the moment one of them burns (the same trap
   * `Defense.js`'s battery muzzle flashes document). Additive, no depth
   * write, and dragged out behind the engine like a blowtorch. */
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff8226, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  });
  const flame = new THREE.Mesh(cylGeo(0.45, 1.35, 7.5, 8, true), flameMat);
  flame.rotation.x = Math.PI / 2;
  flame.position.set(0, 0.1, -5.4);
  flame.castShadow = false;
  g.add(flame);
  const flameCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  });
  const flameCore = new THREE.Mesh(sphereGeo(0.7, 8, 6), flameCoreMat);
  flameCore.position.set(0, -0.05, 2.4);
  flameCore.castShadow = false;
  g.add(flameCore);

  /* DEBRIS — pieces shed on the way down. Built now, thrown by `_updateDying`,
   * so a breakup costs zero allocations at the moment it has to look good. */
  const debris = [];
  for (let i = 0; i < DEBRIS_DIRS.length; i++) {
    const dm = new THREE.MeshBasicMaterial({
      color: i % 2 ? 0xffb060 : 0x3a3a40, transparent: true, opacity: 0, toneMapped: false, fog: false,
    });
    const bit = new THREE.Mesh(boxGeo(0.4, 0.4, 1.6), dm);
    bit.visible = false;
    bit.castShadow = false;
    g.add(bit);
    debris.push(bit);
  }

  /* STRIKES. Owner playtest, 2026-08-19: "better impact effects on enemy
   * aircraft."
   *
   * A hit that does not kill used to be invisible: `damage()` moved the smoke
   * trail's opacity and nothing else happened on the airframe, so a burst that
   * connected looked exactly like a burst that missed and the player had no way
   * to learn whether he was leading correctly. Three cheap pieces, all built
   * now and all dark until something hits: a bright strike flash, a spray of
   * chips off the skin, and a puff of grey where the round went in.
   *
   * Own materials, never `unlit()`'s cache — a shared one would light up every
   * fighter in the wave at once, which is the trap the flame above documents. */
  const strikeMat = new THREE.MeshBasicMaterial({
    color: 0xfff4c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  });
  const strike = new THREE.Mesh(sphereGeo(0.85, 8, 6), strikeMat);
  strike.castShadow = false;
  g.add(strike);
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xffbe5a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  });
  const sparks = [];
  for (let i = 0; i < 5; i++) {
    const spark = new THREE.Mesh(boxGeo(0.14, 0.14, 0.9), sparkMat);
    spark.castShadow = false;
    spark.visible = false;
    g.add(spark);
    sparks.push(spark);
  }
  const chipMat = new THREE.MeshBasicMaterial({
    color: 0x9aa0a6, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false,
  });
  const chip = new THREE.Mesh(sphereGeo(1.2, 7, 5), chipMat);
  chip.castShadow = false;
  g.add(chip);

  return {
    group: g, exhaust, flashes, smoke, flame, flameMat, flameCore, flameCoreMat, debris,
    strike, strikeMat, sparks, sparkMat, chip, chipMat,
  };
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
    this.flameMesh = built.flame;
    this.flameMat = built.flameMat;
    this.flameCoreMat = built.flameCoreMat;
    this.debris = built.debris;
    /* Strike effects — see the block at the end of `makeFighter()`. `strikeT`
     * counts one impact down; everything is dark while it is zero. */
    this.strike = built.strike;
    this.strikeMat = built.strikeMat;
    this.sparks = built.sparks;
    this.sparkMat = built.sparkMat;
    this.chip = built.chip;
    this.chipMat = built.chipMat;
    this.strikeT = 0;
    root.add(this.group);

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    /** Where a wounded airframe runs to. Set once by `_wound()`. */
    this.home = new THREE.Vector3();
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
    /** Which attack pattern the director dealt this airframe. */
    this.profile = 'classic';
    /** Which wave it came up with — a crossing pair coordinates within one. */
    this.waveId = 0;
    /** Per-profile gunnery scaling — the harasser sprays short and rests long. */
    this.burstScale = 1;
    this.restScale = 1;
    /** Wounded: on fire and out of the fight. */
    this.wounded = false;
    /** The engine a priority attacker is working on, or -1. */
    this.targetEngine = -1;
    /** Crossing-pass bookkeeping: signed lateral offset from the track. */
    this.lastLat = null;
    this.crossed = false;
    /** How long a harasser has held its quarter. */
    this.holdT = 0;
    /** Seeded so two harassers never jink in step. */
    this.jinkPhase = seedRand() * Math.PI * 2;
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
   * @param {number} [opts.seed] the sim's rng seed — tests hand different
   *   seeds to prove a property is not one lucky roll.
   */
  constructor(scene, { getHeight = null, seed = 0x4E19 } = {}) {
    this.scene = scene;
    this.getHeight = getHeight;
    this.root = group('interceptors');
    scene.add(this.root);
    this.tracers = new TracerPool(this.root, 180);

    this.fighters = [];
    this.deployed = false;
    this.wave = 0;
    this._spawnT = 0;
    this._rand = rng(seed);
    this._pendingWave = 0;
    this._predictability = 0;

    /** The director's rota position — advances once per `deploy()`. */
    this.waveOrdinal = 0;
    /** What the director dealt the current wave, spawn order. For the HUD/tests. */
    this.waveProfiles = [];
    this._waveSpawnIndex = 0;
    this._crossingDealt = 0;

    /** The turret, as last reported by `setTurretStatus`. */
    this._turret = { manned: false, firing: false, jammed: false, heat: 0, rounds: 1, yaw: 0 };
    /** Seconds of exploitable lapse left in the turret's fire discipline. */
    this._turretLapse = 0;
    /** Per-side clocks of where the gunner has actually been looking. */
    this._coverPos = 0;
    this._coverNeg = 0;
    /** Engine damage flags, as last handed to `update()`. Never written here. */
    this._engineDamage = null;
    /** The bomber, as of the last update — `_wound()` needs it out of band. */
    this._lastTarget = new THREE.Vector3();
    this._lastVel = new THREE.Vector3();

    /** Raised by the mission; 0.6 is a gentle night, 1.4 is a bad one. */
    this.aggression = 1;

    this.kills = 0;
    this.hitsTaken = 0;
    this.roundsAtUs = 0;
    /** Wounded airframes that made it off the map. Threats removed, not kills. */
    this.escaped = 0;

    this.onCallout = null;     // (kind, fighter) => void
    this.onHit = null;         // (severity:number, fighter:Fighter) => void
    this.onNearMiss = null;    // () => void
    this.onKill = null;        // (fighter) => void
    this.onWounded = null;     // (fighter) => void — burning, breaking for home
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
   * What the tail turret is doing, fed once a frame by the mission.
   *
   * Two things are read out of it: a LAPSE — a jam, an overheat past 0.97, or
   * a dry belt opens a `LAPSE_WINDOW`-second window the harasser commits into
   * — and COVERAGE, per-side clocks of where the barrels have actually been
   * pointing while manned, which is what the priority profile reads to attack
   * the quarter the gunner watches least. The clocks decay on a ~45 s
   * horizon so "least used" means this fight, not the whole raid.
   *
   * @param {object} t { manned, firing, jammed, heat, rounds, yaw }
   */
  setTurretStatus({ manned = false, firing = false, jammed = false, heat = 0, rounds = 1, yaw = 0 } = {}) {
    const t = this._turret;
    t.manned = manned;
    t.firing = firing;
    t.jammed = jammed;
    t.heat = heat;
    t.rounds = rounds;
    t.yaw = yaw;
    if (manned && (jammed || rounds <= 0 || heat >= 0.97)) this._turretLapse = LAPSE_WINDOW;
  }

  /**
   * Put a wave up.
   *
   * @param {object} o
   * @param {THREE.Vector3} o.around where the bomber is now
   * @param {number} [o.count] how many
   * @param {number} [o.delay] seconds before the first one appears
   * @param {?string[]} [o.profiles] explicit attack profiles, spawn order.
   *   Omit it and the director deals from `WAVE_SCRIPTS` — which is what the
   *   mission does; explicit lists are for tests and the combat lab.
   */
  deploy({ around, count = 3, delay = 0, profiles = null }) {
    this.deployed = true;
    this._pendingWave = count;
    this._spawnT = delay;
    this._spawnAround = around.clone();
    const script = profiles || WAVE_SCRIPTS[this.waveOrdinal % WAVE_SCRIPTS.length];
    this.waveOrdinal++;
    this.waveProfiles = [];
    for (let i = 0; i < count; i++) this.waveProfiles.push(i < script.length ? script[i] : 'classic');
    this._waveSpawnIndex = 0;
    this._crossingDealt = 0;
  }

  _spawnOne(bomber) {
    const rand = this._rand;
    const colours = [0x3a4048, 0x44403a, 0x2e3a34, 0x4a3a3a];
    const f = new Fighter(this.root, colours[this.fighters.length % colours.length], rand);
    f.profile = this.waveProfiles[this._waveSpawnIndex] || 'classic';
    f.waveId = this.waveOrdinal;
    this._waveSpawnIndex++;
    if (f.profile === 'crossing') {
      // A crossing PAIR means opposite quarters, not a coin toss that can
      // deal both onto the same side.
      f.side = this._crossingDealt % 2 === 0 ? -1 : 1;
      this._crossingDealt++;
    } else if (f.profile === 'priority') {
      // The side the gunner has watched least. Yaw > 0 swings the barrels
      // toward the same lateral sense side = +1 perches on, so an over-worked
      // positive clock sends this one in on the other quarter.
      f.side = this._coverPos <= this._coverNeg ? 1 : -1;
    } else if (f.profile === 'harass') {
      f.burstScale = 0.4;
      f.restScale = 2.4;
    }
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
   * @param {?boolean[]} [target.engines] which engines are already dead
   *   (`Defense.damage.engines`) — the priority profile aims at a live one.
   */
  update(dt, { position, velocity, evasion = 0, engines = null } = {}) {
    if (!this.deployed || !position) return;
    this._engineDamage = engines;
    this._lastTarget.copy(position);
    if (velocity) this._lastVel.copy(velocity);

    /* The turret's discipline clocks. Coverage only accrues while a human is
     * actually holding the barrels off-centre; both sides decay on the same
     * horizon so the comparison stays about the recent fight. */
    if (this._turretLapse > 0) this._turretLapse -= dt;
    const t = this._turret;
    if (t.manned) {
      if (t.yaw > 0.15) this._coverPos += dt;
      else if (t.yaw < -0.15) this._coverNeg += dt;
    }
    const decay = Math.max(0, 1 - dt / 45);
    this._coverPos *= decay;
    this._coverNeg *= decay;

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
      this._updateStrike(dt, f);
      f.stateT += dt;
      const toUs = _w.subVectors(position, f.position);
      const range = toUs.length();
      // Angle off the nose from the raw dot product: normalising either vector
      // in place would corrupt it, and this runs once per fighter per frame.
      const norm = f.velocity.length() * range;
      const angleOff = range > 1 && norm > 0 ? Math.acos(clamp(f.velocity.dot(toUs) / norm, -1, 1)) : 0;

      switch (f.state) {
        case 'ingress': {
          const setup = this._setup(position, velocity, f);
          const turn = this._steer(dt, f, setup, 0.42, 132);
          f.orient(dt, turn);
          if (f.position.distanceTo(setup) < 340 || f.stateT > 26) {
            slots = this._commit(f, slots);
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
        case 'cross': {
          /* THE CROSSING LEG. Aim at a point past the far side of the track,
           * slightly ahead of the bomber, so the flight path slices across it
           * — the guns go while the geometry is inside the deflection cone,
           * and the pass is judged by the signed lateral offset flipping. */
          const fwd = velocity.lengthSq() > 1 ? _fwd.copy(velocity).normalize() : _fwd.set(0, 0, 1);
          _v.copy(position).addScaledVector(fwd, 180);
          _v.x += -fwd.z * -f.side * CROSS_LATERAL;
          _v.z += fwd.x * -f.side * CROSS_LATERAL;
          _v.y = position.y + 12;
          const turn = this._steer(dt, f, _v, 0.7, 168);
          f.orient(dt, turn);
          const lat = (f.position.x - position.x) * -fwd.z + (f.position.z - position.z) * fwd.x;
          if (f.lastLat !== null && !f.crossed && lat * f.lastLat < 0) f.crossed = true;
          f.lastLat = lat;
          if (!f.calledOut && range < 1500) {
            f.calledOut = true;
            this.onCallout?.('committing', f);
          }
          if (range < FIRE_RANGE && range > MIN_RANGE && angleOff < CROSS_CONE) {
            this._shoot(dt, f, position, velocity, range, evasion);
          } else {
            this._holdFire(f);
          }
          if (range < MIN_RANGE
            || (f.crossed && Math.abs(lat) > 420)
            || f.stateT > CROSS_WINDOW) {
            // Come back from the OTHER quarter — a scissors, not a circuit.
            f.side *= -1;
            this._enter(f, 'breakoff');
          }
          break;
        }
        case 'dive': {
          /* THE HIGH-SIDE DIVE. From the offstage perch, straight down through
           * the formation: the aim point bends UNDER the bomber as the range
           * closes, so the exit is always below — it does not level off into
           * a tail chase the turret would love. */
          this._lead(position, velocity, f, _leadPoint);
          _leadPoint.y -= 30 + smoothstep(420, 120, range) * 560;
          const turn = this._steer(dt, f, _leadPoint, 0.85, 198);
          f.orient(dt, turn);
          if (!f.calledOut && range < 1500) {
            f.calledOut = true;
            this.onCallout?.('committing', f);
          }
          if (range < FIRE_RANGE && range > MIN_RANGE && angleOff < FIRE_CONE * 1.6) {
            this._shoot(dt, f, position, velocity, range, evasion);
          } else {
            this._holdFire(f);
          }
          if (f.position.y < position.y - DIVE_EXIT_BELOW || f.stateT > 18) {
            this._enter(f, 'pullout');
          }
          break;
        }
        case 'pullout': {
          // Hard, low, and away under the tail — never back up into the arc.
          const fwd = velocity.lengthSq() > 1 ? _fwd.copy(velocity).normalize() : _fwd.set(0, 0, 1);
          _v.copy(position).addScaledVector(fwd, -520);
          _v.y = position.y - 420;
          _v.x += -fwd.z * f.side * 450;
          _v.z += fwd.x * f.side * 450;
          const turn = this._steer(dt, f, _v, 1.0, 178);
          f.orient(dt, turn);
          this._holdFire(f);
          if ((f.position.y < position.y - DIVE_EXIT_BELOW && f.stateT > 1.6) || f.stateT > 7) {
            f.engaged = false;
            f.passes++;
            f.cooldown = lerp(PASS_COOLDOWN[0], PASS_COOLDOWN[1], this._rand()) / clamp(this.aggression, 0.4, 2);
            this._enter(f, 'reposition');
          }
          break;
        }
        case 'harass': {
          /* THE NAG. Holds a quarter outside the leash, jinking on its own
           * seeded rhythm, sniping long bursts that are mostly noise — and
           * watching the turret. It commits the moment discipline lapses,
           * or when its patience finally runs out. */
          f.holdT += dt;
          const fwd = velocity.lengthSq() > 1 ? _fwd.copy(velocity).normalize() : _fwd.set(0, 0, 1);
          if (range < COMMIT_RANGE + 140) {
            // Drifted inside the leash: open the range before anything else.
            _v.copy(f.position).addScaledVector(toUs, -1);
          } else {
            _v.copy(position).addScaledVector(fwd, -880);
            _v.x += -fwd.z * f.side * 820;
            _v.z += fwd.x * f.side * 820;
            _v.y = position.y + f.high * 0.5;
            const j = f.stateT * 1.35 + f.jinkPhase;
            _v.x += Math.sin(j * 1.7) * 190;
            _v.y += Math.sin(j * 2.3) * 80;
            _v.z += Math.cos(j * 1.3) * 150;
          }
          const turn = this._steer(dt, f, _v, 0.6, 138);
          f.orient(dt, turn);
          if (range < HARASS_SNIPE_RANGE && range > COMMIT_RANGE && angleOff < HARASS_CONE) {
            this._shoot(dt, f, position, velocity, range, evasion);
          } else {
            this._holdFire(f);
          }
          if ((this._turretLapse > 0 || f.holdT > HARASS_PATIENCE) && slots > 0) {
            /* The gun is jammed, dry, or glowing — NOW it is an attacker,
             * and from here on it fights like one. */
            slots--;
            f.engaged = true;
            f.calledOut = false;
            f.profile = 'classic';
            f.burstScale = 1;
            f.restScale = 1;
            this._enter(f, 'pursuit');
          }
          break;
        }
        case 'breakoff': {
          if (f.profile === 'priority' || f.profile === 'highside') {
            // These two live below the arc; climbing across the tail would
            // hand the turret exactly the shot the profile exists to deny.
            _w.copy(velocity).normalize();
            _v.copy(position).addScaledVector(_w, -260);
            _v.x += -_w.z * f.side * 650;
            _v.z += _w.x * f.side * 650;
            _v.y = position.y - 380;
          } else {
            // Up and across the tail — which is exactly where the rear gun is.
            _w.copy(velocity).normalize();
            _v.copy(position).addScaledVector(_w, -420);
            _v.x += f.side * 700;
            _v.y = position.y + 320;
            _v.z += f.side * 300;
          }
          const turn = this._steer(dt, f, _v, 0.85, 160);
          f.orient(dt, turn);
          this._holdFire(f);
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
          const setup = this._setup(position, velocity, f);
          const turn = this._steer(dt, f, setup, 0.4, 138);
          f.orient(dt, turn);
          if (f.cooldown <= 0 && f.position.distanceTo(setup) < 700) {
            const before = slots;
            slots = this._commit(f, slots, true);
            if (slots < before) this.onCallout?.('again', f);
          }
          break;
        }
        case 'withdraw': {
          /* WOUNDED. On fire, out of the fight, running for home — a threat
           * the gunner removed without a kill. Still killable on the way out. */
          const turn = this._steer(dt, f, f.home, 0.55, 158);
          f.orient(dt, turn);
          this._holdFire(f);
          f.flameMat.opacity = 0.5 + Math.random() * 0.4;
          f.flameCoreMat.opacity = 0.4 + Math.random() * 0.3;
          f.flameMesh.scale.set(1, 0.9 + Math.random() * 0.5, 1);
          f.smokeMesh.material.opacity = 0.85;
          if (f.stateT > 30 || range > 4600) {
            this.escaped++;
            this.root.remove(f.group);
            const i = this.fighters.indexOf(f);
            if (i >= 0) this.fighters.splice(i, 1);
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
    if (state === 'attack' || state === 'cross' || state === 'dive' || state === 'harass') {
      f.burstT = 0;
      f.restT = 0.25 + this._rand() * 0.4;
    }
    if (state === 'cross') {
      f.lastLat = null;
      f.crossed = false;
    }
    if (state === 'attack' && f.profile === 'priority') {
      /* Pick the nacelle: a live engine, preferring the outboard pair on the
       * quarter this one is attacking from — the mission bills the hit to it
       * via the fighter handed back on `onHit`. */
      f.targetEngine = this._pickEngine(f);
    }
  }

  /**
   * A fighter has arrived where its profile sets up. What "committing" means
   * depends on the profile; the engagement-slot discipline does not.
   * @returns {number} the slots remaining after this one's decision
   */
  _commit(f, slots, fromReposition = false) {
    switch (f.profile) {
      case 'harass':
        // The harasser's commitment logic lives in its own state.
        this._enter(f, 'harass');
        if (!fromReposition) f.holdT = 0;
        return slots;
      case 'crossing': {
        /* A pair crosses TOGETHER — opposite quarters, one moment. Wait for
         * the wingman unless he is gone. */
        let partnerReady = true;
        for (const other of this.fighters) {
          if (other === f || !other.alive || other.waveId !== f.waveId) continue;
          if (other.profile !== 'crossing') continue;
          partnerReady = other.state === 'reposition' || other.state === 'ingress'
            ? other.position.distanceTo(this._setup(this._lastTarget, this._lastVel, other)) < 900
            : true;
        }
        if (slots > 0 && partnerReady) {
          slots--;
          f.engaged = true;
          f.calledOut = false;
          this._enter(f, 'cross');
        } else if (!fromReposition) {
          this._enter(f, 'reposition');
          f.cooldown = 0.5;
        }
        return slots;
      }
      case 'highside':
        if (slots > 0) {
          slots--;
          f.engaged = true;
          f.calledOut = false;
          this._enter(f, 'dive');
        } else if (!fromReposition) {
          this._enter(f, 'reposition');
        }
        return slots;
      default:
        // classic and priority both roll in through pursuit.
        if (slots > 0) {
          slots--;
          f.engaged = true;
          f.calledOut = false;
          /* The priority profile re-reads the coverage clocks on EVERY
           * commit: a gunner who has spent the last minute leaning one way
           * finds the next pass coming in on the other quarter. */
          if (f.profile === 'priority') f.side = this._coverPos <= this._coverNeg ? 1 : -1;
          this._enter(f, 'pursuit');
        } else if (!fromReposition) {
          this._enter(f, 'reposition');
        }
        return slots;
    }
  }

  /** A live engine for a priority attacker, or -1. Outboard first. */
  _pickEngine(f) {
    const engines = this._engineDamage;
    if (!engines || !engines.length) return -1;
    // Outboard pair on the attack side first, then whatever is left alive.
    const order = f.side > 0 ? [0, 1, 3, 2] : [3, 2, 0, 1];
    for (const i of order) {
      if (i < engines.length && !engines[i]) return i;
    }
    return -1;
  }

  /** Guns off outside the window — a burst does not survive losing the shot. */
  _holdFire(f) {
    f.burstT = Math.min(f.burstT, 0);
    for (const fl of f.flashes) fl.material.opacity = 0;
  }

  /**
   * Where a fighter wants to be before it rolls in — its profile's setup
   * point.
   *
   * Returned in module scratch: read it before the next `_setup` call and
   * never store it across frames.
   */
  _setup(position, velocity, f) {
    const fwd = velocity && velocity.lengthSq() > 1 ? _fwd.copy(velocity).normalize() : _fwd.set(0, 0, 1);
    switch (f.profile) {
      case 'crossing':
        // Abeam, wide, a shade ahead of the beam: the start of the slice.
        _perchPoint.copy(position).addScaledVector(fwd, 200);
        _perchPoint.x += -fwd.z * f.side * CROSS_LATERAL;
        _perchPoint.z += fwd.x * f.side * CROSS_LATERAL;
        _perchPoint.y += f.high * 0.6;
        return _perchPoint;
      case 'highside':
        // Offstage: high over the track, a little ahead, waiting to fall.
        _perchPoint.copy(position).addScaledVector(fwd, 500);
        _perchPoint.x += -fwd.z * f.side * 260;
        _perchPoint.z += fwd.x * f.side * 260;
        _perchPoint.y += HIGH_ABOVE;
        return _perchPoint;
      case 'harass':
        // The quarter it nags from.
        _perchPoint.copy(position).addScaledVector(fwd, -880);
        _perchPoint.x += -fwd.z * f.side * 820;
        _perchPoint.z += fwd.x * f.side * 820;
        _perchPoint.y += f.high * 0.5;
        return _perchPoint;
      case 'priority':
        /* The blind arc: ahead of the beam — the tail turret's traverse stops
         * ~58 degrees either side of dead astern — and BELOW its elevation
         * floor. The head-on run starts where the gun cannot go. */
        _perchPoint.copy(position).addScaledVector(fwd, 1500);
        _perchPoint.x += -fwd.z * f.side * 650;
        _perchPoint.z += fwd.x * f.side * 650;
        _perchPoint.y -= 160;
        return _perchPoint;
      default:
        // Behind, above and off to one side — the classic perch.
        _perchPoint.copy(position).addScaledVector(fwd, -1500);
        _perchPoint.x += -fwd.z * f.side * 900;
        _perchPoint.z += fwd.x * f.side * 900;
        _perchPoint.y += f.high;
        return _perchPoint;
    }
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
    const cur = _cur.copy(f.velocity).normalize();
    const angle = Math.acos(clamp(cur.dot(_v), -1, 1));
    const step = Math.min(angle, turnRate * dt);
    // Signed, about the world up axis, purely so the model banks the right way.
    const cross = cur.x * _v.z - cur.z * _v.x;
    if (angle > 1e-4) {
      const axis = _axis.crossVectors(cur, _v).normalize();
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
   *
   * `burstScale`/`restScale` are the profile's voice in it: the harasser
   * sprays short and rests long, so its nagging never outguns a real pass.
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
        f.restT = lerp(REST[0], REST[1], this._rand()) * f.restScale;
        for (const fl of f.flashes) fl.material.opacity = 0;
      }
      return;
    }
    f.restT -= dt;
    if (f.restT <= 0) {
      f.burstT = lerp(BURST[0], BURST[1], this._rand()) * clamp(this.aggression, 0.5, 1.6) * f.burstScale;
      f._roundT = 0;
    }
  }

  _round(f, position, velocity, range, evasion) {
    const rand = this._rand;
    // Base hit chance per ROUND, before anything degrades it.
    const base = 0.055 * clamp(this.aggression, 0.4, 1.8);
    const closeness = smoothstep(FIRE_RANGE, 220, range);          // nearer is better
    const spoiled = 1 - clamp(evasion, 0, 1) * 0.82;                // manoeuvring works
    const rails = 1 + this._predictability * 0.85;                  // autopilot is punished
    const chance = clamp(base * (0.35 + closeness) * spoiled * rails, 0, 0.4);
    const hit = rand() < chance;

    // The aim point: the lead point, plus a miss vector when it is a miss.
    const aim = _leadPoint.clone();
    if (!hit) {
      const spread = lerp(9, 46, clamp(range / FIRE_RANGE, 0, 1)) * (0.5 + rand() * 1.2);
      aim.add(new THREE.Vector3(
        (rand() - 0.5) * 2 * spread,
        (rand() - 0.5) * 2 * spread * 0.7,
        (rand() - 0.5) * 2 * spread,
      ));
    } else {
      aim.copy(position);
    }
    f.group.updateWorldMatrix(true, false);
    _muzzle.set((rand() < 0.5 ? -1.5 : 1.5), 0, 3.0).applyMatrix4(f.group.matrixWorld);
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
          this.onHit?.(clamp(0.4 + closeness * 0.6, 0, 1), f);
        } else if (aim.distanceTo(position) < 70) {
          this.onNearMiss?.();
        }
      },
    });
    void velocity;
  }

  /**
   * The rear gun got one.
   *
   * Past `WOUNDED_HEALTH` a survivor is WOUNDED: it lights up, quits the
   * fight and runs for home — see `_wound()`. That is a threat removed
   * without a kill, which is most of what suppressive turret fire is for.
   *
   * @param {Fighter} f
   * @param {number} [amount] hits' worth of damage
   * @returns {'hit'|'killed'|'nothing'}
   */
  damage(f, amount = 1) {
    if (!f || !f.alive) return 'nothing';
    f.health -= amount;
    f.smokeMesh.material.opacity = clamp((FIGHTER_HEALTH - f.health) / FIGHTER_HEALTH, 0, 1) * 0.7;
    this._strike(f);
    if (f.health > 0) {
      if (f.health <= WOUNDED_HEALTH && f.state !== 'withdraw') this._wound(f);
      return 'hit';
    }
    f.state = 'dead';
    f.engaged = false;
    f.stateT = 0;
    // The breakup: shed pieces from the airframe's own debris store.
    for (const bit of f.debris) {
      bit.visible = true;
      bit.position.set(0, 0, 0);
      bit.material.opacity = 1;
    }
    f.flameMat.opacity = 1;
    f.flameCoreMat.opacity = 0.9;
    this.kills++;
    this.onKill?.(f);
    return 'killed';
  }

  /**
   * A round went in. Put it somewhere on the airframe and light it.
   *
   * Placed at a random point on the fighter's own skin rather than at its
   * origin, so a burst walks across it instead of strobing one spot, and the
   * chips are thrown along the airframe's own axes so they read as coming OFF
   * it. `STRIKE_SECONDS` is short: this is an impact, not a fire.
   */
  _strike(f) {
    const where = _strikeAt.set(
      (f.rand() - 0.5) * 4.6,
      (f.rand() - 0.5) * 1.1,
      (f.rand() - 0.5) * 5.4,
    );
    f.strike.position.copy(where);
    f.chip.position.copy(where);
    for (const [i, spark] of f.sparks.entries()) {
      spark.visible = true;
      spark.position.copy(where);
      spark.rotation.set(f.rand() * 3, f.rand() * 3, i * 1.2);
      spark.scale.setScalar(0.7 + f.rand() * 0.8);
    }
    f.strikeT = STRIKE_SECONDS;
  }

  /** One frame of a strike fading off an airframe that survived it. */
  _updateStrike(dt, f) {
    if (f.strikeT <= 0) return;
    f.strikeT = Math.max(0, f.strikeT - dt);
    const k = f.strikeT / STRIKE_SECONDS;
    f.strikeMat.opacity = k * k;
    f.strike.scale.setScalar(0.4 + (1 - k) * 1.6);
    f.sparkMat.opacity = k * 0.9;
    for (const spark of f.sparks) {
      spark.position.addScaledVector(_sparkVel.set(
        Math.sin(spark.rotation.z) * 6,
        2.4,
        Math.cos(spark.rotation.z) * 6,
      ), dt);
      if (f.strikeT <= 0) spark.visible = false;
    }
    f.chipMat.opacity = k * 0.5;
    f.chip.scale.setScalar(0.5 + (1 - k) * 2.4);
  }

  /** Hurt past the threshold: on fire, out of the fight, breaking for home. */
  _wound(f) {
    f.wounded = true;
    f.engaged = false;
    f.calledOut = false;
    f.targetEngine = -1;
    f.flameMat.opacity = 0.7;
    f.flameCoreMat.opacity = 0.5;
    // Home is straight away from the bomber, held level-ish and flat.
    f.home.copy(f.position).sub(this._lastTarget);
    f.home.y = 0;
    if (f.home.lengthSq() < 1) f.home.set(1, 0, 0);
    f.home.normalize().multiplyScalar(6000).add(f.position);
    f.home.y = Math.max(f.position.y - 260, 320);
    f.state = 'withdraw';
    f.stateT = 0;
    this._holdFire(f);
    this.onWounded?.(f);
  }

  /**
   * Rolling over, burning, shedding pieces, going in — the whole point of a
   * flying enemy in this game is that killing one looks WORTH IT. The flame
   * is a blowtorch off the cowl, the debris store built with the airframe is
   * thrown outward on fixed arcs, and the spin tightens all the way down.
   */
  _updateDying(dt, f) {
    f.stateT += dt;
    f.velocity.y -= 11 * dt;
    f.velocity.multiplyScalar(1 - 0.06 * dt);
    f.position.addScaledVector(f.velocity, dt);
    f.group.position.copy(f.position);
    // The spin tightens as it goes — a stall becoming a spiral.
    f.group.rotateZ(dt * (3.2 + Math.min(f.stateT, 6) * 0.5));
    f.group.rotateX(dt * 0.8);
    f.smokeMesh.material.opacity = 0.9;
    f.flameMat.opacity = 0.65 + Math.random() * 0.35;
    f.flameCoreMat.opacity = 0.5 + Math.random() * 0.4;
    f.flameMesh.scale.set(1 + Math.random() * 0.3, 1 + Math.random() * 0.6, 1 + Math.random() * 0.3);
    // Pieces off: outward on their fixed arcs, tumbling, fading as they go.
    const shed = clamp(1 - f.stateT / 2.4, 0, 1);
    for (let i = 0; i < f.debris.length; i++) {
      const bit = f.debris[i];
      bit.visible = shed > 0.01;
      if (!bit.visible) continue;
      const d = DEBRIS_DIRS[i];
      bit.position.addScaledVector(d, dt * (18 + i * 4));
      bit.position.y -= f.stateT * f.stateT * 1.1 * dt * 8;
      bit.rotation.x += dt * (3 + i);
      bit.rotation.z += dt * (2 + i * 0.7);
      bit.material.opacity = shed;
    }
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
