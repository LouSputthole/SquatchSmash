import * as THREE from 'three';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { PostFX } from '../core/postfx.js';
import { lambert } from '../../game/src/world.js';
import { BloodSpurtSystem, DeathBloodPool } from '../world/blood.js';
import { AudioEngine } from '../core/audio.js';
import { playWeaponCue, weaponCueNames } from '../core/weapons/audio.js';
import * as sfx from './audio.js';
import {
  SPEECH,
  Q1_LINES,
  Q2_LINES,
  CORRECT_LINES,
  WRONG_LINES,
  QUIZ_OPTIONS,
  oathChoices,
} from './dialogue.js';
import {
  SPEAKERS as SCRIPT_SPEAKERS,
  asideFor,
  allCabinVoiceLines,
  beatById,
} from './script.js';
import { CAMERA_MODES, CONTROL_MODES, PHASES } from './phases.js';
import { OUTDOOR_MEMBER_STATIONS } from './ceremony-layout.js';
import {
  InitiationPlayerAdapter,
  PLAYER_POSES as ADAPTER_PLAYER_POSES,
  createInitiationActorCircle,
  syncInitiationActorCircle,
} from './player-adapter.js';
import {
  clearPose,
  isPosed,
  makeInitiationCeremonyFigure,
  poseFallen,
  poseKneeling,
  poseKneelingPanic,
  poseSeated,
  poseStandingFallen,
} from './ceremony-figure.js';
import {
  INITIATION_BARRAGE_SHOTS,
  InitiationBarrageClock,
  buildInitiationExecutionRevolver,
  fireInitiationExecutionRevolver,
  initiationRevolverMuzzleWorld,
  mountInitiationExecutionRevolver,
  updateInitiationExecutionRevolver,
} from './presentation.js';
import {
  buildExecutionHolster,
  buildFounderStaff,
  mountFounderStaff,
  poseCeremonyOffer,
  poseCeremonySalute,
  poseExecutionDraw,
  poseExecutionHolster,
  poseFounderStaffGrip,
  setExecutionSidearmDrawn,
} from './ceremony-props-motion.js';
import {
  KITTENBOSS_SLOT,
  KNEELING_EXECUTIONS,
  LINE_UP,
  STANDING_EXECUTION,
  executionRunOrder,
  markForStep,
  verifyExecutionStaging,
} from './executions.js';
import {
  INITIATION_CABIN_MUSIC_KEY,
  INITIATION_CARD_SLOT,
  buildInitiationCabinSite,
} from './cabin/index.js';
import {
  BURN_BARREL,
  CABIN,
  CABIN_DOOR,
  CEREMONY_CENTRE,
  CLEARING,
  KNEEL_HEAD_Y,
  LINE_CENTER,
  LOU_SEAT,
  PLAYER_EYE_Y,
  ROOM,
  TABLE,
  TABLE_SOCKETS,
  TRAIL,
  blockingSlot,
  distance2D,
  headingToward,
  pointAlongPath,
} from './cabin/site.js';
import {
  attachToHand,
  faceAt,
  handSocket,
  standOn,
} from './cabin/staging.js';
import { INITIATION_SHOTS } from './framing.js';
import { CardBurn } from './cabin/card-burn.js';
import {
  buildRoomReactionSchedule,
  roomReactionDuration,
} from './room-reaction.js';
import { resolveGear } from '../world/gear.js';
import { playFootstep } from './cabin/ambience.js';
import {
  INITIATION_CABIN_PROCESSION,
  INITIATION_CABIN_REQUIRED_AT_MARK,
  INITIATION_TRAIL_BEATS,
  INITIATION_TRAIL_FORMATION,
  cabinProcessionRoute,
  formationTarget,
  trailNarrativeStatus,
} from './trail-formation.js';
import { SPEECH_MIX, speak, speechDuration } from '../core/dialogue.js';
import { createFirstPersonInput } from '../core/first-person-input.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { shakeScale, bindAudioVolume } from '../core/settings.js';
import { createObjectivePanel } from '../core/objective-panel.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import { createCampaignCreditsView } from '../core/campaign-credits-view.js';
import { campaignCreditRoll } from '../core/campaign-credits.js';
import { prospectRecordCreditEntries } from '../core/campaign-stats.js';
import { createInitiationFinale } from './finale.js';
import {
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} from '../core/campaign.js';

// ============================================================
// INITIATION NIGHT — the cabin ceremony.
//
// Tony walks through black woods to a firelit clearing. One prospect answers
// wrong and is shot where he stands. When the family admits Sauce had help,
// every remaining prospect is put on their knees in front of Tony. Four are
// executed. Kittenboss is killed last beside Tony. The gun then reaches Tony
// before Lou stops it. Tony alone is walked up the trail and made.
//
// THE SCENE NEVER WINKS. docs/TONE-AND-PARODY.md is the doctrine and this
// file obeys it: nobody remarks that any of this resembles anything, nobody
// enjoys the killing, and nothing in Gratin's or Seff's behaviour
// acknowledges that they are the two gentlest men in the game.
//
// WHERE THE PARTS LIVE
//   ./script.js       every word, every cue, every choice.
//   ./phases.js       the state table — objective, camera, timeout, exits.
//   ./executions.js   who is walked out, by whom, onto which mark.
//   ./cabin/site.js   every measurement on the site.
//   ./cabin/*.js      the site itself, the poses, the props, the footing.
// This file is the driver and holds no measurements of its own.
// ============================================================

const BOUNDS = 88;
const BASE_FOV = 55;

// The rites start with empty hands, but the same five pockets remain visible
// as every other campaign scene. Scene loadouts replace these contents; the
// inventory language itself never changes underneath the player.
const sceneInventory = new SceneInventoryBar({ slots: 5, visible: true });

/* ------------------------------------------------------------------
 * Campaign bookkeeping, unchanged: claim the scene so a reload lands back
 * here, write the completion event exactly once at the making, and give the
 * hand the final wind beat directly to the shared full-screen credit roll.
 * ------------------------------------------------------------------ */
const campaign = createCampaign();
if (campaign.state.scene.id !== SCENE_IDS.INITIATION) {
  campaign.enter(SCENE_IDS.INITIATION, { spawn: 'gathering' });
}

const campaignCreditsView = createCampaignCreditsView();
const initiationFinale = createInitiationFinale();
campaignCreditsView.setDoneHandler(() => initiationFinale.showReplayPortal());

const ACTIVE_INITIATION_VOICE_CUES = Object.freeze([...new Set([
  ...allCabinVoiceLines(),
  ...SPEECH, ...Q1_LINES, ...Q2_LINES, ...CORRECT_LINES, ...WRONG_LINES,
  ...QUIZ_OPTIONS,
].map((line) => line?.cue).filter(Boolean))]);

let initiationRecorded = false;
function recordInitiationComplete() {
  if (initiationRecorded) return;
  initiationRecorded = true;
  try {
    campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_INITIATION, (state) => {
      state.missions[MISSION_IDS.INITIATION].status = 'complete';
    });
  } catch (error) {
    console.error('[initiation] completion could not be recorded', error);
  }
}

/* THESE THREE NUMBERS ARE COPIED INTO `cabin/site.js` AND A TEST ASSERTS THE
 * COPY STILL MATCHES. site.js has to be buildable headless and this file is a
 * top-level WebGL boot script, so the line-up's geometry is duplicated rather
 * than imported. Change one and change the other in the same commit. */
const LINE_Z = -8;
const PLAYER_SLOT = { x: -2.2, z: LINE_Z };
const PROSPECT_XS = [-4.4, 0, 2.2, 4.4];

/* The line-up in `executions.js` carries the same four numbers plus Kittenboss
 * on the end. If the two ever disagree, somebody has moved a prospect in one
 * file and left the other describing a different row. */
{
  const authored = LINE_UP.filter((slot) => !slot.player && slot.name !== 'KITTENBOSS')
    .map((slot) => slot.x);
  if (String(authored) !== String(PROSPECT_XS)) {
    console.error('[initiation] the line-up and PROSPECT_XS disagree', authored, PROSPECT_XS);
  }
}

const SPAWN = { x: 0, z: -78 };
/** Walking this close to the line starts the ceremony. */
const ARRIVE_R = 17;

// Everyone here is human. The prospects came straight from their apartments —
// no bandana yet, that has to be earned.
/**
 * THE CIRCLE, standing in the clearing.
 *
 * There is no stage on this site and nobody has been raised above anybody all
 * evening — that is the difference the owner asked for between this and a
 * conference room with cigarettes. The founders stand at the west end of the
 * working ground facing the line; everybody else is BEHIND the line, in the
 * headlights, which is where Gratin and Seff walk out of at IN-105.
 *
 * `key` is the script speaker this body belongs to, so a line always comes out
 * of the right man rather than out of the middle of the clearing.
 */
const CIRCLE = OUTDOOR_MEMBER_STATIONS;

/**
 * Where each of them stands inside the cabin.
 *
 * Nine slots come from `site.js`'s BLOCKING, which has been measured against
 * the furniture; the other six stand a pace outside the ring, on the room's
 * own diagonal, which keeps them off the table and off the door.
 */
const CABIN_BLOCKING = {
  LOU: 'lou',
  BOOSKIBRO: 'booski',
  RIPPINFLOW: 'rippin',
  DEATHMEGATRON: 'ring-1',
  NUMBSKULL: 'ring-2',
  SHUBENATOR: 'ring-3',
  GRATIN: 'ring-4',
  SEFF: 'ring-5',
  APE: 'ring-6',
};
/** The rest, out against the walls. Inside ROOM, clear of every FURNITURE box. */
const CABIN_WALL_SLOTS = {
  SNOW: { x: 21.10, z: 23.10 },
  IRISH: { x: 26.90, z: 23.10 },
  HOGMAMA: { x: 22.60, z: 26.30 },
  ERIC: { x: 25.40, z: 26.30 },
  LAG: { x: 20.30, z: 26.60 },
  SASOLE: { x: 27.70, z: 26.60 },
};

// ---------- Renderer / scene / bloom ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
attachPixelRatio(renderer);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 600);

/* One canonical post chain, tuned down for readable faces in the cabin. The
 * shared helper owns output colour, adaptive performance fallback and resize
 * behaviour; this scene supplies only art-direction policy. */
const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
if (postfx.bloom) {
  postfx.bloom.threshold = 1.18;
  postfx.bloom.strength = 0.30;
  postfx.bloom.radius = 0.28;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Night sky, fog, lights ----------
scene.background = new THREE.Color(0x05080f);
scene.fog = new THREE.Fog(0x05080f, 24, 130);

/* THERE IS A MOON OUT, AND YOU ARE SUPPOSED TO BE ABLE TO SEE BY IT.
 *
 * Owner, 2026-08-24: *"In initationscene there needs to be some more moonlight
 * to see... you should walk up a poorly lit wooded trail."*
 *
 * POORLY LIT IS NOT UNLIT. The trail, the trunks and the forest floor were all
 * authored -- a dirt ribbon at 0x2f2820, bark at 0x2b2016, needles at 0x1b3122
 * -- and then rendered under a 0.42 sky and a 0.42 moon, which puts every one
 * of them within a few values of the 0x05080f background. Screenshots of the
 * yard and the trail came back as black rectangles with a bonfire in them: the
 * player was walking through geometry he had no way of knowing was there, and
 * the only navigable light in the scene was the fire he was walking away from.
 *
 * The numbers look large next to the ones they replace, and the reason is the
 * colour space rather than the art direction: the floor texture's base is
 * #14221a, and sRGB-to-linear takes 0.078 down to about 0.007 before a single
 * light touches it. Multiplying a near-zero by a small number leaves a near
 * zero, which is why the first attempt at this -- 0.42 up to 1.05 -- came back
 * from the screenshot pass looking identical.
 *
 * The fire and the headlights are still far and away the brightest things in
 * the scene, which is the whole look and is untouched: the bonfire is a point
 * light at 56 and each headlight is a spot at 140. What has changed is that
 * the ground between them now has a value.
 */
scene.add(new THREE.HemisphereLight(0x24314f, 0x11160f, 1.6));

const moonLight = new THREE.DirectionalLight(0x9db4e6, 3.2);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -45;
moonLight.shadow.camera.right = 45;
moonLight.shadow.camera.top = 45;
moonLight.shadow.camera.bottom = -45;
moonLight.shadow.camera.near = 10;
moonLight.shadow.camera.far = 200;
moonLight.shadow.bias = -0.0005;
scene.add(moonLight);
scene.add(moonLight.target);
const _moonOffset = new THREE.Vector3(-35, 60, 45);
/** The same bearing, unit length, for anything that wants to point at the moon. */
const _moonDirection = _moonOffset.clone().normalize();

function makeDotTexture(size = 64, stops = [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.7)'], [1, 'rgba(255,255,255,0)']]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [k, col] of stops) g.addColorStop(k, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const dotTex = makeDotTexture();

// Stars: brightness-varied points high on a dome — bloom picks out the bright ones
{
  const N = 550;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const el = 0.12 + Math.random() * 1.35;
    const r = 380;
    pos[i * 3] = Math.cos(a) * Math.cos(el) * r;
    pos[i * 3 + 1] = Math.sin(el) * r;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
    c.setHSL(0.58 + Math.random() * 0.1, 0.4, 0.35 + Math.random() * 0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 2.4, map: dotTex, vertexColors: true, transparent: true,
    depthWrite: false, sizeAttenuation: false, fog: false,
  });
  mat.color.setScalar(2.2);
  scene.add(new THREE.Points(geo, mat));
}

/* AND THE LIGHT HAS A SOURCE.
 *
 * `moonLight` is a DirectionalLight coming out of `_moonOffset`, and there was
 * nothing up there. A scene lit by a moon nobody can find reads as a scene
 * with the brightness turned up, which is the note this is answering rather
 * than the fix for it. So: a disc and a halo, in the direction the light comes
 * from, parked far enough out to sit behind everything and marked `fog: false`
 * so the night air does not eat it at 130 metres.
 *
 * It rides the player the way the light does (see `updateCamera`) -- a moon
 * that parallaxes across a thirty-metre walk is a moon a hundred metres away,
 * which is worse than no moon at all.
 */
const MOON_DISTANCE = 340;
const moonDisc = new THREE.Group();
moonDisc.name = 'initiation.moon';
{
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(9.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false, depthWrite: false }),
  );
  face.name = 'initiation.moon.disc';
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(34, 32),
    new THREE.MeshBasicMaterial({
      color: 0x8ea6d8, map: dotTex, transparent: true, opacity: 0.42,
      fog: false, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  halo.name = 'initiation.moon.halo';
  halo.position.z = -0.5;
  moonDisc.add(halo, face);
  moonDisc.renderOrder = -1;
  /* It is three hundred metres up and it is meant to be. The site's float and
   * support gates exist to catch a tree hovering off the forest floor, and a
   * moon is the one object in this scene that is allowed to have nothing under
   * it -- so it says so, rather than being argued about in an allowlist. */
  for (const node of [moonDisc, face, halo]) node.userData.sceneAuditIgnore = true;
  scene.add(moonDisc);
}

// Distant ridge silhouettes
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
  const dist = 145 + Math.random() * 30;
  const h = 32 + Math.random() * 32;
  const mtn = new THREE.Mesh(new THREE.ConeGeometry(h * 0.95, h, 5), lambert(0x080d17));
  mtn.position.set(Math.cos(a) * dist, h / 2 - 2, Math.sin(a) * dist);
  mtn.rotation.y = Math.random() * Math.PI;
  scene.add(mtn);
}

/* ------------------------------------------------------------------
 * THE SITE.
 *
 * The woods, the ground, the mud, the bonfire, the cars and their
 * headlights, the track in, the trail up, and the cabin inside and out —
 * built by `./cabin/`, deterministically, from one seed.
 *
 * This file no longer scatters its own forest, lays its own ground plane, or
 * builds a second bonfire or a banner stage. Those duplicates are gone: two
 * forests interleave and half of one moves on every reload, two ground planes
 * z-fight, and a lit stage with a purple banner on it forty feet from four
 * people being executed in the mud is the old scene's staging fighting this
 * one. See the integration contract in `./cabin/index.js`.
 * ------------------------------------------------------------------ */
const audio = new AudioEngine();
const site = buildInitiationCabinSite({ audio });
scene.add(site.root);
const colliders = [...site.colliders];

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- Particles: barrel embers, smoke, fireflies ----------
function makeParticles({ count, color, size, blending, opacity, attenuate = true, boost = 1 }) {
  const positions = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color, size, map: dotTex, transparent: true, opacity,
    depthWrite: false, blending, sizeAttenuation: attenuate,
  });
  mat.color.multiplyScalar(boost);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return { geo, positions, points };
}

/* Supplemental embers rise from the cabin site's single owned bonfire.
 * `BURN_BARREL` remains only a compatibility alias for that same anchor. */
const EMBER_N = 44;
const embers = makeParticles({
  count: EMBER_N, color: 0xffa040, size: 0.3,
  blending: THREE.AdditiveBlending, opacity: 0.85, boost: 2.4,
});
const emberData = [];
function resetEmber(i, scatter = false) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.random() * BURN_BARREL.radius;
  embers.positions[i * 3] = BURN_BARREL.x + Math.cos(a) * r;
  embers.positions[i * 3 + 1] = BURN_BARREL.height + (scatter ? Math.random() * 4 : Math.random() * 0.8);
  embers.positions[i * 3 + 2] = BURN_BARREL.z + Math.sin(a) * r;
  emberData[i] = {
    vy: 1.4 + Math.random() * 2.0,
    vx: (Math.random() - 0.5) * 0.6,
    vz: (Math.random() - 0.5) * 0.6,
    life: 1.4 + Math.random() * 2.0,
    t: 0,
    phase: Math.random() * 10,
  };
}
for (let i = 0; i < EMBER_N; i++) resetEmber(i, true);

const FIREFLY_N = 30;
const fireflies = makeParticles({
  count: FIREFLY_N, color: 0x9fff6a, size: 0.3,
  blending: THREE.AdditiveBlending, opacity: 0.8, boost: 2.2,
});
const fireflyBase = [];
for (let i = 0; i < FIREFLY_N; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 22 + Math.random() * 40;
  fireflyBase.push({
    x: CLEARING.x + Math.cos(a) * r,
    y: 0.8 + Math.random() * 1.8,
    z: CLEARING.z + Math.sin(a) * r,
    phase: Math.random() * 20,
  });
}

// ---------- Characters ----------
function makeNameplate(name, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = '900 52px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(18,13,36,.92)';
  ctx.strokeText(name, 256, 50);
  ctx.fillStyle = color;
  ctx.fillText(name, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, opacity: 0.92,
  }));
  spr.scale.set(2.6, 0.49, 1);
  spr.position.y = 3.05;
  return spr;
}

const playerController = new InitiationPlayerAdapter(camera, {
  circles: colliders,
  bounds: BOUNDS,
  onFootstep: onStep,
});
playerController.teleport(SPAWN, { heading: 0 });
const player = playerController.player;
let input = null;

// Tony's ceremony body is presentation only. The shared Player owns movement,
// collision and camera; this rig appears only when an authored cabin shot
// deliberately leaves first person.
let playerFigure = makeInitiationCeremonyFigure('TONY');
playerController.syncFigure(playerFigure);
playerFigure.group.visible = false;
scene.add(playerFigure.group);

const FIRST_PERSON_RITUAL_PHASES = new Set([
  'hand', 'cut', 'card', 'oath_1', 'oath_2', 'burn', 'made',
  'shot_offer', 'shot_toast', 'shot_drink',
]);

/**
 * The player never leaves first person, but the hand ritual still needs hands.
 * Keep the articulated shared body as the socket owner, hide every third-
 * person surface, and reveal only its arm hierarchies while the ritual uses
 * them. Props parented to a hand after this mask remain visible naturally.
 */
function prepareFirstPersonRitualFigure(figure) {
  if (!figure?.group || figure.group.userData.firstPersonRitualPrepared) return;
  figure.group.traverse((node) => {
    if (node.isMesh) node.visible = false;
  });
  for (const arm of [figure.armL, figure.armR]) {
    arm?.traverse((node) => {
      if (node.isMesh) node.visible = true;
    });
  }
  figure.group.userData.firstPersonRitualPrepared = true;
}

function poseFirstPersonRitualHands(figure, phaseId = phase, elapsed = phaseT) {
  if (!figure) return;
  figure.resetArticulation?.();

  /* `hand` and `shot_offer` deliberately leave the arms at their authored
   * rest. The prompt is a request for the next movement, not a caption for a
   * pose that is already on screen. `cut` owns the visible raise after input. */
  if (phaseId === 'hand' || phaseId === 'shot_offer') return;

  if (phaseId === 'shot_toast' || phaseId === 'shot_drink') {
    const drink = phaseId === 'shot_drink'
      ? THREE.MathUtils.smoothstep(elapsed / 1.15, 0, 1)
      : 0;
    figure.armL?.rotation.set(-0.20, 0.02, -0.16);
    figure.foreL?.rotation.set(-0.34, 0, -0.02);
    figure.armR?.rotation.set(
      THREE.MathUtils.lerp(-0.94, -1.58, drink),
      -0.05,
      THREE.MathUtils.lerp(0.30, 0.12, drink),
    );
    figure.foreR?.rotation.set(THREE.MathUtils.lerp(-1.08, -1.54, drink), 0, 0.04);
    return;
  }

  const raise = phaseId === 'cut'
    ? THREE.MathUtils.smoothstep(elapsed / 0.58, 0, 1)
    : 1;
  /* The saint card is a real 65 x 98 mm prop. At -0.98 the palm centre was
   * technically in frame while the lower 5% of the card was below it. Raise
   * the presenting elbow six degrees so the whole card, not just its socket,
   * clears the HUD-safe frame in the actual 640 x 360 browser proof. */
  figure.armL?.rotation.set(-1.08 * raise, 0.04 * raise, -0.28 * raise);
  figure.foreL?.rotation.set(-1.08 * raise, 0, -0.04 * raise);
  figure.armR?.rotation.set(-0.72 * raise, -0.04 * raise, 0.34 * raise);
  figure.foreR?.rotation.set(-0.92 * raise, 0, 0.04 * raise);
}

prepareFirstPersonRitualFigure(playerFigure);

/* Four of them, plus the player if he gets it wrong. */
const deathPools = new DeathBloodPool(scene, { capacity: 6 });
/* The mist off each round. Seven droplets a shot, and the act fires plenty. */
const spurts = new BloodSpurtSystem(scene);
const _spray = new THREE.Vector3();

const actorColliders = [];
function bindActorCollider(owner, kind) {
  const circle = createInitiationActorCircle(owner.sq);
  const binding = { circle, owner, kind };
  actorColliders.push(binding);
  colliders.push(circle);
  return binding;
}

/** Every body in the Circle, keyed by the script speaker it belongs to. */
const members = [];
const memberByKey = new Map();
for (const spec of CIRCLE) {
  const sq = makeInitiationCeremonyFigure(spec.key, { face: spec.face ?? null });
  sq.group.position.set(spec.x, 0, spec.z);
  sq.heading = headingToward(spec, LINE_CENTER);
  sq.group.rotation.y = sq.heading;
  sq.walkT = Math.random() * 10;
  sq.breatheT = Math.random() * 10;
  /* Established members are recognised by their canonical faces and clothes.
   * Floating names turned the execution ground into a debug roster. */
  scene.add(sq.group);
  const entry = {
    key: spec.key, name: spec.name, sq,
    home: { x: spec.x, z: spec.z },
    /** Where he walks to next, or null. Used on the trail and in the yard. */
    stepTo: null,
    /** Fraction of the trail he keeps ahead of (or behind) the player. */
    trailOffset: 0,
    /** Metres across the trail and this member's slight pace variation. */
    trailLateral: 0,
    trailSpeed: 3.2,
    poseT: 0,
    poseDuration: 0,
    /** Production cabin entry. Debug skips still use fillTheRoom(). */
    cabinProcession: null,
    placed: false,
  };
  members.push(entry);
  bindActorCollider(entry, 'member');
  memberByKey.set(spec.key, entry);
}

const boosk = memberByKey.get('BOOSKIBRO').sq;
const lou = memberByKey.get('LOU').sq;

/* Booskibro's staff stays in the quiet hand. The other hand visibly draws the
 * execution revolver, so the two props never share a socket or cross his
 * torso when the free arm gestures. */
const founderStaff = buildFounderStaff();
mountFounderStaff(boosk, founderStaff);
poseFounderStaffGrip(boosk);

/**
 * Five bodies in the line beside the player.
 *
 * Four of them are `PROSPECT_XS`, which `cabin/site.js` copies. KITTENBOSS is
 * `KITTENBOSS_SLOT`, a separate number, so the copied array stays four long
 * and the assertion that keeps the two files honest keeps working. She is
 * standing in front of the open boot of the car she was driven out here in.
 */
const prospects = [];
const prospectByName = new Map();
for (const slot of LINE_UP) {
  if (slot.player) continue;
  const sq = makeInitiationCeremonyFigure(slot.name, { face: slot.face ?? null });
  sq.group.position.set(slot.x, 0, LINE_Z);
  sq.heading = headingToward({ x: slot.x, z: LINE_Z }, { x: boosk.position.x, z: boosk.position.z });
  sq.group.rotation.y = sq.heading;
  sq.walkT = Math.random() * 10;
  sq.breatheT = Math.random() * 10;
  const plate = makeNameplate(slot.name, slot.name === 'KITTENBOSS' ? '#e5b7d8' : '#8a92ab');
  plate.name = `prospect.nameplate.${slot.name.toLowerCase().replaceAll(' ', '-')}`;
  plate.scale.set(1.18, 0.22, 1);
  plate.position.y = sq.model.height + 0.18;
  plate.material.opacity = 0.68;
  sq.group.add(plate);
  scene.add(sq.group);
  const entry = {
    name: slot.name, sq,
    home: { x: slot.x, z: LINE_Z },
    stepTo: null,
    dead: false,
    /** >= 0 while going down. Kneeling bodies fold forward; the first one topples. */
    fallT: -1,
    fallMark: null,
    standingFall: false,
    kneelMark: null,
    jerkT: 0,
  };
  prospects.push(entry);
  bindActorCollider(entry, 'prospect');
  prospectByName.set(slot.name, entry);
}

// Your glowing slot in the line
const spotMark = new THREE.Group();
{
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x9a6ff0, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
  });
  ringMat.color.multiplyScalar(2.2);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.1, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  spotMark.add(ring);
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x9a6ff0, transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  spotMark.add(disc);
  spotMark.position.set(PLAYER_SLOT.x, 0, PLAYER_SLOT.z);
  scene.add(spotMark);
}

/* Lou's chair, and Lou in it, from the moment the room exists. He is the only
 * person in the cabin who is sitting down and he does not get up until IN-370.
 * The seat is `LOU_SEAT` and its cushion is the room's own; a seated pose
 * dropped onto a guessed base height is how two characters ended up inside the
 * furniture at the Bing. */
let louSeated = false;

// ---------- The execution revolver ----------
/**
 * One shared catalog revolver. The presentation Adapter owns its hand mount,
 * muzzle and deterministic 2/3/3 barrage; this director owns only story timing
 * and victim reactions.
 */
const gun = buildInitiationExecutionRevolver();
gun.visible = false;
const barrageClock = new InitiationBarrageClock();
const muzzleLight = new THREE.PointLight(0xffc86a, 0, 0, 2);
scene.add(muzzleLight);

/* A gun can only come from somewhere. These are visible from scene start and
 * disappear exactly when the corresponding in-hand model clears the hip. */
const executionHolsters = new Map();
for (const key of ['BOOSKIBRO', 'GRATIN', 'SEFF']) {
  const holder = memberByKey.get(key);
  const receipt = buildExecutionHolster(holder?.sq, {
    name: `initiation.${key.toLowerCase()}.execution-sidearm`,
  });
  if (receipt) executionHolsters.set(key, receipt);
}

/** Whose hand the revolver is in right now, by script speaker key. */
let gunHolder = null;
function handPistolTo(key) {
  const holder = memberByKey.get(key);
  if (!holder) return;
  if (gunHolder && gunHolder !== key) {
    setExecutionSidearmDrawn(executionHolsters.get(gunHolder), gun, false);
  }
  gun.parent?.remove(gun);
  mountInitiationExecutionRevolver(holder.sq, gun);
  setExecutionSidearmDrawn(executionHolsters.get(key), gun, false);
  gunHolder = key;
}
function holsterPistol() {
  const holderKey = gunHolder;
  if (holderKey) setExecutionSidearmDrawn(executionHolsters.get(holderKey), gun, false);
  gun.parent?.remove(gun);
  barrageClock.reset();
  if (gun.userData.initiationFlash) gun.userData.initiationFlash.visible = false;
  if (gunHolder) {
    const holder = memberByKey.get(gunHolder);
    if (holder) holder.sq.armR.rotation.x = 0;
  }
  gunHolder = null;
}

/** Arm pitch for a frontal, standing shot. NEGATIVE — the arm goes forward. */
const AIM_PITCH_FRONTAL = -1.42;
/** Arm pitch for a muzzle at the back of a kneeling head. Angled down. */
const AIM_PITCH_NAPE = -1.05;

const props = site.props ?? {};

// ---------- The ceremony props ----------
resolveGear([INITIATION_CARD_SLOT])
  .then((gear) => {
    const card = gear.get(INITIATION_CARD_SLOT);
    if (card?.texture) props.card?.setTexture?.(card.texture);
  })
  .catch((error) => console.error('[initiation] saint card art could not load', error));

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const hudEl = $('hud');
const objectiveEl = $('objective');
const objectives = createObjectivePanel();
const painFlashEl = $('painFlash');
const fadeEl = $('fade');
const dialogEl = $('dialog');
const speakerEl = $('speaker');
const lineEl = $('line');
const muteBtn = $('muteBtn');
const failEl = $('fail');
const failTitleEl = failEl.querySelector('.title');
const failReasonEl = $('failReason');
const quizEl = $('quiz');
const quizQEl = $('quizQ');
const quizHintEl = $('quizHint');
const quizButtons = [...quizEl.querySelectorAll('.quiz-opt')];

/* There is no gauntlet on this site, so there is no health bar and no ROAR.
 * The elements are in initiation.html, which this pass does not own; they are
 * simply never shown. Leaving a live ROAR button on a touch device that does
 * nothing is worse than hiding it. */
$('hpWrap').classList.remove('show');
const roarBtn = $('roarBtn');
if (roarBtn) roarBtn.style.display = 'none';

/* THE SHARED PANEL, like every other scene.
 *
 * This wrote raw HTML into a bespoke `#objective` div of its own -- the
 * pattern the owner named directly: "we keep reinventing and using different
 * systems instead of using what we already have". `core/objective-panel.js`
 * is the upper-left panel the mansion uses, it adopts an existing
 * `#objectives` element if the page has one, and `setLine` is documented as
 * "the common case: one standing order, optionally with a direction" -- which
 * is exactly the shape of every objective in this scene.
 *
 * The keys go in the hint rather than in the label, because the panel sets
 * textContent and the old strings carried `<span class="key">` markup that
 * would have printed as tags. See `phases.js`.
 *
 * `#objective` stays in initiation.html and stays fed, because the pause
 * menu reads it back for "what were you doing" and the scene's own fail card
 * sits beside it. */
function setObjective(label, keys = '') {
  const text = String(label ?? '');
  objectiveEl.textContent = text;
  if (text) objectives.setLine(text, { title: 'Initiation Night', hint: keys });
  else objectives.clear();
}

/** A phase's objective and its keys, in one call. */
function setPhaseObjective(spec) {
  setObjective(spec?.objective ?? '', spec?.keys ?? '');
}

/* NO BANNERS. The shipped scene threw "THE GAUNTLET", "YOU ENDURED" and
 * "TIMBER!" across the frame; a card reading anything at all over four people
 * being shot on their knees is the scene talking over its own cast. `#banner`
 * stays in initiation.html, unused. */

/* NO FLOATING POPUPS. There was one caller left, and it threw the word
 * EXECUTED over a man being shot in the back of the head on his knees --
 * a damage number, from the gauntlet build this scene replaced. It is the
 * same fault the banners were removed for and the note two comments up says
 * so: a card reading anything at all over four people being shot is the
 * scene talking over its own cast. The helper goes with its last caller. */

/* ------------------------------------------------------------------
 * DIALOGUE
 *
 * Every spoken line in this scene is POSITIONAL and GLUED TO ITS SPEAKER.
 * `speak()` from src/core/dialogue.js plays it with `follow` pointed at the
 * speaker's rig and with `SPEECH_MIX`'s gentler 0.7 rolloff, because the
 * engine's 1.4 default is right for a bottle breaking and wrong for a man
 * talking across a clearing — at the far kneel mark a line at 1.4 is
 * inaudible, and on the trail a line without `follow` stays in the mud thirty
 * metres back.
 *
 * Those numbers used to live here, as this scene's own `DIALOGUE_MIX`, and
 * were the only researched positional mix for speech in the game. They are now
 * the shared one, so the heist and the Special Meeting get them too.
 * ------------------------------------------------------------------ */

/** Whose rig a line comes out of. The player is the camera and has none. */
function bodyFor(line) {
  const who = line?.who;
  if (!who || who === 'PROSPECT' || who === 'PROSPECT TWO') return null;
  const member = [...memberByKey.values()].find((entry) => entry.name === who);
  if (member) return member.sq.group;
  const prospect = prospectByName.get(who);
  if (prospect) return prospect.sq.group;
  return null;
}

let blockedVoiceCue = null;
let sayQueue = [];
let sayDone = null;
let sayOnLast = null;
let sayAutoT = 0;
const dialogActive = () => sayQueue.length > 0;

/**
 * Play one line where its speaker is standing, and report its length.
 *
 * Through the shared path in src/core/dialogue.js, which is where this
 * scene's own `DIALOGUE_MIX` ended up: those numbers were the researched ones
 * and are now `SPEECH_MIX`, used by every scene rather than by this one. The
 * 0.95 that used to be here is gone with them -- dialogue level is a property
 * of the voice bus now, not of whichever scene is on screen.
 *
 * A line with no body on it is the Prospect's own, so it plays from the
 * player: he has no rig to follow and putting his voice anywhere else in the
 * clearing is worse than putting it on the camera.
 */
/**
 * A man goes down, and the mud keeps it.
 *
 * The scene used to call `game/src/effects.js`'s `bloodSplat`, which drops
 * three or four flat circles at random offsets AND FADES THEM OUT AFTER
 * TWENTY SECONDS. By the time the player has walked the trail to the cabin
 * the clearing was clean, which quietly un-does the whole point of the walk:
 * he is supposed to arrive with it still behind him.
 *
 * `src/world/blood.js` is the stack the siege and the Palace already use. The
 * pool GROWS, and it stays. The seed is the victim's index rather than a
 * roll, so the four marks are the same four marks every playthrough and the
 * geometry gate's recorded buckets do not move underneath it.
 */
function bleedOut(point, seed) {
  deathPools.spill(point, {
    floorY: 0,
    size: 1.05,
    opacity: 0.9,
    seed,
  });
}

function speakLine(line) {
  if (!line?.cue) return 0;
  if (!audioReady || !audio.hasSample?.(line.cue)) {
    blockedVoiceCue = line.cue;
    if (!missingVoiceCues.includes(line.cue)) missingVoiceCues.push(line.cue);
    console.error(`[initiation] refusing to consume unloaded voice cue ${line.cue}`);
    return null;
  }
  blockedVoiceCue = null;
  /* SILENCE THE MAN BEFORE HIM.
   *
   * `sayAutoT` below is only the AUTO advance. A player can press on at any
   * point in a line, and every press calls straight back in here, so the
   * ceremony used to stack: measured on a real run of the speech, one
   * Booskibro take was still sounding while three more of his own lines and
   * one of Lou's started on top of it — 2.22 s, 1.43 s, 0.81 s and 0.21 s of
   * two voices at once. Mashing through a long speech is the first thing
   * anybody does, so it is the first thing anybody would have heard.
   *
   * `src/initiation/audio.js` has always done this for its own path and its
   * comment says why — "advancing the ceremony silences the prior actor" —
   * but the ceremony's lines go through the SHARED engine, and nothing was
   * telling that one. `stopSpeech()` cuts live speech only, and puts the
   * music and ambience beds back, so a skip does not leave the room ducked. */
  audio.stopSpeech?.();
  const body = bodyFor(line);
  const spoken = speak(audio, line.cue, {
    speaker: body ?? (() => player.position),
    mix: SPEECH_MIX,
  });
  return spoken.seconds;
}

function showCurrentLine() {
  const line = sayQueue[0];
  if (sayQueue.length === 1 && sayOnLast) {
    /* ON the last line, not after it. Prospect Three is cut off mid-word and
     * must be: he does not finish the sentence and he does not get a last
     * look. Fired before the line is spoken so the aim runs under it. */
    const hook = sayOnLast;
    sayOnLast = null;
    hook();
  }
  speakerEl.textContent = line.who;
  lineEl.textContent = line.text;
  const voiced = speakLine(line);
  if (voiced === null) {
    sayAutoT = Infinity;
    setObjective(`VOICE AUDIO NOT READY: ${line.cue}`);
    return;
  }
  const recordedTiming = currentPhase().dialogueTiming === 'recorded' && voiced > 0;
  sayAutoT = recordedTiming
    ? voiced + 0.35
    : Math.max(2.6 + line.text.length * 0.028, voiced > 0 ? voiced + 0.35 : 0);
  if (['IN-450', 'IN-460', 'IN-500', 'IN-510'].includes(line.beat)) {
    startCeremonySalute(line.speakerKey, Math.min(1.65, Math.max(1.05, sayAutoT)));
  }
  if (line.gesture === 'slam') {
    /* `gesture` is `dialogue.js`'s and only Booskibro and Lou carry one. It
     * used to play BOOSKIBRO's animation for any speaker who was not Lou,
     * which would have had Gratin swinging a staff over a kneeling man; the
     * lookup is by speaker now and an unknown speaker gets nothing. */
    const owner = line.who === 'BIG UNCLE LOU SPUTTHOLE' ? lou
      : line.who === 'BOOSKIBRO' ? boosk : null;
    if (owner) {
      owner.startSmash();
      sfx.stomp();
      shake = Math.max(shake, 0.2);
    }
  }
}

function say(lines, done = null, onLast = null) {
  sayQueue = (lines ?? []).filter((line) => line && line.cue);
  sayDone = done;
  sayOnLast = onLast;
  if (sayQueue.length === 0) {
    sayOnLast = null;
    if (onLast) onLast();
    if (done) done();
    return;
  }
  dialogEl.classList.add('show');
  showCurrentLine();
}

/**
 * Empty the queue and fire its continuation NOW.
 *
 * The queue watchdog. Every `advance: 'event'` phase in `phases.js` carries a
 * timeout and this is what that timeout does: a beat that shows a blank
 * objective is only legal while something else is moving, and a dialogue queue
 * that never drains — a missing recording, a lost callback — is the armoury
 * bug with subtitles on it.
 */
function drainSay() {
  if (!dialogActive()) return;
  sayQueue = [];
  const hook = sayOnLast;
  sayOnLast = null;
  if (hook) hook();
  dialogEl.classList.remove('show');
  const done = sayDone;
  sayDone = null;
  if (done) done();
}

function advanceSay() {
  if (blockedVoiceCue) return;
  if (!dialogActive()) return;
  sayQueue.shift();
  if (sayQueue.length === 0) {
    dialogEl.classList.remove('show');
    const done = sayDone;
    sayDone = null;
    if (done) done();
  } else {
    showCurrentLine();
  }
}

/** Say a whole scripted beat, then continue. Stage directions are not lines. */
function sayBeat(id, done = null, onLast = null) {
  const beat = beatById(id);
  say(beat ? beat.lines : [], done, onLast);
}

/* ------------------------------------------------------------------
 * CHOICES
 *
 * `#quiz` in initiation.html has exactly three buttons and this pass does not
 * own the HTML, so every choice in this scene shows at most three options and
 * every hub offers silence as one of them. See `script.js`.
 * ------------------------------------------------------------------ */
let openChoice = null;
/** Seconds the current choice has been on screen. Its own clock, not the phase's. */
let choiceT = 0;

function showChoice({ prompt, options, hint, onPick, releasePointerLock = true }) {
  openChoice = { options, onPick };
  choiceT = 0;
  quizQEl.textContent = prompt;
  if (quizHintEl) quizHintEl.textContent = hint ?? '';
  quizButtons.forEach((btn, i) => {
    const option = options[i];
    btn.hidden = !option;
    btn.style.display = option ? '' : 'none';
    if (!option) return;
    btn.innerHTML = `<span class="num">${i + 1}.</span>`;
    btn.appendChild(document.createTextNode(option.text));
    /* Only the founders quiz has a right answer; every other choice in this
     * scene is a thing he says, not a thing he gets wrong. */
    btn.dataset.correct = option.correct ? '1' : '0';
  });
  quizEl.classList.add('show');
  if (releasePointerLock) input?.releasePointerLock();
}

function hideChoice() {
  quizEl.classList.remove('show');
  openChoice = null;
  for (const btn of quizButtons) {
    btn.hidden = false;
    btn.style.display = '';
  }
}

/**
 * Any full-screen card containing buttons owns the pointer.
 *
 * Keeping pointer lock while presenting completion made the buttons look live
 * but converted every mouse movement into camera delta, so the pointer could
 * never reach them. The same rule protects both failure cards as well.
 */
function showBlockingOverlay(element) {
  input?.suspend();
  element.classList.remove('hidden');
}

function pickChoice(index) {
  if (!openChoice) return;
  const option = openChoice.options[index];
  if (!option) return;
  const { onPick } = openChoice;
  hideChoice();
  onPick(option);
  if (currentPhase().control !== CONTROL_MODES.CUTSCENE) {
    input?.requestPointerLock();
  }
}

for (const btn of quizButtons) {
  btn.addEventListener('click', () => pickChoice(Number(btn.dataset.i)));
}

/* ------------------------------------------------------------------
 * STATE
 * ------------------------------------------------------------------ */
let phase = 'approach';
let phaseT = 0;
let shake = 0;
let fovPunch = 0;
let painT = 0;
let crackleT = 0;
let inductionK = 0;
let inducted = false;
let playerFallT = -1;
let exec = null;
let failFrom = 'question';
/**
 * The act, as a list, walked with a cursor.
 *
 * The ORDER lives in `executions.js`: everybody kneels together, four doomed
 * prospects are shot, Tony is threatened, Lou interrupts and Tony alone is
 * released. Carrying those rules here would let runtime and data drift.
 */
const RUN_ORDER = executionRunOrder();
let runCursor = 0;
/** The step being played, for the camera and for the arrival that fires it. */
let currentStep = null;
/** Beats already fired on the trail. */
const firedTrailBeats = new Set();
let trailChoiceUsed = false;
let trailChoiceResolved = false;
/** The player's one-button input for the ritual beats. */
let ritualPressed = false;

/**
 * The saint card, and what is happening to it. src/initiation/cabin/card-burn.js
 * owns the rules; this file owns what you can see of them.
 */
const cardBurn = new CardBurn();
/** The flame on the corner of the card, made the first time it is needed. */
/** The cut, on the palm it was made in rather than on the floorboards. */
let palmBlood = null;
/** Throttle on the ember tick, so a burning card is not a machine gun. */
let emberT = 0;
/** How far up the trail he is, 0..1. */
let trailK = 0;
/** The room eruption advances on its delivered-VO schedule, never wall time. */
let roomAcknowledgementsComplete = false;
let roomReactionHold = 0;
let roomReaction = null;
/** Physical state of the one ceremonial glass: table → hand → drinking → spent. */
let ceremonialShotState = 'table';

function currentPhase() {
  return PHASES[phase] ?? PHASES.approach;
}

function applyPhaseControl(spec = currentPhase()) {
  const pose = spec.playerPose === ADAPTER_PLAYER_POSES.KNEELING
    ? ADAPTER_PLAYER_POSES.KNEELING
    : ADAPTER_PLAYER_POSES.STANDING;
  playerController.setControl(spec.control, { pose });
  playerController.setMovementPolicy({
    moveScale: spec.moveScale,
    allowSprint: spec.allowSprint,
  });

  const authoredCamera = spec.control === CONTROL_MODES.CUTSCENE;
  if (authoredCamera) playerController.syncFigure(playerFigure);
  const showFirstPersonHands = FIRST_PERSON_RITUAL_PHASES.has(spec.id);
  if (showFirstPersonHands && !playerFigure.group.visible) {
    prepareFirstPersonRitualFigure(playerFigure);
  }
  if (showFirstPersonHands) poseFirstPersonRitualHands(playerFigure, spec.id, phaseT);
  playerFigure.group.visible = showFirstPersonHands;
  input?.refresh('phase-control');
}

function setPhase(next) {
  if (!PHASES[next]) {
    /* An unknown phase name is the bug this table exists to make impossible.
     * Fail loudly rather than falling through to a victory orbit. */
    console.error(`[initiation] no such phase "${next}"`);
    return;
  }
  phase = next;
  phaseT = 0;
  setPhaseObjective(PHASES[next]);
  applyPhaseControl(PHASES[next]);
}

const canMove = () => currentPhase().control === CONTROL_MODES.PLAYABLE && playerFallT < 0;

applyPhaseControl();

/* ------------------------------------------------------------------
 * INPUT
 * ------------------------------------------------------------------ */

/** The one action button. Advances dialogue, and is the ritual's only input. */
function actionPress() {
  if (dialogActive()) { advanceSay(); return; }
  ritualPressed = true;
}

function actionRelease() {
  holdHeld = false;
}
let holdHeld = false;
let paused = false;
input = createFirstPersonInput({
  player: playerController,
  canvas: renderer.domElement,
  playerKeyCodes: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
  canEnable: () => !paused,
  canHandleInput: () => !paused,
  controlState: () => {
    const authoredCamera = currentPhase().control === CONTROL_MODES.CUTSCENE;
    return {
      playerEnabled: !authoredCamera && !openChoice,
      movementEnabled: canMove() && !openChoice,
      defaultLookEnabled: !authoredCamera && !openChoice,
      interactionEnabled: false,
    };
  },
  routes: {
    keyDown(event, controls) {
      if (controls.code === 'Space' && !canMove()) {
        event.preventDefault();
        if (!event.repeat) actionPress();
        holdHeld = true;
        return true;
      }
      if (event.code === 'KeyM' && !event.repeat) {
        toggleMute();
        return true;
      }
      if (openChoice && /^Digit[123]$/.test(event.code)) {
        pickChoice(Number(event.code.slice(-1)) - 1);
        return true;
      }
      return false;
    },
    // Released on the translated code keyDown pressed on, or a rebound hold
    // stays down through the whole ceremony.
    keyUp(_event, controls) {
      if (controls.code === 'Space') actionRelease();
      return false;
    },
    mouseDown(event, controls) {
      if (event.button !== 0) return true;
      if (!controls.locked) return false;
      if (!canMove()) {
        actionPress();
        holdHeld = true;
      }
      return true;
    },
    mouseUp(event) {
      if (event.button !== 0) return false;
      actionRelease();
      return true;
    },
  },
  onClear: () => { holdHeld = false; },
});

createPauseMenu({
  title: 'The Initiation',
  canPause: () => phase !== 'complete' && phase !== 'failed' && phase !== 'failed_oath',
  getObjective: () => objectiveEl.textContent || 'Follow the lights.',
  instructions: [
    'W A S D or arrows — move. Shift — hurry.',
    'Space or Click — continue, and the one button the ceremony asks for.',
    'When you are asked something: 1, 2 or 3 — answer.',
    'M — mute. Tab — pause or resume.',
  ],
  onPause: () => {
    paused = true;
    input.suspend();
    holdHeld = false;
    sfx.suspend();
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    paused = false;
    sfx.resume();
    input.resume({
      requestPointerLock: currentPhase().control !== CONTROL_MODES.CUTSCENE && !openChoice,
    });
    audio.ctx?.resume?.();
  },
  /* RESTART CHECKPOINT AND RESTART SCENE, like every other campaign scene.
   *
   * Sixteen of the eighteen scene pages carried this; the two that did not
   * were the combat lab, which is a test harness and not a campaign scene,
   * and this one -- held out by an explicit exception reading "Initiation
   * gameplay is frozen pending the human playtest".
   *
   * So a player who got stuck, or who simply wanted to answer the questions
   * again, had a pause menu and no way out of the night but the browser's
   * back button. In the one scene where the wrong answer is an ending. */
  recovery: createCampaignSceneRecovery({
    campaign,
    sceneId: SCENE_IDS.INITIATION,
    location,
  }),
});

muteBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });
let muted = false;
function toggleMute() {
  muted = !muted;
  sfx.setMuted(muted);
  audio.setMasterVolume?.(muted ? 0 : 1);
  muteBtn.textContent = muted ? '🔇' : '🔊';
}

// Touch controls (joystick + the single action button)
const touch = { active: false, x: 0, y: 0 };
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  document.body.classList.add('touch');
  const zone = $('stickZone');
  const base = $('stickBase');
  const knob = $('stickKnob');
  let stickId = null;
  let origin = { x: 0, y: 0 };
  const RANGE = 48;

  zone.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    base.style.left = `${e.clientX}px`;
    base.style.top = `${e.clientY}px`;
    base.style.display = 'block';
    touch.active = true;
    touch.x = 0;
    touch.y = 0;
    zone.setPointerCapture(e.pointerId);
    playerController.setTouchActive(true);
    playerController.setTouchVector(0, 0);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - origin.x;
    let dy = e.clientY - origin.y;
    const len = Math.hypot(dx, dy);
    if (len > RANGE) { dx *= RANGE / len; dy *= RANGE / len; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    touch.x = dx / RANGE;
    touch.y = dy / RANGE;
    playerController.setTouchVector(touch.x, touch.y, {
      sprint: Math.hypot(touch.x, touch.y) > 0.92,
    });
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    touch.active = false;
    touch.x = 0;
    touch.y = 0;
    base.style.display = 'none';
    playerController.setTouchVector(0, 0);
    knob.style.transform = 'translate(-50%, -50%)';
  };
  zone.addEventListener('pointerup', endStick);
  zone.addEventListener('pointercancel', endStick);

  const smashBtn = $('smashBtn');
  /* One button, and mostly it means "go on". When the ceremony wants a hold
   * the objective bar says HOLD; the button never contradicts it. */
  smashBtn.textContent = '▸';
  smashBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    playerController.setTouchActive(true);
    if (canMove()) playerController.setTouchButton('Space', true);
    else { actionPress(); holdHeld = true; }
  });
  smashBtn.addEventListener('pointerup', (e) => {
    e.preventDefault();
    playerController.setTouchButton('Space', false);
    actionRelease();
  });
}


// ---------- Buttons / flow ----------
$('retryBtn').addEventListener('click', retry);

/* Browsers only allow audio after a real input on this page. Both engines are
 * armed together: the legacy synthesiser for the scene's own noises, and the
 * shared AudioEngine for every recorded line, every footstep and every shot —
 * the second is the one that can be positional at all. */
let audioArmed = false;
let audioReady = false;
let audioReadyPromise = null;
let audioLoadError = null;
const missingVoiceCues = [];
function ensureAudio() {
  if (audioReadyPromise) return audioReadyPromise;
  audioArmed = true;
  sfx.init();
  bindAudioVolume(sfx);
  bindAudioVolume({ setUserVolume: (value) => audio.setMasterVolume?.(value) });
  audioReadyPromise = (async () => {
    await audio.init();
    await audio.loadManifest({
      names: [...ACTIVE_INITIATION_VOICE_CUES, ...weaponCueNames()],
      prefixes: ['footstep.', 'car.', 'door.'],
    });
    missingVoiceCues.splice(0, missingVoiceCues.length,
      ...ACTIVE_INITIATION_VOICE_CUES.filter((cue) => !audio.hasSample?.(cue)));
    audioReady = missingVoiceCues.length === 0;
    if (!audioReady) {
      audioLoadError = new Error(`${missingVoiceCues.length} active Initiation voice cues did not decode`);
      console.error('[initiation] active voice bank incomplete', missingVoiceCues);
      return false;
    }
    site.ambience.start();
    return true;
  })().catch((error) => {
    audioReady = false;
    audioLoadError = error;
    console.error('[initiation] audio could not start', error);
    return false;
  });
  return audioReadyPromise;
}
const armAudio = () => { void ensureAudio(); };
window.addEventListener('keydown', armAudio, { once: true });
window.addEventListener('pointerdown', armAudio, { once: true });

hudEl.classList.add('visible');
setPhaseObjective(PHASES.approach);
setTimeout(() => { fadeEl.style.opacity = 0; }, 120);

/* ------------------------------------------------------------------
 * THE FOUNDERS QUIZ, unchanged
 * ------------------------------------------------------------------ */
function showQuiz() {
  const opts = [...QUIZ_OPTIONS].sort(() => Math.random() - 0.5);
  showChoice({
    prompt: 'Who are the FIVE founding members of the Silver Sasquatches?',
    hint: 'Choose carefully. You saw what happened.',
    options: opts.map((option) => ({ text: option.text, correct: option.correct, option })),
    onPick: (choice) => answerQuiz(choice.option),
  });
}

function answerQuiz(selected) {
  setPhase('q2_result');
  say([selected], () => {
    if (selected.correct) {
      /* TWO of the three shipped `correct` lines. The third handed off to the
       * gauntlet — "Now we test the BODY. Clear the line — THE GAUNTLET
       * AWAITS" — and IN-100 replaces it with three words at a normal volume.
       * It stays in `dialogue.js` until the recording handoff is merged; see
       * RETIRED_CEREMONY_LINES. */
      setPhase('q2_correct');
      say(CORRECT_LINES.slice(0, 2), () => {
        runCursor = 0;
        setPhase('conspiracy_reveal');
        sayBeat('IN-100', advanceRun);
      });
    } else {
      say(WRONG_LINES, () => {
        setPhase('exec_player');
        startExecution({
          getPos: () => player.position,
          y: 1.5,
          shooter: 'SEFF',
          rounds: 8,
          onHit: () => { painT = 1; shake = Math.max(shake, 0.4); },
          onDead: () => {
            playerFallT = 0;
            failFrom = 'question';
            failTitleEl.textContent = 'INITIATION FAILED';
            failReasonEl.innerHTML =
              'Wrong founders.<br>The Circle now knows two things about you: your name, and where you’re buried.';
          },
          onFinished: () => {
            setPhase('failed');
            showBlockingOverlay(failEl);
          },
        });
      });
    }
  });
}

/* ------------------------------------------------------------------
 * EXECUTIONS — ONE PATH
 *
 * `target` is:
 *   { getPos(), y, onHit(), onDead(), onFinished(),
 *     shooter?: script speaker key — pinned, not "whoever is nearest",
 *     stance?:  { x, z, heading } — where he stands and which way he faces,
 *     rounds?:  how many, default eight,
 *     nape?:    true for the down-angled muzzle at the back of a head }
 *
 * Prospect One goes through it standing with eight rounds. The sweep uses
 * the same mechanism for each single kneeling shot and Tony's non-firing aim.
 * ------------------------------------------------------------------ */
function startExecution(target) {
  const tp = target.getPos();
  let shooter = target.shooter ? memberByKey.get(target.shooter) : null;
  if (!shooter) {
    let best = Infinity;
    for (const m of members) {
      const d = Math.hypot(m.sq.position.x - tp.x, m.sq.position.z - tp.z);
      if (d < best) { best = d; shooter = m; }
    }
  }
  if (gunHolder !== shooter.key) handPistolTo(shooter.key);
  /* He is doing this now, not walking somewhere else. A live `stepTo` left on
   * the shooter is a man who strolls back to the line mid-aim. */
  shooter.stepTo = null;
  exec = {
    m: shooter,
    target,
    rounds: target.rounds ?? 8,
    stance: target.stance ?? null,
    nape: target.nape === true,
    stay: target.stay === true,
    holdFire: target.holdFire === true,
    barrage: (target.rounds ?? 8) === INITIATION_BARRAGE_SHOTS.length && target.nape !== true,
    aimed: false,
    state: 'walk',
    t: 0, shots: 0, next: 0, aim: 0, recoil: 0,
  };
  barrageClock.reset();
}

const _impact = new THREE.Vector3();

/**
 * One round.
 *
 * THROUGH `playWeaponCue`, POSITIONAL. A revolver fired outdoors at night behind
 * a kneeling man is the loudest thing in this scene, and a raw `audio.play`
 * with a bare cue name skips the catalog's per-weapon mix and the gunshot
 * falloff — which is exactly how the palace's guards ended up inaudible past
 * eighteen metres in an open compound.
 */
function fireShotAt(tp, y, shotIndex = 0) {
  const muzzle = initiationRevolverMuzzleWorld(gun, _impact);
  if (!muzzle) return;
  playWeaponCue(audio, 'revolver', 'fire', {
    volume: 1, position: { x: _impact.x, y: _impact.y, z: _impact.z },
  });
  fireInitiationExecutionRevolver(gun, shotIndex);
  muzzleLight.position.copy(_impact);
  muzzleLight.intensity = 150;
  /* The mist off the shot, thrown along the round rather than puffed in
   * place. `debris.puff` -- from the legacy tree -- dropped five dark-red
   * sprites at the target and let them hang; `BloodSpurtSystem` launches
   * droplets away from the muzzle, on the line the bullet took, and they
   * fall. `onLand` is what puts a mark where each one comes down, so the
   * mud ends up telling the same story the pool does. */
  _spray.set(tp.x - _impact.x, 0, tp.z - _impact.z);
  if (_spray.lengthSq() < 1e-6) _spray.set(0, 0, 1);
  spurts.burst({ x: tp.x, y, z: tp.z }, _spray.normalize(), {
    count: 7,
    speed: 3.1,
    floorY: 0,
  });
  shake = Math.max(shake, 0.3);
}

function fireExecutionRound(tp, target, shotIndex = exec?.shots ?? 0) {
  if (!exec || exec.state !== 'fire') return;
  exec.shots++;
  exec.recoil = 0.12;
  fireShotAt(tp, target.y, shotIndex);
  target.onHit?.();
  if (exec.shots >= exec.rounds) {
    exec.state = 'done';
    exec.t = 0;
    target.onDead?.();
  }
}

function updateExecution(dt) {
  if (!exec) return;
  const m = exec.m;
  const t = exec.target;
  const tp = t.getPos();
  const aimPitch = exec.nape ? AIM_PITCH_NAPE : AIM_PITCH_FRONTAL;

  if (exec.state === 'walk') {
    const goal = exec.stance ?? tp;
    const arrive = exec.stance ? 0.18 : 2.2;
    const dx = goal.x - m.sq.position.x;
    const dz = goal.z - m.sq.position.z;
    const d = Math.hypot(dx, dz);
    if (d > arrive) {
      _dir.set(dx / d, 0, dz / d);
      m.sq.update(dt, _dir, Math.min(2.6, d * 3));
    } else {
      /* He arrives with the gun still on his hip. The visible draw owns its
       * own state; mounting the model at start only prepares the hidden copy
       * and never makes it pop into his hand while he is walking. */
      exec.state = 'draw';
      exec.t = 0;
      if (exec.stance) {
        m.sq.group.position.set(exec.stance.x, 0, exec.stance.z);
        faceAt(m.sq, tp);
      }
    }
  } else if (exec.state === 'draw') {
    faceAt(m.sq, tp);
    m.sq.update(dt, _zero, 0);
    faceAt(m.sq, tp);
    exec.t += dt;
    poseExecutionDraw(
      m.sq,
      executionHolsters.get(m.key),
      gun,
      exec.t / 0.82,
      aimPitch,
    );
    if (exec.t >= 0.82) {
      exec.state = 'aim';
      exec.t = 0;
      exec.aim = 1;
    }
  } else if (exec.state === 'aim' || exec.state === 'fire') {
    /* SNAPPED, not chased. A stored target yaw that `update()` chases every
     * frame is the mechanism that pinned a character forever at the Bing; here
     * the heading is written once per frame from where the head actually is,
     * and nothing is left behind to drag it back. */
    faceAt(m.sq, tp);
    m.sq.update(dt, _zero, 0);
    faceAt(m.sq, tp);
    exec.aim = Math.min(1, exec.aim + dt * 3);
    exec.t += dt;
    if (exec.holdFire && exec.aim >= 1) {
      m.sq.armR.rotation.x = aimPitch;
      if (!exec.aimed) {
        exec.aimed = true;
        t.onAim?.();
      }
      return;
    } else if (exec.state === 'aim' && exec.t > (exec.nape ? 1.1 : 0.8)) {
      exec.state = 'fire';
      if (exec.barrage) barrageClock.start();
      else exec.next = exec.nape ? 0.55 : 0.3;
    }
    if (exec.state === 'fire') {
      if (exec.barrage) {
        for (const shot of barrageClock.update(dt)) {
          fireExecutionRound(tp, t, shot.index);
          if (!exec || exec.state !== 'fire') break;
        }
      } else {
        exec.next -= dt;
        if (exec.next <= 0 && exec.shots < exec.rounds) {
          exec.next = 0.34;
          fireExecutionRound(tp, t);
        }
      }
    }
    exec.recoil = Math.max(0, exec.recoil - dt * 1.2);
    m.sq.armR.rotation.x = aimPitch * exec.aim - exec.recoil * 1.6;
  } else if (exec.state === 'done') {
    m.sq.update(dt, _zero, 0);
    if (exec.stance) faceAt(m.sq, tp);
    exec.aim = Math.max(0, exec.aim - dt * 2);
    m.sq.armR.rotation.x = aimPitch * exec.aim;
    exec.t += dt;
    if (exec.t > (exec.nape ? 1.4 : 1.1)) {
      m.sq.armR.rotation.x = 0;
      if (exec.stay) {
        exec.state = 'return';
        if (t.onFinished) t.onFinished();
      } else {
        exec.state = 'holster';
        exec.t = 0;
      }
    }
  } else if (exec.state === 'holster') {
    m.sq.update(dt, _zero, 0);
    if (exec.stance) faceAt(m.sq, tp);
    exec.t += dt;
    poseExecutionHolster(
      m.sq,
      executionHolsters.get(m.key),
      gun,
      exec.t / 0.86,
      aimPitch,
    );
    if (exec.t >= 0.86) {
      exec.state = 'return';
      if (t.onFinished) t.onFinished();
    }
  } else if (exec.state === 'return') {
    /* During the sweep he does not go anywhere: there is another one coming
     * and he knows it. Only Prospect One's shooter walks back to the ring, and
     * that is the script — "Seff lowers the pistol, turns, and walks back to
     * his place. Nobody says anything." */
    if (exec.stay) { exec = null; return; }
    if (walkNpc(m.sq, m.home.x, m.home.z, dt, 2.4)) {
      faceAt(m.sq, LINE_CENTER);
      exec = null;
    }
  }
}

/** Prospect One. Standing, frontal, eight rounds, as shipped. */
function executeStanding(onFinished) {
  const p = prospectByName.get(STANDING_EXECUTION.victim);
  startExecution({
    getPos: () => p.sq.position,
    y: 1.5,
    shooter: STANDING_EXECUTION.shooter,
    stance: STANDING_EXECUTION.stance,
    rounds: STANDING_EXECUTION.rounds,
    onHit: () => { p.jerkT = 0.16; },
    onDead: () => {
      p.dead = true;
      p.fallT = 0;
      p.fallMark = {
        x: p.sq.position.x,
        z: p.sq.position.z,
        heading: p.sq.heading,
      };
      p.standingFall = true;
      bleedOut(p.sq.position, 0);
    },
    onFinished: () => {
      holsterPistol();
      onFinished();
    },
  });
}

/**
 * One of the four. On the knees, facing the line, shot from behind.
 *
 * The mark, the stance, the muzzle point and the fall all come from
 * `cabin/site.js`; nothing here is a number.
 */
function executeKneeling(step, onFinished) {
  const p = prospectByName.get(step.victim);
  const mark = markForStep(step);
  const second = memberByKey.get(step.second);
  if (second) second.stepTo = { x: mark.escort.x, z: mark.escort.z, face: mark };
  startExecution({
    getPos: () => mark.head,
    y: KNEEL_HEAD_Y,
    shooter: step.shooter,
    stance: mark.shooter,
    rounds: step.rounds,
    nape: true,
    stay: true,
    onHit: () => { p.jerkT = 0.1; },
    onDead: () => {
      p.dead = true;
      p.fallT = 0;
      p.fallMark = mark;
      p.standingFall = false;
      bleedOut({ x: mark.fall.x, y: 0, z: mark.fall.z }, runCursor + 1);
    },
    onFinished,
  });
}

/* ------------------------------------------------------------------
 * NPC HELPERS
 * ------------------------------------------------------------------ */
const _dir = new THREE.Vector3();
const _zero = new THREE.Vector3();

/** Walk an NPC toward (x, z); returns true once arrived. */
function walkNpc(sq, x, z, dt, speed = 3.4, arriveDist = 0.35) {
  const dx = x - sq.position.x;
  const dz = z - sq.position.z;
  const d = Math.hypot(dx, dz);
  if (d < arriveDist) {
    sq.update(dt, _zero, 0);
    return true;
  }
  _dir.set(dx / d, 0, dz / d);
  sq.update(dt, _dir, Math.min(speed, d * 4));
  return false;
}

/**
 * How far along the trail a point is, 0..1.
 *
 * `site.js` can sample a path at a fraction; this is the inverse, and the walk
 * needs it to know which beat to fire and where to put fifteen people.
 */
function trailProgress(point) {
  let travelled = 0;
  let best = { distance: Infinity, k: 0 };
  let total = 0;
  for (let i = 0; i < TRAIL.length - 1; i++) total += distance2D(TRAIL[i], TRAIL[i + 1]);
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const a = TRAIL[i];
    const b = TRAIL[i + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const lengthSquared = vx * vx + vz * vz;
    let t = lengthSquared > 0 ? ((point.x - a.x) * vx + (point.z - a.z) * vz) / lengthSquared : 0;
    t = Math.max(0, Math.min(1, t));
    const distance = Math.hypot(point.x - (a.x + vx * t), point.z - (a.z + vz * t));
    if (distance < best.distance) {
      best = { distance, k: (travelled + Math.sqrt(lengthSquared) * t) / total };
    }
    travelled += Math.sqrt(lengthSquared);
  }
  return best.k;
}

/* ------------------------------------------------------------------
 * CAMERA
 *
 * A TABLE, not an if/else chain ending in a bare `else`. That `else` meant
 * "complete", so any phase name nobody remembered to add got the slow victory
 * orbit — which, on the frame Kittenboss is shot, is a catastrophe nobody
 * would find until playtest. Every entry in `CAMERA_MODES` has a case here and
 * a test asserts it.
 *
 * AND EVERY ONE OF THEM IS ARITHMETIC THAT LIVES SOMEWHERE ELSE. The entries
 * below gather the live state a shot depends on — where the player is, which
 * mark is in use, how far through a move it is — and hand it to
 * `INITIATION_SHOTS` in src/initiation/framing.js, which does the geometry and
 * gives back a position and a look point.
 *
 * That indirection is the whole reason the beat framing gate can see this
 * scene at all. A shot written as a closure over live rig nodes inside this
 * file is unreadable from outside a running page, and act five of this scene
 * — the hand, the cut, the card, both oath lines and the burning — therefore
 * played OFF SCREEN for the entire life of the scene with nothing able to
 * notice. `tools/geometry-scenes.mjs` now publishes this shot list as
 * `metadata.framingBeats` off those same functions, so what the gate checks is
 * the camera the player looks through and not a description of it that goes
 * stale the first time somebody moves a shot. docs/FRAMING-GATE.md.
 * ------------------------------------------------------------------ */
let camYaw = 0;
let orbitA = 0;
const _camTarget = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _lookTarget = new THREE.Vector3(LINE_CENTER.x, 2.4, LINE_CENTER.z);
const _desiredLook = new THREE.Vector3();
const _facing = new THREE.Vector3();


/**
 * Take a shot's two points and put them where the rest of this file expects.
 *
 * `_desiredLook` is written rather than returned because `updateCamera` lerps
 * position and look point separately, and that has to stay true: the camera
 * flies rather than cuts.
 */
function place({ position, lookAt }) {
  _desiredLook.fromArray(lookAt);
  return _camTarget.fromArray(position);
}

const CAMERA_SHOTS = {
  follow(dt) {
    const diff = Math.atan2(Math.sin(playerFigure.heading - camYaw), Math.cos(playerFigure.heading - camYaw));
    camYaw += diff * Math.min(1, 3.2 * dt);
    _camForward.set(Math.sin(camYaw), 0, Math.cos(camYaw));
    return place(INITIATION_SHOTS.follow({
      player: player.position.toArray(), forward: _camForward.toArray(),
    }));
  },
  line() {
    /* Down the line from its west end, so the six of them read as a row and
     * the headlights are behind every one of them. */
    return place(INITIATION_SHOTS.line());
  },
  speech() {
    /* A slow creep in from off the west end. Clear of the west car, which is
     * parked at (-9.8, -12.8) with its lights on. */
    return place(INITIATION_SHOTS.speech({ k: Math.min(1, phaseT / 20) }));
  },
  stand_exec() {
    const p1 = prospectByName.get('PROSPECT ONE').sq.position;
    return place(INITIATION_SHOTS.stand_exec({ victim: p1.toArray() }));
  },
  q2() {
    playerFigure.facing(_facing);
    return place(INITIATION_SHOTS.q2({
      player: player.position.toArray(), facing: _facing.toArray(),
    }));
  },
  clearing() {
    /* Behind and above the line, looking out over the working ground. The
     * player is in frame, in the row, and never gets to look away. */
    return place(INITIATION_SHOTS.clearing());
  },
  kneel_exec() {
    /* Over the line's shoulder at the mark in use. The camera stands where the
     * player stands, a little to one side, because the whole point of the
     * staging is that he is watching it from inside the row. Everybody in the
     * Circle is south of z = -9.8, so nobody is between it and the mud. */
    const step = currentStep ?? KNEELING_EXECUTIONS[0];
    return place(INITIATION_SHOTS.kneel_exec({ mark: markForStep(step) }));
  },
  room() {
    return place(INITIATION_SHOTS.room());
  },
  oath() {
    return place(INITIATION_SHOTS.oath());
  },
  ritual() {
    /* Close and low on THE HAND, and the hand is a moving node on a rig.
     *
     * This shot used to be a pair of fixed points: the camera at the table's
     * west end, looking at `TABLE_SOCKETS.card` -- the spot on the tabletop
     * the card is picked UP from. The player stands at CEREMONY_CENTRE, 2.4 m
     * short of the table, which is not merely off to one side of that look
     * point but BEHIND THE CAMERA in z. So for the whole of act five -- the
     * hand, the cut, the card, both oath lines and the burning -- the camera
     * held a steady shot of an empty patch of table while everything the act
     * is about happened off-screen behind it.
     *
     * It follows the hand now. The offsets are relative to where the hand
     * actually is, so it stays framed whatever the rig does. */
    return place(INITIATION_SHOTS.ritual({ hand: ritualHandWorld(_ritualHand).toArray() }));
  },
  room_wide() {
    orbitA += dtLast * 0.16;
    return place(INITIATION_SHOTS.room_wide({
      angle: orbitA, player: player.position.toArray(),
    }));
  },
  pullback() {
    /* Off him, through the room, out of the window, back into the trees, until
     * the cabin is one lit window a long way off between black trunks. Slow,
     * continuous, no cuts. It rises as it goes, so the last frame is over the
     * tops of the trees looking back at one lit window, and not a camera
     * bulldozing trunks. */
    return place(INITIATION_SHOTS.pullback({ k: Math.min(1, phaseT / 13) }));
  },
  black() {
    /* The screen is already black. Hold exactly where the shot was fired. */
    return place(INITIATION_SHOTS.black({
      camera: camera.position.toArray(), look: _lookTarget.toArray(),
    }));
  },
  hold() {
    return place(INITIATION_SHOTS.hold({
      camera: camera.position.toArray(), look: _lookTarget.toArray(),
    }));
  },
};

const _ritualHand = new THREE.Vector3();

/**
 * Where the player's left hand is, in the world, right now.
 *
 * Left because that is the hand the card goes in -- `TABLE_SOCKETS.card.hand`
 * says so, and it says so there rather than here because it is a property of
 * the card. The fallback is the tabletop socket, so a rig that somehow has no
 * arm gives a dull shot rather than a crash in the middle of the ceremony.
 */
function ritualHandWorld(out) {
  const shotBeat = phase === 'shot_offer' || phase === 'shot_toast' || phase === 'shot_drink';
  const tableSocket = shotBeat ? TABLE_SOCKETS.whiskey : TABLE_SOCKETS.card;
  const socket = handSocket(playerFigure, tableSocket.hand ?? 'L');
  if (socket) return socket.getWorldPosition(out);
  return out.set(tableSocket.x, TABLE.topY + 0.1, TABLE.z - 0.5);
}

/**
 * What the renderer can actually see of the saint card.
 *
 * Parentage and `visible=true` do not prove presentation: a playing card can
 * be edge-on, behind the camera, or four pixels tall and satisfy both. Project
 * the real face geometry after its hand hierarchy is updated so the browser
 * verifier can certify framing, scale, and which side faces the player.
 */
function ritualCardPresentation() {
  const front = props.card?.front;
  if (!front?.geometry) return null;
  front.geometry.computeBoundingBox?.();
  const bounds = front.geometry.boundingBox;
  if (!bounds) return null;
  front.updateWorldMatrix(true, false);
  camera.updateMatrixWorld(true);

  const corners = [
    [bounds.min.x, bounds.min.y, 0],
    [bounds.max.x, bounds.min.y, 0],
    [bounds.max.x, bounds.max.y, 0],
    [bounds.min.x, bounds.max.y, 0],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z)
    .applyMatrix4(front.matrixWorld)
    .project(camera));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const zs = corners.map((point) => point.z);
  const ndc = {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    minZ: Math.min(...zs), maxZ: Math.max(...zs),
  };
  const width = renderer.domElement.clientWidth || window.innerWidth;
  const height = renderer.domElement.clientHeight || window.innerHeight;
  const center = front.getWorldPosition(new THREE.Vector3());
  const normal = new THREE.Vector3(0, 0, 1)
    .transformDirection(front.matrixWorld)
    .normalize();
  const towardCamera = camera.position.clone().sub(center).normalize();
  const facing = normal.dot(towardCamera);
  const handQuaternion = props.card.group.parent?.getWorldQuaternion(new THREE.Quaternion())
    ?? new THREE.Quaternion();
  const towardCameraInHand = towardCamera.clone()
    .applyQuaternion(handQuaternion.invert());
  const ray = new THREE.Raycaster(
    camera.position,
    center.clone().sub(camera.position).normalize(),
    camera.near,
    camera.position.distanceTo(center) + 0.03,
  );
  playerFigure.group.updateMatrixWorld(true);
  const firstHit = ray.intersectObject(playerFigure.group, true)
    .find((hit) => hit.object.visible !== false) ?? null;
  const hitCard = Boolean(firstHit && (
    firstHit.object === props.card.group
    || props.card.group.children.includes(firstHit.object)
  ));
  return {
    corners: corners.map((point) => point.toArray()),
    ndc,
    pixelWidth: Math.abs(ndc.maxX - ndc.minX) * width / 2,
    pixelHeight: Math.abs(ndc.maxY - ndc.minY) * height / 2,
    fullyFramed: ndc.minX >= -0.96 && ndc.maxX <= 0.96
      && ndc.minY >= -0.96 && ndc.maxY <= 0.96
      && ndc.minZ >= -1 && ndc.maxZ <= 1,
    facing,
    frontFacing: facing > 0.35,
    towardCameraInHand: towardCameraInHand.toArray(),
    firstHit: firstHit?.object?.name ?? null,
    unobstructed: hitCard,
  };
}

let dtLast = 1 / 60;

/**
 * Put the camera where the current shot wants it, this instant.
 *
 * The camera flies rather than cuts -- `updateCamera` lerps toward the shot at
 * about 3.2 per second, which is right for a scene that plays through in order
 * and never teleports the player. A DEBUG SKIP does teleport him, so without
 * this a jump into act five starts the camera seventy metres away out in the
 * woods and spends the next twenty seconds flying to the cabin, through the
 * cabin's walls, while the ceremony plays out unseen.
 *
 * A skip should cut. This is that cut.
 */
function snapCamera() {
  const shot = CAMERA_SHOTS[currentPhase().camera] ?? CAMERA_SHOTS.follow;
  camera.position.copy(shot(dtLast));
  _lookTarget.copy(_desiredLook);
  camera.lookAt(_lookTarget);
}

function updateCamera(dt) {
  if (currentPhase().control === CONTROL_MODES.CUTSCENE) {
    dtLast = dt;
    const shot = CAMERA_SHOTS[currentPhase().camera] ?? CAMERA_SHOTS.hold;
    const desiredPos = shot(dt);
    const k = 1 - Math.exp(-3.2 * dt);
    camera.position.lerp(desiredPos, k);
    _lookTarget.lerp(_desiredLook, k);
    camera.lookAt(_lookTarget);
  }

  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.4);
    const felt = shake * 0.8 * shakeScale();
    camera.position.x += (Math.random() - 0.5) * felt;
    camera.position.y += (Math.random() - 0.5) * felt;
    camera.position.z += (Math.random() - 0.5) * felt;
  }

  fovPunch = Math.max(0, fovPunch - dt * 14);
  const targetFov = BASE_FOV + fovPunch;
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 8 * dt);
    camera.updateProjectionMatrix();
  }

  moonLight.position.copy(player.position).add(_moonOffset);
  moonLight.target.position.copy(player.position);
  /* The disc sits on the same bearing, far out, facing the camera. */
  moonDisc.position.copy(player.position)
    .addScaledVector(_moonDirection, MOON_DISTANCE);
  moonDisc.lookAt(camera.position);
  audio.updateListener(camera);
}

/* ------------------------------------------------------------------
 * ACT TWO — the execution line
 * ------------------------------------------------------------------ */

/** Take the next authored event: kneel, four shots, aim, interruption, release. */
function advanceRun() {
  const entry = RUN_ORDER[runCursor++];
  if (!entry) return;
  if (entry.kind === 'mass_kneel') runMassKneel(entry);
  else if (entry.kind === 'shot') runExecutionStep(entry.step);
  else if (entry.kind === 'aim') runPlayerAim(entry);
  else if (entry.kind === 'interrupt') runLouInterrupt(entry);
  else if (entry.kind === 'release') releaseTony(entry);
}

function kneelOnMark(p, mark) {
  p.stepTo = null;
  p.kneelMark = mark;
  p.standingFall = false;
  poseKneeling(p.sq, mark);
}

/** All remaining prospects go down together; Tony's shared camera drops with them. */
function runMassKneel(entry) {
  setPhase('mass_kneel');
  currentStep = null;
  for (const ordered of entry.lineup) {
    if (ordered.player) continue;
    const prospect = prospectByName.get(ordered.victim);
    const mark = markForStep(ordered);
    if (prospect && mark) kneelOnMark(prospect, mark);
  }
  const first = markForStep(KNEELING_EXECUTIONS[0]);
  if (first) playerController.face(first);
  sayBeat(entry.beat, advanceRun);
}

/** Four single rounds, ending with Kittenboss beside Tony on the fourth mark. */
function runExecutionStep(step) {
  currentStep = step;
  setPhase('execution_sweep');
  const prospect = prospectByName.get(step.victim);
  const mark = markForStep(step);
  if (prospect && mark && prospect.kneelMark !== mark) kneelOnMark(prospect, mark);
  if (prospect && mark && step.victim === 'KITTENBOSS') {
    poseKneelingPanic(prospect.sq, mark);
  }
  sayBeat(step.beat, () => executeKneeling(step, advanceRun));
}

function runPlayerAim(entry) {
  currentStep = null;
  setPhase('player_aim');
  let lineDone = false;
  let aimed = false;
  const continueWhenReady = () => {
    if (lineDone && aimed && phase === 'player_aim') advanceRun();
  };
  const stance = { x: PLAYER_SLOT.x + 0.45, z: PLAYER_SLOT.z - 1.25 };
  startExecution({
    getPos: () => player.position,
    y: KNEEL_HEAD_Y,
    shooter: entry.threat.shooter,
    stance: { ...stance, heading: headingToward(stance, PLAYER_SLOT) },
    rounds: 0,
    nape: true,
    holdFire: true,
    onAim: () => { aimed = true; continueWhenReady(); },
  });
  sayBeat(entry.threat.beat, () => { lineDone = true; continueWhenReady(); });
}

function cancelExecutionAim() {
  if (!exec) return;
  exec.m.sq.armR.rotation.x = 0;
  exec = null;
}

/** Lou's first word wins: no timer and no zero-round fire state can survive it. */
function runLouInterrupt(entry) {
  cancelExecutionAim();
  setPhase('lou_interrupt');
  sayBeat(entry.interruption.beat, advanceRun);
}

function releaseTony(entry) {
  cancelExecutionAim();
  holsterPistol();
  for (const member of members) member.stepTo = null;
  if (!entry.survivors?.includes('PROSPECT TWO')) {
    throw new Error('Lou must release Tony after interrupting the player shot');
  }
  setPhase('walk_out');
  site.ambience.hushClearing();
  for (const light of site.lights) {
    if (typeof light.intensity !== 'number') continue;
    if (light.getWorldPosition ? light.getWorldPosition(_impact).z < 0 : light.position.z < 0) {
      light.intensity = 0;
    }
  }
  sayBeat('IN-200');
  startTheWalk();
}

/* ------------------------------------------------------------------
 * ACT THREE — the walk
 * ------------------------------------------------------------------ */
function startTheWalk() {
  for (const { key, along, lateral, speed } of INITIATION_TRAIL_FORMATION) {
    const member = memberByKey.get(key);
    if (!member) continue;
    member.trailOffset = along;
    member.trailLateral = lateral;
    member.trailSpeed = speed;
  }
}

function updateTrailBeats() {
  for (const entry of INITIATION_TRAIL_BEATS) {
    if (trailK < entry.at || firedTrailBeats.has(entry.id)) continue;
    /* A beat is marked fired when it is SAID, never when it is passed. A
     * sprinting player used to run through three markers while one line was
     * playing and lose the other two silently. */
    if (dialogActive()) return;
    firedTrailBeats.add(entry.id);
    sayBeat(entry.id);
    return;
  }
  if (!trailChoiceUsed && trailK > 0.76 && !dialogActive() && !openChoice) {
    trailChoiceUsed = true;
    setPhase('trail_choice');
    const beat = beatById('IN-245');
    showChoice({
      prompt: beat.choice.prompt,
      hint: '1 · 2 · 3',
      options: beat.choice.options,
      /* This is the one choice made while walking. Keeping the real first-
       * person lock means its nine-second silent fallback cannot strand the
       * player with disabled WASD and no prompt to click the canvas again. */
      releasePointerLock: false,
      onPick: (option) => {
        setPhase('trail_reply');
        sayBeat(option.to, () => {
          trailChoiceResolved = true;
          setPhase('trail');
        });
      },
    });
  }
}

function currentTrailNarrativeStatus() {
  return trailNarrativeStatus({
    firedBeatIds: firedTrailBeats,
    choiceUsed: trailChoiceUsed,
    choiceResolved: trailChoiceResolved,
    dialogActive: dialogActive(),
    choiceOpen: Boolean(openChoice),
  });
}

let cabinProcessionActive = false;
let cabinProcessionPlayerInside = false;

function cabinMarkFor(member) {
  if (member.key === 'LOU') return LOU_SEAT;
  const slotId = CABIN_BLOCKING[member.key];
  return slotId ? blockingSlot(slotId) : CABIN_WALL_SLOTS[member.key] ?? null;
}

/**
 * Put the whole group through the actual doorway.
 *
 * Root cause of the visible teleport: `goInsideAhead()` called
 * `fillTheRoom('BOOSKIBRO')`, which used `standOn()` to move fourteen live
 * figures from the trail to their final room transforms in one frame. The
 * second call moved Booski the instant the player crossed the sill. Nothing
 * was a navigation problem; production was invoking the debug/checkpoint
 * placement helper. The procession below uses the same measured final marks,
 * but reaches each through porch, threshold and room waypoints. One entrant
 * is released only after the previous one clears the doorway.
 */
function startCabinProcession() {
  if (cabinProcessionActive) return;
  cabinProcessionActive = true;
  cabinProcessionPlayerInside = false;
  site.ambience.openDoor();
  for (const [index, key] of INITIATION_CABIN_PROCESSION.entries()) {
    const member = memberByKey.get(key);
    const final = member ? cabinMarkFor(member) : null;
    if (!member || !final) continue;
    member.stepTo = null;
    member.trailOffset = 0;
    member.trailLateral = 0;
    member.placed = false;
    member.cabinProcession = {
      index,
      cursor: 0,
      entered: false,
      complete: false,
      route: cabinProcessionRoute({
        door: {
          x: CABIN_DOOR.x,
          frontZ: CABIN.frontZ,
          outsideZ: CABIN_DOOR.outside.z,
        },
        final,
        index,
      }),
    };
  }
}

function finishCabinProcessionMember(member) {
  const final = cabinMarkFor(member);
  if (!final) return;
  if (member.key === 'LOU') {
    louSeated = true;
    poseSeated(member.sq, LOU_SEAT, ROOM.floorY);
  } else {
    standOn(member.sq, {
      x: final.x,
      z: final.z,
      heading: final.heading ?? headingToward(final, CEREMONY_CENTRE),
    });
  }
  member.placed = true;
  member.cabinProcession.complete = true;
}

function updateCabinProcession(dt) {
  if (!cabinProcessionActive) return;
  const ordered = INITIATION_CABIN_PROCESSION
    .map((key) => memberByKey.get(key))
    .filter((member) => member?.cabinProcession);

  for (let index = 0; index < ordered.length; index++) {
    const member = ordered[index];
    const state = member.cabinProcession;
    if (state.complete) continue;
    const previous = ordered[index - 1]?.cabinProcession ?? null;
    const predecessorClear = !previous || previous.entered;
    const waitsForTony = member.key === 'BOOSKIBRO' && !cabinProcessionPlayerInside;
    if (!predecessorClear || waitsForTony) {
      member.sq.update(dt, _zero, 0);
      faceAt(member.sq, CABIN_DOOR.outside);
      continue;
    }

    const waypoint = state.route[state.cursor];
    if (!waypoint) {
      finishCabinProcessionMember(member);
      continue;
    }
    if (!walkNpc(member.sq, waypoint.x, waypoint.z, dt, 2.65, 0.16)) continue;
    if (waypoint.stage === 'threshold') state.entered = true;
    state.cursor += 1;
    if (state.cursor >= state.route.length) finishCabinProcessionMember(member);
  }

  cabinProcessionActive = ordered.some((member) => !member.cabinProcession.complete);
}

function cabinPrincipalsAtMarks() {
  return INITIATION_CABIN_REQUIRED_AT_MARK.every((key) => memberByKey.get(key)?.placed === true);
}

/** Start the stagger before Tony reaches the porch; Booski waits for him. */
function goInsideAhead() {
  startCabinProcession();
}

/** Everybody in their place, standing, facing the middle of the room. */
function fillTheRoom(except = null) {
  /* Checkpoint/debug placement only. Production reaches these exact marks by
   * updateCabinProcession(), never through this one-frame helper. */
  cabinProcessionActive = false;
  for (const member of members) {
    if (member.key === except) continue;
    member.cabinProcession = null;
    member.stepTo = null;
    member.trailOffset = 0;
    member.trailLateral = 0;
    const slotId = CABIN_BLOCKING[member.key];
    const slot = slotId ? blockingSlot(slotId) : CABIN_WALL_SLOTS[member.key];
    if (!slot) continue;
    const heading = slot.heading ?? headingToward(slot, CEREMONY_CENTRE);
    standOn(member.sq, { x: slot.x, z: slot.z, heading });
    member.placed = true;
  }
  if (!louSeated) {
    louSeated = true;
    poseSeated(lou, LOU_SEAT, ROOM.floorY);
  }
  site.ambience.openDoor();
}

/* ------------------------------------------------------------------
 * ACT FOUR — the cabin
 * ------------------------------------------------------------------ */
const CEREMONY_BEATS_IN_ORDER = ['IN-300', 'IN-310', 'IN-320', 'IN-330', 'IN-340', 'IN-350', 'IN-360'];
let ceremonyIndex = 0;

function runCeremonyBeat() {
  if (ceremonyIndex >= CEREMONY_BEATS_IN_ORDER.length) {
    /* IN-365, and which of its two variants he earns. The game has never told
     * him silence was the strongest thing available; this is the once it does,
     * and then it goes straight back into the ritual with no transition. */
    sayBeat(asideFor(false).id, askTheQuestion);
    return;
  }
  const id = CEREMONY_BEATS_IN_ORDER[ceremonyIndex++];
  if (id === 'IN-350') {
    /* Let the old stereo disappear under the last two pieces of ceremony so
     * the oath question arrives in an already silent room. */
    site.ambience.fadeForOath();
  }
  if (id === 'IN-310') {
    /* Lou asks; then the player, who is Tony, walks there himself. Keeping
     * the continuation out of this callback is deliberate: dialogue cannot
     * drag a separate presentation body away from the first-person camera. */
    sayBeat(id, () => setPhase('ceremony_approach'));
    return;
  }
  const beat = beatById(id);
  if (!beat || beat.lines.length === 0) {
    /* A stage direction with no visible action used to insert 2.6 seconds of
     * blank room. The doorway procession and prop moves own their real time;
     * a text-only beat gets one deliberate breath, not hidden dead air. */
    ceremonyHold = 0.85;
    return;
  }
  sayBeat(id, runCeremonyBeat);
}
let ceremonyHold = 0;

/**
 * IN-370. The question.
 *
 * CHARACTER FIRST, HUD SECOND (docs/TONE-AND-PARODY.md): the prompt goes up in
 * the `onDone` of Lou's line, never over the top of it. There is no timeout on
 * this choice and there is nothing on screen hurrying him — Lou will wait, the
 * room will wait, and the pause before the input is the content.
 */
function askTheQuestion() {
  /* Checkpoint/retry paths can enter here without replaying IN-350. The call
   * is idempotent, and permanently closes the music boundary for the oath and
   * everything after it. */
  site.ambience.fadeForOath();
  setPhase('oath_question');
  /* The first time he has moved. The whole room comes off the walls half a
   * step, which is why he was sitting for eleven minutes. */
  clearPose(lou);
  louSeated = false;
  standOn(lou, { x: LOU_SEAT.x, z: LOU_SEAT.z - 0.55, heading: LOU_SEAT.heading });
  const beat = beatById('IN-370');
  say(beat.lines, () => {
    setPhaseObjective(PHASES.oath_question);
    showChoice({
      prompt: beat.choice.prompt,
      hint: '',
      options: beat.choice.options,
      onPick: (option) => (option.to === 'IN-371' ? answerYes() : answerNo()),
    });
  });
}

function answerYes() {
  setPhase('oath_yes');
  setObjective('');
  sayBeat('IN-371', () => sayBeat('IN-380', () => {
    setPhase('blade');
    runBlade();
  }));
}

/**
 * FAIL-B. Silence, a boot on a board, the tiniest nod, and a gunshot.
 *
 * CUT TO BLACK ON THE FRAME OF THE SHOT — no fall, no body, no blood, no slow
 * motion. The screen is black before the report finishes.
 */
function answerNo() {
  setPhase('oath_no');
  setObjective('');
  failFrom = 'oath';
  sayBeat('FAIL-B', () => {
    /* A man behind him shifts. One sound, off-camera, behind his shoulder. */
    audio.play('footstep.wood', {
      volume: 0.5, ref: 1.2, maxDist: 9, rolloff: 1.1,
      position: { x: player.position.x + 0.5, y: 0.1, z: player.position.z - 1.3 },
    });
  });
}

function fireTheOathShot(reason = 'WRONG ANSWER') {
  playWeaponCue(audio, 'revolver', 'fire', {
    volume: 1,
    position: { x: player.position.x, y: PLAYER_EYE_Y, z: player.position.z - 0.9 },
  });
  fadeEl.style.transition = 'opacity 60ms linear';
  fadeEl.style.opacity = 1;
  shake = Math.max(shake, 0.5);
  failTitleEl.textContent = 'MISSION FAILED';
  failReasonEl.innerHTML = reason;
  setPhase('failed_oath');
  showBlockingOverlay(failEl);
}

/* ------------------------------------------------------------------
 * ACT FIVE — made
 * ------------------------------------------------------------------ */
let heldProp = null;

function holdProp(prop, figure, side, offset = null) {
  if (!prop) return;
  releaseHeldProp();
  attachToHand(figure, side, prop.group, { offset });
  heldProp = prop;
}

function releaseHeldProp() {
  if (heldProp) {
    heldProp.group.parent?.remove(heldProp.group);
    heldProp = null;
  }
}

function startCeremonySalute(key, duration = 1.3) {
  const member = memberByKey.get(key);
  if (!member) return false;
  member.poseDuration = Math.max(0.4, Number(duration) || 1.3);
  member.poseT = member.poseDuration;
  return true;
}

function completeRoomAcknowledgements() {
  if (phase !== 'room') return;
  /* DeathMegatron's authored acknowledgment is physical: a hand at the back
   * of Tony's neck, held a shade too long. The shared rig cannot make that
   * contact from its measured wall mark, so the readable version is his one
   * silent raised-hand acknowledgment while the last spoken salute lands. */
  startCeremonySalute('DEATHMEGATRON', 1.45);
  roomAcknowledgementsComplete = true;
  roomReactionHold = 0.9;
}

function renderRoomReactionSubtitles() {
  const active = roomReaction?.active ?? [];
  if (active.length === 0) {
    speakerEl.textContent = 'THE ROOM';
    lineEl.textContent = '';
    return;
  }
  const featured = active.find((entry) => entry.featured);
  if (featured && active.length === 1) {
    speakerEl.textContent = featured.line.who;
    lineEl.textContent = featured.line.text;
    return;
  }
  speakerEl.textContent = 'THE ROOM';
  lineEl.textContent = active.slice(-4)
    .map((entry) => `${entry.line.who} — ${entry.line.text}`)
    .join('\n');
}

/**
 * Start the collective congratulations without turning them into roll call.
 *
 * The crowd takes deliberately share the room and carry that intent through
 * the shared audio diagnostics (`ambientVoice` + `interrupt`). Gratin and
 * Booskibro are protected by the schedule itself, so their two payoff lines
 * remain fully readable rather than competing with the burst.
 */
function startRoomReaction() {
  const lines = [
    ...(beatById('IN-500')?.lines ?? []),
    ...(beatById('IN-510')?.lines ?? []),
  ];
  const unavailable = lines.filter((line) => !audioReady || !audio.hasSample?.(line.cue));
  if (unavailable.length > 0) {
    for (const line of unavailable) {
      if (!missingVoiceCues.includes(line.cue)) missingVoiceCues.push(line.cue);
    }
    blockedVoiceCue = unavailable[0].cue;
    roomReaction = {
      elapsed: 0,
      next: 0,
      active: [],
      started: [],
      schedule: [],
      duration: currentPhase().timeout,
      blocked: unavailable.map((line) => line.cue),
    };
    setObjective(`VOICE AUDIO NOT READY: ${blockedVoiceCue}`);
    return;
  }

  blockedVoiceCue = null;
  const schedule = buildRoomReactionSchedule(
    lines,
    (line) => speechDuration(audio, line.cue),
  );
  roomReaction = {
    elapsed: 0,
    next: 0,
    active: [],
    started: [],
    schedule,
    duration: roomReactionDuration(schedule),
    blocked: [],
  };
  dialogEl.classList.add('show');
  renderRoomReactionSubtitles();
}

function updateRoomReaction(dt) {
  if (!roomReaction || roomAcknowledgementsComplete) return;
  roomReaction.elapsed += Math.max(0, Number(dt) || 0);

  while (roomReaction.next < roomReaction.schedule.length
    && roomReaction.schedule[roomReaction.next].at <= roomReaction.elapsed) {
    const entry = roomReaction.schedule[roomReaction.next++];
    const body = bodyFor(entry.line);
    const spoken = speak(audio, entry.line.cue, {
      speaker: body ?? (() => player.position),
      mix: SPEECH_MIX,
      gain: entry.featured ? 1 : 0.82,
      speakerId: entry.line.speakerKey,
      subtitle: entry.line.text,
      ambientVoice: entry.ambient,
      interrupt: entry.ambient,
    });
    startCeremonySalute(entry.line.speakerKey, Math.min(1.65, Math.max(1.05, spoken.seconds)));
    const live = {
      ...entry,
      startedAt: roomReaction.elapsed,
      visibleUntil: roomReaction.elapsed + spoken.seconds + 0.18,
      acceptance: spoken.acceptance.status,
    };
    roomReaction.active.push(live);
    roomReaction.started.push(live);
  }

  roomReaction.active = roomReaction.active
    .filter((entry) => entry.visibleUntil > roomReaction.elapsed);
  renderRoomReactionSubtitles();

  if (roomReaction.elapsed >= roomReaction.duration) {
    dialogEl.classList.remove('show');
    lineEl.textContent = '';
    completeRoomAcknowledgements();
  }
}

function beginRoomAside() {
  if (phase !== 'room') return;
  setPhase('room_aside');
  sayBeat('IN-520', () => {
    if (phase !== 'room_aside') return;
    const offer = beatById('IN-530')?.lines.filter((line) => line.speakerKey !== 'PROSPECT') ?? [];
    if (props.whiskey?.group) {
      props.whiskey.group.visible = true;
      attachToHand(boosk, TABLE_SOCKETS.whiskey.hand ?? 'R', props.whiskey.group, {
        offset: props.whiskey.grip?.offset ?? null,
        rotation: props.whiskey.grip?.rotation ?? null,
      });
      props.whiskey.group.userData.ceremonialState = 'offered';
    }
    ceremonialShotState = 'offered';
    say(offer, () => {
      if (phase !== 'room_aside') return;
      ritualPressed = false;
      setPhase('shot_offer');
    });
  });
}

function takeCeremonialShot() {
  if (phase !== 'shot_offer') return;
  ritualPressed = false;
  if (props.whiskey?.group) {
    attachToHand(playerFigure, TABLE_SOCKETS.whiskey.hand ?? 'R', props.whiskey.group, {
      offset: props.whiskey.grip?.offset ?? null,
      rotation: props.whiskey.grip?.rotation ?? null,
    });
    props.whiskey.group.visible = true;
    props.whiskey.group.userData.ceremonialState = 'in-hand';
  }
  ceremonialShotState = 'hand';
  setPhase('shot_toast');
  const toast = beatById('IN-530')?.lines.filter((line) => line.speakerKey === 'PROSPECT') ?? [];
  say(toast, beginCeremonialDrink);
}

function beginCeremonialDrink() {
  if (phase !== 'shot_toast') return;
  ceremonialShotState = 'drinking';
  if (props.whiskey?.group) props.whiskey.group.userData.ceremonialState = 'drinking';
  setPhase('shot_drink');
}

function finishCeremonialShot() {
  if (props.whiskey?.group) {
    props.whiskey.group.parent?.remove(props.whiskey.group);
    props.whiskey.group.visible = false;
    props.whiskey.group.userData.ceremonialState = 'spent';
  }
  ceremonialShotState = 'spent';
  dialogEl.classList.remove('show');
  sayQueue = [];
  site.ambience.stop();
  setPhase('pullback');
}

function runBlade() {
  /* Rippinflow hands Lou the blade, handle first, and goes back to the wall.
   * Booskibro picks the card up and holds it flat on his palm. IN A HAND, both
   * of them: `TABLE_SOCKETS` says which hand each object is put into, because
   * that is a property of the object and not of the code that moves it. */
  holdProp(props.knife, lou, TABLE_SOCKETS.knife.hand ?? 'R');
  if (props.card) {
    attachToHand(boosk, TABLE_SOCKETS.card.hand ?? 'L', props.card.group, {
      offset: props.card.grip?.offset ?? null,
      rotation: props.card.grip?.rotation ?? null,
    });
  }
  sayBeat('IN-400');
}

function runHand() {
  setPhase('hand');
  ritualPressed = false;
  sayBeat('IN-410', () => setPhaseObjective(PHASES.hand));
}

function runCut() {
  setPhase('cut');
  ritualPressed = false;
  setPhaseObjective(PHASES.cut);
  sayBeat('IN-415');
}

/**
 * The cut, marked on the hand it was made in.
 *
 * It used to call `effects.bloodSplat` at a fixed point on the tabletop, and
 * that helper lays three or four GROUND decals up to 90 cm across, scattered
 * over a metre and a half. For a beat whose own stage direction is *"Small.
 * Controlled. Enough to draw blood and no more -- this is not a mutilation and
 * it is not a gore beat"*, the scene was mopping the cabin floor.
 *
 * It is one dark mark, 26 mm across, parented to the palm -- so it travels
 * with the hand instead of staying on the boards, which is the same fault the
 * owner found on Triple X one scene over.
 */
function markThePalm() {
  const socket = handSocket(playerFigure, TABLE_SOCKETS.card.hand ?? 'L');
  if (!socket || palmBlood) return;
  palmBlood = new THREE.Mesh(
    new THREE.CircleGeometry(0.013, 10),
    new THREE.MeshBasicMaterial({ color: 0x6f1010, transparent: true, opacity: 0.86 }),
  );
  palmBlood.name = 'initiation.cut';
  palmBlood.rotation.x = -Math.PI / 2;
  palmBlood.position.set(0, -0.055, 0.012);
  socket.add(palmBlood);
}

function doTheCut() {
  /* Small. Controlled. Enough to draw blood and no more. */
  markThePalm();
  painT = 0.55;
  setPhase('card');
  setObjective('');
  /* IN-420: Booskibro places the card in the bloodied palm and presses it flat.
   * It used to go into the player's hand at IN-440, two beats later, which
   * meant he said "My flesh must burn in hell LIKE THIS SAINT" while Booskibro
   * was still holding the saint. */
  if (props.card) {
    attachToHand(playerFigure, TABLE_SOCKETS.card.hand ?? 'L', props.card.group, {
      offset: props.card.grip?.offset ?? null,
      rotation: props.card.grip?.rotation ?? null,
    });
  }
  sayBeat('IN-420');
}

function runOathLine(which) {
  setPhase(which === 1 ? 'oath_1' : 'oath_2');
  ritualPressed = false;
  setObjective('');
  const id = which === 1 ? 'IN-430' : 'IN-435';
  const beat = beatById(id);
  /* Lou says it, then the prompt goes up, then Tony repeats it. If the player
   * never presses, Tony says it anyway, quietly, and the scene continues —
   * nothing in this act can fail. */
  const louLines = beat.lines.filter((line) => line.who !== 'PROSPECT');
  say(louLines, () => offerOathLine(which));
}

/**
 * REPEAT AFTER ME, and mean it exactly.
 *
 * Lou finishes, the room stops, and three lines go up: what he just said, and
 * two men who were listening to the sense of it instead of the words. This
 * used to be a single press -- "nothing in this act can fail" -- and the owner
 * asked for the version with a consequence, which is what the whole room
 * standing behind him has been for.
 *
 * `showChoice` is the scene's own founders-quiz machinery, unchanged: it
 * already takes options with a `correct` flag and hands the picked one back.
 * The correct text is read out of the beat rather than typed again, so it
 * cannot drift from the line Lou is recorded saying.
 */
function offerOathLine(which) {
  const beat = beatById(which === 1 ? 'IN-430' : 'IN-435');
  const mine = beat.lines.filter((line) => line.who === 'PROSPECT');
  const correctText = mine[0]?.text ?? '';
  setPhaseObjective(PHASES[which === 1 ? 'oath_1' : 'oath_2']);
  /* Authored order, shuffled per playthrough so the right answer is not
   * always button one. `Math.random` is fine HERE and nowhere near geometry:
   * it moves a button, not a recorded bucket. */
  const options = [...oathChoices(beat.id, correctText)].sort(() => Math.random() - 0.5);
  showChoice({
    prompt: 'Say it back.',
    hint: 'Word for word.',
    options,
    onPick: (option) => {
      if (option.correct) {
        repeatOathLine(which, option);
        return;
      }
      fumbleOath();
    },
  });
}

/**
 * He got the words wrong, and the man behind him was always going to be there.
 *
 * The same shot the refusal at IN-370 fires -- one round, off the shoulder,
 * black before the report finishes. Reusing it rather than writing a second
 * death keeps the two ways of failing this room identical, which is the
 * honest reading: the Circle does not care WHY you could not say it.
 */
function fumbleOath() {
  hideChoice();
  setObjective('');
  failFrom = 'oath';
  fireTheOathShot('WRONG WORDS');
}

function repeatOathLine(which) {
  const beat = beatById(which === 1 ? 'IN-430' : 'IN-435');
  const mine = beat.lines.filter((line) => line.who === 'PROSPECT');
  setObjective('');
  say(mine, () => (which === 1 ? runOathLine(2) : runBurn()));
}

function runBurn() {
  setPhase('burn');
  ritualPressed = false;
  /* The card is already in his palm -- it went in at IN-420. Lou takes the
   * candle off the table and lights ONE CORNER of it, then folds the card into
   * the hand and puts his own over the top. The prop draws its own char
   * front, flame and embers; `cardBurn` owns the timing and the rules. */
  if (props.card) {
    props.card.resetBurn?.();
    attachToHand(playerFigure, 'L', props.card.group, {
      offset: props.card.grip?.offset ?? null,
      rotation: props.card.grip?.rotation ?? null,
    });
  }
  cardBurn.reset().ignite();
  emberT = 0;
  sayBeat('IN-440', () => setPhaseObjective(PHASES.burn));
}

function runMade() {
  setPhase('made');
  props.card?.setBurnProgress?.(1);
  setObjective('');
  /* Ash, and a burn, and blood. He opens his hand and does not wipe it -- so
   * the cut stays on the palm, and only the card itself is gone. */
  if (props.card) props.card.card.visible = false;
  releaseHeldProp();
  sayBeat('IN-450', () => sayBeat('IN-460', () => sayBeat('IN-465', tieTheBandana)));
}

/**
 * The bandana, on Lou's hands, in one continuous shot.
 *
 * No white flash or transformation effect: he was one thing and now he is
 * wearing a bandana. The articulated formal figure is rebuilt with that one
 * earned appearance detail while the camera stays on Lou's hands.
 */
function tieTheBandana() {
  if (!inducted) {
    inducted = true;
    const member = makeInitiationCeremonyFigure('TONY', { appearance: { bandana: true } });
    member.group.position.copy(playerFigure.group.position);
    member.heading = playerFigure.heading;
    member.group.rotation.y = playerFigure.heading;
    scene.remove(playerFigure.group);
    scene.add(member.group);
    playerFigure = member;
    prepareFirstPersonRitualFigure(playerFigure);
  }
  setPhase('room');
  roomAcknowledgementsComplete = false;
  roomReactionHold = 0;
  /* Owner QA: this has to be a collective eruption, not nineteen people
   * waiting their turn to read one line each. The schedule preserves every
   * authored cue and face while making the first wave genuinely simultaneous. */
  startRoomReaction();
}

/* ------------------------------------------------------------------
 * FAIL / RETRY
 * ------------------------------------------------------------------ */
function retry() {
  failEl.classList.add('hidden');
  /* The failure card suspends canonical input so the pointer can reach its
   * button. Retrying is a lifecycle boundary too: numbered choice routes must
   * be live again even while the cursor remains free over the restored quiz.
   * Request capture only after the player makes that choice. */
  input?.resume({ requestPointerLock: false });
  painT = 0;
  hideChoice();
  sayQueue = [];
  sayDone = null;
  dialogEl.classList.remove('show');
  holsterPistol();
  muzzleLight.intensity = 0;
  exec = null;
  playerFallT = -1;
  playerFigure.group.rotation.x = 0;

  if (failFrom === 'oath') {
    /* FAIL-B resumes on Lou standing with the question re-asked, and NOTHING
     * BEFORE IT REPLAYS — not the code, not the deeds, not the aside. A player
     * who has heard eleven minutes of ritual does not hear it again for
     * pressing the wrong key; that is how a retry loop turns a sacred beat
     * into a chore. It also plays no dialogue except the question itself. */
    fadeEl.style.transition = '';
    fadeEl.style.opacity = 0;
    failTitleEl.textContent = 'INITIATION FAILED';
    askTheQuestion();
    return;
  }

  /* FAIL-A, entirely unchanged: the Circle, inexplicably, lets him have
   * another go at the founders. */
  for (const m of members) {
    clearPose(m.sq);
    m.stepTo = null;
    m.sq.group.rotation.x = 0;
    m.sq.group.position.set(m.home.x, 0, m.home.z);
    m.sq.heading = headingToward(m.home, LINE_CENTER);
    m.sq.group.rotation.y = m.sq.heading;
  }
  playerController.teleport(PLAYER_SLOT, { heading: playerFigure.heading });
  playerController.syncFigure(playerFigure);
  setPhase('q2_choice');
  showQuiz();
}

/* ------------------------------------------------------------------
 * PHASE LOGIC
 * ------------------------------------------------------------------ */
/**
 * Kill whatever the current execution is doing and take its exit.
 *
 * The hard cap behind the standing barrage, player fail, and execution sweep. It fires
 * the exit ONCE and never twice: a `return`-state execution has already run
 * its `onFinished` and only needs clearing, and a `done`-state one has already
 * run its `onDead`.
 */
function forceExec() {
  if (!exec) return;
  const { target, state } = exec;
  exec.m.sq.armR.rotation.x = 0;
  exec = null;
  if (state === 'return') return;
  if (state !== 'done' && target.onDead) target.onDead();
  if (target.onFinished) target.onFinished();
}

function updatePhase(dt) {
  phaseT += dt;
  if (openChoice) choiceT += dt;
  const spec = currentPhase();

  /* THE WATCHDOG, in one place. Every `advance: 'event'` phase in `phases.js`
   * carries a timeout, and this is what makes the scene's blank-objective
   * convention safe: a queue that never drains takes its exit anyway. The
   * armoury bug was a beat that could be entered and not left. */
  if (spec.advance === 'event' && spec.timeout !== null && phaseT > spec.timeout) {
    if (dialogActive()) { drainSay(); return; }
  }
  /* The same net under the beats that WAIT FOR A CHOICE. Their own timeout is
   * the choice's, and it only starts once the buttons are up — so a line that
   * never drains would leave a player looking at a subtitle with nothing to
   * press. Four times the choice's own patience, because this is a stuck
   * scene and not a slow one. */
  if (spec.choice && !openChoice && dialogActive()
    && phaseT > (spec.timeout === null ? 20 : spec.timeout * 4)) {
    drainSay();
    return;
  }

  if (phase === 'approach') {
    if (distance2D(player.position, LINE_CENTER) < ARRIVE_R) setPhase('line_up');
  } else if (phase === 'line_up') {
    if (distance2D(player.position, PLAYER_SLOT) < 1.05) {
      beginLineChat();
    }
  } else if (phase === 'line_chat') {
    /* Six seconds and she takes the silence for an answer. It is the first
     * time the game offers him silence and does not punish him for it. */
    if (openChoice && choiceT > spec.timeout) {
      hideChoice();
      setPhase('line_chat_reply');
      sayBeat(beatById('IN-030').choice.fallback, openTheSpeech);
    }
  } else if (phase === 'exec_one' || phase === 'exec_player') {
    if (phaseT > spec.timeout && exec) forceExec();
  } else if (phase === 'execution_sweep') {
    if (phaseT > spec.timeout) {
      if (exec) forceExec();
      else if (currentStep) {
        const prospect = prospectByName.get(currentStep.victim);
        if (prospect && !prospect.dead) {
          prospect.dead = true;
          prospect.fallT = 0;
          prospect.fallMark = markForStep(currentStep);
          prospect.standingFall = false;
        }
        advanceRun();
      }
    }
  } else if (phase === 'player_aim') {
    if (phaseT > spec.timeout) {
      cancelExecutionAim();
      advanceRun();
    }
  } else if (
    (phase === 'conspiracy_reveal' || phase === 'mass_kneel' || phase === 'lou_interrupt')
    && phaseT > spec.timeout && !dialogActive()
  ) {
    advanceRun();
  } else if (phase === 'walk_out') {
    /* Either gate: he reaches the trail head, or he has already started up it
     * cross-country. One route out of a clearing with no signs in it is one
     * route too few. */
    if (distance2D(player.position, TRAIL[0]) < 4.5 || trailProgress(player.position) > 0.05) {
      setPhase('trail');
    }
  } else if (phase === 'trail' || phase === 'trail_choice' || phase === 'trail_reply') {
    trailK = trailProgress(player.position);
    if (phase === 'trail') {
      updateTrailBeats();
      /* Only from `trail` itself: arriving out of a reply would cut a line off
       * for the sake of a HUD string. */
      if (currentTrailNarrativeStatus().readyForCabin
        && distance2D(player.position, CABIN_DOOR.outside) < 6) {
        setPhase('cabin_arrive');
        goInsideAhead();
      }
    }
    if (phase === 'trail_choice' && openChoice && choiceT > spec.timeout) {
      hideChoice();
      setPhase('trail_reply');
      sayBeat(beatById('IN-245').choice.fallback, () => {
        trailChoiceResolved = true;
        setPhase('trail');
      });
    }
  } else if (phase === 'cabin_arrive') {
    trailK = 1;
    if (distance2D(player.position, CABIN_DOOR.outside) < 2.8) {
      setPhase('cabin_door');
      sayBeat('IN-260');
    }
  } else if (phase === 'cabin_door') {
    if (player.position.z > CABIN.frontZ + 0.6) {
      /* Booskibro comes through behind him. Translation locks only while the
       * three principals finish their real routes; mouse-look stays live. */
      cabinProcessionPlayerInside = true;
      setPhase('cabin_settle');
    }
  } else if (phase === 'cabin_settle') {
    if (cabinPrincipalsAtMarks()) {
      setPhase('ceremony');
      ceremonyIndex = 0;
      ceremonyHold = 0.45;
    }
  } else if (phase === 'ceremony_approach') {
    if (distance2D(player.position, CEREMONY_CENTRE) < 0.72) {
      /* Finish on the authored floor mark so every hand/table reach remains
       * deterministic, then lock translation while preserving mouse-look. */
      playerController.teleport(CEREMONY_CENTRE, { heading: CEREMONY_CENTRE.heading });
      playerController.syncFigure(playerFigure);
      setPhase('ceremony');
      runCeremonyBeat();
    }
  } else if (phase === 'ceremony') {
    if (ceremonyHold > 0) {
      ceremonyHold -= dt;
      if (ceremonyHold <= 0) runCeremonyBeat();
    }
    /* Queue watchdog: eleven minutes of ritual with a blank objective is only
     * legal because it cannot stall. */
    if (phaseT > spec.timeout) askTheQuestion();
  } else if (phase === 'oath_no') {
    if (phaseT > spec.timeout && !dialogActive()) fireTheOathShot();
  } else if (phase === 'blade') {
    if (phaseT > spec.timeout) runHand();
  } else if (phase === 'hand') {
    /* Input OR four seconds and Lou simply takes it. No fail, no hint. */
    if (ritualPressed || phaseT > spec.timeout) runCut();
  } else if (phase === 'cut') {
    if (ritualPressed || phaseT > spec.timeout) doTheCut();
  } else if (phase === 'card') {
    if (phaseT > spec.timeout && !dialogActive()) runOathLine(1);
  } else if (phase === 'oath_1' || phase === 'oath_2') {
    const which = phase === 'oath_1' ? 1 : 2;
    if (!dialogActive() && (ritualPressed || phaseT > spec.timeout)) repeatOathLine(which);
  } else if (phase === 'burn') {
    if (!dialogActive()) {
      /* The rules -- the real second and a half, the drop, Lou relighting it
       * and putting it back as many times as it takes, and the commit after
       * which a player who cannot or will not hold the button is held -- all
       * live in `cardBurn`. The card prop draws its own char front, flame and
       * embers; this feeds it the simulation's state. */
      for (const event of cardBurn.update(dt, holdHeld)) {
        if (event === 'catch') {
          /* He winces as it catches. One sound, involuntary, not a scream. */
          sfx.cardCatch();
          painT = 0.42;
        } else if (event === 'relight') {
          /* Nobody in the room reacts and nothing appears on screen. */
          sfx.cardCatch();
        } else if (event === 'spent') {
          runMade();
        }
      }
      props.card?.setBurnProgress?.(cardBurn.char);
      props.card?.updateBurn?.(dt);
      emberT += dt;
      if (cardBurn.flame && emberT > 0.28) {
        emberT = 0;
        sfx.ember();
      }
      /* The watchdog stays, for a burn that somehow never reports itself. */
      if (phaseT > spec.timeout) runMade();
    }
  } else if (phase === 'room') {
    updateRoomReaction(dt);
    if (roomAcknowledgementsComplete) {
      roomReactionHold -= dt;
      if (roomReactionHold <= 0) beginRoomAside();
    } else if (phaseT > spec.timeout) {
      dialogEl.classList.remove('show');
      completeRoomAcknowledgements();
    }
  } else if (phase === 'room_aside') {
    if (phaseT > spec.timeout && !dialogActive()) {
      /* A voice-bank failure cannot strand a physical prop. The glass is
       * already in Booski's hand on the normal route; the fallback still puts
       * the exact same interaction prompt up rather than skipping the drink. */
      if (ceremonialShotState === 'table' && props.whiskey?.group) {
        attachToHand(boosk, TABLE_SOCKETS.whiskey.hand ?? 'R', props.whiskey.group, {
          offset: props.whiskey.grip?.offset ?? null,
          rotation: props.whiskey.grip?.rotation ?? null,
        });
        ceremonialShotState = 'offered';
      }
      ritualPressed = false;
      setPhase('shot_offer');
    }
  } else if (phase === 'shot_offer') {
    if (ritualPressed || phaseT > spec.timeout) takeCeremonialShot();
  } else if (phase === 'shot_toast') {
    if (phaseT > spec.timeout && !dialogActive()) beginCeremonialDrink();
  } else if (phase === 'shot_drink') {
    if (phaseT > spec.timeout) finishCeremonialShot();
  } else if (phase === 'pullback') {
    if (phaseT > spec.timeout) {
      recordInitiationComplete();
      setPhase('complete');
      input?.suspend();
      hudEl.classList.remove('visible');
      campaignCreditsView.roll({
        roll: [
          ...prospectRecordCreditEntries(campaign.state.statistics),
          ...campaignCreditRoll(),
        ],
      });
    }
  }
}

let lineChatStarting = false;
function beginLineChat() {
  if (lineChatStarting || phase !== 'line_up') return;
  lineChatStarting = true;
  spotMark.visible = false;
  const heading = headingToward(PLAYER_SLOT, { x: boosk.position.x, z: boosk.position.z });
  playerController.teleport(PLAYER_SLOT, { heading });
  playerController.syncFigure(playerFigure);
  setPhase('line_chat');
  setObjective('Loading the voices at the fire…');
  void ensureAudio().then((ready) => {
    lineChatStarting = false;
    if (phase !== 'line_chat') return;
    if (!ready) {
      setObjective('Initiation voice audio failed to load.');
      return;
    }
    setObjective(PHASES.line_chat.objective);
    const beat = beatById('IN-030');
    say(beat.lines, () => {
      showChoice({
        prompt: beat.choice.prompt,
        hint: '',
        options: beat.choice.options,
        onPick: (option) => {
          setPhase('line_chat_reply');
          sayBeat(option.to, openTheSpeech);
        },
      });
    });
  });
}

function openTheSpeech() {
  setPhase('speech');
  say(SPEECH, () => {
    setPhase('q1');
    const one = prospectByName.get('PROSPECT ONE');
    one.stepTo = { x: one.home.x, z: LINE_Z + 1.7 };
    say(Q1_LINES, () => {
      setPhase('q1_again');
      sayBeat('IN-060', () => {
        setPhase('exec_one');
        executeStanding(() => {
          setPhase('after_one');
          sayBeat('IN-075', () => {
            setPhase('q2_intro');
            say(Q2_LINES, () => {
              setPhase('q2_choice');
              showQuiz();
            });
          });
        });
      });
    });
  });
}

/* ------------------------------------------------------------------
 * MAIN LOOP
 * ------------------------------------------------------------------ */
const clock = new THREE.Clock();
let flameT = 0;
let footT = 0;

function onStep() {
  playFootstep(audio, player.position.x, player.position.z, { volume: 0.45 });
}

function syncActorColliders() {
  const scriptedTrail = phase === 'walk_out' || phase === 'trail' || phase === 'trail_choice'
    || phase === 'trail_reply' || phase === 'cabin_arrive';
  for (const binding of actorColliders) {
    const { owner, kind, circle } = binding;
    const moving = Boolean(owner.stepTo)
      || (kind === 'member' && scriptedTrail && owner.trailOffset !== 0)
      || (kind === 'member' && owner.cabinProcession && !owner.cabinProcession.complete);
    const fallen = kind === 'prospect' && (owner.dead || owner.fallT >= 0);
    const authoredPose = isPosed(owner.sq);
    syncInitiationActorCircle(circle, owner.sq, {
      active: !moving && !fallen && !authoredPose,
    });
  }
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (paused) return;
  flameT += dt;

  if (dialogActive()) {
    sayAutoT -= dt;
    if (sayAutoT <= 0) advanceSay();
  }

  updatePhase(dt);

  // --- Shared first-person Player / ceremony presentation body ---
  syncActorColliders();
  playerController.update(dt);
  const authoredCamera = currentPhase().control === CONTROL_MODES.CUTSCENE;
  if (authoredCamera) {
    if (playerFigure.stepTo) {
      /* The one scripted walk he does not drive: the length of the table. */
      if (walkNpc(playerFigure, playerFigure.stepTo.x, playerFigure.stepTo.z, dt, 1.6, 0.2)) {
        playerFigure.stepTo = null;
        playerFigure.heading = CEREMONY_CENTRE.heading;
        playerFigure.group.rotation.y = playerFigure.heading;
      }
      footT -= dt;
      if (footT <= 0) {
        footT = 0.42;
        playFootstep(audio, playerFigure.position.x, playerFigure.position.z, {
          volume: 0.35,
          cadenceKey: 'scripted-player',
        });
      }
    } else {
      playerFigure.update(dt, _zero, 0);
    }
  } else {
    playerController.syncFigure(playerFigure);
  }
  if (playerFigure.group.visible && FIRST_PERSON_RITUAL_PHASES.has(phase)) {
    /* Person.update() owns normal gait arms. The close-up owns ritual arms,
     * so the authored pose is re-applied after the shared update each frame. */
    poseFirstPersonRitualHands(playerFigure, phase, phaseT);
  }

  if (playerFallT >= 0) {
    playerFallT += dt;
    playerFigure.group.rotation.x = -Math.min(1.5, playerFallT * 3.2);
  }

  if (spotMark.visible) {
    const pulse = 1 + Math.sin(flameT * 3.4) * 0.08;
    spotMark.scale.set(pulse, 1, pulse);
  }

  if (muzzleLight.intensity > 0) {
    muzzleLight.intensity = muzzleLight.intensity > 1 ? muzzleLight.intensity * Math.exp(-22 * dt) : 0;
  }

  updateInitiationExecutionRevolver(gun, dt);
  updateExecution(dt);
  updateCabinProcession(dt);

  // --- Prospects ---
  for (const p of prospects) {
    if (p.fallT >= 0) {
      p.fallT += dt;
      if (p.standingFall && p.fallMark) {
        poseStandingFallen(p.sq, p.fallMark, Math.min(1, p.fallT * 2.2));
      } else if (p.fallMark) {
        /* Shot from behind, on his knees: he goes FORWARD, face down, rotated
         * about the KNEES and about his own left-right axis. `main.js`'s old
         * topple spins the group about its origin on the world X axis, which
         * for a kneeling figure — whose origin is a metre BELOW the mud — sends
         * a man through the ground and out the other side. */
        poseFallen(p.sq, p.fallMark, Math.min(1, p.fallT * 2.6));
      }
      continue;
    }
    if (isPosed(p.sq)) {
      /* `Person.update()` writes legs, yaw and base height EVERY frame and
       * would stand a kneeling figure back up between one frame and the next.
       * Posed figures are skipped wholesale, which is cheaper than re-posing
       * and harder to forget. */
      continue;
    }
    if (p.stepTo) {
      const speed = p.stepTo.then === 'kneel' ? 1.5 : 2.6;
      if (walkNpc(p.sq, p.stepTo.x, p.stepTo.z, dt, speed, 0.22)) {
        const step = p.stepTo;
        p.stepTo = null;
        if (step.then === 'kneel') {
          kneelOnMark(p, step.mark);
          /* `kneelOnMark` has already tried to fire; if the words have not run
           * out yet the shot waits for them. */
        }
      }
    } else {
      p.sq.update(dt, _zero, 0);
    }
    if (p.jerkT > 0) {
      p.jerkT -= dt;
      p.sq.body.rotation.z = (Math.random() - 0.5) * 0.4;
      if (p.jerkT <= 0) p.sq.body.rotation.z = 0;
    }
  }

  // --- Members ---
  const onTheTrail = phase === 'trail' || phase === 'trail_choice'
    || phase === 'trail_reply' || phase === 'cabin_arrive' || phase === 'walk_out';
  for (const m of members) {
    if (exec && m === exec.m) continue; // the executioner is otherwise engaged
    if (m.cabinProcession && !m.cabinProcession.complete) continue;

    if (m.key === 'BOOSKIBRO' && ceremonialShotState === 'offered') {
      m.sq.update(dt, _zero, 0);
      faceAt(m.sq, player.position);
      poseCeremonyOffer(m.sq, 1);
      continue;
    }

    if (m.poseT > 0) {
      const duration = Math.max(0.4, m.poseDuration || 1.3);
      m.poseT = Math.max(0, m.poseT - dt);
      if (m.key === 'LOU') poseSeated(m.sq, LOU_SEAT, ROOM.floorY);
      else m.sq.update(dt, _zero, 0);
      const elapsed = duration - m.poseT;
      const amount = Math.min(
        THREE.MathUtils.clamp(elapsed / 0.16, 0, 1),
        THREE.MathUtils.clamp(m.poseT / 0.28, 0, 1),
      );
      poseCeremonySalute(m.sq, amount);
      if (m.poseT <= 0) {
        if (m.key === 'LOU') poseSeated(m.sq, LOU_SEAT, ROOM.floorY);
        else m.sq.resetArticulation?.();
      }
      continue;
    }
    if (isPosed(m.sq)) continue;        // Lou, in the only chair anybody sits in
    if (onTheTrail && m.trailOffset !== 0) {
      /* Strung out along the trail in ones and twos, ahead of him and behind
       * him. The fire gets smaller behind them and nobody looks back at it. */
      const k = THREE.MathUtils.clamp(trailK + m.trailOffset, 0, 1);
      const at = formationTarget(pointAlongPath(TRAIL, k), m.trailLateral);
      walkNpc(m.sq, at.x, at.z, dt, m.trailSpeed, 0.48);
      continue;
    }
    if (m.stepTo) {
      if (walkNpc(m.sq, m.stepTo.x, m.stepTo.z, dt, 2.4, 0.3)) {
        const arrived = m.stepTo;
        m.stepTo = null;
        if (arrived.face) faceAt(m.sq, arrived.face);
        if (arrived.then === 'collect' && arrived.victim && !arrived.victim.dead) {
          /* He has arrived and said "This way." Now they go, and he walks a
           * step behind them the whole way without a hand on them. */
          faceAt(m.sq, arrived.victim.sq.position);
          arrived.victim.stepTo = {
            x: arrived.mark.x, z: arrived.mark.z, then: 'kneel', mark: arrived.mark,
          };
        }
      }
      continue;
    }
    m.sq.update(dt, _zero, 0);
    /* Whatever the evening's business currently is. Nobody looks away from
     * the working ground while it is being used. */
    if (m.placed) {
      /* Inside, in their place, all facing the same way — which is the reason
       * a room big enough for sixteen does not feel it. */
      faceAt(m.sq, CEREMONY_CENTRE);
    } else if (phase === 'execution_sweep' && currentStep) {
      faceAt(m.sq, markForStep(currentStep));
    } else if (phase === 'exec_one' || phase === 'q1' || phase === 'q1_again') {
      faceAt(m.sq, prospectByName.get('PROSPECT ONE').sq.position);
    } else {
      faceAt(m.sq, m.key === 'BOOSKIBRO' || m.key === 'LOU' ? LINE_CENTER : player.position);
    }
  }

  /* The shared gait and speech gesture own the free arm. Reassert the founder
   * grip afterward so the staff stays beside the coat in walking, turning,
   * aiming and recovery instead of inheriting a full pendulum swing. */
  poseFounderStaffGrip(boosk, boosk.armL.rotation.x);

  // --- Embers off the barrel ---
  for (let i = 0; i < EMBER_N; i++) {
    const e = emberData[i];
    e.t += dt;
    if (e.t > e.life) { resetEmber(i); continue; }
    embers.positions[i * 3] += (e.vx + Math.sin(flameT * 3 + e.phase) * 0.3) * dt;
    embers.positions[i * 3 + 1] += e.vy * dt;
    embers.positions[i * 3 + 2] += (e.vz + Math.cos(flameT * 2.6 + e.phase) * 0.3) * dt;
  }
  embers.geo.attributes.position.needsUpdate = true;

  for (let i = 0; i < FIREFLY_N; i++) {
    const f = fireflyBase[i];
    fireflies.positions[i * 3] = f.x + Math.sin(flameT * 0.7 + f.phase) * 1.6;
    fireflies.positions[i * 3 + 1] = f.y + Math.sin(flameT * 1.1 + f.phase * 2) * 0.5;
    fireflies.positions[i * 3 + 2] = f.z + Math.cos(flameT * 0.5 + f.phase) * 1.6;
  }
  fireflies.geo.attributes.position.needsUpdate = true;

  crackleT -= dt;
  if (crackleT <= 0) {
    sfx.crackle();
    crackleT = 0.3 + Math.random() * 0.9;
  }

  if (painT > 0) {
    painT = Math.max(0, painT - dt * 2.2);
    painFlashEl.style.opacity = painT;
  }

  if (phase === 'made' || phase === 'room' || phase === 'room_aside'
    || phase === 'shot_offer' || phase === 'shot_toast' || phase === 'shot_drink') {
    inductionK = Math.min(1, inductionK + dt / 3);
  }

  site.update(dt);
  /* The pools grow on their own clock, so they have to be ticked. */
  deathPools.update(dt);
  spurts.update(dt);
  updateCamera(dt);
  postfx.render();
  postfx.sample(dt);
}

/* The staging is checked in a test with real world-space vectors, and it is
 * checked again here at boot so a console in a playtest says which beat is
 * wrong rather than a screenshot saying something looks off. */
{
  const findings = verifyExecutionStaging();
  if (findings.length) console.error('[initiation] staging findings', findings);
}

tick();

// Debug/test handle (harmless in production)
window.INITIATION = {
  get player() { return player; },
  get input() { return input; },
  members,
  prospects,
  boosk,
  get actorColliders() {
    return actorColliders.map(({ circle, owner, kind }) => ({
      x: circle.x, z: circle.z, r: circle.r, active: circle.active,
      name: owner.name ?? owner.key ?? '', kind,
    }));
  },
  louStage: lou,
  PLAYER_SLOT,
  KITTENBOSS_SLOT,
  get phase() { return phase; },
  /* Diagnostics for a stall. A phase that advances on its own timer can only
   * fail to advance for two reasons -- the clock is not running, or nobody is
   * asking it -- and telling those apart from outside the page is otherwise
   * guesswork. See tools/verify-initiation.mjs. */
  get phaseT() { return phaseT; },
  get paused() { return paused; },
  get inducted() { return inducted; },
  get quizOpen() { return quizEl.classList.contains('show'); },
  get correctChoice() {
    return quizButtons.findIndex((btn) => btn.dataset.correct === '1');
  },
  get deadProspects() { return prospects.filter((p) => p.dead).map((p) => p.name); },
  get trail() {
    return {
      phase,
      progress: trailK,
      moveScale: playerController.moveScale,
      allowSprint: playerController.allowSprint,
      dialogueTiming: currentPhase().dialogueTiming,
      playerSprinting: player.sprinting,
      heldKeys: [...player.keys],
      ...currentTrailNarrativeStatus(),
    };
  },
  get cabinProcession() {
    return members.map((member) => ({
      key: member.key,
      placed: member.placed,
      cursor: member.cabinProcession?.cursor ?? null,
      entered: member.cabinProcession?.entered ?? false,
      complete: member.cabinProcession?.complete ?? false,
      position: member.sq.position.toArray(),
    }));
  },
  get inductionK() { return inductionK; },
  chooseAnswer: pickChoice,
  get playerFigure() { return playerFigure; },
  get firstPersonHandsVisible() {
    return playerFigure.group.visible && FIRST_PERSON_RITUAL_PHASES.has(phase);
  },
  get control() { return playerController.control; },
  get playerPose() { return playerController.pose; },
  get audioReady() { return audioReady; },
  get audioArmed() { return audioArmed; },
  get audioLoadError() { return audioLoadError?.message ?? null; },
  get missingVoiceCues() { return [...missingVoiceCues]; },
  get failedCues() { return [...audio.failedCues]; },
  get cabinMusic() {
    const policy = site.ambience.music;
    const handle = audio.loops.get(INITIATION_CABIN_MUSIC_KEY) ?? null;
    return {
      ...policy,
      loopActive: Boolean(handle),
      cutoff: handle?.cutoff ?? null,
      volume: handle?.volume ?? null,
      streamed: handle?.streamed === true,
      released: handle?.released === true,
      failed: handle?.failed === true,
    };
  },
  smashAction: actionPress,
  advanceSay,
  stagingFindings: verifyExecutionStaging,
  /** Exercise the real subtitle/audio path without moving the scene. */
  speakVoiceProbe() {
    const before = audio.playbacks.length;
    const beat = beatById('IN-100');
    say(beat.lines);
    return {
      speaker: speakerEl.textContent,
      line: lineEl.textContent,
      cue: beat.lines[0].cue,
      loaded: audio.hasSample?.(beat.lines[0].cue) ?? false,
      duration: audio.sampleDuration?.(beat.lines[0].cue) ?? 0,
      played: audio.playbacks.slice(before).some((entry) => entry.name === beat.lines[0].cue),
      blocked: blockedVoiceCue,
    };
  },
  speakQuizVoiceProbe() {
    const before = audio.playbacks.length;
    say([QUIZ_OPTIONS[0]]);
    return {
      speaker: speakerEl.textContent,
      line: lineEl.textContent,
      cue: QUIZ_OPTIONS[0].cue,
      loaded: audio.hasSample?.(QUIZ_OPTIONS[0].cue) ?? false,
      duration: audio.sampleDuration?.(QUIZ_OPTIONS[0].cue) ?? 0,
      played: audio.playbacks.slice(before).some((entry) => entry.name === QUIZ_OPTIONS[0].cue),
      blocked: blockedVoiceCue,
    };
  },
  /** Lay the four out where they would be lying. Used by the skips below. */
  _layThemOut() {
    for (const step of KNEELING_EXECUTIONS) {
      const p = prospectByName.get(step.victim);
      const mark = markForStep(step);
      p.stepTo = null;
      p.dead = true;
      p.kneelMark = mark;
      p.fallMark = mark;
      p.standingFall = false;
      p.fallT = 1.2;
      poseFallen(p.sq, mark, 1);
    }
    const one = prospectByName.get(STANDING_EXECUTION.victim);
    one.stepTo = null;
    one.dead = true;
    one.fallT = 1.2;
    one.fallMark = { x: one.sq.position.x, z: one.sq.position.z, heading: one.sq.heading };
    one.standingFall = true;
    poseStandingFallen(one.sq, one.fallMark, 1);
    holsterPistol();
  },

  /** Jump the night forward, for the browser verifier and for playtesting. */
  skipToExecutions() {
    hideChoice();
    sayQueue = [];
    sayDone = null;
    dialogEl.classList.remove('show');
    spotMark.visible = false;
    playerController.teleport(PLAYER_SLOT, { heading: headingToward(PLAYER_SLOT, boosk.position) });
    playerController.syncFigure(playerFigure);
    const one = prospectByName.get('PROSPECT ONE');
    one.dead = true;
    one.fallT = 1.2;
    runCursor = 0;
    setPhase('conspiracy_reveal');
    sayBeat('IN-100', advanceRun);
  },
  /** Browser-verifier seam: prove kneeling/free-look even when VO assets are pending. */
  skipToMassKneel() {
    hideChoice();
    sayQueue = [];
    sayDone = null;
    dialogEl.classList.remove('show');
    spotMark.visible = false;
    playerController.teleport(PLAYER_SLOT, { heading: headingToward(PLAYER_SLOT, boosk.position) });
    playerController.syncFigure(playerFigure);
    const one = prospectByName.get('PROSPECT ONE');
    one.dead = true;
    one.fallT = 1.2;
    const massIndex = RUN_ORDER.findIndex((entry) => entry.kind === 'mass_kneel');
    const entry = RUN_ORDER[massIndex];
    if (!entry) throw new Error('Initiation run order is missing mass_kneel');
    runCursor = massIndex + 1;
    runMassKneel(entry);
  },
  skipToCabin() {
    hideChoice();
    sayQueue = [];
    sayDone = null;
    dialogEl.classList.remove('show');
    this._layThemOut();
    playerController.teleport(CEREMONY_CENTRE, { heading: CEREMONY_CENTRE.heading });
    playerController.syncFigure(playerFigure);
    fillTheRoom();
    setPhase('ceremony');
    /* The debug seam starts after the player-driven approach. Clean-start
     * gameplay still plays IN-300/IN-310 and waits for real WASD movement. */
    ceremonyIndex = 2;
    ceremonyHold = 0.4;
  },
  /**
   * Everything act five is about, in one object.
   *
   * It exists because the browser verifier could not see any of it, and so for
   * as long as this scene has existed nothing has ever checked that the card
   * is in the player's hand, that it burns, or that the camera is pointed at
   * it. It was not: the ritual shot framed a fixed patch of tabletop 2.4 m in
   * front of where the player stands.
   */
  get ritual() {
    const socket = handSocket(playerFigure, TABLE_SOCKETS.card.hand ?? 'L');
    const cardGroup = props.card?.group ?? null;
    const hand = ritualHandWorld(new THREE.Vector3());
    const handNdc = hand.clone().project(camera);
    const cardPresentation = ritualCardPresentation();
    return {
      phase,
      camera: currentPhase().camera,
      control: playerController.control,
      cameraOwnedByPlayer: player.camera === camera,
      firstPersonHandsVisible: playerFigure.group.visible
        && FIRST_PERSON_RITUAL_PHASES.has(phase),
      cardInPlayerHand: Boolean(socket && cardGroup && cardGroup.parent === socket),
      cardVisible: props.card?.card?.visible === true,
      cardPresentation,
      char: cardBurn.char,
      burnState: cardBurn.state,
      committed: cardBurn.committed,
      drops: cardBurn.drops,
      flame: cardBurn.flame,
      palmCut: Boolean(palmBlood && palmBlood.parent === socket),
      hand: hand.toArray(),
      handNdc: handNdc.toArray(),
      cameraPos: camera.position.toArray(),
      /**
       * Two different questions, and conflating them wasted a verifier run.
       *
       * `aimMiss` is the SHOT's intent -- where this frame's camera function
       * asked to look, against where the hand is. It is the thing that was
       * broken: the ritual shot aimed at a fixed patch of tabletop.
       *
       * `lookMiss` is what the player can actually see right now, after the
       * smoothing. It is legitimately huge for about a second after any cut
       * that moves the camera a long way, because the camera flies rather than
       * teleports -- a debug skip from the woods to the cabin starts it 70 m
       * out. Assert on `aimMiss` for correctness and on `lookMiss` only once
       * it has settled.
       */
      aimMiss: _desiredLook.distanceTo(hand),
      lookMiss: _lookTarget.distanceTo(hand),
    };
  },
  get roomReaction() {
    return {
      phase,
      elapsed: roomReaction?.elapsed ?? 0,
      duration: roomReaction?.duration ?? 0,
      started: (roomReaction?.started ?? []).map((entry) => ({
        cue: entry.line.cue,
        speaker: entry.line.speakerKey,
        at: entry.startedAt,
        scheduledAt: entry.at,
        end: entry.end,
        ambient: entry.ambient,
        featured: entry.featured,
        acceptance: entry.acceptance,
      })),
      active: (roomReaction?.active ?? []).map((entry) => entry.line.cue),
      blocked: [...(roomReaction?.blocked ?? [])],
      complete: roomAcknowledgementsComplete,
    };
  },
  get ceremonialShot() {
    const glass = props.whiskey?.group ?? null;
    const playerSocket = handSocket(playerFigure, TABLE_SOCKETS.whiskey.hand ?? 'R');
    const booskSocket = handSocket(boosk, TABLE_SOCKETS.whiskey.hand ?? 'R');
    return {
      phase,
      state: ceremonialShotState,
      visible: glass?.visible === true,
      inPlayerHand: Boolean(glass && playerSocket && glass.parent === playerSocket),
      inBooskiHand: Boolean(glass && booskSocket && glass.parent === booskSocket),
      handsVisible: playerFigure.group.visible && FIRST_PERSON_RITUAL_PHASES.has(phase),
    };
  },
  /** Drive the one-button HOLD the burn reads, without a real pointer. */
  setHold(held) { holdHeld = held === true; },
  /** Straight to the blade, with the room already full and the oath taken. */
  skipToRitual() {
    this.skipToOath();
    hideChoice();
    sayQueue = [];
    sayDone = null;
    dialogEl.classList.remove('show');
    setPhase('blade');
    runBlade();
    snapCamera();
  },
  skipToOath() {
    hideChoice();
    sayQueue = [];
    sayDone = null;
    dialogEl.classList.remove('show');
    this._layThemOut();
    playerController.teleport(CEREMONY_CENTRE, { heading: CEREMONY_CENTRE.heading });
    playerController.syncFigure(playerFigure);
    fillTheRoom();
    askTheQuestion();
  },
  skipToInduction() {
    hideChoice();
    sayQueue = [];
    sayDone = null;
    blockedVoiceCue = null;
    dialogEl.classList.remove('show');
    this._layThemOut();
    playerController.teleport(CEREMONY_CENTRE, { heading: CEREMONY_CENTRE.heading });
    playerController.syncFigure(playerFigure);
    fillTheRoom();
    props.card?.setBurnProgress?.(1);
    tieTheBandana();
    sayQueue = [];
    dialogEl.classList.remove('show');
    setPhase('pullback');
    phaseT = PHASES.pullback.timeout + 0.1;
  },
};

/* Referenced so the shared inventory bar and the script's speaker table are
 * not tree-shaken out of a bundle that only reads them at run time. */
/* The audio engine, so a verifier can ask what was actually heard.
 * tools/voice-overlap-check.mjs reads `playbacks` off it to answer whether
 * two people talked at once — the note the owner kept having to make by ear. */
window.INITIATION.audio = audio;
window.INITIATION.inventory = sceneInventory;
window.INITIATION.speakers = SCRIPT_SPEAKERS;
window.INITIATION.cameraModes = CAMERA_MODES;
