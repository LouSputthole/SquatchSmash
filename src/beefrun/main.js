/**
 * The Beef Run — boot, wiring, and the frame.
 *
 * A second playable space alongside the apartment, built out of the same parts:
 * the shared audio playback, Hud, InteractionSystem and first-person Player
 * remain the foundation, while Beef Run scopes sample residency and everything
 * mission-specific to this folder. Nothing in `src/core` or `src/world` had to
 * change to make room for it — the flat is the main scene, and this hangs off it.
 */
import * as THREE from 'three';

import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import { SCENE_IDS, createCampaign, navigateCampaign } from '../core/campaign.js';
import { createAirstripStory } from '../core/airstrip-story.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { previewBeefRunCheckpointForLocation } from '../core/preview-mode.js';
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
import { FlightInput, isBrowserReservedChord } from './input.js';
import { BeefAudioEngine, MissionAudio } from './audio.js';
import { DialogueSystem } from './dialogue.js';
import { Preflight } from './preflight.js';
import { MissionController } from './mission.js';
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

const audio = new BeefAudioEngine();
const missionAudio = new MissionAudio(audio);
const hud = new Hud();
const flightHud = new FlightHud();
// Beef Run resets the carried loadout, but keeps the campaign's five-box
// inventory language visible from the apron through the final taxi.
const sceneInventory = new SceneInventoryBar({ slots: 5, visible: false });
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

/* The hold is walkable ground.
 *
 * `world.groundAt` is the only thing that decides how high a walking man
 * stands (floorZones only choose a footstep sound), so a cabin floor 0.76 m up
 * has to come from here or it does not exist. With the ramp down the aeroplane
 * answers first and the terrain answers for everywhere else; with it stowed
 * the aeroplane declines and nothing changes. `resolvePlayer` is the hook
 * `Player._resolve` leaves for scenes whose geometry is rotated, and it keeps
 * a man in the hold from strolling out through the far wall. */
world.groundAt = (x, z) => {
  const deck = aircraft.deckHeightAt(x, z);
  return deck === null ? terrainHeight(x, z) : deck;
};
world.resolvePlayer = (walker, axis, radius) => aircraft.resolveOnDeck(walker, axis, radius);
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
  sceneInventory,
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

const previewCheckpoint = previewBeefRunCheckpointForLocation();
const PREVIEW_CHECKPOINT_LABELS = Object.freeze({
  takeoff: 'RUNWAY TAKEOFF',
  approach: 'EL HUESO APPROACH',
  departure: 'LOADED DEPARTURE',
  return: 'HOME APPROACH',
  landing: 'FINAL LANDING',
});
const game = {
  started: false,
  paused: true,
  difficulty: 'standard',
  resume: null,
  previewCheckpoint,
};

if (previewCheckpoint) {
  const label = PREVIEW_CHECKPOINT_LABELS[previewCheckpoint];
  const tag = overlay.querySelector('.tag');
  if (tag) tag.textContent = `Demo checkpoint: ${label}. Progress on this page is temporary.`;
  startBtn.textContent = `Start ${label.toLowerCase()}`;
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
    if (game.previewCheckpoint && !story.primePreviewFlightCheckpoint(game.previewCheckpoint)) {
      throw new Error(`Could not prepare Beef Run preview checkpoint: ${game.previewCheckpoint}`);
    }
    game.resume = game.previewCheckpoint ?? (started.resumed ? RESUME_CHECKPOINT[started.checkpoint] : null);
  }

  /* Ask for the pointer BEFORE anything is awaited.
   *
   * Pointer lock needs the document's TRANSIENT ACTIVATION, and Chrome expires
   * that about five seconds after the click. Beef Run's Start handler used to
   * `await audio.init()` and `await audio.loadManifest()` first — 269 recorded
   * cues fetched and decoded, measured at 17.3 seconds on this machine — and
   * only then call requestLock(). By that point `navigator.userActivation.isActive`
   * was already false and the request came back
   * "A user gesture is required to request Pointer Lock."
   *
   * The click is the gesture. Spend it here, at the top, and let the samples
   * load behind an already-captured pointer.
   *
   * The title card deliberately STAYS UP through the load. Hiding it here too
   * would put an empty airfield and a hidden cursor in front of the player for
   * fifteen seconds, and "the overlay is gone" is how the rest of the project
   * knows the scene is actually running. */
  requestLock();
  startBtn.disabled = true;
  startBtn.textContent = 'Warming up the aeroplane…';

  await audio.init();
  const sfx = await audio.loadManifest();
  console.info(`[sfx] ${sfx.loaded}/${sfx.total} samples loaded; the rest are synthesised.`);
  missionAudio.init();

  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  sceneInventory.set([]);
  sceneInventory.show();
  // A long load can outlive the lock (an impatient Escape, a tab switch). Ask
  // again now that everything is ready, if the pointer is not already ours.
  if (document.pointerLockElement !== canvas) requestLock();

  if (!game.started) {
    game.started = true;
    mission.begin(game.difficulty);
    audio.startLoop('ambience.city.day', { volume: 0.03, ambience: true, fade: 3 });
    if (game.resume) {
      const restored = game.resume === 'landing'
        ? mission.restorePreviewLanding()
        : mission.restoreCheckpoint(game.resume);
      if (!restored) throw new Error(`Could not restore Beef Run checkpoint: ${game.resume}`);
      const label = PREVIEW_CHECKPOINT_LABELS[game.resume];
      hud.say(game.previewCheckpoint
        ? `<em>Demo checkpoint:</em> ${label}.`
        : '<em>Back where you left it.</em>', 4200);
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
let dragLookHinted = false;

function requestLock() {
  /* Never over the report card. The card has buttons and a locked pointer
   * cannot reach one — `FlightHud.showComplete()` releases the lock for
   * exactly that reason, and anything that takes it back afterwards makes the
   * ending unclickable. This was invisible while the lock was failing on every
   * run; fixing the lock is what made it reachable. */
  if (mission.finished || flightHud.completeUp) return;
  /* Keyboard flight controls do not actually require pointer lock.  Enable
   * them before Chrome settles the pointer-lock promise, otherwise a browser
   * that rejects or delays the lock can leave Shift apparently dead for the
   * first part of a cockpit run. */
  input.enabled = true;
  if (document.pointerLockElement === canvas) { enableInput(); return; }
  /* Drag-look is a FALLBACK, never a life sentence — the same rule the Bada
   * Bing settled on. This used to read `if (dragLook) { enableInput(); return; }`,
   * so one refusal latched the mode permanently and no later click ever asked
   * the browser again. Every attempt asks for the real thing; `pointerlockchange`
   * retires the fallback the moment one is granted. */
  if (dragLook) enableInput();
  const p = canvas.requestPointerLock?.();
  if (p && p.catch) p.catch(() => fallBackToDragLook());
  setTimeout(() => {
    if (document.pointerLockElement !== canvas && !game.paused) fallBackToDragLook();
  }, 600);
}

function fallBackToDragLook() {
  if (document.pointerLockElement === canvas) return;
  if (!dragLook && !dragLookHinted) {
    dragLookHinted = true;
    hud.say('Pointer lock is blocked here — <em>hold the left button to look around.</em> '
      + 'Any click keeps retrying the real thing.', 7000);
  }
  dragLook = true;
  enableInput();
}

function enableInput() {
  player.enabled = !mission.flags.inCockpit;
  input.enabled = true;
  game.paused = false;
  mission.paused = false;
  document.body.classList.remove('unlocked');
  /* Only once the mission is actually running. Drag-look can be settled on
   * while the sample bank is still loading behind the title card, and taking
   * the card down from here would say "playing" fifteen seconds before there
   * is anything to play. */
  if (game.started) overlay.classList.add('hidden');
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) dragLook = false;          // the real thing won; retire the fallback
  player.enabled = (locked || dragLook) && !mission.flags.inCockpit;
  input.enabled = locked || dragLook;
  document.body.classList.toggle('unlocked', !locked && !dragLook);
  // Once the end card is up, losing the lock is the point, not a pause.
  if (!locked && !dragLook && game.started && !mission.finished) pauseGame();
});

/* Every canvas click while unlocked re-attempts REAL pointer lock. The browser
 * may grant it now that this is a fresh user gesture — which is the only way
 * back from a first request that was refused because the sample bank was still
 * loading when it was made. */
canvas.addEventListener('click', () => {
  if (!game.started || game.paused || mission.finished) return;
  if (document.pointerLockElement !== canvas) requestLock();
});

function pauseGame() {
  pauseMenu.pause();
}

const pauseMenu = createPauseMenu({
  title: 'The Beef Run',
  canPause: () => game.started && !mission.finished,
  getObjective: () => document.getElementById('br-objective')?.textContent?.trim()
    || (mission.flags.inCockpit
      ? 'Follow Captain Sasole’s current start-up or flight instruction.'
      : 'Go to Captain Sasole and follow the current mission instruction.'),
  instructions: [
    'On foot: W A S D — move. E — interact.',
    'In the aircraft: W/S — pitch. A/D — roll. Q/E — rudder.',
    'Shift — throttle up. Z — throttle down. F/G — flaps. Hold Space — air brake. B — wheel brakes. V — parking brake.',
    '3 — battery. 4 — fuel. 1/2 — start or stop each engine. Engine 1 is the left one.',
    'C — camera. Restart scene / checkpoint — use the button in this menu.',
    'Tab — pause or resume.',
    'Nothing uses Ctrl or Cmd: with a flight key those are browser shortcuts (Ctrl+W closes the tab) and this page cannot intercept them.',
  ],
  onPause: () => {
    game.paused = true;
    mission.paused = true;
    player.enabled = false;
    input.enabled = false;
    player.clearKeys();
    input.clear();
    interaction.release();
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    game.paused = false;
    mission.paused = false;
    player.enabled = !mission.flags.inCockpit;
    input.enabled = true;
    audio.ctx?.resume?.();
    last = performance.now();
    requestLock();
  },
  /* There is always a recoverable choice in Tab: before flight creates a
   * checkpoint it restarts the scene; afterwards it restores the authored
   * checkpoint. Raw R remains deliberately inert. */
  onRestart: () => {
    if (mission.checkpoint) mission.requestRestart();
    else window.location.reload();
  },
  restartLabel: () => mission.checkpoint ? 'Restart from checkpoint' : 'Restart scene',
  canRestart: () => game.started && !mission.finished,
});

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

/* Capture at document rather than the window. It still wins over focused UI
 * controls, while matching the real keyboard dispatch path Chrome uses for
 * the game canvas and accessibility-focused document. */
/* Reaching for the throttle lever that is not there any more.
 *
 * Ctrl used to lower the throttle, so muscle memory and every stale guide send
 * a pilot's left hand back to it — and Ctrl held with W, D, S, R or T is a
 * browser accelerator the page cannot intercept. Say where the lever went,
 * once, and then not more than every twelve seconds, so the message is a
 * correction rather than a second thing going wrong. */
const CTRL_NUDGE_GAP_MS = 12000;
let lastCtrlNudge = -Infinity;
function nudgeAwayFromBrowserChord() {
  const now = performance.now();
  if (now - lastCtrlNudge < CTRL_NUDGE_GAP_MS) return;
  lastCtrlNudge = now;
  hud.toast('THROTTLE DOWN IS Z — CTRL IS THE BROWSER’S', 'bad', 4200);
}

document.addEventListener('keydown', (e) => {
  if (!game.started) return;
  if (e.code === 'Escape') return;             // pointer lock handles this
  if (game.paused) return;
  if (isBrowserReservedChord(e)) nudgeAwayFromBrowserChord();
  if (e.repeat) return;
  const code = input.keyEvent(e, true);
  if (code === 'Space' || code === 'Shift') e.preventDefault();
  player.setKey(e.code, true);
  if (!mission.flags.inCockpit && e.code === 'KeyE') interaction.press();
}, true);

document.addEventListener('keyup', (e) => {
  const code = input.keyEvent(e, false);
  player.setKey(e.code, false);
  if (!mission.flags.inCockpit && e.code === 'KeyE') interaction.release();
}, true);

/* Do not keep a modifier pressed if Chrome moves focus to its UI or another
 * tab while the player is holding it. */
window.addEventListener('blur', () => {
  dragging = false;
  player.clearKeys();
  input.clear();
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
    case 'help':
      hud.toast(flightHud.toggleControls() ? 'CONTROLS SHOWN' : 'CONTROLS HIDDEN');
      break;
    case 'mute':
      audio.setMasterVolume(audio.master?.gain.value > 0.05 ? 0 : 0.9);
      break;
    case 'pause':
      pauseMenu.toggle();
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
    updateFigure(airstrip.cecilio, dt, inCockpit ? null : player.position);
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
      flightHud.setAirBrake(physics.controls.airBrake);
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
