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
 * KNOWN GAP (flagged, not patched -- see the final report): Phase 1's pool
 * deck (`buildPoolPatio()`, pad = 6 around POOL) is a flat platform poured at
 * GROUND_Y with no ramp or steps connecting it to the surrounding at-grade
 * lawn, and the building's own north wall has no door onto it either
 * ("fully solid, no openings specified" -- Phase 1's own comment on that
 * wall). On foot, the patio is not actually reachable: the ledge is a flat
 * 1.2 m rise, well over what the Player controller's jump can clear
 * (JUMP_SPEED=4.65 / JUMP_GRAVITY=13.5 -> well under a 1 m hop), and there is
 * no interior route to it either. Scope for this step is composition/
 * lighting/player-wiring, not redesigning either phase's exterior geometry,
 * so no bridging ramp has been added here -- but the rect is still
 * recognised below purely for height *resolution*, so a debug teleport (or
 * anything else that legitimately ends up standing there) reads a sane
 * GROUND_Y instead of rendering as the camera buried in the deck.
 */
const POOL_DECK_PAD = 6;
const poolDeck = {
  x0: POOL.x0 - POOL_DECK_PAD,
  x1: POOL.x1 + POOL_DECK_PAD,
  z0: POOL.z0 - POOL_DECK_PAD,
  z1: POOL.z1 + POOL_DECK_PAD,
};

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
  if (inRectXZ(poolDeck, x, z)) return GROUND_Y;
  return 0;
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
    position: new THREE.Vector3(0, GROUND_Y + 1, 85),
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
/* The base MAX_DISTANCE (2.7 m, set inside core/interaction.js) is tuned
 * for close-up apartment fixtures (drawers, switches, a phone on a
 * nightstand). This scene's flavour props are architectural set pieces
 * meant to be read from across a room -- the chandelier hangs 6+ m above
 * the hall floor, the fountain statue is a driveway's width away -- so the
 * raycast range is extended for this scene only. This edits the instance's
 * own public property, not core/interaction.js. */
interaction.raycaster.far = 34;

function flavor(mesh, label) {
  if (!mesh) return;
  interaction.register(mesh, { label, enabled: () => running });
}
flavor(
  grounds.props.fountain.statue,
  'A towering silver Sasquatch, fist raised. Lou had it commissioned the week after the primary.',
);
flavor(
  interior.props.hall.chandelier,
  'Crystal and gold, hanging over the hall like it dares you to mention the electric bill.',
);
flavor(
  interior.props.boardroom.screen,
  '"SILVER SASQUATCHES -- ANNUAL SHAREHOLDER MEETING." Confidential. Allegedly.',
);
/* MansionInterior.js's buildOffice() builds the display case inline and
 * does not return a separate handle for it (only `{ desk }` comes back in
 * officeProps) -- it cannot be registered on its own without editing that
 * file. The desk sits directly in front of it in the same small room, so
 * the flavour line covers both rather than silently dropping the case. */
flavor(
  interior.props.office.desk,
  "Lou's desk. Behind it, a locked glass case holds something he has never shown anyone.",
);
for (const trophyCase of interior.props.trophyRoom.cases) {
  flavor(trophyCase, 'Tournament silverware. The family takes its bracket seeding very seriously.');
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
  getObjective: () => 'Walk the grounds. There is no mission here yet -- just the house.',
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
  audio.updateListener(camera);
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (running && !sharedPauseMenu.isPaused()) updateGame(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

/* ================================================================== */
/* Debug handle -- the same pattern every verify-*.mjs script in this     */
/* repo uses to drive a scene headlessly (see window.__bing / window.      */
/* squatchfather / window.GRAVEYARD).                                     */
/*                                                                        */
/* `teleport(x, y, z, yawDeg)`: `y` is a *floor height*, in the same units */
/* as every anchor's `.y` component in `rooms` below (GROUND_Y, UPPER_Y,   */
/* BASEMENT_Y, or 0 at street grade) -- not an eye/camera height. It snaps */
/* `player.ground` directly to `y` (no smoothing lerp) so the camera reads */
/* the correct height on the very next render, then runs one manual        */
/* `player.update()` pass (matching src/bing/main.js's own teleport, which  */
/* does the same single-step nudge) so collision resolution and the        */
/* footstep/eye-height state settle immediately. `yawDeg` is degrees; 0     */
/* faces -Z (three.js's default forward), matching `grounds.anchors.        */
/* spawnYaw`'s own documented convention.                                  */
/* ================================================================== */
function teleport(x, y, z, yawDeg = 0) {
  player.mode = 'walk';
  player.position.set(x, y, z);
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
  teleport,
  /** Step the simulation without a real animation frame -- for headless verification. */
  tick(seconds = 1, step = 1 / 60) {
    for (let elapsed = 0; elapsed < seconds; elapsed += step) {
      updateGame(Math.min(step, seconds - elapsed));
    }
  },
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
