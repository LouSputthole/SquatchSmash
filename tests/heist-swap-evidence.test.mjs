import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { HEIST_PHASE_PLAYER_BOUNDS } from '../src/heist/config.js';
import { buildHeistLevel } from '../src/heist/level.js';
import { SWAP_EVIDENCE, objectiveForState, swapEvidencePlan } from '../src/heist/orders.js';

/**
 * THE SEVENTH PIECE OF EVIDENCE.
 *
 * Owner, playtest 2026-08-26: at the swap yard he disposed of six pieces of
 * evidence and *could not find the seventh*.
 *
 * The measurement below is the answer to "was it reachable at all", and it is
 * yes: every one of the seven props is acquired by a real interaction ray from
 * 98 to 100 per cent of the positions a player can actually stand in. What was
 * missing was on the HUD. The order line named three of the seven actions
 * ("Transfer the cash, change, and bag the weapons") and put a bare `6/7`
 * after them, and three of the seven show no prompt at all until the action
 * before them is done -- so a player at six could be standing two metres from
 * the seventh with nothing on screen that had ever mentioned it.
 *
 * These tests hold both halves: the geometry stays reachable, and the panel
 * names all seven with the count on it.
 */

/** InteractionSystem's reach, from `src/core/interaction.js`. */
const MAX_DISTANCE = 2.7;
/** `debugApproachInteraction` samples from eye height in `src/heist/main.js`. */
const EYE = 1.66;
/** `Player.RADIUS` -- how close the camera can be pushed to a solid. */
const PLAYER_RADIUS = 0.3;

/** Which mesh carries each `swapProgress` flag. */
const PROP_FOR_KEY = Object.freeze({
  trunk: 'trunk',
  bags: 'bags',
  masks: 'masks',
  jackets: 'jackets',
  weapons: 'weapons',
  aid: 'aid',
  wiped: 'wipe',
});

function drivingPhase() {
  const level = buildHeistLevel(new THREE.Scene());
  const driving = level.phases.driving;
  /* `Object3D.raycast` reads `matrixWorld` and never recomputes it, and nothing
   * updates it headlessly without a renderer -- so without this every ray below
   * measures stale matrices and reports the answer with total confidence. */
  driving.group.updateMatrixWorld(true);
  return driving;
}

/** True where the player's own capsule cannot be: inside an authored solid. */
function blocked(phase, x, z) {
  return (phase.colliders ?? []).some((box) => x > box.min.x - PLAYER_RADIUS
    && x < box.max.x + PLAYER_RADIUS
    && z > box.min.z - PLAYER_RADIUS
    && z < box.max.z + PLAYER_RADIUS);
}

/**
 * The fraction of legal standing positions that acquire a prop.
 *
 * The same ring `debugApproachInteraction` walks -- four radii, forty-eight
 * bearings, three aim heights -- clipped to `HEIST_PHASE_PLAYER_BOUNDS` and, on
 * top of what the debug helper does, to positions outside every collider. A
 * viewpoint inside the clean car is not a viewpoint.
 */
function reachFraction(phase, name) {
  const target = phase.interactables[name];
  assert.ok(target, `no interactable named ${name}`);
  target.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(target);
  const centre = box.getCenter(new THREE.Vector3());
  const height = Math.max(0.1, box.max.y - box.min.y);
  const aims = [centre.y, box.min.y + height * 0.68, box.min.y + height * 0.42];
  const [minX, maxX, minZ, maxZ] = HEIST_PHASE_PLAYER_BOUNDS.driving;
  const ray = new THREE.Raycaster();
  ray.far = MAX_DISTANCE;

  let sampled = 0;
  let acquired = 0;
  for (const radius of [1.35, 1.7, 2.05, 2.35]) {
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * Math.PI * 2;
      const px = centre.x + Math.cos(angle) * radius;
      const pz = centre.z + Math.sin(angle) * radius;
      if (px < minX || px > maxX || pz < minZ || pz > maxZ) continue;
      if (blocked(phase, px, pz)) continue;
      sampled += 1;
      for (const aimY of aims) {
        const origin = new THREE.Vector3(px, EYE, pz);
        ray.set(origin, new THREE.Vector3(centre.x - px, aimY - EYE, centre.z - pz).normalize());
        const hits = ray.intersectObject(phase.group, true).filter((hit) => hit.object.isMesh);
        /* InteractionSystem walks the parent chain for a descriptor and stops
         * at the first hit that has none, so the prop has to be genuinely
         * first on the ray -- not merely somewhere along it. */
        if (hits.length && owns(hits[0].object, target)) { acquired += 1; break; }
      }
    }
  }
  return { sampled, acquired, fraction: sampled ? acquired / sampled : 0 };
}

function owns(hit, target) {
  for (let node = hit; node; node = node.parent) if (node === target) return true;
  return false;
}

test('every one of the seven evidence actions has a prop in the swap yard', () => {
  const driving = drivingPhase();
  assert.equal(SWAP_EVIDENCE.length, 7);
  for (const item of SWAP_EVIDENCE) {
    const prop = PROP_FOR_KEY[item.key];
    assert.ok(prop, `no prop mapped for evidence key ${item.key}`);
    assert.ok(driving.interactables[prop], `phase has no interactable ${prop}`);
  }
});

test('all seven are acquired by a real ray from the positions a player can stand in', () => {
  const driving = drivingPhase();
  const measured = SWAP_EVIDENCE.map((item) => ({
    key: item.key,
    ...reachFraction(driving, PROP_FOR_KEY[item.key]),
  }));
  for (const entry of measured) {
    assert.ok(entry.sampled >= 60,
      `only ${entry.sampled} legal viewpoints sampled for ${entry.key}`);
    /* Measured 2026-08-26, after the trunk panel moved to the tailgate:
     * trunk 101/103, bags 138/138, masks 131/131, jackets 173/173,
     * weapons 168/168, aid 140/140, wiped 116/116. The floor is deliberately
     * below all of them and well above the 6/178 the clean car's own door
     * prompt was scoring when the owner played it. */
    assert.ok(entry.fraction >= 0.95,
      `${entry.key} was acquired from ${entry.acquired} of ${entry.sampled} legal `
      + `viewpoints (${(entry.fraction * 100).toFixed(1)} %)`);
  }
});

test('the objective panel names all seven and carries the count', () => {
  const plan = swapEvidencePlan({});
  assert.equal(plan.items.length, 7);
  assert.deepEqual(plan.items[0].tally, { count: 0, total: 7 });
  for (const item of SWAP_EVIDENCE) {
    assert.ok(plan.items.some((row) => row.label === item.label),
      `${item.key} is not named in the panel`);
  }
  /* A step whose prerequisite is not met is drawn hollow rather than dropped:
   * the player is told it exists and that it is not his turn yet. */
  const locked = plan.items.filter((row) => row.required === false).length;
  assert.equal(locked, 3, 'the trunk, the masks and the cash each gate one step');
});

test('the panel ticks what is done and names what is left', () => {
  const sixOfSeven = {
    trunk: true, bags: true, masks: true, jackets: true, weapons: true, aid: true,
  };
  const plan = swapEvidencePlan(sixOfSeven);
  assert.deepEqual(plan.items[0].tally, { count: 6, total: 7 });
  assert.equal(plan.items.filter((row) => row.done).length, 6);
  const outstanding = plan.items.find((row) => !row.done);
  assert.equal(outstanding.label, 'Wipe the dirty car and the gear');
  assert.equal(outstanding.current, true, 'the one thing left has to be marked current');
  assert.match(plan.hint, /wipe the dirty car and the gear/);

  /* THE OWNER'S EXACT MOMENT. Six down, one to go, and the standing order has
   * to say which one -- the sentence it replaced named three of the seven and
   * left the other four to be found by walking into them. */
  const order = objectiveForState('VEHICLE_SWAP', { swapProgress: sixOfSeven });
  assert.match(order, /6\/7/);
  assert.match(order, /wipe the dirty car and the gear/);
});

test('a finished swap says so and points at the way out', () => {
  const done = Object.fromEntries(SWAP_EVIDENCE.map((item) => [item.key, true]));
  assert.match(objectiveForState('VEHICLE_SWAP', { swapProgress: done }),
    /Leave in the clean car/);
  assert.match(swapEvidencePlan(done).hint, /Leave in the clean car/);
  assert.equal(swapEvidencePlan(done).items.every((row) => row.done), true);
});
