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
import { createPauseMenu } from '../../core/pause-menu.js';
import { WeaponSystem } from '../../core/weapons/WeaponSystem.js';
import { mountArmory } from '../../core/weapons/Armory.js';
import { weaponCueNames } from '../../core/weapons/audio.js';
import { WEAPON_IDS } from '../../core/weapons/catalog.js';
import { FACTIONS, FactionMatrix } from '../../core/combat/factions.js';
import { CombatActor } from '../../core/combat/actors.js';
import { SuppressionModel } from '../../core/combat/suppression.js';

import { MansionDamageState } from './state.js';
import { SiegeMission, B, CHECKPOINTS } from './mission.js';
import { COMBAT_BOUNDARY, DEFENCE_POST, ENCOUNTERS } from './waves.js';
import { buildSiegeNight } from './night.js';
import { buildSiegeDressing } from './dressing.js';
import { buildSiegeGlass } from './glass.js';
import { createAttackerPool } from './attackers.js';
import { buildSiegeEnsemble } from './ensemble.js';

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
const waveCountEl = $('waveCount');
const waveRemainingEl = $('waveRemaining');
const checkpointEl = $('checkpoint');
const alarmWashEl = $('alarmWash');
const damageWashEl = $('damageWash');
const ammoEl = $('ammo');
const ammoNameEl = $('ammoName');
const ammoMagEl = $('ammoMag');
const ammoReserveEl = $('ammoReserve');
const ammoStateEl = $('ammoState');
const reticleEl = $('reticle');

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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
 * so the VISIBLE light count never changes and no material recompiles. */
const ACTIVE_LIGHTS = 10;
const _lightRank = [];
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

const weaponSystem = new WeaponSystem({
  camera,
  world: scene,
  audio,
  groundAt: (x, z) => interior.floorAt(x, z, player.position.y - player.eyeHeight)
    ?? exteriorGroundAt(x, z),
  hitTargets: [...interior.occluders, ...grounds.occluders],
  range: 70,
  onEvent: () => { ammoDirty = true; },
});

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
  onEvent: (event) => {
    ammoDirty = true;
    if (event?.type !== 'taken' || !event.id) return;
    if (HEAVY_IDS.has(event.id)) heavyTaken = true;
    else PRIMARY_TAKEN.add(event.id);
    mission.armed({ primary: PRIMARY_TAKEN.size > 0, heavy: heavyTaken });
  },
});

/* ================================================================== */
/* The mission                                                           */
/* ================================================================== */
let running = false;
let ammoDirty = true;
let waveDirty = true;
let checkpointToast = 0;

const mission = new SiegeMission({
  damage,
  onObjective: (text) => {
    if (!objectiveEl) return;
    objectiveEl.hidden = !text;
    if (text) objectiveTextEl.textContent = text;
  },
  onBeat: (beat) => {
    ensemble.stage(beat);
    waveDirty = true;
  },
  onSpawn: (order) => attackers.spawn(order),
  onCheckpoint: (id) => {
    checkpointEl.textContent = (CHECKPOINTS[id]?.label ?? 'CHECKPOINT').toUpperCase();
    checkpointEl.classList.add('show');
    checkpointToast = 2.2;
  },
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
    capture: () => weaponSystem.hud?.() ?? null,
    restore: () => { ammoDirty = true; },
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
    capture: () => ({ littleFriend: mission.littleFriendSaid }),
    restore: () => { /* mission.js owns the flag; nothing scene-side to undo. */ },
  });

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
function shatterNearest({ x, z }) {
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
    audio.play?.('siege.glass.shatter');
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

function updateTriggers(dt) {
  triggerTimer -= dt;
  if (triggerTimer > 0) return;
  triggerTimer = 0.12;
  const { x, z } = player.position;
  const feet = player.position.y - player.eyeHeight;
  if (mission.beat === B.TO_ARMORY && inRect(BASEMENT_ROOM, x, z) && feet < GROUND_Y - 1) {
    mission.enteredArmory();
    return;
  }
  if (mission.beat === B.TO_OFFICE && inRect(OFFICE, x, z) && feet > UPPER_Y - 1) {
    mission.enteredOffice();
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
  if (e.code === 'KeyQ' && !e.repeat && weaponSystem.equipped) armory.put();
  /* The line. Once, ever, and only with the heavy up on the landing. */
  if (e.code === 'KeyF' && !e.repeat) tryTheLine();
});
window.addEventListener('keyup', (e) => {
  player.setKey(e.code, false);
  if (e.code === 'KeyE') interaction.release();
});
window.addEventListener('blur', () => {
  player.clearKeys();
  interaction.release();
  weaponSystem.setTrigger(false);
});
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
  if (!HEAVY_IDS.has(weaponSystem.equipped ?? '')) return false;
  const { x, z } = player.position;
  const onTheStep = x >= DEFENCE_POST.x0 && x <= DEFENCE_POST.x1
    && z >= DEFENCE_POST.z0 && z <= DEFENCE_POST.z1;
  if (!onTheStep) return false;
  if (!mission.sayHello()) return false;
  audio.play?.('siege.prospect.little_friend', { volume: 1 });
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
  ammoMagEl.textContent = String(hud.mag ?? 0);
  ammoReserveEl.textContent = String(hud.reserve ?? 0);
  ammoStateEl.textContent = hud.state ?? '';
}

function refreshWaveCount() {
  if (!waveDirty || !waveCountEl) return;
  waveDirty = false;
  const wave = mission.activeWave;
  if (!wave) { waveCountEl.hidden = true; return; }
  waveCountEl.hidden = false;
  const left = wave.totalCount - wave.down.size;
  waveRemainingEl.textContent = String(left);
}

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
    'Left mouse fires. R reloads. E takes a weapon off the rack, Q puts it back.',
    'F -- say it, once, from the top of the stairs with the heavy in your hands.',
    'Tab pauses and resumes. Escape releases the mouse, which also pauses.',
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
/* Boot                                                                  */
/* ================================================================== */
async function beginSiege() {
  if (running) return;
  running = true;
  menuEl.classList.add('hidden');
  await audio.init();
  audio.loadManifest({ names: [...weaponCueNames(), ...siegeCueNames()] }).catch(() => {});
  /* The pistol on the nightstand: the Heavy-frame .45, which is the sidearm
   * this campaign has put in his hands before. One magazine in and one spare
   * -- enough to survive a corridor if he aims, nowhere near enough to make
   * the armory optional. */
  weaponSystem.equip(WEAPON_IDS.REVOLVER);
  ammoDirty = true;
  mission.start(B.WAKE);
  startWaking();
  renderer.domElement.requestPointerLock?.();
  clock.getDelta();
}
startBtn.addEventListener('click', beginSiege);

/** Cue names this scene wants preloaded. Kept beside the mission it serves. */
function siegeCueNames() {
  return [
    'siege.alarm.tone',
    'siege.prospect.little_friend',
    'siege.glass.shatter',
    'siege.fire.crackle',
    'siege.wave.incoming',
    'siege.checkpoint',
  ];
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
  night.update(dt);
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
  refreshAmmo();
  refreshWaveCount();
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (running && !pauseMenu.isPaused()) updateGame(dt);
  if (renderEnabled) { renderer.render(scene, camera); framesRendered++; }
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
  THREE,
  scene,
  camera,
  renderer,
  player,
  audio,
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
  /** The people. */
  attackers,
  ensemble,
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
  anchors,
  teleport,
  start: () => beginSiege(),
  /** What is in his hands, and putting something there. For the verifier. */
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
  equip: (id) => { weaponSystem.equip(id); ammoDirty = true; return weaponSystem.equipped ?? null; },
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
};
