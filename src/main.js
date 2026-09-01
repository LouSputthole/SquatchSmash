/**
 * Squatch Life -- entry point.
 *
 * Boots the renderer, builds the apartment, and owns the top-level state
 * machine: title -> in bed -> walking around -> seated at the PC.
 *
 * "Squatch Smash" is the arcade game on the desk PC, not this. See
 * src/arcade/ for that one.
 */
import * as THREE from 'three';
import { ApartmentAudioEngine, closedNightCuePrefixes } from './core/apartment-audio.js';
import { chooseNoImmediateRepeat } from './core/audio-variant-bank.js';
import { Hud } from './core/hud.js';
import { InteractionSystem } from './core/interaction.js';
import { createFirstPersonInput } from './core/first-person-input.js';
import { Player } from './core/player.js';
import { shakeScale } from './core/settings.js';
import { attachPixelRatio } from './core/pixel-ratio.js';
import { PlanarMirror } from './core/planar-mirror.js';
import { FirstPersonBody, createPlayerAppearanceStore } from './core/first-person-body.js';
import { Radio, radioHudWithinRange } from './core/radio.js';
import { SPOOKY_RADIO_LINES, newsSegmentsFor, voiceOf as radioVoiceOf } from './core/stations.js';
import { Narrator } from './core/narrator.js';
import { buildApartment } from './world/apartment.js';
import {
  APARTMENT_MARGO_ENTRY_DOOR_YAW,
  APARTMENT_MARGO_GEOMETRY_STAGES,
  stageApartmentMargoGeometry,
} from './world/apartment-preview-geometry.js';
import { cashPilesForCampaign, persistentDressingForCampaign } from './world/dressing.js';
import { createArcade } from './arcade/mount.js';
import { Drunk, BEER_UNITS, WHISKEY_UNITS } from './core/drunk.js';
import { Highs } from './core/highs.js';
import { FocusRush } from './core/focus-rush.js';
import { Goals, ENDINGS, MEETING, CS_ROUNDS } from './core/goals.js';
import { Chat } from './core/chat.js';
import { Spooky } from './core/spooky.js';
import { PostFX } from './core/postfx.js';
import { BulletHoles } from './world/bullets.js';
import { Tv } from './core/tv.js';
import { Phone, loadAsRecordedCaptions } from './core/phone.js';
import { phoneThreadsForCampaign } from './core/phone-content.js';
import { ITEMS } from './core/inventory.js';
import {
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENES,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  createCampaignRadioAdapter,
  navigateCampaign,
} from './core/campaign.js';
import {
  buildCampaignCareerRecap,
  enterCampaignFreeplay,
  shouldPresentCampaignFinale,
} from './core/campaign-finale.js';
import { createCampaignFinaleView } from './core/campaign-finale-view.js';
import { createCampaignCreditsView } from './core/campaign-credits-view.js';
import { BEAT_S, ColdOpen, monitorFillDistance } from './core/cold-open.js';
import { isPreviewMode, previewBeatForLocation, previewNavigationHref } from './core/preview-mode.js';
import {
  apartmentReturnSource,
  BIG_NIGHT_MARGO_WAKE,
  SILVER_ROOM_COME_HOME,
  SILVER_ROOM_DRESS_ASK,
  HEIST_CLEANUP_ITEMS,
  HEIST_PREPARATION_ITEMS,
  SHOOT_TARGET_SCORE,
  SMASH_PLAY_SECONDS,
  SPECIAL_MEETING_ACT_ONE,
  TV_WATCH_SECONDS,
  apartmentHostsChapter,
  createApartmentStory,
  isSpecialMeetingNight,
  pastimeActivityEvents,
} from './core/apartment-story.js';
import {
  apartmentRecoveryBeatId,
  createApartmentRecoverySkipAdapter,
} from './core/apartment-recovery.js';
import { createPauseMenu } from './core/pause-menu.js';
import { createSceneRecovery } from './core/scene-recovery.js';
import { DayNight } from './core/daynight.js';
import { SmokeSystem, emitCigaretteExhale } from './world/smoke.js';
import { createBongBehavior } from './world/bong.js';
import { StreamSystem } from './world/stream.js';
import { ShowerSystem } from './world/shower.js';
import { SplatSystem } from './world/splat.js';
import { TimingBar } from './core/timingbar.js';
import {
  createDressHelpSequence,
  DRESS_HELP_CUES,
  DRESS_HELP_FINISH_CUE,
} from './world/dress-help.js';
import {
  makeHeldCigarette, makeHeldDrinks, poseHeldDrink, makeHeldSlice, makeRevolver, makePhone,
} from './world/props.js';
import { makeMaterials } from './world/materials.js';
import { roomEnvironment } from './world/textures.js';
import { createApartmentInputPolicy } from './apartment-controls.js';
import { knownProspectOutfitId, makeProspectFigure, prospectFaceUrl } from './core/prospect-body.js';

const DRINK_TIME = 2.4;
const SWIG_TIME = 1.7;   // whiskey goes down faster, for better or worse

/* Smoking beats, in seconds from the moment you hold F. */
const CIG_SHOW = 0.34;
const CIG_DRAG = 0.46;
const CIG_EXHALE = 1.55;
const CIG_DONE = 2.40;
const CIG_AFTERGLOW = 4.20;

/* Stable appearance ids are shared with the Cabin and Luxury Apartment via
 * the canonical table in `src/core/prospect-body.js` -- one Tony in every
 * mirror. This apartment still preserves its three long-standing shirt
 * choices for saves made here. */
const APARTMENT_SHIRT_OUTFIT = Object.freeze({
  'black shirt': 'black_henley',
  'grey henley': 'grey_henley',
  'good shirt': 'good_shirt',
});

const apartmentAppearanceStore = createPlayerAppearanceStore({ fallback: 'charcoal_suit' });
const storedApartmentOutfitId = apartmentAppearanceStore.read();
const initialApartmentOutfitId = knownProspectOutfitId(storedApartmentOutfitId) === storedApartmentOutfitId
  ? storedApartmentOutfitId
  : apartmentAppearanceStore.write('charcoal_suit');

function buildApartmentPlayerBody(outfitId) {
  return makeProspectFigure(outfitId, { name: 'apartment-player-reflection-body' });
}

const canvas = document.getElementById('scene');
const fxDrunk = document.getElementById('fx-drunk');
const fxHigh = document.getElementById('fx-high');
const blackout = document.getElementById('blackout');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startBtn = document.getElementById('start-btn');
const assetStatus = document.getElementById('asset-status');
const campaignFinaleView = createCampaignFinaleView();
/* The ending. The recap card offers it; the crawl covers everything, fades the
 * screen to black first, and can always be left with Escape. */
const campaignCreditsView = createCampaignCreditsView();
campaignFinaleView.setRollCreditsHandler(() => campaignCreditsView.roll());

/* ------------------------------------------------------------------ */
/* THE COLD OPEN                                                       */
/*                                                                     */
/* See src/core/cold-open.js. The short version: on a brand new         */
/* campaign the game opens INSIDE Squatch Smash, full screen, with the  */
/* apartment already built and running behind it and the camera parked  */
/* against the monitor. Quitting Squatch Smash pulls the camera off the */
/* screen, and that is the first thing the player learns about this     */
/* game.                                                               */
/* ------------------------------------------------------------------ */
const coldOpen = new ColdOpen();
/** True from boot until the pull-back has landed him in the chair. */
let coldOpenActive = false;
/** True only while a confirmed game Quit automatically leaves the desk. */
let automaticDeskExitStanding = false;
/** Scratch, so the dolly does not allocate sixty vectors a second. */
const _coldOpenEye = new THREE.Vector3();
const _coldOpenLook = new THREE.Vector3();
const _coldOpenUp = new THREE.Vector3();
const _coldOpenNormal = new THREE.Vector3();
const _coldOpenCentre = new THREE.Vector3();
const _coldOpenMonitor = new THREE.Vector3();
const viewCareerRecapBtn = document.getElementById('view-career-recap-btn');
const restartCampaignBtn = document.getElementById('restart-campaign-btn');
const restartCampaignConfirm = document.getElementById('restart-campaign-confirm');
const restartCampaignConfirmBtn = document.getElementById('restart-campaign-confirm-btn');
const restartCampaignCancelBtn = document.getElementById('restart-campaign-cancel-btn');

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */

/* WebGL is the one hard requirement, and it is not always there -- an old
 * phone, a locked-down frame, a machine with the GPU blocklisted. This runs
 * at module top level, so throwing here would leave the loading screen
 * sweeping forever with nothing to explain it. Say what happened instead. */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
} catch (err) {
  window.__squatchFail?.(
    'This device cannot run the apartment',
    'It needs WebGL, and the browser would not give us a context. '
    + 'On a phone this usually means low power mode; in an embedded page it '
    + 'usually means the frame is not allowed one. Opening it in a normal '
    + 'browser tab is the fix. ' + (err?.message || ''),
  );
  throw err;
}
attachPixelRatio(renderer);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.Fog(0x0d1018, 14, 34);

// Metals need something to reflect or they render black. One small procedural
// room capture, prefiltered once, and every chrome fitting in the apartment
// starts behaving like metal.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const src = roomEnvironment();
  scene.environment = pmrem.fromEquirectangular(src).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  src.dispose();
}

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 60);
scene.add(camera);

// Handheld light for poking around with the blinds down.
const flashlight = new THREE.SpotLight(0xfff2d8, 0, 9, 0.42, 0.5, 1.6);
flashlight.position.set(0, 0, 0);
flashlight.target.position.set(0, 0, -1);
camera.add(flashlight, flashlight.target);

/* Bloom. On by default; [B] turns it off, because it is the first thing to
 * drop on a machine that is struggling and there is no menu to drop it from. */
const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
postfx.onAuto = () => hud.toast('Bloom off — it was costing too much. [B] to force it on.', '');

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ */
/* Systems                                                             */
/* ------------------------------------------------------------------ */

const audio = new ApartmentAudioEngine();
const hud = new Hud();
const interaction = new InteractionSystem(camera, hud);
const world = { colliders: [], floorZones: [] };
const player = new Player(camera, world);

player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

const time = new DayNight(6 + 4 / 60);
const campaign = createCampaign();
const campaignAtLoad = campaign.state;
const campaignFinaleRecapAtLoad = shouldPresentCampaignFinale(campaignAtLoad)
  ? buildCampaignCareerRecap(campaignAtLoad) : null;
campaignFinaleView.setContinueHandler(({ replay }) => {
  try {
    if (!replay) {
      const transition = enterCampaignFreeplay(campaign);
      if (!transition.applied && transition.reason !== 'already_freeplay') {
        throw new Error('Campaign completion is not ready for freeplay');
      }
    }
  } catch (error) {
    campaignFinaleView.showError(
      error?.message || 'Could not save freeplay. Your completed campaign is still intact.',
    );
    return;
  }
  campaignFinaleView.hide();
  startBtn.textContent = replay ? 'Resume' : 'Enter Freeplay';
  startBtn.click();
});
/* A save that had to be recovered is worth saying out loud -- but not here,
 * which is what this used to do. The notice went up 200ms into module scope,
 * behind a full-screen title card he has not clicked through yet, and its
 * twelve seconds ran out several seconds before the apartment had finished
 * building. It was a message nobody could ever have read. Held instead until
 * he is actually in the room, which is where the other on-arrival toasts are.
 */
const recoveryNotice = campaign.recoveredNow
  ? (campaign.recovery?.reason === 'unsupported_version'
    ? 'Newer save preserved · this build will not overwrite it'
    : 'Save recovered · previous data kept in browser recovery backup')
  : null;
const returningToApartment = campaignAtLoad.scene.id === SCENE_IDS.APARTMENT
  && campaignAtLoad.scene.spawn === 'front_door';
const returnSource = apartmentReturnSource(campaignAtLoad);
const returningFromHeist = returnSource === SCENE_IDS.BANK_HEIST;
const returningFromGolf = returnSource === SCENE_IDS.SILVER_PINES;
const returningFromBing = returnSource === SCENE_IDS.BADA_BING_ONE;
const returningFromSilver = returnSource === SCENE_IDS.SILVER_ROOM;
const returningFromNoWake = returnSource === SCENE_IDS.NO_WAKE;
const returningFromMotel = returnSource === SCENE_IDS.JERKY_MOTEL;
const returningFromAirstrip = returnSource === SCENE_IDS.AIRSTRIP_SMUGGLING;
const returningFromSquatchfather = returnSource === SCENE_IDS.SQUATCHFATHER;
const returningFromInitiation = returnSource === SCENE_IDS.INITIATION;
const returningFromPalace = returnSource === SCENE_IDS.CARTEL_PALACE;
/**
 * THE SPECIAL MEETING, ACT ONE — whether this flat is playing it.
 *
 * Beats SM-010 to SM-090 of `docs/SPECIAL-MEETING-SCRIPT.md` all happen in
 * here: the idle lines of a man nobody has rung, Booskibro's call, the dead
 * line afterwards, ringing him back and getting nothing, getting dressed for
 * something he has not been told about, the door refusing him, and headlights
 * on the ceiling with an engine that never switches off.
 *
 * Read once, at load, off the save as it arrived -- `isSpecialMeetingNight`
 * asks the campaign whether the Cartel Palace was genuinely played and the
 * Initiation is still ahead, and neither of those can change while he is
 * standing in this room. Everything Act One does is gated on this constant, so
 * a night that is not this one pays for it with one boolean.
 */
const specialMeetingNight = isSpecialMeetingNight(campaignAtLoad);
const apartmentGunUnlocked =
  campaignAtLoad.missions[MISSION_IDS.BADA_BING_ONE].packageReceived === true;
const wakingOnDayTwo = !returningToApartment
  && campaignAtLoad.story.chapter === 'day_two';
const wakingOnNoWake = !returningToApartment
  && campaignAtLoad.story.chapter === 'no_wake';
const wakingOnDate = !returningToApartment
  && campaignAtLoad.story.chapter === 'date';
const wakingOnBigNight = !returningToApartment
  && campaignAtLoad.story.chapter === 'big_night';
const wakingOnGolfMorning = !returningToApartment
  && campaignAtLoad.story.chapter === 'golf_morning';
const wakingOnHeistDay = !returningToApartment
  && campaignAtLoad.story.chapter === 'heist_day';
if (campaignAtLoad.scene.id !== SCENE_IDS.APARTMENT) {
  if (apartmentHostsChapter(campaignAtLoad.story.chapter)) {
    campaign.enter(SCENE_IDS.APARTMENT, { spawn: 'wake' });
  } else {
    /* A final-arc save. From The Silver Case to the Palace the player lives
     * at Lou's; the flat has no plan, no door copy, and no objectives for
     * those chapters, and claiming the save here -- which is what this page
     * did unconditionally -- was a durable soft-lock: the scene pointer was
     * overwritten to a flat that could not host it, reachable from a shipped
     * siege end-card link, a bookmark, or the back button. Send the save back
     * to its own scene instead, and write nothing. */
    globalThis.location?.replace?.(SCENES[campaignAtLoad.scene.id]?.href ?? 'index.html');
  }
}
/* The Squatchfather's return leg.
 *
 * That scene is frozen and keeps no clock, so nothing anywhere put an hour on
 * the restaurant: he left for the Bing at 11:41 PM and let himself back in at
 * 11:41 PM, with the whole night still ahead of him and a flat that thought he
 * had just got up. Applied here, before the clock is read, and idempotent --
 * `advanceTime` records the event id, so reloading the flat at three in the
 * morning does not walk it forward again. */
if (returningFromSquatchfather) {
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER);
}
time.setTime(campaign.state.story.day, campaign.state.story.timeMinutes);
if (wakingOnDayTwo) {
  overlay.querySelector('.tag').textContent =
    'Day Two, 7:00 AM. Booskibro has the next job. The phone is on the nightstand.';
} else if (wakingOnNoWake) {
  overlay.querySelector('.tag').textContent =
    'Day Three, 12:00 PM. Grey water weather. Lou said he would call.';
} else if (wakingOnDate) {
  overlay.querySelector('.tag').textContent =
    'Day Three, 12:00 PM. Nothing on today. She said she would ring.';
} else if (wakingOnBigNight) {
  overlay.querySelector('.tag').textContent =
    'Day Four, 10:00 AM. Tonight is the big night. Booskibro will call about it.';
} else if (wakingOnGolfMorning) {
  overlay.querySelector('.tag').textContent =
    'Day Six, 7:00 AM. Silver Pines at eight. Lou gave you the time last night.';
} else if (wakingOnHeistDay) {
  overlay.querySelector('.tag').textContent =
    'Day Five, 12:00 PM. THE TAKE is today. Lou said he would call.';
}
// One station, several physical receivers. The running order follows the
// campaign while this apartment keeps its own power switch.
const radio = new Radio(audio, hud, time, {
  state: createCampaignRadioAdapter(campaign, {
    receiverId: 'apartment',
    defaultPower: true,
  }),
  canPlayNotice: () => campaign.state.story.chapter === 'day_one',
  /* The apartment is where the news catches up with him: after each
   * newsworthy job, the desk's segment about it joins this receiver's
   * rotation (stations.js gates every segment on the mission's own durable
   * state, so nothing airs before its event). Read live rather than snapshot,
   * so a save that advances mid-session is reported on the same evening. */
  news: () => newsSegmentsFor(campaign.state),
  /* The receiver keeps playing as Tony crosses the flat, but its station card
   * is local furniture, not permanent mission HUD. Use the same shared useful
   * range as the radio audio and let Radio clear/restore the
   * card on the distance edge. */
  hudVisible: () => radioHudWithinRange(camera?.position, apartment?.radioPos),
});
const DAY_TWO_CALL_AFTER_BULLETIN = 20;
// Nothing happens in here. Somebody should say so.
const narrator = new Narrator(hud, time, audio);
const drunk = new Drunk();
// The coffee table's contribution. Neither of these costs you Wednesday.
const highs = new Highs();
// The Bada Bing line's exact timing/FOV/movement curve, reused by the flat.
const focusRush = new FocusRush({ baseFov: camera.fov });
// The only goal in the game, and it never announces itself.
const goals = new Goals(time);
goals.known = campaign.state.story.meetingKnown;
goals.learnedFrom = campaign.state.story.meetingLearnedFrom;

/*
 * The flat, once you are far enough gone.
 *
 * Every one of these is deniable -- a door that was probably already like
 * that, a light doing what old wiring does, somebody upstairs. Nothing is ever
 * confirmed and nothing is ever in the room with you, which is the only way it
 * stays funny instead of turning into a different game. His lines are all
 * "did that just", never "there is something in here".
 */
const spooky = new Spooky({
  door: () => {
    const d = apartment.bathDoorPivot;
    if (!d) return false;
    // Swings a few degrees on its actual hinge and stops. The apartment owns
    // the base open/closed angle, so this effect is an offset instead of a
    // rotation on the whole door group that prevents it closing afterward.
    const from = apartment.getBathDoorNudge?.() ?? 0;
    const base = apartment.state.bathDoorOpen ? 1.85 : 0;
    const to = from + (Math.abs(base + from) > 0.4 ? -0.34 : 0.42);
    const t0 = performance.now();
    const swing = () => {
      const k = Math.min(1, (performance.now() - t0) / 1900);
      apartment.setBathDoorNudge?.(from + (to - from) * (k * k * (3 - 2 * k)));
      if (k < 1) requestAnimationFrame(swing);
    };
    swing();
    audio.play('door.creak', { volume: 0.30, position: new THREE.Vector3(-1.4, 1.2, -4.2), muffle: 900 });
    audio.say('spooky', { chance: 0.55, delay: 2.2 });
  },

  lights: () => {
    /* A dip, like a compressor kicking in somewhere. Nothing switches, and if
     * every light in the flat is already off there is nothing to see, so it
     * does not spend the event on an empty room. */
    if (!apartment.state.lightsOn && !apartment.state.lampOn) return false;
    apartment.dipLights(0.26, 0.24);
    audio.play('light.dip', { volume: 0.35 });
    // Twice, unevenly. Once reads as a bulb; twice reads as the building.
    setTimeout(() => apartment.dipLights(0.45, 0.16), 520);
    audio.say('spooky', { chance: 0.5, delay: 1.6 });
  },

  upstairs: () => {
    /* Somebody walks the length of the room above and stops. Six steps, and
     * the sixth does not arrive, which is worse than seven would be. */
    const pos = new THREE.Vector3(1.2, 3.4, 0.4);
    for (let i = 0; i < 5; i++) {
      audio.play('neighbours.thump', {
        position: pos, volume: 0.30 + i * 0.02, delay: i * 0.62 + Math.random() * 0.08, muffle: 130,
      });
    }
    audio.say('spooky', { chance: 0.6, delay: 4.4 });
  },

  clock: () => {
    // The tick goes out of step with itself for a few seconds.
    for (let i = 0; i < 7; i++) {
      audio.play('clock.tick', {
        volume: 0.22, delay: i * 0.52 + (i > 2 ? 0.19 : 0) + Math.random() * 0.05, rate: 0.94,
      });
    }
    audio.say('spooky', { chance: 0.4, delay: 3.0 });
  },

  radio: () => {
    // One word of something that is not on the schedule, then back to normal.
    if (!radio.on) return false;
    audio.play('radio.static', { volume: 0.30, position: apartment.radioPos });
    const [intrusion, recovery] = SPOOKY_RADIO_LINES;
    radio.broadcast({ cue: radioVoiceOf(intrusion.line)?.cue, line: intrusion.line });
    hud.say(`<em>${intrusion.line}</em>`, 2600);
    setTimeout(() => {
      radio.broadcast({ cue: radioVoiceOf(recovery.line)?.cue, line: recovery.line });
      hud.say(recovery.line, 3200);
    }, 2800);
  },
});
// Booski, typing into a server nobody is in. The second way to find out.
const chat = new Chat(time);
const smoke = new SmokeSystem(scene);
const bullets = new BulletHoles(scene);
const tv = new Tv({ audio });
// Campaign calls are one-shot story events, so the legacy clock schedule is
// deliberately disabled here. The physical phone still owns ring/answer/UI.
const phone = new Phone({
  time,
  audio,
  calls: [],
  threads: phoneThreadsForCampaign(campaign.state),
  onCallState: (connected, definition) => {
    radio.setPhoneDucked(connected);
    /* SM-040. The end of a CONNECTED call, which is the only kind Booskibro
     * ends -- he hangs up first, mid-air, without waiting. A ring-out he never
     * picked up arrives here as nothing, because `Phone.hangUp` only reports
     * the state change for a call that was actually talking. */
    if (!connected && definition?.eventId === EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL) {
      actOneCallEnded();
    }
  },
  onThreadRead: (thread) => {
    if (thread.readEventId) campaign.advanceTime(thread.readEventId);
  },
});
// Queued re-record cues caption with the words their takes actually say.
loadAsRecordedCaptions().then((captions) => phone.setAsRecordedCaptions(captions));
let phoneContentRevision = campaign.state.revision;
function syncPhoneThreads() {
  const state = campaign.state;
  if (state.revision === phoneContentRevision) return;
  phone.setThreads(phoneThreadsForCampaign(state));
  phoneContentRevision = state.revision;
}
const apartmentStory = createApartmentStory({
  campaign,
  ring: (definition) => {
    const rang = phone.ring(definition);
    if (rang) {
      const instruction = apartment?.state?.heldItem === 'phone'
        ? 'Press [E] to answer.'
        : apartment?.inventory?.has('phone')
          ? 'Select your phone, then press [E] to answer.'
          : 'Phone on the nightstand — press [E] to pick it up, then [E] to answer.';
      hud.toast(`Incoming call — ${instruction}`, 'good', 16000);
      hud.say(`<em>${definition.from} is calling.</em> ${instruction}`, 7000);
    }
    return rang;
  },
});
phone.onAnswered = (definition) => {
  const changed = apartmentStory.callAnswered(definition);
  if (changed) syncClockFromCampaign();
  return changed;
};
/* Two materials for the standby light rather than mutating one, so it is a
 * swap like every other indicator in the flat and cannot alias. */
const M_LED_ON = new THREE.MeshStandardMaterial({ color: 0x2a0b0b, emissive: 0xff3b30, emissiveIntensity: 2.2, roughness: 0.4 });
const M_LED_OFF = new THREE.MeshStandardMaterial({ color: 0x401010, roughness: 0.4 });
const stream = new StreamSystem(scene);
// Water out of the rose, for the nine seconds it is running.
const showerFx = new ShowerSystem(scene);
// Glue, once it is finally out of the bottle.
const splat = new SplatSystem(scene, -4.40);

// The lit cigarette rides on the camera, low and to the right.
/* The can and the bottle ride on the camera and tip as the hold fills. There
 * is no armature -- the animation is a lift and a rotation driven by progress,
 * which is all a first-person drink actually needs. */
const heldDrinks = makeHeldDrinks();
heldDrinks.group.position.set(0.26, -0.30, -0.42);
camera.add(heldDrinks.group);

/** Pose whichever drink is up, from 0 (at rest) to 1 (at the mouth). */
function poseDrink(which, k) {
  poseHeldDrink(heldDrinks, which, k);
}

/* The slice in hand. Same rig as the drinks, and it is the whole reason the
 * pizza felt broken: taking one emptied a wedge out of the box and put a card
 * in the corner of the HUD, and his hands stayed conspicuously empty. */
const heldSlice = makeHeldSlice();
heldSlice.group.position.set(0.235, -0.235, -0.36);
heldSlice.group.rotation.set(0.16, 0, -0.20);
camera.add(heldSlice.group);

/** Lift the slice to the mouth, 0 (at rest) to 1 (mid-bite). */
function poseSlice(k) {
  const e = k * k * (3 - 2 * k);
  heldSlice.group.position.set(0.235 - 0.150 * e, -0.235 + 0.185 * e, -0.36 + 0.10 * e);
  // Tipped up and rolled in, the way you angle a slice into your face.
  heldSlice.group.rotation.set(0.16 + 0.70 * e, -0.30 * e, -0.20 - 0.24 * e);
}

/* The revolver in hand. Same idea as the drinks: one model parented to the
 * camera, shown only while that slot is selected. Low and right, angled in,
 * so the barrel is not sitting across the crosshair. */
const heldGun = makeRevolver(makeMaterials(), { x: 0, y: 0, z: 0, rotY: 0 });
heldGun.group.position.set(0.20, -0.24, -0.30);
heldGun.group.rotation.set(0.06, -0.16, 0);
heldGun.group.scale.setScalar(1.15);
heldGun.group.visible = false;
camera.add(heldGun.group);
/** Recoil, in radians, decaying back to zero. */
let gunKick = 0;

/* The phone in hand. Held up and tipped back, the way you look at one, with
 * its own canvas on the screen. It is the same model as the one on the
 * nightstand, so what he picks up is what he is holding. */
const heldPhone = makePhone(makeMaterials(), { x: 0, y: 0, z: 0, w: 0.072 });
/* Far enough in that the whole screen is on camera. At 1.9 and further right
 * the bottom third of it hung off the edge of the frame, which is no use for
 * something you are meant to read. */
heldPhone.group.position.set(0.07, -0.10, -0.32);
heldPhone.group.rotation.set(1.20, -0.10, 0.03);
heldPhone.group.scale.setScalar(1.58);
heldPhone.group.visible = false;
camera.add(heldPhone.group);
heldPhone.screen.material = new THREE.MeshBasicMaterial({
  map: new THREE.CanvasTexture(phone.canvas), toneMapped: false,
});

const heldCig = makeHeldCigarette();
/* In the corner of his mouth: low, just off centre, close to the camera, and
 * pointing away down the view rather than lying across it. */
heldCig.group.position.set(0.055, -0.062, -0.10);
heldCig.group.rotation.set(0.06, 0.13, 0);
heldCig.group.scale.setScalar(1.25);
heldCig.group.visible = false;
camera.add(heldCig.group);

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();

let apartment = null;
let bathroomMirror = null;
let playerBody = null;

const game = {
  started: false,
  paused: false,
  seated: false,        // at the PC specifically
  sitting: null,        // 'couch' | 'bed' -- sitting for its own sake
  inBed: false,         // lay back down on purpose
  flashlightOn: false,
  drinking: 0,
  passingOut: false,
  peeing: false,
  peeTime: 0,
  onToilet: false,
  toiletPee: false,     // the bladder emptying itself while you are sat down
  poopTime: 0,
  pooped: campaign.state.activities.pooped,
  peed: campaign.state.activities.peed,
  /* How much has actually come out this session. A pee is only an errand once
   * something happened: unzipping, thinking better of it and zipping back up
   * is not a chore ticked off. */
  peeVolume: 0,
  nextPlopAt: 0,
  rumbleAt: 0,
  zynUntil: -1,
  showering: null,      // seconds into the shower, or null
  inShower: false,      // peeing in it, specifically
  cooking: null,        // seconds into the eggs, or null
  left: false,          // out of the door; the game is over
  nextFartAt: 40 + Math.random() * 60,
  fartClock: 0,
  pushLive: 0,          // index into PUSH_KEYS of the one lit right now
  pushT: 0,
  pushFlash: null,
  fartQueued: false,    // deliberate one waiting for him to stop talking
};

let browserInput = null;

/* Canvas-native desktop apps use relative pointer motion while framed apps
 * (DOOM and Squatch Smash) need an ordinary DOM mouse. Leaving pointer
 * lock for those apps is intentional and must not pause the apartment. */
const arcade = createArcade({
  audio,
  // The Beef Run is Tony's first Sasole meeting. Only later apartment visits
  // may show Sasole's follow-up email in the otherwise static inbox.
  sasoleKnown: campaignAtLoad.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status === 'complete',
  onInputModeChange(mode) {
    browserInput?.refresh(`arcade-input-${mode}`);
    if (mode === 'dom') document.exitPointerLock?.();
    else if (game.seated && game.started && !game.paused) requestLock();
  },
  /* The framed-app chrome normally returns to SquatchOS. During the opening,
   * however, revealing a desktop while leaving Tony in the chair bypasses the
   * campaign's entire first transition. Click and both held-Tab routes now
   * enter the same state machine as Squatch Smash's Quit / YES button. */
  onExitRequest(app) {
    if (app?.id !== 'smash' || !coldOpenActive) return false;
    coldOpen.quit();
    return true; // also consumes repeated requests while shutdown is running
  },
  exitPresentation(app) {
    if (app?.id !== 'smash' || !coldOpenActive) return null;
    return {
      label: 'QUIT SQUATCH SMASH',
      ariaLabel: 'Quit Squatch Smash',
      title: 'Quit Squatch Smash.',
    };
  },
});
const screenTexture = new THREE.CanvasTexture(arcade.canvas);
screenTexture.colorSpace = THREE.SRGBColorSpace;
screenTexture.minFilter = THREE.LinearFilter;
screenTexture.generateMipmaps = false;

/** Seconds since the objectives panel last had a look at itself. */
let objectiveClock = 0;

/** Seven of them, picked at random, never the same one twice running. */
const FART_CUES = ['fart.1', 'fart.2', 'fart.3', 'fart.4', 'fart.5', 'fart.6', 'fart.7'];
let _lastFart = -1;

/** Smoking sequence state. */
const cig = { t: -1, lit: false, exhaled: false, afterglow: 0 };

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  window.__squatchStage?.('Building the apartment…');
  apartment = await buildApartment({
    scene,
    audio,
    hud,
    interaction,
    time,
    gunUnlocked: apartmentGunUnlocked,
    /* Which morning this is. The flat used to be built the same way on every
     * one of them -- the chapter, the calls and the objectives all moved and
     * the room did not, which is the whole of "it appears it is always the
     * first day". It comes from the campaign, never from a flag of its own. */
    chapter: campaign.state.story.chapter,
    persistentDressing: persistentDressingForCampaign(campaign.state),
    /* How much money is in each pile in the flat. A function rather than a
     * value because the flat re-dresses itself on every sleep and on every
     * return from a job, and the heist's cut is not a number anybody knows
     * until the job is over. */
    cashPiles: () => cashPilesForCampaign(campaign.state),
    onNote: (what) => narrator.note(what),
    /* The phone is campaign state, not apartment state: it has to still be on
     * him at the Bing and at the airstrip, and still be on him tomorrow. */
    onPhoneTaken: () => campaign.addItem(ITEM_IDS.PHONE),
    isSeated: () => game.seated || !!game.sitting || game.inBed || game.onToilet,
    onSitPC: sitAtPC,
    onSitCouch: () => sitOn('couch'),
    onSitBed: () => sitOn('bed'),
    onLieBed: lieOnBed,
    onStartPee: startPee,
    onSitToilet: sitOnToilet,
    onZyn: takeZyn,
    onBong: hitBong,
    onShrooms: eatShrooms,
    isFocusActive: () => focusRush.remaining > 0,
    onWhiteLine: () => focusRush.start(25),
    onShower: takeShower,
    // The drawer names the shirt he settled on, so the toast can say which.
    onDressed: (shirt) => {
      const name = shirt?.name || 'clean shirt';
      const outfitId = APARTMENT_SHIRT_OUTFIT[name.toLowerCase?.() ?? ''];
      if (outfitId) playerBody?.setOutfit(outfitId);
      completeApartmentActivity('changedClothes', TIME_EVENT_IDS.CHANGE_CLOTHES);
      audio.say('dress', { chance: 0.8, delay: 0.4 });
      hud.toast(`Changed · ${name}`, 'good');
      hud.say(`The ${name}, then. <em>It even smells like a clean shirt.</em>`, 4200);
      /* SM-070, on top of the ordinary line rather than instead of it. "Put on
       * something decent" was an instruction and this is him following it, so
       * the flat behaves exactly as it does on every other morning and he is
       * the only thing in the room that has changed. */
      actOneDressed();
    },
    onCook: cookEggs,
    onEat: eatEggs,
    onLeave: tryLeave,
    onGlue: startGluing,
    onTap: () => {
      audio.say('tap', { chance: 0.8, delay: 1.4 });
      hud.say('<em>Water.</em> Good. That still works.', 4200);
    },
    onReadChat: readChat,
    onChatVisible: () => apartment.desk.repaintChat(chat),
    onLearn: (source) => learnAboutMeeting(source),
    onAmmo: (n) => {
      hud.toast(`Picked up ${n} rounds`, 'good');
      audio.say('ammo', { chance: 0.7, delay: 0.9 });
      apartment.inventory.onChange?.(apartment.inventory);
    },
    onPlayMessages: () => playMessages(),
    onTvTap: () => {
      if (!apartment.state.tvOn) {
        apartment.state.tvOn = tv.toggle();
        hud.toast(apartment.state.tvOn ? 'Telly on' : 'Telly off');
        // The other station is running his week as a story with no subject.
        if (apartment.state.tvOn) playNews('tv');
      } else {
        tv.next();
        hud.toast(tv.channel.name);
      }
    },
    onTvHold: () => {
      apartment.state.tvOn = tv.toggle();
      hud.toast(apartment.state.tvOn ? 'Telly on' : 'Telly off');
      if (apartment.state.tvOn) playNews('tv');
    },
    // The set's own LED and dial read off apartment state, so keep it honest.
    onRadioToggle: () => {
      radio.toggle();
      apartment.state.radioOn = radio.on;
      if (radio.on) playNews('radio');
    },
    onRadioTune: () => { radio.tune(); apartment.state.radioOn = radio.on; },
    radioVolume: () => radio.volumePercent,
    onRadioVolume: (direction) => {
      const volume = radio.adjustVolume(direction);
      apartment.state.radioOn = radio.on;
      hud.toast(`Radio volume ${Math.round(volume * 100)}%`);
    },
  });
  /* Glass size comes from the mounted PlaneGeometry now; the resolution
   * covers the cabinet glass filling most of the frame at arm's length. */
  bathroomMirror = new PlanarMirror(scene, apartment.mirrorMesh, {
    resolution: [512, 624],
    maxDistance: 9,
    enabled: true,
  });
  playerBody = new FirstPersonBody(scene, {
    factory: buildApartmentPlayerBody,
    store: apartmentAppearanceStore,
    outfitId: initialApartmentOutfitId,
    eyeHeight: 1.66,
  });
  // If the owner's prospect.png ever lands, the mirror adopts it on next boot.
  prospectFaceUrl().then((face) => { if (face) playerBody?.refresh(); });
  /* The view-model remains camera-owned; this second revolver exists only on
   * the mirror layer and rides the shared body's hand socket. */
  const reflectedRevolver = makeRevolver(makeMaterials(), { x: 0, y: 0, z: 0 }).group;
  reflectedRevolver.position.set(0, -0.02, 0.015);
  reflectedRevolver.rotation.set(-0.10, Math.PI, 0.08);
  reflectedRevolver.scale.setScalar(0.94);
  playerBody.setWeapon(reflectedRevolver, { visible: false });

  const savedActivities = campaign.state.activities;
  apartment.state.fed ||= savedActivities.eaten;
  apartment.state.showered ||= savedActivities.showered;
  apartment.state.dressed ||= savedActivities.changedClothes;
  apartment.state.repliedHR ||= savedActivities.emailChecked;
  if (savedActivities.pooped) apartment.state.bowel = 0;
  installHeistApartmentInteractions();

  /* The last beat of Margo's morning (and the first, coming home) is the same
   * sweeping power bar the crooked picture frame uses, and for the same
   * reason: a hold bar is a progress meter you watch, and this beat wants a
   * rhythm you are losing. Tapping the target starts it; the bar owns [E]
   * from there. `enabled` is the ONLY gate on this target -- it is registered
   * once, permanently, and stays a no-op the rest of the campaign. She is
   * standing when this becomes enabled, not kneeling: `startMargoDressHelp`
   * is what puts her down onto the fastening, on this keypress, never before
   * it. */
  interaction.register(apartment.margo.helpTarget, {
    label: () => 'Help Margo with the <b>dress</b>',
    enabled: () => game.margoScene?.awaitingHelp === true && !margoDress.active,
    onUse: () => startMargoDressHelp(),
  });

  /* Once he has pocketed the phone he has it everywhere and for good, so a
   * flat rebuilt on a later morning starts with it in a pocket and an empty
   * nightstand. Inventory.add selects a new item by design, so explicitly
   * select an empty hand afterwards: waking up should never boot into a phone
   * blocking the view. Done here rather than inside buildApartment because
   * the inventory does not exist yet at the point the nightstand is dressed. */
  if (campaign.hasItem(ITEM_IDS.PHONE) && !apartment.inventory.has('phone')) {
    apartment.inventory.add('phone');
    apartment.phoneProp.group.visible = false;
  }
  if (apartment.state.heldItem === 'phone') {
    const emptyHand = apartment.inventory.items.indexOf(null);
    if (emptyHand >= 0) apartment.inventory.select(emptyHand);
  }

  world.colliders = apartment.colliders;
  world.floorZones = apartment.floorZones;
  /* Prompts stop at walls: without this the 2.7 m ray reads the tub through
   * the bedroom/bathroom wall. The door leaves stay out of the list -- they
   * are registered targets, and the nearest hit already lets them shadow
   * whatever is behind them while staying usable themselves. */
  interaction.setOccluders(apartment.occluders);

  // Wire the arcade canvas onto the monitor. Basic material so the screen is
  // self-lit rather than depending on room lighting.
  apartment.screen.material = new THREE.MeshBasicMaterial({
    map: screenTexture,
    toneMapped: false,
  });

  stream.setColliders(apartment.colliders);
  /* Target top is the WATER, not the seat: with a real open bowl the drops
   * should fall past the rim and die where the splash is. */
  stream.setTarget(
    apartment.toiletBowl,
    apartment.toiletBowlRadius,
    apartment.toiletWaterY,
    apartment.toiletCollider,
  );

  // Third way to find out about the routine weekly meeting: leave the radio on.
  /* One place decides what the hands look like. Both the row of slots and the
   * card naming the selected thing come from the same change event, so they
   * cannot disagree about what he is holding. */
  apartment.inventory.onChange = (inv) => {
    hud.setInventory(inv, ITEMS);
    const item = inv.held ? ITEMS[inv.held] : null;
    hud.setHand(item ? { ...item, name: nameFor(inv.held, item.name) } : null);
  };
  apartment.inventory.onChange(apartment.inventory);

  /* Tap changes channel, hold switches it off -- the same tap/hold split the
   * radio uses, because they are the same gesture on the same kind of object
   * and having them disagree would be worse than either choice. */
  apartment.tv.screen.material = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(tv.canvas), toneMapped: false,
  });
  tv.position = apartment.tv.screenPos;

  radio.onNotice = () => learnAboutMeeting('radio');
  /* The inbox is the fourth way to hear about it, and the only one that asks
   * anything back: HR wants the Wednesday evening shift, which is the meeting. */
  arcade.mail.onMeeting = () => learnAboutMeeting('the boys');
  arcade.mail.onFired = () => audio.say('fired', { chance: 1, delay: 1.6 });
  arcade.mail.onReplied = () => {
    apartment.state.repliedHR = true;
    completeApartmentActivity('emailChecked', TIME_EVENT_IDS.CHECK_EMAIL);
    hud.toast('Reply sent to Goy Corp HR', 'good');
    audio.say('hr.replied', { chance: 0.9, delay: 1.1 });
  };

  window.__squatchStage?.('Tuning the radio…');
  radio.setPosition(apartment.radioPos);
  const trackCount = await radio.loadManifest();


  if (returningToApartment) {
    player.mode = 'walk';
    player.position.set(2.55, 1.66, 3.72);
    player.velocity.set(0, 0, 0);
    player.eyeHeight = 1.66;
    player.pitch = 0;
    player.yaw = 0;
    player.update(0.016);
    interaction.setPaused(false);
    /* The flat is live for calls the moment he is up and about in it, and a
     * man letting himself in through his own front door at two in the morning
     * is as up and about as one getting out of bed. This used to be wired only
     * to standing up, so a call scheduled against a RETURN -- Lou ringing to
     * say well done about the Squatchfather -- could never have landed. */
    apartmentStory.beginMorning({ delay: specialMeetingNight ? ACT_ONE_RING_DELAY : undefined });
    /* The Palace goes first, because it is the newest thing that sends him
     * home and the card says nothing about what tonight is. Nobody has told
     * him. That is the beat. */
    overlay.querySelector('.tag').textContent = returningFromPalace
      ? 'Home from the Palace. Sauce is dealt with. Nobody has said whether that was the right call.'
      : returningFromHeist
      ? 'Back from THE TAKE. Clean up, change, and put every piece of it away.'
      : returningFromGolf
        ? 'Back from Silver Pines. The round came with keys.'
      : returningFromBing
        ? 'Back from the Bing. Lou’s package is still under your jacket.'
      : returningFromSilver
        ? 'Back from the Silver Room. Sleep. The phone knows what is next.'
        : returningFromNoWake
          ? 'Back from South Harbor. Margo said she would ring about tonight.'
        : returningFromMotel
          ? 'Back from the Jerky Motel. It is half six in the morning. Go to bed.'
          : returningFromInitiation
            ? 'Home from the Initiation. The campaign is complete.'
            : 'Back from the restaurant. The business is settled.';
    startBtn.textContent = 'Go Inside';
  } else {
    player.layInBed(apartment.bedPose.position, apartment.bedPose.yaw);
    // Nothing is reachable from under the duvet.
    interaction.setPaused(true);
  }

  const realArt = apartment.frames.filter((f) => f.info.real).length;
  assetStatus.innerHTML = [
    `${trackCount} radio track${trackCount === 1 ? '' : 's'} loaded`,
    `${realArt}/${apartment.frames.length} wall slots using your own art`,
    'drop files in assets/music/ and assets/art/ — see README',
  ].join('<br>');

  window.__squatchStage?.('Ready.');
  loading.classList.add('hidden');
  if (campaignFinaleRecapAtLoad) campaignFinaleView.show(campaignFinaleRecapAtLoad);

  // Dev handle: lets you inspect and pose the scene from the console, e.g.
  //   __squatch.teleport(0, 2, 'north')
  window.__squatch = {
    scene, camera, renderer, player, apartment, arcade, audio, radio, game, interaction, hud, campaign,
    get input() { return browserInput; },
    get inputOwner() { return apartmentInputPolicy.owner(); },
    apartmentStory, apartmentReturnSource: returnSource,
    drunk, highs, focusRush, smoke, stream, showerFx, cig, time, passOut, fart, startPee, stopPee,
    hitBong, eatShrooms,
    sitOnToilet, standFromToilet, takeZyn,
    sitOn, standFromSeat, lieOnBed, sleepInBed, sitAtPC, standFromPC, getUp,
    narrator, goals, chat, postfx, takeShower, cookEggs, eatEggs, tryLeave, learnAboutMeeting,
    updateObjectives, startNewMorning, activityContext, doorTries,
    updateBowel, updatePushes, tryPush, applyDrunkFx, startGluing, updateGluing, glue, splat,
    dropHeld,
    poseDrink, heldDrinks, spooky, bullets, fireGun, reloadGun, heldGun, tv, phone, heldPhone,
    heldSlice, updateConsume,
    /* Act One, for the console and for anything driving the flat from outside
     * it. `actOneCarArrives` in particular is the only way to reach SM-090
     * without standing in the room for the length of the wait. */
    actOne, specialMeetingNight, updateActOne, ringBooskiBack, endRingBooskiBack,
    actOneCallEnded, actOneDressed, actOneCarArrives,
    playMessages, playNews, startMargoWake, finishMargoWake, updateMargoWake,
    startMargoComeHome, finishMargoComeHome, offerMargoDressHelp,
    margoDress, startMargoDressHelp, updateMargoDressHelp, abandonMargoDressHelp,
    readChat,
    /**
     * THE COLD OPEN, for the verifier.
     *
     * Everything the opening claims has to be checkable from outside: that the
     * monitor really does cover the viewport (a black band round the edge of
     * "the game" is the one tell that gives the whole thing away), that the
     * camera does not move until he quits, and that the phone does not ring
     * during the beat.
     */
    coldOpen,
    get coldOpenState() {
      const monitor = monitorCameraPose(_coldOpenMonitor);
      const rect = renderer.domElement.getBoundingClientRect();
      /* Where the monitor's four corners land in viewport space right now.
       * If the opening is doing its job these are all outside 0..1. */
      const screen = apartment.screen;
      const cover = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      if (screen) {
        screen.updateWorldMatrix(true, false);
        const geo = screen.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox;
        for (const [lx, ly] of [
          [bb.min.x, bb.min.y], [bb.max.x, bb.min.y],
          [bb.max.x, bb.max.y], [bb.min.x, bb.max.y],
        ]) {
          const v = _coldOpenEye.set(lx, ly, 0).applyMatrix4(screen.matrixWorld).project(camera);
          cover.minX = Math.min(cover.minX, v.x);
          cover.maxX = Math.max(cover.maxX, v.x);
          cover.minY = Math.min(cover.minY, v.y);
          cover.maxY = Math.max(cover.maxY, v.y);
        }
      }
      return {
        active: coldOpenActive,
        /* Diagnostics. The first run of verify:cold-open reported the dolly
         * stuck at k=0, and the machine was under four concurrent agents at
         * the time -- a starved frame loop and a stalled sequence look
         * identical from outside, so the clock and the pause flag are
         * reported rather than inferred. */
        paused: game.paused === true,
        t: coldOpen.t,
        phase: coldOpen.phase,
        pullbackK: coldOpen.pullbackK,
        seated: game.seated,
        app: arcade.app?.id ?? null,
        osMode: arcade.mode,
        overlayHidden: overlay.classList.contains('hidden'),
        radioOn: radio.on === true,
        /* The phase ledger, because the phases themselves can be atomic: on a
         * slow enough renderer shutdown is entered and left inside a single
         * update() and no outside poller can ever sample it. See
         * ColdOpen.reset()'s comment. */
        phaseLog: coldOpen.phaseLog.map((entry) => ({ ...entry })),
        /* The element's text, not the element: `hud.posture` is a DOM node
         * and a node does not survive the trip out of page.evaluate. */
        /* Whether the prompt is SHOWN, not what text it is carrying:
         * `setPosture(null)` hides the element and leaves its wording in
         * place, so reading textContent alone reports a prompt that is not on
         * screen -- which is what it did on the first run of this verifier. */
        posture: (() => {
          const el = document.getElementById('posture');
          if (!el || el.classList.contains('hidden')) return null;
          return el.textContent?.replace(/\s+/g, ' ').trim() || null;
        })(),
        /* Normalised device coordinates run -1..1, so covering the viewport
         * means the quad reaches past -1 and +1 on both axes. */
        covers: cover.minX <= -1 && cover.maxX >= 1 && cover.minY <= -1 && cover.maxY >= 1,
        cover,
        cameraToMonitor: monitor ? camera.position.distanceTo(monitor) : null,
        cameraToSeat: camera.position.distanceTo(apartment.deskPose.position),
        ringsIn: apartmentStory.started
          ? Math.max(0, apartmentStory.nextRingAt - apartmentStory.elapsed) : null,
      };
    },
    /** As though the player had clicked YES in Squatch Smash's quit box. */
    quitSquatchSmash: () => window.__SQUATCH_SMASH_HOST.quitSquatchSmash(),
    teleport(x, z, facing = 'north') {
      const yaws = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };
      // Skipping the wake-up also skips the point where interaction resumes.
      interaction.setPaused(false);
      player.mode = 'walk';
      player.pitchMin = -Math.PI / 2 + 0.05;
      player.pitchMax = Math.PI / 2 - 0.05;
      player.yawCenter = null;
      player.position.set(x, 1.66, z);
      player.velocity.set(0, 0, 0);   // or you arrive still carrying the last run
      player.eyeHeight = 1.66;
      player.pitch = 0;
      player.yaw = typeof facing === 'number' ? facing : (yaws[facing] ?? 0);
      player.update(0.016);
    },
  };
}

boot().then(() => {
  /* THE COLD OPEN, and it has to be here rather than inside `boot()`: the
   * apartment must be fully built, lit and mounted before the camera is put
   * against the monitor, because the reveal is a camera move across a room
   * that has to already exist behind the game. */
  if (coldOpenEligible()) enterColdOpen();
}).catch((err) => {
  console.error(err);
  window.__squatchFail?.('Could not build the apartment', err?.message || String(err));
});

/* ------------------------------------------------------------------ */
/* Start / pause                                                       */
/* ------------------------------------------------------------------ */

function exactDefinitionCueNames(definition) {
  if (!definition?.vo) return [];
  const cues = (definition.lines || []).map((_, index) => `vo.${definition.vo}.${index + 1}`);
  definition.replies?.forEach((reply, index) => {
    if (reply) cues.push(`vo.${definition.vo}.tony.${index + 1}`);
  });
  return cues;
}

function apartmentStartupCueNames() {
  const names = new Set([
    /* Only the receiver bed, ident and current show introduction can be heard
     * immediately. The rest of the bounded station window joins the broader
     * Apartment resident load after control opens, instead of holding the
     * post-mission Start card over dozens of later radio exchanges. */
    ...radio.preloadCueNames({ startupOnly: true }),
    'ambience.city.day', 'ambience.city.night', 'ambience.room', 'bing.line.snort',
  ]);
  for (const cue of exactDefinitionCueNames(apartmentStory.pendingCall())) names.add(cue);
  /* THE SPECIAL MEETING's Act One, all of it, on the one night it can happen.
   *
   * These are exact cues rather than a prefix because there is no `vo.
   * specialmeeting.` prefix worth loading in a flat: the same bank carries the
   * car, the trunk and the walk through the woods, and none of that is ever
   * asked for in here. What IS asked for is the idle timer, which starts
   * nineteen seconds after he is through the door -- well inside the window
   * the background load is still filling -- and a bank that has not decoded
   * yet is a line that never plays at all rather than one that plays late. */
  if (specialMeetingNight) {
    for (const bank of Object.values(SPECIAL_MEETING_ACT_ONE)) {
      for (const take of bank) names.add(take.cue);
    }
    names.add('car.engine.idle');
  }
  const news = apartmentStory.news();
  for (const bulletin of Object.values(news || {})) {
    if (bulletin?.vo) names.add(`vo.${bulletin.vo}.1`);
  }
  if (apartmentStory.margoWakeOwed() || apartmentStory.margoComeHomeOwed()) {
    for (const cue of exactDefinitionCueNames(BIG_NIGHT_MARGO_WAKE)) names.add(cue);
    for (const cue of exactDefinitionCueNames(SILVER_ROOM_COME_HOME)) names.add(cue);
    for (const cue of exactDefinitionCueNames(SILVER_ROOM_DRESS_ASK)) names.add(cue);
    names.add('cloth.snap');
    /* The dress foley belongs here too. It shipped in 8963415, but it was left
     * to arrive with the background resident bank, and `playMargoDressImpact`
     * gates on `hasSample` — a decoded buffer, not a delivered file. The whole
     * beat is over inside about twenty seconds of the Start card, so the
     * authored takes lost that race every time and the scene played its
     * `drunk.collapse` stand-in instead. Four recordings nobody could hear.
     * Shared by both scenes -- the come-home beat wants the exact same race
     * won for the exact same reason. */
    for (const cue of MARGO_DRESS_IMPACT_CUES) names.add(cue);
    // And the bar's own takes, which are the beat rather than a garnish on it.
    for (const cue of DRESS_HELP_CUES) names.add(cue);
  }
  return [...names];
}

/**
 * Is this the very first time anybody has opened this game?
 *
 * The cold open is for a player who does not yet know SQUATCH LIFE exists. It
 * is emphatically not for somebody reloading mid-campaign, coming home from a
 * scene, running an ordinary preview, or recovering a broken save -- all of
 * whom know exactly what they downloaded and would just be confused by a
 * full-screen arcade game. The bounded beat-0 preview is the one deliberate
 * exception: its whole purpose is to review this reveal, while beat 1 remains
 * an honest post-reveal apartment preview.
 */
function coldOpenEligible() {
  const previewingColdOpen = isPreviewMode()
    && previewBeatForLocation() === 'squatch_smash_intro';
  return (!isPreviewMode() || previewingColdOpen)
    && !returningToApartment
    && !recoveryNotice
    && !campaignFinaleRecapAtLoad
    && campaign.state.story.chapter === 'day_one'
    && apartmentStory.pendingCall()?.eventId === EVENT_IDS.LOU_FIRST_CALL;
}

/**
 * Open the game inside Squatch Smash.
 *
 * The apartment is built, lit and running behind this the whole time -- it has
 * to be, because the reveal is a camera move across a room that must already
 * exist. What the player gets is the desk chair, the machine on, Squatch Smash
 * launched and focused, and the camera hard against the monitor.
 */
function enterColdOpen() {
  coldOpenActive = true;
  coldOpen.reset();
  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  game.started = true;

  /* Seated, but silently: no chair sounds, no "get up from the desk" prompt,
   * and no hint in the HUD. As far as the player is concerned there is no
   * room and no chair. `sitAtPC` would announce all three. */
  game.seated = true;
  browserInput?.clear('cold-open-seat');
  interaction.setPaused(true);
  hud.setMode('seated');
  hud.setPosture(null);
  /* The seat tween runs, and is invisible: the cold-open camera override
   * below owns the view until the pull-back lands, by which point he is
   * genuinely sitting in the chair the room thinks he is in. */
  player.sitAt(seatedPose(apartment.deskPose), () => {});
  apartment.setPcOn(true);
  arcade.boot();
  /* Straight past the boot log. A player who sees SquatchOS start up has been
   * told there is a computer, which is the one thing this opening withholds. */
  arcade.skipBoot();
  arcade.launchById('smash');
  arcade.setSeated(true);
}

/**
 * The camera has started to come off the monitor.
 *
 * The room announces itself with sound as it announces itself with picture:
 * the room tone starts on the first frame of movement, and the radio joins
 * during the pull-back -- as soon as its voice bank has decoded -- so the
 * station introduces itself out loud rather than mouthing its ident into an
 * empty buffer table. Everything else stays quiet.
 */
function runColdOpenReveal() {
  audio.init().then(async () => {
    audio.startLoop('ambience.room', { volume: 0.07, ambience: true });
    /* The cold open is a third way into the flat, and it has to do the Start
     * button's audio work itself: `enterColdOpen` set `game.started`, so the
     * click handler's decode block will never run in this session. Without
     * this, `audio.buffers` stays empty for the whole run and every recorded
     * line -- Lou's first call included -- falls through to a synth that has
     * no recipe for a voice. */
    const startup = await audio.loadStartup({ names: apartmentStartupCueNames() });
    console.info(`[sfx] ${startup.loaded}/${startup.total} startup samples loaded.`);
    audio.startLoop('ambience.city.day', { volume: 0.0, ambience: true, fade: 2 });
    audio.startLoop('ambience.city.night', { volume: 0.0, ambience: true, fade: 2 });
    /* The radio waits the extra beat for its own voice bank, so the station
     * gets to introduce itself out loud instead of mouthing its ident into an
     * empty buffer table. The room tone above already made the first frame of
     * movement sound like a place. */
    if (!radio.on) radio.turnOn({ remember: false });
    void audio.loadManifest()
      .then((sfx) => console.info(
        `[sfx] ${sfx.loaded}/${sfx.total} Apartment samples resident; the rest are synthesised.`,
      ))
      .catch((error) => console.warn('[sfx] Apartment background load failed', error));
  }).catch(() => { /* no audio yet; the reveal is not held up for it */ });
}

/**
 * The reveal lands at the chair, then carries him straight back onto his feet.
 *
 * Owner, 2026-08-27: "when you quit Squatch Smash don't make me hit Q to stand
 * up — just back me out of the computer." The pull-back still reaches the
 * seated pose so the fake-out lands spatially, but quitting the game is now the
 * whole exit gesture: the shared desk transition hides the frame, restores
 * apartment input and walks him to the authored desk exit without another key.
 * Squatch Smash is also closed back to SquatchOS, rather than leaving its
 * shutdown card waiting to reappear the next time he sits down.
 *
 * The forty seconds of silence still come from `beginMorning`'s existing ring
 * delay, not a second timer, so exactly one clock decides when Lou rings.
 */
function exitSquatchSmashDesk() {
  const squatchSmash = arcade.appById?.('smash');
  automaticDeskExitStanding = true;
  standFromPC();
  arcade.toDesktop();
  /* This is a confirmed Quit, not an ordinary stand-up. Throw the framed
   * session away so its shutdown card cannot be waiting next time. The desk
   * exit itself does not depend on this optional cleanup: even a damaged app
   * session must never be allowed to keep the player in the chair. */
  squatchSmash?.closeSession?.();
  return true;
}

function endColdOpen() {
  coldOpenActive = false;
  exitSquatchSmashDesk();
  apartmentStory.beginMorning({ delay: BEAT_S });
}

/** What the embedded Squatch Smash calls when the player confirms quitting. */
window.__SQUATCH_SMASH_HOST = {
  quitSquatchSmash() {
    if (coldOpenActive) {
      coldOpen.quit();
      return true;
    }
    /* Owner, 2026-08-29: "I can't get up from the fucking desk." The old
     * host accepted confirmed Quit only while the pristine-save cold-open
     * flag was live. Existing saves reached this same iframe and this same
     * YES button, got `false`, and stayed forever on its shutdown card. Quit
     * now means leave the computer on every embedded desk session. */
    return exitSquatchSmashDesk();
  },

  /* [Q], FROM INSIDE THE FRAME.
   *
   * The apartment's own key handler promises "[Q] is the one exception: the
   * stand-up key works everywhere", and while Squatch Smash is up that was
   * not true: the iframe owns the keyboard, so the parent never saw the key
   * at all. Owner, 2026-08-27: *"at the beginning you still can't get up. It
   * needs to pan out. Q doesn't work to get you up."* He was pressing it into
   * a game that has no Q, and the pull-back only ever ran off the quit box he
   * had not found.
   *
   * During the cold open Q IS the quit: it starts the shutdown, the camera
   * pulls back off the monitor, and `endColdOpen` puts him on his feet when
   * it lands -- so one key gets both halves of what he asked for. At any
   * later sitting there is no reveal to play and it is the plain stand. */
  standUp() {
    if (coldOpenActive) return coldOpen.quit();
    if (!game.seated) return false;
    standFromPC();
    return true;
  },
  /* THE ONE THING THE EMBEDDED GAME NEEDS TO KNOW ABOUT US.
   *
   * While the cold open is running the player believes Squatch Smash is a game
   * he downloaded, and its pause menu must not offer him Export save / Import
   * save for a campaign he has not been told about. It asks; this answers.
   * Deliberately narrow: the game learns whether the fake-out is live, and
   * nothing else about the apartment. */
  coldOpenActive: () => coldOpenActive === true,
};

startBtn.addEventListener('click', async () => {
  if (game.left) return;          // the ending card owns the button now
  await audio.init();
  /* Decode only sounds that can happen automatically during the opening beat,
   * including this exact radio hour. The broader Apartment library fills in
   * behind play instead of holding the Start card over hundreds of optional
   * activity/PC recordings. */
  if (!game.started) {
    const startup = await audio.loadStartup({ names: apartmentStartupCueNames() });
    console.info(`[sfx] ${startup.loaded}/${startup.total} startup samples loaded.`);
  }

  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  requestLock();

  if (!game.started) {
    game.started = true;
    // First thing he sees, if it happened at all.
    if (recoveryNotice) hud.toast(recoveryNotice, 'bad', 12000);
    audio.startLoop('ambience.city.day', { volume: 0.0, ambience: true, fade: 2 });
    audio.startLoop('ambience.city.night', { volume: 0.0, ambience: true, fade: 2 });
    audio.startLoop('ambience.room', { volume: 0.07, ambience: true });
    /* THE SPECIAL MEETING, Act One, opens here.
     *
     * The narrator goes quiet for the whole of it -- see the Act One section
     * for why one idle voice is better than two -- and the car is put on the
     * road if he is arriving into an evening whose call has already been taken,
     * which means a reload rather than a fresh walk through the front door.
     * A player who refreshed the page mid-wait gets his headlights back
     * quickly instead of serving the whole wait again. */
    if (specialMeetingNight) {
      narrator.enabled = false;
      if (specialMeetingCallTaken()) {
        actOne.hungUp = true;
        actOne.carIn = ACT_ONE_CAR_WAIT_RESUMED;
      }
    }
    if (returningToApartment) {
      if (returningFromPalace) {
        /* No toast. Every other homecoming in this flat gets a green banner
         * saying what he pulled off, and this one is a man standing in his own
         * front room with nobody's opinion of it. The line names the thing he
         * did and stops, exactly where the evening stops. */
        hud.say('Home. Sauce is dealt with. <em>Nobody has rung.</em>', 5200);
      } else if (returningFromInitiation) {
        hud.toast('Campaign complete · freeplay unlocked', 'good');
        hud.say('Home. The week is over. <em>The apartment is yours.</em>', 5200);
      } else if (returningFromHeist) {
        hud.toast('All six made it home', 'good');
        /* The bible's ruling on beat 11.5: the job is what earns the upgrade,
         * so the call reads as the reward. The old line said "Then the Bing"
         * -- the pre-final-arc route, retired two spines ago. */
        hud.say('Home. Wash it off, change, and hide the gear. <em>Lou said he would call.</em>', 5200);
      } else if (returningFromGolf) {
        hud.toast('Three holes at Silver Pines', 'good');
        /* Legacy leg: the round hands him the keys and beat 14 moves him up,
         * so on the canonical route he never opens this door again. A
         * grandfathered save that does gets the truth, not "one job left
         * before seven" -- an hour from a route where golf preceded the bank. */
        hud.say('Home from the course. <em>The new place is real, and the keys are yours.</em>', 5200);
      } else if (returningFromBing) {
        hud.toast('Lou’s package · inside your jacket', 'good');
        hud.say('Home again. The package came back with you.', 4800);
      } else if (returningFromSilver) {
        /* The one time he comes home from something that was not work. The
         * campaign knows how the evening went; the door only says that it did.
         *
         * SCENE 9. When she actually came home with him, the toast-and-line
         * every other return gets is replaced by the scene itself -- a
         * caption describing a cutscene that is about to play anyway is a
         * caption over nothing. */
        if (apartmentStory.margoComeHomeOwed()) {
          startMargoComeHome();
        } else if (apartmentStory.margoHomeForTheNight()) {
          /* A reload the same night, after the scene already played this
           * session: she is already helped out of it and asleep, so land her
           * there directly rather than replay a walk to a bed she is already
           * in. */
          apartment.margo.setPose('lying');
          apartment.margo.group.visible = true;
          hud.toast('Margo is asleep', '');
          hud.say('Home again. She is already asleep.', 3600);
        } else {
          const date = campaignAtLoad.missions[MISSION_IDS.SILVER_ROOM];
          hud.toast(date.seeingHerAgain
            ? 'She is seeing you again'
            : 'The evening is over', date.seeingHerAgain ? 'good' : '');
          hud.say(date.seeingHerAgain
            ? 'Home. And she said yes to the next one. <em>Tomorrow is the other thing.</em>'
            : 'Home. That went how it went. <em>Tomorrow is the other thing.</em>', 4800);
        }
      } else if (returningFromNoWake) {
        hud.toast('NO WAKE', '');
        hud.say('Home. The boat is clean. <em>The phone will ring when it rings.</em>', 5200);
      } else if (returningFromMotel) {
        hud.toast('The jerky run is done', 'good');
        hud.say('Home. Every bit of that took all night. <em>Bed.</em>', 4800);
      } else if (returningFromAirstrip) {
        hud.toast('8:30 PM · The Beef Run is home', 'good');
        hud.say(
          'Home from the airfield. The plane and cargo made it back. <em>Lou said he would call.</em>',
          5200,
        );
      } else if (returningFromSquatchfather) {
        hud.toast('The business is settled', 'good');
        hud.say('Home again. The weapon did not come back with you.', 4800);
      }
      if (radio.preferredOn) {
        radio.turnOn({ remember: false });
        apartment.state.radioOn = radio.on;
        playNews('radio');
      }
    } else {
      audio.play('bed.rustle', { volume: 0.5 });
      audio.say('wake', { delay: 1.1 });
      /* The set was already on when you went to sleep -- nobody in this flat has
       * ever deliberately turned a radio off. It also means the station gets to
       * introduce itself rather than wait to be discovered. Holding [E] on it
       * turns it off if you want the quiet. Started here rather than at boot
       * because the AudioContext does not exist until the first gesture. */
      startMorningRadio();
      hud.say('<em>6:04 AM.</em> You are awake. That was not the plan.', 5200);
      /* Except on the fourth morning, when he is not the only one awake. He
       * is free to get up and walk off the moment his eyes open -- see
       * `startMargoWake`'s own doc comment -- so this does not wait for the
       * scene to hand control back; there is no moment it had it. */
      if (apartmentStory.margoWakeOwed()) startMargoWake();
      else {
        setTimeout(() => {
          if (player.mode === 'bed') hud.showPrompt('Get <b>up</b>', 'E');
        }, 3600);
      }
    }
    void audio.loadManifest()
      .then((sfx) => console.info(
        `[sfx] ${sfx.loaded}/${sfx.total} Apartment samples resident; the rest are synthesised.`,
      ))
      .catch((error) => console.warn('[sfx] Apartment background load failed', error));
  }
  game.paused = false;
  browserInput?.refresh('start-ready');
  radio.resume();
});

function requestLock() {
  return browserInput?.requestPointerLock() ?? false;
}

function enableInput() {
  game.paused = false;
  document.body.classList.remove('unlocked');
  overlay.classList.add('hidden');
  hideCampaignRestart();
  browserInput?.refresh('enable-input');
}

function paintInputCapture({ captured = false } = {}) {
  const computerDomInput = game.seated && arcade.inputMode === 'dom';
  document.body.classList.toggle('unlocked', !captured && !computerDomInput);
}

/* The wheel picks the next thing he is carrying. Only while the pointer is
 * locked, so it cannot fire while somebody is scrolling the page around it. */
window.addEventListener('wheel', (e) => {
  if (!document.pointerLockElement || game.seated) return;
  if (apartment?.state?.heldItem === 'phone' && (phone.screen === 'messages' || phone.screen === 'thread')) {
    phone.cycle(e.deltaY > 0 ? 1 : -1);
    return;
  }
  apartment?.inventory?.cycle(e.deltaY > 0 ? 1 : -1);
}, { passive: true });

function pauseGame() {
  game.paused = true;
  radio.pause();
  browserInput?.refresh('manual-pause');
  overlay.classList.remove('hidden');
  overlay.querySelector('h1').innerHTML = 'PAUSED<span>SQUATCH LIFE</span>';
  overlay.querySelector('.tag').textContent = game.seated
    ? 'Still at the desk. The meeting is not until tomorrow.'
    : 'The fridge is not going anywhere.';
  startBtn.textContent = 'Resume';
  viewCareerRecapBtn.classList.toggle(
    'hidden',
    campaign.state.finale?.freeplayUnlocked !== true,
  );
  restartCampaignBtn.classList.remove('hidden');
}

function hideCampaignRestart() {
  viewCareerRecapBtn.classList.add('hidden');
  restartCampaignBtn.classList.add('hidden');
  restartCampaignConfirm.classList.add('hidden');
}

viewCareerRecapBtn.addEventListener('click', () => {
  const recap = buildCampaignCareerRecap(campaign.state);
  if (!recap) return;
  restartCampaignBtn.classList.add('hidden');
  viewCareerRecapBtn.classList.add('hidden');
  campaignFinaleView.show(recap, { replay: true });
});

restartCampaignBtn.addEventListener('click', () => {
  restartCampaignBtn.classList.add('hidden');
  restartCampaignConfirm.classList.remove('hidden');
});

restartCampaignCancelBtn.addEventListener('click', () => {
  restartCampaignConfirm.classList.add('hidden');
  restartCampaignBtn.classList.remove('hidden');
});

restartCampaignConfirmBtn.addEventListener('click', () => {
  const fresh = campaign.reset();
  if (!fresh) {
    restartCampaignConfirm.classList.add('hidden');
    restartCampaignBtn.classList.remove('hidden');
    assetStatus.textContent = 'Could not replace the campaign save. Your current progress was left alone.';
    return;
  }
  // A reload rebuilds every scene-local system from the fresh durable state.
  // Squatch Smash keeps its own score/career key and is intentionally untouched.
  location.reload();
});

function apartmentObjective() {
  if (campaign.state.finale?.freeplayUnlocked === true) {
    return 'Campaign complete. The apartment is yours; pause to reopen the career recap.';
  }
  if (game.inBed || player.mode === 'bed') return 'Press E to get out of bed.';
  if (game.onToilet) return 'Press E to stand up from the toilet.';
  if (game.showering !== null) return 'Finish the shower, or step back out when you are ready.';
  if (apartment?.state?.heldItem === 'phone') {
    /* SM-050. The line about ringing him back is only offered once Booskibro
     * has already rung and hung up, because before that there is nothing to
     * ring back. */
    return canRingBooskiBack()
      ? 'Use E to read or answer the phone; R rings the last caller back.'
      : 'Use E to read or answer the phone; the wheel moves through messages.';
  }
  if (returningToApartment) return 'You are home. Use the apartment freely; the front door continues the story when another scene is ready.';
  return 'Explore the apartment and take care of the morning. Lou will call when he is ready.';
}

const pauseMenu = createPauseMenu({
  title: 'Squatch Life — Apartment',
  canPause: () => game.started && !game.left && !game.seated && !game.passingOut,
  getObjective: apartmentObjective,
  instructions: [
    'W A S D — move. Shift — sprint. C — crouch.',
    'E or Click — interact. Hold E for the alternate interaction.',
    'F — drink or smoke. Q — drop an item, stand up, or leave the desk.',
    'Mouse wheel — change the held item. T — flashlight. R — skip the current radio item.',
    'At the computer, Tab exits the current app to SquatchOS; Q leaves the desk.',
    'Away from the computer, Tab — pause or resume.',
  ],
  recovery: createSceneRecovery({
    sceneId: () => apartmentRecoveryBeatId(campaign.state),
    location,
    // The apartment save itself is checkpoint zero. Both actions reload the
    // hub without erasing campaign facts; only their retry counters differ.
    restartCheckpoint: () => {
      location.reload();
      return { ok: true, checkpoint: 'apartment_entry' };
    },
    restartScene: () => {
      location.reload();
      return { ok: true, sceneId: SCENE_IDS.APARTMENT };
    },
    completeAndSkip: createApartmentRecoverySkipAdapter({
      campaign,
      story: apartmentStory,
      getActivities: activityContext,
      completeActivity: completeApartmentRecoveryActivity,
      settleBlockingBeat: settleApartmentRecoveryBeat,
      navigate: leaveForMission,
    }),
  }),
  onPause: () => {
    game.paused = true;
    interaction.setPaused(true);
    browserInput?.refresh('pause-menu');
    radio.pause();
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    game.paused = false;
    interaction.setPaused(false);
    audio.ctx?.resume?.();
    radio.resume();
    clock.getDelta();
    browserInput?.refresh('pause-menu-resume');
    requestLock();
  },
});

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

function routeApartmentMouseMove(e, controls) {
  if (!controls.playerEnabled || game.paused) return true;
  // Pointer-lock fallback is deliberately hold-and-drag, including while the
  // relative SquatchOS cursor owns the scene route instead of default look.
  if (!controls.locked && !(controls.dragFallback && controls.dragging)) return true;
  if (!game.seated) return false;
  arcade.onPointer(e.movementX, e.movementY);
  // Let the head drift very slightly so the pose is not rigid.
  controls.adapter.applyLook(e.movementX * 0.06, e.movementY * 0.06);
  return true;
}

function routeApartmentMouseDown(e, controls) {
  if (!controls.playerEnabled || game.paused || e.button !== 0) return false;
  if (game.seated) arcade.onClick(true);
  else if (apartment.state.heldItem === 'gun') fireGun();
  /* Same posture guards as [E] below: a click while he is on the toilet or
   * mid-stream has to resolve the posture first, not reach whatever target
   * the ray lands on from that position. */
  else if (game.onToilet) standFromToilet();
  else if (game.peeing) stopPee();
  else interaction.press();
  // The canonical Adapter still owns drag-button truth and retries native
  // pointer lock from a fallback click after this authored action runs.
  return false;
}

function routeApartmentMouseUp(e) {
  if (e.button !== 0) return false;
  if (game.seated) arcade.onClick(false);
  else interaction.release();
  return false;
}

function routeApartmentKeyDown(e, { code }) {
  /* Do not rely on a pointer-lock change to surface pause. Some embedded
   * previews consume Escape without sending that event, which made the pause
   * menu disappear exactly when it was most needed. */
  if (e.code === 'Escape' && !e.repeat) {
    if (!game.started || game.left) return false;
    // The seated DOM arcade deliberately owns its keyboard, including Escape.
    if (game.seated && arcade.inputMode === 'dom') return false;
    e.preventDefault();
    if (game.paused) {
      startBtn.click();
    } else {
      pauseGame();
      if (document.pointerLockElement) document.exitPointerLock?.();
    }
    return true;
  }
  if (e.repeat) {
    // Still needs to reach the hold-to-drink accumulator.
    if (code === 'KeyF') return true;
    return true;
  }
  if (!game.started || game.paused) return false;

  /* Sat on the toilet, WASD is the push game rather than movement -- you are
   * not going anywhere, and the keys are already under your fingers. */
  if (game.onToilet && tryPush(code)) {
    e.preventDefault();
    return true;
  }

  // In the shower, F is the other thing you are doing in there.
  if (game.showering !== null && code === 'KeyF') {
    if (game.peeing) stopPee(); else startPee();
    e.preventDefault();
    return true;
  }

  /* The dress bar runs while he is still flat on his back, so it has to take
   * [E] before the ordinary get-up branch further down ever sees it. [Q] is
   * the way out of it, and the way out finishes the beat rather than
   * cancelling it -- nothing in this morning is allowed to leave him in the
   * bed with no key that does anything. */
  if (margoDress.active) {
    if (code === 'KeyE') { margoDress.press(); e.preventDefault(); return true; }
    if (code === 'KeyQ') { abandonMargoDressHelp(); e.preventDefault(); return true; }
  }

  if (glue.bar.active) {
    if (code === 'KeyE') { glue.bar.press(); e.preventDefault(); return true; }
    if (code === 'KeyQ') {
      glue.bar.stop();
      hud.setTiming(null);
      hud.setPosture(null);
      interaction.setPaused(false);
      hud.say('Right. That can stay crooked.', 3400);
      e.preventDefault();
      return true;
    }
  }

  /* Seated, the keyboard belongs to the computer. Every key is forwarded and
   * NONE of them reach the player -- WASD used to roll the chair as well,
   * which meant typing in a game was also driving your own camera around the
   * desk. [Q] is the one exception: the stand-up key works everywhere. */
  if (game.seated) {
    // Escape is left to the browser -- it releases the pointer and pauses.
    if (code === 'KeyQ') {
      standFromPC();
      return true;
    }
    // Computer apps receive the physical keyboard, not the Apartment's
    // remapped gameplay vocabulary.
    if (arcade.onKey(e.code, true)) e.preventDefault();
    if (e.code === 'Space') e.preventDefault();
    return true;
  }

  switch (code) {
    case 'KeyE':
      /* The Margo wake/come-home scenes used to special-case [E] here so the
       * dress bar could take it over the ordinary get-up action -- and that
       * special case is exactly what left a player stuck on his back with no
       * key that did anything if the scene stalled for any reason. It is gone.
       * [E] means "get up" while lying down, full stop, same as any other
       * morning; her interaction target is an ordinary registered target
       * (`apartment.margo.helpTarget`, `enabled` gated on `awaitingHelp`) that
       * the last `else interaction.press()` below reaches once he is up and
       * looking at her. Lying down and aimed at her is not a path to the bar
       * any more -- he has to be on his feet, because she is standing, not
       * kneeling, until he starts it.
       *
       * The phone takes [E] first while it is the thing in his hand. You
       * cannot open a fridge and answer a call with the same key, and the
       * call wins -- it is the one thing in this flat that is not waiting
       * for you to get round to it. */
      if (apartment.state.heldItem === 'phone') { phone.press(); return true; }
      // Lying down on purpose is the one case where E means sleep, not stand.
      if (game.inBed) sleepInBed();
      else if (player.mode === 'bed') getUp();
      else if (game.onToilet) standFromToilet();
      else if (game.peeing) stopPee();
      else interaction.press();
      return true;
    case 'KeyG':
      fart({ voluntary: true });
      return true;
    case 'KeyT':
      game.flashlightOn = !game.flashlightOn;
      audio.play('switch.click', { volume: 0.5 });
      return true;
    /* Bloom off, for a machine that is struggling. There is no options menu to
     * put this in and it is the first thing worth dropping. */
    /* Slots. Digit1..Digit5 pick one directly; the wheel cycles (below). */
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
      apartment.inventory.select(Number(code.slice(5)) - 1);
      return true;
    case 'KeyB':
      hud.toast(postfx.toggle() ? 'Bloom on' : 'Bloom off', 'good');
      return true;
    case 'KeyR':
      /* Reload takes priority over skipping the radio, but only while the gun
       * is the thing in his hand -- otherwise standing at the sideboard with a
       * revolver in your pocket would stop [R] working on the radio, which is
       * what it is for everywhere else in the flat. */
      if (apartment.state.heldItem === 'gun') reloadGun();
      /* SM-050, on the same rule the gun already set: [R] means whatever the
       * thing in his hand means. With the phone in it, on the one night
       * Booskibro has rung off mid-sentence, it rings him back -- and gets
       * nothing. Second press hangs it up. */
      else if (actOne.ringingOut > 0) endRingBooskiBack();
      else if (canRingBooskiBack()) ringBooskiBack();
      else if (interaction.current && interaction.current.name === 'radio') radio.next();
      return true;
    case 'KeyQ':
      /* [Q] while she is merely OFFERING no longer does anything special --
       * he is free to walk off and come back, so there is nothing here to
       * abandon. Once the bar is actually running, [Q] hands the fastening
       * back to her; that case is handled above, ahead of this switch,
       * alongside the bar's own [E], for the same reason: the bar owns the
       * keyboard while it runs, the same way the glue bar does. */
      if (apartment.state.heldItem === 'phone' && phone.call) {
        phone.hangUp();
        return true;
      }
      if (apartment.state.lipPacked) {
        apartment.dropZyn();
        audio.play('can.set', { volume: 0.3 });
        hud.setHand(null);
        hud.toast('Binned it');
      } else if (game.onToilet) standFromToilet();
      else if (game.peeing) stopPee();
      else if (game.sitting) standFromSeat();
      else if (game.inBed || player.mode === 'bed') getUp();
      else dropHeld();
      return true;
    case 'KeyF':
      // The Adapter owns this scene-declared held Player key and its release.
      return false;
    default:
      return false;
  }
}

function routeApartmentKeyUp(_e, { code }) {
  if (code === 'KeyE' && !game.seated) interaction.release();
  return code === 'KeyE';
}

const apartmentInputPolicy = createApartmentInputPolicy({
  readState: () => ({
    started: game.started,
    paused: game.paused,
    left: game.left,
    seated: game.seated,
    domArcade: arcade.inputMode === 'dom',
    coldOpen: coldOpenActive,
  }),
  keyDown: routeApartmentKeyDown,
  keyUp: routeApartmentKeyUp,
  mouseMove: routeApartmentMouseMove,
  mouseDown: routeApartmentMouseDown,
  mouseUp: routeApartmentMouseUp,
  clear: () => arcade.onClick(false),
});

let fallbackHints = 0;
browserInput = createFirstPersonInput({
  player,
  canvas,
  interaction,
  playerKeyCodes: ['KeyF'],
  ...apartmentInputPolicy.adapterOptions,
  onCaptureChange: (_event, controls) => {
    paintInputCapture(controls);
    const computerDomInput = game.seated && arcade.inputMode === 'dom';
    /* NOT DURING THE COLD OPEN. Confirming quit inside Squatch Smash hands
     * the keyboard back from the iframe with no pointer lock. Pausing there
     * freezes the reveal against the monitor forever. */
    if (!controls.locked && game.started && !game.paused && !computerDomInput
      && !controls.dragFallback && !pauseMenu.isPaused() && !coldOpenActive) {
      pauseGame();
    }
  },
  onCaptureError: (_error, controls) => {
    paintInputCapture(controls);
    if (!controls.recovered) return;
    /* A pointer-lock request can reject after Tab has already opened the
     * shared pause menu. Recovery used to call enableInput() unconditionally,
     * setting game.paused=false behind a still-visible menu. The menu owns
     * this lifecycle boundary; a late browser error must not resume it. */
    if (game.paused || pauseMenu.isPaused() || game.left) return;
    enableInput();
    const activations = controls.adapter.snapshot().dragFallbackActivations;
    if (activations <= fallbackHints) return;
    fallbackHints = activations;
    if (!coldOpenActive) {
      hud.say('Pointer lock is blocked here — <em>hold the left button to look around.</em>', 7000);
    }
  },
});
paintInputCapture(browserInput.snapshot());

/* ------------------------------------------------------------------ */
/* Bed / desk transitions                                              */
/* ------------------------------------------------------------------ */

function getUp() {
  hud.setPosture(null);
  game.inBed = false;
  hud.hidePrompt();
  audio.play('bed.creak', { volume: 0.7 });
  audio.play('bed.rustle', { volume: 0.6, delay: 0.2 });
  audio.say('getup', { chance: 0.7 });
  player.standUpFromBed(apartment.bedExit, apartment.bedLookYaw, () => {
    interaction.setPaused(false);
  });
  hud.say('Feet on cold floor. There is a fridge, and there is a PC.', 5000);
  apartmentStory.beginMorning();
}

/**
 * The representation of `angle` closest to `near`, in radians.
 */
function yawNear(angle, near) {
  let d = (angle - near) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return near + d;
}

/**
 * Put the player's yaw in the same branch as a pose's before sitting into it.
 *
 * THE bug behind "sitting at the computer throws the camera left". Yaw
 * accumulates without wrapping -- walk two laps of the flat and it is 12
 * radians -- and the seated tween lands on `shortestAngle(fromYaw, toYaw)`,
 * which is the value of the pose's yaw NEAREST the one he walked up with, so
 * the camera can finish the tween at 6.28 while `yawCenter` is 0. It looks
 * right, because 6.28 and 0 point the same way; then the first mouse movement
 * runs the clamp, yaw is slammed to `yawCenter + yawRange`, and the view
 * lurches most of a radian to the left before you have moved a centimetre.
 *
 * Normalising here rather than in the player means the tween starts and
 * finishes in the clamp's own branch, so there is nothing left to snap.
 */
function seatedPose(pose) {
  player.yaw = yawNear(player.yaw, pose.yaw);
  return pose;
}

/**
 * Where the camera goes so the monitor IS the screen.
 *
 * Measured off the screen mesh rather than typed in: take its world-space
 * centre, its normal and its size, then stand back along that normal by
 * exactly the distance at which it covers the frustum. A hand-tuned position
 * would be wrong the first time the desk moved, and wrong on every aspect
 * ratio but the author's.
 */
function monitorCameraPose(out) {
  const screen = apartment.screen;
  if (!screen) return null;
  screen.updateWorldMatrix(true, false);
  const geo = screen.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;

  /* The plane's own axes, in the world. Scale is baked into the matrix, so
   * the lengths of the transformed edges are the real metres. */
  const e = screen.matrixWorld.elements;
  const right = _coldOpenUp.set(e[0], e[1], e[2]).length();
  const up = _coldOpenLook.set(e[4], e[5], e[6]).length();
  const width = (bb.max.x - bb.min.x) * right;
  const height = (bb.max.y - bb.min.y) * up;

  _coldOpenCentre.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, 0)
    .applyMatrix4(screen.matrixWorld);
  _coldOpenNormal.set(e[8], e[9], e[10]).normalize();

  const distance = monitorFillDistance({
    screenW: width,
    screenH: height,
    fovDeg: camera.fov,
    aspect: camera.aspect,
  });
  /* Out along whichever face the seat is on, so this cannot end up behind the
   * monitor on a desk that gets mirrored. */
  const seated = apartment.deskPose.position;
  const sign = Math.sign(_coldOpenNormal.dot(_coldOpenEye.copy(seated).sub(_coldOpenCentre))) || 1;
  return out.copy(_coldOpenCentre).addScaledVector(_coldOpenNormal, distance * sign);
}

/**
 * Drive the camera for the cold open.
 *
 * `k` is 0 at the monitor and 1 in the chair. Everything between is the
 * reveal: the edges of the screen appear, then the desk, then the room.
 */
function driveColdOpenCamera(k) {
  const monitor = monitorCameraPose(_coldOpenMonitor);
  if (!monitor) return;
  const seat = apartment.deskPose;
  camera.position.copy(monitor).lerp(seat.position, k);
  /* Looking at the middle of the screen the whole way, so the monitor stays
   * the centre of frame as the room grows around it -- which is what makes
   * the moment land rather than feeling like a camera wandering off. */
  camera.lookAt(_coldOpenCentre);
}

function sitAtPC() {
  if (game.seated) return;
  game.seated = true;
  // Anything held on the walk up dies here; while seated no key reaches him.
  browserInput?.clear('sit-at-pc');
  browserInput?.refresh('sit-at-pc');
  interaction.setPaused(true);
  hud.setMode('seated');
  audio.play('chair.roll', { volume: 0.4 });
  audio.play('chair.sit', { volume: 0.6, delay: 0.25 });
  audio.say('pc.sit', { chance: 0.6, delay: 0.9 });

  player.sitAt(seatedPose(apartment.deskPose), () => {
    audio.setMuffle(true);
    radio.setFocusMuffle(true);
    if (!apartment.state.pcOn) {
      apartment.setPcOn(true);
      audio.startLoop('pc.fan', {
        volume: 0.14, position: new THREE.Vector3(2.76, 0.3, -4.0), ref: 0.9, maxDist: 5,
      });
      audio.play('pc.boot', { volume: 0.5 });
      arcade.boot();
    }
    hud.setPosture('get up from the desk');
    arcade.setSeated?.(true);
  });
}

function standFromPC() {
  hud.setPosture(null);
  if (!game.seated) return;
  /* Q works even while the parent-owned framed-app exit control has focus.
   * In that path the iframe deliberately released pointer lock, and dropping
   * `seated` before setSeated(false) means the input-mode callback correctly
   * declines to re-lock for a seated player. Remember that transition and
   * restore first-person input explicitly once the DOM overlay is gone. */
  const leavingDomApp = arcade.inputMode === 'dom';
  game.seated = false;
  arcade.setSeated?.(false);
  browserInput?.refresh('stand-from-pc');
  if (leavingDomApp && game.started && !game.paused) requestLock();
  hud.setMode('walk');
  audio.setMuffle(false);
  radio.setFocusMuffle(false);
  audio.play('chair.roll', { volume: 0.4 });
  player.standFrom(apartment.deskExit, () => interaction.setPaused(false));
}

/* ------------------------------------------------------------------ */
/* Sitting about                                                       */
/* ------------------------------------------------------------------ */

/**
 * The couch and the edge of the bed. Nothing happens while you are there,
 * which is rather the point -- but time keeps moving, the radio keeps
 * playing, and the room slowly goes dark around you.
 */
const SEATS = {
  couch: {
    pose: () => apartment.couchPose,
    exit: () => apartment.couchExit,
    cue: 'couch.sit',
    line: 'You sit down. The cushion gives up immediately. <em>[Q] to get up.</em>',
  },
  bed: {
    pose: () => apartment.bedSitPose,
    exit: () => apartment.bedSitExit,
    cue: 'bed.creak',
    line: 'On the edge of the bed, then. <em>Hold [E] on the bed to lie back down.</em>',
  },
};

function sitOn(which) {
  if (game.sitting || game.seated || game.onToilet || game.passingOut) return;
  if (player.mode !== 'walk') return;
  const seat = SEATS[which];
  game.sitting = which;
  interaction.setPaused(true);
  hud.setMode('seated');
  audio.play(seat.cue, { volume: 0.55 });

  player.sitAt(seatedPose(seat.pose()), () => {
    interaction.setPaused(false);   // you can still reach things from a seat
    hud.say(seat.line, 4600);
    hud.setPosture('get up');
  });
}

function standFromSeat() {
  hud.setPosture(null);
  if (!game.sitting) return;
  const seat = SEATS[game.sitting];
  game.sitting = null;
  hud.setMode('walk');
  audio.play(seat.cue, { volume: 0.4, rate: 1.08 });
  player.standFrom(seat.exit(), () => interaction.setPaused(false));
}

/** Lie back down. From here you can sleep the day away, which is an option. */
function lieOnBed() {
  if (game.seated || game.onToilet || game.passingOut) return;
  if (player.mode === 'bed') return;
  /* Getting up mid-scene is the whole point of the rewrite; sleeping back
   * through Margo unresolved would be a new way to reach the same "she never
   * finished" state the rewrite exists to close off. She is in the room
   * until he helps her and she walks out on her own two feet, not until he
   * climbs back into bed around her. */
  if (game.margoScene) return;
  game.sitting = null;
  game.inBed = true;
  interaction.setPaused(true);
  hud.setMode('seated');
  audio.play('bed.creak', { volume: 0.7 });
  audio.play('bed.rustle', { volume: 0.6, delay: 0.25 });
  audio.say('liedown', { chance: 0.8 });

  player.lieDown(seatedPose(apartment.bedPose), () => {
    hud.say('Ceiling. <em>[E] to sleep it off.</em>', 5200);
    hud.setPosture('get up');
  });
}

/** Deliberate sleep, as opposed to the kind that happens to you. */
function sleepInBed() {
  hud.setPosture(null);
  if (!game.inBed || game.passingOut) return;
  game.inBed = false;
  hud.hidePrompt();
  audio.say('sleep');
  const storySleep = apartmentStory.sleep();
  // Commit the next chapter's physical dressing with its campaign checkpoint.
  // Reapplying it on wake remains idempotent and the blackout hides the swap.
  if (storySleep.ok) {
    apartment.applyChapterDressing(storySleep.chapter);
    /* The chapter turn is also the eviction point for decoded one-shot beat
     * banks. The exact-once ledger is the authority: a bank is dropped only
     * once its time event proves the beat can never fire again, and
     * `AudioEngine.forget` keeps re-decode possible so even a wrong entry in
     * that table costs a re-fetch, never a silent line. This is the first
     * release valve on the apartment's ~480 MB resident decoded plan
     * (docs/WEB-PERFORMANCE-AND-PWA.md). */
    for (const prefix of closedNightCuePrefixes(campaign.state.story.timeEvents)) {
      audio.forget(prefix);
    }
  }
  /* Named by the chapter that is ENDING, not hardcoded to the first one. This
   * said "Day One is done" on every night in the campaign, so going to bed on
   * Day Two and again before the big night both announced a day that was two
   * chapters behind you. */
  hud.say(storySleep.ok
    ? `${CHAPTER_DONE[storySleep.chapter] ?? 'That is that'}. You close your eyes.`
    : 'You close your eyes. It is not like you had plans.', 2600);
  passOut({ voluntary: true, storySleep });
}

/* ------------------------------------------------------------------ */
/* Beer and smokes                                                     */
/* ------------------------------------------------------------------ */

/**
 * What [Q] does to each thing he can be holding.
 *
 * One entry per id in `ITEMS`, and the shape is deliberately total: `put`
 * returns the object to wherever it came from and reports whether it managed
 * it, or the entry says `keep` and he simply does not put it down. There is no
 * default branch, because the default branch was the bug.
 *
 * The silent `else` at the bottom of this function is how the phone used to
 * get deleted -- the slot was emptied, the model in the world had been hidden
 * since pickup, and nothing put it back. The phone was fixed by name, which
 * left the revolver and the slice of pizza doing exactly the same thing: one
 * press and Lou's gun, or his breakfast, was gone from the save for good.
 * Anything added to `ITEMS` from here on has to say what happens to it or the
 * check below refuses to drop it, which fails safe.
 */
const DROP_RULES = {
  /* Not dropped and not refused: pocketed. Making it undroppable stopped [Q]
   * deleting the only object Lou can reach him through, and left [Q] doing
   * nothing at all while it was in his hand, which reads as broken. It leaves
   * his hand, stays in the hotbar, stays in the campaign's carried list, and
   * comes back out with its own number key. The refusal line is kept for the
   * one case that cannot pocket it, because that case would have to destroy
   * it. Mid-call never reaches here -- [Q] hangs up first, see the key
   * handler -- so pocketing can never strand a call. */
  phone: {
    pocket: () => pocketPhone(),
    keep: 'It is my phone. <em>It stays on me.</em>',
    cue: () => audio.play('phone.pickup', { volume: 0.32, rate: 0.88 }),
  },
  /* An empty is the one thing genuinely destroyed, and it is not destroyed
   * here: `consumeBeer` already dropped the crushed can on the floor at the
   * moment he finished it. This is only letting go of the idea of it. */
  empty: {
    put: () => true,
    cue: () => audio.play('can.crush', { volume: 0.6 }),
    toast: 'Crushed the can',
  },
  beer: {
    put: () => apartment.returnBeer(),
    cue: () => audio.play('can.set', { volume: 0.5 }),
    toast: 'Back in the fridge',
    stuck: 'Nowhere to put it back. I will just drink it.',
  },
  cigs: {
    put: () => { apartment.returnCigarettes(); return true; },
    cue: () => audio.play('can.set', { volume: 0.35 }),
  },
  whiskey: {
    put: () => { apartment.returnWhiskey(); return true; },
    cue: () => audio.play('whiskey.cap', { volume: 0.5 }),
  },
  milk: {
    put: () => { apartment.returnMilk(); return true; },
    cue: () => audio.play('can.set', { volume: 0.45 }),
    toast: 'Back in the fridge',
  },
  slice: {
    put: () => apartment.returnSlice(),
    cue: () => audio.play('can.set', { volume: 0.4 }),
    toast: 'Back in the box',
    stuck: 'It is not going back in that box. Might as well eat it.',
  },
  gun: {
    put: () => apartment.dropGun(),
    cue: () => null,     // dropGun plays its own set-down
    toast: 'Left it on the table',
    stuck: 'No. That does not get left lying about.',
  },
  /* Two eggs are a pair of hands, not a slot -- `state.hasEggs` carries them
   * and the pan is the only place they go. There is nothing to empty. */
  eggs: { keep: 'They are eggs. They go in the pan.' },
  /* Carried inside the jacket by the campaign rather than in a slot. If it
   * ever reaches a slot, it is Lou's and it is not going on the carpet. */
  parcel: { keep: 'That is Lou’s. It does not leave my jacket.' },
};

/**
 * Put the phone away without letting go of it.
 *
 * Selects any other slot -- an empty one for preference -- so the phone leaves
 * his hand and the HUD's hand card while staying exactly where it was in the
 * hotbar and in the save.
 *
 * @returns {boolean} false when there is no other slot to select, which is the
 *   only case where putting it away would mean losing it.
 */
function pocketPhone() {
  const inv = apartment.inventory;
  const at = inv.items.indexOf('phone');
  if (at < 0) return false;
  const free = inv.items.findIndex((id, i) => id === null && i !== at);
  const other = free >= 0 ? free : inv.items.findIndex((id, i) => id && i !== at);
  if (other < 0) return false;
  inv.select(other);
  hud.toast(`Phone pocketed · [${at + 1}] to take it out`);
  return true;
}

function dropHeld() {
  const st = apartment.state;
  if (!st.heldItem || cig.t >= 0) return;

  const rule = DROP_RULES[st.heldItem];
  /* An id with no rule is a thing nobody has said how to put down, so he does
   * not put it down. Losing an item is worse than being unable to drop one. */
  if (!rule) {
    hud.say('I should hang on to that.', 3000);
    return;
  }
  /* Pocketing is not dropping: nothing leaves the hotbar and nothing goes back
   * into the world, so it returns here rather than falling through to the
   * clear-the-slot path below. */
  if (rule.pocket) {
    if (rule.pocket() === true) { rule.cue?.(); return; }
    hud.say(rule.keep || 'Nowhere to put that.', 3000);
    return;
  }
  if (rule.keep) {
    hud.say(rule.keep, 3000);
    return;
  }
  if (rule.put() !== true) {
    hud.say(rule.stuck || 'There is nowhere to put that down.', 3000);
    return;
  }
  rule.cue?.();
  if (rule.toast) hud.toast(rule.toast);
  st.heldItem = null;
  hud.setHand(null);
}

/** Both consumables are on hold-F; which one runs depends on what you hold. */
function updateConsume(dt) {
  const st = apartment.state;
  const holdingF = player.keys.has('KeyF') && !game.seated && !game.passingOut;

  if (st.heldItem === 'cigs' || cig.t >= 0) updateSmoking(dt, holdingF);
  else if (st.heldItem === 'whiskey') updateSwigging(dt, holdingF);
  else if (st.heldItem === 'milk') updateMilk(dt, holdingF);
  else if (st.heldItem === 'slice') updateEatingSlice(dt, holdingF);
  else updateDrinking(dt, holdingF);
}

/** Seconds of holding [F] to get through a slice. */
const SLICE_TIME = 2.6;

/**
 * Eating the slice in his hand.
 *
 * Same shape as drinking: hold [F], a progress bar, and it is gone at the end.
 * It counts as having eaten, so this is a second route through the `fed` gate
 * that the door checks -- cold pizza off a coffee table is not the breakfast
 * the eggs are, but the door only asks whether he has eaten.
 */
function updateEatingSlice(dt, holdingF) {
  const st = apartment.state;
  if (!holdingF) {
    if (game.eatingSlice > 0) {
      game.eatingSlice = 0;
      hud.setHold(null);
      poseSlice(0);
      if (!interaction.current) hud.hidePrompt();
    }
    return;
  }

  game.eatingSlice = (game.eatingSlice || 0) + dt;
  const k = Math.min(1, game.eatingSlice / SLICE_TIME);
  /* `hud.setHold` takes a NUMBER. This handed it `{ label, k }`, so the bar's
   * width came out `NaN%`, the browser threw the declaration away, and holding
   * [F] on a slice showed the player absolutely nothing for two and a half
   * seconds -- no bar, no prompt, no movement -- which is indistinguishable
   * from a slice that cannot be eaten. Same shape as drinking now, because it
   * is the same gesture. */
  hud.showPrompt('Eating…', 'F');
  hud.setHold(k);
  poseSlice(k);
  if (game.eatingSlice < SLICE_TIME) return;

  game.eatingSlice = 0;
  hud.setHold(null);
  hud.hidePrompt();
  poseSlice(0);
  st.heldItem = null;                 // empties the slot the slice was in
  st.fed = true;
  completeApartmentActivity('eaten', TIME_EVENT_IDS.EAT);
  audio.play('egg.eat', { volume: 0.6 });
  audio.say('slice', { chance: 0.8, delay: 0.9 });
  hud.toast('Ate a slice', 'good');
}

/** Seconds of holding [F] for one pull on the jug. It goes down easily. */
const MILK_TIME = 2.0;

/**
 * Raw milk, straight from the jug.
 *
 * The one thing in this fridge that is not a vice and behaves worse than all
 * of them. It is a real drink -- it fills the bladder like anything else --
 * and it is the third and most reliable route to the morning's other errand,
 * which is the whole reason it exists: a player who does not smoke and does
 * not touch the tin needs SOMETHING in this flat that gets things moving, and
 * the fridge is the first place anybody looks.
 *
 * Deliberately not alcoholic and deliberately not food. Drinking it is not
 * breakfast and does not tick `eaten`; he is not having a glass of milk for
 * his breakfast, he is drinking out of the jug in front of an open fridge at
 * six in the morning, which is a different thing entirely.
 */
function updateMilk(dt, holdingF) {
  const st = apartment.state;
  const wants = holdingF && st.heldItem === 'milk' && st.milkLeft > 0;

  if (!wants) {
    if (game.drinking > 0) {
      game.drinking = 0;
      hud.setHold(null);
      poseDrink(null, 0);
      if (!interaction.current) hud.hidePrompt();
    }
    if (holdingF && st.milkLeft <= 0) hud.say('Empty. You drank a half gallon of raw milk.');
    return;
  }

  if (game.drinking === 0) audio.play('whiskey.cap', { volume: 0.45, rate: 1.25 });
  game.drinking += dt;

  hud.showPrompt('Drinking…', 'F');
  hud.setHold(Math.min(1, game.drinking / MILK_TIME));
  poseDrink('jug', Math.min(1, game.drinking / MILK_TIME));
  if (game.drinking > 0.35 && Math.random() < dt * 2.6) {
    audio.play('can.sip', { volume: 0.42, rate: 0.82 });
  }
  if (game.drinking < MILK_TIME) return;

  game.drinking = 0;
  hud.setHold(null);
  poseDrink(null, 0);
  hud.hidePrompt();
  apartment.consumeMilk();
  st.bladder = Math.min(1, st.bladder + 0.22);
  /* And the other tank, all at once. This is the gag and it is also true:
   * unpasteurised milk on an empty stomach is not a slow build. */
  startTheUrge('milk');
  audio.play('whiskey.gasp', { volume: 0.5, rate: 1.18 });
  audio.play('belly.rumble', { volume: 0.7, delay: 1.4 });
  audio.say('milk', { chance: 0.9, delay: 0.7 });

  const n = st.milkLeft;
  hud.setHand({
    icon: '🥛',
    name: n > 0 ? `Raw milk (${n})` : 'Empty jug',
    hint: n > 0 ? 'Hold [F] to drink' : '[Q] put it back',
  });
  hud.toast(st.milkDrunk === 1 ? 'Raw milk. Bold.' : 'More raw milk. Bolder.', 'good');
  hud.say(st.milkDrunk === 1
    ? 'Thick, warm-ish, and faintly of a field. <em>Absolutely worth it.</em>'
    : 'You know exactly what this does to you and you are doing it anyway.', 4800);
}

function updateDrinking(dt, holdingF) {
  const st = apartment.state;
  const wantsDrink = holdingF && st.heldItem === 'beer';

  if (!wantsDrink) {
    if (game.drinking > 0) {
      game.drinking = 0;
      hud.setHold(null);
      poseDrink(null, 0);
      if (!interaction.current) hud.hidePrompt();
    }
    return;
  }

  if (game.drinking === 0) {
    audio.play('can.crack', { volume: 0.8 });
    audio.say('beer.open', { chance: 0.5, delay: 0.5 });
  }
  game.drinking += dt;

  hud.showPrompt('Drinking…', 'F');
  hud.setHold(Math.min(1, game.drinking / DRINK_TIME));
  poseDrink('can', Math.min(1, game.drinking / DRINK_TIME));
  if (game.drinking > 0.4 && Math.random() < dt * 2.4) {
    audio.play('can.sip', { volume: 0.4 });
  }

  if (game.drinking >= DRINK_TIME) {
    game.drinking = 0;
    hud.setHold(null);
    poseDrink(null, 0);
    hud.hidePrompt();
    apartment.consumeBeer(player.position);
    drunk.drink(BEER_UNITS);
    apartment.state.bladder = Math.min(1, apartment.state.bladder + 0.30);
    hud.setHand({ icon: '🥫', name: 'Empty can', hint: '[Q] crush it' });

    // The first couple steady you. After that the room starts moving.
    const n = apartment.state.beersDrunk;
    audio.say(n <= 2 ? 'beer.good' : 'beer.many', { chance: 0.75, delay: 0.4 });
    if (apartment.state.beersLeft === 0) audio.say('beer.last', { delay: 2.2 });
    if (n <= 2) {
      arcade.grantBuff?.(1);
      hud.toast('Steady hands — +1 slow-mo charge at the PC', 'good');
      hud.say('Cold. Immediate. <em>Your aim feels better already.</em>', 4200);
    } else if (n === 3) {
      hud.toast('That one hit different', 'bad');
      hud.say('Three deep. The floor has opinions about this now.', 4600);
    } else {
      hud.toast('You are not going to make it', 'bad');
      hud.say('Everything is warm and slightly to the left.', 4600);
    }
  }
}

/** A pull straight from the bottle. Twice a beer, in half the time. */
function updateSwigging(dt, holdingF) {
  const st = apartment.state;
  const wants = holdingF && st.whiskeyLeft > 0;

  if (!wants) {
    if (game.drinking > 0) {
      game.drinking = 0;
      hud.setHold(null);
      poseDrink(null, 0);
      if (!interaction.current) hud.hidePrompt();
    }
    if (holdingF && st.whiskeyLeft <= 0) hud.say('Empty. It was never going to end well.');
    return;
  }

  if (game.drinking === 0) audio.play('whiskey.pour', { volume: 0.7 });
  game.drinking += dt;

  hud.showPrompt('Drinking…', 'F');
  hud.setHold(Math.min(1, game.drinking / SWIG_TIME));
  poseDrink('bottle', Math.min(1, game.drinking / SWIG_TIME));
  if (game.drinking > 0.3 && Math.random() < dt * 2.0) {
    audio.play('whiskey.swig', { volume: 0.5 });
  }

  if (game.drinking >= SWIG_TIME) {
    game.drinking = 0;
    hud.setHold(null);
    poseDrink(null, 0);
    hud.hidePrompt();

    apartment.consumeWhiskey();
    if (campaign.state.missions[MISSION_IDS.BADA_BING_ONE].status === 'complete'
      && !campaign.state.activities.whiskeyRelaxed) {
      campaign.update((state) => { state.activities.whiskeyRelaxed = true; });
      updateObjectives();
      hud.toast('Nerves settled. Time to handle business.', 'good');
    }
    drunk.drink(WHISKEY_UNITS);
    apartment.state.bladder = Math.min(1, apartment.state.bladder + 0.16);
    audio.play('whiskey.gasp', { volume: 0.7 });
    audio.say('whiskey', { chance: 0.7, delay: 1.0 });

    const n = st.whiskeyLeft;
    hud.setHand({
      icon: '🥃',
      name: n > 0 ? `Jack & Daniel's (${n})` : 'Empty bottle',
      hint: n > 0 ? 'Hold [F] to take a pull' : '[Q] set it down',
    });
    hud.toast(n > 0 ? 'That went straight through you' : 'Bottle empty', 'bad');
    hud.say(st.whiskeyDrunk <= 1
      ? 'Warm all the way down. <em>That was a lot faster than beer.</em>'
      : 'The room takes a second to catch up with your head.', 4600);
  }
}

/**
 * One hold of F is one whole cigarette: flick, drag, exhale. Letting go
 * before the exhale abandons it and costs nothing.
 */
function updateSmoking(dt, holdingF) {
  const st = apartment.state;

  // Afterglow: it stays lit in your hand for a moment, then gets flicked.
  if (cig.t < 0 && cig.afterglow > 0) {
    cig.afterglow -= dt;
    heldCig.group.visible = true;
    wispFromEmber(dt, 0.5);
    if (cig.afterglow <= 0) {
      heldCig.group.visible = false;
      audio.play('cig.stub', { volume: 0.5 });
    }
    return;
  }

  const start = holdingF && st.heldItem === 'cigs' && cig.t < 0 && st.cigsLeft > 0;
  if (start) {
    cig.t = 0;
    cig.lit = false;
    cig.exhaled = false;
    audio.play('cig.light', { volume: 0.75 });
    audio.say('cig.light', { chance: 0.35, delay: 1.4 });
  }

  if (cig.t < 0) {
    if (holdingF && st.heldItem === 'cigs' && st.cigsLeft <= 0) {
      hud.say('Empty pack. You have been through a lot this morning.');
    }
    return;
  }

  // Abandoned before the exhale.
  if (!holdingF && cig.t < CIG_EXHALE) {
    cig.t = -1;
    cig.lit = false;
    heldCig.group.visible = false;
    hud.setHold(null);
    if (!interaction.current) hud.hidePrompt();
    return;
  }

  cig.t += dt;
  hud.showPrompt(cig.t < CIG_DRAG ? 'Lighting…' : cig.t < CIG_EXHALE ? 'Drawing…' : 'Exhaling…', 'F');
  hud.setHold(Math.min(1, cig.t / CIG_DONE));

  if (!cig.lit && cig.t >= CIG_SHOW) {
    cig.lit = true;
    heldCig.group.visible = true;
  }
  if (cig.lit && cig.t >= CIG_DRAG && cig.t < CIG_EXHALE) {
    // Ember flares while you draw on it.
    heldCig.ember.material.emissiveIntensity = 3.4 + Math.sin(elapsed * 22) * 0.6;
    if (Math.abs(cig.t - CIG_DRAG) < dt) audio.play('cig.drag', { volume: 0.7 });
    wispFromEmber(dt, 1.6);
  }

  if (!cig.exhaled && cig.t >= CIG_EXHALE) {
    cig.exhaled = true;
    heldCig.ember.material.emissiveIntensity = 2.0;
    audio.play('cig.exhale', { volume: 0.8 });
    audio.say('cig.drag', { chance: 0.4, delay: 0.9 });
    exhaleCloud();
  }

  if (cig.t >= CIG_DONE) {
    cig.t = -1;
    cig.afterglow = CIG_AFTERGLOW - CIG_DONE;
    hud.setHold(null);
    hud.hidePrompt();

    apartment.consumeCigarette();
    drunk.smoke();
    /* One is enough. It always was in real life.
     *
     * This used to add 0.26, so the urge took FOUR cigarettes -- most of the
     * pack, on a timer, for a chore the door then refuses to let you skip.
     * Nobody found it, which is why the toilet's whole other half went
     * unplayed. A dart on an empty stomach is the single most reliable thing
     * in this flat, so it is the single most reliable thing in this flat. */
    startTheUrge('cig');

    if (st.cigsLeft > 0) {
      hud.setHand({ icon: '🚬', name: `Smokes (${st.cigsLeft})`, hint: 'Hold [F] to light one' });
    } else {
      hud.setHand({ icon: '🚬', name: 'Empty pack', hint: '[Q] bin it' });
      audio.say('cig.last', { delay: 2.6 });
    }
    hud.toast('Steadier — for a bit', 'good');
    hud.say(drunk.level > 0.4
      ? 'Head rush. Then, briefly, the room holds still.'
      : 'Filthy habit. Extremely effective.', 4200);
  }
}

/** Thin wisp curling off the ember, in world space. */
function wispFromEmber(dt, rate) {
  if (Math.random() > dt * rate * 6) return;
  heldCig.ember.getWorldPosition(_v);
  smoke.wisp(_v);
}

/** The big one: a cloud pushed out along your view. */
function exhaleCloud() {
  camera.getWorldPosition(_v);
  camera.getWorldDirection(_dir);
  emitCigaretteExhale(smoke, _v, _dir);
}

/* ------------------------------------------------------------------ */
/* Living somewhere with neighbours                                    */
/* ------------------------------------------------------------------ */

/** They start at the same time every night, through the west wall. */
const ARGUMENT_HOUR = 23;
const ARGUMENT_POS = new THREE.Vector3(-5.2, 1.5, 0.6);

let argumentDay = -1;
let argumentUntil = 0;
let nextShoutAt = 0;

function updateNeighbours(dt) {
  const h = time.hour;

  // Absolute minutes, not minute-of-day: a row that starts at 23:20 has to
  // survive midnight to run its forty minutes, and one slept past has to end.
  const nowAbs = time.day * 1440 + time.minutes;

  // Kick off once a night, then keep it going for about forty in-game minutes.
  if (h >= ARGUMENT_HOUR && h < ARGUMENT_HOUR + 0.7 && argumentDay !== time.day) {
    argumentDay = time.day;
    argumentUntil = nowAbs + 40;
    nextShoutAt = 0;
    hud.say('Upstairs. Or next door. It is hard to tell through the wall.', 5200);
  }

  if (nowAbs > argumentUntil) return;

  nextShoutAt -= dt;
  if (nextShoutAt <= 0) {
    nextShoutAt = 2.5 + Math.random() * 5.5;
    // Through a wall and a floor: heavily lowpassed, so you get the shape of
    // the row and none of the words. That is what you actually hear.
    audio.play('neighbours.argue', {
      position: ARGUMENT_POS, volume: 0.50 + Math.random() * 0.22,
      rate: 0.92 + Math.random() * 0.18, ref: 2.2, maxDist: 14, muffle: 340,
    });
    if (Math.random() < 0.22) {
      audio.play('neighbours.thump', {
        position: ARGUMENT_POS, volume: 0.55, delay: 0.6, muffle: 150,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Farting                                                             */
/* ------------------------------------------------------------------ */

/**
 * Pick a cue, never the same one twice in a row.
 *
 * A fart is funny in a quiet room and merely noise on top of a voice line, so
 * if the floor is busy this defers rather than fires. Deliberate ones are
 * queued and land the moment he stops talking -- pressing the button and
 * getting nothing would read as broken. Involuntary ones are simply dropped;
 * the timer will come round again.
 */
function fart({ voluntary = true } = {}) {
  if (voluntary) narrator.note('fart');
  if (!game.started || game.paused || game.passingOut) return;

  if (audio.busy()) {
    if (voluntary && !game.fartQueued) {
      game.fartQueued = true;
      setTimeout(function retry() {
        if (!game.fartQueued) return;
        if (audio.busy()) { setTimeout(retry, 220); return; }
        game.fartQueued = false;
        fart({ voluntary: true });
      }, 220);
    }
    return;
  }
  game.fartQueued = false;
  let i = (Math.random() * FART_CUES.length) | 0;
  if (i === _lastFart) i = (i + 1 + ((Math.random() * (FART_CUES.length - 1)) | 0)) % FART_CUES.length;
  _lastFart = i;

  // Sitting muffles it; beer makes it worse.
  const gassy = 1 + apartment.state.beersDrunk * 0.08;
  audio.play(FART_CUES[i], {
    volume: (game.seated ? 0.55 : 0.8) * gassy,
    rate: 0.86 + Math.random() * 0.3,
  });
  audio.hold(1.1);
  audio.say('fart', { chance: voluntary ? 0.25 : 0.45, delay: 1.0 });

  // Reset the involuntary timer either way, so a deliberate one buys you time.
  game.fartClock = 0;
  game.nextFartAt = 35 + Math.random() * 70;

  if (!voluntary && Math.random() < 0.35) {
    hud.say(pick([
      'That one arrived without asking.',
      'Nobody heard that. Nobody is here.',
      'Unprompted. Unwelcome. Unavoidable.',
    ]), 3200);
  }
}

function updateFarts(dt) {
  if (game.passingOut) return;
  // The more you have put away, the more often one slips out.
  const rate = 1 + apartment.state.beersDrunk * 0.25 + apartment.state.whiskeyDrunk * 0.2;
  game.fartClock += dt * rate;
  if (game.fartClock >= game.nextFartAt) fart({ voluntary: false });
}

/* ------------------------------------------------------------------ */
/* Zyns                                                                */
/* ------------------------------------------------------------------ */

/**
 * The point of these, mechanically, is that they work in the chair. A
 * cigarette needs both hands and takes you away from the desk; a pouch
 * steadies you without you having to get up, which is exactly why anybody
 * uses them.
 */
const ZYN_SECONDS = 90;

function takeZyn() {
  const st = apartment.state;
  if (!apartment.consumeZyn()) return;

  audio.play('zyn.tin', { position: apartment.zynPos, volume: 0.7 });
  audio.play('zyn.pack', { volume: 0.6, delay: 0.35 });

  // A harder, shorter hit than a cigarette -- and the same trip to the bathroom.
  drunk.rush = Math.max(drunk.rush, 1.25);
  drunk.steady = Math.max(drunk.steady, 55);
  game.zynUntil = time.elapsedReal + ZYN_SECONDS;
  startTheUrge('zyn');

  hud.setHand({ icon: '⚪', name: `Zyn (${st.zynsLeft} left)`, hint: '[Q] bin it' });
  hud.toast('Upper lip. Steady hands.', 'good');
  audio.say('zyn', { chance: 0.7, delay: 1.3 });
  hud.say(st.zynsTaken === 1
    ? 'Tucked in. <em>The room tightens up for a second, then settles.</em>'
    : 'Another one. Your gums have opinions you are ignoring.', 4400);
}

function updateZyn() {
  const st = apartment.state;
  if (!st.lipPacked) return;
  if (time.elapsedReal > game.zynUntil) {
    apartment.dropZyn();
    if (apartment.state.heldItem === null) hud.setHand(null);
    hud.say('That one is done. You barely noticed it go.', 3600);
  }
}

/**
 * A bowl. The world slows down, you slow down, and the camera takes its time
 * catching up with the mouse.
 */
const apartmentBongBehavior = createBongBehavior({
  blocked: () => game.passingOut,
  audio,
  highs,
  smoke,
  origin: () => camera.position,
  direction: cameraForward,
  hud,
});

function hitBong() {
  return apartmentBongBehavior.use();
}

/** A cap. Nothing happens for a minute and a half, and then it does. */
function eatShrooms() {
  if (game.passingOut) return;
  audio.play('zyn.pack', { volume: 0.5 });
  audio.say('shrooms', { chance: 0.9, delay: 0.8 });
  highs.eatShrooms();
  /* And on the big night this is an objective — see CHAPTER_PASTIMES. Latched
   * here rather than watched for in the frame loop because `highs.dose` is a
   * live reading that `sleepItOff()` wipes, and "he took them" is a thing that
   * happened rather than a thing that is currently true. */
  apartment.state.shroomsTaken = true;
  if (campaign.state.activities.tookShrooms !== true) {
    completeApartmentActivity('tookShrooms', PASTIME_EVENTS.tookShrooms);
  }
  hud.toast('Nothing is happening', '');
  hud.say('Earthy. Unpleasant. Nothing is happening. '
    + '<em>Nothing is going to happen for a while.</em>', 6000);
}

/** Where the camera is pointing, for anything that needs to come out of it. */
const _fwd = new THREE.Vector3();
function cameraForward() {
  camera.getWorldDirection(_fwd);
  return _fwd;
}

/* ------------------------------------------------------------------ */
/* Getting ready                                                       */
/* ------------------------------------------------------------------ */

const SHOWER_TIME = 9.0;

/**
 * A shower. You step in, it is cold, then it is not, and eight seconds later
 * you are a person who has had a shower.
 */
function takeShower() {
  if (game.showering || game.passingOut) return;
  game.showering = 0;
  interaction.setPaused(true);
  hud.setMode('seated');
  player.mode = 'frozen';

  const st = apartment.showerStand;
  player.sitAt({
    position: new THREE.Vector3(st.x, 1.60, st.z),
    /* The rose hangs off the tub's far end wall, at -z of where you stand, and
     * facing -z is yaw 0 -- PI put your back to it, and the old ±1.2 clamp
     * meant you could never turn the half-circle to find it. Full range now:
     * you are stood in a bath, not strapped into it. */
    yaw: 0,
    pitch: 0.10,
    dur: 1.1,
    yawRange: Math.PI,
    pitchMin: -0.9,
    pitchMax: 0.8,
  }, () => {
    audio.startLoop('shower.run', {
      volume: 0.34, position: apartment.showerHead, ref: 1.2, maxDist: 8,
    });
    showerFx.start(apartment.showerHead);
    audio.say('shower', { chance: 0.9, delay: 1.4 });
    hud.say('Cold. Cold. Cold — <em>there we go.</em>', 4600);
  });
}

function updateShower(dt) {
  if (game.showering === null) return;
  game.showering += dt;
  showerFx.update(dt);

  // Steam, rising off the head rather than out of your face.
  if (game.showering > 1.2 && Math.random() < dt * 9) {
    smoke.wisp(apartment.showerHead);
  }

  if (game.showering >= SHOWER_TIME) {
    game.showering = null;
    audio.stopLoop('shower.run', 0.6);
    showerFx.stop();
    apartment.state.showered = true;
    completeApartmentActivity('showered', TIME_EVENT_IDS.SHOWER);
    hud.setMode('walk');
    hud.toast('Clean', 'good');
    hud.say('Right. That is better. That is much better.', 4600);
    player.standFrom(
      new THREE.Vector3(apartment.showerStand.x + 0.55, 0, apartment.showerStand.z + 0.75),
      () => interaction.setPaused(false),
    );
  }
}

const COOK_TIME = 11.0;

/** Two eggs into the pan. They take about as long as eggs take. */
function cookEggs() {
  const st = apartment.state;
  if (st.panState || !st.hasEggs) return;
  st.hasEggs = false;
  st.panState = 'raw';
  game.cooking = 0;
  hud.setHand(null);
  apartment.pan.contents.visible = true;
  audio.play('egg.crack', { volume: 0.8, position: apartment.panPos });
  audio.startLoop('pan.sizzle', {
    volume: 0.26, position: apartment.panPos, ref: 1.1, maxDist: 7,
  });
  hud.say('Two of them, into the pan. Now you wait, which is the part you '
    + 'are actually good at.', 5200);
}

function updateCooking(dt) {
  // The eggs set as they go rather than flipping from raw to done at the end.
  if (game.cooking !== null) apartment.pan.cook?.(game.cooking / COOK_TIME);
  if (game.cooking === null) return;
  game.cooking += dt;
  /* Steam off the pan, same trick as the shower. The whites changing is the
   * close-up read; this is the one that carries across the room, so a player
   * who wanders off can see the cooking still happening. */
  if (game.cooking > 0.8 && Math.random() < dt * 7) smoke.wisp(apartment.panPos);
  if (game.cooking >= COOK_TIME && apartment.state.panState === 'raw') {
    game.cooking = null;
    apartment.pan.cook?.(1);
    apartment.state.panState = 'done';
    audio.stopLoop('pan.sizzle', 0.8);
    hud.toast('Eggs are done', 'good');
    hud.say('Done. Arguably over-done. <em>Nobody is inspecting them.</em>', 4600);
  }
}

/** Eaten standing at the counter, out of the pan, like a person. */
function eatEggs() {
  const st = apartment.state;
  if (st.panState !== 'done') return;
  st.panState = null;
  st.fed = true;
  completeApartmentActivity('eaten', TIME_EVENT_IDS.EAT);
  apartment.pan.contents.visible = false;
  apartment.pan.cook?.(0);        // ready for a pan that will never be used again
  audio.play('egg.eat', { volume: 0.7 });
  audio.say('eat', { chance: 0.9, delay: 1.2 });
  hud.toast('Ate the eggs', 'good');
  hud.say('Eaten standing up, out of the pan, at half past whatever. '
    + '<em>Eat those pasture raised eggs folks.</em>', 5600);

  /* Breakfast starts things moving, but it does not finish the job.
   *
   * Deliberately still a partial: eggs get you most of the way and something
   * else tips you over, which is both funnier and true. A dart, a zyn or the
   * raw milk each take it the rest of the way on their own -- see
   * `startTheUrge` -- so there is no route through this flat that leaves a
   * player unable to work out how to make the toilet's other half happen.
   *
   * And, like every other route, only while there is still a job to do. */
  if (alreadyBeen()) return;
  st.bowel = Math.min(1, st.bowel + 0.62);
  st.bowelCause ??= 'eggs';
}

/* ------------------------------------------------------------------ */
/* The glue                                                            */
/* ------------------------------------------------------------------ */

/*
 * The frame hung too high has been crooked for months, and the thing he
 * fetches to fix it has gone solid round the nozzle, so getting anything out
 * of it takes both hands, a rhythm, and a great deal of effort.
 *
 * NOTHING here names what is in the bottle until it is on the wall. The bit
 * only works as a misdirect, and a misdirect that labels itself is not one:
 * the prompt is about the frame, the lines during it are about the effort, and
 * the word arrives at the same moment the mess does.
 *
 * The bar is the sweeping kind rather than the toilet's reaction kind: you can
 * see where the marker is the whole time, so every miss is your own timing.
 */
const glue = {
  bar: new TimingBar({
    /* Eight, and steeper. Six at 1.11 topped out at a 96ms window on the last
     * one, which is a rhythm you settle into; this ends around 55ms, which is
     * a rhythm you are losing. Nothing is lost by missing -- there is no fail
     * state here, only how long he is stood there for -- so the back half is
     * allowed to be genuinely hard. */
    hits: 8,
    window: [0.74, 0.87],
    speed: 0.80,
    ramp: 1.17,
    onHit: onGlueHit,
    onMiss: () => audio.play('glue.slip', { volume: 0.5, position: apartment.gluePos }),
    onDone: finishGluing,
  }),
  groaning: -1,
};

function startGluing() {
  if (apartment.state.glued || glue.bar.active || glue.groaning >= 0) return;
  glue.bar.start();
  interaction.setPaused(true);
  hud.setPosture('give up on it');
  audio.play('glue.squeeze', { volume: 0.48, rate: 0.92, position: apartment.gluePos });
  hud.say('Crooked for months, this. <em>Right.</em><br>'
    + 'Gone solid round the nozzle, of course. Time it and squeeze.', 5600);
}

function onGlueHit(n, total) {
  /* Each squeeze gets more of him behind it than the last. Scaled on how far
   * through he is rather than on the count, so the last one lands exactly where
   * it always did whatever the total happens to be. */
  const p = n / total;
  audio.play('glue.squeeze', {
    volume: 0.55 + p * 0.36, rate: 1.0 - p * 0.27, position: apartment.gluePos,
  });

  /* The last three are him, not the bottle -- and they REPLACE the effort cue
   * rather than stacking on it, because two efforts at once is mush. Still
   * nothing about what is in his hand: it is a man straining, and what he is
   * straining at is the joke that has not landed yet.
   *
   * Three banks in escalating order rather than three takes in one bank,
   * because say() picks at random inside a bank and a random pick cannot
   * escalate -- and named `heave` rather than `glue` because say() matches on
   * the `vo.<group>.` prefix, so anything filed under glue would join the bank
   * the punchline draws from and he would announce the joke five squeezes
   * early. Spelt out one call at a time so `npm run check` can see all three.
   */
  const fromEnd = total - n;
  if (fromEnd === 2) audio.say('heave.a', { volume: 0.72, delay: 0.10 });
  else if (fromEnd === 1) audio.say('heave.b', { volume: 0.81, delay: 0.10 });
  else if (fromEnd === 0) audio.say('heave.c', { volume: 0.90, delay: 0.10 });
  else if (n >= 3) audio.play('glue.effort', { volume: 0.30 + p * 0.44, delay: 0.10 });

  if (n === total) return;
  // Deliberately says nothing about what is coming out. Just the count.
  hud.toast(`${n}/${total}`, n >= total - 1 ? 'good' : '');
}

/** The long one, and then the reveal. */
function finishGluing() {
  glue.groaning = 0;
  hud.setPosture(null);
  audio.hold(5.2);
  audio.play('glue.groan', { volume: 0.85 });
  hud.say('<em>Nnnnngh.</em>', 5000);
}

/**
 * The moment after.
 *
 * A wash of cool blue over the whole frame, once, then a line about how he
 * feels. It is doing the work the sound cannot: the five seconds before it
 * were straining and the bottle giving is the release, so the picture has to
 * change all at once and then let go of it.
 *
 * The class is removed and re-added on the next frame rather than toggled,
 * because restarting a CSS animation needs the element to lose it and be
 * reflowed -- setting it twice in a row does nothing at all.
 */
function relief() {
  const el = document.getElementById('fx-relief');
  if (el) {
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }
  audio.play('relief.sigh', { volume: 0.6 });
  setTimeout(() => hud.toast('Relaxed. Ready to take on the rest of the day.', 'good'), 900);
}

/**
 * The name on the held-item card.
 *
 * A couple of things carry a count that changes while you hold them, and the
 * card is the only place it is ever shown, so it cannot be a static string in
 * the item table.
 */
function nameFor(id, base) {
  const st = apartment.state;
  if (id === 'cigs') return `Smokes (${st.cigsLeft})`;
  if (id === 'whiskey') return `${base} (${st.whiskeyLeft})`;
  if (id === 'milk') return `${base} (${st.milkLeft})`;
  if (id === 'gun') {
    const spare = st.spareRounds || 0;
    return `${base} (${st.rounds ?? 0}/6${spare ? ` · ${spare} spare` : ''})`;
  }
  return base;
}

/* ------------------------------------------------------------------ */
/* The revolver                                                        */
/* ------------------------------------------------------------------ */

const _shotRay = new THREE.Raycaster();
const _shotDir = new THREE.Vector2(0, 0);
const _muzzleWorld = new THREE.Vector3();

/**
 * Pull the trigger.
 *
 * Six rounds and nothing in the flat to reload with, so the interesting state
 * is the empty click at the end rather than the shots before it. The shot goes
 * where the crosshair is -- straight down the camera, not out of the barrel of
 * the held model, because the held model sits low and right where it does not
 * cover the sights, and firing from there would put the hole off to one side
 * of everything you aimed at.
 */
function fireGun() {
  const st = apartment.state;
  if (st.rounds === undefined) st.rounds = 6;

  if (st.rounds <= 0) {
    audio.play('gun.dry', { volume: 0.6 });
    hud.setHand({ ...ITEMS.gun, name: 'The revolver (0/6)', hint: 'Empty. Nothing here to reload it with.' });
    audio.say('gun.empty', { chance: 0.5, delay: 0.35 });
    return;
  }

  st.rounds--;
  gunKick = 0.34;
  audio.play('gun.shot', { volume: 1.0 });
  apartment.inventory.onChange?.(apartment.inventory);

  heldGun.group.getWorldPosition(_muzzleWorld);
  bullets.muzzle(_muzzleWorld);

  /* What it hit. Everything in the room is a candidate except the held model
   * itself, which is parented to the camera and would otherwise be the only
   * thing every shot ever hits. */
  /* A little spread, from the crosshair outward.
   *
   * Not for realism -- for legibility. Six shots at a fixed aim point land on
   * exactly the same pixel and produce ONE hole, which is what it did: you
   * empty the cylinder into a wall and there is a single dot on it. A couple
   * of degrees of scatter is also what a snub-nosed revolver fired one-handed
   * by a man in a dressing gown actually does. */
  const spread = 0.085;
  _shotDir.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
  _shotRay.setFromCamera(_shotDir, camera);
  _shotRay.far = 40;
  const hits = _shotRay.intersectObject(apartment.root, true);
  const hit = hits.find((h) => h.face && h.object.visible);
  if (hit) {
    const n = hit.face.normal.clone()
      .transformDirection(hit.object.matrixWorld)
      .normalize();
    bullets.punch(hit.point, n);
    audio.play('gun.impact', {
      volume: 0.7, position: hit.point, delay: Math.min(0.12, hit.distance / 340),
    });
  }

  // He has an opinion about having done that.
  audio.say('gun.fire', { chance: st.rounds === 0 ? 1 : 0.35, delay: 0.8 });
}

/**
 * Refill the cylinder from whatever is in his pocket.
 *
 * Six chambers, and it takes what it can rather than requiring a full six --
 * a revolver with four in it is a revolver, and refusing to load because you
 * are two short would be the wrong kind of realism.
 */
function reloadGun() {
  const st = apartment.state;
  const room = 6 - (st.rounds ?? 0);
  if (!room) {
    hud.toast('Already full');
    return;
  }
  const take = Math.min(room, st.spareRounds || 0);
  if (!take) {
    audio.play('gun.dry', { volume: 0.45 });
    hud.toast('Nothing to load it with', 'bad');
    audio.say('gun.empty', { chance: 0.5, delay: 0.4 });
    return;
  }
  st.rounds += take;
  st.spareRounds -= take;
  audio.play('gun.reload', { volume: 0.7 });
  audio.say('gun.reload', { chance: 0.45, delay: 1.1 });
  hud.toast(`Loaded ${take} · ${st.spareRounds} spare`, 'good');
  apartment.inventory.onChange?.(apartment.inventory);
}

function updateGluing(dt) {
  /* Two power bars in this flat share one HUD element, and this one runs later
   * in the frame than Margo's does. Without the bail it clears her bar to null
   * every frame and the fourth morning sweeps an invisible marker. */
  if (margoDress.active) return;
  if (glue.bar.active) {
    glue.bar.update(dt);
    hud.setTiming(glue.bar.view);
    return;
  }
  if (glue.groaning < 0) { hud.setTiming(null); return; }

  hud.setTiming(null);
  const was = glue.groaning;
  glue.groaning += dt;

  // Five seconds of it, and then the bottle gives all at once.
  if (was < 5.0 && glue.groaning >= 5.0) {
    audio.play('glue.burst', { volume: 0.9, position: apartment.gluePos });
    /* The wet one-shot the dress beat also lands on. Two fixing games, one
     * bottle, one noise -- the rhyme is what makes the second one funny. */
    audio.play(DRESS_HELP_FINISH_CUE, { volume: 0.66, position: apartment.gluePos, delay: 0.06 });
    /* All over the frame he was trying to straighten, which is the point:
     * the mess lands on the thing the job was about. */
    splat.spray(-0.10, 2.20, 12);
    apartment.state.glued = true;
    /* And it hangs straight from here on. The frame going level is the ONLY
     * thing on screen that says the job succeeded -- everything else about this
     * moment is the mess -- so it happens on the same frame as the burst. */
    apartment.straightenFrame?.();
    // First and only time the word appears. It is the punchline.
    hud.toast('PVA. Everywhere.', 'bad');
    hud.say('<em>There we go.</em> Whole bottle of wood glue, straight down '
      + 'the picture. <em>It is going to set like that.</em>', 6400);
    audio.say('glue', { delay: 2.4 });
    relief();
  }
  if (glue.groaning > 6.4) {
    glue.groaning = -1;
    interaction.setPaused(false);
  }
}

/* ------------------------------------------------------------------ */
/* Wednesday                                                           */
/* ------------------------------------------------------------------ */

/** How the player finds out there is anything on at all. */
function learnAboutMeeting(source) {
  if (!goals.learn(source)) return;
  campaign.update((state) => {
    state.story.meetingKnown = true;
    state.story.meetingLearnedFrom = source;
  });
  audio.play('ui.select', { volume: 0.4 });
  hud.toast('Crew meeting · Wednesday, 7 PM', 'good');
  // The radio reads the notice out; he answers it, the way you answer a radio.
  audio.say('notice', { delay: source === 'radio' ? 2.4 : 1.0 });
  narrator.note('meeting');
}

/**
 * You looked at the second monitor properly. If Booski has mentioned tomorrow
 * night by now, that is how you found out.
 */
function readChat() {
  const told = chat.read();
  apartment.state.chatUnread = 0;
  apartment.desk.repaintChat(chat);
  if (told) {
    learnAboutMeeting('the chat');
    hud.say('<em>BOOSKIBRO: wed 7pm. im driving.</em><br>'
      + 'Sent hours ago, to a server where nobody answers.', 6000);
  } else {
    hud.say('Nobody has said anything worth reading yet.', 3600);
  }
}

/** The evaluation context every gate is judged against. */
function goalContext() {
  return {
    state: apartment.state,
    drunkLevel: drunk.level,
    stoned: highs.stoned,
    tripping: highs.tripping,
  };
}

function activityContext() {
  return {
    eaten: apartment.state.fed,
    showered: apartment.state.showered,
    peed: game.peed,
    pooped: game.pooped,
    changedClothes: apartment.state.dressed,
    emailChecked: apartment.state.repliedHR,
    whiskeyRelaxed: campaign.state.activities.whiskeyRelaxed,
    /* Day One's optional half. `pcOn` is whether the tower is on right now,
     * which is not the same question -- switching it off again does not
     * un-look at it. */
    pcUsed: apartment.state.pcEverOn === true,
    playedGame: (apartment.state.csDeaths || 0) >= CS_ROUNDS,
    /* The per-chapter pastimes -- see CHAPTER_PASTIMES in
     * core/apartment-story.js. Read out of the CAMPAIGN rather than off the
     * live readings beside them, because these have to survive leaving the
     * flat: the room is rebuilt from nothing on every arrival, so half a
     * minute of the news watched before the airstrip would otherwise be
     * un-watched by the time he lets himself back in. `pastimeWatch()` in the
     * frame loop is what moves a live reading into the campaign, once. */
    watchedTv: campaign.state.activities.watchedTv === true,
    playedCounterSquatch: campaign.state.activities.playedCounterSquatch === true,
    playedSquatchShoot: campaign.state.activities.playedSquatchShoot === true,
    playedSquatchSmash: campaign.state.activities.playedSquatchSmash === true,
    tookShrooms: campaign.state.activities.tookShrooms === true,
    /* A required call is actionable only while the physical phone is actually
     * ringing. ApartmentStory keeps the future ledger row for recovery and QA,
     * but marks it pending until this exact runtime edge says otherwise. */
    ringingCallId: phone.ringing ? phone.call?.def?.eventId ?? null : null,
    /* Not a flag -- the seconds themselves, so the objective can count down
     * rather than sit there saying the same thing for half a minute. */
    tvSeconds: apartment.state.tvWatched || 0,
    /* SM-090. Also not a flag on the save, and deliberately: a car at the kerb
     * is a fact about the room this evening, the same kind of fact as how long
     * the telly has been on, and giving it a slot in `activities` would move
     * the save's shape for a boolean that is true for about four minutes. The
     * door reads it out of here; `actOneCarArrives` is what sets it. */
    carOutside: actOne.carOutside,
  };
}

/** Which pastime costs which slice of the morning. One copy, over there. */
const PASTIME_EVENTS = pastimeActivityEvents();

const APARTMENT_RECOVERY_ACTIVITY_EVENTS = Object.freeze({
  eaten: TIME_EVENT_IDS.EAT,
  showered: TIME_EVENT_IDS.SHOWER,
  peed: TIME_EVENT_IDS.PEE,
  pooped: TIME_EVENT_IDS.POOP,
  changedClothes: TIME_EVENT_IDS.CHANGE_CLOTHES,
  /* And the chapter's own thing. Without these the recovery skip walks
   * `tryLeave` round its loop, meets an activity it cannot complete, and
   * reports `apartment_recovery_blocked` -- a player who asked the game to get
   * him unstuck and was told no because he had not watched the news. */
  ...PASTIME_EVENTS,
});

/** Normalize one required hub activity immediately before a recovery leave. */
function completeApartmentRecoveryActivity(activityId) {
  if (activityId === 'whiskeyRelaxed') {
    campaign.update((state) => { state.activities.whiskeyRelaxed = true; });
    updateObjectives();
    return true;
  }
  const timeEventId = APARTMENT_RECOVERY_ACTIVITY_EVENTS[activityId];
  if (!timeEventId) return false;
  if (activityId === 'eaten') apartment.state.fed = true;
  if (activityId === 'showered') apartment.state.showered = true;
  if (activityId === 'peed') game.peed = true;
  if (activityId === 'pooped') game.pooped = true;
  if (activityId === 'changedClothes') apartment.state.dressed = true;
  /* The pastimes are read out of the campaign rather than off the room, so the
   * flag alone is enough for the door -- but a skipped beat should still leave
   * a room that agrees with it rather than a telly the flat thinks nobody
   * watched. */
  if (activityId === 'watchedTv') apartment.state.tvWatched = TV_WATCH_SECONDS;
  if (activityId === 'playedCounterSquatch') {
    apartment.state.csDeaths = Math.max(apartment.state.csDeaths || 0, CS_ROUNDS);
  }
  if (activityId === 'playedSquatchShoot') apartment.state.shootScore = SHOOT_TARGET_SCORE;
  if (activityId === 'playedSquatchSmash') apartment.state.smashPlayed = SMASH_PLAY_SECONDS;
  if (activityId === 'tookShrooms') apartment.state.shroomsTaken = true;
  completeApartmentActivity(activityId, timeEventId);
  return campaign.state.activities[activityId] === true;
}

/** Settle the current apartment-only cutscene before leaving its chapter. */
function settleApartmentRecoveryBeat() {
  if (apartmentStory.margoComeHomeOwed()) apartmentStory.margoComeHomeDone();
  if (apartmentStory.margoWakeOwed()) apartmentStory.margoWakeDone();
  return true;
}

/**
 * Repaint the morning's list.
 *
 * Cheap enough to call from anywhere something might have been ticked off --
 * the HUD compares the rendered list and does nothing when it reads the same,
 * so this is a string compare on most of the calls.
 */
function updateObjectives() {
  if (!apartment) return;
  hud.setObjectives(apartmentStory.objectives(activityContext()));
}

function syncClockFromCampaign() {
  const { day, timeMinutes } = campaign.state.story;
  time.setTime(day, timeMinutes);
  apartment?.refreshClocks?.();
  hud.setClock(day, time.clock12, time.elapsedReal);
  arcade.setClock?.(time.clock12);
}

/**
 * The chapter's own thing, watched for.
 *
 * Owner note, 2026-08-20: *"I want different objectives to justify each
 * return. Maybe one is watch TV (completes after 30 seconds of watching TV)
 * one is play Counter strike in computer another is play squatch smash and
 * take the mushrooms, etc"* -- the table is CHAPTER_PASTIMES in
 * core/apartment-story.js and this is the half of it that watches the room.
 *
 * Everything below reads something that was already being tracked or was
 * trivially trackable, and the thresholds are deliberately generous: the point
 * of the beat is that he sat down and did a thing, not that he did it well.
 * `completeApartmentActivity` is one-shot per activity id, so each of these
 * fires exactly once and then costs a comparison a frame.
 *
 * THE TELLY IS THE ONE WITH A CLOCK ON IT. It counts only while he is on the
 * couch AND the set is on, so standing in the kitchen with it burbling behind
 * him is not watching television, and neither is sitting in the dark. The
 * couch has had the comment "nothing happens while you are there" on it since
 * the first build; this is the one morning something does.
 */
function pastimeWatch(dt) {
  const st = apartment.state;

  if (game.sitting === 'couch' && tv.on) {
    st.tvWatched += dt;
    if (st.tvWatched >= TV_WATCH_SECONDS
      && campaign.state.activities.watchedTv !== true) {
      completeApartmentActivity('watchedTv', PASTIME_EVENTS.watchedTv);
    }
  }

  /* Counter-Squatch. `csDeaths` is already maintained by the monitor-glow
   * block in the frame loop, which is where "a game with the boys" has always
   * been counted -- CS_ROUNDS of being shot through a wall. */
  if ((st.csDeaths || 0) >= CS_ROUNDS
    && campaign.state.activities.playedCounterSquatch !== true) {
    completeApartmentActivity('playedCounterSquatch', PASTIME_EVENTS.playedCounterSquatch);
  }

  /* Squatch Shoot keeps its own running score and resets it on a new game, so
   * the best of the visit is what counts rather than whatever is on the screen
   * at the instant this runs. */
  if (arcade.app?.id === 'shoot') {
    st.shootScore = Math.max(st.shootScore || 0, arcade.app.score || 0);
  }
  if ((st.shootScore || 0) >= SHOOT_TARGET_SCORE
    && campaign.state.activities.playedSquatchShoot !== true) {
    completeApartmentActivity('playedSquatchShoot', PASTIME_EVENTS.playedSquatchShoot);
  }

  /* Squatch Smash runs as itself in a frame on the monitor (see
   * arcade/campground.js), so there is no score to read out of it and there
   * should not be -- it is a separate game that happens to be installed on
   * this desk. Seconds of it actually up, with him actually in the chair, is
   * the honest reading and it is the only one available. */
  if (arcade.app?.id === 'smash' && game.seated) {
    st.smashPlayed += dt;
    if (st.smashPlayed >= SMASH_PLAY_SECONDS
      && campaign.state.activities.playedSquatchSmash !== true) {
      completeApartmentActivity('playedSquatchSmash', PASTIME_EVENTS.playedSquatchSmash);
    }
  }
}

function completeApartmentActivity(activityId, timeEventId) {
  const result = campaign.advanceTime(timeEventId, (state) => {
    state.activities[activityId] = true;
  });
  syncClockFromCampaign();
  updateObjectives();
  return result;
}

function saveApartmentProgress() {
  campaign.update((state) => {
    state.activities.eaten = apartment.state.fed;
    state.activities.showered = apartment.state.showered;
    state.activities.peed = game.peed;
    state.activities.pooped = game.pooped;
    state.activities.changedClothes = apartment.state.dressed;
    state.activities.emailChecked = apartment.state.repliedHR;
    state.story.meetingKnown = goals.known;
    state.story.meetingLearnedFrom = goals.learnedFrom;
  });
}

const HEIST_DRESSING_BY_PREP = Object.freeze({
  armor: 'heistArmor', gloves: 'heistGloves', mask: 'heistMask',
  carbine: 'heistCarbine', sidearm: 'heistSidearm', magazines: 'heistMagazines',
  duffel: 'heistDuffel',
});
const HEIST_DRESSING_BY_CLEANUP = Object.freeze({
  washed: 'heistWash', changed: 'heistChange', gearSecured: 'heistGearSecured',
});

function syncHeistApartmentProps() {
  if (!apartment?.dressing) return;
  const mission = campaign.state.missions[MISSION_IDS.BANK_HEIST];
  const chapter = campaign.state.story.chapter;
  for (const [id, dressingId] of Object.entries(HEIST_DRESSING_BY_PREP)) {
    const piece = apartment.dressing.get(dressingId);
    if (piece) piece.group.visible = chapter === 'heist_day' && mission.preparation?.[id] !== true;
  }
  for (const [id, dressingId] of Object.entries(HEIST_DRESSING_BY_CLEANUP)) {
    const piece = apartment.dressing.get(dressingId);
    if (piece) piece.group.visible = chapter === 'post_heist' && mission.cleanup?.[id] !== true;
  }
  const cut = apartment.dressing.get('heistCut');
  if (cut) cut.group.visible = chapter === 'post_heist' && mission.prospectShare > 0;
}

function installHeistApartmentInteractions() {
  for (const item of HEIST_PREPARATION_ITEMS) {
    const piece = apartment.dressing.get(HEIST_DRESSING_BY_PREP[item.id]);
    if (!piece) continue;
    interaction.register(piece.group, {
      label: item.label,
      enabled: () => piece.group.visible,
      onUse: () => {
        if (!apartmentStory.collectHeistPreparation(item.id)) return;
        audio.play('heist.apartment.pack', { volume: 0.7 });
        hud.toast(`${item.label.replace(/^(Put on|Take|Pack|Load) /, '')} ready`, 'good');
        syncHeistApartmentProps();
        updateObjectives();
      },
    });
  }
  for (const item of HEIST_CLEANUP_ITEMS) {
    const piece = apartment.dressing.get(HEIST_DRESSING_BY_CLEANUP[item.id]);
    if (!piece) continue;
    interaction.register(piece.group, {
      label: item.label,
      hold: item.id === 'washed' ? 1.4 : 0.8,
      enabled: () => piece.group.visible,
      onUse: () => {
        if (!apartmentStory.completeHeistCleanup(item.id)) return;
        audio.play(`heist.apartment.${item.id}`, { volume: 0.7 });
        hud.toast(item.label, 'good');
        syncHeistApartmentProps();
        updateObjectives();
      },
    });
  }
  syncHeistApartmentProps();
}

/**
 * Which recorded bank the door draws from, by what it is refusing over.
 *
 * These recordings have been in the build since the door was a `Goals` object
 * with its own gate list. That object was replaced by ApartmentStory and its
 * `tryDoor` stopped being called, so thirty-two delivered takes of a man
 * talking himself out of leaving his own flat have been sat in assets/sfx
 * unreachable ever since -- the door has been a silent line of text. This is
 * the wiring back up, keyed off the activity ids the story layer actually
 * returns rather than off a second list that can drift from it.
 */
const DOOR_VO = Object.freeze({
  eaten: 'door.eat',
  showered: 'door.shower',
  peed: 'door.piss',
  pooped: 'door.poop',
  changedClothes: 'door.dressed',
  emailChecked: 'door.hr',
});

/**
 * And the second thing he says when the first one has not worked.
 *
 * The excuse says what is missing; the hint says how. He only reaches for it
 * once you have tried the same locked door twice over the same thing, because
 * a man who tells himself how to have a piss on the first attempt is not a
 * character, he is a tutorial.
 */
const DOOR_HINT_VO = Object.freeze({
  eaten: 'door.hint.eat',
  showered: 'door.hint.shower',
  peed: 'door.hint.piss',
  pooped: 'door.hint.poop',
  changedClothes: 'door.hint.dressed',
});

/** How many times he has tried the handle over each particular thing. */
const doorTries = new Map();

/**
 * The door. It never lists what is missing -- it gives one reason, in his
 * voice, and the reason is whichever thing he would think of first.
 *
 * Second time over the same reason, it also tells him how. That is the only
 * concession the door makes to a player who is stuck, and it is deliberately
 * the character working it out rather than the game explaining itself: the
 * one route that genuinely cannot be reasoned out from the room -- that you
 * need a dart, a zyn or the raw milk before the toilet will do anything -- is
 * the one the second line names outright.
 */
function tryLeave() {
  if (game.left || game.passingOut) return;
  const pos = new THREE.Vector3(2.8, 1.1, 4.3);
  const res = apartmentStory.tryLeave(activityContext());

  if (res.kind === 'go') {
    leaveForMission(res.destination);
    return res;
  }

  audio.play('door.locked', { position: pos, volume: res.kind === 'call' ? 0.8 : 0.7 });
  narrator.note('door');

  const key = res.id ?? res.kind;
  const tries = (doorTries.get(key) ?? 0) + 1;
  doorTries.set(key, tries);

  /* A refusal whose lines are AUTHORED SENTENCES rather than alternate takes.
   *
   * Everything else at this door is one line with a bank of readings of it, so
   * the screen shows the line and `say()` picks a take. THE SPECIAL MEETING's
   * SM-080 is three different sentences with three different cues, and
   * `say()` picks from a bank at random -- so the screen would say "I don't
   * know where it is" while the man said "They're picking me up", which is two
   * people having half a conversation each. `takes` carries each sentence with
   * its own cue, and which one he reaches for is which try this is: the first
   * time he tells the door no, the second time he explains himself to it, the
   * third time he admits he does not know where he is going. Then he repeats
   * the last one, because by then so would anybody. */
  if (res.takes?.length) {
    const take = res.takes[Math.min(tries - 1, res.takes.length - 1)];
    hud.say(take.text, res.kind === 'call' ? 4600 : 5200);
    /* His own words if the take exists, the generic waiting bank until it is
     * recorded -- the same rule the rest of this door already follows, asked
     * of one exact cue instead of a group. */
    if (audio.hasSample(take.cue)) audio.play(take.cue, { volume: 0.85, delay: 0.5 });
    else audio.say('door.wait', { chance: 0.8, delay: 0.5 });
    return res;
  }

  hud.say(res.line, res.kind === 'call' ? 4600 : 5200);

  /* Waiting on a phone call is not something he can go and fix, so it gets a
   * bank of its own and never gets a hint -- there is nothing to hint at.
   *
   * `res.vo` is the refusal's OWN take, and the specific line beats the bank
   * every time: the screen says "Booskibro said he would call about tonight"
   * and the generic bank says "I am not guessing", which is a different
   * sentence about a different evening. `say()` returns false on an empty
   * bank, so this reads as "his own words if they have been recorded, the
   * general-purpose ones until then" and needs no knowledge of what is on
   * disk. */
  if (res.kind === 'call' || res.kind === 'stay') {
    if (!(res.vo && audio.say(res.vo, { delay: 0.5 }))) {
      audio.say('door.wait', { chance: 0.8, delay: 0.5 });
    }
    return res;
  }

  if (!(res.vo && audio.say(res.vo, { delay: 0.35 }))) {
    audio.say(DOOR_VO[key] ?? 'door.beer', { delay: 0.35 });
  }
  if (res.hint && tries >= 2) {
    hud.toast(res.hint, '');
    const hintVo = DOOR_HINT_VO[key];
    if (hintVo) audio.say(hintVo, { delay: 2.6 });
  }
  return res;
}

/** Out of the apartment and into whichever campaign mission is ready. */
function leaveForMission(destination) {
  game.left = true;
  browserInput?.refresh('leave-apartment');
  saveApartmentProgress();
  if (destination === SCENE_IDS.BADA_BING_ONE) {
    campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_ONE, (state) => {
      state.missions[MISSION_IDS.BADA_BING_ONE].status = 'in_progress';
    });
    syncClockFromCampaign();
  }
  if (destination === SCENE_IDS.AIRSTRIP_SMUGGLING) {
    // The mission's own story class flips it to in_progress at the field.
    campaign.advanceTime(TIME_EVENT_IDS.DEPART_AIRSTRIP);
    syncClockFromCampaign();
  }
  if (destination === SCENE_IDS.BADA_BING_TWO) {
    campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_TWO);
    syncClockFromCampaign();
  }
  if (destination === SCENE_IDS.NO_WAKE) {
    campaign.advanceTime(TIME_EVENT_IDS.DEPART_NO_WAKE);
    syncClockFromCampaign();
  }
  if (destination === SCENE_IDS.SILVER_ROOM) {
    // The mission's own story class flips it to in_progress on the pavement.
    campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_ROOM);
    syncClockFromCampaign();
  }
  if (destination === SCENE_IDS.SILVER_PINES) {
    // The round claims its own mission only after its story guard accepts Start.
    campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_PINES);
    syncClockFromCampaign();
  }
  if (destination === SCENE_IDS.BANK_HEIST) {
    campaign.advanceTime(TIME_EVENT_IDS.DEPART_BANK_HEIST, (state) => {
      state.missions[MISSION_IDS.BANK_HEIST].status = 'in_progress';
    }, { required: true });
    syncClockFromCampaign();
  }
  if (destination === SCENE_IDS.COUNTRYSIDE_CABIN) {
    /* Lou's text is the instruction; this is the drive that follows it. The
     * cabin is a second hub, not a mission, so only the exact-once clock moves
     * here. Silver Case remains available while Tony waits out the heat. */
    campaign.advanceTime(TIME_EVENT_IDS.DEPART_COUNTRYSIDE_CABIN);
    syncClockFromCampaign();
  }
  if (destination === SCENE_IDS.INITIATION) {
    /* The Initiation build is deliberately untouched and does not report its
     * own progress, so leaving for it is the only thing the campaign can
     * record. Departure is what marks it started. */
    campaign.advanceTime(TIME_EVENT_IDS.DEPART_INITIATION, (state) => {
      state.missions[MISSION_IDS.INITIATION].status = 'in_progress';
    });
    syncClockFromCampaign();
  }
  if (destination === SCENE_IDS.SPECIAL_MEETING) {
    /* Act One's hour, booked at the front door like every other departure.
     *
     * Thirty-five minutes covering the call, getting changed and going down to
     * a car that is already running -- which is a description of what the
     * player has just spent the evening doing rather than of a gap. The Special
     * Meeting's own page asks for the same marker on boot and gets `applied:
     * false`, because `advanceTime` is an exact-once ledger; whichever arrives
     * first is the only one that moves the clock, and from now on that is this.
     *
     * No mission moves. The Special Meeting is a scene and not a mission -- no
     * MISSION_IDS entry, nothing to fail, no result to record -- and the
     * Initiation is claimed by the Initiation, at the treeline, after the
     * hand-off. Nothing in this flat gets to mark that started. */
    campaign.advanceTime(TIME_EVENT_IDS.DEPART_SPECIAL_MEETING);
    syncClockFromCampaign();
    /* The car is still running out there and it is about to be behind him.
     * Stopping the loop here rather than letting the page unload take it means
     * the fade happens under the blackout instead of cutting mid-idle. */
    audio.stopLoop('specialmeeting.car', 1.4);
    endRingBooskiBack();
  }

  interaction.setPaused(true);
  hud.hidePrompt();
  browserInput?.clear('leave-apartment');
  player.mode = 'frozen';
  audio.say('door.leave', { delay: 0.2 });
  audio.play('door.knob', { volume: 0.8 });
  radio.turnOff?.();

  blackout.querySelector('span').textContent = '';
  blackout.classList.add('on');
  setTimeout(() => {
    navigateCampaign(campaign, destination, {
      location,
    });
  }, 1800);
}

/** Wednesday, eight o'clock, and the flat is exactly as it was. */
function missedIt() {
  if (game.left || goals.missed) return;
  goals.missed = true;
  hud.say('<em>Eight o\'clock.</em> The weekly meeting started without you.', 6000);
  hud.toast('Missed the weekly meeting', 'bad');
}

function showEnding(kind) {
  const e = ENDINGS[kind] || ENDINGS.clean;
  game.paused = true;
  browserInput?.refresh('ending');
  // The blackout sits above the overlay, so it has to come off or the card
  // is delivered to a black rectangle.
  blackout.classList.remove('on');
  overlay.classList.remove('hidden');
  overlay.classList.add('ending');
  overlay.querySelector('h1').innerHTML = 'SQUATCH<span>LIFE</span>';
  overlay.querySelector('.tag').textContent = e.title;
  assetStatus.innerHTML = e.body;
  startBtn.textContent = 'Wake up again';
  startBtn.onclick = () => location.reload();
  /* If he actually left, the night is not over: Lou wants him to stop at the
   * club on the way. Offered rather than forced -- the ending card is still
   * the ending of this game, and the Bing is a different one in the same
   * engine. Nothing is carried over but the fact that he went. */
  if (kind !== 'missed') {
    let next = document.getElementById('next-level');
    if (!next) {
      next = document.createElement('a');
      next.id = 'next-level';
      overlay.querySelector('.panel').appendChild(next);
    }
    /* The handler below owns the real navigation, but the href has to be
     * preview-safe on its own: a middle-click or open-in-new-tab never runs
     * the handler, and a bare `bing.html` out of a preview lands the club on
     * the player's real save. */
    next.href = previewNavigationHref('bing.html');
    next.onclick = (event) => {
      event.preventDefault();
      saveApartmentProgress();
      campaign.advanceTime(TIME_EVENT_IDS.DEPART_BADA_BING_ONE, (state) => {
        state.missions[MISSION_IDS.BADA_BING_ONE].status = 'in_progress';
      });
      syncClockFromCampaign();
      navigateCampaign(campaign, SCENE_IDS.BADA_BING_ONE, {
        spawn: 'driver_seat',
        location,
      });
    };
    next.textContent = 'Later that night: a quick stop at the Bing →';
  }
  document.exitPointerLock?.();
}

/* ------------------------------------------------------------------ */
/* The other thing                                                     */
/* ------------------------------------------------------------------ */

const POOP_CUES = ['poop.1', 'poop.2', 'poop.3', 'poop.4'];

function sitOnToilet() {
  if (game.onToilet || game.passingOut) return;
  game.onToilet = true;
  game.poopTime = 0;
  game.nextPlopAt = 0.8;
  resetPushes();

  /* Sitting down does both jobs. The standing system is all aim; on the
   * throne the bladder just goes down the same hole, so it drains alongside
   * the bowel with the stream sound under you and no scoring. Everybody
   * does this. Nobody talks about it either. */
  game.toiletPee = apartment.state.bladder > 0.04;
  game.peeVolume = 0;
  if (game.toiletPee) audio.startLoop('pee.stream', { volume: 0.0, fade: 0.3 });

  interaction.setPaused(true);
  hud.setMode('seated');
  // Lid up before you sit on it, obviously.
  apartment.toiletLid.rotation.x = -1.9;
  audio.play('chair.sit', { volume: 0.5 });

  player.sitAt(
    { position: apartment.toiletSeat.clone(), yaw: Math.PI, pitch: -0.15 },
    () => { hud.say('Relief.', 3000); hud.setPosture('get up'); },
  );
}

function standFromToilet() {
  hud.setPosture(null);
  resetPushes();
  if (!game.onToilet) return;
  game.onToilet = false;
  if (game.toiletPee) {
    game.toiletPee = false;
    audio.stopLoop('pee.stream', 0.25);
  }
  hud.setMode('walk');
  apartment.state.flushable = true;
  audio.play('pee.zip', { volume: 0.6 });
  player.standFrom(apartment.toiletStand, () => interaction.setPaused(false));
}

/* The chair no longer rolls on WASD. It was a nice idea -- a forearm's reach
 * of lean in every direction -- but it meant the movement keys did TWO things
 * while you were seated: they typed into the computer and they drove your own
 * camera around the desk, so playing anything on the monitor slid you slowly
 * out of your own seat. The owner's ruling is that a seated keyboard belongs
 * to the computer, whole. The chair stays where you sat down on it. */

/* ------------------------------------------------------------------ */
/* Pushing                                                             */
/* ------------------------------------------------------------------ */

/**
 * The push mini-game.
 *
 * Sitting there watching a meter drain is not a thing to do, it is a thing to
 * wait out. So it asks for something: a key appears, you hit it, and the hit
 * IS the joke -- every successful push fires a fart, a plop, a grunt, or some
 * combination, and the meter moves. Miss and you get a strain and nothing.
 *
 * The queue shows three keys ahead so it reads as a rhythm you can play into
 * rather than a series of surprises, which is the difference between a bit and
 * a reaction test.
 */
const PUSH_KEYS = ['W', 'A', 'S', 'D'];
const PUSH_WINDOW = 1.5;      // seconds the live key stays hittable
const PUSH_GAP = 0.55;        // beat between one key and the next
/* Eight or nine pushes to clear a full meter. It was 0.19, which cleared it in
 * five and, with the passive drain on top, often in two -- you pressed a key
 * twice and it was over before it was a game. */
const PUSH_DRAIN = 0.115;

function resetPushes() {
  game.pushLive = 0;
  game.pushT = 0;
  game.pushFlash = null;
  game.pushFlashT = 0;
  hud.setPushes(null);
}

/** Pick the next key to light, never the one already lit. */
function nextPushKey() {
  let i = (Math.random() * PUSH_KEYS.length) | 0;
  if (i === game.pushLive) i = (i + 1 + ((Math.random() * (PUSH_KEYS.length - 1)) | 0)) % PUSH_KEYS.length;
  game.pushLive = i;
}

function updatePushes(dt) {
  const st = apartment.state;
  if (st.bowel <= 0.02) { resetPushes(); return; }

  if (game.pushFlash) {
    game.pushFlashT -= dt;
    if (game.pushFlashT <= 0) game.pushFlash = null;
  }

  game.pushT += dt;
  if (game.pushT > PUSH_WINDOW) {
    // Ran out of time on the live key. Nothing happens, which is its own note.
    game.pushT = -PUSH_GAP;
    nextPushKey();
    audio.play('poop.strain', { volume: 0.5 });
    game.pushFlash = 'miss';
    game.pushFlashT = 0.28;
  }

  /* W A S D, always in that order, always all four on screen -- one of them
   * lights up and that is the one to hit. The old version scrolled a queue of
   * random keys, so you had to read a moving list instead of glancing at a
   * shape you already know from your own keyboard. */
  const live = game.pushT >= 0;
  hud.setPushes(PUSH_KEYS.map((k, i) => ({
    key: k,
    state: i === game.pushLive ? (game.pushFlash || (live ? 'live' : '')) : '',
  })));
}

/** A key went down while sat on the toilet. @returns {boolean} consumed */
function tryPush(code) {
  if (!game.onToilet || apartment.state.bowel <= 0.02) return false;
  if (game.pushT < 0) return false;
  const want = PUSH_KEYS[game.pushLive];
  if (code !== `Key${want}`) return false;

  nextPushKey();
  game.pushT = -PUSH_GAP;
  game.pushFlash = 'hit';
  game.pushFlashT = 0.28;
  apartment.state.bowel = Math.max(0, apartment.state.bowel - PUSH_DRAIN);

  /* Every push makes a noise, and which noise is the whole point. Weighted so
   * the main event is commonest, farts are frequent, and a grunt sometimes
   * rides on top of either. */
  const roll = Math.random();
  if (roll < 0.40) {
    audio.play(POOP_CUES[(Math.random() * POOP_CUES.length) | 0], {
      volume: 0.75, rate: 0.9 + Math.random() * 0.25,
    });
    if (Math.random() < 0.5) audio.play('toilet.plop', { volume: 0.55, delay: 0.30 });
  } else if (roll < 0.78) {
    let i = (Math.random() * FART_CUES.length) | 0;
    if (i === _lastFart) i = (i + 1) % FART_CUES.length;
    _lastFart = i;
    audio.play(FART_CUES[i], { volume: 0.78, rate: 0.8 + Math.random() * 0.4 });
    if (Math.random() < 0.35) {
      audio.play('toilet.plop', { volume: 0.5, delay: 0.42 + Math.random() * 0.3 });
    }
  } else {
    audio.play('poop.grunt', { volume: 0.62, rate: 0.92 + Math.random() * 0.2 });
    audio.play(POOP_CUES[(Math.random() * POOP_CUES.length) | 0], {
      volume: 0.6, rate: 0.9 + Math.random() * 0.2, delay: 0.35,
    });
  }
  return true;
}

function updateBowel(dt) {
  const st = apartment.state;

  if (game.onToilet) {
    game.poopTime += dt;
    // It comes out on its own, slowly. Pushing is what makes it quick.
    st.bowel = Math.max(0, st.bowel - dt * 0.022);
    /* The other tank empties itself meanwhile -- same rate as standing, the
     * loop tapering with what is left, straight into the bowl every time. */
    if (game.toiletPee) {
      const before = st.bladder;
      st.bladder = Math.max(0, st.bladder - dt * 0.075);
      /* Sitting down does both jobs, and the list has to agree: this route
       * emptied the bladder and ticked nothing, so a man who sat down with
       * both tanks full stood up owing the door a piss he had just had. */
      game.peeVolume += before - st.bladder;
      markPeed();
      const power = Math.min(1, 0.25 + st.bladder * 2.2);
      audio.setLoopVolume('pee.stream', 0.10 + power * 0.20, 0.15);
      if (st.bladder <= 0.001) {
        game.toiletPee = false;
        audio.stopLoop('pee.stream', 0.6);
      }
    }
    updatePushes(dt);
    if (st.bowel <= 0.02 && game.poopTime > 3) {
      st.urgeAnnounced = false;
      if (!game._poopDone) {
        game._poopDone = true;
        game.pooped = true;
        completeApartmentActivity('pooped', TIME_EVENT_IDS.POOP);
        audio.say('poop.relief', { delay: 0.6 });
        hud.say('That is that dealt with.', 4000);
      }
    }
    return;
  }
  game._poopDone = false;

  if (st.bowel <= 0) return;

  // Rumbles get closer together the longer you ignore it.
  game.rumbleAt -= dt;
  if (game.rumbleAt <= 0) {
    game.rumbleAt = Math.max(4, 16 - st.bowel * 11) * (0.7 + Math.random() * 0.6);
    if (st.bowel > 0.5) {
      audio.play('belly.rumble', { volume: 0.35 + st.bowel * 0.4 });
    }
  }

  if (st.bowel >= 1 && !st.urgeAnnounced) {
    audio.say('poop.urge', { delay: 0.3 });
    st.urgeAnnounced = true;
    audio.play('belly.rumble', { volume: 0.85 });
    hud.toast('You need to go. Now.', 'bad');
    hud.say(URGE_LINES[st.bowelCause] ?? URGE_LINES.eggs, 6000);
  }
}

/**
 * The thing that just went in, and what it does about five seconds later.
 *
 * One place, so the three routes into the same need cannot drift apart, and so
 * the line that lands names whichever one you actually took. A cause is only
 * recorded when it is the one that TIPPED him -- eggs claim it first and get
 * overwritten by whatever finished the job, because "two eggs and then a dart"
 * is a dart story.
 *
 * @param {'cig'|'zyn'|'milk'|'eggs'} cause
 */
function startTheUrge(cause) {
  const st = apartment.state;
  if (alreadyBeen()) return;
  st.bowelCause = cause;
  st.bowel = 1;
}

/**
 * Whether the morning's second errand is already behind him.
 *
 * A dart is what gets things STARTED. It is not a lever that sends you back to
 * the bathroom every time you pull it -- a man who has already been does not
 * owe the toilet another trip because he lit one afterwards, and being marched
 * off the balcony mid-cigarette by his own guts is a joke that is funny once.
 * So the urge fires once a morning and every route in -- dart, zyn, milk,
 * eggs -- asks here first.
 *
 * Read off the campaign as well as the session so it survives a reload: the
 * save is what the door consults, and the two must not disagree about whether
 * this morning's business is done.
 */
function alreadyBeen() {
  return game.pooped || campaign.state.activities.pooped === true;
}

/** What he says about it, by whatever he has just put in himself. */
const URGE_LINES = Object.freeze({
  cig: 'One cigarette on an empty stomach. <em>Every single time.</em><br>'
    + 'The bathroom. Immediately.',
  zyn: 'That is the zyn. <em>That is always the zyn.</em><br>'
    + 'The bathroom. Immediately.',
  milk: 'Raw milk. Unpasteurised, unhomogenised, and <em>unbelievably</em> fast.<br>'
    + 'The bathroom. Immediately.',
  eggs: 'Two eggs and no patience. <em>The bathroom. Immediately.</em>',
});

/* ------------------------------------------------------------------ */
/* Relieving yourself                                                  */
/* ------------------------------------------------------------------ */

/** Enough of a go that it counts as having been. */
const PEE_ENOUGH = 0.10;

/**
 * Tick the morning's first errand off.
 *
 * Deliberately gated on volume rather than on having pressed the key: the
 * chore is emptying the tank, and unzipping over a full bowl and changing your
 * mind is not that. Called from both routes, because standing over it and
 * sitting down on it are the same job done two ways -- and the sitting route
 * used to tick nothing at all, so a man who did both at once left the flat
 * still owing the list a piss.
 *
 * @param {boolean} inShower down the drain still counts. It happened.
 */
function markPeed({ inShower = false } = {}) {
  if (game.peed) return false;
  /* Either a proper go, or whatever was left emptied to nothing. The second
   * arm matters: wake up with less than PEE_ENOUGH in the tank and the first
   * arm alone can never be satisfied, which would leave a required chore that
   * the flat physically cannot let you finish. */
  const drained = game.peeVolume > 0.012 && apartment.state.bladder <= 0.006;
  if (game.peeVolume < PEE_ENOUGH && !drained) return false;
  game.peed = true;
  completeApartmentActivity('peed', TIME_EVENT_IDS.PEE);
  if (inShower) hud.toast('Nobody will ever know', 'good');
  else hud.toast('That is one off the list', 'good');
  return true;
}

function startPee() {
  if (game.peeing || game.passingOut) return;
  game.peeing = true;
  game.peeTime = 0;
  game.peeVolume = 0;
  /* In the shower it goes down the drain and there is nothing to aim at, so
   * the stream retargets to the tub floor and accuracy stops being scored.
   * Everybody does this. Nobody says it. */
  game.inShower = game.showering !== null;
  if (game.inShower) {
    stream.setTarget(apartment.tubDrain, 0.30, 0.02, null);
  } else {
    stream.setTarget(
      apartment.toiletBowl, apartment.toiletBowlRadius,
      apartment.toiletWaterY, apartment.toiletCollider,
    );
  }

  /* Seat and lid up, which is the one bit of etiquette he does observe.
   * Standing over a closed lid and going anyway was not a joke, it was a bug. */
  if (!game.inShower) {
    apartment.toiletLid.rotation.x = -1.92;
    apartment.toiletSeatPivot.rotation.x = -1.78;
    audio.play('toilet.lid', { volume: 0.5, position: apartment.toiletBowl });
  }
  stream.resetStats();
  audio.play('pee.zip', { volume: 0.7 });
  audio.startLoop('pee.stream', { volume: 0.0, fade: 0.25 });
  audio.startLoop('pee.miss', { volume: 0.0, fade: 0.25 });
  game.peeHitSnapshot = 0;
  game.peeMissSnapshot = 0;
  game.peeAccuracy = 1;
  hud.say('You are free to look around.', 3200);
  hud.setPosture('stop');
}

function stopPee() {
  if (!game.peeing) return;
  game.peeing = false;
  hud.setPosture(null);
  // Read it before clearing it -- the report below depends on where you were.
  const wasInShower = game.inShower;
  game.inShower = false;

  if (!wasInShower) {
    // Seat back down. He is not an animal.
    apartment.toiletSeatPivot.rotation.x = 0;
    setTimeout(() => { if (!game.peeing && !game.onToilet) apartment.toiletLid.rotation.x = 0; }, 700);
  }
  audio.stopLoop('pee.stream', 0.25);
  audio.stopLoop('pee.miss', 0.25);
  audio.play('pee.zip', { volume: 0.6 });

  const s = stream.stats;
  if (wasInShower) {
    hud.toast('Nobody will ever know', 'good');
    hud.say('Straight down the drain. <em>This is why you shower.</em>', 4200);
    return;
  }
  if (s.total > 12) {
    const acc = s.onTarget / s.total;
    audio.say('pee', { chance: 0.6, delay: 0.7 });
    hud.toast(`${Math.round(acc * 100)}% on target`, acc > 0.7 ? 'good' : 'bad');
    hud.say(acc > 0.85
      ? 'Immaculate. Nobody will ever know how well that went.'
      : acc > 0.45
        ? 'Some of that went in. Some of it did not.'
        : 'You have made this room worse. Measurably worse.', 4800);
  }
}

function updatePee(dt) {
  const st = apartment.state;

  // The tank fills over time, faster once you have been drinking.
  if (!game.peeing && !game.toiletPee) {
    /* Baseline is slow enough to ignore; drink and it is not.
     * It used to fill in about six real minutes stone cold sober, which meant
     * the bathroom was a chore on a timer rather than a consequence of the
     * fridge. Halved at rest, and each drink counts for much more. */
    st.bladder = Math.min(1, st.bladder + dt * 0.0013
      * (1 + st.beersDrunk * 1.25 + st.whiskeyDrunk * 0.85));
  }
  // One meter, showing whichever is more urgent.
  if (st.bowel > st.bladder) hud.setBladder(st.bowel, game.onToilet, 'urgency');
  else hud.setBladder(st.bladder, game.peeing || game.toiletPee, 'bladder');

  if (!game.peeing) return;

  game.peeTime += dt;
  const before = st.bladder;
  st.bladder = Math.max(0, st.bladder - dt * 0.075);
  game.peeVolume += before - st.bladder;
  markPeed({ inShower: game.inShower });

  // Ramp in, hold, then taper as the tank empties.
  const ramp = Math.min(1, game.peeTime / 0.45);
  const power = ramp * Math.min(1, 0.25 + st.bladder * 2.2);

  // Where it is landing decides what you hear: bowl water, or tile. Measured
  // over the drops that died this frame, then smoothed -- reading the running
  // total instead would mean an early miss haunts the whole session.
  const s = stream.stats;
  const hit = s.onTarget - game.peeHitSnapshot;
  const miss = (s.onFloor + s.onWall) - game.peeMissSnapshot;
  game.peeHitSnapshot = s.onTarget;
  game.peeMissSnapshot = s.onFloor + s.onWall;
  if (hit + miss > 0) {
    const acc = hit / (hit + miss);
    game.peeAccuracy += (acc - game.peeAccuracy) * Math.min(1, dt * 8);
  }
  const level = 0.10 + power * 0.22;
  audio.setLoopVolume('pee.stream', level * game.peeAccuracy, 0.15);
  audio.setLoopVolume('pee.miss', level * (1 - game.peeAccuracy) * 1.15, 0.15);

  // The stream leaves from hip height but has to go where you are *looking*,
  // so aim at a point on the camera ray rather than copying the camera's
  // direction -- otherwise looking down at the bowl always lands short.
  camera.getWorldPosition(_v);
  camera.getWorldDirection(_dir);
  _aimPoint.copy(_v).addScaledVector(_dir, 1.25);

  _origin.copy(_v).addScaledVector(_dir, 0.18);
  _origin.y -= 0.58;

  _aim.copy(_aimPoint).sub(_origin).normalize();
  stream.emit(_origin, _aim, dt, power);

  if (st.bladder <= 0.001) stopPee();
}

const _pickBag = [];
function pick(list) {
  void _pickBag;
  return list[(Math.random() * list.length) | 0];
}

/* ------------------------------------------------------------------ */
/* Passing out                                                         */
/* ------------------------------------------------------------------ */

/**
 * Wipe yesterday off the flat.
 *
 * Only the four things the door has ever counted, plus the props that back
 * them: the eggs he ate are back in the fridge, the pan is clean, and the
 * shirt he put on yesterday is yesterday's shirt. Everything else about the
 * flat -- the beer he drank, the picture he glued back up, the phone in his
 * pocket -- is his own history and stays where he left it.
 */
function startNewMorning() {
  const st = apartment.state;
  st.heldItem = null;
  st.fed = false;
  st.showered = false;
  st.dressed = false;
  st.hasEggs = false;
  st.panState = null;
  game.pooped = false;
  game.poopTime = 0;
  game.peed = false;
  game.peeVolume = 0;
  /* A morning starts with a full one. It is the first thing a man deals with
   * and it is now the first thing on the list, so it has to be dealable-with
   * the moment he is on his feet rather than after twenty minutes of standing
   * about waiting for his own bladder to fill. */
  st.bladder = Math.max(st.bladder, 0.52);
  st.bowel = Math.max(st.bowel, 0.35);
  st.bowelCause = null;
  // A new morning is a new set of excuses; he has not tried this door yet today.
  doorTries.clear();
  /* And the room itself. Sleeping is the only thing that turns a chapter, so
   * it is the only thing that has to re-dress the flat without a reload --
   * read back off the campaign rather than passed in, so a morning reached by
   * sleeping and the same morning reached by reloading are the same room. */
  apartment.applyChapterDressing(campaign.state.story.chapter);
  updateObjectives();
}

/**
 * Day Two opens on the murder bulletin, not a random DJ break. The phone
 * begins ringing twenty seconds after that broadcast starts whether Tony is
 * still in bed or already walking to the kitchen; ApartmentStory still owns
 * the normal retry behavior if he lets it ring out.
 */
function startDayTwoOpening() {
  const state = campaign.state;
  if (state.story.chapter !== 'day_two'
    || state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL]?.status === 'answered') return false;
  radio.prepareBroadcast();
  apartment.state.radioOn = radio.on;
  return playNews('radio', {
    // The authored twenty seconds begins when the bulletin is actually heard,
    // not while its short power-up delay is still running.
    onStart: () => apartmentStory.beginMorning({
      delay: DAY_TWO_CALL_AFTER_BULLETIN,
      reset: true,
    }),
  });
}

/** Resume the saved receiver on every authored morning, not only Day Two. */
function startMorningRadio() {
  if (startDayTwoOpening()) return true;
  if (!radio.preferredOn) return false;
  radio.turnOn({ remember: false });
  apartment.state.radioOn = radio.on;
  playNews('radio');
  return true;
}

/* ------------------------------------------------------------------ */
/* What the flat has to say about yesterday                            */
/* ------------------------------------------------------------------ */

/** A line with no recording holds for this long, plus a bit per character. */
const READ_BASE = 1.3;
const READ_PER_CHAR = 0.042;

/**
 * Speak one authored line, recorded or not.
 *
 * The same rule the phone uses: play the cue, and hold for as long as the
 * recording lasts, or for a reading beat if there is no recording yet. Every
 * line written this wave goes through here, so authoring content and recording
 * it are separate jobs and neither blocks the other.
 *
 * @returns {number} seconds the line should hold the floor
 */
function speakLine(cue, text, { volume = 0.9, subtitle = null, speaker = null } = {}) {
  const source = audio.play?.(cue, { volume });
  const hold = source?.buffer
    ? source.buffer.duration + 0.4
    : READ_BASE + text.replace(/<[^>]+>/g, '').length * READ_PER_CHAR;
  /* The mouth, when the line belongs to somebody with a face in the room —
   * Margo is the case. Handed the TAKE rather than the hold, so a recorded
   * line runs the jaw on its own amplitude and closes when the recording
   * does; an unrecorded one animates on the fallback envelope for exactly
   * the subtitle's length (src/core/mouth.js). */
  speaker?.say?.(hold, source ? { audio, source } : null);
  hud.say(subtitle ?? text, Math.round(hold * 1000));
  return hold;
}

/** Play a list of {cue, text[, speaker]} in order, one after the other. */
function speakSequence(turns, { onDone = null } = {}) {
  let i = 0;
  const step = () => {
    if (i >= turns.length) { onDone?.(); return; }
    const turn = turns[i++];
    const hold = speakLine(turn.cue, turn.text, { subtitle: turn.subtitle, speaker: turn.speaker });
    setTimeout(step, Math.round(hold * 1000) + 220);
  };
  step();
}

/**
 * Play whatever is on the answering machine this morning.
 *
 * Optional in every sense: nothing waits on it, nothing unlocks, and the
 * campaign only records that it happened so the tape does not replay on the
 * next load. It is how Day Two finds out that somebody heard about the
 * restaurant, and how Day Three finds out that Lou has stopped saying things.
 */
function playMessages() {
  const waiting = apartmentStory.messages();
  if (!waiting.list.length) {
    hud.say('Nothing on it. There is never anything on it.', 3000);
    return false;
  }
  if (waiting.heard) {
    hud.say('You have heard it. It does not get better.', 3000);
    return false;
  }
  apartmentStory.hearMessages();
  syncClockFromCampaign();
  apartment.setMessagesWaiting(0);
  audio.play('ui.select', { volume: 0.4 });
  const turns = [];
  for (const message of waiting.list) {
    turns.push({
      cue: `vo.${message.vo}.0`,
      text: `<em>${message.from} · ${message.at}</em>`,
    });
    message.lines.forEach((line, i) => {
      turns.push({ cue: `vo.${message.vo}.${i + 1}`, text: `${message.from}: ${line}` });
    });
  }
  speakSequence(turns);
  return true;
}

/**
 * What the news is saying, on whichever box he just switched on.
 *
 * Nothing before Day Two, because until then he has not done anything worth
 * reporting. Never names him -- a bulletin that named him would be a plot
 * point, and this is weather.
 */
function playNews(station, { onStart = null } = {}) {
  const bulletin = apartmentStory.news()?.[station];
  if (!bulletin || radio.hasHeardBulletin(bulletin.vo)) return false;
  setTimeout(() => {
    if (station === 'radio' && !radio.on) return;
    if (radio.hasHeardBulletin(bulletin.vo)) return;
    radio.markBulletinHeard(bulletin.vo);
    if (station === 'radio') {
      const hold = radio.broadcast({ cue: `vo.${bulletin.vo}.1`, line: bulletin.line });
      apartment.state.radioOn = radio.on;
      onStart?.({ hold, bulletin });
      hud.say(`<em>97.8 · the wire</em> ${bulletin.line}`, Math.round(hold * 1000));
      return;
    }
    const hold = speakLine(`vo.${bulletin.vo}.1`, bulletin.line, {
      volume: 0.75,
      subtitle: `<em>${station === 'radio' ? '97.8 · the wire' : 'KSQCH · news'}</em> ${bulletin.line}`,
    });
    onStart?.({ hold, bulletin });
  }, 900);
  return true;
}

/* ------------------------------------------------------------------ */
/* THE SPECIAL MEETING — LEGACY STARTER-FLAT COMPATIBILITY             */
/* ------------------------------------------------------------------ */

/**
 * Compatibility staging for saves created before Beat 27 moved to the luxury
 * apartment. Fresh campaign saves do not return to this flat after the Palace.
 *
 * `docs/SPECIAL-MEETING-SCRIPT.md`, beats SM-010 to SM-090. The words and
 * their cue names are all authored elsewhere -- `src/specialmeeting/script.js`,
 * reached through `SPECIAL_MEETING_ACT_ONE` in core/apartment-story.js -- so
 * nothing below writes a line of dialogue. This is the half that decides WHEN.
 *
 * The order of the evening, and what drives each part:
 *
 *   SM-010  idle, before the call        `updateActOne`, on the still timer
 *   SM-020  the phone rings              `ApartmentStory`, after ACT_ONE_RING_DELAY
 *   SM-030  THE CALL                     core/phone.js, off SPECIAL_MEETING_BOOSKI_CALL
 *   SM-040  the dead line                `actOneCallEnded`, off the phone's own hang-up
 *   SM-050  ringing him back             `ringBooskiBack`, [R] with the phone in hand
 *   SM-060  idle, after the call         `updateActOne`, same timer, other bank
 *   SM-070  getting ready                the nightstand drawer's `onDressed`
 *   SM-080  door refusals                `tryLeave`, out of ApartmentStory
 *   SM-090  headlights                   `actOneCarArrives`, on the wait timer
 *
 * ## The narrator does not speak tonight
 *
 * `core/narrator.js` is the flat's own voice and it is a comedian: "There is no
 * objective. There was never going to be one." It has been the right voice for
 * every other hour spent in here and it is the wrong one for this one, and
 * worse, it is a SECOND voice competing for the same subtitle bar as Tony's --
 * two idle speakers taking turns is not twice the flat, it is neither of them.
 * So on this night the narrator is switched off and Tony's own eight lines
 * take the idle timer instead. See `narrator.enabled` below.
 *
 * ## Nothing here reassures him
 *
 * The script's forbidden-line list is a rule about the HUD as much as the cast:
 * no toast, no subtitle and no objective may tell the player he is safe or say
 * what the meeting is. The only instructions in this whole section are which
 * button rings a telephone.
 */

/**
 * How long he is left alone in the flat before Booskibro rings.
 *
 * Every other call in this campaign is six seconds after he is up and about,
 * because every other call is the thing he is waiting for. This one is the
 * opposite: SM-010 is eight lines of a man with nothing to do and nobody to
 * tell, and they need somewhere to happen. Long enough for two or three of
 * them, short enough that a player who sits still is not sitting still for a
 * chapter -- and a player who does not sit still hears fewer of them, which is
 * how an idle bank is supposed to work.
 */
const ACT_ONE_RING_DELAY = 74;
/**
 * And how long after the call before headlights land on the ceiling.
 *
 * "They'll be there soon" is all he is given, so the wait is real and he
 * spends it doing the two things the big night asks of him. The short version
 * is for a reload: the car does not un-arrive because somebody refreshed the
 * page, and making him serve the full sentence twice would be the flat
 * punishing him for it. Neither number is a save field -- see `carOutside` in
 * `#specialMeetingDoor`.
 */
const ACT_ONE_CAR_WAIT = 170;
const ACT_ONE_CAR_WAIT_RESUMED = 16;
/** Stand still this long and he says one. Then this long again. */
const ACT_ONE_IDLE_AFTER = 19;
const ACT_ONE_IDLE_GAP = 31;
/** How long the earpiece rings, unanswered, before he takes it off his ear. */
const ACT_ONE_RINGBACK_SECONDS = 11;
/** The headlights, swinging across the ceiling and stopping. */
const ACT_ONE_SWEEP_SECONDS = 2.4;
/** What the beam settles at, and how much brighter it is mid-swing. */
const ACT_ONE_BEAM_RESTING = 8.5;
const ACT_ONE_BEAM_SWELL = 5.0;

const actOne = {
  /** Cues already spoken this session, so no line lands twice. */
  said: new Set(),
  /** Seconds he has been still, and how long is left before the next line. */
  still: 0,
  cooldown: 14,
  /** True once Booskibro has hung up. SM-040 and SM-050 both wait for it. */
  hungUp: false,
  /** Seconds until the car, or null while nothing has been set moving. */
  carIn: null,
  /** Outside, engine running. `activityContext` hands this to the door. */
  carOutside: false,
  /** Which of SM-050's three lines the next ring-back ends on. */
  rungBack: 0,
  /** Seconds of unanswered ringing left, or 0 when he is not on the phone. */
  ringingOut: 0,
  /** Which of SM-070's mirror lines the drawer gets next. */
  dressed: 0,
  /** The headlight rig, built the first time it is needed, and its sweep. */
  beam: null,
  sweep: 0,
};

/**
 * Has SM-030 happened?
 *
 * Off the campaign rather than off `actOne`, because the answer has to survive
 * a reload and `actOne` does not: everything else in this section is about one
 * session in one room, and this one fact is the evening's hinge.
 */
function specialMeetingCallTaken() {
  return campaign.state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL]?.status === 'answered';
}

/**
 * The bank the idle timer draws from. Same flat, different man.
 *
 * SM-060 REPLACES SM-010 rather than joining it -- the script is explicit --
 * so a line he never got round to hearing before the phone rang is one he
 * never hears. He has stopped having those thoughts.
 */
function actOneIdleBank() {
  return specialMeetingCallTaken()
    ? SPECIAL_MEETING_ACT_ONE.idleAfter
    : SPECIAL_MEETING_ACT_ONE.idleBefore;
}

/** Say one authored take, and never say it again this session. */
function sayActOne(take, opts = {}) {
  if (!take) return 0;
  actOne.said.add(take.cue);
  return speakLine(take.cue, take.text, opts);
}

/** The first line in a bank he has not used yet, or null once it is empty. */
function nextActOne(bank) {
  return bank.find((take) => !actOne.said.has(take.cue)) ?? null;
}

/**
 * Tony, alone in his own front room, saying things to nobody.
 *
 * Deliberately the same shape as the narrator's idle rule and deliberately
 * quieter about it: he waits for the room to be silent (`hud.saying` is the
 * subtitle bar, which the radio, the telly and the phone all take), he waits
 * for the player to stop moving, and he never repeats himself. Eight lines
 * before the call and eight after, and running out is a real outcome -- a man
 * who has said everything he has to say goes quiet, which is worse.
 */
function updateActOne(dt, { busy = false, moving = false } = {}) {
  if (!specialMeetingNight || game.left) return;
  actOne.cooldown -= dt;
  actOne.still = busy || moving ? 0 : actOne.still + dt;

  /* The earpiece, ringing out at Booskibro's end. Counted here rather than on
   * a timeout so pausing the game pauses the call, like everything else. */
  if (actOne.ringingOut > 0) {
    actOne.ringingOut -= dt;
    if (actOne.ringingOut <= 0) endRingBooskiBack();
  }

  if (actOne.carIn !== null) {
    actOne.carIn -= dt;
    if (actOne.carIn <= 0) actOneCarArrives();
  }
  if (actOne.sweep > 0) updateActOneHeadlights(dt);

  if (busy || actOne.cooldown > 0 || hud.saying) return;
  if (actOne.still < ACT_ONE_IDLE_AFTER) return;
  const take = nextActOne(actOneIdleBank());
  if (!take) return;
  sayActOne(take);
  actOne.still = 0;
  actOne.cooldown = ACT_ONE_IDLE_GAP;
}

/**
 * SM-040. Booskibro hangs up first, mid-air, and Tony stands there holding it.
 *
 * Wired to the phone's own call-state callback rather than to a timer, so it
 * lands on the real end of the real conversation however long the takes turn
 * out to be once they are recorded. The button prompt comes AFTER his line and
 * not on the same frame as it: `docs/TONE-AND-PARODY.md` -- the character
 * speaks, and then the screen clarifies.
 */
function actOneCallEnded() {
  if (!specialMeetingNight || actOne.hungUp) return;
  actOne.hungUp = true;
  /* And the car is now on its way, whatever he does with the next few
   * minutes. Set here rather than at the door so a player who never touches
   * the handle still gets his headlights. */
  actOne.carIn = ACT_ONE_CAR_WAIT;
  const hold = sayActOne(SPECIAL_MEETING_ACT_ONE.deadLine[0]);
  setTimeout(() => {
    if (game.left) return;
    hud.toast('Phone in hand · [R] rings the last caller back', '', 9000);
  }, Math.round(hold * 1000) + 400);
  updateObjectives();
}

/** Whether [R] currently means anything, which is: has Booskibro rung off. */
function canRingBooskiBack() {
  return specialMeetingNight
    && actOne.hungUp
    && !phone.call
    && apartment?.state?.heldItem === 'phone';
}

/**
 * SM-050. He rings Booskibro back, and it goes nowhere.
 *
 * The first thing in this scene that is actually WRONG, and it is wrong by
 * doing nothing: it does not go to voicemail, it does not get answered, it is
 * not engaged. It rings. The player is allowed to do this as many times as he
 * likes and gets a different line about it three times.
 *
 * The sound is `phone.ring` held quiet and lowpassed, which is the handset's
 * own ring standing in for a ringback tone in an earpiece -- there is no
 * ringback cue in the manifest and minting one belongs to the pass that owns
 * `assets/sfx/manifest.json`. What the player hears is a telephone ringing
 * somewhere it is not being picked up, which is the whole content of the beat.
 */
function ringBooskiBack() {
  if (!canRingBooskiBack() || actOne.ringingOut > 0) return false;
  actOne.ringingOut = ACT_ONE_RINGBACK_SECONDS;
  audio.startLoop('specialmeeting.ringback', {
    name: 'phone.ring',
    volume: 0.22,
  });
  audio.setLoopCutoff('specialmeeting.ringback', 1400, 0.1);
  hud.say('<em>Calling Booskibro.</em>', 4000);
  return true;
}

/** The player hangs up, or gives up waiting. Either way, nobody answered. */
function endRingBooskiBack() {
  if (actOne.ringingOut <= 0 && !audio.loops?.has?.('specialmeeting.ringback')) return;
  actOne.ringingOut = 0;
  audio.stopLoop('specialmeeting.ringback', 0.12);
  audio.play('phone.hangup', { volume: 0.5 });
  const bank = SPECIAL_MEETING_ACT_ONE.callBack;
  const take = bank[Math.min(actOne.rungBack, bank.length - 1)];
  actOne.rungBack += 1;
  setTimeout(() => { if (!game.left) sayActOne(take); }, 500);
}

/**
 * SM-070. Getting dressed for something nobody has described to him.
 *
 * Both the closet rail and the legacy nightstand route feed this one callback,
 * so the same getting-ready beat survives whichever clean shirt the player
 * actually reaches first. The bathroom mirror now reflects the persisted
 * choice; the line still belongs to dressing, not to entering that room.
 *
 * Called from `onDressed` AFTER the ordinary toast, because the ordinary toast
 * is the flat behaving normally and that is the joke he is standing inside.
 */
function actOneDressed() {
  if (!specialMeetingNight) return;
  const bank = SPECIAL_MEETING_ACT_ONE.gettingReady;
  const take = bank[Math.min(actOne.dressed, bank.length - 1)];
  actOne.dressed += 1;
  setTimeout(() => { if (!game.left) sayActOne(take); }, 1600);
}

/**
 * The headlights, and the engine that never switches off.
 *
 * A spotlight outside the east window, below the sill, throwing up and in --
 * the flat is upstairs and the car is at the kerb, so the beam lands on the
 * ceiling and the far wall rather than on the floor. It swings across, slows,
 * and stops, and then it simply stays there, which is the point: nobody gets
 * out, nobody knocks, and the engine is still running when he gets outside.
 *
 * Built here rather than in `src/world/apartment.js` because it belongs to one
 * evening rather than to the flat, and because that file builds every other
 * night in the campaign too.
 */
function actOneHeadlightRig() {
  if (actOne.beam) return actOne.beam;
  const target = new THREE.Object3D();
  /* Starting aim: through the window and onto the ceiling well to the north,
   * so the sweep crosses the room rather than arriving already pointed at it. */
  target.position.set(-4.2, 2.68, -7.4);
  scene.add(target);
  const light = new THREE.SpotLight(0xfff3dc, 0, 30, 0.40, 0.62, 1.05);
  light.position.set(8.6, 0.30, -3.10);
  light.castShadow = false;
  light.target = target;
  scene.add(light);
  actOne.beam = { light, target };
  return actOne.beam;
}

/**
 * Ease the sweep out, then leave it exactly where it stopped.
 *
 * The numbers are scaled against the room's own ceiling lamp, which is a
 * 9.5-intensity spot two metres off the furniture at decay 1.4 (`ceilSpot` in
 * src/world/apartment.js). This one is thirteen metres away at decay 1.05, so
 * a comparable figure arrives at the far wall an order of magnitude softer --
 * which is what is wanted. Headlights through somebody's window are a change
 * in the room, not a light in it, and the flat's own lamps stay brighter than
 * they are whether or not he has switched any on.
 *
 * The swell in the middle is the car still turning: a beam sweeping past you
 * is brightest as it crosses, and it settles once it has stopped moving.
 */
function updateActOneHeadlights(dt) {
  const rig = actOne.beam;
  if (!rig) { actOne.sweep = 0; return; }
  actOne.sweep = Math.max(0, actOne.sweep - dt);
  const done = 1 - actOne.sweep / ACT_ONE_SWEEP_SECONDS;
  const eased = 1 - (1 - done) ** 3;
  rig.target.position.z = -7.4 + eased * 9.2;
  rig.light.intensity = ACT_ONE_BEAM_RESTING
    + Math.sin(Math.min(1, done * 1.4) * Math.PI) * ACT_ONE_BEAM_SWELL;
  /* And then it does not move again. Nobody gets out, nobody knocks, and this
   * light is still on the ceiling when he finally opens the door. */
  if (actOne.sweep <= 0) rig.light.intensity = ACT_ONE_BEAM_RESTING;
}

/**
 * SM-090. They are outside. Nobody knocks.
 *
 * Order matters and it is the tone doctrine's: the room changes first -- light
 * across the ceiling, an engine you can hear through the glass -- and Tony
 * says what he makes of it after. Nothing on screen tells the player to go
 * downstairs; the door does that itself the next time he touches it, and the
 * objective panel picks up "Leave for the car downstairs" on its own second.
 */
function actOneCarArrives() {
  if (actOne.carOutside) return;
  actOne.carIn = null;
  actOne.carOutside = true;
  actOneHeadlightRig();
  actOne.sweep = ACT_ONE_SWEEP_SECONDS;
  audio.startLoop('specialmeeting.car', {
    name: 'car.engine.idle',
    volume: 0.16,
    position: new THREE.Vector3(6.4, 0.2, -3.1),
    maxDist: 20,
  });
  // Through a closed window, from a floor below. It is a presence, not a sound.
  audio.setLoopCutoff('specialmeeting.car', 520, 0.4);
  const bank = SPECIAL_MEETING_ACT_ONE.headlights;
  const take = nextActOne(bank) ?? bank[0];
  setTimeout(() => { if (!game.left) sayActOne(take); }, 1500);
  updateObjectives();
}

/* ------------------------------------------------------------------ */
/* The fourth morning                                                  */
/* ------------------------------------------------------------------ */

/**
 * Margo wakes up beside him, says her piece, gets dressed and goes.
 *
 * NOT a cutscene in the sense that ever mattered to the complaint this
 * replaced: he can get up and walk off the moment his eyes open, same as any
 * other morning. What used to make it one -- `interaction.setPaused(true)`
 * held for the length of the dialogue, and a `game.margoScene` check ahead of
 * the ordinary get-up key that swallowed it -- is gone. She still keeps the
 * room (the beats below move her through the same lying/sitting/standing
 * progression whether or not he is watching), and the one interactive beat
 * still waits for him; it no longer waits FOR HIM TO WAIT FOR IT.
 *
 * She never assumes the kneeling, hands-and-knees position on her own. That
 * used to be a scheduled beat like the others -- she went down for it at a
 * fixed second, whether or not anyone had asked, and the player found her
 * already in position with an interaction prompt sitting on a pose he never
 * triggered. Now `startMargoDressHelp` is the ONLY place `setPose('kneeling')`
 * is called, and it only runs from `apartment.margo.helpTarget`'s own
 * `onUse`, which only fires off a real keypress. Ask, then wait, then kneel.
 *
 * Everything about it is one-shot and durable: `margoWakeOwed` reads the
 * campaign, `margoWakeDone` writes the campaign, so reloading the fourth
 * morning after she has gone does not bring her back.
 */
/**
 * The morning's beats: when she moves, and where he is looking when she does.
 *
 * `look` is a point in the room, not an angle, so the camera aim is derived
 * from where she actually is rather than from a number somebody typed twice.
 * Aim is only ever applied while he is still lying down -- `updateMargoWake`
 * guards every write to `player.*` on `player.mode === 'bed'` -- so a man who
 * got straight up loses none of his own mouse to a scene that used to own it
 * unconditionally.
 */
const MARGO_BEATS = [
  /* Aimed at chest height rather than at the top of her head. She is about a
   * metre away and he is flat on his back, so aiming at a face puts the
   * ceiling in three quarters of the frame.
   *
   * The first beat has no aim at all, on purpose: she is sixty centimetres off
   * his eye, and turning his head toward her there gets you a cotton wall. He
   * wakes looking at his own ceiling, hears her, and turns over when she sits
   * up -- which is the shape of the morning anyway. */
  { at: 0.0, pose: 'lying', look: null, cue: null },
  { at: 6.4, pose: 'sitting', look: [-3.12, 1.00, -3.30], cue: 'bed.rustle' },
  /* She is up and beside the bed, dressed but not yet asking -- NOT kneeling.
   * That pose is earned, not scheduled; see `startMargoDressHelp`. */
  { at: 14.0, pose: 'standing', look: [-2.80, 1.30, -3.00], cue: 'bed.rustle' },
];
/*
 * Where he is looking, and it is not a number somebody liked the sound of:
 * both of these are the measured world position of the thing worth looking at
 * in that pose. The help aim is her hit volume, which rides the torso, so
 * bending her over moved it 27cm east and 8cm down and the aim moved with it.
 * The standing aim is her face at the corrected standing height.
 */
const MARGO_HELP_LOOK = [-2.51, 0.66, -3.12];
const MARGO_STAND_LOOK = [-2.80, 1.30, -3.00];
/**
 * Seconds after which the morning offers the interactive beat regardless.
 *
 * The four lines run well under fifty seconds end to end. This is the floor
 * under them, not the schedule: see `offerMargoDressHelp`. Offering is not
 * assuming -- this only guarantees the ASK arrives; she still will not kneel
 * until he presses [E] on her.
 */
const MARGO_HELP_DEADLINE = 75;
const MARGO_DRESS_IMPACT_CUES = Object.freeze([
  'margo.dress.body-impact.1',
  'margo.dress.body-impact.2',
  'margo.dress.body-impact.3',
  'margo.dress.body-impact.4',
]);
const MARGO_DRESS_IMPACT_THRESHOLDS = Object.freeze([0.34, 0.72]);
let lastMargoDressImpact = null;

/** Recorded Margo foley when present; the existing body thump until it is. */
function playMargoDressImpact() {
  const available = MARGO_DRESS_IMPACT_CUES.filter((cue) => audio.hasSample(cue));
  const cue = chooseNoImmediateRepeat(available, lastMargoDressImpact);
  if (cue) {
    lastMargoDressImpact = cue;
    audio.play(cue, { volume: 0.48, position: apartment.margo.group.position, ref: 0.8, maxDist: 5 });
    return cue;
  }
  /* Reaching here now means a decode genuinely failed — all four takes are
   * delivered, indexed and named in the startup set above. It stays as a net
   * rather than an assertion because a beat that goes silent on a slow decode
   * is worse than one that thumps; but it is no longer the expected path, and
   * verify:big-night refuses to pass on the fallback alone. */
  audio.play('drunk.collapse', {
    volume: 0.24,
    rate: 1.45,
    position: apartment.margo.group.position,
    ref: 0.8,
    maxDist: 5,
  });
  return 'drunk.collapse';
}

/* ---- the dress ---- */

/*
 * The same power bar as the crooked picture frame, on the other end of the flat.
 *
 * Both are a stuck fastening that takes both hands, a rhythm and a great deal
 * of effort, both end with a bottle that gives all at once, and both land on
 * the same wet one-shot -- which is the rhyme, and the rhyme is the joke. What
 * is different is the accompaniment: the frame gets him straining, and this
 * gets HER, one take per successful pull, over a bed that runs the whole time
 * the bar is up and gets wetter as the bar gets faster.
 *
 * Seven pulls, because seven is the length of the take list, and the take list
 * is the performance. Nothing here is randomised: the same run gives the same
 * order every time, which is what makes it a written gag rather than a
 * shuffle.
 */
/* The seven written pulls, the rising wet-clap bed and the common payoff now
 * live in one shared sequence. The adapter below is only the apartment's
 * staging: Margo's pose, its HUD and its chapter-specific continuation. */
const margoDressAudio = {
  position: () => apartment.margo.group.position,
  play: (name, options) => audio.play(name, options),
  startLoop: (key, options) => audio.startLoop(key, options),
  stopLoop: (key, fade) => audio.stopLoop(key, fade),
};

const margoDress = createDressHelpSequence({
  timingBar: TimingBar,
  audio: margoDressAudio,
  rig: {
    begin() {
      const scene = game.margoScene;
      const margo = apartment.margo;
      margo.setPose('kneeling');
      margo.setDressHelpProgress(0);
      if (scene) scene.aim = MARGO_HELP_LOOK;
      interaction.setPaused(true);
      hud.hidePrompt();
      hud.setPosture('let her do it');
    },
    onHit({ index, total }) {
      const scene = game.margoScene;
      if (!scene) return;
      const progress = index / total;
      /* The authored body-impact takes stay on the same two thresholds and
       * happen after the pull and clap-stage change, exactly as before. */
      while (scene.dressImpactStep < MARGO_DRESS_IMPACT_THRESHOLDS.length
        && progress >= MARGO_DRESS_IMPACT_THRESHOLDS[scene.dressImpactStep]) {
        scene.dressImpactHistory.push(playMargoDressImpact());
        scene.dressImpactStep++;
      }
      if (index !== total) hud.toast(`${index}/${total}`, index >= total - 1 ? 'good' : '');
    },
    finish() {
      hud.setTiming(null);
      hud.setPosture(null);
    },
  },
  onProgress({ progress }) {
    const scene = game.margoScene;
    if (!scene) return;
    scene.dressProgress = progress;
    apartment.margo.setDressHelpProgress(progress);
  },
  onComplete: () => settleMargoDressHelp({ earned: true }),
  onAbandon: () => settleMargoDressHelp({ earned: false }),
});

/**
 * Pressing [E] on her hands over the fastening -- and puts her in the pose
 * that reaches it. This is the ONLY place `apartment.margo.setPose('kneeling')`
 * is ever called: she offers, in `offerMargoDressHelp`, standing up; she does
 * not get down onto the bed until this fires, and this only fires off a real
 * keypress on her own hit volume. See the doc comment above `MARGO_BEATS`.
 */
function startMargoDressHelp() {
  const scene = game.margoScene;
  if (!scene?.awaitingHelp || margoDress.active) return false;
  if (!margoDress.start()) return false;
  hud.say('That fastening has never once gone first time.<br>'
    + '<em>Right.</em> Time it and pull.', 5200);
  return true;
}

/**
 * The bottle gives, and it gives down the back of the dress.
 *
 * @param {object} o `earned` when the bar was actually finished, which is the
 *   only difference between the two ways out: the payoff is identical, because
 *   a beat the player can accidentally skip past is a beat nobody has seen.
 */
function settleMargoDressHelp({ earned = true } = {}) {
  const scene = game.margoScene;
  /* And the glue lands on the thing the job was about, exactly the way it
   * lands on the picture he was trying to straighten. Ramped in by
   * `updateMargoWake` rather than switched on here, because the bottle gives
   * all at once and then keeps going for a second afterwards. */
  if (scene) scene.dressGlueTarget = 1;
  hud.toast(earned ? 'PVA. Everywhere. Again.' : 'She has got it', earned ? 'bad' : '');
  hud.say(earned
    ? (scene?.kind === 'comeHome'
      ? 'Wood glue. <em>On the dress.</em> The same bottle, the same nozzle, '
        + 'and it was coming off tonight regardless.'
      : 'Wood glue. <em>On the dress.</em> The same bottle, the same nozzle, '
        + 'and she is due at a kitchen in three hours.')
    : '<em>Fine.</em> She has got it. She has mostly got it.', 5400);
  completeMargoDressHelp({ playSnap: false });
  return true;
}

/**
 * [Q]. She finishes it herself, and the morning carries on regardless.
 *
 * Reached only while the bar is actually running (the keydown handler gates
 * it on `margoDress.active`, same as [E] feeding the bar): once she is
 * merely OFFERING, there is nothing to abandon -- the player is free to walk
 * off and come back, and nothing is waiting on him to say so. The second
 * branch here stays for the same reason `startMargoDressHelp` is idempotent:
 * a stray call with the offer still open should resolve it kindly rather than
 * do nothing.
 */
function abandonMargoDressHelp() {
  if (margoDress.active) return margoDress.abandon();
  if (!game.margoScene?.awaitingHelp) return false;
  hud.say('<em>Fine.</em> She has got it.', 3200);
  return completeMargoDressHelp();
}

/** Sweep the bar while it is up. Nothing else in the flat owns the HUD here. */
function updateMargoDressHelp(dt) {
  if (!margoDress.active) return;
  hud.setTiming(margoDress.update(dt));
}

/**
 * How far he props himself up for the interactive beat, in metres of eye.
 *
 * He used to rise 30cm, which framed a woman knelt upright beside the bed.
 * Bent over on all fours she is a metre lower, and from 30cm the ray to her
 * back grazed the top of his own thrown-back duvet: the beat played as a strip
 * of denim behind a wall of bedding. 55cm is a man up on an elbow, and it is
 * what clears the duvet.
 */
const MARGO_CAMERA_LIFT = 0.55;

/** Hip height standing, which is what `setPose('standing')` places her at. */
const MARGO_STAND_Y = 0.87;

/** Where she walks, from the side of the bed to the front door. */
const MARGO_PATH = [
  [-2.80, -3.00], [-2.55, -1.40], [-1.20, 1.20], [0.90, 3.30], [2.72, 4.28],
];
/** The same walk in reverse: the night she comes home, door to bedside. */
const MARGO_ENTRY_PATH = [...MARGO_PATH].reverse();

/**
 * The shape both this scene and `startMargoComeHome` drive `updateMargoWake`
 * off of. One constructor for one shared shape, so a field either of them
 * relies on can never quietly be missing from the other.
 */
function newMargoScene(kind) {
  return {
    kind,
    /* Wall clock, not accumulated frame time. Dialogue is scheduled on
     * setTimeout and the simulation delta is clamped at 50ms, so on a machine
     * that cannot hold thirty frames a second the two drift apart and a line
     * lands from under a duvet nobody is under any more. One clock for both
     * halves of either scene. */
    startedAt: performance.now(),
    t: 0,
    beat: -1,
    walk: null,
    entry: false,
    aim: null,
    awaitingHelp: false,
    dressProgress: 0,
    dressImpactStep: 0,
    dressImpactHistory: [],
    dressImpactCandidates: [...MARGO_DRESS_IMPACT_CUES],
    dressGlue: 0,
    dressGlueTarget: 0,
    cameraBaseY: player.position.y,
    cameraLift: 0,
    cameraLiftTarget: 0,
    departAt: null,
  };
}

function startMargoWake() {
  if (game.margoScene) return false;
  game.margoScene = newMargoScene('wake');
  margoDress.reset();
  /* Pull the dress foley now, while she is still lying down.
   *
   * The startup decode happens on the Start card, and on the normal route
   * through the campaign the chapter is still `date` at that point — so
   * `margoWakeOwed()` is false and these four never make the startup set.
   * They are in the resident bank, but that fills in behind play and the whole
   * beat is over inside about twenty seconds. `playMargoDressImpact` gates on
   * `hasSample`, which wants a decoded buffer rather than a delivered file, so
   * the authored takes lost that race every time and the scene played its
   * `drunk.collapse` stand-in instead — four recordings, shipped in 8963415,
   * that no player has ever heard.
   *
   * There is a long VO sequence between here and the bar, which is plenty of
   * room to decode a dozen short files. Fire and forget: if it loses the race
   * anyway the fallback still covers the beat. The bar's own takes ride along
   * for exactly the same reason -- they are the performance, and a performance
   * that arrives after the beat is over is not one. */
  audio.loadAdditional?.({
    names: [...MARGO_DRESS_IMPACT_CUES, ...DRESS_HELP_CUES],
  })?.catch?.(() => {});
  const margo = apartment.margo;
  /* Last night off her, both halves of it: the mess AND the fastening. The
   * shared pure stage is also what the geometry gate uses, so the person seen
   * in this beat cannot disappear from its headless audit. */
  stageApartmentMargoGeometry(apartment, APARTMENT_MARGO_GEOMETRY_STAGES.WAKE_LYING);
  interaction.setPaused(true);
  hud.hidePrompt();
  /* A cone wide enough to turn and look at somebody, and a floor low enough to
   * see them -- and -0.35 was not low enough once she went down on all fours.
   * From the propped-up eye the aim onto her back wants about -0.45, so a
   * clamp at -0.35 quietly stopped his head short of the thing the beat is
   * about. Both go back to the bed's own numbers in finishMargoWake. */
  player.pitchMin = -0.75;
  player.pitchMax = Math.PI / 2 - 0.05;
  player.yawRange = 1.6;

  const turns = [];
  BIG_NIGHT_MARGO_WAKE.lines.forEach((line, i) => {
    /* Her lines carry her as the speaker so her mouth runs on them
     * (src/core/mouth.js via the rig's own say()); Tony's replies are the
     * player, first person, and animate nobody. */
    turns.push({ cue: `vo.${BIG_NIGHT_MARGO_WAKE.vo}.${i + 1}`, text: `Margo: ${line}`, speaker: margo });
    const reply = BIG_NIGHT_MARGO_WAKE.replies[i];
    if (reply) {
      turns.push({ cue: `vo.${BIG_NIGHT_MARGO_WAKE.vo}.tony.${i + 1}`, text: `You: ${reply}` });
    }
  });
  speakSequence(turns, { onDone: () => offerMargoDressHelp() });
  return true;
}

/**
 * SCENE 9. She came home with him the night of the Silver Room.
 *
 * `apartmentStory.margoComeHomeOwed()` gates this on the mission's own
 * `cameHome` verdict, not on the chapter alone -- an evening that ended
 * `awkward` or worse never reaches this function. He is already free to move
 * (`returningToApartment` has already put him on his feet at the door), so
 * this never touches `interaction.setPaused` or `player.mode` itself; the
 * only thing it locks down is what `startMargoDressHelp` already locks down
 * once he actually starts the fastening.
 *
 * Reuses every piece of the morning's own machinery -- `apartment.margo`,
 * `margoDress`, `startMargoDressHelp`, `offerMargoDressHelp`,
 * `apartment.margo.helpTarget` and its one registered interaction -- rather
 * than building a second dress-help beat next to it. `game.margoScene.kind`
 * is the only thing that tells the shared code which scene it is in, and it
 * only matters twice: what she is doing when the player is not asking
 * anything of her (the walk in, not the wake-up beats), and what happens
 * once he has helped her (bed, and staying in it, not the door).
 */
function startMargoComeHome() {
  if (game.margoScene) return false;
  game.margoScene = newMargoScene('comeHome');
  game.margoScene.walk = 0;
  game.margoScene.entry = true;
  margoDress.reset();
  audio.loadAdditional?.({
    names: [...MARGO_DRESS_IMPACT_CUES, ...DRESS_HELP_CUES],
  })?.catch?.(() => {});
  /* The pure stage owns the exact far end of her exit path at the front door.
   * Browser play and the headless geometry gate therefore use one entry pose. */
  stageApartmentMargoGeometry(
    apartment,
    APARTMENT_MARGO_GEOMETRY_STAGES.COME_HOME_ENTRY,
  );
  return true;
}

/** She reached the bedside; the walk-in is over and the talking starts. */
function startMargoComeHomeTalk() {
  const turns = [];
  SILVER_ROOM_COME_HOME.lines.forEach((line, i) => {
    /* Same speaker rule as the wake: her lines run her mouth, his run nobody's. */
    turns.push({
      cue: `vo.${SILVER_ROOM_COME_HOME.vo}.${i + 1}`,
      text: `Margo: ${line}`,
      speaker: apartment.margo,
    });
    const reply = SILVER_ROOM_COME_HOME.replies[i];
    if (reply) {
      turns.push({ cue: `vo.${SILVER_ROOM_COME_HOME.vo}.tony.${i + 1}`, text: `You: ${reply}` });
    }
  });
  speakSequence(turns, { onDone: () => offerMargoDressHelp() });
}

/**
 * The conversation is over and the morning is waiting on him -- TO ASK, not
 * yet to kneel. She stands up beside the bed wanting a hand with the
 * fastening; whether she actually gets down on it is entirely up to whether
 * he walks over and presses [E] on her. See `startMargoDressHelp`, the only
 * place that pose is ever assumed.
 *
 * Pulled out of the `speakSequence` callback and made idempotent so that
 * `updateMargoWake` can reach it too. This callback used to be the ONLY thing
 * that ever gave the player a key that did anything again, and it hung off a
 * chain of `setTimeout`s: a browser that throttles a backgrounded tab, an
 * alt-tab across the lines, a decode that never lands, and the morning
 * stopped dead with a man on his back and no [E] -- the "stuck in the bed"
 * this scene was reported for. Getting up no longer waits on this at all:
 * [E] has stood him up since the first beat, dialogue running or not. This
 * watchdog now only guarantees the ASK itself is never lost the same way.
 */
function offerMargoDressHelp() {
  const scene = game.margoScene;
  if (!scene || scene.awaitingHelp || scene.walk !== null || margoDress.active) return false;
  if (scene.departAt !== null) return false;
  const margo = apartment.margo;
  margo.setPose('standing');
  scene.beat = MARGO_BEATS.length - 1;
  scene.aim = MARGO_STAND_LOOK;
  scene.awaitingHelp = true;
  scene.dressProgress = 0;
  // Only does anything if he never got up: lets him see her over the duvet.
  scene.cameraLiftTarget = 1;
  if (scene.kind === 'comeHome') {
    /* The night she came home, the ask is HERS — a spoken line with a real
     * cue, her mouth on the take and her face turned to him for the length
     * of it (see the speaking-facing block in updateMargoWake), instead of a
     * stage direction on the subtitle bar. One line, played once: this
     * function is idempotent per scene. */
    speakLine(
      `vo.${SILVER_ROOM_DRESS_ASK.vo}.1`,
      `Margo: ${SILVER_ROOM_DRESS_ASK.lines[0]}`,
      { speaker: margo },
    );
  } else {
    hud.say('<em>Can you get this?</em> She turns, back to him, waiting on the clasp.', 4400);
  }
  return true;
}

/**
 * Close the fastening, let the pose land, then either send her to the door
 * (the morning) or put her to bed (the night she came home) -- `scene.kind`
 * is the only fork in this whole beat.
 */
function completeMargoDressHelp({ playSnap = true } = {}) {
  const scene = game.margoScene;
  if (!scene?.awaitingHelp) return false;
  hud.setTiming(null);
  hud.setPosture(null);
  scene.awaitingHelp = false;
  scene.dressProgress = 1;
  apartment.margo.setDressHelpProgress(1);
  interaction.setExclusiveTarget(null);
  if (playSnap) audio.play('cloth.snap', { volume: 0.55 });

  if (scene.kind === 'comeHome') {
    /* G1 (2026-08-06 playtest): this used to fall straight through to
     * `finishMargoComeHome` here -- lying down, asleep, in the same tick the
     * fastening finished, before the bottle he just emptied on her back had
     * so much as appeared. `settleMargoDressHelp` (the callback) has just set
     * `scene.dressGlueTarget = 1`; unless he skipped past the offer with [Q]
     * before she ever went down (the one path where no glue was ever
     * coming, and `dressGlueTarget` is still its initial 0), stay right
     * here. `setPose` is not called in this branch, so the `kneeling` pose
     * `startMargoDressHelp` put her in simply holds -- and `updateMargoWake`'s
     * own ramp of `dressGlue` up to that target is the only thing that ever
     * calls `finishMargoComeHome` from here on. No timer of this function's
     * own: the gate is the effect's own state, not a guess at its length. */
    if (scene.dressGlueTarget >= 1) return true;
    finishMargoComeHome();
    return true;
  }

  apartment.margo.setPose('standing');
  scene.aim = MARGO_STAND_LOOK;
  scene.departAt = performance.now() + 650;
  interaction.setPaused(true);
  return true;
}

/**
 * SCENE 9's ending. She has the help she needed, and goes to bed -- and
 * STAYS there, unlike the morning's version of this beat, which walks her
 * out the front door. `apartment.margo.group` stays visible and in the
 * `lying` pose for the rest of the night, exactly where `startMargoWake`
 * expects to find her (or, on a reload before he sleeps, where
 * `apartmentStory.margoHomeForTheNight()` puts her back without replaying
 * any of this).
 */
function finishMargoComeHome() {
  game.margoScene = null;
  margoDress.reset();
  hud.setTiming(null);
  hud.setPosture(null);
  interaction.setExclusiveTarget(null);
  interaction.setPaused(false);
  apartment.margo.setPose('lying');
  apartment.margo.group.visible = true;
  apartmentStory.margoComeHomeDone();
  hud.say('<em>Night.</em> She is out inside a minute.', 3600);
}

/** She is gone. Give him the room, the clock and the prompt back. */
function finishMargoWake() {
  if (!game.margoScene) return;
  game.margoScene = null;
  margoDress.reset();
  hud.setTiming(null);
  hud.setPosture(null);
  interaction.setExclusiveTarget(null);
  apartment.margo.group.visible = false;
  apartment.frontDoorPivot.rotation.y = 0;
  audio.play('door.knob', { volume: 0.7 });
  apartmentStory.margoWakeDone();
  syncClockFromCampaign();
  /* Hand back the posture he was actually in.
   *
   * Since SCENE 10 that is very nearly always ON HIS FEET: the fastening is
   * only ever started from `interaction.press()`, and while he is lying down
   * [E] means get up (see the keydown handler), so a man who helped her with
   * the dress got up and walked over to do it. This used to lay him back down
   * unconditionally -- "exactly the pose an ordinary morning hands over" --
   * which teleported a standing player into his own bed the instant she shut
   * the door, and paused every interaction in the flat on top of it. That is
   * the same "held hostage in the bed" shape the rest of this scene exists to
   * be rid of. `completeMargoDressHelp` is what took the room for her walk
   * out, and this is where it goes back.
   *
   * The bed branch stays for the man who never got up -- reachable by dev
   * console and by any future route that ends the morning without the beat --
   * and hands over the ordinary morning: on his back, [E] to get up. */
  if (player.mode === 'bed') {
    player.layInBed(apartment.bedPose.position, apartment.bedPose.yaw);
    interaction.setPaused(true);
    hud.hidePrompt();
    setTimeout(() => {
      if (player.mode === 'bed') hud.showPrompt('Get <b>up</b>', 'E');
    }, 1600);
  } else {
    interaction.setPaused(false);
  }
  hud.say('<em>Gone.</em> The flat is very quiet and today is the day.', 4600);
  updateObjectives();
}

/**
 * A walk, rather than a hop, along `path` to normalized progress `w`.
 *
 * Shared by both of Margo's scenes: the exit at the end of the morning
 * (bedside to door) and the entry at the start of the night she comes home
 * (door to bedside, `MARGO_ENTRY_PATH`) are the same gait over the same
 * ground in opposite directions, and used to be two copies of this maths a
 * screen apart -- the risk being exactly the one this function removes, that
 * a fix to the walk lands in only one of them.
 *
 * This used to swing `legs` -- the group BOTH thighs hang off -- by one
 * sine, so her entire lower half went forward and back as a single piece
 * with her feet welded together, and she left the flat bouncing. A gait is
 * two legs in ANTIPHASE: one thigh forward while the other is behind, the
 * knee folding on the way through so the shin clears the floor, and each arm
 * opposing the leg on its own side. Same one sine; the legs read opposite
 * halves of it.
 *
 * `phaseSeconds` is driven off the walk's own wall clock rather than
 * `scene.t`, so the phase starts at zero with the first step instead of
 * wherever the conversation happened to leave it -- she used to set off
 * mid-stride.
 */
function poseMargoWalk(margo, path, w, phaseSeconds) {
  const g = margo.group;
  const at = Math.min(path.length - 2, Math.floor(w * (path.length - 1)));
  const local = w * (path.length - 1) - at;
  const [ax, az] = path[at];
  const [bx, bz] = path[at + 1];
  g.position.x = ax + (bx - ax) * local;
  g.position.z = az + (bz - az) * local;
  g.rotation.y = Math.atan2(bx - ax, bz - az);

  const phase = phaseSeconds * 5.6;
  margo.legs.rotation.x = 0;
  margo.thighs.forEach((thigh, i) => {
    const sidePhase = phase + (i ? Math.PI : 0);
    const lift = Math.sin(sidePhase);
    thigh.rotation.x = -lift * 0.44;                    // negative is forward
    /* Flexed through the swing and straight on the plant. The 0.9 lead puts
     * the fold before the thigh reaches the front of its throw, which is where
     * a knee actually folds. */
    margo.knees[i].rotation.x = -0.06 - Math.max(0, Math.sin(sidePhase + 0.9)) * 0.66;
  });
  margo.arms.forEach((arm, i) => {
    arm.rotation.x = Math.sin(phase + (i ? Math.PI : 0)) * 0.30;
  });
  margo.upper.rotation.x = 0.05;
  // Two footfalls per cycle, so the bob runs at twice the swing.
  g.position.y = MARGO_STAND_Y + Math.abs(Math.cos(phase)) * 0.016;
}

/** Run the scene: her beats, his head, and the walk to (or in from) the door. */
function updateMargoWake(dt) {
  const scene = game.margoScene;
  if (!scene) return;
  scene.t = (performance.now() - scene.startedAt) / 1000;
  const margo = apartment.margo;

  /* Rise from the pillow into a supported sit instead of cutting to a second
   * camera. This keeps the first-person wake intact and clears the duvet from
   * the lower half of the interaction -- but ONLY while he is still lying
   * there. He can get up at any point now (see `getUp`), and once he has,
   * `player.position.y` belongs to `_updateWalk`'s ground+eye+jump maths; a
   * scene that kept stamping a bed-relative number over it every frame would
   * plant him at ankle height the instant he stood. */
  if (player.mode === 'bed') {
    scene.cameraLift += (scene.cameraLiftTarget - scene.cameraLift) * Math.min(1, dt * 3.2);
    player.position.y = scene.cameraBaseY + scene.cameraLift * MARGO_CAMERA_LIFT;
  }

  updateMargoDressHelp(dt);

  /* The mess arriving on the dress, over about half a second. */
  if (scene.dressGlue < scene.dressGlueTarget) {
    scene.dressGlue = Math.min(scene.dressGlueTarget, scene.dressGlue + dt * 1.8);
    margo.setDressGlue(scene.dressGlue);
  }

  /* G1: the night she comes home, `completeMargoDressHelp` left her on all
   * fours instead of sending her to bed, precisely so the glue ramping in
   * just above has somewhere to land before she is asleep. This is the only
   * place that hold ends -- once the ramp has actually CAUGHT the target
   * `settleMargoDressHelp` set (not merely nonzero: a scene that never
   * triggered the glue, `dressGlueTarget` still 0, must not finish here on
   * its very first frame), the effect's own state is the gate, not a fixed
   * delay standing in for it. */
  if (scene.kind === 'comeHome' && scene.dressGlueTarget >= 1
    && scene.dressGlue >= scene.dressGlueTarget) {
    finishMargoComeHome();
    return;
  }

  /* The watchdog on the dialogue.
   *
   * `speakSequence` is a chain of setTimeouts, and its final callback is the
   * only thing that opens the interactive beat. Every route by which that
   * chain can be delayed or dropped -- a throttled background tab, a decode
   * that never lands, a subtitle hold computed off a sample that is not there
   * -- ends with the player on his back with no key that does anything. Off
   * the scene's own wall clock, the eight lines have never taken more than
   * about fifty seconds, so at seventy-five the morning moves on with or
   * without them. */
  if (scene.t > MARGO_HELP_DEADLINE) offerMargoDressHelp();

  /* MARGO_BEATS is the wake-up's own lying/sitting/standing progression --
   * she is not asleep at the start of a night she just walked in for, so
   * none of this runs for `kind === 'comeHome'`. */
  if (scene.kind === 'wake') {
    /* SHE IS STILL ASLEEP, and you can hear it.
     *
     * Owner: "lets add a low key snore sound". Beat 0 is `lying` and she does
     * not sit up until 6.4 s, so this is the whole of the window in which the
     * player is awake and she is not. Low, slow, and not comic -- she is
     * sixty centimetres from his ear, so it plays dry rather than positioned,
     * and it stops the moment she moves. */
    if (scene.beat === 0 && scene.t >= (scene.nextSnore ?? 0.9)) {
      audio.play('margo.snore', { volume: 0.17 });
      scene.nextSnore = scene.t + 2.9 + Math.random() * 1.3;
    }

    for (let i = MARGO_BEATS.length - 1; i > scene.beat; i--) {
      if (scene.t < MARGO_BEATS[i].at) continue;
      const beat = MARGO_BEATS[i];
      scene.beat = i;
      margo.setPose(beat.pose);
      scene.aim = beat.look;
      if (beat.cue) audio.play(beat.cue, { volume: 0.5 });
      break;
    }
  }

  /* She talks TO him. While a line of hers is up and she is on her feet --
   * not mid-walk, not bent over the fastening -- she turns to face wherever
   * he actually is, instead of delivering it to the wardrobe on the standing
   * pose's fixed yaw. Eased, so it is a person turning and not a turret; and
   * only while SPEAKING, so the authored staging (her back to him for the
   * zip once the ask has landed and he walks around her) is otherwise
   * untouched. Lying and sitting keep their authored facings entirely. */
  if (margo.speakingFor > 0 && margo.pose === 'standing'
    && scene.walk === null && !margoDress.active) {
    const wantYaw = yawNear(Math.atan2(
      player.position.x - margo.group.position.x,
      player.position.z - margo.group.position.z,
    ), margo.group.rotation.y);
    margo.group.rotation.y += (wantYaw - margo.group.rotation.y) * Math.min(1, dt * 4);
  }

  /* His head, turned toward whatever she is doing -- when there is anything
   * worth turning toward, and when there is a head here left to turn: once he
   * is up (`player.mode !== 'bed'`), the mouse is entirely his again. Without
   * this guard the scene fought a standing player for `player.yaw` every
   * frame until `finishMargoWake`, which is a second, worse shape of the same
   * "stuck" complaint this whole rewrite exists to fix -- his feet could
   * walk, but his own look was still being driven from off-screen. */
  if (scene.aim && player.mode === 'bed') {
    const head = new THREE.Vector3(scene.aim[0], scene.aim[1], scene.aim[2]);
    const dx = head.x - player.position.x;
    const dy = head.y - player.position.y;
    const dz = head.z - player.position.z;
    const wantYaw = yawNear(Math.atan2(-dx, -dz), player.yaw);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    const k = Math.min(1, dt * 2.6);
    player.yaw += (wantYaw - player.yaw) * k;
    player.pitch += (wantPitch - player.pitch) * k;
    player.yawCenter = player.yaw;
  }

  if (scene.departAt !== null && performance.now() >= scene.departAt) {
    scene.departAt = null;
    scene.walk = 0;
    scene.walkStart = null;
  }
  if (scene.walk === null) return;
  /* Wall clock again, and for the same reason plus a harder one: this is the
   * stretch that ENDS a walk. Advanced by frame delta, a machine rendering at
   * two frames a second leaves her walking across the flat forever with the
   * player unable to move on (the exit) or the conversation unable to start
   * (the entry). Six seconds either way, on whatever hardware. */
  scene.walkStart ??= performance.now();
  scene.walk = Math.min(1, (performance.now() - scene.walkStart) / 6000);
  const w = scene.walk;
  const path = scene.entry ? MARGO_ENTRY_PATH : MARGO_PATH;
  poseMargoWalk(margo, path, w, (performance.now() - scene.walkStart) / 1000);
  /* The door swings for her near whichever end of the walk she is passing it
   * at -- the start, coming in, or the end, going out. */
  apartment.frontDoorPivot.rotation.y = scene.entry
    ? (w < 0.20 ? APARTMENT_MARGO_ENTRY_DOOR_YAW * Math.min(1, (0.20 - w) / 0.12) : 0)
    : (w > 0.80 ? APARTMENT_MARGO_ENTRY_DOOR_YAW * Math.min(1, (w - 0.80) / 0.12) : 0);
  if (w < 1) return;
  if (scene.entry) {
    scene.walk = null;
    scene.walkStart = null;
    scene.entry = false;
    margo.setPose('standing');
    startMargoComeHomeTalk();
  } else {
    finishMargoWake();
  }
}

/**
 * Day One, before the Bing, with hours to fill.
 *
 * The one state where lying down is killing time rather than ending a day.
 * Read off the campaign, never off a flag of its own, so a nap and a reload
 * agree about which day it still is.
 */
function killingTimeOnDayOne() {
  const state = campaign.state;
  return state.story.chapter === 'day_one'
    && state.missions[MISSION_IDS.BADA_BING_ONE].status !== 'complete';
}

/** What the night that just ended was, named by the chapter it closed. */
const CHAPTER_DONE = Object.freeze({
  day_two: 'Day One is done',
  no_wake: 'Day Two is done',
  date: 'The harbor is behind you',
  golf_morning: 'THE TAKE is behind you',
  big_night: 'The Silver Room is behind you',
  heist_day: 'The Jerky Motel is behind you',
});

/** And what the morning it opened onto is for. */
const WAKE_LINES = Object.freeze({
  day_two: 'Booskibro said he would call.',
  no_wake: 'Grey out. Lou said he would call.',
  date: 'Nothing on today. She said she would ring.',
  golf_morning: 'Silver Pines at eight. Lou gave you the time last night.',
  big_night: 'Tonight is the thing. Booskibro said he would call.',
  heist_day: 'THE TAKE is today. Lou said he would call.',
});

/**
 * The first thing he says on waking.
 *
 * A sleep that turned a story chapter announces the chapter and the campaign's
 * own day number. Everything else is the old copy for a nap or for the drink
 * taking him.
 */
function wakeUpLine(storySleep, voluntary) {
  /* Every chapter, off the campaign's own day number. There used to be two
   * cases: the big night, which announced "Day Three" for what the campaign
   * calls Day 4, and everything else, which said "Day Two. Booskibro said he
   * would call" -- so waking up for the date on Day Three greeted you with
   * Day Two and the wrong man's name. */
  if (storySleep?.ok) {
    const woken = WAKE_LINES[storySleep.chapter];
    if (woken) return `<em>Day ${storySleep.day}. ${time.clock12}.</em> ${woken}`;
  }
  if (!voluntary) {
    return `<em>${time.clock12}.</em> You are in bed. You do not remember the trip.`;
  }
  if (time.day === MEETING.day && time.hour >= 17) {
    return `<em>${time.clock12}.</em> Slept most of it away. <em>That is tonight, that is.</em>`;
  }
  return `<em>${time.clock12}.</em> Out like a light. Nothing has changed.`;
}

/**
 * Lights out. Either the drink takes you (`voluntary` false, which is the
 * usual way it happens) or you decide to lie down and let the day go.
 */
function passOut({ voluntary = false, storySleep = null } = {}) {
  if (game.passingOut) return;
  game.passingOut = true;

  browserInput?.clear('pass-out');
  interaction.setPaused(true);
  hud.hidePrompt();
  hud.setHold(null);

  if (game.seated) {
    game.seated = false;
    hud.setMode('walk');
    audio.setMuffle(false);
    radio.setFocusMuffle(false);
  }

  game.sitting = null;
  game.inBed = false;

  if (game.peeing) stopPee();
  if (game.onToilet) {
    game.onToilet = false;
    hud.setMode('walk');
  }
  if (game.toiletPee) {
    game.toiletPee = false;
    audio.stopLoop('pee.stream', 0.25);
  }
  /* A shower he passes out in ends here, or its completion timer would stand
   * him out of the bed the blackout is about to put him in, with the water
   * still running over an empty tub. */
  if (game.showering !== null) {
    game.showering = null;
    audio.stopLoop('shower.run', 0.6);
    showerFx.stop();
    hud.setMode('walk');
  }

  // Abandon anything mid-drag.
  cig.t = -1;
  cig.afterglow = 0;
  heldCig.group.visible = false;

  hud.setPosture(null);
  player.mode = 'frozen';
  if (voluntary) {
    audio.play('bed.rustle', { volume: 0.5 });
  } else {
    audio.play('drunk.collapse', { volume: 0.85 });
    audio.play('drunk.heartbeat', { volume: 0.6, delay: 0.25 });
    hud.say('Oh. <em>Oh no.</em>');
  }

  blackout.querySelector('span').textContent = voluntary ? '' : 'you should sit down';
  blackout.classList.add('on');

  setTimeout(() => {
    audio.play('drunk.snore', { volume: 0.4 });
    blackout.querySelector('span').textContent = '· · ·';
  }, 2200);

  setTimeout(() => {
    // Wake up in bed, a few hours gone.
    player.layInBed(apartment.bedPose.position, apartment.bedPose.yaw);
    drunk.sleepItOff();
    highs.sleepItOff();
    if (storySleep?.ok) {
      time.setTime(storySleep.day, storySleep.timeMinutes);
    } else if (voluntary && killingTimeOnDayOne()) {
      /* Day One is explicitly a day with nothing in it. He wakes at four
       * minutes past six and Lou's table is not until a quarter to midnight,
       * so a deliberate nap is how a man spends that -- toward the evening,
       * never past it, and never into tomorrow, because tomorrow is on the
       * other side of the Bing. */
      const h = time.hour;
      time.skipHours(h < 19 ? 19 - h : Math.max(0, 23 - h));
    } else if (voluntary) {
      /* Sleeping on purpose lands on whichever comes first: the next morning,
       * or half five on the day of the meeting.
       *
       * "Always the next 07:00" quietly lost you the game -- lie down at eight
       * on Wednesday morning and you woke on Thursday, meeting gone, nothing
       * having warned you. And with no way to nap toward the evening the only
       * route from Wednesday breakfast to seven o'clock was six real minutes
       * of standing in a room. A man with a whole day to kill before a thing
       * would go back to bed, so let him. */
      const h = time.hour;
      const toMorning = h < 7 ? 7 - h : 31 - h;
      const toEvening = (time.day === MEETING.day && h < 17.5) ? 17.5 - h : Infinity;
      time.skipHours(Math.min(toMorning, toEvening));
    } else {
      /* The drink taking him is the other way to spend Day One, and the panel
       * says so, so it gets the same guard: twelve hours normally, but never
       * out the far side of the night he is supposed to be spending at the
       * Bing. Waking on Day Two with Day One's chapter still open is not a
       * broken campaign, but it is a nonsense one. */
      time.skipHours(killingTimeOnDayOne()
        ? Math.max(0, Math.min(12, 23 - time.hour))
        : 12);
    }
    /* And the save agrees with the clock on the wall. A nap used to move the
     * display only, so reloading put him back at four minutes past six with
     * the morning he had already spent still in front of him. */
    if (!storySleep?.ok) {
      campaign.update((state) => {
        state.story.day = time.day;
        state.story.timeMinutes = time.minutes;
      });
    }
    apartment.refreshClocks();
    /* A chapter turned, so the flat gets a morning of its own: unshowered,
     * unfed, in what he slept in, with eggs back in the fridge and a clean
     * pan. These used to persist, and waking on Day Two into a flat where
     * every getting-ready interaction answered "you have already done that"
     * is why the second morning felt like the first one with the wrong number
     * on the clock. The phone stays in his pocket -- that is not a chore. */
    if (storySleep?.ok) startNewMorning();
    else apartment.state.heldItem = null;
    hud.setHand(null);
    game.passingOut = false;
    blackout.querySelector('span').textContent = '';
    blackout.classList.remove('on');
    audio.play('bed.rustle', { volume: 0.5 });
    hud.say(wakeUpLine(storySleep, voluntary), 6000);
    if (storySleep?.ok) startMorningRadio();
    /* Sleeping off the Silver Room is the usual way anybody reaches the fourth
     * morning, so the cutscene has to hang off waking up as well as off a cold
     * load into it. Both routes ask the campaign, not a flag. */
    if (player.mode === 'bed' && apartmentStory.margoWakeOwed()) {
      setTimeout(() => startMargoWake(), 1400);
      return;
    }
    setTimeout(() => {
      if (player.mode === 'bed') hud.showPrompt('Get <b>up</b>', 'E');
    }, 3200);
  }, 5200);
}

/** Push the intoxication level into the CSS layer (blur + closing vignette). */
let _fxBlur = -1;
let _fxAmount = -1;
let _fxHue = -1;
let _fxSat = -1;
let _fxContrast = -1;
let _fxBreathe = -1;
let _fxHigh = -1;
let _fxWash = -1;
let _fxSplit = -1;
let _fxDroop = -1;
const fxTrip = document.getElementById('fx-trip');
const chromaR = document.querySelector('#chroma feOffset');
const chromaB = document.querySelectorAll('#chroma feOffset')[1];
function applyDrunkFx() {
  const blur = Math.round(drunk.blur * 20) / 20;
  const amount = Math.round((drunk.vignette + 0.42 * focusRush.strength) * 50) / 50;

  // The other two. Same trick: only touch the DOM when a rounded value moves,
  // because setting a custom property forces a style recalc every time.
  const hue = Math.round(highs.hue * 2) / 2;
  const sat = Math.round(highs.saturate * 100) / 100;
  const breathe = Math.round(highs.breathe * 1000) / 1000;
  const warm = Math.round(highs.warmth * 50) / 50;
  if (hue !== _fxHue) {
    _fxHue = hue;
    document.documentElement.style.setProperty('--trip-hue', `${hue}deg`);
  }
  if (sat !== _fxSat) {
    _fxSat = sat;
    document.documentElement.style.setProperty('--trip-sat', sat);
  }
  const contrast = Math.round(highs.contrast * 100) / 100;
  if (contrast !== _fxContrast) {
    _fxContrast = contrast;
    document.documentElement.style.setProperty('--trip-contrast', contrast);
    document.documentElement.style.setProperty('--trip-bright', highs.bright.toFixed(3));
  }
  if (breathe !== _fxBreathe) {
    _fxBreathe = breathe;
    document.documentElement.style.setProperty('--trip-breathe', breathe);
  }
  if (warm !== _fxHigh) {
    _fxHigh = warm;
    fxHigh.style.setProperty('--high-amount', warm);
  }

  /* The rolling colour. The angles move every frame by design -- that IS the
   * effect -- but they are only written while the wash is actually visible,
   * so a sober flat is not recalculating two conic gradients sixty times a
   * second for an element at zero opacity. */
  const wash = Math.round(highs.wash * 100) / 100;
  if (wash !== _fxWash) {
    _fxWash = wash;
    fxTrip.style.setProperty('--trip-wash', wash);
  }
  if (wash > 0.004) {
    const st = fxTrip.style;
    st.setProperty('--trip-angle', `${highs.washAngle.toFixed(1)}deg`);
    st.setProperty('--trip-angle2', `${highs.washAngle2.toFixed(1)}deg`);
    st.setProperty('--trip-washhue', highs.washHue.toFixed(1));
  }

  /* Channel split. The filter is detached entirely when it would be doing
   * nothing, because an SVG filter over a full-screen canvas is not free. */
  const split = Math.round(highs.split * 10) / 10;
  if (split !== _fxSplit) {
    _fxSplit = split;
    const on = split > 0.15;
    canvas.classList.toggle('tripping', on);
    if (on && chromaR && chromaB) {
      chromaR.setAttribute('dx', String(-split));
      chromaR.setAttribute('dy', String(split * 0.35));
      chromaB.setAttribute('dx', String(split));
      chromaB.setAttribute('dy', String(-split * 0.35));
    }
  }

  const droop = Math.round(highs.droop * 50) / 50;
  if (droop !== _fxDroop) {
    _fxDroop = droop;
    fxHigh.style.setProperty('--high-droop', droop);
  }
  // Only touch the DOM when the value actually changes; setting a CSS custom
  // property every frame forces a style recalc for nothing.
  if (blur !== _fxBlur) {
    _fxBlur = blur;
    document.documentElement.style.setProperty('--drunk-blur', `${blur}px`);
  }
  if (amount !== _fxAmount) {
    _fxAmount = amount;
    fxDrunk.style.setProperty('--drunk-amount', amount);
  }
}

drunk.onHiccup = () => {
  if (game.paused || game.passingOut) return;
  audio.play('drunk.hiccup', { volume: 0.5 });
  drunk.rush = Math.max(drunk.rush, 0.35);
};

/* ------------------------------------------------------------------ */
/* Frame loop                                                          */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);

  // Simulation uses a clamped delta so a hitch cannot tunnel anything. The
  // story clock is event-driven; update() only tracks real session time.
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  elapsed += dt;

  if (apartment) {
    if (!game.paused) {
      time.update(rawDt);
      renderer.toneMappingExposure = time.exposure;
      scene.fog.color.copy(time.fogColour);
      scene.background.copy(time.fogColour);
      hud.setClock(time.day, time.clock12, time.elapsedReal);
      arcade.setClock?.(time.clock12);

      // The city outside changes character after dark: summer daytime traffic
      // and birds give way to something sparser and further away.
      audio.setLoopVolume('ambience.city.day', 0.02 + time.dayness * 0.13, 1.0);
      audio.setLoopVolume('ambience.city.night', 0.02 + (1 - time.dayness) * 0.12, 1.0);

      // The coffee table slows animations, never the authored campaign clock.
      highs.update(dt);
      spooky.update(dt, highs.trip);
      bullets.update(dt);

      /* The phone runs whether or not it is in his hand -- a call he misses
       * because it was on the nightstand is a missed call, not a call that
       * never happened. Only the screen is painted on demand. */
      apartmentStory.update(dt);
      syncPhoneThreads();
      phone.update(dt);
      /* Once a second is plenty for a list of five things, and the HUD drops
       * the repaint entirely when nothing in it has changed. */
      objectiveClock += dt;
      if (objectiveClock >= 1) { objectiveClock = 0; updateObjectives(); }
      heldPhone.group.visible = apartment.state.heldItem === 'phone';
      if (heldPhone.group.visible) {
        phone.draw();
        heldPhone.screen.material.map.needsUpdate = true;
      }

      /* The telly. Painted only while it is on -- a dark screen is one fill
       * and does not need repainting sixty times a second -- and its light
       * eases in so switching it on is not a step change in the room. */
      tv.update(dt);
      if (apartment.tv.screen.material.map) apartment.tv.screen.material.map.needsUpdate = tv.on;
      const tvg = tv.glow();
      apartment.tvGlow.color.setHex(tvg.colour || 0x000000);
      apartment.tvGlow.intensity += (tvg.intensity * 2.4 - apartment.tvGlow.intensity) * Math.min(1, dt * 5);
      apartment.tv.led.material = tv.on ? M_LED_ON : M_LED_OFF;
      /* The gun is visible only while its slot is selected, and the recoil is
       * a kick on the model rather than on the camera -- the camera is the
       * crosshair and shoving that around makes the thing feel broken to aim
       * rather than powerful to fire. */
      heldGun.group.visible = apartment.state.heldItem === 'gun';
      heldSlice.group.visible = apartment.state.heldItem === 'slice';
      if (gunKick > 0) gunKick = Math.max(0, gunKick - dt * 2.6);
      heldGun.group.rotation.x = 0.06 + gunKick;
      heldGun.group.position.z = -0.30 + gunKick * 0.10;
      const hdt = dt * highs.timeScale;

      // Intoxication first: the player controller reads sway/impair this frame.
      if (drunk.update(dt)) passOut();
      const felt = shakeScale();
      player.sway = drunk.sway;
      /* The drunk veer is scaled too. It is the same motion the sway is —
       * the Bing and the Silver Room already reduce their `impair` with the
       * setting, and a player who asked for less of this got less of it in
       * two scenes out of three. */
      player.impair = game.passingOut
        ? 0
        : Math.max(0, (drunk.level - 0.34) / 0.66) * felt;
      arcade.setImpairment?.(drunk.swayStrength);

      // Weed rides on top of the drink rather than replacing it.
      player.sway.yaw += highs.sway.yaw;
      player.sway.pitch += highs.sway.pitch;
      player.sway.roll += highs.sway.roll;
      /* "Reduce camera shake" scales what reaches the camera. In place is
       * fine: drunk.update() recomputes the sway from scratch every frame. */
      if (felt !== 1) {
        player.sway.yaw *= felt;
        player.sway.pitch *= felt;
        player.sway.roll *= felt;
      }
      player.moveScale = highs.moveScale;
      player.lookDrag = highs.lookDrag;
      focusRush.update(dt);
      focusRush.apply(camera, player, { baseMoveScale: player.moveScale });
      applyDrunkFx();

      /* The cold-open camera now follows real wall time. Its final automatic
       * chair rise must do the same or a low-frame-rate machine reaches the
       * room and then appears trapped for another long simulated tween. This
       * flag is deliberately narrower than every other frozen player motion. */
      player.update(automaticDeskExitStanding ? rawDt : dt);
      if (automaticDeskExitStanding && player.mode === 'walk') {
        automaticDeskExitStanding = false;
      }
      const reflectedPose = game.inBed || player.mode === 'bed'
        ? 'bed'
        : game.seated || game.sitting || game.onToilet || player.mode === 'seated'
          ? 'seated'
          : 'standing';
      playerBody?.update(dt, player, { pose: reflectedPose });
      playerBody?.setWeaponVisible(apartment.state.heldItem === 'gun');
      apartment.update(hdt, elapsed);
      updateMargoWake(dt);
      updateConsume(dt);
      updatePee(dt);
      updateBowel(dt);
      updateZyn();
      updateShower(hdt);
      updateGluing(dt);
      splat.update(dt);
      updateCooking(hdt);
      updateFarts(dt);
      updateNeighbours(dt);
      smoke.update(hdt);
      stream.update(hdt);
      radio.update(dt);

      /* Booski keeps typing whether or not anyone is at the desk. Repainting
       * only matters while the tower is on, but the feed advances regardless
       * so the backlog is right whenever you next switch it on. */
      if (chat.update()) {
        apartment.state.chatUnread = chat.unread;
        if (apartment.state.pcOn) {
          apartment.desk.repaintChat(chat);
          audio.play('chat.ping', { position: apartment.deskPose.position, volume: 0.5 });
        }
      }
      const idleBusy = game.passingOut || game.seated || game.peeing || game.onToilet
        || cig.t >= 0 || player.mode === 'frozen' || phone.inCall
        /* And the earpiece. He is not going to muse about the flat while he is
         * stood there listening to a phone nobody is picking up. */
        || actOne.ringingOut > 0;
      const idleMoving = player.velocity.lengthSq() > 0.04;
      narrator.update(dt, {
        /* A call is on the list now that he answers them out loud. Two of his
         * own voice at once is not a joke twice, it is one of them ruined. */
        busy: idleBusy,
        moving: idleMoving,
      });
      /* And the one night the narrator is silent and Tony has the room to
       * himself. `narrator.enabled` is switched off at boot on this night --
       * see the Act One section -- so exactly one of these two ever speaks. */
      updateActOne(dt, { busy: idleBusy, moving: idleMoving });

      /* THE COLD OPEN owns the camera from boot until the pull-back lands.
       *
       * It runs here, after the player has been updated, because it OVERRIDES
       * the player's camera rather than replacing the player: he is genuinely
       * sitting in that chair the whole time, and when the dolly finishes the
       * view is already exactly where his head is, so there is nothing to
       * hand back and nothing to snap. */
      if (coldOpenActive) {
        /* Owner, 2026-08-29: "I can't get up from the fucking desk." The Quit
         * event reached this code on the live build; the defect was feeding a
         * presentation clock the physics delta capped at 0.05. Under the two
         * WebGL renderers, 5.2 authored seconds took several wall minutes.
         * Presentation follows wall time; collision simulation stays capped. */
        for (const event of coldOpen.update(rawDt)) {
          if (event === 'reveal') runColdOpenReveal();
          else if (event === 'land') endColdOpen();
        }
        if (coldOpen.owningCamera) driveColdOpenCamera(coldOpen.pullbackK);
      }

      if (game.seated) {
        arcade.update(hdt);
        screenTexture.needsUpdate = true;
        /* Squatch Smash is a whole separate page laid over the monitor rather
         * than something drawn into the texture, so it has to be re-fitted to
         * the screen every frame -- the chair still rolls and the head still
         * moves while you are sat there. No-op for the other two apps. */
        arcade.placeOverlay?.(apartment.screen, camera, renderer.domElement, THREE);
      } else {
        interaction.update(dt);
        // Keep the screen alive while the player is across the room.
        if (apartment.state.pcOn) {
          arcade.update(hdt);
          screenTexture.needsUpdate = true;
        }
      }

      // Monitor glow spilling into the room.
      // Getting a game in with the boys means dying to a cheater a few times,
      // which is the only thing Counter-Squatch has ever offered.
      const cs = arcade.app?.id === 'counter' ? arcade.app.deaths : 0;
      if (cs > apartment.state.csDeaths) {
        apartment.state.csDeaths = cs;
        audio.say(cs <= 2 ? 'cs.death.early' : 'cs.death.late', { chance: 0.4, delay: 0.7 });
      }

      // And the chapter's own thing, whichever of them this chapter asks for.
      pastimeWatch(dt);

      const glow = arcade.sampleGlow();
      apartment.screenGlow.color.setHex(glow.colour);
      apartment.screenGlow.intensity +=
        ((apartment.state.pcOn ? glow.intensity : 0) - apartment.screenGlow.intensity) *
        Math.min(1, dt * 6);

      flashlight.intensity += ((game.flashlightOn ? 6 : 0) - flashlight.intensity) * Math.min(1, dt * 10);

      audio.updateListener(camera);
    }
  }

  bathroomMirror?.render(renderer, camera);
  postfx.render();
  postfx.sample(dt);
}

frame();

/* Pausing the tab should not leave the radio blaring. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.started) {
    radio.pause();
    audio.setMasterVolume(0);
  } else {
    audio.setMasterVolume(0.9);
    if (!game.paused) radio.resume();
  }
});
