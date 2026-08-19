import * as THREE from 'three';

import { AudioEngine } from '../core/audio.js';
import { createCampaignAudioFeedback } from '../core/campaign-audio-feedback.js';
import {
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
  navigateCampaign,
} from '../core/campaign.js';
import {
  CombatActor,
  CombatAudio,
  CombatStepCadence,
  CombatSuppressionField,
  FACTIONS,
  GROUND_COMBAT_AUDIO_CUES,
  SuppressionModel,
  TracerPool,
  combatVitals,
  resolveCombatFeedback,
} from '../core/combat/index.js';
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
import { translateKey, shakeScale } from '../core/settings.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { PostFX } from '../core/postfx.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { WeaponSystem } from '../core/weapons/WeaponSystem.js';
import { playWeaponCue } from '../core/weapons/audio.js';
import { WEAPON_IDS, weaponDef } from '../core/weapons/catalog.js';
import { BloodImpactSystem, DeathBloodPool } from '../world/blood.js';
import { BallisticImpactSystem } from '../world/impacts.js';

import { buildPalaceCast } from './cast.js';
import { PalaceFinaleDirector } from './finale.js';
import { EVIDENCE_IDS, PALACE_BEATS, CartelPalaceMission } from './mission.js';
import {
  previewPalaceCheckpointForLocation,
  previewSnapshotForCheckpoint,
  stagePalaceCheckpointGeometry,
} from './preview.js';
import { PALACE_COMBAT_POSTS, PalaceSecurity } from './security.js';
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
  crosshair: document.getElementById('crosshair'),
  objective: document.getElementById('objective'),
  objectiveKicker: document.getElementById('objective-kicker'),
  objectiveDetail: document.getElementById('objective-detail'),
  evidence: document.getElementById('evidence-count'),
  evidenceText: document.querySelector('#evidence-count span'),
  stealth: document.getElementById('stealth'),
  stealthFill: document.querySelector('#stealth .meter i'),
  stealthState: document.querySelector('#stealth > span'),
  healthFill: document.querySelector('#health .health-meter i'),
  healthText: document.getElementById('health-value'),
  armorFill: document.querySelector('#health .armor-meter i'),
  armorText: document.getElementById('armor-value'),
  ammo: document.getElementById('ammo'),
  ammoName: document.getElementById('ammo-name'),
  ammoMag: document.getElementById('ammo-mag'),
  ammoReserve: document.getElementById('ammo-reserve'),
  ammoState: document.getElementById('ammo-state'),
  boss: document.getElementById('boss'),
  bossArmor: document.querySelector('#boss .armor i'),
  bossLife: document.querySelector('#boss .life i'),
  bossState: document.querySelector('#boss > span'),
  damageDirection: document.getElementById('damage-direction'),
  armorBreak: document.getElementById('armor-break'),
  suppression: document.getElementById('suppression-pressure'),
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
attachPixelRatio(renderer);
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

/** Fixed hostile-flash pool. Every flash root sits on the sampled world-space muzzle. */
class HostileMuzzleFlashPool {
  constructor(parent, { capacity = 12 } = {}) {
    this.parent = parent;
    this.capacity = Math.max(1, Math.trunc(Number(capacity) || 12));
    this.pool = [];
    this.next = 0;
    this.lastOrigin = null;
    const geometry = new THREE.SphereGeometry(0.065, 7, 5);
    for (let index = 0; index < this.capacity; index++) {
      const root = new THREE.Group();
      root.name = `palace-hostile-muzzle-flash-${index}`;
      root.visible = false;
      const flare = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xffcf72,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }));
      const light = new THREE.PointLight(0xffb85f, 0, 6, 2);
      root.add(flare, light);
      parent.add(root);
      this.pool.push({ root, flare, light, time: 0, peak: 7 });
    }
  }

  flash(origin, { heavy = false } = {}) {
    if (!origin?.isVector3) return null;
    const slot = this.pool[this.next % this.pool.length];
    this.next++;
    slot.root.position.copy(origin);
    slot.root.scale.setScalar(heavy ? 1.45 : 1);
    slot.root.visible = true;
    slot.flare.material.opacity = 0.95;
    slot.peak = heavy ? 11 : 7;
    slot.light.intensity = slot.peak;
    slot.time = 0.065;
    this.lastOrigin = origin.clone();
    return slot.root;
  }

  update(dt) {
    const step = Math.max(0, Number(dt) || 0);
    for (const slot of this.pool) {
      if (slot.time <= 0) continue;
      slot.time = Math.max(0, slot.time - step);
      const strength = slot.time / 0.065;
      slot.flare.material.opacity = strength * 0.95;
      slot.light.intensity = strength * slot.peak;
      if (slot.time <= 0) slot.root.visible = false;
    }
  }

  reset() {
    for (const slot of this.pool) {
      slot.time = 0;
      slot.root.visible = false;
      slot.flare.material.opacity = 0;
      slot.light.intensity = 0;
    }
    this.next = 0;
    this.lastOrigin = null;
  }

  report() {
    return Object.freeze({
      capacity: this.capacity,
      active: this.pool.filter((slot) => slot.root.visible).length,
      lastOrigin: this.lastOrigin?.toArray() ?? null,
    });
  }
}

const hud = new Hud();
const player = new Player(camera, world);
player.mode = 'walk';
player.position.copy(PALACE_ANCHORS.approach).setY(1.66);
player.yaw = 0;
player.pitch = -0.06;

const interaction = new InteractionSystem(camera, hud);
interaction.setOccluders([palace.root]);
const audio = new AudioEngine();
const campaignAudioFeedback = createCampaignAudioFeedback(audio);
const combatAudio = new CombatAudio({ audio });
player.onFootstep = (_surface, intensity) => combatAudio.step({
  surface: palaceSurfaceAt(player.position),
  intensity,
});
const combatSteps = new CombatStepCadence({ audio: combatAudio });
const ballisticImpacts = new BallisticImpactSystem(scene, { audio: combatAudio, capacity: 32 });
const suppressionField = new CombatSuppressionField({ colliders: palace.colliders });
const hostileMuzzleFlashes = new HostileMuzzleFlashPool(scene, { capacity: 12 });

const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
if (postfx.bloom) {
  postfx.bloom.threshold = 0.92;
  postfx.bloom.strength = 0.38;
  postfx.bloom.radius = 0.38;
}

const tracers = new TracerPool(scene, 80, { minLength: 0.75 });
const playerActor = new CombatActor({ id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100, armor: 30 });
const suppression = new SuppressionModel();
const bloodImpacts = new BloodImpactSystem(scene);
const deathBloodPools = new DeathBloodPool(scene, { capacity: 12 });

/* The staged dining-room confrontation. Engagement stays player-paced: the
 * script hands combat over on Tony's verdict line, and any shot the player
 * fires first interrupts the speech and engages immediately — the words
 * never take the trigger away. `security` is assigned below; the callback
 * runs only once the dining doors are open, long after construction. */
const finale = new PalaceFinaleDirector({
  cast,
  hud,
  audio,
  onEngage: () => security.activateFinalEncounter(),
});

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

function civilianFromObject(object) {
  let node = object;
  while (node) {
    if (node.userData?.palaceCivilian) return node.userData.palaceCivilian;
    node = node.parent;
  }
  return null;
}

/** The tagged body group a civilian hit landed on, for wound attachment. */
function civilianHitAnchor(object, figure) {
  let node = object;
  while (node) {
    if (node.userData?.hitZone) return { anchor: node, zone: node.userData.hitZone };
    node = node.parent;
  }
  return { anchor: figure.parts.body, zone: 'chest' };
}

let security;
let hitConfirmTimer = 0;
let incomingFeedbackTimer = 0;
let armorBreakTimer = 0;
let lastCombatFeedback = null;
let lastPlayerSuppression = null;
const playerTriggerDamage = new Map();

function confirmCombatHit(kind) {
  ui.crosshair.dataset.confirmed = kind;
  hitConfirmTimer = kind === 'headshot' || kind === 'kill' ? 0.28 : 0.18;
}

function combatMaterialFromObject(object, fallback = 'concrete') {
  let node = object;
  while (node) {
    if (node.userData?.combatMaterial) return node.userData.combatMaterial;
    node = node.parent;
  }
  return fallback;
}

function weaponCaliber(id) {
  if ([WEAPON_IDS.PISTOL9, WEAPON_IDS.REVOLVER].includes(id)) return 'pistol';
  if ([WEAPON_IDS.SAW, WEAPON_IDS.BARRETT, WEAPON_IDS.SHOTGUN].includes(id)) return 'heavy';
  return 'rifle';
}

function palaceSurfaceAt(position) {
  if (position?.z < -35 && Math.abs(position.x) < 8) return 'rug';
  if (position?.z < 12 && Math.abs(position.x) < 19) return 'tile';
  return 'concrete';
}

/* WeaponSystem still owns gun handling, but the Palace Adapter owns contact
 * classification. Suppress only its legacy generic contact cue so a delayed
 * actor/world contact produces one truthful physical sound below. */
const weaponPlayback = {
  hasSample: (name) => audio.hasSample(name),
  play: (name, options) => (
    name === 'heist.bullet.impact' ? null : audio.play(name, options)
  ),
};

/* Built once per trigger pull, not per pellet: nobody moves between the
 * pellets of one shot, and the per-pellet rebuild cost two Vector3s per man
 * per pellet. Each `point` stays a real copy -- it is a sampled position, not
 * a live reference (CONTEXT.md "Sampled aim point"). */
function playerSuppressionCandidates(excluded = new Set()) {
  return cast.all.filter((entry) => !excluded.has(entry.id)).map((entry) => {
    const point = entry.root.position.clone();
    point.y += 1.35;
    return {
      id: entry.id,
      actor: entry.actor,
      active: entry.active && !entry.down,
      incapacitated: entry.down || entry.actor.incapacitated,
      point,
      suppression: entry.suppression,
    };
  });
}

function routePlayerShotTruth(shot) {
  if (shot?.fired !== true) return null;
  const pellets = shot.pellets?.length ? shot.pellets : [shot];
  const hitIds = new Set();
  for (const pellet of pellets) {
    for (const contact of pellet.contacts ?? []) {
      const entry = combatantFromObject(contact.object);
      if (entry?.id) hitIds.add(entry.id);
    }
  }
  const suppressedIds = new Set(hitIds);
  const candidates = playerSuppressionCandidates(suppressedIds);
  const pelletResults = [];
  const suppressed = [];
  for (const pellet of pellets) {
    const hitCombatant = (pellet.contacts ?? [])
      .some((contact) => combatantFromObject(contact.object));
    const result = suppressionField.applyPlayerShot({
      shot: { ...pellet, hit: hitCombatant },
      combatants: candidates.filter((candidate) => !suppressedIds.has(candidate.id)),
    });
    pelletResults.push(result);
    for (const record of result.suppressed) {
      suppressedIds.add(record.id);
      suppressed.push(record);
    }
  }
  lastPlayerSuppression = Object.freeze({
    applied: suppressed.length > 0,
    triggerId: shot.triggerId ?? null,
    projectiles: pellets.length,
    suppressed: Object.freeze(suppressed),
    pellets: Object.freeze(pelletResults),
  });
  return lastPlayerSuppression;
}

function triggerDamageState(impact) {
  if (impact?.triggerId == null) return null;
  const key = `${impact.weapon ?? 'weapon'}:${impact.triggerId}`;
  let record = playerTriggerDamage.get(key);
  if (!record) {
    const cap = Math.max(0, Number(impact.triggerDamageCap) || Number(impact.damage) || 0);
    record = { key, cap, spent: 0, audioActors: new Set() };
    playerTriggerDamage.set(key, record);
    while (playerTriggerDamage.size > 64) {
      playerTriggerDamage.delete(playerTriggerDamage.keys().next().value);
    }
  }
  return record;
}

function applyCappedPlayerImpact(impact) {
  const budget = triggerDamageState(impact);
  const remaining = budget ? Math.max(0, budget.cap - budget.spent) : Infinity;
  if (remaining <= 1e-9) {
    return {
      located: { applied: false, fatal: false, reason: 'trigger-damage-cap' },
      budget,
      submitted: impact,
    };
  }
  const submitted = Number.isFinite(remaining)
    ? { ...impact, damage: Math.min(Math.max(0, Number(impact.damage) || 0), remaining) }
    : impact;
  const located = security?.applyPlayerImpact(submitted) ?? null;
  if (budget && located?.applied) {
    budget.spent = Math.min(budget.cap,
      budget.spent + Math.max(0, Number(located.result?.raw) || 0));
  }
  return { located, budget, submitted };
}

const weapons = new WeaponSystem({
  camera,
  world: scene,
  audio: weaponPlayback,
  groundAt: palace.groundAt,
  hitTargets: [palace.root, ...cast.hitTargets],
  range: 95,
  onImpact: (impact) => {
    const civilian = civilianFromObject(impact.object);
    if (civilian) return applyCivilianImpact(impact, civilian);
    const combatant = combatantFromObject(impact.object);
    if (combatant) {
      const { located, budget, submitted } = applyCappedPlayerImpact(impact);
      if (!located?.applied) return located;
      showPalaceBlood(located, submitted);
      const firstPhysicalHit = !budget || !budget.audioActors.has(combatant.id);
      if (firstPhysicalHit || located.result?.armorBroken) {
        combatAudio.impact({
          target: 'enemy',
          zone: located.zone,
          caliber: weaponCaliber(impact.weapon),
          position: located.point ?? impact.point,
          result: located.result,
        });
      }
      budget?.audioActors.add(combatant.id);
      confirmCombatHit(located.zone === 'head' ? 'headshot'
        : located.fatal ? 'kill'
          : located.result?.absorbed > 0 ? 'armor' : 'hit');
      return located;
    }
    const def = weaponDef(impact.weapon);
    return ballisticImpacts.hit({
      point: impact.point,
      normal: impact.normal,
      direction: impact.direction,
      material: impact.material ?? combatMaterialFromObject(impact.object),
      energy: def?.damage ? impact.damage / def.damage : 1,
      object: impact.object,
    });
  },
  onEvent: (event) => {
    if (event?.type === 'fire' && event.id) {
      /* Reduce-shake covers the camera the recoil moves, not just the
       * viewmodel: this kick IS a shake by any reading of the switch. */
      const kick = weapons.firearm(event.id).def.recoil * 0.48 * shakeScale();
      player.pitch = THREE.MathUtils.clamp(player.pitch + kick, player.pitchMin, player.pitchMax);
      player.yaw += (Math.random() - 0.5) * kick * 0.22;
      routePlayerShotTruth(event.shot);
    }
    if (['equip', 'stow', 'fire', 'loaded'].includes(event.type)) {
      loadout?.capture(weapons);
    }
    if (event.type !== 'fire' || state.phase !== 'active') return;
    /* A shot during the confrontation is the player's answer to it: the
     * speech stops mid-sentence and the room engages. The kills stay
     * player-driven — the script never fires first. */
    if (mission.beat === PALACE_BEATS.DINING_ROOM) finale.interrupt();
    if (![PALACE_BEATS.DINING_ROOM, PALACE_BEATS.CLEAR].includes(mission.beat)) {
      security?.raiseAlarm('gunshot');
    }
  },
});

function updatePlayerStatus() {
  const view = combatVitals(playerActor);
  ui.healthFill.style.width = `${view.percent}%`;
  ui.armorFill.style.width = `${view.armorPercent}%`;
  ui.healthText.textContent = `${view.current} HP`;
  ui.armorText.textContent = `${view.armorCurrent} ARMOR`;
}
updatePlayerStatus();

function presentIncomingCombatFeedback(feedback) {
  lastCombatFeedback = feedback;
  incomingFeedbackTimer = feedback.fatal ? 0.8 : 0.48;
  ui.damageDirection.dataset.sector = feedback.sector;
  ui.damageDirection.style.setProperty('--bearing', `${feedback.bearing}rad`);
  ui.damageDirection.classList.add('active');
  if (feedback.kind === 'armor-break') {
    armorBreakTimer = 1.15;
    ui.armorBreak.classList.add('active');
  }
}

function updateCombatFeedback(dt = 0) {
  incomingFeedbackTimer = Math.max(0, incomingFeedbackTimer - Math.max(0, dt));
  armorBreakTimer = Math.max(0, armorBreakTimer - Math.max(0, dt));
  ui.damageDirection.classList.toggle('active', incomingFeedbackTimer > 0);
  ui.armorBreak.classList.toggle('active', armorBreakTimer > 0);
  const pressure = suppression.vignette;
  ui.suppression.style.setProperty('--suppression', pressure.toFixed(3));
  ui.suppression.style.opacity = Math.min(0.68, pressure * 1.9).toFixed(3);
  ui.suppression.classList.toggle('active', pressure > 0.005);
  ui.suppression.dataset.pressure = pressure.toFixed(3);
}

function resetCombatFeedback() {
  incomingFeedbackTimer = 0;
  armorBreakTimer = 0;
  lastCombatFeedback = null;
  ui.damageDirection.classList.remove('active');
  ui.damageDirection.removeAttribute('data-sector');
  ui.damageDirection.style.removeProperty('--bearing');
  ui.armorBreak.classList.remove('active');
  ui.suppression.classList.remove('active');
  ui.suppression.style.setProperty('--suppression', '0');
  ui.suppression.style.opacity = '0';
  ui.suppression.dataset.pressure = '0.000';
}

/** The death card: brutal, immediate, and the same whoever fired the round.
 * Kept as one function so the retry path can be certain everything the death
 * froze (input, trigger, ADS, pointer lock) has a matching un-freeze. */
function presentPlayerDeath() {
  state.phase = 'dead';
  player.enabled = false;
  player.clearKeys();
  interaction.setPaused(true);
  weapons.setTrigger(false);
  weapons.setAimed(false);
  document.exitPointerLock?.();
  death.classList.remove('hidden');
}

function showPalaceBlood(located, impact) {
  const { actor, anchor } = located;
  if (!actor || !anchor?.isObject3D) return false;
  anchor.updateWorldMatrix?.(true, false);
  const point = located.anchorLocalPoint?.isVector3
    ? anchor.localToWorld(located.anchorLocalPoint.clone())
    : located.point ?? impact.point;
  const normal = located.anchorLocalNormal?.isVector3
    ? located.anchorLocalNormal.clone().applyNormalMatrix(
      new THREE.Matrix3().getNormalMatrix(anchor.matrixWorld),
    ).normalize()
    : located.normal ?? impact.normal;
  bloodImpacts.hit({
    actor,
    anchor,
    point,
    normal,
    from: located.origin ?? impact.origin,
    spatter: true,
    spatterAnchor: anchor,
  });
  if (located.fatal) {
    const root = located.root ?? located.combatant?.root ?? anchor;
    const at = root.getWorldPosition(new THREE.Vector3());
    deathBloodPools.spill(at, {
      floorY: palace.groundAt(at.x, at.z),
      seed: String(actor.id).split('')
        .reduce((seed, char) => ((seed * 31) + char.charCodeAt(0)) >>> 0, 11),
    });
  }
  return true;
}

/*
 * A player round into one of the begging trio. Civilians sit outside
 * PalaceSecurity entirely — no Combatant, no Durable combat state — so their
 * hits resolve here: full blood through the shared systems (this game rewards
 * gore), a head hit or a spent 40-point pool puts them down for good, the
 * room reacts, and the MISSION DOES NOT MOVE. Killing the wife or the short
 * men can never soft-lock or fail the palace; Mark and Sauce remain the only
 * two names the mission counts.
 */
function applyCivilianImpact(impact, entry) {
  const { anchor, zone } = civilianHitAnchor(impact.object, entry.figure);
  bloodImpacts.hit({
    actor: entry,
    anchor,
    point: impact.point,
    normal: impact.normal,
    from: impact.origin,
    spatter: true,
    spatterAnchor: anchor,
  });
  combatAudio.impact({
    target: 'enemy',
    zone,
    caliber: weaponCaliber(impact.weapon),
    position: impact.point,
  });
  let fatal = false;
  if (!entry.down) {
    const def = weaponDef(impact.weapon);
    const damage = Math.max(0, Number(impact.damage) || def?.damage || 25)
      * (zone === 'limb' ? 0.62 : 1);
    entry.health = zone === 'head' ? 0 : Math.max(0, entry.health - damage);
    fatal = entry.health <= 0;
    if (fatal) {
      cast.civilianDown(entry, { roll: entry.id === 'wife' ? -0.36 : 0.44 });
      const at = entry.root.getWorldPosition(new THREE.Vector3());
      deathBloodPools.spill(at, {
        floorY: palace.groundAt(at.x, at.z),
        seed: String(entry.id).split('')
          .reduce((seed, char) => ((seed * 31) + char.charCodeAt(0)) >>> 0, 11),
      });
      combatAudio.bodyFall({ surface: palaceSurfaceAt(at), position: at });
      finale.onCivilianDown(entry);
      hud.toast('They were begging · the job does not care', 'bad', 2800);
    }
  }
  confirmCombatHit(zone === 'head' ? 'headshot' : fatal ? 'kill' : 'hit');
  return { applied: true, fatal, zone, entry };
}

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

function captureCombatCheckpoint(name = mission.beat) {
  loadout?.capture(weapons);
  return {
    version: 1,
    name,
    player: {
      actor: playerActor.durableSnapshot(),
      suppression: suppression.snapshot(),
    },
    loadout: loadout?.checkpoint() ?? null,
    security: security?.snapshot() ?? null,
  };
}

function persistCheckpoint(id, facts = {}) {
  state.lastCheckpoint = id;
  const checkpointSnapshot = captureCombatCheckpoint(id);
  const accepted = campaignStory.checkpoint(id, { ...facts, checkpointSnapshot });
  campaignAudioFeedback.checkpoint(id, accepted);
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
    const completed = campaignStory.complete(report);
    if (!completed) {
      hud.toast('The palace is not clear yet.', 'bad');
      return;
    }
    campaignAudioFeedback.complete('cartel-palace', completed);
    state.completeReport = report;
    loadout.capture(weapons);
    state.phase = 'complete';
    player.enabled = false;
    player.clearKeys();
    interaction.setPaused(true);
    weapons.setTrigger(false);
    weapons.setAimed(false);
    document.exitPointerLock?.();
    ending.classList.remove('hidden');
  },
});

security = new PalaceSecurity({
  cast,
  colliders: palace.colliders,
  combatPosts: PALACE_COMBAT_POSTS,
  playerActor,
  onAlarm: (reason) => {
    document.body.classList.add('alarm');
    audio.play('alarm.chirp', { volume: 0.58 });
    if (reason !== 'dining_room') mission.raiseAlarm(reason);
    if (reason === 'guard_contact') hud.say('<em>CONTACT.</em> The quiet route is gone.', 3000);
  },
  onWeaponEvent: (event) => {
    const position = event.origin ?? event.position ?? event.entry?.root?.position ?? null;
    const volume = event.entry?.role === 'boss' ? 0.72 : 0.55;
    if (event.type === 'shot') {
      playWeaponCue(audio, event.weapon, 'fire', { volume, position });
    } else if (event.type === 'empty') {
      playWeaponCue(audio, event.weapon, 'empty', { volume: 0.42, position });
    } else if (event.type === 'reload-start') {
      playWeaponCue(audio, event.weapon, 'reload.out', { volume: 0.42, position });
    } else if (event.type === 'eject') {
      playWeaponCue(audio, event.weapon, 'mag.floor', {
        volume: 0.36,
        delay: 0.18,
        position: event.entry?.root?.position ?? position,
      });
      playWeaponCue(audio, event.weapon, 'reload.in', { volume: 0.4, position });
    } else if (event.type === 'cycle') {
      playWeaponCue(audio, event.weapon, 'cycle', { volume: 0.44, position });
    }
  },
  onStep: ({ id, dt, position, moving, entry }) => {
    combatSteps.update({
      id: `palace-${id}`,
      dt,
      position: position,
      surface: palaceSurfaceAt(position),
      intensity: entry?.role === 'boss' ? 1.2 : 0.82,
      moving,
    });
  },
  onEnemyFire: ({
    entry, from, to, hit, whiz, blocked, blocker, nearMiss, missDistance, direction,
  }) => {
    const def = weaponDef(entry.weapon);
    hostileMuzzleFlashes.flash(from, {
      heavy: ['boss', 'traitor'].includes(entry.role) || weaponCaliber(entry.weapon) === 'heavy',
    });
    tracers.fire({
      from,
      to,
      speed: def?.tracer.speed ?? 620,
      colour: def?.tracer.colour ?? 0xffd27a,
      width: def?.tracer.width ?? 0.012,
    });
    if (whiz) combatAudio.whiz({ caliber: weaponCaliber(entry.weapon), position: to });
    if (nearMiss) suppression.noteNearMiss(missDistance, entry.role === 'boss' ? 1.2 : 0.85);
    if (!hit && blocked) {
      ballisticImpacts.hit({
        point: to,
        normal: direction?.clone?.().negate() ?? new THREE.Vector3(0, 0, 1),
        direction,
        material: blocker?.material ?? 'concrete',
        energy: entry.role === 'boss' ? 1 : 0.7,
      });
    }
  },
  onPlayerHit: ({ id, result: hit, shot }) => {
    const attacker = cast.all.find((entry) => entry.id === id) ?? null;
    combatAudio.impact({
      target: 'player',
      zone: 'chest',
      caliber: weaponCaliber(attacker?.weapon),
      position: player.position,
      result: hit,
    });
    const feedback = resolveCombatFeedback({
      damage: hit.damage,
      absorbed: hit.absorbed,
      armorBroken: hit.armorBroken,
      fatal: hit.fatal,
      fromPosition: shot?.origin,
      listenerPosition: player.position,
      listenerYaw: player.yaw,
    });
    presentIncomingCombatFeedback(feedback);
    updatePlayerStatus();
    if (hit.fatal || playerActor.incapacitated) presentPlayerDeath();
  },
  onTargetDown: (entry, { silent }) => {
    const position = entry.root.position.clone();
    if (silent) combatAudio.takedown({ position });
    combatAudio.bodyFall({ surface: palaceSurfaceAt(position), position });
    if (entry.role === 'guard') {
      hud.toast(silent ? 'Guard down · quiet' : 'Guard down', silent ? 'good' : '');
      return;
    }
    mission.registerTargetDown(entry.id);
    if (entry.id === 'mark') hud.toast('Mark eliminated', 'good', 3200);
    if (entry.id === 'sauce') hud.toast('Sauce eliminated', 'good', 3200);
    /* The table reacts to the kill: the wife's scream, the double act's
     * rehearsed dive, and the cursing-out once both bodies are down. */
    finale.onTargetDown(entry.id);
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
    audio.play('switch.click', { volume: 0.62, position: PALACE_ANCHORS.powerBox });
    audio.play('light.dip', {
      volume: 0.48, delay: 0.1, position: PALACE_ANCHORS.powerBox,
    });
    audio.play('door.creak', {
      volume: 0.56, delay: 0.18, position: PALACE_ANCHORS.powerBox,
    });
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
      audio.play('chat.ping', { volume: 0.38, rate: 1.05 });
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
    ui.boss.classList.remove('hidden');
    /* The confrontation the evidence earned, in place of the old two-line
     * hand-off. Combat activates on Tony's verdict line — or instantly on
     * the player's first shot, whichever comes first. */
    const progress = mission.snapshot();
    finale.beginConfrontation({
      evidenceFound: progress.evidenceFound,
      alarmRaised: progress.alarmRaised,
    });
  },
});

interaction.register(palace.targets.extractionGate, {
  label: 'Leave for the <b>Initiation</b>',
  hold: 0.82,
  enabled: () => state.phase === 'active' && mission.beat === PALACE_BEATS.CLEAR,
  onUse: () => {
    if (!palace.doors.openExtraction()) return;
    audio.play('door.creak', { volume: 0.68, position: PALACE_ANCHORS.extraction });
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

function clearCombatInput() {
  player.clearKeys();
  interaction.cancel();
  weapons.setTrigger(false);
  weapons.setAimed(false);
}

function clearCombatTransients() {
  clearCombatInput();
  weapons.cancelPendingImpacts();
  tracers.clear();
  combatAudio.reset();
  combatSteps.reset();
  ballisticImpacts.reset();
  suppressionField.reset();
  hostileMuzzleFlashes.reset();
  playerTriggerDamage.clear();
  bloodImpacts.reset();
  deathBloodPools.reset();
  /* A restore discards the timeline the current subtitle came from; the
   * confrontation's phase and reactions are re-derived by the caller. */
  finale.clearLines();
  lastPlayerSuppression = null;
  resetCombatFeedback();
  hitConfirmTimer = 0;
  delete ui.crosshair.dataset.confirmed;
  ui.crosshair.style.transform = 'scale(1)';
}

/** True for the full v1 combat snapshot shape — the only shape an in-memory
 * death retry may trust; anything else falls back to the page rebuild. */
function completeCombatSnapshot(snapshot) {
  return Boolean(snapshot && typeof snapshot === 'object'
    && snapshot.player?.actor?.id === playerActor.id
    && snapshot.loadout && typeof snapshot.loadout === 'object'
    && snapshot.security && typeof snapshot.security === 'object');
}

function restoreCombatCheckpoint(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const legacySecurity = !snapshot.security && Array.isArray(snapshot.entries);
  if (!legacySecurity && !completeCombatSnapshot(snapshot)) return false;
  clearCombatTransients();

  /* Keep the short-lived pre-v16 authoring seam usable: an old raw security
   * snapshot restores only guards and never manufactures player/loadout data. */
  if (legacySecurity) {
    security.restore(snapshot);
    restageEliminatedTargets();
    updatePlayerStatus();
    return security;
  }

  playerActor.restoreDurable(snapshot.player.actor);
  suppression.restore(snapshot.player.suppression);
  loadout.restore(snapshot.loadout, weapons);
  weapons.setTrigger(false);
  weapons.setAimed(false);
  weapons.setSuppression(suppression);
  security.restore(snapshot.security);
  restageEliminatedTargets();
  /* The dining-room checkpoint snapshot is captured by enterDiningRoom()'s
   * own transition, one call BEFORE activateFinalEncounter() flips Mark and
   * Sauce live — so restoring into the boss beat must re-assert the
   * encounter or both targets come back passive. Idempotent: it only sets
   * active = !down, and raiseAlarm('dining_room') no-ops if already up. */
  if (mission.beat === PALACE_BEATS.DINING_ROOM) security.activateFinalEncounter();
  syncLoadout();
  updatePlayerStatus();
  updateAmmo();
  updateStealth();
  updateBoss();
  updateCombatFeedback(0);
  return security;
}

function stageWorldForCheckpoint(id) {
  const progress = mission.snapshot();
  const geometry = stagePalaceCheckpointGeometry(id, { palace, cast });
  state.powerCut = geometry.powerCut;
  for (const [evidenceId, target] of Object.entries(palace.evidence)) {
    if (!progress.evidenceFound.includes(evidenceId)) continue;
    target.userData.collected = true;
    target.traverse((node) => {
      if (node.isMesh && node.material?.emissive) node.material.emissiveIntensity = 0;
    });
  }
  if (progress.alarmRaised) security.raiseAlarm(progress.alarmReason ?? 'detected');
  if (['dining_room', 'clear'].includes(id)) {
    security.activateFinalEncounter();
    ui.boss.classList.remove('hidden');
    /* Resuming inside a live (or cleared) dining room never replays the
     * speech: the encounter is already activated above, so the director only
     * stages the trio to match — braced for a fight, or in the aftermath. */
    if (id === 'clear') finale.stageAftermath();
    else finale.skipConfrontation();
  }
  restageEliminatedTargets(progress);
  placeAtCheckpoint(id);
  repaintEvidence();
}

/* The mission's eliminated flags are the durable authority on the two
 * targets. A checkpoint snapshot captured in the same transition that
 * flipped a flag can still hold Mark or Sauce alive, so both the world
 * staging and a combat-snapshot restore re-assert the flags afterward —
 * a reload must never resurrect a man the save says is down. */
function restageEliminatedTargets(progress = mission.snapshot()) {
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
    /* Give a preview boot the same durable retry seam a campaign resume has:
     * capture the freshly staged world as the checkpoint snapshot, so an
     * in-memory death retry never needs the page rebuild. Preview campaign
     * writes land in PreviewMemoryStorage only. */
    if (previewCheckpoint) persistCheckpoint(restoredCheckpoint);
    return {
      checkpoint: restoredCheckpoint,
      checkpointSnapshot: previewCheckpoint ? null : progress.checkpointSnapshot,
    };
  }
  mission.begin();
  persistCheckpoint('approach');
  stageWorldForCheckpoint('approach');
  return { checkpoint: 'approach', checkpointSnapshot: null };
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
    'Click fires · right-click ADS · R reloads · 1–5 selects the final-raid loadout · Q stows it',
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
    /* Deliberately still a rebuild: pause-menu recovery is the cold escape
     * hatch (a player bailing out mid-anything, including states the combat
     * snapshot never covers). The hot path — dying and retrying — restores
     * in memory via retryFromCheckpoint() below. */
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
    /* 'vo.palace.' is the finale confrontation bank. Unrecorded cues cost
     * nothing — the index filter skips absent files — and recorded takes
     * start playing the day they land, with no code change. */
    prefixes: ['weapon.', 'footstep.', 'vo.palace.'],
    names: [
      ...GROUND_COMBAT_AUDIO_CUES,
      'ambience.rain', 'ambience.city.night', 'alarm.chirp',
      'door.creak', 'door.locked', 'heist.bullet.impact',
      'ui.select', 'woo.streak', 'chat.ping', 'switch.click', 'light.dip',
    ],
  });
  audio.startLoop('palace-night', { name: 'ambience.rain', volume: 0.052, ambience: true, fade: 1.4 });
  const restored = restoreMissionProgress();
  state.phase = 'active';
  interaction.setPaused(false);
  player.enabled = true;
  inventoryBar.show();
  loadout.apply(weapons);
  if (restored.checkpointSnapshot) restoreCombatCheckpoint(restored.checkpointSnapshot);
  syncLoadout();
  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  requestGamePointerLock();
});

/**
 * In-memory death retry — the same restore sequence a page reload boots
 * through (mission.restore → stageWorldForCheckpoint → restoreCombatCheckpoint),
 * minus the reload. The persisted checkpoint is the single source of truth,
 * so what comes back is exactly what a rebuild would have staged:
 *
 *   - mission/beat, objective HUD, evidence and boss-bar staging;
 *   - the security snapshot (guards revive or stay down per the record, the
 *     shared contact call and live aim are forgotten — security.restore);
 *   - restageEliminatedTargets() re-asserts the eliminated flags afterward,
 *     same as the reload path;
 *   - player health/armor/suppression, loadout, ammo;
 *   - every attempt-scoped transient via clearCombatTransients(): pending
 *     tracer impacts, blood decals and death pools (reload parity — a rebuild
 *     starts with clean pools too), hostile flashes, suppression fields,
 *     combat feedback, step cadence and one-shot combat audio.
 *
 * Audio: the 'palace-night' ambience loop simply keeps running (startLoop is
 * idempotent per key and the retry never re-runs the start button), and no
 * other loop exists in this scene, so nothing can stack. The alarm chirp and
 * body-class come back only if the checkpoint itself holds the alarm — the
 * alarm is DURABLE here (raising it re-persists the checkpoint), matching a
 * reload. Doors never need closing: every door in the palace opens in the
 * same interaction that advances its checkpoint, so door state and
 * checkpoint state cannot diverge.
 *
 * Returns false — and the caller falls back to location.reload() — when the
 * persisted snapshot is missing or predates the full v1 shape; that is the
 * one category that genuinely needs the rebuild.
 */
function retryFromCheckpoint() {
  if (state.phase !== 'dead') return false;
  const progress = campaignStory.mission;
  const snapshot = progress?.checkpoint ? progress.checkpointSnapshot : null;
  if (!completeCombatSnapshot(snapshot)) return false;
  if (!mission.restore({ ...progress, status: 'in_progress' })) return false;
  death.classList.add('hidden');
  /* The failed attempt's pending narration and toasts belong to the
   * discarded timeline; the retry must not let them keep talking. */
  hud.clearSay();
  hud.toasts.replaceChildren();
  state.powerCut = mission.powerCut === true;
  stageWorldForCheckpoint(mission.beat);
  state.lastCheckpoint = mission.beat;
  restoreCombatCheckpoint(snapshot);
  /* The body class follows the restored truth: a transient alarm from the
   * dead run (dining-room activation aside) goes dark again, a durable one
   * stays lit without replaying the chirp. */
  document.body.classList.toggle('alarm', security.alarm);
  state.phase = 'active';
  interaction.setPaused(false);
  player.enabled = true;
  requestGamePointerLock();
  return true;
}

retryButton.addEventListener('click', () => {
  /* Instant in-memory restore first; the full page rebuild stays as the
   * fallback for a missing or pre-v1 checkpoint snapshot. */
  if (!retryFromCheckpoint()) location.reload();
});
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
  if (document.pointerLockElement !== canvas) clearCombatInput();
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas) player.handleMouseMove(event.movementX, event.movementY);
});
document.addEventListener('keydown', (event) => {
  if (state.phase !== 'active' || state.paused) return;
  if (event.code === 'Space') event.preventDefault();
  player.setKey(translateKey(event.code), true);
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
  player.setKey(translateKey(event.code), false);
  if (event.code === 'KeyE') interaction.release();
});
document.addEventListener('mousedown', (event) => {
  if (event.button === 0 && state.phase === 'active' && !state.paused
    && document.pointerLockElement === canvas) weapons.setTrigger(true);
  if (event.button === 2 && state.phase === 'active' && !state.paused
    && document.pointerLockElement === canvas) weapons.setAimed(true);
});
document.addEventListener('mouseup', (event) => {
  if (event.button === 0) weapons.setTrigger(false);
  if (event.button === 2) weapons.setAimed(false);
});
addEventListener('blur', () => {
  if (state.phase === 'active' && !state.paused) player.enabled = false;
  clearCombatInput();
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
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
    if (hitConfirmTimer > 0) {
      hitConfirmTimer = Math.max(0, hitConfirmTimer - dt);
      if (hitConfirmTimer <= 0) delete ui.crosshair.dataset.confirmed;
    }
    player.update(dt);
    interaction.update(dt);
    finale.update(dt);
    security.update(dt, {
      playerPosition: player.position,
      powerCut: state.powerCut,
      crouching: player.crouching,
      finalEncounter: mission.beat === PALACE_BEATS.DINING_ROOM,
    });
    suppression.update(dt);
    weapons.setSuppression(suppression);
    weapons.update(dt, { speed: Math.hypot(player.velocity.x, player.velocity.z) });
    const feedback = weapons.feedback();
    /* A per-frame DOM lookup plus an unconditional style write is layout work
     * on the many frames where bloom sits still at its floor. */
    const crosshairScale = `scale(${(1 + feedback.bloom * 60).toFixed(3)})`;
    if (ui.crosshair.style.transform !== crosshairScale) {
      ui.crosshair.style.transform = crosshairScale;
    }
    tracers.update(dt);
    bloodImpacts.update(dt);
    deathBloodPools.update(dt);
    updateStealth();
    updateAmmo();
    updateBoss();
  } else {
    player.update(dt);
    tracers.update(dt);
    bloodImpacts.update(dt);
    deathBloodPools.update(dt);
  }
  ballisticImpacts.update(dt);
  hostileMuzzleFlashes.update(dt);
  updateCombatFeedback(dt);
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
  finale,
  security,
  playerActor,
  suppression,
  combatAudio,
  combatSteps,
  ballisticImpacts,
  suppressionField,
  hostileMuzzleFlashes,
  bloodImpacts,
  deathBloodPools,
  weapons,
  loadout,
  loadoutStorageKey: FINAL_ARC_LOADOUT_STORAGE_KEY,
  renderer,
  postfx,
  get phase() { return state.phase; },
  get campaignState() { return campaign.state; },
  get checkpoint() { return state.lastCheckpoint; },
  snapshot: () => mission.snapshot(),
  combatSnapshot: () => captureCombatCheckpoint(mission.beat),
  combatRestore: restoreCombatCheckpoint,
  /** The death card, exactly as an incoming fatal round presents it. */
  presentPlayerDeath,
  /** The in-memory death retry the retry button drives. */
  retryFromCheckpoint,
  combatImpact: (impact) => {
    const located = security.applyPlayerImpact(impact);
    if (located?.applied) {
      showPalaceBlood(located, impact);
      combatAudio.impact({
        target: 'enemy',
        zone: located.zone,
        caliber: weaponCaliber(impact.weapon),
        position: located.point ?? impact.point,
        result: located.result,
      });
      confirmCombatHit(located.zone === 'head' ? 'headshot'
        : located.fatal ? 'kill'
          : located.result?.absorbed > 0 ? 'armor' : 'hit');
    }
    return located;
  },
  combatFeedback: () => ({
    incoming: lastCombatFeedback,
    incomingVisible: incomingFeedbackTimer > 0,
    armorBreakVisible: armorBreakTimer > 0,
    suppression: suppression.vignette,
    playerSuppression: lastPlayerSuppression,
  }),
  resetCombatBlood: () => {
    bloodImpacts.reset();
    deathBloodPools.reset();
  },
  evidence: () => Object.fromEntries(Object.entries(palace.evidence).map(([id, target]) => [id, target.userData.collected === true])),
  geometry: () => ({ ...palace.inspectEnvironment(), drawCalls: renderer.info.render.calls }),
};

window.__squatchSceneReady?.('CARTEL PALACE ready');
setTimeout(() => loading.classList.add('out'), 170);
setTimeout(() => loading.remove(), 780);
