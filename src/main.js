import * as THREE from 'three';
import { buildWorld, BOUNDS } from './world.js';
import { Sasquatch } from './player.js';
import { DebrisSystem } from './debris.js';
import * as sfx from './audio.js';

const GAME_TIME = 90;
const BASE_SPEED = 10;
const BASE_SMASH_RADIUS = 2.6;
const RAGE_DURATION = 8;

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

const { props, flames, sun, smashableCount } = buildWorld(scene);
const player = new Sasquatch();
scene.add(player.group);
const debris = new DebrisSystem(scene);

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
const rageFillEl = $('rageFill');
const ragePromptEl = $('ragePrompt');
const vignetteEl = $('vignette');

// ---------- Game state ----------
let state = 'menu'; // 'menu' | 'playing' | 'over'
let score = 0;
let timeLeft = GAME_TIME;
let destroyed = 0;
let combo = 0;
let comboTimer = 0;
let rage = 0; // 0..1
let rageTimer = 0;
let shake = 0;
let camYaw = 0;

const keys = new Set();
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
  if (e.code === 'Space') {
    e.preventDefault();
    if (state === 'playing') trySmash();
  }
  if (e.code === 'KeyR' && state === 'playing') tryRage();
  if (e.code === 'Enter' && state === 'menu') startGame();
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]);
});
window.addEventListener('mousedown', () => {
  if (state === 'playing') trySmash();
});
window.addEventListener('blur', () => keys.clear());

$('startBtn').addEventListener('click', (e) => { e.stopPropagation(); startGame(); });
$('restartBtn').addEventListener('click', () => location.reload());

function startGame() {
  sfx.init();
  state = 'playing';
  $('menu').classList.add('hidden');
  hudEl.classList.add('visible');
  sfx.roar();
  shake = 0.4;
}

function endGame(clearedEverything) {
  state = 'over';
  hudEl.classList.remove('visible');
  vignetteEl.classList.remove('rage');
  if (clearedEverything) {
    score += 5000;
    $('clearBonus').style.display = 'inline';
    $('endTitle').textContent = 'TOTAL DESTRUCTION!';
  }
  $('finalScore').textContent = score.toLocaleString();
  $('destroyedLine').textContent = `${destroyed} / ${smashableCount} things smashed`;
  $('end').classList.remove('hidden');
  sfx.sting();
}

// ---------- Smashing ----------
const _impact = new THREE.Vector3();
const _propPos = new THREE.Vector3();

function trySmash() {
  player.startSmash();
}

function resolveImpact() {
  const raging = rageTimer > 0;
  const radius = raging ? BASE_SMASH_RADIUS * 1.8 : BASE_SMASH_RADIUS;
  player.facing(_impact).multiplyScalar(2.6).add(player.position);

  let hitSomething = false;
  for (const prop of props) {
    if (!prop.alive || !prop.smashable) continue;
    const d = Math.hypot(prop.x - _impact.x, prop.z - _impact.z);
    if (d > prop.radius + radius) continue;
    hitSomething = true;
    prop.hp -= raging ? 2 : 1;
    if (prop.hp <= 0) {
      destroyProp(prop);
    } else {
      prop.wobble = 0.5;
      _propPos.set(prop.x, 0, prop.z);
      debris.puff(_propPos, 0xc9b8a0, 5);
      sfx.crack();
    }
  }

  if (hitSomething) {
    shake = Math.max(shake, raging ? 0.55 : 0.35);
    sfx.smash(raging);
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
  const gained = prop.points * mult;
  score += gained;
  destroyed++;
  rage = Math.min(1, rage + (rageTimer > 0 ? 0 : 0.09));

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
}

// ---------- Floating score popups ----------
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

// ---------- Camera ----------
const _camForward = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function updateCamera(dt) {
  const diff = Math.atan2(Math.sin(player.heading - camYaw), Math.cos(player.heading - camYaw));
  camYaw += diff * Math.min(1, 3.2 * dt);

  _camForward.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  _camTarget.copy(player.position).addScaledVector(_camForward, -11).add(UP.clone().multiplyScalar(7));
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

  // Keep the shadow camera centered on the action
  sun.position.copy(player.position).add(new THREE.Vector3(30, 55, 20));
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
  const f = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
  const r = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  _moveVec.set(0, 0, 0);
  if (f === 0 && r === 0) return _moveVec;
  _fwd.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  _right.crossVectors(_fwd, UP); // camera-space screen-right
  _moveVec.addScaledVector(_fwd, f).addScaledVector(_right, r).normalize();
  return _moveVec;
}

function collide() {
  const p = player.position;
  for (const prop of props) {
    if (!prop.alive) continue;
    const dx = p.x - prop.x;
    const dz = p.z - prop.z;
    const dist = Math.hypot(dx, dz);
    const minD = prop.radius + 0.9;
    if (dist < minD && dist > 0.001) {
      const push = (minD - dist) / dist;
      p.x += dx * push;
      p.z += dz * push;
    }
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
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
let flameT = 0;

function tick() {
  requestAnimationFrame(tick);
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

    const speed = rageTimer > 0 ? BASE_SPEED * 1.5 : BASE_SPEED;
    player.update(dt, computeMove(), speed);
    collide();
    if (player.consumeImpact()) resolveImpact();
    updateHUD();
  } else {
    // Idle sway on menu / end screens
    player.update(dt, _moveVec.set(0, 0, 0), 0);
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
  updateCamera(dt);
  renderer.render(scene, camera);
}

tick();

// Debug/test handle (harmless in production)
window.SQUATCH = {
  player,
  props,
  get score() { return score; },
  get state() { return state; },
};
