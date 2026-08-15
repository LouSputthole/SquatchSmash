import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/core/player.js';
import { ColliderGrid } from '../src/core/collider-broadphase.js';

/* ------------------------------------------------------------------ */
/* The reference: the scan `Player._resolve` used to do, verbatim.     */
/* ------------------------------------------------------------------ */

const RADIUS = 0.30;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/**
 * Brute-force resolve over EVERY collider in array order, exactly as
 * src/core/player.js did before the broadphase. Runs on a plain state object
 * so it cannot share code with the thing under test.
 * @returns {Set<number>} indices that actually pushed the capsule
 */
function bruteResolve(state, axis) {
  const p = state.position;
  const pushed = new Set();
  state.world.colliders.forEach((box, i) => {
    if (p.y + 0.05 < box.min.y || p.y - state.eyeHeight > box.max.y) return;
    const cx = clamp(p.x, box.min.x, box.max.x);
    const cz = clamp(p.z, box.min.z, box.max.z);
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) return;
    pushed.add(i);
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = RADIUS - d;
      if (axis === 'x') { p.x += (dx / d) * push; state.velocity.x = 0; } else { p.z += (dz / d) * push; state.velocity.z = 0; }
    } else {
      const toMinX = p.x - box.min.x;
      const toMaxX = box.max.x - p.x;
      const toMinZ = p.z - box.min.z;
      const toMaxZ = box.max.z - p.z;
      const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
      if (m === toMinX) p.x = box.min.x - RADIUS;
      else if (m === toMaxX) p.x = box.max.x + RADIUS;
      else if (m === toMinZ) p.z = box.min.z - RADIUS;
      else p.z = box.max.z + RADIUS;
      state.velocity.x = 0;
      state.velocity.z = 0;
    }
  });
  return pushed;
}

/** Every index the brute force would collide with at (p) WITHOUT moving. */
function bruteTouches(colliders, p, eyeHeight) {
  const out = [];
  colliders.forEach((box, i) => {
    if (p.y + 0.05 < box.min.y || p.y - eyeHeight > box.max.y) return;
    const cx = clamp(p.x, box.min.x, box.max.x);
    const cz = clamp(p.z, box.min.z, box.max.z);
    const dx = p.x - cx;
    const dz = p.z - cz;
    if (dx * dx + dz * dz >= RADIUS * RADIUS) return;
    out.push(i);
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Deterministic random worlds                                         */
/* ------------------------------------------------------------------ */

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function box(x0, y0, z0, x1, y1, z1) {
  return new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
}

/** A world like the scenes build: walls, furniture, a few odd ones. */
function randomWorld(rand, n, span = 60) {
  const colliders = [];
  for (let i = 0; i < n; i++) {
    const kind = rand();
    const x = (rand() - 0.5) * span;
    const z = (rand() - 0.5) * span;
    let w; let d; let y0 = 0; let h;
    if (kind < 0.15) { // long wall
      w = rand() < 0.5 ? 0.3 : 4 + rand() * 20; d = w > 1 ? 0.3 : 4 + rand() * 20; h = 3;
    } else if (kind < 0.25) { // elevated (table top, header, ceiling)
      w = 0.5 + rand() * 2; d = 0.5 + rand() * 2; y0 = 0.6 + rand() * 1.5; h = 0.1 + rand() * 0.6;
    } else if (kind < 0.35) { // low (chair, crate, kerb)
      w = 0.3 + rand() * 1; d = 0.3 + rand() * 1; h = 0.1 + rand() * 0.6;
    } else if (kind < 0.37) { // one on a cell boundary, exactly
      const cx = Math.round(x / 4) * 4;
      w = 1; d = 1; h = 2; colliders.push(box(cx, 0, z, cx + 1, 2, z + 1)); continue;
    } else if (kind < 0.38) { // paper-thin (a door)
      w = 0.02; d = 1 + rand(); h = 2.1;
    } else { // furniture
      w = 0.3 + rand() * 1.5; d = 0.3 + rand() * 1.5; h = 0.4 + rand() * 1.5;
    }
    colliders.push(box(x - w / 2, y0, z - d / 2, x + w / 2, y0 + h, z + d / 2));
  }
  return colliders;
}

function makePlayer(colliders, extra = {}) {
  const player = new Player(new THREE.PerspectiveCamera(), { colliders, floorZones: [], ...extra });
  player.mode = 'walk';
  player.enabled = true;
  return player;
}

function stateOf(player) {
  return {
    position: player.position.clone(),
    velocity: player.velocity.clone(),
    eyeHeight: player.eyeHeight,
    world: player.world,
  };
}

function assertSame(player, ref, label) {
  assert.equal(player.position.x, ref.position.x, `${label}: x`);
  assert.equal(player.position.y, ref.position.y, `${label}: y`);
  assert.equal(player.position.z, ref.position.z, `${label}: z`);
  assert.equal(player.velocity.x, ref.velocity.x, `${label}: vx`);
  assert.equal(player.velocity.z, ref.velocity.z, `${label}: vz`);
}

/** Put the player somewhere interesting: often inside or against a box. */
function placeRandom(rand, player, colliders, span) {
  const roll = rand();
  if (roll < 0.5 && colliders.length) {
    const b = colliders[Math.floor(rand() * colliders.length)];
    const pad = 0.6;
    player.position.set(
      b.min.x - pad + rand() * (b.max.x - b.min.x + pad * 2),
      1.66,
      b.min.z - pad + rand() * (b.max.z - b.min.z + pad * 2),
    );
  } else {
    player.position.set((rand() - 0.5) * span, 1.66, (rand() - 0.5) * span);
  }
  player.eyeHeight = rand() < 0.2 ? 1.02 : 1.66;
  if (rand() < 0.3) player.position.y = player.eyeHeight + rand() * 1.5; // airborne / on a stage
  player.velocity.set((rand() - 0.5) * 4, 0, (rand() - 0.5) * 4);
}

/* ------------------------------------------------------------------ */

test('broadphase candidates are a superset of every collider the brute force would touch', () => {
  const rand = rng(11);
  for (let world = 0; world < 12; world++) {
    const colliders = randomWorld(rand, 40 + Math.floor(rand() * 400));
    const grid = new ColliderGrid();
    const p = new THREE.Vector3();
    for (let trial = 0; trial < 300; trial++) {
      grid.sync(colliders);
      p.set((rand() - 0.5) * 70, 1.66, (rand() - 0.5) * 70);
      if (rand() < 0.5 && colliders.length) {
        const b = colliders[Math.floor(rand() * colliders.length)];
        p.x = b.min.x - 0.5 + rand() * (b.max.x - b.min.x + 1);
        p.z = b.min.z - 0.5 + rand() * (b.max.z - b.min.z + 1);
      }
      const eye = 1.66;
      const need = bruteTouches(colliders, p, eye);
      const got = new Set(grid.query(p.x, p.z, RADIUS));
      for (const i of need) assert.ok(got.has(i), `world ${world} trial ${trial}: index ${i} touched by brute force but not a candidate`);
      const list = grid.query(p.x, p.z, RADIUS);
      for (let k = 1; k < list.length; k++) assert.ok(list[k] > list[k - 1], 'candidates ascending and unique');
    }
  }
});

test('Player._resolve with the broadphase is bit-identical to the brute-force scan on random worlds', () => {
  const rand = rng(23);
  let pushes = 0;
  for (let world = 0; world < 16; world++) {
    const span = 40 + rand() * 60;
    const colliders = randomWorld(rand, 20 + Math.floor(rand() * 500), span);
    const player = makePlayer(colliders);
    for (let trial = 0; trial < 250; trial++) {
      placeRandom(rand, player, colliders, span);
      const axis = rand() < 0.5 ? 'x' : 'z';
      const ref = stateOf(player);
      const pushed = bruteResolve(ref, axis);
      pushes += pushed.size;
      player._resolve(axis);
      assertSame(player, ref, `world ${world} trial ${trial} axis ${axis}`);
      // A second axis pass from where it landed, as _updateWalk does.
      const other = axis === 'x' ? 'z' : 'x';
      const ref2 = stateOf(player);
      bruteResolve(ref2, other);
      player._resolve(other);
      assertSame(player, ref2, `world ${world} trial ${trial} second axis ${other}`);
    }
  }
  assert.ok(pushes > 500, `the random worlds must actually collide (got ${pushes} pushes)`);
});

test('a push re-queries from the new position: later boxes are tested where the capsule now is', () => {
  /* Box 0 is a long slab; the capsule starts inside it near its far end and
   * the dead-centre eject throws it out through that end face, into box 1 --
   * which lies in the NEXT grid cell and was not a candidate at the start
   * position. The brute force meets box 1 at the moved position; so must we. */
  const colliders = [
    box(-1, 0, -0.5, 1, 2, 7.5),     // slab along z; +z face is nearest to the start
    box(-0.4, 0, 8.05, 0.4, 2, 9),   // just past that face, in cell z=2
    box(20, 0, 20, 21, 2, 21),
  ];
  const player = makePlayer(colliders);
  player.position.set(0.2, 1.66, 7.3);
  player.velocity.set(1, 0, 1);
  const grid = new ColliderGrid();
  grid.sync(colliders);
  assert.ok(!grid.query(0.2, 7.3, RADIUS).includes(1), 'box 1 must not be a candidate before the eject');
  const ref = stateOf(player);
  const pushed = bruteResolve(ref, 'z');
  assert.deepEqual([...pushed], [0, 1], 'the scenario must chain two pushes');
  player._resolve('z');
  assertSame(player, ref, 'chained push');
});

test('the grid follows every kind of collider mutation without being told', () => {
  const rand = rng(99);
  const colliders = randomWorld(rand, 120);
  const player = makePlayer(colliders);
  const probe = (label) => {
    for (let t = 0; t < 40; t++) {
      placeRandom(rand, player, player.world.colliders, 60);
      const ref = stateOf(player);
      bruteResolve(ref, 'x');
      player._resolve('x');
      assertSame(player, ref, `${label} #${t}`);
    }
  };
  probe('static');
  const rebuildsAtStart = player._grid.rebuilds;

  // push
  colliders.push(box(3, 0, 3, 5, 2, 5));
  probe('push');
  // splice one out of the middle (every later index shifts)
  colliders.splice(7, 1);
  probe('splice');
  // swap at equal length in one frame (a door closes as another opens)
  colliders.splice(3, 1);
  colliders.push(box(-8, 0, -8, -6, 2, -6));
  probe('same-length swap');
  assert.equal(player._grid.rebuilds, rebuildsAtStart + 2, 'length changes rebuild; a same-length swap is re-filed in place');

  // move a box in place, three ways scenes do it
  const refilesBefore = player._grid.refiles;
  const mover = colliders[10];
  mover.min.set(11, 0, -3); mover.max.set(13, 2.4, -1);           // Vector3.set (beefrun truck)
  probe('min/max.set');
  mover.copy(box(-14, 0, 6, -12, 1.1, 8));                          // Box3.copy (mansion cart)
  probe('Box3.copy');
  mover.min.x -= 1.5; mover.max.x -= 1.5; mover.min.y = 0.2;        // field writes (Silent Squatch door)
  probe('field writes');
  assert.ok(player._grid.refiles >= refilesBefore + 3, 'in-place moves re-file the box');
  // ...and a moving box every frame does not rebuild the whole grid
  const rebuildsBeforeDrift = player._grid.rebuilds;
  for (let f = 0; f < 30; f++) {
    mover.translate(new THREE.Vector3(0.05, 0, 0.02));
    player.position.set(mover.min.x - 0.2, 1.66, mover.min.z + 0.5);
    const ref = stateOf(player);
    bruteResolve(ref, 'x');
    player._resolve('x');
    assertSame(player, ref, `drift frame ${f}`);
  }
  assert.equal(player._grid.rebuilds, rebuildsBeforeDrift, 'a per-frame mover is re-filed, not rebuilt');

  // replace the whole array
  player.world.colliders = randomWorld(rand, 80);
  probe('array replaced');
  // and empty it
  player.world.colliders.length = 0;
  probe('emptied');
  player.world.colliders.push(box(-1, 0, -1, 1, 2, 1));
  probe('refilled');
});

test('huge and non-finite colliders are always tested, never looped over as cells', () => {
  const colliders = [
    box(-1e6, 0, -1e6, 1e6, 0.1, 1e6),                 // a floor slab the size of the world (top at feet: not skipped)
    box(-Infinity, 0, -1, Infinity, 2, 1),               // an infinite wall
    box(2, 0, 2, 3, 2, 3),
  ];
  const player = makePlayer(colliders);
  const rand = rng(5);
  for (let t = 0; t < 60; t++) {
    placeRandom(rand, player, colliders.slice(2), 20);
    const ref = stateOf(player);
    bruteResolve(ref, t % 2 ? 'x' : 'z');
    player._resolve(t % 2 ? 'x' : 'z');
    assertSame(player, ref, `odd colliders #${t}`);
  }
  assert.equal(player._grid._always.length, 2);
});

test('the y-band test still applies to candidates (a table top is walked under, a wall is not)', () => {
  const colliders = [
    box(-1, 1.9, -1, 1, 2.0, 1),   // above the head: ignored
    box(-1, 0, 2, 1, 2, 3),        // a wall
  ];
  const player = makePlayer(colliders);
  player.position.set(0, 1.66, 0);
  player.velocity.set(0, 0, 3);
  player._resolve('z');
  assert.equal(player.position.z, 0, 'the header over the doorway does not push');
  player.position.set(0, 1.66, 1.9);
  player._resolve('z');
  assert.ok(player.position.z <= 2 - RADIUS + 1e-9, 'the wall does');
});
