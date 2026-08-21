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
  SCENE_IDS, TIME_EVENT_IDS, createCampaign, navigateCampaign,
} from '../core/campaign.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { registerSceneRenderer } from '../core/scene-lifecycle.js';
import { buildSpecialMeetingCast } from './cast.js';
import { createNightForestRoad, adaptMeetingSedan } from './forest/index.js';
import { createRideSequence } from './ride.js';
import { SPEAKERS } from './script.js';
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
    button.addEventListener('click', () => ride.choose(Number(button.dataset.choice)));
  }
}

addEventListener('keydown', (event) => {
  if (!ride.options || paused) return;
  const n = Number(event.key);
  if (!Number.isInteger(n) || n < 1 || n > ride.options.length) return;
  event.preventDefault();
  ride.choose(ride.options[n - 1].index);
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
  forest = createNightForestRoad({
    scene,
    renderer,
    player,
    car: sedan,
    colliders: stage.world.colliders,
    onNode: (id) => {
      reachedNodes.add(id);
      if (gatedOn === id) gatedOn = null;
    },
  });
  /* The block's flat ground goes with the block. Everything the cast is stood
   * on from here is the forest's terrain field, which is the same one the
   * trees, the trailhead and the car are placed against. */
  cast.setGround((x, z) => forest.heightAt(x, z));
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
  onPause: () => { paused = true; },
  onResume: () => { paused = false; },
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
 * a start button. This scene has no menu: it opens on a car already running. */
async function wakeTheSound() {
  removeEventListener('pointerdown', wakeTheSound);
  removeEventListener('keydown', wakeTheSound);
  await audio.init();
  await audio.loadAdditional({ prefixes: ['vo.specialmeeting.', 'car.', 'footstep.', 'street.'] });
  stage.begin();
}
addEventListener('pointerdown', wakeTheSound);
addEventListener('keydown', wakeTheSound);

ride.begin('SM-100');
frame();

document.getElementById('loading')?.classList.add('hidden');
/* The boot guard watches for this global by name (`data-ready` on
 * specialmeeting.html). Published last, once the first frame has actually
 * gone out, so a scene that threw on the way up still reports as failed. */
window.SPECIAL_MEETING = {
  campaign, ride, cast, stage, get forest() { return forest; },
  /* The scene root, published for the repo-wide mesh sweep in
   * tools/scene-audit-scenes.mjs, which finds a page's geometry by walking a
   * declared path to a THREE.Scene rather than by guessing. */
  scene,
};
