import * as THREE from 'three';

import { AudioEngine } from '../core/audio.js';
import { SPEECH_MIX_INDOORS, hasSpeech, speak } from '../core/dialogue.js';
import { AuthoredClock } from '../core/authored-clock.js';
import { BloodImpactSystem, BloodSpurtSystem, DeathBloodPool } from '../world/blood.js';
import {
  CHARACTER_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  navigateCampaign,
} from '../core/campaign.js';
import { createBadaBingTwoStory } from '../core/bada-bing-two-story.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { conciseObjectiveItems, createObjectivePanel } from '../core/objective-panel.js';
import { createFirstPersonInput } from '../core/first-person-input.js';
import { Player } from '../core/player.js';
import { shakeScale } from '../core/settings.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { PostFX } from '../core/postfx.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { buildBooskiShotProps, createBooskiShotBeat } from './booski-shot.js';
import { buildClub, roomAt } from './club.js';
import {
  APE_EXIT_ROUTE,
  APE_RETURN_ROUTE,
  createHotDogAttack,
} from './hotdog-attack.js';
import { hotDogAudioLoadOptions } from './hotdog-audio.js';
import { createHotDogChatter } from './hotdog-chatter.js';
import { createHotDogInputPolicy } from './hotdog-controls.js';
import { restoreHotDogCleanupPresentation } from './hotdog-cleanup-presentation.js';
import { buildHotDogParty } from './hotdog-party.js';
import {
  HOTDOG_PREVIEW_CHECKPOINTS,
  poseHotDogAttackGeometry,
  poseHotDogCleanupRolesGeometry,
  poseHotDogResolvedAttackGeometry,
  showHotDogCleanupGuidesGeometry,
} from './preview.js';
import {
  HOTDOG_SPEAKERS,
  HOTDOG_STAGED_LINES,
  HOTDOG_WALKUP_LINES,
} from './hotdog-room-voices.js';
import {
  SecondVisitMission,
  buildHotDogPartySequence,
} from './second-visit.js';
import { isPreviewMode } from '../core/preview-mode.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startButton = document.getElementById('start-btn');
const assetStatus = document.getElementById('asset-status');
const blackout = document.getElementById('blackout');
const dialogueRoot = document.getElementById('dialogue');

/* `.otitle`, not `.head`, and THIS PAGE SHARES bing.html WITH THE CLUB.
 *
 * The Bing adopted src/core/objective-panel.js, whose markup contract is
 * `.otitle` + `ul.olist`, so bing.html's card was renamed to match -- and this
 * file, a different page built on the same markup, kept asking for the old
 * name. querySelector returned null, the assignment threw before anything else
 * ran, and the WHOLE PAGE died on "Could not load the game code": not a
 * degraded objective card, no party at all.
 *
 * The rename was grepped for, in main.js and in the HTML, and not in the
 * sibling that shares the file. verify:webgl-health is what caught it, on its
 * first run in this repository's life. */
const objectivePanel = createObjectivePanel();

overlay.querySelector('h1').innerHTML = 'THE <span>HOTDOG INCIDENT</span>';
overlay.querySelector('.tag').textContent = 'The Bada Bing is closed for Billy HotDog\'s welcome-home party. Family only. Hog Mama is waiting on the stage controls.';
startButton.textContent = 'Enter the closed party';
overlay.querySelector('.controls').innerHTML = [
  '<li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Shift</kbd> hurry · <kbd>Space</kbd> jump</li>',
  '<li><kbd>E</kbd> / <kbd>Click</kbd> interact · hold for cleanup and loading</li>',
  '<li><kbd>Tab</kbd> objectives · <kbd>B</kbd> bloom · <kbd>Esc</kbd> release mouse</li>',
  '<li>The room handles its own jobs. Prospect has one short cleanup spine.</li>',
].join('');
assetStatus.textContent = 'Closed party · Hog Mama set · sudden attack · cleanup · body transfer';

/* ------------------------------------------------------------------ */
/* Preview checkpoint shortcuts (?preview=1&checkpoint=...)            */
/*
 * LOCAL support only, deliberately -- mirrors src/enolasquatch/main.js's own
 * CHECKPOINT_ALIASES rather than routing through src/core/preview-mode.js,
 * whose checkpoint parsers are each a different scene's own vocabulary. The
 * Hotdog Incident is campaign-owned, so this is gated on the shared,
 * scene-agnostic `isPreviewMode()` the same way Enola's is -- a bare
 * `?checkpoint=` on an ordinary link must do nothing.
 *
 * `party` needs no staging: it is the ordinary opening. `attack`/`cleanup`/
 * `graveyard` replay the mission's own real progression functions in order --
 * `mission.enteredClub()`/`startPerformance()`/`finishPerformance()`,
 * `stageAttack()` (a live, player-driven knife fight for `attack` itself) or
 * `resolveAttack()` (posed directly for `cleanup`/`graveyard`, the same
 * function a landed final hit calls), `completeCleanupTask()`,
 * `mission.wrapBody()`/`assign()` and `story.completeClub()` -- the same
 * functions the party director and the cleanup interactions already call
 * during a played run, exactly the contract
 * src/mansion/siege/main.js's `jumpToCheckpoint` documents for its own beat
 * chain, rather than assigning `mission.state` by hand. See
 * `jumpToPreviewCheckpoint()`, near the bottom of this file, for where that
 * staging happens. Only `graveyard` calls `story.completeClub()` -- the one
 * call that banks the campaign checkpoint as `'body_loaded'` -- so a preview
 * short of it can never trip the production resume path
 * (`begun.checkpoint === 'body_loaded'`, in the Start handler below) into
 * redirecting a later reload straight to the graveyard. `graveyard` itself
 * leaves the party director running afterward so the real handoff dialogue
 * and the real ending card play out on the next few real frames.
 */
const HOTDOG_CHECKPOINTS = HOTDOG_PREVIEW_CHECKPOINTS;
const HOTDOG_CHECKPOINT_LABELS = Object.freeze({
  party: 'THE PARTY',
  attack: 'THE ATTACK',
  cleanup: 'CLEANUP',
  graveyard: 'THE GRAVEYARD HANDOFF',
});
function previewCheckpointForLocation(locationLike = window.location) {
  if (!isPreviewMode(locationLike)) return null;
  let params;
  try { params = new URLSearchParams(locationLike?.search || ''); } catch { return null; }
  const value = params.get('checkpoint');
  return value && HOTDOG_CHECKPOINTS.includes(value) ? value : null;
}
/** Resolved once at boot -- a real waypoint id, or null for the ordinary opening. */
const previewCheckpoint = previewCheckpointForLocation();
if (previewCheckpoint) {
  const label = HOTDOG_CHECKPOINT_LABELS[previewCheckpoint];
  overlay.querySelector('.tag').textContent =
    `Preview checkpoint: ${label}. Progress on this page is temporary.`;
  startButton.textContent = `Start at ${label.toLowerCase()}`;
}

const campaign = createCampaign();
const story = createBadaBingTwoStory({ campaign });

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
attachPixelRatio(renderer);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 260);
scene.add(camera);
const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
if (postfx.bloom) {
  postfx.bloom.threshold = 0.9;
  postfx.bloom.strength = 0.32;
}

const audio = new AudioEngine();
const hud = new Hud();
const sceneInventory = new SceneInventoryBar({ slots: 5, visible: false });
const world = { colliders: [], floorZones: [], groundAt: () => 0 };
const player = new Player(camera, world);
const interaction = new InteractionSystem(camera, hud);
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

window.__squatchStage?.('Closing the club to the public...');
const club = buildClub(scene, { renderer });
world.colliders = club.colliders;
world.floorZones = club.floorZones;
world.groundAt = club.groundAt;
await club.artReady;
window.__squatchStage?.('Seating the entire Family...');
const party = await buildHotDogParty(scene, club);
window.__squatchStage?.('Wiring the cleanup route...');

const clock = new AuthoredClock();
clock.setTime(campaign.state.story.day, campaign.state.story.timeMinutes);
const sequence = buildHotDogPartySequence();

const state = {
  phase: 'menu',
  started: false,
  paused: false,
  room: 'outside',
  elapsed: 0,
  director: {
    running: false,
    index: 0,
    remaining: 0,
    gapRemaining: 0,
    current: null,
    waitingForAttack: false,
    handoffReady: false,
  },
  fallen: false,
  cleanupActive: false,
  bathroom: new Set(),
  evidence: new Set(),
  kitTaken: false,
  finalSwept: false,
  wrapped: false,
  carrying: false,
  loaded: false,
  debriefed: false,
  departing: false,
  holdingShot: false,
  plateTaken: false,
  lineHistory: [],
  endingShown: false,
  cinematic: {
    active: false,
    shot: null,
    eye: new THREE.Vector3(),
    look: new THREE.Vector3(),
    shake: 0,
    anchorYaw: 0,
    anchorPitch: 0,
  },
  shubesArrived: false,
};

let mission = null;
let chatter = null;
mission = new SecondVisitMission({
  onObjective: repaintObjectives,
  onMessage: (text) => hud.toast(text, ''),
  onNote: (text) => hud.say(text, 4200),
  // The Shubenator is standing at the stage; he shouts it rather than the HUD
  // printing his name and his words at a man who can see him.
  onNudge: (line) => chatter?.interrupt(line),
});

function repaintObjectives() {
  if (!mission) return;
  /* SecondVisitMission keeps its completed ledger for campaign recovery and
   * verifier receipts. The shared panel projects that ledger onto the one
   * thing the player can act on now, so completed work leaves immediately and
   * an exhausted list hides the whole card instead of becoming a trophy case. */
  objectivePanel.set({
    title: 'THE HOTDOG INCIDENT',
    items: conciseObjectiveItems(mission.objectives.map((objective) => ({
      id: objective.id,
      label: objective.text,
      done: objective.done,
      required: true,
    }))),
  });
}
repaintObjectives();
window.__squatchStage?.('Assigning party reactions...');

/**
 * The room's own voice.
 *
 * Everything the closed party says that the director does not: the overheard
 * conversations before the set, the reactions to what Ape does, and the
 * cleanup floor. It reads `state.director` to know when it must be quiet, so
 * there is exactly one thing in this scene that decides who owns the room.
 */
chatter = createHotDogChatter({
  player,
  hud,
  state,
  sequence,
  mission,
  speakerActor: (name) => actorFor(name),
  playCue: (cue, speaker) => playCue(cue, speaker),
  cueSeconds: (cue) => cueSeconds(cue),
});

function cueSeconds(name) {
  const bank = audio.buffers?.get(name);
  return bank?.length ? bank[0].duration : 0;
}

/**
 * Play one line and hand the TAKE back, so the speaker's mouth can run on it
 * (src/core/mouth.js) rather than on a guessed duration. Null when the cue has
 * no recording, which is what the fallback envelope is for.
 */
/**
 * One line, out of the mouth of the man saying it.
 *
 * THIS USED TO BE `audio.play(name, { volume: 0.9 })` AND NOTHING ELSE, which
 * is three faults in one line. A flat 0.9 with no positional mix means a man
 * across the club is exactly as loud as one leaning on your shoulder --
 * `src/core/dialogue.js` was written for that note, which the owner reported
 * as "random volume differences". It also missed the voice bus, so a line
 * never ducked the jukebox it was competing with, and never picked up the one
 * trim the rest of the game's dialogue goes through.
 *
 * `SPEECH_MIX_INDOORS` rather than the open-air mix: this is a room with walls
 * about twenty metres apart, and the clearing's 30 m falloff would carry a
 * murmur at the far booth all the way to the door.
 *
 * The `_vo.stop()` stays. It is this scene's interrupt: a new line cuts the
 * one before it dead rather than sounding over it, which is why the voice
 * overlap gate reports nothing here. It works because `stop()` fires
 * `onended`, which stamps `endedAt`, and `voiceOverlaps()` believes a real
 * end over a scheduled one.
 */
function playCue(name, speaker = null) {
  if (!name || !audio.ready) return null;
  if (!hasSpeech(audio, name)) return null;
  audio._vo?.stop?.();
  const spoken = speak(audio, name, {
    mix: SPEECH_MIX_INDOORS,
    ...(speaker ? { speaker } : {}),
    speakerId: speaker?.name ?? null,
  });
  audio._vo = spoken.source;
  return { audio, source: spoken.source, seconds: spoken.seconds };
}

/* How far off the authored framing the player may look. Wide enough to watch
 * the room react instead of only the two men in the middle of it, tight enough
 * that the shot the scene chose is still the shot you are standing in. */
const CINEMATIC_LOOK_YAW = 1.3;
const CINEMATIC_LOOK_PITCH = 0.62;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
/**
 * Somebody says it, and the screen clarifies afterwards -- never both on the
 * same frame.
 *
 * docs/TONE-AND-PARODY.md is explicit about this: a HUD instruction never
 * replaces a character, and showing the instruction while the character is
 * still setting it up reads as the game talking over its own cast. So the
 * checklist, the button and the route arrows all wait for the line to land.
 * `sayThenInstruct` in src/silvercase/main.js is the same shape.
 */
function speakThenNote(line, note, ms = 4200) {
  const seconds = chatter.interrupt(line);
  if (!note) return seconds;
  setTimeout(() => hud.say(note, ms), Math.round(Math.max(0, seconds + 0.15) * 1000));
  return seconds;
}


function setCinematicShot(name, eye, look) {
  state.cinematic.active = true;
  state.cinematic.shot = name;
  state.cinematic.eye.set(...eye);
  state.cinematic.look.set(...look);
  // Re-centre the mouse offset on every new shot. The shot picks where you
  // stand and what you are pointed at; anything you did with the mouse during
  // the last one should not carry over into a different framing.
  state.cinematic.anchorYaw = player.yaw;
  state.cinematic.anchorPitch = player.pitch;
  input.clear('cinematic-shot');
  interaction.setPaused(true);
}

function releaseCinematic({ x = null, z = null, lookAt = null } = {}) {
  state.cinematic.active = false;
  state.cinematic.shot = null;
  state.cinematic.shake = 0;
  interaction.setPaused(false);
  if (Number.isFinite(x) && Number.isFinite(z)) {
    let yaw = player.yaw;
    if (lookAt) {
      const dx = lookAt.x - x;
      const dz = lookAt.z - z;
      yaw = Math.atan2(-dx, -dz);
    }
    teleport(x, z, yaw);
  }
}

function applyCinematicCamera(dt = 0) {
  if (!state.cinematic.active) return;
  const shot = state.cinematic;
  camera.position.copy(shot.eye);
  if (shot.shake > 0) {
    const intensity = shot.shake * shakeScale();
    camera.position.x += Math.sin(state.elapsed * 77) * intensity;
    camera.position.y += Math.cos(state.elapsed * 101) * intensity * 0.55;
    camera.position.z += Math.sin(state.elapsed * 63) * intensity * 0.35;
    shot.shake = Math.max(0, intensity - dt * 0.6);
  }
  // The shot owns where the player is standing. It does not own their head.
  // A hard lookAt() took the mouse away for the length of the whole sequence,
  // which is the one thing the scene is not allowed to do -- the player has to
  // be able to look at the room while Ape is working. So the authored framing
  // becomes the neutral centre and mouse movement swings off it, clamped.
  const dx = shot.look.x - camera.position.x;
  const dy = shot.look.y - camera.position.y;
  const dz = shot.look.z - camera.position.z;
  const baseYaw = Math.atan2(-dx, -dz);
  const basePitch = Math.atan2(dy, Math.hypot(dx, dz));
  let offsetYaw = (player.yaw - shot.anchorYaw) % (Math.PI * 2);
  if (offsetYaw > Math.PI) offsetYaw -= Math.PI * 2;
  if (offsetYaw < -Math.PI) offsetYaw += Math.PI * 2;
  camera.rotation.set(
    clamp(basePitch + (player.pitch - shot.anchorPitch), -CINEMATIC_LOOK_PITCH, CINEMATIC_LOOK_PITCH),
    baseYaw + clamp(offsetYaw, -CINEMATIC_LOOK_YAW, CINEMATIC_LOOK_YAW),
    0,
    'YXZ',
  );
  camera.updateMatrixWorld(true);
}

function directBeatCamera(beat) {
  if (beat.phase === 'performance') {
    if (beat.who === 'Billy HotDog') {
      setCinematicShot('hotdog-interrupt', [-10.3, 2.15, 1.95], [-15.4, 1.35, -0.15]);
    } else {
      setCinematicShot('hogmama-stage-edge', [-7.1, 2.25, 0.2], [-12, 1.62, -3.45]);
    }
    return;
  }
  if (beat.phase === 'tension') {
    setCinematicShot('ape-hotdog-two-shot', [-10.4, 2.2, 2.2], [-15.15, 1.25, -0.15]);
    return;
  }
  if (beat.phase === 'attack') {
    setCinematicShot('ape-attack-wide', [-10.7, 2.45, 1.7], [-15.45, 0.75, -0.35]);
    return;
  }
  if (beat.phase === 'aftermath') {
    setCinematicShot('aftermath-room', [-9.8, 2.3, 2.65], [-15.35, 0.72, -0.35]);
    return;
  }
  if (beat.phase === 'handoff') {
    setCinematicShot('lou-handoff', [-7.8, 2.25, 1.3], [-14.6, 1.25, 0.4]);
  }
}

/* Everybody on the floor who can be given a line, keyed the way the campaign
 * keys people. Lou, Billy and Aubbie are built by the party rather than by the
 * Family roster, so they are folded in here rather than looked up separately. */
const partyActors = {
  ...party.byId,
  [CHARACTER_IDS.LOU]: party.extra.lou,
  [CHARACTER_IDS.BILLY_HOTDOG]: party.extra.hotdog,
  [CHARACTER_IDS.AUBBIE]: party.extra.aubbie,
  /* Sauce is built by the party rather than seated by the Family roster (he
   * is working the buffet), so he never reached this table and every line
   * anybody wrote him came out of a HUD with nobody's mouth moving. */
  [CHARACTER_IDS.SAUCE]: party.extra.sauce,
  /* The people working the room. They are jobs, not campaign characters, so
   * `HOTDOG_SPEAKERS` files them under `staff:` keys rather than inventing
   * roster ids for a bartender. Only the left-hand guard talks; the other man
   * holds the door, which is what two men on a door are for. */
  'staff.bartender': party.extra.bartender,
  'staff.dealer': party.extra.dealer,
  'staff.security_door': party.extra.securityL,
};

/**
 * Resolve a subtitle name to the body that says it.
 *
 * Exact name through the casting table, never a substring match: "Captain Lou
 * Sasole" contains "lou", so the old test resolved him to Big Uncle Lou and
 * would have put one man's lines in the other man's mouth the moment either
 * of them was given ambient dialogue. They are two people with two voices.
 */
function actorFor(name) {
  const characterId = HOTDOG_SPEAKERS[name]?.characterId;
  return characterId ? partyActors[characterId] ?? null : null;
}

function showLine(beat) {
  const who = beat.who || '';
  dialogueRoot.querySelector('.who').textContent = who;
  dialogueRoot.querySelector('.line').textContent = beat.line;
  dialogueRoot.querySelector('.options').classList.add('hidden');
  dialogueRoot.classList.remove('hidden');
  state.lineHistory.push({ who, line: beat.line, cue: beat.cue });
  const actor = actorFor(who);
  const seconds = Math.max(1.5, beat.seconds ?? 2.5);
  const ape = party.byId.ape;
  const hotdog = party.extra.hotdog;
  if (actor === ape) actor.faceToward(hotdog.position.x, hotdog.position.z, true);
  else if (actor === hotdog) actor.faceToward(ape.position.x, ape.position.z, true);
  else if (actor === party.byId.hogmama) actor.faceToward(-7.2, -0.2, true);
  else if (actor === party.byId.shubenator && beat.phase === 'performance') {
    actor.faceToward(party.byId.hogmama.position.x, party.byId.hogmama.position.z, true);
  } else if (actor === party.extra.lou) actor.faceToward(hotdog.position.x, hotdog.position.z, true);
  else actor?.faceToward(player.position.x, player.position.z);
  directBeatCamera(beat);
  /* Started AFTER the cue, because the mouth is driven by the take. */
  actor?.say(seconds, playCue(beat.cue, actor));
}

function hideLine() {
  dialogueRoot.classList.add('hidden');
}

function react(reaction) {
  const all = party.all;
  /* The staging below is heads, eyelines and one man walking to a mark. What
   * these people actually SAY is authored beside the reaction and lands in the
   * pause after the beat that provoked it -- `buildHotDogPartySequence()`
   * widens that pause by exactly the length of the answer. */
  chatter.reactToBeat(reaction);
  if (reaction === 'numbskull-early-laugh') party.byId.numbskull?.say(2.5);
  if (reaction === 'gratin-choke') {
    const gratin = party.byId.gratin;
    gratin?.say(3);
    audio.play('glass.set', { volume: 0.42, position: gratin?.position });
  }
  if (reaction === 'ape-laugh') party.byId.ape?.say(3.2);
  if (reaction === 'lou-warning-look') party.extra.lou.faceToward(party.extra.hotdog.position.x, party.extra.hotdog.position.z);
  if (reaction === 'eric-recording') party.byId.eric?.faceToward(-12, -3.45);
  if (reaction === 'shubenator-aftermath') {
    // He has already walked here under his own steam; the beat is gated on it.
    // The snap remains only for a restored save, which drops the player into
    // the aftermath with nobody having walked anywhere.
    const shubenator = party.byId.shubenator;
    if (shubenator) {
      cancelWalk(shubenator);
      shubenator.route = null;
      shubenator.job = 'stand';
      shubenator.group.position.set(-13.6, 0, 1.05);
      state.shubesArrived = true;
      shubenator.faceToward(party.extra.hotdog.position.x, party.extra.hotdog.position.z, true);
    }
  }
  if (reaction === 'room-laugh') {
    for (let i = 0; i < all.length; i += 2) all[i].say(1.8 + (i % 3) * 0.3);
  }
}

/* Authored one-shot walks.
 *
 * Npc patrols loop by design, because that is what an ambient crowd wants. A
 * scripted walk is the opposite: it has an end. Each entry here is taken back
 * at its final mark before the patrol loop can turn the actor around and send
 * them through the furniture again. `deadline` exists because a blocked walk
 * must never become a stuck scene -- if an actor cannot reach their mark the
 * scene puts them on it and carries on.
 */
const authoredWalks = new Map();

function walkOnce(npc, route, speed, { onArrive = null, timeout = 0 } = {}) {
  if (!npc) return;
  npc.job = 'patrol';
  npc.speed = speed;
  // The old Ape first leg cut straight through the two-top at (-13.4, 1.05).
  // These authored marks leave through the clear aisle and intentionally stop
  // before the next line calls him back; no patrol loop gets to fight a table.
  npc.route = route.map(({ x, z }) => ({ x, z }));
  npc.routeAt = 0;
  authoredWalks.set(npc, {
    stop: npc.route.at(-1),
    onArrive,
    deadline: timeout > 0 ? state.elapsed + timeout : Infinity,
  });
}

/**
 * Take an actor off an authored walk.
 *
 * Forgetting the bookkeeping entry is only half of it. `walkOnce` also put the
 * actor on `job: 'patrol'` with a `route`, and `Npc.update` reads those every
 * frame -- so a cancel that only dropped the map entry left the man walking
 * his authored line with nothing left to take him off it at the end, which is
 * the one thing `arriveAt` exists to prevent. Clear the same two fields
 * `arriveAt` clears; both call sites re-pose the actor immediately afterwards
 * (`poseHotDogAttackGeometry` / `poseHotDogResolvedAttackGeometry`, and the
 * restored-save branch in the chatter reactions), so 'stand' is only ever a
 * resting state between the cancel and the scene's own staging.
 */
function cancelWalk(npc) {
  if (!npc) return;
  npc.route = null;
  npc.job = 'stand';
  authoredWalks.delete(npc);
}

function arriveAt(npc, walk) {
  npc.route = null;
  npc.job = 'stand';
  npc.group.position.set(walk.stop.x, npc.baseY ?? 0, walk.stop.z);
  authoredWalks.delete(npc);
  walk.onArrive?.(npc);
}

function settleAuthoredWalks() {
  for (const [npc, walk] of authoredWalks) {
    const dx = npc.position.x - walk.stop.x;
    const dz = npc.position.z - walk.stop.z;
    if (dx * dx + dz * dz <= 0.18 || state.elapsed >= walk.deadline) arriveAt(npc, walk);
  }
}

function moveApeOut() {
  walkOnce(party.byId.ape, APE_EXIT_ROUTE, 2.8);
}

function returnApe() {
  walkOnce(party.byId.ape, APE_RETURN_ROUTE, 3.2);
}

/* Shubenator's whole bit is arriving after the fact and asking what happened,
 * so he has to be seen crossing the room to do it. He leaves the decks the
 * moment he has killed the music and the aftermath beat waits on his mark --
 * the room standing over a body in silence while he walks over is the joke. */
const SHUBENATOR_AFTERMATH_ROUTE = Object.freeze([
  Object.freeze({ x: -5.2, z: -6.9 }),
  Object.freeze({ x: -4.8, z: 2.2 }),
  Object.freeze({ x: -9.0, z: 2.5 }),
  Object.freeze({ x: -12.4, z: 2.0 }),
  Object.freeze({ x: -13.6, z: 1.05 }),
]);

function walkShubenatorIn() {
  const shubenator = party.byId.shubenator;
  if (!shubenator || state.shubesArrived) return;
  walkOnce(shubenator, SHUBENATOR_AFTERMATH_ROUTE, 3.15, {
    timeout: 9,
    onArrive: (npc) => {
      state.shubesArrived = true;
      npc.faceToward(party.extra.hotdog.position.x, party.extra.hotdog.position.z, true);
    },
  });
}

/* The floor circles are a cleanup aid, not a light show during the beating.
 * They used to appear on Ape's last punch, which put two glowing rings in the
 * middle of the shot while the room was still watching a man go down. */
function revealEvidenceCircles() {
  showHotDogCleanupGuidesGeometry(party);
}

function applyResolvedAttackPresentation() {
  state.fallen = true;
  cancelWalk(party.byId.ape);
  poseHotDogResolvedAttackGeometry(party);
  /* The pool keeps spreading under him while the room decides what to do —
   * on the shared bounded pool system, on the sim clock, beside the authored
   * cleanup decal rather than replacing it. Anchored to wherever the shared
   * pose helper left the body, so the two never drift apart. */
  const hotdog = party.extra.hotdog;
  _spillAt.set(hotdog.group.position.x + 0.2, 0, hotdog.group.position.z - 0.1);
  gore.splats.spill(_spillAt, {
    floorY: 0, size: 0.9, opacity: 0.88, delay: 0.35, seed: 41,
  });
}

function resolveAttack() {
  if (!mission.resolveAttack()) return false;
  applyResolvedAttackPresentation();
  story.recordAttack({ attackResolved: true });
  state.director.waitingForAttack = false;
  state.director.running = true;
  // One short breath after the final hit makes the switch to Shubenator's
  // awkward music cue feel like a deliberate aftermath, not a skipped frame.
  state.director.gapRemaining = 0.42;
  repaintObjectives();
  return true;
}

/* ---- the gore layer (2026-08-19 owner note) ----
 *
 * "Gorey, I want extra extra gore. Blood splatting into the air."  Three
 * shared systems from src/world/blood.js, the same module the mansion and the
 * store room already use, mounted once and updated on the sim clock:
 *   impacts  attached wounds + secondary spatter on both bodies
 *   spurts   arterial droplets thrown INTO THE AIR off each strike
 *   splats   small bounded floor decals where those droplets come down,
 *            plus the spreading pool once he is on the boards
 * All working vectors are preallocated — nothing here allocates per frame. */
const gore = {
  impacts: new BloodImpactSystem(scene),
  spurts: new BloodSpurtSystem(scene, { capacity: 56 }),
  splats: new DeathBloodPool(scene, { capacity: 8, growthSeconds: 0.55 }),
};
const _stabPoint = new THREE.Vector3();
const _stabDir = new THREE.Vector3();
const _spillAt = new THREE.Vector3();
/* How many airborne droplets may still become a floor decal. Topped up per
 * strike, spent by landings, so one burst cannot drain the bounded pool. */
let splatBudget = 0;
const splatWhereItLands = (x, z) => {
  if (splatBudget <= 0) return;
  splatBudget -= 1;
  _spillAt.set(x, 0, z);
  gore.splats.spill(_spillAt, {
    floorY: 0,
    size: 0.2 + Math.random() * 0.18,
    opacity: 0.78,
  });
};
/* The evidence the mop is FOR. The final sweep is the beat where the floor
 * stops testifying, so the sweep clears the strike decals with it. Wounds on
 * the two men deliberately stay — nobody has changed clothes. */
function clearStrikeSplats() {
  gore.splats.reset();
}

function goreStrike(hit) {
  const hotdog = party.extra.hotdog;
  const ape = party.byId.ape;
  hotdog.group.updateWorldMatrix(true, true);
  /* The wound: chest height on the rig, alternating sides per strike, at the
   * exact point the shared system pins to the body so it follows his fall. */
  _stabPoint.set(hit % 2 ? 0.09 : -0.07, 1.26 - (hit % 3) * 0.08, 0.16);
  hotdog.parts.body.localToWorld(_stabPoint);
  _stabDir.set(
    hotdog.position.x - ape.position.x,
    0.3,
    hotdog.position.z - ape.position.z,
  ).normalize();
  gore.impacts.hit({
    actor: hotdog,
    anchor: hotdog.parts.body,
    point: _stabPoint,
    normal: _stabDir,
  });
  /* Arterial spurt: droplets arc INTO THE AIR off the wound, away from the
   * blade, and each landing may stamp a splatter decal on the boards. */
  splatBudget = Math.min(splatBudget + 2, 4);
  gore.spurts.burst(_stabPoint, _stabDir, {
    count: 8 + hit * 3,
    speed: 2.1 + hit * 0.4,
    upward: 2.5 + hit * 0.25,
    floorY: 0,
    onLand: splatWhereItLands,
  });
  /* Blood on Ape. He is standing in it from the second strike on: a mark on
   * his own rig, no secondary spatter — it is HotDog's blood, not his. */
  if (hit >= 2) {
    ape.group.updateWorldMatrix(true, true);
    _stabPoint.set(hit % 2 ? 0.07 : -0.05, 1.12 + (hit % 2) * 0.1, 0.17);
    ape.parts.body.localToWorld(_stabPoint);
    _stabDir.set(
      ape.position.x - hotdog.position.x,
      0.1,
      ape.position.z - hotdog.position.z,
    ).normalize();
    gore.impacts.hit({
      actor: ape,
      anchor: ape.parts.body,
      point: _stabPoint,
      normal: _stabDir,
      spatter: false,
    });
  }
}

/* One strike's sound: the recorded body thud carries the weight tonight, and
 * the authored stab layer sits on top the moment each recording lands —
 * gated on `hasSample`, the same contract License to Grill's PENDING cues
 * keep, so an undelivered cue is silence rather than a synth noise. */
function strikeAudio(hit, final, at) {
  audio.play(`hotdog.fist.impact.${hit}`, {
    volume: final ? 0.96 : 0.82,
    position: at,
  });
  if (audio.hasSample?.(`hotdog.stab.flesh.${hit}`)) {
    audio.play(`hotdog.stab.flesh.${hit}`, { volume: final ? 0.9 : 0.78, position: at });
  }
  /* The jacket goes on the first strike; after that the blade is through it. */
  if (hit === 1 && audio.hasSample?.('hotdog.stab.cloth.tear')) {
    audio.play('hotdog.stab.cloth.tear', { volume: 0.55, position: at, delay: 0.04 });
  }
  /* His grunts going quiet: loud on one, a wheeze by four. The recordings are
   * performed quieter AND mixed quieter, so the fade survives either. */
  if (audio.hasSample?.(`hotdog.stab.grunt.${hit}`)) {
    audio.play(`hotdog.stab.grunt.${hit}`, {
      volume: [0.9, 0.72, 0.5, 0.34][hit - 1] ?? 0.34,
      position: at,
      delay: 0.09,
    });
  }
}

const attack = createHotDogAttack({
  ape: party.byId.ape,
  hotdog: party.extra.hotdog,
  knife: party.apeKnife,
  onImpact: ({ hit, final }) => {
    const hotdog = party.extra.hotdog;
    state.cinematic.shake = final ? 0.15 : 0.10;
    strikeAudio(hit, final, hotdog.position);
    goreStrike(hit);
    if (final) {
      audio.play('hotdog.body.floor', { volume: 0.94, position: hotdog.position });
      audio.play('glass.wine.fall', { volume: 0.72, position: hotdog.position });
      resolveAttack();
    }
  },
});

function stageAttack() {
  if (state.fallen || attack.active || !mission.startAttack()) return false;
  const hotdog = party.extra.hotdog;
  const ape = party.byId.ape;
  cancelWalk(ape);
  poseHotDogAttackGeometry(party);
  audio.play('hotdog.knife.draw', { volume: 0.68, position: ape.position });
  chatter.startAttackReactions();
  state.director.waitingForAttack = true;
  return attack.start();
}

function assignCleanupRoles() {
  if (state.cleanupActive) return;
  state.cleanupActive = true;
  poseHotDogCleanupRolesGeometry(party);
  /* Lou turns panic into departments, and he does it out loud. Queued rather
   * than spoken now: the aftermath beats are still running, and the chatter
   * only takes the room once the director has finished with it. */
  chatter.queue([HOTDOG_STAGED_LINES.louCleanupBriefing]);
}

function applyBeatAction(action) {
  if (action === 'performance-finish') {
    mission.finishPerformance();
    party.stage.setSpotlight(false);
  }
  if (action === 'ape-leaves') moveApeOut();
  if (action === 'ape-returns') returnApe();
  if (action === 'begin-beating' && stageAttack()) {
    state.director.running = false;
  }
  if (action === 'music-cut') {
    audio.setLoopVolume('party.record', 0, 0.25);
    walkShubenatorIn();
  }
  if (action === 'cleanup-start') assignCleanupRoles();
  if (action === 'release-cutscene') {
    releaseCinematic({ x: -9.4, z: 2.4, lookAt: { x: -15.5, z: -0.4 } });
    revealEvidenceCircles();
  }
}

function beginSequence() {
  if (!mission.startPerformance()) return false;
  state.director.running = true;
  state.director.index = 0;
  state.director.remaining = 0;
  state.director.gapRemaining = 0;
  audio.setLoopVolume('party.record', 0.12, 0.8);
  party.stage.setSpotlight(true);
  setCinematicShot('show-opening', [-7.1, 2.25, 0.2], [-12, 1.62, -3.45]);
  return true;
}

function updateDirector(dt) {
  const d = state.director;
  if (!d.running) return;
  if (d.gapRemaining > 0) {
    d.gapRemaining -= dt;
    if (d.gapRemaining > 0) return;
  }
  if (d.remaining > 0) {
    d.remaining -= dt;
    if (d.remaining > 0) return;
    const completed = d.current;
    applyBeatAction(completed?.action);
    d.current = null;
    hideLine();
    if (!d.running) return;
    d.gapRemaining = completed?.gapAfter ?? 0.18;
    if (d.gapRemaining > 0) return;
  }
  const next = sequence[d.index];
  if (!next) {
    d.running = false;
    releaseCinematic();
    beginDeparture();
    return;
  }
  if (next.phase === 'handoff' && !d.handoffReady) return;
  // He is crossing the room to deliver it. Holding the beat is the point --
  // the walk is the joke, and a line from an empty mark is not.
  if (next.reaction === 'shubenator-aftermath' && !state.shubesArrived) return;
  d.index++;
  d.current = next;
  showLine(next);
  react(next.reaction);
  d.remaining = Math.max(next.seconds ?? 2.5, cueSeconds(next.cue) + 0.3);
}

function completeCleanupTask(task) {
  if (!mission.completeCleanup(task)) return false;
  story.recordCleanup(task);
  repaintObjectives();
  return true;
}

function registerDoor(key, lockedLine = 'Locked for the party.') {
  const door = club.doors[key];
  if (!door) return;
  interaction.register(door.leaf, {
    label: () => door.locked ? `<b>${door.label}</b> · locked` : `${door.open ? 'Close' : 'Open'} <b>${door.label}</b>`,
    enabled: () => state.phase === 'active' && !state.director.current,
    onUse: () => {
      if (door.locked) {
        audio.play('door.locked', { volume: 0.55, position: door.pivot.position });
        hud.say(lockedLine, 2600);
        return;
      }
      const opening = !door.open;
      door.toggle();
      audio.play(opening ? 'door.creak' : 'door.knob', { volume: 0.5, position: door.pivot.position });
    },
  });
}
for (const key of ['front', 'inner', 'mens', 'storage', 'service']) registerDoor(key);
registerDoor('ladies', 'Bolted since the remodel. There is nothing behind it but the lot.');

interaction.register(party.stage.controls, {
  label: 'Press <b>Hog Mama\'s spotlight and microphone controls</b>',
  enabled: () => state.phase === 'active' && mission.state === 'party' && !state.director.running,
  onUse: () => {
    if (!beginSequence()) return;
    hud.toast('HOG MAMA · 30 SECOND SET', 'good');
    audio.play('switch.click', { volume: 0.72, position: party.stage.controls.position });
  },
});

/* ------------------------------------------------------------------ *
 * THE PARTY, before any of this is a crime scene.
 *
 * Owner, 2026-08-19: the opening objective is ENJOY THE PARTY, and the player
 * gets to be in the room before Billy's night starts. Nothing below is a new
 * system -- it is Booski's shot (the same one the ordinary night runs, out of
 * src/bing/booski-shot.js), Sauce's buffet, the felt, and the Family's own
 * walk-up conversations. The set becomes an objective once the Prospect has
 * actually had three of them, or after ninety seconds, whichever he reaches
 * first; nobody is locked out of their own scene by an optional drink.
 * ------------------------------------------------------------------ */
function partyBeat(id) {
  if (mission.enjoyedParty(id)) repaintObjectives();
}

/* Booski's already-recorded shot bank, reused verbatim rather than rewritten:
 * these are the exact takes `src/bing/family.js` gives him on the ordinary
 * night (`vo.bing.booski.shot.*`), so the party costs the booth nothing. */
const BOOSKI_SHOT_TAKES = Object.freeze({
  bartender: Object.freeze({
    text: 'House rye. If he asks, it was twenty-nine seconds.',
    cue: 'vo.bing.bartender.booski-shot.pour',
  }),
  handoff: Object.freeze({
    who: 'Booskibro',
    line: 'Twenty-eight. He\'s growin\' on me. Drink, baby.',
    cue: 'vo.bing.booski.shot.handoff',
    seconds: 2.8,
  }),
  after: Object.freeze({
    who: 'Booskibro',
    line: 'There he is. Now you look like you belong in here.',
    cue: 'vo.bing.booski.shot.after',
    seconds: 3.5,
  }),
});

const shotProps = buildBooskiShotProps({
  scene,
  camera,
  bartender: party.extra.bartender,
  barService: club.anchors.barService,
});

const shotBeat = createBooskiShotBeat({
  props: shotProps,
  audio,
  player,
  interaction,
  hud,
  bartender: party.extra.bartender,
  booski: party.byId.booski ?? null,
  barService: club.anchors.barService,
  cueSeconds,
  voiceCue: (name) => playCue(name),
  bartenderLine: BOOSKI_SHOT_TAKES.bartender,
  /* This page has no inventory and no drunk meter, so the glass is a flag and
   * throwing it back is a party beat rather than a stat. */
  hasGlass: () => state.holdingShot,
  onDeliver: () => {
    state.holdingShot = true;
    hud.toast('Booski is watching. [E] Throw it back.', 'good');
  },
  onDrained: () => {
    state.holdingShot = false;
    mission.drank();
    partyBeat('shot');
  },
  onHandoff: () => chatter.interrupt(BOOSKI_SHOT_TAKES.handoff),
  onAfter: () => chatter.interrupt(BOOSKI_SHOT_TAKES.after),
  isDialogueBusy: () => !!state.director.current || !!chatter.speaking,
});

/** Whether Booskibro is currently the man with the shot rather than a chat. */
function booskiOffersShot(npc) {
  return npc === party.byId.booski
    && !shotBeat.done
    && !!party.extra.bartender
    && mission.state === 'party';
}

function startBooskiShot() {
  const seconds = chatter.interrupt(HOTDOG_STAGED_LINES.booskiShotOffer);
  /* He asks, and then the bartender moves. Same contract the ordinary night
   * keeps for his thirty-seconds yell: the pour may not begin until Booski
   * has actually finished speaking. Re-checked on arrival, because three
   * seconds is long enough for the player to have started Hog Mama's set --
   * a bar cutaway landing on top of the authored spine is the one thing this
   * page is careful never to allow. */
  setTimeout(() => {
    if (state.phase !== 'active' || state.paused) return;
    if (mission.state !== 'party' || state.director.running) return;
    shotBeat.start();
  }, Math.round(Math.max(0, seconds + 0.2) * 1000));
}

interaction.register(party.food.group, {
  label: 'Take a plate from <b>Sauce</b>',
  enabled: () => state.phase === 'active'
    && mission.state === 'party'
    && !state.director.current
    && !state.plateTaken,
  onUse: () => {
    state.plateTaken = true;
    party.extra.sauce?.faceToward(player.position.x, player.position.z, true);
    speakThenNote(
      HOTDOG_STAGED_LINES.sauceBuffetPlate,
      'Beef, peppers, and corn nobody in this building paid for.',
      3600,
    );
    partyBeat('plate');
  },
});

interaction.register(party.cleanup.bathroomPads.mens, {
  label: 'Check the <b>men\'s room</b>',
  enabled: () => state.phase === 'active' && mission.state === 'cleanup' && !state.bathroom.has('mens'),
  onUse: () => {
    const pad = party.cleanup.bathroomPads.mens;
    state.bathroom.add('mens');
    audio.play('cloth.suit.movement', { volume: 0.4, position: pad.position });
    hud.say('Two wet towels, one broken dispenser, Eric\'s camera battery behind the cistern. Nobody hiding.', 4200);
    pad.visible = false;
    completeCleanupTask('bathrooms');
  },
});

interaction.register(party.cleanup.kit, {
  label: 'Take <b>Aubbie\'s correct cleanup kit</b>',
  enabled: () => state.phase === 'active' && mission.state === 'cleanup' && !state.kitTaken,
  onUse: () => {
    state.kitTaken = true;
    party.cleanup.kit.visible = false;
    completeCleanupTask('cleaning_kit');
    audio.play('cloth.snap', { volume: 0.55, position: party.cleanup.kit.position });
    /* Aubbie calls across the room about his own case; the line under it is
     * the Prospect looking in the case, which is his to notice and stays HUD. */
    speakThenNote(
      HOTDOG_STAGED_LINES.aubbieKitCalled,
      'Plastic sheeting, nitrile gloves, carpet knife, proper chemicals. Aubbie labels everything.',
      4300,
    );
  },
});

for (const [id, prop] of [['cufflink', party.cleanup.cufflink], ['lapel', party.cleanup.lapel]]) {
  interaction.register(prop, {
    label: () => `Pick up HotDog\'s <b>${id === 'cufflink' ? 'missing cufflink' : 'lapel pin'}</b>`,
    enabled: () => state.phase === 'active' && mission.state === 'cleanup' && !state.evidence.has(id),
    onUse: () => {
      state.evidence.add(id);
      prop.visible = false;
      party.cleanup.evidenceMarkers[id].visible = false;
      audio.play('glass.set', { volume: 0.34, rate: 1.28, position: prop.position });
      /* Booski has been counting these out loud since the body hit the floor,
       * so he is the one who reacts. What the thing is and where it was found
       * is the Prospect's own read of the carpet and stays on the HUD. */
      speakThenNote(
        state.evidence.size === 2
          ? HOTDOG_STAGED_LINES.booskiEvidenceBoth
          : HOTDOG_STAGED_LINES.booskiEvidenceFirst,
        id === 'cufflink'
          ? 'One cufflink. Booski can stop saying “one cufflink.”'
          : 'The lapel pin was under the stage lip. HotDog travelled farther than expected.',
        3600,
      );
      if (state.evidence.size === 2) completeCleanupTask('missing_evidence');
    },
  });
}

/**
 * Lou, at every stage of his own evening.
 *
 * The order is the owner's (2026-08-19) and it is the whole reason the
 * mission grew a `debrief` state: the floor first, then the body leaves the
 * building, and ONLY THEN does the man ask for the room to be swept. Lou is
 * the gate on that last step and nothing else can open it.
 */
interaction.register(party.extra.lou.group, {
  label: () => {
    if (!state.cleanupActive) return 'Talk to <b>Lou</b>';
    if (mission.state === 'debrief') return 'Report to <b>Big Uncle Lou</b>';
    return 'Talk to <b>Lou</b>';
  },
  enabled: () => state.phase === 'active' && !state.director.current,
  onUse: () => {
    if (!state.cleanupActive) {
      chatter.interrupt(HOTDOG_STAGED_LINES.louPartyGreeting);
      partyBeat('talk');
      return;
    }
    if (mission.state === 'cleanup' && !mission.roomClean) {
      const missing = [];
      if (!mission.cleanup.has('bathrooms')) missing.push('the men\'s room');
      if (!mission.cleanup.has('cleaning_kit')) missing.push('Aubbie\'s kit');
      if (!mission.cleanup.has('missing_evidence')) missing.push('HotDog\'s jewelry');
      /* He refuses in his own voice. The list of what is still owed is a
       * checklist, so it follows him rather than standing in for him -- and it
       * is the part that cannot be a recording, because it depends on what
       * this particular player has left undone. */
      speakThenNote(HOTDOG_STAGED_LINES.louSweepIncomplete, `Still owed: ${missing.join(', ')}.`, 4200);
      return;
    }
    if (mission.state === 'cleanup' || mission.state === 'body-ready') {
      /* The line the owner caught: the HUD used to narrate Lou checking the
       * room and then quote him, with Lou stood in front of the player saying
       * nothing. He says it. */
      chatter.interrupt(HOTDOG_STAGED_LINES.louWrapHim);
      return;
    }
    if (mission.state === 'debrief') {
      if (!mission.debriefLou()) return;
      state.debriefed = true;
      repaintObjectives();
      /* THE SWEEP IS BORN HERE. Not on the frame Billy hit the boards. */
      speakThenNote(
        HOTDOG_STAGED_LINES.louSweepOrder,
        'The boards where he fell, and everything the pool reached.',
        4200,
      );
      return;
    }
    chatter.interrupt(HOTDOG_STAGED_LINES.louRoomClosed);
  },
});

/**
 * Lou's final evidence sweep, as an actual act rather than a conversation.
 *
 * It used to be a second press on Lou himself, which meant "sweep the room"
 * was two men talking. He orders it; the Prospect does it, on his knees, on
 * the boards Billy bled into, with the kit he already went and fetched.
 */
interaction.register(party.cleanup.blood, {
  label: 'Hold to <b>sweep the floor</b> with Aubbie\'s kit',
  hold: 2.2,
  enabled: () => state.phase === 'active'
    && mission.state === 'sweep'
    && !state.finalSwept,
  onTap: () => hud.say('Hold it. Chemicals, then the light, then again.', 2600),
  onUse: () => {
    if (!completeCleanupTask('final_sweep')) return;
    state.finalSwept = true;
    restoreHotDogCleanupPresentation(party, mission.cleanup);
    clearStrikeSplats();
    audio.play('cloth.suit.movement', { volume: 0.6, position: party.cleanup.blood.position });
    bankTheClub();
    beginEndingCutscene();
  },
});

interaction.register(party.extra.hotdog.group, {
  label: 'Hold to <b>wrap Billy HotDog</b> with Rippin and Aubbie',
  hold: 1.8,
  enabled: () => state.phase === 'active'
    && state.fallen
    && mission.roomClean
    && !state.wrapped,
  onTap: () => speakThenNote(HOTDOG_STAGED_LINES.rippinWrapPrompt, 'Hold to take the legs.', 2800),
  onUse: () => {
    if (!mission.wrapBody()) return;
    state.wrapped = true;
    party.extra.hotdog.group.visible = false;
    party.cleanup.wrap.visible = true;
    party.cleanup.serviceGuide.visible = true;
    audio.play('cloth.snap', { volume: 0.82, position: party.cleanup.wrap.position });
    repaintObjectives();
    speakThenNote(
      HOTDOG_STAGED_LINES.aubbieWrapDone,
      // Not "follow the amber arrows": those ran through the main room's south
      // wall and are gone. The route is named by the rooms it passes through.
      'Out through the hall, into the store room. Snow is holding the service door.',
      5000,
    );
  },
});

/* ------------------------------------------------------------------ *
 * CARRYING BILLY
 *
 * Owner, 2026-08-19: the player picks the wrapped body up and carries it,
 * reusing the graveyard's body-carry. That carry is a private closure inside
 * `buildGraveyard()` in src/graveyard/world.js -- its anchor, its bob, its
 * grave and its trunk are all baked into the same function -- and that file
 * is outside this pass's ownership, so it could not be imported. What IS
 * reused is its contract, to the number: the same carry anchor offset, the
 * same quarter-turn, the same 5.2 rad/s bob at 12 mm, the same
 * `cloth.suit.movement` on the lift, the same "Billy HotDog · carrying"
 * toast, and the same refusal to jump or hurry with a man in both arms. If
 * that closure is later lifted into a parameterised factory, this is the
 * call site that should take it.
 * ------------------------------------------------------------------ */
const CARRY_POSITION = new THREE.Vector3(0, -0.92, -1.72);
const CARRY_QUATERNION = new THREE.Quaternion()
  .setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
const wrapHome = {
  parent: party.cleanup.wrap.parent,
  position: party.cleanup.wrap.position.clone(),
  quaternion: party.cleanup.wrap.quaternion.clone(),
};
/* The wrapped body carries a live party collider. Carried, it rides the
 * camera -- so the box would ride the player and shove him through the club.
 * Take it out of the collision list for exactly as long as he is holding it,
 * the same way a Door takes its own box out while the leaf is open. */
const wrapCollider = party.collision.byId['prop.wrapped-body']?.box ?? null;

function setWrapColliding(colliding) {
  if (!wrapCollider) return;
  const index = club.colliders.indexOf(wrapCollider);
  if (colliding && index < 0) club.colliders.push(wrapCollider);
  if (!colliding && index >= 0) club.colliders.splice(index, 1);
}

function updateCarry() {
  if (!state.carrying) return;
  party.cleanup.wrap.position.y = CARRY_POSITION.y + Math.sin(state.elapsed * 5.2) * 0.012;
}

interaction.register(party.cleanup.wrap, {
  label: 'Hold to <b>pick Billy up</b>',
  hold: 1.6,
  enabled: () => state.phase === 'active' && state.wrapped && !state.carrying && !state.loaded,
  onTap: () => speakThenNote(HOTDOG_STAGED_LINES.snowCarryPrompt, 'Hold to take his weight.', 3200),
  onUse: () => {
    if (!mission.carryBody()) return;
    state.carrying = true;
    setWrapColliding(false);
    /* Off the ray list as well as out of the collision list. A body parented
     * to the camera sits 1.72 m dead ahead of the crosshair, and the
     * interaction raycast takes the NEAREST hit -- leaving it registered
     * would put Billy between the player and every prompt in the building,
     * including the loading pad he is carrying Billy to. */
    interaction.unregister(party.cleanup.wrap);
    camera.attach(party.cleanup.wrap);
    party.cleanup.wrap.position.copy(CARRY_POSITION);
    party.cleanup.wrap.quaternion.copy(CARRY_QUATERNION);
    input.clear('body-carry');
    audio.play('cloth.suit.movement', { volume: 0.75, position: player.position });
    repaintObjectives();
    hud.toast('Billy HotDog · carrying', 'good');
  },
});

interaction.register(party.cleanup.loadPad, {
  label: 'Hold to <b>load Billy into Snow\'s car</b>',
  hold: 1.7,
  enabled: () => state.phase === 'active' && state.carrying && !state.loaded,
  onTap: () => speakThenNote(HOTDOG_STAGED_LINES.snowLoadPrompt, 'Hold to lift with Numbskull.', 3000),
  onUse: () => {
    if (!mission.assign('reserve_pickup')) return;
    state.loaded = true;
    state.carrying = false;
    releaseWrappedBody();
    audio.play('car.door.close.heavy', { volume: 0.75, position: party.cleanup.loadPad.position });
    repaintObjectives();
    /* He is in the trunk. The next thing that happens is a conversation with
     * Lou, not an evidence sweep -- the sweep does not exist yet. This one is
     * genuinely the Prospect's own read of the alley and stays on the HUD;
     * Snow has already said his piece on the hold prompt. */
    hud.say('Billy is in the trunk. Lou is still standing in his own club.', 4200);
  },
});

/** Put the sheet back in the world and stop drawing it. */
function releaseWrappedBody() {
  wrapHome.parent?.attach(party.cleanup.wrap);
  party.cleanup.wrap.position.copy(wrapHome.position);
  party.cleanup.wrap.quaternion.copy(wrapHome.quaternion);
  party.cleanup.wrap.visible = false;
  party.cleanup.serviceGuide.visible = false;
  setWrapColliding(true);
}

/** The campaign checkpoint, banked once the club is genuinely finished. */
function bankTheClub() {
  const banked = story.completeClub({
    assignment: mission.assignment,
    bodyWrapped: mission.flags.bodyWrapped,
    bodyLoaded: mission.flags.bodyLoaded,
  });
  if (banked) return true;
  console.error('[bing-two] cleanup could not be banked', campaign.state.missions[MISSION_IDS.BADA_BING_TWO]);
  hud.toast('Campaign save failed', 'bad', 5200);
  return false;
}

/**
 * The ending, INSIDE, before anybody walks out.
 *
 * Owner, 2026-08-19: the player used to leave and then watch a cutscene of
 * something happening back in a room he had already left, which breaks the
 * continuity of his own exit. So the handoff beats -- Lou giving Snow the
 * body and the Prospect the Motel, and Snow refusing to say what is at room
 * twelve -- play in the club, with everybody still in it, and the objective
 * to leave only exists once they are over.
 */
function beginEndingCutscene() {
  state.director.handoffReady = true;
  state.director.running = true;
  repaintObjectives();
}
window.__squatchStage?.('Checking the service exit...');

/* Which line each person is up to. A second walk-up should be a second
 * thought, not the same sentence again, and the count is per phase because
 * the party and the cleanup are two different conversations. */
const walkUpTurns = new Map();

/* Which walk-up is also a piece of the party the Prospect has actually had.
 * Sitting down at the felt with the man dealing it is cards; everybody else
 * on the floor is a conversation. */
const PARTY_BEAT_FOR = new Map([[party.extra.dealer, 'cards']]);

// Family walk-ups remain short ambient context. They never replace an
// objective and they shut off while the authored sequence owns the room.
for (const npc of party.all) {
  /* Lou and Billy have their own scripted interactions, and the second man on
   * the door does not talk to guests -- one of the two answers, which is what
   * two men on a door are for. */
  if ([party.extra.lou, party.extra.hotdog, party.extra.securityR].includes(npc)) continue;
  interaction.register(npc.group, {
    label: () => (booskiOffersShot(npc)
      ? `Have a drink with <b>${npc.name}</b>`
      : `Check in with <b>${npc.name}</b>`),
    enabled: () => state.phase === 'active' && !state.director.current && !state.director.waitingForAttack,
    onUse: () => {
      /* Owner, 2026-08-19: give the player another chance to drink with
       * Booski. He offers; the club's existing shot system does the rest. */
      if (booskiOffersShot(npc)) {
        startBooskiShot();
        return;
      }
      const phase = state.cleanupActive ? 'cleanup' : 'party';
      const lines = HOTDOG_WALKUP_LINES[phase][npc.name];
      if (lines?.length) {
        const key = `${phase}:${npc.name}`;
        const turn = walkUpTurns.get(key) ?? 0;
        walkUpTurns.set(key, turn + 1);
        chatter.interrupt(lines[turn % lines.length]);
        partyBeat(PARTY_BEAT_FOR.get(npc) ?? 'talk');
        return;
      }
      /* Nobody has written this one anything, so nobody speaks. What is left
       * is the Prospect reading a man who is busy, which is his own
       * observation and belongs on the HUD rather than in somebody's mouth. */
      npc.faceToward(player.position.x, player.position.z);
      npc.say(2.4);
      hud.say(state.cleanupActive
        ? `${npc.name} has a job and no interest in swapping.`
        : `${npc.name} watches HotDog like a glass set too close to an edge.`, 3800);
      partyBeat(PARTY_BEAT_FOR.get(npc) ?? 'talk');
    },
  });
}

function restoreFromCampaign() {
  const saved = campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
  if (!saved.attackResolved) return;
  mission.enteredClub();
  mission.startPerformance();
  mission.finishPerformance();
  mission.startAttack();
  resolveAttack();
  state.director.index = sequence.findIndex((beat) => beat.action === 'cleanup-start') + 1;
  state.director.waitingForAttack = false;
  // A restored save opens after the aftermath, so nobody walks anywhere. The
  // gate on Shubenator's beat must not be left armed against a beat that has
  // already passed.
  state.shubesArrived = true;
  assignCleanupRoles();
  /* Replay the mission's own progression in the order the club now works in:
   * the three floor tasks, the body, the report to Lou, and only then the
   * sweep. Walking `saved.cleanupTasks` blindly would offer the sweep to a
   * mission that has not been given it yet, and it would be refused. */
  for (const task of mission.roomTasks) {
    if (saved.cleanupTasks.includes(task)) mission.completeCleanup(task);
  }
  state.bathroom = new Set(saved.cleanupTasks.includes('bathrooms') ? ['mens'] : []);
  state.kitTaken = saved.cleanupTasks.includes('cleaning_kit');
  state.evidence = new Set(saved.cleanupTasks.includes('missing_evidence') ? ['cufflink', 'lapel'] : []);
  restoreHotDogCleanupPresentation(party, saved.cleanupTasks);
  if (saved.bodyWrapped) {
    mission.wrapBody();
    state.wrapped = true;
    party.extra.hotdog.group.visible = false;
    party.cleanup.wrap.visible = true;
    party.cleanup.serviceGuide.visible = true;
  }
  if (saved.bodyLoaded && mission.carryBody() && mission.assign(saved.assignment || 'reserve_pickup')) {
    state.loaded = true;
    releaseWrappedBody();
  }
  if (saved.cleanupTasks.includes('final_sweep') && mission.debriefLou()) {
    state.debriefed = true;
    mission.completeCleanup('final_sweep');
    state.finalSwept = true;
    restoreHotDogCleanupPresentation(party, mission.cleanup);
    clearStrikeSplats();
    /* A save this far along has already banked `body_loaded` and the Start
     * handler sends it straight to the graveyard -- but if it ever lands here
     * it must not land in a club with no remaining objective. */
    beginEndingCutscene();
  }
  repaintObjectives();
}

/**
 * Preview-only checkpoint jump.
 *
 * Walks the mission's own real progression functions in order --
 * `mission.enteredClub()`/`startPerformance()`/`finishPerformance()`,
 * `stageAttack()`, `resolveAttack()`, `completeCleanupTask()`,
 * `mission.wrapBody()`/`assign()`, `story.completeClub()` -- exactly the
 * functions the party director and the cleanup interactions already call
 * during a played run. `attack` lands inside the live, player-driven knife
 * fight (`stageAttack()`'s own controller), genuinely testable rather than
 * pre-resolved. `cleanup` and `graveyard` reuse `restoreFromCampaign()`'s own
 * shape for "opens after the aftermath" -- forcing `state.shubesArrived`
 * rather than waiting on his real walk-in, which is exactly what that
 * function already does for an actually-resumed save (see its own comment,
 * above). `graveyard` leaves the director running with `handoffReady` set,
 * so Lou/Prospect/Snow's handoff lines and the real ending card play out for
 * real on the next few real frames, the same way they would after a player
 * actually loads the body.
 */
function jumpToPreviewCheckpoint(id) {
  if (id === 'party') return;

  mission.enteredClub();
  mission.startPerformance();
  mission.finishPerformance();

  if (id === 'attack') {
    stageAttack();
    return;
  }

  mission.startAttack();
  resolveAttack();
  state.director.index = sequence.findIndex((beat) => beat.action === 'cleanup-start') + 1;
  state.director.waitingForAttack = false;
  state.director.running = false;
  state.shubesArrived = true;
  assignCleanupRoles();
  // The beat this skips past (Aubbie's "The bar, yes...") is the one that
  // hands the camera back -- `restoreFromCampaign()` instead leaves the
  // director running so a real animate() frame plays that beat for real.
  // Staying deterministic here calls its own action directly.
  releaseCinematic({ x: -9.4, z: 2.4, lookAt: { x: -15.5, z: -0.4 } });
  revealEvidenceCircles();
  repaintObjectives();

  if (id === 'cleanup') return;

  /* graveyard: the whole of the club, in the order a player walks it -- the
   * three floor tasks, the wrap, the lift, the trunk, Lou's debrief and only
   * then his sweep. Every one of these is the same call the interaction it
   * belongs to makes. */
  for (const task of mission.roomTasks) completeCleanupTask(task);
  if (!mission.wrapBody()) return;
  state.wrapped = true;
  party.extra.hotdog.group.visible = false;
  party.cleanup.wrap.visible = true;
  party.cleanup.serviceGuide.visible = true;
  if (!mission.carryBody()) return;
  if (!mission.assign('reserve_pickup')) return;
  state.loaded = true;
  releaseWrappedBody();
  if (!mission.debriefLou()) return;
  state.debriefed = true;
  if (!completeCleanupTask('final_sweep')) return;
  state.finalSwept = true;
  restoreHotDogCleanupPresentation(party, mission.cleanup);
  clearStrikeSplats();
  bankTheClub();
  beginEndingCutscene();
}

/**
 * The cutscene is over and the only thing left is the back door.
 *
 * The scene does NOT end here: it ends when the player walks out of it,
 * which is what `updateRoom` is watching for.
 */
function beginDeparture() {
  if (state.departing || !mission.beginDeparture()) return;
  state.departing = true;
  repaintObjectives();
  const service = club.doors.service;
  if (service && !service.open) {
    /* Snow is holding it. A locked fire door between the player and the only
     * remaining objective is not tension, it is a bug report. */
    service.toggle();
    audio.play('door.creak', { volume: 0.5, position: service.pivot.position });
  }
  speakThenNote(
    HOTDOG_STAGED_LINES.louLeaveNow,
    'Out through the store room and the service door. Snow is already in the car.',
    5200,
  );
  /* AND IF HE IS ALREADY OUT THERE, THE SCENE IS ALREADY OVER.
   *
   * `updateRoom` ends the party on the frame the room CHANGES to yard or
   * alley. That is the right test for a man walking out of a door and the
   * wrong one for a man who was standing in the alley when Lou finally said
   * go: the room does not change again, so nothing ever fires and the scene
   * sits there with one objective and no way to satisfy it. Found by
   * tools/verify-bing-two.mjs putting the player in the yard a beat early --
   * a real order a player can reach, because the alley is outside the club
   * and nothing stops him standing in it through the whole handoff. */
  if (['yard', 'alley'].includes(state.room)) finishParty();
}

function finishParty() {
  if (state.endingShown) return;
  state.endingShown = true;
  mission.finish();
  state.phase = 'complete';
  input.suspend();
  interaction.setPaused(true);
  document.exitPointerLock?.();
  blackout.classList.add('on');
  setTimeout(() => {
    overlay.classList.remove('hidden');
    overlay.classList.add('ending');
    overlay.querySelector('h1').innerHTML = 'THE HOTDOG <span>INCIDENT</span>';
    overlay.querySelector('.tag').textContent = 'The Prospect walks out of the Bada Bing behind Snow. Billy is already in the trunk, the floor is already clean, and the door closes on a room nobody was ever in.';
    assetStatus.innerHTML = '<b>NEXT: THE SQUATCH GRAVEYARD</b><br>HotDog still has to disappear before the Motel opens.';
    startButton.textContent = 'Ride with Snow to the graveyard →';
    startButton.disabled = false;
    startButton.onclick = () => navigateCampaign(campaign, SCENE_IDS.SQUATCH_GRAVEYARD, {
      spawn: 'headlights', location,
    });
    blackout.classList.remove('on');
  }, 900);
}

function setAcoustics(next) {
  const inside = !['lot', 'outside', 'alley', 'yard'].includes(next);
  audio.setLoopVolume('party.rain', inside ? 0.018 : 0.32, 0.8);
  audio.setLoopVolume('party.record', next === 'main' ? 0.17 : inside ? 0.06 : 0.025, 0.7);
  audio.setLoopVolume('party.crowd', next === 'main' ? 0.1 : inside ? 0.025 : 0, 0.7);
  club.rain.setVisible(!inside);
}

function updateRoom() {
  const next = roomAt(player.position.x, player.position.z);
  if (next === state.room) return;
  state.room = next;
  setAcoustics(next);
  if (next === 'main' && !mission.inside) {
    mission.enteredClub();
    repaintObjectives();
    hud.say('No customers, no dancers, no open tables. Every face in the room belongs to the Family.', 5200);
  }
  /* THE EXIT ENDS THE SCENE, on the frame he steps through it.
   *
   * `yard` is the strip behind the building and `ROOMS` says in its own
   * comment that it is how the game knows you left by the back -- every
   * interior room resolves first, so reaching it means the service door is
   * behind him. No fade to a cutscene of a room he has already walked out
   * of: that has already played, inside, with everybody still standing in it. */
  if (state.departing && ['yard', 'alley'].includes(next)) finishParty();
}

function teleport(x, z, yaw = player.yaw) {
  player.mode = 'walk';
  player.position.set(x, 1.66, z);
  player.velocity.set(0, 0, 0);
  player.yaw = yaw;
  player.pitch = 0;
  player.update(0.016);
}

const game = {
  get started() { return state.started; },
  get phase() { return state.phase; },
  get director() { return state.director; },
  get cleanupActive() { return state.cleanupActive; },
};
const cast = {
  all: party.all,
  byName: {
    lou: party.extra.lou,
    hotdog: party.extra.hotdog,
    aubbie: party.extra.aubbie,
    lawnmower: party.extra.lawnmower,
    sauce: party.extra.sauce,
    ...party.byId,
  },
};
const runtime = {
  isSecondVisit: true,
  campaign,
  secondVisitStory: story,
  story,
  mission,
  party,
  cast,
  club,
  scene,
  camera,
  three: THREE,
  player,
  get input() { return input; },
  get renderedFrameCount() { return renderedFrameCount; },
  interaction,
  audio,
  postfx,
  game,
  state,
  sequence,
  chatter,
  teleport,
  beginSequence,
  // Focused browser checks use these hooks to exercise the same authored
  // route and four-hit controller the player sees; there is no gun fallback.
  startApeExit: moveApeOut,
  startAttackCinematic: stageAttack,
  walkShubenatorIn,
  settleAuthoredWalks,
  updateDirector,
  applyCinematicCamera,
  attack,
  gore,
  completeCleanupTask,
  get campaignState() { return campaign.state; },
};
window.__squatchStage?.('Opening the doors...');
window.__bing = runtime;
window.HOTDOG_INCIDENT = runtime;

function requestGamePointerLock() {
  return input.requestPointerLock();
}

const hotDogInputPolicy = createHotDogInputPolicy({
  isActive: () => state.phase === 'active' && !state.paused,
  isCarrying: () => state.carrying,
  drinkShot: () => shotBeat.drink(),
  primaryControl: interaction,
  notifyCarryRefusal: () => hud.say('Not with Billy in both arms.', 2200),
  toggleBloom: () => postfx.toggle(),
  showBloom: (enabled) => hud.toast(enabled ? 'Bloom on' : 'Bloom off', 'good'),
});
const input = createFirstPersonInput({
  player,
  canvas,
  interaction,
  ...hotDogInputPolicy,
});

startButton.addEventListener('click', async () => {
  if (state.phase === 'complete') return;
  const begun = story.begin();
  if (!begun.ok) {
    if (begun.reason === 'already_complete') {
      overlay.querySelector('.tag').textContent = 'This incident is already complete. HotDog is in the ground.';
      startButton.textContent = 'Continue through the graveyard';
      startButton.onclick = () => story.continueAfterCompletion({ location });
    } else {
      overlay.querySelector('.tag').textContent = 'Lou has not called the Prospect back for the closed party yet.';
      startButton.textContent = 'MISSION UNAVAILABLE';
      startButton.disabled = true;
    }
    return;
  }
  if (begun.checkpoint === 'body_loaded') {
    navigateCampaign(campaign, SCENE_IDS.SQUATCH_GRAVEYARD, { spawn: 'headlights', location });
    return;
  }
  if (campaign.state.scene.id !== SCENE_IDS.BADA_BING_TWO) {
    campaign.enter(SCENE_IDS.BADA_BING_TWO, { spawn: 'club_entrance' });
  }
  startButton.disabled = true;
  startButton.textContent = 'Loading party audio...';
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_TWO);
  clock.setTime(campaign.state.story.day, campaign.state.story.timeMinutes);
  await audio.init();
  // The authored party is almost entirely voiced. Do not let a fast player
  // reach Hog Mama's controls while the recordings are still decoding and
  // silently fall through to subtitle-only playback.
  await audio.loadManifest(hotDogAudioLoadOptions());
  audio.startLoop('party.rain', { name: 'ambience.rain', volume: 0.3, ambience: true, fade: 1.2 });
  audio.startLoop('party.crowd', { name: 'ambience.crowd', volume: 0.02, ambience: true, fade: 1.2 });
  audio.startMusicLoop('party.record', 'assets/music/good-ole-days.mp3', {
    volume: 0.035, ambience: true, position: club.anchors.dj, ref: 3.5, maxDist: 36, fade: 1.4,
  });
  state.started = true;
  state.phase = 'active';
  startButton.disabled = false;
  overlay.classList.add('hidden');
  document.body.classList.add('playing', 'hotdog-party');
  sceneInventory.set([]);
  sceneInventory.show();
  // Start just inside the closed club. The exterior arrival was dead walking
  // before the scene's actual premise; this gets the player to the packed room
  // and stage controls immediately.
  teleport(club.anchors.frontDoor.x, club.anchors.frontDoor.z - 7.1, 0);
  restoreFromCampaign();
  if (previewCheckpoint) jumpToPreviewCheckpoint(previewCheckpoint);
  input.refresh('mission-start');
  requestGamePointerLock();
  // The opening line narrates a party that has not happened yet; a jump past
  // it has nothing for this line to introduce.
  if (!previewCheckpoint || previewCheckpoint === 'party') {
    hud.say('<em>11:00 PM.</em> Closed party. Hog Mama is waiting for somebody to work the stage controls.', 6000);
  }
});

const pauseMenu = createPauseMenu({
  title: 'The HotDog Incident',
  canPause: () => state.phase === 'active' && !state.endingShown,
  getObjective: () => mission.objectives.find((objective) => !objective.done)?.text
    || 'Finish the cleanup and load Billy for the graveyard.',
  instructions: [
    'W A S D — move. Shift — hurry. Space — jump.',
    'E or Click — interact; hold when the cleanup prompt asks for it.',
    'During the attack, follow the on-screen strike prompt.',
    'B — bloom. Tab — pause or resume.',
  ],
  onPause: () => {
    state.paused = true;
    input.suspend();
    interaction.setPaused(true);
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    state.paused = false;
    interaction.setPaused(state.cinematic.active);
    audio.ctx?.resume?.();
    lastTime = performance.now();
    input.resume();
  },
  recovery: createCampaignSceneRecovery({
    campaign,
    sceneId: SCENE_IDS.BADA_BING_TWO,
    location,
  }),
});

/* And a hidden tab should not keep simulating the party at nobody: route
 * through the pause menu, whose onPause already clears keys, suspends the
 * audio context, and freezes the sim. pause() refuses politely outside the
 * active phase. */
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
    if (!state.cinematic.active) {
      player.update(dt);
      interaction.update(dt);
    }
    updateRoom();
    updateDirector(dt);
    /* After the director, so the room can only speak into a silence the
     * director has already declined to use this frame. `mission.update` is
     * what eventually gets the Shubenator to shout about the stage controls;
     * it was never called here, so that nudge could not fire at all. */
    mission.update(dt);
    chatter.update(dt);
    shotBeat.update(dt);
    updateCarry(dt);
    for (const npc of party.all) {
      if (state.fallen && npc === party.extra.hotdog) continue;
      npc.update(dt, player.position);
    }
    settleAuthoredWalks();
    // Npc.update owns idle motion; the attack controller applies its
    // intentional pose afterward so the four hits cannot be overwritten.
    attack.update(dt);
    /* After the attack pose, so a droplet launched this frame leaves the
     * wound where it visibly is. Sim-clock driven; each system is a no-op
     * once its droplets have landed and its pools have grown. */
    gore.impacts.update(dt);
    gore.spurts.update(dt);
    gore.splats.update(dt);
    applyCinematicCamera(dt);
  }
  if (!state.paused) {
    club.update(dt, player.position);
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

setTimeout(() => loading.classList.add('hidden'), 220);
