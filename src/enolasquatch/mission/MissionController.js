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
 * 2026-08-04 — THE OPENING IS NOW A WALKAROUND. This file used to say that no
 * on-foot walkaround/boarding system existed and that `preflight` therefore
 * played out entirely from the left seat, firing its banter off phase-time
 * thresholds. The owner asked for the Beef Run's precheck instead ("I want the
 * scene to start with basically the same precheck outside of it. We can use
 * this to have the dialogue with all the other characters that actually need
 * to be there"), so:
 *
 *   `walkaround` — new opening phase. Tony is on foot on the apron with the
 *      four crew standing round the aeroplane. `../preflight.js` owns the six
 *      checks and fires the `preflight.*` beats off the parts they are about.
 *      Ends at the crew door: `armBoardingTarget()` -> `enterCockpit()`.
 *   `preflight` — unchanged in what it gates on (battery, fuel selectors, all
 *      four engines, parking brake) and now genuinely the start-up phase it
 *      always described itself as. It keeps a fallback copy of the four banter
 *      beats for any route that arrives in the seat without the walk.
 *
 * Additional `ctx` entries that go with it, all optional — omit them and the
 * mission behaves exactly as it did before, starting in `preflight`:
 *   preflight (`../preflight.js`'s EnolaPreflight), crew (`../crew.js`),
 *   player, interaction (`src/core`'s Player / InteractionSystem),
 *   city (`../scenes/TargetCity.js`, so the detonation has something to take
 *   away), and `onCrater(crater)` — a callback the composition root uses to
 *   fold the new hole into its own ground-height function.
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
  ENOLA_PARKING,
} from '../config.js';
import { OBJECTIVES, RELEASE_LINES, releaseCueOf } from '../dialogue/script.js';
import { Defense } from '../combat/Defense.js';
import { Targeting } from '../combat/Targeting.js';
import { Interceptors } from '../combat/Interceptors.js';
import { Autopilot } from '../systems/Autopilot.js';
import { GunnerStation } from '../systems/GunnerStation.js';
import { Detonation, BLAST } from '../vfx/Detonation.js';
import { WP, KT, FT } from '../../beefrun/config.js';
import { evaluateLineupGate } from '../../beefrun/lineup-gate.js';
import { clamp, lerp, headingDelta, unlit } from '../../beefrun/util.js';

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

export class MissionController {
  constructor(ctx) {
    Object.assign(this, ctx);
    /* See the class header for the full expected shape of `ctx`. */

    const groundAt = (x, z) => (this.getHeight ? this.getHeight(x, z) : approxGroundHeight(x));
    this.defense = this.defense || new Defense(this.scene, { getHeight: groundAt });
    this.targeting = this.targeting || new Targeting({ target: COMPOUND, corridorHeading: TURN_POINT.newHeading });

    /* The air threat, the box that flies for you, the gun you fly it to work,
     * and the thing at the end of it. All four are new in the 2026-08-04
     * escalation pass; see each file's own header for what it is for. */
    this.interceptors = this.interceptors || new Interceptors(this.scene, { getHeight: groundAt });
    this.autopilot = this.autopilot || new Autopilot({ physics: this.physics, engines: this.engines });
    this.gunner = this.gunner || new GunnerStation({
      aircraft: this.aircraft, interceptors: this.interceptors,
    });
    this.detonation = this.detonation || new Detonation(this.scene, {
      camera: this.camera,
      // The blast wave knocks the surviving outskirts down as it reaches them,
      // rather than the whole city vanishing on the frame of the flash.
      onShockFront: (r) => this.city?.advanceShock?.(r),
    });

    this.phase = 'idle';
    this.phaseTime = 0;
    this.missionTime = 0;
    this.objective = '';
    this.failed = null;
    this.finished = false;
    this.paused = false;
    this.payloadReleased = false;
    this.bombBayOpen = false;

    /* On foot vs. in the seat. `inCockpit` is false only during the opening
     * walkaround; every checkpoint restore is airborne or on the runway and
     * puts it back to true. Named the same as Beef Run's own flag
     * (`src/beefrun/mission.js`, `flags.inCockpit`) because the composition
     * root branches on it in exactly the same way. */
    this.inCockpit = true;
    this.boardTarget = null;

    /* The nightfall cut — see `enterNightfall()`. Plain data the composition
     * root reads to draw its fade/caption; null outside the `nightfall` phase
     * so `../main.js` can treat "no cutscene" and "cutscene finished" the
     * same way. */
    this.cutscene = null;
    this.nightfallStaged = false;
    this._idleT = 0;
    this._idleWhere = null;
    this._boardNudgeT = 0;

    /* The rear gun. `gunFiring` is what `EnolaSquatch.updateRearGun()` reads;
     * `gunAim` is the world point it swings onto. Either the Shubenator is
     * working it (the mission drives these) or the player is (`this.gunner`
     * drives them) — never both, see `updateRearGunner()`. */
    this.gunFiring = false;
    this.gunAim = new THREE.Vector3();
    this._gunBurst = 0;
    this._gunRest = 0;
    /** Counts down between rounds of the Shubenator's burst — see `updateRearGunner()`. */
    this._gunSoundT = 0;

    /* The blast, as the rest of the page sees it. `blastFlash` is the 0..1
     * whiteout `../main.js` paints over the whole screen; `blastTint` is the
     * colour it cools through as the eye comes back. */
    this.blastFlash = 0;
    this.blastTint = { r: 1, g: 1, b: 1 };
    this._shockArrived = false;
    this._blastSoundFired = false;

    /* How hard the aeroplane is being thrown about this frame, 0..1. Computed
     * once and handed to BOTH the flak and the fighters, so evading means the
     * same thing to everything shooting at you. */
    this.evasion = 0;
    this._prevRoll = 0;

    /* An instruction waiting for a gap in the dialogue — see
     * `armCombatInstruction()` and the tone doctrine it exists to obey. */
    this._pendingInstruction = null;

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
      fightersDestroyed: 0,    // how many the tail gun took down
      fighterPasses: 0,        // how many were pressed home against you
      flakBursts: 0,
      autopilotSeconds: 0,     // how long nobody was flying
      gunnerSeconds: 0,        // how long the player was in the tail
      blastDistance: null,     // how far clear you were when it went off
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

    /* Flak, refined (owner: "the flak coming from the ground is bad ass. Let's
     * really refine that"). The burst hands over its REAL distance, so the
     * shake, the sound and the consequence are all functions of how close it
     * was rather than of a flag. */
    this.defense.onFlakBurst = (distance, point, severity) => {
      this.score.flakBursts++;
      this.cameras?.addShake?.(severity * severity * 1.5);
      this.audio?.flakBurst?.(distance, severity);
      if (distance < 60) this.dialogue.bark('flakClose');
      void point;
    };
    this.defense.onShrapnel = (distance) => {
      this.audio?.shrapnel?.(clamp(1 - distance / 95, 0, 1));
      this.physics.damage.wing = clamp(this.physics.damage.wing + 0.012, 0, 1);
      // Losing the autopilot to a near miss is the point of having one.
      if (this.autopilot.engaged && Math.random() < 0.28) {
        this.autopilot.disengage('shrapnel');
      }
    };

    /* The fighters. Everything they do to the aeroplane goes through the
     * ground defence's own damage model — see `Interceptors.js`'s header. */
    this.interceptors.onFirstContact = () => {
      this.dialogue.play('fighters.first', { urgent: true });
      /* THE HUD FOLLOWS THE CHARACTER, IT DOES NOT TALK OVER HIM.
       * `docs/TONE-AND-PARODY.md`: the character speaks first and the screen
       * clarifies afterwards, never both on the same frame. So the two keys
       * that make the whole autopilot/tail-gun trade possible are armed here
       * and only reach the glass once Sasole has finished explaining what has
       * just turned up. */
      this.armCombatInstruction(
        '<em>P</em> — hand her to the gyro. <em>T</em> — take the tail gun. '
        + 'Mouse to traverse, left button to fire. Nobody is flying while you are back there.',
        11000,
      );
    };
    this.interceptors.onCallout = (kind) => {
      this.score.fighterPasses++;
      this.dialogue.bark(kind === 'again' ? 'fighterAgain' : 'fighterCommitting');
    };
    this.interceptors.onNearMiss = () => {
      this.cameras?.addShake?.(0.18);
      this.dialogue.bark('fighterNearMiss');
    };
    this.interceptors.onHit = (severity) => this.onFighterHit(severity);
    this.interceptors.onKill = () => {
      this.score.fightersDestroyed++;
      this.dialogue.play('fighters.down', { once: false });
    };

    /* The autopilot, and what it costs. */
    this.autopilot.onEngage = () => this.dialogue.play('auto.on', { once: true });
    this.autopilot.onDisengage = (reason) => {
      if (reason) this.dialogue.play('auto.kicked', { urgent: true });
      else this.dialogue.play('auto.off', { once: true });
      this.interceptors.setPredictability(0);
    };

    /* The player's gun.
     *
     * Owner playtest, 2026-08-04: "better bigger machine guns sounds for the
     * rear gun." This was firing `gun.shot` — the apartment's revolver — at
     * eleven rounds a second. `enolasquatch.gun.rear` is a twin heavy aircraft
     * gun heard from inside the turret (see the case at the end of the cue
     * switch in `src/core/audio.js` for what is in it), and the rate is high
     * enough that the volume comes down and a little rate jitter goes in, or
     * eleven identical hits a second turn into a buzz rather than a gun. */
    this.gunner.onShot = () => this.audio?.play?.('enolasquatch.gun.rear', {
      volume: 0.5, rate: 0.94 + Math.random() * 0.12,
    });
    this.gunner.onJam = () => this.dialogue.bark('gunJam');
    this.gunner.onDry = () => this.dialogue.play('gun.dry', { once: true });

    this.payload.onImpact = (point) => this.onPayloadImpact(point);
  }

  /* ---------------------------------------------------------------- */
  /* The gun and the box that flies for you                            */
  /* ---------------------------------------------------------------- */

  /**
   * Take or hand back the aeroplane.
   *
   * The autopilot refuses on the ground, in a stall, out of the envelope, and
   * during its own lockout — see `../systems/Autopilot.js`. A refusal is not
   * silent: Sasole says why, because a key that does nothing reads as a bug.
   *
   * @returns {boolean} whether the autopilot is now flying
   */
  toggleAutopilot() {
    if (this.autopilot.engaged) {
      // Coming back to the seat means coming off the gun.
      if (this.gunner.manned) this.leaveGun();
      this.autopilot.disengage(null);
      return false;
    }
    const took = this.autopilot.engage({});
    if (!took) {
      this.dialogue.bark('autoRefused');
      this.hud?.say?.('<em>Not from here.</em> Wings level, out of the stall, and above the deck first.', 3200);
    }
    return took;
  }

  /**
   * Climb into the tail, or come forward again.
   *
   * The gun is only worth manning when somebody else is flying, so taking it
   * engages the autopilot if it is not already on — and if the autopilot will
   * not take the aeroplane, neither will this, because an unattended bomber
   * with nobody in either seat is not a mechanic, it is a crash with a delay.
   *
   * @returns {boolean} whether the player is now on the gun
   */
  toggleGun() {
    if (this.gunner.manned) { this.leaveGun(); return false; }
    /* A REFUSAL HAS TO SAY SO (owner playtest, 2026-08-04: "not sure if P and
     * T for tail gun work").
     *
     * They work — driven as real key events in a browser, P engages and
     * disengages the autopilot and T takes and gives back the gun. What they
     * did not do was ANSWER. `toggleAutopilot()` already put its refusal on
     * the glass; this one refused with a bark alone, and a bark is a pooled
     * line on a cooldown that is very often dropped. So on the ground, or
     * anywhere the autopilot will not take the aeroplane, T did nothing
     * visible at all — and `../main.js` then toasted "BACK IN THE SEAT" over
     * the top of it, which says the opposite of what happened. Both halves are
     * fixed: the reason is said here, and the toast is only raised on a real
     * change of state there. */
    if (this.physics.onGround) {
      this.dialogue.bark('gunRefused');
      this.hud?.say?.('<em>Not on the ground.</em> The tail gun is for when somebody else can fly her.', 3200);
      return false;
    }
    if (!this.autopilot.engaged && !this.autopilot.engage({})) {
      this.dialogue.bark('autoRefused');
      this.hud?.say?.('<em>Not from here.</em> Nobody can leave the seat until the gyro will hold her — wings level, out of the stall, above the deck.', 3600);
      return false;
    }
    this.gunner.take();
    this.gunFiring = false;
    this.dialogue.play('gun.take', { once: true });
    this.cameras?.setView?.('cockpit');
    return true;
  }

  /**
   * Hang a Fat Squatch back on the mount.
   *
   * THE UNWINNABLE RESTART — owner playtest, 2026-08-04: "I had to restart
   * after I dropped the bomb and the area was already dentonated and the bomb
   * was gone."
   *
   * Exactly that. Restoring the `preRelease` checkpoint after a drop reset the
   * MISSION's `payloadReleased` flag but never the PAYLOAD: `FatSquatch` was
   * still detached in the scene, still `released`, still `impacted`, and
   * `release()` is a deliberate one-way door. So the second attempt ran the
   * whole release sequence, `payload.release()` returned on its first line,
   * nothing fell, `onPayloadImpact` never fired, and `updateExplosion` sat in
   * its "still falling" branch for the rest of the session with an empty bay
   * over a target that already had a crater in it. No way forward, no way
   * back, and no bomb.
   *
   * `rearmPayload()` is the one call that makes it recoverable. It puts the
   * prop back on `payloadMount`, clears the fall state and the straps, and
   * resets this controller's own release bookkeeping so the beat can run
   * again from the top. Called from `restoreCheckpoint()` whenever the state
   * being restored still has the bomb aboard, and defensively from the
   * release itself so that no route can reach the drop with an empty mount.
   *
   * The target being already flattened is fine and is left alone: the crater
   * stays, `TargetCity.destroy()` is a no-op the second time, and
   * `onPayloadImpact` fires a fresh detonation because `restoreCheckpoint`
   * clears `explosionPoint`. You get to drop it again on what is left.
   *
   * @returns {boolean} whether a bomb actually had to be put back
   */
  rearmPayload() {
    const mount = this.aircraft?.anchors?.payloadMount ?? null;
    const wasGone = this.payload.rearm(mount);
    this.payloadReleased = false;
    this.explosionPoint = null;
    this._releaseStep = null;
    this._releaseTimer = 0;
    this._fallSeconds = 0;
    this.bombBayOpen = false;
    return wasGone;
  }

  leaveGun() {
    if (!this.gunner.manned) return false;
    this.gunner.leave();
    this.gunFiring = false;
    this.dialogue.play('gun.leave', { once: true });
    return true;
  }

  /**
   * Queue a HUD instruction to be shown once the crew have stopped talking.
   *
   * `docs/TONE-AND-PARODY.md`, the owner's rule: "the character speaks first
   * and the screen clarifies afterwards — never both at once, and never the
   * screen instead." `sayThenInstruct` in `src/silvercase/main.js` is the
   * shape; this is the same idea for a scene whose dialogue is a queue rather
   * than a callback chain, so it waits on `dialogue.busy` going false instead
   * of on an `onDone`.
   */
  armCombatInstruction(html, ms = 9000) {
    this._pendingInstruction = { html, ms };
  }

  _drainInstruction() {
    if (!this._pendingInstruction || this.dialogue.busy) return;
    const { html, ms } = this._pendingInstruction;
    this._pendingInstruction = null;
    this.hud?.say?.(html, ms);
  }

  /** A fighter's round connected. */
  onFighterHit(severity) {
    this.cameras?.addShake?.(0.35 + severity * 0.5);
    this.audio?.shrapnel?.(severity);
    this.physics.damage.wing = clamp(this.physics.damage.wing + severity * 0.05, 0, 1);
    if (Math.random() < 0.34 * severity) {
      const alive = this.defense.damage.engines.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
      if (alive.length) this.defense.damageEngine(alive[Math.floor(Math.random() * alive.length)]);
      else this.defense.damageElectrical();
    }
    if (this.autopilot.engaged && Math.random() < 0.45) this.autopilot.disengage('hit');
    this.dialogue.bark('fighterHitUs');
  }

  /* ---------------------------------------------------------------- */
  /* Setup                                                             */
  /* ---------------------------------------------------------------- */

  begin() {
    /* Parked on the open south apron rather than at `airfield.anchors.parking`
     * — that anchor was measured for the Brushrunner's 17.2 m span and stands
     * a 33.5 m wing inside the hangar's collider. See `ENOLA_PARKING`'s own
     * comment in ../config.js. */
    const park = ENOLA_PARKING;
    const elev = this.getHeight ? this.getHeight(park.x, park.z) : WP.elev;
    this.physics.setPose(new THREE.Vector3(park.x, elev + AC_ENOLA.gearY, park.z), park.heading, 0);
    this.physics.controls.parkingBrake = true;
    this.physics.mass = enolaMass(this.engines.fuel, false);
    this.aircraft.syncTo(this.physics);

    this.weather.setConditions({ turbulence: 0.2, crosswind: 0.3, rain: 0, cloudDensity: 0.3, dusk: 0.55, night: 0.15, lightning: 0 });
    this.audio?.setPhase?.('airport');

    /* The bay hangs open on the apron so the Fat Squatch is visible — and
     * stand-under-able — for the whole walkaround. It is closed again the
     * moment anybody gets in. */
    if (this.preflight && this.player) {
      this.bombBayOpen = true;
      this.crew?.standOnApron?.(this.scene, { ...park, elev });

      /* Tony starts off the aeroplane's port quarter, far enough back that the
       * whole thing is in frame on the first look — which matters more on this
       * airframe than it did on the Brushrunner, because it is 33.5 m across
       * and the joke of the scene is partly its size. */
      const start = park.playerStart;
      const startY = this.getHeight ? this.getHeight(start.x, start.z) : elev;
      this.player.position.set(start.x, startY + 1.66, start.z);
      this.player.ground = startY;
      this.player.pitch = 0;
      this.player.yaw = Math.atan2(start.x - park.x, start.z - park.z);
      this.player.mode = 'walk';
      this.player.enabled = true;
      this.player.velocity?.set?.(0, 0, 0);
      this.interaction?.setPaused?.(false);
      this.input.rudderKeys = false;   // E is the interact key out here

      this.setPhase('walkaround');
    } else {
      this.crew?.takeSeats?.(this.aircraft);
      this.setPhase('preflight');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Boarding                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Put the "get in" prompt on the crew door.
   *
   * The hit box hangs off `aircraft.anchors.crewDoor`, which is a child of the
   * aeroplane group, so it rides the aeroplane instead of being a box floating
   * over a patch of apron. Same idiom as Beef Run's `armBoardingTarget()`.
   *
   * 2026-08-04 — THE BOARDING BLOCKER. Owner playtest: "No way to board
   * aircraft after precheck... the walkaround completes and the player is
   * stranded." Measured in a browser, the interaction itself was never broken:
   * the target armed on the last check and boarded correctly from a pose 1.8 m
   * off the door, which is how it passed verification. What was broken is
   * everything that leads a player to that pose. Three things are fixed here,
   * and a fourth in `../preflight.js`:
   *
   *   1. THE MARKER. `preflight.pointAtBoarding(hit)` — the same pulsing ring
   *      and tarmac footprint that guided all six checks now stands on the
   *      crew door instead of vanishing the instant the walk finishes. This is
   *      the actual fix; see the `boardAnchor` note in `../preflight.js`.
   *   2. THE HIT BOX. It was 1.6 x 2.4 x 1.8 centred on the door itself, so
   *      the useful stand-off was about a metre and the approach arc was
   *      narrow. `InteractionSystem`'s ray is a fixed 2.7 m from the eye and
   *      cannot be lengthened for one target, but the ray hits the box's
   *      SURFACE — so a box that reaches further out from the fuselage buys
   *      real stand-off. 3.4 x 3.0 x 3.4, pushed 0.7 m outboard and dropped
   *      0.35 m, covers the door, the sill and the boarding ladder, and gives
   *      roughly 2.2 m of usable stand-off from anywhere on the port quarter.
   *   3. THE PROMPT TEXT names the door, so the HUD line matches the objective
   *      line and Sasole's nudge instead of being a third phrasing.
   */
  armBoardingTarget() {
    if (this.boardTarget || !this.interaction) return;
    const anchor = this.aircraft.anchors.crewDoor;
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 3.0, 3.4),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    // Outboard along the aeroplane's own -X (the door's side), and down, so a
    // man standing on the tarmac looking level walks into it rather than under
    // it. `anchor` is already 0.6 m proud of the skin; this adds the rest.
    hit.position.set(anchor.x - 0.7, anchor.y - 0.35, anchor.z);
    hit.name = 'enola-board';
    this.aircraft.group.add(hit);
    this.boardTarget = hit;
    this.interaction.register(hit, {
      label: () => 'Climb aboard — <b>crew door</b>',
      key: 'E',
      onLook: () => this.dialogue.play('preflight.board', { once: true }),
      onUse: () => this.enterCockpit(),
    });
    // The guidance marker follows the player to the door. Without this the
    // walk's only wayfinding switches off at the moment it is needed.
    this.preflight?.pointAtBoarding?.(hit);
    this._boardNudgeT = 0;
  }

  disarmBoardingTarget() {
    if (!this.boardTarget) return;
    this.interaction?.unregister?.(this.boardTarget);
    this.boardTarget.parent?.remove(this.boardTarget);
    this.boardTarget = null;
    this.preflight?.pointAtBoarding?.(null);
  }

  /**
   * How far the player is standing from the crew door, in metres, or null when
   * there is no door to walk to. Drives the objective readout during the
   * boarding step the same way `updateTaxi()` counts down to the hold point.
   */
  boardingDistance() {
    const here = this.player?.position;
    if (!this.boardTarget || !here) return null;
    this.boardTarget.updateWorldMatrix(true, false);
    const e = this.boardTarget.matrixWorld.elements;
    return Math.hypot(here.x - e[12], here.z - e[14]);
  }

  /**
   * Everybody gets in, and the mission becomes the cockpit mission it always
   * was from here on. The crew are reparented into the airframe by
   * `crew.takeSeats()` — see `../crew.js` for why that is a reparent rather
   * than a per-frame follow.
   */
  enterCockpit({ advance = true } = {}) {
    const fromWalkaround = this.phase === 'walkaround';
    this.disarmBoardingTarget();
    this.preflight?.disarm?.();
    this.inCockpit = true;
    this.bombBayOpen = false;
    this.player && (this.player.enabled = false);
    this.player && (this.player.mode = 'frozen');
    this.interaction?.setPaused?.(true);
    this.crew?.takeSeats?.(this.aircraft);
    /* The boarding ladder comes off with the last man up it. It hangs on the
     * sill as a child of the airframe (see `EnolaSquatch.build()`), so leaving
     * it drawn is the same fault as the chocks the owner watched fly to
     * Squatchbourg — a ground fitting riding along at three thousand feet. */
    if (this.aircraft.parts.ladder) this.aircraft.parts.ladder.visible = false;
    this.cameras?.setView?.('cockpit');
    if (this.cameras) { this.cameras.lookYaw = 0; this.cameras.lookPitch = -0.08; }
    this.audio?.setHeadset?.(true);
    this.dialogue.setHeadset(true);
    this.input.rudderKeys = true;
    this.flightHud?.show?.(true);
    // `advance: false` is how the console/verification `go(phase)` helper gets
    // everybody aboard without also forcing the phase back to preflight.
    if (!advance) return;
    /* Boarding off the apron runs the nightfall cut (owner: "maybe a cutscene
     * where it turns to night and we are in the plane on the runway for
     * takeoff"). Any other route into the seat — a checkpoint restore, the
     * console's `go('preflight')` — goes straight to the start sequence,
     * because those routes are already night and already positioned. */
    this.setPhase(fromWalkaround ? 'nightfall' : 'preflight');
  }

  setPhase(name) {
    this.phase = name;
    this.phaseTime = 0;
    this.onEnterPhase(name);
  }

  /**
   * The autopilot's one call into the frame loop.
   *
   * MUST run after `FlightInput.applyTo(physics.controls)` and before
   * `physics.advance(dt)` — it overwrites the three axes and both throttle
   * levers, and if the player's centred stick is written afterwards it simply
   * erases everything the autopilot decided. `../main.js` calls it in exactly
   * that gap; nothing else should call it at all.
   *
   * @returns {boolean} whether the autopilot is flying
   */
  flyControls(dt) {
    if (this.paused || this.finished) return false;
    return this.autopilot.update(dt);
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
      case 'walkaround':
        this.setObjective(OBJECTIVES.WALKAROUND);
        this.inCockpit = false;
        this.flightHud?.show?.(false);
        this.flightHud?.showChecklist?.(true);
        this.audio?.setHeadset?.(false);
        this.dialogue.setHeadset(false);
        this.preflight.arm();
        this.preflight.onComplete = () => {
          /* Order matters. `armBoardingTarget()` is what puts the marker on
           * the crew door, and it must not be able to be skipped by anything
           * `dialogue.play()` might do, so it goes FIRST — a dialogue system
           * that ever throws would otherwise take the only way off the apron
           * with it. */
          this.armBoardingTarget();
          this.dialogue.play('preflight.done', { once: true });
        };
        break;

      case 'nightfall':
        this.enterNightfall();
        break;

      case 'preflight':
        this.setObjective(OBJECTIVES.PREFLIGHT);
        this.inCockpit = true;
        this.flightHud?.show?.(true);
        this.flightHud?.showChecklist?.(true);
        this.audio?.setHeadset?.(true);
        this.dialogue.setHeadset(true);
        /* QUEUED, not timed, when the walk has been done. `preflight.done` and
         * `preflight.board` are about fourteen seconds of dialogue and they are
         * still going when the seat is reached; the old `phaseTime > N &&
         * !dialogue.busy` gate therefore lost the start sequence entirely to
         * anybody brisk about the switches, which is exactly what the
         * verification run caught. Queuing it means it plays after them,
         * whenever that is, and cannot be outrun. */
        if (this.preflight?.complete) {
          this.dialogue.play('preflight.engineStart', { once: true, delay: 1.0 });
        }
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
        this._sawCity = false;
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
        this.setObjective(OBJECTIVES.BLAST);
        this._explosionT = 0;
        break;

      case 'escape':
        this.setObjective(OBJECTIVES.ESCAPE);
        this.gunFiring = false;
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

    // The city's crater glow cools whether or not anybody is looking at it.
    this.city?.update?.(dt);

    /* The detonation is driven from HERE rather than from the `explosion`
     * phase, and that is deliberate: the column takes half a minute to finish
     * going up and the escape has to be flyable while it does. The phase is
     * over long before the shot is. */
    if (this.detonation.live) this.updateDetonation(dt);

    // Any instruction waiting for the crew to stop talking.
    this._drainInstruction();

    switch (this.phase) {
      case 'walkaround': this.updateWalkaround(dt); break;
      case 'nightfall': this.updateNightfall(dt); break;
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

    if (this.flags.enginesEverStarted && !['walkaround', 'nightfall', 'preflight', 'epilogue'].includes(this.phase)) {
      this.updateFlightCommon(dt);
    }
  }

  /* ---- Walkaround ---- */

  /**
   * The opening walkaround. All this method does is drive the guidance and
   * let the crew look at Tony; every beat is fired by `preflight.js` off the
   * part it belongs to, which is the whole point of the change.
   */
  updateWalkaround(dt) {
    const here = this.player?.position ?? this.camera?.position ?? null;
    this.preflight.update(dt, this.physics, this.camera);
    if (here) this.crew?.lookAt?.(here);

    if (this.phaseTime > 1.2) this.dialogue.play('preflight.arrival', { once: true });

    const next = this.preflight.next;
    const step = next && next.need > 1 ? ` (${next.count}/${next.need})` : '';
    if (next) {
      this.setObjective(`${OBJECTIVES.WALKAROUND} — next: ${next.label}${step}`);
      /* Sasole prods a player who has stopped walking. Cooldown-gated in
       * `../dialogue/DialogueSystem.js`, dropped rather than queued if anybody
       * is already talking, so it can never step on a check's own beat. */
      this._idleT = (this._idleT ?? 0) + dt;
      if (here && this._idleWhere) {
        if (Math.hypot(here.x - this._idleWhere.x, here.z - this._idleWhere.z) > 3) {
          this._idleT = 0;
          this._idleWhere = { x: here.x, z: here.z };
        }
      } else if (here) {
        this._idleWhere = { x: here.x, z: here.z };
      }
      if (this._idleT > 18) {
        this._idleT = 0;
        this.dialogue.bark('walkaroundIdle');
      }
    } else {
      /* The boarding step. The distance readout is the same idiom `updateTaxi`
       * uses to count a player down to the hold point, and it exists for the
       * same reason: an objective with no number in it cannot tell you whether
       * you are getting warmer. See `armBoardingTarget()` for the rest of the
       * boarding fix. */
      const d = this.boardingDistance();
      this.setObjective(d === null ? OBJECTIVES.BOARD : `${OBJECTIVES.BOARD} (${Math.ceil(d)} m)`);
      /* Twenty seconds at the boarding step and still not aboard: Sasole says
       * where the door is. QUEUED, not gated on `dialogue.busy` — the same
       * mistake `onEnterPhase('preflight')` already documents for
       * `preflight.engineStart`. `preflight.done` and `preflight.board` are
       * fourteen seconds of dialogue on their own and a player who finished
       * the walk briskly still has a queue behind them, so a `!busy` gate
       * meant the one line that says where the door is could be outrun by the
       * lines complaining that he had not found it. Appending is safe: it
       * plays after whatever is talking, and `once` means never twice. */
      this._boardNudgeT = (this._boardNudgeT ?? 0) + dt;
      if (this._boardNudgeT > 20) {
        this.dialogue.play('preflight.sasole.boardNudge', { once: true });
      }
    }
    this.flightHud?.setChecklist?.(this.preflight.checklist);
  }

  /* ---- Nightfall: the cut from the daylight apron to the night runway ----
   *
   * Owner playtest, 2026-08-04: "its also daytime. Is it going to turn night
   * when we take off after we do the precheck maybe a cutscene where it turns
   * to night and we are in the plane on the runway for takeoff?"
   *
   * It is a night raid that was being flown off a sunlit apron, so this is the
   * cut that fixes it. It runs BETWEEN boarding and the start sequence, and it
   * deliberately does not swallow any phase that already worked: `preflight`
   * (battery, fuel, four engines, brakes) and `taxi` both still run afterwards
   * with every beat and gate they had. What the cut replaces is nothing — the
   * time between the hatch closing and the engines turning, which until now
   * was a jump-cut with the sun still up.
   *
   * Four steps, driven off `phaseTime` in `updateNightfall()`:
   *
   *   0.0  HATCH   hold on the apron, hatch closing, `nightfall.hatch`
   *   2.6  DUSK    the sky runs down — real, interpolated `weather` state, not
   *                a black card. `nightfall.wait` plays over it.
   *   8.6  CUT     one frame of black; the aeroplane is moved to the runway
   *                line-up anchor, the field's lamps are lit
   *   9.4  HOLD    fade up on the runway at night, `nightfall.lineup`
   *  13.4         -> `preflight`
   *
   * `cutscene` is plain data (a fade level and a caption); `../main.js` owns
   * the DOM element that draws it. Same division of labour as `objective`.
   * Skippable — `skipCutscene()` jumps to the end state, because a cutscene
   * you cannot skip is a cutscene you resent on the second attempt. */

  enterNightfall() {
    this.setObjective(OBJECTIVES.NIGHTFALL);
    this.inCockpit = true;
    this.flightHud?.show?.(false);
    this.flightHud?.showChecklist?.(false);
    this.audio?.setPhase?.('airport');
    this.cutscene = { active: true, fade: 0, caption: '', sub: '', skippable: true };
    this.nightfallStaged = false;
    // Where the sky starts from — the apron conditions `begin()` set.
    this._duskFrom = { dusk: this.weather.dusk ?? 0.55, night: this.weather.night ?? 0.15 };
    this.dialogue.play('nightfall.hatch', { once: true, delay: 0.4 });
    this.dialogue.play('nightfall.wait', { once: true, delay: 0.4 });
  }

  /** Put the aeroplane on the runway, at night, with the field lit. */
  stageNightRunway() {
    if (this.nightfallStaged) return;
    this.nightfallStaged = true;
    const a = this.airfield.anchors;
    const elev = this.getHeight ? this.getHeight(a.lineUp.x, a.lineUp.z) : a.lineUp.y;
    this.physics.setPose(
      new THREE.Vector3(a.lineUp.x, elev + AC_ENOLA.gearY, a.lineUp.z),
      a.departHeading,
      0,
    );
    this.physics.controls.parkingBrake = true;
    this.aircraft.syncTo(this.physics);
    this.weather.setConditions({ dusk: 1, night: 1, turbulence: 0.2, crosswind: 0.3, cloudDensity: 0.35 });
    /* Whispering Pines has no runway lights of its own — the locals lay out
     * battery lamps and park the truck across the threshold. Both already
     * exist on the reused airfield for the Beef Run's dusk arrival; a night
     * departure wants exactly the same two things, so this calls them rather
     * than building a second set. */
    this.airfield?.setDusk?.(1);
    this.airfield?.moveTruckToThreshold?.();
    this.airfield?.setTruckLights?.(true);
  }

  /** Jump straight to the end of the cut. Bound to a key by `../main.js`. */
  skipCutscene() {
    if (this.phase !== 'nightfall') return false;
    this.stageNightRunway();
    this.dialogue.clear();
    this.setPhase('preflight');
    return true;
  }

  updateNightfall(dt) {
    void dt;
    const t = this.phaseTime;
    const cs = this.cutscene;
    if (!cs) return;

    // 0 -> 2.6s: still on the apron, hatch shut, nothing has moved yet.
    if (t < 2.6) {
      cs.fade = 0;
      cs.caption = 'WHISPERING PINES';
      cs.sub = 'Hatch closed';
    } else if (t < 8.6) {
      // 2.6 -> 8.6s: the sky actually runs down, live, in front of the player.
      const k = clamp((t - 2.6) / 6, 0, 1);
      const ease = k * k * (3 - 2 * k);
      this.weather.setConditions({
        dusk: lerp(this._duskFrom.dusk, 1, ease),
        night: lerp(this._duskFrom.night, 1, ease),
        cloudDensity: lerp(0.3, 0.35, ease),
      });
      this.airfield?.setDusk?.(ease);
      cs.fade = 0;
      cs.caption = 'WHISPERING PINES';
      cs.sub = 'Waiting for dark';
      // The last second of the run-down dips to black so the reposition is
      // never seen as a teleport.
      if (t > 7.6) cs.fade = clamp((t - 7.6) / 1.0, 0, 1);
    } else if (t < 9.4) {
      // 8.6 -> 9.4s: black. The aeroplane moves here and nowhere else.
      cs.fade = 1;
      cs.caption = '';
      cs.sub = '';
      this.stageNightRunway();
    } else if (t < 13.4) {
      // 9.4 -> 13.4s: fade up, lined up, engines cold, lamps down both edges.
      this.stageNightRunway();
      cs.fade = clamp(1 - (t - 9.4) / 1.4, 0, 1);
      cs.caption = 'RUNWAY 18 — WHISPERING PINES';
      cs.sub = 'The Enola Squatch, lined up and holding';
      this.dialogue.play('nightfall.lineup', { once: true });
    } else {
      cs.active = false;
      cs.fade = 0;
      cs.caption = '';
      cs.sub = '';
      this.setPhase('preflight');
    }
  }

  /* ---- Preflight / taxi / takeoff ---- */

  updatePreflight(dt) {
    void dt;
    const e = this.engines;
    const p = this.physics;
    /* The four banter beats that used to fire off this phase's clock now fire
     * off the walkaround, from the parts they are about (see `../preflight.js`
     * and the note above the `preflight.*` block in `../dialogue/script.js`).
     * What is left in the seat is the start sequence itself — and a safety
     * net, so a player who reached the cockpit some other way (a checkpoint
     * restore, `go('preflight')` from the console, a verification harness)
     * still hears them rather than losing four beats to a route change. */
    const walked = !!this.preflight?.complete;
    if (!walked) {
      if (this.phaseTime > 1.0) this.dialogue.play('preflight.numbskull', { once: true });
      if (this.phaseTime > 5.0) this.dialogue.play('preflight.restraints', { once: true });
      if (this.phaseTime > 9.5) this.dialogue.play('preflight.bombbay', { once: true });
      if (this.phaseTime > 14.5) this.dialogue.play('preflight.shubes.first', { once: true });
    }
    // The walked route queues this on phase entry (see `onEnterPhase`); this
    // is the fallback for a route that never walked.
    if (!walked && this.phaseTime > 20 && !this.dialogue.busy) {
      this.dialogue.play('preflight.engineStart', { once: true });
    }

    // Nobody starts four engines with the chocks still under the wheels.
    if (this.preflight?.chocksIn && this.phaseTime > 4) {
      this.dialogue.play('preflight.chocksStill', { once: true });
    }

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
    /* LEFT AND RIGHT, FROM INSIDE THE COCKPIT.
     *
     * `headingDelta(current, target)` is `target - current`, so a POSITIVE
     * error means the heading has to go UP. This airframe's nose is +Z, which
     * makes the pilot's left +X, and headings count round toward +X — so a
     * rising heading is a LEFT turn. (Confirmed by running the flight model
     * headless: `controls.roll = +1`, which is the A key, raises both `rollDeg`
     * and `headingDeg`.) Irish therefore calls LEFT for a positive error. He
     * called right, which is the same class of mistake as the mirrored Beef Run
     * seats and the same fix: say it from the seat, not from the apron. */
    if (Math.abs(err) > 95) id = 'nav.wrongWay';
    else if (err > 6) id = 'nav.left5';
    else if (err < -6) id = 'nav.right5';
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
      // Shubes, at the back, with nothing to shoot at yet.
      this.updateRearGunner(dt, false);
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

    /* THE FIRST WAVE. Being seen is what scrambles them, which is what makes
     * the stealth corridor worth flying properly: a crew that ducked the
     * ridgeline gets a quiet run and one wave late; a crew that got picked up
     * gets them immediately. The `phaseTime` clause is the floor, so the
     * fighters happen either way and the corridor changes WHEN, not WHETHER —
     * a mechanic that can be skipped entirely is a mechanic that half the
     * players never see. */
    if (!this.interceptors.deployed
      && (this.detection.state === 'located' || this.phaseTime > 34)) {
      this.interceptors.aggression = this.detection.state === 'located' ? 1.15 : 0.85;
      this.scrambleFighters(2, this.detection.state === 'located' ? 5 : 14);
    }
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

  /**
   * The rear gun, worked by the Shubenator.
   *
   * `defense.opening` already existed as a beat and `BARKS.gunnerIdle` /
   * `BARKS.gunnerFiring` already existed as pools; what was missing was a gun.
   * This runs the whole station: while the compound's battery is up he fires
   * bursts of about a second and a half with a beat between them, the turret
   * swings onto whatever is shooting, and the barks fire off the real state
   * rather than off a timer. Outside the defence phase he sweeps the empty
   * sky and occasionally says so.
   *
   * The aim point is the battery on the ground: `Defense.deploy()` was given
   * the target's own position, and the gun is a tail gun, so it can only reach
   * what is already behind the aeroplane — `updateRearGun()` clamps the
   * traverse and the elevation, and out-of-arc aim simply reads as the barrels
   * pressed against their stops, which is correct.
   */
  updateRearGunner(dt, active) {
    const p = this.physics;
    /* One gunner at a time. While the player is back there the Shubenator is
     * out of the way, and `GunnerStation` owns `gunFiring`/`gunAim` instead —
     * see `updateAirBattle()`. Two of them on one gun doubles the rate of fire
     * and halves the tension. */
    if (this.gunner.manned) return;
    if (!active) {
      this.gunFiring = false;
      this._gunBurst = 0;
      // Idle chatter from the back, on the pool's own long cooldown.
      if (!p.onGround && this.flags.enginesEverStarted) this.dialogue.bark('gunnerIdle');
      return;
    }
    /* Whatever is closest and actually pressing. A tail gunner with a fighter
     * on him does not keep shooting at a truck, which is what this did before
     * there were any fighters to shoot at. */
    const bogey = this._nearestFighter();
    if (bogey) this.gunAim.copy(bogey.position);
    else this.gunAim.set(TARGET_X, this.groundAt(TARGET_X, COMPOUND.z) + 12, COMPOUND.z);
    if (this._gunBurst > 0) {
      this._gunBurst -= dt;
      this.gunFiring = true;
      if (this._gunBurst <= 0) {
        this.gunFiring = false;
        this._gunRest = 0.7 + Math.random() * 1.4;
      }
    } else {
      this._gunRest -= dt;
      if (this._gunRest <= 0) {
        this._gunBurst = 0.9 + Math.random() * 1.1;
        if (!this.dialogue.seen('defense.gunner.open')) {
          this.dialogue.play('defense.gunner.open', { once: true });
        } else {
          this.dialogue.bark('gunnerFiring');
        }
        this._gunSoundT = 0;
      }
    }
    /* THE SHUBENATOR IS AUDIBLE NOW.
     *
     * His whole burst used to be one revolver shot fired at the moment it
     * started — a second and a half of muzzle flash on the mesh with nothing
     * coming out of it. It runs at the real cadence instead, on the far cue
     * (`enolasquatch.gun.rear.cabin`) because he is thirteen metres behind the
     * flight deck and the difference between his gun and the player's gun
     * should be audible. Same guns, different seat. */
    if (this.gunFiring) {
      this._gunSoundT = (this._gunSoundT ?? 0) - dt;
      if (this._gunSoundT <= 0) {
        this._gunSoundT = 1 / 9;
        this.audio?.play?.('enolasquatch.gun.rear.cabin', {
          volume: 0.34, rate: 0.92 + Math.random() * 0.16,
        });
      }
    }
  }

  /** The nearest live interceptor, or null. */
  _nearestFighter() {
    let best = null;
    let bestD = Infinity;
    const here = this.physics.position;
    for (const f of this.interceptors.fighters) {
      if (!f.alive) continue;
      const d = f.position.distanceToSquared(here);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  /** The ground height under a point, whichever sampler this mission was given. */
  groundAt(x, z) {
    return this.getHeight ? this.getHeight(x, z) : approxGroundHeight(x);
  }

  updateDefensePhase(dt) {
    const p = this.physics;
    /* DENSITY THAT MEANS SOMETHING. The battery works harder the closer the
     * aeroplane gets, harder again while a searchlight has it, and hardest of
     * all when nobody is flying — `Autopilot.predictability` is the same
     * number the fighters read, so one decision (leave the seat to man the
     * gun) tightens both threats at once. */
    const closing = clamp(1 - (p.position.x - (TARGET_X - 2600)) / 2600, 0, 1);
    this.defense.intensity = clamp(
      0.75 + (1 - closing) * 0.55
      + (this.defense.caught ? 0.5 : 0)
      + this.autopilot.predictability * 0.45,
      0.4, 1.8,
    );
    this.defense.update(dt, {
      position: p.position,
      velocity: p.velocity,
      headingDeg: p.headingDeg,
      evasion: this.evasion,
    });
    this.updateRearGunner(dt, this.defense.state === 'active' || this.defense.caught);
    /* THE SECOND WAVE, over the target, where they are least welcome. */
    if (this.phaseTime > 12 && this.interceptors.activeCount < 3) {
      this.interceptors.aggression = 1.15;
      this.scrambleFighters(2, 3);
    }
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

    /* The guns do not stop because the bombardier has started. The run has to
     * be flown straight, which is the one thing that lets the predictor settle
     * — so the bombing corridor is deliberately the most dangerous ninety
     * seconds of the mission, and that tension is the beat. */
    this.defense.intensity = clamp(1.35 + this.autopilot.predictability * 0.4, 0.4, 1.8);
    this.defense.update(dt, {
      position: p.position,
      velocity: p.velocity,
      headingDeg: p.headingDeg,
      evasion: this.evasion,
    });

    // The gun is still worked on the run in — that is when they are closest to
    // the guns on the ground.
    this.updateRearGunner(dt, this.defense.state === 'active');

    if (!this._sawCity && this.targeting.distance < 5200) {
      this._sawCity = true;
      this.dialogue.play('bomb.cityInSight', { once: true });
    }
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
        who: 'PROSPECT', text: line.text, hold: 2.2, cue: releaseCueOf(line.key),
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
        /* Never reach the drop with an empty mount. `release()` returns on its
         * first line if the prop has already been released once, which is how
         * a restarted mission ended up with no bomb and no way to finish — see
         * `rearmPayload()`. If anything at all has left this in that state,
         * hang a fresh one up before pulling the handle. */
        if (this.payload.released) this.rearmPayload();
        this.payload.release(this.scene, this.physics.velocity.clone());
        this.payloadReleased = true;

        /* The pheeeeeew. Started here rather than inside `FatSquatch` because
         * the payload is a passive prop and knows nothing about audio, and
         * because the length of the fall is a physics question the mission can
         * answer and the prop cannot: from `h` metres up with an initial
         * vertical rate `v0`, ballistic time to the ground is
         * (v0 + sqrt(v0^2 + 2gh)) / g. Handing that to the whistle means the
         * sweep bottoms out as the bomb arrives instead of before or after it.
         * `onPayloadImpact` cuts it, and so does `restoreCheckpoint`. */
        const h = Math.max(20, this.physics.position.y - this.groundAt(this.physics.position.x, this.physics.position.z));
        const v0 = Math.max(0, -this.physics.velocity.y);
        const fall = (v0 + Math.sqrt(v0 * v0 + 2 * 9.81 * h)) / 9.81;
        this.audio?.fallingWhistle?.(fall);
        this._fallSeconds = fall;
        this.dialogue.play('bomb.packageAway', { once: true, delay: 0.3 });
        this.dialogue.play('bomb.falling', { once: true, delay: 2.4 });
        this.dialogue.play('bomb.weightLoss', { once: true, delay: 5.4 });
        this._releaseStep = 'falling';
        /* THE BREAK TURN. The seconds between the bomb leaving the mount and
         * the flash used to be dead air with an empty objective on the glass;
         * they are now the only thing standing between the player and the
         * blast wave, because `onShockWave()` scales everything it does by how
         * far away the aeroplane actually got. Sasole calls it and the HUD
         * follows him, per the tone doctrine — the character first, the
         * instruction after. */
        this._breakFrom = this.physics.headingDeg;
        this.dialogue.play('bomb.breakTurn', { once: true, delay: 1.2 });
        this.setPhase('explosion');
      }
    }
  }

  /* ---- Explosion ----
   *
   * Owner, 2026-08-04: "the EXPLOSION should be absolutely ridiculously
   * thermonuclear tsar bomba level insanity hardcore badass."
   *
   * The set-piece itself lives in `../vfx/Detonation.js` — the double flash,
   * the shock front, the column, the cap, the light coming back. What is HERE
   * is everything the detonation does to the aeroplane and the crew, which is
   * deliberately not in that file: it owns a clock and some geometry and knows
   * nothing about physics.
   *
   * The order of events, and why:
   *
   *   FLASH        instant, at the impact. `blastFlash` whites the cockpit out
   *                and `../main.js` paints it. Light gets there first, so
   *                nothing else happens on this frame.
   *   THE FRONT    grows on `Detonation.shockRadius`, knocking the surviving
   *                outskirts down as it crosses them (through the `onShockFront`
   *                hook wired in the constructor).
   *   ARRIVAL      when that radius reaches the AEROPLANE — which is a
   *                different moment for every player, because it depends on how
   *                far they got — the sound, the buffet and the damage all land
   *                together. That is the payoff of the break turn, and it is
   *                why `score.blastDistance` is worth having.
   */

  onPayloadImpact(point) {
    /* Once only. `Detonation.fire()` is itself idempotent while it is live,
     * but the city, the crater, the scoring and the dialogue all have to be
     * one-shot as well — and `main.js`'s `go('explosion')` calls this directly
     * AND the released payload calls it again a few seconds later through
     * `payload.onImpact`. Cleared by `restoreCheckpoint`, so a checkpoint
     * restart before the drop can still detonate. */
    if (this.explosionPoint) return;
    this.explosionPoint = point.clone();
    // The whistle stops the instant it arrives, not a frame later.
    this.audio?.endFallingWhistle?.(0.03);

    /* Take the middle of the city away and put the hole there BEFORE the
     * fireball is built, so the very first frame of the flash is already
     * lighting a crater. What is NOT taken away is the outskirts — those are
     * left standing for the shock front, which is the whole reason the city is
     * now wider than the crater (see `TargetCity.destroy()`). */
    if (this.city && !this.city.destroyed) {
      const crater = this.city.destroy(point);
      this.onCrater?.(crater);
    }

    this.detonation.fire(point);
    this.blastFlash = 1;
    this._shockArrived = false;
    this._blastSoundFired = false;
    this._explosionT = 0;

    const p = this.physics;
    this.score.blastDistance = Math.hypot(
      p.position.x - point.x, p.position.y - point.y, p.position.z - point.z,
    );

    this.cameras?.punchFov?.(13);
    // Only a small shake at the flash: nothing has physically reached the
    // aeroplane yet. The real one is on arrival, below.
    this.cameras?.addShake?.(0.25);

    // Tower lights out, if this mission's DetectionSystem built any.
    for (const t of this.detection.towers || []) {
      if (t.lamp) t.lamp.material = unlit(0x201a14);
    }

    const missDistance = Math.hypot(point.x - COMPOUND.x, point.z - COMPOUND.z);
    this.score.bombAccuracy = clamp(1 - missDistance / 260, 0, 1);
    // EXPRESS SHIPPING: delivered without missing the target — a tight impact
    // AND a corridor that was actually flown well, not a lucky drop at the end
    // of a wandering approach.
    this.score.expressShipping = missDistance < 140 && this.targeting.corridorScore > 0.6;
  }

  /**
   * The detonation, ticked from `update()` rather than from the `explosion`
   * phase.
   *
   * The column takes the better part of half a minute to finish going up and
   * the escape has to be flyable the whole time it does, so the phase ends
   * long before the shot does. Keeping the two clocks separate is what lets
   * the player turn away and still have it filling the mirror.
   */
  updateDetonation(dt) {
    const det = this.detonation;
    det.update(dt);
    this._explosionT = det.t;
    this.blastFlash = det.screenFlash;
    this.blastTint = det.flashColour;
    const t = det.t;

    /* The crew, on their own clock rather than on `play(delay)` — that option
     * delays the whole QUEUE rather than one beat, so four beats queued at
     * once with four delays all wait for the longest of them. Thresholds here
     * mean each one lands where it was written to land. */
    if (t > 0.15) this.dialogue.play('explosion.flash', { once: true, urgent: true });
    if (t > 5.0) this.dialogue.play('explosion.reaction', { once: true });
    if (t > 13.0) this.dialogue.play('explosion.column', { once: true });
    if (t > 21.0) this.dialogue.play('explosion.crater', { once: true });

    /* ---- The front reaching the aeroplane ----
     *
     * Recomputed every frame against where the aeroplane actually IS, not
     * against a time worked out at the flash: the player is flying away from
     * it at sixty metres a second and every one of those metres buys time. */
    const p = this.physics;
    const range = Math.hypot(
      p.position.x - this.explosionPoint.x,
      p.position.y - this.explosionPoint.y,
      p.position.z - this.explosionPoint.z,
    );
    if (!this._blastSoundFired && det.shockRadius >= range * 0.94) {
      this._blastSoundFired = true;
      this.audio?.detonation?.(1.45);
    }
    if (!this._shockArrived && det.shockRadius >= range) {
      this._shockArrived = true;
      this.onShockWave(range);
    }

    if (det.done) {
      det.dispose();
      this.blastFlash = 0;
    }
  }

  /**
   * The blast wave gets to the aeroplane.
   *
   * Survivable at every distance the mission can actually produce, and
   * genuinely unpleasant at the short ones — an aeroplane that can be thrown
   * onto its side by the thing it just dropped is what makes the break turn
   * worth flying. It is deliberately NOT a fail: the escape phase and the
   * ordinary damage model take it from here, so a player who lingered gets a
   * bad ride home rather than a restart card.
   *
   * @param {number} range metres from ground zero when it arrived
   */
  onShockWave(range) {
    const p = this.physics;
    // Overpressure falls off roughly with the cube root of the distance ratio;
    // this is that shape, normalised so a kilometre out is a hard shove and
    // three kilometres out is a bang and a wobble.
    const severity = clamp(Math.pow(clamp(900 / Math.max(range, 120), 0, 3), 1.4), 0, 2.2);
    this.score.blastSeverity = severity;

    this.cameras?.addShake?.(clamp(severity * 1.3, 0.3, 2.4));
    this.cameras?.punchFov?.(clamp(severity * 9, 3, 22));
    this.audio?.blastWave?.(clamp(severity, 0.2, 2));

    // A real push, outward, and a real tumble. `omega` is body-frame rad/s.
    if (!p.onGround) {
      const away = new THREE.Vector3(
        p.position.x - this.explosionPoint.x, 0, p.position.z - this.explosionPoint.z,
      );
      if (away.lengthSq() > 1) away.normalize();
      /* Hard, and survivable. Capped deliberately: at two hundred metres from
       * a device this size a real crew is already gone, and a game that
       * simulates that faithfully is a game that ends the mission with a
       * shrug. The tumble is what the player remembers; the numbers are set so
       * a competent recovery is always possible from any distance the mission
       * can actually produce. */
      p.velocity.addScaledVector(away, clamp(severity * 12, 0, 26));
      p.velocity.y += clamp(severity * 5, 0, 11);
      p.omega.x += (Math.random() - 0.5) * severity * 0.55;
      p.omega.y += (Math.random() - 0.5) * severity * 0.4;
      p.omega.z += (Math.random() - 0.5) * severity * 0.9;
    }

    // What it costs. Skin first, then an engine if it was really close.
    p.damage.wing = clamp(p.damage.wing + severity * 0.16, 0, 1);
    if (severity > 1.1) {
      const alive = this.defense.damage.engines.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
      if (alive.length) this.defense.damageEngine(alive[Math.floor(Math.random() * alive.length)]);
    }
    if (severity > 0.55) this.defense.damageElectrical();

    // Nobody's autopilot holds through that.
    this.autopilot.disengage('blast wave');
    this.weather.setConditions({ turbulence: clamp(0.6 + severity * 0.5, 0, 1.4) });
    this.dialogue.play('explosion.shockwave', { urgent: true });
  }

  /** The handle the verifier and the console read. Owned by the Detonation. */
  get _explosionVfx() { return this.detonation?.vfx ?? null; }

  updateExplosion(dt) {
    void dt;
    const p = this.physics;
    if (!this.explosionPoint) {
      /* Still falling. This is the break turn — see `updateRelease`.
       *
       * Unless nothing is falling, in which case this phase can never end.
       * The bomb is `released` and not yet `impacted` for the eight or nine
       * seconds of the drop and no longer; if we are here without an impact
       * point and without a bomb in the air, the fall that was supposed to
       * produce one is not happening and waiting is waiting forever. That was
       * the shape of the owner's dead end. Go round again instead: put a Fat
       * Squatch back on the mount, say so, and hand the player back to the
       * bombing approach with a target that still has a city round the edge of
       * it. Recoverable, and it costs a circuit rather than a session. */
      const falling = this.payload.released && !this.payload.impacted;
      if (!falling && this.phaseTime > 6) {
        this.rearmPayload();
        this.dialogue.play('bomb.doorsFixed', { once: false });
        this.hud?.say?.('<em>It never left the mount.</em> Straps back on, doors reset — take her round again.', 6000);
        this.setPhase('bombApproach');
        return;
      }
      this.setObjective(OBJECTIVES.BREAK_TURN);
      this.updateRearGunner(dt, false);
      return;
    }
    const range = Math.hypot(p.position.x - this.explosionPoint.x, p.position.z - this.explosionPoint.z);
    this.setObjective(`${OBJECTIVES.BLAST} (${(range / 1000).toFixed(1)} km)`);
    /* Hand over to the escape once the wave has been past and the column is
     * up far enough to be worth flying away from. The detonation itself keeps
     * running for another twenty seconds — see `updateDetonation`. */
    if (this.detonation.t > 12 && this._shockArrived) this.setPhase('escape');
    if (this.detonation.t > BLAST.duration * 0.66) this.setPhase('escape');
  }
  /* ---- Escape / emergency ---- */

  updateEscape(dt) {
    const p = this.physics;
    this._escapeT += dt;
    // He works the gun as long as there is anything to work it at, and only
    // announces that he is out once the sky behind them is empty.
    this.updateRearGunner(dt, this.interceptors.engagedCount > 0);
    if (this._escapeT > 3 && this.interceptors.activeCount === 0
      && !this.dialogue.seen('escape.gunnerDone')) {
      this.dialogue.play('escape.gunnerDone', { once: true });
    }
    if (this._escapeT > 8) {
      this.weather.setConditions({ turbulence: 0.4, lightning: 0 });
      if (!this.dialogue.seen('escape.clear')) this.dialogue.play('escape.clear', { once: true });
    }
    /* THE LAST WAVE. Whatever is still flying comes after them on the way out,
     * and this is the stretch the player is most likely to be on the gun for —
     * the bomb is gone, the aeroplane is two and a half tonnes lighter, and
     * there is nothing left to do with the seat except point it west. */
    if (this._escapeT > 6 && this.interceptors.activeCount < 2) {
      this.interceptors.aggression = 1.0;
      this.scrambleFighters(2, 4);
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
    /* They do not follow you home. Anything still up when the aeroplane is
     * this far west turns back, because a fighter chase that never ends is not
     * a threat, it is a chore. */
    if (this.interceptors.activeCount > 0 && p.position.x < TARGET_X - 5200) {
      this.interceptors.clear();
      this.dialogue.play('fighters.broke', { once: true });
    }
    this.updateNavCorrection(dt, RETURN_HEADING);
    // Still counting stars back there, and still out of bullets.
    this.updateRearGunner(dt, false);
    if (p.position.x < WP.x + 1600) this.setPhase('landing');
  }

  updateLanding(dt) {
    void dt;
    const p = this.physics;
    // Nobody lands a four-engine bomber from the tail turret.
    if (this.gunner.manned) this.leaveGun();
    if (this.autopilot.engaged) this.autopilot.disengage(null);
    if (this.interceptors.activeCount > 0) this.interceptors.clear();
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

  /**
   * How hard the aeroplane is being thrown about, 0..1.
   *
   * One number, computed once a frame, handed to the flak predictor AND to the
   * fighters' gunnery — so "evading" means the same thing to everything that is
   * shooting, and a player who learns it against one has learned it against
   * both. Roll RATE rather than roll angle, because a steady 30-degree bank is
   * as easy to track as level flight; it is the change that spoils a solution.
   */
  updateEvasion(dt) {
    const p = this.physics;
    const rollRate = Math.abs(p.rollDeg - this._prevRoll) / Math.max(dt, 1e-3);
    this._prevRoll = p.rollDeg;
    const gWobble = Math.abs(p.gLoad - 1);
    const slip = Math.abs(p.beta);
    const raw = clamp(rollRate / 26, 0, 1) * 0.6 + clamp(gWobble / 0.7, 0, 1) * 0.3 + clamp(slip / 0.2, 0, 1) * 0.1;
    // Decays slowly: a break turn buys a few seconds of a spoiled solution
    // after it has finished, which is what actually makes jinking worth doing.
    this.evasion = Math.max(raw, this.evasion - dt * 0.55);
    if (this.autopilot.engaged) this.evasion = Math.min(this.evasion, 0.06);
    return this.evasion;
  }

  /**
   * The air battle, wherever the mission currently is.
   *
   * Driven from `updateFlightCommon` rather than from one phase because the
   * fighters follow the aeroplane across phase boundaries — they are launched
   * in the corridor and are still there over the target and on the way out,
   * which is the whole reason the rear gun is worth manning.
   */
  updateAirBattle(dt) {
    const p = this.physics;
    this.interceptors.setPredictability(this.autopilot.engaged ? this.autopilot.predictability : 0);
    this.interceptors.update(dt, { position: p.position, velocity: p.velocity, evasion: this.evasion });
    const state = this.gunner.update(dt);
    if (state?.manned) {
      this.score.gunnerSeconds += dt;
      this.gunFiring = this.gunner.firing;
      this.gunner.aimPoint(this.gunAim);
    }
    if (this.autopilot.engaged) this.score.autopilotSeconds += dt;
  }

  /** Launch a wave of night fighters, once. */
  scrambleFighters(count, delay = 0) {
    if (this.interceptors.deployed && this.interceptors._pendingWave > 0) return false;
    this.interceptors.deploy({ around: this.physics.position, count, delay });
    return true;
  }

  updateFlightCommon(dt) {
    const p = this.physics;
    const warn = new Set();

    this.updateEvasion(dt);
    this.updateAirBattle(dt);

    this.weather.sampleAir(p.position, p.agl, { wind: p.wind, gust: p.gust });
    const rough = p.gust.length();
    this.score.roughAir += Math.max(0, rough - 3) * dt;

    /* `BARKS.stall` does not exist in `../dialogue/script.js` — the pool was
     * never written — so `bark('stall')` has always been a silent no-op. Left
     * as it stands rather than inventing a line for it, and flagged here so
     * the next person does not have to rediscover it by reading DialogueSystem. */
    if (!p.onGround && p.stallT > 0.35) { warn.add('stall'); this.audio?.setStallHorn?.(true); this.dialogue.bark?.('stall'); }
    else this.audio?.setStallHorn?.(!p.onGround && p.stallT > 0.2);
    if (!p.onGround && p.ias > AC_ENOLA.vne * 0.92) warn.add('overspeed');
    if (!p.onGround && p.agl < 70 && p.vspeed < -3) {
      warn.add('terrain');
      /* `BARKS.terrainClose` HAS been written, and had no trigger anywhere in
       * the mission — an authored, cued, castable line that could never play.
       * Same for `BARKS.lowFuel` below. Both are wired to the condition their
       * own words describe, which is the condition the HUD warning beside them
       * was already computing. */
      this.dialogue.bark('terrainClose');
    }
    if (this.engines.engines.some((e) => e.temp > 245)) warn.add('hot');
    if (this.score.fuelRemaining < 0.18) {
      warn.add('fuel');
      if (!p.onGround) this.dialogue.bark('lowFuel');
    }
    if (p.damage.gear > 0.3) warn.add('gear');

    if (this.phase === 'bombMalfunction' || (this.phase === 'bombApproach' && !this.bombBayOpen)) warn.add('bombBay');
    if (['bombApproach', 'bombMalfunction', 'release'].includes(this.phase) && !this.payloadReleased) warn.add('payloadArmed');
    if (this.defense?.damage.electrical) warn.add('electrical');
    if (this.defense?.state === 'active') warn.add('flak');
    if (this.interceptors.activeCount > 0) warn.add('fighters');
    if (this.autopilot.engaged && this.gunner.manned) warn.add('unattended');
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
    /* The eastern bound has to sit clear of the target AND of however far the
     * blast wave throws you past it. Ground zero is at x = 9000, the escape
     * leg runs on east while the crew get their heading sorted out, and the
     * shock front adds a shove on top of that — 12,000 was close enough to be
     * reachable by flying the escape correctly, which is not what an
     * out-of-bounds message is for. */
    if (Math.abs(p.position.x) > 13400 || p.position.z > 3000 || p.position.z < -6000) {
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

    /* Every checkpoint is airborne or lined up on the runway, so the
     * walkaround is over however the player got here: the guidance marker, the
     * six interaction targets and the boarding prompt all go away, the crew
     * are in their seats, and the player is in his. Beef Run's own
     * `restoreCheckpoint` does the same thing for the same reason — a
     * restored flight that leaves the on-foot systems armed puts an
     * interaction prompt on the glass at four thousand feet. */
    this.audio?.endFallingWhistle?.(0.05);
    this.gunFiring = false;
    // See `onPayloadImpact`: a restart before the drop must be able to detonate.
    this.detonation.dispose();
    this.explosionPoint = null;
    this.blastFlash = 0;
    /* AND IT MUST HAVE SOMETHING TO DETONATE. Everything above already
     * un-did the explosion; nothing put the bomb back. See `rearmPayload()`
     * for the whole of that bug — this is the line that fixes it, and it runs
     * before `setup[name]()` so the restore's own `payloadReleased` (the
     * `return` checkpoint deliberately sets it true) has the last word. */
    this.rearmPayload();
    this._shockArrived = false;
    this._blastSoundFired = false;
    /* The air battle does not survive a restart either — a wave of fighters
     * left over from the attempt before is a wave the player never earned. */
    this.interceptors.clear();
    this.gunner.reset();
    this.autopilot.disengage(null);
    this.autopilot.lockout = 0;
    this.preflight?.disarm?.();
    this.disarmBoardingTarget();
    this.crew?.takeSeats?.(this.aircraft);
    if (!this.inCockpit) {
      this.inCockpit = true;
      if (this.player) { this.player.enabled = false; this.player.mode = 'frozen'; }
      this.interaction?.setPaused?.(true);
      this.cameras?.setView?.('cockpit');
      this.audio?.setHeadset?.(true);
      this.dialogue.setHeadset(true);
      this.input.rudderKeys = true;
      this.flightHud?.show?.(true);
    }

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
        /* Put the night back. Every other restore point sets its own
         * conditions and this one did not, so restarting at the target
         * inherited whatever the weather was last told — on a fresh page that
         * is the apron's `dusk: 0.55, night: 0.15`, i.e. the bombing run over
         * a night city played out in pale blue daylight haze with a 2.6 km fog
         * cut. Matches `turnOnCourse`, which is the checkpoint before it. */
        this.weather.setConditions({ dusk: 1, night: 1, cloudDensity: 0.5, turbulence: 0.5 });
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
    /* Reconcile the prop with the flag the restore just settled on. Every
     * checkpoint but one comes back with the bomb aboard and `rearmPayload()`
     * above has already hung it up; `return` is the exception — it is the leg
     * after the drop, so the bay has to be empty there or the aeroplane flies
     * home with a Fat Squatch it has already delivered. */
    if (this.payloadReleased && !this.payload.released) {
      this.payload.released = true;
      this.payload.impacted = true;
      this.payload.group.visible = false;
    }
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
    this.audio?.endFallingWhistle?.(0.15);
    this.gunFiring = false;
    this.gunner.leave();
    this.autopilot.disengage(null);
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

    /* The three new rows are the escalation pass's own: what the tail gun did,
     * how long nobody was flying, and how far clear they got before it went
     * off. All three are things the player chose, which is the test for
     * whether a number belongs on this card at all. */
    const gunnery = s.fighterPasses > 0
      ? `${s.fightersDestroyed} of ${s.fighterPasses}`
      : (s.fightersDestroyed ? `${s.fightersDestroyed}` : '—');
    const clearance = s.blastDistance === null
      ? '—'
      : `${(s.blastDistance / 1000).toFixed(2)} km`;

    const stats = [
      { label: 'Takeoff quality', value: pct(s.takeoff), grade: grade(s.takeoff) },
      { label: 'Bomb accuracy', value: pct(s.bombAccuracy), grade: grade(s.bombAccuracy) },
      { label: 'Corridor discipline', value: pct(s.corridorScore), grade: grade(s.corridorScore) },
      { label: 'Fighters destroyed', value: gunnery, grade: s.fightersDestroyed > 0 ? 'good' : '' },
      { label: 'Clear of the blast', value: clearance, grade: grade(clamp((s.blastDistance ?? 0) / 1600, 0, 1)) },
      { label: 'Flown by nobody', value: `${Math.round(s.autopilotSeconds)}s`, grade: s.autopilotSeconds > 90 ? 'bad' : '' },
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
      s.fightersDestroyed >= 3 ? 'Achievement: TAIL-END CHARLIE' : null,
      s.fighterPasses > 0 && s.fightersDestroyed === 0 && s.damage < 0.2
        ? 'Achievement: NOT A SCRATCH' : null,
    ].filter(Boolean);

    return { stats, rank: ranks[tier], tier, total, unlocks, expressShipping: s.expressShipping };
  }
}
