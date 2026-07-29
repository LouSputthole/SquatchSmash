import * as THREE from 'three';
import { buildSquatchfatherScene, POS } from './scenes/SquatchfatherScene.js';
import { SquatchfatherStateMachine, S, CHECKPOINT } from './state/SquatchfatherStateMachine.js';
import { DialogueController } from './dialogue/DialogueController.js';
import { InteractionSystem } from './interaction/InteractionSystem.js';
import { ChairInteraction } from './interaction/ChairInteraction.js';
import { ToiletWeaponInteraction } from './interaction/ToiletWeaponInteraction.js';
import { WeaponDropInteraction } from './interaction/WeaponDropInteraction.js';
import { CameraDirector, FOV } from './cinematic/CameraDirector.js';
import { SeatedCameraController, seatedLookTargets } from './cinematic/SeatedCameraController.js';
import { SceneTimeline } from './cinematic/SceneTimeline.js';
import { ProspectController, SPEED } from './characters/ProspectController.js';
import { SalController } from './characters/SalController.js';
import { McClawskyController } from './characters/McClawskyController.js';
import { RestaurantAmbience } from './audio/RestaurantAmbience.js';
import { TrainSequence } from './audio/TrainSequence.js';
import { gunshot } from './audio/GunshotAudio.js';
import * as Foley from './audio/Foley.js';
import * as audio from './audio/core.js';
import { TrainVibration } from './effects/TrainVibration.js';
import { EarRingingEffect } from './effects/EarRingingEffect.js';
import { MirrorReflection } from './effects/MirrorReflection.js';

// ---------------------------------------------------------------- boot

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV.base, window.innerWidth / window.innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'),
  fade: $('fade'),
  vig: $('vig'),
  ringFlash: $('ringFlash'),
  letterbox: $('letterbox'),
  objective: $('objective'),
  objectiveText: $('objective').querySelector('.text'),
  subs: $('subs'),
  subsWho: $('subs').querySelector('.who'),
  subsLine: $('subs').querySelector('.line'),
  prompt: $('prompt'),
  promptKey: $('prompt').querySelector('.key'),
  promptText: $('prompt').querySelector('.txt'),
  holdBar: $('holdBar'),
  holdFill: $('holdFill'),
  choice: $('choice'),
  drawPrompt: $('drawPrompt'),
  reticle: $('reticle'),
  hint: $('hint'),
  menu: $('menu'),
  pause: $('pause'),
  pauseState: $('pauseState'),
  death: $('death'),
  endCard: $('endCard'),
};

// ---------------------------------------------------------------- systems

const sceneState = buildSquatchfatherScene(scene, renderer);
const prospect = new ProspectController(scene, camera, sceneState.colliders);
const sal = new SalController(scene);
const mcclawsky = new McClawskyController(scene);

const director = new CameraDirector(camera, ui);
const seated = new SeatedCameraController(director);
seated.setTargets(seatedLookTargets(sal, mcclawsky));

const timeline = new SceneTimeline();
const ambience = new RestaurantAmbience();
const train = new TrainSequence();
const vibration = new TrainVibration(sceneState, director);
const ringing = new EarRingingEffect(ui);
const mirror = new MirrorReflection(scene, sceneState.props.mirror);

const interactions = new InteractionSystem(camera, sceneState.interactables, ui);

let dialogue = null;
let chairInteraction = null;
let toiletInteraction = null;
let dropInteraction = null;
let fsm = null;

prospect.stepCb = () => {
  const inBath = prospect.pos.z > 15;
  const outside = prospect.pos.z < 0;
  Foley.footstep(inBath ? 'tile' : outside ? 'street' : 'wood', outside ? 0.9 : 1);
};

// ---------------------------------------------------------------- input

const keys = { forward: false, back: false, left: false, right: false, e: false };
let ePressed = false;
let firePressed = false;
let paused = false;
let running = false;
let pointerLocked = false;

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyE') { if (!keys.e) ePressed = true; keys.e = true; }
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') { audio.setMuted(!audio.isMuted()); }
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false;
  if (e.code === 'KeyE') keys.e = false;
});
window.addEventListener('blur', () => {
  for (const k of Object.keys(keys)) keys[k] = false;
});

const SENS = 0.0022;
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || paused || !running) return;
  const dx = e.movementX * SENS;
  const dy = e.movementY * SENS;
  if (Math.abs(dx) + Math.abs(dy) > 0.001) seated.playerMoved();
  prospect.look(dx, dy, seated.clamp);
});

// Chrome rejects the request during its post-Escape cooldown and returns a
// promise; swallow it so a denied lock isn't reported as a page error. The
// player can always click the canvas to try again.
function lockPointer() {
  const p = renderer.domElement.requestPointerLock();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!running) return;
  if (!pointerLocked) { lockPointer(); return; }
  if (e.button === 0) firePressed = true;
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && running && !paused) togglePause();
});

// ---------------------------------------------------------------- ui helpers

function setObjective(text) {
  if (!text) {
    ui.objective.classList.remove('show');
    return;
  }
  ui.objectiveText.textContent = text.toUpperCase();
  ui.objective.classList.add('show');
}

function showChoice(on) {
  ui.choice.classList.toggle('show', on);
}

function showDrawPrompt(mode) {
  ui.drawPrompt.classList.toggle('show', mode === 'soft');
  ui.drawPrompt.classList.toggle('urgent', mode === 'urgent');
}

function showReticle(on) {
  ui.reticle.classList.toggle('show', on);
}

function fadeOut(instant = false) {
  ui.fade.classList.toggle('instant', instant);
  ui.fade.classList.remove('clear');
}

function fadeIn(instant = false) {
  ui.fade.classList.toggle('instant', instant);
  requestAnimationFrame(() => ui.fade.classList.add('clear'));
}

// Small generic tween pump for doors, the waiter, and falling glassware.
const tweens = [];
function animateOver(dur, fn, onDone = null) {
  tweens.push({ t: 0, dur, fn, onDone });
}
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const p = Math.min(1, tw.t / tw.dur);
    tw.fn(p * p * (3 - 2 * p), p);
    if (p >= 1) {
      tweens.splice(i, 1);
      if (tw.onDone) tw.onDone();
    }
  }
}

function swingDoor(group, from, to, dur = 0.8) {
  animateOver(dur, (e) => { group.rotation.y = from + (to - from) * e; });
}

// ---------------------------------------------------------------- scene beats

let waiterBusy = false;

function waiterPours() {
  if (waiterBusy) return;
  waiterBusy = true;
  const w = sceneState.bystanders.waiter;
  const start = w.position.clone();
  const at = new THREE.Vector3(-1.75, 0, 6.5);
  animateOver(1.6, (e) => {
    w.position.lerpVectors(start, at, e);
    w.rotation.y = Math.PI + e * 1.5;
  }, () => {
    Foley.pour();
    animateOver(1.4, () => {}, () => {
      animateOver(1.8, (e) => {
        w.position.lerpVectors(at, start, e);
      }, () => { waiterBusy = false; });
    });
  });
}

// The rattle list is built during scene assembly; look entries up by the mesh
// rather than by position in it.
function glasswareFor(mesh) {
  return sceneState.glassware.find((g) => g.mesh === mesh);
}

function knockGlassOver(glassEntry) {
  const g = glassEntry.mesh;
  const from = g.position.clone();
  const to = new THREE.Vector3(from.x + 0.3, 0.79, from.z - 0.18);
  animateOver(0.5, (e, raw) => {
    g.position.lerpVectors(from, to, e);
    g.rotation.z = e * 1.6;
    if (raw > 0.55 && !g.userData.clinked) {
      g.userData.clinked = true;
      Foley.glassFall();
    }
  });
  glassEntry.base.copy(to);
}

// Everyone in the room hears two shots in a small space. Nobody moves to stop
// him: the waiter freezes, a diner gets down, the cook watches from the door.
function roomReacts() {
  const { diner1, diner2, cook } = sceneState.bystanders;
  animateOver(0.5, (e) => {
    diner1.position.y = -0.62 * e;
    diner1.rotation.x = -0.15 * e;
  });
  animateOver(0.6, (e) => {
    diner2.position.y = -0.5 * e;
    diner2.rotation.z = 0.2 * e;
  });
  animateOver(1.2, (e) => {
    cook.position.z = 11.6 - 0.55 * e;
    sceneState.doors.kitchenDoor.rotation.y = -0.7 * e;
  });
}

function resetRoomReactions() {
  const { diner1, diner2, cook } = sceneState.bystanders;
  diner1.position.y = 0; diner1.rotation.x = 0;
  diner2.position.y = 0; diner2.rotation.z = 0;
  cook.position.z = 11.6;
  sceneState.doors.kitchenDoor.rotation.y = 0;
}

// ---------------------------------------------------------------- states

let excuseRepeat = false;
let bathroomDoorOpen = true;

function fire() {
  gunshot();
  director.impulse(0.85);
  ringing.start(10);
}

function buildStates() {
  return {
    [S.START_EXTERIOR]: {
      enter() {
        prospect.teleport(POS.playerStart, -Math.PI / 2 - 0.3);
        prospect.canMove = true;
        prospect.canLook = true;
        prospect.speed = SPEED.normal;
        ambience.setOutside(1);
        ambience.setMuffle(0);
        director.letterbox(false);
        director.setFov(FOV.base);
        director.vignette(false);
        setObjective('Enter the restaurant');
        train.setIntensity(0.12);
        timeline.after(2.5, () => train.horn());
        timeline.after(6, () => train.setIntensity(0.05));
        ui.hint.classList.add('show');
        timeline.after(6, () => ui.hint.classList.remove('show'));
      },
      update() {
        if (prospect.distanceTo(POS.doorApproach) < 2.4) fsm.go(S.ENTER_RESTAURANT);
      },
    },

    [S.ENTER_RESTAURANT]: {
      enter() {
        Foley.doorOpen();
        swingDoor(sceneState.doors.frontDoor, 0, -2.0, 0.9);
        sceneState.doors.frontDoorBlock.on = false;
        mcclawsky.openDoor();
        dialogue.play('greeting');
        setObjective('Enter the restaurant');
      },
      update() {
        ambience.setOutside(Math.max(0, Math.min(1, 1 - prospect.pos.z / 3)));
        if (prospect.pos.z > 1.2) fsm.go(S.APPROACH_TABLE);
      },
    },

    [S.APPROACH_TABLE]: {
      enter() {
        mcclawsky.escortIn();
        setObjective('Sit down');
        interactions.allow('chair');
        this.doorShut = false;
        sal.lookAt(prospect.pos);
      },
      update() {
        ambience.setOutside(Math.max(0, 1 - prospect.pos.z / 3));
        sal.watch(new THREE.Vector3(prospect.pos.x, 1.4, prospect.pos.z));
        // The door only shuts once he's well clear of it — closing it on a
        // player who has wandered back onto the sidewalk would strand them
        // outside with the only way forward (the chair) locked in here.
        if (!this.doorShut && prospect.pos.z > 2.2) {
          this.doorShut = true;
          Foley.doorClose();
          swingDoor(sceneState.doors.frontDoor, -2.0, 0, 0.7);
          sceneState.doors.frontDoorBlock.on = true;
        }
      },
    },

    [S.SIT_DOWN]: {
      enter() {
        interactions.allow();
        setObjective('');
        waiterPours();
        sal.lookAt(prospect.eye);
        timeline.after(2.6, () => fsm.go(S.OPENING_DIALOGUE));
      },
    },

    [S.OPENING_DIALOGUE]: {
      enter() {
        setObjective('');
        this.business = 6;
        dialogue.play('opening', () => fsm.go(S.EXCUSE_TO_BATHROOM));
      },
      update(dt) {
        this.business -= dt;
        if (this.business <= 0) {
          this.business = 7 + Math.random() * 6;
          mcclawsky.ambientBusiness();
        }
      },
    },

    [S.EXCUSE_TO_BATHROOM]: {
      enter() {
        showChoice(true);
        setObjective('');
      },
      update() {
        if (!ePressed) return;
        ePressed = false;
        showChoice(false);
        if (excuseRepeat) {
          fsm.go(S.WALK_TO_BATHROOM);
        } else {
          excuseRepeat = true;
          Foley.cloth();
          dialogue.play('excuse', () => fsm.go(S.WALK_TO_BATHROOM));
        }
      },
      exit() {
        showChoice(false);
      },
    },

    [S.WALK_TO_BATHROOM]: {
      enter() {
        Foley.chairScrape();
        seated.exit();
        prospect.stand();
        prospect.canMove = true;
        prospect.speed = SPEED.normal;
        director.letterbox(false);
        setObjective('Go to the bathroom');
        this.warned = false;
      },
      update() {
        // Trying to walk out instead of down the hallway
        if (!this.warned && prospect.pos.z < 1.6 && prospect.autoTarget === null) {
          this.warned = true;
          dialogue.say('sitDown');
          prospect.canMove = false;
          prospect.walkTo(new THREE.Vector3(POS.prospectSeat.x + 0.5, 0, POS.prospectSeat.z - 0.3), () => {
            prospect.sit();
            seated.enter();
            director.letterbox(true);
            Foley.chairKnock();
            fsm.go(S.EXCUSE_TO_BATHROOM);
          });
        }
        if (prospect.pos.z > 15.4) fsm.go(S.SEARCH_TOILET);
      },
    },

    [S.SEARCH_TOILET]: {
      enter() {
        // The door closes behind him and the restaurant goes far away
        Foley.doorClose();
        swingDoor(sceneState.doors.bathDoor, -1.9, 0, 0.5);
        sceneState.doors.bathDoorBlock.on = true;
        bathroomDoorOpen = false;
        ambience.setMuffle(1);
        mirror.enabled = true;
        setObjective('Find the weapon');
        interactions.allow('toilet', 'sink', 'radiator', 'cabinet');
      },
    },

    [S.RETRIEVE_WEAPON]: {
      enter() {
        interactions.allow();
        setObjective('');
        toiletInteraction.retrieve();
      },
    },

    [S.RETURN_TO_TABLE]: {
      enter() {
        prospect.canMove = true;
        prospect.canLook = true;
        prospect.speed = SPEED.measured;
        director.setFov(FOV.tight);
        director.vignette(true);
        director.letterbox(false);
        setObjective('Return to the table');
        interactions.allow();
        train.setIntensity(0.3);
        vibration.set(0.12);
        this.prodded = 0;
        timeline.after(5, () => train.horn());
      },
      update(dt) {
        // He opens the door on his way out
        if (!bathroomDoorOpen && prospect.pos.z < 16.6 && prospect.distanceTo(POS.bathroomDoor) < 1.8) {
          bathroomDoorOpen = true;
          Foley.doorOpen();
          swingDoor(sceneState.doors.bathDoor, 0, -1.9, 0.7);
          sceneState.doors.bathDoorBlock.on = false;
        }
        if (prospect.pos.z < 14.6) {
          ambience.setMuffle(Math.max(0, (prospect.pos.z - 10.5) / 4.5));
          mirror.enabled = false;
        }
        // They watch him come back
        const at = new THREE.Vector3(prospect.pos.x, 1.4, prospect.pos.z);
        sal.watch(at);
        mcclawsky.lookAt(at);

        this.prodded += dt;
        if (this.prodded > 14 && !this.proddedOnce) {
          this.proddedOnce = true;
          dialogue.say('prodding');
        }

        if (prospect.distanceTo(POS.prospectSeat) < 1.3) {
          prospect.canMove = false;
          Foley.chairScrape();
          prospect.sit();
          seated.enter();
          director.letterbox(true);
          fsm.go(S.FINAL_DIALOGUE);
        }
      },
    },

    [S.FINAL_DIALOGUE]: {
      enter() {
        setObjective('');
        director.setFov(FOV.tight);
        dialogue.play('final', () => fsm.go(S.TRAIN_APPROACH));
        // The line comes in over the top of the conversation
        timeline.after(1.0, () => { train.setIntensity(0.5); vibration.set(0.35); });
        timeline.after(9.0, () => { train.setIntensity(0.72); vibration.set(0.6); });
        timeline.after(15.0, () => { train.setIntensity(0.9); vibration.set(0.85); });
      },
    },

    [S.TRAIN_APPROACH]: {
      enter() {
        train.setIntensity(1);
        vibration.set(1);
        director.setFov(FOV.pressure);
        setObjective('');
        this.t = 0;
        showDrawPrompt('soft');
      },
      update(dt) {
        this.t += dt;
        if (this.t > 2.4) showDrawPrompt('urgent');
        if (firePressed) {
          firePressed = false;
          fsm.go(S.DRAW_WEAPON);
        }
      },
      exit() {
        showDrawPrompt(null);
      },
    },

    [S.DRAW_WEAPON]: {
      enter() {
        prospect.drawWeapon();
        Foley.cloth();
        director.steerTo(sal.eyePoint, 0.45);
        showReticle(true);
        firePressed = false;
        timeline.after(0.42, () => fsm.go(S.SHOOT_SAL));
      },
    },

    [S.SHOOT_SAL]: {
      enter() {
        director.steerTo(sal.eyePoint, 0.5, 0.8);
        this.t = 0;
      },
      update(dt) {
        this.t += dt;
        // Aim assistance keeps the first shot centred on Sal
        if (this.t < 0.6) director.steerTo(sal.eyePoint, 0.1, 0.9);
        if (!firePressed) return;
        firePressed = false;
        fire();
        prospect.fireKick();
        sal.kill();
        knockGlassOver(glasswareFor(sceneState.props.salGlass));
        roomReacts();
        fsm.go(S.SHOOT_MCCLAWSKY);
      },
    },

    [S.SHOOT_MCCLAWSKY]: {
      enter() {
        director.steerTo(mcclawsky.eyePoint, 0.55, 0.85);
        mcclawsky.startDraw(1.7, () => fsm.go(S.FAILED));
      },
      update() {
        if (!firePressed) return;
        firePressed = false;
        fire();
        prospect.fireKick();
        mcclawsky.kill();
        Foley.chairKnock();
        fsm.go(S.DROP_WEAPON);
      },
    },

    [S.DROP_WEAPON]: {
      enter() {
        showReticle(false);
        setObjective('Drop the weapon');
        prospect.canMove = true;
        prospect.speed = SPEED.controlled;
        seated.exit();
        prospect.stand();
        prospect.pos.set(POS.prospectSeat.x + 0.55, 0, POS.prospectSeat.z + 0.15);
        director.setFov(FOV.tight);
        train.setIntensity(0.55);
        vibration.set(0.5);
        dropInteraction.prompt(true);
      },
      update(dt) {
        firePressed = false; // no more shots
        // He will not walk out with it in his hand
        const nearDoor = prospect.pos.z < 2.1;
        if (nearDoor) {
          prospect.canMove = false;
          dropInteraction.nag(dt);
          director.steerTo(new THREE.Vector3(prospect.pos.x + 0.3, 0.55, prospect.pos.z - 0.4), 0.3, 0.5);
        } else {
          prospect.canMove = true;
          dropInteraction.prompt(true);
        }
        if (ePressed) {
          ePressed = false;
          dropInteraction.drop();
        }
      },
      exit() {
        dropInteraction.prompt(false);
      },
    },

    [S.WALK_TO_EXIT]: {
      enter() {
        setObjective('Leave the restaurant');
        prospect.canMove = true;
        prospect.speed = SPEED.controlled;
        director.letterbox(true);
        director.setFov(FOV.tight);
        sceneState.doors.frontDoorBlock.on = false;
        Foley.doorOpen();
        swingDoor(sceneState.doors.frontDoor, 0, -2.0, 1.2);
        train.setIntensity(0.25);
        vibration.set(0.2);
      },
      update() {
        ambience.setOutside(Math.max(0, Math.min(1, 1 - prospect.pos.z / 2.5)));
        if (prospect.pos.z < -0.6) fsm.go(S.ENTER_CAR);
      },
    },

    [S.ENTER_CAR]: {
      enter() {
        setObjective('Get in the car');
        interactions.allow('car');
        sceneState.lights.carGlow.intensity = 1.2;
        train.setIntensity(0.08);
        vibration.set(0);
        director.setFov(FOV.base);
        director.vignette(false);
      },
    },

    [S.SCENE_COMPLETE]: {
      enter() {
        interactions.allow();
        setObjective('');
        prospect.canMove = false;
        prospect.canLook = false;
        fadeOut();
        timeline.after(1.8, () => {
          running = false;
          document.exitPointerLock();
          ui.hud.classList.remove('visible');
          ui.endCard.classList.remove('hidden');
        });
      },
    },

    [S.FAILED]: {
      enter() {
        gunshot();
        director.impulse(1);
        prospect.canMove = false;
        prospect.canLook = false;
        showReticle(false);
        fadeOut(true);
        ui.fade.classList.remove('clear');
        timeline.after(1.2, () => {
          running = false;
          document.exitPointerLock();
          ui.hud.classList.remove('visible');
          ui.death.classList.remove('hidden');
        });
      },
    },
  };
}

// ---------------------------------------------------------------- checkpoint

// A botched draw sends the player back to the walk from the hallway, not to
// the front door.
function restoreCheckpoint() {
  timeline.clear();
  tweens.length = 0;
  dialogue.stop();
  ringing.stop();
  sal.revive();
  mcclawsky.revive();
  resetRoomReactions();

  for (const g of sceneState.glassware) {
    g.mesh.position.copy(g.base);
    g.mesh.rotation.set(0, 0, 0);
    g.mesh.userData.clinked = false;
  }
  const salGlass = glasswareFor(sceneState.props.salGlass);
  salGlass.base.set(0.38, 0.78, 5.5);
  salGlass.mesh.position.copy(salGlass.base);

  if (prospect.droppedMesh) {
    scene.remove(prospect.droppedMesh);
    prospect.droppedMesh = null;
  }
  prospect.weaponDropped = false;
  prospect.weaponOut = false;
  prospect.hasWeapon = true;
  prospect.weapon.visible = false;
  prospect.seated = false;
  prospect.stand();
  prospect.teleport(new THREE.Vector3(POS.hallMouth.x, 0, POS.hallMouth.z + 1.4), Math.PI);
  prospect.pitch = 0;
  dropInteraction.reset();
  seated.exit();
  bathroomDoorOpen = true;
  sceneState.doors.bathDoorBlock.on = false;

  train.setIntensity(0.3);
  vibration.set(0.15);
  ambience.setMuffle(0);
  showDrawPrompt(null);
  showReticle(false);

  fadeIn();
  ui.hud.classList.add('visible');
  running = true;
  fsm.go(CHECKPOINT);
}

// ---------------------------------------------------------------- wiring

async function loadDialogue() {
  const res = await fetch(new URL('./dialogue/dialogue.json', import.meta.url));
  if (!res.ok) throw new Error(`dialogue.json: ${res.status}`);
  return res.json();
}

function wire(data) {
  dialogue = new DialogueController(data, {
    root: ui.subs, who: ui.subsWho, line: ui.subsLine,
  }, {
    onSpeak(id, line) {
      const dur = line.dur || 2.5;
      if (id === 'SAL') { sal.speak(dur); sal.lookAt(prospect.eye); }
      if (id === 'MCCLAWSKY') { mcclawsky.speak(dur); mcclawsky.lookAt(prospect.eye); }
    },
    onLook(target) {
      seated.lookCue(target);
    },
    onGesture(name) {
      if (name === 'salLean') { sal.lean(true); sal.gesture('hands', 2.0); return; }
      if (name === 'napkin') { Foley.cloth(); return; }
      if (['shrug', 'hands', 'drink', 'point'].includes(name)) sal.gesture(name, 1.8);
      if (['eat', 'lean'].includes(name)) mcclawsky.gesture(name === 'lean' ? 'drink' : 'eat', 1.8);
    },
  });

  chairInteraction = new ChairInteraction({
    prospect, seated, director, scene: sceneState,
    onSeated: () => fsm.go(S.SIT_DOWN),
  });

  toiletInteraction = new ToiletWeaponInteraction({
    prospect, director, scene: sceneState, camera, dialogue,
    onRetrieved: () => fsm.go(S.RETURN_TO_TABLE),
  });

  dropInteraction = new WeaponDropInteraction({
    prospect, ui,
    onDropped: () => fsm.go(S.WALK_TO_EXIT),
  });

  interactions.onPress = (id) => {
    if (id === 'chair' && fsm.is(S.APPROACH_TABLE)) chairInteraction.trigger();
    if (id === 'car' && fsm.is(S.ENTER_CAR)) {
      Foley.carDoor();
      interactions.allow();
      fsm.go(S.SCENE_COMPLETE);
    }
  };
  interactions.onHoldProgress = (id, p) => {
    if (id === 'toilet') toiletInteraction.holdProgress(p, lastDt);
  };
  interactions.onHoldCancel = (id) => {
    if (id === 'toilet') toiletInteraction.holdCancelled();
  };
  interactions.onHoldComplete = (id) => {
    if (!fsm.is(S.SEARCH_TOILET)) return;
    if (id === 'toilet') {
      interactions.allow();
      fsm.go(S.RETRIEVE_WEAPON);
    } else {
      const { easeUp } = toiletInteraction.wrongSearch(id);
      if (easeUp) interactions.setReach(1.3);
    }
  };

  fsm = new SquatchfatherStateMachine(buildStates(), (name) => {
    ui.pauseState.textContent = name.replace(/_/g, ' ').toLowerCase();
  });

  // Debug handle: jump between beats and fake input while tuning the scene.
  window.squatchfather = {
    fsm, prospect, sal, mcclawsky, sceneState, director, dialogue, interactions, audio,
    chairInteraction, toiletInteraction, dropInteraction,
    go: (name) => fsm.go(name),
    pressE: () => { ePressed = true; },
    pressFire: () => { firePressed = true; },
    state: () => fsm.name,
  };
}

// ---------------------------------------------------------------- loop

let lastDt = 1 / 60;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  lastDt = dt;

  if (running && !paused) {
    timeline.update(dt);
    updateTweens(dt);
    sceneState.update(dt);
    dialogue.update(dt);

    const seatedNow = prospect.seated;
    prospect.update(dt, keys);
    seated.update(dt, prospect);
    sal.update(dt);
    mcclawsky.update(dt, prospect.pos);
    toiletInteraction.update(dt);

    // Interaction prompts are suppressed while he's seated or scripted
    const canInteract = !prospect.autoTarget && !fsm.is(S.DROP_WEAPON);
    interactions.update(dt, canInteract && keys.e, canInteract && ePressed);
    if (fsm.is(S.DROP_WEAPON)) ui.prompt.classList.add('show');

    // Clicks outside the shooting beats are discarded rather than queued —
    // he cannot draw early, and cannot fire again once both men are down.
    if (!fsm.is(S.TRAIN_APPROACH, S.SHOOT_SAL, S.SHOOT_MCCLAWSKY)) firePressed = false;

    fsm.update(dt);

    ambience.update(dt);
    train.update(dt);
    vibration.update(dt);
    ringing.update(dt);
    director.update(dt, prospect, seatedNow ? seated.clamp : null);

    mirror.render(renderer, camera);
    ePressed = false;
  }

  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- flow

function togglePause() {
  if (!running) return;
  paused = !paused;
  ui.pause.classList.toggle('hidden', !paused);
  if (paused) {
    audio.suspend();
    document.exitPointerLock();
  } else {
    audio.resume();
    lockPointer();
  }
}

function startScene(fresh = true) {
  audio.init();
  audio.resume();
  ambience.start();
  train.start();

  ui.menu.classList.add('hidden');
  ui.death.classList.add('hidden');
  ui.endCard.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.hud.classList.add('visible');
  paused = false;
  running = true;

  if (fresh) {
    timeline.clear();
    tweens.length = 0;
    excuseRepeat = false;
    bathroomDoorOpen = true;
    fsm.start(S.START_EXTERIOR);
  }
  fadeIn();
  lockPointer();
}

function hardRestart() {
  window.location.reload();
}

$('startBtn').addEventListener('click', () => startScene(true));
$('resumeBtn').addEventListener('click', () => togglePause());
$('restartBtn').addEventListener('click', hardRestart);
$('retryBtn').addEventListener('click', () => {
  ui.death.classList.add('hidden');
  restoreCheckpoint();
  lockPointer();
});
$('againBtn').addEventListener('click', hardRestart);
for (const id of ['backBtn', 'quitBtn', 'menuBtn']) {
  const el = $(id);
  if (el) el.addEventListener('click', () => { window.location.href = './index.html'; });
}

loadDialogue().then((data) => {
  wire(data);
  frame();
}).catch((err) => {
  console.error(err);
  ui.menu.querySelector('.subtitle').textContent =
    'Could not load dialogue.json — serve the repo over HTTP (npx serve .) rather than opening the file directly.';
});
