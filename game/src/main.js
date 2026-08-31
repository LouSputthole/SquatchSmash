import * as THREE from 'three';
import { buildWorld, BOUNDS } from './world.js';
import { Sasquatch, skinById } from './player.js';
import { DebrisSystem } from './debris.js';
import { Effects } from './effects.js';
import { CamperSystem } from './campers.js';
import { RangerSystem } from './rangers.js';
import { Boss, BOSS_NAME } from './boss.js';
import { buildGoals, GoalTracker, renderGoalList, renderGoalSummary } from './goals.js';
import { loadMeta, recordRun, setSkin, renderCareer, renderSkins, ratingFor, rankFor, nextRank } from './meta.js';
import * as sfx from './audio.js';
import { createPauseMenu } from '../../src/core/pause-menu.js';

const GAME_TIME = 90;
const BASE_SPEED = 10;
const SPRINT_SPEED = 15;
const BASE_SMASH_RADIUS = 2.6;
const RAGE_DURATION = 8;
const BASE_FOV = 60;
const RAGE_FOV = 68;
const BEST_KEY = 'squatchsmash-best';
const LB_KEY = 'squatchsmash-lb';
const CAMPER_POINTS = 300;
const RANGER_POINTS = 750;
const STOMP_COOLDOWN = 4;
const FRENZY_AT = 15;
const BOSS_AT = 30;        // seconds left when the Ranger Captain rolls in
const BOSS_POINTS = 3000;

// Occupants come pouring out when you hit their shelter
const OCCUPANTS = { cabin: 3, rv: 2, car: 1, truck: 1, tent: 1, outhouse: 1 };

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 500);

const { props, flames, flags, sun, smashableCount, pond } = buildWorld(scene, renderer);
const player = new Sasquatch();
scene.add(player.group);
const debris = new DebrisSystem(scene);
const effects = new Effects(scene);
const campers = new CamperSystem(scene, props, pond, 10);
const rangers = new RangerSystem(scene, props);
const boss = new Boss(scene, props);

for (const prop of props) prop.occupants = OCCUPANTS[prop.type] || 0;
const countType = (t) => props.filter((p) => p.type === t).length;

// ---------- Career (local to this machine) + goals ----------
let meta = loadMeta();
player.setPalette(skinById(meta.skin).pal);

const goals = new GoalTracker(buildGoals({
  vehicles: countType('car') + countType('rv') + countType('truck'),
  campsite: countType('tent') + countType('campfire'),
  trees: countType('tree'),
  hives: countType('beehive'),
  gnomes: countType('gnome'),
  smashable: smashableCount,
}), onGoalComplete);

// Day fades to sunset as the clock runs down
const SKY_DAY = new THREE.Color(0x9fc4e8);
const SKY_DUSK = new THREE.Color(0xe8a06a);
const SUN_DAY = new THREE.Color(0xfff2d8);
const SUN_DUSK = new THREE.Color(0xffb877);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- HUD elements ----------
const $ = (id) => document.getElementById(id);
const hudEl = $('hud');
const scoreEl = $('score');
const wreckedEl = $('wrecked');
const killsEl = $('kills');
const buffsEl = $('buffs');
const timerEl = $('timer');
const comboEl = $('combo');
const comboBarEl = $('comboBarFill');
const comboBarWrapEl = $('comboBar');
const rageFillEl = $('rageFill');
const ragePromptEl = $('ragePrompt');
const stompHudEl = $('stompHud');
const stompFillEl = $('stompFill');
const vignetteEl = $('vignette');
const tranqTintEl = $('tranqTint');
const flashEl = $('flash');
const bannerEl = $('banner');
const muteBtn = $('muteBtn');
const nameInput = $('nameInput');
const goalListEl = $('goalList');
const goalCountEl = $('goalCount');
const bossBarEl = $('bossBar');
const bossFillEl = $('bossFill');

// ---------- Game state ----------
let state = 'menu'; // 'menu' | 'playing' | 'paused' | 'over'
let sharedPauseMenu = null;
let score = 0;
let timeLeft = GAME_TIME;
let destroyed = 0;
let combo = 0;
let comboTimer = 0;
let bestCombo = 1;
let rage = 0; // 0..1
let rageTimer = 0;
let shake = 0;
let fovPunch = 0;
let hitStop = 0;
let camYaw = 0;
let chargeCooldown = 0;
let stompCooldown = 0;
let slowTimer = 0;      // tranq dart
let speedBoostT = 0;    // coffee
let giantT = 0;         // mushroom
let campersScared = 0;
let campersSmashed = 0;
let rangersSmashed = 0;
let gnomesSmashed = 0;
let killStreak = 0;
let killStreakTimer = 0;
let auraAcc = 0;
let frenzyStarted = false;
let backupSent = false;
let bossSent = false;
let bossDowned = false;
let bossHitCd = 0;
let goalVersionShown = -1;
let blastDepth = 0;      // >0 while an explosion chain is resolving
let chainPropane = 0;    // propane tanks popped in the current chain
let burnKills = 0;
const destroyedByType = {};
const burning = [];
const swarms = [];
const pickups = [];

const frenzyMult = () => (frenzyStarted ? 2 : 1);

// ---------- Leaderboard ----------
function loadBoard() {
  try {
    const b = JSON.parse(localStorage.getItem(LB_KEY) || '[]');
    return Array.isArray(b) ? b.filter((e) => e && typeof e.score === 'number') : [];
  } catch { return []; }
}
function saveBoard(b) {
  try { localStorage.setItem(LB_KEY, JSON.stringify(b)); } catch { /* best effort */ }
}
function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* best effort */ }
}

function renderBoard(listEl, board, highlightIdx = -1) {
  listEl.innerHTML = '';
  if (!board.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No scores yet — be the first!';
    listEl.appendChild(li);
    return;
  }
  board.forEach((entry, i) => {
    const li = document.createElement('li');
    if (i === highlightIdx) li.className = 'you';
    li.innerHTML = `<span class="rank">${i + 1}</span><span class="name"></span><span class="pts"></span>`;
    li.querySelector('.name').textContent = entry.name;
    li.querySelector('.pts').textContent = entry.score.toLocaleString();
    listEl.appendChild(li);
  });
}

renderBoard($('menuBoard'), loadBoard());

// ---------- Goals ----------
// Goal points are flat: no combo, no frenzy doubling, so the rank they feed
// into means the same thing on every run.
function onGoalComplete(goal) {
  score += goal.points;
  showBanner(`${goal.icon} ${goal.label.toUpperCase()}! +${goal.points.toLocaleString()}`);
  sfx.goalDing();
}

function refreshGoalHUD(force = false) {
  if (!force && goals.version === goalVersionShown) return;
  goalVersionShown = goals.version;
  renderGoalList(goalListEl, goals);
  goalCountEl.textContent = `${goals.completed}/${goals.total}`;
}

refreshGoalHUD(true);
$('bossName').textContent = BOSS_NAME;

// ---------- Career panel (menu) ----------
function refreshCareer() {
  renderCareer($('careerStats'), meta);
  renderSkins($('skinList'), meta, (id) => {
    meta = setSkin(id);
    player.setPalette(skinById(id).pal);
    refreshCareer();
  });
}

refreshCareer();

// ---------- Input ----------
const keys = new Set();
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
};

window.addEventListener('keydown', (e) => {
  if (e.target === nameInput) {
    if (e.code === 'Enter') submitScore();
    return; // let them type without triggering game hotkeys
  }
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
  if (e.code === 'Space') {
    e.preventDefault();
    if (state === 'playing') trySmash();
  }
  if (e.code === 'KeyF' && state === 'playing') tryStomp();
  if (e.code === 'KeyR' && state === 'playing') tryRage();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  /* [Q] BACKS YOU OUT OF THE COMPUTER, from in here.
   *
   * On the apartment desk this page owns the keyboard, so the apartment's own
   * "[Q] is the stand-up key everywhere" handler never sees it and Q did
   * nothing at all -- there is no Q in this game. Owner, 2026-08-27: *"at the
   * beginning you still can't get up. It needs to pan out. Q doesn't work to
   * get you up."*
   *
   * During the cold open Q takes the SAME door the YES button takes, rather
   * than calling the host directly. Calling `quitSquatchSmash()` on its own
   * does move the sequence to `shutdown` -- measured, it returns true and the
   * phase flips -- and then nothing else happens, because this page is still
   * sitting over the monitor. `confirmQuit` is the whole gesture: it drops the
   * confirm box, shows the shutdown card, stops the music and calls the host
   * half a second later, which is the path the reveal has always been driven
   * down. One quit door, not two that drift apart.
   *
   * Not while the quit box is up -- that box owns the screen, and Q behind it
   * would answer a question it has not been given a chance to ask. Standalone
   * (no apartment above us) there is nothing to stand up from, and at any
   * later sitting there is no reveal to play, so the host does the plain
   * stand instead. */
  if (e.code === 'KeyQ' && !quitConfirmOpen()) {
    const host = apartmentHost();
    if (host?.coldOpenActive?.()) {
      confirmQuit();
      e.preventDefault();
    } else if (host?.standUp?.()) {
      e.preventDefault();
    }
  }
  if (e.code === 'Enter' && state === 'menu') startGame();
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]);
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousedown', (e) => {
  if (state !== 'playing' || e.target.closest('button, input, .touch-btn')) return;
  if (e.button === 2) tryStomp();
  else if (e.button === 0) trySmash();
});
window.addEventListener('blur', () => keys.clear());

$('startBtn').addEventListener('click', (e) => { e.stopPropagation(); startGame(); });
$('restartBtn').addEventListener('click', () => location.reload());
$('resumeBtn').addEventListener('click', () => togglePause());

/* ------------------------------------------------------------------ */
/* QUITTING                                                            */
/*                                                                     */
/* Standalone, this is an ordinary quit: confirm, and go back to the    */
/* menu. Embedded on the apartment's desk monitor it is the opening of  */
/* SQUATCH LIFE -- the player believes he is closing the game he        */
/* downloaded, and instead the camera comes off the monitor. See        */
/* src/core/cold-open.js. Nothing here knows which of those is          */
/* happening beyond "is there a parent that wants to be told".          */
/* ------------------------------------------------------------------ */

/** The apartment, if this page is running on its monitor. Same-origin. */
function apartmentHost() {
  try {
    return window.top !== window ? window.parent?.__SQUATCH_SMASH_HOST ?? null : null;
  } catch {
    /* Cross-origin: it is not our apartment, so it is a standalone run. */
    return null;
  }
}

/** True while "QUIT SQUATCH SMASH?" is on screen and owns the input. */
function quitConfirmOpen() {
  return !$('quitConfirm').classList.contains('hidden');
}

/**
 * THE QUIT BOX, AND THE PAUSE MENU IT HAS TO GET OUT FROM UNDER.
 *
 * This used to hide `#pause` -- the page's own PAUSED overlay, the one with
 * RESUME / GIVE UP / QUIT on it. That overlay has not opened since the shared
 * pause menu was adopted: `togglePause()` delegates to `sharedPauseMenu` the
 * moment one exists, and one always does. So `#quitBtn` became unreachable
 * UI, and with it the ONLY way out of this game -- which on the apartment
 * desk is also the only way into the reveal. Owner, twice: *"still can't get
 * out of the Squatch Smash game."* He was not missing it. It was not there.
 *
 * The menu's root is hidden directly rather than resumed, because the game
 * must stay PAUSED behind the confirm box exactly as it did behind `#pause`:
 * resuming would put the campground back in motion under a box asking whether
 * to close it, and would restart the music over the top.
 */
function askToQuit() {
  if (state === 'playing') togglePause();
  sharedPauseMenu?.root?.classList.add('hidden');
  $('pause').classList.add('hidden');
  $('quitConfirm').classList.remove('hidden');
}

function cancelQuit() {
  $('quitConfirm').classList.add('hidden');
  /* Back to whichever menu he came from, still paused. */
  if (sharedPauseMenu?.isPaused?.()) sharedPauseMenu.root.classList.remove('hidden');
  else $('pause').classList.remove('hidden');
}

function confirmQuit() {
  $('quitConfirm').classList.add('hidden');
  /* It looks like it is closing. Half a second of that, and then either the
   * menu (standalone) or the reveal (on the desk). */
  $('shutdown').classList.remove('hidden');
  sfx.stopMusic?.();
  sfx.stopAmbience?.();
  const host = apartmentHost();
  window.setTimeout(() => {
    if (host?.quitSquatchSmash) host.quitSquatchSmash();
    else location.reload();
  }, 520);
}

$('quitBtn').addEventListener('click', askToQuit);
$('quitYes').addEventListener('click', confirmQuit);
$('quitNo').addEventListener('click', cancelQuit);
$('giveUpBtn').addEventListener('click', () => {
  if (state !== 'paused') return;
  $('pause').classList.add('hidden');
  state = 'playing';
  endGame(false);
});
$('submitScore').addEventListener('click', () => submitScore());
muteBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });
nameInput.addEventListener('input', () => {
  nameInput.value = nameInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
});

function toggleMute() {
  sfx.setMuted(!sfx.isMuted());
  muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊';
}

function togglePause() {
  /* The confirm box owns the screen while it is up: P or Escape underneath it
   * would resume the campground behind a box asking whether to close it. */
  if (quitConfirmOpen()) return;
  if (sharedPauseMenu) {
    sharedPauseMenu.toggle();
    return;
  }
  if (state === 'playing') {
    state = 'paused';
    sfx.stopMusic();
    sfx.stopAmbience();
    $('pauseStats').innerHTML =
      `Score: <b>${score.toLocaleString()}</b><br>` +
      `Kills: <b>${campersSmashed + rangersSmashed}</b> · Wrecked: <b>${destroyed} / ${smashableCount}</b><br>` +
      `Goals: <b>${goals.completed} / ${goals.total}</b><br>` +
      `Time left: <b>${Math.ceil(timeLeft)}s</b>`;
    $('pause').classList.remove('hidden');
  } else if (state === 'paused') {
    state = 'playing';
    sfx.startMusic();
    $('pause').classList.add('hidden');
    clock.getDelta(); // swallow the paused time
  }
}

sharedPauseMenu = createPauseMenu({
  title: 'Squatch Smash',
  canPause: () => !quitConfirmOpen() && (state === 'playing' || state === 'paused'),
  // The apartment owns Tab while this page is running on the desk monitor.
  // P and Escape still pause the hidden run when SquatchOS closes the app.
  canHandleTab: () => window.top === window && !quitConfirmOpen()
    && (state === 'playing' || state === 'paused'),
  /* No SAVE DATA block while the fake-out is live: during the cold open this
   * page is pretending to be a game he downloaded, and Squatch Life's save
   * controls sitting in its pause menu give the reveal away before the camera
   * moves. Asked fresh on every pause -- the answer changes the moment the
   * camera comes off the monitor, and this menu is built once at boot. */
  showSaveData: () => !apartmentHost()?.coldOpenActive?.(),
  getObjective: () => `Smash the campground before time runs out. ${Math.ceil(timeLeft)} seconds remain; ${goals.completed} of ${goals.total} goals complete.`,
  instructions: () => {
    const rows = [
      'W A S D or arrows — move. Shift — charge.',
      'Space or left click — smash.',
      'F or right click — ground stomp.',
      'R — rage mode when the bar is full. M — mute.',
    ];
    /* The opening works only while Squatch Smash plausibly is the downloaded
     * game. The old help copy named the apartment and SquatchOS before the
     * player could press Quit, spoiling the reveal on its required route. */
    if (apartmentHost()?.coldOpenActive?.()) {
      rows.push('Escape — pause. Hold Tab — quit Squatch Smash.');
    } else {
      rows.push('Standalone: Tab, P or Escape — pause.');
      rows.push('At the apartment desk: Tab — exit to SquatchOS; Q — leave the desk.');
    }
    return rows;
  },
  onPause: () => {
    state = 'paused';
    keys.clear();
    sfx.stopMusic();
    sfx.stopAmbience();
  },
  onResume: () => {
    state = 'playing';
    sfx.startMusic();
    clock.getDelta();
  },
  /* GIVE UP ends the RUN. QUIT closes the GAME -- and on the apartment desk
   * that is the whole opening of Squatch Life. They are not the same door and
   * the menu has to offer both; offering only the first is what left the
   * player with no way out at all. `close: false` keeps the menu open so
   * `askToQuit` can hand the screen straight to the confirm box without the
   * campground starting up again in between. */
  actions: [
    { label: 'Give up', onSelect: () => endGame(false) },
    { label: 'Quit Squatch Smash', close: false, onSelect: () => askToQuit() },
  ],
});

// ---------- Touch controls ----------
const touch = { active: false, x: 0, y: 0 };
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
    touch.x = 0;
    touch.y = 0;
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

  $('smashBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'playing') trySmash();
  });
  $('stompBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'playing') tryStomp();
  });
  $('rageBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'playing') tryRage();
  });
}

function isSprinting() {
  return keys.has('sprint') || (touch.active && Math.hypot(touch.x, touch.y) > 0.92);
}

// ---------- Power-ups ----------
const POWERUP_TYPES = ['honey', 'coffee', 'shroom', 'clock'];

function buildPickupMesh(type) {
  const g = new THREE.Group();
  if (type === 'honey') {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8b23a, emissive: 0x6a4a10 }));
    g.add(jar);
  } else if (type === 'coffee') {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x6b4226 }));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.08, 8),
      new THREE.MeshLambertMaterial({ color: 0xe6e6e6 }));
    lid.position.y = 0.29;
    g.add(cup, lid);
  } else if (type === 'shroom') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.35, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8e2d2 }));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0xd94f6b, emissive: 0x4a1020 }));
    cap.position.y = 0.18;
    g.add(stem, cap);
  } else if (type === 'clock') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 8, 14),
      new THREE.MeshLambertMaterial({ color: 0x9a6ff0, emissive: 0x2a1a50 }));
    g.add(ring);
  } else { // loot backpack
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.25),
      new THREE.MeshLambertMaterial({ color: 0x8a5a30 }));
    g.add(pack);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function spawnPickup(type, x, z, life = Infinity) {
  const mesh = buildPickupMesh(type);
  mesh.position.set(x, 1, z);
  scene.add(mesh);
  pickups.push({ mesh, type, x, z, t: 0, life, phase: Math.random() * 10 });
}

// Scatter power-ups around the map at build time
for (let i = 0; i < 6; i++) {
  for (let tries = 0; tries < 40; tries++) {
    const x = (Math.random() - 0.5) * 2 * (BOUNDS - 8);
    const z = (Math.random() - 0.5) * 2 * (BOUNDS - 8);
    if (Math.hypot(x, z) < 12) continue;
    if (Math.hypot(x - pond.x, z - pond.z) < pond.r + 2) continue;
    if (props.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 1.2)) continue;
    spawnPickup(POWERUP_TYPES[i % POWERUP_TYPES.length], x, z);
    break;
  }
}

function applyPickup(p) {
  const pos = new THREE.Vector3(p.x, 1, p.z);
  sfx.powerup();
  if (p.type === 'honey') {
    if (rageTimer <= 0) rage = 1;
    popText(pos, 'RAGE FILLED!', 'big');
  } else if (p.type === 'coffee') {
    speedBoostT = 10;
    popText(pos, 'CAFFEINE RUSH!', 'big');
  } else if (p.type === 'shroom') {
    giantT = 8;
    sfx.roar();
    popText(pos, 'GIANT MODE!', 'big');
  } else if (p.type === 'clock') {
    timeLeft = Math.min(GAME_TIME * 2, timeLeft + 10);
    sfx.chime();
    timerEl.classList.add('bonus');
    setTimeout(() => timerEl.classList.remove('bonus'), 700);
    popTimerBonus('+10s');
  } else if (p.type === 'loot') {
    const gained = 100 * frenzyMult();
    score += gained;
    rage = Math.min(1, rage + (rageTimer > 0 ? 0 : 0.03));
    popText(pos, `+${gained}`, '');
  }
}

// ---------- Game flow ----------
function startGame() {
  sfx.init();
  state = 'playing';
  $('menu').classList.add('hidden');
  hudEl.classList.add('visible');
  sfx.roar();
  sfx.startMusic();
  sfx.startAmbience();
  campers.panicNear(player.position, 14);
  rangers.spawn(2);
  shake = 0.4;
  clock.getDelta();
}

const TYPE_LABELS = {
  tree: '🌲 Trees', tent: '⛺ Tents', car: '🚗 Cars', cabin: '🏠 Cabins',
  rv: '🚐 RVs', truck: '🛻 Ranger trucks', tower: '🗼 Watchtowers',
  picnic: '🧺 Picnic tables', outhouse: '🚻 Outhouses', campfire: '🔥 Campfires',
  cooler: '🧊 Coolers', goldcooler: '✨ Golden coolers', dock: '🛶 Docks',
  canoe: '🚣 Canoes', woodpile: '🪵 Woodpiles', trashcan: '🗑️ Trash cans',
  sign: '🪧 Signs', flagpole: '🚩 Flagpoles', fence: '🚧 Fences', gnome: '🧙 Gnomes',
  propane: '🛢️ Propane tanks', beehive: '🐝 Beehives',
};

function endGame(clearedEverything) {
  state = 'over';
  sfx.stopMusic();
  sfx.stopAmbience();
  hudEl.classList.remove('visible');
  vignetteEl.classList.remove('rage');
  tranqTintEl.classList.remove('on');
  bossBarEl.classList.remove('show');
  boss.clear();
  player.setRage(false);
  goals.settle(); // award goals that can only be judged at the buzzer
  if (clearedEverything) {
    $('clearBonus').style.display = 'inline';
    $('endTitle').textContent = 'TOTAL DESTRUCTION!';
  }
  const board = loadBoard();
  const prevTop = board.length ? board[0].score : loadBest();
  if (score > prevTop) {
    $('newBest').style.display = 'inline';
  }
  saveBest(Math.max(score, loadBest()));
  $('finalScore').textContent = score.toLocaleString();
  $('destroyedLine').textContent = `${destroyed} / ${smashableCount} things smashed`;

  const lines = Object.entries(destroyedByType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${TYPE_LABELS[type] || type} ×${n}`);
  if (campersSmashed > 0) lines.push(`💀 Campers smashed ×${campersSmashed}`);
  if (rangersSmashed > 0) lines.push(`🎯 Rangers downed ×${rangersSmashed}`);
  if (bossDowned) lines.push('🚨 Ranger Captain downed');
  if (campersScared > 0) lines.push(`😱 Campers scared off ×${campersScared}`);
  if (bestCombo > 1) lines.push(`⚡ Best combo x${bestCombo}`);
  $('breakdown').innerHTML = lines.map((l) => `<span>${l}</span>`).join('');

  // ---------- Rank ----------
  const wreckedPct = smashableCount ? (destroyed / smashableCount) * 100 : 0;
  const rating = ratingFor({ score, wreckedPct, goalsDone: goals.completed });
  const rank = rankFor(rating);
  $('rankLetter').textContent = rank.label;
  $('rankLetter').style.color = rank.color;
  $('rankTitle').textContent = rank.title;
  $('rankTitle').style.color = rank.color;
  const up = nextRank(rating);
  $('rankNext').textContent = up
    ? `${(up.min - rating).toLocaleString()} rating to rank ${up.label}`
    : 'Top rank — nothing left to prove.';
  $('rankBasis').textContent =
    `${score.toLocaleString()} pts · ${Math.round(wreckedPct)}% wrecked · ${goals.completed} goals = ${rating.toLocaleString()} rating`;

  // ---------- Goals ----------
  renderGoalSummary($('goalSummary'), goals);
  $('goalSummaryCount').textContent = `${goals.completed}/${goals.total} · +${goals.earnedPoints.toLocaleString()} pts`;

  // ---------- Career (localStorage, this machine only) ----------
  const result = recordRun({
    score,
    smashed: destroyed,
    kills: campersSmashed + rangersSmashed,
    scared: campersScared,
    goals: goals.completed,
    rating,
    rank: rank.label,
  });
  meta = result.meta;
  const unlockEl = $('unlockNote');
  if (result.unlocked.length) {
    unlockEl.textContent = `🔓 UNLOCKED: ${result.unlocked.map((s) => s.name).join(', ')}`;
    unlockEl.style.display = 'block';
  } else {
    unlockEl.style.display = 'none';
  }
  refreshCareer();

  const qualifies = score > 0 && (board.length < 10 || score > board[board.length - 1].score);
  if (qualifies) {
    $('nameEntry').classList.add('show');
    setTimeout(() => nameInput.focus(), 50);
  } else {
    renderBoard($('endBoard'), board);
    $('endBoardWrap').classList.add('show');
  }

  $('end').classList.remove('hidden');
  sfx.sting();
}

function submitScore() {
  if (!$('nameEntry').classList.contains('show')) return;
  const name = nameInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'SQTCH';
  const board = loadBoard();
  const entry = { name, score };
  board.push(entry);
  board.sort((a, b) => b.score - a.score);
  const trimmed = board.slice(0, 10);
  saveBoard(trimmed);
  $('nameEntry').classList.remove('show');
  renderBoard($('endBoard'), trimmed, trimmed.indexOf(entry));
  $('endBoardWrap').classList.add('show');
}

// ---------- Smashing ----------
const _impact = new THREE.Vector3();
const _propPos = new THREE.Vector3();
const _dir = new THREE.Vector3();

function trySmash() {
  player.startSmash();
}

function tryStomp() {
  if (stompCooldown > 0) return;
  if (player.startStomp()) stompCooldown = STOMP_COOLDOWN;
}

function propColor(prop) {
  return prop.colors && prop.colors.length
    ? prop.colors[Math.floor(Math.random() * prop.colors.length)]
    : 0xc9b8a0;
}

function spawnOccupants(prop, n) {
  if (n <= 0) return;
  campers.spawnAt(prop.x, prop.z, n);
  if (prop.type === 'outhouse') {
    popText(_propPos.set(prop.x, 1.5, prop.z), 'OCCUPIED!!', 'gore');
  }
}

// dir: optional unit XZ vector — which way the hit came from (debris flies with it)
function hitProp(prop, dmg, dir = null) {
  prop.hp -= dmg;
  _propPos.set(prop.x, 0, prop.z);
  if (prop.hp <= 0) {
    destroyProp(prop, dir);
    return true;
  }
  // Non-final hit: some occupants bail out early
  if (prop.occupants > 0) {
    const n = Math.min(2, prop.occupants);
    prop.occupants -= n;
    spawnOccupants(prop, n);
  }
  prop.wobble = 0.5;
  debris.puff(_propPos, propColor(prop), 5);
  sfx.crack();
  return false;
}

// ---------- Fire ----------
const fireGeo = new THREE.ConeGeometry(0.45, 1.3, 6);
const fireMats = [
  new THREE.MeshBasicMaterial({ color: 0xff7a2a }),
  new THREE.MeshBasicMaterial({ color: 0xffd75e }),
];

function ignite(prop) {
  if (!prop.alive || !prop.smashable || prop.burning) return;
  prop.burning = true;
  const flamesOnProp = [];
  for (let i = 0; i < 2; i++) {
    const f = new THREE.Mesh(fireGeo, fireMats[i % 2]);
    f.position.set(
      (Math.random() - 0.5) * prop.radius * 0.8,
      0.7 + Math.random() * Math.max(0.5, prop.radius),
      (Math.random() - 0.5) * prop.radius * 0.8
    );
    prop.group.add(f);
    flamesOnProp.push(f);
  }
  burning.push({ prop, t: 1.3 + Math.random() * 1.1, flames: flamesOnProp });
}

function igniteNear(x, z, radius) {
  for (const prop of props) {
    if (!prop.alive || !prop.flammable || prop.burning || !prop.smashable) continue;
    if (Math.hypot(prop.x - x, prop.z - z) < radius + prop.radius) ignite(prop);
  }
}

function screenFlash() {
  flashEl.classList.remove('go');
  void flashEl.offsetWidth;
  flashEl.classList.add('go');
}

// Blast damage: hurt props and kill humans around a point
function detonate(x, z, radius, dmg) {
  for (const prop of props) {
    if (!prop.alive || !prop.smashable) continue;
    const d = Math.hypot(prop.x - x, prop.z - z);
    if (d < radius + prop.radius) {
      _dir.set(prop.x - x, 0, prop.z - z);
      const dir = _dir.lengthSq() > 0.001 ? _dir.normalize().clone() : null;
      hitProp(prop, dmg, dir);
    }
  }
  killHumansAt({ x, z }, radius * 0.85, 2);
}

function smashRadius() {
  let r = BASE_SMASH_RADIUS;
  if (rageTimer > 0) r *= 1.8;
  if (giantT > 0) r += 1.3;
  return r;
}

function resolveImpact() {
  const raging = rageTimer > 0;
  const radius = smashRadius();
  player.facing(_impact).multiplyScalar(2.6).add(player.position);

  let hitSomething = false;
  let hitRock = false;
  for (const prop of props) {
    if (!prop.alive) continue;
    const d = Math.hypot(prop.x - _impact.x, prop.z - _impact.z);
    if (d > prop.radius + radius) continue;
    if (!prop.smashable) {
      hitRock = true;
      prop.wobble = 0.3;
      _propPos.set(prop.x, 0, prop.z);
      debris.puff(_propPos, 0xa8adb3, 4);
      continue;
    }
    hitSomething = true;
    _dir.set(prop.x - player.position.x, 0, prop.z - player.position.z);
    const dir = _dir.lengthSq() > 0.001 ? _dir.normalize().clone() : null;
    hitProp(prop, raging ? 2 : 1, dir);
  }

  const kills = killHumansAt(_impact, radius + 0.8, raging ? 2 : 1);
  campers.panicNear(_impact, 12);

  if (hitSomething) {
    shake = Math.max(shake, raging ? 0.55 : 0.35);
    sfx.smash(raging);
  } else if (kills) {
    shake = Math.max(shake, 0.3);
  } else if (hitRock) {
    shake = Math.max(shake, 0.2);
    sfx.clang();
  } else {
    sfx.whiff();
  }
}

function resolveStomp() {
  const raging = rageTimer > 0;
  const radius = 6 + (giantT > 0 ? 2 : 0);
  const px = player.position.x;
  const pz = player.position.z;

  for (const prop of props) {
    if (!prop.alive) continue;
    const d = Math.hypot(prop.x - px, prop.z - pz);
    if (d > radius + prop.radius) continue;
    if (!prop.smashable) { prop.wobble = 0.4; continue; }
    _dir.set(prop.x - px, 0, prop.z - pz);
    const dir = _dir.lengthSq() > 0.001 ? _dir.normalize().clone() : null;
    hitProp(prop, raging ? 2 : 1, dir);
  }
  killHumansAt(player.position, radius, raging ? 3 : 2);
  campers.panicNear(player.position, 20);

  effects.shockwave(player.position, radius + 1, 0x9a6ff0);
  for (let i = 0; i < 4; i++) {
    _propPos.set(px + (Math.random() - 0.5) * 4, 0, pz + (Math.random() - 0.5) * 4);
    debris.puff(_propPos, 0x6a5a42, 4);
  }
  sfx.stomp();
  shake = Math.max(shake, 0.7);
  fovPunch = Math.min(12, fovPunch + 6);
}

function bumpCombo() {
  combo++;
  comboTimer = 2.0;
  const mult = Math.min(1 + Math.floor(combo / 3), 5);
  bestCombo = Math.max(bestCombo, mult);
  if (mult >= 5) goals.complete('perfecto');
  if (mult > 1) {
    comboEl.textContent = `COMBO x${mult}`;
    comboEl.classList.remove('pop');
    void comboEl.offsetWidth; // restart CSS animation
    comboEl.classList.add('pop');
  }
  return mult;
}

function destroyProp(prop, dir = null) {
  prop.alive = false;
  _propPos.set(prop.x, 1, prop.z);
  debris.explodeGroup(prop.group, _propPos, dir);
  scene.remove(prop.group);

  const mult = bumpCombo();
  const gained = prop.points * mult * frenzyMult();
  score += gained;
  destroyed++;
  destroyedByType[prop.type] = (destroyedByType[prop.type] || 0) + 1;
  rage = Math.min(1, rage + (rageTimer > 0 ? 0 : 0.09));
  if (prop.points >= 500) fovPunch = Math.min(10, fovPunch + 4);
  if (prop.points >= 1000) hitStop = Math.max(hitStop, 0.07);

  // Everyone still inside comes sprinting out of the wreckage
  if (prop.occupants > 0) {
    spawnOccupants(prop, prop.occupants);
    prop.occupants = 0;
  }

  effects.scorch(_propPos, Math.max(1, prop.radius));
  trackGoalKill(prop.type);
  if (prop.type === 'tree') effects.birdBurst(_propPos, 2 + Math.floor(Math.random() * 2));
  if (prop.type === 'campfire') igniteNear(prop.x, prop.z, 6);
  if (prop.type === 'beehive') spawnSwarm(prop.x, prop.z);
  if (prop.type === 'gnome') gnomesSmashed++;
  if (prop.type === 'car' || prop.type === 'rv' || prop.type === 'truck') {
    effects.explosion(_propPos);
    sfx.boom();
    screenFlash();
    shake = Math.max(shake, 0.6);
    igniteNear(prop.x, prop.z, 4.5);
    blast(prop.x, prop.z, 3, 1);
  }
  if (prop.type === 'propane') {
    effects.explosion(_propPos);
    effects.shockwave(_propPos, 8, 0xff9a3a);
    sfx.boom();
    screenFlash();
    shake = Math.max(shake, 0.8);
    fovPunch = Math.min(12, fovPunch + 6);
    igniteNear(prop.x, prop.z, 7);
    chainPropane++;
    blast(prop.x, prop.z, 5, 2);
  }

  if (prop.timeBonus) {
    timeLeft = Math.min(GAME_TIME * 2, timeLeft + prop.timeBonus);
    sfx.chime();
    timerEl.classList.add('bonus');
    setTimeout(() => timerEl.classList.remove('bonus'), 700);
    popTimerBonus(`+${prop.timeBonus}s`);
  }

  popText(_propPos, `+${gained}`, prop.points >= 500 ? 'big' : '');

  goals.set('total', destroyed);
  if (destroyed >= smashableCount) endGame(true);
}

// Per-type goal progress. Counters are derived from destroyedByType so this
// stays correct however the prop went down (smashed, charged, blown up, burnt).
const VEHICLE_TYPES = ['car', 'rv', 'truck'];
const CAMPSITE_TYPES = ['tent', 'campfire'];
const countDestroyed = (types) => types.reduce((n, t) => n + (destroyedByType[t] || 0), 0);

function trackGoalKill(type) {
  if (VEHICLE_TYPES.includes(type)) goals.set('derby', countDestroyed(VEHICLE_TYPES));
  if (CAMPSITE_TYPES.includes(type)) goals.set('campsite', countDestroyed(CAMPSITE_TYPES));
  if (type === 'tree') goals.set('timber', destroyedByType.tree || 0);
  if (type === 'beehive') goals.set('bees', destroyedByType.beehive || 0);
  if (type === 'gnome') goals.set('gnome', destroyedByType.gnome || 0);
}

// Wraps detonate() so nested explosions resolve as one chain — three propane
// tanks going up together is one Chain Reaction, however deep the recursion got.
function blast(x, z, radius, dmg) {
  blastDepth++;
  detonate(x, z, radius, dmg);
  blastDepth--;
  if (blastDepth === 0) {
    if (chainPropane >= 3) goals.complete('chain');
    chainPropane = 0;
  }
}

// ---------- Humans: gore, streaks ----------
const KILL_BANNERS = { 3: 'RAMPAGE!', 5: 'MONSTER!', 8: 'LEGENDARY!' };

function showBanner(text) {
  bannerEl.textContent = text;
  bannerEl.classList.remove('show');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('show');
}

function goreAt(group) {
  const pos = group.position.clone();
  pos.y = 0.8;
  debris.explodeGroup(group, pos);
  scene.remove(group);
  debris.puff(pos, 0x8a1414, 8);
  debris.puff(pos, 0xb02020, 6);
  effects.bloodSplat(pos);
  sfx.squish();
  return pos;
}

function trackKill() {
  killStreak++;
  killStreakTimer = 4;
  if (KILL_BANNERS[killStreak]) showBanner(KILL_BANNERS[killStreak]);
  hitStop = Math.max(hitStop, 0.045);
}

function killCamper(c) {
  const pos = goreAt(c.group);
  const mult = bumpCombo();
  const gained = CAMPER_POINTS * mult * frenzyMult();
  score += gained;
  campersSmashed++;
  goals.set('splatter', campersSmashed);
  rage = Math.min(1, rage + (rageTimer > 0 ? 0 : 0.08));
  popText(pos, `SPLAT! +${gained}`, 'gore');
  if (Math.random() < 0.3) spawnPickup('loot', pos.x, pos.z, 15);
  trackKill();
}

function killRanger(r) {
  const pos = goreAt(r.group);
  const mult = bumpCombo();
  const gained = RANGER_POINTS * mult * frenzyMult();
  score += gained;
  rangersSmashed++;
  goals.set('rangers', rangersSmashed);
  rage = Math.min(1, rage + (rageTimer > 0 ? 0 : 0.12));
  popText(pos, `RANGER DOWN! +${gained}`, 'gore');
  if (Math.random() < 0.5) spawnPickup('loot', pos.x, pos.z, 15);
  trackKill();
}

// Returns how many humans were removed around a point. The Ranger Captain is
// not a human for these purposes — he soaks `bossDmg` instead of bursting.
function killHumansAt(pos, radius, bossDmg = 1) {
  const killedCampers = campers.takeAt(pos, radius);
  killedCampers.forEach(killCamper);
  const killedRangers = rangers.takeAt(pos, radius);
  killedRangers.forEach(killRanger);
  hitBoss(pos, radius, bossDmg);
  return killedCampers.length + killedRangers.length;
}

// ---------- Ranger Captain ----------
function sendBoss() {
  if (!boss.spawn(player.position)) return;
  bossBarEl.classList.add('show');
  showBanner('RANGER CAPTAIN INCOMING!');
  sfx.siren();
  shake = Math.max(shake, 0.5);
}

function hitBoss(pos, radius, dmg) {
  if (!boss.active || dmg <= 0 || bossHitCd > 0) return;
  if (!boss.inRange(pos, radius)) return;
  bossHitCd = 0.35; // one connect per swing, not one per frame
  const bossPos = boss.position.clone();
  const result = boss.damage(dmg);
  if (result === 'killed') {
    downBoss(bossPos);
    return;
  }
  sfx.bossHit();
  shake = Math.max(shake, 0.35);
  hitStop = Math.max(hitStop, 0.04);
  debris.puff(bossPos, 0x5d6b3f, 5);
  popText(bossPos, `-${dmg}`, 'gore');
  if (boss.consumeEnrage()) {
    rangers.spawn(2);
    showBanner('BUCKLEY IS FURIOUS!');
    sfx.siren();
  }
}

function downBoss(pos) {
  const body = boss.claimBody();
  if (body) {
    debris.explodeGroup(body, pos);
    scene.remove(body);
    debris.puff(pos, 0x8a1414, 10);
    effects.bloodSplat(pos);
  }
  boss.clear();
  bossBarEl.classList.remove('show');
  bossDowned = true;
  effects.explosion(pos);
  effects.shockwave(pos, 10, 0xffd24a);
  screenFlash();
  shake = Math.max(shake, 0.9);
  hitStop = Math.max(hitStop, 0.12);
  const gained = BOSS_POINTS * frenzyMult();
  score += gained;
  popText(pos, `CAPTAIN DOWN! +${gained}`, 'big');
  sfx.bossDown();
  // He was carrying: a jar of honey and the park's stopwatch
  spawnPickup('honey', pos.x + 1.5, pos.z, 20);
  spawnPickup('clock', pos.x - 1.5, pos.z, 20);
  goals.complete('boss');
  trackKill();
}

function onDartHit() {
  if (rageTimer > 0) {
    popText(player.position, 'IMMUNE!', 'big');
    return;
  }
  slowTimer = 3;
  sfx.dartHit();
  shake = Math.max(shake, 0.25);
  popText(player.position, 'TRANQED!', 'gore');
  goals.fail('untouchable');
}

function tryRage() {
  if (rage < 1 || rageTimer > 0) return;
  rageTimer = RAGE_DURATION;
  slowTimer = 0; // rage burns the tranq right out
  vignetteEl.classList.add('rage');
  player.setRage(true);
  sfx.roar();
  shake = Math.max(shake, 0.5);
  fovPunch = Math.min(12, fovPunch + 8);

  // Rage kickoff: shockwave that flattens everything nearby
  effects.shockwave(player.position, 9);
  killHumansAt(player.position, 8.5, 3);
  campers.panicNear(player.position, 20);
  for (const prop of props) {
    if (!prop.alive || !prop.smashable) continue;
    if (Math.hypot(prop.x - player.position.x, prop.z - player.position.z) < 8 + prop.radius) {
      _dir.set(prop.x - player.position.x, 0, prop.z - player.position.z);
      const dir = _dir.lengthSq() > 0.001 ? _dir.normalize().clone() : null;
      hitProp(prop, 1, dir);
    }
  }
}

// ---------- Bee swarms ----------
function spawnSwarm(x, z) {
  const group = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const bee = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.1, 0.14),
      new THREE.MeshBasicMaterial({ color: i % 3 ? 0x1e1a10 : 0xe8c04a })
    );
    bee.userData.base = new THREE.Vector3(
      (Math.random() - 0.5) * 1.6,
      1.5 + Math.random() * 1.2,
      (Math.random() - 0.5) * 1.6
    );
    bee.position.copy(bee.userData.base);
    group.add(bee);
  }
  group.position.set(x, 0, z);
  scene.add(group);
  swarms.push({ group, t: 12, buzzT: 0 });
  sfx.buzz();
}

function updateSwarms(dt) {
  for (let i = swarms.length - 1; i >= 0; i--) {
    const s = swarms[i];
    s.t -= dt;
    s.buzzT -= dt;
    if (s.t <= 0) {
      scene.remove(s.group);
      swarms.splice(i, 1);
      continue;
    }
    if (s.buzzT <= 0) { sfx.buzz(); s.buzzT = 2.2; }

    // Chase the nearest camper and keep them panicking
    let nearest = null;
    let nd = Infinity;
    for (const c of campers.campers) {
      const d = Math.hypot(c.group.position.x - s.group.position.x, c.group.position.z - s.group.position.z);
      if (d < nd) { nd = d; nearest = c; }
    }
    if (nearest) {
      _dir.set(
        nearest.group.position.x - s.group.position.x, 0,
        nearest.group.position.z - s.group.position.z
      );
      if (_dir.lengthSq() > 0.01) {
        _dir.normalize();
        s.group.position.addScaledVector(_dir, 8 * dt);
      }
      campers.panicNear(s.group.position, 4);
    }
    for (let j = 0; j < s.group.children.length; j++) {
      const bee = s.group.children[j];
      bee.position.set(
        bee.userData.base.x + Math.sin(flameT * 18 + j * 2.3) * 0.35,
        bee.userData.base.y + Math.cos(flameT * 15 + j * 1.7) * 0.3,
        bee.userData.base.z + Math.sin(flameT * 21 + j * 3.1) * 0.35
      );
    }
    if (s.t < 1) s.group.scale.setScalar(Math.max(0.001, s.t));
  }
}

// ---------- Floating popups ----------
const _proj = new THREE.Vector3();

function popText(worldPos, text, cls = '') {
  _proj.copy(worldPos);
  _proj.y += 2.5;
  _proj.project(camera);
  if (_proj.z > 1) return;
  const el = document.createElement('div');
  el.className = cls ? `popup ${cls}` : 'popup';
  el.textContent = text;
  el.style.left = `${(_proj.x * 0.5 + 0.5) * window.innerWidth}px`;
  el.style.top = `${(-_proj.y * 0.5 + 0.5) * window.innerHeight}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function popTimerBonus(text) {
  const el = document.createElement('div');
  el.className = 'popup timerpop';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// ---------- Camera ----------
const _camForward = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _sunOffset = new THREE.Vector3(30, 55, 20);
const UP = new THREE.Vector3(0, 1, 0);

function updateCamera(dt) {
  if (state === 'menu') {
    camYaw += dt * 0.12; // slow showcase orbit behind the mascot
  } else {
    const diff = Math.atan2(Math.sin(player.heading - camYaw), Math.cos(player.heading - camYaw));
    camYaw += diff * Math.min(1, 3.2 * dt);
  }

  _camForward.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  _camTarget.copy(player.position).addScaledVector(_camForward, -11);
  _camTarget.y += 7;
  const k = 1 - Math.exp(-5 * dt);
  camera.position.lerp(_camTarget, k);

  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.4);
    camera.position.x += (Math.random() - 0.5) * shake * 0.8;
    camera.position.y += (Math.random() - 0.5) * shake * 0.8;
    camera.position.z += (Math.random() - 0.5) * shake * 0.8;
  }

  _lookAt.copy(player.position).addScaledVector(_camForward, 3);
  _lookAt.y += 2.5;
  camera.lookAt(_lookAt);

  // FOV: wider in rage, with punch-ins on big smashes
  fovPunch = Math.max(0, fovPunch - dt * 14);
  const targetFov = (rageTimer > 0 ? RAGE_FOV : BASE_FOV) + fovPunch;
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 8 * dt);
    camera.updateProjectionMatrix();
  }

  // Keep the shadow camera centered on the action
  sun.position.copy(player.position).add(_sunOffset);
  sun.target.position.copy(player.position);
}

// Initial camera placement (menu backdrop)
camera.position.set(0, 7, -11);
camera.lookAt(0, 2.5, 3);

// ---------- Movement ----------
const _moveVec = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

function computeMove() {
  let f = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
  let r = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  if (touch.active) {
    f += -touch.y;
    r += touch.x;
  }
  _moveVec.set(0, 0, 0);
  if (f === 0 && r === 0) return _moveVec;
  _fwd.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  _right.crossVectors(_fwd, UP); // camera-space screen-right
  _moveVec.addScaledVector(_fwd, f).addScaledVector(_right, r);
  if (_moveVec.lengthSq() > 1) _moveVec.normalize();
  return _moveVec;
}

function collide(sprinting, dt) {
  const p = player.position;
  chargeCooldown = Math.max(0, chargeCooldown - dt);
  for (const prop of props) {
    if (!prop.alive) continue;
    const dx = p.x - prop.x;
    const dz = p.z - prop.z;
    const dist = Math.hypot(dx, dz);
    const minD = prop.radius + 0.9 * player.group.scale.x;
    if (dist < minD && dist > 0.001) {
      // Charging shoulder-first through things smashes them
      if (sprinting && prop.smashable && chargeCooldown <= 0) {
        chargeCooldown = 0.3;
        shake = Math.max(shake, 0.3);
        sfx.smash(false);
        const dir = player.facing(_dir).clone();
        if (hitProp(prop, rageTimer > 0 ? 2 : 1, dir)) continue; // destroyed: barrel through
      }
      const push = (minD - dist) / dist;
      p.x += dx * push;
      p.z += dz * push;
    }
  }
  // Sasquatch does not swim
  const pdx = p.x - pond.x;
  const pdz = p.z - pond.z;
  const pd = Math.hypot(pdx, pdz);
  if (pd < pond.r + 0.6 && pd > 0.001) {
    const push = (pond.r + 0.6 - pd) / pd;
    p.x += pdx * push;
    p.z += pdz * push;
  }
  p.x = THREE.MathUtils.clamp(p.x, -BOUNDS, BOUNDS);
  p.z = THREE.MathUtils.clamp(p.z, -BOUNDS, BOUNDS);
}

// ---------- HUD ----------
function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  wreckedEl.textContent = `${Math.round((destroyed / smashableCount) * 100)}% WRECKED`;
  killsEl.textContent = `💀 ${campersSmashed + rangersSmashed}`;
  const t = Math.max(0, Math.ceil(timeLeft));
  timerEl.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  timerEl.classList.toggle('low', timeLeft <= 10 && !frenzyStarted);
  timerEl.classList.toggle('frenzy', frenzyStarted);
  rageFillEl.style.width = `${(rageTimer > 0 ? rageTimer / RAGE_DURATION : rage) * 100}%`;
  ragePromptEl.classList.toggle('ready', rage >= 1 && rageTimer <= 0);
  comboBarWrapEl.style.opacity = combo >= 3 && comboTimer > 0 ? 1 : 0;
  comboBarEl.style.width = `${(comboTimer / 2) * 100}%`;
  stompFillEl.style.width = `${(1 - stompCooldown / STOMP_COOLDOWN) * 100}%`;
  stompHudEl.classList.toggle('ready', stompCooldown <= 0);
  tranqTintEl.classList.toggle('on', slowTimer > 0);

  const buffs = [];
  if (speedBoostT > 0) buffs.push(`☕ ${Math.ceil(speedBoostT)}s`);
  if (giantT > 0) buffs.push(`🍄 ${Math.ceil(giantT)}s`);
  if (slowTimer > 0) buffs.push(`💤 ${Math.ceil(slowTimer)}s`);
  buffsEl.textContent = buffs.join('  ');

  refreshGoalHUD();
  if (boss.active) {
    bossFillEl.style.width = `${boss.hpFrac * 100}%`;
    bossBarEl.classList.toggle('enraged', boss.enraged);
  }
}

// ---------- Camper callbacks ----------
function onCamperScaredOff(pos) {
  campersScared++;
  goals.set('ghost', campersScared);
  score += 200 * frenzyMult();
  popText(pos, `SCARED! +${200 * frenzyMult()}`, '');
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
let flameT = 0;

function onStep(side) {
  effects.footprint(player.position, player.heading, side);
  sfx.step();
}

function tick() {
  requestAnimationFrame(tick);
  if (state === 'paused') {
    renderer.render(scene, camera);
    return;
  }
  const dt = Math.min(clock.getDelta(), 0.05);

  /* The bed is still downloading when `startGame` asks for it, so ask again.
   * `startAmbience` is idempotent and returns immediately once it is running,
   * and this is also what brings the bed back after a pause -- every stop
   * shadows `stopMusic`, and this is the matching start. */
  if (state === 'playing') sfx.startAmbience();

  // Hit-stop: a few frozen frames to sell the biggest impacts
  if (hitStop > 0) {
    hitStop -= dt;
    renderer.render(scene, camera);
    return;
  }

  if (state === 'playing') {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame(false);
    }

    // Final frenzy: everything is worth double
    if (!frenzyStarted && timeLeft <= FRENZY_AT && timeLeft > 0) {
      frenzyStarted = true;
      showBanner('FINAL FRENZY! 2x POINTS');
      sfx.frenzyJingle();
    }

    // Ranger backup arrives at the halfway mark
    if (!backupSent && GAME_TIME - timeLeft >= 45) {
      backupSent = true;
      rangers.spawn(2);
      showBanner('RANGER BACKUP!');
      sfx.dart();
    }

    // The Ranger Captain shows up for the last stretch
    if (!bossSent && timeLeft <= BOSS_AT) {
      bossSent = true;
      sendBoss();
    }

    // Sunset progression
    const dayK = THREE.MathUtils.clamp(1 - timeLeft / GAME_TIME, 0, 1);
    scene.background.lerpColors(SKY_DAY, SKY_DUSK, dayK);
    scene.fog.color.copy(scene.background);
    sun.color.lerpColors(SUN_DAY, SUN_DUSK, dayK);
    sun.intensity = 2.0 - dayK * 0.5;

    stompCooldown = Math.max(0, stompCooldown - dt);
    slowTimer = Math.max(0, slowTimer - dt);
    speedBoostT = Math.max(0, speedBoostT - dt);
    giantT = Math.max(0, giantT - dt);

    // Giant mode scale
    const targetScale = giantT > 0 ? 1.45 : 1;
    const cs = player.group.scale.x;
    if (Math.abs(cs - targetScale) > 0.001) {
      player.group.scale.setScalar(cs + (targetScale - cs) * Math.min(1, 6 * dt));
    }

    if (rageTimer > 0) {
      rageTimer -= dt;
      auraAcc += dt;
      if (auraAcc > 0.07) {
        auraAcc = 0;
        effects.auraMote(player.position);
      }
      if (rageTimer <= 0) {
        rageTimer = 0;
        rage = 0;
        player.setRage(false);
        vignetteEl.classList.remove('rage');
      }
    }

    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) {
        combo = 0;
        comboEl.classList.remove('pop');
      }
    }

    if (killStreakTimer > 0) {
      killStreakTimer -= dt;
      if (killStreakTimer <= 0) killStreak = 0;
    }

    // Spreading fires burn down flammable props
    for (let i = burning.length - 1; i >= 0; i--) {
      const b = burning[i];
      if (!b.prop.alive) { burning.splice(i, 1); continue; }
      b.t -= dt;
      for (const f of b.flames) f.scale.y = 1 + Math.sin(flameT * 15 + i * 2.1) * 0.3;
      if (b.t <= 0) {
        // Count the fire result before destroyProp: the final standing prop
        // can end the run immediately, and the end screen must include every
        // goal and point earned by that same destruction.
        burnKills++;
        goals.set('arson', burnKills);
        destroyProp(b.prop);
        burning.splice(i, 1);
      }
    }

    const sprinting = isSprinting();
    let speed = sprinting ? SPRINT_SPEED : BASE_SPEED;
    if (rageTimer > 0) speed *= 1.4;
    if (speedBoostT > 0) speed *= 1.35;
    if (giantT > 0) speed *= 1.05;
    if (slowTimer > 0) speed *= 0.45;
    const move = computeMove();
    player.update(dt, move, speed, sprinting, onStep);
    collide(sprinting, dt);
    if (sprinting && move.lengthSq() > 0.0001) {
      killHumansAt(player.position, 1.5 * player.group.scale.x); // trampled
    }
    if (player.consumeImpact()) resolveImpact();
    if (player.consumeStompImpact()) resolveStomp();
    campers.update(dt, player.position, onCamperScaredOff, sfx.scream);
    rangers.update(dt, player.position, sfx.dart, onDartHit);
    bossHitCd = Math.max(0, bossHitCd - dt);
    boss.update(dt, player.position, sfx.dart, onDartHit);
    updateSwarms(dt);

    // Pickups: bob, spin, collect
    const collectR = 1.8 * player.group.scale.x;
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.t += dt;
      if (p.t > p.life) {
        scene.remove(p.mesh);
        pickups.splice(i, 1);
        continue;
      }
      p.mesh.position.y = 1 + Math.sin(flameT * 3 + p.phase) * 0.25;
      p.mesh.rotation.y += dt * 2.2;
      if (Math.hypot(p.x - player.position.x, p.z - player.position.z) < collectR) {
        applyPickup(p);
        scene.remove(p.mesh);
        pickups.splice(i, 1);
      }
    }

    updateHUD();
  } else {
    // Idle sway on menu / end screens
    player.update(dt, _moveVec.set(0, 0, 0), 0);
    if (state === 'menu') campers.update(dt, player.position, null, null);
  }

  // Prop hit wobble
  for (const prop of props) {
    if (prop.wobble > 0) {
      prop.wobble = Math.max(0, prop.wobble - dt);
      prop.group.rotation.z = Math.sin(prop.wobble * 30) * 0.08 * prop.wobble;
    }
  }

  // Campfire flicker + flag wave
  flameT += dt;
  for (let i = 0; i < flames.length; i++) {
    flames[i].scale.y = 1 + Math.sin(flameT * 13 + i * 2.1) * 0.25;
  }
  for (let i = 0; i < flags.length; i++) {
    flags[i].rotation.y = Math.sin(flameT * 2.6 + i * 1.4) * 0.22;
  }

  debris.update(dt);
  effects.update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

tick();

// Debug/test handle (harmless in production)
window.SQUATCH = {
  player,
  props,
  campers,
  rangers,
  killCamper,
  tryStomp,
  get pickups() { return pickups; },
  get score() { return score; },
  get state() { return state; },
  get timeLeft() { return timeLeft; },
  set timeLeft(v) { timeLeft = v; },
  get campersScared() { return campersScared; },
  get campersSmashed() { return campersSmashed; },
  get rangersSmashed() { return rangersSmashed; },
  get burningCount() { return burning.length; },
  get swarmCount() { return swarms.length; },
  get slowTimer() { return slowTimer; },
  get giantT() { return giantT; },
  get board() { return loadBoard(); },
  goals,
  boss,
  sendBoss,
  get meta() { return meta; },
  get bossDowned() { return bossDowned; },
};
