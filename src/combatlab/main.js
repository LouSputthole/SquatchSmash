/**
 * The Combat Lab — composition root.
 *
 * The proving ground for `src/core/combat/`: every layer of the framework
 * wired together in one scene with nothing mission-shaped in the way. The
 * boot shape is the standard one every standalone scene uses (`Player` +
 * `InteractionSystem` + `AudioEngine` + `createPauseMenu`, a `world =
 * {colliders, floorZones, groundAt}` object, a plain requestAnimationFrame
 * loop, and a `window.combatlab` handle with `tick()` for the headless
 * verifier) — see `src/mansion/main.js`, which this follows closely.
 *
 * What it proves, and where:
 *   - the armory holds ONE OF EVERYTHING (all nine catalog weapons);
 *   - the range's paper and movers take the player's rays;
 *   - the material wall shows penetration, ricochet and per-material impacts;
 *   - keys 1/2/3 run configured EncounterController fights (yard, killhouse,
 *     stress wave), key 4 fields a friendly Squatch, key 5 an armored heavy
 *     for the helmet/vest demonstration;
 *   - F5/F9 capture and restore a full combat checkpoint;
 *   - `?debug=1` mounts the combat debug drawer.
 */
import * as THREE from 'three';
import { buildCombatLab, LAB } from './level.js';
import { Player } from '../core/player.js';
import { InteractionSystem } from '../core/interaction.js';
import { AudioEngine } from '../core/audio.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { WeaponSystem } from '../core/weapons/WeaponSystem.js';
import { mountArmory } from '../core/weapons/Armory.js';
import { weaponCueNames, playWeaponCue } from '../core/weapons/audio.js';
import { COMBAT_WEAPON_ORDER, weaponDef } from '../core/weapons/catalog.js';
import { buildWeaponModel } from '../core/weapons/models.js';
import { Npc } from '../bing/cast.js';
import { CheckpointDirector } from '../heist/checkpoints.js';
import {
  Combatant, CombatHud, CombatLog, CombatRules, CoverField, EncounterController,
  FactionMatrix, ImpactEffects, PlayerCombat, ShotResolver, SquadBlackboard,
  TracerPool, customArchetype, resolveDifficulty,
} from '../core/combat/index.js';

/* ================================================================== */
/* DOM                                                                  */
/* ================================================================== */
const $ = (id) => document.getElementById(id);
const menuEl = $('menu');
const startBtn = $('startBtn');
const promptEl = $('prompt');
const promptKeyEl = $('promptKey');
const promptLabelEl = $('promptLabel');
const promptHoldEl = $('promptHold');
const toastEl = $('toast');

const tinyHud = {
  showPrompt(label, key = 'E') {
    promptLabelEl.innerHTML = label;
    promptKeyEl.textContent = key;
    promptEl.classList.remove('hidden');
  },
  hidePrompt() {
    promptEl.classList.add('hidden');
    promptHoldEl.style.width = '0%';
  },
  setHold(progress) {
    promptHoldEl.style.width = progress === null ? '0%' : `${Math.round(progress * 100)}%`;
  },
};

let toastTimer = null;
function toast(text, ms = 2600) {
  toastEl.textContent = text;
  toastEl.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, ms);
}

/* ================================================================== */
/* Renderer / camera / scene                                             */
/* ================================================================== */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1626);
scene.fog = new THREE.Fog(0x0d1626, 90, 220);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 300);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ================================================================== */
/* Level + player                                                        */
/* ================================================================== */
const lab = buildCombatLab(scene);
const audio = new AudioEngine();

const player = new Player(camera, {
  colliders: lab.colliders,
  floorZones: lab.floorZones,
  groundAt: (x, z) => lab.groundAt(x, z, player.ground),
});
player.mode = 'walk';
player.position.set(lab.spawns.player.x, 1.66, lab.spawns.player.z);
player.yaw = lab.spawns.player.yaw;
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

const interaction = new InteractionSystem(camera, tinyHud);
interaction.setOccluders(lab.hitMeshes);

const url = new URL(window.location.href);
const DEBUG = url.searchParams.get('debug') === '1';
const difficulty = resolveDifficulty(url.searchParams.get('difficulty') ?? 'normal');

/* ================================================================== */
/* Combat framework wiring                                               */
/* ================================================================== */
const log = new CombatLog({ enabled: true, capacity: 300 });
const rules = new CombatRules({
  matrix: new FactionMatrix(),
  friendlyFire: 'reduced',
  onFriendlyKill: () => toast('YOU SHOT ONE OF YOUR OWN'),
});
const resolver = new ShotResolver({ range: 160, rules, log });
const effects = new ImpactEffects({ scene, audio });
const cover = new CoverField({ points: lab.coverPoints });
const npcTracers = new TracerPool(scene, 120, { minLength: 0.9 });

/** Everyone with a body: Combatants plus the player's proxy. */
const combatants = [];
let targetsDirty = true;
let cachedPlayerTargets = [];
let cachedNpcTargets = [];

/* The player's own hit volumes: a torso capsule-box and a head box that
 * follow the camera. NPC rays test these; the player's own rays do not. */
const playerProxy = {
  id: 'player',
  faction: 'crew',
  isPlayerProxy: true,
  vitals: null, // filled after PlayerCombat exists
  npc: null,
  get x() { return player.position.x; },
  get z() { return player.position.z; },
  /* CHEST height, not the eye. `player.position.y` is where he LOOKS from;
   * every combatant's own `y` is `npc.position.y + 1.3`, and both the NPC
   * firing line and the near-miss test read this as "where the body is".
   * Handing them the eye made every enemy aim a rifle at an unhelmeted head
   * from the first round, and the first round that landed always killed. */
  get y() { return player.position.y - player.eyeHeight + 1.3; },
  noteShotResult(record) {
    if (!record?.applied) return;
    playerCombat.takeHit(record);
    if (record.fatal) {
      toast('DOWN. F9 restores the last checkpoint.', 5000);
      activeEncounter?.reportPlayerDead();
    }
  },
};
const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
const playerBodyBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hiddenMat);
playerBodyBox.userData.combatant = playerProxy;
playerBodyBox.userData.hitRegion = 'upperTorso';
scene.add(playerBodyBox);
const playerHeadBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), hiddenMat);
playerHeadBox.userData.combatant = playerProxy;
playerHeadBox.userData.hitRegion = 'head';
scene.add(playerHeadBox);

function rebuildTargets() {
  const npcBoxes = [];
  for (const c of combatants) {
    if (!c.dead) npcBoxes.push(...c.hitboxes.meshes);
  }
  cachedPlayerTargets = [...lab.hitMeshes, ...npcBoxes];
  cachedNpcTargets = [...lab.hitMeshes, ...npcBoxes, playerBodyBox, playerHeadBox];
  targetsDirty = false;
}
const playerTargets = () => {
  if (targetsDirty) rebuildTargets();
  return cachedPlayerTargets;
};
const npcTargets = () => {
  if (targetsDirty) rebuildTargets();
  return cachedNpcTargets;
};

/* Line of sight for NPC perception: one ray against the level, walls and
 * closed doors included. Bodies do not block sight. */
const losRay = new THREE.Raycaster();
const _losFrom = new THREE.Vector3();
const _losDir = new THREE.Vector3();
function canSee(from, to) {
  _losFrom.set(from.x, (from.y ?? lab.groundAt(from.x, from.z) + 1.55), from.z);
  _losDir.set(to.x - _losFrom.x, (to.y ?? 1.55) - _losFrom.y, to.z - _losFrom.z);
  const dist = _losDir.length();
  if (dist < 0.6) return true;
  _losDir.normalize();
  losRay.set(_losFrom, _losDir);
  losRay.far = dist - 0.4;
  return losRay.intersectObjects(lab.hitMeshes, true).length === 0;
}

/* ================================================================== */
/* The player's guns                                                     */
/* ================================================================== */
const weapons = new WeaponSystem({
  camera,
  world: scene,
  audio,
  groundAt: (x, z) => lab.groundAt(x, z, player.ground),
  hitTargets: lab.hitMeshes, // muzzle-obstruction probe + fallback ray
  range: 160,
});

const playerCombat = new PlayerCombat({
  player, camera, weapons, resolver,
  targets: playerTargets,
  effects,
  difficulty,
  combatants: () => combatants,
  onHitConfirm: (info) => hud.confirm(info),
  onKill: ({ combatant, headshot }) => {
    activeEncounter?.reportKill({
      id: combatant.id, byPlayer: true, faction: combatant.faction, headshot,
    });
  },
});
playerProxy.vitals = playerCombat.vitals;

const hud = new CombatHud(document.body);

const armory = mountArmory({
  parent: scene,
  system: weapons,
  interaction,
  racks: COMBAT_WEAPON_ORDER.map((id, i) => ({
    id,
    x: lab.spawns.armoryWall.x + 0.15,
    y: 1.35,
    z: lab.spawns.armoryWall.z - 3.4 + i * 0.85,
    rotY: lab.spawns.armoryWall.rotY,
  })),
  enabled: () => running,
  addCollider: (x0, x1, y0, y1, z0, z1) => {
    lab.colliders.push(new THREE.Box3(
      new THREE.Vector3(Math.min(x0, x1), y0, Math.min(z0, z1)),
      new THREE.Vector3(Math.max(x0, x1), y1, Math.max(z0, z1)),
    ));
  },
  addLight: (light) => scene.add(light),
});

/* Doors open with E. */
for (const door of lab.doors) {
  interaction.register(door.group, {
    label: () => (door.open ? 'Close the door' : 'Open the door'),
    onUse: () => { door.toggle(); audio.play('heist.weapon.down', { volume: 0.3 }); },
  });
}

/* ================================================================== */
/* Combatants                                                            */
/* ================================================================== */
const GOON_MODELS = [
  { dress: 'tracksuit', shirt: 0x2c3138, build: 1.1 },
  { dress: 'work', shirt: 0x3a3430, build: 1.0 },
  { dress: 'shirt', shirt: 0x37424d, build: 1.05, beard: true },
  { dress: 'tracksuit', shirt: 0x25333d, build: 1.2, beard: true },
];
const CREW_MODEL = { dress: 'tee', shirt: 0x5a2c28, build: 1.25, beard: true, bandana: true };

let spawnCounter = 0;
const pendingSpawns = [];

function spawnCombatant(archName, faction, {
  x, z, yaw = 0, alert = 'unaware', leader = false, squad = null,
  id = null, protectedCore = false,
} = {}) {
  const cid = id ?? `${faction}.${archName}.${spawnCounter++}`;
  const ground = lab.groundAt(x, z);
  const model = faction === 'crew'
    ? CREW_MODEL
    : GOON_MODELS[spawnCounter % GOON_MODELS.length];
  const npc = new Npc(scene, {
    name: cid, tier: 'hero', x, z, y: ground, yaw,
    job: 'stand', look: false,
    model: { ...model, castShadow: false },
    colliders: lab.colliders, navBlockers: lab.navBlockers,
  });
  const combatant = new Combatant({
    id: cid,
    npc,
    archetype: leader ? customArchetype(archName, { role: 'squadLeader' }) : archName,
    faction,
    resolver,
    targets: npcTargets,
    squad,
    cover,
    tracers: npcTracers,
    difficulty,
    retreatPoints: [
      { x: lab.spawns.reinforcementDoors[0].x, z: lab.spawns.reinforcementDoors[0].z },
      { x: lab.spawns.reinforcementDoors[1].x, z: lab.spawns.reinforcementDoors[1].z },
    ],
    canSee,
    groundAt: (gx, gz) => lab.groundAt(gx, gz, npc.baseY),
    colliders: lab.colliders,
    navBlockers: lab.navBlockers,
    onEvent: onCombatantEvent,
    onDeath: (info) => {
      targetsDirty = true;
      activeEncounter?.reportKill({ ...info, faction });
    },
    protectedCore,
  });
  combatant.archName = archName;
  combatant.attachGunModel(buildWeaponModel(combatant.weapon.id));
  if (alert === 'alerted') {
    combatant.perception.inform({
      x: player.position.x, z: player.position.z, confidence: 0.72,
    });
    combatant.perception.investigate = {
      x: player.position.x, z: player.position.z, priority: 0.8, age: 0,
    };
  }
  combatants.push(combatant);
  targetsDirty = true;
  if (debugPanel?.show.hitboxes) combatant.hitboxes.setDebug(true);
  return combatant;
}

function onCombatantEvent(e) {
  if (e.type === 'shot') {
    playWeaponCue(audio, e.weapon, 'fire', { volume: 0.4, position: e.from });
    for (const s of e.surfaces) {
      if (s.kind === 'world') effects.worldImpact(s);
      else if (s.kind === 'body' && !s.combatant?.isPlayerProxy) {
        effects.bodyImpact(s, s.combatant?.npc?.parts?.body ?? null);
      }
    }
    debugPanel?.noteRay(e.from, e.end, e.suppressing ? 0xff8040 : 0xffe080);
    // Gunfire is loud: everyone in earshot learns something happened.
    const noise = weaponDef(e.weapon)?.combat?.noise ?? 80;
    for (const c of combatants) {
      if (c.id === e.id || c.dead) continue;
      c.perception.hear(
        { x: e.from.x, z: e.from.z, radius: noise, priority: 0.5 },
        { x: c.x, z: c.z },
      );
    }
    activeEncounter?.reportAlert();
  } else if (e.type === 'death') {
    // A squadmate dropping is a noise, and worse than a noise.
    for (const c of combatants) {
      if (c.dead || c.id === e.id) continue;
      c.perception.hear({ x: e.x, z: e.z, radius: 25, priority: 0.6 }, { x: c.x, z: c.z });
      if (Math.hypot(c.x - e.x, c.z - e.z) < 25) c.morale.note('allyDown');
    }
    audio.play('heist.guard.weapon.drop', { volume: 0.4 });
  }
}

function clearCombatants({ crewToo = true } = {}) {
  for (let i = combatants.length - 1; i >= 0; i--) {
    const c = combatants[i];
    if (!crewToo && c.faction === 'crew') continue;
    c.dispose();
    combatants.splice(i, 1);
  }
  pendingSpawns.length = 0;
  targetsDirty = true;
}

/* ================================================================== */
/* Encounters                                                            */
/* ================================================================== */
let activeEncounter = null;
let activeSquad = null;

const ENCOUNTERS = {
  yard: () => ({
    id: 'yard',
    groups: [
      { id: 'rifles', archetype: 'rifleman', count: 3, faction: 'police', spawns: lab.spawns.enemyGroups.yard.slice(0, 3) },
      { id: 'cover', archetype: 'coverShooter', count: 2, faction: 'police', spawns: lab.spawns.enemyGroups.yard.slice(3, 5) },
      { id: 'gunner', archetype: 'machineGunner', count: 1, faction: 'police', spawns: lab.spawns.enemyGroups.yard.slice(5, 6) },
      { id: 'lead', archetype: 'squadLeader', count: 1, faction: 'police', leader: true, spawns: lab.spawns.enemyGroups.yard.slice(6, 7) },
    ],
    entries: {
      gate: lab.spawns.reinforcementDoors.find((d) => d.id === 'yard-gate'),
    },
    reinforcements: [
      { id: 'flankers', group: 'rifles', archetype: 'flanker', entry: 'gate', onDeaths: 4, count: 2, limit: 1 },
    ],
    complete: { allDead: true },
  }),
  killhouse: () => ({
    id: 'killhouse',
    groups: [
      { id: 'ground', archetype: 'coverShooter', count: 2, faction: 'police', spawns: lab.spawns.enemyGroups.killhouseGround.slice(0, 2) },
      { id: 'door', archetype: 'shotgunner', count: 1, faction: 'police', spawns: lab.spawns.enemyGroups.killhouseGround.slice(2, 3) },
      { id: 'smg', archetype: 'smg', count: 1, faction: 'police', spawns: lab.spawns.enemyGroups.killhouseGround.slice(3, 4) },
      { id: 'upper', archetype: 'marksman', count: 1, faction: 'police', spawns: lab.spawns.enemyGroups.killhouseUpper.slice(0, 1) },
      { id: 'upperRifles', archetype: 'rifleman', count: 2, faction: 'police', spawns: lab.spawns.enemyGroups.killhouseUpper.slice(1, 3) },
    ],
    entries: {
      rear: lab.spawns.reinforcementDoors.find((d) => d.id === 'killhouse-rear'),
    },
    reinforcements: [
      { id: 'rushers', group: 'ground', archetype: 'rusher', entry: 'rear', onDeaths: 3, count: 2, limit: 1 },
    ],
    complete: { allDead: true },
  }),
  stress: () => ({
    id: 'stress',
    groups: [
      { id: 'wave', archetype: 'rifleman', count: 8, faction: 'police', spawns: lab.spawns.stress.slice(0, 8), alert: 'alerted' },
      { id: 'wave2', archetype: 'smg', count: 4, faction: 'police', spawns: lab.spawns.stress.slice(8, 12), alert: 'alerted' },
    ],
    entries: { gate: lab.spawns.reinforcementDoors[0] },
    reinforcements: [
      { id: 'more', group: 'wave', entry: 'gate', onDeaths: 6, count: 4, limit: 1 },
    ],
    complete: { allDead: true },
  }),
};

function startEncounter(name) {
  if (!ENCOUNTERS[name]) return null;
  clearCombatants({ crewToo: false });
  activeSquad = new SquadBlackboard({
    flankBudget: 1 + (difficulty.flankerBudgetBonus ?? 0),
    pushBudget: 2,
  });
  activeEncounter = new EncounterController(ENCOUNTERS[name](), {
    onSpawn: (order) => {
      const delay = order.spawn.stagger ?? 0;
      const run = () => spawnCombatant(order.archetype, order.faction, {
        id: order.id,
        x: order.spawn.x,
        z: order.spawn.z,
        yaw: order.spawn.yaw ?? 0,
        alert: order.alert,
        leader: order.leader,
        squad: activeSquad,
      });
      if (delay > 0) pendingSpawns.push({ timer: delay, run });
      else run();
    },
    onReinforce: ({ count }) => toast(`REINFORCEMENTS — ${count} through the door`),
    onComplete: () => toast(`ENCOUNTER CLEAR — ${log.counts.kills} down`),
    onFail: (reason) => toast(`ENCOUNTER FAILED (${reason})`, 4000),
  });
  activeEncounter.begin();
  toast(`ENCOUNTER: ${name.toUpperCase()}`);
  return activeEncounter;
}

function spawnAlly() {
  const p = lab.spawns.friendly;
  const ally = spawnCombatant('friendlyCrew', 'crew', {
    x: p.x, z: p.z, id: `crew.ally.${spawnCounter}`, protectedCore: false,
  });
  ally.perception.confidence = 1;
  toast('A FRIEND STEPS UP');
  return ally;
}

function spawnArmorDemo() {
  const c = spawnCombatant('armored', 'police', {
    x: LAB.YARD.x, z: LAB.YARD.z, alert: 'alerted', squad: activeSquad,
  });
  toast('ARMORED HEAVY — crack the helmet or go around the vest');
  return c;
}

/* ================================================================== */
/* Checkpoints                                                           */
/* ================================================================== */
const checkpoints = new CheckpointDirector();
checkpoints.register('player', {
  capture: () => ({
    combat: playerCombat.capture(),
    x: player.position.x, y: player.position.y, z: player.position.z,
    yaw: player.yaw, pitch: player.pitch, ground: player.ground,
  }),
  restore: (s) => {
    playerCombat.restore(s.combat);
    player.position.set(s.x, s.y, s.z);
    player.yaw = s.yaw;
    player.pitch = s.pitch;
    player.ground = s.ground;
    player.velocity.set(0, 0, 0);
  },
  reset: () => {},
});
checkpoints.register('roster', {
  capture: () => combatants.map((c) => ({
    arch: c.archName, faction: c.faction, snap: c.snapshot(),
  })),
  restore: (list) => {
    clearCombatants({ crewToo: true });
    for (const item of list) {
      if (item.snap.dead) continue; // the dead stay dead; bodies are not respawned
      const c = spawnCombatant(item.arch, item.faction, {
        id: item.snap.id, x: item.snap.x, z: item.snap.z, yaw: item.snap.yaw,
        squad: activeSquad,
      });
      c.restore(item.snap);
    }
  },
  reset: () => clearCombatants({ crewToo: true }),
});
checkpoints.register('encounter', {
  capture: () => activeEncounter?.capture() ?? null,
  restore: (s) => { if (s) activeEncounter?.restore(s); },
  /* CheckpointDirector resets EVERY system before it restores any of them,
   * so the controller has to survive its own reset -- dropping the reference
   * here (`activeEncounter = null`) threw the snapshot away one line later
   * and every restored fight came back as "no encounter". `reset()` already
   * returns the controller to idle with nothing spawned, which is what the
   * teardown wanted; `restore()` then puts the whole fight back. */
  reset: () => { activeEncounter?.reset(); },
});

/* ================================================================== */
/* Debug drawer                                                          */
/* ================================================================== */
let debugPanel = null;
if (DEBUG) {
  import('../core/combat/debug.js').then(({ CombatDebug }) => {
    debugPanel = new CombatDebug({
      playerCombat,
      weapons,
      combatants: () => combatants,
      cover,
      log,
      scene,
      camera,
      spawn: (arch, faction) => {
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        spawnCombatant(arch, faction, {
          x: player.position.x + fwd.x * 8,
          z: player.position.z + fwd.z * 8,
          alert: faction === 'crew' ? 'unaware' : 'alerted',
          squad: activeSquad,
        });
      },
      resetEncounter: () => { clearCombatants({ crewToo: false }); activeEncounter?.reset(); },
      setTimeScale: (k) => { timeScale = k; },
    });
  });
}

/* ================================================================== */
/* Pause + boot gate                                                     */
/* ================================================================== */
let running = false;
let timeScale = 1;
const clock = new THREE.Clock();

const pauseMenu = createPauseMenu({
  title: 'The Combat Lab',
  canPause: () => running,
  getObjective: () => 'Prove the combat framework: the range, the material wall, the killhouse, the yard, the long lane.',
  instructions: [
    'W A S D — move. Mouse — look. Shift — sprint. C — crouch. Space — jump.',
    'Left mouse — fire. Right mouse — aim. R — reload. E — take a weapon / use. Q — rack it.',
    '1 — yard fight. 2 — killhouse fight. 3 — stress wave. 4 — ally. 5 — armored heavy.',
    'F5 — save checkpoint. F9 — restore it. Tab — pause.',
  ],
  onPause: () => { weapons.setTrigger(false); },
  onResume: () => {
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    clock.getDelta();
    lockPointer();
  },
});

function lockPointer() {
  renderer.domElement.requestPointerLock?.();
}

async function begin() {
  if (running) return;
  running = true;
  menuEl.classList.add('hidden');
  await audio.init();
  audio.loadManifest({
    names: [
      ...weaponCueNames(),
      'gun.impact', 'car.impact.metal', 'heist.bullet.impact', 'heist.vehicle.impact',
      'cs.headshot', 'gun.pickup', 'heist.weapon.down', 'heist.guard.weapon.drop',
      'footstep.metal', 'ice.drop',
    ],
  }).catch(() => {});
  player.enabled = true;
  lockPointer();
  clock.getDelta();
}
startBtn.addEventListener('click', begin);

/* ================================================================== */
/* Input                                                                 */
/* ================================================================== */
window.addEventListener('keydown', (e) => {
  if (!running) return;
  if (e.code === 'Space') e.preventDefault();
  player.setKey(e.code, true);
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyE': interaction.press(); break;
    case 'KeyR': playerCombat.reload(); break;
    case 'KeyQ': if (weapons.equipped) armory.put(); break;
    case 'Digit1': startEncounter('yard'); break;
    case 'Digit2': startEncounter('killhouse'); break;
    case 'Digit3': startEncounter('stress'); break;
    case 'Digit4': spawnAlly(); break;
    case 'Digit5': spawnArmorDemo(); break;
    case 'F5': e.preventDefault(); checkpoints.capture('lab'); toast('CHECKPOINT SAVED'); break;
    case 'F9': e.preventDefault(); if (checkpoints.restore()) toast('CHECKPOINT RESTORED'); break;
    default: break;
  }
});
window.addEventListener('keyup', (e) => {
  player.setKey(e.code, false);
  if (e.code === 'KeyE') interaction.release();
});
window.addEventListener('blur', () => {
  player.clearKeys();
  interaction.release();
  weapons.setTrigger(false);
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.handleMouseMove(e.movementX, e.movementY);
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!running) return;
  if (document.pointerLockElement !== renderer.domElement) { lockPointer(); return; }
  if (e.button === 0) {
    if (weapons.equipped) playerCombat.setTrigger(true);
    else interaction.press();
  } else if (e.button === 2) {
    playerCombat.setAim(true);
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    playerCombat.setTrigger(false);
    interaction.release();
  } else if (e.button === 2) {
    playerCombat.setAim(false);
  }
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  player.enabled = running && locked;
  if (!locked && running) pauseMenu.pause();
});

/* ================================================================== */
/* Update loop                                                           */
/* ================================================================== */
function updateGame(dt) {
  player.update(dt);
  interaction.update(dt);
  lab.movingTargets.update(dt);

  // The player's hit volumes follow the camera.
  const feetY = player.position.y - player.eyeHeight;
  const bodyH = player.eyeHeight - 0.18;
  playerBodyBox.position.set(player.position.x, feetY + bodyH / 2, player.position.z);
  playerBodyBox.scale.set(0.46, bodyH, 0.46);
  playerHeadBox.position.copy(player.position);

  for (const s of [...pendingSpawns]) {
    s.timer -= dt;
    if (s.timer <= 0) {
      s.run();
      pendingSpawns.splice(pendingSpawns.indexOf(s), 1);
    }
  }

  const playerCtx = {
    player: {
      x: player.position.x,
      z: player.position.z,
      // Chest, for the same reason playerProxy.y is chest — this is the
      // point NPC fire is laid on, and a rifle aimed at the eye is a
      // guaranteed headshot rather than a firefight.
      y: playerProxy.y,
      moving: player.velocity.lengthSq() > 0.3,
      crouched: player.crouching,
      dead: playerCombat.vitals.dead,
    },
    foes: combatants.filter((c) => c.faction !== 'crew'),
  };
  for (const c of combatants) c.update(dt, playerCtx);

  activeSquad?.update(dt);
  activeEncounter?.update(dt);
  cover.update(dt);
  effects.update(dt);
  npcTracers.update(dt);
  playerCombat.update(dt);
  hud.update(dt, playerCombat.feedback());
  debugPanel?.update(dt);

  // The player reloading is something a close squad notices.
  if (weapons.current && weapons.firearm(weapons.current).reloading) {
    activeSquad?.reportPlayerReloading();
  }

  weapons.update(dt, { speed: Math.hypot(player.velocity.x, player.velocity.z) });
  audio.updateListener(camera);
}

let renderEnabled = true;
let framesRendered = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()) * timeScale;
  if (running && !pauseMenu.isPaused()) updateGame(dt);
  if (renderEnabled) {
    renderer.render(scene, camera);
    framesRendered++;
  }
}
requestAnimationFrame(frame);

/* ================================================================== */
/* Debug handle for headless verification                                */
/* ================================================================== */
function teleport(x, y, z, yawDeg = 0) {
  player.mode = 'walk';
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.position.set(x, y + player.eyeHeight, z);
  player.ground = y;
  player.velocity.set(0, 0, 0);
  player.jumpHeight = 0;
  player.grounded = true;
  player.yawCenter = null;
  player.yaw = THREE.MathUtils.degToRad(yawDeg);
  player.pitch = 0;
  player.enabled = true;
  running = true;
  menuEl.classList.add('hidden');
  player.update(1 / 60);
}

window.combatlab = {
  THREE,
  scene,
  camera,
  renderer,
  player,
  playerCombat,
  weapons,
  armory,
  interaction,
  audio,
  lab,
  LAB,
  combatants,
  resolver,
  rules,
  cover,
  log,
  effects,
  checkpoints,
  startEncounter,
  spawnCombatant,
  spawnAlly,
  spawnArmorDemo,
  clearCombatants,
  encounter: () => activeEncounter,
  squad: () => activeSquad,
  teleport,
  get running() { return running; },
  set renderEnabled(v) { renderEnabled = v; },
  get renderEnabled() { return renderEnabled; },
  get framesRendered() { return framesRendered; },
  /** Advance simulated time without real frames — the verifier's clock. */
  tick(seconds = 1, step = 1 / 60) {
    const wasRunning = running;
    running = true;
    for (let t = 0; t < seconds; t += step) {
      updateGame(step);
      /* `renderer.render()` is what normally refreshes the scene graph's
       * world matrices, and EVERY combat ray is cast against matrixWorld —
       * hit volumes ride the animated rig, and the player's own two boxes
       * are moved here each step. Ticking with rendering off and skipping
       * this leaves every body frozen wherever it stood at the last drawn
       * frame: enemy fire passes through the player, bodies stop stopping
       * rounds, and a headless check measures a scene nobody is standing in.
       * One update per step is exactly what the render would have done. */
      scene.updateMatrixWorld();
    }
    running = wasRunning || true;
  },
  report() {
    return {
      running,
      equipped: weapons.equipped,
      player: {
        health: playerCombat.vitals.health,
        dead: playerCombat.vitals.dead,
        x: player.position.x,
        z: player.position.z,
      },
      combatants: combatants.map((c) => c.report()),
      encounter: activeEncounter?.report() ?? null,
      counts: { ...log.counts },
      weaponStats: { ...weapons.stats },
    };
  },
};
