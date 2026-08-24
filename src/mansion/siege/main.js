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
import { SPEECH_MIX_CLOSE, speak } from '../../core/dialogue.js';
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
import { attachPixelRatio } from '../../core/pixel-ratio.js';
import { createPauseMenu } from '../../core/pause-menu.js';
import { translateKey, shakeScale } from '../../core/settings.js';
import { createPromptHud } from '../../core/hud.js';
import { createCampaignSceneRecovery } from '../../core/campaign-scene-skip.js';
import { prewarmAudio, prewarmScene } from '../../core/prewarm.js';
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
import {
  CombatAudio, CombatStepCadence, GROUND_COMBAT_AUDIO_CUES,
} from '../../core/combat/audio.js';
import { combatArmor, CombatStatusHud } from '../../core/combat/hud.js';
import { SuppressionModel } from '../../core/combat/suppression.js';
import { CombatSuppressionField } from '../../core/combat/suppression-field.js';
import { CombatSupplyState } from '../../core/combat/supplies.js';
import { SCENE_IDS, createCampaign } from '../../core/campaign.js';
import {
  createFinalArcRuntimeSession,
  restoreCompletedFinalArcEntry,
} from '../../core/final-arc-runtime.js';
import { createMansionSiegeCampaignStory } from '../../core/final-arc-story.js';
import { isPreviewMode } from '../../core/preview-mode.js';
/* The shared primitive builders, for the one prop this file owns outright --
 * the foyer line cache. Same three helpers ./armor-cache.js builds the plate
 * carrier from, so the crate is made of exactly what the rest of the house is
 * made of and shares its material cache. */
import { box, cylinder, mat } from '../../world/build.js';
import { SmokeSystem } from '../../world/smoke.js';
import { BloodImpactSystem, DeathBloodPool } from '../../world/blood.js';
import { BallisticImpactSystem } from '../../world/impacts.js';

import { MansionDamageState } from './state.js';
import { SiegeMission, B, CHECKPOINTS } from './mission.js';
import { isSiegeLineWeapon, resolveArmoryTake } from './armory-policy.js';
import { SiegeDialogue, SIEGE_SPEAKER_NAMES, siegeVoiceCueNames } from './script.js';
import { REQUIRED_SIEGE_EFFECT_CUES, SIEGE_AMBIENCE_CUES, SiegeMissionAudio } from './audio.js';
import {
  COMBAT_BOUNDARY, DEFENCE_POST, ENCOUNTERS, totalAttackers,
} from './waves.js';
import { buildSiegeNight, scoreSiegeLight } from './night.js';
import { buildSiegeDressing, tippedRestY } from './dressing.js';
import { buildSiegeArmorCache } from './armor-cache.js';
import { buildSiegeGlass } from './glass.js';
import { ateamBarkCueNames, createAttackerPool } from './attackers.js';
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
const huntPipEl = $('huntPip');
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

/**
 * The InteractionSystem's HUD contract: showPrompt / hidePrompt / setHold.
 *
 * THE LABEL IS MARKUP, NOT TEXT, and that is why this is now an import. Every
 * descriptor in this repo writes its prompt as a small fragment of HTML --
 * `Use <b>triage</b> &mdash; 2 dressings left` -- and `src/core/interaction.js`
 * documents it that way at the top of the file. This scene once assigned it to
 * `textContent`, so the player standing at the medical case read the tag and
 * the entity literally off his own HUD: owner, verbatim, *"Healing crate shows
 * a bunch of underneath coding instead of it"*. It was never the crate; it was
 * the sentence in front of it. Fixing it here fixed it here, and silvercase
 * went on carrying the same bug in its own copy for weeks.
 *
 * The hold bar also had no null branch: `setHold(null)` -- the call that means
 * "stop holding" -- wrote `0%` because `null * 100` is 0, which is the right
 * answer by arithmetic accident.
 */
const tinyHud = createPromptHud({
  prompt: promptEl,
  label: promptLabelEl,
  key: promptKeyEl,
  holdFill: promptHoldEl,
});

/* ================================================================== */
/* Renderer                                                              */
/* ================================================================== */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
/* Wave F (#19, #20) reached every scene but this one -- the siege was on its
 * own branch at the time. Same 1.5 cap it always had, now with the adaptive
 * ladder under it and the discrete adapter asked for by name. This is the
 * heaviest scene in the game (a burning house, two waves and the whole
 * armoury), so it is the one that most needs to be able to climb down.
 * `attachPixelRatio`'s default onChange fires a resize, which is already
 * what re-sizes PostFX below, so the composer follows the ratio down. */
attachPixelRatio(renderer);
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
const siegeSmoke = new SmokeSystem(scene);
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
/* TWO LISTS, BECAUSE THEY ANSWER TWO DIFFERENT QUESTIONS.
 *
 * `colliders` is what a body may not walk into, and it deliberately contains
 * no floor slab: a slab in it is read as a wall by `core/player.js` and ejects
 * anyone standing on it sideways off its own footprint. Both builders carry
 * scar tissue from exactly that, and neither list changed here.
 *
 * `combatBlockers` is the other half -- every floor, ceiling and roof slab in
 * the house, plus the thirteen interior walls whose movement colliders are
 * trimmed 0.3 m clear of the floor above, each tagged with its real Combat
 * material. Nothing walks into it and everything shoots into it.
 *
 * They were one list until now, and the missing half is the owner's report:
 * *"In the siege I'm getting killed in the cellar before I even go up, no one
 * is down there."* Nobody was. A rifleman standing in the foyer on the ground
 * floor had a clear line of sight AND a clear ballistic path down into the
 * basement armory, because as far as `AabbCombatSpace.trace` was concerned
 * there was nothing between them -- a vertical ray from the player's head
 * crossed zero boxes. Simulated against the real geometry, he was dead in
 * 10.9 seconds without the man ever coming downstairs.
 *
 * So: perception, ballistics and suppression get `combatColliders`. Movement,
 * the damage overlay and the player's own world keep `colliders`. Anything
 * that asks "can this be seen or shot through" takes the first; anything that
 * asks "can a body stand here" takes the second. */
const combatColliders = [
  ...colliders,
  ...(grounds.combatBlockers ?? []),
  ...(interior.combatBlockers ?? []),
];
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
    entry.score = scoreSiegeLight(entry.light, camera.position);
  }
  _lightRank.sort((a, b) => a.score - b.score);
  for (let i = 0; i < _lightRank.length; i++) _lightRank[i].light.visible = i < ACTIVE_LIGHTS;
}

/* Read-only production evidence surface.  Rank is the scheduler's actual
 * latest ordering, not a verifier-side reconstruction of a partial pool. */
function lightStatus(light) {
  const index = _lightRank.findIndex((entry) => entry.light === light);
  const entry = index >= 0 ? _lightRank[index] : null;
  return {
    candidate: entry !== null,
    visible: light?.visible === true,
    intensity: Number(light?.intensity ?? 0),
    distance: Number(light?.distance ?? 0),
    rank: index >= 0 ? index + 1 : null,
    activeLimit: ACTIVE_LIGHTS,
    candidateCount: _lightRank.length,
    score: Number.isFinite(entry?.score) ? Number(entry.score.toFixed(5)) : null,
  };
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
  damage, grounds, interior, smokeSystem: siegeSmoke, registerLight: registerLocalLight,
});
scene.add(dressing.root);

/* ================================================================== */
/* Audio                                                                 */
/* ================================================================== */
const audio = new AudioEngine();
const missionAudio = new SiegeMissionAudio(audio);
const glass = buildSiegeGlass({
  damage,
  grounds,
  interior,
  onCrack: ({ position }) => missionAudio.glassCracked(position),
  onShatter: ({ position }) => missionAudio.glassShattered(position),
});
scene.add(glass.root);
const SIEGE_COMBAT_CUES = Object.freeze([...new Set([
  ...GROUND_COMBAT_AUDIO_CUES,
  'heist.player.hit',
  'heist.gear.armor.pickup',
  'heist.bullet.whiz',
  'heist.bullet.impact',
  /* The night bed and the off-screen battle (see ./audio.js). They decode with
   * the combat bank rather than with the six required effects because they are
   * atmosphere: a missing one costs a synth hum, not a missing story beat. */
  ...SIEGE_AMBIENCE_CUES,
])]);

/* ================================================================== */
/* Player and world                                                      */
/* ================================================================== */
const world = {
  colliders, floorZones: [], groundAt: () => 0, snapGroundToSurface: true,
};
const player = new Player(camera, world);
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

/**
 * Exterior ground, simplified deliberately.
 *
 * The tour's `exteriorGroundAt` also resolves the pool steps, the service
 * ramp and four garden stairs, because the tour is a walk round the whole
 * property. This mission happens indoors from the guest room to the gallery,
 * so it needs the front entry plus the two break-in stairs that become open
 * player routes once their panes shatter. The pool, service, and garden runs
 * remain tour-only; see src/mansion/main.js for that full exterior resolver.
 */
function exteriorGroundAt(x, z) {
  return grounds.props.siegeBreachGroundAt(x, z)
    ?? grounds.props.frontEntry.groundAt(x, z)
    ?? 0;
}

/**
 * THE FIFTEEN CENTIMETRES THAT ATE THE CLIMB.
 *
 * Measured (probe over `interior.floorAt`): the horseshoe's top tread tops
 * out at z 48.05 and the gallery's rendered slab starts at 48.20, and inside
 * that strip the rendered-floor ray sails past both and reports the FOYER
 * floor, 4.7 m down. The conference-to-office door threshold carries the
 * same kind of strip at z ~63. With `snapGroundToSurface` on, one blipped
 * probe is not a stumble, it is `position.y = ground + eyeHeight` -- a
 * player cresting either flight was slammed to the ground floor mid-stride,
 * walked on north UNDER the gallery, and finished his climb by falling down
 * the open cellar stair, which is how `verify:mansion-siege`'s office leg
 * ended at ground -2.78. Reproduced identically at ce98ccd, so these are
 * the base house's seams, not a siege regression; the overlay may not edit
 * `MansionInterior.js`, so the siege makes its own walk seam-tolerant.
 *
 * The rule: a probe that says the floor just vanished more than 1.6 m from
 * under feet that were standing on it is asked to prove it. Four shoulder
 * samples 22 cm out re-ask the same resolver; if any of them still stands
 * within a step of the previous support, the player is straddling a seam
 * and rides the far side across. If the whole neighbourhood agrees the
 * floor is gone -- the cellar shaft, the gallery edge, a real hole -- the
 * drop is accepted unchanged. Cost: four extra queries, only on the frame a
 * cliff appears.
 */
const GROUND_SEAM_REACH = 0.22;
const GROUND_SEAM_DROP = 1.6;
const GROUND_SEAM_STEP = 0.9;
let lastResolvedGround = null;
const resolveFloor = (x, z, feetY) => interior.floorAt(x, z, feetY) ?? exteriorGroundAt(x, z);

world.groundAt = (x, z) => {
  const feetY = player.position.y - player.eyeHeight;
  const floor = resolveFloor(x, z, feetY);
  const previous = lastResolvedGround;
  const suddenCliff = previous !== null && floor !== null
    && previous - floor > GROUND_SEAM_DROP
    && Math.abs(feetY - previous) <= GROUND_SEAM_STEP;
  if (!suddenCliff) {
    lastResolvedGround = floor;
    return floor;
  }
  for (const [dx, dz] of [
    [GROUND_SEAM_REACH, 0], [-GROUND_SEAM_REACH, 0],
    [0, GROUND_SEAM_REACH], [0, -GROUND_SEAM_REACH],
  ]) {
    const near = resolveFloor(x + dx, z + dz, feetY);
    if (near !== null && Math.abs(near - previous) <= GROUND_SEAM_STEP) {
      lastResolvedGround = near;
      return near;
    }
  }
  lastResolvedGround = floor;
  return floor;
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
  id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100, armor: 0, maxArmor: 75,
});
const combatHud = new CombatStatusHud({ actor: playerActor, visible: false });

/* ================================================================== */
/* THE SUPPLY ECONOMY                                                    */
/*                                                                        */
/* Owner, 2026-08-24: "In the siege we should have backup ammo up top      */
/* plus more health."                                                      */
/*                                                                          */
/* WHAT HE WAS ACTUALLY RUNNING OUT OF, counted rather than felt.            */
/*                                                                           */
/* One `CombatSupplyState` used to hold two triage charges and two resupply   */
/* charges FOR THE WHOLE MISSION, and every visible supply surface drew on     */
/* that single instance. There were two ammunition caches on the gallery --    */
/* the firing-step crate at (-2.25, 6.0, 46.45) and the west flank cans at     */
/* (-4.25, 6.0, 50.75) -- sharing two charges between them, so pressing E at   */
/* each one exhausted the entire upstairs supply and both prompts then read    */
/* "empty" for the remaining twenty-two men. Two caches you can see is two     */
/* caches a player counts on; one pool behind them is a promise the scene      */
/* was not keeping.                                                            */
/*                                                                              */
/* And between the basement armory at BASEMENT_Y and the balcony bay there was  */
/* nothing at all: the player climbed the cellar stair, crossed the rear hall,  */
/* fought the foyer three (rifle + smg + flanker, 250 effective HP) and climbed */
/* the horseshoe dry, arriving at the fight he is supposed to hold with         */
/* whatever the corridor and the foyer had left him.                            */
/*                                                                               */
/* THE DEMAND, off the real tables. Twenty-seven men: five authored             */
/* (`ENCOUNTERS` in ./waves.js) and twenty-two across the two waves (`WAVES`).  */
/* Their `ROLES` health and armour add up to 2425 health + 104 armour, and      */
/* `CombatActor.applyHit` spends armour one-for-one against the damage it       */
/* absorbs, so the mission's whole target pool is 2529 effective points. Of     */
/* that, 420 stands on the ground floor and 2109 upstairs.                       */
/*                                                                               */
/* An AK-47 is 46 points a chest hit (`WEAPON_CATALOG`), and `HIT_ZONES` in     */
/* ./attackers.js multiplies that by 2.6 for a head and 0.58 for a limb. Killing */
/* all twenty-seven with nothing but chest hits and no misses costs 60 rounds;   */
/* the twenty-two upstairs cost 50. Nobody fires at a 100% chest rate off a rail */
/* six metres above a forecourt at night, and at a realistic 40% effective-hit   */
/* rate the staircase defence wants about 125 rounds and closer to 150 once limb */
/* hits are in the mix. A 30-round magazine plus its 150-round catalog reserve   */
/* is 180 rounds; a resupply charge tops that reserve up by                       */
/* `capacity * magazinesPerWeapon` = 60. So the upstairs fight needs somewhere    */
/* between two and four charges' worth of rifle ammunition on top of what he      */
/* carries up, and it used to be given two -- shared with the armour it also      */
/* dispenses, and shared across two caches.                                       */
/*                                                                                 */
/* THE INCOMING SIDE. An attacker's AK is scaled by PLAYER_DAMAGE_SCALE 0.45 to    */
/* 20.7 raw a round. Armour eats 55% of a raw hit and pays for it one-for-one       */
/* (`CombatActor.applyHit`), so an armour point is a raw point absorbed and a       */
/* health point is a raw point taken. The old economy was 100 health + 2x45 triage  */
/* = 190 health and 75 + 2x45 = 165 armour: 355 raw damage, SEVENTEEN AK rounds     */
/* spread across twenty-seven attackers. The plan below is 325 health and 345       */
/* armour, which is 670 raw and thirty-two rounds -- and the upstairs half of it    */
/* alone (100 + 4x45 health, 75 + 5x45 armour) is 580 raw and twenty-eight. Still   */
/* about one hit per attacker, which is what "survivable, not free" means on a      */
/* rail you are supposed to be using as cover.                                      */
/*                                                                                 */
/* WHY FOUR `CombatSupplyState`s AND NOT A NEW SYSTEM. The shared class already    */
/* is the per-station model -- it owns a station's charges and its bounded grants, */
/* and `CombatActor`/`Firearm` stay the health and ammunition authorities either   */
/* way. Nothing in it says a scene may only own one. This is a scene-configuration */
/* fix: four instances, one per physical cache, and the contract in               */
/* tests/combat-supplies.test.mjs is untouched.                                    */
/* ================================================================== */
const SIEGE_SUPPLY_CACHES = Object.freeze({
  /* THE GROUND-FLOOR LEG. A guard's crate shoved against the foyer's east
   * wall at the foot of the east flight -- see `SIEGE_FOYER_CACHE_SPOT`. One
   * dressing and one resupply, deliberately small: this is a top-up taken
   * under the front door's guns on the way past, not a depot. Two charges
   * here would mostly be wasted anyway, because a player arriving from the
   * armory is close enough to full that `useResupply()` refuses the press. */
  foyerLine: Object.freeze({
    triageCharges: 1,
    resupplyCharges: 1,
    triageHeal: 45,
    armorPerUse: 45,
    magazinesPerWeapon: 2,
  }),
  /* The firing step's own belt crate: the hero position, so the deepest
   * cache. Three charges is 180 rifle rounds and 135 armour, which is the
   * bulk of the 150-round staircase estimate above. */
  firingStep: Object.freeze({
    triageCharges: 0,
    resupplyCharges: 3,
    triageHeal: 0,
    armorPerUse: 45,
    magazinesPerWeapon: 2,
  }),
  /* The west flank cans on the gallery rail. Two, and they are the reason a
   * player who has spent the step's crate holding the east flight has
   * somewhere to go that is not the end of the mission. */
  flankCache: Object.freeze({
    triageCharges: 0,
    resupplyCharges: 2,
    triageHeal: 0,
    armorPerUse: 45,
    magazinesPerWeapon: 2,
  }),
  /* Gratin's field case on the east gallery flank, and the only healing in
   * the house. Four dressings at 45 is 180 health on top of the player's
   * 100, which is the "more health" half of the owner's note: the ceiling for
   * the staircase defence moves from 190 to 280, and to 325 once the foyer
   * satchel on the way up is counted. There is no regeneration anywhere in
   * src/core/combat/actors.js, so this number IS the health ceiling. */
  triageCase: Object.freeze({
    triageCharges: 4,
    resupplyCharges: 0,
    triageHeal: 45,
    armorPerUse: 0,
    magazinesPerWeapon: 0,
  }),
});

/**
 * The four caches, live.
 *
 * Declaration order is load-bearing in one narrow place: the aggregate
 * `window.mansionSiege.supplies` view below drains them in this order, so a
 * headless drain empties the ground floor before the gallery, which is the
 * order a player walks them in.
 */
const combatSupplyCaches = Object.freeze(Object.fromEntries(
  Object.entries(SIEGE_SUPPLY_CACHES)
    .map(([id, plan]) => [id, new CombatSupplyState(plan)]),
));

/**
 * WHAT A CHECKPOINT GUARANTEES, AND THE RETRY TRAP IT EXISTS TO KILL.
 *
 * `supplies` is a checkpoint field (mission.js CHECKPOINT_FIELDS) and it was
 * captured and restored exactly: whatever charges were left at the moment the
 * checkpoint was written are the charges every retry from it gets back. That
 * reads as fair and is not, because `CHECKPOINTS.wave_one` resumes at B.LULL
 * -- the checkpoint is written when wave one ENDS. A player who spent both his
 * charges holding wave one had the checkpoint record "zero", and then every
 * single retry of wave two started at zero, forever, with `respawnFromCheckpoint()`
 * handing back full health and the same empty crates. Each attempt was poorer
 * than the last real one, so the death that cost him the most was the one that
 * made the fight hardest. That is the opposite of what a checkpoint is for.
 *
 * The rule now: A CHECKPOINT RESTORE TOPS EACH CACHE UP TO THE FLOOR THE BEAT
 * AHEAD OF IT NEEDS, AND NEVER TAKES ANYTHING AWAY. `max(saved, floor)`,
 * clamped to the cache's own maximum. Three things follow from it.
 *
 *   - A retry is never poorer than the guarantee. Wave two from `wave_one` is
 *     always fought with at least two firing-step charges, one flank charge
 *     and two dressings -- enough for fourteen men including the armoured
 *     three of 2C -- however badly wave one went.
 *   - Conserving still pays. A player who reaches the lull with everything
 *     intact keeps everything intact; the floor only ever raises a shortfall.
 *     Refilling to full instead would have made spending the crates free and
 *     turned "hold the house" into "hold the house, then die on purpose".
 *   - The floor is smaller than the stock. Two of three, one of two, two of
 *     four. Dying is still expensive, it is just no longer cumulative.
 *
 * A cache BEHIND the checkpoint gets no floor. `foyerLine` is not listed at
 * `briefed` or `wave_one` because it stands on the ground floor with the
 * cartel coming through the front door: guaranteeing a refill the player
 * cannot safely reach would be a promise about a crate, not about the fight.
 *
 * Keyed by checkpoint id. Missing cache => floor of zero, i.e. keep what was
 * saved and add nothing.
 */
const SIEGE_SUPPLY_FLOORS = Object.freeze({
  wake: Object.freeze({
    foyerLine: Object.freeze({ triage: 1, resupply: 1 }),
    firingStep: Object.freeze({ resupply: 3 }),
    flankCache: Object.freeze({ resupply: 2 }),
    triageCase: Object.freeze({ triage: 4 }),
  }),
  /* Armed, in the cellar: the whole mission is still ahead of him. */
  armed: Object.freeze({
    foyerLine: Object.freeze({ triage: 1, resupply: 1 }),
    firingStep: Object.freeze({ resupply: 3 }),
    flankCache: Object.freeze({ resupply: 2 }),
    triageCase: Object.freeze({ triage: 4 }),
  }),
  /* Briefed, on the landing: both waves ahead, the foyer behind. */
  briefed: Object.freeze({
    firingStep: Object.freeze({ resupply: 3 }),
    flankCache: Object.freeze({ resupply: 2 }),
    triageCase: Object.freeze({ triage: 4 }),
  }),
  /* The lull: fourteen men left, which is 64% of the staircase defence. */
  wave_one: Object.freeze({
    firingStep: Object.freeze({ resupply: 2 }),
    flankCache: Object.freeze({ resupply: 1 }),
    triageCase: Object.freeze({ triage: 2 }),
  }),
});

/** Which checkpoint a beat belongs to; every checkpoint owns a distinct beat. */
const SIEGE_CHECKPOINT_BY_BEAT = new Map(
  Object.values(CHECKPOINTS).map((entry) => [entry.beat, entry.id]),
);

const supplyCacheIds = Object.freeze(Object.keys(combatSupplyCaches));

function totalSupplyCharges() {
  let triage = 0;
  let resupply = 0;
  for (const state of Object.values(combatSupplyCaches)) {
    triage += state.triageRemaining;
    resupply += state.resupplyRemaining;
  }
  return { triage, resupply };
}

/**
 * The mission's supply state, as one record.
 *
 * `triageCharges` / `resupplyCharges` are the MISSION TOTALS and they stay at
 * the top level on purpose: `window.mansionSiege.supplies.snapshot()` is what
 * tools/verify-mansion-siege.mjs reads to drain and re-check the stations, and
 * the campaign's own `normalizeMansionSiegeCheckpointSnapshot()` in
 * src/core/campaign.js accepts nothing else. `caches` carries the truth the
 * scene restores from.
 */
function supplySnapshot(checkpointId = null) {
  const totals = totalSupplyCharges();
  const caches = {};
  for (const id of supplyCacheIds) caches[id] = combatSupplyCaches[id].snapshot();
  return {
    triageCharges: totals.triage,
    resupplyCharges: totals.resupply,
    checkpoint: checkpointId,
    caches,
  };
}

/**
 * Put the caches back, then raise them to the checkpoint's floor.
 *
 * The `caches` half can be missing entirely -- a campaign resume arrives
 * through `normalizeMansionSiegeCheckpointSnapshot()`, which is a src/core
 * function this pass does not own and which flattens the whole supply state to
 * two integers clamped to 0..2. Four counters do not fit in two clamped
 * integers, and inventing a distribution from them would be a lie about where
 * the player left his ammunition. So a snapshot with no `caches` restores to
 * the checkpoint's floor and nothing more: the guarantee is honest, and a
 * resumed campaign is a fresh session anyway.
 */
function restoreSiegeSupplies(snapshot, checkpointId = snapshot?.checkpoint ?? null) {
  const saved = snapshot?.caches ?? null;
  const floor = SIEGE_SUPPLY_FLOORS[checkpointId] ?? null;
  for (const id of supplyCacheIds) {
    const state = combatSupplyCaches[id];
    state.restore(saved?.[id] ?? { triageCharges: 0, resupplyCharges: 0 });
    const guarantee = floor?.[id];
    if (!guarantee) continue;
    state.triageCharges = Math.max(state.triageCharges, Math.min(
      state.maxTriageCharges, Math.trunc(Number(guarantee.triage) || 0),
    ));
    state.resupplyCharges = Math.max(state.resupplyCharges, Math.min(
      state.maxResupplyCharges, Math.trunc(Number(guarantee.resupply) || 0),
    ));
  }
  refreshSupplyProps();
  return supplySnapshot(checkpointId);
}

const combatAudio = new CombatAudio({ audio });
const combatSteps = new CombatStepCadence({ audio: combatAudio });
const ballisticImpacts = new BallisticImpactSystem(scene, { audio: combatAudio });
const suppressionField = new CombatSuppressionField({ colliders });
const bloodImpacts = new BloodImpactSystem(scene);
const deathBloodPools = new DeathBloodPool(scene, { capacity: 14 });

/* WeaponSystem and the two cast Adapters still own their catalog fire/reload
 * cues. Physical combat presentation belongs to the shared Modules above, so
 * suppress only the three legacy catch-all cues at that boundary. The same
 * selected events are then replayed once, from truthful result/material data. */
const LEGACY_COMBAT_PRESENTATION_CUES = new Set([
  'heist.bullet.impact',
  'heist.bullet.whiz',
  'heist.player.hit',
]);
const combatAdapterAudio = Object.freeze({
  hasSample(cue) {
    return audio.hasSample(cue);
  },
  play(cue, options) {
    if (LEGACY_COMBAT_PRESENTATION_CUES.has(cue)) return null;
    return audio.play(cue, options);
  },
});

function grantSiegeArmor() {
  const added = playerActor.replenishArmor(playerActor.maxArmor);
  combatHud.update();
  if (added > 0 && running && checkpointReconstructionDepth === 0) {
    combatAudio.resupply({ armor: added, position: player.position });
  }
  return added;
}

function completeArmoryPickup(id) {
  if (mission.beat !== B.ARM || !isSiegeLineWeapon(id)) return false;
  const armorAdded = grantSiegeArmor();
  const finished = mission.weaponTaken(id);
  if (finished && armorAdded > 0 && running && checkpointReconstructionDepth === 0) {
    nudge(`Plate carrier secured — ${Math.round(playerActor.armor)} armor.`, 2.8);
  }
  return finished;
}

const finalArcLoadout = createFinalArcLoadout();
const loadoutBar = new SceneInventoryBar({ catalog: FINAL_ARC_WEAPON_CATALOG, visible: true });
let captureSiegeLoadout = () => {};
let attackers = null;
let hitConfirmTimer = 0;
let hitConfirmKind = null;
let playerHitCount = 0;
let playerDamageEvents = 0;
let pointerLockRejected = false;
let lastPlayerSuppression = null;
const playerTriggerDamage = new Map();
const playerTriggerPresentation = new Map();
const pendingBodyFalls = new Map();
let combatBarkTimer = 0;
const siegeWeaponHitTargets = [...interior.occluders, ...grounds.occluders];

function confirmCombatHit(kind) {
  hitConfirmKind = kind;
  hitConfirmTimer = kind === 'kill' || kind === 'headshot' ? 0.28 : 0.18;
  if (reticleEl) reticleEl.dataset.confirmed = kind;
}

function floorBelow(point) {
  return interior.floorAt(point.x, point.z, point.y)
    ?? exteriorGroundAt(point.x, point.z);
}

function ancestorData(object, key) {
  let node = object ?? null;
  while (node) {
    if (node.userData?.[key] != null) return node.userData[key];
    node = node.parent ?? null;
  }
  return null;
}

function combatantForObject(object) {
  return ancestorData(object, 'combatant') ?? null;
}

function actorForObject(object) {
  return ancestorData(object, 'combatActor')
    ?? combatantForObject(object)?.actor
    ?? null;
}

function combatMaterialForImpact(impact = {}) {
  return impact.material
    ?? ancestorData(impact.object, 'combatMaterial')
    ?? 'concrete';
}

function combatCaliber(weapon) {
  if (weapon === WEAPON_IDS.SAW) return 'lmg';
  if (weapon === WEAPON_IDS.BARRETT) return '.50';
  if (weapon === WEAPON_IDS.REVOLVER || weapon === WEAPON_IDS.PISTOL9) return 'pistol';
  if (weapon === WEAPON_IDS.SHOTGUN) return 'heavy';
  return 'rifle';
}

/** Coarse authored floor language for moving bodies; impact material stays exact. */
function combatSurfaceAt(position) {
  if (!position) return 'concrete';
  const inside = position.x >= BUILDING.x0 && position.x <= BUILDING.x1
    && position.z >= BUILDING.z0 && position.z <= BUILDING.z1;
  if (!inside) return position.z <= BUILDING.z0 ? 'gravel' : 'grass';
  if (position.y >= UPPER_Y - 0.6) return 'wood';
  if (position.y >= GROUND_Y - 0.6) return 'marble';
  return 'concrete';
}

function resolvedPresentationContact(resolved, impact = {}) {
  const anchor = resolved?.anchor ?? resolved?.hitAnchor ?? null;
  anchor?.updateWorldMatrix?.(true, false);
  const point = resolved?.anchorLocalPoint?.isVector3 && anchor?.localToWorld
    ? anchor.localToWorld(resolved.anchorLocalPoint.clone())
    : resolved?.point ?? impact.point ?? null;
  const normal = resolved?.anchorLocalNormal?.isVector3 && anchor?.matrixWorld
    ? resolved.anchorLocalNormal.clone().applyNormalMatrix(
      new THREE.Matrix3().getNormalMatrix(anchor.matrixWorld),
    ).normalize()
    : resolved?.normal ?? impact.normal ?? null;
  return { anchor, point, normal };
}

function presentWorldImpact(impact = {}) {
  if (!impact.point || impact.actor || actorForObject(impact.object)) return null;
  const direction = impact.direction?.isVector3
    ? impact.direction
    : impact.from?.isVector3
      ? impact.point.clone().sub(impact.from).normalize()
      : null;
  return ballisticImpacts.hit({
    point: impact.point,
    normal: impact.normal,
    direction,
    material: combatMaterialForImpact(impact),
    energy: impact.remainingEnergy ?? impact.damage ?? impact.energy ?? 1,
    object: impact.object?.isObject3D ? impact.object : null,
  });
}

function presentActorImpact(resolved, impact) {
  const result = resolved?.result ?? resolved;
  if (result?.applied !== true) return [];
  const contact = resolvedPresentationContact(resolved, impact);
  /* The shared layer plays the man's own reaction alongside the physical hit;
   * `id` keys its one-voice-per-burst throttle on the attacker rather than on
   * the metre of air he was standing in, so a shotgun is one cry, not eight. */
  return combatAudio.impact({
    target: 'enemy',
    id: resolved?.entry?.id ?? resolved?.combatant?.id ?? resolved?.id ?? null,
    zone: resolved?.zone ?? impact?.zone ?? 'chest',
    caliber: combatCaliber(impact?.weapon ?? resolved?.weapon),
    position: contact.point,
    result,
    /* A plate carrier cracks and drops ceramic; a light vest does neither.
     * The pool has carried the tier since it was built -- see
     * `CombatAudio.impact`, and the Palace, where the owner heard it. */
    armorTier: (resolved?.entry ?? resolved?.combatant)?.armorPresentation?.tier === 'heavy'
      ? 'heavy' : 'light',
  });
}

/**
 * The thud waits for the body. A fall is a 0.4-0.55 s crumple blend now
 * (src/mansion/siege/fallen.js), and a body-fall sample played on the frame
 * of the fatal hit landed half a second before the man did -- gunshot,
 * thud, and THEN a body still folding. The delay matches the blends'
 * midpoint-to-rest, so the impact sound arrives as the weight does.
 */
const BODY_FALL_DELAY = 0.45;

function queueBodyFall(id, root) {
  if (!id || !root?.getWorldPosition || pendingBodyFalls.has(id)) return false;
  const position = root.getWorldPosition(new THREE.Vector3());
  pendingBodyFalls.set(id, {
    position, surface: combatSurfaceAt(position), delay: BODY_FALL_DELAY,
  });
  return true;
}

function flushBodyFalls(dt = 0) {
  for (const [id, fall] of pendingBodyFalls) {
    fall.delay -= Math.max(0, Number(dt) || 0);
    if (fall.delay > 0) continue;
    combatAudio.bodyFall(fall);
    pendingBodyFalls.delete(id);
  }
}

function playerImpactBudget(impact) {
  const combatant = combatantForObject(impact?.object);
  const actor = combatant?.actor ?? actorForObject(impact?.object);
  const projectileCount = Math.max(1, Math.trunc(Number(impact?.projectiles) || 1));
  const triggerId = impact?.triggerId;
  if (!actor || triggerId == null || projectileCount <= 1) {
    return { impact, exhausted: false, commit() {} };
  }

  let trigger = playerTriggerDamage.get(triggerId);
  if (!trigger) {
    trigger = new Map();
    playerTriggerDamage.set(triggerId, trigger);
    /* Trigger ids are monotonic in WeaponSystem. Keep enough history for the
     * longest visible tracer flight without turning telemetry into save data. */
    while (playerTriggerDamage.size > 32) {
      playerTriggerDamage.delete(playerTriggerDamage.keys().next().value);
    }
  }
  const cap = Math.max(0, Number(impact.triggerDamageCap) || Number(impact.damage) || 0);
  const spent = trigger.get(actor) ?? 0;
  const damage = Math.min(Math.max(0, Number(impact.damage) || 0), Math.max(0, cap - spent));
  if (damage <= 0) return { impact, exhausted: true, commit() {} };
  const adjusted = damage === impact.damage ? impact : { ...impact, damage };
  return {
    impact: adjusted,
    exhausted: false,
    commit(hits) {
      const applied = hits.find((hit) => hit?.result?.applied)?.result;
      if (applied) trigger.set(actor, spent + Math.max(0, Number(applied.raw) || damage));
    },
  };
}

function preparePlayerTriggerPresentation(shot, pellets) {
  const triggerId = shot?.triggerId ?? pellets[0]?.triggerId;
  const projectileCount = Math.max(1, Math.trunc(Number(shot?.projectiles) || pellets.length || 1));
  if (triggerId == null || projectileCount <= 1) return;
  const actors = new Map();
  for (const pellet of pellets) {
    for (const contact of pellet.contacts ?? []) {
      const actor = actorForObject(contact.object);
      if (!actor) continue;
      const state = actors.get(actor) ?? { expected: 0, seen: 0, hits: [] };
      state.expected++;
      actors.set(actor, state);
    }
  }
  if (actors.size) playerTriggerPresentation.set(triggerId, actors);
  while (playerTriggerPresentation.size > 32) {
    playerTriggerPresentation.delete(playerTriggerPresentation.keys().next().value);
  }
}

function presentPlayerTriggerImpact(impact, hits) {
  const trigger = playerTriggerPresentation.get(impact?.triggerId);
  const actor = actorForObject(impact?.object);
  const state = trigger?.get(actor);
  if (!state) return false;
  state.seen++;
  for (const hit of hits) {
    if (hit?.result?.applied) state.hits.push({ hit, impact });
  }
  if (state.seen < state.expected) return true;
  trigger.delete(actor);
  if (!trigger.size) playerTriggerPresentation.delete(impact.triggerId);
  if (!state.hits.length) return true;

  const first = state.hits[0];
  const last = state.hits.at(-1);
  const selected = state.hits.find(({ hit }) => hit.zone === 'head')
    ?? state.hits.find(({ hit }) => hit.result?.fatal)
    ?? state.hits.find(({ hit }) => hit.result?.armorBroken)
    ?? first;
  const result = {
    ...first.hit.result,
    applied: true,
    raw: state.hits.reduce((sum, item) => sum + (item.hit.result.raw ?? 0), 0),
    damage: state.hits.reduce((sum, item) => sum + (item.hit.result.damage ?? 0), 0),
    absorbed: state.hits.reduce((sum, item) => sum + (item.hit.result.absorbed ?? 0), 0),
    armorAfter: last.hit.result.armorAfter,
    armorBroken: state.hits.some((item) => item.hit.result.armorBroken === true),
    healthAfter: last.hit.result.healthAfter,
    fatal: state.hits.some((item) => item.hit.result.fatal === true),
  };
  presentActorImpact({ ...selected.hit, result }, selected.impact);
  return true;
}

function applyPlayerShotSuppression(shot) {
  const pellets = shot?.pellets?.length ? shot.pellets : shot ? [shot] : [];
  preparePlayerTriggerPresentation(shot, pellets);
  const triggerHitActors = new Set(pellets.flatMap((pellet) => (
    pellet.contacts?.map((contact) => actorForObject(contact.object)).filter(Boolean) ?? []
  )));
  const livingCombatants = attackers?.living?.()
    ?.map((root) => root?.userData?.combatant ?? root)
    .filter((combatant) => combatant && !triggerHitActors.has(combatant.actor)) ?? [];
  const alreadySuppressed = new Set();
  const results = [];
  for (const pellet of pellets) {
    const hit = pellet.contacts?.some((contact) => actorForObject(contact.object)) === true;
    const combatants = livingCombatants.filter((combatant) => !alreadySuppressed.has(combatant));
    const result = suppressionField.applyPlayerShot({
      shot: { ...pellet, hit },
      combatants,
      /* A suppression field is blocker-clipped, and a floor is a blocker. */
      colliders: combatColliders,
    });
    for (const suppressed of result.suppressed) alreadySuppressed.add(suppressed.combatant);
    results.push(result);
  }
  lastPlayerSuppression = Object.freeze({
    applied: results.some((result) => result.applied),
    suppressed: Object.freeze(results.flatMap((result) => result.suppressed)),
    pellets: Object.freeze(results),
  });
  return lastPlayerSuppression;
}

function showEnemyBlood(resolved, impact) {
  const result = resolved?.result;
  if (!result?.applied) return;
  const actor = resolved.actor ?? resolved.entry?.actor ?? null;
  const { anchor, point, normal } = resolvedPresentationContact(resolved, impact);
  if (actor && anchor?.isObject3D && point) {
    bloodImpacts.hit({
      actor,
      anchor,
      point,
      normal,
      from: resolved.from ?? impact.origin ?? impact.from ?? null,
      spatter: true,
      spatterAnchor: resolved.spatterAnchor ?? anchor,
    });
  }
  if (!result.fatal) return;
  const root = resolved.entry?.root ?? resolved.root ?? anchor;
  if (!root?.getWorldPosition) return;
  const at = root.getWorldPosition(new THREE.Vector3());
  deathBloodPools.spill(at, {
    floorY: Number.isFinite(resolved.floorY) ? resolved.floorY : floorBelow(at),
    seed: String(actor?.id ?? resolved.entry?.id ?? '').split('')
      .reduce((seed, char) => ((seed * 31) + char.charCodeAt(0)) >>> 0, 7),
  });
}

function resolvePlayerWeaponImpact(impact) {
  if (!attackers || !impact?.object) return [];
  const combatant = combatantForObject(impact.object);
  if (!combatant) {
    const paneId = ancestorData(impact.object, 'siegeGlassPaneId');
    /* An intact authored pane owns its first-hit presentation: the crack
     * overlay is the visible mark and its injected callback is the one glass
     * impact cue. Once cracked, ordinary impacts fall back to the shared
     * decal/audio path. That prevents the first round sounding twice. */
    if (paneId && glass.crack(paneId)) return [];
    presentWorldImpact(impact);
    return [];
  }
  const budget = playerImpactBudget(impact);
  if (budget.exhausted) {
    presentPlayerTriggerImpact(impact, []);
    return [];
  }
  const hits = attackers.registerHit(budget.impact);
  budget.commit(hits);
  const applied = hits.filter((hit) => hit?.result?.applied);
  const groupedPresentation = presentPlayerTriggerImpact(impact, hits);
  if (!applied.length) return hits;
  for (const hit of applied) {
    if (!groupedPresentation) presentActorImpact(hit, budget.impact);
    showEnemyBlood(hit, budget.impact);
  }
  playerHitCount += applied.length;
  const best = applied.find((hit) => hit.zone === 'head')
    ?? applied.find((hit) => hit.result?.fatal)
    ?? applied.find((hit) => (hit.result?.absorbed ?? 0) > 0)
    ?? applied[0];
  const kind = best.zone === 'head' ? 'headshot'
    : best.result?.fatal ? 'kill'
      : (best.result?.absorbed ?? 0) > 0 ? 'armor' : 'hit';
  confirmCombatHit(kind);
  return hits;
}

const weaponSystem = new WeaponSystem({
  camera,
  world: scene,
  audio: combatAdapterAudio,
  groundAt: (x, z) => interior.floorAt(x, z, player.position.y - player.eyeHeight)
    ?? exteriorGroundAt(x, z),
  hitTargets: siegeWeaponHitTargets,
  range: 70,
  onImpact: resolvePlayerWeaponImpact,
  onEvent: (event) => {
    /* Recoil changes the next camera ray, not only the viewmodel -- which is
     * exactly why reduce-shake scales it. The catalog remains the single
     * source of per-weapon kick. */
    if (event?.type === 'fire' && event.id) {
      const kick = weaponSystem.firearm(event.id).def.recoil * 0.48 * shakeScale();
      player.pitch = THREE.MathUtils.clamp(player.pitch + kick, player.pitchMin, player.pitchMax);
      player.yaw += (Math.random() - 0.5) * kick * 0.22;
      if (event.shot) applyPlayerShotSuppression(event.shot);
    }
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

attackers = createAttackerPool({
  scene,
  damage,
  matrix,
  audio: combatAdapterAudio,
  registerLight: registerLocalLight,
  onDown: (id) => {
    queueBodyFall(id, attackers?.entry(id)?.root);
    mission.noteDown(id);
    waveDirty = true;
  },
  /* Where a cartel round landed. The dressing owns the mark; the ensemble
   * owns the flinch. Nothing else can see it happen. */
  onImpact: (impact = {}) => {
    if (impact.point) ensemble.noteImpact(impact.point, impact.radius ?? 5);
    presentWorldImpact(impact);
  },
});

const ensemble = buildSiegeEnsemble({
  scene, damage, matrix, audio: combatAdapterAudio,
  groundAt: (x, z, y) => interior.floorAt(x, z, y) ?? exteriorGroundAt(x, z),
});

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

function incomingBearing(source) {
  if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.z)) return null;
  const dx = source.x - player.position.x;
  const dz = source.z - player.position.z;
  const right = dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw);
  const forward = -dx * Math.sin(player.yaw) - dz * Math.cos(player.yaw);
  return Math.atan2(right, forward);
}

/* ================================================================== */
/* The armory                                                            */
/* ================================================================== */
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
    const acquisition = finalArcLoadout.acquire(
      event.id,
      weaponSystem.firearm(event.id).snapshot(),
    );
    const loadout = finalArcLoadout.checkpoint();
    const decision = resolveArmoryTake({ takenId: event.id, acquisition, loadout });
    if (!decision.keepTaken) {
      armory.put();
    }
    if (!decision.advance) return;
    if (!acquisition.ok && decision.equipSlot >= 0) {
      finalArcLoadout.select(decision.equipSlot, weaponSystem);
    }
    if (acquisition.ok) captureSiegeLoadout();
    loadoutBar.set(finalArcLoadout.items, finalArcLoadout.selected);
    completeArmoryPickup(decision.weaponId);
    if (decision.nudge) nudge(decision.nudge);
  },
});
/* The shared weapon ray now sees people and architecture in one sorted list.
 * That makes a wall stop a round before an attacker, and gives every automatic
 * follow-up shot the same actor resolution as the opening click. */
siegeWeaponHitTargets.push(attackers.root);
for (const id of finalArcLoadout.items) {
  if (!id) continue;
  armory.claim(id);
}

/* ================================================================== */
/* The armor stand                                                       */
/*                                                                        */
/* Owner playtest, 2026-08-19: armor was supposed to be available in the  */
/* cellar armory and there was nothing to see or take -- `grantSiegeArmor` */
/* above already credited it invisibly the moment a weapon came off the    */
/* rack. This puts an actual plate carrier in the room, on its own valet   */
/* frame clear of every rack (see ./armor-cache.js). Taking it runs the     */
/* same credit `completeArmoryPickup` already gives on first weapon, so a   */
/* player who takes both only ever gets armored once -- `replenishArmor`    */
/* is already a clamp, not an add.                                          */
/* ================================================================== */
const armorCache = buildSiegeArmorCache({
  parent: scene,
  interaction,
  enabled: () => running,
  addCollider: (x0, x1, y0, y1, z0, z1, name = null) => {
    const solid = new THREE.Box3(
      new THREE.Vector3(Math.min(x0, x1), y0, Math.min(z0, z1)),
      new THREE.Vector3(Math.max(x0, x1), y1, Math.max(z0, z1)),
    );
    /* Optional, and used: the armor stand names its box so a collider report
     * can say which object it is instead of printing bare coordinates. */
    if (name) solid.name = name;
    colliders.push(solid);
  },
  armor: Math.round(playerActor.maxArmor),
  onTake: () => {
    const added = grantSiegeArmor();
    nudge(added > 0
      ? `Plate carrier secured — ${Math.round(playerActor.armor)} armor.`
      : 'Already at full armor.', 2.6);
  },
});

function ownedFirearms() {
  return [...new Set(finalArcLoadout.items.filter(Boolean))]
    .map((id) => weaponSystem.firearm(id));
}

/** Whether any OTHER cache still has something of this kind left in it. */
function elsewhereHas(cacheId, remaining) {
  return supplyCacheIds
    .some((id) => id !== cacheId && combatSupplyCaches[id][remaining] > 0);
}

/**
 * Use one named cache's dressings.
 *
 * `cacheId` rather than a bare call: the whole point of the 2026-08-24 pass is
 * that a press at the gallery case must not spend the foyer satchel, so the
 * station that was touched is the state that pays.
 */
function useTriageStation(cacheId) {
  const supplies = combatSupplyCaches[cacheId];
  if (!supplies) return { used: false, healed: 0, remaining: 0 };
  const result = supplies.useTriage(playerActor);
  if (!result.used) {
    /* An empty station now means one empty STATION, so the refusal has to say
     * whether there is anything left in the house. Telling a bleeding player
     * "empty" when there are three dressings on the gallery is the same
     * failure the shared pool was: a true sentence about the wrong thing. */
    nudge(result.remaining <= 0
      ? (elsewhereHas(cacheId, 'triageRemaining')
        ? 'This field case is empty. There are dressings on the gallery.'
        : 'Every field dressing in the house is gone.')
      : 'Save the bandages. You are already at full health.', 2.4);
    return result;
  }
  combatAudio.triage({ position: player.position });
  combatHud.update();
  refreshSupplyProps();
  nudge(`Treated ${Math.round(result.healed)} health. ${result.remaining} field dressing${result.remaining === 1 ? '' : 's'} left.`, 2.8);
  return result;
}

function useResupplyStation(cacheId) {
  const supplies = combatSupplyCaches[cacheId];
  if (!supplies) return { used: false, armor: 0, ammunition: 0, remaining: 0 };
  const result = supplies.useResupply({
    actor: playerActor,
    firearms: ownedFirearms(),
  });
  if (!result.used) {
    nudge(result.remaining <= 0
      ? (elsewhereHas(cacheId, 'resupplyRemaining')
        ? 'This cache is spent. There is another one.'
        : 'Every cache in the house is spent.')
      : 'Armor and carried ammunition are already full.', 2.4);
    return result;
  }
  combatAudio.resupply({
    ammunition: result.ammunition,
    armor: result.armor,
    position: player.position,
  });
  captureSiegeLoadout();
  combatHud.update();
  ammoDirty = true;
  refreshSupplyProps();
  nudge(`Resupplied ${Math.round(result.ammunition)} rounds and ${Math.round(result.armor)} armor. ${result.remaining} cache use${result.remaining === 1 ? '' : 's'} left.`, 3);
  return result;
}

/* ================================================================== */
/* THE FOYER LINE CACHE -- the one supply point on the ground floor      */
/*                                                                       */
/* PART IV of docs/MANSION-SIEGE-NIGHT.md is the beat this stands in: up  */
/* the basement stair into the rear hall, then south down a 22 m entrance  */
/* hall with three men already inside it -- one behind the wrecked         */
/* centrepiece, one on the front-door line at z 36, one coming out of the   */
/* lounge arch -- and up one of the two flights. It was the longest stretch  */
/* of the mission and it had nothing on it.                                  */
/*                                                                            */
/* WHERE IT STANDS, and every one of these numbers came off the live scene     */
/* rather than off the floor plan. (8.28, 1.20, 40.00), against the foyer's    */
/* east partition, whose inner face is at x 8.83. Yawed -0.16 rad, so its      */
/* rotated footprint spans x 7.81..8.75 and z 39.45..40.41. That leaves:       */
/*                                                                             */
/*   - 6 cm to the east wall, which is what makes it read as SHOVED against    */
/*     the wall rather than parked in the room;                                */
/*   - 57 cm to the burning console wreck (`SIEGE_ANCHORS.foyerFire`, collider */
/*     x 6.88..8.82, z 36.93..38.87), so the fire lights it and does not       */
/*     intersect it;                                                           */
/*   - 57 cm to the `foyer_stair_east` attacker anchor at (7.0, 41.0), which   */
/*     carries a 0.7 m lane spread. A cache standing in a navigation anchor is */
/*     how ./nav.js's own comments describe every routing fault this house has */
/*     ever had, and it is the first thing tools/probe-siege-anchors.mjs looks */
/*     for.                                                                     */
/*                                                                              */
/* WHY THERE AND NOT THE REAR HALL. The rear hall is where he arrives, which    */
/* makes a cache there a free top-up before the fight. This one is two metres   */
/* south of the east flight's foot, in the open, on the front door's sight line */
/* -- he has to step out to take it while three men are shooting, or climb past */
/* it dry. That is the difference between a supply point and a vending machine. */
/*                                                                               */
/* WHY IT IS CHEST HIGH. ./dressing.js's debris section states the house rule    */
/* out loud: this engine has no step-over, so anything solid on the floor of a   */
/* firefight is a wall you cannot see over and cannot walk round in a hurry, and */
/* the only solids the siege adds are the ones it MEANS as cover. So the crate   */
/* stack is 0.98 m -- chest height on a crouching man, the same as the foyer's   */
/* two overturned pieces -- and it is cover as well as ammunition.               */
/*                                                                               */
/* WHY IT IS BUILT HERE AND NOT IN ./dressing.js. Same reason ./armor-cache.js   */
/* exists: this is an INTERACTION with mission state behind it, not set          */
/* dressing, and the damage-state overlay must not be able to withdraw it in a   */
/* state change the way it withdraws a wrecked chair. It goes straight onto the  */
/* scene and straight into `colliders`, exactly as the plate-carrier stand does. */
/* ================================================================== */
const SIEGE_FOYER_CACHE_SPOT = Object.freeze({
  x: 8.28, y: GROUND_Y, z: 40.00, rotY: -0.16,
});
/** Top of the two-crate stack, in the group's local frame. Cover height. */
const FOYER_CACHE_TOP = 0.98;
/** How far the levered-off lid is tipped back off the floor, in radians. */
const FOYER_CACHE_LID_TILT = 1.32;
const M_CACHE_CRATE = mat({ color: 0x4b4531, roughness: 0.82, metalness: 0.08 });
const M_CACHE_STEEL = mat({ color: 0x53585f, roughness: 0.5, metalness: 0.6 });
const M_CACHE_BRASS = mat({ color: 0xb08a3c, roughness: 0.34, metalness: 0.82 });
const M_CACHE_CANVAS = mat({ color: 0x2c3a30, roughness: 0.92 });
const M_CACHE_CROSS = mat({ color: 0xd23c34, roughness: 0.55 });

const foyerCache = new THREE.Group();
foyerCache.name = 'siege.foyer-cache';
foyerCache.position.set(
  SIEGE_FOYER_CACHE_SPOT.x, SIEGE_FOYER_CACHE_SPOT.y, SIEGE_FOYER_CACHE_SPOT.z,
);
foyerCache.rotation.y = SIEGE_FOYER_CACHE_SPOT.rotY;
scene.add(foyerCache);

/* Two crates, the lower one bearing the upper. Local y is measured off the
 * foyer floor, so every box sits at half its own height and nothing floats.
 *
 * NOTHING HERE CASTS. The only shadow-casting light in this scene is the moon,
 * outside; ../perf.js's `capShadowCasters` exists because the siege was paying
 * a shadow pass for a house full of objects that could never be reached by it,
 * and this crate is under the gallery slab in an entrance hall. It is big
 * enough (0.82 m against the cap's 0.469 m minimum) that the size rule would
 * KEEP it, so the honest place to say "indoors" is here. */
foyerCache.add(box({
  name: 'siege.foyer-cache.crate.low',
  size: [0.82, 0.52, 0.66], pos: [0, 0.26, 0], mat: M_CACHE_CRATE, cast: false,
}));
foyerCache.add(box({
  name: 'siege.foyer-cache.crate.high',
  size: [0.7, 0.46, 0.56], pos: [0.03, 0.75, 0.02], mat: M_CACHE_CRATE, rotY: 0.11, cast: false,
}));
/* Steel banding, so it reads as an ammunition crate at a glance and not as a
 * packing case somebody left in a hallway. */
for (const [i, y] of [[0, 0.14], [1, 0.4], [2, 0.63], [3, 0.88]]) {
  foyerCache.add(box({
    name: `siege.foyer-cache.band.${i}`,
    size: [0.84, 0.035, 0.68], pos: [0, y, 0.01], mat: M_CACHE_STEEL, cast: false,
  }));
}
/* The lid, levered off and stood against the stack's south face.
 *
 * `tippedRestY` IS IMPORTED RATHER THAN RE-DERIVED, and ./dressing.js's
 * docblock on it is the reason: a rotated box's resting height is not
 * `floor + height / 2`, and every prop in this house that assumed it was ended
 * up 5 to 13 cm buried in the marble with `scene-audit` calling it FLOATING.
 * A panel tipped about X mixes its 4 cm thickness with its 50 cm depth, so the
 * two arguments go in depth-first. Its z centre puts the top edge against the
 * crate's south face at z = -0.33 and its bottom edge on the floor. */
foyerCache.add(box({
  name: 'siege.foyer-cache.lid',
  size: [0.68, 0.04, 0.5],
  pos: [-0.06, tippedRestY(0, 0.5, 0.04, FOYER_CACHE_LID_TILT), -0.41],
  mat: M_CACHE_CRATE,
  rotX: FOYER_CACHE_LID_TILT,
  cast: false,
}));

/* THE CONSUMABLES. Loose magazines on the top crate and a medic satchel
 * beside them: the two things that vanish when their charge is spent, so a
 * picked-over cache reads as picked over from across the hall instead of
 * looking full and printing "empty" at arm's length. That was the exact
 * complaint about the gallery pair. */
const foyerCacheRounds = new THREE.Group();
foyerCacheRounds.name = 'siege.foyer-cache.rounds';
foyerCache.add(foyerCacheRounds);
for (let i = 0; i < 4; i++) {
  const tip = -0.2 + i * 0.09;
  foyerCacheRounds.add(box({
    name: `siege.foyer-cache.magazine.${i}`,
    size: [0.09, 0.24, 0.045],
    /* Tipped, so seated with `tippedRestY` off the crate lid rather than off
     * the floor -- the same correction, one storey up. */
    pos: [-0.2 + i * 0.11, tippedRestY(FOYER_CACHE_TOP, 0.09, 0.24, tip), -0.14 + (i % 2) * 0.06],
    mat: M_CACHE_STEEL,
    rotZ: tip,
    cast: false,
  }));
}
/* Loose rounds spilled at the stack's south-east corner. Laid on their sides,
 * so what holds them up is the radius, not half the length. */
for (let i = 0; i < 5; i++) {
  foyerCacheRounds.add(cylinder({
    name: `siege.foyer-cache.round.${i}`,
    r: 0.0075, h: 0.058,
    pos: [0.18 + (i % 3) * 0.03, FOYER_CACHE_TOP + 0.0075, -0.2 + Math.floor(i / 3) * 0.04],
    mat: M_CACHE_BRASS, rotX: Math.PI / 2, cast: false,
  }));
}

/* The satchel is a CHILD of the crate and registered separately.
 * `InteractionSystem._ownerOf` walks up from the mesh the ray hit to the
 * nearest ancestor carrying a descriptor, so looking at the bag gives the
 * dressing and looking at the crate gives the ammunition, off one object --
 * the same two-surfaces-one-prop shape the gallery's defence stations use. */
const foyerCacheSatchel = new THREE.Group();
foyerCacheSatchel.name = 'siege.foyer-cache.satchel';
foyerCacheSatchel.position.set(-0.12, FOYER_CACHE_TOP, 0.16);
foyerCacheSatchel.rotation.y = 0.24;
foyerCache.add(foyerCacheSatchel);
foyerCacheSatchel.add(box({
  name: 'siege.foyer-cache.satchel.body',
  size: [0.34, 0.2, 0.19], pos: [0, 0.1, 0], mat: M_CACHE_CANVAS, cast: false,
}));
foyerCacheSatchel.add(box({
  name: 'siege.foyer-cache.satchel.flap',
  size: [0.34, 0.02, 0.14], pos: [0, 0.205, -0.03], mat: M_CACHE_CANVAS, cast: false,
}));
foyerCacheSatchel.add(box({
  name: 'siege.foyer-cache.satchel.cross.h',
  size: [0.13, 0.012, 0.045], pos: [0, 0.212, -0.03], mat: M_CACHE_CROSS, cast: false,
}));
foyerCacheSatchel.add(box({
  name: 'siege.foyer-cache.satchel.cross.v',
  size: [0.045, 0.012, 0.13], pos: [0, 0.212, -0.03], mat: M_CACHE_CROSS, cast: false,
}));
foyerCacheSatchel.add(box({
  name: 'siege.foyer-cache.satchel.strap',
  size: [0.05, 0.21, 0.2], pos: [0.14, 0.1, 0], mat: M_CACHE_STEEL, cast: false,
}));

/* The collider: the yawed footprint's own axis-aligned bounds, INCLUDING the
 * leaning lid, and NAMED -- an anonymous box is a box no collider report can
 * point at, which is the whole lesson of ./armor-cache.js's docblock.
 *
 * The rotated extent is worked out rather than eyeballed, and then MEASURED:
 * a Box3 over the built group in the live scene reads 0.937 m of x and
 * 0.961 m of z about the anchor, running from -0.549 to +0.412 in z because
 * of the lid leaning off the south face. The numbers below enclose every
 * piece of it. Only the loose magazines stand above the box, and they are
 * 12 cm of dressing on a surface, not a thing to walk into.
 *
 * What that leaves, symmetrically: 6 cm to the east partition's inner face at
 * x 8.83, 57 cm north of the burning console wreck's collider (x 6.88..8.82,
 * z 36.93..38.87) -- beside the fire, which lights it, and not in it -- and
 * 57 cm south of the `foyer_stair_east` attacker anchor at (7.0, 41.0), the
 * nearest anchor in the house. Checked against the live collider list and the
 * live anchor table rather than against the floor plan: nothing it intersects,
 * nothing standing in it. */
colliders.push(Object.assign(
  new THREE.Box3(
    new THREE.Vector3(7.80, GROUND_Y, 39.44),
    new THREE.Vector3(8.76, GROUND_Y + FOYER_CACHE_TOP, 40.43),
  ),
  { name: 'siege.foyer-cache.crate' },
));

/* ================================================================== */
/* EVERY SUPPLY SURFACE IN THE HOUSE, AND THE CACHE BEHIND EACH ONE      */
/*                                                                       */
/* This table is the fix for the shared pool. Two visible caches on the    */
/* gallery are now two `CombatSupplyState`s, so a use at the firing step   */
/* cannot empty the west flank cans, and neither of them can empty the      */
/* triage case or the foyer crate downstairs.                               */
/* ================================================================== */
const SIEGE_SUPPLY_SURFACES = [
  { cache: 'foyerLine', kind: 'resupply', surface: foyerCache },
  { cache: 'foyerLine', kind: 'triage', surface: foyerCacheSatchel },
  { cache: 'triageCase', kind: 'triage', surface: dressing.props.defenceStations.zones.triage.group },
  { cache: 'firingStep', kind: 'resupply', surface: dressing.props.firingStep.ammo },
  { cache: 'flankCache', kind: 'resupply', surface: dressing.props.defenceStations.zones.resupply.group },
].filter((entry) => entry.surface);

/**
 * Show what is left.
 *
 * Only the foyer crate has anything to hide today -- the gallery stations are
 * ./dressing.js's and this file does not reach into another module's props to
 * switch pieces of them off. Called from both station handlers and from every
 * checkpoint restore, so a rewind that hands the dressing back also hands the
 * satchel back.
 */
function refreshSupplyProps() {
  const foyer = combatSupplyCaches.foyerLine;
  if (!foyer) return;
  foyerCacheRounds.visible = foyer.resupplyRemaining > 0;
  foyerCacheSatchel.visible = foyer.triageRemaining > 0;
}
refreshSupplyProps();

for (const { cache, kind, surface } of SIEGE_SUPPLY_SURFACES) {
  const supplies = combatSupplyCaches[cache];
  interaction.register(surface, kind === 'triage' ? {
    label: () => (supplies.triageRemaining > 0
      ? `Use <b>triage</b> &mdash; ${supplies.triageRemaining} dressing${supplies.triageRemaining === 1 ? '' : 's'} left`
      : '<b>Triage</b> &mdash; empty'),
    enabled: () => running && surface.visible,
    onUse: () => useTriageStation(cache),
  } : {
    label: () => (supplies.resupplyRemaining > 0
      ? `Resupply <b>armor and ammunition</b> &mdash; ${supplies.resupplyRemaining} use${supplies.resupplyRemaining === 1 ? '' : 's'} left`
      : '<b>Resupply</b> &mdash; empty'),
    enabled: () => running && surface.visible,
    onUse: () => useResupplyStation(cache),
  });
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
const siegeRecoveryCampaign = siegeCampaign.campaign ?? createCampaign();
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
    combatBarkTimer = 0;
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

/** Barks are already authored by the cast Adapters; this only renders them. */
function renderCombatBark(event = {}) {
  const line = typeof event.line === 'string' ? event.line.trim() : '';
  if (!line || dialogue.line || !subtitleEl) return false;
  subtitleEl.hidden = false;
  subtitleWhoEl.textContent = String(event.name ?? event.role ?? event.id ?? '').toUpperCase();
  subtitleTextEl.textContent = line;
  combatBarkTimer = THREE.MathUtils.clamp(line.length * 0.055, 1.4, 3.2);
  /* Most bark pools are subtitle-only (attackers.js's own header explains
   * why: their `context.audio` channel is shared with weapon acoustics, and
   * a regression test holds it to the weapon catalog). BARKS.identity is the
   * one pool with a real `vo.ateam.*` cue attached, carried up on `event.cue`
   * for exactly this reason -- this is the scene's OWN voice engine, not
   * that shared channel, so playing it here costs that promise nothing.
   *
   * The A-Team is FIVE men since 2026-08-20 (attackers.js, ATEAM_VOICES), and
   * which one is speaking rides along on `event.voice`. Nothing is resolved
   * from it here on purpose: the cue name already selects that man's take out
   * of the manifest, so the field is there for the day the scene wants to tag
   * the subtitle or hold one A-Team throat at a time. */
  if (typeof event.cue === 'string' && event.cue) {
    /* Through the shared dialogue path: one voice bus, one trim, and the beds
     * ducked under the line. The 0.9 that used to be here was the siege's own
     * guess at how loud dialogue is and differed from every other scene's.
     * `SPEECH_MIX_CLOSE` because a siege bark is command chatter -- it belongs
     * in the player's ear whichever way he is facing, and giving it a position
     * is how a radio call ends up quieter when he turns his head. */
    try {
      speak(audio, event.cue, { mix: SPEECH_MIX_CLOSE });
    } catch { /* no audio yet */ }
  }
  return true;
}

function updateCombatBark(dt) {
  if (dialogue.line || combatBarkTimer <= 0) return;
  combatBarkTimer = Math.max(0, combatBarkTimer - Math.max(0, Number(dt) || 0));
  if (combatBarkTimer === 0 && subtitleEl) subtitleEl.hidden = true;
}

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
  const capturedHealth = mission.checkpoint?.id === id
    ? mission.checkpoint.scene?.health
    : null;
  const capturedSupplies = mission.checkpoint?.id === id
    ? mission.checkpoint.scene?.supplies
    : null;
  missionAudio.checkpoint(id);
  siegeCampaign.checkpoint(id, {
    attackersDown: mission.attackersDown,
    littleFriendSaid: mission.littleFriendSaid,
    sasoleMet: mission.beat === B.COMPLETE,
    /* The large scene checkpoint stays in memory. These four bounded numbers
     * are the combat state a full campaign/page reload cannot reconstruct
     * honestly from the checkpoint name alone.
     *
     * `supplies` IS DELIBERATELY LOSSY HERE, and the loss is the campaign's
     * rather than this scene's. `normalizeMansionSiegeCheckpointSnapshot()` in
     * src/core/campaign.js is the durable gate and it accepts exactly two
     * integers clamped to 0..2, dropping the entire snapshot -- health and
     * armour with it -- if they are missing. The mission owns four caches now,
     * which does not fit and cannot be made to fit without editing a src/core
     * schema this pass does not own. So the durable record carries the honest
     * TOTALS (clamped by that gate) and `restoreSiegeSupplies()` rebuilds a
     * resumed campaign from the checkpoint's guaranteed floor instead of
     * inventing a distribution. In-page death retries -- the ones the retry
     * trap was actually about -- go through the full in-memory record and lose
     * nothing. */
    checkpointSnapshot: {
      name: id,
      health: capturedHealth?.health ?? playerActor.health,
      armor: capturedHealth?.armor ?? playerActor.armor,
      supplies: capturedSupplies ?? supplySnapshot(id),
    },
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
    if (sequence === 'briefing') dialogue.playBriefing(weaponSystem.equipped);
    else if (sequence) dialogue.play(sequence);
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
 * The original eleven mission fields plus finite combat-station supplies.
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
    capture: () => ({
      text: mission.objective,
      hint: mission.hint,
      done: mission.objectiveDone,
    }),
    restore: (value) => mission.onObjective?.(
      value?.text ?? null,
      value?.hint ?? null,
      value?.done === true,
    ),
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
  })
  .provide('supplies', {
    /* `mission.beat` is already the checkpoint's own beat when this runs --
     * `SiegeMission._enter` assigns the beat before it calls `saveCheckpoint`
     * -- so the record can stamp WHICH checkpoint it belongs to, and the
     * restore below knows which floor to apply without having to guess from
     * whatever `mission.checkpoint` happens to hold at restore time. */
    capture: () => supplySnapshot(SIEGE_CHECKPOINT_BY_BEAT.get(mission.beat) ?? null),
    restore: (snapshot) => restoreSiegeSupplies(snapshot),
  });

/** Apply the campaign-safe combat subset to the canonical rebuilt checkpoint. */
function restoreDurableCombatCheckpoint(snapshot, checkpointId) {
  if (!snapshot || snapshot.name !== checkpointId) return false;
  playerActor.restoreDurable({
    ...playerActor.durableSnapshot(),
    health: snapshot.health,
    armor: snapshot.armor,
    incapacitated: false,
  });
  /* Refresh the derived injury grade after replacing raw health. */
  playerActor.heal(0);
  restoreSiegeSupplies(snapshot.supplies, checkpointId);
  combatHud.reset();
  resetCombatPresentation();

  /* Future in-page death restores use SiegeMission's full snapshot. Patch the
   * same values into it so a campaign resume cannot be followed by a rewind
   * that manufactures the resources we just restored. */
  if (mission.checkpoint?.id === checkpointId) {
    mission.checkpoint.scene.health = playerActor.snapshot();
    mission.checkpoint.scene.supplies = supplySnapshot(checkpointId);
  }
  return true;
}

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
    ensemble.noteImpact({ x, y: 1.2, z }, 7);
    return best;
  }
  return null;
}

/**
 * He went down.
 *
 * This used to restore the checkpoint silently and say so in this comment:
 * "there is no death screen and no retry menu, because the four checkpoints
 * are placed so that the longest thing a death can cost is one wave." The
 * owner asked for one, so there is one, and the comment is corrected rather
 * than left contradicting the code underneath it.
 *
 * The restore itself has not changed and is still cheap -- it is simply on the
 * far side of a button now. `restoreCheckpoint()` puts the beat, the wave
 * rosters, the damage state, the broken glass and the player back where the
 * checkpoint had them; `respawnFromCheckpoint()` adds standing him up.
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
    combatHud.reset();
    return;
  }
  if (reviving || !mission.checkpoint) return;
  reviving = true;
  combatAudio.bodyFall({ surface: combatSurfaceAt(player.position), position: player.position });
  weaponSystem.setTrigger(false);
  weaponSystem.setAimed(false);
  weaponSystem.cancelPendingImpacts();
  player.clearKeys?.();
  /* Let the mouse go. A card with two buttons on it behind a locked pointer
   * is a card nobody can press. */
  try { document.exitPointerLock?.(); } catch { /* not locked */ }
  showDeathScreen();
}

/**
 * Take the offered checkpoint.
 *
 * Everything here was the back half of `onPlayerDown` before the card existed,
 * and it is unchanged: the point of the card is to ask, not to alter what
 * happens once the player has answered.
 */
function respawnFromCheckpoint() {
  hideDeathScreen();
  attackers.despawnAll();
  mission.restoreCheckpoint();
  playerActor.health = playerActor.maxHealth;
  playerActor.incapacitated = false;
  playerActor.injury = 'none';
  combatHud.reset();
  resetCombatPresentation();
  bloodImpacts.reset();
  deathBloodPools.reset();
  hitConfirmKind = null;
  hitConfirmTimer = 0;
  if (reticleEl) delete reticleEl.dataset.confirmed;
  ammoDirty = true;
  waveDirty = true;
  reviving = false;
}

/**
 * Start the night again.
 *
 * A reload rather than an in-page teardown, and for the same reason
 * `replayBtn` has always used one: this scene mounts twenty-two people, four
 * damage states and a weapon system, and the honest way to get a clean one is
 * to ask the browser for a clean one.
 */
function restartScene() {
  window.location.reload();
}

/* ---------------------------------------------------------------- */
/* THE DEATH SCREEN                                                  */
/* ---------------------------------------------------------------- */
const deathEl = $('death');
const deathCheckpointEl = $('deathCheckpoint');
const deathRespawnBtn = $('deathRespawn');
const deathRestartBtn = $('deathRestart');

deathRespawnBtn?.addEventListener('click', respawnFromCheckpoint);
deathRestartBtn?.addEventListener('click', restartScene);

function showDeathScreen() {
  if (!deathEl) {
    /* No card in this page: fall back to what the scene did before it had
     * one, rather than leaving the player on the floor forever. */
    respawnFromCheckpoint();
    return;
  }
  if (deathCheckpointEl) {
    /* Name the checkpoint he is being offered, not the word "checkpoint":
     * "back to LITTLE FRIEND" tells him how much he lost, and that is the
     * only question anybody has on this screen. `CHECKPOINTS` is the same
     * table the on-screen checkpoint tag reads. */
    const label = CHECKPOINTS[mission.checkpoint?.id]?.label;
    deathCheckpointEl.textContent = label ? label.toUpperCase() : 'THE LAST CHECKPOINT';
  }
  deathEl.classList.add('showing');
  deathEl.setAttribute('aria-hidden', 'false');
  deathRespawnBtn?.focus?.({ preventScroll: true });
}

function hideDeathScreen() {
  if (!deathEl) return;
  deathEl.classList.remove('showing');
  deathEl.setAttribute('aria-hidden', 'true');
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
/* Input                                                                 */
/*                                                                       */
/* `Player` DOES NOT LISTEN FOR ITS OWN KEYS. It exposes setKey/clearKeys */
/* and every scene wires its own handlers -- see the identical block in    */
/* src/mansion/main.js and src/heist/main.js. Leaving this out is a scene  */
/* that boots, renders, locks the pointer and simply never moves, with no  */
/* error anywhere to say why. It cost this file one verifier run.          */
/* ================================================================== */
window.addEventListener('keydown', (e) => {
  /* Tab never gets here — the pause menu's own capture-phase listener owns it
   * (src/core/pause-menu.js). Everything below mutates the live mission, so it
   * must go dark while the overlay is up, same as the mousedown handler. */
  if (!running || pauseMenu.isPaused()) return;
  if (e.code === 'Space') e.preventDefault();
  player.setKey(translateKey(e.code), true);
  if (e.code === 'KeyE' && !e.repeat) interaction.press();
  if (e.code === 'KeyR' && !e.repeat) { weaponSystem.reload(); ammoDirty = true; }
  if (e.code === 'KeyQ' && !e.repeat && weaponSystem.equipped) {
    weaponSystem.setAimed(false);
    finalArcLoadout.stow(weaponSystem);
    loadoutBar.set(finalArcLoadout.items, finalArcLoadout.selected);
    ammoDirty = true;
  }
  if (!e.repeat && /^Digit[1-5]$/.test(e.code)) {
    weaponSystem.setAimed(false);
    finalArcLoadout.select(Number(e.code.slice(5)) - 1, weaponSystem);
    loadoutBar.set(finalArcLoadout.items, finalArcLoadout.selected);
    ammoDirty = true;
    e.preventDefault();
  }
  /* The line. Once, ever, with any catalog gun up on the landing. */
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
  if (!running || pauseMenu.isPaused()) return;
  const occupied = finalArcLoadout.items;
  if (occupied.filter(Boolean).length <= 1) return;
  let index = finalArcLoadout.selected;
  for (let tries = 0; tries < occupied.length; tries++) {
    index = (index + (e.deltaY > 0 ? 1 : -1) + occupied.length) % occupied.length;
    if (!occupied[index]) continue;
    weaponSystem.setAimed(false);
    finalArcLoadout.select(index, weaponSystem);
    loadoutBar.set(finalArcLoadout.items, finalArcLoadout.selected);
    ammoDirty = true;
    break;
  }
}, { passive: true });
window.addEventListener('keyup', (e) => {
  player.setKey(translateKey(e.code), false);
  if (e.code === 'KeyE') interaction.release();
});
window.addEventListener('blur', () => {
  player.clearKeys();
  interaction.release();
  weaponSystem.setTrigger(false);
  weaponSystem.setAimed(false);
});
window.addEventListener('pagehide', () => captureSiegeLoadout());
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.handleMouseMove(e.movementX, e.movementY);
});

/**
 * Ask for mouse capture without leaving a rejected promise or a silent dead
 * trigger behind. `beginSiege()` also asks after its asynchronous audio load,
 * where the browser may no longer consider the start-button gesture current;
 * a later canvas click is the reliable recovery gesture.
 */
function requestSiegePointerLock({ explain = false } = {}) {
  if (document.pointerLockElement === renderer.domElement) return true;
  if (typeof renderer.domElement.requestPointerLock !== 'function') {
    pointerLockRejected = true;
    if (explain) nudge('Mouse capture is unavailable. Open this page directly, or allow pointer lock.');
    return false;
  }
  try {
    const pending = renderer.domElement.requestPointerLock();
    pending?.catch?.(() => {
      pointerLockRejected = true;
      if (explain) nudge('Mouse capture was blocked. Click the game again or allow pointer lock.');
    });
    return true;
  } catch {
    pointerLockRejected = true;
    if (explain) nudge('Mouse capture was blocked. Click the game again or allow pointer lock.');
    return false;
  }
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) {
    pointerLockRejected = false;
    return;
  }
  weaponSystem.setTrigger(false);
  weaponSystem.setAimed(false);
});
document.addEventListener('pointerlockerror', () => {
  pointerLockRejected = true;
  weaponSystem.setTrigger(false);
  weaponSystem.setAimed(false);
  if (running && !pauseMenu.isPaused()) {
    nudge('Mouse capture was blocked. Click the game again or allow pointer lock.');
  }
});

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!running || pauseMenu.isPaused()) return;
  if (e.button === 2) {
    e.preventDefault();
    if (weaponSystem.equipped) weaponSystem.setAimed(true);
    return;
  }
  if (e.button !== 0) return;
  if (document.pointerLockElement !== renderer.domElement) {
    /* After an explicit browser rejection, do not turn every later click into
     * another invisible no-op. A deliberate click still fires one round; the
     * HUD explains why mouse-look is unavailable, while the same fresh user
     * gesture retries capture in case the browser permission has changed. */
    if (pointerLockRejected) {
      requestSiegePointerLock({ explain: true });
      if (weaponSystem.equipped) weaponSystem.triggerPress();
      else nudge('No weapon in hand. Press 1–5 to equip an owned gun.');
      return;
    }
    requestSiegePointerLock({ explain: true });
    return;
  }
  if (!weaponSystem.equipped) {
    nudge('No weapon in hand. Press 1–5 to equip an owned gun.');
    return;
  }
  weaponSystem.setTrigger(true);
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) weaponSystem.setTrigger(false);
  if (e.button === 2) weaponSystem.setAimed(false);
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

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
/* The gun in the player's hands is the gun the mission accepts. Sending  */
/* somebody two floors back for one specific rack gun after already       */
/* advancing them out of the armory is a softlock wearing an objective.   */
/*                                                                       */
/* So a failed press answers. It borrows the hint line rather than adding */
/* a fourth HUD element: that line is the sentence being corrected, the   */
/* player's eye is already on it, and it goes back to the beat's own hint */
/* when the nudge expires.                                                */
/* ================================================================== */
let nudgeTimer = 0;
/* One announcement per wave when its remnant starts hunting; reset between
 * waves so wave two's ending gets the same telegraph as wave one's. */
let huntAnnounced = false;

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
 * Conditions, all of them: the briefing is over, a weapon is in his hands,
 * and he is standing on the firing step. Then the line plays, full control
 * stays with the player, and wave 1A comes through the door. `sayHello()`
 * returns true exactly once in a playthrough -- a checkpoint restore after
 * it cannot hand it back -- so this needs no flag of its own.
 */
function tryTheLine() {
  if (mission.beat !== B.LITTLE_FRIEND) return false;
  if (!isSiegeLineWeapon(weaponSystem.equipped)) {
    nudge('Bring a gun up first — any weapon from the armory will do.');
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
  /* RELOAD CLARITY. This line used to print the Firearm's raw phase id --
   * "ready", "reload-out", "reload-in" -- under the count, which is a state
   * machine talking to itself, not a HUD talking to a player under fire. The
   * base house's own card (src/mansion/main.js) already says it the way a
   * player reads it, and the page's `#ammo.dry` rule was written for a class
   * nothing here ever set. Same words, same class, one house. */
  ammoEl.classList.toggle('dry', (hud.rounds ?? 0) === 0);
  ammoStateEl.textContent = hud.reloading
    ? 'RELOADING'
    : ((hud.rounds ?? 0) === 0 ? ((hud.reserve ?? 0) === 0 ? 'NO ROUNDS' : 'EMPTY — R') : '');
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
/* THE HUNT PIP                                                          */
/*                                                                       */
/* Owner, playtest 2026-08-13: "four attacks left cant find them".        */
/* mission.huntActive is the mechanical half of the answer (the remnant  */
/* drops its standoffs and walks at the player -- src/mansion/siege/     */
/* attackers.js) and this is the legible half: while the hunt is on, one */
/* small amber chevron on a ring around the crosshair points at the      */
/* nearest wave attacker still standing. Nothing else on the HUD says    */
/* which way a man behind a wall is, and a man on the far flight is a    */
/* direction long before he is a silhouette.                             */
/*                                                                       */
/* It is a DIRECTION, not a marker: no distance, no through-wall body    */
/* outline, no minimap. Off between hunts and off the moment the wave    */
/* clears, so the balcony fight itself is fought by eye and ear.         */
/* ================================================================== */
/** How the last pip reading was published; the verifier reads it too. */
let huntPip = { active: false, id: null, bearing: null, distance: null, sector: null };

function nearestStandingWaveAttacker() {
  let best = null;
  let bestDistance = Infinity;
  for (const entry of attackers.all()) {
    if (!entry.active || entry.actor?.incapacitated || !entry.order?.wave) continue;
    const distance = entry.root.position.distanceTo(player.position);
    if (distance < bestDistance) { best = entry; bestDistance = distance; }
  }
  return best ? { entry: best, distance: bestDistance } : null;
}

function bearingSector(angle) {
  return Math.abs(angle) <= Math.PI / 4 ? 'front'
    : Math.abs(angle) >= Math.PI * 3 / 4 ? 'back'
      : angle > 0 ? 'right' : 'left';
}

function updateHuntPip(huntActive) {
  const nearest = huntActive ? nearestStandingWaveAttacker() : null;
  const bearing = nearest ? incomingBearing(nearest.entry.root.position) : null;
  const active = nearest !== null && Number.isFinite(bearing);
  huntPip = active
    ? {
      active: true,
      id: nearest.entry.id,
      bearing: Number(bearing.toFixed(4)),
      distance: Number(nearest.distance.toFixed(2)),
      sector: bearingSector(bearing),
    }
    : { active: false, id: null, bearing: null, distance: null, sector: null };
  waveCountEl?.classList.toggle('hunt', huntActive === true);
  if (!huntPipEl) return huntPip;
  if (!active) {
    if (!huntPipEl.hidden) {
      huntPipEl.classList.remove('active');
      huntPipEl.hidden = true;
      delete huntPipEl.dataset.bearing;
      delete huntPipEl.dataset.sector;
      delete huntPipEl.dataset.target;
    }
    return huntPip;
  }
  huntPipEl.hidden = false;
  huntPipEl.classList.add('active');
  huntPipEl.style.setProperty('--hunt-bearing', `${bearing}rad`);
  huntPipEl.dataset.bearing = String(huntPip.bearing);
  huntPipEl.dataset.sector = huntPip.sector;
  huntPipEl.dataset.target = huntPip.id;
  return huntPip;
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
    'Left mouse fires. Right mouse aims. R reloads. E takes or returns a rack weapon. 1–5 select; Q stows.',
    'F -- say it, once, from the top of the stairs with any weapon in your hands.',
    'E uses triage and ammunition stations; held by a downed ally, it revives.',
    'Enter skips the rest of a line. Tab pauses and resumes.',
    'Escape releases the mouse, which also pauses.',
  ],
  recovery: createCampaignSceneRecovery({
    campaign: siegeRecoveryCampaign,
    sceneId: SCENE_IDS.MANSION_SIEGE,
    location,
    restartCheckpoint: () => {
      const checkpoint = mission.checkpoint?.id
        ?? siegeCampaign.story?.mission?.checkpoint
        ?? startCheckpoint
        ?? 'wake';
      if (siegeCampaignPreview) {
        const url = new URL(location.href);
        url.searchParams.set('preview', '1');
        url.searchParams.set('checkpoint', checkpoint);
        location.assign(url);
      } else {
        location.reload();
      }
      return { ok: true, checkpoint };
    },
    canRestartCheckpoint: () => true,
  }),
  onPause: () => {
    interaction.setPaused(true);
    weaponSystem.setTrigger(false);
    weaponSystem.setAimed(false);
    player.clearKeys();
    if (audio.ctx?.state === 'running') audio.ctx.suspend();
  },
  onResume: () => {
    interaction.setPaused(false);
    if (audio.ctx?.state === 'suspended') audio.ctx.resume();
    clock.getDelta();
    requestSiegePointerLock({ explain: true });
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
    blurb: 'Out of the armory with a weapon, on the way up to Lou.',
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
  const restored = withCheckpointReconstruction(() => {
    mission.wokeUp();
    mission.enteredArmory();
    equipOwnedWeapon(WEAPON_IDS.CARBINE);
    completeArmoryPickup(WEAPON_IDS.CARBINE);
    if (id === 'armed') return true;

    mission.enteredOffice();
    dialogue.playBriefing(weaponSystem.equipped);
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
  if (restored) resetCombatPresentation();
  return restored;
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
    await audio.loadAdditional({
      names: [
        ...weaponCueNames(), ...siegeVoiceCueNames(), ...siegeCombatCueNames(),
        /* The crew's own forty-two lines. They are barks rather than script,
         * so they were never in `siegeVoiceCueNames()`, and a bark whose bank
         * is not decoded plays the synth stand-in rather than the take. */
        ...ateamBarkCueNames(),
      ],
    }).catch(() => {});
    /* The banks above were awaited, so this normally resolves at once. It
     * exists to pin the exact cues the first trigger pull reaches for as
     * decoded-or-reported (src/core/prewarm.js) BEFORE the siege can start;
     * a cue that never decoded is reported and plays its synth stand-in
     * rather than stalling the boot. */
    window.mansionSiege.prewarmAudioReport = await prewarmAudio(audio, [
      ...weaponCueNames().filter((name) => name.endsWith('.fire')),
      'heist.bullet.impact', 'heist.bullet.whiz',
    ], { timeout: 500 });
    /* A direct/legacy entry still gets the nightstand .45. Campaign entry keeps
     * the exact guns, selected slot and ammunition brought out of the previous
     * Mansion scene instead of replacing them at boot. A stowed weapon is a
     * useful state in the Mansion, but carrying five visible guns into an
     * active siege with none in hand makes every trigger pull look broken.
     * Equip a loaded owned slot on entry without manufacturing ammunition. */
    if (!finalArcLoadout.items.some(Boolean)) finalArcLoadout.acquire(WEAPON_IDS.REVOLVER);
    finalArcLoadout.apply(weaponSystem);
    if (!weaponSystem.equipped) {
      const inherited = finalArcLoadout.checkpoint();
      const loaded = (index) => {
        const id = inherited.slots[index];
        return id && (inherited.ammo?.[id]?.rounds ?? 0) > 0;
      };
      let slot = loaded(inherited.selected) ? inherited.selected : inherited.slots.findIndex((id, index) => loaded(index));
      if (slot < 0) slot = inherited.slots.findIndex(Boolean);
      if (slot >= 0) finalArcLoadout.select(slot, weaponSystem);
    }
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
      restoreDurableCombatCheckpoint(campaignEntry.checkpointSnapshot, entryCheckpoint);
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
    combatHud.show();
    menuEl.classList.add('hidden');
    requestSiegePointerLock({ explain: true });
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

export function siegeCombatCueNames() {
  return [...SIEGE_COMBAT_CUES];
}

export function siegeCueNames() {
  return [
    ...siegeEffectCueNames(), ...siegeVoiceCueNames(), ...siegeCombatCueNames(),
    ...ateamBarkCueNames(),
  ];
}

function presentCombatStep(event = {}, dt = 0) {
  return combatSteps.update({
    id: event.id,
    dt,
    position: event.position,
    surface: event.surface ?? combatSurfaceAt(event.position),
    intensity: event.intensity ?? (event.gait === 'run' ? 1 : 0.72),
    moving: event.moving !== false,
  });
}

function targetForCombatEvent(side, id) {
  if (!id) return null;
  if (side === 'friendly') return attackers?.entry?.(id) ?? null;
  return ensemble?.members?.get?.(id) ?? null;
}

function presentCombatWeaponEvent(event = {}, side) {
  if (event.type === 'cycle' && event.kind) {
    combatAudio.ejecta({
      kind: event.kind,
      surface: combatSurfaceAt(event.position),
      position: event.position,
    });
  }
  if (event.type !== 'shot') return;
  const pellets = event.pellets?.length ? event.pellets : [];

  /* One physical near-miss voice per trigger, even for the shotgun's seven
   * truthful pellet paths. CombatFireControl already owns the pool cooldown. */
  const whiz = side === 'hostile'
    ? pellets.find((pellet) => pellet.targetIsPlayer === true && pellet.whiz === true)
    : null;
  if (whiz) {
    combatAudio.whiz({
      caliber: combatCaliber(event.weapon),
      position: whiz.end ?? event.position,
    });
  }

  /* Aggregate one trigger's actor layer by target. Damage has already been
   * applied per projectile by FireControl; this keeps seven close pellets from
   * becoming seven simultaneous flesh sounds while preserving an armor break. */
  const byTarget = new Map();
  for (const pellet of pellets) {
    if (!pellet.result?.applied || pellet.targetIsPlayer === true || !pellet.target) continue;
    const target = targetForCombatEvent(side, pellet.target);
    if (!target) continue;
    const group = byTarget.get(pellet.target) ?? { target, pellets: [] };
    group.pellets.push(pellet);
    byTarget.set(pellet.target, group);
  }
  for (const { target, pellets: hits } of byTarget.values()) {
    const first = hits[0];
    const last = hits.at(-1);
    const result = {
      ...first.result,
      applied: true,
      raw: hits.reduce((sum, pellet) => sum + (pellet.result.raw ?? 0), 0),
      damage: hits.reduce((sum, pellet) => sum + (pellet.result.damage ?? 0), 0),
      absorbed: hits.reduce((sum, pellet) => sum + (pellet.result.absorbed ?? 0), 0),
      armorAfter: last.result.armorAfter,
      armorBroken: hits.some((pellet) => pellet.result.armorBroken === true),
      healthAfter: last.result.healthAfter,
      fatal: hits.some((pellet) => pellet.result.fatal === true),
    };
    const point = first.end ?? target.root?.position ?? event.position;
    presentActorImpact(
      { result, point, zone: 'chest', weapon: event.weapon },
      { point, weapon: event.weapon },
    );
  }
}

function resetCombatPresentation() {
  combatAudio.reset();
  combatSteps.reset();
  ballisticImpacts.reset();
  suppressionField.reset();
  suppression.reset?.();
  lastPlayerSuppression = null;
  playerTriggerDamage.clear();
  playerTriggerPresentation.clear();
  pendingBodyFalls.clear();
  combatBarkTimer = 0;
  if (!dialogue.line && subtitleEl) subtitleEl.hidden = true;
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
  /* `dt` matters the day a Siege target grows a `hold`: without it the hold
   * clock accumulates `undefined` and the bar never fills. Nothing here holds
   * today, which is exactly why the omission was invisible. */
  interaction.update(dt);
  suppression.update(dt);
  weaponSystem.setSuppression(suppression);
  weaponSystem.update(dt, { speed: player.velocity?.length?.() ?? 0 });
  const weaponFeedback = weaponSystem.feedback();
  if (reticleEl) {
    reticleEl.dataset.aimed = String(weaponFeedback.aimed);
    reticleEl.dataset.spread = String(Number(weaponFeedback.spread.toFixed(5)));
    reticleEl.dataset.suppression = String(Number(weaponFeedback.suppression.toFixed(3)));
    const reticleBloom = 1 + Math.min(2.4, weaponFeedback.bloom * 60);
    reticleEl.style.setProperty('--combat-bloom', String(Number(reticleBloom.toFixed(3))));
  }
  if (hitConfirmTimer > 0) {
    hitConfirmTimer = Math.max(0, hitConfirmTimer - dt);
    if (hitConfirmTimer === 0) {
      if (reticleEl) delete reticleEl.dataset.confirmed;
      hitConfirmKind = null;
    }
  }
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
    /* The night bed and the off-screen battle scatter run on the mission's own
     * clock, so a stalled tab does not fire eight distant bursts at once. */
    dt,
  });
  dressing.update(dt);
  glass.update(dt);
  ballisticImpacts.update(dt);
  bloodImpacts.update(dt);
  deathBloodPools.update(dt);
  /* `alive` is the crew the cartel may engage, and it is deliberately
   * `ensemble.targets()` rather than `ensemble.members` -- that call is the
   * Snow-free list, and it is the first of the two locks keeping him out of
   * hostile targeting. The second is `userData.neverTargeted` on his own
   * root, which the pool checks before it ever reaches the faction matrix. */
  /* "four attacks left cant find them": when the active wave is a remnant
   * with nothing left to release, the pool converts this into men who stop
   * holding standoffs and walk at the player -- audible feet, visible
   * muzzles. The one-time nudge tells the player the shape has changed. */
  const huntActive = mission.huntActive;
  if (huntActive && !huntAnnounced) {
    huntAnnounced = true;
    nudge('The last of them are coming to you. Hold the rail.', 5);
  }
  if (!huntActive && !mission.activeWave) huntAnnounced = false;
  updateHuntPip(huntActive);
  attackers.update(dt, {
    player: playerTarget,
    /* Sight and shot truth both come off this list. It is the one with floors
     * in it -- see `combatColliders` above. */
    colliders: combatColliders,
    hunt: huntActive,
    alive: () => ensemble.targets(),
    audio: combatAdapterAudio,
    onBark: renderCombatBark,
    onWeaponEvent: (event) => presentCombatWeaponEvent(event, 'hostile'),
    onStep: (_entry, event) => presentCombatStep(event, dt),
    onPlayerHit: (hit = {}) => {
      const hitDamage = hit.damage ?? 0;
      playerDamageEvents++;
      combatHud.update();
      combatHud.noteDamage(hitDamage, {
        absorbed: hit.absorbed ?? 0,
        bearing: incomingBearing(
          hit.fromPosition ?? hit.from ?? hit.shooterPosition ?? hit.shooter?.position,
        ),
      });
      combatAudio.impact({
        target: 'player',
        zone: hit.zone ?? 'chest',
        caliber: combatCaliber(hit.weapon),
        position: player.position,
        result: { ...hit, applied: true },
      });
      if (hit.fatal) onPlayerDown();
    },
    /* A man came through a window: break it for real, so the hole he used is
     * a hole the player can shoot back through. The pool reports WHERE he
     * crossed rather than which pane, because it does not own the glass --
     * so the nearest pane to the crossing is the one that went. */
    onBreach: (breach) => { if (breach) shatterNearest(breach); },
  });
  updateRevive(dt);
  ensemble.update(dt, {
    player: playerTarget,
    /* The friendlies shoot through the same model the attackers do. */
    colliders: combatColliders,
    attackers,
    audio: combatAdapterAudio,
    onBark: renderCombatBark,
    onWeaponEvent: (event) => presentCombatWeaponEvent(event, 'friendly'),
    onStep: (_member, event) => presentCombatStep(event, dt),
    onImpact: (impact) => presentWorldImpact(impact),
    onHostileDown: (id) => { mission.noteDown(id); waveDirty = true; },
    onFriendlyDown: (id) => queueBodyFall(id, ensemble.members.get(id)?.root),
  });
  updateCombatBark(dt);
  flushBodyFalls(dt);
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
  combatHud.update();
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
  /* Where the player's ears are. Without this the WebAudio listener sits at
   * the world origin facing -Z for the whole scene and every positioned cue is
   * panned as heard from there -- see the long note in
   * src/cartel-palace/main.js, where the owner caught it. */
  audio.updateListener(camera);
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
  lightStatus,
  player,
  playerActor,
  audio,
  missionAudio,
  combatAudio,
  combatSteps,
  ballisticImpacts,
  suppressionField,
  combatHud,
  interaction,
  armory,
  armorCache,
  /* The one supply object this file builds rather than dresses. Published so a
   * verifier can measure where it stands instead of hunting the scene graph
   * for it by name -- the same reason `armorCache` is on this list. */
  foyerCache,
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
    arm: (id = WEAPON_IDS.CARBINE) => completeArmoryPickup(id),
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
    /* The hunt pip, as published: which way the nearest remnant man is,
     * and whether the element the player sees agrees with the reading. */
    huntPip: {
      ...huntPip,
      shown: !!huntPipEl && !huntPipEl.hidden && huntPipEl.classList.contains('active'),
      counterHunting: !!waveCountEl?.classList.contains('hunt'),
    },
    health: combatHud.update(),
    armor: combatArmor(playerActor),
    /* The ammunition card, as rendered: the count and the one line under it
     * that says what the gun is doing ("RELOADING", "EMPTY — R", "NO
     * ROUNDS"), plus the dry state the count turns orange for. */
    ammo: ammoEl && !ammoEl.classList.contains('hidden')
      ? {
        name: ammoNameEl?.textContent ?? '',
        mag: Number(ammoMagEl?.textContent ?? NaN),
        reserve: Number(ammoReserveEl?.textContent ?? NaN),
        state: ammoStateEl?.textContent ?? '',
        dry: ammoEl.classList.contains('dry'),
      }
      : null,
    complete: missionCardEl ? !missionCardEl.classList.contains('hidden') : false,
  }),
  /** Checkpoint entry, as the ?checkpoint= URLs drive it. */
  checkpointEntries: () => Object.keys(CHECKPOINT_ENTRIES),
  get startCheckpoint() { return startCheckpoint; },
  jumpToCheckpoint: (id) => jumpToCheckpoint(id),
  /** The people. */
  attackers,
  ensemble,
  /** Deterministic seams over the same adapters gameplay uses. */
  combatFeedback: () => ({ ...weaponSystem.feedback(), confirm: hitConfirmKind }),
  setAimed(on) {
    weaponSystem.setAimed(on === true);
    return weaponSystem.feedback();
  },
  combatImpact: (impact) => resolvePlayerWeaponImpact(impact),
  /**
   * The supply economy, from two directions.
   *
   * `snapshot()`, `useTriage()` and `useResupply()` are the AGGREGATE view --
   * the mission as one pool -- because that is what a headless drain wants and
   * what tools/verify-mansion-siege.mjs has always read: fill a baseline, spend
   * exactly that many charges, watch each `remaining` count down to zero, then
   * restore the checkpoint and find the baseline again. Draining takes the
   * caches in declaration order, which is the order the player walks them.
   *
   * `cache()` and the two `...At()` calls are the per-station view, which is
   * the one that proves the fix: spending the firing step must not move the
   * flank cans. Both views run through the same station handlers, so neither
   * is a second code path with its own arithmetic.
   */
  supplies: {
    snapshot: () => supplySnapshot(),
    ids: () => [...supplyCacheIds],
    cache: (id) => (combatSupplyCaches[id] ? combatSupplyCaches[id].snapshot() : null),
    useTriageAt: (id) => useTriageStation(id),
    useResupplyAt: (id) => useResupplyStation(id),
    useTriage: () => {
      const id = supplyCacheIds.find((key) => combatSupplyCaches[key].triageRemaining > 0);
      const result = useTriageStation(id ?? 'triageCase');
      return { ...result, remaining: totalSupplyCharges().triage };
    },
    useResupply: () => {
      const id = supplyCacheIds.find((key) => combatSupplyCaches[key].resupplyRemaining > 0);
      const result = useResupplyStation(id ?? 'firingStep');
      return { ...result, remaining: totalSupplyCharges().resupply };
    },
  },
  blood: {
    marks(id) {
      const actor = attackers.entry(id)?.actor;
      return actor ? bloodImpacts.marksOn(actor) : 0;
    },
    get pools() { return deathBloodPools.visibleCount; },
    reset() { bloodImpacts.reset(); deathBloodPools.reset(); },
  },
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
  get playerHits() { return playerHitCount; },
  get playerDamageEvents() { return playerDamageEvents; },
  get pointerLockRejected() { return pointerLockRejected; },
  weaponStats: () => ({ ...weaponSystem.stats }),
  /** The player's guns, for the verifier. Firearm stays the only ammo owner. */
  weapons: weaponSystem,
  get playerHealth() { return playerActor.health; },
  get playerArmor() { return playerActor.armor; },
  get playerDown() { return playerActor.incapacitated; },
  /** Headless only -- see the note on `invulnerable`. */
  setInvulnerable(on) { invulnerable = on !== false; return invulnerable; },
  /**
   * Put him on the floor.
   *
   * This used to return the beat the checkpoint had already rewound him to,
   * because dying restored it on the spot. Death raises a card now, so it
   * returns the beat he DIED on and the restore happens when something takes
   * the offer -- a player clicking, or `respawn()` below.
   */
  killPlayer() {
    playerActor.health = 0;
    playerActor.incapacitated = true;
    onPlayerDown();
    return mission.beat;
  },
  /** Is the death card up? */
  get deathScreen() { return deathEl?.classList.contains('showing') === true; },
  /** Take the checkpoint the card is offering, as the button does. */
  respawn() {
    respawnFromCheckpoint();
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

/* ================================================================== */
/* Prewarm -- pay the first shot's costs behind the menu                 */
/* ================================================================== */
/* Same bug and same cure as the Squatchfather (src/core/prewarm.js): the
 * cartel's shared muzzle flash is a PointLight that sits `visible = false`
 * until the first shot, three.js keys every material's shader program on the
 * visible light counts, so the frame that light first appears is the frame
 * the whole house needs programs it has never had. The impact decals, the
 * blood systems, the player's muzzle card and the glass wreckage are cheaper
 * shapes of the same first-use bill. Draw those states once, clipped to a
 * single pixel, while the menu is still up -- never mid-frame during play.
 * Nothing about the look changes; the cost just stops landing mid-firefight. */

/** Everything hidden now that the firefight puts on screen later. */
function siegeFirstShotObjects() {
  /* Shard groups, crack overlays and the particle pool are all hidden until
   * a pane breaks. Collecting whatever glass.js hides NOW keeps this list
   * honest if it grows another effect layer. */
  const hiddenGlass = [];
  glass.root.traverse((o) => { if (o.visible === false) hiddenGlass.push(o); });
  return [
    ballisticImpacts,        // pooled bullet marks ({ pool } holder)
    bloodImpacts.wounds,     // entry wounds
    bloodImpacts.spatter,    // and their secondary marks
    deathBloodPools.meshes,  // spreading floor pools
    weaponSystem.flash,      // the player's own muzzle card
    hiddenGlass,
  ];
}

async function prewarmSiegeFirstShot() {
  const effects = siegeFirstShotObjects();
  const flash = attackers.muzzleFlash;
  /* Intensity is irrelevant to the program key but is set anyway so the warm
   * draw is the draw a real cartel shot performs (attackers.js sets 3.4). */
  const flashIntensity = flash.intensity;
  flash.intensity = 3.4;
  try {
    return await prewarmScene({
      renderer,
      scene,
      camera,
      // A frame between the passes: the menu stays clickable while they run.
      spread: true,
      /* Gameplay draws through the composer, and three keys programs on the
       * render target's tone mapping and colour space -- warming the canvas
       * would warm the WRONG programs (prewarm.js, reason 2). */
      options: {
        target: postfx.enabled && postfx.composer ? postfx.composer.readBuffer : null,
      },
      passes: [
        // The house's own lighting, with every hidden effect object drawn.
        { name: 'combat effects', reveal: effects },
        /* And again with the flash lit: one more visible point light than
         * the rig's steady ten -- the exact state that used to hitch. */
        { name: 'muzzle flash', reveal: [...effects, flash] },
      ],
      /* No pools to fill and no audio wait here: every effect pool above is
       * built eagerly in its constructor, and beginSiege() already awaits the
       * weapon/combat banks (plus prewarmAudio on the first-shot cues) before
       * the mission can start. */
    });
  } finally {
    flash.intensity = flashIntensity;
    flash.visible = false;
  }
}

/* One frame later -- so the first real render has already put the house on
 * the GPU -- buy the firefight its shader programs behind the menu, where
 * nobody is counting frames. Checkpoint restarts never re-enter this path:
 * the compiled programs outlive every in-page retry. */
requestAnimationFrame(() => {
  /* Never fatal: a scene that cannot be prewarmed is a scene that hitches
   * once, not one that fails to boot. */
  window.mansionSiege.prewarming = prewarmSiegeFirstShot()
    .catch((err) => ({ failed: String(err?.message ?? err) }))
    .then((report) => {
      window.mansionSiege.prewarmReport = report;
      return report;
    });
});
