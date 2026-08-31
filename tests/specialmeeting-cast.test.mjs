/**
 * THE SPECIAL MEETING — the four of them, and which way they are pointed.
 *
 * `specialmeeting-arrival.test.mjs` holds the seating plan still. This holds
 * the STAGING still, and every assertion in it is a bug that was in the scene
 * on 2026-08-21, found by mounting the cast in the geometry adapters and
 * pointing the staging gate (docs/STAGING-GATE.md) at the result:
 *
 *   - the riders were turned to the PLAYER's yaw for the car, which is half a
 *     turn from the rig's, so the driver faced the back seat for the whole
 *     drive;
 *   - everybody who got out was turned along the car rather than at it, and
 *     four of them agreed on that heading to nine decimal places, which is
 *     FACING_UNIFORM;
 *   - Numbskull was put on the door anchor Lag was already standing on, to the
 *     millimetre, and the two of them were one body for the length of the hub;
 *   - and everybody was placed at y = 0, on a clearing floor 32.6 m up.
 *
 * Headless, on the real sedan and the real rig, because a staging test on a
 * stub proves the stub.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { buildMeetingSedan } = await import('../src/specialmeeting/sedan.js');
const { buildSpecialMeetingCast } = await import('../src/specialmeeting/cast.js');
const { collectActors } = await import('../src/core/staging.js');
const { SEDAN_STOP } = await import('../src/specialmeeting/layout.js');
const { UNIFORM_YAW_TOLERANCE_RAD, angleDelta } = await import('../tools/staging-gate.mjs');

/** A floor that is emphatically not zero, the way the clearing is not. */
const FLOOR_Y = 32.6;

function stage({ ground = null } = {}) {
  const scene = new THREE.Scene();
  const sedan = buildMeetingSedan();
  scene.add(sedan.group);
  sedan.placeAt(SEDAN_STOP.x, SEDAN_STOP.z, SEDAN_STOP.heading);
  const cast = buildSpecialMeetingCast(scene, { sedan, groundAt: ground });
  return { scene, sedan, cast };
}

/** Where the car's nose points, in world terms, for a rig to be compared to. */
function carBearing(sedan) {
  const nose = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(sedan.group.getWorldQuaternion(new THREE.Quaternion()));
  return Math.atan2(nose.x, nose.z);
}

function actorsOf(scene) {
  scene.updateMatrixWorld(true);
  /* includeHidden, because the cast is no longer all rendered: Kittenboss
   * rides the boot with the lid down (owner, 2026-08-31: "she's invisible in
   * the trunk"), and these tests measure PLACEMENT facts — yaw, marking,
   * posture — that hold whether or not the lid is hiding her. The rendered
   * -only split is the staging gate's own business and is pinned below. */
  return new Map(collectActors(scene, THREE, { includeHidden: true })
    .map((actor) => [actor.id, actor]));
}

test('everybody in the car faces the way the car is going', () => {
  const { scene, sedan, cast } = stage();
  cast.boardForArrival();
  const actors = actorsOf(scene);
  const bearing = carBearing(sedan);
  for (const id of ['Seff', 'Lag', 'Numbskull']) {
    const off = Math.abs(angleDelta(actors.get(id).yaw, bearing));
    assert.ok(off < 0.35, `${id} is ${(off * 180 / Math.PI).toFixed(1)}° off the car's nose`);
  }
  /* And the woman in the boot faces the other way, at the lid, because that is
   * the one thing anybody in a boot is looking at. */
  const boot = Math.abs(angleDelta(actors.get('Kittenboss').yaw, bearing));
  assert.ok(boot > Math.PI - 0.5, 'Kittenboss should be facing the boot lid');
});

test('no two of them agree on a heading closely enough to read as a formation', () => {
  for (const arrange of [
    (cast) => cast.boardForArrival(),
    (cast) => { cast.boardForArrival(); cast.getOut(); cast.kittenbossOut(); },
  ]) {
    const { scene, cast } = stage({ ground: () => FLOOR_Y });
    arrange(cast);
    const yaws = [...actorsOf(scene).values()].map((actor) => actor.yaw);
    for (let i = 0; i < yaws.length; i += 1) {
      for (let j = i + 1; j < yaws.length; j += 1) {
        assert.ok(
          Math.abs(angleDelta(yaws[i], yaws[j])) > UNIFORM_YAW_TOLERANCE_RAD,
          `two of the cast share a yaw within the gate's ${UNIFORM_YAW_TOLERANCE_RAD} rad`,
        );
      }
    }
  }
});

test('Lag steps clear of the door Numbskull comes to hold', () => {
  const { scene, cast } = stage();
  cast.boardForArrival();
  cast.disembarkForPickup();
  cast.holdTheFrontDoor();
  const actors = actorsOf(scene);
  const lag = actors.get('Lag').position;
  const numbskull = actors.get('Numbskull').position;
  const apart = Math.hypot(lag[0] - numbskull[0], lag[2] - numbskull[2]);
  assert.ok(apart > 1, `Lag and Numbskull are ${apart.toFixed(3)} m apart at the front door`);
});

test('they stand on the ground the scene says is there, and stay on it', () => {
  const { scene, cast } = stage({ ground: () => FLOOR_Y });
  cast.boardForArrival();
  cast.getOut();
  cast.kittenbossOut();
  for (const [id, actor] of actorsOf(scene)) {
    assert.ok(
      Math.abs(actor.position[1] - FLOOR_Y) < 0.01,
      `${id} got out ${(actor.position[1] - FLOOR_Y).toFixed(2)} m off the floor`,
    );
  }
  /* One idle frame, because `Npc.update` writes `baseY + bob` and a body whose
   * datum was never moved drops the whole 32.6 m on the frame after it lands. */
  cast.update(1 / 60, null);
  for (const [id, actor] of actorsOf(scene)) {
    assert.ok(
      Math.abs(actor.position[1] - FLOOR_Y) < 0.05,
      `${id} fell ${(FLOOR_Y - actor.position[1]).toFixed(2)} m on the first idle frame`,
    );
  }
});

test('the boot conceals its rider until the lid says otherwise', () => {
  const { scene, cast } = stage({ ground: () => FLOOR_Y });
  cast.boardForArrival();
  /* Lid down (no update frames have run the trunk toward any target), so she
   * is PLACED but not RENDERED: the exact split the adapter's unplaced-cast
   * tripwire and the staging gate's rendered-only evidence both rely on. */
  assert.equal(cast.kittenboss.placed, true);
  assert.equal(cast.kittenboss.group.visible, false);
  const rendered = new Set(collectActors(scene, THREE).map((actor) => actor.id));
  assert.ok(!rendered.has('Kittenboss'), 'a closed boot shows nothing');
  assert.deepEqual(
    [...rendered].sort(), ['Lag', 'Numbskull', 'Seff'],
    'the three in seats stay rendered',
  );
  cast.getOut();
  cast.kittenbossOut();
  assert.equal(cast.kittenboss.group.visible, true, 'out of the boot she is unconditionally visible');
});

test('every one of them is marked for the staging gate', () => {
  const { scene, cast } = stage();
  cast.boardForArrival();
  const actors = actorsOf(scene);
  assert.deepEqual([...actors.keys()].sort(), ['Kittenboss', 'Lag', 'Numbskull', 'Seff']);
  for (const actor of actors.values()) {
    assert.equal(typeof actor.actor.role, 'string');
    /* RIDING, not sitting, and the difference is load-bearing. The sedan's
     * collider is one box from the road to 2.28 m with the cabin inside it,
     * because it is the wall the player walks round; four passengers inside
     * it reported as ten staging findings until the gate learned that a man
     * in a car is supposed to be inside the car. `sit` stays checked -- a man
     * inside a sofa is still a bug -- so this has to be the other word. */
    assert.equal(actor.posture, 'ride');
  }
});
