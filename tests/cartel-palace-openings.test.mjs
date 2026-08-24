/**
 * A DECORATED OPENING IS STILL A WALL.
 *
 * The owner's report was that he "can be shot through the service-wing door
 * before entering". He could. `estate-front-west` stops at x 11.5 and
 * `estate-front-east` starts at 15.5, leaving a 4.0 m x 4.8 m hole in the
 * front wall, and the only collider ever put in it was the door leaf --
 * 3.02 m wide and 2.6 m tall. The 2.2 m header above it and a ~0.49 m reveal
 * down each side were drawn as stucco and stone and traced as air.
 *
 * That is the authoring hazard this file exists to catch, and it is not
 * specific to one doorway: the shared ballistics and perception only ever see
 * `world.colliders`, so anything a player reads as solid and the array does
 * not contain is a hole. docs/CONTEXT.md states the rule one way -- appearance
 * never implies penetration -- and this is its converse: appearance does not
 * imply solidity either, and only the collider array decides.
 *
 * The trace here is deliberately the crude one: does any enabled Box3 lie on
 * the segment. It is not the shared stack's own path (that lives in
 * `src/core/combat/spatial.js` and is exercised by the combat contract tests);
 * it is the question those tests cannot ask, which is whether this SCENE hands
 * that stack a world with a wall in it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { buildCartelPalace } from '../src/cartel-palace/world.js';

let cached = null;
function palace() {
  cached ??= buildCartelPalace(new THREE.Scene());
  return cached;
}

/** Every enabled collider the segment from -> to passes through, by name. */
function contacts(colliders, from, to) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  direction.normalize();
  const ray = new THREE.Ray(from.clone(), direction);
  const hit = new THREE.Vector3();
  const names = [];
  for (const box of colliders) {
    if (box.enabled === false) continue;
    if (ray.intersectBox(box, hit) && from.distanceTo(hit) <= length) {
      names.push(box.name || '(unnamed)');
    }
  }
  return names;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* Inside the entry hall to outside the front wall, straight through it. The
 * wall band is z 11.75..12.25, so 6 -> 14.5 crosses it with room either side. */
const INSIDE_Z = 6;
const OUTSIDE_Z = 14.5;

test('the shut service door stops a round everywhere across its opening', () => {
  const { colliders } = palace();
  /* The opening is x 11.5..15.5 and y 0..4.8. Sampled at the leaf, in both
   * reveals, and at two heights above the leaf -- the four places the wall
   * was missing. */
  const samples = [
    { x: 13.5, y: 1.55, what: 'chest height, through the leaf' },
    { x: 11.7, y: 1.55, what: 'chest height, west reveal' },
    { x: 15.3, y: 1.55, what: 'chest height, east reveal' },
    { x: 11.7, y: 0.4, what: 'ankle height, west reveal' },
    { x: 15.3, y: 2.4, what: 'head height, east reveal' },
    { x: 13.5, y: 3.6, what: 'above the leaf, under the header' },
    { x: 13.5, y: 4.5, what: 'high in the opening' },
  ];
  for (const { x, y, what } of samples) {
    const names = contacts(colliders, V(x, y, INSIDE_Z), V(x, y, OUTSIDE_Z));
    assert.ok(
      names.length > 0,
      `a round at ${what} (x=${x}, y=${y}) left the estate without touching anything`,
    );
  }
});

test('the front wall either side of the opening is solid, and the doorway is walkable', () => {
  const { colliders } = palace();
  /* The control. If these stopped passing, the trace above would be proving
   * nothing about the opening -- it would be proving the whole wall is gone. */
  for (const x of [8, 18 - 2.5]) {
    assert.ok(
      contacts(colliders, V(x, 1.55, INSIDE_Z), V(x, 1.55, OUTSIDE_Z)).length > 0,
      `the front wall at x=${x} does not stop a round`,
    );
  }

  /* And the reveals must not have narrowed the doorway a player walks through.
   * The leaf is 3.02 m on centre 13.5, so 12.2 and 14.8 are inside the walkable
   * gap: with the leaf's own collider excluded (an open door), nothing else may
   * be standing there. */
  for (const x of [12.2, 14.8]) {
    const names = contacts(colliders, V(x, 1.0, INSIDE_Z), V(x, 1.0, OUTSIDE_Z))
      .filter((name) => name !== 'estate-service-door');
    assert.deepEqual(
      names, [],
      `the open doorway is obstructed at x=${x} by ${names.join(', ')}`,
    );
  }
});

test('the header and both reveals carry the combat material they are drawn as', () => {
  const { colliders } = palace();
  const header = colliders.filter((c) => c.name === 'estate-entry-header');
  const reveals = colliders.filter((c) => c.name === 'estate-entry-reveal');
  assert.equal(header.length, 1, 'the entry header has exactly one collider');
  assert.equal(reveals.length, 2, 'both entry reveals have a collider');
  assert.equal(header[0].combatMaterial, 'concrete', 'the header is the wall it continues');
  for (const reveal of reveals) {
    assert.equal(reveal.combatMaterial, 'stone', 'a reveal is the stone jamb it is drawn as');
  }
  /* The leaf itself stays untagged on purpose: untagged is a stopper, which is
   * what a shut door should be. See `addCollider`'s note in world.js. */
  const leaf = colliders.find((c) => c.name === 'estate-service-door');
  assert.ok(leaf, 'the service door leaf still has a collider');
  assert.equal(leaf.combatMaterial, undefined);
});
