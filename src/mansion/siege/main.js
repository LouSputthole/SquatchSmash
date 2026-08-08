/**
 * MANSION UNDER SIEGE -- composition root.
 *
 * The same house, on the worst night it ever has.
 *
 * THE ONE THING TO UNDERSTAND ABOUT THIS FILE. It calls
 * `buildMansionGrounds()` and `buildMansionInterior()` -- the same two
 * builders `src/mansion/main.js` calls for the walking tour, unchanged and
 * unforked -- and then hangs a damage-state overlay on the result. There is
 * no siege copy of the mansion. There is one mansion and two scenes standing
 * in it. See docs/MANSION-SIEGE-NIGHT.md PART 0, and the owner brief it
 * quotes: the house gets designed right ONCE, and improvements the siege
 * exposes go in that document's future-edit table rather than into the
 * builders where they would have to be made again for every version.
 *
 * WHAT LIVES WHERE:
 *   state.js      the six damage states, and what is standing in each
 *   waves.js      who attacks, from where, and when they are released
 *   mission.js    the beat chain, the objectives and the four checkpoints
 *   night.js      emergency light and the alarm's clock
 *   dressing.js   wrecks, fire, bodies, debris, the wrecked centrepiece
 *   glass.js      intact / cracked / broken, and the collider that goes with
 *   attackers.js  the cartel, on the shared combat framework
 *   ensemble.js   the family, armed, on the same framework
 *
 * None of those import each other. This file is the only place they meet.
 *
 * DOM contract: mansion-siege.html. Same chrome as mansion.html plus
 * #objective / #objectiveText, #waveCount / #waveRemaining, #checkpoint,
 * #alarmWash and #damageWash.
 */
import * as THREE from 'three';
import {
  buildMansionGrounds, GROUND_Y, BASEMENT_Y, UPPER_Y,
  GUEST_ROOM, CELLAR_HALL, BASEMENT_ROOM, BUILDING,
} from '../scenes/MansionGrounds.js';
import { buildMansionInterior, FOYER, OFFICE, GALLERY } from '../scenes/MansionInterior.js';
import { Player } from '../../core/player.js';
import { InteractionSystem } from '../../core/interaction.js';
import { AudioEngine } from '../../core/audio.js';
import { PostFX } from '../../core/postfx.js';
import { createPauseMenu } from '../../core/pause-menu.js';
import { WeaponSystem } from '../../core/weapons/WeaponSystem.js';
import { mountArmory } from '../../core/weapons/Armory.js';
import { weaponCueNames } from '../../core/weapons/audio.js';
import { WEAPON_IDS } from '../../core/weapons/catalog.js';
import { SceneInventoryBar } from '../../core/scene-inventory.js';
import {
  createFinalArcLoadout,
  FINAL_ARC_WEAPON_CATALOG,
} from '../../core/final-arc-loadout.js';
import { FACTIONS, FactionMatrix } from '../../core/combat/factions.js';
import { CombatActor } from '../../core/combat/actors.js';
import { SuppressionModel } from '../../core/combat/suppression.js';
import { SCENE_IDS, createCampaign } from '../../core/campaign.js';
import {
  createFinalArcRuntimeSession,
  restoreCompletedFinalArcEntry,
} from '../../core/final-arc-runtime.js';
import { createMansionSiegeCampaignStory } from '../../core/final-arc-story.js';
import { isPreviewMode } from '../../core/preview-mode.js';

import { MansionDamageState } from './state.js';
import { SiegeMission, B, CHECKPOINTS } from './mission.js';
import { SiegeDialogue, SIEGE_SPEAKER_NAMES, siegeVoiceCueNames } from './script.js';
import { REQUIRED_SIEGE_EFFECT_CUES, SiegeMissionAudio } from './audio.js';
import {
  COMBAT_BOUNDARY, DEFENCE_POST, ENCOUNTERS, totalAttackers,
} from './waves.js';
import { buildSiegeNight } from './night.js';
import { buildSiegeDressing } from './dressing.js';
import { buildSiegeGlass } from './glass.js';
import { createAttackerPool } from './attackers.js';
import { buildSiegeEnsemble } from './ensemble.js';
import { flattenTransmission, capShadowCasters, SHADOW_CAP } from '../perf.js';

/* ================================================================== */
/* DOM                                                                   */
/* ================================================================== */
const $ = (id) => document.getElementById(id);
const menuEl = $('menu');
const startBtn = $('startBtn');
const promptEl = $('prompt');
const promptKeyEl = $('promptKey');
const promptLabelEl = $('promptLabel');
const promptHoldEl = $('promptHold');
const objectiveEl = $('objective');
const objectiveTextEl = $('objectiveText');
const objectiveKickerEl = $('objectiveKicker');
const objectiveHintEl = $('objectiveHint');
const waveCountEl = $('waveCount');
const waveRemainingEl = $('waveRemaining');
const waveLabelEl = $('waveLabel');
const checkpointEl = $('checkpoint');
const subtitleEl = $('subtitle');
const subtitleWhoEl = $('subtitleWho');
const subtitleTextEl = $('subtitleText');
const missionCardEl = $('missionCard');
const checkpointTagEl = $('checkpointTag');
const alarmWashEl = $('alarmWash');
const damageWashEl = $('damageWash');
const ammoEl = $('ammo');
const ammoNameEl = $('ammoName');
const ammoMagEl = $('ammoMag');
const ammoReserveEl = $('ammoReserve');
const ammoStateEl = $('ammoState');
const reticleEl = $('reticle');
const helpingEl = $('helping');
const helpingNameEl = $('helpingName');
const helpingBarEl = $('helpingBar');

/** The InteractionSystem's HUD contract: showPrompt / hidePrompt / setHold. */
const tinyHud = {
  showPrompt(label, key = 'E') {
    if (!promptEl) return;
    promptKeyEl.textContent = key;
    promptLabelEl.textContent = label;
    promptEl.classList.remove('hidden');
  },
  hidePrompt() { promptEl?.classList.add('hidden'); },
  setHold(t) { if (promptHoldEl) promptHoldEl.style.width = `${Math.round(t * 100)}%`; },
};

/* ================================================================== */
/* Renderer                                                              */
/* ================================================================== */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
/* A touch under the tour's 1.05. The house is lit by the moon, three lamps
 * and whatever is on fire; the tour's exposure makes a firefight read like a
 * dinner party with the lights down. */
renderer.toneMappingExposure = 0.94;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.08, 260);
scene.add(camera);

/*
 * PostFX -- the same bloom pass the tour mounts (src/mansion/main.js), tuned
 * a shade hotter for a night that is lit by the moon, three lamps and
 * whatever is on fire. The siege runs through the same rooms the tour does
 * (same sconces, same chandeliers, same television sets) plus its own
 * emissive dressing -- `dressing.js`'s breathing fire and LED strips, muzzle
 * flashes, the alarm's emergency posts -- so a strength/threshold pair tuned
 * for a quiet walkthrough would either miss the fire or, raised to catch it,
 * blow the sconces out. Threshold stays close to the tour's (this is still
 * the same house, lit the same way, most of the time); strength is a touch
 * higher so the fire and the muzzle flashes read as light sources rather
 * than as flat bright shapes. The `#alarmWash`/`#damageWash` overlays are
 * plain CSS elements outside the canvas and never touch this pass.
 */
const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
if (postfx.bloom) {
  postfx.bloom.threshold = 1.1;
  postfx.bloom.strength = 0.34;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
});

/* ================================================================== */
/* The house -- the canonical one, built by the canonical builders        */
/* ================================================================== */
const grounds = buildMansionGrounds(scene);
const interior = buildMansionInterior(grounds.shell);
scene.add(grounds.root, interior.root);

const colliders = [...grounds.colliders, ...interior.colliders];
const anchors = { ...grounds.anchors, ...interior.anchors };

/* The nearest-N local light rig, same shape as the tour's: a late-arriving
 * light joins a candidate pool switched off and takes its turn on proximity,
 * so the VISIBLE light count never changes and no material recompiles.
 *
 * THE POOL IS SEEDED FROM THE HOUSE, and that line is the whole reason this
 * page was playable at one frame per second on a 4080 with a five-minute
 * load. `buildMansionGrounds` and `buildMansionInterior` hand back 58 and 170
 * practical point lights respectively -- a lamp on a nightstand, a bulb in a
 * display case, a candle on a dining table -- and every one of them is
 * `visible` when it is built. `src/mansion/main.js` has always emptied that
 * pool into its own rig (its comment records the tour measuring a scene that
 * "never produced a second frame at all, because the shader for ninety-three
 * point lights never finished compiling"). This file declared the identical
 * rig and then seeded it with NOTHING, so the siege ran the same house with
 * 228 visible point lights: three.js compiles every visible light into every
 * material's shader, so the boot was hundreds of 228-light shader compiles
 * and each frame afterwards looped 228 lights per pixel.
 *
 * Measured in the headless harness, before and after this line:
 * 235 -> 17 effectively-visible lights, no first frame inside 360 s -> a
 * first frame in about 2 s. Nothing about the LOOK of the house changes: the
 * moon, the hemisphere fill and the five exterior spots are not in these
 * arrays and stay on, and the ten nearest practicals to the camera are lit
 * exactly as the tour lights its fourteen. */
const ACTIVE_LIGHTS = 10;
const _lightRank = [...grounds.lights, ...interior.lights]
  .map((light) => { light.visible = false; return { light, score: 0 }; });
for (let i = 0; i < Math.min(ACTIVE_LIGHTS, _lightRank.length); i++) {
  _lightRank[i].light.visible = true;
}
let _lightTimer = 0;
function registerLocalLight(light) {
  light.visible = false;
  _lightRank.push({ light, score: 0 });
}
function updateLightRig(dt) {
  _lightTimer -= dt;
  if (_lightTimer > 0) return;
  _lightTimer = 0.2;
  for (const entry of _lightRank) {
    entry.score = entry.light.position.distanceTo(camera.position) - (entry.light.distance || 0);
  }
  _lightRank.sort((a, b) => a.score - b.score);
  for (let i = 0; i < _lightRank.length; i++) _lightRank[i].light.visible = i < ACTIVE_LIGHTS;
}

/* ================================================================== */
/* The overlay                                                           */
/* ================================================================== */
/* `colliders` is the same array `world.colliders` points at, so a collider
 * the overlay enrols is solid on the very next step and one it withdraws is
 * not -- which is the whole mechanism a shattered window runs on. */
const damage = new MansionDamageState({ colliders, state: 'clean' });

const night = buildSiegeNight({ damage, registerLight: registerLocalLight });
scene.add(night.root);

const dressing = buildSiegeDressing({
  damage, grounds, interior, registerLight: registerLocalLight,
});
scene.add(dressing.root);

const glass = buildSiegeGlass({ damage, grounds, interior });
scene.add(glass.root);

/* ================================================================== */
/* Audio                                                                 */
/* ================================================================== */
const audio = new AudioEngine();
const missionAudio = new SiegeMissionAudio(audio);

/* ================================================================== */
/* Player and world                                                      */
/* ================================================================== */
const world = { colliders, floorZones: [], groundAt: () => 0 };
const player = new Player(camera, world);
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

/**
 * Exterior ground, simplified deliberately.
 *
 * The tour's `exteriorGroundAt` also resolves the pool steps, the service
 * ramp and four garden stairs, because the tour is a walk round the whole
 * property. This mission happens indoors from the guest room to the gallery;
 * the only exterior the player can reach is the front portico, and the only
 * slope on it is the front steps. Anything past that is where the attackers
 * come from, and the combat boundary turns the player round before he gets
 * there. See src/mansion/main.js for the full version if this scene ever
 * grows a reason to walk the garden at night.
 */
const FRONT_STEPS = Object.freeze({ x0: -6, x1: 6, z0: 32.2, z1: 36 });
function exteriorGroundAt(x, z) {
  if (x >= FRONT_STEPS.x0 && x <= FRONT_STEPS.x1 && z >= FRONT_STEPS.z0 && z <= FRONT_STEPS.z1) {
    const t = THREE.MathUtils.clamp((z - FRONT_STEPS.z0) / (FRONT_STEPS.z1 - FRONT_STEPS.z0), 0, 1);
    return THREE.MathUtils.lerp(0, GROUND_Y, t);
  }
  return 0;
}

world.groundAt = (x, z) => {
  const feetY = player.position.y - player.eyeHeight;
  return interior.floorAt(x, z, feetY) ?? exteriorGroundAt(x, z);
};

/**
 * Beside the bed in the basement guest room, and BESIDE is the operative
 * word.
 *
 * The first version of this spawned him at the room's centre, which is where
 * the bed is: measured, its collider runs x -13.32..-11.38, z 71.68..74.12,
 * and the room's centre line at x -11.75 is inside it. He woke up standing in
 * the mattress, the resolver shoved him half a metre clear over seven seconds,
 * and the whole opening read as a man who could not walk.
 *
 * So: a metre east of the bed's east face, and facing SOUTH -- the corridor is
 * at z 64.3..67.4, which is on the far side of the room's south wall, so the
 * door and the noise are both in front of him when his eyes open. Yaw 0 faces
 * -Z, which is the same convention `grounds.anchors.spawnYaw` uses.
 */
const GUEST_BED = Object.freeze({ x0: -13.32, x1: -11.38, z0: 71.68, z1: 74.12 });
/* The doorway out, measured off the colliders rather than guessed: the one
 * gap in the guest room's south wall runs x -12.6..-11.5. Standing a metre
 * east of the bed put him a metre and a half EAST of that gap, so walking
 * straight ahead out of bed walked him into the wall beside his own door. */
const GUEST_DOOR_X = -12.05;
const BEDSIDE = Object.freeze({
  /* On the door's centre line, at the foot of the bed, facing the door. */
  x: GUEST_DOOR_X,
  z: GUEST_BED.z0 - 1.2,
  y: BASEMENT_Y,
  yaw: 0,
});

player.mode = 'walk';
player.position.set(BEDSIDE.x, BEDSIDE.y + 1.66, BEDSIDE.z);
player.yaw = BEDSIDE.yaw;
player.ground = BEDSIDE.y;
player.enabled = false;

const interaction = new InteractionSystem(camera, tinyHud);
interaction.raycaster.far = 6;
interaction.setOccluders([...grounds.occluders, ...interior.occluders]);

/* ================================================================== */
/* Combat                                                                */
/*                                                                       */
/* All of it shared. There is no siege-only health, damage or weapon      */
/* code anywhere in this scene -- the brief is explicit about that and     */
/* it is the reason the mission gets the heist's suppression, ballistics   */
/* and hit-location behaviour for free.                                   */
/* ================================================================== */
const matrix = new FactionMatrix();
const suppression = new SuppressionModel();
const playerActor = new CombatActor({
  id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100, armor: 0,
});

const finalArcLoadout = createFinalArcLoadout();
const loadoutBar = new SceneInventoryBar({ catalog: FINAL_ARC_WEAPON_CATALOG, visible: true });
let captureSiegeLoadout = () => {};
const weaponSystem = new WeaponSystem({
  camera,
  world: scene,
  audio,
  groundAt: (x, z) => interior.floorAt(x, z, player.position.y - player.eyeHeight)
    ?? exteriorGroundAt(x, z),
  hitTargets: [...interior.occluders, ...grounds.occluders],
  range: 70,
  onEvent: () => {
    ammoDirty = true;
    captureSiegeLoadout();
  },
});
captureSiegeLoadout = () => {
  finalArcLoadout.capture(weaponSystem);
  loadoutBar.set(finalArcLoadout.items, finalArcLoadout.selected);
  return finalArcLoadout.state;
};
function equipOwnedWeapon(id) {
  const result = finalArcLoadout.acquire(id, weaponSystem.firearm(id).snapshot());
  if (!result.ok) return false;
  finalArcLoadout.select(result.slot, weaponSystem);
  loadoutBar.set(finalArcLoadout.items, finalArcLoadout.selected);
  ammoDirty = true;
  return true;
}
finalArcLoadout.apply(weaponSystem, { equip: false });
loadoutBar.set(finalArcLoadout.items, finalArcLoadout.selected);

const attackers = createAttackerPool({
  scene,
  damage,
  matrix,
  audio,
  registerLight: registerLocalLight,
  onDown: (id) => {
    mission.noteDown(id);
    waveDirty = true;
  },
  /* Where a cartel round landed. The dressing owns the mark; the ensemble
   * owns the flinch. Nothing else can see it happen. */
  onImpact: ({ point, radius = 5 } = {}) => {
    if (point) ensemble.noteImpact(point, radius);
  },
});

const ensemble = buildSiegeEnsemble({ scene, damage, matrix, audio });

/**
 * The player, in the shape the attackers' target list wants.
 *
 * `asTarget` reads `.position`, `.actor` and `.suppression` off whatever it
 * is handed. Handing it the raw Player gives it a position and no actor, so
 * every round would resolve against nothing and the player would be
 * unkillable -- a bug that looks exactly like good luck for the first minute.
 */
const playerTarget = {
  get position() { return player.position; },
  actor: playerActor,
  suppression,
};

/* ================================================================== */
/* The armory                                                            */
/* ================================================================== */
/**
 * What he must leave the armory holding: a primary AND the little friend.
 *
 * Ids come from `core/weapons/catalog.js` WEAPON_IDS and nowhere else. The
 * first version of this listed five plausible machine-gun ids -- m60, minigun,
 * lmg, rpk, saw -- of which exactly one exists. Four of them were a set that
 * could never match, which is the quietest kind of wrong: the gate simply
 * never opened and the line never fired, with nothing anywhere to say why.
 *
 * The belt-fed SAW is the little friend. The Barrett is an anti-materiel
 * rifle -- a fine thing to hold a staircase with and not what the line is
 * about, so it counts as a primary.
 */
const HEAVY_IDS = new Set([WEAPON_IDS.SAW]);
const PRIMARY_TAKEN = new Set();
let heavyTaken = false;

const armory = mountArmory({
  parent: scene,
  system: weaponSystem,
  interaction,
  racks: interior.props.basement.armoryRacks,
  enabled: () => running,
  addCollider: (x0, x1, y0, y1, z0, z1) => {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(Math.min(x0, x1), y0, Math.min(z0, z1)),
      new THREE.Vector3(Math.max(x0, x1), y1, Math.max(z0, z1)),
    ));
  },
  addLight: registerLocalLight,
  retainTaken: true,
  onEvent: (event) => {
    ammoDirty = true;
    if (!event?.id) return;
    if (event.type === 'rack') {
      finalArcLoadout.remove(event.id);
      captureSiegeLoadout();
      return;
    }
    if (event.type === 'resupply') {
      captureSiegeLoadout();
      return;
    }
    if (event.type !== 'take') return;
    const owned = finalArcLoadout.acquire(event.id, weaponSystem.firearm(event.id).snapshot());
    if (!owned.ok) {
      armory.put();
      nudge('Five slots are full. Stow or return a gun before taking another.');
      return;
    }
    captureSiegeLoadout();
    if (HEAVY_IDS.has(event.id)) heavyTaken = true;
    else PRIMARY_TAKEN.add(event.id);
    const done = mission.armed({ primary: PRIMARY_TAKEN.size > 0, heavy: heavyTaken });
    /* HALF-ARMED IS THE QUIET FAILURE. The beat needs BOTH, and a player who
     * takes one gun and walks gets no refusal at all -- the objective simply
     * does not advance. He can be on the top floor, at Lou's door, before
     * anything tells him why the office is not reacting to him, and the rack
     * he needs is two storeys behind him by then. So the rack says it while
     * he is still standing at it. */
    if (!done && mission.beat === B.ARM) {
      nudge(heavyTaken
        ? 'That is the belt-fed. Take a rifle off the rack as well — the swap is what the rack is for.'
        : 'That is your primary. Now the belt-fed, the big one — you are not holding a staircase with that.');
    }
  },
});
for (const id of finalArcLoadout.items) {
  if (!id) continue;
  armory.claim(id);
  if (HEAVY_IDS.has(id)) heavyTaken = true;
  else PRIMARY_TAKEN.add(id);
}

/* ================================================================== */
/* The two bills the house was paying every frame -- see ../perf.js      */
/*                                                                        */
/* The siege stands the same house up, so it was paying the same two: the  */
/* entire opaque scene drawn a second time to refract a decanter, and a    */
/* shadow pass full of objects standing indoors under the only             */
/* shadow-casting light in the scene, which is outside. Run here, after     */
/* the wreckage, the glass, the cartel and the family are all standing, so  */
/* every one of them is measured by the same rule.                          */
/* ================================================================== */
const flatGlass = flattenTransmission([scene]);
const shadowCap = capShadowCasters({
  /* The house's insides. The cartel and the family are NOT on this list --
   * the cartel come up the drive in the open and the size rule below keeps
   * a man-sized figure, which is what makes a body on the forecourt read as
   * being on the forecourt. */
  indoor: [interior.root],
  outdoor: [scene],
});

/* ================================================================== */
/* The mission                                                           */
/* ================================================================== */
let running = false;
let starting = false;
let checkpointReconstructionDepth = 0;
let ammoDirty = true;
let waveDirty = true;
let checkpointToast = 0;

const siegeCampaignPreview = isPreviewMode();
const siegeCampaign = createFinalArcRuntimeSession({
  preview: siegeCampaignPreview,
  campaign: siegeCampaignPreview ? null : createCampaign(),
  sceneId: SCENE_IDS.MANSION_SIEGE,
  spawn: 'guest_suite',
  storyFactory: createMansionSiegeCampaignStory,
});
let siegeCampaignComplete = false;

/* ================================================================== */
/* WHAT PEOPLE SAY                                                       */
/*                                                                       */
/* See ./script.js for why this exists. The short version: three of the   */
/* mission's beats could only be LEFT by calling a method nothing called,  */
/* so a real playthrough stopped dead in Lou's office, and again on the    */
/* landing after wave two. A sequence finishing is what moves the mission  */
/* on now, which makes an unleavable beat a thing you cannot build.        */
/* ================================================================== */
const dialogue = new SiegeDialogue({
  audio,
  onLine: (line) => {
    if (!subtitleEl) return;
    subtitleEl.hidden = false;
    subtitleWhoEl.textContent = (SIEGE_SPEAKER_NAMES[line.speaker] ?? line.speaker).toUpperCase();
    subtitleTextEl.textContent = line.say;
  },
  onDone: (sequence) => {
    if (subtitleEl) subtitleEl.hidden = true;
    /* THE THREE HANDOFFS. Each of these is a mission method that existed
     * from the first commit and that nothing in the scene ever called. */
    if (sequence === 'briefing') mission.briefingEnded();
    if (sequence === 'aftermath') mission.aftermathEnded();
    if (sequence === 'sasole') mission.metSasole();
  },
});

/**
 * Which sequence a beat opens with.
 *
 * `briefing`, `aftermath` and `sasole` are load-bearing -- the mission cannot
 * leave those beats any other way. The rest are guidance and colour, and they
 * are keyed off the beat rather than off a room trigger so a checkpoint jump
 * lands the player in a house where somebody has already told him where to go.
 */
const BEAT_SEQUENCE = Object.freeze({
  [B.TO_ARMORY]: 'wake',
  [B.TO_OFFICE]: 'guide_office',
  [B.BRIEFING]: 'briefing',
  [B.LULL]: 'lull',
  [B.AFTERMATH]: 'aftermath',
});

function recordSiegeCheckpoint(id) {
  if (checkpointReconstructionDepth > 0) return;
  missionAudio.checkpoint(id);
  siegeCampaign.checkpoint(id, {
    attackersDown: mission.attackersDown,
    littleFriendSaid: mission.littleFriendSaid,
    sasoleMet: mission.beat === B.COMPLETE,
  });
  checkpointEl.textContent = (CHECKPOINTS[id]?.label ?? 'CHECKPOINT').toUpperCase();
  checkpointEl.classList.add('show');
  checkpointToast = 2.2;
}

const mission = new SiegeMission({
  damage,
  onObjective: (text, hint, done) => {
    if (!objectiveEl) return;
    /* A new objective outranks a nudge that is still counting down: the
     * nudge corrects the OLD hint, and leaving it up would have it correcting
     * a sentence that is no longer on the screen. */
    nudgeTimer = 0;
    objectiveHintEl?.classList.remove('nudge');
    objectiveEl.hidden = !text;
    objectiveEl.classList.toggle('done', done === true);
    if (objectiveKickerEl) objectiveKickerEl.textContent = done ? 'COMPLETE' : 'OBJECTIVE';
    if (text) objectiveTextEl.textContent = text;
    if (objectiveHintEl) {
      objectiveHintEl.hidden = !hint;
      objectiveHintEl.textContent = hint ?? '';
    }
  },
  onBeat: (beat) => {
    ensemble.stage(beat);
    waveDirty = true;
    if (beat === B.WAVE_ONE) missionAudio.waveIncoming('one');
    if (beat === B.WAVE_TWO) missionAudio.waveIncoming('two');
    const sequence = BEAT_SEQUENCE[beat];
    if (sequence) dialogue.play(sequence);
    if (beat === B.COMPLETE) {
      siegeCampaignComplete = siegeCampaign.complete({
        attackersDown: mission.attackersDown,
        littleFriendSaid: mission.littleFriendSaid,
        sasoleMet: true,
      });
      showMissionCard();
    }
    /* THE TWO FIGHTS THAT ARE NOT WAVES.
     *
     * `ENCOUNTERS` in waves.js authors the corridor's two men and the foyer's
     * three by hand -- no director releases them, so nothing was putting them
     * in the house. The mission tracked their ids and `noteDown` routed to
     * them; they simply were not there, which is the quietest possible way for
     * an encounter to be missing.
     *
     * WHEN each one is placed is the design, not a detail. The corridor pair
     * exist from the frame he opens his eyes -- they are why the guard on the
     * settee is dead. The foyer three go in while he is still in the ARMORY,
     * two rooms and a storey away, which is what waves.js means by "already
     * past the door when the player comes up": he does not see them arrive,
     * he comes up the stair into them. */
    if (beat === B.WAKE) placeEncounter('corridor');
    if (beat === B.ARM) placeEncounter('foyer');
  },
  onSpawn: (order) => {
    attackers.spawn(order);
    /* 2B is the one group in twenty-two that does not come through the front
     * door, and the whole point of it is that the player has to turn round.
     * A man appearing behind you with no warning is a cheap shot; a man
     * appearing behind you a second after somebody shouted "glass" is the
     * beat the brief asked for. */
    if (order?.group === '2B') dialogue.play('flank');
  },
  onCheckpoint: (id) => recordSiegeCheckpoint(id),
});

/**
 * The eleven things a checkpoint restores.
 *
 * `mission.saveCheckpoint()` throws if any of these is missing, which is the
 * point: a checkpoint that quietly forgot the broken glass would put the
 * player back in a house with its windows mended and no way to notice.
 */
mission
  .provide('weapon', {
    capture: () => weaponSystem.equipped ?? null,
    restore: (id) => { if (id) weaponSystem.equip(id); else weaponSystem.stow({ silent: true }); },
  })
  .provide('health', {
    capture: () => playerActor.snapshot(),
    restore: (snap) => { if (snap) playerActor.restore(snap); },
  })
  .provide('ammunition', {
    capture: () => finalArcLoadout.checkpoint(),
    restore: (snapshot) => {
      finalArcLoadout.restore(snapshot, weaponSystem);
      loadoutBar.set(finalArcLoadout.items, finalArcLoadout.selected);
      ammoDirty = true;
    },
  })
  .provide('enemiesDown', {
    capture: () => attackers.snapshot(),
    restore: (snap) => attackers.restore(snap),
  })
  .provide('guardsDown', {
    capture: () => ensemble.snapshot(),
    restore: (snap) => ensemble.restore(snap),
  })
  .provide('damageProps', {
    capture: () => damage.snapshot(),
    restore: (snap) => damage.restore(snap),
  })
  .provide('brokenGlass', {
    capture: () => glass.brokenIds(),
    restore: (ids) => glass.restoreBroken(ids ?? []),
  })
  .provide('objectives', {
    capture: () => ({ heavy: heavyTaken, primaries: [...PRIMARY_TAKEN] }),
    restore: (value) => {
      heavyTaken = value?.heavy === true;
      PRIMARY_TAKEN.clear();
      for (const id of value?.primaries ?? []) PRIMARY_TAKEN.add(id);
    },
  })
  .provide('activeWave', {
    /* The wave rosters live inside the mission's own snapshot; what the SCENE
     * owns is where the player was standing when the wave was live, so a
     * restore does not drop him into the foyer with fourteen men in it. */
    capture: () => ({ x: player.position.x, y: player.ground, z: player.position.z, yaw: player.yaw }),
    restore: (at) => { if (at) teleport(at.x, at.y, at.z, THREE.MathUtils.radToDeg(at.yaw)); },
  })
  .provide('friendlies', {
    capture: () => mission.beat,
    restore: (beat) => { if (beat) ensemble.stage(beat); },
  })
  .provide('dialogue', {
    /* `littleFriend` is mission.js's flag and it restores itself. What the
     * SCENE owns is which conversations have already been heard -- without
     * that, a checkpoint restore after wave one replays Booski's lull line
     * every single time the player goes down on the landing. */
    capture: () => ({ littleFriend: mission.littleFriendSaid, ...dialogue.snapshot() }),
    restore: (value) => {
      dialogue.restore(value);
      if (subtitleEl) subtitleEl.hidden = true;
    },
  });

/* ================================================================== */
/* PICKING PEOPLE BACK UP                                               */
/*                                                                       */
/* Owner, 2026-08-05: "let's do the 1hp option for now and the bleeding   */
/* out mechanic. No deaths."                                              */
/*                                                                        */
/* So a name never dies -- but at 1 HP he goes on the floor, out of the    */
/* fight, asking for help, and he stays there until somebody crosses the   */
/* landing under fire and gets him. He comes back on a third of his        */
/* health. That is the whole cost: no branching ending, no dead cast, and  */
/* the player still has something to lose by ignoring it.                  */
/*                                                                        */
/* Deliberately NOT on `InteractionSystem`: that system raycasts against   */
/* REGISTERED MESHES, and these men move between eight postings a mission. */
/* Registering a moving figure once and hoping is how you get a prompt on   */
/* a man who walked away four beats ago. Proximity plus a held key is the   */
/* honest version.                                                         */
/* ================================================================== */
const REVIVE_RADIUS = 2.4;
const REVIVE_SECONDS = 1.6;
let reviveHeld = 0;
let reviveTarget = null;

function updateRevive(dt) {
  const near = ensemble.nearestDowned?.(player.position, REVIVE_RADIUS) ?? null;
  if (!near) {
    reviveHeld = 0;
    reviveTarget = null;
    if (helpingEl && !helpingEl.hidden) helpingEl.hidden = true;
    return;
  }
  if (near.id !== reviveTarget) { reviveTarget = near.id; reviveHeld = 0; }
  if (helpingEl) {
    helpingEl.hidden = false;
    helpingNameEl.textContent = near.name;
    helpingBarEl.style.width = `${Math.round((reviveHeld / REVIVE_SECONDS) * 100)}%`;
  }
  /* E, not F. F is the little friend and it is said exactly once in a
   * playthrough; binding "pick your uncle up off the floor" to the same key
   * would put the two most dramatic verbs in the mission on one button. */
  if (!player.keys.has('KeyE')) { reviveHeld = 0; return; }
  reviveHeld += dt;
  if (reviveHeld < REVIVE_SECONDS) return;
  reviveHeld = 0;
  if (ensemble.revive?.(near.id)) missionAudio.friendlyRevived(player.position);
}

/**
 * Put an authored encounter in the house.
 *
 * The pool takes both order shapes -- a director's resolved objects and these
 * hand-authored strings -- so the corridor's two men and the twenty-two on
 * the stairs arrive down one code path. Idempotent: a checkpoint restore
 * re-enters the beat, and spawning a man who is already standing there must
 * not produce a second one.
 */
const placedEncounters = new Set();
function placeEncounter(id) {
  const encounter = ENCOUNTERS[id];
  if (!encounter || placedEncounters.has(id)) return 0;
  placedEncounters.add(id);
  for (const member of encounter.members) attackers.spawn(member);
  return encounter.members.length;
}

/**
 * Break whichever pane a man just came through.
 *
 * Nearest-in-plan, not nearest-in-3D: an attacker crosses a sill at about
 * 1.2 m and a bay's panes are stacked, so including height would pick the
 * transom above his head as often as the light he actually stepped through.
 * Six metres is the cut-off -- past that he did not come through a window and
 * breaking one would be a pane going out on the far side of a room for no
 * reason anybody in the house can see.
 */
function shatterNearest({ x, z, opening }) {
  /* THE BREACH KNOWS WHICH WINDOW IT CAME THROUGH, so ask it before guessing.
   *
   * `opening` is the id of the opening the attacker's own authored leg
   * crossed, handed up by `nav.js` — not a proximity guess. Nearest-within-six
   * metres was picking the wrong pane on the east flank: the men come through
   * `lounge.bay.east.south` at 0.8 m, and the nearest INTACT pane was
   * `lounge.bay.south` at 3.6 m — the bay's south window, on a different wall,
   * which nobody had touched. The player heard glass and turned to a hole with
   * nobody in it.
   *
   * The `return null` when the named pane is already broken is the other half
   * and it matters as much: he came through a hole somebody else made, so
   * nothing should break. Glass going is a CUE, and a cue that fires for a man
   * stepping through an existing hole teaches the player to distrust it. */
  if (opening) {
    for (const [id, entry] of glass.panes) {
      if (entry.window !== opening) continue;
      if (entry.state === 'broken') return null;
      if (glass.shatter(id)) {
        missionAudio.glassShattered({ x, y: 1.2, z });
        ensemble.noteImpact({ x, y: 1.2, z }, 7);
        return id;
      }
      return null;
    }
  }
  /* No named opening — a breach the pool could not attribute. Fall back. */
  let best = null;
  let bestDistance = 6;
  for (const [id, entry] of glass.panes) {
    if (entry.state === 'broken') continue;
    /* `centre` is authored; `box` is the collider the shell built and is
     * absent on any pane whose box could not be matched unambiguously. Take
     * the authored one first so an unmatched pane is still breakable. */
    const cx = entry.centre?.x ?? (entry.box ? (entry.box.min.x + entry.box.max.x) / 2 : null);
    const cz = entry.centre?.z ?? (entry.box ? (entry.box.min.z + entry.box.max.z) / 2 : null);
    if (cx === null || cz === null) continue;
    const distance = Math.hypot(cx - x, cz - z);
    if (distance < bestDistance) { bestDistance = distance; best = id; }
  }
  if (best && glass.shatter(best)) {
    missionAudio.glassShattered({ x, y: 1.2, z });
    ensemble.noteImpact({ x, y: 1.2, z }, 7);
    return best;
  }
  return null;
}

/**
 * He went down.
 *
 * The checkpoint is the failure state -- there is no death screen and no
 * retry menu, because the four checkpoints are placed so that the longest
 * thing a death can cost is one wave. `restoreCheckpoint()` puts the beat,
 * the wave rosters, the damage state, the broken glass and the player back
 * where the checkpoint had them; all this has to add is standing him up.
 */
let reviving = false;
/**
 * Headless-verification only.
 *
 * A verifier testing WAVE STRUCTURE stands the player on the landing and
 * ticks. Four men then shoot him, the checkpoint restores him to the beat
 * before the line, and every wave assertion after that measures a mission
 * that correctly went back in time -- which is the mission working, reported
 * as the mission broken. Those are two different claims and they need two
 * different runs. Never set from gameplay; there is no key for it.
 */
let invulnerable = false;
function onPlayerDown() {
  if (invulnerable) {
    playerActor.health = playerActor.maxHealth;
    playerActor.incapacitated = false;
    playerActor.injury = 'none';
    return;
  }
  if (reviving || !mission.checkpoint) return;
  reviving = true;
  weaponSystem.setTrigger(false);
  player.clearKeys?.();
  attackers.despawnAll();
  mission.restoreCheckpoint();
  playerActor.health = playerActor.maxHealth;
  playerActor.armor = 0;
  playerActor.incapacitated = false;
  playerActor.injury = 'none';
  suppression.value = 0;
  ammoDirty = true;
  waveDirty = true;
  reviving = false;
}

/* ================================================================== */
/* Room triggers                                                         */
/*                                                                       */
/* Rects, checked once every few frames rather than every frame: a room    */
/* you are in is a room you are still in a tenth of a second later, and     */
/* this runs while twenty-two people are shooting at you.                  */
/* ================================================================== */
const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
let triggerTimer = 0;

/**
 * How close to Captain Sasole counts as meeting him.
 *
 * Proximity, not `InteractionSystem`, and for the same reason the revive is:
 * that system raycasts REGISTERED MESHES and this man walks between three
 * postings. A prompt bolted to where he was standing in the aftermath is a
 * prompt on empty air by the time the player gets to him.
 */
const SASOLE_RADIUS = 2.6;

function updateTriggers(dt) {
  triggerTimer -= dt;
  if (triggerTimer > 0) return;
  triggerTimer = 0.12;
  const { x, z } = player.position;
  const feet = player.position.y - player.eyeHeight;
  if (mission.beat === B.TO_ARMORY) {
    if (inRect(BASEMENT_ROOM, x, z) && feet < GROUND_Y - 1) {
      mission.enteredArmory();
      mission.armed({ primary: PRIMARY_TAKEN.size > 0, heavy: heavyTaken });
      return;
    }
    /* Out of the bedroom and into the corridor: Booski, on the house radio,
     * says which end of it the armory is. The objective card says WHAT and
     * this says WHICH WAY, and it fires here rather than on the beat so it
     * arrives when the player is actually looking down the corridor. */
    if (inRect(CELLAR_HALL, x, z) && feet < GROUND_Y - 1) dialogue.play('guide_armory');
    return;
  }
  if (mission.beat === B.TO_OFFICE && inRect(OFFICE, x, z) && feet > UPPER_Y - 1) {
    mission.enteredOffice();
    return;
  }
  /* The handoff. He is standing on the landing in a flight jacket; walk up to
   * him and the mission ends. */
  if (mission.beat === B.TO_SASOLE && !dialogue.active) {
    const sasole = ensemble.members?.get?.('captain_lou_sasole') ?? null;
    if (sasole && sasole.root.position.distanceTo(player.position) < SASOLE_RADIUS) {
      dialogue.play('sasole');
    }
  }
}

/**
 * The combat boundary, applied to the player as a shove rather than a wall.
 * The brief keeps ATTACKERS inside it; the player needs the same treatment
 * for the same reason -- a defender who walks into the hedge maze is a
 * defender the waves cannot reach.
 */
function holdTheLine() {
  const p = player.position;
  p.x = THREE.MathUtils.clamp(p.x, COMBAT_BOUNDARY.x0, COMBAT_BOUNDARY.x1);
  p.z = THREE.MathUtils.clamp(p.z, COMBAT_BOUNDARY.z0, COMBAT_BOUNDARY.z1);
}

/* ================================================================== */
/* Firing                                                                */
/* ================================================================== */
const SCREEN_CENTRE = new THREE.Vector2(0, 0);
const raycaster = new THREE.Raycaster();

function fire() {
  if (!running || pauseMenu.isPaused()) return;
  const shot = weaponSystem.triggerPress();
  if (!shot?.fired) return;
  ammoDirty = true;
  raycaster.setFromCamera(SCREEN_CENTRE, camera);
  const hits = raycaster.intersectObject(attackers.root, true);
  const first = hits[0];
  if (!first) return;
  const actor = attackers.actorFor(first.object);
  if (!actor) return;
  attackers.registerHit(first.object, shot.damage, shot.penetration);
}

/* ================================================================== */
/* Input                                                                 */
/*                                                                       */
/* `Player` DOES NOT LISTEN FOR ITS OWN KEYS. It exposes setKey/clearKeys */
/* and every scene wires its own handlers -- see the identical block in    */
/* src/mansion/main.js and src/heist/main.js. Leaving this out is a scene  */
/* that boots, renders, locks the pointer and simply never moves, with no  */
/* error anywhere to say why. It cost this file one verifier run.          */
/* ================================================================== */
window.addEventListener('keydown', (e) => {
  if (!running) return;
  if (e.code === 'Space') e.preventDefault();
  player.setKey(e.code, true);
  if (e.code === 'KeyE' && !e.repeat) interaction.press();
  if (e.code === 'KeyR' && !e.repeat) { weaponSystem.reload(); ammoDirty = true; }
  if (e.code === 'KeyQ' && !e.repeat && weaponSystem.equipped) {
    finalArcLoadout.stow(weaponSystem);
    loadoutBar.set(finalArcLoadout.items, finalArcLoadout.selected);
    ammoDirty = true;
  }
  if (!e.repeat && /^Digit[1-5]$/.test(e.code)) {
    finalArcLoadout.select(Number(e.code.slice(5)) - 1, weaponSystem);
    loadoutBar.set(finalArcLoadout.items, finalArcLoadout.selected);
    ammoDirty = true;
    e.preventDefault();
  }
  /* The line. Once, ever, and only with the heavy up on the landing. */
  if (e.code === 'KeyF' && !e.repeat) tryTheLine();
  /* Skip the rest of whoever is talking. Enter, deliberately: Space is jump,
   * and putting "skip the briefing" on the jump key means a first-time player
   * who hops on the spot in Lou's office never hears the mission explained.
   *
   * NOT a cancel -- `finish()` runs the sequence's `onDone`, so skipping the
   * briefing still ENDS the briefing. A skip that quietly left the mission in
   * the beat it was skipping is the softlock this whole pass removed. */
  if (e.code === 'Enter' && !e.repeat && dialogue.active) dialogue.finish();
  // B — the same bloom toggle every PostFX-mounted scene answers to.
  if (e.code === 'KeyB' && !e.repeat) postfx.toggle();
});
window.addEventListener('wheel', (e) => {
  if (!running) return;
  const occupied = finalArcLoadout.items;
  if (occupied.filter(Boolean).length <= 1) return;
  let index = finalArcLoadout.selected;
  for (let tries = 0; tries < occupied.length; tries++) {
    index = (index + (e.deltaY > 0 ? 1 : -1) + occupied.length) % occupied.length;
    if (!occupied[index]) continue;
    finalArcLoadout.select(index, weaponSystem);
    loadoutBar.set(finalArcLoadout.items, finalArcLoadout.selected);
    ammoDirty = true;
    break;
  }
}, { passive: true });
window.addEventListener('keyup', (e) => {
  player.setKey(e.code, false);
  if (e.code === 'KeyE') interaction.release();
});
window.addEventListener('blur', () => {
  player.clearKeys();
  interaction.release();
  weaponSystem.setTrigger(false);
});
window.addEventListener('pagehide', () => captureSiegeLoadout());
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.handleMouseMove(e.movementX, e.movementY);
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!running) return;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
    return;
  }
  if (e.button === 0) fire();
});

/* ================================================================== */
/* THE NUDGE -- why the key you just pressed did nothing                 */
/*                                                                       */
/* `tryTheLine()` has three conditions and used to fail all three in      */
/* SILENCE. Standing on the landing with the objective up, the hint       */
/* underneath it saying "press F", and F doing nothing at all -- no       */
/* sound, no text, no flicker -- a first-time player has no way to tell a */
/* mission that is waiting for him from a mission that is broken. The     */
/* sentence on his HUD is the one he has just decided is lying to him,    */
/* and the gun he is holding is the reason, and nothing anywhere says so. */
/*                                                                       */
/* The reachable version of that is not exotic. `mountArmory` swaps       */
/* rather than stacks -- `take()` puts the equipped weapon back before it */
/* hands over the next -- so the player carries ONE long gun, and the     */
/* mission's own gate is "took a primary AND the heavy" without caring    */
/* which of the two he walked out with. Take them in the other order and  */
/* the belt-fed is on the rack, two floors down, and F is dead.           */
/*                                                                       */
/* So a failed press answers. It borrows the hint line rather than adding */
/* a fourth HUD element: that line is the sentence being corrected, the   */
/* player's eye is already on it, and it goes back to the beat's own hint */
/* when the nudge expires.                                                */
/* ================================================================== */
let nudgeTimer = 0;

function nudge(text, seconds = 4) {
  if (!objectiveHintEl) return false;
  objectiveEl.hidden = false;
  objectiveHintEl.hidden = false;
  objectiveHintEl.textContent = text;
  objectiveHintEl.classList.add('nudge');
  nudgeTimer = seconds;
  return true;
}

/** Put the beat's own hint back. Also called when the beat changes under it. */
function clearNudge() {
  if (nudgeTimer <= 0) return;
  nudgeTimer = 0;
  objectiveHintEl?.classList.remove('nudge');
  if (!objectiveHintEl) return;
  const hint = mission.hint;
  objectiveHintEl.hidden = !hint;
  objectiveHintEl.textContent = hint ?? '';
}

function updateNudge(dt) {
  if (nudgeTimer <= 0) return;
  nudgeTimer -= dt;
  if (nudgeTimer <= 0) clearNudge();
}

/**
 * "Say hello to my little friend."
 *
 * Conditions, all of them: the briefing is over, the heavy is in his hands,
 * and he is standing on the firing step. Then the line plays, full control
 * stays with the player, and wave 1A comes through the door. `sayHello()`
 * returns true exactly once in a playthrough -- a checkpoint restore after
 * it cannot hand it back -- so this needs no flag of its own.
 */
function tryTheLine() {
  if (mission.beat !== B.LITTLE_FRIEND) return false;
  if (!HEAVY_IDS.has(weaponSystem.equipped ?? '')) {
    nudge('Not that gun — the belt-fed. It is still on the armory rack, down the cellar stair.');
    return false;
  }
  const { x, z } = player.position;
  const onTheStep = x >= DEFENCE_POST.x0 && x <= DEFENCE_POST.x1
    && z >= DEFENCE_POST.z0 && z <= DEFENCE_POST.z1;
  if (!onTheStep) {
    nudge('Not from here — the lit step at the rail, between the sandbags, over the front door.');
    return false;
  }
  if (!mission.sayHello()) return false;
  /* Through the dialogue runner, not a bare `audio.play`, so the line gets a
   * subtitle like every other line in the mission -- and so it is one of the
   * `vo.siege.*` cues the recording sheet knows about. It used to be a lone
   * `siege.prospect.little_friend` with no subtitle and no manifest entry:
   * silent, unrecorded, unrecordable, and nothing anywhere reporting it.
   * docs/ENGINE-TRAPS.md #3, and #8 on why the `vo.` prefix is load-bearing. */
  dialogue.play('little_friend');
  return true;
}

/* ================================================================== */
/* HUD                                                                   */
/* ================================================================== */
function refreshAmmo() {
  if (!ammoDirty || !ammoEl) return;
  ammoDirty = false;
  const hud = weaponSystem.hud?.();
  if (!hud) { ammoEl.classList.add('hidden'); reticleEl?.classList.add('hidden'); return; }
  ammoEl.classList.remove('hidden');
  reticleEl?.classList.remove('hidden');
  ammoNameEl.textContent = hud.name ?? '';
  ammoMagEl.textContent = String(hud.rounds ?? 0);
  ammoReserveEl.textContent = String(hud.reserve ?? 0);
  ammoStateEl.textContent = hud.state ?? '';
}

/**
 * The counter in the top right.
 *
 * IT DOES NOT GO BLANK IN THE LULL, and that is the point of the second
 * branch. Played through, the nine seconds between the waves read exactly
 * like the end of the mission: the shooting stops, the last attacker count
 * disappears, and the only thing on screen still says "Hold the house" --
 * which a player who has just held it for three minutes reads as stale HUD.
 * Two of the three people who would walk off the firing step there would be
 * downstairs when 2A came through the door. So the counter counts the lull
 * down instead of hiding, and Booski says the same thing out loud.
 *
 * `waveDirty` cannot gate the countdown -- a number that changes every second
 * needs a tick every second -- so the lull refreshes unconditionally.
 */
let lullShown = -1;
function refreshWaveCount() {
  if (!waveCountEl) return;
  const lull = mission.lullRemaining;
  if (lull !== null) {
    const seconds = Math.max(0, Math.ceil(lull));
    if (seconds !== lullShown) {
      lullShown = seconds;
      waveCountEl.hidden = false;
      waveRemainingEl.textContent = String(seconds);
      if (waveLabelEl) waveLabelEl.textContent = 'UNTIL THE NEXT LOT';
    }
    waveDirty = false;
    return;
  }
  lullShown = -1;
  if (!waveDirty) return;
  waveDirty = false;
  if (waveLabelEl) waveLabelEl.textContent = 'ATTACKERS';
  const wave = mission.activeWave;
  if (!wave) { waveCountEl.hidden = true; return; }
  waveCountEl.hidden = false;
  const left = wave.totalCount - wave.down.size;
  waveRemainingEl.textContent = String(left);
}

/* ================================================================== */
/* THE END OF THE MISSION                                                */
/*                                                                       */
/* The brief's last objective is "Meet Captain Sasole", and meeting him    */
/* used to do nothing observable at all: the beat advanced to COMPLETE and  */
/* the player stood on a landing in a burnt house with an objective card    */
/* that had gone blank, forever. There is no Enola Squatch handoff to make  */
/* here -- the campaign wiring between the two missions does not exist and  */
/* this file is not the place to invent it -- so what the card does instead */
/* is TELL THE TRUTH: the mission is over, here is what you did, here is    */
/* the way out, and here is why the aeroplane is a separate link.          */
/* ================================================================== */
let missionCardShown = false;
function showMissionCard({ attackersDown = mission.attackersDown } = {}) {
  if (missionCardShown || !missionCardEl) return;
  missionCardShown = true;
  /* EVERY NUMBER HERE COMES OFF A LEDGER RATHER THAN OFF THE LIVE SCENE, and
   * the first version of this card came off the live scene and lied twice.
   * It reported 2 attackers down at the end of a run that had put down all
   * twenty-seven, because `attackers.all()` is who is on the board now and
   * `despawnAll()` empties the board between phases; and it reported 0 family
   * left because `ensemble.targets()` is a shooting-permission list, not a
   * census. See `SiegeMission.attackersDown` and `ensemble.census()` for the
   * long version of both. A summary screen that quietly reports the wrong
   * number is worse than no summary screen: it is the only thing the player
   * takes away from the mission. */
  const roll = totalAttackers();
  const family = ensemble.census();
  const set = (id, value) => { const el = $(id); if (el) el.textContent = String(value); };
  set('tallyAttackers', attackersDown);
  set('tallyAttackersOf', `OF ${roll.total} ATTACKERS DOWN`);
  set('tallyFamily', family.alive);
  set('tallyFamilyOf', `OF ${family.total} FAMILY ALIVE`);
  set('tallyGlass', glass.brokenIds().length);
  missionCardEl.classList.remove('hidden');
  /* Hand the mouse back. A card with links on it behind a locked pointer is
   * a card nobody can click, which is how a "clean ending" becomes a
   * softlock with better typography. */
  document.exitPointerLock?.();
  player.clearKeys?.();
  weaponSystem.setTrigger(false);
  running = false;
}
$('replayBtn')?.addEventListener('click', () => window.location.reload());
$('continueBtn')?.addEventListener('click', (event) => {
  if (siegeCampaignPreview || !siegeCampaignComplete) return;
  event.preventDefault();
  siegeCampaign.navigate(SCENE_IDS.ENOLA_SQUATCH, { spawn: 'airfield' });
});

/* ================================================================== */
/* The wake-up                                                           */
/*                                                                       */
/* "Do not begin with a long cinematic. Use a brief wake-up animation,     */
/*  then return control to the player quickly."                            */
/*                                                                        */
/* 1.6 seconds. The camera starts flat on its back looking at the guest-   */
/* room ceiling and rights itself; the alarm and the gunfire are already   */
/* running before the first frame, which is what makes it a wake-up        */
/* rather than a title card.                                               */
/* ================================================================== */
const WAKE_SECONDS = 1.6;
let waking = 0;

function startWaking() {
  waking = WAKE_SECONDS;
  player.enabled = false;
  player.pitch = Math.PI / 2 - 0.12;
  camera.rotation.z = 0.5;
}

function updateWaking(dt) {
  if (waking <= 0) return;
  waking = Math.max(0, waking - dt);
  const t = 1 - waking / WAKE_SECONDS;
  const eased = t * t * (3 - 2 * t);
  player.pitch = THREE.MathUtils.lerp(Math.PI / 2 - 0.12, -0.06, eased);
  camera.rotation.z = THREE.MathUtils.lerp(0.5, 0, eased);
  if (waking > 0) return;
  camera.rotation.z = 0;
  player.enabled = true;
  mission.wokeUp();
}

/* ================================================================== */
/* Pause                                                                 */
/* ================================================================== */
const clock = new THREE.Clock();

const pauseMenu = createPauseMenu({
  title: 'Mansion Under Siege',
  canPause: () => running,
  getObjective: () => mission.objective ?? 'Hold the house.',
  instructions: [
    'W A S D -- move. Mouse -- look. Shift -- sprint. C -- crouch. Space -- jump.',
    'Left mouse fires. R reloads. E takes or returns a rack weapon. 1–5 select; Q stows.',
    'F -- say it, once, from the top of the stairs with the heavy in your hands.',
    'E -- held, next to somebody on the floor, gets them back on their feet.',
    'Enter skips the rest of a line. Tab pauses and resumes.',
    'Escape releases the mouse, which also pauses.',
  ],
  onPause: () => {
    interaction.setPaused(true);
    weaponSystem.setTrigger(false);
    player.clearKeys();
    if (audio.ctx?.state === 'running') audio.ctx.suspend();
  },
  onResume: () => {
    interaction.setPaused(false);
    if (audio.ctx?.state === 'suspended') audio.ctx.resume();
    clock.getDelta();
    renderer.domElement.requestPointerLock?.();
  },
});

/* ================================================================== */
/* CHECKPOINT ENTRY -- ?checkpoint=wake|armed|briefed|wave_one            */
/*                                                                       */
/* WHY THIS IS PARSED HERE AND NOT IN `src/core/preview-mode.js`.        */
/*                                                                       */
/* The shared module owns scene selection; this page-local parser owns the */
/* siege's four mission checkpoint poses. Every checkpoint URL is preview  */
/* isolated, while an ordinary start claims the canonical campaign scene. */
/*                                                                        */
/* IT REPLAYS THE BEATS RATHER THAN FAKING THEM. Every jump below walks    */
/* the real `mission` methods in the real order -- wokeUp, enteredArmory,  */
/* armed, enteredOffice, briefingEnded -- so a checkpoint start cannot     */
/* produce a mission state a played run never could. The alternative,      */
/* writing `mission.beat` directly, is how you get a preview where the      */
/* foyer three were never placed and the gallery is quiet.                 */
/* ================================================================== */
const CHECKPOINT_ENTRIES = Object.freeze({
  wake: Object.freeze({
    label: 'WAKE UP', blurb: 'The guest room, from the top. The whole mission.',
  }),
  armed: Object.freeze({
    label: 'ARMED',
    blurb: 'Out of the armory with a primary and the belt-fed, on the way up to Lou.',
    /* At the foot of the basement stair, facing the way up. */
    at: Object.freeze({ x: 7.2, y: BASEMENT_Y, z: 55.5, yaw: 0 }),
  }),
  briefed: Object.freeze({
    label: 'BRIEFED',
    blurb: 'Lou has put you on the stairs. Take the firing step and say it.',
    /* On the gallery, north of the balcony mouth, looking south at it. */
    at: Object.freeze({ x: 0, y: UPPER_Y, z: 50.6, yaw: 180 }),
  }),
  wave_one: Object.freeze({
    label: 'WAVE ONE HELD',
    blurb: 'The lull. Reload; wave two is nine seconds out.',
    at: Object.freeze({ x: 0, y: UPPER_Y, z: 46.6, yaw: 0 }),
  }),
});

/** The requested checkpoint, or null. Unknown values are ignored, not guessed. */
function requestedCheckpoint() {
  let value = null;
  try { value = new URLSearchParams(window.location.search).get('checkpoint'); } catch { value = null; }
  return value && Object.hasOwn(CHECKPOINT_ENTRIES, value) ? value : null;
}
const startCheckpoint = siegeCampaignPreview ? requestedCheckpoint() : null;

if (startCheckpoint && startCheckpoint !== 'wake') {
  const entry = CHECKPOINT_ENTRIES[startCheckpoint];
  startBtn.textContent = `START AT: ${entry.label}`;
  if (checkpointTagEl) {
    checkpointTagEl.hidden = false;
    checkpointTagEl.innerHTML = `<h3>CHECKPOINT</h3><div><b>${entry.label}</b> ${entry.blurb}</div>`;
  }
}

/**
 * Fast-forward the mission to a checkpoint, through its own beat chain.
 *
 * The one place this does something a played run does not is wave one: the
 * `wave_one` checkpoint means "wave one is held", and holding it for real
 * takes three minutes. So the director is run out on its own clock with every
 * man it releases marked down, which is the same arithmetic a real fight
 * performs, and then the bodies are cleared off the landing.
 */
function withCheckpointReconstruction(run) {
  checkpointReconstructionDepth += 1;
  try {
    return missionAudio.withSuppressedEvents(
      () => dialogue.withSuppressedPlayback(run),
    );
  } finally {
    checkpointReconstructionDepth -= 1;
  }
}

function jumpToCheckpoint(id) {
  if (id === 'wake' || !CHECKPOINT_ENTRIES[id]) return false;
  return withCheckpointReconstruction(() => {
    mission.wokeUp();
    mission.enteredArmory();
    equipOwnedWeapon(WEAPON_IDS.CARBINE);
    PRIMARY_TAKEN.add(WEAPON_IDS.CARBINE);
    heavyTaken = true;
    mission.armed({ primary: true, heavy: true });
    if (id === 'armed') return true;

    mission.enteredOffice();
    dialogue.play('briefing');
    dialogue.finish();
    equipOwnedWeapon(WEAPON_IDS.SAW);
    if (id === 'briefed') return true;

    /* Wave one, fought and won on the clock. `sayHello()` is the real gate --
     * beat, line flag and wave director all move exactly as they do when the
     * player presses F on the step. */
    if (!mission.sayHello()) return false;
    dialogue.finish();
    for (let guard = 0; guard < 400 && mission.beat === B.WAVE_ONE; guard++) {
      for (const attackerId of [...mission.waves.one.standing]) mission.noteDown(attackerId);
      mission.update(0.5);
    }
    attackers.despawnAll();
    ammoDirty = true;
    waveDirty = true;
    return mission.beat === B.LULL;
  });
}

/* ================================================================== */
/* Boot                                                                  */
/* ================================================================== */
async function beginSiege() {
  if (running || starting) return false;
  starting = true;
  const idleLabel = startBtn.textContent;
  startBtn.disabled = true;
  try {
    const campaignEntry = siegeCampaign.begin();
    if (!campaignEntry.ok) {
      if (restoreCompletedFinalArcEntry(campaignEntry, {
        preview: siegeCampaignPreview,
        restore: () => {
          siegeCampaignComplete = true;
          menuEl.classList.add('hidden');
          showMissionCard({
            attackersDown: siegeCampaign.story?.mission?.attackersDown ?? 0,
          });
        },
      })) return false;
      if (checkpointTagEl) {
        checkpointTagEl.hidden = false;
        checkpointTagEl.textContent = campaignEntry.reason === 'already_complete'
          ? 'This siege is already complete in the current campaign.'
          : 'Mansion Under Siege is not available in the current campaign.';
      }
      return false;
    }
    startBtn.textContent = 'LOADING AUDIO…';
    await audio.init();
    /* Checkpoint dialogue, weapons and Siege effects can all fire synchronously
     * once the mission begins. Decode those playable banks before starting so a
     * real recording is never replaced by a one-shot synth fallback. */
    await audio.loadManifest({ names: siegeEffectCueNames() }).catch(() => {});
    await audio.loadAdditional({ names: [...weaponCueNames(), ...siegeVoiceCueNames()] }).catch(() => {});
    /* A direct/legacy entry still gets the nightstand .45. Campaign entry keeps
     * the exact guns, selected slot and ammunition brought out of the previous
     * Mansion scene instead of replacing them at boot. */
    if (!finalArcLoadout.items.some(Boolean)) finalArcLoadout.acquire(WEAPON_IDS.REVOLVER);
    finalArcLoadout.apply(weaponSystem);
    loadoutBar.set(finalArcLoadout.items, finalArcLoadout.selected);
    ammoDirty = true;
    const entryCheckpoint = campaignEntry.resumed
      && Object.hasOwn(CHECKPOINT_ENTRIES, campaignEntry.checkpoint)
      ? campaignEntry.checkpoint
      : startCheckpoint;
    if (entryCheckpoint && entryCheckpoint !== 'wake') {
      const restored = withCheckpointReconstruction(() => {
        mission.start(B.WAKE);
        return jumpToCheckpoint(entryCheckpoint);
      });
      if (!restored) throw new Error(`Could not restore Siege checkpoint: ${entryCheckpoint}`);
      recordSiegeCheckpoint(entryCheckpoint);
      const at = CHECKPOINT_ENTRIES[entryCheckpoint].at;
      if (at) teleport(at.x, at.y, at.z, at.yaw);
      /* A checkpoint start has already had its wake-up. Skipping it also skips
       * `mission.wokeUp()`, which `jumpToCheckpoint` has already called. */
      waking = 0;
      player.enabled = true;
    } else {
      mission.start(B.WAKE);
      startWaking();
    }
    running = true;
    menuEl.classList.add('hidden');
    renderer.domElement.requestPointerLock?.();
    clock.getDelta();
    return true;
  } finally {
    starting = false;
    startBtn.disabled = false;
    if (!running) startBtn.textContent = idleLabel;
  }
}
startBtn.addEventListener('click', beginSiege);

/**
 * Cue names this scene wants preloaded. Kept beside the mission it serves.
 *
 * These six effects are REQUIRED authored cues. Runtime synthesis may keep a
 * playtest moving, but it is not completion: the verifier checks every name
 * here against both manifest metadata and the generated file index before it
 * checks browser residency. The SPOKEN lines come off `./script.js`,
 * `tools/siege-vo.mjs` puts every one of them in the manifest, and the
 * recording sheet has carried them since. See ENGINE-TRAPS #3 for the three
 * previous times a scene shipped without that and nobody found out.
 *
 * Exported so tools/verify-mansion-siege.mjs can recompute the scene's own
 * selector rather than retyping it -- the same reason
 * src/mansion/scenes/SilentSquatch.js exports `silentSquatchCueNames()`. */
export { REQUIRED_SIEGE_EFFECT_CUES } from './audio.js';

export function siegeEffectCueNames() {
  return [...REQUIRED_SIEGE_EFFECT_CUES];
}

export function siegeCueNames() {
  return [...siegeEffectCueNames(), ...siegeVoiceCueNames()];
}

/* ================================================================== */
/* Frame                                                                 */
/* ================================================================== */
let framesRendered = 0;
let renderEnabled = true;

function updateGame(dt) {
  updateWaking(dt);
  player.update(dt);
  holdTheLine();
  updateLightRig(dt);
  updateTriggers(dt);
  interaction.update();
  weaponSystem.update(dt, { speed: player.velocity?.length?.() ?? 0 });
  suppression.update(dt);
  mission.update(dt);
  /* AFTER the mission, not before: a sequence's `onDone` advances the beat,
   * and a beat advanced before `mission.update()` has run its wave director
   * spends one frame with the new beat and the old wave. */
  dialogue.update(dt);
  night.update(dt);
  missionAudio.updateEnvironment({
    alarmActive: damage.activeLayers.has('alarm'),
    alarmStruck: night.alarm.struck,
    fireActive: damage.activeLayers.has('battle'),
  });
  dressing.update(dt);
  glass.update(dt);
  /* `alive` is the crew the cartel may engage, and it is deliberately
   * `ensemble.targets()` rather than `ensemble.members` -- that call is the
   * Snow-free list, and it is the first of the two locks keeping him out of
   * hostile targeting. The second is `userData.neverTargeted` on his own
   * root, which the pool checks before it ever reaches the faction matrix. */
  attackers.update(dt, {
    player: playerTarget,
    colliders,
    alive: () => ensemble.targets(),
    onPlayerHit: ({ fatal }) => { if (fatal) onPlayerDown(); },
    /* A man came through a window: break it for real, so the hole he used is
     * a hole the player can shoot back through. The pool reports WHERE he
     * crossed rather than which pane, because it does not own the glass --
     * so the nearest pane to the crossing is the one that went. */
    onBreach: (breach) => { if (breach) shatterNearest(breach); },
  });
  updateRevive(dt);
  ensemble.update(dt, {
    player: playerTarget,
    colliders,
    attackers,
    onHostileDown: (id) => { mission.noteDown(id); waveDirty = true; },
  });
  grounds.update?.(dt);
  interior.update?.(dt);

  /* The alarm's wash on the screen edges runs off the SAME phase the
   * emergency lights do, so the room and the frame pulse together. */
  if (alarmWashEl) {
    alarmWashEl.style.opacity = damage.activeLayers.has('alarm')
      ? String(0.06 + 0.2 * (night.posts[0]?.light.intensity ?? 0) / 2.6) : '0';
  }
  if (damageWashEl) {
    damageWashEl.style.opacity = String(
      Math.max(suppression.vignette, 1 - playerActor.health / playerActor.maxHealth) * 0.9,
    );
  }
  if (checkpointToast > 0) {
    checkpointToast -= dt;
    if (checkpointToast <= 0) checkpointEl.classList.remove('show');
  }
  updateNudge(dt);
  refreshAmmo();
  refreshWaveCount();
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (running && !pauseMenu.isPaused()) updateGame(dt);
  if (renderEnabled) { postfx.render(); postfx.sample(dt); framesRendered++; }
}
requestAnimationFrame(frame);

/* ================================================================== */
/* Debug handle -- what tools/verify-mansion-siege.mjs drives             */
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
  waking = 0;
  menuEl.classList.add('hidden');
  player.update(1 / 60);
}

window.mansionSiege = {
  campaign: {
    preview: siegeCampaignPreview,
    state: () => siegeCampaign.campaign?.state ?? null,
    get completed() { return siegeCampaignComplete; },
  },
  THREE,
  scene,
  camera,
  renderer,
  postfx,
  player,
  audio,
  missionAudio,
  interaction,
  grounds,
  interior,
  colliders,
  get collidersCount() { return colliders.length; },
  /** The overlay, so a verifier can drive states rather than infer them. */
  damage,
  get state() { return damage.state; },
  setState: (name) => damage.apply(name),
  liveNames: () => damage.liveNames(),
  /** Only what the siege ADDED -- the list a clean house must return empty. */
  addedNames: () => damage.addedNames(),
  suppressedNames: () => damage.suppressedNames(),
  /** The mission, so a verifier can walk the beats without playing them. */
  mission,
  get beat() { return mission.beat; },
  get objective() { return mission.objective; },
  get hint() { return mission.hint; },
  get checkpoint() { return mission.checkpoint?.id ?? null; },
  beats: {
    wake: () => mission.wokeUp(),
    armory: () => mission.enteredArmory(),
    arm: () => mission.armed({ primary: true, heavy: true }),
    office: () => mission.enteredOffice(),
    briefed: () => mission.briefingEnded(),
    line: () => tryTheLine(),
    aftermath: () => mission.aftermathEnded(),
    sasole: () => mission.metSasole(),
  },
  /**
   * The conversations, so a verifier can play the mission to its end rather
   * than reach into `mission` and pretend it did. `beats.briefed()` above
   * asks "does the method work"; `dialogue.finish()` asks "does the beat the
   * player is standing in actually end", which is the different and more
   * important question -- and the one nothing was asking when the briefing
   * had no way out at all.
   */
  dialogue,
  get speaking() { return dialogue.line?.say ?? null; },
  get speakingSequence() { return dialogue.sequence; },
  skipDialogue: () => dialogue.finish(),
  /** The HUD's own words, read off the DOM the player is looking at. */
  hud: () => ({
    objective: objectiveEl?.hidden ? null : objectiveTextEl?.textContent ?? null,
    hint: objectiveHintEl?.hidden ? null : objectiveHintEl?.textContent ?? null,
    /* The correction, when one is up. Separate from `hint` so a verifier can
     * tell "the mission is telling him where to go" from "the mission is
     * telling him why the key he pressed did nothing". */
    nudge: objectiveHintEl?.classList.contains('nudge')
      ? objectiveHintEl?.textContent ?? null : null,
    subtitle: subtitleEl?.hidden ? null : subtitleTextEl?.textContent ?? null,
    counter: waveCountEl?.hidden ? null
      : `${waveRemainingEl?.textContent ?? ''} ${waveLabelEl?.textContent ?? ''}`.trim(),
    complete: missionCardEl ? !missionCardEl.classList.contains('hidden') : false,
  }),
  /** Checkpoint entry, as the ?checkpoint= URLs drive it. */
  checkpointEntries: () => Object.keys(CHECKPOINT_ENTRIES),
  get startCheckpoint() { return startCheckpoint; },
  jumpToCheckpoint: (id) => jumpToCheckpoint(id),
  /** The people. */
  attackers,
  ensemble,
  /** Who is on the floor, and picking one up. Nobody in here ever dies. */
  downed: () => ensemble.downed(),
  revive: (id) => ensemble.revive(id),
  get living() { return attackers.living().length; },
  /** The glass, which is the one damage state the player writes to. */
  glass,
  dressing,
  night,
  /** The rooms this mission routes through, for a verifier's tour. */
  route: {
    guestRoom: { ...GUEST_ROOM, y: BASEMENT_Y },
    cellarHall: { ...CELLAR_HALL, y: BASEMENT_Y },
    armory: { ...BASEMENT_ROOM, y: BASEMENT_Y },
    foyer: { ...FOYER, y: GROUND_Y },
    gallery: { ...GALLERY, y: UPPER_Y },
    office: { ...OFFICE, y: UPPER_Y },
    defencePost: DEFENCE_POST,
    boundary: COMBAT_BOUNDARY,
    building: BUILDING,
  },
  encounters: ENCOUNTERS,
  /** Everyone the mission ever sends at the player: encounters + both waves. */
  attackerRoll: () => totalAttackers(),
  /** Which authored encounters are standing in the house right now. */
  placed: () => [...placedEncounters],
  encounterStanding: (id) => (ENCOUNTERS[id]?.members ?? [])
    .filter((m) => attackers.entry(m.id) && !attackers.entry(m.id).actor.incapacitated).length,
  anchors,
  teleport,
  start: () => beginSiege(),
  /** What is in his hands, and putting something there. For the verifier. */
  loadout: {
    get slots() { return finalArcLoadout.items; },
    get selected() { return finalArcLoadout.selected; },
    get equipped() { return finalArcLoadout.equipped; },
    checkpoint: () => finalArcLoadout.checkpoint(),
    select: (index) => finalArcLoadout.select(index, weaponSystem),
  },
  get equipped() { return weaponSystem.equipped ?? null; },
  get playerHealth() { return playerActor.health; },
  get playerDown() { return playerActor.incapacitated; },
  /** Headless only -- see the note on `invulnerable`. */
  setInvulnerable(on) { invulnerable = on !== false; return invulnerable; },
  /** Put him on the floor, to prove the checkpoint catches him. */
  killPlayer() {
    playerActor.health = 0;
    playerActor.incapacitated = true;
    onPlayerDown();
    return mission.beat;
  },
  equip: (id) => {
    equipOwnedWeapon(id);
    return weaponSystem.equipped ?? null;
  },
  /**
   * Step the simulation on the scene's own clock rather than on real
   * animation frames. Every verify-*.mjs in this repo drives scenes this
   * way: swiftshader's frame rate says nothing about how far a held key
   * should have moved you, so the keys are real and the clock is ours.
   */
  tick(seconds = 1, step = 1 / 60) {
    for (let elapsed = 0; elapsed < seconds; elapsed += step) {
      updateGame(Math.min(step, seconds - elapsed));
    }
  },
  setRendering(on) { renderEnabled = !!on; },
  get framesRendered() { return framesRendered; },
  get running() { return running; },
  get paused() { return pauseMenu.isPaused(); },
  /**
   * The frame's own bill, so tools/verify-mansion-siege.mjs can assert the
   * budget instead of taking "it booted" for a performance claim. Same shape
   * as the tour's `window.mansion.perf`; see ../perf.js for what each number
   * is and why `info.autoReset` has to come off to read the shadow pass.
   */
  perf: {
    ...SHADOW_CAP,
    transmissionMaterialsFlattened: flatGlass.materials,
    transmissionMeshesFlattened: flatGlass.meshes,
    shadowCastersKept: shadowCap.kept,
    shadowCastersDropped: shadowCap.dropped,
    get visibleLights() {
      let n = 0;
      scene.traverse((o) => {
        if (!o.isLight) return;
        for (let p = o; p; p = p.parent) if (p.visible === false) return;
        n++;
      });
      return n;
    },
    shadowCasters() {
      let n = 0;
      scene.traverse((o) => { if (o.isMesh && o.castShadow) n++; });
      return n;
    },
    transmissiveMeshes() {
      let n = 0;
      scene.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (m && m.transmission > 0) { n++; return; }
        }
      });
      return n;
    },
    drawCalls() {
      const auto = renderer.info.autoReset;
      renderer.info.autoReset = false;
      renderer.info.reset();
      renderer.render(scene, camera);
      const out = {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
      renderer.info.autoReset = auto;
      return out;
    },
  },
};
