import * as THREE from 'three';
import { buildApartmentScene, ANCHORS, BATHROOM_DOOR } from './scenes/ApartmentScene.js';
import { buildCarInterior } from './scenes/CarInterior.js';
import { populateCast } from './cast/cast.js';
import { SILVERCASE_APE_PRESENTATION } from './cast/ape.js';
import { makeRevolverViewModel } from './props/weapon.js';
import { makeCase } from './props/case.js';
import { ReactionWindow } from './combat/ReactionWindow.js';
import { DialogueController } from './dialogue/DialogueController.js';
import { SEQUENCES, CHOICES, OBJECTIVES } from './dialogue/script.js';
import { SilverCaseStateMachine, S, CHECKPOINT } from './state/SilverCaseStateMachine.js';
import { Player } from '../core/player.js';
import { InteractionSystem } from '../core/interaction.js';
import { AudioEngine } from '../core/audio.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  objective: $('objective'),
  objectiveText: $('objectiveText'),
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
const reactionWindow = new ReactionWindow({ windowSeconds: 2.2 });

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

const dialogue = new DialogueController({
  // No playCue hook: no vo.silvercase.* cues have been recorded yet, and per
  // the game's own established convention a missing cue is silence plus
  // subtitle, never synthesized. Every line here is text-only.
  onLine(line) {
    ui.subsWho.textContent = line.speakerName || '';
    ui.subsLine.textContent = line.text;
    ui.subs.classList.add('show');
  },
  onLineEnd() {
    ui.subs.classList.remove('show');
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

const pauseMenu = createPauseMenu({
  title: 'The Silver Case',
  canPause: () => running,
  getObjective: () => ui.objectiveText.textContent?.trim() || 'Follow Ape.',
  instructions: [
    'W A S D / arrows — move. Mouse — look.',
    'E — interact.',
    'Left click — fire, when it matters.',
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
const flags = { irritatedApe: false };

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

/** Somewhere open on the apartment floor, facing Chester's chair — clear of
 * the couch/coffee-table/chair colliders. Not any single authored anchor,
 * since none of ApartmentScene's anchors are "the middle of the room". */
const RETRY_SPOT = { x: 8.6, z: 0.6 };

function restoreCheckpoint() {
  tweens.length = 0;
  reactionWindow.reset();
  // Actor.revive() puts a fallen figure back on its feet (or back in its
  // chair) at its spawn pose, and cast.js's pruitt.hide() tucks the bathroom
  // man back into the dark. Deke stays dead: the checkpoint is the start of
  // the prayer, which is well after the couch, and the whole point of the
  // owner's note is that his body does not go anywhere.
  cast.ape.revive();
  cast.chester.revive();
  cast.pruitt.hide();
  // …and the door he came through goes back on the latch with him.
  apartment.doors.bathroomDoor.group.rotation.y = 0;
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
      },
    },

    [S.KNOCK]: {
      enter() {
        setObjective(OBJECTIVES.KNOCK);
        audio.play('door.knob', { volume: 0.7 });
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
        // where the gun comes out, and it stays out through the ambush.
        drawWeapon();
        dialogue.play(SEQUENCES.couchOrder);
      },
      update() {
        // No countdown, no QTE: the camera and controls stay fully live, and
        // the player fires (or doesn't) on their own left-click, whenever.
        if (firePressed && !couchFireHandled) {
          firePressed = false;
          couchFireHandled = true;
          cast.deke.kill();
          audio.play('gun.shot', { volume: 0.9 });
          muzzleFlash();
          viewModel.fire();
          dialogue.play(SEQUENCES.couchAftermath, { onDone: () => fsm.go(S.LOU_QUESTION) });
        }
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
                    dialogue.play(SEQUENCES.squatchPrayerFinish, {
                      onDone: () => {
                        cast.chester.kill();
                        fsm.go(S.BATHROOM_AMBUSH);
                      },
                    });
                  },
                });
              },
            });
          },
        });
      },
    },

    [S.BATHROOM_AMBUSH]: {
      enter() {
        setObjective(OBJECTIVES.BATHROOM_AMBUSH);
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
        const cluesCount = Object.values(cluesFound).filter(Boolean).length;
        reactionWindow.start({ readinessBonus: cluesCount >= 2 });
      },
      update(dt) {
        const event = reactionWindow.update(dt);
        if (event?.event === 'expired') {
          cast.ape.kill();
          fsm.go(S.FAILED);
          return;
        }
        if (firePressed) {
          firePressed = false;
          const result = reactionWindow.resolve('player_shot');
          if (result.ok) {
            cast.pruitt.kill();
            audio.play('gun.shot', { volume: 0.95 });
            muzzleFlash();
            viewModel.fire();
            const seq = reactionWindow.readinessBonus
              ? SEQUENCES.bathroomFastWithClues
              : SEQUENCES.bathroomFast;
            dialogue.play(seq, { onDone: () => fsm.go(S.AFTERMATH) });
          }
        }
      },
      exit() {
        ui.objective.classList.remove('urgent');
      },
    },

    [S.AFTERMATH]: {
      enter() {
        setObjective(OBJECTIVES.AFTERMATH);
        dialogue.play(SEQUENCES.aftermathIntro, {
          onDone: () => {
            dialogue.presentChoice(CHOICES.aftermath, {
              onResolved: (outcome) => {
                if (outcome !== 'spare') cast.winston.kill();
                const reaction = outcome === 'spare' ? SEQUENCES.aftermathSpare : SEQUENCES.aftermathKill;
                dialogue.play(reaction, {
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

    [S.PICK_UP_CASE]: {
      enter() {
        setObjective(OBJECTIVES.PICK_UP_CASE);
        // The shooting is over; you cannot carry a case and hold a gun on a
        // room at the same time. It goes away, and the bar still shows it.
        holsterWeapon();
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
  running = true;
  sceneInventory.show();
  syncInventory();
  fsm.go(S.CAR_RIDE);
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
  updateTweens(dt);
  checkEarlyDraw();
  updateChoiceHold(dt);
  if (!fsm.is(S.COUCH_SHOOTING, S.BATHROOM_AMBUSH)) firePressed = false;
  fsm.update(dt);
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (running && !paused) updateGame(dt);
  renderer.render(scene, camera);
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
    /** Ape's cross-scene identity, exactly as the campaign registry has it. */
    ape: {
      characterId: cast.ape.npc.characterId,
      family: cast.ape.group.userData.npc?.family === true,
      face: SILVERCASE_APE_PRESENTATION.face,
      model: { ...SILVERCASE_APE_PRESENTATION.model },
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
};
