/**
 * DEAD GIVEAWAY'S ROOM: the contract in docs/DEAD-GIVEAWAY.md § world.js,
 * held against the built geometry rather than against the constructor.
 *
 * Every other Dead Giveaway module is written against these anchors and these
 * four handles (board, clues, chips, marker) by somebody who cannot see this
 * file, so what is asserted here is exactly what they code to: eight seats,
 * clockwise from the door, each camera yaw looking at the felt and each model
 * yaw half a turn from it; a board on a wall that faces the table; cards,
 * chips and the marker that change the objects at the seat they name and no
 * other. And the one thing the game cannot survive losing: a clear line from
 * every seated eye to every other seated eye, and to the board.
 *
 * Raycasts follow CLAUDE.md's trap: `updateMatrixWorld(true)` first, because
 * nothing headless ever recomputes `matrixWorld`, and only meshes are cast
 * against (a Sprite's raycast needs a camera, and the haze is sprites).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureDomShim();
ensureThreeShim();

const [THREE, { makeMaterials }, WORLD] = await Promise.all([
  import('three'),
  import('../src/world/materials.js'),
  import('../src/deadgiveaway/world.js'),
]);
const { buildBackroom, SEAT_COUNT, DG_ROOM, DG_CEIL } = WORLD;

function build() {
  const scene = new THREE.Scene();
  const world = buildBackroom(scene, { renderer: null, M: makeMaterials() });
  scene.updateMatrixWorld(true);
  return { scene, world };
}

const { scene, world } = build();
const { table, seats } = world.anchors;

function meshes(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (p.visible === false) return;
    out.push(o);
  });
  return out;
}

function nearestSeat(x, z) {
  let best = -1;
  let bestD = Infinity;
  for (const s of seats) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bestD) { bestD = d; best = s.seat; }
  }
  return best;
}

function visibleChipCount(seat) {
  const stack = scene.getObjectByName(`dg.seat.${seat}.chips`);
  return stack.children.filter((c) => c.isMesh && c.visible && c.name.startsWith(`dg.seat.${seat}.chip.`)).length;
}

test('eight seats, numbered 0..7 clockwise from the door end', () => {
  assert.equal(SEAT_COUNT, 8);
  assert.equal(seats.length, 8);
  assert.deepEqual(seats.map((s) => s.seat), [0, 1, 2, 3, 4, 5, 6, 7]);

  // Clockwise seen from above is increasing atan2(z, x) in three.js (north
  // is -z). Every step is one eighth of a turn in that sense.
  const ang = (s) => Math.atan2(s.z - table.z, s.x - table.x);
  for (let i = 0; i < 8; i++) {
    let d = ang(seats[(i + 1) % 8]) - ang(seats[i]);
    while (d <= 0) d += Math.PI * 2;
    assert.ok(Math.abs(d - Math.PI / 4) < 1e-9, `seat ${i} -> ${(i + 1) % 8} steps ${d} rad`);
  }

  // "From the door end": seat 0 is the first place clockwise from the door.
  const door = world.anchors.door;
  const doorAng = Math.atan2(door.z - table.z, door.x - table.x);
  const cw = (s) => { let d = ang(s) - doorAng; while (d < 0) d += Math.PI * 2; return d; };
  const first = [...seats].sort((a, b) => cw(a) - cw(b))[0];
  assert.equal(first.seat, 0, 'seat 0 is the first chair clockwise from the door');
});

test('every seat looks at the table centre, and faceYaw is the opposite of yaw', () => {
  for (const s of seats) {
    const toTable = new THREE.Vector2(table.x - s.x, table.z - s.z).normalize();
    // Player camera: looks along (-sin yaw, -cos yaw).
    const look = new THREE.Vector2(-Math.sin(s.yaw), -Math.cos(s.yaw));
    assert.ok(look.dot(toTable) > 0.99999, `seat ${s.seat} camera yaw ${s.yaw} misses the table`);
    // A model's face is its +z: (sin faceYaw, cos faceYaw).
    const face = new THREE.Vector2(Math.sin(s.faceYaw), Math.cos(s.faceYaw));
    assert.ok(face.dot(toTable) > 0.99999, `seat ${s.seat} faceYaw ${s.faceYaw} does not face the table`);
    let d = Math.abs(s.yaw - s.faceYaw) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    assert.ok(Math.abs(d - Math.PI) < 1e-9, `seat ${s.seat}: yaw and faceYaw are ${d} apart, not PI`);
    assert.equal(s.sitY, 0.53, 'cushion top is the shared rig\'s chair height (cast.js Npc.sit)');

    // The chair at the seat is turned to faceYaw too.
    const chair = scene.getObjectByName(`dg.seat.${s.seat}.chair`);
    assert.ok(chair, `dg.seat.${s.seat}.chair exists`);
    assert.ok(Math.abs(chair.position.x - s.x) < 1e-9 && Math.abs(chair.position.z - s.z) < 1e-9);
    assert.ok(Math.abs(chair.rotation.y - s.faceYaw) < 1e-9);
  }
});

test('seats stand outside the table and inside the room, with room to get behind them', () => {
  assert.ok(table.radius > 1 && table.topY > 0.7 && table.topY < 0.85, `table ${JSON.stringify(table)}`);
  for (const s of seats) {
    const r = Math.hypot(s.x - table.x, s.z - table.z);
    assert.ok(r > table.radius + 0.4, `seat ${s.seat} at r ${r.toFixed(3)} is in the rail (${table.radius})`);
    // Chair back is 0.36 m behind the seat centre; it must stay off the walls.
    const bx = table.x + (s.x - table.x) * (r + 0.36) / r;
    const bz = table.z + (s.z - table.z) * (r + 0.36) / r;
    for (const [v, lo, hi] of [[bx, DG_ROOM.x0, DG_ROOM.x1], [bz, DG_ROOM.z0, DG_ROOM.z1]]) {
      assert.ok(v > lo + 0.6 && v < hi - 0.6, `seat ${s.seat}'s chair back (${bx.toFixed(2)}, ${bz.toFixed(2)}) is within 0.6 m of a wall`);
    }
  }
  assert.ok(DG_CEIL > 2.6 && DG_CEIL < 2.8, 'a low ceiling, ~2.7 m');
});

test('the board is on a wall, facing the table, and the anchors are in the room', () => {
  const b = world.anchors.board;
  const mesh = scene.getObjectByName('dg.board');
  assert.ok(mesh?.isMesh, 'dg.board mesh');
  const pos = mesh.getWorldPosition(new THREE.Vector3());
  assert.ok(pos.distanceTo(new THREE.Vector3(b.x, b.y, b.z)) < 0.02, 'anchor is the board centre');
  const normal = mesh.getWorldDirection(new THREE.Vector3());
  const toTable = new THREE.Vector3(table.x - b.x, 0, table.z - b.z).normalize();
  assert.ok(normal.dot(toTable) > 0.99, 'board face points at the table');
  assert.ok(new THREE.Vector2(Math.sin(b.yaw), Math.cos(b.yaw)).dot(new THREE.Vector2(toTable.x, toTable.z)) > 0.99, 'anchor yaw faces the table');
  const nearWall = Math.min(b.x - DG_ROOM.x0, DG_ROOM.x1 - b.x, b.z - DG_ROOM.z0, DG_ROOM.z1 - b.z);
  assert.ok(nearWall < 0.15, `board is ${nearWall} m off its wall`);
  assert.ok(b.y > 1.2 && b.y < DG_CEIL, 'board hangs above every seated head line');

  for (const key of ['door', 'spittoon', 'bar']) {
    const a = world.anchors[key];
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z), key);
    assert.ok(a.x >= DG_ROOM.x0 - 1e-9 && a.x <= DG_ROOM.x1 && a.z >= DG_ROOM.z0 && a.z <= DG_ROOM.z1, `${key} anchor inside the room`);
  }
  const sp = world.anchors.spittoon;
  assert.ok(Math.hypot(sp.x - table.x, sp.z - table.z) > table.radius, 'spittoon is on the floor beside the table, not under it');
  assert.ok(scene.getObjectByName('dg.spittoon')?.isMesh, 'dg.spittoon');
});

test('colliders, floor zones and ground', () => {
  assert.ok(world.colliders.length >= 12);
  for (const c of world.colliders) assert.ok(c.isBox3, 'collider is a Box3');
  // The table is solid, and the chairs are.
  assert.ok(world.colliders.some((c) => c.containsPoint(new THREE.Vector3(table.x, 0.5, table.z))), 'table collider');
  for (const s of seats) {
    assert.ok(world.colliders.some((c) => c.containsPoint(new THREE.Vector3(s.x, 0.4, s.z))), `seat ${s.seat} collider`);
  }
  assert.ok(world.floorZones.length >= 2);
  for (const z of world.floorZones) assert.ok(z.box.isBox3 && typeof z.surface === 'string');
  assert.ok(world.floorZones.some((z) => z.box.containsPoint(new THREE.Vector3(table.x, 0, table.z))), 'the table stands in a floor zone');
  assert.equal(world.groundAt(table.x, table.z), 0);
  const st = world.anchors.stairs;
  assert.ok(world.groundAt(st.xTop + 0.1, 0) > world.groundAt(st.x0 - 0.1, 0), 'the stairs go up');
});

test('board.paint repaints the texture and keeps the state it was given', () => {
  const words = Array.from({ length: 16 }, (_, i) => `word ${i}`);
  const v0 = world.board.texture.version;
  assert.doesNotThrow(() => world.board.paint({ category: 'Behind the Bing bar', words, highlightIndex: 4, revealIndex: null, dim: false }));
  assert.ok(world.board.texture.version > v0, 'texture flagged for upload');
  assert.equal(world.board.state.highlightIndex, 4);
  assert.equal(world.board.state.category, 'Behind the Bing bar');
  assert.deepEqual(world.board.state.words, words);
  const v1 = world.board.texture.version;
  world.board.paint({ category: 'x', words, highlightIndex: 4, revealIndex: 9 });
  assert.ok(world.board.texture.version > v1);
  assert.equal(world.board.state.revealIndex, 9);
  // Lobby: dim, no card yet.
  assert.doesNotThrow(() => world.board.paint({ dim: true }));
  assert.equal(world.board.state.dim, true);
  assert.deepEqual(world.board.state.words, []);
  assert.ok(world.board.canvas.width >= 1024, 'board canvas is at least 1024 px wide');
  assert.equal(world.board.mesh.material.map, world.board.texture);
});

test('clues.set stands a card at that seat only; null and clear take it away', () => {
  world.clues.clear();
  for (let s = 0; s < 8; s++) assert.equal(scene.getObjectByName(`dg.seat.${s}.clue`).visible, false);
  const v0 = world.clues.cards[3].texture.version;
  assert.doesNotThrow(() => world.clues.set(3, 'Lou keeps one in the car'));
  const card = scene.getObjectByName('dg.seat.3.clue');
  assert.equal(card.visible, true);
  assert.ok(world.clues.cards[3].texture.version > v0);
  assert.equal(world.clues.textAt(3), 'Lou keeps one in the car');
  for (let s = 0; s < 8; s++) if (s !== 3) assert.equal(scene.getObjectByName(`dg.seat.${s}.clue`).visible, false, `seat ${s} card`);

  // It stands on the felt, in front of seat 3, and its table face looks at the centre.
  scene.updateMatrixWorld(true);
  const p = card.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(p.y - table.topY) < 1e-6, 'card stands on the felt');
  assert.ok(Math.hypot(p.x - table.x, p.z - table.z) < table.radius, 'card is on the table');
  assert.equal(nearestSeat(p.x, p.z), 3);
  const tableFace = scene.getObjectByName('dg.seat.3.clue.table').children.find((c) => c.name === 'dg.seat.3.clue.face');
  const n = new THREE.Vector3(0, 0, 1).transformDirection(tableFace.matrixWorld);
  const inward = new THREE.Vector3(table.x - p.x, 0, table.z - p.z).normalize();
  assert.ok(n.dot(inward) > 0.9, 'the card\'s table face is turned to the other players');

  // Sixty characters -- the protocol's limit -- still paints.
  assert.doesNotThrow(() => world.clues.set(3, 'x'.repeat(30) + ' ' + 'y'.repeat(29)));
  world.clues.set(3, null);
  assert.equal(card.visible, false);
  assert.equal(world.clues.textAt(3), null);
  world.clues.set(5, '   ');
  assert.equal(scene.getObjectByName('dg.seat.5.clue').visible, false, 'a blank clue is no card');
  world.clues.set(1, 'a');
  world.clues.set(6, 'b');
  world.clues.clear();
  for (let s = 0; s < 8; s++) assert.equal(scene.getObjectByName(`dg.seat.${s}.clue`).visible, false);
});

test('chips.set stacks exactly n chips at that seat and touches no other', () => {
  for (let s = 0; s < 8; s++) world.chips.set(s, 3);
  world.chips.set(3, 2);
  assert.equal(visibleChipCount(3), 2);
  for (let s = 0; s < 8; s++) if (s !== 3) assert.equal(visibleChipCount(s), 3, `seat ${s}`);
  world.chips.set(3, 0);
  assert.equal(visibleChipCount(3), 0, '0 shows nothing');
  world.chips.set(3, 5);
  assert.equal(visibleChipCount(3), 5, 'grows past the built stack');
  world.chips.set(3, 1);
  assert.equal(visibleChipCount(3), 1);
  assert.equal(world.chips.countAt(3), 1);
  // A real stack: each chip sits on the one below.
  world.chips.set(2, 3);
  const ys = scene.getObjectByName('dg.seat.2.chips').children.filter((c) => c.visible).map((c) => c.position.y).sort((a, b) => a - b);
  assert.ok(ys[1] > ys[0] && ys[2] > ys[1]);
  const stack = scene.getObjectByName('dg.seat.2.chips');
  assert.equal(nearestSeat(stack.position.x, stack.position.z), 2);
  assert.ok(Math.abs(stack.position.y - table.topY) < 1e-6);
});

test('marker.setTurn moves the lit marker to that seat, and null hides it', () => {
  const g = world.marker.group;
  world.marker.setTurn(null);
  assert.equal(g.visible, false);
  world.marker.setTurn(3);
  assert.equal(g.visible, true);
  assert.equal(world.marker.seat, 3);
  assert.equal(nearestSeat(g.position.x, g.position.z), 3, 'snaps to seat 3 when it appears');
  assert.ok(Math.hypot(g.position.x - table.x, g.position.z - table.z) < table.radius);
  world.marker.setTurn(5);
  for (let i = 0; i < 60; i++) world.update(1 / 30);
  assert.equal(nearestSeat(g.position.x, g.position.z), 5, 'glides to seat 5');
  assert.ok(g.getObjectByProperty('isLight', true), 'it is lit');
  world.marker.setTurn(null);
  assert.equal(g.visible, false);
  assert.equal(world.marker.seat, null);
});

test('glasses.at(seat) is the whiskey glass on the felt at that seat', () => {
  for (let s = 0; s < 8; s++) {
    const gl = world.glasses.at(s);
    assert.ok(gl?.isObject3D, `glass ${s}`);
    assert.equal(gl.name, `dg.seat.${s}.glass`);
    assert.equal(nearestSeat(gl.position.x, gl.position.z), s);
    assert.ok(Math.abs(gl.position.y - table.topY) < 1e-6);
  }
  assert.equal(world.glasses.at(8), null);
});

test('clear sight lines: every seated eye sees every other seated eye, and the board', () => {
  // Fill the table the way a round plays: a card and chips at every seat.
  for (let s = 0; s < 8; s++) { world.clues.set(s, 'A clue of fair length for the card'); world.chips.set(s, 3); }
  world.marker.setTurn(2);
  scene.updateMatrixWorld(true);
  const targets = meshes(scene);
  const ray = new THREE.Raycaster();
  const eye = (s) => new THREE.Vector3(s.x, s.eyeY, s.z);
  const blocked = (from, to, skipEnd = 0.35) => {
    const dir = to.clone().sub(from);
    const len = dir.length();
    ray.set(from, dir.normalize());
    ray.far = len;
    return ray.intersectObjects(targets, false)
      .filter((h) => h.distance > skipEnd && h.distance < len - skipEnd);
  };
  for (const a of seats) {
    for (const b of seats) {
      if (a === b) continue;
      const hits = blocked(eye(a), eye(b));
      assert.deepEqual(hits.map((h) => h.object.name), [], `seat ${a.seat} -> seat ${b.seat}`);
    }
    const bd = world.anchors.board;
    const hits = blocked(eye(a), new THREE.Vector3(bd.x, bd.y, bd.z), 0.3)
      .filter((h) => !h.object.name.startsWith('dg.board'));
    assert.deepEqual(hits.map((h) => h.object.name), [], `seat ${a.seat} -> board`);
  }
  world.clues.clear();
  world.marker.setTurn(null);
});

test('update runs, haze is the shared SmokeSystem, and nothing in the room makes a sound', async () => {
  assert.doesNotThrow(() => { for (let i = 0; i < 120; i++) world.update(1 / 60, null); });
  assert.doesNotThrow(() => world.update(0));
  assert.doesNotThrow(() => world.update(NaN));
  const { SmokeSystem } = await import('../src/world/smoke.js');
  assert.ok(world.haze === null || world.haze instanceof SmokeSystem);
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/deadgiveaway/world.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\.play\(|AudioEngine|audio\./, 'main.js owns the bass from upstairs; the room plays nothing');
});

test('a second build is independent of the first', () => {
  const other = build();
  other.world.chips.set(0, 4);
  world.chips.set(0, 1);
  assert.equal(other.scene.getObjectByName('dg.seat.0.chips').children.filter((c) => c.visible).length, 4);
  assert.equal(visibleChipCount(0), 1);
});
