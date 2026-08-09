/**
 * A Morning at Silver Pines — entry point.
 *
 * Same engine as the flat, the club and the Silver Room: the first-person
 * controller, the look-at interaction system, the HUD, the audio engine and
 * the non-modal dialogue box all come out of `src/core` and `src/bing`. What
 * is new is a golf course, a ball, and three men who will wait as long as it
 * takes for you to hit it.
 *
 * The camera is the thing worth reading carefully. He is first-person the
 * whole morning — walking, standing over the ball, and sitting in the cart
 * while Lou says the only important thing anybody says. The one time the view
 * leaves his eyes is to follow a struck ball, and it comes straight back.
 */

import * as THREE from 'three';
import { AudioEngine } from '../core/audio.js';
import { AuthoredClock } from '../core/authored-clock.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import {
  SCENE_IDS, createCampaign, createCampaignRadioAdapter, navigateCampaign,
} from '../core/campaign.js';
import { createGolfStory } from '../core/golf-story.js';
import { isPreviewMode } from '../core/preview-mode.js';
import { Radio } from '../core/radio.js';
import { Inventory } from '../core/inventory.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import { SmokeSystem, emitCigaretteExhale } from '../world/smoke.js';

import { Course } from './terrain.js';
import { Golfer, makeBag, makeBall, makeBallMarker, makeClub } from './cast.js';
import { CartPair } from './carts.js';
import { CueQueue, Dialogue, numberKeyOwner } from './dialogue.js';
import { Round, BEAT } from './mission.js';
import { Swing, SWING_PHASE, controlWindow } from './swing.js';
import {
  CLUB_IDS, getClub, estimateCarry, estimateTotal, landingPreviewFor,
  powerForDistance,
} from './clubs.js';
import { BALL_STATE, solveShot } from './ball.js';
import {
  SURFACE, surfaceProps, toYards, toFeet, getHole, HOLES, relativeLabel, scoreName,
} from './course.js';
import { heightAt, surfaceAt } from './field.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { getCharacter } from '../core/characters.js';
import { HOLE, builtHoles } from './hole.js';
import {
  CourseAudio, GOLF_LATER_AUDIO_SCOPES, GOLF_START_AUDIO_SCOPE,
  playRecordedGolfChoice, playRecordedGolfCue, recordedGolfClip,
} from './audio.js';
import { completedRoundAction, connectGolfFootsteps } from './runtime.js';
import {
  USE_TIME, createHeldProps, dressGolfCartConsumables, dressSquatchBeer,
  loadSquatchBeerLabel,
} from './hands.js';

/* ------------------------------------------------------------------ */
/* Campaign                                                            */
/* ------------------------------------------------------------------ */

const campaign = createCampaign();
const story = createGolfStory({ campaign });

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startBtn = document.getElementById('start-btn');

const ui = {
  card: document.getElementById('golfcard'),
  hole: document.querySelector('#golfcard .hole'),
  par: document.querySelector('#golfcard .par'),
  strokes: document.querySelector('#golfcard .strokes'),
  pin: document.querySelector('#golfcard .pin'),
  shot: document.getElementById('shot'),
  club: document.querySelector('#shot .club'),
  carry: document.querySelector('#shot .carry'),
  lie: document.querySelector('#shot .lie'),
  wind: document.querySelector('#shot .wind'),
  guide: document.getElementById('golf-guide'),
  guideTask: document.querySelector('#golf-guide .task'),
  guideDetail: document.querySelector('#golf-guide .detail'),
  waypoint: document.getElementById('golf-waypoint'),
  waypointLabel: document.querySelector('#golf-waypoint .label'),
  waypointDistance: document.querySelector('#golf-waypoint .distance'),
  map: document.getElementById('golf-map'),
  mapCanvas: document.querySelector('#golf-map canvas'),
  mapDistance: document.querySelector('#golf-map .ball-distance'),
  meter: document.getElementById('meter'),
  meterFill: document.querySelector('#meter .fill'),
  meterMark: document.querySelector('#meter .mark'),
  meterLine: document.querySelector('#meter .line'),
  meterTarget: document.querySelector('#meter .target'),
  meterLate: document.querySelector('#meter .late-zone'),
  meterRisk: document.querySelector('#meter .risk-zone'),
  meterIdeal: document.querySelector('#meter .ideal'),
  meterRiskCopy: document.querySelector('#meter .risk-copy'),
  meterHint: document.querySelector('#meter .hint'),
  aim: document.getElementById('aim'),
  aimDistance: document.querySelector('#aim .distance'),
  landingReticle: document.getElementById('landing-reticle'),
  landingReticleRing: document.querySelector('#landing-reticle .ring'),
  landingReticleLabel: document.querySelector('#landing-reticle span'),
  shotResult: document.getElementById('shot-result'),
  shotQuality: document.querySelector('#shot-result .quality'),
  shotOutcome: document.querySelector('#shot-result .outcome'),
  dialogue: {
    root: document.getElementById('dialogue'),
    name: document.querySelector('#dialogue .who'),
    line: document.querySelector('#dialogue .line'),
    options: document.querySelector('#dialogue .options'),
  },
  endcard: document.getElementById('endcard'),
};

/* ------------------------------------------------------------------ */
/* Preview checkpoint shortcuts (?preview=1&checkpoint=...)            */
/*
 * LOCAL support only, deliberately -- mirrors src/enolasquatch/main.js's own
 * CHECKPOINT_ALIASES rather than routing through src/core/preview-mode.js,
 * whose checkpoint parsers are each a different scene's own vocabulary.
 * Silver Pines is campaign-owned, so this is gated on the shared,
 * scene-agnostic `isPreviewMode()` the same way Enola's is -- a bare
 * `?checkpoint=` on an ordinary link must do nothing.
 *
 * The round has no per-hole "checkpoint" concept of its own (see
 * src/core/golf-story.js -- `recordHole()` just keeps a running card); a
 * hole2/hole3/grille link stages plausible completed-hole scores through
 * that SAME real `recordHole()`/`round.restoreProgress()` machinery a
 * resumed save already uses in `boot()`, below, so the round opens on state
 * that is genuinely that far along rather than a teleport.
 */
const GOLF_CHECKPOINTS = Object.freeze({
  hole1: 1, hole2: 2, hole3: 3, grille: 'grille',
});
const GOLF_CHECKPOINT_LABELS = Object.freeze({
  hole1: 'HOLE 1 · THE INVITATION',
  hole2: 'HOLE 2 · THE LONG WALK',
  hole3: 'HOLE 3 · THE BIG NIGHT',
  grille: 'THE GRILLE · ROUND COMPLETE',
});
/**
 * Plausible completed-hole cards for the holes a jump skips, in the same
 * shape `story.recordHole()` expects. These are the exact values
 * `seedCompletedGolfRound()` in src/core/campaign.js already uses for a
 * preview'd fully-completed round -- reused here rather than invented twice.
 */
const GOLF_PREVIEW_HOLE_CARDS = Object.freeze({
  1: Object.freeze({ hole: 1, par: 3, strokes: 4, penalties: 0 }),
  2: Object.freeze({ hole: 2, par: 5, strokes: 5, penalties: 0 }),
  3: Object.freeze({ hole: 3, par: 4, strokes: 5, penalties: 0 }),
});
function previewCheckpointForLocation(locationLike = window.location) {
  if (!isPreviewMode(locationLike)) return null;
  let params;
  try { params = new URLSearchParams(locationLike?.search || ''); } catch { return null; }
  const value = params.get('checkpoint');
  return value && Object.prototype.hasOwnProperty.call(GOLF_CHECKPOINTS, value) ? value : null;
}
/** Resolved once at boot -- a real waypoint id, or null for the ordinary opening. */
const previewCheckpoint = previewCheckpointForLocation();
if (previewCheckpoint) {
  const label = GOLF_CHECKPOINT_LABELS[previewCheckpoint];
  const tag = overlay?.querySelector('.tag');
  if (tag) tag.textContent = `Preview checkpoint: ${label}. Progress on this page is temporary.`;
  const fine = overlay?.querySelector('.fine');
  if (fine && previewCheckpoint !== 'hole1') {
    fine.textContent = 'Earlier holes are staged with plausible preview scores, not a played round.';
  }
  if (startBtn) startBtn.textContent = `Start at ${label.toLowerCase()}`;
}
/** Stage one skipped hole's plausible card through the real, saveable record. */
function stagePreviewHoleScore(n) {
  const card = GOLF_PREVIEW_HOLE_CARDS[n];
  if (!card) return;
  story.recordHole({
    ...card, heardInvitation: true, rodeWithLou: true, hitGreenInRegulation: true,
  });
}

const stage = (t) => window.__squatchStage?.(t);

function paintSavedRoundHint() {
  const progress = story.mission;
  if (progress?.status !== 'in_progress' || !Array.isArray(progress.holes)) return;
  const finished = new Set(progress.holes.map((entry) => Number(entry.hole)));
  const next = builtHoles().find((number) => !finished.has(number));
  if (!next) return;
  const hole = getHole(next);
  const fine = overlay?.querySelector('.fine');
  if (fine) fine.textContent = `Your first ${finished.size} hole${finished.size === 1 ? ' is' : 's are'} already on Lou’s card.`;
  if (startBtn) startBtn.textContent = `Resume · Hole ${hole?.number ?? next}`;
}

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  window.__squatchSceneFail?.('This machine cannot open WebGL', String(err?.message || err));
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.08, 700);
scene.add(camera);
const smoke = new SmokeSystem(scene);
const smokeOrigin = new THREE.Vector3();
const smokeDirection = new THREE.Vector3();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */

stage('Opening the gate…');
const course = new Course(scene, renderer, { onProgress: stage });

stage('Rounding up the foursome…');
const golfers = {
  [CHARACTER_IDS.LOU]: new Golfer(scene, CHARACTER_IDS.LOU, { ...HOLE.lot.lou, yaw: Math.PI }),
  [CHARACTER_IDS.RIPPINFLOW]: new Golfer(scene, CHARACTER_IDS.RIPPINFLOW, { ...HOLE.lot.rippinflow, yaw: Math.PI }),
  [CHARACTER_IDS.ERIC]: new Golfer(scene, CHARACTER_IDS.ERIC, { ...HOLE.lot.eric, yaw: Math.PI }),
};

const carts = new CartPair(scene);
carts.parkInLot(HOLE.lot.carts);

const bag = makeBag(scene, HOLE.lot.bag.x, HOLE.lot.bag.z, 0.4);
const ballMeshes = new Map();
for (const id of [CHARACTER_IDS.LOU, CHARACTER_IDS.RIPPINFLOW, CHARACTER_IDS.ERIC]) {
  ballMeshes.set(id, makeBall(scene, 0xeef0f4));
}
const playerBallMesh = makeBall(scene, 0xffffff);
ballMeshes.set(CHARACTER_IDS.PROSPECT, playerBallMesh);
const playerBallMarker = makeBallMarker(scene);
playerBallMarker.visible = false;
/* Regulation balls disappear against a 500-yard hole. These are presentation
 * halos, never physics meshes: each follows an NPC ball only while it is in
 * motion, so the player can actually watch the shot they are being asked to
 * watch without turning every resting ball into a beach ball. */
const npcBallMarkers = new Map([
  [CHARACTER_IDS.ERIC, makeBallMarker(scene, {
    name: 'npc-ball-flight-marker-eric', colour: 0x70d9ff, radius: 0.28, glowOpacity: 0.24,
  })],
  [CHARACTER_IDS.RIPPINFLOW, makeBallMarker(scene, {
    name: 'npc-ball-flight-marker-rippinflow', colour: 0xffc85c, radius: 0.30, glowOpacity: 0.24,
  })],
  [CHARACTER_IDS.LOU, makeBallMarker(scene, {
    name: 'npc-ball-flight-marker-lou', colour: 0xc2a2ff, radius: 0.30, glowOpacity: 0.24,
  })],
]);
for (const marker of npcBallMarkers.values()) marker.visible = false;

/* Hot Shots-style pre-shot read: a bright world-space landing area whose
 * distance follows club, lie and the live power bar. The ring is an estimate,
 * not an aim-bot point, so the uncertainty grows with dispersion. */
const landingPreview = new THREE.Group();
landingPreview.name = 'golf-landing-preview';
const landingDisk = new THREE.Mesh(
  new THREE.CircleGeometry(1, 48),
  new THREE.MeshBasicMaterial({
    color: 0xffd84a, transparent: true, opacity: 0.11,
    depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  }),
);
landingDisk.rotation.x = -Math.PI / 2;
landingDisk.name = 'golf-landing-preview-fill';
landingDisk.renderOrder = 900;
landingPreview.add(landingDisk);
const landingRing = new THREE.Mesh(
  new THREE.RingGeometry(0.82, 1, 64),
  new THREE.MeshBasicMaterial({
    color: 0xffdf57, transparent: true, opacity: 0.92,
    depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  }),
);
landingRing.rotation.x = -Math.PI / 2;
landingRing.name = 'golf-landing-preview-ring';
landingRing.renderOrder = 901;
landingPreview.add(landingRing);
for (const rotation of [0, Math.PI / 2]) {
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 0.025, 0.035),
    new THREE.MeshBasicMaterial({
      color: 0xffe36b, transparent: true, opacity: 0.85,
      depthTest: false, depthWrite: false,
    }),
  );
  line.rotation.y = rotation;
  line.position.y = 0.018;
  line.renderOrder = 902;
  landingPreview.add(line);
}
landingPreview.visible = false;
landingPreview.renderOrder = 4;
scene.add(landingPreview);

/**
 * The club in the player's own hands.
 *
 * The golfers use the same silhouettes, so the club selected in the HUD is the
 * club the player sees. What was wrong with it — and what "the clubs are a bit
 * wonky" is about — is that it was never anywhere near the ball.
 *
 * It has to be a stylisation and it is worth being honest about why. The
 * address camera sits 1.25 m behind the ball with its eye 1.52 m up, looking
 * out along the target line — so the ball itself is about fifty degrees below
 * the camera axis and a 66-degree lens simply does not contain it. A club held
 * where a real club is held is entirely off the bottom of the screen, which
 * means the spec's requirement that driver, iron and putter be *readable at
 * address* can only be met by cheating the club up into frame.
 *
 * The old cheat put it at 48% scale hanging off a point 0.42 m ABOVE the eye
 * line, head in the air, shaft across the view, hands as two loose capsules at
 * the top of the grip: a man holding a driver beside his ear. That is what "the
 * clubs are still wonky" is looking at.
 *
 * This one is aimed rather than dialled in. The head is placed at the bottom
 * of the frame where the ball would be if the lens reached it, the hands go
 * up and right where a right-hander's hands are, and the three numbers below
 * are solved from those two points: `HANDS` is the grip, `SHAFT_PITCH` and
 * `ADDRESS_LEAN` are the two rotations that lay the shaft along the line
 * between them, and the scale is the length that line asks for. The rig owns
 * the Z rotation so it can sweep for the swing; the pitch lives on a child so
 * the two transforms cannot fight over the same axis.
 */
const HANDS = new THREE.Vector3(0.36, -0.12, -0.55);
const SHAFT_PITCH = 0.65;
const playerClubRig = new THREE.Group();
playerClubRig.name = 'player-club-rig';
playerClubRig.position.copy(HANDS);
playerClubRig.visible = false;
/* The forward lean. Rotating the club's own -Y down-and-away by this much
 * lands an iron's head within a few centimetres of the teed ball. */
const playerClubTilt = new THREE.Group();
playerClubTilt.name = 'player-club-tilt';
playerClubTilt.rotation.x = SHAFT_PITCH;
playerClubRig.add(playerClubTilt);
/* One scaled space holding the club AND the hands, so they cannot drift apart:
 * the hands used to be full size against a shrunken club, which is two mittens
 * floating beside a shaft. Foreshortened to the length the frame has room for
 * — see the note on the rig above — and big enough that an iron's grooves and
 * a driver's crown both still read. */
const playerClubHold = new THREE.Group();
playerClubHold.name = 'player-club-hold';
playerClubHold.scale.setScalar(0.66);
playerClubTilt.add(playerClubHold);
for (const kind of CLUB_IDS) {
  const model = makeClub(kind);
  model.userData.kind = kind;
  model.visible = kind === 'iron';
  /* Show the actual striking face from first person, not the cavity/back. */
  model.rotation.y = Math.PI - 0.22;
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.renderOrder = 1000;
    /* The camera rig is an overlay, so scene lighting can otherwise turn a
     * silver iron into a black rectangle against the turf. Preserve the
     * authored colours while making the silhouette and face details read. */
    object.material = new THREE.MeshBasicMaterial({
      color: object.material.color?.clone?.() ?? new THREE.Color(0xffffff),
      transparent: object.material.transparent,
      opacity: object.material.opacity,
      side: object.material.side,
      fog: false,
    });
    object.material.depthTest = true;
    object.material.depthWrite = false;
  });
  playerClubHold.add(model);
}
/**
 * Two hands, on the grip, overlapping the way a golf grip overlaps.
 *
 * They were two small capsules floating at the top of the shaft above where
 * anybody's hands could be. These sit on the grip itself — the model's grip
 * runs from y +0.02 down to -0.23 — with the lower hand under the upper one
 * and both rolled onto the shaft rather than beside it.
 */
const handMaterial = new THREE.MeshStandardMaterial({ color: 0xc8916d, roughness: 0.82 });
for (const hand of [
  { y: -0.030, rz: -0.18, scale: 1.0 },
  { y: -0.132, rz: 0.15, scale: 0.94 },
]) {
  /* A fist on a grip is nearly as wide as it is long, so these are short and
   * fat rather than the long capsules that used to read as two sausages laid
   * end to end down the shaft. */
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.040, 0.030, 4, 10), handMaterial.clone(),
  );
  mesh.name = 'player-hand';
  mesh.position.set(0, hand.y, 0);
  mesh.scale.set(0.94 * hand.scale, 1.0 * hand.scale, 0.88 * hand.scale);
  mesh.rotation.set(0.10, 0, hand.rz);
  mesh.renderOrder = 1001;
  mesh.material.depthTest = true;
  mesh.material.depthWrite = false;
  playerClubHold.add(mesh);
}
/* The glove cuff, which is what stops the two fists reading as one shape. */
const gloveCuff = new THREE.Mesh(
  new THREE.CylinderGeometry(0.042, 0.038, 0.024, 10),
  new THREE.MeshBasicMaterial({ color: 0x2a2d34, fog: false }),
);
gloveCuff.name = 'player-glove-cuff';
gloveCuff.position.set(0, -0.082, 0);
gloveCuff.rotation.z = -0.02;
gloveCuff.renderOrder = 1002;
gloveCuff.material.depthWrite = false;
playerClubHold.add(gloveCuff);
camera.add(playerClubRig);

/* ------------------------------------------------------------------ */
/* Player, HUD, audio                                                  */
/* ------------------------------------------------------------------ */

const hud = new Hud();
const audio = new AudioEngine();
const radioClock = new AuthoredClock(8);
radioClock.setTime(4, 8 * 60);
const cartRadio = new Radio(audio, hud, radioClock, {
  venue: 'silver_pines',
  fullSongs: true,
  state: createCampaignRadioAdapter(campaign, {
    receiverId: 'silver_pines_lead_cart',
    defaultPower: true,
  }),
  /* This quiet morning does not replay campaign meeting interruptions. */
  canPlayNotice: () => false,
});
const cartRadioPosition = new THREE.Vector3();
const cartRadioReady = cartRadio.loadManifest();
const cartRadioAudioPlan = { startup: [], full: [] };
let cartRadioAudioReady = Promise.resolve({ total: 0, loaded: 0 });
const player = new Player(camera, course);
player.position.set(HOLE.lot.playerStart.x, 1.66, HOLE.lot.playerStart.z);
/* Face the actual opening action. The old PI heading looked directly away
 * from Eric, the bag and the parked carts, which made a populated car park
 * read as an empty field on the very first controllable frame. */
player.yaw = Math.atan2(
  HOLE.lot.playerStart.x - HOLE.lot.bag.x,
  HOLE.lot.playerStart.z - HOLE.lot.bag.z,
);
player.mode = 'walk';

const interaction = new InteractionSystem(camera, hud);

let courseAudio = null;
connectGolfFootsteps(player, () => courseAudio);
let activeVoice = null;

/**
 * Who is speaking, and from where.
 *
 * Four of them are Golfers with scorecard lines. The five on the grille
 * balcony are not — they are `course.gallery` figures — and until they were
 * given lines nothing here had to know that. A cue from one of them used to
 * resolve to an empty name and a null position, which is a subtitle with no
 * speaker on it, played flat in the middle of the player's head.
 */
function speakerFor(id) {
  if (golfers[id]) return golfers[id];
  return course.gallery?.find((npc) => npc.characterId === id) ?? null;
}

function speakerName(id) {
  if (id === CHARACTER_IDS.PROSPECT) return 'Prospect';
  return golfers[id]?.name ?? getCharacter(id)?.subtitleName ?? '';
}

const cues = new CueQueue({
  say: (cue, secs) => {
    const speaker = speakerFor(cue.speaker);
    hud.say(`<em>${speakerName(cue.speaker)}</em> ${cue.text}`, secs * 1000);
    activeVoice?.stop?.();
    activeVoice = playRecordedGolfCue(audio, cue.id, {
      volume: 0.88,
      position: speaker?.position ?? null,
      ref: 2.2,
      /* The balcony is across the green and up a storey, so heckling has to
       * carry further than a man standing next to you reading a putt. */
      maxDist: golfers[cue.speaker] ? 34 : 58,
    });
    /* The mouth goes on AFTER the take has started, because it is driven by
     * the take (src/core/mouth.js) rather than by `secs`. A heckler on the
     * balcony is fifty metres away and his jaw is two pixels; the four men in
     * the group are standing next to you. */
    speaker?.say?.(secs, activeVoice ? { audio, source: activeVoice } : null);
    courseAudio?.duck(true);
    cartRadio.setPhoneDucked(true);
  },
  clear: (reason) => {
    if (reason === 'interrupted' || reason === 'reset') activeVoice?.stop?.();
    courseAudio?.duck(false);
    cartRadio.setPhoneDucked(false);
  },
  /* Recorded performance owns subtitle timing; reading speed is the fallback. */
  clipLength: (id) => {
    const clip = recordedGolfClip(audio, id);
    return clip?.duration ?? null;
  },
});

const dialogue = new Dialogue(ui.dialogue, {
  onChoice: (option) => {
    audio.play('ui.select', { volume: 0.4 });
    activeVoice?.stop?.();
    activeVoice = playRecordedGolfChoice(audio, option, { volume: 0.92 });
  },
  cueSeconds: (cueId) => recordedGolfClip(audio, cueId)?.duration ?? 0,
  onEnd: () => { cues.suppressBanter(false); },
});

/* ------------------------------------------------------------------ */
/* The round                                                           */
/* ------------------------------------------------------------------ */

let ended = false;
let pendingHoleTransition = null;
const round = new Round({
  cues,
  dialogue,
  golfers,
  carts,
  audio: null,        // set once the engine is ready
  missions: campaign.state.missions,
  hooks: {
    onToast: (text) => hud.toast(text),
    onStroke: () => paintCard(),
    onBag: () => stockBag(),
    onBallEvent: (kind, data) => {
      if (kind === 'stop' && data.id === CHARACTER_IDS.PROSPECT) paintCard();
    },
    onHoleComplete: (summary, next) => showHoleCard(summary, next),
    onLoadHole: (n) => { course.load(n); wireSideCooler(); restockSquatchBeer(); },
    onRoundComplete: (summary) => showEndCard(summary),
  },
});

/* ------------------------------------------------------------------ */
/* Camera modes                                                        */
/* ------------------------------------------------------------------ */

const CAM = { WALK: 'walk', ADDRESS: 'address', FLIGHT: 'flight', CART: 'cart' };
let camMode = CAM.WALK;
let aimYaw = Math.PI;
let plannedDistance = null;
const swing = new Swing();
let club = 'iron';
let flightTimer = 0;
let addressReturn = null;
let shotPresentation = null;
let shotResultTimer = 0;
let shotTracer = null;
let shotTracerAge = 0;
const shotTracerPoints = [];
const _v = new THREE.Vector3();
const _look = new THREE.Vector3();

/**
 * What he is carrying, on the shared five slots.
 *
 * The bottom box was a read-only picture of the bag: three clubs, drawn from
 * `CLUB_IDS`, and nothing else could ever be in it. So taking a beer out of
 * the cooler played a sound and hid a can, and the Zyn tin and the cigarettes
 * printed a line and were gone — *"I take zyns or smoke from the cart and they
 * don't go into my inventory, I can only change through the clubs."*
 *
 * It is `core/inventory.js` now, the same object the flat and the Bing carry,
 * feeding the same `SceneInventoryBar`. Clubs occupy slots like everything
 * else, which is the whole point: the number keys select a slot rather than
 * indexing a hard-coded club list, so a Zyn can sit in slot four and be
 * selected exactly the way the putter is.
 */
const GOLF_ITEMS = Object.freeze({
  driver: { icon: 'D', name: 'Driver', hint: 'Long, low, and hard to aim' },
  iron: { icon: 'I', name: 'Iron', hint: 'Everything from a chip to a hundred and ninety' },
  putter: { icon: 'P', name: 'Putter', hint: 'Roll it. Do not hit it' },
  beer: { icon: '🍺', name: 'Cold beer', hint: 'Hold [F] to drink' },
  cigs: { icon: '🚬', name: 'Smokes', hint: 'Hold [F] to light one' },
  zyn: { icon: '⬤', name: 'Zyn — wintergreen', hint: 'Hold [F] to pack one' },
});
/** Which of those are consumed by holding [F] rather than swung. */
const CONSUMABLES = Object.freeze(['beer', 'cigs', 'zyn']);

const inventory = new Inventory(5);
const sceneInventory = new SceneInventoryBar({
  slots: 5,
  visible: false,
  catalog: GOLF_ITEMS,
});

const heldProps = createHeldProps(camera);
/* Seconds of [F] held so far on the selected consumable, and which one it was
 * when he started — so letting go, or changing slot, abandons it. */
let usingItem = null;
let useProgress = 0;
let cigaretteDragPlayed = false;

function syncGolfInventory() {
  sceneInventory.set(inventory.items, inventory.selected);
  const held = inventory.held;
  heldProps.show(CONSUMABLES.includes(held) ? held : null);
  if (usingItem && usingItem !== held) cancelItemUse();
  /* The club already has the whole `#shot` panel; the hand card is for the
   * things that panel says nothing about. */
  hud.setHand?.(CONSUMABLES.includes(held) ? GOLF_ITEMS[held] : null);
}
inventory.onChange = syncGolfInventory;

/** The bag arrives as three real items rather than as a boolean. */
function stockBag() {
  for (const id of CLUB_IDS) if (!inventory.has(id)) inventory.add(id);
  selectClub('iron');
}

/** Put something in a slot, or say why not. Returns true if he took it. */
function pickUp(id, { taken = '', full = 'Your hands are full.' } = {}) {
  if (!inventory.add(id)) {
    hud.toast(full, 'hint', 1800);
    return false;
  }
  if (taken) hud.toast(taken, 'good', 1900);
  return true;
}

function slotOf(id) {
  return inventory.items.indexOf(id);
}

function selectClub(id, { sound = false } = {}) {
  if (!CLUB_IDS.includes(id)) return false;
  club = id;
  swing.configure({ club, lieSpread: surfaceProps(round.playerSurface()).spread });
  syncPlayerClub();
  /* Selecting a club selects its slot, so the bar and the hands never disagree
   * about what he is holding. `select` is a no-op when it is already there. */
  const at = slotOf(id);
  if (at >= 0) inventory.select(at);
  else syncGolfInventory();
  if (sound) audio.play('golf.bag', { volume: 0.4 });
  paintShot();
  return true;
}

/**
 * Hold [F] to drink it, smoke it, or pack it.
 *
 * The same contract as the flat: a hold, not a tap, with the prop coming up to
 * his mouth as the hold fills. Releasing early puts it back down with nothing
 * consumed, which is what makes it a decision rather than a misclick.
 */
function beginItemUse() {
  const held = inventory.held;
  if (!CONSUMABLES.includes(held)) return false;
  if (camMode !== CAM.WALK) return false;
  usingItem = held;
  useProgress = 0;
  if (held === 'beer') audio.play('can.crack', { volume: 0.72, position: player.position });
  if (held === 'cigs') {
    cigaretteDragPlayed = false;
    audio.play('cig.light', { volume: 0.75, position: player.position });
  }
  if (held === 'zyn') audio.play('zyn.tin', { volume: 0.55, position: player.position });
  return true;
}

function cancelItemUse() {
  usingItem = null;
  useProgress = 0;
  heldProps.poseDrink(0);
  heldProps.poseTin(0);
  heldProps.poseSmoke(0, 0);
}

function updateItemUse(dt) {
  if (!usingItem) {
    if (heldProps.showing === 'cigs') heldProps.poseSmoke(0, clock.elapsedTime ?? 0);
    return;
  }
  if (!player.keys.has('KeyF') || camMode !== CAM.WALK) {
    cancelItemUse();
    return;
  }
  useProgress += dt;
  const k = Math.min(1, useProgress / (USE_TIME[usingItem] ?? 2));
  if (usingItem === 'beer') heldProps.poseDrink(k);
  else if (usingItem === 'zyn') heldProps.poseTin(k);
  else {
    heldProps.poseSmoke(k, useProgress);
    if (!cigaretteDragPlayed && k >= 0.36) {
      cigaretteDragPlayed = true;
      audio.play('cig.drag', { volume: 0.7, position: player.position });
    }
    if (Math.random() < dt * 6) {
      heldProps.cig.ember.getWorldPosition(smokeOrigin);
      smoke.wisp(smokeOrigin);
    }
  }
  if (k < 1) return;

  const finished = usingItem;
  if (finished === 'cigs') {
    camera.getWorldPosition(smokeOrigin);
    camera.getWorldDirection(smokeDirection);
    emitCigaretteExhale(smoke, smokeOrigin, smokeDirection);
    audio.play('cig.exhale', { volume: 0.8, position: player.position });
  }
  cancelItemUse();
  inventory.remove(finished);
  if (finished === 'beer') {
    audio.play('can.crush', { volume: 0.72, position: player.position });
    hud.toast('Cold. Free. Eight in the morning.', 'good', 2200);
  } else if (finished === 'cigs') {
    audio.play('cig.stub', { volume: 0.5, position: player.position });
    hud.toast('Lou packed for eighteen holes.', 'hint', 2200);
  } else {
    audio.play('zyn.tin', { volume: 0.45, position: player.position });
    hud.toast('Wintergreen. Naturally.', 'hint', 2200);
  }
}

function syncPlayerClub() {
  /* The models live in the scaled hold group, not on the rig itself. Walking
   * the wrong list here silently leaves the iron in his hands whichever club
   * the HUD says he has taken out. */
  for (const object of playerClubHold.children) {
    if (object.userData.kind) object.visible = object.userData.kind === club;
  }
}

/**
 * Take the club back, and bring it down.
 *
 * The sweep is a rotation of the whole rig about Z — the hands stay put and
 * the club arcs around them, which is what a golf swing looks like from
 * behind your own hands. The address lean lives on `playerClubTilt`, so this
 * can own the swing without the two transforms arguing.
 *
 * `BACKSWING` is a little over a right angle at the top; the club also lifts
 * and turns as it goes back, because a shaft that only rotates in the screen
 * plane reads as a windscreen wiper.
 */
const ADDRESS_LEAN = -0.77;
const BACKSWING = 1.70;
function paintPlayerClub() {
  playerClubRig.visible = camMode === CAM.ADDRESS;
  if (!playerClubRig.visible) return;
  syncPlayerClub();
  let pose = 0;
  if (swing.phase === SWING_PHASE.POWER) pose = swing.marker;
  else if (swing.phase === SWING_PHASE.STRIKE) {
    /* The arms swing from wherever the strike sweep began, which is no longer
     * the chosen power — see STRIKE_START_FLOOR in swing.js. Reading
     * `swing.power` here made a tap-in's downswing start below the ball. */
    const span = Math.max(0.05, swing.strikeStart + 0.30);
    pose = Math.max(0, (swing.marker + 0.30) / span);
  }
  playerClubRig.rotation.set(
    -0.03 + pose * 0.16,
    -0.10 - pose * 0.34,
    ADDRESS_LEAN + pose * BACKSWING,
  );
  /* The wrists cock as the club goes up and release through the ball. */
  playerClubTilt.rotation.x = SHAFT_PITCH - pose * 0.30;
}

function recommendedClubForShot() {
  const surface = round.playerSurface();
  const distance = round.distanceToPin();
  if (surface === SURFACE.GREEN || (surface === SURFACE.FRINGE && distance < 24)) return 'putter';
  if (surface === SURFACE.BUNKER || surface === SURFACE.DEEP_ROUGH) return 'iron';
  return distance > 195 ? 'driver' : 'iron';
}

/** A playable point farther along the authored fairway, including doglegs. */
function corridorTarget(from, advance) {
  const path = HOLE.corridor?.path;
  if (!path || path.length < 2) return { ...HOLE.pin };
  let nearest = { distance: Infinity, progress: 0 };
  let total = 0;
  const segments = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    segments.push({ a, b, dx, dz, length, start: total });
    const t = Math.max(0, Math.min(1,
      ((from.x - a.x) * dx + (from.z - a.z) * dz) / Math.max(0.001, length * length)));
    const x = a.x + dx * t;
    const z = a.z + dz * t;
    const distance = Math.hypot(from.x - x, from.z - z);
    if (distance < nearest.distance) nearest = { distance, progress: total + length * t };
    total += length;
  }
  const wanted = Math.min(total, nearest.progress + advance);
  const segment = segments.find((part) => wanted <= part.start + part.length)
    ?? segments[segments.length - 1];
  const t = Math.max(0, Math.min(1, (wanted - segment.start) / Math.max(0.001, segment.length)));
  return { x: segment.a.x + segment.dx * t, z: segment.a.z + segment.dz * t };
}

function shotPlan(withClub = club) {
  const ball = round.playerBall.position;
  const holeCard = round.card.hole(CHARACTER_IDS.PROSPECT, HOLE.number);
  const firstShot = holeCard.strokes === 0 && round.playerSurface() === SURFACE.TEE;
  let target = HOLE.pin;
  let label = 'PIN';
  if (firstShot && HOLE.npcTeeShots?.[CHARACTER_IDS.ERIC]?.target) {
    target = HOLE.npcTeeShots[CHARACTER_IDS.ERIC].target;
    label = HOLE.number === 1 ? 'MIDDLE GREEN'
      : HOLE.number === 2 ? 'SAFE SIDE' : 'LEFT FAIRWAY';
  } else if (withClub === 'driver' && round.distanceToPin() > 180) {
    target = corridorTarget(ball, 205);
    label = 'FAIRWAY';
  }
  const naturalDistance = Math.hypot(target.x - ball.x, target.z - ball.z);
  return {
    club: recommendedClubForShot(), target, label, naturalDistance,
    distance: Number.isFinite(plannedDistance) ? plannedDistance : naturalDistance,
  };
}

/** W/S changes the intended carry without rotating the shot line. */
function adjustPlannedDistance(direction) {
  const lie = surfaceProps(round.playerSurface());
  const selected = getClub(club);
  const plan = shotPlan();
  const step = selected.grounded ? 1.524 : 9.144; // five feet or ten yards
  const minimum = selected.grounded ? 0.61 : 9.144;
  /* The planned number is where he wants it to FINISH, so the ceiling is the
   * club's total and not its carry. */
  const maximum = Math.max(minimum, estimateTotal(club, 1, lie));
  const current = Number.isFinite(plannedDistance) ? plannedDistance : plan.distance;
  plannedDistance = THREE.MathUtils.clamp(current + direction * step, minimum, maximum);
  const copy = selected.grounded
    ? `${Math.round(toFeet(plannedDistance))} FT PLANNED`
    : `${Math.round(toYards(plannedDistance))} YDS PLANNED`;
  hud.toast(copy, 'hint', 1100);
  paintShot();
  return plannedDistance;
}

function clearShotTracer() {
  if (!shotTracer) return;
  scene.remove(shotTracer);
  shotTracer.geometry.dispose();
  shotTracer.material.dispose();
  shotTracer = null;
  shotTracerPoints.length = 0;
}

function beginShotTracer() {
  clearShotTracer();
  const b = round.playerBall.position;
  shotTracerPoints.push(new THREE.Vector3(b.x, b.y + 0.06, b.z));
  shotTracer = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(shotTracerPoints),
    new THREE.LineBasicMaterial({ color: 0xc6abff, transparent: true, opacity: 0.86, depthWrite: false }),
  );
  shotTracer.name = 'player-shot-tracer';
  shotTracer.renderOrder = 30;
  scene.add(shotTracer);
  shotTracerAge = 0;
}

function updateShotPresentation(dt) {
  if (shotTracer && round.playerBall.moving) {
    const b = round.playerBall.position;
    const point = new THREE.Vector3(b.x, b.y + 0.06, b.z);
    const prior = shotTracerPoints[shotTracerPoints.length - 1];
    if (!prior || prior.distanceToSquared(point) > 0.04) {
      shotTracerPoints.push(point);
      if (shotTracerPoints.length > 240) shotTracerPoints.shift();
      shotTracer.geometry.setFromPoints(shotTracerPoints);
    }
  } else if (shotTracer) {
    shotTracerAge += dt;
    shotTracer.material.opacity = Math.max(0, 0.86 * (1 - shotTracerAge / 4.2));
    if (shotTracerAge >= 4.2) clearShotTracer();
  }

  if (shotPresentation && !shotPresentation.shown && !round.playerBall.moving) {
    const ball = round.playerBall;
    const lie = surfaceProps(ball.surface).label.toUpperCase();
    const yards = Math.round(toYards(ball.travelled));
    const feet = Math.round(toFeet(ball.distanceToPin()));
    ui.shotQuality.textContent = `${shotPresentation.strike} · ${Math.round(shotPresentation.power * 100)}% POWER`;
    ui.shotOutcome.textContent = ball.state === BALL_STATE.HOLED
      ? `${yards} YDS · IN THE CUP`
      : `${yards} YDS · ${lie} · ${feet} FT TO PIN`;
    ui.shotResult.classList.remove('hidden', 'good', 'bad');
    if (shotPresentation.kind) ui.shotResult.classList.add(shotPresentation.kind);
    shotResultTimer = 4.2;
    shotPresentation.shown = true;
  }
  if (shotResultTimer > 0) {
    shotResultTimer -= dt;
    if (shotResultTimer <= 0) ui.shotResult.classList.add('hidden');
  }
}

function ballPos() {
  const b = round.playerBall.position;
  return _v.set(b.x, b.y, b.z);
}

/** Stand over it: eye down, club out, and the group still in shot. */
function enterAddress() {
  if (!round.canAddress()) return false;
  addressReturn = {
    x: player.position.x, y: player.position.y, z: player.position.z,
    yaw: player.yaw, pitch: player.pitch,
  };
  camMode = CAM.ADDRESS;
  player.enabled = false;
  player.mode = 'frozen';
  frozenMeter = null;
  selectClub(recommendedClubForShot());
  swing.reset();
  swing.configure({ club, lieSpread: surfaceProps(round.playerSurface()).spread });
  const b = round.playerBall.position;
  plannedDistance = null;
  const plan = shotPlan();
  plannedDistance = plan.distance;
  aimYaw = Math.atan2(plan.target.x - b.x, plan.target.z - b.z);
  ui.shot.classList.remove('hidden');
  ui.aim.classList.remove('hidden');
  ui.shotResult.classList.add('hidden');
  playerClubRig.visible = true;
  syncPlayerClub();
  hud.hidePrompt();
  return true;
}

function leaveAddress() {
  camMode = CAM.WALK;
  player.enabled = true;
  player.mode = 'walk';
  swing.reset();
  frozenMeter = null;
  ui.shot.classList.add('hidden');
  ui.meter.classList.add('hidden');
  ui.aim.classList.add('hidden');
  landingPreview.visible = false;
  ui.landingReticle?.classList.add('hidden');
  playerClubRig.visible = false;
  plannedDistance = null;
  /* The flight camera follows the live ball; gameplay returns to the stance
   * where the shot began, never teleports to the landing. */
  if (addressReturn) {
    player.position.set(addressReturn.x, addressReturn.y, addressReturn.z);
    player.yaw = addressReturn.yaw;
    player.pitch = addressReturn.pitch;
  } else {
    const b = round.playerBall.position;
    player.position.x = b.x - Math.sin(aimYaw) * 0.9;
    player.position.z = b.z - Math.cos(aimYaw) * 0.9;
    player.yaw = aimYaw;
  }
  addressReturn = null;
}

function applyAddressCamera() {
  const b = round.playerBall.position;
  /* Behind and above the ball, looking down the line he is aiming. Low enough
   * to read the slope, high enough to still see the green. */
  const back = 1.25;
  const x = b.x - Math.sin(aimYaw) * back;
  const z = b.z - Math.cos(aimYaw) * back;
  camera.position.set(x, heightAt(x, z) + 1.52, z);
  _look.set(b.x + Math.sin(aimYaw) * 8, b.y + 0.9, b.z + Math.cos(aimYaw) * 8);
  camera.lookAt(_look);
}

function applyFlightCamera(dt) {
  const b = round.playerBall.position;
  /* Behind and slightly above, easing rather than snapping. Never spins, never
   * whips: the player has to be able to read where it is going. */
  const target = _v.set(
    b.x - Math.sin(aimYaw) * 9,
    Math.max(heightAt(b.x, b.z) + 3.2, b.y + 2.6),
    b.z - Math.cos(aimYaw) * 9,
  );
  camera.position.lerp(target, Math.min(1, dt * 3.4));
  camera.lookAt(b.x, b.y + 0.4, b.z);
}

function applyCartCamera() {
  carts.lead.driverViewWorld(_v);
  camera.position.copy(_v);
  player.position.copy(_v);
  /* He keeps the look. The cart decides where he is, never where he is
   * looking — that is the whole reason this is not a cutscene. Three's camera
   * looks down local -Z while the cart drives down local +Z, hence the half
   * turn. Without it the player was literally driving while looking backward. */
  const e = new THREE.Euler(
    player.pitch,
    carts.lead.group.rotation.y + Math.PI + player.yawOffset,
    0,
    'YXZ',
  );
  camera.quaternion.setFromEuler(e);
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

function paintCard() {
  const hole = getHole(HOLE.number);
  const h = round.card.hole(CHARACTER_IDS.PROSPECT, HOLE.number);
  ui.hole.textContent = `HOLE ${hole.number} · ${hole.name.toUpperCase()}`;
  ui.par.textContent = `PAR ${hole.par} · ${hole.yards} YDS`;
  ui.strokes.textContent = h ? `${h.strokes}` : '0';
  const d = round.distanceToPin();
  ui.pin.textContent = d < 27 ? `${Math.round(toFeet(d))} ft` : `${Math.round(toYards(d))} yds`;
}

/* The authored scene can stay quiet; the interaction contract cannot. Each
 * state names one verb and (when movement is required) one physical target.
 * The pause screen reads this same state, so the persistent HUD and Tab never
 * contradict one another. */
function guideState() {
  if (camMode === CAM.ADDRESS) {
    const plan = shotPlan();
    const target = powerForDistance(club, plan.distance, surfaceProps(round.playerSurface()));
    const targetPct = Math.round(target * 100);
    if (swing.phase === SWING_PHASE.POWER) {
      return {
        task: 'Set your power',
        detail: `Click again or press Space near the ${targetPct}% plan marker · orange risks a fade or slice`,
        pause: `Set power with your second click or Space. The suggestion is ${targetPct}%; orange is an overswing.`,
      };
    }
    if (swing.phase === SWING_PHASE.STRIKE) {
      const warning = swing.risk > 0.05 ? ' · overswing gives you a smaller sweet spot' : '';
      return {
        task: 'Hit the strike line',
        detail: `Click a third time or press Space inside the pale band for a straight shot${warning}`,
        pause: `Click or press Space inside the pale band. Early fades right; late draws left${warning}.`,
      };
    }
    return {
      task: 'Aim your shot',
      detail: `${getClub(club).name} toward ${plan.label} · A/D aims · W/S changes distance · click once`,
      pause: `The suggested play is ${getClub(club).name} toward ${plan.label}. Aim with the mouse or A/D, set planned distance with W/S, then click or press Space to start.`,
    };
  }

  if (round.needsRelief()) {
    return {
      task: 'Take a drop',
      detail: 'Press R to place the ball somewhere playable',
      pause: 'Press R to take a legal drop and continue the hole.',
    };
  }

  switch (round.beat) {
    case BEAT.LOT:
      if (round.hasBag) {
        return {
          task: 'Join the group at the first tee',
          detail: 'Carry the bag to the marked tee box',
          pause: 'Carry the bag from the car park to the marked first tee.',
          target: { x: HOLE.teeMarks.ball.x, z: HOLE.teeMarks.ball.z, label: 'FIRST TEE' },
        };
      }
      return {
        task: 'Pick up the golf bag',
        detail: 'Walk to the marked bag beside Eric · press E',
        pause: 'Walk to the golf bag beside Eric and press E to pick it up.',
        target: { x: bag.position.x, z: bag.position.z, y: bag.position.y + 1.25, label: 'GOLF BAG' },
      };
    case BEAT.WALK_TO_TEE:
      return {
        task: 'Join the group at the first tee',
        detail: 'Carry the bag to the marked tee box',
        pause: 'Carry the bag from the car park to the marked first tee.',
        target: { x: HOLE.teeMarks.ball.x, z: HOLE.teeMarks.ball.z, label: 'FIRST TEE' },
      };
    case BEAT.TEE_TALK:
      if (dialogue.active && dialogue.options.length) {
        return {
          task: 'Answer Lou',
          detail: 'Press the number beside the response you want',
          pause: 'Answer Lou with the number key beside your chosen response.',
        };
      }
      if (dialogue.lastEndReason && dialogue.lastEndReason !== 'done') {
        const lou = golfers[CHARACTER_IDS.LOU]?.group?.position;
        return {
          task: 'Return to Lou',
          detail: 'The first-tee conversation is not finished',
          pause: 'Return to Lou at the first tee to finish the required conversation.',
          target: lou ? { x: lou.x, y: lou.y + 1.4, z: lou.z, label: 'LOU' } : null,
        };
      }
      return {
        task: 'Listen at the tee',
        detail: 'Stay with the group while the conversation finishes',
        pause: 'Stay with the group and listen to the tee conversation.',
      };
    case BEAT.NPC_TEE:
      return {
        task: 'Watch the group tee off',
        detail: 'Your turn is next · F skips shots after you have seen one',
        pause: 'Watch Eric, Rippin and Lou tee off. F skips ahead after the first shot.',
      };
    case BEAT.PLAYER_TEE:
      return {
        task: 'Take your tee shot',
        detail: 'Walk to your marked ball · press E to address it',
        pause: 'Walk to your ball and press E. Aim with the mouse, then click three times to swing.',
        target: {
          x: round.playerBall.position.x, z: round.playerBall.position.z,
          y: round.playerBall.position.y + 0.55, label: 'YOUR BALL',
        },
      };
    case BEAT.TEE_RESULT:
      return {
        task: 'Watch your ball',
        detail: 'The group will move when the tee-shot reaction finishes',
        pause: 'Watch where the tee shot finishes, then follow the group to the carts.',
      };
    case BEAT.CART:
      if (dialogue.active && dialogue.options.length) {
        return {
          task: 'Answer Lou while you drive',
          detail: 'Press the number beside your response',
          pause: 'Drive with W/S and A/D. Answer Lou with the number beside your response.',
        };
      }
      {
        const exit = round.cartExitState();
        if (!exit.ok && /Lou/i.test(exit.reason)) {
          return {
            task: 'Drive to your ball with Lou',
            detail: 'W/S drive · A/D steer · Space brakes · R radio · keep listening',
            pause: 'Drive toward YOUR BALL on the top map while Lou finishes talking. R powers the cart radio; T tunes; N skips.',
          };
        }
        if (!exit.ok && /Stop/i.test(exit.reason)) {
          return {
            task: 'Park beside your ball',
            detail: 'Release W or hold Space to stop · R radio · then press E',
            pause: 'Stop the cart beside your ball, then press E to get out. R powers the radio; T tunes; N skips.',
          };
        }
        if (exit.ok) {
          return {
            task: 'Get out at your ball',
            detail: 'Press E to park and continue on foot',
            pause: 'Press E to get out beside your ball and play the next shot.',
          };
        }
      }
      return {
        task: 'Drive to your ball',
        detail: 'Follow YOUR BALL · W/S drive · A/D steer · Space brakes · R radio',
        pause: 'Drive toward YOUR BALL on the top map. W/S drive, A/D steer, Space brakes. R powers the radio; T tunes; N skips.',
      };
    case BEAT.APPROACH:
      if (!round.playerBall.moving && round.playerBall.distanceToPin() <= 0.8) {
        return {
          task: 'Finish the tap-in',
          detail: 'Press G to pick it up (+1) · or press E to putt it',
          pause: 'This ball is inside gimme range. Press G to add the tap-in stroke, or press E to putt it.',
          target: {
            x: round.playerBall.position.x, z: round.playerBall.position.z,
            y: round.playerBall.position.y + 0.55, label: 'TAP-IN',
          },
        };
      }
      return {
        task: 'Play your ball into the cup',
        detail: 'Walk to your marked ball · press E before every shot',
        pause: 'Play your ball into the cup. Walk to it and press E before every shot.',
        target: {
          x: round.playerBall.position.x, z: round.playerBall.position.z,
          y: round.playerBall.position.y + 0.55, label: 'YOUR BALL',
        },
      };
    case BEAT.HOLE_OUT:
    case BEAT.SCORECARD:
      return {
        task: 'Let the group finish',
        detail: 'The scorecard comes next',
        pause: 'Wait for the group to finish the hole and mark the scorecard.',
      };
    case BEAT.WALK_OFF:
      {
        const cartPark = carts?.lead?.position ?? HOLE.cartPark;
      return {
        task: 'Return to the carts',
        detail: 'Walk to the carts to finish this hole',
        pause: 'Walk back to the carts to finish this hole.',
        target: { x: cartPark.x, z: cartPark.z, label: 'CARTS' },
      };
      }
    case BEAT.NEXT_TEE:
      return {
        task: 'Next hole', detail: 'The next tee is being set',
        pause: 'The next tee is being set. The round will continue in a moment.',
      };
    case BEAT.DONE:
      return { task: 'Round complete', detail: '', pause: 'The round is complete.' };
    default:
      return {
        task: 'Stay with the group', detail: 'Follow the current golf card',
        pause: 'Stay with Lou, Eric and Rippin and follow the current golf card.',
      };
  }
}

/**
 * Lift the spoken subtitle clear of whatever the reply box is currently.
 *
 * The CSS floor in golf.css handles the common case; this handles the real
 * one, because `#dialogue` is anchored at its bottom and grows upward by
 * however many options a node has and however long their text wraps. Measured
 * rather than guessed: a four-reply node at 1280x720 is 188 px tall, and no
 * fixed offset can be right for that and for a bare line at the same time.
 *
 * Written only when the value actually changes, so the frame loop is not
 * invalidating layout on every tick to set a property to what it already is.
 */
const subtitleEl = document.getElementById('subtitle');
const SUBTITLE_CLEARANCE = 16;
let subtitleBottom = '';

function layoutSubtitle() {
  if (!subtitleEl) return;
  const box = ui.dialogue.root;
  const showing = box && !box.classList.contains('hidden');
  let want = '';
  if (showing) {
    const rect = box.getBoundingClientRect();
    if (rect.height > 0) {
      want = `${Math.round(window.innerHeight - rect.top + SUBTITLE_CLEARANCE)}px`;
    }
  }
  if (want !== subtitleBottom) {
    subtitleBottom = want;
    subtitleEl.style.bottom = want;
  }
}

const _guideWorld = new THREE.Vector3();
const _guideProjected = new THREE.Vector3();
const _guideCamera = new THREE.Vector3();
let _guideCopy = '';

function paintGuide() {
  if (!running || ended) {
    ui.guide.classList.add('hidden');
    ui.waypoint.classList.add('hidden');
    return;
  }

  const state = guideState();
  const copy = `${state.task}\n${state.detail}`;
  if (copy !== _guideCopy) {
    ui.guideTask.textContent = state.task;
    ui.guideDetail.textContent = state.detail;
    _guideCopy = copy;
  }
  ui.guide.classList.remove('hidden');

  if (!state.target || camMode !== CAM.WALK) {
    ui.waypoint.classList.add('hidden');
    return;
  }

  const { target } = state;
  const y = target.y ?? (heightAt(target.x, target.z) + 1.15);
  _guideWorld.set(target.x, y, target.z);
  camera.updateMatrixWorld();
  _guideCamera.copy(_guideWorld).applyMatrix4(camera.matrixWorldInverse);
  _guideProjected.copy(_guideWorld).project(camera);

  const behind = _guideCamera.z >= -0.05;
  let nx = _guideProjected.x;
  let ny = _guideProjected.y;
  if (behind) {
    nx = _guideCamera.x >= 0 ? 1 : -1;
    ny = -0.62;
  }

  const edgeX = 58;
  const top = window.innerWidth <= 900 ? 168 : 88;
  const bottom = 76;
  const rawX = (nx * 0.5 + 0.5) * window.innerWidth;
  const rawY = (-ny * 0.5 + 0.5) * window.innerHeight;
  const x = Math.max(edgeX, Math.min(window.innerWidth - edgeX, rawX));
  const yScreen = Math.max(top, Math.min(window.innerHeight - bottom, rawY));
  const offscreen = behind || rawX !== x || rawY !== yScreen;
  const distance = Math.hypot(player.position.x - target.x, player.position.z - target.z);

  ui.waypoint.style.left = `${Math.round(x)}px`;
  ui.waypoint.style.top = `${Math.round(yScreen)}px`;
  ui.waypointLabel.textContent = target.label;
  ui.waypointDistance.textContent = distance < 10
    ? `${distance.toFixed(1)} m`
    : `${Math.round(distance)} m`;
  ui.waypoint.classList.toggle('offscreen', offscreen);
  ui.waypoint.classList.remove('hidden');
}

/* ------------------------------------------------------------------ */
/* Ball finder                                                        */
/* ------------------------------------------------------------------ */

const MAP_BEATS = new Set([
  BEAT.PLAYER_TEE,
  BEAT.TEE_RESULT,
  BEAT.CART,
  BEAT.APPROACH,
]);

function paintBallFinder(now = performance.now()) {
  const ball = round.playerBall;
  const show = running && !ended && MAP_BEATS.has(round.beat)
    && ball.state !== BALL_STATE.HOLED
    && ball.state !== BALL_STATE.WATER
    && ball.state !== BALL_STATE.OUT_OF_BOUNDS;
  ui.map?.classList.toggle('hidden', !show);

  const settled = show && !ball.moving;
  playerBallMarker.visible = settled;
  if (settled) {
    playerBallMarker.position.set(
      ball.position.x,
      heightAt(ball.position.x, ball.position.z) + 0.035,
      ball.position.z,
    );
    const pulse = 1 + Math.sin(now * 0.0048) * 0.10;
    playerBallMarker.scale.setScalar(pulse);
  }
  if (!show || !ui.mapCanvas) return;

  const origin = camMode === CAM.CART ? carts.lead.position : player.position;
  const metres = Math.hypot(origin.x - ball.position.x, origin.z - ball.position.z);
  ui.mapDistance.textContent = metres < 27
    ? `${Math.round(toFeet(metres))} ft`
    : `${Math.round(toYards(metres))} yds`;

  const canvas2d = ui.mapCanvas;
  const ctx = canvas2d.getContext('2d');
  const w = canvas2d.width;
  const h = canvas2d.height;
  const pad = 9;
  const bounds = HOLE.bounds;
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const point = (p) => ({
    x: pad + ((p.x - bounds.minX) / spanX) * (w - pad * 2),
    y: pad + ((p.z - bounds.minZ) / spanZ) * (h - pad * 2),
  });

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#14251a';
  ctx.fillRect(0, 0, w, h);

  const played = [HOLE.teeMarks.ball, ...HOLE.corridor.path, HOLE.green];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#385f37';
  ctx.lineWidth = 13;
  traceMapLine(ctx, played, point);
  ctx.strokeStyle = '#5d8250';
  ctx.lineWidth = 5;
  traceMapLine(ctx, played, point);
  ctx.strokeStyle = '#9b9587';
  ctx.lineWidth = 2;
  traceMapLine(ctx, HOLE.cartPath, point);

  const pin = point(HOLE.pin);
  ctx.strokeStyle = '#f2eee0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pin.x, pin.y + 5);
  ctx.lineTo(pin.x, pin.y - 5);
  ctx.stroke();
  ctx.fillStyle = '#ea765d';
  ctx.beginPath();
  ctx.arc(pin.x, pin.y - 5, 3.2, 0, Math.PI * 2);
  ctx.fill();

  for (const cart of [carts.lead, carts.follow]) {
    const p = point(cart.position);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-cart.group.rotation.y);
    ctx.fillStyle = '#d8d2be';
    ctx.fillRect(-2.2, -3.4, 4.4, 6.8);
    ctx.restore();
  }

  const you = point(origin);
  const ballPoint = point(ball.position);
  ctx.save();
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = 'rgba(216, 197, 255, 0.72)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(you.x, you.y);
  ctx.lineTo(ballPoint.x, ballPoint.y);
  ctx.stroke();
  ctx.restore();

  const heading = camMode === CAM.CART ? carts.lead.group.rotation.y + Math.PI : player.yaw;
  ctx.save();
  ctx.translate(you.x, you.y);
  ctx.rotate(-heading);
  ctx.fillStyle = '#f4f0df';
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(3.8, 4);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-3.8, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const pulse = 5.2 + Math.sin(now * 0.006) * 1.2;
  ctx.strokeStyle = '#d8c5ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ballPoint.x, ballPoint.y, pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#b998ff';
  ctx.beginPath();
  ctx.arc(ballPoint.x, ballPoint.y, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

function traceMapLine(ctx, points, project) {
  if (!points?.length) return;
  const first = project(points[0]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = project(points[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function paintShot() {
  const c = getClub(club);
  const surface = round.playerSurface();
  const lie = surfaceProps(surface);
  ui.club.textContent = c.name.toUpperCase();
  ui.lie.textContent = lie.label;
  ui.wind.textContent = `${HOLE.wind.mph} MPH ${HOLE.wind.label}`;
  const plan = shotPlan();
  const targetPower = powerForDistance(club, plan.distance, lie);
  const power = swing.phase === SWING_PHASE.IDLE
    ? targetPower
    : swing.phase === SWING_PHASE.POWER ? swing.marker : swing.power;
  /* Carry, said out loud as carry. The yellow ring on the ground is the same
   * number, and the plan percentage beside it is a finish distance — three
   * readouts that used to be two different things wearing one label. */
  const est = estimateCarry(club, power, lie);
  const carry = c.grounded
    ? `≈ ${Math.round(toFeet(est))} ft`
    : `≈ ${Math.round(toYards(est))} yds carry`;
  ui.carry.textContent = `${carry} · plan ${Math.round(targetPower * 100)}%`;
}

/**
 * The aim indicator.
 *
 * A cone, not a line. The player is shown roughly where this club off this lie
 * tends to finish, and never a guaranteed trajectory — an exact laser removes
 * the judgement, and the judgement is the game.
 */
function paintAim() {
  const c = getClub(club);
  const lie = surfaceProps(round.playerSurface());
  const spreadDeg = c.dispersion * 0.8 + lie.spread;
  ui.aim.style.setProperty('--spread', `${Math.min(46, spreadDeg * 3.4)}px`);
  const b = round.playerBall.position;
  const plan = shotPlan();
  const toTarget = Math.atan2(plan.target.x - b.x, plan.target.z - b.z);
  let off = ((aimYaw - toTarget) * 180) / Math.PI;
  while (off > 180) off -= 360;
  while (off < -180) off += 360;
  ui.aim.querySelector('.label').textContent = Math.abs(off) < 1
    ? `AT ${plan.label}`
    : `${Math.abs(off).toFixed(0)}° ${off > 0 ? 'RIGHT' : 'LEFT'}`;
}

function paintLandingPreview() {
  if (camMode !== CAM.ADDRESS) {
    landingPreview.visible = false;
    ui.landingReticle?.classList.add('hidden');
    return;
  }
  const lie = surfaceProps(round.playerSurface());
  const plan = shotPlan();
  const targetPower = powerForDistance(club, plan.distance, lie);
  const power = swing.phase === SWING_PHASE.IDLE
    ? targetPower
    : swing.phase === SWING_PHASE.POWER ? swing.marker : swing.power;
  const preview = landingPreviewFor({
    from: round.playerBall.position, aim: aimYaw, club, power, lie,
  });
  landingPreview.position.set(
    preview.x, heightAt(preview.x, preview.z) + 0.075, preview.z,
  );
  landingPreview.scale.set(preview.radius, 1, preview.radius);
  landingPreview.userData.distance = preview.distance;
  landingPreview.userData.radius = preview.radius;
  landingPreview.userData.club = club;
  landingPreview.visible = preview.distance > 0.2;
  if (ui.aimDistance) {
    ui.aimDistance.textContent = getClub(club).grounded
      ? `${Math.round(toFeet(preview.distance))} FT LANDING AREA`
      : `${Math.round(toYards(preview.distance))} YD LANDING AREA`;
  }
  if (ui.landingReticle && ui.landingReticleRing && ui.landingReticleLabel) {
    camera.updateMatrixWorld(true);
    const centre = _v.set(
      preview.x, heightAt(preview.x, preview.z) + 0.16, preview.z,
    ).project(camera);
    const edge = _look.set(
      preview.x + preview.radius, heightAt(preview.x, preview.z) + 0.16, preview.z,
    ).project(camera);
    const onScreen = centre.z > -1 && centre.z < 1
      && centre.x > -1.15 && centre.x < 1.15
      && centre.y > -1.15 && centre.y < 1.15;
    if (onScreen) {
      const radiusPx = Math.max(27, Math.min(88,
        Math.abs(edge.x - centre.x) * window.innerWidth * 0.5));
      ui.landingReticle.style.left = `${(centre.x * 0.5 + 0.5) * window.innerWidth}px`;
      ui.landingReticle.style.top = `${(-centre.y * 0.5 + 0.5) * window.innerHeight}px`;
      ui.landingReticleRing.style.width = `${radiusPx * 2}px`;
      ui.landingReticleRing.style.height = `${Math.max(20, radiusPx * 0.62)}px`;
      ui.landingReticleLabel.textContent = getClub(club).grounded
        ? `${Math.round(toFeet(preview.distance))} FT`
        : `${Math.round(toYards(preview.distance))} YDS`;
      ui.landingReticle.classList.remove('hidden');
    } else {
      ui.landingReticle.classList.add('hidden');
    }
  }
}

/* The meter runs from the late end of the strike sweep to full power, not from
 * zero to full power.
 *
 * The strike marker travels past the line into negative territory, and mapping
 * that onto a bar that starts at zero clamps it — so the marker parked at the
 * left edge and being *late* looked identical to being perfect. The whole
 * point of the third click is that you can see yourself miss it. */
const METER_FLOOR = -0.30;
const meterValue = (v) => Math.max(0, Math.min(100,
  ((v - METER_FLOOR) / (1 - METER_FLOOR)) * 100));
const meterPct = (v) => `${meterValue(v)}%`;

/**
 * Everything the meter draws, as plain numbers.
 *
 * Pulled out of `paintMeter` so the resolved swing can be *frozen* and drawn
 * again after the ball has gone. `paintMeter` used to have a DONE branch —
 * the mark parked where he actually hit it, and `strikeLabel()` under it —
 * that no player has ever seen: `fireSwing` called `swing.reset()` and hid the
 * meter on the same frame the third click landed, and the camera left for the
 * flight immediately after, so the one frame of feedback that tells a player
 * *why* the ball is doing that was written, styled and unreachable.
 */
function meterState() {
  const striking = swing.phase !== SWING_PHASE.POWER;
  const livePower = striking ? swing.power : swing.marker;
  const lie = surfaceProps(round.playerSurface());
  return {
    phase: swing.phase,
    marker: swing.marker,
    power: livePower,
    deadZone: swing.deadZone,
    safePower: swing.safePower,
    risk: swing.risk,
    liveRisk: controlWindow({ club, power: livePower, lieSpread: lie.spread }).risk,
    targetPower: powerForDistance(club, shotPlan().distance, lie),
    label: swing.strikeLabel(),
  };
}

function paintMeterFrom(state) {
  ui.meter.classList.remove('hidden');
  const striking = state.phase !== SWING_PHASE.POWER;
  const zero = meterValue(0);
  const fillEnd = meterValue(state.power);
  ui.meterFill.style.left = `${Math.min(zero, fillEnd)}%`;
  ui.meterFill.style.width = `${Math.abs(fillEnd - zero)}%`;
  ui.meterMark.style.left = meterPct(state.marker);
  ui.meterLate.style.width = `${zero}%`;
  ui.meterRisk.style.left = meterPct(state.safePower);
  ui.meterRisk.style.width = `${100 - meterValue(state.safePower)}%`;
  ui.meterTarget.style.left = meterPct(state.targetPower);
  ui.meterIdeal.textContent = striking
    ? 'late · draw / hook'
    : `ideal ${Math.round(state.targetPower * 100)}%`;
  ui.meterRiskCopy.textContent = striking
    ? 'early · fade / slice'
    : `overswing ${Math.round(state.safePower * 100)}%+`;

  /* The forgiving middle, drawn where it actually is, so a player can see the
   * size of the target he is being given rather than having to infer it. */
  ui.meterLine.style.left = meterPct(-state.deadZone);
  ui.meterLine.style.width =
    `${((state.deadZone * 2) / (1 - METER_FLOOR)) * 100}%`;

  ui.meterHint.textContent = state.phase === SWING_PHASE.POWER
    ? state.liveRisk > 0.05 ? 'OVERSWING · CLICK TO RISK IT' : 'CLICK: SET POWER'
    : state.phase === SWING_PHASE.STRIKE
      ? state.risk > 0.05 ? 'CLICK: SMALLER SWEET SPOT' : 'CLICK: STRIKE'
      : state.label;
  ui.meter.classList.toggle('strike', state.phase === SWING_PHASE.STRIKE);
  ui.meter.classList.toggle('overswing', state.liveRisk > 0.05);
}

function paintMeter() {
  if (!swing.active && swing.phase !== SWING_PHASE.DONE) {
    ui.meter.classList.add('hidden');
    return;
  }
  paintMeterFrom(meterState());
}

/**
 * The struck meter, held on screen while the ball is in the air.
 *
 * Nine hundred milliseconds is about as long as a player looks at the bar
 * before his eye follows the ball, and it is long enough to read a mark
 * sitting outside the pale band next to the word SLICED.
 */
const STRIKE_FEEDBACK_TIME = 0.9;
let frozenMeter = null;
let frozenMeterTimer = 0;

function updateFrozenMeter(dt) {
  if (!frozenMeter) return;
  frozenMeterTimer -= dt;
  if (frozenMeterTimer <= 0) {
    frozenMeter = null;
    ui.meter.classList.add('hidden');
    return;
  }
  paintMeterFrom(frozenMeter);
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

player.yawOffset = 0;

function fireSwing() {
  const result = swing.result;
  const strikeLabel = swing.strikeLabel();
  /* Snapshot the resolved bar BEFORE the reset, so the mark he actually hit
   * stays on screen for a beat while the ball is in the air. See
   * `updateFrozenMeter`. The ball still launches on this frame — the meter is
   * feedback, never a delay. */
  const struck = meterState();
  swing.reset();
  const shot = round.playerSwing({
    club, power: result.power, accuracy: result.accuracy, aim: aimYaw,
  });
  if (!shot) {
    ui.meter.classList.add('hidden');
    return;
  }
  frozenMeter = struck;
  frozenMeterTimer = STRIKE_FEEDBACK_TIME;
  paintMeterFrom(struck);
  camMode = CAM.FLIGHT;
  flightTimer = 0;
  ui.shot.classList.add('hidden');
  ui.aim.classList.add('hidden');
  landingPreview.visible = false;
  ui.landingReticle?.classList.add('hidden');
  const warning = result.risk > 0.05 ? ' · OVERSWING' : '';
  const kind = result.shape === 'straight' ? 'good'
    : result.shape === 'slice' || result.shape === 'hook' ? 'bad' : '';
  shotPresentation = {
    strike: strikeLabel, power: result.power, shape: result.shape,
    kind, shown: false,
  };
  beginShotTracer();
  playerClubRig.visible = false;
  hud.toast(`${strikeLabel} · ${Math.round(result.power * 100)}% POWER${warning}`, kind, 2600);
}

function onClick() {
  if (camMode !== CAM.ADDRESS) return;
  const phase = swing.click();
  if (phase === SWING_PHASE.DONE) fireSwing();
}

function explainBlockedBall() {
  if (!round.hasBag) return 'Pick up the golf bag beside Eric first.';
  if (round.beat === BEAT.TEE_TALK) return 'Stay with Lou. The tee conversation is not finished.';
  if (round.beat === BEAT.NPC_TEE) return 'Wait for Eric, Rippin and Lou. Your turn is next.';
  if (round.beat === BEAT.TEE_RESULT) return 'Watch where that shot finishes. The group will move next.';
  if (round.playerBall.moving) return 'Wait for the ball to stop.';
  if (round.playerBall.state === BALL_STATE.HOLED) return 'That ball is already in the cup.';
  return 'It is not your turn to play this ball yet.';
}

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (camMode === CAM.ADDRESS) {
    onClick();
    if (document.pointerLockElement !== canvas) requestMouseCapture();
    return;
  }
  if (document.pointerLockElement !== canvas) return;
  interaction.press();
});
window.addEventListener('mouseup', () => interaction.release());

window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (camMode === CAM.ADDRESS) {
    // Aim only. He does not move his feet while he is over the ball.
    aimYaw -= e.movementX * 0.0016;
    return;
  }
  if (camMode === CAM.CART) {
    player.yawOffset -= e.movementX * 0.0022;
    player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - e.movementY * 0.0022));
    return;
  }
  player.handleMouseMove(e.movementX, e.movementY);
});

window.addEventListener('keydown', (e) => {
  if (pendingHoleTransition && ['KeyR', 'Space', 'Enter'].includes(e.code)) {
    advanceHoleTransition();
    e.preventDefault();
    return;
  }
  if (camMode === CAM.ADDRESS
    && ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(e.code)) {
    const farther = e.code === 'ArrowUp' || e.code === 'KeyW';
    adjustPlannedDistance(farther ? 1 : -1);
    e.preventDefault();
    return;
  }
  if (camMode === CAM.ADDRESS
    && ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
    const left = e.code === 'ArrowLeft' || e.code === 'KeyA';
    aimYaw += (left ? 1 : -1) * (e.shiftKey ? 0.07 : 0.022);
    e.preventDefault();
    return;
  }
  if (camMode === CAM.ADDRESS && (e.code === 'Space' || e.code === 'Enter')) {
    if (!e.repeat) onClick();
    e.preventDefault();
    return;
  }
  if (e.repeat) return;

  /* The one input rule that matters. Number keys pick a reply when replies are
   * on screen and pick a club when they are not — never both. */
  if (/^Digit[1-9]$/.test(e.code)) {
    if (numberKeyOwner(dialogue) === 'dialogue') {
      dialogue.choose(Number(e.code.slice(5)) - 1);
      e.preventDefault();
      return;
    }
    /* A slot, not a club index. The bag puts three clubs in the first three
     * slots so 1/2/3 still take out the driver, the iron and the putter — but
     * a beer in slot four is now reachable by pressing 4, which is the whole
     * of the playtest note. */
    const idx = Number(e.code.slice(5)) - 1;
    const inSlot = inventory.items[idx] ?? null;
    if (inSlot) {
      if (camMode === CAM.ADDRESS && swing.phase !== SWING_PHASE.IDLE) {
        hud.toast('Club is locked once the swing starts. Press Q to reset.', 'hint');
        return;
      }
      if (!CLUB_IDS.includes(inSlot)) {
        inventory.select(idx);
        hud.toast(`${GOLF_ITEMS[inSlot].name} — ${GOLF_ITEMS[inSlot].hint}`, 'hint', 2200);
        return;
      }
      selectClub(inSlot, { sound: true });
      /* Eric's "that is a lot of club" only means anything on a tee that does
       * not want a driver. It used to fire on every tee, including the two
       * that open on a driver by design — the same misfire as Lou's
       * wrong-club line, from the other direction. */
      if (club === 'driver' && round.beat === BEAT.PLAYER_TEE && !round.wantsDriver()) {
        cues.playSequence('bark.driver_on_par_three');
      }
    }
    return;
  }

  switch (e.code) {
    case 'KeyE':
      if (camMode === CAM.ADDRESS) return;
      if (camMode === CAM.CART) {
        const exit = round.leaveCart();
        if (!exit.ok) hud.toast(exit.reason, 'hint', 2800);
        else hud.toast('Cart parked. Play your ball.', 'good', 2200);
        return;
      }
      if (nearBall()) {
        if (round.canAddress()) { enterAddress(); return; }
        hud.toast(explainBlockedBall(), 'hint', 3800);
        return;
      }
      interaction.press();
      break;
    case 'Escape':
      if (camMode === CAM.ADDRESS) { leaveAddress(); return; }
      document.exitPointerLock?.();
      break;
    case 'KeyQ':
      if (camMode === CAM.ADDRESS) leaveAddress();
      break;
    case 'KeyR':
      if (camMode === CAM.CART) {
        cartRadio.toggle();
        carts.lead.setRadioOn(cartRadio.on);
        hud.toast(cartRadio.on
          ? `${cartRadio.station.dial} · ${cartRadio.station.name}`
          : 'Cart radio off');
      } else if (round.needsRelief()) {
        round.takeDrop(
          round.playerBall.state === BALL_STATE.OUT_OF_BOUNDS ? 'oob' : 'water',
        );
      }
      break;
    case 'KeyT':
      if (camMode === CAM.CART) {
        cartRadio.tune();
        carts.lead.setRadioOn(cartRadio.on);
        hud.toast(`${cartRadio.station.dial} · ${cartRadio.station.name}`);
      }
      break;
    case 'KeyN':
      if (camMode === CAM.CART && cartRadio.on) {
        cartRadio.next();
        hud.toast('Next radio block', 'hint', 1500);
      }
      break;
    case 'KeyG': {
      const result = round.takeGimme();
      if (!result.ok) hud.toast(result.reason, 'hint', 2200);
      break;
    }
    case 'KeyF':
      /* Skipping an NPC tee shot is only a thing during the tee beat, and
       * `requestSkip` says so itself. Everywhere else F is the hold that
       * drinks the beer — the same key the flat and the Bing use for it. */
      if (round.requestSkip()) hud.toast('Skipping ahead.');
      else if (!beginItemUse() && CONSUMABLES.includes(inventory.held)) {
        hud.toast('Not while you are over the ball.', 'hint', 1600);
      }
      break;
    case 'KeyM':
      audio.setMasterVolume(audio.muted ? 1 : 0);
      audio.muted = !audio.muted;
      hud.toast(audio.muted ? 'Muted' : 'Sound on');
      break;
    default:
      player.setKey(e.code, true);
  }
});

window.addEventListener('keyup', (e) => {
  player.setKey(e.code, false);
  if (e.code === 'KeyE') interaction.release();
  if (e.code === 'KeyF') cancelItemUse();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cartRadio.pause();
  else cartRadio.resume();
});

function nearBall() {
  const b = round.playerBall.position;
  return Math.hypot(player.position.x - b.x, player.position.z - b.z) < 2.6;
}

/* ------------------------------------------------------------------ */
/* Interactables                                                       */
/* ------------------------------------------------------------------ */

interaction.register(bag, {
  label: () => (round.hasBag ? 'Three clubs. That is the bag.' : 'Take the <b>bag</b>'),
  enabled: () => !round.hasBag,
  onUse: () => round.takeBag(),
});

/**
 * Everything on the cart you can actually take.
 *
 * All three of these used to be flavour: a sound, a line in the corner, and a
 * can that vanished. They are pickups now — the beer goes in a slot and comes
 * out again when he holds [F], the smokes and the tin do the same — which is
 * the difference between an amenity and a prop of one.
 */
let cartBeersRemaining = carts.lead.amenities?.beers?.length ?? 0;
interaction.register(carts.lead.amenities.cooler, {
  label: () => cartBeersRemaining > 0
    ? `Take a <b>cart beer</b> · ${cartBeersRemaining} cold`
    : 'The <b>cooler</b> is empty',
  enabled: () => camMode === CAM.WALK,
  onUse: () => {
    if (cartBeersRemaining <= 0) {
      hud.toast('Cooler is empty.', 'hint', 1400);
      return;
    }
    const at = carts.lead.amenities.cooler.getWorldPosition(new THREE.Vector3());
    if (!pickUp('beer', {
      taken: cartBeersRemaining > 1
        ? `Cold one. ${cartBeersRemaining - 1} left in the cart.`
        : 'Last cart beer. Hold F when you want it.',
    })) return;
    carts.lead.amenities.beers[cartBeersRemaining - 1].visible = false;
    cartBeersRemaining--;
    audio.play('golf.pickup', { volume: 0.5, position: at });
  },
});

interaction.register(carts.lead.amenities.cigarettes, {
  label: () => (inventory.has('cigs')
    ? 'You already have the <b>smokes</b>'
    : 'Take the <b>cigarettes</b>'),
  enabled: () => camMode === CAM.WALK && !inventory.has('cigs'),
  onUse: () => {
    const at = carts.lead.amenities.cigarettes.getWorldPosition(new THREE.Vector3());
    if (!pickUp('cigs', { taken: 'Smokes. Lou packed for eighteen holes.' })) return;
    carts.lead.amenities.cigarettes.visible = false;
    audio.play('cig.pack', { volume: 0.5, position: at });
  },
});

interaction.register(carts.lead.amenities.zyn, {
  label: () => (inventory.has('zyn')
    ? 'The <b>tin</b> is already in your pocket'
    : 'Take the <b>Zyn tin</b>'),
  enabled: () => camMode === CAM.WALK && !inventory.has('zyn'),
  onUse: () => {
    const at = carts.lead.amenities.zyn.getWorldPosition(new THREE.Vector3());
    if (!pickUp('zyn', { taken: 'Wintergreen. Naturally.' })) return;
    carts.lead.amenities.zyn.visible = false;
    audio.play('zyn.tin', { volume: 0.55, position: at });
  },
});

/**
 * The course's own trailside coolers, one built fresh with each hole.
 *
 * `course.sideCooler` is a new object every time `course.build()` runs -- the
 * old one's geometry already went with the last hole's teardown -- so the
 * interaction target has to be re-registered on every load rather than once
 * at startup, unlike the cart's cooler which lives for the whole round.
 */
let sideCoolerTarget = null;
let sideCoolerRemaining = 0;
/**
 * Dress every can on the course, wherever it currently lives.
 *
 * The cart keeps its cans for the whole round; the trailside cooler is rebuilt
 * with each hole, so this runs again on every load. Cheap and idempotent —
 * `dressSquatchBeer` only ever swaps a geometry and a material.
 */
function restockSquatchBeer() {
  dressGolfCartConsumables(carts.lead.amenities);
  dressGolfCartConsumables(carts.follow.amenities);
  dressSquatchBeer(course.sideCooler?.cans ?? []);
}

function wireSideCooler() {
  if (sideCoolerTarget) interaction.unregister(sideCoolerTarget);
  sideCoolerTarget = null;
  sideCoolerRemaining = 0;
  const cooler = course.sideCooler;
  if (!cooler) return;
  sideCoolerRemaining = cooler.cans.length;
  sideCoolerTarget = cooler.group;
  interaction.register(cooler.group, {
    label: () => sideCoolerRemaining > 0
      ? `Grab a <b>cold one</b> from the cooler · ${sideCoolerRemaining} left`
      : 'This <b>cooler</b> is picked clean',
    enabled: () => camMode === CAM.WALK,
    onUse: () => {
      if (sideCoolerRemaining <= 0) {
        hud.toast('Empty. Somebody beat you to it.', 'hint', 1400);
        return;
      }
      const at = cooler.group.getWorldPosition(new THREE.Vector3());
      if (!pickUp('beer', {
        taken: sideCoolerRemaining > 1
          ? `Cold one. ${sideCoolerRemaining - 1} left in this cooler.`
          : 'Last one out of this cooler.',
      })) return;
      cooler.cans[sideCoolerRemaining - 1].visible = false;
      sideCoolerRemaining--;
      audio.play('golf.pickup', { volume: 0.5, position: at });
    },
  });
}
wireSideCooler();

interaction.register(course.marker, {
  label: () => {
    const hole = getHole(HOLE.number);
    return hole
      ? `HOLE ${hole.number} · ${hole.name.toUpperCase()} · PAR ${hole.par} · ${hole.yards} YARDS`
      : 'SILVER PINES';
  },
  onUse: () => {
    const hole = getHole(HOLE.number);
    const text = hole
      ? `<em>Silver Pines</em> Hole ${hole.number}. ${hole.yards} yards. ${hole.blurb}`
      : '<em>Silver Pines</em>';
    /* One subtitle line at a time, always. `CueQueue` already guarantees that
     * for everything anybody says; this is the one place in the scene that
     * writes to the same element without going through it, and reading the
     * tee marker mid-sentence used to erase whatever Lou was saying and take
     * its timer with it. Reading a sign is not urgent enough to interrupt a
     * man, so it waits its turn as a toast instead. */
    if (cues.busy) hud.toast(text.replace(/<[^>]+>/g, ''), 'hint', 4200);
    else hud.say(text);
  },
});

/* ------------------------------------------------------------------ */
/* End card                                                            */
/* ------------------------------------------------------------------ */

/**
 * Between holes.
 *
 * The card goes up on the hole he has just played, the world is thrown away
 * and rebuilt behind the black, and he walks onto the next tee. This is the
 * only moment in the round the player is not in control, and it lasts exactly
 * as long as the fade.
 */
function showHoleCard(summary, next) {
  story.recordHole(round.persist());
  if (next === null) return;

  const card = ui.endcard;
  card.querySelector('.kicker').textContent = `HOLE ${summary.hole} COMPLETE`;
  card.querySelector('h1').textContent = (getHole(summary.hole)?.name ?? '').toUpperCase();
  card.querySelector('.result').textContent = scoreName(summary.strokes, summary.par);
  card.querySelector('.strokes').textContent =
    `${summary.strokes} strokes · ${relativeLabel(summary.toPar)}`;
  card.querySelector('.stats').textContent = holeStats(summary).join(' · ');
  const upcoming = getHole(next);
  card.querySelector('.next').innerHTML = upcoming
    ? `NEXT: ${upcoming.name.toUpperCase()}<br><span>PAR ${upcoming.par} · ${upcoming.yards} YARDS</span><br><span>R / SPACE · CONTINUE NOW</span>`
    : '';
  card.querySelector('.actions').classList.add('hidden');
  card.classList.remove('hidden');

  player.enabled = false;
  running = false;
  const advance = () => {
    if (!pendingHoleTransition || pendingHoleTransition.next !== next) return;
    window.clearTimeout(pendingHoleTransition.timer);
    pendingHoleTransition = null;
    round.startHole(next);
    const t = HOLE.teeMarks.ball;
    player.position.set(t.x, HOLE.tee.y + 1.66, t.z + 4);
    player.yaw = Math.atan2(PIN_X() - t.x, PIN_Z() - t.z) + Math.PI;
    selectClub('iron');
    camMode = CAM.WALK;
    player.mode = 'walk';
    player.enabled = true;
    running = true;
    ended = false;
    card.classList.add('hidden');
    card.querySelector('.actions').classList.remove('hidden');
    paintCard();
  };
  pendingHoleTransition = {
    next,
    advance,
    timer: window.setTimeout(advance, 3400),
  };
}

function advanceHoleTransition() {
  pendingHoleTransition?.advance?.();
}

const PIN_X = () => HOLE.pin.x;
const PIN_Z = () => HOLE.pin.z;

function holeStats(summary) {
  const stats = [];
  if (summary.closestApproachFeet) stats.push(`Closest approach ${Math.round(summary.closestApproachFeet)} ft`);
  if (summary.longestShotYards) stats.push(`Longest shot ${Math.round(summary.longestShotYards)} yds`);
  if (summary.penalties) stats.push(`${summary.penalties} penalty stroke${summary.penalties > 1 ? 's' : ''}`);
  if (summary.hitGreenInRegulation) stats.push('Green in regulation');
  if (summary.heardInvitation) stats.push('“We invited you.”');
  return stats;
}

/**
 * The round is over.
 *
 * The card is the whole morning rather than the last hole: three lines, the
 * total, and what it came to against par. `story.complete()` is what finally
 * closes the mission — and it refuses a round of fewer than three holes, so
 * this is the only place the campaign learns he actually played golf with Lou
 * rather than being driven to a tee.
 */
function showEndCard(summary) {
  if (ended) return;
  ended = true;
  story.recordHole(round.persist());
  const closed = story.complete({ holes: summary.holes });

  const card = ui.endcard;
  card.querySelector('.kicker').textContent = closed
    ? 'THE ROUND' : `${summary.holes.length} HOLES PLAYED`;
  card.querySelector('h1').textContent = 'SILVER PINES';
  card.querySelector('.result').textContent = relativeLabel(summary.toPar);
  card.querySelector('.strokes').textContent =
    `${summary.strokes} strokes over ${summary.holes.length} hole${summary.holes.length === 1 ? '' : 's'}`;

  /* Everybody's card, because the argument about Rippin's five is the point
   * of keeping one at all. */
  card.querySelector('.stats').innerHTML = summary.lines
    .map((l) => `${l.card} ${l.strokes} (${l.label})`)
    .join(' &nbsp;·&nbsp; ');

  const built = round.holes.length;
  card.querySelector('.next').innerHTML = built < HOLES.length
    ? `${HOLES.length - built} HOLE${HOLES.length - built === 1 ? '' : 'S'} STILL TO BUILD<br>`
      + `<span>${HOLES.filter((h) => !h.playable).map((h) => h.name.toUpperCase()).join(' · ')}</span>`
    : 'THAT IS THE ROUND<br><span>SEVEN O\'CLOCK IS THE ROOM</span>';

  card.querySelector('.actions').classList.remove('hidden');
  const replay = document.getElementById('endcard-again');
  if (replay) replay.hidden = completedRoundAction() !== 'replay';
  card.classList.remove('hidden');
  document.exitPointerLock?.();
  player.enabled = false;
  audio.play('golf.cup', { volume: 0.5 });
}

const returnHome = () => {
  navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door' });
};
document.getElementById('endcard-home')?.addEventListener('click', returnHome);
document.getElementById('endcard-again')?.addEventListener('click', () => {
  if (completedRoundAction() === 'replay') window.location.reload();
  else returnHome();
});

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();
let running = false;
let booting = false;
let paused = false;

function currentObjective() {
  return guideState().pause;
}

function applyCartControls() {
  if (round.beat !== BEAT.CART) return;
  const keys = player.keys;
  carts.setPlayerInput({
    throttle: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
    steer: (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0),
    brake: keys.has('Space'),
  });
}

const pauseMenu = createPauseMenu({
  title: 'A Morning at Silver Pines',
  canPause: () => running && !ended,
  getObjective: currentObjective,
  instructions: [
    'In the cart: W/S — drive. A/D — steer. Space — brake. E — get out by your ball.',
    'Cart radio: R — power. T — tune station. N — next song or block.',
    'W A S D — walk. E or Click — interact.',
    'At your ball: E — address it. Q — back off.',
    '1 — driver. 2 — iron. 3 — putter.',
    'While addressing: mouse or A/D — aim; W/S — planned distance; click or Space — start, set power, then hit the strike band.',
    'Orange power overswings: early fades/slices right; late draws/hooks left.',
    'During dialogue: number keys — answer.',
    '1-5 — pick a slot: three clubs, plus whatever you took off the cart.',
    'Hold F — drink the beer, light a smoke, pack a Zyn. (F skips an NPC tee shot on the tee.)',
    'R — take a drop. G — pick up a tap-in. M — mute.',
    'Tab — pause or resume.',
  ],
  onPause: () => {
    paused = true;
    player.clearKeys();
    player.enabled = false;
    interaction.release();
    interaction.setPaused(true);
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    paused = false;
    interaction.setPaused(false);
    player.enabled = camMode === CAM.WALK;
    audio.ctx?.resume?.();
    clock.getDelta();
    requestMouseCapture();
  },
  recovery: createCampaignSceneRecovery({
    campaign,
    sceneId: SCENE_IDS.SILVER_PINES,
    location: window.location,
  }),
});

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!running) return;
  if (paused) {
    renderer.render(scene, camera);
    return;
  }

  cues.update(dt);
  dialogue.update(dt, player.position);
  round.update(dt, player.position);
  courseAudio?.update(dt);
  updateItemUse(dt);
  smoke.update(dt);

  // --- camera ---
  if (camMode === CAM.ADDRESS) {
    swing.update(dt);
    if (swing.phase === SWING_PHASE.DONE) fireSwing();
    applyAddressCamera();
    paintShot();
    paintAim();
    paintLandingPreview();
    paintMeter();
    paintPlayerClub();
  } else if (camMode === CAM.FLIGHT) {
    flightTimer += dt;
    /* The struck bar stays up for a beat after the third click, so the player
     * can see where his mark landed against the pale band while the ball is
     * still climbing. */
    updateFrozenMeter(dt);
    applyFlightCamera(dt);
    /* Back to him once the ball has stopped and the eye has had a moment to
     * register where it finished. */
    if (!round.playerBall.moving && flightTimer > 1.4) leaveAddress();
  } else if (camMode === CAM.CART) {
    applyCartCamera();
    if (round.beat !== BEAT.CART) {
      camMode = CAM.WALK;
      player.enabled = true;
      player.mode = 'walk';
      player.yaw = carts.lead.group.rotation.y + Math.PI + player.yawOffset;
      player.yawOffset = 0;
      const exit = carts.lead.exitWorld('driver', _v);
      player.position.x = exit.x;
      player.position.y = heightAt(exit.x, exit.z) + 1.66;
      player.position.z = exit.z;
    }
  } else {
    player.update(dt);
    interaction.update(dt);
    if (round.beat === BEAT.CART) {
      camMode = CAM.CART;
      player.enabled = false;
      player.mode = 'frozen';
      player.yawOffset = 0;
      if (cartRadio.preferredOn && !cartRadio.on) cartRadio.turnOn({ remember: false });
      carts.lead.setRadioOn(cartRadio.on);
    }
  }

  // --- world ---
  course.update(dt, player.position);
  applyCartControls();
  carts.update(dt);
  carts.lead.radioWorld(cartRadioPosition);
  cartRadio.setPosition(cartRadioPosition);
  carts.lead.setRadioOn(cartRadio.on);
  radioClock.update(dt);
  cartRadio.update(dt);
  for (const g of Object.values(golfers)) g.update(dt, player.position);

  for (const [id, mesh] of ballMeshes) {
    const b = round.ballFor(id);
    if (!b) continue;
    mesh.position.set(b.position.x, b.position.y + 0.0213, b.position.z);
    mesh.visible = b.state !== BALL_STATE.WATER;
    const marker = npcBallMarkers.get(id);
    if (marker) {
      marker.position.set(b.position.x, b.position.y + 0.055, b.position.z);
      marker.visible = b.moving && b.state !== BALL_STATE.WATER;
    }
  }

  updateShotPresentation(dt);

  audio.updateListener(camera);
  paintCard();
  paintGuide();
  layoutSubtitle();
  paintBallFinder();
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function requestMouseCapture() {
  try {
    /* Embedded browsers may reject pointer lock even after a user gesture.
     * That removes mouse-look, but it must not turn a successfully started
     * round into a fatal boot error. */
    const pending = canvas.requestPointerLock?.();
    pending?.catch?.(() => {});
  } catch {
    /* Pointer lock is optional; clicking the course can try again later. */
  }
}

const START_BLOCK_COPY = Object.freeze({
  already_complete: 'This morning is already on the card. Return to the apartment.',
  mission_locked: 'Lou has not invited you to Silver Pines yet. Return to the apartment and keep moving through the campaign.',
  silver_incomplete: 'Finish the Silver Room before this morning becomes available.',
  wrong_chapter: 'This is not the morning Lou invited you to Silver Pines.',
  lou_call_incomplete: 'Lou has not made the golf call yet. Return to the apartment.',
  travel_incomplete: 'Leave for Silver Pines through the apartment after Lou calls.',
  wrong_scene: 'This round must be resumed through the apartment door.',
  out_of_sequence: 'Silver Pines is not available from this point in the campaign.',
});

function showStartBlocked(result = {}) {
  const reason = result.reason || (result.unrouted ? 'out_of_sequence' : 'mission_locked');
  const panel = overlay?.querySelector('.panel');
  const tag = panel?.querySelector('.tag');
  const fine = panel?.querySelector('.fine');
  if (tag) tag.textContent = START_BLOCK_COPY[reason] || START_BLOCK_COPY.out_of_sequence;
  if (fine) fine.textContent = reason === 'already_complete'
    ? 'The completed round is saved. Continue from the apartment.'
    : 'No campaign progress was changed. Continue from the apartment when the invitation arrives.';
  if (startBtn) {
    startBtn.textContent = reason === 'already_complete' ? 'Round complete' : 'Scene locked';
    startBtn.disabled = true;
  }
  loading?.classList.add('hidden');
  overlay?.classList.remove('hidden');
  booting = false;
  window.__golfStartBlocked = reason;
  return { ok: false, reason };
}

function prefetchLaterGolfAudio() {
  void (async () => {
    for (const scope of GOLF_LATER_AUDIO_SCOPES) {
      await audio.loadAdditional?.(scope).catch?.(() => {});
    }
  })();
}

function prefetchCartRadioAudio() {
  cartRadioAudioPlan.full = cartRadio.preloadCueNames({ hours: [8] });
  cartRadioAudioReady = audio.loadAdditional?.({ names: cartRadioAudioPlan.full })
    ?.catch?.(() => ({ total: 0, loaded: 0 }))
    ?? Promise.resolve({ total: 0, loaded: 0 });
  return cartRadioAudioReady;
}

async function boot() {
  if (running || booting) return;
  booting = true;
  startBtn.disabled = true;
  startBtn.textContent = 'Walking over…';

  /* This is the first campaign write. A bare URL, a locked save, or an
   * out-of-sequence scene stays on this card and leaves the save untouched. */
  const begun = story.begin();
  if (!begun.ok || begun.unrouted) return showStartBlocked(begun);
  if (campaign.state.scene.id !== SCENE_IDS.SILVER_PINES) {
    campaign.enter(SCENE_IDS.SILVER_PINES, { spawn: 'car_park' });
  }

  /* Preview checkpoint: stage plausible completed-hole scores through the
   * real, saveable `story.recordHole()` for every hole before the requested
   * waypoint, so a hole2/hole3/grille link opens on a round that is
   * genuinely that far along. Only reachable on a fresh preview boot
   * (`begun.resumed` is false the first time `story.begin()` claims the
   * round), so it can never collide with an actually-resumed save. */
  if (previewCheckpoint && !begun.resumed) {
    const target = GOLF_CHECKPOINTS[previewCheckpoint];
    const throughHole = target === 'grille' ? 3 : target - 1;
    for (let n = 1; n <= throughHole; n++) stagePreviewHoleScore(n);
  }

  const resumeHole = begun.resumed || previewCheckpoint
    ? round.restoreProgress(story.mission)
    : 1;
  if (begun.resumed && resumeHole === null) {
    story.complete({ holes: story.mission.holes });
    return showStartBlocked({ reason: 'already_complete' });
  }

  await audio.init?.().catch?.(() => {});
  await cartRadioReady.catch?.(() => {});
  /* The cart is several minutes away. Decode only its controls, station IDs
   * and current show intro before opening play; the full 8 AM bank streams in
   * behind the first tee instead of adding 93 MP3 decodes to the start gate. */
  cartRadioAudioPlan.startup = cartRadio.preloadCueNames({ hours: [8], startupOnly: true });
  await audio.loadManifest?.({
    names: [...new Set([...GOLF_START_AUDIO_SCOPE.names, ...cartRadioAudioPlan.startup])],
    prefixes: [...GOLF_START_AUDIO_SCOPE.prefixes],
  }).catch?.(() => {});
  courseAudio = new CourseAudio(audio);
  round.audio = courseAudio;
  courseAudio.start();
  /* The owner-supplied beer artwork, on every can the course stocks. Awaited
   * here rather than fired and forgotten so the first cooler he walks up to
   * already has the real label on it; `resolveGear` never rejects and a
   * missing file leaves the plain can, so this cannot hold the round up. */
  await loadSquatchBeerLabel();
  restockSquatchBeer();
  carts.lead.radioWorld(cartRadioPosition);
  cartRadio.setPosition(cartRadioPosition);
  carts.lead.setRadioOn(false);

  if ((begun.resumed || previewCheckpoint) && resumeHole > 1) {
    await audio.loadAdditional?.({ prefixes: [`vo.golf.h${resumeHole}.`] }).catch?.(() => {});
  }

  loading?.classList.add('hidden');
  overlay.classList.add('hidden');
  /* Shared HUD styling is opt-in through body.playing. Without this class the
   * card, dialogue, interaction prompts, swing meter and all guidance exist in
   * the DOM at opacity zero — logic tests pass while a human sees nothing. */
  document.body.classList.add('playing');
  document.getElementById('hud')?.setAttribute('aria-hidden', 'false');
  ui.card.classList.remove('hidden');
  sceneInventory.show();
  syncGolfInventory();

  requestMouseCapture();
  player.enabled = true;
  if (previewCheckpoint === 'grille') {
    // The full round, staged and closed out for real: `showEndCard()` is the
    // exact function `round`'s own `onRoundComplete` hook calls, and it
    // banks the last hole and calls `story.complete()` itself.
    showEndCard(round.roundSummary());
  } else if ((begun.resumed || previewCheckpoint) && resumeHole > 1) {
    round.startHole(resumeHole);
    const t = HOLE.teeMarks.ball;
    player.position.set(t.x, HOLE.tee.y + 1.66, t.z + 4);
    player.yaw = Math.atan2(PIN_X() - t.x, PIN_Z() - t.z) + Math.PI;
    selectClub('iron');
  } else {
    round.begin();
  }
  prefetchCartRadioAudio();
  prefetchLaterGolfAudio();
  running = true;
  paintCard();
  paintGuide();
  paintBallFinder();
  booting = false;
  return begun;
}

startBtn?.addEventListener('click', () => { boot(); });
canvas.addEventListener('click', () => {
  if (running && !pauseMenu.isPaused() && document.pointerLockElement !== canvas && !ended) requestMouseCapture();
});

frame();

/* ------------------------------------------------------------------ */
/* Verification handle                                                 */
/* ------------------------------------------------------------------ */

/**
 * What `tools/verify-golf.mjs` drives.
 *
 * Deliberately the real objects rather than a parallel test API: a harness
 * that plays a copy of the game proves nothing about the game.
 */
window.__golf = {
  campaign, story, round, course, golfers, carts, cues, dialogue, swing,
  interaction, inventory, heldProps, smoke,
  cartRadio, landingPreview, npcBallMarkers,
  cartRadioAudioPlan,
  waitForCartRadioAudio: () => cartRadioAudioReady,
  player, camera, scene, audio,
  get beat() { return round.beat; },
  get camMode() { return camMode; },
  get club() { return club; },
  setClub: (c) => selectClub(c),
  get aimYaw() { return aimYaw; },
  setAim: (a) => { aimYaw = a; },
  get plannedDistance() { return plannedDistance; },
  adjustPlannedDistance,
  advanceHoleTransition,
  plan: () => {
    const plannedClub = recommendedClubForShot();
    return { ...shotPlan(plannedClub), club: plannedClub };
  },
  enterAddress,
  leaveAddress,
  fireSwing,
  boot,
  /** Take a shot without the meter, for the harness. */
  hit: (power, accuracy = 0) => round.playerSwing({ club, power, accuracy, aim: aimYaw }),
  /** The game's own shot solver, so a harness can aim the way an NPC does. */
  solve: (from, target, withClub = club) => solveShot({
    from, target, club: withClub, lie: surfaceProps(surfaceAt(from.x, from.z)),
  }),
  /* Everything the frame loop advances except rendering. It has to be
   * everything: a harness that steps the mission but not the men walking to
   * the tee is testing a game nobody is playing. */
  step: (dt) => {
    cues.update(dt);
    dialogue.update(dt, player.position);
    round.update(dt, player.position);
    applyCartControls();
    carts.update(dt);
    for (const g of Object.values(golfers)) g.update(dt, player.position);
    courseAudio?.update(dt);
    updateItemUse(dt);
    smoke.update(dt);
    updateShotPresentation(dt);
    updateFrozenMeter(dt);
    /* Keep the verifier's synchronous simulation equivalent to one rendered
     * frame. Browser animation normally applies this camera every RAF, but a
     * tight page-evaluate loop intentionally does not yield to RAF. */
    if (round.beat === BEAT.CART) {
      if (camMode !== CAM.CART) {
        camMode = CAM.CART;
        player.yawOffset = 0;
      }
      applyCartCamera();
    }
  },
  /* Take the transition without the fade, for a harness that runs faster than
   * real time. Same calls `showHoleCard` makes, minus the three seconds of
   * black nobody is watching. */
  advanceToNextHole: () => {
    const next = round.nextHoleNumber();
    if (next === null) return null;
    round.startHole(next);
    const t = HOLE.teeMarks.ball;
    player.position.set(t.x, HOLE.tee.y + 1.66, t.z + 4);
    selectClub('iron');
    camMode = CAM.WALK;
    player.mode = 'walk';
    player.enabled = true;
    ended = false;
    paintCard();
    return HOLE.number;
  },
  teleport: (x, z) => {
    player.position.x = x;
    player.position.z = z;
  },
  /* The live hole, so a harness driving hole three is not reading
   * hole one's pin. */
  get LAYOUT() { return HOLE; },
  HOLE, builtHoles,
  /* Load a hole for real: rebind the layout and rebuild the world. */
  loadHole: (n) => { course.load(n); return HOLE.number; },
  SURFACE, surfaceProps, heightAt, surfaceAt, toYards, toFeet,
};
/* The loading layer is above the opening card. Release it as soon as world
 * construction finishes so the card's user-gesture button can initialise
 * WebAudio and begin the round. */
loading?.classList.add('hidden');
paintSavedRoundHint();
startBtn?.removeAttribute('disabled');
window.__golfReady = true;
