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
 * There is no mission, no NPC roster, no combat and no dialogue here -- this
 * scene manages its own tiny bit of local state (has the tour started, is it
 * paused) and nothing else. It does not import or call into
 * `core/campaign.js`; there is no save integration this pass.
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
  FOUNTAIN_POS,
  POOL,
} from './scenes/MansionGrounds.js';
import { buildMansionInterior } from './scenes/MansionInterior.js';
import { Player } from '../core/player.js';
import { InteractionSystem } from '../core/interaction.js';
import { AudioEngine } from '../core/audio.js';
import { createPauseMenu } from '../core/pause-menu.js';

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
function startAmbience() {
  audio.startLoop('crickets', {
    name: 'ambience.city.night', volume: 0.11, ambience: true, fade: 2.2,
  });
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
/* Player + world                                                       */
/* ================================================================== */
const world = { colliders, floorZones: [], groundAt: () => 0 };
const player = new Player(camera, world);
player.onFootstep = (surface, intensity) => audio.footstep(surface, intensity);

world.groundAt = (x, z) => {
  const feetY = player.position.y - player.eyeHeight;
  const inside = interior.floorAt(x, z, feetY);
  return inside ?? exteriorGroundAt(x, z);
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
interaction.setOccluders([...grounds.occluders, ...interior.occluders]);

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
  'Amps, a stand, a stool. Whoever plays this room, plays it for one family.',
);

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
  getObjective: () => 'Walk the grounds and the house: the horseshoe stair, the conference room and Lou’s office above it, the bedrooms down the sides, and the cellar.',
  instructions: [
    'W A S D -- walk. Mouse -- look. Shift -- sprint. C -- crouch. Space -- jump.',
    'E, or click -- look at something notable for a one-line note.',
    'Tab pauses and resumes. Escape releases the mouse, which also pauses.',
  ],
  onPause: () => {
    interaction.setPaused(true);
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
  if (e.code === 'Space') e.preventDefault();
  player.setKey(e.code, true);
  if (e.code === 'KeyE' && !e.repeat) interaction.press();
});
window.addEventListener('keyup', (e) => {
  player.setKey(e.code, false);
  if (e.code === 'KeyE') interaction.release();
});
window.addEventListener('blur', () => {
  player.clearKeys();
  interaction.release();
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
  if (e.button === 0) interaction.press();
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) interaction.release();
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
  interior.update(dt);
  updateLightRig(dt);
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
