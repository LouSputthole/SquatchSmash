/**
 * The Enola Squatch — boot, wiring, and the frame.
 *
 * A standalone scene, entered directly (no apartment, no campaign save) — the
 * same way `enolasquatch.html` is a standalone sibling of `beefrun.html`, not
 * a page reached through it. Modeled closely on `src/beefrun/main.js`'s
 * composition-root pattern (renderer/scene/camera setup, how it wires
 * AircraftPhysics/EngineSystem/CameraManager/FlightInput/WeatherSystem/
 * DetectionSystem/MissionController/FlightHud together and drives them in the
 * render loop, its pause/restart/checkpoint wiring, its console debug-handle
 * convention). It is simplified where this mission genuinely has less going
 * on — no campaign/story save, no crate-based cargo, no terrain streaming —
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
import { createPauseMenu } from '../core/pause-menu.js';
import { roomEnvironment } from '../world/textures.js';

import { WP } from '../beefrun/config.js';
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
} from './config.js';
import { EnolaSquatch } from './scenes/EnolaSquatch.js';
import { TargetCity, craterOffset } from './scenes/TargetCity.js';
import { FatSquatch } from './payload/FatSquatch.js';
import { DialogueSystem } from './dialogue/DialogueSystem.js';
import { RELEASE_LINES } from './dialogue/script.js';
import { MissionController } from './mission/MissionController.js';
import { EnolaPreflight } from './preflight.js';
import { createCrew, makeToolCart } from './crew.js';
import { EnolaAudioEngine, EnolaMissionAudio } from './audio.js';

const CORRIDOR = LANDMARKS_EAST.find((l) => l.id === 'corridor');
const COMPOUND = LANDMARKS_EAST.find((l) => l.id === 'compound');
const RETURN_HEADING = (TURN_POINT.newHeading + 180) % 360;

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const overlay = $('overlay');
const startBtn = $('start-btn');
const loading = $('loading');

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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  const boundsX = [-1400, 10200];
  const boundsZ = [-4200, 1000];
  const segX = 232;
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
    const tint = 0.86 + fbm(wx / 110, wz / 110, 2) * 0.28;
    c.multiplyScalar(tint);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat_ = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const groundMesh = new THREE.Mesh(geo, mat_);
  groundMesh.position.set(cx, 0, cz);
  groundMesh.receiveShadow = true;
  sceneRef.add(groundMesh);

  // A sparse, single-draw-call scatter of simple cone "trees/scrub" for
  // atmosphere — not a full forest system, just enough that the corridor
  // does not read as bare ground. Kept off the airfield's own footprint and
  // off the compound's landing-pad carve.
  const COUNT = 460;
  const scatterGeo = coneGeo(3, 9, 6);
  const scatterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const scatter = new THREE.InstancedMesh(scatterGeo, scatterMat, COUNT);
  const rand = rng(0xE57A11);
  const dummy = new THREE.Object3D();
  let used = 0;
  for (let i = 0; i < COUNT && used < COUNT; i++) {
    const wx = boundsX[0] + rand() * width;
    const wz = boundsZ[0] + rand() * depth;
    const zone = ZONES_EAST[zoneIndexForX(wx)];
    if (zone.trees <= 0) continue;
    if (rand() > zone.trees / 60) continue;
    // Clear of the runway/apron footprint and of the target's flattened pad.
    if (Math.abs(wx - WP.x) < 60 && Math.abs(wz) < WP.rwyHalf + 90) continue;
    if (wx > -160 && wx < 40 && wz > 300 && wz < 460) continue;
    if (Math.hypot(wx - TARGET_X, wz - COMPOUND.z) < 520) continue;
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
  let touched = 0;
  for (let i = 0; i < pos.count; i++) {
    const wx = ox + pos.getX(i);
    const wz = oz + pos.getZ(i);
    const d = Math.hypot(wx - craterRecord.x, wz - craterRecord.z);
    if (d >= outer) continue;
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
  pos.needsUpdate = true;
  if (colours) colours.needsUpdate = true;
  geo.computeVertexNormals();
  return touched;
}

/* ------------------------------------------------------------------ */
/* Systems                                                            */
/* ------------------------------------------------------------------ */

const hud = new Hud();
const flightHud = new FlightHud();

const audio = new EnolaAudioEngine();
const missionAudio = new EnolaMissionAudio(audio);

const airfield = buildAirfield(scene, {});

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

/* Squatchbourg. Built once, up front, because it is 15 draw calls and about
 * 22k triangles that never change until they are removed — see the budget note
 * at the top of `scenes/TargetCity.js`. */
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

const weather = new WeatherSystem(scene, renderer);
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
  onLine: (line) => crew.speak(line.who, (line.hold ?? 2) * 0.8),
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
// Defense/Targeting are created internally by MissionController when the ctx
// omits them (see its constructor) — using our own `getHeight` closure. The
// debug handle below reads them back off `mission` rather than constructing
// duplicate instances.

/* The one wire that keeps the crater honest: the mission tells us the hole
 * exists, we fold it into the ground function every other system already holds
 * a reference to, and we sink the coarse ground mesh under the fine one. */
mission.onCrater = (crater) => {
  if (!crater) return;
  activeCrater = crater;
  depressGroundForCrater(crater);
};

mission.onComplete = (report) => {
  flightHud.showComplete(report);
  missionAudio.sting?.();
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
const cutText = document.createElement('div');
cutText.style.cssText = [
  'position:absolute', 'left:0', 'right:0', 'bottom:13%', 'text-align:center',
  'font:600 26px/1.25 "Trebuchet MS",system-ui,sans-serif',
  'letter-spacing:0.18em', 'color:#e8c86a', 'text-shadow:0 2px 14px #000',
].join(';');
const cutSub = document.createElement('div');
cutSub.style.cssText = [
  'position:absolute', 'left:0', 'right:0', 'bottom:9.5%', 'text-align:center',
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

  const focus = inCockpit ? physics.position : player.position;
  weather.update(dt, focus);
  applyEastFog(focus.x, dt);
  airfield.update(dt, 0.4 + weather.crosswind * 0.1, 0);

  if (inCockpit) {
    cameras.update(dt, physics, aircraft.group, aircraft.pilotEye, {
      roughness: physics.gust.length() * 0.05 + (physics.onGround ? physics.groundSpeed * 0.01 : 0),
      gLoad: physics.gLoad,
    });
  }
  audio.updateListener?.(camera);

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
      const x = TARGET_X - 500;
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
      const x = TARGET_X - 200;
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
  mission, physics, engines, aircraft, payload, dialogue, weather, detection,
  cameras, input, hud, flightHud, scene, camera, renderer, airfield,
  player, interaction, preflight, crew, city, audio: missionAudio,
  get defense() { return mission.defense; },
  get targeting() { return mission.targeting; },
  get crater() { return activeCrater; },
  groundHeight: groundHeightCombined,
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
      cityDestroyed: city.destroyed,
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
    game.started = true;
    mission.begin();
    hud.say('<em>Whispering Pines Municipal, well after dark.</em> Walk her with the Captain before you get in.', 6000);
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
    'In the aircraft: W/S — pitch. A/D — bank. Q/E — rudder. Shift/Ctrl — throttle.',
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
  onRestart: () => {
    if (mission.checkpoint) mission.requestRestart();
    else window.location.reload();
  },
  restartLabel: () => (mission.checkpoint ? 'Restart from checkpoint' : 'Restart scene'),
  canRestart: () => game.started && !mission.finished,
});

$('es-again')?.addEventListener('click', () => window.location.reload());

/* ------------------------------------------------------------------ */
/* Input                                                              */
/* ------------------------------------------------------------------ */

document.addEventListener('mousemove', (e) => {
  if (game.paused) return;
  if (dragLook && !dragging) return;
  if (mission.inCockpit) cameras.look(e.movementX, e.movementY);
  else if (player.enabled) player.handleMouseMove(e.movementX, e.movementY);
});

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  if (game.paused) return;
  if (!mission.inCockpit) interaction.press();
});

document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  dragging = false;
  if (!mission.inCockpit) interaction.release();
});

document.addEventListener('keydown', (e) => {
  if (!game.started) return;
  if (e.code === 'Escape') return;
  if (game.paused) return;
  if (e.repeat) return;
  const code = input.keyEvent(e, true);
  if (code === 'Space' || code === 'Shift' || code === 'Control') e.preventDefault();
  player.setKey(e.code, true);
  if (!mission.inCockpit && e.code === 'KeyE') interaction.press();
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

  renderer.render(scene, camera);
}

frame();

document.addEventListener('visibilitychange', () => {
  if (!game.started) return;
  audio.setMasterVolume?.(document.hidden ? 0 : 0.9);
});
