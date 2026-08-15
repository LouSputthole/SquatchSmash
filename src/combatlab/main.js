/**
 * Combat System development tool.
 *
 * This is a deliberately small composition root around the campaign's live
 * systems: Player, WeaponSystem, CombatActor/ballistics through
 * CombatLabSession, and the same cord model used by License to Grill. It is a
 * proving range, not a parallel combat framework.
 */
import * as THREE from 'three';
import { makeCord, poseCord, SWING_SECONDS } from '../bing/license-to-grill-runtime.js';
import { AudioEngine } from '../core/audio.js';
import { Player } from '../core/player.js';
import { translateKey } from '../core/settings.js';
import { createPauseMenu } from '../core/pause-menu.js';
import {
  WeaponSystem, weaponCueNames, WEAPON_IDS, weaponDef,
} from '../core/weapons/index.js';
import {
  COMBAT_LAB_TARGETS,
  CombatLabSession,
  combatTargetFromObject,
} from './session.js';

const $ = (id) => document.getElementById(id);
const menuEl = $('menu');
const startBtn = $('startBtn');
const resetBtn = $('resetBtn');
const hudEl = $('hud');
const crosshairEl = $('crosshair');
const toolButtonsEl = $('toolButtons');
const weaponReadoutEl = $('weaponReadout');
const ammoReadoutEl = $('ammoReadout');
const feedbackEl = $('feedback');
const targetsEl = $('targets');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.setAttribute('aria-label', 'Combat System first-person range');
document.body.insertBefore(renderer.domElement, document.body.firstChild);

const scene = new THREE.Scene();
scene.name = 'combatlab.scene';
scene.background = new THREE.Color(0x0b1713);
scene.fog = new THREE.Fog(0x0b1713, 20, 48);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.07, 80);
camera.name = 'combatlab.player.camera';
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xb9d8cc, 0x26362c, 1.8));
const keyLight = new THREE.DirectionalLight(0xffe2ad, 3.2);
keyLight.name = 'combatlab.light.key';
keyLight.position.set(-5, 9, 7);
scene.add(keyLight);

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x59615b, roughness: 0.96 });
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x29362f, roughness: 0.9 });
const backstopMaterial = new THREE.MeshStandardMaterial({ color: 0x39433e, roughness: 0.75, metalness: 0.2 });
const laneMaterial = new THREE.MeshStandardMaterial({ color: 0xd7bf67, roughness: 0.8 });

function meshBox(name, size, position, material, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.name = name;
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 34), floorMaterial);
floor.name = 'combatlab.range.floor';
floor.rotation.x = -Math.PI / 2;
floor.position.z = -3;
floor.receiveShadow = true;
scene.add(floor);

const backstop = meshBox(
  'combatlab.range.backstop',
  { x: 20, y: 4.5, z: 0.45 },
  { x: 0, y: 2.25, z: -15.5 },
  backstopMaterial,
);
meshBox('combatlab.range.wall.left', { x: 0.4, y: 3, z: 34 }, { x: -11, y: 1.5, z: -3 }, wallMaterial);
meshBox('combatlab.range.wall.right', { x: 0.4, y: 3, z: 34 }, { x: 11, y: 1.5, z: -3 }, wallMaterial);
for (const x of [-5.5, -1.85, 1.85, 5.5]) {
  meshBox(`combatlab.range.lane.${x}`, { x: 0.055, y: 0.012, z: 21 }, { x, y: 0.009, z: -3.5 }, laneMaterial);
}

const colliders = [
  new THREE.Box3(new THREE.Vector3(-11.3, 0, -20), new THREE.Vector3(-10.7, 3.5, 14)),
  new THREE.Box3(new THREE.Vector3(10.7, 0, -20), new THREE.Vector3(11.3, 3.5, 14)),
  new THREE.Box3(new THREE.Vector3(-11, 0, -15.8), new THREE.Vector3(11, 4.5, -15.2)),
  new THREE.Box3(new THREE.Vector3(-11, 0, 13), new THREE.Vector3(11, 3.5, 13.5)),
];
const floorZones = [{
  box: new THREE.Box3(new THREE.Vector3(-11, -0.1, -20), new THREE.Vector3(11, 0.1, 14)),
  surface: 'concrete',
}];
const world = { colliders, floorZones, groundAt: () => 0 };
const player = new Player(camera, world);
player.mode = 'walk';
player.position.set(0, 1.66, 7.5);
player.ground = 0;
player.yaw = 0;
player.pitch = 0;
player.enabled = false;
player.update(0);

const audio = new AudioEngine();
const targetVisuals = new Map();
const targetMeshes = [];
const targetRows = new Map();
const targetPositions = new Map([
  ['alpha', new THREE.Vector3(-4.2, 0, -8.4)],
  ['bravo', new THREE.Vector3(0, 0, -9.3)],
  ['charlie', new THREE.Vector3(4.2, 0, -8.4)],
]);

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(5,10,8,.86)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#c9ff79';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.fillStyle = '#f5f7ef';
  ctx.font = '900 44px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.name = `combatlab.target.label.${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  sprite.scale.set(2.8, 0.52, 1);
  return sprite;
}

function buildTarget(definition) {
  const root = new THREE.Group();
  root.name = `combatlab.target.${definition.id}`;
  root.userData.combatTargetId = definition.id;
  root.position.copy(targetPositions.get(definition.id));

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: definition.id === 'charlie' ? 0x748c98 : 0x9d5b48,
    roughness: 0.72,
    metalness: definition.id === 'charlie' ? 0.45 : 0.08,
    emissive: 0x000000,
  });
  const headMaterial = bodyMaterial.clone();
  const body = meshBox(
    `combatlab.target.${definition.id}.body`,
    { x: 0.92, y: 1.35, z: 0.42 },
    { x: 0, y: 1.12, z: 0 },
    bodyMaterial,
    root,
  );
  body.userData.hitMultiplier = 1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 12), headMaterial);
  head.name = `combatlab.target.${definition.id}.head`;
  head.position.set(0, 2.05, 0);
  head.userData.hitMultiplier = 2;
  root.add(head);
  const stand = meshBox(
    `combatlab.target.${definition.id}.stand`,
    { x: 1.35, y: 0.12, z: 0.8 },
    { x: 0, y: 0.06, z: 0 },
    backstopMaterial,
    root,
  );
  stand.userData.hitMultiplier = 0.5;
  const label = makeLabel(definition.label);
  label.position.set(0, 2.82, 0);
  root.add(label);
  scene.add(root);
  /* WeaponSystem casts a world-space ray without a camera. A Sprite's raycast
   * requires one, so the visible nameplate must never enter the recursive hit
   * set. These three named solids are the target; the label is information. */
  targetMeshes.push(body, head, stand);
  const visual = { root, body, head, stand, label, pulse: 0 };
  targetVisuals.set(definition.id, visual);
  return visual;
}

for (const definition of COMBAT_LAB_TARGETS) {
  buildTarget(definition);
  const row = document.createElement('div');
  row.className = 'target-row';
  row.dataset.target = definition.id;
  row.innerHTML = `<strong>${definition.label}</strong><span class="health-track"><span class="health-fill"></span></span><span class="target-state"></span>`;
  targetsEl.appendChild(row);
  targetRows.set(definition.id, row);
}

function paintTargets() {
  for (const target of session.snapshot().targets) {
    const row = targetRows.get(target.id);
    if (!row) continue;
    const percent = Math.max(0, Math.round((target.health / target.maxHealth) * 100));
    row.querySelector('.health-fill').style.width = `${percent}%`;
    row.querySelector('.target-state').textContent = target.dead ? 'DOWN' : `${Math.ceil(target.health)}`;
    row.style.opacity = target.dead ? '0.55' : '1';
  }
}

function paintFeedback(feedback) {
  if (!feedback) return;
  const target = feedback.targetId ? session.target(feedback.targetId)?.definition.label : '';
  const labels = {
    'gun-hit': `${target} HIT · ${Math.round(feedback.damage)} DAMAGE`,
    'gun-hit-blocked': `${target} ALREADY DOWN`,
    'whip-hit': `${target} WHIPPED · ${Math.round(feedback.damage)} DAMAGE`,
    'whip-hit-blocked': `${target} ALREADY DOWN`,
    'whip-miss': 'WHIP MISSED · GET CLOSER',
    reset: 'RANGE RESET',
  };
  feedbackEl.textContent = labels[feedback.kind] ?? feedback.kind.toUpperCase();
  if (feedback.targetId) {
    const visual = targetVisuals.get(feedback.targetId);
    if (visual) visual.pulse = feedback.kind.endsWith('hit') ? 0.20 : visual.pulse;
  }
  paintTargets();
}

const session = new CombatLabSession({ onFeedback: paintFeedback });

const weaponSystem = new WeaponSystem({
  camera,
  world: scene,
  audio,
  groundAt: () => 0,
  hitTargets: [...targetMeshes, backstop],
  range: 55,
  onImpact: ({ object, weapon }) => {
    const hit = combatTargetFromObject(object);
    if (!hit) {
      feedbackEl.textContent = 'BACKSTOP HIT';
      return;
    }
    session.weaponImpact(hit.targetId, weapon, { multiplier: hit.multiplier });
  },
  onEvent: () => paintWeapon(),
});

const cord = makeCord();
cord.root.name = 'combatlab.weapon.cord-whip';
cord.root.userData.reusableObject = 'license-to-grill-cord-whip';
camera.add(cord.root);
cord.root.visible = false;
poseCord(cord, -1);

const raycaster = new THREE.Raycaster();
raycaster.far = 3.2;
const centre = new THREE.Vector2(0, 0);
let running = false;
let selected = WEAPON_IDS.CARBINE;
let whipTime = -1;
let frames = 0;
let automaticSimulation = true;

function paintWeapon() {
  if (selected === 'whip') {
    weaponReadoutEl.textContent = 'CORD WHIP';
    ammoReadoutEl.textContent = session.whipCooldown > 0 ? 'RECOVERING' : 'READY';
    return;
  }
  const state = weaponSystem.hud();
  weaponReadoutEl.textContent = state?.name?.toUpperCase() ?? 'EMPTY HANDS';
  ammoReadoutEl.textContent = state
    ? `${state.rounds} / ${state.reserve}${state.reloading ? ' · RELOADING' : ''}`
    : '—';
}

function equip(id) {
  if (id === 'whip') {
    weaponSystem.stow({ silent: true });
    selected = 'whip';
    cord.root.visible = true;
    poseCord(cord, -1);
  } else {
    selected = id;
    cord.root.visible = false;
    whipTime = -1;
    weaponSystem.equip(id);
  }
  feedbackEl.textContent = id === 'whip' ? 'WHIP READY' : `${weaponDef(id).short} READY`;
  paintWeapon();
  return selected;
}

function swingWhip() {
  if (selected !== 'whip') return { applied: false, reason: 'not-equipped' };
  if (session.whipCooldown > 0) {
    feedbackEl.textContent = 'WHIP RECOVERING';
    return { applied: false, reason: 'cooldown' };
  }
  raycaster.setFromCamera(centre, camera);
  const hit = raycaster.intersectObjects(targetMeshes, true)[0] ?? null;
  const owner = hit ? combatTargetFromObject(hit.object) : null;
  whipTime = 0;
  if (audio.hasSample?.('bing.grill.cord.whip')) audio.play('bing.grill.cord.whip', { volume: 0.72 });
  else audio.play('heist.player.hit', { volume: 0.55 });
  return session.whipImpact(owner?.targetId ?? null, {
    distance: hit?.distance ?? Infinity,
    facing: owner ? 1 : -1,
  });
}

function reset() {
  weaponSystem.setTrigger(false);
  weaponSystem.stow({ silent: true });
  weaponSystem.firearms.clear();
  for (const key of Object.keys(weaponSystem.stats)) weaponSystem.stats[key] = 0;
  weaponSystem.cueLog.length = 0;
  session.reset();
  for (const visual of targetVisuals.values()) {
    visual.root.rotation.set(0, 0, 0);
    visual.root.position.copy(targetPositions.get(visual.root.userData.combatTargetId));
    visual.body.material.emissive.setHex(0x000000);
    visual.head.material.emissive.setHex(0x000000);
    visual.pulse = 0;
  }
  player.clearKeys();
  player.position.set(0, 1.66, 7.5);
  player.velocity.set(0, 0, 0);
  player.ground = 0;
  player.jumpHeight = 0;
  player.grounded = true;
  player.yaw = 0;
  player.pitch = 0;
  player.update(0);
  equip(WEAPON_IDS.CARBINE);
  paintTargets();
  return state();
}

function aimAt(targetId) {
  const visual = targetVisuals.get(targetId);
  if (!visual) return false;
  const at = visual.head.getWorldPosition(new THREE.Vector3());
  const dx = at.x - player.position.x;
  const dz = at.z - player.position.z;
  const horizontal = Math.hypot(dx, dz);
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.atan2(at.y - camera.position.y, horizontal);
  player.update(0);
  /* The deterministic verifier can aim and fire between render frames. Keep
   * the camera and labeled hit meshes current for that same-frame shot. */
  scene.updateMatrixWorld(true);
  return true;
}

function placeNear(targetId, distance = 2.15) {
  const visual = targetVisuals.get(targetId);
  if (!visual) return false;
  player.position.set(visual.root.position.x, 1.66, visual.root.position.z + distance);
  player.velocity.set(0, 0, 0);
  player.ground = 0;
  player.update(0);
  return aimAt(targetId);
}

function updateTargets(dt) {
  for (const [id, visual] of targetVisuals) {
    const actor = session.target(id).actor;
    const goal = actor.incapacitated ? 1.34 : 0;
    visual.root.rotation.z += (goal - visual.root.rotation.z) * Math.min(1, dt * 9);
    visual.pulse = Math.max(0, visual.pulse - dt);
    const glow = visual.pulse > 0 ? 0x5b160b : 0x000000;
    visual.body.material.emissive.setHex(glow);
    visual.head.material.emissive.setHex(glow);
  }
}

function update(dt) {
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  player.update(step);
  weaponSystem.update(step, { speed: player.velocity.length() });
  session.update(step);
  if (whipTime >= 0) {
    whipTime += step;
    poseCord(cord, Math.min(1, whipTime / SWING_SECONDS));
    if (whipTime >= SWING_SECONDS) {
      whipTime = -1;
      poseCord(cord, -1);
    }
  }
  updateTargets(step);
  paintWeapon();
  frames++;
}

function state() {
  return {
    running,
    selected,
    frames,
    player: { x: player.position.x, y: player.position.y, z: player.position.z },
    weapon: weaponSystem.hud(),
    session: session.snapshot(),
  };
}

/* Chrome returns a promise from requestPointerLock and REJECTS it inside its
 * re-lock throttle — which is exactly what a resume from the pause menu hits.
 * An unhandled rejection here is a console error the boot-errors gate reads,
 * so it is caught, the way src/main.js's requestLock() catches it. */
function lockPointer() {
  const p = renderer.domElement.requestPointerLock?.();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function begin() {
  if (running) return Promise.resolve(true);
  running = true;
  menuEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  crosshairEl.classList.remove('hidden');
  toolButtonsEl.classList.remove('hidden');
  player.enabled = true;
  player.mode = 'walk';
  reset();
  lockPointer();
  /* Input becomes responsive immediately. Audio can finish loading behind it;
   * a development tool should never look frozen because a sample is decoding. */
  audio.init()
    .then(() => audio.loadManifest({ names: [...weaponCueNames(), 'bing.grill.cord.whip', 'heist.player.hit'] }))
    .catch(() => {});
  return Promise.resolve(true);
}

startBtn.addEventListener('click', begin);
resetBtn.addEventListener('click', reset);

/* The shared pause menu (Tab): a development range still wants the settings
 * — sensitivity and the keymap most of all — in the same place as everywhere. */
let paused = false;
createPauseMenu({
  title: 'Combat Lab',
  canPause: () => running,
  getObjective: 'Shoot the range. Compare the numbers.',
  instructions: [
    'W A S D — move. Shift — sprint. C — crouch. Space — jump.',
    '1 — carbine. 2 — revolver. 3 — whip. R — reload. X — reset the range.',
    'Click — fire or swing. Tab — pause or resume.',
  ],
  onPause: () => {
    paused = true;
    player.enabled = false;
    player.clearKeys();
    weaponSystem.setTrigger(false);
  },
  onResume: () => {
    paused = false;
    player.enabled = true;
    lockPointer();
  },
});

window.addEventListener('keydown', (event) => {
  if (!running || paused) return;
  if (event.code === 'Space') event.preventDefault();
  player.setKey(translateKey(event.code), true);
  if (event.repeat) return;
  if (event.code === 'Digit1') equip(WEAPON_IDS.CARBINE);
  else if (event.code === 'Digit2') equip(WEAPON_IDS.REVOLVER);
  else if (event.code === 'Digit3') equip('whip');
  else if (event.code === 'KeyR' && selected !== 'whip') weaponSystem.reload();
  else if (event.code === 'KeyX') reset();
});
window.addEventListener('keyup', (event) => player.setKey(translateKey(event.code), false));
window.addEventListener('blur', () => {
  player.clearKeys();
  weaponSystem.setTrigger(false);
});
window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.handleMouseMove(event.movementX, event.movementY);
});
renderer.domElement.addEventListener('mousedown', (event) => {
  if (!running || event.button !== 0) return;
  if (document.pointerLockElement !== renderer.domElement) lockPointer();
  if (selected === 'whip') swingWhip();
  else weaponSystem.setTrigger(true);
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 0) weaponSystem.setTrigger(false);
});
window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let renderEnabled = true;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (running && automaticSimulation && !paused) update(dt);
  if (renderEnabled) renderer.render(scene, camera);
}
requestAnimationFrame(frame);
paintTargets();
paintWeapon();

window.combatSystem = {
  THREE,
  scene,
  camera,
  renderer,
  player,
  session,
  weaponSystem,
  targetVisuals,
  targetMeshes,
  start: begin,
  reset,
  equip,
  aimAt,
  placeNear,
  swingWhip,
  fire: () => weaponSystem.triggerPress(),
  tick: update,
  state,
  setAutomaticSimulation(value) { automaticSimulation = value === true; },
  setRenderEnabled(value) { renderEnabled = value === true; },
  get automaticSimulation() { return automaticSimulation; },
  get frames() { return frames; },
};
