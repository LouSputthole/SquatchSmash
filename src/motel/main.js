import * as THREE from 'three';
import { buildMotel, makeJerkyCase, BOUNDS } from './level.js';
import { Actor, CAST, WEAPON_STATS, buildWeaponMesh } from './actors.js';
import { Person } from '../core/person.js';
import { DebrisSystem } from '../../game/src/debris.js';
import { Effects } from '../../game/src/effects.js';
import { lambert } from '../../game/src/world.js';
import * as sfx from './audio.js';
import {
  NODES, STYLES, STYLE_LABEL, SELLER_BARKS, PROSPECT_BARKS, MANNY_BARKS,
  FIGHT_BARKS, MANNY_FIGHT_BARKS, ENDING,
} from './dialogue.js';
import { rollShipment, Inspection, Freshness } from './jerky.js';
import {
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
  navigateCampaign,
} from '../core/campaign.js';
import { createMotelStory } from '../core/motel-story.js';

// ---------------------------------------------------------------------------
// THE JERKY MOTEL — scene controller.
//
// One continuous playable sequence: sit in the car, walk the lot, knock, talk,
// inspect the merchandise, watch the room turn, survive it, take the case back
// and drive away. Nothing here takes the camera off the player.
// ---------------------------------------------------------------------------

const PLAYER_SCALE = 0.85;
const PLAYER_R = 0.42;
const PLAYER_EYE = 1.62;
const GRAVITY = 26;
const JUMP_V = 9.2;
const WALK = 4.8;
const RUN = 7.6;

const campaign = createCampaign();
if (campaign.state.scene.id !== SCENE_IDS.JERKY_MOTEL) {
  campaign.enter(SCENE_IDS.JERKY_MOTEL, { spawn: 'passenger_seat' });
}
const motelStory = createMotelStory({ campaign });
let lastEndingKind = null;

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 400);

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

// ---------- Game state ----------
let phase = 'menu';   // menu | car | lot | door | room | fight | recover | escape | drive | end
let paused = false;
let timeScale = 1;

const S = {
  hp: 100,
  heat: 0,               // seller suspicion 0..100
  read: 0,               // Prospect's read on the room 0..100
  cluesFound: new Set(),
  weapon: 'fists',
  ammo: 0,
  carryingMoney: false,
  carryingJerky: false,
  moneyOnTable: false,
  moneyOpened: false,
  couponOnly: false,
  moneyRecovered: true,
  sat: false,
  knocked: false,
  enteredRoom: false,
  dealStarted: false,
  betrayed: false,
  betrayalT: 0,
  fightStarted: false,
  slicerRevealed: false,
  slicerKnown: false,
  mannySignalled: false,
  mannyInside: false,
  mannyInjured: false,
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
};

const shipment = rollShipment();
const inspection = new Inspection(shipment);
const freshness = new Freshness();

const OBJECTIVES = {
  main: [
    { id: 'reach', text: 'Reach room twelve' },
    { id: 'inspect', text: 'Inspect the Reserve' },
    { id: 'payment', text: 'Present the payment' },
    { id: 'survive', text: 'Survive the betrayal' },
    { id: 'recover', text: 'Recover the jerky' },
    { id: 'escape', text: 'Escape the motel' },
  ],
  opt: [
    { id: 'counterfeit', text: 'Identify counterfeit product' },
    { id: 'thirdman', text: 'Discover the hidden bathroom attacker' },
    { id: 'signal', text: 'Signal Manny before the betrayal' },
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
  trunk: "Manny's trunk: a crowbar and one very illegal hand cannon.",
};

// ---------- Actors ----------
const actors = [];
let manny = null;
let rico = null;
let chino = null;
let slicer = null;
let lookout = null;
let watcher = null;
let clerk = null;

function spawnActor(cfg) {
  const a = new Actor(scene, cfg);
  actors.push(a);
  return a;
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
let dialogue = null;    // { nodeId, node, opts }
let subtitleT = 0;
const carriedCases = { money: null, jerky: null };

// ---------- Input ----------
const keys = new Set();
const KEYMAP = {
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  ArrowLeft: 'turnL', ArrowRight: 'turnR', ArrowUp: 'lookU', ArrowDown: 'lookD',
};
const touch = { active: false, x: 0, y: 0 };

window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (grapple) mashGrapple();
      else if (phase !== 'menu') tryJump();
      break;
    case 'KeyE': e.preventDefault(); onUse(); break;
    case 'KeyF': onAttack(); break;
    case 'KeyR': onRanged(); break;
    case 'KeyG': dropWeapon(); break;
    case 'Tab': e.preventDefault(); objListEl.classList.toggle('show'); break;
    case 'KeyM': toggleMute(); break;
    case 'KeyP': togglePause(); break;
    case 'Escape':
      if (inspecting) closeInspection();
      else if (dialogue) { /* the wheel is never modal — ignore */ }
      else togglePause();
      break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
    case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8': {
      const n = Number(e.code.slice(5));
      if (dialogue && n <= 4) pickDialogue(STYLES[n - 1]);
      else if (inspecting) runInspectionByIndex(n - 1);
      break;
    }
    case 'Enter':
      if (phase === 'menu') startScene();
      break;
    default: break;
  }
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
window.addEventListener('blur', () => keys.clear());
window.addEventListener('contextmenu', (e) => e.preventDefault());

renderer.domElement.addEventListener('mousedown', (e) => {
  if (phase === 'menu' || phase === 'end') return;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
    return;
  }
  if (e.button === 0) onAttack();
  else if (e.button === 2) onRanged();
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  camYaw -= e.movementX * 0.0022;
  camPitch = THREE.MathUtils.clamp(camPitch - e.movementY * 0.0018, -0.85, 0.5);
});

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
function blocked(x, z, y, radius = PLAYER_R) {
  const bot = y + 0.25;
  const top = y + 2.6;
  for (const c of colliders) {
    if (!c.enabled) continue;
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

function segmentBlocked(x0, z0, y0, x1, z1, y1) {
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = THREE.MathUtils.lerp(x0, x1, t);
    const z = THREE.MathUtils.lerp(z0, z1, t);
    const y = THREE.MathUtils.lerp(y0, y1, t);
    for (const c of colliders) {
      if (!c.enabled || c.tag === 'bed' || c.tag === 'table') continue;
      if (y <= c.y0 || y >= c.y1) continue;
      if (x > c.x0 - 0.25 && x < c.x1 + 0.25 && z > c.z0 - 0.25 && z < c.z1 + 0.25) return t;
    }
  }
  return 1;
}

const actorCtx = {
  player: pos,
  floorAt: (x, z, y) => level.floorAt(x, z, y),
  blocked: (x, z, y, r) => blocked(x, z, y, r),
  onMeleeAttack: (a) => enemyMelee(a),
  onRangedAttack: (a) => enemyShoot(a),
  onGrabAttempt: (a) => startGrapple(a),
  onReachedTarget: (a) => actorReachedTarget(a),
  onStuck: (a) => actorStuck(a),
  onAllyAttack: (a, foe) => allyAttack(a, foe),
  nearestHostile: (x, z, r) => nearestHostile(x, z, r),
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

function say(who, line, seconds = 3.4) {
  const cls = who === 'Prospect' ? 'who prospect' : who === '*' ? 'stage' : 'who';
  subtitleEl.innerHTML = who === '*'
    ? `<span class="stage">${line}</span>`
    : `<span class="${cls}">${who}</span> — ${line}`;
  subtitleEl.classList.add('show');
  subtitleT = seconds;
  sfx.blip();
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

function foundClue(id) {
  if (S.cluesFound.has(id)) return;
  S.cluesFound.add(id);
  addRead(9);
  toast('WARNING SIGN', 'clue', CLUES[id]);
  renderObjectiveList();
  if (S.cluesFound.size >= Object.keys(CLUES).length) award('inspector');
}

function addHeat(n) {
  S.heat = THREE.MathUtils.clamp(S.heat + n, 0, 100);
}
function addRead(n) {
  S.read = THREE.MathUtils.clamp(S.read + n, 0, 100);
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
  sfx.init();
  sfx.resume();
  sfx.startAmbience();
  sfx.setMusic('tense');
  $('menu').classList.add('hidden');
  hudEl.classList.add('visible');
  phase = 'car';
  S.carryingMoney = true;
  setObjective('reach', 'Meet the jerky suppliers');
  renderObjectiveList();

  // Seat Prospect in the passenger seat
  pos.set(-7.55, 0, 16.4);
  feetY = 0.55;
  camYaw = Math.PI * 0.98;

  // Cast
  manny = spawnActor({ ...CAST.manny(), x: -10.6, z: 16.4, state: 'idle' });
  manny.anchor = { x: -10.6, z: 16.4 };
  manny.heading = Math.PI;
  lookout = spawnActor({ ...CAST.lookout(), x: 21.4, z: -0.6, state: 'idle' });
  watcher = spawnActor({ ...CAST.watcher(), x: 6, z: -1.6, state: 'idle' });
  watcher.group.position.y = level.DECK_Y;
  watcher.anchor = { x: 6, z: -1.6 };
  clerk = spawnActor({ ...CAST.clerk(), x: -44, z: -8.2, state: 'idle' });

  say('Manny', 'Room twelve. They show the meat first. You show the money second.', 4.2);
  setTimeout(() => { if (phase === 'car') openDialogue('mannyBrief'); }, 1400);
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
  sfx.setMusic('none');
  sfx.stopAmbience();
  endGrapple();
  closeInspection();
  closeDialogue();
  promptEl.classList.remove('show');
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

// -- car phase --
addInteract({
  id: 'talkManny', x: -10.6, y: 1.6, z: 16.4, r: 4.2,
  label: () => 'Speak to Manny',
  enabled: () => (phase === 'car' || phase === 'lot') && !dialogue,
  act: () => {
    if (!S.dealStarted && phase === 'car') openDialogue('mannyBrief');
    else say('Manny', MANNY_BARKS[Math.floor(Math.random() * MANNY_BARKS.length)]);
  },
});

addInteract({
  id: 'moneyCase', x: -7.6, y: 1.2, z: 15.2, r: 3.4,
  label: () => (S.couponOnly ? 'The case: cash out, coupon in' : 'Inspect the payment'),
  enabled: () => phase === 'car',
  act: () => {
    if (!S.couponOnly) {
      say('*', '$40,000. Two real bundles on top, several very confident fakes underneath, one expired steakhouse coupon and a handwritten Sasquatch business card.', 5);
      addRead(4);
      toast('PAYMENT CHECKED', '', 'Press E again to pull the cash and leave only the coupon');
      S.moneyChecked = true;
    } else {
      say('Prospect', 'The coupon expired in March. So did my patience.', 3);
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

addInteract({
  id: 'glovebox', x: -6.2, y: 1.1, z: 17.6, r: 3.0,
  label: () => 'Check your weapon',
  enabled: () => phase === 'car',
  act: () => {
    say('Prospect', 'Compact revolver. Six in the wheel. For emergencies and disrespect.', 3.6);
    S.weapon = 'revolver';
    S.ammo = 6;
    updateGear();
  },
});

addInteract({
  id: 'exitCar', x: -5.6, y: 1.0, z: 16.4, r: 3.2,
  label: () => 'Get out of the car',
  enabled: () => phase === 'car',
  act: () => exitCar(),
});

addInteract({
  id: 'trunk', x: -8, y: 1.0, z: 20.2, r: 3.2,
  label: () => (refs.manCar.trunk.opened ? "Manny's trunk" : "Check the trunk"),
  enabled: () => phase === 'lot' || phase === 'escape',
  act: () => {
    if (!refs.manCar.trunk.opened) {
      refs.manCar.trunk.opened = true;
      foundClue('trunk');
      S.hiddenWeaponKnown = true;
      say('Manny', 'Crowbar. And the thing we agreed I would never mention out loud.', 3.6);
      toast('TRUNK OPEN', '', 'Crowbar and hand cannon available here');
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
    foundClue('wrapper');
    say('Prospect', 'Reserve wrapper. Chewed open, not cut. Somebody in this motel is eating the inventory.', 4);
  },
});

addInteract({
  id: 'door9', x: -19, y: 1.4, z: -3.4, r: 3.0,
  label: () => 'Listen at room nine',
  enabled: () => phase === 'lot',
  act: () => {
    foundClue('arguing');
    say('*', 'Through the door: "...he brings the case, we take the case, nobody has to..." then nothing.', 4.4);
  },
});

addInteract({
  id: 'lookout', x: 21.4, y: 1.4, z: -0.6, r: 3.6,
  label: () => 'Size up the smoker by the ice machine',
  enabled: () => phase === 'lot',
  act: () => {
    foundClue('lookout');
    say('Prospect', 'He is watching the road, not the lot. Nobody watches the road unless somebody is coming.', 4.2);
    if (lookout) lookout.state = 'idle';
  },
});

addInteract({
  id: 'camera', x: refs.camera.x, y: 2.5, z: refs.camera.z, r: 3.4,
  label: () => 'Check the security camera',
  enabled: () => phase === 'lot',
  act: () => {
    foundClue('camera');
    S.tunnelKnown = true;
    say('Prospect', 'Pointed at nothing. Whoever aimed it did not want room twelve on tape.', 4);
    toast('ADVANTAGE', 'clue', 'Blind corner mapped — the pool drain route is on your mind now');
  },
});

addInteract({
  id: 'secondcar', x: refs.secondCar.x, y: 1.2, z: refs.secondCar.z + 2.6, r: 3.6,
  label: () => 'Look into the idling car',
  enabled: () => phase === 'lot',
  act: () => {
    foundClue('secondcar');
    say('Prospect', 'Running engine. Warm seat. Nobody in it. That is a car waiting to leave in a hurry.', 4.2);
    toast('ADVANTAGE', 'clue', 'Manny will come in sooner when it goes bad');
  },
});

addInteract({
  id: 'cart', x: refs.laundryCart.x, y: 1.2, z: refs.laundryCart.z, r: 3.0,
  label: () => 'Search the laundry cart',
  enabled: () => phase === 'lot',
  act: () => {
    foundClue('towel');
    say('Prospect', 'That is not sauce.', 3);
  },
});

addInteract({
  id: 'packets', x: refs.packets.x, y: 0.3, z: refs.packets.z, r: 3.0,
  label: () => 'Examine the empty packets',
  enabled: () => phase === 'lot',
  act: () => {
    foundClue('packets');
    say('Prospect', 'Vacuum packets. Opened out here, refilled out here. Somebody repacked the shipment in a parking lot.', 4.4);
    toast('ADVANTAGE', 'clue', 'You know what a repack looks like — the scan will read clearer');
    inspection.evidence -= 0.1;
  },
});

addInteract({
  id: 'railing', x: 6, y: 4.2, z: -0.4, r: 6.5,
  label: () => 'Watch the upstairs railing',
  enabled: () => phase === 'lot',
  act: () => {
    foundClue('railing');
    say('Prospect', 'Second floor. He looked away a half second late. That is a man with a job.', 4);
    toast('ADVANTAGE', 'clue', 'Enemy positions will be marked when the room turns');
    S.positionsMarked = 6;
  },
});

addInteract({
  id: 'bathwindowOutside', x: 3.3, y: 1.9, z: -17.4, r: 4.0,
  label: () => "Study room twelve's bathroom window",
  enabled: () => phase === 'lot' || phase === 'escape',
  act: () => {
    foundClue('bathwindow');
    sfx.windowSlide();
    S.slicerKnown = true;
    completeObjective('thirdman');
    say('Prospect', 'The bathroom window opened an inch. Somebody in there wanted air, or a look at the lot.', 4.4);
    toast('ADVANTAGE', 'clue', 'You know about the third man before he knows about you');
    S.reactionBonus = true;
  },
});

// -- knocking --
addInteract({
  id: 'knock', x: -0.8, y: 1.4, z: -3.6, r: 3.4,
  label: () => (S.knocked ? 'Room twelve' : 'Knock on room twelve'),
  enabled: () => phase === 'lot' && !dialogue,
  act: () => knockOnTwelve(),
});

addInteract({
  id: 'enterRoom', x: 0, y: 1.2, z: -5.4, r: 3.0,
  label: () => 'Step inside',
  enabled: () => phase === 'door' && S.doorOpened,
  act: () => enterRoom(),
});

// -- inside the room --
addInteract({
  id: 'sample', x: 1.4, y: 1.0, z: -6.4, r: 3.4,
  label: () => (inspecting ? 'Step back from the sample' : 'Inspect the sample'),
  enabled: () => (phase === 'room') && S.sampleOut,
  act: () => (inspecting ? closeInspection() : openInspection()),
});

addInteract({
  id: 'chair', x: 3.0, y: 0.8, z: -6.4, r: 2.6,
  label: () => (S.sat ? 'Stand up' : 'Sit at the table (optional)'),
  enabled: () => phase === 'room',
  act: () => {
    S.sat = !S.sat;
    if (S.sat) {
      pos.set(3.0, 0, -5.6);
      say('Rico', 'See? Civilised.', 2.4);
      addHeat(-6);
      toast('SEATED', '', 'Inspection is easier — but this is a bad place to be when it turns');
    } else {
      say('Prospect', 'I inspect standing.', 2.2);
    }
  },
});

addInteract({
  id: 'jerkyCase', x: refs.jerkyCase.x, y: 1.2, z: refs.jerkyCase.z, r: 3.2,
  label: () => {
    if (S.carryingJerky) return 'You have the Reserve';
    if (phase === 'room') return 'Count the packages';
    return 'Take the Reserve';
  },
  enabled: () => !S.carryingJerky && !S.caseInPool && !S.caseBurned && refs.jerkyCase.group.visible,
  act: () => {
    if (phase === 'room') {
      addHeat(6);
      addRead(8);
      say('Prospect', `Eight packages. Numbered labels. ${shipment.grade === 'genuine' ? 'Seals all intact.' : 'Two of these seals have been opened and re-pressed.'}`, 4.6);
      if (shipment.grade !== 'genuine') inspection.evidence -= 0.15;
      if (chino) chino.talkT = 1.6;
      setTimeout(() => say('Chino', 'You buying or writing a cookbook?', 3), 1800);
    } else {
      takeJerkyCase();
    }
  },
});

addInteract({
  id: 'placeMoney', x: 1.4, y: 1.0, z: -6.4, r: 3.4,
  label: () => (S.moneyOnTable ? 'Open the case' : 'Place the case on the table'),
  enabled: () => phase === 'room' && (S.carryingMoney || S.moneyOnTable) && !S.moneyOpened,
  act: () => {
    if (!S.moneyOnTable) {
      S.moneyOnTable = true;
      S.carryingMoney = false;
      placeMoneyCase();
      addHeat(4);
      say('Rico', 'There it is. Now we are all friends with a table between us.', 3.6);
      setObjective('payment', 'Your call when it opens');
      updateGear();
    } else {
      S.moneyOpened = true;
      completeObjective('payment');
      say('*', 'The lamp catches the silver foil. For one second the case looks holy.', 4);
      addHeat(24);
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
      say('Prospect', 'There is a man breathing in your bathroom, Rico.', 3.6);
      setTimeout(() => { if (!S.betrayed) maybeBetray('bathroom'); }, 900);
    } else {
      slamBathDoor();
    }
  },
});

addInteract({
  id: 'windowSignal', x: 3.0, y: 1.8, z: -4.2, r: 3.2,
  label: () => (S.windowBroken ? 'Climb through the window' : (S.betrayed ? 'Smash through the window' : 'Signal Manny through the window')),
  enabled: () => phase === 'room' || phase === 'fight' || phase === 'recover',
  act: () => {
    if (!S.betrayed) {
      S.mannySignalled = true;
      completeObjective('signal');
      addHeat(12);
      say('*', 'Two fingers against the glass. Out in the lot, a car door opens.', 3.6);
      toast('SIGNAL SENT', '', 'Manny is out of the car and moving');
      if (manny) { manny.state = 'goto'; manny.target = { x: -1, z: 1.5 }; manny.afterGoto = 'idle'; }
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
    say('Prospect', 'Premium stash. Black wrap, wax seal, real numbers. He was never going to sell me this.', 4.6);
    toast('HIDDEN STASH', 'clue', "Rico's real product — take it on your way out");
  },
});

addInteract({
  id: 'takeStash', x: refs.stash.x, y: 0.4, z: refs.stash.z, r: 3.0,
  label: () => 'Take the premium stash',
  enabled: () => S.stashFound && !S.stashTaken && (phase === 'fight' || phase === 'recover' || phase === 'escape'),
  act: () => {
    S.stashTaken = true;
    refs.stash.group.visible = false;
    freshness.value = Math.min(100, freshness.value + 15);
    toast('STASH SECURED', 'ach', 'Premium packages added to the haul');
    sfx.packaging();
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
  enabled: () => !S.cratesFound,
  act: () => {
    S.cratesFound = true;
    S.stashFound = true;
    completeObjective('stash');
    freshness.value = Math.min(100, freshness.value + 10);
    say('Prospect', 'Room eleven. The real cure, stacked to the ceiling. They were selling me the wrapping.', 4.6);
    toast('THE REAL PRODUCT', 'ach', 'Rico kept the honest meat one door away');
  },
});

// -- office --
addInteract({
  id: 'monitor', x: refs.monitor.x, y: 1.6, z: refs.monitor.z, r: 3.2,
  label: () => 'Read the security monitor',
  enabled: () => !refs.monitor.used,
  act: () => {
    refs.monitor.used = true;
    S.positionsMarked = 10;
    markEnemies(10);
    say('Prospect', 'Four of them in the lot. Two by the stairs, one at the pool, one at my car.', 4.4);
    toast('POSITIONS MARKED', 'clue', 'You can see where they are for ten seconds');
  },
});

addInteract({
  id: 'register', x: refs.register.x, y: 1.5, z: refs.register.z, r: 3.0,
  label: () => 'Rob the register (optional)',
  enabled: () => !refs.register.robbed && phase !== 'menu',
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
  enabled: () => true,
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
  enabled: () => true,
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
  enabled: () => !S.neonKilled,
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
  enabled: () => clerk && clerk.alive && !S.clerkCowed,
  follow: () => (clerk ? { x: clerk.position.x, z: clerk.position.z } : null),
  act: () => {
    S.clerkCowed = true;
    clerk.state = 'panic';
    say('Prospect', 'You saw a raccoon. A big one. In a shirt.', 3.2);
    toast('CLERK HANDLED', '', 'No alarm from the office tonight');
  },
});

// -- getaway --
addInteract({
  id: 'getaway', x: -6.6, y: 1.2, z: 17.0, r: 4.2,
  label: () => 'Get in the car',
  enabled: () => phase === 'escape' || phase === 'recover',
  act: () => boardGetaway(),
});

// ---------- Phase transitions ----------
function exitCar() {
  phase = 'lot';
  pos.set(-5.4, 0, 16.0);
  feetY = 0;
  say('Manny', 'I am right here. Facing the exit, before you ask.', 3.2);
  setObjective('reach', 'Walk the lot — everything you notice out here counts inside');
  updateGear();
}

function knockOnTwelve() {
  S.knocked = true;
  phase = 'door';
  sfx.knock();
  setTimeout(() => {
    sfx.doorOpen();
    rico = spawnActor({ ...CAST.rico(), x: 0, z: -4.9, state: 'deal' });
    rico.anchor = { x: 0, z: -4.9 };
    rico.heading = 0;
    rico.talkT = 2;
    openDialogue('atDoor');
  }, 1100);
}

function enterRoom() {
  phase = 'room';
  S.enteredRoom = true;
  S.dealStarted = true;
  pos.set(-0.2, 0, -5.4);
  feetY = 0;
  completeObjective('reach');
  setObjective('inspect', 'Confirm the merchandise');

  // Everyone takes their positions
  rico.anchor = { x: 1.2, z: -8.3 };
  rico.state = 'deal';
  rico.group.position.set(1.2, 0, -8.3);
  chino = spawnActor({ ...CAST.chino(), x: -1.2, z: -7.8, state: 'guard' });
  chino.anchor = { x: -1.2, z: -7.8 };
  slicer = spawnActor({ ...CAST.slicer(), x: 2.2, z: -13.5, state: 'idle' });
  slicer.group.visible = true;

  // The door closes behind you
  setTimeout(() => {
    closeDoor(refs.frontDoor);
    sfx.doorSlam();
    say('Chino', 'Door stays shut. Air conditioning.', 3);
    addHeat(6);
    addRead(10);
  }, 1400);

  setTimeout(() => {
    S.sampleOut = true;
    sfx.packaging();
    say('Rico', 'Mountain reserve. Eleven-year cure. No fillers.', 4);
    toast('SAMPLE PRESENTED', '', 'Walk up to the table and press E to inspect it properly');
  }, 2600);

  scheduleRoomEvents();
}

// Slow-burn suspicion beats while the deal runs.
const roomEvents = [
  { t: 12, run: () => { sfx.tvStatic(); refs.tv.volume = 0.8; say('*', 'Chino turns the television up. Nobody was watching it.', 3.4); addRead(8); } },
  { t: 22, run: () => { sfx.plumbing(); say('*', 'The bathroom faucet runs, then stops. Nobody flushes.', 3.4); addRead(10); if (S.read > 30) S.slicerKnown = true; } },
  { t: 30, run: () => { sfx.knifeTap(); say('Chino', 'You think rare meat grows on trees?', 3); addHeat(3); } },
  { t: 38, run: () => { moveCaseAway(); say('*', 'The suitcase gets moved. Farther from you. Casually.', 3.4); addRead(9); addHeat(4); } },
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
  const i = ix('jerkyCase');
  i.x = -3.4;
  i.z = -12.6;
}

function offerBetrayal() {
  openDialogue('ricoOffer');
}

// ---------- Dialogue ----------
function openDialogue(nodeId) {
  const node = NODES[nodeId];
  if (!node) return;
  dialogue = { nodeId, node };
  wheelHeadEl.innerHTML = `<span class="who">${node.speaker}</span> — ${node.line}`;
  wheelOptsEl.innerHTML = '';
  STYLES.forEach((style, i) => {
    const opt = node.options[style];
    if (!opt) return;
    const b = document.createElement('button');
    b.className = 'opt';
    b.dataset.style = style;
    b.innerHTML = `<span class="key">${i + 1}</span><span><span class="style">${STYLE_LABEL[style]}</span>${opt.text}</span>`;
    b.addEventListener('click', () => pickDialogue(style));
    wheelOptsEl.appendChild(b);
  });
  wheelEl.classList.add('show');
  slowTintEl.classList.add('on');
  timeScale = 0.35;   // time slows; it does not stop
  say(node.speaker, node.line, 4.5);
}

function closeDialogue() {
  dialogue = null;
  wheelEl.classList.remove('show');
  slowTintEl.classList.remove('on');
  timeScale = 1;
}

function pickDialogue(style) {
  if (!dialogue) return;
  const { nodeId, node } = dialogue;
  const opt = node.options[style];
  if (!opt) return;
  closeDialogue();
  sfx.select();
  say('Prospect', opt.text, 3.4);
  addHeat(opt.heat || 0);
  addRead(opt.read || 0);

  if (opt.reply) setTimeout(() => { if (phase !== 'end') say(opt.reply[0], opt.reply[1], 3.6); }, 1900);

  if (nodeId === 'atDoor') {
    S.doorOpened = true;
    openDoor(refs.frontDoor);
    setTimeout(() => {
      say('Rico', 'Come in before the neighbours smell it.', 3);
      toast('DOOR OPEN', '', 'Step inside when you are ready — nobody is pushing you');
    }, 3200);
  }

  if (nodeId === 'sample' && opt.nervous) {
    addHeat(8);
    setTimeout(() => { if (!S.betrayed) say('Chino', 'Rico. He is asking who handled it.', 3); }, 3400);
  }

  if (opt.revealStash) {
    S.stashFound = true;
    refs.stash.group.visible = true;
    completeObjective('stash');
  }
  if (opt.demandStash) {
    addHeat(8);
    setTimeout(() => { if (!S.betrayed) maybeBetray('counterfeit'); }, 2600);
  }
  if (opt.hintsThird) {
    S.slicerKnown = true;
    completeObjective('thirdman');
  }
  if (opt.betrayManny) {
    S.betrayedManny = true;
    toast('SECRET COOPERATION', 'warn', "Rico thinks you are taking his side. Manny's trust will not survive this");
    addHeat(-25);
  }
  if (nodeId === 'getaway') {
    setTimeout(() => startDrive(), 2600);
  }
  if (nodeId === 'mannyBrief') {
    setTimeout(() => toast('TIP', '', 'Look around the lot before you knock — every warning sign pays off'), 3000);
  }
}

// ---------- Inspection ----------
function openInspection() {
  inspecting = true;
  inspectEl.classList.add('show');
  inspectSerialEl.textContent = `SAMPLE ${shipment.serial} · RESTRICTED AGRICULTURAL PRODUCT`;
  renderInspection();
  timeScale = 0.55;
  addHeat(2);
}

function closeInspection() {
  inspecting = false;
  inspectEl.classList.remove('show');
  timeScale = 1;
  if (inspection.done.size >= 2 && !S.sampleTalked) {
    S.sampleTalked = true;
    setTimeout(() => {
      if (phase !== 'room') return;
      say('Prospect', 'This smoke is real.', 3);
      setTimeout(() => say('Rico', 'I told you.', 2.4), 2400);
      setTimeout(() => say('Prospect', 'I did not say the meat was real.', 3), 4200);
      setTimeout(() => { if (phase === 'room' && !dialogue && !S.betrayed) openDialogue('sample'); }, 6400);
    }, 900);
  }
}

function renderInspection() {
  const list = [];
  const all = inspection.available();
  const done = [...inspection.done];
  let idx = 0;
  for (const spec of [...all]) {
    idx++;
    list.push(`<button class="insp" data-id="${spec.id}"><span class="k">${idx}</span>${spec.label}</button>`);
  }
  for (const d of done) {
    list.push(`<button class="insp done" disabled><span class="k">✔</span>${d}</button>`);
  }
  inspectListEl.innerHTML = list.join('');
  inspectListEl.querySelectorAll('.insp[data-id]').forEach((b) => {
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

function runInspectionByIndex(i) {
  const all = inspection.available();
  if (i >= 0 && i < all.length) runInspection(all[i].id);
}

function runInspection(id) {
  const res = inspection.run(id);
  if (!res) return;
  addHeat(res.heat * (S.sat ? 0.5 : 1));   // sitting down makes them patient
  addRead(6);
  completeObjective('inspect');
  sfx.packaging();
  say('*', res.line, 4.2);
  if (res.prospect) setTimeout(() => say('Prospect', res.prospect, 3.4), 2200);
  renderInspection();

  if (res.revealed) {
    if (inspection.verdict === 'counterfeit') {
      if (inspection.correct()) {
        completeObjective('counterfeit');
        award('grain');
      }
      toast('COUNTERFEIT', 'warn', 'Somebody in this room sold you a wrapper');
      setTimeout(() => {
        closeInspection();
        if (!S.betrayed) openDialogue('counterfeit');
      }, 1800);
    } else {
      toast('GENUINE RESERVE', '', 'Dark red interior, marbled fat, serialised butcher stamp');
      if (shipment.grade !== 'genuine') {
        toast('...OR IS IT', 'warn', 'The sample was real. That is not the same as the shipment');
      }
    }
  }

  if (S.heat >= 100 && !S.betrayed) maybeBetray('heat');
}

// ---------- The betrayal ----------
function maybeBetray(trigger) {
  if (S.betrayed || (phase !== 'room' && phase !== 'door')) return;
  S.betrayed = true;
  phase = 'fight';
  S.fightStarted = true;
  if (inspection.done.size > 0) completeObjective('inspect', true);
  else failObjective('inspect');
  setObjective('survive', 'They are between you and the door');
  closeInspection();
  closeDialogue();
  sfx.setMusic('fight');
  sfx.setTension(1);

  say('Rico', 'Bring out the cutting board.', 3.4);
  toast('IT IS HAPPENING', 'warn', `Trigger: ${trigger}`);

  // The bathroom door opens and the third man walks out
  setTimeout(() => {
    openDoor(refs.bathDoor);
    sfx.doorOpen();
    sfx.sliceWhir();
    S.slicerRevealed = true;
    if (slicer) {
      slicer.state = 'chase';
      slicer.hostile = true;
      if (!S.slicerKnown) {
        say('*', 'The bathroom door opens behind you.', 3);
        damagePlayer(S.reactionBonus ? 8 : 18, 'the man you did not know about');
      } else {
        say('Prospect', 'I know. I heard you breathing an hour ago.', 3.2);
      }
    }
  }, S.reactionBonus ? 1500 : 900);

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

  // Manny reacts to gunfire / a broken window / a signal / the second car
  const mannyDelay = S.mannySignalled ? 3 : S.cluesFound.has('secondcar') ? 8 : 16;
  setTimeout(() => mannyJoins('the noise'), mannyDelay * 1000);
}

function mannyJoins(reason) {
  if (S.mannyInside || !manny || phase === 'end' || phase === 'drive') return;
  S.mannyInside = true;
  manny.state = 'follow';
  manny.hp = Math.max(60, manny.hp);
  say('Manny', MANNY_FIGHT_BARKS[Math.floor(Math.random() * MANNY_FIGHT_BARKS.length)], 3.2);
  toast('MANNY IS IN', '', `He heard ${reason}`);
  if (!S.windowBroken && !refs.frontDoor.open) breakWindow(true);
  // He brings the crowbar from the trunk — thrown to you if you're
  // empty-handed, kept and visibly wielded if you're not.
  if (S.weapon === 'fists') {
    dropWeaponPickup('crowbar', pos.x + 1.4, pos.z + 0.6);
    setTimeout(() => say('Manny', 'Crowbar! Catch it with your face if you have to!', 3), 1600);
  } else {
    manny.equip('crowbar');
  }
}

// ---------- Combat ----------
function onAttack() {
  if (phase === 'menu' || phase === 'end' || paused) return;
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

  for (const a of actors) {
    if (!a.alive || a.faction === 'friendly' || a === manny) continue;
    const dx = a.position.x - pos.x;
    const dz = a.position.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > st.reach + 0.6) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot < 0.25) continue;
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
    else if (!S.doorBroken && refs.frontDoor.collider.enabled && Math.hypot(tx - 0, tz + 4.5) < 2.2) breakFrontDoor();
    else sfx.whiff();
  }
  hitStop = Math.max(hitStop, hitAny ? 0.05 : 0);
}

function onRanged() {
  if (phase === 'menu' || phase === 'end' || paused || grapple) return;
  const st = WEAPON_STATS[S.weapon];
  if (!st) return;
  if (!st.ranged) { throwWeapon(); return; }
  if (S.ammo <= 0) { sfx.dryFire(); toast('EMPTY', 'warn', 'Nothing left in the wheel'); return; }
  if (attackCd > 0) return;
  attackCd = st.rate;
  S.ammo--;
  S.firedWeapon = true;
  S.usedNonImprovised = true;
  S.policeHeat += 12;
  failObjective('noshot');
  sfx.gunshot();
  shake = Math.max(shake, 0.45);
  updateGear();
  if (!S.mannyInside) mannyJoins('gunfire');

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
  toast('DROPPED', '', WEAPON_STATS[dropped].name);
}

function pickUpWeapon(kind) {
  S.weapon = kind;
  const st = WEAPON_STATS[kind];
  S.ammo = st.ammo || 0;
  if (st.improvised === false || st.ranged) S.usedNonImprovised = true;
  updateGear();
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
  S.policeHeat = Math.max(0, S.policeHeat + heat);
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
    if (a.carryingCase) dropCaseAt(a.position.x, a.position.z);
    if (S.moneyTakenByRico) {
      S.moneyRecovered = true;
      S.moneyTakenByRico = false;
      toast('MONEY RECOVERED', '', 'All $40,000, minus dignity');
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
  if (!S.mannyInside) mannyJoins('breaking glass');
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
  if (!S.mannyInside) mannyJoins('a door leaving its frame');
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
  setObjective('escape', 'Get back to the car');
  phase = 'escape';
  spawnReinforcements();
}

// ---------- Cases ----------
function makeCarryCase(color) {
  const c = makeJerkyCase(color);
  c.group.scale.setScalar(0.8);
  return c;
}

function placeMoneyCase() {
  if (carriedCases.money) { scene.remove(carriedCases.money); carriedCases.money = null; }
  const c = makeCarryCase(0x3a2a1a);
  c.group.position.set(1.4, 0.85, -6.4);
  scene.add(c.group);
  refs.moneyCase = { ...c, x: 1.4, z: -6.4 };
}

function takeJerkyCase() {
  S.carryingJerky = true;
  refs.jerkyCase.group.visible = false;
  completeObjective('recover');
  if (phase !== 'escape' && phase !== 'drive') {
    phase = 'escape';
    setObjective('escape', 'Back to Manny — front walkway, upstairs, the pool, or through the office');
    spawnReinforcements();
  }
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
  const spots = [{ x: 26, z: 4 }, { x: -26, z: 6 }, { x: 16, z: 16 }];
  const weapons = ['hook', 'prod', 'pistol'];
  spots.forEach((s, i) => {
    const a = spawnActor({ ...CAST.thug(weapons[i % weapons.length]), x: s.x, z: s.z, state: 'chase' });
    a.hostile = true;
  });
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
    setObjective('recover', 'Take the Reserve');
    phase = 'recover';
    say('Prospect', 'Now. Where is my meat.', 3);
  }
}

function actorReachedTarget(a) {
  if (a.faction === 'friendly') {
    a.target = null;
    a.afterGoto = null;
    a.state = S.mannyInside ? 'follow' : 'idle';
    return;
  }
  if (a === rico && a.afterGoto === 'grabmoney') {
    S.moneyTakenByRico = true;
    S.moneyRecovered = false;
    a.carryingCase = true;
    a.afterGoto = null;
    a.state = 'flee';
    a.target = pickRicoExit();
    say('Rico', 'Nothing personal. Everything financial.', 3.2);
  } else if (a === rico && a.state === 'flee') {
    ricoEscapes(a);
  } else if (a === chino && a.carryingCase) {
    throwCaseInPool(a);
    a.state = 'chase';
  } else {
    a.state = 'chase';
  }
}

function pickRicoExit() {
  if (refs.frontDoor.open || S.doorBroken) return { x: 0, z: 8, via: 'the front walkway' };
  if (S.windowBroken) return { x: 3.0, z: -5.2, via: 'the smashed front window' };
  return { x: 3.3, z: -14.4, via: 'the bathroom window' }; // over the tub and out
}

// A seller who cannot reach where they were running gives up on the idea.
function actorStuck(a) {
  if (a === rico) {
    ricoEscapes(a);
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
    S.moneyRecovered = false;
    failObjective('money');
    toast('RICO IS GONE', 'warn', `Out through ${via}, with the forty thousand`);
  } else {
    toast('RICO IS GONE', '', `Out through ${via}`);
  }
  checkRoomCleared();
}

function boardGetaway() {
  if (phase === 'drive' || phase === 'boarding' || phase === 'end') return;
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
  say('Manny', 'Tell me that was worth it.', 3.4);
  setTimeout(() => openDialogue('getaway'), 1400);
}

// ---------- Doors ----------
function openDoor(d) {
  d.open = true;
  d.targetAngle = -2.2;
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
    const t = d.targetAngle ?? (d.open ? -2.2 : 0);
    d.angle = (d.angle ?? 0) + (t - (d.angle ?? 0)) * Math.min(1, 8 * dt);
    d.pivot.rotation.y = d.angle;
  }
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
      if (holder) { dropCaseAt(holder.position.x + 1.2, holder.position.z); }
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

// What Prospect is standing on, for footstep and landing sounds.
function surfaceUnderfoot() {
  const r = level.rects;
  if (feetY < -1) return 'pool';
  if (pos.x > r.BATH.x0 && pos.x < r.BATH.x1 && pos.z > r.BATH.z0 && pos.z < r.BATH.z1) return 'tile';
  if (insideRoom()) return 'carpet';
  if (pos.x > r.ROOM11.x0 && pos.x < r.ROOM11.x1 && pos.z > r.ROOM11.z0 && pos.z < r.ROOM11.z1) return 'carpet';
  if (feetY > 0.6) return 'stairs';
  if (pos.z > 0 && pos.z < 26) return 'asphalt';
  return 'concrete';
}

function tryJump() {
  if (grapple || phase === 'car' || phase === 'menu' || phase === 'drive') return;
  const ground = level.floorAt(pos.x, pos.z, feetY);
  if (Math.abs(feetY - ground) < 0.12) {
    vy = JUMP_V;
    sfx.land(false);
  }
}

function updatePlayer(dt) {
  if (phase === 'car' || phase === 'boarding') {
    if (phase === 'boarding') pos.set(-6.9, 0, 16.4);
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
  const sprinting = keys.has('sprint') || (touch.active && Math.hypot(touch.x, touch.y) > 0.9);
  let speed = sprinting ? RUN : WALK;
  if (S.carryingJerky) speed *= 0.92;
  if (blindT > 0) speed *= 0.6;

  const prevX = pos.x;
  const prevZ = pos.z;
  player.group.position.set(pos.x, 0, pos.z);
  player.update(dt, move, speed, sprinting, () => sfx.step(surfaceUnderfoot()));
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

function updateCamera(dt) {
  if (keys.has('turnL')) camYaw += dt * 2.2;
  if (keys.has('turnR')) camYaw -= dt * 2.2;
  if (keys.has('lookU')) camPitch = Math.min(0.5, camPitch + dt * 1.2);
  if (keys.has('lookD')) camPitch = Math.max(-0.85, camPitch - dt * 1.2);

  const dirX = Math.sin(camYaw) * Math.cos(camPitch);
  const dirZ = Math.cos(camYaw) * Math.cos(camPitch);
  const dirY = Math.sin(camPitch);
  const bodyBob = phase === 'car' || phase === 'boarding'
    ? 0
    : Math.max(-0.06, Math.min(0.08, player.group.position.y - feetY));
  const eyeY = (phase === 'car' || phase === 'boarding' ? 1.55 : feetY + PLAYER_EYE)
    + bodyBob * 0.45;

  // Motel play is first-person in every walkable phase. The old trailing
  // camera repeatedly wedged Tony's body between the lens, room furniture,
  // and doors, making the already-dense room unreadable.
  _camPos.set(pos.x, eyeY, pos.z);
  camera.position.copy(_camPos);
  player.group.visible = false;

  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.6);
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake * 0.6;
    camera.position.z += (Math.random() - 0.5) * shake;
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
  if (phase === 'menu' || phase === 'end' || phase === 'drive' || phase === 'boarding' || grapple) {
    promptEl.classList.remove('show');
    return;
  }
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  let best = null;
  let bestScore = -Infinity;
  for (const it of interactables) {
    if (it.enabled && !it.enabled()) continue;
    const p = it.follow ? it.follow() : it;
    if (!p) continue;
    const dx = p.x - pos.x;
    const dz = p.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > (it.r || 3.2)) continue;
    const dot = d < 0.6 ? 1 : (dx * fx + dz * fz) / d;
    if (dot < -0.2) continue;
    const score = dot * 2 - d * 0.12;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  activeInteract = best;
  if (best) {
    promptEl.innerHTML = `<b>[E]</b> ${best.label()}`;
    promptEl.classList.add('show');
  } else {
    promptEl.classList.remove('show');
  }
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

// ---------- Gear HUD ----------
function updateGear() {
  const st = WEAPON_STATS[S.weapon] || WEAPON_STATS.fists;
  weaponNameEl.textContent = st.name + (st.ammo ? ` · ${S.ammo}` : '');
  weaponSubEl.textContent = `${st.improvised === false ? 'seized' : 'improvised'} · ${st.lethal ? 'lethal' : 'non-lethal'}`;
  const carry = [];
  if (S.carryingMoney) carry.push('💼 $40,000');
  if (S.couponOnly) carry.push('🎟️ one expired coupon');
  if (S.carryingJerky) carry.push(`🥩 The Reserve ${S.packagesIntact}/8`);
  if (S.stashTaken) carry.push('📦 premium stash');
  carryLineEl.textContent = carry.join('  ·  ');
}

// ---------- The drive ----------
const drive = {
  scene: null, car: null, road: [], hostiles: [], traffic: [],
  x: 0, speed: 30, dist: 0, target: 1500, t: 0, mannyBiteT: 8, spawnT: 1.5,
};

function buildDriveScene() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x090c16);
  s.fog = new THREE.Fog(0x0d1220, 30, 170);
  s.add(new THREE.HemisphereLight(0x33405c, 0x0a0a0c, 0.7));
  const key = new THREE.DirectionalLight(0x9fb4e8, 0.5);
  key.position.set(-20, 40, -30);
  s.add(key);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 1200), lambert(0x16241c));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -400;
  s.add(ground);

  for (let i = 0; i < 24; i++) {
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(20, 50), lambert(0x1e1e24));
    seg.rotation.x = -Math.PI / 2;
    seg.position.set(0, 0.01, -i * 50);
    s.add(seg);
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 14), lambert(0xd8c86a, { emissive: 0x6a5a20 }));
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.03, -i * 50);
    s.add(dash);
    const palmL = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 8, 6), lambert(0x5c4a32));
    palmL.position.set(-14, 4, -i * 50);
    s.add(palmL);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), lambert(0xffe6a8, { emissive: 0xffb060 }));
    lamp.position.set(14, 7, -i * 50);
    s.add(lamp);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 7, 6), lambert(0x4a4a52));
    pole.position.set(14, 3.5, -i * 50);
    s.add(pole);
    // The left side gets the same fixtures as the right, so the street reads
    // lit on both shoulders instead of dark past the palm trunks.
    const lampL = lamp.clone();
    lampL.position.set(-14, 7, -i * 50);
    s.add(lampL);
    const poleL = pole.clone();
    poleL.position.set(-14, 3.5, -i * 50);
    s.add(poleL);
    drive.road.push({ seg, dash, palmL, lamp, pole, lampL, poleL, z: -i * 50 });
  }

  drive.car = buildDriveCar(0x6b2f3a, true);
  s.add(drive.car);
  drive.scene = s;
  return s;
}

function buildDriveCar(color, player = false) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 4.6), lambert(color));
  body.position.y = 0.85;
  g.add(body);
  if (!player) {
    // Traffic reads fine as a closed sedan, and it keeps the light budget at
    // two spotlights total instead of two per spawned car.
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2.2), lambert(0x121820, { emissive: 0x0a1016 }));
    cabin.position.set(0, 1.65, -0.2);
    g.add(cabin);
    return finishDriveCar(g);
  }
  // Convertible, like the movie car: an open cockpit tub with seats, a dash,
  // and a raked windshield instead of the old solid cabin block.
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 2.2), lambert(0x1a1c22));
  tub.position.set(0, 1.31, -0.2);
  g.add(tub);
  for (const sx of [-0.45, 0.45]) {
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.6), lambert(0x5a2c2c));
    cushion.position.set(sx, 1.4, -0.5);
    g.add(cushion);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.44, 0.12), lambert(0x5a2c2c));
    back.position.set(sx, 1.62, -0.86);
    back.rotation.x = 0.14;
    g.add(back);
  }
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 0.36), lambert(0x14161c, { emissive: 0x101418 }));
  dash.position.set(0, 1.5, 0.62);
  g.add(dash);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.03, 6, 14), lambert(0x0e0f13));
  wheel.position.set(-0.45, 1.56, 0.44);
  wheel.rotation.x = 1.15;
  g.add(wheel);
  const shield = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.5, 0.05),
    lambert(0xbcd2e0, { transparent: true, opacity: 0.25 }),
  );
  shield.position.set(0, 1.72, 0.92);
  shield.rotation.x = -0.3;
  g.add(shield);
  const shieldFrame = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.05, 0.06), lambert(0x8a8f98));
  shieldFrame.position.set(0, 1.95, 0.85);
  shieldFrame.rotation.x = -0.3;
  g.add(shieldFrame);
  // Real headlight throw — two unshadowed spots plus visible emissive beams.
  for (const sx of [-0.65, 0.65]) {
    const spot = new THREE.SpotLight(0xfff0c8, 2.2, 60, 0.45, 0.6, 1);
    spot.castShadow = false;
    spot.position.set(sx, 0.9, -2.3);
    spot.target.position.set(sx * 1.4, 0.1, -40);
    g.add(spot, spot.target);
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 9, 8, 1, true),
      lambert(0xfff2c8, { emissive: 0xd8be78, transparent: true, opacity: 0.08 }),
    );
    beam.position.set(sx, 0.85, -6.8);
    beam.rotation.x = -Math.PI / 2;
    g.add(beam);
  }
  return finishDriveCar(g);
}

/** Wheels and lamp faces, shared by the player car and traffic. */
function finishDriveCar(g) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1.5, 1.5]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10), lambert(0x14141a));
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * 0.95, 0.45, sz);
      g.add(w);
    }
  }
  for (const sx of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.1), lambert(0xfff0c0, { emissive: 0xffe090 }));
    hl.position.set(sx, 0.9, -2.32);
    g.add(hl);
  }
  return g;
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
  setObjective('escape', S.mannyInjured ? 'Manny is hurt — you are driving' : 'Get to the Sasquatch safehouse');
  say(S.mannyInjured ? 'Prospect' : 'Manny', S.mannyInjured ? 'Hold the case. I am driving.' : 'Seatbelt. Or do not. You are the size of a seatbelt.', 3.6);
  if (S.windowBroken) toast('BROKEN WINDOW', 'warn', 'Warm air over the shipment all the way home');
}

function updateDrive(dt) {
  drive.t += dt;
  const steer = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0) + (touch.active ? touch.x : 0);
  const accel = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0) + (touch.active ? -touch.y * 0.6 : 0);
  drive.speed = THREE.MathUtils.clamp(drive.speed + accel * 14 * dt, 14, 52);
  drive.x = THREE.MathUtils.clamp(drive.x + steer * 13 * dt, -8.4, 8.4);
  drive.dist += drive.speed * dt;

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
    const car = buildDriveCar(hostile ? 0x2f3a6b : [0x8a8a92, 0x3f5f3a, 0x6a5a3a][Math.floor(Math.random() * 3)]);
    // Pursuers come up from behind; everyone else is oncoming traffic
    car.position.set((Math.random() - 0.5) * 15, 0, hostile ? 90 : -180);
    car.userData = { hostile, speed: hostile ? drive.speed + 9 : 12 + Math.random() * 10, hp: 2 };
    drive.scene.add(car);
    (hostile ? drive.hostiles : drive.traffic).push(car);
  }

  const advance = (list) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      const rel = c.userData.hostile
        ? drive.speed - c.userData.speed
        : drive.speed - c.userData.speed;
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
    promptEl.innerHTML = `<b>[E]</b> ${S.mannyInjured ? 'Put them into the guardrail' : 'Tell Manny to ram them'}`;
    promptEl.classList.add('show');
  } else {
    promptEl.classList.remove('show');
  }

  // Manny helps himself to the evidence
  drive.mannyBiteT -= dt;
  if (drive.mannyBiteT <= 0 && !S.mannyInjured && S.carryingJerky) {
    drive.mannyBiteT = 11 + Math.random() * 8;
    freshness.damage(4, 'Manny "checking quality"');
    sfx.chew();
    say('Manny', 'I am checking quality!', 3);
    setTimeout(() => say('Prospect', 'Stop eating the shipment!', 3), 1500);
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
  // side unless Manny is injured and Tony has to take the wheel.
  const seatX = S.mannyInjured ? -0.42 : 0.42;
  camera.position.set(drive.x + seatX, 1.62, 0.25);
  camera.lookAt(drive.x + seatX - steer * 0.8, 1.5, -22);
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.8);
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
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
  toast('OFF THE ROAD', '', S.mannyInjured ? 'You put them into the guardrail' : 'Manny put them into the guardrail');
  say(S.mannyInjured ? 'Prospect' : 'Manny', S.mannyInjured ? 'Stay down.' : 'That was my door!', 2.8);
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
    lines.push(['*', 'The vehicle disappears down the road. Manny looks at the damaged suitcase.']);
    lines.push(ENDING[0]);
    if (haul) {
      const intact = S.stashTaken || S.cratesFound ? Math.max(3, S.packagesIntact) : S.packagesIntact;
      lines.push(['*', `Prospect opens the case. Inside are ${intact === 0 ? 'no' : intact} intact strip${intact === 1 ? '' : 's'} of rare jerky${S.couponOnly ? ' and the expired steakhouse coupon' : ''}.`]);
      lines.push(['*', 'Prospect takes one strip, studies it, and bites. A long pause.']);
      lines.push(ENDING[2]);
      if (shipment.grade === 'counterfeit' && !inspection.correct()) {
        lines.push(['Prospect', 'This is gas-station product.']);
        lines.push(['Manny', 'We paid forty thousand dollars for gas-station product.']);
        lines.push(['*', 'This will follow Prospect around for a long time.']);
      } else {
        lines.push(ENDING[3]);
      }
    } else {
      lines.push(['Prospect', 'It survived the way a rumour survives.']);
      if (S.wrongCase) lines.push(['Manny', 'I grabbed a case. It is full of smoked turkey. It is warm.']);
    }
  } else if (kind === 'walked') {
    lines.push(['Manny', 'Good. Best deal we ever made was the one we did not.']);
  }

  $('endLines').innerHTML = lines.map(([who, line]) =>
    who === '*'
      ? `<div class="stage">${line}</div>`
      : `<div><span class="who${who === 'Prospect' ? ' prospect' : ''}">${who}</span> — ${line}</div>`
  ).join('');

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
  if (S.betrayedManny) notes.push("You took Rico's side out loud. Manny heard the shape of it.");
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
  if (barkT <= 0) {
    barkT = 7 + Math.random() * 7;
    if (phase === 'room' && !dialogue && !S.betrayed) {
      const [who, line] = SELLER_BARKS[Math.floor(Math.random() * SELLER_BARKS.length)];
      say(who, line, 3.2);
      if (who === 'Rico' && rico) rico.talkT = 1.6;
      if (who === 'Chino' && chino) chino.talkT = 1.6;
    } else if (phase === 'lot' && Math.random() < 0.5) {
      say('Manny', MANNY_BARKS[Math.floor(Math.random() * MANNY_BARKS.length)], 3.2);
    } else if ((phase === 'fight' || phase === 'recover') && Math.random() < 0.7) {
      const [who, line] = FIGHT_BARKS[Math.floor(Math.random() * FIGHT_BARKS.length)];
      say(who, line, 2.8);
    } else if (phase === 'room' && Math.random() < 0.4) {
      say('Prospect', PROSPECT_BARKS[Math.floor(Math.random() * PROSPECT_BARKS.length)], 3);
    }
  }

  // Tension follows suspicion, then pins during the fight
  sfx.setTension(S.betrayed ? 1 : Math.max(S.heat, S.read * 0.5) / 100);

  // Interest from the police cools off slowly while you are on foot
  if (phase !== 'drive' && phase !== 'menu') S.policeHeat = Math.max(0, S.policeHeat - dt * 0.35);
}

function updateRoomBeats(dt) {
  if (phase !== 'room' || S.betrayed) return;
  roomT += dt;
  while (roomEventIdx < roomEvents.length && roomT >= roomEvents[roomEventIdx].t) {
    roomEvents[roomEventIdx].run();
    roomEventIdx++;
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
    rico.state = 'flee';
    rico.target = pickRicoExit();
    say('Rico', 'Not worth it, not worth it!', 2.6);
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
    say('Manny', 'Blue lights on the road! We are leaving with or without you!', 3.6);
    setObjective('escape', 'Get to the car before the lot fills up');
    for (const a of actors) {
      if (a.role === 'seller' && a.alive) { a.state = 'panic'; a.hostile = false; }
    }
  }

  if (manny && S.mannyInside && manny.hp < 60 && !S.mannyInjured) {
    S.mannyInjured = true;
    toast('MANNY IS HURT', 'warn', 'You are driving');
    say('Manny', 'I am fine. That is not my blood. Probably.', 3.2);
  }
}

// ---------- Loop ----------
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  if (paused) { renderer.render(phase === 'drive' ? drive.scene : scene, camera); return; }
  const raw = Math.min(clock.getDelta(), 0.05);

  if (hitStop > 0) {
    hitStop -= raw;
    renderer.render(phase === 'drive' ? drive.scene : scene, camera);
    return;
  }

  const dt = raw * timeScale;

  if (phase === 'drive') {
    updateDrive(dt);
    updateHud(raw);
    renderer.render(drive.scene, camera);
    return;
  }

  if (phase !== 'menu') {
    attackCd = Math.max(0, attackCd - dt);
    invuln = Math.max(0, invuln - dt);
    blindT = Math.max(0, blindT - dt);
    if (player.consumeImpact() && pendingHit) { resolvePlayerHit(pendingHit); pendingHit = null; }

    updatePlayer(dt);
    updateRoomBeats(dt);
    updateFightLogic(dt);

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
  updateHud(raw);
  renderer.render(scene, camera);
}

function updateHud(dt) {
  if (subtitleT > 0) {
    subtitleT -= dt;
    if (subtitleT <= 0) subtitleEl.classList.remove('show');
  }
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
  S, level, refs, actors, shipment, inspection, freshness, campaign, story: motelStory, player,
  get phase() { return phase; },
  get ending() { return lastEndingKind; },
  get campaignState() { return campaign.state; },
  get pos() { return pos; },
  get objectives() { return { done: [...objDone], failed: [...objFailed] }; },
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
  isBlocked: (x, z, y = feetY, radius = PLAYER_R) => blocked(x, z, y, radius),
  start: startScene,
  teleport: (x, z) => { pos.set(x, 0, z); feetY = level.floorAt(x, z, 0); },
  face: (x, z) => { camYaw = Math.atan2(x - pos.x, z - pos.z); },
  get hostiles() { return actors.filter((a) => a.alive && a.hostile).map((a) => a.name); },
  use: () => onUse(),
  attack: () => onAttack(),
  activeInteract: () => (activeInteract ? activeInteract.id : null),
  forceInteract: (id) => { const i = ix(id); if (i && (!i.enabled || i.enabled())) i.act(); return !!i; },
  betray: () => maybeBetray('debug'),
  pick: (style) => pickDialogue(style),
  inspectAll: () => { for (const s of [...inspection.available()]) runInspection(s.id); },
  finish: (k) => finishScene(k || 'home'),
  drive: () => startDrive(),
  get driveState() { return drive; },
};
