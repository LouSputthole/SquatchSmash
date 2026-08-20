/**
 * THE SPECIAL MEETING — the exterior, assembled.
 *
 * One call puts the whole block on the screen: night, geometry, the car, the
 * sound, and the ten-second wait that ends with headlights. A scene's
 * `main.js` should not have to know that the skyline is instanced or which
 * three lamp posts are real.
 *
 * What this deliberately does NOT do, because it is not this pass's to own:
 *
 *   - It does not touch the campaign. There is no `SCENE_IDS` entry for this
 *     scene yet, no page, and no route into it; whoever adds those owns
 *     `src/core/campaign.js` and the apartment's departure. This module is
 *     handed a `scene` and gives back a world.
 *   - It stages no people. It hands out seats — four of them, by name — and a
 *     `sedan.occupy()` that keeps anything in one of them as the car moves.
 *     Who is in the car, what they say, and which seat the Prospect ends up in
 *     is the writing, and the writing is somebody else's file.
 *
 * Usage from a scene:
 *
 *   const stage = stageSpecialMeeting(scene, { renderer, audio });
 *   const player = new Player(camera, stage.world);
 *   player.position.copy(stage.spawn.position);
 *   player.yaw = stage.spawn.yaw;
 *   player.onFootstep = (surface, i) => audio.footstep(stage.footstepSurface, i);
 *   // per frame:
 *   stage.update(dt, player.position);
 */
import * as THREE from 'three';

import { buildSpecialMeetingBlock } from './block.js';
import { createSpecialMeetingAmbience } from './ambience.js';
import { applySpecialMeetingNight } from './night.js';
import { buildMeetingSedan } from './sedan.js';
import { createArrivalSequence } from './arrival.js';
import { ROAD, SPAWN, groundAt } from './layout.js';

/** Wet pavement. `audio.footstep` resolves it to the `footstep.street.wet` cue. */
export const FOOTSTEP_SURFACE = 'street.wet';

/** A standing eye, over whatever he is standing on. */
export const EYE_HEIGHT = 1.66;

export function stageSpecialMeeting(scene, {
  renderer = null,
  audio = null,
  registerLight = null,
  shadows = true,
  onPhase = null,
} = {}) {
  const night = applySpecialMeetingNight(scene, { renderer, shadows });
  const block = buildSpecialMeetingBlock(scene, { registerLight });

  const sedan = buildMeetingSedan();
  scene.add(sedan.group);

  const ambience = createSpecialMeetingAmbience({
    audio,
    alleyMouth: block.anchors.alleyMouth.clone().setY(1.6),
  });

  const arrival = createArrivalSequence({ sedan, ambience, onPhase });

  /* The car is a moving wall. One Box3 is pushed into the collision list at
   * build time and refreshed in place every frame — pushing and splicing a
   * collider per frame would invalidate the broadphase's bucketing every
   * frame, which is the one thing that structure exists to avoid. */
  const sedanCollider = new THREE.Box3();
  sedanCollider.copy(sedan.collider());

  const world = {
    colliders: [...block.colliders, sedanCollider],
    floorZones: block.floorZones,
    groundAt,
  };

  const spawnPosition = new THREE.Vector3(SPAWN.x, SPAWN.groundY + EYE_HEIGHT, SPAWN.z);

  return {
    night,
    block,
    sedan,
    ambience,
    arrival,
    world,
    anchors: block.anchors,
    interactables: block.interactables,
    lights: block.lights,
    footstepSurface: FOOTSTEP_SURFACE,
    kerbHeight: ROAD.kerbHeight,

    spawn: {
      position: spawnPosition,
      yaw: SPAWN.yaw,
      pitch: -0.04,
    },

    /** Bring the sound up. Separate from building, because a browser will not
     * start an AudioContext until the player has clicked something. */
    begin() {
      ambience.start();
      return this;
    },

    update(dt, focus = null) {
      block.update(dt);
      arrival.update(dt);
      sedanCollider.copy(sedan.collider());
      night.update(dt, focus ?? spawnPosition);
      return this;
    },

    dispose() {
      ambience.stop();
      sedan.dispose();
      scene.remove(sedan.group);
      block.dispose();
      night.dispose();
    },
  };
}
