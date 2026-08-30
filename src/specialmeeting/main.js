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
import { SPEECH_MIX, speak } from '../core/dialogue.js';
import * as THREE from 'three';

import { AudioEngine } from '../core/audio.js';
import {
  SCENES, SCENE_IDS, TIME_EVENT_IDS, createCampaign, navigateCampaign,
} from '../core/campaign.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { createObjectivePanel } from '../core/objective-panel.js';
import { Player } from '../core/player.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { translateKey } from '../core/settings.js';
import { registerSceneRenderer } from '../core/scene-lifecycle.js';
import { AMBIENCE_CUES } from './ambience.js';
import { buildSpecialMeetingCast } from './cast.js';
import { createNightForestRoad, adaptMeetingSedan } from './forest/index.js';
import { createRideSequence } from './ride.js';
import { SPEAKERS, scriptCues } from './script.js';
import { EYE_HEIGHT, FOOTSTEP_SURFACE, stageSpecialMeeting } from './stage.js';

/* ------------------------------------------------------------------ */
/* Where the two clocks are pinned together                            */
/* ------------------------------------------------------------------ */

/**
 * beat id -> the road event it may not start without.
 *
 * The picture comes back exactly when the surface changes under the tyres;
 * the chain beat starts when the car has actually stopped in front of the
 * chain; the arrival beat starts when it is on the spur. Nothing else waits.
 */
const GATES = Object.freeze({
  'SM-220': 'turn_off',
  'SM-260': 'chain',
  'SM-330': 'arrival',
});

/** The one beat that lets the car move again: Lag has hooked the chain back up. */
const RELEASES = Object.freeze({ 'SM-270': true });

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('scene');
const blackout = document.getElementById('blackout');
const choicesEl = document.getElementById('choices');

const campaign = createCampaign();
/* Run ONLY when the campaign already stands at this scene. The unconditional
 * claim rewrote scene and clock for anyone who so much as opened this page
 * mid-campaign -- a bookmark on day two moved the save to the kerb and burned
 * thirty-five minutes. Every sanctioned arrival transitions the save first
 * (the Palace's exit, the flat's Act One door, a preview's own seed), so a
 * save that is elsewhere did not come here on purpose: send it back to its
 * own scene and write nothing at all. */
if (campaign.state.scene.id !== SCENE_IDS.SPECIAL_MEETING) {
  globalThis.location?.replace?.(SCENES[campaign.state.scene.id]?.href ?? 'index.html');
} else {
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_SPECIAL_MEETING);
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
attachPixelRatio(renderer);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
registerSceneRenderer(renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.04, 320);
camera.name = 'specialmeeting.camera';
scene.add(camera);

const hud = new Hud();
const audio = new AudioEngine();
const SPECIAL_MEETING_VOICE_CUES = Object.freeze([
  ...new Set(scriptCues().map((cue) => cue.name)),
]);
let voiceReady = false;
let missingVoiceCues = [];
let failedVoiceCues = [];
let voiceLoadError = null;

window.__squatchStage?.('A car, already running…');
const stage = stageSpecialMeeting(scene, { renderer, audio });

const player = new Player(camera, stage.world);
player.position.copy(stage.spawn.position ?? new THREE.Vector3(0, EYE_HEIGHT, 0));
player.yaw = stage.spawn.yaw ?? 0;
player.mode = 'walk';
player.onFootstep = (surface, intensity) => audio.footstep(stage.footstepSurface ?? FOOTSTEP_SURFACE, intensity);
const interaction = new InteractionSystem(camera, hud);

/* `groundAt` matters as much as the sedan does: the cast is placed by door
 * anchor, and a door anchor is a pair of coordinates with no opinion about how
 * high the ground under it is. On the block that is the difference between
 * standing ON the pavement and standing 0.15 m into it; in the woods, where
 * this is swapped for the forest's own field at the cut to black, it is the
 * difference between the clearing floor and thirty-two metres under it. */
const cast = buildSpecialMeetingCast(scene, {
  sedan: stage.sedan,
  colliders: stage.world.colliders,
  groundAt: stage.world.groundAt,
});
cast.boardForArrival();

let forest = null;
let gatedOn = null;
const reachedNodes = new Set();
let paused = false;
let handedOff = false;
let started = false;
let startPromise = null;

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
  const spoken = speak(audio, line.cue, {
    speaker: body ? body.group : camera,
    mix: SPEECH_MIX,
  });
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
  if (options?.length && document.pointerLockElement === canvas) document.exitPointerLock?.();
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

const PLAYER_INPUT_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ShiftLeft', 'ShiftRight', 'KeyC', 'Space',
]);

/* ------------------------------------------------------------------ */
/* INPUT, WHICH THIS SCENE DID NOT HAVE                                */
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
function requestScenePointerLock() {
  if (paused || handedOff || document.pointerLockElement === canvas) return;
  try {
    const pending = canvas.requestPointerLock?.();
    pending?.catch?.(() => {});
  } catch {
    /* An embedded preview can deny pointer lock without invalidating the
     * scene, exactly as the graveyard's own note says. */
  }
}

canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || event.target.closest?.('button, a')) return;
  requestScenePointerLock();
});

document.addEventListener('pointerlockchange', () => {
  player.enabled = !paused && document.pointerLockElement === canvas;
  if (!player.enabled) player.clearKeys();
});

addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas) player.handleMouseMove(event.movementX, event.movementY);
});

addEventListener('keydown', (event) => {
  if (paused) return;
  /* The TRANSLATED key, so a rebound Move or Sprint reaches the player -- the
   * same call every other scene makes. Movement codes preventDefault so Space
   * does not scroll an embedding page; Use stays outside the movement set. */
  const code = translateKey(event.code);
  if (PLAYER_INPUT_CODES.has(code)) {
    player.setKey(code, true);
    event.preventDefault();
  }
  /* Autorepeat must not open a second hold whose release reads as a tap. */
  if (code === 'KeyE' && !event.repeat) interaction.press();
  if (!ride.options) return;
  const n = Number(event.key);
  if (!Number.isInteger(n) || n < 1 || n > ride.options.length) return;
  event.preventDefault();
  ride.choose(ride.options[n - 1].index);
});

addEventListener('keyup', (event) => {
  const code = translateKey(event.code);
  player.setKey(code, false);
  if (code === 'KeyE') interaction.release();
});

/* A key held when the window loses focus is a key that never comes up. */
addEventListener('blur', () => player.clearKeys());

/* ------------------------------------------------------------------ */
/* The sequence                                                        */
/* ------------------------------------------------------------------ */

/* specialmeeting.html has no #objectives of its own, so this is the panel's
 * own upper-left card -- injected, styled by the panel, out of the way of a
 * crosshair. */
const objectivePanel = createObjectivePanel();

const ride = createRideSequence({
  onLine: (line) => say(line),
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
    objectivePanel.setLine(objectiveFor(b));
    if (GATES[b.id] && !reachedNodes.has(GATES[b.id])) gatedOn = GATES[b.id];
    if (RELEASES[b.id]) forest?.resume();
    if (b.id === 'SM-100') cast.disembarkForPickup();
    if (b.id === 'SM-110') {
      cast.holdTheFrontDoor();
      /* The dome light, because a door is open. The sedan has no swinging
       * doors yet — `sedan.js` animates the boot lid and nothing else — so
       * the light IS the open door until somebody builds one. Numbskull's
       * body standing in the doorway does the rest. */
      stage.sedan.setCabinLight(true);
    }
    if (b.id === 'SM-120') cast.lagTakesTheBack();
    if (b.id === 'SM-322') cast.swapRearSeats();
    if (b.id === 'SM-400') { cast.getOut(); forest?.leave(); }
    /* The boot. Kittenboss stands herself up and climbs out under her own
     * power — `cast.js` owns the move, and it is a stand rather than a lift
     * because nobody helps her and she does not need it. She is a woman and
     * the other prospect, at Tony's rank; the scene said "he" everywhere
     * until 2026-08-20 and every one of those was corrected on the owner's
     * ruling. Nothing about this call changed with it. */
    if (b.id === 'SM-420') cast.kittenbossOut();
  },
  onSeated: () => {
    /* The door shuts, Numbskull walks round the back of the car, and the seat
     * behind the Prospect fills. The central locking goes and nobody remarks
     * on it — do not add a line here. */
    cast.takeSeats();
    stage.sedan.setCabinLight(false);
    stage.arrival?.snapToKerb?.();
    player.mode = 'seated';
    stage.sedan.eyeWorld('front_passenger', player.position);
  },
  onBlackout: () => {
    /* A cut, not a dissolve. `.cut` takes the shared 1.4-second transition off
     * so the picture stops dead; the engine and the tyres carry straight on. */
    blackout?.classList.add('cut');
    blackout?.classList.add('on');
    beginTheDrive();
  },
  onFadeIn: (seconds) => {
    if (!blackout) return;
    blackout.classList.remove('cut');
    blackout.style.transitionDuration = `${seconds}s`;
    blackout.classList.remove('on');
  },
  onHandoff: () => handOff(),
  onPhase: (phase) => {
    if (phase === 'trail') startTheWalk();
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
/* The drive, which happens behind the black                           */
/* ------------------------------------------------------------------ */

function beginTheDrive() {
  if (forest) return;
  window.__squatchStage?.('The road out…');
  const sedan = adaptMeetingSedan(stage.sedan);
  const forestColliders = [];
  forest = createNightForestRoad({
    scene,
    renderer,
    player,
    car: sedan,
    colliders: forestColliders,
    onNode: (id) => {
      reachedNodes.add(id);
      if (gatedOn === id) gatedOn = null;
    },
  });
  /* The block's flat ground goes with the block. Everything the cast is stood
   * on from here is the forest's terrain field, which is the same one the
   * trees, the trailhead and the car are placed against. */
  cast.setGround((x, z) => forest.heightAt(x, z));
  player.world = forest.world;
  player.clearKeys();
  player.velocity.set(0, 0, 0);
  stage.block.group.visible = false;
  /* The wet street, the alley and the distant passes belong to the block, and
   * the block is behind us now. The forest brings its own bed. */
  stage.ambience.stop();
  forest.board();
  forest.start();
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
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING);
  blackout?.classList.remove('cut');
  if (blackout) blackout.style.transitionDuration = '1.4s';
  blackout?.classList.add('on');
  setTimeout(() => {
    navigateCampaign(campaign, SCENE_IDS.INITIATION, { spawn: 'gathering', location });
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
    player.enabled = false;
    player.clearKeys();
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  },
  onResume: () => {
    paused = false;
    /* Taking the lock back is what re-enables him; see `pointerlockchange`. */
    requestScenePointerLock();
  },
  recovery,
});

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (paused) { renderer.render(scene, camera); return; }

  player.update(dt);
  /* One of the two, never both. The block owns the car, the night and the
   * sound until the cut to black; after it the forest owns all three, and the
   * adapter's own header is explicit that nothing else may step the vehicle
   * while the rail is driving it. */
  if (forest) forest.update(dt);
  else stage.update(dt, player.position);
  if (!started) { renderer.render(scene, camera); return; }
  cast.update(dt, player.position);
  interaction.update(dt);
  if (!gatedOn) ride.update(dt);

  renderer.render(scene, camera);
}

addEventListener('visibilitychange', () => {
  if (document.hidden) pauseMenu.hold();
});

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
      names: [...SPECIAL_MEETING_VOICE_CUES, ...AMBIENCE_CUES],
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
    stage.begin();
    ride.begin('SM-100');
    started = true;
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
  /** What `pointerlockchange` last decided. False means he is a passenger. */
  get playerEnabled() { return player.enabled; },
  get playerMode() { return player.mode; },
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
};
