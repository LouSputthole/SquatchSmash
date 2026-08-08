import * as THREE from 'three';
import {
  buildSquatchfatherScene,
  PLAYER_START_YAW,
  POS,
} from './scenes/SquatchfatherScene.js';
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
import { BulletHoles } from '../world/bullets.js';
import * as Foley from './audio/Foley.js';
import * as audio from './audio/core.js';
import { TrainVibration } from './effects/TrainVibration.js';
import { EarRingingEffect } from './effects/EarRingingEffect.js';
import { MirrorReflection } from './effects/MirrorReflection.js';
import {
  ITEM_IDS,
  SCENE_IDS,
  createCampaign,
  navigateCampaign,
} from '../core/campaign.js';
import { createSquatchfatherStory } from '../core/squatchfather-story.js';
import { prewarmScene } from '../core/prewarm.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { createPauseMenu } from '../core/pause-menu.js';

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
  deathTitle: $('deathTitle'),
  endCard: $('endCard'),
};

const sceneInventory = new SceneInventoryBar({ slots: 5, visible: false });

const campaign = createCampaign();
const campaignStory = createSquatchfatherStory({ campaign });
let campaignMissionStarted = false;

// ---------------------------------------------------------------- systems

const sceneState = buildSquatchfatherScene(scene, renderer);
const impacts = new BulletHoles(scene);
const blood = new BulletHoles(scene, 'blood');
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
let sharedPauseMenu = null;

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

sharedPauseMenu = createPauseMenu({
  title: 'The Squatchfather',
  canPause: () => running,
  getObjective: () => ui.objectiveText.textContent?.trim()
    || 'Enter the restaurant and follow Sal’s instructions.',
  instructions: [
    'W A S D or arrows — move. Mouse — look.',
    'E — interact; hold E when the prompt asks for it.',
    'Left click — fire when the weapon is drawn.',
    'M — mute.',
    'Tab or Escape — pause and review the current objective.',
  ],
  onPause: () => {
    paused = true;
    for (const key of Object.keys(keys)) keys[key] = false;
    audio.suspend();
  },
  onResume: () => {
    paused = false;
    audio.resume();
    clock.getDelta();
    lockPointer();
  },
  onRestart: () => hardRestart(),
});

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

function waiterPours(at = new THREE.Vector3(-1.75, 0, 6.5)) {
  if (waiterBusy || roomPanicked) return;
  waiterBusy = true;
  const wf = sceneState.figures.waiter;
  const w = wf.group;
  const start = w.position.clone();
  const face = Math.atan2(at.x - start.x, at.z - start.z);
  const legs = (raw) => { wf.walkAmt = 1; wf.walkT = raw * 8; };
  animateOver(1.6, (e, raw) => {
    if (roomPanicked) return; // the panic run owns him now
    w.position.lerpVectors(start, at, e);
    w.rotation.y = face;
    legs(raw);
  }, () => {
    wf.walkAmt = 0;
    if (!roomPanicked) Foley.pour();
    animateOver(1.4, () => {}, () => {
      animateOver(1.8, (e, raw) => {
        if (roomPanicked) return;
        w.position.lerpVectors(at, start, e);
        w.rotation.y = face + Math.PI;
        legs(raw);
      }, () => {
        waiterBusy = false;
        if (roomPanicked) return;
        w.rotation.y = Math.PI;
        wf.walkAmt = 0;
      });
    });
  });
}

/* The waiter works the room between story beats rather than standing at the
 * bar all night. Stops are open floor beside the background tables. The
 * rounds are occasional room flavour, not table service on a stopwatch. */
const WAITER_STOPS = [
  new THREE.Vector3(-1.75, 0, 6.5),
  new THREE.Vector3(-4.1, 0, 6.2),
  new THREE.Vector3(-3.9, 0, 3.6),
];
let waiterNextServe = 20;
let roomPanicked = false;

function waiterRounds(dt) {
  if (roomPanicked) return;
  // No waiter service can leak through the closed bathroom door. Hold the
  // next round back so retrieving the toilet weapon never gets a full-volume
  // wine pour, then let the room breathe again after Tony returns.
  if (!bathroomDoorOpen) {
    waiterNextServe = Math.max(waiterNextServe, 10);
    return;
  }
  waiterNextServe -= dt;
  if (waiterNextServe > 0 || waiterBusy) return;
  waiterNextServe = 34 + Math.random() * 28;
  waiterPours(WAITER_STOPS[Math.floor(Math.random() * WAITER_STOPS.length)]);
}

/* ---- After the shots: real cowering ----
 * The waiter breaks for the back corner, then goes down; the diners slide
 * off their chairs onto the floor. Everyone stays down, shaking, arms over
 * their heads, until the scene ends — and they all face the room, so the
 * fear reads from the player's walk out. */
const WAITER_CORNER = new THREE.Vector3(-6.2, 0, 10.1);
let waiterPanic = null;

function updateCowering(dt) {
  if (!waiterPanic) return;
  const wf = sceneState.figures.waiter;
  if (waiterPanic === 'run') {
    if (wf.walkTo(WAITER_CORNER.x, WAITER_CORNER.z, dt, 2.9)) {
      // Turned toward the room he is hiding from — and the exit lane.
      wf.group.rotation.y = Math.atan2(0 - WAITER_CORNER.x, 2 - WAITER_CORNER.z);
      wf.startCower();
      waiterPanic = 'down';
    }
  }
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

// Everyone in the room hears two shots in a small space. Nobody moves to
// stop him: the diners slide off their chairs and cower on the floor, the
// waiter breaks for the back corner and goes down, the cook watches from
// the door. They hold it until the scene ends.
function roomReacts() {
  roomPanicked = true;
  const { cook } = sceneState.bystanders;
  const { diner1, diner2 } = sceneState.figures;
  // Off the chair and down, sliding clear of the table as they drop.
  for (const [fig, out] of [
    [diner1, new THREE.Vector3(-6.25, 0, 1.85)],
    [diner2, new THREE.Vector3(6.25, 0, 1.5)],
  ]) {
    fig.startCower();
    const from = fig.group.position.clone();
    animateOver(0.55, (e) => fig.group.position.lerpVectors(from, out, e));
  }
  waiterPanic = 'run';
  animateOver(1.2, (e) => {
    cook.position.z = 11.6 - 0.55 * e;
    sceneState.doors.kitchenDoor.rotation.y = -0.7 * e;
  });
}

function resetRoomReactions() {
  roomPanicked = false;
  waiterPanic = null;
  impacts.reset();
  blood.reset();
  const { cook } = sceneState.bystanders;
  const { waiter, diner1, diner2 } = sceneState.figures;
  waiter.stopCower();
  waiter.walkAmt = 0;
  waiter.place(-3.2, 8.5, Math.PI);
  diner1.stopCower();
  diner1.setPose('sit');
  diner1.place(-5.75, 2.07, -0.3 + Math.PI / 2);
  diner2.stopCower();
  diner2.setPose('sit');
  diner2.place(5.71, 1.77, 0.4 - Math.PI / 2);
  waiterBusy = false;
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
  const flashAt = new THREE.Vector3();
  prospect.weapon.getWorldPosition(flashAt);
  impacts.muzzle(flashAt);
}

/** Blood at the wound and a second spatter thrown low, facing the shooter. */
function bloodHit(target) {
  const at = target.eyePoint;
  const toShooter = camera.position.clone().sub(at).normalize();
  // These are wounds on people, not decals on the restaurant wall. Attach
  // them to the moving figure so Sal's forward collapse and McClawsky's fall
  // carry the impact with them instead of leaving it hanging in the air.
  blood.punchAttached(target.fig.neck, at, toShooter);
  blood.punchAttached(target.fig.torso,
    at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, -0.38, (Math.random() - 0.5) * 0.25)),
    toShooter,
  );
}

function failScene(title) {
  ui.deathTitle.textContent = title;
  fsm.go(S.FAILED);
}

function buildStates() {
  return {
    [S.START_EXTERIOR]: {
      enter() {
        prospect.teleport(POS.playerStart, PLAYER_START_YAW);
        prospect.canMove = true;
        prospect.canLook = true;
        prospect.speed = SPEED.normal;
        ambience.setOutside(1);
        setRoomMuffle(0);
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
        Foley.doorClose('bathroom');
        swingDoor(sceneState.doors.bathDoor, -1.9, 0, 0.5);
        sceneState.doors.bathDoorBlock.on = true;
        bathroomDoorOpen = false;
        setRoomMuffle(1);
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
        // The train owns the pressure here; the extra horn was an indoor
        // jump-scare immediately after the bathroom, not useful story sound.
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
          setRoomMuffle(Math.max(0, (prospect.pos.z - 10.5) / 4.5));
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
        /* The replacement deep horn belongs here, under the room's maximum
         * vibration and immediately before Tony draws. The opening exterior
         * horn remains the distant establishing call. */
        train.horn();
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
        this.warned = false;
      },
      update(dt) {
        this.t += dt;
        // Aim assistance keeps the first shot centred on Sal
        if (this.t < 0.6) director.steerTo(sal.eyePoint, 0.1, 0.9);
        if (!this.warned && this.t > 14) {
          this.warned = true;
          showDrawPrompt('urgent');
        }
        if (this.t >= 20) {
          failScene('YOU HESITATED');
          return;
        }
        if (!firePressed) return;
        firePressed = false;
        fire();
        prospect.fireKick();
        sal.kill();
        bloodHit(sal);
        knockGlassOver(glasswareFor(sceneState.props.salGlass));
        roomReacts();
        fsm.go(S.SHOOT_MCCLAWSKY);
      },
    },

    [S.SHOOT_MCCLAWSKY]: {
      enter() {
        director.steerTo(mcclawsky.eyePoint, 0.55, 0.85);
        mcclawsky.startDraw(1.7, () => failScene('McCLAWSKY DREW FIRST'));
      },
      update() {
        if (!firePressed) return;
        firePressed = false;
        fire();
        prospect.fireKick();
        mcclawsky.kill();
        bloodHit(mcclawsky);
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
        campaignStory.complete();
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

// ---------------------------------------------------------------- prewarm

/* The first shot used to cost about ten frames and every shot after it was
 * free. The reason was the muzzle flash: it is a PointLight that sits
 * `visible = false` until the trigger, three.js ignores invisible lights when
 * it counts the light list, and the point-light count is part of every
 * material's program cache key. The frame that light first appears on is the
 * frame the whole room needs programs it has never had — measured at ~994ms
 * against ~8ms for a quiet frame.
 *
 * So we draw those states once while the menu is still up, clipped to a single
 * pixel, and gameplay never pays for them. Nothing about the look changes;
 * this only moves the cost earlier. */

/** Everything hidden now that the shooting beats put on screen later. */
function firstShotObjects() {
  return [
    blood.pool,            // the two spatters thrown at each hit
    impacts.pool,          // bullet holes, same material family
    prospect.weapon,       // the first-person revolver, out at DRAW_WEAPON
    mcclawsky.gun,         // his, if he gets that far
    sceneState.props.wrapped,       // the package coming out of the cistern
    toiletInteraction?.bundle,      // and the bundle it is wrapped in
  ].filter(Boolean);
}

async function prewarmFirstShot() {
  const effects = firstShotObjects();

  /* The flash is the expensive one, and it has to be warmed at the light
   * count it really fires at — one more point light than the room has the
   * rest of the time. Its intensity is irrelevant to the program key but is
   * set anyway so the warm draw is the draw that happens in play. */
  const flashIntensity = impacts.flash.intensity;
  impacts.flash.intensity = 9;

  try {
    return await prewarmScene({
      renderer,
      scene,
      camera,
      // A frame between the passes: the menu stays clickable while they run.
      spread: true,
      passes: [
        // The room's own lighting, with every hidden effect object drawn.
        { name: 'effects', reveal: effects },
        // And again with the muzzle flash lit: the state that used to hitch.
        { name: 'muzzle flash', reveal: [...effects, impacts.flash] },
      ],
      audio: {
        module: audio,
        // Everything the trigger, the drop and the aftermath reach for. They
        // are already fetching from audio.init(); this waits on the decode so
        // the first shot never falls back to the synth mid-beat.
        cues: [
          'gun.shot', 'gun.reload', 'gun.drop.wood',
          'ear.ringing', 'chair.knock', 'glass.wine.fall',
          'cloth.suit.movement', 'car.door.close.heavy',
        ],
      },
      /* No pools to fill: BulletHoles builds all eight quads and its light in
       * its constructor, so the first shot already allocates nothing. The
       * passes above are what its pool was still missing. */
    });
  } finally {
    impacts.flash.intensity = flashIntensity;
    impacts.flash.visible = false;
  }
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
  setRoomMuffle(0);
  showDrawPrompt(null);
  showReticle(false);
  ui.deathTitle.textContent = 'McCLAWSKY DREW FIRST';

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

// ---- Recorded dialogue -------------------------------------------------
// The sfx manifest carries every vo.sf.* clip with the exact line it speaks,
// so the beats are matched to their recordings by speaker + line text rather
// than by a table that could drift from either side.

const SPEAKER_VOICE = { PROSPECT: 'player', SAL: 'sal', MCCLAWSKY: 'mcclawsky' };

function normLine(text) {
  return String(text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// voice|line -> cue name, e.g. "sal|enough." -> "vo.sf.opening.14".
async function loadVoiceCues() {
  try {
    const res = await fetch('assets/sfx/manifest.json');
    if (!res.ok) throw new Error(String(res.status));
    const manifest = await res.json();
    const cues = new Map();
    for (const cue of manifest.sfx || []) {
      if (!cue.name || !cue.name.startsWith('vo.sf.') || !cue.say) continue;
      cues.set(`${cue.voice}|${normLine(cue.say)}`, cue.name);
    }
    return cues;
  } catch {
    return new Map(); // every beat falls back to its reading-beat hold
  }
}

function voiceCueFor(voCues, line) {
  return voCues.get(`${SPEAKER_VOICE[line.speaker]}|${normLine(line.text)}`) || null;
}

// The bathroom-door muffle: the ambience beds and the voices at the table go
// dull and far away together, exactly as the manifest's mix note directs.
function setRoomMuffle(v) {
  ambience.setMuffle(v);
  audio.setVoiceMuffle(v);
}

/* The tap on the line currently being spoken, handed from `onVoice` to
 * `onSpeak` -- the controller calls them in that order for the same line, and
 * the mouth needs the take rather than the authored duration. */
let voiceTake = null;

function wire(data, voCues) {
  dialogue = new DialogueController(data, {
    root: ui.subs, who: ui.subsWho, line: ui.subsLine,
  }, {
    onVoice(line) {
      const cue = voiceCueFor(voCues, line);
      const secs = cue ? audio.playVoice(cue) : 0;
      /* The tap on the take that just started, kept for `onSpeak` below —
       * which the controller calls next, on the same line. The mouth runs on
       * it (src/core/mouth.js) instead of on the authored `dur`. */
      voiceTake = secs > 0 ? audio.voiceTap() : null;
      return secs;
    },
    onVoiceStop() {
      audio.stopVoice();
      voiceTake = null;
      /* The mouth goes with the voice, including when the line is CUT — a
       * checkpoint restore or an interrupting bark leaves a man mid-word. */
      sal.hush();
      mcclawsky.hush();
    },
    onSpeak(id, line, dur) {
      if (id === 'SAL') { sal.speak(dur, voiceTake); sal.lookAt(prospect.eye); }
      if (id === 'MCCLAWSKY') { mcclawsky.speak(dur, voiceTake); mcclawsky.lookAt(prospect.eye); }
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
    ambience, train,
    campaign, campaignStory,
    chairInteraction, toiletInteraction, dropInteraction,
    // The renderer and the two decal pools are on the handle so the frame-cost
    // verifier can read renderer.info.programs across a shot.
    renderer, scene, camera, impacts, blood, ringing,
    go: (name) => fsm.go(name),
    pressE: () => { ePressed = true; },
    pressFire: () => { firePressed = true; },
    tick(seconds = 1, step = 0.05) {
      for (let elapsed = 0; elapsed < seconds; elapsed += step) {
        updateGame(Math.min(step, seconds - elapsed));
      }
    },
    state: () => fsm.name,
  };
}

// ---------------------------------------------------------------- loop

let lastDt = 1 / 60;
const clock = new THREE.Clock();

function updateGame(dt) {
  lastDt = dt;
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

  const canInteract = !prospect.autoTarget && !fsm.is(S.DROP_WEAPON);
  interactions.update(dt, canInteract && keys.e, canInteract && ePressed);
  if (fsm.is(S.DROP_WEAPON)) ui.prompt.classList.add('show');

  if (!fsm.is(S.TRAIN_APPROACH, S.SHOOT_SAL, S.SHOOT_MCCLAWSKY)) firePressed = false;
  fsm.update(dt);

  ambience.update(dt);
  train.update(dt);
  vibration.update(dt);
  ringing.update(dt);
  impacts.update(dt);
  waiterRounds(dt);
  updateCowering(dt);
  director.update(dt, prospect, seatedNow ? seated.clamp : null);
  updateSceneInventory();
  mirror.render(renderer, camera);
  ePressed = false;
}

let inventorySignature = '';
function updateSceneInventory() {
  const items = [];
  if (!prospect.weaponDropped) {
    if (prospect.hasWeapon) {
      items.push({ icon: '🔫', label: prospect.weaponOut ? 'Revolver · drawn' : 'Revolver · concealed' });
    } else if (campaign.state.inventory.concealed.includes(ITEM_IDS.LOU_PACKAGE)) {
      items.push({ icon: '🧥', label: "Lou's package · concealed" });
    }
  }
  const next = JSON.stringify(items);
  if (next === inventorySignature) return;
  inventorySignature = next;
  sceneInventory.set(items);
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (running && !paused) updateGame(dt);

  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- flow

function togglePause() {
  if (sharedPauseMenu) {
    sharedPauseMenu.toggle();
    return;
  }
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
  if (fresh && !campaignMissionStarted) {
    const result = campaignStory.begin();
    if (!result.ok) {
      const reason = {
        already_complete: 'This business is already settled. Return home.',
        bada_bing_incomplete: 'Lou has not given you this job yet.',
        missing_package: 'Lou’s package is not under your jacket.',
        mission_locked: 'This meeting is not available yet.',
      }[result.reason] || 'This mission cannot start from the current save.';
      ui.menu.querySelector('.subtitle').textContent = reason;
      return;
    }
    if (campaign.state.scene.id !== SCENE_IDS.SQUATCHFATHER) {
      campaign.enter(SCENE_IDS.SQUATCHFATHER, { spawn: 'development_entry' });
    }
    campaignMissionStarted = true;
  }
  audio.init();
  audio.resume();
  ambience.start();
  train.start();

  ui.menu.classList.add('hidden');
  ui.death.classList.add('hidden');
  ui.endCard.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.hud.classList.add('visible');
  sceneInventory.show();
  updateSceneInventory();
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
function returnToApartment() {
  navigateCampaign(campaign, SCENE_IDS.APARTMENT, {
    spawn: 'front_door',
    location: window.location,
  });
}

$('againBtn').addEventListener('click', returnToApartment);

// Build the audio graph while the menu is still up: the context sits
// suspended until the start click, but the recordings fetch and decode now,
// so the first spoken line is a clip rather than a reading-beat hold.
audio.init();

Promise.all([loadDialogue(), loadVoiceCues()]).then(([data, voCues]) => {
  wire(data, voCues);
  frame();
  /* One frame later — so the first real render has already put the room on
   * the GPU — buy the shooting beats their shader programs and their decoded
   * cues, behind the menu, where nobody is counting frames. */
  requestAnimationFrame(() => {
    /* Never fatal: a scene that cannot be prewarmed is a scene that hitches
     * once, not one that fails to start — and an unhandled rejection here
     * would put the boot-failure card over a perfectly good restaurant. */
    window.squatchfather.prewarming = prewarmFirstShot()
      .catch((err) => ({ failed: String(err && err.message ? err.message : err) }))
      .then((report) => {
        window.squatchfather.prewarmReport = report;
        return report;
      });
  });
}).catch((err) => {
  console.error(err);
  ui.menu.querySelector('.subtitle').textContent =
    'Could not load dialogue.json — serve the repo over HTTP (npx serve .) rather than opening the file directly.';
});
