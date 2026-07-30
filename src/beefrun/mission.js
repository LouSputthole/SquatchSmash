/**
 * MissionController — The Beef Run, start to finish.
 *
 * One state machine owns the whole thing: walk to Lou, walk round the
 * aeroplane, start it, taxi, take off, fly south, land somewhere that should
 * not have a runway on it, load three crates of cured meat, leave downhill off
 * a cliff, get home without being noticed, and put it on the ground in the
 * dark. Every phase knows what the objective line says, what conditions the
 * weather is in, which systems are armed, and what counts as having failed.
 *
 * Failure is graded rather than binary. A bad landing costs points and breaks a
 * tyre; running out of aeroplane ends the run and drops the player back at the
 * last of four checkpoints with the world rebuilt around them.
 */
import * as THREE from 'three';
import { WP, EH, KT, FT, AC, DIFFICULTY, LANDMARKS } from './config.js';
import { OBJECTIVES } from './script.js';
import { terrainHeight } from './terrain.js';
import { clamp, lerp, smoothstep, damp, headingDelta } from './util.js';
import { setPose, speak, updateFigure, walkTo, scatterCrows, makeAssociate } from './npc.js';
import { yawToward } from '../world/build.js';
import { Loading } from './loading.js';

/** The four places the mission will put you back. */
const CHECKPOINT_ORDER = ['takeoff', 'approach', 'departure', 'return'];

export class MissionController {
  constructor(ctx) {
    Object.assign(this, ctx);
    /* ctx: scene, camera, renderer, hud, flightHud, dialogue, audio, input,
     *      cameras, player, interaction, physics, engines, aircraft, cargo,
     *      weather, detection, terrain, airfield, airstrip, landmarks, lou,
     *      preflight, difficulty */

    this.phase = 'idle';
    this.phaseTime = 0;
    this.missionTime = 0;
    this.objective = '';
    this.failed = null;
    this.finished = false;
    this.paused = false;

    this.checkpoint = 'takeoff';
    this.checkpointData = null;

    this.score = {
      takeoff: null,            // 0..1
      mountainLanding: null,
      finalLanding: null,
      cargoDamage: 0,
      patrolPeak: 0,
      lowestClearance: Infinity,
      flightTime: 0,
      fuelRemaining: 1,
      packages: 0,
      gunsDelivered: 0,
      damage: 0,
      patience: 1,              // Lou's, and it only goes one way
      roughAir: 0,
    };

    this.flags = {
      louAboard: false,
      inCockpit: false,
      stoveWalked: false,
      chocksWarned: false,
      runupDone: false,
      rotateCalled: false,
      clearCalled: false,
      landmarksSeen: new Set(),
      turbStarted: false,
      approachCalls: 0,
      engineScripted: false,
      duskStarted: false,
      truckLit: false,
      homeSighted: false,
      grassOffs: 0,
    };

    /* Two cargo sequences: Old Stove's crates go south, the jerky comes back.
     * `activeLoad` is whichever one currently owns the cargo door. */
    this.gunLoad = null;
    this.jerkyLoad = null;
    this.associates = [];
    this.approachGates = null;
    this._callTimer = 0;
    this._touchdowns = [];
    this._lastCrateShift = 0;

    this.physics.onTouchdown = (vs, g, wheel) => this.onTouchdown(vs, g, wheel);
    this.physics.onImpact = (sev, what) => this.onImpact(sev, what);
    this.engines.onEvent = (name, i) => this.onEngineEvent(name, i);
    this.detection.onRadio = (id) => this.dialogue.play(id, { urgent: id === 'caib.hail' });
    this.detection.onState = (state) => this.onDetectionState(state);
  }

  /* ---------------------------------------------------------------- */
  /* Setup                                                             */
  /* ---------------------------------------------------------------- */

  begin(difficultyId = 'standard') {
    const d = DIFFICULTY[difficultyId] || DIFFICULTY.standard;
    this.difficulty = d;
    Object.assign(this.physics.assist, {
      stability: d.stability,
      autoRudder: d.autoRudder,
      stallGuard: d.stallGuard,
      groundAssist: d.groundAssist,
      torque: d.torque,
    });
    this.weather.gustScale = d.gust;
    this.detection.rate = d.detectRate;

    // Park the aeroplane, put Lou beside the wing, put the player on the road.
    const park = this.airfield.anchors.parking;
    this.physics.setPose(new THREE.Vector3(park.x, park.y + AC.gearY, park.z), this.airfield.anchors.parkingHeading, 0);
    this.physics.controls.parkingBrake = true;
    this.aircraft.syncTo(this.physics);

    this.lou.group.position.copy(this.airfield.anchors.louStand);
    this.lou.group.rotation.y = Math.PI * 0.6;
    setPose(this.lou, 'lean');
    this.lou.sick = 0.35;

    /* Old Stove waits in the hangar's shade, facing the door. He walks out to
     * his crates near the end of the preflight (updatePreflight) rather than
     * standing frozen beside the aeroplane from the first frame. Officially,
     * of course, he is in neither place. */
    this.stove.group.position.copy(this.airfield.anchors.stoveHangar);
    this.stove.group.rotation.y = Math.PI;
    setPose(this.stove, 'idle');

    const start = this.airfield.anchors.playerStart;
    this.player.position.set(start.x, WP.elev + 1.66, start.z);
    // The integration player keeps the eye height relative and rides
    // world.groundAt; seeding `ground` skips the smoothing swoop up from zero.
    this.player.ground = WP.elev;
    // The apartment's player faces -Z at yaw 0; build.js already knows this.
    this.player.yaw = yawToward(start, park);
    this.player.mode = 'walk';
    this.player.enabled = true;

    this.weather.setConditions({ turbulence: 0.22, crosswind: 0.4 * d.crosswind, rain: 0, cloudDensity: 0.35, dusk: 0 });
    this.audio.setPhase('airport');
    this.setPhase('arrival');
  }

  /** Whichever cargo sequence currently owns the cargo door. */
  get activeLoad() {
    return this.jerkyLoad?.armed ? this.jerkyLoad : (this.gunLoad?.armed ? this.gunLoad : (this.jerkyLoad || this.gunLoad));
  }

  setPhase(name) {
    this.phase = name;
    this.phaseTime = 0;
    this.onEnterPhase(name);
  }

  setObjective(text) {
    this.objective = text;
    this.flightHud.setObjective(text);
  }

  /* ---------------------------------------------------------------- */
  /* Phase entry                                                       */
  /* ---------------------------------------------------------------- */

  onEnterPhase(name) {
    switch (name) {
      case 'arrival':
        this.setObjective(OBJECTIVES.meetLou);
        this.flightHud.show(false);
        break;

      case 'preflight':
        this.setObjective(OBJECTIVES.preflight);
        this.preflight.arm();
        this.preflight.onComplete = () => this.setPhase('stove');
        break;

      case 'stove':
        this.setObjective(OBJECTIVES.meetStove);
        this.preflight.disarm();
        break;

      case 'loadGuns':
        this.setObjective(OBJECTIVES.loadGuns);
        this.startGunLoad();
        break;

      case 'unloadGuns':
        this.setObjective(OBJECTIVES.unloadGuns);
        this.dialogue.play('guns.arrive', { once: true });
        this.dialogue.play('guns.unloading', { once: true });
        this.startGunUnload();
        break;

      case 'boarding': {
        this.setObjective(OBJECTIVES.board);
        this.preflight.disarm();
        this.gunLoad?.disarm();
        // Lou gets in. Slowly, and with one hand on the door frame.
        this.louBoarding = { t: 0, from: this.lou.group.position.clone() };
        this.armBoardingTarget();
        break;
      }

      case 'startup':
        this.setObjective(OBJECTIVES.start);
        this.flightHud.show(true);
        this.audio.setHeadset(true);
        this.dialogue.setHeadset(true);
        this.dialogue.play('start.begin', { once: true, delay: 0.8 });
        this.input.rudderKeys = true;
        break;

      case 'taxi':
        this.setObjective(OBJECTIVES.taxi);
        this.dialogue.play('taxi.begin', { once: true, delay: 1.2 });
        break;

      case 'runup':
        this.setObjective(OBJECTIVES.runup);
        this.dialogue.play('taxi.hold', { once: true });
        this.runup = { held: 0, sputtered: false };
        break;

      case 'lineup':
        this.setObjective(OBJECTIVES.takeoff);
        this.dialogue.play('takeoff.brief', { once: true, delay: 0.6 });
        this.saveCheckpoint('takeoff');
        break;

      case 'climbout':
        this.audio.setPhase('takeoff');
        break;

      case 'south':
        this.setObjective(OBJECTIVES.south);
        this.audio.setPhase('south');
        this.dialogue.play('cruise.what', { once: true, delay: 4 });
        break;

      case 'approach':
        this.setObjective(OBJECTIVES.approach);
        this.audio.setPhase('approach');
        this.dialogue.play('approach.falls', { once: true });
        this.weather.setConditions({ turbulence: 0.62, cloudDensity: 0.55 });
        this.saveCheckpoint('approach');
        if (this.difficulty.landingPath) this.buildApproachGates();
        break;

      case 'strip':
        this.setObjective('Shut down and get out');
        this.audio.setPhase('loading');
        this.clearApproachGates();
        break;

      case 'onfoot-strip':
        this.setObjective(OBJECTIVES.meetCecilio);
        this.dialogue.play('cecilio.meet', { delay: 1.2 });
        break;

      case 'loading':
        this.setObjective(OBJECTIVES.load);
        this.startLoading();
        break;

      case 'departure':
        this.setObjective(OBJECTIVES.depart);
        this.dialogue.play('depart.engine', { urgent: true });
        this.detection.deploy(EH.zHigh);
        this.saveCheckpoint('departure');
        break;

      case 'boarding2':
        this.setObjective(OBJECTIVES.board);
        this.armBoardingTarget();
        this.dialogue.play('depart.lou', { delay: 1.4 });
        break;

      case 'heavyTakeoff':
        this.setObjective(OBJECTIVES.depart);
        this.dialogue.play('depart.downhill', { once: true, delay: 0.8 });
        this.audio.setPhase('ret');
        break;

      case 'return':
        this.setObjective(OBJECTIVES.evade);
        this.weather.setConditions({ turbulence: 0.8, rain: 0.35, cloudDensity: 0.8 });
        this.dialogue.play('return.river', { once: true, delay: 3 });
        break;

      case 'home':
        this.setObjective(OBJECTIVES.home);
        this.saveCheckpoint('return');
        this.dialogue.play('home.sight', { once: true });
        break;

      case 'final':
        this.audio.setPhase('silent');
        this.dialogue.play('home.final', { once: true });
        break;

      case 'shutdown':
        this.setObjective(OBJECTIVES.taxiHome);
        break;

      case 'ending':
        this.runEnding();
        break;

      default:
        break;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Boarding / leaving the aeroplane                                  */
  /* ---------------------------------------------------------------- */

  armBoardingTarget() {
    if (this.boardTarget) return;
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.8, 1.2),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.set(-1.1, -0.4, 2.0);
    this.aircraft.group.add(hit);
    this.boardTarget = hit;
    this.interaction.register(hit, {
      label: () => 'Get into the <b>left seat</b>',
      key: 'E',
      onUse: () => this.enterCockpit(),
    });
  }

  disarmBoardingTarget() {
    if (!this.boardTarget) return;
    this.interaction.unregister(this.boardTarget);
    this.boardTarget.parent?.remove(this.boardTarget);
    this.boardTarget = null;
  }

  enterCockpit() {
    this.disarmBoardingTarget();
    this.flags.inCockpit = true;
    this.player.enabled = false;
    this.player.mode = 'frozen';
    this.interaction.setPaused(true);
    this.cameras.setView('cockpit');
    this.cameras.lookYaw = 0;
    this.cameras.lookPitch = -0.1;
    this.audio.setHeadset(true);
    this.dialogue.setHeadset(true);
    this.input.rudderKeys = true;
    if (this.phase === 'boarding') this.setPhase('startup');
    else if (this.phase === 'boarding2') this.setPhase('heavyTakeoff');
  }

  exitCockpit() {
    this.flags.inCockpit = false;
    this.interaction.setPaused(false);
    this.audio.setHeadset(false);
    this.dialogue.setHeadset(false);
    this.input.rudderKeys = false;
    this.input.clear();
    // Step down onto the ground beside the door.
    const p = this.physics.position;
    const q = this.physics.quat;
    const off = new THREE.Vector3(-3.2, 0, 0.5).applyQuaternion(q);
    const x = p.x + off.x, z = p.z + off.z;
    this.player.position.set(x, terrainHeight(x, z) + 1.66, z);
    this.player.ground = terrainHeight(x, z);
    this.player.yaw = yawToward({ x, z }, p);
    this.player.pitch = 0;
    this.player.mode = 'walk';
    this.player.enabled = true;
    this.player.velocity.set(0, 0, 0);
  }

  /* ---------------------------------------------------------------- */
  /* Per-frame                                                         */
  /* ---------------------------------------------------------------- */

  update(dt) {
    if (this.paused || this.finished) return;
    this.phaseTime += dt;
    this.missionTime += dt;
    if (this.flags.inCockpit) this.score.flightTime += dt;

    const p = this.physics;

    // Terrain clearance, tracked for the end card — but only while flying.
    if (this.flags.inCockpit && !p.onGround && p.tas > 20) {
      this.score.lowestClearance = Math.min(this.score.lowestClearance, p.agl);
    }
    this.score.fuelRemaining = clamp(this.engines.fuel / AC.fuelMass, 0, 1);

    // Lou: increasingly unwell, and reacting to the flying.
    this.updateLou(dt);

    switch (this.phase) {
      case 'arrival': this.updateArrival(dt); break;
      case 'preflight': this.updatePreflight(dt); break;
      case 'stove': this.updateStove(dt); break;
      case 'loadGuns': this.updateGunLoad(dt); break;
      case 'unloadGuns': this.updateGunUnload(dt); break;
      case 'boarding': this.updateBoarding(dt); break;
      case 'startup': this.updateStartup(dt); break;
      case 'taxi': this.updateTaxi(dt); break;
      case 'runup': this.updateRunup(dt); break;
      case 'lineup': this.updateLineup(dt); break;
      case 'climbout': this.updateClimbout(dt); break;
      case 'south': this.updateSouth(dt); break;
      case 'approach': this.updateApproach(dt); break;
      case 'strip': this.updateStrip(dt); break;
      case 'onfoot-strip': this.updateOnFootStrip(dt); break;
      case 'loading': this.updateLoading(dt); break;
      case 'departure': this.updateDeparture(dt); break;
      case 'boarding2': this.updateBoarding(dt); break;
      case 'heavyTakeoff': this.updateHeavyTakeoff(dt); break;
      case 'return': this.updateReturn(dt); break;
      case 'home': this.updateHome(dt); break;
      case 'final': this.updateFinal(dt); break;
      case 'shutdown': this.updateShutdown(dt); break;
      default: break;
    }

    if (this.flags.inCockpit) this.updateFlightCommon(dt);
  }

  /* ---- Ground, before the aeroplane ---- */

  /** Lou's position in the world, which is not his local one once he is aboard. */
  louWorld(out = new THREE.Vector3()) {
    this.lou.group.updateWorldMatrix(true, false);
    return this.lou.group.getWorldPosition(out);
  }

  updateArrival(dt) {
    const d = this.player.position.distanceTo(this.louWorld());
    if (d < 18 && !this.dialogue.seen('greeting')) {
      this.dialogue.play('greeting');
      speak(this.lou, 2);
    }
    if (d < 11 && this.dialogue.seen('greeting') && !this.dialogue.busy && !this.dialogue.seen('aircraft')) {
      this.dialogue.play('aircraft');
    }
    if (this.dialogue.seen('aircraft') && !this.dialogue.busy) {
      this.dialogue.play('clipboard', { once: true });
      this.setPhase('preflight');
    }
    void dt;
  }

  updatePreflight(dt) {
    this.preflight.update(dt, this.physics);
    /* Four of six checks done is "near the end": Old Stove leaves the hangar
     * now, so the walk is finished and he is standing at his crates before
     * the preflight wraps and his scene wants him — no repeated beat, no
     * teleport, and no man frozen beside the aeroplane since frame one. */
    if (!this.flags.stoveWalked && this.preflight.progress > 0.6) {
      this.flags.stoveWalked = true;
      const stand = this.airfield.anchors.stoveStand;
      walkTo(this.stove, stand.x, stand.z, { speed: 1.3 });
    }
    const left = this.preflight.remaining;
    this.setObjective(left.length
      ? `${OBJECTIVES.preflight} — ${left.join(', ')}`
      : OBJECTIVES.preflight);
  }

  /* ---- Old Stove ---- */

  updateStove(dt) {
    void dt;
    // If the preflight was rushed he may still be crossing the apron. His
    // beats wait until he is standing at the crates, so nothing fires twice.
    if (this.stove.walk) return;
    const d = this.player.position.distanceTo(this.stove.group.position);
    if (d < 12) this.stove.lookAt = this.player.position;
    if (d < 9 && !this.dialogue.seen('stove.meet')) {
      this.dialogue.play('stove.meet');
      speak(this.stove, 2.4);
    }
    if (this.dialogue.seen('stove.meet') && !this.dialogue.busy && !this.dialogue.seen('stove.crates')) {
      this.dialogue.play('stove.crates');
    }
    if (this.dialogue.seen('stove.crates') && !this.dialogue.busy && !this.dialogue.seen('stove.dontask')) {
      this.dialogue.play('stove.dontask');
    }
    if (this.dialogue.seen('stove.dontask') && !this.dialogue.busy) this.setPhase('loadGuns');
  }

  startGunLoad() {
    if (this.gunLoad) { this.gunLoad.arm(); return; }
    const a = this.airfield.anchors;
    this.gunLoad = new Loading({
      scene: this.scene,
      interaction: this.interaction,
      aircraft: this.aircraft,
      cargo: this.cargo,
      dialogue: this.dialogue,
      audio: this.audio,
      camera: this.camera,
      player: this.player,
      groundAt: () => WP.elev,
      stackAt: a.stoveCrates,
      cartAt: a.stoveCart,
      kind: 'guns',
      count: 3,
      briefBeat: 'stove.loading',
    });
    this.gunLoad.arm();
    this.gunLoad.onComplete = () => {
      this.dialogue.play('stove.done', { once: true });
      setPose(this.stove, 'point');
      this.setPhase('boarding');
    };
  }

  updateGunLoad(dt) {
    this.gunLoad.update(dt, this.player.position, this.player.yaw);
    const n = this.cargo.crateCount;
    this.setObjective(
      n < 3 ? `${OBJECTIVES.loadGuns} — ${n}/3 aboard`
        : !this.cargo.allStrapped ? OBJECTIVES.strap
          : 'Close and latch the cargo door',
    );
  }

  startGunUnload() {
    if (!this.gunLoad) return;
    const drop = this.airstrip.anchors.shelter;
    this.gunLoad.armUnload({ x: drop.x + 4, z: drop.z + 5 });
    this.gunLoad.groundAt = (x, z) => terrainHeight(x, z);
    this.gunLoad.onComplete = () => {
      this.score.gunsDelivered = 3;
      this.dialogue.play('guns.done', { once: true });
      this.gunLoad.disarm();
      this.setPhase('onfoot-strip');
    };
  }

  updateGunUnload(dt) {
    this.gunLoad?.update(dt, this.player.position, this.player.yaw);
    const left = this.cargo.crateCount;
    this.setObjective(left ? `${OBJECTIVES.unloadGuns} — ${left} left` : OBJECTIVES.unloadGuns);
  }

  updateBoarding(dt) {
    // Lou climbs in over a couple of seconds, and does not enjoy it.
    if (this.louBoarding) {
      this.louBoarding.t += dt;
      const k = clamp(this.louBoarding.t / 3.4, 0, 1);
      const seat = this.aircraft.copilotSeat.clone().applyMatrix4(this.aircraft.group.matrixWorld);
      this.lou.group.position.lerpVectors(this.louBoarding.from, seat, smoothstep(0, 1, k));
      if (k > 0.55 && this.lou.pose !== 'sit') {
        setPose(this.lou, 'sit');
        this.aircraft.group.add(this.lou.group);
        this.lou.group.position.copy(this.aircraft.copilotSeat);
        this.lou.group.rotation.set(0, 0, 0);
      }
      if (k >= 1) {
        this.louBoarding = null;
        this.flags.louAboard = true;
      }
    }
    if (this.preflight.chocksIn && !this.flags.chocksWarned) {
      this.flags.chocksWarned = true;
      this.dialogue.play('preflight.chocks');
    }
  }

  /* ---- In the aeroplane ---- */

  updateStartup(dt) {
    void dt;
    const e = this.engines;
    if (!e.masterBattery) {
      this.setObjective('Battery on — press 3');
      return;
    }
    if (!e.fuelSelectors) {
      this.setObjective('Fuel selectors — press 4');
      return;
    }
    if (this.input.throttle < 0.08) {
      this.setObjective('Crack both throttles — Shift');
      return;
    }
    if (!e.engines[0].running) {
      this.setObjective('Start the left engine — press 1');
      return;
    }
    if (!e.engines[1].running) {
      this.setObjective('Start the right engine — press 2');
      return;
    }
    if (this.physics.controls.parkingBrake) {
      this.setObjective('Release the parking brake — press V');
      this.dialogue.play('start.brake', { once: true });
      return;
    }
    this.setPhase('taxi');
  }

  updateTaxi(dt) {
    void dt;
    const p = this.physics;
    const hold = this.airfield.anchors.holdShort;
    const d = Math.hypot(p.position.x - hold.x, p.position.z - hold.z);
    if (p.groundSpeed * KT > 30) this.dialogue.bark('smooth') || this.dialogue.play('taxi.fast', { once: true });
    if (d < 26) this.setPhase('runup');
    // Wandering off the paving is not a failure, just slower and bumpier.
  }

  updateRunup(dt) {
    const p = this.physics;
    const both = this.input.throttle > 0.68;
    const braked = p.groundSpeed < 3.5;
    if (both && braked) {
      this.runup.held += dt;
      this.setObjective(`${OBJECTIVES.runup} — hold ${Math.max(0, 2.4 - this.runup.held).toFixed(1)}s`);
      if (this.runup.held > 1.1 && !this.runup.sputtered) {
        this.runup.sputtered = true;
        // One engine coughs. Lou hits the dashboard. It changes the situation.
        this.engines.engines[1].roughness = 0.9;
        this.audio.play('gun.dry', { volume: 0.5 });
        setTimeout(() => {
          this.engines.engines[1].roughness = 0.1;
          this.audio.play('neighbours.thump', { volume: 0.6 });
          this.dialogue.play('runup.sputter');
        }, 1400);
      }
      if (this.runup.held > 2.4) {
        this.dialogue.play('runup.done', { once: true });
        this.setPhase('lineup');
      }
    } else {
      this.runup.held = Math.max(0, this.runup.held - dt);
      this.setObjective(`${OBJECTIVES.runup} — brakes on, throttles up`);
    }
  }

  updateLineup(dt) {
    void dt;
    const p = this.physics;
    // Rotation call, and the trees at the end.
    if (!this.flags.rotateCalled && p.ias * KT > 58 && p.onGround) {
      this.flags.rotateCalled = true;
      this.dialogue.play('takeoff.rotate', { urgent: true });
    }
    if (!p.onGround && p.agl > 12) {
      this.gradeTakeoff();
      this.setPhase('climbout');
    }
    // Ran out of runway: soft failure, put back at the threshold.
    if (p.onGround && p.position.z < WP.z - WP.rwyHalf + 20 && p.groundSpeed > 4) {
      this.flags.grassOffs++;
      this.score.patience = clamp(this.score.patience - 0.12, 0, 1);
      this.dialogue.play('takeoff.grass', { urgent: true });
      this.restoreCheckpoint('takeoff', { soft: true });
    }
  }

  updateClimbout(dt) {
    void dt;
    const p = this.physics;
    if (!this.flags.clearCalled && p.agl > 130) {
      this.flags.clearCalled = true;
      this.dialogue.play('takeoff.clear');
    }
    if (p.position.z < WP.z - 1200) this.setPhase('south');
  }

  updateSouth(dt) {
    void dt;
    const p = this.physics;
    const z = p.position.z;

    // Landmarks announce themselves as they come into range.
    for (const lm of LANDMARKS) {
      if (this.flags.landmarksSeen.has(lm.id)) continue;
      if (Math.abs(z - lm.z) < 900 && lm.kind !== 'falls') {
        this.flags.landmarksSeen.add(lm.id);
        this.dialogue.play(`nav.${lm.kind}`, { once: true });
      }
    }
    if (!this.dialogue.seen('cruise.photo') && this.dialogue.seen('cruise.what') && !this.dialogue.busy && z < -1800) {
      this.dialogue.play('cruise.photo');
    }

    // The air roughens up over the mountains, and Lou notices.
    if (!this.flags.turbStarted && z < -2600) {
      this.flags.turbStarted = true;
      this.weather.setConditions({ turbulence: 0.55, cloudDensity: 0.5 });
      this.dialogue.play('turb.start', { once: true });
    }
    if (z < -4200 && this.score.roughAir > 6 && !this.dialogue.seen('turb.sick')) {
      this.dialogue.play('turb.sick');
    }
    if (z < -5400 && !this.dialogue.seen('turb.bag')) {
      this.dialogue.play('turb.bag', { once: true });
    }

    if (z < -8300) this.setPhase('approach');
  }

  updateApproach(dt) {
    const p = this.physics;
    this._callTimer -= dt;

    if (!this.dialogue.seen('approach.valley') && p.position.z < -8900) {
      this.dialogue.play('approach.valley', { once: true });
    }

    // Lou calls the approach. Cooldown so he is a copilot, not a metronome.
    if (this._callTimer <= 0 && !p.onGround && p.position.z < -9100) {
      const stripY = lerp(EH.elevLow, EH.elevHigh, clamp((p.position.z - EH.zLow) / (EH.zHigh - EH.zLow), 0, 1));
      const height = p.position.y - stripY;
      const toGo = Math.max(1, p.position.z - EH.zLow);
      const wantHeight = toGo * 0.09;                      // roughly six degrees
      const ias = p.ias * KT;
      let call = null;
      if (height > wantHeight * 2.1 && toGo < 1400) {
        this.flags.approachCalls++;
        call = this.flags.approachCalls > 2 ? 'approach.high3'
          : this.flags.approachCalls > 1 ? 'approach.high2' : 'approach.high';
      } else if (height < wantHeight * 0.45 && toGo < 1200) call = 'approach.low';
      else if (ias < 62 && toGo < 1600) call = 'approach.slow';
      else if (ias > 105 && toGo < 1200) call = 'approach.fast';
      else if (height < 22 && toGo < 260) call = 'approach.flare';
      if (call) {
        this.dialogue.play(call);
        this._callTimer = 4.2;
      }
    }

    if (this.approachGates) this.updateApproachGates(p);

    // On the ground, slowed to a walk, on the strip: that is an arrival.
    if (p.onGround && p.groundSpeed < 3 && p.position.z < EH.zLow + 40) {
      this.gradeMountainLanding();
      this.setPhase('strip');
    }
  }

  updateStrip(dt) {
    void dt;
    const p = this.physics;
    this.setObjective(this.engines.anyRunning ? 'Shut the engines down — press 1 and 2' : 'Get out');
    if (!this.engines.anyRunning && p.groundSpeed < 1.0) {
      this.exitCockpit();
      this.setPhase(this.cargo.crateCount > 0 ? 'unloadGuns' : 'onfoot-strip');
    }
  }

  updateOnFootStrip(dt) {
    void dt;
    const cecilio = this.airstrip.cecilio;
    const d = this.player.position.distanceTo(cecilio.group.position);
    if (d < 8) {
      cecilio.lookAt = this.player.position;
      speak(cecilio, 1.5);
      if (this.dialogue.seen('cecilio.meet') && !this.dialogue.busy && !this.dialogue.seen('cecilio.silence')) {
        this.dialogue.play('cecilio.silence');
      }
      if (this.dialogue.seen('cecilio.silence') && !this.dialogue.busy) {
        this.setPhase('loading');
      }
    }
  }

  startLoading() {
    if (this.jerkyLoad) { this.jerkyLoad.arm(); return; }
    this.jerkyLoad = new Loading({
      scene: this.scene,
      interaction: this.interaction,
      aircraft: this.aircraft,
      cargo: this.cargo,
      dialogue: this.dialogue,
      audio: this.audio,
      camera: this.camera,
      player: this.player,
      groundAt: (x, z) => terrainHeight(x, z),
      stackAt: this.airstrip.anchors.crateStack,
      kind: 'jerky',
      count: 3,
      briefBeat: 'load.brief',
    });
    this.jerkyLoad.arm();
    this.jerkyLoad.onComplete = () => this.setPhase('departure');
  }

  updateLoading(dt) {
    this.jerkyLoad.update(dt, this.player.position, this.player.yaw);
    const n = this.cargo.crateCount;
    this.setObjective(
      n < 3 ? `${OBJECTIVES.load} — ${n}/3 aboard`
        : !this.cargo.allStrapped ? OBJECTIVES.strap
          : 'Close and latch the cargo door',
    );
    // The guard dog develops an interest in the open crate.
    if (this.airfield.dog && !this.dogSent && n >= 1) {
      this.dogSent = true;
    }
  }

  updateDeparture(dt) {
    void dt;
    if (!this.dialogue.busy && this.phaseTime > 2) {
      this.jerkyLoad?.disarm();
      this.setPhase('boarding2');
      this.dialogue.play('depart.seat', { delay: 2.4 });
    }
  }

  updateHeavyTakeoff(dt) {
    void dt;
    const p = this.physics;
    if (!this.dialogue.seen('depart.runway') && p.groundSpeed > 14 && p.position.z > EH.zHigh + 180) {
      this.dialogue.play('depart.runway');
    }
    if (!p.onGround && p.agl > 40) {
      this.dialogue.play('depart.clear', { once: true });
      this.setPhase('return');
    }
    // Off the side of the strip into the jungle: that is the end of it.
    if (p.onGround && Math.abs(p.position.x - EH.x) > EH.rwyWidth + 12 && p.groundSpeed > 8) {
      this.fail('You put it into the trees beside the strip.');
    }
  }

  updateReturn(dt) {
    const p = this.physics;
    const z = p.position.z;

    if (z > -7600 && !this.dialogue.seen('return.ridge')) this.dialogue.play('return.ridge', { once: true });
    if (z > -6000 && !this.dialogue.seen('return.rain')) {
      this.dialogue.play('return.rain', { once: true });
      this.weather.setConditions({ rain: 0.6, cloudDensity: 0.9, turbulence: 0.9 });
    }

    // The left engine starts running hot on the last leg home.
    if (!this.flags.engineScripted && z > -3400) {
      this.flags.engineScripted = true;
      this.engines.scriptOverheat(0, 70);
      this.dialogue.play('engine.hot', { urgent: true });
      this.setObjective(OBJECTIVES.engine);
    }
    if (this.flags.engineScripted) {
      const hot = this.engines.engines[0];
      if (hot.temp > 250 && this.input.throttleSplit > -0.3) {
        this.setObjective(`${OBJECTIVES.engine} — ease the left throttle back with [`);
      } else if (hot.temp < 215 && !this.dialogue.seen('engine.recovered')) {
        this.dialogue.play('engine.recovered', { once: true });
        this.setObjective(OBJECTIVES.evade);
      }
    }

    // Sunset comes up as they get close.
    const duskT = smoothstep(-5200, -1200, z);
    this.weather.setConditions({ dusk: duskT });
    this.detection.rate = this.difficulty.detectRate;

    if (z > -1500) {
      this.dialogue.play('caib.boundary', { once: true });
      this.detection.active = false;
      this.setPhase('home');
    }
    void dt;
  }

  updateHome(dt) {
    void dt;
    const p = this.physics;
    this.weather.setConditions({ dusk: 1, rain: 0.15, crosswind: 2.6 * this.difficulty.crosswind });
    if (!this.flags.truckLit && p.position.z > -900) {
      this.flags.truckLit = true;
      this.airfield.moveTruckToThreshold();
      this.dialogue.play('home.headlights', { delay: 1.2 });
      this.audio.play('switch.click', { volume: 0.6 });
    }
    if (p.position.z > WP.z - 1500 && p.agl < 260) this.setPhase('final');
  }

  updateFinal(dt) {
    void dt;
    const p = this.physics;
    if (p.onGround && p.groundSpeed < 4) {
      this.gradeFinalLanding();
      this.setPhase('shutdown');
    }
    // Landing anywhere that is not the field.
    if (p.onGround && Math.abs(p.position.x - WP.x) > 90) {
      this.gradeFinalLanding();
      this.score.patience = clamp(this.score.patience - 0.25, 0, 1);
      this.setPhase('shutdown');
    }
  }

  updateShutdown(dt) {
    void dt;
    const p = this.physics;
    const hangar = this.airfield.anchors.hangarDoor;
    const d = Math.hypot(p.position.x - hangar.x, p.position.z - hangar.z);
    this.setObjective(`${OBJECTIVES.taxiHome} — ${Math.round(d)} m`);
    if (d < 34 && p.groundSpeed < 1.2) {
      this.setPhase('ending');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Shared flight behaviour                                           */
  /* ---------------------------------------------------------------- */

  updateFlightCommon(dt) {
    const p = this.physics;
    const warn = new Set();

    // Air.
    this.weather.sampleAir(p.position, p.agl, { wind: p.wind, gust: p.gust });
    const rough = p.gust.length();
    this.score.roughAir += Math.max(0, rough - 3) * dt;

    // Warnings and Lou's barks.
    if (p.stallT > 0.35) {
      warn.add('stall');
      this.audio.setStallHorn(true);
      this.dialogue.bark('stall');
    } else {
      this.audio.setStallHorn(p.stallT > 0.2);
    }
    if (p.ias > AC.vne * 0.92) {
      warn.add('overspeed');
      this.dialogue.bark('overspeed');
      this.cameras.addShake(dt * 2);
    }
    if (!p.onGround && p.agl < 70 && p.vspeed < -3) {
      warn.add('terrain');
      this.dialogue.bark('terrain');
    }
    if (this.engines.engines.some((e) => e.temp > 245)) warn.add('hot');
    if (this.cargo.shift > 0.5) {
      warn.add('cargo');
      this.dialogue.bark('cargoShift');
    }
    if (this.score.fuelRemaining < 0.18) warn.add('fuel');
    if (p.damage.gear > 0.3) warn.add('gear');
    if (Math.abs(p.rollDeg) > 45) this.dialogue.bark('banked');
    if (this.detection.active) {
      if (this.detection.state === 'searching') warn.add('patrol');
      if (this.detection.state === 'located') warn.add('located');
    }
    // Runway ahead, on either approach.
    const nearHome = Math.abs(p.position.x - WP.x) < 220 && Math.abs(p.position.z - WP.z) < WP.rwyHalf + 800;
    const nearStrip = Math.abs(p.position.x - EH.x) < 220 && p.position.z < EH.zLow + 500 && p.position.z > EH.zHigh - 200;
    if ((nearHome || nearStrip) && !p.onGround && p.agl < 320) warn.add('runway');
    this.flightHud.setWarnings(warn);

    // Cargo and mass.
    this.cargo.update(dt, {
      gLat: this.lateralG(),
      gLong: p.thrustL + p.thrustR > 0 ? (p.tas - (this._lastTas ?? p.tas)) / Math.max(dt, 1e-3) : 0,
      gLoad: p.gLoad,
      jolt: p.onGround ? clamp(p.suspension.reduce((a, b) => a + b, 0) * 0.3, 0, 1) : 0,
    });
    this._lastTas = p.tas;
    this.cargo.applyTo(p, this.engines.fuel);
    this.score.cargoDamage = 1 - this.cargo.intact;

    // Detection.
    if (this.detection.active || this.detection.patrols.length) {
      this.detection.update(dt, {
        position: p.position,
        velocity: p.velocity,
        inCloud: this.weather.inCloud(p.position),
        stable: Math.abs(p.rollDeg) < 50 && p.stallT < 0.2,
      });
      this.score.patrolPeak = Math.max(this.score.patrolPeak, this.detection.attention);
      this.flightHud.setPatrol(this.detection.state, this.detection.attention);
      if (this.detection.locatedFor > 42) {
        this.fail('The Bureau has photographs now.');
      }
    } else {
      this.flightHud.hidePatrol();
    }

    // Damage accounting.
    this.score.damage = clamp(
      p.damage.wing * 0.5 + p.damage.gear * 0.3 + (p.damage.tireBurst ? 0.2 : 0)
      + (1 - this.engines.engines[0].health) * 0.15 + (1 - this.engines.engines[1].health) * 0.15,
      0, 1,
    );

    // Both engines gone for good is the end of the mission.
    if (this.engines.engines.every((e) => e.dead)) {
      this.fail('Both engines are finished.');
    }
    // Leaving the world.
    if (Math.abs(p.position.x) > 4200 || p.position.z > 3000 || p.position.z < -12500) {
      this.fail('You have left the area the map covers.');
    }
  }

  lateralG() {
    const p = this.physics;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(p.quat);
    return p.velocity.clone().sub(this._prevVel ?? p.velocity).dot(right) * 3;
  }

  /* ---------------------------------------------------------------- */
  /* The optional landing path                                         */
  /* ---------------------------------------------------------------- */

  buildApproachGates() {
    const gates = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x6adfff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
    });
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const z = lerp(EH.zLow + 1500, EH.zLow - 30, t);
      const y = lerp(EH.elevLow + 150, EH.elevLow + 6, t);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(26 - t * 12, 1.1, 6, 20), mat);
      ring.position.set(EH.x, y, z);
      ring.rotation.x = Math.PI / 2;
      gates.add(ring);
    }
    this.scene.add(gates);
    this.approachGates = gates;
  }

  updateApproachGates(p) {
    for (const ring of this.approachGates.children) {
      const d = Math.abs(p.position.z - ring.position.z);
      ring.material.opacity = 0.16;
      ring.visible = d < 2200;
    }
  }

  clearApproachGates() {
    if (!this.approachGates) return;
    this.scene.remove(this.approachGates);
    this.approachGates = null;
  }

  /* ---------------------------------------------------------------- */
  /* Events                                                           */
  /* ---------------------------------------------------------------- */

  onTouchdown(vs, gLoad, wheel) {
    this._touchdowns.push({ vs, gLoad, wheel, t: this.missionTime, phase: this.phase });
    const level = vs < 1.4 ? 'soft' : vs < 3 ? 'normal' : vs < 5 ? 'hard' : 'very hard';
    this.audio.play(vs > 3.2 ? 'gun.impact' : 'can.set', { volume: clamp(0.3 + vs * 0.12, 0.3, 1) });
    this.cameras.addShake(clamp(vs * 0.12, 0.05, 1.2));
    if (vs > 4.2) {
      this.dialogue.bark('gearHard', { force: true });
      this.score.patience = clamp(this.score.patience - 0.12, 0, 1);
    }
    void level;
    void gLoad;
    void wheel;
  }

  onImpact(severity, what) {
    if (severity <= 0) return;
    const p = this.physics;
    if (severity > 2.4) {
      p.damage.wing = clamp(p.damage.wing + severity * 0.06, 0, 1);
      this.cameras.addShake(0.6);
      this.audio.play('gun.impact', { volume: 0.7 });
    }
    if (severity > 6.5 || p.damage.wing >= 1) {
      this.fail(what === 'terrain' ? 'You flew it into the ground.' : 'The aeroplane is finished.');
    }
  }

  onEngineEvent(name, i) {
    switch (name) {
      case 'starter':
        this.audio.play('pc.boot', { volume: 0.4 });
        break;
      case 'catch':
        this.audio.play('can.crack', { volume: 0.8 });
        this.cameras.addShake(0.35);
        if (i === 0) this.dialogue.play('start.leftRunning', { once: true });
        else {
          this.dialogue.play('start.rightCatch', { once: true });
          // The backfire that clears the hangar roof.
          scatterCrows(this.airfield.crows);
          this.audio.play('gun.shot', { volume: 0.5, delay: 0.05 });
        }
        break;
      case 'balk':
        this.dialogue.play('start.rightBalk', { once: true });
        this.audio.play('gun.dry', { volume: 0.5 });
        break;
      case 'seize':
        this.audio.play('can.crush', { volume: 0.7 });
        this.cameras.addShake(0.8);
        break;
      case 'failed':
        this.dialogue.bark('stall', { force: true });
        break;
      default:
        break;
    }
  }

  onDetectionState(state) {
    if (state === 'located') {
      this.audio.setPhase('chase');
      this.story?.markDetected();
    } else if (state === 'unnoticed' && this.phase === 'return') this.audio.setPhase('ret');
  }

  /* ---------------------------------------------------------------- */
  /* Grading                                                          */
  /* ---------------------------------------------------------------- */

  gradeTakeoff() {
    const p = this.physics;
    // Straight, unhurried, and not dragged off the ground below flying speed.
    const centreline = clamp(1 - Math.abs(p.position.x - WP.x) / 40, 0, 1);
    const speed = clamp(1 - Math.abs(p.ias * KT - 68) / 40, 0, 1);
    const gentle = clamp(1 - Math.abs(p.pitchDeg - 9) / 18, 0, 1);
    this.score.takeoff = clamp(centreline * 0.4 + speed * 0.3 + gentle * 0.3, 0, 1);
  }

  gradeMountainLanding() {
    this.score.mountainLanding = this.gradeLanding(EH.x, EH.rwyWidth);
    const q = this.score.mountainLanding;
    this.dialogue.play(q > 0.7 ? 'landing.good' : q > 0.38 ? 'landing.rough' : 'landing.bad');
  }

  gradeFinalLanding() {
    this.score.finalLanding = this.gradeLanding(WP.x, WP.rwyWidth);
  }

  /**
   * Sink rate, centreline, and whether anything came off.
   *
   * The centreline tolerance comes from the width of what you landed on rather
   * than being one number for both places. El Hueso is a sixteen-metre shelf of
   * dirt and Whispering Pines is a twenty-two-metre runway, so a fixed figure
   * generous enough for the runway scored a good landing at the strip while the
   * aeroplane was sitting in the weeds beside it.
   *
   * @param {number} halfWidth half the width of the surface, in metres
   */
  gradeLanding(centreX, halfWidth = 11) {
    const p = this.physics;
    const td = this._touchdowns.filter((t) => t.phase === this.phase).pop()
      ?? this._touchdowns[this._touchdowns.length - 1];
    const sink = td ? clamp(1 - (td.vs - 0.6) / 4.2, 0, 1) : 0.4;
    // The centreline is full marks, half a wingspan past the edge is none.
    const off = Math.abs(p.position.x - centreX);
    const line = clamp(1 - off / (halfWidth + AC.span * 0.5), 0, 1);
    const kit = clamp(1 - p.damage.gear - (p.damage.tireBurst ? 0.35 : 0), 0, 1);
    return clamp(sink * 0.5 + line * 0.25 + kit * 0.25, 0, 1);
  }

  /* ---------------------------------------------------------------- */
  /* Lou                                                              */
  /* ---------------------------------------------------------------- */

  updateLou(dt) {
    const p = this.physics;
    // He gets worse as the mission goes on, and worse again in rough air.
    const base = smoothstep(0, 600, this.missionTime) * 0.5 + 0.35;
    const air = clamp(this.score.roughAir / 40, 0, 0.5);
    this.lou.sick = clamp(base + air, 0, 1);
    // Rough handling costs patience, smooth flying earns a little back.
    if (this.flags.inCockpit) {
      const rough = Math.abs(p.gLoad - 1) * 0.4 + Math.abs(p.rollDeg) / 90 * 0.3 + p.stallT * 0.6;
      if (rough > 0.5) this.score.patience = clamp(this.score.patience - dt * 0.02 * rough, 0, 1);
      else this.score.patience = clamp(this.score.patience + dt * 0.004, 0, 1);
    }
    updateFigure(this.lou, dt, this.flags.inCockpit ? this.camera.position : this.player.position);
    if (this.lou.cup) this.lou.cup.visible = !this.flags.louAboard;
  }

  /* ---------------------------------------------------------------- */
  /* Checkpoints                                                      */
  /* ---------------------------------------------------------------- */

  saveCheckpoint(name) {
    this.checkpoint = name;
    /* The campaign save keeps the coarse mission state so a reload resumes at
     * the same place. Cargo is recorded before `returning`, which requires it. */
    if (this.story) {
      if (name === 'departure') this.story.loadCargo();
      const persisted = {
        takeoff: 'airstrip',
        approach: 'remote_strip',
        departure: 'returning',
        return: 'landed_home',
      }[name];
      if (persisted) this.story.checkpoint(persisted);
    }
    this.checkpointData = {
      name,
      position: this.physics.position.clone(),
      heading: this.physics.headingDeg,
      velocity: this.physics.velocity.clone(),
      quat: this.physics.quat.clone(),
      fuel: this.engines.fuel,
      cargo: Object.fromEntries(Object.entries(this.cargo.zones).map(([k, z]) => [k, {
        loaded: !!z.crate, strapped: z.strapped,
      }])),
      dusk: this.weather.dusk,
      damage: { ...this.physics.damage },
      score: { ...this.score },
      louAboard: this.flags.louAboard,
    };
    this.flightHud.showCheckpoint(`CHECKPOINT — ${name.toUpperCase()}`);
    setTimeout(() => this.flightHud.hideCheckpoint(), 2200);
  }

  /**
   * Put the player back at the last checkpoint. `soft` keeps the score and the
   * dialogue history — it is used for running off the end of the runway, which
   * is embarrassing rather than fatal.
   */
  restoreCheckpoint(name = this.checkpoint, { soft = false } = {}) {
    const data = this.checkpointData?.name === name ? this.checkpointData : null;
    this.failed = null;
    this.dialogue.clear();
    this.input.clear();
    this.detection.clear();
    this.flightHud.hideComplete();
    this._touchdowns.length = 0;

    const setup = {
      takeoff: () => {
        const a = this.airfield.anchors.lineUp;
        this.physics.setPose(new THREE.Vector3(a.x, WP.elev + AC.gearY, a.z), WP.heading, 0);
        this.engines.forceRunning();
        this.input.throttle = 0;
        this.input.flaps = 0;
        this.physics.controls.parkingBrake = false;
        this.weather.setConditions({ dusk: 0, rain: 0, turbulence: 0.22, cloudDensity: 0.35 });
        this.audio.setPhase('takeoff');
        this.flags.rotateCalled = false;
        this.flags.clearCalled = false;
        this.setPhase('lineup');
      },
      approach: () => {
        const z = EH.zLow + 2600;
        const y = EH.elevLow + 420;
        this.physics.setPose(new THREE.Vector3(EH.x - 40, y, z), 178, 62);
        this.engines.forceRunning();
        this.input.throttle = 0.55;
        this.input.flaps = 0.5;
        this.physics.controls.parkingBrake = false;
        this.weather.setConditions({ dusk: 0, rain: 0, turbulence: 0.62, cloudDensity: 0.55 });
        this.audio.setPhase('approach');
        this.flags.approachCalls = 0;
        this.dialogue.forget('approach.valley', 'approach.high', 'approach.high2', 'approach.high3');
        this.setPhase('approach');
      },
      departure: () => {
        const a = this.airstrip.anchors.departStart;
        this.physics.setPose(new THREE.Vector3(a.x, a.y + AC.gearY, a.z), EH.zHigh ? 0 : 0, 0);
        this.engines.forceRunning();
        this.input.throttle = 0;
        this.input.flaps = 0.5;
        this.physics.controls.parkingBrake = false;
        // The crates are aboard and strapped, wherever they were put.
        this.restoreCargo(data?.cargo);
        this.weather.setConditions({ dusk: 0.15, rain: 0.1, turbulence: 0.7, cloudDensity: 0.7 });
        this.detection.deploy(EH.zHigh);
        this.audio.setPhase('ret');
        this.setPhase('heavyTakeoff');
      },
      return: () => {
        const z = WP.z - 2400;
        this.physics.setPose(new THREE.Vector3(WP.x + 120, WP.elev + 520, z), 2, 58);
        this.engines.forceRunning();
        this.input.throttle = 0.5;
        this.input.flaps = 0;
        this.physics.controls.parkingBrake = false;
        this.restoreCargo(data?.cargo);
        this.weather.setConditions({ dusk: 1, rain: 0.15, turbulence: 0.5, cloudDensity: 0.6, crosswind: 2.6 * this.difficulty.crosswind });
        this.airfield.moveTruckToThreshold();
        this.audio.setPhase('silent');
        this.setPhase('home');
      },
    };

    if (!soft) {
      // Roll the score back to what it was at the checkpoint, so a restart is
      // not a way to launder a bad landing.
      if (data?.score) Object.assign(this.score, data.score);
      this.physics.damage.wing = data?.damage?.wing ?? 0;
      this.physics.damage.gear = data?.damage?.gear ?? 0;
      this.physics.damage.tireBurst = data?.damage?.tireBurst ?? false;
      this.engines.reset(false);
      this.engines.fuel = data?.fuel ?? this.engines.fuel;
    }

    // Put Lou back in the right seat, wherever he was.
    if (!this.flags.louAboard) {
      this.aircraft.group.add(this.lou.group);
      this.lou.group.position.copy(this.aircraft.copilotSeat);
      this.lou.group.rotation.set(0, 0, 0);
      setPose(this.lou, 'sit');
      this.flags.louAboard = true;
    }
    this.flags.inCockpit = true;
    this.player.enabled = false;
    this.player.mode = 'frozen';
    this.interaction.setPaused(true);
    this.cameras.setView(this.cameras.view);
    this.audio.setHeadset(true);
    this.dialogue.setHeadset(true);
    this.input.rudderKeys = true;

    (setup[name] || setup.takeoff)();
    this.terrain.prime(this.physics.position.x, this.physics.position.z);
    this.aircraft.syncTo(this.physics);
  }

  restoreCargo(saved) {
    // Rebuild the load from the checkpoint. The crates themselves are the ones
    // the player carried; if the sequence was never played they are minted.
    if (!this.jerkyLoad) this.startLoading();
    const order = ['forward', 'centre', 'rear'];
    let i = 0;
    for (const name of order) {
      const want = saved?.[name]?.loaded ?? true;
      const zone = this.cargo.zones[name];
      if (want && !zone.crate) {
        const crate = this.jerkyLoad.crates[i] || this.jerkyLoad.crates[0];
        if (crate) {
          this.cargo.load(name, crate);
          this.cargo.strap(name);
        }
      } else if (want && zone.crate && !zone.strapped) {
        this.cargo.strap(name);
      }
      i++;
    }
    this.jerkyLoad.doorOpen = false;
    this.jerkyLoad.doorLatched = true;
    this.jerkyLoad.disarm();
    this.gunLoad?.disarm();
  }

  /* ---------------------------------------------------------------- */
  /* Failure and the end                                              */
  /* ---------------------------------------------------------------- */

  fail(reason) {
    if (this.failed || this.finished) return;
    this.failed = reason;
    this.audio.setPhase('silent');
    this.audio.setStallHorn(false);
    this.dialogue.clear();
    this.hud.say(`<em>${reason}</em> Press <b>R</b> to restart from the ${this.checkpoint} checkpoint.`, 12000);
    this.flightHud.showCheckpoint('PRESS R TO RESTART');
  }

  runEnding() {
    this.finished = true;
    this.setObjective('');
    this.audio.setPhase('silent');
    this.audio.setStallHorn(false);
    // Durable completion first, so the end card never promises a save that
    // did not happen. The rank is the persisted landing quality.
    if (this.story && !this.story.complete({ landingQuality: this.report().rank })) {
      console.warn('[beefrun] mission completion could not be recorded');
    }
    // Squatch associates come out of the shadows and unload the crates.
    const hangar = this.airfield.anchors.hangarDoor;
    for (let i = 0; i < 4; i++) {
      const f = makeAssociate(i);
      f.group.position.set(hangar.x - 6 + i * 3.2, WP.elev, hangar.z - 4 - (i % 2) * 2);
      f.group.rotation.y = Math.PI;
      setPose(f, i < 2 ? 'carry' : 'idle');
      this.scene.add(f.group);
      this.associates.push(f);
    }
    this.dialogue.play('end.bucket', { delay: 2.2 });
    setTimeout(() => this.dialogue.play('end.bite'), 9000);
    setTimeout(() => this.dialogue.play('end.envelope'), 14000);
    setTimeout(() => {
      this.audio.sting();
      this.flightHud.showComplete(this.report());
    }, 19000);
  }

  /** The end card's contents. */
  report() {
    const s = this.score;
    const pct = (v) => `${Math.round(clamp(v, 0, 1) * 100)}%`;
    const grade = (v) => (v > 0.75 ? 'good' : v > 0.45 ? 'ok' : 'bad');
    const mins = Math.floor(s.flightTime / 60);
    const secs = Math.round(s.flightTime % 60);

    const stats = [
      { label: 'Takeoff quality', value: pct(s.takeoff ?? 0), grade: grade(s.takeoff ?? 0) },
      { label: 'Mountain landing', value: pct(s.mountainLanding ?? 0), grade: grade(s.mountainLanding ?? 0) },
      { label: 'Final landing', value: pct(s.finalLanding ?? 0), grade: grade(s.finalLanding ?? 0) },
      { label: 'Cargo damage', value: pct(s.cargoDamage), grade: grade(1 - s.cargoDamage) },
      { label: 'Patrol attention', value: pct(s.patrolPeak), grade: grade(1 - s.patrolPeak) },
      {
        label: 'Lowest safe clearance',
        value: Number.isFinite(s.lowestClearance) ? `${Math.round(s.lowestClearance * FT)} ft` : '—',
        grade: s.lowestClearance > 60 ? 'good' : s.lowestClearance > 25 ? 'ok' : 'bad',
      },
      { label: 'Flight time', value: `${mins}:${String(secs).padStart(2, '0')}` },
      { label: 'Fuel remaining', value: pct(s.fuelRemaining), grade: grade(s.fuelRemaining) },
      { label: 'Jerky delivered', value: `${this.cargo.packagesDelivered} packages` },
      {
        label: 'Stove’s consignment',
        value: s.gunsDelivered ? `${s.gunsDelivered}/3 crates` : 'not delivered',
        grade: s.gunsDelivered >= 3 ? 'good' : 'bad',
      },
      { label: 'Aircraft damage', value: pct(s.damage), grade: grade(1 - s.damage) },
      { label: 'Lou’s remaining patience', value: pct(s.patience), grade: grade(s.patience) },
    ];

    // The overall number, weighted toward the two landings, because they are
    // the mission.
    const total = clamp(
      (s.takeoff ?? 0) * 0.12
      + (s.mountainLanding ?? 0) * 0.26
      + (s.finalLanding ?? 0) * 0.22
      + (1 - s.cargoDamage) * 0.12
      + (1 - s.patrolPeak) * 0.12
      + (1 - s.damage) * 0.08
      + s.patience * 0.05
      + (s.gunsDelivered >= 3 ? 0.03 : 0),
      0, 1,
    );
    const ranks = [
      'Gas Station Amateur', 'Cargo Curious', 'Certified Meat Aviator',
      'Airborne Butcher', 'Silverback Smuggler',
    ];
    const tier = total > 0.88 ? 4 : total > 0.72 ? 3 : total > 0.54 ? 2 : total > 0.34 ? 1 : 0;

    const unlocks = [
      'Squatch Prospect Flight Jacket',
      'Old Stove’s business card (blank)',
      'Silverback Reserve Dashboard Ornament',
      'Brushrunner Aircraft Access',
      'El Hueso Airstrip in Free Flight',
      '“World’s Okayest Pilot” Coffee Cup',
    ];

    return { stats, rank: ranks[tier], tier, total, unlocks };
  }

  /* ---------------------------------------------------------------- */

  /** Player pressed R. */
  requestRestart() {
    if (this.finished) return;
    this.restoreCheckpoint(this.checkpoint);
  }

  get checkpointList() { return CHECKPOINT_ORDER; }
}

export { CHECKPOINT_ORDER };
