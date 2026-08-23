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
import * as THREE from 'three';

import { AudioEngine } from '../core/audio.js';
import {
  SCENE_IDS, TIME_EVENT_IDS, createCampaign, navigateCampaign,
} from '../core/campaign.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { registerSceneRenderer } from '../core/scene-lifecycle.js';
import { translateKey } from '../core/settings.js';
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
if (campaign.state.scene.id !== SCENE_IDS.SPECIAL_MEETING) {
  campaign.enter(SCENE_IDS.SPECIAL_MEETING, { spawn: 'kerb' });
}
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

const cast = buildSpecialMeetingCast(scene, { sedan: stage.sedan, colliders: stage.world.colliders });
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
  hud.say(`<em>${name}</em> ${line.text}`, 4200);
  if (!audio.hasSample?.(line.cue)) {
    body?.say?.(1.4 + 0.045 * line.text.length, null);
    return null;
  }
  const source = audio.play(line.cue, {
    volume: 0.95,
    follow: body ? body.group : camera,
    ref: 2.2,
    maxDist: 34,
    rolloff: 0.7,
  });
  const seconds = audio.sampleDuration?.(line.cue) ?? null;
  body?.say?.(seconds ?? 2, source ? { audio, source } : null);
  return seconds;
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
      requestGamePointerLock();
    });
  }
}

const PLAYER_INPUT_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ShiftLeft', 'ShiftRight', 'KeyC', 'Space',
]);

addEventListener('keydown', (event) => {
  if (paused) return;
  const code = translateKey(event.code);
  if (PLAYER_INPUT_CODES.has(code)) {
    player.setKey(code, true);
    event.preventDefault();
  }
  if (!ride.options) return;
  const n = Number(event.key);
  if (!Number.isInteger(n) || n < 1 || n > ride.options.length) return;
  event.preventDefault();
  ride.choose(ride.options[n - 1].index);
});
addEventListener('keyup', (event) => player.setKey(translateKey(event.code), false));
addEventListener('blur', () => player.clearKeys());
addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas) player.handleMouseMove(event.movementX, event.movementY);
});
document.addEventListener('pointerlockchange', () => {
  player.enabled = !paused && document.pointerLockElement === canvas;
  if (!player.enabled) player.clearKeys();
});

function requestGamePointerLock() {
  if (paused || document.pointerLockElement === canvas) return;
  const pending = canvas.requestPointerLock?.();
  pending?.catch?.(() => {});
}

canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || event.target.closest?.('button, a')) return;
  requestGamePointerLock();
});

/* ------------------------------------------------------------------ */
/* The sequence                                                        */
/* ------------------------------------------------------------------ */

const ride = createRideSequence({
  onLine: (line) => say(line),
  onChoice: (options) => showChoices(options),
  onBeat: (b) => {
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
    player.enabled = document.pointerLockElement === canvas;
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
    await audio.loadAdditional({
      names: SPECIAL_MEETING_VOICE_CUES,
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
  campaign, ride, cast, stage, player,
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
