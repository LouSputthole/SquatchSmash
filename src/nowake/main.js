import * as THREE from 'three';
import { AudioEngine } from '../core/audio.js';
import { AuthoredClock } from '../core/authored-clock.js';
import {
  MISSION_IDS, SCENE_IDS, createCampaign, createCampaignRadioAdapter, navigateCampaign,
} from '../core/campaign.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { createNoWakeStory } from '../core/no-wake-story.js';
import { Player } from '../core/player.js';
import { PostFX } from '../core/postfx.js';
import { Radio } from '../core/radio.js';
import { BulletHoles } from '../world/bullets.js';
import { makeNineMillimeterPistol, makeRevolver } from '../world/props.js';
import {
  NO_WAKE_AMBIENT_LINES,
  NO_WAKE_AFTERMATH_LINES,
  NO_WAKE_BELOW_LINES,
  NO_WAKE_EPILOGUE_LINE,
  NO_WAKE_START_LINES,
  buildNoWakeConfrontation,
} from './dialogue.js';
import { NoWakeEngineAudio, noWakeAudioLoadOptions } from './audio.js';
import { NoWakeCameraDirector } from './camera-director.js';
import { BoatPhysics } from './physics.js';
import { buildNoWakeWorld } from './world.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { isPreviewMode } from '../core/preview-mode.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startButton = document.getElementById('start-btn');
const objectiveEl = document.getElementById('objective');
const objectiveDetailEl = document.getElementById('objective-detail');
const helmHud = document.getElementById('helm-hud');
const throttleReadout = document.getElementById('throttle-readout');
const speedReadout = document.getElementById('speed-readout');
const rpmReadout = document.getElementById('rpm-readout');
const routeProgress = document.getElementById('route-progress');
const executionPrompt = document.getElementById('execution-prompt');
const speakerEl = document.getElementById('speaker');

/* ------------------------------------------------------------------ */
/* Preview checkpoint shortcuts (?preview=1&checkpoint=...)            */
/*
 * LOCAL support only, deliberately -- mirrors src/enolasquatch/main.js's
 * own CHECKPOINT_ALIASES rather than routing through src/core/preview-mode.js,
 * whose two checkpoint parsers (Heist's and Beef Run's) are each a different
 * scene's own vocabulary and neither can be taught NO WAKE's checkpoints
 * without changing a file those two scenes depend on. NO WAKE is
 * campaign-owned, so this is gated on the shared, scene-agnostic
 * `isPreviewMode()` the same way Enola's is -- a bare `?checkpoint=` on an
 * ordinary link must do nothing.
 *
 * Only `dock`/`underway`/`open_water`/`execution` are the mission's real,
 * saveable checkpoints (see `CHECKPOINTS` in src/core/no-wake-story.js). The
 * owner's waypoints below map onto that vocabulary where one exists
 * (`underway`, `inlet` -> `open_water`) and pose the later beats directly
 * where it doesn't -- `confrontation`/`body`/`return` replay the mission's own
 * progression functions (`beginConfrontation`, `prepareGuns`/`willyReturns`,
 * `fireExecution`, `disposeBody`) in order, the same way
 * src/mansion/siege/main.js's `jumpToCheckpoint` walks its own beat chain
 * instead of assigning `state.phase` by hand.
 */
const NO_WAKE_CHECKPOINT_ALIASES = Object.freeze({
  dock: 'dock',
  underway: 'underway',
  inlet: 'inlet',
  confrontation: 'confrontation',
  body: 'body',
  weighted: 'body',
  return: 'return',
});
const NO_WAKE_CHECKPOINT_LABELS = Object.freeze({
  dock: 'GATE C — ABOARD',
  underway: 'UNDERWAY — CLEAR OF THE MARINA',
  inlet: 'THE INLET — OPEN WATER, IDLE',
  confrontation: 'THE CONFRONTATION',
  body: 'THE BODY',
  return: 'THE RIDE HOME',
});
function previewCheckpointForLocation(locationLike = window.location) {
  // Same gate as `src/core/preview-mode.js`'s own checkpoint parsers: a bare
  // `?checkpoint=` on an ordinary link does nothing without `?preview=1`
  // alongside it, so a shared preview link cannot be mistaken for a normal
  // campaign entry.
  if (!isPreviewMode(locationLike)) return null;
  let params;
  try { params = new URLSearchParams(locationLike?.search || ''); } catch { return null; }
  const value = params.get('checkpoint');
  return value && Object.prototype.hasOwnProperty.call(NO_WAKE_CHECKPOINT_ALIASES, value)
    ? NO_WAKE_CHECKPOINT_ALIASES[value]
    : null;
}
/** Resolved once at boot -- a real waypoint id, or null for the ordinary opening. */
const previewCheckpoint = previewCheckpointForLocation();
if (previewCheckpoint) {
  const label = NO_WAKE_CHECKPOINT_LABELS[previewCheckpoint] ?? previewCheckpoint;
  const tag = overlay?.querySelector('.tag');
  if (tag) tag.textContent = `Preview checkpoint: ${label}. Progress on this page is temporary.`;
  if (startButton) startButton.textContent = `Start at ${label.toLowerCase()}`;
}

const campaign = createCampaign();
const story = createNoWakeStory({ campaign });
let entry = story.canBegin();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, .04, 1800);
scene.add(camera);
const world = buildNoWakeWorld(scene);
const hud = new Hud();
const sceneInventory = new SceneInventoryBar({ slots: 5, visible: false });
const player = new Player(camera, world);
const interaction = new InteractionSystem(camera, hud);
const audio = new AudioEngine();
const engineAudio = new NoWakeEngineAudio(audio);
const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
if (postfx.bloom) {
  postfx.bloom.threshold = 1.18;
  postfx.bloom.strength = .25;
}
const physics = new BoatPhysics();
const blood = new BulletHoles(scene, 'blood');

const state = {
  phase: 'dock',
  boarded: false,
  boarding: false,
  battery: false,
  blower: false,
  engine: false,
  bowLine: false,
  sternLine: false,
  atHelm: false,
  driveSeconds: 0,
  dialogue: null,
  dialogueLog: [],
  aftermathCueLog: [],
  aftermathVoiceQueue: [],
  aftermathVoiceActive: null,
  aftermathVoiceTimer: null,
  ambientIndex: 0,
  phaseTime: 0,
  executionShots: 0,
  bodyDisposed: false,
  returnFrom: new THREE.Vector3(),
  returnControl: new THREE.Vector3(),
  returnTo: new THREE.Vector3(),
  returnHeading: 0,
  nextGullAt: 8,
  nextCreakAt: 5,
  leaving: false,
};

const DRIVE_SECONDS = 90;
/** How long the cruiser takes to come about at the head of the ride home. */
const COME_ABOUT_SECONDS = 4.5;
const boat = world.boat;
const cameraDirector = new NoWakeCameraDirector(camera, boat);
const radioClock = new AuthoredClock(12.75);
radioClock.setTime(3, 12 * 60 + 45);
const radio = new Radio(audio, hud, radioClock, {
  venue: 'apartment',
  state: createCampaignRadioAdapter(campaign, {
    receiverId: 'no_wake_boat',
    defaultPower: false,
  }),
  canPlayNotice: () => false,
  /* A cockpit stereo on an open deck with two diesels running under it, not a
   * bedside receiver: this one physical set is louder than the shared volume
   * knob alone would make it. `output` is not saved, so turning the boat up
   * cannot turn the apartment up with it. */
  output: 1.45,
});
const radioPosition = new THREE.Vector3();
boat.targets.radio.getWorldPosition(radioPosition);
radio.setPosition(radioPosition);
const radioReady = radio.loadManifest();
const local = new THREE.Vector3();
const carriedLocal = new THREE.Vector3();
const carriedWorld = new THREE.Vector3();
const localCamera = new THREE.Vector3();
const returnTangent = new THREE.Vector3();
let lastHeading = 0;
let lastTime = performance.now();
let elapsed = 0;

function setObjective(title, detail = '') {
  objectiveEl.textContent = title;
  objectiveDetailEl.textContent = detail;
}

function phase(next) {
  state.phase = next;
  state.phaseTime = 0;
}

function showSpeaker(who, text) {
  speakerEl.querySelector('small').textContent = who;
  speakerEl.querySelector('span').textContent = text;
  speakerEl.classList.remove('hidden');
  state.dialogueLog.push({ who, text });
}

function hideSpeaker() {
  speakerEl.classList.add('hidden');
}

/**
 * Accept either one exact future cue (`vo.nowake.lou.1`) or a generated
 * variant bank (`vo.nowake.lou.1.*`). Until those recordings exist the
 * authored subtitle and reading beat remain the complete delivery.
 */
function playDialogueCue(group, speaker = null, seconds = 0) {
  const exact = `vo.${group}`;
  let source = null;
  if (audio.buffers.has(exact)) {
    source = audio.play(exact, { volume: .85 });
  } else if (audio.say(group)) {
    source = audio.spokenSource();
  }
  /* And the man on the deck says it. `line.voice` is his key in `boat.cast`,
   * so the mouth that moves is the one the subtitle names, and it runs on the
   * take rather than on the reading beat -- see src/core/mouth.js. Lines
   * without a recording still animate, on the fallback, for `seconds`. */
  const npc = speaker ? boat.cast?.[speaker] : null;
  npc?.say?.(Math.max(1.4, seconds || 2.4), source ? { audio, source } : null);
  return Boolean(source);
}

function dialogue(lines, done) {
  state.dialogue = { lines, at: -1, left: 0, done };
  document.body.classList.add('cinematic');
  interaction.setPaused(true);
  advanceDialogue();
}

function advanceDialogue() {
  const d = state.dialogue;
  if (!d) return;
  d.at++;
  if (d.at >= d.lines.length) {
    const done = d.done;
    state.dialogue = null;
    hideSpeaker();
    document.body.classList.remove('cinematic');
    done?.();
    return;
  }
  const line = d.lines[d.at];
  /* Queue the line behind the one before it. The authored reading beat is a
   * guess at how long a take will run, and some of them run longer: Irish's
   * "He was asked" is 6.2 s of subtitle over an 8.0 s recording, so the next
   * line -- Willy asking for the head -- used to start on top of it and cut
   * him off, because `audio.say` allows one voice at a time. */
  d.left = voiceWindow(line, line.seconds ?? Math.max(2.6, Math.min(6.2, line.text.length / 15)));
  showSpeaker(line.who, line.text);
  playDialogueCue(`nowake.${line.cue}`, line.voice, d.left);
  audio.hold(d.left);
  if (line.focus) {
    state.focus = line.focus;
    cameraDirector.frameSpeaker(line.focus);
  }
}

function updateDialogue(dt) {
  if (!state.dialogue) return;
  state.dialogue.left -= dt;
  if (state.dialogue.left <= 0) advanceDialogue();
}

function registerInteractions() {
  interaction.register(boat.targets.board, {
    label: 'Step aboard <em>Lou’s cruiser</em>',
    enabled: () => !state.boarded && !state.boarding,
    onUse: beginBoarding,
  });
  interaction.register(boat.targets.battery, {
    label: () => state.battery ? 'Battery switch <em>ON</em>' : 'Turn on battery switch',
    enabled: () => state.boarded && !state.battery,
    onUse: () => {
      state.battery = true;
      boat.controls.battery.setOn(true);
      audio.play('switch.click', { volume: .75 });
      hud.toast('Battery on', 'good');
    },
  });
  interaction.register(boat.targets.blower, {
    label: () => state.blower ? 'Bilge blower <em>RUNNING</em>' : 'Run bilge blower',
    enabled: () => state.battery && !state.blower,
    hold: 1.1,
    onUse: () => {
      state.blower = true;
      boat.controls.blower.setOn(true);
      audio.play('switch.click', { volume: .7 });
      audio.startLoop('bilge', { name: 'pc.fan', volume: .08 });
      hud.toast('Bilge clear', 'good');
    },
  });
  interaction.register(boat.targets.ignition, {
    label: () => !state.blower ? 'Run the blower first' : 'Turn ignition',
    enabled: () => state.battery && !state.engine,
    hold: .8,
    onUse: () => {
      if (!state.blower) {
        hud.say('Lou would hear that explosion from the parking lot.', 3500);
        return;
      }
      state.engine = true;
      boat.controls.ignition.setOn(true);
      physics.running = true;
      audio.stopLoop('bilge', .25);
      audio.play('switch.click', { volume: .7 });
      audio.play('boat.engine.start', { volume: 1 });
      audio.startLoop('engine-idle', { name: 'boat.engine.idle', volume: .34, fade: .55 });
      engineAudio.start();
      setObjective('Release the mooring lines', 'Bow and stern · then take the helm');
      hud.toast('Twin diesels alive', 'good');
    },
  });
  interaction.register(boat.targets.radio, {
    label: () => (radio.on
      ? 'Turn off the <b>boat radio</b> · hold to <b>tune</b> &nbsp;<span style="opacity:.6">[R] skip</span>'
      : 'Turn on the <b>boat radio</b> · hold to <b>tune</b>'),
    enabled: () => state.boarded && !state.dialogue,
    hold: .8,
    onTap: () => {
      radio.toggle();
      boat.controls.radio.setOn(radio.on);
      hud.toast(radio.on ? `${radio.station.dial} · ${radio.station.name}` : 'Boat radio off');
    },
    onUse: () => {
      radio.tune();
      boat.controls.radio.setOn(radio.on);
      hud.toast(`${radio.station.dial} · ${radio.station.name}`);
    },
  });
  for (const [key, target, name] of [
    ['bowLine', boat.targets.bowLine, 'bow'], ['sternLine', boat.targets.sternLine, 'stern'],
  ]) {
    interaction.register(target, {
      label: `Release ${name} line`,
      enabled: () => state.engine && !state[key],
      hold: .85,
      onUse: (line) => {
        state[key] = true;
        line.userData.attached = false;
        line.visible = false;
        audio.play('boat.rope.release', { volume: .78, rate: .8 });
        hud.toast(`${name[0].toUpperCase()}${name.slice(1)} line clear`, 'good');
        if (state.bowLine && state.sternLine) {
          physics.mooringReleased = true;
          setObjective('Take the helm', 'Reverse clear of Gate C');
        }
      },
    });
  }
  interaction.register(boat.targets.helm, {
    label: 'Take the helm',
    enabled: () => state.engine && state.bowLine && state.sternLine && !state.atHelm,
    onUse: enterHelm,
  });
  /* The proxy carries the hold; the figure keeps it so that looking straight
   * at the man still says his name. Either one starts the same lift. */
  for (const target of [boat.targets.body, boat.cast.willy.group]) {
    interaction.register(target, {
      label: 'Roll Willy to the transom',
      holdLabel: 'Move the body overboard',
      hold: .85,
      enabled: () => state.phase === 'body' && !state.bodyDisposed,
      onUse: disposeBody,
    });
  }
}

/** Cross the visible boarding platform instead of teleporting through it. */
function beginBoarding() {
  if (state.boarded || state.boarding) return false;
  state.boarding = true;
  player.clearKeys();
  interaction.setPaused(true);
  const deck = boat.root.localToWorld(new THREE.Vector3(-1.68, 2.68, 3.72));
  const yaw = boat.root.rotation.y;
  setObjective('Step aboard', 'Cross the boarding platform to the port deck');
  audio.play('boat.board.step', { volume: .8 });
  player.sitAt({
    position: deck,
    yaw,
    pitch: -.10,
    dur: 1.15,
    yawRange: Math.PI,
  }, () => {
    state.boarding = false;
    state.boarded = true;
    boat.boardingBridge.visible = false;
    boat.targets.board.visible = false;
    player.mode = 'walk';
    player.enabled = document.pointerLockElement === canvas;
    player.ground = boat.root.position.y + boat.deck.height;
    player.eyeHeight = 1.66;
    player.targetEye = 1.66;
    player.yawCenter = null;
    player.yawRange = Math.PI;
    interaction.setPaused(false);
    hud.toast('Aboard · Gate C', 'good');
    setObjective('Start the boat', 'Battery · blower · ignition');
    story.checkpoint('dock');
  });
  return true;
}

function enterHelm() {
  state.atHelm = true;
  if (state.phase !== 'coast') phase('drive');
  player.mode = 'seated';
  player.enabled = true;
  player.yawCenter = null;
  player.yawRange = Math.PI;
  player.pitchMin = -.65;
  player.pitchMax = .42;
  player.yaw = physics.heading;
  player.pitch = -.05;
  player.position.copy(boat.root.localToWorld(new THREE.Vector3(.14, 2.43, .24)));
  physics.throttle = 0;
  physics.steer = 0;
  physics.helmAttended = true;
  lastHeading = physics.heading;
  boat.controls.throttle.setValue(0);
  helmHud.classList.remove('hidden');
  setObjective('Run for open water', 'Clear the marina · follow the channel markers');
  story.checkpoint('underway');
  hud.say('Easy astern. Get the stern clear, then take her out.', 4300);
}

function setStartupCompleteVisuals() {
  boat.boardingBridge.visible = false;
  boat.targets.board.visible = false;
  boat.controls.battery.setOn(true);
  boat.controls.blower.setOn(true);
  boat.controls.ignition.setOn(true);
  for (const line of [boat.targets.bowLine, boat.targets.sternLine]) {
    line.userData.attached = false;
    line.visible = false;
  }
}

function driveLine(line) {
  showSpeaker(line.who, line.text);
  playDialogueCue(`nowake.${line.cue}`, line.voice, 4.6);
  audio.hold(4.6);
  setTimeout(() => {
    if (!state.dialogue && ['drive', 'coast'].includes(state.phase)) hideSpeaker();
  }, 4700);
}

function nonBlockingLine(line, seconds = 3.2) {
  const token = {};
  state.nonBlockingLine = token;
  showSpeaker(line.who, line.text);
  playDialogueCue(`nowake.${line.cue}`, line.voice, seconds);
  audio.hold(seconds);
  setTimeout(() => {
    if (state.nonBlockingLine === token && !state.dialogue) hideSpeaker();
  }, seconds * 1000);
}

function playDockInstructions() {
  nonBlockingLine(NO_WAKE_START_LINES[0], 4.5);
  setTimeout(() => {
    if (!document.body.classList.contains('playing') || state.dialogue) return;
    nonBlockingLine(NO_WAKE_START_LINES[1], 4.2);
  }, 4700);
}

function updateHarborWildlife() {
  if (!document.body.classList.contains('playing')) return;
  if (elapsed >= state.nextGullAt) {
    const cue = audio.buffers.has('seagull.distant') ? 'seagull.distant' : 'bird';
    audio.play(cue, { volume: cue === 'bird' ? .10 : .26, rate: .88 + Math.random() * .18 });
    state.nextGullAt = elapsed + 10 + Math.random() * 15;
  }
  if (elapsed >= state.nextCreakAt && audio.buffers.has('boat.hull.creak')) {
    audio.play('boat.hull.creak', { volume: .15, rate: .92 + Math.random() * .12 });
    state.nextCreakAt = elapsed + 7 + Math.random() * 12;
  }
}

/**
 * How long a line owns the voice channel. Used by every spoken beat in the
 * mission: the blocking confrontation, the below-decks pair and the queued
 * aftermath all measure a line the same way.
 */
function voiceWindow(line, authoredSeconds) {
  const prefix = `vo.nowake.${line.cue}`;
  let decodedSeconds = 0;
  for (const name of audio.buffers.keys()) {
    if (name !== prefix && !name.startsWith(`${prefix}.`)) continue;
    decodedSeconds = Math.max(decodedSeconds, audio.sampleDuration(name) ?? 0);
  }
  // The authored reading beat is the minimum. A longer delivered take owns
  // the voice channel until its sample has actually finished.
  return Math.max(authoredSeconds, decodedSeconds + .18);
}

function scheduleAftermathVoice() {
  if (state.aftermathVoiceActive || state.aftermathVoiceTimer) return;
  const entry = state.aftermathVoiceQueue[0];
  if (!entry) return;
  const now = performance.now() / 1000;
  const waitSeconds = Math.max(0, entry.notBefore - now);
  state.aftermathVoiceTimer = setTimeout(() => {
    state.aftermathVoiceTimer = null;
    const startedAt = performance.now() / 1000;
    entry.status = 'started';
    entry.startAt = startedAt;
    entry.endAt = startedAt + entry.windowSeconds;
    state.aftermathVoiceActive = entry;
    nonBlockingLine(entry.line, entry.windowSeconds);
    state.aftermathVoiceTimer = setTimeout(() => {
      entry.status = 'complete';
      entry.completedAt = performance.now() / 1000;
      state.aftermathVoiceQueue.shift();
      state.aftermathVoiceActive = null;
      state.aftermathVoiceTimer = null;
      scheduleAftermathVoice();
    }, entry.windowSeconds * 1000);
  }, waitSeconds * 1000);
}

function queueAftermathLine(line, authoredSeconds, { delay = 0 } = {}) {
  const requestedAt = performance.now() / 1000;
  const notBefore = requestedAt + delay;
  const windowSeconds = voiceWindow(line, authoredSeconds);
  const predecessor = state.aftermathCueLog.at(-1);
  const startAt = Math.max(notBefore, predecessor?.endAt ?? notBefore);
  const entry = {
    cue: line.cue,
    who: line.who,
    text: line.text,
    line,
    requestedAt,
    notBefore,
    windowSeconds,
    startAt,
    endAt: startAt + windowSeconds,
    status: 'queued',
  };
  state.aftermathCueLog.push(entry);
  state.aftermathVoiceQueue.push(entry);
  scheduleAftermathVoice();
  return entry;
}

function reachOpenWater() {
  if (state.phase !== 'drive') return;
  phase('coast');
  story.checkpoint('open_water');
  setObjective('Bring her to idle', 'Open water · throttle back to neutral');
  hud.say('That is far enough. Bring her down.', 3800);
}

function beginConfrontation() {
  if (state.phase !== 'coast') return;
  phase('confrontation');
  physics.throttle = 0;
  physics.helmAttended = false;
  audio.stopLoop('engine-idle', .65);
  audio.stopLoop('underway', .65);
  audio.stopLoop('wake', .65);
  engineAudio.stop(.55);
  audio.play('boat.engine.shutdown', { volume: .95 });
  state.atHelm = false;
  helmHud.classList.add('hidden');
  player.mode = 'frozen';
  if (radio.on) {
    // Willy owns this silence, not the physical switch the player chose.
    radio.turnOff({ remember: false });
    boat.controls.radio.setOn(false);
  }
  setObjective('Listen', 'The engines tick in the swell');
  const motel = campaign.state.missions[MISSION_IDS.JERKY_MOTEL];
  const beef = campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
  dialogue(buildNoWakeConfrontation({
    beefDetected: beef.detected,
    motelPoliceHeat: motel.policeHeat,
  }), willyBelow);
}

function willyBelow() {
  phase('below');
  setObjective('Wait', 'Willy went below');
  state.willyStartZ = boat.cast.willy.group.position.z;
  state.focus = null;
  setTimeout(() => {
    if (state.phase !== 'below') return;
    prepareGuns();
    dialogue(NO_WAKE_BELOW_LINES, willyReturns);
  }, 4300);
}

function executionGun(model, name, calibre, scale = 1) {
  const gun = model.group;
  gun.name = name;
  gun.scale.setScalar(scale);
  gun.userData.weaponModel = calibre;
  gun.userData.muzzle = model.muzzle.clone();
  return gun;
}

function prepareGuns() {
  if (state.gunsReady) return;
  state.gunsReady = true;
  state.louGun = executionGun(
    makeNineMillimeterPistol(null, { x: 0, y: 0, z: 0 }),
    'Lou 9mm pistol', '9mm semi-automatic', 1.15,
  );
  state.booskiGun = executionGun(
    makeNineMillimeterPistol(null, { x: 0, y: 0, z: 0 }),
    'Booski 9mm pistol', '9mm semi-automatic', 1.15,
  );
  boat.cast.lou.parts.foreR.add(state.louGun);
  boat.cast.booski.parts.foreR.add(state.booskiGun);
  state.louGun.position.set(0, -.20, -.10);
  state.louGun.rotation.set(-.05, 0, 0);
  state.booskiGun.position.copy(state.louGun.position);
  state.booskiGun.rotation.copy(state.louGun.rotation);
  for (const gun of [state.louGun, state.booskiGun]) {
    gun.userData.basePosition = gun.position.clone();
    gun.userData.baseRotation = gun.rotation.clone();
    gun.userData.recoil = 0;
  }
  state.playerGun = executionGun(
    makeRevolver(null, { x: 0, y: 0, z: 0 }),
    'Tony revolver', 'six-shot revolver', 1.35,
  );
  state.playerGun.position.set(.20, -.24, -.34);
  state.playerGun.rotation.set(.06, -.16, 0);
  state.playerGun.visible = false;
  camera.add(state.playerGun);
  sceneInventory.set([{ icon: '🔫', label: "Tony's revolver · concealed" }]);
}

function willyReturns() {
  phase('ready_to_fire');
  boat.cast.lou.group.position.set(-1.45, 1.02, 2.72);
  boat.cast.lou.group.rotation.y = 0;
  boat.cast.booski.group.position.set(1.45, 1.02, 2.90);
  boat.cast.booski.group.rotation.y = 0;
  /* Irish closes up with them but stays a pace forward of the firing line, so
   * the shot that follows is plainly two men and a prospect and not three men
   * and a witness. */
  boat.cast.irish.group.position.set(-.62, 1.02, 1.94);
  boat.cast.irish.group.rotation.y = 0;
  boat.cast.willy.job = 'stand';
  boat.cast.willy._syncJob(true);
  boat.cast.willy.group.position.set(0, 1.02, 4.48);
  boat.cast.willy.group.rotation.y = Math.PI;
  state.playerGun.visible = true;
  player.mode = 'frozen';
  player.position.copy(boat.root.localToWorld(new THREE.Vector3(0, 2.68, 1.72)));
  player.yaw = physics.heading + Math.PI;
  player.pitch = -.08;
  interaction.setPaused(true);
  setObjective('Do what Lou brought you here to do', 'Willy is back on deck');
  executionPrompt.classList.remove('hidden');
  state.focus = 'willy';
  cameraDirector.frameExecution();
  hud.say('Willy comes back up. Lou does not look at you.', 4200);
}

function fireExecution() {
  if (state.phase !== 'ready_to_fire') return;
  phase('execution');
  executionPrompt.classList.add('hidden');
  story.checkpoint('execution');
  const impact = boat.cast.willy.group.localToWorld(new THREE.Vector3(0, 1.35, .22));
  const normal = camera.position.clone().sub(impact).normalize();
  audio.play('boat.gunshot.deck', { volume: 1 });
  const playerMuzzle = state.playerGun.localToWorld(state.playerGun.userData.muzzle.clone());
  blood.muzzle(playerMuzzle);
  showShotTracer(playerMuzzle, impact, 0xffe2a3);
  /* On the man, not in the air where he was standing. A wound written into
   * world space hangs at chest height while he falls, and then the cruiser
   * drives home and leaves it four hundred metres offshore. */
  blood.punchAttached(boat.cast.willy.group, impact, normal);
  state.executionShots = 1;
  state.playerGun.rotation.x = .32;
  setTimeout(() => npcShot(boat.cast.lou, state.louGun), 210);
  setTimeout(() => npcShot(boat.cast.booski, state.booskiGun), 390);
  setTimeout(() => npcShot(boat.cast.lou, state.louGun), 650);
  setTimeout(dropWilly, 760);
}

function npcShot(npc, gun) {
  if (state.phase !== 'execution') return;
  const muzzle = gun.localToWorld(gun.userData.muzzle.clone());
  audio.play('boat.gunshot.deck', { volume: .92, position: muzzle });
  blood.muzzle(muzzle);
  const impact = boat.cast.willy.group.localToWorld(new THREE.Vector3(
    (Math.random() - .5) * .18, 1.2 + Math.random() * .35, .18,
  ));
  showShotTracer(muzzle, impact, 0xffc86b);
  blood.punchAttached(
    boat.cast.willy.group, impact, camera.position.clone().sub(impact).normalize(),
  );
  state.executionShots++;
  gun.userData.recoil = 1;
  npc.speaking = .2;
}

function showShotTracer(from, to, colour) {
  const tracer = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([from, to]),
    new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: .95 }),
  );
  tracer.name = 'no-wake-shot-tracer';
  tracer.renderOrder = 1200;
  scene.add(tracer);
  setTimeout(() => {
    scene.remove(tracer);
    tracer.geometry.dispose();
    tracer.material.dispose();
  }, 95);
}

function poseExecutionShooter(npc, gun, dt) {
  if (!npc || !gun) return;
  npc.parts.armR.rotation.set(-1.18, 0, .08);
  npc.parts.foreR.rotation.set(-.28, 0, 0);
  npc.parts.armL.rotation.set(-1.00, 0, -.18);
  npc.parts.foreL.rotation.set(-.72, 0, 0);
  gun.userData.recoil = Math.max(0, (gun.userData.recoil ?? 0) - dt * 7.5);
  const kick = gun.userData.recoil;
  gun.position.copy(gun.userData.basePosition);
  gun.position.z -= kick * .075;
  gun.rotation.copy(gun.userData.baseRotation);
  gun.rotation.x -= kick * .34;
}

/**
 * What lands on the deck stays on the deck. Laid flat in the boat's own frame
 * against the deck plane, so it sits on the boards under the body instead of
 * floating, keeps its place while the hull heaves, and is still there on the
 * ride home after the man himself has gone over the side.
 */
function spatterDeck(x, z) {
  boat.root.updateMatrixWorld(true);
  const at = boat.root.localToWorld(new THREE.Vector3(x, boat.deck.height, z));
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(boat.root.quaternion).normalize();
  blood.punchAttached(boat.root, at, up);
}

function dropWilly() {
  if (state.phase !== 'execution') return;
  phase('body');
  boat.cast.willy.group.rotation.z = -1.38;
  // Npc origins sit at the feet. Once rotated onto his side the old .48 pivot
  // buried nearly all of Willy below the deck, leaving only a leg visible.
  boat.cast.willy.group.position.y = 1.06;
  spatterDeck(-.14, 4.26);
  spatterDeck(.32, 4.58);
  spatterDeck(.04, 4.88);
  state.playerGun.visible = false;
  state.focus = null;
  cameraDirector.frameCollapse();
  player.mode = 'frozen';
  interaction.setPaused(true);
  document.body.classList.add('cinematic');
  audio.play('drunk.collapse', { volume: .78 });
  setObjective('Willy is down', 'Watch the deck');
  queueAftermathLine(NO_WAKE_AFTERMATH_LINES.move, 4.0, { delay: .22 });
  queueAftermathLine(NO_WAKE_AFTERMATH_LINES.irishRail, 4.4);
  setTimeout(enableBodyInteraction, 1250);
}

function enableBodyInteraction() {
  if (state.phase !== 'body' || state.bodyDisposed) return;
  cameraDirector.clear();
  document.body.classList.remove('cinematic');
  boat.bodyMarker.visible = true;
  player.clearKeys();
  player.mode = 'walk';
  player.enabled = true;
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.ground = boat.root.position.y + boat.deck.height;
  /* Stand him off the body rather than over it. The old mark put his eye 0.2 m
   * horizontally from a man lying on the deck, so the look vector below came
   * out at nearly eighty degrees down — at the clamp, and grazing. From here
   * the body sits a comfortable pace ahead and about forty-five degrees down. */
  player.position.copy(boat.root.localToWorld(new THREE.Vector3(-.05, 2.68, 3.28)));
  player.velocity.set(0, 0, 0);
  player.yawCenter = null;
  player.yawRange = Math.PI;
  player.pitchMin = -Math.PI / 2 + .05;
  player.pitchMax = Math.PI / 2 - .05;
  // Settle the walking capsule before deriving the aim; the old stern pose sat
  // inside the bench collider and invalidated the angle one frame later.
  player.update(.016);
  const target = new THREE.Box3().setFromObject(boat.cast.willy.group)
    .getCenter(new THREE.Vector3());
  const delta = target.sub(player.position);
  player.yaw = Math.atan2(-delta.x, -delta.z);
  player.pitch = Math.asin(delta.y / delta.length());
  player.update(.016);
  interaction.setPaused(false);
  interaction.update(.016);
  setObjective('Put Willy over the side', 'Body marker · hold E to lift with Booski');
  hud.say('Nobody says his name. The water knocks against the hull.', 5000);
}

function disposeBody() {
  if (state.phase !== 'body' || state.bodyDisposed) return;
  state.bodyDisposed = true;
  interaction.setPaused(true);
  phase('dispose');
  boat.bodyMarker.visible = false;
  player.clearKeys();
  player.mode = 'frozen';
  document.body.classList.add('cinematic');
  cameraDirector.frameDisposal();
  state.disposal = {
    bodyStart: boat.cast.willy.group.position.clone(),
    bodyRotationZ: boat.cast.willy.group.rotation.z,
    booskiStart: boat.cast.booski.group.position.clone(),
    railSound: false,
    prospectLine: false,
    splash: false,
    splashCount: 0,
    returned: false,
    returnCount: 0,
  };
  if (state.booskiGun) state.booskiGun.visible = false;
  if (state.louGun) state.louGun.visible = false;
  setObjective('Let go', 'There will be no wake for him');
  queueAftermathLine(NO_WAKE_AFTERMATH_LINES.lift, 2.5);
  audio.play('boat.body.drag', { volume: .82 });
}

function smoothBeat(start, end, time) {
  const value = THREE.MathUtils.clamp((time - start) / (end - start), 0, 1);
  return value * value * (3 - 2 * value);
}

function updateDisposal() {
  if (state.phase !== 'dispose' || !state.disposal) return;
  const timeline = state.disposal;
  const time = state.phaseTime;
  const willy = boat.cast.willy.group;
  const booski = boat.cast.booski;
  const dragEnd = new THREE.Vector3(.74, 1.07, 4.34);
  const liftEnd = new THREE.Vector3(1.78, 1.64, 4.38);
  const overboardEnd = new THREE.Vector3(3.18, -1.20, 4.54);
  const booskiDrag = new THREE.Vector3(1.18, 1.02, 3.58);
  const booskiLift = new THREE.Vector3(1.10, 1.02, 3.82);

  if (time < .95) {
    const k = smoothBeat(0, .95, time);
    willy.position.lerpVectors(timeline.bodyStart, dragEnd, k);
    willy.rotation.z = THREE.MathUtils.lerp(timeline.bodyRotationZ, -1.52, k);
    booski.group.position.lerpVectors(timeline.booskiStart, booskiDrag, k);
  } else if (time < 1.85) {
    const k = smoothBeat(.95, 1.85, time);
    willy.position.lerpVectors(dragEnd, liftEnd, k);
    willy.rotation.z = THREE.MathUtils.lerp(-1.52, -2.28, k);
    booski.group.position.lerpVectors(booskiDrag, booskiLift, k);
  } else {
    const k = smoothBeat(1.85, 2.80, time);
    willy.position.lerpVectors(liftEnd, overboardEnd, k);
    willy.rotation.z = THREE.MathUtils.lerp(-2.28, -4.10, k);
    booski.group.position.copy(booskiLift);
  }

  // Booski visibly owns the other end of the lift instead of watching a body
  // teleport away. This runs after the normal cast update so the authored pose
  // wins for the disposal beat.
  booski.group.rotation.y = Math.PI;
  booski.parts.armL.rotation.set(-.92, 0, -.34);
  booski.parts.armR.rotation.set(-.92, 0, .34);
  booski.parts.foreL.rotation.set(-1.18, 0, 0);
  booski.parts.foreR.rotation.set(-1.18, 0, 0);

  if (time >= 1.08 && !timeline.railSound) {
    timeline.railSound = true;
    audio.play('boat.body.rail', { volume: .9 });
  }
  if (time >= 1.55 && !timeline.prospectLine) {
    timeline.prospectLine = true;
    queueAftermathLine(NO_WAKE_AFTERMATH_LINES.prospect, 1.8);
  }
  if (time >= 2.80 && !timeline.splash) {
    timeline.splash = true;
    timeline.splashCount++;
    willy.visible = false;
    audio.play('water.splash', { volume: .9 });
  }
  if (time >= 3.15 && !timeline.returned) {
    timeline.returned = true;
    timeline.returnCount++;
    beginReturn();
  }
}

function beginReturn() {
  phase('return');
  state.returnFrom.copy(boat.root.position);
  state.returnHeading = physics.heading;
  state.returnTo.set(0, boat.floatY, 0);
  const dx = state.returnTo.x - state.returnFrom.x;
  const dz = state.returnTo.z - state.returnFrom.z;
  const distance = Math.max(1, Math.hypot(dx, dz));
  const side = Math.min(110, Math.max(52, distance * .25));
  /* A broad quadratic arc reads as Lou turning back into the marked channel;
   * the old point-to-point lerp slid the entire cruiser sideways home. */
  state.returnControl.set(
    (state.returnFrom.x + state.returnTo.x) * .5 + (dz / distance) * side,
    boat.floatY,
    (state.returnFrom.z + state.returnTo.z) * .5 - (dx / distance) * side,
  );
  state.atHelm = false;
  // Match the physical tableau to the narration: Lou owns the controls while
  // Booski watches the water beside the newly empty stern deck.
  boat.cast.lou.group.position.set(.14, 1.02, -.20);
  boat.cast.lou.group.rotation.y = Math.PI;
  boat.cast.booski.group.position.set(1.72, 1.02, 2.70);
  boat.cast.booski.group.rotation.y = Math.PI / 2;
  // Irish sits down on the port bench with his back to the empty stern.
  boat.cast.irish.job = 'sit';
  boat.cast.irish._syncJob(true);
  boat.cast.irish.group.position.set(-1.52, 1.02, 4.10);
  boat.cast.irish.group.rotation.y = -Math.PI / 2;
  setObjective('Ride back', 'Nobody speaks');
  document.body.classList.add('cinematic');
  audio.startLoop('underway', { name: 'boat.engine.underway', volume: .30, fade: .75 });
  audio.startLoop('wake', { name: 'boat.hull.wake', volume: .17, fade: .9 });
  // Lou has both levers up for the run in; the engines are the only thing
  // anybody on this boat is going to hear.
  engineAudio.start();
  engineAudio.setDrive({ rpm: 2950, throttle: .74, speed: 7.6 });
  cameraDirector.frameReturn(0);
  hud.say('Lou takes the helm. Booski watches the water close.', 4800);
  queueAftermathLine(NO_WAKE_AFTERMATH_LINES.lesson, 5.0, { delay: .72 });
  queueAftermathLine(NO_WAKE_AFTERMATH_LINES.irishNoBackHalf, 4.2);
}

function completeMission() {
  if (state.leaving) return;
  state.leaving = true;
  audio.stopLoop('underway', .8);
  audio.stopLoop('wake', .8);
  engineAudio.stop(.8);
  phase('complete');
  document.body.classList.add('cinematic');
  setObjective('NO WAKE', 'South Harbor · 4:40 PM');
  const completed = story.complete({
    betrayalConfirmed: true, playerFired: true, bodyDisposed: true,
  });
  if (!completed) {
    hud.toast('Mission state could not be saved', 'bad', 6000);
    state.leaving = false;
    return;
  }
  showSpeaker(NO_WAKE_EPILOGUE_LINE.who, NO_WAKE_EPILOGUE_LINE.text);
  playDialogueCue(
    `nowake.${NO_WAKE_EPILOGUE_LINE.cue}`,
    NO_WAKE_EPILOGUE_LINE.voice,
    3.6,
  );
  setTimeout(() => {
    navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door', location });
  }, 3600);
}

function updateReturn(dt) {
  if (state.phase !== 'return') return;
  const k = Math.min(1, state.phaseTime / 16);
  const ease = k * k * (3 - 2 * k);
  const inverse = 1 - ease;
  boat.root.position.x = inverse * inverse * state.returnFrom.x
    + 2 * inverse * ease * state.returnControl.x
    + ease * ease * state.returnTo.x;
  boat.root.position.z = inverse * inverse * state.returnFrom.z
    + 2 * inverse * ease * state.returnControl.z
    + ease * ease * state.returnTo.z;
  returnTangent.set(
    2 * inverse * (state.returnControl.x - state.returnFrom.x)
      + 2 * ease * (state.returnTo.x - state.returnControl.x),
    0,
    2 * inverse * (state.returnControl.z - state.returnFrom.z)
      + 2 * ease * (state.returnTo.z - state.returnControl.z),
  );
  if (returnTangent.lengthSq() > .001) {
    /* Bow first, after coming about.
     *
     * `atan2(x, z)` puts the hull's own +Z -- the transom, where the wake comes
     * off -- along the direction of travel, so the whole ride home was made
     * stern first. Aiming the bow instead is `atan2(-x, -z)`, but flipping to
     * it on the first frame would snap the cruiser through 180 degrees on the
     * spot. She holds the heading she was lying on and swings onto the
     * homeward track across COME_ABOUT_SECONDS, taking the shortest way round,
     * which is the turn Lou would actually make. */
    const homeward = Math.atan2(-returnTangent.x, -returnTangent.z);
    const turn = Math.min(1, state.phaseTime / COME_ABOUT_SECONDS);
    const eased = turn * turn * (3 - 2 * turn);
    let swing = (homeward - state.returnHeading) % (Math.PI * 2);
    if (swing > Math.PI) swing -= Math.PI * 2;
    if (swing < -Math.PI) swing += Math.PI * 2;
    boat.root.rotation.y = state.returnHeading + swing * eased;
  }
  boat.root.position.y = boat.floatY + Math.sin(state.phaseTime * 1.2) * .05;
  // Both levers stay up the whole way in, and the engine room steps back the
  // same way it does underway for the two lines anybody speaks on the ride.
  engineAudio.setDrive({
    rpm: 2950, throttle: .74, speed: 7.6, duck: audio.busy() ? .58 : 1,
  });
  cameraDirector.frameReturn(state.phaseTime);
  if (k >= 1) completeMission();
}

function leaveHelm({ force = false } = {}) {
  if (!state.atHelm) return false;
  if (!force && Math.abs(physics.speed) > .45) {
    hud.say('Bring both throttles to neutral first.', 2400);
    return false;
  }
  state.atHelm = false;
  physics.throttle = 0;
  physics.steer = 0;
  // She settles from the moment he stands up, not from the next frame.
  physics.helmAttended = false;
  boat.controls.throttle.setValue(0);
  boat.wheel.rotation.z = 0;
  player.clearKeys();
  player.mode = 'walk';
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.ground = boat.root.position.y + boat.deck.height;
  // Stand fully behind the pedestal rather than inside its capsule margin.
  player.position.copy(boat.root.localToWorld(new THREE.Vector3(-1.68, 2.68, 1.65)));
  player.yawCenter = null;
  player.yawRange = Math.PI;
  player.pitchMin = -Math.PI / 2 + .05;
  player.pitchMax = Math.PI / 2 - .05;
  helmHud.classList.add('hidden');
  setObjective('Take the helm', 'The controls are in neutral');
  return true;
}

function updateBoat(dt) {
  const active = ['drive', 'coast'].includes(state.phase);
  const carryDeckPlayer = active && state.boarded && !state.atHelm && player.mode === 'walk';
  const headingBefore = boat.root.rotation.y;
  if (carryDeckPlayer) world.toBoatLocal(player.position, carriedLocal);

  if (active) {
    let requestedThrottle = 0;
    let requestedSteer = 0;
    if (state.atHelm) {
      const forward = player.keys.has('KeyW');
      const reverse = player.keys.has('KeyS');
      if (forward !== reverse) requestedThrottle = forward ? 1 : -.48;
      requestedSteer = (player.keys.has('KeyD') ? 1 : 0) - (player.keys.has('KeyA') ? 1 : 0);
    }
    // Keys command a real spring-loaded twin lever: release returns to neutral,
    // and leaving the wheel removes propulsion instead of preserving an old value.
    const throttleRate = requestedThrottle === 0 ? 2.8 : requestedThrottle > 0 ? 1.25 : 1.65;
    physics.throttle += (requestedThrottle - physics.throttle)
      * (1 - Math.exp(-dt * throttleRate));
    physics.steer += (requestedSteer - physics.steer) * (1 - Math.exp(-dt * 4.2));
    physics.helmAttended = state.atHelm;
    if (!state.atHelm) {
      physics.throttle = 0;
      physics.steer *= Math.exp(-dt * 8);
    }

    physics.advance(dt);
    const motion = physics.motion();
    boat.root.position.set(physics.position.x, boat.floatY + motion.heave, physics.position.y);
    boat.root.rotation.set(motion.pitch, physics.heading, motion.roll, 'YXZ');
    /* The rim turns the way the hull does. The helmsman looks forward along
     * -Z, so from his seat +X is starboard and a starboard turn winds the top
     * of the wheel that way -- which is `rotation.z` NEGATIVE, since a point
     * at the top of the rim, (0, r, 0), maps to (-r sin z, r cos z, 0).
     * Positive steer is starboard and used to be fed in unnegated: the boat
     * came right while the wheel in front of the player wound left. Measured
     * with a full starboard helm the rim top moved 0.219 m to port against a
     * -0.121 rad/s (starboard) yaw rate; it now moves the same distance the
     * other way. */
    boat.wheel.rotation.z = -physics.steer * .7;
    boat.controls.throttle.setValue(physics.throttle);
    boat.controls.gaugeNeedles.rpm.rotation.z = -.95 + Math.abs(physics.throttle) * 1.9;
    boat.controls.gaugeNeedles.speed.rotation.z = -.95 + Math.min(1, Math.abs(physics.speed) / 8.5) * 1.9;
    boat.controls.gaugeNeedles.fuel.rotation.z = .45;
    const wakeAt = boat.root.localToWorld(new THREE.Vector3(0, 0, 6.55));
    world.wake.emit(wakeAt, physics.heading, Math.abs(physics.speed), dt);
    const propulsion = Math.min(1, Math.abs(physics.speed) / 8.5);
    if (Math.abs(physics.speed) > .25) {
      audio.startLoop('underway', { name: 'boat.engine.underway', volume: .06, fade: .45 });
      audio.startLoop('wake', { name: 'boat.hull.wake', volume: .02, fade: .55 });
    }
    /* Twin diesels the player is standing on top of, not a distant outboard.
     * The recorded stems carry roughly twice the level they used to and the
     * live engine graph answers the throttle underneath them. The whole engine
     * room steps back while anybody is speaking, because every ambient line on
     * the way out is delivered over it at cruising revs. */
    const underVoice = audio.busy() ? .58 : 1;
    audio.setLoopVolume('engine-idle', (.21 + Math.abs(physics.throttle) * .15) * underVoice, .18);
    audio.setLoopVolume('underway', (.05 + propulsion * .38) * underVoice, .18);
    audio.setLoopVolume('wake', (.02 + propulsion * .22) * underVoice, .18);
    engineAudio.setDrive({
      rpm: physics.rpm, throttle: physics.throttle, speed: physics.speed, duck: underVoice,
    });

    if (carryDeckPlayer) {
      world.fromBoatLocal(carriedLocal, carriedWorld);
      player.position.copy(carriedWorld);
      player.yaw += boat.root.rotation.y - headingBefore;
      player.ground = boat.root.position.y + boat.deck.height;
    }

    if (state.phase === 'drive') {
      if (state.atHelm && Math.abs(physics.speed) > .8) state.driveSeconds += dt;
      const nextAmbient = NO_WAKE_AMBIENT_LINES[state.ambientIndex];
      if (nextAmbient && state.driveSeconds >= nextAmbient.at) {
        driveLine(nextAmbient);
        state.ambientIndex++;
      }
      if (state.driveSeconds >= DRIVE_SECONDS && physics.distance >= 360) reachOpenWater();
    } else if (Math.abs(physics.throttle) < .08 && Math.abs(physics.speed) < .62) {
      beginConfrontation();
    }
  }

  if (state.atHelm && active) {
    const deltaHeading = physics.heading - lastHeading;
    player.yaw += deltaHeading;
    player.position.copy(boat.root.localToWorld(local.set(.14, 2.43, .24)));
    player.sway.roll = physics.motion().roll * .32;
    lastHeading = physics.heading;
    throttleReadout.textContent = Math.abs(physics.throttle) < .04
      ? 'N' : physics.throttle > 0 ? `${Math.round(physics.throttle * 100)}% F` : `${Math.round(-physics.throttle * 100)}% R`;
    speedReadout.textContent = Math.round(Math.abs(physics.speed) * 1.944);
    rpmReadout.textContent = Math.round(physics.rpm / 50) * 50;
    routeProgress.style.width = `${Math.min(100, state.driveSeconds / DRIVE_SECONDS * 100)}%`;
  }
}

function updateCast(dt) {
  localCamera.copy(camera.position);
  boat.root.worldToLocal(localCamera);
  for (const npc of Object.values(boat.cast)) npc.update(dt, localCamera);
  if (state.phase === 'ready_to_fire' || state.phase === 'execution') {
    poseExecutionShooter(boat.cast.lou, state.louGun, dt);
    poseExecutionShooter(boat.cast.booski, state.booskiGun, dt);
  }
  if (state.phase === 'below') {
    const w = boat.cast.willy.group;
    w.position.z += (-1.0 - w.position.z) * Math.min(1, dt * 1.8);
    w.position.y += (-.7 - w.position.y) * Math.min(1, dt * 1.5);
  }
}

function resumeCheckpoint() {
  const checkpoint = campaign.state.missions[MISSION_IDS.NO_WAKE].checkpoint;
  if (!entry.resumed || checkpoint === 'dock' || !checkpoint) return;
  Object.assign(state, {
    boarded: true, battery: true, blower: true, engine: true, bowLine: true, sternLine: true,
  });
  setStartupCompleteVisuals();
  physics.running = true;
  physics.mooringReleased = true;
  if (checkpoint === 'underway') {
    setTimeout(enterHelm, 0);
    return;
  }
  physics.position.set(0, -430);
  physics.distance = 430;
  physics.heading = 0;
  physics.throttle = 0;
  boat.root.position.set(0, boat.floatY, -430);
  state.boarded = true;
  if (checkpoint === 'open_water') {
    phase('coast');
    state.atHelm = true;
    player.mode = 'seated';
    player.enabled = true;
    player.yaw = physics.heading;
    player.pitch = -.05;
    player.position.copy(boat.root.localToWorld(new THREE.Vector3(.14, 2.43, .24)));
    lastHeading = physics.heading;
    helmHud.classList.remove('hidden');
    setObjective('Bring her to idle', 'Open water · throttle back to neutral');
  } else {
    prepareGuns();
    willyReturns();
  }
}

/**
 * Preview-only checkpoint jump.
 *
 * Walks the mission's own real progression functions in order rather than
 * assigning `state.phase` by hand -- the same contract
 * src/mansion/siege/main.js's `jumpToCheckpoint` documents for its own beat
 * chain. `dock` reproduces what `beginBoarding()`'s own completion callback
 * does (see above), minus the animated walk across the boarding platform.
 * `underway`/`inlet` route straight through the console-debug handles this
 * file already exposes (`runtime.startUnderway()`/`runtime.skipDrive()`).
 * `confrontation`/`body`/`return` pose the later beats directly -- calling
 * `beginConfrontation()`, `fireExecution()` and `disposeBody()`, the exact
 * functions a played run calls -- because none of those three is one of the
 * mission's four saveable checkpoints (dock/underway/open_water/execution),
 * so there is no earlier real checkpoint to route them through the way
 * `resumeCheckpoint()`, above, routes `underway`/`open_water`. Each of these
 * is real, live state: `confrontation` leaves the confrontation dialogue and
 * the beats after it (below decks, the guns, the return leg) to keep
 * advancing on the page's own timers exactly as they would in a played run,
 * and `return` will genuinely finish the mission and navigate home after the
 * same ride-in that a real playthrough takes.
 */
function jumpToPreviewCheckpoint(id) {
  state.boarded = true;
  boat.boardingBridge.visible = false;
  boat.targets.board.visible = false;
  player.mode = 'walk';
  player.enabled = true;
  player.ground = boat.root.position.y + boat.deck.height;
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.yawCenter = null;
  player.yawRange = Math.PI;
  player.position.copy(boat.root.localToWorld(new THREE.Vector3(-1.68, 2.68, 3.72)));
  player.velocity.set(0, 0, 0);
  interaction.setPaused(false);
  hud.toast('Aboard · Gate C', 'good');
  setObjective('Start the boat', 'Battery · blower · ignition');
  story.checkpoint('dock');
  if (id === 'dock') return;

  runtime.startUnderway();
  if (id === 'underway') return;

  runtime.skipDrive();
  // A played run reaches `coast` with the cruiser still doing real way
  // through the water -- this jump never actually drove it, so `speed` is
  // still zero, and `updateBoat()`'s own idle check would read that as
  // "already at rest" and fire the confrontation on the very next frame,
  // leaving no real inlet to preview. Give it the same cruising speed the
  // real drive ends at (see the "released cruiser accelerates" checkpoint
  // check in tools/verify-no-wake.mjs) so it coasts down for real before
  // the same real trigger fires -- not held open artificially, just not
  // starting already past it.
  physics.speed = 4.9;
  if (id === 'inlet') return;

  if (id === 'confrontation') {
    beginConfrontation();
    return;
  }

  // body/return pose the execution directly rather than sitting through the
  // confrontation dialogue -- see the doc comment above.
  prepareGuns();
  willyReturns();
  fireExecution();
  if (id === 'body') return;

  disposeBody();
}

function showEntryAvailability() {
  if (entry.ok) return;
  startButton.textContent = 'Return to the apartment';
  overlay.querySelector('.tag').textContent =
    `NO WAKE is unavailable (${entry.reason.replaceAll('_', ' ')}).`;
}

registerInteractions();
player.mode = 'walk';
player.enabled = false;
player.position.set(-5.15, 1.86, 8.4);
player.ground = .2;
player.eyeHeight = 1.66;
player.yaw = -.55;
player.pitch = -.08;
player.update(.016);
hud.setClock(3, '12:45 PM', 0);
showEntryAvailability();

const runtime = {
  get phase() { return state.phase; }, set phase(v) { state.phase = v; },
  get campaignState() { return campaign.state; },
  state, physics, world, boat, player, interaction, story, postfx, audio, radio, radioReady,
  cameraDirector, blood, engineAudio,
  dialogueLog: state.dialogueLog,
  startUnderway() {
    Object.assign(state, {
      boarded: true, battery: true, blower: true, engine: true, bowLine: true, sternLine: true,
    });
    setStartupCompleteVisuals();
    physics.running = true;
    physics.mooringReleased = true;
    enterHelm();
  },
  skipDrive() {
    if (state.phase !== 'drive') return false;
    state.driveSeconds = DRIVE_SECONDS;
    physics.distance = 380;
    physics.position.y = -430;
    reachOpenWater();
    return true;
  },
  skipDialogue() {
    if (!state.dialogue) return false;
    advanceDialogue();
    return true;
  },
  fire: fireExecution,
  beginConfrontation,
  prepareExecution() { prepareGuns(); willyReturns(); },
  leaveHelm(options) { return leaveHelm({ force: options?.force === true }); },
  dropWilly,
  disposeBody,
  beginReturn,
  completeMission,
};
window.NO_WAKE = runtime;
window.__squatchSceneReady?.('NO WAKE ready');

startButton.addEventListener('click', async () => {
  if (!entry.ok) {
    if (campaign.state.scene.id === SCENE_IDS.NO_WAKE) {
      navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door', location });
    } else {
      // No campaign transition was claimed, so returning is a plain URL move.
      location.assign('index.html');
    }
    return;
  }
  /* Loading the URL is read-only. Start is the player's explicit commit to
   * claim the mission and the NO WAKE scene in durable campaign state. */
  entry = story.begin();
  if (!entry.ok) {
    showEntryAvailability();
    return;
  }
  if (campaign.state.scene.id !== SCENE_IDS.NO_WAKE) {
    campaign.enter(SCENE_IDS.NO_WAKE, { spawn: 'gate_c' });
  }
  // Pointer lock must be requested while the start click still owns transient
  // user activation. Waiting for the audio banks first makes real browsers
  // reject the request even though the player did click Start.
  canvas.requestPointerLock?.();
  resumeCheckpoint();
  await audio.init();
  engineAudio.init();
  /* The only music on this page is the boat's own stereo, a metre from the
   * helmsman's ear on an open deck. The shared 0.7 music bus is set for a
   * receiver across an apartment. */
  if (audio.busMusic) audio.busMusic.gain.value = 1;
  await radioReady;
  // NO WAKE crosses three authored shows. Decode those exact station banks
  // plus this mission rather than the entire 100+ MiB campaign library.
  const radioCueNames = radio.preloadCueNames({ hours: [12.75, 15, 17] });
  const loadedAudio = await audio.loadManifest(noWakeAudioLoadOptions(radioCueNames));
  audio.preloadStats = {
    manifestTotal: audio.manifest.sfx.length,
    selected: loadedAudio.total,
  };
  /* After the manifest load, same reasoning as the engine-idle restart just
   * below: `jumpToPreviewCheckpoint` can call real, audio-playing functions
   * (`beginConfrontation`, `fireExecution`) and `audio.play()` silently does
   * nothing before `audio.ready` -- calling it any earlier would lose the
   * checkpoint's own opening line or gunshot. */
  if (previewCheckpoint) jumpToPreviewCheckpoint(previewCheckpoint);
  // A resumed checkpoint arrives with the engines already running. They were
  // silent until the player restarted the mission from the dock.
  if (state.engine) {
    audio.startLoop('engine-idle', { name: 'boat.engine.idle', volume: .34, fade: .8 });
    engineAudio.start();
  }
  if (audio.buffers.has('ambience.harbor')) {
    audio.startLoop('harbor', { name: 'ambience.harbor', volume: .11, ambience: true });
  } else {
    /* Existing production fallback until the dedicated harbor bed is
     * delivered: quiet hull water, never unrelated city rain. */
    audio.startLoop('harbor', { name: 'boat.hull.wake', volume: .035, ambience: true });
  }
  document.body.classList.add('playing');
  sceneInventory.show();
  overlay.classList.add('out');
  player.enabled = true;
  if (!previewCheckpoint) playDockInstructions();
  setTimeout(() => overlay.remove(), 850);
});

canvas.addEventListener('click', () => {
  if (!document.body.classList.contains('playing')) return;
  if (document.pointerLockElement === canvas || state.phase === 'ready_to_fire') return;
  const pending = canvas.requestPointerLock?.();
  pending?.catch?.(() => {});
});

document.addEventListener('pointerlockchange', () => {
  player.enabled = document.pointerLockElement === canvas || state.atHelm;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) radio.pause();
  else radio.resume();
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas) player.handleMouseMove(event.movementX, event.movementY);
});
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space') event.preventDefault();
  player.setKey(event.code, true);
  if (event.code === 'KeyE') interaction.press();
  if (event.code === 'KeyR' && radio.on) radio.next();
  if (event.code === 'KeyB') hud.toast(postfx.toggle() ? 'Bloom on' : 'Bloom off', 'good');
  if (event.code === 'KeyQ' && state.atHelm) leaveHelm();
});
document.addEventListener('keyup', (event) => {
  player.setKey(event.code, false);
  if (event.code === 'KeyE') interaction.release();
});
document.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  if (state.phase === 'ready_to_fire') fireExecution();
  else if (document.pointerLockElement === canvas) interaction.press();
});
document.addEventListener('mouseup', (event) => {
  if (event.button === 0) interaction.release();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  postfx.setSize(innerWidth, innerHeight);
});

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(.05, Math.max(.001, (now - lastTime) / 1000));
  lastTime = now;
  elapsed += dt;
  state.phaseTime += dt;
  updateDialogue(dt);
  updateBoat(dt);
  if (state.phase !== 'return') player.update(dt);
  interaction.update(dt);
  updateCast(dt);
  updateDisposal();
  updateReturn(dt);
  cameraDirector.update(dt);
  blood.update(dt);
  if (state.playerGun) state.playerGun.rotation.x += (0 - state.playerGun.rotation.x) * Math.min(1, dt * 9);
  boat.targets.radio.getWorldPosition(radioPosition);
  radio.setPosition(radioPosition);
  radioClock.update(dt);
  radio.update(dt);
  updateHarborWildlife();
  world.update(elapsed, dt);
  hud.setClock(3, state.phase === 'complete' ? '4:40 PM' : '12:45 PM', elapsed);
  postfx.render();
  postfx.sample(dt);
}

requestAnimationFrame(animate);
setTimeout(() => loading.classList.add('out'), 180);
setTimeout(() => loading.remove(), 820);
