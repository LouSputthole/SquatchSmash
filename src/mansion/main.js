/**
 * Lou's mansion -- composition root.
 *
 * PHASE 3 of this mission's environment build: merges Phase 1's exterior
 * grounds/shell (`MansionGrounds.js`) and Phase 2's interior fit-out
 * (`MansionInterior.js`) into one walkable THREE scene, wires the standard
 * first-person `Player` controller from `core/player.js` against the merged
 * collider list, adds a minimal look-and-interact HUD and the shared pause
 * menu, starts a handful of procedural-synth ambience loops, and exposes a
 * `window.mansion` debug handle for headless verification -- exactly the
 * boot-sequence shape used by every other standalone first-person scene in
 * this repo (see `src/graveyard/main.js`, which this file follows closely:
 * `Player` + `InteractionSystem` + `AudioEngine` + `createPauseMenu`, a
 * `world = { colliders, floorZones, groundAt }` object, and a plain
 * requestAnimationFrame loop).
 *
 * PROJECT SILENT SQUATCH now mounts on top of that, and only when there is
 * something to mount it in: the mission lives in `./mission/`, its writing in
 * `./script.js`, and this file hands it the laboratory the environment build
 * publishes (`interior.props.lab`). With no laboratory in the house, nothing
 * is mounted, no campaign is constructed, and this is exactly the walkable
 * tour it has always been -- see the SILENT SQUATCH section below.
 *
 * DOM contract (see the bottom of this file for the full list the Entry
 * phase's mansion.html must provide): #menu/#startBtn for the click-to-begin
 * gate (AudioContext + pointer lock both require a user gesture), and
 * #prompt/#promptKey/#promptLabel/#promptHold for the tiny look-prompt HUD.
 */
import * as THREE from 'three';
import {
  buildMansionGrounds,
  GROUND_Y,
  BASEMENT_Y,
  FOUNTAIN_POS,
  POOL,
} from './scenes/MansionGrounds.js';
import { buildMansionInterior } from './scenes/MansionInterior.js';
import { buildSilentSquatch, silentSquatchCueNames } from './scenes/SilentSquatch.js';
import { Player } from '../core/player.js';
import { InteractionSystem } from '../core/interaction.js';
import { AudioEngine } from '../core/audio.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { Radio } from '../core/radio.js';
import { Tv, CHANNELS, videoChannel } from '../core/tv.js';
import { WeaponSystem } from '../core/weapons/WeaponSystem.js';
import { mountArmory } from '../core/weapons/Armory.js';
import { weaponCueNames } from '../core/weapons/audio.js';
import { WEAPON_IDS, WEAPON_ORDER } from '../core/weapons/catalog.js';
import { mountSilentSquatch } from './mission/mount.js';
import { createMansionLoadout } from './loadout.js';
import { mountMansionCast } from './cast.js';
/* Importing these constructs nothing: a Campaign is only built when
 * createCampaign() is CALLED, which happens below and only when there is a
 * laboratory in the house to play the mission in. Opening the house to walk
 * around it must never touch a save. */
import { createCampaign } from '../core/campaign.js';
import { createSilentSquatchStory } from '../core/silent-squatch-story.js';

/* ================================================================== */
/* DOM handles                                                          */
/* ================================================================== */
const $ = (id) => document.getElementById(id);
const menuEl = $('menu');
const startBtn = $('startBtn');
const promptEl = $('prompt');
const promptKeyEl = $('promptKey');
const promptLabelEl = $('promptLabel');
const promptHoldEl = $('promptHold');
const ammoEl = $('ammo');
const ammoNameEl = $('ammoName');
const ammoMagEl = $('ammoMag');
const ammoReserveEl = $('ammoReserve');
const ammoStateEl = $('ammoState');
const reticleEl = $('reticle');

/**
 * The InteractionSystem contract wants exactly `showPrompt`/`hidePrompt`/
 * `setHold` (see `core/interaction.js`'s docstring and its calls into
 * `this.hud`). This is deliberately NOT `core/hud.js`'s `Hud` class -- that
 * one is hardwired to the apartment scene's own DOM ids (crosshair, subtitle,
 * hand-item, radio-osd, clock, bladder...), none of which exist here.
 */
const tinyHud = {
  showPrompt(label, key = 'E') {
    promptLabelEl.innerHTML = label;
    promptKeyEl.textContent = key;
    promptEl.classList.remove('hidden');
  },
  hidePrompt() {
    promptEl.classList.add('hidden');
    promptHoldEl.style.width = '0%';
  },
  /** progress 0..1, or null to hide/reset the hold bar. */
  setHold(progress) {
    promptHoldEl.style.width = progress === null ? '0%' : `${Math.round(progress * 100)}%`;
  },
};

/* ================================================================== */
/* Renderer / camera / scene                                            */
/* ================================================================== */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.08, 260);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ================================================================== */
/* World: grounds + interior, merged                                    */
/*                                                                       */
/* This is exactly the merge the interior phase's report prescribed:     */
/* concatenate colliders, spread-merge doors/anchors (the two phases'    */
/* key sets don't collide), and call both `update(dt)` functions each    */
/* frame. `buildMansionGrounds(scene)` is called WITH the real scene so   */
/* it applies scene.background/scene.fog itself -- see the lighting-rig  */
/* note further down for why no second rig is added here.                */
/* ================================================================== */
const grounds = buildMansionGrounds(scene);
const interior = buildMansionInterior(grounds.shell);
scene.add(grounds.root, interior.root);

const colliders = [...grounds.colliders, ...interior.colliders];
const doors = { ...grounds.doors, ...interior.doors };
const anchors = { ...grounds.anchors, ...interior.anchors };

/* ================================================================== */
/* Night lighting rig                                                    */
/*                                                                       */
/* The brief's whole recipe -- scene.background/fog, one HemisphereLight, */
/* one shadow-casting moon DirectionalLight sized to the property, and    */
/* scattered warm PointLights for gate lamps/driveway lamps/window glow/  */
/* pool glow -- is already built by `buildMansionGrounds(scene)` (moon +  */
/* hemi + gate/lamp/fountain/uplight/window-spill/pool lights) and        */
/* `buildMansionInterior` (chandelier glow, office desk lamp, basement    */
/* bulb). That is already exactly one shadow-casting light (the moon)     */
/* plus a modest handful of PointLights, matching the budget this brief    */
/* itself describes -- so this composition root deliberately does NOT     */
/* add a second moon/hemisphere pair. Doing so would double-count the sky  */
/* light and spend a second 1536x1536 shadow map for no visual gain. The   */
/* only lighting-adjacent thing left for this file is renderer-level       */
/* config (tone mapping, shadow map type), done above.                    */
/*                                                                        */
/* Ceilings/soffits reading solid black (this pass's item 9): measured,    */
/* not guessed. Sampling actual rendered pixels straight up at the hall     */
/* chandelier and elsewhere showed the roof underside sitting at ~(0-9,    */
/* 0-5, 0-2) -- genuinely solid black on screen. Both remedies the brief    */
/* suggested were tried and MEASURED before picking one:                   */
/*   - HemisphereLight ground-colour brightening: even pushed to a near-   */
/*     white 0xb0a894 ground at the existing 0.9 intensity, the sampled    */
/*     roof pixel barely moved (3,2,0) -- negligible.                      */
/*   - A scene-wide AmbientLight: had to be pushed to ~intensity 50-80      */
/*     before the SAME roof pixel became clearly non-black -- but at that   */
/*     intensity the exterior night sky/grass baseline and already-lit      */
/*     interior walls measured 90-130+/255, blowing the whole night mood    */
/*     out toward daylight. Neither is a safe, surgical fix in this         */
/*     engine's lighting-unit convention (point lights get a large inverse- */
/*     square boost at close range that ambient/hemisphere never get).      */
/* What DID measurably work (confirmed the same way): a real PointLight     */
/* placed close to the surface that needs it. So this only adds one more    */
/* such light, close to the hall's own roof underside above the chandelier   */
/* -- the single most prominent double-height ceiling in the house --       */
/* rather than a scene-wide knob that can't hit this target without          */
/* wrecking everything else. Kitchen/boardroom/trophy/office/basement each   */
/* already got their own close-to-ceiling fixture in this same pass (see     */
/* MansionInterior.js), which is the same fix applied room by room.         */
/* ================================================================== */

/* ================================================================== */
/* Multi-level floor height                                             */
/*                                                                       */
/* `core/player.js` only ever calls `world.groundAt(x, z)` -- two          */
/* arguments, no `floorAt`. `MansionInterior.js`'s `floorAt(x, z, y)`      */
/* needs a third argument (the caller's current foot height) to           */
/* disambiguate a column that is hall-floor above basement-floor above     */
/* nothing, or ground-floor below upper-floor below roof. The fix used     */
/* elsewhere in this codebase for exactly this shape of problem (see       */
/* src/silver/main.js: `world.groundAt = (x,z) => room?.groundAt(x, z,     */
/* player.position.y - player.eyeHeight) ?? 0`) is to close over the       */
/* Player instance and reconstruct that third argument from its own last-  */
/* known eye height. Applied here.                                        */
/*                                                                         */
/* `interior.floorAt` returns null outside every room rect it knows about   */
/* -- Phase 2's own docs call this "not my problem, use the exterior        */
/* default". `buildMansionGrounds()` does not export a floor resolver of    */
/* its own (the brief anticipated a flat 0 fallback), but a *literal* flat  */
/* 0 breaks the one exterior feature every tour of this property actually   */
/* uses: the raised front entry. Phase 1 built the front steps/portico and  */
/* the service-road ramp as lerp-stepped geometry (see MansionGrounds.js's  */
/* `buildFrontEntry()`/`buildServiceRoad()`) and exported their exact rects  */
/* via `grounds.props.frontEntry`/`grounds.props.serviceRoad` specifically   */
/* so a caller could resolve height across them -- so this does that, using */
/* only those exported rects (no new geometry, no edits to either phase's    */
/* file). Everywhere else outside the building footprint still falls back   */
/* to flat street grade (0), per the brief.                                 */
/* ================================================================== */
function inRectXZ(r, x, z) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

const { steps: frontSteps, portico: frontPortico } = grounds.props.frontEntry;
const { ramp: serviceRamp } = grounds.props.serviceRoad;

/*
 * The pool deck used to be unreachable on foot -- a flat 1.2 m platform with
 * no ramp, no steps and no door onto it, which this file previously flagged
 * as a known gap and left alone. Both ends of a real route now exist in
 * MansionGrounds.js: the kitchen's pool door through the north wall, and a
 * run of garden steps up the deck's west side for anyone walking round the
 * outside. Those steps need resolving here, the same way the front entrance
 * and the service ramp already are.
 */
const poolDeck = grounds.props.poolPatio.deck;
const poolSteps = grounds.props.poolPatio.steps;
/* The two flights off the terrace's north edge into the formal garden. Same
 * treatment as the front steps and the service ramp: lerp-stepped geometry
 * built by MansionGrounds, resolved here from the rects it exports. Without
 * this the garden stairs are geometry you fall through. */
const gardenStairs = grounds.props.poolPatio.gardenStairs;

function exteriorGroundAt(x, z) {
  if (inRectXZ(frontSteps, x, z)) {
    const t = THREE.MathUtils.clamp((z - frontSteps.z0) / (frontSteps.z1 - frontSteps.z0), 0, 1);
    return THREE.MathUtils.lerp(0, GROUND_Y, t);
  }
  if (inRectXZ(frontPortico, x, z)) return GROUND_Y;
  if (inRectXZ(serviceRamp, x, z)) {
    const t = THREE.MathUtils.clamp((z - serviceRamp.z0) / (serviceRamp.z1 - serviceRamp.z0), 0, 1);
    return THREE.MathUtils.lerp(0, GROUND_Y, t);
  }
  if (inRectXZ(poolSteps, x, z)) {
    const t = THREE.MathUtils.clamp((x - poolSteps.x0) / (poolSteps.x1 - poolSteps.x0), 0, 1);
    return THREE.MathUtils.lerp(0, GROUND_Y, t);
  }
  for (const st of gardenStairs) {
    if (!inRectXZ(st, x, z)) continue;
    const t = THREE.MathUtils.clamp((z - st.z0) / (st.z1 - st.z0), 0, 1);
    return THREE.MathUtils.lerp(GROUND_Y, 0, t);
  }
  if (inRectXZ(poolDeck, x, z)) return GROUND_Y;
  return 0;
}

/* ================================================================== */
/* Light rig: keep a fixed number of the nearest practical lights on     */
/*                                                                        */
/* The house is furnished room by room, so between the two modules there  */
/* are ninety-odd small point lights -- a lamp on a nightstand, a bulb in  */
/* a display case, a candle on a dining table. three.js compiles EVERY     */
/* visible light into EVERY material's shader, so leaving them all on is   */
/* not a frame-rate question: measured here, the scene finished building   */
/* and then never produced a second frame at all, because the shader for   */
/* ninety-three point lights never finished compiling. (That is what a     */
/* "the scene loads" pass would have shipped.)                             */
/*                                                                         */
/* Every one of these lights carries a `distance` between 4 and 26 m and    */
/* `decay: 2`, so beyond its own range it contributes literally nothing.    */
/* This keeps exactly ACTIVE_LIGHTS of them switched on -- the ones whose   */
/* range best covers the camera -- and switches the rest off. Holding the   */
/* count CONSTANT matters: three.js keys its shader programs on the number  */
/* of visible lights, so a varying count would recompile every frame. The   */
/* moon and the hemisphere fill are not in this set; they are always on.    */
/* ================================================================== */
const localLights = [...grounds.lights, ...interior.lights];
const ACTIVE_LIGHTS = Math.min(14, localLights.length);
const _lightRank = localLights.map((light) => ({ light, score: 0 }));
for (const entry of _lightRank) entry.light.visible = false;
for (let i = 0; i < ACTIVE_LIGHTS; i++) _lightRank[i].light.visible = true;
let _lightTimer = 0;

/**
 * Add a practical light to the nearest-N rig after it has been built.
 *
 * The rig's `ACTIVE_LIGHTS` count is fixed at construction on purpose (three.js
 * keys its shader programs on the number of VISIBLE lights, so a varying count
 * recompiles every material in the scene). A late arrival therefore joins the
 * candidate pool, switched off, and takes its turn on proximity like the other
 * ninety — the constant stays constant and nothing recompiles.
 */
function registerLocalLight(light) {
  light.visible = false;
  localLights.push(light);
  _lightRank.push({ light, score: 0 });
}

function updateLightRig(dt) {
  _lightTimer -= dt;
  if (_lightTimer > 0) return;
  _lightTimer = 0.2;
  const cam = camera.position;
  for (const entry of _lightRank) {
    const l = entry.light;
    // Score = how far OUTSIDE its own range the camera is. Negative means the
    // camera is inside the light's falloff, so it genuinely contributes.
    entry.score = l.position.distanceTo(cam) - (l.distance || 0);
  }
  _lightRank.sort((a, b) => a.score - b.score);
  for (let i = 0; i < _lightRank.length; i++) {
    _lightRank[i].light.visible = i < ACTIVE_LIGHTS;
  }
}

/* ================================================================== */
/* Audio                                                                 */
/* ================================================================== */
const audio = new AudioEngine();

/**
 * Every cue named below is an existing procedural fallback already built
 * into `core/audio.js` (`synth()` / `synthLoop()`) -- none of these need a
 * decoded sample to play, and no assets/sfx/manifest.json entries were added
 * for this scene, per this job's scope. Names are deliberately reused for a
 * texture other than their literal one, matching the exact trick
 * `src/graveyard/main.js` uses for its own wind bed (`startLoop('graveyard.
 * wind', { name: 'ambience.rain', ... })`):
 *   - 'crickets'     -> 'ambience.city.night', whose own comment calls out
 *                       "a thin high shimmer for the crickets"
 *   - 'fountainWater'-> 'shower.run', a bright running-water hiss, panned at
 *                       the fountain
 *   - 'poolWater'    -> 'tap.run', a quieter running-water bed, panned at
 *                       the pool
 *   - 'distantMusic' -> 'ambience.club', a 104bpm kick + bassline, at a
 *                       near-inaudible volume -- Initiation Night's faint
 *                       music bed, from somewhere else in the house
 */
/* ---- THE HOUSE WAS EERILY SILENT (owner playtest, verbatim: "More
 * background ambience - it's eerily silent").
 *
 * Four beds for thirty-six thousand square metres of estate is four beds too
 * few, and three of them were tied to WATER: the fountain and the pool, both
 * out the front and the back, plus one near-inaudible music loop. Stand
 * anywhere in the hedge maze, the ballroom or the cellar and the mix was
 * literally `ambience.city.night` at 0.11 and nothing else.
 *
 * These are all POSITIONAL except the city, and that is the whole point: an
 * ambience bed with no position plays at the same level in the wine cellar as
 * it does on the lawn, which is how a house ends up sounding like one room.
 * `_loopChain` gives every positioned loop a PannerNode with its own
 * ref/maxDist, so walking from the garden into the hall genuinely crossfades
 * the garden out and the room tone in.
 *
 * Every name below is an existing procedural bed in `core/audio.js` — nothing
 * here needs a recording, and nothing here is added to the manifest, which is
 * the same allowance the four original beds were written under. */
const AMBIENCE_BEDS = [
  /* Wind in thirty hedges and two hundred roses. `ambience.rain` used as a
   * leaf bed is the exact trick `src/graveyard/main.js` uses for its wind. */
  {
    key: 'nightGarden',
    name: 'ambience.rain',
    volume: 0.085,
    at: [0, GROUND_Y, 104],
    ref: 11,
    maxDist: 58,
    fade: 3.0,
  },
  /* The city, over the wall and a long way off. The only non-positional bed
   * in the list: it is the horizon, and the horizon does not get nearer. */
  { key: 'distantCity', name: 'ambience.city', volume: 0.042, fade: 3.4 },
  /* Room tone for the main block -- the sound a big empty house makes. Anchored
   * in the middle of the ground floor with a maxDist that dies at the facade. */
  {
    key: 'houseTone',
    name: 'ambience.room',
    volume: 0.1,
    at: [0, GROUND_Y + 1.6, 52],
    ref: 9,
    maxDist: 32,
    fade: 2.6,
  },
  /* Plant hum under the floor. The armory and the wine cellar are a basement
   * and should sound like one before anybody opens the wall at the far end. */
  {
    key: 'cellarTone',
    name: 'ambience.cellar',
    volume: 0.11,
    at: [0, BASEMENT_Y + 1.5, 57],
    ref: 5,
    maxDist: 20,
    fade: 2.0,
  },
  /* Gratin left a pan on and went downstairs, so the kitchen is running. */
  {
    key: 'kitchenTone',
    name: 'fridge.hum',
    volume: 0.09,
    at: [12.8, GROUND_Y + 1.0, 70],
    ref: 2.6,
    maxDist: 13,
    fade: 1.8,
  },
];

function startAmbience() {
  audio.startLoop('crickets', {
    name: 'ambience.city.night', volume: 0.11, ambience: true, fade: 2.2,
  });
  for (const bed of AMBIENCE_BEDS) {
    audio.startLoop(bed.key, {
      name: bed.name,
      volume: bed.volume,
      ambience: true,
      fade: bed.fade ?? 2.0,
      ...(bed.at
        ? {
          position: new THREE.Vector3(bed.at[0], bed.at[1], bed.at[2]),
          ref: bed.ref,
          maxDist: bed.maxDist,
        }
        : {}),
    });
  }
  audio.startLoop('fountainWater', {
    name: 'shower.run',
    volume: 0.16,
    position: new THREE.Vector3(FOUNTAIN_POS.x, 2, FOUNTAIN_POS.z),
    ref: 4,
    maxDist: 26,
    ambience: true,
    fade: 1.6,
  });
  audio.startLoop('poolWater', {
    name: 'tap.run',
    volume: 0.07,
    position: new THREE.Vector3(POOL.x0 / 2 + POOL.x1 / 2, GROUND_Y + 1, POOL.z0 / 2 + POOL.z1 / 2),
    ref: 4,
    maxDist: 22,
    ambience: true,
    fade: 1.6,
  });
  audio.startLoop('distantMusic', {
    name: 'ambience.club', volume: 0.022, ambience: true, fade: 3,
  });
}

/* ================================================================== */
/* WORKING TELEVISIONS AND RADIOS                                       */
/*                                                                       */
/* Owner playtest 2026-08-04, verbatim: "Lets get working TVs and radios, */
/* especially a radio in the pool table room and one out by the pool."    */
/*                                                                        */
/* Both are the game's OWN systems, not new ones. `core/tv.js` is the      */
/* channel-list television the apartment and Lou's Bing office already     */
/* run; `core/radio.js` is the 97.8 receiver from the apartment, the boat  */
/* and the Bing. Nothing here re-implements a media player, and no new     */
/* audio cue is introduced -- the radio's own `radio.click` / `radio.tune` */
/* / `radio.talk` cues and the TV's `tv.click` are all already in          */
/* assets/sfx/manifest.json because those two scenes use them.             */
/*                                                                        */
/* ONE RECEIVER, TWO SETS. `AudioEngine.startLoop` is keyed by name, and   */
/* Radio starts its talk bed as the literal key 'radio.talk' -- so a       */
/* second live Radio instance would silently lose its bed to the first,    */
/* and switching either one off would stop the other's. So the house has   */
/* one tuner and two physical sets wired to it: the billiard bay's         */
/* mahogany set and the poolside deck set. Using either one moves the      */
/* sound to it, which is also what a house with one aerial does.           */
/* ================================================================== */
const houseTvs = [];
/* The two video channels build a <video> element inside a closure they    */
/* share at module scope, so two sets tuned to the same tape would fight   */
/* over one element. The mansion's sets carry the drawn channels only.     */
const MANSION_CHANNELS = CHANNELS.filter((c) => typeof c.enter !== 'function');

function mountTv(screenMesh, { channel = 0, on = true } = {}) {
  if (!screenMesh) return null;
  const tv = new Tv({ audio });
  tv.channels = MANSION_CHANNELS.slice();
  tv.on = on;
  tv.index = channel;
  tv.position = new THREE.Vector3();
  screenMesh.getWorldPosition(tv.position);
  const tex = new THREE.CanvasTexture(tv.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  screenMesh.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  tv._tex = tex;
  tv._glowLight = null;
  houseTvs.push(tv);
  return tv;
}

const loungeTv = mountTv(interior.props.lounge.tv?.screen, { channel: 0 });
const kitchenTv = mountTv(interior.props.kitchen.tv?.screen, { channel: 2 });

/* ================================================================== */
/* THE HOME THEATRE, AND THE SEAM A FILM DROPS INTO                     */
/*                                                                       */
/* Owner brief, verbatim: "A Home theatre room (will add a watchable      */
/* movie)". The room is built (MansionInterior's buildTheatre); this is   */
/* the projector.                                                         */
/*                                                                        */
/* It is a `core/tv.js` set like the other two, with ONE difference: its   */
/* channel list starts with a `videoChannel`, which is the same factory     */
/* the apartment's Austin tape and Hog Mama's show already use. That        */
/* factory builds its own <video> element on first use, wires the sound     */
/* through a panner at the screen, and -- this is the part that makes it a  */
/* seam rather than a stub -- draws a card reading NO FILM IN THE GATE when */
/* the file is missing, which it is. Nothing here throws, nothing here      */
/* fetches, and the room plays correctly today.                            */
/*                                                                          */
/* TO DROP A FILM IN: put the file at assets/video/the-feature.mp4. That is  */
/* the whole change -- no code, no manifest (assets/video/ is not indexed by */
/* one; `assetUrl` resolves the name directly). The two existing tapes in    */
/* that folder are the precedent for the encode.                            */
/*                                                                           */
/* The other two sets in the house deliberately carry MANSION_CHANNELS,      */
/* which filters video channels OUT: two sets tuned to the same tape share    */
/* one <video> element and fight over it. This set owns its own channel       */
/* object, so it shares nothing with anything.                                */
/* ================================================================== */
const THEATRE_FEATURE = videoChannel({
  name: 'THE FEATURE',
  file: 'the-feature.mp4',
  card: 'NO FILM IN THE GATE',
  glow: { colour: 0xc8d4e8, intensity: 1.5 },
});
const theatreScreen = interior.props.theatre?.screen ?? null;
const theatreTv = mountTv(theatreScreen, { channel: 0, on: false });
if (theatreTv) {
  theatreTv.channels = [THEATRE_FEATURE, ...MANSION_CHANNELS];
  theatreTv.index = 0;
}

/* A small warm glow in front of each set, so the picture lights the room.
 *
 * These two sit OUTSIDE the nearest-N light rig above, and deliberately: a
 * television's glow has to follow the set it belongs to, not the camera. That
 * is safe only because they are dimmed to zero rather than hidden when the
 * set is off -- three.js keys its shader programs on the number of VISIBLE
 * lights, so toggling `.visible` here would recompile every shader in the
 * scene each time somebody switched a telly on. The count stays constant at
 * ACTIVE_LIGHTS + 2 for the whole run; measured in the browser: 126 point
 * lights built, 16 visible, one shader compile. */
for (const tv of houseTvs) {
  const glow = new THREE.PointLight(0x9fb4cc, 0, 5, 2);
  glow.position.copy(tv.position);
  scene.add(glow);
  tv._glowLight = glow;
}

const radioSets = [
  interior.props.lounge.radio,
  grounds.props.poolPatio.radio,
].filter(Boolean);
const houseRadio = new Radio(audio, {
  setRadio: () => {},
  toast: () => {},
}, { hour: 21 }, { venue: 'mansion' });
let activeRadioSet = radioSets[0] ?? null;
if (activeRadioSet) houseRadio.setPosition(activeRadioSet.speakerPos);
houseRadio.on = false;
houseRadio.preferredOn = false;

/** Use a set: move the sound to it, then toggle it. */
function useRadioSet(set) {
  if (!set) return;
  if (houseRadio.on && activeRadioSet === set) {
    houseRadio.turnOff();
    set.setLit(false);
    return;
  }
  activeRadioSet?.setLit(false);
  activeRadioSet = set;
  houseRadio.setPosition(set.speakerPos);
  if (!houseRadio.on) houseRadio.turnOn();
  set.setLit(true);
}

/* ================================================================== */
/* Player + world                                                       */
/* ================================================================== */
const world = { colliders, floorZones: [], groundAt: () => 0 };
const player = new Player(camera, world);
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

/* PROJECT SILENT SQUATCH lives west of and under the cellar corridor, and it
 * is built further down this file because it needs the InteractionSystem.
 * Declared here so `world.groundAt` can consult it: the lab's slab is four
 * metres beneath the west wing's own podium, so both are candidates in the
 * same column and neither may simply win. See `resolveFloor`'s note. */
let silent = null;

world.groundAt = (x, z) => {
  const feetY = player.position.y - player.eyeHeight;
  const house = interior.floorAt(x, z, feetY) ?? exteriorGroundAt(x, z);
  return silent ? silent.resolveFloor(x, z, feetY, house) : house;
};

player.mode = 'walk';
player.position.set(anchors.spawn.x, 1.66, anchors.spawn.z);
player.yaw = anchors.spawnYaw;
player.pitch = -0.04;
player.ground = 0;

/* ================================================================== */
/* Interaction: a handful of passive, atmospheric look-targets            */
/*                                                                        */
/* No mission yet, so there is nothing to pick up or turn on -- these are  */
/* purely `label` + `enabled`, no `onUse`. The system's own per-frame       */
/* prompt display (`InteractionSystem.update` calls `hud.showPrompt(label,  */
/* key)` for whatever is currently under the crosshair) already satisfies   */
/* "show a one-line HUD label when looked at" with no extra `onLook`        */
/* callback needed.                                                         */
/* ================================================================== */
const interaction = new InteractionSystem(camera, tinyHud);
/* The base MAX_DISTANCE (2.7 m, set inside core/interaction.js) is tuned for
 * close-up apartment fixtures (drawers, switches, a phone on a nightstand).
 * This scene's flavour props are architectural set pieces meant to be read
 * from across a room -- the chandelier hangs in a double-height void, the
 * fountain statue is a driveway's width away -- so the raycast range is
 * extended for this scene only. This edits the instance's own public
 * property, not core/interaction.js.
 *
 * 18 m, not the 34 m an earlier pass used: that ray is cast only against
 * registered targets, so with nothing occluding it a label was readable
 * clean through the building. Standing just inside the front door produced
 * the note about Lou's desk -- two storeys up and thirty metres north. The
 * range is now a room's worth, and the walls are handed to the system's own
 * occluder list so a label needs line of sight as well as range. */
interaction.raycaster.far = 18;

/* ================================================================== */
/* PROJECT SILENT SQUATCH                                               */
/*                                                                       */
/* The mission's whole environment -- the innocent basement half, the     */
/* hidden entrance in the corridor's west end wall, the stairwell, the    */
/* interrogation area, the observation area and the sealed lab behind     */
/* the reinforced glass -- plus every system the mission drives them      */
/* with. See docs/MISSION-SILENT-SQUATCH.md and the header of             */
/* scenes/SilentSquatch.js.                                               */
/*                                                                         */
/* Built HERE and not up beside the interior because it registers its own  */
/* interaction targets (the switch under the bust, the keypad, the         */
/* transfer drawer, the Silent Night lever) and needs the system that      */
/* owns them. It contributes to the same four merged lists everything      */
/* else does: colliders, occluders, lights and the update loop.            */
/*                                                                          */
/* `src/mansion/mission/` drives it through `window.mansion.lab`. Nothing   */
/* in that module decides the ORDER any of it happens in, and nothing in    */
/* this file does either.                                                   */
/* ================================================================== */
silent = buildSilentSquatch({
  audio,
  interaction,
  camera,
  enabled: () => running,
  registerLight: registerLocalLight,
});
scene.add(silent.root);
/* `colliders` is the same array `world.colliders` points at, so pushing here
 * is the list the Player reads on the next frame -- the armory does exactly
 * this with its racks. Counted, because verify-mansion asserts the merged
 * total adds up from its named contributors. */
const silentColliders = silent.colliders.length;
colliders.push(...silent.colliders);

interaction.setOccluders([...grounds.occluders, ...interior.occluders, ...silent.occluders]);

function flavor(mesh, label) {
  if (!mesh) return;
  interaction.register(mesh, { label, enabled: () => running });
}
flavor(
  grounds.props.fountain.statue,
  'A towering silver Sasquatch, fist raised. Lou had it commissioned the week after the primary.',
);
flavor(
  interior.props.foyer.chandelier,
  'Crystal and gold, hanging in the well of the horseshoe like it dares you to mention the electric bill.',
);
flavor(
  interior.props.conference.screen,
  '"SILVER SASQUATCHES -- ANNUAL SHAREHOLDER MEETING." Confidential. Allegedly.',
);
flavor(
  interior.props.conference.podium,
  'The podium faces the long table, and the long table faces the door Lou comes out of.',
);
flavor(
  interior.props.office.desk,
  "Lou's desk, dead centre behind the conference room. Behind it, a locked case holds something he has never shown anyone.",
);
for (const trophyCase of interior.props.lounge.cases) {
  flavor(trophyCase, 'Tournament silverware. The family takes its bracket seeding very seriously.');
}
flavor(
  interior.props.ballroom.stageStack,
  'A bass rig, a kit on the riser and seven cans on the bar. Whoever plays this room, plays it for one family.',
);
flavor(
  grounds.props.poolPatio.water,
  'Heated, lit, and running its own little fountain at the deep end. Nobody in this family swims.',
);
for (const bottle of interior.props.lounge.jackDaniels.slice(0, 1)) {
  flavor(bottle, 'Fifteen bottles of Jack And Daniels behind the bar. Lou orders it by the case.');
}

/* The third pass's rooms. Every one of these is a place you can now stand in,
 * so every one of them says something when you look at it. */
flavor(
  interior.props.trophyHall.trophy,
  'THE GREAT INCLUDER. Nearly five metres of it off the floor, and not one line on the plinth says who gave it.',
);
flavor(
  interior.props.winterGarden.shield,
  'Six palms, a lily pool and a birdcage with nothing in it. Somebody waters all of this.',
);
flavor(
  interior.props.vault.door,
  'Eleven inches of steel, standing open. Whoever was last in here was not worried about the walk back.',
);
flavor(
  interior.props.lanRoom.stations[0]?.desk.panel,
  'Five machines, five chairs, five sets of headphones. The crest is on the back of every one of them.',
);
flavor(
  interior.props.guestRoom.art,
  'Made up, turned down, and a window that looks out on a light bulb.',
);
flavor(
  interior.props.cellarHall.crest,
  'MEMBERS AND GUESTS. Four doors off one corridor, and the sign has never stopped anybody.',
);
flavor(
  grounds.props.rearGarden.plate,
  'THE MAZE — 1988. Planted the year the case was dropped. Lou has never been to the middle of it.',
);
flavor(
  grounds.props.rearGarden.bronze,
  'The same fist, in bronze, at the end of the walk. This one is not raised.',
);
flavor(
  grounds.props.rearGarden.canal.water,
  'Twelve metres of still water with four jets in it, pointed at nothing.',
);

/* ================================================================== */
/* Things that actually do something                                    */
/* ================================================================== */

/** The kitchen tap. Hold E to run it; let go and it stops. */
let sinkRunning = false;
function setSink(on) {
  if (on === sinkRunning) return;
  sinkRunning = interior.props.kitchen.runSink(on);
  if (sinkRunning) {
    audio.startLoop('mansion.sink', {
      name: 'tap.run',
      volume: 0.5,
      position: interior.props.kitchen.tap.getWorldPosition(new THREE.Vector3()),
      ref: 1.6,
      maxDist: 12,
      fade: 0.12,
    });
  } else {
    audio.stopLoop('mansion.sink', 0.18);
  }
}
interaction.register(interior.props.kitchen.sinkTarget, {
  label: () => (sinkRunning ? 'Turn the tap <b>off</b>' : 'Run the <b>tap</b>'),
  enabled: () => running,
  onUse: () => setSink(!sinkRunning),
});

/* ---- THE BOOK THAT OPENS THE BOOKCASE.
 *
 * Owner playtest: the concealed door in Lou's office was a comment in a brief
 * and nothing else, and he went looking for the secret area behind it. It is
 * real now (`MansionInterior.buildOfficeSecretDoor`) and this is the only way
 * a player learns that.
 *
 * SUBTLE, WHICH MEANS: the prompt is on ONE BOOK, not on the bookcase, so it
 * only appears when the crosshair is on a single 130 mm volume; the label is
 * flat prose until it has been used once, so the room does not announce
 * itself; and there is no HUD objective, no marker and no bark. Everything
 * else in this house that does something says what it does. This one does
 * not, and that is the whole design of it. */
const secretDoor = interior.props.office.secretDoor;
let secretFound = false;
interaction.register(secretDoor.latch, {
  label: () => {
    if (!secretFound) return 'A volume in a different binding, standing proud of the shelf';
    return secretDoor.isOpen ? 'Swing the <b>bookcase</b> back' : 'Pull the <b>book</b>';
  },
  enabled: () => running,
  onUse: () => {
    secretFound = true;
    const opening = secretDoor.toggle();
    /* ITS OWN CUES, and not the cellar's. The first draft of this played
     * `silent.bust.switch` / `silent.wall.mechanism`, which is wrong twice
     * over: those describe two tonnes of masonry on hydraulic rails taking
     * six seconds, and this is a piece of furniture on a pivot -- and they
     * are not in `assets/sfx/manifest.json` at all (SilentSquatch.js authors
     * them locally and lets them fall through to the synth), so `npm run
     * check` was reporting a cue that could never be given a recording. See
     * docs/ENGINE-TRAPS.md #3: the manifest is the truth. */
    audio.play('mansion.bookcase.latch', { volume: 0.55 });
    audio.play(opening ? 'mansion.bookcase.swing' : 'mansion.bookcase.seat', { volume: 0.4, delay: 0.25 });
    return true;
  },
});

/** Either radio set: switch it on, or move the station over to it. */
for (const [set, where] of [
  [interior.props.lounge.radio, 'the billiard bay'],
  [grounds.props.poolPatio.radio, 'the pool deck'],
]) {
  if (!set) continue;
  interaction.register(set.group, {
    label: () => (houseRadio.on && activeRadioSet === set
      ? '97.8 THE SQUATCH. <b>Off</b>'
      : `Put 97.8 on in ${where}`),
    enabled: () => running,
    onUse: () => useRadioSet(set),
  });
}

/* Either television. `core/interaction.js`'s two-action contract is
 * onTap = the cheap one on a quick press, onUse = the committed one at the
 * end of a hold -- so a tap works the power switch and a hold walks the
 * channels, which is the way round a set actually behaves. */
for (const [tv, prop] of [
  [loungeTv, interior.props.lounge.tv],
  [kitchenTv, interior.props.kitchen.tv],
  /* The theatre's projector works exactly the same way -- tap to run the
   * feature, hold to walk the channel list. The screen mesh itself is the
   * target, because a projector bolted to a ceiling is not something you
   * reach up and press. */
  [theatreTv, theatreScreen ? { group: theatreScreen } : null],
]) {
  if (!tv || !prop) continue;
  interaction.register(prop.group, {
    label: () => (tv.on
      ? `<b>${tv.channel.name}</b> &mdash; hold to change channel`
      : 'Switch the <b>set</b> on'),
    enabled: () => running,
    hold: 0.55,
    onUse: () => { if (tv.on) tv.next(); else tv.toggle(); },
    onTap: () => tv.toggle(),
  });
}

/* ================================================================== */
/* THE BASEMENT ARMORY                                                  */
/*                                                                       */
/* Owner, 2026-08-04: "I want them fully usable with bullet tracers,     */
/* magazine ejections when they reload, bullet counts, empty mag click   */
/* sound, full sound effects. I want them fully wired and usable. We     */
/* will be reusing these in other scenes, but for now just put them in   */
/* the armory in the basement of the mansion."                           */
/*                                                                        */
/* NONE OF IT IS BUILT HERE. `src/core/weapons/` owns the six weapons,    */
/* their ammunition, their reloads, their tracers, their sound and the    */
/* racks; this file supplies a camera, a scene, an audio engine and the   */
/* six mount points the basement declares, and wires three keys to it.    */
/* THE TAKE is the next scene to mount the same module, and when it does  */
/* it will import exactly what is imported at the top of this file.       */
/*                                                                        */
/* The system resolves NOTHING about people. It puts a round in the air,  */
/* stops it on the house's own wall geometry, and reports where. Any      */
/* scene that wants a round to hurt somebody decides that itself, with    */
/* its own roster in front of it — which is how the standing rule that    */
/* Snow never enters player-hostile targeting is kept by a module that    */
/* has never heard of Snow. There is no actor list here and there is no   */
/* damage in this scene at all: the mansion is empty.                     */
/* ================================================================== */
const weaponSystem = new WeaponSystem({
  camera,
  world: scene,
  audio,
  groundAt: (x, z) => {
    /* Ejected magazines land on the floor under themselves. `world.groundAt`
     * reconstructs the storey from the PLAYER's foot height, which is right
     * for a magazine that has just left the player's own hands. */
    const inside = interior.floorAt(x, z, player.position.y - player.eyeHeight);
    return inside ?? exteriorGroundAt(x, z);
  },
  /* What a round can stop on: the house's own walls, floors and ceilings.
   * These are the same meshes the interaction system uses as occluders, so a
   * tracer stops exactly where a look-prompt stops. */
  hitTargets: [...interior.occluders, ...grounds.occluders, ...silent.occluders],
  range: 70,
  onEvent: () => { ammoDirty = true; },
});

/* How many collider boxes the racks contributed. The merged list is otherwise
 * exactly grounds + interior, and `verify-mansion.mjs` asserts that sum — so a
 * third contributor has to be countable rather than quietly making the total
 * not add up. */
let armoryColliders = 0;

const armory = mountArmory({
  parent: scene,
  system: weaponSystem,
  interaction,
  racks: interior.props.basement.armoryRacks,
  enabled: () => running,
  /* The racks are solid. `colliders` is the same array `world.colliders`
   * points at, so pushing into it here is the collider list the Player reads
   * on the next frame — no rebuild, no second list to keep in step. */
  addCollider: (x0, x1, y0, y1, z0, z1) => {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(Math.min(x0, x1), y0, Math.min(z0, z1)),
      new THREE.Vector3(Math.max(x0, x1), y1, Math.max(z0, z1)),
    ));
    armoryColliders++;
  },
  /* Each rack's strip light joins the house's nearest-N rig rather than being
   * switched on unconditionally: under the cellar's own bare bulb the racks
   * read as black rectangles with black shapes on them, which is the state
   * this pass exists to leave behind. */
  addLight: registerLocalLight,
  onEvent: () => {
    ammoDirty = true;
    /* The bar follows the rack rather than the other way round: whatever the
     * armory says is in his hands is what the slot shows, and putting a gun
     * back empties it. See the note on `apply()` in ./loadout.js for what
     * happened when this drove the weapon system instead of mirroring it. */
    loadout.syncWeapon(weaponSystem.equipped ?? null);
  },
});

/* ================================================================== */
/* What he is carrying                                                  */
/*                                                                       */
/* Owner playtest 2026-08-04: "Let me have the case in my inventory. I    */
/* spawn in holding it but can put it away and see it in my inventory.    */
/* USe the same system form other scenes. We should already be doing      */
/* this. This way I can grab guns and stuff too."                        */
/*                                                                       */
/* We were: `core/inventory.js` plus `SceneInventoryBar` is the pair      */
/* eight other scenes mount, and the mansion was the one that never did.  */
/* See src/mansion/loadout.js for why holding and OWNING the case are     */
/* two separate facts.                                                    */
/* ================================================================== */
/**
 * Set once `cast` exists, and a no-op until then.
 *
 * Declared ABOVE the loadout rather than below it, because the whole point of
 * this variable is that it must never be read before it is initialised — see
 * the note at `onCordInHand`.
 */
let setCordInHand = () => {};
const loadout = createMansionLoadout({
  weapons: weaponSystem,
  weaponName: (id) => weaponSystem.firearm?.(id)?.name ?? id,
  onCaseInHand: (on) => silentSquatch?.setCaseInHand(on),
  /* THROUGH A MUTABLE HANDLE, NOT THROUGH `cast`, and this is not style.
   *
   * `const cast = mountMansionCast(...)` is three hundred lines below this,
   * and `?.` DOES NOT SAVE YOU FROM A TEMPORAL DEAD ZONE — `cast?.x` on a
   * `const` that has not been initialised is a ReferenceError, not
   * `undefined`. The path is real and it runs at boot: the mission's first
   * beat puts the case in his hands, which calls `onCaseOwned`, which calls
   * `loadout.giveCase()`, which calls `apply()`, which calls this. The house
   * failed to boot at all — `verify:mansion` timed out waiting for
   * `window.mansion.player`, with no error anywhere near the cause.
   *
   * A `let` initialised to a no-op, reassigned once the cast exists. */
  onCordInHand: (on) => setCordInHand(on),
});

/* The ammunition counter. Repainted only when something changed — a DOM write
 * every frame for a number that moves twice a second is a DOM write every
 * frame for nothing. */
let ammoDirty = true;
function updateAmmoHud() {
  if (!ammoDirty || !ammoEl) return;
  ammoDirty = false;
  const hud = weaponSystem.hud();
  if (!hud) {
    ammoEl.classList.add('hidden');
    reticleEl?.classList.add('hidden');
    return;
  }
  ammoEl.classList.remove('hidden');
  reticleEl?.classList.remove('hidden');
  ammoNameEl.textContent = hud.name;
  ammoMagEl.textContent = String(hud.rounds);
  ammoReserveEl.textContent = String(hud.reserve);
  ammoEl.classList.toggle('dry', hud.rounds === 0);
  ammoStateEl.textContent = hud.reloading
    ? 'RELOADING'
    : (hud.rounds === 0 ? (hud.reserve === 0 ? 'NO ROUNDS' : 'EMPTY — R') : '');
}

/* ================================================================== */
/* PROJECT SILENT SQUATCH                                               */
/*                                                                       */
/* The mission (src/mansion/mission/) and the writing (src/mansion/       */
/* script.js) are built against the laboratory API the environment pass   */
/* publishes -- the glass, the six people behind it, the keypad, the      */
/* transfer drawer, the core, the vents and the hidden wall in the wine   */
/* cellar. NONE of that is built here and none of it is built by the      */
/* mission: this file only looks for it and, if it is there, hands it to  */
/* the mission along with a camera, an interaction system and a player.   */
/*                                                                       */
/* If the house has no laboratory in it yet, `lab` is null, nothing is    */
/* mounted, and the scene is exactly the walkable tour it has always      */
/* been -- which is why `npm run verify:mansion` keeps passing while the  */
/* two halves of this mission are built in parallel. The mission's own    */
/* checks do not wait on this: they drive `mission/contract-lab.js`, the  */
/* published API written out as working code, in `npm test`.              */
/*                                                                       */
/* THE CASE IS THE SAME CASE. `mission/mount.js` imports                  */
/* `src/silvercase/props/case.js` -- the actual chrome briefcase from The */
/* Silver Case, carried in, put on Lou's desk, and handed to Booski.      */
/* ================================================================== */
/* The environment pass publishes its laboratory as the return of
 * `buildSilentSquatch`; the mission pass was written against
 * `interior.props.lab`. Both were correct in isolation and the house had a
 * fully built basement laboratory that the mission never mounted into,
 * because the two halves published to different names and every check on
 * either side read its own name and agreed with itself. Publish it where the
 * mission looks, so there is one name and it is this one. */
if (silent?.lab && !interior.props.lab) interior.props.lab = silent.lab;

const lab = interior.props.lab
  ?? interior.lab
  ?? grounds.props.lab
  ?? silent?.lab
  ?? null;

/**
 * The campaign seam.
 *
 * `createSilentSquatchStory` is what records the night: basement access, the
 * Family's regard, Aubbie's notes on the apartment computer, Silent Squatch on
 * the conspiracy board and the trophy on the shelf. A save that has already
 * finished it says so, and the mission is not mounted a second time -- the
 * house is simply a house with an open basement and a man still hanging in it.
 */
function beginCampaignNight() {
  try {
    const story = createSilentSquatchStory({ campaign: createCampaign() });
    const entry = story.begin();
    /* `play: false` means the save says this night is over -- the only reason
     * the mission is not mounted in a house that has a laboratory in it. A
     * campaign that could not be READ is a different thing entirely and must
     * never cost anybody the mission. */
    return entry.ok ? { story, play: true } : { story: null, play: false };
  } catch {
    /* A sandboxed frame with no storage must still be able to play it; it
     * just does not remember it afterwards. */
    return { story: null, play: true };
  }
}

const night = lab ? beginCampaignNight() : { story: null, play: false };
const missionStory = night.story;

let silentSquatch = null;
if (lab && night.play) {
  silentSquatch = mountSilentSquatch({
    THREE,
    scene,
    camera,
    interaction,
    player,
    audio,
    lab,
    anchors,
    /* The case is a thing he is carrying, so it lives in a slot like anything
     * else. Spawning holding it is this firing on the mission's first beat,
     * not a special case at startup. */
    onCaseOwned: (owned) => { if (owned) loadout.giveCase(); else loadout.takeCase(); },
    /* ---- BOOSKI HANDS HIM A PISTOL (owner playtest).
     *
     * The mission's order four beats later is "Handle it", and the only gun
     * in this house was on a rack in the armory, one floor and six rooms
     * back up the corridor — behind a hidden wall that has closed behind
     * him. So either he fetched a weapon before he had been told what it was
     * for, or he stood in the observation area with an execution order and
     * empty hands.
     *
     * NOT OFF A RACK. `armory.take()` needs a stand and takes a copy off a
     * wall; this gun came out of Booski's coat and there is no wall to put it
     * back on. So it goes straight into the weapon system and the bar mirrors
     * it, which is the same one-gun-at-a-time rule the armory keeps — see
     * `syncWeapon` in ./loadout.js. Q still stows it.
     *
     * `pistol9` rather than the revolver: Booski is the man who made copies
     * of Aubbie's notes, and a man like that carries a magazine. */
    onSidearm: () => {
      if (weaponSystem.equipped === WEAPON_IDS.PISTOL9) return;
      weaponSystem.equip(WEAPON_IDS.PISTOL9);
      loadout.syncWeapon(weaponSystem.equipped ?? null);
      ammoDirty = true;
    },
    /* The things he presses. Every one of them is optional: a target the
     * environment has not built yet simply is not registered, and the beat it
     * belongs to is still reachable from the debug handle below. */
    /* Two of these had different names on the two sides, and one was not a
     * mesh at all.
     *
     * The environment calls the switch under the marble Sasquatch
     * `bustSwitch` and the wall drawer `drawer`; the mission was written
     * against `bust` and `transferTable`. And `lab.targets.transferTable` is a
     * coordinate for placing things on, not something to aim at. Left as it
     * was, the hidden door had no switch the player could press -- the whole
     * basement was unreachable -- and the transfer table crashed the mount.
     * Both names are accepted here rather than renaming either half. */
    targets: {
      desk: lab.targets?.desk ?? interior.props.office.desk ?? null,
      bust: lab.targets?.bust ?? lab.targets?.bustSwitch ?? null,
      transferTable: lab.targets?.drawer ?? null,
      /* WHAT YOU POINT AT vs WHERE IT GOES. The two entries above are aim
       * boxes -- the desk group (origin on the floor) and the wall drawer's
       * hit volume -- and the mission was also using them as the place to set
       * the case down, so it landed under the desk and inside the wall. These
       * two are the surfaces. */
      deskSpot: interior.props.office.caseSpot ?? null,
      tableSpot: lab.targets?.tableSpot ?? null,
      keypad: lab.targets?.keypad ?? null,
      silentNight: lab.targets?.silentNight ?? null,
    },
    story: missionStory,
    enabled: () => running,
  });
}

/* ================================================================== */
/* The people in the house                                              */
/*                                                                       */
/* Owner playtest 2026-08-04: "None of the characters are here." They    */
/* were not: the mansion built three thousand meshes of house and put    */
/* nobody in it. `./cast.js` is the man on the door, the guards on their  */
/* posts, the Bing's bartender behind Lou's bar, Snow with his cart in    */
/* the foyer, and Gratin over xXx in the basement.                       */
/*                                                                       */
/* Mounted AFTER the mission so it can share the mission's subtitle bar   */
/* rather than opening a second one -- two subtitle bars is how a guard   */
/* talks over Booski.                                                     */
/* ================================================================== */
const cast = mountMansionCast(scene, world, {
  interaction,
  camera,
  player,
  audio,
  anchors,
  lab,
  hud: silentSquatch?.hud ?? null,
  hasCase: () => loadout.hasCase(),
  /* Gratin's cord is a thing he is carrying, so it is a slot. Owner
   * playtest: it used to be welded to the camera from the handover to the
   * end of the mission. */
  onCordOwned: (owned) => { if (owned) loadout.giveCord(); else loadout.takeCord(); },
  enabled: () => running,
});
setCordInHand = (on) => cast?.setCordInHand?.(on);
/* And catch up: the loadout may already have decided what is in his hand
 * while this was still a no-op. */
loadout.refresh();
/* The guard in the cellar is watching television, which was the owner's note
 * and is also the only thing on his post worth looking at.
 *
 * `lab.tv`, not `cast.tv`. There used to be TWO sets down there: a cabinet
 * television this file painted, built by `cast.js` and standing in the
 * armory, and the entertainment area's flatscreen, which was a dead black
 * rectangle in the one room in the cellar built for watching television. The
 * cabinet set is gone (its own picture z-fought its bezel — `scene-audit`
 * caught it) and the flatscreen is the set.
 *
 * Mounted HERE rather than beside the other three sets because the cast does
 * not exist until this point, and given a late arrival the glow-light loop
 * above has already run -- so this repeats what that loop does rather than
 * leaving `_glowLight` undefined for a render loop that dereferences it every
 * frame. Pushed into `houseTvs` too, or it would never be updated and the
 * debug surface would not see it. */
const cellarTv = lab?.tv?.screen ? mountTv(lab.tv.screen, { channel: 1 }) : null;
if (cellarTv && !cellarTv._glowLight) {
  const glow = new THREE.PointLight(0x9fb4cc, 0, 5, 2);
  glow.position.copy(cellarTv.position);
  scene.add(glow);
  cellarTv._glowLight = glow;
}

/* Snow's cart is solid. Pushed here rather than inside the cast because
 * `verify-mansion` asserts the merged collider total adds up from named
 * contributors, and a third one that appears from nowhere makes the sum a
 * number nobody can check. */
let castColliders = 0;
for (const box of cast?.colliders ?? []) {
  colliders.push(box);
  castColliders++;
}

/* ================================================================== */
/* Pause menu                                                            */
/* ================================================================== */
const clock = new THREE.Clock();
let running = false;

function lockPointer() {
  const pending = renderer.domElement.requestPointerLock?.();
  if (pending && typeof pending.catch === 'function') pending.catch(() => {});
}

const sharedPauseMenu = createPauseMenu({
  title: "Lou's Mansion",
  canPause: () => running,
  getObjective: () => silentSquatch?.mission.objective
    || 'Walk the grounds and the house: the horseshoe stair, the conference room and Lou’s office above it, the bedrooms down the sides, the west wing and the Great Includer, the lower level behind the armory, and the walled garden and hedge maze behind the pool.',
  instructions: [
    'W A S D -- walk. Mouse -- look. Shift -- sprint. C -- crouch. Space -- jump.',
    'E, or click -- look at something notable for a one-line note.',
    'In the cellar armory: E takes a weapon off the rack. Left mouse fires it,'
      + ' R reloads, Q puts it back.',
    'On a job: E works the thing you are looking at. At a keypad, type the'
      + ' number and press ENTER.',
    'Tab pauses and resumes. Escape releases the mouse, which also pauses.',
  ],
  onPause: () => {
    interaction.setPaused(true);
    weaponSystem.setTrigger(false);
    player.clearKeys();
    if (audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend();
  },
  onResume: () => {
    interaction.setPaused(false);
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    clock.getDelta();
    lockPointer();
  },
});

/* ================================================================== */
/* Boot gate: AudioContext and pointer lock both need a user gesture      */
/* ================================================================== */
async function beginTour() {
  if (running) return;
  running = true;
  menuEl.classList.add('hidden');
  await audio.init();
  startAmbience();
  /* The station's own record list. It is loaded but the set stays OFF: this
   * is a tour of an empty house, and a radio that starts talking at you
   * before you have touched it is not what "a radio in the pool table room"
   * means. Either set switches it on. */
  houseRadio.loadManifest().catch(() => {});
  /* The armory's sound. `weaponCueNames()` asks for both halves: the thirty
   * `weapon.*` cues this system wants recorded (which match nothing yet and
   * cost nothing to name) and the recordings standing in for them tonight,
   * which are real files and have to be decoded before a trigger is pulled.
   * Same shape the Bada Bing uses for `bing.grill.*`. */
  /* AND THE VOICE. Owner playtest, 2026-08-06: "Still no voicelines on mansion
   * that are playing."
   *
   * They were not playing because they were never LOADED. This call named two
   * cue lists and both of them are sound effects — `weaponCueNames()` is the
   * armoury and `silentSquatchCueNames()` is the laboratory's doors, keypads
   * and fluorescents. Neither has ever contained a line of dialogue.
   *
   * `AudioEngine.play()` only plays what is already decoded; it does not
   * lazily fetch an unknown cue. So every one of the 175 RECORDED mansion
   * takes sitting in `assets/sfx` was skipped at boot, `play()` returned null,
   * and the scene subtitled the whole night in silence. Nothing was missing,
   * nothing 404'd, and no console error was ever raised — the engine did
   * exactly what it was asked to do, which was to load the sound effects.
   *
   * `vo.silentsquatch.` is the whole mansion script — see `./script.js`'s
   * `cue()`, which builds every name in the scene from that prefix. */
  audio.loadManifest({
    names: [...weaponCueNames(), ...silentSquatchCueNames()],
    prefixes: ['vo.silentsquatch.'],
  }).catch(() => {});
  player.enabled = true;
  lockPointer();
  clock.getDelta();
}
startBtn.addEventListener('click', beginTour);

/* ================================================================== */
/* Input                                                                 */
/* ================================================================== */
window.addEventListener('keydown', (e) => {
  if (!running) return;
  /* The laboratory keypad gets first refusal on a keystroke: while it is up,
   * the digits he types are a code rather than a walk. */
  if (silentSquatch?.keydown(e)) {
    e.preventDefault();
    return;
  }
  if (e.code === 'Space') e.preventDefault();
  player.setKey(e.code, true);
  if (e.code === 'KeyE' && !e.repeat) interaction.press();
  /* R and Q only mean anything with a gun in your hands, and neither is a
   * browser accelerator on its own — the Beef Run's Ctrl lesson applies to
   * modifiers, not to plain letters. */
  if (e.code === 'KeyR' && !e.repeat) weaponSystem.reload();
  if (e.code === 'KeyQ' && !e.repeat && weaponSystem.equipped) armory.put();
  /* Slots, the same keys as the flat: Digit1..Digit5 pick one directly, the
   * wheel cycles. Selecting the case's slot puts it back in his hands and
   * selecting anything else puts it away -- that IS the stow, so there is no
   * separate "holster the case" verb to learn. */
  if (!e.repeat && /^Digit[1-5]$/.test(e.code)) {
    loadout.select(Number(e.code.slice(5)) - 1);
    e.preventDefault();
  }
});
window.addEventListener('wheel', (e) => {
  if (!running) return;
  loadout.cycle(e.deltaY > 0 ? 1 : -1);
}, { passive: true });
window.addEventListener('keyup', (e) => {
  player.setKey(e.code, false);
  if (e.code === 'KeyE') interaction.release();
});
window.addEventListener('blur', () => {
  player.clearKeys();
  interaction.release();
  weaponSystem.setTrigger(false);
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.handleMouseMove(e.movementX, e.movementY);
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!running) return;
  if (document.pointerLockElement !== renderer.domElement) {
    lockPointer();
    return;
  }
  if (e.button !== 0) return;
  /* Armed, the left button is the trigger; empty-handed it is the second
   * interact key it has always been. E stays interact either way, so a man
   * holding a SAW can still take it off and put it back without shooting the
   * rack. */
  if (weaponSystem.equipped) weaponSystem.setTrigger(true);
  else interaction.press();
  /* And at the execution beat it is the execution. The mission resolves the
   * shot against what the crosshair is actually on -- it does not decide that
   * a trigger pull found him. */
  silentSquatch?.fire();
});
window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  weaponSystem.setTrigger(false);
  interaction.release();
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  player.enabled = running && locked;
  if (!locked && running) sharedPauseMenu.pause();
});

/* ================================================================== */
/* Render / update loop                                                  */
/* ================================================================== */
function updateGame(dt) {
  player.update(dt);
  interaction.update(dt);
  grounds.update(dt);
  // The camera position is what Lou's gaze tracks in his office upstairs.
  interior.update(dt, camera.position);
  silent.update(dt);
  updateLightRig(dt);
  /* The sets. A television repaints its canvas and re-uploads the texture,
   * which is not free, so a set that is switched off does nothing at all --
   * `Tv.update` returns immediately when `on` is false, and the texture is
   * only flagged when it has actually changed. */
  for (const tv of houseTvs) {
    if (!tv.on) {
      if (tv._glowLight.intensity !== 0) tv._glowLight.intensity = 0;
      continue;
    }
    tv.update(dt);
    tv._tex.needsUpdate = true;
    const g = tv.glow();
    tv._glowLight.color.setHex(g.colour);
    tv._glowLight.intensity = g.intensity * 1.6;
  }
  houseRadio.update(dt);
  /* The mission, if the house has a laboratory in it. It moves the beat on,
   * plays the writing, and drives the lab; it never moves the camera. */
  silentSquatch?.update(dt);
  /* The house's own people: patrols walk, posts stand, and the barks fire off
   * proximity to the man who says them. */
  cast?.update(dt);
  /* The guns. `player.velocity` drives the walking sway on whatever is in
   * your hands, the same way the heist view-model is driven. */
  weaponSystem.update(dt, { speed: Math.hypot(player.velocity.x, player.velocity.z) });
  if (weaponSystem.equipped) ammoDirty = true;
  updateAmmoHud();
  audio.updateListener(camera);
}

/* Rendering can be suspended from the debug handle. This exists for headless
 * verification: tools/verify-mansion.mjs walks the whole house on foot, which
 * takes several simulated minutes, and driving a 3,700-mesh scene through
 * swiftshader for all of it exhausts the software GPU process and kills the
 * browser mid-tour. The verifier renders real frames either side of the walk
 * -- so a shader or WebGL failure still surfaces, and it still asserts the
 * canvas comes back with something on it -- and suspends only the middle.
 * It has no effect on the game: nothing ever calls this in play. */
let renderEnabled = true;
let framesRendered = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (running && !sharedPauseMenu.isPaused()) updateGame(dt);
  if (renderEnabled) {
    renderer.render(scene, camera);
    framesRendered++;
  }
}
requestAnimationFrame(frame);

/* ================================================================== */
/* Debug handle -- the same pattern every verify-*.mjs script in this     */
/* repo uses to drive a scene headlessly (see window.__bing / window.      */
/* squatchfather / window.GRAVEYARD).                                     */
/*                                                                        */
/* `teleport(x, y, z, yawDeg)`: `y` is a *floor height*, in the same units */
/* as every anchor's `.y` component (GROUND_Y, UPPER_Y, BASEMENT_Y, or 0   */
/* at street grade) -- not an eye/camera height.                            */
/*                                                                          */
/* FIXED 2026-08-04: this used to write that floor height straight into      */
/* `player.position.y`, which is a CAMERA height. Everything downstream      */
/* then read the player's feet as `position.y - eyeHeight`, i.e. 1.66 m      */
/* BELOW the floor it had just been asked to stand on -- so the first        */
/* `world.groundAt()` after a teleport disambiguated a multi-storey column   */
/* with a bogus foot height. On the old layout that made teleporting onto    */
/* the balcony land you reading a basement-ish height while visually still   */
/* upstairs, and the verifier had to work around it by never teleporting     */
/* onto an ambiguous column at all. Setting the camera height properly       */
/* (`y + eyeHeight`) removes the whole class of problem and lets a verifier  */
/* drop into any room on any storey and get a truthful answer.               */
/*                                                                          */
/* `yawDeg` is degrees; 0 faces -Z (three.js's default forward), matching    */
/* `grounds.anchors.spawnYaw`'s own documented convention.                   */
/* ================================================================== */
function teleport(x, y, z, yawDeg = 0) {
  player.mode = 'walk';
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.position.set(x, y + player.eyeHeight, z);
  player.ground = y;
  player.velocity.set(0, 0, 0);
  player.jumpHeight = 0;
  player.grounded = true;
  player.yawCenter = null;
  player.yaw = THREE.MathUtils.degToRad(yawDeg);
  player.pitch = 0;
  player.enabled = true;
  running = true;
  menuEl.classList.add('hidden');
  player.update(1 / 60);
}

window.mansion = {
  /* Handed out so a verifier can do real geometry (Box3 of a mesh, say)
   * against the same THREE instance the scene was built with rather than
   * re-deriving world boxes from constructor parameters. */
  THREE,
  scene,
  camera,
  renderer,
  player,
  interaction,
  audio,
  grounds,
  interior,
  doors,
  colliders,
  collidersCount: colliders.length,
  /**
   * PROJECT SILENT SQUATCH. The whole handle the mission state machine in
   * `src/mansion/mission/` drives, and the one tools/verify-mansion.mjs
   * walks: the hidden wall, the glass door and its lock, the keypad, the
   * transfer drawer, the core, the monitors, the gas, the six scientists,
   * the reinforced-glass audio path, and every rect and anchor in the space.
   *
   * Its rooms deliberately do NOT join `roomTable`/`rooms` above -- the
   * house's anchor list is asserted exactly (missing and extra both fail)
   * and this space is walked by its own tour in the verifier instead.
   */
  lab: silent.lab,
  /** Colliders this module contributed to the merged list. */
  labColliders: silentColliders,
  /* Snow's cart. A named contributor, because the collider total is checked
   * as a SUM of named contributors -- an anonymous +1 makes that check
   * unverifiable rather than merely wrong. */
  castColliders,
  rooms: anchors,
  /** Every enterable room: its rect, its floor height and a stand-on anchor.
   * tools/verify-mansion.mjs walks this list, so a room added to the interior
   * without an entry here is a room the verifier will not check. */
  roomTable: interior.rooms,
  vehicles: grounds.props.vehicles.map((v) => ({
    kind: v.kind ?? null,
    note: v.note ?? null,
    x: v.x,
    z: v.z,
    yaw: v.yaw,
    min: { x: v.worldCollider.min.x, z: v.worldCollider.min.z },
    max: { x: v.worldCollider.max.x, z: v.worldCollider.max.z },
  })),
  landscaping: grounds.props.landscaping,
  /** Every hung picture's world box, and every opening it must not cover.
   * tools/verify-mansion.mjs intersects the two -- see the art/doorway note
   * in MansionInterior.js. */
  art: interior.art,
  artSlots: interior.artSlots,
  openings: [
    ...Object.values(interior.doors).map((d) => ({ id: d.id, ...d })),
    ...Object.values(grounds.doors).map((d) => ({ ...d })),
    ...grounds.shell.windows.map((w) => ({ ...w })),
  ],
  /** The working sets, so a verifier can prove they are wired rather than modelled. */
  media: {
    tvs: houseTvs.map((tv) => ({
      get on() { return tv.on; },
      get channel() { return tv.channel.name; },
      toggle: () => tv.toggle(),
      next: () => tv.next(),
    })),
    radioSets: radioSets.length,
    get radioOn() { return houseRadio.on; },
    get radioTracks() { return houseRadio.playlist.length; },
    useRadio: (i = 0) => useRadioSet(radioSets[i]),
  },
  /**
   * What he is carrying, so a verifier can prove the inventory WORKS rather
   * than that a row of squares got drawn. `slots` is what is in it, `hands` is
   * what the case model is actually doing, and `select` is the player's key.
   */
  loadout: {
    get slots() { return [...loadout.inventory.items]; },
    get selected() { return loadout.inventory.selected; },
    get held() { return loadout.inventory.held; },
    get hasCase() { return loadout.hasCase(); },
    /** True when the chrome case is visibly in his hands right now. */
    get caseInHands() {
      const model = camera.getObjectByName('silentSquatchCarriedCase');
      return Boolean(model?.visible);
    },
    get barSlots() {
      return document.querySelectorAll('#hotbar .slot').length;
    },
    select: (i) => loadout.select(i),
  },
  /**
   * Where every person in the house is actually standing.
   *
   * The house and the people were built by different passes, so "is there a
   * man inside the furniture" is a question neither half can answer on its
   * own -- and the interior pass measured the pool-room bar carcass and its
   * back bar OVERLAPPING by 4 cm, which is a bar with no aisle to stand in.
   * A verifier can now test each post against the real collider list rather
   * than against the placement arithmetic that put him there.
   */
  cast: {
    get people() {
      const out = {};
      for (const [id, npc] of Object.entries(cast?.people ?? {})) {
        const p = npc.group?.position;
        if (p) out[id] = { x: Number(p.x.toFixed(3)), y: Number(p.y.toFixed(3)), z: Number(p.z.toFixed(3)) };
      }
      return out;
    },
    /** Posts whose standing position is inside a solid box. */
    get inSolid() {
      const bad = [];
      for (const [id, npc] of Object.entries(cast?.people ?? {})) {
        const p = npc.group?.position;
        if (!p) continue;
        for (const box of colliders) {
          /* Waist height: a floor plate the feet stand on is not a fault, a
           * counter through the middle of a man is. */
          const y = p.y + 1.0;
          if (p.x > box.min.x && p.x < box.max.x
            && p.z > box.min.z && p.z < box.max.z
            && y > box.min.y && y < box.max.y) {
            bad.push(`${id} at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) inside`
              + ` x[${box.min.x.toFixed(2)},${box.max.x.toFixed(2)}]`
              + ` y[${box.min.y.toFixed(2)},${box.max.y.toFixed(2)}]`
              + ` z[${box.min.z.toFixed(2)},${box.max.z.toFixed(2)}]`);
            break;
          }
        }
      }
      return bad;
    },
  },
  /** Kitchen tap -- the "working sink". */
  sink: {
    get running() { return sinkRunning; },
    set: (on) => setSink(on),
  },
  /**
   * The armory, so a verifier can prove the guns WORK rather than that they
   * render. Everything a rack of weapons claims to do is reachable from here:
   * take one down, fire it, watch the count go down, reload it, watch a real
   * magazine leave the gun and land on the concrete, and hear the dry click
   * when it runs out.
   */
  weapons: {
    /** Catalog ids, in rack order. */
    order: [...WEAPON_ORDER],
    /** Collider boxes the racks added to the merged world list. */
    get colliders() { return armoryColliders; },
    /** Where every rack's mount point is, as the basement declares it. */
    racks: interior.props.basement.armoryRacks.map((r) => ({ ...r })),
    /** Per-weapon rack state: how many copies, how many still on the wall. */
    report: () => armory.report(),
    /** What the ammunition counter says, or null with empty hands. */
    hud: () => weaponSystem.hud(),
    get equipped() { return weaponSystem.equipped; },
    take: (id) => armory.take(id),
    put: () => armory.put(),
    resupply: (id) => armory.resupply(id),
    reload: () => weaponSystem.reload(),
    /** One deliberate shot. Returns the shot result, including `tracer`. */
    fire: () => weaponSystem.triggerPress(),
    /** Hold or release the trigger, for the automatics. */
    trigger: (down) => weaponSystem.setTrigger(down === true),
    /** Rounds in the air right now, and how many this pool has ever fired. */
    get tracers() {
      return { live: weaponSystem.tracers.live, fired: weaponSystem.tracers.fired };
    },
    /** Magazines and brass: thrown, in the air, and settled on the floor. */
    get ejecta() {
      const pool = weaponSystem.ejecta;
      return {
        dropped: pool.dropped,
        landed: pool.landed,
        airborne: pool.airborne,
        resting: pool.resting,
        /** The world Y of each piece, so a verifier can prove it FELL. */
        heights: pool.pieces.map((p) => Number(p.object.position.y.toFixed(3))),
      };
    },
    /** Shots, dry clicks, reloads, ejections, impacts. */
    get stats() { return { ...weaponSystem.stats }; },
    /** Which cues the guns have asked for, most recent last. */
    get cues() { return [...weaponSystem.cueLog]; },
    /** Whether a named cue has a decoded recording ready in this page. */
    hasSample: (name) => audio.hasSample(name) === true,
    /** Ammunition state per weapon, whether held or racked. */
    ammo: () => Object.fromEntries(
      WEAPON_ORDER.map((id) => [id, weaponSystem.firearm(id).snapshot()]),
    ),
    /** The ammunition counter's own DOM, so "displayed" can be asserted. */
    hudText: () => (ammoEl && !ammoEl.classList.contains('hidden')
      ? `${ammoNameEl.textContent} ${ammoMagEl.textContent}/${ammoReserveEl.textContent} ${ammoStateEl.textContent}`.trim()
      : null),
    /** Whether every one of the six models is really in the scene graph. */
    models: () => WEAPON_ORDER.map((id) => {
      const stand = armory.stands.get(id);
      if (!stand) return { id, present: false };
      const gun = stand.built.copies[0]?.gun;
      let meshes = 0;
      gun?.traverse((o) => { if (o.isMesh) meshes++; });
      /* Where the first copy actually hangs, in world space. A verifier has
       * to be able to STAND IN FRONT OF ONE and look at it; guessing from the
       * rack's centre puts the crosshair in the gap between two pistols. */
      const at = gun ? gun.getWorldPosition(new THREE.Vector3()) : null;
      return {
        id,
        present: true,
        copies: stand.built.copies.length,
        meshes,
        hasMagazine: !!gun?.userData.magazine,
        muzzle: !!gun?.userData.muzzle,
        at: at ? { x: at.x, y: at.y, z: at.z } : null,
      };
    }),
  },
  poolSkirt: grounds.props.poolPatio.skirt,
  poolRect: { ...grounds.props.poolPatio.pool },
  loungeBay: { ...grounds.shell.loungeBay },
  westWing: { ...grounds.shell.westWing },
  basementWing: { ...grounds.shell.basementWing },
  /** The rear garden: the walls, the maze's own grid, and the solved route
   * through it. tools/verify-mansion.mjs walks `garden.maze.route` on foot
   * and measures `garden.maze.corridor` -- see the maze note in
   * MansionGrounds.js for why the route is exported rather than guessed. */
  garden: {
    wall: grounds.props.rearGarden.wall,
    rect: grounds.props.rearGarden.rect,
    pavilion: grounds.props.rearGarden.pavilion,
    roseGarden: grounds.props.rearGarden.roseGarden,
    firePit: grounds.props.rearGarden.firePit,
    lanterns: grounds.props.rearGarden.lanternCount,
    maze: {
      rect: grounds.props.rearGarden.maze.rect,
      cell: grounds.props.rearGarden.maze.cell,
      corridor: grounds.props.rearGarden.maze.corridor,
      walls: grounds.props.rearGarden.maze.walls,
      entry: grounds.props.rearGarden.maze.entry,
      exit: grounds.props.rearGarden.maze.exit,
      heart: grounds.props.rearGarden.maze.heart,
      route: grounds.props.rearGarden.maze.route,
    },
  },
  /** THE GREAT INCLUDER: where it stands, how big it is, and what it says. */
  greatIncluder: {
    engraving: interior.props.trophyHall.engraving,
    dais: interior.props.trophyHall.dais,
    get height() {
      const b = new THREE.Box3().setFromObject(interior.props.trophyHall.trophy);
      return Number((b.max.y - b.min.y).toFixed(3));
    },
    get top() {
      const b = new THREE.Box3().setFromObject(interior.props.trophyHall.trophy);
      return Number(b.max.y.toFixed(3));
    },
  },
  /** The lower level's five PCs and their logo'd chairs. */
  lan: {
    stations: interior.props.lanRoom.stations.length,
    chairLogos: interior.props.lanRoom.chairBacks.length,
  },
  /** The theatre's projector, and whether the film seam is wired. */
  theatre: theatreTv ? {
    get on() { return theatreTv.on; },
    get channel() { return theatreTv.channel.name; },
    channels: theatreTv.channels.map((c) => c.name),
    toggle: () => theatreTv.toggle(),
  } : null,
  /** PROJECT SILENT SQUATCH, or null in a house with no laboratory in it.
   * Every beat of the mission is reachable from here, which is how a verifier
   * plays it without a mouse. */
  mission: silentSquatch?.debug ?? null,
  teleport,
  /** Step the simulation without a real animation frame -- for headless verification. */
  tick(seconds = 1, step = 1 / 60) {
    for (let elapsed = 0; elapsed < seconds; elapsed += step) {
      updateGame(Math.min(step, seconds - elapsed));
    }
  },
  /** Headless-verification only: suspend/resume the render loop. */
  setRendering(on) { renderEnabled = !!on; },
  get framesRendered() { return framesRendered; },
  get running() { return running; },
  get paused() { return sharedPauseMenu.isPaused(); },
};

/*
 * ======================================================================
 * DOM CONTRACT for the Entry phase's mansion.html -- exactly these six
 * element ids, nothing else required:
 *
 *   #menu         Full-page start overlay, visible by default. Gets
 *                 `.hidden` added the moment the tour begins (click, or a
 *                 debug `teleport()` call).
 *   #startBtn     Button/element inside #menu; its click event is the user
 *                 gesture that unlocks AudioContext + pointer lock.
 *   #prompt       The interact-prompt container. Should start with class
 *                 "hidden" (nothing is looked at yet). Toggled by
 *                 showPrompt()/hidePrompt() above.
 *   #promptKey    Text node inside #prompt for the key hint (e.g. "E").
 *   #promptLabel  Element inside #prompt whose innerHTML is the look
 *                 label (labels may contain simple inline tags like <b>,
 *                 matching every other scene's InteractionSystem usage).
 *   #promptHold   A fill/bar element whose inline `style.width` is driven
 *                 0%-100% while a hold-to-use interaction is in progress
 *                 (unused by this pass's props, since none of them define
 *                 `hold`, but InteractionSystem always calls setHold(), so
 *                 the element must exist).
 *
 * A plain `.hidden { display: none; }` rule is required (this file only
 * ever toggles that class name). `createPauseMenu()` needs no HTML at all
 * -- it builds and appends its own DOM tree the first time it's called.
 * ======================================================================
 */
