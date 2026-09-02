/**
 * Somebody is waiting on the last green.
 *
 * Lou's invitation is three holes "before the big job", and the big job is THE
 * TAKE. The crew for it is stood between the final green and the clubhouse
 * with nothing to do but watch the fourth man finish — so the round stops
 * being a morning off somewhere around the approach shot, without anybody
 * having to say so.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { CHARACTER_IDS } from '../src/core/campaign.js';
import { FAMILY } from '../src/bing/family.js';
import HOLE_THREE, { GALLERY, GREEN, CLUBHOUSE, CART_PARK } from '../src/golf/hole3.js';
import HOLE_ONE from '../src/golf/hole1.js';
import HOLE_TWO from '../src/golf/hole2.js';

const terrain = fs.readFileSync(new URL('../src/golf/terrain.js', import.meta.url), 'utf8');

test('the gallery is on the last hole and only the last hole', () => {
  assert.ok(Array.isArray(HOLE_THREE.gallery) && HOLE_THREE.gallery.length >= 4,
    'the final hole has no gallery');
  assert.equal(HOLE_ONE.gallery, undefined, 'hole one must stay an ordinary tee');
  assert.equal(HOLE_TWO.gallery, undefined, 'hole two must stay an ordinary tee');
});

test('everybody waiting is a real member of the Family roster', () => {
  const known = new Set(FAMILY.map((member) => member.id));
  for (const mark of GALLERY) {
    assert.equal(known.has(mark.id), true,
      `${mark.id} is not in src/bing/family.js — one id, one face, one voice`);
  }
});

test('the ones waiting are the crew for the job that follows', () => {
  const ids = new Set(GALLERY.map((mark) => mark.id));
  for (const id of [
    CHARACTER_IDS.BOOSKI, CHARACTER_IDS.SHUBENATOR, CHARACTER_IDS.DEATHMEGATRON,
    CHARACTER_IDS.NUMBSKULL, CHARACTER_IDS.SNOW,
  ]) {
    assert.equal(ids.has(id), true, `${id} should be waiting at the clubhouse`);
  }
  /* Rippinflow is playing the round. He cannot also be watching it, which is
   * the whole reason the one-identity rule exists. */
  assert.equal(ids.has(CHARACTER_IDS.RIPPINFLOW), false, 'Rippinflow is in the foursome');
  assert.equal(ids.has(CHARACTER_IDS.LOU), false, 'Lou is in the foursome');
  assert.equal(ids.has(CHARACTER_IDS.ERIC), false, 'Eric is in the foursome');
});

test('nobody is stood on the green, in the cart park, or inside the clubhouse', () => {
  for (const mark of GALLERY) {
    const onGreen = Math.hypot((mark.x - GREEN.x) / GREEN.rx, (mark.z - GREEN.z) / GREEN.rz) < 1.15;
    assert.equal(onGreen, false, `${mark.id} is standing on the putting surface`);
    assert.ok(Math.hypot(mark.x - CART_PARK.x, mark.z - CART_PARK.z) > 5,
      `${mark.id} is standing in the cart park`);
    assert.ok(Math.hypot(mark.x - CLUBHOUSE.x, mark.z - CLUBHOUSE.z) > 8,
      `${mark.id} is standing in the clubhouse`);
  }
});

test('they are behind the green, between it and the building', () => {
  /* The hole plays down -Z, so "behind the green" is a smaller z than the
   * green and a larger one than the clubhouse. Anybody in front would be in
   * the line of the approach shot. */
  for (const mark of GALLERY) {
    assert.ok(mark.z < GREEN.z, `${mark.id} is in front of the green`);
    assert.ok(mark.z > CLUBHOUSE.z, `${mark.id} is behind the clubhouse`);
  }
});

test('no two of them are standing in the same place', () => {
  for (let i = 0; i < GALLERY.length; i++) {
    for (let j = i + 1; j < GALLERY.length; j++) {
      const gap = Math.hypot(GALLERY[i].x - GALLERY[j].x, GALLERY[i].z - GALLERY[j].z);
      assert.ok(gap > 2.5, `${GALLERY[i].id} and ${GALLERY[j].id} are ${gap.toFixed(1)}m apart`);
    }
  }
});

test('they are scenery, not a second foursome', () => {
  const build = terrain.slice(terrain.indexOf('function buildGallery('), terrain.indexOf('function buildClubhouse('));
  assert.match(build, /tier: 'ambient'/);
  assert.match(build, /job: 'stand'/);
  assert.ok(!/colliders/.test(build), 'the gallery must not add collision to the last green');
  assert.ok(!/interaction/i.test(build), 'nobody is meant to walk up and talk to them');
  // Same identity layer as every other scene they appear in.
  assert.match(build, /characterId = member\.id/);
});

test('a member with no face photo yet wears his authored head instead of a 404', () => {
  /* `assets/faces/index.json` exists so nothing probes for a PNG that has not
   * landed, because asking for one is a console error on every round and a
   * failed no-console-errors gate. */
  const build = terrain.slice(terrain.indexOf('function buildGallery('), terrain.indexOf('function buildClubhouse('));
  assert.match(build, /faces\.has\(member\.photo\)/);
  assert.match(build, /: null/);

  const index = JSON.parse(fs.readFileSync(new URL('../assets/faces/index.json', import.meta.url), 'utf8'));
  const have = new Set(index.files || []);
  const byId = Object.fromEntries(FAMILY.map((member) => [member.id, member]));
  /* Every face in the GALLERY is photographed now that Lag and Numbskull have
   * landed, so a gap in the gallery can no longer be what proves this. The
   * guard is shared with the Bing and the Special Meeting and the roster still
   * has three men waiting on a picture, so it is load-bearing there instead —
   * and the two structural matches above are what prove `buildGallery`
   * consults the index at all, which is the part that must never rot.
   *
   * Not an error when this fires. It means the art pass finished: keep the
   * guard, and retire this half of the test rather than inventing a gap. */
  const unphotographed = FAMILY.filter((member) => !have.has(member.photo));
  assert.ok(unphotographed.length >= 1,
    'every roster photo now exists; keep the guard anyway, but this test is no longer proving it');
});

test('the gallery lives on the hole group so a hole change disposes it', () => {
  assert.match(terrain, /this\.gallery = HOLE\.gallery \? buildGallery\(g, HOLE\.gallery, this\.faces\) : \[\]/);
  assert.match(terrain, /for \(const npc of this\.gallery\) \{\s*\n\s*npc\.update\(dt, playerPos\);/);
  /* And they are alive rather than posed once. The standing drink has to be
   * applied AFTER `npc.update`, because the `stand` job rewrites the arm
   * rotations every frame and would put the beer straight back down. */
  assert.match(terrain, /npc\.update\(dt, playerPos\);\s*\n(?:\s*\/\*[^]*?\*\/\s*\n)?\s*poseWaitingMan\(npc, this\._t\)/);
});
