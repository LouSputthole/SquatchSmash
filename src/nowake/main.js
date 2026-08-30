/**
 * NO WAKE.
 *
 * The spine, from `docs/NO-WAKE-REDESIGN.md`, unchanged from the old build:
 *
 *   arrive · board · startup procedure · pilot out · reach the inlet · go
 *   below · confront Willy · execute · wrap him · fetch the weights from the
 *   bow · attach them · carry him to the stern · dump him · leave.
 *
 * What changed is everything inside it: the boat, the staging, the dialogue,
 * the pacing and the temperature. The campaign edges are untouched —
 * `SCENE_IDS.NO_WAKE` still lands here, `createNoWakeStory` still owns
 * begin/checkpoint/complete, and completing still advances the apartment
 * chapter to `date`.
 *
 * Two rules run through the whole file:
 *
 *  - **A character speaks, and then the screen clarifies.** `sayThenObjective`
 *    is the shape; `docs/TONE-AND-PARODY.md` is why. Nothing in this mission
 *    puts an instruction up on the same frame as the line that sets it up.
 *  - **Nothing is simulated that can be authored.** The body is a prefab on a
 *    path, the carry is one parameter, the disposal is a tween, and loose-object
 *    physics is never running in a room somebody is being shot in.
 */
import * as THREE from 'three';
import { AudioEngine } from '../core/audio.js';
import { createCampaignAudioFeedback } from '../core/campaign-audio-feedback.js';
import { AuthoredClock } from '../core/authored-clock.js';
import {
  MISSION_IDS, SCENE_IDS, createCampaign, createCampaignRadioAdapter, navigateCampaign,
} from '../core/campaign.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { createNoWakeStory } from '../core/no-wake-story.js';
import { Player } from '../core/player.js';
import { translateKey } from '../core/settings.js';
import { attachPixelRatio, PIXEL_RATIO_CAP_HEAVY } from '../core/pixel-ratio.js';
import { PostFX } from '../core/postfx.js';
import { Radio } from '../core/radio.js';
import { BulletHoles } from '../world/bullets.js';
import {
  NO_WAKE_BODY_LINES,
  NO_WAKE_CABIN_SCRIPT,
  NO_WAKE_DOCK_LINES,
  NO_WAKE_INLET_LINES,
  buildNoWakeCruise,
} from './dialogue.js';
import { NoWakeEngineAudio, noWakeAudioLoadOptions } from './audio.js';
import { NoWakeCameraDirector } from './camera-director.js';
import { BoatPhysics, boatSpeedFraction } from './physics.js';
import {
  NO_WAKE_DRIVE_SECONDS, shouldReachNoWakeInlet, takeDueCruiseLines,
} from './route-policy.js';
import { buildNoWakeWorld } from './world.js';
import { createBodyRig } from './body.js';
import {
  flashNoWakeMuzzle as flashMuzzle,
  mountNoWakeExecutionGuns,
  stowNoWakeExecutionGunsGeometry,
  NO_WAKE_MUZZLE_FLASH_SECONDS as MUZZLE_FLASH_SECONDS,
  NO_WAKE_TRACER_SECONDS as TRACER_SECONDS,
} from './execution-geometry.js';
import { CABIN_CAST_STAGING, CABIN_STAGING } from './deck-collision.js';
import {
  completeNoWakeStartupGeometry,
  NO_WAKE_CHECKPOINT_LABELS,
  placeNoWakeCabinCastGeometry,
  poseNoWakeExecutedBodyGeometry,
  prepareNoWakeWeightedBodyGeometry,
  previewNoWakeCheckpointForLocation,
} from './preview.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';

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
 * `dock`/`underway`/`open_water`/`execution`/`weighted` are the mission's
 * real, saveable checkpoints (see `CHECKPOINTS` in
 * src/core/no-wake-story.js). The owner's waypoints below map onto that
 * vocabulary where one exists (`underway`, `inlet` -> `open_water`,
 * `weighted` -> `weighted`) and pose the later beats directly where it
 * doesn't -- `confrontation`/`body`/`weighted`/`return` replay the mission's
 * own progression functions (`beginCabinScene`, `readyToFire`/
 * `fireExecution`, the same `bodyRig` calls `resumeCheckpoint()` makes for a
 * resumed `weighted` save, `beginExit`/`restartEngine`) in order, the same
 * way src/mansion/siege/main.js's `jumpToCheckpoint` walks its own beat
 * chain instead of assigning `state.phase` by hand.
 */
/** Resolved once at boot -- a real waypoint id, or null for the ordinary opening. */
const previewCheckpoint = previewNoWakeCheckpointForLocation();
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
attachPixelRatio(renderer, { cap: PIXEL_RATIO_CAP_HEAVY });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .95;
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
const campaignAudioFeedback = createCampaignAudioFeedback(audio);
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);
const engineAudio = new NoWakeEngineAudio(audio);
const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
if (postfx.bloom) {
  postfx.bloom.threshold = 1.05;
  postfx.bloom.strength = .32;
}
const physics = new BoatPhysics();
const blood = new BulletHoles(scene, 'blood');

const boat = world.boat;
const cabin = boat.cabin;
const bodyRig = createBodyRig(boat);
const cameraDirector = new NoWakeCameraDirector(camera, boat);

function checkpointNoWake(id, { force = false } = {}) {
  const accepted = story.checkpoint(id);
  campaignAudioFeedback.checkpoint(id, accepted || force);
  return accepted;
}

const DECK_H = boat.deck.height;
const FOREDECK_H = boat.deck.foredeckHeight;
const CABIN_H = boat.cabinDeck.height;
/** Ninety seconds of channel, the same gate the old build shipped with. */
const DRIVE_SECONDS = NO_WAKE_DRIVE_SECONDS;

/**
 * The shot glass, on the dinette table and then on the sole.
 *
 * Named because five different beats move it and the table moved 0.32 m down
 * and 0.36 m outboard when the salon was built (punch list N1). Five loose
 * literals is five chances to leave one behind.
 */
const GLASS_TABLE_X = 1.10;
const GLASS_TABLE_Y = 0.345;
const GLASS_ROLL_X = 1.02;
const GLASS_ROLL_Z = -3.95;

/** The startup procedure, in the order the spec lists it. */
const STARTUP_STEPS = Object.freeze([
  { key: 'battery', label: 'Battery' },
  { key: 'blower', label: 'Blower' },
  { key: 'fuel', label: 'Fuel check' },
  { key: 'ignitionPort', label: 'Port engine' },
  { key: 'ignitionStarboard', label: 'Starboard engine' },
  { key: 'navLights', label: 'Nav lights' },
  { key: 'dockLine', label: 'Dock line' },
  { key: 'helm', label: 'Helm' },
]);

const state = {
  phase: 'dock',
  paused: false,
  boarded: false,
  boarding: false,
  battery: false,
  blower: false,
  fuel: false,
  ignitionPort: false,
  ignitionStarboard: false,
  navLights: false,
  dockLine: false,
  atHelm: false,
  below: false,
  moving: false,
  driveSeconds: 0,
  cruiseIndex: 0,
  cruiseLines: [],
  dialogue: null,
  dialogueLog: [],
  cueLog: [],
  phaseTime: 0,
  executionShots: 0,
  /* The volley, as a schedule stepped by the frame loop -- the same simulated
   * clock everything else in the scene runs on -- so a slow rasteriser slows
   * the beat instead of letting wall-clock timers finish it unseen. */
  executionPlan: null,
  executionClock: 0,
  tracers: [],
  willyHit: 0,
  willyHitSide: 1,
  willySlump: 0,
  stagingLocked: false,
  carriedBallast: false,
  bodyDisposed: false,
  anchorUp: false,
  nextGullAt: 9,
  nextCreakAt: 5,
  leaving: false,
};

const radioClock = new AuthoredClock(12.75);
radioClock.setTime(3, 12 * 60 + 45);
const radio = new Radio(audio, hud, radioClock, {
  venue: 'apartment',
  state: createCampaignRadioAdapter(campaign, {
    receiverId: 'no_wake_cabin',
    defaultPower: false,
  }),
  canPlayNotice: () => false,
  /* A small set on a galley counter in an enclosed cabin, not a bedside
   * receiver across an apartment -- and the spec says it is playing FAINTLY
   * until Lou shuts it off, so this one is quieter than the shared knob rather
   * than louder. `output` is not saved, so it cannot move the apartment. */
  output: .55,
});
const radioPosition = new THREE.Vector3();
boat.targets.radio.getWorldPosition(radioPosition);
radio.setPosition(radioPosition);
const radioReady = radio.loadManifest();

const local = new THREE.Vector3();
const carriedLocal = new THREE.Vector3();
const carriedWorld = new THREE.Vector3();
const localCamera = new THREE.Vector3();
const scratch = new THREE.Vector3();
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
 * Accept either one exact future cue (`vo.nowake.cabin.lou.negev.1`) or a
 * generated variant bank. Until those recordings exist the authored subtitle
 * and reading beat remain the complete delivery, and the mouth runs on the
 * synthesised envelope rather than on a clock -- see src/core/mouth.js.
 */
function playDialogueCue(group, speaker = null, seconds = 0) {
  const exact = `vo.${group}`;
  let source = null;
  if (audio.buffers.has(exact)) {
    source = audio.play(exact, { volume: .92 });
  } else if (audio.say(group)) {
    source = audio.spokenSource();
  }
  const npc = speaker && speaker !== 'player' ? boat.cast?.[speaker] : null;
  npc?.say?.(Math.max(1.4, seconds || 2.4), source ? { audio, source } : null);
  return Boolean(source);
}

/**
 * How long a line owns the voice channel: the longer of its authored reading
 * beat and whatever take was actually delivered.
 */
function voiceWindow(line, authoredSeconds) {
  const prefix = `vo.nowake.${line.cue}`;
  let decodedSeconds = 0;
  for (const name of audio.buffers.keys()) {
    if (name !== prefix && !name.startsWith(`${prefix}.`)) continue;
    decodedSeconds = Math.max(decodedSeconds, audio.sampleDuration(name) ?? 0);
  }
  return Math.max(authoredSeconds, decodedSeconds + .18);
}

/** One line, spoken now, without blocking anything. */
function speak(line, { seconds = null } = {}) {
  const window = voiceWindow(line, seconds ?? line.seconds ?? 2.6);
  const token = {};
  state.spokenToken = token;
  showSpeaker(line.who, line.text);
  playDialogueCue(`nowake.${line.cue}`, line.voice, window);
  audio.hold(window);
  state.cueLog.push({ cue: line.cue, who: line.who, at: elapsed, window });
  setTimeout(() => {
    if (state.spokenToken === token && !state.dialogue) hideSpeaker();
  }, window * 1000);
  return window;
}

/**
 * The rule from `docs/TONE-AND-PARODY.md`: the character says it, and the HUD
 * clarifies afterwards. Never both on the same frame, and never the screen
 * instead of the man.
 */
function sayThenObjective(line, title, detail, extra = 0) {
  const window = speak(line);
  setTimeout(() => setObjective(title, detail), (window + extra) * 1000);
  return window;
}

/** A blocking run of lines, used for the cabin script and the inlet. */
function dialogue(lines, done, { cinematic = false } = {}) {
  state.dialogue = { lines, at: -1, left: 0, done, stall: 0 };
  if (cinematic) document.body.classList.add('cinematic');
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
  runCabinBeat(line.beat, 'before');
  d.left = voiceWindow(line, line.seconds ?? Math.max(2.6, Math.min(6.2, line.text.length / 15)));
  showSpeaker(line.who, line.text);
  playDialogueCue(`nowake.${line.cue}`, line.voice, d.left);
  audio.hold(d.left);
  state.cueLog.push({ cue: line.cue, who: line.who, at: elapsed, window: d.left });
  d.left += runCabinBeat(line.beat, 'after');
  if (line.voice && line.voice !== 'player') faceTheRoom(line.voice);
}

function updateDialogue(dt) {
  if (!state.dialogue) return;
  state.dialogue.left -= dt;
  if (state.dialogue.left <= 0) advanceDialogue();
}

/** Whoever is speaking turns to whoever they are speaking to. */
function faceTheRoom(voice) {
  const speaker = boat.cast[voice];
  if (!speaker) return;
  const toward = voice === 'willy' ? boat.cast.lou : boat.cast.willy;
  speaker.faceToward(toward.group.position.x, toward.group.position.z);
}

/* ------------------------------------------------------------------ *
 * Boarding and the startup procedure
 * ------------------------------------------------------------------ */

function startupRemaining() {
  return STARTUP_STEPS.filter((step) => !state[step.key] && step.key !== 'helm');
}

function refreshStartupObjective() {
  if (state.phase !== 'startup') return;
  const remaining = startupRemaining();
  if (!remaining.length) {
    setObjective('COMPLETE THE STARTUP PROCEDURE', 'Take the helm');
    return;
  }
  setObjective('COMPLETE THE STARTUP PROCEDURE', remaining.map((step) => step.label).join(' · '));
}

function beginBoarding() {
  if (state.boarded || state.boarding) return false;
  state.boarding = true;
  player.clearKeys();
  interaction.setPaused(true);
  const deck = world.fromBoatLocal(new THREE.Vector3(-.60, DECK_H + 1.66, 3.10));
  const yaw = boat.root.rotation.y + Math.PI;
  audio.play('boat.board.step', { volume: .9 });
  player.sitAt({
    position: deck, yaw, pitch: -.06, dur: 1.15, yawRange: Math.PI,
  }, () => {
    state.boarding = false;
    state.boarded = true;
    boat.gangway.visible = false;
    boat.targets.board.visible = false;
    player.mode = 'walk';
    player.enabled = document.pointerLockElement === canvas;
    player.ground = boat.root.position.y + DECK_H;
    player.eyeHeight = 1.66;
    player.targetEye = 1.66;
    player.yawCenter = null;
    player.yawRange = Math.PI;
    interaction.setPaused(false);
    // begin() establishes the initial dock checkpoint, so boarding is the
    // one intentional forced announcement. The adapter still deduplicates it.
    checkpointNoWake('dock', { force: true });
    phase('startup');
    /* Lou says it, then the checklist appears. He does not say anything else
     * for the rest of the procedure however long the player takes. */
    sayThenObjective(
      NO_WAKE_DOCK_LINES[1], 'COMPLETE THE STARTUP PROCEDURE',
      STARTUP_STEPS.filter((step) => step.key !== 'helm').map((step) => step.label).join(' · '),
    );
  });
  return true;
}

function completeStartupStep(key) {
  if (state[key]) return false;
  state[key] = true;
  boat.controls[key]?.setOn?.(true);
  refreshStartupObjective();
  return true;
}

function startEngine(side) {
  const key = side === 'port' ? 'ignitionPort' : 'ignitionStarboard';
  if (!completeStartupStep(key)) return;
  audio.play('boat.engine.start', { volume: 1, rate: side === 'port' ? 1 : .94 });
  if (side === 'port') {
    physics.running = true;
    boat.controls.running.setOn(true);
    audio.startLoop('engine-idle', { name: 'boat.engine.idle', volume: .30, fade: .55 });
    engineAudio.init();
    engineAudio.start();
  } else {
    audio.setLoopVolume('engine-idle', .46, .6);
    audio.stopLoop('bilge', .3);
  }
}

function registerInteractions() {
  interaction.register(boat.targets.board, {
    label: 'Step aboard <em>Lou’s cruiser</em>',
    enabled: () => !state.boarded && !state.boarding,
    onUse: beginBoarding,
  });

  interaction.register(boat.targets.battery, {
    label: () => (state.battery ? 'Battery selector <em>ON</em>' : 'Turn the <b>battery selector</b>'),
    enabled: () => state.phase === 'startup' && !state.battery,
    onUse: () => {
      completeStartupStep('battery');
      audio.play('switch.click', { volume: .85 });
    },
  });
  interaction.register(boat.targets.blower, {
    label: () => (state.blower ? 'Bilge blower <em>RUNNING</em>' : 'Run the <b>bilge blower</b>'),
    enabled: () => state.phase === 'startup' && state.battery && !state.blower,
    hold: 1.1,
    onUse: () => {
      completeStartupStep('blower');
      audio.play('switch.click', { volume: .8 });
      audio.startLoop('bilge', { name: 'pc.fan', volume: .10 });
    },
  });
  interaction.register(boat.targets.fuel, {
    label: () => (state.fuel ? 'Fuel <em>CHECKED</em>' : 'Open the <b>fuel valve</b> and check the gauge'),
    enabled: () => state.phase === 'startup' && state.blower && !state.fuel,
    hold: .6,
    onUse: () => {
      completeStartupStep('fuel');
      audio.play('switch.click', { volume: .7, rate: .78 });
      boat.controls.gaugeNeedles.fuel.rotation.z = .62;
    },
  });
  /* The same two keys serve the startup checklist and the exit. Registering a
   * second descriptor on the same mesh later would leave the target in the
   * raycast list twice, so the phase lives in `enabled` instead. */
  interaction.register(boat.targets.ignitionPort, {
    label: () => (state.ignitionPort ? 'Port engine <em>RUNNING</em>' : 'Start the <b>port engine</b>'),
    enabled: () => !state.ignitionPort
      && ((state.phase === 'startup' && state.fuel) || state.phase === 'exit'),
    hold: .8,
    onUse: () => (state.phase === 'exit' ? restartEngine('port') : startEngine('port')),
  });
  interaction.register(boat.targets.ignitionStarboard, {
    label: () => (state.ignitionStarboard ? 'Starboard engine <em>RUNNING</em>' : 'Start the <b>starboard engine</b>'),
    enabled: () => !state.ignitionStarboard && state.ignitionPort
      && (state.phase === 'startup' || state.phase === 'exit'),
    hold: .8,
    onUse: () => (state.phase === 'exit' ? restartEngine('starboard') : startEngine('starboard')),
  });
  interaction.register(boat.targets.navLights, {
    label: () => (state.navLights ? 'Navigation lights <em>ON</em>' : 'Switch on the <b>navigation lights</b>'),
    enabled: () => state.phase === 'startup' && state.ignitionStarboard && !state.navLights,
    onUse: () => {
      completeStartupStep('navLights');
      audio.play('switch.click', { volume: .8, rate: 1.1 });
    },
  });
  interaction.register(boat.targets.dockLine, {
    label: 'Release the <b>dock line</b>',
    enabled: () => state.phase === 'startup' && state.navLights && !state.dockLine,
    hold: .85,
    onUse: (line) => {
      completeStartupStep('dockLine');
      line.userData.attached = false;
      line.visible = false;
      physics.mooringReleased = true;
      audio.play('boat.rope.release', { volume: .85, rate: .8 });
    },
  });
  interaction.register(boat.targets.helm, {
    label: 'Take the <b>helm</b>',
    enabled: () => (state.phase === 'startup' && state.dockLine && !state.atHelm)
      || (state.phase === 'exit' && state.anchorUp && !state.atHelm),
    onUse: enterHelm,
  });

  /* The startup panel is one broad proxy over the whole row, so a player who
   * has not yet learned where the blower is can find the panel and be told
   * which switch is next rather than hunting a bezel on a moving deck. */
  interaction.register(boat.targets.startPanel, {
    label: () => {
      const next = startupRemaining()[0];
      return next ? `Startup panel · next: <b>${next.label}</b>` : 'Startup panel';
    },
    soft: true,
    enabled: () => state.phase === 'startup' && startupRemaining().length > 0,
    onUse: () => {},
  });

  interaction.register(boat.targets.companionway, {
    label: () => (state.phase === 'descend' ? 'Go <b>below deck</b>' : 'Go <b>below</b>'),
    enabled: () => !state.below && !state.moving
      && (state.phase === 'descend' || state.phase === 'weights_returning'),
    hold: .7,
    onUse: goBelow,
  });
  interaction.register(boat.targets.companionwayBelow, {
    label: 'Go <b>up on deck</b>',
    enabled: () => state.below && !state.moving && state.phase === 'weights',
    hold: .7,
    onUse: comeUp,
  });

  interaction.register(boat.targets.radio, {
    label: () => (radio.on
      ? 'Turn off the <b>cabin radio</b> · hold to <b>tune</b> &nbsp;<span style="opacity:.6">[R] skip</span>'
      : 'Turn on the <b>cabin radio</b> · hold to <b>tune</b>'),
    enabled: () => state.below && state.phase === 'cabin' && !state.dialogue,
    hold: .8,
    onTap: () => {
      radio.toggle();
      boat.controls.radio.setOn(radio.on);
      audio.play('radio.click', { volume: .7 });
    },
    onUse: () => {
      radio.tune();
      boat.controls.radio.setOn(radio.on);
      hud.toast(`${radio.station.dial} · ${radio.station.name}`);
    },
  });

  /* The body, in four authored stages. Every one of them is a hold on a broad
   * proxy over the bag; none of them simulates anything. */
  interaction.register(boat.targets.body, {
    label: () => ({
      roll: 'Hold to <b>roll him onto the tarp</b>',
      fold: 'Hold to <b>fold your side over</b>',
      straps: 'Hold to <b>fasten the straps</b>',
      ballast: 'Hold to <b>clip the ballast to the rings</b>',
    })[state.wrapStage] ?? 'The bag',
    hold: 1.1,
    enabled: () => Boolean(state.wrapStage),
    onUse: () => advanceWrap(),
  });

  interaction.register(boat.targets.locker, {
    label: () => (state.carriedBallast ? 'Forward locker' : 'Hold to <b>take the ballast</b>'),
    hold: 1.0,
    enabled: () => state.phase === 'weights' && !state.below && !state.carriedBallast,
    onUse: takeBallast,
  });

  interaction.register(boat.targets.disposal, {
    label: 'Hold to <b>put him over</b>',
    hold: 1.0,
    enabled: () => state.phase === 'platform' && !state.bodyDisposed,
    onUse: dumpBody,
  });
}

function enterHelm() {
  state.atHelm = true;
  if (state.phase === 'startup') {
    completeStartupStep('helm');
    phase('drive');
    checkpointNoWake('underway');
    setObjective('RUN THE NO WAKE CHANNEL', 'Idle out past the marker · keep the red to starboard');
  }
  player.mode = 'seated';
  player.enabled = true;
  player.yawCenter = null;
  player.yawRange = Math.PI;
  player.pitchMin = -.65;
  player.pitchMax = .42;
  player.yaw = physics.heading;
  player.pitch = -.05;
  player.position.copy(world.fromBoatLocal(local.set(1.42, DECK_H + 1.32, 1.06)));
  physics.throttle = 0;
  physics.steer = 0;
  physics.helmAttended = true;
  lastHeading = physics.heading;
  boat.controls.throttle.setValue(0);
  helmHud.classList.remove('hidden');
}

function leaveHelm({ force = false } = {}) {
  if (!state.atHelm) return false;
  if (!force && Math.abs(physics.speed) > .45) {
    hud.say('Bring both levers to neutral first.', 2400);
    return false;
  }
  state.atHelm = false;
  physics.throttle = 0;
  physics.steer = 0;
  physics.helmAttended = false;
  boat.controls.throttle.setValue(0);
  boat.wheel.rotation.z = 0;
  player.clearKeys();
  player.mode = 'walk';
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.ground = boat.root.position.y + DECK_H;
  player.position.copy(world.fromBoatLocal(local.set(-.10, DECK_H + 1.66, .60)));
  player.yawCenter = null;
  player.yawRange = Math.PI;
  player.pitchMin = -Math.PI / 2 + .05;
  player.pitchMax = Math.PI / 2 - .05;
  helmHud.classList.add('hidden');
  return true;
}

/* ------------------------------------------------------------------ *
 * The inlet
 * ------------------------------------------------------------------ */

function reachInlet() {
  if (state.phase !== 'drive') return;
  phase('inlet');
  checkpointNoWake('open_water');
  /* Lou asks for it; the player brings the levers down himself, and the
   * engines are only killed once she has actually come off the way. */
  sayThenObjective(
    NO_WAKE_INLET_LINES.bringHerDown,
    'BRING HER DOWN', 'Both levers to neutral',
  );
}

function killEngines() {
  if (state.phase !== 'inlet' || state.enginesKilled) return;
  state.enginesKilled = true;
  speak(NO_WAKE_INLET_LINES.killThem);
  setTimeout(() => {
    physics.helmAttended = false;
    physics.running = false;
    physics.speed = 0;
    physics.anchored = true;
    audio.stopLoop('engine-idle', .8);
    audio.stopLoop('underway', .8);
    audio.stopLoop('wake', .8);
    engineAudio.stop(.7);
    audio.play('boat.engine.shutdown', { volume: 1 });
    boat.controls.running.setOn(false);
    boat.controls.ignitionPort.setOn(false);
    boat.controls.ignitionStarboard.setOn(false);
    state.ignitionPort = false;
    state.ignitionStarboard = false;
    leaveHelm({ force: true });
    /* The silence after the engines stop should be uncomfortable. Nothing
     * happens for four seconds except the water. */
    /* Both branches spelled out rather than one conditional name, because
     * `tools/check.mjs` reads these call sites to prove every cue this scene
     * asks for exists in the manifest -- and a cue it cannot see is a cue that
     * can never be given a recording. `ambience.ocean.night` is authored and
     * still unrecorded, so until it lands the inlet runs on the hull bed. */
    if (audio.buffers.has('ambience.ocean.night')) {
      audio.startLoop('inlet', { name: 'ambience.ocean.night', volume: .22, fade: 2.2, ambience: true });
    } else {
      audio.startLoop('inlet', { name: 'boat.hull.wake', volume: .07, fade: 2.2, ambience: true });
    }
    setObjective('', '');
    setTimeout(() => {
      speak(NO_WAKE_INLET_LINES.channelClear);
      setTimeout(() => {
        sayThenObjective(
          NO_WAKE_INLET_LINES.outOfTheWind,
          'GO BELOW DECK', 'Down the companionway',
        );
        phase('descend');
      }, 2600);
    }, 4200);
  }, 2200);
}

/* ------------------------------------------------------------------ *
 * Below deck
 * ------------------------------------------------------------------ */

function goBelow() {
  if (state.below || state.moving) return false;
  state.moving = true;
  const resumePhase = state.phase;
  player.clearKeys();
  interaction.setPaused(true);
  const mark = world.fromBoatLocal(new THREE.Vector3(-.25, CABIN_H + 1.66, -2.55));
  /* Facing forward, into the room. `Player` walks along -Z at yaw 0, so the
   * cabin -- which is forward of the companionway -- is straight ahead of a
   * man who arrives on this mark at the boat's own heading. */
  player.sitAt({
    position: mark, yaw: boat.root.rotation.y, pitch: -.02, dur: 1.5, yawRange: Math.PI,
  }, () => {
    state.moving = false;
    state.below = true;
    world.setBelow(true);
    player.mode = 'walk';
    player.enabled = document.pointerLockElement === canvas;
    player.ground = boat.root.position.y + CABIN_H;
    player.eyeHeight = 1.66;
    player.targetEye = 1.66;
    player.yawCenter = null;
    player.yawRange = Math.PI;
    player.pitchMin = -Math.PI / 2 + .05;
    player.pitchMax = Math.PI / 2 - .05;
    interaction.setPaused(false);
    enterEnclosure();
    if (resumePhase === 'descend') beginCabinScene();
    else if (resumePhase === 'weights_returning') beginBallastAttach();
  });
  audio.play('footstep.wood', { volume: .7 });
  return true;
}

function comeUp() {
  if (!state.below || state.moving) return false;
  state.moving = true;
  player.clearKeys();
  interaction.setPaused(true);
  const mark = world.fromBoatLocal(new THREE.Vector3(-1.465, DECK_H + 1.66, .40));
  player.sitAt({
    position: mark, yaw: boat.root.rotation.y, pitch: -.02, dur: 1.5, yawRange: Math.PI,
  }, () => {
    state.moving = false;
    state.below = false;
    world.setBelow(false);
    player.mode = 'walk';
    player.enabled = document.pointerLockElement === canvas;
    player.ground = boat.root.position.y + DECK_H;
    player.eyeHeight = 1.66;
    player.targetEye = 1.66;
    player.yawCenter = null;
    player.yawRange = Math.PI;
    interaction.setPaused(false);
    leaveEnclosure();
  });
  audio.play('footstep.wood', { volume: .7, rate: 1.05 });
  return true;
}

/** Below: the sea steps back, the hull comes forward, the room closes in. */
function enterEnclosure() {
  engineAudio.setEnclosure(cabin.group.userData.doorsClosed ? .20 : .45);
  audio.setLoopVolume('inlet', .05, .8);
  audio.setLoopCutoff('inlet', 420, .8);
  if (audio.buffers.has('water.lap.hull')) {
    audio.startLoop('cabin-water', { name: 'water.lap.hull', volume: .30, fade: 1.4, ambience: true });
  } else {
    audio.startLoop('cabin-water', { name: 'boat.hull.creak', volume: .12, fade: 1.4, ambience: true });
  }
}

/** "The open air should feel startling after the cabin." */
function leaveEnclosure() {
  engineAudio.setEnclosure(1);
  audio.setLoopCutoff('inlet', 20000, .35);
  audio.setLoopVolume('inlet', .30, .35);
  audio.stopLoop('cabin-water', .5);
  audio.play('seagull.distant', { volume: .30, rate: .9 });
}

/**
 * The cabin scene.
 *
 * Lou at the far end of the dinette, Booski behind the bar, Willy standing
 * between the two, the Prospect at the bottom of the stairs, Irish above at the
 * bow. Booski closes the companionway and the engine noise all but vanishes --
 * except the engines are already dead, so what vanishes is the sea.
 */
function beginCabinScene() {
  phase('cabin');
  /* Retire "GO BELOW DECK" the moment he is below deck. It used to stand,
   * completed, through the whole of Lou's interrogation -- an objective
   * naming a thing already done for the length of the scene's longest beat. */
  setObjective('HEAR LOU OUT', 'This is the meeting');
  state.stagingLocked = true;
  cabin.setLampLevel(1);
  // Everybody takes their mark. Nobody gathers in the cockpit; it is meant to
  // feel strangely abandoned up there.
  placeCabinCast();
  // The radio is playing faintly when he comes down. Lou shuts it off.
  if (!radio.on) {
    radio.toggle();
    boat.controls.radio.setOn(radio.on);
  }
  setTimeout(() => {
    if (state.phase !== 'cabin') return;
    // Booski closes the companionway; whatever was left of outside goes.
    cabin.setDoorsClosed(true);
    audio.play('door.creak', { volume: .8, rate: .85 });
    engineAudio.setEnclosure(.20);
    audio.setLoopVolume('inlet', .015, 1.0);
    setTimeout(() => {
      if (radio.on) {
        radio.turnOff({ remember: false });
        boat.controls.radio.setOn(false);
        audio.play('radio.click', { volume: .9 });
      }
      pourTheShot();
    }, 2300);
  }, 2600);
}

function placeCabinCast() {
  placeNoWakeCabinCastGeometry(boat);
}

/**
 * "Booski glances at Lou first, pours one shot, slides it across, pours for
 * nobody else. Glass and bottle should be unnaturally loud."
 */
function pourTheShot() {
  if (state.phase !== 'cabin') return;
  boat.cast.booski.faceToward(boat.cast.lou.group.position.x, boat.cast.lou.group.position.z);
  setTimeout(() => {
    if (state.phase !== 'cabin') return;
    boat.cast.booski.faceToward(boat.cast.willy.group.position.x, boat.cast.willy.group.position.z);
    audio.play('whiskey.pour', { volume: 1 });
    state.poured = true;
    setTimeout(() => {
      // Slid across, onto the dinette table in front of Willy.
      cabin.props.shotGlass.position.set(GLASS_TABLE_X, GLASS_TABLE_Y, -4.10);
      audio.play('glass.set', { volume: 1 });
      setTimeout(() => {
        if (state.phase !== 'cabin') return;
        dialogue(NO_WAKE_CABIN_SCRIPT, readyToFire);
      }, 1500);
    }, 1400);
  }, 1600);
}

/**
 * The staged beats inside the cabin script.
 *
 * `before` runs as the line starts; `after` returns extra seconds the line
 * holds the room for. The `stall` beat is the important one: Lou waits long
 * enough that the player wonders whether the scene has stalled, and that pause
 * is authored here so nobody tunes it out by accident.
 */
function runCabinBeat(beat, when) {
  if (!beat) return 0;
  const willy = boat.cast.willy;
  if (when === 'before') {
    if (beat === 'shot') {
      // He takes the shot because nobody else is going to.
      cabin.props.shotGlass.position.set(GLASS_TABLE_X, GLASS_TABLE_Y + .30, -4.06);
      setTimeout(() => {
        if (state.phase !== 'cabin') return;
        cabin.props.shotGlass.position.set(GLASS_TABLE_X, GLASS_TABLE_Y, -4.10);
        audio.play('glass.set', { volume: 1, rate: .92 });
      }, 900);
    }
    if (beat === 'settle') {
      /* No exaggerated gasp, no double take: his shoulders settle and his eyes
       * move between Lou, Booski and the Prospect. */
      willy.parts.body.rotation.x = .06;
      const marks = [boat.cast.lou, boat.cast.booski];
      marks.forEach((who, i) => setTimeout(() => {
        willy.faceToward(who.group.position.x, who.group.position.z);
      }, 400 + i * 700));
      setTimeout(() => willy.faceToward(player.position.x, player.position.z), 1800);
    }
    if (beat === 'stairs') {
      willy.faceToward(player.position.x, player.position.z);
      cabin.props.shotGlass.position.set(GLASS_ROLL_X, GLASS_TABLE_Y, GLASS_ROLL_Z);
      audio.play('glass.set', { volume: .95, rate: .88 });
    }
    if (beat === 'sit') {
      setTimeout(() => {
        /* Every staged beat is fired on a timer and the script can be skipped
         * faster than the timer, so each one re-checks the phase it belongs to.
         * Without this, sitting Willy down lands after he has been shot and
         * puts him back on the booth. */
        if (state.phase !== 'cabin') return;
        const mark = CABIN_CAST_STAGING.willySeat;
        willy.group.position.set(mark.x, mark.baseY, mark.z);
        willy.group.rotation.y = mark.yaw;
        willy.job = mark.job;
        willy.baseY = mark.baseY;
        willy._syncJob(true);
        audio.play('chair.scrape.wood', { volume: .8, rate: .9 });
      }, 900);
    }
    if (beat === 'ceiling') {
      // He looks once at the ceiling, knowing Irish is up there, then at Lou.
      willy.parts.head.rotation.x = -.42;
      setTimeout(() => {
        if (state.phase !== 'cabin' && state.phase !== 'ready_to_fire') return;
        willy.parts.head.rotation.x = 0;
        willy.faceToward(boat.cast.lou.group.position.x, boat.cast.lou.group.position.z);
      }, 1400);
    }
  }
  if (when === 'after') {
    if (beat === 'nothing') return 1.4;
    /* The blade. Lou waits, and the room waits with him. */
    if (beat === 'stall') return 0;
    if (beat === 'ceiling') return 1.6;
  }
  return 0;
}

/* ------------------------------------------------------------------ *
 * The execution
 * ------------------------------------------------------------------ */

/**
 * WHICH WAY UP A HELD PISTOL GOES.
 *
 * Owner, playtest 2026-08-18: *"The guns in No wake in Lou and Booskis hands
 * are upside down."* Measured, and he is right: the guns were attached to
 * `foreR` with an identity-ish rotation, and a forearm's own axes are not a
 * gun's. In the raised execution pose the bore (model local -Z,
 * `src/core/weapons/models.js`'s stated convention) pointed (0.03, -1.00,
 * -0.06) in the shooter's frame -- straight down at the sole -- and the top
 * strap pointed (-0.08, 0.06, -1.00), back at the shooter's own chest, with
 * the grip stuck out toward Willy.
 *
 * Same fix as `src/mansion/siege/armed-pose.js` (`MOUNT_ROTATION`), which
 * settled this exact bug class for the mansion: -90 degrees about X lays the
 * bore down the forearm's -Y, the direction the arm points, and the 180 about
 * the model's own bore -- applied before the X turn, so it changes only roll
 * -- lands model +Y on the forearm's +Z, the back of the hand. Aimed, the
 * bore now runs (0.08, -0.11, 0.99) at Willy with the sights up (-0.02, 0.99,
 * 0.11); at rest the muzzle hangs at the floor. The grip anchor is the siege
 * mount's own measured pistol9 grip point, so the palm holds the grip rather
 * than the trigger guard.
 */
function prepareGuns() {
  if (state.gunsReady) return;
  state.gunsReady = true;
  Object.assign(state, mountNoWakeExecutionGuns({ boat, camera }));
  sceneInventory.set([{ icon: '🔫', label: "Tony's revolver · concealed" }]);
}

/**
 * "Lou draws. Booski draws. Objective: DRAW YOUR WEAPON. Movement locked, aim
 * free, no countdown."
 */
function readyToFire() {
  phase('ready_to_fire');
  prepareGuns();
  state.stagingLocked = true;
  state.playerGun.visible = true;
  player.mode = 'walk';
  player.clearKeys();
  player.moveScale = 0;
  interaction.setPaused(true);
  executionPrompt.classList.remove('hidden');
  setObjective('DRAW YOUR WEAPON', '');
}

function fireExecution() {
  if (state.phase !== 'ready_to_fire') return;
  phase('execution');
  executionPrompt.classList.add('hidden');
  checkpointNoWake('execution');
  setObjective('', '');
  /* All three shooters fire, and all three are SEEN to fire: the owner's
   * complaint about the old scene was that Lou and Booski were not visibly
   * shooting, and packing twelve rounds into one second with every shooter
   * inside the same tenth of it left nothing for the eye to attribute. Each
   * volley is the player, then Lou, then Booski, far enough apart that each
   * man's flash, kick and tracer is his own -- the player always first, held
   * in the aimed pose the whole time. Seconds of simulated time, stepped by
   * `updateExecution()`, never wall clock. */
  const volleys = [0, .65, 1.30, 1.90];
  const stagger = .22;
  state.executionClock = 0;
  state.executionPlan = [];
  for (const [i, beat] of volleys.entries()) {
    state.executionPlan.push({ at: beat, fire: () => playerShot() });
    state.executionPlan.push({ at: beat + stagger, fire: () => npcShot(boat.cast.lou, state.louGun) });
    state.executionPlan.push({ at: beat + stagger * 2, fire: () => npcShot(boat.cast.booski, state.booskiGun) });
    if (i === volleys.length - 1) {
      state.executionPlan.push({ at: beat + stagger * 2 + .35, fire: dropWilly });
    }
  }
}

/**
 * One shot has landed; the seated man answers it.
 *
 * A flinch per round and a slump that only accumulates -- restrained on
 * purpose ("no exaggerated gasp, no double take" is the scene's own tone
 * rule), but present between every volley, so the rounds visibly arrive in a
 * man rather than a prop. Applied in `updateCast()` after the cast update,
 * which clears `parts` rotations each mover tick.
 */
function hitWilly() {
  state.willyHit = 1;
  state.willyHitSide = -state.willyHitSide;
  state.willySlump = Math.min(1, state.willySlump + 1 / 9);
}

function playerShot() {
  if (state.phase !== 'execution') return;
  const impact = boat.cast.willy.group.localToWorld(new THREE.Vector3(
    (Math.random() - .5) * .12, 1.02 + Math.random() * .22, .16,
  ));
  audio.play('boat.gunshot.deck', { volume: 1 });
  const muzzle = state.playerGun.localToWorld(state.playerGun.userData.muzzle.clone());
  blood.muzzle(muzzle);
  flashMuzzle(state.playerGun);
  showShotTracer(muzzle, impact, 0xffe2a3);
  /* On the man, not in the air where he was standing -- so the wounds ride his
   * fall and go over the side inside the bag. Not on every round: "no excessive
   * blood" is a tone rule, and twelve decals on one shirt is a cartoon. */
  if (state.executionShots % 4 === 0) {
    blood.punchAttached(boat.cast.willy.group, impact, camera.position.clone().sub(impact).normalize());
  }
  state.executionShots++;
  state.playerGun.rotation.x = .32;
  hitWilly();
}

function npcShot(npc, gun) {
  if (state.phase !== 'execution') return;
  const muzzle = gun.localToWorld(gun.userData.muzzle.clone());
  audio.play('boat.gunshot.deck', { volume: .94, position: muzzle });
  blood.muzzle(muzzle);
  flashMuzzle(gun);
  const impact = boat.cast.willy.group.localToWorld(new THREE.Vector3(
    (Math.random() - .5) * .18, .95 + Math.random() * .30, .14,
  ));
  showShotTracer(muzzle, impact, 0xffc86b);
  if (state.executionShots % 4 === 1) {
    blood.punchAttached(
      boat.cast.willy.group, impact, camera.position.clone().sub(impact).normalize(),
    );
  }
  state.executionShots++;
  gun.userData.recoil = 1;
  hitWilly();
}

function showShotTracer(from, to, colour) {
  const tracer = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([from, to]),
    new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: .95 }),
  );
  tracer.name = 'no-wake-shot-tracer';
  tracer.renderOrder = 1200;
  tracer.userData.ttl = TRACER_SECONDS;
  scene.add(tracer);
  state.tracers.push(tracer);
}

function poseExecutionShooter(npc, gun, dt) {
  if (!npc || !gun) return;
  gun.userData.recoil = Math.max(0, (gun.userData.recoil ?? 0) - dt * 7.5);
  const kick = gun.userData.recoil;
  // Recoil travels up the arm, not just the wrist: the shoulder rides the kick.
  npc.parts.armR.rotation.set(-1.18 - kick * .14, 0, .08);
  npc.parts.foreR.rotation.set(-.28 - kick * .10, 0, 0);
  npc.parts.armL.rotation.set(-1.00, 0, -.18);
  npc.parts.foreL.rotation.set(-.72, 0, 0);
  gun.position.copy(gun.userData.basePosition);
  /* Forearm +Y runs from the hand back to the elbow, so this is the gun
   * driven rearward along the bore; the X turn is muzzle climb about the
   * mounted frame (see GUN_MOUNT_ROTATION). */
  gun.position.y += kick * .075;
  gun.rotation.copy(gun.userData.baseRotation);
  gun.rotation.x -= kick * .34;
}

/**
 * Step the execution beat on the frame loop's dt -- the scene's simulated
 * clock -- and age everything a shot leaves behind: flash petals, tracer
 * lines, Willy's flinch. Due entries fire in authored order even when one
 * slow frame covers several, so the round count and the final `dropWilly()`
 * cannot be starved by frame rate.
 */
function updateExecution(dt) {
  if (state.executionPlan && state.phase === 'execution') {
    state.executionClock += dt;
    while (state.executionPlan.length && state.executionPlan[0].at <= state.executionClock) {
      state.executionPlan.shift().fire();
    }
    if (!state.executionPlan.length) state.executionPlan = null;
  }
  state.willyHit = Math.max(0, state.willyHit - dt * 6);
  for (const gun of [state.louGun, state.booskiGun, state.playerGun]) {
    if (!gun || gun.userData.flashTtl <= 0) continue;
    gun.userData.flashTtl = Math.max(0, gun.userData.flashTtl - dt);
    const glow = gun.userData.flashTtl / MUZZLE_FLASH_SECONDS;
    gun.userData.flash.visible = glow > 0;
    gun.userData.flash.scale.setScalar(.6 + .5 * glow);
    gun.userData.flashMaterial.opacity = glow;
  }
  for (let i = state.tracers.length - 1; i >= 0; i--) {
    const tracer = state.tracers[i];
    tracer.userData.ttl -= dt;
    if (tracer.userData.ttl <= 0) {
      scene.remove(tracer);
      tracer.geometry.dispose();
      tracer.material.dispose();
      state.tracers.splice(i, 1);
    } else {
      tracer.material.opacity = .95 * tracer.userData.ttl / TRACER_SECONDS;
    }
  }
}

/**
 * "Willy slumps against the booth and drops forward. The shot glass vibrates,
 * rolls, and stops against the sink. No flying body, no spray, no ragdoll
 * comedy, no music."
 */
function dropWilly() {
  if (state.phase !== 'execution') return;
  phase('body');
  poseNoWakeExecutedBodyGeometry(boat);
  state.playerGun.visible = false;
  state.glassRoll = { t: 0 };
  audio.play('hotdog.body.floor', { volume: .74 });
  cameraDirector.frameCollapse();
  player.mode = 'frozen';
  document.body.classList.add('cinematic');
  setTimeout(() => {
    if (state.phase !== 'body') return;
    document.body.classList.remove('cinematic');
    cameraDirector.clear();
    player.mode = 'walk';
    player.moveScale = 1;
    player.enabled = document.pointerLockElement === canvas;
    interaction.setPaused(false);
    beginWrap();
  }, 4200);
}

/* ------------------------------------------------------------------ *
 * The body
 * ------------------------------------------------------------------ */

function beginWrap() {
  bodyRig.layTarp();
  audio.play('cloth.snap', { volume: .9 });
  state.wrapStage = 'roll';
  sayThenObjective(NO_WAKE_BODY_LINES.finishIt, 'WRAP HIM', 'Hold E to roll him onto the tarp');
  boat.bodyMarker.visible = true;
  boat.bodyMarker.position.set(.10, CABIN_H + .90, -3.53);
}

function advanceWrap() {
  const stage = state.wrapStage;
  if (!stage) return;
  if (stage === 'roll') {
    /* The swap. From here on there is no ragdoll on this boat. */
    bodyRig.swapToWrapped(boat.cast.willy);
    audio.play('boat.body.drag', { volume: .85 });
    state.wrapStage = 'fold';
    boat.bodyMarker.visible = false;
    sayThenObjective(NO_WAKE_BODY_LINES.yourSide, 'WRAP HIM', 'Hold E to fold your side over');
    return;
  }
  if (stage === 'fold') {
    bodyRig.foldSide('port');
    audio.play('cloth.snap', { volume: .8, rate: .92 });
    // Booski takes the other side on the same beat.
    setTimeout(() => bodyRig.foldSide('starboard'), 520);
    state.wrapStage = 'straps';
    sayThenObjective(NO_WAKE_BODY_LINES.straps, 'WRAP HIM', 'Hold E to fasten the straps');
    return;
  }
  if (stage === 'straps') {
    bodyRig.fastenStraps();
    audio.play('cloth.suit.movement', { volume: .8 });
    state.wrapStage = null;
    setTimeout(() => {
      bodyRig.closeBag();
      audio.play('boat.bag.zip', { volume: .95 });
      beginWeights();
    }, 1100);
    return;
  }
  if (stage === 'ballast') {
    bodyRig.attachBallast(boat.ballast);
    audio.play('boat.ballast.chain', { volume: .9 });
    state.wrapStage = null;
    state.carriedBallast = false;
    sceneInventory.set([{ icon: '🔫', label: "Tony's revolver · concealed" }]);
    checkpointNoWake('weighted');
    speak(NO_WAKE_BODY_LINES.sockets);
    setTimeout(beginCarry, 3400);
  }
}

/** "LOU: Needs weight. BOOSKI: Bow locker." */
function beginWeights() {
  phase('weights');
  // The composition has held; he can move about the cabin again.
  state.stagingLocked = false;
  speak(NO_WAKE_BODY_LINES.needsWeight);
  setTimeout(() => {
    sayThenObjective(NO_WAKE_BODY_LINES.bowLocker, 'FETCH THE BALLAST', 'Forward locker, up on the bow');
  }, 2400);
}

function takeBallast() {
  if (state.carriedBallast) return;
  state.carriedBallast = true;
  boat.lockerLid.rotation.x = -1.1;
  boat.ballast.visible = true;
  audio.play('boat.ballast.chain', { volume: .85, rate: .95 });
  cameraDirector.frameBallast();
  player.mode = 'frozen';
  sceneInventory.set([
    { icon: '🔫', label: "Tony's revolver · concealed" },
    { icon: '🧱', label: 'Cast-iron ballast' },
  ]);
  setTimeout(() => {
    cameraDirector.clear();
    player.mode = 'walk';
    player.enabled = document.pointerLockElement === canvas;
    boat.ballast.visible = false;
    phase('weights_returning');
    /* Irish does not turn round and does not ask. He heard it. */
    sayThenObjective(NO_WAKE_BODY_LINES.nothingBehindUs, 'TAKE IT BELOW', 'Down the companionway');
  }, 2600);
}

function beginBallastAttach() {
  phase('weights_attach');
  state.wrapStage = 'ballast';
  boat.bodyMarker.visible = true;
  boat.bodyMarker.position.set(.10, CABIN_H + .90, -3.53);
  setObjective('ATTACH THE WEIGHT', 'Hold E to clip it to the rings');
}

/* ------------------------------------------------------------------ *
 * The carry, the platform and the water
 * ------------------------------------------------------------------ */

function beginCarry() {
  if (state.phase === 'carry') return;
  phase('carry');
  boat.bodyMarker.visible = false;
  state.wrapStage = null;
  document.body.classList.add('cinematic');
  player.mode = 'frozen';
  interaction.setPaused(true);
  stowNoWakeExecutionGunsGeometry({
    louGun: state.louGun,
    booskiGun: state.booskiGun,
    playerGun: state.playerGun,
  });
  cameraDirector.frameCarryLift();
  speak(NO_WAKE_BODY_LINES.moveHim);
  setObjective('', '');
  // Lou follows and does not help carry.
  boat.cast.lou.group.position.set(.40, DECK_H, .20);
  boat.cast.lou.group.rotation.y = 0;
  boat.cast.lou.baseY = DECK_H;
}

const CARRY_LIFT_SECONDS = 1.8;
const CARRY_SECONDS = 11.5;

/**
 * The two-person carry.
 *
 * One authored parameter drives the bag, Booski and the player together, which
 * is what "synchronised root motion" buys: nobody's hands leave it and nothing
 * can drift out of step. The lift is the only part with a camera on it; the
 * traverse is first person, because the player is the other end of the carry
 * and a third-person shot of a bag with one man on it would say so.
 */
function updateCarry(dt) {
  if (state.phase !== 'carry') return;
  const t = Math.min(1, Math.max(0, (state.phaseTime - CARRY_LIFT_SECONDS) / CARRY_SECONDS));
  if (state.phaseTime >= CARRY_LIFT_SECONDS && cameraDirector.shot?.id === 'carry-lift-cabin') {
    cameraDirector.clear();
  }
  bodyRig.carryTo(t, {
    booski: boat.cast.booski,
    placePlayer: (x, y, z, at) => {
      player.position.copy(world.fromBoatLocal(scratch.set(x, y + 1.28, z)));
      // Looking down the bag at the man on the other end of it.
      player.yaw = boat.root.rotation.y + at.yaw + Math.PI;
      player.pitch = -.24;
      player.update(dt);
    },
  });
  if (t > .30 && !state.carryLeftCabin) {
    state.carryLeftCabin = true;
    world.setBelow(false);
    cabin.setDoorsClosed(false);
    engineAudio.setEnclosure(1);
    audio.setLoopVolume('inlet', .30, 1.2);
    audio.setLoopCutoff('inlet', 20000, 1.2);
    audio.stopLoop('cabin-water', .9);
    audio.play('seagull.distant', { volume: .26, rate: .92 });
    // Lou follows them up and stands by the gate. He does not help carry.
    boat.cast.lou.group.position.set(.40, DECK_H, 1.60);
    boat.cast.lou.group.rotation.y = 0;
  }
  if (t >= 1 && !state.carryDone) {
    state.carryDone = true;
    audio.play('boat.body.rail', { volume: .85 });
    reachPlatform();
  }
  if (state.phaseTime > .4 && state.phaseTime < .6) audio.play('cloth.suit.movement', { volume: .5 });
}

function reachPlatform() {
  phase('platform');
  cameraDirector.frameDisposal();
  boat.cast.booski.group.position.set(1.40, DECK_H, 4.60);
  boat.cast.booski.group.rotation.y = 0;
  /* Forward of the gate, and it stays forward of the gate: "Lou never helped
   * carry" is asserted in the verifier as `lou.z <= 3.5`, which is the whole
   * point of him standing where the bag is not. */
  boat.cast.lou.group.position.set(.20, DECK_H, 3.40);
  boat.cast.lou.group.rotation.y = 0;
  /* Water laps inches below the bag. Lou looks at the shoreline and nods. The
   * nod is the character doing the telling; the objective follows it. */
  setTimeout(() => {
    boat.cast.lou.faceToward(-60, world.inlet.z - 6);
    setTimeout(() => {
      boat.cast.lou.parts.head.rotation.x = .30;
      setTimeout(() => { boat.cast.lou.parts.head.rotation.x = 0; }, 380);
      boat.cast.lou.faceToward(boat.cast.booski.group.position.x, boat.cast.booski.group.position.z);
      setObjective('DUMP THE BODY', 'Hold E');
      document.body.classList.remove('cinematic');
      /* PUNCH LIST N4. Two things stopped E working here, and both of them are
       * in these six lines.
       *
       *  - `frozen` is a mode with NO INPUT AT ALL: `Player.handleMouseMove`
       *    returns on it. The mission asked for a look-at interaction and then
       *    took the player's head away, so an aim that missed could not be
       *    corrected by the only means a first-person game has. `seated` locks
       *    him to the spot and leaves him his eyes, which is what "the player
       *    keeps his aim so he can watch it" was always trying to say.
       *  - The authored aim missed. Pitched 17° down from 1.62 m above the
       *    cockpit sole, the crosshair passed over the disposal zone entirely.
       *    He looks AT the bag now (26°), and stands 0.15 m inboard of where he
       *    did, because 1.30 was exactly the old zone's own corner.
       *
       * The clamps are undone in `beginExit()`; leaving them on cost the ride
       * home its head. */
      player.mode = 'seated';
      interaction.setPaused(false);
      /* Stay forward of the transom: at z 4.70 the first-person camera was
       * nearly inside the wrapped body when it reached the swim platform. */
      const at = world.fromBoatLocal(scratch.set(1.15, DECK_H + 1.62, 4.10));
      player.position.copy(at);
      player.velocity.set(0, 0, 0);
      player.yaw = boat.root.rotation.y + Math.PI;
      player.yawCenter = player.yaw;
      player.yawRange = 1.15;
      player.pitchMin = -1.15;
      player.pitchMax = .25;
      player.pitch = -.46;
      player.enabled = document.pointerLockElement === canvas;
      player.update(.016);
      cameraDirector.clear();
    }, 2200);
  }, 1400);
}

function dumpBody() {
  if (state.bodyDisposed) return;
  state.bodyDisposed = true;
  phase('dispose');
  interaction.setPaused(true);
  player.mode = 'frozen';
  document.body.classList.add('cinematic');
  cameraDirector.frameDisposal();
  setObjective('', '');
}

const DISPOSE_SECONDS = 2.6;

function updateDisposal() {
  if (state.phase !== 'dispose') return;
  const t = Math.min(1, state.phaseTime / DISPOSE_SECONDS);
  const { struck } = bodyRig.disposeTo(t);
  if (struck && !state.splashed) {
    state.splashed = true;
    /* One strike on the water. No enormous splash. */
    audio.play('water.splash', { volume: .72 });
    cameraDirector.frameWaterHold();
  }
  if (t >= 1 && !state.waterHeld) {
    state.waterHeld = true;
    /* Hold on the water for several seconds. Nothing comes back up. */
    setTimeout(() => {
      speak(NO_WAKE_BODY_LINES.stillClear);
      setTimeout(() => {
        sayThenObjective(NO_WAKE_BODY_LINES.startHer, 'LEAVE THE INLET', 'Both engines · then the helm');
        beginExit();
      }, 2400);
    }, 5200);
  }
}

/* ------------------------------------------------------------------ *
 * The exit
 * ------------------------------------------------------------------ */

function beginExit() {
  phase('exit');
  document.body.classList.remove('cinematic');
  cameraDirector.clear();
  player.mode = 'walk';
  player.enabled = document.pointerLockElement === canvas;
  player.ground = boat.root.position.y + DECK_H;
  player.position.copy(world.fromBoatLocal(local.set(1.20, DECK_H + 1.66, 2.80)));
  /* The disposal mark clamped his look so he could not turn round on the swim
   * platform (N4). Whoever sets a yaw window owns taking it off again, and this
   * is the beat that gives him the boat back. */
  player.yawCenter = null;
  player.yawRange = Math.PI;
  player.pitchMin = -Math.PI / 2 + .05;
  player.pitchMax = Math.PI / 2 - .05;
  player.velocity.set(0, 0, 0);
  interaction.setPaused(false);
  physics.anchored = false;
  // Irish goes forward for the anchor as soon as both engines are running.
  boat.cast.irish.group.position.set(1.75, FOREDECK_H, -4.55);
  boat.cast.irish.group.rotation.y = Math.PI;
  /* x -1.10, not -1.30: the staging gate caught him standing IN the cockpit
   * bench on the way home (ACTOR_INSIDE_SOLID, `cockpit seating · port
   * return`). That seat unit's starboard face is at x -1.26 in boat space --
   * see DECK_COLLIDERS -- so -1.30 put 40 mm of him inside the moulding. He
   * stands on -1.10 everywhere else in this scene, which is the same 160 mm
   * of clear sole he has had all night. */
  boat.cast.booski.group.position.set(-1.10, DECK_H, 3.90);
  boat.cast.booski.group.rotation.y = 0;
  boat.cast.lou.group.position.set(0, DECK_H, 3.45);
  boat.cast.lou.group.rotation.y = Math.PI;
  boat.cast.lou.baseY = DECK_H;
}

function restartEngine(side) {
  const key = side === 'port' ? 'ignitionPort' : 'ignitionStarboard';
  if (state[key]) return;
  state[key] = true;
  boat.controls[key].setOn(true);
  audio.play('boat.engine.start', { volume: 1, rate: side === 'port' ? 1 : .94 });
  if (side === 'port') {
    physics.running = true;
    boat.controls.running.setOn(true);
    audio.startLoop('engine-idle', { name: 'boat.engine.idle', volume: .34, fade: .55 });
    engineAudio.start();
    setObjective('LEAVE THE INLET', 'Starboard engine');
  } else {
    audio.setLoopVolume('engine-idle', .48, .6);
    weighAnchor();
  }
}

/** Nobody speaks on the way out. Irish gets the anchor and comes back aft. */
function weighAnchor() {
  setObjective('LEAVE THE INLET', 'Irish is getting the anchor');
  state.anchorTimer = 0;
  audio.play('boat.rope.release', { volume: .8, rate: .7 });
  setTimeout(() => {
    state.anchorUp = true;
    boat.cast.irish.group.position.set(1.75, FOREDECK_H, -3.20);
    setObjective('LEAVE THE INLET', 'Take the helm and get her out');
  }, 4200);
}

const EXIT_RUN_METRES = 90;

function updateExit() {
  if (state.phase !== 'exit') return;
  if (state.exitStart === undefined && state.anchorUp) state.exitStart = physics.distance;
  if (state.exitStart === undefined) return;
  const run = physics.distance - state.exitStart;
  if (run > EXIT_RUN_METRES && Math.abs(physics.speed) > 3.2 && !state.astern) {
    state.astern = true;
    /* At speed, the camera looks briefly astern at the wake spreading and
     * smoothing over. Then it is over. */
    document.body.classList.add('cinematic');
    cameraDirector.frameAstern();
    setObjective('', '');
    setTimeout(completeMission, 5200);
  }
}

function completeMission() {
  if (state.leaving) return;
  state.leaving = true;
  audio.stopLoop('underway', .9);
  audio.stopLoop('wake', .9);
  audio.stopLoop('engine-idle', .9);
  audio.stopLoop('inlet', .9);
  engineAudio.stop(.9);
  phase('complete');
  document.body.classList.add('cinematic');
  setObjective('MISSION COMPLETE: NO WAKE', 'South Harbor · 4:40 PM');
  const completed = story.complete({
    betrayalConfirmed: true, playerFired: true, bodyDisposed: true,
  });
  if (!completed) {
    hud.toast('Mission state could not be saved', 'bad', 6000);
    state.leaving = false;
    return;
  }
  campaignAudioFeedback.complete('no-wake', completed);
  setTimeout(() => {
    navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door', location });
  }, 3200);
}

/* ------------------------------------------------------------------ *
 * Per-frame
 * ------------------------------------------------------------------ */

function updateHarborWildlife() {
  if (!document.body.classList.contains('playing')) return;
  if (state.below) return;
  if (elapsed >= state.nextGullAt) {
    const cue = audio.buffers.has('seagull.distant') ? 'seagull.distant' : 'bird';
    audio.play(cue, { volume: cue === 'bird' ? .14 : .34, rate: .88 + Math.random() * .18 });
    state.nextGullAt = elapsed + 11 + Math.random() * 16;
  }
  if (elapsed >= state.nextCreakAt && audio.buffers.has('boat.hull.creak')) {
    audio.play('boat.hull.creak', { volume: .22, rate: .92 + Math.random() * .12 });
    state.nextCreakAt = elapsed + 7 + Math.random() * 12;
  }
}

/** The shot glass vibrates, rolls, and stops against the sink. */
function updateGlassRoll(dt) {
  if (!state.glassRoll) return;
  state.glassRoll.t += dt;
  const glass = cabin.props.shotGlass;
  const foot = cabin.props.sinkFoot;
  const k = Math.min(1, Math.max(0, (state.glassRoll.t - .5) / 2.4));
  if (state.glassRoll.t < .5) {
    glass.position.x = GLASS_ROLL_X + Math.sin(state.glassRoll.t * 90) * .006;
    return;
  }
  const eased = k * k * (3 - 2 * k);
  glass.position.set(
    THREE.MathUtils.lerp(GLASS_ROLL_X, foot.x, eased),
    THREE.MathUtils.lerp(GLASS_TABLE_Y, foot.y + .04, Math.min(1, eased * 2.2)),
    THREE.MathUtils.lerp(GLASS_ROLL_Z, foot.z, eased),
  );
  glass.rotation.z = eased * 12;
  if (k >= 1) {
    state.glassRoll = null;
    audio.play('dish.clink', { volume: .8, rate: 1.06 });
  }
}

/** The confrontation holds the player on his mark without a wall to do it. */
function clampToStaging() {
  if (!state.stagingLocked || !state.below) return;
  world.toBoatLocal(player.position, carriedLocal);
  const x = THREE.MathUtils.clamp(carriedLocal.x, CABIN_STAGING.minX, CABIN_STAGING.maxX);
  const z = THREE.MathUtils.clamp(carriedLocal.z, CABIN_STAGING.minZ, CABIN_STAGING.maxZ);
  if (x === carriedLocal.x && z === carriedLocal.z) return;
  carriedLocal.x = x;
  carriedLocal.z = z;
  world.fromBoatLocal(carriedLocal, carriedWorld);
  player.position.x = carriedWorld.x;
  player.position.z = carriedWorld.z;
  player.velocity.x = 0;
  player.velocity.z = 0;
}

function updateBoat(dt) {
  const driving = ['drive', 'inlet', 'exit'].includes(state.phase);
  const carryDeckPlayer = driving && state.boarded && !state.atHelm && player.mode === 'walk';
  const headingBefore = boat.root.rotation.y;
  if (carryDeckPlayer) world.toBoatLocal(player.position, carriedLocal);

  if (driving && !physics.anchored) {
    let requestedThrottle = 0;
    let requestedSteer = 0;
    if (state.atHelm) {
      const forward = player.keys.has('KeyW');
      const reverse = player.keys.has('KeyS');
      if (forward !== reverse) requestedThrottle = forward ? 1 : -.48;
      requestedSteer = (player.keys.has('KeyD') ? 1 : 0) - (player.keys.has('KeyA') ? 1 : 0);
    }
    const throttleRate = requestedThrottle === 0 ? 2.8 : requestedThrottle > 0 ? 1.25 : 1.65;
    const before = physics.throttle;
    physics.throttle += (requestedThrottle - physics.throttle)
      * (1 - Math.exp(-dt * throttleRate));
    physics.steer += (requestedSteer - physics.steer) * (1 - Math.exp(-dt * 4.2));
    physics.helmAttended = state.atHelm;
    if (!state.atHelm) {
      physics.throttle = 0;
      physics.steer *= Math.exp(-dt * 8);
    }
    /* Real levers answer. A step of more than a quarter throttle in one frame
     * is the player pushing them up, and the engines say so. */
    if (physics.throttle - before > .012 && elapsed - (state.lastRev ?? -9) > 2.4) {
      state.lastRev = elapsed;
      if (audio.buffers.has('boat.engine.rev')) audio.play('boat.engine.rev', { volume: .5 });
    }

    physics.advance(dt);
    const motion = physics.motion();
    boat.root.position.set(physics.position.x, boat.floatY + motion.heave, physics.position.y);
    boat.root.rotation.set(motion.pitch, physics.heading, motion.roll, 'YXZ');
    /* The rim turns the way the hull does: the helmsman looks forward along -Z,
     * so a starboard turn (positive steer) winds the top of the wheel to
     * starboard, which is `rotation.z` NEGATIVE. */
    boat.wheel.rotation.z = -physics.steer * .7;
    boat.controls.throttle.setValue(physics.throttle);
    const rev = -.95 + Math.abs(physics.throttle) * 1.9;
    boat.controls.gaugeNeedles.tachPort.rotation.z = rev;
    boat.controls.gaugeNeedles.tachStarboard.rotation.z = rev * .98;
    const propulsion = boatSpeedFraction(physics.speed);
    boat.controls.gaugeNeedles.speed.rotation.z = -.95 + propulsion * 1.9;
    boat.controls.gaugeNeedles.depth.rotation.z = -.30;
    const wakeAt = world.fromBoatLocal(local.set(0, 0, 6.55));
    world.wake.emit(wakeAt, physics.heading, Math.abs(physics.speed), dt);
    if (Math.abs(physics.speed) > .25) {
      audio.startLoop('underway', { name: 'boat.engine.underway', volume: .08, fade: .45 });
      audio.startLoop('wake', { name: 'boat.hull.wake', volume: .04, fade: .55 });
    }
    /* Twin engines the player is standing on top of, and an ocean he is on.
     * The whole engine room steps back while anybody is speaking. */
    const underVoice = audio.busy() ? .58 : 1;
    audio.setLoopVolume('engine-idle', (.30 + Math.abs(physics.throttle) * .20) * underVoice, .18);
    audio.setLoopVolume('underway', (.08 + propulsion * .48) * underVoice, .18);
    audio.setLoopVolume('wake', (.04 + propulsion * .34) * underVoice, .18);
    engineAudio.setDrive({
      rpm: physics.rpm, throttle: physics.throttle, speed: physics.speed, duck: underVoice,
    });

    if (carryDeckPlayer) {
      world.fromBoatLocal(carriedLocal, carriedWorld);
      player.position.copy(carriedWorld);
      player.yaw += boat.root.rotation.y - headingBefore;
      player.ground = boat.root.position.y + boat.deck.heightAt(carriedLocal.z);
    }

    if (state.phase === 'drive') {
      if (state.atHelm && Math.abs(physics.speed) > .8) state.driveSeconds += dt;
      const cruise = takeDueCruiseLines(
        state.cruiseLines, state.cruiseIndex, state.driveSeconds,
      );
      for (const line of cruise.due) speak(line);
      state.cruiseIndex = cruise.nextIndex;
      if (shouldReachNoWakeInlet({
        driveSeconds: state.driveSeconds,
        x: physics.position.x,
        z: physics.position.y,
        inlet: world.inlet,
      })) reachInlet();
    } else if (state.phase === 'inlet' && !state.enginesKilled
      && Math.abs(physics.throttle) < .08 && Math.abs(physics.speed) < .62) {
      killEngines();
    }
  }

  if (state.atHelm && driving) {
    const deltaHeading = physics.heading - lastHeading;
    player.yaw += deltaHeading;
    player.position.copy(world.fromBoatLocal(local.set(1.42, DECK_H + 1.32, 1.06)));
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
  if (state.phase === 'execution') {
    /* After the cast update, which clears these rotations each mover tick.
     * `dropWilly()` owns everything from the 'body' phase on. */
    const willy = boat.cast.willy;
    willy.parts.body.rotation.x = .06 + state.willyHit * .10 + state.willySlump * .20;
    willy.parts.body.rotation.z = state.willyHitSide * state.willyHit * .06;
    willy.parts.head.rotation.x = state.willyHit * .10 + state.willySlump * .26;
  }
}

/* ------------------------------------------------------------------ *
 * Boot, checkpoints and input
 * ------------------------------------------------------------------ */

function setStartupCompleteVisuals() {
  completeNoWakeStartupGeometry(boat);
}

function resumeCheckpoint() {
  const checkpoint = campaign.state.missions[MISSION_IDS.NO_WAKE].checkpoint;
  if (!entry.resumed || checkpoint === 'dock' || !checkpoint) return;
  Object.assign(state, {
    boarded: true, battery: true, blower: true, fuel: true,
    ignitionPort: true, ignitionStarboard: true, navLights: true, dockLine: true,
  });
  setStartupCompleteVisuals();
  physics.running = true;
  physics.mooringReleased = true;
  phase('startup');
  if (checkpoint === 'underway') {
    setTimeout(enterHelm, 0);
    return;
  }
  physics.position.set(world.inlet.x, world.inlet.z);
  physics.distance = 430;
  physics.heading = 0;
  physics.throttle = 0;
  boat.root.position.set(world.inlet.x, boat.floatY, world.inlet.z);
  if (checkpoint === 'open_water') {
    phase('drive');
    setTimeout(() => { enterHelm(); reachInlet(); }, 0);
    return;
  }
  // Past the shot: put him below with the room already staged.
  physics.anchored = true;
  physics.running = false;
  setTimeout(() => {
    world.setBelow(true);
    state.below = true;
    placeCabinCast();
    cabin.setDoorsClosed(true);
    player.mode = 'walk';
    player.ground = boat.root.position.y + CABIN_H;
    player.position.copy(world.fromBoatLocal(new THREE.Vector3(-.25, CABIN_H + 1.66, -2.55)));
    prepareGuns();
    if (checkpoint === 'weighted') {
      prepareNoWakeWeightedBodyGeometry(boat, bodyRig);
      beginCarry();
    } else {
      /* THE PHASE FIRST, BECAUSE `dropWilly()` REFUSES TO RUN WITHOUT IT.
       *
       * `dropWilly()` opens with `if (state.phase !== 'execution') return;`
       * and this branch had left the phase at the `startup` set forty lines
       * up, so the whole collapse -- the pose, the four-second hold and the
       * `beginWrap()` behind it -- was skipped in silence. What the player
       * got was the shut cabin with the phase still reading `startup`: every
       * switch on that checklist is already flipped and is up on deck
       * anyway, the companionway back up needs phase `weights`, the bag needs
       * a `wrapStage` nothing had set, and the radio needs phase `cabin`. Not
       * one prompt in the boat, and the mission's own restart-from-checkpoint
       * reloads straight back into it.
       *
       * The order a player reaches it is ordinary: fire at Willy -- which is
       * what banks `execution` (`fireExecution()`) -- and then leave before
       * clipping the ballast on, which is minutes of wrapping and a trip to
       * the bow locker later. Same shape as the Hot Dog alley: a progression
       * function called from a state it guards against, doing nothing and
       * saying nothing. The branch above sets `phase('drive')` before
       * `reachInlet()` for exactly this reason; this one never did. */
      phase('execution');
      dropWilly();
    }
  }, 0);
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
 * file already exposes on `window.NO_WAKE`
 * (`runtime.startUnderway()`/`runtime.skipDrive()`). `confrontation` stages
 * the same real state `killEngines()` and `goBelow()` reach by the time they
 * hand the mission off to the cabin, then calls `beginCabinScene()` directly
 * so the confrontation dialogue plays out for real from the top on the
 * page's own timers. `body`/`weighted`/`return` pose the beats after it
 * directly -- none of those three is one of the mission's five saveable
 * checkpoints (dock/underway/open_water/execution/weighted) reachable from
 * an earlier one still ahead of it, so there is no earlier real checkpoint
 * to route them through the way `resumeCheckpoint()`, above, routes
 * `underway`/`open_water`/past-execution resumes. `body` calls
 * `readyToFire()` then `fireExecution()`, the exact functions a played run
 * calls, then settles the volley's simulated-clock plan synchronously so the
 * preview lands past the shot. `weighted` mirrors `resumeCheckpoint()`'s own
 * `checkpoint === 'weighted'` branch exactly: the body wrapped and
 * ballasted without sitting through the shooting. `return` continues past
 * that into the same real state `updateDisposal()` reaches right before it
 * calls `beginExit()`, then restarts both engines for real -- the same
 * functions the ignition switches call -- so the ride home is genuinely
 * drivable rather than merely posed.
 */
function jumpToPreviewCheckpoint(id) {
  state.boarding = false;
  state.boarded = true;
  boat.gangway.visible = false;
  boat.targets.board.visible = false;
  player.mode = 'walk';
  player.enabled = true;
  player.ground = boat.root.position.y + DECK_H;
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.yawCenter = null;
  player.yawRange = Math.PI;
  player.position.copy(world.fromBoatLocal(new THREE.Vector3(-.70, DECK_H + 1.66, 3.10)));
  player.yaw = boat.root.rotation.y + Math.PI;
  player.pitch = -.06;
  player.velocity.set(0, 0, 0);
  interaction.setPaused(false);
  hud.toast('Aboard · Gate C', 'good');
  story.checkpoint('dock');
  phase('startup');
  refreshStartupObjective();
  if (id === 'dock') return;

  runtime.startUnderway();
  if (id === 'underway') return;

  // A played run reaches the inlet with the cruiser still doing real way
  // through the water -- this jump never actually drove it, so `speed` is
  // still zero, and `updateBoat()`'s own idle check would read that as
  // "already at rest" and kill the engines on the very next frame, leaving
  // no real coast-down to preview. Give it the same cruising speed the
  // real drive ends at (see the "released cruiser accelerates" checkpoint
  // check in tools/verify-no-wake.mjs) so it coasts down for real before
  // the same real trigger fires -- not held open artificially, just not
  // starting already past it.
  runtime.skipDrive();
  physics.speed = 4.9;
  if (id === 'inlet') return;

  // confrontation/body/weighted/return: the same real state killEngines()
  // and goBelow() reach by the time they hand the mission off to the cabin.
  leaveHelm({ force: true });
  physics.anchored = true;
  physics.running = false;
  physics.speed = 0;
  state.enginesKilled = true;
  boat.controls.running.setOn(false);
  boat.controls.ignitionPort.setOn(false);
  boat.controls.ignitionStarboard.setOn(false);
  state.ignitionPort = false;
  state.ignitionStarboard = false;
  world.setBelow(true);
  state.below = true;
  player.mode = 'walk';
  player.enabled = true;
  player.ground = boat.root.position.y + CABIN_H;
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.yawCenter = null;
  player.yawRange = Math.PI;
  player.pitchMin = -Math.PI / 2 + .05;
  player.pitchMax = Math.PI / 2 - .05;
  player.position.copy(world.fromBoatLocal(new THREE.Vector3(-.25, CABIN_H + 1.66, -2.55)));
  player.velocity.set(0, 0, 0);
  interaction.setPaused(false);
  enterEnclosure();

  if (id === 'confrontation') {
    beginCabinScene();
    return;
  }

  cabin.setLampLevel(1);
  cabin.setDoorsClosed(true);
  placeCabinCast();

  if (id === 'body') {
    readyToFire();
    fireExecution();
    // The volley runs on the scene's simulated clock, and a preview jump is
    // a pose, not a playthrough -- the same reasoning resumeCheckpoint()'s
    // post-execution branch uses when it calls dropWilly() without any
    // shooting. Settle the whole plan here so the page lands on 'body'
    // regardless of how slowly its frames are being drawn.
    while (state.executionPlan) updateExecution(.25);
    return;
  }

  // weighted/return skip the shooting entirely and stage the body already
  // wrapped and ballasted -- the same real state resumeCheckpoint()'s own
  // `checkpoint === 'weighted'` branch reaches for a resumed campaign run.
  prepareGuns();
  story.checkpoint('execution');
  prepareNoWakeWeightedBodyGeometry(boat, bodyRig);
  story.checkpoint('weighted');

  if (id === 'weighted') {
    beginCarry();
    return;
  }

  // return: the same real state `updateDisposal()`'s own chain reaches
  // right before it calls `beginExit()`, then restart both engines for
  // real -- the same functions the ignition switches call -- so the ride
  // home is genuinely drivable rather than merely posed.
  state.bodyDisposed = true;
  bodyRig.disposeTo(1);
  state.below = false;
  world.setBelow(false);
  cabin.setDoorsClosed(false);
  boat.bodyMarker.visible = false;
  sayThenObjective(NO_WAKE_BODY_LINES.startHer, 'LEAVE THE INLET', 'Both engines · then the helm');
  beginExit();
  restartEngine('port');
  restartEngine('starboard');
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
player.position.set(-5.15, 1.86, 7.6);
player.ground = .2;
player.eyeHeight = 1.66;
player.yaw = -.42;
player.pitch = -.05;
player.update(.016);
hud.setClock(3, '12:45 PM', 0);
showEntryAvailability();

const runtime = {
  get phase() { return state.phase; }, set phase(v) { state.phase = v; },
  get campaignState() { return campaign.state; },
  /* `scene` is exposed on purpose: `tools/scene-audit.mjs` finds a page's
   * THREE.Scene by looking for a global with a `.scene` on it, and without one
   * NO WAKE was never audited at all. */
  scene,
  state, physics, world, boat, cabin, bodyRig, player, interaction, story, postfx,
  audio, radio, radioReady, cameraDirector, blood, engineAudio,
  dialogueLog: state.dialogueLog,
  cueLog: state.cueLog,
  startupSteps: STARTUP_STEPS.map((step) => step.key),
  startUnderway() {
    Object.assign(state, {
      boarded: true, battery: true, blower: true, fuel: true,
      ignitionPort: true, ignitionStarboard: true, navLights: true, dockLine: true,
    });
    setStartupCompleteVisuals();
    physics.running = true;
    physics.mooringReleased = true;
    phase('startup');
    enterHelm();
  },
  skipDrive() {
    if (state.phase !== 'drive') return false;
    state.driveSeconds = DRIVE_SECONDS;
    physics.distance = 380;
    physics.position.set(world.inlet.x, world.inlet.z);
    boat.root.position.set(world.inlet.x, boat.floatY, world.inlet.z);
    reachInlet();
    return true;
  },
  skipDialogue() {
    if (!state.dialogue) return false;
    advanceDialogue();
    return true;
  },
  goBelow,
  comeUp,
  beginCabinScene,
  pourTheShot,
  runCabinScript() { dialogue(NO_WAKE_CABIN_SCRIPT, readyToFire); },
  prepareExecution: readyToFire,
  fire: fireExecution,
  dropWilly,
  advanceWrap,
  takeBallast,
  beginBallastAttach,
  beginCarry,
  dumpBody,
  beginExit,
  completeMission,
  leaveHelm(options) { return leaveHelm({ force: options?.force === true }); },
  /* The confrontation's pen, exposed so a check can step the player and apply
   * the clamp in the same loop rather than racing the render frame. */
  clampToStaging,
};
window.NO_WAKE = runtime;
window.__squatchSceneReady?.('NO WAKE ready');

startButton.addEventListener('click', async () => {
  if (!entry.ok) {
    if (campaign.state.scene.id === SCENE_IDS.NO_WAKE) {
      navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door', location });
    } else {
      location.assign('index.html');
    }
    return;
  }
  entry = story.begin();
  if (!entry.ok) {
    showEntryAvailability();
    return;
  }
  if (campaign.state.scene.id !== SCENE_IDS.NO_WAKE) {
    campaign.enter(SCENE_IDS.NO_WAKE, { spawn: 'gate_c' });
  }
  canvas.requestPointerLock?.();
  const motel = campaign.state.missions[MISSION_IDS.JERKY_MOTEL];
  const beef = campaign.state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
  state.cruiseLines = buildNoWakeCruise({
    beefDetected: beef.detected, motelPoliceHeat: motel.policeHeat,
  });
  resumeCheckpoint();
  await audio.init();
  engineAudio.init();
  /* The boat's radio is the scene, so the music bed runs at full rather than
   * at the engine's 0.7 default. Through `busLevel` rather than by writing the
   * gain directly: dialogue now ducks the music bed under a spoken line and
   * restores it to the level the SCENE set, so a bare `gain.value` here would
   * be silently put back to 0.7 the first time anybody talked over the radio. */
  audio.busLevel?.('music', 1, 0);
  await radioReady;
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
  /* A staged checkpoint can arrive with the port engine already running; it
   * was silent until now for the same audio.ready reason. */
  if (state.ignitionPort) {
    audio.startLoop('engine-idle', { name: 'boat.engine.idle', volume: .40, fade: .8 });
    engineAudio.start();
  }
  if (audio.buffers.has('ambience.harbor')) {
    audio.startLoop('harbor', { name: 'ambience.harbor', volume: .24, ambience: true });
  } else {
    audio.startLoop('harbor', { name: 'boat.hull.wake', volume: .05, ambience: true });
  }
  document.body.classList.add('playing');
  sceneInventory.show();
  overlay.classList.add('out');
  player.enabled = true;
  /* Willy's opener, and then nothing. Nobody answers him, and the silence is
   * the first thing in the mission that is wrong. A staged checkpoint skips
   * it -- the jump already posed the mission past the dock. */
  if (!previewCheckpoint && state.phase === 'dock') {
    speak(NO_WAKE_DOCK_LINES[0]);
    setObjective('BOARD THE BOAT', 'Gate C · the platform is down');
  }
  setTimeout(() => overlay.remove(), 850);
});

let interactionPausedBeforeMenu = false;
const pauseMenu = createPauseMenu({
  title: 'No Wake',
  canPause: () => document.body.classList.contains('playing') && !state.leaving,
  getObjective: () => [objectiveEl.textContent, objectiveDetailEl.textContent]
    .filter(Boolean).join(' — ') || 'Follow Lou’s current instruction aboard the boat.',
  instructions: [
    'W A S D — move. E or Click — interact; hold when the prompt asks.',
    'At the helm: W/S — throttle. A/D — steer. Q — leave the helm.',
    'At the execution prompt: Click — fire.',
    'R — advance the boat radio. B — bloom. Tab — pause or resume.',
  ],
  onPause: () => {
    state.paused = true;
    interactionPausedBeforeMenu = interaction.paused;
    player.enabled = false;
    player.clearKeys();
    interaction.release();
    interaction.setPaused(true);
    radio.pause();
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    state.paused = false;
    interaction.setPaused(interactionPausedBeforeMenu);
    audio.ctx?.resume?.();
    radio.resume();
    lastTime = performance.now();
    if (!state.atHelm) {
      const pending = canvas.requestPointerLock?.();
      pending?.catch?.(() => {});
    } else {
      player.enabled = true;
    }
  },
  recovery: createCampaignSceneRecovery({
    campaign,
    sceneId: SCENE_IDS.NO_WAKE,
    location,
    restartCheckpoint: () => location.reload(),
    canRestartCheckpoint: () => {
      const checkpoint = campaign.state.missions[MISSION_IDS.NO_WAKE].checkpoint;
      return Boolean(checkpoint && checkpoint !== 'dock');
    },
  }),
});

canvas.addEventListener('click', () => {
  if (!document.body.classList.contains('playing') || state.paused) return;
  if (document.pointerLockElement === canvas || state.phase === 'ready_to_fire') return;
  const pending = canvas.requestPointerLock?.();
  pending?.catch?.(() => {});
});

document.addEventListener('pointerlockchange', () => {
  if (!state.paused) player.enabled = document.pointerLockElement === canvas || state.atHelm;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) radio.pause();
  else if (!state.paused) radio.resume();
});
document.addEventListener('mousemove', (event) => {
  if (!state.paused && document.pointerLockElement === canvas) {
    player.handleMouseMove(event.movementX, event.movementY);
  }
});
/**
 * E pressed with nothing under the crosshair, during a beat that is waiting for
 * E. `docs/RIGHT-FIRST-TIME.md`, the refused-input rule: "every gated
 * interaction, when refused, must SAY WHY". N4 was exactly this failure --
 * the mission put DUMP THE BODY on screen and then answered the key with
 * silence for as long as the player cared to press it.
 */
function sayWhyNothingHappened() {
  if (interaction.paused) return;
  if (state.phase === 'platform' && !state.bodyDisposed) {
    hud.say('Look down at the bag on the platform, then hold E.', 2600);
  } else if (state.wrapStage) {
    hud.say('Look at the body, then hold E.', 2600);
  }
}

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space') event.preventDefault();
  if (state.paused) return;
  player.setKey(translateKey(event.code), true);
  if (event.code === 'KeyE') {
    const onSomething = Boolean(interaction.current);
    interaction.press();
    if (!onSomething) sayWhyNothingHappened();
  }
  if (event.code === 'KeyR' && radio.on) radio.next();
  if (event.code === 'KeyB') hud.toast(postfx.toggle() ? 'Bloom on' : 'Bloom off', 'good');
  if (event.code === 'KeyQ' && state.atHelm) leaveHelm();
});
document.addEventListener('keyup', (event) => {
  player.setKey(translateKey(event.code), false);
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
/* Alt-tab safety. The visibilitychange handler above only minds the radio; a
 * window that loses focus never gets the keyup, so without this the last held
 * key steers the boat for as long as the tab is away (the pattern in
 * src/silver/main.js and src/bing/main.js). */
window.addEventListener('blur', () => {
  player.clearKeys();
  interaction.release();
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
  if (state.paused) {
    postfx.render();
    return;
  }
  elapsed += dt;
  state.phaseTime += dt;
  updateDialogue(dt);
  updateBoat(dt);
  if (!['carry', 'dispose'].includes(state.phase)) player.update(dt);
  clampToStaging();
  interaction.update(dt);
  updateCast(dt);
  updateExecution(dt);
  updateGlassRoll(dt);
  updateCarry(dt);
  updateDisposal();
  updateExit();
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
