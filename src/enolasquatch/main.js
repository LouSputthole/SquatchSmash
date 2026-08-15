/**
 * The Enola Squatch — boot, wiring, and the frame.
 *
 * A canonical campaign scene with a save-free preview entry. Its flight model
 * remains a standalone sibling of `beefrun.html`, while the narrow final-arc
 * runtime seam owns only checkpoints, completion, and page transitions.
 * Modeled closely on `src/beefrun/main.js`'s
 * composition-root pattern (renderer/scene/camera setup, how it wires
 * AircraftPhysics/EngineSystem/CameraManager/FlightInput/WeatherSystem/
 * DetectionSystem/MissionController/FlightHud together and drives them in the
 * render loop, its pause/restart/checkpoint wiring, its console debug-handle
 * convention). It is simplified where this mission genuinely has less going
 * on — no crate-based cargo and no terrain streaming —
 * but as of 2026-08-04 it is NOT simplified in the way this comment used to
 * claim: the scene now opens with an on-foot walkaround, so `Player`,
 * `InteractionSystem` and a real boarding step are all wired here, the same
 * three pieces `src/beefrun/main.js` uses on the apron. The frame loop
 * branches on `mission.inCockpit` exactly the way the Beef Run's does.
 *
 * ---------------------------------------------------------------------------
 * The eastbound terrain-height problem (read this before touching the ground
 * functions below):
 *
 * `src/beefrun/terrain.js`'s `terrainHeight(x, z)` bands its noise by `z`
 * against Beef Run's own southbound `ZONES` and is not parameterized — it has
 * no idea `ZONES_EAST` exists. The prior phase's `approxGroundHeight(x)` in
 * `mission/MissionController.js` is an honest, clearly-flagged stand-in: one
 * flat number per `ZONES_EAST` band, "good enough to sit props on... not good
 * enough to fly an approach against." Shipping that as the mission's ONLY
 * ground function would make the detection corridor's "duck under the
 * ridgeline" beat (`detect.corridor`) a lie — there would be no ridgeline,
 * just a flat floor — and would leave the compound's bombing run flying over
 * dead-flat ground with no real approach to read. That is the "unfair /
 * unplayable" outcome the phase brief warns against, so this file does not
 * ship it as the mission's only ground reference.
 *
 * Building a full second `TerrainStreamingSystem` (chunked, LOD'd, streamed
 * around the aircraft) would duplicate a few hundred lines of an
 * already-proven system for a route that is a one-way corridor, not an open
 * world — the aircraft only ever needs ground under roughly a 10 km x 5 km
 * box, once, not an infinite streamed field. So this file builds a REAL,
 * non-flat heightfield for the eastbound leg (`rawEastHeight`, below): the
 * same "blend fbm and ridged noise per zone" technique `terrainHeight` itself
 * uses, just banded by `x` (per `ZONES_EAST`) instead of `z`, plus a flattened
 * bowl around `(TARGET_X, COMPOUND.z)` per the safety note at the end of
 * `config.js`. Near the airfield and through the existing climb-out/turn
 * corridor (`x` within ~1400 m of `WP.x`), `groundHeightCombined` blends INTO
 * Beef Run's own `terrainHeight` instead of replacing it — that corridor is
 * already hand-carved safe ground (the "outbound" carve documented in
 * `config.js`) and re-deriving it would be pure risk for no benefit. One
 * static, non-streamed visual mesh (`buildEastGround`, below) is built once
 * from the SAME combined function, so what the player flies over always
 * matches what they collide with — no streamed-chunk seam, no double ground.
 *
 * Known, deliberately-unaddressed limitation: `DetectionSystem.exposureAt()`
 * and `WeatherSystem.sampleAir()` both import Beef Run's own `terrainHeight`
 * directly at module scope (not injectable — confirmed by reading both
 * files), so the corridor's "hide under the ridge" stealth check and the
 * mountain-wave turbulence term react to BEEF RUN's southbound terrain shape
 * sampled at this mission's (x, z), not to `groundHeightCombined`'s real
 * eastbound ridges. That mismatch is baked into two reused, unmodifiable
 * files and predates this phase; it is not silently papered over here, it is
 * flagged. It still produces a real (non-flat) noise field, so the mechanic
 * functions — it just is not flying over the terrain the player can see.
 * ---------------------------------------------------------------------------
 */
import * as THREE from 'three';

import { Hud } from '../core/hud.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import { attachPixelRatio, PIXEL_RATIO_CAP_HEAVY } from '../core/pixel-ratio.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
import { PostFX } from '../core/postfx.js';
import { roomEnvironment } from '../world/textures.js';
import { resolveGear } from '../world/gear.js';

import { WP, ZONES } from '../beefrun/config.js';
import { buildAirfield } from '../beefrun/airfield.js';
import { terrainHeight } from '../beefrun/terrain.js';
import { AircraftPhysics } from '../beefrun/physics.js';
import { EngineSystem } from '../beefrun/engines.js';
import { WeatherSystem } from '../beefrun/weather.js';
import { DetectionSystem } from '../beefrun/detection.js';
import { FlightHud } from '../beefrun/hud.js';
import { CameraManager } from '../beefrun/cameras.js';
import { FlightInput } from '../beefrun/input.js';
import {
  clamp, lerp, smoothstep, fbm, ridged, rng, solid, boxGeo, coneGeo, mesh, group,
} from '../beefrun/util.js';

import {
  AC_ENOLA, TURN_POINT, ZONES_EAST, LANDMARKS_EAST, TARGET_X, ENOLA_PARKING, CRATER,
  TARGET_CITY, LIVE_FIRE,
} from './config.js';
import { EnolaSquatch } from './scenes/EnolaSquatch.js';
import { TargetCity, craterOffset, riverCarve } from './scenes/TargetCity.js';
import { FatSquatch } from './payload/FatSquatch.js';
import { DialogueSystem } from './dialogue/DialogueSystem.js';
import { RELEASE_LINES } from './dialogue/script.js';
import { MissionController } from './mission/MissionController.js';
import {
  blastLuminance, blastWhiteout, shockRadiusAt, shellOpacity, shockPass,
} from './vfx/Detonation.js';
import { EnolaPreflight, syncInteractionTargetMatrices } from './preflight.js';
import { buildAirfieldScenery } from './airfield-scenery.js';
import { createCrew, makeToolCart } from './crew.js';
import { EnolaAudioEngine, EnolaMissionAudio } from './audio.js';
import { isPreviewMode } from '../core/preview-mode.js';
import { SCENE_IDS, createCampaign } from '../core/campaign.js';
import {
  createFinalArcRuntimeSession,
  restoreCompletedFinalArcEntry,
} from '../core/final-arc-runtime.js';
import { createEnolaSquatchCampaignStory } from '../core/final-arc-story.js';
import {
  enolaCompletionReportFromSave,
  enolaResumePlan,
} from './campaign.js';
import {
  createFinalArcLoadout,
  FINAL_ARC_WEAPON_CATALOG,
  FINAL_ARC_SLOT_COUNT,
} from '../core/final-arc-loadout.js';

const CORRIDOR = LANDMARKS_EAST.find((l) => l.id === 'corridor');
const COMPOUND = LANDMARKS_EAST.find((l) => l.id === 'compound');
const RETURN_HEADING = (TURN_POINT.newHeading + 180) % 360;
/* Beef Run's own palette for the ground Whispering Pines stands on — see the
 * colour blend in `buildEastGround()`. */
const PINES_ZONE = ZONES.find((z) => z.id === 'pines');

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const overlay = $('overlay');
const startBtn = $('start-btn');
const loading = $('loading');

/* ------------------------------------------------------------------ */
/* Preview checkpoint shortcuts (?checkpoint=...)                      */
/*
 * LOCAL support only, deliberately — this does not go through
 * `src/core/preview-mode.js`. That module's `previewCheckpointForLocation`
 * is Heist's own vocabulary (`safehouse`/`bank_lobby`/…) with no idea this
 * page exists, and its sibling `previewBeefRunCheckpointForLocation` is
 * hard-scoped to `beefrun.html` by pathname — neither can be taught a third
 * scene's checkpoints without changing a file both other scenes depend on.
 * `src/beefrun/main.js` shows the pattern this mirrors: a page-local const
 * computed once at boot, consulted by the Start handler below.
 *
 * The mission's REAL, SAVEABLE checkpoints are the four in `CHECKPOINTS`
 * (./config.js) — `takeoff` / `turnOnCourse` / `preRelease` / `return` — the
 * only points `MissionController.restoreCheckpoint()` can stage without a
 * prior playthrough. This page's own `go(phase)` helper (below — built for
 * `tools/verify-enolasquatch.mjs` and for driving the mission from the
 * console) already knows how to reach every phase of the mission this way,
 * three of which route straight through those four checkpoints
 * (`go('cruise')` -> `restoreCheckpoint('turnOnCourse')`,
 * `go('bombApproach')` -> `restoreCheckpoint('preRelease')`, `go('return')`
 * -> `restoreCheckpoint('return')`) and the rest of which pose the airframe
 * directly. `CHECKPOINT_ALIASES` below is the shareable-link vocabulary —
 * the owner's six named waypoints, mapped onto the mission's real phase
 * names rather than inventing a second one.
 */
const CHECKPOINT_ALIASES = Object.freeze({
  preflight: 'preflight',       // in the seat, engines not yet started
  takeoff: 'takeoff',           // lined up on the runway — a real CHECKPOINTS entry
  flak: 'defense',              // over the corridor, into the flak/fighter stretch
  bombrun: 'bombApproach',      // final approach on Squatchbourg — a real CHECKPOINTS entry
  detonation: 'explosion',      // the Fat Squatch has just gone off
  return: 'return',             // outbound of the crater, flying home — a real CHECKPOINTS entry
});

const PREVIEW_CHECKPOINT_LABELS = Object.freeze({
  preflight: 'PREFLIGHT — ENGINE START',
  takeoff: 'TAKEOFF ROLL',
  defense: 'FLAK & FIGHTERS',
  bombApproach: 'BOMB RUN',
  explosion: 'DETONATION',
  return: 'RETURN LEG',
});

function previewCheckpointForLocation(locationLike = window.location) {
  // Same gate as `src/core/preview-mode.js`'s own two checkpoint parsers
  // (`previewCheckpointForLocation` for Heist, `previewBeefRunCheckpointForLocation`
  // for the Beef Run): a bare `?checkpoint=` on an ordinary link does nothing,
  // it takes `?preview=1` alongside it, so a shared preview link cannot be
  // mistaken for (or fired off from) a normal campaign entry.
  if (!isPreviewMode(locationLike)) return null;
  let params;
  try { params = new URLSearchParams(locationLike?.search || ''); } catch { return null; }
  const value = params.get('checkpoint');
  return value && Object.prototype.hasOwnProperty.call(CHECKPOINT_ALIASES, value)
    ? CHECKPOINT_ALIASES[value]
    : null;
}

/** Resolved once at boot — a real `go()` phase name, or null for the ordinary opening. */
const previewCheckpoint = previewCheckpointForLocation();
const enolaCampaignPreview = isPreviewMode();
const enolaCampaign = createFinalArcRuntimeSession({
  preview: enolaCampaignPreview,
  campaign: enolaCampaignPreview ? null : createCampaign(),
  sceneId: SCENE_IDS.ENOLA_SQUATCH,
  spawn: 'airfield',
  storyFactory: createEnolaSquatchCampaignStory,
});
const enolaRecoveryCampaign = enolaCampaign.campaign ?? createCampaign();
let enolaCampaignComplete = false;
if (previewCheckpoint) {
  const label = PREVIEW_CHECKPOINT_LABELS[previewCheckpoint] ?? previewCheckpoint;
  const tag = overlay?.querySelector('.tag');
  if (tag) tag.textContent = `Preview checkpoint: ${label}. Progress on this page is temporary.`;
  if (startBtn) startBtn.textContent = `Start at ${label.toLowerCase()}`;
}

window.__squatchStage?.('Building the Enola Squatch…');

/* ------------------------------------------------------------------ */
/* Renderer                                                           */
/* ------------------------------------------------------------------ */

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  window.__squatchFail?.('This browser cannot open WebGL', err?.message || String(err));
  throw err;
}
attachPixelRatio(renderer, { cap: PIXEL_RATIO_CAP_HEAVY });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

{
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const src = roomEnvironment();
  scene.environment = pmrem.fromEquirectangular(src).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
  src.dispose();
}

const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 15000);

/*
 * Bloom, tuned down from the apartment's defaults for the same reason NO WAKE
 * tunes it down (`src/nowake/main.js`): this is a wide-open night exterior,
 * not a small dark room. The unmodified defaults in `core/postfx.js` were set
 * against 151 emissive meshes crammed into one flat; out here the emissive
 * surfaces are Squatchbourg's lit windows and streets seen from altitude, the
 * tracer fire, the muzzle flashes and the engine-out smoke glow, and they are
 * both far more numerous and far more likely to sit above the default 0.82
 * threshold than a lamp in a room. A higher threshold and lower strength keep
 * the same restrained "just the genuinely bright things" read this scene's
 * flight already has rather than washing the whole city out. The nuclear
 * flash/shock is unaffected either way — `blastWhiteout`/`blastLuminance`
 * (./vfx/Detonation.js) are a separate CSS filter chain over the finished
 * frame, exactly as postfx.js's own header describes for the drink/mushroom
 * filters; bloom and that wash do not interact and neither replaces the
 * other. Same two knobs NO WAKE turns, same values, for the same class of
 * scene (open-air, night, distant lights) rather than an untested guess.
 */
const postfx = new PostFX(renderer, scene, camera);
postfx.enable();
if (postfx.bloom) {
  postfx.bloom.threshold = 1.18;
  postfx.bloom.strength = .25;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ */
/* Eastbound terrain — see the file header for the design decision.   */
/* ------------------------------------------------------------------ */

function zoneIndexForX(x) {
  for (let i = 0; i < ZONES_EAST.length; i++) if (x < ZONES_EAST[i].to) return i;
  return ZONES_EAST.length - 1;
}

function zoneMixX(x) {
  const i = zoneIndexForX(x);
  const edge = ZONES_EAST[i].to;
  const band = 420;
  if (i < ZONES_EAST.length - 1 && x > edge - band) {
    return { i, j: i + 1, t: smoothstep(edge - band, edge, x) };
  }
  return { i, j: i, t: 0 };
}

function zoneHeightEast(zone, x, z) {
  const s = zone.scale;
  const soft = fbm(x / s, z / s, 4);
  const sharp = ridged(x / s, z / s, 4);
  const h = lerp(soft, sharp, clamp(zone.ridge, 0, 1));
  return zone.base + h * zone.relief;
}

/** Real, non-flat eastbound heightfield — banded by `x` per `ZONES_EAST`. */
function rawEastHeight(x, z) {
  const { i, j, t } = zoneMixX(x);
  let h = t > 0
    ? lerp(zoneHeightEast(ZONES_EAST[i], x, z), zoneHeightEast(ZONES_EAST[j], x, z), t)
    : zoneHeightEast(ZONES_EAST[i], x, z);
  // The landing-pad-sized carve around the target the config.js safety note
  // asks for — flattens a bowl so the bombing run and the compound's own
  // defense props sit on sensible ground, the same way WP's own carve does
  // at the airfield.
  const dPad = Math.hypot(x - TARGET_X, (z - COMPOUND.z) * 1.3);
  const pad = smoothstep(640, 260, dPad);
  h = lerp(h, ZONES_EAST[ZONES_EAST.length - 1].base - 12, pad);
  /* Squatchbourg's river runs in a real channel rather than lying on the
   * ground as a flat blue ribbon. `riverCarve` is exported by
   * `scenes/TargetCity.js` and is the ONLY definition of that channel: the
   * city lays its water surface and its quays against the same function, so
   * what the aeroplane can hit and what the player can see are one surface.
   * See the header note above `craterOffset` for the same argument about the
   * crater. */
  h += riverCarve(x - TARGET_X, z - COMPOUND.z, TARGET_CITY);
  return h;
}

/**
 * The crater, once there is one.
 *
 * `null` until the Fat Squatch arrives, then the record `TargetCity.destroy()`
 * hands back. It is deliberately a mutable module-level binding rather than
 * something threaded through: `groundHeightCombined` is passed by reference
 * into `AircraftPhysics`, `FatSquatch.update`, `Defense` and `Targeting`
 * before the crater exists, and every one of them has to start returning the
 * new ground the moment it does. One binding they all close over is the only
 * version of this that cannot go stale in one of them.
 */
let activeCrater = null;

/**
 * The mission's one ground-height function, used for physics, targeting,
 * defense prop placement and payload impact alike — see the file header.
 * Blends from Beef Run's own carved corridor near the field into the real
 * eastbound heightfield as `x` grows past the turn point, and then drops
 * through `craterOffset()` if the target has already been hit.
 */
function groundHeightCombined(x, z) {
  const blend = smoothstep(500, 1400, x);
  let h;
  if (blend <= 0) h = terrainHeight(x, z);
  else if (blend >= 1) h = rawEastHeight(x, z);
  else h = lerp(terrainHeight(x, z), rawEastHeight(x, z), blend);
  if (activeCrater) {
    const d = Math.hypot(x - activeCrater.x, z - activeCrater.z);
    if (d < CRATER.radius + CRATER.rimWidth) h += craterOffset(d, CRATER);
  }
  return h;
}

/** One static, non-streamed ground mesh covering the whole flight envelope. */
function buildEastGround(sceneRef) {
  /* Keep drawing past the target and past the mission's 13.4 km safety
   * boundary. The old mesh ended only 1.2 km beyond Squatchbourg, so the
   * player could see the terrain fall off while making the bomb-break turn. */
  const boundsX = [-1400, 14500];
  const boundsZ = [-4200, 1000];
  const segX = 318;
  const segZ = 104;
  const width = boundsX[1] - boundsX[0];
  const depth = boundsZ[1] - boundsZ[0];
  const cx = (boundsX[0] + boundsX[1]) / 2;
  const cz = (boundsZ[0] + boundsZ[1]) / 2;

  const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const wx = cx + pos.getX(i);
    const wz = cz + pos.getZ(i);
    const h = groundHeightCombined(wx, wz);
    pos.setY(i, h);
    const zone = ZONES_EAST[zoneIndexForX(wx)];
    const groundCol = new THREE.Color(zone.ground);
    const rockCol = new THREE.Color(zone.rock);
    const hx = groundHeightCombined(wx + 10, wz) - groundHeightCombined(wx - 10, wz);
    const hz = groundHeightCombined(wx, wz + 10) - groundHeightCombined(wx, wz - 10);
    const steep = clamp(Math.hypot(hx, hz) / 26, 0, 1);
    c.copy(groundCol).lerp(rockCol, steep * 0.85);
    /* WHISPERING PINES IS GREEN. Owner: "Missing all the grass and stuff at
     * whispering pines airport." The heights already blend into Beef Run's
     * carved corridor near the field (`groundHeightCombined`, above) but the
     * COLOURS did not: every vertex within sight of the aerodrome was painted
     * `ZONES_EAST[0]`'s night-desert slate, so the Beef Run's forest airstrip
     * became a grey pan the moment this mission drew it. Blending the palette
     * over the same `x` window the height blend uses is the one-line
     * counterpart to that blend, and it means the tree scatter in
     * `./airfield-scenery.js` stands on ground the same colour as itself.
     *
     * A second, finer grass mesh laid over this one was tried first and is
     * exactly what NOT to do: two co-planar heightfields at different vertex
     * densities z-fight into speckled confetti across the whole field. One
     * ground mesh, recoloured. */
    const west = 1 - smoothstep(400, 1500, Math.hypot(wx - WP.x, 0));
    if (west > 0) {
      const near = PINES_ZONE.ground;
      c.lerp(new THREE.Color(near).lerp(new THREE.Color(PINES_ZONE.rock), steep * 0.85), west);
    }
    const tint = 0.86 + fbm(wx / 110, wz / 110, 2) * 0.28;
    c.multiplyScalar(tint);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat_ = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const groundMesh = new THREE.Mesh(geo, mat_);
  groundMesh.name = 'eastbound terrain ground';
  groundMesh.userData.boundsX = [...boundsX];
  groundMesh.userData.boundsZ = [...boundsZ];
  groundMesh.position.set(cx, 0, cz);
  groundMesh.receiveShadow = true;
  sceneRef.add(groundMesh);

  // A sparse, single-draw-call scatter of simple cone "trees/scrub" for
  // atmosphere — not a full forest system, just enough that the corridor
  // does not read as bare ground. Kept off the airfield's own footprint and
  // off the compound's landing-pad carve.
  const COUNT = 620;
  const scatterGeo = coneGeo(3, 9, 6);
  const scatterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const scatter = new THREE.InstancedMesh(scatterGeo, scatterMat, COUNT);
  scatter.name = 'eastbound terrain scatter';
  const rand = rng(0xE57A11);
  const dummy = new THREE.Object3D();
  let used = 0;
  /* Rejected candidates must not consume the visible-instance budget. The
   * old COUNT-attempt loop asked for 620 but rendered only about 214 after
   * the runway, city and zone-density filters did their work. */
  for (let attempts = 0; attempts < COUNT * 8 && used < COUNT; attempts++) {
    const wx = boundsX[0] + rand() * width;
    const wz = boundsZ[0] + rand() * depth;
    const zone = ZONES_EAST[zoneIndexForX(wx)];
    if (zone.trees <= 0) continue;
    if (rand() > zone.trees / 60) continue;
    // Clear of the runway/apron footprint and of the target's flattened pad.
    if (Math.abs(wx - WP.x) < 60 && Math.abs(wz) < WP.rwyHalf + 90) continue;
    if (wx > -160 && wx < 40 && wz > 300 && wz < 460) continue;
    if (Math.hypot(wx - TARGET_X, wz - COMPOUND.z) < TARGET_CITY.radius + 140) continue;
    const h = groundHeightCombined(wx, wz);
    dummy.position.set(wx, h + 4.2, wz);
    dummy.rotation.y = rand() * Math.PI * 2;
    const s = 0.7 + rand() * 0.8;
    dummy.scale.set(s, s, s * (0.8 + rand() * 0.6));
    dummy.updateMatrix();
    scatter.setMatrixAt(used, dummy.matrix);
    scatter.setColorAt(used, new THREE.Color(zone.tree));
    used++;
  }
  scatter.count = used;
  scatter.instanceMatrix.needsUpdate = true;
  if (scatter.instanceColor) scatter.instanceColor.needsUpdate = true;
  scatter.castShadow = false;
  sceneRef.add(scatter);

  return groundMesh;
}

const eastGround = buildEastGround(scene);
window.__squatchStage?.('Painting the desert corridor…');

/**
 * What `depressGroundForCrater()` overwrote, so a checkpoint restart before the
 * drop can put it back — `null` while there is no hole. Every entry is one
 * vertex of the coarse east ground: its index, the height it stood at and the
 * colour it was painted, taken BEFORE the crater profile was folded in.
 * Restoring from the recorded values rather than by re-running the height
 * function is what makes the undo exact: the mesh was built by sampling
 * `groundHeightCombined`, which now answers with the hole in it.
 */
let craterGroundEdits = null;

/**
 * Sink the coarse ground under the crater.
 *
 * The east ground is one static mesh at 50 m per cell — plenty for a route
 * flown at cruise altitude and far too coarse for an 1,,600 m hole, which is
 * why `TargetCity.buildCraterMesh()` builds a separate, much finer bowl. But
 * the coarse mesh is still there, flat, and would occlude the whole crater
 * from above. So: push its vertices down to just BELOW the crater's own
 * profile inside the footprint (tapering to exactly the profile at the outer
 * edge, so there is no step where they meet), and darken them, and let the
 * fine mesh be the surface the player actually looks at.
 *
 * Only the ~1,200 vertices inside the footprint are touched, out of 24,465.
 * Every one of them is recorded into `craterGroundEdits` on the way past, which
 * is what makes `raiseGroundAfterCrater()` below possible.
 */
function depressGroundForCrater(craterRecord) {
  const geo = eastGround.geometry;
  const pos = geo.attributes.position;
  const colours = geo.attributes.color;
  const ox = eastGround.position.x;
  const oz = eastGround.position.z;
  const outer = CRATER.radius + CRATER.rimWidth;
  const scorch = new THREE.Color(0x241d18);
  const c = new THREE.Color();
  const edits = [];
  let touched = 0;
  for (let i = 0; i < pos.count; i++) {
    const wx = ox + pos.getX(i);
    const wz = oz + pos.getZ(i);
    const d = Math.hypot(wx - craterRecord.x, wz - craterRecord.z);
    if (d >= outer) continue;
    edits.push({
      i,
      y: pos.getY(i),
      r: colours ? colours.getX(i) : 0,
      g: colours ? colours.getY(i) : 0,
      b: colours ? colours.getZ(i) : 0,
    });
    // 8 m of clearance in the middle, closing to nothing at the lip, so the
    // fine crater mesh always wins the depth test where it exists.
    const clearance = 8 * smoothstep(outer, outer - 140, d);
    pos.setY(i, pos.getY(i) + craterOffset(d, CRATER) - clearance);
    if (colours) {
      c.setRGB(colours.getX(i), colours.getY(i), colours.getZ(i))
        .lerp(scorch, clamp(1.15 - d / outer, 0, 1));
      colours.setXYZ(i, c.r, c.g, c.b);
    }
    touched++;
  }
  craterGroundEdits = edits;
  pos.needsUpdate = true;
  if (colours) colours.needsUpdate = true;
  geo.computeVertexNormals();
  return touched;
}

/** Fill the hole in again — the undo for `depressGroundForCrater()`. */
function raiseGroundAfterCrater() {
  const edits = craterGroundEdits;
  craterGroundEdits = null;
  if (!edits?.length) return 0;
  const geo = eastGround.geometry;
  const pos = geo.attributes.position;
  const colours = geo.attributes.color;
  for (const e of edits) {
    pos.setY(e.i, e.y);
    if (colours) colours.setXYZ(e.i, e.r, e.g, e.b);
  }
  pos.needsUpdate = true;
  if (colours) colours.needsUpdate = true;
  geo.computeVertexNormals();
  return edits.length;
}

/* ------------------------------------------------------------------ */
/* Systems                                                            */
/* ------------------------------------------------------------------ */

const hud = new Hud();
const flightHud = new FlightHud();
const finalArcLoadout = createFinalArcLoadout();
function paintDurableCarry() {
  hud.setInventory({
    slots: FINAL_ARC_SLOT_COUNT,
    items: finalArcLoadout.items,
    selected: finalArcLoadout.selected,
  }, FINAL_ARC_WEAPON_CATALOG);
}
paintDurableCarry();

const audio = new EnolaAudioEngine();
const missionAudio = new EnolaMissionAudio(audio);
missionAudio.takeoffAnthemFile = 'fortunate-son.mp3';
missionAudio.takeoffAnthemOptions = { volume: 0.435, cutAt: 150, cutFade: 4 };

const airfield = buildAirfield(scene, {});

/* The grass, the treeline and the tufts. Owner: "Missing all the grass and
 * stuff at whispering pines airport." `buildAirfield` was always here — the
 * hangar, the runway, the windsock, the beacon — but the GROUND it stands on
 * came from `buildEastGround` below, a single 50 m-per-segment route mesh with
 * no scatter, where the Beef Run gets a streamed forest. See
 * `./airfield-scenery.js` for why this dresses the field rather than running a
 * second terrain system over it. */
window.__squatchStage?.('Planting Whispering Pines…');
const airfieldScenery = buildAirfieldScenery(scene, { getHeight: (x, z) => groundHeightCombined(x, z) });

/* On foot, for the opening walkaround only. Same three pieces the Beef Run
 * uses on the apron — `InteractionSystem`, `Player`, and a `world` whose
 * `groundAt` is this mission's own heightfield — and after boarding the player
 * is frozen and the interaction system paused, exactly as over there. */
const interaction = new InteractionSystem(camera, hud);
const world = { colliders: [...airfield.colliders], floorZones: [...airfield.floorZones], groundAt: groundHeightCombined };
const player = new Player(camera, world);
player.mode = 'walk';
player.onFootstep = (surface, intensity) => audio.footstep?.(surface, intensity);

const physics = new AircraftPhysics({ getHeight: groundHeightCombined, ac: AC_ENOLA });
const engines = new EngineSystem({ ac: AC_ENOLA, engineNames: ['outerLeft', 'innerLeft', 'innerRight', 'outerRight'] });
physics.engines = engines;

const aircraft = new EnolaSquatch();
scene.add(aircraft.group);

const payload = new FatSquatch();
aircraft.anchors.payloadMount.add(payload.group);

/* The club's crest, onto the aeroplane's four badges and the bomb's two.
 * Owner: "Aircraft is nice. Needs Squatch logo." + "Squatch logo on the bomb
 * too." `crest.round` is an EXISTING art slot pointing at the existing
 * `assets/art/logo-crest.png` (see `assets/art/manifest.json`), so no new art
 * and no manifest change; if the file ever goes missing, `resolveGear` hands
 * back its own drawn placeholder and the badges simply keep the drawn crest
 * they were built with. Fire-and-forget on purpose — nothing waits for it. */
/* The owner's pin-up and name paintings are owned by `EnolaSquatch.artReady`.
 * They are delivered direct files with a crop/matte pipeline, not gear slots;
 * keeping a second optional `resolveGear('enolasquatch.noseart')` path here was
 * stale telemetry and always reported zero after the real paintings landed. */
let clubLogoBadges = 0;
resolveGear(['crest.round'])
  .then((gear) => {
    const tex = gear.get('crest.round')?.texture;
    clubLogoBadges = aircraft.applyClubLogo(tex) + payload.applyClubLogo(tex);
  })
  .catch(() => { /* the drawn crest is already on every badge */ });

/* Squatchbourg. Built once, up front: six districts, a river with three
 * crossings, a marshalling yard, heavy industry and twenty-odd landmarks, all
 * of it instanced down to about twenty draw calls that never change until the
 * blast wave starts taking them away — see the budget note at the top of
 * `scenes/TargetCity.js` and `scenes/PartKit.js` for how the landmarks cost
 * four draw calls instead of two hundred. `city.stats()` reports the real
 * numbers and `tools/verify-enolasquatch.mjs` measures a real render. */
window.__squatchStage?.('Laying out Squatchbourg…');
const city = new TargetCity(scene, {
  x: TARGET_X,
  z: COMPOUND.z,
  getHeight: (x, z) => groundHeightCombined(x, z),
});

/* The crew, and Numbskull's tool cart under the bomb bay. */
const crew = createCrew();
const toolCart = makeToolCart();
scene.add(toolCart);
{
  const elev = groundHeightCombined(ENOLA_PARKING.x, ENOLA_PARKING.z);
  toolCart.position.set(ENOLA_PARKING.x + 3.2, elev, ENOLA_PARKING.z - 2.4);
  toolCart.rotation.y = 0.6;
}

/* `?airSeed=<number>` pins the gust field so a verifier flies the same air
 * every run (docs/ENGINE-TRAPS.md entry 7). Absent — every normal flight —
 * the weather seeds itself randomly, as it always has. */
const airSeedRaw = new URLSearchParams(window.location.search).get('airSeed');
const airSeed = airSeedRaw === null ? null : Number(airSeedRaw);
const weather = new WeatherSystem(scene, renderer, {
  seed: Number.isFinite(airSeed) ? airSeed : null,
});
// No towers along this route — see the report on this phase for why (no
// eastbound landmark-prop builder exists to reuse or build in this phase's
// scope). DetectionSystem's tower-proximity term simply never contributes;
// exposure/patrol-aircraft proximity still drive the stealth meter.
const detection = new DetectionSystem(scene, { towers: [] });
const cameras = new CameraManager(camera);
const input = new FlightInput();
input.rudderKeys = true; // always in the cockpit — no on-foot 'E' to share Q/E with.

/* ------------------------------------------------------------------ */
/* Eastbound fog                                                      */
/*
 * `ZONES_EAST` carries an authored fog colour and near/far pair for each band
 * of the route — dark blues through the mountain corridor, a silvered cloud
 * bank, then the compound's warm dark. Until now NONE of it reached the
 * screen: `WeatherSystem` (reused unmodified from the Beef Run) sets
 * `scene.fog` from `zonePalette(focus.z)`, which bands Beef Run's OWN
 * southbound `ZONES` by z. This route flies east at z ~ -500, which lands in
 * Beef Run's `pines` zone for its whole length — so the desert compound, the
 * target city and the crater were all being rendered through Whispering
 * Pines' pale-blue daylight fog with a 2.6 km cut, at night.
 *
 * This is the same class of mismatch the file header already flags for
 * `DetectionSystem.exposureAt()` and `WeatherSystem.sampleAir()`, and the same
 * reason applies: those two read Beef Run's terrain at module scope and cannot
 * be injected. Fog can be, because it is just three fields on the scene, so
 * this corrects the one that is visible in every frame.
 *
 * Only the FOG is overridden, never `scene.background` — the weather system
 * writes the background every frame to drive its lightning flash, and taking
 * that over would put the storm out. It is also faded in over the same
 * `x` window `groundHeightCombined` uses to blend into the eastbound
 * heightfield, so the airfield end of the route keeps Beef Run's own look.
 */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Nightfall lighting                                                  */
/*
 * `WeatherSystem.night` (reused unmodified from the Beef Run) darkens the SKY
 * and the FOG toward near-black, and nothing else: the sun and hemisphere
 * intensities it drives every frame are functions of `dusk` alone, bottoming
 * out at 0.75 and 0.8. So a mission that sets `night: 1` gets a black sky over
 * a landscape still lit like six in the evening — which is what the whole
 * eastbound leg of this raid looked like, and what the new nightfall cut would
 * have cut TO if this were not here.
 *
 * Correcting it inside `weather.js` would mean changing a file the Beef Run
 * shares, so this scales the two lights from this mission's own frame instead,
 * after `weather.update()` has written them. Beef Run never sets `night`, and
 * nothing here runs in Beef Run's frame either way.
 *
 * Floors, not zeroes. A night raid the player cannot fly is not atmosphere: at
 * full night the ground keeps about a fifth of its light and the hemisphere
 * goes cold blue, which is enough to read terrain, the runway lamps, the
 * compound and the crater against.
 */
/* ------------------------------------------------------------------ */

const _nightHemi = new THREE.Color(0x1c2740);
const _moonlight = new THREE.Color(0x8fa6d9);

/**
 * Applied every frame AFTER `weather.update()`, which is what makes it a
 * fixed blend rather than a damped one: the weather system recomputes both
 * lights from scratch each frame, so this re-tints that fresh value instead of
 * chasing it. Damping toward night here would just fight the weather system's
 * own damping toward day and settle halfway.
 */
function applyNight() {
  const n = clamp(weather.night ?? 0, 0, 1);
  if (n <= 0) return;
  weather.sun.intensity *= lerp(1, 0.21, n);
  weather.hemi.intensity *= lerp(1, 0.27, n);
  // Moonlight is blue and comes from nowhere in particular.
  weather.hemi.color.lerp(_nightHemi, 0.8 * n);
  weather.sun.color.lerp(_moonlight, 0.7 * n);
}

const _fogColour = new THREE.Color();

function applyEastFog(x, dt) {
  const fog = scene.fog;
  if (!fog) return;
  const east = smoothstep(500, 1400, x);
  if (east <= 0) return;
  const { i, j, t } = zoneMixX(x);
  const a = ZONES_EAST[i];
  const b = ZONES_EAST[j];
  _fogColour.set(a.fog).lerp(new THREE.Color(b.fog), t);
  const near = lerp(a.fogNear, b.fogNear, t);
  const far = lerp(a.fogFar, b.fogFar, t);
  // Damped, so crossing a zone edge is a drift rather than a cut, and scaled
  // by `east` so it hands over from the weather system rather than snapping.
  const k = clamp(dt * 1.2 * east, 0, 1);
  fog.color.lerp(_fogColour, k);
  fog.near = lerp(fog.near, near, k);
  fog.far = lerp(fog.far, far, k);
}

const dialogue = new DialogueSystem(hud, {
  audio: missionAudio,
  // The right man's head bobs when his line plays — the same hook Beef Run
  // uses for Lou and Cecilio, just with four people on the circuit.
  /* `DialogueSystem.update` plays the take and THEN calls this, so the take is
   * already under way and the mouth can run on it rather than on the hold. */
  onLine: (line) => crew.speak(line.who, (line.hold ?? 2) * 0.8, missionAudio.voiceTake()),
});

const preflight = new EnolaPreflight({
  scene, interaction, aircraft, payload, dialogue, crew, audio: missionAudio,
});

const mission = new MissionController({
  scene, camera, physics, engines, aircraft, payload, weather, detection,
  airfield, flightHud, hud, dialogue, input, cameras,
  audio: missionAudio,
  player, interaction, preflight, crew, city,
  getHeight: groundHeightCombined,
});
/* The static airfield boxes cannot represent a rotated aircraft with working
 * doors. Player already exposes a scene-local resolver seam; keep it wired to
 * the real current door/bay state during the walkaround. */
world.resolvePlayer = (walker, axis, radius) => aircraft.resolveWalkaroundPlayer(
  walker, axis, radius, {
    crewDoorOpen: aircraft.crewDoorOpen,
    bombBayOpen: mission.bombBayOpen,
  },
);
mission.onCheckpoint = (id, snapshot) => {
  enolaCampaign.checkpoint(id, {
    payloadReleased: snapshot?.payloadReleased === true,
    checkpointSnapshot: snapshot,
  });
};
// Defense/Targeting are created internally by MissionController when the ctx
// omits them (see its constructor) — using our own `getHeight` closure. The
// debug handle below reads them back off `mission` rather than constructing
// duplicate instances.

/* The one wire that keeps the crater honest: the mission tells us the hole
 * exists, we fold it into the ground function every other system already holds
 * a reference to, and we sink the coarse ground mesh under the fine one.
 *
 * It runs in BOTH directions now. `MissionController.restoreCheckpoint()` calls
 * it with `null` when a restart before the drop puts Squatchbourg back
 * (`TargetCity.restore()`), because the city is only two thirds of the hole:
 * the rest is this module's `activeCrater` — which `groundHeightCombined` folds
 * into every height query physics, the payload, the defense props and the
 * targeting all make — and the sunken, scorched vertices in the coarse east
 * ground mesh. Rebuilding the city without undoing those two would stand a
 * restored Squatchbourg in the air over a hundred-metre pit. */
mission.onCrater = (crater) => {
  if (crater) {
    activeCrater = crater;
    depressGroundForCrater(crater);
  } else {
    activeCrater = null;
    raiseGroundAfterCrater();
  }
};

function showEnolaCompletion(report, {
  campaignComplete = false,
  playSting = false,
} = {}) {
  if (!report) return false;
  enolaCampaignComplete ||= campaignComplete;
  flightHud.showComplete(report);
  if (playSting) missionAudio.sting?.();
  // The title overlay has a higher stacking level than FlightHud's established
  // report card. A completed reload has not passed through the ordinary Start
  // tail, so hide the title here as part of restoring that same local UI.
  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  if (enolaCampaignComplete) {
    const continueBtn = $('es-again');
    if (continueBtn) continueBtn.textContent = "Return to Lou's mansion";
  }
  return true;
}

mission.onComplete = (report) => {
  enolaCampaignComplete ||= enolaCampaign.complete({
    ...report,
    payloadReleased: mission.payloadReleased,
    returnedHome: true,
  });
  showEnolaCompletion(report, {
    campaignComplete: enolaCampaignComplete,
    playSting: true,
  });
};

/* ------------------------------------------------------------------ */
/* Preflight checklist — see the phase report for why this is advisory  */
/* rather than a hard gate (MissionController.updatePreflight's own gate  */
/* — battery, fuel, all four engines, parking brake — is fixed code from  */
/* the prior phase and out of this phase's edit scope).                  */
/* ------------------------------------------------------------------ */

let _checklistShown = false;
function updatePreflightChecklist() {
  /* Two phases own this widget now: `walkaround` fills it from
   * `EnolaPreflight.checklist` (the mission does that in its own update, off
   * the six real checks), and `preflight` fills it from the start-up state
   * below. It stays on screen across the boarding transition, which is right —
   * the walkaround's rows are still true once you are in the seat. */
  const wants = mission.phase === 'preflight' || mission.phase === 'walkaround';
  if (wants !== _checklistShown) {
    _checklistShown = wants;
    flightHud.showChecklist(wants);
  }
  if (mission.phase !== 'preflight') return;
  const rows = [
    { label: 'Battery & fuel selectors on', state: (engines.masterBattery && engines.fuelSelectors) ? 'done' : 'todo' },
    { label: 'Payload restraints checked', state: dialogue.seen('preflight.restraints') ? 'done' : 'todo' },
    { label: 'Bomb-bay panel checked', state: dialogue.seen('preflight.bombbay') ? 'done' : 'todo' },
    { label: 'All four engines running', state: engines.engines.every((e) => e.running) ? 'done' : 'todo' },
    { label: 'Parking brake released', state: !physics.controls.parkingBrake ? 'done' : 'todo' },
  ];
  if (!rows.some((r) => r.state === 'next')) {
    const firstTodo = rows.find((r) => r.state === 'todo');
    if (firstTodo) firstTodo.state = 'next';
  }
  flightHud.setChecklist(rows);
}

/* ------------------------------------------------------------------ */
/* Engine bank readout — FlightHud.setEngines() reads exactly two slots  */
/* (#br-eng-l / #br-eng-r), a fixed 2-engine display baked into the      */
/* reused, unmodifiable hud.js. Rather than build brand-new 4-slot HTML  */
/* (and bypass FlightHud entirely for engines), this shows each SIDE's   */
/* worse-of-the-pair status/temperature — "outer+inner left bank" and    */
/* "outer+inner right bank" — a legible simplification for a 4-engine    */
/* aircraft on a 2-slot panel, flagged clearly in this phase's report.   */
/* ------------------------------------------------------------------ */

const STATUS_RANK = { OK: 0, OFF: 1, CRANK: 2, ROUGH: 3, HOT: 4, DEAD: 5 };
function engineHudView(realEngines) {
  const pairs = [[0, 1], [2, 3]];
  return {
    engines: pairs.map(([a, b]) => ({ temp: Math.max(realEngines.engines[a].temp, realEngines.engines[b].temp) })),
    status(i) {
      const [a, b] = pairs[i];
      const sa = realEngines.status(a);
      const sb = realEngines.status(b);
      return STATUS_RANK[sa] >= STATUS_RANK[sb] ? sa : sb;
    },
  };
}

let _cargoText = null;
function updateCargoReadout() {
  const el = flightHud.cargo;
  if (!el) return;
  const text = mission.payloadReleased ? 'FAT SQUATCH — RELEASED' : 'FAT SQUATCH ABOARD';
  if (text !== _cargoText) { _cargoText = text; el.textContent = text; }
}

/* ------------------------------------------------------------------ */
/* The 1-5 release-line choice and the 3-option emergency choice.        */
/*
 * Note on the emergency choice: the phase brief for MissionController
 * describes "a player choice matching the brief's 5 options" for this beat,
 * but `chooseEmergencyResponse()` (built in the prior, now-fixed phase) only
 * implements three — 'baby', 'push', 'shutdown' — matching what
 * `dialogue/script.js`'s `emergency.*` beats actually narrate. This file
 * wires exactly those three rather than inventing two more the dialogue
 * never speaks to, for the same reason the prior phase gave.
 */
/* ------------------------------------------------------------------ */

const EMERGENCY_OPTIONS = [
  { key: '1', text: 'Baby the throttle back — long way home.' },
  { key: '2', text: 'Push it and hope.' },
  { key: '3', text: 'Shut it down.' },
];

const choicePanel = $('es-choice');
const choiceOptionsEl = $('es-choice-options');

function currentChoice() {
  // MissionController tracks its own release/emergency sub-state on
  // underscore-prefixed instance fields with no public getter — read-only
  // access from here (never written directly; every state change still goes
  // through `chooseReleaseLine`/`chooseEmergencyResponse`) is the pragmatic
  // choice given `mission/MissionController.js` is fixed code this phase does
  // not edit.
  if (mission.phase === 'release' && mission._releaseStep === 'awaitChoice') {
    return { id: 'release', options: RELEASE_LINES.map((l) => ({ key: l.key, text: l.text })) };
  }
  if (mission.phase === 'emergency' && !mission._emergencyResolved) {
    return { id: 'emergency', options: EMERGENCY_OPTIONS };
  }
  return null;
}

let _choiceSig = null;
function updateChoicePanel() {
  if (!choicePanel || !choiceOptionsEl) return;
  const choice = currentChoice();
  const sig = choice ? `${choice.id}:${choice.options.length}` : null;
  if (sig === _choiceSig) return;
  _choiceSig = sig;
  if (!choice) { choicePanel.classList.remove('show'); return; }
  choiceOptionsEl.replaceChildren(...choice.options.map((o) => {
    const row = document.createElement('div');
    row.className = 'es-choice-row';
    row.innerHTML = `<span class="key">${o.key}</span><span class="txt">${o.text}</span>`;
    return row;
  }));
  choicePanel.classList.add('show');
}

function handleMissionChoiceKey(code) {
  const m = /^Digit([1-5])$/.exec(code);
  if (!m) return;
  const digit = m[1];
  if (mission.phase === 'release' && mission._releaseStep === 'awaitChoice') {
    mission.chooseReleaseLine(digit);
  } else if (mission.phase === 'emergency' && !mission._emergencyResolved) {
    const map = { 1: 'baby', 2: 'push', 3: 'shutdown' };
    if (map[digit]) mission.chooseEmergencyResponse(map[digit]);
  }
}

/* ------------------------------------------------------------------ */
/* Auto-started engines: the dialogue ('preflight.engineStart') has      */
/* Captain Sasole start engines one and two himself, and hands three and  */
/* four to Prospect. Digit1/Digit2 (FlightInput's existing 'startLeft'/    */
/* 'startRight' action names, unmodified) are repointed at engine indices  */
/* 2/3 ("three"/"four") below; engines 0/1 crank themselves once the       */
/* battery and fuel selectors are both live.                              */
/* ------------------------------------------------------------------ */

let _autoStartBeganAt = null;
function autoStartCaptainEngines() {
  if (mission.phase !== 'preflight' || !(engines.masterBattery && engines.fuelSelectors)) {
    _autoStartBeganAt = null;
    return;
  }
  if (_autoStartBeganAt === null) _autoStartBeganAt = mission.phaseTime;
  const elapsed = mission.phaseTime - _autoStartBeganAt;
  if (elapsed > 0.6 && !engines.engines[0].running && !engines.engines[0].dead) engines.crank(0);
  if (elapsed > 2.4 && !engines.engines[1].running && !engines.engines[1].dead) engines.crank(1);
}

/* ------------------------------------------------------------------ */
/* Debug / headless-test handle                                         */
/* ------------------------------------------------------------------ */

const game = { started: false, paused: true };

/* ------------------------------------------------------------------ */
/* The nightfall cut's screen                                          */
/*
 * `MissionController` owns the timing and the world state; this owns the two
 * pixels of DOM it needs. Built here in JS rather than added to
 * `enolasquatch.html` so the whole cut lives inside `src/enolasquatch/`, and
 * because the element is meaningless to every other phase.
 *
 * Deliberately NOT a full-black card for the whole run: the middle six seconds
 * of the cut are the real sky running down, rendered live, with the fade at
 * zero. Black is used for eight-tenths of a second, once, to cover the moment
 * the aeroplane is moved from the apron to the runway.
 */
/* ------------------------------------------------------------------ */

const cutscreen = document.createElement('div');
cutscreen.id = 'enola-cutscene';
cutscreen.style.cssText = [
  'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:40',
  'display:none', 'opacity:1',
].join(';');
const cutFade = document.createElement('div');
cutFade.style.cssText = 'position:absolute;inset:0;background:#05050a;opacity:0';
const cutBars = document.createElement('div');
cutBars.style.cssText = [
  'position:absolute', 'inset:0',
  'background:linear-gradient(#05050a 0 9%,transparent 9% 91%,#05050a 91% 100%)',
].join(';');
/* The location card sits under the TOP letterbox bar, not above the bottom
 * one: the dialogue subtitles live at the bottom of the screen and the first
 * cut of this put the caption straight through them. */
const cutText = document.createElement('div');
cutText.style.cssText = [
  'position:absolute', 'left:0', 'right:0', 'top:15%', 'text-align:center',
  'font:600 26px/1.25 "Trebuchet MS",system-ui,sans-serif',
  'letter-spacing:0.18em', 'color:#e8c86a', 'text-shadow:0 2px 14px #000',
].join(';');
const cutSub = document.createElement('div');
cutSub.style.cssText = [
  'position:absolute', 'left:0', 'right:0', 'top:21%', 'text-align:center',
  'font:400 15px/1.3 "Trebuchet MS",system-ui,sans-serif',
  'letter-spacing:0.1em', 'color:#cfd4e0', 'text-shadow:0 2px 10px #000',
].join(';');
const cutSkip = document.createElement('div');
cutSkip.style.cssText = [
  'position:absolute', 'right:26px', 'bottom:20px',
  'font:400 12px/1 "Trebuchet MS",system-ui,sans-serif',
  'letter-spacing:0.14em', 'color:#8a8f9c',
].join(';');
cutSkip.textContent = 'SPACE — SKIP';
cutscreen.append(cutFade, cutBars, cutText, cutSub, cutSkip);
document.body.appendChild(cutscreen);

/* ------------------------------------------------------------------ */
/* The flash, the turret sight, and the strip that says who is flying   */
/*
 * Owner: "the flash that whites out the cockpit". `MissionController` publishes
 * `blastFlash` (0..1) and `blastTint` every frame off
 * `../vfx/Detonation.js`'s real double-pulse luminance curve; this is the two
 * pixels of DOM that draw it. It is a full-screen overlay rather than a
 * post-process because there is no EffectComposer on this page and a
 * `mix-blend-mode: screen` div does the same job for nothing.
 *
 * The reticle and the belt/heat strip only exist while the player is in the
 * tail, and the autopilot line only while the gyro has the aeroplane, so on a
 * normal flight none of this is on screen at all.
 */
/* ------------------------------------------------------------------ */

const blastscreen = document.createElement('div');
blastscreen.id = 'enola-blast';
blastscreen.style.cssText = [
  'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:45',
  'opacity:0', 'background:#ffffff', 'mix-blend-mode:screen',
].join(';');
document.body.appendChild(blastscreen);

/* THE FRONT GOING PAST. Owner: "I want a shock wave to pass you ... it needs
 * to be visible as it passes over you that way the player doesn't miss it."
 *
 * A second overlay, and it has to be a second one. The flash is LIGHT: white,
 * `screen`-blended, and it arrives the instant the bomb goes off. This is
 * PRESSURE — dust and compressed air, arriving several seconds later depending
 * entirely on how far the player got — so it is dirty rather than white, it is
 * `overlay`-blended so it dulls the picture instead of bleaching it, and it
 * comes and goes in about a second.
 *
 * `Detonation` draws the front in the world as well (the bubble the aeroplane
 * ends up inside, and the bright ring on its silhouette), and that is the real
 * effect. This exists because a player can be looking anywhere at all when the
 * front arrives, and the one thing the owner asked for is that he does not
 * miss it. A full-screen sweep is true from every heading. */
const washscreen = document.createElement('div');
washscreen.id = 'enola-shock';
washscreen.style.cssText = [
  'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:44',
  'opacity:0', 'mix-blend-mode:overlay',
  'background:radial-gradient(circle at 50% 50%,rgba(230,236,246,0.15) 0%,rgba(206,196,176,0.72) 62%,rgba(150,140,124,0.95) 100%)',
].join(';');
document.body.appendChild(washscreen);

const combatHud = document.createElement('div');
combatHud.id = 'enola-combat';
combatHud.style.cssText = [
  'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:30', 'display:none',
].join(';');
const reticle = document.createElement('div');
reticle.style.cssText = [
  'position:absolute', 'left:50%', 'top:50%', 'width:96px', 'height:96px',
  'margin:-48px 0 0 -48px', 'border:1px solid rgba(168,255,122,0.55)',
  'border-radius:50%', 'box-shadow:0 0 12px rgba(168,255,122,0.25) inset',
].join(';');
const reticleDot = document.createElement('div');
reticleDot.style.cssText = [
  'position:absolute', 'left:50%', 'top:50%', 'width:4px', 'height:4px',
  'margin:-2px 0 0 -2px', 'background:rgba(168,255,122,0.9)', 'border-radius:50%',
].join(';');
const beltStrip = document.createElement('div');
beltStrip.style.cssText = [
  'position:absolute', 'left:50%', 'bottom:14%', 'transform:translateX(-50%)',
  'font:600 13px/1.4 "Trebuchet MS",system-ui,sans-serif', 'letter-spacing:0.12em',
  'color:#a8ff7a', 'text-shadow:0 2px 8px #000', 'text-align:center', 'white-space:nowrap',
].join(';');
combatHud.append(reticle, reticleDot, beltStrip);
document.body.appendChild(combatHud);

const autoStrip = document.createElement('div');
autoStrip.id = 'enola-autopilot';
autoStrip.style.cssText = [
  'position:fixed', 'left:50%', 'top:9%', 'transform:translateX(-50%)',
  'pointer-events:none', 'z-index:29', 'display:none',
  'font:600 12px/1.3 "Trebuchet MS",system-ui,sans-serif', 'letter-spacing:0.16em',
  'color:#e8c86a', 'text-shadow:0 2px 8px #000',
].join(';');
document.body.appendChild(autoStrip);

/* ------------------------------------------------------------------ */
/* The camera tooltip                                                  */
/*
 * Owner, 2026-08-04: "After take off and like 20 seconds of flying I would
 * like to a flashing tool tip to hit C to change the camera view."
 *
 * So: nothing on the glass during the takeoff itself — the player has enough
 * to read — then twenty seconds of real flying later, a slow pulse in the
 * bottom middle saying which key changes the view. It goes away the instant C
 * is pressed and never comes back for the rest of the flight; if it is
 * ignored it gives up on its own after half a minute rather than blinking at
 * the player for the whole raid.
 *
 * `cameraTip.flying` starts counting the moment the mission leaves the
 * `takeoff` phase with the wheels up — the same edge `updateTakeoff()` uses to
 * call the aeroplane airborne — so "twenty seconds of flying" means twenty
 * seconds of flying and not twenty seconds of sitting on the runway.
 *
 * The pulse is driven from `paintCombat()` rather than a CSS keyframe for the
 * same reason `blastscreen`'s opacity is: this page builds its overlays in JS
 * with inline styles and has no stylesheet of its own to hang an @keyframes
 * on, and the frame loop is already painting every frame anyway.
 */
/* ------------------------------------------------------------------ */

const cameraTip = document.createElement('div');
cameraTip.id = 'enola-camera-tip';
cameraTip.style.cssText = [
  'position:fixed', 'left:50%', 'bottom:22%', 'transform:translateX(-50%)',
  'pointer-events:none', 'z-index:31', 'display:none', 'white-space:nowrap',
  'padding:8px 18px', 'border:1px solid rgba(232,200,106,0.55)', 'border-radius:6px',
  'background:rgba(12,10,20,0.72)',
  'font:700 14px/1.3 "Trebuchet MS",system-ui,sans-serif', 'letter-spacing:0.14em',
  'color:#e8c86a', 'text-shadow:0 2px 8px #000',
].join(';');
cameraTip.innerHTML = 'PRESS <span style="'
  + 'display:inline-block;min-width:18px;padding:1px 6px;margin:0 4px;'
  + 'border:2px solid rgba(255,255,255,0.8);border-radius:4px;color:#fff'
  + '">C</span> TO CHANGE THE CAMERA VIEW';
document.body.appendChild(cameraTip);

const cameraTipState = {
  /** Seconds of real flight since the wheels left the runway. */
  flying: 0,
  /** Seconds the tip has been on screen. */
  shown: 0,
  /** True once the player has pressed C, or the tip has timed out. */
  done: false,
  delay: 20,
  linger: 30,
};

/** Called from the keydown handler the first time C is pressed. */
function dismissCameraTip() {
  cameraTipState.done = true;
  cameraTip.style.display = 'none';
}

function updateCameraTip(dt) {
  const s = cameraTipState;
  if (s.done) return;
  /* Only counts while the aeroplane is genuinely flying itself somewhere. The
   * phase list is every phase that is NOT after takeoff, so a checkpoint
   * restart into the middle of the flight still gets the hint — which a
   * `flags.rotateCalled` test would not, since nothing sets that flag on a
   * restore. */
  const flying = mission.inCockpit && !physics.onGround
    && !['idle', 'walkaround', 'nightfall', 'preflight', 'taxi', 'takeoff'].includes(mission.phase);
  if (!flying) return;
  s.flying += dt;
  if (s.flying < s.delay) return;
  s.shown += dt;
  if (s.shown > s.linger) { dismissCameraTip(); return; }
  // Never over the top of the tail-gun HUD or a choice panel.
  if (mission.gunner.manned || currentChoice()) {
    cameraTip.style.display = 'none';
    return;
  }
  cameraTip.style.display = 'block';
  // A slow, unmistakable pulse — about one flash a second.
  const pulse = 0.55 + 0.45 * Math.sin(s.shown * 6.0);
  cameraTip.style.opacity = String(pulse);
}

/**
 * The city's air-raid sirens, wound up as the raid comes in.
 *
 * Owner: "maybe an air raid siren as we approach would be good as wlel."
 *
 * Here rather than in `MissionController` because it is a mix decision made
 * from a position and a range, not mission state: the sirens are a fixed thing
 * in the world at the middle of Squatchbourg, and how loud they are is simply
 * how far away the aeroplane is. `EnolaMissionAudio.setAirRaidSiren()` owns
 * the falloff and does nothing at all until the cue is recorded.
 *
 * They stop at the flash. Nobody is winding a siren after that, and the three
 * blast clips own the mix for the next forty-four seconds anyway.
 */
const SIREN_AT = { x: TARGET_X, y: 0, z: COMPOUND.z };
function updateAirRaidSiren() {
  if (!mission.inCockpit || mission.explosionPoint || mission.finished) {
    missionAudio.setAirRaidSiren(null);
    return;
  }
  SIREN_AT.y = groundHeightCombined(TARGET_X, COMPOUND.z) + 30;
  const p = physics.position;
  missionAudio.setAirRaidSiren(SIREN_AT, Math.hypot(p.x - SIREN_AT.x, p.z - SIREN_AT.z));
}

function paintCombat() {
  const flash = mission.blastFlash || 0;
  if (flash > 0.001) {
    const t = mission.blastTint || { r: 1, g: 1, b: 1 };
    blastscreen.style.background = `rgb(${Math.round(t.r * 255)},${Math.round(t.g * 255)},${Math.round(t.b * 255)})`;
    blastscreen.style.opacity = String(Math.min(1, flash));
  } else if (blastscreen.style.opacity !== '0') {
    blastscreen.style.opacity = '0';
  }

  /* The front crossing the camera. Capped below 1 on purpose: this is meant to
   * be something sweeping ACROSS the view, and a view it can black out is a
   * view the player cannot see it sweep across. */
  const wash = mission.blastWash || 0;
  if (wash > 0.001) {
    washscreen.style.opacity = String(Math.min(0.88, wash));
  } else if (washscreen.style.opacity !== '0') {
    washscreen.style.opacity = '0';
  }

  const gun = mission.gunner;
  const manned = !!gun?.manned;
  combatHud.style.display = manned ? 'block' : 'none';
  if (manned) {
    const heat = Math.round(gun.heat * 100);
    beltStrip.textContent = gun.jammed > 0
      ? 'GUN JAMMED — LET IT COOL'
      : `BELT ${gun.rounds}  ·  BARRELS ${heat}%  ·  ${gun.kills} DOWN`;
    const hot = gun.jammed > 0 || gun.heat > 0.7;
    reticle.style.borderColor = hot ? 'rgba(255,120,90,0.7)' : 'rgba(168,255,122,0.55)';
    beltStrip.style.color = hot ? '#ff8a6a' : '#a8ff7a';
  }

  const line = mission.autopilot?.readout?.();
  autoStrip.style.display = line ? 'block' : 'none';
  if (line) autoStrip.textContent = line;
}

function paintCutscene() {
  const cs = mission.cutscene;
  const on = !!cs?.active;
  cutscreen.style.display = on ? 'block' : 'none';
  if (!on) return;
  cutFade.style.opacity = String(cs.fade ?? 0);
  cutText.textContent = cs.caption || '';
  cutSub.textContent = cs.sub || '';
  cutSkip.style.display = cs.skippable ? 'block' : 'none';
}

function paintHud() {
  flightHud.setFlight(physics, { fuel: engines.fuel / AC_ENOLA.fuelMass });
  flightHud.setEngines(engineHudView(engines));
  flightHud.setFlaps(physics.controls.flaps);
  flightHud.setAirBrake(physics.controls.airBrake);
  updateCargoReadout();
  updatePreflightChecklist();
  updateChoicePanel();
  paintCutscene();
  paintCombat();
}

/** One simulated tick: input -> physics -> engines -> mission -> dialogue ->
 * weather -> camera -> HUD paint. No rendering — shared by the real
 * `requestAnimationFrame` loop (which renders after this) and `.tick()`
 * (which does not, for fast headless testing). Mission/detection/defense/
 * targeting/mass-bookkeeping are all driven from a single `mission.update(dt)`
 * call — see the file header's note on why this frame loop does not call
 * `detection.update()`/`defense.update()` a second time itself. */
function simulateFrame(dt) {
  input.update(dt);
  const inCockpit = mission.inCockpit;

  if (inCockpit) {
    input.applyTo(physics.controls);
    /* THE AUTOPILOT GOES HERE AND NOWHERE ELSE.
     *
     * After `applyTo` — which writes the player's (centred, while he is in the
     * tail) stick into the same three axes — and before the throttles are
     * handed to the engines and the physics is stepped. Put it earlier and the
     * player's centred stick erases it every frame; put it later and its own
     * throttle never reaches the engines. See
     * `MissionController.flyControls()`. */
    mission.flyControls(dt);
    // One throttle lever drives both engines on each side — see the
    // engineNames convention above and config.js's engine-count design note.
    engines.setThrottle(0, physics.controls.throttleL);
    engines.setThrottle(1, physics.controls.throttleL);
    engines.setThrottle(2, physics.controls.throttleR);
    engines.setThrottle(3, physics.controls.throttleR);
    engines.update(dt, physics.tas);
    physics.advance(dt);
  } else {
    /* On the apron. The aeroplane is chocked and braked, so nothing is
     * integrated; the engines still tick over at zero airspeed so that any
     * that get cranked make noise while the player is walking round them, the
     * same accommodation `src/beefrun/main.js` makes. */
    engines.update(dt, 0);
    player.update(dt);
    /* `Player._applyCamera()` writes `camera.position`/`camera.quaternion`,
     * which only marks the matrix dirty — `matrixWorld` is not recomposed
     * until something asks for it, and the thing that normally asks is
     * `renderer.render()` at the END of the frame. `InteractionSystem.update()`
     * raycasts through `raycaster.setFromCamera()`, which reads `matrixWorld`
     * directly, so without this the crosshair is tested against where the
     * player's head was LAST frame. Invisible at 60 fps and standing still,
     * very visible while turning, and completely wrong in a headless step
     * (`tick()`/`standAtNextCheck()` never render, so the camera matrix would
     * never move at all). One matrix compose, on foot only. */
    camera.updateMatrixWorld();
    /* Raycaster does not refresh Object3D matrices. Renderer normally does,
     * but `tick()` and `standAtNextCheck()` deliberately drive this real
     * interaction path without rendering. Refresh only the ten registered
     * aircraft-part roots and their child hit proxies before the raycast; a
     * full `scene.updateMatrixWorld(true)` would walk all of Squatchbourg for
     * an apron prompt. */
    syncInteractionTargetMatrices(interaction);
    interaction.update(dt);
  }

  autoStartCaptainEngines();

  aircraft.syncTo(physics);
  aircraft.update(dt, physics, engines, {
    bombBayOpen: mission.bombBayOpen,
    dusk: weather.dusk > 0.4,
    gunFiring: mission.gunFiring,
    gunAim: mission.gunAim,
  });

  mission.update(dt);
  dialogue.update(dt);
  crew.update(dt, inCockpit ? camera.position : player.position);

  // Sound follows the aeroplane. FlightHud reads two banks; the audio engine's
  // own graph is a stereo pair, so each side's inner engine drives its channel.
  for (const [ch, i] of [[0, 1], [1, 2]]) {
    const e = engines.engines[i];
    missionAudio.setEngine(ch, { rpm: e.rpm, running: e.running, roughness: e.roughness, health: e.health });
  }
  missionAudio.setAirspeed(inCockpit ? physics.tas : 0);
  missionAudio.setRain(weather.rain);
  updateAirRaidSiren();

  const focus = inCockpit ? physics.position : player.position;
  weather.update(dt, focus);
  applyNight();
  applyEastFog(focus.x, dt);
  airfield.update(dt, 0.4 + weather.crosswind * 0.1, 0);

  if (inCockpit) {
    /* While the player is in the tail the camera is the GUN's, not the
     * CameraManager's. `CameraManager` only knows three views and adding a
     * fourth would mean editing `src/beefrun/cameras.js`, which the Beef Run
     * shares and the standing rules call canonical — so the turret places the
     * camera itself and the manager is simply not run that frame. */
    if (mission.gunner.manned) mission.gunner.applyCamera(camera);
    else {
      cameras.update(dt, physics, aircraft.group, aircraft.pilotEye, {
        roughness: physics.gust.length() * 0.05 + (physics.onGround ? physics.groundSpeed * 0.01 : 0),
        gLoad: physics.gLoad,
      });
    }
  }
  audio.updateListener?.(camera);

  updateCameraTip(dt);
  paintHud();
}

/**
 * Jump/teleport the mission to a given phase and tick once so state/HUD
 * reflect it immediately. Built for headless verification (see
 * `tools/verify-enolasquatch.mjs`) and for anyone driving the mission from
 * the console; it is a forward-progression helper (preflight -> ... ->
 * epilogue), not an arbitrary-rewind API — going backward after the payload
 * has released, for instance, does not re-mount it.
 */
function go(phase) {
  game.started = true;
  game.paused = false;
  mission.paused = false;
  if (mission.phase === 'idle') mission.begin();
  /* Everything except the walkaround itself happens with the crew strapped in,
   * so board first. `advance: false` keeps `enterCockpit` from also forcing
   * the phase to preflight and stamping on the one being asked for. */
  if (phase !== 'walkaround' && !mission.inCockpit) mission.enterCockpit({ advance: false });
  switch (phase) {
    case 'walkaround':
      if (mission.phase !== 'walkaround') mission.setPhase('walkaround');
      break;
    case 'nightfall':
      mission.setPhase('nightfall');
      break;
    case 'preflight':
      /* Straight to the seat with the field already dark. `go('preflight')` is
       * the "skip the opening" shortcut, and skipping the opening must not
       * skip the night — the whole mission after this point is a night raid
       * and every later phase assumes it. Same two calls the cut's own last
       * step makes; see `MissionController.stageNightRunway()`. */
      mission.stageNightRunway();
      mission.setPhase('preflight');
      break;
    case 'taxi': {
      const a = airfield.anchors.lineUp;
      physics.setPose(new THREE.Vector3(a.x, WP.elev + AC_ENOLA.gearY, a.z - 60), airfield.anchors.departHeading, 5);
      engines.forceRunning();
      mission.flags.enginesEverStarted = true;
      input.throttle = 0.2;
      physics.controls.parkingBrake = false;
      mission.setPhase('taxi');
      break;
    }
    case 'takeoff':
      mission.restoreCheckpoint('takeoff');
      break;
    case 'climbTurn': {
      const z = TURN_POINT.z + 250;
      const y = groundHeightCombined(WP.x, z) + TURN_POINT.minAltitudeAgl + 40;
      physics.setPose(new THREE.Vector3(WP.x, y, z), WP.heading, 68);
      engines.forceRunning();
      mission.flags.enginesEverStarted = true;
      mission.flags.rotateCalled = true;
      input.throttle = 0.8;
      physics.controls.parkingBrake = false;
      mission.setPhase('climbTurn');
      break;
    }
    case 'cruise':
      mission.restoreCheckpoint('turnOnCourse');
      break;
    case 'detection': {
      const x = CORRIDOR.x - 400;
      const z = CORRIDOR.z;
      const y = groundHeightCombined(x, z) + 260;
      physics.setPose(new THREE.Vector3(x, y, z), TURN_POINT.newHeading, 66);
      engines.forceRunning();
      mission.flags.enginesEverStarted = true;
      input.throttle = 0.7;
      physics.controls.parkingBrake = false;
      mission.setPhase('detection');
      break;
    }
    case 'defense': {
      const x = TARGET_X - 1600;
      const z = COMPOUND.z;
      const y = groundHeightCombined(x, z) + 380;
      physics.setPose(new THREE.Vector3(x, y, z), TURN_POINT.newHeading, 66);
      engines.forceRunning();
      mission.flags.enginesEverStarted = true;
      input.throttle = 0.7;
      physics.controls.parkingBrake = false;
      mission.setPhase('defense');
      break;
    }
    case 'bombApproach':
      mission.restoreCheckpoint('preRelease');
      break;
    case 'bombMalfunction': {
      /* Match the lead distance used by organic mission flight. */
      const x = TARGET_X - 1600;
      const z = COMPOUND.z;
      const y = groundHeightCombined(x, z) + 360;
      physics.setPose(new THREE.Vector3(x, y, z), TURN_POINT.newHeading, 60);
      engines.forceRunning();
      mission.flags.enginesEverStarted = true;
      input.throttle = 0.6;
      physics.controls.parkingBrake = false;
      mission.setPhase('bombMalfunction');
      break;
    }
    case 'release': {
      /* Three seconds of handle/kick choreography plus the bomb's horizontal
       * carry need roughly 700 m of lead at bombing-run speed. */
      const x = TARGET_X - 700;
      const z = COMPOUND.z;
      const y = groundHeightCombined(x, z) + 350;
      physics.setPose(new THREE.Vector3(x, y, z), TURN_POINT.newHeading, 60);
      engines.forceRunning();
      mission.flags.enginesEverStarted = true;
      input.throttle = 0.6;
      physics.controls.parkingBrake = false;
      mission.setPhase('release');
      break;
    }
    case 'explosion': {
      const point = new THREE.Vector3(TARGET_X, groundHeightCombined(TARGET_X, COMPOUND.z), COMPOUND.z);
      if (!mission.payloadReleased) {
        payload.release(scene, physics.velocity.clone());
        mission.payloadReleased = true;
      }
      /* Phase FIRST, impact SECOND. `onEnterPhase('explosion')` clears
       * `_explosionVfx` and resets the clock, so calling `onPayloadImpact()`
       * before it — which is what this did — built the whole fireball and then
       * immediately threw the handle to it away: the group stayed in the scene
       * at opacity zero, never animated, never removed, and `go('explosion')`
       * showed an empty sky. The organic route is unaffected (the payload
       * takes seconds to fall, so it impacts long after the phase begins),
       * which is why the end-to-end verification never caught it and why it
       * only turned up when the detonation was framed for a screenshot. */
      mission.setPhase('explosion');
      mission.onPayloadImpact(point);
      break;
    }
    case 'escape': {
      const x = TARGET_X + 400;
      const z = COMPOUND.z;
      const y = groundHeightCombined(x, z) + 420;
      physics.setPose(new THREE.Vector3(x, y, z), RETURN_HEADING, 62);
      engines.forceRunning();
      mission.flags.enginesEverStarted = true;
      mission.payloadReleased = true;
      input.throttle = 0.65;
      physics.controls.parkingBrake = false;
      mission.setPhase('escape');
      break;
    }
    case 'emergency': {
      const dead = mission.defense.damage.engines.findIndex(Boolean);
      mission._emergencyEngineIndex = dead >= 0 ? dead : 0;
      mission.setPhase('emergency');
      break;
    }
    case 'return':
      mission.restoreCheckpoint('return');
      break;
    case 'landing': {
      physics.setPose(new THREE.Vector3(WP.x, WP.elev + AC_ENOLA.gearY, WP.z), 0, 0.4);
      engines.forceRunning();
      mission.flags.enginesEverStarted = true;
      mission.payloadReleased = true;
      input.throttle = 0;
      physics.controls.parkingBrake = false;
      mission.setPhase('landing');
      break;
    }
    case 'epilogue':
      mission.setPhase('epilogue');
      break;
    default:
      mission.setPhase(phase);
  }
  simulateFrame(0);
  return mission.phase;
}

window.__squatch = window.__squatch || {};
window.__squatch.enolaSquatch = true;

window.__enolaSquatch = {
  campaign: {
    preview: enolaCampaignPreview,
    state: () => enolaCampaign.campaign?.state ?? null,
    get completed() { return enolaCampaignComplete; },
  },
  mission, physics, engines, aircraft, payload, dialogue, weather, detection,
  cameras, input, hud, flightHud, scene, camera, renderer, airfield, postfx,
  player, interaction, preflight, crew, city, eastGround, audio: missionAudio,
  get defense() { return mission.defense; },
  get targeting() { return mission.targeting; },
  get interceptors() { return mission.interceptors; },
  get autopilot() { return mission.autopilot; },
  get gunner() { return mission.gunner; },
  get detonation() { return mission.detonation; },
  get crater() { return activeCrater; },
  loadout: {
    get slots() { return finalArcLoadout.items; },
    get selected() { return finalArcLoadout.selected; },
    get equipped() { return finalArcLoadout.equipped; },
    select(index) { finalArcLoadout.select(index); paintDurableCarry(); return finalArcLoadout.selected; },
  },

  /* ---- The escalation pass's own console/verification handles ---- */

  /** Put a wave of night fighters up right now. */
  spawnFighters(count = 2, delay = 0) {
    mission.interceptors.deploy({ around: physics.position, count, delay });
    simulateFrame(1 / 60);
    return mission.interceptors.fighters.length;
  },
  /** Hand the aeroplane to the gyro, or take it back. */
  autopilotToggle() { const on = mission.toggleAutopilot(); simulateFrame(1 / 60); return on; },
  /** Climb into the tail, or come forward. Engages the autopilot if needed. */
  gunToggle() { const on = mission.toggleGun(); simulateFrame(1 / 60); return on; },
  /** Hold the trigger for `seconds`, aimed wherever the turret is pointing. */
  fireGun(seconds = 1) {
    mission.gunner.setFiring(true);
    let t = 0;
    while (t < seconds) { simulateFrame(1 / 60); t += 1 / 60; }
    mission.gunner.setFiring(false);
    simulateFrame(1 / 60);
    return mission.gunner.readout();
  },
  /** Point the turret at a world position. Clamped to the real arc. */
  aimGunAt(x, y, z) {
    const inArc = mission.gunner.pointAt(new THREE.Vector3(x, y, z));
    simulateFrame(1 / 60);
    return { inArc, yaw: mission.gunner.yaw, pitch: mission.gunner.pitch };
  },
  groundHeight: groundHeightCombined,
  /* The for-show switch itself, so a console can put the beating back on:
   *   __enolaSquatch.liveFire.fighters = true;
   *   __enolaSquatch.defense.liveFire = true;   // the flak reads its own copy
   * See `LIVE_FIRE` in ./config.js for what each one covers. */
  liveFire: LIVE_FIRE,
  /* The detonation's own maths, so a verifier can assert the SHAPE of the
   * double flash and the shock expansion rather than trying to catch a
   * quarter-second peak by sampling. */
  blastLuminance,
  /** What the SCREEN does — a short bleach onto a wash you can see through.
   * Not the device's own curve; see `blastWhiteout`'s note for the difference
   * and for why the four-tenths-of-a-second blind is gone. */
  blastWhiteout,
  shockRadiusAt,
  /** How solid the pressure shell is at a given radius. */
  shellOpacity,
  /** How hard the front is crossing a viewer at a given range. */
  shockPass,
  /** The crater's own profile, so a caller can hold the ground against it. */
  craterOffsetAt: (d) => craterOffset(d, CRATER),
  go,

  /**
   * Stand at the next walkaround check and put the crosshair on it.
   *
   * Built for `tools/verify-enolasquatch.mjs`, and genuinely useful from the
   * console. This is NOT a shortcut past the walkaround — it moves the player
   * and aims his head, and then the real `InteractionSystem` has to raycast
   * from that camera, find the real proxy, and run the real descriptor. If a
   * check is out of the 2.7 m interaction range, or hidden behind the
   * fuselage from where a person would stand, this fails exactly the way a
   * player would, which is the whole point of testing it this way rather than
   * by calling `onUse` directly.
   *
   * @param {number} distance how far back to stand, in metres
   * @returns {?object} { name, anchor, stand } or null when the walk is done
   */
  standAtNextCheck(distance = 2.0) {
    const anchor = preflight.markerAnchor();
    if (!anchor) return null;
    const name = preflight.next?.name ?? null;
    /* Step outward from the aeroplane's centreline so the player is not
     * standing inside the fuselage looking at its back faces. If the check is
     * ON the centreline — the payload, the bomb bay, the tail gun — go out to
     * the starboard side, which is the side the crew door and the nose art are
     * on and therefore the side a walkaround is done from. */
    const away = new THREE.Vector3(anchor.x - physics.position.x, 0, anchor.z - physics.position.z);
    if (away.lengthSq() < 4) {
      away.set(-1, 0, 0).applyQuaternion(physics.quat);
      away.y = 0;
    }
    away.normalize();
    const sx = anchor.x + away.x * distance;
    const sz = anchor.z + away.z * distance;
    const gy = groundHeightCombined(sx, sz);
    player.position.set(sx, gy + 1.66, sz);
    player.ground = gy;
    player.velocity?.set?.(0, 0, 0);
    const dx = anchor.x - sx;
    const dy = anchor.y - (gy + 1.66);
    const dz = anchor.z - sz;
    // A camera at yaw 0 / pitch 0 looks down -Z (see Player._applyCamera).
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    simulateFrame(1 / 60);
    return { name, anchor: { x: anchor.x, y: anchor.y, z: anchor.z }, stand: { x: sx, y: gy, z: sz } };
  },

  /** Tap E where the player is standing, through the real interaction system. */
  pressE(holdSeconds = 0) {
    interaction.press();
    if (holdSeconds > 0) {
      let t = 0;
      while (t < holdSeconds) { simulateFrame(1 / 60); t += 1 / 60; }
    }
    interaction.release();
    simulateFrame(1 / 60);
    return interaction.current?.userData?.interact ? true : false;
  },
  tick(seconds, step = 1 / 60) {
    let t = 0;
    while (t < seconds - 1e-9) {
      const dt = Math.min(step, seconds - t);
      simulateFrame(dt);
      t += dt;
    }
  },
  state() {
    return {
      phase: mission.phase,
      inCockpit: mission.inCockpit,
      crewAboard: crew.aboard,
      walkaround: {
        done: preflight.doneCount,
        total: Object.keys(preflight.tasks).length,
        next: preflight.next?.name ?? null,
        complete: preflight.complete,
        guidingToDoor: preflight.guidingToDoor,
        markerVisible: preflight.marker.visible,
      },
      boarding: {
        armed: !!mission.boardTarget,
        distance: mission.boardingDistance(),
      },
      /* The nightfall cut, for the verifier: whether the screen is up, how
       * black it is, and what the world under it looks like. */
      cutscene: mission.cutscene ? { ...mission.cutscene } : null,
      night: { dusk: weather.dusk, night: weather.night, staged: mission.nightfallStaged },
      /* The club crest: how many badges exist and how many carry the real
       * artwork rather than the drawn stand-in. */
      clubLogo: {
        onAircraft: aircraft.parts.clubLogo?.length ?? 0,
        onPayload: payload.parts.clubLogo?.length ?? 0,
        realArtworkApplied: clubLogoBadges,
      },
      /* The owner's own "Enola Squatch" artwork, read from the paired live
       * plates and their real `artReady` promise rather than a retired slot. */
      noseArt: aircraft.noseArtPresentation(),
      /* The flashing camera hint — see `updateCameraTip()`. */
      cameraTip: {
        flying: +cameraTipState.flying.toFixed(1),
        shown: +cameraTipState.shown.toFixed(1),
        done: cameraTipState.done,
        visible: cameraTip.style.display === 'block',
        opacity: Number(cameraTip.style.opacity || 0),
      },
      scenery: { trees: airfieldScenery.trees, tufts: airfieldScenery.tufts },
      cityDestroyed: city.destroyed,
      city: city.stats(),
      /* Squatchbourg as a restart sees it: whether the hole exists in the
       * MISSION's ground (not just in the mesh), whether the street plate and
       * the river are drawn, whether the lights are on, and how many lots are
       * still standing rather than flattened or vaporised. This is the readout
       * `restoreCheckpoint()` has to be able to put back — see
       * `TargetCity.restore()`. */
      target: {
        destroyed: city.destroyed,
        crater: !!activeCrater,
        craterMesh: !!city.crater,
        /* Two readings of the same hole, because they answer different
         * questions. `groundHole` is how far the ground has dropped at the
         * MIDDLE OF TOWN, which is where the restored city has to stand and
         * which therefore has to come back to exactly zero; how deep it gets in
         * the first place depends on where the bomb actually fell, since the
         * Fat Squatch carries the aeroplane's speed downrange. `holeAtCrater`
         * is the depth at ground zero itself, which is always the full
         * `CRATER.depth` while a crater exists and is the honest way to ask
         * "is there a hole at all". */
        groundHole: +(groundHeightCombined(TARGET_X, COMPOUND.z)
          - rawEastHeight(TARGET_X, COMPOUND.z)).toFixed(1),
        holeAtCrater: activeCrater
          ? +(groundHeightCombined(activeCrater.x, activeCrater.z)
            - rawEastHeight(activeCrater.x, activeCrater.z)).toFixed(1)
          : 0,
        standingLots: city.lots.filter((l) => !l.gone).length,
        totalLots: city.lots.length,
        landmarksAlive: city.landmarks.filter((l) => l.alive).length,
        streetsVisible: !!city.parts.streets?.visible,
        riverVisible: !!city.parts.river?.visible,
        windowGlow: +(city.parts.buildingWallMat?.emissiveIntensity ?? 0).toFixed(3),
        flattened: city.flattened,
      },
      /* The two diamonds — see `NAV_BY_PHASE` in mission/MissionController.js.
       * `onScreen` is what the HUD is actually doing with it this frame: the
       * diamond on the place, or the arrowhead pinned to the edge. */
      marker: (() => {
        const nav = mission.navTarget();
        if (!nav) return { shown: false, label: null };
        const dir = mission.projectNav(nav, mission.navRange ?? 0);
        return {
          shown: !document.getElementById('br-dir')?.classList.contains('hidden'),
          label: nav.label,
          nm: +(mission.navRange ?? 0).toFixed(2),
          onScreen: dir ? dir.onScreen : null,
          x: dir ? +dir.x.toFixed(1) : null,
          y: dir ? +dir.y.toFixed(1) : null,
          tag: document.getElementById('br-dir')?.querySelector('.tag')?.textContent ?? null,
        };
      })(),
      /* For show, or for real. See `LIVE_FIRE` in ./config.js. */
      liveFire: { flak: mission.defense.liveFire, fighters: LIVE_FIRE.fighters },
      /* The 2026-08-04 escalation pass: the air battle, the box that flies for
       * you, the gun you fly it to work, and the blast. All read-only. */
      fighters: {
        deployed: mission.interceptors.deployed,
        active: mission.interceptors.activeCount,
        engaged: mission.interceptors.engagedCount,
        states: mission.interceptors.fighters.map((f) => f.state),
        kills: mission.interceptors.kills,
        hitsTaken: mission.interceptors.hitsTaken,
        roundsAtUs: mission.interceptors.roundsAtUs,
      },
      autopilot: {
        engaged: mission.autopilot.engaged,
        lockout: +mission.autopilot.lockout.toFixed(2),
        reason: mission.autopilot.reason,
        predictability: +mission.autopilot.predictability.toFixed(3),
        headingError: +mission.autopilot.holdError.heading.toFixed(2),
        altitudeError: +mission.autopilot.holdError.altitude.toFixed(1),
      },
      gunner: mission.gunner.readout(),
      flak: {
        state: mission.defense.state,
        intensity: +mission.defense.intensity.toFixed(2),
        trackQuality: +mission.defense.trackQuality.toFixed(3),
        batteries: mission.defense.batteries.length,
        burstsFired: mission.defense.burstsFired,
        nearMisses: mission.defense.nearMisses,
        shellsInFlight: mission.defense._shells.length,
      },
      blast: {
        live: mission.detonation.live,
        t: +mission.detonation.t.toFixed(2),
        flash: +(mission.blastFlash || 0).toFixed(3),
        shockRadius: Math.round(mission.detonation.shockRadius),
        shockArrived: mission._shockArrived,
        /* The front as the PLAYER meets it — how hard it is crossing him this
         * frame, how far he is from the hole, whether it has gone past, and
         * whether the column has settled into standing over the crater. */
        wash: +(mission.blastWash || 0).toFixed(3),
        viewRange: Math.round(mission.detonation.viewRange || 0),
        shockPassed: !!mission.detonation.shockPassed,
        lingering: !!mission.detonation.lingering,
        turbulence: +(mission.weather?.turbulence ?? 0).toFixed(3),
        cityFlattened: city.flattened,
        cityShock: Math.round(city.shockRadius || 0),
      },
      camera: { view: cameras.view, dropCam: +(mission._dropCam || 0).toFixed(2) },
      evasion: +mission.evasion.toFixed(3),
      phaseTime: +mission.phaseTime.toFixed(2),
      missionTime: +mission.missionTime.toFixed(2),
      checkpoint: mission.checkpoint,
      failed: mission.failed,
      finished: mission.finished,
      payloadReleased: mission.payloadReleased,
      score: { ...mission.score },
      physicsDamage: { ...physics.damage },
      defenseDamage: { ...mission.defense.damage },
      fuel: engines.fuel,
      position: { x: physics.position.x, y: physics.position.y, z: physics.position.z },
      headingDeg: physics.headingDeg,
    };
  },
};

/* ------------------------------------------------------------------ */
/* Start / pause                                                      */
/* ------------------------------------------------------------------ */

/**
 * Sound is brought up in the background rather than awaited.
 *
 * The Beef Run awaits `audio.init()` and `loadManifest()` before it calls
 * `mission.begin()`; this page cannot, because the mission has to be running
 * by the time the click handler returns — `tools/verify-enolasquatch.mjs`
 * clicks Start and reads `mission.phase` synchronously in the same evaluate
 * block, and more importantly a player should not watch a black screen while a
 * voice bank decodes. `AudioEngine.init()` still runs inside the user gesture,
 * which is the part browsers actually require.
 */
let audioStarted = false;
function startAudio() {
  if (audioStarted) return;
  audioStarted = true;
  audio.init().then(async () => {
    missionAudio.init();
    const sfx = await audio.loadManifest();
    console.info(`[sfx] ${sfx.loaded}/${sfx.total} samples loaded; the rest are synthesised.`);
  }).catch((err) => {
    // A page with no sound is still a playable page. Say so once and move on.
    console.warn('[enolasquatch] audio unavailable:', err?.message || err);
  });
}

startBtn.addEventListener('click', () => {
  if (!game.started) {
    const campaignEntry = enolaCampaign.begin();
    if (!campaignEntry.ok) {
      if (restoreCompletedFinalArcEntry(campaignEntry, {
        preview: enolaCampaignPreview,
        restore: () => showEnolaCompletion(
          enolaCompletionReportFromSave(enolaCampaign.story?.mission),
          { campaignComplete: true },
        ),
      })) return;
      const tag = overlay?.querySelector('.tag');
      if (tag) {
        tag.textContent = campaignEntry.reason === 'already_complete'
          ? "The Enola Squatch is already complete. Continue from Lou's mansion."
          : 'The Enola Squatch is locked until the mansion siege is complete.';
      }
      return;
    }
    const resumePlan = campaignEntry.resumed
      ? enolaResumePlan(campaignEntry.checkpoint, campaignEntry.checkpointSnapshot)
      : null;
    if (previewCheckpoint) {
      // `go()` sets `game.started`/`game.paused`/`mission.paused` itself —
      // see its own doc comment below.
      go(previewCheckpoint);
      const label = PREVIEW_CHECKPOINT_LABELS[previewCheckpoint] ?? previewCheckpoint;
      hud.say(`<em>Preview checkpoint:</em> ${label}.`, 4200);
    } else if (resumePlan) {
      // Campaign saves use MissionController's own checkpoint tokens. `go()`
      // is the scene's existing restore path; URL aliases stay preview-only.
      if (resumePlan.checkpointData) {
        mission.checkpointData = resumePlan.checkpointData;
      }
      go(resumePlan.phase);
      hud.say(
        resumePlan.legacyFallback
          ? '<em>Legacy flight save recovered at takeoff.</em> The score must be re-earned.'
          : '<em>Flight resumed from the last checkpoint.</em>',
        5200,
      );
    } else {
      game.started = true;
      mission.begin();
      // Daylight on the apron, dark by the runway — see the `nightfall` phase.
      hud.say('<em>Whispering Pines Municipal, the last of the afternoon.</em> Walk her with the Captain before you get in.', 6000);
    }
  }
  startAudio();
  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  requestLock();
  game.paused = false;
  mission.paused = false;
});

let dragLook = false;
let dragging = false;

function requestLock() {
  input.enabled = true;
  if (dragLook) { enableInput(); return; }
  const p = canvas.requestPointerLock?.();
  if (p && p.catch) p.catch(() => fallBackToDragLook());
  setTimeout(() => {
    if (!dragLook && document.pointerLockElement !== canvas && !game.paused) fallBackToDragLook();
  }, 600);
}

function fallBackToDragLook() {
  if (dragLook) return;
  dragLook = true;
  enableInput();
  hud.say('Pointer lock is blocked here — <em>hold the left button to look around.</em>', 7000);
}

function enableInput() {
  input.enabled = true;
  player.enabled = !mission.inCockpit;
  game.paused = false;
  mission.paused = false;
  document.body.classList.remove('unlocked');
  overlay.classList.add('hidden');
}

document.addEventListener('pointerlockchange', () => {
  if (dragLook) return;
  const locked = document.pointerLockElement === canvas;
  input.enabled = locked;
  player.enabled = locked && !mission.inCockpit;
  document.body.classList.toggle('unlocked', !locked);
  if (!locked && game.started && !mission.finished) pauseGame();
});

function pauseGame() {
  pauseMenu.pause();
}

const pauseMenu = createPauseMenu({
  title: 'The Enola Squatch',
  canPause: () => game.started && !mission.finished,
  getObjective: () => $('br-objective')?.textContent?.trim() || 'Follow the crew’s current instruction.',
  instructions: [
    'On the apron: W A S D — walk. E — check the thing the marker is on. E at the crew door — get in.',
    'In the aircraft: W/S — pitch. A/D — bank. Q/E — rudder. Shift/Z — throttle.',
    'P — autopilot (holds heading and height, and nothing else). T — take the tail gun.',
    /* Both keys refuse on the ground and in an attitude the gyro will not
     * take, and a player who does not know that reads the refusal as a dead
     * key — see the toast note in the keydown handler. Say the condition. */
    'P and T both need you airborne, wings level and out of the stall — on the runway they will say no.',
    'On the gun: mouse traverses the turret, left button fires. Nobody is flying while you are back there.',
    'F/G — flaps. Hold Space — air brake. B — wheel brakes. V — parking brake.',
    '3 — battery. 4 — fuel. 1/2 — start or stop your two engines (three and four).',
    '1-5 — pick a line when the release choice is on screen. 1-3 for the engine emergency.',
    'C — camera. Tab — pause or resume; restart from the last checkpoint.',
  ],
  onPause: () => {
    game.paused = true;
    mission.paused = true;
    input.enabled = false;
    player.enabled = false;
    player.clearKeys();
    input.clear();
    interaction.release();
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    game.paused = false;
    mission.paused = false;
    input.enabled = true;
    player.enabled = !mission.inCockpit;
    audio.ctx?.resume?.();
    last = performance.now();
    requestLock();
  },
  recovery: createCampaignSceneRecovery({
    campaign: enolaRecoveryCampaign,
    sceneId: SCENE_IDS.ENOLA_SQUATCH,
    location: window.location,
    restartCheckpoint: () => mission.requestRestart(),
    canRestartCheckpoint: () => Boolean(mission.checkpoint),
  }),
});

$('es-again')?.addEventListener('click', () => {
  if (enolaCampaignComplete && !enolaCampaignPreview) {
    enolaCampaign.navigate(SCENE_IDS.MANSION_RETURN, { spawn: 'driveway' });
    return;
  }
  window.location.reload();
});

/* ------------------------------------------------------------------ */
/* Input                                                              */
/* ------------------------------------------------------------------ */

document.addEventListener('mousemove', (e) => {
  if (game.paused) return;
  if (dragLook && !dragging) return;
  if (mission.gunner.manned) mission.gunner.look(e.movementX, e.movementY);
  else if (mission.inCockpit) cameras.look(e.movementX, e.movementY);
  else if (player.enabled) player.handleMouseMove(e.movementX, e.movementY);
});

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  if (game.paused) return;
  if (mission.gunner.manned) mission.gunner.setFiring(true);
  else if (!mission.inCockpit) interaction.press();
});

document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  dragging = false;
  if (mission.gunner.manned) mission.gunner.setFiring(false);
  if (!mission.inCockpit) interaction.release();
});

document.addEventListener('keydown', (e) => {
  if (!game.started) return;
  if (e.code === 'Escape') return;
  if (game.paused) return;
  if (e.repeat) return;
  /* On foot these are the same durable five slots as Mansion and Siege.
   * Once aboard, 1/2 return to engine start and the authored 1–5 dialogue
   * choices keep priority; the tail gun remains station equipment and never
   * enters this carry list. */
  if (!mission.inCockpit && !currentChoice() && /^Digit[1-5]$/.test(e.code)) {
    finalArcLoadout.select(Number(e.code.slice(5)) - 1);
    paintDurableCarry();
    const id = finalArcLoadout.items[finalArcLoadout.selected];
    hud.toast(id ? FINAL_ARC_WEAPON_CATALOG[id].name.toUpperCase() : 'EMPTY SLOT');
    e.preventDefault();
    return;
  }
  if (!mission.inCockpit && e.code === 'KeyQ') {
    finalArcLoadout.stow();
    paintDurableCarry();
    hud.toast('WEAPON STOWED');
    e.preventDefault();
    return;
  }
  const code = input.keyEvent(e, true);
  if (code === 'Space' || code === 'Shift' || code === 'Control') e.preventDefault();
  player.setKey(e.code, true);
  if (!mission.inCockpit && e.code === 'KeyE') interaction.press();
  // The flashing camera hint goes away the first time the player uses the key
  // it is pointing at. `KeyC` itself is `FlightInput`'s own 'camera' action,
  // handled through `input.onAction` — this only dismisses the tip.
  if (e.code === 'KeyC') dismissCameraTip();
  /* P and T. Neither is in `FlightInput`'s action map and neither should be:
   * that file is shared with the Beef Run, which has no autopilot and no
   * turret. Handled here, on this page only.
   *
   * THE TOASTS USED TO LIE (owner playtest, 2026-08-04: "not sure if P and T
   * for tail gun work"). Both keys have always worked — dispatched as real
   * keyboard events in a browser they engage the autopilot and take the
   * turret, verified by reading the state back. What they did NOT do was tell
   * the truth when they refused: `toggleAutopilot()` returns false both when
   * it has just switched the gyro OFF and when it would not take the
   * aeroplane at all, and both came up as "AUTOPILOT OFF"; `toggleGun()` did
   * the same with "BACK IN THE SEAT" for a player who had never left it. A key
   * that answers with the opposite of what it did reads exactly like a key
   * that does nothing. So the toast is now raised off the CHANGE OF STATE, and
   * a refusal says why (in `MissionController`, on the glass, where the
   * character's own line already goes). */
  if (mission.inCockpit && e.code === 'KeyP') {
    const was = mission.autopilot.engaged;
    const on = mission.toggleAutopilot();
    if (on !== was) hud.toast(on ? 'AUTOPILOT ENGAGED' : 'AUTOPILOT OFF');
  }
  if (mission.inCockpit && e.code === 'KeyT') {
    const was = mission.gunner.manned;
    const autoWas = mission.autopilot.engaged;
    const on = mission.toggleGun();
    if (on !== was) hud.toast(on ? 'TAIL GUN — LEFT BUTTON TO FIRE' : 'BACK IN THE SEAT');
    // Coming back to the pilot's seat gives the autopilot back automatically —
    // see MissionController.leaveGun(). Same toast the 'P' key raises for the
    // same state change, so the seat switch reads exactly like switching it
    // off by hand would have.
    if (autoWas && !mission.autopilot.engaged) hud.toast('AUTOPILOT OFF');
  }
  // The nightfall cut is skippable — see `MissionController.skipCutscene()`.
  if (mission.phase === 'nightfall' && (e.code === 'Space' || e.code === 'Enter')) {
    mission.skipCutscene();
  }
  handleMissionChoiceKey(e.code);
}, true);

document.addEventListener('keyup', (e) => {
  input.keyEvent(e, false);
  player.setKey(e.code, false);
  if (!mission.inCockpit && e.code === 'KeyE') interaction.release();
}, true);

window.addEventListener('blur', () => {
  dragging = false;
  player.clearKeys();
  input.clear();
});

input.onAction = (name) => {
  switch (name) {
    case 'camera': {
      const v = cameras.cycle();
      hud.toast(`${v.toUpperCase()} VIEW`);
      break;
    }
    case 'flapsDown':
      flightHud.setFlaps(input.stepFlaps(1));
      break;
    case 'flapsUp':
      flightHud.setFlaps(input.stepFlaps(-1));
      break;
    case 'parkingBrake':
      input.parkingBrake = !input.parkingBrake;
      hud.toast(input.parkingBrake ? 'PARKING BRAKE SET' : 'PARKING BRAKE OFF');
      break;
    case 'battery':
      engines.masterBattery = !engines.masterBattery;
      hud.toast(engines.masterBattery ? 'BATTERY ON' : 'BATTERY OFF');
      break;
    case 'fuel':
      engines.fuelSelectors = !engines.fuelSelectors;
      hud.toast(engines.fuelSelectors ? 'FUEL SELECTORS OPEN' : 'FUEL OFF');
      break;
    case 'startLeft':
    case 'startRight': {
      // Only meaningful during preflight — see the auto-start note above.
      // Player-started engines are indices 2/3 ("three"/"four"); the
      // captain's 0/1 ("one"/"two") crank themselves.
      if (mission.phase !== 'preflight') break;
      const i = name === 'startLeft' ? 2 : 3;
      if (engines.engines[i].running) engines.kill(i);
      else {
        const r = engines.crank(i);
        if (r === 'nopower') hud.toast('NO POWER — BATTERY OFF');
        else if (r === 'nofuel') hud.toast('NO FUEL TO THE ENGINE');
      }
      break;
    }
    case 'help':
      hud.toast(flightHud.toggleControls() ? 'CONTROLS SHOWN' : 'CONTROLS HIDDEN');
      break;
    case 'pause':
      pauseMenu.toggle();
      break;
    default:
      break;
  }
};

/* ------------------------------------------------------------------ */
/* Frame                                                              */
/* ------------------------------------------------------------------ */

let last = performance.now();
loading?.classList.add('hidden');

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (game.started && !game.paused && !flightHud.completeUp) {
    simulateFrame(dt);
  }

  postfx.render();
  postfx.sample(dt);
}

frame();

document.addEventListener('visibilitychange', () => {
  if (!game.started) return;
  audio.setMasterVolume?.(document.hidden ? 0 : 0.9);
});
