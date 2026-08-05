/**
 * `src/world/build.js` — the three primitives every scene is made of.
 *
 * There is exactly one thing in here worth a test and it is the one that was
 * wrong for months: **a mesh must keep the name it was given.**
 *
 * `box()` kept `name`. `cylinder()` and `sphere()` accepted it and threw it
 * away. A hundred and twenty-four call sites across the game were passing
 * names — `ak-barrel`, `barrett-scope-glass`, `basement-boiler` — into
 * functions that ignored them, so every verifier that identifies geometry by
 * name was blind to all of it. The failure mode is the expensive kind: the
 * author writes the name, the check looks for it, finds nothing, and reports
 * that the mesh is missing. Somebody then goes looking for a mesh that was
 * there the whole time.
 *
 * A silently-ignored option is worse than an unsupported one, which is why
 * this file exists at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureThreeShim, ensureDomShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { box, boxFrom, cylinder, sphere } = await import('../src/world/build.js');

const MAT = new THREE.MeshBasicMaterial();

test('every primitive keeps the name it is given', () => {
  assert.equal(box({ size: [1, 1, 1], pos: [0, 0, 0], mat: MAT, name: 'a-box' }).name, 'a-box');
  assert.equal(cylinder({ r: 1, h: 1, pos: [0, 0, 0], mat: MAT, name: 'a-post' }).name, 'a-post');
  assert.equal(sphere({ r: 1, pos: [0, 0, 0], mat: MAT, name: 'a-ball' }).name, 'a-ball');
  assert.equal(
    boxFrom(0, 0, 0, 1, 1, 1, MAT, { name: 'an-extent-box' }).name,
    'an-extent-box',
  );
});

test('a tapered cylinder keeps its name too, and it is a different code path', () => {
  /* `cylinder()` reuses a shared unit mesh when the two radii match and builds
   * a fresh `CylinderGeometry` when they do not. Two branches, one of which is
   * how every lamp post, bottle neck and gun barrel in the game is made. */
  const tapered = cylinder({ rTop: 0.2, rBottom: 0.5, h: 2, pos: [0, 0, 0], mat: MAT, name: 'a-taper' });
  assert.equal(tapered.name, 'a-taper');
  assert.notEqual(tapered.geometry, cylinder({ r: 1, h: 1, pos: [0, 0, 0], mat: MAT }).geometry);
});

test('a primitive with no name asked for stays anonymous', () => {
  // Not every mesh wants one — thousands of these exist and naming them all
  // would make `getObjectByName` slower and no more useful.
  assert.equal(cylinder({ r: 1, h: 1, pos: [0, 0, 0], mat: MAT }).name, '');
  assert.equal(sphere({ r: 1, pos: [0, 0, 0], mat: MAT }).name, '');
});
