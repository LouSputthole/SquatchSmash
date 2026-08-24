/**
 * The Trophy Room — a dev-only review gallery, not a campaign scene.
 *
 * Every prop the campaign's own code claims a mission can earn, in one room,
 * each on its own pedestal with a label naming its source, its earn
 * condition, and whether it is a real modeled object or a placeholder
 * standing in for one that was promised and never built. See
 * `docs/TROPHY-AUDIT-2026-08-22.md` for how this list was produced — every
 * entry here is sourced from that audit, not invented for this room.
 *
 * Built ones are NOT reimplemented here. `tammyDashboardMug` and
 * `golfTrophy` are imported straight from `src/world/dressing.js`, the same
 * functions the real apartment calls — this room is a viewer, not a second
 * copy of the props.
 *
 * Composition-root shape follows `src/combatlab/main.js`: a small standalone
 * range, `Player` + `InteractionSystem` + the shared pause menu, a plain
 * `world = { colliders, floorZones, groundAt }`, no campaign save touched.
 */
import * as THREE from 'three';
import { AudioEngine } from '../core/audio.js';
import { Player } from '../core/player.js';
import { InteractionSystem } from '../core/interaction.js';
import { translateKey } from '../core/settings.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { box, cylinder, mat } from '../world/build.js';
import { tammyDashboardMug, golfTrophy } from '../world/dressing.js';

const $ = (id) => document.getElementById(id);
const menuEl = $('menu');
const startBtn = $('startBtn');
const hudEl = $('hud');
const crosshairEl = $('crosshair');
const cardEl = $('trophyCard');
const cardTitleEl = $('trophyCardTitle');
const cardBadgeEl = $('trophyCardBadge');
const cardBodyEl = $('trophyCardBody');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
attachPixelRatio(renderer);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label', 'Trophy Room review gallery');
document.body.insertBefore(renderer.domElement, document.body.firstChild);

const scene = new THREE.Scene();
scene.name = 'trophyroom.scene';
scene.background = new THREE.Color(0x0e0f14);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 90);
camera.name = 'trophyroom.camera';
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xe8e2d2, 0x2a2c30, 2.2));
const gallerySun = new THREE.DirectionalLight(0xfff1d6, 2.0);
gallerySun.position.set(-6, 14, 8);
gallerySun.castShadow = true;
gallerySun.shadow.mapSize.set(1536, 1536);
gallerySun.shadow.camera.left = -14;
gallerySun.shadow.camera.right = 14;
gallerySun.shadow.camera.top = 14;
gallerySun.shadow.camera.bottom = -14;
scene.add(gallerySun);

/* ------------------------------------------------------------------ */
/* The room                                                            */
/* ------------------------------------------------------------------ */

const ROOM_W = 13;   // x: -6.5..6.5
const ROOM_L = 34;   // z: 0..34
const WALL_H = 3.6;

const floorMat = mat({ color: 0x3a352a, roughness: 0.8 });
const wallMat = mat({ color: 0x272a32, roughness: 0.85 });
const trimMat = mat({ color: 0x3a3f4c, roughness: 0.55, metalness: 0.25 });

scene.add(box({
  size: [ROOM_W, 0.2, ROOM_L], pos: [0, -0.1, ROOM_L / 2], mat: floorMat, name: 'trophyroom.floor',
}));
scene.add(box({
  size: [ROOM_W, 0.2, ROOM_L], pos: [0, WALL_H, ROOM_L / 2], mat: wallMat, name: 'trophyroom.ceiling',
}));
scene.add(box({
  size: [0.3, WALL_H, ROOM_L], pos: [-ROOM_W / 2, WALL_H / 2, ROOM_L / 2], mat: wallMat, name: 'trophyroom.wall.west',
}));
scene.add(box({
  size: [0.3, WALL_H, ROOM_L], pos: [ROOM_W / 2, WALL_H / 2, ROOM_L / 2], mat: wallMat, name: 'trophyroom.wall.east',
}));
scene.add(box({
  size: [ROOM_W, WALL_H, 0.3], pos: [0, WALL_H / 2, -0.15], mat: wallMat, name: 'trophyroom.wall.north',
}));
scene.add(box({
  size: [ROOM_W, WALL_H, 0.3], pos: [0, WALL_H / 2, ROOM_L + 0.15], mat: wallMat, name: 'trophyroom.wall.south',
}));
// A floor-level trim line, purely so the room reads as designed rather than a box.
scene.add(box({
  size: [ROOM_W - 0.02, 0.06, 0.06], pos: [0, 0.03, 0.15], mat: trimMat, name: 'trophyroom.trim.north',
}));

const colliders = [
  new THREE.Box3(
    new THREE.Vector3(-ROOM_W / 2 - 0.3, 0, -0.3),
    new THREE.Vector3(-ROOM_W / 2, WALL_H, ROOM_L + 0.3),
  ),
  new THREE.Box3(
    new THREE.Vector3(ROOM_W / 2, 0, -0.3),
    new THREE.Vector3(ROOM_W / 2 + 0.3, WALL_H, ROOM_L + 0.3),
  ),
  new THREE.Box3(
    new THREE.Vector3(-ROOM_W / 2, 0, -0.3),
    new THREE.Vector3(ROOM_W / 2, WALL_H, 0),
  ),
  new THREE.Box3(
    new THREE.Vector3(-ROOM_W / 2, 0, ROOM_L),
    new THREE.Vector3(ROOM_W / 2, WALL_H, ROOM_L + 0.3),
  ),
];
const floorZones = [{
  box: new THREE.Box3(
    new THREE.Vector3(-ROOM_W / 2, -0.1, -0.1),
    new THREE.Vector3(ROOM_W / 2, 0.1, ROOM_L + 0.1),
  ),
  surface: 'concrete',
}];
const world = { colliders, floorZones, groundAt: () => 0 };

const player = new Player(camera, world);
player.mode = 'walk';
player.position.set(0, 1.66, 1.4);
/* Camera forward is -Z at yaw 0 (see core/player.js's YXZ euler); the room
 * spans +Z from the spawn, so yaw starts at PI to face into it rather than
 * out through the wall behind the player. */
player.yaw = Math.PI;
player.pitch = 0;
player.enabled = false;
player.update(0);

/* The tiny HUD contract InteractionSystem needs -- exactly
 * showPrompt/hidePrompt/setHold, nothing from core/hud.js. Same pattern
 * src/silvercase/main.js already uses for the same reason: this room has
 * its own prompt markup and no use for the full campaign HUD. */
const promptEl = $('prompt');
const promptKeyEl = $('promptKey');
const promptLabelEl = $('promptLabel');
const tinyHud = {
  showPrompt(label, key) {
    promptKeyEl.textContent = key || 'E';
    promptLabelEl.textContent = typeof label === 'function' ? label() : label;
    promptEl.classList.remove('hidden');
  },
  hidePrompt() {
    promptEl.classList.add('hidden');
  },
  setHold() { /* no hold interactions in this room */ },
};
const interaction = new InteractionSystem(camera, tinyHud);
const audio = new AudioEngine();

/* ------------------------------------------------------------------ */
/* Pedestal labels — always-visible, same canvas-sprite technique       */
/* Combat Lab already uses for its target nameplates.                   */
/* ------------------------------------------------------------------ */

function makeLabel(lines, { accent = '#c9ff79' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(6,7,10,.88)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5f7ef';
  ctx.font = '900 40px Trebuchet MS, sans-serif';
  ctx.fillText(lines[0], canvas.width / 2, 62);
  ctx.fillStyle = accent;
  ctx.font = '900 26px Trebuchet MS, sans-serif';
  ctx.fillText(lines[1], canvas.width / 2, 108);
  ctx.fillStyle = '#b9c2b8';
  ctx.font = '700 20px Trebuchet MS, sans-serif';
  ctx.fillText(lines[2] ?? '', canvas.width / 2, 140);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(2.6, 0.65, 1);
  return sprite;
}

/**
 * A placeholder standing in for a trophy the campaign promises but has
 * never built: a translucent grey silhouette, not a real prop, so it can
 * never be mistaken for finished work from across the room.
 */
function buildPlaceholder() {
  const g = new THREE.Group();
  const ghostMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0ac, roughness: 0.6, transparent: true, opacity: 0.32, wireframe: false,
  });
  const wireMat = new THREE.MeshBasicMaterial({ color: 0xffc85a, wireframe: true, transparent: true, opacity: 0.6 });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), ghostMat);
  body.position.y = 0.09;
  g.add(body);
  const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.078, 0), wireMat);
  wire.position.y = 0.09;
  g.add(wire);
  return g;
}

/* ------------------------------------------------------------------ */
/* The exhibit list — every entry sourced from                          */
/* docs/TROPHY-AUDIT-2026-08-22.md. Add a row here the day a new         */
/* trophy is proposed or built; this room is the one place that has to  */
/* know about all of them at once.                                      */
/* ------------------------------------------------------------------ */

const BUILT = 'built';
const MISSING = 'missing';
const PROPOSED = 'proposed';

const STATUS_META = {
  [BUILT]: { label: 'BUILT', accent: '#c9ff79' },
  [MISSING]: { label: 'PROMISED — NOT BUILT', accent: '#ff6a5a' },
  [PROPOSED]: { label: 'PROPOSED — DESIGN STAGE', accent: '#ffc85a' },
};

const EXHIBITS = [
  {
    id: 'tammyDashboardMug',
    name: 'Tammy’s Dashboard Mug',
    source: 'The Beef Run',
    condition: 'Always, on completing the Beef Run.',
    status: BUILT,
    detail: 'src/world/dressing.js — real modeled prop, wired through '
      + 'persistentDressingForCampaign() off state.missions.airstrip_smuggling.status. '
      + 'The one trophy that already worked end to end before this pass.',
    build: (M) => tammyDashboardMug(M, { x: 0, y: 0.09, z: 0, rotY: 0 }),
  },
  {
    id: 'golfTrophy',
    name: 'Silver Pines Trophy',
    source: 'A Morning at Silver Pines',
    condition: 'Even par or better across all three holes '
      + '(state.missions.silver_pines.toPar <= 0).',
    status: BUILT,
    detail: 'src/world/dressing.js — added this pass. Reads the same toPar '
      + 'field src/core/golf-story.js already persists per hole; no new '
      + 'tracking needed, only the prop and the read.',
    build: (M) => golfTrophy(M, { x: 0, y: 0, z: 0, rotY: 0 }),
  },
  {
    id: 'prospectFlightJacket',
    name: 'Prospect Flight Jacket',
    source: 'The Beef Run',
    condition: 'Always, on completing the Beef Run.',
    status: MISSING,
    detail: 'src/beefrun/mission.js earnedUnlocks() — computed, named, reaches '
      + 'the save. Zero hits in dressing.js or apartment.js. Highest-leverage '
      + 'next build: guaranteed on every completion, same as the mug.',
  },
  {
    id: 'brushrunnerAccess',
    name: 'Brushrunner Access',
    source: 'The Beef Run',
    condition: 'Always, on completing the Beef Run.',
    status: MISSING,
    detail: 'Same earnedUnlocks() list as the jacket. Never built. Probably a '
      + 'keycard/tag prop rather than clothing — undecided.',
  },
  {
    id: 'stoveBusinessCard',
    name: 'Stove’s Business Card',
    source: 'The Beef Run',
    condition: '3 or more guns delivered in the run.',
    status: MISSING,
    detail: 'src/beefrun/mission.js — a real skill-conditioned unlock. Never built.',
  },
  {
    id: 'silverbackOrnament',
    name: 'Silverback Ornament',
    source: 'The Beef Run',
    condition: 'Cargo damage under 25% and 18+ packages delivered.',
    status: MISSING,
    detail: 'src/beefrun/mission.js — a real skill-conditioned unlock. Never built.',
  },
  {
    id: 'elHuesoFreeFlight',
    name: 'El Hueso Free Flight',
    source: 'The Beef Run',
    condition: 'Mountain landing quality over 0.5.',
    status: MISSING,
    detail: 'src/beefrun/mission.js — a real skill-conditioned unlock. Never built.',
  },
  {
    id: 'silentSquatchTrophy',
    name: 'The Squatchanium Miniature',
    source: 'PROJECT SILENT SQUATCH',
    condition: 'state.missions.silent_squatch.trophyAwarded === true.',
    status: MISSING,
    detail: 'The biggest single gap this audit found. src/core/campaign-finale.js '
      + 'already tells the player "PROJECT SILENT SQUATCH left a trophy in the '
      + 'flat" on the finale highlights screen. persistentDressingForCampaign() '
      + 'never reads trophyAwarded. The finale is currently lying by omission.',
  },
  {
    id: 'skimToldLou',
    name: 'The Skim Envelope',
    source: 'Bada Bing Two (proposed)',
    condition: 'Told Lou about the skimmed slot machine.',
    status: PROPOSED,
    detail: 'docs/BING-SKIM-QUEST-DESIGN.md — one of two proposed payoffs for '
      + 'the existing "somebody is skimming the machine... a conversation for '
      + 'another night" thread from src/bing/main.js. Not implemented; needs '
      + 'the owner’s read on the design doc first.',
  },
  {
    id: 'skimCoveredForHim',
    name: 'Old Stove’s Lighter',
    source: 'Bada Bing Two (proposed)',
    condition: 'Covered for the skimmer instead of telling Lou.',
    status: PROPOSED,
    detail: 'The other branch of the same proposed quest. See '
      + 'docs/BING-SKIM-QUEST-DESIGN.md.',
  },
];

const PEDESTAL_SPACING = 6.2;
const START_Z = 5;
const SIDE_X = 4.6;

const materialsCtx = {};
EXHIBITS.forEach((exhibit, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);
  const x = side * SIDE_X;
  const z = START_Z + row * PEDESTAL_SPACING;

  const pedestal = cylinder({
    r: 0.22, h: 0.9, pos: [x, 0.45, z], mat: trimMat, name: `trophyroom.pedestal.${exhibit.id}`,
  });
  const cap = cylinder({
    r: 0.24, h: 0.03, pos: [x, 0.915, z], mat: mat({ color: 0x111318, roughness: 0.4, metalness: 0.5 }),
    name: `trophyroom.pedestal.${exhibit.id}.cap`,
  });
  scene.add(pedestal, cap);

  // A gallery spot per exhibit -- each pedestal reads as its own display,
  // not one dim room of near-identical silhouettes at a distance.
  const spot = new THREE.PointLight(0xfff2d8, 9, 5.5, 2);
  spot.position.set(x, 2.4, z);
  scene.add(spot);

  const displayGroup = new THREE.Group();
  displayGroup.name = `trophyroom.exhibit.${exhibit.id}`;
  displayGroup.position.set(x, 0.93, z);
  displayGroup.rotation.y = side < 0 ? Math.PI * 0.15 : -Math.PI * 0.15;
  const item = exhibit.status === BUILT ? exhibit.build(materialsCtx) : buildPlaceholder();
  displayGroup.add(item);
  scene.add(displayGroup);

  const meta = STATUS_META[exhibit.status];
  const label = makeLabel([exhibit.name, meta.label, exhibit.source], { accent: meta.accent });
  label.position.set(x, 1.55, z);
  scene.add(label);

  /* Spans well past the player's 1.66m eye height -- a target that stopped at
   * eye height would put a level centre-screen ray from a standing player
   * skimming its very top edge, which is exactly the miss this fixes. */
  const target = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 2.4, 10),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  target.name = `trophyroom.target.${exhibit.id}`;
  target.position.set(x, 0.9, z);
  scene.add(target);
  interaction.register(target, {
    label: exhibit.name,
    key: 'E',
    onUse: () => showCard(exhibit),
  });
});

function showCard(exhibit) {
  const meta = STATUS_META[exhibit.status];
  cardTitleEl.textContent = exhibit.name;
  cardBadgeEl.textContent = meta.label;
  cardBadgeEl.style.color = meta.accent;
  cardBadgeEl.style.borderColor = meta.accent;
  cardBodyEl.innerHTML = `<p><b>Source:</b> ${exhibit.source}</p>`
    + `<p><b>Condition:</b> ${exhibit.condition}</p>`
    + `<p>${exhibit.detail}</p>`;
  cardEl.classList.remove('hidden');
}

$('trophyCardClose').addEventListener('click', () => cardEl.classList.add('hidden'));

/* ------------------------------------------------------------------ */
/* Boot, input, pause                                                   */
/* ------------------------------------------------------------------ */

function lockPointer() {
  const p = renderer.domElement.requestPointerLock?.();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

let running = false;
let paused = false;

function begin() {
  if (running) return;
  running = true;
  menuEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  crosshairEl.classList.remove('hidden');
  player.enabled = true;
  player.mode = 'walk';
  lockPointer();
  audio.init().catch(() => {});
}
startBtn.addEventListener('click', begin);

createPauseMenu({
  title: 'Trophy Room',
  canPause: () => running,
  getObjective: 'Walk the room. Press E at a pedestal to read the file.',
  instructions: [
    'W A S D — move. Shift — sprint.',
    'Mouse — look. E — read a pedestal.',
    'Tab — pause or resume.',
  ],
  onPause: () => {
    paused = true;
    player.enabled = false;
    player.clearKeys();
  },
  onResume: () => {
    paused = false;
    player.enabled = true;
    lockPointer();
  },
});

window.addEventListener('keydown', (event) => {
  if (!running || paused) return;
  player.setKey(translateKey(event.code), true);
  if (event.code === 'KeyE') interaction.press();
  if (event.code === 'Escape') cardEl.classList.add('hidden');
});
window.addEventListener('keyup', (event) => player.setKey(translateKey(event.code), false));
window.addEventListener('blur', () => player.clearKeys());
window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.handleMouseMove(event.movementX, event.movementY);
});
window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (running && !paused) {
    player.update(dt);
    interaction.update(dt);
  }
  /* Where the player's ears are. Without this the WebAudio listener sits at
   * the world origin facing -Z for the whole scene and every positioned cue is
   * panned as heard from there -- see the long note in
   * src/cartel-palace/main.js, where the owner caught it. */
  audio.updateListener(camera);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.trophyRoom = {
  scene, camera, player, exhibits: EXHIBITS,
};
