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
import { Radio } from '../core/radio.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { createPauseMenu } from '../core/pause-menu.js';

import { Course } from './terrain.js';
import { Golfer, makeBag, makeBall, makeBallMarker, makeClub } from './cast.js';
import { CartPair } from './carts.js';
import { CueQueue, Dialogue, numberKeyOwner } from './dialogue.js';
import { Round, BEAT } from './mission.js';
import { Swing, SWING_PHASE, controlWindow } from './swing.js';
import {
  CLUB_IDS, getClub, estimateCarry, landingPreviewFor, powerForCarry,
} from './clubs.js';
import { BALL_STATE, solveShot } from './ball.js';
import {
  SURFACE, surfaceProps, toYards, toFeet, getHole, HOLES, relativeLabel, scoreName,
} from './course.js';
import { heightAt, surfaceAt } from './field.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { HOLE, builtHoles } from './hole.js';
import {
  CourseAudio, GOLF_LATER_AUDIO_SCOPES, GOLF_START_AUDIO_SCOPE,
  playRecordedGolfChoice, playRecordedGolfCue, recordedGolfClip,
} from './audio.js';
import { completedRoundAction, connectGolfFootsteps } from './runtime.js';

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

/* Camera-mounted first-person clubs. The golfers use the same silhouettes,
 * so the club selected in the HUD is the club the player sees in his hands. */
const playerClubRig = new THREE.Group();
playerClubRig.name = 'player-club-rig';
playerClubRig.position.set(0.63, 0.42, -1.18);
playerClubRig.scale.setScalar(0.48);
playerClubRig.visible = false;
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
  playerClubRig.add(model);
}
const handMaterial = new THREE.MeshStandardMaterial({ color: 0xc8916d, roughness: 0.82 });
for (const hand of [
  { x: -0.025, y: -0.20, z: 0.015, rz: -0.18 },
  { x: 0.035, y: -0.25, z: -0.005, rz: 0.14 },
]) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.040, 0.055, 4, 8), handMaterial.clone(),
  );
  mesh.name = 'player-hand';
  mesh.position.set(hand.x, hand.y, hand.z);
  mesh.scale.set(0.82, 1.0, 0.78);
  mesh.rotation.z = hand.rz;
  mesh.renderOrder = 1001;
  mesh.material.depthTest = true;
  mesh.material.depthWrite = false;
  playerClubRig.add(mesh);
}
camera.add(playerClubRig);

/* ------------------------------------------------------------------ */
/* Player, HUD, audio                                                  */
/* ------------------------------------------------------------------ */

const hud = new Hud();
const audio = new AudioEngine();
const radioClock = new AuthoredClock(8);
radioClock.setTime(4, 8 * 60);
const cartRadio = new Radio(audio, hud, radioClock, {
  venue: 'apartment',
  state: createCampaignRadioAdapter(campaign, {
    receiverId: 'silver_pines_lead_cart',
    defaultPower: true,
  }),
  /* This quiet morning does not replay campaign meeting interruptions. */
  canPlayNotice: () => false,
});
const cartRadioPosition = new THREE.Vector3();
const cartRadioReady = cartRadio.loadManifest();
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
const cues = new CueQueue({
  say: (cue, secs) => {
    const who = cue.speaker === CHARACTER_IDS.PROSPECT ? 'Prospect'
      : golfers[cue.speaker]?.name ?? '';
    hud.say(`<em>${who}</em> ${cue.text}`, secs * 1000);
    golfers[cue.speaker]?.say(secs);
    activeVoice?.stop?.();
    activeVoice = playRecordedGolfCue(audio, cue.id, {
      volume: 0.88,
      position: golfers[cue.speaker]?.position ?? null,
      ref: 2.2,
      maxDist: 34,
    });
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
    onBag: () => syncGolfInventory(),
    onBallEvent: (kind, data) => {
      if (kind === 'stop' && data.id === CHARACTER_IDS.PROSPECT) paintCard();
    },
    onHoleComplete: (summary, next) => showHoleCard(summary, next),
    onLoadHole: (n) => course.load(n),
    onRoundComplete: (summary) => showEndCard(summary),
  },
});

/* ------------------------------------------------------------------ */
/* Camera modes                                                        */
/* ------------------------------------------------------------------ */

const CAM = { WALK: 'walk', ADDRESS: 'address', FLIGHT: 'flight', CART: 'cart' };
let camMode = CAM.WALK;
let aimYaw = Math.PI;
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

const sceneInventory = new SceneInventoryBar({
  slots: 5,
  visible: false,
  catalog: {
    driver: { icon: 'D', name: 'Driver' },
    iron: { icon: 'I', name: 'Iron' },
    putter: { icon: 'P', name: 'Putter' },
  },
});

function syncGolfInventory() {
  const selected = Math.max(0, CLUB_IDS.indexOf(club));
  sceneInventory.set(round.hasBag ? CLUB_IDS : [], selected);
}

function selectClub(id, { sound = false } = {}) {
  if (!CLUB_IDS.includes(id)) return false;
  club = id;
  swing.configure({ club, lieSpread: surfaceProps(round.playerSurface()).spread });
  syncPlayerClub();
  syncGolfInventory();
  if (sound) audio.play('golf.bag', { volume: 0.4 });
  paintShot();
  return true;
}

function syncPlayerClub() {
  for (const object of playerClubRig.children) {
    if (object.userData.kind) object.visible = object.userData.kind === club;
  }
}

function paintPlayerClub() {
  playerClubRig.visible = camMode === CAM.ADDRESS;
  if (!playerClubRig.visible) return;
  syncPlayerClub();
  let pose = 0;
  if (swing.phase === SWING_PHASE.POWER) pose = swing.marker * 0.62;
  else if (swing.phase === SWING_PHASE.STRIKE) {
    const span = Math.max(0.05, swing.power + 0.30);
    pose = ((swing.marker + 0.30) / span) * 0.62 - 0.22;
  }
  playerClubRig.rotation.set(-0.04, -0.12, -0.34 + pose);
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
  return {
    club: recommendedClubForShot(), target, label,
    distance: Math.hypot(target.x - ball.x, target.z - ball.z),
  };
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
  selectClub(recommendedClubForShot());
  swing.reset();
  swing.configure({ club, lieSpread: surfaceProps(round.playerSurface()).spread });
  const b = round.playerBall.position;
  const plan = shotPlan();
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
  ui.shot.classList.add('hidden');
  ui.meter.classList.add('hidden');
  ui.aim.classList.add('hidden');
  landingPreview.visible = false;
  ui.landingReticle?.classList.add('hidden');
  playerClubRig.visible = false;
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
    const target = powerForCarry(club, plan.distance, surfaceProps(round.playerSurface()));
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
      detail: `${getClub(club).name} toward ${plan.label} · mouse or A/D aims · click once or press Space`,
      pause: `The suggested play is ${getClub(club).name} toward ${plan.label}. Aim with the mouse or A/D, then click or press Space to start.`,
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
  const targetPower = powerForCarry(club, plan.distance, lie);
  const power = swing.phase === SWING_PHASE.IDLE
    ? targetPower
    : swing.phase === SWING_PHASE.POWER ? swing.marker : swing.power;
  const est = estimateCarry(club, power, lie);
  const carry = c.grounded
    ? `≈ ${Math.round(toFeet(est))} ft`
    : `≈ ${Math.round(toYards(est))} yds`;
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
  const targetPower = powerForCarry(club, plan.distance, lie);
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

function paintMeter() {
  if (!swing.active && swing.phase !== SWING_PHASE.DONE) {
    ui.meter.classList.add('hidden');
    return;
  }
  ui.meter.classList.remove('hidden');

  const striking = swing.phase !== SWING_PHASE.POWER;
  const livePower = striking ? swing.power : swing.marker;
  const lie = surfaceProps(round.playerSurface());
  const liveControl = controlWindow({ club, power: livePower, lieSpread: lie.spread });
  const targetPower = powerForCarry(club, shotPlan().distance, lie);
  const zero = meterValue(0);
  const fillEnd = meterValue(livePower);
  ui.meterFill.style.left = `${Math.min(zero, fillEnd)}%`;
  ui.meterFill.style.width = `${Math.abs(fillEnd - zero)}%`;
  ui.meterMark.style.left = meterPct(swing.marker);
  ui.meterLate.style.width = `${zero}%`;
  ui.meterRisk.style.left = meterPct(swing.safePower);
  ui.meterRisk.style.width = `${100 - meterValue(swing.safePower)}%`;
  ui.meterTarget.style.left = meterPct(targetPower);
  ui.meterIdeal.textContent = striking
    ? 'late · draw / hook'
    : `ideal ${Math.round(targetPower * 100)}%`;
  ui.meterRiskCopy.textContent = striking
    ? 'early · fade / slice'
    : `overswing ${Math.round(swing.safePower * 100)}%+`;

  /* The forgiving middle, drawn where it actually is, so a player can see the
   * size of the target he is being given rather than having to infer it. */
  ui.meterLine.style.left = meterPct(-swing.deadZone);
  ui.meterLine.style.width =
    `${((swing.deadZone * 2) / (1 - METER_FLOOR)) * 100}%`;

  ui.meterHint.textContent = swing.phase === SWING_PHASE.POWER
    ? liveControl.risk > 0.05 ? 'OVERSWING · CLICK TO RISK IT' : 'CLICK: SET POWER'
    : swing.phase === SWING_PHASE.STRIKE
      ? swing.risk > 0.05 ? 'CLICK: SMALLER SWEET SPOT' : 'CLICK: STRIKE'
      : swing.strikeLabel();
  ui.meter.classList.toggle('strike', swing.phase === SWING_PHASE.STRIKE);
  ui.meter.classList.toggle('overswing', liveControl.risk > 0.05);
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

player.yawOffset = 0;

function fireSwing() {
  const result = swing.result;
  const strikeLabel = swing.strikeLabel();
  swing.reset();
  ui.meter.classList.add('hidden');
  const shot = round.playerSwing({
    club, power: result.power, accuracy: result.accuracy, aim: aimYaw,
  });
  if (!shot) return;
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
    const idx = Number(e.code.slice(5)) - 1;
    if (idx < CLUB_IDS.length && round.hasBag) {
      if (camMode === CAM.ADDRESS && swing.phase !== SWING_PHASE.IDLE) {
        hud.toast('Club is locked once the swing starts. Press Q to reset.', 'hint');
        return;
      }
      selectClub(CLUB_IDS[idx], { sound: true });
      if (club === 'driver' && round.beat === BEAT.PLAYER_TEE) {
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
          ? `${cartRadio.station.dial} Â· ${cartRadio.station.name}`
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
        hud.toast(`${cartRadio.station.dial} Â· ${cartRadio.station.name}`);
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
      if (round.requestSkip()) hud.toast('Skipping ahead.');
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

interaction.register(course.marker, {
  label: () => {
    const hole = getHole(HOLE.number);
    return hole
      ? `HOLE ${hole.number} · ${hole.name.toUpperCase()} · PAR ${hole.par} · ${hole.yards} YARDS`
      : 'SILVER PINES';
  },
  onUse: () => {
    const hole = getHole(HOLE.number);
    hud.say(hole
      ? `<em>Silver Pines</em> Hole ${hole.number}. ${hole.yards} yards. ${hole.blurb}`
      : '<em>Silver Pines</em>');
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
    ? `NEXT: ${upcoming.name.toUpperCase()}<br><span>PAR ${upcoming.par} · ${upcoming.yards} YARDS</span>`
    : '';
  card.querySelector('.actions').classList.add('hidden');
  card.classList.remove('hidden');

  player.enabled = false;
  running = false;
  window.setTimeout(() => {
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
  }, 3400);
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
    'While addressing: mouse or A/D — aim; click or Space — start, set power, then hit the strike band.',
    'Orange power overswings: early fades/slices right; late draws/hooks left.',
    'During dialogue: number keys — answer.',
    'R — take a drop. G — pick up a tap-in. F — skip an NPC tee shot. M — mute.',
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
  onRestart: () => window.location.reload(),
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
  }

  updateShotPresentation(dt);

  audio.updateListener(camera);
  paintCard();
  paintGuide();
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

  const resumeHole = begun.resumed ? round.restoreProgress(story.mission) : 1;
  if (begun.resumed && resumeHole === null) {
    story.complete({ holes: story.mission.holes });
    return showStartBlocked({ reason: 'already_complete' });
  }

  await audio.init?.().catch?.(() => {});
  await cartRadioReady.catch?.(() => {});
  const radioCueNames = cartRadio.preloadCueNames({ hours: [8] });
  await audio.loadManifest?.({
    names: [...new Set([...GOLF_START_AUDIO_SCOPE.names, ...radioCueNames])],
    prefixes: [...GOLF_START_AUDIO_SCOPE.prefixes],
  }).catch?.(() => {});
  courseAudio = new CourseAudio(audio);
  round.audio = courseAudio;
  courseAudio.start();
  carts.lead.radioWorld(cartRadioPosition);
  cartRadio.setPosition(cartRadioPosition);
  carts.lead.setRadioOn(false);

  if (begun.resumed && resumeHole > 1) {
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
  if (begun.resumed && resumeHole > 1) {
    round.startHole(resumeHole);
    const t = HOLE.teeMarks.ball;
    player.position.set(t.x, HOLE.tee.y + 1.66, t.z + 4);
    player.yaw = Math.atan2(PIN_X() - t.x, PIN_Z() - t.z) + Math.PI;
    selectClub('iron');
  } else {
    round.begin();
  }
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
  cartRadio, landingPreview,
  player, camera, scene, audio,
  get beat() { return round.beat; },
  get camMode() { return camMode; },
  get club() { return club; },
  setClub: (c) => selectClub(c),
  get aimYaw() { return aimYaw; },
  setAim: (a) => { aimYaw = a; },
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
    updateShotPresentation(dt);
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
