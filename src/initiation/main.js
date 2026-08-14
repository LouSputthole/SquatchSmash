import * as THREE from 'three';
import { EffectComposer } from '../../lib/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../lib/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../lib/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../lib/jsm/postprocessing/OutputPass.js';
import { lambert } from '../../game/src/world.js';
import { MEMBER_PALETTE, Person } from '../core/person.js';
import { DebrisSystem } from '../../game/src/debris.js';
import { Effects } from '../../game/src/effects.js';
import * as sfx from './audio.js';
import {
  SPEECH,
  Q1_LINES,
  Q2_LINES,
  CORRECT_LINES,
  WRONG_LINES,
  ENDURED_LINES,
  ROAR_LINES,
  ANOINT_LINES,
  RETRY_LINE,
  QUIZ_OPTIONS,
} from './dialogue.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import {
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  navigateCampaign,
} from '../core/campaign.js';

// ============================================================
// THE INITIATION — current chapter endpoint.
// Tony Squatchtana walks from the apartment into the night forest,
// where Booskibro puts him through the rites: the Gauntlet (endure
// the beating, never swing back), the Roar, and the Timber. Tony
// remains human and walks out a made member of the Sasquatch family.
// ============================================================

const BOUNDS = 88;
const BASE_SPEED = 10;
const SPRINT_SPEED = 15;
const BASE_FOV = 55;

// The rites start with empty hands, but the same five pockets remain visible
// as every other campaign scene. Scene loadouts replace these contents; the
// inventory language itself never changes underneath the player.
const sceneInventory = new SceneInventoryBar({ slots: 5, visible: true });

/* ------------------------------------------------------------------
 * Gap G1 minimal relief (docs/GAME-FLOW-AND-FINISH-PLAN-2026-08-05.md §7,
 * phase 1). Three things and NOTHING else — the rites themselves stay the
 * frozen, owner-gated build:
 *   1. claim the scene, so a reload lands back here instead of wherever the
 *      save last was;
 *   2. write a completion event at the anointing, exactly once;
 *   3. give the end card a real exit home, so no save is ever trapped in a
 *      terminal scene.
 * The approved rewrite replaces all three with the real thing.
 * ------------------------------------------------------------------ */
const campaign = createCampaign();
if (campaign.state.scene.id !== SCENE_IDS.INITIATION) {
  campaign.enter(SCENE_IDS.INITIATION, { spawn: 'gathering' });
}

let initiationRecorded = false;
function recordInitiationComplete() {
  if (initiationRecorded) return;
  initiationRecorded = true;
  try {
    /* Exact-once by the time-event ledger, so a replayed ceremony never
     * farms hours or re-announces itself. */
    campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_INITIATION, (state) => {
      state.missions[MISSION_IDS.INITIATION].status = 'complete';
    });
  } catch (error) {
    console.error('[initiation] completion could not be recorded', error);
  }
}

const MAX_HP = 100;
const STOP_HP = MAX_HP / 5; // the Circle stops the beating at one fifth
const CIRCLE_R = 2.3;       // gauntlet ring radius around the prospect
const MEMBER_COUNT = 14;

const FIRE = { x: 0, z: 0 };
const STAGE = { x: 0, z: 9 };
const SPAWN = { x: 0, z: -78 };
const ARRIVE_R = 24; // walking this close to the fire starts the ceremony

// The prospect line: front row, facing the stage across the fire.
// Four NPC prospects plus one glowing empty slot — yours. You're
// Prospect Two, right next to the poor soul who goes first.
const LINE_Z = -8;
const PLAYER_SLOT = { x: -2.2, z: LINE_Z };
const PROSPECT_XS = [-4.4, 0, 2.2, 4.4];
const LINE_CENTER = { x: 0, z: LINE_Z };

// Everyone here is human. The prospect came straight from their
// apartment — no bandana yet, that has to be earned. Members wear
// silver-grey with the red bandana; Booskibro gets the purple one.
const PROSPECT_PALETTE = {
  shirt: 0x6b7a4a, shirtDark: 0x53603a, pants: 0x33383f,
  skin: 0xe8b88a, bandana: null, hair: 0x3a2a1a,
};
const INDUCTED_PALETTE = {
  ...MEMBER_PALETTE,
  skin: PROSPECT_PALETTE.skin,
  hair: PROSPECT_PALETTE.hair,
  bandana: 0xd92e2e,
};
const BOOSKI_PALETTE = {
  shirt: 0x3c414c, shirtDark: 0x2c313a, pants: 0x23272e,
  skin: 0xd9a878, bandana: 0x7b4fd9, hair: null,
  face: 'assets/faces/booski.png',
};
const MEMBER_SHIRTS = [0x9aa0ab, 0x8a8f9c, 0xa8aeba, 0x79808e];
const MEMBER_SKINS = [0xe8b88a, 0xc98d5f, 0x8d5a3b, 0xf0d0b0, 0xba8054];
const MEMBER_HAIR = [0x2a2018, 0x11100c, 0x4a331c, 0x6e6659, 0x1e1c22];

// The real Circle — the crew's actual faces, in semicircles behind the
// prospect line. Big Uncle Lou Sputthole isn't in the crowd: he's on the stage.
// angle: degrees around the line's center (180 = directly behind you).
const FEATURED = [
  { name: 'SHUBES', face: 'assets/faces/shubes.png', shirt: 0x8a8f9c, angle: 120, r: 5.5 },
  { name: 'DEATHMEGATRON', face: 'assets/faces/deathmegatron.png', shirt: 0x9aa0ab, angle: 140, r: 5.5 },
  { name: 'RIPPINFLOW', face: 'assets/faces/rippinflow.png', shirt: 0x2f62d9, angle: 160, r: 5.5 },
  { name: 'SNOW', face: 'assets/faces/snow.png', shirt: 0xf0f0ec, angle: 180, r: 5.5 },
  { name: 'ERICAN', face: 'assets/faces/erican.png', shirt: 0xe8e4d4, angle: 200, r: 5.5 },
  { name: 'HOGMAMA', face: 'assets/faces/hogmama.png', shirt: 0x3a3a44, angle: 220, r: 5.5 },
  { name: 'GRATIN', face: 'assets/faces/gratin.png', shirt: 0x5a4a6e, angle: 240, r: 5.5 },
  { name: 'CAPTAIN LOU SASOLE', face: 'assets/faces/sasole.png', shirt: 0x2e3a5e, angle: 170, r: 8.3 },
];
// Second-row slots for the unnamed members
const CROWD_ROW2 = [130, 150, 190, 210, 230];

// ---------- Renderer / scene / bloom ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 600);

// Bloom is what sells the night. Emissive things (flames, embers, moon,
// stars) get HDR colors pushed above 1.0 so only they cross the threshold;
// lambert-lit surfaces stay below it and just catch a faint warm halo.
const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.5, 1.0
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Night sky, fog, lights ----------
scene.background = new THREE.Color(0x060a14);
scene.fog = new THREE.Fog(0x060a14, 28, 160);

scene.add(new THREE.HemisphereLight(0x25335a, 0x0a100c, 0.62));

const moonLight = new THREE.DirectionalLight(0x9db4e6, 0.62);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -45;
moonLight.shadow.camera.right = 45;
moonLight.shadow.camera.top = 45;
moonLight.shadow.camera.bottom = -45;
moonLight.shadow.camera.near = 10;
moonLight.shadow.camera.far = 200;
moonLight.shadow.bias = -0.0005;
scene.add(moonLight);
scene.add(moonLight.target);
const _moonOffset = new THREE.Vector3(-35, 60, 45);

// Soft radial dot texture shared by all particle systems
function makeDotTexture(size = 64, stops = [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.7)'], [1, 'rgba(255,255,255,0)']]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [k, col] of stops) g.addColorStop(k, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const dotTex = makeDotTexture();

// Stars: brightness-varied points high on a dome — bloom picks out the bright ones
{
  const N = 550;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const el = 0.12 + Math.random() * 1.35; // elevation
    const r = 380;
    pos[i * 3] = Math.cos(a) * Math.cos(el) * r;
    pos[i * 3 + 1] = Math.sin(el) * r;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
    c.setHSL(0.58 + Math.random() * 0.1, 0.4, 0.35 + Math.random() * 0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 2.4, map: dotTex, vertexColors: true, transparent: true,
    depthWrite: false, sizeAttenuation: false, fog: false,
  });
  mat.color.setScalar(2.2); // HDR push so the brightest stars bloom
  scene.add(new THREE.Points(geo, mat));
}

// Moon: a bright sprite that blooms into a halo
{
  const moonTex = makeDotTexture(256, [
    [0, 'rgba(255,255,255,1)'], [0.42, 'rgba(235,240,255,1)'],
    [0.5, 'rgba(190,205,240,.35)'], [1, 'rgba(160,180,230,0)'],
  ]);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false }));
  moon.material.color.setScalar(1.7);
  moon.position.set(-140, 170, 300);
  moon.scale.setScalar(46);
  scene.add(moon);
}

// ---------- Ground ----------
function makeNightGroundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#16241b';
  ctx.fillRect(0, 0, 512, 512);
  const shades = ['#122016', '#1a2b1f', '#0f1b13', '#1e3023', '#14251a'];
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = shades[Math.floor(Math.random() * shades.length)];
    const s = 2 + Math.random() * 7;
    ctx.globalAlpha = 0.25 + Math.random() * 0.5;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
{
  const groundTex = makeNightGroundTexture();
  groundTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshLambertMaterial({ map: groundTex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

// Distant ridge silhouettes
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
  const dist = 135 + Math.random() * 30;
  const h = 32 + Math.random() * 32;
  const mtn = new THREE.Mesh(new THREE.ConeGeometry(h * 0.95, h, 5), lambert(0x0b111e));
  mtn.position.set(Math.cos(a) * dist, h / 2 - 2, Math.sin(a) * dist);
  mtn.rotation.y = Math.random() * Math.PI;
  scene.add(mtn);
}

// ---------- Forest ----------
const colliders = []; // {x, z, r} static push-out volumes

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const NIGHT_GREENS = [0x1c3322, 0x213c28, 0x182c1e, 0x28452e];
const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 2.2, 7);
const tierGeos = [
  new THREE.ConeGeometry(1.9, 2.4, 8),
  new THREE.ConeGeometry(1.4, 2.4, 8),
  new THREE.ConeGeometry(0.9, 2.4, 8),
];

function addTree(x, z) {
  const g = new THREE.Group();
  const s = 0.8 + Math.random() * 0.9;
  const green = lambert(NIGHT_GREENS[Math.floor(Math.random() * NIGHT_GREENS.length)]);
  g.add(mesh(trunkGeo, lambert(0x2c2014), 0, 1.1, 0));
  const tiers = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < tiers; i++) {
    g.add(mesh(tierGeos[i], green, 0, 2.2 + i * 1.4, 0));
  }
  g.scale.setScalar(s);
  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  scene.add(g);
  colliders.push({ x, z, r: 0.8 * s });
}

function forestFits(x, z) {
  if (Math.hypot(x - FIRE.x, z - FIRE.z) < 17) return false;              // ceremony clearing
  if (Math.abs(x) < 6 && z < -12 && z > -BOUNDS - 4) return false;         // the aisle you walk in on
  for (const c of colliders) {
    if (Math.hypot(x - c.x, z - c.z) < c.r + 1.6) return false;
  }
  return true;
}

for (let i = 0; i < 150; i++) {
  for (let tries = 0; tries < 30; tries++) {
    const x = (Math.random() - 0.5) * 2 * BOUNDS;
    const z = (Math.random() - 0.5) * 2 * BOUNDS;
    if (!forestFits(x, z)) continue;
    addTree(x, z);
    break;
  }
}
for (let i = 0; i < 12; i++) {
  for (let tries = 0; tries < 30; tries++) {
    const x = (Math.random() - 0.5) * 2 * BOUNDS;
    const z = (Math.random() - 0.5) * 2 * BOUNDS;
    if (!forestFits(x, z)) continue;
    const s = 0.7 + Math.random() * 1.1;
    const rock = mesh(new THREE.DodecahedronGeometry(1, 0), lambert(0x2e3238), x, 0.45 * s, z);
    rock.scale.set(s, s * 0.65, s);
    rock.rotation.y = Math.random() * Math.PI;
    scene.add(rock);
    colliders.push({ x, z, r: s * 1.0 });
    break;
  }
}

// ---------- Bonfire ----------
const flames = []; // all flickering flame cones (bonfire + torches)
let fireLight;
let anointLight;
{
  const g = new THREE.Group();
  // Stone ring
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const st = mesh(new THREE.DodecahedronGeometry(0.42, 0), lambert(0x3a3f47),
      Math.cos(a) * 2.4, 0.22, Math.sin(a) * 2.4);
    st.rotation.y = Math.random() * Math.PI;
    g.add(st);
  }
  // Log teepee
  const logGeo = new THREE.CylinderGeometry(0.17, 0.2, 3.6, 6);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const log = mesh(logGeo, lambert(0x241408), Math.cos(a) * 0.9, 1.35, Math.sin(a) * 0.9);
    log.rotation.z = Math.cos(a) * 0.55;
    log.rotation.x = -Math.sin(a) * 0.55;
    g.add(log);
  }
  // Flame stack — MeshBasic so bloom lights it up
  for (const [r, h, y, color, boost] of [
    [1.5, 4.4, 2.5, 0xff4a12, 2.2],
    [1.05, 3.5, 2.2, 0xff8c1a, 2.6],
    [0.6, 2.6, 1.9, 0xffd75e, 3.0],
  ]) {
    const mat = new THREE.MeshBasicMaterial({ color });
    mat.color.multiplyScalar(boost);
    const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat);
    f.position.y = y;
    flames.push(f);
    g.add(f);
  }
  // Glowing coal bed
  const coalMat = new THREE.MeshBasicMaterial({ color: 0xff6a20 });
  coalMat.color.multiplyScalar(1.8);
  const coals = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.35, 9), coalMat);
  coals.position.y = 0.18;
  g.add(coals);

  fireLight = new THREE.PointLight(0xff9440, 340, 0, 2);
  fireLight.position.set(0, 2.6, 0);
  g.add(fireLight);

  // Ceremony glow: swells over the prospect during the anointing
  anointLight = new THREE.PointLight(0xcfd8ff, 0, 0, 2);
  scene.add(anointLight);

  g.position.set(FIRE.x, 0, FIRE.z);
  scene.add(g);
  colliders.push({ x: FIRE.x, z: FIRE.z, r: 2.6 });
}

// ---------- Stage, banner, torches ----------
{
  const g = new THREE.Group();
  const wood = lambert(0x4a3018);
  const woodDark = lambert(0x33200e);
  // Deck
  g.add(mesh(new THREE.BoxGeometry(7.2, 0.5, 3.6), wood, 0, 0.85, 0));
  // Front skirt of vertical half-logs
  const skirtGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.1, 6);
  for (let i = 0; i < 12; i++) {
    g.add(mesh(skirtGeo, woodDark, -3.3 + i * 0.6, 0.55, -1.75));
  }
  // Back banner between two poles: Silver Sasquatches purple
  for (const sx of [-3.2, 3.2]) {
    g.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 6), woodDark, sx, 2.9, 1.55));
  }
  g.add(mesh(new THREE.BoxGeometry(6.4, 1.5, 0.08), lambert(0x7b4fd9), 0, 4.2, 1.55));
  g.add(mesh(new THREE.BoxGeometry(6.4, 0.14, 0.1), lambert(0xcfd4e0), 0, 4.98, 1.55));
  g.add(mesh(new THREE.BoxGeometry(6.4, 0.14, 0.1), lambert(0xcfd4e0), 0, 3.42, 1.55));

  // Torches flanking the stage front
  const torchFlameGeo = new THREE.ConeGeometry(0.28, 0.85, 6);
  for (const sx of [-4.4, 4.4]) {
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.11, 2.6, 6), woodDark, sx, 1.3, -1.6));
    const torchMat = new THREE.MeshBasicMaterial({ color: 0xffb02a });
    torchMat.color.multiplyScalar(2.6);
    const f = new THREE.Mesh(torchFlameGeo, torchMat);
    f.position.set(sx, 2.95, -1.6);
    flames.push(f);
    g.add(f);
    const tl = new THREE.PointLight(0xff9a4a, 30, 0, 2);
    tl.position.set(sx, 3.0, -1.6);
    g.add(tl);
  }

  g.position.set(STAGE.x, 0, STAGE.z);
  scene.add(g);
  colliders.push({ x: STAGE.x, z: STAGE.z, r: 4.2 });
}

// ---------- Particles: embers, smoke, fireflies ----------
function makeParticles({ count, color, size, blending, opacity, attenuate = true, boost = 1 }) {
  const positions = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color, size, map: dotTex, transparent: true, opacity,
    depthWrite: false, blending, sizeAttenuation: attenuate,
  });
  mat.color.multiplyScalar(boost);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return { geo, positions, points };
}

const EMBER_N = 90;
const embers = makeParticles({
  count: EMBER_N, color: 0xffa040, size: 0.42,
  blending: THREE.AdditiveBlending, opacity: 0.9, boost: 2.6,
});
const emberData = [];
function resetEmber(i, scatter = false) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.random() * 1.2;
  embers.positions[i * 3] = FIRE.x + Math.cos(a) * r;
  embers.positions[i * 3 + 1] = 0.6 + (scatter ? Math.random() * 5 : Math.random() * 1.5);
  embers.positions[i * 3 + 2] = FIRE.z + Math.sin(a) * r;
  emberData[i] = {
    vy: 1.6 + Math.random() * 2.4,
    vx: (Math.random() - 0.5) * 0.7,
    vz: (Math.random() - 0.5) * 0.7,
    life: 1.6 + Math.random() * 2.2,
    t: 0,
    phase: Math.random() * 10,
  };
}
for (let i = 0; i < EMBER_N; i++) resetEmber(i, true);

const SMOKE_N = 26;
const smoke = makeParticles({
  count: SMOKE_N, color: 0x565c66, size: 6.5,
  blending: THREE.NormalBlending, opacity: 0.16,
});
const smokeData = [];
function resetSmoke(i, scatter = false) {
  smoke.positions[i * 3] = FIRE.x + (Math.random() - 0.5) * 1.2;
  smoke.positions[i * 3 + 1] = 4 + (scatter ? Math.random() * 12 : Math.random() * 2);
  smoke.positions[i * 3 + 2] = FIRE.z + (Math.random() - 0.5) * 1.2;
  smokeData[i] = { vy: 1.1 + Math.random() * 0.9, life: 5 + Math.random() * 4, t: 0 };
}
for (let i = 0; i < SMOKE_N; i++) resetSmoke(i, true);

const FIREFLY_N = 36;
const fireflies = makeParticles({
  count: FIREFLY_N, color: 0x9fff6a, size: 0.32,
  blending: THREE.AdditiveBlending, opacity: 0.85, boost: 2.4,
});
const fireflyBase = [];
for (let i = 0; i < FIREFLY_N; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 24 + Math.random() * 46;
  fireflyBase.push({
    x: FIRE.x + Math.cos(a) * r,
    y: 0.8 + Math.random() * 1.8,
    z: FIRE.z + Math.sin(a) * r,
    phase: Math.random() * 20,
  });
}

// ---------- Characters ----------
// Floating name tag that always faces the camera
function makeNameplate(name, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = '900 52px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(18,13,36,.92)';
  ctx.strokeText(name, 256, 50);
  ctx.fillStyle = color;
  ctx.fillText(name, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, opacity: 0.92,
  }));
  spr.scale.set(2.6, 0.49, 1);
  spr.position.y = 3.05;
  return spr;
}

// `player` is reassigned once at the anointing so Tony can receive the
// Circle's colors while staying on the shared human rig.
let player = new Person(PROSPECT_PALETTE);
player.group.position.set(SPAWN.x, 0, SPAWN.z);
player.heading = 0; // facing +z, toward the fire
player.group.rotation.y = 0;
scene.add(player.group);

const debris = new DebrisSystem(scene);
const effects = new Effects(scene);

// Crowd of members in semicircles behind the prospect line, facing the stage
const members = [];
{
  const placements = [
    ...FEATURED.map((f) => ({ feat: f, angle: f.angle, r: f.r })),
    ...CROWD_ROW2.map((a) => ({ feat: null, angle: a, r: 8.3 })),
  ];
  for (const { feat, angle, r } of placements) {
    const sq = new Person(feat ? {
      shirt: feat.shirt,
      face: feat.face,
    } : {
      shirt: MEMBER_SHIRTS[members.length % MEMBER_SHIRTS.length],
      skin: MEMBER_SKINS[Math.floor(Math.random() * MEMBER_SKINS.length)],
      hair: MEMBER_HAIR[Math.floor(Math.random() * MEMBER_HAIR.length)],
    });
    const scale = 0.94 + Math.random() * 0.16;
    sq.group.scale.setScalar(scale);
    const a = THREE.MathUtils.degToRad(angle);
    const x = LINE_CENTER.x + Math.sin(a) * r;
    const z = LINE_CENTER.z + Math.cos(a) * r;
    sq.group.position.set(x, 0, z);
    sq.heading = Math.atan2(STAGE.x - x, STAGE.z - z);
    sq.group.rotation.y = sq.heading;
    sq.walkT = Math.random() * 10;
    sq.breatheT = Math.random() * 10;
    if (feat) sq.group.add(makeNameplate(feat.name, '#cfd4e0'));
    scene.add(sq.group);
    members.push({
      sq, scale,
      name: feat ? feat.name : null,
      home: { x, z },
      slot: null,       // gauntlet ring position when converging
      inCircle: false,
      knock: null,      // set when the prospect (illegally) decks them
      poseT: 0,         // arms-raised celebration timer
    });
  }
}

// ---------- The prospect line ----------
const PROSPECT_LOOKS = [
  { shirt: 0xb0533a, shirtDark: 0x8a3f2c, pants: 0x3a3f47, skin: 0xc98d5f, bandana: null, hair: 0x11100c },
  { shirt: 0x4a7a72, shirtDark: 0x38605a, pants: 0x2e3238, skin: 0xf0d0b0, bandana: null, hair: 0x4a331c },
  { shirt: 0x8a7a4a, shirtDark: 0x6a5c36, pants: 0x33383f, skin: 0x8d5a3b, bandana: null, hair: 0x1e1c22 },
  { shirt: 0x6a5a7a, shirtDark: 0x504460, pants: 0x2a2e35, skin: 0xe8b88a, bandana: null, hair: 0x6e6659 },
];
// Prospect One is first in line (and first to answer). You are Prospect Two.
const PROSPECT_NAMES = ['PROSPECT ONE', 'PROSPECT THREE', 'PROSPECT FOUR', 'PROSPECT FIVE'];
const prospects = [];
for (let i = 0; i < PROSPECT_XS.length; i++) {
  const sq = new Person(PROSPECT_LOOKS[i]);
  const x = PROSPECT_XS[i];
  sq.group.position.set(x, 0, LINE_Z);
  sq.heading = Math.atan2(STAGE.x - x, STAGE.z - LINE_Z);
  sq.group.rotation.y = sq.heading;
  sq.walkT = Math.random() * 10;
  sq.breatheT = Math.random() * 10;
  const plate = makeNameplate(PROSPECT_NAMES[i], '#8a92ab');
  plate.scale.set(1.9, 0.36, 1);
  plate.position.y = 2.85;
  sq.group.add(plate);
  scene.add(sq.group);
  prospects.push({
    sq,
    home: { x, z: LINE_Z },
    stepTo: null,   // walk target (step forward / clear the line)
    dead: false,
    fallT: -1,      // >=0 while collapsing
    jerkT: 0,       // bullet-impact twitch
  });
}

// Your glowing slot in the line
const spotMark = new THREE.Group();
{
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x9a6ff0, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
  });
  ringMat.color.multiplyScalar(2.2);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.1, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  spotMark.add(ring);
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x9a6ff0, transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  spotMark.add(disc);
  spotMark.position.set(PLAYER_SLOT.x, 0, PLAYER_SLOT.z);
  scene.add(spotMark);
}

// Big Uncle Lou Sputthole, up on the stage beside Booskibro
const louStage = new Person({
  shirt: 0x6f7fa8, shirtDark: 0x56637f, pants: 0x2e3e55,
  bandana: 0xd92e2e, face: 'assets/faces/lou.png',
});
louStage.group.scale.setScalar(1.12);
louStage.group.position.set(STAGE.x - 1.8, 1.1, STAGE.z);
louStage.heading = Math.PI;
louStage.group.rotation.y = Math.PI;
louStage.group.add(makeNameplate('BIG UNCLE LOU SPUTTHOLE', '#ff8a8a'));
scene.add(louStage.group);

// Booskibro on stage: the founder, draped in an old silver pelt he claims
// grew on him once, staff in hand
const boosk = new Person(BOOSKI_PALETTE);
boosk.group.scale.setScalar(1.22);
boosk.group.position.set(STAGE.x + 1.2, 1.1, STAGE.z);
boosk.heading = Math.PI; // facing -z, out over the crowd
boosk.group.rotation.y = Math.PI;
{
  // The pelt mantle: shaggy fur across the shoulders and down the back
  const fur = lambert(0x6e747f);
  const furLight = lambert(0xc3c8d4);
  const mantle = mesh(new THREE.BoxGeometry(1.15, 0.26, 0.56), fur, 0, 2.18, -0.04);
  boosk.body.add(mantle);
  const cape = mesh(new THREE.BoxGeometry(0.95, 1.15, 0.14), fur, 0, 1.62, -0.3);
  boosk.body.add(cape);
  for (const [x, y, s] of [[-0.45, 2.3, 0.2], [0.45, 2.3, 0.2], [0, 2.34, 0.24]]) {
    const tuft = mesh(new THREE.BoxGeometry(s, s * 1.3, s), furLight, x, y, -0.05);
    tuft.rotation.z = (Math.random() - 0.5) * 0.5;
    boosk.body.add(tuft);
  }
  const staff = new THREE.Group();
  staff.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.3, 6), lambert(0x33200e), 0, 0, 0));
  const knob = mesh(new THREE.DodecahedronGeometry(0.16, 0), lambert(0xcfd4e0), 0, 1.22, 0);
  staff.add(knob);
  staff.position.set(0, -0.9, 0.25);
  boosk.armR.add(staff);
  boosk.group.add(makeNameplate('BOOSKIBRO', '#b9a0f5'));
}
scene.add(boosk.group);

// ---------- The executioner's pistol ----------
// Built once, hung on whichever member is doing Circle justice. The arm
// pivot points its local -y forward when raised, so the gun hangs below
// the hand along -y with the muzzle past the fist.
const gun = new THREE.Group();
let gunMuzzle;
{
  const dark = lambert(0x22242a);
  gun.add(mesh(new THREE.BoxGeometry(0.055, 0.42, 0.065), dark, 0, -1.14, 0));
  gun.add(mesh(new THREE.BoxGeometry(0.05, 0.14, 0.16), dark, 0, -0.97, 0.07));
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd75e, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  flashMat.color.multiplyScalar(3);
  gunMuzzle = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 6), flashMat);
  gunMuzzle.rotation.x = Math.PI;
  gunMuzzle.position.y = -1.5;
  gunMuzzle.visible = false;
  gun.add(gunMuzzle);
}
const muzzleLight = new THREE.PointLight(0xffc86a, 0, 0, 2);
scene.add(muzzleLight);

// The great deadfall log for the Timber trial (spawned later)
let greatLog = null;
function spawnGreatLog() {
  const g = new THREE.Group();
  const bark = lambert(0x3c2812);
  const barkDark = lambert(0x2a1a0a);
  // Two X-stands
  for (const sx of [-2.1, 2.1]) {
    for (const tilt of [-0.5, 0.5]) {
      const leg = mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.8, 6), barkDark, sx, 0.7, 0);
      leg.rotation.x = tilt;
      g.add(leg);
    }
  }
  // The log itself, with pale cut faces at each end
  const trunk = mesh(new THREE.CylinderGeometry(0.55, 0.62, 5.6, 9), bark, 0, 1.45, 0);
  trunk.rotation.z = Math.PI / 2;
  g.add(trunk);
  for (const sx of [-2.82, 2.82]) {
    const cap = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 9), lambert(0x8a6a42), sx, 1.45, 0);
    cap.rotation.z = Math.PI / 2;
    g.add(cap);
  }
  // Placed in the aisle behind the prospect — well away from the crowd
  const x = 0;
  const z = -19.5;
  g.position.set(x, 0, z);
  g.rotation.y = 0.4;
  scene.add(g);
  const collider = { x, z, r: 2.4 };
  colliders.push(collider);
  greatLog = { group: g, x, z, r: 2.9, hp: 3, wobble: 0, collider };
}

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const hudEl = $('hud');
const objectiveEl = $('objective');
const hpWrapEl = $('hpWrap');
const hpFillEl = $('hpFill');
const bannerEl = $('banner');
const painFlashEl = $('painFlash');
const fadeEl = $('fade');
const dialogEl = $('dialog');
const speakerEl = $('speaker');
const lineEl = $('line');
const muteBtn = $('muteBtn');

function setObjective(html) {
  objectiveEl.innerHTML = html;
}

function showBanner(text) {
  bannerEl.textContent = text;
  bannerEl.classList.remove('show');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('show');
}

let hp = MAX_HP;
function updateHp() {
  hpFillEl.style.width = `${(hp / MAX_HP) * 100}%`;
}

// Floating popups (same trick as the main game)
const _proj = new THREE.Vector3();
function popText(worldPos, text, cls = '') {
  _proj.copy(worldPos);
  _proj.y += 2.3;
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

// ---------- Dialog ----------
let sayQueue = [];
let sayDone = null;
let sayAutoT = 0;
const dialogActive = () => sayQueue.length > 0;

function showCurrentLine() {
  const { who, text, gesture, cue } = sayQueue[0];
  speakerEl.textContent = who;
  lineEl.textContent = text;
  const voiced = sfx.voice(cue);
  sayAutoT = Math.max(3.2 + text.length * 0.03, voiced > 0 ? voiced + 0.35 : 0);
  if (gesture === 'slam') {
    (who === 'BIG UNCLE LOU SPUTTHOLE' ? louStage : boosk).startSmash();
    sfx.stomp();
    shake = Math.max(shake, 0.25);
  }
}

function say(lines, done = null) {
  sayQueue = lines.slice();
  sayDone = done;
  dialogEl.classList.add('show');
  showCurrentLine();
}

function advanceSay() {
  if (!dialogActive()) return;
  sayQueue.shift();
  if (sayQueue.length === 0) {
    sfx.stopVoice();
    dialogEl.classList.remove('show');
    const done = sayDone;
    sayDone = null;
    if (done) done();
  } else {
    showCurrentLine();
  }
}

// ---------- Game state ----------
let phase = 'approach';
// approach → line_up → speech → q1 → execution → q2_intro → q2_choice
//   → (wrong: exec_player → failed, retry to q2_choice)
//   → clear_line → gauntlet_in → beatdown → endured → trial_roar
//   → roar_anim → trial_log → anoint_walk → anoint_lines
//   → anoint_induction → complete   (+ fail_swing → failed, retryable)
// No title screen — the apartment scene drops you straight into the pines.
let shake = 0;
let fovPunch = 0;
let painT = 0;
let punchTimer = 0;
let phaseT = 0;         // seconds since the current phase began
let failT = -1;         // countdown from illegal swing to the fail screen
let failFrom = 'beatdown';
let roarPoseT = 0;      // player arms-up roar pose
let surgeT = 0;         // bonfire flare-up
let inductionK = 0;     // 0..1 anointing progress
let inducted = false;   // member clothes and red bandana awarded
let crackleT = 0;
let playerFallT = -1;   // >=0 while the player collapses (shot dead)
let exec = null;        // the execution in progress, see startExecution
const respondQueue = []; // pending member roar timestamps

function setPhase(next) {
  phase = next;
  phaseT = 0;
}

const canMove = () => phase === 'approach' || phase === 'line_up' || phase === 'trial_log';

// ---------- Input ----------
const keys = new Set();
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
};

function smashAction() {
  if (dialogActive()) { advanceSay(); return; }
  if (phase === 'approach' || phase === 'line_up' || phase === 'trial_log') {
    player.startSmash();
  } else if (phase === 'gauntlet_in' || phase === 'beatdown') {
    // Swinging back at the Circle: instant fail
    failFrom = 'beatdown';
    setPhase('fail_swing');
    player.startSmash();
  }
}

function roarAction() {
  if (dialogActive()) return;
  if (phase === 'trial_roar') doRoar();
}

window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
  if (e.code === 'Space') { e.preventDefault(); smashAction(); }
  if (e.code === 'KeyR') roarAction();
  if (e.code === 'KeyM') toggleMute();
  if (phase === 'q2_choice' && /^Digit[123]$/.test(e.code)) {
    chooseAnswer(Number(e.code.slice(-1)) - 1);
  }
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]);
});
window.addEventListener('mousedown', (e) => {
  if (e.target.closest('button, a, .touch-btn')) return;
  if (e.button === 0) smashAction();
});
window.addEventListener('blur', () => keys.clear());

muteBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });
function toggleMute() {
  sfx.setMuted(!sfx.isMuted());
  muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊';
}

// Touch controls (joystick + SMASH + ROAR)
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

  $('smashBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); smashAction(); });
  $('roarBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); roarAction(); });
}

function isSprinting() {
  return keys.has('sprint') || (touch.active && Math.hypot(touch.x, touch.y) > 0.92);
}

// ---------- Buttons / flow ----------
$('retryBtn').addEventListener('click', retry);
$('replayBtn').addEventListener('click', () => location.reload());
$('goHomeBtn').addEventListener('click', () => {
  /* The temporary G1 exit, through the campaign's own transition so the save
   * goes home with him. If the write is refused the save-failure banner is
   * already up — still let him leave rather than trapping him on the card. */
  try {
    navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door' });
  } catch (error) {
    console.error('[initiation] campaign exit could not be saved', error);
    location.assign('./index.html');
  }
});

// Browsers only allow audio after a real input on this page, so the drums
// kick in on the first keypress or click after arriving from the apartment.
function ensureAudio() {
  sfx.init();
  sfx.startDrums(); // the ceremony is already underway, somewhere ahead
}
window.addEventListener('keydown', ensureAudio, { once: true });
window.addEventListener('pointerdown', ensureAudio, { once: true });

hudEl.classList.add('visible');
setObjective('Follow the firelight — <span class="key">WASD</span> move · <span class="key">Shift</span> run');
setTimeout(() => { fadeEl.style.opacity = 0; }, 120);

// ---------- The founders quiz ----------
const quizEl = $('quiz');
function showQuiz() {
  const opts = [...QUIZ_OPTIONS].sort(() => Math.random() - 0.5);
  quizEl.querySelectorAll('.quiz-opt').forEach((btn, i) => {
    btn.innerHTML = `<span class="num">${i + 1}.</span>`;
    btn.appendChild(document.createTextNode(opts[i].text));
    btn.dataset.correct = opts[i].correct ? '1' : '0';
    btn.dataset.cue = opts[i].cue;
  });
  quizEl.classList.add('show');
}

function hideQuiz() {
  quizEl.classList.remove('show');
}

function chooseAnswer(i) {
  if (phase !== 'q2_choice') return;
  const btn = quizEl.querySelectorAll('.quiz-opt')[i];
  if (!btn) return;
  hideQuiz();
  setPhase('q2_result');
  const selected = QUIZ_OPTIONS.find((option) => option.cue === btn.dataset.cue);
  if (!selected) return;
  say([selected], () => {
    if (selected.correct) {
      say(CORRECT_LINES, () => {
      respondQueue.push(0.2, 0.6);
      // The surviving prospects clear out to the crowd's edge
      for (let i2 = 1; i2 < prospects.length; i2++) {
        const p = prospects[i2];
        p.stepTo = { x: p.home.x * 1.8 + 2, z: -14.5 };
      }
      setPhase('clear_line');
      });
    } else {
      say(WRONG_LINES, () => {
      setPhase('exec_player');
      startExecution({
        getPos: () => player.position,
        y: 1.5,
        onHit: () => { painT = 1; shake = Math.max(shake, 0.4); },
        onDead: () => {
          playerFallT = 0;
          failFrom = 'question';
          $('failReason').innerHTML =
            'Wrong founders.<br>The Circle now knows two things about you: your name, and where you’re buried.';
        },
        onFinished: () => {
          $('fail').classList.remove('hidden');
          setPhase('failed');
        },
      });
      });
    }
  });
}

quizEl.querySelectorAll('.quiz-opt').forEach((btn) => {
  btn.addEventListener('click', () => chooseAnswer(Number(btn.dataset.i)));
});

// ---------- Executions ----------
// One member walks out, draws the pistol, and puts eight rounds into the
// target. target: { getPos(), y, onHit(), onDead(), onFinished() }.
function startExecution(target) {
  const tp = target.getPos();
  let m0 = null;
  let bd = Infinity;
  for (const m of members) {
    if (m.knock) continue;
    const d = Math.hypot(m.sq.position.x - tp.x, m.sq.position.z - tp.z);
    if (d < bd) { bd = d; m0 = m; }
  }
  exec = { m: m0, target, state: 'walk', t: 0, shots: 0, next: 0, aim: 0, flashT: 0 };
}

function fireShotAt(tp, y) {
  sfx.gunshot();
  gunMuzzle.visible = true;
  exec.flashT = 0.07;
  gunMuzzle.getWorldPosition(_impact);
  muzzleLight.position.copy(_impact);
  muzzleLight.intensity = 130;
  debris.puff(new THREE.Vector3(
    tp.x + (Math.random() - 0.5) * 0.35, y, tp.z + (Math.random() - 0.5) * 0.35
  ), 0x8a1414, 5);
  shake = Math.max(shake, 0.28);
}

function updateExecution(dt) {
  if (!exec) return;
  const m = exec.m;
  const t = exec.target;
  const tp = t.getPos();
  exec.flashT = Math.max(0, exec.flashT - dt);
  gunMuzzle.visible = exec.flashT > 0;

  if (exec.state === 'walk') {
    _dir.set(tp.x - m.sq.position.x, 0, tp.z - m.sq.position.z);
    const d = _dir.length();
    if (d > 2.2) {
      _dir.normalize();
      m.sq.update(dt, _dir, 3.6);
    } else {
      exec.state = 'aim';
      exec.t = 0;
      m.sq.armR.add(gun);
    }
  } else if (exec.state === 'aim' || exec.state === 'fire') {
    faceToward(m.sq, tp.x, tp.z, dt, 14);
    m.sq.update(dt, _zero, 0);
    exec.aim = Math.min(1, exec.aim + dt * 3);
    exec.t += dt;
    if (exec.state === 'aim' && exec.t > 0.8) {
      exec.state = 'fire';
      exec.next = 0.3;
    }
    if (exec.state === 'fire') {
      exec.next -= dt;
      if (exec.next <= 0 && exec.shots < 8) {
        exec.shots++;
        exec.next = 0.26 + Math.random() * 0.12;
        exec.recoil = 0.12;
        fireShotAt(tp, t.y);
        if (t.onHit) t.onHit();
        if (exec.shots >= 8) {
          exec.state = 'done';
          exec.t = 0;
          if (t.onDead) t.onDead();
        }
      }
    }
    exec.recoil = Math.max(0, (exec.recoil || 0) - dt * 1.2);
    m.sq.armR.rotation.x = 1.58 * exec.aim + exec.recoil * 1.6;
  } else if (exec.state === 'done') {
    m.sq.update(dt, _zero, 0);
    exec.aim = Math.max(0, exec.aim - dt * 2);
    m.sq.armR.rotation.x = 1.58 * exec.aim;
    exec.t += dt;
    if (exec.t > 1.1) {
      m.sq.armR.remove(gun);
      m.sq.armR.rotation.x = 0;
      exec.state = 'return';
      if (t.onFinished) t.onFinished();
    }
  } else if (exec.state === 'return') {
    if (walkNpc(m.sq, m.home.x, m.home.z, dt, 3.2)) {
      faceToward(m.sq, STAGE.x, STAGE.z, dt, 8);
      exec = null;
    }
  }
}

function startGauntlet(afterRetry = false) {
  hpWrapEl.classList.add('show');
  setObjective('ENDURE — do <span class="key">NOT</span> fight back');
  const start = () => {
    showBanner('THE GAUNTLET');
    // The eight nearest members close the circle around the prospect
    const sorted = [...members]
      .filter((m) => !m.knock)
      .sort((a, b) =>
        Math.hypot(a.sq.position.x - player.position.x, a.sq.position.z - player.position.z) -
        Math.hypot(b.sq.position.x - player.position.x, b.sq.position.z - player.position.z));
    members.forEach((m) => { m.inCircle = false; m.slot = null; });
    sorted.slice(0, 8).forEach((m, i) => {
      m.inCircle = true;
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.2;
      m.slot = {
        x: player.position.x + Math.sin(a) * CIRCLE_R,
        z: player.position.z + Math.cos(a) * CIRCLE_R,
      };
    });
    punchTimer = 1.1;
    setPhase('gauntlet_in');
  };
  if (afterRetry) say(RETRY_LINE, start);
  else start();
}

function retry() {
  $('fail').classList.add('hidden');
  hp = MAX_HP;
  updateHp();
  painT = 0;
  failT = -1;
  // Holster everything and stand everyone back up
  if (exec) {
    exec.m.sq.armR.remove(gun);
    exec.m.sq.armR.rotation.x = 0;
    exec = null;
  }
  gunMuzzle.visible = false;
  muzzleLight.intensity = 0;
  playerFallT = -1;
  player.group.rotation.x = 0;
  // Everyone back on their feet, back in the crowd
  for (const m of members) {
    m.knock = null;
    m.inCircle = false;
    m.slot = null;
    m.sq.group.rotation.x = 0;
    m.sq.group.position.set(m.home.x, 0, m.home.z);
    m.sq.heading = Math.atan2(player.position.x - m.home.x, player.position.z - m.home.z);
    m.sq.group.rotation.y = m.sq.heading;
  }
  if (failFrom === 'question') {
    // The Circle, inexplicably, lets you have another go at it
    setPhase('q2_choice');
    showQuiz();
  } else if (failFrom === 'trial_log') {
    setObjective('SMASH the great log! <span class="key">(Space / Click)</span>');
    setPhase('trial_log');
  } else {
    startGauntlet(true);
  }
}

function endureComplete() {
  setPhase('endured');
  showBanner('YOU ENDURED');
  setObjective('');
  // The circle backs off (they drift home in the member update)
  for (const m of members) {
    if (m.inCircle) { m.inCircle = false; m.slot = null; }
  }
}

function doRoar() {
  setPhase('roar_anim');
  setObjective('');
  roarPoseT = 1.5;
  surgeT = 2.4;
  sfx.roar();
  effects.shockwave(player.position, 11, 0xff9a3a);
  shake = Math.max(shake, 0.5);
  fovPunch = Math.min(12, fovPunch + 8);
  // The Circle answers, one wave after another
  respondQueue.push(0.7, 1.05, 1.4);
}

function triggerFailImpact(victim) {
  // The prospect's fist actually lands on a member
  victim.knock = {
    t: 0,
    dir: new THREE.Vector3(
      victim.sq.position.x - player.position.x, 0,
      victim.sq.position.z - player.position.z
    ).normalize(),
  };
  sfx.smash(true);
  shake = Math.max(shake, 0.6);
  debris.puff(new THREE.Vector3(victim.sq.position.x, 1.2, victim.sq.position.z), MEMBER_SHIRTS[0], 8);
  popText(victim.sq.position, victim.name ? `YOU STRUCK ${victim.name}!` : 'YOU STRUCK A BROTHER!', 'pain');
  const who = victim.name ? `You struck ${victim.name}.` : 'You struck a member of the Circle.';
  $('failReason').innerHTML = failFrom === 'trial_log'
    ? `The log was the target — not your kin. ${who}<br>Silver endures. Silver does not swing at its own.`
    : `${who}<br>Silver endures. Silver does not swing at its own.`;
  failT = 1.5;
}

// Prospect One's turn ends the way Prospect One's turns end
function executeProspect(p, onFinished) {
  startExecution({
    getPos: () => p.sq.position,
    y: 1.5,
    onHit: () => { p.jerkT = 0.16; },
    onDead: () => {
      p.dead = true;
      p.fallT = 0;
      effects.bloodSplat(p.sq.position);
      popText(p.sq.position, 'EXECUTED', 'pain');
    },
    onFinished,
  });
}

function nearestMember(maxDist) {
  let best = null;
  let bd = maxDist;
  for (const m of members) {
    if (m.knock) continue;
    const d = Math.hypot(m.sq.position.x - player.position.x, m.sq.position.z - player.position.z);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

// ---------- Player smash resolution ----------
const _impact = new THREE.Vector3();

function resolvePlayerImpact() {
  player.facing(_impact).multiplyScalar(1.8).add(player.position);

  if (phase === 'fail_swing') {
    const victim = nearestMember(5.5);
    if (victim) triggerFailImpact(victim);
    else failT = 1.0; // swung at shadows; the Circle still saw it
    return;
  }

  if (phase === 'trial_log') {
    // Swinging near a member fails the initiation even here
    const bystander = nearestMember(3.0);
    if (bystander) {
      failFrom = 'trial_log';
      setPhase('fail_swing');
      triggerFailImpact(bystander);
      return;
    }
    if (greatLog && Math.hypot(_impact.x - greatLog.x, _impact.z - greatLog.z) < greatLog.r + 1.8) {
      greatLog.hp--;
      shake = Math.max(shake, 0.4);
      if (greatLog.hp <= 0) {
        const center = new THREE.Vector3(greatLog.x, 1.4, greatLog.z);
        debris.explodeGroup(greatLog.group, center, player.facing(new THREE.Vector3()).clone());
        scene.remove(greatLog.group);
        effects.scorch(center, 2.2);
        colliders.splice(colliders.indexOf(greatLog.collider), 1);
        greatLog = null;
        sfx.smash(true);
        showBanner('TIMBER!');
        fovPunch = Math.min(12, fovPunch + 6);
        setObjective('');
        setPhase('log_broken');
      } else {
        greatLog.wobble = 0.5;
        debris.puff(new THREE.Vector3(greatLog.x, 1.4, greatLog.z), 0x3c2812, 6);
        sfx.crack();
        popText(greatLog.group.position, greatLog.hp === 2 ? 'CRACK!' : 'SPLINTERING!', 'big');
      }
      return;
    }
    // Thumping a tree: the forest forgives, barely
    for (const c of colliders) {
      if (Math.hypot(_impact.x - c.x, _impact.z - c.z) < c.r + 1.6) {
        debris.puff(_impact, 0x1c3322, 4);
        sfx.crack();
        shake = Math.max(shake, 0.2);
        return;
      }
    }
    sfx.whiff();
    return;
  }

  // approach: shadow-boxing through the woods
  for (const c of colliders) {
    if (Math.hypot(_impact.x - c.x, _impact.z - c.z) < c.r + 1.6) {
      debris.puff(_impact, 0x1c3322, 4);
      sfx.crack();
      shake = Math.max(shake, 0.2);
      return;
    }
  }
  sfx.whiff();
}

// ---------- Movement ----------
const _moveVec = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _zero = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

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
  _right.crossVectors(_fwd, UP);
  _moveVec.addScaledVector(_fwd, f).addScaledVector(_right, r);
  if (_moveVec.lengthSq() > 1) _moveVec.normalize();
  return _moveVec;
}

function collide() {
  const p = player.position;
  const pushOut = (x, z, r) => {
    const dx = p.x - x;
    const dz = p.z - z;
    const dist = Math.hypot(dx, dz);
    const minD = r + 0.55;
    if (dist < minD && dist > 0.001) {
      const push = (minD - dist) / dist;
      p.x += dx * push;
      p.z += dz * push;
    }
  };
  for (const c of colliders) pushOut(c.x, c.z, c.r);
  for (const m of members) {
    if (!m.knock) pushOut(m.sq.position.x, m.sq.position.z, 0.6 * m.scale);
  }
  for (const p of prospects) {
    if (!p.dead) pushOut(p.sq.position.x, p.sq.position.z, 0.55);
  }
  pushOut(boosk.group.position.x, boosk.group.position.z, 0.8);
  p.x = THREE.MathUtils.clamp(p.x, -BOUNDS, BOUNDS);
  p.z = THREE.MathUtils.clamp(p.z, -BOUNDS, BOUNDS);
}

// ---------- NPC helpers ----------
function faceToward(sq, x, z, dt, rate = 10) {
  const target = Math.atan2(x - sq.position.x, z - sq.position.z);
  const diff = Math.atan2(Math.sin(target - sq.heading), Math.cos(target - sq.heading));
  sq.heading += diff * Math.min(1, rate * dt);
  sq.group.rotation.y = sq.heading;
}

// Walk an NPC toward (x, z); returns true once arrived
function walkNpc(sq, x, z, dt, speed = 3.4, arriveDist = 0.35) {
  const dx = x - sq.position.x;
  const dz = z - sq.position.z;
  const d = Math.hypot(dx, dz);
  if (d < arriveDist) {
    sq.update(dt, _zero, 0);
    return true;
  }
  _dir.set(dx / d, 0, dz / d);
  sq.update(dt, _dir, Math.min(speed, d * 4));
  return false;
}

// ---------- Camera ----------
let camYaw = 0;
let orbitA = 0;
const _camTarget = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _lookTarget = new THREE.Vector3(FIRE.x, 3, FIRE.z);
const _desiredLook = new THREE.Vector3();
const _facing = new THREE.Vector3();

camera.position.set(7, 4.5, SPAWN.z - 12);
camera.lookAt(FIRE.x, 3, FIRE.z);

function updateCamera(dt) {
  let desiredPos = null;

  if (phase === 'approach' || phase === 'line_up' || phase === 'trial_log' || phase === 'log_broken') {
    // Behind-the-shoulder follow, pulled in for a human frame
    const diff = Math.atan2(Math.sin(player.heading - camYaw), Math.cos(player.heading - camYaw));
    camYaw += diff * Math.min(1, 3.2 * dt);
    _camForward.set(Math.sin(camYaw), 0, Math.cos(camYaw));
    desiredPos = _camTarget.copy(player.position).addScaledVector(_camForward, -9);
    desiredPos.y += 5.2;
    _desiredLook.copy(player.position).addScaledVector(_camForward, 3);
    _desiredLook.y += 1.8;
  } else if (phase === 'speech') {
    // Wide shot from behind the line: prospects, fire, and the stage beyond
    const k = Math.min(1, phaseT / 18);
    desiredPos = _camTarget.set(-8.5 + k * 2, 3.9 - k * 0.8, -14 + k * 2.5);
    _desiredLook.set(0, 2.5, 5);
  } else if (phase === 'q1' || phase === 'execution') {
    // Side shot on Prospect One's big moment
    const p1 = prospects[0].sq.position;
    desiredPos = _camTarget.set(p1.x - 5.5, 2.1, p1.z + 4.2);
    _desiredLook.set(p1.x + 0.5, 1.3, p1.z);
  } else if (phase === 'q2_intro' || phase === 'q2_choice' || phase === 'q2_result' || phase === 'exec_player') {
    // Frontal on you: the fire behind the camera, the question in your face
    player.facing(_facing);
    desiredPos = _camTarget.copy(player.position).addScaledVector(_facing, 5.5).add(_camForward.set(1.4, 0, 0));
    desiredPos.y = 2.1;
    _desiredLook.copy(player.position);
    _desiredLook.y += 1.4;
  } else if (phase === 'gauntlet_in' || phase === 'beatdown' || phase === 'fail_swing' || phase === 'failed' || phase === 'clear_line') {
    // Slow orbit around the ring
    orbitA += dt * 0.28;
    desiredPos = _camTarget.set(
      player.position.x + Math.cos(orbitA) * 8,
      3.8,
      player.position.z + Math.sin(orbitA) * 8
    );
    _desiredLook.copy(player.position);
    _desiredLook.y += 1.3;
  } else if (phase === 'endured' || phase === 'trial_roar' || phase === 'roar_anim') {
    // Hero shot from the front
    player.facing(_facing);
    desiredPos = _camTarget.copy(player.position).addScaledVector(_facing, 8).add(_camForward.set(2.2, 0, 0));
    desiredPos.y = 2.8;
    _desiredLook.copy(player.position);
    _desiredLook.y += 2;
  } else if (phase === 'anoint_walk' || phase === 'anoint_lines' || phase === 'anoint_induction') {
    // Two-shot: prospect and Booskibro side-on
    const mx = (player.position.x + boosk.group.position.x) / 2;
    const mz = (player.position.z + boosk.group.position.z) / 2;
    _dir.set(boosk.group.position.x - player.position.x, 0, boosk.group.position.z - player.position.z).normalize();
    desiredPos = _camTarget.set(mx - _dir.z * 7.5, 2.9, mz + _dir.x * 7.5);
    _desiredLook.set(mx, 1.9, mz);
  } else { // complete
    orbitA += dt * 0.15;
    desiredPos = _camTarget.set(
      player.position.x + Math.cos(orbitA) * 8,
      3.5,
      player.position.z + Math.sin(orbitA) * 8
    );
    _desiredLook.copy(player.position);
    _desiredLook.y += 2.5;
  }

  const k = 1 - Math.exp(-3.2 * dt);
  camera.position.lerp(desiredPos, k);
  _lookTarget.lerp(_desiredLook, k);

  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.4);
    camera.position.x += (Math.random() - 0.5) * shake * 0.8;
    camera.position.y += (Math.random() - 0.5) * shake * 0.8;
    camera.position.z += (Math.random() - 0.5) * shake * 0.8;
  }
  camera.lookAt(_lookTarget);

  fovPunch = Math.max(0, fovPunch - dt * 14);
  const targetFov = BASE_FOV + fovPunch;
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 8 * dt);
    camera.updateProjectionMatrix();
  }

  // Moonlight shadows track the player
  moonLight.position.copy(player.position).add(_moonOffset);
  moonLight.target.position.copy(player.position);
}

// ---------- Phase logic ----------
function updatePhase(dt) {
  phaseT += dt;

  if (phase === 'approach') {
    const d = Math.hypot(player.position.x - FIRE.x, player.position.z - FIRE.z);
    if (d < ARRIVE_R) {
      setObjective('Take your place in the line — stand in the <span class="key">light</span>');
      setPhase('line_up');
    }
  } else if (phase === 'line_up') {
    const d = Math.hypot(player.position.x - PLAYER_SLOT.x, player.position.z - PLAYER_SLOT.z);
    if (d < 1.05) {
      setObjective('');
      spotMark.visible = false;
      player.group.position.set(PLAYER_SLOT.x, 0, PLAYER_SLOT.z);
      player.heading = Math.atan2(STAGE.x - PLAYER_SLOT.x, STAGE.z - PLAYER_SLOT.z);
      player.group.rotation.y = player.heading;
      setPhase('speech');
      say(SPEECH, () => {
        setPhase('q1');
        prospects[0].stepTo = { x: prospects[0].home.x, z: LINE_Z + 1.7 };
        say(Q1_LINES, () => {
          setPhase('execution');
          executeProspect(prospects[0], () => {
            setPhase('q2_intro');
            say(Q2_LINES, () => {
              setPhase('q2_choice');
              showQuiz();
            });
          });
        });
      });
    }
  } else if (phase === 'clear_line') {
    if (phaseT > 2.2) startGauntlet(false);
  } else if (phase === 'gauntlet_in') {
    let allSet = true;
    for (const m of members) {
      if (!m.inCircle) continue;
      if (!walkNpc(m.sq, m.slot.x, m.slot.z, dt, 3.6, 0.45)) allSet = false;
      else faceToward(m.sq, player.position.x, player.position.z, dt);
    }
    if (allSet || phaseT > 7) {
      setPhase('beatdown');
      punchTimer = 0.6;
    }
  } else if (phase === 'beatdown') {
    // Members trade punches; the prospect just has to stand there and take it
    punchTimer -= dt;
    if (punchTimer <= 0 && hp > STOP_HP) {
      const ring = members.filter((m) => m.inCircle && !m.sq.smashing);
      if (ring.length) {
        const m = ring[Math.floor(Math.random() * ring.length)];
        m.sq.startSmash();
      }
      punchTimer = 0.3 + Math.random() * 0.45;
    }
  } else if (phase === 'endured') {
    if (phaseT > 2.4 && !dialogActive()) {
      say(ENDURED_LINES, () => {
        setObjective('Press <span class="key">R</span> — ROAR into the night');
        setPhase('trial_roar');
      });
    }
  } else if (phase === 'roar_anim') {
    if (phaseT > 2.6 && !dialogActive()) {
      showBanner('THE FOREST HEARS YOU');
      say(ROAR_LINES, () => {
        spawnGreatLog();
        setObjective('SMASH the great log! <span class="key">(Space / Click)</span>');
        setPhase('trial_log');
      });
    }
  } else if (phase === 'log_broken') {
    if (phaseT > 1.4) setPhase('anoint_walk');
  } else if (phase === 'anoint_walk') {
    // Booskibro comes down off the stage to the prospect
    const b = boosk.group.position;
    b.y = Math.max(0, b.y - dt * 1.6);
    const arrived = walkNpc(boosk, player.position.x, player.position.z, dt, 4.4, 2.4);
    faceToward(player, b.x, b.z, dt);
    if (arrived && b.y <= 0.01) {
      faceToward(boosk, player.position.x, player.position.z, dt, 100);
      setPhase('anoint_lines');
      say(ANOINT_LINES, () => {
        setPhase('anoint_induction');
        sfx.sting();
        sfx.roar();
        surgeT = 2.6;
        showBanner('SILVER SASQUATCH');
        for (const m of members) m.poseT = 3.0;
        respondQueue.push(0.4, 0.8);
      });
    }
  } else if (phase === 'anoint_induction') {
    inductionK = Math.min(1, inductionK + dt / 2.2);
    anointLight.position.set(player.position.x, 4.5, player.position.z);
    anointLight.intensity = 110 * Math.sin(Math.min(1, inductionK) * Math.PI * 0.9 + 0.1);
    if (Math.random() < dt * 14) effects.auraMote(player.position);
    // At the flash's peak Tony is still Tony: the Circle has put him in its
    // silver-grey colors and tied on the red member bandana.
    if (!inducted && inductionK >= 0.5) {
      inducted = true;
      const member = new Person(INDUCTED_PALETTE);
      member.group.position.copy(player.group.position);
      member.heading = player.heading;
      member.group.rotation.y = player.heading;
      scene.remove(player.group);
      scene.add(member.group);
      player = member;
      sfx.roar();
      effects.shockwave(player.position, 7, 0x9a6ff0);
      shake = Math.max(shake, 0.45);
      fovPunch = Math.min(12, fovPunch + 6);
    }
    if (inductionK >= 1 && phaseT > 3.2) {
      sfx.chime();
      recordInitiationComplete();
      $('complete').classList.remove('hidden');
      setPhase('complete');
    }
  } else if (phase === 'fail_swing') {
    // Safety net: if the swing somehow never resolved an impact, fail anyway
    if (failT < 0 && phaseT > 1.2) failT = 0.01;
    if (failT > 0) {
      failT -= dt;
      if (failT <= 0) {
        $('fail').classList.remove('hidden');
        setPhase('failed');
      }
    }
  }
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
let flameT = 0;

function onStep() {
  // Human footsteps only need the sound cue here.
  sfx.step();
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  flameT += dt;

  // Dialog auto-advance
  if (dialogActive()) {
    sayAutoT -= dt;
    if (sayAutoT <= 0) advanceSay();
  }

  updatePhase(dt);

  // --- Player ---
  if (canMove()) {
    const sprinting = isSprinting();
    const speed = sprinting ? SPRINT_SPEED : BASE_SPEED;
    player.update(dt, computeMove(), speed, sprinting, onStep);
    collide();
  } else {
    player.update(dt, _zero, 0);
  }
  if (player.consumeImpact()) resolvePlayerImpact();

  // Roar pose overrides the idle arms: fists to the sky, head back
  if (roarPoseT > 0) {
    roarPoseT -= dt;
    const sway = Math.sin(flameT * 18) * 0.08;
    player.armL.rotation.x = Math.PI - 0.35 + sway;
    player.armR.rotation.x = Math.PI - 0.35 - sway;
    player.head.rotation.x = -0.4;
  }

  // Shot dead: the player crumples where they stand
  if (playerFallT >= 0) {
    playerFallT += dt;
    player.group.rotation.x = -Math.min(1.5, playerFallT * 3.2);
  }

  // Your glowing slot in the line, pulsing until you take it
  if (spotMark.visible) {
    const pulse = 1 + Math.sin(flameT * 3.4) * 0.08;
    spotMark.scale.set(pulse, 1, pulse);
  }

  // Muzzle flash light decay
  if (muzzleLight.intensity > 0) {
    muzzleLight.intensity = muzzleLight.intensity > 1 ? muzzleLight.intensity * Math.exp(-22 * dt) : 0;
  }

  // --- Execution in progress (drives its member exclusively) ---
  updateExecution(dt);

  // --- Prospects ---
  for (const p of prospects) {
    if (p.fallT >= 0) {
      // Dropped: fold to the ground and stay there
      p.fallT += dt;
      p.sq.group.rotation.x = -Math.min(1.5, p.fallT * 3.2);
      continue;
    }
    if (p.stepTo) {
      if (walkNpc(p.sq, p.stepTo.x, p.stepTo.z, dt, 2.6)) {
        p.stepTo = null;
        faceToward(p.sq, STAGE.x, STAGE.z, dt, 100);
      }
    } else {
      p.sq.update(dt, _zero, 0);
    }
    if (p.jerkT > 0) {
      // Bullet impacts twitch the body
      p.jerkT -= dt;
      p.sq.body.rotation.z = (Math.random() - 0.5) * 0.4;
      if (p.jerkT <= 0) p.sq.body.rotation.z = 0;
    }
  }

  // --- Members ---
  for (const m of members) {
    if (exec && m === exec.m) continue; // the executioner is otherwise engaged
    if (m.knock) {
      // Decked by the prospect: fly back, hit the dirt, stay down
      m.knock.t += dt;
      const k = m.knock.t;
      if (k < 1) {
        m.sq.group.position.addScaledVector(m.knock.dir, (1 - k) * 7 * dt);
        m.sq.group.position.y = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 1.1;
        m.sq.group.rotation.x = -Math.min(1.45, k * 3);
      } else {
        m.sq.group.position.y = 0;
        m.sq.group.rotation.x = -1.45;
      }
      continue;
    }
    if (m.poseT > 0) {
      // Arms to the sky, roaring for their newest member
      m.poseT -= dt;
      const sway = Math.sin(flameT * 6 + m.home.x) * 0.15;
      m.sq.armL.rotation.x = Math.PI - 0.3 + sway;
      m.sq.armR.rotation.x = Math.PI - 0.3 - sway;
      continue;
    }
    if (m.inCircle && (phase === 'beatdown' || phase === 'fail_swing' || phase === 'failed')) {
      faceToward(m.sq, player.position.x, player.position.z, dt);
      m.sq.update(dt, _zero, 0);
      // A punch lands
      if (m.sq.consumeImpact() && phase === 'beatdown' && hp > STOP_HP) {
        const dmg = 4 + Math.floor(Math.random() * 4);
        hp = Math.max(STOP_HP, hp - dmg);
        updateHp();
        painT = 1;
        shake = Math.max(shake, 0.35);
        sfx.thud();
        debris.puff(new THREE.Vector3(player.position.x, 1.4, player.position.z), PROSPECT_PALETTE.shirt, 4);
        popText(player.position, m.name ? `${m.name}! -${dmg}` : `-${dmg}`, 'pain');
        // Shoved around inside the ring
        _dir.set(player.position.x - m.sq.position.x, 0, player.position.z - m.sq.position.z).normalize();
        player.position.addScaledVector(_dir, 0.18);
        const off = Math.hypot(player.position.x - PLAYER_SLOT.x, player.position.z - PLAYER_SLOT.z);
        if (off > 1.3) {
          player.position.x = PLAYER_SLOT.x + (player.position.x - PLAYER_SLOT.x) * (1.3 / off);
          player.position.z = PLAYER_SLOT.z + (player.position.z - PLAYER_SLOT.z) * (1.3 / off);
        }
        if (hp <= STOP_HP) endureComplete();
      }
    } else if (m.inCircle && phase === 'gauntlet_in') {
      // walking handled in updatePhase
    } else if (!m.inCircle && m.slot === null &&
        Math.hypot(m.sq.position.x - m.home.x, m.sq.position.z - m.home.z) > 0.5) {
      // Drift back to their spot in the crowd
      walkNpc(m.sq, m.home.x, m.home.z, dt, 3.0);
    } else {
      // In the crowd: watch the stage, the execution, or the prospect —
      // whatever the evening's entertainment currently is
      const watchStage = phase === 'approach' || phase === 'line_up' || phase === 'speech' ||
        phase === 'q1' || phase === 'q2_intro' || phase === 'q2_choice' || phase === 'q2_result';
      if (phase === 'execution') faceToward(m.sq, prospects[0].sq.position.x, prospects[0].sq.position.z, dt, 4);
      else if (watchStage) faceToward(m.sq, STAGE.x, STAGE.z, dt, 4);
      else faceToward(m.sq, player.position.x, player.position.z, dt, 4);
      m.sq.update(dt, _zero, 0);
    }
  }

  // Staggered answering roars
  for (let i = respondQueue.length - 1; i >= 0; i--) {
    respondQueue[i] -= dt;
    if (respondQueue[i] <= 0) {
      respondQueue.splice(i, 1);
      sfx.roar();
      for (const m of members) if (!m.knock) m.poseT = Math.max(m.poseT, 1.8);
    }
  }

  // --- Booskibro & Big Uncle Lou Sputthole on stage ---
  if (phase !== 'anoint_walk') boosk.update(dt, _zero, 0);
  if (phase === 'anoint_lines' || phase === 'anoint_induction' || phase === 'complete') {
    faceToward(boosk, player.position.x, player.position.z, dt, 6);
  }
  louStage.update(dt, _zero, 0);
  if (phase === 'execution') {
    faceToward(louStage, prospects[0].sq.position.x, prospects[0].sq.position.z, dt, 5);
  } else if (phase !== 'approach' && phase !== 'line_up' && phase !== 'speech') {
    faceToward(louStage, player.position.x, player.position.z, dt, 5);
  }

  // --- Fire, flames, particles ---
  const surge = surgeT > 0 ? 1 + Math.min(1, surgeT) * 0.7 : 1;
  surgeT = Math.max(0, surgeT - dt);
  for (let i = 0; i < flames.length; i++) {
    const f = flames[i];
    f.scale.y = surge * (1 + Math.sin(flameT * 13 + i * 2.1) * 0.22);
    f.scale.x = f.scale.z = surge * (1 + Math.sin(flameT * 9 + i * 1.3) * 0.1);
    f.rotation.y += dt * (0.6 + (i % 3) * 0.3);
  }
  fireLight.intensity = 340 * surge * (1 + Math.sin(flameT * 11) * 0.08 + Math.sin(flameT * 23 + 1.7) * 0.07);

  if (greatLog && greatLog.wobble > 0) {
    greatLog.wobble = Math.max(0, greatLog.wobble - dt);
    greatLog.group.rotation.z = Math.sin(greatLog.wobble * 30) * 0.08 * greatLog.wobble;
  }

  // Embers
  for (let i = 0; i < EMBER_N; i++) {
    const e = emberData[i];
    e.t += dt;
    if (e.t > e.life) { resetEmber(i); continue; }
    embers.positions[i * 3] += (e.vx + Math.sin(flameT * 3 + e.phase) * 0.35) * dt;
    embers.positions[i * 3 + 1] += e.vy * surge * dt;
    embers.positions[i * 3 + 2] += (e.vz + Math.cos(flameT * 2.6 + e.phase) * 0.35) * dt;
  }
  embers.geo.attributes.position.needsUpdate = true;

  // Smoke
  for (let i = 0; i < SMOKE_N; i++) {
    const s = smokeData[i];
    s.t += dt;
    if (s.t > s.life) { resetSmoke(i); continue; }
    smoke.positions[i * 3] += 0.45 * dt;
    smoke.positions[i * 3 + 1] += s.vy * dt;
    smoke.positions[i * 3 + 2] += 0.2 * dt;
  }
  smoke.geo.attributes.position.needsUpdate = true;

  // Fireflies drift
  for (let i = 0; i < FIREFLY_N; i++) {
    const f = fireflyBase[i];
    fireflies.positions[i * 3] = f.x + Math.sin(flameT * 0.7 + f.phase) * 1.6;
    fireflies.positions[i * 3 + 1] = f.y + Math.sin(flameT * 1.1 + f.phase * 2) * 0.5;
    fireflies.positions[i * 3 + 2] = f.z + Math.cos(flameT * 0.5 + f.phase) * 1.6;
  }
  fireflies.geo.attributes.position.needsUpdate = true;

  // Ambient crackle
  crackleT -= dt;
  if (crackleT <= 0) {
    sfx.crackle();
    crackleT = 0.12 + Math.random() * 0.5;
  }

  // Pain vignette decay
  if (painT > 0) {
    painT = Math.max(0, painT - dt * 2.2);
    painFlashEl.style.opacity = painT;
  }

  debris.update(dt);
  effects.update(dt);
  updateCamera(dt);
  composer.render();
}

tick();

// Debug/test handle (harmless in production)
window.INITIATION = {
  get player() { return player; }, // human rig receives member colors at the anointing
  members,
  prospects,
  boosk,
  louStage,
  PLAYER_SLOT,
  get phase() { return phase; },
  get hp() { return hp; },
  get inducted() { return inducted; },
  get greatLog() { return greatLog; },
  get quizOpen() { return quizEl.classList.contains('show'); },
  get correctChoice() {
    return [...quizEl.querySelectorAll('.quiz-opt')].findIndex((b) => b.dataset.correct === '1');
  },
  chooseAnswer,
  smashAction,
  roarAction,
  advanceSay,
  /** Exercise the real subtitle/audio delivery path without moving the scene. */
  speakVoiceProbe() {
    say(RETRY_LINE);
    return {
      speaker: speakerEl.textContent,
      line: lineEl.textContent,
      cue: RETRY_LINE[0].cue,
      requested: [...sfx.voiceRequested],
    };
  },
  speakQuizVoiceProbe() {
    say([QUIZ_OPTIONS[0]]);
    return {
      speaker: speakerEl.textContent,
      line: lineEl.textContent,
      cue: QUIZ_OPTIONS[0].cue,
      requested: [...sfx.voiceRequested],
    };
  },
  // Jump the ceremony forward for testing
  skipToGauntlet() {
    player.group.position.set(PLAYER_SLOT.x, 0, PLAYER_SLOT.z);
    spotMark.visible = false;
    sfx.stopVoice();
    sayQueue = [];
    sayDone = null;
    dialogEl.classList.remove('show');
    hideQuiz();
    startGauntlet(false);
  },
  skipToInduction() {
    sfx.stopVoice();
    sayQueue = [];
    sayDone = null;
    dialogEl.classList.remove('show');
    hideQuiz();
    $('complete').classList.add('hidden');
    inductionK = 0;
    inducted = false;
    setPhase('anoint_induction');
  },
};
