/**
 * Headless builder for the strict geometry gate.
 *
 * Same contract as `src/golf/runtime-geometry.js`: construction and authored
 * pose only, no WebGL, no DOM wiring beyond the canvas textures the shared
 * shim already covers, no audio, no campaign boot. Node can import it.
 *
 * The scene has TWO authored geometry states worth gating and they are
 * genuinely different arrangements of the same block:
 *
 *   `waiting`  — the car is a hundred metres away up the cross street, dark.
 *                This is the state the player spends the first ten seconds in
 *                and the one the pavement, the doorway and the alley are
 *                actually read from.
 *   `arrived`  — the car is at the kerb, headlights on, boot open. The boot
 *                lid is the one moving part in the scene that ends up
 *                overhanging other geometry, so it is worth a state of its own.
 *
 * NOT REGISTERED YET, on purpose: `tools/geometry-scenes.mjs` is the registry
 * and `tests/geometry-scene-registry.test.mjs` pins the adapter list, and both
 * belong to whoever lands this scene's page and campaign id. Adding the entry
 * is then four lines and a `tools/geometry-allowlists/specialmeeting.json`.
 */
import { buildSpecialMeetingBlock } from './block.js';
import { applySpecialMeetingNight } from './night.js';
import { buildMeetingSedan } from './sedan.js';
import { SEDAN_STAGING, SEDAN_STOP, SPAWN } from './layout.js';
import { kerbFramingBeats, publishMeetingFramingBeats } from './shots.js';

export const SPECIAL_MEETING_GEOMETRY_STATES = Object.freeze(['waiting', 'arrived']);

/**
 * @param {THREE.Scene} scene
 * @param {object} options `state` is one of SPECIAL_MEETING_GEOMETRY_STATES.
 * @returns {{block, sedan, night, roots: Array, colliders: Array}}
 */
export function buildSpecialMeetingRuntimeGeometry(scene, {
  renderer = null,
  state = 'waiting',
} = {}) {
  if (!SPECIAL_MEETING_GEOMETRY_STATES.includes(state)) {
    throw new Error(`Special Meeting runtime geometry: unknown state ${state}`);
  }

  const night = applySpecialMeetingNight(scene, { renderer, shadows: false });
  const block = buildSpecialMeetingBlock(scene, {});
  const sedan = buildMeetingSedan();
  scene.add(sedan.group);

  if (state === 'arrived') {
    sedan.placeAt(SEDAN_STOP.x, SEDAN_STOP.z, SEDAN_STOP.heading);
    sedan.setHeadlights(true);
    sedan.setBrake(0.35);
    sedan.setTrunk(1);
    sedan.trunk.setOpen(1);
    sedan.setCabinLight(true);
  } else {
    sedan.placeAt(SEDAN_STAGING.x, SEDAN_STAGING.z, SEDAN_STAGING.heading);
  }

  /* AND THE SHOT LIST. `src/specialmeeting/shots.js` says what a beat here may
   * honestly claim; this is why it is published from the headless builder
   * rather than from `stage.js`. The block's beats are all one camera -- the
   * pavement spawn -- and its target is the block's own kerb anchor, so
   * everything either of them needs is finished by the time this line runs and
   * none of it depends on where the four bodies end up. `tools/verify-framing`
   * traverses the roots the Adapter hands it, which for this scene is the
   * whole Scene, so hanging them here is enough to publish them. */
  publishMeetingFramingBeats(scene, kerbFramingBeats({
    state,
    anchors: block.anchors,
    groundY: SPAWN.groundY,
    spawn: SPAWN,
  }));

  return Object.freeze({
    block,
    sedan,
    night,
    roots: Object.freeze([
      Object.freeze({ id: 'specialmeeting.block', root: block.group }),
      Object.freeze({ id: 'specialmeeting.sedan', root: sedan.group }),
    ]),
    colliders: Object.freeze([...block.colliders, sedan.collider()]),
  });
}
