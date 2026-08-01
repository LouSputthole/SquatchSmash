import * as THREE from 'three';
import { AudioEngine } from '../core/audio.js';
import { CombatActor } from '../core/combat/actors.js';
import { resolveBallisticHits } from '../core/combat/ballistics.js';
import { FACTIONS, FactionMatrix } from '../core/combat/factions.js';
import { SuppressionModel } from '../core/combat/suppression.js';
import { WeaponController } from '../core/combat/weapon.js';
import {
  CHARACTER_IDS, MISSION_IDS, SCENE_IDS, TIME_EVENT_IDS,
  createCampaign, navigateCampaign,
} from '../core/campaign.js';
import { createBankHeistStory } from '../core/bank-heist-story.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import {
  installPreviewNotice, isPreviewMode, previewCheckpointForLocation,
  previewDifficultyForLocation,
} from '../core/preview-mode.js';
import { FixedStepRunner } from '../core/vehicles/fixed-step.js';
import { GroundVehicle } from '../core/vehicles/ground-vehicle.js';
import { buildHeistCrew, HEIST_CREW_IDS, setCrewMasked, updateCrew } from './cast.js';
import { CheckpointDirector } from './checkpoints.js';
import {
  HEIST_STATES, PERFORMANCE_BUDGET, PHASE_FOR_STATE, PREVIEW_START_STATE,
} from './config.js';
import { CivilianController } from './civilians.js';
import { DialogueArbiter } from './dialogue.js';
import { HeistHud } from './hud.js';
import { intersectsDrivingObstacle } from './geometry.js';
import { buildHeistLevel } from './level.js';
import { createHeistBags, LootLedger } from './loot.js';
import { HeistMissionMachine } from './mission.js';
import { AuthoredNavigationGraph, SquadDirector } from './navigation.js';
import { PoliceDirector } from './police.js';
import { HEIST_DIALOGUE, dialogueLine } from './script.js';

const HEIST_VOICE_CUES = Object.freeze(Object.values(HEIST_DIALOGUE).map((line) => line.cue));

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101419);
scene.fog = new THREE.FogExp2(0x11161b, 0.018);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 260);
scene.add(new THREE.HemisphereLight(0x9fa9b1, 0x29251f, 1.35));
const keyLight = new THREE.DirectionalLight(0xffe7bd, 2.4);
keyLight.position.set(8, 18, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1536, 1536);
scene.add(keyLight);
const emergency = new THREE.PointLight(0xc6353d, 0, 24, 2);
scene.add(emergency);

const hud = new HeistHud();
const audio = new AudioEngine();
const campaign = createCampaign();
campaign.enter(SCENE_IDS.BANK_HEIST);
const story = createBankHeistStory({ campaign });
const level = buildHeistLevel(scene);
const player = new Player(camera, level.world);
player.mode = 'walk';
player.position.set(0, 1.66, 4);
const interaction = new InteractionSystem(camera, hud);
const factionMatrix = new FactionMatrix();
const playerActor = new CombatActor({
  id: CHARACTER_IDS.PROSPECT,
  faction: FACTIONS.CREW,
  maxHealth: 100,
  armor: 35,
});
const weapon = new WeaponController({
  name: 'CONTROLLED', magazineSize: 20, reserveMagazines: 4,
  roundsPerSecond: 8.6, reloadSeconds: 1.9, recoilPerShot: 0.13,
  damage: 42, penetration: 0.38,
});
const suppression = new SuppressionModel();
const loot = new LootLedger(createHeistBags());
const police = new PoliceDirector({
  bank_avenue: { budget: 8, gates: ['north', 'east', 'cruisers'] },
  market_street: { budget: 7, gates: ['alley', 'scaffold', 'loading'] },
  mercer_garage: { budget: 6, gates: ['ramp', 'stairs'] },
});
const civilians = Array.from({ length: 16 }, (_, index) => new CivilianController({
  id: `civilian_${index + 1}`, nerve: 0.18 + (index % 5) * 0.12, anchor: `lobby_${index + 1}`,
}));
const vehicle = new GroundVehicle({
  acceleration: 4.8,
  maxForwardSpeed: 11,
  maxReverseSpeed: 5,
});
vehicle.x = 0;
vehicle.z = 18;
vehicle.heading = Math.PI;
const fixedStep = new FixedStepRunner({ hz: 120, maxSteps: 8 });
const checkpoints = new CheckpointDirector();
const crew = buildHeistCrew(level.phases.safehouse.group);
const SQUAD_FORMATIONS = Object.freeze({
  safehouse: Object.freeze([[-3.4, -1.2], [-1.7, -2.4], [0, -2.6], [1.8, -2.3], [3.5, -1.1]]),
  van: Object.freeze([[-1.15, 1.45], [1.15, 1.2], [-1.15, 0], [1.15, -0.25], [0, -1.45]]),
  bank: Object.freeze([[-4, 2], [-6, -2], [0, -4], [4, 2], [6, -1]]),
  street: Object.freeze([[-3, 25], [0, 22], [3, 21], [-4, 18], [4, 17]]),
  garage: Object.freeze([[-4, 8], [-2, 6], [0, 5], [3, 7], [5, 5]]),
  driving: Object.freeze([[16, -649], [18, -651], [20, -653], [22, -651], [24, -649]]),
});
const squadAnchorPositions = new Map();
const squadAnchorIds = Object.entries(SQUAD_FORMATIONS).flatMap(([zone, positions]) => (
  positions.map((position, index) => {
    const id = `${zone}_${index}`;
    squadAnchorPositions.set(id, position);
    return id;
  })
));
const squadGraph = new AuthoredNavigationGraph(Object.entries(SQUAD_FORMATIONS).flatMap(([zone, positions]) => (
  positions.map((position, index) => ({
    id: `${zone}_${index}`,
    zone,
    neighbors: squadAnchorIds.filter((id) => id !== `${zone}_${index}`),
    recovery: index === positions.length - 1,
  }))
)));
for (const [index, actor] of [...crew.values()].entries()) {
  actor.anchor = `safehouse_${index}`;
  squadGraph.occupy(actor.anchor, actor.id);
}
const squad = new SquadDirector({ graph: squadGraph, actors: crew });

const machine = new HeistMissionMachine({
  onTransition: ({ to }) => {
    dialogue.setState(to);
    hud.setPhase(PHASE_FOR_STATE[to] ?? 'MISSION');
    window.__heistDebug.state = to;
  },
});

const sceneInventory = new SceneInventoryBar({
  slots: 5,
  visible: false,
  catalog: {
    carbine: { icon: '▰', name: 'Controlled carbine' },
    sidearm: { icon: '⌐', name: 'Sidearm' },
    magazines: { icon: '▥', name: 'Loaded magazines' },
    duffel: { icon: '▣', name: 'Cash duffel' },
    cash_bag: { icon: '$', name: 'Cash bag' },
    keys: { icon: '⌁', name: 'Escape-car keys' },
  },
});

let dialogueEndAt = 0;
let activeDialogueSource = null;
const dialogue = new DialogueArbiter({
  onStart(line) {
    try { activeDialogueSource?.stop?.(); } catch { /* already ended */ }
    const duration = audio.sampleDuration(line.cue) ?? line.fallbackDuration;
    hud.say(line, duration);
    activeDialogueSource = audio.hasSample(line.cue)
      ? audio.play(line.cue, { volume: 0.85 })
      : null;
    dialogueEndAt = performance.now() / 1000 + duration;
  },
});
dialogue.setState(machine.state);

let started = false;
let armorReady = false;
let loadoutReady = false;
let lobbyControlled = false;
let rearGuardSecured = false;
let bankBagsStaged = 0;
let carryingBag = null;
let droppedBagDecision = null;
let officersDown = 0;
let policeMeshes = [];
let driving = false;
let roadblockHit = false;
let routeIndex = 0;
let offroadHitCooldown = 0;
let driveCollisionCooldown = 0;
let driveInvalidFor = 0;
let driveStuckFor = 0;
let inventorySignature = '';

function syncHeistInventory() {
  const items = [
    'carbine',
    'sidearm',
    'magazines',
    carryingBag ? 'cash_bag' : 'duffel',
    driving ? 'keys' : null,
  ];
  const signature = items.join('|');
  if (signature === inventorySignature) return;
  inventorySignature = signature;
  sceneInventory.set(items, 0);
}
let drivingRecovery = false;
let policeFireClock = 0.8;
const swapProgress = {
  trunk: false, bags: false, aid: false, masks: false,
  jackets: false, weapons: false, wiped: false,
};
let latestCheckpoint = null;
let activePhase = null;
let missionCompleted = false;
let simulationPaused = false;
const activeEffects = [];
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const lineOfSightRaycaster = new THREE.Raycaster();
const muzzle = new THREE.PointLight(0xffc35c, 0, 4, 2);
camera.add(muzzle);
const impactPool = Array.from({ length: Math.min(32, PERFORMANCE_BUDGET.maxImpactParticles) }, () => {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 5, 4),
    new THREE.MeshBasicMaterial({ color: 0xd7c29b }),
  );
  mesh.visible = false;
  mesh.userData.life = 0;
  scene.add(mesh);
  return mesh;
});
const casingPool = Array.from({ length: Math.min(24, PERFORMANCE_BUDGET.maxCasings) }, () => {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.07, 5),
    new THREE.MeshBasicMaterial({ color: 0xc7a455 }),
  );
  mesh.visible = false;
  mesh.userData.life = 0;
  scene.add(mesh);
  return mesh;
});

window.__heistDebug = {
  state: machine.state,
  phase: null,
  preview: isPreviewMode(),
  difficulty: previewDifficultyForLocation(),
  crewIds: HEIST_CREW_IDS,
  crewHuman: [...crew.values()].every((actor) => actor.identity.species === 'human'),
  policeActive: 0,
  policeSpawned: 0,
  fixedSteps: 0,
  poolUsage: { police: 0, effects: 0 },
  checkpoint: null,
  consoleErrors: [],
  start: () => begin(),
  use: (name) => debugUse(name),
  neutralizePolice: () => debugNeutralizePolice(),
  driveToNextNode: () => debugDriveToNextNode(),
  forceDriveRecovery: () => debugForceDriveRecovery(),
  poseForEvidence: (name) => debugPoseForEvidence(name),
  probeCollision: () => debugProbeCollision(),
  fail: (reason = 'verifier_failure') => failMission(reason),
  snapshot: () => debugSnapshot(),
};

function debugProbeCollision() {
  const collider = level.world.colliders[0];
  if (!collider) return { available: false };
  const original = player.position.clone();
  player.position.set(
    (collider.min.x + collider.max.x) / 2,
    1.66,
    (collider.min.z + collider.max.z) / 2,
  );
  player._resolve('x');
  const cx = Math.max(collider.min.x, Math.min(collider.max.x, player.position.x));
  const cz = Math.max(collider.min.z, Math.min(collider.max.z, player.position.z));
  const distance = Math.hypot(player.position.x - cx, player.position.z - cz);
  player.position.copy(original);
  player.velocity.set(0, 0, 0);
  return { available: true, resolved: distance >= 0.299 };
}

/** Deterministic camera marks used only by browser evidence capture. */
function debugPoseForEvidence(name) {
  const poses = {
    bank_exit: { phase: 'street', position: [-4, 1.66, 28], yaw: -2.5536 },
    downtown_firefight: { phase: 'street', position: [0, 1.66, 27], yaw: 0 },
    vehicle_swap: { phase: 'driving', position: [14, 1.66, -657], yaw: -2.158 },
  };
  const pose = poses[name];
  if (!pose || activePhase !== pose.phase) return false;
  player.position.fromArray(pose.position);
  player.velocity.set(0, 0, 0);
  player.yaw = pose.yaw;
  player.pitch = 0;
  player.update(1 / 60);
  return true;
}

function debugUse(name) {
  const target = interaction.targets.find((mesh) => mesh.name === name);
  if (!target) return { ok: false, reason: 'missing_target', names: interaction.targets.map((mesh) => mesh.name) };
  const descriptor = target.userData.interact;
  if (descriptor.enabled && !descriptor.enabled()) return { ok: false, reason: 'disabled' };
  descriptor.onUse?.(target);
  return { ok: true, state: machine.state };
}

function debugNeutralizePolice() {
  let removed = 0;
  for (const mesh of activePoliceMeshes()) {
    if (!mesh.visible) continue;
    mesh.visible = false;
    mesh.userData.combatActor.incapacitated = true;
    mesh.userData.combatActor.health = 0;
    police.remove(mesh.userData.block);
    removed++;
  }
  officersDown += removed;
  window.__heistDebug.policeActive = 0;
  refreshInteractions();
  return removed;
}

function debugDriveToNextNode() {
  if (!driving) return { ok: false, reason: 'not_driving' };
  const target = level.phases.driving.route[routeIndex];
  if (!target) return { ok: false, reason: 'route_complete' };
  vehicle.x = target.x + (target.id === 'roadblock' ? 4.5 : 0);
  vehicle.z = target.z;
  vehicle.speed = 5;
  updateDriving(1 / 30);
  return { ok: true, node: target.id, state: machine.state };
}

function debugForceDriveRecovery() {
  if (!driving) return { ok: false, reason: 'not_driving' };
  vehicle.x = 999;
  vehicle.z = 999;
  driveInvalidFor = 5;
  updateDriving(1 / 30);
  return { ok: drivingRecovery, x: vehicle.x, z: vehicle.z };
}

function debugSnapshot() {
  const hotbar = document.getElementById('hotbar');
  const heistPlaybacks = audio.playbacks.filter((entry) => HEIST_VOICE_CUES.includes(entry.name));
  return {
    state: machine.state,
    phase: activePhase,
    checkpoint: latestCheckpoint,
    health: playerActor.health,
    bags: loot.summary(),
    carryingBag,
    bankBagsStaged,
    officersDown,
    policeActive: activePoliceMeshes().length,
    policeTotal: policeMeshes.length,
    routeIndex,
    vehicle: vehicle.snapshot(),
    swap: { ...swapProgress },
    squadAnchors: { ...window.__heistDebug.squadAnchors },
    audioZone,
    missionCompleted,
    simulationPaused,
    inventory: {
      slots: hotbar?.children.length ?? 0,
      declared: hotbar?.dataset.slotCount ?? null,
      visible: !!hotbar && !hotbar.classList.contains('hidden'),
      items: [...sceneInventory.items],
    },
    voice: {
      authored: HEIST_VOICE_CUES.length,
      decoded: HEIST_VOICE_CUES.filter((cue) => audio.hasSample(cue)).length,
      longest: Math.max(0, ...HEIST_VOICE_CUES.map((cue) => audio.sampleDuration(cue) ?? 0)),
      lastPlayback: heistPlaybacks.at(-1)
        ? {
          name: heistPlaybacks.at(-1).name,
          duration: heistPlaybacks.at(-1).decodedDuration,
          naturalEnd: heistPlaybacks.at(-1).naturalEnd,
        }
        : null,
      subtitleRemaining: Math.max(0, dialogueEndAt - performance.now() / 1000),
    },
    geometry: {
      colliders: level.world.colliders.length,
      floorZones: level.world.floorZones.length,
      bankCivilians: level.phases.bank.civilians.length,
    },
    civilianStates: civilians.map((civilian) => civilian.state),
    campaignMission: campaign.state.missions[MISSION_IDS.BANK_HEIST],
    campaignState: campaign.state,
  };
}

function say(id) {
  const line = dialogueLine(id);
  if (line) dialogue.push(line);
}

function emitFromPool(pool, position, life, velocity) {
  const mesh = pool.find((item) => !item.visible);
  if (!mesh) return false;
  mesh.visible = true;
  mesh.position.copy(position);
  mesh.userData.life = life;
  mesh.userData.velocity = velocity;
  window.__heistDebug.poolUsage.effects = impactPool.filter((item) => item.visible).length
    + casingPool.filter((item) => item.visible).length;
  return true;
}

function emitImpact(position) {
  emitFromPool(impactPool, position, 0.32, new THREE.Vector3(0, 0.35, 0));
}

function emitCasing() {
  const position = camera.getWorldPosition(new THREE.Vector3());
  const right = new THREE.Vector3(1, 0.35, 0).applyQuaternion(camera.quaternion).multiplyScalar(0.8);
  emitFromPool(casingPool, position, 1.2, right);
}

function updateEffectPools(dt) {
  const update = (mesh) => {
    if (!mesh.visible) return;
    mesh.userData.life -= dt;
    if (mesh.userData.life <= 0) {
      mesh.visible = false;
      return;
    }
    mesh.position.addScaledVector(mesh.userData.velocity, dt);
    mesh.userData.velocity.y -= 4.5 * dt;
  };
  for (const mesh of impactPool) update(mesh);
  for (const mesh of casingPool) update(mesh);
}

let audioZone = null;
function setAudioZone(id) {
  if (audioZone === id) return;
  if (audioZone) {
    audio.stopLoop(`heist.ambience.${audioZone}`, 0.8);
    if (['street', 'garage', 'driving'].includes(audioZone)) audio.stopLoop('heist.police.sirens', 0.6);
  }
  audioZone = id;
  audio.startLoop(`heist.ambience.${id}`, { volume: id === 'safehouse' ? 0.12 : 0.2, ambience: true, fade: 0.8 });
  if (['street', 'garage', 'driving'].includes(id)) {
    audio.startLoop('heist.police.sirens', { volume: 0.16, ambience: true, fade: 0.5 });
  }
}

function phaseIdForState(state) {
  const phase = PHASE_FOR_STATE[state];
  return ['safehouse', 'van', 'bank', 'street', 'garage', 'driving'].includes(phase)
    ? phase : 'safehouse';
}

function placeCrew(phaseId) {
  const phase = level.phases[phaseId] ?? level.phases.safehouse;
  for (const actor of crew.values()) {
    phase.group.add(actor.group);
    squad.assign(actor.id, phaseId);
    const [x, z] = squadAnchorPositions.get(actor.anchor);
    actor.group.position.set(x, 0, z);
  }
  window.__heistDebug.squadAnchors = Object.fromEntries(
    [...crew.values()].map((actor) => [actor.id, actor.anchor]),
  );
}

function activatePhase(id, preservePlayer = false) {
  if (activePhase === id) return level.phases[id];
  const phase = level.activate(id);
  activePhase = id;
  placeCrew(id);
  if (!preservePlayer) {
    player.position.copy(phase.spawn);
    player.velocity.set(0, 0, 0);
    player.yaw = 0;
    player.pitch = 0;
  }
  window.__heistDebug.phase = id;
  interaction.setOccluders([phase.group]);
  window.__heistDebug.policeActive = activePoliceMeshes().length;
  setAudioZone(id);
  refreshInteractions();
  return phase;
}

function clearInteractions() {
  for (const target of [...interaction.targets]) interaction.unregister(target);
}

function use(mesh, label, onUse, options = {}) {
  if (!mesh) return;
  interaction.register(mesh, {
    label, key: options.key ?? 'E', hold: options.hold,
    enabled: options.enabled, onUse,
  });
}

function stateIndex(name) { return HEIST_STATES.indexOf(name); }

function advanceTo(target) {
  while (machine.state !== target && machine.state !== 'FAILED') {
    const next = HEIST_STATES[stateIndex(machine.state) + 1];
    if (!next || !machine.advance(next)) return false;
  }
  refreshInteractions();
  return true;
}

function recordCheckpoint(id, resumeState, facts = {}) {
  if (!story.checkpoint(id, facts)) return false;
  latestCheckpoint = id;
  checkpoints.capture(id, { state: resumeState, phase: phaseIdForState(resumeState) });
  window.__heistDebug.checkpoint = id;
  return true;
}

function startVanRide() {
  advanceTo('VAN_APPROACH');
  activatePhase('van');
  player.mode = 'walk';
  player.moveScale = 0;
  hud.setObjective('Stay seated. Pull the mask into position when Snow gives the word.');
  say('rippin_two_lights');
  say('snow_time');
}

function enterBank() {
  advanceTo('BANK_ENTRY');
  activatePhase('bank');
  hud.setObjective('Follow Snow. Aim at the visible guard and press E.');
  say('snow_guard');
}

function beginStreet() {
  advanceTo('BANK_DOOR_CONTACT');
  activatePhase('street');
  spawnPolice('bank_avenue', 5);
  hud.setObjective('Break contact from the bank steps. Reach the van together.');
  say('snow_contact');
  say('death_suppress');
  recordCheckpoint('street_withdrawal', 'STREET_BLOCK_ONE', {
    primaryVanLost: true, policeHeat: 55,
  });
}

function enterGarage() {
  if (!droppedBagDecision) {
    droppedBagDecision = 'abandoned';
    loot.abandon('cash_8');
    if (machine.state === 'STREET_BLOCK_TWO') advanceTo('DROPPED_BAG_DECISION');
    say('snow_leave_it');
  }
  if (carryingBag) {
    loot.drop(carryingBag, { anchor: 'garage_entry', position: { x: 0, y: 0.3, z: 10 } });
    carryingBag = null;
  }
  advanceTo('GARAGE_ENTRY');
  activatePhase('garage');
  officersDown = 0;
  spawnPolice('mercer_garage', 4);
  recordCheckpoint('mercer_garage', 'GARAGE_HOLD', {
    bagsRecovered: loot.summary().recoveredBags,
    droppedBagRecovered: droppedBagDecision === 'recovered',
    crewInjuries: { [CHARACTER_IDS.RIPPINFLOW]: 'moderate' },
  });
  hud.setObjective('Hold the garage entrance. Clear a lane to the secondary car.');
}

function beginDriving() {
  advanceTo('PLAYER_TAKES_WHEEL');
  activatePhase('driving');
  driving = true;
  routeIndex = 0;
  interaction.setPaused(true);
  player.mode = 'frozen';
  hud.setDriving(true, 0, 'LEFT OUT — WAREHOUSE DISTRICT');
  hud.setObjective('Drive the secondary car to the canal-side swap.');
  say('rippin_drive');
}

function reachSwap() {
  driving = false;
  vehicle.setInput();
  advanceTo('VEHICLE_SWAP');
  player.mode = 'walk';
  player.position.set(20, 1.66, -650);
  player.yaw = 0;
  interaction.setPaused(false);
  hud.setDriving(false);
  hud.setObjective('Transfer cash, remove the outer layer, and bag the weapons.');
  say('shubes_swap');
  refreshInteractions();
}

function returnSafehouse() {
  recordCheckpoint('vehicle_swap', 'SAFEHOUSE_RETURN', {
    playerDroveEscape: true,
    vehicleDamage: vehicle.collisionDamage,
  });
  advanceTo('SAFEHOUSE_RETURN');
  activatePhase('safehouse');
  setCrewMasked(crew, false);
  crew.get(CHARACTER_IDS.RIPPINFLOW).injury = 'moderate';
  hud.setObjective('Let the room breathe. Help Rippin, then count the take.');
  say('snow_return');
}

function showMissionCard() {
  const summary = loot.summary();
  const mission = campaign.state.missions[MISSION_IDS.BANK_HEIST];
  const card = document.getElementById('mission-card');
  card.innerHTML = `
    <h1>THE TAKE</h1>
    <p>${campaign.state.missions[MISSION_IDS.BANK_HEIST].outcome.replaceAll('_', ' ').toUpperCase()}</p>
    <table>
      <tr><td>Expected take</td><td>$1,470,000</td></tr>
      <tr><td>Gross recovered</td><td>$${summary.grossRecovered.toLocaleString()}</td></tr>
      <tr><td>Compromised cash</td><td>$${summary.compromisedCash.toLocaleString()}</td></tr>
      <tr><td>Operational loss</td><td>$${mission.operationalLoss.toLocaleString()}</td></tr>
      <tr><td>Family share</td><td>$${mission.familyShare.toLocaleString()}</td></tr>
      <tr><td>Crew share</td><td>$${mission.crewShare.toLocaleString()}</td></tr>
      <tr><td>Prospect share</td><td>$${mission.prospectShare.toLocaleString()}</td></tr>
      <tr><td>Bags recovered</td><td>${summary.recoveredBags} / 8</td></tr>
      <tr><td>Crew</td><td>ALL SIX HOME</td></tr>
    </table>
    <button id="return-home">RETURN TO APARTMENT</button>`;
  card.classList.remove('hidden');
  document.getElementById('return-home').addEventListener('click', () => {
    navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door' });
  });
}

function completeMission() {
  const summary = loot.summary();
  const completed = story.complete({
    bagsStaged: bankBagsStaged,
    bagsRecovered: summary.recoveredBags,
    grossTake: summary.grossRecovered,
    compromisedCash: summary.compromisedCash,
    crewInjuries: { [CHARACTER_IDS.RIPPINFLOW]: 'moderate' },
    optionalVaultBagTaken: droppedBagDecision === 'recovered',
    followedSnow: true,
    disciplinedFire: true,
  });
  if (!completed) return;
  advanceTo('SCENE_COMPLETE');
  missionCompleted = true;
  showMissionCard();
}

function refreshInteractions() {
  clearInteractions();
  if (!started || driving) return;
  const state = machine.state;
  const p = level.phases;

  if (activePhase === 'safehouse' && stateIndex(state) < stateIndex('BOARD_VAN')) {
    use(p.safehouse.interactables.briefing,
      state === 'CREW_INTRO' ? 'Gather for Snow’s briefing' : 'Review the route with Snow', () => {
        if (state === 'CREW_INTRO') {
          advanceTo('BRIEFING'); say('snow_plan'); say('snow_rules'); say('rippin_route');
          hud.setObjective('Inspect the plan, then prepare the loadout.');
        } else if (machine.state === 'BRIEFING') {
          advanceTo('LOADOUT'); say('shubes_case'); say('death_bags'); say('numb_alarm');
          hud.setObjective('Put on armor and check the carbine.');
        }
      });
    use(p.safehouse.interactables.armor, armorReady ? 'Armor secured' : 'Put on concealable armor', () => {
      armorReady = true; audio.play('heist.armor.strap'); refreshInteractions();
    }, { enabled: () => machine.state === 'LOADOUT' && !armorReady });
    use(p.safehouse.interactables.loadout, loadoutReady ? 'Carbine ready' : 'Check carbine and magazines', () => {
      loadoutReady = true; audio.play('heist.weapon.check'); hud.setAmmo(weapon.magazine, weapon.reserveMagazines * 20, 'CONTROLLED'); refreshInteractions();
    }, { enabled: () => machine.state === 'LOADOUT' && !loadoutReady });
    use(p.safehouse.interactables.van, 'Board the primary van', () => {
      if (!armorReady || !loadoutReady || machine.state !== 'LOADOUT') return;
      advanceTo('BOARD_VAN');
      say('prospect_ready');
      startVanRide();
      recordCheckpoint('safehouse_ready', 'VAN_APPROACH');
    }, { enabled: () => armorReady && loadoutReady && machine.state === 'LOADOUT' });
    return;
  }

  if (activePhase === 'van' && ['VAN_APPROACH', 'MASKS_ON'].includes(state)) {
    use(p.van.interactables.van,
      state === 'VAN_APPROACH' ? 'Pull mask into position' : 'Open the van doors', () => {
        if (machine.state === 'VAN_APPROACH') {
          advanceTo('MASKS_ON'); setCrewMasked(crew, true); say('shubes_loop'); say('death_breathe');
          hud.setObjective('Masks on. Wait for the doors.');
        } else {
          advanceTo('CREW_EXIT'); enterBank();
        }
      });
    return;
  }

  if (activePhase === 'bank') {
    use(p.bank.interactables.guard, state === 'BANK_ENTRY' ? 'ORDER GUARD DOWN' : 'Guard secured', () => {
      if (machine.state !== 'BANK_ENTRY') return;
      advanceTo('LOBBY_CONTROL');
      hud.setObjective('Support DeathMegatron. Order the lobby down.');
      say('death_floor');
    });
    use(p.bank.interactables.crowd, 'ORDER LOBBY DOWN', () => {
      if (machine.state !== 'LOBBY_CONTROL' || lobbyControlled) return;
      for (const [index, civilian] of civilians.entries()) {
        const nextState = civilian.command({ aim: 1, distance: 4, groupControl: 0.9 });
        p.bank.civilians[index]?.userData.setState?.(nextState);
      }
      lobbyControlled = true;
      hud.setObjective('Stop the second guard from reaching the rear hallway.');
      refreshInteractions();
    }, { enabled: () => machine.state === 'LOBBY_CONTROL' && !lobbyControlled });
    use(p.bank.interactables.rearGuard, rearGuardSecured ? 'Rear guard secured' : 'ORDER REAR GUARD DOWN', () => {
      if (machine.state !== 'LOBBY_CONTROL' || !lobbyControlled) return;
      rearGuardSecured = true;
      advanceTo('GUARDS_SECURED');
      say('numb_manager');
      hud.setObjective('Escort the bank manager to the vault corridor.');
    }, { enabled: () => machine.state === 'LOBBY_CONTROL' && lobbyControlled && !rearGuardSecured });
    use(p.bank.interactables.manager, 'Move the manager to the vault', () => {
      if (machine.state !== 'GUARDS_SECURED' || !rearGuardSecured) return;
      advanceTo('MANAGER_ESCORT');
      recordCheckpoint('bank_secured', 'MANAGER_ESCORT', { guardsDisarmed: 2, civiliansHarmed: 0 });
      hud.setObjective('Cover Shubenator while he bypasses the vault.');
    });
    use(p.bank.interactables.vault,
      state === 'MANAGER_ESCORT' ? 'Open the access panel' : 'Complete the vault bypass', () => {
        if (machine.state === 'MANAGER_ESCORT') {
          advanceTo('VAULT_BYPASS');
          say('shubes_vault');
          audio.play('heist.vault.panel');
          refreshInteractions();
        } else if (machine.state === 'VAULT_BYPASS') {
          advanceTo('CASH_LOADING');
          recordCheckpoint('vault_open', 'CASH_LOADING', { alarmTriggered: true, bagsStaged: 0 });
          hud.setObjective('Move two cash bags to the exit. The crew handles the rest.');
          say('snow_clock');
          audio.play('heist.vault.open');
        }
      }, { hold: state === 'VAULT_BYPASS' ? 1.8 : undefined });

    for (let i = 1; i <= 8; i++) {
      const bagId = `cash_${i}`;
      const bagMesh = p.bank.group.getObjectByName(`cash-${i}`);
      use(bagMesh, carryingBag ? 'Hands full' : `Take cash bag ${i}`, () => {
        if (machine.state !== 'CASH_LOADING' || carryingBag || !loot.carry(bagId, CHARACTER_IDS.PROSPECT)) return;
        carryingBag = bagId;
        bagMesh.userData.carried = true;
        hud.setBag(loot.get(bagId).value, 1);
      }, { enabled: () => machine.state === 'CASH_LOADING' && !carryingBag && !loot.get(bagId).recovered });
    }
    use(p.bank.interactables.exit,
      carryingBag ? 'Stage the carried cash bag' : (bankBagsStaged >= 8 ? 'Withdraw from the bank' : 'Cash staging point'), () => {
        if (machine.state === 'CASH_LOADING' && carryingBag) {
          const bagId = carryingBag;
          loot.drop(bagId, { anchor: 'bank_exit', position: { x: 0, y: 0.3, z: 8.8 } });
          carryingBag = null;
          bankBagsStaged++;
          p.bank.group.getObjectByName(bagId.replace('_', '-')).userData.carried = false;
          hud.setBag(0, 0);
          if (bankBagsStaged >= 2) {
            for (let i = 1; i <= 8; i++) {
              const id = `cash_${i}`;
              const bag = loot.get(id);
              if (!bag.carrier && !bag.position) loot.carry(id, i % 2 ? CHARACTER_IDS.DEATHMEGATRON : CHARACTER_IDS.NUMBSKULL);
              if (loot.get(id).carrier) loot.drop(id, { anchor: 'bank_exit', position: { x: (i - 4) * 0.4, y: 0.3, z: 8.5 } });
            }
            bankBagsStaged = 8;
            advanceTo('ALARM_DISCOVERED'); say('numb_signal'); say('rippin_street');
            advanceTo('EXIT_ORDER'); say('snow_exit');
            hud.setObjective('Take the bags and leave together.');
          }
          refreshInteractions();
        } else if (machine.state === 'EXIT_ORDER') beginStreet();
      });
    return;
  }

  if (activePhase === 'street') {
    use(p.street.interactables.bankDoor, 'Move off the bank steps', () => {
      if (machine.state === 'BANK_DOOR_CONTACT') advanceTo('STREET_BLOCK_ONE');
      hud.setObjective('Suppress the right side and reach the disabled van.');
    });
    use(p.street.interactables.van, officersDown >= 2 ? 'Reach Rippin at the van' : 'Police fire blocks the van', () => {
      if (machine.state !== 'STREET_BLOCK_ONE' || officersDown < 2) return;
      advanceTo('FALLBACK_ROUTE');
      crew.get(CHARACTER_IDS.RIPPINFLOW).injury = 'moderate';
      advanceTo('STREET_BLOCK_TWO');
      officersDown = 0;
      say('rippin_van'); say('rippin_hit'); say('snow_fallback');
      spawnPolice('market_street', 4);
      hud.setObjective('Clear the second contact, then move toward Mercer. Recover the bag only if safe.');
    });
    use(p.street.interactables.droppedBag, 'Recover the dropped bag', () => {
      if (machine.state !== 'STREET_BLOCK_TWO' || droppedBagDecision) return;
      droppedBagDecision = 'recovered';
      loot.carry('cash_8', CHARACTER_IDS.PROSPECT);
      carryingBag = 'cash_8';
      hud.setBag(loot.get('cash_8').value, 1);
      say('numb_bag');
      advanceTo('DROPPED_BAG_DECISION');
      refreshInteractions();
    });
    use(p.street.interactables.garage, 'Enter Mercer garage', () => {
      if (!['STREET_BLOCK_TWO', 'DROPPED_BAG_DECISION'].includes(machine.state) || officersDown < 2) return;
      enterGarage();
    }, { enabled: () => officersDown >= 2 });
    return;
  }

  if (activePhase === 'garage') {
    use(p.garage.interactables.hold, officersDown >= 2 ? 'Signal the loading move' : 'Hold the garage entrance', () => {
      if (machine.state === 'GARAGE_ENTRY') advanceTo('GARAGE_HOLD');
      if (machine.state === 'GARAGE_HOLD' && officersDown >= 2) {
        say('shubes_garage');
        hud.setObjective('Load cash and Rippin into the sedan.');
      }
    });
    use(p.garage.interactables.load, 'Load crew and cash into the sedan', () => {
      if (machine.state !== 'GARAGE_HOLD' || officersDown < 2) return;
      advanceTo('SECONDARY_CAR_LOAD');
      for (const record of loot.capture()) {
        if (record.abandoned || record.seized) continue;
        if (!record.carrier) loot.carry(record.id, CHARACTER_IDS.DEATHMEGATRON);
        loot.load(record.id, 'escape_sedan');
      }
      say('death_load');
      hud.setObjective('Take the wheel. Rippin will call the route.');
    });
    use(p.garage.interactables.drive, 'Take the driver seat', () => {
      if (machine.state === 'SECONDARY_CAR_LOAD') beginDriving();
    });
    return;
  }

  if (activePhase === 'driving' && state === 'VEHICLE_SWAP') {
    const allDone = Object.values(swapProgress).every(Boolean);
    use(p.driving.interactables.trunk, swapProgress.trunk ? 'Clean trunk open' : 'Open the clean car trunk', () => {
      swapProgress.trunk = true;
      audio.play('heist.swap.trunk');
      hud.setObjective('Move every recovered cash bag into the clean car.');
      refreshInteractions();
    }, { enabled: () => !swapProgress.trunk });
    use(p.driving.interactables.bags, swapProgress.bags ? 'Cash transferred' : 'Transfer the recovered bags', () => {
      if (!swapProgress.trunk) return;
      for (const bag of loot.capture()) {
        if (bag.vehicle !== 'escape_sedan') continue;
        loot.unload(bag.id, 'industrial_swap');
        loot.carry(bag.id, CHARACTER_IDS.DEATHMEGATRON);
        loot.load(bag.id, 'clean_swap_car');
      }
      swapProgress.bags = true;
      say('death_swap_bags');
      refreshInteractions();
    }, { hold: 1.4, enabled: () => swapProgress.trunk && !swapProgress.bags });
    use(p.driving.interactables.aid, swapProgress.aid ? 'Rippin stabilized' : 'Help Rippin bind the wound', () => {
      swapProgress.aid = true;
      crew.get(CHARACTER_IDS.RIPPINFLOW).injury = 'stabilized';
      say('rippin_swap_aid');
      refreshInteractions();
    }, { hold: 1.3, enabled: () => !swapProgress.aid });
    use(p.driving.interactables.masks, swapProgress.masks ? 'Masks bagged' : 'Remove and bag the masks', () => {
      swapProgress.masks = true;
      setCrewMasked(crew, false);
      audio.play('heist.swap.fabric');
      refreshInteractions();
    }, { enabled: () => !swapProgress.masks });
    use(p.driving.interactables.jackets, swapProgress.jackets ? 'Outer layers changed' : 'Change the outer jackets', () => {
      swapProgress.jackets = true;
      audio.play('heist.swap.fabric');
      refreshInteractions();
    }, { enabled: () => swapProgress.masks && !swapProgress.jackets });
    use(p.driving.interactables.weapons, swapProgress.weapons ? 'Weapons sealed' : 'Clear and bag the weapons', () => {
      swapProgress.weapons = true;
      weapon.beginReload();
      audio.play('heist.swap.weapons');
      refreshInteractions();
    }, { hold: 1.1, enabled: () => !swapProgress.weapons });
    use(p.driving.interactables.wipe, swapProgress.wiped ? 'Evidence surfaces wiped' : 'Wipe the secondary car and gear', () => {
      swapProgress.wiped = true;
      audio.play('heist.swap.wipe');
      refreshInteractions();
    }, { hold: 1.5, enabled: () => swapProgress.bags && !swapProgress.wiped });
    use(p.driving.interactables.depart, allDone ? 'Leave in the clean car' : 'Finish the evidence swap first', returnSafehouse, {
      enabled: () => Object.values(swapProgress).every(Boolean),
    });
    return;
  }

  if (activePhase === 'safehouse' && stateIndex(state) >= stateIndex('SAFEHOUSE_RETURN')) {
    use(p.safehouse.interactables.armor, 'Help wrap Rippin’s leg', () => {
      if (machine.state !== 'SAFEHOUSE_RETURN') return;
      advanceTo('FIRST_AID'); say('rippin_aid');
      hud.setObjective('Count the recovered bags with Snow.');
    }, { hold: 1.5 });
    use(p.safehouse.interactables.briefing, 'Count the take', () => {
      if (machine.state !== 'FIRST_AID') return;
      advanceTo('MONEY_COUNT');
      const summary = loot.summary();
      hud.setObjective(`${summary.recoveredBags} bags. $${summary.grossRecovered.toLocaleString()} gross. Talk it through.`);
      advanceTo('DEBRIEF');
      say('shubes_defend'); say('death_ammo'); say('numb_home'); say('snow_good');
    }, { hold: 1.8 });
    use(p.safehouse.interactables.loadout, 'Put the weapons down', () => {
      if (machine.state !== 'DEBRIEF') return;
      audio.play('heist.weapon.down');
      hud.setObjective('Answer Lou on the safehouse phone.');
    });
    use(p.safehouse.interactables.van, 'Answer Lou’s call', () => {
      if (machine.state !== 'DEBRIEF') return;
      advanceTo('LOU_CALL_SAFEHOUSE');
      say('lou_call'); say('prospect_home');
      setTimeout(completeMission, 3200);
    });
  }
}

function spawnPolice(block, count) {
  const phase = level.phases[activePhase];
  const gates = police.request(block, { count, visibleGates: [] });
  const baseZ = activePhase === 'street' ? 20 - policeMeshes.length * 6 : 5;
  for (let i = 0; i < gates.length; i++) {
    addPoliceMesh({
      id: `${block}_${policeMeshes.length}`,
      block,
      phaseId: activePhase,
      position: [(i % 2 ? -1 : 1) * (4 + i), 0.89, baseZ - i * 5],
    });
  }
  window.__heistDebug.policeActive = activePoliceMeshes().length;
  window.__heistDebug.policeSpawned += gates.length;
  window.__heistDebug.poolUsage.police = policeMeshes.length;
}

function activePoliceMeshes() {
  return policeMeshes.filter((mesh) => mesh.visible && mesh.userData.phaseId === activePhase);
}

function addPoliceMesh({ id, block, phaseId, position, actorSnapshot = null, visible = true }) {
  const actor = new CombatActor({ id, faction: FACTIONS.POLICE, maxHealth: 80, armor: 12 });
  if (actorSnapshot) actor.restore(actorSnapshot);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 1.78, 0.52),
    new THREE.MeshStandardMaterial({ color: 0x25384d, roughness: 0.8 }),
  );
  mesh.position.fromArray(position);
  mesh.castShadow = true;
  mesh.visible = visible;
  mesh.userData.combatActor = actor;
  mesh.userData.block = block;
  mesh.userData.phaseId = phaseId;
  level.phases[phaseId].group.add(mesh);
  policeMeshes.push(mesh);
  return mesh;
}

function fireWeapon() {
  if (!started || driving || missionCompleted) return;
  const shot = weapon.fire();
  if (!shot.fired) { if (shot.reason === 'empty') audio.play('heist.weapon.empty'); return; }
  hud.setAmmo(weapon.magazine, weapon.reserveMagazines * weapon.definition.magazineSize, weapon.definition.name ?? 'CONTROLLED');
  audio.play('heist.weapon.carbine', { volume: 0.9 });
  emitCasing();
  muzzle.intensity = 8;
  camera.rotation.z += (Math.random() - 0.5) * 0.008;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObject(level.phases[activePhase].group, true);
  const hit = hits[0];
  if (hit?.object.userData.combatActor) {
    emitImpact(hit.point);
    const resolved = resolveBallisticHits([{
      distance: hit.distance,
      actor: hit.object.userData.combatActor,
    }], {
      attacker: { faction: FACTIONS.CREW }, damage: shot.damage,
      penetration: shot.penetration, matrix: factionMatrix, playerShot: true,
    });
    if (resolved[0]?.result?.fatal) {
      hit.object.visible = false;
      officersDown++;
      police.remove(hit.object.userData.block);
      window.__heistDebug.policeActive--;
      refreshInteractions();
    }
  }
}

function updatePoliceCombat(dt) {
  if (!['street', 'garage'].includes(activePhase) || machine.state === 'FAILED') return;
  const live = activePoliceMeshes();
  if (!live.length) return;
  policeFireClock -= dt;
  if (policeFireClock > 0) return;
  policeFireClock = 0.55 + Math.random() * 0.75;
  const shooter = live[Math.floor(Math.random() * live.length)];
  const distance = shooter.position.distanceTo(player.position);
  if (distance > 48) return;
  const origin = shooter.position.clone();
  origin.y = 1.35;
  const target = player.position.clone();
  target.y = 1.2;
  const direction = target.sub(origin).normalize();
  origin.addScaledVector(direction, 0.6);
  lineOfSightRaycaster.set(origin, direction);
  lineOfSightRaycaster.far = Math.max(0, distance - 0.8);
  if (lineOfSightRaycaster.intersectObject(level.phases[activePhase].group, true).length) return;
  suppression.noteNearMiss(0.16, Math.max(0.2, distance / 48));
  emitImpact(player.position.clone().add(new THREE.Vector3(
    (Math.random() - 0.5) * 1.4, -0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 1.4,
  )));
  const moving = player.velocity.lengthSq() > 2.5;
  const hitChance = (moving ? 0.18 : 0.34) * (1 - Math.min(0.45, suppression.value * 0.2));
  if (Math.random() > hitChance) return;
  const result = playerActor.applyHit({
    amount: 8 + Math.random() * 7,
    attacker: { faction: FACTIONS.POLICE },
    matrix: factionMatrix,
  });
  if (!result.applied) return;
  hud.setHealth((playerActor.health / playerActor.maxHealth) * 100);
  audio.play('heist.player.hit', { volume: 0.75 });
  if (result.fatal) failMission('prospect_incapacitated');
}

function dropCarriedBag() {
  if (!carryingBag || driving) return;
  const phase = level.phases[activePhase];
  const id = carryingBag;
  loot.drop(id, {
    anchor: `${activePhase}_drop`,
    position: { x: player.position.x, y: 0.3, z: player.position.z },
  });
  const mesh = phase.group.getObjectByName(id.replace('_', '-'));
  if (mesh) { mesh.position.set(player.position.x, 0.3, player.position.z); mesh.visible = true; }
  carryingBag = null;
  hud.setBag(0, 0);
}

function failMission(reason) {
  if (!machine.fail(reason)) return;
  const fade = document.getElementById('fade');
  fade.querySelector('span').textContent = latestCheckpoint
    ? 'RESTORING LAST SAFE POSITION' : 'RESTARTING THE BRIEFING';
  fade.style.opacity = '1';
  setTimeout(() => {
    if (!latestCheckpoint) {
      machine.restore('CREW_INTRO');
      activatePhase('safehouse');
      armorReady = false;
      loadoutReady = false;
      player.mode = 'walk';
      player.moveScale = 1;
      hud.setObjective('Meet Snow and the crew at the briefing table.');
      fade.style.opacity = '0';
      refreshInteractions();
      return;
    }
    const snapshot = checkpoints.snapshot(latestCheckpoint);
    checkpoints.restore(latestCheckpoint);
    machine.restore(snapshot.meta.state);
    activatePhase(snapshot.meta.phase);
    interaction.setPaused(driving);
    hud.setDriving(driving, Math.abs(vehicle.speed) * 2.237);
    player.mode = driving ? 'frozen' : 'walk';
    fade.style.opacity = '0';
    refreshInteractions();
  }, 800);
}

checkpoints.register('player', {
  capture: () => ({
    position: player.position.toArray(), yaw: player.yaw, pitch: player.pitch,
    actor: playerActor.snapshot(),
  }),
  reset: () => { player.clearKeys(); player.velocity.set(0, 0, 0); },
  restore: (s) => {
    player.position.fromArray(s.position);
    player.yaw = s.yaw;
    player.pitch = s.pitch;
    playerActor.restore(s.actor);
    hud.setHealth((playerActor.health / playerActor.maxHealth) * 100);
  },
});
checkpoints.register('weapon', {
  capture: () => weapon.snapshot(),
  reset: () => weapon.restore({
    magazine: weapon.definition.magazineSize,
    reserveMagazines: weapon.definition.reserveMagazines,
  }),
  restore: (snapshot) => {
    weapon.restore(snapshot);
    hud.setAmmo(weapon.magazine, weapon.reserveMagazines * weapon.definition.magazineSize,
      weapon.definition.name ?? 'CONTROLLED');
  },
});
checkpoints.register('loot', { capture: () => loot.capture(), reset: () => loot.reset(), restore: (s) => loot.restore(s) });
checkpoints.register('police', {
  capture: () => ({
    director: police.capture(),
    meshes: policeMeshes.map((mesh) => ({
      id: mesh.userData.combatActor.id,
      block: mesh.userData.block,
      phaseId: mesh.userData.phaseId,
      position: mesh.position.toArray(),
      visible: mesh.visible,
      actor: mesh.userData.combatActor.snapshot(),
    })),
  }),
  reset: () => {
    for (const mesh of policeMeshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.removeFromParent();
    }
    policeMeshes = [];
    police.reset();
  },
  restore: (snapshot) => {
    police.restore(snapshot.director);
    for (const record of snapshot.meshes) addPoliceMesh({ ...record, actorSnapshot: record.actor });
    window.__heistDebug.policeActive = activePoliceMeshes().length;
    window.__heistDebug.poolUsage.police = policeMeshes.length;
  },
});
checkpoints.register('vehicle', { capture: () => vehicle.snapshot(), reset: () => fixedStep.reset(), restore: (s) => vehicle.restore(s) });
checkpoints.register('dialogue', { capture: () => dialogue.capture(), reset: () => dialogue.reset(), restore: (s) => dialogue.restore(s) });
checkpoints.register('effects', { capture: () => activeEffects, reset: () => { activeEffects.length = 0; }, restore: (s) => activeEffects.push(...s) });
checkpoints.register('mission-local', {
  capture: () => ({
    armorReady, loadoutReady, bankBagsStaged, carryingBag, droppedBagDecision,
    lobbyControlled, rearGuardSecured,
    officersDown, driving, roadblockHit, routeIndex, offroadHitCooldown,
    driveCollisionCooldown, policeFireClock, swapProgress: { ...swapProgress },
    driveInvalidFor, driveStuckFor, drivingRecovery,
    suppression: suppression.value,
  }),
  reset: () => {
    armorReady = false;
    loadoutReady = false;
    lobbyControlled = false;
    rearGuardSecured = false;
    bankBagsStaged = 0;
    carryingBag = null;
    droppedBagDecision = null;
    officersDown = 0;
    driving = false;
    roadblockHit = false;
    routeIndex = 0;
    offroadHitCooldown = 0;
    driveCollisionCooldown = 0;
    driveInvalidFor = 0;
    driveStuckFor = 0;
    drivingRecovery = false;
    policeFireClock = 0.8;
    Object.keys(swapProgress).forEach((key) => { swapProgress[key] = false; });
    suppression.value = 0;
  },
  restore: (snapshot) => {
    armorReady = snapshot.armorReady === true;
    loadoutReady = snapshot.loadoutReady === true;
    lobbyControlled = snapshot.lobbyControlled === true;
    rearGuardSecured = snapshot.rearGuardSecured === true;
    bankBagsStaged = snapshot.bankBagsStaged ?? 0;
    carryingBag = snapshot.carryingBag ?? null;
    droppedBagDecision = snapshot.droppedBagDecision ?? null;
    officersDown = snapshot.officersDown ?? 0;
    driving = snapshot.driving === true;
    roadblockHit = snapshot.roadblockHit === true;
    routeIndex = snapshot.routeIndex ?? 0;
    offroadHitCooldown = snapshot.offroadHitCooldown ?? 0;
    driveCollisionCooldown = snapshot.driveCollisionCooldown ?? 0;
    driveInvalidFor = snapshot.driveInvalidFor ?? 0;
    driveStuckFor = snapshot.driveStuckFor ?? 0;
    drivingRecovery = snapshot.drivingRecovery === true;
    policeFireClock = snapshot.policeFireClock ?? 0.8;
    Object.assign(swapProgress, snapshot.swapProgress ?? {});
    suppression.value = snapshot.suppression ?? 0;
  },
});
checkpoints.register('crew', {
  capture: () => ({
    graph: squadGraph.capture(),
    actors: [...crew.values()].map((actor) => ({
      id: actor.id,
      anchor: actor.anchor,
      injury: actor.injury,
      carrying: actor.carrying,
      masked: actor.masked,
      position: actor.group.position.toArray(),
      rotationY: actor.group.rotation.y,
    })),
  }),
  reset: () => squadGraph.reset(),
  restore: (snapshot) => {
    squadGraph.restore(snapshot.graph);
    for (const record of snapshot.actors ?? []) {
      const actor = crew.get(record.id);
      if (!actor) continue;
      actor.anchor = record.anchor;
      actor.injury = record.injury;
      actor.carrying = record.carrying;
      actor.group.position.fromArray(record.position);
      actor.group.rotation.y = record.rotationY;
      actor.masked = record.masked === true;
      const mask = actor.group.getObjectByName('heist-mask');
      if (mask) mask.visible = actor.masked;
    }
  },
});
checkpoints.register('civilians', {
  capture: () => civilians.map((civilian) => civilian.capture()),
  reset: () => civilians.forEach((civilian) => civilian.restore({
    id: civilian.id, state: 'ambient', panic: 0, compliance: 0, anchor: civilian.anchor,
  })),
  restore: (snapshot) => snapshot.forEach((record, index) => civilians[index]?.restore(record)),
});

function seedLootForCheckpoint(checkpoint, mission) {
  const atOrAfterStreet = ['street_withdrawal', 'mercer_garage', 'vehicle_swap'].includes(checkpoint);
  if (!atOrAfterStreet) return;
  bankBagsStaged = 8;
  const atGarage = ['mercer_garage', 'vehicle_swap'].includes(checkpoint);
  const recoveredIds = Array.from({ length: mission.droppedBagRecovered ? 8 : 7 }, (_, index) => `cash_${index + 1}`);
  for (const id of recoveredIds) {
    loot.carry(id, CHARACTER_IDS.DEATHMEGATRON);
    if (checkpoint === 'vehicle_swap') loot.load(id, 'clean_swap_car');
    else if (atGarage) continue;
    else loot.drop(id, { anchor: 'bank_exit', position: { x: 0, y: 0.3, z: 8.5 } });
  }
  if (checkpoint === 'street_withdrawal') {
    loot.carry('cash_8', CHARACTER_IDS.NUMBSKULL);
    loot.drop('cash_8', { anchor: 'bank_exit', position: { x: 1.2, y: 0.3, z: 8.5 } });
  } else if (!mission.droppedBagRecovered) {
    loot.abandon('cash_8');
    droppedBagDecision = 'abandoned';
  } else {
    droppedBagDecision = 'recovered';
  }
}

function resumePersistedCheckpoint(checkpoint) {
  const mission = campaign.state.missions[MISSION_IDS.BANK_HEIST];
  armorReady = true;
  loadoutReady = true;
  seedLootForCheckpoint(checkpoint, mission);
  const setup = {
    safehouse_ready: {
      state: 'VAN_APPROACH', phase: 'van', objective: 'Stay seated. Pull the mask into position when Snow gives the word.',
    },
    bank_secured: {
      state: 'MANAGER_ESCORT', phase: 'bank', objective: 'Cover Shubenator while he bypasses the vault.', masked: true,
    },
    vault_open: {
      state: 'CASH_LOADING', phase: 'bank', objective: 'Move two cash bags to the exit. The crew handles the rest.', masked: true,
    },
    street_withdrawal: {
      state: 'STREET_BLOCK_ONE', phase: 'street', objective: 'Suppress the right side and reach the disabled van.',
      masked: true, policeBlock: 'bank_avenue', policeCount: 5,
    },
    mercer_garage: {
      state: 'GARAGE_HOLD', phase: 'garage', objective: 'Hold the garage entrance. Clear a lane to the secondary car.',
      masked: true, policeBlock: 'mercer_garage', policeCount: 4, injury: 'moderate',
    },
    vehicle_swap: {
      state: 'SAFEHOUSE_RETURN', phase: 'safehouse', objective: 'Let the room breathe. Help Rippin, then count the take.',
      injury: 'moderate', swapDone: true,
    },
  }[checkpoint];
  if (!setup) return false;
  machine.restore(setup.state);
  activatePhase(setup.phase);
  setCrewMasked(crew, setup.masked === true);
  if (setup.injury) crew.get(CHARACTER_IDS.RIPPINFLOW).injury = setup.injury;
  if (setup.swapDone) Object.keys(swapProgress).forEach((key) => { swapProgress[key] = true; });
  if (setup.policeBlock) spawnPolice(setup.policeBlock, setup.policeCount);
  player.mode = 'walk';
  player.moveScale = setup.phase === 'van' ? 0 : 1;
  hud.setObjective(setup.objective);
  latestCheckpoint = checkpoint;
  checkpoints.capture(checkpoint, { state: setup.state, phase: setup.phase });
  window.__heistDebug.checkpoint = checkpoint;
  return true;
}

function primePreview(checkpoint) {
  const order = ['safehouse_ready', 'bank_secured', 'vault_open', 'street_withdrawal', 'mercer_garage', 'vehicle_swap'];
  const count = {
    safehouse: 0, bank_lobby: 1, vault_open: 3, street_withdrawal: 4,
    mercer_garage: 5, vehicle_escape: 5, safehouse_debrief: 6,
  }[checkpoint] ?? 0;
  for (let i = 0; i < count; i++) {
    const id = order[i];
    const facts = {
      bank_secured: { guardsDisarmed: 2 },
      vault_open: { bagsStaged: 8 },
      street_withdrawal: { primaryVanLost: true, policeHeat: 55 },
      mercer_garage: { bagsRecovered: 7, crewInjuries: { rippinflow: 'moderate' } },
      vehicle_swap: { playerDroveEscape: true, vehicleDamage: 35 },
    }[id] ?? {};
    story.checkpoint(id, facts);
    latestCheckpoint = id;
  }
  if (count >= 3) {
    for (const record of loot.capture()) {
      loot.carry(record.id, CHARACTER_IDS.DEATHMEGATRON);
      if (count >= 5) loot.load(record.id, 'escape_sedan');
      else loot.drop(record.id, { anchor: 'bank_exit', position: { x: 0, y: 0.3, z: 8 } });
    }
    bankBagsStaged = 8;
  }
  if (count >= 5) crew.get(CHARACTER_IDS.RIPPINFLOW).injury = 'moderate';
  const startState = PREVIEW_START_STATE[checkpoint] ?? 'SAFEHOUSE_ARRIVAL';
  machine.restore(startState);
  if (checkpoint === 'vehicle_escape') beginDriving();
  else if (checkpoint === 'safehouse_debrief') {
    machine.restore('SAFEHOUSE_RETURN');
    activatePhase('safehouse');
    hud.setObjective('Help Rippin, count the take, and answer Lou.');
  } else activatePhase(phaseIdForState(startState));
  if (latestCheckpoint) checkpoints.capture(latestCheckpoint, { state: startState, phase: phaseIdForState(startState) });
}

async function begin() {
  if (started) return;
  started = true;
  document.getElementById('start-card').classList.add('hidden');
  hud.show();
  sceneInventory.show();
  syncHeistInventory();
  await audio.init();
  await audio.loadManifest({ names: HEIST_VOICE_CUES, prefixes: ['heist.'] });
  const opening = story.begin();
  if (!opening.ok) {
    if (opening.reason === 'already_complete') {
      navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door' });
      return;
    }
    started = false;
    document.getElementById('start-card').classList.remove('hidden');
    document.querySelector('#start-card .lede').textContent = `THE TAKE is unavailable: ${opening.reason.replaceAll('_', ' ')}.`;
    return;
  }
  if (!isPreviewMode()) canvas.requestPointerLock?.();
  const checkpoint = isPreviewMode() ? previewCheckpointForLocation() : null;
  if (checkpoint && checkpoint !== 'safehouse') {
    primePreview(checkpoint);
  } else if (opening.resumed && opening.checkpoint) {
    resumePersistedCheckpoint(opening.checkpoint);
  } else {
    activatePhase('safehouse');
    hud.setObjective('Meet Snow and the crew at the briefing table.');
    setTimeout(() => {
      advanceTo('CREW_INTRO');
      say('snow_arrival');
      refreshInteractions();
    }, 700);
  }
  refreshInteractions();
}

document.getElementById('start').addEventListener('click', begin);
function setSimulationPaused(value) {
  if (isPreviewMode()) return;
  simulationPaused = value === true;
  if (simulationPaused) {
    player.clearKeys();
    vehicle.setInput();
  }
  interaction.setPaused(simulationPaused || driving);
}

canvas.addEventListener('click', () => {
  if (!started) return;
  setSimulationPaused(false);
  if (!driving) canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  player.enabled = document.pointerLockElement === canvas && !driving;
  if (started && !driving) setSimulationPaused(document.pointerLockElement !== canvas);
});
addEventListener('blur', () => { if (started) setSimulationPaused(true); });
document.addEventListener('visibilitychange', () => {
  if (started && document.hidden) setSimulationPaused(true);
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas && !driving) player.handleMouseMove(event.movementX, event.movementY);
});
document.addEventListener('keydown', (event) => {
  if (event.repeat && ['KeyE', 'KeyR', 'KeyQ'].includes(event.code)) return;
  player.setKey(event.code, true);
  if (event.code === 'KeyE') interaction.press();
  if (event.code === 'KeyR' && weapon.beginReload()) audio.play('heist.weapon.reload');
  if (event.code === 'KeyQ') dropCarriedBag();
  if (event.code === 'F9' && isPreviewMode()) failMission('preview_failure_test');
});
document.addEventListener('keyup', (event) => {
  player.setKey(event.code, false);
  if (event.code === 'KeyE') interaction.release();
});
document.addEventListener('mousedown', (event) => {
  if (event.button === 0 && document.pointerLockElement === canvas) fireWeapon();
  if (event.button === 2) weapon.setAimed(true);
});
document.addEventListener('mouseup', (event) => { if (event.button === 2) weapon.setAimed(false); });
document.addEventListener('contextmenu', (event) => event.preventDefault());

function recoverDrivingRoute(reason) {
  if (!driving || drivingRecovery) return false;
  drivingRecovery = true;
  const drivePhase = level.phases.driving;
  const stable = drivePhase.route.find((node) => node.id === vehicle.lastStableNode)
    ?? { x: 0, z: 18 };
  vehicle.x = stable.x;
  vehicle.z = stable.z;
  vehicle.speed = 0;
  vehicle.lateralSlip = 0;
  vehicle.engineHealth = Math.max(40, vehicle.engineHealth);
  vehicle.tireGrip = Math.max(0.65, vehicle.tireGrip);
  vehicle.setInput();
  driveInvalidFor = 0;
  driveStuckFor = 0;
  player.clearKeys();
  drivePhase.car.position.set(vehicle.x, 0, vehicle.z);
  const fade = document.getElementById('fade');
  fade.querySelector('span').textContent = reason === 'route'
    ? 'RECOVERING THE ESCAPE ROUTE' : 'RESTARTING FROM THE LAST SAFE TURN';
  fade.style.opacity = '1';
  setTimeout(() => {
    fade.style.opacity = '0';
    drivingRecovery = false;
  }, 650);
  return true;
}

function updateDriving(dt) {
  if (drivingRecovery) return;
  const throttle = (player.keys.has('KeyW') ? 1 : 0) - (player.keys.has('KeyS') ? 1 : 0);
  const steer = (player.keys.has('KeyA') ? 1 : 0) - (player.keys.has('KeyD') ? 1 : 0);
  const brake = player.keys.has('Space') ? 1 : 0;
  vehicle.setInput({ throttle, steer, brake });
  const previousX = vehicle.x;
  const previousZ = vehicle.z;
  fixedStep.advance(dt, (step) => vehicle.step(step));
  driveCollisionCooldown = Math.max(0, driveCollisionCooldown - dt);
  if (intersectsDrivingObstacle(vehicle.x, vehicle.z, level.phases.driving.obstacles)) {
    vehicle.x = previousX;
    vehicle.z = previousZ;
    vehicle.speed *= -0.18;
    if (driveCollisionCooldown <= 0) {
      driveCollisionCooldown = 0.55;
      vehicle.applyCollision({ severity: 0.34, windshield: Math.abs(vehicle.speed) > 6 });
      audio.play('heist.vehicle.impact');
    }
  }
  window.__heistDebug.fixedSteps = fixedStep.lastSteps;
  const drivePhase = level.phases.driving;
  const car = drivePhase.car;
  car.position.set(vehicle.x, 0, vehicle.z);
  // Procedural cars are modelled long on local X; physics heading is +Z.
  car.rotation.y = vehicle.heading - Math.PI / 2;
  const forwardX = Math.sin(vehicle.heading);
  const forwardZ = Math.cos(vehicle.heading);
  camera.position.set(vehicle.x - forwardX * 6.5, 3.4, vehicle.z - forwardZ * 6.5);
  camera.lookAt(vehicle.x + forwardX * 5, 1.1, vehicle.z + forwardZ * 5);
  hud.setDriving(true, Math.abs(vehicle.speed) * 2.237);

  if (machine.state === 'PLAYER_TAKES_WHEEL' && Math.hypot(vehicle.x, vehicle.z - 18) > 8) {
    advanceTo('GARAGE_ESCAPE');
  }

  const target = drivePhase.route[routeIndex];
  if (target && Math.hypot(vehicle.x - target.x, vehicle.z - target.z) <= target.radius) {
    vehicle.markStableNode(target.id);
    routeIndex++;
    const next = drivePhase.route[routeIndex];
    if (target.id === 'warehouse_left') {
      advanceTo('CITY_PURSUIT');
      say('rippin_market_left');
    } else if (target.id === 'market_east') {
      advanceTo('ROADBLOCK');
      say('snow_roadblock');
    } else if (target.id === 'roadblock') {
      advanceTo('INDUSTRIAL_ROUTE');
      say('rippin_canal');
    } else if (target.id === 'industrial_swap') {
      reachSwap();
      return;
    }
    if (next) hud.setDriving(true, Math.abs(vehicle.speed) * 2.237, next.label);
  }

  const nearRoadblock = Math.abs(vehicle.z + 400) < 7 && Math.abs(vehicle.x - 250) < 12;
  if (!roadblockHit && nearRoadblock && Math.abs(vehicle.x - 250) > 2.7) {
    roadblockHit = true;
    vehicle.applyCollision({ severity: 0.72, windshield: true, tire: Math.abs(vehicle.x - 250) > 6 });
    suppression.noteNearMiss(0.4, 1);
    audio.play('heist.vehicle.impact');
  }

  offroadHitCooldown = Math.max(0, offroadHitCooldown - dt);
  const onRoad = drivePhase.roads.some((road) => (
    Math.abs(vehicle.x - road.x) <= road.w / 2 + 1.5
    && Math.abs(vehicle.z - road.z) <= road.d / 2 + 1.5
  ));
  driveInvalidFor = onRoad ? 0 : driveInvalidFor + dt;
  driveStuckFor = Math.abs(throttle) > 0.5 && Math.abs(vehicle.speed) < 0.12
    ? driveStuckFor + dt : 0;
  if (!onRoad && offroadHitCooldown <= 0) {
    offroadHitCooldown = 0.8;
    vehicle.applyCollision({ severity: 0.16, tire: true });
    audio.play('heist.vehicle.curbstone', { volume: 0.55 });
  }
  if (driveInvalidFor > 4.5 || driveStuckFor > 4 || vehicle.engineHealth <= 0) {
    recoverDrivingRoute(driveInvalidFor > 4.5 ? 'route' : 'vehicle');
  }
}

function constrainPlayerToPhase() {
  const bounds = {
    safehouse: [-8.7, 8.7, -6.7, 6.7],
    van: [-1.45, 1.45, -2.65, 2.65],
    bank: [-10.6, 10.6, -10.6, 10.6],
    street: [-8.8, 8.8, -35.2, 35.2],
    garage: [-11.6, 11.6, -14.6, 14.6],
    driving: [14, 26, -659, -645],
  }[activePhase];
  if (!bounds) return;
  player.position.x = Math.max(bounds[0], Math.min(bounds[1], player.position.x));
  player.position.z = Math.max(bounds[2], Math.min(bounds[3], player.position.z));
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const now = performance.now() / 1000;
  weapon.update(dt);
  suppression.update(dt);
  updateEffectPools(dt);
  hud.setSuppression(suppression.value);
  muzzle.intensity = Math.max(0, muzzle.intensity - dt * 70);
  if (dialogue.current && now >= dialogueEndAt) dialogue.finish();
  dialogue.update(now);
  syncHeistInventory();
  if (started && !simulationPaused) {
    if (driving) updateDriving(dt);
    else {
      player.moveScale = activePhase === 'van' ? 0 : (carryingBag ? 0.72 : 1);
      player.update(dt);
      constrainPlayerToPhase();
      interaction.update(dt);
      updatePoliceCombat(dt);
    }
    updateCrew(crew, dt);
    if (carryingBag) {
      const mesh = level.phases[activePhase].group.getObjectByName(carryingBag.replace('_', '-'));
      if (mesh) mesh.position.set(player.position.x + 0.45, player.position.y - 1.1, player.position.z + 0.2);
    }
  }
  renderer.render(scene, camera);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
installPreviewNotice();
animate();
