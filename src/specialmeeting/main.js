/**
 * THE SPECIAL MEETING — the page.
 *
 * Three men come and collect the Prospect in a car. Everything that makes this
 * scene work is somewhere else: `script.js` is what is said, `ride.js` is when,
 * `cast.js` is who, `stage.js` is the block outside the flat and
 * `forest/index.js` is the road out. This file is the wiring, and it should
 * stay that thin.
 *
 * ## The two clocks, and where they are pinned together
 *
 * Dialogue runs on the ride's clock — a line holds for as long as it takes to
 * say. The car runs on the road's, which is 992 metres long and does not care
 * how talkative anybody is. Letting either drive the other produces the same
 * failure in opposite directions: a conversation that finishes in a car still
 * twenty minutes from the woods, or a car parked at the treeline while
 * somebody in the back is still offering a sandwich.
 *
 * So they are pinned at three places, and only three. `GATES` names the beat
 * that waits and the road event it waits for. Between gates both clocks run
 * free, which is what makes the drive feel like a drive.
 *
 * ## What this file must never do
 *
 * Reassure him. See `docs/SPECIAL-MEETING-SCRIPT.md`: no HUD line, no toast,
 * no objective and no subtitle may tell the player he is safe. The objective
 * text below says where he is and nothing about what happens next, because
 * nobody in the car knows either — and two of them are prospects.
 */
import { SPEECH_MIX, SPEECH_MIX_CLOSE, SPEECH_MIX_INDOORS, speak } from '../core/dialogue.js';
import * as THREE from 'three';
import { ENVIRONMENT_VISIBILITY } from '../core/environment-visibility.js';

import { AudioEngine } from '../core/audio.js';
import {
  MISSION_IDS, SCENES, SCENE_IDS, TIME_EVENT_IDS, createCampaign, navigateCampaign,
} from '../core/campaign.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import { createFirstPersonInput } from '../core/first-person-input.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { createObjectivePanel } from '../core/objective-panel.js';
import { Player } from '../core/player.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { registerSceneRenderer } from '../core/scene-lifecycle.js';
import { loadFaceIndex } from '../bing/family.js';
import { AMBIENCE_CUES } from './ambience.js';
import { buildSpecialMeetingCast } from './cast.js';
import { createFrontPassengerDoorTarget } from './door-interaction.js';
import { PassengerRig, createNightForestRoad, adaptMeetingSedan } from './forest/index.js';
import { createRideSequence } from './ride.js';
import { SPEAKERS, scriptCues } from './script.js';
import { EYE_HEIGHT, FOOTSTEP_SURFACE, stageSpecialMeeting } from './stage.js';

/* ------------------------------------------------------------------ */
/* Where the two clocks are pinned together                            */
/* ------------------------------------------------------------------ */

/**
 * beat id -> the road event it may not start without.
 *
 * The surface-change beat starts when the tyres reach the cattle grid; the
 * chain beat starts when the car has actually stopped in front of the chain;
 * and the final exchange waits for the last moving approach. The arrival fade
 * releases on the last 2.5 metres into the spur so the first returning image
 * still moves and the player never waits on a long dead-black stop. Nothing
 * else waits.
 */
const GATES = Object.freeze({
  'SM-220': 'turn_off',
  'SM-260': 'chain',
  'SM-324': 'final_approach',
  /* SM-326 begins the dissolve while the car is still rolling. The dedicated
   * pre-arrival node keeps the full-black interval short without divorcing it
   * from the route or revealing a distant approach. */
  'SM-326': 'arrival_fade',
  /* The picture returns as SM-327 after its authored 1.2 second dissolve.
   * Gate the parked SM-330 tableau, not the fade-in, on the physical stop: a
   * distance-only proxy made the black interval exceed five seconds when the
   * car was easing through its final metres under a slow render clock. */
  'SM-330': 'arrival',
});

/** The one beat that lets the car move again: Lag has hooked the chain back up. */
const RELEASES = Object.freeze({ 'SM-270': true });
const TRAIL_HANDOFF_DISTANCE_M = 8;
/* The selected recorded performance reaches its final fade around 198
 * seconds after the road match-cut, including the chain stop; the authored
 * road is about 105 seconds at nominal cruise. The dialogue is the master:
 * stretch nominal cruise to about 174 seconds without changing the authored
 * target speeds, engine note, or any bend. */
const FOREST_DRIVE_TIME_SCALE = 0.60;
const CAR_DOOR_INTERACTION_ID = 'specialmeeting.front_passenger_door';
const FOREST_TRAVEL_AUDIO = Object.freeze({
  engine: Object.freeze({ key: 'sm.forest.engine', cue: 'car.engine.idle' }),
  road: Object.freeze({ key: 'sm.forest.road', cue: 'heist.vehicle.tires.road' }),
});

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('scene');
const blackout = document.getElementById('blackout');
const choicesEl = document.getElementById('choices');

const campaign = createCampaign();
if (campaign.state.scene.id !== SCENE_IDS.SPECIAL_MEETING) {
  campaign.enter(SCENE_IDS.SPECIAL_MEETING, { spawn: 'kerb' });
}
/* The campaign save is the authority. A persisted spur may never be silently
 * replaced by this page's historical hard-coded kerb start. */
const requestedSpawn = campaign.state.scene.spawn;
let effectiveSpawn = requestedSpawn === 'spur' ? null : 'kerb';
campaign.advanceTime(TIME_EVENT_IDS.DEPART_SPECIAL_MEETING);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
attachPixelRatio(renderer);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
registerSceneRenderer(renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  70, innerWidth / innerHeight, 0.04, ENVIRONMENT_VISIBILITY.forestDrive.cameraFar,
);
camera.name = 'specialmeeting.camera';
scene.add(camera);

const hud = new Hud();
/* THE HUD IS INVISIBLE UNTIL A SCENE SAYS IT IS PLAYING.
 *
 * `src/style.css` holds `#hud { opacity: 0 }` and turns it on with exactly one
 * rule: `body.playing #hud { opacity: 1 }`. Eight other scene roots add the
 * class; this one never did. So every subtitle this file writes, the crosshair
 * and the interaction prompt have all been rendering at opacity zero -- all
 * authored voice lines played into a scene with no text on the screen, which is
 * the owner's "no subtitles" and a good part of his "nothing happens".
 *
 * Nothing could catch it: every test in this scene is headless, and the one
 * live verifier never read a computed opacity. `src/golf/main.js` has the same
 * two lines with a comment naming this exact failure -- "logic tests pass while
 * a human sees nothing".
 *
 * The fix is to satisfy the shared rule, never to override it: do not add a
 * `#hud` rule to `specialmeeting.css` and do not touch `src/style.css`. */
document.body.classList.add('playing');
document.getElementById('hud')?.setAttribute('aria-hidden', 'false');
const audio = new AudioEngine();
const SPECIAL_MEETING_VOICE_CUES = Object.freeze([
  ...new Set(scriptCues().map((cue) => cue.name)),
]);
let voiceReady = false;
let missingVoiceCues = [];
let failedVoiceCues = [];
let voiceLoadError = null;

window.__squatchStage?.('A car, already running…');
const stage = stageSpecialMeeting(scene, { renderer, audio, onPhase: onArrivalPhase });

const player = new Player(camera, stage.world);
player.position.copy(stage.spawn.position ?? new THREE.Vector3(0, EYE_HEIGHT, 0));
player.yaw = stage.spawn.yaw ?? 0;
player.mode = 'walk';
player.onFootstep = (surface, intensity) => audio.footstep(stage.footstepSurface ?? FOOTSTEP_SURFACE, intensity);
/* The passenger seat exists before the forest does. Binding the shared Player
 * here means SM-195 can move the block sedan for its five visible seconds and
 * the camera remains on the same VehicleOccupants anchor all the way to black.
 * At the road cut this owner releases without moving the player and the
 * forest's PassengerRig boards the identical physical seat. */
const blockPassenger = new PassengerRig(player, stage.sedan, { seat: 'frontPassenger' });
const interaction = new InteractionSystem(camera, hud);
const frontPassengerDoorTarget = createFrontPassengerDoorTarget(stage.sedan);

/* `groundAt` matters as much as the sedan does: the cast is placed by door
 * anchor, and a door anchor is a pair of coordinates with no opinion about how
 * high the ground under it is. On the block that is the difference between
 * standing ON the pavement and standing 0.15 m into it; in the woods, where
 * this is swapped for the forest's own field at the cut to black, it is the
 * difference between the clearing floor and thirty-two metres under it. */
/* `faces` is the other half of the owner's "missing faces" report. This is
 * the only scene in the campaign that stages named Circle members and never
 * passed one, so Seff, Lag, Numbskull and Kittenboss were built on the
 * procedural drawn head while the same four people wear the owner's
 * photographs in the Bing, the Mansion and the Initiation. `loadFaceIndex()`
 * is the club's own loader and it never throws or 404s — a missing index just
 * comes back empty and everybody keeps the authored head — so awaiting it
 * here costs one small local fetch before the car is populated and can only
 * ever add faces, never remove one. This is `src/bing/main.js`'s pattern
 * verbatim: load the index once at the top, hand the set to the thing that
 * builds people. */
const faceIndex = await loadFaceIndex();
const cast = buildSpecialMeetingCast(scene, {
  sedan: stage.sedan,
  colliders: stage.world.colliders,
  groundAt: stage.world.groundAt,
  faces: faceIndex,
});
cast.boardForArrival();

let forest = null;
let gatedOn = null;
/* Whether the car has actually arrived and stopped. The script used to start
 * on the player's first click instead; see `onArrivalPhase`. */
let arrived = false;
const reachedNodes = new Set();
let paused = false;
let handedOff = false;
let started = false;
let startPromise = null;
let renderedFrameCount = 0;
let objectiveRevision = 0;
let objectiveText = '';
let interactionUseCount = 0;
let lastInteractionUse = null;
let trailDistanceTravelled = 0;
let trailStartProgress = 0;
let spurLightsOffIn = null;
let forestArrivalSettled = false;
const observedExits = [...SCENES[SCENE_IDS.SPECIAL_MEETING].next];
const entryHref = location.href;
const handoffReceipt = {
  attempted: 0,
  completed: 0,
  destination: null,
  error: null,
};
const driveTransitionReceipt = {
  matchCutAt: null,
  fadeOutAt: null,
  fadeOutSeconds: null,
  fadeInAt: null,
  fadeInSeconds: null,
  blackDurationMs: null,
  loopsAtFadeOut: [],
  loopsAtFadeIn: [],
  arrivalAt: null,
  arrivalBeatAt: null,
  authoredFadeAdvanceAt: null,
};
let forestTravelAudioRunning = false;

function forestTravelLoopKeys() {
  return Object.values(FOREST_TRAVEL_AUDIO).map(({ key }) => key);
}

function activeForestTravelLoops() {
  return forestTravelLoopKeys().filter((key) => audio.loops.has(key));
}

function startForestTravelAudio() {
  if (forestTravelAudioRunning) return;
  forestTravelAudioRunning = true;
  audio.startLoop(FOREST_TRAVEL_AUDIO.engine.key, {
    name: FOREST_TRAVEL_AUDIO.engine.cue,
    volume: 0.20,
    ambience: true,
    fade: 0.35,
  });
  audio.startLoop(FOREST_TRAVEL_AUDIO.road.key, {
    name: FOREST_TRAVEL_AUDIO.road.cue,
    volume: 0.12,
    ambience: true,
    fade: 0.35,
  });
}

function updateForestTravelAudio() {
  if (!forestTravelAudioRunning || !forest) return;
  const speed = Math.max(0, forest.drive.speed);
  const motion = Math.min(1, speed / 10);
  audio.setLoopRate(FOREST_TRAVEL_AUDIO.engine.key, 0.78 + motion * 0.34, 0.16);
  audio.setLoopVolume(FOREST_TRAVEL_AUDIO.engine.key, 0.14 + motion * 0.08, 0.16);
  audio.setLoopRate(FOREST_TRAVEL_AUDIO.road.key, 0.70 + motion * 0.46, 0.16);
  audio.setLoopVolume(FOREST_TRAVEL_AUDIO.road.key, 0.025 + motion * 0.12, 0.16);
}

function stopForestTravelAudio() {
  if (!forestTravelAudioRunning) return;
  forestTravelAudioRunning = false;
  audio.stopLoop(FOREST_TRAVEL_AUDIO.engine.key, 0.9);
  audio.stopLoop(FOREST_TRAVEL_AUDIO.road.key, 0.65);
}

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

/** Whose body a line comes out of, so the sound comes from that direction. */
function bodyFor(who) {
  if (who === 'PROSPECT') return null;
  const spec = SPEAKERS[who];
  return spec ? cast.person(spec.character) : null;
}

/**
 * Say a line.
 *
 * Positional, glued to the speaker, and handed to that speaker's mouth. Every
 * cue in this scene is named `vo.*`, which is what makes the analyser exist
 * and the lip-sync real rather than a synthesised envelope — see
 * `src/core/audio.js`. Returns the take's length so the sequence can hold for
 * exactly that long; `null` lets it fall back to its read estimate.
 */
function say(line) {
  const body = bodyFor(line.who);
  const name = SPEAKERS[line.who]?.name ?? '';
  /* Through the shared dialogue path in src/core/dialogue.js: one voice bus at
   * one trim, music and ambience ducked under the line, the analyser tapped
   * for the mouth, and `SPEECH_MIX` -- which is where this scene's own
   * ref/maxDist/rolloff triple came from in the first place.
   *
   * The 0.95 that used to sit here is gone. It was this scene's guess at how
   * loud dialogue is; the Initiation guessed 0.95 too, the heist 0.85, Silent
   * Squatch 0.8, and the difference between them is what the owner heard as
   * lines arriving at random levels.
   *
   * A speaker with no rig is on the phone or in the player's own head, so the
   * line rides the camera. */
  /* WHERE THE VOICE ACTUALLY COMES FROM.
   *
   * Three cases, and the scene used to get all three wrong.
   *
   * NOT IN THE WORLD -- the Prospect, who is the player, and Booskibro, who is
   * on a telephone. `bodyFor` returns null for both, and the old code then
   * fell back to `speaker: camera` while still asking for a panner. A panner
   * sitting on the listener has no defined direction; `core/dialogue.js` says
   * so in as many words -- "giving a phone call a position is how a phone call
   * ends up quieter when the player turns his head". No panner at all now.
   *
   * IN A SEAT -- emit from the CAR's own anchor for that seat, at mouth
   * height, not from the rig. A seated rig's origin is its feet, which
   * `occupy()` drops below the floor pan, so the line arrived from roughly a
   * metre and a half beneath the listener: the owner's voices-from-the-floor.
   * The indoors mix is the right profile for a 2.5 m cabin -- everyone is
   * inside its reference distance, so nobody in the car is attenuated, and a
   * man who has stepped out onto the spur stops carrying thirty metres.
   *
   * ON HIS FEET -- the rig, as before, on the open street mix. */
  const seat = body ? cast.seatOf(SPEAKERS[line.who]?.character) : null;
  const emitter = seat ? stage.sedan.seatVoice(seat) : body?.group;
  const spoken = speak(audio, line.cue, emitter
    ? { speaker: emitter, mix: seat ? SPEECH_MIX_INDOORS : SPEECH_MIX }
    : { mix: SPEECH_MIX_CLOSE });
  /* THE SUBTITLE LASTS AS LONG AS THE LINE.
   *
   * It used to be on screen for a flat 4.2 seconds whatever was said, so a
   * two-word answer sat there for four seconds and a long one was gone before
   * he finished it. `speechDuration` is the decoded take when there is one and
   * the manifest's authored length when there is not, so this reads correctly
   * before the VO is cut and re-times itself when it lands. The floor is there
   * because a very short line still needs long enough to be read. */
  hud.say(`<em>${name}</em> ${line.text}`, Math.max(1600, spoken.seconds * 1000 + 700));
  if (spoken.silent) {
    /* No recording yet. The mouth still moves, on a read estimate, because a
     * character delivering a subtitle with a closed face is worse than one
     * whose timing is approximate. */
    body?.say?.(1.4 + 0.045 * line.text.length, null);
    return null;
  }
  body?.say?.(spoken.seconds, spoken.source ? { audio, source: spoken.source } : null);
  return spoken.seconds;
}

/* ------------------------------------------------------------------ */
/* The player's answers                                                */
/* ------------------------------------------------------------------ */

function showChoices(options) {
  if (!choicesEl) return;
  /* SM-110 is also a physical shared-system interaction: keep world control
   * so looking at the passenger door and pressing E remains possible. The
   * numbered replies remain available; later dialogue choices release the
   * pointer for their clickable buttons as before. */
  const carDoorChoice = ride?.beatId === 'SM-110';
  if (options?.length && !carDoorChoice && document.pointerLockElement === canvas) {
    document.exitPointerLock?.();
  }
  if (!options || !options.length) {
    choicesEl.classList.add('hidden');
    choicesEl.innerHTML = '';
    return;
  }
  choicesEl.classList.remove('hidden');
  choicesEl.innerHTML = options
    .map((o, i) => `<button type="button" data-choice="${o.index}"><b>${i + 1}</b> ${o.text}</button>`)
    .join('');
  for (const button of choicesEl.querySelectorAll('button')) {
    button.addEventListener('click', () => {
      ride.choose(Number(button.dataset.choice));
      requestScenePointerLock();
    });
  }
}

/* ------------------------------------------------------------------ */
/* Canonical first-person input Adapter                                */
/* ------------------------------------------------------------------ */

/**
 * THE PLAYER COULD NOT MOVE, LOOK, OR PRESS ANYTHING. Owner, verbatim: "I
 * spawn in and I cant move. Theres nothing to do. I cant move and I cant move
 * my camera."
 *
 * `core/player.js` listens to NOTHING. It exposes `setKey(code, down)` and
 * `handleMouseMove(dx, dy)` and expects the scene to feed them, which the
 * other ten first-person scenes all do. This one built a Player, put it in
 * `walk`, and called `player.update(dt)` sixty times a second against an
 * input set that was permanently empty. It also never set `player.enabled`,
 * which defaults to FALSE -- so even a wired key would have moved nobody,
 * because `_updateWalk` is gated on it.
 *
 * Nothing caught it, and that is the part worth writing down. The campaign
 * marathon walks in and out of this scene through handoff CALLS; the WebGL
 * health check reads the renderer; boot-failure-surfaces checks the failure
 * screen; geometry, staging and framing all analyse a built scene. Not one of
 * them presses a key. A scene can be structurally perfect and completely
 * unplayable and every gate in this repository will call it green.
 *
 * The mode transitions were already right and are untouched: `walk` at the
 * kerb (the owner's "a brief few moments" before he gets in), `seated` for the
 * ride -- which locks him to the spot and LEAVES HIM HIS EYES, see the note in
 * src/nowake/main.js -- and `walk` again at the trailhead.
 */
const input = createFirstPersonInput({
  player,
  canvas,
  interaction,
  canEnable: () => !paused && !handedOff,
  canHandleInput: () => !paused && !handedOff,
  /* Choices are scene policy. Movement, look, pointer lock, rebinding,
   * interaction and focus-loss cleanup stay inside the shared Adapter. */
  onKeyDown: (event) => {
    if (!ride.options) return;
    const n = Number(event.key);
    if (!Number.isInteger(n) || n < 1 || n > ride.options.length) return;
    event.preventDefault();
    ride.choose(ride.options[n - 1].index);
    requestScenePointerLock();
  },
});

function requestScenePointerLock() {
  return input.requestPointerLock();
}

/* ------------------------------------------------------------------ */
/* The sequence                                                        */
/* ------------------------------------------------------------------ */

/* specialmeeting.html has no #objectives of its own, so this is the panel's
 * own upper-left card -- injected, styled by the panel, out of the way of a
 * crosshair. */
const objectivePanel = createObjectivePanel();

function setObjective(text) {
  const next = String(text || '');
  if (next === objectiveText) return;
  objectiveText = next;
  objectiveRevision += 1;
  if (next) objectivePanel.setLine(next);
  else objectivePanel.clear();
}

/** Put the authored trunk reveal in front of the player once, then return
 * control immediately. The previous staging left Kittenboss technically
 * unobstructed at the extreme edge of the lens while the car body filled the
 * frame; the player could hear her first line without actually seeing her. */
function frameKittenbossReveal() {
  const kittenboss = cast.byKey('kittenboss');
  const head = kittenboss?.parts?.head;
  if (!head) return;
  const target = head.getWorldPosition(new THREE.Vector3());
  const dx = target.x - player.position.x;
  const dy = target.y - player.position.y;
  const dz = target.z - player.position.z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal < 1e-4) return;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = THREE.MathUtils.clamp(
    Math.atan2(dy, horizontal),
    player.pitchMin,
    player.pitchMax,
  );
}

const ride = createRideSequence({
  onLine: (line) => say(line),
  /* Story state alone cannot move a mesh. The same borrowed sedan survives the
   * block-to-forest handoff, and its adapter advances this presentation clock
   * without stepping the block physics while the rail owns motion. */
  onStage: (line) => {
    if (line.startsForestDrive) {
      driveTransitionReceipt.matchCutAt = performance.now();
      beginTheDrive();
    }
    if (line.opensTrunk) stage.sedan.setTrunk(1);
    if (line.closesTrunk) stage.sedan.setTrunk(0);
  },
  onChoice: (options) => showChoices(options),
  onBeat: (b) => {
    /* ON THE SCREEN, not only in the pause menu. `objectiveFor` is captioned
     * "What the HUD says he is doing" and had never reached a HUD in its life:
     * the only reader was `getObjective` on the pause menu, which is the one
     * place a player is not playing. That is the exact fault
     * src/core/objective-panel.js was built for and names the mansion for.
     *
     * It does not break the scene's rule. docs/SPECIAL-MEETING-SCRIPT.md
     * forbids anything that tells the player he is SAFE, and these four lines
     * say where he is and nothing about what happens next -- which is what
     * their own author wrote directly above them. */
    setObjective(objectiveFor(b));
    if (GATES[b.id] && !reachedNodes.has(GATES[b.id])) gatedOn = GATES[b.id];
    if (RELEASES[b.id]) forest?.resume();
    /* `disembarkForPickup()` is NOT here any more: it runs in
     * `onArrivalPhase` a beat before this, against a car that has stopped. */
    if (b.id === 'SM-110') {
      cast.holdTheFrontDoor();
      /* The dome light, because a door is open. The sedan has no swinging
       * doors yet — `sedan.js` animates the boot lid and nothing else — so
       * the light IS the open door until somebody builds one. Numbskull's
       * body standing in the doorway does the rest. */
      stage.sedan.setCabinLight(true);
    }
    if (b.id === 'SM-120') cast.lagTakesTheBack();
    /* SM-195 is authored as "They pull away. Nobody speaks." over five held
     * seconds -- and for those five seconds the car did not move. `driveAway()`
     * builds a route driver onto the departure route and has existed, tested,
     * and been called by nothing but its own unit test. The cut to black at
     * SM-196 happens over real motion now instead of over a parked car, which
     * is the difference between a cut and a freeze. */
    if (b.id === 'SM-195') stage.arrival?.driveAway?.();
    if (b.id === 'SM-322') cast.swapRearSeats();
    if (b.id === 'SM-330') settleForestArrival();
    if (b.id === 'SM-400') { cast.getOut(); forest?.leave(); }
    /* The boot. Kittenboss stands herself up and climbs out under her own
     * power — `cast.js` owns the move, and it is a stand rather than a lift
     * because nobody helps her and she does not need it. She is a woman and
     * the other prospect, at Tony's rank; the scene said "he" everywhere
     * until 2026-08-20 and every one of those was corrected on the owner's
     * ruling. Nothing about this call changed with it. */
    if (b.id === 'SM-420') {
      cast.kittenbossOut();
      frameKittenbossReveal();
    }
  },
  onSeated: () => {
    /* The door shuts, Numbskull walks round the back of the car, and the seat
     * behind the Prospect fills. The central locking goes and nobody remarks
     * on it — do not add a line here.
     *
     * You can HEAR the door now. `ambience.doorShut()` has existed since the
     * scene was written and was never called from anywhere, so the beat the
     * owner asked to be able to feel -- "doors close, ride begins" -- happened
     * in silence on a wet street. */
    stage.ambience?.doorShut?.(stage.sedan.doorWorld('front_passenger'));
    cast.takeSeats();
    stage.sedan.setCabinLight(false);
    /* Idempotent, and no longer load-bearing: with the ride gated on the
     * arrival's own `settled` phase the car is already at the kerb by the time
     * anybody sits in it. It stays as the seatbelt it was always meant to be. */
    stage.arrival?.snapToKerb?.();
    blockPassenger.board();
  },
  onBlackout: (seconds = 0) => {
    driveTransitionReceipt.fadeOutAt = performance.now();
    driveTransitionReceipt.fadeOutSeconds = seconds;
    driveTransitionReceipt.loopsAtFadeOut = activeForestTravelLoops();
    if (blackout) blackout.style.transitionDuration = `${seconds}s`;
    blackout?.classList.toggle('cut', seconds <= 0);
    blackout?.classList.add('on');
    armAuthoredBlackAdvance(seconds);
    armTheBlackWatchdog();
  },
  onFadeIn: (seconds) => {
    clearAuthoredBlackAdvance();
    clearTheBlackWatchdog();
    driveTransitionReceipt.fadeInAt = performance.now();
    driveTransitionReceipt.fadeInSeconds = seconds;
    driveTransitionReceipt.blackDurationMs = driveTransitionReceipt.fadeOutAt === null
      ? null
      : driveTransitionReceipt.fadeInAt - driveTransitionReceipt.fadeOutAt;
    driveTransitionReceipt.loopsAtFadeIn = activeForestTravelLoops();
    if (!blackout) return;
    blackout.classList.remove('cut');
    blackout.style.transitionDuration = `${seconds}s`;
    blackout.classList.remove('on');
  },
  canHandoff: () => trailDistanceTravelled >= TRAIL_HANDOFF_DISTANCE_M,
  onHandoff: () => handOff(),
  onPhase: (phase) => {
    if (phase === 'trail') startTheWalk();
  },
});

/**
 * THE SCRIPT WAITS FOR THE CAR. IT DID NOT USED TO.
 *
 * Two clocks run this scene and until now they had two different origins and
 * nothing pinning them together at the front. `stage.arrival` starts from the
 * first rendered frame; the script started on the player's first click, and
 * `begin()` plays the first line in that same frame. Measured
 * headless, the arrival takes 27.8 s to settle -- waiting 10.0, headlights
 * 11.4, approach to 24.1, stopped 26.2 -- while SM-100's seven entries run
 * about 19 s. So on any normal click Seff leaned across and started talking
 * while the car was still driving down the block, and the hub opened before it
 * had parked. That is the owner's *"voices begin before the vehicle even
 * arrives"*, and it is also why the two men were on the pavement early: their
 * placement is car-relative, so `disembarkForPickup()` on SM-100 entry put
 * them beside a car that then drove off and left them standing in the road.
 *
 * `GATES` already pins three later beats to the road; this is the same idea at
 * the front of the scene, using the phase callback `arrival.js` has always
 * published and `main.js` never passed. The men get out of a car that has
 * stopped, and then somebody speaks.
 *
 * @param {string} phase one of arrival.js's phases; 'settled' is the one.
 */
function onArrivalPhase(phase) {
  if (phase !== 'settled' || arrived) return;
  arrived = true;
  cast.disembarkForPickup();
  /* The SCRIPT is `tryStartRide()`'s, polled from `frame()` on the same gate.
   * This callback runs inside `stage.update()`, which frame() steps first, so
   * the men are out of the car before the first line rather than during it. */
}

/* A real InteractionSystem target on the car the player is looking at. The
 * descriptor is live only for the front-seat hub; its action selects the
 * script's authored accepting option rather than bypassing the sequence. */
interaction.register(frontPassengerDoorTarget, {
  id: CAR_DOOR_INTERACTION_ID,
  label: 'Get in the front passenger seat',
  key: 'E',
  soft: true,
  enabled: () => started
    && stage.arrival?.settled === true
    && ride.beatId === 'SM-110'
    && Boolean(ride.options?.some((option) => option.accepts)),
  onUse: () => {
    const option = ride.options?.find((candidate) => candidate.accepts);
    if (!option) return;
    interactionUseCount += 1;
    lastInteractionUse = {
      id: CAR_DOOR_INTERACTION_ID,
      beat: ride.beatId,
      frame: renderedFrameCount,
    };
    ride.choose(option.index);
  },
});

/** What the HUD says he is doing. Never what is about to happen to him. */
function objectiveFor(b) {
  if (b.act <= 2) return 'A car is waiting with the engine running.';
  if (b.act === 3) return 'Ride out to the meeting.';
  if (b.act === 4) return 'Wait by the car.';
  return 'Walk up the trail.';
}

/* ------------------------------------------------------------------ */
/* A BLACK SCREEN WITH NO SCHEDULED WAY OUT                             */
/*                                                                      */
/* Owner: "after entering the car, screen turns black after a few       */
/* seconds and nothing happens. This is a blocker."                     */
/*                                                                      */
/* It was not a crash. The old SM-196 painted the picture out before the  */
/* drive conversation, then waited on a distant road event to reveal the */
/* same drive again. The blackout now belongs to SM-326, after the final */
/* line. SM-326 starts at the nearby pre-arrival node; SM-330 is separately */
/* gated on the physical stop so the parked tableau cannot begin early. This */
/* watchdog is */
/* still the last-resort guarantee that a broken road event cannot leave */
/* the player staring at a dead-black page.                              */
/*                                                                      */
/* The gating is deliberate and worth keeping; a picture that cannot     */
/* come back is not. This is the floor under it. If the road has not     */
/* produced its node by the time a player would reasonably conclude the  */
/* game has died, the fade happens anyway and the gate is released --    */
/* the drive carries on underneath and the scene rejoins itself. A       */
/* slightly early cut back to the dirt road is a worse SHOT than the one */
/* the author wrote. It is not a worse GAME than a black screen.         */
/* ------------------------------------------------------------------ */

/** How long a deliberate black may last before it is treated as a fault. */
const BLACK_CEILING_MS = 2500;
let blackWatchdog = null;
let authoredBlackAdvance = null;

function clearAuthoredBlackAdvance() {
  if (authoredBlackAdvance === null) return;
  clearTimeout(authoredBlackAdvance);
  authoredBlackAdvance = null;
}

/**
 * A CSS dissolve is wall-clock presentation, so its sequence hold must finish
 * on the same clock. The gameplay loop deliberately clamps simulation delta;
 * under SwiftShader (or a heavily loaded machine) 1.2 authored seconds can
 * otherwise become almost three real seconds of black even though the road
 * gate has already arrived.
 *
 * Do not skip the road gate. If `arrival_fade` has not fired yet, poll until
 * it does and let the hard watchdog retain final authority over a broken
 * route. Once it has, advance exactly one beat after the authored dissolve.
 */
function armAuthoredBlackAdvance(seconds) {
  clearAuthoredBlackAdvance();
  const delay = Math.max(0, Number(seconds) || 0) * 1000;
  const advance = () => {
    authoredBlackAdvance = null;
    if (ride.beatId !== 'SM-326' || !blackout?.classList.contains('on')) return;
    if (gatedOn) {
      authoredBlackAdvance = setTimeout(advance, 50);
      return;
    }
    driveTransitionReceipt.authoredFadeAdvanceAt = performance.now();
    ride.skip();
  };
  authoredBlackAdvance = setTimeout(advance, delay);
}

function clearTheBlackWatchdog() {
  if (blackWatchdog === null) return;
  clearTimeout(blackWatchdog);
  blackWatchdog = null;
}

function armTheBlackWatchdog() {
  clearTheBlackWatchdog();
  blackWatchdog = setTimeout(() => {
    blackWatchdog = null;
    if (!blackout?.classList.contains('on')) return;
    clearAuthoredBlackAdvance();
    console.warn(
      `the Special Meeting held a black screen for ${BLACK_CEILING_MS} ms `
      + `without reaching its fade beat (gated on ${gatedOn ?? 'nothing'}); `
      + 'fading in anyway',
    );
    /* Release the gate as well as the picture. Fading in on a ride that is
     * still frozen would trade a black screen for a still one. */
    gatedOn = null;
    blackout.classList.remove('cut');
    blackout.style.transitionDuration = '1.2s';
    blackout.classList.remove('on');
  }, BLACK_CEILING_MS);
}

/* ------------------------------------------------------------------ */
/* The drive, which happens behind the black                           */
/* ------------------------------------------------------------------ */

/**
 * Apply the parked-tableau side effects only when BOTH clocks agree:
 * SM-330 has begun and the route has physically reached `arrival`.
 *
 * GATES pauses a beat after `onBeat` announces it. Killing the engine
 * directly in SM-330's callback therefore stopped the rail before it could
 * fire the very arrival event that released that gate. Calling this helper
 * from both clocks makes either ordering safe without returning to a long
 * black hold.
 */
function settleForestArrival() {
  if (forestArrivalSettled
    || !forest
    || ride.beatId !== 'SM-330'
    || !reachedNodes.has('arrival')) return false;
  forestArrivalSettled = true;
  driveTransitionReceipt.arrivalBeatAt = performance.now();
  forest.killEngine();
  stopForestTravelAudio();
  spurLightsOffIn = 4;
  return true;
}

function beginTheDrive({ restoreNode = null } = {}) {
  if (forest) return;
  /* One camera owner at a time. `release()` preserves the exact seat pose; the
   * forest boards that same anchor below after it receives the forest world. */
  blockPassenger.release();
  window.__squatchStage?.('The road out…');
  const sedan = adaptMeetingSedan(stage.sedan);
  const forestColliders = [];
  forest = createNightForestRoad({
    scene,
    renderer,
    player,
    car: sedan,
    colliders: forestColliders,
    timeScale: FOREST_DRIVE_TIME_SCALE,
    onNode: (id) => {
      reachedNodes.add(id);
      if (gatedOn === id) gatedOn = null;
      if (id === 'arrival') driveTransitionReceipt.arrivalAt = performance.now();
      if (id === 'arrival') settleForestArrival();
      if (id === 'arrival' && campaign.state.scene.spawn !== 'spur') {
        campaign.enter(SCENE_IDS.SPECIAL_MEETING, { spawn: 'spur' });
      }
    },
  });
  /* The block's flat ground goes with the block. Everything the cast is stood
   * on from here is the forest's terrain field, which is the same one the
   * trees, the trailhead and the car are placed against. */
  cast.setGround((x, z) => forest.heightAt(x, z));
  player.world = forest.world;
  input.clear();
  player.velocity.set(0, 0, 0);
  stage.block.group.visible = false;
  /* The wet street, the alley and the distant passes belong to the block, and
   * the block is behind us now. The forest brings its own bed. Dispose the
   * block sky/light rig too: leaving its opaque 300 m sky sphere and key light
   * in the scene made the forest route render against the old set and meant
   * the scene briefly owned two moons despite both night modules explicitly
   * forbidding that. */
  stage.night.dispose();
  stage.ambience.stop();
  forest.board();
  if (restoreNode) {
    forest.restoreAtNode(restoreNode);
    forest.killEngine();
    forest.killLights();
    reachedNodes.add(restoreNode);
    effectiveSpawn = 'spur';
  } else {
    startForestTravelAudio();
    forest.start();
  }
}

if (requestedSpawn === 'spur') {
  beginTheDrive({ restoreNode: 'arrival' });
  setObjective('Wait by the car.');
} else {
  setObjective('Wait outside for the car.');
}

function startTheWalk() {
  if (!forest) return;
  player.mode = 'walk';
  const trailhead = forest.trailhead;
  if (trailhead) player.position.set(trailhead.x, trailhead.y + EYE_HEIGHT, trailhead.z);
  /* AND TURNED UP IT. This used to move him and change nothing else, so he
   * arrived at the trailhead still carrying whichever way `leave()` had turned
   * him at the car -- which, once `exitYaw()` started turning him AT the car
   * so he could see the four people talking to him, is a hundred and
   * forty-odd degrees off the path. *"Trail's up there. Straight up. You can't
   * miss it."* The forest surveyed the path; `trailYaw` is its first segment,
   * and it is read from there rather than written down again here. */
  if (Number.isFinite(forest.trailYaw)) player.yaw = forest.trailYaw;
  trailStartProgress = trailProgressAt(player.position);
  trailDistanceTravelled = 0;
}

/** Distance along the surveyed trail nearest the player's actual position. */
function trailProgressAt(position) {
  const path = forest?.trail ?? [];
  let walked = 0;
  let best = { distance: Infinity, progress: 0 };
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length <= 0) continue;
    const t = Math.max(0, Math.min(1,
      ((position.x - a.x) * dx + (position.z - a.z) * dz) / (length * length)));
    const x = a.x + dx * t;
    const z = a.z + dz * t;
    const distance = Math.hypot(position.x - x, position.z - z);
    if (distance < best.distance) best = { distance, progress: walked + length * t };
    walked += length;
  }
  return best.progress;
}

/* ------------------------------------------------------------------ */
/* The hand-off                                                        */
/* ------------------------------------------------------------------ */

/**
 * The trees open, and INITIATION NIGHT takes over.
 *
 * It owns its own approach — seventy-eight metres of night forest to the fire
 * — and this scene must not duplicate it. So this ends at the treeline, with
 * the dread still fully loaded, and the Initiation picks him up walking.
 */
function handOff() {
  if (handedOff) return;
  handedOff = true;
  handoffReceipt.attempted += 1;
  handoffReceipt.destination = { sceneId: SCENE_IDS.INITIATION, spawn: 'gathering' };
  handoffReceipt.error = null;
  input.suspend();
  interaction.setPaused(true);
  showChoices(null);
  setObjective('');
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING);
  /* Initiation starts here, at the treeline -- not when the Palace ends and
   * not while Tony is still in his Apartment. This mirrors the recovery skip
   * seam and keeps the mission state aligned with the scene the player is
   * actually entering. */
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_INITIATION, (state) => {
    if (state.missions[MISSION_IDS.INITIATION].status === 'available') {
      state.missions[MISSION_IDS.INITIATION].status = 'in_progress';
    }
  }, { required: true });
  blackout?.classList.remove('cut');
  if (blackout) blackout.style.transitionDuration = '1.4s';
  blackout?.classList.add('on');
  setTimeout(() => {
    try {
      navigateCampaign(campaign, SCENE_IDS.INITIATION, { spawn: 'gathering', location });
      handoffReceipt.completed += 1;
    } catch (error) {
      handoffReceipt.error = error?.message || String(error);
      handedOff = false;
      blackout?.classList.remove('on');
      interaction.setPaused(false);
      setObjective(objectiveFor(ride.beat ?? { act: 2 }));
      showChoices(ride.options);
      input.resume();
      console.error('[specialmeeting] campaign handoff failed', error);
    }
  }, 1400);
}

/* ------------------------------------------------------------------ */
/* Pause, recovery and the frame                                       */
/* ------------------------------------------------------------------ */

const recovery = createCampaignSceneRecovery({
  campaign,
  sceneId: SCENE_IDS.SPECIAL_MEETING,
  location,
});

const pauseMenu = createPauseMenu({
  title: 'The Special Meeting',
  instructions: [
    'Mouse to look. WASD to move while you are out of the car.',
    'Number keys pick a reply when there is one.',
    'There is nothing to do but go.',
  ],
  getObjective: () => objectiveFor(ride.beat ?? { act: 2 }),
  canPause: () => !handedOff,
  onPause: () => {
    paused = true;
    input.suspend();
    interaction.setPaused(true);
  },
  onResume: () => {
    paused = false;
    interaction.setPaused(false);
    input.resume();
  },
  recovery,
});

const clock = new THREE.Clock();

function renderScene() {
  renderer.render(scene, camera);
  renderedFrameCount += 1;
}

function tryStartRide() {
  if (!voiceReady || started) return false;
  if (requestedSpawn === 'spur') {
    if (!forest?.drive.arrived) return false;
    started = true;
    ride.begin('SM-400', { phase: 'spur' });
    return true;
  }
  /* The one gate that matters at the kerb: the car has to have STOPPED.
   * Ambience is already up -- the street is started on the player's gesture,
   * because that is the only moment a browser will let an AudioContext
   * start, and the arrival is supposed to happen over a live street. */
  if (!stage.arrival?.settled) return false;
  started = true;
  ride.begin('SM-100');
  return true;
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (paused) { renderScene(); return; }

  player.update(dt);
  /* One of the two, never both. The block owns the car, the night and the
   * sound until the cut to black; after it the forest owns all three, and the
   * adapter's own header is explicit that nothing else may step the vehicle
   * while the rail is driving it. */
  if (forest) forest.update(dt);
  else {
    stage.update(dt, player.position);
    /* AFTER the car. PassengerRig reapplies the camera with dt=0, so there is
     * no previous-frame seat chase while the departure rail is moving. */
    blockPassenger.update(dt);
  }
  /* THE EARS, WHICH HAVE BEEN AT THE WORLD ORIGIN THIS WHOLE TIME.
   *
   * `AudioEngine.init()` parks the WebAudio listener at (0,0,0) facing -Z, and
   * every other first-person scene in the campaign pumps it once a frame. This
   * one never did -- while every line IS positional, built with a real HRTF
   * panner at the speaker's world position. So the entire scene was heard from
   * the origin by a head that never turned.
   *
   * That is the owner's "voices sound like they are coming from arbitrary
   * directions", and it explains the strangest half of his report exactly:
   * with forward -Z and up +Y the listener's right is world +X, and the forest
   * road runs from the origin out to x = +244. His own voice follows the
   * camera, so it was panned hundreds of metres onto the +X side -- "even the
   * Prospect's own voice sounds far right and low". It was, literally.
   *
   * After the world update, because `player.update` writes the camera and the
   * forest rail writes the seat; before the `started` return, so the listener
   * is already where the ears are on the first frame of sound. */
  audio.updateListener(camera);
  updateForestTravelAudio();
  tryStartRide();
  if (!started) { renderScene(); return; }
  cast.update(dt, player.position);
  interaction.update(dt);
  if (ride.phase === 'trail' || ride.phase === 'handoff') {
    trailDistanceTravelled = Math.max(
      trailDistanceTravelled,
      trailProgressAt(player.position) - trailStartProgress,
    );
  }
  if (spurLightsOffIn !== null) {
    spurLightsOffIn -= dt;
    if (spurLightsOffIn <= 0) {
      forest?.killLights();
      spurLightsOffIn = null;
    }
  }
  if (!gatedOn) ride.update(dt);

  renderScene();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* A browser will not start an AudioContext until the player has done
 * something, so the street comes up on the first click or key rather than on
 * a start button. The first dialogue beat begins only after its voice bank is
 * loaded, so SM-100 cannot race `hasSample()` and silently disappear. */
async function wakeTheSound() {
  if (started || startPromise) return startPromise;
  startPromise = (async () => {
    voiceLoadError = null;
    await audio.init();
    /* `AMBIENCE_CUES` by name, not by prefix. The prefixes below miss
     * `ambience.alley` and `traffic.pass` -- both recorded, both indexed, both
     * on disk. The alley one is the worse of the two because it is a LOOP:
     * the stage's begin call starts it, and a loop started with no decoded
     * buffer keeps its synth stand-in for the whole scene. `ambience.js` publishes
     * the complete list precisely so nobody keeps a second copy of it. */
    await audio.loadAdditional({
      names: [
        ...SPECIAL_MEETING_VOICE_CUES,
        ...AMBIENCE_CUES,
        ...Object.values(FOREST_TRAVEL_AUDIO).map(({ cue }) => cue),
      ],
      prefixes: ['car.', 'footstep.', 'street.'],
    });
    missingVoiceCues = SPECIAL_MEETING_VOICE_CUES.filter((cue) => !audio.hasSample?.(cue));
    const active = new Set(SPECIAL_MEETING_VOICE_CUES);
    failedVoiceCues = audio.failedCues.filter((failure) => active.has(failure.name));
    voiceReady = missingVoiceCues.length === 0 && failedVoiceCues.length === 0;
    if (!voiceReady) {
      throw new Error(
        `${missingVoiceCues.length} Special Meeting voice cues missing; `
        + `${failedVoiceCues.length} failed to decode`,
      );
    }
    /* AMBIENCE ON THE GESTURE, because that is what the gesture is FOR: a
     * browser will not start an AudioContext until the player has clicked, and
     * the whole arrival is meant to happen over a street that is already
     * making noise. It does not wait for the car. */
    stage.begin();
    /* THE STREET IS QUIET FIRST, AND THE CLOCK STARTS HERE.
     *
     * `stage.arrival` is stepped from `frame()`, which runs from the first
     * RENDERED frame -- so its ten seconds of empty street were being spent
     * while the page was still loading a voice bank, and by the time the
     * player clicked, the car was already most of the way down the block.
     * Resetting on the click re-parks it dark up the cross street and rewinds
     * the clock, so the ten seconds are ten seconds the player is there for. */
    stage.arrival.reset();
    /* `started` is NOT set here, and the script does not begin here. Both
     * belong to `tryStartRide()`, which refuses until the car has stopped. */
    tryStartRide();
    removeEventListener('pointerdown', wakeTheSound);
    removeEventListener('keydown', wakeTheSound);
  })();
  try {
    await startPromise;
  } catch (error) {
    voiceReady = false;
    voiceLoadError = error?.message || String(error);
    console.error('[specialmeeting] initial audio bank could not load', error);
    startPromise = null;
  }
  return startPromise;
}
addEventListener('pointerdown', wakeTheSound);
addEventListener('keydown', wakeTheSound);

frame();

document.getElementById('loading')?.classList.add('hidden');
/* The boot guard watches for this global by name (`data-ready` on
 * specialmeeting.html). Published last, once the first frame has actually
 * gone out, so a scene that threw on the way up still reports as failed. */
function currentInteractionId() {
  const current = interaction.current;
  return current?.userData?.interact?.id ?? current?.name ?? null;
}

function currentLegalActions() {
  const actions = [];
  if (!voiceReady) actions.push('gesture.audio_wake');
  if (!handedOff && player.enabled && player.mode === 'walk') {
    actions.push('player.move', 'player.look');
  }
  if (currentInteractionId()) actions.push(`interaction.${currentInteractionId()}`);
  for (const option of ride.options ?? []) actions.push(`choice.${option.index}`);
  if (!started && voiceReady && requestedSpawn === 'kerb' && !stage.arrival?.settled) {
    actions.push('timeline.wait_for_arrival');
  } else if (started && !ride.options && !ride.finished) {
    actions.push(gatedOn ? `timeline.wait_for_${gatedOn}` : 'timeline.dialogue');
  }
  if (!handedOff) actions.push('menu.pause');
  return actions;
}

function arrivalEvidence() {
  if (forest) {
    return {
      system: 'forest_drive',
      phase: forest.drive.waitingAt ?? forest.drive.stage,
      settled: forest.drive.arrived,
      distance: forest.drive.distance,
      speed: forest.drive.speed,
      headlightsOn: forest.car.headlightsOn,
    };
  }
  return {
    system: 'block_arrival',
    phase: stage.arrival?.phase ?? null,
    settled: stage.arrival?.settled ?? false,
    speed: stage.sedan?.vehicle?.speed ?? null,
    headlightsOn: stage.sedan?.headlightsOn ?? null,
  };
}

const certification = {
  route: Object.freeze({
    entrypointId: 'special_meeting_canonical',
    href: SCENES[SCENE_IDS.SPECIAL_MEETING].href,
    root: 'src/specialmeeting/main.js',
    observedExits: Object.freeze([...observedExits]),
    entryHref,
  }),
  get requestedSpawn() { return requestedSpawn; },
  get effectiveSpawn() { return effectiveSpawn; },
  get renderedFrameCount() { return renderedFrameCount; },
  get cameraOwner() { return player.camera === camera ? 'core/player' : 'unknown'; },
  get poseAdapter() {
    return player.mode === 'seated' || forest?.passenger?.seated ? 'passenger_rig' : 'walk';
  },
  get cameraIdentity() { return camera.uuid; },
  get playerCameraIdentity() { return player.camera?.uuid ?? null; },
  get playerPosition() {
    return { x: player.position.x, y: player.position.y, z: player.position.z };
  },
  get objectiveRevision() { return objectiveRevision; },
  get objectiveText() { return objectiveText; },
  get interactionTargetCount() { return interaction.targets.length; },
  get interactionCurrentId() { return currentInteractionId(); },
  get interactionUseCount() { return interactionUseCount; },
  get lastInteractionUse() { return lastInteractionUse ? { ...lastInteractionUse } : null; },
  get legalActions() { return currentLegalActions(); },
  get handoff() {
    return {
      ...handoffReceipt,
      destination: handoffReceipt.destination ? { ...handoffReceipt.destination } : null,
    };
  },
  get driveTransition() {
    return {
      ...driveTransitionReceipt,
      loopsAtFadeOut: [...driveTransitionReceipt.loopsAtFadeOut],
      loopsAtFadeIn: [...driveTransitionReceipt.loopsAtFadeIn],
      activeTravelLoops: activeForestTravelLoops(),
    };
  },
  get rideBeat() { return ride.beatId; },
  get ridePhase() { return ride.phase; },
  get arrival() { return arrivalEvidence(); },
  get trailDistance() { return trailDistanceTravelled; },
  get trailRequiredDistance() { return TRAIL_HANDOFF_DISTANCE_M; },
  get campaignScene() { return { ...campaign.state.scene }; },
};

window.SPECIAL_MEETING = {
  campaign, ride, cast, stage,
  /* THE PLAYER, so a check can ask whether he can actually move.
   *
   * Published because nothing in this repository could answer that question
   * about this scene: the marathon drives it through handoff calls, the WebGL
   * check reads the renderer, and geometry/staging/framing analyse a built
   * scene. None of them presses a key, so the scene shipped for weeks with no
   * input wiring at all and every gate green. See the INPUT block above. */
  player,
  input,
  /** What `pointerlockchange` last decided. False means he is a passenger. */
  get playerEnabled() { return player.enabled; },
  get playerMode() { return player.mode; },
  get inputReceipt() { return input.snapshot(); },
  /* The scene root, published for the repo-wide mesh sweep in
   * tools/scene-audit-scenes.mjs, which finds a page's geometry by walking a
   * declared path to a THREE.Scene rather than by guessing. */
  scene,
  get forest() { return forest; },
  get started() { return started; },
  get voiceReady() { return voiceReady; },
  get missingVoiceCues() { return [...missingVoiceCues]; },
  get failedCues() { return failedVoiceCues.map((failure) => ({ ...failure })); },
  get voiceLoadError() { return voiceLoadError; },
  get expectedVoiceCueCount() { return SPECIAL_MEETING_VOICE_CUES.length; },
  get decodedVoiceCueCount() {
    return SPECIAL_MEETING_VOICE_CUES.reduce(
      (count, cue) => count + Number(audio.hasSample?.(cue) === true),
      0,
    );
  },
  certification,
};
