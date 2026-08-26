import * as THREE from 'three';

import { createArcade } from '../arcade/mount.js';
import { AudioEngine } from '../core/audio.js';
import {
  ITEM_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  createCampaignRadioAdapter,
  navigateCampaign,
} from '../core/campaign.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import {
  CABIN_HOSTAGE_IDS,
  COUNTRYSIDE_CABIN_LANDMARKS,
  createCountrysideCabinStory,
} from '../core/countryside-cabin-story.js';
import { DayNight } from '../core/daynight.js';
import { ENVIRONMENT_VISIBILITY } from '../core/environment-visibility.js';
import { createFirstPersonInput } from '../core/first-person-input.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { ITEMS } from '../core/inventory.js';
import { createObjectivePanel } from '../core/objective-panel.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { PlanarMirror } from '../core/planar-mirror.js';
import { Phone } from '../core/phone.js';
import { phoneThreadsForCampaign } from '../core/phone-content.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { Player } from '../core/player.js';
import { Radio } from '../core/radio.js';
import { markSpatialPrimitive } from '../core/spatial-contract.js';
import { newsSegmentsFor } from '../core/stations.js';
import { Tv } from '../core/tv.js';
import {
  WEAPON_IDS,
  WeaponSystem,
  buildWeaponModel,
  mountArmory,
  mountCharacterWeapon,
  playWeaponCue,
  weaponCueNames,
  weaponDef,
} from '../core/weapons/index.js';
import { BloodImpactSystem, DeathBloodPool } from '../world/blood.js';
import { makeMaterials } from '../world/materials.js';
import {
  makeHeldCigarette,
  makeHeldDrinks,
  makeHeldSlice,
  makePhone,
  poseHeldDrink,
} from '../world/props.js';
import {
  cabinCleanupRestoreState,
  createCabinBonfireCastStaging,
} from './body-cleanup.js';
import { buildCountrysideCabin } from './world.js';
import {
  STORY_TO_CLEANUP_BODY,
  createCabinChapterRuntime,
} from './chapter-runtime.js';
import { createCabinDialogueDirector } from './dialogue-director.js';
import { createCabinExecutionChoice } from './execution-choice.js';
import { createLagHintDirector, LAG_VOICE_PREFIX, speakLagLine } from './lag.js';
import { CABIN_VO_PREFIX, MARGO_CALL_READY, cabinScriptCues } from './script.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startButton = document.getElementById('start-btn');
const postureEl = document.getElementById('posture');
const restCurtain = document.getElementById('cabin-rest');
const combatEl = document.getElementById('cabin-combat');
const rangeEl = document.getElementById('cabin-range-score');
const choiceEl = document.getElementById('cabin-choice');
const intoxicationEl = document.getElementById('cabin-intoxication');

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

const camera = new THREE.PerspectiveCamera(
  68, innerWidth / innerHeight, 0.045, ENVIRONMENT_VISIBILITY.wildernessHub.cameraFar,
);
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
  logsSplit: 0,
  heldUse: 0,
  heldUseItem: null,
  consumeLatch: false,
  level: 'cabin',
  basementVisited: false,
  basementInspection: null,
  carryingBody: null,
};

const WALK_EYE_HEIGHT = 1.66;

const lagHints = createLagHintDirector();

let cabin = null;
let bathroomMirror = null;
let player = null;
let input = null;
let chapter = null;
let dialogue = null;
let executionChoice = null;
let weapons = null;
let armory = null;
let gratinPistol = null;
let bloodImpacts = null;
let deathPools = null;
let bonfireCast = null;
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
  const phase = story.phase();
  const phaseHints = {
    opening_call: 'Keep the phone selected · answer Lou with E',
    explore: 'Explore any two marked locations · the creek, ridge, shed, or range',
    gratin_call: 'Keep the phone close · Gratin is calling',
    open_cellar: 'Return to the cabin · Follow the Supreme Leader',
    enter_dungeon: 'Search the finished cellar for a second concealed door',
    interrogation: 'Choose a tool, then work on both restrained prisoners',
    ateam_intel: 'Let the A-Team prisoner finish talking',
    execution_choice: 'Choose within ten seconds · 1 YES or 2 NO',
    execution: story.executionChoice() === 'player'
      ? 'Use Gratin’s pistol to finish both prisoners'
      : 'Stand clear while Gratin finishes the job',
    nightfall: 'Night is falling above the cellar',
    wrap_bodies: 'Wrap both bodies at the marked stations',
    carry_bodies: 'Carry each wrapped body out of the dungeon and onto the pyre',
    pour_gas: 'Take the red gas can and soak the pyre',
    ignite_bonfire: 'Light the soaked pyre',
    fire_cleanup: 'Stay by the fire with Lag and Gratin',
    drink: 'Take the offered drink with Lag and Gratin',
    blackout: 'Finish the night by the fire',
    morning_call: 'Answer Ape’s morning call',
    morning_wake: 'Get up and meet Ape at the car',
  };
  if (phaseHints[phase]) return phaseHints[phase];
  const exit = story.tryLeave();
  if (exit.kind === 'go') return 'Ape is waiting at the car · Lag and the property remain open';
  return exit.line;
}

function repaintObjectives() {
  const chapterActive = story.gratinCallComplete();
  objectivePanel.set({
    title: chapterActive ? 'THE HIDEOUT · BELOW THE FLOORBOARDS' : 'THE HIDEOUT · LAY LOW',
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

function discoverCabin(id) {
  return lagHints.discover(id);
}

function floorForCabinPose(pose) {
  if (Number.isFinite(pose?.floorY)) return pose.floorY;
  if (!pose?.position) return 0;
  return cabin?.groundAt?.(
    pose.position.x,
    pose.position.z,
    pose.position.y - WALK_EYE_HEIGHT,
  ) ?? pose.position.y - WALK_EYE_HEIGHT;
}

/** Apply one complete physical checkpoint, including the floor identity. */
function placePlayerAtCabinPose(pose, { level = null, reason = 'cabin-teleport' } = {}) {
  if (!player || !pose?.position) return false;
  const floorY = floorForCabinPose(pose);
  player._tween = null;
  player.mode = 'walk';
  player.position.copy(pose.position);
  player.ground = floorY;
  player.eyeHeight = WALK_EYE_HEIGHT;
  player.targetEye = WALK_EYE_HEIGHT;
  player.jumpHeight = 0;
  player.grounded = true;
  player.crouching = false;
  player.sprinting = false;
  player.velocity?.set?.(0, 0, 0);
  player.clearKeys?.();
  player.position.y = floorY + WALK_EYE_HEIGHT;
  player.yaw = pose.yaw ?? player.yaw;
  player.pitch = pose.pitch ?? player.pitch;
  player.pitchMin = -Math.PI / 2 + 0.05;
  player.pitchMax = Math.PI / 2 - 0.05;
  player.yawCenter = null;
  state.level = level ?? (floorY < -1 ? 'basement' : 'cabin');
  input?.clear(reason);
  return true;
}

function transitionCabinBasement(direction, detail = {}) {
  const down = direction === 'down';
  if (down) {
    const opened = chapter?.openCellar?.() ?? story.openCellar();
    if (!opened?.ok) {
      hud.toast('Nothing behind the wardrobe');
      return false;
    }
  }
  const pose = down ? cabin?.spawns?.basement : cabin?.spawns?.wardrobeReturn;
  if (!pose || !player || state.resting) return false;
  interaction.setPaused(true);
  const placed = placePlayerAtCabinPose(pose, {
    level: down ? 'basement' : 'cabin',
    reason: `basement-${direction}`,
  });
  interaction.setPaused(false);
  if (!placed) return false;
  input?.refresh(`basement-${direction}`);
  audio.play('door.creak', { volume: 0.24 });
  if (down) {
    const firstEntry = detail?.firstEntry === true || !state.basementVisited;
    state.basementVisited = true;
    if (firstEntry) {
      hud.toast('Hidden basement found', 'good');
      hud.say('Behind the wardrobe, a ladder drops into a stocked room under the cabin.', 4200);
    } else {
      hud.toast('Back in the basement');
      hud.say('Back below. <em>The hideout supplies are still where Lou left them.</em>', 2600);
    }
  } else {
    hud.say('Back through the wardrobe.', 2200);
  }
  return true;
}

const BASEMENT_INSPECTIONS = Object.freeze({
  workbench: Object.freeze({
    toast: 'Repair supplies',
    line: 'Hand tools, wire, spare fittings, and a supply ledger. <em>Enough to keep the cabin running without a trip into town.</em>',
    duration: 4200,
  }),
  shelves: Object.freeze({
    toast: 'Provisions stocked',
    line: 'Water, preserves, dry goods, and sealed tins. <em>Provisions for staying invisible longer than planned.</em>',
    duration: 4000,
  }),
  cot: Object.freeze({
    toast: 'Emergency cot',
    line: 'A narrow cot, a folded blanket, and a pocket book. <em>One more place to sleep if the cabin has to hold somebody.</em>',
    duration: 4000,
  }),
});

function inspectCabinBasement(id) {
  const inspection = BASEMENT_INSPECTIONS[id];
  if (!inspection) return false;
  state.basementInspection = id;
  if (cabin?.state) cabin.state.basementInspection = id;
  hud.toast(inspection.toast);
  hud.say(inspection.line, inspection.duration);
  return true;
}

function presentLagLine(line, actor = cabin?.lag) {
  if (!line?.ok || !actor) return false;
  const spoken = speakLagLine(audio, line, {
    speaker: actor.group,
  });
  const seconds = Math.max(line.seconds, spoken.seconds);
  actor.speakTo(player?.position, seconds, { audio, source: spoken.source });
  hud.say(`<b>Lag:</b> ${line.text}`, Math.round(seconds * 1000));
  return true;
}

function talkToLag(actor = cabin?.lag) {
  for (const landmark of story.explored()) discoverCabin(landmark.id);
  const line = lagHints.talk({ now: state.elapsed });
  return presentLagLine(line, actor);
}

function showPosture(label) {
  state.posture = label;
  postureEl.querySelector('span').textContent = label === 'desk' ? 'leave computer' : 'stand up';
  postureEl.classList.remove('hidden');
  input?.refresh('sit');
}

function hidePosture() {
  state.posture = null;
  postureEl.classList.add('hidden');
  arcade.setSeated?.(false);
  input?.refresh('stand');
}

function sitAt(kind, pose) {
  if (!player || player.mode !== 'walk' || !pose) return;
  if (kind === 'bed') discoverCabin('bedroom');
  else if (kind === 'couch') discoverCabin('entertainment');
  else if (kind === 'desk') discoverCabin('computer');
  player.sitAt(pose, () => {
    showPosture(kind);
    if (kind === 'desk') {
      if (!state.pcOn) {
        state.pcOn = true;
        cabin.setPcOn?.(true);
        arcade.boot();
      }
      arcade.setSeated?.(true);
      input?.refresh('arcade-seat');
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
  if (state.resting) return false;
  discoverCabin('bedroom');
  if (story.chapterComplete()) {
    hud.say('Already slept it off. <em>Ape is waiting by the car.</em>', 3200);
  } else if (story.blackedOut()) {
    hud.say('Wide awake now. <em>Whatever Lag put in the water worked.</em>', 3200);
  } else {
    hud.say('Not yet. <em>Lou said lay low; Gratin apparently heard “build a dungeon.”</em>', 3800);
    hud.toast('Finish the work below first');
  }
  return false;
}

function visitLandmark(id) {
  discoverCabin(id);
  const result = story.visit(id);
  if (!result.ok) return result;
  if (result.firstVisit) {
    audio.play(id === 'creek' ? 'bird' : 'footstep.dirt', { volume: 0.28 });
    const residentAwareLine = {
      shed: 'Axes, fuel tins, a workbench, and a swept patch where Lag keeps the useful tools.',
      firepit: 'Old ash under new cedar. Lag has kept the ring ready without advertising smoke above the road.',
      range: 'Five crude targets, a real backstop, and ten rounds on the chalkboard. Somebody took boredom seriously.',
    }[id];
    hud.say(residentAwareLine ?? result.landmark.line, 5200);
    hud.toast(`${result.landmark.shortLabel} explored`, 'good');
    syncCampaignPresentation();
  } else {
    const company = ['shed', 'firepit'].includes(id) ? ' Lag keeps to his work.' : ' Still nobody around.';
    hud.say(`Been here. <em>${result.landmark.shortLabel}.</em>${company}`, 3000);
  }
  chapter?.notifyLandmark?.(result);
  return result;
}

function leaveCabin() {
  const exit = story.tryLeave();
  if (exit.kind !== 'go') {
    hud.say(exit.line, 3600);
    hud.toast(exit.id === 'cabin_rest_first' ? 'Lay low for the night first' : 'Wait for Lou');
    return false;
  }
  state.phase = 'leaving';
  interaction.setPaused(true);
  // A campaign transition owns the whole browser now. Retire the live input
  // socket and every cabin/radio bed immediately, before the 900 ms curtain,
  // rather than relying on document teardown to release held keys, pointer
  // lock, positional nodes, or an HTML radio element.
  input?.suspend();
  chapter?.stop?.();
  weapons?.stow?.({ silent: true });
  radio.pause();
  audio.stopLoop('cabin.forest', 0.12);
  audio.stopLoop('cabin.fridge', 0.12);
  audio.stopLoop('cabin.firepit', 0.12);
  /* The cabin's door opens twice and it does not always open onto the same
   * road, so the curtain and the destination both come from `tryLeave` now
   * rather than being written into this function.
   *
   * Each departure stamps its OWN clock id. The ledger is exact-once by id --
   * reusing the airstrip run's marker for the drive back to town would find it
   * already spent and move the clock by nothing, which is how a two-hour
   * county road becomes instantaneous. */
  const DEPARTURES = {
    [SCENE_IDS.AIRSTRIP_SMUGGLING]: {
      spawn: 'hangar',
      curtain: 'WHISPERING PINES',
      timeEventId: TIME_EVENT_IDS.DEPART_AIRSTRIP,
    },
    [SCENE_IDS.BADA_BING_TWO]: {
      spawn: 'driver_seat',
      curtain: 'BILLY IS OUT',
      timeEventId: TIME_EVENT_IDS.DEPART_CABIN_FOR_TOWN,
    },
    [SCENE_IDS.SILVER_CASE]: {
      spawn: 'car_ride',
      curtain: 'APE IS WAITING',
      timeEventId: null,
    },
  };
  const departure = DEPARTURES[exit.destination] ?? DEPARTURES[SCENE_IDS.SILVER_CASE];
  if (departure.timeEventId) campaign.advanceTime(departure.timeEventId);
  restCurtain.querySelector('span').textContent = departure.curtain;
  restCurtain.classList.add('active');
  window.setTimeout(() => {
    navigateCampaign(campaign, exit.destination, {
      spawn: departure.spawn,
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
  discoverCabin('kitchen');
  state.fridgeOpen = !state.fridgeOpen;
  cabin.state.fridgeOpen = state.fridgeOpen;
  cabin.setFridge?.(state.fridgeOpen);
  audio.play(state.fridgeOpen ? 'fridge.open' : 'fridge.close', {
    volume: 0.44,
    position: cabin.fridgePos,
  });
}

function cookOrEat() {
  discoverCabin('kitchen');
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
  discoverCabin('bathroom');
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
  discoverCabin('wardrobe');
  state.dressed = true;
  cabin.state.dressed = true;
  hud.toast('Changed into country clothes', 'good');
  hud.say('Same closet. Less city.', 2600);
}

function useToilet() {
  discoverCabin('bathroom');
  hud.say('Indoor plumbing this far out. <em>Lou planned ahead.</em>', 3000);
  audio.play('toilet.lid', { volume: 0.32, position: cabin.toiletSeat });
}

function inspectArt(info) {
  if (info?.slot === 'bed.under' || info?.slot?.startsWith('bed.')) discoverCabin('bedroom');
  const title = info?.title || 'Squatch gear';
  const caption = info?.caption ? ` <em>${info.caption}</em>` : '';
  hud.say(`${title}.${caption}`, 4300);
}

function toggleTelevision() {
  discoverCabin('entertainment');
  state.tvOn = tv.toggle();
  cabin.state.tvOn = state.tvOn;
  hud.toast(state.tvOn ? `Television · ${tv.channel.name}` : 'Television off');
}

function nextTelevision() {
  discoverCabin('entertainment');
  if (!tv.on) toggleTelevision();
  else tv.next();
  hud.toast(`Television · ${tv.channel.name}`);
}

function toggleRadio() {
  discoverCabin('entertainment');
  radio.toggle();
  state.radioOn = radio.on;
  cabin.state.radioOn = state.radioOn;
  hud.toast(state.radioOn ? '97.8 THE SQUATCH' : 'Radio off');
}

function tuneRadio() {
  discoverCabin('entertainment');
  if (!radio.on) radio.turnOn();
  radio.tune();
  state.radioOn = radio.on;
}

function toggleFrontDoor() {
  const opened = cabin.toggleDoor?.();
  audio.play('door.knob', { volume: 0.45 });
  return opened;
}

function setCabinFire(lit) {
  state.fireLit = Boolean(lit);
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
  return state.fireLit;
}

function useFirepit(visitResult = null) {
  discoverCabin('firepit');
  if (state.logsSplit <= 0) {
    hud.toast('Split a log at the woodpile first');
    if (!visitResult?.firstVisit) hud.say('Ring is ready. <em>Needs split cedar.</em>', 2600);
    return false;
  }
  setCabinFire(!state.fireLit);
  hud.toast(state.fireLit ? 'Lit the fire ring' : 'Put the fire out');
  if (!visitResult?.firstVisit) {
    hud.say(state.fireLit
      ? 'Dry cedar catches fast. <em>One small fire, down below the road.</em>'
      : 'Better not advertise the smoke.', 3200);
  }
  return true;
}

function useWoodpile() {
  discoverCabin('woodpile');
  if (!cabin.splitWood?.()) return false;
  state.logsSplit++;
  cabin.state.logsSplit = state.logsSplit;
  audio.play('gun.drop.wood', {
    volume: 0.46,
    position: cabin.landmarks?.woodpile?.position,
  });
  hud.toast(`Split firewood · ${state.logsSplit}`, 'good');
  const reaction = lagHints.reactToChop({ now: state.elapsed });
  presentLagLine(reaction);
  return true;
}

const CLEANUP_TO_STORY_HOSTAGE = Object.freeze(Object.fromEntries(
  Object.entries(STORY_TO_CLEANUP_BODY).map(([storyId, cleanupId]) => [cleanupId, storyId]),
));
const pooledCaptives = new Set();
const lastCaptiveImpact = new Map();

function dungeonActorFor(id) {
  if (!cabin?.basement?.dungeon) return null;
  if (id === CABIN_HOSTAGE_IDS.ATEAM_MEMBER || id === 'ateam' || id === 'a-team-member') {
    return cabin.basement.dungeon.actors.ateam;
  }
  if (id === CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER
    || id === 'counterStrike' || id === 'counterstrike-player') {
    return cabin.basement.dungeon.actors.counterStrike;
  }
  return null;
}

function storyHostageForCleanup(id) {
  return CLEANUP_TO_STORY_HOSTAGE[id] ?? null;
}

function canCleanupWrap(id) {
  const storyId = storyHostageForCleanup(id);
  const hostage = storyId ? story.hostageState(storyId) : null;
  return Boolean(story.nightfallComplete() && hostage?.dead && !hostage.wrapped);
}

function canCleanupCarry(id) {
  const storyId = storyHostageForCleanup(id);
  const hostage = storyId ? story.hostageState(storyId) : null;
  return Boolean(hostage?.wrapped && !hostage.atFire);
}

function canCleanupStage(id) {
  return canCleanupCarry(id) && cabin?.bodyCleanup?.snapshot?.().carryingId === id;
}

function canUseOrdinaryFirepit() {
  return !['wrap_bodies', 'carry_bodies', 'pour_gas', 'ignite_bonfire', 'fire_cleanup', 'drink', 'blackout']
    .includes(story.phase());
}

function useShootingRange(range = cabin?.shootingRange) {
  if (!range) return false;
  const before = range.snapshot();
  const snapshot = range.begin();
  if (weapons?.equipped) {
    hud.toast(before.active ? 'Ten-shot range reset' : 'Ten-shot range started', 'good');
    hud.say('Ten rounds. Painted centre is ten. <em>The backstop is the part you absolutely do not miss.</em>', 3800);
  } else {
    hud.toast('Range found · bring a rifle back');
    hud.say('The range is live, but your hands are empty. <em>There are rifles below the cabin once Gratin opens the way.</em>', 4200);
  }
  renderRangeHud(snapshot);
  return true;
}

function onRangeEvent(event) {
  renderRangeHud(event?.snapshot);
  if (event?.type === 'hit') {
    hud.toast(`Range hit · +${event.delta}`, 'good', 900);
  } else if (event?.type === 'complete') {
    hud.toast(`Range complete · ${event.snapshot.currentScore} points`, 'good', 3200);
  }
}

function handleDungeonDoor(action, event) {
  if (action !== 'open' || event?.allowed === false) return false;
  const result = chapter?.enterDungeon?.();
  if (!result?.ok) return false;
  audio.play('door.creak', { volume: 0.42, position: cabin.basement.dungeon.anchors.door });
  return true;
}

function handleDungeonGratin() {
  const phase = story.phase();
  if (phase === 'interrogation') {
    chapter?.introduceTools?.();
    hud.toast('Gratin is waiting on you');
    return true;
  }
  if (['execution_choice', 'execution'].includes(phase)) {
    hud.say('<b>Gratin:</b> We can continue when you are ready.', 2400);
    return true;
  }
  hud.say('<b>Gratin:</b> One thing at a time, Prospect.', 2400);
  return true;
}

function handleDungeonTool(id) {
  const selectable = new Set(['pliers', 'saw', 'battery', 'syringes', 'towels', 'leads', 'bucket']);
  if (!selectable.has(id)) {
    chapter?.introduceTools?.();
    hud.say(id === 'rack'
      ? 'Old oak, iron rollers, leather restraints. <em>It has seen worse nights than this one.</em>'
      : 'Gratin keeps the whole table clean, ordered, and deeply upsetting.', 3200);
    return true;
  }
  chapter?.selectTool?.(id);
  hud.toast(`${id[0].toUpperCase()}${id.slice(1)} selected`);
  return true;
}

function handleDungeonCaptive(id) {
  const result = chapter?.torture?.(id);
  if (!result?.ok) {
    if (result?.reason === 'interrogation_busy') hud.toast('Let them finish talking');
    else if (result?.reason === 'tool_required') hud.toast('Choose something from the tool table');
    else if (story.executionChoice() === 'player') hud.toast('Gratin gave you the pistol for this');
    return false;
  }
  return true;
}

function renderCombatHud() {
  const snapshot = weapons?.hud?.();
  combatEl?.classList.toggle('hidden', !snapshot);
  if (!snapshot || !combatEl) return;
  combatEl.querySelector('.weapon').textContent = snapshot.name;
  combatEl.querySelector('.ammo').textContent = `${snapshot.rounds}/${snapshot.capacity} · ${snapshot.reserve}`;
  combatEl.querySelector('.reload').textContent = snapshot.reloading ? 'RELOADING' : snapshot.empty ? 'EMPTY · R' : '';
}

/**
 * How far from a thing you can be and still have it caption your screen.
 *
 * Owner, 2026-08-26: *"after going to the shooting range the score Pts are
 * stuck on my hub in bottom left. Should disappear after I walk away"* and
 * *"Radio station always showing in the bottom left maybe only show when in
 * close range of radio like inside the cabin."*
 *
 * Both readouts latched on a STATE -- `snapshot.complete` never goes back to
 * false once a run has ended, and the radio stays on while he walks a ridge
 * -- so both followed him around the property for the rest of the chapter.
 * A readout belongs to a place. 14 m covers the firing line and its bench
 * without reaching the treeline; 9 m is the cabin's own main room from the
 * sideboard the set stands on, so the OSD is up indoors and gone outside.
 */
const RANGE_HUD_RANGE_M = 14;
const RADIO_HUD_RANGE_M = 9;

function nearEnough(point, metres) {
  if (!point || !player?.position) return false;
  return Math.hypot(
    player.position.x - point.x,
    player.position.z - point.z,
  ) <= metres;
}

function renderRangeHud(snapshot = cabin?.shootingRange?.snapshot?.()) {
  if (!rangeEl || !snapshot) return;
  /* A run in progress always shows -- he could be shooting from the back of
   * the firing line. A FINISHED run only shows while he is still standing
   * there to read it. */
  const anchor = cabin?.interactionTargets?.range?.position ?? null;
  const visible = snapshot.active
    || (snapshot.complete && (!anchor || nearEnough(anchor, RANGE_HUD_RANGE_M)));
  rangeEl.classList.toggle('hidden', !visible);
  rangeEl.querySelector('.range-score').textContent = snapshot.active
    ? `${snapshot.currentScore} PTS · ${snapshot.shotsRemaining} SHOTS · ${snapshot.timeRemaining.toFixed(1)}s`
    : `${snapshot.lastScore} PTS · ${snapshot.hits} HITS`;
  rangeEl.querySelector('.range-best').textContent = `BEST ${snapshot.bestScore}`;
}

function setIntoxication(amount = 0) {
  const level = THREE.MathUtils.clamp(Number(amount) || 0, 0, 1);
  if (!intoxicationEl) return;
  intoxicationEl.style.setProperty('--cabin-drunk', String(Math.max(0.08, level * 0.72)));
  intoxicationEl.classList.toggle('active', level > 0.01);
}

function ensurePhoneSelected() {
  weapons?.stow?.({ silent: true });
  if (!cabin.inventory.has('phone')) {
    const inserted = cabin.inventory.add('phone');
    if (!inserted) {
      const replace = cabin.inventory.items.findIndex((item) => item && item !== 'phone');
      if (replace >= 0) cabin.inventory.removeAt(replace, cabin.inventory.items[replace]);
      cabin.inventory.add('phone');
    }
  }
  const slot = cabin.inventory.items.indexOf('phone');
  if (slot >= 0) cabin.inventory.select(slot);
  hud.toast('Phone ringing · E to answer');
  return slot >= 0;
}

function dispatchMargoReady(payload = {}) {
  const eventName = payload.eventName || MARGO_CALL_READY.eventName;
  window.dispatchEvent(new CustomEvent(eventName, {
    detail: Object.freeze({
      sceneId: SCENE_IDS.COUNTRYSIDE_CABIN,
      explorationCount: story.explorationCount(),
      setupBeat: MARGO_CALL_READY.setupBeat,
    }),
  }));
  return true;
}

function ensureConsumable(item) {
  if (!['beer', 'whiskey', 'cigs'].includes(item)) return false;
  weapons?.stow?.({ silent: true });
  if (!cabin.inventory.has(item)) {
    if (cabin.inventory.full) {
      const replace = cabin.inventory.items.findIndex((entry) => ['eggs', 'slice', 'beer', 'whiskey', 'cigs'].includes(entry));
      if (replace >= 0) cabin.inventory.removeAt(replace, cabin.inventory.items[replace]);
    }
    if (!cabin.inventory.add(item)) return false;
  }
  if (item === 'whiskey') cabin.state.whiskeyLeft = Math.max(3, cabin.state.whiskeyLeft || 0);
  if (item === 'cigs') cabin.state.cigsLeft = Math.max(3, cabin.state.cigsLeft || 0);
  const slot = cabin.inventory.items.indexOf(item);
  if (slot >= 0) cabin.inventory.select(slot);
  hud.toast(item === 'beer' ? 'Hold F to drink with them'
    : item === 'whiskey' ? 'Hold F to take the pull'
      : 'Hold F to smoke · Q to pass');
  return slot >= 0;
}

function moveCastToFire() {
  return bonfireCast?.stage?.() ?? false;
}

function captivePresentation(id) {
  const actor = dungeonActorFor(id);
  const hostage = story.hostageState(id);
  if (!actor || !hostage) return null;
  actor.sync({
    pain: hostage.maxHits ? hostage.hits / hostage.maxHits : 0,
    dead: hostage.dead,
    wrapped: hostage.wrapped,
    cause: hostage.dead ? (story.executionChoice() || 'interrogation') : null,
  });
  return actor;
}

function syncDungeonPresentation() {
  const dungeon = cabin?.basement?.dungeon;
  if (!dungeon) return;
  dungeon.setDoorOpen(story.dungeonEntered());
  for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
    const hostage = story.hostageState(id);
    captivePresentation(id);
    if (hostage.dead) killCaptivePresentation(id, hostage, story.executionChoice() || 'restored');
  }
}

function restoreCleanupPresentation() {
  const cleanup = cabin?.bodyCleanup;
  if (!cleanup) return;
  cleanup.sync(cabinCleanupRestoreState({ story, storyToCleanupBody: STORY_TO_CLEANUP_BODY }));
  // Keep the physical carry leg honest across reloads too. Wrapped bodies
  // remain in the dungeon and Gratin remains below until both bundles have
  // actually been carried to the pyre.
  if (story.bodiesAtFire()) moveCastToFire();
}

function woundCaptive(id, impact = null) {
  const actor = dungeonActorFor(id);
  if (!actor) return false;
  actor.flinch?.(1);
  if (!impact?.point || !bloodImpacts) return true;
  const zone = impact.object?.userData?.cabinCaptiveHitZone || 'body';
  const anchor = zone === 'head' ? actor.headAnchor : actor.bodyAnchor;
  bloodImpacts.hit({
    actor,
    anchor,
    spatterAnchor: actor.npc?.parts?.body,
    point: impact.point,
    normal: impact.normal,
    from: impact.origin,
  });
  lastCaptiveImpact.set(id, impact);
  return true;
}

function killCaptivePresentation(id, hostage, cause = 'unknown') {
  const actor = dungeonActorFor(id);
  if (!actor) return false;
  actor.setDead(true, cause);
  if (!pooledCaptives.has(id) && deathPools) {
    const prior = lastCaptiveImpact.get(id);
    const point = prior?.point?.clone?.() ?? actor.bodyAnchor.getWorldPosition(new THREE.Vector3());
    deathPools.spill(point, {
      floorY: cabin.basement.dungeon.bounds.dungeon.floorY,
      size: 1.08,
      opacity: 0.90,
      delay: 0.35,
      seed: id === CABIN_HOSTAGE_IDS.ATEAM_MEMBER ? 31 : 29,
    });
    pooledCaptives.add(id);
  }
  void hostage;
  return true;
}

function handleWeaponImpact(impact) {
  const rangeHit = cabin?.shootingRange?.handleImpact?.(impact);
  if (rangeHit?.applied || rangeHit?.reason === 'lower-zone') return rangeHit;
  let owner = impact?.object ?? null;
  while (owner && !owner.userData?.cabinCaptiveId) owner = owner.parent;
  if (!owner?.userData?.cabinCaptiveId) return null;
  return chapter?.shootHostage?.(owner.userData.cabinCaptiveId, { hitUnits: 4, impact });
}

function handleWeaponEvent(event) {
  cabin?.shootingRange?.handleWeaponEvent?.(event);
  renderCombatHud();
  renderRangeHud();
}

function blackoutToMorning(done) {
  if (state.resting) return false;
  state.resting = true;
  interaction.setPaused(true);
  weapons?.setTrigger?.(false);
  weapons?.setAimed?.(false);
  restCurtain.querySelector('span').textContent = 'THE FIRE FOLDS INTO BLACK';
  restCurtain.classList.add('active');
  audio.stopLoop('cabin.forest', 0.9);
  window.setTimeout(() => {
    syncCampaignPresentation();
    const wake = cabin.spawns?.wake ?? cabin.bedPose;
    placePlayerAtCabinPose(wake, { level: 'cabin', reason: 'cabin-blackout-wake' });
    setIntoxication(0);
    restCurtain.querySelector('span').textContent = 'MORNING · SOMEHOW FINE';
    window.setTimeout(() => {
      restCurtain.classList.remove('active');
      state.resting = false;
      interaction.setPaused(false);
      input?.refresh('cabin-blackout-complete');
      audio.startLoop('cabin.forest', {
        name: 'ambience.course', volume: 0.21, ambience: true, fade: 1.6,
      });
      done?.();
    }, 1150);
  }, 950);
  return true;
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
    onDiscover: discoverCabin,
    onDrawingBoard: () => discoverCabin('drawing-board'),
    onCar: leaveCabin,
    onLeave: leaveCabin,
    onWoodpile: useWoodpile,
    onFirepit: useFirepit,
    canUseOrdinaryFirepit,
    onLag: talkToLag,
    canTalkToLag: () => lagHints.canTalk(state.elapsed),
    onPorch: () => hud.say('No traffic. Just the creek below the trees.', 3000),
    onBasementTransition: transitionCabinBasement,
    onBasementInspect: inspectCabinBasement,
    canRevealBasement: () => chapter?.canRevealBasement?.() ?? story.basementVisible(),
    canOpenDungeonDoor: () => story.cellarOpen(),
    onDungeonDoor: handleDungeonDoor,
    onDungeonGratin: handleDungeonGratin,
    onDungeonCaptive: handleDungeonCaptive,
    onDungeonTool: handleDungeonTool,
    onRangeEvent,
    onRange: useShootingRange,
    canCleanupWrap,
    canCleanupCarry,
    canCleanupStage,
    canCleanupPourGas: () => story.bodiesAtFire() && !story.gasPoured(),
    onCleanupWrap: (id) => chapter?.wrapBody?.(id),
    onCleanupCarry: (id) => chapter?.beginCarry?.(id),
    onCleanupStage: (id) => {
      const staged = cabin?.bodyCleanup?.stage?.(id) ?? false;
      if (staged) state.carryingBody = null;
      return staged;
    },
    onCleanupPlaceAtFire: (id) => chapter?.placeBodyAtFire?.(id),
    onCleanupPourGas: () => chapter?.pourGas?.(),
    onCleanupIgnite: () => chapter?.igniteBonfire?.(),
  });
  bathroomMirror = new PlanarMirror(scene, cabin.mirrorMesh, {
    width: 0.54,
    height: 0.66,
    resolution: [384, 468],
    maxDistance: 9,
    enabled: true,
  });
} catch (error) {
  window.__squatchSceneFail?.('Could not build the cabin', error?.message || String(error));
  throw error;
}

const world = {
  colliders: cabin.colliders,
  floorZones: cabin.floorZones,
  groundAt(x, z) {
    const feetY = player ? player.position.y - player.eyeHeight : 0;
    return cabin.groundAt(x, z, feetY);
  },
};
player = new Player(camera, world);
player.mode = 'walk';
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);
interaction.setOccluders(cabin.occluders ?? []);

const dungeon = cabin.basement.dungeon;
bonfireCast = createCabinBonfireCastStaging({
  lag: cabin.lag,
  gratin: dungeon.actors.gratin,
  seats: cabin.bodyCleanup.dressing.seats,
  fireTarget: cabin.bodyCleanup.interactionTargets.fire,
});
const weaponHitTargets = [
  ...(cabin.occluders ?? []),
  ...(cabin.shootingRange?.hitTargets ?? []),
  ...(dungeon.hitTargets ?? []),
];
bloodImpacts = new BloodImpactSystem(scene);
deathPools = new DeathBloodPool(scene, { capacity: 4, growthSeconds: 0.65 });
weapons = new WeaponSystem({
  camera,
  world: scene,
  audio,
  groundAt: (x, z) => cabin.groundAt(x, z, player.position.y - player.eyeHeight),
  hitTargets: weaponHitTargets,
  range: 90,
  onImpact: handleWeaponImpact,
  onEvent: handleWeaponEvent,
});
armory = mountArmory({
  parent: dungeon.root,
  system: weapons,
  interaction,
  racks: dungeon.armory.racks,
  retainTaken: true,
  enabled: () => state.phase === 'active' && !state.resting && !state.carryingBody,
  addCollider: (x0, x1, y0, y1, z0, z1) => {
    const box3 = new THREE.Box3(
      new THREE.Vector3(x0, y0, z0),
      new THREE.Vector3(x1, y1, z1),
    );
    box3.name = `cabin-dungeon-armory-${cabin.colliders.length}`;
    markSpatialPrimitive(box3, { id: box3.name, kind: 'prop' });
    cabin.colliders.push(box3);
  },
  onEvent: (event) => {
    if (event.type === 'take') {
      const emptyPocket = cabin.inventory.items.findIndex((item) => item === null);
      if (emptyPocket >= 0) cabin.inventory.select(emptyPocket);
      hud.toast(`${weaponDef(event.id).name} ready`, 'good');
    }
    else if (event.type === 'resupply') hud.toast('Ammunition restocked', 'good');
    renderCombatHud();
  },
});

gratinPistol = buildWeaponModel(WEAPON_IDS.PISTOL9);
mountCharacterWeapon(dungeon.actors.gratin.parts, WEAPON_IDS.PISTOL9, gratinPistol, {
  name: 'cabin-dungeon-gratin-pistol',
});
gratinPistol.visible = false;

dialogue = createCabinDialogueDirector({
  audio,
  hud,
  actors: {
    GRATIN: dungeon.actors.gratin,
    ATEAM: dungeon.actors.ateam.npc,
    BAITER: dungeon.actors.counterStrike.npc,
    LAG: cabin.lag,
  },
  onStage: (entry, beatId) => {
    if (beatId === 'EXECUTION_OFFER') gratinPistol.visible = true;
    hud.say(`<em>${entry.stage}</em>`, 3600);
  },
});
executionChoice = createCabinExecutionChoice({ element: choiceEl });
chapter = createCabinChapterRuntime({
  story,
  phone,
  dialogue,
  choice: executionChoice,
  hud,
  callbacks: {
    onSync: () => {
      syncCampaignPresentation();
      syncDungeonPresentation();
    },
    onRestore: () => {
      syncDungeonPresentation();
      restoreCleanupPresentation();
    },
    ensurePhone: ensurePhoneSelected,
    onCallRinging: (definition) => hud.say(`<em>${definition.from} is calling.</em> Select the phone and press E.`, 3000),
    onMargoReady: dispatchMargoReady,
    onDungeonDoorOpen: () => dungeon.setDoorOpen(true),
    onToolSelected: () => audio.play('switch.click', { volume: 0.32, position: dungeon.anchors.worktable }),
    onTortureHit: (id, hostage, tool) => {
      const actor = dungeonActorFor(id);
      actor?.flinch?.(Math.min(1, 0.55 + hostage.hits * 0.08));
      audio.play(tool === 'battery' ? 'punch.heavy' : 'punch.light', {
        volume: 0.58,
        position: actor?.bodyAnchor?.getWorldPosition?.(new THREE.Vector3()),
      });
    },
    onChoiceOpen: () => {
      input?.releasePointerLock?.();
      weapons?.setTrigger(false);
      weapons?.setAimed(false);
    },
    onChoiceClosed: () => {
      input?.refresh('execution-choice-closed');
      requestGamePointerLock();
    },
    onEquipPistol: () => {
      gratinPistol.visible = false;
      const emptyPocket = cabin.inventory.items.findIndex((item) => item === null);
      if (emptyPocket >= 0) cabin.inventory.select(emptyPocket);
      weapons.equip(WEAPON_IDS.PISTOL9);
      renderCombatHud();
      hud.toast('Gratin’s pistol · finish both prisoners', 'bad', 3600);
    },
    onGratinExecutionStart: () => {
      gratinPistol.visible = true;
      weapons.stow({ silent: true });
    },
    onGratinShot: (id) => {
      const actor = dungeonActorFor(id);
      const point = actor?.headAnchor?.getWorldPosition?.(new THREE.Vector3());
      playWeaponCue(audio, WEAPON_IDS.PISTOL9, 'fire', {
        position: dungeon.actors.gratin.group.getWorldPosition(new THREE.Vector3()),
        volume: 0.9,
      });
      woundCaptive(id, {
        point,
        normal: new THREE.Vector3(0, 0, -1),
        origin: dungeon.actors.gratin.group.getWorldPosition(new THREE.Vector3()),
        object: actor?.headTarget,
      });
    },
    onWeaponHit: (id, hostage, impact) => {
      woundCaptive(id, impact);
      void hostage;
    },
    onHostageDeath: killCaptivePresentation,
    onNightfall: ({ restored = false } = {}) => {
      syncCampaignPresentation();
      if (!restored) hud.toast('Night falls over the hideout', 'good', 3400);
    },
    onWrapBody: (cleanupId, storyId) => {
      const wrapped = cabin.bodyCleanup.wrap(cleanupId);
      if (!wrapped) return false;
      dungeonActorFor(storyId)?.setWrapped?.(true);
      audio.play('cloth.snap', { volume: 0.5, position: dungeon.anchors.center });
      audio.play('boat.bag.zip', { volume: 0.44, delay: 0.3, position: dungeon.anchors.center });
      return true;
    },
    onMoveCastToFire: moveCastToFire,
    onBeginCarry: (cleanupId) => {
      const begun = cabin.bodyCleanup.beginCarry(cleanupId, camera);
      if (!begun) return false;
      state.carryingBody = cleanupId;
      weapons.stow({ silent: true });
      player.keys?.delete?.('ShiftLeft');
      player.keys?.delete?.('ShiftRight');
      player.keys?.delete?.('Space');
      player.sprinting = false;
      audio.play('boat.body.drag', { volume: 0.5 });
      hud.toast('Body lifted · walk it outside', 'bad', 2800);
      return true;
    },
    onPlaceBodyAtFire: (cleanupId) => {
      const placed = cabin.bodyCleanup.placeAtFire(cleanupId);
      if (placed) {
        state.carryingBody = null;
        audio.play('boat.body.drag', { volume: 0.58, position: cabin.bodyCleanup.geometry.firepit });
      }
      return placed;
    },
    onPourGas: ({ restored = false } = {}) => {
      if (restored) return true;
      const poured = cabin.bodyCleanup.pourGas();
      if (poured) audio.play('silent.gas.hiss', { volume: 0.46, position: cabin.bodyCleanup.geometry.firepit });
      return poured;
    },
    onIgniteBonfire: ({ restored = false } = {}) => {
      if (restored) {
        setCabinFire(!story.blackedOut());
        return true;
      }
      const ignited = cabin.bodyCleanup.ignite();
      if (ignited) setCabinFire(true);
      return ignited;
    },
    onFireSequenceStart: moveCastToFire,
    onConsumeRequest: ensureConsumable,
    onIntoxication: setIntoxication,
    onBlackout: blackoutToMorning,
    onWakeMorning: () => {
      if (story.blackedOut()) {
        bonfireCast?.restore?.();
        placePlayerAtCabinPose(cabin.spawns.wake, { level: 'cabin', reason: 'cabin-morning-restore' });
        syncCampaignPresentation();
      }
    },
    onChapterComplete: syncCampaignPresentation,
  },
});

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
if (spawn?.position) placePlayerAtCabinPose(spawn, { reason: 'cabin-spawn' });
else placePlayerAtCabinPose({
  position: new THREE.Vector3(18, (cabin.groundAt?.(18, 18, 0) ?? 0) + WALK_EYE_HEIGHT, 18),
  yaw: Math.PI,
  pitch: -0.08,
}, { reason: 'cabin-spawn-fallback' });

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
  chapter?.consume?.(item);
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
  return input?.requestPointerLock() ?? false;
}

input = createFirstPersonInput({
  player,
  canvas,
  interaction,
  // Held consumables are driven by Player.keys so the same key-down state is
  // visible to updateHeldUse(). F is intentionally outside the adapter's
  // movement-only default set and must be declared as part of this scene's
  // capability contract.
  playerKeyCodes: ['KeyF'],
  canEnable: () => state.phase === 'active'
    && !state.paused
    && !state.resting
    && arcade.inputMode !== 'dom',
  canHandleInput: () => state.phase === 'active' && !state.paused && !state.resting,
  controlState: () => ({
    movementEnabled: !state.posture && !executionChoice?.active,
    defaultLookEnabled: state.posture !== 'desk' && !executionChoice?.active,
    interactionEnabled: state.posture !== 'desk' && !executionChoice?.active,
  }),
  routes: {
    keyDown(event, controls) {
      if (state.posture === 'desk' && arcade.onKey(event.code, true)) return true;
      if (!event.repeat && executionChoice?.handleKey?.(event.code)) return true;
      if (controls.code === 'KeyE' && !event.repeat && cabin.inventory.held === 'phone') {
        phone.press();
        return true;
      }
      if (controls.code === 'KeyQ' && !event.repeat) {
        if (chapter?.skipOptionalAction?.()) {
          hud.toast('Passed on the cigarette');
        } else if (state.posture) standUp();
        else if (weapons?.equipped) {
          weapons.stow();
          renderCombatHud();
        } else pocketHeldItem();
        return true;
      }
      if (controls.code === 'KeyR' && !event.repeat) {
        if (weapons?.equipped) weapons.reload();
        else if (radio.on) radio.next();
        return true;
      }
      const number = /^Digit([1-5])$/.exec(event.code)?.[1];
      if (number) {
        cabin.inventory.select(Number(number) - 1);
        if (cabin.inventory.held && weapons?.equipped) {
          weapons.stow();
          renderCombatHud();
        }
        return true;
      }
      return false;
    },
    keyUp(event) {
      if (state.posture !== 'desk') return false;
      return arcade.onKey(event.code, false) === true;
    },
    mouseMove(event) {
      if (state.posture !== 'desk' || arcade.inputMode !== 'relative') return false;
      arcade.onPointer(event.movementX, event.movementY);
      return true;
    },
    mouseDown(event, controls) {
      if (!controls.locked) return false;
      if (event.button === 2) {
        weapons?.setAimed?.(true);
        return true;
      }
      if (event.button !== 0) return true;
      if (state.posture === 'desk') arcade.onClick(true);
      else if (weapons?.equipped && !state.carryingBody) weapons.setTrigger(true);
      else interaction.press();
      return true;
    },
    mouseUp(event) {
      if (event.button === 2) {
        weapons?.setAimed?.(false);
        return true;
      }
      if (event.button !== 0) return false;
      if (state.posture === 'desk') arcade.onClick(false);
      else if (weapons?.equipped) weapons.setTrigger(false);
      else interaction.release();
      return true;
    },
  },
  onClear: () => {
    arcade.onClick(false);
    weapons?.setTrigger?.(false);
    weapons?.setAimed?.(false);
  },
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

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
      'ambience.course', 'bird', 'phone.pickup', 'door.knob', 'door.creak',
      'phone.ring', 'phone.hangup',
      'fridge.open', 'fridge.close', 'switch.click', 'pan.sizzle', 'shower.run', 'toilet.lid',
      'fridge.hum', 'siege.fire.crackle', 'can.crack', 'can.sip', 'can.crush',
      'cig.pack', 'cig.light', 'cig.exhale', 'cig.stub',
      'whiskey.cap', 'whiskey.pour', 'whiskey.swig', 'whiskey.gasp',
      'pizza.take', 'egg.eat', 'tv.click', 'gun.drop.wood',
      'punch.light', 'punch.heavy', 'cloth.snap', 'boat.bag.zip', 'boat.body.drag',
      'silent.gas.hiss', 'heist.bullet.impact',
      ...weaponCueNames(),
      ...cabinScriptCues().map(({ name }) => name),
      ...radio.preloadCueNames({ startupOnly: true }),
    ],
    prefixes: [LAG_VOICE_PREFIX, CABIN_VO_PREFIX],
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
  document.body.classList.add('playing');
  overlay.classList.add('hidden');
  input.refresh('scene-start');
  requestGamePointerLock();
  hud.say(story.chapterComplete()
    ? '<em>Morning at the hideout.</em> Ape is waiting by the car.'
    : '<em>Late morning, county road north.</em> Lou said lay low, walk the property, and keep the phone close.', 5200);
  chapter.start();
  chapter.update(0, { playerPosition: player.position, cabinPosition: { x: 0, z: 0 } });
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
    'With a firearm: Click — fire. Right Click — aim. R — reload. Q — stow.',
    'At Gratin’s decision: 1 — yes. 2 — no. No answer after ten seconds means Gratin handles it.',
    'Explore two property sites, follow the Supreme Leader clue, and finish the work below before morning.',
  ],
  onPause: () => {
    state.paused = true;
    weapons?.setTrigger?.(false);
    weapons?.setAimed?.(false);
    interaction.setPaused(true);
    input.suspend();
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    state.paused = false;
    interaction.setPaused(false);
    audio.ctx?.resume?.();
    lastFrame = performance.now();
    input.resume();
  },
  recovery: createCampaignSceneRecovery({
    campaign,
    sceneId: SCENE_IDS.COUNTRYSIDE_CABIN,
    location,
  }),
});
window.addEventListener('wheel', (event) => {
  if (state.phase !== 'active' || state.posture) return;
  if (cabin.inventory.held === 'phone' && ['messages', 'thread'].includes(phone.screen)) {
    phone.cycle(event.deltaY > 0 ? 1 : -1);
  } else {
    cabin.inventory.cycle(event.deltaY > 0 ? 1 : -1);
  }
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseMenu.pause();
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
      if (state.carryingBody) {
        player.keys?.delete?.('ShiftLeft');
        player.keys?.delete?.('ShiftRight');
        player.keys?.delete?.('Space');
        player.sprinting = false;
      }
      player.update(dt);
      interaction.update(dt);
      updateHeldUse(dt);
      phone.update(dt);
      phone.draw();
      chapter?.update?.(dt, {
        playerPosition: player.position,
        cabinPosition: { x: 0, z: 0 },
      });
      weapons.enabled = !state.resting && !executionChoice?.active && !state.carryingBody;
      weapons.update(dt, {
        speed: Math.hypot(player.velocity?.x || 0, player.velocity?.z || 0),
      });
      bloodImpacts?.update?.(dt);
      deathPools?.update?.(dt);
      radio.update(dt);
      if (tv.update(dt)) tvTexture.needsUpdate = true;
      if (state.posture === 'desk') {
        arcade.update(dt);
        arcadeTexture.needsUpdate = true;
        arcade.placeOverlay?.(cabin.screen, camera, canvas, THREE);
      }
      renderCombatHud();
      renderRangeHud();
      /* `radioPos` is spread onto the cabin's public surface by world.js --
       * the sideboard the set actually stands on, not the room's centre. */
      hud.setRadioAudible(nearEnough(cabin?.radioPos, RADIO_HUD_RANGE_M));
    }
    applyTimeOfDay();
  }
  heldPhone.screen.material.map.needsUpdate = heldPhone.group.visible;
  hud.setClock(time.day, time.clock12, time.elapsedReal);
  audio.updateListener(camera);
  bathroomMirror?.render(renderer, camera);
  renderer.render(scene, camera);
}

window.CABIN = window.COUNTRYSIDE_CABIN = window.__squatchCabin = {
  scene,
  campaign,
  story,
  cabin,
  interaction,
  player,
  get input() { return input; },
  audio,
  radio,
  time,
  state,
  lag: cabin.lag,
  lagHints,
  chapter,
  dialogue,
  executionChoice,
  weapons,
  armory,
  dungeon,
  range: cabin.shootingRange,
  cleanup: cabin.bodyCleanup,
  talkToLag,
  visit: visitLandmark,
  rest: restAtCabin,
  leave: leaveCabin,
  get objectives() { return story.objectives(); },
  transitionBasement: transitionCabinBasement,
  answerCall() {
    if (!phone.ringing) return false;
    ensurePhoneSelected();
    phone.answer();
    return true;
  },
  hangUpCall() {
    if (!phone.call) return false;
    return phone.hangUp() !== false;
  },
  selectDungeonTool: handleDungeonTool,
  torture: (id) => chapter.torture(id),
  chooseExecution: (choice) => executionChoice.choose(choice === 'yes' ? 'player' : 'gratin'),
  shootHostage: (id, hitUnits = 4) => chapter.shootHostage(id, { hitUnits }),
  wrapBody: (id) => chapter.wrapBody(id),
  carryBody: (id) => chapter.beginCarry(id),
  placeBodyAtFire: (id) => chapter.placeBodyAtFire(id),
  pourGas: () => chapter.pourGas(),
  ignitePyre: () => chapter.igniteBonfire(),
  consumeForFire: (item) => chapter.consume(item),
  teleport(id, mode = 'observe') {
    const viewpoint = mode === 'interact'
      ? cabin.interactionViewpoints?.[id]
      : cabin.viewpoints?.[id] ?? cabin.observationViewpoints?.[id];
    if (viewpoint?.position) {
      const placed = placePlayerAtCabinPose(viewpoint, { reason: `debug-viewpoint-${id}` });
      // Keep the longstanding debug-viewpoint contract byte-for-byte: field
      // viewpoints are authored at +1.68 while Player walks at +1.66. The
      // next live frame normalises the two-centimetre camera allowance.
      if (placed) player.position.y = viewpoint.position.y;
      return placed;
    }
    const target = cabin.landmarks?.find?.((entry) => entry.id === id)
      ?? cabin.landmarks?.[id]
      ?? cabin.spawns?.[id]
      ?? cabin.basement?.spawns?.[id]
      ?? dungeon?.spawns?.[id];
    const position = target?.position ?? target?.point;
    if (!position) return false;
    const placed = placePlayerAtCabinPose({ ...target, position }, { reason: `debug-target-${id}` });
    if (placed) player.position.y = player.ground + 1.68;
    return placed;
  },
};

window.__squatchSceneReady?.('CABIN ready');
requestAnimationFrame(frame);
window.setTimeout(() => loading.classList.add('hidden'), 180);
window.setTimeout(() => loading.remove(), 780);
