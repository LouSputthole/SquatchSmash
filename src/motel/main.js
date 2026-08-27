import * as THREE from 'three';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { createPromptHud } from '../core/hud.js';
import {
  buildMotel, makeJerkyCase, BOUNDS, MOTEL_DOOR_OPEN_ANGLE,
  MOTEL_YOUR_CASE, MOTEL_YOUR_CASE_PAID,
} from './level.js';
import { WEAPON_STATS, buildWeaponMesh } from './actors.js';
import { Person } from '../core/person.js';
import { DebrisSystem } from '../../game/src/debris.js';
import { Effects } from '../../game/src/effects.js';
import { lambert } from '../../game/src/world.js';
import * as sfx from './audio.js';
import {
  prepareVoice as prepareMotelVoice,
  primeVoice as primeMotelVoice,
  stopVoice as stopMotelVoice,
  voiceTap as motelVoiceTap,
  /* Named rather than reached through `sfx.` because it is not a cue: the
   * production-queue scanner reads every `sfx.<name>` in this directory as a
   * sound the code plays, and this is an adapter the shared weapon system
   * plays sounds THROUGH. */
  weaponAudio as motelWeaponAudio,
} from './audio.js';
import {
  NODES, STYLES, STYLE_LABEL, SELLER_BARKS, PROSPECT_BARKS, SNOW_BARKS,
  FIGHT_BARKS, SNOW_FIGHT_BARKS, ENDING, SNOW_GUN_HANDOFF,
  INSPECTION_MEETING_BEATS, ROOM_ENTRY_BEATS,
} from './dialogue.js';
import { rollShipment, Inspection, Freshness } from './jerky.js';
import {
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
  navigateCampaign,
} from '../core/campaign.js';
import { createMotelStory } from '../core/motel-story.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { motelVoiceCue } from './voice.js';
import { motelVoiceCueSet } from './voice-catalog.js';
import {
  DialogueFloor,
  dialogueBeatLeadSeconds,
  nextLineDelayMs,
  resolveLineHold,
} from './dialogue-timing.js';
import { WeaponSystem } from '../core/weapons/WeaponSystem.js';
import { WEAPON_IDS } from '../core/weapons/catalog.js';
import { createFirstPersonInput } from '../core/first-person-input.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { shakeScale, lookSensitivity, bindAudioVolume } from '../core/settings.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import { selectPointInteraction } from './point-interaction.js';
import { createMotelInputPolicy } from './controls.js';
import {
  MOTEL_REINFORCEMENT_STAGES,
  MOTEL_ROAD_Z,
  createMotelActor,
  poseMotelSnowInDriverSeat,
  stageMotelActor,
} from './runtime-geometry.js';
import { buildMotelDriveCar, buildMotelDriveScene } from './drive-geometry.js';
import {
  MotelEvidenceLedger,
  evidenceCounter,
  evidenceMissingCopy,
  evidenceObjectiveCopy,
} from './evidence.js';

// ---------------------------------------------------------------------------
// THE JERKY MOTEL — scene controller.
//
// One continuous playable sequence: sit in the car, walk the lot, knock, talk,
// inspect the merchandise, watch the room turn, survive it, take the case back
// and drive away. Nothing here takes the camera off the player.
// ---------------------------------------------------------------------------

const PLAYER_SCALE = 0.85;
const CAMERA_FOV = 62;
const ARRIVAL_CAMERA_FOV = 75;
const PLAYER_SEATED_SCALE = 0.66;
const ARRIVAL_SNOW_BLEND = 0.35;
const PLAYER_R = 0.42;
const PLAYER_EYE = 1.62;
const GRAVITY = 26;
const JUMP_V = 9.2;
const WALK = 4.8;
const RUN = 7.6;
const ARRIVAL_SECONDS = 4.4;
/** The road across the top of the lot — the way out, and the way trouble comes. */
const ROAD_Z = MOTEL_ROAD_Z;
/* The man in the car is Snow, of the Family: his photo, his voice profile, and
 * two words where anybody else would use ten. One name, one place to change it. */
const ALLY = 'Snow';
const ALLY_FACE = 'assets/faces/snow.png';
/**
 * The line the scene's opening BEAT turns on — Snow's brief, and it is recorded.
 *
 * It is no longer literally the first thing spoken: the arrival sequence draws
 * the .45, puts it away and hands Tony his case ahead of it. Those three lines
 * do not need the priority decode this one gets, because they start on the far
 * side of the non-playable pull-in and the brief still waits on them.
 */
const OPENING_CUE = motelVoiceCue(ALLY, NODES.snowBrief.line);

const campaign = createCampaign();
const motelStory = createMotelStory({ campaign });
let lastEndingKind = null;

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
attachPixelRatio(renderer);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 400);

const level = buildMotel(scene, renderer);
const { colliders, refs } = level;

const player = new Person({
  shirt: 0x384f74,
  shirtDark: 0x26374f,
  pants: 0x242933,
  skin: 0xe8b88a,
  bandana: null,
  hair: 0x3a2a1a,
});
player.group.scale.setScalar(PLAYER_SCALE);
scene.add(player.group);

const debris = new DebrisSystem(scene);
const effects = new Effects(scene);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- HUD handles ----------
const $ = (id) => document.getElementById(id);
const hudEl = $('hud');
const objTitleEl = $('objTitle');
const objSubEl = $('objSub');
const objListEl = $('objList');
const metersEl = $('meters');
const heatFillEl = $('heatFill');
const heatPctEl = $('heatPct');
const heatWrapEl = $('heatWrap');
const readFillEl = $('readFill');
const readPctEl = $('readPct');
const hpFillEl = $('hpFill');
const weaponNameEl = $('weaponName');
const weaponSubEl = $('weaponSub');
const carryLineEl = $('carryLine');
const promptEl = $('prompt');
/* The shared prompt (src/core/hud.js), with the motel's own `show` idiom.
 * What was here before wrote `<b>[E]</b> ${label}` straight into the div, so
 * the key cap was a literal E in a string and a rebound Use key never reached
 * the screen. There is no hold in this scene, so no hold bar is passed. */
const motelPrompt = createPromptHud({
  prompt: promptEl,
  label: promptEl.querySelector('.txt'),
  key: promptEl.querySelector('.key'),
  visibility: 'show',
});
const subtitleEl = $('subtitle');
const toastsEl = $('toasts');
const wheelEl = $('wheel');
const wheelHeadEl = $('wheelHead');
const wheelOptsEl = $('wheelOpts');
const inspectEl = $('inspect');
const inspectListEl = $('inspectList');
const inspectSerialEl = $('inspectSerial');
const verdictEl = $('verdict');
const dmgFlashEl = $('dmgFlash');
const slowTintEl = $('slowTint');
const grappleEl = $('grapple');
const grappleFillEl = $('grappleFill');
const driveHudEl = $('driveHud');
const packBoxEl = $('packBox');
const packListEl = $('packList');
const dealBoxEl = $('dealBox');
const dealYoursEl = $('dealYours');
const dealTheirsEl = $('dealTheirs');
const dealOrderEl = $('dealOrder');
const sceneInventory = new SceneInventoryBar({ slots: 5, visible: false });

// ---------- Game state ----------
let phase = 'menu';   // menu | arrival | car | lot | door | room | fight | recover | escape | drive | end
let paused = false;
let timeScale = 1;
let sharedPauseMenu = null;
let arrivalT = 0;
let arrivalCameraMode = 'passenger';
let openingVoiceReady = false;
let browserInput = null;

const S = {
  hp: 100,
  heat: 0,               // seller suspicion 0..100
  read: 0,               // Prospect's read on the room 0..100
  cluesFound: new Set(),
  weapon: 'fists',
  ammo: 0,
  carryingMoney: false,
  carryingJerky: false,
  /* YOUR CASE, in three states rather than one.
   *
   * `caseHeld` is it under his arm on the way in -- the arrival sequence puts
   * it there so the player never arrives at room twelve holding the wrong
   * thing. `caseDown` is it resting shut on his own edge of the table, which
   * is the tableau the whole inspection plays against: two cases, one table.
   * `moneyOnTable` is the deal step -- the case pushed ACROSS and offered --
   * and it stays exactly what it always was, so the transaction is unchanged. */
  caseHeld: false,
  caseDown: false,
  casePlacementReady: false,
  casePlacementConfirmed: false,
  moneyOnTable: false,
  moneyOpened: false,
  couponOnly: false,
  moneyRecovered: true,
  sat: false,
  knocked: false,
  /* When the knuckles landed and when the door actually swung, in
   * `performance.now()` milliseconds. Recorded rather than inferred so the
   * door's promptness is something a check can measure instead of sleeping
   * through (see docs/ENGINE-TRAPS.md, entry 2). */
  knockedAt: 0,
  doorAnsweredAt: 0,
  /** Rico has stepped aside: the doorstep wheel was answered and the way in is clear. */
  doorOpened: false,
  enteredRoom: false,
  /** The glovebox has been opened once. Opening it again is not news. */
  weaponChecked: false,
  /* THE GUN IS ON HIM, AND IT IS PUT AWAY.
   *
   * The arrival sequence draws the .45, shows it, and holsters it before Tony
   * ever walks a step, so "am I armed" is answered once and never becomes an
   * inventory fight. While it is holstered nothing is drawn at the lens and
   * nothing can be discharged: room twelve is a negotiation, and a player who
   * can shoot the room on the way in has no scene left to play. It comes out
   * the instant the deal goes bad and never goes back (see `releaseWeapon`). */
  holstered: false,
  /** The arrival draw/holster/case handover has run. Once, per scene. */
  armedUp: false,
  /** ...and has finished speaking, which is what the briefing waits on. */
  armedUpSpoken: false,
  /** How many times the room has refused a trigger pull, for line variety. */
  weaponRefusals: 0,
  dealStarted: false,
  sampleOut: false,
  betrayed: false,
  betrayalT: 0,
  fightStarted: false,
  slicerRevealed: false,
  slicerKnown: false,
  /* The Silverback Commander. Snow's own, and the Family's: silver slide,
   * crest on the frame, seven rounds. Taking it is not the same as holding it
   * — it rides concealed through the whole transaction, and drawing it is the
   * decision that turns a deal into a shooting. `silverbackFast` records that
   * Tony opened rather than answered, which is the only way anybody walks out
   * of room twelve in under five seconds. */
  silverbackTaken: false,
  snowGunOfferSpoken: false,
  arrivalComplete: false,
  snowSeated: false,
  snowExitedCar: false,
  silverbackDrawn: false,
  silverbackFast: false,
  snowSignalled: false,
  snowInside: false,
  snowInjured: false,
  stashFound: false,
  ricoEscaped: false,
  caseInPool: false,
  caseBurned: false,
  firedWeapon: false,
  lethalKills: 0,
  usedNonImprovised: false,
  policeHeat: 0,
  policeArrived: false,
  captured: false,
  capturedOnce: false,
  evidenceChoice: null,
  wrongCase: false,
  doorBroken: false,
  windowBroken: false,
  fanSparked: false,
  cordArmed: false,
  mattressCover: false,
  roomLightsOut: false,
  packagesIntact: 8,
  escapeRoute: null,
  tunnelKnown: false,
  positionsMarked: 0,
  reactionBonus: false,
  hiddenWeaponKnown: false,
  /* The transaction, tracked explicitly instead of inferred. */
  dealStep: null,          // one of DEAL_STEPS while the deal is running
  sampleChecked: false,    // ran at least one test on their sample
  packagesCounted: false,  // counted their case of eight
  payRefused: false,       // Rico pushed the money back once: meat first
  countRefused: false,     // and once more for the uncounted eight
  paidBlind: false,        // bought without checking — his own fault, and said so
};

/* The getaway reads this ledger and nothing else. Cases can move through the
 * scene; their collection requirement cannot. */
const evidence = new MotelEvidenceLedger();

const shipment = rollShipment();
const inspection = new Inspection(shipment);
const freshness = new Freshness();

/* THE DEAL, in the order the room runs it.
 *
 * Three objects, three different owners, and the whole scene fell over because
 * they all read as "the case":
 *
 *   THEIR SAMPLE  — one strip, on the table, theirs. You look at it.
 *   THEIR CASE    — eight packages, their side of the room. You count it.
 *   YOUR CASE     — forty thousand dollars, yours. You put it down and open it.
 *
 * Every label, objective and line in this scene now uses exactly those three
 * names, in that order, and the step machine below is the only thing allowed
 * to decide what the HUD is asking for. */
const DEAL_STEPS = ['sample', 'count', 'pay', 'open', 'done'];

const OBJECTIVES = {
  main: [
    { id: 'reach', text: 'Reach room twelve' },
    { id: 'place', text: "Place Lou's case on the marked table spot" },
    { id: 'inspect', text: 'Inspect their sample' },
    { id: 'count', text: 'Count their case of eight' },
    { id: 'payment', text: 'Push your case across the table' },
    { id: 'survive', text: 'Survive the betrayal' },
    { id: 'recover', text: 'Recover all three evidence cases' },
    { id: 'escape', text: 'Escape the motel' },
  ],
  opt: [
    { id: 'counterfeit', text: 'Identify counterfeit product' },
    { id: 'thirdman', text: 'Discover the hidden bathroom attacker' },
    { id: 'signal', text: 'Signal Snow before the betrayal' },
    { id: 'money', text: 'Recover all $40,000' },
    { id: 'intact', text: 'Keep every Reserve package intact' },
    { id: 'unseen', text: 'Avoid police detection' },
    { id: 'noshot', text: 'Escape without firing a weapon' },
    { id: 'stash', text: "Find Rico's hidden premium stash" },
    { id: 'coupon', text: 'Leave the expired steakhouse coupon as payment' },
  ],
};
const objDone = new Set();
const objFailed = new Set();
let currentObjective = 'reach';

const ACHIEVEMENTS = [
  { id: 'snack', name: 'Say Hello to My Little Snack', desc: 'Win the room fight with improvised weapons only' },
  { id: 'grain', name: 'Against the Grain', desc: 'Correctly identify counterfeit jerky' },
  { id: 'welldone', name: 'Well Done', desc: 'Destroy the entire shipment with fire' },
  { id: 'rareform', name: 'Rare Form', desc: 'Escape with every package intact' },
  { id: 'inspector', name: 'Motel Meat Inspector', desc: 'Discover every environmental warning sign' },
  { id: 'nobeef', name: 'No Beef Between Us', desc: 'Complete the scene without killing anyone' },
  { id: 'pricing', name: 'Prospect Pricing', desc: 'Leave only the expired coupon in the money case' },
  { id: 'roomservice', name: 'Room Service', desc: 'Throw an enemy through the motel room door' },
];
const achieved = new Set();

// The ten warning signs. Spotting one buys a concrete advantage later.
const CLUES = {
  wrapper: 'A chewed Reserve wrapper — somebody has been sampling the merchandise.',
  arguing: 'Two voices arguing behind room nine. One of them says "twelve".',
  lookout: 'A lookout smoking by the ice machine, watching the road, not the lot.',
  camera: 'The security camera is aimed at an empty corner of the lot, away from room twelve.',
  secondcar: 'A second car with the engine running. Nobody in the front seat.',
  towel: 'A motel towel in the laundry cart, stiff with dried blood.',
  packets: 'Empty meat-preservation packets. Somebody repacked something out here.',
  railing: 'Someone on the upstairs railing, looking away a half-second too late.',
  bathwindow: "Room twelve's bathroom window opens an inch and closes again.",
  trunk: "Snow's trunk: a crowbar and one very illegal hand cannon.",
};

// ---------- Actors ----------
const actors = [];
let snow = null;
let rico = null;
let chino = null;
let slicer = null;
let lookout = null;
let watcher = null;
let clerk = null;

function spawnMotelActor(stageId) {
  const actor = createMotelActor(scene, stageId, {
    arrivalCar: refs.manCar,
    deckY: level.DECK_Y,
    floorAt: level.floorAt,
  });
  actors.push(actor);
  return actor;
}

// ---------- Player physics state ----------
const pos = new THREE.Vector3(-6.6, 0, 16.6);
let feetY = 0;
let vy = 0;
let camYaw = Math.PI;   // looking at the motel
let camPitch = -0.06;
let shake = 0;
let hitStop = 0;
let attackCd = 0;
let invuln = 0;
let grapple = null;     // { actor, progress, t }
let blindT = 0;
let stunT = 0;
let inspecting = false;
let playerMoving = false;
let playerFootstepReadyAt = 0;
let dialogue = null;    // { nodeId, node, opts }
let subtitleT = 0;
const speechFloor = new DialogueFloor({ nowSeconds: () => performance.now() / 1000 });
const speechTimers = new Set();
const carriedCases = { money: null, jerky: null };

/* An unmistakable table target for the case in Tony's hands. It is a ghost
 * preview plus a lit tray, not a floating objective sentence; both disappear
 * the frame the authoritative `caseDown` state confirms placement. */
const casePlacementMarker = new THREE.Group();
casePlacementMarker.name = 'motel.room12.case-placement-marker';
casePlacementMarker.position.set(MOTEL_YOUR_CASE.x, MOTEL_YOUR_CASE.y, MOTEL_YOUR_CASE.z);
casePlacementMarker.rotation.y = MOTEL_YOUR_CASE.ry;
casePlacementMarker.visible = false;
const placementTray = new THREE.Mesh(
  new THREE.BoxGeometry(1.65, 0.035, 0.92),
  new THREE.MeshBasicMaterial({ color: 0x58f2d0, transparent: true, opacity: 0.42 }),
);
placementTray.name = 'motel.room12.case-placement-tray';
placementTray.position.y = -0.04;
const placementGhost = makeCarryCase(0x58f2d0);
placementGhost.group.name = 'motel.room12.case-placement-ghost';
placementGhost.lid.rotation.x = 0;
for (const pack of placementGhost.packs) pack.mesh.visible = false;
placementGhost.group.scale.setScalar(0.8);
placementGhost.group.traverse((node) => {
  if (!node.isMesh) return;
  node.material = node.material.clone();
  node.material.transparent = true;
  node.material.opacity = 0.23;
  node.material.depthWrite = false;
  if (node.material.emissive) node.material.emissive.setHex(0x58f2d0);
});
casePlacementMarker.add(placementTray, placementGhost.group);
scene.add(casePlacementMarker);
let casePlacementAnim = null;

function makeEvidenceMarker(color) {
  const marker = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.075, 8, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86, depthTest: false }),
  );
  ring.rotation.x = Math.PI / 2;
  const pointer = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.42, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthTest: false }),
  );
  pointer.rotation.x = Math.PI;
  pointer.position.y = 1.2;
  marker.add(ring, pointer);
  marker.visible = false;
  marker.renderOrder = 20;
  scene.add(marker);
  return marker;
}

const evidenceMarkers = {
  reserve: makeEvidenceMarker(0xffc857),
  money: makeEvidenceMarker(0x58f2d0),
  premium: makeEvidenceMarker(0xff5f87),
};
let evidenceMarkerClock = 0;

// ---------- Input ----------
const keys = new Set();
const touch = { active: false, x: 0, y: 0 };

function routeMotelKeyDown(e, code) {
  /* AUTO-REPEAT IS ONE HELD KEY, NOT A STREAM OF PRESSES.
   *
   * Nothing below wants it. Held [E] re-ran the focused interaction at the
   * operating system's repeat rate — which is the owner's "i check revolver
   * and he just keeps saying the voice line over and over", and it applied to
   * every prompt in the scene, not only the glovebox. Held SPACE likewise beat
   * a grapple on its own. Movement, above, is the one thing that reads the
   * key's STATE rather than its edges, so it is handled before this returns. */
  switch (code) {
    case 'Space':
      e.preventDefault();
      if (grapple) mashGrapple();
      else if (phase !== 'menu') tryJump();
      return true;
    case 'KeyE': e.preventDefault(); onUse(); return true;
    case 'KeyQ':
      if (phase === 'car') { e.preventDefault(); exitCar(); }
      return true;
    case 'KeyF': onAttack(); return true;
    /* [R] is reload, the way it is in the siege, the Palace and the combat
     * lab. It used to be a third way to fire — behind left click and behind
     * [F], which already routes a ranged weapon — on a scene whose only gun
     * could not be reloaded at all. */
    case 'KeyR': onReload(); return true;
    case 'KeyX': drawSilverback(); return true;
    case 'KeyG': dropWeapon(); return true;
    case 'Tab': e.preventDefault(); togglePause(); return true;
    case 'KeyM': toggleMute(); return true;
    case 'KeyP': togglePause(); return true;
    case 'Escape':
      if (inspecting) closeInspection();
      else if (dialogue) { /* the wheel is never modal — ignore */ }
      else togglePause();
      return true;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
    case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8': {
      const n = Number(code.slice(5));
      if (dialogue && n <= 4) pickDialogue(STYLES[n - 1]);
      else if (inspecting) runInspectionByKey(n);
      return true;
    }
    case 'Enter':
      if (phase === 'menu') startScene();
      return true;
    default: return false;
  }
}

const motelInputPolicy = createMotelInputPolicy({
  held: keys,
  isGameplayEnabled: () => phase !== 'menu' && phase !== 'end' && !paused,
  look(dx, dy) {
    camYaw -= dx * lookSensitivity(0.0022);
    camPitch = THREE.MathUtils.clamp(
      camPitch - dy * lookSensitivity(0.0018),
      -0.85,
      0.5,
    );
  },
  routeKeyDown: routeMotelKeyDown,
  attack: onAttack,
  ranged: onRanged,
});
browserInput = createFirstPersonInput({
  player: motelInputPolicy.player,
  canvas: renderer.domElement,
  ...motelInputPolicy.adapterOptions,
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

$('startBtn').addEventListener('click', () => startScene());
$('resumeBtn').addEventListener('click', () => togglePause());
$('abortBtn').addEventListener('click', () => { paused = false; $('pause').classList.add('hidden'); finishScene('walked'); });
$('continueBtn').addEventListener('click', () => {
  navigateCampaign(campaign, SCENE_IDS.APARTMENT, {
    spawn: lastEndingKind === 'home' ? 'front_door' : 'motel_retry',
  });
});
$('muteBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });

function toggleMute() {
  sfx.setMuted(!sfx.isMuted());
  $('muteBtn').textContent = sfx.isMuted() ? '🔇' : '🔊';
}

function togglePause() {
  if (sharedPauseMenu) {
    sharedPauseMenu.toggle();
    return;
  }
  if (phase === 'menu' || phase === 'end') return;
  paused = !paused;
  if (paused) {
    sfx.stopMusic();
    $('pauseStats').innerHTML =
      `Objective: <b>${objTitleEl.textContent}</b><br>` +
      `Warning signs found: <b>${S.cluesFound.size} / ${Object.keys(CLUES).length}</b> · ` +
      `Suspicion: <b>${Math.round(S.heat)}%</b>`;
    $('pause').classList.remove('hidden');
  } else {
    $('pause').classList.add('hidden');
    sfx.setMusic(phase === 'fight' || phase === 'recover' || phase === 'escape' ? 'fight' : phase === 'drive' ? 'chase' : 'tense');
    clock.getDelta();
  }
}

sharedPauseMenu = createPauseMenu({
  title: 'The Jerky Motel',
  canPause: () => phase !== 'menu' && phase !== 'end',
  getObjective: () => objTitleEl.textContent?.trim() || 'Reach room twelve and inspect the jerky deal.',
  instructions: [
    'Q - get out when you are seated in Snow\'s car.',
    'W A S D — move. Shift — sprint. Space — jump.',
    'E — interact. F or left click — attack. Right click — fire what you are holding.',
    'R — reload the .45. Six in the cylinder, twelve loose in the coat.',
    'X — draw the Silverback Commander, if Snow gave it to you. It is loud, it is fast, and it is optional.',
    'G — drop the held weapon.',
    'During dialogue or inspection: number keys — choose.',
    'Tab or P — pause and review the current objective.',
    'Escape closes an inspection first, then pauses.',
  ],
  onPause: () => {
    paused = true;
    browserInput.clear('pause');
    sfx.stopMusic();
  },
  onResume: () => {
    paused = false;
    sfx.setMusic(phase === 'fight' || phase === 'recover' || phase === 'escape' ? 'fight' : phase === 'drive' ? 'chase' : 'tense');
    clock.getDelta();
    browserInput.refresh('pause-resume');
    browserInput.requestPointerLock();
  },
  recovery: createCampaignSceneRecovery({
    campaign,
    sceneId: SCENE_IDS.JERKY_MOTEL,
    location,
  }),
});

// Touch controls
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  document.body.classList.add('touch');
  const zone = $('stickZone');
  const base = $('stickBase');
  const knob = $('stickKnob');
  let stickId = null;
  let origin = { x: 0, y: 0 };
  const RANGE = 48;
  zone.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    base.style.left = `${e.clientX}px`;
    base.style.top = `${e.clientY}px`;
    base.style.display = 'block';
    touch.active = true;
    zone.setPointerCapture(e.pointerId);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - origin.x;
    let dy = e.clientY - origin.y;
    const len = Math.hypot(dx, dy);
    if (len > RANGE) { dx *= RANGE / len; dy *= RANGE / len; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    touch.x = dx / RANGE;
    touch.y = dy / RANGE;
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    touch.active = false;
    touch.x = 0;
    touch.y = 0;
    base.style.display = 'none';
    knob.style.transform = 'translate(-50%, -50%)';
  };
  zone.addEventListener('pointerup', endStick);
  zone.addEventListener('pointercancel', endStick);

  let lookId = null;
  let lookLast = { x: 0, y: 0 };
  const look = $('lookZone');
  look.addEventListener('pointerdown', (e) => { lookId = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; });
  look.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    camYaw -= (e.clientX - lookLast.x) * 0.005;
    camPitch = THREE.MathUtils.clamp(camPitch - (e.clientY - lookLast.y) * 0.004, -0.85, 0.5);
    lookLast = { x: e.clientX, y: e.clientY };
  });
  look.addEventListener('pointerup', () => { lookId = null; });
  $('hitBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); if (grapple) mashGrapple(); else onAttack(); });
  $('useBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); onUse(); });
  $('jumpBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); tryJump(); });
}

// ---------- Collision helpers ----------
function playerWindowTraversalBlocked(x, z, y, radius) {
  const { ROOM12: r, BATH: b, ROOM11: r11 } = level.rects;
  const openings = [
    { x0: 2.0, x1: 4.0, z0: r.z1, z1: r.z1 + 0.3 },
    { x0: 2.4, x1: 4.2, z0: r.z0, z1: r.z0 + 0.3 },
    { x0: -12.8, x1: -11.2, z0: r11.z0, z1: r11.z0 + 0.3 },
  ];
  const bot = y + 0.25;
  const top = y + 2.6;
  if (top <= 0 || bot >= 2.7) return false;
  return openings.some((o) => x > o.x0 - radius && x < o.x1 + radius
    && z > o.z0 - radius && z < o.z1 + radius);
}

function blocked(x, z, y, radius = PLAYER_R) {
  /* Option B from the playtest: windows are sight/bullet/actor openings but
   * never player traversal routes. Keeping this out of the level collider
   * registry is intentional — it is policy, not a wall, and Rico's authored
   * bathroom-window escape must continue to path through it. */
  if (playerWindowTraversalBlocked(x, z, y, radius)) return true;
  const bot = y + 0.25;
  const top = y + 2.6;
  for (const c of colliders) {
    if (!c.enabled) continue;
    if (top <= c.y0 || bot >= c.y1) continue;
    if (x > c.x0 - radius && x < c.x1 + radius && z > c.z0 - radius && z < c.z1 + radius) return true;
  }
  return false;
}

/** NPCs may use authored window escapes; Tony may not use the one-way sill. */
function actorBlocked(x, z, y, radius = PLAYER_R) {
  const bot = y + 0.25;
  const top = y + 2.6;
  for (const c of colliders) {
    if (!c.enabled || c.tag === 'window-traversal') continue;
    if (top <= c.y0 || bot >= c.y1) continue;
    if (x > c.x0 - radius && x < c.x1 + radius && z > c.z0 - radius && z < c.z1 + radius) return true;
  }
  return false;
}

// Point test used by the camera, which is a point and not a sasquatch.
function pointBlocked(x, y, z, r = 0.3) {
  for (const c of colliders) {
    if (!c.enabled || c.tag === 'bed' || c.tag === 'table' || c.tag === 'bounds') continue;
    if (y < c.y0 || y > c.y1) continue;
    if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
  }
  return false;
}

/**
 * IS THERE A MOTEL BETWEEN THESE TWO POINTS?
 *
 * Owner: "Also you start getting shot thro walls I think as well." He was.
 *
 * This used to march ten points down the segment and ask whether any of them
 * had landed inside a blocker. Motel walls are 0.3 m thick and a shot from
 * the lot into room twelve is twelve to thirty metres long, which put the
 * samples 1.2-3 m apart, so the front of the building routinely fell between
 * two of them and `damagePlayer` ran anyway -- measured on the built level,
 * from 22 of 144 sampled firing positions in the lot. Raising the sample count
 * would only have made the player walk further back before finding the same
 * hole. The whole march is gone; `level.js` now answers this with the
 * shared slab test in `src/core/combat/spatial.js`, against the real box, at
 * any thickness and any range. The long version of why -- including the two
 * furniture tags that still do not block, and the measurement behind that --
 * is the comment over `motelSegmentBlocked` in `src/motel/level.js`.
 *
 * The signature and the return value are deliberately unchanged. Callers pass
 * (x, z, y) triples in that order and compare the result against 0.95, reading
 * a contact in the last five percent of the line as the target itself rather
 * than cover in front of it -- which is what lets an interaction prompt sit on
 * the door it belongs to. 1 means nothing is in the way.
 */
function segmentBlocked(x0, z0, y0, x1, z1, y1) {
  return level.segmentBlocked({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 });
}

const actorCtx = {
  player: pos,
  floorAt: (x, z, y) => level.floorAt(x, z, y),
  blocked: (x, z, y, r) => actorBlocked(x, z, y, r),
  onMeleeAttack: (a) => enemyMelee(a),
  onRangedAttack: (a) => enemyShoot(a),
  onGrabAttempt: (a) => startGrapple(a),
  onReachedTarget: (a) => actorReachedTarget(a),
  onStuck: (a) => actorStuck(a),
  onAllyAttack: (a, foe) => allyAttack(a, foe),
  nearestHostile: (x, z, r) => nearestHostile(x, z, r),
  onStep: (a, { running = false } = {}) => sfx.step(
    surfaceAtFoot(a.position.x, a.position.z, a.position.y),
    { sourceId: `actor:${a.id}`, position: a.position, running },
  ),
};

// ---------- HUD helpers ----------
let toastId = 0;
function toast(text, cls = '', sub = '') {
  const el = document.createElement('div');
  el.className = `toast card ${cls}`;
  el.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
  toastsEl.appendChild(el);
  const id = ++toastId;
  el.dataset.id = String(id);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 4200);
  while (toastsEl.children.length > 4) toastsEl.firstChild.remove();
}

/**
 * A line of dialogue: subtitle always, recorded voice when there is one.
 *
 * `cue` names the recording — `<speaker>.<beat>`, which the audio layer looks
 * for as `vo.motel.<cue>.<take>.mp3`. When a take plays, the subtitle holds
 * for its real duration instead of the authored guess, so the words on screen
 * and the words in the room end together. With nothing recorded the scene
 * behaves exactly as it always has.
 */
const authoredMotelVoice = motelVoiceCueSet();

/** Every line this scene has put on screen, oldest first. See `begin` below. */
const spokenLog = [];
/** Dead speakers lose current, queued, ambient, and future dialogue authority. */
const silencedSpeakers = new Set();
let currentSpeechSpeaker = null;

function say(who, line, seconds = 3.4, cue = null) {
  if (phase === 'end' || silencedSpeakers.has(who)) return 0;
  const cls = who === 'Prospect' ? 'who prospect' : who === '*' ? 'stage' : 'who';
  const show = () => {
  subtitleEl.innerHTML = who === '*'
    ? `<span class="stage">${line}</span>`
    : `<span class="${cls}">${who}</span> — ${line}`;
  subtitleEl.classList.add('show');
  };
  /* Exact words, not an optional call-site argument, own the recording. That
   * makes it impossible for a character subtitle to silently bypass VO. */
  const requestedCue = who === '*' ? null : motelVoiceCue(who, line);
  if (requestedCue && !authoredMotelVoice.has(requestedCue)) {
    console.error(`Uncatalogued Motel voice line: ${who}: ${line}`);
  }
  const prepared = requestedCue ? prepareMotelVoice(requestedCue) : { duration: 0, play: () => 0 };
  const hold = resolveLineHold(seconds, prepared.duration);
  const slot = speechFloor.reserve(hold);
  const begin = () => {
    /* `say()` reserves before it speaks. A Rico line can therefore be waiting
     * in a timer when the shot that kills him lands. Death wins that race. */
    if (silencedSpeakers.has(who)) return;
    currentSpeechSpeaker = who;
    show();
    /* WHAT WAS ACTUALLY SAID, in order, as it reaches the screen.
     *
     * The speech floor QUEUES lines: `say()` returns the moment it has
     * reserved a slot, and the words appear whenever the floor gets round to
     * them. So reading `#subtitle` to find out whether a particular line was
     * spoken is a race with every other speaker in the room, and a browser
     * check that lost it read Snow's ambient line where the Prospect's
     * trigger refusal should have been -- and reported the refusal broken
     * when the refusal had worked perfectly. This is the record to assert
     * against instead. Bounded, because the drive alone is chatty. */
    spokenLog.push({ who, line });
    if (spokenLog.length > 200) spokenLog.shift();
    subtitleT = slot.holdSeconds;
    const spoken = prepared.play();
    if (spoken <= 0) sfx.blip();
    const actor = actors.find((candidate) => candidate.name === who);
    /* And the mouth, on the take rather than on the hold -- the take is the
     * thing making the sound, so it is the thing that decides when the jaw
     * stops (src/core/mouth.js). An uncatalogued or unrecorded line still
     * animates, on the fallback, for the length of its subtitle. */
    if (actor) actor.say(slot.holdSeconds, spoken > 0 ? motelVoiceTap() : null);
  };
  if (slot.delaySeconds > 0) {
    const timer = setTimeout(() => {
      speechTimers.delete(timer);
      if (phase !== 'end' && !silencedSpeakers.has(who)) begin();
    }, slot.delaySeconds * 1000);
    speechTimers.add(timer);
  } else {
    begin();
  }
  void cue; // legacy beat arguments remain accepted while exact cues take over
  return slot.totalSeconds;
}

/**
 * A line that refuses to repeat itself inside a cooldown.
 *
 * The scene's props are authored points, and a player lining one up presses
 * [E] more than once — so any prop whose only response is a sentence needs a
 * refractory period or it becomes a man stuck on a word. `jerkyCase` solved
 * its own instance of this with a one-shot flag; this is the same idea for the
 * lines that are allowed to come round again, just not immediately.
 *
 * @returns {number} the hold in seconds, or 0 if the line was suppressed.
 */
const lastSpokenAt = new Map();
const REPEAT_COOLDOWN_SECONDS = 6;

function sayThrottled(key, who, line, seconds = 3, cooldown = REPEAT_COOLDOWN_SECONDS) {
  const now = performance.now() / 1000;
  const last = lastSpokenAt.get(key);
  if (last !== undefined && now - last < cooldown) return 0;
  lastSpokenAt.set(key, now);
  return say(who, line, seconds);
}

function resetSpeechFloor() {
  lastSpokenAt.clear();
  silencedSpeakers.clear();
  currentSpeechSpeaker = null;
  for (const timer of speechTimers) clearTimeout(timer);
  speechTimers.clear();
  speechFloor.reset();
  subtitleT = 0;
  stopMotelVoice();
}

/** Give the current take ownership of the voice floor before continuing. */
function afterLine(holdSeconds, next, gapSeconds = undefined) {
  return setTimeout(next, nextLineDelayMs(holdSeconds, gapSeconds));
}

/** Play an authored multi-speaker exchange on the Motel's one voice floor. */
function speakAuthoredBeats(beats, priorHold, done, index = 0) {
  const beat = beats?.[index];
  if (!beat) {
    afterLine(priorHold, done);
    return;
  }
  afterLine(priorHold, () => {
    if (phase === 'end') return;
    const hold = say(beat.speaker, beat.line, beat.seconds);
    if (index + 1 < beats.length) {
      speakAuthoredBeats(beats, hold, done, index + 1);
    } else {
      afterLine(hold, done);
    }
  }, dialogueBeatLeadSeconds(beat));
}

/**
 * A character speaks, and only then does the screen say which button.
 *
 * The tone doctrine's rule, and the shape `sayThenInstruct` takes in
 * `src/silvercase/main.js`: putting the instruction up on the same frame as
 * the line reads as the game talking over its own cast, and gives the beat
 * away before the character has finished setting it up.
 */
function sayThenInstruct(who, line, seconds, instruct) {
  const hold = say(who, line, seconds);
  afterLine(hold, () => { if (phase !== 'end') instruct(); });
  return hold;
}

/** Cue id for a spoken line: `snow.brief`, `rico.atdoor`, and so on. */
function cueFor(who, beat) {
  return `${String(who).toLowerCase().replace(/[^a-z0-9]+/g, '')}.${beat}`;
}

function setObjective(id, sub = '') {
  currentObjective = id;
  const o = OBJECTIVES.main.find((m) => m.id === id) || OBJECTIVES.opt.find((m) => m.id === id);
  objTitleEl.textContent = o ? o.text : id;
  objSubEl.textContent = sub;
  sfx.objective();
  renderObjectiveList();
}

function completeObjective(id, silent = false) {
  if (objDone.has(id) || objFailed.has(id)) return;
  objDone.add(id);
  const o = OBJECTIVES.main.find((m) => m.id === id) || OBJECTIVES.opt.find((m) => m.id === id);
  if (!silent && o) toast(`OBJECTIVE COMPLETE`, '', o.text);
  renderObjectiveList();
}

function failObjective(id) {
  if (objDone.has(id) || objFailed.has(id)) return;
  objFailed.add(id);
  renderObjectiveList();
}

function renderObjectiveList() {
  const row = (o) => {
    const cls = objDone.has(o.id) ? 'done' : 'todo';
    const style = objFailed.has(o.id) ? ' style="opacity:.4;text-decoration:line-through"' : '';
    return `<div class="${cls}"${style}>${o.text}</div>`;
  };
  objListEl.innerHTML =
    `<h4>MAIN</h4>${OBJECTIVES.main.map(row).join('')}` +
    `<h4>OPTIONAL</h4>${OBJECTIVES.opt.map(row).join('')}` +
    `<h4>WARNING SIGNS · ${S.cluesFound.size}/${Object.keys(CLUES).length}</h4>` +
    [...S.cluesFound].map((c) => `<div class="done">${CLUES[c]}</div>`).join('');
}

function award(id) {
  if (achieved.has(id)) return;
  achieved.add(id);
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  toast(`🏆 ${a ? a.name : id}`, 'ach', a ? a.desc : '');
  sfx.achievement();
}

function foundClue(id, { silent = false } = {}) {
  if (S.cluesFound.has(id)) return false;
  S.cluesFound.add(id);
  addRead(9);
  if (!silent) toast('WARNING SIGN', 'clue', CLUES[id]);
  renderObjectiveList();
  if (S.cluesFound.size >= Object.keys(CLUES).length) award('inspector');
  return true;
}

/**
 * A warning sign in the lot.
 *
 * Tony says what he is looking at, and the screen writes it down once he has
 * stopped. It used to run the other way — the toast landed first and told the
 * player the thing the character was two frames from saying — which is the
 * same failure as putting a button prompt over a line.
 */
function clueBeat({ id, line, seconds = 4, advantage = null }) {
  const fresh = foundClue(id, { silent: true });
  sayThenInstruct('Prospect', line, seconds, () => {
    if (fresh) toast('WARNING SIGN', 'clue', CLUES[id]);
    if (advantage) toast('ADVANTAGE', 'clue', advantage);
  });
}

function addHeat(n) {
  S.heat = THREE.MathUtils.clamp(S.heat + n, 0, 100);
}
function addRead(n) {
  S.read = THREE.MathUtils.clamp(S.read + n, 0, 100);
}

// ---------- The deal ----------
/* One place decides what room twelve is asking for. Every previous pass fixed
 * an individual line and the confusion came back, because eight different
 * call sites were each setting the objective to their own idea of the next
 * thing. Now they set a flag and this reads the flags. */

/** Which step the transaction is on, derived only from what has happened. */
function dealStepNow() {
  if (S.betrayed || phase !== 'room') return null;
  /* The transaction only ever moves forwards. Once your case is on the table
   * the looking-at-the-meat half of the room is over -- checked, or skipped on
   * purpose and paid for in suspicion -- so it cannot be asked for again. This
   * used to read the flags in order and nothing else, which meant paying with
   * something unchecked sent the objective BACKWARDS to a step the player had
   * deliberately walked past, and then jumped over 'pay' entirely on the way
   * out. A skipped step is failed (see `paidBlind`), never re-demanded. */
  if (!S.moneyOnTable) {
    if (!S.sampleChecked) return 'sample';
    if (!S.packagesCounted) return 'count';
    return 'pay';
  }
  if (!S.moneyOpened) return 'open';
  return 'done';
}

/* Both cases are on the table from the moment Tony walks in, so the board
 * describes a table with two cases on it rather than a room with things
 * scattered around it. `theirs` is the only half that ever moves -- room event
 * 38 takes their case to the far bed, and `renderDealBoard` says so. */
const DEAL_HUD = {
  sample: {
    objective: 'inspect',
    sub: 'Their sample is between the two cases. [E] on it to work it over.',
    have: 'Your case · $40,000, shut, on your edge of the table',
    theirs: 'One strip on the table · their case of eight, open, across from you',
  },
  count: {
    objective: 'count',
    sub: 'Their case is across the table, hinged open. [E] on it to count the eight.',
    have: 'Your case · $40,000, shut, on your edge of the table',
    theirs: 'Sample checked · eight packages uncounted',
  },
  pay: {
    objective: 'payment',
    sub: 'Meat first, money second. Push your case across to him. [E] on it.',
    have: 'Your case · $40,000, still on your side',
    theirs: 'Sample checked · eight counted',
  },
  open: {
    objective: 'payment',
    sub: 'Open your case when you are ready. Nothing you have not checked gets checked after.',
    have: 'Your case · across the table, shut',
    theirs: 'Their case · eight, waiting on your latch',
  },
};

/**
 * Push the HUD to the current step.
 *
 * `announce` is the character line that earns the change; the HUD only moves
 * once that line is finished, never on the same frame as it.
 */
function advanceDeal({ announce = null } = {}) {
  const step = dealStepNow();
  if (!step || step === S.dealStep) { renderDealBoard(); return; }
  const apply = () => {
    if (dealStepNow() !== step) { renderDealBoard(); return; }
    S.dealStep = step;
    const hud = DEAL_HUD[step];
    if (hud) setObjective(hud.objective, hud.sub);
    renderDealBoard();
  };
  if (announce) sayThenInstruct(announce[0], announce[1], announce[2] ?? 3.4, apply);
  else apply();
}

/**
 * The standing readout of the transaction: what is yours, what is theirs, and
 * the order the room does it in. Not an instruction — a statement of the
 * board, so "the sample is on the bed, or do I put my sample on the table?"
 * has an answer on screen at all times.
 */
let dealBoardSignature = '';
function renderDealBoard() {
  if (!dealBoxEl) return;
  const hud = DEAL_HUD[S.dealStep];
  const live = phase === 'room' && !S.betrayed && !!hud;
  const yours = !live ? '' : (S.couponOnly ? 'Your case · one expired coupon' : hud.have);
  const theirs = !live ? '' : (S.reserveMoved ? `${hud.theirs} — moved to the far bed` : hud.theirs);
  const signature = `${live}|${yours}|${theirs}`;
  if (signature === dealBoardSignature) return;
  dealBoardSignature = signature;
  dealBoxEl.classList.toggle('show', live);
  if (!live) return;
  dealYoursEl.textContent = yours;
  dealTheirsEl.textContent = theirs;
  dealOrderEl.textContent = 'Meat first. Money second.';
}

function syncArrivalSeats() {
  const occupants = refs.manCar.occupants;
  if (occupants.object('passengerActor') !== player.group) {
    occupants.attach('passengerActor', player.group, { localYaw: Math.PI / 2 });
  }
  const passenger = occupants.worldPoint('passengerEye');
  pos.set(passenger.x, 0, passenger.z);
  feetY = 0;
  if (snow && S.snowSeated && occupants.object('driverActor') !== snow.group) {
    poseMotelSnowInDriverSeat(snow, refs.manCar);
  }
}

/** Mostly windscreen, with Snow retained as a readable three-quarter profile. */
function frameSnowFromPassenger() {
  camYaw = refs.manCar.passengerArrivalYaw(ARRIVAL_SNOW_BLEND);
  camPitch = 0.04;
}

/**
 * Snow's briefing, once the car has finished handing Tony his gear.
 *
 * `openDialogue` slows time to a third and puts a four-answer wheel on screen,
 * so opening it while the arrival sequence is still speaking would leave the
 * player in slow motion staring at four disabled buttons for the length of
 * three lines. The sequence calls back into here when it is done.
 */
function maybeOpenCarBrief() {
  if (!openingVoiceReady || phase !== 'car' || dialogue || S.dealStarted) return;
  if (!S.armedUpSpoken) return;
  openDialogue('snowBrief');
}

function finishArrival() {
  if (phase !== 'arrival') return;
  refs.manCar.placeArrival(1);
  syncArrivalSeats();
  phase = 'car';
  camera.fov = CAMERA_FOV;
  camera.updateProjectionMatrix();
  S.arrivalComplete = true;
  arrivalCameraMode = 'passenger';
  S.snowSeated = false;
  S.snowExitedCar = true;
  refs.manCar.group.getObjectByName('cockpit.seat.driver').userData.occupant = null;
  refs.manCar.headlights.forEach((light) => { light.intensity = 0; });
  sfx.setEngineSpeed(0);
  sfx.stopEngine();
  sfx.carDoor();

  if (snow) stageMotelActor(snow, 'snow-exterior', {
    arrivalCar: refs.manCar,
    floorAt: level.floorAt,
  });
  camYaw = refs.manCar.forwardYaw();
  camPitch = -0.06;
  setObjective('reach', 'Parked with Snow outside. [Q] to get out anywhere, or [E] on the passenger door.');
  // This is the first playable frame. Start the requested ten-second survey
  // message here, not while Tony is locked into the pull-in composition.
  hudEl.classList.add('control-ready');
  runArrivalInventory();
  maybeOpenCarBrief();
}

/**
 * WHAT TONY IS HOLDING WHEN THE SCENE STARTS, decided by the scene.
 *
 * Owner: the player should never have to fight the inventory system to be
 * carrying what the cutscene expects. So the car does it for him, in the order
 * a man actually does it, and it is over before he can reach a door handle:
 *
 *   1. the .45 comes out of the glovebox and he looks at it,
 *   2. it goes away again -- the whole transaction is played unarmed,
 *   3. his own case goes into both hands,
 *   4. and he walks into room twelve carrying it.
 *
 * The glovebox prompt still exists and still works; this only means a player
 * who never touches it is armed anyway, and a player who does gets the "still
 * six" line rather than a second draw. The holster is not cosmetic: see
 * `dealSealed()` -- nothing can be fired while the deal is still a deal.
 */
function runArrivalInventory() {
  if (S.armedUp) return;
  S.armedUp = true;

  S.weaponChecked = true;
  equipWeapon('revolver');
  sfx.select();
  const drawHold = say('Prospect', 'Compact revolver. Six in the wheel. For emergencies and disrespect.', 3.6);

  afterLine(drawHold, () => {
    if (phase === 'end' || phase === 'menu') return;
    holsterWeapon();
    const awayHold = say('Prospect', 'And away it goes. Nobody sells meat to a man with his hand full.', 3.8);
    afterLine(awayHold, () => {
      if (phase === 'end' || phase === 'menu') return;
      takeOwnCase();
      sayThenInstruct(
        ALLY,
        'Case in both hands. That is the only thing they need to see you holding.',
        4.2,
        () => {
          toast('YOUR CASE IS IN YOUR HANDS', '', "Lou's $40,000, shut · the .45 is put away until it is not");
          S.armedUpSpoken = true;
          maybeOpenCarBrief();
        },
      );
    });
  });
}

/** Put the gun away. It stays away until the room takes that decision back. */
function holsterWeapon() {
  if (S.holstered) return;
  S.holstered = true;
  sfx.select();
  updateGear();
}

/** Tony's own case, under his arm. */
function takeOwnCase() {
  if (S.caseDown) return;
  S.caseHeld = true;
  sfx.caseLatch();
  updateGear();
}

function updateArrival(dt) {
  if (phase !== 'arrival') return;
  arrivalT = Math.min(ARRIVAL_SECONDS, arrivalT + dt);
  const linear = arrivalT / ARRIVAL_SECONDS;
  const eased = linear * linear * (3 - 2 * linear);
  refs.manCar.placeArrival(eased);
  syncArrivalSeats();
  // This non-playable pull-in introduces the driver: Snow faces Tony and his
  // photographed face remains readable beside (not behind) the steering wheel.
  frameSnowFromPassenger();
  sfx.setEngineSpeed(0.35 + Math.sin(linear * Math.PI) * 0.35);
  if (linear >= 1) finishArrival();
}

// ---------- Scene flow ----------
function startScene() {
  const started = motelStory.begin();
  if (!started.ok) {
    const reason = started.reason === 'already_complete'
      ? 'This job is already complete in the current save.'
      : 'Lou has not sent Prospect to the motel yet.';
    $('menuSub').textContent = reason;
    $('startBtn').textContent = 'MISSION UNAVAILABLE';
    $('startBtn').disabled = true;
    return false;
  }
  if (campaign.state.scene.id !== SCENE_IDS.JERKY_MOTEL) {
    campaign.enter(SCENE_IDS.JERKY_MOTEL, { spawn: 'passenger_seat' });
  }
  resetSpeechFloor();
  /* Snow speaks the first line of the scene about a second from here. Naming
   * his cue makes the audio layer fetch that one take before the other 166,
   * which is the whole difference between a recorded opening and a subtitle
   * with nothing behind it. */
  sfx.init({ priorityVoice: [OPENING_CUE] });
  bindAudioVolume(sfx);
  sfx.resume();
  sfx.startAmbience();
  sfx.setMusic('tense');
  $('menu').classList.add('hidden');
  hudEl.classList.remove('control-ready');
  hudEl.classList.add('visible');
  sceneInventory.show();
  phase = 'arrival';
  camera.fov = ARRIVAL_CAMERA_FOV;
  camera.updateProjectionMatrix();
  arrivalCameraMode = 'passenger';
  arrivalT = 0;
  openingVoiceReady = false;
  S.arrivalComplete = false;
  S.snowSeated = true;
  S.snowExitedCar = false;
  refs.manCar.collider.enabled = false;
  refs.manCar.placeArrival(0);
  S.carryingMoney = true;
  /* A retry re-enters this function with the same `S`, so the arrival sequence
   * has to be able to run again: hands empty, gun away, case not yet down. */
  S.armedUp = false;
  S.armedUpSpoken = false;
  S.holstered = false;
  S.caseHeld = false;
  S.caseDown = false;
  S.casePlacementReady = false;
  S.casePlacementConfirmed = false;
  casePlacementMarker.visible = false;
  casePlacementAnim = null;
  evidence.reset();
  for (const marker of Object.values(evidenceMarkers)) marker.visible = false;
  S.weaponRefusals = 0;
  setObjective('reach', 'Pulling into the Flamingo with Snow. Room twelve, tonight.');
  renderObjectiveList();
  updateGear();

  // Tony owns the passenger camera; the shared car supplies its world pose.
  syncArrivalSeats();
  frameSnowFromPassenger();

  // Cast
  /* Everybody is posed at somewhere they have a reason to be looking. The
   * road runs across the top of the lot at z = 34; the motel is at -z. */
  snow = spawnMotelActor('snow-arrival');
  syncArrivalSeats();
  refs.manCar.group.getObjectByName('cockpit.seat.driver').userData.occupant = 'snow';
  refs.manCar.group.getObjectByName('cockpit.seat.passenger').userData.occupant = 'tony';
  frameSnowFromPassenger();
  lookout = spawnMotelActor('lookout'); // watching the road, not the lot
  watcher = spawnMotelActor('watcher'); // over the railing, down at the lot
  clerk = spawnMotelActor('clerk'); // across his own counter at z = -7

  /* One delivery of the briefing, not two. It used to be spoken here and then
   * spoken again by the wheel four seconds later, because `snowBrief`'s prompt
   * is the same sentence — so the scene's very first beat was a man repeating
   * himself over a subtitle that never changed. The wheel owns it now, and it
   * does not open until his take can play. */
  /* Twelve seconds of ceiling. Measured under a software rasteriser, where
   * the index fetch and one decode land at 8.7 s while the first materials are
   * still compiling; on a real GPU it is a fraction of a second. If it does
   * expire the wheel still opens — a late subtitle beats a stuck car. */
  sfx.carStart();
  primeMotelVoice([OPENING_CUE], { timeoutMs: 12000 }).finally(() => {
    openingVoiceReady = true;
    maybeOpenCarBrief();
  });
  clock.getDelta();
  return true;
}

function finishScene(kind) {
  if (phase === 'end') return;
  if (kind === 'home') {
    const haul = S.carryingJerky || S.stashTaken || S.cratesFound;
    if (!motelStory.complete({
      ending: kind,
      cargoRecovered: haul,
      packagesIntact: S.packagesIntact,
      freshness: freshness.value,
      policeHeat: S.policeHeat,
    })) {
      return;
    }
  }
  lastEndingKind = kind;
  phase = 'end';
  refs.manCar.occupants.release('passengerActor');
  refs.manCar.occupants.release('driverActor');
  resetSpeechFloor();
  sfx.setMusic('none');
  sfx.stopAmbience();
  sfx.stopEngine();
  endGrapple();
  closeInspection();
  closeDialogue();
  motelPrompt.hidePrompt();
  subtitleEl.classList.remove('show');
  hudEl.classList.remove('visible');
  document.exitPointerLock?.();
  showEnding(kind);
}

// ---------- Interactables ----------
// Each entry: id, position, label(), enabled(), act().
const interactables = [];
function addInteract(o) {
  interactables.push({ r: 3.2, ...o });
  return o;
}

function ix(id) { return interactables.find((i) => i.id === id); }

/* Phases where Tony is out of the car with his hands free. Several props had
 * no phase test at all, so the whole motel was live while he was still sitting
 * in the passenger seat being briefed -- including the Reserve itself, which
 * skipped the entire deal if it was reached. */
function onFoot() {
  return phase === 'lot' || phase === 'room' || phase === 'fight'
    || phase === 'recover' || phase === 'escape';
}

// -- car phase --
addInteract({
  id: 'talkAlly', x: -10.6, y: 1.6, z: 16.4, r: 4.2,
  requiresAim: true,
  label: () => 'Speak to Snow',
  follow: () => (snow ? { x: snow.position.x, y: snow.position.y + 1.4, z: snow.position.z } : null),
  enabled: () => (phase === 'car' || phase === 'lot') && !dialogue
    && (phase !== 'car' || !S.snowGunOfferSpoken || S.silverbackTaken),
  act: () => {
    if (!S.dealStarted && phase === 'car') openDialogue('snowBrief');
    else {
      /* Throttled: Snow has eight things to say and a player holding [E] at
       * him got all eight, stacked, in under a second. */
      const i = Math.floor(Math.random() * SNOW_BARKS.length);
      sayThrottled('snow.bark', ALLY, SNOW_BARKS[i], 3.4);
    }
  },
});

addInteract({
  id: 'moneyCase', x: -7.6, y: 1.2, z: 15.2, r: 3.4,
  requiresAim: true,
  label: () => (S.couponOnly ? 'Your case: cash out, coupon in' : 'Look inside your case'),
  follow: () => refs.manCar.moneyCasePosition(),
  enabled: () => phase === 'car',
  act: () => {
    if (!S.couponOnly) {
      sayThenInstruct('*', '$40,000. Two real bundles on top, several very confident fakes underneath, one expired steakhouse coupon and a handwritten Sasquatch business card.', 5, () => {
        if (!S.couponOnly) toast('YOUR CASE', '', 'Press [E] again to pull the cash and leave only the coupon');
      });
      addRead(4);
      S.moneyChecked = true;
    } else {
      sayThrottled('coupon.again', 'Prospect', 'The coupon expired in March. So did my patience.', 3);
    }
    if (S.moneyChecked && !S.couponOnly && S.moneyCheckedTwice) {
      S.couponOnly = true;
      completeObjective('coupon');
      award('pricing');
      toast('PROSPECT PRICING', 'ach', 'The case now contains one expired steakhouse coupon');
    }
    S.moneyCheckedTwice = S.moneyChecked;
  },
});

/* The glovebox. Opened once.
 *
 * Owner: "I check revolver and he just keeps saying the voice line over and
 * over." Two causes, both fixed: held [E] repeated at the keyboard's auto-
 * repeat rate (see the keydown handler), and the act itself had no gate at
 * all, so every deliberate press re-delivered the same sentence and
 * re-equipped a gun that was already in his hand. The pickup happens once;
 * going back to it afterwards gets a different, throttled line. */
addInteract({
  id: 'glovebox', x: -6.2, y: 1.1, z: 17.6, r: 3.0,
  requiresAim: true,
  /* The arrival sequence has already opened it, so in practice this is always
   * the second label -- it is kept because the glovebox is still a thing in
   * the car a player will look at, and it should answer him. */
  label: () => (S.weaponChecked ? 'The .45 is checked and put away' : 'Check your weapon'),
  follow: () => refs.manCar.gloveboxPosition(),
  enabled: () => phase === 'car',
  act: () => {
    if (S.weaponChecked) {
      sayThrottled('glovebox.again', 'Prospect', 'Still six. They do not breed in there.', 2.6);
      return;
    }
    S.weaponChecked = true;
    say('Prospect', 'Compact revolver. Six in the wheel. For emergencies and disrespect.', 3.6);
    equipWeapon('revolver');
  },
});

/* Snow's own gun, offered rather than found.
 *
 * The revolver in the glovebox is nobody's: compact, anonymous, the sort of
 * thing you leave in an ice machine. The Commander is the Family's, with the
 * crest on the frame, and Snow does not hand it over casually. It rides
 * concealed — taking it does not change what Tony is holding when the door
 * opens — so the whole transaction can still be played without a gun in the
 * room, and the fast way out stays a choice the player makes with [X]. */
addInteract({
  id: 'silverback', x: -9.2, y: 1.1, z: 17.2, r: 3.0,
  requiresAim: true,
  label: () => (S.silverbackTaken
    ? 'The Commander rides under your coat'
    : 'Snow offers you the Silverback Commander'),
  follow: () => (snow ? { x: snow.position.x, y: snow.position.y + 1.1, z: snow.position.z } : null),
  enabled: () => phase === 'car' || phase === 'lot',
  act: () => {
    if (S.silverbackTaken) {
      sayThrottled('silverback.again', 'Prospect', 'It is under my coat. It stays under my coat.', 3.0);
      return;
    }
    S.silverbackTaken = true;
    addRead(6);
    sfx.select();
    sayThenInstruct(
      SNOW_GUN_HANDOFF.transfer.speaker,
      SNOW_GUN_HANDOFF.transfer.line,
      SNOW_GUN_HANDOFF.transfer.seconds,
      () => {
      toast('SILVERBACK COMMANDER', 'warn', 'Concealed · press X to draw · it is loud and it is ours');
      },
    );
  },
});

addInteract({
  id: 'exitCar', x: -5.6, y: 1.0, z: 16.4, r: 3.2,
  requiresAim: true,
  label: () => 'Open the passenger door and get out',
  follow: () => refs.manCar.passengerDoorPosition(),
  enabled: () => phase === 'car',
  act: () => exitCar(),
});

addInteract({
  id: 'trunk', x: -8, y: 1.0, z: 20.2, r: 3.2,
  label: () => (refs.manCar.trunk.opened ? "Snow's trunk" : "Check the trunk"),
  enabled: () => phase === 'lot' || phase === 'escape',
  act: () => {
    if (!refs.manCar.trunk.opened) {
      refs.manCar.trunk.opened = true;
      const fresh = foundClue('trunk', { silent: true });
      S.hiddenWeaponKnown = true;
      sayThenInstruct(ALLY, 'Crowbar. And the thing we never mention.', 3.6, () => {
        if (fresh) toast('WARNING SIGN', 'clue', CLUES.trunk);
        toast('TRUNK OPEN', '', 'Crowbar and hand cannon available here');
      });
    } else if (S.weapon !== 'handcannon') {
      pickUpWeapon(S.weapon === 'crowbar' ? 'handcannon' : 'crowbar');
    } else {
      pickUpWeapon('crowbar');
    }
  },
});

// -- lot clues --
addInteract({
  id: 'wrapper', x: refs.wrapper.x, y: 0.3, z: refs.wrapper.z, r: 3.0,
  label: () => 'Inspect the discarded wrapper',
  enabled: () => phase === 'lot',
  act: () => {
    clueBeat({
      id: 'wrapper',
      line: 'Reserve wrapper. Chewed open, not cut. Somebody in this motel is eating the inventory.',
    });
  },
});

addInteract({
  id: 'door9', x: -19, y: 1.4, z: -3.4, r: 3.0,
  label: () => 'Listen at room nine',
  enabled: () => phase === 'lot',
  act: () => {
    const fresh = foundClue('arguing', { silent: true });
    sayThenInstruct('*', 'Through the door: "...he brings the case, we take the case, nobody has to..." then nothing.', 4.4, () => {
      if (fresh) toast('WARNING SIGN', 'clue', CLUES.arguing);
    });
  },
});

addInteract({
  id: 'lookout', x: 21.4, y: 1.4, z: -0.6, r: 3.6,
  label: () => 'Size up the smoker by the ice machine',
  enabled: () => phase === 'lot',
  act: () => {
    if (lookout) lookout.state = 'idle';
    clueBeat({
      id: 'lookout',
      line: 'He is watching the road, not the lot. Nobody watches the road unless somebody is coming.',
      seconds: 4.2,
    });
  },
});

addInteract({
  id: 'camera', x: refs.camera.x, y: 2.5, z: refs.camera.z, r: 3.4,
  label: () => 'Check the security camera',
  enabled: () => phase === 'lot',
  act: () => {
    S.tunnelKnown = true;
    clueBeat({
      id: 'camera',
      line: 'Pointed at nothing. Whoever aimed it did not want room twelve on tape.',
      advantage: 'Blind corner mapped — the pool drain route is on your mind now',
    });
  },
});

addInteract({
  id: 'secondcar', x: refs.secondCar.x, y: 1.2, z: refs.secondCar.z + 2.6, r: 3.6,
  label: () => 'Look into the idling car',
  enabled: () => phase === 'lot',
  act: () => {
    clueBeat({
      id: 'secondcar',
      line: 'Running engine. Warm seat. Nobody in it. That is a car waiting to leave in a hurry.',
      seconds: 4.2,
      advantage: 'Snow will come in sooner when it goes bad',
    });
  },
});

addInteract({
  id: 'cart', x: refs.laundryCart.x, y: 1.2, z: refs.laundryCart.z, r: 3.0,
  label: () => 'Search the laundry cart',
  enabled: () => phase === 'lot',
  act: () => {
    clueBeat({ id: 'towel', line: 'That is not sauce.', seconds: 3 });
  },
});

addInteract({
  id: 'packets', x: refs.packets.x, y: 0.3, z: refs.packets.z, r: 3.0,
  label: () => 'Examine the empty packets',
  enabled: () => phase === 'lot',
  act: () => {
    inspection.evidence -= 0.1;
    clueBeat({
      id: 'packets',
      line: 'Vacuum packets. Opened out here, refilled out here. Somebody repacked the shipment in a parking lot.',
      seconds: 4.4,
      advantage: 'You know what a repack looks like — the scan will read clearer',
    });
  },
});

addInteract({
  id: 'railing', x: 6, y: 4.2, z: -0.4, r: 6.5,
  label: () => 'Watch the upstairs railing',
  enabled: () => phase === 'lot',
  act: () => {
    S.positionsMarked = 6;
    clueBeat({
      id: 'railing',
      line: 'Second floor. He looked away a half second late. That is a man with a job.',
      advantage: 'Enemy positions will be marked when the room turns',
    });
  },
});

addInteract({
  id: 'bathwindowOutside', x: 3.3, y: 1.9, z: -17.4, r: 4.0,
  label: () => "Study room twelve's bathroom window",
  enabled: () => phase === 'lot' || phase === 'escape',
  act: () => {
    sfx.windowSlide();
    S.slicerKnown = true;
    S.reactionBonus = true;
    completeObjective('thirdman');
    clueBeat({
      id: 'bathwindow',
      line: 'The bathroom window opened an inch. Somebody in there wanted air, or a look at the lot.',
      seconds: 4.4,
      advantage: 'You know about the third man before he knows about you',
    });
  },
});

// -- knocking --
/* The gate is the phase and nothing else. It used to also read `!dialogue`,
 * which meant an unanswered wheel — one a player is expressly allowed to walk
 * away from — silently removed the only door in the scene. */
addInteract({
  id: 'knock', x: -0.8, y: 1.4, z: -3.6, r: 3.4,
  label: () => (S.knocked ? 'Room twelve' : 'Knock on room twelve'),
  enabled: () => phase === 'lot',
  act: () => knockOnTwelve(),
});

/* And the way back out of it.
 *
 * The door shuts behind you and its blocker comes back on, which is right —
 * "Door stays shut. Air conditioning." — but once the room has turned, that
 * left exactly two exits, both of them undocumented: punch the door off its
 * hinges, or be thrown through it. A handle is a handle. */
addInteract({
  id: 'openFrontDoor', x: 0, y: 1.3, z: -5.0, r: 3.0,
  label: () => 'Open the door and get out',
  enabled: () => (phase === 'fight' || phase === 'recover' || phase === 'escape')
    && insideRoom() && !refs.frontDoor.open && !S.doorBroken,
  act: () => {
    openDoor(refs.frontDoor);
    sfx.doorOpen();
    toast('DOOR OPEN', '', 'The lot is on the other side of it');
  },
});

// -- inside the room --
/* THE THREE THINGS ON THE TABLE, and one rule for all of them.
 *
 * Their sample sits between the two cases; their case is hinged open on
 * Rico's side; yours is shut on yours. Each has its own point on the table
 * rather than three prompts stacked on the same coordinate, and each carries
 * the deal step it belongs to so the room offers what it is asking for. */
const stepPriority = (...steps) => () => (steps.includes(dealStepNow()) ? 0.7 : 0);

addInteract({
  id: 'placeOwnCase', x: MOTEL_YOUR_CASE.x, y: 1.0, z: MOTEL_YOUR_CASE.z, r: 3.8,
  priority: () => (S.casePlacementReady ? 2 : 0),
  label: () => "Place Lou's case on the highlighted table spot",
  enabled: () => phase === 'room' && S.casePlacementReady && !S.caseDown,
  act: () => confirmOwnCasePlacement(),
});

addInteract({
  id: 'sample', x: 1.4, y: 1.0, z: -6.4, r: 3.4,
  priority: stepPriority('sample'),
  label: () => (inspecting ? 'Step back from their sample' : 'Inspect their sample'),
  enabled: () => (phase === 'room') && S.sampleOut,
  act: () => (inspecting ? closeInspection() : openInspection()),
});

addInteract({
  id: 'chair', x: 3.0, y: 0.8, z: -6.4, r: 2.6,
  label: () => (S.sat ? 'Stand up' : 'Sit at the table (optional)'),
  /* Optional flavour only after the required placement and inspection. Before
   * that it sat inside the same interaction cluster and stole [E] from the
   * mission-critical table spot. */
  enabled: () => phase === 'room' && S.casePlacementConfirmed && S.sampleChecked,
  act: () => {
    S.sat = !S.sat;
    if (S.sat) {
      pos.set(3.0, 0, -5.6);
      addHeat(-6);
      sayThenInstruct('Rico', 'See? Civilised.', 2.4, () => {
        if (S.sat) toast('SEATED', '', 'Inspection is easier — but this is a bad place to be when it turns');
      });
    } else {
      say('Prospect', 'I inspect standing.', 2.2);
    }
  },
});

/* THEIR case of eight. Counting it is a step of the deal, and it happens once.
 *
 * This is the "i keep repeating 8 packages line" bug: the count had no gate at
 * all, so every [E] at the case fired the same sentence again — and stacked
 * another six suspicion and eight read on top each time. It sits next to the
 * table, so a player pressing [E] while lining up the sample hit it repeatedly
 * without ever meaning to. */
addInteract({
  id: 'jerkyCase', x: refs.jerkyCase.x, y: 1.2, z: refs.jerkyCase.z, r: 3.2,
  priority: stepPriority('count'),
  label: () => {
    if (S.carryingJerky) return 'You have the Reserve';
    if (phase === 'room') {
      if (S.packagesCounted) return 'Their case · eight, counted';
      return S.reserveMoved
        ? 'Count their case of eight (they moved it to the far bed)'
        : 'Count their case of eight, across the table';
    }
    return 'Take the Reserve';
  },
  enabled: () => onFoot() && phase !== 'lot'
    && (phase !== 'room' || S.sampleOut)
    && !S.carryingJerky && !S.caseInPool && !S.caseBurned && refs.jerkyCase.group.visible,
  act: () => {
    if (phase !== 'room') { takeJerkyCase(); return; }
    if (S.packagesCounted) {
      /* Counted already. He says something else, once, instead of saying the
       * same sentence for the fifth time. */
      say('Prospect', 'Eight in their case. One on the table. Neither of them is mine yet.', 3.6);
      return;
    }
    S.packagesCounted = true;
    addHeat(6);
    addRead(8);
    const countHold = say('Prospect', `Eight packages. Numbered labels. ${shipment.grade === 'genuine' ? 'Seals all intact.' : 'Two of these seals have been opened and re-pressed.'}`, 4.6);
    if (shipment.grade !== 'genuine') inspection.evidence -= 0.15;
    if (chino) chino.say(1.6);
    completeObjective('count');
    afterLine(countHold, () => {
      if (phase !== 'room' || S.betrayed) return;
      say('Chino', 'You buying or writing a cookbook?', 3);
      advanceDeal({ announce: ['Rico', 'Now the other half. On the table, where I can see it.', 3.8] });
    });
  },
});

/* YOUR case. Placing it and opening it are two separate decisions, and the
 * second one is the one that ends the negotiation — so it is said out loud
 * before it can be taken by accident. */
addInteract({
  id: 'placeMoney', x: MOTEL_YOUR_CASE.x, y: 1.0, z: MOTEL_YOUR_CASE.z, r: 3.4,
  priority: stepPriority('pay', 'open'),
  label: () => {
    /* The case is already on the table -- he carried it in and set it down.
     * What is left is pushing it ACROSS, which is the payment, and opening it,
     * which ends the negotiation. Two decisions, two labels, neither of them
     * pretending the object is somewhere it is not. */
    if (S.moneyOnTable) return 'Open your case';
    if (!S.sampleChecked) return 'Push your case across (he wants the meat looked at first)';
    if (!S.packagesCounted) return 'Push your case across (their eight are still uncounted)';
    return 'Push your case across the table';
  },
  enabled: () => phase === 'room' && S.caseDown && S.sampleOut
    && (S.carryingMoney || S.moneyOnTable) && !S.moneyOpened,
  act: () => {
    if (!S.moneyOnTable) {
      /* Meat first, money second — Snow says it in the car and Rico enforces
       * it here. He pushes the money back exactly once, which teaches the rule
       * without taking the decision away: press again and he takes it, and
       * paying for something nobody looked at costs suspicion and a comment. */
      if (!S.sampleChecked && !S.payRefused) {
        S.payRefused = true;
        sayThenInstruct('Rico', 'Meat first. Money second. That is how this works.', 3.6, () => {
          if (phase !== 'room' || S.betrayed) return;
          advanceDeal();
          toast('HE PUSHED IT BACK', '', 'Check their sample first — press [E] again to pay blind anyway');
        });
        return;
      }
      /* And the second half of the same rule. The sample gate was the only one
       * here, so a player could look at the meat, walk past their case of
       * eight, and pay -- which put the money down with the count still owed
       * and sent the objective back to "count their case" with cash already on
       * the table. Rico asks for the count in his own voice, once, on the same
       * terms as the line above: press again and he takes the money anyway. */
      /* "Satisfied?" presupposes he looked, so this is the man who checked the
       * sample and then tried to skip the count. Somebody blowing past both
       * has already had Rico's one push-back above and does not get a second
       * lecture for the same walk to the table. */
      if (S.sampleChecked && !S.packagesCounted && !S.countRefused) {
        S.countRefused = true;
        sayThenInstruct('Rico', 'Satisfied? The case is right there. Eight of them. Count it.', 3.6, () => {
          if (phase !== 'room' || S.betrayed) return;
          advanceDeal();
          toast('HE PUSHED IT BACK', '', 'Count their eight first — press [E] again to pay uncounted anyway');
        });
        return;
      }
      S.moneyOnTable = true;
      S.carryingMoney = false;
      /* Across the table it goes, into the middle, where it is Rico's to look
       * at. The prompt travels with the object. */
      placeMoneyCase(MOTEL_YOUR_CASE_PAID);
      const paid = ix('placeMoney');
      paid.x = MOTEL_YOUR_CASE_PAID.x;
      paid.z = MOTEL_YOUR_CASE_PAID.z;
      sfx.caseLatch();
      addHeat(4);
      if (!S.sampleChecked) {
        S.paidBlind = true;
        addHeat(10);
        failObjective('inspect');
        say('Chino', 'He is buying it blind. Rico. He is buying it blind.', 3.4);
      }
      /* A step he chose to skip is struck off, not left standing as a live
       * instruction behind money that is already down. */
      if (!S.packagesCounted) {
        addHeat(6);
        failObjective('count');
      }
      updateGear();
      advanceDeal({ announce: ['Rico', 'There it is. Now we are all friends with a table between us.', 3.6] });
      afterLine(4.6, () => {
        if (phase !== 'room' || S.moneyOpened || S.betrayed) return;
        toast('THE LATCH IS YOURS', 'warn', 'Opening it ends the negotiation — anything unchecked, you are buying');
      });
    } else {
      S.moneyOpened = true;
      /* The latch. The lid comes up on the model as well as in the sentence --
       * this is the last thing anybody in room twelve does before it turns. */
      if (carriedCases.money) {
        const lid = carriedCases.money.children.find((child) => child.isGroup);
        if (lid) lid.rotation.x = -2.0;
      }
      completeObjective('payment');
      say('*', 'The lamp catches the silver foil. For one second the case looks holy.', 4);
      addHeat(24);
      advanceDeal();
      maybeBetray('money');
    }
  },
});

addInteract({
  id: 'bathDoorCheck', x: 3.3, y: 1.2, z: -10.6, r: 3.2,
  label: () => (S.betrayed ? 'Slam the bathroom door' : 'Check the bathroom'),
  enabled: () => phase === 'room' || phase === 'fight' || phase === 'recover',
  act: () => {
    if (!S.betrayed) {
      addHeat(30);
      addRead(14);
      S.slicerKnown = true;
      completeObjective('thirdman');
      const warningHold = say('Prospect', 'There is a man breathing in your bathroom, Rico.', 3.6);
      afterLine(warningHold, () => { if (!S.betrayed) maybeBetray('bathroom'); });
    } else {
      slamBathDoor();
    }
  },
});

addInteract({
  id: 'windowSignal', x: 3.0, y: 1.8, z: -4.2, r: 3.2,
  label: () => (S.windowBroken ? 'Climb through the window' : (S.betrayed ? 'Smash through the window' : 'Signal Snow through the window')),
  enabled: () => phase === 'room' || phase === 'fight' || phase === 'recover',
  act: () => {
    if (!S.betrayed) {
      S.snowSignalled = true;
      completeObjective('signal');
      addHeat(12);
      sayThenInstruct('*', 'Two fingers against the glass. Out in the lot, a car door opens.', 3.6, () => {
        toast('SIGNAL SENT', '', 'Snow is out of the car and moving');
      });
      if (snow) { snow.state = 'goto'; snow.target = { x: -1, z: 1.5 }; snow.afterGoto = 'idle'; }
    } else if (!S.windowBroken) {
      breakWindow();
    } else {
      pos.set(3.0, 0, -2.6);
      feetY = 0;
    }
  },
});

addInteract({
  id: 'kickTable', x: 1.4, y: 0.9, z: -6.4, r: 3.4,
  label: () => 'Kick the table into them',
  enabled: () => (phase === 'fight' || phase === 'recover') && !refs.table.kicked,
  act: () => kickTable(),
});

addInteract({
  id: 'seasoning', x: refs.seasoning.x, y: 1.1, z: refs.seasoning.z, r: 3.2,
  label: () => 'Throw seasoning in his eyes',
  enabled: () => (phase === 'fight' || phase === 'recover') && !refs.seasoning.used,
  act: () => throwSeasoning(),
});

addInteract({
  id: 'lamp', x: refs.lamp.x, y: 1.2, z: refs.lamp.z, r: 3.0,
  label: () => 'Take the bedside lamp',
  enabled: () => !refs.lamp.broken && (phase === 'fight' || phase === 'recover' || phase === 'room'),
  act: () => {
    refs.lamp.broken = true;
    refs.lamp.light.intensity = 0;
    refs.lamp.shade.visible = false;
    pickUpWeapon('lamp');
    sfx.glassSmash();
    say('Prospect', 'Motel lamp. Heavier than it looks.', 2.4);
  },
});

addInteract({
  id: 'tvShove', x: refs.tv.x, y: 1.4, z: refs.tv.z, r: 3.4,
  label: () => 'Shove him into the television',
  enabled: () => (phase === 'fight' || phase === 'recover') && !refs.tv.broken,
  act: () => shoveIntoTV(),
});

addInteract({
  id: 'mattress', x: -3.1, y: 0.9, z: -12.6, r: 3.4,
  label: () => (S.mattressCover ? 'Behind the mattress' : 'Overturn the mattress for cover'),
  enabled: () => (phase === 'fight' || phase === 'recover') && !S.mattressCover,
  act: () => {
    S.mattressCover = true;
    const bed = refs.beds[0];
    bed.mattress.rotation.z = 1.35;
    // Mattress coordinates are local to the bed group at (-3.1, 0, -12.6).
    bed.mattress.position.set(1.2, 1.1, 0);
    toast('COVER UP', '', 'Ranged damage is halved while you are behind the mattress');
    sfx.punch(false);
  },
});

addInteract({
  id: 'curtain', x: 4.0, y: 1.2, z: -12.9, r: 3.2,
  label: () => 'Pull down the shower curtain',
  enabled: () => (phase === 'fight' || phase === 'recover') && !refs.curtain.pulled,
  act: () => {
    refs.curtain.pulled = true;
    refs.curtain.mesh.rotation.z = 1.2;
    refs.curtain.mesh.position.set(3.6, 0.4, -13.4);
    const foe = nearestHostile(pos.x, pos.z, 5.5);
    if (foe) {
      foe.stunT = 2.6;
      say('Prospect', 'Wear it.', 2);
      toast('TANGLED', '', `${foe.name} is wrapped in motel plastic`);
    }
    sfx.packaging();
  },
});

addInteract({
  id: 'cord', x: refs.sealer.x, y: 0.4, z: -13.6, r: 3.2,
  label: () => 'Rig the sealer cord across the floor',
  enabled: () => (phase === 'fight' || phase === 'recover') && !S.cordArmed,
  act: () => {
    S.cordArmed = true;
    toast('TRIP HAZARD', '', 'Anyone crossing the room goes down');
    sfx.packaging();
  },
});

addInteract({
  id: 'fanSwitch', x: -4.6, y: 1.4, z: -5.2, r: 3.0,
  label: () => 'Knock the ceiling fan switch',
  enabled: () => (phase === 'fight' || phase === 'recover') && !S.fanSparked,
  act: () => {
    S.fanSparked = true;
    refs.fan.speed = 14;
    S.roomLightsOut = true;
    refs.roomLight.intensity = 0.25;
    refs.lamp.light.intensity = Math.min(refs.lamp.light.intensity, 0.6);
    effects.explosion(new THREE.Vector3(0, 3.1, -10.4));
    sfx.sparks();
    shake = Math.max(shake, 0.5);
    toast('SPARKS', 'warn', 'The fan is throwing sparks — there is fire in this room now');
    say('*', 'The fan screams up to speed and starts spitting sparks over the beds.', 4);
  },
});

addInteract({
  id: 'burnCase', x: refs.jerkyCase.x, y: 1.2, z: refs.jerkyCase.z, r: 3.4,
  label: () => 'Hold the Reserve into the sparks',
  enabled: () => S.fanSparked && S.carryingJerky && !S.caseBurned && insideRoom(),
  act: () => burnShipment(),
});

addInteract({
  id: 'stash', x: -3.1, y: 0.4, z: -12.6, r: 3.0,
  label: () => 'Look under the far bed',
  enabled: () => !S.stashFound && (phase === 'room' || phase === 'fight' || phase === 'recover'),
  act: () => {
    S.stashFound = true;
    refs.stash.group.visible = true;
    completeObjective('stash');
    sayThenInstruct('Prospect', 'Premium stash. Black wrap, wax seal, real numbers. He was never going to sell me this.', 4.6, () => {
      toast('HIDDEN STASH', 'clue', "Rico's real product — take it on your way out");
    });
  },
});

addInteract({
  id: 'takeStash', x: refs.stash.x, y: 0.4, z: refs.stash.z, r: 3.0,
  label: () => "Take Rico's premium evidence case",
  enabled: () => S.stashFound && !S.stashTaken && (phase === 'fight' || phase === 'recover' || phase === 'escape'),
  act: () => {
    freshness.value = Math.min(100, freshness.value + 15);
    collectEvidenceCase('premium', { title: 'PREMIUM CASE SECURED' });
    sfx.packaging();
  },
});

addInteract({
  id: 'recoverMoneyCase', x: MOTEL_YOUR_CASE.x, y: 0.8, z: MOTEL_YOUR_CASE.z, r: 3.4,
  label: () => "Recover Lou's money evidence case",
  enabled: () => S.betrayed && !evidence.has('money') && !S.moneyTakenByRico
    && (phase === 'fight' || phase === 'recover' || phase === 'escape')
    && carriedCases.money?.visible !== false,
  act: () => {
    collectEvidenceCase('money', { title: 'MONEY CASE SECURED' });
    sfx.caseLatch();
  },
});

// -- room eleven / alley --
addInteract({
  id: 'door11', x: -12, y: 1.4, z: -3.6, r: 3.2,
  label: () => (refs.door11.locked ? 'Kick in room eleven' : 'Room eleven'),
  enabled: () => phase === 'escape' || phase === 'recover' || phase === 'fight',
  act: () => {
    if (refs.door11.locked) {
      refs.door11.locked = false;
      openDoor(refs.door11);
      sfx.doorSlam();
      shake = Math.max(shake, 0.4);
      say('*', 'The door of room eleven gives up immediately.', 3);
    }
  },
});

addInteract({
  id: 'crates', x: refs.crates.x, y: 1.0, z: refs.crates.z, r: 3.4,
  label: () => 'Search the shipment crates',
  enabled: () => onFoot() && !S.cratesFound,
  act: () => {
    S.cratesFound = true;
    S.stashFound = true;
    completeObjective('stash');
    freshness.value = Math.min(100, freshness.value + 10);
    sayThenInstruct('Prospect', 'Room eleven. The real cure, stacked to the ceiling. They were selling me the wrapping.', 4.6, () => {
      toast('THE REAL PRODUCT', 'ach', 'Rico kept the honest meat one door away');
    });
  },
});

// -- office --
addInteract({
  id: 'monitor', x: refs.monitor.x, y: 1.6, z: refs.monitor.z, r: 3.2,
  label: () => 'Read the security monitor',
  enabled: () => onFoot() && !refs.monitor.used,
  act: () => {
    refs.monitor.used = true;
    S.positionsMarked = 10;
    markEnemies(10);
    sayThenInstruct('Prospect', 'Four of them in the lot. Two by the stairs, one at the pool, one at my car.', 4.4, () => {
      toast('POSITIONS MARKED', 'clue', 'You can see where they are for ten seconds');
    });
  },
});

addInteract({
  id: 'register', x: refs.register.x, y: 1.5, z: refs.register.z, r: 3.0,
  label: () => 'Rob the register (optional)',
  enabled: () => onFoot() && !refs.register.robbed,
  act: () => {
    refs.register.robbed = true;
    S.policeHeat += 18;
    toast('REGISTER EMPTIED', 'warn', '$310 and one more reason for the police to care');
    sfx.lockClick();
    if (clerk) { clerk.state = 'panic'; }
  },
});

addInteract({
  id: 'officeRear', x: -44, y: 1.2, z: -13.6, r: 3.2,
  label: () => (refs.officeRearDoor.locked ? 'Force the emergency exit' : 'Emergency exit'),
  enabled: () => onFoot(),
  act: () => {
    if (refs.officeRearDoor.locked) {
      refs.officeRearDoor.locked = false;
      openDoor(refs.officeRearDoor);
      sfx.doorSlam();
      toast('REAR EXIT OPEN', '', 'The alley behind the office is yours');
    }
  },
});

// -- pool --
addInteract({
  id: 'poolTunnel', x: refs.poolTunnel.x, y: -2.4, z: refs.poolTunnel.z, r: 3.4,
  label: () => 'Crawl into the drainage tunnel',
  enabled: () => onFoot(),
  act: () => {
    pos.set(refs.poolTunnel.exit.x, 0, refs.poolTunnel.exit.z);
    feetY = 0;
    vy = 0;
    S.escapeRoute = 'pool';
    say('*', 'Wet concrete, a dead frog, and then the alley behind the office.', 3.6);
    sfx.tunnel();
  },
});

addInteract({
  id: 'poolCase', x: 22, y: -2.6, z: 13, r: 4.5,
  label: () => 'Recover the Reserve from the pool floor',
  enabled: () => S.caseInPool && !S.carryingJerky,
  act: () => {
    S.caseInPool = false;
    freshness.damage(10, 'thrown into an empty swimming pool');
    takeJerkyCase();
  },
});

// -- evidence --
const EVIDENCE_SPOTS = [
  { id: 'evIce', x: refs.iceMachine.x, z: refs.iceMachine.z, label: 'Hide the weapon in the ice machine', key: 'ice' },
  { id: 'evVend', x: refs.vending.x, z: refs.vending.z, label: 'Drop it in the vending compartment', key: 'vending' },
  { id: 'evPool', x: 22, z: 13, label: 'Throw the weapon into the pool', key: 'pool' },
];
for (const spot of EVIDENCE_SPOTS) {
  addInteract({
    id: spot.id, x: spot.x, y: 1.2, z: spot.z, r: 3.4,
    label: () => spot.label,
    enabled: () => S.weapon !== 'fists' && !S.evidenceChoice && (phase === 'escape' || phase === 'recover'),
    act: () => disposeWeapon(spot.key),
  });
}

addInteract({
  id: 'plantRico', x: 0, y: 1, z: 0, r: 3.4,
  label: () => 'Plant the weapon on Rico',
  enabled: () => S.weapon !== 'fists' && !S.evidenceChoice && rico && !rico.alive && !rico.escaped,
  act: () => disposeWeapon('rico'),
  follow: () => (rico ? { x: rico.position.x, z: rico.position.z } : null),
});

// -- the upper walkway --
addInteract({
  id: 'looseRail', x: 2, y: 4.6, z: -1.1, r: 4.0,
  label: () => 'Go over the loose railing',
  enabled: () => feetY > 3.2 && refs.looseRail && !refs.looseRail.broken,
  act: () => {
    const rail = refs.looseRail;
    rail.broken = true;
    rail.collider.enabled = false;
    scene.remove(rail.group);
    debris.explodeGroup(rail.group, new THREE.Vector3(pos.x, 4.4, -1.1));
    sfx.woodBreak();
    shake = Math.max(shake, 0.6);
    // Anyone underneath wears a sasquatch and a railing
    const foe = nearestHostile(pos.x, 0, 4.5);
    if (foe && foe.position.y < 2) {
      const down = foe.damage(45, false, pos.x, pos.z);
      foe.stunT = 2.2;
      if (down) onActorDown(foe, false);
      toast('DOWN THE HARD WAY', '', `${foe.name} broke your fall`);
    }
    pos.z = 1.5;
    feetY = 3.8;
    vy = 0;
    S.escapeRoute = 'balcony';
    say('Prospect', 'The railing was rusted. That is on the motel.', 3);
  },
});

for (const ac of refs.acUnits) {
  addInteract({
    id: `ac${Math.round(ac.x)}`, x: ac.x, y: 4.6, z: ac.z + 0.6, r: 3.2,
    label: () => 'Shove the air conditioner off the balcony',
    enabled: () => feetY > 3.2 && !ac.dropped,
    act: () => {
      ac.dropped = true;
      scene.remove(ac.mesh);
      effects.explosion(new THREE.Vector3(ac.x, 0.6, -2.6));
      sfx.crash();
      shake = Math.max(shake, 0.5);
      const foe = nearestHostile(ac.x, -2.6, 3.6);
      if (foe && foe.position.y < 2) {
        const down = foe.damage(60, false, ac.x, ac.z);
        if (down) onActorDown(foe, false);
        toast('ROOM SERVICE', '', `An air conditioner found ${foe.name}`);
      } else {
        say('*', 'The unit explodes on the concrete. Everybody in the lot looks up.', 3.4);
      }
      for (const a of actors) if (a.hostile && Math.hypot(a.position.x - ac.x, a.position.z + 2.6) < 8) a.stunT = 0.9;
    },
  });
}

addInteract({
  id: 'neon', x: refs.neon.group.position.x, y: 2, z: refs.neon.group.position.z, r: 4.0,
  label: () => 'Kick the motel sign off its wiring',
  enabled: () => onFoot() && !S.neonKilled,
  act: () => {
    S.neonKilled = true;
    refs.neon.glow.intensity = 0;
    refs.neon.text.material.emissiveIntensity = 0;
    sfx.neonShort();
    effects.explosion(new THREE.Vector3(refs.neon.group.position.x, 11, refs.neon.group.position.z));
    shake = Math.max(shake, 0.5);
    toast('LIGHTS OUT', 'clue', 'The lot goes dark — nobody out here can aim for a while');
    for (const a of actors) if (a.hostile) a.blindT = 5;
    say('*', 'FLAMINGO MOTEL goes dark with a bang. The parking lot loses its colour.', 4);
  },
});

// -- the clerk --
addInteract({
  id: 'clerk', x: -44, y: 1.4, z: -6.2, r: 3.6,
  label: () => 'Tell the clerk to look at the wall',
  enabled: () => onFoot() && clerk && clerk.alive && !S.clerkCowed,
  follow: () => (clerk ? { x: clerk.position.x, z: clerk.position.z } : null),
  act: () => {
    S.clerkCowed = true;
    clerk.state = 'panic';
    sayThenInstruct('Prospect', 'You saw a raccoon. A big one. In a shirt.', 3.2, () => {
      toast('CLERK HANDLED', '', 'No alarm from the office tonight');
    });
  },
});

// -- getaway --
addInteract({
  id: 'getaway', x: -6.6, y: 1.2, z: 17.0, r: 4.2,
  label: () => {
    const status = evidenceStatus();
    return status.complete ? 'Get in the car' : `Check the car · ${evidenceCounter(status)}`;
  },
  enabled: () => phase === 'escape' || phase === 'recover',
  act: () => boardGetaway(),
});

// ---------- Phase transitions ----------
function exitCar() {
  if (phase !== 'car') return;
  phase = 'lot';
  /* Getting out IS an answer. The wheel is deliberately not modal, so a player
   * could step out mid-briefing and leave `dialogue` set forever — and the
   * knock's gate reads `!dialogue`, so room twelve stopped answering the door
   * and the scene had no way to say why. Measured: knock disabled, Rico never
   * spawned, no prompt, no explanation. */
  closeDialogue();
  const outside = refs.manCar.passengerExitPosition();
  refs.manCar.occupants.release('passengerActor');
  feetY = level.floorAt(outside.x, outside.z, 0);
  pos.set(outside.x, 0, outside.z);
  refs.manCar.collider.enabled = true;
  refs.manCar.group.getObjectByName('cockpit.seat.passenger').userData.occupant = null;
  player.group.scale.setScalar(PLAYER_SCALE);
  player.legL.rotation.x = 0;
  player.legR.rotation.x = 0;
  player.armL.rotation.x = 0;
  player.armR.rotation.x = 0;
  player.head.rotation.set(0, 0, 0);
  sfx.carDoor();
  playerFootstepReadyAt = performance.now() + 360;
  /* He says he is facing the exit, so he faces the exit. The road is +z. */
  if (snow) snow.faceAt(snow.group.position.x, ROAD_Z);
  sayThenInstruct(ALLY, 'Right here. Facing the exit.', 3.2, () => {
    if (phase !== 'lot') return;
    setObjective('reach', 'Knock on room twelve. Look the lot over first — every warning sign pays inside.');
  });
  updateGear();
}

/** Rico answering the door. Idempotent, so the timer and the door can race. */
function openTheDoor() {
  if (rico) return rico;
  sfx.doorOpen();
  /* The DOOR opens here, on the knock — not four lines later when the
   * doorstep conversation has been answered. Owner: "Going to the door takes
   * too long they should open the door right after you knock on it." What the
   * answer still buys is the way through: Rico is standing in the opening
   * until he steps aside, and `refs.roomTwelveThreshold` is his body. */
  openDoor(refs.frontDoor);
  S.doorAnsweredAt = performance.now();
  rico = spawnMotelActor('rico-doorway'); // out through his own doorway, at Tony
  rico.say(2);
  return rico;
}

/** Clear the threshold while the door conversation finishes. */
function moveRicoAsideForEntry() {
  if (!rico || phase !== 'door') return;
  /* Actor.goto considers anything within one metre arrived. Aim beyond the
   * jamb so that its actual stopping point clears Rico's body from the door. */
  const aside = { x: 2.35, z: -5.4 };
  rico.anchor = { ...aside };
  rico.target = { ...aside };
  rico.afterGoto = 'deal';
  rico.state = 'goto';
}

/** Make the invitation actionable on the same beat that Rico says it. */
function inviteIntoRoomTwelve() {
  if (phase !== 'door') return;
  setObjective('reach', 'Walk into room twelve. The door is open.');
  toast('DOOR OPEN', '', 'Walk in when you are ready — nobody is pushing you');
  updateInteract();
}

/**
 * How long room twelve takes to answer, in milliseconds.
 *
 * A beat, not a wait: enough for the knock to stop ringing and for Rico to
 * cross his own room, and nothing more. It was 1100 ms, and the door itself
 * did not move until the doorstep wheel had been answered on top of that —
 * minimum four seconds of standing at a shut door, which the owner called
 * out: the door opens right after the knock now.
 */
const KNOCK_ANSWER_MS = 420;

function knockOnTwelve() {
  if (S.knocked) return;
  S.knocked = true;
  closeDialogue();
  phase = 'door';
  sfx.knock();
  S.knockedAt = performance.now();
  setObjective('reach', 'Answer him. 1–4 when the options come up.');
  setTimeout(() => {
    openTheDoor();
    openDialogue('atDoor');
  }, KNOCK_ANSWER_MS);
}

/**
 * The room's answer to the case landing on its table, and then the four beats
 * that were already there. Rico's line is new; everything after it is
 * `ROOM_ENTRY_BEATS` unchanged, so the exchange that earns the inspection
 * controls is the same exchange it has always been.
 */
const CASE_DOWN_BEATS = Object.freeze([
  Object.freeze({
    speaker: 'Rico',
    line: 'Set it down. It is not going to be sitting there long.',
    seconds: 3.6,
    leadSeconds: 0.6,
  }),
  ...ROOM_ENTRY_BEATS,
]);

function enterRoom() {
  /* Three callers — the doorway volume, the room rectangle behind it, and the
   * seatbelt — so this has to be safe to run twice on the same frame. It
   * spawns three actors. */
  if (S.enteredRoom || phase === 'room') return;
  phase = 'room';
  S.enteredRoom = true;
  S.dealStarted = true;
  pos.set(-0.2, 0, -5.4);
  feetY = 0;
  closeDialogue();
  completeObjective('reach');
  setObjective('place', "Wait for the door, then place Lou's case on the highlighted table spot.");
  renderDealBoard();

  /* Everyone takes their positions.
   *
   * Rico is spawned by a timer a second after the knock. On a slow frame that
   * timer can still be pending when the player steps through, and this used to
   * throw on a null `rico` and take the whole scene down with it, so the door
   * opens here too if it has not opened yet. */
  openTheDoor();
  stageMotelActor(rico, 'rico-room');
  chino = spawnMotelActor('chino-room'); // across the table, at the deal
  slicer = spawnMotelActor('slicer-room'); // out of the bathroom doorway at the room

  // The door closes behind you
  const closeBehind = () => {
    /* Re-enabling the blocker while the player stands inside its footprint
     * would wedge them frozen inside the collider, so the slam waits and
     * retries until the doorway band is clear. */
    const c = refs.frontDoor.collider;
    if (c && pos.x > c.x0 - PLAYER_R && pos.x < c.x1 + PLAYER_R
      && pos.z > c.z0 - PLAYER_R && pos.z < c.z1 + PLAYER_R) {
      setTimeout(closeBehind, 250);
      return;
    }
    closeDoor(refs.frontDoor);
    sfx.doorSlam();
    addHeat(6);
    addRead(10);
    sfx.packaging();
    S.casePlacementReady = true;
    casePlacementMarker.visible = true;
    setObjective('place', "Place Lou's case on the highlighted table spot beside their sample.");
    const placementBeat = CASE_DOWN_BEATS[0];
    const placementHold = say(placementBeat.speaker, placementBeat.line, placementBeat.seconds);
    afterLine(placementHold, () => {
      if (phase === 'room' && S.casePlacementReady) {
        toast('MARKED TABLE SPOT', '', "Lou's case goes on the glowing tray · [E]");
      }
    }, dialogueBeatLeadSeconds(placementBeat));
  };
  setTimeout(closeBehind, 1400);
}

// Slow-burn suspicion beats while the deal runs.
const roomEvents = [
  { t: 12, run: () => { sfx.tvStatic(); refs.tv.volume = 0.8; say('*', 'Chino turns the television up. Nobody was watching it.', 3.4); addRead(8); } },
  { t: 22, run: () => { sfx.plumbing(); say('*', 'The bathroom faucet runs, then stops. Nobody flushes.', 3.4); addRead(10); if (S.read > 30) S.slicerKnown = true; } },
  { t: 30, run: () => { sfx.knifeTap(); say('Chino', 'You think rare meat grows on trees?', 3); addHeat(3); } },
  /* Their case goes to the far bed here. It is the single most confusing beat
   * in the scene — the thing the player is meant to count walks out of the
   * middle of the room — so Tony names the object and the place out loud, and
   * the standing readout says the same thing. */
  {
    t: 38,
    run: () => {
      moveCaseAway();
      const movedHold = say('*', 'The suitcase gets moved. Farther from you. Casually.', 3.4);
      afterLine(movedHold, () => {
        if (phase !== 'room' || S.betrayed) return;
        say('Prospect', 'Their case is on the far bed now. That is not where a deal happens.', 3.6);
      });
      addRead(9);
      addHeat(4);
    },
  },
  { t: 46, run: () => { sfx.packaging(); say('*', 'Chino pulls on a second pair of gloves over the first.', 3.4); addRead(14); } },
  { t: 54, run: () => { say('*', 'Footsteps behind the bathroom door. Weight shifting on old tile.', 3.6); addRead(14); S.slicerKnown = true; completeObjective('thirdman'); } },
  { t: 62, run: () => { if (!S.betrayed) offerBetrayal(); } },
];
let roomT = 0;
let roomEventIdx = 0;
function scheduleRoomEvents() { roomT = 0; roomEventIdx = 0; }

function moveCaseAway() {
  refs.jerkyCase.group.position.set(-3.4, 0.92, -12.6);
  refs.jerkyCase.x = -3.4;
  refs.jerkyCase.z = -12.6;
  /* Both prompts on this object travel with it. `burnCase` used to be left
   * behind wherever the case started, which was survivable while that was a
   * bed nobody stood at and is not now that it is the deal table. */
  for (const id of ['jerkyCase', 'burnCase']) {
    const i = ix(id);
    i.x = -3.4;
    i.z = -12.6;
  }
  S.reserveMoved = true;
  renderDealBoard();
}

function offerBetrayal() {
  openDialogue('ricoOffer');
}

// ---------- Dialogue ----------
function openDialogue(nodeId) {
  const node = NODES[nodeId];
  if (!node) return;
  dialogue = { nodeId, node, readyAt: Infinity };
  wheelHeadEl.innerHTML = `<span class="who">${node.speaker}</span> — ${node.line}`;
  wheelOptsEl.innerHTML = '';
  STYLES.forEach((style, i) => {
    const opt = node.options[style];
    if (!opt) return;
    const b = document.createElement('button');
    b.className = 'opt';
    b.disabled = true;
    b.dataset.style = style;
    b.innerHTML = `<span class="key">${i + 1}</span><span><span class="style">${STYLE_LABEL[style]}</span>${opt.text}</span>`;
    b.addEventListener('click', () => pickDialogue(style));
    wheelOptsEl.appendChild(b);
  });
  wheelEl.classList.add('show');
  /* The four answers are the instruction, so they stay off screen until the
   * character has finished asking. Showing them under a line still being
   * spoken gives the beat away and reads as the HUD talking over the cast. */
  wheelEl.classList.add('pending');
  slowTintEl.classList.add('on');
  timeScale = 0.35;   // time slows; it does not stop
  const promptHold = say(node.speaker, node.line, 4.5, cueFor(node.speaker, nodeId));
  const opened = dialogue;
  opened.readyAt = performance.now() + promptHold * 1000;
  afterLine(promptHold, () => {
    if (dialogue !== opened) return;
    wheelEl.classList.remove('pending');
    for (const button of wheelOptsEl.querySelectorAll('button.opt')) button.disabled = false;
  }, 0);
}

/** Stop the take the open wheel's prompt is being spoken on, and its subtitle. */
function hushDialogue() {
  stopMotelVoice();
  subtitleT = 0;
  subtitleEl.classList.remove('show');
}

/** True once the four answers are on screen and the player may pick one. */
function dialogueReady() {
  return !!dialogue && performance.now() >= dialogue.readyAt;
}

function closeDialogue() {
  /* A wheel closed while its prompt is still being spoken is a conversation
   * the player walked out of — got out of the car mid-briefing, walked through
   * the door, drew — and the mouth runs on the take (src/core/mouth.js), so
   * without this Rico finishes his question to nobody. Same rule as
   * Dialogue.hush() in src/bing/dialogue.js: a lapse stops the take; an
   * answered wheel (readyAt has passed) has nothing left to stop. */
  if (dialogue && performance.now() < dialogue.readyAt) hushDialogue();
  dialogue = null;
  wheelEl.classList.remove('show');
  wheelEl.classList.remove('pending');
  slowTintEl.classList.remove('on');
  timeScale = 1;
}

/** @returns {boolean} whether the answer was taken. */
function pickDialogue(style) {
  if (!dialogueReady()) return false;
  const { nodeId, node } = dialogue;
  const opt = node.options[style];
  if (!opt) return false;
  closeDialogue();
  sfx.select();
  const choiceHold = say('Prospect', opt.text, 3.4, cueFor('Prospect', `${nodeId}.${style}`));
  addHeat(opt.heat || 0);
  addRead(opt.read || 0);

  if (nodeId === 'atDoor') {
    S.doorOpened = true;
    openDoor(refs.frontDoor);
    moveRicoAsideForEntry();
  }

  if (nodeId === 'sample' && opt.nervous) {
    addHeat(8);
  }

  if (opt.revealStash) {
    S.stashFound = true;
    refs.stash.group.visible = true;
    completeObjective('stash');
  }
  if (opt.demandStash) {
    addHeat(8);
  }
  if (opt.hintsThird) {
    S.slicerKnown = true;
    completeObjective('thirdman');
  }
  if (opt.betrayAlly) {
    S.betrayedAlly = true;
    toast('SECRET COOPERATION', 'warn', "Rico thinks you are taking his side. Snow's trust will not survive this");
    addHeat(-25);
  }
  const afterReply = () => {
    if (phase === 'end') return;
    /* The invitation and a walkable doorway are the same beat. Rico has
     * already spent Tony's answer and his own reply walking clear of the
     * threshold, so the opening he was filling is open as he says it. */
    if (nodeId === 'atDoor') {
      inviteIntoRoomTwelve();
      say('Rico', 'Come in before the neighbours smell it.', 3);
    }
    if (nodeId === 'sample' && opt.nervous && !S.betrayed) {
      say('Chino', 'Rico. He is asking who handled it.', 3);
    }
    if (opt.demandStash && !S.betrayed) maybeBetray('counterfeit');
    if (nodeId === 'getaway') startDrive();
    if (nodeId === 'snowBrief' && phase === 'car') {
      const briefReady = () => {
        if (phase !== 'car' && phase !== 'lot') return;
        setObjective('reach', phase === 'car'
          ? 'Get out with [Q], or look at the passenger door and press [E].'
          : 'Knock on room twelve. Survey the motel first, or go straight to the meeting.');
        toast('SNOW HAS SOMETHING FOR YOU', '', 'Look at Snow and press [E], or get out and survey the motel first');
      };
      if (!S.snowGunOfferSpoken) {
        S.snowGunOfferSpoken = true;
        sayThenInstruct(
          SNOW_GUN_HANDOFF.offer.speaker,
          SNOW_GUN_HANDOFF.offer.line,
          SNOW_GUN_HANDOFF.offer.seconds,
          briefReady,
        );
      } else {
        briefReady();
      }
    }
  };

  afterLine(choiceHold, () => {
    if (phase === 'end') return;
    if (!opt.reply) { afterReply(); return; }
    const replyHold = say(opt.reply[0], opt.reply[1], 3.6, cueFor(opt.reply[0], `${nodeId}.${style}.reply`));
    afterLine(replyHold, afterReply);
  });
  return true;
}

// ---------- Inspection ----------
function openInspection() {
  inspecting = true;
  /* `viewmodelShown()` hides anything held while the panel is up, and both
   * rigs are only refreshed by `updateGear` -- so it has to be told. */
  updateGear();
  inspectEl.classList.add('show');
  inspectSerialEl.textContent = `SAMPLE ${shipment.serial} · RESTRICTED AGRICULTURAL PRODUCT`;
  renderInspection();
  timeScale = 0.55;
  addHeat(2);
}

function closeInspection() {
  inspecting = false;
  updateGear();
  inspectEl.classList.remove('show');
  timeScale = 1;
  if (inspection.done.size >= 2 && !S.sampleTalked) {
    S.sampleTalked = true;
    setTimeout(() => {
      if (phase !== 'room') return;
      const smokeHold = say('Prospect', 'This smoke is real.', 3);
      afterLine(smokeHold, () => {
        if (phase !== 'room' || S.betrayed) return;
        const answerHold = say('Rico', 'I told you.', 2.4);
        afterLine(answerHold, () => {
          if (phase !== 'room' || S.betrayed) return;
          const correctionHold = say('Prospect', 'I did not say the meat was real.', 3);
          afterLine(correctionHold, () => {
            if (phase === 'room' && !dialogue && !S.betrayed) openDialogue('sample');
          });
        });
      });
    }, 900);
  }
}

function renderInspection() {
  inspectListEl.innerHTML = inspection.choices().map((choice) => (
    `<button class="insp${choice.selected ? ' done' : ''}" data-id="${choice.id}" data-key="${choice.key}"${choice.disabled ? ' disabled' : ''}>`
      + `<span class="k">${choice.selected ? '✔' : choice.key}</span>${choice.label}</button>`
  )).join('');
  inspectListEl.querySelectorAll('.insp[data-id]:not(:disabled)').forEach((b) => {
    b.addEventListener('click', () => runInspection(b.dataset.id));
  });
  if (inspection.verdictKnown) {
    verdictEl.className = inspection.verdict === 'genuine' ? 'real' : 'fake';
    verdictEl.textContent = inspection.verdict === 'genuine'
      ? 'VERDICT: this is the Reserve.'
      : 'VERDICT: this is gas-station product.';
  } else {
    verdictEl.className = '';
    verdictEl.textContent = `Confidence: ${Math.round(Math.abs(inspection.evidence) * 100)}% — keep working.`;
  }
}

function runInspectionByKey(key) {
  const choice = inspection.choices().find((row) => row.key === String(key));
  if (choice && !choice.disabled) runInspection(choice.id);
}

function runInspection(id) {
  /* One test at a time. The panel is a menu of eight buttons and a player runs
   * them as fast as they can click, which queued sixteen lines on a floor that
   * never drops anything — measured at half a minute of the room narrating
   * itself after the fact. The buttons come back the moment he stops talking. */
  if (speechFloor.busy()) return;
  const res = inspection.run(id);
  if (!res) return;
  addHeat(res.heat * (S.sat ? 0.5 : 1));   // sitting down makes them patient
  addRead(6);
  const firstTest = !S.sampleChecked;
  S.sampleChecked = true;
  completeObjective('inspect');
  sfx.packaging();
  const inspectionHold = say('*', res.line, 4.2);
  renderInspection();

  const finishInspectionBeat = () => {
    if (firstTest && phase === 'room' && !S.betrayed) {
      advanceDeal({ announce: ['Rico', 'Satisfied? The case is right there. Eight of them. Count it.', 4.0] });
    }
    if (res.revealed) {
      if (inspection.verdict === 'counterfeit') {
        if (inspection.correct()) {
          completeObjective('counterfeit');
          award('grain');
        }
        toast('COUNTERFEIT', 'warn', 'Somebody in this room sold you a wrapper');
        closeInspection();
        if (!S.betrayed) openDialogue('counterfeit');
      } else {
        toast('GENUINE RESERVE', '', 'Dark red interior, marbled fat, serialised butcher stamp');
        if (shipment.grade !== 'genuine') {
          toast('...OR IS IT', 'warn', 'The sample was real. That is not the same as the shipment');
        }
      }
    }

    if (S.heat >= 100 && !S.betrayed) maybeBetray('heat');
  };

  afterLine(inspectionHold, () => {
    if (!res.prospect) { finishInspectionBeat(); return; }
    const prospectHold = say('Prospect', res.prospect, 3.4);
    const sellerBeats = INSPECTION_MEETING_BEATS[id] || [];
    if (sellerBeats.length) {
      speakAuthoredBeats(sellerBeats, prospectHold, finishInspectionBeat);
    } else {
      afterLine(prospectHold, finishInspectionBeat);
    }
  });
}

// ---------- The betrayal ----------
function maybeBetray(trigger, { fastDraw = false } = {}) {
  if (S.betrayed || (phase !== 'room' && phase !== 'door')) return;
  S.betrayed = true;
  phase = 'fight';
  S.fightStarted = true;
  if (inspection.done.size > 0) completeObjective('inspect', true);
  else failObjective('inspect');
  if (S.packagesCounted) completeObjective('count', true);
  else failObjective('count');
  S.dealStep = 'done';
  renderDealBoard();
  setObjective('survive', fastDraw
    ? 'You opened. Finish it before anybody in this motel finds a telephone'
    : 'They are between you and the door');
  closeInspection();
  closeDialogue();
  beginEvidenceRecovery();
  sfx.setMusic('fight');
  sfx.setTension(1);

  const betrayalHold = fastDraw
    ? say('Rico', 'Whoa — WHOA—', 1.6)
    : say('Rico', 'Bring out the cutting board.', 3.4);
  toast(fastDraw ? 'YOU DREW FIRST' : 'IT IS HAPPENING', 'warn', `Trigger: ${trigger}`);
  /* The hinge. Everything above this line is a negotiation the trigger cannot
   * touch; everything below it is a gunfight. Spoken after Rico because the
   * dialogue floor queues it there on its own. */
  releaseWeapon();

  // The bathroom door opens and the third man walks out
  afterLine(betrayalHold, () => {
    // Tony can be put down while Rico's recorded line is still playing. Once
    // capture has moved the scene past the fight, this reveal is stale: letting
    // it fire in the bathtub/recovery state dealt an unavoidable surprise hit.
    if (phase !== 'fight' || S.captured) return;
    openDoor(refs.bathDoor);
    sfx.doorOpen();
    sfx.sliceWhir();
    S.slicerRevealed = true;
    if (slicer) {
      slicer.state = 'chase';
      slicer.hostile = true;
      /* The free hit is the price of being surprised. A man who has already
       * drawn and is covering the room is not surprised — he is pointed at the
       * door the noise came through. He still has to deal with the third man;
       * he just does not eat a slicer for the privilege of noticing him. */
      if (!S.slicerKnown && !fastDraw) {
        say('*', 'The bathroom door opens behind you.', 3);
        damagePlayer(S.reactionBonus ? 8 : 18, 'the man you did not know about');
      } else if (fastDraw && !S.slicerKnown) {
        say('Prospect', 'Third man. Of course there is a third man.', 3.0);
      } else {
        say('Prospect', 'I know. I heard you breathing an hour ago.', 3.2);
      }
    }
  }, fastDraw ? 0.55 : (S.reactionBonus ? 0.78 : undefined));

  // Chino blocks the exit, Rico goes for the money
  if (chino) {
    chino.state = 'chase';
    chino.hostile = true;
    chino.anchor = { x: -1.4, z: -5.2 };
  }
  if (rico) {
    rico.hostile = true;
    rico.state = S.moneyOnTable ? 'goto' : 'chase';
    rico.target = { x: 1.4, z: -6.4 };
    rico.afterGoto = 'grabmoney';
  }
  // Only the three in the room turn on you now — the lot crew arrives later.
  for (const a of roomCrew()) a.hostile = true;

  if (S.positionsMarked > 0) markEnemies(S.positionsMarked);

  // Snow reacts to gunfire / a broken window / a signal / the second car
  const snowDelay = S.snowSignalled ? 3 : S.cluesFound.has('secondcar') ? 8 : 16;
  setTimeout(() => snowJoins('the noise'), snowDelay * 1000);
}

/**
 * Draw the Silverback Commander.
 *
 * This is the scene's one genuinely fast exit, and it is entirely optional:
 * the transaction can be talked, inspected, argued and brawled through
 * without the Commander ever leaving Tony's coat. Drawing it inside room
 * twelve before the sellers move does not skip the fight — it starts it, on
 * Tony's count instead of Rico's, which is worth a couple of seconds and the
 * third man's free swing.
 *
 * The bill comes later. It is a loud .45 in a motel at night with the Family's
 * crest on the frame, so the police attention it buys is the real cost, and
 * every quiet-exit objective in the scene is gone the moment it fires.
 */
function drawSilverback() {
  if (phase === 'menu' || phase === 'end' || paused || grapple) return;
  if (!S.silverbackTaken) {
    if (phase === 'car' || phase === 'lot' || phase === 'door' || phase === 'room') {
      toast('NOTHING UNDER YOUR COAT', 'warn', "Snow's Commander is still in the car");
    }
    return;
  }
  if (S.silverbackDrawn) return;
  /* Not in the lot, not on the doorstep. The Commander is the Family's, with
   * the crest on the frame, and the only place drawing it is a decision rather
   * than a mistake is across the table from Rico -- where it turns the deal
   * bad on Tony's count. Anywhere else in the protected portion it stays where
   * Snow put it. */
  if (dealSealed() && phase !== 'room') {
    sayThrottled('silverback.sealed', 'Prospect', 'It is under my coat. It stays under my coat.', 3.0);
    toast('NOT HERE', '', 'The Commander comes out across the table or it does not come out');
    return;
  }

  S.silverbackDrawn = true;
  S.weapon = 'silverback';
  S.ammo = WEAPON_STATS.silverback.ammo;
  S.usedNonImprovised = true;
  updateGear();
  sfx.select();

  const opening = phase === 'room' && !S.betrayed;
  if (opening) {
    /* Tony moves first, so the room turns while Rico is still holding a
     * sample. The betrayal fires immediately rather than on the usual heat
     * trigger, and `fastDraw` is what buys the tempo inside it. */
    S.silverbackFast = true;
    S.policeHeat += 18;
    addHeat(100);
    say('Prospect', 'Hands. Both of them. On the case.', 2.6);
    maybeBetray('you drew the Commander', { fastDraw: true });
    toast('COMMANDER OUT', 'warn', 'Seven rounds · everyone in this motel can hear it');
    snowJoins('a Family gun coming out');
  } else {
    toast('COMMANDER OUT', 'warn', `Seven rounds · ${WEAPON_STATS.silverback.name}`);
  }
}

/**
 * HE SAYS IT WHEN HE GETS HERE.
 *
 * Owner, 2026-08-24: *"Snow arrives long before his voiceline."* He did, and
 * both halves of why were in this function.
 *
 * `snow.state = 'follow'` starts him walking from the LOT, which is fifteen
 * metres and a doorway away. `say()` does not speak — it reserves a slot on
 * `speechFloor` and returns immediately — and the moment the room turns is
 * the chattiest second in the mission: the Prospect's challenge, Rico's
 * answer, Chino, the toasts. So Snow's entrance line went to the back of a
 * queue while Snow himself went in a straight line, and he was standing next
 * to the player with a crowbar several seconds before the room heard him
 * announce himself.
 *
 * The fix is not a delay guessed at the call site; that is the same bug with a
 * number in it. He is HANDED the line and says it when he arrives. Distance to
 * the player decides, because whichever way he comes in — the front door, the
 * window he has just put through — being next to the man he is helping is what
 * arriving means.
 */
const SNOW_ARRIVAL_RANGE = 3.4;
/** And if the room is a maze tonight, he still gets to say his piece. */
const SNOW_ARRIVAL_PATIENCE = 9;
let snowEntrance = null;

function snowJoins(reason) {
  if (S.snowInside || !snow || phase === 'end' || phase === 'drive') return;
  S.snowInside = true;
  snow.state = 'follow';
  snow.hp = Math.max(60, snow.hp);
  snowEntrance = {
    barkIdx: Math.floor(Math.random() * SNOW_FIGHT_BARKS.length),
    waited: 0,
    via: 'front door',
  };
  toast('SNOW IS COMING IN', '', `He heard ${reason} · watch the front door`);
  /* The entrance is a visible six-step sequence, not an NPC walking through a
   * closed leaf: unlock/open, cross, clear, then fight. The door stays open
   * once he clears because combat and evidence recovery need a guaranteed
   * return route; closing it here would recreate the lockout from item 19. */
  if (S.betrayed && !S.doorBroken && !refs.frontDoor.open) {
    openDoor(refs.frontDoor);
    sfx.doorOpen();
  }
}

/** Every frame while he is on his way in; silent until he is. */
function updateSnowEntrance(dt) {
  if (!snowEntrance || !snow || !snow.alive || phase === 'end') return;
  snowEntrance.waited += Math.max(0, Number(dt) || 0);
  const reach = Math.hypot(snow.position.x - pos.x, snow.position.z - pos.z);
  if (reach > SNOW_ARRIVAL_RANGE && snowEntrance.waited < SNOW_ARRIVAL_PATIENCE) return;
  const { barkIdx, via } = snowEntrance;
  snowEntrance = null;
  toast('SNOW IS IN', '', `Through the ${via} · the escape door stays open`);
  const entranceHold = say(
    ALLY, SNOW_FIGHT_BARKS[barkIdx], 3.2, cueFor(ALLY, `fight.${barkIdx}`),
  );
  /* The crowbar comes with him — thrown to you if you are empty-handed, kept
   * and visibly wielded if you are not. It waits for him too: a crowbar
   * landing at your feet from a man still in the car park was the same fault
   * in a second place. */
  if (S.weapon === 'fists') {
    dropWeaponPickup('crowbar', pos.x + 1.4, pos.z + 0.6);
    afterLine(entranceHold, () => say(ALLY, 'Crowbar. Catch it.', 3, cueFor(ALLY, 'crowbar')));
  } else {
    snow.equip('crowbar');
  }
}

// ---------- The gun stays down until the deal goes bad ----------
/**
 * THE PROTECTED PORTION OF THE SCENE.
 *
 * Owner: "before the deal turns bad, the player must not be able to simply
 * murder everyone and destroy the scene." Everything from the pull-in to the
 * moment room twelve turns is a negotiation -- a lookout by the ice machine, a
 * night clerk behind a counter, three men around a table -- and a player who
 * can empty a .45 into any of them has skipped the entire scene and left the
 * rest of it playing to an empty room.
 *
 * So it is REFUSED, not faked. `onRanged` never spends a round, never calls
 * into `WeaponSystem`, never plays a shot and never damages anybody while this
 * is true; the .45 is not in his hands at all (`heldKind()` reads the holster).
 * Tony says why, in his own voice, and the deal is still there afterwards.
 *
 * It ends exactly once, at `releaseWeapon()`, which `maybeBetray` calls on the
 * frame the room turns -- including the fast draw, where the player is the one
 * who turned it.
 */
function dealSealed() {
  if (S.betrayed) return false;
  return phase === 'arrival' || phase === 'car' || phase === 'lot'
    || phase === 'door' || phase === 'room';
}

/* Three ways of saying the same no, so a player leaning on the trigger gets a
 * man with an opinion rather than a man with one sentence. */
const WEAPON_REFUSALS = [
  'I should work the deal before resorting to that.',
  'Not yet. Let us see how this plays out.',
  'Lou sent me here to buy meat. Not to redecorate a motel.',
];

/** The room's answer to a trigger pull it is not ready for. */
function refuseWeapon() {
  const line = WEAPON_REFUSALS[S.weaponRefusals % WEAPON_REFUSALS.length];
  const spoke = sayThrottled('weapon.sealed', 'Prospect', line, 3.4);
  /* Only a line that actually got said moves the rotation on. Counting the
   * suppressed ones would burn two of the three answers inside the cooldown
   * and hand him the same sentence twice in a row afterwards. */
  if (spoke <= 0) return;
  S.weaponRefusals += 1;
  toast('NOT YET', '', S.weapon === 'fists'
    ? 'Work the deal. There is nothing here worth shooting yet'
    : 'The .45 stays put away until room twelve makes it necessary');
}

/**
 * The gun comes out, and the player is left in no doubt that it has.
 *
 * This is the hinge of the whole scene: one frame the room is a transaction
 * and the trigger does nothing, the next frame it is a gunfight and the same
 * trigger kills people. It is announced four ways at once -- the .45 appears
 * at the lens, the gear box stops saying PUT AWAY, the screen kicks, and Tony
 * says it out loud on the floor behind Rico's line.
 */
function releaseWeapon() {
  if (!S.holstered) return;
  S.holstered = false;
  updateGear();
  sfx.select();
  shake = Math.max(shake, 0.5);
  const armed = S.weapon !== 'fists';
  toast('WEAPON LIVE', 'warn', armed
    ? `${(WEAPON_STATS[S.weapon] || WEAPON_STATS.fists).name} · in your hands · [LMB] fires`
    : 'Nothing in your hands. Take something off somebody');
  if (armed) say('Prospect', 'The deal is dead. Now it is a gun.', 2.8);
}

// ---------- Combat ----------
function onAttack() {
  if (phase === 'menu' || phase === 'arrival' || phase === 'car' || phase === 'end' || paused) return;
  if (grapple) { mashGrapple(); return; }
  if (attackCd > 0 || stunT > 0) return;
  const st = WEAPON_STATS[S.weapon] || WEAPON_STATS.fists;
  if (st.ranged) { onRanged(); return; }
  // Only commit the swing if the animation is free, so no input is eaten.
  if (!player.startSmash()) return;
  attackCd = Math.max(st.rate, 0.52);
  pendingHit = st;
}

let pendingHit = null;

function resolvePlayerHit(st) {
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  let hitAny = false;
  /* The same protection the trigger has. Swinging at the scenery is fine --
   * kicking the table over is one of the scene's authored ways to start the
   * fight -- but a fist landing on Rico before the room has turned is the
   * walk-through defect with an extra step, so the swing is pulled. */
  const sealed = dealSealed();

  for (const a of actors) {
    if (!a.alive || a.faction === 'friendly' || a === snow) continue;
    const dx = a.position.x - pos.x;
    const dz = a.position.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > st.reach + 0.6) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot < 0.25) continue;
    if (sealed) { refuseWeapon(); return; }
    hitAny = true;
    const dmg = st.dmg * (S.weapon === 'fists' ? 1.25 : 1);
    const down = a.damage(dmg, st.lethal, pos.x, pos.z);
    sfx.punch(st.dmg > 30);
    debris.puff(new THREE.Vector3(a.position.x, 1.4, a.position.z), 0x7a3a3a, 3);
    shake = Math.max(shake, 0.25);
    if (down) onActorDown(a, st.lethal);
    if (st.improvised === false) S.usedNonImprovised = true;
  }

  // Scenery
  if (!hitAny) {
    const tx = pos.x + fx * 2.4;
    const tz = pos.z + fz * 2.4;
    if (!S.windowBroken && Math.hypot(tx - 3.0, tz + 4.4) < 2.0) breakWindow();
    else if (!refs.tv.broken && Math.hypot(tx - refs.tv.x, tz - refs.tv.z) < 1.8) smashTV();
    /* Taking the door off its hinges is a way OUT of room twelve, not a way
     * in: without `enteredRoom` a player could stand in the lot and punch the
     * deal open before knocking, which is the walk-through defect again with
     * an extra step. */
    else if (!S.doorBroken && S.enteredRoom && refs.frontDoor.collider.enabled
      && Math.hypot(tx - 0, tz + 4.5) < 2.2) breakFrontDoor();
    else sfx.whiff();
  }
  hitStop = Math.max(hitStop, hitAny ? 0.05 : 0);
}

function onRanged() {
  if (phase === 'menu' || phase === 'arrival' || phase === 'car' || phase === 'end' || paused || grapple) return;
  /* Nothing leaves the barrel while the deal is still a deal. This is BEFORE
   * every other test on purpose: no round is spent, no cue is played, no
   * cadence timer is started and `WeaponSystem` is never touched, so there is
   * no shot to pretend did not happen. */
  if (dealSealed()) { refuseWeapon(); return; }
  const st = WEAPON_STATS[S.weapon];
  if (!st) return;
  if (!st.ranged) { throwWeapon(); return; }
  if (st.shared) { fireSharedWeapon(st); return; }
  if (S.ammo <= 0) { sfx.dryFire(); toast('EMPTY', 'warn', 'Nothing left in the wheel'); return; }
  if (attackCd > 0) return;
  attackCd = st.rate;
  S.ammo--;
  spendRangedShot();
  sfx.gunshot();
  resolveRangedHit(st);
}

/**
 * One trigger pull on a gun the shared system owns.
 *
 * `WeaponSystem` decides whether the gun fires at all — cadence, the
 * semi-auto trigger latch, a reload in progress, an empty cylinder and its
 * one dry click per pull all belong to `Firearm`, not to this scene. It also
 * produces the flash, the tracer, the recoil and the recording. What comes
 * back here is only the answer to "did a round leave the gun", and this scene
 * spends that round on its own actors, its own suspicion and its own police
 * attention — which the shared system is deliberately incapable of knowing
 * about (no actor list in `src/core/weapons/`, ever).
 */
function fireSharedWeapon(st) {
  const shot = weapons.triggerPress();
  syncSharedAmmo();
  if (!shot?.fired) {
    if (shot?.reason === 'empty') {
      toast('EMPTY', 'warn', `Six out · [R] to reload · ${weapons.firearm(st.shared).reserve} loose`);
    }
    return;
  }
  attackCd = st.rate;
  spendRangedShot();
  resolveRangedHit(st);
}

/** [R]: dump the brass and put six more in. */
function onReload() {
  if (phase === 'menu' || phase === 'end' || paused || grapple) return;
  const st = WEAPON_STATS[S.weapon];
  if (!st?.shared) return;
  /* [R] is not a dead key during the deal, it is a refused one. The cylinder
   * is full, the gun is in his coat, and saying so beats silence. */
  if (dealSealed()) {
    toast('PUT AWAY', '', 'Six in the wheel and the wheel is under your coat');
    return;
  }
  const firearm = weapons.firearm(st.shared);
  if (firearm.rounds >= firearm.capacity) {
    toast('FULL', '', `${st.name} · ${firearm.rounds}/${firearm.capacity}`);
    return;
  }
  if (firearm.reserve <= 0) { toast('NO ROUNDS LEFT', 'warn', 'Nothing to put in it'); return; }
  if (weapons.reload()) toast('RELOADING', '', 'Rod out, brass on the carpet, six back in');
}

/** What one round costs Tony, whoever it hit. */
function spendRangedShot() {
  S.firedWeapon = true;
  S.usedNonImprovised = true;
  S.policeHeat += 12;
  failObjective('noshot');
  shake = Math.max(shake, 0.45);
  updateGear();
  if (!S.snowInside) snowJoins('gunfire');
}

/** Where the round went, against this scene's roster. */
function resolveRangedHit(st) {
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  let best = null;
  let bestD = st.reach;
  for (const a of actors) {
    if (!a.alive || a.faction === 'friendly') continue;
    const dx = a.position.x - pos.x;
    const dz = a.position.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot < 0.9) continue;
    if (segmentBlocked(pos.x, pos.z, feetY + 1.6, a.position.x, a.position.z, a.position.y + 1.6) < 0.95) continue;
    best = a;
    bestD = d;
  }
  if (best) {
    const down = best.damage(st.dmg, true, pos.x, pos.z);
    debris.puff(new THREE.Vector3(best.position.x, 1.5, best.position.z), 0x8a1414, 5);
    if (down) onActorDown(best, true);
  } else {
    // Shooting through the bathroom wall is a legitimate tactic
    if (slicer && slicer.alive && !S.slicerRevealed && fz < -0.4 && pos.z < -8) {
      slicer.damage(st.dmg * 0.7, true, pos.x, pos.z);
      say('*', 'The round goes through the bathroom wall. Something heavy hits the tile.', 3.6);
    }
  }
}

function throwWeapon() {
  if (S.weapon === 'fists') { sfx.whiff(); return; }
  const st = WEAPON_STATS[S.weapon];
  const foe = nearestHostileInFront(6.5);
  const thrown = S.weapon;
  S.weapon = 'fists';
  S.ammo = 0;
  updateGear();
  sfx.whiff();
  if (foe) {
    const down = foe.damage(st.dmg * 0.8, st.lethal, pos.x, pos.z);
    sfx.punch(true);
    toast('THROWN', '', `${WEAPON_STATS[thrown].name} → ${foe.name}`);
    if (down) onActorDown(foe, st.lethal);
  }
}

function dropWeapon() {
  if (S.weapon === 'fists') return;
  const dropped = S.weapon;
  S.weapon = 'fists';
  S.ammo = 0;
  updateGear();
  if (!S.evidenceChoice) {
    S.evidenceChoice = insideRoom() ? 'room' : 'ground';
    S.policeHeat += insideRoom() ? 22 : 12;
    toast('EVIDENCE DROPPED', 'warn', insideRoom()
      ? 'Left in room twelve, with your fur all over it'
      : 'Left in the open where anyone can find it');
  }
  /* An anonymous revolver in an ice machine is a shrug. The Commander has a
   * crest on the frame and it belongs to a man with a name, so leaving it
   * anywhere is not evidence against Tony, it is evidence against the Family. */
  if (WEAPON_STATS[dropped]?.family) {
    S.policeHeat += 26;
    toast('THE CREST IS ON IT', 'warn', 'You left a Family gun where somebody will pick it up');
  }
  toast('DROPPED', '', WEAPON_STATS[dropped].name);
}

/**
 * Put something in Tony's hands.
 *
 * One door for everything he can hold, so the HUD count, the view model and —
 * for the .45 — the shared `Firearm`'s own idea of what is in the cylinder
 * cannot disagree. Ammunition for a shared gun is READ from that firearm and
 * never assigned: it survives being holstered, thrown in an ice machine and
 * picked back up, because the round you did not fire is still in there.
 */
function equipWeapon(kind) {
  S.weapon = kind;
  const st = WEAPON_STATS[kind] || WEAPON_STATS.fists;
  S.ammo = st.shared ? weapons.firearm(st.shared).rounds : (st.ammo || 0);
  updateGear();
}

/** Carry the shared firearm's round count back into this scene's HUD. */
function syncSharedAmmo() {
  const shared = sharedWeaponId(S.weapon);
  if (!shared) return;
  const rounds = weapons.firearm(shared).rounds;
  if (rounds === S.ammo) return;
  S.ammo = rounds;
  updateGear();
}

function pickUpWeapon(kind) {
  const st = WEAPON_STATS[kind];
  equipWeapon(kind);
  if (st.improvised === false || st.ranged) S.usedNonImprovised = true;
  toast('PICKED UP', '', st.name);
  sfx.select();
}

function disposeWeapon(where) {
  if (S.weapon === 'fists') return;
  const name = WEAPON_STATS[S.weapon].name;
  S.evidenceChoice = where;
  S.weapon = 'fists';
  S.ammo = 0;
  updateGear();
  const notes = {
    ice: ['ICE MACHINE', 'Cold, anonymous, and nobody looks in there until August', 0],
    vending: ['VENDING MACHINE', 'Slot C4, behind the pork rinds', 2],
    pool: ['EMPTY POOL', 'Under a lawn chair at the deep end', 6],
    rico: ['PLANTED ON RICO', 'Let the man who started it hold it', -10],
  };
  const [t, sub, heat] = notes[where] || ['DROPPED', '', 10];
  // The crest does not care how clever the hiding place was.
  const crest = WEAPON_STATS[name === WEAPON_STATS.silverback.name ? 'silverback' : '']?.family ? 20 : 0;
  S.policeHeat = Math.max(0, S.policeHeat + heat + crest);
  if (crest) toast('THE CREST IS ON IT', 'warn', 'A Family gun, found or not, is a Family problem');
  toast(t, '', `${name} — ${sub}`);
  sfx.packaging();
}

function enemyMelee(a) {
  if (a.faction === 'friendly' || !a.hostile) return;
  const d = Math.hypot(a.position.x - pos.x, a.position.z - pos.z);
  const st = a.stats();
  if (d > st.reach + 0.7) return;
  // A swing needs a line — no punching through a closed bathroom door.
  if (segmentBlocked(a.position.x, a.position.z, a.position.y + 1.5, pos.x, pos.z, feetY + 1.5) < 0.95) return;
  if (S.mattressCover && Math.hypot(pos.x + 1.9, pos.z + 12.6) < 2.5) {
    say('*', 'The swing buries itself in a motel mattress.', 2.4);
    return;
  }
  damagePlayer(st.dmg * 0.55, a.name);
  if (st.stun) stunT = Math.max(stunT, st.stun);
  if (a.weapon === 'prod') sfx.prod();
  else sfx.punch(false);
}

function enemyShoot(a) {
  if (a.faction === 'friendly' || !a.hostile) return;
  sfx.gunshot();
  S.policeHeat += 4;
  const behindCover = S.mattressCover && Math.hypot(pos.x + 1.9, pos.z + 12.6) < 2.5;
  const blockedFrac = segmentBlocked(a.position.x, a.position.z, a.position.y + 1.5, pos.x, pos.z, feetY + 1.5);
  if (blockedFrac < 0.95) return;
  damagePlayer(a.stats().dmg * (behindCover ? 0.35 : 0.7), a.name);
}

function allyAttack(ally, foe) {
  const down = foe.damage(24, false, ally.position.x, ally.position.z);
  sfx.punch(false);
  if (down) onActorDown(foe, false);
}

function startGrapple(a) {
  if (grapple || !a.alive || a.faction === 'friendly' || !a.hostile) return;
  if (Math.hypot(a.position.x - pos.x, a.position.z - pos.z) > 2.6) return;
  grapple = { actor: a, progress: 0, t: 0 };
  grappleEl.classList.add('show');
  say(a.name, 'Hold him still!', 2.6);
}

function mashGrapple() {
  if (!grapple) return;
  grapple.progress += 9;
  sfx.grapple();
  grappleFillEl.style.width = `${Math.min(100, grapple.progress)}%`;
  if (grapple.captive) return;   // the tick handles climbing out of the tub
  if (grapple.progress >= 100) {
    const a = grapple.actor;
    a.stunT = 1.6;
    a.damage(18, false, pos.x, pos.z);
    endGrapple();
    say('Prospect', 'Do not put hands on a Squatchtana.', 3);
  }
}

function endGrapple() {
  grapple = null;
  grappleEl.classList.remove('show');
  grappleFillEl.style.width = '0%';
  $('grappleText').textContent = 'MASH SPACE';
}

function damagePlayer(amount, source = '') {
  if (invuln > 0 || phase === 'end') return;
  if (phase === 'drive') {
    // A car chase is not a place to bleed out — you just get rattled.
    S.hp = Math.max(8, S.hp - amount);
    hpFillEl.style.width = `${S.hp}%`;
    dmgFlashEl.classList.add('on');
    setTimeout(() => dmgFlashEl.classList.remove('on'), 220);
    return;
  }
  S.hp = Math.max(0, S.hp - amount);
  invuln = 0.35;
  dmgFlashEl.classList.add('on');
  setTimeout(() => dmgFlashEl.classList.remove('on'), 220);
  shake = Math.max(shake, 0.35);
  hpFillEl.style.width = `${S.hp}%`;
  if (S.hp <= 0) onProspectDown(source);
}

// Whatever they were swinging stays on the carpet for you.
let droppedId = 0;
function dropWeaponPickup(kind, x, z) {
  if (!kind || !WEAPON_STATS[kind]) return;
  const m = buildWeaponMesh(kind);
  m.position.set(x, 0.35, z);
  m.rotation.set(Math.PI / 2, Math.random() * 3, 0);
  scene.add(m);
  const id = `drop${++droppedId}`;
  let taken = false;
  addInteract({
    id, x, y: 0.4, z, r: 2.8,
    label: () => `Pick up the ${WEAPON_STATS[kind].name.toLowerCase()}`,
    enabled: () => !taken,
    act: () => {
      taken = true;
      scene.remove(m);
      pickUpWeapon(kind);
    },
  });
}

function onActorDown(a, lethal) {
  silencedSpeakers.add(a.name);
  if (dialogue?.node?.speaker === a.name) closeDialogue();
  if (currentSpeechSpeaker === a.name) {
    stopMotelVoice();
    currentSpeechSpeaker = null;
    subtitleT = 0;
    subtitleEl.classList.remove('show');
  }
  sfx.bodyFall();
  if (lethal) S.lethalKills++;
  toast(lethal ? 'KILLED' : 'PUT DOWN', lethal ? 'warn' : '', a.name);
  if (a.weapon) {
    dropWeaponPickup(a.weapon, a.position.x + (Math.random() - 0.5), a.position.z + (Math.random() - 0.5));
    a.equip(null);
  }

  // Room Service: put a man through the door of room twelve
  const nearDoor = Math.hypot(a.position.x - 0, a.position.z + 4.5) < 3.2;
  if (nearDoor && insideRoom()) {
    if (!S.doorBroken) breakFrontDoor();
    award('roomservice');
  }

  if (a === rico) {
    if (S.moneyTakenByRico) {
      a.carryingMoneyCase = false;
      dropMoneyCaseAt(a.position.x + 0.55, a.position.z + 0.25);
      toast('MONEY CASE DROPPED', '', 'Rico is down. The marked case still needs picking up');
    }
  }
  if (a === chino && a.carryingCase) dropCaseAt(a.position.x, a.position.z);
  checkRoomCleared();
}

function nearestHostile(x, z, radius) {
  let best = null;
  let bd = radius;
  for (const a of actors) {
    if (!a.alive || a.faction === 'friendly' || !a.hostile) continue;
    const d = Math.hypot(a.position.x - x, a.position.z - z);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

function nearestHostileInFront(radius) {
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  let best = null;
  let bd = radius;
  for (const a of actors) {
    if (!a.alive || a.faction === 'friendly') continue;
    const dx = a.position.x - pos.x;
    const dz = a.position.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bd) continue;
    if ((dx * fx + dz * fz) / (d || 1) < 0.4) continue;
    best = a;
    bd = d;
  }
  return best;
}

function markEnemies(seconds) {
  for (const a of actors) {
    if (a.role !== 'seller' || !a.alive) continue;
    if (a.marker) continue;
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.6, 4),
      lambert(0xff3ea5, { emissive: 0xff3ea5 })
    );
    m.rotation.x = Math.PI;
    a.group.add(m);
    m.position.set(0, (a.rig.height ?? 3.1) + 0.5, 0);
    a.marker = m;
    a.markerT = seconds;
  }
}

// ---------- Environmental combat ----------
function kickTable() {
  refs.table.kicked = true;
  refs.table.collider.enabled = false;
  refs.table.group.rotation.z = 1.1;
  refs.table.group.position.set(1.0, 0.4, -7.6);
  sfx.woodBreak();
  shake = Math.max(shake, 0.4);
  const foe = nearestHostileInFront(5.0);
  if (foe) {
    const down = foe.damage(30, false, pos.x, pos.z);
    foe.stunT = 1.6;
    if (down) onActorDown(foe, false);
    toast('TABLE', '', `Straight into ${foe.name}`);
  }
  if (S.moneyOnTable && !S.moneyOpened) {
    say('*', 'The money case goes over with the table. Bundles everywhere.', 3.4);
  }
}

function throwSeasoning() {
  refs.seasoning.used = true;
  refs.seasoning.group.visible = false;
  sfx.spice();
  const foe = nearestHostileInFront(6.0);
  if (foe) {
    foe.blindT = 3.2;
    foe.stunT = 0.8;
    toast('CLASSIFIED SPICES', '', `${foe.name} cannot see`);
    say('Prospect', 'Seventy-two hours of smoke, right in the eyes.', 3);
  } else {
    say('Prospect', 'Wasted good seasoning.', 2.4);
  }
}

function shoveIntoTV() {
  const foe = nearestHostile(refs.tv.x, refs.tv.z, 4.5) || nearestHostileInFront(4.0);
  if (!foe) { say('Prospect', 'Nobody near the television.', 2.4); return; }
  smashTV();
  const down = foe.damage(46, false, pos.x, pos.z);
  foe.stunT = 2.0;
  if (down) onActorDown(foe, false);
  toast('ROOM SERVICE', '', `${foe.name} meets a 1997 television`);
}

function smashTV() {
  if (refs.tv.broken) return;
  refs.tv.broken = true;
  refs.tv.screen.visible = false;
  sfx.tvBreak();
  effects.explosion(new THREE.Vector3(refs.tv.x, 1.6, refs.tv.z));
  shake = Math.max(shake, 0.4);
}

function breakWindow(quiet = false) {
  if (S.windowBroken) return;
  S.windowBroken = true;
  refs.window12.mesh.visible = false;
  sfx.glassSmash();
  sfx.glassSettle();
  shake = Math.max(shake, 0.4);
  if (!quiet) say('*', 'The front window of room twelve leaves the building.', 3.2);
  if (!S.snowInside) snowJoins('breaking glass');
  freshness.damage(4, 'a broken window');
}

function breakFrontDoor() {
  S.doorBroken = true;
  refs.frontDoor.collider.enabled = false;
  refs.frontDoor.open = true;
  refs.frontDoor.targetAngle = -2.6;
  sfx.doorSplinter();
  shake = Math.max(shake, 0.5);
  toast('DOOR IS OPEN', '', 'The way out of room twelve is not a door any more');
  if (!S.snowInside) snowJoins('a door leaving its frame');
}

function slamBathDoor() {
  const foe = nearestHostile(3.3, -10.8, 2.6);
  closeDoor(refs.bathDoor);
  sfx.doorSlam();
  if (foe) {
    foe.stunT = 2.2;
    foe.damage(20, false, pos.x, pos.z);
    toast('DOOR', '', `${foe.name} wears the bathroom door`);
  }
}

function burnShipment() {
  S.caseBurned = true;
  S.carryingJerky = false;
  S.packagesIntact = 0;
  refs.jerkyCase.group.visible = false;
  if (carriedCases.jerky) { scene.remove(carriedCases.jerky); carriedCases.jerky = null; }
  effects.explosion(new THREE.Vector3(pos.x, 1.2, pos.z));
  sfx.fire();
  shake = Math.max(shake, 0.8);
  award('welldone');
  failObjective('intact');
  toast('WELL DONE', 'ach', 'The Reserve is smoke. Again.');
  say('Prospect', 'Nobody sells this to anybody now.', 3.4);
  collectEvidenceCase('reserve', { title: 'RESERVE CASE DESTROYED' });
  phase = 'escape';
  updateRecoveryObjective();
  spawnReinforcements();
}

// ---------- Cases ----------
function evidenceStatus() {
  return evidence.snapshot();
}

function evidencePose(id) {
  if (id === 'reserve') {
    const p = refs.jerkyCase.group.position;
    return { x: p.x, y: Math.max(0.45, p.y) + 0.35, z: p.z };
  }
  if (id === 'money') {
    const p = carriedCases.money?.position;
    return p
      ? { x: p.x, y: Math.max(0.45, p.y) + 0.35, z: p.z }
      : { x: MOTEL_YOUR_CASE.x, y: MOTEL_YOUR_CASE.y + 0.35, z: MOTEL_YOUR_CASE.z };
  }
  return { x: refs.stash.x, y: 0.5, z: refs.stash.z };
}

function updateEvidenceMarkers(dt = 0) {
  evidenceMarkerClock += Math.max(0, Number(dt) || 0);
  for (const [id, marker] of Object.entries(evidenceMarkers)) {
    const unavailable = (id === 'money' && S.moneyTakenByRico)
      || (id === 'reserve' && actors.some((a) => a.carryingCase));
    marker.visible = S.betrayed && !evidence.has(id) && !unavailable;
    if (!marker.visible) continue;
    const p = evidencePose(id);
    marker.position.set(p.x, p.y + 0.13 + Math.sin(evidenceMarkerClock * 3.2 + id.length) * 0.09, p.z);
    marker.rotation.y += dt * 0.8;
  }
}

function updateRecoveryObjective() {
  const status = evidenceStatus();
  if (phase !== 'recover' && phase !== 'escape') return status;
  if (status.complete) {
    completeObjective('recover');
    phase = 'escape';
    setObjective('escape', 'All three evidence cases are secured. Get back to Snow at the car.');
  } else {
    setObjective('recover', evidenceObjectiveCopy(status));
  }
  return status;
}

function beginEvidenceRecovery() {
  evidence.reset();
  S.moneyRecovered = false;
  /* Rico's hidden case stops being an optional pixel hunt once the room turns.
   * It is one of three required hard cases, so it becomes visible and marked. */
  S.stashFound = true;
  refs.stash.found = true;
  refs.stash.group.visible = true;
  updateEvidenceMarkers();
  const status = evidenceStatus();
  toast(evidenceCounter(status), 'warn', evidenceMissingCopy(status));
  updateGear();
}

function collectEvidenceCase(id, { title = 'EVIDENCE CASE SECURED' } = {}) {
  if (!evidence.collect(id)) return false;
  evidenceMarkers[id].visible = false;
  if (id === 'money') {
    S.moneyRecovered = true;
    S.moneyTakenByRico = false;
    S.carryingMoney = true;
    if (carriedCases.money) carriedCases.money.visible = false;
    completeObjective('money');
  } else if (id === 'premium') {
    S.stashTaken = true;
    refs.stash.group.visible = false;
    completeObjective('stash');
  }
  const status = evidenceStatus();
  toast(title, status.complete ? 'ach' : '', `${evidenceCounter(status)} · ${evidenceMissingCopy(status)}`);
  updateRecoveryObjective();
  updateGear();
  return true;
}

function dropMoneyCaseAt(x, z) {
  placeMoneyCase({ x, y: 0.18, z, ry: 0.18 });
  carriedCases.money.visible = true;
  S.moneyTakenByRico = false;
  S.moneyRecovered = false;
  const pickup = ix('recoverMoneyCase');
  if (pickup) {
    pickup.x = x;
    pickup.z = z;
  }
  updateEvidenceMarkers();
}

function makeCarryCase(color) {
  const c = makeJerkyCase(color);
  c.group.scale.setScalar(0.8);
  return c;
}

/**
 * Put Tony's case down on the table, shut, on his own edge of it.
 *
 * This is the physical beat, not the transaction: the case leaves his hands
 * and joins theirs on the same table, which is the tableau the entire
 * inspection is played against. `S.carryingMoney` is deliberately untouched --
 * nobody has been paid, and pushing it across is still its own decision.
 */
function confirmOwnCasePlacement() {
  if (!S.casePlacementReady || S.caseDown || phase !== 'room') return false;
  S.casePlacementReady = false;
  S.casePlacementConfirmed = true;
  casePlacementMarker.visible = false;
  putOwnCaseDown({ animate: true });
  completeObjective('place');
  toast('CASE PLACED', '', "Lou's case is shut, beside their sample");
  const downHold = say('Prospect', 'Two cases, one table. Mine stays shut until I like what I see.', 4.0);
  /* Establish their sample, their eight and Lou's case only after the physical
   * placement has happened. The HUD cannot get ahead of the table anymore. */
  speakAuthoredBeats(ROOM_ENTRY_BEATS, downHold, () => {
    if (phase !== 'room' || S.betrayed) return;
    S.sampleOut = true;
    advanceDeal();
    toast('THEIR SAMPLE IS ON THE TABLE', '', 'One strip. [E] at the table to work it over.');
    scheduleRoomEvents();
  });
  return true;
}

function putOwnCaseDown({ animate = false } = {}) {
  if (S.caseDown) return;
  S.caseDown = true;
  S.caseHeld = false;
  placeMoneyCase(MOTEL_YOUR_CASE);
  if (animate && carriedCases.money) {
    carriedCases.money.position.y = MOTEL_YOUR_CASE.y + 0.52;
    carriedCases.money.rotation.y = MOTEL_YOUR_CASE.ry + 0.22;
    carriedCases.money.scale.setScalar(0.68);
    casePlacementAnim = { elapsed: 0, duration: 0.55 };
  }
  sfx.caseLatch();
  const i = ix('placeMoney');
  i.x = MOTEL_YOUR_CASE.x;
  i.z = MOTEL_YOUR_CASE.z;
  updateGear();
}

function updateCasePlacement(dt) {
  if (casePlacementMarker.visible) {
    const pulse = 0.34 + Math.sin(performance.now() * 0.006) * 0.12;
    placementTray.material.opacity = pulse;
    casePlacementMarker.position.y = MOTEL_YOUR_CASE.y + Math.sin(performance.now() * 0.004) * 0.025;
  }
  if (!casePlacementAnim || !carriedCases.money) return;
  casePlacementAnim.elapsed = Math.min(casePlacementAnim.duration, casePlacementAnim.elapsed + dt);
  const linear = casePlacementAnim.elapsed / casePlacementAnim.duration;
  const k = 1 - ((1 - linear) ** 3);
  carriedCases.money.position.y = THREE.MathUtils.lerp(MOTEL_YOUR_CASE.y + 0.52, MOTEL_YOUR_CASE.y, k);
  carriedCases.money.rotation.y = THREE.MathUtils.lerp(MOTEL_YOUR_CASE.ry + 0.22, MOTEL_YOUR_CASE.ry, k);
  carriedCases.money.scale.setScalar(THREE.MathUtils.lerp(0.68, 0.8, k));
  if (linear >= 1) casePlacementAnim = null;
}

/** Build (or move) the money case model at one of the authored table poses. */
function placeMoneyCase(pose = MOTEL_YOUR_CASE_PAID) {
  if (!carriedCases.money) {
    const c = makeCarryCase(0x3a2a1a);
    /* Shut. Its packs are jerky, and this case does not contain jerky. */
    c.lid.rotation.x = 0;
    for (const pack of c.packs) pack.mesh.visible = false;
    scene.add(c.group);
    carriedCases.money = c.group;
    refs.moneyCase = { ...c, x: pose.x, z: pose.z };
  }
  carriedCases.money.position.set(pose.x, pose.y, pose.z);
  carriedCases.money.rotation.y = pose.ry;
  refs.moneyCase.x = pose.x;
  refs.moneyCase.z = pose.z;
}

function takeJerkyCase() {
  S.carryingJerky = true;
  refs.jerkyCase.group.visible = false;
  collectEvidenceCase('reserve', { title: 'RESERVE CASE SECURED' });
  if (phase !== 'escape' && phase !== 'drive') {
    phase = 'escape';
    spawnReinforcements();
  }
  updateRecoveryObjective();
  toast('THE RESERVE IS YOURS', '', `${S.packagesIntact}/8 packages · ${freshness.grade}`);
  sfx.caseLatch();
  updateGear();
}

function dropCaseAt(x, z) {
  S.carryingJerky = false;
  refs.jerkyCase.group.visible = true;
  refs.jerkyCase.group.position.set(x, 0.1, z);
  refs.jerkyCase.x = x;
  refs.jerkyCase.z = z;
  const i = ix('jerkyCase');
  i.x = x;
  i.z = z;
  const bi = ix('burnCase');
  bi.x = x;
  bi.z = z;
}

function throwCaseInPool(a) {
  S.caseInPool = true;
  a.carryingCase = false;
  refs.jerkyCase.group.visible = true;
  refs.jerkyCase.group.position.set(22, -2.9, 13);
  refs.jerkyCase.x = 22;
  refs.jerkyCase.z = 13;
  freshness.damage(6, 'a short flight into the motel pool');
  damagePackages(1, 'pool');
  say('Chino', 'Then nobody eats!', 3);
  toast('IN THE POOL', 'warn', 'Chino threw the Reserve into the deep end');
  setObjective('recover', 'Get down into the pool — they will be shooting from the deck');
}

function damagePackages(n, reason) {
  if (n <= 0) { freshness.damage(2, reason); return; }
  for (let i = 0; i < n; i++) {
    const p = shipment.packages.find((x) => x.intact);
    if (!p) break;
    p.intact = false;
    S.packagesIntact = Math.max(0, S.packagesIntact - 1);
    const mesh = refs.jerkyCase.packs[S.packagesIntact];
    if (mesh) mesh.mesh.visible = false;
  }
  failObjective('intact');
  freshness.damage(4, reason);
}

// ---------- Escape ----------
function spawnReinforcements() {
  for (const { id } of MOTEL_REINFORCEMENT_STAGES) spawnMotelActor(id);
  toast('MORE SELLERS', 'warn', 'Cars in the lot. They are coming across the concrete.');
  sfx.siren(true);
  if (lookout) { lookout.state = 'chase'; lookout.hostile = true; }
  if (watcher) { watcher.state = 'chase'; watcher.hostile = true; }
  if (S.positionsMarked > 0) markEnemies(S.positionsMarked);
}

function roomCrew() {
  return [rico, chino, slicer].filter((a) => a && !a.escaped && actors.includes(a));
}

function checkRoomCleared() {
  const standing = roomCrew().filter((a) => a.alive);
  if (standing.length === 0 && phase === 'fight') {
    completeObjective('survive');
    if (!S.usedNonImprovised) award('snack');
    phase = 'recover';
    updateRecoveryObjective();
    say('Prospect', 'Now. Where is my meat.', 3);
  }
}

function actorReachedTarget(a) {
  if (a.faction === 'friendly') {
    a.target = null;
    a.afterGoto = null;
    a.state = S.snowInside ? 'follow' : 'idle';
    return;
  }
  if (a === rico && a.afterGoto === 'grabmoney') {
    if (evidence.has('money')) {
      a.afterGoto = null;
      a.target = null;
      a.state = 'chase';
      return;
    }
    S.moneyTakenByRico = true;
    S.moneyRecovered = false;
    if (carriedCases.money) carriedCases.money.visible = false;
    a.carryingMoneyCase = true;
    a.afterGoto = null;
    ricoBreaksFor(a);
    say('Rico', 'Nothing personal. Everything financial.', 3.2);
    toast('RICO IS RUNNING', 'warn', `He is going for ${a.target.via}`);
  } else if (a === rico && a.afterGoto === 'ricoThrough') {
    /* He is at the opening. The second leg takes him out of it. */
    ricoRunsOut(a);
  } else if (a === rico && (a.afterGoto === 'ricoGone' || a.state === 'flee')) {
    ricoEscapes(a);
  } else if (a === chino && a.carryingCase) {
    throwCaseInPool(a);
    a.state = 'chase';
  } else {
    a.state = 'chase';
  }
}

/**
 * WHERE HE IS RUNNING, AND HOW MANY WAYS HE HAS LEFT.
 *
 * `skip` is the routes he has already failed to reach. A seller who cannot get
 * through the front door tries the window before he tries evaporating.
 */
function pickRicoExit(skip = new Set()) {
  const routes = [];
  if (refs.frontDoor.open || S.doorBroken) routes.push({ x: 0, z: 8, via: 'the front walkway' });
  if (S.windowBroken) routes.push({ x: 3.0, z: -5.2, via: 'the smashed front window' });
  routes.push({ x: 3.3, z: -14.4, via: 'the bathroom window' }); // over the tub and out
  return routes.find((route) => !skip.has(route.via)) ?? routes[0];
}

/**
 * HE HAS TO BE SEEN LEAVING.
 *
 * Owner, 2026-08-24, on the Motel: *"Rico slips out real quick."* He did, and
 * not because he was fast. There were two ways for him to simply cease to
 * exist. `actorReachedTarget` deleted him the frame he touched the exit point,
 * which for the bathroom window is a spot INSIDE the bathroom -- so he
 * vanished on the tub rather than going over it. And `actorStuck` deleted him
 * outright: one blocked step behind a chair and the man with the forty
 * thousand was gone, from the middle of the room, in front of the player.
 *
 * So an exit is two legs now. The first is the opening itself, which is the
 * part the player can contest -- he is in the room, he is running, and he can
 * be stopped. The second is a point out in the dark beyond it, and only
 * reaching THAT ends him. Being stuck costs him a route rather than the scene:
 * he picks another way and runs again, and he is only gone when he has run out
 * of ways, which is the honest version of giving up.
 */
const RICO_EXIT_RUN = 5.5;

function ricoBreaksFor(a, { skip = a.exitsTried ?? new Set() } = {}) {
  const exit = pickRicoExit(skip);
  a.exitOpening = null;
  a.exitsTried = skip;
  a.state = 'flee';
  a.afterGoto = 'ricoThrough';
  a.target = { ...exit };
  return exit;
}

/** Past the opening and into the dark. This leg is the one that ends him. */
function ricoRunsOut(a) {
  const from = a.target ?? { x: a.position.x, z: a.position.z, via: 'a gap you did not cover' };
  a.exitOpening = { x: from.x, z: from.z, via: from.via };
  const away = Math.hypot(from.x - pos.x, from.z - pos.z) || 1;
  a.state = 'flee';
  a.afterGoto = 'ricoGone';
  a.target = {
    x: from.x + ((from.x - pos.x) / away) * RICO_EXIT_RUN,
    z: from.z + ((from.z - pos.z) / away) * RICO_EXIT_RUN,
    via: from.via,
  };
}

// A seller who cannot reach where they were running gives up on the idea.
function actorStuck(a) {
  if (a === rico && a.state === 'flee') {
    /* A blocked step is not an exit. He loses the route and tries another;
     * only a man out of routes is a man who got away. See `ricoBreaksFor`. */
    const tried = a.exitsTried ?? new Set();
    tried.add(a.target?.via ?? '');
    const next = ricoBreaksFor(a, { skip: tried });
    if (tried.has(next.via)) ricoEscapes(a);
    return;
  }
  if (a === rico) {
    a.state = 'chase';
    a.target = null;
    return;
  }
  if (a.carryingCase) {
    a.carryingCase = false;
    dropCaseAt(a.position.x, a.position.z);
    toast('HE DROPPED IT', '', `${a.name} could not get the case out of the room`);
  }
  // A hostile wedged in the bathroom lets himself out through the door and
  // the doorway waypoint instead of hammering the wall forever.
  const bath = level.rects.BATH;
  if (a.hostile && a.position.x > bath.x0 && a.position.x < bath.x1
    && a.position.z > bath.z0 && a.position.z < bath.z1) {
    openDoor(refs.bathDoor);
    a.state = 'goto';
    a.target = { x: 3.3, z: -10.2 };
    a.afterGoto = 'chase';
    return;
  }
  a.target = null;
  a.state = a.hostile ? 'chase' : 'idle';
}

function ricoEscapes(a) {
  if (a.escaped) return;
  a.escaped = true;
  a.remove();
  const i = actors.indexOf(a);
  if (i >= 0) actors.splice(i, 1);
  S.ricoEscaped = true;
  const via = a.target?.via || 'a gap you did not cover';
  if (S.moneyTakenByRico) {
    /* Escape is not deletion. He loses the case squeezing through the opening,
     * so every checkpoint remains completable and the exact marker follows it. */
    const dropX = a.exitOpening?.x ?? a.position.x;
    const dropZ = a.exitOpening?.z ?? a.position.z;
    dropMoneyCaseAt(dropX, dropZ);
    toast('RICO GOT OUT', 'warn', `Out through ${via}. He dropped Lou's marked case at the opening`);
  } else {
    toast('RICO IS GONE', '', `Out through ${via}`);
  }
  checkRoomCleared();
}

function boardGetaway() {
  if (phase === 'drive' || phase === 'boarding' || phase === 'end') return false;
  const status = evidenceStatus();
  if (!status.complete) {
    toast(evidenceCounter(status), 'warn', evidenceMissingCopy(status));
    updateRecoveryObjective();
    return false;
  }
  phase = 'boarding';
  completeObjective('escape');
  if (S.betrayed) completeObjective('survive');
  closeInspection();
  if (S.carryingJerky || S.caseBurned || S.stashTaken || S.cratesFound) {
    // fine either way
  } else if (!S.carryingJerky) {
    S.wrongCase = true;
  }
  sfx.carDoor();
  /* The same duplication the opening had: this line is `getaway`'s prompt, so
   * saying it here made Snow ask the question twice with a four-second pause
   * in the middle. The wheel owns it. */
  setTimeout(() => { if (phase === 'boarding') openDialogue('getaway'); }, 700);
  return true;
}

// ---------- Doors ----------
function openDoor(d) {
  d.open = true;
  d.targetAngle = MOTEL_DOOR_OPEN_ANGLE;
  if (d.collider) d.collider.enabled = false;
}
function closeDoor(d) {
  d.open = false;
  d.targetAngle = 0;
  if (d.collider) d.collider.enabled = true;
}
function updateDoors(dt) {
  for (const d of [refs.frontDoor, refs.bathDoor, refs.door11, refs.officeDoor, refs.officeRearDoor]) {
    if (!d) continue;
    const t = d.targetAngle ?? (d.open ? MOTEL_DOOR_OPEN_ANGLE : 0);
    d.angle = (d.angle ?? 0) + (t - (d.angle ?? 0)) * Math.min(1, 8 * dt);
    d.pivot.rotation.y = d.angle;
  }
}

/**
 * ROOM TWELVE HAS ONE WAY IN, AND THE SCENE OWNS IT.
 *
 * Three things together, because any one of them alone leaves a hole:
 *
 *   1. Shut is solid. `level.js` builds the front door closed with its
 *      blocker live, so the lot cannot be walked out of and into the deal.
 *   2. Open is not the same as clear. Between the knock and the answered
 *      wheel Rico is standing in the opening, and `refs.roomTwelveThreshold`
 *      is his body — actors do not collide with the player in this scene, so
 *      without it the doorstep conversation is walkable-past.
 *   3. Crossing the threshold IS stepping inside, and is the only way in.
 *      Once he has moved, walking through the door runs `enterRoom()`. There
 *      is no path into that room that does not go through the state machine,
 *      and no key that opens a second one.
 */
function doorwayIsHeld() {
  return phase === 'door' && !S.doorOpened && !S.doorBroken;
}

/**
 * THE DOORWAY IS THE PROMPT.
 *
 * Owner: "The E to walk in the hotel room thing is weird -- how about you just
 * walk into it and it starts that scene? It's easy to miss and will be a scene
 * breaker for a lot of people." He is right about the failure, and the reason
 * it bites is that the scene spends the previous minute teaching the opposite:
 * the leaf is solid until the knock is answered, and Rico's body
 * (`roomTwelveThreshold`, `level.js`) fills the opening after it, so a player
 * who tries the obvious thing bounces off twice before the prompt ever lights.
 * By the time walking in is allowed, they have learned it is not.
 *
 * So the opening itself is the trigger. `x` is room twelve's authored doorway
 * -- `level.js` builds the gap at -1.1..1.0 -- with a shoulder of slack either
 * side. `z` starts just under the header: the front wall band is -4.5..-4.2,
 * so -4.3 fires as they pass beneath it rather than after their centre has
 * cleared the wall, and -5.4 is the spot `enterRoom()` already puts them.
 *
 * It cannot fire early. The gate below is `S.doorOpened`, the same flag the
 * departed [E] prompt used, and Rico is still standing in this rectangle until
 * the doorstep wheel is answered.
 */
const ROOM12_DOORWAY = Object.freeze({ x0: -1.25, x1: 1.15, z0: -5.4, z1: -4.3 });

function inRoomTwelveDoorway(x, z) {
  return x >= ROOM12_DOORWAY.x0 && x <= ROOM12_DOORWAY.x1
    && z >= ROOM12_DOORWAY.z0 && z <= ROOM12_DOORWAY.z1;
}

function updateRoomTwelveThreshold() {
  const guard = refs.roomTwelveThreshold;
  if (guard) guard.enabled = doorwayIsHeld();
}

/** Phases in which Tony has no business being inside room twelve at all. */
function beforeTheDeal() {
  return phase === 'menu' || phase === 'arrival' || phase === 'car' || phase === 'lot';
}

/**
 * Walking in is entering; being in without entering is impossible.
 *
 * The first half is the feature — the doorway is a doorway, and walking
 * through it is now the only way in; there is no key to press and none is
 * offered. The second half is the seatbelt: if a collider is ever disabled at
 * the wrong moment, or a future prop opens a hole in that wall, the player is
 * put back on the walkway instead of standing in a room whose script has not
 * started.
 */
function enforceRoomTwelveEntry(prevX, prevZ) {
  /* Walking into the opening IS stepping inside -- tested before the room
   * rectangle, not after it, so the scene starts on the door line. */
  if (phase === 'door' && S.doorOpened && inRoomTwelveDoorway(pos.x, pos.z)) {
    enterRoom();
    return;
  }
  if (!insideRoom()) return;
  if (phase === 'door' && S.doorOpened) { enterRoom(); return; }
  if (!beforeTheDeal() && phase !== 'door') return;
  const backOut = level.insideRoom12(prevX, prevZ) ? { x: 0, z: -3.4 } : { x: prevX, z: prevZ };
  pos.set(backOut.x, 0, backOut.z);
  feetY = level.floorAt(backOut.x, backOut.z, 0);
  vy = 0;
  player.group.position.set(pos.x, feetY, pos.z);
}

// ---------- Player down / captured ----------
function onProspectDown(source) {
  if (phase === 'end') return;
  if (!S.capturedOnce && (insideRoom() || phase === 'fight')) {
    S.capturedOnce = true;
    S.captured = true;
    endGrapple();
    say('*', `You go down. The lights come back on in a bathtub.`, 4);
    toast('CAPTURED', 'warn', 'Mash SPACE to get out of the bathroom');
    pos.set(4.0, 0, -14.0);
    feetY = 0;
    S.hp = 55;
    hpFillEl.style.width = '55%';
    closeDoor(refs.bathDoor);
    grapple = { actor: null, progress: 0, t: 0, captive: true };
    grappleEl.classList.add('show');
    $('grappleText').textContent = 'MASH SPACE — GET OUT OF THE TUB';
    // Whoever is left is now waiting in the room
    for (const a of actors) {
      if (a.role === 'seller' && a.alive) {
        a.state = 'guard';
        a.anchor = { x: 0, z: -8 };
      }
    }
    setObjective('recover', 'Get out of the bathroom and take the Reserve back');
    if (!S.carryingJerky && !S.caseInPool && !S.caseBurned) {
      // Whoever is still standing dragged it off; if nobody is, it is on the bed
      const holder = actors.find((a) => a.role === 'seller' && a.alive);
      if (holder) {
        holder.carryingCase = false;
        dropCaseAt(holder.position.x + 1.2, holder.position.z);
      }
    }
  } else {
    // Outside, or a second time: you wake up in the lot with sirens closer
    S.hp = 45;
    hpFillEl.style.width = '45%';
    S.policeHeat += 25;
    invuln = 3;
    pos.set(-4, 0, 10);
    feetY = 0;
    say('*', 'You come to face down on warm concrete. Somewhere a siren is getting interested.', 4.4);
    toast('DOWN, NOT OUT', 'warn', 'Police attention is climbing');
    sfx.siren(false);
  }
}

// ---------- Movement / camera ----------
const _move = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function computeMove() {
  let f = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
  let r = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  if (touch.active) { f += -touch.y; r += touch.x; }
  _move.set(0, 0, 0);
  if (f === 0 && r === 0) return _move;
  _fwd.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  _right.crossVectors(_fwd, UP);
  _move.addScaledVector(_fwd, f).addScaledVector(_right, r);
  if (_move.lengthSq() > 1) _move.normalize();
  return _move;
}

// What a pair of feet is standing on, for player and positional NPC steps.
function surfaceAtFoot(x, z, y = 0) {
  const r = level.rects;
  if (y < -1) return 'pool';
  if (x > r.BATH.x0 && x < r.BATH.x1 && z > r.BATH.z0 && z < r.BATH.z1) return 'tile';
  if (level.insideRoom12(x, z)) return 'carpet';
  if (x > r.ROOM11.x0 && x < r.ROOM11.x1 && z > r.ROOM11.z0 && z < r.ROOM11.z1) return 'carpet';
  if (y > 0.6) return 'stairs';
  if (z > 0 && z < 26) return 'asphalt';
  return 'concrete';
}

function surfaceUnderfoot() {
  return surfaceAtFoot(pos.x, pos.z, feetY);
}

function tryJump() {
  if (grapple || phase === 'arrival' || phase === 'car' || phase === 'menu' || phase === 'drive') return;
  const ground = level.floorAt(pos.x, pos.z, feetY);
  if (Math.abs(feetY - ground) < 0.12) {
    vy = JUMP_V;
    sfx.land(false);
  }
}

function updatePlayer(dt) {
  if (phase === 'arrival' || phase === 'car') {
    syncArrivalSeats();
    player.group.scale.setScalar(PLAYER_SEATED_SCALE);
    player.legL.rotation.x = -1.15;
    player.legR.rotation.x = -1.15;
    player.armL.rotation.x = -0.55;
    player.armR.rotation.x = -0.55;
    player.head.rotation.set(0, 0, 0);
    return;
  }
  if (phase === 'boarding') {
    pos.set(-6.9, 0, 16.4);
    player.group.position.set(pos.x, 0.55, pos.z);
    player.group.rotation.y = Math.PI;
    return;
  }
  if (grapple || stunT > 0) {
    stunT = Math.max(0, stunT - dt);
    player.update(dt, _move.set(0, 0, 0), 0);
    player.group.position.set(pos.x, feetY, pos.z);
    return;
  }

  const move = computeMove();
  playerMoving = move.lengthSq() > 0.02;
  const sprinting = keys.has('sprint') || (touch.active && Math.hypot(touch.x, touch.y) > 0.9);
  let speed = sprinting ? RUN : WALK;
  if (S.carryingJerky) speed *= 0.92;
  if (blindT > 0) speed *= 0.6;

  const prevX = pos.x;
  const prevZ = pos.z;
  player.group.position.set(pos.x, 0, pos.z);
  player.update(dt, move, speed, sprinting, () => {
    /* Holding movement while pressing Q used to stack Person's immediate
     * first footfall on top of the full-gain door sample. That pair, not a
     * collision, was the metallic scrape heard on vehicle exit. */
    if (performance.now() < playerFootstepReadyAt) return;
    sfx.step(surfaceUnderfoot(), { sourceId: 'player', running: sprinting });
  });
  const bob = player.group.position.y;
  let nx = player.group.position.x;
  let nz = player.group.position.z;

  // Resolve horizontally, one axis at a time so you slide along walls
  if (blocked(nx, prevZ, feetY)) nx = prevX;
  if (blocked(nx, nz, feetY)) nz = prevZ;
  pos.x = THREE.MathUtils.clamp(nx, BOUNDS.x0 + 1, BOUNDS.x1 - 1);
  pos.z = THREE.MathUtils.clamp(nz, BOUNDS.z0 + 1, BOUNDS.z1 - 1);

  // Gravity + floors
  const ground = level.floorAt(pos.x, pos.z, feetY);
  if (feetY > ground + 0.02 || vy > 0) {
    vy -= GRAVITY * dt;
    feetY += vy * dt;
    if (feetY <= ground) {
      if (vy < -5) sfx.land(vy < -13);
      if (vy < -15) {
        damagePlayer(Math.min(28, (-vy - 15) * 2.4), 'the fall');
        shake = Math.max(shake, 0.5);
      }
      feetY = ground;
      vy = 0;
    }
  } else {
    feetY = ground;
    vy = 0;
  }

  player.group.position.set(pos.x, feetY + bob, pos.z);
  enforceRoomTwelveEntry(prevX, prevZ);

  // Trip hazard: the vacuum-sealer cord catches enemies, not you
  if (S.cordArmed) {
    for (const a of actors) {
      if (!a.alive || !a.hostile || a.stunT > 0) continue;
      if (Math.abs(a.position.x - refs.sealer.x) < 1.2 && a.position.z > -14.8 && a.position.z < -12.4) {
        a.stunT = 1.8;
        sfx.bodyFall();
        toast('TRIPPED', '', `${a.name} found the cord`);
      }
    }
  }
}

const _camPos = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _listenerForward = new THREE.Vector3();

function syncListenerPose() {
  camera.getWorldDirection(_listenerForward);
  sfx.setListenerPose(camera.position, _listenerForward);
}

function updateCamera(dt) {
  if (keys.has('turnL')) camYaw += dt * 2.2;
  if (keys.has('turnR')) camYaw -= dt * 2.2;
  if (keys.has('lookU')) camPitch = Math.min(0.5, camPitch + dt * 1.2);
  if (keys.has('lookD')) camPitch = Math.max(-0.85, camPitch - dt * 1.2);

  if (phase === 'arrival' && arrivalCameraMode === 'exterior') {
    camera.position.copy(refs.manCar.exteriorCameraPosition());
    camera.lookAt(refs.manCar.cabinCenterPosition());
    player.group.visible = true;
    refs.moon.position.set(pos.x - 40, 60, pos.z + 35);
    refs.moon.target.position.set(pos.x, 0, pos.z);
    return;
  }

  const dirX = Math.sin(camYaw) * Math.cos(camPitch);
  const dirZ = Math.cos(camYaw) * Math.cos(camPitch);
  const dirY = Math.sin(camPitch);
  const seatedInArrivalCar = phase === 'arrival' || phase === 'car';
  const bodyBob = seatedInArrivalCar || phase === 'boarding'
    ? 0
    : Math.max(-0.06, Math.min(0.08, player.group.position.y - feetY));
  const passengerEye = seatedInArrivalCar
    ? refs.manCar.occupants.worldPoint('passengerEye', null, _camPos)
    : null;
  const eyeY = (passengerEye?.y
    ?? (phase === 'boarding' ? 1.55 : feetY + PLAYER_EYE)) + bodyBob * 0.45;

  // Motel play is first-person in every walkable phase. The old trailing
  // camera repeatedly wedged Tony's body between the lens, room furniture,
  // and doors, making the already-dense room unreadable.
  if (passengerEye) _camPos.copy(passengerEye);
  else _camPos.set(pos.x, eyeY, pos.z);
  camera.position.copy(_camPos);
  player.group.visible = false;

  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.6);
    const felt = shake * shakeScale();
    camera.position.x += (Math.random() - 0.5) * felt;
    camera.position.y += (Math.random() - 0.5) * felt * 0.6;
    camera.position.z += (Math.random() - 0.5) * felt;
  }

  _lookAt.set(
    pos.x + dirX * 8,
    eyeY + dirY * 8,
    pos.z + dirZ * 8,
  );
  camera.lookAt(_lookAt);

  refs.moon.position.set(pos.x - 40, 60, pos.z + 35);
  refs.moon.target.position.set(pos.x, 0, pos.z);
}

function insideRoom() {
  return level.insideRoom12(pos.x, pos.z);
}

// ---------- Interaction prompt ----------
let activeInteract = null;

function updateInteract() {
  activeInteract = null;
  if (phase === 'menu' || phase === 'arrival' || phase === 'end' || phase === 'drive' || phase === 'boarding' || grapple) {
    motelPrompt.hidePrompt();
    return;
  }
  const facing = {
    x: Math.sin(camYaw) * Math.cos(camPitch),
    y: Math.sin(camPitch),
    z: Math.cos(camYaw) * Math.cos(camPitch),
  };
  const playerInteractionY = feetY + 1.4;
  const aimEyeY = phase === 'car' || phase === 'boarding' ? 1.55 : feetY + PLAYER_EYE;
  const candidates = [];
  for (const it of interactables) {
    if (it.enabled && !it.enabled()) continue;
    const p = it.follow ? it.follow() : it;
    if (!p) continue;
    const dx = p.x - pos.x;
    const dz = p.z - pos.z;
    const targetY = Number.isFinite(p.y) ? p.y : playerInteractionY;
    const d = Math.hypot(dx, dz, targetY - playerInteractionY);
    if (d > (it.r || 3.2)) continue;
    /* The Motel predates core/InteractionSystem and stores authored prompt
     * points rather than raycast meshes. Keep its adapter on the same physical
     * contract: prompts are three-dimensional and solid level colliders
     * occlude them. Endpoint hits at >= .95 are the door/prop itself; an
     * earlier hit is a wall between Tony and the target. */
    if (segmentBlocked(
      pos.x, pos.z, playerInteractionY,
      p.x, p.z, targetY,
    ) < 0.95) continue;
    candidates.push({
      id: it.id,
      point: { x: p.x, y: targetY, z: p.z },
      r: it.r,
      distance: d,
      requiresAim: it.requiresAim,
      minDot: it.minDot,
      /* Three prompts share one small table -- their sample, their case and
       * yours -- so priority is allowed to be a function of the deal. The step
       * the room is actually asking for wins the tie; aiming at one of the
       * others still picks it. Before this, `sample` and `placeMoney` sat on
       * the same authored point with the same radius and `sample` was declared
       * first, which meant the winner was decided by array order and putting
       * your case on the table could not be selected at all. */
      priority: typeof it.priority === 'function' ? it.priority() : it.priority,
      interact: it,
    });
  }
  const best = selectPointInteraction({
    eye: { x: pos.x, y: aimEyeY, z: pos.z },
    facing,
    targets: candidates,
  })?.interact ?? null;
  activeInteract = best;
  if (best) motelPrompt.showPrompt(best.label(), 'E');
  else motelPrompt.hidePrompt();
}

function onUse() {
  if (phase === 'menu' || paused) return;
  if (phase === 'drive') { ramPursuer(); return; }
  if (inspecting) { closeInspection(); return; }
  if (grapple) { mashGrapple(); return; }
  if (activeInteract) {
    activeInteract.act();
    updateInteract();
  }
}

// ---------- What Tony is holding, from Tony's eyes ----------
// The apartment already does this: the camera goes into the scene graph and
// the held item hangs off the camera, so it rides the view for free. The motel
// is first person in every walkable phase and showed nothing at all in his
// hands, which made an equipped revolver a line of HUD text and not a gun.
//
// TWO KINDS OF THING GO IN THAT HAND, and they are held by different owners.
//
//   The .45 comes off the shared rack. `WeaponSystem` mounts it on its own rig
//   on this camera, at the hold pose it uses in the siege and the Palace, and
//   owns everything about it that a gun does: the six rounds visible in the
//   cylinder, the muzzle flash, the recoil kick, the brass, the two-phase
//   reload and the five recordings. Nothing about it is authored here.
//
//   Everything else in this scene is a cleaver, a crowbar or a lamp. Those are
//   Motel props with no catalog entry and no ammunition, and `viewmodel` below
//   is still what holds them.
//
// `heldKind()` is the one answer to "what is in his hand" for both.

scene.add(camera);
const viewmodel = new THREE.Group();
viewmodel.visible = false;
camera.add(viewmodel);

/* Built after the prop group, so the Motel's own view model stays the first
 * Group on the camera and nothing that walks `camera.children` shifts under
 * this change. */
const weapons = new WeaponSystem({
  camera,
  world: scene,
  audio: motelWeaponAudio,
  groundAt: (x, z) => level.floorAt(x, z, 0),
  /* Deliberately empty. `WeaponSystem` casts against world geometry to place
   * impacts, and this scene already answers that question its own way — with
   * `segmentBlocked` against the level's boxes and `Actor.damage` against a
   * roster the shared system is not allowed to know about. Handing it the
   * whole graph would resolve every round twice. */
  hitTargets: [],
  range: WEAPON_STATS.revolver.reach,
});
/* Six in the wheel and twelve loose in a coat pocket. The catalog's thirty-six
 * is an armory number, and this is a man with a glovebox. */
weapons.firearm(WEAPON_IDS.REVOLVER).reserve = 12;

/* The lot is lit for a parking lot at night, and the catalog's PBR metals go
 * near-black with no environment map — the Squatchfather's prospect hit the
 * same wall and re-materialed the same gun for its own lighting. Here it gets
 * the trick the Motel's own prop view model already uses: a faint self-glow,
 * cloned scene-side per mesh, so what he is holding reads at the lens without
 * putting light on the motel. `src/core/weapons/` is untouched. */
weapons.modelFor(WEAPON_IDS.REVOLVER).traverse((node) => {
  if (!node.isMesh) return;
  node.castShadow = false;
  node.receiveShadow = false;
  node.material = node.material.clone();
  if (node.material.emissive) {
    node.material.emissive.copy(node.material.color).multiplyScalar(0.55);
  }
});

/** The catalog id behind a Motel weapon name, or null if it is a prop. */
function sharedWeaponId(kind) {
  return (kind && WEAPON_STATS[kind]?.shared) || null;
}

/** The number every player-facing firearm readout uses. Shared guns read the
 * Firearm directly; `S.ammo` remains only the local pool for Motel props such
 * as the Commander. Firing, dry-fire, flash, recoil, reload and HUD therefore
 * all resolve the revolver against the same six chambers. */
function authoritativeAmmo(kind = S.weapon) {
  const shared = sharedWeaponId(kind);
  return shared ? weapons.firearm(shared).rounds : S.ammo;
}

/**
 * What is in Tony's hand right now, shared or improvised, or null.
 *
 * A holstered gun is a gun he HAS and is not HOLDING: the shared rack stows
 * it, the lens shows nothing, and `dealSealed()` will not let it fire. One
 * answer for the view model, the HUD and the trigger, so they cannot disagree
 * about whether he is armed.
 */
function heldKind() {
  if (S.holstered) return null;
  return S.weapon && S.weapon !== 'fists' ? S.weapon : null;
}

/** The Object3D actually being drawn at the lens, or null. */
function heldModel() {
  const kind = heldKind();
  if (!kind) return null;
  return sharedWeaponId(kind) ? weapons.model : (viewmodel.children[0] ?? null);
}

/** Phases where a held thing belongs on screen at all. */
function viewmodelShown() {
  return phase !== 'menu' && phase !== 'end'
    && phase !== 'drive' && phase !== 'boarding' && !inspecting;
}

let viewmodelKind = null;
let viewSway = 0;
let carrySway = 0;
/* Low and to the right, close enough to read and far enough not to own the
 * screen. Half a metre out at a 62 degree lens is about a third of the frame. */
const _viewRest = new THREE.Vector3(0.175, -0.145, -0.40);
const _viewBox = new THREE.Box3();
const _viewCentre = new THREE.Vector3();

function updateViewmodel() {
  const held = heldKind();
  const sharedId = sharedWeaponId(held);
  /* The shared rack first: give it the gun or take it back, and let it decide
   * everything about how the gun looks. */
  if (sharedId) weapons.equip(sharedId);
  else weapons.stow({ silent: true });
  weapons.rig.visible = !!sharedId && viewmodelShown();

  const kind = sharedId ? null : held;
  if (kind !== viewmodelKind) {
    viewmodelKind = kind;
    viewmodel.clear();
    viewmodel.userData.equippedWeapon = null;
    if (kind) {
      const mesh = buildWeaponMesh(kind);
      mesh.userData.presentation = 'first-person-equipped';
      mesh.userData.weaponKind = kind;
      /* The world meshes are built to sit in somebody's fist at arm's length.
       * Held against the lens they want turning muzzle-forward, scaling down,
       * and re-centring on their own bounding box — the builders put their
       * origins wherever the hand was, which off screen is nowhere useful. */
      mesh.rotation.set(Math.PI / 2, 0, 0.12);
      mesh.scale.setScalar(0.42);
      mesh.updateMatrixWorld(true);
      _viewBox.setFromObject(mesh);
      mesh.position.sub(_viewBox.getCenter(_viewCentre));
      mesh.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.receiveShadow = false;
        /* The lot is lit for a parking lot at night, which leaves anything
         * held at the lens as a silhouette. Its own faint glow lets him see
         * what he is holding without putting light on the motel. */
        o.material = o.material.clone();
        if (o.material.emissive) {
          o.material.emissive.copy(o.material.color).multiplyScalar(0.55);
        }
      });
      viewmodel.add(mesh);
      viewmodel.userData.equippedWeapon = kind;
    }
  }
  viewmodel.visible = !!kind && viewmodelShown();
}

/* ---- Tony's own case, in Tony's own hands ----------------------------- *
 *
 * A suitcase is neither a catalog weapon nor a Motel prop, so it rides its own
 * group rather than borrowing `viewmodel` -- which means the case and a gun can
 * never end up fighting for the same corner of the lens, and the arrival
 * sequence can hand him the case without touching `S.weapon` at all.
 *
 * It is carried SHUT. What is inside it is between Tony and Lou until the deal
 * says otherwise, and the packs are hidden for the same reason. */
const carryRig = new THREE.Group();
carryRig.visible = false;
camera.add(carryRig);
let carryModel = null;

function updateCarryRig() {
  const show = S.caseHeld && !S.caseDown && viewmodelShown();
  if (show && !carryModel) {
    const built = makeCarryCase(0x3a2a1a);
    built.lid.rotation.x = 0;
    for (const pack of built.packs) pack.mesh.visible = false;
    built.group.scale.setScalar(0.26);
    built.group.position.set(0.02, -0.30, -0.52);
    built.group.rotation.set(0.20, 0.34, 0.06);
    built.group.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = false;
      /* Same trick the gun and the props use: a faint self-glow so the thing
       * in his hands reads at a parking lot at night without lighting the lot. */
      node.material = node.material.clone();
      if (node.material.emissive) {
        node.material.emissive.copy(node.material.color).multiplyScalar(0.5);
      }
    });
    carryModel = built.group;
    carryRig.add(carryModel);
  }
  carryRig.visible = show;
}

/** A little weight on the end of his arm: bob while walking, lag while turning. */
function updateViewmodelSway(dt, moving) {
  if (carryRig.visible) {
    /* Forty thousand dollars in a hard case is heavier than a revolver, so it
     * swings slower and further. Same clock, different weight. */
    carrySway += dt * (moving ? 6.5 : 1.6);
    carryRig.position.set(
      Math.sin(carrySway * 0.5) * (moving ? 0.016 : 0.005),
      Math.abs(Math.sin(carrySway)) * (moving ? 0.018 : 0.005),
      0,
    );
    carryRig.rotation.set(
      Math.sin(carrySway * 0.5) * 0.024,
      Math.sin(carrySway * 0.31) * 0.018,
      Math.sin(carrySway * 0.5) * 0.03,
    );
  }
  if (!viewmodel.visible) return;
  viewSway += dt * (moving ? 9 : 2.2);
  const bob = moving ? 0.012 : 0.004;
  viewmodel.position.set(
    _viewRest.x + Math.sin(viewSway * 0.5) * bob * 1.4,
    _viewRest.y + Math.abs(Math.sin(viewSway)) * bob,
    _viewRest.z,
  );
  viewmodel.rotation.set(
    Math.sin(viewSway * 0.5) * 0.02,
    Math.sin(viewSway * 0.37) * 0.03,
    Math.sin(viewSway * 0.5) * 0.02,
  );
}

// ---------- Gear + inventory HUD ----------

const CAMPAIGN_ITEM_LABELS = { [ITEM_IDS.LOU_PACKAGE]: "Lou's package" };

/**
 * Everything Tony has on him right now, scene props and campaign items alike.
 *
 * The scene tracks its own cargo in `S`; the campaign tracks anything that
 * outlives the night. Both belong on the same list, because from the player's
 * side of the screen there is no difference between the two.
 */
function inventoryItems() {
  const items = [];
  const weapon = WEAPON_STATS[S.weapon] || WEAPON_STATS.fists;
  if (S.weapon && S.weapon !== 'fists') {
    /* A holstered gun is on the bar but is NOT the selected slot -- the case
     * is what is in his hands. Two items both claiming to be selected put the
     * highlight on the wrong one, which is the inventory fight this whole pass
     * exists to remove. */
    items.push({
      id: `weapon:${S.weapon}`,
      icon: weapon.ammo ? '🔫' : '🔧',
      text: `${weapon.name} · ${S.holstered ? 'PUT AWAY' : 'EQUIPPED'}`
        + `${weapon.ammo ? ` · ${authoritativeAmmo()}/${weapon.ammo}` : ''}`,
      dim: S.holstered,
      selected: !S.holstered,
    });
  }
  if (S.carryingMoney && !S.couponOnly) {
    /* One item, three states, so the bar always says where the case is rather
     * than only that it exists: in his hands, resting on the table, or gone. */
    items.push({
      id: 'money',
      icon: '💼',
      text: S.caseDown ? '$40,000, shut · on the table' : '$40,000, mostly',
      selected: S.caseHeld && !S.caseDown,
    });
  }
  if (S.couponOnly) items.push({ id: 'coupon', icon: '🎟️', text: 'One expired steakhouse coupon' });
  if (S.carryingJerky) {
    items.push({
      id: 'reserve',
      icon: '🥩',
      text: `The Reserve · ${S.packagesIntact}/8 intact`,
      dim: S.packagesIntact < 8,
    });
  }
  if (S.stashTaken) items.push({ id: 'stash', icon: '📦', text: "Rico's premium stash" });
  if (S.wrongCase) items.push({ id: 'wrong', icon: '🦃', text: 'A case of warm smoked turkey', dim: true });
  for (const id of campaign.state.inventory.carried) {
    items.push({ id: `carry:${id}`, icon: '🎁', text: CAMPAIGN_ITEM_LABELS[id] || id });
  }
  for (const id of campaign.state.inventory.concealed) {
    items.push({ id: `hide:${id}`, icon: '🧥', text: `${CAMPAIGN_ITEM_LABELS[id] || id} (concealed)`, dim: true });
  }
  return items;
}

let packShown = new Set();
function renderInventory() {
  const items = inventoryItems();
  /* Whatever is in his hands is the selected slot on the bar. The scene, not
   * the player, decides that -- there is no slot cycling in this room -- so the
   * bar and the lens can never disagree about what he is carrying. */
  const held = items.findIndex((item) => item.selected);
  sceneInventory.set(
    items.map((item) => ({ icon: item.icon, label: item.text })),
    held < 0 ? 0 : held,
  );
  packBoxEl.classList.toggle('empty', items.length === 0);
  packListEl.innerHTML = items.map((item) => {
    const fresh = packShown.has(item.id) ? '' : ' new';
    return `<div class="item${item.dim ? ' dim' : ''}${item.selected ? ' equipped' : ''}${fresh}">`
      + `<span class="tag">${item.icon}</span> ${item.text}</div>`;
  }).join('');
  packShown = new Set(items.map((item) => item.id));
}

function updateGear() {
  const st = WEAPON_STATS[S.weapon] || WEAPON_STATS.fists;
  const armed = S.weapon !== 'fists';
  /* The gear box is where a player looks to answer "can I shoot yet". While
   * the deal is sealed it says so in those words, next to the gun he is
   * carrying but not holding, and it changes the instant `releaseWeapon` runs. */
  if (S.caseHeld && !S.caseDown) {
    /* What is in his hands wins the name line, whatever else he is carrying. */
    weaponNameEl.textContent = "Lou's case";
    weaponSubEl.textContent = armed && S.holstered
      ? `BOTH HANDS · $40,000, shut · ${st.name} put away`
      : 'BOTH HANDS · $40,000, shut';
  } else if (armed && S.holstered) {
    weaponNameEl.textContent = `${st.name} · PUT AWAY`;
    weaponSubEl.textContent = 'CARRIED, NOT DRAWN · the deal comes first';
  } else {
    weaponNameEl.textContent = st.name + (st.ammo ? ` · ${authoritativeAmmo()}/${st.ammo}` : '');
    weaponSubEl.textContent = `EQUIPPED · ${st.improvised === false ? 'seized' : 'improvised'} · ${st.lethal ? 'lethal' : 'non-lethal'}`;
  }
  const carry = [];
  if (S.carryingMoney) carry.push(S.caseDown ? '💼 $40,000 on the table' : '💼 $40,000');
  if (S.couponOnly) carry.push('🎟️ one expired coupon');
  if (S.carryingJerky) carry.push(`🥩 The Reserve ${S.packagesIntact}/8`);
  if (S.stashTaken) carry.push('📦 premium stash');
  carryLineEl.textContent = carry.join('  ·  ');
  renderInventory();
  updateViewmodel();
  updateCarryRig();
}

// ---------- The drive ----------
const drive = {
  scene: null, car: null, road: [], hostiles: [], traffic: [],
  x: 0, speed: 30, dist: 0, target: 1500, t: 0, snowBiteT: 8, spawnT: 1.5,
};

function buildDriveScene() {
  const built = buildMotelDriveScene();
  drive.scene = built.scene;
  drive.car = built.car;
  drive.road = built.road;
  return drive.scene;
}

function startDrive() {
  if (!drive.scene) buildDriveScene();
  phase = 'drive';
  driveHudEl.classList.add('show');
  metersEl.classList.remove('show');
  sfx.setMusic('chase');
  sfx.carStart();
  sfx.tires();
  drive.dist = 0;
  drive.t = 0;
  drive.x = 0;
  drive.speed = 30;
  camera.fov = 70;
  camera.updateProjectionMatrix();
  setObjective('escape', S.snowInjured ? 'Snow is hurt — you are driving' : 'Get to the Sasquatch safehouse');
  say(S.snowInjured ? 'Prospect' : ALLY,
    S.snowInjured ? 'Hold the case. I am driving.' : 'Seatbelt. Or do not.',
    3.6, cueFor(S.snowInjured ? 'Prospect' : ALLY, 'drivestart'));
  if (S.windowBroken) toast('BROKEN WINDOW', 'warn', 'Warm air over the shipment all the way home');
}

function updateDrive(dt) {
  drive.t += dt;
  const steer = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0) + (touch.active ? touch.x : 0);
  const accel = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0) + (touch.active ? -touch.y * 0.6 : 0);
  drive.speed = THREE.MathUtils.clamp(drive.speed + accel * 14 * dt, 14, 52);
  drive.x = THREE.MathUtils.clamp(drive.x + steer * 13 * dt, -8.4, 8.4);
  drive.dist += drive.speed * dt;
  sfx.setEngineSpeed((drive.speed - 14) / 38);

  drive.car.position.set(drive.x, 0, 0);
  drive.car.rotation.y = -steer * 0.12;
  drive.car.rotation.z = steer * 0.05;

  // Scroll the road
  for (const r of drive.road) {
    r.z += drive.speed * dt;
    if (r.z > 40) r.z -= 24 * 50;
    for (const m of [r.seg, r.dash, r.palmL, r.lamp, r.pole, r.lampL, r.poleL]) m.position.z = r.z;
  }

  // Spawn traffic and pursuers
  drive.spawnT -= dt;
  if (drive.spawnT <= 0) {
    drive.spawnT = 1.4 + Math.random() * 1.4;
    const hostile = drive.hostiles.length < 2 && Math.random() < 0.5;
    const car = buildMotelDriveCar(hostile ? 0x2f3a6b : [0x8a8a92, 0x3f5f3a, 0x6a5a3a][Math.floor(Math.random() * 3)]);
    // Pursuers come up from behind; everyone else is oncoming traffic
    car.position.set((Math.random() - 0.5) * 15, 0, hostile ? 90 : -180);
    car.userData = {
      ...car.userData,
      hostile,
      speed: hostile ? drive.speed + 9 : 12 + Math.random() * 10,
      hp: 2,
    };
    drive.scene.add(car);
    (hostile ? drive.hostiles : drive.traffic).push(car);
  }

  const advance = (list) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      // Oncoming traffic drives toward the player while the road scrolls under
      // both, so closure is the sum of the speeds, not the difference.
      const rel = c.userData.hostile
        ? drive.speed - c.userData.speed
        : drive.speed + c.userData.speed;
      c.position.z += rel * dt;
      if (c.userData.hostile) {
        // pursuers close in and try to line up a ram
        c.position.x += THREE.MathUtils.clamp(drive.x - c.position.x, -1, 1) * 3.4 * dt;
      }
      if (c.position.z > 110 || c.position.z < -200) {
        drive.scene.remove(c);
        list.splice(i, 1);
        continue;
      }
      if (Math.abs(c.position.z) < 3.6 && Math.abs(c.position.x - drive.x) < 2.1) {
        drive.scene.remove(c);
        list.splice(i, 1);
        onDriveCrash(c.userData.hostile);
      }
    }
  };
  advance(drive.traffic);
  advance(drive.hostiles);

  // A pursuer alongside can be answered with the whole car
  const alongside = drive.hostiles.find((c) => Math.abs(c.position.z) < 12 && Math.abs(c.position.x - drive.x) < 5.5);
  drive.ramTarget = alongside || null;
  if (alongside) {
    motelPrompt.showPrompt(S.snowInjured ? 'Put them into the guardrail' : 'Tell Snow to ram them', 'E');
  } else {
    motelPrompt.hidePrompt();
  }

  // Snow helps himself to the evidence
  drive.snowBiteT -= dt;
  if (drive.snowBiteT <= 0 && !S.snowInjured && S.carryingJerky) {
    drive.snowBiteT = 11 + Math.random() * 8;
    freshness.damage(4, 'Snow "checking quality"');
    sfx.chew();
    const qualityHold = say(ALLY, 'Checking quality.', 3, cueFor(ALLY, 'bite'));
    afterLine(qualityHold, () => {
      if (phase === 'drive') say('Prospect', 'Stop eating the shipment!', 3, cueFor('Prospect', 'bite'));
    });
  }

  if (S.windowBroken) freshness.damage(dt * 0.55, 'wind over the packages');
  S.policeHeat = Math.max(0, S.policeHeat - dt * 1.6);
  if (S.policeHeat > 80 && !S.policeArrived) {
    S.policeArrived = true;
    failObjective('unseen');
    sfx.siren(false);
    toast('POLICE', 'warn', 'Lights behind you. Lose them.');
  }

  // Keep the getaway in first person as well. Tony rides on the passenger
  // side unless Snow is injured and Tony has to take the wheel.
  const seatX = S.snowInjured ? -0.42 : 0.42;
  /* Eye height above the dash, which is where a driver's eyes are. At the old
   * 1.62 the camera sat level with the middle of the dashboard, so once the
   * cockpit was facing the right way the dash filled the centre of the frame
   * and the floor pan filled the bottom. Aimed down the road, not at the sky. */
  camera.position.set(drive.x + seatX, 1.86, 0.3);
  camera.lookAt(drive.x + seatX - steer * 0.8, 0.75, -16);
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.8);
    const felt = shake * shakeScale();
    camera.position.x += (Math.random() - 0.5) * felt;
    camera.position.y += (Math.random() - 0.5) * felt;
  }

  // HUD
  $('freshPct').textContent = `${Math.round(freshness.value)}%`;
  $('freshFill').style.width = `${freshness.value}%`;
  $('policePct').textContent = `${Math.round(S.policeHeat)}%`;
  $('policeFill').style.width = `${Math.min(100, S.policeHeat)}%`;
  const pct = Math.min(100, (drive.dist / drive.target) * 100);
  $('distPct').textContent = `${Math.round(pct)}%`;
  $('distFill').style.width = `${pct}%`;

  if (drive.dist >= drive.target) finishScene('home');
}

function ramPursuer() {
  const c = drive.ramTarget;
  if (!c) return;
  drive.scene.remove(c);
  const i = drive.hostiles.indexOf(c);
  if (i >= 0) drive.hostiles.splice(i, 1);
  drive.ramTarget = null;
  sfx.crash();
  sfx.tires();
  shake = Math.max(shake, 0.7);
  freshness.damage(5, 'ramming a car off the road');
  drive.speed = Math.max(16, drive.speed - 6);
  toast('OFF THE ROAD', '', S.snowInjured ? 'You put them into the guardrail' : 'Snow put them into the guardrail');
  say(S.snowInjured ? 'Prospect' : ALLY,
    S.snowInjured ? 'Stay down.' : 'That was my door.',
    2.8, cueFor(S.snowInjured ? 'Prospect' : ALLY, 'ram'));
}

function onDriveCrash(hostile) {
  sfx.crash();
  shake = Math.max(shake, 0.8);
  drive.speed = Math.max(14, drive.speed - 12);
  freshness.damage(hostile ? 14 : 9, hostile ? 'being rammed' : 'a crash');
  damagePackages(1, 'a crash');
  S.policeHeat += hostile ? 6 : 10;
  damagePlayer(hostile ? 8 : 5, 'the crash');
  toast(hostile ? 'RAMMED' : 'CRASH', 'warn', `Freshness ${Math.round(freshness.value)}%`);
}

// ---------- Ending ----------
function showEnding(kind) {
  const lines = [];
  const haul = S.carryingJerky || S.stashTaken || S.cratesFound;

  if (S.caseBurned) {
    $('endKicker').textContent = 'MISSION COMPLETE · SCORCHED EARTH';
    $('endTitle').textContent = 'WELL DONE';
  } else if (!haul) {
    $('endKicker').textContent = 'MISSION COMPLETE · EMPTY HANDED';
    $('endTitle').textContent = 'NO RESERVE';
  } else if (kind === 'walked') {
    $('endKicker').textContent = 'SCENE ABANDONED';
    $('endTitle').textContent = 'YOU WALKED';
  } else {
    $('endKicker').textContent = 'MISSION COMPLETE';
    $('endTitle').textContent = 'THE JERKY MOTEL';
  }

  // Final exchange
  if (kind === 'home') {
    lines.push(['*', 'The vehicle disappears down the road. Snow looks at the damaged suitcase.']);
    lines.push(ENDING[0]);
    if (haul) {
      const intact = S.stashTaken || S.cratesFound ? Math.max(3, S.packagesIntact) : S.packagesIntact;
      lines.push(['*', `Prospect opens the case. Inside are ${intact === 0 ? 'no' : intact} intact strip${intact === 1 ? '' : 's'} of rare jerky${S.couponOnly ? ' and the expired steakhouse coupon' : ''}.`]);
      lines.push(['*', 'Prospect takes one strip, studies it, and bites. A long pause.']);
      lines.push(ENDING[2]);
      if (shipment.grade === 'counterfeit' && !inspection.correct()) {
        lines.push(['Prospect', 'This is gas-station product.']);
        lines.push(['Snow', 'We paid forty thousand dollars for gas-station product.']);
        lines.push(['*', 'This will follow Prospect around for a long time.']);
      } else {
        lines.push(ENDING[3]);
      }
    } else {
      lines.push(['Prospect', 'It survived the way a rumour survives.']);
      if (S.wrongCase) lines.push(['Snow', 'I grabbed a case. It is full of smoked turkey. It is warm.']);
    }
  } else if (kind === 'walked') {
    lines.push(['Snow', 'Good. Best deal we ever made was the one we did not.']);
  }

  $('endLines').innerHTML = lines.map(([who, line]) =>
    who === '*'
      ? `<div class="stage">${line}</div>`
      : `<div><span class="who${who === 'Prospect' ? ' prospect' : ''}">${who}</span> — ${line}</div>`
  ).join('');
  playEndingVoices(lines);

  // Achievements
  if (haul && S.packagesIntact >= 8 && freshness.value > 0) award('rareform');
  if (S.lethalKills === 0) award('nobeef');
  if (S.packagesIntact >= 8) completeObjective('intact');
  if (!S.policeArrived && S.policeHeat < 60) completeObjective('unseen');
  if (!S.firedWeapon) completeObjective('noshot');
  if (S.moneyRecovered) completeObjective('money');

  const truth = shipment.grade === 'genuine' ? 'genuine Reserve'
    : shipment.grade === 'partial' ? `part Reserve, part gas-station (${shipment.fakeCount} of 8 fake)`
      : 'entirely counterfeit';

  $('endStats').innerHTML =
    `<span class="big">${haul ? `${S.packagesIntact}/8 packages` : 'NOTHING'}</span>` +
    `The shipment was <b>${truth}</b>.<br>` +
    `Freshness on arrival: <b>${Math.round(freshness.value)}% — ${freshness.grade}</b><br>` +
    `Warning signs found: <b>${S.cluesFound.size} / ${Object.keys(CLUES).length}</b> · ` +
    `Police attention: <b>${Math.round(S.policeHeat)}%</b> · Killed: <b>${S.lethalKills}</b>`;

  $('endObjectives').innerHTML =
    '<h3>OBJECTIVES</h3>' +
    OBJECTIVES.main.concat(OBJECTIVES.opt).map((o) => {
      const state = objDone.has(o.id) ? '✔' : objFailed.has(o.id) ? '✘' : '–';
      const color = objDone.has(o.id) ? '#7dffb0' : objFailed.has(o.id) ? '#ff8a8a' : '#8d97ab';
      return `<div style="color:${color}">${state} ${o.text}</div>`;
    }).join('');

  const notes = [];
  notes.push(`Evidence: ${{
    ice: 'hidden in the ice machine', vending: 'in the vending machine', pool: 'at the bottom of the pool',
    rico: 'planted on Rico', room: 'left in room twelve', ground: 'dropped in the open',
  }[S.evidenceChoice] || (S.weapon !== 'fists' ? 'still in your hand' : 'you never picked anything up')}.`);
  if (S.ricoEscaped) notes.push('Rico got out of the building. He has a face you will see again.');
  if (S.betrayedAlly) notes.push("You took Rico's side out loud. Snow heard the shape of it.");
  if (S.capturedOnce) notes.push('You woke up in a bathtub. Nobody needs to hear about that.');
  if (S.stashFound && !S.stashTaken && !S.cratesFound) notes.push("You found Rico's real stash and left it behind.");
  if (freshness.log.length) notes.push(`Freshness lost to: ${freshness.log.join(', ')}.`);
  if (inspection.verdictKnown) {
    notes.push(inspection.correct()
      ? 'Your call on the product was correct.'
      : 'Your call on the product was wrong, which is worse than not calling it.');
  } else {
    notes.push('You never finished inspecting the product.');
  }
  $('endNotes').innerHTML = `<h3>NOTES</h3>${notes.map((n) => `<div>${n}</div>`).join('')}`;

  $('achList').innerHTML = ACHIEVEMENTS.map((a) =>
    `<span class="ach ${achieved.has(a.id) ? 'got' : ''}" title="${a.desc}">${achieved.has(a.id) ? '🏆 ' : ''}${a.name}</span>`
  ).join('');

  $('end').classList.remove('hidden');
  if (kind === 'home' && haul) setTimeout(() => sfx.bite(), 900);
  sfx.sting();
}

/* The ending card used to draw its whole exchange without ever touching the
 * voice bus. Read the character turns in order; stage copy remains silent. */
let endingVoiceTimer = null;
function playEndingVoices(lines) {
  clearTimeout(endingVoiceTimer);
  const spoken = lines.filter(([who, line]) => motelVoiceCue(who, line));
  let index = 0;
  const next = () => {
    if (index >= spoken.length) return;
    const [who, line] = spoken[index++];
    const duration = sfx.voice(motelVoiceCue(who, line));
    endingVoiceTimer = setTimeout(next, Math.max(2.8, duration + 0.55) * 1000);
  };
  next();
}

// ---------- Ambient life ----------
let barkT = 6;
let ambientT = 0;

function updateAmbient(dt) {
  ambientT += dt;

  // Neon + walkway flicker
  for (const f of level.flicker) {
    const n = Math.sin(ambientT * f.rate + f.phase) * Math.sin(ambientT * f.rate * 2.7 + f.phase);
    const on = n > -0.55;
    f.light.intensity = on ? f.base * (0.85 + Math.random() * 0.3) : f.base * 0.08;
    if (f.fixture && f.fixture.material && f.fixture.material.emissive) {
      f.fixture.material.emissiveIntensity = on ? 1.1 : 0.15;
    }
  }

  // Ceiling fan, palms in the warm wind
  refs.fan.group.rotation.y += dt * refs.fan.speed * (1 + Math.sin(ambientT * 3) * 0.12);
  for (const p of refs.palms) {
    p.crown.rotation.z = Math.sin(ambientT * 1.2 + p.phase) * 0.06;
    p.crown.rotation.x = Math.cos(ambientT * 0.9 + p.phase) * 0.05;
  }

  // TV flicker
  if (!refs.tv.broken) {
    refs.tv.screen.material.emissiveIntensity = 0.6 + Math.random() * 0.5 * refs.tv.volume;
  }

  // Ice machine, plumbing, distant sirens
  if (Math.random() < dt * 0.08) sfx.iceDrop();
  if (Math.random() < dt * 0.06) sfx.plumbing();
  if (Math.random() < dt * 0.03) sfx.siren(true);

  // Chatter
  barkT -= dt;
  if (barkT <= 0 && !speechFloor.busy()) {
    barkT = 7 + Math.random() * 7;
    if (phase === 'room' && !dialogue && !S.betrayed) {
      const i = Math.floor(Math.random() * SELLER_BARKS.length);
      const [who, line] = SELLER_BARKS[i];
      say(who, line, 3.2, cueFor(who, `sell.${i}`));
      if (who === 'Rico' && rico) rico.say(1.6);
      if (who === 'Chino' && chino) chino.say(1.6);
    } else if (phase === 'lot' && Math.random() < 0.5) {
      const i = Math.floor(Math.random() * SNOW_BARKS.length);
      say(ALLY, SNOW_BARKS[i], 3.2, cueFor(ALLY, `bark.${i}`));
    } else if ((phase === 'fight' || phase === 'recover') && Math.random() < 0.7) {
      const i = Math.floor(Math.random() * FIGHT_BARKS.length);
      const [who, line] = FIGHT_BARKS[i];
      say(who, line, 2.8, cueFor(who, `fight.${i}`));
    } else if (phase === 'room' && Math.random() < 0.4) {
      const i = Math.floor(Math.random() * PROSPECT_BARKS.length);
      say('Prospect', PROSPECT_BARKS[i], 3, cueFor('Prospect', `room.${i}`));
    }
  }

  // Tension follows suspicion, then pins during the fight
  sfx.setTension(S.betrayed ? 1 : Math.max(S.heat, S.read * 0.5) / 100);

  // Interest from the police cools off slowly while you are on foot
  if (phase !== 'drive' && phase !== 'menu') S.policeHeat = Math.max(0, S.policeHeat - dt * 0.35);
}

function updateRoomBeats(dt) {
  if (phase !== 'room' || S.betrayed) return;
  /* Dialogue and inspection are authored thinking time, not a hidden fuse.
   * Only quiet, player-controlled room time advances the slow-burn schedule. */
  if (inspecting || dialogue || speechFloor.busy()) return;
  roomT += dt;
  /* One beat at a time, and never on top of somebody who is mid-sentence.
   * These used to fire on the clock regardless, so a player working through
   * the inspection panel stacked seven scripted beats behind sixteen
   * inspection lines and heard the room narrate itself half a minute late —
   * measured at 36 s of drift, with the betrayal line arriving after the
   * betrayal. */
  while (roomEventIdx < roomEvents.length && roomT >= roomEvents[roomEventIdx].t) {
    if (speechFloor.busy()) break;
    roomEvents[roomEventIdx].run();
    roomEventIdx++;
    break;
  }
  // The room turns on its own if you take too long
  if (roomT > 96 && !S.betrayed) maybeBetray('time');
  if (S.heat >= 100 && !S.betrayed) maybeBetray('suspicion');
}

// Chino goes for the case once the fight starts.
function updateFightLogic(dt) {
  if (!S.betrayed) return;
  if (chino && chino.alive && !chino.carryingCase && !S.carryingJerky && !S.caseInPool && !S.caseBurned) {
    const d = Math.hypot(chino.position.x - refs.jerkyCase.x, chino.position.z - refs.jerkyCase.z);
    if (chino.state === 'chase' && Math.random() < dt * 0.25) {
      chino.state = 'goto';
      chino.target = { x: refs.jerkyCase.x, z: refs.jerkyCase.z };
      chino.afterGoto = 'carry';
    }
    if (d < 1.4 && chino.state === 'goto' && refs.jerkyCase.group.visible) {
      chino.carryingCase = true;
      refs.jerkyCase.group.visible = false;
      chino.state = 'flee';
      chino.target = { x: 22, z: 13 };
      say('Chino', 'Nobody gets it!', 2.6);
      toast('CHINO HAS THE CASE', 'warn', 'He is running for the pool');
    }
  }
  if (rico && rico.alive && rico.hp < rico.maxHp * 0.35 && rico.state !== 'flee') {
    ricoBreaksFor(rico);
    say('Rico', 'Not worth it, not worth it!', 2.6);
    toast('RICO IS RUNNING', 'warn', `He is going for ${rico.target.via}`);
  }
  // The clerk has a button under the counter and an opinion about all this
  if (clerk && clerk.alive && !S.clerkCowed && !S.alarmPulled && level.rects.OFFICE
      && pos.x > level.rects.OFFICE.x0 && pos.x < level.rects.OFFICE.x1
      && pos.z > level.rects.OFFICE.z0 && pos.z < level.rects.OFFICE.z1) {
    S.clerkTimer = (S.clerkTimer || 0) + dt;
    if (S.clerkTimer > 1.6) {
      S.alarmPulled = true;
      S.policeHeat += 30;
      sfx.alarm();
      clerk.state = 'panic';
      toast('THE CLERK HIT THE ALARM', 'warn', 'Police attention is climbing fast');
      say('*', 'The clerk does not look up. He just presses something under the counter.', 3.6);
    }
  }

  // Enough noise and the objective stops being the sellers
  if (!S.policeArrived && S.policeHeat >= 90 && (phase === 'fight' || phase === 'recover' || phase === 'escape')) {
    S.policeArrived = true;
    failObjective('unseen');
    sfx.siren(false);
    sfx.alarm();
    toast('POLICE ON THE LOT', 'warn', 'Forget the sellers. Do not be here.');
    say(ALLY, 'Blue lights. We leave now.', 3.6, cueFor(ALLY, 'police'));
    setObjective('escape', 'Get to the car before the lot fills up');
    for (const a of actors) {
      if (a.role === 'seller' && a.alive) { a.state = 'panic'; a.hostile = false; }
    }
  }

  if (snow && S.snowInside && snow.hp < 60 && !S.snowInjured) {
    S.snowInjured = true;
    toast('SNOW IS HURT', 'warn', 'You are driving');
    say(ALLY, 'I am fine. Not my blood.', 3.2, cueFor(ALLY, 'hurt'));
  }
}

// ---------- Loop ----------
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  if (paused) {
    camera.updateMatrixWorld();
    renderer.render(phase === 'drive' ? drive.scene : scene, camera);
    return;
  }
  const raw = Math.min(clock.getDelta(), 0.05);

  if (hitStop > 0) {
    hitStop -= raw;
    camera.updateMatrixWorld();
    renderer.render(phase === 'drive' ? drive.scene : scene, camera);
    return;
  }

  const dt = raw * timeScale;

  if (phase === 'drive') {
    updateDrive(dt);
    updateHud(raw);
    /* The camera hangs off the main scene now so the viewmodel can ride it.
     * The drive renders a different scene, which never walks that graph, so
     * the camera's world matrix has to be brought up to date by hand. */
    camera.updateMatrixWorld();
    syncListenerPose();
    renderer.render(drive.scene, camera);
    return;
  }

  if (phase !== 'menu') {
    attackCd = Math.max(0, attackCd - dt);
    invuln = Math.max(0, invuln - dt);
    blindT = Math.max(0, blindT - dt);
    if (player.consumeImpact() && pendingHit) { resolvePlayerHit(pendingHit); pendingHit = null; }

    updateArrival(dt);
    /* Before the player moves, not after: the doorway blocker has to be right
     * for the step that is about to be resolved against it. */
    updateRoomTwelveThreshold();
    updatePlayer(dt);
    updateViewmodel();
    updateViewmodelSway(dt, playerMoving);
    /* The shared rack runs its own frame: reload timers, brass, tracers, the
     * flash decay and the hold pose. `syncSharedAmmo` is what carries the
     * round count back into this scene's HUD. */
    weapons.update(dt, { speed: playerMoving ? (keys.has('sprint') ? RUN : WALK) : 0 });
    syncSharedAmmo();
    updateRoomBeats(dt);
    updateFightLogic(dt);
    updateSnowEntrance(dt);
    updateCasePlacement(dt);
    updateEvidenceMarkers(dt);

    // Grapple timer
    if (grapple) {
      grapple.t += raw;
      if (grapple.captive) {
        // Mashing is faster, but nobody stays in a motel bathtub forever
        grapple.progress += raw * 7;
        grappleFillEl.style.width = `${Math.min(100, grapple.progress)}%`;
        if (grapple.progress >= 100) {
          endGrapple();
          openDoor(refs.bathDoor);
          // The wake-up beat happens in the tub, but control resumes on clear
          // tile instead of leaving Tony embedded in the tub collider.
          pos.set(2.0, 0, -10.0);
          feetY = 0;
          vy = 0;
          say('Prospect', 'Motel bathtubs are not built for this species.', 3.2);
          phase = S.carryingJerky ? 'escape' : 'recover';
          updateRecoveryObjective();
        }
      } else if (grapple.t > 3.4) {
        damagePlayer(22, grapple.actor?.name || 'them');
        endGrapple();
      }
    }

    for (const a of actors) {
      a.update(dt, actorCtx);
      if (a.markerT > 0) {
        a.markerT -= dt;
        if (a.markerT <= 0 && a.marker) { a.group.remove(a.marker); a.marker = null; }
      }
    }

    updateDoors(raw);
    updateInteract();
  }

  updateAmbient(raw);
  debris.update(dt);
  effects.update(dt);
  updateCamera(raw);
  syncListenerPose();
  updateHud(raw);
  renderer.render(scene, camera);
}

function updateHud(dt) {
  if (subtitleT > 0) {
    subtitleT -= dt;
    if (subtitleT <= 0) subtitleEl.classList.remove('show');
  }
  /* The inspection panel greys out while somebody is talking about the last
   * test, so a fast clicker can see that the next one is waiting on the room
   * rather than wondering why nothing happened. */
  if (inspecting) inspectEl.classList.toggle('busy', speechFloor.busy());
  renderDealBoard();
  const showMeters = phase === 'room' || phase === 'door' || phase === 'fight';
  metersEl.classList.toggle('show', showMeters);
  if (showMeters) {
    heatFillEl.style.width = `${S.heat}%`;
    heatPctEl.textContent = `${Math.round(S.heat)}%`;
    heatWrapEl.classList.toggle('hot', S.heat > 70);
    readFillEl.style.width = `${S.read}%`;
    readPctEl.textContent = `${Math.round(S.read)}%`;
  }
  hpFillEl.style.width = `${S.hp}%`;
}

updateGear();
renderObjectiveList();
tick();

// Debug / test handle
window.MOTEL = {
  /** What has actually been said, in order. Race-free; the subtitle is not. */
  get spoken() { return spokenLog.map((entry) => `${entry.who} — ${entry.line}`); },
  S, level, refs, actors, shipment, inspection, freshness, campaign, story: motelStory, player,
  input: browserInput,
  get heldInput() {
    return ['up', 'down', 'left', 'right', 'sprint', 'turnL', 'turnR', 'lookU', 'lookD']
      .filter((action) => motelInputPolicy.isDown(action));
  },
  get phase() { return phase; },
  get arrival() {
    const driver = refs.manCar.driverActorPosition();
    const passenger = refs.manCar.passengerPosition();
    const passengerActor = refs.manCar.passengerActorPosition();
    return {
      progress: Math.min(1, arrivalT / ARRIVAL_SECONDS),
      complete: S.arrivalComplete,
      snowSeated: S.snowSeated,
      snowExitedCar: S.snowExitedCar,
      car: refs.manCar.group.position.toArray(),
      park: refs.manCar.park.toArray(),
      driver: driver.toArray(),
      passenger: passenger.toArray(),
      passengerActor: passengerActor.toArray(),
      cameraMode: arrivalCameraMode,
      colliderEnabled: refs.manCar.collider.enabled,
    };
  },
  get ending() { return lastEndingKind; },
  get campaignState() { return campaign.state; },
  get pos() { return pos; },
  get feetY() { return feetY; },
  get objectives() { return { done: [...objDone], failed: [...objFailed] }; },
  get evidence() { return evidenceStatus(); },
  evidenceTest: {
    collect: (id) => collectEvidenceCase(id),
    reset: (ids = []) => { evidence.reset(ids); updateEvidenceMarkers(); updateRecoveryObjective(); return evidenceStatus(); },
  },
  /* What the HUD is asking for right now, and where the transaction is up to.
   * A verifier that can only see `phase` cannot tell whether the scene ever
   * told the player what to do, which is the failure this scene keeps having. */
  get objective() {
    return {
      id: currentObjective,
      title: objTitleEl.textContent,
      sub: objSubEl.textContent,
    };
  },
  get deal() {
    return {
      step: S.dealStep,
      expected: dealStepNow(),
      steps: [...DEAL_STEPS],
      sampleChecked: S.sampleChecked,
      packagesCounted: S.packagesCounted,
      moneyOnTable: S.moneyOnTable,
      moneyOpened: S.moneyOpened,
      board: dealBoxEl?.classList.contains('show')
        ? {
          yours: dealYoursEl.textContent,
          theirs: dealTheirsEl.textContent,
          order: dealOrderEl.textContent,
        }
        : null,
    };
  },
  get roomClock() { return roomT; },
  get dialogue() {
    return dialogue
      ? { nodeId: dialogue.nodeId, ready: dialogueReady(), speaker: dialogue.node.speaker }
      : null;
  },
  get achievements() { return [...achieved]; },
  get interactables() { return interactables.map((i) => i.id); },
  get interactableList() { return interactables; },
  scene, camera, renderer, three: THREE,
  get cameraMode() { return phase === 'drive' ? 'first_person_drive' : 'first_person'; },
  get playerRadius() { return PLAYER_R; },
  get facing() {
    return {
      x: Math.sin(camYaw) * Math.cos(camPitch),
      y: Math.sin(camPitch),
      z: Math.cos(camYaw) * Math.cos(camPitch),
    };
  },
  /* Voice wiring, so a verifier can prove the scene really asks for its
   * recordings rather than only drawing subtitles. */
  voice: {
    say: (who, line, seconds, cue) => say(who, line, seconds, cue),
    cueFor,
    cueForLine: motelVoiceCue,
    coverage: () => sfx.voiceCoverage(),
    get requested() { return [...sfx.voiceRequested]; },
    /** Takes that actually started, in order — asked-for is not the same as heard. */
    get played() { return sfx.voicePlayed.map((entry) => ({ ...entry })); },
    busy: () => speechFloor.busy(),
    playing: () => sfx.voiceBusy(),
  },
  audio: {
    get events() { return sfx.audioEvents.map((entry) => ({ ...entry })); },
    music: () => sfx.driveMusicStatus(),
  },
  /* The HUD inventory and the thing in his hands, for the verifier. */
  get inventory() { return inventoryItems(); },
  /* What is in his hand, whichever of the two owners is holding it. `kind` is
   * the Motel's name for it; `shared` is the catalog id when the shared
   * weapon system supplied it, and null when it is a Motel prop. */
  get viewmodel() {
    const kind = heldKind();
    const shared = sharedWeaponId(kind);
    const model = heldModel();
    const host = shared ? weapons.rig : viewmodel;
    const parts = [];
    model?.traverse((node) => { if (node.name) parts.push(node.name); });
    return {
      kind,
      shared,
      visible: !!model && host.visible && model.visible !== false,
      children: model ? model.children.length : 0,
      parts,
      inCamera: host.parent === camera,
      position: (model ?? host).position.toArray().map((n) => Number(n.toFixed(3))),
    };
  },
  /** The Object3D itself, for a check that wants to project it. */
  get heldModel() { return heldModel(); },
  /** The shared weapon system, read-only, for ammunition and cue assertions. */
  get weapons() {
    return {
      equipped: weapons.equipped,
      hud: weapons.hud(),
      stats: { ...weapons.stats },
      cues: [...weapons.cueLog],
      /* Cues that did NOT play this gun's own recording. Empty is the claim. */
      standIns: [...weapons.standInCues],
      /* Which of this gun's own recordings this page has actually decoded.
       * `playWeaponCue` falls through to a stand-in for the ones it has not,
       * and a check that cannot see the difference cannot tell a .45 from a
       * generic gunshot -- see `_cue` in src/core/weapons/WeaponSystem.js. */
      hasSample: (name) => motelWeaponAudio.hasSample(name) === true,
      rigInCamera: weapons.rig.parent === camera,
      reserve: weapons.firearm(WEAPON_IDS.REVOLVER).reserve,
      reloading: weapons.equipped ? weapons.firearm(weapons.equipped).reloading : false,
    };
  },
  reload: () => onReload(),
  fire: () => onRanged(),
  isBlocked: (x, z, y = feetY, radius = PLAYER_R) => blocked(x, z, y, radius),
  start: startScene,
  teleport: (x, z, yHint = 0) => {
    pos.set(x, 0, z);
    feetY = level.floorAt(x, z, yHint);
  },
  face: (x, z, y = null) => {
    const dx = x - pos.x;
    const dz = z - pos.z;
    camYaw = Math.atan2(dx, dz);
    if (Number.isFinite(y)) {
      const eyeY = phase === 'car' || phase === 'boarding' ? 1.55 : feetY + PLAYER_EYE;
      camPitch = THREE.MathUtils.clamp(
        Math.atan2(y - eyeY, Math.hypot(dx, dz)),
        -0.85,
        0.5,
      );
    }
  },
  completeArrival: () => finishArrival(),
  setArrivalCameraMode: (mode) => {
    arrivalCameraMode = mode === 'exterior' ? 'exterior' : 'passenger';
    return arrivalCameraMode;
  },
  get hostiles() { return actors.filter((a) => a.alive && a.hostile).map((a) => a.name); },
  use: () => onUse(),
  attack: () => onAttack(),
  activeInteract: () => (activeInteract ? activeInteract.id : null),
  forceInteract: (id) => { const i = ix(id); if (i && (!i.enabled || i.enabled())) i.act(); return !!i; },
  betray: () => maybeBetray('debug'),
  /* Put a weapon in his hands, the way the drive does.
   *
   * The revolver is picked up in the arrival sequence and out of the glovebox,
   * and the glovebox interaction is `enabled: () => phase === 'car'` -- so a
   * page that jumps straight into the room has no way to be armed and no way
   * to say so. A browser check of the betrayal hinge needs the gun he would
   * really be carrying; without this it can only prove that a man with empty
   * hands still has empty hands. */
  equip: (kind) => { equipWeapon(kind); return S.weapon; },
  /* Open a wheel by name, so a verifier can reproduce the soft-lock this
   * scene used to have: a conversation the player walked away from. */
  talk: (nodeId) => openDialogue(nodeId),
  /* Returns whether the answer was actually taken. It used to return nothing
   * and silently refuse while the wheel was still coming up, which left
   * `dialogue` set, closed the knock's gate, and stranded the harness in a lot
   * whose only door had stopped working. */
  pick: (style) => pickDialogue(style),
  voiceReadyFor: (cue) => sfx.voiceReady(cue),
  get openingCue() { return OPENING_CUE; },
  inspect: (id) => runInspection(id),
  inspectAll: () => { for (const s of [...inspection.available()]) runInspection(s.id); },
  finish: (k) => finishScene(k || 'home'),
  drive: () => startDrive(),
  get driveState() { return drive; },
};
