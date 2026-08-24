import * as THREE from 'three';

import { createArcade } from '../arcade/mount.js';
import { BETS, Blackjack } from '../bing/blackjack.js';
import { AudioEngine } from '../core/audio.js';
import { DayNight } from '../core/daynight.js';
import { FocusRush } from '../core/focus-rush.js';
import { Highs } from '../core/highs.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { Phone } from '../core/phone.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { Player } from '../core/player.js';
import { Radio } from '../core/radio.js';
import { applyBody, translateKey } from '../core/settings.js';
import { Tv } from '../core/tv.js';
import { createBongBehavior } from '../world/bong.js';
import { ShowerSystem } from '../world/shower.js';
import { SmokeSystem } from '../world/smoke.js';
import { buildLuxuryApartment } from './world.js';
import {
  LuxuryAnsweringMachineRuntime,
  LuxuryCrookedArtRuntime,
  LuxuryDarts,
  LuxuryInventoryRuntime,
  LuxuryRevolverRuntime,
  LuxuryToiletRuntime,
  createFloorAwarePlayerWorld,
  paintLuxuryGamePanel,
  restoreWalkingPose,
  teleportToSpawn,
  validateLuxuryWorld,
} from './runtime.js';

applyBody();

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startButton = document.getElementById('start-btn');
const postureEl = document.getElementById('posture');
const postureLabel = postureEl.querySelector('span');
const restCurtain = document.getElementById('luxury-rest');
const gamePanel = document.getElementById('luxury-game-panel');
const fxHigh = document.getElementById('fx-high');
const fxTrip = document.getElementById('fx-trip');
const chromaOffsets = document.querySelectorAll('#chroma feOffset');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
attachPixelRatio(renderer);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101722);
scene.fog = new THREE.FogExp2(0x101722, 0.0065);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.045, 180);
camera.name = 'luxury-apartment.camera';
scene.add(camera);

/* A late-game evening, but not a campaign assignment. DayNight supplies the
 * same clock/lighting language as both existing homes; sleep advances only
 * this developer-preview session. */
const time = new DayNight(20.5);
time.setTime(8, 20 * 60 + 30);
const hud = new Hud();
const interaction = new InteractionSystem(camera, hud);
const audio = new AudioEngine();
const tv = new Tv({ audio });
const radio = new Radio(audio, hud, time, {
  venue: 'luxury_apartment',
  canPlayNotice: () => false,
  output: 0.88,
});
const phone = new Phone({
  time,
  audio,
  calls: [],
  onCallState: (connected) => radio.setPhoneDucked(connected),
});
const showerFx = new ShowerSystem(scene);
const smoke = new SmokeSystem(scene);
const highs = new Highs();
const focusRush = new FocusRush({ baseFov: camera.fov });
const darts = new LuxuryDarts({ hud, audio, panel: gamePanel });
const cameraDirection = new THREE.Vector3();
const bongBehavior = createBongBehavior({
  audio,
  highs,
  smoke,
  origin: () => camera.getWorldPosition(new THREE.Vector3()),
  direction: () => camera.getWorldDirection(cameraDirection),
  hud,
});

const state = {
  phase: 'menu',
  paused: false,
  elapsed: 0,
  posture: null,
  resting: false,
  showering: false,
  showerTime: 0,
  cooking: 'idle',
  cookingTime: 0,
  fed: false,
  outfit: 0,
  money: 2500,
  fridgeBeer: 5,
  fridgeSlices: 2,
  sleepCount: 0,
  activeArcade: null,
  activeArcadeScreen: null,
  cabinetBooted: false,
};

/* Framed SquatchOS apps need the ordinary DOM cursor. Returning to the OS
 * desktop must reclaim pointer lock while Tony is still seated, otherwise
 * native canvas apps and the desktop stop receiving relative mouse input. */
function onArcadeInputModeChange(mode) {
  if (mode === 'dom') document.exitPointerLock?.();
  else if (state.activeArcade && state.phase === 'active' && !state.paused
    && !state.resting && !state.showering) requestGamePointerLock();
}

const pcArcade = createArcade({ audio, onInputModeChange: onArcadeInputModeChange });
const cabinetArcade = createArcade({ audio, onInputModeChange: onArcadeInputModeChange });

let home = null;
let player = null;
let inventoryRuntime = null;
let blackjack = null;
let toilet = null;
let crookedArt = null;
let answeringMachine = null;
let revolver = null;
let lastFrame = performance.now();

function worldPoint(object, fallback = new THREE.Vector3()) {
  if (object?.getWorldPosition) return object.getWorldPosition(new THREE.Vector3());
  if (object?.position) return new THREE.Vector3().copy(object.position);
  return fallback.clone?.() ?? new THREE.Vector3(fallback.x ?? 0, fallback.y ?? 0, fallback.z ?? 0);
}

function mountCanvas(screen, sourceCanvas) {
  if (!screen?.isMesh || !sourceCanvas) return null;
  const texture = new THREE.CanvasTexture(sourceCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  screen.material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  return texture;
}

function requestGamePointerLock() {
  if (state.activeArcade?.inputMode === 'dom') return;
  try {
    const pending = canvas.requestPointerLock?.();
    pending?.catch?.(() => {});
  } catch {
    // A developer preview can be embedded somewhere that denies pointer lock.
  }
}

function showPosture(kind) {
  state.posture = kind;
  postureLabel.textContent = kind === 'desk' ? 'leave the PC'
    : kind === 'arcade' ? 'leave the cabinet'
      : kind === 'poker' ? 'leave the table'
        : kind === 'darts' ? 'step away'
          : kind === 'console' ? 'leave the console'
            : kind === 'toilet-aim' ? 'stop'
              : kind === 'toilet-seat' ? 'get up'
                : kind === 'crooked-art' ? 'give up'
            : 'stand up';
  postureEl.classList.remove('hidden');
}

function clearPosture() {
  state.posture = null;
  postureEl.classList.add('hidden');
  paintLuxuryGamePanel(gamePanel, { visible: false });
}

function sitAt(kind, pose, onReady = null) {
  if (!player || player.mode !== 'walk' || !pose || state.posture) return false;
  state.posture = 'transition';
  player.clearKeys();
  interaction.setPaused(true);
  player.sitAt(pose, () => {
    showPosture(kind);
    onReady?.();
  });
  return true;
}

function leavePosture() {
  if (!state.posture || state.posture === 'transition' || !player) return false;
  const kind = state.posture;
  state.activeArcade?.setSeated?.(false);
  state.activeArcade = null;
  state.activeArcadeScreen = null;
  if (kind === 'poker') blackjack?.standUp();
  if (kind === 'darts') darts.leave();
  const poseKey = kind === 'arcade' ? 'arcade'
    : kind === 'poker' ? 'poker'
      : kind === 'darts' ? 'darts'
        : kind === 'console' ? 'console'
          : kind === 'desk' ? 'desk'
            : kind;
  const exit = home.poses?.[poseKey]?.exit ?? home.spawns.main.position;
  clearPosture();
  restoreWalkingPose(player, exit, home.groundAt);
  interaction.setPaused(false);
  player.enabled = document.pointerLockElement === canvas;
  requestGamePointerLock();
  return true;
}

function enterArcade(kind, system, screen, { launchSmash = false } = {}) {
  sitAt(kind, home.poses[kind === 'desk' ? 'desk' : 'arcade'], () => {
    state.activeArcade = system;
    state.activeArcadeScreen = screen;
    if (system.mode === 'off') system.boot();
    if (launchSmash && !state.cabinetBooted) {
      system.skipBoot?.();
      system.launchById?.('smash');
      state.cabinetBooted = true;
    }
    system.setSeated?.(true);
    hud.toast(launchSmash ? 'Squatch Smash cabinet' : 'Squatch OS');
  });
}

function repaintBlackjack(view = blackjack?.view) {
  if (state.posture !== 'poker' || !view) {
    if (state.posture === 'poker') paintLuxuryGamePanel(gamePanel, { visible: false });
    return;
  }
  const playerCards = view.player.length ? view.player.join(' ') : '—';
  const dealerCards = view.dealer.length ? view.dealer.join(' ') : '—';
  const hint = view.state === 'bet'
    ? '[1–4] bet · [E] deal · [Q] leave'
    : view.state === 'player'
      ? '[E] hit · [Space] stand · [R] double · [Q] leave'
      : '[Q] leave the table';
  paintLuxuryGamePanel(gamePanel, {
    visible: true,
    title: `BLACKJACK · $${Math.round(state.money)}`,
    primary: view.state === 'bet' ? `$${view.bet} BET` : `${view.playerTotal}`,
    secondary: view.message || `You: ${playerCards} · Dealer: ${dealerCards}`,
    hint,
  });
}

function pokerAction() {
  if (!blackjack) return;
  if (blackjack.state === 'bet') blackjack.deal();
  else if (blackjack.state === 'player') blackjack.hit();
}

function enterStation(id, station = home?.gameStations?.[id]) {
  if (!home || !station || player?.mode !== 'walk') return false;
  if (id === 'pc') {
    home.state.pcOn = true;
    enterArcade('desk', pcArcade, home.screens.pc);
    return true;
  }
  if (id === 'arcade') {
    enterArcade('arcade', cabinetArcade, home.screens.arcade, { launchSmash: true });
    return true;
  }
  if (id === 'poker') {
    return sitAt('poker', station.pose ?? home.poses.poker, () => {
      blackjack.sitDown();
      repaintBlackjack();
    });
  }
  if (id === 'darts') {
    return sitAt('darts', station.pose ?? home.poses.darts, () => darts.enter());
  }
  if (id === 'console') {
    if (!tv.on) tv.toggle();
    home.state.tvOn = tv.on;
    return sitAt('console', station.pose ?? home.poses.console, () => {
      hud.toast(`Cinema wall · ${tv.channel.name}`);
    });
  }
  return false;
}

function useDoor(name, wasOpen) {
  audio.play('door.creak', { volume: 0.45 });
  hud.toast(`${name} ${wasOpen ? 'closed' : 'opened'}`);
  return true; // world.js performs the actual toggle after the callback.
}

function useTv(on) {
  const requested = Boolean(on);
  if (tv.on !== requested) tv.toggle();
  if (home) home.state.tvOn = tv.on;
  hud.toast(tv.on ? `Cinema wall · ${tv.channel.name}` : 'Cinema wall off');
}

function useRadio(action) {
  if (action === 'tune') {
    if (!radio.on) radio.turnOn();
    radio.tune();
  } else if (Boolean(action) !== radio.on) {
    if (action) radio.turnOn();
    else radio.turnOff();
  }
  if (home) home.state.radioOn = radio.on;
  hud.toast(radio.on ? '97.8 THE SQUATCH' : 'Hi-fi off');
}

function useFridge(open) {
  audio.play(open ? 'fridge.open' : 'fridge.close', {
    volume: 0.5,
    position: home?.utilityTargets?.fridge,
  });
  if (!open) return;

  let stocked = false;
  if (state.fridgeBeer > 0 && !home.inventory.has('beer')) {
    stocked = inventoryRuntime.give('beer');
    if (stocked) state.fridgeBeer -= 1;
  } else if (state.fridgeSlices > 0 && !home.inventory.has('slice')) {
    stocked = inventoryRuntime.give('slice');
    if (stocked) state.fridgeSlices -= 1;
  }
  if (stocked) hud.toast('Took something from the fridge', 'good');
  else hud.say('Cold glass, good food, and more space than the old kitchen had.', 3200);
}

function useKitchen() {
  if (state.cooking === 'idle') {
    state.cooking = 'cooking';
    state.cookingTime = 0;
    audio.play('egg.crack', { volume: 0.52, position: home?.utilityTargets?.kitchen });
    audio.startLoop('luxury.pan', {
      name: 'pan.sizzle',
      volume: 0.24,
      ambience: true,
      position: home?.utilityTargets?.kitchen,
      fade: 0.3,
    });
    hud.toast('Eggs on the range');
    hud.say('A chef kitchen for two eggs. <em>Still two eggs.</em>', 3500);
  } else if (state.cooking === 'cooking') {
    hud.say('Give them another minute.', 2200);
  } else if (state.cooking === 'ready') {
    state.cooking = 'eaten';
    state.fed = true;
    audio.play('egg.eat', { volume: 0.48 });
    hud.toast('Ate at home', 'good');
  } else {
    hud.say('The induction top is spotless again.', 2200);
  }
}

function startShower() {
  if (state.showering) return false;
  state.showering = true;
  state.showerTime = 0;
  player.clearKeys();
  player.enabled = false;
  player.mode = 'frozen';
  player.position.set(
    home.showerStand.x,
    home.groundAt(home.showerStand.x, home.showerStand.z, home.showerStand.y) + 1.66,
    home.showerStand.z,
  );
  interaction.setPaused(true);
  showerFx.start(home.showerHead);
  audio.startLoop('luxury.shower', {
    name: 'shower.run',
    volume: 0.58,
    ambience: true,
    position: home.showerHead,
    fade: 0.25,
  });
  hud.say('Rainfall head, hot stone, the city muted behind glass.', 4200);
  return false; // world marks showered only when this timed sequence finishes.
}

function useWardrobe() {
  const outfits = ['clean black henley', 'charcoal suit', 'cream cashmere', 'late-night track jacket'];
  state.outfit = (state.outfit + 1) % outfits.length;
  hud.toast(`Changed · ${outfits[state.outfit]}`, 'good');
  audio.play('closet.slide', { volume: 0.36 });
  return true;
}

function sleepAtHome() {
  if (state.resting || !player || player.mode !== 'walk') return false;
  state.resting = true;
  player.clearKeys();
  player.enabled = false;
  interaction.setPaused(true);
  player.lieDown(home.poses.bed, () => {
    audio.play('bed.rustle', { volume: 0.48 });
    restCurtain.classList.add('active');
    window.setTimeout(() => {
      time.skipHours(11.5);
      highs.sleepItOff();
      focusRush.stop();
      state.sleepCount += 1;
      home.setCityTime(time.minutes);
      home.setLights('all', time.isDark, { automatic: true });
      teleportToSpawn(player, home, 'bed');
      window.setTimeout(() => {
        restCurtain.classList.remove('active');
        state.resting = false;
        interaction.setPaused(false);
        player.enabled = document.pointerLockElement === canvas;
        hud.toast(`Day ${time.day} · rested`, 'good');
        hud.say('Morning over the skyline. <em>The place is still yours.</em>', 4400);
      }, 850);
    }, 800);
  });
  return true;
}

function useBed(action) {
  if (action === 'sleep') return sleepAtHome();
  return sitAt('bed', home.poses.bed);
}

function syncToiletMode(mode) {
  if (mode === 'aim') showPosture('toilet-aim');
  else if (mode === 'seat' || mode === 'seat-transition') showPosture('toilet-seat');
  else clearPosture();
}

function syncCrookedArtMode(mode) {
  if (mode) {
    player?.clearKeys();
    showPosture('crooked-art');
  } else {
    clearPosture();
    player.enabled = document.pointerLockElement === canvas;
  }
}

function useToilet(mode = 'sit') {
  if (!toilet) return false;
  return mode === 'aim' ? toilet.startAim() : toilet.startSeat();
}

function useBong() {
  return bongBehavior.use();
}

function useShrooms() {
  if (home?.state.shroomsTaken) return false;
  highs.eatShrooms();
  audio.play('zyn.pack', { volume: 0.48 });
  hud.toast('Nothing is happening');
  hud.say('Earthy. Unpleasant. <em>Nothing is going to happen for a while.</em>', 5200);
  return true;
}

function useWhiteLine() {
  if (home?.state.whiteLineConsumed) return false;
  focusRush.start(25);
  audio.play('zyn.pack', { volume: 0.52 });
  hud.toast('Everything snaps into focus', 'good');
  return true;
}

function showArt(slot, record = {}) {
  if (slot && typeof slot === 'object') {
    record = slot;
    slot = record.slot;
  }
  const title = record.title || slot || 'A piece from the old walls';
  hud.say(`${title}.${record.caption ? ` <em>${record.caption}</em>` : ''}`, 4200);
  return true;
}

function applyHighFx() {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--trip-hue', `${highs.hue.toFixed(1)}deg`);
  rootStyle.setProperty('--trip-sat', highs.saturate.toFixed(3));
  rootStyle.setProperty('--trip-contrast', (highs.contrast ?? 1).toFixed(3));
  rootStyle.setProperty('--trip-bright', (highs.bright ?? 1).toFixed(3));
  rootStyle.setProperty('--trip-breathe', highs.breathe.toFixed(4));
  fxHigh.style.setProperty('--high-amount', highs.warmth.toFixed(3));
  fxHigh.style.setProperty('--high-droop', (highs.droop ?? 0).toFixed(3));
  fxTrip.style.setProperty('--trip-wash', (highs.wash ?? 0).toFixed(3));
  fxTrip.style.setProperty('--trip-angle', `${(highs.washAngle ?? 0).toFixed(1)}deg`);
  fxTrip.style.setProperty('--trip-angle2', `${(highs.washAngle2 ?? 0).toFixed(1)}deg`);
  fxTrip.style.setProperty('--trip-washhue', (highs.washHue ?? 0).toFixed(1));
  const split = highs.split ?? 0;
  canvas.classList.toggle('tripping', split > 0.15);
  if (chromaOffsets.length >= 2) {
    chromaOffsets[0].setAttribute('dx', String(-split));
    chromaOffsets[0].setAttribute('dy', String(split * 0.35));
    chromaOffsets[1].setAttribute('dx', String(split));
    chromaOffsets[1].setAttribute('dy', String(-split * 0.35));
  }
}

function applyTimeOfDay() {
  if (!home) return;
  home.setCityTime(time.minutes);
  scene.background.copy(time.fogColour).lerp(new THREE.Color(0x101722), 0.24);
  scene.fog.color.copy(scene.background);
  renderer.toneMappingExposure = time.exposure * 1.04;
}

window.__squatchStage?.('Opening the private elevator…');
try {
  home = validateLuxuryWorld(await buildLuxuryApartment({
    scene,
    interaction,
    audio,
    hud,
    time,
    onFrontDoor: (open) => useDoor('Front door', open),
    onElevator: (open) => useDoor('Elevator', open),
    onBed: useBed,
    onCouch: () => sitAt('couch', home.poses.couch),
    onDesk: () => { if (home) home.state.pcOn = true; },
    onTv: useTv,
    onRadio: useRadio,
    onPhone: () => inventoryRuntime?.takePhone(),
    onFridge: useFridge,
    onCook: useKitchen,
    onShower: startShower,
    onWardrobe: useWardrobe,
    onToilet: useToilet,
    onAnsweringMachine: (next) => answeringMachine?.toggle(next) ?? false,
    onRevolver: () => revolver?.pickup() ?? false,
    onAmmo: () => revolver?.takeAmmo(12) ?? false,
    onBong: useBong,
    onShrooms: useShrooms,
    onWhiteLine: useWhiteLine,
    onCrookedArt: (art) => crookedArt?.start(art) ?? false,
    onShades: (closed) => {
      audio.play('switch.click', { volume: 0.32 });
      hud.toast(closed ? 'City shades lowered' : 'City shades raised');
      return true;
    },
    onArt: (slot, record = {}) => showArt(slot, record),
    onCityView: () => hud.say('The whole city below. The original apartment is still down there somewhere.', 4200),
    onMinigame: enterStation,
  }));
} catch (error) {
  window.__squatchSceneFail?.('Could not build the luxury apartment', error?.message || String(error));
  throw error;
}

home.root.updateMatrixWorld(true);

/* The shared Player is one-floor by default. Its world adapter supplies the
 * current eye Y to world.groundAt, and every posture exit below uses the
 * loft-safe direct restoration helper instead of Player.standFrom(). */
const playerWorld = createFloorAwarePlayerWorld(home, () => player);
player = new Player(camera, playerWorld);
player.mode = 'walk';
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);
interaction.setOccluders(home.occluders ?? []);
teleportToSpawn(player, home, 'arrival');

inventoryRuntime = new LuxuryInventoryRuntime({
  camera,
  inventory: home.inventory,
  hud,
  audio,
  phone,
  phoneProp: home.phoneProp,
  state: home.state,
});
inventoryRuntime.seed();
home.state.phoneTaken = home.inventory.has('phone');
if (home.phoneProp?.group) home.phoneProp.group.visible = !home.state.phoneTaken;

revolver = new LuxuryRevolverRuntime({
  scene,
  camera,
  world: home,
  inventoryRuntime,
  inventory: home.inventory,
  hud,
  audio,
  state: home.state,
});
toilet = new LuxuryToiletRuntime({
  scene,
  camera,
  player,
  world: home,
  interaction,
  hud,
  audio,
  onMode: syncToiletMode,
  requestPointerLock: requestGamePointerLock,
  isPointerLocked: () => document.pointerLockElement === canvas,
});
crookedArt = new LuxuryCrookedArtRuntime({
  art: home.crookedArt,
  interaction,
  hud,
  audio,
  onMode: syncCrookedArtMode,
});
answeringMachine = new LuxuryAnsweringMachineRuntime({ world: home, hud, audio });

const pcTexture = mountCanvas(home.screens.pc, pcArcade.canvas);
const cabinetTexture = mountCanvas(home.screens.arcade, cabinetArcade.canvas);
const tvTexture = mountCanvas(home.screens.tv, tv.canvas);
tv.position = worldPoint(home.screens.tv);
radio.setPosition(home.radioPos ?? worldPoint(home.utilityTargets.radio));

const pokerTarget = worldPoint(home.gameStations.poker.target, home.gameStations.poker.anchor.position);
const pokerSeat = home.poses.poker.position;
blackjack = new Blackjack(scene, { x: pokerTarget.x, z: pokerTarget.z }, {
  x: pokerSeat.x,
  z: pokerSeat.z,
}, {
  getMoney: () => state.money,
  spend: (amount) => { state.money = Math.max(0, state.money - amount); },
  win: (amount) => { state.money += amount; },
  onState: (view) => repaintBlackjack(view),
  onDeal: () => audio.play('card.deal', { volume: 0.42, position: home.gameStations.poker.anchor }),
  onFlip: () => audio.play('card.flip', { volume: 0.38, position: home.gameStations.poker.anchor }),
  onChips: () => audio.play('ui.select', { volume: 0.32 }),
  onHandDone: (_hands, won, outcome) => {
    const net = Math.round(outcome.payout - outcome.staked);
    hud.toast(won ? `Blackjack +$${Math.max(0, net)}` : `Blackjack −$${outcome.staked}`, won ? 'good' : 'bad');
  },
});

applyTimeOfDay();

startButton.addEventListener('click', async () => {
  if (state.phase !== 'menu') return;
  startButton.disabled = true;
  startButton.textContent = 'Opening the elevator…';
  await audio.init();
  await radio.loadManifest();
  await audio.loadManifest({
    names: [
      'ambience.city.day', 'ambience.city.night', 'ambience.room',
      'door.knob', 'door.creak', 'switch.click',
      'fridge.open', 'fridge.close', 'fridge.hum',
      'can.crack', 'can.sip', 'can.crush',
      'cig.light', 'cig.exhale', 'cig.stub',
      'whiskey.pour', 'whiskey.swig', 'whiskey.gasp',
      'pizza.take', 'egg.crack', 'egg.eat', 'pan.sizzle',
      'shower.run', 'toilet.lid', 'closet.slide', 'bed.rustle',
      'phone.pickup', 'tv.click', 'card.deal', 'card.flip', 'ui.select',
      'chair.sit', 'pee.zip', 'pee.stream', 'pee.miss', 'toilet.plop',
      'poop.1', 'poop.2', 'poop.3', 'poop.4', 'poop.strain',
      'gun.pickup', 'gun.shot', 'gun.dry', 'gun.impact', 'gun.reload', 'ammo.take',
      'bong.bubble', 'zyn.pack', 'glue.slip',
      ...radio.preloadCueNames({ startupOnly: true }),
    ],
  });
  audio.startLoop('luxury.city.day', {
    name: 'ambience.city.day', volume: 0.02 + time.dayness * 0.10, ambience: true, fade: 2,
  });
  audio.startLoop('luxury.city.night', {
    name: 'ambience.city.night', volume: 0.03 + (1 - time.dayness) * 0.11, ambience: true, fade: 2,
  });
  audio.startLoop('luxury.room', {
    name: 'ambience.room', volume: 0.055, ambience: true, fade: 1.5,
  });
  state.phase = 'active';
  player.enabled = true;
  document.body.classList.add('playing');
  overlay.classList.add('hidden');
  requestGamePointerLock();
  hud.say('<em>Developer preview.</em> Two floors, one private elevator, and every way Tony wastes an evening.', 5200);
});

const pauseMenu = createPauseMenu({
  title: 'The High Life',
  canPause: () => state.phase === 'active' && !state.posture && !state.resting && !state.showering,
  canHandleTab: () => state.activeArcade?.inputMode !== 'dom',
  getObjective: () => 'Explore both floors or try the private games room.',
  instructions: [
    'W A S D — move. Shift — sprint. Space — jump.',
    'E or Click — use and play. Hold E where a second action is shown.',
    'F — consume the selected item. Q — stand or pocket it. R — radio/game action.',
    'Tab or Esc — pause. At a computer, Tab returns to SquatchOS and Q stands up.',
    'At blackjack: 1–4 set the bet, E hits, Space stands, R doubles.',
    'This is a standalone developer preview and does not alter campaign progress.',
  ],
  onPause: () => {
    state.paused = true;
    player.enabled = false;
    player.clearKeys();
    interaction.release();
    interaction.setPaused(true);
    document.exitPointerLock?.();
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    state.paused = false;
    interaction.setPaused(Boolean(state.posture));
    audio.ctx?.resume?.();
    lastFrame = performance.now();
    if (!state.posture || toilet?.aiming) requestGamePointerLock();
  },
  onRestart: () => location.reload(),
  restartLabel: 'Restart luxury preview',
});

document.addEventListener('pointerlockchange', () => {
  if (state.phase !== 'active' || state.paused || state.resting || state.showering) return;
  player.enabled = (!state.posture || toilet?.aiming) && document.pointerLockElement === canvas;
});

document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;
  if (state.activeArcade?.inputMode === 'relative') {
    state.activeArcade.onPointer(event.movementX, event.movementY);
  } else {
    player.handleMouseMove(event.movementX, event.movementY);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && !event.repeat) {
    if (state.phase !== 'active' || state.activeArcade?.inputMode === 'dom') return;
    event.preventDefault();
    pauseMenu.toggle();
    return;
  }
  if (state.phase !== 'active' || state.paused || state.resting || state.showering) return;

  if (toilet?.active) {
    if (!event.repeat) toilet.handleKey(event.code);
    event.preventDefault();
    return;
  }

  if (crookedArt?.bar.active) {
    if (!event.repeat) crookedArt.handleKey(event.code);
    event.preventDefault();
    return;
  }

  if (state.posture === 'poker') {
    if (event.code === 'KeyQ') leavePosture();
    else if (event.code === 'KeyE') pokerAction();
    else if (event.code === 'Space' && blackjack.state === 'player') blackjack.stand();
    else if (event.code === 'KeyR' && blackjack.state === 'player') blackjack.double();
    else {
      const number = /^Digit([1-4])$/.exec(event.code)?.[1];
      if (number && blackjack.state === 'bet') blackjack.setBet(BETS[Number(number) - 1]);
    }
    event.preventDefault();
    return;
  }

  if (state.posture === 'darts') {
    if (event.code === 'KeyQ') leavePosture();
    else if (event.code === 'KeyE') darts.throwDart();
    else if (event.code === 'KeyR') darts.reset();
    event.preventDefault();
    return;
  }

  if (state.posture === 'console') {
    if (event.code === 'KeyQ') leavePosture();
    else if (event.code === 'KeyR' || event.code === 'KeyE') {
      if (!tv.on) tv.toggle();
      else tv.next();
      home.state.tvOn = tv.on;
      hud.toast(`Cinema wall · ${tv.channel.name}`);
    }
    event.preventDefault();
    return;
  }

  if (state.activeArcade?.onKey(event.code, true)) {
    event.preventDefault();
    return;
  }

  if (event.code === 'KeyQ' && state.posture) {
    leavePosture();
    event.preventDefault();
    return;
  }

  const key = translateKey(event.code);
  player.setKey(key, true);
  if (key === 'Space') event.preventDefault();
  if (key === 'KeyE' && !event.repeat) {
    if (home.inventory.held === 'phone') phone.press();
    else interaction.press();
  }
  if (key === 'KeyQ' && !event.repeat) inventoryRuntime.pocket();
  if (key === 'KeyR' && !event.repeat) {
    if (home.inventory.held === 'gun') revolver.reload();
    else if (radio.on) radio.next();
  }
  const number = /^Digit([1-5])$/.exec(event.code)?.[1];
  if (number) home.inventory.select(Number(number) - 1);
});

document.addEventListener('keyup', (event) => {
  state.activeArcade?.onKey(event.code, false);
  const key = translateKey(event.code);
  player.setKey(key, false);
  if (key === 'KeyE') interaction.release();
});

document.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || state.phase !== 'active' || state.paused) return;
  if (toilet?.active || crookedArt?.bar.active) return;
  if (state.posture === 'poker') pokerAction();
  else if (state.posture === 'darts') darts.throwDart();
  else if (state.activeArcade) state.activeArcade.onClick(true);
  else if (home.inventory.held === 'gun' && document.pointerLockElement === canvas) revolver.fire();
  else if (document.pointerLockElement === canvas) interaction.press();
});

document.addEventListener('mouseup', (event) => {
  if (event.button !== 0) return;
  if (state.activeArcade) state.activeArcade.onClick(false);
  else interaction.release();
});

window.addEventListener('wheel', (event) => {
  if (state.phase !== 'active' || state.posture || state.paused) return;
  if (home.inventory.held === 'phone' && ['messages', 'thread'].includes(phone.screen)) {
    phone.cycle(event.deltaY > 0 ? 1 : -1);
  } else {
    home.inventory.cycle(event.deltaY > 0 ? 1 : -1);
  }
}, { passive: true });

window.addEventListener('blur', () => {
  player.clearKeys();
  interaction.release();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseMenu.pause();
});
canvas.addEventListener('click', () => {
  if (state.phase === 'active' && !state.paused && (!state.posture || toilet?.aiming)
    && !state.resting && !state.showering && document.pointerLockElement !== canvas) {
    requestGamePointerLock();
  }
});
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function updateTimedActivities(dt) {
  if (state.cooking === 'cooking') {
    state.cookingTime += dt;
    if (state.cookingTime >= 5.5) {
      state.cooking = 'ready';
      audio.stopLoop('luxury.pan', 0.5);
      hud.toast('Eggs are ready', 'good');
    }
  }

  if (state.showering) {
    state.showerTime += dt;
    showerFx.update(dt);
    if (state.showerTime >= 7.0) {
      state.showering = false;
      home.state.showered = true;
      showerFx.stop();
      audio.stopLoop('luxury.shower', 0.5);
      restoreWalkingPose(player, home.poses.shower.exit, home.groundAt);
      interaction.setPaused(false);
      player.enabled = document.pointerLockElement === canvas;
      hud.toast('Showered', 'good');
      hud.say('Clean clothes, clean glass, clean slate. <em>For tonight.</em>', 3800);
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;

  if (!state.paused) {
    state.elapsed += dt;
    time.update(dt);
    highs.update(dt);
    smoke.update(dt);
    player.sway.yaw = highs.sway.yaw;
    player.sway.pitch = highs.sway.pitch;
    player.sway.roll = highs.sway.roll;
    player.moveScale = highs.moveScale;
    player.lookDrag = highs.lookDrag;
    focusRush.update(dt);
    focusRush.apply(camera, player, { baseMoveScale: player.moveScale });
    player.update(dt);
    home.update(dt * highs.timeScale, state.elapsed, player.position);
    toilet.update(dt);
    crookedArt.update(dt);
    answeringMachine.update(dt);
    revolver.update(dt);
    updateTimedActivities(dt);

    if (state.phase === 'active' && !state.posture && !state.resting && !state.showering) {
      interaction.update(dt);
    }
    phone.update(dt);
    phone.draw();
    radio.update(dt);
    if (tv.update(dt) && tvTexture) tvTexture.needsUpdate = true;
    blackjack.update(dt);

    if (pcArcade.mode !== 'off') {
      pcArcade.update(dt);
      if (pcTexture) pcTexture.needsUpdate = true;
    }
    if (cabinetArcade.mode !== 'off') {
      cabinetArcade.update(dt);
      if (cabinetTexture) cabinetTexture.needsUpdate = true;
    }
    if (state.activeArcade && state.activeArcadeScreen) {
      state.activeArcade.placeOverlay?.(state.activeArcadeScreen, camera, canvas, THREE);
    }

    inventoryRuntime.update(dt, {
      active: state.phase === 'active'
        && !state.posture
        && !state.resting
        && !state.showering
        && !interaction.current,
      holding: player.keys.has('KeyF'),
      elapsed: state.elapsed,
    });
    applyHighFx();
    applyTimeOfDay();
  }

  hud.setClock(time.day, time.clock12, time.elapsedReal);
  pcArcade.setClock?.(time.clock12);
  cabinetArcade.setClock?.(time.clock12);
  audio.setLoopVolume('luxury.city.day', 0.02 + time.dayness * 0.10, 1.0);
  audio.setLoopVolume('luxury.city.night', 0.03 + (1 - time.dayness) * 0.11, 1.0);
  audio.updateListener(camera);
  renderer.render(scene, camera);
}

/**
 * Deterministic browser proof for the standalone preview. It drives the same
 * live controllers as player input, then restores a walk-safe posture so the
 * caller can continue into sleep/teleport verification.
 */
async function verifyParity() {
  toilet.setBladder(1);
  toilet.setBowel(1);
  toilet.resetPushes();

  const aimStarted = toilet.startAim();
  if (aimStarted) {
    camera.position.copy(player.position);
    camera.lookAt(home.toiletBowl);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 120; i++) toilet.update(1 / 60);
  }
  const aimCompleted = aimStarted ? Boolean(toilet.stopAim({ quiet: true })) : false;
  const rawAimReport = toilet.report();
  const aimReport = {
    ...rawAimReport,
    lastPee: rawAimReport.lastPee ? {
      ...rawAimReport.lastPee,
      inside: rawAimReport.lastPee.onTarget > 0,
    } : null,
  };

  toilet.setBowel(1);
  const pushStarted = toilet.startSeat();
  for (let i = 0; pushStarted && toilet.mode === 'seat-transition' && i < 120; i++) {
    player.update(1 / 60);
  }
  const pushReady = pushStarted && toilet.mode === 'seat';
  const pushSolved = pushReady ? toilet.solvePushes() : false;
  const pushReport = toilet.report();
  if (toilet.mode === 'seat') toilet.stopSeat();

  const crookedStarted = crookedArt.completed || crookedArt.start(home.crookedArt);
  const crookedSolved = crookedArt.completed || crookedArt.solve();
  const crookedReport = crookedArt.report();

  answeringMachine.reset();
  const messageStarted = answeringMachine.toggle(true);
  let messageGuard = answeringMachine.messages.length + 2;
  while (answeringMachine.playing && messageGuard-- > 0) answeringMachine.advance();
  const messageReport = answeringMachine.report();

  const pickedUp = revolver.pickup();
  const ammoTaken = revolver.takeAmmo(12);
  revolver.setAmmo(6, Math.max(12, home.state.spareRounds));
  const shot = revolver.fire({ spread: 0, random: () => 0.5 });
  const reloaded = revolver.reload();
  const revolverReport = revolver.report();

  home.state.bongUses = 0;
  home.state.shroomsTaken = false;
  home.state.whiteLineConsumed = false;
  highs.sleepItOff();
  focusRush.stop();
  const bongUsed = useBong();
  if (bongUsed) home.state.bongUses += 1;
  const shroomsUsed = useShrooms();
  if (shroomsUsed) home.state.shroomsTaken = true;
  const whiteLineUsed = useWhiteLine();
  if (whiteLineUsed) home.state.whiteLineConsumed = true;

  if (cabinetArcade.mode === 'off') cabinetArcade.boot();
  cabinetArcade.skipBoot?.();
  const cabinetLaunched = cabinetArcade.launchById('smash');
  const cabinetApp = cabinetArcade.app?.id ?? null;

  if (blackjack.state !== 'off') blackjack.standUp();
  blackjack.sitDown();
  const blackjackOpened = blackjack.state === 'bet';
  blackjack.setBet(BETS[0]);
  const blackjackBet = blackjack.bet;
  blackjack.standUp();

  darts.reset();
  darts.enter();
  const dartThrow = darts.throwDart(0.275);
  darts.leave();

  if (toilet.active) toilet.stop({ quiet: true });
  if (crookedArt.bar.active) crookedArt.abort();
  cabinetArcade.setSeated(false);
  if (cabinetArcade.mode === 'app') cabinetArcade.toDesktop();
  state.activeArcade?.setSeated?.(false);
  state.activeArcade = null;
  state.activeArcadeScreen = null;
  clearPosture();
  restoreWalkingPose(player, home.spawns.main.position, home.groundAt);
  interaction.setPaused(false);
  player.enabled = document.pointerLockElement === canvas;

  return {
    toilet: {
      aim: { started: aimStarted, completed: aimCompleted, report: aimReport },
      push: { started: pushStarted, solved: pushSolved, report: pushReport },
    },
    crookedArt: { started: Boolean(crookedStarted), solved: Boolean(crookedSolved), report: crookedReport },
    answeringMachine: {
      started: messageStarted,
      completed: messageReport.heard && !messageReport.playing,
      report: messageReport,
    },
    revolver: { pickedUp, ammoTaken, shot, reloaded, report: revolverReport },
    substances: {
      bongUsed,
      shroomsUsed,
      whiteLineUsed,
      state: {
        bongUses: home.state.bongUses,
        shroomsTaken: home.state.shroomsTaken,
        whiteLineConsumed: home.state.whiteLineConsumed,
      },
    },
    games: {
      cabinet: { launched: cabinetLaunched, app: cabinetApp },
      blackjack: { opened: blackjackOpened, bet: blackjackBet },
      darts: { entered: true, throw: dartThrow },
    },
  };
}

window.LUXURY_APARTMENT = {
  scene,
  renderer,
  camera,
  world: home,
  home,
  player,
  interaction,
  audio,
  time,
  state,
  inventory: home.inventory,
  phone,
  tv,
  radio,
  pcArcade,
  cabinetArcade,
  blackjack,
  darts,
  toilet,
  crookedArtRuntime: crookedArt,
  answeringMachineRuntime: answeringMachine,
  revolverRuntime: revolver,
  highs,
  focusRush,
  bongBehavior,
  verifyParity,
  station: enterStation,
  sleep: sleepAtHome,
  leavePosture,
  teleport(zone = 'main') {
    if (state.posture) leavePosture();
    const moved = teleportToSpawn(player, home, zone);
    if (moved) {
      interaction.setPaused(false);
      player.enabled = document.pointerLockElement === canvas;
    }
    return moved;
  },
  setTime(day, minutes) {
    time.setTime(day, minutes);
    home.setCityTime(minutes);
    home.setLights('all', time.isDark, { automatic: true });
    applyTimeOfDay();
    return { day: time.day, minutes: time.minutes };
  },
  setLights: (...args) => home.setLights(...args),
  actions: {
    bong: useBong,
    shrooms: useShrooms,
    whiteLine: useWhiteLine,
    toilet: useToilet,
    crookedArt: (art = home.crookedArt) => crookedArt.start(art),
    messages: (playing = true) => answeringMachine.toggle(playing),
    revolver: () => revolver.pickup(),
    ammo: (count = 12) => revolver.takeAmmo(count),
  },
  debug: {
    pcApps: pcArcade.apps.map((app) => ({ id: app.id, title: app.title ?? app.name ?? app.id })),
    parity: {
      toilet: {
        startAim: () => toilet.startAim(),
        stopAim: () => toilet.stopAim(),
        sit: () => toilet.startSeat(),
        stand: () => toilet.stopSeat(),
        push: (code) => toilet.tryPush(code.startsWith('Key') ? code : `Key${code.toUpperCase()}`),
        solvePushes: () => toilet.solvePushes(),
        setBladder: (value) => toilet.setBladder(value),
        setBowel: (value) => toilet.setBowel(value),
        report: () => toilet.report(),
      },
      crookedArt: {
        start: () => crookedArt.start(home.crookedArt),
        press: () => crookedArt.press(),
        solve: () => crookedArt.solve(),
        abort: () => crookedArt.abort(),
        report: () => crookedArt.report(),
      },
      messages: {
        play: () => answeringMachine.toggle(true),
        stop: () => answeringMachine.stop(),
        advance: () => answeringMachine.advance(),
        reset: () => answeringMachine.reset(),
        report: () => answeringMachine.report(),
      },
      gun: {
        pickup: () => revolver.pickup(),
        takeAmmo: (count = 12) => revolver.takeAmmo(count),
        fire: (options = { spread: 0 }) => revolver.fire(options),
        reload: () => revolver.reload(),
        setAmmo: (rounds, spare) => revolver.setAmmo(rounds, spare),
        report: () => revolver.report(),
      },
      bong: {
        use: () => {
          const used = useBong();
          if (used) home.state.bongUses += 1;
          return used;
        },
        report: () => ({ uses: bongBehavior.uses, weed: highs.weed }),
      },
      shrooms: {
        use: () => {
          const used = useShrooms();
          if (used) home.state.shroomsTaken = true;
          return used;
        },
        report: () => ({ taken: home.state.shroomsTaken, dose: highs.dose, trip: highs.trip }),
      },
      whiteLine: {
        use: () => {
          const used = useWhiteLine();
          if (used) home.state.whiteLineConsumed = true;
          return used;
        },
        report: () => ({ consumed: home.state.whiteLineConsumed, remaining: focusRush.remaining, strength: focusRush.strength }),
      },
    },
  },
};

window.__squatchSceneReady?.('LUXURY APARTMENT ready');
requestAnimationFrame(frame);
window.setTimeout(() => loading.classList.add('hidden'), 180);
window.setTimeout(() => loading.remove(), 780);
