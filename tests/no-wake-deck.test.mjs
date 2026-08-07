/**
 * Nobody gets stuck on this boat, on deck or below it.
 *
 * The redesigned NO WAKE cruiser is two walkable spaces: a main deck with a
 * raised foredeck, a windshield walk-through, a helm to starboard and a U of
 * cockpit seating; and a cabin under the foredeck with a galley to port, a
 * dinette to starboard and a V-berth forward. The player is a 0.60 m wide
 * capsule in both.
 *
 * Every soft-lock this scene has ever shipped has been the same shape: two
 * solids leaving a channel narrower than the capsule, no position that
 * satisfies both, and the player pinned there with his velocity cancelled. So
 * this file holds the class of bug shut rather than the instances:
 *
 *  1. No two solids may leave a channel narrower than the capsule.
 *  2. Dropped anywhere walkable, the capsule must settle at a stable point,
 *     with no residual overlap and no oscillation.
 *  3. From every point it settles at, the player must be able to walk away.
 *     A spot with no exit direction is a trap even if it is perfectly stable.
 *
 * (3) is the one geometry cannot guarantee on its own, so it is checked against
 * a movement model that matches `src/core/player.js`.
 * `tools/verify-no-wake.mjs` runs the same sweeps in the browser against the
 * real `Player` and the real world, so this cannot pass on a stale copy of the
 * rules.
 *
 * And one rule that is not about traps at all: **the deck paths are wide.** The
 * owner's complaint about the old boat was that boarding, reaching the bow line
 * and reaching the helm were all too tight. Those are asserted here as
 * clearances, not left to a playtest.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CABIN,
  CABIN_COLLIDERS,
  CABIN_STAGING,
  CAPSULE_RADIUS,
  DECK,
  DECK_COLLIDERS,
  cabinColliderBoxes,
  deckColliderBoxes,
  deckPenetration,
  narrowChannels,
  resolveOnDeck,
} from '../src/nowake/deck-collision.js';

const EYE_HEIGHT = 1.66;

// src/core/player.js: SPEED_WALK, ACCEL, FRICTION.
const SPEED_WALK = 2.35;
const ACCEL = 12;
const FRICTION = 11;
const STEP = 1 / 60;

/** One walkable space, with its own solids and its own floor. */
function space(name, colliders, extent) {
  const boxes = name === 'cabin' ? cabinColliderBoxes() : deckColliderBoxes(colliders);
  const eyeY = (z) => extent.heightAt(z) + EYE_HEIGHT;

  const settle = (x, z, frames = 90) => {
    const track = [];
    for (let i = 0; i < frames; i++) {
      // Player.update resolves twice a frame, once after each axis of movement.
      ({ x, z } = resolveOnDeck(boxes, x, z, CAPSULE_RADIUS, eyeY(z), EYE_HEIGHT, extent));
      ({ x, z } = resolveOnDeck(boxes, x, z, CAPSULE_RADIUS, eyeY(z), EYE_HEIGHT, extent));
      track.push([x, z]);
    }
    const tail = track.slice(-16);
    const amplitude = Math.max(
      Math.max(...tail.map((p) => p[0])) - Math.min(...tail.map((p) => p[0])),
      Math.max(...tail.map((p) => p[1])) - Math.min(...tail.map((p) => p[1])),
    );
    return { x, z, amplitude, ...deckPenetration(boxes, x, z, CAPSULE_RADIUS, eyeY(z), EYE_HEIGHT) };
  };

  /** Walk `frames` steps holding one direction, the way Player.update moves. */
  const walk = (x, z, dirX, dirZ, frames) => {
    let vx = 0;
    let vz = 0;
    for (let i = 0; i < frames; i++) {
      const rate = dirX || dirZ ? ACCEL : FRICTION;
      vx += (dirX * SPEED_WALK - vx) * Math.min(1, STEP * rate);
      vz += (dirZ * SPEED_WALK - vz) * Math.min(1, STEP * rate);
      if (Math.abs(vx) < .01) vx = 0;
      if (Math.abs(vz) < .01) vz = 0;
      for (const axis of ['x', 'z']) {
        if (axis === 'x') x += vx * STEP; else z += vz * STEP;
        const solved = resolveOnDeck(boxes, x, z, CAPSULE_RADIUS, eyeY(z), EYE_HEIGHT, extent);
        x = solved.x;
        z = solved.z;
        if (!solved.changed) continue;
        // Cancel only the component driving into the surface — the same rule
        // the scene applies, and the reason a squeeze is survivable.
        const length = Math.hypot(solved.dx, solved.dz);
        const nx = solved.dx / length;
        const nz = solved.dz / length;
        const into = vx * nx + vz * nz;
        if (into < 0) { vx -= nx * into; vz -= nz * into; }
      }
    }
    return { x, z };
  };

  const bestEscape = (x, z, frames = 72) => {
    let best = 0;
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2;
      const end = walk(x, z, Math.cos(angle), Math.sin(angle), frames);
      best = Math.max(best, Math.hypot(end.x - x, end.z - z));
      if (best >= .45) break;
    }
    return best;
  };

  return { name, boxes, extent, settle, walk, bestEscape };
}

const deck = space('deck', DECK_COLLIDERS, DECK);
const cabin = space('cabin', CABIN_COLLIDERS, CABIN);

for (const list of [DECK_COLLIDERS, CABIN_COLLIDERS]) {
  test(`no two solids leave a channel narrower than the player capsule (${list === DECK_COLLIDERS ? 'deck' : 'cabin'})`, () => {
    assert.deepEqual(narrowChannels(list), [],
      'a channel under 0.60 m has no position that satisfies both sides; widen one box or overlap them');
  });
}

test('every solid is a real, uniquely named box in both spaces', () => {
  for (const [label, list] of [['deck', DECK_COLLIDERS], ['cabin', CABIN_COLLIDERS]]) {
    for (const entry of list) {
      assert.ok(entry.name, `${label}: each collider is named so a failing sweep can say what trapped the player`);
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(entry.max[axis] > entry.min[axis], `${entry.name} is inside out on axis ${axis}`);
      }
    }
    const names = list.map((entry) => entry.name);
    assert.equal(new Set(names).size, names.length, `${label}: collider names are unique`);
  }
  // Both rail runs have to reach past the walkable edge, or the player walks
  // off the side between them.
  for (const name of ['port rail · foredeck run', 'port rail · side deck']) {
    assert.ok(deck.boxes.find((box) => box.name === name).max.x <= -DECK.halfBeam + CAPSULE_RADIUS);
  }
  for (const name of ['starboard rail · foredeck run', 'starboard rail · side deck']) {
    assert.ok(deck.boxes.find((box) => box.name === name).min.x >= DECK.halfBeam - CAPSULE_RADIUS);
  }
});

for (const target of [deck, cabin]) {
  test(`the capsule settles with no overlap and no oscillation from anywhere on the ${target.name}`, () => {
    const failures = [];
    for (let x = -target.extent.halfBeam; x <= target.extent.halfBeam + 1e-9; x += .05) {
      for (let z = target.extent.bow; z <= target.extent.stern + 1e-9; z += .05) {
        const result = target.settle(x, z);
        const offDeck = Math.abs(result.x) > target.extent.halfBeam + 1e-6
          || result.z < target.extent.bow - 1e-6 || result.z > target.extent.stern + 1e-6;
        if (result.depth > .002 || result.amplitude > .002 || offDeck) {
          failures.push({
            from: [Number(x.toFixed(2)), Number(z.toFixed(2))],
            to: [Number(result.x.toFixed(3)), Number(result.z.toFixed(3))],
            depth: Number(result.depth.toFixed(3)),
            amplitude: Number(result.amplitude.toFixed(4)),
            offDeck,
            inside: result.name,
          });
        }
      }
    }
    assert.deepEqual(failures.slice(0, 8), [],
      `${failures.length} ${target.name} positions do not resolve to a clear, stable point`);
  });

  test(`the player can walk away from every point the ${target.name} resolves him to`, () => {
    const settled = new Map();
    for (let x = -target.extent.halfBeam; x <= target.extent.halfBeam + 1e-9; x += .05) {
      for (let z = target.extent.bow; z <= target.extent.stern + 1e-9; z += .05) {
        const result = target.settle(x, z, 60);
        const key = `${Math.round(result.x * 40)}:${Math.round(result.z * 40)}`;
        if (!settled.has(key)) settled.set(key, { x: result.x, z: result.z, from: [x, z] });
      }
    }
    const floor = target.name === 'deck' ? 200 : 40;
    assert.ok(settled.size > floor,
      `expected a real spread of settled ${target.name} points, got ${settled.size}`);
    const trapped = [];
    for (const point of settled.values()) {
      if (target.bestEscape(point.x, point.z) >= .45) continue;
      trapped.push({
        at: [Number(point.x.toFixed(3)), Number(point.z.toFixed(3))],
        from: [Number(point.from[0].toFixed(2)), Number(point.from[1].toFixed(2))],
      });
    }
    assert.deepEqual(trapped.slice(0, 8), [],
      `${trapped.length} settled ${target.name} positions have no way out — every one is a soft-lock`);
  });
}

test('the deck paths the owner called tight are wide', () => {
  const at = (name) => deck.boxes.find((box) => box.name === name);
  /* The route from the cockpit to the foredeck, which is how the player
   * reaches the bow line and the ballast locker. Both legs are authored at a
   * metre or better: the old boat's forward side deck was 0.92 m and that was
   * the complaint. */
  const throughDeck = at('helm console').min.x - at('companionway hatch').max.x;
  assert.ok(throughDeck >= .9,
    `only ${throughDeck.toFixed(2)} m between the companionway and the helm console`);
  const walkThrough = at('windshield · starboard wing').min.x - at('windshield · port wing').max.x;
  assert.ok(walkThrough >= 1.2,
    `the windshield walk-through is only ${walkThrough.toFixed(2)} m`);
  // The foredeck itself is the full beam: nothing stands on it but the rails.
  const foredeckSolids = DECK_COLLIDERS.filter((entry) => (
    entry.max[2] < DECK.rampBow && !/rail|pulpit/.test(entry.name)
  ));
  assert.deepEqual(foredeckSolids.map((entry) => entry.name), [],
    'the bow has to be wide enough to walk; nothing but rails may stand on it');
  const foredeckWidth = at('starboard rail · foredeck run').min.x
    - at('port rail · foredeck run').max.x;
  assert.ok(foredeckWidth >= 4.7,
    `the foredeck is only ${foredeckWidth.toFixed(2)} m across`);
  /* And the route the body takes: companionway aft to the transom gate, past a
   * U of seating that opens to starboard. */
  const toTheGate = at('starboard coaming · cockpit').min.x - at('cockpit seating · aft bench').max.x;
  assert.ok(toTheGate >= 1.2,
    `only ${toTheGate.toFixed(2)} m of passage between the seating and the transom gate`);
});

test('the deck is two levels joined by a ramp, and the ramp is monotonic', () => {
  assert.equal(DECK.heightAt(DECK.bow), DECK.foredeckHeight);
  assert.equal(DECK.heightAt(DECK.stern), DECK.height);
  assert.ok(DECK.foredeckHeight > DECK.height, 'the foredeck is the cabin trunk roof');
  let previous = DECK.heightAt(DECK.bow);
  for (let z = DECK.bow; z <= DECK.stern; z += .05) {
    const here = DECK.heightAt(z);
    assert.ok(here <= previous + 1e-9, `the deck rises again at z ${z.toFixed(2)}`);
    previous = here;
  }
  // The cabin is under the foredeck and stands up in.
  assert.ok(CABIN.ceiling - CABIN.height >= 2.05,
    `only ${(CABIN.ceiling - CABIN.height).toFixed(2)} m of headroom below deck`);
});

/**
 * Punch list N1: "below-deck cabin far too small — plays out in a bathroom".
 *
 * The complaint was a measurement, so the fix is a measurement, and this is the
 * cheapest machine that can catch it coming back. Every number here is what the
 * old cabin FAILED: 1.36 m of clear width, 1.66 m of clear length, 1.82 m of
 * headroom, 2.3 m² of floor. Shrinking any of them below a room a man can be
 * confronted in fails here before a browser is ever opened.
 */
test('the cabin is a salon a confrontation fits in, not a bathroom', () => {
  const at = (name) => cabin.boxes.find((box) => box.name === name);
  const headroom = CABIN.ceiling - CABIN.height;
  assert.ok(headroom >= 2.05, `${headroom.toFixed(2)} m of headroom is a crawl space`);

  // Beam to beam between the two furniture runs: the width of the salon floor.
  const clearWidth = at('cabin · dinette booth').min.x - at('cabin · galley counter').max.x;
  assert.ok(clearWidth >= 2.0,
    `only ${clearWidth.toFixed(2)} m of clear sole between the galley and the dinette`);

  // And fore-and-aft, from the galley's forward end to the companionway sill.
  const clearLength = at('cabin · companionway sill').min.z - at('cabin · galley counter').min.z;
  assert.ok(clearLength >= 2.2,
    `only ${clearLength.toFixed(2)} m of clear sole between the V-berth and the stairs`);

  // The whole room, liner to liner and bulkhead to bulkhead.
  const interiorWidth = CABIN.halfBeam * 2;
  const interiorLength = CABIN.stern - CABIN.bow;
  assert.ok(interiorWidth >= 3.8, `the cabin is only ${interiorWidth.toFixed(2)} m across`);
  assert.ok(interiorLength >= 3.5, `the cabin is only ${interiorLength.toFixed(2)} m long`);

  /* Measured rather than assumed: walk the 0.05 m grid and count the squares a
   * standing capsule's CENTRE can occupy without touching anything. That is the
   * honest "can four men be in here" number, and the old cabin's was 0.80 m² —
   * one man, standing still, which is exactly what the owner saw. */
  let squares = 0;
  for (let x = -CABIN.halfBeam; x <= CABIN.halfBeam + 1e-9; x += .05) {
    for (let z = CABIN.bow; z <= CABIN.stern + 1e-9; z += .05) {
      const { depth } = deckPenetration(cabin.boxes, x, z, CAPSULE_RADIUS,
        CABIN.height + EYE_HEIGHT, EYE_HEIGHT);
      if (depth <= 1e-6) squares++;
    }
  }
  const floor = squares * .05 * .05;
  assert.ok(floor >= 3.4,
    `only ${floor.toFixed(2)} m² of standable cabin sole (the bathroom was 0.80)`);

  // The confrontation's own pen has to be a room too, not a phone box.
  const stagingArea = (CABIN_STAGING.maxX - CABIN_STAGING.minX)
    * (CABIN_STAGING.maxZ - CABIN_STAGING.minZ);
  assert.ok(stagingArea >= 1.2,
    `the staging area is ${stagingArea.toFixed(2)} m² — the player cannot move in it`);
});

test('the confrontation staging area is inside the cabin and is not a trap', () => {
  assert.ok(CABIN_STAGING.minX >= -CABIN.halfBeam && CABIN_STAGING.maxX <= CABIN.halfBeam);
  assert.ok(CABIN_STAGING.minZ >= CABIN.bow && CABIN_STAGING.maxZ <= CABIN.stern);
  const corners = [
    [CABIN_STAGING.minX, CABIN_STAGING.minZ], [CABIN_STAGING.maxX, CABIN_STAGING.minZ],
    [CABIN_STAGING.minX, CABIN_STAGING.maxZ], [CABIN_STAGING.maxX, CABIN_STAGING.maxZ],
  ];
  for (const [x, z] of corners) {
    const settled = cabin.settle(x, z, 40);
    assert.ok(settled.depth <= .002,
      `the staging corner (${x}, ${z}) is inside ${settled.name}`);
    assert.ok(Math.hypot(settled.x - x, settled.z - z) < .05,
      `the staging corner (${x}, ${z}) is pushed to (${settled.x.toFixed(2)}, ${settled.z.toFixed(2)})`);
  }
});

test('a capsule inside a solid is never ejected off the boat', () => {
  /* Landing inside furniture used to throw the player forward off the bow: the
   * nearest face of a cabin trunk, for anyone near its front, is the forward
   * one, and forward of it the deck ends. Every interior point has to come out
   * somewhere that is still walkable. */
  for (const target of [deck, cabin]) {
    for (const box of target.boxes) {
      for (let x = box.min.x + .01; x < box.max.x; x += .06) {
        for (let z = box.min.z + .01; z < box.max.z; z += .06) {
          if (!(Math.abs(x) <= target.extent.halfBeam
            && z >= target.extent.bow && z <= target.extent.stern)) continue;
          const result = target.settle(x, z, 60);
          assert.ok(Math.abs(result.x) <= target.extent.halfBeam + 1e-6
            && result.z >= target.extent.bow - 1e-6 && result.z <= target.extent.stern + 1e-6,
          `inside ${box.name} at (${x.toFixed(2)}, ${z.toFixed(2)}) ejects to (${result.x.toFixed(2)}, ${result.z.toFixed(2)}), off the ${target.name}`);
          assert.ok(result.depth <= .002,
            `inside ${box.name} at (${x.toFixed(2)}, ${z.toFixed(2)}) still overlaps ${result.name} by ${result.depth.toFixed(3)}`);
        }
      }
    }
  }
});
