import * as THREE from 'three';

import { createArcade } from '../arcade/mount.js';
import { AudioEngine } from '../core/audio.js';
import { DayNight } from '../core/daynight.js';
import { SPEECH_MIX_CLOSE, speak } from '../core/dialogue.js';
import { FirstPersonBody, createPlayerAppearanceStore } from '../core/first-person-body.js';
import { createFirstPersonInput } from '../core/first-person-input.js';
import { FocusRush } from '../core/focus-rush.js';
import { Highs } from '../core/highs.js';
import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { ENVIRONMENT_VISIBILITY } from '../core/environment-visibility.js';
import { createObjectivePanel } from '../core/objective-panel.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { PlanarMirror } from '../core/planar-mirror.js';
import { Person } from '../core/person.js';
import { Phone, callScript } from '../core/phone.js';
import { phoneThreadsForCampaign } from '../core/phone-content.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { Player } from '../core/player.js';
import { Radio, radioHudWithinRange } from '../core/radio.js';
import { applyBody } from '../core/settings.js';
import { Tv } from '../core/tv.js';
import { createBongBehavior } from '../world/bong.js';
import { ShowerSystem } from '../world/shower.js';
import { SmokeSystem } from '../world/smoke.js';
import {
  ITEM_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  createCampaignRadioAdapter,
  navigateCampaign,
} from '../core/campaign.js';
import {
  BIG_NIGHT_MARGO_DRESS_ASK,
  BIG_NIGHT_MARGO_WAKE,
  NO_WAKE_LOU_CALL,
  SILVER_CASE_BOOSKI_CALL,
  SILVER_ROOM_COME_HOME,
  SILVER_ROOM_DRESS_ASK,
  SILVER_ROOM_NEW_PLACE,
  SPECIAL_MEETING_BOOSKI_CALL,
} from '../core/apartment-story.js';
import { DRESS_HELP_CUES } from '../world/dress-help.js';
import { createLuxuryApartmentStory } from '../core/luxury-apartment-story.js';
import { createLuxuryInputPolicy } from './controls.js';
import {
  LUXURY_MARGO_CHECKPOINT_IDS,
  createLuxuryMargoScene,
  luxuryMargoCueNames,
} from './margo-scene.js';
import { createLuxuryReadyTally } from './story.js';
import { buildLuxuryApartment } from './world.js';
import {
  LuxuryAnsweringMachineRuntime,
  LuxuryCrookedArtRuntime,
  LuxuryDarts,
  LuxuryInventoryRuntime,
  LuxuryRevolverRuntime,
  LuxuryToiletRuntime,
  LUXURY_POKER_REFUSAL,
  createFloorAwarePlayerWorld,
  paintLuxuryGamePanel,
  refuseLuxuryPoker,
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
const elevatorExitCurtain = document.getElementById('luxury-elevator-exit');
const gamePanel = document.getElementById('luxury-game-panel');
const fxHigh = document.getElementById('fx-high');
const fxTrip = document.getElementById('fx-trip');
const chromaOffsets = document.querySelectorAll('#chroma feOffset');

const ELEVATOR_AUDIO_CUT_MS = 720;
const ELEVATOR_EXIT_MS = 1400;
const LUXURY_STORY_CALL_CUES = Object.freeze([
  NO_WAKE_LOU_CALL,
  SILVER_CASE_BOOSKI_CALL,
  SPECIAL_MEETING_BOOSKI_CALL,
].flatMap((definition) => callScript(definition).map(({ cue }) => cue)));

export const LUXURY_OUTFITS = Object.freeze([
  Object.freeze({
    id: 'black_henley', label: 'clean black henley',
    palette: Object.freeze({ shirt: 0x17191d, shirtDark: 0x0d0f12, pants: 0x20242b }),
  }),
  Object.freeze({
    id: 'charcoal_suit', label: 'charcoal suit',
    palette: Object.freeze({ shirt: 0x353941, shirtDark: 0x20242a, pants: 0x171a20 }),
  }),
  Object.freeze({
    id: 'cream_cashmere', label: 'cream cashmere',
    palette: Object.freeze({ shirt: 0xd8cdb7, shirtDark: 0xb7aa91, pants: 0x393a3f }),
  }),
  Object.freeze({
    id: 'late-night_track_jacket', label: 'late-night track jacket',
    palette: Object.freeze({ shirt: 0x252d3d, shirtDark: 0x141a25, pants: 0x171c27 }),
  }),
]);

export const LUXURY_OUTFIT_PALETTES = Object.freeze({
  ...Object.fromEntries(LUXURY_OUTFITS.map(({ id, palette }) => [id, palette])),
  cabin_workshirt: Object.freeze({ shirt: 0x4e5746, shirtDark: 0x30382d, pants: 0x3d342b }),
  grey_henley: Object.freeze({ shirt: 0x777b80, shirtDark: 0x51555a, pants: 0x292d33 }),
  good_shirt: Object.freeze({ shirt: 0x47627d, shirtDark: 0x2d4156, pants: 0x252a31 }),
});

const baseAppearanceStore = createPlayerAppearanceStore({ fallback: 'charcoal_suit' });
const canonicalLuxuryOutfitId = (outfitId) => (
  Object.hasOwn(LUXURY_OUTFIT_PALETTES, outfitId) ? outfitId : 'charcoal_suit'
);
const appearanceStore = Object.freeze({
  key: baseAppearanceStore.key,
  read() {
    const requested = baseAppearanceStore.read();
    const resolved = canonicalLuxuryOutfitId(requested);
    if (resolved !== requested) baseAppearanceStore.write(resolved);
    return resolved;
  },
  write(outfitId) {
    return baseAppearanceStore.write(canonicalLuxuryOutfitId(outfitId));
  },
});
const initialOutfitId = appearanceStore.read();
const readyTally = createLuxuryReadyTally();
let luxuryMargo = null;

function makeLuxuryPlayerBody(outfitId) {
  const person = new Person({
    ...(LUXURY_OUTFIT_PALETTES[outfitId] ?? LUXURY_OUTFIT_PALETTES.charcoal_suit),
    bandana: null,
  });
  person.group.scale.setScalar(0.70);
  person.group.userData.outfitId = outfitId;
  return person;
}

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
scene.fog = new THREE.FogExp2(0x101722, 0.0038);

const camera = new THREE.PerspectiveCamera(
  68, innerWidth / innerHeight, 0.045, ENVIRONMENT_VISIBILITY.indoorSkyline.cameraFar,
);
camera.name = 'luxury-apartment.camera';
scene.add(camera);

/* A late-game evening, but not a campaign assignment. DayNight supplies the
 * same clock/lighting language as both existing homes; sleep advances only
 * this developer-preview session. */
const time = new DayNight(20.5);
time.setTime(8, 20 * 60 + 30);
const hud = new Hud();
/* THE ONE PANEL (src/core/objective-panel.js), adopting the #objectives div
 * luxury-apartment.html carries. The line below used to exist only inside the
 * pause menu -- which is the exact failure that module's header describes: the
 * one screen a player is not playing on. */
const objectivePanel = createObjectivePanel({ parent: document.getElementById('hud') });

/* ------------------------------------------------------------------ *
 * THE CAMPAIGN, WHEN THERE IS ONE
 *
 * This flat is two things at once and has been since it landed: a standalone
 * developer preview of a place nobody could reach, and -- since beats 12 to
 * 27 -- the address the Prospect actually lives at for the second half of
 * Chapter 3. Which of the two it is on any given boot is a question with
 * exactly one honest answer, and it is the save's: `campaign.state.scene.id`.
 *
 * `routed` false is the old behaviour, unchanged and untouched: the lift goes
 * to preview.html, the objective is the standing order, and nothing is
 * written. `routed` true hands the front door, the panel, the bed and the
 * telephone to `core/luxury-apartment-story.js`, which owns beats 14, 16, 17,
 * 19 and 27 the way `apartment-story.js` owns the starter flat's.
 * ------------------------------------------------------------------ */
const campaign = createCampaign();
const luxuryStory = createLuxuryApartmentStory({ campaign });
const routed = campaign.state.scene.id === SCENE_IDS.LUXURY_APARTMENT;

/** The flat's standing order when nothing in the campaign is asking. */
const LUXURY_OBJECTIVE = 'Explore both floors or try the private games room.';

/**
 * What the panel and the pause menu say, which is whatever the door says.
 *
 * Derived rather than authored, for the reason the starter flat's own
 * `objectives()` gives: a panel that keeps its own copy of the door's rules
 * will eventually disagree with the door, and the player believes the panel.
 */
function currentObjective() {
  if (!routed) return readyTally.ready ? LUXURY_OBJECTIVE : readyTally.objective;
  if (luxuryMargo?.objective) return luxuryMargo.objective;
  if (phone?.inCall) return 'Stay on the line.';
  /* A pending campaign call is not yet an action. Keep it off the panel during
   * the six-second arrival beat, then expose it the instant the handset really
   * rings. This is the same objective-honesty rule the shared panel applies to
   * `pending` items: the UI cannot ask the player to answer silence. */
  const pendingCall = luxuryStory.pendingCall();
  if (pendingCall && !phone?.ringing) return LUXURY_OBJECTIVE;
  const [first] = luxuryStory.objectives().items;
  if (!first) return LUXURY_OBJECTIVE;
  /* Beat 14's door is an `activity`, and the activity is the three chores the
   * tally already counts. Show the count rather than the door's own label:
   * "Get ready for your date" is true and tells him nothing about what is
   * left, and the panel is the only place he can find that out. */
  const door = luxuryStory.tryLeave();
  if (door.kind === 'activity' && first.id === door.id) return readyTally.objective;
  return first.label;
}

function refreshObjective() {
  objectivePanel.setLine(currentObjective(), {
    title: !routed && readyTally.ready ? 'READY' : 'OBJECTIVE',
  });
}

/**
 * The campaign's own beat, on arrival and on waking.
 *
 * Three shapes, and which one runs is `phase()`'s answer rather than this
 * file's guess:
 *
 *  - a MARGO beat (16 or 17), physically staged from lift to upstairs bed;
 *  - a TELEPHONE beat (15, 18 or 19), which schedules the ring;
 *  - nothing, which is a save standing between two of them.
 *
 * The durable markers remain in `LuxuryApartmentStory`; the physical actor,
 * mouth, stair walk, bed poses and shared dress-help rhythm are owned by
 * `luxury-apartment/margo-scene.js`.  A marker is not spent until that visible
 * sequence reaches its authored end.
 */
const luxuryPhone = { elapsed: 0, nextRingAt: null };

function startLuxuryStoryBeat() {
  if (!routed) return;
  syncPhoneThreads();
  refreshObjective();
  const phase = luxuryStory.phase();
  luxuryMargo?.stageForPhase(phase);
  if (phase === 'come_home') {
    luxuryMargo?.startComeHome(
      SILVER_ROOM_COME_HOME,
      SILVER_ROOM_DRESS_ASK,
      SILVER_ROOM_NEW_PLACE,
    );
    return;
  }
  if (phase === 'morning') {
    luxuryMargo?.startWake(BIG_NIGHT_MARGO_WAKE, BIG_NIGHT_MARGO_DRESS_ASK);
    return;
  }
  /* Six seconds, the same lead-in the starter flat gives every call: long
   * enough to be standing in the room before it rings. */
  luxuryPhone.nextRingAt = luxuryPhone.elapsed + 6;
}

function updateLuxuryPhone(dt) {
  if (!routed || luxuryMargo?.active) return;
  luxuryPhone.elapsed += Math.max(0, dt);
  if (luxuryPhone.nextRingAt === null || luxuryPhone.elapsed < luxuryPhone.nextRingAt) return;
  const call = luxuryStory.pendingCall();
  if (!call) {
    luxuryPhone.nextRingAt = null;
    return;
  }
  /* A refused ring (there is already a call up) tries again next second; a
   * successful one books the retry a full ring plus a breath later. */
  const rang = phone.ring(call) === true;
  if (rang) {
    /* The owner note is literal here: after the original pickup this is Tony's
     * campaign phone, not a nightstand/console/service-door hotspot. The global
     * KeyE route below answers it before any unrelated world interaction. */
    hud.toast(`${call.from} is calling`, '', 5200);
    hud.say('Your phone is ringing. <em>[E] answer — wherever you are.</em>', 4600);
    refreshObjective();
  }
  luxuryPhone.nextRingAt = luxuryPhone.elapsed + (rang ? 28 : 1);
}
const interaction = new InteractionSystem(camera, hud);
const audio = new AudioEngine();
const tv = new Tv({ audio });
const radio = new Radio(audio, hud, time, {
  venue: 'luxury_apartment',
  state: createCampaignRadioAdapter(campaign, {
    receiverId: 'luxury_apartment',
    defaultPower: false,
  }),
  canPlayNotice: () => false,
  output: 0.88,
  hudVisible: () => radioHudWithinRange(camera?.position, home?.radioPos),
});
const phone = new Phone({
  time,
  audio,
  calls: [],
  threads: phoneThreadsForCampaign(campaign.state),
  onThreadRead: (thread) => {
    if (routed && thread.readEventId) campaign.advanceTime(thread.readEventId);
    syncPhoneThreads();
  },
  onCallState: (connected) => {
    radio.setPhoneDucked(connected);
    if (routed && state.phase === 'active') refreshObjective();
  },
});

/** Rebuild the held inbox from the same durable campaign truth as every hub. */
function syncPhoneThreads() {
  phone.setThreads(phoneThreadsForCampaign(campaign.state));
}
/* Taking the call is what commits it. The story adapter owns what each one
 * unlocks; this only tells it the receiver came off the hook. */
phone.onAnswered = (definition) => {
  if (!routed) return;
  luxuryStory.callAnswered(definition);
  syncPhoneThreads();
  refreshObjective();
};
const showerFx = new ShowerSystem(scene);
const smoke = new SmokeSystem(scene);
const highs = new Highs();
const focusRush = new FocusRush({ baseFov: camera.fov });
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
  outfit: LUXURY_OUTFITS.findIndex(({ id }) => id === initialOutfitId),
  money: 2500,
  fridgeBeer: 5,
  fridgeSlices: 2,
  sleepCount: 0,
  activeArcade: null,
  activeArcadeScreen: null,
  cabinetBooted: false,
  exitDestination: null,
  exitNavigate: null,
  exitAudioStopped: false,
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
let bathroomMirror = null;
let firstPersonBody = null;
let player = null;
let inventoryRuntime = null;
let toilet = null;
let crookedArt = null;
let answeringMachine = null;
let revolver = null;
let darts = null;
let lastFrame = performance.now();
/* The canonical browser-input Adapter (src/core/first-person-input.js). It is
 * constructed once `player` exists, and from that moment it — not this file —
 * owns `player.enabled`, held keys, look and capture. Every place that used to
 * write `player.enabled = document.pointerLockElement === canvas` now asks it
 * to re-read the policy instead. */
let browserInput = null;

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

/* Capture, the failure paths, and the drag fallback for a preview shell that
 * denies pointer lock all live in the Adapter now. `canEnable` already refuses
 * while a framed SquatchOS app owns the cursor, which is the guard this
 * function used to carry itself. */
function requestGamePointerLock() {
  return browserInput?.requestPointerLock() ?? false;
}

/** Ask the Adapter to re-read scene policy after a phase or posture change. */
function syncInput(reason) {
  return browserInput?.refresh(reason) ?? null;
}

/** True while the Adapter holds the mouse — pointer lock or the drag fallback. */
function inputCaptured() {
  return browserInput?.captured === true;
}

function showPosture(kind) {
  state.posture = kind;
  postureLabel.textContent = kind === 'desk' ? 'leave the PC'
    : kind === 'arcade' ? 'leave the cabinet'
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
  /* The posture is set BEFORE the refresh so the Adapter reads the new owner
   * and drops movement itself. Clearing first and setting the flag after would
   * leave a key held through the sit transition. */
  syncInput(`sit-${kind}`);
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
  if (kind === 'darts') darts.leave();
  const poseKey = kind === 'arcade' ? 'arcade'
    : kind === 'darts' ? 'darts'
      : kind === 'console' ? 'console'
        : kind === 'desk' ? 'desk'
          : kind;
  const exit = home.poses?.[poseKey]?.exit ?? home.spawns.main.position;
  clearPosture();
  restoreWalkingPose(player, exit, home.groundAt);
  interaction.setPaused(false);
  syncInput('leave-posture');
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
    /* The table remains authored furniture, but Tony is alone and no table
     * game is mounted. Keep newest-main's hard refusal (false means no seat or
     * game) while retaining the polished branch's optional spoken pickup. */
    speak(audio, 'vo.luxury.poker.solo', {
      mix: SPEECH_MIX_CLOSE,
      subtitle: LUXURY_POKER_REFUSAL.line,
      requiredRecorded: false,
    });
    return refuseLuxuryPoker(hud);
  }
  if (id === 'darts') {
    return sitAt('darts', station.pose ?? home.poses.darts, () => {
      /* The dartboard is the one seat that keeps the look axis, so the policy
       * owner changes from SEATED to AIMED_POSTURE the instant darts.enter()
       * lands. Re-read it here rather than waiting for the next mouse event. */
      darts.enter();
      syncInput('darts-entered');
    });
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

function useFrontDoor() {
  audio.play('door.knob', { volume: 0.36 });
  hud.toast('Service door sealed');
  hud.say('That door stays deadbolted. <em>The private elevator is the way in and out.</em>', 3600);
  return false;
}

/**
 * The lift, which is the only way out of this flat and therefore the door.
 *
 * On the campaign route it asks `LuxuryApartmentStory` where the save is
 * allowed to go and refuses in Tony's own voice when the answer is nowhere --
 * the same `go`/`call`/`activity`/`stay` vocabulary the starter flat's front
 * door speaks. Off it, the lift goes back to the preview launcher exactly as
 * it always has.
 */
function luxuryDeparture() {
  /* The preview has no campaign to ask, so the three chores are its whole
   * gate: getting ready IS the standalone flat's content, and a lift that
   * leaves before he is dressed skips the only thing in it to do. Same
   * refusal shape the campaign door speaks, so `beginElevatorExit` keeps one
   * branch instead of growing a second for the preview. */
  if (!routed) {
    if (!readyTally.ready) {
      return {
        refusal: {
          kind: 'activity',
          id: 'luxury_get_ready',
          line: 'Not yet. Shower, get dressed, grab the phone. Then the elevator.',
          hint: 'Shower, change clothes, and take your phone.',
        },
      };
    }
    return { href: './preview.html' };
  }
  if (phone.inCall) {
    return {
      refusal: {
        kind: 'call',
        line: 'Not while he’s still on the line.',
        hint: 'Finish the call before using the elevator.',
      },
    };
  }
  const door = luxuryStory.tryLeave();
  if (door.kind !== 'go') return { refusal: door };
  return {
    navigate: () => {
      /* The cabin owns the appointment and this lift owns the date's actual
       * departure. Keep the clock seam beside the real interaction that
       * leaves the flat; otherwise the retired starter-apartment phone path
       * is the only place that can advance Front & Center to its evening. */
      if (door.destination === SCENE_IDS.SILVER_ROOM) {
        campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_ROOM);
      }
      return navigateCampaign(campaign, door.destination, {
        spawn: [SCENE_IDS.SILVER_ROOM, SCENE_IDS.SPECIAL_MEETING].includes(door.destination)
          ? 'kerb' : undefined,
      });
    },
  };
}

function beginElevatorExit() {
  if (state.phase !== 'active') return false;

  const departure = luxuryDeparture();
  if (departure.refusal) {
    const { line, hint } = departure.refusal;
    if (line) hud.say(line, 4200);
    if (hint) hud.toast(hint);
    refreshObjective();
    return false;
  }

  state.phase = 'exiting';
  state.exitDestination = departure.href ?? null;
  state.exitNavigate = departure.navigate ?? null;
  state.exitAudioStopped = false;
  state.paused = false;
  /* `phase` is already 'exiting', so the policy owner is DISABLED: suspend()
   * drops held keys, disables the Player and gives the cursor back in one
   * call, which is the whole of what the four lines here used to do. */
  browserInput?.suspend();
  interaction.release();
  interaction.setPaused(true);

  /* A framed game or receiver can own audio outside AudioEngine's loop map.
   * Release those owners first, then fade every scene loop through the shared
   * engine. The lift cue is a short one-shot and is allowed to finish under
   * the visible door-close/fade before the context is suspended. */
  pcArcade.setSeated(false);
  cabinetArcade.setSeated(false);
  radio.pause();
  if (tv.on) {
    tv.toggle();
    home.state.tvOn = tv.on;
  }
  answeringMachine?.stop();
  audio.stopSpeech();
  for (const key of [...audio.loops.keys()]) audio.stopLoop(key, 0.28);

  objectivePanel.clear();
  elevatorExitCurtain.setAttribute('aria-hidden', 'false');
  elevatorExitCurtain.classList.add('active');

  setTimeout(() => {
    if (state.phase !== 'exiting') return;
    /* CSS transitions can be throttled behind a saturated WebGL frame. Do not
     * let that turn the fixed navigation timer into a visible cut: once the
     * authored 720 ms fade budget has elapsed, force the curtain to its final
     * opaque frame before suspending audio or starting the navigation hold. */
    elevatorExitCurtain.style.transition = 'none';
    elevatorExitCurtain.style.opacity = '1';
    Promise.resolve(audio.ctx?.suspend?.())
      .catch(() => {})
      .finally(() => {
        if (state.phase !== 'exiting') return;
        state.exitAudioStopped = true;
        /* Navigation used to race the audio suspension on a separate fixed
         * timer. A busy renderer could leave the apartment while its context
         * was still live, and the certification promise then died with the
         * page before it could say which half lost. Audio closes first; the
         * remaining curtain hold starts from that receipt. */
        setTimeout(() => {
          if (state.phase !== 'exiting') return;
          /* `navigateCampaign` writes the save BEFORE it changes the page --
           * that is the whole of its contract -- so a campaign departure is a
           * call rather than an href. The preview's lift still assigns. */
          if (state.exitNavigate) state.exitNavigate();
          else window.location.assign(state.exitDestination);
        }, ELEVATOR_EXIT_MS - ELEVATOR_AUDIO_CUT_MS);
      });
  }, ELEVATOR_AUDIO_CUT_MS);
  return true;
}

/**
 * The three chores changed, so re-count them and tell the door.
 *
 * The chores ARE beat 14's exit condition -- the bible's transition for it is
 * "complete get-ready flow and leave" -- and until this call existed nothing
 * in the flat ever spent LUXURY_GET_READY. `LuxuryApartmentStory.phase()`
 * reads that ledger entry to decide whether he is still getting ready, so the
 * campaign door refused the lift forever, on every routed save, waiting on a
 * signal the room had no way to send. Sending it from the same place that
 * counts the chores is what keeps the tally and the door agreeing.
 */
function refreshLuxuryObjective({ toast = false } = {}) {
  readyTally.sync(home?.state);
  if (routed && readyTally.ready) luxuryStory.completeGetReady();
  if (state.phase === 'active') refreshObjective();
  if (toast && readyTally.ready) hud.toast('Ready to leave · private elevator unlocked', 'good');
  return readyTally.snapshot();
}

function useElevator(mode) {
  /* Both verbs are the same door, so both ask the same question. A `call` that
   * opens while the ride would be refused is the flat showing him a way out it
   * has no intention of honouring -- and it is worse than cosmetic, because
   * opening the doors drops the shaft collider and leaves him standing in a
   * hole that goes nowhere. */
  const departure = luxuryDeparture();
  if (departure.refusal) {
    audio.play('door.knob', { volume: 0.28 });
    const { line, hint } = departure.refusal;
    if (line) hud.say(line, 4200);
    if (hint) hud.toast(hint);
    refreshObjective();
    return false;
  }
  audio.play(mode === 'ride' ? 'door.creak' : 'door.knob', { volume: 0.42 });
  if (mode === 'ride') {
    /* Say the line only if the lift is actually going anywhere. On the
     * campaign route the door can refuse, and "the doors close on the
     * apartment" over a man who has not been told where to go is the flat
     * lying to him. `beginElevatorExit` speaks the refusal itself. */
    const going = beginElevatorExit();
    if (going) {
      hud.toast('Private elevator descending');
      hud.say('The doors close on the apartment. <em>No unfinished hallway. No open-world drop.</em>', 3400);
    }
    return going;
  }
  hud.toast('Private elevator called');
  return true;
}

function useCigarettePack() {
  return inventoryRuntime?.replenish('cigs', { amount: 6, max: 12 }) ?? false;
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
  /* `showering` is set first, so the refresh reads DISABLED and drops the
   * held keys on its way past. */
  syncInput('shower-start');
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
  const current = LUXURY_OUTFITS.findIndex(({ id }) => id === firstPersonBody?.outfitId);
  state.outfit = current < 0 ? 0 : (current + 1) % LUXURY_OUTFITS.length;
  const outfit = LUXURY_OUTFITS[state.outfit];
  firstPersonBody?.setOutfit(outfit.id);
  readyTally.complete('dressed');
  hud.toast(`Changed · ${outfit.label}`, 'good');
  audio.play('closet.slide', { volume: 0.36 });
  refreshLuxuryObjective({ toast: true });
  return true;
}

function takeHomePhone() {
  const taken = inventoryRuntime?.takePhone() ?? false;
  if (taken && routed && !campaign.hasItem(ITEM_IDS.PHONE)) {
    campaign.addItem(ITEM_IDS.PHONE);
  }
  if (home?.state.phoneTaken || taken) readyTally.complete('phoneTaken');
  refreshLuxuryObjective({ toast: true });
  return taken;
}

function sleepAtHome() {
  if (state.resting || !player || player.mode !== 'walk') return false;
  /* BEAT 16 ENDS IN THIS BED. "Fade/sleep into the following morning."
   *
   * On the campaign route the night is a durable beat rather than a nap: the
   * story adapter refuses it until she is in (and skips her entirely on an
   * evening that did not earn her), and it writes the Day 7 morning the
   * bible asks for. A refused night says why instead of silently doing
   * nothing, because a bed that ignores you is a bed you assume is broken. */
  if (routed) {
    const night = luxuryStory.sleep();
    if (!night.ok) {
      const door = luxuryStory.tryLeave();
      if (door.line) hud.say(door.line, 4200);
      return false;
    }
  }
  state.resting = true;
  syncInput('sleep-start');
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
        syncInput('wake');
        hud.toast(`Day ${routed ? campaign.state.story.day : time.day} · rested`, 'good');
        hud.say('Morning over the skyline. <em>The place is still yours.</em>', 4400);
        if (routed) startLuxuryStoryBeat();
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
  /* Aim keeps the look axis and the seat does not, so every mode change is an
   * owner change (AIMED_POSTURE <-> SEATED <-> WORLD). */
  syncInput(`toilet-${mode ?? 'clear'}`);
}

function syncCrookedArtMode(mode) {
  if (mode) {
    showPosture('crooked-art');
  } else {
    clearPosture();
  }
  syncInput(`crooked-art-${mode ? 'start' : 'end'}`);
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
    onFrontDoor: useFrontDoor,
    onElevator: useElevator,
    elevatorStatus: () => readyTally.snapshot(),
    onBathroomDoor: (open) => useDoor('Bathroom door', open),
    onBed: useBed,
    onCouch: () => sitAt('couch', home.poses.couch),
    onDesk: () => { if (home) home.state.pcOn = true; },
    onTv: useTv,
    onRadio: useRadio,
    onPhone: takeHomePhone,
    margoHelpEnabled: () => luxuryMargo?.awaitingHelp === true,
    onMargoHelp: () => luxuryMargo?.interact() ?? false,
    onFridge: useFridge,
    onCook: useKitchen,
    cigaretteStatus: () => inventoryRuntime?.status('cigs') ?? { full: false },
    onCigarettes: useCigarettePack,
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
  bathroomMirror = new PlanarMirror(scene, home.mirrorMesh, {
    width: 0.54,
    height: 0.66,
    resolution: [384, 468],
    maxDistance: 9,
    enabled: true,
  });
} catch (error) {
  window.__squatchSceneFail?.('Could not build the luxury apartment', error?.message || String(error));
  throw error;
}

luxuryMargo = createLuxuryMargoScene({
  actor: home.margo,
  audio,
  hud,
  interaction,
  openElevator: () => home.doors.elevator.open(),
  closeElevator: () => home.doors.elevator.close(),
  onObjectiveChange: () => {
    if (state.phase === 'active') refreshObjective();
  },
  onComeHomeDone: () => {
    luxuryStory.margoComeHomeDone();
    refreshObjective();
  },
  onWakeDone: () => {
    luxuryStory.margoWakeDone();
    refreshObjective();
    /* Lou waits until she is physically in the lift, then the ordinary phone
     * scheduler gets the same six-second breathing room as every other call. */
    luxuryPhone.nextRingAt = luxuryPhone.elapsed + 6;
  },
});

home.root.updateMatrixWorld(true);

/* The shared Player is one-floor by default. Its world adapter supplies the
 * current eye Y to world.groundAt, and every posture exit below uses the
 * loft-safe direct restoration helper instead of Player.standFrom(). */
const playerWorld = createFloorAwarePlayerWorld(home, () => player);
player = new Player(camera, playerWorld);
player.mode = 'walk';
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);
interaction.setOccluders(home.occluders ?? []);
teleportToSpawn(player, home, routed ? campaign.state.scene.spawn : 'arrival');
firstPersonBody = new FirstPersonBody(scene, {
  factory: makeLuxuryPlayerBody,
  store: appearanceStore,
  outfitId: initialOutfitId,
  eyeHeight: 1.68,
});

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
if (routed && campaign.hasItem(ITEM_IDS.PHONE)) {
  inventoryRuntime.restorePhone();
}
home.state.phoneTaken = home.inventory.has('phone');
readyTally.sync(home.state);

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
  isPointerLocked: inputCaptured,
});
crookedArt = new LuxuryCrookedArtRuntime({
  art: home.crookedArt,
  interaction,
  hud,
  audio,
  onMode: syncCrookedArtMode,
});
answeringMachine = new LuxuryAnsweringMachineRuntime({ world: home, hud, audio });
darts = new LuxuryDarts({
  scene,
  camera,
  station: home.gameStations.darts,
  hud,
  audio,
  panel: gamePanel,
});

const pcTexture = mountCanvas(home.screens.pc, pcArcade.canvas);
const cabinetTexture = mountCanvas(home.screens.arcade, cabinetArcade.canvas);
const tvTexture = mountCanvas(home.screens.tv, tv.canvas);
tv.position = worldPoint(home.screens.tv);
radio.setPosition(home.radioPos ?? worldPoint(home.utilityTargets.radio));

/* No table game is mounted at the poker table any more. It used to carry
 * src/bing/blackjack.js -- the Bing's dealer module, re-seated on this felt --
 * and the owner took it off on 2026-08-26. The module itself is untouched and
 * still runs at the Bada Bing, where there are people to play it with. */

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
      'phone.ring', 'phone.hangup', 'phone.pickup',
      'tv.click', 'card.deal', 'card.flip', 'ui.select',
      'chair.sit', 'pee.zip', 'pee.stream', 'pee.miss', 'toilet.plop',
      'poop.1', 'poop.2', 'poop.3', 'poop.4', 'poop.strain',
      'gun.pickup', 'gun.shot', 'gun.dry', 'gun.impact', 'gun.reload', 'ammo.take',
      'bong.bubble', 'zyn.pack', 'glue.slip',
      'margo.snore',
      ...DRESS_HELP_CUES,
      ...luxuryMargoCueNames(
        SILVER_ROOM_NEW_PLACE,
        SILVER_ROOM_COME_HOME,
        SILVER_ROOM_DRESS_ASK,
        BIG_NIGHT_MARGO_WAKE,
        BIG_NIGHT_MARGO_DRESS_ASK,
      ),
      ...LUXURY_STORY_CALL_CUES,
      'vo.luxury.poker.solo',
      'vo.luxury.elevator.not-ready', 'vo.luxury.elevator.not-ready-repeat',
      ...radio.preloadCueNames({ startupOnly: true }),
    ],
  });
  /* Owner engineering decision, 2026-08-27: each physical receiver keeps
   * its switch across visits. Radio deliberately loads that preference into
   * `preferredOn` while leaving `on` false, so no restored set can challenge
   * browser autoplay before this real start-button gesture has initialized
   * the AudioContext. `remember: false` restores the saved switch without
   * manufacturing a second save write on every apartment reload. */
  if (radio.preferredOn) radio.turnOn({ remember: false });
  home.state.radioOn = radio.on;
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
  syncInput('start');
  refreshObjective();
  document.body.classList.add('playing');
  overlay.classList.add('hidden');
  requestGamePointerLock();
  if (routed) startLuxuryStoryBeat();
  else {
    hud.say('<em>Developer preview.</em> Two floors, one private elevator, and every way Tony wastes an evening.', 5200);
  }
});

const pauseMenu = createPauseMenu({
  title: 'The High Life',
  canPause: () => state.phase === 'active' && !state.posture && !state.resting && !state.showering,
  canHandleTab: () => state.activeArcade?.inputMode !== 'dom',
  getObjective: () => currentObjective(),
  instructions: [
    'W A S D — move. Shift — sprint. Space — jump.',
    'E or Click — use and play. Hold E where a second action is shown.',
    'F — consume the selected item. Q — stand or pocket it. R — radio/game action.',
    'Tab or Esc — pause. At a computer, Tab returns to SquatchOS and Q stands up.',
    'At darts: hold E or Mouse to charge, release to throw, R resets the leg.',
    routed
      ? 'Story progress saves through the campaign ledger.'
      : 'Preview mode does not alter campaign progress.',
  ],
  onPause: () => {
    state.paused = true;
    /* releasePointerLock() AND NOT suspend(), and the difference cost a
     * verifier run. `suspend()` switches the Adapter's ROUTES off — and the
     * route that closes this menu is the second Escape, so the flat paused and
     * then could never be unpaused from the keyboard again. `release` gives the
     * cursor back, drops held keys and abandons a half-held interaction while
     * leaving routing alive, which is exactly what an authored UI over a live
     * scene wants; the Adapter's own header says so. `state.paused` is set
     * first, so the refresh it ends with reads the PAUSED owner and disables
     * the Player on its way out. */
    browserInput?.releasePointerLock();
    interaction.release();
    interaction.setPaused(true);
    radio.pause();
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    state.paused = false;
    interaction.setPaused(Boolean(state.posture));
    audio.ctx?.resume?.();
    radio.resume();
    lastFrame = performance.now();
    syncInput('resume');
    /* Only the postures that steer get the mouse back. Seated at the cinema
     * wall or the desk the cursor stays free — but the Adapter's own mousedown
     * will recapture on a click, which the old canvas handler refused to do
     * and is why losing pointer lock while seated used to be a dead end. */
    if (!state.posture || toilet?.aiming || state.posture === 'darts') requestGamePointerLock();
  },
  onRestart: () => location.reload(),
  restartLabel: 'Restart luxury preview',
});

/* ------------------------------------------------------------------ */
/* INPUT — routes only. Capture, key translation, release and focus    */
/* cleanup all belong to src/core/first-person-input.js.               */
/*                                                                     */
/* A route runs AHEAD of the Adapter's default for that event, and     */
/* returning `true` consumes that default. So a route that wants the   */
/* ordinary WASD/Space behaviour returns nothing and lets the Adapter  */
/* set the key; a posture that owns the keyboard returns true.         */
/* ------------------------------------------------------------------ */

/** True while the scene is playable and no timed sequence owns the body. */
function inputLive() {
  return state.phase === 'active' && !state.paused && !state.resting && !state.showering;
}

function routeLuxuryKeyDown(event, { code }) {
  if (event.code === 'Escape' && !event.repeat) {
    /* `canHandleInput` already refused while a framed SquatchOS app owns the
     * keyboard, which is the guard the old listener wrote out here. */
    if (state.phase !== 'active') return true;
    event.preventDefault();
    pauseMenu.toggle();
    return true;
  }
  if (!inputLive()) return true;

  /* Story calls outrank every posture and nearby interactable. In particular,
   * a darts throw, toilet prompt, console, or piece of furniture must never eat
   * the standard interaction key while Beat 27 is ringing. The handset remains
   * pocketed; `Phone.press()` is still the real public answer path and therefore
   * owns ringtone shutdown, callbacks, VO order, and exact-once campaign state. */
  if (code === 'KeyE' && !event.repeat && phone.ringing) {
    event.preventDefault();
    phone.press();
    return true;
  }

  if (luxuryMargo?.dressActive) {
    if (!event.repeat && code === 'KeyE') luxuryMargo.press();
    else if (!event.repeat && code === 'KeyQ') luxuryMargo.abandon();
    event.preventDefault();
    return true;
  }

  /* The postures below all speak the gameplay vocabulary — E/Q/R, and WASD
   * on the seat — so they read `code`, not the physical key. Only the framed
   * arcade apps and the inventory digits stay physical. */
  if (toilet?.active) {
    if (!event.repeat) toilet.handleKey(code);
    event.preventDefault();
    return true;
  }

  if (crookedArt?.bar.active) {
    if (!event.repeat) crookedArt.handleKey(code);
    event.preventDefault();
    return true;
  }

  if (state.posture === 'darts') {
    if (code === 'KeyQ') leavePosture();
    else if (code === 'KeyE' && !event.repeat) darts.beginCharge();
    else if (code === 'KeyR') darts.reset();
    event.preventDefault();
    return true;
  }

  if (state.posture === 'console') {
    if (code === 'KeyQ') leavePosture();
    else if (code === 'KeyR' || code === 'KeyE') {
      if (!tv.on) tv.toggle();
      else tv.next();
      home.state.tvOn = tv.on;
      hud.toast(`Cinema wall · ${tv.channel.name}`);
    }
    event.preventDefault();
    return true;
  }

  if (state.activeArcade?.onKey(event.code, true)) {
    event.preventDefault();
    return true;
  }

  if (code === 'KeyQ' && state.posture) {
    leavePosture();
    event.preventDefault();
    return true;
  }

  /* From here down he is walking around his own flat, and `code` is the
   * CONFIGURED key: the Adapter ran translateKey before the route, which is
   * the one place that translation now happens in this scene. */
  if (code === 'KeyE' && !event.repeat) {
    if (home.inventory.held === 'phone') phone.press();
    else interaction.press();
  }
  if (code === 'KeyQ' && !event.repeat) inventoryRuntime.pocket();
  if (code === 'KeyR' && !event.repeat) {
    if (home.inventory.held === 'gun') revolver.reload();
    else if (radio.on) radio.next();
  }
  const number = /^Digit([1-5])$/.exec(event.code)?.[1];
  if (number) home.inventory.select(Number(number) - 1);
  /* Nothing consumed: the Adapter sets WASD/Shift/Space/C and the scene's one
   * declared held key, F, and calls preventDefault on the ones it owns. */
  return undefined;
}

// Released on the same translated code the charge started on, or a rebound
// throw key holds the dart back for good.
function routeLuxuryKeyUp(event, { code }) {
  if (state.posture === 'darts' && code === 'KeyE') {
    darts.release();
    event.preventDefault();
    return true;
  }
  state.activeArcade?.onKey(event.code, false);
  /* Nothing consumed: the Adapter releases the key it pressed and, on E, the
   * interaction that key started. */
  return undefined;
}

function routeLuxuryMouseMove(event) {
  if (state.activeArcade?.inputMode === 'relative') {
    state.activeArcade.onPointer(event.movementX, event.movementY);
    return true;
  }
  return undefined;
}

function routeLuxuryMouseDown(event) {
  if (event.button !== 0 || state.phase !== 'active' || state.paused) return true;
  if (toilet?.active || crookedArt?.bar.active) return true;
  if (state.posture === 'darts') darts.beginCharge();
  else if (state.activeArcade) state.activeArcade.onClick(true);
  else if (home.inventory.held === 'gun' && inputCaptured()) revolver.fire();
  else if (inputCaptured()) interaction.press();
  /* Consume ONLY when the mouse is already ours. Uncaptured, the click falls
   * through to the Adapter and buys capture back — including at the desk and
   * the cinema wall, where the old canvas click handler explicitly refused to,
   * so losing pointer lock while seated was a dead end you could only leave by
   * standing up. */
  return inputCaptured();
}

function routeLuxuryMouseUp(event) {
  if (event.button !== 0) return undefined;
  if (state.posture === 'darts') darts.release();
  else if (state.activeArcade) state.activeArcade.onClick(false);
  else interaction.release();
  return undefined;
}

const luxuryInputPolicy = createLuxuryInputPolicy({
  readState: () => ({
    phase: state.phase,
    paused: state.paused,
    resting: state.resting,
    showering: state.showering,
    posture: state.posture,
    arcadeInputMode: state.activeArcade?.inputMode ?? null,
    toiletAiming: toilet?.aiming === true,
  }),
  keyDown: routeLuxuryKeyDown,
  keyUp: routeLuxuryKeyUp,
  mouseMove: routeLuxuryMouseMove,
  mouseDown: routeLuxuryMouseDown,
  mouseUp: routeLuxuryMouseUp,
  clear: () => state.activeArcade?.onClick(false),
});

browserInput = createFirstPersonInput({
  player,
  canvas,
  interaction,
  /* F is the held-consumable key: the frame loop reads `player.keys.has('KeyF')`
   * every tick to decide whether he is still drinking. It is outside the
   * Adapter's movement-only default set, so the scene declares it. */
  playerKeyCodes: ['KeyF'],
  ...luxuryInputPolicy.adapterOptions,
});

window.addEventListener('wheel', (event) => {
  if (state.phase !== 'active' || state.posture || state.paused) return;
  if (home.inventory.held === 'phone' && ['messages', 'thread'].includes(phone.screen)) {
    phone.cycle(event.deltaY > 0 ? 1 : -1);
  } else {
    home.inventory.cycle(event.deltaY > 0 ? 1 : -1);
  }
}, { passive: true });

/* No `blur` listener here: the Adapter clears held keys and abandons a
 * half-held interaction on focus loss, which is what these three lines did. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseMenu.pause();
});
/* No canvas `click` handler either: the Adapter's own mousedown asks for
 * capture, gated by the policy's `canEnable`. */
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
      readyTally.complete('showered');
      showerFx.stop();
      audio.stopLoop('luxury.shower', 0.5);
      restoreWalkingPose(player, home.poses.shower.exit, home.groundAt);
      interaction.setPaused(false);
      syncInput('shower-end');
      hud.toast('Showered', 'good');
      hud.say('Clean clothes, clean glass, clean slate. <em>For tonight.</em>', 3800);
      refreshLuxuryObjective({ toast: true });
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
    firstPersonBody?.update(dt, player, {
      groundY: home.groundAt(player.position.x, player.position.z, player.position.y),
    });
    home.update(dt * highs.timeScale, state.elapsed, player.position);
    toilet.update(dt);
    crookedArt.update(dt);
    answeringMachine.update(dt);
    revolver.update(dt);
    darts.update(dt);
    updateTimedActivities(dt);

    if (state.phase === 'active' && !state.posture && !state.resting && !state.showering) {
      interaction.update(dt);
    }
    luxuryMargo?.update(dt);
    updateLuxuryPhone(dt);
    const wasRinging = phone.ringing;
    phone.update(dt);
    if (wasRinging !== phone.ringing) refreshObjective();
    phone.draw();
    radio.update(dt);
    if (tv.update(dt) && tvTexture) tvTexture.needsUpdate = true;

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
  bathroomMirror?.render(renderer, camera);
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

  darts.reset();
  darts.enter();
  const dartLaunch = darts.throwAtBoard({ power: 12 });
  for (let i = 0; dartLaunch && darts.inFlight && i < 240; i++) darts.update(1 / 120);
  const dartThrow = darts.lastImpact;
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
  syncInput('parity-restore');

  /* THE POKER TABLE IS ASKED LAST, ON HIS FEET. `enterStation` returns false
   * for an unreachable station too, so a refusal measured mid-posture would
   * pass for the wrong reason: the walking pose is restored above, and the
   * posture is read back after to prove nothing sat him down. */
  const pokerPlayed = enterStation('poker');
  const pokerPosture = state.posture;

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
      /* The poker table answers instead of dealing. */
      poker: {
        played: pokerPlayed,
        posture: pokerPosture,
        line: LUXURY_POKER_REFUSAL.line,
        patrons: home.poker.patrons.length,
      },
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
  /* The canonical input Adapter, for the browser gates: `input.snapshot()` is
   * the one place that answers "is he captured, enabled, and moving" without
   * re-deriving it from the DOM. */
  get input() { return browserInput; },
  audio,
  time,
  state,
  inventory: home.inventory,
  phone,
  tv,
  radio,
  pcArcade,
  cabinetArcade,
  darts,
  toilet,
  crookedArtRuntime: crookedArt,
  answeringMachineRuntime: answeringMachine,
  revolverRuntime: revolver,
  highs,
  focusRush,
  firstPersonBody,
  appearanceStore,
  readyTally,
  margoScene: luxuryMargo,
  outfits: LUXURY_OUTFITS,
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
      syncInput('teleport');
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
    cigarettes: useCigarettePack,
    elevator: useElevator,
    ready(taskId) {
      const changed = readyTally.complete(taskId);
      if (home?.state && Object.hasOwn(home.state, taskId)) home.state[taskId] = true;
      refreshLuxuryObjective({ toast: true });
      return changed;
    },
  },
  debug: {
    pcApps: pcArcade.apps.map((app) => ({ id: app.id, title: app.title ?? app.name ?? app.id })),
    margo: {
      checkpointIds: Object.freeze({ ...LUXURY_MARGO_CHECKPOINT_IDS }),
      stage: (id) => luxuryMargo.debug.stageCheckpoint(id),
      clear: () => luxuryMargo.debug.clearCheckpoint(),
      report: () => luxuryMargo.debug.snapshot(),
    },
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
