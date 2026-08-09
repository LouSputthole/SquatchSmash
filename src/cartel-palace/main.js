import * as THREE from 'three';

import { AudioEngine } from '../core/audio.js';
import {
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
  navigateCampaign,
} from '../core/campaign.js';
import { CombatActor } from '../core/combat/actors.js';
import { FACTIONS } from '../core/combat/factions.js';
import { TracerPool } from '../core/combat/tracers.js';
import {
  FINAL_ARC_LOADOUT_STORAGE_KEY,
  FINAL_ARC_SLOT_COUNT,
  FINAL_ARC_WEAPON_CATALOG,
  createFinalArcLoadout,
} from '../core/final-arc-loadout.js';
import { createCartelPalaceCampaignStory } from '../core/final-arc-story.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import { PostFX } from '../core/postfx.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { WeaponSystem } from '../core/weapons/WeaponSystem.js';
import { WEAPON_IDS, weaponDef } from '../core/weapons/catalog.js';

import { buildPalaceCast } from './cast.js';
import { EVIDENCE_IDS, PALACE_BEATS, CartelPalaceMission } from './mission.js';
import {
  previewPalaceCheckpointForLocation,
  previewSnapshotForCheckpoint,
} from './preview.js';
import { PalaceSecurity } from './security.js';
import { PALACE_ANCHORS, buildCartelPalace } from './world.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const startButton = document.getElementById('start-btn');
const death = document.getElementById('death');
const retryButton = document.getElementById('retry-btn');
const ending = document.getElementById('ending');
const initiationButton = document.getElementById('initiation-btn');
const loading = document.getElementById('loading');

const ui = {
  objective: document.getElementById('objective'),
  objectiveKicker: document.getElementById('objective-kicker'),
  objectiveDetail: document.getElementById('objective-detail'),
  evidence: document.getElementById('evidence-count'),
  evidenceText: document.querySelector('#evidence-count span'),
  stealth: document.getElementById('stealth'),
  stealthFill: document.querySelector('#stealth .meter i'),
  stealthState: document.querySelector('#stealth > span'),
  healthFill: document.querySelector('#health .meter i'),
  healthText: document.querySelector('#health > span'),
  ammo: document.getElementById('ammo'),
  ammoName: document.getElementById('ammo-name'),
  ammoMag: document.getElementById('ammo-mag'),
  ammoReserve: document.getElementById('ammo-reserve'),
  ammoState: document.getElementById('ammo-state'),
  boss: document.getElementById('boss'),
  bossArmor: document.querySelector('#boss .armor i'),
  bossLife: document.querySelector('#boss .life i'),
  bossState: document.querySelector('#boss > span'),
};

/* ------------------------------------------------------------------ */
/* Campaign and preview                                                */
/* ------------------------------------------------------------------ */

const previewCheckpoint = previewPalaceCheckpointForLocation();
const campaign = createCampaign();
const campaignStory = createCartelPalaceCampaignStory({ campaign });

/* If a stale preview-mode mapper opened this new page as an apartment, repair
 * only the page-local PreviewMemoryStorage. Ordinary localStorage is never
 * touched by this branch; the bounded parser above returns null there. */
if (previewCheckpoint && campaignStory.mission.status === 'locked') {
  campaign.update((state) => {
    state.missions[MISSION_IDS.CARTEL_PALACE].status = 'available';
  });
}

if (previewCheckpoint) {
  const labels = {
    approach: 'ESTATE APPROACH', perimeter: 'PERIMETER', estate: 'SERVICE WING',
    betrayal: 'EVIDENCE COMPLETE', dining_room: 'MARK\'S TABLE', clear: 'EXTRACTION',
  };
  overlay.querySelector('.tag').textContent = `Preview checkpoint: ${labels[previewCheckpoint]}. Progress on this page is temporary.`;
  startButton.textContent = `Start at ${labels[previewCheckpoint].toLowerCase()}`;
}

/* ------------------------------------------------------------------ */
/* Renderer and compound                                               */
/* ------------------------------------------------------------------ */

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  window.__squatchSceneFail?.('This machine cannot open WebGL', String(error?.message || error));
  throw error;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.45));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04090b);
scene.fog = new THREE.FogExp2(0x081014, 0.0085);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.06, 210);
camera.rotation.order = 'YXZ';
scene.add(camera);
const playerFill = new THREE.PointLight(0x9bb4bd, 1.7, 4.5, 2);
playerFill.position.set(0, 0.25, 0.15);
camera.add(playerFill);

const moon = new THREE.DirectionalLight(0xa9c7dc, 2.35);
moon.position.set(-25, 34, 18);
moon.castShadow = true;
moon.shadow.mapSize.set(1536, 1536);
moon.shadow.camera.left = -48;
moon.shadow.camera.right = 48;
moon.shadow.camera.top = 48;
moon.shadow.camera.bottom = -48;
moon.shadow.camera.far = 110;
scene.add(moon);
scene.add(new THREE.HemisphereLight(0x526c7b, 0x1b1510, 1.12));
scene.add(new THREE.AmbientLight(0x657279, 0.48));

window.__squatchStage?.('Building Mark\'s estate…');
const palace = buildCartelPalace(scene);
const castRoot = new THREE.Group();
castRoot.name = 'cartel-palace.cast';
scene.add(castRoot);
const cast = buildPalaceCast(castRoot);

const world = {
  colliders: palace.colliders,
  floorZones: palace.floorZones,
  groundAt: palace.groundAt,
};

const hud = new Hud();
const player = new Player(camera, world);
player.mode = 'walk';
player.position.copy(PALACE_ANCHORS.approach).setY(1.66);
player.yaw = 0;
player.pitch = -0.06;

const interaction = new InteractionSystem(camera, hud);
interaction.setOccluders([palace.root]);
const audio = new AudioEngine();
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
if (postfx.bloom) {
  postfx.bloom.threshold = 0.92;
  postfx.bloom.strength = 0.38;
  postfx.bloom.radius = 0.38;
}

const tracers = new TracerPool(scene, 80, { minLength: 0.75 });
const playerActor = new CombatActor({ id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100, armor: 30 });

/* ------------------------------------------------------------------ */
/* Five-slot final-raid loadout                                        */
/* ------------------------------------------------------------------ */

const inventoryBar = new SceneInventoryBar({
  slots: FINAL_ARC_SLOT_COUNT,
  catalog: FINAL_ARC_WEAPON_CATALOG,
  visible: false,
});
let loadout = null;

let state = {
  phase: 'menu',
  paused: false,
  objective: 'Reach the service gate without raising the alarm.',
  powerCut: false,
  lastCheckpoint: 'approach',
  completeReport: null,
};

function combatantFromObject(object) {
  let node = object;
  while (node) {
    if (node.userData?.palaceCombatant) return node.userData.palaceCombatant;
    node = node.parent;
  }
  return null;
}

let security;
const weapons = new WeaponSystem({
  camera,
  world: scene,
  audio,
  groundAt: palace.groundAt,
  hitTargets: [palace.root, ...cast.hitTargets],
  range: 95,
  onImpact: ({ object, weapon }) => security?.applyPlayerShot(object, weapon),
  onEvent: (event) => {
    if (['equip', 'stow', 'fire', 'loaded'].includes(event.type)) {
      loadout?.capture(weapons);
    }
    if (event.type !== 'fire' || state.phase !== 'active') return;
    if (![PALACE_BEATS.DINING_ROOM, PALACE_BEATS.CLEAR].includes(mission.beat)) {
      security?.raiseAlarm('gunshot');
    }
  },
});

loadout = createFinalArcLoadout();
const inheritedLoadout = loadout.checkpoint();
const hadInheritedWeapon = inheritedLoadout.slots.some(Boolean);
for (const id of [WEAPON_IDS.PISTOL9, WEAPON_IDS.CARBINE, WEAPON_IDS.REVOLVER]) {
  if (!loadout.has(id)) loadout.acquire(id);
}
if (hadInheritedWeapon) {
  const merged = loadout.checkpoint();
  loadout.restore({
    ...merged,
    selected: inheritedLoadout.selected,
    equipped: inheritedLoadout.equipped,
  }, weapons);
} else {
  const carbineSlot = loadout.items.indexOf(WEAPON_IDS.CARBINE);
  loadout.select(carbineSlot >= 0 ? carbineSlot : loadout.selected, weapons);
}

function syncLoadout() {
  inventoryBar.set(loadout.items, loadout.selected);
}

function updateObjective(objective) {
  if (!objective) return;
  state.objective = objective.text;
  ui.objectiveKicker.textContent = objective.kicker;
  ui.objective.textContent = objective.text;
  ui.objectiveDetail.textContent = objective.hint;
}

function repaintEvidence() {
  const count = mission.snapshot().evidenceFound.length;
  ui.evidence.style.setProperty('--evidence', `${Math.round(count / Object.keys(EVIDENCE_IDS).length * 100)}%`);
  ui.evidenceText.textContent = `Evidence ${count} / ${Object.keys(EVIDENCE_IDS).length}`;
}

function persistCheckpoint(id, facts = {}) {
  state.lastCheckpoint = id;
  loadout?.capture(weapons);
  campaignStory.checkpoint(id, facts);
}

const mission = new CartelPalaceMission({
  onObjective: updateObjective,
  onCheckpoint: persistCheckpoint,
  onReveal: () => {
    repaintEvidence();
    hud.say('<em>SAUCE WAS NEVER A PRISONER</em> · the ledger and footage agree.', 4200);
    hud.toast('Evidence complete · rescue premise disproved', 'good', 3600);
  },
  onComplete: (report) => {
    if (!campaignStory.complete(report)) {
      hud.toast('The palace is not clear yet.', 'bad');
      return;
    }
    state.completeReport = report;
    loadout.capture(weapons);
    state.phase = 'complete';
    player.enabled = false;
    player.clearKeys();
    interaction.setPaused(true);
    weapons.setTrigger(false);
    document.exitPointerLock?.();
    ending.classList.remove('hidden');
  },
});

security = new PalaceSecurity({
  cast,
  colliders: palace.colliders,
  onAlarm: (reason) => {
    document.body.classList.add('alarm');
    audio.play('alarm.chirp', { volume: 0.58 });
    if (reason !== 'dining_room') mission.raiseAlarm(reason);
    if (reason === 'guard_contact') hud.say('<em>CONTACT.</em> The quiet route is gone.', 3000);
  },
  onEnemyFire: ({ entry, from, to, hit }) => {
    const def = weaponDef(entry.weapon);
    audio.play(`weapon.${entry.weapon}.fire`, { volume: entry.role === 'boss' ? 0.72 : 0.55, position: from });
    tracers.fire({
      from,
      to,
      speed: def?.tracer.speed ?? 620,
      colour: def?.tracer.colour ?? 0xffd27a,
      width: def?.tracer.width ?? 0.012,
    });
    if (!hit) audio.play('heist.bullet.impact', { volume: 0.16, position: to });
  },
  onPlayerHit: ({ amount }) => {
    const hit = playerActor.applyHit({ amount, attacker: { faction: FACTIONS.CARTEL } });
    const health = Math.max(0, Math.round(playerActor.health));
    ui.healthFill.style.width = `${health}%`;
    ui.healthText.textContent = String(health);
    if (hit.fatal || playerActor.incapacitated) {
      state.phase = 'dead';
      player.enabled = false;
      player.clearKeys();
      interaction.setPaused(true);
      weapons.setTrigger(false);
      document.exitPointerLock?.();
      death.classList.remove('hidden');
    }
  },
  onTargetDown: (entry, { silent }) => {
    if (entry.role === 'guard') {
      hud.toast(silent ? 'Guard down · quiet' : 'Guard down', silent ? 'good' : '');
      return;
    }
    mission.registerTargetDown(entry.id);
    if (entry.id === 'mark') hud.toast('Mark eliminated', 'good', 3200);
    if (entry.id === 'sauce') hud.toast('Sauce eliminated', 'good', 3200);
  },
  onBossPhase: (phase) => {
    if (phase === 'exposed') hud.say('<em>MARK\'S ARMOR IS GONE.</em>', 2200);
  },
});

/* ------------------------------------------------------------------ */
/* Interactions                                                        */
/* ------------------------------------------------------------------ */

interaction.register(palace.targets.powerBox, {
  label: 'Hold to cut the <b>service power</b>',
  hold: 0.82,
  enabled: () => state.phase === 'active' && mission.beat === PALACE_BEATS.APPROACH,
  onUse: () => {
    if (!palace.doors.openServiceGate()) return;
    state.powerCut = true;
    audio.play('door.creak', { volume: 0.56, position: PALACE_ANCHORS.powerBox });
    mission.enterPerimeter({ powerCut: true });
    hud.toast('Exterior cameras dark · service gate open', 'good');
  },
});

interaction.register(palace.targets.estateDoor, {
  label: 'Enter the <b>service wing</b>',
  hold: 0.55,
  enabled: () => state.phase === 'active' && mission.beat === PALACE_BEATS.PERIMETER,
  onUse: () => {
    if (!palace.doors.openEstateDoor()) return;
    audio.play('door.creak', { volume: 0.5, position: PALACE_ANCHORS.estate });
    mission.enterEstate();
  },
});

for (const [id, target] of Object.entries(palace.evidence)) {
  interaction.register(target, {
    label: () => target.userData.collected
      ? `<b>${target.userData.evidenceTitle}</b> · logged`
      : `Examine <b>${target.userData.evidenceTitle}</b>`,
    hold: 0.48,
    enabled: () => state.phase === 'active'
      && mission.beat === PALACE_BEATS.ESTATE
      && !target.userData.collected,
    onUse: () => {
      if (!mission.collectEvidence(id)) return;
      target.userData.collected = true;
      target.traverse((node) => {
        if (node.isMesh && node.material?.emissive) node.material.emissiveIntensity = 0;
      });
      repaintEvidence();
      hud.say(`<em>${target.userData.evidenceTitle}</em> · ${target.userData.evidenceDetail}`, 5200);
    },
  });
}

interaction.register(palace.targets.diningDoor, {
  label: 'Open Mark\'s <b>dining room</b>',
  hold: 0.72,
  enabled: () => state.phase === 'active' && mission.beat === PALACE_BEATS.BETRAYAL,
  onUse: () => {
    if (!palace.doors.openDiningRoom() || !mission.enterDiningRoom()) return;
    audio.play('door.creak', { volume: 0.7, position: PALACE_ANCHORS.diningRoom });
    security.activateFinalEncounter();
    ui.boss.classList.remove('hidden');
    hud.say('<em>MARK AND SAUCE.</em> No rescue. No speech. Finish it.', 3600);
  },
});

interaction.register(palace.targets.extractionGate, {
  label: 'Leave for the <b>Initiation</b>',
  hold: 0.82,
  enabled: () => state.phase === 'active' && mission.beat === PALACE_BEATS.CLEAR,
  onUse: () => {
    palace.doors.openExtraction();
    mission.extract();
  },
});

for (const guard of cast.guards) {
  interaction.register(guard.root, {
    label: 'Hold for a <b>quiet takedown</b>',
    hold: 0.5,
    enabled: () => state.phase === 'active'
      && !guard.down
      && guard.active
      && !security.alarm
      && guard.awareness < 0.72,
    onUse: () => {
      const distance = player.position.distanceTo(guard.root.position);
      security.silentTakedown(guard.id, { distance });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Checkpoint staging                                                  */
/* ------------------------------------------------------------------ */

const CHECKPOINT_POSITIONS = Object.freeze({
  approach: { at: PALACE_ANCHORS.approach, yaw: 0 },
  perimeter: { at: new THREE.Vector3(8.6, 0, 51), yaw: 0 },
  estate: { at: new THREE.Vector3(14.3, 0, 5.5), yaw: 0 },
  betrayal: { at: new THREE.Vector3(0, 0, -27.5), yaw: 0 },
  dining_room: { at: new THREE.Vector3(0, 0, -31), yaw: 0 },
  clear: { at: new THREE.Vector3(0, 0, -46.8), yaw: 0 },
});

function placeAtCheckpoint(id) {
  const pose = CHECKPOINT_POSITIONS[id] ?? CHECKPOINT_POSITIONS.approach;
  player.position.copy(pose.at).setY(1.66);
  player.yaw = pose.yaw;
  player.pitch = -0.05;
  player.velocity.set(0, 0, 0);
  player.ground = 0;
  player.eyeHeight = 1.66;
  player.update(0);
}

function stageWorldForCheckpoint(id) {
  const progress = mission.snapshot();
  if (id !== 'approach') {
    palace.doors.openServiceGate();
    state.powerCut = true;
  }
  if (['estate', 'betrayal', 'dining_room', 'clear'].includes(id)) palace.doors.openEstateDoor();
  for (const [evidenceId, target] of Object.entries(palace.evidence)) {
    if (!progress.evidenceFound.includes(evidenceId)) continue;
    target.userData.collected = true;
    target.traverse((node) => {
      if (node.isMesh && node.material?.emissive) node.material.emissiveIntensity = 0;
    });
  }
  if (progress.alarmRaised) security.raiseAlarm(progress.alarmReason ?? 'detected');
  if (['dining_room', 'clear'].includes(id)) {
    palace.doors.openDiningRoom();
    security.activateFinalEncounter();
    ui.boss.classList.remove('hidden');
  }
  if (progress.markEliminated) {
    cast.mark.actor.health = 0;
    cast.mark.actor.incapacitated = true;
    cast.markDown(cast.mark);
  }
  if (progress.sauceEliminated) {
    cast.sauce.actor.health = 0;
    cast.sauce.actor.incapacitated = true;
    cast.markDown(cast.sauce);
  }
  if (progress.markEliminated && progress.sauceEliminated) {
    ui.boss.classList.add('hidden');
  }
  placeAtCheckpoint(id);
  repaintEvidence();
}

function restoreMissionProgress() {
  const progress = previewCheckpoint
    ? previewSnapshotForCheckpoint(previewCheckpoint)
    : campaignStory.mission;
  const checkpoint = progress?.checkpoint;
  if (checkpoint && mission.restore({ ...progress, status: 'in_progress' })) {
    const restoredCheckpoint = mission.beat;
    stageWorldForCheckpoint(restoredCheckpoint);
    state.lastCheckpoint = restoredCheckpoint;
    return restoredCheckpoint;
  }
  mission.begin();
  persistCheckpoint('approach');
  stageWorldForCheckpoint('approach');
  return 'approach';
}

/* ------------------------------------------------------------------ */
/* Start, pause, input and exit                                        */
/* ------------------------------------------------------------------ */

function requestGamePointerLock() {
  try {
    const pending = canvas.requestPointerLock?.();
    pending?.catch?.(() => {});
  } catch {
    // Embedded preview surfaces can deny pointer lock and still run the scene.
  }
}

const pauseMenu = createPauseMenu({
  title: 'Cartel Palace',
  instructions: [
    'WASD move · Shift sprint · C crouch · Space jump · mouse look',
    'E interacts and performs a quiet takedown when a guard is unaware',
    'Click fires · R reloads · 1–5 selects the final-raid loadout · Q stows it',
    'Cutting power shortens guard sight. Gunfire ends the clean route.',
  ],
  getObjective: () => state.objective,
  canPause: () => state.phase === 'active',
  onPause: () => {
    state.paused = true;
    player.enabled = false;
    player.clearKeys();
    weapons.setTrigger(false);
    interaction.setPaused(true);
  },
  onResume: () => {
    state.paused = false;
    interaction.setPaused(false);
    player.enabled = true;
    requestGamePointerLock();
  },
  recovery: createCampaignSceneRecovery({
    campaign,
    sceneId: SCENE_IDS.CARTEL_PALACE,
    location,
    restartCheckpoint: () => location.reload(),
    canRestartCheckpoint: () => Boolean(campaignStory.mission.checkpoint),
  }),
});

startButton.addEventListener('click', async () => {
  const entry = campaignStory.begin();
  if (!entry.ok) {
    if (entry.reason === 'already_complete') {
      ending.classList.remove('hidden');
      overlay.classList.add('hidden');
      return;
    }
    startButton.disabled = true;
    startButton.textContent = 'Scene unavailable';
    overlay.querySelector('.tag').textContent = 'Finish the repaired-mansion briefing before approaching Mark\'s estate.';
    return;
  }
  if (campaign.state.scene.id !== SCENE_IDS.CARTEL_PALACE) {
    campaign.enter(SCENE_IDS.CARTEL_PALACE, { spawn: 'approach' });
  }
  startButton.disabled = true;
  startButton.textContent = 'Loading final operation…';
  await audio.init();
  await audio.loadManifest({
    prefixes: ['weapon.', 'footstep.'],
    names: [
      'ambience.rain', 'ambience.city.night', 'alarm.chirp',
      'door.creak', 'door.locked', 'heist.bullet.impact',
    ],
  });
  audio.startLoop('palace-night', { name: 'ambience.rain', volume: 0.052, ambience: true, fade: 1.4 });
  restoreMissionProgress();
  state.phase = 'active';
  interaction.setPaused(false);
  player.enabled = true;
  inventoryBar.show();
  loadout.apply(weapons);
  syncLoadout();
  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  requestGamePointerLock();
});

retryButton.addEventListener('click', () => location.reload());
addEventListener('pagehide', () => loadout.capture(weapons));

initiationButton.addEventListener('click', () => {
  if (campaign.state.missions[MISSION_IDS.CARTEL_PALACE].status !== 'complete') return;
  campaign.update((next) => {
    next.missions[MISSION_IDS.INITIATION].status = 'in_progress';
  });
  navigateCampaign(campaign, SCENE_IDS.INITIATION, { spawn: 'gathering', location });
});

document.addEventListener('pointerlockchange', () => {
  if (state.phase === 'active' && !state.paused) {
    player.enabled = document.pointerLockElement === canvas;
  }
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas) player.handleMouseMove(event.movementX, event.movementY);
});
document.addEventListener('keydown', (event) => {
  if (state.phase !== 'active' || state.paused) return;
  if (event.code === 'Space') event.preventDefault();
  player.setKey(event.code, true);
  if (event.code === 'KeyE' && !event.repeat) interaction.press();
  if (event.code === 'KeyR' && !event.repeat) weapons.reload();
  if (event.code === 'KeyQ' && !event.repeat) {
    loadout.stow(weapons);
    syncLoadout();
  }
  if (event.code === 'KeyB' && !event.repeat) hud.toast(postfx.toggle() ? 'Bloom on' : 'Bloom off', 'good');
  if (/^Digit[1-5]$/.test(event.code) && !event.repeat) {
    loadout.select(Number(event.code.slice(-1)) - 1, weapons);
    syncLoadout();
  }
});
document.addEventListener('keyup', (event) => {
  player.setKey(event.code, false);
  if (event.code === 'KeyE') interaction.release();
});
document.addEventListener('mousedown', (event) => {
  if (event.button === 0 && state.phase === 'active' && !state.paused
    && document.pointerLockElement === canvas) weapons.setTrigger(true);
});
document.addEventListener('mouseup', (event) => {
  if (event.button === 0) weapons.setTrigger(false);
});
canvas.addEventListener('click', () => {
  if (state.phase === 'active' && !state.paused && document.pointerLockElement !== canvas) {
    requestGamePointerLock();
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  postfx.setSize(innerWidth, innerHeight);
});

function updateStealth() {
  const live = cast.guards.filter((guard) => guard.active && !guard.down);
  const awareness = live.length ? Math.max(...live.map((guard) => guard.awareness)) : 0;
  ui.stealthFill.style.width = `${Math.round(awareness * 100)}%`;
  ui.stealthState.textContent = security.alarm ? 'ALARM' : awareness > 0.72 ? 'SEEN'
    : awareness > 0.28 ? 'SUSPICIOUS' : 'UNSEEN';
}

function updateAmmo() {
  const shot = weapons.hud();
  ui.ammo.classList.toggle('hidden', !shot);
  if (!shot) return;
  ui.ammoName.textContent = shot.name;
  ui.ammoMag.textContent = String(shot.rounds);
  ui.ammoReserve.textContent = String(shot.reserve);
  ui.ammoState.textContent = shot.state === 'ready' ? '' : shot.state.toUpperCase();
}

function updateBoss() {
  if (ui.boss.classList.contains('hidden')) return;
  const mark = cast.mark.actor;
  ui.bossArmor.style.width = `${Math.round(mark.armor / 170 * 100)}%`;
  ui.bossLife.style.width = `${Math.round(mark.health / mark.maxHealth * 100)}%`;
  ui.bossState.textContent = mark.incapacitated ? 'DOWN' : mark.armor > 0 ? 'ARMORED' : 'EXPOSED';
}

let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  if (state.phase === 'active' && !state.paused) {
    player.update(dt);
    interaction.update(dt);
    security.update(dt, {
      playerPosition: player.position,
      powerCut: state.powerCut,
      crouching: player.crouching,
      finalEncounter: mission.beat === PALACE_BEATS.DINING_ROOM,
    });
    weapons.update(dt, { speed: Math.hypot(player.velocity.x, player.velocity.z) });
    tracers.update(dt);
    updateStealth();
    updateAmmo();
    updateBoss();
  } else {
    player.update(dt);
    tracers.update(dt);
  }
  postfx.render();
  postfx.sample(dt);
}
requestAnimationFrame(animate);

window.CARTEL_PALACE = {
  campaignStory,
  mission,
  player,
  interaction,
  palace,
  cast,
  security,
  weapons,
  loadout,
  loadoutStorageKey: FINAL_ARC_LOADOUT_STORAGE_KEY,
  renderer,
  get phase() { return state.phase; },
  get campaignState() { return campaign.state; },
  get checkpoint() { return state.lastCheckpoint; },
  snapshot: () => mission.snapshot(),
  evidence: () => Object.fromEntries(Object.entries(palace.evidence).map(([id, target]) => [id, target.userData.collected === true])),
  geometry: () => ({ ...palace.inspectEnvironment(), drawCalls: renderer.info.render.calls }),
};

window.__squatchSceneReady?.('CARTEL PALACE ready');
setTimeout(() => loading.classList.add('out'), 170);
setTimeout(() => loading.remove(), 780);
