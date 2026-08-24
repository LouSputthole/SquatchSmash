/**
 * A ROUND GOES WHERE THE CROSSHAIR IS, AT EVERY RANGE.
 *
 * Owner, 2026-08-24, on the Mansion Siege: *"There is also room for the decals
 * to be more accurate on the target where you hit it."*
 *
 * It was never the decal system. `world/decals.js` puts a mark exactly where
 * it is told, oriented to the surface normal it is handed, and every caller
 * along the way -- `CombatImpactResolver`, `BloodImpactSystem`,
 * `BallisticImpactSystem` -- carries the contact through faithfully. What was
 * wrong was the contact itself.
 *
 * `WeaponSystem._onShot` fired from the MUZZLE of the held viewmodel and along
 * the CAMERA's forward vector. Those two together are a parallel offset, not a
 * ray: `HOLD` puts the model 0.18-0.23 m right of the eye and 0.19-0.24 m
 * below it so it does not cover the screen, so the round travelled down a line
 * a fifth of a metre right and a fifth of a metre low -- and, because parallel
 * lines do not converge, it stayed a fifth of a metre off at one metre and at
 * fifty. Aim at a man's head across a room and the hole lands on his shoulder.
 *
 * HOW THIS FILE TELLS THE TWO APART. Spread is noise with a mean of zero; a
 * parallel hold offset is BIAS. So the assertions below are on the mean of
 * many rounds rather than on any one of them: scatter cancels, a barrel that
 * is not where the eye is does not. The per-shot ceiling is kept as a loose
 * sanity bound only -- it is the mean that catches the fault.
 *
 * The second half of the fix is pinned too: the tracer still leaves the
 * barrel, because a streak out of the middle of the screen looks like nothing
 * at all.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { WEAPON_CATALOG } from '../src/core/weapons/catalog.js';
import { WeaponSystem } from '../src/core/weapons/WeaponSystem.js';

/** The smallest hold offset in the catalog, and so the smallest possible bug. */
const SMALLEST_HOLD_OFFSET = 0.18;

/**
 * A camera looking down -Z at a wall, and `rounds` shots fired at it.
 *
 * The camera is deliberately NOT at the origin: an origin-mounted camera lets
 * a "shot starts at the eye" bug read as correct against absolute zero. The
 * tracer pool is stubbed so the assertions are about the geometry handed to
 * it rather than instanced-mesh internals; `onArrive` is called straight
 * through, so the impact still lands.
 */
function fireAtAWall({
  eye = new THREE.Vector3(3, 1.7, 2),
  range = 5,
  rounds = 1,
  weapon = 'barrett',
} = {}) {
  const camera = new THREE.PerspectiveCamera(68, 1, 0.02, 200);
  camera.position.copy(eye);
  camera.updateMatrixWorld(true);

  const world = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(40, 40, 0.2),
    new THREE.MeshBasicMaterial(),
  );
  wall.position.set(eye.x, eye.y, eye.z - range - 0.1);
  world.add(wall);
  world.updateMatrixWorld(true);

  const impacts = [];
  const tracers = [];
  const weapons = new WeaponSystem({
    camera,
    world,
    hitTargets: [wall],
    range: 120,
    onImpact: (impact) => impacts.push(impact),
  });
  weapons.tracers = {
    fire: (options) => { tracers.push(options); options.onArrive?.(); },
    update: () => {},
    dispose: () => {},
  };
  weapons.equip(weapon);
  for (let shot = 0; shot < rounds; shot += 1) {
    weapons.triggerPress();
    /* Long enough for the shot to cycle and for the recoil kick to settle, so
     * round two is not fired off the top of round one's climb. */
    for (let i = 0; i < 120; i += 1) weapons.update(1 / 60);
  }
  return { camera, eye, impacts, tracers, weapons, wall };
}

/** Where the rounds landed relative to the crosshair, averaged. */
function bias(impacts, eye) {
  const dx = impacts.reduce((sum, i) => sum + (i.point.x - eye.x), 0) / impacts.length;
  const dy = impacts.reduce((sum, i) => sum + (i.point.y - eye.y), 0) / impacts.length;
  const worst = Math.max(...impacts.map(
    (i) => Math.hypot(i.point.x - eye.x, i.point.y - eye.y),
  ));
  return { dx, dy, worst };
}

test('across a room, the group centres on the crosshair rather than under the barrel', () => {
  /* Eight rounds, not more: the Barrett holds ten, and a magazine change
   * mid-fixture is three and a half seconds of nothing that proves nothing. */
  const { eye, impacts } = fireAtAWall({ range: 5, rounds: 8 });
  assert.equal(impacts.length, 8, 'not every round reached the wall');
  const { dx, dy, worst } = bias(impacts, eye);
  assert.ok(Math.hypot(dx, dy) < SMALLEST_HOLD_OFFSET / 4,
    `the group centre sits ${(Math.hypot(dx, dy) * 1000).toFixed(0)} mm off the `
    + `sight line (${(dx * 1000).toFixed(0)} mm right, ${(dy * 1000).toFixed(0)} mm up). `
    + 'A group centre that is not the crosshair is the "decals are not accurate '
    + 'on the target" fault: the round is fired from the muzzle and aimed along '
    + 'the camera, and those two lines are parallel, so the error never closes.');
  assert.ok(worst < 0.1, `one round landed ${(worst * 1000).toFixed(0)} mm out at 5 m`);
});

test('and at arm\'s length too, where a converging barrel would still be wrong', () => {
  /* A shot fired from the barrel toward a CONVERGING aim point is right at one
   * distance and wrong at every other, and a single-range test would call that
   * fixed. Up close is where the old parallel offset was most obvious -- a
   * fifth of a metre at a metre is most of a man. */
  const { eye, impacts } = fireAtAWall({
    eye: new THREE.Vector3(-2, 1.6, 9), range: 1.1, rounds: 8,
  });
  assert.equal(impacts.length, 8, 'not every close round reached the wall');
  const { dx, dy, worst } = bias(impacts, eye);
  assert.ok(Math.hypot(dx, dy) < SMALLEST_HOLD_OFFSET / 4,
    `at 1.1 m the group centre is still ${(Math.hypot(dx, dy) * 1000).toFixed(0)} mm `
    + 'off the crosshair');
  assert.ok(worst < 0.05, `one close round landed ${(worst * 1000).toFixed(0)} mm out`);
});

test('the recorded shot begins at the eye, and the whole ray agrees with it', () => {
  const { eye, impacts } = fireAtAWall();
  const [impact] = impacts;
  assert.ok(impact.origin.distanceTo(eye) < 1e-6,
    'the impact record still names the muzzle as where the round came from, so '
    + 'every consumer of it -- suppression, hit direction, blood facing -- is '
    + 'reasoning about a line the player never looked down');
  const projected = impact.origin.clone().addScaledVector(impact.direction, impact.distance);
  assert.ok(projected.distanceTo(impact.point) < 1e-8,
    'origin, direction and distance no longer describe the contact point');
});

test('the streak still leaves the barrel, below and right of the eye', () => {
  const { eye, tracers, impacts } = fireAtAWall();
  assert.equal(tracers.length, 1, 'the shot fired no tracer, or fired several');
  const [streak] = tracers;
  assert.equal(WEAPON_CATALOG.barrett.kind, 'sniper',
    'the fixture no longer holds the gun it thinks it does');
  assert.ok(streak.from.distanceTo(eye) > 0.2,
    'the tracer now starts at the eye, so rounds appear out of the middle of '
    + 'the screen instead of out of the gun the player is holding');
  assert.ok(streak.from.x > eye.x, 'the muzzle is no longer right of the eye');
  assert.ok(streak.from.y < eye.y, 'the muzzle is no longer below the eye');
  assert.ok(streak.to.distanceTo(impacts[0].point) < 1e-6,
    'the streak does not end where the round did');
});

test('a contact nearer than the muzzle starts its streak at the eye instead', () => {
  /* Pressed against a wall, or firing at a man at arm's length, the muzzle is
   * PAST the end of the round's travel. A streak drawn from there runs
   * backwards. */
  const { eye, tracers } = fireAtAWall({
    eye: new THREE.Vector3(0, 1.6, 0), range: 0.25,
  });
  assert.equal(tracers.length, 1);
  const [streak] = tracers;
  const travel = streak.to.clone().sub(streak.from);
  const sight = streak.to.clone().sub(eye);
  assert.ok(travel.dot(sight) > 0,
    'the tracer runs backwards out of a muzzle that is beyond the thing it hit');
});
