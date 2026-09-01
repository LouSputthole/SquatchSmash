import * as THREE from 'three';

import { AudioEngine } from '../core/audio.js';
import { AuthoredClock } from '../core/authored-clock.js';
import { createCampaignArrivalScore } from '../core/campaign-arrival-score.js';
import {
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
} from '../core/campaign.js';
import { createGraveyardStory } from '../core/graveyard-story.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { createFirstPersonInput } from '../core/first-person-input.js';
import { conciseObjectiveItems, createObjectivePanel } from '../core/objective-panel.js';
import { Player } from '../core/player.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { PostFX } from '../core/postfx.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import { settleStart } from '../core/start-gate.js';
import { StreamSystem } from '../world/stream.js';
import { graveyardAudioLoadOptions } from './audio.js';
import { createGraveyardInputPolicy, createPrimaryGraveControl } from './controls.js';
import {
  GRAVEYARD_ARRIVAL_LINES,
  GRAVEYARD_SNOW_BARKS,
  GraveyardMission,
  GRAVES,
  resolveGraveyardLineHold,
  shouldAutoTriggerEcho,
} from './mission.js';
import {
  GRAVEYARD_PREVIEW_CHECKPOINT_LABELS,
  previewGraveyardCheckpointForLocation,
  stageGraveyardCheckpointGeometry,
} from './preview.js';
import { buildGraveyard } from './world.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const ending = document.getElementById('ending');
const loading = document.getElementById('loading');
const startButton = document.getElementById('start-btn');
const motelButton = document.getElementById('motel-btn');
const speakerEl = document.getElementById('speaker');
const peeHint = document.getElementById('pee-hint');

const campaign = createCampaign();
const story = createGraveyardStory({ campaign });
const previewCheckpoint = previewGraveyardCheckpointForLocation();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
attachPixelRatio(renderer);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06100f);
scene.fog = new THREE.FogExp2(0x091412, 0.023);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.04, 180);
camera.name = 'graveyard.camera';
scene.add(camera);

const moon = new THREE.DirectionalLight(0xa9c5d2, 1.48);
moon.position.set(-15, 22, 8);
moon.castShadow = true;
moon.shadow.mapSize.set(1536, 1536);
moon.shadow.camera.left = -24;
moon.shadow.camera.right = 24;
moon.shadow.camera.top = 24;
moon.shadow.camera.bottom = -24;
scene.add(moon);
scene.add(new THREE.HemisphereLight(0x38585a, 0x0b0b08, 0.94));
const clearingFill = new THREE.PointLight(0xd0b77c, 6.2, 24, 2);
clearingFill.position.set(0, 3.2, 4);
scene.add(clearingFill);

window.__squatchStage?.('Raising the old stones…');
const graveyard = buildGraveyard(scene);
const world = {
  colliders: graveyard.colliders,
  floorZones: graveyard.floorZones,
  groundAt: () => 0,
};
const hud = new Hud();
const sceneInventory = new SceneInventoryBar({ slots: 5, visible: false });
const player = new Player(camera, world);
// Arrive off the rear quarter instead of directly behind the open trunk. The
// first read should be car + wrapped body + headlight path, not the camera
// buried in a wall of boot-lid geometry.
player.position.set(4.5, 1.66, 21.5);
player.yaw = 0.34;
player.pitch = -0.1;
player.mode = 'walk';
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);
const interaction = new InteractionSystem(camera, hud);
const audio = new AudioEngine();
const arrivalScore = createCampaignArrivalScore(audio, 'squatch_graveyard');
const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
if (postfx.bloom) {
  postfx.bloom.threshold = 0.72;
  postfx.bloom.strength = 0.5;
  postfx.bloom.radius = 0.42;
}
const stream = new StreamSystem(scene);
stream.setColliders(world.colliders);

const clock = new AuthoredClock();
clock.setTime(campaign.state.story.day, campaign.state.story.timeMinutes);

const state = {
  phase: 'menu',
  paused: false,
  elapsed: 0,
  lines: [],
  activeLine: null,
  bodyMoving: false,
  echoTriggered: false,
  sauceSuggested: false,
  endingShown: false,
  pee: {
    active: false,
    graveId: null,
    time: 0,
    bladder: 1,
    impactStart: 0,
  },
};

function queueLine(text, { cue = null, who = 'Prospect', seconds = null } = {}) {
  state.lines.push({ text, cue, who, seconds });
}

const mission = new GraveyardMission({
  onLine: (text, meta = {}) => queueLine(text, meta),
  onRumble: () => {
    graveyard.startEchoRumble();
    audio.play('car.impact.metal', { volume: 0.22, position: graveyard.echoPosition });
  },
  onObjective: repaintObjectives,
});

if (previewCheckpoint) {
  const label = GRAVEYARD_PREVIEW_CHECKPOINT_LABELS[previewCheckpoint];
  const tag = overlay.querySelector('.tag');
  if (tag) tag.textContent = `Demo checkpoint: ${label}. Progress on this page is temporary.`;
  startButton.textContent = `Start ${label.toLowerCase()}`;
}

/**
 * THE SHARED OBJECTIVE CARD, NOT A FOURTH ONE.
 *
 * This scene drew its own `#mission-card`: its own kicker, its own `<ol>`,
 * its own tick glyphs, its own gold. That is the duplication the owner named
 * -- *"objectives change presentation"* -- and `tools/shared-systems.mjs` now
 * records per scene which of us actually reuse the one implementation in
 * `src/core/objective-panel.js`. This is that reuse.
 *
 * It hangs off `#hud` rather than `<body>` so it fades up with the rest of
 * the furniture on `body.playing`, exactly as the card it replaces did.
 */
const objectivePanel = createObjectivePanel({ parent: document.getElementById('hud') });

/** The line under the list that answers "which way", per body state. */
function objectiveHint() {
  if (mission.bodyBuried) return 'The Motel is next · Snow is still not explaining it';
  if (mission.bodyPlaced) return 'Use the shovel beside the fresh plot';
  if (mission.bodyCarried) return 'Past GeeWiz · head toward the marker';
  return 'Carry him to the fresh plot before you bury him';
}

/**
 * The card's contents.
 *
 * The old card said the burial beat TWICE -- a headline it worded itself and
 * a list row the mission owns -- and the two wordings drifted ("Fill HotDog's
 * grave" against "Fill Billy HotDog's grave"). `GraveyardMission.objectives`
 * is the one that restores, saves and is asserted on, so it wins. The car is
 * the only beat the headline had that the list never did, so it is appended
 * once the grave is filled.
 */
function objectivePlan() {
  const items = mission.objectives.map((objective) => ({
    label: objective.text,
    done: objective.done,
    required: !objective.optional,
    retire: objective.retire,
  }));
  if (mission.bodyBuried) items.push({ label: 'Return to Snow\'s car', done: false, required: true });
  return {
    title: 'THE HOTDOG INCIDENT · DISPOSAL',
    /* Burial is the one next action. The two museum counters are the explicit
     * exception: they describe optional work already available across this
     * open graveyard and preserve a meaningful 8/8 result when finished. */
    items: conciseObjectiveItems(items, { optionalLimit: 2 }),
    hint: objectiveHint(),
  };
}

function repaintObjectives() {
  objectivePanel.set(objectivePlan());
}
repaintObjectives();

function cueSeconds(name) {
  const bank = audio.buffers?.get(name);
  return bank?.length ? bank[0].duration : 0;
}

/** Play one line and hand the TAKE back, so a mouth can run on it. */
function playCue(name) {
  if (!name || !audio.ready) return null;
  const bank = audio.buffers?.get(name);
  if (!bank?.length) return null;
  audio._vo?.stop?.();
  const source = audio.play(name, { volume: 0.9 });
  audio._vo = source;
  return { audio, source, seconds: bank[0].duration };
}

function updateDialogue(dt) {
  if (!state.activeLine && state.lines.length) {
    const line = state.lines.shift();
    const recorded = cueSeconds(line.cue);
    const duration = resolveGraveyardLineHold(line, recorded);
    state.activeLine = { ...line, remaining: duration };
    speakerEl.querySelector('small').textContent = line.who || 'Prospect';
    speakerEl.querySelector('span').textContent = line.text;
    speakerEl.classList.remove('hidden');
    /* And the man who is saying it says it.
     *
     * Snow is the only body out here with lines -- the Prospect is the player,
     * in first person, with no head to animate -- so this is one name rather
     * than a table. The mouth runs on the take (src/core/mouth.js) and falls
     * back to a synthesised envelope for the subtitle's own length when the
     * cue has no recording, which most of the graveyard's still do not. */
    const take = playCue(line.cue);
    if ((line.who || '') === 'Snow') {
      graveyard.snow?.say?.(Math.max(1.4, duration), take);
    } else {
      graveyard.snow?.hush?.();
    }
  }
  if (!state.activeLine) return;
  state.activeLine.remaining -= dt;
  if (state.activeLine.remaining <= 0) {
    state.activeLine = null;
    speakerEl.classList.add('hidden');
  }
}

function inspect(id) {
  const result = mission.inspectGrave(id);
  if (result) story.recordInspection(id);
  if (id === 'sauce' && !state.sauceSuggested) {
    state.sauceSuggested = true;
    mission.suggestSaucePlot();
  }
  if (result?.kind === 'echo') {
    state.echoTriggered = true;
    story.noteEcho();
  }
  return result;
}

function payRespect(id) {
  if (!mission.inspected.has(id)) inspect(id);
  if (!mission.payRespect(id)) return false;
  story.recordRespect(id);
  hud.toast(`${GRAVES[id].name} · respects paid`, 'good');
  return true;
}

for (const [id, marker] of Object.entries(graveyard.graves)) {
  interaction.register(marker, {
    label: () => {
      const choice = mission.tributeFor(id);
      if (choice) return `<b>${GRAVES[id].name}</b> · ${choice === 'respect' ? 'respects paid' : 'disrespected'}`;
      if (GRAVES[id].traitor) {
        return `Hold to automatically disrespect <b>${GRAVES[id].name}</b>`;
      }
      return `Tap to read <b>${GRAVES[id].name}</b> · hold to pay respects`;
    },
    holdLabel: () => `Pay respects at <b>${GRAVES[id].name}</b>`,
    hold: 0.85,
    enabled: () => state.phase === 'active' && !state.pee.active && !state.bodyMoving,
    onTap: () => inspect(id),
    onUse: () => payRespect(id),
  });
}

function pickUpHotDog() {
  if (!graveyard.pickUpBody(camera)) return false;
  if (!mission.pickUpBody()) {
    console.error('[graveyard] visual body picked up outside mission state');
    return false;
  }
  input.clear('body-pickup');
  arrivalScore.stop('body-picked-up');
  audio.play('cloth.suit.movement', { volume: 0.75, position: player.position });
  repaintObjectives();
  hud.toast('Billy HotDog · carrying', 'good');
  return true;
}

function placeHotDog() {
  if (mission.state !== 'carried' || state.bodyMoving) return false;
  state.bodyMoving = true;
  interaction.setPaused(true);
  input.clear('body-placement');
  audio.play('cloth.suit.movement', { volume: 0.75, position: graveyard.freshPosition });
  if (!graveyard.placeBody(() => {
    if (!mission.placeBody()) {
      console.error('[graveyard] visual body placed outside mission state');
    }
    state.bodyMoving = false;
    interaction.setPaused(false);
    repaintObjectives();
    hud.toast('HotDog placed · head to the marker', 'good');
  })) {
    state.bodyMoving = false;
    interaction.setPaused(false);
    return false;
  }
  return true;
}

interaction.register(graveyard.body, {
  label: 'Hold to <b>lift Billy HotDog out of the trunk</b>',
  hold: 1.35,
  enabled: () => state.phase === 'active' && mission.state === 'arrival' && !state.bodyMoving,
  onTap: () => hud.say('That is Billy. Get both arms under him and hold.', 3000),
  onUse: pickUpHotDog,
});

interaction.register(graveyard.freshPlot, {
  label: 'Hold to <b>place HotDog in the fresh grave</b>',
  hold: 1.6,
  enabled: () => state.phase === 'active' && mission.state === 'carried' && !state.bodyMoving,
  onTap: () => hud.say('Head by the marker. Feet toward the road. Hold steady.', 3200),
  onUse: placeHotDog,
});

interaction.register(graveyard.shovel, {
  label: 'Hold to <b>fill HotDog\'s grave</b>',
  hold: 2.25,
  enabled: () => state.phase === 'active' && mission.bodyPlaced && !mission.bodyBuried,
  onTap: () => hud.say('It is a whole grave, not a decorative scoop. Hold it.', 3000),
  onHoldProgress: (progress) => {
    if (progress > 0.1 && Math.floor(progress * 10) % 3 === 0) {
      audio.play('footstep.dirt', { volume: 0.18, position: graveyard.freshPosition });
    }
  },
  onUse: completeBurial,
});

function completeBurial() {
  if (mission.state !== 'placed' || graveyard.bodyPresentation().phase !== 'placed') {
    console.error('[graveyard] burial refused because mission and body placement are out of sync');
    return false;
  }
  if (!mission.finishBurial()) return false;
  if (!graveyard.finishBurial()) {
    console.error('[graveyard] mission buried a body that was not visually placed');
    return false;
  }
  const choices = {
    bodyBuried: true,
    echoHeard: mission.echoHeard,
    urinatedOn: [...mission.urinatedOn],
  };
  if (!story.complete(choices)) {
    console.error('[graveyard] burial did not complete campaign', choices, campaign.state);
    hud.toast('Campaign save failed', 'bad', 5200);
    return false;
  }
  clock.setTime(campaign.state.story.day, campaign.state.story.timeMinutes);
  repaintObjectives();
  hud.toast('THE HOTDOG INCIDENT · COMPLETE', 'good', 4600);
  return true;
}

interaction.register(graveyard.snow.group, {
  label: 'Talk to <b>Snow</b>',
  enabled: () => state.phase === 'active'
    && !state.pee.active
    && !state.activeLine
    && state.lines.length === 0,
  onUse: () => {
    graveyard.snow.faceToward(player.position.x, player.position.z);
    graveyard.snow.say(2.5);
    if (mission.bodyBuried) {
      queueLine(GRAVEYARD_SNOW_BARKS.car.text, {
        cue: GRAVEYARD_SNOW_BARKS.car.cue,
        who: GRAVEYARD_SNOW_BARKS.car.who,
        seconds: GRAVEYARD_SNOW_BARKS.car.seconds,
      });
    } else {
      queueLine(GRAVEYARD_SNOW_BARKS.plot.text, {
        cue: GRAVEYARD_SNOW_BARKS.plot.cue,
        who: GRAVEYARD_SNOW_BARKS.plot.who,
        seconds: GRAVEYARD_SNOW_BARKS.plot.seconds,
      });
    }
  },
});

interaction.register(graveyard.car, {
  label: 'Hold to <b>leave for the Jerky Motel</b>',
  hold: 1.25,
  enabled: () => state.phase === 'active' && mission.readyToLeave && !state.endingShown,
  onTap: () => hud.say('Snow is waiting. Hold to get in.', 2500),
  onUse: () => finishScene(),
});

function currentTraitorGrave() {
  const id = interaction.current?.userData?.graveId;
  return id && GRAVES[id]?.traitor && !mission.tributeFor(id) ? id : null;
}

function startPee(id = currentTraitorGrave()) {
  if (id !== currentTraitorGrave()) return false;
  if (!id || state.pee.active || state.pee.bladder <= 0.08) return false;
  state.pee.active = true;
  state.pee.graveId = id;
  state.pee.time = 0;
  stream.resetStats();
  state.pee.impactStart = stream.stats.total;
  audio.play('pee.zip', { volume: 0.65 });
  audio.startLoop('pee.stream', { volume: 0, fade: 0.2 });
  audio.startLoop('pee.miss', { volume: 0, fade: 0.2 });
  hud.setPosture('stop');
  hud.say(`A private Family service for ${GRAVES[id].name}.`, 2800);
  return true;
}

/* What the hold has to buy: a second of it, and ten impacts actually landing
 * on the stone. Both are measured in simulated time and particle hits, never
 * wall clock -- which is why it is a predicate a check can wait on rather than
 * a duration a check can sleep for. */
function peeEarned() {
  return state.pee.active
    && state.pee.time >= 1.05
    && stream.stats.total - state.pee.impactStart >= 10;
}

function stopPee() {
  if (!state.pee.active) return;
  const id = state.pee.graveId;
  const earned = peeEarned();
  state.pee.active = false;
  state.pee.graveId = null;
  hud.setPosture(null);
  audio.stopLoop('pee.stream', 0.25);
  audio.stopLoop('pee.miss', 0.25);
  audio.play('pee.zip', { volume: 0.6 });
  if (earned && mission.urinateOn(id)) {
    story.recordUrination(id);
    hud.toast(`${GRAVES[id].name} · properly disrespected`, 'good');
  }
}

const primaryControl = createPrimaryGraveControl({
  interaction,
  currentTraitor: currentTraitorGrave,
  startDisrespect: startPee,
  stopDisrespect: stopPee,
  isDisrespecting: () => state.pee.active,
});

const peeOrigin = new THREE.Vector3();
const peeDirection = new THREE.Vector3();
const peeAimPoint = new THREE.Vector3();
function updatePee(dt) {
  hud.setBladder(state.pee.bladder, state.pee.active, 'bladder');
  if (!state.pee.active) return;
  state.pee.time += dt;
  state.pee.bladder = Math.max(0, state.pee.bladder - dt * 0.055);
  const ramp = Math.min(1, state.pee.time / 0.38);
  const power = ramp * Math.min(1, 0.32 + state.pee.bladder * 1.8);
  const level = 0.1 + power * 0.22;
  audio.setLoopVolume('pee.stream', level * 0.68, 0.12);
  audio.setLoopVolume('pee.miss', level * 0.46, 0.12);
  camera.getWorldPosition(peeOrigin);
  camera.getWorldDirection(peeDirection);
  peeAimPoint.copy(peeOrigin).addScaledVector(peeDirection, 1.25);
  peeOrigin.addScaledVector(peeDirection, 0.18);
  peeOrigin.y -= 0.58;
  peeDirection.copy(peeAimPoint).sub(peeOrigin).normalize();
  stream.emit(peeOrigin, peeDirection, dt, power);
  if (state.pee.bladder <= 0.01) stopPee();
}

function finishScene() {
  if (state.endingShown || !mission.readyToLeave) return false;
  mission.finish();
  state.endingShown = true;
  state.phase = 'complete';
  input.suspend();
  interaction.setPaused(true);
  audio.play('car.engine.start', { volume: 0.82, position: graveyard.car.position });
  audio.startLoop('car.engine.idle', { volume: 0.2 });
  document.exitPointerLock?.();
  setTimeout(() => ending.classList.remove('hidden'), 850);
  return true;
}

const runtime = {
  story,
  mission,
  scene,
  player,
  get input() { return input; },
  get renderedFrameCount() { return renderedFrameCount; },
  interaction,
  get campaignState() { return campaign.state; },
  get phase() { return state.phase; },
  get displayClock() { return { day: clock.day, timeMinutes: clock.minutes }; },
  get interactionTarget() { return interaction.current?.userData?.graveId ?? null; },
  get disrespecting() { return state.pee.active; },
  get disrespectEarned() { return peeEarned(); },
  inspect,
  respect: payRespect,
  startPee,
  stopPee,
  pickupBody: pickUpHotDog,
  placeBody: placeHotDog,
  bodyPresentation: () => graveyard.bodyPresentation(),
  arrivalScore: () => arrivalScore.snapshot(),
  get previewCheckpoint() { return previewCheckpoint; },
  bury: completeBurial,
};
window.GRAVEYARD = runtime;

function requestGamePointerLock() {
  return input.requestPointerLock();
}

const graveyardInputPolicy = createGraveyardInputPolicy({
  isActive: () => state.phase === 'active' && !state.paused,
  isCarrying: () => mission.state === 'carried',
  isDisrespecting: () => state.pee.active,
  primaryControl,
  stopDisrespect: stopPee,
  notifyCarryRefusal: () => hud.say('Not with HotDog in both arms.', 2200),
  toggleBloom: () => postfx.toggle(),
  showBloom: (enabled) => hud.toast(enabled ? 'Bloom on' : 'Bloom off', 'good'),
});
const input = createFirstPersonInput({
  player,
  canvas,
  interaction: primaryControl,
  ...graveyardInputPolicy,
});
window.__squatchSceneReady?.('GRAVEYARD ready');

startButton.addEventListener('click', async () => {
  const entry = story.begin();
  if (!entry.ok) {
    overlay.querySelector('.tag').textContent = entry.reason === 'already_complete'
      ? 'HotDog is already buried in this save. Continue to the Motel.'
      : 'The body is not loaded. Finish the Bada Bing cleanup before coming here.';
    startButton.textContent = entry.reason === 'already_complete' ? 'GO TO MOTEL' : 'SCENE UNAVAILABLE';
    /* GO TO MOTEL WAS A DEAD BUTTON, AND THIS IS WHY.
     *
     * `src/core/start-gate.js` is a capture-phase adapter: the first click on
     * a start control marks it `pending` and SWALLOWS every click after that
     * until something settles it. It settles itself in a microtask if the
     * button has disabled itself or swapped its handler -- but microtasks run
     * between listeners, so that check happens BEFORE this listener has done
     * either. Its other escape is the MutationObserver, which waits for the
     * overlay to hide; on a refusal the overlay stays up by design.
     *
     * So on a save where HotDog is already buried, the player was left on a
     * card offering GO TO MOTEL and a button that could not be pressed --
     * exactly the silent-failure class docs/ENGINE-TRAPS.md keeps warning
     * about, and the reason tools/verify-graveyard.mjs could not get past its
     * second gate. The start HAS resolved here; it resolved into a refusal.
     * Saying so through the gate's own API is the fix, rather than a
     * scene-local copy of the same bookkeeping. */
    settleStart(startButton, { ok: true });
    if (entry.reason === 'already_complete') {
      startButton.onclick = () => story.continueAfterCompletion({ location });
    } else {
      startButton.disabled = true;
    }
    return;
  }
  if (campaign.state.scene.id !== SCENE_IDS.SQUATCH_GRAVEYARD) {
    campaign.enter(SCENE_IDS.SQUATCH_GRAVEYARD, { spawn: 'headlights' });
  }
  mission.restoreProgress(campaign.state.missions[MISSION_IDS.BADA_BING_TWO]);
  if (previewCheckpoint) {
    stageGraveyardCheckpointGeometry(previewCheckpoint, {
      graveyard,
      mission,
      carryAnchor: camera,
      player,
    });
  }
  state.echoTriggered = mission.echoHeard;
  startButton.disabled = true;
  startButton.textContent = 'Loading graveyard audio...';
  clock.setTime(campaign.state.story.day, campaign.state.story.timeMinutes);
  await audio.init();
  await audio.loadManifest(graveyardAudioLoadOptions());
  audio.startLoop('graveyard.wind', { name: 'ambience.rain', volume: 0.065, ambience: true, fade: 1.5 });
  audio.startLoop('car.engine.idle', { volume: 0.12, ambience: true, fade: 1.2 });
  if (!previewCheckpoint || previewCheckpoint === 'arrival') arrivalScore.start();
  state.phase = 'active';
  startButton.disabled = false;
  document.body.classList.add('playing');
  sceneInventory.set([]);
  sceneInventory.show();
  overlay.classList.add('hidden');
  input.refresh('mission-start');
  requestGamePointerLock();
  for (const line of GRAVEYARD_ARRIVAL_LINES) {
    queueLine(line.text, { cue: line.cue, who: line.who, seconds: line.seconds });
  }
});

const pauseMenu = createPauseMenu({
  title: 'The Squatch Graveyard',
  canPause: () => state.phase === 'active' && !state.endingShown,
  getObjective: () => {
    const plan = objectivePlan();
    const step = plan.items.find((item) => item.required && !item.done)?.label ?? '';
    return [step, plan.hint].filter(Boolean).join(' — ')
      || 'Carry Billy to the open grave and bury him.';
  },
  instructions: [
    'W A S D — move. Shift — hurry. Space — jump unless carrying Billy.',
    'E or Click — interact; hold E for carrying, placement, burial, and grave actions.',
    'Brawny and Whiplash automatically use the disrespect action.',
    'Q — stop the disrespect action. B — bloom. Tab — pause or resume.',
  ],
  onPause: () => {
    state.paused = true;
    input.suspend();
    interaction.setPaused(true);
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    state.paused = false;
    interaction.setPaused(false);
    audio.ctx?.resume?.();
    lastTime = performance.now();
    input.resume();
  },
  recovery: createCampaignSceneRecovery({
    campaign,
    sceneId: SCENE_IDS.SQUATCH_GRAVEYARD,
    location,
  }),
});

motelButton.addEventListener('click', () => {
  story.continueAfterCompletion({ location });
});

/* And a hidden tab should not keep simulating and playing the graveyard at
 * itself: route through the pause menu, whose onPause already clears keys,
 * suspends the audio context, and freezes the sim. pause() refuses politely
 * outside the active phase. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseMenu.pause();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  postfx.setSize(innerWidth, innerHeight);
});

let renderedFrameCount = 0;
let lastTime = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  if (!state.paused) state.elapsed += dt;
  if (state.phase === 'active' && !state.paused) {
    player.update(dt);
    interaction.update(dt);
    updatePee(dt);
    stream.update(dt);
    if (!mission.echoHeard && shouldAutoTriggerEcho(player.position, graveyard.echoPosition)) {
      inspect('echo');
    }
    const traitor = currentTraitorGrave();
    peeHint.classList.toggle('hidden', !traitor || state.pee.active);
  }
  if (!state.paused) {
    updateDialogue(dt);
    graveyard.update(dt, state.elapsed, player.position);
    clock.update(dt);
  }
  hud.setClock(clock.day, clock.clock12, clock.elapsedReal);
  /* Where the player's ears are. Without this the WebAudio listener sits at
   * the world origin facing -Z for the whole scene and every positioned cue is
   * panned as heard from there -- see the long note in
   * src/cartel-palace/main.js, where the owner caught it. */
  audio.updateListener(camera);
  postfx.render();
  renderedFrameCount += 1;
  postfx.sample(dt);
}
requestAnimationFrame(animate);

setTimeout(() => loading.classList.add('out'), 160);
setTimeout(() => loading.remove(), 760);
