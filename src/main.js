/**
 * Squatch Smash -- entry point.
 *
 * Boots the renderer, builds the apartment, and owns the top-level state
 * machine: title -> in bed -> walking around -> seated at the PC.
 */
import * as THREE from 'three';
import { AudioEngine } from './core/audio.js';
import { Hud } from './core/hud.js';
import { InteractionSystem } from './core/interaction.js';
import { Player } from './core/player.js';
import { Radio } from './core/radio.js';
import { buildApartment } from './world/apartment.js';
import { createArcade } from './arcade/mount.js';
import { Drunk, BEER_UNITS, WHISKEY_UNITS } from './core/drunk.js';
import { DayNight } from './core/daynight.js';
import { SmokeSystem } from './world/smoke.js';
import { StreamSystem } from './world/stream.js';
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
const blackout = document.getElementById('blackout');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startBtn = document.getElementById('start-btn');
const assetStatus = document.getElementById('asset-status');

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
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
const radio = new Radio(audio, hud);

player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

const time = new DayNight(6 + 4 / 60);
const drunk = new Drunk();
const smoke = new SmokeSystem(scene);
const stream = new StreamSystem(scene);

// The lit cigarette rides on the camera, low and to the right.
const heldCig = makeHeldCigarette();
heldCig.group.position.set(0.17, -0.15, -0.33);
heldCig.group.rotation.set(0.10, -0.40, 0.30);
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
  seated: false,
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
  nextFartAt: 40 + Math.random() * 60,
  fartClock: 0,
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
  apartment = await buildApartment({
    scene,
    audio,
    hud,
    interaction,
    time,
    onSitPC: sitAtPC,
    onStartPee: startPee,
    onSitToilet: sitOnToilet,
    onZyn: takeZyn,
    onRadioToggle: () => radio.toggle(),
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

  loading.classList.add('hidden');

  // Dev handle: lets you inspect and pose the scene from the console, e.g.
  //   __squatch.teleport(0, 2, 'north')
  window.__squatch = {
    scene, camera, renderer, player, apartment, arcade, audio, radio, game, interaction,
    drunk, smoke, stream, cig, time, passOut, fart, startPee, stopPee,
    sitOnToilet, standFromToilet, takeZyn,
    teleport(x, z, facing = 'north') {
      const yaws = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };
      // Skipping the wake-up also skips the point where interaction resumes.
      interaction.setPaused(false);
      player.mode = 'walk';
      player.pitchMin = -Math.PI / 2 + 0.05;
      player.pitchMax = Math.PI / 2 - 0.05;
      player.yawCenter = null;
      player.position.set(x, 1.66, z);
      player.eyeHeight = 1.66;
      player.pitch = 0;
      player.yaw = typeof facing === 'number' ? facing : (yaws[facing] ?? 0);
      player.update(0.016);
    },
  };
}

boot().catch((err) => {
  console.error(err);
  loading.querySelector('span').textContent = 'Failed to load — check the console.';
});

/* ------------------------------------------------------------------ */
/* Start / pause                                                       */
/* ------------------------------------------------------------------ */

startBtn.addEventListener('click', async () => {
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
    hud.say('<em>6:04 AM.</em> You are awake. That was not the plan.', 5200);
    setTimeout(() => {
      if (player.mode === 'bed') hud.showPrompt('Get <b>up</b>', 'E');
    }, 3600);
  }
  game.paused = false;
});

function requestLock() {
  canvas.requestPointerLock?.();
}

document.addEventListener('pointerlockchange', () => {
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
  overlay.querySelector('h1').innerHTML = 'PAUSED<span>SQUATCH SMASH</span>';
  overlay.querySelector('.tag').textContent = game.seated
    ? 'Still at the desk. The squatch can wait.'
    : 'The fridge is not going anywhere.';
  startBtn.textContent = 'Resume';
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

document.addEventListener('mousemove', (e) => {
  if (!player.enabled || game.paused) return;
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
  if (game.seated) arcade.onClick(true);
  else interaction.press();
});

document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
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
      if (player.mode === 'bed') getUp();
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
  hud.hidePrompt();
  audio.play('bed.creak', { volume: 0.7 });
  audio.play('bed.rustle', { volume: 0.6, delay: 0.2 });
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

  if (game.drinking === 0) audio.play('can.crack', { volume: 0.8 });
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

/** Pick a cue, never the same one twice in a row. */
function fart({ voluntary = true } = {}) {
  if (!game.started || game.paused || game.passingOut) return;
  let i = (Math.random() * FART_CUES.length) | 0;
  if (i === _lastFart) i = (i + 1 + ((Math.random() * (FART_CUES.length - 1)) | 0)) % FART_CUES.length;
  _lastFart = i;

  // Sitting muffles it; beer makes it worse.
  const gassy = 1 + apartment.state.beersDrunk * 0.08;
  audio.play(FART_CUES[i], {
    volume: (game.seated ? 0.55 : 0.8) * gassy,
    rate: 0.86 + Math.random() * 0.3,
  });

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
      audio.play(POOP_CUES[(Math.random() * POOP_CUES.length) | 0], {
        volume: 0.7, rate: 0.9 + Math.random() * 0.25,
      });
      if (Math.random() < 0.4) audio.play('toilet.plop', { volume: 0.5, delay: 0.35 });
    }
    if (st.bowel <= 0.02 && game.poopTime > 3) {
      st.urgeAnnounced = false;
      if (!game._poopDone) {
        game._poopDone = true;
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
  hud.say('You are free to look around. <em>[E] or [Q] to stop.</em>', 4200);
}

function stopPee() {
  if (!game.peeing) return;
  game.peeing = false;
  audio.stopLoop('pee.stream', 0.25);
  audio.play('pee.zip', { volume: 0.6 });

  const s = stream.stats;
  if (s.total > 12) {
    const acc = s.onTarget / s.total;
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
  audio.setLoopVolume('pee.stream', 0.10 + power * 0.22, 0.15);

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

function passOut() {
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
  audio.play('drunk.collapse', { volume: 0.85 });
  audio.play('drunk.heartbeat', { volume: 0.6, delay: 0.25 });
  hud.say('Oh. <em>Oh no.</em>');

  blackout.querySelector('span').textContent = 'you should sit down';
  blackout.classList.add('on');

  setTimeout(() => {
    audio.play('drunk.snore', { volume: 0.4 });
    blackout.querySelector('span').textContent = '· · ·';
  }, 2200);

  setTimeout(() => {
    // Wake up in bed, a few hours gone.
    player.layInBed(apartment.bedPose.position, apartment.bedPose.yaw);
    drunk.sleepItOff();
    time.skipHours(12);
    apartment.refreshClocks();
    apartment.state.heldItem = null;
    hud.setHand(null);
    game.passingOut = false;
    blackout.querySelector('span').textContent = '';
    blackout.classList.remove('on');
    audio.play('bed.rustle', { volume: 0.5 });
    hud.say(`<em>${time.clock12}.</em> You are in bed. You do not remember the trip.`, 6000);
    setTimeout(() => {
      if (player.mode === 'bed') hud.showPrompt('Get <b>up</b>', 'E');
    }, 3200);
  }, 5200);
}

/** Push the intoxication level into the CSS layer (blur + closing vignette). */
let _fxBlur = -1;
let _fxAmount = -1;
function applyDrunkFx() {
  const blur = Math.round(drunk.blur * 20) / 20;
  const amount = Math.round(drunk.vignette * 50) / 50;
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

      // The city outside changes character after dark: summer daytime traffic
      // and birds give way to something sparser and further away.
      audio.setLoopVolume('ambience.city.day', 0.02 + time.dayness * 0.13, 1.0);
      audio.setLoopVolume('ambience.city.night', 0.02 + (1 - time.dayness) * 0.12, 1.0);

      // Intoxication first: the player controller reads sway/impair this frame.
      if (drunk.update(dt)) passOut();
      player.sway = drunk.sway;
      player.impair = game.passingOut ? 0 : Math.max(0, (drunk.level - 0.34) / 0.66);
      arcade.setImpairment?.(drunk.swayStrength);
      applyDrunkFx();

      player.update(dt);
      apartment.update(dt, elapsed);
      updateConsume(dt);
      updatePee(dt);
      updateBowel(dt);
      updateZyn();
      updateFarts(dt);
      updateNeighbours(dt);
      smoke.update(dt);
      stream.update(dt);

      if (game.seated) {
        arcade.update(dt);
        screenTexture.needsUpdate = true;
      } else {
        interaction.update(dt);
        // Keep the screen alive while the player is across the room.
        if (apartment.state.pcOn) {
          arcade.update(dt);
          screenTexture.needsUpdate = true;
        }
      }

      // Monitor glow spilling into the room.
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
