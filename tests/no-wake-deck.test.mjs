/**
 * Nobody gets stuck on this boat.
 *
 * The NO WAKE deck is 4.5 m by 11.4 m with rails, a cabin trunk, a windshield,
 * a console, two helm chairs, a locker and a bench on it, and the player is a
 * 0.60 m wide capsule. Every playtest that has gone wrong on this scene has
 * gone wrong the same way: two solids left a channel narrower than the capsule,
 * the resolver had no position that satisfied both, and the player was pinned
 * with his velocity cancelled — at the aft bench, and then at the bow the
 * moment he released the mooring line.
 *
 * This file holds the class of bug shut rather than the instances:
 *
 *  1. No two solids may leave a channel narrower than the capsule.
 *  2. Dropped anywhere on the walkable deck, the capsule must settle at a
 *     stable point, with no residual overlap and no oscillation.
 *  3. From every point it settles at, the player must be able to walk away.
 *     A spot with no exit direction is a trap even if it is perfectly stable.
 *
 * (3) is the one the geometry cannot guarantee on its own, so it is checked
 * against a movement model that matches `src/core/player.js`.
 * `tools/verify-no-wake.mjs` runs the same sweep in the browser against the
 * real `Player` and the real world, so this cannot pass on a stale copy of the
 * rules.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAPSULE_RADIUS,
  DECK,
  DECK_COLLIDERS,
  deckColliderBoxes,
  deckPenetration,
  narrowChannels,
  resolveOnDeck,
} from '../src/nowake/deck-collision.js';

const EYE_HEIGHT = 1.66;
const EYE_Y = DECK.height + EYE_HEIGHT;
const BOXES = deckColliderBoxes();

// src/core/player.js: SPEED_WALK, ACCEL, FRICTION.
const SPEED_WALK = 2.35;
const ACCEL = 12;
const FRICTION = 11;
const STEP = 1 / 60;

function settle(x, z, frames = 90) {
  const track = [];
  for (let i = 0; i < frames; i++) {
    // Player.update resolves twice a frame, once after each axis of movement.
    ({ x, z } = resolveOnDeck(BOXES, x, z, CAPSULE_RADIUS, EYE_Y, EYE_HEIGHT, DECK));
    ({ x, z } = resolveOnDeck(BOXES, x, z, CAPSULE_RADIUS, EYE_Y, EYE_HEIGHT, DECK));
    track.push([x, z]);
  }
  const tail = track.slice(-16);
  const amplitude = Math.max(
    Math.max(...tail.map((p) => p[0])) - Math.min(...tail.map((p) => p[0])),
    Math.max(...tail.map((p) => p[1])) - Math.min(...tail.map((p) => p[1])),
  );
  return { x, z, amplitude, ...deckPenetration(BOXES, x, z, CAPSULE_RADIUS, EYE_Y, EYE_HEIGHT) };
}

/** Walk `frames` steps holding one direction, the way Player.update moves. */
function walk(x, z, dirX, dirZ, frames) {
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
      const solved = resolveOnDeck(BOXES, x, z, CAPSULE_RADIUS, EYE_Y, EYE_HEIGHT, DECK);
      x = solved.x;
      z = solved.z;
      if (!solved.changed) continue;
      // Cancel only the component driving into the surface — the same rule the
      // scene applies, and the reason a squeeze is survivable.
      const length = Math.hypot(solved.dx, solved.dz);
      const nx = solved.dx / length;
      const nz = solved.dz / length;
      const into = vx * nx + vz * nz;
      if (into < 0) { vx -= nx * into; vz -= nz * into; }
    }
  }
  return { x, z };
}

/** The furthest the player can get from a standing start, over 16 headings. */
function bestEscape(x, z, frames = 72) {
  let best = 0;
  let heading = null;
  for (let i = 0; i < 16; i++) {
    const angle = i / 16 * Math.PI * 2;
    const end = walk(x, z, Math.cos(angle), Math.sin(angle), frames);
    const moved = Math.hypot(end.x - x, end.z - z);
    if (moved > best) { best = moved; heading = Math.round(angle * 180 / Math.PI); }
  }
  return { best, heading };
}

test('no two deck solids leave a channel narrower than the player capsule', () => {
  assert.deepEqual(narrowChannels(), [],
    'a channel under 0.60 m has no position that satisfies both sides; widen one box or overlap them');
});

test('every solid is a real box and the table covers the boat the scene draws', () => {
  for (const entry of DECK_COLLIDERS) {
    assert.ok(entry.name, 'each collider is named so a failing sweep can say what trapped the player');
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(entry.max[axis] > entry.min[axis], `${entry.name} is inside out on axis ${axis}`);
    }
  }
  const names = DECK_COLLIDERS.map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length, 'collider names are unique');
  // Both rail runs have to reach past the walkable edge, or the player walks
  // off the side between them.
  const portForward = BOXES.find((box) => box.name === 'port rail · forward run');
  const starboardForward = BOXES.find((box) => box.name === 'starboard rail · forward run');
  assert.ok(portForward.max.x <= -DECK.halfBeam + CAPSULE_RADIUS);
  assert.ok(starboardForward.min.x >= DECK.halfBeam - CAPSULE_RADIUS);
});

test('the capsule settles with no overlap and no oscillation from anywhere on the deck', () => {
  const failures = [];
  for (let x = -DECK.halfBeam; x <= DECK.halfBeam + 1e-9; x += .05) {
    for (let z = DECK.bow; z <= DECK.stern + 1e-9; z += .05) {
      const result = settle(x, z);
      const offDeck = Math.abs(result.x) > DECK.halfBeam + 1e-6
        || result.z < DECK.bow - 1e-6 || result.z > DECK.stern + 1e-6;
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
    `${failures.length} deck positions do not resolve to a clear, stable point`);
});

test('the player can walk away from every point the deck resolves him to', () => {
  const settled = new Map();
  for (let x = -DECK.halfBeam; x <= DECK.halfBeam + 1e-9; x += .05) {
    for (let z = DECK.bow; z <= DECK.stern + 1e-9; z += .05) {
      const result = settle(x, z, 60);
      // Dedupe: a whole region collapses onto the same handful of points.
      const key = `${Math.round(result.x * 40)}:${Math.round(result.z * 40)}`;
      if (!settled.has(key)) settled.set(key, { x: result.x, z: result.z, from: [x, z] });
    }
  }
  assert.ok(settled.size > 200, `expected a real spread of settled points, got ${settled.size}`);
  const trapped = [];
  for (const point of settled.values()) {
    const escape = bestEscape(point.x, point.z);
    if (escape.best < .45) {
      trapped.push({
        at: [Number(point.x.toFixed(3)), Number(point.z.toFixed(3))],
        from: [Number(point.from[0].toFixed(2)), Number(point.from[1].toFixed(2))],
        bestMove: Number(escape.best.toFixed(3)),
      });
    }
  }
  assert.deepEqual(trapped.slice(0, 8), [],
    `${trapped.length} settled positions have no way out — every one is a soft-lock`);
});

test('the bow mooring station is reachable, and the player can leave it again', () => {
  /* The exact complaint: walk up the port side deck to the bow cleat, release
   * the line, and be unable to get back. The cleat pickup is centred on boat
   * local (-2.22, -5.35); standing room in front of it is the forward side
   * deck between the port rail and the cabin trunk. */
  const approach = walk(-1.68, 3.72, 0, -1, 300);
  assert.ok(approach.z < -4.7, `never reached the bow, stopped at z ${approach.z.toFixed(2)}`);
  assert.ok(Math.abs(approach.x + 1.68) < .3, `pushed off the side deck to x ${approach.x.toFixed(2)}`);
  assert.ok(Math.hypot(approach.x + 2.22, approach.z + 5.35) < 1.2,
    'the bow cleat is out of reach from where the side deck stops');

  // From the bow, and from each wall of the corner, the way back has to work.
  for (const start of [[-1.68, -5.12], [-2.02, -5.12], [-1.56, -5.12], [-2.02, -5.0], [-1.56, -4.6]]) {
    const settled = settle(start[0], start[1], 30);
    const back = walk(settled.x, settled.z, 0, 1, 300);
    assert.ok(back.z > 2.5,
      `stuck at the bow from (${start}): settled (${settled.x.toFixed(2)}, ${settled.z.toFixed(2)}) and only reached z ${back.z.toFixed(2)}`);
  }
});

test('the forward side decks are wider than the capsule with room to spare', () => {
  const trunk = BOXES.find((box) => box.name === 'cabin trunk');
  const portRail = BOXES.find((box) => box.name === 'port rail · forward run');
  const starboardRail = BOXES.find((box) => box.name === 'starboard rail · forward run');
  const port = trunk.min.x - portRail.max.x;
  const starboard = starboardRail.min.x - trunk.max.x;
  for (const [side, width] of [['port', port], ['starboard', starboard]]) {
    assert.ok(width >= 1.0,
      `${side} side deck is ${width.toFixed(2)} m; it was 0.92 and the owner asked for wider`);
    assert.ok(width - CAPSULE_RADIUS * 2 >= .4,
      `${side} side deck leaves only ${(width - .6).toFixed(2)} m of play for the capsule centre`);
  }
});

test('a capsule inside a solid is never ejected off the boat', () => {
  /* Landing on the cabin roof used to throw the player forward off the bow:
   * the nearest face of the trunk is its forward one, and forward of the trunk
   * the deck ends 0.07 m later. Every interior point has to come out somewhere
   * that is still a deck. */
  for (const box of BOXES) {
    for (let x = box.min.x + .01; x < box.max.x; x += .05) {
      for (let z = box.min.z + .01; z < box.max.z; z += .05) {
        if (!(Math.abs(x) <= DECK.halfBeam && z >= DECK.bow && z <= DECK.stern)) continue;
        const result = settle(x, z, 60);
        assert.ok(Math.abs(result.x) <= DECK.halfBeam + 1e-6
          && result.z >= DECK.bow - 1e-6 && result.z <= DECK.stern + 1e-6,
        `inside ${box.name} at (${x.toFixed(2)}, ${z.toFixed(2)}) ejects to (${result.x.toFixed(2)}, ${result.z.toFixed(2)}), off the deck`);
        assert.ok(result.depth <= .002,
          `inside ${box.name} at (${x.toFixed(2)}, ${z.toFixed(2)}) still overlaps ${result.name} by ${result.depth.toFixed(3)}`);
      }
    }
  }
});
