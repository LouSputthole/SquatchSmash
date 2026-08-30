import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  LANDMARKS,
  LANDMARK_VIEWPOINTS,
  RANGE_SITE,
  SURFACE,
  canPlantTree,
  groundAt,
  insideProperty,
  insideRangeClearing,
  slopeAt,
  surfaceAt,
} from '../src/cabin/field.js';
import {
  RANGE_SCORE_ZONES,
  RANGE_SHOT_LIMIT,
  buildCabinShootingRange,
  cabinRangeTargetFromObject,
} from '../src/cabin/shooting-range.js';

test('the west/back range is a graded, tree-free landmark with a safe authored view', () => {
  const landmark = LANDMARKS.range;
  const viewpoint = LANDMARK_VIEWPOINTS.range;
  assert.equal(insideProperty(landmark.x, landmark.z, 4), true);
  assert.equal(insideRangeClearing(RANGE_SITE.backstopX, RANGE_SITE.centreZ), true);
  assert.equal(canPlantTree(landmark.x, landmark.z, 0.5), false);
  assert.equal(canPlantTree(RANGE_SITE.backstopX, RANGE_SITE.centreZ, 0.5), false);
  assert.equal(surfaceAt(landmark.x, landmark.z), SURFACE.DIRT);
  assert.ok(slopeAt(viewpoint.x, viewpoint.z) < 0.02);
  assert.ok(Math.abs(groundAt(RANGE_SITE.firingX, -20) - groundAt(RANGE_SITE.backstopX, -20)) < 1e-9);
  assert.ok(viewpoint.x > landmark.x, 'the player stands behind the west-facing firing rail');
  assert.ok(viewpoint.lookX < landmark.x, 'the authored view looks away from the cabin');
});
test('range geometry publishes exact score ownership, backstop, colliders, and interaction seam', () => {
  const scene = new THREE.Scene();
  let interactions = 0;
  const range = buildCabinShootingRange({
    parent: scene,
    onInteract: () => { interactions++; },
  });

  assert.equal(range.root.parent, scene);
  assert.equal(range.geometry.targetCount, 5);
  assert.equal(range.hitTargets.length, 26, 'five scored surfaces per target plus the backstop');
  assert.equal(range.colliders.length, 2);
  assert.equal(range.viewpoint.position.isVector3, true);
  assert.equal(range.interactTarget.userData.interactionProxy, true);

  const bull = range.root.getObjectByName('cabin-range-target.near-left.score.bull');
  const head = range.root.getObjectByName('cabin-range-target.near-left.head');
  const body = range.root.getObjectByName('cabin-range-target.near-left.body');
  const child = new THREE.Object3D();
  bull.add(child);
  assert.deepEqual(
    { ...range.targetFromObject(child), object: undefined },
    {
      targetId: 'near-left',
      zoneId: 'bull',
      points: RANGE_SCORE_ZONES.bull.points,
      multiplier: RANGE_SCORE_ZONES.bull.multiplier,
      object: undefined,
    },
  );
  assert.equal(range.targetFromObject(head).zoneId, 'head');
  assert.equal(cabinRangeTargetFromObject(body).zoneId, 'body');
  assert.equal(range.targetFromObject(range.root.getObjectByName('cabin-range.backstop.berm')), null);

  range.interaction.onUse();
  assert.equal(interactions, 1);
  assert.equal(range.snapshot().phase, 'idle', 'interaction is callback-only; scene authority starts the round');
});

test('a range round counts ten triggers, keeps only the best overlapping zone, and persists scores', () => {
  const range = buildCabinShootingRange();
  const body = range.root.getObjectByName('cabin-range-target.middle.body');
  const bull = range.root.getObjectByName('cabin-range-target.middle.score.bull');
  range.begin();

  range.handleWeaponEvent({ type: 'fire', triggerId: 'first' });
  assert.equal(range.handleImpact({ object: body, triggerId: 'first' }).score, RANGE_SCORE_ZONES.body.points);
  assert.equal(range.handleImpact({ object: bull, triggerId: 'first' }).score, RANGE_SCORE_ZONES.bull.points);
  assert.equal(range.handleImpact({ object: body, triggerId: 'first' }).applied, false);

  for (let i = 1; i < RANGE_SHOT_LIMIT; i++) {
    const triggerId = `shot-${i}`;
    range.handleWeaponEvent({ type: 'fire', triggerId });
    range.handleImpact({ object: bull, triggerId });
  }
  assert.equal(range.snapshot().shots, RANGE_SHOT_LIMIT);
  assert.equal(range.snapshot().hits, RANGE_SHOT_LIMIT);
  assert.equal(range.snapshot().currentScore, RANGE_SHOT_LIMIT * RANGE_SCORE_ZONES.bull.points);
  range.update(0.25);
  range.update(0.25);
  assert.equal(range.snapshot().phase, 'complete');
  assert.equal(range.snapshot().finishReason, 'shots');
  assert.equal(range.snapshot().lastScore, 500);
  assert.equal(range.snapshot().bestScore, 500);

  range.begin();
  assert.equal(range.snapshot().currentScore, 0);
  assert.equal(range.snapshot().lastScore, 500);
  assert.equal(range.snapshot().bestScore, 500);
});

test('real targets wobble, fall after repeated hits, and reset upright', () => {
  const range = buildCabinShootingRange();
  const body = range.root.getObjectByName('cabin-range-target.far-right.body');
  range.begin();
  for (let i = 0; i < 3; i++) {
    const triggerId = `fall-${i}`;
    range.handleWeaponEvent({ type: 'fire', triggerId });
    range.handleImpact({ object: body, triggerId });
  }
  assert.equal(range.snapshot().targets.find(({ id }) => id === 'far-right').fallen, true);
  for (let i = 0; i < 12; i++) range.update(0.1);
  assert.ok(range.snapshot().targets.find(({ id }) => id === 'far-right').angle > 1.0);
  range.reset();
  assert.deepEqual(
    range.snapshot().targets.find(({ id }) => id === 'far-right'),
    { id: 'far-right', hits: 0, fallen: false, angle: 0 },
  );
});
