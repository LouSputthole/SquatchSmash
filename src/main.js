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
import { AudioEngine } from './core/audio.js';
import { Hud } from './core/hud.js';
import { InteractionSystem } from './core/interaction.js';
import { Player } from './core/player.js';
import { Radio } from './core/radio.js';
import { Narrator } from './core/narrator.js';
import { buildApartment } from './world/apartment.js';
import { createArcade } from './arcade/mount.js';
import { Drunk, BEER_UNITS, WHISKEY_UNITS } from './core/drunk.js';
import { Highs } from './core/highs.js';
import { Goals, ENDINGS, MEETING } from './core/goals.js';
import { Chat } from './core/chat.js';
import { Spooky } from './core/spooky.js';
import { PostFX } from './core/postfx.js';
import { BulletHoles } from './world/bullets.js';
import { Tv } from './core/tv.js';
import { Phone } from './core/phone.js';
import { ITEMS } from './core/inventory.js';
import {
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
  navigateCampaign,
} from './core/campaign.js';
import { createApartmentStory } from './core/apartment-story.js';
import { DayNight } from './core/daynight.js';
import { SmokeSystem } from './world/smoke.js';
import { StreamSystem } from './world/stream.js';
import { ShowerSystem } from './world/shower.js';
import { SplatSystem } from './world/splat.js';
import { TimingBar } from './core/timingbar.js';
import { makeHeldCigarette, makeHeldDrinks, makeRevolver, makePhone } from './world/props.js';
import { makeMaterials } from './world/materials.js';
import { roomEnvironment } from './world/textures.js';

const DRINK_TIME = 2.4;
const SWIG_TIME = 1.7;   // whiskey goes down faster, for better or worse

/* Smoking beats, in seconds from the moment you hold F. */
const CIG_SHOW = 0.34;
const CIG_DRAG = 0.46;
const CIG_EXHALE = 1.55;
const CIG_DONE = 2.40;
const CIG_AFTERGLOW = 4.20;

const canvas = document.getElementById('scene');
const fxDrunk = document.getElementById('fx-drunk');
const fxHigh = document.getElementById('fx-high');
const blackout = document.getElementById('blackout');
const overlay = document.getElementById('overlay');
const loading = document.getElementById('loading');
const startBtn = document.getElementById('start-btn');
const assetStatus = document.getElementById('asset-status');

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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

const audio = new AudioEngine();
const hud = new Hud();
const interaction = new InteractionSystem(camera, hud);
const world = { colliders: [], floorZones: [] };
const player = new Player(camera, world);

player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

const time = new DayNight(6 + 4 / 60);
const campaign = createCampaign();
const campaignAtLoad = campaign.state;
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
const returningFromBing = returningToApartment
  && campaign.hasItem(ITEM_IDS.LOU_PACKAGE);
/* Checked before the Motel, because coming home from the date is also coming
 * home with a finished Motel behind you. Newest completed thing wins. */
const returningFromSilver = returningToApartment
  && campaignAtLoad.missions[MISSION_IDS.SILVER_ROOM].status === 'complete';
const returningFromMotel = returningToApartment
  && !returningFromSilver
  && campaignAtLoad.missions[MISSION_IDS.JERKY_MOTEL].status === 'complete';
const returningFromSquatchfather = returningToApartment
  && !returningFromSilver
  && !returningFromMotel
  && campaignAtLoad.missions[MISSION_IDS.SQUATCHFATHER].status === 'complete';
const apartmentGunUnlocked =
  campaignAtLoad.missions[MISSION_IDS.BADA_BING_ONE].packageReceived === true;
const wakingOnDayTwo = !returningToApartment
  && campaignAtLoad.story.chapter === 'day_two';
const wakingOnDate = !returningToApartment
  && campaignAtLoad.story.chapter === 'date';
const wakingOnBigNight = !returningToApartment
  && campaignAtLoad.story.chapter === 'big_night';
if (campaignAtLoad.scene.id !== SCENE_IDS.APARTMENT) {
  campaign.enter(SCENE_IDS.APARTMENT, { spawn: 'wake' });
}
time.setTime(campaign.state.story.day, campaign.state.story.timeMinutes);
if (wakingOnDayTwo) {
  overlay.querySelector('.tag').textContent =
    'Day Two, 7:00 AM. Booskibro has the next job. The phone is on the nightstand.';
} else if (wakingOnDate) {
  overlay.querySelector('.tag').textContent =
    'Day Three, 12:00 PM. Nothing on today. She said she would ring.';
} else if (wakingOnBigNight) {
  overlay.querySelector('.tag').textContent =
    'Day Four, 10:00 AM. Tonight is the big night. Booskibro will call about it.';
}
// The talk station reads the clock to decide what is on air.
const radio = new Radio(audio, hud, time);
// Nothing happens in here. Somebody should say so.
const narrator = new Narrator(hud, time, audio);
const drunk = new Drunk();
// The coffee table's contribution. Neither of these costs you Wednesday.
const highs = new Highs();
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
    hud.say('<em>&mdash; and he is still in the flat with y&mdash;</em>', 2600);
    setTimeout(() => hud.say('…which is the traffic. Back to Lou.', 3200), 2800);
    audio.say('spooky', { chance: 0.7, delay: 2.0 });
  },
});
// Booski, typing into a server nobody is in. The second way to find out.
const chat = new Chat(time);
const smoke = new SmokeSystem(scene);
const bullets = new BulletHoles(scene);
const tv = new Tv({ audio });
// Campaign calls are one-shot story events, so the legacy clock schedule is
// deliberately disabled here. The physical phone still owns ring/answer/UI.
const phone = new Phone({ time, audio, calls: [] });
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
  const can = heldDrinks.can;
  const bottle = heldDrinks.bottle;
  can.visible = which === 'can';
  bottle.visible = which === 'bottle';
  const m = which === 'can' ? can : which === 'bottle' ? bottle : null;
  if (!m) return;
  // Ease so it settles at the lips instead of arriving at constant speed.
  const e = k * k * (3 - 2 * k);
  m.position.set(-0.10 * e, 0.26 * e, 0.09 * e);
  /* Tipped BACK past level, so the base finishes above the mouth and the thing
   * is actually pouring, and rolled slightly in.
   *
   * Both models are built standing up, mouth at +Y. A camera looks down -Z, so
   * +Z is the drinker's own face, and a POSITIVE rotation about X is the one
   * that swings the mouth back onto his lip and the base up over it -- the same
   * sign the held phone uses to tip its screen back toward him. This was
   * negative, which is the identical motion played backwards: the base came
   * back and the neck went out, so a swig of Jack read as pouring it on the
   * carpet in front of you.
   *
   * Past a right angle rather than up to one, too. At 1.30 the bottle only
   * reached level -- mouth at the lip but still the high end of it, which is
   * how you hold a bottle you are about to drink from and not how you hold one
   * you are drinking from. */
  m.rotation.set(1.95 * e, 0, 0.34 * e);
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
heldPhone.group.position.set(0.085, -0.125, -0.30);
heldPhone.group.rotation.set(1.20, -0.10, 0.03);
heldPhone.group.scale.setScalar(1.45);
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

/* Canvas-native desktop apps use relative pointer motion while framed apps
 * (DOOM and Squatch Smash) need an ordinary DOM mouse. Leaving pointer
 * lock for those apps is intentional and must not pause the apartment. */
const arcade = createArcade({
  audio,
  onInputModeChange(mode) {
    if (mode === 'dom') document.exitPointerLock?.();
    else if (game.seated && game.started && !game.paused) requestLock();
  },
});
const screenTexture = new THREE.CanvasTexture(arcade.canvas);
screenTexture.colorSpace = THREE.SRGBColorSpace;
screenTexture.minFilter = THREE.LinearFilter;
screenTexture.generateMipmaps = false;

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
    onShower: takeShower,
    // The drawer names the shirt he settled on, so the toast can say which.
    onDressed: (shirt) => {
      const name = shirt?.name || 'clean shirt';
      completeApartmentActivity('changedClothes', TIME_EVENT_IDS.CHANGE_CLOTHES);
      audio.say('dress', { chance: 0.8, delay: 0.4 });
      hud.toast(`Changed · ${name}`, 'good');
      hud.say(`The ${name}, then. <em>It even smells like a clean shirt.</em>`, 4200);
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
    onTvTap: () => {
      if (!apartment.state.tvOn) {
        apartment.state.tvOn = tv.toggle();
        hud.toast(apartment.state.tvOn ? 'Telly on' : 'Telly off');
      } else {
        tv.next();
        hud.toast(tv.channel.name);
      }
    },
    onTvHold: () => {
      apartment.state.tvOn = tv.toggle();
      hud.toast(apartment.state.tvOn ? 'Telly on' : 'Telly off');
    },
    // The set's own LED and dial read off apartment state, so keep it honest.
    onRadioToggle: () => { radio.toggle(); apartment.state.radioOn = radio.on; },
    onRadioTune: () => { radio.tune(); apartment.state.radioOn = radio.on; },
  });

  const savedActivities = campaign.state.activities;
  apartment.state.fed ||= savedActivities.eaten;
  apartment.state.showered ||= savedActivities.showered;
  apartment.state.dressed ||= savedActivities.changedClothes;
  apartment.state.repliedHR ||= savedActivities.emailChecked;
  if (savedActivities.pooped) apartment.state.bowel = 0;

  /* Once he has pocketed the phone he has it everywhere and for good, so a
   * flat rebuilt on a later morning starts with it already in his hand and an
   * empty nightstand. Done out here rather than inside buildApartment because
   * the inventory does not exist yet at the point the nightstand is dressed. */
  if (campaign.hasItem(ITEM_IDS.PHONE) && !apartment.inventory.has('phone')) {
    apartment.inventory.add('phone');
    apartment.phoneProp.group.visible = false;
  }

  world.colliders = apartment.colliders;
  world.floorZones = apartment.floorZones;

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

  // Third way to find out about the meeting: leave the radio on.
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
    apartmentStory.beginMorning();
    overlay.querySelector('.tag').textContent = returningFromBing
      ? 'Back from the Bing. Lou’s package is still under your jacket.'
      : returningFromSilver
        ? 'Back from the Silver Room. Tomorrow is the big night. Sleep on it.'
        : returningFromMotel
          ? 'Back from the Jerky Motel. It is half four in the morning. Go to bed.'
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

  // Dev handle: lets you inspect and pose the scene from the console, e.g.
  //   __squatch.teleport(0, 2, 'north')
  window.__squatch = {
    scene, camera, renderer, player, apartment, arcade, audio, radio, game, interaction, hud, campaign,
    apartmentStory,
    drunk, highs, smoke, stream, showerFx, cig, time, passOut, fart, startPee, stopPee,
    hitBong, eatShrooms,
    sitOnToilet, standFromToilet, takeZyn,
    sitOn, standFromSeat, lieOnBed, sleepInBed, sitAtPC, standFromPC, getUp,
    narrator, goals, chat, postfx, takeShower, cookEggs, eatEggs, tryLeave, learnAboutMeeting,
    updateBowel, updatePushes, tryPush, applyDrunkFx, startGluing, updateGluing, glue, splat,
    dropHeld,
    poseDrink, heldDrinks, spooky, bullets, fireGun, reloadGun, heldGun, tv, phone, heldPhone,
    readChat,
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

boot().catch((err) => {
  console.error(err);
  window.__squatchFail?.('Could not build the apartment', err?.message || String(err));
});

/* ------------------------------------------------------------------ */
/* Start / pause                                                       */
/* ------------------------------------------------------------------ */

startBtn.addEventListener('click', async () => {
  if (game.left) return;          // the ending card owns the button now
  await audio.init();
  const sfx = await audio.loadManifest();
  console.info(`[sfx] ${sfx.loaded}/${sfx.total} samples loaded; the rest are synthesised.`);

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
    if (returningToApartment) {
      if (returningFromBing) {
        hud.toast('Lou’s package · inside your jacket', 'good');
        hud.say('Home again. The package came back with you.', 4800);
      } else if (returningFromSilver) {
        /* The one time he comes home from something that was not work. The
         * campaign knows how the evening went; the door only says that it did. */
        const date = campaignAtLoad.missions[MISSION_IDS.SILVER_ROOM];
        hud.toast(date.seeingHerAgain
          ? 'She is seeing you again'
          : 'The evening is over', date.seeingHerAgain ? 'good' : '');
        hud.say(date.seeingHerAgain
          ? 'Home. And she said yes to the next one. <em>Tomorrow is the other thing.</em>'
          : 'Home. That went how it went. <em>Tomorrow is the other thing.</em>', 4800);
      } else if (returningFromMotel) {
        hud.toast('The jerky run is done', 'good');
        hud.say('Home. Every bit of that took all night. <em>Bed.</em>', 4800);
      } else if (returningFromSquatchfather) {
        hud.toast('The business is settled', 'good');
        hud.say('Home again. The weapon did not come back with you.', 4800);
      }
    } else {
      audio.play('bed.rustle', { volume: 0.5 });
      audio.say('wake', { delay: 1.1 });
      /* The set was already on when you went to sleep -- nobody in this flat has
       * ever deliberately turned a radio off. It also means the station gets to
       * introduce itself rather than wait to be discovered. Holding [E] on it
       * turns it off if you want the quiet. Started here rather than at boot
       * because the AudioContext does not exist until the first gesture. */
      radio.turnOn();
      apartment.state.radioOn = radio.on;
      hud.say('<em>6:04 AM.</em> You are awake. That was not the plan.', 5200);
      setTimeout(() => {
        if (player.mode === 'bed') hud.showPrompt('Get <b>up</b>', 'E');
      }, 3600);
    }
  }
  game.paused = false;
});

/* Pointer lock is how this is meant to be played, but some embeddings refuse
 * it -- a sandboxed frame without allow-pointer-lock, for one. Rather than
 * leave the game unplayable there, fall back to hold-the-left-button-and-drag
 * to look. `dragLook` is set the first time a lock request is denied. */
let dragLook = false;
let dragging = false;

function requestLock() {
  if (dragLook) {
    enableInput();
    return;
  }
  const p = canvas.requestPointerLock?.();
  // Chrome returns a promise from requestPointerLock; older builds throw or
  // simply never fire pointerlockchange, so both paths are covered.
  if (p && p.catch) p.catch(() => fallBackToDragLook());
  setTimeout(() => {
    if (!dragLook && document.pointerLockElement !== canvas && !game.paused) {
      fallBackToDragLook();
    }
  }, 600);
}

function fallBackToDragLook() {
  if (dragLook) return;
  dragLook = true;
  enableInput();
  hud.say('Pointer lock is blocked here — <em>hold the left button to look around.</em>', 7000);
}

function enableInput() {
  player.enabled = true;
  game.paused = false;
  document.body.classList.remove('unlocked');
  overlay.classList.add('hidden');
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

document.addEventListener('pointerlockchange', () => {
  if (dragLook) return;
  const locked = document.pointerLockElement === canvas;
  const computerDomInput = game.seated && arcade.inputMode === 'dom';
  player.enabled = locked || computerDomInput;
  document.body.classList.toggle('unlocked', !locked && !computerDomInput);
  if (!locked && game.started && !computerDomInput) pauseGame();
});

function pauseGame() {
  game.paused = true;
  player.clearKeys();
  interaction.release();
  overlay.classList.remove('hidden');
  overlay.querySelector('h1').innerHTML = 'PAUSED<span>SQUATCH LIFE</span>';
  overlay.querySelector('.tag').textContent = game.seated
    ? 'Still at the desk. The meeting is not until tomorrow.'
    : 'The fridge is not going anywhere.';
  startBtn.textContent = 'Resume';
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

document.addEventListener('mousemove', (e) => {
  if (!player.enabled || game.paused) return;
  if (dragLook && !dragging) return;      // look only while the button is held
  if (game.seated) {
    arcade.onPointer(e.movementX, e.movementY);
    // Let the head drift very slightly so the pose is not rigid.
    player.handleMouseMove(e.movementX * 0.06, e.movementY * 0.06);
  } else {
    player.handleMouseMove(e.movementX, e.movementY);
  }
});

document.addEventListener('mousedown', (e) => {
  if (!player.enabled || game.paused || e.button !== 0) return;
  dragging = true;
  if (game.seated) arcade.onClick(true);
  else if (apartment.state.heldItem === 'gun') fireGun();
  else interaction.press();
});

document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  dragging = false;
  if (game.seated) arcade.onClick(false);
  else interaction.release();
});

document.addEventListener('keydown', (e) => {
  if (e.repeat) {
    // Still needs to reach the hold-to-drink accumulator.
    if (e.code === 'KeyF') return;
    return;
  }
  if (!game.started || game.paused) return;

  /* Sat on the toilet, WASD is the push game rather than movement -- you are
   * not going anywhere, and the keys are already under your fingers. */
  if (game.onToilet && tryPush(e.code)) {
    e.preventDefault();
    return;
  }

  // In the shower, F is the other thing you are doing in there.
  if (game.showering !== null && e.code === 'KeyF') {
    if (game.peeing) stopPee(); else startPee();
    e.preventDefault();
    return;
  }

  if (glue.bar.active) {
    if (e.code === 'KeyE') { glue.bar.press(); e.preventDefault(); return; }
    if (e.code === 'KeyQ') {
      glue.bar.stop();
      hud.setTiming(null);
      hud.setPosture(null);
      interaction.setPaused(false);
      hud.say('Right. That can stay crooked.', 3400);
      e.preventDefault();
      return;
    }
  }

  /* Seated, the keyboard belongs to the computer. Every key is forwarded and
   * NONE of them reach the player -- WASD used to roll the chair as well,
   * which meant typing in a game was also driving your own camera around the
   * desk. [Q] is the one exception: the stand-up key works everywhere. */
  if (game.seated) {
    // Escape is left to the browser -- it releases the pointer and pauses.
    if (e.code === 'KeyQ') {
      standFromPC();
      return;
    }
    if (arcade.onKey(e.code, true)) e.preventDefault();
    if (e.code === 'Space') e.preventDefault();
    return;
  }

  player.setKey(e.code, true);

  switch (e.code) {
    case 'KeyE':
      /* The phone takes [E] first while it is the thing in his hand. You
       * cannot open a fridge and answer a call with the same key, and the
       * call wins -- it is the one thing in this flat that is not waiting
       * for you to get round to it. */
      if (apartment.state.heldItem === 'phone') { phone.press(); break; }
      // Lying down on purpose is the one case where E means sleep, not stand.
      if (game.inBed) sleepInBed();
      else if (player.mode === 'bed') getUp();
      else if (game.onToilet) standFromToilet();
      else if (game.peeing) stopPee();
      else interaction.press();
      break;
    case 'KeyG':
      fart({ voluntary: true });
      break;
    case 'KeyT':
      game.flashlightOn = !game.flashlightOn;
      audio.play('switch.click', { volume: 0.5 });
      break;
    /* Bloom off, for a machine that is struggling. There is no options menu to
     * put this in and it is the first thing worth dropping. */
    /* Slots. Digit1..Digit5 pick one directly; the wheel cycles (below). */
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
      apartment.inventory.select(Number(e.code.slice(5)) - 1);
      break;
    case 'KeyB':
      hud.toast(postfx.toggle() ? 'Bloom on' : 'Bloom off', 'good');
      break;
    case 'KeyR':
      /* Reload takes priority over skipping the radio, but only while the gun
       * is the thing in his hand -- otherwise standing at the sideboard with a
       * revolver in your pocket would stop [R] working on the radio, which is
       * what it is for everywhere else in the flat. */
      if (apartment.state.heldItem === 'gun') reloadGun();
      else if (interaction.current && interaction.current.name === 'radio') radio.next();
      break;
    case 'KeyQ':
      if (apartment.state.heldItem === 'phone' && phone.call) {
        phone.hangUp();
        break;
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
      break;
    default:
      break;
  }
});

document.addEventListener('keyup', (e) => {
  player.setKey(e.code, false);
  if (e.code === 'KeyE' && !game.seated) interaction.release();
});

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

function sitAtPC() {
  if (game.seated) return;
  game.seated = true;
  // Anything held on the walk up dies here; while seated no key reaches him.
  player.clearKeys();
  interaction.setPaused(true);
  hud.setMode('seated');
  audio.play('chair.roll', { volume: 0.4 });
  audio.play('chair.sit', { volume: 0.6, delay: 0.25 });
  audio.say('pc.sit', { chance: 0.6, delay: 0.9 });

  player.sitAt(apartment.deskPose, () => {
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
  game.seated = false;
  arcade.setSeated?.(false);
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

  player.sitAt(seat.pose(), () => {
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
  game.sitting = null;
  game.inBed = true;
  interaction.setPaused(true);
  hud.setMode('seated');
  audio.play('bed.creak', { volume: 0.7 });
  audio.play('bed.rustle', { volume: 0.6, delay: 0.25 });
  audio.say('liedown', { chance: 0.8 });

  player.lieDown(apartment.bedPose, () => {
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
  hud.say(storySleep.chapter === 'big_night'
    ? 'The jerky is somebody else’s problem now. You close your eyes.'
    : storySleep.ok
      ? 'Day One is done. You close your eyes.'
      : 'You close your eyes. It is not like you had plans.', 2600);
  passOut({ voluntary: true, storySleep });
}

/* ------------------------------------------------------------------ */
/* Beer and smokes                                                     */
/* ------------------------------------------------------------------ */

function dropHeld() {
  const st = apartment.state;
  if (!st.heldItem || cig.t >= 0) return;

  /* Everything below either goes back where it came from or is a thing he was
   * always going to finish. The phone is neither, and it used to fall through
   * the `else` at the bottom: the slot was emptied, the nightstand model had
   * been hidden since he picked it up, and nothing anywhere put it back. One
   * press of [Q] deleted the only object in the game that Lou can reach him
   * through. It is his phone -- he does not put it down, he pockets it. */
  if (st.heldItem === 'phone') {
    hud.say('It is my phone. <em>It stays on me.</em>', 3000);
    return;
  }

  if (st.heldItem === 'empty') {
    audio.play('can.crush', { volume: 0.6 });
    hud.toast('Crushed the can');
  } else if (st.heldItem === 'cigs') {
    apartment.returnCigarettes();
    audio.play('can.set', { volume: 0.35 });
  } else if (st.heldItem === 'whiskey') {
    apartment.returnWhiskey();
    audio.play('whiskey.cap', { volume: 0.5 });
  } else {
    audio.play('can.set', { volume: 0.5 });
  }
  st.heldItem = null;
  hud.setHand(null);
}

/** Both consumables are on hold-F; which one runs depends on what you hold. */
function updateConsume(dt) {
  const st = apartment.state;
  const holdingF = player.keys.has('KeyF') && !game.seated && !game.passingOut;

  if (st.heldItem === 'cigs' || cig.t >= 0) updateSmoking(dt, holdingF);
  else if (st.heldItem === 'whiskey') updateSwigging(dt, holdingF);
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
      if (!interaction.current) hud.hidePrompt();
    }
    return;
  }

  game.eatingSlice = (game.eatingSlice || 0) + dt;
  hud.setHold({ label: 'Eating', k: Math.min(1, game.eatingSlice / SLICE_TIME) });
  if (game.eatingSlice < SLICE_TIME) return;

  game.eatingSlice = 0;
  hud.setHold(null);
  st.heldItem = null;                 // empties the slot the slice was in
  st.fed = true;
  completeApartmentActivity('eaten', TIME_EVENT_IDS.EAT);
  audio.play('egg.eat', { volume: 0.6 });
  audio.say('slice', { chance: 0.8, delay: 0.9 });
  hud.toast('Ate a slice', 'good');
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
    // Four of these and you will be needing the bathroom.
    apartment.state.bowel = Math.min(1, apartment.state.bowel + 0.26);

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
  // Far enough ahead that the cloud reads as a plume rather than fog on the
  // lens, and quick enough that it clears the view on its own.
  _v.addScaledVector(_dir, 0.55);
  _v.y -= 0.07;
  // Many small billows travelling fast reads as a plume; a few big ones just
  // fog the lens.
  smoke.emit(_v, _dir, {
    count: 18, speed: 2.20, spread: 0.26,
    size0: 0.045, size1: 0.38, life: 2.8, peak: 0.22, rise: 0.24,
  });
  // A second, slower burst so the plume has a tail rather than one pop.
  smoke.emit(_v, _dir, {
    count: 10, speed: 0.90, spread: 0.18,
    size0: 0.035, size1: 0.32, life: 4.0, peak: 0.14, rise: 0.18,
  });
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

  // Kick off once a night, then keep it going for about forty in-game minutes.
  if (h >= ARGUMENT_HOUR && h < ARGUMENT_HOUR + 0.7 && argumentDay !== time.day) {
    argumentDay = time.day;
    argumentUntil = time.minutes + 40;
    nextShoutAt = 0;
    hud.say('Upstairs. Or next door. It is hard to tell through the wall.', 5200);
  }

  if (time.minutes > argumentUntil) return;

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

  // A harder, shorter hit than a cigarette, and no trip to the bathroom.
  drunk.rush = Math.max(drunk.rush, 1.25);
  drunk.steady = Math.max(drunk.steady, 55);
  game.zynUntil = time.elapsedReal + ZYN_SECONDS;

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
function hitBong() {
  if (game.passingOut) return;
  audio.play('cig.light', { volume: 0.6 });
  audio.play('bong.bubble', { volume: 0.8, delay: 0.5 });
  audio.play('cig.exhale', { volume: 0.6, delay: 2.6 });
  audio.say('bong', { chance: 0.8, delay: 3.4 });
  highs.smokeBong();
  smoke.emit(camera.position, cameraForward(), { count: 14, spread: 0.5, speed: 0.7 });
  hud.toast('That is going to take a minute', 'good');
  hud.say(highs.weed > 0.6
    ? 'Everything has slowed down and you are fine with it.'
    : 'The room gets softer at the edges.', 5200);
}

/** A cap. Nothing happens for a minute and a half, and then it does. */
function eatShrooms() {
  if (game.passingOut) return;
  audio.play('zyn.pack', { volume: 0.5 });
  audio.say('shrooms', { chance: 0.9, delay: 0.8 });
  highs.eatShrooms();
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

  /* Breakfast starts things moving.
   *
   * The bowel gate used to be reachable only by smoking four cigarettes, so a
   * player who never touched the pack got no urge, never used the toilet for
   * the other thing, and never heard a word of that whole bank -- and the door
   * excuse guarding it could not fire either. Two eggs put you most of the way
   * there, which is both funnier and true. It still takes a while to arrive. */
  st.bowel = Math.min(1, st.bowel + 0.62);
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
  audio.play('glue.pickup', { volume: 0.6, position: apartment.gluePos });
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
  hud.toast('Wednesday, 7 PM', 'good');
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
    pooped: game.pooped,
    changedClothes: apartment.state.dressed,
    emailChecked: apartment.state.repliedHR,
  };
}

function syncClockFromCampaign() {
  const { day, timeMinutes } = campaign.state.story;
  time.setTime(day, timeMinutes);
  apartment?.refreshClocks?.();
  hud.setClock(day, time.clock12, time.elapsedReal);
  arcade.setClock?.(time.clock12);
}

function completeApartmentActivity(activityId, timeEventId) {
  const result = campaign.advanceTime(timeEventId, (state) => {
    state.activities[activityId] = true;
  });
  syncClockFromCampaign();
  return result;
}

function saveApartmentProgress() {
  campaign.update((state) => {
    state.activities.eaten = apartment.state.fed;
    state.activities.showered = apartment.state.showered;
    state.activities.pooped = game.pooped;
    state.activities.changedClothes = apartment.state.dressed;
    state.activities.emailChecked = apartment.state.repliedHR;
    state.story.meetingKnown = goals.known;
    state.story.meetingLearnedFrom = goals.learnedFrom;
  });
}

/**
 * The door. It never lists what is missing -- it gives one reason, in his
 * voice, and the reason is whichever thing he would think of first.
 */
function tryLeave() {
  if (game.left || game.passingOut) return;
  const pos = new THREE.Vector3(2.8, 1.1, 4.3);
  const res = apartmentStory.tryLeave(activityContext());

  if (res.kind === 'call') {
    audio.play('door.locked', { position: pos, volume: 0.8 });
    narrator.note('door');
    hud.say(res.line, 4600);
    return res;
  }
  if (res.kind === 'go') {
    leaveForMission(res.destination);
    return res;
  }

  audio.play('door.locked', { position: pos, volume: 0.7 });
  narrator.note('door');
  hud.say(res.line, 5200);
  if (res.hint) hud.toast(res.hint, '');
  return res;
}

/** Out of the apartment and into whichever campaign mission is ready. */
function leaveForMission(destination) {
  game.left = true;
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
  if (destination === SCENE_IDS.SILVER_ROOM) {
    // The mission's own story class flips it to in_progress on the pavement.
    campaign.advanceTime(TIME_EVENT_IDS.DEPART_SILVER_ROOM);
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

  interaction.setPaused(true);
  hud.hidePrompt();
  player.clearKeys();
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
  hud.say('<em>Eight o\'clock.</em> That will have started without you.', 6000);
  hud.toast('You missed it', 'bad');
}

function showEnding(kind) {
  const e = ENDINGS[kind] || ENDINGS.clean;
  game.paused = true;
  player.enabled = false;
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
    next.href = 'bing.html';
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
      st.bladder = Math.max(0, st.bladder - dt * 0.075);
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
    hud.say('Four cigarettes on an empty stomach. <em>The bathroom. Immediately.</em>', 6000);
  }
}

/* ------------------------------------------------------------------ */
/* Relieving yourself                                                  */
/* ------------------------------------------------------------------ */

function startPee() {
  if (game.peeing || game.passingOut) return;
  game.peeing = true;
  game.peeTime = 0;
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
  st.bladder = Math.max(0, st.bladder - dt * 0.075);

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
 * The first thing he says on waking.
 *
 * A sleep that turned a story chapter announces the chapter -- those are the
 * only two nights in the campaign that mean anything. Everything else is the
 * old copy for a nap or for the drink taking him.
 */
function wakeUpLine(storySleep, voluntary) {
  if (storySleep?.chapter === 'big_night') {
    return `<em>Day Three. ${time.clock12}.</em> Tonight is the thing. `
      + 'Booskibro said he would call.';
  }
  if (storySleep?.ok) {
    return `<em>Day Two. ${time.clock12}.</em> Booskibro said he would call.`;
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

  player.clearKeys();
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
      time.skipHours(12);
    }
    apartment.refreshClocks();
    apartment.state.heldItem = null;
    hud.setHand(null);
    game.passingOut = false;
    blackout.querySelector('span').textContent = '';
    blackout.classList.remove('on');
    audio.play('bed.rustle', { volume: 0.5 });
    hud.say(wakeUpLine(storySleep, voluntary), 6000);
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
  const amount = Math.round(drunk.vignette * 50) / 50;

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
      phone.update(dt);
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
      if (gunKick > 0) gunKick = Math.max(0, gunKick - dt * 2.6);
      heldGun.group.rotation.x = 0.06 + gunKick;
      heldGun.group.position.z = -0.30 + gunKick * 0.10;
      const hdt = dt * highs.timeScale;

      // Intoxication first: the player controller reads sway/impair this frame.
      if (drunk.update(dt)) passOut();
      player.sway = drunk.sway;
      player.impair = game.passingOut ? 0 : Math.max(0, (drunk.level - 0.34) / 0.66);
      arcade.setImpairment?.(drunk.swayStrength);
      applyDrunkFx();

      // Weed rides on top of the drink rather than replacing it.
      player.sway.yaw += highs.sway.yaw;
      player.sway.pitch += highs.sway.pitch;
      player.sway.roll += highs.sway.roll;
      player.moveScale = highs.moveScale;
      player.lookDrag = highs.lookDrag;

      player.update(dt);
      apartment.update(hdt, elapsed);
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
      narrator.update(dt, {
        /* A call is on the list now that he answers them out loud. Two of his
         * own voice at once is not a joke twice, it is one of them ruined. */
        busy: game.passingOut || game.seated || game.peeing || game.onToilet
          || cig.t >= 0 || player.mode === 'frozen' || phone.inCall,
        moving: player.velocity.lengthSq() > 0.04,
      });

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

      const glow = arcade.sampleGlow();
      apartment.screenGlow.color.setHex(glow.colour);
      apartment.screenGlow.intensity +=
        ((apartment.state.pcOn ? glow.intensity : 0) - apartment.screenGlow.intensity) *
        Math.min(1, dt * 6);

      flashlight.intensity += ((game.flashlightOn ? 6 : 0) - flashlight.intensity) * Math.min(1, dt * 10);

      audio.updateListener(camera);
    }
  }

  postfx.render();
  postfx.sample(dt);
}

frame();

/* Pausing the tab should not leave the radio blaring. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.started) audio.setMasterVolume(0);
  else audio.setMasterVolume(0.9);
});
