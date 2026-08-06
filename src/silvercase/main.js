import * as THREE from 'three';
import { buildApartmentScene, ANCHORS, BATHROOM_DOOR } from './scenes/ApartmentScene.js';
import { buildCarInterior } from './scenes/CarInterior.js';
import { populateCast } from './cast/cast.js';
import { SILVERCASE_APE_PRESENTATION } from './cast/ape.js';
import { makeRevolverViewModel, muzzleWorld } from './props/weapon.js';
import { makeCase } from './props/case.js';
import { ReactionWindow } from './combat/ReactionWindow.js';
import { ImpactKit, ShotResolver } from './combat/Shooting.js';
import { DialogueController } from './dialogue/DialogueController.js';
import {
  SEQUENCES, CHOICES, OBJECTIVES, INSTRUCTIONS, TARGET_CALLOUTS,
} from './dialogue/script.js';
import { silverCaseAudioLoadOptions } from './audio.js';
import { SilverCaseStateMachine, S, CHECKPOINT } from './state/SilverCaseStateMachine.js';
import { Player } from '../core/player.js';
import { InteractionSystem } from '../core/interaction.js';
import { AudioEngine } from '../core/audio.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { PostFX } from '../core/postfx.js';
import { yawToward } from '../world/build.js';
import { roomEnvironment } from '../world/textures.js';

/**
 * The Silver Case — composition root.
 *
 * Wires level (ApartmentScene/CarInterior), cast (cast.js), dialogue
 * (DialogueController + script.js), the bathroom reaction window
 * (ReactionWindow), the shared Player/InteractionSystem/AudioEngine/
 * pause-menu, and the mission's own state machine into the full playable
 * beat sequence. Standalone: no import of core/campaign.js, no
 * navigateCampaign call anywhere in this file. Open silvercase.html directly
 * to play, the same way src/squatchfather/main.js is entered directly.
 *
 * See the accompanying report for the exact DOM id contract this file
 * expects silvercase.html to provide, and for every place this file had to
 * make a call the level/cast phases left open.
 */

// ---------------------------------------------------------------- boot

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

/*
 * Bloom, at its unmodified defaults.
 *
 * This mission is the same genre `core/postfx.js` was written for — see that
 * file's own header: "a dark flat full of small bright things". The living
 * room here has the identical shape (a standard lamp, a flickering TV, an
 * exit sign, a city-window glow) and the car ride adds a lit dashboard and
 * passing streetlights, nothing brighter. `src/main.js` (the apartment this
 * scene shares a floor plan with) mounts `PostFX` with no threshold/strength
 * override for exactly this reason; NO WAKE and Silver Pines retune it
 * because they are lit exteriors, a different problem. Leaving the defaults
 * alone here is the conservative choice: subtle bloom on the emissive
 * fixtures, the self-measuring frame-time fallback armed exactly as shipped,
 * nothing added that this scene's own look did not already call for.
 */
const postfx = new PostFX(renderer, scene, camera);
postfx.enable();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
});

{
  // Chrome, steel and glass need something to reflect or they render black —
  // this mission is named after a chrome briefcase and hands the player a
  // revolver, so both of those matter. Same treatment as the Bing's floor.
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const src = roomEnvironment();
  scene.environment = pmrem.fromEquirectangular(src).texture;
  scene.environmentIntensity = 0.26;
  pmrem.dispose();
  src.dispose();
}

// Each room owns its own light — the apartment its lamps and ceiling
// fixtures, the car its dome light, instruments, road bounce and passing
// streetlights (see CarInterior.js's note on why the car ride used to render
// as a black screen). The only light that lives up here is the one that
// belongs to the camera rather than to either room.

// A tiny muzzle flash, shared by the couch shot and the bathroom shot.
const muzzleLight = new THREE.PointLight(0xffcf8a, 0, 6, 2);
camera.add(muzzleLight);
function muzzleFlash() {
  muzzleLight.intensity = 6;
  after(0.06, () => { muzzleLight.intensity = 0; });
}

// ---------------------------------------------------------------- DOM
//
// Every id this file calls document.getElementById on. silvercase.html must
// provide exactly these; see the final report for the full contract
// (default visibility, which classes are toggled, and why).

function $(id) { return document.getElementById(id); }

const ui = {
  menu: $('menu'),
  beginBtn: $('beginBtn'),

  hud: $('hud'),
  reticle: $('reticle'),
  objective: $('objective'),
  objectiveText: $('objectiveText'),
  instruction: $('instruction'),
  targetTag: $('targetTag'),
  subs: $('subs'),
  subsWho: $('subsWho'),
  subsLine: $('subsLine'),
  prompt: $('prompt'),
  promptKey: $('promptKey'),
  promptText: $('promptText'),
  holdBar: $('holdBar'),
  holdFill: $('holdFill'),
  choicePrompt: $('choicePrompt'),
  choiceOptions: $('choiceOptions'),
  choiceHoldBar: $('choiceHoldBar'),
  choiceHoldFill: $('choiceHoldFill'),

  deathOverlay: $('deathOverlay'),
  deathTitle: $('deathTitle'),
  retryBtn: $('retryBtn'),

  sceneCompleteOverlay: $('sceneCompleteOverlay'),
  playAgainBtn: $('playAgainBtn'),
};

function setObjective(text) {
  if (!text) { ui.objective.classList.remove('show'); return; }
  ui.objectiveText.textContent = text;
  ui.objective.classList.add('show');
}

/* ------------------------------------------------------------------ */
/* Preview checkpoint shortcuts (?checkpoint=...)                      */
/*
 * LOCAL support only, deliberately -- mirrors src/enolasquatch/main.js's own
 * CHECKPOINT_ALIASES rather than routing through src/core/preview-mode.js,
 * whose checkpoint parsers are each a different campaign scene's own
 * vocabulary. Standalone scene, same as src/mansion/siege/main.js -- no
 * import of core/campaign.js anywhere in this file, no saved progress to
 * protect -- so this needs no `?preview=1` gate either, matching the siege's
 * own `?checkpoint=` support.
 *
 * The mission's own one authored checkpoint is `SQUATCH_PRAYER` (see
 * `CHECKPOINT` in state/SilverCaseStateMachine.js, and `restoreCheckpoint()`
 * below, which already stages everything a retry from it needs). The other
 * five waypoints below are not saveable checkpoints -- there is only one --
 * so each one is staged by hand and then handed to the SAME `fsm.go()` the
 * mission's own beats use, so the target beat's own `enter()` still runs for
 * real (its dialogue, its positioning) exactly as a played run would reach
 * it. `jumpToPreviewCheckpoint()`, near the bottom of this file, is where
 * that staging happens.
 */
const SILVERCASE_CHECKPOINTS = Object.freeze({
  car: 'car',
  hallway: 'hallway',
  room: 'room',
  prayer: 'prayer',
  bathroom: 'bathroom',
  aftermath: 'aftermath',
});
const SILVERCASE_CHECKPOINT_LABELS = Object.freeze({
  car: 'THE CAR RIDE',
  hallway: 'THE HALLWAY',
  room: 'CONTROL ESTABLISHED',
  prayer: 'THE SQUATCH PRAYER',
  bathroom: 'THE BATHROOM AMBUSH',
  aftermath: 'THE AFTERMATH',
});
function previewCheckpointForLocation(locationLike = window.location) {
  let params;
  try { params = new URLSearchParams(locationLike?.search || ''); } catch { return null; }
  const value = params.get('checkpoint');
  return value && Object.prototype.hasOwnProperty.call(SILVERCASE_CHECKPOINTS, value)
    ? SILVERCASE_CHECKPOINTS[value]
    : null;
}
/** Resolved once at boot -- a real waypoint id, or null for the ordinary opening. */
const previewCheckpoint = previewCheckpointForLocation();
if (previewCheckpoint) {
  const label = SILVERCASE_CHECKPOINT_LABELS[previewCheckpoint] ?? previewCheckpoint;
  const subtitle = document.querySelector('#menu .subtitle');
  if (subtitle) subtitle.textContent = `Preview checkpoint: ${label}. Progress on this page is temporary.`;
  if (ui.beginBtn) ui.beginBtn.textContent = `START AT ${label}`;
}

/**
 * The on-screen game instruction — the owner's "pop up to kill the guy on the
 * couch", in the hub's own register rather than a character's.
 *
 * Deliberately NOT a dialogue line with a speaker: nobody in the room says it,
 * it carries no cue, and it stays on screen for as long as the order stands
 * instead of scrolling by. The copy lives in script.js's `INSTRUCTIONS` with
 * the rest of the mission's writing.
 */
/**
 * Play a beat, and only then put the instruction on screen.
 *
 * The order is the point, and it is the owner's rule for every scene: the
 * character says his line first — "This is the part where we make sure
 * everybody remembers this conversation" — and the HUD arrives afterwards to
 * clarify what that means in buttons. Showing both at once reads as the game
 * talking over its own cast, and it also gives away the beat before Ape has
 * finished setting it up.
 */
function sayThenInstruct(sequence, text, opts = {}) {
  dialogue.play(sequence, {
    ...opts,
    onDone: () => {
      setInstruction(text, opts.instruction);
      opts.onDone?.();
    },
  });
}

function setInstruction(text, { urgent = false } = {}) {
  if (!text) {
    ui.instruction.classList.remove('show', 'urgent');
    ui.instruction.textContent = '';
    return;
  }
  ui.instruction.textContent = text;
  ui.instruction.classList.add('show');
  ui.instruction.classList.toggle('urgent', urgent);
}

/** The tiny HUD contract InteractionSystem (core/interaction.js) needs —
 * exactly showPrompt/hidePrompt/setHold, nothing from core/hud.js. */
const tinyHud = {
  showPrompt(label, key) {
    ui.promptKey.textContent = key || 'E';
    ui.promptText.textContent = typeof label === 'function' ? label() : label;
    ui.prompt.classList.add('show');
  },
  hidePrompt() {
    ui.prompt.classList.remove('show');
  },
  setHold(progress) {
    if (progress == null) {
      ui.holdBar.classList.remove('show');
      ui.holdFill.style.width = '0%';
      return;
    }
    ui.holdBar.classList.add('show');
    ui.holdFill.style.width = `${Math.round(progress * 100)}%`;
  },
};

/** Builds the 1-4 option rows (louQuestion/aftermath) or the single
 * hold-to-confirm row (prayerFinish) inside #choiceOptions. */
function renderChoice(choiceDef) {
  ui.choiceOptions.replaceChildren();
  const addRow = (keyLabel, text) => {
    const row = document.createElement('div');
    row.className = 'choiceOption';
    row.dataset.key = keyLabel;
    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = keyLabel;
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = text;
    row.append(key, txt);
    ui.choiceOptions.append(row);
  };
  if (Array.isArray(choiceDef.options)) {
    for (const opt of choiceDef.options) addRow(opt.key, opt.text);
    ui.choiceHoldBar.classList.remove('show');
    ui.choiceHoldFill.style.width = '0%';
  } else {
    addRow('E', choiceDef.prompt || 'Hold E.');
    ui.choiceHoldBar.classList.add('show');
    ui.choiceHoldFill.style.width = '0%';
  }
  ui.choicePrompt.classList.add('show');
}

// ---------------------------------------------------------------- systems

const apartment = buildApartmentScene();
const car = buildCarInterior();
scene.add(apartment.root);
scene.add(car.root);
apartment.root.visible = false;
car.root.visible = false;

const cast = populateCast(apartment.root);

// world.colliders starts as a *copy* of ApartmentScene's own collider list —
// copying the array (not just aliasing it) so the front door's collider can
// be spliced in and out at runtime (see setDoorColliderOpen below) without
// mutating ApartmentScene's own returned array. The Box3 element itself is
// still the exact same object ApartmentScene built, so identity checks
// (indexOf) still work.
const world = { colliders: [...apartment.colliders], floorZones: [] };

const player = new Player(camera, world);
player.mode = 'walk';

const interactions = new InteractionSystem(camera, tinyHud);
const audio = new AudioEngine();
// 3.2s, not 2.2. The owner's note: "lets give another second to get the
// bathroom guy." The window still starts the instant the door is kicked and
// still ends the mission when it runs out — it is now long enough to find a
// man in a doorway, put the crosshair ON him (which, since the shot became a
// real ray, is a thing the player genuinely has to do) and fire.
const reactionWindow = new ReactionWindow({ windowSeconds: 3.2 });

/**
 * The shot, and what it leaves.
 *
 * `shots` casts the ray down the middle of the screen; `impacts` owns the
 * pooled holes and wounds. The cast is parented into `apartment.root`, so one
 * ray settles both "did I hit anybody" and "what is behind him" with the
 * nearest hit winning — a man standing behind the couch cannot be shot through
 * it, and a shot that misses everyone still marks the plaster.
 */
const shots = new ShotResolver(camera, { root: apartment.root });
for (const actor of cast.all) shots.registerActor(actor);
const impacts = new ImpactKit(scene);

/**
 * The five-box bottom-right loadout every other production scene mounts
 * (src/core/scene-inventory.js). It brings its own DOM and its own stylesheet,
 * so silvercase.html needs nothing added to it. Hidden until the mission is
 * actually running, exactly like the Squatchfather's and the Beef Run's.
 */
const sceneInventory = new SceneInventoryBar({
  slots: 5,
  visible: false,
  catalog: {
    revolver: { icon: '🔫', name: 'Big revolver' },
    case: { icon: '💼', name: 'Lou’s case' },
  },
});
/** What Tony is carrying, in slot order. Drives the bar and nothing else. */
const loadout = { revolver: false, revolverDrawn: false, case: false };
let inventorySignature = '';
function syncInventory() {
  const items = [];
  if (loadout.revolver) {
    items.push({
      icon: '🔫',
      label: loadout.revolverDrawn ? 'Big revolver · drawn' : 'Big revolver · concealed',
    });
  }
  if (loadout.case) items.push({ icon: '💼', label: 'Lou’s case · closed' });
  const next = JSON.stringify(items);
  if (next === inventorySignature) return;
  inventorySignature = next;
  sceneInventory.set(items, Math.max(0, items.length - 1));
}

/** Tony's own gun, in his own hands — the same model the bathroom man holds. */
const viewModel = makeRevolverViewModel(camera);

/**
 * The case, once it is in his hand rather than on the floor: a second, small,
 * SHUT copy carried at the bottom-left of frame. The world case is hidden at
 * the same moment, so there is only ever one of them on screen.
 */
const carriedCase = makeCase({ x: 0, y: 0, z: 0 });
carriedCase.group.name = 'carriedCase';
carriedCase.group.scale.setScalar(0.72);
carriedCase.group.position.set(-0.3, -0.34, -0.62);
carriedCase.group.rotation.set(0.12, 0.5, 0.28);
carriedCase.group.visible = false;
camera.add(carriedCase.group);

/**
 * The take currently in somebody's mouth.
 *
 * `source` was previously assigned without ever being declared, and an ES
 * module is strict mode: `voiceSource = audio.play(...)` threw a
 * ReferenceError out of `playCue` the first time a line with a recording came
 * up — which is sixty of this mission's seventy-six. The throw propagated out
 * of `DialogueController._advance`, so the mission stopped advancing on its
 * first recorded line rather than failing anywhere visible.
 *
 * `seconds` rides along because `onLine` is what starts the speaker's mouth
 * and it needs to know how long an UNRECORDED line is going to be on screen.
 */
let voiceSource = null;
let voiceSeconds = 0;

/**
 * Which body in the room each script speaker is.
 *
 * PROSPECT is the player — first person, no head to animate — and HUD is
 * nobody at all, so neither has an entry. Anyone missing from this table is
 * simply a line nothing in the room mouths, which is the correct outcome for
 * a voice with no body behind it.
 */
const SPEAKER_BODY = Object.freeze({
  APE: 'ape',
  DEKE: 'deke',
  CHESTER: 'chester',
  WINSTON: 'winston',
  PRUITT: 'pruitt',
});

/** Cut every mouth in the room. Called wherever the voice itself is cut. */
function hushCast() {
  for (const actor of cast.all) actor.npc.hush?.();
}

/**
 * Put the line in the right man's mouth.
 *
 * The take is handed over rather than a duration, so the mouth runs on the
 * amplitude of the recording (src/core/mouth.js) and stops when it stops. The
 * seconds are the fallback's length only — what an unrecorded line's subtitle
 * is up for.
 */
function speakLine(line) {
  hushCast();
  const actor = cast[SPEAKER_BODY[line.speaker]];
  if (!actor?.alive) return;
  const authored = line.hold ?? Math.max(1.2, (line.text?.length || 0) * 0.045);
  actor.npc.say(Math.max(authored, voiceSeconds), { audio, source: voiceSource });
}

const dialogue = new DialogueController({
  /* THE TAKES LANDED AND NOTHING PLAYED THEM.
   *
   * This used to read "no vo.silvercase.* cues have been recorded yet ...
   * every line here is text-only", and it was true when it was written. Sixty
   * of the mission's seventy-six lines have since been recorded, and the
   * comment kept the hook out — so the whole mission ran silent with
   * subtitles over a folder full of finished audio, and nothing anywhere
   * reported it. A note about the state of the world is a fact with a
   * shelf life; this one outlived its subject by weeks.
   *
   * `hasSample` is the gate rather than a list of names, so the sixteen that
   * are still unrecorded stay silence-plus-subtitle — the game's own
   * convention — and start playing the day they are delivered, with no
   * further code change. */
  /* Returns the take's real length so the controller can hold the line for
   * it rather than for an authored guess. See DialogueController._advance. */
  playCue(cue) {
    voiceSource = null;
    voiceSeconds = 0;
    if (!cue || !audio?.hasSample?.(cue)) return 0;
    voiceSource = audio.play(cue, { volume: 0.9 });
    voiceSeconds = audio.sampleDuration?.(cue) ?? 0;
    return voiceSeconds;
  },
  stopVoice() {
    /* The mouth goes with the voice, always — including when the line is CUT
     * rather than finished, which is what this hook is for. */
    hushCast();
    if (!voiceSource) return;
    /* `stop()` throws on a source that has already ended, which is the normal
     * case — the line finished on its own and we are only tidying up. */
    try { voiceSource.stop(); } catch { /* already done */ }
    voiceSource = null;
    voiceSeconds = 0;
  },
  onLine(line) {
    ui.subsWho.textContent = line.speakerName || '';
    ui.subsLine.textContent = line.text;
    ui.subs.classList.add('show');
    speakLine(line);
  },
  onLineEnd() {
    ui.subs.classList.remove('show');
    hushCast();
  },
  onLook() {
    // DialogueController's own doc: "a soft suggestion, never a lock." This
    // mission never locks or nudges the camera on a line's `look` hint —
    // free-look stays fully live throughout, including every dialogue-heavy
    // beat — so this hook is intentionally a no-op.
  },
  onChoiceOpen(choiceDef) {
    renderChoice(choiceDef);
  },
  onChoiceClose() {
    ui.choicePrompt.classList.remove('show');
    ui.choiceHoldBar.classList.remove('show');
  },
});

/**
 * Every mouth in the room, and what is driving it.
 *
 * `open` is the smoothed 0..1 opening, `mode` is null / 'audio' / 'fallback',
 * and `scaleY` is what the mesh is ACTUALLY at — measured off the object
 * rather than recomputed, so a check cannot pass on a number the renderer
 * never saw. `photo` marks the faces that have no mouth to move (see
 * src/core/mouth.js).
 *
 * Kept out of `state()` and reachable on its own, because the mouth check
 * samples it once a frame and building the whole state object — which walks
 * three decal pools and every actor — at that rate would measure the sampler.
 */
function mouthState() {
  return Object.fromEntries(cast.all.map((actor) => {
    const m = actor.npc.voiceMouth;
    return [actor.name.toLowerCase(), {
      open: +m.open.toFixed(4),
      mode: m.mode,
      level: +m.level.toFixed(4),
      photo: m.photo,
      scaleY: +(actor.npc.parts.mouth?.scale.y ?? 0).toFixed(5),
      restY: +(m.rest?.y ?? 0).toFixed(5),
    }];
  }));
}

/** What the voice channel is doing, so silence can be told from a bug. */
function voiceState() {
  return {
    cue: dialogue.cueLog[dialogue.cueLog.length - 1] ?? null,
    playing: Boolean(voiceSource),
    seconds: +voiceSeconds.toFixed(3),
    talking: dialogue.busy,
    recorded: dialogue.cueLog.filter((c) => c && audio.hasSample(c)).length,
    attempted: dialogue.cueLog.length,
  };
}

const pauseMenu = createPauseMenu({
  title: 'The Silver Case',
  canPause: () => running,
  getObjective: () => ui.objectiveText.textContent?.trim() || 'Follow Ape.',
  instructions: [
    'W A S D / arrows — move. Mouse — look.',
    'E — interact.',
    'Left click — fire. The shot goes where the crosshair is, so aim first.',
    'Right click — reach for your weapon (don’t, unless Ape says so).',
    '1-4 — pick a response when a choice is on screen. Hold E to finish the prayer.',
    'Tab or Escape — pause. M — mute.',
  ],
  onPause: () => {
    paused = true;
    if (audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend();
  },
  onResume: () => {
    paused = false;
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    clock.getDelta();
    lockPointer();
  },
  onRestart: () => window.location.reload(),
});

// ---------------------------------------------------------------- mission state

const cluesFound = { glasses: false, bathroomDoor: false, chesterGlance: false };
const flags = {
  irritatedApe: false,
  /** Set when the player let Ape finish somebody the player was asked to. */
  apeFinishedChester: false,
  apeFinishedWinston: false,
};
/**
 * The last trigger pull, for the HUD, the verify script and nothing else.
 * `{ intended, hit, actor, wrong }` — see `resolvePlayerShot`.
 */
let lastShot = null;
/** How many times a trigger pull found somebody other than the ordered man. */
let wrongTargetShots = 0;
/** How many pulls found nobody at all. */
let missedShots = 0;

let running = false;
let paused = false;
let pointerLocked = false;
let firePressed = false;
let drawPressed = false;
let earlyDrawCount = 0;
let holdE = 0;
let stallTimer = 0;
let stallWarned = false;
let couchFireHandled = false;

const ambientFired = {
  tv: false, food: false, glasses: false, bathroomDoor: false, chesterGlance: false,
};

// ---------------------------------------------------------------- small helpers

/** Generic tween pump — doors, and every scripted delay in this file. */
const tweens = [];
function animateOver(dur, fn, onDone = null) {
  tweens.push({ t: 0, dur: Math.max(0.0001, dur), fn, onDone });
}
/** Run `fn` once, `dur` seconds from now, without blocking anything else. */
function after(dur, fn) {
  animateOver(dur, () => {}, fn);
}
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const raw = Math.min(1, tw.t / tw.dur);
    const eased = raw * raw * (3 - 2 * raw);
    tw.fn(eased, raw);
    if (raw >= 1) {
      tweens.splice(i, 1);
      tw.onDone?.();
    }
  }
}

function swingDoor(doorDef, fromRad, toRad, dur = 0.7, onDone = null) {
  animateOver(dur, (e) => { doorDef.group.rotation.y = fromRad + (toRad - fromRad) * e; }, onDone);
}

/** Add/remove the front door's collider from the live world so the player
 * can walk through exactly while it is open. ApartmentScene.js always
 * includes this Box3 in its own returned collider list (the door's closed
 * footprint); nothing there ever opens or closes it — that hook was
 * deliberately left for this file. Without this, the front door would block
 * the only path between the hallway and the apartment forever, since the
 * wall itself is genuinely cut away for the doorway (there's no gap the
 * player could walk around). */
function setDoorColliderOpen(colliderBox, open) {
  const idx = world.colliders.indexOf(colliderBox);
  if (open && idx >= 0) world.colliders.splice(idx, 1);
  else if (!open && idx < 0) world.colliders.push(colliderBox);
}

const _fwd = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
/** Is the camera roughly pointed at `targetPos` (a plain {x,y,z} or Vector3)? */
function lookingAt(targetPos, maxAngle = 0.4, maxDist = 6) {
  camera.getWorldDirection(_fwd);
  _toTarget.set(
    targetPos.x - camera.position.x,
    targetPos.y - camera.position.y,
    targetPos.z - camera.position.z,
  );
  const dist = _toTarget.length();
  if (dist < 0.001 || dist > maxDist) return false;
  _toTarget.normalize();
  return _fwd.dot(_toTarget) > Math.cos(maxAngle);
}

const TV_POS = new THREE.Vector3(ANCHORS.tvSpot.x, ANCHORS.tvSpot.y, ANCHORS.tvSpot.z);
const TABLE_POS = new THREE.Vector3(ANCHORS.coffeeTableSpot.x, 0.5, ANCHORS.coffeeTableSpot.z);
const BATHROOM_DOOR_POS = new THREE.Vector3(BATHROOM_DOOR.x, 1.1, BATHROOM_DOOR.z);

/** ESTABLISH_CONTROL's free-roam flavour: glance at the TV/food/glasses/
 * bathroom door, or stand near Chester, each exactly once. */
function updateAmbientControl() {
  if (!ambientFired.tv && lookingAt(TV_POS)) {
    ambientFired.tv = true;
    dialogue.interject(SEQUENCES.ambientTV);
  }
  if (!ambientFired.food && lookingAt(TABLE_POS)) {
    ambientFired.food = true;
    dialogue.interject(SEQUENCES.ambientFood);
  }
  // The glasses are on the same table as the food, so this used to fire in
  // the SAME frame as the line above and stack two barks on top of each
  // other. It is the mission's one real clue — four glasses, three men — and
  // it has to be its own moment: the takeout line first, and then only once
  // the player is actually stood over the table looking down at it.
  if (!ambientFired.glasses && ambientFired.food && !dialogue.busy
      && lookingAt(TABLE_POS, 0.32, 2.6)) {
    ambientFired.glasses = true;
    cluesFound.glasses = true;
    apartment.props.glasses.noticed = true;
    dialogue.interject(SEQUENCES.ambientGlasses);
  }
  if (!ambientFired.bathroomDoor && lookingAt(BATHROOM_DOOR_POS)) {
    ambientFired.bathroomDoor = true;
    cluesFound.bathroomDoor = true;
    dialogue.interject(SEQUENCES.ambientBathroomDoor);
  }
  if (!ambientFired.chesterGlance) {
    const dx = player.position.x - cast.chester.group.position.x;
    const dz = player.position.z - cast.chester.group.position.z;
    if (Math.hypot(dx, dz) < 2.2) {
      ambientFired.chesterGlance = true;
      if (lookingAt(cast.chester.group.position)) cluesFound.chesterGlance = true;
      dialogue.interject(SEQUENCES.ambientChesterGlance);
    }
  }
}

/**
 * The reticle, and the name under it.
 *
 * Aiming only matters if the player can tell they are aiming. While a beat has
 * ordered a specific man shot, the same ray the trigger will use is cast every
 * frame: the dot grows when a shot is live at all and goes red, with the man's
 * name under it, at the moment it is genuinely on him. Nothing here changes
 * where the bullet goes — it only shows the player what the game already knows.
 */
let aimOnTarget = false;
function updateAimCallout() {
  const target = orderedTarget();
  if (!target || !running) {
    aimOnTarget = false;
    ui.reticle.classList.remove('aiming', 'hot');
    ui.targetTag.classList.remove('show');
    return;
  }
  ui.reticle.classList.add('aiming');
  const hit = shots.trace();
  aimOnTarget = hit?.actor === target;
  ui.reticle.classList.toggle('hot', aimOnTarget);
  if (aimOnTarget) {
    ui.targetTag.textContent = TARGET_CALLOUTS[fsm.name] || `${target.name.toUpperCase()} — FIRE`;
    ui.targetTag.classList.add('show');
  } else {
    ui.targetTag.classList.remove('show');
  }
}

/** Right-click "reach for the weapon" before Ape calls for it — gated at the
 * mousedown handler to only ever arm while in one of the three states that
 * care, so this has nothing stale to consume on any other beat. */
function checkEarlyDraw() {
  if (!drawPressed) return;
  drawPressed = false;
  earlyDrawCount++;
  if (earlyDrawCount === 1) dialogue.interject(SEQUENCES.earlyDraw);
  else if (earlyDrawCount === 2) dialogue.interject(SEQUENCES.earlyDrawSecond);
}

/** The prayer-finish choice is a hold-E QTE rather than a 1-4 pick. Reuses
 * Player's own live key-state (`player.keys`) rather than tracking a second,
 * redundant set of "is E down" bookkeeping. Guarded internally, so it is
 * always safe to call every frame regardless of which beat is current. */
function updateChoiceHold(dt) {
  if (dialogue.choice?.id !== 'prayerFinish') { holdE = 0; return; }
  const need = dialogue.choice.hold ?? 1.1;
  if (player.keys.has('KeyE')) holdE = Math.min(need, holdE + dt);
  else holdE = Math.max(0, holdE - dt * 2.5);
  ui.choiceHoldFill.style.width = `${Math.min(100, (holdE / need) * 100)}%`;
  if (holdE >= need) {
    holdE = 0;
    dialogue.resolveChoice('finish');
  }
}

/**
 * Somewhere open on the apartment floor, facing Chester's chair — clear of the
 * couch/coffee-table/chair colliders. Not any single authored anchor, since
 * none of ApartmentScene's anchors are "the middle of the room".
 *
 * Moved east with the coffee table: the table now sits square in front of the
 * couch (x 7.40–8.60, z 0.74–1.36) instead of half inside it, and the old
 * (8.6, 0.6) put the player's 0.30 m capsule 14 cm inside that footprint, so a
 * retry began by shoving him out of the furniture.
 */
const RETRY_SPOT = { x: 9.4, z: 0.55 };

function restoreCheckpoint() {
  tweens.length = 0;
  reactionWindow.reset();
  setInstruction('');
  // Actor.revive() puts a fallen figure back on its feet (or back in its
  // chair) at its spawn pose, and cast.js's pruitt.hide() tucks the bathroom
  // man back into the dark. Deke stays dead: the checkpoint is the start of
  // the prayer, which is well after the couch, and the whole point of the
  // owner's note is that his body does not go anywhere.
  cast.ape.revive();
  cast.chester.revive();
  cast.pruitt.hide();
  // Reviving a man puts his body back; it does not take the blood off it, and
  // the wound decals are parented to his own limbs so they would ride back up
  // onto a living Chester. Deke's stay exactly where they are: he does not
  // come back, and neither does what happened to him.
  impacts.clearActor(cast.chester);
  impacts.clearActor(cast.pruitt);
  impacts.clearActor(cast.ape);
  // Ape is back beside the chair with his gun in his hand, because that is
  // where the checkpoint's own beat put him — revive() alone would return him
  // to his BUILD position, which is now the corridor downstairs.
  cast.ape.snapTo('chair');
  cast.ape.drawWeapon();
  cast.ape.aimWeapon(false);
  // …and the door he came through goes back off the latch, but not shut: it
  // is ajar for the whole mission, which is the clue.
  apartment.doors.bathroomDoor.group.rotation.y = apartment.doors.bathroomDoor.ajarRotationY;
  // The case was found and shut two beats ago and stays that way.
  apartment.props.case.close({ instant: true });
  // He is holding the gun at the checkpoint, because he was holding it when
  // the bathroom door opened.
  loadout.revolver = true;
  loadout.revolverDrawn = true;
  viewModel.holster();
  viewModel.draw();
  syncInventory();

  player.mode = 'walk';
  player.pitchMin = -Math.PI / 2 + 0.05;
  player.pitchMax = Math.PI / 2 - 0.05;
  player.yawCenter = null;
  player.position.set(RETRY_SPOT.x, 1.66, RETRY_SPOT.z);
  player.yaw = yawToward(RETRY_SPOT, { x: ANCHORS.chairSeat.x, z: ANCHORS.chairSeat.z });
  player.pitch = 0;
  player.velocity.set(0, 0, 0);

  interactions.setPaused(false);
  ui.hud.classList.add('visible');
  sceneInventory.show();
  running = true;
  paused = false;
  clock.getDelta();
  lockPointer();
  fsm.go(CHECKPOINT);
}

/**
 * Preview-only checkpoint jump.
 *
 * `car` and `hallway` need no staging at all: `CAR_RIDE.enter()` and
 * `ARRIVE_HALLWAY.enter()` each fully rebuild the world visibility, the
 * player's pose and Ape's position from nothing, exactly as they do when
 * reached at the top of a fresh MENU boot -- so this only has to call
 * `fsm.go()` and let the beat's own real `enter()` do the rest.
 *
 * `room` and everything after it happen inside the apartment, which nothing
 * upstream of `ESTABLISH_CONTROL` sets on its own (the walk down the hallway
 * normally does it), so the world visibility, the player's pose and the front
 * door are staged here. `prayer` and everything after it additionally need
 * the case found and closed, Deke shot on the couch, and both guns drawn --
 * the same baseline `restoreCheckpoint()`, above, stages for the mission's
 * one real, saveable checkpoint (`SQUATCH_PRAYER`) -- so this reuses that
 * exact shape rather than a second, drifting copy of it. `bathroom` and
 * `aftermath` layer Chester's own chair shooting and (for `aftermath`) a
 * resolved bathroom ambush on top, the same persistent facts the mission
 * itself leaves behind once those beats have actually played. Every waypoint
 * ends by calling `fsm.go()` on the real target state, so that state's own
 * `enter()` -- its dialogue, its instruction text -- still runs for real.
 */
function jumpToPreviewCheckpoint(id) {
  if (id === 'car') { fsm.go(S.CAR_RIDE); return; }
  if (id === 'hallway') { fsm.go(S.ARRIVE_HALLWAY); return; }

  // Everything from here on has already walked in the (open) front door.
  car.root.visible = false;
  apartment.root.visible = true;
  player.mode = 'walk';
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.pitchMin = -Math.PI / 2 + 0.05;
  player.pitchMax = Math.PI / 2 - 0.05;
  player.yawCenter = null;
  player.velocity.set(0, 0, 0);
  apartment.doors.frontDoor.group.rotation.y = apartment.doors.frontDoor.openRotationY;
  setDoorColliderOpen(apartment.doors.frontDoor.collider, true);
  // Just inside the door, where Ape is walking from -- ESTABLISH_CONTROL's
  // own enter() lerps him the rest of the way to 'start' over about a second.
  cast.ape.snapTo('door');

  if (id === 'room') {
    player.position.set(ANCHORS.frontDoorInside.x, 1.66, ANCHORS.frontDoorInside.z);
    player.yaw = ANCHORS.frontDoorInside.yaw;
    player.pitch = 0;
    fsm.go(S.ESTABLISH_CONTROL);
    return;
  }

  // prayer and later: control established, the case found and closed, Deke
  // shot on the couch, both guns out -- restoreCheckpoint()'s own baseline
  // for the mission's one real checkpoint.
  apartment.props.caseOcclusion.visible = false;
  apartment.props.case.close({ instant: true });
  cast.deke.kill();
  drawWeapon();
  cast.ape.drawWeapon();
  cast.ape.snapTo('chair');
  player.position.set(RETRY_SPOT.x, 1.66, RETRY_SPOT.z);
  player.yaw = yawToward(RETRY_SPOT, { x: ANCHORS.chairSeat.x, z: ANCHORS.chairSeat.z });
  player.pitch = 0;

  if (id === 'prayer') { fsm.go(S.SQUATCH_PRAYER); return; }

  // bathroom and later: the man in the chair is down too, Ape's gun back at
  // his side.
  cast.chester.kill();
  cast.ape.aimWeapon(false);

  if (id === 'bathroom') { fsm.go(S.BATHROOM_AMBUSH); return; }

  // aftermath: the bathroom ambush is already won.
  cast.pruitt.reveal();
  cast.pruitt.kill();
  apartment.doors.bathroomDoor.group.rotation.y = apartment.doors.bathroomDoor.openRotationY;
  fsm.go(S.AFTERMATH);
}

// ---------------------------------------------------------------- interactables
//
// Registered once, here, rather than re-registered per beat — each
// descriptor's label/enabled/onUse simply branches on the current fsm state,
// the same pattern src/heist/main.js's own `use()` helper leans on.

const frontDoorHit = apartment.interactables.find((mesh) => mesh.name === 'frontDoor');
const caseHit = apartment.interactables.find((mesh) => mesh.name === 'caseHiding');

interactions.register(frontDoorHit, {
  key: 'E',
  label: () => (fsm.is(S.ARRIVE_HALLWAY) ? 'Knock' : 'Close the door'),
  enabled: () => fsm.is(S.ARRIVE_HALLWAY) || fsm.is(S.ENTER_APARTMENT),
  onUse: () => {
    if (fsm.is(S.ARRIVE_HALLWAY)) { fsm.go(S.KNOCK); return; }
    if (fsm.is(S.ENTER_APARTMENT)) {
      audio.play('door.creak', { volume: 0.4 });
      const from = apartment.doors.frontDoor.group.rotation.y;
      swingDoor(apartment.doors.frontDoor, from, 0, 0.6, () => {
        setDoorColliderOpen(apartment.doors.frontDoor.collider, false);
        audio.play('door.locked', { volume: 0.6 });
      });
      fsm.go(S.ESTABLISH_CONTROL);
    }
  },
});

interactions.register(caseHit, {
  key: 'E',
  label: () => (fsm.is(S.PICK_UP_CASE) ? 'Take the case' : 'Look for the case'),
  enabled: () => fsm.is(S.ESTABLISH_CONTROL) || fsm.is(S.PICK_UP_CASE),
  onUse: () => {
    if (fsm.is(S.ESTABLISH_CONTROL)) { fsm.go(S.CASE_REVEAL); return; }
    if (fsm.is(S.PICK_UP_CASE)) {
      takeCase();
      fsm.go(S.EXIT);
    }
  },
});

/**
 * Lou's case leaves the room the way it should have arrived: shut.
 *
 * It is latched by hand at the end of the confirmation beat (see CASE_REVEAL),
 * so by the time it is picked up the lid is already down; this only moves it
 * from the floor into Tony's hand — the world prop goes away, the carried copy
 * appears, and the inventory bar gains a slot.
 */
function takeCase() {
  apartment.props.case.close({ instant: true });
  apartment.props.case.group.visible = false;
  carriedCase.close({ instant: true });
  carriedCase.group.visible = true;
  loadout.case = true;
  syncInventory();
  audio.play('heist.shubes_case', { volume: 0.55 });
}

/** Tony's own gun comes out only when Ape says so, and goes away after. */
function drawWeapon() {
  const first = !viewModel.drawn;
  loadout.revolver = true;
  loadout.revolverDrawn = true;
  viewModel.draw();
  if (first) audio.play('gun.pickup', { volume: 0.5 });
  syncInventory();
}
function holsterWeapon() {
  loadout.revolverDrawn = false;
  viewModel.holster();
  syncInventory();
}

// ---------------------------------------------------------------- shooting
//
// The owner's note, and the reason any of this exists:
//
//   "you should also actually have to shoot where you are aiming. I just
//    clicked on the guy in the chair and it killed the bathroom guy."
//
// Every shooting beat used to read `firePressed` and kill its scripted man.
// Now a trigger pull casts a real ray (combat/Shooting.js), and the BEAT asks
// whether that ray found the man it named. Hitting somebody else, hitting Ape,
// and hitting the wall are three different, authored outcomes, and none of
// them advances the mission.

const _muzzle = new THREE.Vector3();
const _toShooter = new THREE.Vector3();
const _aimAt = new THREE.Vector3();

/** Which man, if any, the current beat has ordered shot. */
function orderedTarget() {
  if (fsm.is(S.COUCH_SHOOTING)) return cast.deke;
  if (fsm.is(S.CHAIR_SHOOTING)) return cast.chester;
  if (fsm.is(S.BATHROOM_AMBUSH)) return cast.pruitt;
  if (fsm.is(S.EXECUTE_WINSTON)) return cast.winston;
  return null;
}

/**
 * Blood on a man, at the point a ray actually found him, facing the shooter.
 *
 * Ape is exempt, and not by omission: `Actor`'s locked `hostile` setter is what
 * keeps him out of combat resolution, and this keeps him out of its cosmetics
 * too. A round that finds him is a line, not a wound.
 */
function markBody(actor, point, fromPoint, opts) {
  if (actor === cast.ape) return;
  _toShooter.copy(fromPoint).sub(point).normalize();
  impacts.body(actor, point, _toShooter, opts);
  audio.play('heist.player.hit', { volume: 0.5, position: point });
}

/** A hole in the plaster, and the crack of it. */
function markSurface(point, normal) {
  impacts.surface(point, normal);
  audio.play('gun.impact', { volume: 0.55, position: point });
}

/**
 * One pull of Tony's trigger: noise, flash, kick, ray, and whatever the ray
 * found. Returns the shot record; the calling beat decides what it means.
 */
function firePlayerShot() {
  audio.play('gun.shot', { volume: 0.92 });
  muzzleFlash();
  viewModel.fire();
  if (viewModel.gun.userData.muzzle) {
    muzzleWorld(viewModel.gun, _muzzle);
    impacts.muzzle(_muzzle);
  }
  const hit = shots.trace();
  if (hit?.actor) markBody(hit.actor, hit.point, camera.position);
  else if (hit) markSurface(hit.point, hit.normal);
  return hit;
}

/**
 * Fire, and report whether the ordered man was the one under the crosshair.
 *
 * A wrong hit is not a free pass: the man takes a real, non-fatal round (he is
 * needed alive for the rest of the mission, and a graze that reads as a graze
 * is better writing than a bullet that passes through him), Ape says so, and
 * the beat stays exactly where it was, waiting for the right shot.
 */
function resolvePlayerShot() {
  const target = orderedTarget();
  const hit = firePlayerShot();
  const actor = hit?.actor ?? null;
  const onTarget = Boolean(target) && actor === target;
  lastShot = {
    intended: target?.name ?? null,
    actor: actor?.name ?? null,
    onTarget,
    surface: Boolean(hit) && !actor,
  };
  if (onTarget) return true;
  if (actor === cast.ape) {
    dialogue.interject(SEQUENCES.shotAtApe);
    wrongTargetShots += 1;
    return false;
  }
  if (actor) {
    // Wounded, never killed by a stray: floored at a third of his health so
    // repeated mistakes can never quietly remove somebody the story needs.
    actor.hp = Math.max(Math.round(actor.maxHp / 3), actor.hp - 15);
    dialogue.interject(SEQUENCES.shotWrongMan);
    wrongTargetShots += 1;
    return false;
  }
  dialogue.interject(SEQUENCES.shotMissed);
  missedShots += 1;
  return false;
}

/**
 * Ape's own round, fired from his own gun at a man he is stood in front of.
 *
 * The impact point comes off a ray from his muzzle rather than from a guessed
 * chest height, for the same reason the player's does: it is the only way the
 * hole ends up on the body. If the ray finds anything other than the man (an
 * arm of the chair, say) the wound falls back to the aim point itself.
 */
function apeShootsAt(actor) {
  const gun = cast.ape.weapon;
  cast.ape.aimWeapon(true);
  actor.parts.head.getWorldPosition(_aimAt);
  _aimAt.y -= 0.3; // the chest, not the head
  if (!gun) {
    markBody(actor, _aimAt, camera.position);
    return;
  }
  muzzleWorld(gun, _muzzle);
  impacts.muzzle(_muzzle);
  audio.play('gun.shot', { volume: 0.85, position: _muzzle });
  const hit = shots.traceFrom(_muzzle, _aimAt.clone().sub(_muzzle));
  if (hit?.actor === actor) markBody(actor, hit.point, _muzzle, { spatter: false });
  else markBody(actor, _aimAt, _muzzle, { spatter: false });
}

// ---------------------------------------------------------------- states

function buildStates() {
  return {
    [S.MENU]: {
      enter() {
        ui.menu.classList.remove('hidden');
        ui.hud.classList.remove('visible');
      },
      exit() {
        ui.menu.classList.add('hidden');
        ui.hud.classList.add('visible');
      },
    },

    [S.CAR_RIDE]: {
      enter() {
        car.root.visible = true;
        apartment.root.visible = false;
        setObjective('');
        // Player.js's 'frozen' mode blocks handleMouseMove entirely, which
        // would erase CarInterior.js's own clamped look cone (yawRange/
        // pitchMin/pitchMax) — those only take effect in any mode OTHER than
        // 'frozen'. 'seated' gives the intended result: no walking, but a
        // clamped look around the cabin. Deliberate deviation from the
        // brief's literal "frozen" wording — see the final report.
        player.mode = 'seated';
        player.position.set(car.anchors.playerSeat.x, car.anchors.playerSeat.y, car.anchors.playerSeat.z);
        player.yaw = car.anchors.playerYaw;
        player.yawCenter = car.anchors.playerYaw;
        player.yawRange = car.anchors.yawRange;
        player.pitchMin = car.anchors.pitchMin;
        player.pitchMax = car.anchors.pitchMax;
        player.pitch = 0;
        player.velocity.set(0, 0, 0);
        dialogue.play(SEQUENCES.carRide, { onDone: () => fsm.go(S.ARRIVE_HALLWAY) });
      },
    },

    [S.ARRIVE_HALLWAY]: {
      enter() {
        car.root.visible = false;
        apartment.root.visible = true;
        player.mode = 'walk';
        player.eyeHeight = 1.66;
        player.targetEye = 1.66;
        player.pitchMin = -Math.PI / 2 + 0.05;
        player.pitchMax = Math.PI / 2 - 0.05;
        player.yawCenter = null;
        player.position.set(ANCHORS.hallwaySpawn.x, 1.66, ANCHORS.hallwaySpawn.z);
        player.yaw = ANCHORS.hallwaySpawn.yaw;
        player.pitch = 0;
        player.velocity.set(0, 0, 0);
        setObjective(OBJECTIVES.ARRIVE_HALLWAY);
        // The owner's note: "Ape is not in the hallway - he should be in the
        // hallway with you when you spawn in." He now BUILDS in the corridor
        // (cast.js's APE_SPOTS.hallway) rather than inside the flat, so this
        // only has to make sure a car ride replayed from the menu, or any
        // other route into this beat, puts him back on that mark — and give
        // him something to say on the walk down.
        cast.ape.snapTo('hallway');
        dialogue.play(SEQUENCES.hallwayArrival);
      },
    },

    [S.KNOCK]: {
      enter() {
        setObjective(OBJECTIVES.KNOCK);
        audio.play('door.knob', { volume: 0.7 });
        // He walks up to 2E and knocks on it, because he is the one doing the
        // talking through it.
        cast.ape.moveTo('door');
        dialogue.play(SEQUENCES.arrival, { onDone: () => fsm.go(S.ENTER_APARTMENT) });
        // The door visibly opens partway during/after the knock.
        after(0.5, () => {
          audio.play('door.creak', { volume: 0.5 });
          swingDoor(apartment.doors.frontDoor, 0, apartment.doors.frontDoor.openRotationY, 0.8);
          setDoorColliderOpen(apartment.doors.frontDoor.collider, true);
        });
      },
    },

    [S.ENTER_APARTMENT]: {
      enter() {
        setObjective(OBJECTIVES.ENTER_APARTMENT);
        stallTimer = 0;
        stallWarned = false;
      },
      update(dt) {
        stallTimer += dt;
        if (!stallWarned && stallTimer > 8) {
          stallWarned = true;
          dialogue.interject(SEQUENCES.doorStall);
        }
      },
    },

    [S.ESTABLISH_CONTROL]: {
      enter() {
        setObjective(OBJECTIVES.ESTABLISH_CONTROL);
        // In from the corridor with the player, and standing where he can see
        // all three of them while Tony searches.
        cast.ape.moveTo('start');
        dialogue.play(SEQUENCES.establishControl);
        apartment.props.caseOcclusion.visible = true;
      },
      update() {
        updateAmbientControl();
      },
    },

    [S.CASE_REVEAL]: {
      enter() {
        setObjective(OBJECTIVES.CASE_REVEAL);
        apartment.props.caseOcclusion.visible = false;
        dialogue.play(SEQUENCES.caseFound, {
          onDone: () => {
            apartment.props.case.open();
            after(1.2, () => {
              dialogue.play(SEQUENCES.caseConfirmed, {
                onDone: () => {
                  // Ape has looked, Winston has nodded, and the lid comes
                  // down. It is Lou's case, it is going back to Lou, and it
                  // is shut from here to the end of the mission — including
                  // in Tony's hand on the way out. The one beat that shows
                  // the inside is the beat that confirms the contents; it is
                  // not a light source for the next ten minutes.
                  apartment.props.case.close();
                  audio.play('heist.shubes_case', { volume: 0.5 });
                  fsm.go(S.COUCH_SHOOTING);
                },
              });
            });
          },
        });
      },
    },

    [S.COUCH_SHOOTING]: {
      enter() {
        setObjective(OBJECTIVES.COUCH_SHOOTING);
        couchFireHandled = false;
        // "This is the part where we make sure everybody remembers this
        // conversation." This is where Ape finally says when — so this is
        // where BOTH guns come out, and they stay out through the ambush.
        drawWeapon();
        cast.ape.drawWeapon();
        /* Ape names the man, then the screen says which button. "It's unclear
         * who to shoot" was the complaint; the answer is the HUD clarifying
         * him, not replacing him. */
        sayThenInstruct(SEQUENCES.couchOrder, INSTRUCTIONS.COUCH_SHOOTING);
      },
      update() {
        // No countdown, no QTE: the camera and controls stay fully live, and
        // the player fires (or doesn't) on their own left-click, whenever.
        // What has changed is that the click has to land on Deke.
        if (firePressed && !couchFireHandled) {
          firePressed = false;
          if (!resolvePlayerShot()) return;
          couchFireHandled = true;
          cast.deke.kill();
          setInstruction('');
          dialogue.play(SEQUENCES.couchAftermath, { onDone: () => fsm.go(S.LOU_QUESTION) });
        }
      },
      exit() {
        setInstruction('');
      },
    },

    [S.LOU_QUESTION]: {
      enter() {
        setObjective(OBJECTIVES.LOU_QUESTION);
        cast.ape.moveTo('chair');
        dialogue.play(SEQUENCES.louQuestionSetup, {
          onDone: () => {
            dialogue.presentChoice(CHOICES.louQuestion, {
              onResolved: (outcome) => {
                if (outcome === 'lighting') flags.irritatedApe = true;
                const reaction = SEQUENCES.louQuestionReaction[outcome]
                  || SEQUENCES.louQuestionReaction.silent;
                dialogue.play(reaction, { onDone: () => fsm.go(S.SQUATCH_PRAYER) });
              },
            });
          },
        });
      },
    },

    [S.SQUATCH_PRAYER]: {
      enter() {
        setObjective(OBJECTIVES.SQUATCH_PRAYER);
        holdE = 0;
        dialogue.play(SEQUENCES.squatchPrayerIntro, {
          onDone: () => {
            dialogue.play(SEQUENCES.squatchPrayer, {
              onDone: () => {
                dialogue.presentChoice(CHOICES.prayerFinish, {
                  onResolved: () => {
                    // The prayer no longer kills him on its own. The owner's
                    // note: "There should also be a prompt to shoot the guy in
                    // the chair with Ape." That is its own beat.
                    dialogue.play(SEQUENCES.squatchPrayerFinish, {
                      onDone: () => fsm.go(S.CHAIR_SHOOTING),
                    });
                  },
                });
              },
            });
          },
        });
      },
    },

    /**
     * The man in the chair — the beat the prayer used to skip straight past.
     *
     * Both guns are up and both men fire. If the player pulls first, Ape's
     * round follows a fifth of a second later and Chester carries two wounds;
     * if the player will not do it, Ape does it alone after twelve seconds and
     * says so, because a mission that stalls forever on a prompt is worse than
     * one that judges you for missing it.
     */
    [S.CHAIR_SHOOTING]: {
      enter() {
        setObjective(OBJECTIVES.CHAIR_SHOOTING);
        this.fired = false;
        this.t = 0;
        this.nudged = false;
        cast.ape.moveTo('chair');
        cast.ape.aimWeapon(true);
        sayThenInstruct(SEQUENCES.chairOrder, INSTRUCTIONS.CHAIR_SHOOTING);
      },
      update(dt) {
        if (this.fired) return;
        this.t += dt;
        if (!this.nudged && this.t > 6.5) {
          this.nudged = true;
          dialogue.interject(SEQUENCES.chairStall);
        }
        if (firePressed) {
          firePressed = false;
          if (!resolvePlayerShot()) return;
          this.fired = true;
          setInstruction('');
          // Tony's round lands; Ape's follows, because he said together.
          after(0.2, () => {
            apeShootsAt(cast.chester);
            cast.chester.kill();
            after(0.5, () => cast.ape.aimWeapon(false));
            dialogue.play(SEQUENCES.chairTogether, { onDone: () => fsm.go(S.BATHROOM_AMBUSH) });
          });
          return;
        }
        if (this.t >= 12) {
          this.fired = true;
          flags.apeFinishedChester = true;
          setInstruction('');
          apeShootsAt(cast.chester);
          cast.chester.kill();
          after(0.5, () => cast.ape.aimWeapon(false));
          dialogue.play(SEQUENCES.chairApeAlone, { onDone: () => fsm.go(S.BATHROOM_AMBUSH) });
        }
      },
      exit() {
        setInstruction('');
      },
    },

    [S.BATHROOM_AMBUSH]: {
      enter() {
        setObjective(OBJECTIVES.BATHROOM_AMBUSH);
        setInstruction(INSTRUCTIONS.BATHROOM_AMBUSH, { urgent: true });
        ui.objective.classList.add('urgent');
        // The door has to come off the latch or he walks through it: the
        // bathroom leaf is real geometry sitting exactly where he appears.
        // Fast, because he kicked it.
        audio.play('door.creak', { volume: 0.7 });
        swingDoor(
          apartment.doors.bathroomDoor,
          apartment.doors.bathroomDoor.group.rotation.y,
          apartment.doors.bathroomDoor.openRotationY,
          0.22,
        );
        cast.pruitt.reveal();
        dialogue.interject(SEQUENCES.bathroomWarning);
        const cluesCount = Object.values(cluesFound).filter(Boolean).length;
        reactionWindow.start({ readinessBonus: cluesCount >= 2 });
      },
      update(dt) {
        const event = reactionWindow.update(dt);
        if (event?.event === 'expired') {
          // Pruitt gets the shot he came out of the bathroom to take.
          const gun = cast.pruitt.weapon;
          if (gun) {
            muzzleWorld(gun, _muzzle);
            impacts.muzzle(_muzzle);
          }
          audio.play('gun.shot', { volume: 0.95 });
          cast.ape.kill();
          fsm.go(S.FAILED);
          return;
        }
        // The window is still open, so the player can keep firing — but only a
        // round that actually finds Pruitt closes it. Shooting the wall, or
        // Winston, or Ape, burns the time it took to do it.
        if (firePressed) {
          firePressed = false;
          if (!resolvePlayerShot()) return;
          const result = reactionWindow.resolve('player_shot');
          if (result.ok) {
            cast.pruitt.kill();
            setInstruction('');
            const seq = reactionWindow.readinessBonus
              ? SEQUENCES.bathroomFastWithClues
              : SEQUENCES.bathroomFast;
            dialogue.play(seq, { onDone: () => fsm.go(S.AFTERMATH) });
          }
        }
      },
      exit() {
        ui.objective.classList.remove('urgent');
        setInstruction('');
      },
    },

    [S.AFTERMATH]: {
      enter() {
        setObjective(OBJECTIVES.AFTERMATH);
        dialogue.play(SEQUENCES.aftermathIntro, {
          onDone: () => {
            dialogue.presentChoice(CHOICES.aftermath, {
              onResolved: (outcome) => {
                // Sparing him resolves here, the way it always did. Killing
                // him no longer resolves on the keypress at all — the owner's
                // note is that if you are not going to spare the last man you
                // should have to do it, and see it.
                if (outcome !== 'spare') { fsm.go(S.EXECUTE_WINSTON); return; }
                dialogue.play(SEQUENCES.aftermathSpare, {
                  onDone: () => {
                    dialogue.play(SEQUENCES.aftermathExit, { onDone: () => fsm.go(S.PICK_UP_CASE) });
                  },
                });
              },
            });
          },
        });
      },
    },

    /**
     * The last man, if the player will not leave him one. Same contract as the
     * chair: a named target, an on-screen instruction, a shot that has to land
     * on him, blood where it lands — and Ape finishing it if the player asks
     * for it and then will not do it.
     */
    [S.EXECUTE_WINSTON]: {
      enter() {
        setObjective(OBJECTIVES.EXECUTE_WINSTON);
        this.fired = false;
        this.t = 0;
        this.begged = false;
        drawWeapon();
        cast.ape.drawWeapon();
        sayThenInstruct(SEQUENCES.aftermathKillOrder, INSTRUCTIONS.EXECUTE_WINSTON);
      },
      update(dt) {
        if (this.fired) return;
        this.t += dt;
        if (!this.begged && this.t > 5) {
          this.begged = true;
          dialogue.interject(SEQUENCES.aftermathKillStall);
        }
        const finish = (seq) => {
          this.fired = true;
          setInstruction('');
          dialogue.play(seq, {
            onDone: () => {
              dialogue.play(SEQUENCES.aftermathExit, { onDone: () => fsm.go(S.PICK_UP_CASE) });
            },
          });
        };
        if (firePressed) {
          firePressed = false;
          if (!resolvePlayerShot()) return;
          cast.winston.kill();
          finish(SEQUENCES.aftermathKill);
          return;
        }
        if (this.t >= 14) {
          flags.apeFinishedWinston = true;
          apeShootsAt(cast.winston);
          cast.winston.kill();
          after(0.5, () => cast.ape.aimWeapon(false));
          finish(SEQUENCES.aftermathKillApeAlone);
        }
      },
      exit() {
        setInstruction('');
      },
    },

    [S.PICK_UP_CASE]: {
      enter() {
        setObjective(OBJECTIVES.PICK_UP_CASE);
        // The shooting is over; you cannot carry a case and hold a gun on a
        // room at the same time. It goes away, and the bar still shows it.
        holsterWeapon();
        cast.ape.holsterWeapon();
      },
    },

    [S.EXIT]: {
      enter() {
        setObjective(OBJECTIVES.EXIT);
        audio.play('door.creak', { volume: 0.5 });
        swingDoor(
          apartment.doors.frontDoor,
          apartment.doors.frontDoor.group.rotation.y,
          apartment.doors.frontDoor.openRotationY,
          0.6,
        );
        setDoorColliderOpen(apartment.doors.frontDoor.collider, true);
      },
      update() {
        if (player.position.x < 1.4) fsm.go(S.SCENE_COMPLETE);
      },
    },

    [S.SCENE_COMPLETE]: {
      enter() {
        setObjective('');
        setInstruction('');
        player.mode = 'frozen';
        after(1.0, () => {
          running = false;
          document.exitPointerLock?.();
          ui.hud.classList.remove('visible');
          sceneInventory.hide();
          ui.sceneCompleteOverlay.classList.remove('hidden');
        });
      },
    },

    [S.FAILED]: {
      enter() {
        ui.deathTitle.textContent = 'TOO SLOW';
        setInstruction('');
        dialogue.play(SEQUENCES.bathroomFailed);
        player.mode = 'frozen';
        after(1.2, () => {
          running = false;
          document.exitPointerLock?.();
          ui.hud.classList.remove('visible');
          sceneInventory.hide();
          ui.deathOverlay.classList.remove('hidden');
        });
      },
    },
  };
}

const fsm = new SilverCaseStateMachine(buildStates());

// ---------------------------------------------------------------- input

function lockPointer() {
  const p = renderer.domElement.requestPointerLock();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

const DIGIT_KEY = {
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
};

window.addEventListener('keydown', (e) => {
  player.setKey(e.code, true);
  if (e.code === 'KeyE') interactions.press();
  if (DIGIT_KEY[e.code] && dialogue.choice) dialogue.chooseKey(DIGIT_KEY[e.code]);
  if (e.code === 'Escape') pauseMenu.toggle();
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => {
  player.setKey(e.code, false);
  if (e.code === 'KeyE') interactions.release();
});
window.addEventListener('blur', () => {
  player.clearKeys();
});

document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || paused || !running) return;
  player.handleMouseMove(e.movementX, e.movementY);
});

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!running) return;
  if (!pointerLocked) { lockPointer(); return; }
  if (e.button === 0) firePressed = true;
  if (e.button === 2 && fsm.is(S.ESTABLISH_CONTROL, S.LOU_QUESTION, S.SQUATCH_PRAYER)) drawPressed = true;
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  player.enabled = pointerLocked;
  if (!pointerLocked && running && !paused) pauseMenu.pause();
});

let muted = false;
function toggleMute() {
  muted = !muted;
  audio.setMasterVolume(muted ? 0 : 0.9);
}

ui.beginBtn.addEventListener('click', beginScene);
ui.retryBtn.addEventListener('click', () => {
  ui.deathOverlay.classList.add('hidden');
  restoreCheckpoint();
});
ui.playAgainBtn.addEventListener('click', () => {
  window.location.reload();
});

function beginScene() {
  audio.init();
  /* PRELOAD, which this scene never did.
   *
   * `audio.init()` builds the graph; it does not fetch a single sample. With
   * no `loadManifest` the engine's buffer table stayed empty for the whole
   * mission, so every `audio.play()` fell through to the procedural synth --
   * which is why the guns and the doors sounded right and nobody noticed that
   * SIXTY RECORDED VOICE TAKES could never be reached. Silence with a
   * subtitle over a folder full of finished audio.
   *
   * Named rather than wholesale: the shared manifest is thousands of cues and
   * this mission needs its own words plus the handful of effects it fires --
   * see ./audio.js's `isSilverCasePreloadCue`/`silverCaseAudioLoadOptions` for
   * the named selector `tools/verify-silvercase.mjs` checks residency against. */
  audio.loadManifest(silverCaseAudioLoadOptions()).then((result) => {
    // Diagnostics only, same shape every other scoped scene exposes
    // (src/nowake/main.js, src/bing/main.js): what the full shared manifest
    // holds versus what this mission actually asked for and got.
    audio.preloadStats = { manifestTotal: audio.manifest.sfx.length, selected: result.total };
  }).catch(() => {});
  running = true;
  sceneInventory.show();
  syncInventory();
  if (previewCheckpoint) jumpToPreviewCheckpoint(previewCheckpoint);
  else fsm.go(S.CAR_RIDE);
  lockPointer();
}

// ---------------------------------------------------------------- loop

function updateGame(dt) {
  player.update(dt);
  interactions.setPaused(Boolean(dialogue.choice) || fsm.is(S.FAILED, S.SCENE_COMPLETE));
  interactions.update(dt);
  dialogue.update(dt);
  apartment.update(dt);
  car.update(dt);
  // The cast's figures track the player's own eye, which is what makes a room
  // full of people being held at gunpoint read as a room full of people.
  cast.update(dt, player.position);
  carriedCase.update(dt);
  viewModel.update(dt);
  impacts.update(dt);
  updateTweens(dt);
  checkEarlyDraw();
  updateChoiceHold(dt);
  updateAimCallout();
  if (!fsm.is(S.COUCH_SHOOTING, S.CHAIR_SHOOTING, S.BATHROOM_AMBUSH, S.EXECUTE_WINSTON)) {
    firePressed = false;
  }
  fsm.update(dt);
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (running && !paused) updateGame(dt);
  postfx.render();
  postfx.sample(dt);
}

fsm.start(S.MENU);
frame();

// ---------------------------------------------------------------- debug handle
//
// The pattern every verify-*.mjs script in this repo drives its scene
// headlessly through: fsm/go()/tick()/state(), plus enough extra references
// for a verify script to introspect and drive individual beats without
// simulating real mouse/keyboard events.

window.silvercase = {
  fsm,
  go: (name) => fsm.go(name),
  tick(secs = 1) {
    const steps = 60;
    const dt = secs / steps;
    for (let i = 0; i < steps; i++) updateGame(dt);
  },
  state: () => ({
    beat: fsm.name,
    mission: {
      cluesFound: { ...cluesFound },
      flags: { ...flags },
      earlyDrawCount,
      wrongTargetShots,
      missedShots,
      /** What the last trigger pull actually found — the aim/hit record. */
      lastShot: lastShot ? { ...lastShot } : null,
    },
    /** What the crosshair is on right now, and what the beat asked for. */
    aim: {
      ordered: orderedTarget()?.name ?? null,
      at: shots.trace()?.actor?.name ?? null,
      onTarget: aimOnTarget,
      instruction: ui.instruction.textContent || '',
      instructionShown: ui.instruction.classList.contains('show'),
      targetTagShown: ui.targetTag.classList.contains('show'),
    },
    /** Decals actually placed, by pool — the "blood and impact" contract. */
    marks: {
      wounds: impacts.wounds.pool.filter((m) => m.visible).length,
      spatter: impacts.spatter.pool.filter((m) => m.visible).length,
      holes: impacts.holes.pool.filter((m) => m.visible).length,
      onBodies: Object.fromEntries(
        cast.all.map((actor) => [actor.name.toLowerCase(), impacts.marksOn(actor)]),
      ),
    },
    actors: Object.fromEntries(cast.all.map((actor) => [
      actor.name.toLowerCase(),
      {
        alive: actor.alive,
        hp: actor.hp,
        revealed: actor.group.visible,
        /** Real metres, as authored — the whole point of the shared builder. */
        height: actor.npc.parts.heightScale * 1.78,
        at: {
          x: +actor.group.position.x.toFixed(3),
          y: +actor.group.position.y.toFixed(3),
          z: +actor.group.position.z.toFixed(3),
        },
        seated: actor.seated,
        armed: Boolean(actor.weapon),
      },
    ])),
    mouths: mouthState(),
    voice: voiceState(),
    /** Ape's cross-scene identity, exactly as the campaign registry has it. */
    ape: {
      characterId: cast.ape.npc.characterId,
      family: cast.ape.group.userData.npc?.family === true,
      face: SILVERCASE_APE_PRESENTATION.face,
      model: { ...SILVERCASE_APE_PRESENTATION.model },
      /** His own gun: mounted from the start, shown when he draws it. */
      armed: Boolean(cast.ape.weapon),
      gun: cast.ape.weapon?.name ?? null,
      gunInHand: Boolean(cast.ape.weapon)
        && cast.ape.weapon.parent === cast.ape.parts.foreR,
      weaponDrawn: cast.ape.weaponDrawn === true,
      weaponVisible: cast.ape.weapon?.visible === true,
      /** Locked false by Actor's own setter: armed is not hostile. */
      hostile: cast.ape.hostile,
      at: {
        x: +cast.ape.group.position.x.toFixed(3),
        z: +cast.ape.group.position.z.toFixed(3),
      },
    },
    case: {
      openness: +apartment.props.case.openness().toFixed(3),
      shut: apartment.props.case.isShut(),
      inWorld: apartment.props.case.group.visible,
      carried: carriedCase.group.visible && carriedCase.isShut(),
    },
    weapon: { drawn: viewModel.drawn, visible: viewModel.group.visible },
    inventory: { ...loadout, slots: JSON.parse(inventorySignature || '[]') },
    reactionWindow: reactionWindow.snapshot(),
  }),
  begin: () => beginScene(),
  retry: () => { ui.deathOverlay.classList.add('hidden'); restoreCheckpoint(); },
  pressFire: () => { firePressed = true; },
  pressDraw: () => { drawPressed = true; },
  /**
   * Point the camera at an actor's chest, the way a player would before
   * pulling the trigger. Returns what the crosshair then resolves to, so a
   * verify script can prove the aim and the hit are the same thing rather
   * than assuming it.
   */
  aimAt(name) {
    const actor = cast[name];
    if (!actor) return null;
    const at = new THREE.Vector3();
    actor.parts.head.getWorldPosition(at);
    at.y -= 0.28;
    const dx = at.x - camera.position.x;
    const dy = at.y - camera.position.y;
    const dz = at.z - camera.position.z;
    // Player.js's camera convention: forward = (-sin(yaw), 0, -cos(yaw)).
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    player.update(0);
    camera.updateMatrixWorld(true);
    const hit = shots.trace();
    return {
      aimedAt: name,
      resolvesTo: hit?.actor?.name?.toLowerCase() ?? null,
      distance: hit ? +hit.distance.toFixed(3) : null,
    };
  },
  /** Aim at `name` and pull the trigger in the same call. */
  shootAt(name) {
    const aim = window.silvercase.aimAt(name);
    firePressed = true;
    return aim;
  },
  shots,
  impacts,
  /** Cheap enough to poll every frame — see mouthState(). */
  mouths: () => mouthState(),
  voice: () => voiceState(),
  chooseKey: (key) => dialogue.chooseKey(key),
  dialogue,
  cast,
  apartment,
  car,
  player,
  interactions,
  audio,
  reactionWindow,
  viewModel,
  carriedCase,
  sceneInventory,
  camera,
  scene,
  renderer,
  postfx,
};
