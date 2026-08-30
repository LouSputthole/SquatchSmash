import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { DRESS_CLOSURE_LENGTH, makeMorningGuest } from '../src/world/dressing.js';
import { collectActors } from '../src/core/staging.js';

function namesUnder(root) {
  const names = [];
  root.traverse((object) => { if (object.name) names.push(object.name); });
  return names;
}

test('morning Margo keeps her canonical authored face in a different outfit', () => {
  const margo = makeMorningGuest({});
  const names = namesUnder(margo.head);

  assert.equal(margo.identity, 'margo');
  assert.equal(margo.outfit, 'morning_blouse_and_jeans');
  assert.ok(names.includes('margo.face.skull'));
  assert.ok(names.includes('margo.face.eye.left'));
  assert.ok(names.includes('margo.face.mouth'));
  assert.ok(names.includes('margo.hair.fall.main'));
});

test('Margo staging follows her rendered eyes, hips, posture, and visibility', () => {
  const margo = makeMorningGuest({});
  margo.group.updateMatrixWorld(true);
  assert.deepEqual(collectActors(margo.group, THREE), [], 'the initially hidden rig is not staged cast');

  const postureForPose = {
    standing: 'stand',
    sitting: 'sit',
    kneeling: 'kneel',
    lying: 'lie',
  };
  for (const [pose, posture] of Object.entries(postureForPose)) {
    margo.setPose(pose);
    margo.group.visible = true;
    margo.group.updateMatrixWorld(true);

    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    const hip = new THREE.Vector3();
    margo.faceParts.eyes[0].getWorldPosition(left);
    margo.faceParts.eyes[1].getWorldPosition(right);
    margo.actorHipAnchor.getWorldPosition(hip);
    const renderedEye = left.add(right).multiplyScalar(0.5);

    const [actor] = collectActors(margo.group, THREE);
    assert.equal(actor.id, 'margo');
    assert.equal(actor.posture, posture);
    assert.ok(
      new THREE.Vector3(...actor.eye).distanceTo(renderedEye) < 1e-9,
      `${pose} eye marker drifted from the rendered irises`,
    );
    assert.ok(
      new THREE.Vector3(...actor.hip).distanceTo(hip) < 1e-9,
      `${pose} hip marker drifted from the rendered hip pivot`,
    );
  }
});

test('dress help has a composed kneeling pose and articulated silhouette', () => {
  const margo = makeMorningGuest({});
  const names = namesUnder(margo.group);

  assert.ok(names.includes('margo.leg.left.thigh'));
  assert.ok(names.includes('margo.leg.left.shin'));
  assert.ok(names.includes('margo.silhouette.seat.left'));
  assert.ok(names.includes('margo.silhouette.seat.right'));

  margo.setPose('kneeling');
  assert.equal(margo.pose, 'kneeling');
  /* The shared actor-stage extraction must be measurement-equivalent to the
   * established Margo placement; this is the cross-scene reuse contract. */
  assert.deepEqual(margo.group.position.toArray(), [-2.80, 0.50, -3.02]);
  assert.ok(Math.abs(margo.group.rotation.x) < 1e-12);
  assert.ok(Math.abs(margo.group.rotation.y - 1.90) < 1e-12);
  assert.ok(Math.abs(margo.group.rotation.z) < 1e-12);
  // Knees folded to lay the shins flat, torso down over them: on all fours.
  assert.ok(margo.knees.every((knee) => knee.rotation.x > 1.3));
  assert.ok(margo.upper.rotation.x > 1.3);
  assert.equal(margo.helpTarget.visible, true);

  margo.setDressHelpProgress(0.6);
  assert.equal(margo.dressHelpProgress, 0.6);
  /* A FRACTION of DRESS_CLOSURE_LENGTH, not a length of its own -- the seam
   * used to write straight into `scale.y` (0.18 to 1.0, which on a unit-box
   * mesh IS the height in metres), so at full progress it stood a full metre
   * tall: floor of her shoulder blades to well above her scalp, reading as a
   * grey bar running up her back once `completeMargoDressHelp` stood her
   * upright. Bounded here against the authored length so that bug cannot
   * come back silently. */
  const expected = (0.18 + 0.6 * 0.82) * DRESS_CLOSURE_LENGTH;
  assert.ok(
    Math.abs(margo.dressClosure.scale.y - expected) < 1e-6,
    `closure scale.y is ${margo.dressClosure.scale.y}, expected ${expected}`,
  );
  assert.ok(margo.dressClosure.scale.y <= DRESS_CLOSURE_LENGTH,
    'the seam must never exceed its own authored length');
  // The fastening progress must not quietly stand her back up.
  assert.ok(margo.upper.rotation.x > 1.3);
});

/*
 * A quadruped pose is four contact points, and getting one wrong is a limb
 * through the floorboards. Asserted in world space, because every one of these
 * is the product of four joints and none of them is checkable by reading the
 * angle that was typed.
 */
test('the dress beat puts Margo bent over on all fours, on the floor', () => {
  const margo = makeMorningGuest({});
  margo.setPose('kneeling');
  margo.group.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(margo.group);
  assert.ok(box.min.y >= -0.01, `she sinks to y ${box.min.y.toFixed(3)}`);
  // Bent over: her head is barely higher than her hips, not a metre above them.
  const head = new THREE.Vector3();
  margo.head.getWorldPosition(head);
  assert.ok(head.y < 0.75, `head at y ${head.y.toFixed(3)} is still upright`);

  // Hands and feet all down, and nothing below the boards.
  for (const foot of margo.feet) {
    const at = new THREE.Box3().setFromObject(foot);
    assert.ok(at.min.y >= -0.01 && at.min.y < 0.10, `a foot sits at ${at.min.y.toFixed(3)}`);
  }
  for (const arm of margo.arms) {
    const at = new THREE.Box3().setFromObject(arm);
    assert.ok(at.min.y >= -0.02 && at.min.y < 0.12, `a hand sits at ${at.min.y.toFixed(3)}`);
  }

  /* And the fastening is the nearest thing to the player, which is the whole
   * reason she is in this pose: he wakes at (-4.15, …, -3.35) and the beat
   * lifts his eye 30cm, and the hit volume has to be inside the 2.7m reach. */
  const eye = new THREE.Vector3(-4.15, 1.16, -3.35);
  const target = new THREE.Vector3();
  margo.helpTarget.getWorldPosition(target);
  const closure = new THREE.Vector3();
  margo.dressClosure.getWorldPosition(closure);
  assert.ok(target.distanceTo(eye) < 2.4, `target ${target.distanceTo(eye).toFixed(3)}m away`);
  assert.ok(closure.y > 0.45 && closure.y < 0.85, `closure at y ${closure.y.toFixed(3)}`);
});

test('standing puts her feet on the floor rather than through it', () => {
  const margo = makeMorningGuest({});
  margo.setPose('standing');
  margo.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(margo.group);
  assert.ok(Math.abs(box.min.y) < 0.02, `she stands at y ${box.min.y.toFixed(3)}`);
  assert.ok(box.max.y > 1.6 && box.max.y < 1.9, `she is ${box.max.y.toFixed(3)} tall`);
});

/*
 * The reported bug, reproduced exactly: `completeMargoDressHelp` stands her
 * up at full fastening progress the instant the bar finishes. At that exact
 * moment the seam used to be a full metre tall on a rig that is 0.87m of hip
 * height plus torso and head -- floor of her shoulder blades to well above
 * her scalp -- which is the "grey vertical bar going up her back" this
 * asserts can never happen again, in the one pose (upright) where a tall
 * seam reads as a bar rather than merely as wrong.
 */
test('the fastening never grows taller than the garment it is sewn to', () => {
  const margo = makeMorningGuest({});
  margo.setPose('standing');
  margo.setDressHelpProgress(1);
  margo.group.updateMatrixWorld(true);

  assert.ok(margo.dressClosure.scale.y <= DRESS_CLOSURE_LENGTH + 1e-6,
    `closure scale.y is ${margo.dressClosure.scale.y}m, the garment is ${DRESS_CLOSURE_LENGTH}m`);

  const box = new THREE.Box3().setFromObject(margo.dressClosure);
  const height = box.max.y - box.min.y;
  assert.ok(height <= DRESS_CLOSURE_LENGTH + 0.01,
    `the seam spans ${height.toFixed(3)}m in world space -- taller than the dress itself`);
});

/*
 * He wakes with his eye at (-4.15, 0.86, -3.35). The lying pose used to put
 * her skull about twenty centimetres from that, which is not "beside him", it
 * is inside his head. Asserted in world space off her actual head group rather
 * than off the numbers in the setter, because the numbers were never the bug:
 * the euler order was, and a roll typed into the wrong axis reads perfectly
 * fine on the line it is written on.
 */
test('the lying pose keeps Margo out of the waking camera', () => {
  const margo = makeMorningGuest({});
  margo.setPose('lying');
  margo.group.updateMatrixWorld(true);

  const eye = new THREE.Vector3(-4.15, 0.86, -3.35);
  const head = new THREE.Vector3();
  margo.head.getWorldPosition(head);
  assert.ok(head.distanceTo(eye) > 0.6, `head ${head.distanceTo(eye).toFixed(3)}m from the eye`);
  // East of him, which is the open side of the bed, and still over the mattress.
  assert.ok(head.x > eye.x);
  assert.ok(head.x < -3.45 && head.x > -4.85);

  /* Nothing of her, anywhere, close enough to fill the lens. Measured per part
   * rather than off one bounding box round the whole rig: an axis-aligned box
   * over a body lying at an angle claims a corner she is nowhere near. */
  const at = new THREE.Vector3();
  margo.group.traverse((object) => {
    if (!object.isMesh || object.name === 'margo-dress-help') return;
    object.getWorldPosition(at);
    assert.ok(at.distanceTo(eye) > 0.4,
      `${object.name || 'a part of her'} sits ${at.distanceTo(eye).toFixed(3)}m from the eye`);
  });

  // And her feet stay on the bed: the duvet runs out at z -2.30.
  const box = new THREE.Box3().setFromObject(margo.group);
  assert.ok(box.max.z < -2.30, `she reaches out to z ${box.max.z.toFixed(3)}`);
  assert.ok(box.min.y > 0.60, `she sinks to y ${box.min.y.toFixed(3)}`);
});

test('the dress takes the glue, and keeps it when she stands', () => {
  const margo = makeMorningGuest({});
  assert.equal(margo.dressGlue, 0);
  assert.ok(margo.dressGlueGroup.children.length >= 6);
  assert.ok(margo.dressGlueGroup.children.every((blob) => !blob.visible));

  margo.setDressGlue(0.5);
  assert.equal(margo.dressGlue, 0.5);
  const half = margo.dressGlueGroup.children.filter((blob) => blob.visible).length;
  assert.ok(half > 0 && half < margo.dressGlueGroup.children.length);

  margo.setDressGlue(1);
  assert.ok(margo.dressGlueGroup.children.every((blob) => blob.visible && blob.scale.x === 1));

  /* It is parented to her blouse, so the pose change that stands her up and
   * the walk to the door both carry it. A pose reset must not wipe it. */
  margo.setPose('standing');
  assert.equal(margo.dressGlue, 1);
  assert.ok(margo.dressGlueGroup.children.every((blob) => blob.visible));
});
