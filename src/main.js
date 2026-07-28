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

const DRINK_TIME = 2.4;

const canvas = document.getElementById('scene');
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
  radioLookKey: false,
};

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  apartment = await buildApartment({
    scene,
    audio,
    hud,
    interaction,
    onSitPC: sitAtPC,
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
    audio.startLoop('ambience.city', { volume: 0.10, ambience: true });
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
      else interaction.press();
      break;
    case 'KeyT':
      game.flashlightOn = !game.flashlightOn;
      audio.play('switch.click', { volume: 0.5 });
      break;
    case 'KeyR':
      if (interaction.current && interaction.current.name === 'radio') radio.next();
      break;
    case 'KeyQ':
      dropHeld();
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
/* Beer                                                                */
/* ------------------------------------------------------------------ */

function dropHeld() {
  const st = apartment.state;
  if (!st.heldItem) return;
  if (st.heldItem === 'empty') {
    audio.play('can.crush', { volume: 0.6 });
    hud.toast('Crushed the can', '');
  } else {
    audio.play('can.set', { volume: 0.5 });
  }
  st.heldItem = null;
  hud.setHand(null);
}

function updateDrinking(dt) {
  const st = apartment.state;
  const wantsDrink = player.keys.has('KeyF') && st.heldItem === 'beer' && !game.seated;

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
    arcade.grantBuff?.(1);
    hud.setHand({ icon: '🥫', name: 'Empty can', hint: '[Q] crush it' });
    hud.toast('Steady hands — +1 slow-mo charge at the PC', 'good');
    hud.say('Cold. Immediate. <em>Your aim feels better already.</em>', 4200);
  }
}

/* ------------------------------------------------------------------ */
/* Frame loop                                                          */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);

  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (apartment) {
    if (!game.paused) {
      player.update(dt);
      apartment.update(dt, elapsed);
      updateDrinking(dt);

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
