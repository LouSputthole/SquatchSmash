import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const { mountMansionCast } = await import('../src/mansion/cast.js');
const { buildMansionGrounds } = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');

/**
 * THE FOUR WOMEN ON THE SUN LOUNGERS.
 *
 * They were placed with a cushion height of 0.47, which is the height of the
 * lounger's frame RAILS. What a body lies on is the slatted deck above them,
 * 0.4875 above the lounger's origin. Measured in the built house, that put
 * their hips at y 1.3925 against a slat top of 1.6875: twenty-nine
 * centimetres under the thing they were lying on.
 *
 * It read as a small bug rather than a large one because `sitOnTheSeat` kept
 * the first surface at or below the top of the hips, so a body sunk clean
 * through a lounger could only ever see the pool deck underneath it. The
 * correction lifted them the last seven centimetres onto the DECK, and the
 * geometry gate reported bikini rear panels 58 to 78 mm inside
 * `pool-deck-segment-*` -- 112 violations across fourteen mansion states.
 *
 * This file measures the thing that actually matters, which is neither of
 * those symptoms: whether a woman on a lounger is resting on the lounger.
 */

/**
 * buildLoungeChair lays 0.045-thick slats centred on deckY(0.42) + 0.045, so
 * the wood a body rests on occupies 0.4425 to 0.4875 above the chair's origin.
 * Sinking INTO that band is a cushion compressing; passing under it is a woman
 * falling through her chair, and those are different bugs.
 */
const LOUNGER_SURFACE_ABOVE_ORIGIN = 0.4875;
const LOUNGER_SLAT_THICKNESS = 0.045;

/**
 * Measured at the shipped cushion of 0.70, lowest point per performer:
 *
 *   poolPerformer0  1.6777  (0.98 cm in)
 *   poolPerformer1  1.6785  (0.90 cm in)
 *   poolPerformer3  1.6709  (1.66 cm in)
 *   poolPerformer4  1.6686  (1.89 cm in)
 *
 * All four are the rear panel of a bikini bottom, and the spread is the pose's
 * own left/right asymmetry, not four different placements. 1.89 cm of give in
 * a 4.5 cm slat is a body pressing into a sun lounger. The budget is the slat
 * itself: touch it, compress it, never pass through it.
 */
const MAX_SINK = LOUNGER_SLAT_THICKNESS;

function house() {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  scene.add(grounds.root, interior.root);
  const cast = mountMansionCast(scene, {
    colliders: [...grounds.colliders, ...interior.colliders],
  }, {
    player: { position: new THREE.Vector3(999, 999, 999), eyeHeight: 1.66 },
    anchors: { ...grounds.anchors, ...interior.anchors },
    pool: grounds.props.poolPatio,
    suite: interior.props.masterSuite,
    hud: { showLine() {}, hideLine() {}, setInstruction() {}, setTiming() {}, text: () => ({}) },
  });
  cast.update(1 / 60);
  scene.updateMatrixWorld(true);
  return { cast, grounds };
}

/** Every occupied lounger, as [performer id, chair index]. */
const OCCUPIED = Object.freeze([
  ['poolPerformer0', 4], ['poolPerformer1', 6],
  ['poolPerformer3', 1], ['poolPerformer4', 3],
]);

function bodyOf(npc) {
  return npc.root ?? npc.group ?? npc.object ?? npc.parts?.body?.parent ?? null;
}

function lowestPointOf(npc) {
  const body = bodyOf(npc);
  let lowest = Infinity;
  body.traverse((object) => {
    if (!object.isMesh) return;
    lowest = Math.min(lowest, new THREE.Box3().setFromObject(object).min.y);
  });
  return lowest;
}

test('every woman on a lounger is resting on the lounger', () => {
  const { cast, grounds } = house();
  const chairs = grounds.props.poolPatio.chairs;

  for (const [id, chairIndex] of OCCUPIED) {
    const npc = cast.people[id];
    assert.ok(npc, `${id} is not in the cast`);
    const chair = chairs[chairIndex];
    chair.updateMatrixWorld(true);
    const surface = chair.getWorldPosition(new THREE.Vector3()).y
      + LOUNGER_SURFACE_ABOVE_ORIGIN;
    const lowest = lowestPointOf(npc);
    const sink = surface - lowest;

    assert.ok(sink <= MAX_SINK,
      `${id} has fallen through her lounger: ${(sink * 100).toFixed(1)} cm past `
      + `the top of a ${(MAX_SINK * 100).toFixed(1)} cm slat. Lowest point `
      + `${lowest.toFixed(3)}, slat top ${surface.toFixed(3)}, slat underside `
      + `${(surface - MAX_SINK).toFixed(3)}`);
    assert.ok(sink >= -0.02,
      `${id} is floating ${(-sink * 100).toFixed(1)} cm above her lounger`);
  }
});

/**
 * The symptom the geometry gate saw. Kept as its own check because it is the
 * one a player would actually notice, and because a future change could clear
 * the deck while still leaving somebody hovering.
 */
test('no part of a poolside performer is inside the pool deck', () => {
  const { cast, grounds } = house();
  const decks = [];
  grounds.root.traverse((object) => {
    if (object.isMesh && /^pool-deck-segment/.test(object.name)) {
      decks.push(new THREE.Box3().setFromObject(object));
    }
  });
  assert.ok(decks.length > 0, 'the pool deck segments were not found');

  for (const [id] of OCCUPIED) {
    const body = bodyOf(cast.people[id]);
    const inside = [];
    body.traverse((object) => {
      if (!object.isMesh) return;
      const box = new THREE.Box3().setFromObject(object);
      for (const deck of decks) {
        if (!box.intersectsBox(deck)) continue;
        const overlap = Math.min(deck.max.y, box.max.y) - Math.max(deck.min.y, box.min.y);
        if (overlap > 0.002) inside.push(`${object.name || '(anon)'} ${(overlap * 1000).toFixed(0)}mm`);
      }
    });
    assert.deepEqual(inside, [], `${id} has geometry inside the pool deck`);
  }
});

/**
 * The trap that hid this. `sitOnTheSeat` cannot rescue a body that starts
 * below its own seat, because `seatUnder` discards every candidate above the
 * hips. If the initial placement ever drops back under the slats, the
 * correction will quietly re-seat these women on the deck again rather than
 * failing, so the starting height is worth asserting on its own.
 */
test('the loungers place their occupants above the deck to begin with', () => {
  const { cast, grounds } = house();
  const chairs = grounds.props.poolPatio.chairs;
  let deckTop = -Infinity;
  grounds.root.traverse((object) => {
    if (object.isMesh && /^pool-deck-segment/.test(object.name)) {
      deckTop = Math.max(deckTop, new THREE.Box3().setFromObject(object).max.y);
    }
  });

  for (const [id, chairIndex] of OCCUPIED) {
    const hips = cast.people[id].parts?.hips;
    assert.ok(hips, `${id} has no hips to measure`);
    const hipsY = hips.getWorldPosition(new THREE.Vector3()).y;
    const chair = chairs[chairIndex];
    chair.updateMatrixWorld(true);
    const surface = chair.getWorldPosition(new THREE.Vector3()).y
      + LOUNGER_SURFACE_ABOVE_ORIGIN;

    assert.ok(hipsY > surface,
      `${id}'s hips are at ${hipsY.toFixed(3)}, below her own slats at `
      + `${surface.toFixed(3)} -- seatUnder cannot see a seat above the hips, `
      + 'so she will be re-seated on the deck instead');
    assert.ok(hipsY > deckTop,
      `${id}'s hips are at or under the pool deck (${deckTop.toFixed(3)})`);
  }
});
