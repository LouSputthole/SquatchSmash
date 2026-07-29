/**
 * Squatch Life -- entry point.
 *
 * Boots the renderer, builds the apartment, and owns the top-level state
 * machine: title -> in bed -> walking around -> seated at the PC.
 *
 * "Squatch Smash" is the arcade game on the desk PC, not this. See
 * src/arcade/ for that one.
 */
import * as THREE from 'three';
import { AudioEngine } from './core/audio.js';
import { Hud } from './core/hud.js';
import { InteractionSystem } from './core/interaction.js';
import { Player } from './core/player.js';
import { Radio } from './core/radio.js';
import { Narrator } from './core/narrator.js';
import { buildApartment } from './world/apartment.js';
import { createArcade } from './arcade/mount.js';
import { Drunk, BEER_UNITS, WHISKEY_UNITS } from './core/drunk.js';
import { Highs } from './core/highs.js';
import { Goals, ENDINGS } from './core/goals.js';
import { Chat } from './core/chat.js';
import { DayNight } from './core/daynight.js';
import { SmokeSystem } from './world/smoke.js';
import { StreamSystem } from './world/stream.js';
import { ShowerSystem } from './world/shower.js';
import { makeHeldCigarette } from './world/props.js';
import { roomEnvironment } from './world/textures.js';

const DRINK_TIME = 2.4;
const SWIG_TIME = 1.7;   // whiskey goes down faster, for better or worse

/* Smoking beats, in seconds from the moment you hold F. */
const CIG_SHOW = 0.34;
const CIG_DRAG = 0.46;
const CIG_EXHALE = 1.55;
const CIG_DONE = 2.40;
const CIG_AFTERGLOW = 4.20;

const canvas = document.getElementById('scene');
const fxDrunk = document.getElementById('fx-drunk');
const fxHigh = document.getElementById('fx-high');
const blackout = document.getElementById('blackout');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startBtn = document.getElementById('start-btn');
const assetStatus = document.getElementById('asset-status');

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */

/* WebGL is the one hard requirement, and it is not always there -- an old
 * phone, a locked-down frame, a machine with the GPU blocklisted. This runs
 * at module top level, so throwing here would leave the loading screen
 * sweeping forever with nothing to explain it. Say what happened instead. */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
} catch (err) {
  window.__squatchFail?.(
    'This device cannot run the apartment',
    'It needs WebGL, and the browser would not give us a context. '
    + 'On a phone this usually means low power mode; in an embedded page it '
    + 'usually means the frame is not allowed one. Opening it in a normal '
    + 'browser tab is the fix. ' + (err?.message || ''),
  );
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.Fog(0x0d1018, 14, 34);

// Metals need something to reflect or they render black. One small procedural
// room capture, prefiltered once, and every chrome fitting in the apartment
// starts behaving like metal.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const src = roomEnvironment();
  scene.environment = pmrem.fromEquirectangular(src).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  src.dispose();
}

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 60);
scene.add(camera);

// Handheld light for poking around with the blinds down.
const flashlight = new THREE.SpotLight(0xfff2d8, 0, 9, 0.42, 0.5, 1.6);
flashlight.position.set(0, 0, 0);
flashlight.target.position.set(0, 0, -1);
camera.add(flashlight, flashlight.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ */
/* Systems                                                             */
/* ------------------------------------------------------------------ */

const audio = new AudioEngine();
const hud = new Hud();
const interaction = new InteractionSystem(camera, hud);
const world = { colliders: [], floorZones: [] };
const player = new Player(camera, world);

player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

const time = new DayNight(6 + 4 / 60);
// The talk station reads the clock to decide what is on air.
const radio = new Radio(audio, hud, time);
// Nothing happens in here. Somebody should say so.
const narrator = new Narrator(hud, time, audio);
const drunk = new Drunk();
// The coffee table's contribution. Neither of these costs you Wednesday.
const highs = new Highs();
// The only goal in the game, and it never announces itself.
const goals = new Goals(time);
// Booski, typing into a server nobody is in. The second way to find out.
const chat = new Chat(time);
const smoke = new SmokeSystem(scene);
const stream = new StreamSystem(scene);
// Water out of the rose, for the nine seconds it is running.
const showerFx = new ShowerSystem(scene);

// The lit cigarette rides on the camera, low and to the right.
const heldCig = makeHeldCigarette();
/* In the corner of his mouth: low, just off centre, close to the camera, and
 * pointing away down the view rather than lying across it. */
heldCig.group.position.set(0.055, -0.062, -0.10);
heldCig.group.rotation.set(0.06, 0.13, 0);
heldCig.group.scale.setScalar(1.25);
heldCig.group.visible = false;
camera.add(heldCig.group);

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();

const arcade = createArcade({ audio });
const screenTexture = new THREE.CanvasTexture(arcade.canvas);
screenTexture.colorSpace = THREE.SRGBColorSpace;
screenTexture.minFilter = THREE.LinearFilter;
screenTexture.generateMipmaps = false;

let apartment = null;

const game = {
  started: false,
  paused: false,
  seated: false,        // at the PC specifically
  sitting: null,        // 'couch' | 'bed' -- sitting for its own sake
  inBed: false,         // lay back down on purpose
  flashlightOn: false,
  drinking: 0,
  passingOut: false,
  peeing: false,
  peeTime: 0,
  onToilet: false,
  poopTime: 0,
  nextPlopAt: 0,
  rumbleAt: 0,
  zynUntil: -1,
  showering: null,      // seconds into the shower, or null
  cooking: null,        // seconds into the eggs, or null
  left: false,          // out of the door; the game is over
  nextFartAt: 40 + Math.random() * 60,
  fartClock: 0,
  fartQueued: false,    // deliberate one waiting for him to stop talking
};

/** Seven of them, picked at random, never the same one twice running. */
const FART_CUES = ['fart.1', 'fart.2', 'fart.3', 'fart.4', 'fart.5', 'fart.6', 'fart.7'];
let _lastFart = -1;

/** Smoking sequence state. */
const cig = { t: -1, lit: false, exhaled: false, afterglow: 0 };

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  window.__squatchStage?.('Building the apartment…');
  apartment = await buildApartment({
    scene,
    audio,
    hud,
    interaction,
    time,
    onNote: (what) => narrator.note(what),
    isSeated: () => game.seated || !!game.sitting || game.inBed || game.onToilet,
    onSitPC: sitAtPC,
    onSitCouch: () => sitOn('couch'),
    onSitBed: () => sitOn('bed'),
    onLieBed: lieOnBed,
    onStartPee: startPee,
    onSitToilet: sitOnToilet,
    onZyn: takeZyn,
    onBong: hitBong,
    onShrooms: eatShrooms,
    onShower: takeShower,
    onDressed: () => {
      audio.say('dress', { chance: 0.8, delay: 0.4 });
      hud.toast('Clean shirt', 'good');
      hud.say('A clean shirt. It even smells like a clean shirt.', 4200);
    },
    onCook: cookEggs,
    onEat: eatEggs,
    onLeave: tryLeave,
    onReadChat: readChat,
    onChatVisible: () => apartment.desk.repaintChat(chat),
    onLearn: (source) => learnAboutMeeting(source),
    // The set's own LED and dial read off apartment state, so keep it honest.
    onRadioToggle: () => { radio.toggle(); apartment.state.radioOn = radio.on; },
    onRadioTune: () => { radio.tune(); apartment.state.radioOn = radio.on; },
  });

  world.colliders = apartment.colliders;
  world.floorZones = apartment.floorZones;

  // Wire the arcade canvas onto the monitor. Basic material so the screen is
  // self-lit rather than depending on room lighting.
  apartment.screen.material = new THREE.MeshBasicMaterial({
    map: screenTexture,
    toneMapped: false,
  });

  stream.setColliders(apartment.colliders);
  stream.setTarget(
    apartment.toiletBowl,
    apartment.toiletBowlRadius,
    apartment.toiletBowl.y,
    apartment.toiletCollider,
  );

  // Third way to find out about the meeting: leave the radio on.
  radio.onNotice = () => learnAboutMeeting('radio');

  window.__squatchStage?.('Tuning the radio…');
  radio.setPosition(apartment.radioPos);
  const trackCount = await radio.loadManifest();

  player.layInBed(apartment.bedPose.position, apartment.bedPose.yaw);
  // Nothing is reachable from under the duvet.
  interaction.setPaused(true);

  const realArt = apartment.frames.filter((f) => f.info.real).length;
  assetStatus.innerHTML = [
    `${trackCount} radio track${trackCount === 1 ? '' : 's'} loaded`,
    `${realArt}/${apartment.frames.length} wall slots using your own art`,
    'drop files in assets/music/ and assets/art/ — see README',
  ].join('<br>');

  window.__squatchStage?.('Ready.');
  loading.classList.add('hidden');

  // Dev handle: lets you inspect and pose the scene from the console, e.g.
  //   __squatch.teleport(0, 2, 'north')
  window.__squatch = {
    scene, camera, renderer, player, apartment, arcade, audio, radio, game, interaction,
    drunk, highs, smoke, stream, showerFx, cig, time, passOut, fart, startPee, stopPee,
    hitBong, eatShrooms,
    sitOnToilet, standFromToilet, takeZyn,
    sitOn, standFromSeat, lieOnBed, sleepInBed, sitAtPC, standFromPC, getUp,
    narrator, goals, chat, takeShower, cookEggs, eatEggs, tryLeave, learnAboutMeeting,
    readChat,
    teleport(x, z, facing = 'north') {
      const yaws = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };
      // Skipping the wake-up also skips the point where interaction resumes.
      interaction.setPaused(false);
      player.mode = 'walk';
      player.pitchMin = -Math.PI / 2 + 0.05;
      player.pitchMax = Math.PI / 2 - 0.05;
      player.yawCenter = null;
      player.position.set(x, 1.66, z);
      player.velocity.set(0, 0, 0);   // or you arrive still carrying the last run
      player.eyeHeight = 1.66;
      player.pitch = 0;
      player.yaw = typeof facing === 'number' ? facing : (yaws[facing] ?? 0);
      player.update(0.016);
    },
  };
}

boot().catch((err) => {
  console.error(err);
  window.__squatchFail?.('Could not build the apartment', err?.message || String(err));
});

/* ------------------------------------------------------------------ */
/* Start / pause                                                       */
/* ------------------------------------------------------------------ */

startBtn.addEventListener('click', async () => {
  if (game.left) return;          // the ending card owns the button now
  await audio.init();
  const sfx = await audio.loadManifest();
  console.info(`[sfx] ${sfx.loaded}/${sfx.total} samples loaded; the rest are synthesised.`);

  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  requestLock();

  if (!game.started) {
    game.started = true;
    audio.startLoop('ambience.city.day', { volume: 0.0, ambience: true, fade: 2 });
    audio.startLoop('ambience.city.night', { volume: 0.0, ambience: true, fade: 2 });
    audio.startLoop('ambience.room', { volume: 0.07, ambience: true });
    audio.play('bed.rustle', { volume: 0.5 });
    audio.say('wake', { delay: 1.1 });
    hud.say('<em>6:04 AM.</em> You are awake. That was not the plan.', 5200);
    setTimeout(() => {
      if (player.mode === 'bed') hud.showPrompt('Get <b>up</b>', 'E');
    }, 3600);
  }
  game.paused = false;
});

/* Pointer lock is how this is meant to be played, but some embeddings refuse
 * it -- a sandboxed frame without allow-pointer-lock, for one. Rather than
 * leave the game unplayable there, fall back to hold-the-left-button-and-drag
 * to look. `dragLook` is set the first time a lock request is denied. */
let dragLook = false;
let dragging = false;

function requestLock() {
  if (dragLook) {
    enableInput();
    return;
  }
  const p = canvas.requestPointerLock?.();
  // Chrome returns a promise from requestPointerLock; older builds throw or
  // simply never fire pointerlockchange, so both paths are covered.
  if (p && p.catch) p.catch(() => fallBackToDragLook());
  setTimeout(() => {
    if (!dragLook && document.pointerLockElement !== canvas && !game.paused) {
      fallBackToDragLook();
    }
  }, 600);
}

function fallBackToDragLook() {
  if (dragLook) return;
  dragLook = true;
  enableInput();
  hud.say('Pointer lock is blocked here — <em>hold the left button to look around.</em>', 7000);
}

function enableInput() {
  player.enabled = true;
  game.paused = false;
  document.body.classList.remove('unlocked');
  overlay.classList.add('hidden');
}

document.addEventListener('pointerlockchange', () => {
  if (dragLook) return;
  const locked = document.pointerLockElement === canvas;
  player.enabled = locked;
  document.body.classList.toggle('unlocked', !locked);
  if (!locked && game.started) pauseGame();
});

function pauseGame() {
  game.paused = true;
  player.clearKeys();
  interaction.release();
  overlay.classList.remove('hidden');
  overlay.querySelector('h1').innerHTML = 'PAUSED<span>SQUATCH LIFE</span>';
  overlay.querySelector('.tag').textContent = game.seated
    ? 'Still at the desk. The meeting is not until tomorrow.'
    : 'The fridge is not going anywhere.';
  startBtn.textContent = 'Resume';
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

document.addEventListener('mousemove', (e) => {
  if (!player.enabled || game.paused) return;
  if (dragLook && !dragging) return;      // look only while the button is held
  if (game.seated) {
    arcade.onPointer(e.movementX, e.movementY);
    // Let the head drift very slightly so the pose is not rigid.
    player.handleMouseMove(e.movementX * 0.06, e.movementY * 0.06);
  } else {
    player.handleMouseMove(e.movementX, e.movementY);
  }
});

document.addEventListener('mousedown', (e) => {
  if (!player.enabled || game.paused || e.button !== 0) return;
  dragging = true;
  if (game.seated) arcade.onClick(true);
  else interaction.press();
});

document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  dragging = false;
  if (game.seated) arcade.onClick(false);
  else interaction.release();
});

document.addEventListener('keydown', (e) => {
  if (e.repeat) {
    // Still needs to reach the hold-to-drink accumulator.
    if (e.code === 'KeyF') return;
    return;
  }
  if (!game.started || game.paused) return;

  player.setKey(e.code, true);

  if (game.seated) {
    // Escape is left to the browser -- it releases the pointer and pauses.
    if (e.code === 'KeyQ') {
      standFromPC();
      return;
    }
    if (arcade.onKey(e.code, true)) e.preventDefault();
    if (e.code === 'Space') e.preventDefault();
    return;
  }

  switch (e.code) {
    case 'KeyE':
      // Lying down on purpose is the one case where E means sleep, not stand.
      if (game.inBed) sleepInBed();
      else if (player.mode === 'bed') getUp();
      else if (game.onToilet) standFromToilet();
      else if (game.peeing) stopPee();
      else interaction.press();
      break;
    case 'KeyG':
      fart({ voluntary: true });
      break;
    case 'KeyT':
      game.flashlightOn = !game.flashlightOn;
      audio.play('switch.click', { volume: 0.5 });
      break;
    case 'KeyR':
      if (interaction.current && interaction.current.name === 'radio') radio.next();
      break;
    case 'KeyQ':
      if (apartment.state.lipPacked) {
        apartment.dropZyn();
        audio.play('can.set', { volume: 0.3 });
        hud.setHand(null);
        hud.toast('Binned it');
      } else if (game.onToilet) standFromToilet();
      else if (game.peeing) stopPee();
      else if (game.sitting) standFromSeat();
      else if (game.inBed || player.mode === 'bed') getUp();
      else dropHeld();
      break;
    default:
      break;
  }
});

document.addEventListener('keyup', (e) => {
  player.setKey(e.code, false);
  if (e.code === 'KeyE' && !game.seated) interaction.release();
});

/* ------------------------------------------------------------------ */
/* Bed / desk transitions                                              */
/* ------------------------------------------------------------------ */

function getUp() {
  game.inBed = false;
  hud.hidePrompt();
  audio.play('bed.creak', { volume: 0.7 });
  audio.play('bed.rustle', { volume: 0.6, delay: 0.2 });
  audio.say('getup', { chance: 0.7 });
  player.standUpFromBed(apartment.bedExit, apartment.bedLookYaw, () => {
    interaction.setPaused(false);
  });
  hud.say('Feet on cold floor. There is a fridge, and there is a PC.', 5000);
}

function sitAtPC() {
  if (game.seated) return;
  game.seated = true;
  interaction.setPaused(true);
  hud.setMode('seated');
  audio.play('chair.roll', { volume: 0.4 });
  audio.play('chair.sit', { volume: 0.6, delay: 0.25 });
  audio.say('pc.sit', { chance: 0.6, delay: 0.9 });

  player.sitAt(apartment.deskPose, () => {
    audio.setMuffle(true);
    radio.setFocusMuffle(true);
    if (!apartment.state.pcOn) {
      apartment.setPcOn(true);
      audio.startLoop('pc.fan', {
        volume: 0.14, position: new THREE.Vector3(2.76, 0.3, -4.0), ref: 0.9, maxDist: 5,
      });
      audio.play('pc.boot', { volume: 0.5 });
      arcade.boot();
    }
    hud.say('<em>Q</em> to get up from the desk.', 3200);
  });
}

function standFromPC() {
  if (!game.seated) return;
  game.seated = false;
  hud.setMode('walk');
  audio.setMuffle(false);
  radio.setFocusMuffle(false);
  audio.play('chair.roll', { volume: 0.4 });
  player.standFrom(apartment.deskExit, () => interaction.setPaused(false));
}

/* ------------------------------------------------------------------ */
/* Sitting about                                                       */
/* ------------------------------------------------------------------ */

/**
 * The couch and the edge of the bed. Nothing happens while you are there,
 * which is rather the point -- but time keeps moving, the radio keeps
 * playing, and the room slowly goes dark around you.
 */
const SEATS = {
  couch: {
    pose: () => apartment.couchPose,
    exit: () => apartment.couchExit,
    cue: 'couch.sit',
    line: 'You sit down. The cushion gives up immediately. <em>[Q] to get up.</em>',
  },
  bed: {
    pose: () => apartment.bedSitPose,
    exit: () => apartment.bedSitExit,
    cue: 'bed.creak',
    line: 'On the edge of the bed, then. <em>Hold [E] on the bed to lie back down.</em>',
  },
};

function sitOn(which) {
  if (game.sitting || game.seated || game.onToilet || game.passingOut) return;
  if (player.mode !== 'walk') return;
  const seat = SEATS[which];
  game.sitting = which;
  interaction.setPaused(true);
  hud.setMode('seated');
  audio.play(seat.cue, { volume: 0.55 });

  player.sitAt(seat.pose(), () => {
    interaction.setPaused(false);   // you can still reach things from a seat
    hud.say(seat.line, 4600);
  });
}

function standFromSeat() {
  if (!game.sitting) return;
  const seat = SEATS[game.sitting];
  game.sitting = null;
  hud.setMode('walk');
  audio.play(seat.cue, { volume: 0.4, rate: 1.08 });
  player.standFrom(seat.exit(), () => interaction.setPaused(false));
}

/** Lie back down. From here you can sleep the day away, which is an option. */
function lieOnBed() {
  if (game.seated || game.onToilet || game.passingOut) return;
  if (player.mode === 'bed') return;
  game.sitting = null;
  game.inBed = true;
  interaction.setPaused(true);
  hud.setMode('seated');
  audio.play('bed.creak', { volume: 0.7 });
  audio.play('bed.rustle', { volume: 0.6, delay: 0.25 });
  audio.say('liedown', { chance: 0.8 });

  player.lieDown(apartment.bedPose, () => {
    hud.say('Ceiling. <em>[E] to sleep it off &middot; [Q] to get up.</em>', 5200);
  });
}

/** Deliberate sleep, as opposed to the kind that happens to you. */
function sleepInBed() {
  if (!game.inBed || game.passingOut) return;
  game.inBed = false;
  hud.hidePrompt();
  audio.say('sleep');
  hud.say('You close your eyes. It is not like you had plans.', 2600);
  passOut({ voluntary: true });
}

/* ------------------------------------------------------------------ */
/* Beer and smokes                                                     */
/* ------------------------------------------------------------------ */

function dropHeld() {
  const st = apartment.state;
  if (!st.heldItem || cig.t >= 0) return;

  if (st.heldItem === 'empty') {
    audio.play('can.crush', { volume: 0.6 });
    hud.toast('Crushed the can');
  } else if (st.heldItem === 'cigs') {
    apartment.returnCigarettes();
    audio.play('can.set', { volume: 0.35 });
  } else if (st.heldItem === 'whiskey') {
    apartment.returnWhiskey();
    audio.play('whiskey.cap', { volume: 0.5 });
  } else {
    audio.play('can.set', { volume: 0.5 });
  }
  st.heldItem = null;
  hud.setHand(null);
}

/** Both consumables are on hold-F; which one runs depends on what you hold. */
function updateConsume(dt) {
  const st = apartment.state;
  const holdingF = player.keys.has('KeyF') && !game.seated && !game.passingOut;

  if (st.heldItem === 'cigs' || cig.t >= 0) updateSmoking(dt, holdingF);
  else if (st.heldItem === 'whiskey') updateSwigging(dt, holdingF);
  else updateDrinking(dt, holdingF);
}

function updateDrinking(dt, holdingF) {
  const st = apartment.state;
  const wantsDrink = holdingF && st.heldItem === 'beer';

  if (!wantsDrink) {
    if (game.drinking > 0) {
      game.drinking = 0;
      hud.setHold(null);
      if (!interaction.current) hud.hidePrompt();
    }
    return;
  }

  if (game.drinking === 0) {
    audio.play('can.crack', { volume: 0.8 });
    audio.say('beer.open', { chance: 0.5, delay: 0.5 });
  }
  game.drinking += dt;

  hud.showPrompt('Drinking…', 'F');
  hud.setHold(Math.min(1, game.drinking / DRINK_TIME));
  if (game.drinking > 0.4 && Math.random() < dt * 2.4) {
    audio.play('can.sip', { volume: 0.4 });
  }

  if (game.drinking >= DRINK_TIME) {
    game.drinking = 0;
    hud.setHold(null);
    hud.hidePrompt();
    apartment.consumeBeer();
    drunk.drink(BEER_UNITS);
    apartment.state.bladder = Math.min(1, apartment.state.bladder + 0.30);
    hud.setHand({ icon: '🥫', name: 'Empty can', hint: '[Q] crush it' });

    // The first couple steady you. After that the room starts moving.
    const n = apartment.state.beersDrunk;
    audio.say(n <= 2 ? 'beer.good' : 'beer.many', { chance: 0.75, delay: 0.4 });
    if (apartment.state.beersLeft === 0) audio.say('beer.last', { delay: 2.2 });
    if (n <= 2) {
      arcade.grantBuff?.(1);
      hud.toast('Steady hands — +1 slow-mo charge at the PC', 'good');
      hud.say('Cold. Immediate. <em>Your aim feels better already.</em>', 4200);
    } else if (n === 3) {
      hud.toast('That one hit different', 'bad');
      hud.say('Three deep. The floor has opinions about this now.', 4600);
    } else {
      hud.toast('You are not going to make it', 'bad');
      hud.say('Everything is warm and slightly to the left.', 4600);
    }
  }
}

/** A pull straight from the bottle. Twice a beer, in half the time. */
function updateSwigging(dt, holdingF) {
  const st = apartment.state;
  const wants = holdingF && st.whiskeyLeft > 0;

  if (!wants) {
    if (game.drinking > 0) {
      game.drinking = 0;
      hud.setHold(null);
      if (!interaction.current) hud.hidePrompt();
    }
    if (holdingF && st.whiskeyLeft <= 0) hud.say('Empty. It was never going to end well.');
    return;
  }

  if (game.drinking === 0) audio.play('whiskey.pour', { volume: 0.7 });
  game.drinking += dt;

  hud.showPrompt('Drinking…', 'F');
  hud.setHold(Math.min(1, game.drinking / SWIG_TIME));
  if (game.drinking > 0.3 && Math.random() < dt * 2.0) {
    audio.play('whiskey.swig', { volume: 0.5 });
  }

  if (game.drinking >= SWIG_TIME) {
    game.drinking = 0;
    hud.setHold(null);
    hud.hidePrompt();

    apartment.consumeWhiskey();
    drunk.drink(WHISKEY_UNITS);
    apartment.state.bladder = Math.min(1, apartment.state.bladder + 0.16);
    audio.play('whiskey.gasp', { volume: 0.7 });
    audio.say('whiskey', { chance: 0.7, delay: 1.0 });

    const n = st.whiskeyLeft;
    hud.setHand({
      icon: '🥃',
      name: n > 0 ? `Jack & Daniel's (${n})` : 'Empty bottle',
      hint: n > 0 ? 'Hold [F] to take a pull' : '[Q] set it down',
    });
    hud.toast(n > 0 ? 'That went straight through you' : 'Bottle empty', 'bad');
    hud.say(st.whiskeyDrunk <= 1
      ? 'Warm all the way down. <em>That was a lot faster than beer.</em>'
      : 'The room takes a second to catch up with your head.', 4600);
  }
}

/**
 * One hold of F is one whole cigarette: flick, drag, exhale. Letting go
 * before the exhale abandons it and costs nothing.
 */
function updateSmoking(dt, holdingF) {
  const st = apartment.state;

  // Afterglow: it stays lit in your hand for a moment, then gets flicked.
  if (cig.t < 0 && cig.afterglow > 0) {
    cig.afterglow -= dt;
    heldCig.group.visible = true;
    wispFromEmber(dt, 0.5);
    if (cig.afterglow <= 0) {
      heldCig.group.visible = false;
      audio.play('cig.stub', { volume: 0.5 });
    }
    return;
  }

  const start = holdingF && st.heldItem === 'cigs' && cig.t < 0 && st.cigsLeft > 0;
  if (start) {
    cig.t = 0;
    cig.lit = false;
    cig.exhaled = false;
    audio.play('cig.light', { volume: 0.75 });
    audio.say('cig.light', { chance: 0.35, delay: 1.4 });
  }

  if (cig.t < 0) {
    if (holdingF && st.heldItem === 'cigs' && st.cigsLeft <= 0) {
      hud.say('Empty pack. You have been through a lot this morning.');
    }
    return;
  }

  // Abandoned before the exhale.
  if (!holdingF && cig.t < CIG_EXHALE) {
    cig.t = -1;
    cig.lit = false;
    heldCig.group.visible = false;
    hud.setHold(null);
    if (!interaction.current) hud.hidePrompt();
    return;
  }

  cig.t += dt;
  hud.showPrompt(cig.t < CIG_DRAG ? 'Lighting…' : cig.t < CIG_EXHALE ? 'Drawing…' : 'Exhaling…', 'F');
  hud.setHold(Math.min(1, cig.t / CIG_DONE));

  if (!cig.lit && cig.t >= CIG_SHOW) {
    cig.lit = true;
    heldCig.group.visible = true;
  }
  if (cig.lit && cig.t >= CIG_DRAG && cig.t < CIG_EXHALE) {
    // Ember flares while you draw on it.
    heldCig.ember.material.emissiveIntensity = 3.4 + Math.sin(elapsed * 22) * 0.6;
    if (Math.abs(cig.t - CIG_DRAG) < dt) audio.play('cig.drag', { volume: 0.7 });
    wispFromEmber(dt, 1.6);
  }

  if (!cig.exhaled && cig.t >= CIG_EXHALE) {
    cig.exhaled = true;
    heldCig.ember.material.emissiveIntensity = 2.0;
    audio.play('cig.exhale', { volume: 0.8 });
    audio.say('cig.drag', { chance: 0.4, delay: 0.9 });
    exhaleCloud();
  }

  if (cig.t >= CIG_DONE) {
    cig.t = -1;
    cig.afterglow = CIG_AFTERGLOW - CIG_DONE;
    hud.setHold(null);
    hud.hidePrompt();

    apartment.consumeCigarette();
    drunk.smoke();
    // Four of these and you will be needing the bathroom.
    apartment.state.bowel = Math.min(1, apartment.state.bowel + 0.26);

    if (st.cigsLeft > 0) {
      hud.setHand({ icon: '🚬', name: `Smokes (${st.cigsLeft})`, hint: 'Hold [F] to light one' });
    } else {
      hud.setHand({ icon: '🚬', name: 'Empty pack', hint: '[Q] bin it' });
      audio.say('cig.last', { delay: 2.6 });
    }
    hud.toast('Steadier — for a bit', 'good');
    hud.say(drunk.level > 0.4
      ? 'Head rush. Then, briefly, the room holds still.'
      : 'Filthy habit. Extremely effective.', 4200);
  }
}

/** Thin wisp curling off the ember, in world space. */
function wispFromEmber(dt, rate) {
  if (Math.random() > dt * rate * 6) return;
  heldCig.ember.getWorldPosition(_v);
  smoke.wisp(_v);
}

/** The big one: a cloud pushed out along your view. */
function exhaleCloud() {
  camera.getWorldPosition(_v);
  camera.getWorldDirection(_dir);
  // Far enough ahead that the cloud reads as a plume rather than fog on the
  // lens, and quick enough that it clears the view on its own.
  _v.addScaledVector(_dir, 0.55);
  _v.y -= 0.07;
  // Many small billows travelling fast reads as a plume; a few big ones just
  // fog the lens.
  smoke.emit(_v, _dir, {
    count: 18, speed: 2.20, spread: 0.26,
    size0: 0.045, size1: 0.38, life: 2.8, peak: 0.22, rise: 0.24,
  });
  // A second, slower burst so the plume has a tail rather than one pop.
  smoke.emit(_v, _dir, {
    count: 10, speed: 0.90, spread: 0.18,
    size0: 0.035, size1: 0.32, life: 4.0, peak: 0.14, rise: 0.18,
  });
}

/* ------------------------------------------------------------------ */
/* Living somewhere with neighbours                                    */
/* ------------------------------------------------------------------ */

/** They start at the same time every night, through the west wall. */
const ARGUMENT_HOUR = 23;
const ARGUMENT_POS = new THREE.Vector3(-5.2, 1.5, 0.6);

let argumentDay = -1;
let argumentUntil = 0;
let nextShoutAt = 0;

function updateNeighbours(dt) {
  const h = time.hour;

  // Kick off once a night, then keep it going for about forty in-game minutes.
  if (h >= ARGUMENT_HOUR && h < ARGUMENT_HOUR + 0.7 && argumentDay !== time.day) {
    argumentDay = time.day;
    argumentUntil = time.minutes + 40;
    nextShoutAt = 0;
    hud.say('Upstairs. Or next door. It is hard to tell through the wall.', 5200);
  }

  if (time.minutes > argumentUntil) return;

  nextShoutAt -= dt;
  if (nextShoutAt <= 0) {
    nextShoutAt = 2.5 + Math.random() * 5.5;
    audio.play('neighbours.argue', {
      position: ARGUMENT_POS, volume: 0.55 + Math.random() * 0.25,
      rate: 0.92 + Math.random() * 0.18, ref: 2.2, maxDist: 14,
    });
    if (Math.random() < 0.22) {
      audio.play('neighbours.thump', { position: ARGUMENT_POS, volume: 0.5, delay: 0.6 });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Farting                                                             */
/* ------------------------------------------------------------------ */

/**
 * Pick a cue, never the same one twice in a row.
 *
 * A fart is funny in a quiet room and merely noise on top of a voice line, so
 * if the floor is busy this defers rather than fires. Deliberate ones are
 * queued and land the moment he stops talking -- pressing the button and
 * getting nothing would read as broken. Involuntary ones are simply dropped;
 * the timer will come round again.
 */
function fart({ voluntary = true } = {}) {
  if (voluntary) narrator.note('fart');
  if (!game.started || game.paused || game.passingOut) return;

  if (audio.busy()) {
    if (voluntary && !game.fartQueued) {
      game.fartQueued = true;
      setTimeout(function retry() {
        if (!game.fartQueued) return;
        if (audio.busy()) { setTimeout(retry, 220); return; }
        game.fartQueued = false;
        fart({ voluntary: true });
      }, 220);
    }
    return;
  }
  game.fartQueued = false;
  let i = (Math.random() * FART_CUES.length) | 0;
  if (i === _lastFart) i = (i + 1 + ((Math.random() * (FART_CUES.length - 1)) | 0)) % FART_CUES.length;
  _lastFart = i;

  // Sitting muffles it; beer makes it worse.
  const gassy = 1 + apartment.state.beersDrunk * 0.08;
  audio.play(FART_CUES[i], {
    volume: (game.seated ? 0.55 : 0.8) * gassy,
    rate: 0.86 + Math.random() * 0.3,
  });
  audio.hold(1.1);
  audio.say('fart', { chance: voluntary ? 0.25 : 0.45, delay: 1.0 });

  // Reset the involuntary timer either way, so a deliberate one buys you time.
  game.fartClock = 0;
  game.nextFartAt = 35 + Math.random() * 70;

  if (!voluntary && Math.random() < 0.35) {
    hud.say(pick([
      'That one arrived without asking.',
      'Nobody heard that. Nobody is here.',
      'Unprompted. Unwelcome. Unavoidable.',
    ]), 3200);
  }
}

function updateFarts(dt) {
  if (game.passingOut) return;
  // The more you have put away, the more often one slips out.
  const rate = 1 + apartment.state.beersDrunk * 0.25 + apartment.state.whiskeyDrunk * 0.2;
  game.fartClock += dt * rate;
  if (game.fartClock >= game.nextFartAt) fart({ voluntary: false });
}

/* ------------------------------------------------------------------ */
/* Zyns                                                                */
/* ------------------------------------------------------------------ */

/**
 * The point of these, mechanically, is that they work in the chair. A
 * cigarette needs both hands and takes you away from the desk; a pouch
 * steadies you without you having to get up, which is exactly why anybody
 * uses them.
 */
const ZYN_MINUTES = 42;   // in-game minutes a pouch lasts

function takeZyn() {
  const st = apartment.state;
  if (!apartment.consumeZyn()) return;

  audio.play('zyn.tin', { position: apartment.zynPos, volume: 0.7 });
  audio.play('zyn.pack', { volume: 0.6, delay: 0.35 });

  // A harder, shorter hit than a cigarette, and no trip to the bathroom.
  drunk.rush = Math.max(drunk.rush, 1.25);
  drunk.steady = Math.max(drunk.steady, 55);
  game.zynUntil = time.minutes + ZYN_MINUTES;

  hud.setHand({ icon: '⚪', name: `Zyn (${st.zynsLeft} left)`, hint: '[Q] bin it' });
  hud.toast('Upper lip. Steady hands.', 'good');
  audio.say('zyn', { chance: 0.7, delay: 1.3 });
  hud.say(st.zynsTaken === 1
    ? 'Tucked in. <em>The room tightens up for a second, then settles.</em>'
    : 'Another one. Your gums have opinions you are ignoring.', 4400);
}

function updateZyn() {
  const st = apartment.state;
  if (!st.lipPacked) return;
  if (time.minutes > game.zynUntil) {
    apartment.dropZyn();
    if (apartment.state.heldItem === null) hud.setHand(null);
    hud.say('That one is done. You barely noticed it go.', 3600);
  }
}

/**
 * A bowl. The world slows down, you slow down, and the camera takes its time
 * catching up with the mouse.
 */
function hitBong() {
  if (game.passingOut) return;
  audio.play('cig.light', { volume: 0.6 });
  audio.play('bong.bubble', { volume: 0.8, delay: 0.5 });
  audio.play('cig.exhale', { volume: 0.6, delay: 2.6 });
  audio.say('bong', { chance: 0.8, delay: 3.4 });
  highs.smokeBong();
  smoke.emit(camera.position, cameraForward(), { count: 14, spread: 0.5, speed: 0.7 });
  hud.toast('That is going to take a minute', 'good');
  hud.say(highs.weed > 0.6
    ? 'Everything has slowed down and you are fine with it.'
    : 'The room gets softer at the edges.', 5200);
}

/** A cap. Nothing happens for a minute and a half, and then it does. */
function eatShrooms() {
  if (game.passingOut) return;
  audio.play('zyn.pack', { volume: 0.5 });
  audio.say('shrooms', { chance: 0.9, delay: 0.8 });
  highs.eatShrooms();
  hud.toast('Nothing is happening', '');
  hud.say('Earthy. Unpleasant. Nothing is happening. '
    + '<em>Nothing is going to happen for a while.</em>', 6000);
}

/** Where the camera is pointing, for anything that needs to come out of it. */
const _fwd = new THREE.Vector3();
function cameraForward() {
  camera.getWorldDirection(_fwd);
  return _fwd;
}

/* ------------------------------------------------------------------ */
/* Getting ready                                                       */
/* ------------------------------------------------------------------ */

const SHOWER_TIME = 9.0;

/**
 * A shower. You step in, it is cold, then it is not, and eight seconds later
 * you are a person who has had a shower.
 */
function takeShower() {
  if (game.showering || game.passingOut) return;
  game.showering = 0;
  interaction.setPaused(true);
  hud.setMode('seated');
  player.mode = 'frozen';

  const st = apartment.showerStand;
  player.sitAt({
    position: new THREE.Vector3(st.x, 1.60, st.z),
    yaw: Math.PI,          // facing the head
    pitch: 0.10,
    dur: 1.1,
    yawRange: 1.2,
    pitchMin: -0.9,
    pitchMax: 0.8,
  }, () => {
    audio.startLoop('shower.run', {
      volume: 0.34, position: apartment.showerHead, ref: 1.2, maxDist: 8,
    });
    showerFx.start(apartment.showerHead);
    audio.say('shower', { chance: 0.9, delay: 1.4 });
    hud.say('Cold. Cold. Cold — <em>there we go.</em>', 4600);
  });
}

function updateShower(dt) {
  if (game.showering === null) return;
  game.showering += dt;
  showerFx.update(dt);

  // Steam, rising off the head rather than out of your face.
  if (game.showering > 1.2 && Math.random() < dt * 9) {
    smoke.wisp(apartment.showerHead);
  }

  if (game.showering >= SHOWER_TIME) {
    game.showering = null;
    audio.stopLoop('shower.run', 0.6);
    showerFx.stop();
    apartment.state.showered = true;
    hud.setMode('walk');
    hud.toast('Clean', 'good');
    hud.say('Right. That is better. That is much better.', 4600);
    player.standFrom(
      new THREE.Vector3(apartment.showerStand.x + 0.55, 0, apartment.showerStand.z + 0.75),
      () => interaction.setPaused(false),
    );
  }
}

const COOK_TIME = 11.0;

/** Two eggs into the pan. They take about as long as eggs take. */
function cookEggs() {
  const st = apartment.state;
  if (st.panState || !st.hasEggs) return;
  st.hasEggs = false;
  st.panState = 'raw';
  game.cooking = 0;
  hud.setHand(null);
  apartment.pan.contents.visible = true;
  audio.play('egg.crack', { volume: 0.8, position: apartment.panPos });
  audio.startLoop('pan.sizzle', {
    volume: 0.26, position: apartment.panPos, ref: 1.1, maxDist: 7,
  });
  hud.say('Two of them, into the pan. Now you wait, which is the part you '
    + 'are actually good at.', 5200);
}

function updateCooking(dt) {
  if (game.cooking === null) return;
  game.cooking += dt;
  if (game.cooking >= COOK_TIME && apartment.state.panState === 'raw') {
    game.cooking = null;
    apartment.state.panState = 'done';
    audio.stopLoop('pan.sizzle', 0.8);
    hud.toast('Eggs are done', 'good');
    hud.say('Done. Arguably over-done. <em>Nobody is inspecting them.</em>', 4600);
  }
}

/** Eaten standing at the counter, out of the pan, like a person. */
function eatEggs() {
  const st = apartment.state;
  if (st.panState !== 'done') return;
  st.panState = null;
  st.fed = true;
  apartment.pan.contents.visible = false;
  audio.play('egg.eat', { volume: 0.7 });
  audio.say('eat', { chance: 0.9, delay: 1.2 });
  hud.toast('Ate the eggs', 'good');
  hud.say('Eaten standing up, out of the pan, at half past whatever. '
    + '<em>Eat those pasture raised eggs folks.</em>', 5600);
}

/* ------------------------------------------------------------------ */
/* Wednesday                                                           */
/* ------------------------------------------------------------------ */

/** How the player finds out there is anything on at all. */
function learnAboutMeeting(source) {
  if (!goals.learn(source)) return;
  audio.play('ui.select', { volume: 0.4 });
  hud.toast('Wednesday, 7 PM', 'good');
  // The radio reads the notice out; he answers it, the way you answer a radio.
  audio.say('notice', { delay: source === 'radio' ? 2.4 : 1.0 });
  narrator.note('meeting');
}

/**
 * You looked at the second monitor properly. If Booski has mentioned tomorrow
 * night by now, that is how you found out.
 */
function readChat() {
  const told = chat.read();
  apartment.state.chatUnread = 0;
  apartment.desk.repaintChat(chat);
  if (told) {
    learnAboutMeeting('the chat');
    hud.say('<em>BOOSKI: wed 7pm. im driving.</em><br>'
      + 'Sent hours ago, to a server where nobody answers.', 6000);
  } else {
    hud.say('Nobody has said anything worth reading yet.', 3600);
  }
}

/** The evaluation context every gate is judged against. */
function goalContext() {
  return {
    state: apartment.state,
    drunkLevel: drunk.level,
    stoned: highs.stoned,
    tripping: highs.tripping,
  };
}

/**
 * The door. It never lists what is missing -- it gives one reason, in his
 * voice, and the reason is whichever thing he would think of first.
 */
function tryLeave() {
  if (game.left || game.passingOut) return;
  const pos = new THREE.Vector3(2.8, 1.1, 4.3);
  const res = goals.tryDoor(goalContext());

  if (res.kind === 'unaware') {
    audio.play('door.locked', { position: pos, volume: 0.8 });
    narrator.note('door');
    hud.say('Outside is a whole thing. There is a fridge and a PC in here.', 4600);
    return;
  }
  if (res.kind === 'go') {
    leaveForTheMeeting();
    return;
  }

  audio.play('door.locked', { position: pos, volume: 0.7 });
  narrator.note('door');
  if (res.vo) audio.say(res.vo, { chance: 0.85, delay: 0.3 });
  hud.say(res.line, 5200);

  // The first time a given excuse comes up, nudge toward where it lives.
  if (res.id && goals.firstTime(res.id)) {
    const WHERE = {
      showered: 'The bathroom is through the north door.',
      dressed: 'There is a drawer in the nightstand.',
      fed: 'There are eggs in the fridge and a pan on the hob.',
      playedCS: 'Counter-Squatch is on the desktop. It will not go well.',
      bladder: 'You know where it is.',
      bowel: 'You definitely know where it is.',
    };
    if (WHERE[res.id]) hud.toast(WHERE[res.id], '');
  }
}

/** Out of the door. This is the end of the game. */
function leaveForTheMeeting() {
  game.left = true;
  const ending = goals.endingFor(goalContext());
  goals.ending = ending;

  interaction.setPaused(true);
  hud.hidePrompt();
  player.clearKeys();
  player.mode = 'frozen';
  audio.say('door.leave', { delay: 0.2 });
  audio.play('door.knob', { volume: 0.8 });
  radio.turnOff?.();

  blackout.querySelector('span').textContent = '';
  blackout.classList.add('on');
  setTimeout(() => showEnding(ending), 2600);
}

/** Wednesday, eight o'clock, and the flat is exactly as it was. */
function missedIt() {
  if (game.left || goals.missed) return;
  goals.missed = true;
  hud.say('<em>Eight o\'clock.</em> That will have started without you.', 6000);
  hud.toast('You missed it', 'bad');
}

function showEnding(kind) {
  const e = ENDINGS[kind] || ENDINGS.clean;
  game.paused = true;
  player.enabled = false;
  // The blackout sits above the overlay, so it has to come off or the card
  // is delivered to a black rectangle.
  blackout.classList.remove('on');
  overlay.classList.remove('hidden');
  overlay.classList.add('ending');
  overlay.querySelector('h1').innerHTML = 'SQUATCH<span>LIFE</span>';
  overlay.querySelector('.tag').textContent = e.title;
  assetStatus.innerHTML = e.body;
  startBtn.textContent = 'Wake up again';
  startBtn.onclick = () => location.reload();
  document.exitPointerLock?.();
}

/* ------------------------------------------------------------------ */
/* The other thing                                                     */
/* ------------------------------------------------------------------ */

const POOP_CUES = ['poop.1', 'poop.2', 'poop.3', 'poop.4'];

function sitOnToilet() {
  if (game.onToilet || game.passingOut) return;
  game.onToilet = true;
  game.poopTime = 0;
  game.nextPlopAt = 0.8;

  interaction.setPaused(true);
  hud.setMode('seated');
  // Lid up before you sit on it, obviously.
  apartment.toiletLid.rotation.x = -1.9;
  audio.play('chair.sit', { volume: 0.5 });

  player.sitAt(
    { position: apartment.toiletSeat.clone(), yaw: Math.PI, pitch: -0.15 },
    () => hud.say('Relief. <em>[Q] to get up.</em>', 4000),
  );
}

function standFromToilet() {
  if (!game.onToilet) return;
  game.onToilet = false;
  hud.setMode('walk');
  apartment.state.flushable = true;
  audio.play('pee.zip', { volume: 0.6 });
  player.standFrom(apartment.toiletStand, () => interaction.setPaused(false));
}

function updateBowel(dt) {
  const st = apartment.state;

  if (game.onToilet) {
    game.poopTime += dt;
    st.bowel = Math.max(0, st.bowel - dt * 0.30);

    game.nextPlopAt -= dt;
    if (game.nextPlopAt <= 0 && st.bowel > 0.02) {
      game.nextPlopAt = 1.2 + Math.random() * 2.4;
      // Roughly one beat in three is a fart rather than the main event, which
      // is how it goes. Sat down and in a tiled room, so it carries.
      if (Math.random() < 0.34) {
        let i = (Math.random() * FART_CUES.length) | 0;
        if (i === _lastFart) i = (i + 1 + ((Math.random() * (FART_CUES.length - 1)) | 0)) % FART_CUES.length;
        _lastFart = i;
        audio.play(FART_CUES[i], { volume: 0.72, rate: 0.8 + Math.random() * 0.4 });
        if (Math.random() < 0.3) {
          audio.play(POOP_CUES[(Math.random() * POOP_CUES.length) | 0], {
            volume: 0.6, rate: 0.9 + Math.random() * 0.25, delay: 0.45 + Math.random() * 0.4,
          });
        }
      } else {
        audio.play(POOP_CUES[(Math.random() * POOP_CUES.length) | 0], {
          volume: 0.7, rate: 0.9 + Math.random() * 0.25,
        });
        if (Math.random() < 0.4) audio.play('toilet.plop', { volume: 0.5, delay: 0.35 });
        // A little punctuation on the way out.
        if (Math.random() < 0.22) {
          let i = (Math.random() * FART_CUES.length) | 0;
          if (i === _lastFart) i = (i + 1) % FART_CUES.length;
          _lastFart = i;
          audio.play(FART_CUES[i], { volume: 0.5, rate: 1.0 + Math.random() * 0.35, delay: 0.7 });
        }
      }
    }
    if (st.bowel <= 0.02 && game.poopTime > 3) {
      st.urgeAnnounced = false;
      if (!game._poopDone) {
        game._poopDone = true;
        audio.say('poop.relief', { delay: 0.6 });
        hud.say('That is that dealt with. <em>[Q] to get up.</em>', 5000);
      }
    }
    return;
  }
  game._poopDone = false;

  if (st.bowel <= 0) return;

  // Rumbles get closer together the longer you ignore it.
  game.rumbleAt -= dt;
  if (game.rumbleAt <= 0) {
    game.rumbleAt = Math.max(4, 16 - st.bowel * 11) * (0.7 + Math.random() * 0.6);
    if (st.bowel > 0.5) {
      audio.play('belly.rumble', { volume: 0.35 + st.bowel * 0.4 });
    }
  }

  if (st.bowel >= 1 && !st.urgeAnnounced) {
    audio.say('poop.urge', { delay: 0.3 });
    st.urgeAnnounced = true;
    audio.play('belly.rumble', { volume: 0.85 });
    hud.toast('You need to go. Now.', 'bad');
    hud.say('Four cigarettes on an empty stomach. <em>The bathroom. Immediately.</em>', 6000);
  }
}

/* ------------------------------------------------------------------ */
/* Relieving yourself                                                  */
/* ------------------------------------------------------------------ */

function startPee() {
  if (game.peeing || game.passingOut) return;
  game.peeing = true;
  game.peeTime = 0;
  stream.resetStats();
  audio.play('pee.zip', { volume: 0.7 });
  audio.startLoop('pee.stream', { volume: 0.0, fade: 0.25 });
  audio.startLoop('pee.miss', { volume: 0.0, fade: 0.25 });
  game.peeHitSnapshot = 0;
  game.peeMissSnapshot = 0;
  game.peeAccuracy = 1;
  hud.say('You are free to look around. <em>[E] or [Q] to stop.</em>', 4200);
}

function stopPee() {
  if (!game.peeing) return;
  game.peeing = false;
  audio.stopLoop('pee.stream', 0.25);
  audio.stopLoop('pee.miss', 0.25);
  audio.play('pee.zip', { volume: 0.6 });

  const s = stream.stats;
  if (s.total > 12) {
    const acc = s.onTarget / s.total;
    audio.say('pee', { chance: 0.6, delay: 0.7 });
    hud.toast(`${Math.round(acc * 100)}% on target`, acc > 0.7 ? 'good' : 'bad');
    hud.say(acc > 0.85
      ? 'Immaculate. Nobody will ever know how well that went.'
      : acc > 0.45
        ? 'Some of that went in. Some of it did not.'
        : 'You have made this room worse. Measurably worse.', 4800);
  }
}

function updatePee(dt) {
  const st = apartment.state;

  // The tank fills over time, faster once you have been drinking.
  if (!game.peeing) {
    st.bladder = Math.min(1, st.bladder + dt * 0.0028 * (1 + st.beersDrunk * 0.5 + st.whiskeyDrunk * 0.4));
  }
  // One meter, showing whichever is more urgent.
  if (st.bowel > st.bladder) hud.setBladder(st.bowel, game.onToilet, 'urgency');
  else hud.setBladder(st.bladder, game.peeing, 'bladder');

  if (!game.peeing) return;

  game.peeTime += dt;
  st.bladder = Math.max(0, st.bladder - dt * 0.075);

  // Ramp in, hold, then taper as the tank empties.
  const ramp = Math.min(1, game.peeTime / 0.45);
  const power = ramp * Math.min(1, 0.25 + st.bladder * 2.2);

  // Where it is landing decides what you hear: bowl water, or tile. Measured
  // over the drops that died this frame, then smoothed -- reading the running
  // total instead would mean an early miss haunts the whole session.
  const s = stream.stats;
  const hit = s.onTarget - game.peeHitSnapshot;
  const miss = (s.onFloor + s.onWall) - game.peeMissSnapshot;
  game.peeHitSnapshot = s.onTarget;
  game.peeMissSnapshot = s.onFloor + s.onWall;
  if (hit + miss > 0) {
    const acc = hit / (hit + miss);
    game.peeAccuracy += (acc - game.peeAccuracy) * Math.min(1, dt * 8);
  }
  const level = 0.10 + power * 0.22;
  audio.setLoopVolume('pee.stream', level * game.peeAccuracy, 0.15);
  audio.setLoopVolume('pee.miss', level * (1 - game.peeAccuracy) * 1.15, 0.15);

  // The stream leaves from hip height but has to go where you are *looking*,
  // so aim at a point on the camera ray rather than copying the camera's
  // direction -- otherwise looking down at the bowl always lands short.
  camera.getWorldPosition(_v);
  camera.getWorldDirection(_dir);
  _aimPoint.copy(_v).addScaledVector(_dir, 1.25);

  _origin.copy(_v).addScaledVector(_dir, 0.18);
  _origin.y -= 0.58;

  _aim.copy(_aimPoint).sub(_origin).normalize();
  stream.emit(_origin, _aim, dt, power);

  if (st.bladder <= 0.001) stopPee();
}

const _pickBag = [];
function pick(list) {
  void _pickBag;
  return list[(Math.random() * list.length) | 0];
}

/* ------------------------------------------------------------------ */
/* Passing out                                                         */
/* ------------------------------------------------------------------ */

/**
 * Lights out. Either the drink takes you (`voluntary` false, which is the
 * usual way it happens) or you decide to lie down and let the day go.
 */
function passOut({ voluntary = false } = {}) {
  if (game.passingOut) return;
  game.passingOut = true;

  player.clearKeys();
  interaction.setPaused(true);
  hud.hidePrompt();
  hud.setHold(null);

  if (game.seated) {
    game.seated = false;
    hud.setMode('walk');
    audio.setMuffle(false);
    radio.setFocusMuffle(false);
  }

  game.sitting = null;
  game.inBed = false;

  if (game.peeing) stopPee();
  if (game.onToilet) {
    game.onToilet = false;
    hud.setMode('walk');
  }

  // Abandon anything mid-drag.
  cig.t = -1;
  cig.afterglow = 0;
  heldCig.group.visible = false;

  player.mode = 'frozen';
  if (voluntary) {
    audio.play('bed.rustle', { volume: 0.5 });
  } else {
    audio.play('drunk.collapse', { volume: 0.85 });
    audio.play('drunk.heartbeat', { volume: 0.6, delay: 0.25 });
    hud.say('Oh. <em>Oh no.</em>');
  }

  blackout.querySelector('span').textContent = voluntary ? '' : 'you should sit down';
  blackout.classList.add('on');

  setTimeout(() => {
    audio.play('drunk.snore', { volume: 0.4 });
    blackout.querySelector('span').textContent = '· · ·';
  }, 2200);

  setTimeout(() => {
    // Wake up in bed, a few hours gone.
    player.layInBed(apartment.bedPose.position, apartment.bedPose.yaw);
    drunk.sleepItOff();
    highs.sleepItOff();
    if (voluntary) {
      // Sleeping on purpose takes you to the next morning, so one night in
      // bed gets you from Tuesday evening to Wednesday.
      const h = time.hour;
      time.skipHours(h < 7 ? 7 - h : 31 - h);
    } else {
      time.skipHours(12);
    }
    apartment.refreshClocks();
    apartment.state.heldItem = null;
    hud.setHand(null);
    game.passingOut = false;
    blackout.querySelector('span').textContent = '';
    blackout.classList.remove('on');
    audio.play('bed.rustle', { volume: 0.5 });
    hud.say(voluntary
      ? `<em>${time.clock12}.</em> Twelve hours. Nothing has changed.`
      : `<em>${time.clock12}.</em> You are in bed. You do not remember the trip.`, 6000);
    setTimeout(() => {
      if (player.mode === 'bed') hud.showPrompt('Get <b>up</b>', 'E');
    }, 3200);
  }, 5200);
}

/** Push the intoxication level into the CSS layer (blur + closing vignette). */
let _fxBlur = -1;
let _fxAmount = -1;
let _fxHue = -1;
let _fxSat = -1;
let _fxBreathe = -1;
let _fxHigh = -1;
function applyDrunkFx() {
  const blur = Math.round(drunk.blur * 20) / 20;
  const amount = Math.round(drunk.vignette * 50) / 50;

  // The other two. Same trick: only touch the DOM when a rounded value moves,
  // because setting a custom property forces a style recalc every time.
  const hue = Math.round(highs.hue * 2) / 2;
  const sat = Math.round(highs.saturate * 100) / 100;
  const breathe = Math.round(highs.breathe * 1000) / 1000;
  const warm = Math.round(highs.warmth * 50) / 50;
  if (hue !== _fxHue) {
    _fxHue = hue;
    document.documentElement.style.setProperty('--trip-hue', `${hue}deg`);
  }
  if (sat !== _fxSat) {
    _fxSat = sat;
    document.documentElement.style.setProperty('--trip-sat', sat);
  }
  if (breathe !== _fxBreathe) {
    _fxBreathe = breathe;
    document.documentElement.style.setProperty('--trip-breathe', breathe);
  }
  if (warm !== _fxHigh) {
    _fxHigh = warm;
    fxHigh.style.setProperty('--high-amount', warm);
  }
  // Only touch the DOM when the value actually changes; setting a CSS custom
  // property every frame forces a style recalc for nothing.
  if (blur !== _fxBlur) {
    _fxBlur = blur;
    document.documentElement.style.setProperty('--drunk-blur', `${blur}px`);
  }
  if (amount !== _fxAmount) {
    _fxAmount = amount;
    fxDrunk.style.setProperty('--drunk-amount', amount);
  }
}

drunk.onHiccup = () => {
  if (game.paused || game.passingOut) return;
  audio.play('drunk.hiccup', { volume: 0.5 });
  drunk.rush = Math.max(drunk.rush, 0.35);
};

/* ------------------------------------------------------------------ */
/* Frame loop                                                          */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);

  // Simulation uses a clamped delta so a hitch cannot tunnel anything, but
  // the time of day rides real elapsed seconds -- a day is 15 real minutes
  // whatever the frame rate is doing.
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  elapsed += dt;

  if (apartment) {
    if (!game.paused) {
      time.update(rawDt);
      renderer.toneMappingExposure = time.exposure;
      scene.fog.color.copy(time.fogColour);
      scene.background.copy(time.fogColour);
      hud.setClock(time.day, time.clock12, time.elapsedReal);
      arcade.setClock?.(time.clock12);

      // The city outside changes character after dark: summer daytime traffic
      // and birds give way to something sparser and further away.
      audio.setLoopVolume('ambience.city.day', 0.02 + time.dayness * 0.13, 1.0);
      audio.setLoopVolume('ambience.city.night', 0.02 + (1 - time.dayness) * 0.12, 1.0);

      // The coffee table slows the world down. Everything that animates runs
      // on scaled time; the clock does not, because a day is fifteen minutes
      // whether or not you have had a bowl.
      highs.update(dt);
      const hdt = dt * highs.timeScale;

      // Intoxication first: the player controller reads sway/impair this frame.
      if (drunk.update(dt)) passOut();
      player.sway = drunk.sway;
      player.impair = game.passingOut ? 0 : Math.max(0, (drunk.level - 0.34) / 0.66);
      arcade.setImpairment?.(drunk.swayStrength);
      applyDrunkFx();

      // Weed rides on top of the drink rather than replacing it.
      player.sway.yaw += highs.sway.yaw;
      player.sway.pitch += highs.sway.pitch;
      player.sway.roll += highs.sway.roll;
      player.moveScale = highs.moveScale;
      player.lookDrag = highs.lookDrag;

      player.update(dt);
      apartment.update(hdt, elapsed);
      updateConsume(dt);
      updatePee(dt);
      updateBowel(dt);
      updateZyn();
      updateShower(hdt);
      updateCooking(hdt);
      updateFarts(dt);
      if (goals.known && !game.left && goals.window === 'missed' && !goals.missed) missedIt();
      updateNeighbours(dt);
      smoke.update(hdt);
      stream.update(hdt);
      radio.update(dt);

      /* Booski keeps typing whether or not anyone is at the desk. Repainting
       * only matters while the tower is on, but the feed advances regardless
       * so the backlog is right whenever you next switch it on. */
      if (chat.update()) {
        apartment.state.chatUnread = chat.unread;
        if (apartment.state.pcOn) {
          apartment.desk.repaintChat(chat);
          audio.play('chat.ping', { position: apartment.deskPose.position, volume: 0.5 });
        }
      }
      narrator.update(dt, {
        busy: game.passingOut || game.seated || game.peeing || game.onToilet
          || cig.t >= 0 || player.mode === 'frozen',
        moving: player.velocity.lengthSq() > 0.04,
      });

      if (game.seated) {
        arcade.update(hdt);
        screenTexture.needsUpdate = true;
      } else {
        interaction.update(dt);
        // Keep the screen alive while the player is across the room.
        if (apartment.state.pcOn) {
          arcade.update(hdt);
          screenTexture.needsUpdate = true;
        }
      }

      // Monitor glow spilling into the room.
      // Getting a game in with the boys means dying to a cheater a few times,
      // which is the only thing Counter-Squatch has ever offered.
      const cs = arcade.app?.id === 'counter' ? arcade.app.deaths : 0;
      if (cs > apartment.state.csDeaths) {
        apartment.state.csDeaths = cs;
        audio.say(cs <= 2 ? 'cs.death.early' : 'cs.death.late', { chance: 0.4, delay: 0.7 });
      }

      const glow = arcade.sampleGlow();
      apartment.screenGlow.color.setHex(glow.colour);
      apartment.screenGlow.intensity +=
        ((apartment.state.pcOn ? glow.intensity : 0) - apartment.screenGlow.intensity) *
        Math.min(1, dt * 6);

      flashlight.intensity += ((game.flashlightOn ? 6 : 0) - flashlight.intensity) * Math.min(1, dt * 10);

      audio.updateListener(camera);
    }
  }

  renderer.render(scene, camera);
}

frame();

/* Pausing the tab should not leave the radio blaring. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.started) audio.setMasterVolume(0);
  else audio.setMasterVolume(0.9);
});
