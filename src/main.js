import * as THREE from 'three';
import { buildWorld, BOUNDS } from './world.js';
import { Sasquatch } from './player.js';
import { DebrisSystem } from './debris.js';
import { Effects } from './effects.js';
import { CamperSystem } from './campers.js';
import * as sfx from './audio.js';

const GAME_TIME = 90;
const BASE_SPEED = 10;
const SPRINT_SPEED = 15;
const BASE_SMASH_RADIUS = 2.6;
const RAGE_DURATION = 8;
const BASE_FOV = 60;
const RAGE_FOV = 68;
const BEST_KEY = 'squatchsmash-best';

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

const { props, flames, sun, smashableCount, pond } = buildWorld(scene, renderer);
const player = new Sasquatch();
scene.add(player.group);
const debris = new DebrisSystem(scene);
const effects = new Effects(scene);
const campers = new CamperSystem(scene, props, pond, 10);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- HUD elements ----------
const $ = (id) => document.getElementById(id);
const hudEl = $('hud');
const scoreEl = $('score');
const timerEl = $('timer');
const comboEl = $('combo');
const comboBarEl = $('comboBarFill');
const comboBarWrapEl = $('comboBar');
const rageFillEl = $('rageFill');
const ragePromptEl = $('ragePrompt');
const vignetteEl = $('vignette');
const muteBtn = $('muteBtn');

// ---------- Game state ----------
let state = 'menu'; // 'menu' | 'playing' | 'paused' | 'over'
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
let camYaw = 0;
let chargeCooldown = 0;
let campersScared = 0;
const destroyedByType = {};

const best = Number(localStorage.getItem(BEST_KEY) || 0);
if (best > 0) $('bestLine').textContent = `BEST: ${best.toLocaleString()}`;

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
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
  if (e.code === 'Space') {
    e.preventDefault();
    if (state === 'playing') trySmash();
  }
  if (e.code === 'KeyR' && state === 'playing') tryRage();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'Enter' && state === 'menu') startGame();
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]);
});
window.addEventListener('mousedown', (e) => {
  if (state === 'playing' && !e.target.closest('button, .touch-btn')) trySmash();
});
window.addEventListener('blur', () => keys.clear());

$('startBtn').addEventListener('click', (e) => { e.stopPropagation(); startGame(); });
$('restartBtn').addEventListener('click', () => location.reload());
$('resumeBtn').addEventListener('click', () => togglePause());
muteBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });

function toggleMute() {
  sfx.setMuted(!sfx.isMuted());
  muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊';
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    $('pause').classList.remove('hidden');
  } else if (state === 'paused') {
    state = 'playing';
    $('pause').classList.add('hidden');
    clock.getDelta(); // swallow the paused time
  }
}

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
  $('rageBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'playing') tryRage();
  });
}

function isSprinting() {
  return keys.has('sprint') || (touch.active && Math.hypot(touch.x, touch.y) > 0.92);
}

// ---------- Game flow ----------
function startGame() {
  sfx.init();
  state = 'playing';
  $('menu').classList.add('hidden');
  hudEl.classList.add('visible');
  sfx.roar();
  campers.panicNear(player.position, 14);
  shake = 0.4;
  clock.getDelta();
}

const TYPE_LABELS = {
  tree: '🌲 Trees', tent: '⛺ Tents', car: '🚗 Cars', cabin: '🏠 Cabins',
  rv: '🚐 RVs', tower: '🗼 Watchtowers', picnic: '🧺 Picnic tables',
  outhouse: '🚻 Outhouses', campfire: '🔥 Campfires', cooler: '🧊 Coolers',
  goldcooler: '✨ Golden coolers', dock: '🛶 Docks',
};

function endGame(clearedEverything) {
  state = 'over';
  hudEl.classList.remove('visible');
  vignetteEl.classList.remove('rage');
  if (clearedEverything) {
    score += 5000;
    $('clearBonus').style.display = 'inline';
    $('endTitle').textContent = 'TOTAL DESTRUCTION!';
  }
  if (score > best) {
    localStorage.setItem(BEST_KEY, String(score));
    $('newBest').style.display = 'inline';
  }
  $('finalScore').textContent = score.toLocaleString();
  $('destroyedLine').textContent = `${destroyed} / ${smashableCount} things smashed`;

  const lines = Object.entries(destroyedByType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${TYPE_LABELS[type] || type} ×${n}`);
  if (campersScared > 0) lines.push(`😱 Campers scared off ×${campersScared}`);
  if (bestCombo > 1) lines.push(`⚡ Best combo x${bestCombo}`);
  $('breakdown').innerHTML = lines.map((l) => `<span>${l}</span>`).join('');

  $('end').classList.remove('hidden');
  sfx.sting();
}

// ---------- Smashing ----------
const _impact = new THREE.Vector3();
const _propPos = new THREE.Vector3();

function trySmash() {
  player.startSmash();
}

function propColor(prop) {
  return prop.colors && prop.colors.length
    ? prop.colors[Math.floor(Math.random() * prop.colors.length)]
    : 0xc9b8a0;
}

function hitProp(prop, dmg) {
  prop.hp -= dmg;
  _propPos.set(prop.x, 0, prop.z);
  if (prop.hp <= 0) {
    destroyProp(prop);
    return true;
  }
  prop.wobble = 0.5;
  debris.puff(_propPos, propColor(prop), 5);
  sfx.crack();
  return false;
}

function resolveImpact() {
  const raging = rageTimer > 0;
  const radius = raging ? BASE_SMASH_RADIUS * 1.8 : BASE_SMASH_RADIUS;
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
    hitProp(prop, raging ? 2 : 1);
  }

  campers.panicNear(_impact, 12);

  if (hitSomething) {
    shake = Math.max(shake, raging ? 0.55 : 0.35);
    sfx.smash(raging);
  } else if (hitRock) {
    shake = Math.max(shake, 0.2);
    sfx.clang();
  } else {
    sfx.whiff();
  }
}

function destroyProp(prop) {
  prop.alive = false;
  _propPos.set(prop.x, 1, prop.z);
  debris.explodeGroup(prop.group, _propPos);
  scene.remove(prop.group);

  combo++;
  comboTimer = 2.0;
  const mult = Math.min(1 + Math.floor(combo / 3), 5);
  bestCombo = Math.max(bestCombo, mult);
  const gained = prop.points * mult;
  score += gained;
  destroyed++;
  destroyedByType[prop.type] = (destroyedByType[prop.type] || 0) + 1;
  rage = Math.min(1, rage + (rageTimer > 0 ? 0 : 0.09));
  if (prop.points >= 500) fovPunch = Math.min(10, fovPunch + 4);

  if (prop.type === 'tree') effects.birdBurst(_propPos, 2 + Math.floor(Math.random() * 2));

  if (prop.timeBonus) {
    timeLeft = Math.min(GAME_TIME * 2, timeLeft + prop.timeBonus);
    sfx.chime();
    timerEl.classList.add('bonus');
    setTimeout(() => timerEl.classList.remove('bonus'), 700);
    popTimerBonus(`+${prop.timeBonus}s`);
  }

  popText(_propPos, `+${gained}`, prop.points >= 500);
  if (mult > 1) {
    comboEl.textContent = `COMBO x${mult}`;
    comboEl.classList.remove('pop');
    void comboEl.offsetWidth; // restart CSS animation
    comboEl.classList.add('pop');
  }

  if (destroyed >= smashableCount) endGame(true);
}

function tryRage() {
  if (rage < 1 || rageTimer > 0) return;
  rageTimer = RAGE_DURATION;
  vignetteEl.classList.add('rage');
  sfx.roar();
  shake = Math.max(shake, 0.5);
  fovPunch = Math.min(12, fovPunch + 8);

  // Rage kickoff: shockwave that flattens everything nearby
  effects.shockwave(player.position, 9);
  campers.panicNear(player.position, 20);
  for (const prop of props) {
    if (!prop.alive || !prop.smashable) continue;
    if (Math.hypot(prop.x - player.position.x, prop.z - player.position.z) < 8 + prop.radius) {
      hitProp(prop, 1);
    }
  }
}

// ---------- Floating popups ----------
const _proj = new THREE.Vector3();

function popText(worldPos, text, big) {
  _proj.copy(worldPos);
  _proj.y += 2.5;
  _proj.project(camera);
  if (_proj.z > 1) return;
  const el = document.createElement('div');
  el.className = big ? 'popup big' : 'popup';
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
  const diff = Math.atan2(Math.sin(player.heading - camYaw), Math.cos(player.heading - camYaw));
  camYaw += diff * Math.min(1, 3.2 * dt);

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
    const minD = prop.radius + 0.9;
    if (dist < minD && dist > 0.001) {
      // Charging shoulder-first through things smashes them
      if (sprinting && prop.smashable && chargeCooldown <= 0) {
        chargeCooldown = 0.3;
        shake = Math.max(shake, 0.3);
        sfx.smash(false);
        if (hitProp(prop, rageTimer > 0 ? 2 : 1)) continue; // destroyed: barrel through
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
  const t = Math.max(0, Math.ceil(timeLeft));
  timerEl.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  timerEl.classList.toggle('low', timeLeft <= 10);
  rageFillEl.style.width = `${(rageTimer > 0 ? rageTimer / RAGE_DURATION : rage) * 100}%`;
  ragePromptEl.classList.toggle('ready', rage >= 1 && rageTimer <= 0);
  comboBarWrapEl.style.opacity = combo >= 3 && comboTimer > 0 ? 1 : 0;
  comboBarEl.style.width = `${(comboTimer / 2) * 100}%`;
}

// ---------- Camper callbacks ----------
function onCamperScaredOff(pos) {
  campersScared++;
  score += 200;
  popText(pos, 'SCARED! +200', false);
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

  if (state === 'playing') {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame(false);
    }

    if (rageTimer > 0) {
      rageTimer -= dt;
      if (rageTimer <= 0) {
        rageTimer = 0;
        rage = 0;
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

    const sprinting = isSprinting();
    let speed = sprinting ? SPRINT_SPEED : BASE_SPEED;
    if (rageTimer > 0) speed *= 1.4;
    player.update(dt, computeMove(), speed, sprinting, onStep);
    collide(sprinting, dt);
    if (player.consumeImpact()) resolveImpact();
    campers.update(dt, player.position, onCamperScaredOff, sfx.scream);
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

  // Campfire flicker
  flameT += dt;
  for (let i = 0; i < flames.length; i++) {
    flames[i].scale.y = 1 + Math.sin(flameT * 13 + i * 2.1) * 0.25;
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
  get score() { return score; },
  get state() { return state; },
  get timeLeft() { return timeLeft; },
  set timeLeft(v) { timeLeft = v; },
  get campersScared() { return campersScared; },
};
