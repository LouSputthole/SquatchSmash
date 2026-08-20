/**
 * INITIATION NIGHT — the whole place, as one call.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * THE NIGHT
 *
 *   A track through black woods, and a clearing at the end of it with two
 *   cars pointing their headlights at some mud. The prospects are lined up in
 *   it. One of them answers wrong and is shot where he stands. Then Gratin and
 *   Seff walk the rest of them out, one at a time, put them on their knees in
 *   the light and shoot them in the back of the head — every one, including
 *   the woman who was alive in the boot of the car parked behind the line.
 *
 *   Then the player, alone, is walked thirty metres up a trail to a cabin with
 *   the light on, and made.
 *
 * This module builds all of that except the people and the script.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * USING IT
 *
 *   import { buildInitiationCabinSite } from './cabin/index.js';
 *
 *   const site = buildInitiationCabinSite();
 *   scene.add(site.root);
 *   colliders.push(...site.colliders);   // {x, z, r}, this scene's own shape
 *   // per frame:
 *   site.update(dt);
 *
 * Everything the ceremony needs to place a body is on `site.marks`, which is
 * the whole of `site.js`: kneel marks with their executioner and escort
 * stances, the blocking inside the cabin, the table sockets, the trail.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT main.js HAS TO DROP WHEN IT ADOPTS THIS  (integration contract)
 *
 * These are not suggestions — running both builds the same site twice:
 *
 *   1. THE FOREST (`main.js`'s `addTree` scatter, ~150 trees, and its
 *      `forestFits`). This subtree owns the trees now, deterministically, with
 *      keep-outs that know where the trail and the cabin are. Two forests
 *      interleave, and half of one moves on every reload.
 *   2. THE GROUND PLANE. Ours is a slab with a top at y = 0 rather than a
 *      zero-thickness plane, which is what lets the gate see everything on
 *      this site as resting on something. Keeping both z-fights.
 *   3. THE BONFIRE AND THE STAGE, with its purple banner and its two torches.
 *      The ceremony has moved indoors; a lit stage with a banner on it, forty
 *      feet from four people being executed in the mud, is the old scene's
 *      staging and it fights this one. `KEEP_OUT` still fences both of their
 *      footprints off from the trees, so leaving them in place is survivable
 *      while the rewrite lands — but they are not part of this night.
 *
 * And what it should ADD:
 *
 *   4. `poseKneeling` / `poseFallen` from `./staging.js` for the four
 *      executions, and `attachToHand` for the pistol — which today is hung on
 *      `armR` with a hand-tuned offset, the same fault that put beer cans on
 *      golfers' forearms.
 *   5. `sayFrom()` from `./ambience.js` for every line spoken on the walk up
 *      the trail. A one-shot without `follow` stays in the mud.
 *   6. A second pistol, or a `makeGun()` factory: `main.js` has exactly ONE
 *      gun group and one muzzle light, and this night has two executioners
 *      working through five people.
 */

import * as THREE from 'three';

import { createCabinAmbience } from './ambience.js';
import { buildExecutionGround } from './execution-ground.js';
import { buildCabinExterior } from './exterior.js';
import { buildCabinInterior } from './interior.js';
import * as marks from './site.js';
import { CLEARING_CARS, YARD_CARS } from './site.js';
import { buildGroundSlab, buildWoods } from './woods.js';

export * from './site.js';
export * from './staging.js';
export { createCabinAmbience, footingAt, playFootstep, sayFrom } from './ambience.js';
export { buildCeremonyProps, placeOnTable, restOn } from './props.js';

/**
 * Build the site.
 *
 * @param {object} [options]
 * @param {number} [options.seed] every scatter on the site runs off this.
 * @param {boolean} [options.woods] build the forest, the ground and the paths.
 * @param {boolean} [options.clearing] build the mud, the barrel and the cars.
 * @param {boolean} [options.cabin] build the cabin, inside and out.
 * @param {object} [options.audio] an AudioEngine, or null for silence.
 */
export function buildInitiationCabinSite({
  seed = 0x1a17ed,
  woods = true,
  clearing = true,
  cabin = true,
  audio = null,
} = {}) {
  const root = new THREE.Group();
  root.name = 'initiation.site';
  const colliders = [];
  const lights = [];
  const updaters = [];
  let props = null;

  if (woods) {
    const built = buildWoods({ seed });
    root.add(built.group);
    colliders.push(...built.colliders);
  } else {
    /* Without the trees there is still ground: everything on this site is
     * float-checked against it, and a partial build with no floor under it
     * is a partial build that reports every car and every wall as hovering. */
    root.add(buildGroundSlab());
  }

  if (clearing) {
    const built = buildExecutionGround({ seed: seed ^ 0x9e1d, cars: CLEARING_CARS });
    root.add(built.group);
    colliders.push(...built.colliders);
    lights.push(...built.lights);
  }

  if (cabin) {
    /* The yard: same builder, no mud and no barrel — two cars that were
     * already here, parked by people who arrived before anybody was shot. */
    const yard = buildExecutionGround({
      seed: seed ^ 0x4a12, cars: YARD_CARS, mud: false, barrel: false,
    });
    yard.group.name = 'initiation.cabin.yard';
    root.add(yard.group);
    colliders.push(...yard.colliders);

    const exterior = buildCabinExterior();
    root.add(exterior.group);
    colliders.push(...exterior.colliders);
    lights.push(...exterior.lights);
    updaters.push(exterior.update);

    const interior = buildCabinInterior();
    root.add(interior.group);
    colliders.push(...interior.colliders);
    lights.push(...interior.lights);
    updaters.push(interior.update);
    props = interior.props;
  }

  const ambience = createCabinAmbience({ audio });

  return {
    root,
    colliders,
    lights,
    props,
    ambience,
    /** Every measurement on the site: kneel marks, blocking, trail, sockets. */
    marks,
    update(dt) {
      for (const tick of updaters) tick(dt);
    },
    dispose() {
      root.traverse((object) => {
        if (object.isMesh) object.geometry?.dispose?.();
      });
    },
  };
}
