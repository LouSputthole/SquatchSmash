import * as THREE from 'three';

import { createArcade } from '../arcade/mount.js';
import { AudioEngine } from '../core/audio.js';
import {
  ITEM_IDS,
  SCENE_IDS,
  createCampaign,
  createCampaignRadioAdapter,
  navigateCampaign,
} from '../core/campaign.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import {
  COUNTRYSIDE_CABIN_LANDMARKS,
  createCountrysideCabinStory,
} from '../core/countryside-cabin-story.js';
import { DayNight } from '../core/daynight.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { ITEMS } from '../core/inventory.js';
import { createObjectivePanel } from '../core/objective-panel.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { Phone } from '../core/phone.js';
import { phoneThreadsForCampaign } from '../core/phone-content.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { Player } from '../core/player.js';
import { Radio } from '../core/radio.js';
import { translateKey } from '../core/settings.js';
import { newsSegmentsFor } from '../core/stations.js';
import { Tv } from '../core/tv.js';
import { makeMaterials } from '../world/materials.js';
import {
  makeHeldCigarette,
  makeHeldDrinks,
  makeHeldSlice,
  makePhone,
  poseHeldDrink,
} from '../world/props.js';
import { buildCountrysideCabin } from './world.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startButton = document.getElementById('start-btn');
const postureEl = document.getElementById('posture');
const restCurtain = document.getElementById('cabin-rest');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
attachPixelRatio(renderer);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x25332f);
scene.fog = new THREE.FogExp2(0x25332f, 0.0072);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.045, 220);
camera.name = 'countryside-cabin.camera';
scene.add(camera);

/* The cabin is one world seen at two authored times: dusk on arrival and the
 * following afternoon after Tony has actually laid low. DayNight supplies the
 * same campaign clock vocabulary as the apartment without importing the
 * apartment's city lights or window backdrop. */
const sun = new THREE.DirectionalLight(0xffd2a3, 1.1);
sun.position.set(-12, 17, -8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55;
sun.shadow.camera.bottom = -55;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 130;
scene.add(sun);
const hemi = new THREE.HemisphereLight(0x758b93, 0x242117, 0.65);
const ambient = new THREE.AmbientLight(0x5e584c, 0.26);
scene.add(hemi, ambient);

const campaign = createCampaign();
const story = createCountrysideCabinStory({ campaign });
const time = new DayNight();
time.setTime(campaign.state.story.day, campaign.state.story.timeMinutes);
const hud = new Hud();
const interaction = new InteractionSystem(camera, hud);
const objectivePanel = createObjectivePanel({ parent: document.getElementById('hud') });
const audio = new AudioEngine();
const tv = new Tv({ audio });
const radio = new Radio(audio, hud, time, {
  venue: 'countryside_cabin',
  state: createCampaignRadioAdapter(campaign, {
    receiverId: 'countryside_cabin',
    defaultPower: true,
  }),
  canPlayNotice: () => false,
  news: () => newsSegmentsFor(campaign.state),
  output: 0.9,
});
const phone = new Phone({
  time,
  audio,
  calls: [],
  threads: phoneThreadsForCampaign(campaign.state),
  onThreadRead: (thread) => {
    if (thread.readEventId) campaign.advanceTime(thread.readEventId);
    syncCampaignPresentation();
  },
  onCallState: (connected) => radio.setPhoneDucked(connected),
});
const arcade = createArcade({ audio });

const state = {
  phase: 'menu',
  paused: false,
  elapsed: 0,
  posture: null,
  resting: false,
  pcOn: false,
  tvOn: false,
  radioOn: false,
  fridgeOpen: false,
  showered: false,
  dressed: false,
  cooked: false,
  eaten: false,
  fireLit: false,
  heldUse: 0,
  heldUseItem: null,
  consumeLatch: false,
};

let cabin = null;
let player = null;
let lastFrame = performance.now();

function syncTime() {
  const { day, timeMinutes } = campaign.state.story;
  time.setTime(day, timeMinutes);
}

function applyTimeOfDay() {
  const twilightLift = time.isDark ? 1.65 : time.hour >= 18 ? 1.32 : 1.08;
  sun.position.copy(time.sunPos).multiplyScalar(4.2);
  sun.color.copy(time.sunColour);
  sun.intensity = time.sunIntensity * 0.92;
  hemi.color.copy(time.hemiSky);
  hemi.groundColor.copy(time.hemiGround);
  hemi.intensity = time.hemiIntensity * (time.isDark ? 1.32 : 1.08);
  ambient.color.copy(time.ambColour);
  ambient.intensity = time.ambIntensity * twilightLift;
  scene.background.copy(time.fogColour).lerp(new THREE.Color(0x31453b), 0.32);
  scene.fog.color.copy(scene.background);
  renderer.toneMappingExposure = time.exposure * (time.isDark ? 1.30 : time.hour >= 18 ? 1.20 : 1.14);
  const cabinLightsOn = time.isDark || time.hour >= 18;
  cabin?.setCeiling?.(cabinLightsOn, { automatic: true });
  cabin?.setLamp?.(cabinLightsOn, { automatic: true });
}

function objectiveHint() {
  const exit = story.tryLeave();
  if (exit.kind === 'go') return 'Ape is waiting at the car · the property remains open to explore';
  if (exit.id === 'cabin_rest_first') return 'Use the bed when you are ready · every walk on the property is optional';
  return exit.line;
}

function repaintObjectives() {
  objectivePanel.set({
    title: 'THE HIDEOUT · LAY LOW',
    items: story.objectives().map((item) => ({
      label: item.label,
      done: item.done,
      required: item.required,
    })),
    hint: objectiveHint(),
  });
}

function syncCampaignPresentation() {
  syncTime();
  applyTimeOfDay();
  repaintObjectives();
  phone.setThreads(phoneThreadsForCampaign(campaign.state));
}

function showPosture(label) {
  state.posture = label;
  postureEl.querySelector('span').textContent = label === 'desk' ? 'leave computer' : 'stand up';
  postureEl.classList.remove('hidden');
}

function hidePosture() {
  state.posture = null;
  postureEl.classList.add('hidden');
  arcade.setSeated?.(false);
}

function sitAt(kind, pose) {
  if (!player || player.mode !== 'walk' || !pose) return;
  player.sitAt(pose, () => {
    showPosture(kind);
    if (kind === 'desk') {
      if (!state.pcOn) {
        state.pcOn = true;
        cabin.setPcOn?.(true);
        arcade.boot();
      }
      arcade.setSeated?.(true);
    }
  });
}

function standUp() {
  if (!state.posture || !player) return;
  const exit = state.posture === 'desk' ? cabin.deskExit
    : state.posture === 'couch' ? cabin.couchExit : cabin.bedSitExit;
  hidePosture();
  player.standFrom(exit ?? new THREE.Vector3(player.position.x, 0, player.position.z + 0.8));
}

function restAtCabin() {
  if (state.resting) return;
  if (story.rested()) {
    hud.say('Already slept through the heat. <em>Lou has the next thing.</em>', 3600);
    return;
  }
  state.resting = true;
  interaction.setPaused(true);
  player.enabled = false;
  restCurtain.classList.add('active');
  audio.stopLoop('cabin.forest', 0.8);
  window.setTimeout(() => {
    story.rest();
    syncCampaignPresentation();
    const wake = cabin.spawns?.wake ?? cabin.bedPose;
    if (wake?.position) {
      player.position.copy(wake.position);
      player.yaw = wake.yaw ?? player.yaw;
      player.pitch = wake.pitch ?? -0.08;
      player.mode = 'walk';
    }
    window.setTimeout(() => {
      restCurtain.classList.remove('active');
      interaction.setPaused(false);
      player.enabled = document.pointerLockElement === canvas;
      state.resting = false;
      audio.startLoop('cabin.forest', {
        name: 'ambience.course', volume: 0.21, ambience: true, fade: 1.6,
      });
      hud.say('<em>Day Five.</em> Still quiet. A message from Ape says the car is ready.', 5200);
      hud.toast('Laid low until the next afternoon', 'good', 3600);
    }, 1050);
  }, 850);
}

function visitLandmark(id) {
  const result = story.visit(id);
  if (!result.ok) return;
  if (result.firstVisit) {
    audio.play(id === 'creek' ? 'bird' : 'footstep.dirt', { volume: 0.28 });
    hud.say(result.landmark.line, 5200);
    hud.toast(`${result.landmark.shortLabel} explored`, 'good');
    syncCampaignPresentation();
  } else {
    hud.say(`Been here. <em>${result.landmark.shortLabel}.</em> Still nobody around.`, 3000);
  }
}

function leaveCabin() {
  const exit = story.tryLeave();
  if (exit.kind !== 'go') {
    hud.say(exit.line, 3600);
    hud.toast(exit.id === 'cabin_rest_first' ? 'Lay low for the night first' : 'Wait for Lou');
    return false;
  }
  state.phase = 'leaving';
  player.enabled = false;
  interaction.setPaused(true);
  restCurtain.querySelector('span').textContent = 'APE IS WAITING';
  restCurtain.classList.add('active');
  window.setTimeout(() => {
    navigateCampaign(campaign, SCENE_IDS.SILVER_CASE, {
      spawn: 'car_ride',
      location,
    });
  }, 900);
  return true;
}

function togglePhone() {
  if (!cabin.inventory?.has('phone')) {
    if (cabin.inventory?.full) {
      hud.toast('No free pocket');
      return;
    }
    cabin.inventory?.add('phone');
  } else {
    const slot = cabin.inventory.items.indexOf('phone');
    if (slot >= 0) cabin.inventory.select(slot);
  }
  audio.play('phone.pickup', { volume: 0.35 });
}

function toggleFridge() {
  state.fridgeOpen = !state.fridgeOpen;
  cabin.state.fridgeOpen = state.fridgeOpen;
  cabin.setFridge?.(state.fridgeOpen);
  audio.play(state.fridgeOpen ? 'fridge.open' : 'fridge.close', {
    volume: 0.44,
    position: cabin.fridgePos,
  });
}

function cookOrEat() {
  if (!state.cooked) {
    state.cooked = true;
    cabin.state.eggsCooked = true;
    audio.play('switch.click', { volume: 0.32, position: cabin.panPos });
    audio.play('pan.sizzle', { volume: 0.25, position: cabin.panPos });
    hud.say('Lou stocked the place. <em>Eggs, coffee, nothing with a receipt.</em>', 4200);
    hud.toast('Cooked eggs');
    return;
  }
  if (!state.eaten) {
    state.eaten = true;
    cabin.state.eggsEaten = true;
    hud.toast('Ate at the cabin', 'good');
    hud.say('Hot food. Open windows. <em>Not the worst way to vanish.</em>', 3800);
    return;
  }
  hud.say('Pan is clean. Countryside miracle.', 2500);
}

function useShower() {
  if (state.showered) {
    hud.say('Already clean. The water still smells faintly like iron.', 2800);
    return;
  }
  state.showered = true;
  cabin.state.showered = true;
  audio.play('shower.run', { volume: 0.36, position: cabin.showerHead });
  hud.toast('Showered at the cabin', 'good');
  hud.say('Well water. Hot enough. <em>No sirens through the wall.</em>', 4200);
}

function useWardrobe() {
  state.dressed = true;
  cabin.state.dressed = true;
  hud.toast('Changed into country clothes', 'good');
  hud.say('Same closet. Less city.', 2600);
}

function useToilet() {
  hud.say('Indoor plumbing this far out. <em>Lou planned ahead.</em>', 3000);
  audio.play('toilet.lid', { volume: 0.32, position: cabin.toiletSeat });
}

function inspectArt(info) {
  const title = info?.title || 'Squatch gear';
  const caption = info?.caption ? ` <em>${info.caption}</em>` : '';
  hud.say(`${title}.${caption}`, 4300);
}

function toggleTelevision() {
  state.tvOn = tv.toggle();
  cabin.state.tvOn = state.tvOn;
  hud.toast(state.tvOn ? `Television · ${tv.channel.name}` : 'Television off');
}

function nextTelevision() {
  if (!tv.on) toggleTelevision();
  else tv.next();
  hud.toast(`Television · ${tv.channel.name}`);
}

function toggleRadio() {
  radio.toggle();
  state.radioOn = radio.on;
  cabin.state.radioOn = state.radioOn;
  hud.toast(state.radioOn ? '97.8 THE SQUATCH' : 'Radio off');
}

function tuneRadio() {
  if (!radio.on) radio.turnOn();
  radio.tune();
  state.radioOn = radio.on;
}

function toggleFrontDoor() {
  const opened = cabin.toggleDoor?.();
  audio.play(opened ? 'door.open' : 'door.close', { volume: 0.45 });
  return opened;
}

function useWoodpile() {
  state.fireLit = !state.fireLit;
  cabin.state.fireLit = state.fireLit;
  cabin.setFireLit?.(state.fireLit);
  if (state.fireLit) {
    audio.startLoop('cabin.firepit', {
      name: 'siege.fire.crackle',
      volume: 0.15,
      ambience: true,
      position: cabin.landmarks?.firepit?.position,
      ref: 1.4,
      maxDist: 20,
      fade: 0.45,
    });
  } else {
    audio.stopLoop('cabin.firepit', 0.35);
  }
  hud.toast(state.fireLit ? 'Lit the fire ring' : 'Put the fire out');
  hud.say(state.fireLit
    ? 'Dry cedar catches fast. <em>One small fire, down below the road.</em>'
    : 'Better not advertise the smoke.', 3200);
}

window.__squatchStage?.('Building the cabin and the property…');
try {
  cabin = await buildCountrysideCabin({
    scene,
    camera,
    interaction,
    audio,
    hud,
    time,
    externalLighting: true,
    onBedTap: () => sitAt('bed', cabin.bedSitPose),
    onBedRest: restAtCabin,
    onCouch: () => sitAt('couch', cabin.couchPose),
    onDesk: () => sitAt('desk', cabin.deskPose),
    onTvTap: toggleTelevision,
    onTvHold: nextTelevision,
    onRadioTap: toggleRadio,
    onRadioHold: tuneRadio,
    onPhone: togglePhone,
    onFridge: toggleFridge,
    onCook: cookOrEat,
    onEat: cookOrEat,
    onShower: useShower,
    onWardrobe: useWardrobe,
    onToilet: useToilet,
    onArt: inspectArt,
    onFrontDoor: toggleFrontDoor,
    onLandmark: visitLandmark,
    onCar: leaveCabin,
    onLeave: leaveCabin,
    onWoodpile: useWoodpile,
    onPorch: () => hud.say('No traffic. Just the creek below the trees.', 3000),
  });
} catch (error) {
  window.__squatchSceneFail?.('Could not build the cabin', error?.message || String(error));
  throw error;
}

const world = {
  colliders: cabin.colliders,
  floorZones: cabin.floorZones,
  groundAt: cabin.groundAt,
};
player = new Player(camera, world);
player.mode = 'walk';
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);
interaction.setOccluders(cabin.occluders ?? []);

/* The builder owns the authored registrations. These fallbacks keep the
 * public exterior contract useful to a stripped-down geometry preview too. */
const landmarkById = new Map(COUNTRYSIDE_CABIN_LANDMARKS.map((entry) => [entry.id, entry]));
for (const [id, target] of Object.entries(cabin.interactionTargets ?? {})) {
  if (!target || target.userData?.interact || id === 'car') continue;
  const landmark = landmarkById.get(id);
  if (!landmark) continue;
  interaction.register(target, {
    label: `Explore <b>${landmark.shortLabel}</b>`,
    onUse: () => visitLandmark(id),
  });
}
if (cabin.carTarget && !cabin.carTarget.userData?.interact) {
  interaction.register(cabin.carTarget, {
    label: () => story.tryLeave().kind === 'go'
      ? 'Leave with <b>Ape</b> for the Silver Case'
      : 'Check the <b>parked car</b>',
    onUse: leaveCabin,
  });
}

const spawnId = campaign.state.scene.id === SCENE_IDS.COUNTRYSIDE_CABIN
  ? campaign.state.scene.spawn : 'arrival';
const spawn = cabin.spawns?.[spawnId] ?? cabin.spawns?.arrival;
if (spawn?.position) player.position.copy(spawn.position);
else player.position.set(18, (cabin.groundAt?.(18, 18) ?? 0) + 1.66, 18);
player.yaw = spawn?.yaw ?? Math.PI;
player.pitch = spawn?.pitch ?? -0.08;

/* Real apartment art remains the source: world.js resolves the same manifest
 * slots. The screen-based utilities are also the real shared systems, mapped
 * onto the cabin-native furniture handles here. */
const arcadeTexture = new THREE.CanvasTexture(arcade.canvas);
arcadeTexture.colorSpace = THREE.SRGBColorSpace;
if (cabin.screen) cabin.screen.material = new THREE.MeshBasicMaterial({ map: arcadeTexture, toneMapped: false });
const tvTexture = new THREE.CanvasTexture(tv.canvas);
tvTexture.colorSpace = THREE.SRGBColorSpace;
if (cabin.tv?.screen) cabin.tv.screen.material = new THREE.MeshBasicMaterial({ map: tvTexture, toneMapped: false });
tv.position = cabin.tv?.screenPos ?? new THREE.Vector3();
radio.setPosition(cabin.radioPos ?? new THREE.Vector3());

const heldPhone = makePhone(makeMaterials(), { x: 0, y: 0, z: 0, w: 0.072 });
heldPhone.group.position.set(0.07, -0.10, -0.32);
heldPhone.group.rotation.set(1.20, -0.10, 0.03);
heldPhone.group.scale.setScalar(1.58);
heldPhone.group.visible = false;
heldPhone.screen.material = new THREE.MeshBasicMaterial({
  map: new THREE.CanvasTexture(phone.canvas),
  toneMapped: false,
});
camera.add(heldPhone.group);

const heldDrinks = makeHeldDrinks(makeMaterials());
heldDrinks.group.position.set(0.26, -0.30, -0.42);
camera.add(heldDrinks.group);

const heldSlice = makeHeldSlice();
heldSlice.group.position.set(0.235, -0.235, -0.36);
heldSlice.group.rotation.set(0.16, 0, -0.20);
heldSlice.group.visible = false;
camera.add(heldSlice.group);

const heldCig = makeHeldCigarette();
heldCig.group.position.set(0.055, -0.062, -0.10);
heldCig.group.rotation.set(0.06, 0.13, 0);
heldCig.group.scale.setScalar(1.25);
heldCig.group.visible = false;
camera.add(heldCig.group);

function poseSlice(progress) {
  const k = THREE.MathUtils.clamp(progress, 0, 1);
  const eased = k * k * (3 - 2 * k);
  heldSlice.group.position.set(0.235 - 0.150 * eased, -0.235 + 0.185 * eased, -0.36 + 0.10 * eased);
  heldSlice.group.rotation.set(0.16 + 0.70 * eased, -0.30 * eased, -0.20 - 0.24 * eased);
}

if (campaign.hasItem(ITEM_IDS.PHONE) && !cabin.inventory.has('phone')) {
  cabin.inventory.add('phone');
  // Arrive with the phone in Tony's pocket, not filling a third of the view.
  // Digit 1 still draws it immediately from the first hotbar slot.
  const emptyPocket = cabin.inventory.items.findIndex((item) => item === null);
  if (emptyPocket >= 0) cabin.inventory.select(emptyPocket);
}
if (cabin.phoneProp?.group) cabin.phoneProp.group.visible = !cabin.inventory.has('phone');
cabin.inventory.onChange = (inventory) => {
  hud.setInventory(inventory, ITEMS);
  const held = inventory.held;
  heldPhone.group.visible = held === 'phone';
  poseHeldDrink(heldDrinks, held === 'beer' ? 'can' : held === 'whiskey' ? 'bottle' : null, 0);
  heldSlice.group.visible = held === 'slice';
  if (held !== 'cigs' || state.heldUse <= 0) heldCig.group.visible = false;
  if (cabin.phoneProp?.group) cabin.phoneProp.group.visible = !inventory.has('phone');
  let hand = held ? ITEMS[held] : null;
  if (held === 'cigs') {
    hand = { ...hand, name: `Smokes (${cabin.state.cigsLeft})` };
  } else if (held === 'whiskey') {
    hand = { ...hand, name: `Jack & Daniel's (${cabin.state.whiskeyLeft})` };
  }
  hud.setHand(hand);
};
cabin.inventory.onChange(cabin.inventory);

function pocketHeldItem() {
  const held = cabin.inventory.held;
  if (!held) return false;
  if (held === 'phone') phone.screen = 'home';
  const emptyPocket = cabin.inventory.items.findIndex((item) => item === null);
  if (emptyPocket < 0) {
    hud.toast('No empty pocket to free your hand');
    return false;
  }
  cabin.inventory.select(emptyPocket);
  hud.toast(`${ITEMS[held]?.name || 'Item'} pocketed`);
  return true;
}

const HELD_USE = Object.freeze({
  beer: Object.freeze({ seconds: 2.1, label: 'Drinking…' }),
  whiskey: Object.freeze({ seconds: 1.7, label: 'Taking a pull…' }),
  cigs: Object.freeze({ seconds: 2.4, label: 'Smoking…' }),
  slice: Object.freeze({ seconds: 2.2, label: 'Eating…' }),
});

function resetHeldUse() {
  state.heldUse = 0;
  state.heldUseItem = null;
  hud.setHold(null);
  heldCig.group.visible = false;
  poseSlice(0);
  cabin.inventory.onChange?.(cabin.inventory);
  if (!interaction.current) hud.hidePrompt();
}

function finishHeldUse(item) {
  const slot = cabin.inventory.selected;
  state.consumeLatch = true;
  state.heldUse = 0;
  state.heldUseItem = null;
  hud.setHold(null);
  hud.hidePrompt();
  heldCig.group.visible = false;
  poseSlice(0);

  if (item === 'beer') {
    cabin.state.beersDrunk++;
    cabin.inventory.removeAt(slot, 'beer');
    audio.play('can.sip', { volume: 0.42 });
    audio.play('can.crush', { volume: 0.42, delay: 0.22 });
    hud.toast('Finished a cabin beer', 'good');
    hud.say('Cold enough. Quiet enough. <em>That will do.</em>', 3000);
  } else if (item === 'whiskey') {
    cabin.state.whiskeyLeft = Math.max(0, cabin.state.whiskeyLeft - 1);
    cabin.state.whiskeyDrunk = (cabin.state.whiskeyDrunk || 0) + 1;
    audio.play('whiskey.swig', { volume: 0.52 });
    audio.play('whiskey.gasp', { volume: 0.48, delay: 0.28 });
    if (cabin.state.whiskeyLeft === 0) cabin.inventory.removeAt(slot, 'whiskey');
    else cabin.inventory.onChange?.(cabin.inventory);
    hud.toast(cabin.state.whiskeyLeft ? 'One pull' : 'Bottle empty');
    hud.say('One pull. <em>No reason to turn laying low into getting lost.</em>', 3400);
  } else if (item === 'cigs') {
    cabin.state.cigsLeft = Math.max(0, cabin.state.cigsLeft - 1);
    audio.play('cig.exhale', { volume: 0.58 });
    audio.play('cig.stub', { volume: 0.38, delay: 0.65 });
    if (cabin.state.cigsLeft === 0) cabin.inventory.removeAt(slot, 'cigs');
    else cabin.inventory.onChange?.(cabin.inventory);
    hud.toast(cabin.state.cigsLeft ? 'Smoke break' : 'Pack empty');
    hud.say('The ember is the only light moving in the trees.', 3000);
  } else if (item === 'slice') {
    state.eaten = true;
    cabin.state.fed = true;
    cabin.inventory.removeAt(slot, 'slice');
    audio.play('egg.eat', { volume: 0.48 });
    hud.toast('Ate a cold slice', 'good');
    hud.say('Cold. Still pizza. <em>Still counts.</em>', 2800);
  }
}

function updateHeldUse(dt) {
  const item = cabin.inventory.held;
  const spec = HELD_USE[item];
  const holding = state.phase === 'active'
    && !state.paused
    && !state.resting
    && !state.posture
    && player.keys.has('KeyF');

  if (!holding) {
    state.consumeLatch = false;
    if (state.heldUseItem) resetHeldUse();
    return;
  }
  if (!spec || state.consumeLatch) return;

  if (state.heldUseItem !== item) {
    if (state.heldUseItem) resetHeldUse();
    state.heldUseItem = item;
    if (item === 'beer') audio.play('can.crack', { volume: 0.62 });
    else if (item === 'whiskey') audio.play('whiskey.pour', { volume: 0.58 });
    else if (item === 'cigs') audio.play('cig.light', { volume: 0.58 });
  }

  state.heldUse += dt;
  const progress = Math.min(1, state.heldUse / spec.seconds);
  hud.showPrompt(spec.label, 'F');
  hud.setHold(progress);
  if (item === 'beer') poseHeldDrink(heldDrinks, 'can', progress);
  else if (item === 'whiskey') poseHeldDrink(heldDrinks, 'bottle', progress);
  else if (item === 'slice') poseSlice(progress);
  else if (item === 'cigs') {
    heldCig.group.visible = progress > 0.12;
    heldCig.ember.material.emissiveIntensity = 2.2 + Math.sin(state.elapsed * 20) * 0.55;
  }
  if (progress >= 1) finishHeldUse(item);
}

function registerOutdoorFallback(id, label, handler) {
  const target = cabin.interactionTargets?.[id];
  if (!target || target.userData?.interact) return;
  interaction.register(target, { label, onUse: handler });
}
registerOutdoorFallback('woodpile', 'Check the <b>woodpile</b>', useWoodpile);
registerOutdoorFallback('porch', 'Look out from the <b>porch</b>', () => {
  hud.say('No traffic. Just the creek below the trees.', 3000);
});

syncCampaignPresentation();
applyTimeOfDay();

function requestGamePointerLock() {
  try {
    const pending = canvas.requestPointerLock?.();
    pending?.catch?.(() => {});
  } catch {
    // Embedded previews can deny pointer lock without invalidating the scene.
  }
}

const available = campaign.state.scene.id === SCENE_IDS.COUNTRYSIDE_CABIN;
if (!available) {
  overlay.querySelector('.tag').textContent = 'Lou has not sent you north yet. Finish THE TAKE and read his lay-low message at the apartment.';
  startButton.textContent = 'CABIN NOT YET AVAILABLE';
  startButton.disabled = true;
}

startButton.addEventListener('click', async () => {
  if (!available || state.phase !== 'menu') return;
  startButton.disabled = true;
  startButton.textContent = 'Loading the property…';
  await audio.init();
  await radio.loadManifest();
  await audio.loadManifest({
    names: [
      'ambience.course', 'bird', 'phone.pickup', 'door.open', 'door.close',
      'fridge.open', 'fridge.close', 'switch.click', 'pan.sizzle', 'shower.run', 'toilet.lid',
      'fridge.hum', 'siege.fire.crackle', 'can.crack', 'can.sip', 'can.crush',
      'cig.pack', 'cig.light', 'cig.exhale', 'cig.stub',
      'whiskey.cap', 'whiskey.pour', 'whiskey.swig', 'whiskey.gasp',
      'pizza.take', 'egg.eat', 'tv.click',
      ...radio.preloadCueNames({ startupOnly: true }),
    ],
  });
  audio.startLoop('cabin.forest', {
    name: 'ambience.course', volume: 0.21, ambience: true, fade: 1.8,
  });
  audio.startLoop('cabin.fridge', {
    name: 'fridge.hum',
    volume: 0.13,
    ambience: true,
    position: cabin.fridgePos,
    ref: 1,
    maxDist: 10,
    fade: 0.6,
  });
  radio.turnOn({ tuneIn: true, remember: false });
  state.radioOn = true;
  cabin.state.radioOn = true;
  state.phase = 'active';
  player.enabled = true;
  document.body.classList.add('playing');
  overlay.classList.add('hidden');
  requestGamePointerLock();
  hud.say(story.rested()
    ? '<em>Day Five.</em> The property stayed quiet. Ape is waiting by the car.'
    : '<em>County road north.</em> One night out of sight. That was Lou’s instruction.', 5200);
});

const pauseMenu = createPauseMenu({
  title: 'The Hideout',
  canPause: () => state.phase === 'active' && !state.resting,
  getObjective: () => {
    const next = story.objectives().find((item) => item.required && !item.done);
    return next?.label ?? 'Explore the property or take the car when you are ready.';
  },
  instructions: [
    'W A S D — move. Shift — sprint. Space — jump.',
    'E or Click — use. Hold E where a second action is shown.',
    'F — eat, drink or smoke a selected item. Q — stand up or pocket it.',
    'R — skip the radio.',
    'The bed advances the lay-low story. All four property landmarks are optional.',
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
    interaction.setPaused(false);
    audio.ctx?.resume?.();
    lastFrame = performance.now();
    requestGamePointerLock();
  },
  recovery: createCampaignSceneRecovery({
    campaign,
    sceneId: SCENE_IDS.COUNTRYSIDE_CABIN,
    location,
  }),
});

document.addEventListener('pointerlockchange', () => {
  if (state.phase === 'active' && !state.paused && !state.resting) {
    player.enabled = document.pointerLockElement === canvas || arcade.inputMode === 'dom';
  }
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;
  if (state.posture === 'desk' && arcade.inputMode === 'relative') arcade.onPointer(event.movementX, event.movementY);
  else player.handleMouseMove(event.movementX, event.movementY);
});
document.addEventListener('keydown', (event) => {
  if (state.phase !== 'active' || state.paused || state.resting) return;
  if (state.posture === 'desk' && arcade.onKey(event.code, true)) return;
  const key = translateKey(event.code);
  player.setKey(key, true);
  if (key === 'Space') event.preventDefault();
  if (key === 'KeyE' && !event.repeat) {
    if (cabin.inventory.held === 'phone') phone.press();
    else interaction.press();
  }
  if (key === 'KeyQ' && !event.repeat) {
    if (state.posture) standUp();
    else pocketHeldItem();
  }
  if (key === 'KeyR' && !event.repeat && radio.on) radio.next();
  const number = /^Digit([1-5])$/.exec(event.code)?.[1];
  if (number) cabin.inventory.select(Number(number) - 1);
});
document.addEventListener('keyup', (event) => {
  if (state.posture === 'desk') arcade.onKey(event.code, false);
  player.setKey(translateKey(event.code), false);
  if (translateKey(event.code) === 'KeyE') interaction.release();
});
document.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || document.pointerLockElement !== canvas) return;
  if (state.posture === 'desk') arcade.onClick(true);
  else interaction.press();
});
document.addEventListener('mouseup', (event) => {
  if (event.button !== 0) return;
  if (state.posture === 'desk') arcade.onClick(false);
  else interaction.release();
});
window.addEventListener('wheel', (event) => {
  if (state.phase !== 'active' || state.posture) return;
  if (cabin.inventory.held === 'phone' && ['messages', 'thread'].includes(phone.screen)) {
    phone.cycle(event.deltaY > 0 ? 1 : -1);
  } else {
    cabin.inventory.cycle(event.deltaY > 0 ? 1 : -1);
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
  if (state.phase === 'active' && !state.paused && !state.resting
    && document.pointerLockElement !== canvas && arcade.inputMode !== 'dom') {
    requestGamePointerLock();
  }
});
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  if (!state.paused) {
    state.elapsed += dt;
    time.update(dt);
    cabin.update?.(dt, state.elapsed, player.position);
    if (state.phase === 'active' && !state.resting) {
      player.update(dt);
      interaction.update(dt);
      updateHeldUse(dt);
      phone.update(dt);
      phone.draw();
      radio.update(dt);
      if (tv.update(dt)) tvTexture.needsUpdate = true;
      if (state.posture === 'desk') {
        arcade.update(dt);
        arcadeTexture.needsUpdate = true;
        arcade.placeOverlay?.(cabin.screen, camera, canvas, THREE);
      }
    }
    applyTimeOfDay();
  }
  heldPhone.screen.material.map.needsUpdate = heldPhone.group.visible;
  hud.setClock(time.day, time.clock12, time.elapsedReal);
  audio.updateListener(camera);
  renderer.render(scene, camera);
}

window.CABIN = window.COUNTRYSIDE_CABIN = window.__squatchCabin = {
  scene,
  campaign,
  story,
  cabin,
  interaction,
  player,
  time,
  state,
  visit: visitLandmark,
  rest: restAtCabin,
  leave: leaveCabin,
  get objectives() { return story.objectives(); },
  teleport(id, mode = 'observe') {
    const viewpoint = mode === 'interact'
      ? cabin.interactionViewpoints?.[id]
      : cabin.viewpoints?.[id] ?? cabin.observationViewpoints?.[id];
    if (viewpoint?.position) {
      player.position.copy(viewpoint.position);
      player.ground = cabin.groundAt?.(viewpoint.position.x, viewpoint.position.z)
        ?? viewpoint.position.y - 1.68;
      player.jumpHeight = 0;
      player.grounded = true;
      player.velocity?.set?.(0, 0, 0);
      player.yaw = viewpoint.yaw ?? player.yaw;
      player.pitch = viewpoint.pitch ?? player.pitch;
      return true;
    }
    const target = cabin.landmarks?.find?.((entry) => entry.id === id)
      ?? cabin.landmarks?.[id]
      ?? cabin.spawns?.[id];
    const position = target?.position ?? target?.point;
    if (!position) return false;
    player.position.copy(position);
    player.ground = cabin.groundAt?.(position.x, position.z) ?? position.y ?? 0;
    player.position.y = player.ground + 1.68;
    player.jumpHeight = 0;
    player.grounded = true;
    player.velocity?.set?.(0, 0, 0);
    player.yaw = target?.yaw ?? player.yaw;
    player.pitch = target?.pitch ?? player.pitch;
    return true;
  },
};

window.__squatchSceneReady?.('CABIN ready');
requestAnimationFrame(frame);
window.setTimeout(() => loading.classList.add('hidden'), 180);
window.setTimeout(() => loading.remove(), 780);
