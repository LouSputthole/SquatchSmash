/**
 * The Beef Run — boot, wiring, and the frame.
 *
 * A second playable space alongside the apartment, built out of the same parts:
 * the apartment's AudioEngine, Hud, InteractionSystem and first-person Player
 * are imported unchanged, and everything specific to the mission lives in this
 * folder. Nothing in `src/core` or `src/world` had to change to make room for
 * it, which is the point — the flat is the main scene, and this hangs off it.
 */
import * as THREE from 'three';

import { AudioEngine } from '../core/audio.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import { SCENE_IDS, createCampaign, navigateCampaign } from '../core/campaign.js';
import { createAirstripStory } from '../core/airstrip-story.js';
import { roomEnvironment } from '../world/textures.js';

import { WP, EH, AC, DIFFICULTY } from './config.js';
import { TerrainStreamingSystem, terrainHeight } from './terrain.js';
import { AircraftPhysics } from './physics.js';
import { EngineSystem } from './engines.js';
import { Brushrunner } from './aircraft.js';
import { WeatherSystem } from './weather.js';
import { DetectionSystem } from './detection.js';
import { CargoWeightSystem } from './cargo.js';
import { buildAirfield } from './airfield.js';
import { buildAirstrip } from './airstrip.js';
import { buildLandmarks } from './landmarks.js';
import { FlightHud } from './hud.js';
import { CameraManager } from './cameras.js';
import { FlightInput } from './input.js';
import { MissionAudio } from './audio.js';
import { DialogueSystem } from './dialogue.js';
import { Preflight } from './preflight.js';
import { MissionController, PREVIEW_SKIP_PHASES } from './mission.js';
import { makeLou, makeOldStove, updateFigure, updateDog, updateCrow, speak } from './npc.js';
import { clamp } from './util.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const loading = document.getElementById('loading');
const diffButtons = [...document.querySelectorAll('[data-difficulty]')];

window.__squatchStage?.('Building the aeroplane…');

/* ------------------------------------------------------------------ */
/* Renderer                                                           */
/* ------------------------------------------------------------------ */

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  window.__squatchFail?.('This browser cannot open WebGL', err?.message || String(err));
  throw err;
}
// The airstrip's procedural terrain, clouds and shadowed aircraft are already
// the expensive part of the frame. A 2x retina backbuffer turned the direct
// preview into a 3 FPS slideshow on ordinary laptops, so cap it at a practical
// quality level instead of spending four times the pixels on the same scene.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// Corrugated tin, fuel drums, the aeroplane's bare skin — three dozen materials
// out here run metalness above zero, and metal with nothing to reflect renders
// black no matter how bright the sun is. Same prefiltered capture the flat and
// the other scenes use, dialled down because this one is outdoors.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const src = roomEnvironment();
  scene.environment = pmrem.fromEquirectangular(src).texture;
  scene.environmentIntensity = 0.4;
  pmrem.dispose();
  src.dispose();
}

const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 9000);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ */
/* Systems                                                            */
/* ------------------------------------------------------------------ */

/* The campaign owns the save. Entering the page claims the scene; the story
 * class gates the mission on Booskibro's answered call and records checkpoints,
 * cargo, detection, and completion against Captain Lou Sasole's mission. In
 * preview mode createCampaign() gives page-local memory storage instead. */
const campaign = createCampaign();
const story = createAirstripStory({ campaign });

const audio = new AudioEngine();
const missionAudio = new MissionAudio(audio);
const hud = new Hud();
const flightHud = new FlightHud();
const interaction = new InteractionSystem(camera, hud);
// The flat has a floor at zero; this place has mountains. The player rides
// whatever world.groundAt returns, exactly like the Bing's stage.
const world = { colliders: [], floorZones: [], groundAt: terrainHeight };
const player = new Player(camera, world);
player.mode = 'walk';
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

const terrain = new TerrainStreamingSystem(scene);
const weather = new WeatherSystem(scene, renderer);
const landmarks = buildLandmarks(scene);
const airfield = buildAirfield(scene, { terrain });
const airstrip = buildAirstrip(scene);
world.colliders.push(...airfield.colliders, ...airstrip.colliders);
world.floorZones.push(...airfield.floorZones, ...airstrip.floorZones);

const physics = new AircraftPhysics({ getHeight: terrainHeight });
const engines = new EngineSystem();
physics.engines = engines;

const aircraft = new Brushrunner();
scene.add(aircraft.group);
const cargo = new CargoWeightSystem(aircraft.group);
cargo.showMarkers(false);

const detection = new DetectionSystem(scene, { towers: landmarks.towers });
const cameras = new CameraManager(camera);
const input = new FlightInput();
const dialogue = new DialogueSystem(hud, {
  audio: missionAudio,
  onLine: (line) => {
    if (line.who === 'SASOLE') speak(lou, (line.hold ?? 2) * 0.8);
    else if (line.who === 'CECILIO') speak(airstrip.cecilio, (line.hold ?? 2) * 0.8);
    else if (line.who === 'STOVE') speak(stove, (line.hold ?? 2) * 0.8);
  },
});

const lou = makeLou();
scene.add(lou.group);
const stove = makeOldStove();
scene.add(stove.group);

const preflight = new Preflight({ scene, interaction, aircraft, dialogue, audio: missionAudio });

const mission = new MissionController({
  scene, camera, renderer, hud, flightHud, dialogue, audio: missionAudio, input,
  cameras, player, interaction, physics, engines, aircraft, cargo, weather,
  detection, terrain, airfield, airstrip, landmarks, lou, stove, preflight,
  story,
});

// Terrain starts when the mission does. Calling `prime()` here synchronously
// built 121 chunks (and their forest scatter) before the title card could
// receive a click, which made the direct preview look frozen.

window.__beefrun = {
  mission, physics, engines, cargo, detection, weather, aircraft, terrain,
  player, cameras, dialogue, interaction, input, audio: missionAudio, hud, flightHud,
  campaign, story,
  get campaignState() { return campaign.state; },
};

// Tell the page watchdog the module has finished booting before the first
// animation frame can do any scene work.
window.__squatch = window.__squatch || {};
window.__squatch.beefrun = true;

/* ------------------------------------------------------------------ */
/* Start / pause                                                      */
/* ------------------------------------------------------------------ */

const game = { started: false, paused: true, difficulty: 'standard', resume: null };
const isPreview = new URLSearchParams(location.search).get('preview') === '1';
const previewSkips = document.getElementById('br-preview-skips');
let pendingPreviewSkip = null;

if (isPreview && previewSkips) {
  const allowed = new Set(PREVIEW_SKIP_PHASES.map((entry) => entry.id));
  previewSkips.classList.remove('hidden');
  previewSkips.addEventListener('click', (event) => {
    const button = event.target.closest('[data-beefrun-skip]');
    const id = button?.dataset.beefrunSkip;
    if (!allowed.has(id)) return;
    pendingPreviewSkip = id;
    if (!game.started) {
      startBtn.click();
      return;
    }
    mission.previewSkip(id);
    pendingPreviewSkip = null;
    game.paused = false;
    mission.paused = false;
    overlay.classList.add('hidden');
    hud.toast(`PREVIEW — ${button.textContent.trim().toUpperCase()}`);
    requestLock();
  });
}

for (const btn of diffButtons) {
  btn.addEventListener('click', () => {
    game.difficulty = btn.dataset.difficulty;
    for (const b of diffButtons) b.classList.toggle('on', b === btn);
  });
}
diffButtons.find((b) => b.dataset.difficulty === 'standard')?.classList.add('on');

/* Why the mission cannot start, in the door's one-excuse voice. */
const UNAVAILABLE = {
  already_complete: 'The jerky is delivered. The Captain has nothing else for you today.',
  squatchfather_incomplete: 'The restaurant job comes first.',
  booski_call_incomplete: 'Booskibro has not called about this yet.',
  mission_locked: 'Nobody has told you about an airstrip.',
};

/* Campaign checkpoints map onto the mission's own restore points. `airstrip`
 * is the on-foot arrival, which is what begin() already gives you. */
const RESUME_CHECKPOINT = {
  remote_strip: 'approach',
  returning: 'departure',
  landed_home: 'return',
};

startBtn.addEventListener('click', async () => {
  if (!game.started) {
    const started = story.begin();
    if (!started.ok) {
      const tag = overlay.querySelector('.tag');
      if (tag) tag.textContent = UNAVAILABLE[started.reason] ?? 'The airstrip is quiet today.';
      startBtn.disabled = true;
      startBtn.textContent = 'Mission unavailable';
      return;
    }
    if (campaign.state.scene.id !== SCENE_IDS.AIRSTRIP_SMUGGLING) {
      campaign.enter(SCENE_IDS.AIRSTRIP_SMUGGLING, { spawn: 'hangar' });
    }
    game.resume = started.resumed ? RESUME_CHECKPOINT[started.checkpoint] : null;
  }

  await audio.init();
  const sfx = await audio.loadManifest();
  console.info(`[sfx] ${sfx.loaded}/${sfx.total} samples loaded; the rest are synthesised.`);
  missionAudio.init();

  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  requestLock();

  if (!game.started) {
    game.started = true;
    mission.begin(game.difficulty);
    audio.startLoop('ambience.city.day', { volume: 0.03, ambience: true, fade: 3 });
    if (pendingPreviewSkip) {
      mission.previewSkip(pendingPreviewSkip);
      pendingPreviewSkip = null;
      hud.say('<em>Preview checkpoint loaded.</em>', 2600);
    } else if (game.resume) {
      mission.restoreCheckpoint(game.resume);
      hud.say('<em>Back where you left it.</em>', 4200);
    } else {
      hud.say('<em>Whispering Pines Municipal.</em> Captain Sasole is by the aeroplane.', 5200);
    }
  }
  game.paused = false;
  mission.paused = false;
});

document.getElementById('br-home')?.addEventListener('click', () => {
  navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door' });
});

let dragLook = false;
let dragging = false;

function requestLock() {
  if (dragLook) { enableInput(); return; }
  const p = canvas.requestPointerLock?.();
  if (p && p.catch) p.catch(() => fallBackToDragLook());
  setTimeout(() => {
    if (!dragLook && document.pointerLockElement !== canvas && !game.paused) fallBackToDragLook();
  }, 600);
}

function fallBackToDragLook() {
  if (dragLook) return;
  dragLook = true;
  enableInput();
  hud.say('Pointer lock is blocked here — <em>hold the left button to look around.</em>', 7000);
}

function enableInput() {
  player.enabled = !mission.flags.inCockpit;
  input.enabled = true;
  game.paused = false;
  mission.paused = false;
  document.body.classList.remove('unlocked');
  overlay.classList.add('hidden');
}

document.addEventListener('pointerlockchange', () => {
  if (dragLook) return;
  const locked = document.pointerLockElement === canvas;
  player.enabled = locked && !mission.flags.inCockpit;
  input.enabled = locked;
  document.body.classList.toggle('unlocked', !locked);
  // Once the end card is up, losing the lock is the point, not a pause.
  if (!locked && game.started && !mission.finished) pauseGame();
});

function pauseGame() {
  game.paused = true;
  mission.paused = true;
  player.clearKeys();
  input.clear();
  interaction.release();
  overlay.classList.remove('hidden');
  overlay.querySelector('h1').innerHTML = 'PAUSED<span>THE BEEF RUN</span>';
  startBtn.textContent = 'Resume';
}

/* ------------------------------------------------------------------ */
/* Input                                                              */
/* ------------------------------------------------------------------ */

document.addEventListener('mousemove', (e) => {
  if (game.paused) return;
  if (dragLook && !dragging) return;
  if (mission.flags.inCockpit) cameras.look(e.movementX, e.movementY);
  else if (player.enabled) player.handleMouseMove(e.movementX, e.movementY);
});

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  if (game.paused) return;
  if (!mission.flags.inCockpit) interaction.press();
});

document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  dragging = false;
  if (!mission.flags.inCockpit) interaction.release();
});

document.addEventListener('keydown', (e) => {
  if (!game.started) return;
  if (e.code === 'Escape') return;             // pointer lock handles this
  if (game.paused) return;
  if (e.repeat) return;
  if (e.code === 'Space') e.preventDefault();
  player.setKey(e.code, true);
  input.key(e.code, true);
  if (!mission.flags.inCockpit && e.code === 'KeyE') interaction.press();
});

document.addEventListener('keyup', (e) => {
  player.setKey(e.code, false);
  input.key(e.code, false);
  if (!mission.flags.inCockpit && e.code === 'KeyE') interaction.release();
});

input.onAction = (name) => {
  switch (name) {
    case 'camera':
      if (mission.flags.inCockpit) {
        const v = cameras.cycle();
        hud.toast(`${v.toUpperCase()} VIEW`);
      }
      break;
    case 'flapsDown':
      if (mission.flags.inCockpit) {
        flightHud.setFlaps(input.stepFlaps(1));
        missionAudio.play('closet.slide', { volume: 0.4 });
      }
      break;
    case 'flapsUp':
      if (mission.flags.inCockpit) {
        flightHud.setFlaps(input.stepFlaps(-1));
        missionAudio.play('closet.slide', { volume: 0.35 });
      }
      break;
    case 'parkingBrake':
      input.parkingBrake = !input.parkingBrake;
      hud.toast(input.parkingBrake ? 'PARKING BRAKE SET' : 'PARKING BRAKE OFF');
      missionAudio.play('switch.click', { volume: 0.6 });
      break;
    case 'battery':
      engines.masterBattery = !engines.masterBattery;
      missionAudio.play('switch.click', { volume: 0.7 });
      hud.toast(engines.masterBattery ? 'BATTERY ON' : 'BATTERY OFF');
      break;
    case 'fuel':
      engines.fuelSelectors = !engines.fuelSelectors;
      missionAudio.play('switch.click', { volume: 0.6 });
      hud.toast(engines.fuelSelectors ? 'FUEL SELECTORS OPEN' : 'FUEL OFF');
      break;
    case 'startLeft':
    case 'startRight': {
      const i = name === 'startLeft' ? 0 : 1;
      if (engines.engines[i].running) engines.kill(i);
      else {
        const r = engines.crank(i);
        if (r === 'nopower') hud.toast('NO POWER — BATTERY OFF');
        else if (r === 'nofuel') hud.toast('NO FUEL TO THE ENGINE');
      }
      break;
    }
    case 'restart':
      mission.requestRestart();
      break;
    case 'help':
      hud.toast(flightHud.toggleControls() ? 'CONTROLS SHOWN' : 'CONTROLS HIDDEN');
      break;
    case 'mute':
      audio.setMasterVolume(audio.master?.gain.value > 0.05 ? 0 : 0.9);
      break;
    case 'pause':
      break;
    default:
      break;
  }
};

/* ------------------------------------------------------------------ */
/* Frame                                                              */
/* ------------------------------------------------------------------ */

let last = performance.now();
loading?.classList.add('hidden');

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  // The ending keeps the world alive under the player's control until the
  // report card is up; then the whole simulation freezes rather than stepping
  // physics, weather and streaming behind an opaque card forever.
  if (game.started && !game.paused && !flightHud.completeUp) {
    input.update(dt);

    const inCockpit = mission.flags.inCockpit;
    if (inCockpit) {
      input.applyTo(physics.controls);
      engines.setThrottle(0, physics.controls.throttleL);
      engines.setThrottle(1, physics.controls.throttleR);
      engines.update(dt, physics.tas);
      physics.advance(dt);
      if (!dragging && !document.pointerLockElement) cameras.recentre(dt);
    } else {
      // On foot. The aeroplane still needs its engines ticked over so a running
      // aeroplane on the strip keeps making noise while you walk around it.
      engines.update(dt, 0);
      player.update(dt);
      interaction.update(dt);
    }

    aircraft.syncTo(physics);
    aircraft.update(dt, physics, engines, {
      cargoDoorOpen: mission.activeLoad?.doorOpen ?? false,
      dusk: weather.dusk > 0.4,
      gLat: mission.lateralG?.() ?? 0,
      roughness: physics.gust.length() * 0.06,
    });

    // Sound follows the aeroplane.
    for (let i = 0; i < 2; i++) {
      const e = engines.engines[i];
      missionAudio.setEngine(i, { rpm: e.rpm, running: e.running, roughness: e.roughness, health: e.health });
    }
    missionAudio.setAirspeed(inCockpit ? physics.tas : 0);
    missionAudio.setRain(weather.rain);

    const focus = inCockpit ? physics.position : player.position;
    terrain.update(focus.x, focus.z, dt);
    weather.update(dt, focus);
    landmarks.update(dt, focus);
    airfield.update(dt, 0.4 + weather.crosswind * 0.1, 0);
    airstrip.update(dt, {
      propWash: engines.anyRunning && physics.position.z < -8000 ? physics.position : null,
    });
    for (const c of airfield.crows) updateCrow(c, dt);
    updateDog(airfield.dog, dt, WP.elev);
    for (const g of airstrip.guards) updateFigure(g, dt, null);
    updateFigure(airstrip.cecilio, dt, null);
    for (const a of mission.associates) updateFigure(a, dt, null);
    updateFigure(stove, dt, inCockpit ? null : player.position);

    dialogue.update(dt);
    mission.update(dt);

    if (inCockpit) {
      cameras.update(dt, physics, aircraft.group, aircraft.pilotEye, {
        roughness: physics.gust.length() * 0.05 + (physics.onGround ? physics.groundSpeed * 0.01 : 0),
        gLoad: physics.gLoad,
      });
      flightHud.setFlight(physics, { fuel: engines.fuel / AC.fuelMass });
      flightHud.setEngines(engines);
      flightHud.setCargo(cargo);
      flightHud.setFlaps(physics.controls.flaps);
    }
    audio.updateListener(camera);
  }

  renderer.render(scene, camera);
}

frame();

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.started) audio.setMasterVolume(0);
  else if (game.started) audio.setMasterVolume(0.9);
});

void clamp; void DIFFICULTY; void EH; void THREE;
