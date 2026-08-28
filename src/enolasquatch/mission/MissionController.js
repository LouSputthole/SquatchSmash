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
  ENOLA_PARKING, LIVE_FIRE,
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
import { SmokeSystem } from '../../world/smoke.js';
import { ENOLA_ESCAPE_MUSIC_DELAY_SECONDS } from '../audio.js';

const CORRIDOR = LANDMARKS_EAST.find((l) => l.id === 'corridor');
const TOWN = LANDMARKS_EAST.find((l) => l.id === 'town');
const CLOUDBANK = LANDMARKS_EAST.find((l) => l.id === 'cloudbank');
const COMPOUND = LANDMARKS_EAST.find((l) => l.id === 'compound');
/**
 * Resolve the climb-out's turn gate without making one invisible z coordinate
 * a mission soft-lock.
 *
 * Owner playtest, 2026-08-19: *"the chain currently has a missing link and the
 * player can end up flying with no objective... trigger the next heading
 * AUTOMATICALLY on a forgiving condition: airborne ~10-15 s, OR above a minimum
 * altitude, OR a short distance from the runway. NOT a tiny invisible trigger
 * volume."*
 *
 * That is exactly what this now is, and the third clause is the one that was
 * missing. The gate used to require `agl > 260` AND (crossing an unmarked z
 * line OR 2200 m of radial clearance) — an altitude AND-condition on a
 * fully-loaded four-engine bomber that this airframe genuinely struggles to
 * meet (`AC_ENOLA` is deliberately "difficult to climb while loaded"). A player
 * who levelled off low, or turned early, or simply climbed slowly, flew out of
 * Whispering Pines with `CLIMB_TURN`'s "then turn onto the new heading" on the
 * glass and no heading ever named — the missing link, verbatim.
 *
 * The three clauses are now a genuine OR and any ONE of them is enough:
 *
 *   TIME      `airborneSeconds >= CLIMB_TURN_GATE.seconds` — 12 s wheels-up.
 *             This one cannot fail. Whatever else goes wrong, the heading gets
 *             called, which is the whole point of the note.
 *   ALTITUDE  `agl > TURN_POINT.minAltitudeAgl` — the fast climber gets it
 *             early, as before.
 *   DISTANCE  either the planned turn point, or `CLIMB_TURN_GATE.radius` of
 *             clearance from the field.
 *
 * `ready` (the handoff into cruise) still wants the player actually tracking
 * the new heading, because that is a different question from whether he has
 * been TOLD it — but see `updateClimbTurn()`, which no longer lets a player who
 * ignores it sit there unprompted either.
 */
export const CLIMB_TURN_GATE = Object.freeze({
  seconds: 12,
  radius: 1800,
  /** How long after the call before Capt Sasole asks what you are doing. */
  nagAfter: 16,
  /** And how often after that. */
  nagEvery: 18,
  /** Heading error, in degrees, that counts as "he has started turning". */
  respondingWithin: 55,
  /** How long NEW HEADING stands on the glass before the objective takes over. */
  bannerSeconds: 6,
});

export function evaluateClimbTurnProgress({
  x, z, agl, headingDeg, turnCalled = false, onCourseSeconds = 0, airborneSeconds = 0,
}, dt) {
  const clearedPlannedPoint = z <= TURN_POINT.z;
  const clearedFieldRadially = Math.hypot(x - WP.x, z - WP.z) >= CLIMB_TURN_GATE.radius;
  const clearedByTime = airborneSeconds >= CLIMB_TURN_GATE.seconds;
  const clearedByAltitude = agl > TURN_POINT.minAltitudeAgl;
  const cleared = clearedByTime || clearedByAltitude || clearedPlannedPoint || clearedFieldRadially;
  const callTurn = !turnCalled && cleared;
  const trackingHeading = turnCalled || callTurn;
  const headingError = Math.abs(headingDelta(headingDeg, TURN_POINT.newHeading));
  const nextOnCourse = trackingHeading && headingError < 8
    ? onCourseSeconds + dt
    : 0;
  return {
    callTurn,
    onCourseSeconds: nextOnCourse,
    ready: nextOnCourse > 2.5,
    headingError,
    clearedByTime,
    clearedByAltitude,
    clearedPlannedPoint,
    clearedFieldRadially,
  };
}
const RETURN_HEADING = (TURN_POINT.newHeading + 180) % 360;   // 270 — back the way we came

/**
 * The climbout call, by the heading it is calling.
 *
 * Both takes name their heading OUT LOUD — "come right onto zero-nine-zero",
 * "come left onto two-seven-zero" — so which one plays is not decoration, it
 * is whether the crew agree with the compass bug. `callNewHeading()` took a
 * `deg` argument, used it for the banner, the objective and the nav marker,
 * and then played 'climb.turn.east' from a string typed into the call. The
 * west take has therefore never been played by anything since it was written,
 * recorded and shipped, and the day anybody acts on the design note at the
 * foot of config.js — which says in as many words that the brief left "east or
 * west" open and this mission closes it to east — Irish would have called
 * zero-nine-zero over a bug pointing the other way.
 *
 * Keyed by heading rather than by a boolean so the map is the thing that has
 * to be extended if a third heading is ever written, instead of a condition
 * quietly picking the nearest lie. A heading with no line gets none: the
 * banner, the objective and the compass bug are all built from `deg` and say
 * it correctly, and silence beats a recorded voice contradicting them.
 */
const CLIMB_TURN_BEAT_BY_HEADING = Object.freeze({
  90: 'climb.turn.east',
  270: 'climb.turn.west',
});

/**
 * THE RUN HOME.
 *
 * Owner, 2026-08-19: *"Script several distinct waves of fighters attacking from
 * behind on the RETURN leg while the plane navigates itself toward home. Target
 * roughly one to two minutes of sustained action. Vary the waves — approach
 * angle, count, timing — so it builds rather than repeats."*
 *
 * Five waves across 96 seconds of `return`-phase time, and every column varies
 * on purpose:
 *
 *   TIMING     the gaps run 24, 22, 20, 18 s — tightening, so the leg gets
 *              busier rather than metronomic, and the first one lands far
 *              enough in that the player has heard Sasole hand him the gun.
 *   COUNT      1, 2, 2, 3, 3 — it builds.
 *   ANGLE      the `profiles` are `Interceptors`' authored attack behaviours
 *              (see WAVE_SCRIPTS in `../combat/Interceptors.js`): `harass`
 *              nags from outside the turret's reach, `crossing` sets up abeam
 *              and slices across the track, `highside` perches above and comes
 *              screaming down, `priority` reads the quarter the gunner is
 *              covering least. Passing them explicitly rather than letting the
 *              rota pick means the SHAPE of the fight is authored: one nag, a
 *              scissors, a dive, a mixed pair, then everything at once.
 *   AGGRESSION climbs 0.8 -> 1.25, so the last wave shoots the most.
 *
 * The whole table is roughly 1 minute 40 of action once the last wave's passes
 * are counted, which is the "one to two minutes" the note asks for.
 */
export const RETURN_WAVES = Object.freeze([
  { at: 10, count: 1, delay: 0, aggression: 0.80, profiles: ['harass'], call: 'fighters.first' },
  { at: 28, count: 2, delay: 2, aggression: 0.95, profiles: ['crossing', 'crossing'] },
  { at: 44, count: 2, delay: 1, aggression: 1.05, profiles: ['highside', 'harass'] },
  { at: 60, count: 3, delay: 1, aggression: 1.15, profiles: ['priority', 'crossing', 'highside'] },
  { at: 76, count: 3, delay: 0, aggression: 1.25, profiles: ['crossing', 'highside', 'priority'] },
]);

/**
 * How long the approach will wait for the last pass to finish.
 *
 * The schedule above is timed against the leg itself: `return` starts about
 * nine kilometres east of Whispering Pines and this airframe covers that in
 * roughly a hundred seconds, so the last wave arrives with the field still
 * ahead. A fast run home can still reach the circuit with a fighter mid-pass,
 * and the handoff waits — but only this long, because a player who never fires
 * a round must not be held east of his own runway by an aeroplane that will not
 * break off. Past it, they break off and the approach begins regardless.
 */
const RETURN_FIGHT_GRACE_SECONDS = 25;

/* THE ONE AUTHORED ENGINE PROBLEM.
 *
 * Owner, via the 2026-08-06 for-show pass (`LIVE_FIRE`, ../config.js): the
 * flak and the fighters no longer cost the aeroplane anything, on purpose —
 * "there's really no targets to shoot out... Lets just have all the flak
 * and fighters for show." A barrage that can never touch you is honest
 * spectacle, but it leaves the whole run-in with zero consequence, and this
 * is the one exception: not random, not enemy fire, a heavy four-engine
 * aeroplane that has been at high power through a long climb and a longer
 * gauntlet finally telling on itself, right at the end of the stretch.
 *
 * `ENGINE_OUT_INDEX` is 2 — 'innerRight' in the `engineNames` order
 * `main.js` builds the `EngineSystem` with (`['outerLeft', 'innerLeft',
 * 'innerRight', 'outerRight']`), aviation's "number three" on a four-engine
 * heavy numbered left to right. Deliberately not "number two": that number
 * already belongs to `emergency.overheat` (../dialogue/script.js), the
 * unrelated, later, combat-damage-only engine-trouble beat that can still
 * fire during the escape leg — see `updateEscape()`. A player who reaches
 * both in one flight should not hear the same engine named twice for two
 * different reasons.
 *
 * `ENGINE_OUT_TRIGGER_X` sits 1000 m short of where `updateDefensePhase`
 * hands off to `bombApproach` (`TARGET_X - 1400`) — inside the flak/fighter
 * stretch (which runs from the corridor exit, `ZONES_EAST`'s `corridor.to`
 * at x 4200, through to that handoff), toward its end rather than at a
 * random point in it, per the brief. */
const ENGINE_OUT_INDEX = 2;
const ENGINE_OUT_TRIGGER_X = TARGET_X - 2400;
/** How much of the engine's own thrust the derate costs it. One of four
 * equal engines is normally a quarter of total thrust, so knocking this one
 * down by 28% of ITS OWN output costs the aeroplane 0.28 * 25% = 7% of its
 * TOTAL power — "knocking total power down ~7%", not a kill. `EngineSystem
 * .damage()`'s `floor` argument is the same number: the derate is permanent
 * for the rest of the attempt, but never gets worse from this alone. */
const ENGINE_OUT_HEALTH_LOSS = 0.28;
const ENGINE_OUT_HEALTH_FLOOR = 0.72;

/* The buffet. Owner: "the shockwave to pass over you and simulate a brief
 * moment of turbulence." `BLAST_TURB_SECONDS` is how long the air stays rough
 * afterwards, decaying back to `BASE_TURB` — the ordinary night air of the
 * escape leg, and the same number the escape phase resets to at +8 s. */
/* THE THROTTLE-BACK GATE.
 *
 * `throttle` is the lever position that counts as "back" — a quarter, which on
 * `EngineSystem`'s own `load` term takes about 145 °C out of the target
 * temperature and is unmistakably a deliberate action rather than a wobble.
 * `key` is what the page has bound to throttle-down (see `../main.js`'s help
 * text: "Shift/Z — throttle"), named in the instruction because an objective
 * that does not name its control is the "consult the spirits" problem.
 *
 * Exported so the browser verifier can fly the beat against the real numbers
 * instead of copies of them. It used to resolve the emergency by calling
 * `chooseEmergencyResponse('baby')` — the three-option menu this replaced — and
 * a check that presses a button nobody can press any more is not a check. See
 * the emergency block in `tools/verify-enolasquatch.mjs`. */
export const ENGINE_FIX = Object.freeze({
  throttle: 0.25,
  holdSeconds: 2.5,
  clearTemp: 205,
  nagEvery: 11,
  key: 'Z',
});

const BLAST_TURB_SECONDS = 5.5;
const BASE_TURB = 0.4;

/* The gyro's AGL floor: with the autopilot holding an altitude over rising
 * ground, clearance under this puts the red TERRAIN lamp up and has the crew
 * call it out. See the warning block in `updateFlightCommon` for why the
 * floor is this generous and why it is a warning rather than a control
 * change. */
const AUTOPILOT_TERRAIN_FLOOR_AGL = 250;

/* THE DROP CAMERA. Owner: "Maybe we experiment with moving the camera to the
 * third person automatically when you drop the bomb."
 *
 * An experiment, so it is one constant and a flag rather than a system: when
 * the payload leaves the mount the view goes to `chase` for this long and then
 * goes back to exactly the view the player had. It does NOT hold through the
 * detonation — the flash is a cockpit shot and the break turn is flown on
 * instruments, so it hands the aeroplane back well before either. Anybody who
 * touches the camera key during it keeps what they chose (see
 * `updateDropCamera`), because a player who has taken the camera has said what
 * he wants and the experiment should not argue. */
const DROP_CAM_SECONDS = 4.2;

/* THE DROP SEQUENCE STARTS EARLY ENOUGH TO LAND ON THE TARGET.
 *
 * Owner playtest, 2026-08-06: "The bomb is great. The drop bomb sequence
 * should start a bit earlier so that you aren't so far over the target."
 *
 * `updateBombApproach()` below hands off to the bomb-bay-malfunction beat
 * (`updateBombMalfunction()`) the moment `Targeting.readyToRelease` trips OR
 * the aeroplane is this close to the compound — whichever comes first. A
 * player who nails heading/bank/altitude gets the early exit; everyone else
 * — which is most of a flight through a target defended by live-looking flak
 * (`updateBombApproach()` runs `defense.intensity` at 1.35-1.8 the whole
 * time) — rides this fallback, and it was the effective trigger the owner
 * was flying against.
 *
 * From there the aeroplane is committed to a fixed run of real time before
 * `payload.release()` actually fires, none of it skippable: `_malfNeeded`
 * (8 s minimum, `updateBombMalfunction()`) of committed reset choreography,
 * then the player
 * has to read the five `RELEASE_LINES` and pick one (`chooseReleaseLine()`),
 * then `updateRelease()`'s own `stuck` (2 s) and `kick` (1 s) beats — eleven
 * seconds of flight time before anyone touches a key, plus however long the
 * choice itself takes. At this airframe's ~62 m/s bombing-run airspeed
 * that is upward of 700 m of ground covered on the old 700 m trigger alone,
 * before a single second of player reaction — measured end to end (a
 * synthetic flight held off Targeting's alignment gates so it is forced onto
 * this exact fallback, `tools/verify-enolasquatch.mjs`'s "the drop sequence
 * releases on the target" check): release landed a bare 9 m short of
 * TARGET_X for an instant choice, but 180 m past it at a 3 s reaction, 303 m
 * past at 5 s, 489 m past at 8 s — "well past the target" for anyone who
 * actually reads the choice instead of mashing a key blind.
 *
 * `BOMB_MALFUNCTION_TRIGGER_M` moves that fallback out to 1100 m — still
 * inside the 1400 m `updateDefensePhase()` uses to hand off into
 * `bombApproach` in the first place, so the approach corridor still exists —
 * which puts release within a couple of hundred metres of the target for a
 * 5-6 s reaction (the RELEASE_LINES read in about that long) and no worse
 * than ~90 m past it even at a slow 8 s, instead of the ~490 m the old
 * number left on the table. A fast, instant-choice player now undershoots by
 * a few hundred metres rather than dropping bang on the pin — the safer
 * side of the target's own ~460 m defended radius (`Defense.deploy()`'s
 * `radius`) to miss by, and the one the owner's own wording ("so that you
 * aren't so far over the target") asked for. */
/* 2026-08-08 follow-up: the measured 6-second-choice run still released at
 * the pin and scored zero after ballistic carry. This supersedes the 1100 m
 * historical measurement above: defense hands off at 2200 m and the fixed
 * malfunction sequence begins at 1600 m, leaving roughly 550 m of lead. */
const BOMB_MALFUNCTION_TRIGGER_M = 1600;

/* THE APPROACH RECORD STARTS BEFORE THE APPROACH PHASE.
 *
 * Owner QA, 2026-08-28: "The music leading into the Fat Squatch bomb drop
 * needs to begin earlier." The former trigger was the `bombApproach` handoff
 * at 2200 m. At the authored ~62 m/s run-in that left only about 26 seconds
 * before an ordinary read-the-lines release, throwing away roughly twelve
 * seconds of the delivered 37.704 s master. Starting at 2800 m gives that
 * missing ten-second breath while the player is still flying the approach;
 * the release frame remains the authoritative hard cut. Exported so the
 * regression test and browser verifier do not retype the distance. */
export const BOMB_APPROACH_MUSIC_LEAD_M = 2800;

/* ------------------------------------------------------------------ */
/* THE TWO DIAMONDS                                                    */
/*
 * Owner, 2026-08-06: "I also want a diamond marker on the city where to drop
 * the bomb and a diamond marker on the airport for the return."
 *
 * Both are the HUD this project already has for exactly this. `FlightHud` (the
 * unmodified `src/beefrun/hud.js`, driving the identical markup already sitting
 * in `enolasquatch.html`) carries a pair that are fed from ONE target so they
 * can never disagree:
 *
 *   `setDirection()`  an amber diamond projected onto the place itself, with
 *                     the range under it — and, the moment the place goes off
 *                     the glass, an arrowhead pinned to the edge of the frame
 *                     pointing at it. That is the marker the owner asked for,
 *                     and it is legible at nine kilometres for the same reason
 *                     it is legible at two hundred metres: it is drawn on the
 *                     screen at a fixed size rather than in the world, so it
 *                     never becomes a speck and never fills the windscreen.
 *   `setNav()`        a bearing bug on the heading tape and the same range as
 *                     a number, for flying the intercept rather than eyeballing
 *                     it. `src/beefrun/mission.js` drives both together from
 *                     its own `navTarget()`; this is that idiom, on this route.
 *
 * Neither had ever been wired on this mission — the elements were in the page
 * and permanently hidden. `navTarget()` below is the whole of the new logic and
 * it is a phase lookup, which is what makes "it must not be on screen when it
 * is not that phase's job" a property of the table rather than a rule somebody
 * has to keep obeying: no entry, no marker.
 *
 * The heights are chosen so each diamond sits ON its subject from the altitudes
 * this route is actually flown at: 300 m over Squatchbourg clears the 132 m
 * tower and the smoke and puts the diamond at about eye level on a 400 m
 * bombing run, and 160 m over Whispering Pines keeps it standing on the field
 * rather than in the sky above it as the aeroplane comes down final.
 */
/* ------------------------------------------------------------------ */

export const NAV_CITY = Object.freeze({ x: TARGET_X, z: COMPOUND.z, up: 300, label: 'SQUATCHBOURG' });
export const NAV_FIELD = Object.freeze({ x: WP.x, z: WP.z, up: 160, label: 'WHISPERING PINES' });

/**
 * Which marker is up, by phase. Everything absent is deliberate:
 *
 *   walkaround / nightfall / preflight / taxi   there is no flight HUD yet.
 *   takeoff / climbTurn   the aeroplane is being flown off a runway and turned
 *     onto a heading; a diamond on a city 9 km east is not the job yet, and the
 *     turn is called by Irish.
 *   explosion / escape / emergency   the city has just stopped existing (a
 *     marker on a crater saying DROP HERE is the wrong sentence) and the job is
 *     to get clear of it and sort out an engine. The way home is Sasole's line
 *     and the heading bug picks it up again the moment `return` starts.
 *   epilogue   it is over.
 */
export const NAV_BY_PHASE = Object.freeze({
  cruise: NAV_CITY,
  detection: NAV_CITY,
  defense: NAV_CITY,
  bombApproach: NAV_CITY,
  bombMalfunction: NAV_CITY,
  release: NAV_CITY,
  return: NAV_FIELD,
  landing: NAV_FIELD,
});

const _navPos = new THREE.Vector3();
/** Scratch for the tail gun's own `follow` callback — see `gunner.onShot`. */
const _gunSoundAt = new THREE.Vector3();
const _navView = new THREE.Matrix4();

/**
 * THE CREW SAY IT AGAIN.
 *
 * `DialogueSystem.play(id, { once: true })` never repeats a beat, which is
 * exactly right the first time through and wrong after a restart: a player who
 * restored the checkpoint and flew the bombing run a second time did the whole
 * thing in silence — nobody called the city in sight, nobody said "package
 * away", nobody reacted to the flash — because every one of those beats was
 * already in `dialogue.played` from the attempt that killed him. That is not a
 * separate bug from the empty crater and the missing bomb; it is the same one
 * seen from the crew's seats, and `DialogueSystem.forget()` exists for it.
 *
 * Keyed by checkpoint, listing the `BEATS` id PREFIXES (see
 * `../dialogue/script.js`) belonging to the legs that checkpoint replays.
 * Everything BEFORE the restore point is deliberately absent — a restart at the
 * target should not make the crew do the walkaround banter again.
 */
const REPLAYED_BEATS = Object.freeze({
  takeoff: ['takeoff.', 'climb.', 'cruise.', 'nav.', 'detect.', 'defense.', 'fighters.',
    'auto.', 'gun.', 'bomb.', 'explosion.', 'escape.', 'emergency.', 'landing.'],
  turnOnCourse: ['cruise.', 'nav.', 'detect.', 'defense.', 'fighters.',
    'auto.', 'gun.', 'bomb.', 'explosion.', 'escape.', 'emergency.', 'landing.'],
  preRelease: ['bomb.', 'explosion.', 'escape.', 'emergency.', 'landing.'],
  return: ['landing.'],
});

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
/** A heading as the crew say it and the HUD prints it: 090, not 90. */
export function headingLabel(deg) {
  return String(Math.round(((deg % 360) + 360) % 360)).padStart(3, '0');
}

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
    /* FOR SHOW. One assignment, applied to an injected `Defense` as readily as
     * to one built here, because the flag is a property of THIS MISSION rather
     * than of the class — see `LIVE_FIRE` in ../config.js for what it does and
     * does not switch off, and `Defense._resolveHit()` for the one line it
     * gates. Set `__enolaSquatch.defense.liveFire = true` to take the beating
     * back. */
    this.defense.liveFire = LIVE_FIRE.flak;
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
    /* Whether ANYBODY is working the gun right now — the player in the turret
     * or the Shubenator with something to shoot at. Separate from `gunFiring`
     * on purpose: `EnolaSquatch.updateRearGun()` used to track the aim point
     * only while the trigger was down, which is the "the gun does not track,
     * it snaps when you fire" defect from the 2026-08-19 playtest. */
    this.gunTracking = false;
    this.gunAim = new THREE.Vector3();
    /* The navigation chain's and the return leg's own bookkeeping — see
     * `callNewHeading()`, `nagHeading()`, `offerTailGun()` and `RETURN_WAVES`. */
    this.navHeading = null;
    /** True once Sasole has handed the tail gun over — see `offerTailGun()`. */
    this.gunOffered = false;
    this._returnT = 0;
    this._escapeMusicStarted = false;
    this._bombApproachMusicStarted = false;
    this._nearFieldT = 0;
    this._waveIndex = 0;
    this._airborneT = 0;
    this._headingBannerT = 0;
    this._headingNagT = 0;
    this._headingNagIndex = 0;
    this._gunBurst = 0;
    this._gunRest = 0;
    /** Counts down between rounds of the Shubenator's burst — see `updateRearGunner()`. */
    this._gunSoundT = 0;

    /* The blast, as the rest of the page sees it. `blastFlash` is the 0..1
     * whiteout `../main.js` paints over the whole screen; `blastTint` is the
     * colour it cools through as the eye comes back. */
    this.blastFlash = 0;
    this.blastTint = { r: 1, g: 1, b: 1 };
    /* And `blastWash` is the front itself crossing the camera — a second,
     * dirtier overlay that sweeps once as the shock goes past. Separate from
     * the flash on purpose: the flash is light and arrives instantly, the wash
     * is pressure and arrives when it gets there. */
    this.blastWash = 0;
    this._shockArrived = false;
    this._blastSoundFired = false;
    this._blastTurb = 0;
    this._blastTurbPeak = BASE_TURB;
    /* The drop camera experiment — see `DROP_CAM_SECONDS`. Public and
     * writable: set it false and the camera never moves itself. */
    this.cinematicDrop = true;
    this._dropCam = 0;
    this._dropCamFrom = null;

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

    /* THE ONE AUTHORED ENGINE PROBLEM — see `triggerEngineOut()`. */
    this._engineOutFired = false;
    this._engineOutIndex = null;
    this._engineSmoke = null;
    this._engineSmokeT = 0;

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
      /* The splinters are still heard, every time. `LIVE_FIRE.flak` only ever
       * gates what they COST — see that flag. Note that the sound is outside
       * the guard on purpose: a near miss you cannot hear is not a near miss. */
      this.audio?.shrapnel?.(clamp(1 - distance / 95, 0, 1));
      if (!LIVE_FIRE.flak) return;
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
    this.interceptors.onHit = (severity, fighter) => this.onFighterHit(severity, fighter);
    this.interceptors.onKill = () => {
      this.score.fightersDestroyed++;
      this.dialogue.play('fighters.down', { once: false });
      /* THE SEND-OFF. A kill is the whole payoff of the turret, so it gets a
       * breakup and an engine screaming its way down. Both cues are optional
       * recordings (`assets/sfx/manifest.json`, `enola.interceptor.*`) with
       * synth fallbacks in `src/core/audio.js` — a missing file degrades to
       * the synth, never to silence, never to a broken scene. */
      this.audio?.play?.('enola.interceptor.breakup', { volume: 0.7, rate: 0.95 + Math.random() * 0.1 });
      this.audio?.play?.('enola.interceptor.scream', { volume: 0.55, rate: 0.96 + Math.random() * 0.08 });
    };
    this.interceptors.onWounded = () => {
      /* Hurt past the threshold: it lights up and runs for home. The scream
       * is quieter and higher — an engine over-revving to get away, not one
       * on its way in. */
      this.audio?.play?.('enola.interceptor.scream', { volume: 0.4, rate: 1.08 });
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
    /* THE WEIGHT OF IT, IN FOUR LAYERS.
     *
     * Owner playtest, 2026-08-19: *"Audio: deeper mechanical report, sharper
     * initial crack, heavy repeating rhythm, bolt/action layer, aircraft
     * resonance, low-frequency punch, distant tail. It should sound like a
     * large mounted aircraft gun, not an angry office stapler."*
     *
     * One sample cannot be all of those at once, so it is not asked to be.
     * `enolasquatch.gun.rear` stays the body of the report and three new cues
     * sit on it (see `assets/sfx/manifest.json`):
     *
     *   .crack  the supersonic transient, at full rate and no pitch wander, so
     *           the front edge of every round is hard and identical — that is
     *           what makes a burst read as fast rather than as mush.
     *   .bolt   the action. Detuned per round, because the mechanical half is
     *           where a real gun's rhythm lives and identical mechanism hits
     *           are exactly what turned this into a stapler.
     *   .body   the low-frequency punch and the tail boom answering it, pitched
     *           DOWN and long enough to overlap the next round, so a burst
     *           stacks into a shudder instead of a series of separate events.
     *
     * The fourth, `.tail`, is the report going away across open air, and it
     * plays on roughly every fifth round only — on every round it would be mud.
     *
     * All four go through `follow`, so they stay glued to the muzzle as the
     * aeroplane moves rather than being left behind at a fixed world point (see
     * `src/core/audio.js`'s `play()` option). */
    this.gunner.onShot = () => {
      const follow = () => this.gunner.eyeWorld(_gunSoundAt);
      this.audio?.play?.('enolasquatch.gun.rear', {
        volume: 0.5, rate: 0.94 + Math.random() * 0.12, follow,
      });
      this.audio?.play?.('enolasquatch.gun.rear.crack', { volume: 0.42, follow });
      this.audio?.play?.('enolasquatch.gun.rear.bolt', {
        volume: 0.34, rate: 0.9 + Math.random() * 0.2, follow,
      });
      this.audio?.play?.('enolasquatch.gun.rear.body', {
        volume: 0.55, rate: 0.82 + Math.random() * 0.08, follow,
      });
      this._gunTailCount = (this._gunTailCount ?? 0) + 1;
      if (this._gunTailCount % 5 === 0) {
        this.audio?.play?.('enolasquatch.gun.rear.tail', { volume: 0.28, follow });
      }
    };
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
    /* OUTBOUND, YOU ARE THE PILOT.
     *
     * Owner playtest, 2026-08-19: *"Outbound: player stays pilot. NO
     * tail-gunner takeover at all."*
     *
     * The tail gun used to be available from wheels-up, which meant the leg
     * with the navigation, the stealth corridor and the bombing run in it could
     * be flown from the back of the aeroplane by a gyro — and the leg home,
     * which has nothing else to do, was the one with the fewest reasons to go
     * back there. The whole toy is now the return leg's, and the switch is
     * thrown by `offerTailGun()` when the first wave arrives, not by a phase
     * name typed in here: if the offer has not been made, T says why. */
    if (!this.gunOffered) {
      this.dialogue.bark('gunRefused');
      this.hud?.say?.(
        '<em>Not yet.</em> You are flying her. The Shubenator has the tail until somebody says otherwise.',
        3600,
      );
      return false;
    }
    if (!this.autopilot.engaged && !this.autopilot.engage({})) {
      this.dialogue.bark('autoRefused');
      this.hud?.say?.('<em>Not from here.</em> Nobody can leave the seat until the gyro will hold her — wings level, out of the stall, above the deck.', 3600);
      return false;
    }
    this.gunner.take();
    this.crew?.setRearGunnerManned?.(true);
    this.gunFiring = false;
    this.gunTracking = false;
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
   * THE OTHER HALF OF IT — owner, 2026-08-06: "The enola restart from latest
   * checkpoint bug still happens where everything is already blown up and I
   * cant redrop the bomb."
   *
   * This comment used to say the flattened target was fine and left alone —
   * "you get to drop it again on what is left". That was wrong, and it was the
   * bug the owner was still hitting: a bomb back on the mount is no use over a
   * city that is already a hole, and `TargetCity.destroy()` had no undo at all,
   * so `destroyed` stayed true forever and the second run was flown at an empty
   * crater. `restoreCheckpoint()` now calls `TargetCity.restore()` (and
   * `onCrater(null)`, which fills the hole back in in the composition root's own
   * ground function and ground mesh) for every checkpoint at or before
   * `preRelease`. The bomb and the city come back together, because either one
   * without the other is still an unwinnable restart.
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

  /**
   * Come forward out of the turret and back into the pilot's seat.
   *
   * THE AUTOPILOT COMES OFF WITH YOU — owner playtest, 2026-08-06: "When the
   * player returns to the pilot seat, autopilot should disengage
   * automatically." It used to leave the gyro flying, so a player who had
   * come forward again — hands back on the yoke, by every other signal — was
   * still being flown until he separately remembered to hit <em>P</em>, which
   * read as the key not having worked at all (the same shape of bug
   * `updateLanding()` already guards against by doing exactly this pair of
   * calls on its own, forced way back into the seat for the final approach —
   * see there). `disengage(null)` — not a `reason` — is the same call
   * `toggleAutopilot()` makes for a player-requested hand-back, so it plays
   * the identical cue this scene already uses for "the player turned the
   * autopilot off himself": `auto.off` on the radio and the fighters'
   * predictability reset, never `auto.kicked`, because nothing forced this.
   */
  leaveGun() {
    if (!this.gunner.manned) return false;
    this.gunner.leave();
    this.crew?.setRearGunnerManned?.(false);
    this.gunFiring = false;
    this.gunTracking = false;
    this.dialogue.play('gun.leave', { once: true });
    if (this.autopilot.engaged) this.autopilot.disengage(null);
    /* Back in the seat, back to a navigation objective — the owner's "NEVER
     * leave the player without a navigation objective" applies to the man
     * climbing out of the turret as much as to the man who just took off. */
    if (this.phase === 'return') {
      this.setObjective(`${OBJECTIVES.RETURN} Heading ${headingLabel(RETURN_HEADING)} for Whispering Pines.`);
    }
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

  /**
   * A fighter's round connected.
   *
   * Everything above the `LIVE_FIRE.fighters` guard is what the player SEES and
   * HEARS about being hit — the aeroplane lurching, the rounds striking the
   * skin, and Sasole saying so — and it happens whether or not the fighters are
   * shooting live. Everything below it is what being hit COSTS, and that is the
   * half the owner asked to be turned off; see `LIVE_FIRE` in `../config.js`.
   */
  onFighterHit(severity, fighter = null) {
    this.cameras?.addShake?.(0.35 + severity * 0.5);
    this.audio?.shrapnel?.(severity);
    this.dialogue.bark('fighterHitUs');
    if (!LIVE_FIRE.fighters) return;
    this.physics.damage.wing = clamp(this.physics.damage.wing + severity * 0.05, 0, 1);
    if (Math.random() < 0.34 * severity) {
      /* A priority-profile fighter (`Interceptors.js`, THE PROFILES) came in
       * with a specific healthy nacelle in mind — bill the hit to it. Anyone
       * else's rounds land wherever the roll says. */
      const aimed = fighter?.targetEngine ?? -1;
      if (aimed >= 0 && !this.defense.damage.engines[aimed]) {
        this.defense.damageEngine(aimed);
      } else {
        const alive = this.defense.damage.engines.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
        if (alive.length) this.defense.damageEngine(alive[Math.floor(Math.random() * alive.length)]);
        else this.defense.damageElectrical();
      }
    }
    if (this.autopilot.engaged && Math.random() < 0.45) this.autopilot.disengage('hit');
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
    /* The interaction is a route into the aeroplane, not a magic cut through
     * its paint. Open the authored leaf before guiding the player onto it. */
    this.aircraft.setCrewDoorOpen?.(true);
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
    /* Nobody takes off with the Fat Squatch still on the concrete. `forceSeat()`
     * finishes the trolley sequence wherever it had got to — see
     * `../payload/BombTrolley.js` — so a player who climbs the ladder half a
     * second after pressing E still leaves with a bomb aboard. */
    if (this.bombTrolley && !this.bombTrolley.loaded) this.bombTrolley.forceSeat();
    this.aircraft.setCrewDoorOpen?.(false);
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
    /* Beef Run's cockpit contract: the controls card is raised every time the
     * player enters the seat, on the left, then ages to its quieter state.
     * Enola shared the HUD and markup but skipped both lifecycle calls, which
     * left the familiar 1/2/3/4 start controls permanently hidden. */
    this.flightHud?.showControls?.(true);
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
    /* Settle the marker on the frame the phase changes rather than on the next
     * flying frame. `updateFlightCommon()` — where it is driven from — is not
     * called during the walkaround, the start-up or the epilogue, so a marker
     * left up by the phase before would simply stay on the glass: land, roll
     * out, and WHISPERING PINES 0.0 NM would sit over the report card. */
    this.updateNavMarker();
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
        this._airborneT = 0;
        this.navHeading = null;
        this._headingBannerT = 0;
        this._headingNagIndex = 0;
        break;

      case 'cruise':
        /* The heading stays on the glass after the turn is flown. "Hold your
         * heading" is not an instruction if the screen has stopped saying
         * which one, and the owner's rule for this whole chain is that the
         * player is NEVER without a navigation objective. */
        this.navHeading = TURN_POINT.newHeading;
        this.setObjective(`${OBJECTIVES.CRUISE} Heading ${headingLabel(TURN_POINT.newHeading)}.`);
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
        /* Organic flight has already started this during the defense run, at
         * `BOMB_APPROACH_MUSIC_LEAD_M`. Keep this call as the checkpoint and
         * direct-phase fallback; the once gate prevents the phase boundary
         * from restarting the record ten seconds in. */
        this.startBombApproachMusicOnce();
        this._escapeMusicStarted = false;
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
        /* Backstop the exact release-frame cut. There is intentionally no
         * music under the falling bomb, flash, pressure front or first beat of
         * aftermath. */
        this.audio?.stopBombApproachMusic?.(0.04);
        this._escapeMusicStarted = false;
        this._explosionT = 0;
        break;

      case 'escape':
        this.setObjective(OBJECTIVES.ESCAPE);
        this.gunFiring = false;
        this.gunTracking = false;
        this.dialogue.play('escape.turn', { once: true, delay: 0.5 });
        this.weather.setConditions({ turbulence: 0.95, lightning: 0.3 });
        this.bombBayOpen = false;
        this._escapeT = 0;
        this._escapeMusicStarted = false;
        this._emergencyDecided = false;
        break;

      case 'emergency': {
        /* ENGINE OVERHEATING — THROTTLE BACK.
         *
         * See the `emergency.*` block in `../dialogue/script.js` for the owner
         * note this answers. The objective NAMES the fault, the objective NAMES
         * the control, and `updateEmergency()` will not leave this phase until
         * the throttle has actually come back — the three things the old
         * "Handle the engine — your call" had none of.
         *
         * `_emergencyResolved` is set true here on purpose: it is what
         * `../main.js` reads to decide whether to raise the three-option choice
         * panel, and this beat is no longer a menu. The engine is fixed with the
         * throttle, which is a control the player already has. */
        this.setObjective(OBJECTIVES.ENGINE_OVERHEAT);
        this.dialogue.play('emergency.overheat', { urgent: true });
        this.dialogue.play('emergency.throttleBack');
        this.engines.scriptOverheat(this._emergencyEngineIndex, 70);
        this._emergencyResolved = true;
        this._emergencyPushFailAt = null;
        this._throttleBackT = 0;
        this._throttleNagT = ENGINE_FIX.nagEvery;
        this._engineStabilised = false;
        this.armCombatInstruction(
          `<b>ENGINE OVERHEATING</b> — number three. Pull the throttle back with <b>${ENGINE_FIX.key}</b>`
          + ' and hold it there while she cools.', 9000,
        );
        break;
      }

      case 'return':
        this._returnT = 0;
        this._nearFieldT = 0;
        this._waveIndex = 0;
        this.gunOffered = false;
        this.navHeading = RETURN_HEADING;
        this.setObjective(`${OBJECTIVES.RETURN} Heading ${headingLabel(RETURN_HEADING)} for Whispering Pines.`);
        this.saveCheckpoint('return');
        this.detection.active = false;
        this.weather.setConditions({ turbulence: 0.5, lightning: 0.1, cloudDensity: 0.5 });
        this._navCallTimer = 4;
        /* Ordinary play already has this record running from `updateEscape`.
         * A direct return-checkpoint restore does not, so resume it without
         * restarting a live handle. */
        if (!this._escapeMusicStarted) {
          this._escapeMusicStarted = this.audio?.startEscapeMusic?.({ restart: false }) === true;
        }
        break;

      case 'landing':
        this.setObjective(OBJECTIVES.LANDING);
        this.dialogue.play('landing.line', { once: true, delay: 0.6 });
        this.weather.setConditions({ night: 0.7, dusk: 0.85 });
        break;

      case 'epilogue':
        this.dialogue.play('arrival.sasole', { delay: 1.0 });
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
    // For the same reason: the drop camera outlives the `release` phase by
    // design, because the phase ends the instant the bomb leaves the mount.
    this.updateDropCamera(dt);

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
    /* The trolley runs on the mission clock like everything else on the apron.
     * It is a three-leg timer with no branches and nothing waits on it — see
     * `../payload/BombTrolley.js` — so this can never hold the walkaround. */
    this.bombTrolley?.update?.(dt);
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
      cs.sub = 'SQUATCHOLA GAY, lined up and holding';
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
    const p = this.physics;
    if (!p.onGround) this._airborneT += dt;
    const gate = evaluateClimbTurnProgress({
      x: p.position.x,
      z: p.position.z,
      agl: p.agl,
      headingDeg: p.headingDeg,
      turnCalled: this.flags.turnCalled,
      onCourseSeconds: this._onCourseT,
      airborneSeconds: this._airborneT,
    }, dt);
    if (gate.callTurn) this.callNewHeading(TURN_POINT.newHeading);
    this._onCourseT = gate.onCourseSeconds;

    /* THE BANNER, THEN THE OBJECTIVE.
     *
     * Owner: *"update the HUD/navigation marker, show NEW HEADING prominently
     * for several seconds, put the heading into the persistent objective
     * afterwards, and have the compass/nav indicator visibly point at it."*
     *
     * Three separate readouts with three different lifetimes, and they hand off
     * in that order: `hud.say()` is the loud one and it expires; the objective
     * is the quiet one and it does not; the compass bug is fed by
     * `navTarget()`, which now returns a point 40 km down the called heading
     * while this phase is running (see `NAV_BY_PHASE` and `navTarget()`). */
    if (this.flags.turnCalled) {
      this._headingBannerT -= dt;
      if (this._headingBannerT <= 0) {
        this.setObjective(`${OBJECTIVES.CLIMB_TURN} — heading ${headingLabel(TURN_POINT.newHeading)}.`);
      }
      this.nagHeading(dt, TURN_POINT.newHeading, gate.headingError);
    }
    if (gate.ready) this.setPhase('cruise');
  }

  /**
   * Call a new heading, once, and make sure the player cannot miss it.
   *
   * Owner: *"Radio dialogue must be subordinate to gameplay: if another
   * character is talking when the nav trigger fires, QUEUE the heading
   * instruction and play it immediately afterwards rather than losing it."*
   *
   * `DialogueSystem.play()` already appends to a queue rather than dropping,
   * so the SPOKEN half of that is safe by construction — the one thing that
   * could have lost it is `urgent: true`, which wipes the queue, and this
   * deliberately does not use it. The SCREEN half is `armCombatInstruction()`,
   * which exists for exactly this rule (see its own comment): it holds the
   * instruction until `dialogue.busy` goes false, so the character speaks and
   * then the screen clarifies, never both at once and never the screen alone.
   *
   * @param {number} deg the new magnetic heading
   */
  callNewHeading(deg) {
    if (this.flags.turnCalled) return false;
    this.flags.turnCalled = true;
    this.navHeading = deg;
    this._headingBannerT = CLIMB_TURN_GATE.bannerSeconds;
    this._headingNagT = CLIMB_TURN_GATE.nagAfter;
    const turnBeat = CLIMB_TURN_BEAT_BY_HEADING[((Math.round(deg) % 360) + 360) % 360];
    if (turnBeat) this.dialogue.play(turnBeat, { once: true });
    /* NEW HEADING goes on the glass through `armCombatInstruction()`, NOT
     * through `hud.say()` directly — `DialogueSystem` subtitles the crew
     * through that same `hud.say`, so a banner raised while Irish is mid-line
     * would delete his line off the screen, which is the opposite of "radio
     * dialogue must be subordinate to gameplay". Held until the queue is
     * quiet, then shown for `bannerSeconds`; the objective below carries the
     * heading from the first frame regardless, so nothing is ever unstated. */
    this.armCombatInstruction(
      `<b>NEW HEADING ${headingLabel(deg)}</b> — bank onto it and hold it. `
      + 'The bug on the compass tape is where it is.',
      CLIMB_TURN_GATE.bannerSeconds * 1000,
    );
    this.setObjective(`Turn onto heading ${headingLabel(deg)}.`);
    this.updateNavMarker();
    return true;
  }

  /**
   * Nag a player who has been given a heading and has not started turning.
   *
   * Owner: *"If the player has not started turning toward the heading within
   * ~15-20s, Capt Lou nags... Irish or Sasole can repeat periodically. NEVER
   * leave the player without a navigation objective."*
   *
   * The condition is deliberately "has not STARTED turning" rather than "is not
   * on the heading": a loaded bomber takes a long time to come round, and
   * barking at a man who is already banking is worse than saying nothing.
   * `respondingWithin` is the error that counts as underway.
   *
   * @param {number} dt
   * @param {number} deg the heading he was given
   * @param {number} headingError absolute degrees off it
   */
  nagHeading(dt, deg, headingError) {
    void deg;
    if (headingError < CLIMB_TURN_GATE.respondingWithin) {
      // He is on his way. Reset the clock so a later wander gets a fresh leash.
      this._headingNagT = CLIMB_TURN_GATE.nagAfter;
      return false;
    }
    this._headingNagT -= dt;
    if (this._headingNagT > 0 || this.dialogue.busy) return false;
    this._headingNagT = CLIMB_TURN_GATE.nagEvery;
    /* Sasole first, because it is his aeroplane, then the two of them
     * alternating — the same instruction from two men reads as a crew getting
     * impatient rather than as one line on a loop. */
    const nags = ['nav.nag.sasole', 'nav.nag.irish', 'nav.nag.sasoleAgain'];
    const id = nags[this._headingNagIndex % nags.length];
    this._headingNagIndex += 1;
    this.dialogue.forget(id);
    this.dialogue.play(id);
    return true;
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
      this.gunTracking = false;
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
    // He tracks it whether or not he is squeezing the trigger this instant.
    this.gunTracking = true;
    if (this._gunBurst > 0) {
      this._gunBurst -= dt;
      this.gunFiring = true;
      if (this._gunBurst <= 0) {
        // Trigger off, barrels still on the fighter — the rest between bursts
        // is not the gun losing interest.
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
        const follow = () => this.aircraft.rearGunMuzzleWorld(_gunSoundAt);
        this.audio?.play?.('enolasquatch.gun.rear.cabin', {
          volume: 0.34, rate: 0.92 + Math.random() * 0.16, follow,
        });
        /* Same weapon, different seat: he gets the airframe resonance too,
         * because that layer is the tail boom and the tail boom is between the
         * two of them. He does NOT get the muzzle crack — that belongs to
         * whoever is sitting behind it. */
        this.audio?.play?.('enolasquatch.gun.rear.body', {
          volume: 0.3, rate: 0.8 + Math.random() * 0.08, follow,
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

  /**
   * How long the Fat Squatch will be in the air.
   *
   * `FatSquatch.update()` integrates a bare ballistic arc — gravity, no drag,
   * nothing to hit — so the closed form is exact: from `h` metres up with an
   * initial vertical velocity `vy` (up positive), the time to the ground is
   * `(vy + sqrt(vy^2 + 2gh)) / g`.
   *
   * IT WAS WRONG IN TWO WAYS, and the whistle being a synthesised sweep with a
   * soft bottom to it is why nobody could hear either. A recording scheduled to
   * END on the impact hears both immediately. Measured on the real route by
   * `tools/verify-enola-bomb-audio.mjs`, which is where these numbers are from:
   *
   *   THE SIGN. It computed `v0 = max(0, -velocity.y)` — the DESCENT rate as a
   *     positive number — and then added it, which is the arc of something
   *     thrown UPWARD at that speed. A bomb let go from an aeroplane already
   *     going down arrives SOONER, not later, and the error is 2·v0/g: on this
   *     route, with the aeroplane trimmed 2.2 m/s down on the run in, 0.44 s.
   *     The clamp hid the other half of it — an aeroplane in a climb really
   *     does throw the bomb up, and that case was being thrown away.
   *
   *   WHICH GROUND. `h` was measured from the terrain directly under the
   *     AEROPLANE, and the bomb does not land there: it keeps the aeroplane's
   *     sixty metres a second and comes down half a kilometre downrange, where
   *     the ground is twenty-one metres higher. Worth another 0.26 s.
   *
   * Two correction passes settle the second one — a first guess to find out
   * where the thing is going, the height there, then the same again. It
   * converges immediately (fourth pass moves it by 0.07 ms) because the
   * correction is small compared with the fall.
   *
   * Measured from the PAYLOAD once it is off the mount, which is where it
   * actually is: two metres below the aeroplane's datum, with the aeroplane's
   * velocity. Before that — nothing else calls this today — from the aeroplane.
   *
   * @returns {number} seconds
   */
  predictFall() {
    const off = this.payload?.released && !this.payload.impacted;
    const from = off ? this.payload.group.position : this.physics.position;
    const vel = off ? this.payload.velocity : this.physics.velocity;
    const timeFrom = (h) => (vel.y + Math.sqrt(vel.y * vel.y + 2 * 9.81 * Math.max(1, h))) / 9.81;
    let fall = timeFrom(from.y - this.groundAt(from.x, from.z));
    for (let i = 0; i < 2; i++) {
      fall = timeFrom(from.y - this.groundAt(from.x + vel.x * fall, from.z + vel.z * fall));
    }
    return fall;
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
    /* Rare, mission-scripted safety valve — see the class header and
     * `Defense.js`'s own doc comment: nothing in Defense itself ever calls
     * `triggerCatastrophic`. Deliberately a high, explicit threshold rather
     * than a per-frame chance, so it stays a genuinely unlikely outcome.
     *
     * While the guns are firing blanks (`LIVE_FIRE.flak`, ../config.js) this
     * can never fire on its own: `hitCount` and `damage.engines` are only
     * written by the four `damageX()` methods, and the only thing that still
     * calls those is the blast wave. Left standing rather than deleted — it is
     * the whole point of the flag that the fight is one boolean away. */
    const enginesDown = this.defense.damage.engines.filter(Boolean).length;
    if (!this.defense.damage.catastrophic && this.defense.hitCount >= 6 && enginesDown >= 3) {
      this.defense.triggerCatastrophic('overwhelmed');
    }
    /* THE ONE AUTHORED ENGINE PROBLEM — see the constants at the top of the
     * file. Toward the end of the flak/fighter stretch, not the start of it. */
    if (!this._engineOutFired && p.position.x > ENGINE_OUT_TRIGGER_X) this.triggerEngineOut();
    if (p.position.x > TARGET_X - BOMB_APPROACH_MUSIC_LEAD_M) {
      this.startBombApproachMusicOnce();
    }
    if (p.position.x > TARGET_X - 2200) {
      this.defense.suppress();
      this.setPhase('bombApproach');
    }
  }

  /** Start the delivered target-run record once, with checkpoint-safe retry. */
  startBombApproachMusicOnce() {
    if (this._bombApproachMusicStarted) return true;
    this._bombApproachMusicStarted = this.audio?.startBombApproachMusic?.() === true;
    return this._bombApproachMusicStarted;
  }

  /**
   * See the `ENGINE_OUT_*` constants for the whole of the reasoning. A
   * derate, not a kill: `EngineSystem.damage()` takes `ENGINE_OUT_INDEX`'s
   * health down to `ENGINE_OUT_HEALTH_FLOOR` and leaves it running — rougher,
   * a little slower on the tach, trailing smoke — which is what "engine goes
   * out" reads as here without touching `defense.damage.engines` (that array
   * is reserved for real combat/blast damage and is what later arms the
   * separate `updateEscape()` / `updateEmergency()` engine-emergency choice;
   * setting it here would make this ONE authored beat silently spawn a
   * second one on the way home).
   */
  triggerEngineOut() {
    if (this._engineOutFired) return;
    this._engineOutFired = true;
    this._engineOutIndex = ENGINE_OUT_INDEX;
    this.engines.damage(ENGINE_OUT_INDEX, ENGINE_OUT_HEALTH_LOSS, ENGINE_OUT_HEALTH_FLOOR);
    this.cameras?.addShake?.(0.45);
    this.dialogue.play('defense.engineStrain', { once: true });
  }

  /**
   * The visible half of `triggerEngineOut()`: a thin, steady trail off the
   * derated engine's exhaust for the rest of the attempt — the "prop" half of
   * "visible engine-out (smoke/prop)" is already free (a damaged engine's
   * lower `health` already pulls its RPM, and therefore its visual prop
   * speed, down in `EnolaSquatch.update()`; nothing here needs to touch it).
   *
   * Reuses `src/world/smoke.js`'s `SmokeSystem` — the same pooled billboard
   * sprites the apartment's cigarette uses — at aeroplane scale instead of
   * cigarette scale, rather than building a second particle system for one
   * prop. Built lazily so a flight that never reaches the trigger never pays
   * for the pool.
   */
  updateEngineOutSmoke(dt) {
    if (this._engineOutIndex === null || !this.aircraft || !this.scene) return;
    if (!this._engineSmoke) this._engineSmoke = new SmokeSystem(this.scene);
    this._engineSmokeT += dt;
    if (this._engineSmokeT < 0.10) return;   // ~10 puffs/second — a trail, not a firehose
    this._engineSmokeT = 0;
    if (!this._engineSmokeOrigin) this._engineSmokeOrigin = new THREE.Vector3();
    if (!this._engineSmokeDir) this._engineSmokeDir = new THREE.Vector3();
    const origin = this.aircraft.exhaustPoint(this._engineOutIndex, this._engineSmokeOrigin);
    // Trails aft and slightly down off the nacelle regardless of airspeed —
    // the aeroplane's own -Z (tail-ward), not the (possibly near-zero) velocity.
    const back = this._engineSmokeDir.set(0, -0.08, -1).applyQuaternion(this.physics.quat).normalize();
    this._engineSmoke.emit(origin, back, {
      count: 2, speed: 4.5, spread: 1.6, size0: 1.4, size1: 6, life: 3.4, peak: 0.5, rise: 0.25,
    });
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

    /* The malfunction has a fixed hold/choice/kick duration. A predictable
     * lead point gives the bomb's retained horizontal velocity room to carry
     * it onto the city; starting on an early alignment gate made the best
     * pilot release short and a late fallback carried everyone else long. */
    if (this.targeting.distance < BOMB_MALFUNCTION_TRIGGER_M) {
      this.setPhase('bombMalfunction');
    }
  }

  /* ---- Bomb-bay malfunction ---- */

  updateBombMalfunction(dt) {
    if (!this._resetPlayed && this.phaseTime > 1.0) {
      this._resetPlayed = true;
      this.dialogue.play('bomb.manualReset', { once: true, delay: 0.4 });
    }
    /* Once the manual reset starts, it is committed. Steering can move the
     * target under the aeroplane but cannot undo elapsed choreography; only
     * the mission's public pause guard (at the top of `update`) stops time. */
    this._malfHoldT += dt;
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
        /* The drop itself is silent score-wise. This is the authoritative
         * edge, not entering the choice phase: a player may hold at the lever
         * as long as they like, but the music leaves on the exact frame the
         * bomb does. A 40 ms ramp only removes the digital click. */
        this.audio?.stopBombApproachMusic?.(0.04);
        this.payload.release(this.scene, this.physics.velocity.clone());
        this.payloadReleased = true;

        /* The pheeeeeew. Started HERE, on the same frame `payload.release()`
         * lets the mount go — the cue belongs to the release action itself,
         * never to a later beat (owner playtest, 2026-08-18: "The Pheeeeeww
         * sound effect needs to play right away when you drop the bomb").
         * It lives in the mission rather than inside `FatSquatch` because the
         * payload is a passive prop and knows nothing about audio, and because
         * the length of the fall is a physics question the mission can answer
         * and the prop cannot — see `predictFall()`. Handing that length to
         * the whistle is what lets it be audible from this frame AND still
         * bottom out as the bomb arrives — see `fallingWhistle`'s own header.
         * `onPayloadImpact` cuts it, and so does `restoreCheckpoint`. */
        const fall = this.predictFall();
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
        this.startDropCamera();
        this.setPhase('explosion');
      }
    }
  }

  /* ---- The drop camera ----
   *
   * Owner: "Maybe we experiment with moving the camera to the third person
   * automatically when you drop the bomb."
   *
   * A four-second look at your own aeroplane as the thing falls out of it, and
   * then back to whatever you were in. Three rules keep it from being the kind
   * of automatic camera people hate:
   *
   *   IT GIVES THE VIEW BACK. Not "to cockpit" — to the view the player had
   *     when it took it, whichever that was. A player flying in chase view
   *     notices nothing at all.
   *   IT LOSES ARGUMENTS. If the camera key is touched while it is running it
   *     stops immediately and does not restore anything. `CameraManager.view`
   *     is the only state it watches, so this works no matter how the player
   *     changed it.
   *   IT IS OFF IN THE TURRET. A player in the tail is already looking at
   *     something, and yanking him out of the gun is not a camera move.
   *
   * `cinematicDrop` is public and can simply be set false. It is an experiment
   * and it should be trivially switchable off.
   */

  startDropCamera() {
    if (!this.cinematicDrop || !this.cameras || this.gunner?.manned) return false;
    if (typeof this.cameras.setView !== 'function') return false;
    this._dropCamFrom = this.cameras.view;
    if (this._dropCamFrom === 'chase') { this._dropCamFrom = null; return false; }
    this.cameras.setView('chase');
    this._dropCam = DROP_CAM_SECONDS;
    this.hud?.toast?.('C — TAKE THE CAMERA');
    return true;
  }

  updateDropCamera(dt) {
    if (this._dropCam <= 0) return;
    // The player took it. Leave him alone.
    if (this.cameras?.view !== 'chase' || this.gunner?.manned) {
      this._dropCam = 0;
      this._dropCamFrom = null;
      return;
    }
    this._dropCam -= dt;
    if (this._dropCam > 0) return;
    /* Back to zero, not to whatever fraction of a frame it overshot by. It
     * used to be left at -0.02 for the rest of the mission — harmless, because
     * the `<= 0` guard above never lets it run again, and wrong in the way
     * that matters: anything reading the number to ask "is the drop camera
     * running?" got a value that is neither running nor idle. A timer that has
     * finished says zero. */
    this._dropCam = 0;
    if (this._dropCamFrom) this.cameras.setView(this._dropCamFrom);
    this._dropCamFrom = null;
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
    this.audio?.stopBombApproachMusic?.(0.02);
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
    /* The front sweeping the CAMERA — a separate overlay from the flash, and a
     * separate colour, because it is dust and pressure rather than light. See
     * `Detonation.shockWash`. `../main.js` paints it. */
    this.blastWash = det.shockWash;
    const t = det.t;

    /* The buffet dying away.
     *
     * `onShockWave` used to raise the turbulence and leave it raised, and the
     * only thing that ever put it back was a hard reset eight seconds into the
     * escape phase — so a player who lingered flew the whole way to the coast
     * through weather that was actually a blast wave from four minutes ago.
     * Owner: "simulate a BRIEF moment of turbulence." This is the brief. */
    if (this._blastTurb > 0) {
      this._blastTurb = Math.max(0, this._blastTurb - dt / BLAST_TURB_SECONDS);
      this.weather.setConditions({
        turbulence: lerp(BASE_TURB, this._blastTurbPeak, this._blastTurb),
      });
    }

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
    /* Rough air, and then not. `_blastTurb` runs 1 -> 0 over
     * `BLAST_TURB_SECONDS` in `updateDetonation`, easing the turbulence back
     * to `BASE_TURB` — so the aeroplane is thrown about while the front is
     * actually going past and flies normally afterwards. Setting the level and
     * walking away is what made the whole run home feel like a storm. */
    this._blastTurbPeak = clamp(0.6 + severity * 0.5, 0, 1.4);
    this._blastTurb = 1;
    this.weather.setConditions({ turbulence: this._blastTurbPeak });
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
    /* Twelve-plus seconds of explosion phase already pass without score. Give
     * the blast one more deliberate breath after the phase handoff, then let
     * the flight-away record rise. This is mission time, so pause and reload
     * semantics stay honest instead of a wall-clock setTimeout firing while
     * the game is stopped. */
    if (!this._escapeMusicStarted && this._escapeT >= ENOLA_ESCAPE_MUSIC_DELAY_SECONDS) {
      this._escapeMusicStarted = this.audio?.startEscapeMusic?.({ restart: false }) === true;
    }
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
    /* NO NEW FIGHTERS HERE ANY MORE. This used to scramble a wave into the
     * escape, which put the fight in the middle of the break turn and the
     * blast — the two beats that are already the loudest thing in the mission —
     * and left the long flight home with nothing in it. The whole air battle is
     * now scripted onto the RETURN leg instead, where the owner asked for it
     * (see `RETURN_WAVES`): "several distinct waves of fighters attacking from
     * behind on the RETURN leg while the plane navigates itself toward home". */
    /* The engine emergency happens to a player who came home with a damaged
     * engine, and it still can: with the guns firing blanks (`LIVE_FIRE`,
     * ../config.js) the flak and the fighters no longer put one out, but
     * `onShockWave()` does at severity > 1.1 — so the beat now belongs to the
     * player who lingered inside a kilometre of his own detonation, which is a
     * consequence he chose, rather than to whoever the barrage happened to
     * roll against. Everyone else flies home on four. */
    /* THE ENGINE PROBLEM IS NOT OPTIONAL ANY MORE.
     *
     * It used to be reachable only through `defense.damage.engines`, and with
     * `LIVE_FIRE.fighters`/`flak` off (see `../config.js`) the only thing that
     * could still fill that array was a shock wave the player had to fly into
     * — so almost nobody ever saw the beat, and the flight home was empty.
     * That is half of why the owner's note calls the whole run-home unfinished.
     *
     * Everybody gets it now, and the fiction was already written for it: this
     * is number three, the engine that has been derated and trailing smoke
     * since `triggerEngineOut()` fired on the run-in (`ENGINE_OUT_INDEX`), not
     * a new coincidence. A shock-wave or flak hit still takes priority so the
     * player who earned a different dead engine hears about that one. */
    if (!this._emergencyDecided && this._escapeT > 10 && p.agl > 220) {
      this._emergencyDecided = true;
      const engineHit = this.defense.damage.engines.findIndex(Boolean);
      this._emergencyEngineIndex = engineHit >= 0 ? engineHit : ENGINE_OUT_INDEX;
      this.setPhase('emergency');
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

  /**
   * The engine problem, as a thing the player DOES.
   *
   * Owner playtest, 2026-08-19: *"Require the player to actually reduce
   * throttle. Show engine temp/RPM falling. On clear: remove warning, update
   * objective, tell the player what happens next."*
   *
   * All four of those are here and none of them were before. `EngineSystem`
   * already does the physical half honestly — its `targetTemp` is
   * `40 + load * 192 + (hotScript > 0 ? 185 : 0)`, so pulling the levers back
   * genuinely takes 190-odd degrees out of the target and the needle genuinely
   * comes down — which means the objective can quote the REAL temperature off
   * the real engine rather than narrating a fake one.
   *
   * The gate is "throttle at or under `ENGINE_FIX.throttle` for
   * `ENGINE_FIX.holdSeconds`", not "temperature below X", because the player
   * has to be able to tell what he did that worked. Cooling then follows on its
   * own and the phase ends when the needle says so.
   */
  updateEmergency(dt) {
    const e = this.engines.engines[this._emergencyEngineIndex];
    const throttle = this.input?.throttle ?? 1;
    const back = throttle <= ENGINE_FIX.throttle;

    if (back) {
      this._throttleBackT += dt;
      /* The moment he has held it long enough, Numbskull says the second half
       * of the owner's pair — "There you go. Hold it there until she cools
       * off." — once, and the objective stops asking and starts reporting. */
      if (!this._engineStabilised && this._throttleBackT >= ENGINE_FIX.holdSeconds) {
        this._engineStabilised = true;
        this.dialogue.play('emergency.stabilised', { once: true });
      }
    } else {
      this._throttleBackT = 0;
      // He has pushed it up again. Say so rather than silently restarting.
      this._throttleNagT -= dt;
      if (this._throttleNagT <= 0 && !this.dialogue.busy) {
        this._throttleNagT = ENGINE_FIX.nagEvery;
        this.dialogue.forget('emergency.throttleBack');
        this.dialogue.play('emergency.throttleBack');
      }
    }

    /* The readout. Temperature is the thing that is wrong, so temperature is
     * what the objective counts down — and it is read off the engine, so if it
     * is not falling the player can see that it is not falling. */
    const temp = Math.round(e?.temp ?? 0);
    this.setObjective(this._engineStabilised
      ? `${OBJECTIVES.ENGINE_COOLING} ${temp}°C — hold the throttle back.`
      : `${OBJECTIVES.ENGINE_OVERHEAT} ${temp}°C.`);

    if (this._emergencyPushFailAt && this.phaseTime > this._emergencyPushFailAt) {
      this.engines.kill(this._emergencyEngineIndex, 'destroyed');
      this._emergencyPushFailAt = null;
      this.dialogue.play('emergency.shutdown', { once: true });
    }

    /* CLEARED. A stopped engine is already the answer (fuel starvation, the
     * player shutting it down from the console, a seizure); otherwise the
     * needle has to actually come back under `ENGINE_FIX.clearTemp`. Either
     * way the warning lamp goes out, the crew say what happens next, and the
     * heading home is on the glass before this method returns. */
    const stopped = !e || !e.running;
    if (stopped || (this._engineStabilised && e.temp <= ENGINE_FIX.clearTemp && e.hotScript <= 0)) {
      /* The lamp is not cleared by hand: `updateFlightCommon()` recomputes the
       * whole warning set every frame off the real engine (`temp > 245`), so
       * the HOT lamp has already gone out by the time the needle reaches
       * `clearTemp` — which is the honest version of "remove warning". */
      this.dialogue.play('emergency.cooled', { once: true });
      this.setPhase('return');
    }
  }

  /* ---- Return / landing / epilogue ---- */

  /**
   * The way home, which is now the fight.
   *
   * Owner playtest, 2026-08-19, two notes that are one design:
   *
   *   *"Outbound: player stays pilot. NO tail-gunner takeover at all. Return
   *   (after the bomb drops): enemy aircraft arrive, Capt Sasole takes the
   *   flying ('Plane's mine, you go shoot'), prompt T - TAKE OVER TAIL GUN
   *   prominently... aircraft maintains its flight path automatically."*
   *
   *   *"Script several distinct waves of fighters attacking from behind on the
   *   RETURN leg while the plane navigates itself toward home. Target roughly
   *   one to two minutes of sustained action. Vary the waves — approach angle,
   *   count, timing — so it builds rather than repeats."*
   *
   * `RETURN_WAVES` is the script and this is its clock. The leg is deliberately
   * held open until the last wave has been dealt with: `updateReturn` used to
   * hand off to `landing` on a pure x threshold, which on a fast run home could
   * cut a wave off mid-pass, and `clear()` used to fire the moment the aeroplane
   * was 5.2 km west of the target and delete the entire battle.
   */
  updateReturn(dt) {
    const p = this.physics;
    this._returnT += dt;
    this.updateNavCorrection(dt, RETURN_HEADING);

    // The next wave, when its moment comes.
    const wave = RETURN_WAVES[this._waveIndex];
    if (wave && this._returnT >= wave.at) {
      this._waveIndex += 1;
      this.interceptors.aggression = wave.aggression;
      this.interceptors.deploy({
        around: p.position,
        count: wave.count,
        delay: wave.delay,
        profiles: wave.profiles,
      });
      if (wave.call) this.dialogue.play(wave.call, { once: true });
      // The first wave is the one that hands the player the gun.
      if (this._waveIndex === 1) this.offerTailGun();
      else if (this._waveIndex === RETURN_WAVES.length) {
        this.armCombatInstruction('<b>LAST OF THEM.</b> Finish it and get back in the seat.', 6000);
      }
    }

    const wavesDone = this._waveIndex >= RETURN_WAVES.length;
    /* They do not follow you home. Anything still up once the script is spent
     * AND the aeroplane is this far west turns back, because a fighter chase
     * that never ends is not a threat, it is a chore. */
    if (wavesDone && this.interceptors.activeCount > 0 && p.position.x < TARGET_X - 12000) {
      this.interceptors.clear();
      this.dialogue.play('fighters.broke', { once: true });
    }
    // The Shubenator works it whenever the player is not.
    this.updateRearGunner(dt, this.interceptors.engagedCount > 0);

    /* Do not start the approach on top of a live pass. The x gate is still the
     * primary one; the battle can hold it open for `RETURN_FIGHT_GRACE_SECONDS`
     * after the aeroplane reaches the circuit, and no longer than that. */
    const nearField = p.position.x < WP.x + 1600;
    if (nearField) this._nearFieldT += dt;
    const battleOver = wavesDone && this.interceptors.activeCount === 0;
    if (nearField && (battleOver || this._nearFieldT > RETURN_FIGHT_GRACE_SECONDS)) {
      if (this.interceptors.activeCount > 0) {
        this.interceptors.clear();
        this.dialogue.play('fighters.broke', { once: true });
      }
      this.setPhase('landing');
    }
  }

  /**
   * "Plane's mine, you go shoot."
   *
   * Sasole takes the aeroplane, the autopilot flies the heading home, and the
   * player is TOLD — loudly, and with the key in it — that the tail gun is his
   * now. Until this runs, `toggleGun()` refuses: outbound the player is the
   * pilot and nothing else, which is the first half of the owner's note.
   *
   * @returns {boolean} whether the offer was made this call
   */
  offerTailGun() {
    if (this.gunOffered) return false;
    this.gunOffered = true;
    this.dialogue.play('fighters.sasoleTakesIt', { once: true });
    // He is flying it, so the gyro really does fly it. A refusal is survivable:
    // the player can still take the gun once he has her level.
    if (!this.autopilot.engaged) this.autopilot.engage({});
    this.armCombatInstruction(
      '<b>T — TAKE OVER TAIL GUN.</b> Captain Sasole has the aeroplane.', 10000,
    );
    this.setObjective(OBJECTIVES.TAIL_GUN);
    return true;
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
    /* The four visible crewmen own this apron. Sasole closes the flight while
     * the ground crew checks the engines; Lou waits for the repaired-mansion
     * debrief, where he has a body and the wrong-city reveal belongs. */
    if (this._epilogueT > 12 && !this.finished) {
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
    /* What the fighters are allowed to read off the aeroplane: the tail
     * turret's real state (the harasser waits for a jam, an overheat or a dry
     * belt; the priority profile attacks the quarter the gunner watches
     * least) and which engines are already dead (so a priority attacker aims
     * at a live one). See THE PROFILES in `../combat/Interceptors.js`. */
    this.interceptors.setTurretStatus({
      manned: this.gunner.manned,
      firing: this.gunFiring,
      jammed: this.gunner.jammed > 0,
      heat: this.gunner.heat,
      rounds: this.gunner.rounds,
      yaw: this.gunner.yaw,
    });
    this.interceptors.update(dt, {
      position: p.position,
      velocity: p.velocity,
      evasion: this.evasion,
      engines: this.defense.damage.engines,
    });
    const state = this.gunner.update(dt);
    if (state?.manned) {
      this.score.gunnerSeconds += dt;
      this.gunFiring = this.gunner.firing;
      /* Every frame, trigger or no trigger: this is what makes the barrels
       * follow the reticle instead of jumping onto it at the first round. */
      this.gunTracking = true;
      this.gunner.aimPoint(this.gunAim);
    }
    if (this.autopilot.engaged) this.score.autopilotSeconds += dt;
  }

  /* ---------------------------------------------------------------- */
  /* The two diamonds — see NAV_BY_PHASE at the top of this file        */
  /* ---------------------------------------------------------------- */

  /**
   * Where the marker is pointing right now, or null while it is nobody's job.
   *
   * @returns {?{x:number, z:number, up:number, label:string}}
   */
  navTarget() {
    /* THE HEADING IS A PLACE, FOR THE PURPOSES OF THE COMPASS.
     *
     * Owner: *"have the compass/nav indicator visibly point at it."*
     *
     * `NAV_BY_PHASE` is a table of DESTINATIONS, and during the climb-out there
     * is no destination yet — which is precisely why the table deliberately had
     * no `climbTurn` entry and why the bug and the diamond were both dark for
     * the one leg where the player has just been handed a heading and nothing
     * else. A heading is not a destination, but forty kilometres down it from
     * where the aeroplane is standing IS a point, and a bearing bug pointed at
     * that point reads 090 for as long as the aeroplane is anywhere near it.
     *
     * Recomputed each call off the CURRENT position rather than cached, so the
     * bug keeps reading the heading itself instead of slowly becoming a bearing
     * to a fixed spot the aeroplane is drifting past. */
    if (this.phase === 'climbTurn' && this.navHeading !== null) {
      const p = this.physics;
      const rad = (this.navHeading * Math.PI) / 180;
      return {
        x: p.position.x + Math.sin(rad) * 40000,
        z: p.position.z + Math.cos(rad) * 40000,
        up: 400,
        label: `HEADING ${headingLabel(this.navHeading)}`,
      };
    }
    return NAV_BY_PHASE[this.phase] || null;
  }

  /**
   * Put a nav target on the glass: where the diamond goes, or which way the
   * edge arrow points when the place is behind you.
   *
   * The same projection `src/beefrun/mission.js` uses, with this mission's own
   * ground sampler and per-target height instead of Beef Run's flat `+260`. The
   * view matrix is INVERTED here rather than read off `camera.matrixWorldInverse`
   * for the reason that file gives: the renderer only refreshes that when it
   * draws, and this runs before the flight camera has been pointed for the
   * frame, so the cached one belongs to the previous attitude — which on a break
   * turn is a diamond lagging the aeroplane by most of a turn.
   *
   * @param {{x:number, z:number, up:number, label:string}} nav
   * @param {number} nm range in nautical miles
   */
  projectNav(nav, nm) {
    const cam = this.camera;
    if (!cam) return null;
    cam.updateMatrixWorld();
    _navPos.set(nav.x, this.groundAt(nav.x, nav.z) + nav.up, nav.z);
    _navView.copy(cam.matrixWorld).invert();
    _navPos.applyMatrix4(_navView);
    const camX = _navPos.x;
    const camY = _navPos.y;
    const range = Math.abs(_navPos.z) || 1;
    const ahead = _navPos.z < 0;
    _navPos.applyMatrix4(cam.projectionMatrix);      // divides by w for us

    const onScreen = ahead && Math.abs(_navPos.x) <= 0.94 && Math.abs(_navPos.y) <= 0.9;
    let nx = _navPos.x;
    let ny = _navPos.y;
    if (!onScreen) {
      /* Off the glass, the arrow is aimed from the CAMERA-SPACE vector rather
       * than the projected one: a point behind the camera projects mirrored,
       * and dead astern it projects to a direction that flips from one edge of
       * the screen to the other on a metre of drift. Straight behind has no
       * side to be on at all, so it goes to the bottom — which is where you are
       * looking when you are turning back. */
      nx = camX;
      ny = camY;
      const len = Math.hypot(nx, ny);
      if (len < range * 0.02) { nx = 0; ny = -1; } else { nx /= len; ny /= len; }
      // Push it out until it touches the frame: the nearest border, not a corner.
      const s = Math.min(0.94 / (Math.abs(nx) || 1e-6), 0.9 / (Math.abs(ny) || 1e-6));
      nx *= s;
      ny *= s;
    }
    return {
      onScreen,
      x: (nx * 0.5 + 0.5) * 100,
      y: (0.5 - ny * 0.5) * 100,
      // The clip-path arrowhead points up at zero, and screen y runs down.
      angle: (Math.atan2(nx, ny) * 180) / Math.PI,
      label: nav.label,
      nm,
    };
  }

  /** Drive both halves of the marker from one target. Called every flying frame. */
  updateNavMarker() {
    const nav = this.navTarget();
    if (!nav) {
      this.flightHud?.setNav?.(null);
      this.flightHud?.setDirection?.(null);
      this.navRange = null;
      return null;
    }
    const p = this.physics;
    const dx = nav.x - p.position.x;
    const dz = nav.z - p.position.z;
    const bearing = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
    const nm = Math.hypot(dx, dz) / 1852;
    this.navRange = nm;
    this.flightHud?.setNav?.({
      label: nav.label,
      delta: headingDelta(p.headingDeg, bearing),
      nm,
    });
    this.flightHud?.setDirection?.(this.projectNav(nav, nm));
    return nav;
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

    /* Same shared HUD lifecycle as Beef Run: after 22 seconds the left-side
     * control card fades but remains recoverable with H. Without this call it
     * stayed at its initial opacity forever once the missing show call above
     * was repaired. */
    this.flightHud?.ageControls?.(dt);

    this.updateEvasion(dt);
    this.updateAirBattle(dt);
    /* The battery's transient VFX age on the simulated clock, not on the
     * phase machine. Only the 'defense' and 'bombApproach' handlers drive the
     * full `defense.update()`; every other flight frame still owes the bursts
     * already in the air their aging, or the puffs from the last salvo freeze
     * at fixed world positions the moment the phase moves on and hang in the
     * sky for the rest of the mission (owner playtest, 2026-08-18: "The decals
     * from all the flak you take ... still stays floating in the sky").
     * Guarded so the frames that DO run the full update never tick twice. */
    if (this.defense.deployed && this.phase !== 'defense' && this.phase !== 'bombApproach') {
      this.defense.updateEffects(dt, p.position);
    }
    // The diamond on the city, or the one on the field, or neither.
    this.updateNavMarker();
    // The visible half of the one authored engine problem — see triggerEngineOut().
    this.updateEngineOutSmoke(dt);

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
    /* The gyro's AGL floor. An autopilot holds an ALTITUDE and the eastbound
     * route CLIMBS — 153 m to 481 m across the three kilometres covered in
     * forty-five seconds of cruise — so the ground comes up under a perfectly
     * level aeroplane until the physics reports `onGround` and the gyro walks
     * out at the exact moment nothing can be done about it. The descending
     * check above never fires on that profile: vspeed is ~0 the whole way in.
     * This is the beat that INVITES the player into the tail turret, so the
     * floor is generous — the clearance closes at roughly 13 m/s on that leg,
     * and 250 m buys the fifteen-odd seconds he needs to climb out of the
     * turret and take her back. Deliberately a WARNING and not a control
     * change: an autopilot that quietly climbed for him would be worse than
     * one that gives up, and the drop-out is honest. What was missing was the
     * seconds before the hill. (docs/ENGINE-TRAPS.md entry 7,
     * docs/FUTURE-EDITS.md "the autopilot has no idea the ground is coming
     * up".) `bark()` has a per-pool cooldown, so the call every frame is the
     * callout repeating on the pool's own schedule while the floor is broken,
     * which is what a proximity warning does. */
    if (!p.onGround && this.autopilot.engaged && p.agl < AUTOPILOT_TERRAIN_FLOOR_AGL) {
      warn.add('terrain');
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
    if (severity <= 0 || this.aircraft?.destroyed) return;
    const p = this.physics;
    if (severity > 2.4) {
      p.damage.wing = clamp(p.damage.wing + severity * 0.06, 0, 1);
      this.cameras?.addShake?.(0.6);
    }
    if (severity > 6.5 || p.damage.wing >= 1) {
      /* Presentation, layered on the failure rule rather than replacing it —
       * ported from `src/beefrun/mission.js`'s `onImpact`, which is where
       * this crash effect was built and proven: read `src/beefrun/aircraft.js`
       * for the shape being reused rather than reinvented. A high-energy hit
       * gets the fireball; a wing ground down to 1.0 over a long scrape still
       * ends the flight, but quietly, because there is no detonation in it.
       * Both still fail — the gate above is unchanged. */
      if (severity >= 7.6 && this.aircraft?.explode?.()) {
        this.audio?.explosion?.();
        this.cameras?.addShake?.(1.6);
        for (let i = 0; i < this.engines.engines.length; i++) this.engines.kill(i, 'destroyed');
        p.controls.throttleL = p.controls.throttleR = 0;
        p.velocity.multiplyScalar(0.04);
        p.omega.set(0, 0, 0);
      }
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
    // restoreCheckpoint's canonical setPhase() immediately saves again. Put
    // the durable targeting accumulator back before that save so phase entry
    // cannot replace a historical corridor grade with a fresh zero ledger.
    if (this._checkpointTargetingRestore) {
      this.targeting.restoreCheckpoint(this._checkpointTargetingRestore);
      this._checkpointTargetingRestore = null;
    }
    this.checkpoint = name;
    this.checkpointData = {
      name,
      position: this.physics.position.clone(),
      heading: this.physics.headingDeg,
      velocity: this.physics.velocity.clone(),
      quat: this.physics.quat.clone(),
      fuel: this.engines.fuel,
      damage: { ...this.physics.damage },
      targeting: this.targeting.checkpoint(),
      score: { ...this.score },
      payloadReleased: this.payloadReleased,
      dusk: this.weather.dusk,
    };
    this.onCheckpoint?.(name, this.checkpointData);
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
    /* Put the airframe back if the last attempt ended in a fireball. Without
     * this the restore flies a hidden aeroplane trailing somebody else's
     * debris — same fix, same reasoning, as `src/beefrun/mission.js`'s own
     * `restoreCheckpoint`. */
    this.aircraft?.resetDestruction?.();
    this.dialogue.clear();
    /* `clear()` empties the QUEUE; this empties the memory. Without it the
     * second attempt at a leg is flown in silence — see `REPLAYED_BEATS`. */
    this.forgetReplayedBeats(name);
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
    /* And the explosion itself, which is the one sound on this page that can
     * outlive the attempt that made it: the delivered blast recordings run for
     * forty-four seconds on purpose (see `EnolaMissionAudio._sampledDetonation`)
     * and a restart is the mission saying that detonation did not happen. Same
     * reasoning as the turbulence and the screen wash below. */
    this.audio?.stopBlast?.(0.5);
    this.audio?.stopNarrativeMusic?.(0.2);
    this._escapeMusicStarted = false;
    this._bombApproachMusicStarted = false;
    this.gunFiring = false;
    this.gunTracking = false;
    // See `onPayloadImpact`: a restart before the drop must be able to detonate.
    this.detonation.dispose();
    this.explosionPoint = null;
    this.blastFlash = 0;
    /* AND IT MUST HAVE SOMETHING TO DETONATE. Everything above already
     * un-did the explosion; nothing put the bomb back. See `rearmPayload()`
     * for the whole of that bug — this is the line that fixes it. It runs
     * unconditionally, and the one checkpoint that is supposed to come back
     * with an empty bay (`return`) is settled below, just before `setup`, and
     * reconciled onto the prop at the end. Hanging a bomb up and taking it
     * down again is cheap; reaching the target without one is not. */
    this.rearmPayload();
    /* AND SOMETHING TO DETONATE IT ON.
     *
     * Every checkpoint at or before `preRelease` is a point in the mission at
     * which the Fat Squatch had not gone off yet, so the world it restores to
     * is one where Squatchbourg is still standing. `return` is the one
     * exception and it is not an oversight: it is the leg AFTER the drop, the
     * bomb has been delivered in that timeline, and a player who crashes on
     * the way home should come back to the crater he made rather than to a
     * city he has to bomb twice. See `TargetCity.restore()` for what does and
     * does not come back, and `../main.js`'s `mission.onCrater` for the two
     * halves of the hole that live out there. */
    if (this.restoresTheCity(name) && this.city?.destroyed) {
      this.city.restore();
      this.onCrater?.(null);
    }
    this._shockArrived = false;
    this._blastSoundFired = false;
    /* And nothing the blast did to the air, the screen or the camera outlives
     * it either — a restored flight that keeps the last attempt's turbulence
     * is a player being thrown about by an explosion that has not happened. */
    this.blastWash = 0;
    this._blastTurb = 0;
    this._blastTurbPeak = BASE_TURB;
    this._dropCam = 0;
    this._dropCamFrom = null;
    /* The air battle does not survive a restart either — a wave of fighters
     * left over from the attempt before is a wave the player never earned. */
    this.interceptors.clear();
    this.gunner.reset();
    this.crew?.setRearGunnerManned?.(false);
    this.autopilot.disengage(null);
    this.autopilot.lockout = 0;
    /* Nor the one authored engine problem — `engines.reset(false)` below (when
     * `data` exists) already rebuilds every engine at full health, and a
     * restart before the trigger point must be able to earn it again. */
    this._engineOutFired = false;
    this._engineOutIndex = null;
    this._engineSmokeT = 0;
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
    }
    /* Beef Run raises both on EVERY restore, even when the player was already
     * in the seat. A restart is a fresh takeoff/leg and should restore the
     * controls card instead of preserving its faded state from the failed
     * attempt. */
    this.flightHud?.show?.(true);
    this.flightHud?.showControls?.(true);

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
        /* Restore outside the 1600 m malfunction trigger so the player gets
         * the same visible bombing-run lead-in as organic flight. */
        this.physics.setPose(new THREE.Vector3(TARGET_X - 2100, approxGroundHeight(TARGET_X) + 400, COMPOUND.z), TURN_POINT.newHeading, 62);
        this.engines.forceRunning();
        this.input.throttle = 0.6;
        this.physics.controls.parkingBrake = false;
        /* No `payloadReleased` line here on purpose. It used to read
         * `data?.payloadReleased ?? false` out of the saved checkpoint, which
         * was a trapdoor: any route that managed to save `preRelease` with the
         * bomb already gone came back to the bombing run with an empty bay and
         * no way to finish. It is settled for every checkpoint in one place
         * now — see the rule just above `setup[name]()`. */
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
      /* `data.payloadReleased` is deliberately NOT restored alongside these.
       * The saved flag is a photograph of a moment; what a restart needs is the
       * RULE, which is the single `name !== 'return'` line further down and is
       * now the only thing that decides whether there is a bomb aboard. */

      /* AND THE BATTLE DAMAGE GOES WITH THE ENGINES.
       *
       * `engines.reset(false)` on the line above rebuilds all four engines from
       * scratch — healthy, alive, cold — but `Defense.damage` is a SECOND,
       * parallel record of what has been shot off, and nothing ever put it
       * back. So a restart left the mission believing in damage the aeroplane
       * no longer had: `score.damage` counted engines that were running,
       * `updateEscape` offered the engine emergency for an engine that was
       * fine, `onFighterHit` would not pick those engines again because it
       * thinks they are already gone, and — the one the player actually sees —
       * ELECTRICAL FAULT stayed on the glass for the rest of the session with a
       * dead dial behind it. Reachable on any run at all: `onShockWave()`
       * damages the electrics at severity 0.55, which is most drops.
       *
       * `soft` restores (the takeoff-overrun tow-back) deliberately keep it,
       * the same way they keep the score and the dialogue history. */
      this.defense.damage.engines.fill(false);
      this.defense.damage.rudder = false;
      this.defense.damage.electrical = false;
      this.defense.damage.fuel = false;
      this.defense.damage.catastrophic = false;
      this.defense.hitCount = 0;
      const dials = this.aircraft?.instruments;
      if (dials?.failed?.size) { dials.failed.clear(); dials.dirty = true; }
    }

    this.flags.enginesEverStarted = true;
    /* WHO COMES BACK WITH A BOMB. Exactly one checkpoint does not, and it is
     * the one after the drop. Settled here, in one line, rather than in each
     * `setup` and again out of the saved `checkpointData` — those three
     * disagreed, and a disagreement about this field is an aeroplane over the
     * target with nothing in the bay, which is half of the unwinnable restart
     * the owner kept hitting. `setup.return()` sets it true again immediately
     * below, and that is the whole of the exception. */
    if (name !== 'return') this.payloadReleased = false;
    this._checkpointTargetingRestore = data?.targeting ?? null;
    setup[name]();
    this._checkpointTargetingRestore = null;
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

  /**
   * Does restarting at `name` restore Squatchbourg?
   *
   * True for every checkpoint at or before the drop, false for the one after
   * it. Expressed as a position in `CHECKPOINTS` rather than as a list of names
   * so that a checkpoint added between `preRelease` and `return` later on gets
   * the right answer without anybody having to remember this method exists.
   *
   * @param {string} name a `CHECKPOINTS` entry
   */
  restoresTheCity(name) {
    const at = CHECKPOINTS.indexOf(name);
    return at >= 0 && at <= CHECKPOINTS.indexOf('preRelease');
  }

  /**
   * Let the crew say the beats belonging to the legs this restart replays.
   *
   * Reads `dialogue.played` rather than the `BEATS` table so it cannot fall out
   * of step with the script: whatever has actually been said, and matches one
   * of this checkpoint's prefixes, is forgotten. See `REPLAYED_BEATS`.
   *
   * @param {string} name a `CHECKPOINTS` entry
   * @returns {number} how many beats the crew may now say again
   */
  forgetReplayedBeats(name) {
    const prefixes = REPLAYED_BEATS[name];
    if (!prefixes || !this.dialogue?.played || !this.dialogue.forget) return 0;
    const again = [...this.dialogue.played].filter((id) => prefixes.some((p) => id.startsWith(p)));
    if (again.length) this.dialogue.forget(...again);
    return again.length;
  }

  /* ---------------------------------------------------------------- */
  /* Failure and the end                                               */
  /* ---------------------------------------------------------------- */

  fail(reason) {
    if (this.failed || this.finished) return;
    this.failed = reason;
    this.audio?.setPhase?.('silent');
    this.audio?.setStallHorn?.(false);
    this.audio?.endFallingWhistle?.(0.15);
    this.audio?.stopNarrativeMusic?.(0.3);
    this.gunFiring = false;
    this.gunTracking = false;
    this.gunner.leave();
    this.crew?.setRearGunnerManned?.(false);
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
