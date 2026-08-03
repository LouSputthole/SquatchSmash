/**
 * MissionController — The Enola Squatch, start to finish.
 *
 * Modeled on `src/beefrun/mission.js`'s `MissionController`: a single state
 * machine with a string `phase`, `setPhase(name)` dispatching to
 * `onEnterPhase(name)` then a per-phase `updateX(dt)` every frame,
 * checkpoint save/restore, and a `gradeLanding`-shaped scoring idiom (see
 * `gradeLanding()` below, which is the identical formula reimplemented —
 * Beef Run's version is a method entangled with that class's own `this`,
 * not a standalone export, so per the phase brief this reimplements the
 * exact math rather than inventing a different one).
 *
 * Explicitly NOT built here (a later composition-root phase's job, same as
 * the brief asked): the render loop, main.js/HTML wiring, or any on-foot
 * walkaround/boarding system. `preflight` therefore plays out entirely
 * inside the cockpit — battery, fuel selectors, four engines, brakes off —
 * the same shape as Beef Run's own `startup` phase, just carrying the
 * banter beats on phase-time thresholds instead of a walkaround checklist
 * (there is no `Preflight` class for this mission; nothing in the brief's
 * three deliverables asked for one).
 *
 * `ctx` (constructor argument), all required unless marked optional:
 *   scene, camera (optional, used only if a caller wants nav projection),
 *   physics (AircraftPhysics, built with `ac: AC_ENOLA` and a 4-engine
 *     `engines`), engines (EngineSystem, built with `engineNames: ['one',
 *     'two','three','four']`), aircraft (EnolaSquatch), payload (FatSquatch),
 *   weather (WeatherSystem), detection (DetectionSystem — see the
 *     constructor note on its `towers` option), airfield (the object
 *     `buildAirfield()` returns — reused unmodified, same Whispering Pines),
 *   flightHud (FlightHud, optional — calls are all guarded), hud (optional,
 *     needs only `.say(html, ms)`, used for `fail()`), dialogue
 *     (`./DialogueSystem.js`'s `DialogueSystem`), input (needs `.throttle`),
 *   audio (optional, `.play/.setPhase/.setHeadset/.sting` — all optional-
 *     chained), cameras (optional, `.addShake`), defense (optional Defense
 *     instance — one is created if omitted), targeting (optional Targeting
 *     instance — one is created if omitted), getHeight (optional
 *     `(x,z)=>number` ground sampler — see `approxGroundHeight()` below for
 *     the provisional default and why it is provisional), story (optional
 *     campaign-save hook, same shape as Beef Run's, all optional-chained).
 *
 * Dialogue/detection are ticked by the composition root, not here — same as
 * Beef Run: `dialogue.update(dt)` and `detection`'s own patrol upkeep for
 * non-active patrols are never called from inside `src/beefrun/mission.js`
 * either (confirmed by reading it for this phase). This file calls
 * `detection.update(dt, {...})` because Beef Run's own `MissionController`
 * does too — that one call *is* how attention accumulates — but the frame
 * loop is still responsible for `physics.advance(dt)`, `engines.update(dt,
 * airspeed)`, `dialogue.update(dt)`, and rendering.
 */
import * as THREE from 'three';
import {
  AC_ENOLA, enolaMass, TURN_POINT, ZONES_EAST, LANDMARKS_EAST, TARGET_X, CHECKPOINTS,
} from '../config.js';
import { OBJECTIVES, RELEASE_LINES } from '../dialogue/script.js';
import { Defense } from '../combat/Defense.js';
import { Targeting } from '../combat/Targeting.js';
import { WP, KT, FT } from '../../beefrun/config.js';
import { evaluateLineupGate } from '../../beefrun/lineup-gate.js';
import {
  clamp, lerp, headingDelta,
  solid, unlit, mat, boxGeo, sphereGeo, planeGeo, mesh, flatMesh, group,
} from '../../beefrun/util.js';

const CORRIDOR = LANDMARKS_EAST.find((l) => l.id === 'corridor');
const TOWN = LANDMARKS_EAST.find((l) => l.id === 'town');
const CLOUDBANK = LANDMARKS_EAST.find((l) => l.id === 'cloudbank');
const COMPOUND = LANDMARKS_EAST.find((l) => l.id === 'compound');
const RETURN_HEADING = (TURN_POINT.newHeading + 180) % 360;   // 270 — back the way we came

/**
 * A flat, provisional ground height for anywhere east of the turn point.
 *
 * `src/beefrun/terrain.js`'s `terrainHeight` bands its noise by `z` only,
 * against Beef Run's own southbound `ZONES` — it has no idea `ZONES_EAST`
 * exists, and calling it for `x` out here (up to 9000) would silently return
 * Beef Run's daylight forest-mountain elevation for whatever `z` happens to
 * land in, not this mission's night desert route. Building the eastbound
 * terrain (streaming, the landing-pad carve at `TARGET_X` the safety note in
 * `../config.js` calls out) is explicitly a later phase's job, not one of
 * this phase's three deliverables. This is a deliberately dumb stand-in —
 * each `ZONES_EAST` band's own flat `base` elevation, banded by `x` the same
 * way `ZONES_EAST`'s comment says the real terrain module should band it —
 * good enough to sit props on and to give `Targeting`/`Defense` a ground
 * reference, not good enough to fly an approach against.
 */
export function approxGroundHeight(x) {
  for (let i = 0; i < ZONES_EAST.length; i++) if (x < ZONES_EAST[i].to) return ZONES_EAST[i].base;
  return ZONES_EAST[ZONES_EAST.length - 1].base;
}

/* ------------------------------------------------------------------ */
/* Small, self-contained explosion VFX — see `_buildExplosionVfx()`.    */
/* ------------------------------------------------------------------ */

function sasquatchSilhouetteTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#1a1420';
  // Head, brow, ears — a silhouette, not a portrait; it only needs to read
  // as "a Sasquatch" for the one beat it is on screen at peak size.
  ctx.beginPath();
  ctx.ellipse(128, 150, 92, 100, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(128, 96, 84, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const ex of [-70, 70]) {
    ctx.beginPath();
    ctx.ellipse(128 + ex, 128, 22, 30, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MissionController {
  constructor(ctx) {
    Object.assign(this, ctx);
    /* See the class header for the full expected shape of `ctx`. */

    this.defense = this.defense || new Defense(this.scene, {
      getHeight: (x, z) => (this.getHeight ? this.getHeight(x, z) : approxGroundHeight(x)),
    });
    this.targeting = this.targeting || new Targeting({ target: COMPOUND, corridorHeading: TURN_POINT.newHeading });

    this.phase = 'idle';
    this.phaseTime = 0;
    this.missionTime = 0;
    this.objective = '';
    this.failed = null;
    this.finished = false;
    this.paused = false;
    this.payloadReleased = false;
    this.bombBayOpen = false;

    this.checkpoint = null;
    this.checkpointData = null;

    this.score = {
      takeoff: null,
      finalLanding: null,
      patrolPeak: 0,
      lowestClearance: Infinity,
      flightTime: 0,
      fuelRemaining: 1,
      damage: 0,
      bombAccuracy: null,      // 0..1, set on impact
      expressShipping: false,  // the achievement condition
      corridorScore: 0,
      roughAir: 0,
    };

    this.flags = {
      enginesEverStarted: false,
      rotateCalled: false,
      turnCalled: false,
      navOffCourse: false,
    };

    this._touchdowns = [];
    this._navCallTimer = 2;
    this._smoothPraised = false;
    this._t = 0;

    this.physics.onTouchdown = (vs, g, wheel) => this.onTouchdown(vs, g, wheel);
    this.physics.onImpact = (sev, what) => this.onImpact(sev, what);
    this.engines.onEvent = (name, i) => this.onEngineEvent(name, i);
    // Deliberately not wiring `onRadio` too: `detection.js`'s `update()`
    // calls both `onState` and `onRadio` on the very same transition (e.g.
    // entering 'searching' fires `onState('searching', prev)` AND, on its
    // own separate cooldown, `onRadio('caib.sweep')`) — wiring both to this
    // mission's dialogue would queue `detect.searching` twice back to back.
    // `onState` alone is the edge-triggered signal this mission's beats want.
    this.detection.onState = (state) => this.onDetectionState(state);

    this.defense.onOpen = () => this.dialogue.play('defense.opening', { once: true });
    this.defense.onHit = (kind, detail) => this.onDefenseHit(kind, detail);
    // "You've been caught" — a lit-up aeroplane draws better-aimed fire for a
    // few seconds, then the guns go back to guessing once the beam loses it.
    // Visual-only otherwise; the HUD's own 'located' warning (shared with
    // DetectionSystem) is set every frame in `updateFlightCommon()`.
    this.defense.onCaught = (caught) => {
      this.defense.intensity = caught ? 1.5 : 1;
      if (caught) this.cameras?.addShake?.(0.15);
    };
    this.defense.onCatastrophic = (reason) => this.fail(`Catastrophic damage — ${reason}.`);
    this.defense.onSuppressed = () => this.dialogue.play('defense.suppressed', { once: true });

    this.payload.onImpact = (point) => this.onPayloadImpact(point);
  }

  /* ---------------------------------------------------------------- */
  /* Setup                                                             */
  /* ---------------------------------------------------------------- */

  begin() {
    const park = this.airfield.anchors.parking;
    this.physics.setPose(new THREE.Vector3(park.x, park.y + AC_ENOLA.gearY, park.z), this.airfield.anchors.parkingHeading, 0);
    this.physics.controls.parkingBrake = true;
    this.physics.mass = enolaMass(this.engines.fuel, false);
    this.aircraft.syncTo(this.physics);

    this.weather.setConditions({ turbulence: 0.2, crosswind: 0.3, rain: 0, cloudDensity: 0.3, dusk: 0.55, night: 0.15, lightning: 0 });
    this.audio?.setPhase?.('airport');
    this.setPhase('preflight');
  }

  setPhase(name) {
    this.phase = name;
    this.phaseTime = 0;
    this.onEnterPhase(name);
  }

  setObjective(text) {
    this.objective = text;
    this.flightHud?.setObjective?.(text);
  }

  /* ---------------------------------------------------------------- */
  /* Phase entry                                                       */
  /* ---------------------------------------------------------------- */

  onEnterPhase(name) {
    switch (name) {
      case 'preflight':
        this.setObjective(OBJECTIVES.PREFLIGHT);
        this.flightHud?.show?.(true);
        this.audio?.setHeadset?.(true);
        this.dialogue.setHeadset(true);
        break;

      case 'taxi':
        this.setObjective(OBJECTIVES.TAXI);
        this.dialogue.play('taxi.line', { once: true, delay: 0.6 });
        break;

      case 'takeoff':
        this.setObjective(OBJECTIVES.TAKEOFF);
        this.saveCheckpoint('takeoff');
        this.audio?.setPhase?.('takeoff');
        break;

      case 'climbTurn':
        this.setObjective(OBJECTIVES.CLIMB_TURN);
        this.flags.turnCalled = false;
        this._onCourseT = 0;
        break;

      case 'cruise':
        this.setObjective(OBJECTIVES.CRUISE);
        this.dialogue.play('cruise.settle', { once: true, delay: 1 });
        this.weather.setConditions({ dusk: 1, night: 1, cloudDensity: 0.5, turbulence: 0.4, lightning: 0 });
        this.saveCheckpoint('turnOnCourse');
        this._navCallTimer = 4;
        break;

      case 'detection': {
        this.setObjective(OBJECTIVES.DETECTION);
        this.dialogue.play('detect.corridor', { once: true, delay: 0.4 });
        // See the class header / final report on `DetectionSystem.deploy()`'s
        // hardcoded lane x-offsets — they were tuned for Beef Run's near-x=0
        // route and do not land near this mission's x~2600..9000 corridor.
        // Reused unmodified regardless (not in this phase's edit list); the
        // meaningful signal out here is the exposure/tower terms, which read
        // this mission's own `towers` (constructor-time, not deploy-time).
        this.detection.deploy(CORRIDOR.z);
        this.weather.setConditions({ cloudDensity: 0.6 });
        break;
      }

      case 'defense': {
        this.setObjective(OBJECTIVES.DEFENSE);
        // The corridor stealth-meter's job (evading the patrol/radar
        // DetectionSystem) is over by the time the compound's own Defense
        // opens fire — leaving `detection.active` true here would leave
        // `updateFlightCommon()`'s 'patrol'/'located' HUD warnings frozen at
        // whatever `detection.state` last was, since nothing calls
        // `detection.update()` again after this point.
        this.detection.active = false;
        this.defense.deploy({ x: TARGET_X, z: COMPOUND.z }, { groundY: approxGroundHeight(TARGET_X), radius: 460 });
        this.defense.intensity = 1;
        this.dialogue.play('defense.gunner.on', { once: true, delay: 2.2 });
        break;
      }

      case 'bombApproach':
        this.setObjective(OBJECTIVES.BOMB_APPROACH);
        this.targeting.reset();
        this.saveCheckpoint('preRelease');
        this.bombBayOpen = false;
        this._sawTargetInSight = false;
        this._saidTenSeconds = false;
        this._saidSteady = false;
        break;

      case 'bombMalfunction':
        this.setObjective(OBJECTIVES.BOMB_MALFUNCTION);
        this.dialogue.play('bomb.doorsFail', { urgent: true });
        this._malfHoldT = 0;
        this._malfNeeded = 8;
        this._shubesFired = false;
        this._resetPlayed = false;
        break;

      case 'release':
        this.setObjective(OBJECTIVES.BOMB_RELEASE);
        this._releaseStep = 'awaitChoice';
        this.bombBayOpen = true;
        this.dialogue.play('bomb.doorsFixed', { once: true });
        break;

      case 'explosion':
        this.setObjective('');
        this._explosionVfx = null;
        this._explosionT = 0;
        break;

      case 'escape':
        this.setObjective(OBJECTIVES.ESCAPE);
        this.dialogue.play('escape.turn', { once: true, delay: 0.5 });
        this.weather.setConditions({ turbulence: 0.95, lightning: 0.3 });
        this.bombBayOpen = false;
        this._escapeT = 0;
        this._emergencyDecided = false;
        break;

      case 'emergency': {
        this.setObjective('Handle the engine — your call');
        this.dialogue.play('emergency.overheat', { urgent: true });
        this.engines.scriptOverheat(this._emergencyEngineIndex, 70);
        this._emergencyResolved = false;
        this._emergencyPushFailAt = null;
        break;
      }

      case 'return':
        this.setObjective(OBJECTIVES.RETURN);
        this.saveCheckpoint('return');
        this.detection.active = false;
        this.weather.setConditions({ turbulence: 0.5, lightning: 0.1, cloudDensity: 0.5 });
        this._navCallTimer = 4;
        break;

      case 'landing':
        this.setObjective(OBJECTIVES.LANDING);
        this.dialogue.play('landing.line', { once: true, delay: 0.6 });
        this.weather.setConditions({ night: 0.7, dusk: 0.85 });
        break;

      case 'epilogue':
        this.dialogue.play('arrival.lou', { delay: 1.0 });
        this._epilogueT = 0;
        break;

      default:
        break;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Per-frame                                                         */
  /* ---------------------------------------------------------------- */

  update(dt) {
    if (this.paused || this.finished) return;
    this.phaseTime += dt;
    this.missionTime += dt;
    this._t += dt;

    const p = this.physics;

    // Mass bookkeeping: no CargoWeightSystem for a single fixed payload (see
    // `enolaMass()`'s own doc comment in ../config.js) — this is the one
    // obvious place that calls it every frame once there is any point in
    // the aeroplane's mass mattering.
    if (this.flags.enginesEverStarted) {
      p.mass = enolaMass(this.engines.fuel, this.payloadReleased);
    }
    this.score.fuelRemaining = clamp(this.engines.fuel / AC_ENOLA.fuelMass, 0, 1);
    if (!p.onGround && p.tas > 20) {
      this.score.lowestClearance = Math.min(this.score.lowestClearance, p.agl);
    }
    if (this.flags.enginesEverStarted) this.score.flightTime += dt;

    // The payload keeps falling regardless of which phase is nominally
    // active — it is released once, from `release`, and ticks until impact
    // (which drives the `explosion` phase's own content via the hook set in
    // the constructor).
    if (this.payload.released && !this.payload.impacted) {
      this.payload.update(dt, this.getHeight || ((x) => approxGroundHeight(x)));
    }

    switch (this.phase) {
      case 'preflight': this.updatePreflight(dt); break;
      case 'taxi': this.updateTaxi(dt); break;
      case 'takeoff': this.updateTakeoff(dt); break;
      case 'climbTurn': this.updateClimbTurn(dt); break;
      case 'cruise': this.updateCruise(dt); break;
      case 'detection': this.updateDetectionPhase(dt); break;
      case 'defense': this.updateDefensePhase(dt); break;
      case 'bombApproach': this.updateBombApproach(dt); break;
      case 'bombMalfunction': this.updateBombMalfunction(dt); break;
      case 'release': this.updateRelease(dt); break;
      case 'explosion': this.updateExplosion(dt); break;
      case 'escape': this.updateEscape(dt); break;
      case 'emergency': this.updateEmergency(dt); break;
      case 'return': this.updateReturn(dt); break;
      case 'landing': this.updateLanding(dt); break;
      case 'epilogue': this.updateEpilogue(dt); break;
      default: break;
    }

    if (this.flags.enginesEverStarted && !['preflight', 'epilogue'].includes(this.phase)) {
      this.updateFlightCommon(dt);
    }
  }

  /* ---- Preflight / taxi / takeoff ---- */

  updatePreflight(dt) {
    void dt;
    const e = this.engines;
    const p = this.physics;
    // Banter on phase-time thresholds — there is no on-foot walkaround for
    // this mission (see the class header), so these fire as a scripted
    // sequence rather than off proximity to anything.
    if (this.phaseTime > 1.0) this.dialogue.play('preflight.numbskull', { once: true });
    if (this.phaseTime > 5.0) this.dialogue.play('preflight.restraints', { once: true });
    if (this.phaseTime > 9.5) this.dialogue.play('preflight.bombbay', { once: true });
    if (this.phaseTime > 14.5) this.dialogue.play('preflight.shubes.first', { once: true });
    if (this.phaseTime > 20 && !this.dialogue.busy) this.dialogue.play('preflight.engineStart', { once: true });

    if (!e.masterBattery) { this.setObjective(`${OBJECTIVES.PREFLIGHT} — battery on`); return; }
    if (!e.fuelSelectors) { this.setObjective(`${OBJECTIVES.PREFLIGHT} — fuel selectors on`); return; }
    if (this.input.throttle < 0.08) { this.setObjective(`${OBJECTIVES.PREFLIGHT} — crack all four throttles`); return; }
    for (let i = 0; i < e.engines.length; i++) {
      if (!e.engines[i].running) { this.setObjective(`${OBJECTIVES.PREFLIGHT} — start engine ${i + 1}`); return; }
    }
    if (p.controls.parkingBrake) { this.setObjective(`${OBJECTIVES.PREFLIGHT} — release the parking brake`); return; }
    this.flags.enginesEverStarted = true;
    this.setPhase('taxi');
  }

  updateTaxi(dt) {
    void dt;
    const p = this.physics;
    const target = this.airfield.anchors.lineUp;
    const distance = Math.hypot(p.position.x - target.x, p.position.z - target.z);
    const headingError = Math.abs(headingDelta(p.headingDeg, this.airfield.anchors.departHeading));
    const gate = evaluateLineupGate({
      distance, headingError, groundSpeed: p.groundSpeed, onGround: p.onGround, agl: p.agl, airspeedKnots: p.ias * KT,
    });
    this.setObjective(`${OBJECTIVES.TAXI} (${Math.ceil(distance)} m)`);
    if (gate.ready) this.setPhase('takeoff');
  }

  updateTakeoff(dt) {
    void dt;
    const p = this.physics;
    if (!this.flags.rotateCalled && p.ias * KT > 62 && p.onGround) {
      this.flags.rotateCalled = true;
      this.dialogue.play('takeoff.rotate', { urgent: true });
    }
    if (!p.onGround && p.agl > 15) {
      this.gradeTakeoff();
      this.dialogue.play('takeoff.airborne', { once: true, delay: 1 });
      this.setPhase('climbTurn');
    }
    if (p.onGround && p.position.z < WP.z - WP.rwyHalf + 20 && p.groundSpeed > 4) {
      this.restoreCheckpoint('takeoff', { soft: true });
    }
  }

  /* ---- Climb / turn / cruise ---- */

  updateClimbTurn(dt) {
    void dt;
    const p = this.physics;
    const pastPoint = p.position.z <= TURN_POINT.z && p.agl > TURN_POINT.minAltitudeAgl;
    if (!this.flags.turnCalled && pastPoint) {
      this.flags.turnCalled = true;
      this.dialogue.play('climb.turn.east', { once: true });
    }
    if (this.flags.turnCalled) {
      const err = Math.abs(headingDelta(p.headingDeg, TURN_POINT.newHeading));
      this._onCourseT = err < 8 ? this._onCourseT + dt : 0;
      if (this._onCourseT > 2.5) this.setPhase('cruise');
    }
  }

  /** Shared by `cruise` and `return` — Irish's heading corrections. */
  updateNavCorrection(dt, desiredHeading) {
    const p = this.physics;
    this._navCallTimer -= dt;
    if (this._navCallTimer > 0 || this.dialogue.busy || p.onGround) return;
    const err = headingDelta(p.headingDeg, desiredHeading);
    let id = null;
    if (Math.abs(err) > 95) id = 'nav.wrongWay';
    else if (err > 6) id = 'nav.right5';
    else if (err < -6) id = 'nav.left5';
    else if (this.flags.navOffCourse) id = 'nav.goodLine';
    if (id) {
      this.dialogue.play(id);
      this._navCallTimer = id === 'nav.goodLine' ? 7 : 5;
      this.flags.navOffCourse = id !== 'nav.goodLine';
    }
  }

  updateCruise(dt) {
    const p = this.physics;
    this.updateNavCorrection(dt, TURN_POINT.newHeading);
    if (!p.onGround) {
      if (Math.abs(p.rollDeg) > 26) this.dialogue.bark('heavyBanked');
      if (p.vspeed > 0.5 && p.pitchDeg > 5 && p.ias * KT < 95) this.dialogue.bark('heavySlow');
      if (!this._smoothPraised && Math.abs(p.rollDeg) < 6 && Math.abs(p.gLoad - 1) < 0.12 && this.phaseTime > 8) {
        if (this.dialogue.bark('heavySmooth')) this._smoothPraised = true;
      }
    }
    if (p.position.x > CORRIDOR.x - 400) this.setPhase('detection');
  }

  /* ---- Detection corridor ---- */

  updateDetectionPhase(dt) {
    const p = this.physics;
    this.detection.update(dt, {
      position: p.position,
      velocity: p.velocity,
      inCloud: this.weather.inCloud(p.position),
      stable: Math.abs(p.rollDeg) < 45 && p.stallT < 0.2,
    });
    this.score.patrolPeak = Math.max(this.score.patrolPeak, this.detection.attention);
    this.flightHud?.setPatrol?.(this.detection.state, this.detection.attention);
    if (p.position.x > ZONES_EAST.find((z) => z.id === 'corridor').to) {
      this.dialogue.play('detect.clear', { once: true });
      this.setPhase('defense');
    }
  }

  onDetectionState(state) {
    if (state === 'searching') this.dialogue.play('detect.searching', { once: false });
    else if (state === 'located') this.dialogue.play('detect.located', { once: false });
  }

  /* ---- Defense ---- */

  updateDefensePhase(dt) {
    const p = this.physics;
    this.defense.update(dt, { position: p.position, velocity: p.velocity });
    if (this.defense.caught) this.flightHud?.setPatrol?.('located', 1);
    // Rare, mission-scripted safety valve — see the class header and
    // `Defense.js`'s own doc comment: nothing in Defense itself ever calls
    // `triggerCatastrophic`. Deliberately a high, explicit threshold rather
    // than a per-frame chance, so it stays a genuinely unlikely outcome.
    const enginesDown = this.defense.damage.engines.filter(Boolean).length;
    if (!this.defense.damage.catastrophic && this.defense.hitCount >= 6 && enginesDown >= 3) {
      this.defense.triggerCatastrophic('overwhelmed');
    }
    if (p.position.x > TARGET_X - 1400) {
      this.defense.suppress();
      this.setPhase('bombApproach');
    }
  }

  onDefenseHit(kind, detail) {
    if (kind === 'engine') {
      this.engines.damage(detail, 0.35, 0.25);
      if (!this.dialogue.seen('defense.hit')) this.dialogue.play('defense.hit', { once: true });
    } else if (kind === 'electrical') {
      this.aircraft.instruments?.failInstrument?.(['tach', 'temp', 'fuel', 'oil'][Math.floor(Math.random() * 4)]);
      if (!this.dialogue.seen('defense.hit')) this.dialogue.play('defense.hit', { once: true });
    } else if (kind === 'rudder' || kind === 'fuel') {
      if (!this.dialogue.seen('defense.hit')) this.dialogue.play('defense.hit', { once: true });
    }
    this.cameras?.addShake?.(kind === 'engine' ? 0.5 : 0.25);
  }

  /* ---- Bomb approach / targeting ---- */

  updateBombApproach(dt) {
    const p = this.physics;
    this.targeting.update(dt, p, true);
    this.score.corridorScore = this.targeting.corridorScore;

    if (!this._sawTargetInSight && this.targeting.distance < 3200) {
      this._sawTargetInSight = true;
      this.dialogue.play('bomb.targetInSight', { once: true });
    }
    const eta = p.tas > 5 ? this.targeting.distance / p.tas : Infinity;
    if (!this._saidTenSeconds && eta < 10 && eta > 0) {
      this._saidTenSeconds = true;
      this.dialogue.play('bomb.tenSeconds', { once: true });
    }
    if (!this._saidSteady && this.targeting.onHeading && this.targeting.onAltitude) {
      this._saidSteady = true;
      this.dialogue.play('bomb.steady', { once: true });
    }
    this.flightHud?.setObjective?.(this.targeting.readyToRelease
      ? `${OBJECTIVES.BOMB_APPROACH} — steady`
      : OBJECTIVES.BOMB_APPROACH);

    if (this.targeting.readyToRelease || this.targeting.distance < 700) {
      this.setPhase('bombMalfunction');
    }
  }

  /* ---- Bomb-bay malfunction ---- */

  updateBombMalfunction(dt) {
    const p = this.physics;
    if (!this._resetPlayed && this.phaseTime > 1.0) {
      this._resetPlayed = true;
      this.dialogue.play('bomb.manualReset', { once: true, delay: 0.4 });
    }
    const level = Math.abs(p.rollDeg) < 12 && Math.abs(p.pitchDeg) < 10;
    this._malfHoldT = level ? this._malfHoldT + dt : Math.max(0, this._malfHoldT - dt * 0.5);
    if (!this._shubesFired && this._malfHoldT > this._malfNeeded * 0.5) {
      this._shubesFired = true;
      this.dialogue.play('bomb.shubesInBay', { once: true });
    }
    this.setObjective(`${OBJECTIVES.BOMB_MALFUNCTION} — ${Math.max(0, this._malfNeeded - this._malfHoldT).toFixed(1)}s`);
    if (this._malfHoldT >= this._malfNeeded) this.setPhase('release');
  }

  /* ---- Release ---- */

  /** Called by the (not-yet-built) UI once the player picks a RELEASE_LINES key. */
  chooseReleaseLine(key) {
    if (this.phase !== 'release' || this._releaseStep !== 'awaitChoice') return false;
    const line = RELEASE_LINES.find((l) => l.key === key) || RELEASE_LINES[0];
    this._releaseStep = 'stuck';
    if (!line.silent) {
      // A genuine 1-5 pick, not a BEATS entry (see script.js's own comment on
      // RELEASE_LINES) — queued directly in the same `{who, text, hold, cue}`
      // shape `DialogueSystem.play()` produces, so it plays identically.
      this.dialogue.queue.push({
        who: 'PROSPECT', text: line.text, hold: 2.2, cue: `enolasquatch.prospect.release-${key}`,
      });
    }
    this.dialogue.play('bomb.releaseStuck', { delay: line.silent ? 0.2 : 1.8 });
    this._releaseTimer = 2.0;
    return true;
  }

  updateRelease(dt) {
    if (this._releaseStep === 'stuck') {
      this._releaseTimer -= dt;
      if (this._releaseTimer <= 0) {
        this._releaseStep = 'kick';
        this.dialogue.play('bomb.releaseKick', { once: true });
        this._releaseTimer = 1.0;
      }
    } else if (this._releaseStep === 'kick') {
      this._releaseTimer -= dt;
      if (this._releaseTimer <= 0) {
        this.payload.release(this.scene, this.physics.velocity.clone());
        this.payloadReleased = true;
        this.dialogue.play('bomb.packageAway', { once: true, delay: 0.3 });
        this.dialogue.play('bomb.weightLoss', { once: true, delay: 2.8 });
        this._releaseStep = 'falling';
        this.setPhase('explosion');
      }
    }
  }

  /* ---- Explosion ---- */

  onPayloadImpact(point) {
    this.explosionPoint = point.clone();
    this._buildExplosionVfx(point);
    this.dialogue.play('explosion.reaction', { urgent: true, delay: 0.6 });
    const missDistance = Math.hypot(point.x - COMPOUND.x, point.z - COMPOUND.z);
    this.score.bombAccuracy = clamp(1 - missDistance / 260, 0, 1);
    // EXPRESS SHIPPING: delivered without missing the target — a tight
    // impact AND a corridor that was actually flown well, not a lucky drop
    // at the end of a wandering approach.
    this.score.expressShipping = missDistance < 140 && this.targeting.corridorScore > 0.6;
  }

  /** A scripted VFX timeline: flash, shockwave ring, debris, one gag frame. */
  _buildExplosionVfx(point) {
    const g = group('fat-squatch-detonation');
    g.position.copy(point);
    const flash = flatMesh(sphereGeo(1, 12, 8), unlit(0xf4e8ff, { transparent: true, opacity: 0 }), 0, 6, 0);
    g.add(flash);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.4, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xd9c2ff, transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4;
    g.add(ring);
    // The one-frame gag: a Sasquatch-head silhouette sprite, hidden until
    // the shockwave nears its peak size, then swapped away again.
    const gag = flatMesh(planeGeo(1, 1), mat({
      map: sasquatchSilhouetteTexture(), transparent: true, alphaTest: 0.05, depthWrite: false, unique: true,
    }), 0, 40, 0);
    gag.visible = false;
    g.add(gag);
    const debris = [];
    for (let i = 0; i < 6; i++) {
      const bit = mesh(boxGeo(2, 1.4, 2), solid(0x3a3428, { roughness: 1 }), 0, 4, 0);
      const a = (i / 6) * Math.PI * 2;
      bit.userData.vel = new THREE.Vector3(Math.cos(a) * (18 + Math.random() * 10), 26 + Math.random() * 16, Math.sin(a) * (18 + Math.random() * 10));
      g.add(bit);
      debris.push(bit);
    }
    this.scene.add(g);
    this._explosionVfx = { group: g, flash, ring, gag, debris };

    // Tower-light-extinguish, if the deploy step built any (see
    // `Defense.deploy()` — it does not build towers itself; those live on
    // `this.detection.towers`, constructed once up front by whoever wires
    // this mission's DetectionSystem, and reused here rather than duplicated).
    for (const t of this.detection.towers || []) {
      if (t.lamp) t.lamp.material = unlit(0x201a14);
    }
  }

  updateExplosion(dt) {
    if (!this.explosionPoint) return;
    this._explosionT += dt;
    const t = this._explosionT;
    const vfx = this._explosionVfx;
    if (vfx) {
      const flashK = clamp(t / 0.25, 0, 1);
      vfx.flash.material.opacity = lerp(0.95, 0, flashK);
      vfx.flash.scale.setScalar(lerp(4, 60, Math.min(1, t / 0.6)));

      const ringK = clamp(t / 3.2, 0, 1);
      vfx.ring.scale.setScalar(lerp(1, 140, Math.sqrt(ringK)));
      vfx.ring.material.opacity = lerp(0.8, 0, ringK);

      // The gag frame: visible only in a short window around peak size.
      vfx.gag.visible = t > 0.7 && t < 1.4;
      if (vfx.gag.visible) {
        const gagK = clamp((t - 0.7) / 0.7, 0, 1);
        const s = lerp(20, 90, Math.sin(gagK * Math.PI));
        vfx.gag.scale.set(s, s, 1);
        vfx.gag.material.opacity = Math.sin(gagK * Math.PI);
      }

      for (const bit of vfx.debris) {
        bit.userData.vel.y -= 30 * dt;
        bit.position.addScaledVector(bit.userData.vel, dt);
        bit.rotation.x += dt * 3;
        bit.rotation.z += dt * 2;
      }
    }
    if (t > 4.2) {
      if (vfx) this.scene.remove(vfx.group);
      this._explosionVfx = null;
      this.setPhase('escape');
    }
  }

  /* ---- Escape / emergency ---- */

  updateEscape(dt) {
    const p = this.physics;
    this._escapeT += dt;
    if (this._escapeT > 3 && !this.dialogue.seen('escape.gunnerDone')) {
      this.dialogue.play('escape.gunnerDone', { once: true });
    }
    if (this._escapeT > 8) {
      this.weather.setConditions({ turbulence: 0.4, lightning: 0 });
      if (!this.dialogue.seen('escape.clear')) this.dialogue.play('escape.clear', { once: true });
    }
    if (!this._emergencyDecided && this._escapeT > 10 && p.agl > 220) {
      this._emergencyDecided = true;
      const engineHit = this.defense.damage.engines.findIndex(Boolean);
      if (engineHit >= 0) {
        this._emergencyEngineIndex = engineHit;
        this.setPhase('emergency');
      } else {
        this.setPhase('return');
      }
    }
  }

  /**
   * @param {'baby'|'push'|'shutdown'} option
   *
   * Note on scope: the phase brief describes "a player choice matching the
   * brief's 5 options" for this beat. The only source available to this
   * phase for that choice's shape is `../dialogue/script.js`, whose
   * `emergency.*` beats describe exactly two practical responses in the
   * dialogue itself (baby the throttle back, or push it and hope) plus the
   * consequence of shutting the engine down outright — three, not five.
   * Implemented against what the dialogue actually supports rather than
   * guessing at two more; flagged explicitly in this phase's report.
   */
  chooseEmergencyResponse(option) {
    if (this.phase !== 'emergency' || this._emergencyResolved) return false;
    this._emergencyResolved = true;
    const i = this._emergencyEngineIndex;
    if (option === 'shutdown') {
      this.engines.kill(i, 'shutdown');
      this.dialogue.play('emergency.shutdown', { once: true });
    } else if (option === 'push') {
      this.dialogue.play('emergency.pushedIt', { once: true, delay: 1.2 });
      if (Math.random() < 0.35) this._emergencyPushFailAt = this.phaseTime + 4 + Math.random() * 4;
    }
    // 'baby': no forced effect — the player easing the throttle back is the
    // whole of the response, same as Beef Run's own return-leg engine event.
    return true;
  }

  updateEmergency(dt) {
    void dt;
    const e = this.engines.engines[this._emergencyEngineIndex];
    if (this._emergencyPushFailAt && this.phaseTime > this._emergencyPushFailAt) {
      this.engines.kill(this._emergencyEngineIndex, 'destroyed');
      this._emergencyPushFailAt = null;
      this.dialogue.play('emergency.shutdown', { once: true });
    }
    if (this._emergencyResolved && (!e.hotScript || e.hotScript <= 0)) {
      this.setPhase('return');
    }
  }

  /* ---- Return / landing / epilogue ---- */

  updateReturn(dt) {
    const p = this.physics;
    this.updateNavCorrection(dt, RETURN_HEADING);
    if (p.position.x < WP.x + 1600) this.setPhase('landing');
  }

  updateLanding(dt) {
    void dt;
    const p = this.physics;
    if (p.onGround && p.groundSpeed < 4) {
      this.gradeFinalLanding();
      const q = this.score.finalLanding;
      this.dialogue.play(q > 0.65 ? 'landing.perfect' : 'landing.hard', { once: true });
      this.setPhase('epilogue');
    }
  }

  updateEpilogue(dt) {
    this._epilogueT += dt;
    /* This is the one deliberate stub, called out in the phase brief as
     * skippable: no populated hangar/crowd-of-Family-NPCs scene. `arrival.lou`
     * plays as a straight dialogue beat; there is no camera-pan/scene-reveal
     * system built here to drive one. A later phase can add it without
     * touching this method's contract — `report()` and `finished` are what
     * the composition root actually needs from this phase. */
    if (this._epilogueT > 8 && !this.finished) {
      this.finished = true;
      this.onComplete?.(this.report());
    }
  }

  /* ---------------------------------------------------------------- */
  /* Shared flight behaviour                                           */
  /* ---------------------------------------------------------------- */

  updateFlightCommon(dt) {
    const p = this.physics;
    const warn = new Set();

    this.weather.sampleAir(p.position, p.agl, { wind: p.wind, gust: p.gust });
    const rough = p.gust.length();
    this.score.roughAir += Math.max(0, rough - 3) * dt;

    if (!p.onGround && p.stallT > 0.35) { warn.add('stall'); this.audio?.setStallHorn?.(true); this.dialogue.bark?.('stall'); }
    else this.audio?.setStallHorn?.(!p.onGround && p.stallT > 0.2);
    if (!p.onGround && p.ias > AC_ENOLA.vne * 0.92) warn.add('overspeed');
    if (!p.onGround && p.agl < 70 && p.vspeed < -3) warn.add('terrain');
    if (this.engines.engines.some((e) => e.temp > 245)) warn.add('hot');
    if (this.score.fuelRemaining < 0.18) warn.add('fuel');
    if (p.damage.gear > 0.3) warn.add('gear');

    if (this.phase === 'bombMalfunction' || (this.phase === 'bombApproach' && !this.bombBayOpen)) warn.add('bombBay');
    if (['bombApproach', 'bombMalfunction', 'release'].includes(this.phase) && !this.payloadReleased) warn.add('payloadArmed');
    if (this.defense?.damage.electrical) warn.add('electrical');
    if (this.defense?.state === 'active') warn.add('flak');
    if (!this.payloadReleased && p.mass > AC_ENOLA.emptyMass + AC_ENOLA.payloadMass + AC_ENOLA.fuelMass * 0.85 && p.vspeed < 0.5 && p.agl < 300 && !p.onGround) {
      warn.add('overweight');
    }
    if (this.detection.active) {
      if (this.detection.state === 'searching') warn.add('patrol');
      if (this.detection.state === 'located') warn.add('located');
    }
    this.flightHud?.setWarnings?.(warn);

    this.score.damage = clamp(
      p.damage.wing * 0.5 + p.damage.gear * 0.3 + (p.damage.tireBurst ? 0.2 : 0)
      + this.defense.damage.engines.filter(Boolean).length * 0.1,
      0, 1,
    );

    if (this.engines.engines.every((e) => e.dead)) this.fail('All four engines are finished.');
    if (Math.abs(p.position.x) > 12000 || p.position.z > 3000 || p.position.z < -6000) {
      this.fail('You have left the area the map covers.');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Events                                                            */
  /* ---------------------------------------------------------------- */

  onTouchdown(vs, gLoad, wheel) {
    this._touchdowns.push({ vs, gLoad, wheel, t: this.missionTime, phase: this.phase });
    this.cameras?.addShake?.(clamp(vs * 0.12, 0.05, 1.2));
    if (this.phase === 'landing') this.dialogue.play('landing.line', { once: true });
  }

  onImpact(severity, what) {
    if (severity <= 0) return;
    const p = this.physics;
    if (severity > 2.4) {
      p.damage.wing = clamp(p.damage.wing + severity * 0.06, 0, 1);
      this.cameras?.addShake?.(0.6);
    }
    if (severity > 6.5 || p.damage.wing >= 1) {
      this.fail(what === 'terrain' ? 'You flew it into the ground.' : 'The aeroplane is finished.');
    }
  }

  onEngineEvent(name) {
    void name;
  }

  /* ---------------------------------------------------------------- */
  /* Grading                                                           */
  /* ---------------------------------------------------------------- */

  gradeTakeoff() {
    const p = this.physics;
    const centreline = clamp(1 - Math.abs(p.position.x - WP.x) / 40, 0, 1);
    const speed = clamp(1 - Math.abs(p.ias * KT - 78) / 45, 0, 1);
    const gentle = clamp(1 - Math.abs(p.pitchDeg - 8) / 18, 0, 1);
    this.score.takeoff = clamp(centreline * 0.4 + speed * 0.3 + gentle * 0.3, 0, 1);
  }

  /**
   * Identical shape/math to `src/beefrun/mission.js`'s `gradeLanding` —
   * sink rate, centreline, and whether anything came off. Reimplemented
   * rather than imported because that one is an instance method entangled
   * with Beef Run's own `this.physics`/`this._touchdowns`/`AC`, not a
   * standalone export; the formula below is unchanged (`AC_ENOLA.span`
   * stands in for `AC.span`).
   */
  gradeLanding(centreX, halfWidth = 11) {
    const p = this.physics;
    const td = this._touchdowns.filter((t) => t.phase === this.phase).pop()
      ?? this._touchdowns[this._touchdowns.length - 1];
    const sink = td ? clamp(1 - (td.vs - 0.6) / 4.2, 0, 1) : 0.4;
    const off = Math.abs(p.position.x - centreX);
    const line = clamp(1 - off / (halfWidth + AC_ENOLA.span * 0.5), 0, 1);
    const kit = clamp(1 - p.damage.gear - (p.damage.tireBurst ? 0.35 : 0), 0, 1);
    return clamp(sink * 0.5 + line * 0.25 + kit * 0.25, 0, 1);
  }

  gradeFinalLanding() {
    this.score.finalLanding = this.gradeLanding(WP.x, WP.rwyWidth);
  }

  /* ---------------------------------------------------------------- */
  /* Checkpoints                                                       */
  /* ---------------------------------------------------------------- */

  saveCheckpoint(name) {
    if (!CHECKPOINTS.includes(name)) return;
    this.checkpoint = name;
    this.checkpointData = {
      name,
      position: this.physics.position.clone(),
      heading: this.physics.headingDeg,
      velocity: this.physics.velocity.clone(),
      quat: this.physics.quat.clone(),
      fuel: this.engines.fuel,
      damage: { ...this.physics.damage },
      score: { ...this.score },
      payloadReleased: this.payloadReleased,
      dusk: this.weather.dusk,
    };
    this.flightHud?.showCheckpoint?.(`CHECKPOINT — ${name.toUpperCase()}`);
    if (typeof setTimeout === 'function') setTimeout(() => this.flightHud?.hideCheckpoint?.(), 2200);
  }

  /**
   * Put the player back at the last checkpoint. `soft` (used for a
   * takeoff-runway overrun, same as Beef Run) keeps score/dialogue history.
   */
  restoreCheckpoint(name = this.checkpoint, { soft = false } = {}) {
    if (!CHECKPOINTS.includes(name)) return false;
    const data = this.checkpointData?.name === name ? this.checkpointData : null;
    this.checkpoint = name;
    this.failed = null;
    this.dialogue.clear();
    this._touchdowns.length = 0;
    this.flightHud?.hideComplete?.();

    const setup = {
      takeoff: () => {
        const a = this.airfield.anchors.lineUp;
        this.physics.setPose(new THREE.Vector3(a.x, WP.elev + AC_ENOLA.gearY, a.z), this.airfield.anchors.departHeading, 0);
        this.engines.forceRunning();
        this.input.throttle = 0;
        this.physics.controls.parkingBrake = false;
        this.weather.setConditions({ dusk: 0.5, night: 0.1, turbulence: 0.2 });
        this.setPhase('takeoff');
      },
      turnOnCourse: () => {
        this.physics.setPose(new THREE.Vector3(TURN_POINT.x, TURN_POINT.minAltitudeAgl + approxGroundHeight(TURN_POINT.x) + 60, TURN_POINT.z), TURN_POINT.newHeading, 55);
        this.engines.forceRunning();
        this.input.throttle = 0.6;
        this.physics.controls.parkingBrake = false;
        this.weather.setConditions({ dusk: 1, night: 1, turbulence: 0.4 });
        this.setPhase('cruise');
      },
      preRelease: () => {
        this.physics.setPose(new THREE.Vector3(TARGET_X - 1200, approxGroundHeight(TARGET_X) + 400, COMPOUND.z), TURN_POINT.newHeading, 62);
        this.engines.forceRunning();
        this.input.throttle = 0.6;
        this.physics.controls.parkingBrake = false;
        this.payloadReleased = data?.payloadReleased ?? false;
        this.defense.deploy({ x: TARGET_X, z: COMPOUND.z }, { groundY: approxGroundHeight(TARGET_X), radius: 460 });
        this.setPhase('bombApproach');
      },
      return: () => {
        this.physics.setPose(new THREE.Vector3(TARGET_X - 900, approxGroundHeight(TARGET_X) + 500, COMPOUND.z), RETURN_HEADING, 60);
        this.engines.forceRunning();
        this.input.throttle = 0.55;
        this.physics.controls.parkingBrake = false;
        this.payloadReleased = true;
        this.detection.active = false;
        this.weather.setConditions({ dusk: 0.8, night: 0.4, turbulence: 0.5 });
        this.setPhase('return');
      },
    };

    if (!soft && data) {
      Object.assign(this.score, data.score);
      this.physics.damage.wing = data.damage?.wing ?? 0;
      this.physics.damage.gear = data.damage?.gear ?? 0;
      this.physics.damage.tireBurst = data.damage?.tireBurst ?? false;
      this.engines.reset(false);
      this.engines.fuel = data.fuel ?? this.engines.fuel;
      this.payloadReleased = data.payloadReleased ?? this.payloadReleased;
    }

    this.flags.enginesEverStarted = true;
    setup[name]();
    this.aircraft.syncTo(this.physics);
    return true;
  }

  requestRestart() {
    if (this.finished || !this.checkpoint) return false;
    return this.restoreCheckpoint(this.checkpoint);
  }

  get checkpointList() { return CHECKPOINTS; }

  /* ---------------------------------------------------------------- */
  /* Failure and the end                                               */
  /* ---------------------------------------------------------------- */

  fail(reason) {
    if (this.failed || this.finished) return;
    this.failed = reason;
    this.audio?.setPhase?.('silent');
    this.audio?.setStallHorn?.(false);
    this.dialogue.clear();
    this.hud?.say?.(`<em>${reason}</em> Open the Tab menu and choose Restart from checkpoint to return to the ${this.checkpoint} checkpoint.`, 12000);
    this.flightHud?.showCheckpoint?.('TAB MENU — RESTART FROM CHECKPOINT');
  }

  /** The end card's contents — same idiom as Beef Run's own `report()`. */
  report() {
    const s = this.score;
    const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(clamp(v, 0, 1) * 100)}%`);
    const grade = (v) => (v === null || v === undefined ? '' : v > 0.75 ? 'good' : v > 0.45 ? 'ok' : 'bad');
    const mins = Math.floor(s.flightTime / 60);
    const secs = Math.round(s.flightTime % 60);

    const stats = [
      { label: 'Takeoff quality', value: pct(s.takeoff), grade: grade(s.takeoff) },
      { label: 'Bomb accuracy', value: pct(s.bombAccuracy), grade: grade(s.bombAccuracy) },
      { label: 'Corridor discipline', value: pct(s.corridorScore), grade: grade(s.corridorScore) },
      { label: 'Final landing', value: pct(s.finalLanding), grade: grade(s.finalLanding) },
      { label: 'Patrol attention', value: pct(s.patrolPeak), grade: grade(1 - s.patrolPeak) },
      { label: 'Flight time', value: `${mins}:${String(secs).padStart(2, '0')}` },
      { label: 'Fuel remaining', value: pct(s.fuelRemaining), grade: grade(s.fuelRemaining) },
      { label: 'Aircraft damage', value: pct(s.damage), grade: grade(1 - s.damage) },
    ];

    const parts = [
      [s.takeoff, 0.1], [s.bombAccuracy, 0.32], [s.corridorScore, 0.16],
      [s.finalLanding, 0.24], [1 - s.patrolPeak, 0.08], [1 - s.damage, 0.1],
    ].filter(([v]) => v !== null && v !== undefined && Number.isFinite(v));
    const weight = parts.reduce((a, [, w]) => a + w, 0);
    const total = weight > 0 ? clamp(parts.reduce((a, [v, w]) => a + clamp(v, 0, 1) * w, 0) / weight, 0, 1) : 0;
    const ranks = ['Woke the Neighbours', 'Delivered, Eventually', 'Certified Heavy Aviator', 'Night Ops Professional', 'Express Shipping'];
    const tier = s.expressShipping ? 4 : total > 0.78 ? 3 : total > 0.58 ? 2 : total > 0.36 ? 1 : 0;

    const unlocks = [
      'Enola Squatch Flight Jacket',
      'Fat Squatch Dashboard Ornament',
      s.expressShipping ? 'Achievement: EXPRESS SHIPPING' : null,
    ].filter(Boolean);

    return { stats, rank: ranks[tier], tier, total, unlocks, expressShipping: s.expressShipping };
  }
}
