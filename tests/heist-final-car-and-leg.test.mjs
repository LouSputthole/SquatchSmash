import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import { HEIST_PHASE_PLAYER_BOUNDS, HEIST_STATES } from '../src/heist/config.js';
import { buildHeistLevel } from '../src/heist/level.js';
import { SAFEHOUSE_DEBRIEF_STEPS, debriefStep } from '../src/heist/orders.js';

/**
 * THE LAST CAR, AND RIPPINFLOW'S LEG.
 *
 * Owner, playtest 2026-08-26, two notes on the end of the mission:
 *
 *   *"the final car has no usable E zone"* -- the prompt that leaves the swap
 *   in the clean car was a box authored at x 24.1, and the clean car's body
 *   measures x 22.72 to 24.88, so the whole proxy sat inside the cabin. Every
 *   ray from the yard hit `clean-swap-car-cabin` at about a metre and the
 *   proxy at a metre and a half, behind it. Measured before the fix: acquired
 *   from 6 of 178 legal standing positions, and every one of those six was in
 *   the 1.1 m strip between the car's far flank and the yard fence.
 *
 *   *"Rippin's leg just re-arms armor"* -- step 1/4 of the debrief says wrap
 *   the man's leg and was registered on `interactables.armor`, the plate
 *   carrier on its stand, which is the one prop in that room whose every other
 *   verb is body armour.
 *
 * Both are held here: the door proxy by measurement, the leg by the step table
 * that now owns which prop each numbered action is on.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** InteractionSystem's reach, from `src/core/interaction.js`. */
const MAX_DISTANCE = 2.7;
const EYE = 1.66;
/** `Player.RADIUS` -- how close the camera can ever be pushed to a solid. */
const PLAYER_RADIUS = 0.3;

function drivingPhase() {
  const level = buildHeistLevel(new THREE.Scene());
  const driving = level.phases.driving;
  // Headless raycasting reads `matrixWorld` and never rebuilds it.
  driving.group.updateMatrixWorld(true);
  return driving;
}

function worldBox(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function owns(hit, target) {
  for (let node = hit; node; node = node.parent) if (node === target) return true;
  return false;
}

function blocked(phase, x, z) {
  return (phase.colliders ?? []).some((box) => x > box.min.x - PLAYER_RADIUS
    && x < box.max.x + PLAYER_RADIUS
    && z > box.min.z - PLAYER_RADIUS
    && z < box.max.z + PLAYER_RADIUS);
}

/** The ring `debugApproachInteraction` walks, clipped to where a body fits. */
function reach(phase, target) {
  const box = worldBox(target);
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
        ray.set(new THREE.Vector3(px, EYE, pz),
          new THREE.Vector3(centre.x - px, aimY - EYE, centre.z - pz).normalize());
        const hits = ray.intersectObject(phase.group, true).filter((hit) => hit.object.isMesh);
        if (hits.length && owns(hits[0].object, target)) { acquired += 1; break; }
      }
    }
  }
  return { sampled, acquired, fraction: sampled ? acquired / sampled : 0 };
}

test('the way out of the swap is a proxy the player can aim at', () => {
  const driving = drivingPhase();
  const depart = driving.interactables.depart;
  assert.equal(depart.name, 'swap-depart');
  const measured = reach(driving, depart);
  assert.ok(measured.sampled >= 60, `only ${measured.sampled} legal viewpoints`);
  /* Measured 2026-08-26: 95 of 95 after the move, 6 of 178 before it. */
  assert.equal(measured.acquired, measured.sampled,
    `the clean car's door was acquired from ${measured.acquired} of ${measured.sampled} `
    + 'legal standing positions');
});

test('the door proxy stands outside the car, and outside the car’s collider', () => {
  const driving = drivingPhase();
  const proxy = worldBox(driving.interactables.depart);
  const body = worldBox(driving.group.getObjectByName('clean-swap-car'));
  assert.ok(proxy.max.x <= body.min.x,
    `the proxy ends at x ${proxy.max.x.toFixed(2)} and the car body starts at `
    + `x ${body.min.x.toFixed(2)} -- a proxy inside the car is a proxy behind the car`);

  /* The other half of the same rule: a box is invisible to a ray that starts
   * inside it, so the player must not be able to STAND in it either. The car's
   * own collider is what keeps him out, and `Player.RADIUS` is 0.30. */
  const carCollider = driving.colliders.find((box) => box.min.x <= body.min.x + 0.05
    && box.max.x >= body.max.x - 0.05 && box.min.z <= body.min.z + 0.05);
  assert.ok(carCollider, 'the clean car has no collider to keep the player out');
  const closestX = carCollider.min.x - PLAYER_RADIUS;
  assert.ok(closestX < proxy.min.x,
    `the player can reach x ${closestX.toFixed(2)} and the proxy starts at `
    + `x ${proxy.min.x.toFixed(2)}`);
  assert.ok(proxy.min.x - closestX < MAX_DISTANCE, 'the proxy is out of reach from the kerb');
});

test('neither swap proxy is drawn or lights the yard', () => {
  const driving = drivingPhase();
  for (const name of ['depart', 'swap']) {
    const proxy = driving.interactables[name];
    assert.equal(proxy.material.opacity, 0, `${proxy.name} is visible`);
    /* An invisible box still darkens the ground under the two task lights.
     * The floor plate has had this off since it was authored; the door proxy
     * did not, and it now stands outside the car where it would show. */
    assert.equal(proxy.castShadow, false, `${proxy.name} casts a shadow`);
  }
  assert.equal(driving.interactables.depart.receiveShadow, false);
});

test('the trunk is on the tailgate, where a ray to it is clear', () => {
  const driving = drivingPhase();
  const trunk = worldBox(driving.interactables.trunk);
  const body = worldBox(driving.group.getObjectByName('clean-swap-car'));
  /* The car is authored nose-first, so the tailgate is its +z face. */
  assert.ok(trunk.max.z > body.max.z,
    `the trunk panel ends at z ${trunk.max.z.toFixed(2)} and the body at `
    + `z ${body.max.z.toFixed(2)}`);
  const measured = reach(driving, driving.interactables.trunk);
  /* Measured 2026-08-26: 101 of 103, against 37 of 66 when it was a panel on
   * the flank fighting the door proxy for the same rays. */
  assert.ok(measured.fraction >= 0.95,
    `the trunk was acquired from ${measured.acquired} of ${measured.sampled} viewpoints`);
});

test('no numbered debrief step is on the armour stand', () => {
  assert.equal(SAFEHOUSE_DEBRIEF_STEPS.length, 4);
  for (const step of SAFEHOUSE_DEBRIEF_STEPS) {
    assert.notEqual(step.target, 'armor',
      `${step.id} is registered on the plate-carrier stand`);
    assert.ok(HEIST_STATES.includes(step.state), `${step.id} names an unknown state`);
  }
  const targets = SAFEHOUSE_DEBRIEF_STEPS.map((step) => step.target);
  assert.equal(new Set(targets).size, targets.length, 'two steps share a prop');
});

test('wrapping the leg is on the man with the wound', () => {
  const firstAid = debriefStep('first_aid');
  assert.equal(firstAid.target, 'rippin');
  assert.equal(firstAid.state, 'SAFEHOUSE_RETURN');
  assert.match(firstAid.label, /^1\/4/);
  assert.match(firstAid.label, /leg/i);
  assert.ok(firstAid.hold > 0, 'first aid is a hold, not a tap');
  assert.match(firstAid.doneLabel, /leg/i);
});

/**
 * The wiring, checked in the source.
 *
 * `src/heist/main.js` is a page module: it opens a WebGL context and an audio
 * engine at import, so no Node test can hold its interaction registry. The
 * live proof is `tools/verify-heist.mjs`, which now poses at Rippinflow and
 * holds E through the real crosshair. What can be held here is the thing that
 * actually regressed -- the armour stand being handed the first-aid prompt --
 * and it is worth holding, because that is the defect the owner reported.
 */
test('the debrief branch registers the step table’s prop, not the vest', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/heist/main.js'), 'utf8');
  const start = source.indexOf(
    "if (activePhase === 'safehouse' && stateIndex(state) >= stateIndex('SAFEHOUSE_RETURN')) {",
  );
  assert.ok(start > 0, 'the safehouse-return interaction branch has moved');
  /* Comments out: this file's own fix is documented in that branch, in prose
   * that names the prop it took the prompt away from. */
  const branch = source.slice(start, source.indexOf('\n  }\n}', start))
    .replaceAll(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(branch.includes('debriefProps[firstAid.target]'),
    'step 1/4 no longer reads its prop from SAFEHOUSE_DEBRIEF_STEPS');
  assert.equal((branch.match(/use\(debriefProps\[/g) ?? []).length, 4,
    'all four numbered steps take their prop from the step table');
  assert.ok(!branch.includes('interactables.armor'),
    'the debrief is registering an interaction on the plate-carrier stand again');
  /* And it must not quietly move armour either way while it is at it. */
  assert.ok(!/preparation\.(equipArmor|armorReady|restore)/.test(branch.split('firstAid')[1]?.slice(0, 900) ?? ''),
    'the first-aid handler is touching the armour state');
});
