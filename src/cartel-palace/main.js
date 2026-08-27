import * as THREE from 'three';

import { AudioEngine } from '../core/audio.js';
import { createCampaignAudioFeedback } from '../core/campaign-audio-feedback.js';
import {
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
  returnHomeFromMission,
} from '../core/campaign.js';
import {
  CombatActor,
  CombatAudio,
  CombatStepCadence,
  CombatSuppressionField,
  FACTIONS,
  MuzzleFlashPool,
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
import { createObjectivePanel } from '../core/objective-panel.js';
import { Player } from '../core/player.js';
import { createFirstPersonInput } from '../core/first-person-input.js';
import { shakeScale } from '../core/settings.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { PostFX } from '../core/postfx.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import { prewarmAudio, prewarmScene } from '../core/prewarm.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { WeaponSystem } from '../core/weapons/WeaponSystem.js';
import { playWeaponCue } from '../core/weapons/audio.js';
import { WEAPON_IDS, weaponCue, weaponDef } from '../core/weapons/catalog.js';
import { createResidencyBanks } from '../core/residency-banks.js';
import { BloodImpactSystem, DeathBloodPool } from '../world/blood.js';
import { BallisticImpactSystem } from '../world/impacts.js';

import { createPalaceAcoustics } from './acoustics.js';
import {
  PALACE_BACKGROUND_BANK, PALACE_NEXT_BEAT_BANK, PALACE_START_BANK,
  PALACE_WAVE_INCOMING_CUE,
} from './audio-banks.js';
import { buildPalaceCast } from './cast.js';
import { PalaceFinaleDirector } from './finale.js';
import {
  EVIDENCE_IDS, PALACE_BEATS, PALACE_DINING_OBJECTIVES, CartelPalaceMission,
} from './mission.js';
import {
  previewPalaceCheckpointForLocation,
  previewSnapshotForCheckpoint,
  stagePalaceCheckpointGeometry,
} from './preview.js';
import { PALACE_COMBAT_POSTS, PalaceSecurity } from './security.js';
import { createPalaceNavigation } from './navigation.js';
import { PalaceBystanders } from './bystanders.js';
import { PalaceGuardConversations } from './conversations.js';
import { PalaceSuppressor } from './suppressor.js';
import { PalaceVoice, speakerForLine } from './voice.js';
import { PALACE_ANCHORS, buildCartelPalace } from './world.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const startButton = document.getElementById('start-btn');
const death = document.getElementById('death');
const retryButton = document.getElementById('retry-btn');
const ending = document.getElementById('ending');
const departButton = document.getElementById('depart-btn');
const loading = document.getElementById('loading');

const ui = {
  crosshair: document.getElementById('crosshair'),
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
  bossName: document.getElementById('boss-name'),
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
/* Development pilot result, now limited to this mission: a checked-in Recast
 * navmesh supplies physical route legs while the existing Palace AI keeps
 * every decision. Loading begins behind the menu and failure is a clean
 * fallback to the established AABB/detour movement. */
const palaceNavigation = createPalaceNavigation();
const palaceNavigationReady = palaceNavigation.start();
const castRoot = new THREE.Group();
castRoot.name = 'cartel-palace.cast';
scene.add(castRoot);
const cast = buildPalaceCast(castRoot);

const world = {
  colliders: palace.colliders,
  floorZones: palace.floorZones,
  groundAt: palace.groundAt,
};

/*
 * The hostile flash pool used to be a class right here.
 *
 * It is now `MuzzleFlashPool` in `src/core/combat/muzzle-flash.js`, unchanged
 * in behaviour — same 65 ms decay, same flare card over a point light, same
 * round-robin slots, same `report()` the palace verifier reads — because THE
 * TAKE's police needed exactly this and a second copy of it is how two scenes
 * end up with two different flashes. The slot names stay `palace-hostile-
 * muzzle-flash-N`, which is what `verify-cartel-palace.mjs` and the visibility
 * probe below address them by.
 */

const hud = new Hud();
const player = new Player(camera, world);
player.mode = 'walk';
player.position.copy(PALACE_ANCHORS.approach).setY(1.66);
player.yaw = 0;
player.pitch = -0.06;

const interaction = new InteractionSystem(camera, hud);
interaction.setOccluders([palace.root]);
const audio = new AudioEngine();

/* THE CAN. Owner's direction for this mission is that the Prospect goes in
 * with a suppressor on: a real one on the barrel, a dull small flash, a
 * dedicated suppressed report with the mechanical action still on top, and a
 * much smaller radius in which a guard hears the shot at all. See
 * ./suppressor.js -- nothing about it reaches into src/core. */
const suppressor = new PalaceSuppressor({ audio });

/* Everything said in the palace that is not the dining-room script: the
 * Prospect recognising Sauce in the evidence, the cleaner, and the payroll
 * reacting to a raid. Radius and line of sight are enforced by the runtime
 * (./voice.js); `trace` is wired below, once security exists. */
const palaceVoice = new PalaceVoice({
  audio,
  hud,
  player,
  vector: (x, y, z) => new THREE.Vector3(x, y, z),
});

/**
 * The raid in three residency banks (./audio-banks.js): everything a
 * firefight can ask for blocks the start button, the finale's speech blocks
 * the dining door, the city bed rides along behind both. The room-aware mix
 * (./acoustics.js) automates the three always-running loops off the
 * player's room; it is started once at boot and only ever re-asserted —
 * never restarted — by the death retry.
 */
const audioBanks = createResidencyBanks({
  start: () => audio.loadManifest(PALACE_START_BANK),
  nextBeat: () => audio.loadAdditional(PALACE_NEXT_BEAT_BANK),
  background: () => audio.loadAdditional(PALACE_BACKGROUND_BANK),
});
const acoustics = createPalaceAcoustics(audio);

const campaignAudioFeedback = createCampaignAudioFeedback(audio);
const combatAudio = new CombatAudio({ audio });
player.onFootstep = (_surface, intensity) => combatAudio.step({
  surface: palaceSurfaceAt(player.position),
  intensity,
});
const combatSteps = new CombatStepCadence({ audio: combatAudio });
const ballisticImpacts = new BallisticImpactSystem(scene, { audio: combatAudio, capacity: 32 });
const suppressionField = new CombatSuppressionField({ colliders: palace.colliders });
const hostileMuzzleFlashes = new MuzzleFlashPool(scene, {
  capacity: 12, name: 'palace-hostile-muzzle-flash',
});

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

/* The staged dining-room confrontation. Movement stays player-paced while the
 * essential evidence payoff owns the trigger. Tony's verdict hands combat to
 * WeaponSystem; no early click can discard the setup. `security` is assigned
 * below and runs only once the dining doors are open, long after construction. */
const finale = new PalaceFinaleDirector({
  cast,
  hud,
  audio,
  /* The live collider list, so the short men's dive can prove its landing is
   * clear of the table and the chairs before the animation starts. */
  colliders: palace.colliders,
  /* THE THREE STAGES, AND WHO OWNS WHICH HALF.
   *
   * The director owns the words and the pacing; the cast owns the bodies; and
   * these five callbacks are the whole seam between them. Nothing in
   * `finale.js` touches a Combatant, which is the rule it was written under
   * and the reason a fight with three stages did not need a second AI.
   */
  onEngage: () => security.activateFinalEncounter(),
  onScramble: () => {
    cast.markScramblesAway();
    hud.toast('Mark is gone', 'warn', 2600);
  },
  onMarkReturn: ({ armored, enraged }) => {
    cast.activateMark({ armored, at: armored ? MARK_RETURN : MARK_LAST_STAND });
    if (!armored) restoreMarkForLastStand({ enraged });
    hud.say(enraged
      ? '<em>MARK IS COMING BACK.</em> You should not have shot the help.'
      : '<em>MARK IS COMING BACK.</em>', 2600);
  },
  onMarkRetreat: () => {
    cast.markScramblesAway();
    hud.toast('He is calling everybody', 'bad', 3000);
  },
  onWave: () => {
    const released = cast.releaseWave();
    if (released > 0) {
      /* A delivered, nonverbal cue from the shared Siege library: doors and
       * many boots, placed at the rear threshold while each visible body gets
       * its own positional footsteps below. The next-beat bank is awaited at
       * the dining door, so this request cannot race its decode. */
      audio.play(PALACE_WAVE_INCOMING_CUE, {
        volume: 0.72,
        position: PALACE_ANCHORS.extraction,
        ref: 4,
        maxDist: 34,
      });
      hud.toast(`A-Team · ${released} in the room`, 'bad', 3200);
    }
  },
  /* Mark's retreats/returns and the A-Team ingress are cast presentation,
   * not AI travel, but boots should not become silent because ownership
   * changes at the threshold. Reuse the exact cadence and surface mapping
   * used by PalaceSecurity's onStep adapter. */
  onPresentationStep: ({ id, dt, position, moving, entry }) => {
    combatSteps.update({
      id: `palace-${id}`,
      dt,
      position,
      surface: palaceSurfaceAt(position),
      intensity: entry?.role === 'boss' ? 1.2 : 0.92,
      moving,
    });
  },
});

/* Where he comes back in, and where he makes his last stand.
 *
 * Both are in the room's own openings rather than out of thin air: the double
 * doors the player came through, and the extraction gap behind the table. */
const MARK_RETURN = Object.freeze({ x: 0, z: -36.4, faceZ: -42 });
const MARK_LAST_STAND = Object.freeze({ x: 0, z: -47.8, faceZ: -40 });

/**
 * Stage three, on the body rather than in the script.
 *
 * He comes back out with no plates and a fresh will to be there. His armour
 * is spent by definition -- that is what ended stage one -- and his health is
 * whatever the player left it at, so without this the last stand is however
 * much of stage one was still in him, which could be a great deal or almost
 * nothing. It is set, not topped up: the number is the fight's, not a
 * remainder of the previous one.
 */
const MARK_LAST_STAND_HEALTH = 260;
function restoreMarkForLastStand({ enraged = false } = {}) {
  const actor = cast.mark.actor;
  if (!actor) return false;
  actor.armor = 0;
  actor.health = enraged ? MARK_LAST_STAND_HEALTH + 60 : MARK_LAST_STAND_HEALTH;
  actor.incapacitated = false;
  cast.mark.armorPresentation?.applyResult?.({ applied: true, armorBroken: true });
  return true;
}

/* The estate's working civilians -- today, the cleaner in the entry hall.
 * PalaceSecurity never ticks them (they are not combatants), so this owns
 * their clock, their panic run and their lines. */
const bystanders = new PalaceBystanders({ cast, voice: palaceVoice, player });

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
/* The estate's idle guard conversations (./conversations.js). Built below,
 * once security exists: it drives security's idle-task seam rather than
 * moving anybody itself. */
let conversations = null;
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

/**
 * Keep the suppressor and the security layer agreeing about the gun.
 *
 * `WeaponSystem.modelFor` builds a weapon's model the first time it is
 * equipped, so a gun swapped to twenty minutes in is only fittable right
 * then; and `PalaceSecurity.gunshotHearingRadius` is what a shot that lands
 * on a body (`applyPlayerImpact`) is heard at, which has to follow whatever
 * is in the player's hands rather than whatever was in them at boot.
 */
/** The closest guard who is still standing, for a positional bark. */
function nearestLiveGuard() {
  let best = null;
  let bestDistance = Infinity;
  for (const guard of cast.guards) {
    if (guard.down || !guard.active) continue;
    const distance = guard.root.position.distanceTo(player.position);
    if (distance < bestDistance) { best = guard; bestDistance = distance; }
  }
  return best;
}

function syncSuppressor() {
  suppressor.sync(weapons);
  if (security) security.gunshotHearingRadius = suppressor.hearingRadius;
}

/**
 * Which kind of armour the man was wearing, for the sound of it failing.
 *
 * `CombatArmorPresentation` has carried the tier since it was built, and the
 * combat audio layer now asks for it: a plate carrier cracks and drops
 * ceramic, a light vest does neither. See `CombatAudio.impact`.
 */
function armorTierOf(entry) {
  return entry?.armorPresentation?.tier === 'heavy' ? 'heavy' : 'light';
}

/* THE HOUSE'S ALARM, AND IT IS IN THE HOUSE.
 *
 * Owner, 2026-08-24, on the Palace: a stray ringing/phone sound after the
 * first kill.
 *
 * It was this alarm, and three things were wrong with it.
 *
 * THE SAMPLE. `alarm.chirp` is recorded as "a small door alarm box chirping
 * twice, two short high electronic beeps ... close". That is a notification
 * tone. It belongs on the panel by a door, which is where the rest of the game
 * uses it, and it is not what a cartel estate does when it finds a body.
 * `siege.alarm.tone` already exists and is recorded as "one complete pulse of a
 * large private-house security alarm ... a slow two-tone electronic klaxon" --
 * written for Lou's mansion, and the same object on a different rich man's
 * house. Reused rather than re-recorded (docs/REUSE-FIRST.md).
 *
 * THE PLACE. It was played with no `position`, so `AudioEngine.play` gave it no
 * panner at all and it arrived dead centre in both ears at full level -- which
 * is what a phone in your pocket sounds like, not a bell on a building. It
 * rings from the two places an estate alarm lives now: the security office
 * inside and the head of the perimeter gate. Where the player is standing
 * decides what he hears, which is only true now that this scene moves the
 * listener at all (see `animate`).
 *
 * THE SHAPE. One strike is a chime. An alarm is a thing that keeps going, so
 * this is a run of pulses -- long enough to say the night has changed, short
 * enough that the player is not still listening to it during the dining room.
 */
const ALARM_BELLS = Object.freeze([
  PALACE_ANCHORS.securityStill,
  Object.freeze(new THREE.Vector3(14, 4.4, 51)),
]);
const ALARM_PULSES = 6;
const ALARM_PULSE_GAP = 2.4;

function soundTheEstateAlarm() {
  for (let pulse = 0; pulse < ALARM_PULSES; pulse += 1) {
    for (const bell of ALARM_BELLS) {
      audio.play('siege.alarm.tone', {
        volume: 0.30,
        position: bell,
        delay: pulse * ALARM_PULSE_GAP,
        /* An estate, not a room: audible from the fence to the dining room,
         * losing level slowly enough that it stays a klaxon the whole way. */
        ref: 7,
        maxDist: 110,
        rolloff: 0.85,
      });
    }
  }
}

function palaceSurfaceAt(position) {
  if (position?.z < -35 && Math.abs(position.x) < 8) return 'rug';
  if (position?.z < 12 && Math.abs(position.x) < 19) return 'tile';
  return 'concrete';
}

/* WeaponSystem still owns gun handling, but the Palace Adapter owns contact
 * classification. Suppress only its legacy generic contact cue so a delayed
 * actor/world contact produces one truthful physical sound below. */
const weaponPlayback = suppressor.playback({
  suppress: (name) => name === 'heist.bullet.impact',
});

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
          armorTier: armorTierOf(located.combatant),
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
    if (event.type === 'equip' || event.type === 'stow') syncSuppressor();
    if (event.type !== 'fire' || state.phase !== 'active') return;
    if (![PALACE_BEATS.DINING_ROOM, PALACE_BEATS.CLEAR].includes(mission.beat)) {
      /* THE SUPPRESSED HEARING RADIUS. This used to be an unconditional
       * `raiseAlarm('gunshot')`: one round anywhere in the compound and the
       * whole estate knew. With a can on the barrel the shot is heard nine
       * metres, and men inside the wider investigate ring are handed the
       * position to walk over and look at rather than an alarm. Off a
       * revolver or a shotgun the radius is Infinity and the old behaviour
       * is exactly what happens. */
      syncSuppressor();
      security?.noteGunshot(player.position, {
        radius: suppressor.hearingRadiusFor(event.id),
      });
    }
    // The room goes to the floor whether or not anybody heard the shot.
    bystanders.panic();
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
  input.refresh('player-death');
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
      /* The finale director's roster is the three people at Mark's table by
       * name; a working civilian killed in the entry hall is not one of them
       * and must never trigger a dining-room reaction beat. */
      if (cast.civilians.includes(entry)) {
        finale.onCivilianDown(entry);
        hud.toast('They were begging · the job does not care', 'bad', 2800);
      } else {
        hud.toast('She was unarmed · the job does not care', 'bad', 2800);
      }
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

/**
 * THE OBJECTIVE CARD IS THE SHARED ONE.
 *
 * The Palace drew its own -- `#mission-card`'s brass kicker, a 20px uppercase
 * headline and a grey detail line -- for the job `src/core/objective-panel.js`
 * already does for the mansion, the Bing and the apartment. The owner's
 * standing note: *"We keep reinventing and using different systems instead of
 * using what we already have... objectives change presentation."*
 *
 * `mission.js` still owns every word. The kicker becomes the card's title,
 * the objective its one standing item, the hint the line underneath; nothing
 * in `OBJECTIVES` changed. Parented to `#hud` so it lives and dies with the
 * rest of the furniture, as the card it replaces did.
 */
const objectivePanel = createObjectivePanel({ parent: document.getElementById('hud') });

function updateObjective(objective) {
  if (!objective) return;
  state.objective = objective.text;
  objectivePanel.setLine(objective.text, { title: objective.kicker, hint: objective.hint });
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
    input.refresh('mission-complete');
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
  navigation: palaceNavigation,
  playerActor,
  /* Security calls this for the hit it just applied, so a man cries out even
   * when the root's per-trigger audio budget has already suppressed the thud
   * for that frame. The vocal throttle coalesces the two paths, so a hit
   * presented here and again below costs one voice, not two. */
  audio: combatAudio,
  onAlarm: (reason) => {
    document.body.classList.add('alarm');
    soundTheEstateAlarm();
    if (reason !== 'dining_room') mission.raiseAlarm(reason);
    if (reason === 'guard_contact') hud.say('<em>CONTACT.</em> The quiet route is gone.', 3000);
    if (reason === 'dining_room') return;
    /* Somebody shouts it. The nearest man who can actually see the player
     * gets the bark, so it never comes through a wall from the courtyard. */
    /* Whatever anybody was in the middle of saying, they are not any more --
     * cut before the bark so a shout never lands on top of a man finishing a
     * sentence about the playoffs. */
    conversations?.cutAll('alarm');
    const line = reason === 'gunshot' ? 'guard.contact.two' : 'guard.contact.one';
    /* The nearest man CAST TO THAT LINE'S VOICE shouts it, falling back to
     * the nearest man of any voice -- the payroll is three profiles now (see
     * ./voice.js) and the shout has to come out of a matching throat. */
    const caller = speakerForLine(line, cast.guards, { from: player.position })
      ?? nearestLiveGuard();
    palaceVoice.say(line, {
      speaker: caller, position: caller?.root.position ?? null, radius: 26, urgent: true,
    });
    bystanders.panic();
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
      /* Only a man who is still up, still active and can SEE the body says
       * anything about it -- a quiet takedown in an empty corridor stays
       * quiet, which is the whole point of the takedown. */
      const line = security.alarm ? 'guard.ally-down.two' : 'guard.ally-down.one';
      const witnesses = cast.guards.filter((guard) => (
        !guard.down && guard.active && guard.id !== entry.id
        && guard.root.position.distanceTo(position) <= 16
      ));
      /* Same casting rule as the contact call: among the men who can be here
       * for it, the one whose voice the line was recorded on gets it. */
      const witness = speakerForLine(line, witnesses, { from: position });
      if (witness) {
        /* A man finding a body is a man who has stopped chatting. */
        conversations?.cutAll('ally-down');
        palaceVoice.say(line, {
          speaker: witness, position: witness.root.position, radius: 22, urgent: true,
        });
      }
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
    if (phase !== 'exposed') return;
    hud.say('<em>MARK\'S ARMOR IS GONE.</em>', 2200);
    /* And that is the end of stage one. He does not stand there and finish the
     * fight without his plates -- he goes and gets everybody. */
    finale.onArmorBroken();
  },
});

/* Line of sight for the voice layer, off the security space's own collider
 * tracer -- so "do not fire lines through walls" is answered by the walls
 * rather than by a radius that hopes. */
palaceVoice.trace = (from, to) => security.space.trace(from, to);

/**
 * THE SHIFT TALKING TO ITSELF.
 *
 * Owner, 2026-08-20: *"Lets make sure the guards have conversations with each
 * other and you can sneak up on them as they are talking"*. Four pairs, real
 * two-way exchanges, and while a pair is talking they stand still, face each
 * other and notice the estate at a fraction of their usual rate -- all of it
 * through `PalaceSecurity.setIdleTask`, so there is no second AI in here.
 * The moment either man's awareness moves, the take is cut mid-word.
 */
conversations = new PalaceGuardConversations({
  cast,
  security,
  voice: palaceVoice,
  player,
});
/* First fit: whatever the inherited loadout already put in his hands gets a
 * can now, and security learns how far that gun carries. */
syncSuppressor();

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

/**
 * The two lines each clue is worth: one when he first gets close enough to
 * see what it is, one when he logs it. Different words per piece, which is
 * the owner's whole ask -- *"so it feels like an investigation rather than
 * clicking glowing props"*.
 */
const EVIDENCE_VOICE = Object.freeze({
  [EVIDENCE_IDS.SECURITY_STILL]: Object.freeze({
    spot: 'tony.evidence.still.spot', log: 'tony.evidence.still.log',
  }),
  [EVIDENCE_IDS.BELONGINGS]: Object.freeze({
    spot: 'tony.evidence.uniform.spot', log: 'tony.evidence.uniform.log',
  }),
  [EVIDENCE_IDS.PAYMENT_LEDGER]: Object.freeze({
    spot: 'tony.evidence.ledger.spot', log: 'tony.evidence.ledger.log',
  }),
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
      /* RECOGNITION, not exposition. One line per clue, so three evidence
       * pieces read as an investigation rather than three glowing props --
       * and the complete-trail line only once the case is actually closed. */
      palaceVoice.say(EVIDENCE_VOICE[id]?.log, { urgent: true });
      if (mission.snapshot().evidenceFound.length === Object.keys(EVIDENCE_IDS).length) {
        palaceVoice.say('tony.evidence.complete');
      }
    },
  });
}

interaction.register(palace.targets.diningDoor, {
  label: 'Open Mark\'s <b>dining room</b>',
  hold: 0.72,
  enabled: () => state.phase === 'active' && mission.beat === PALACE_BEATS.BETRAYAL,
  onUse: async () => {
    /* THE BEAT BOUNDARY. The finale's `vo.palace.` bank was kicked at boot;
     * this is where it is owed — the door does not swing, and the beat does
     * not begin, until the confrontation's recordings have settled. Nothing
     * retries a line's audio; dispatch is the one chance. In practice the
     * bank settled twenty minutes ago and this await is a microtask; a
     * double press while it is genuinely pending re-enters below, where
     * `openDiningRoom()` refuses a door already open. */
    await audioBanks.whenNextBeat();
    if (!palace.doors.openDiningRoom() || !mission.enterDiningRoom()) return;
    audio.play('door.creak', { volume: 0.7, position: PALACE_ANCHORS.diningRoom });
    ui.boss.classList.remove('hidden');
    /* The confrontation the evidence earned, in place of the old two-line
     * hand-off. A held trigger from the corridor cannot leak through the door;
     * Tony's verdict is the only handoff into combat. */
    weapons.setTrigger(false);
    const progress = mission.snapshot();
    finale.beginConfrontation({
      evidenceFound: progress.evidenceFound,
      alarmRaised: progress.alarmRaised,
    });
  },
});

interaction.register(palace.targets.extractionGate, {
  /* He is leaving a house, not going to a ceremony. See the note on
   * PALACE_BEATS.CLEAR in ./mission.js. */
  label: 'Leave through the <b>terrace</b>',
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
  input?.clear('combat-reset');
}

function clearCombatTransients() {
  clearCombatInput();
  /* Scripted threshold crossings belong to the discarded attempt just like
   * hostile fire and queued dialogue. Security.restore() immediately puts
   * every body back at its checkpoint position after this cancellation. */
  cast.clearPresentation();
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
  /* Same reason: the pending line belongs to the discarded timeline. The
   * once-only latches are deliberately KEPT -- a retry should not replay
   * every recognition line the player already heard. */
  palaceVoice.reset();
  /* Every man back on his round: an errand belongs to the discarded
   * timeline, exactly like a live target or a settled bore. */
  conversations.reset();
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
  /* A restore lands in whatever stage the checkpoint says, and the beat's own
   * objective has just been pushed over the top of the stage card. Forget the
   * last stage so the next frame writes the right one. */
  bossStage = null;
  updateDiningObjective();
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
  /* A checkpoint past the alarm resumes with the working civilians already
   * flat where they landed -- no replayed run, no replayed screaming. */
  if (progress.alarmRaised || ['betrayal', 'dining_room', 'clear'].includes(id)) {
    bystanders.stagePanicked();
  }
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
  return input.requestPointerLock();
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
    interaction.setPaused(true);
    input.refresh('pause');
  },
  onResume: () => {
    state.paused = false;
    interaction.setPaused(false);
    input.refresh('resume');
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

const input = createFirstPersonInput({
  player,
  canvas,
  interaction,
  canEnable: () => state.phase === 'active' && !state.paused,
  canHandleInput: () => state.phase === 'active' && !state.paused,
  /* Keyboard interaction remains available when an embedded browser refuses
   * mouse capture. Movement and look still require capture; the authored
   * power-box/door actions historically did not. */
  interactionRequiresCapture: false,
  routes: {
    keyDown(event) {
      if (event.code === 'KeyR' && !event.repeat) {
        weapons.reload();
        return true;
      }
      if (event.code === 'KeyQ' && !event.repeat) {
        loadout.stow(weapons);
        syncLoadout();
        return true;
      }
      if (event.code === 'KeyB' && !event.repeat) {
        hud.toast(postfx.toggle() ? 'Bloom on' : 'Bloom off', 'good');
        return true;
      }
      if (/^Digit[1-5]$/.test(event.code) && !event.repeat) {
        loadout.select(Number(event.code.slice(-1)) - 1, weapons);
        syncLoadout();
        return true;
      }
      return false;
    },
    mouseDown(event, controls) {
      if (!controls.locked) return false;
      if (event.button === 0) {
        if (!finale.canPlayerFire()) {
          weapons.setTrigger(false);
          hud.toast('Hold fire · listen', 'warn', 1400);
          return true;
        }
        weapons.setTrigger(true);
      }
      if (event.button === 2) weapons.setAimed(true);
      return event.button === 0 || event.button === 2;
    },
    mouseUp(event) {
      if (event.button === 0) weapons.setTrigger(false);
      if (event.button === 2) weapons.setAimed(false);
      return event.button === 0 || event.button === 2;
    },
  },
  onClear: (reason) => {
    weapons.setTrigger(false);
    weapons.setAimed(false);
  },
  onCaptureError: () => {
    weapons.setTrigger(false);
    weapons.setAimed(false);
  },
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
  /* The START bank only — the raid's guns, steps, doors and weather. The
   * finale's `vo.palace.` speech decodes right behind it and is awaited at
   * the dining door, which is that beat's boundary; twenty minutes of
   * approach never again waited on a confrontation bank. */
  await audioBanks.loadStart();
  audioBanks.kickoff();
  /* The START bank above was awaited, so the weapon cues are normally already
   * decoded; this pins the exact cues the FIRST trigger pull reaches for as
   * decoded-or-reported (src/core/prewarm.js) before combat can start. A cue
   * that never decoded is reported and plays its synth stand-in rather than
   * stalling the boot. */
  window.CARTEL_PALACE.prewarmAudioReport = await prewarmAudio(audio, [
    ...loadout.items.filter(Boolean).map((id) => weaponCue(id, 'fire')),
    'heist.bullet.impact',
  ], { timeout: 500 });
  const restored = restoreMissionProgress();
  /* After the restore, so a mid-estate checkpoint boots hearing its own
   * room — the loops start at the restored room's gains, not outdoors. */
  acoustics.start(player.position);
  /* A resume INTO the dining room (or its aftermath) is already past the
   * door that would have awaited the finale bank, and the trio's kill
   * reactions speak from it on the first shot — so the boundary await moves
   * here for exactly those boots. Every other checkpoint starts without it. */
  if ([PALACE_BEATS.DINING_ROOM, PALACE_BEATS.CLEAR].includes(mission.beat)) {
    await audioBanks.whenNextBeat();
  }
  state.phase = 'active';
  interaction.setPaused(false);
  input.refresh('scene-start');
  inventoryBar.show();
  loadout.apply(weapons);
  syncSuppressor();
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
 * Audio: the three room loops — rain, interior bed, dining tone — simply
 * keep running (startLoop is idempotent per key and the retry never re-runs
 * the start button), so nothing can stack; what the retry DOES own is their
 * automation, and `acoustics.refresh()` below re-asserts every gain from
 * the restored room so a death in the gallery never leaves its hush hanging
 * over a respawn on the approach. The alarm chirp and
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
  /* Gains re-asserted from the restored room; the loops never restarted. */
  acoustics.refresh(player.position);
  /* The body class follows the restored truth: a transient alarm from the
   * dead run (dining-room activation aside) goes dark again, a durable one
   * stays lit without replaying the chirp. */
  document.body.classList.toggle('alarm', security.alarm);
  state.phase = 'active';
  interaction.setPaused(false);
  input.refresh('checkpoint-retry');
  requestGamePointerLock();
  return true;
}

retryButton.addEventListener('click', () => {
  /* Instant in-memory restore first; the full page rebuild stays as the
   * fallback for a missing or pre-v1 checkpoint snapshot. */
  if (!retryFromCheckpoint()) location.reload();
});
addEventListener('pagehide', () => {
  loadout.capture(weapons);
  palaceNavigation.destroy();
});

departButton.addEventListener('click', () => {
  if (campaign.state.missions[MISSION_IDS.CARTEL_PALACE].status !== 'complete') return;
  /* HOME before the Special Meeting.
   *
   * The Palace is over and nobody has told him whether killing Sauce was the
   * right call. He goes home, Booskibro rings to say there is a meeting and it
   * is going to be a special one. Beat 27 belongs to the luxury apartment Lou
   * gave him after the round; its private lift then carries him to the kerb.
   *
   * CartelPalaceCampaignStory.complete() has already made Initiation
   * available. It must not become in_progress here: Special Meeting owns that
   * handoff at the treeline after its drive and forest approach. */
  returnHomeFromMission(campaign, SCENE_IDS.CARTEL_PALACE, { location });
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

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

/**
 * THE BAR AT THE TOP OF THE ROOM, and who it is actually about.
 *
 * It was Mark's, permanently, printed into the markup: `MARK · CARTEL BOSS`,
 * armour bar, health bar. That was honest while the doors opened on Mark. It
 * has not been since the 2026-08-25 rewire -- the doors open on the CHEF, and
 * for the whole of that stage the bar tracked a man standing in another wing
 * of the house, at full health, reading ARMORED. So it follows the stage now:
 * the chef while the chef is the room, Mark when Mark is in it, and nothing
 * at all across the wave, where the room is four ordinary men and a boss bar
 * would be a lie about all five of them.
 */
const BOSS_SUBJECTS = Object.freeze({
  sauce: { entry: () => cast.sauce, name: 'SAUCE · THE CHEF' },
  'reprisal-one': { entry: () => cast.mark, name: 'MARK · CARTEL BOSS' },
  'reprisal-final': { entry: () => cast.mark, name: 'MARK · CARTEL BOSS' },
  done: { entry: () => cast.mark, name: 'MARK · CARTEL BOSS' },
});
function updateBoss() {
  if (ui.boss.classList.contains('hidden')) return;
  const subject = BOSS_SUBJECTS[finale.report().stage] ?? BOSS_SUBJECTS['reprisal-one'];
  const actor = subject.entry()?.actor;
  if (!actor) return;
  if (ui.bossName && ui.bossName.textContent !== subject.name) ui.bossName.textContent = subject.name;
  ui.bossArmor.style.width = `${Math.round(actor.armor / 170 * 100)}%`;
  ui.bossLife.style.width = `${Math.round(actor.health / actor.maxHealth * 100)}%`;
  ui.bossState.textContent = actor.incapacitated ? 'DOWN' : actor.armor > 0 ? 'ARMORED' : 'EXPOSED';
}

/**
 * The objective card follows the same stage, for the same reason: a card that
 * says *"Mark is armored, break his protection"* while Mark is two rooms away
 * sends the player looking for a fight that is not in the room. Cheap enough
 * to poll -- the stage is a string on an object the frame already holds, and
 * nothing is written until it changes.
 */
let bossStage = null;
function updateDiningObjective() {
  if (mission.beat !== PALACE_BEATS.DINING_ROOM) return;
  const stage = finale.report().stage;
  if (stage === bossStage) return;
  bossStage = stage;
  /* The wave is the one stage with nobody to put a bar on. */
  ui.boss.classList.toggle('hidden', stage === 'wave');
  updateObjective(PALACE_DINING_OBJECTIVES[stage]);
}

/**
 * WHEN A ROOM HAS GONE QUIET.
 *
 * Owner asked for post-combat / room-cleared lines. A "room" here is the men
 * posted in it: once the alarm has been up, every guard on a stretch is
 * down, the player is standing in that stretch and nothing live is within
 * eighteen metres, he says so. Nothing fires on a stealth run that never
 * woke anybody -- there is no fight to be the other side of.
 */
const CLEARED_ZONES = Object.freeze([
  Object.freeze({
    line: 'tony.cleared.entry',
    guards: Object.freeze(['entry-watch', 'service-door']),
    inside: (at) => at.z > -4 && at.z < 12,
  }),
  Object.freeze({
    line: 'tony.cleared.halls',
    guards: Object.freeze(['service-hall']),
    inside: (at) => at.z > -17 && at.z <= -4,
  }),
  Object.freeze({
    line: 'tony.cleared.estate',
    guards: Object.freeze(['gallery-east', 'gallery-west']),
    inside: (at) => at.z > -34 && at.z <= -17,
  }),
]);

const EVIDENCE_SPOT_RADIUS = 4.6;

/**
 * The proximity half of the voice layer, on the scene clock.
 *
 * Every trigger here is distance + line of sight through PalaceVoice, so a
 * line cannot fire through a wall or before the player can see who is
 * saying it -- the owner's two explicit conditions.
 */
function updateAmbientVoice(dt) {
  palaceVoice.update(dt);
  bystanders.update(dt);
  /* Runs on the scene clock like everything else here. It reads awareness
   * off the bodies security just ticked, so a man who noticed the player on
   * THIS frame stops talking on this frame. */
  conversations.update(dt);

  const at = player.position;
  if (mission.beat === PALACE_BEATS.ESTATE) {
    for (const [id, target] of Object.entries(palace.evidence)) {
      if (target.userData.collected) continue;
      const spot = EVIDENCE_VOICE[id]?.spot;
      if (!spot) continue;
      const point = target.getWorldPosition(_evidencePoint);
      if (at.distanceTo(point) > EVIDENCE_SPOT_RADIUS) continue;
      palaceVoice.say(spot, { position: point, radius: EVIDENCE_SPOT_RADIUS });
    }
  }

  /* She notices him before he notices her, if he walks in far enough. */
  const cleaner = cast.bystanders[0];
  if (cleaner && !cleaner.down && !cleaner.panicked
    && at.distanceTo(cleaner.root.position) <= 8.5) {
    if (palaceVoice.audible(cleaner.root.position, 8.5)) bystanders.notice(cleaner);
  }

  if (!security.alarm) return;
  const liveNear = cast.guards.some((guard) => (
    !guard.down && guard.active && guard.root.position.distanceTo(at) <= 18
  ));
  if (liveNear) return;
  for (const zone of CLEARED_ZONES) {
    if (!zone.inside(at)) continue;
    const posted = cast.guards.filter((guard) => zone.guards.includes(guard.id));
    if (!posted.length || !posted.every((guard) => guard.down)) continue;
    palaceVoice.say(zone.line);
  }
}

const _evidencePoint = new THREE.Vector3();

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
    /* Room-aware mix: identity-compares the room singleton and touches
     * WebAudio only on a doorway crossing — free on every other frame. */
    acoustics.update(player.position);
    interaction.update(dt);
    finale.update(dt);
    /* PalaceFinaleDirector advances every scripted threshold crossing on its
     * own simulated clock. Inactive during the crossing means nobody fires
     * from off-screen; activation on arrival reaches Security below. */
    security.update(dt, {
      playerPosition: player.position,
      powerCut: state.powerCut,
      crouching: player.crouching,
      finalEncounter: mission.beat === PALACE_BEATS.DINING_ROOM,
    });
    suppression.update(dt);
    weapons.setSuppression(suppression);
    weapons.update(dt, { speed: Math.hypot(player.velocity.x, player.velocity.z) });
    /* The shared system writes the flash's opacity and light from its own
     * decay curve every frame; this scales what it just wrote, so a
     * suppressed shot blooms small and dull instead of throwing a yellow
     * star down a dark corridor. Unsuppressed frames are untouched. */
    suppressor.afterWeaponUpdate(weapons);
    updateAmbientVoice(dt);
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
    updateDiningObjective();
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
  /* WHERE THE PLAYER'S EARS ARE.
   *
   * Owner, 2026-08-24, on the Palace: enemy death audio is spatially wrong --
   * a man dying in front of him reads as behind him.
   *
   * It was not the death sound. `AudioEngine._makePanner` puts every
   * positioned cue at its real world coordinates and lets an HRTF panner work
   * out the bearing, which is correct -- but a bearing is between two points,
   * and the other one is the LISTENER. Nothing in this scene ever moved it.
   * It sat at (0, 0, 0) facing -Z from the first frame to the last, so every
   * shot, body, footstep and voice in the palace was panned as heard by
   * somebody standing at the world origin rather than by the player. The
   * estate runs from about z +40 at the fence to z -50 at the dining room, so
   * the player crosses that origin partway through: sounds that are genuinely
   * ahead of him read as behind from the moment he does.
   *
   * One call per frame, and it must be the CAMERA rather than the player
   * body -- the camera carries the head's yaw and pitch, and a listener with
   * position but no orientation is a listener that cannot tell front from
   * back. `updateListener` also re-samples the followers, which is idempotent
   * with the engine's own rAF pump.
   *
   * Seven other scenes had the same gap and are fixed alongside this one. */
  audio.updateListener(camera);
  postfx.render();
  postfx.sample(dt);
}
requestAnimationFrame(animate);

window.CARTEL_PALACE = {
  campaignStory,
  /** The three-bank residency ledger and the room-aware mix, for checks. */
  audioBanks,
  acoustics,
  mission,
  player,
  input,
  interaction,
  palace,
  palaceNavigation,
  palaceNavigationReady,
  cast,
  finale,
  security,
  suppressor,
  palaceVoice,
  bystanders,
  conversations,
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
  /* The standing order as the mission set it, so a gate can hold the shared
   * objective card to the beat table rather than to itself. */
  get objective() { return state.objective; },
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
        armorTier: armorTierOf(located.entry ?? located.combatant),
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

/* ------------------------------------------------------------------ */
/* Prewarm -- first-shot costs paid behind the menu                    */
/* ------------------------------------------------------------------ */
/* Same bug and same cure as the Squatchfather (src/core/prewarm.js): every
 * hostile muzzle-flash root sits `visible = false` until the first cartel
 * shot, three.js keys every material's shader program on the visible light
 * counts, so the frame the first flash appears is the frame the whole estate
 * needs programs it has never had. The impact decals, blood systems and the
 * player's own muzzle card are cheaper shapes of the same first-use bill.
 * Draw those states once, clipped to a single pixel, behind the overlay --
 * never mid-frame during play. Nothing about the look changes.
 *
 * Boot-once by construction: this runs from the module's single
 * requestAnimationFrame below, and retryFromCheckpoint() restores in memory
 * without re-entering it -- the compiled programs outlive every retry. */

/** Everything hidden now that the firefight puts on screen later. */
function palaceFirstShotObjects() {
  return [
    ballisticImpacts,        // pooled bullet marks ({ pool } holder)
    bloodImpacts.wounds,     // entry wounds
    bloodImpacts.spatter,    // and their secondary marks
    deathBloodPools.meshes,  // spreading floor pools
    weapons.flash,           // the player's own muzzle card
  ];
}

async function prewarmPalaceCombat() {
  const effects = palaceFirstShotObjects();
  /* One flash slot stands in for the pool: every slot shares the same flare
   * material and light configuration, so warming one warms the programs for
   * all twelve. Intensity is irrelevant to the program key but is set anyway
   * so the warm draw is the draw a real shot performs. */
  const slot = hostileMuzzleFlashes.pool[0];
  const flashIntensity = slot.light.intensity;
  slot.light.intensity = slot.peak;
  try {
    return await prewarmScene({
      renderer,
      scene,
      camera,
      // A frame between the passes: the overlay stays clickable while they run.
      spread: true,
      /* Gameplay draws through the composer, and three keys programs on the
       * render target's tone mapping and colour space -- warming the canvas
       * would warm the WRONG programs (prewarm.js, reason 2). */
      options: {
        target: postfx.enabled && postfx.composer ? postfx.composer.readBuffer : null,
      },
      passes: [
        // The estate's own lighting, with every hidden effect object drawn.
        { name: 'combat effects', reveal: effects },
        /* And again with one hostile flash lit: one more visible point light
         * than the estate carries at rest -- the state that used to hitch. */
        { name: 'muzzle flash', reveal: [...effects, slot.root] },
      ],
      /* No pools to fill and no audio wait here: every effect pool above is
       * built eagerly in its constructor, and the start button already awaits
       * loadManifest plus prewarmAudio on the first-shot cues before combat
       * can begin. */
    });
  } finally {
    slot.light.intensity = flashIntensity;
    slot.root.visible = false;
  }
}

/* One frame later -- so the first real render has already put the estate on
 * the GPU -- buy the firefight its shader programs behind the overlay. */
requestAnimationFrame(() => {
  /* Never fatal: a scene that cannot be prewarmed is a scene that hitches
   * once, not one that fails to boot. */
  window.CARTEL_PALACE.prewarming = prewarmPalaceCombat()
    .catch((error) => ({ failed: String(error?.message ?? error) }))
    .then((report) => {
      window.CARTEL_PALACE.prewarmReport = report;
      return report;
    });
});

window.__squatchSceneReady?.('CARTEL PALACE ready');
setTimeout(() => loading.classList.add('out'), 170);
setTimeout(() => loading.remove(), 780);
