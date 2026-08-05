/**
 * The siege's damage layer, over the real house.
 *
 * These build `MansionGrounds` and `MansionInterior` for real and hang the
 * overlay on the result, because every fault this file is written to catch is
 * a fault in the RELATIONSHIP between the two -- a collider enrolled twice, a
 * body inside a wall, a pane that hides without letting go of its box. None of
 * them is visible in a module that only imports constants.
 *
 * The two builders bake canvas textures at module load, so Node gets just
 * enough of a canvas to get through the import. Nothing here reads a pixel.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { ensureDomShim } from '../tools/three-shim.mjs';

/* One shared stub rather than this file's own. It used to declare its own with
 * `??=`, which meant that under `tests/run.mjs` it got whichever stub an
 * earlier file had already installed -- and when the mansion office grew a
 * photographed Lou, the earlier stub had no `createElementNS` and the import
 * threw. See `ensureDomShim`. */
ensureDomShim();

const { MansionDamageState } = await import('../src/mansion/siege/state.js');
const {
  buildMansionGrounds, CELLAR_HALL, COURT_CENTRE, COURT_RADIUS, GROUND_Y, BASEMENT_Y,
} = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');
const {
  buildSiegeDressing, CORRIDOR_NAV, FOYER_ROUTE, ROUTE_HALF_WIDTH,
  SMOKE_FLOOR_CLEARANCE, SMOKE_MAX_OPACITY, SIEGE_ANCHORS, fallenYaw,
} = await import('../src/mansion/siege/dressing.js');
const { buildSiegeGlass, SIEGE_GLASS } = await import('../src/mansion/siege/glass.js');

/**
 * One built house with the siege over it. Built ONCE -- the two builders are
 * about half a second together and every test below reads the same geometry.
 */
function siege() {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const colliders = [...grounds.colliders, ...interior.colliders];
  const baseColliders = colliders.length;
  const damage = new MansionDamageState({ colliders });
  const registered = [];
  const dressing = buildSiegeDressing({
    damage, grounds, interior, registerLight: (l) => registered.push(l),
  });
  const glass = buildSiegeGlass({ damage, grounds, interior });
  return {
    grounds, interior, colliders, baseColliders, damage, dressing, glass, registered,
  };
}

const WORLD = siege();

const worldBox = (object) => {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
};

/** Distance from a point to a Box3, in plan. Zero means inside it. */
function planDistance(b, x, z) {
  const dx = Math.max(b.min.x - x, 0, x - b.max.x);
  const dz = Math.max(b.min.z - z, 0, z - b.max.z);
  return Math.hypot(dx, dz);
}

const overlapsXZ = (a, b) => a.min.x < b.max.x && a.max.x > b.min.x
  && a.min.z < b.max.z && a.max.z > b.min.z;

/* ================================================================== */
/* The walking tour is untouched                                        */
/* ================================================================== */

test('nothing the siege builds is standing during the walking tour', () => {
  const { damage, colliders, baseColliders } = WORLD;
  damage.apply('clean');
  /* Every entry live in `clean` must be a SUPPRESS entry -- base content the
   * siege takes away later. A `group` entry live here is siege wreckage
   * standing in the house the player is given a tour of. */
  const wrongly = [...damage.entries.values()]
    .filter((e) => e.live && e.mode === 'show')
    .map((e) => e.name);
  assert.deepEqual(wrongly, [], 'siege-added content is live in `clean`');
  assert.equal(colliders.length, baseColliders,
    'the clean house has exactly the colliders the two builders gave it');
});

test('the clean house and the repaired house stand up identically', () => {
  const { damage, colliders, baseColliders } = WORLD;
  damage.apply('under_attack');
  damage.apply('repaired');
  assert.equal(colliders.length, baseColliders);
  const wrongly = [...damage.entries.values()].filter((e) => e.live && e.mode === 'show');
  assert.equal(wrongly.length, 0);
  damage.apply('clean');
});

/* ================================================================== */
/* Glass: the reason the file exists                                    */
/* ================================================================== */

test('every pane the siege names is a real opening in the base shell', () => {
  const { glass } = WORLD;
  assert.deepEqual(glass.unmatched, [], 'the shell no longer has these openings');
  assert.deepEqual(glass.unmatchedColliders, [],
    'a pane with no collider found is a pane whose collider will be left behind');
  assert.equal(glass.panes.size, SIEGE_GLASS.length);
  const ids = SIEGE_GLASS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate siege glass id');
});

test('shattering a pane withdraws its collider AND hides it, together', () => {
  const { glass, damage, colliders } = WORLD;
  damage.apply('under_attack');
  const pane = glass.panes.get('lounge.south');

  assert.equal(pane.state, 'intact');
  assert.equal(pane.pane.visible, true, 'an intact pane is standing in the fight');
  assert.equal(colliders.includes(pane.box), true, 'an intact pane is solid');
  assert.equal(pane.shards.visible, false);

  const before = colliders.length;
  assert.equal(glass.shatter('lounge.south'), true);
  assert.equal(pane.state, 'broken');
  assert.equal(pane.pane.visible, false);
  assert.equal(pane.shards.visible, true, 'a hole with nothing in it is not a broken window');
  assert.equal(colliders.includes(pane.box), false,
    'an invisible pane you cannot walk through is the NO WAKE deck fault with a view');
  assert.equal(colliders.length, before - 1);

  assert.equal(glass.shatter('lounge.south'), false, 'shatter is idempotent');
  assert.equal(colliders.length, before - 1, 'a second shatter withdrew the collider twice');

  glass.restoreBroken(glass.brokenIds().filter((id) => id !== 'lounge.south'));
});

test('a cracked pane is still a window: it is solid and you cannot shoot through it', () => {
  const { glass, damage, colliders } = WORLD;
  damage.apply('under_attack');
  assert.equal(glass.crack('kitchen.east'), true);
  const pane = glass.panes.get('kitchen.east');
  assert.equal(pane.state, 'cracked');
  assert.equal(pane.pane.visible, true);
  assert.equal(colliders.includes(pane.box), true, 'a crack is not a firing port');
  assert.equal(pane.cracks.visible, true);
  assert.equal(pane.shards.visible, false);

  assert.equal(glass.crack('kitchen.east'), false, 'cracking twice is not a change');
  assert.equal(glass.shatter('kitchen.east'), true, 'cracked still breaks');
  assert.equal(pane.cracks.visible, false, 'a broken pane has no cracks left to show');
  assert.equal(colliders.includes(pane.box), false);
  glass.restoreBroken(glass.brokenIds().filter((id) => id !== 'kitchen.east'));
});

test('some windows are already broken when he wakes up', () => {
  const { glass, damage } = WORLD;
  damage.apply('under_attack');
  const started = SIEGE_GLASS.filter((s) => s.broken).map((s) => s.id).sort();
  assert.ok(started.length >= 3, 'the house has been under attack for a while');
  assert.deepEqual(glass.brokenIds(), started);
  /* And on more than one face of the building, or it reads as one grenade. */
  const rooms = new Set(SIEGE_GLASS.filter((s) => s.broken).map((s) => s.room));
  assert.ok(rooms.size >= 3, `only ${[...rooms].join(', ')} were hit`);
});

test('brokenIds and restoreBroken round-trip exactly, in both directions', () => {
  const { glass, damage, colliders } = WORLD;
  damage.apply('under_attack');
  const saved = glass.brokenIds();
  const savedColliders = colliders.length;

  /* The fight goes on: two more windows go and one takes a crack. */
  glass.shatter('foyer.transom');
  glass.shatter('living.south');
  glass.crack('lounge.east.south');
  assert.equal(glass.brokenIds().length, saved.length + 2);

  const changed = glass.restoreBroken(saved);
  assert.equal(changed, 3, 'two broken and one cracked had to be put back');
  assert.deepEqual(glass.brokenIds(), saved, 'the restore is not the saved list');
  assert.deepEqual(glass.crackedIds(), [],
    'the checkpoint was taken before those rounds were fired');
  assert.equal(colliders.length, savedColliders,
    'a restored pane is solid again, and only once');
  for (const pane of glass.panes.values()) {
    const broken = saved.includes(pane.id);
    assert.equal(pane.pane.visible, !broken, `${pane.id} pane visibility`);
    assert.equal(pane.shards.visible, broken, `${pane.id} shard visibility`);
    assert.equal(colliders.includes(pane.box), !broken, `${pane.id} collider`);
  }

  /* Restoring the same list twice must be a no-op, not a second withdrawal. */
  assert.equal(glass.restoreBroken(saved), 0);
  assert.equal(colliders.length, savedColliders);
});

test('going back to `clean` puts every pane in the house back', () => {
  const { glass, damage, colliders, baseColliders } = WORLD;
  damage.apply('under_attack');
  glass.shatter('foyer.south.east');
  damage.apply('clean');
  for (const pane of glass.panes.values()) {
    assert.equal(pane.pane.visible, true, `${pane.id} is missing from the clean house`);
    assert.equal(colliders.includes(pane.box), true, `${pane.id} is not solid in the clean house`);
    assert.equal(pane.shards.visible, false);
    assert.equal(pane.cracks.visible, false);
  }
  assert.equal(colliders.length, baseColliders);
  glass.restoreBroken(SIEGE_GLASS.filter((s) => s.broken).map((s) => s.id));
});

test('no pane collider is ever in the scene array twice', () => {
  const { glass, colliders, damage } = WORLD;
  damage.apply('under_attack');
  for (const pane of glass.panes.values()) {
    const count = colliders.filter((b) => b === pane.box).length;
    assert.ok(count <= 1, `${pane.id}'s collider is enrolled ${count} times`);
  }
});

test('shards land inside the house, on the side men are climbing onto', () => {
  const { glass } = WORLD;
  for (const pane of glass.panes.values()) {
    const litter = [];
    pane.shards.traverse((o) => { if (o.name?.includes('.litter.')) litter.push(o); });
    assert.ok(litter.length > 0, `${pane.id} has no litter`);
    for (const bit of litter) {
      const off = pane.axis === 'z'
        ? bit.position.z - pane.centre.z
        : bit.position.x - pane.centre.x;
      assert.equal(Math.sign(off), pane.inward,
        `${pane.id} threw glass out onto the grounds instead of onto the floor`);
      assert.ok(bit.position.y > pane.floorY,
        `${pane.id} litter is under the floor it is supposed to lie on`);
    }
  }
});

test('glass particles are a bounded pool that falls and clears', () => {
  const { glass, damage } = WORLD;
  damage.apply('under_attack');
  const pool = [];
  glass.root.traverse((o) => { if (o.isMesh && o.name?.startsWith('siege.glass.particle.')) pool.push(o); });
  assert.ok(pool.length > 0 && pool.length <= 64, `pool is ${pool.length}`);

  glass.restoreBroken(glass.brokenIds());
  const lit = () => pool.filter((o) => o.visible).length;
  assert.equal(lit(), 0);
  glass.shatter('foyer.south.east');
  assert.ok(lit() > 0, 'a window broke and nothing came out of it');
  /* Twenty simulated seconds: nothing may still be hanging in the air. */
  for (let i = 0; i < 400; i++) glass.update(0.05);
  assert.equal(lit(), 0, 'glass particles never expired');

  glass.shatter('living.west.south');
  assert.ok(lit() > 0);
  glass.restoreBroken(glass.brokenIds().filter((id) => id !== 'living.west.south'
    && id !== 'foyer.south.east'));
  assert.equal(lit(), 0, 'a checkpoint restore rained glass in a cleared room');
});

/* ================================================================== */
/* The three things the dressing is not allowed to do                   */
/* ================================================================== */

test('the dead guard is off the cellar corridor\'s walking line', () => {
  const { dressing } = WORLD;
  const b = dressing.props.bodies.guard.bounds;

  /* Inside the corridor the brief put him in... */
  assert.ok(b.min.z >= CELLAR_HALL.z0 && b.max.z <= CELLAR_HALL.z1,
    `the guard runs z ${b.min.z.toFixed(3)}..${b.max.z.toFixed(3)}, `
    + `outside CELLAR_HALL ${CELLAR_HALL.z0}..${CELLAR_HALL.z1}`);
  assert.ok(b.min.x >= CELLAR_HALL.x0 && b.max.x <= CELLAR_HALL.x1);
  /* ...and behind the walking lane, litter included. */
  assert.ok(b.min.z >= CORRIDOR_NAV.z1,
    `the guard reaches z=${b.min.z.toFixed(3)}, inside the lane that ends at ${CORRIDOR_NAV.z1}`);
  /* The lane itself is worth walking down. */
  assert.ok(CORRIDOR_NAV.z1 - CORRIDOR_NAV.z0 >= 1.4,
    'a 3.1 m corridor should leave more than this');
  /* He is ON the settee, not in it; and nothing in the tableau -- his dropped
   * rifle included -- is under the concrete. */
  const couch = dressing.props.bodies.guard.couch;
  const body = dressing.props.bodies.guard.figureBounds;
  assert.ok(body.min.y >= couch.seatY - 0.001,
    `the guard has sunk ${(couch.seatY - body.min.y).toFixed(3)} m into the settee`);
  assert.ok(b.min.y >= BASEMENT_Y - 0.001,
    `something in the tableau is ${(BASEMENT_Y - b.min.y).toFixed(3)} m under the floor`);
  assert.ok(b.min.x >= -1.87 - 0.05, 'the guard is lying across the theatre doorway');
});

test('nothing the siege drops in the cellar corridor is solid', () => {
  const { dressing } = WORLD;
  const lane = [];
  for (let i = 0; i <= 120; i++) {
    const x = CORRIDOR_NAV.x0 + (CORRIDOR_NAV.x1 - CORRIDOR_NAV.x0) * (i / 120);
    for (const z of [CORRIDOR_NAV.z0 + 0.35, (CORRIDOR_NAV.z0 + CORRIDOR_NAV.z1) / 2, CORRIDOR_NAV.z1 - 0.35]) {
      lane.push([x, z]);
    }
  }
  for (const b of dressing.colliders) {
    if (b.max.y < BASEMENT_Y || b.min.y > BASEMENT_Y + 3) continue;
    for (const [x, z] of lane) {
      assert.ok(planDistance(b, x, z) > 0.3,
        `a siege collider blocks the cellar corridor at (${x.toFixed(1)}, ${z})`);
    }
  }
});

test('the walk from the front door to either flight is never blocked', () => {
  const { dressing } = WORLD;
  const clearance = ROUTE_HALF_WIDTH + 0.30; // half a corridor, plus the player
  for (const seg of FOYER_ROUTE) {
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const x = seg.from.x + (seg.to.x - seg.from.x) * t;
      const z = seg.from.z + (seg.to.z - seg.from.z) * t;
      for (const b of dressing.colliders) {
        if (b.max.y < GROUND_Y || b.min.y > GROUND_Y + 3) continue;
        const d = planDistance(b, x, z);
        assert.ok(d >= clearance,
          `${seg.id} is pinched to ${d.toFixed(2)} m at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
  }
});

test('the dead performer is clear of the foyer fight, not in the middle of it', () => {
  const { dressing } = WORLD;
  const b = dressing.props.bodies.performer.bounds;
  assert.ok(b.min.y >= GROUND_Y - 0.001,
    `something in the tableau is ${(GROUND_Y - b.min.y).toFixed(3)} m under the marble`);
  assert.ok(dressing.props.bodies.performer.figureBounds.min.y >= GROUND_Y - 0.001);
  /* She has no collider -- a body is something you walk over -- so the test is
   * not "does she block a route", it is "is she underfoot". Half a metre more
   * than the route needs, which puts her in the pocket beside the door rather
   * than in the way of it. */
  const clear = ROUTE_HALF_WIDTH + 0.5;
  for (const seg of FOYER_ROUTE) {
    let closest = Infinity;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const x = seg.from.x + (seg.to.x - seg.from.x) * t;
      const z = seg.from.z + (seg.to.z - seg.from.z) * t;
      closest = Math.min(closest, planDistance(b, x, z));
    }
    assert.ok(closest >= clear, `she is ${closest.toFixed(2)} m from ${seg.id}`);
  }
  /* And she has the glass in her hand and the shoe off her foot with her. */
  const names = [];
  dressing.props.bodies.performer.group.traverse((o) => { if (o.name) names.push(o.name); });
  assert.ok(names.some((n) => n.includes('performer.glass')), 'no dropped glass');
});

test('smoke never comes down to where a man is standing', () => {
  const { dressing } = WORLD;
  dressing.update(0.5);
  for (let i = 0; i < 200; i++) dressing.update(0.05); // walk the drift through a cycle
  for (const layer of dressing.props.smoke.columns) {
    if (!layer.slabs) continue; // fire columns are exempt; see the module header
    const b = worldBox(layer.group);
    assert.ok(b.min.y >= layer.lowestY - 1e-6,
      `${layer.group.name} hangs its underside at ${b.min.y.toFixed(2)}, below ${layer.lowestY.toFixed(2)}`);
  }
  assert.equal(dressing.props.smoke.floorClearance, SMOKE_FLOOR_CLEARANCE);
  /* And it is haze, not fog. */
  let worst = 0;
  for (const layer of dressing.props.smoke.columns) {
    const parts = layer.slabs ?? layer.puffs;
    for (const p of parts) worst = Math.max(worst, p.material.opacity);
  }
  assert.ok(worst <= SMOKE_MAX_OPACITY + 1e-9, `smoke reaches ${worst.toFixed(3)} opacity`);
});

/* ================================================================== */
/* The dressing itself                                                  */
/* ================================================================== */

test('the forecourt reads as a car park somebody ran out of', () => {
  const { dressing } = WORLD;
  const wrecks = Object.values(dressing.props.wrecks);
  assert.ok(wrecks.length >= 5, `only ${wrecks.length} vehicles`);
  const by = (c) => wrecks.filter((w) => w.spot.condition === c).length;
  assert.ok(by('burning') >= 1, 'nothing is on fire');
  assert.ok(by('burnt') >= 1, 'nothing has already burnt out');
  assert.ok(by('abandoned') >= 2, 'every car is a wreck, so none of them was ever parked');
  /* A burning car needs a light that flickers. */
  const burning = wrecks.filter((w) => w.spot.condition === 'burning');
  for (const w of burning) {
    assert.ok(w.fire?.light, `${w.id} is burning with no light on it`);
    assert.ok(WORLD.registered.includes(w.fire.light),
      `${w.id}'s light never joined the scene's light rig`);
  }
  /* Two of them are in the turnaround, where a guest would have parked. */
  const inCourt = wrecks.filter((w) => w.inCourt);
  assert.ok(inCourt.length >= 2, 'nothing is in the motor court at all');
  for (const w of inCourt) {
    assert.ok(Math.hypot(w.spot.x - COURT_CENTRE.x, w.spot.z - COURT_CENTRE.z) <= COURT_RADIUS);
  }
});

test('no wreck is parked inside the fountain, a lamp post or another wreck', () => {
  const { dressing, grounds } = WORLD;
  const hulls = Object.values(dressing.props.wrecks).map((w) => ({ id: w.id, box: w.collider }));
  for (let i = 0; i < hulls.length; i++) {
    for (let j = i + 1; j < hulls.length; j++) {
      assert.ok(!overlapsXZ(hulls[i].box, hulls[j].box),
        `${hulls[i].id} is parked inside ${hulls[j].id}`);
    }
    for (const base of grounds.colliders) {
      assert.ok(!overlapsXZ(hulls[i].box, base),
        `${hulls[i].id} overlaps a base collider at `
        + `${base.min.toArray().map((n) => n.toFixed(1))}`);
    }
  }
});

test('the wrecked centrepiece takes over from whatever the house is standing there', () => {
  const { dressing, damage, colliders } = WORLD;
  const piece = dressing.props.centrepiece;
  assert.ok(piece.suppressed.length > 0,
    'the sweep found nothing on the siege.centrepiece anchor');
  assert.equal(piece.colliderTaken, true,
    'the standing centrepiece kept its collider, so the wreckage sits inside a solid box');

  damage.apply('clean');
  assert.ok(piece.suppressed.every((m) => m.visible), 'the tour is missing its centrepiece');
  assert.equal(piece.fragments.visible, false);

  damage.apply('under_attack');
  assert.ok(piece.suppressed.every((m) => !m.visible), 'the centrepiece is standing AND wrecked');
  assert.equal(piece.fragments.visible, true);
  assert.equal(colliders.includes(piece.cover), true, 'the wreckage is not shootable-from');
  /* Partial cover: you crouch behind it, you do not hide behind it. */
  const h = piece.cover.max.y - piece.cover.min.y;
  assert.ok(h > 0.8 && h <= 1.2, `the cover volume is ${h.toFixed(2)} m tall`);
  /* And it is on the anchor, not wherever the table happened to be. */
  assert.ok(Math.abs((piece.cover.min.x + piece.cover.max.x) / 2 - SIEGE_ANCHORS.centrepiece.x) < 0.01);
  assert.ok(Math.abs((piece.cover.min.z + piece.cover.max.z) / 2 - SIEGE_ANCHORS.centrepiece.z) < 0.01);
});

test('the foyer fire has movement, light and smoke, and no way to put it out', () => {
  const { dressing } = WORLD;
  const fire = dressing.props.fires.foyer;
  assert.ok(fire, 'there is no fire in the foyer');
  assert.ok(fire.light, 'the fire does not light anything');
  assert.ok(fire.smoke, 'the fire makes no smoke');
  assert.ok(fire.smoke.radius <= 0.95, 'the fire column is a fog bank');
  assert.ok(WORLD.registered.includes(fire.light), 'the fire never joined the light rig');

  const before = fire.light.intensity;
  const sizes = fire.lumps.map((l) => l.mesh.scale.y);
  dressing.update(0.13);
  dressing.update(0.13);
  assert.notEqual(fire.light.intensity, before, 'the flame does not flicker');
  assert.ok(fire.lumps.some((l, i) => l.mesh.scale.y !== sizes[i]), 'the flame does not move');
  /* There is no extinguisher mechanic, so nothing here may expose one. */
  assert.equal(typeof fire.extinguish, 'undefined');
});

test('the siege owns every collider it adds, and hands none of them over twice', () => {
  const { dressing, damage, colliders, baseColliders } = WORLD;
  damage.apply('clean');
  for (const b of dressing.colliders) {
    assert.equal(colliders.includes(b), false,
      'a siege collider is solid during the walking tour');
  }
  damage.apply('under_attack');
  for (const b of dressing.colliders) {
    assert.equal(colliders.filter((c) => c === b).length, 1,
      'a siege collider is enrolled twice, which no amount of hiding will undo');
  }
  /* The arithmetic, spelled out: the base count, plus what the dressing adds,
   * minus the base centrepiece and every pane that starts broken. */
  const startBroken = SIEGE_GLASS.filter((s) => s.broken).length;
  assert.equal(colliders.length, baseColliders + dressing.colliders.length - 1 - startBroken);
});

test('every mesh the siege adds has a name and none of it is inside out', () => {
  const { dressing, glass } = WORLD;
  const problems = { unnamed: 0, mirrored: [] };
  for (const root of [dressing.root, glass.root]) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.name) problems.unnamed += 1;
      if (o.scale.x < 0 || o.scale.y < 0 || o.scale.z < 0) problems.mirrored.push(o.name);
    });
  }
  assert.equal(problems.unnamed, 0, 'geometry no verifier can ever assert on');
  assert.deepEqual(problems.mirrored, [], 'a negative scale is an invisible mesh');
});

test('fallenYaw lands a body on the heading it was asked for', () => {
  /* The bug this exists to prevent: `fallen()` rolls the figure, which swings
   * its long axis off the yaw, and a man dropped on a corridor settee ends up
   * lying diagonally with his boots in the walking lane. */
  for (const roll of [-0.9, -0.58, 0, 0.35, 0.62, 1.1]) {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const yaw = fallenYaw(roll, heading);
      const TIP = Math.PI / 2 - 0.12;
      /* Re-derive the posed body axis and check where the yaw sends it. */
      const bx = -Math.sin(roll);
      const bz = Math.cos(roll) * Math.sin(TIP);
      const worldAngle = Math.atan2(bx, bz) + yaw;
      const delta = Math.atan2(Math.sin(worldAngle - heading), Math.cos(worldAngle - heading));
      assert.ok(Math.abs(delta) < 1e-9,
        `roll ${roll} heading ${heading} lands ${delta.toFixed(4)} off`);
    }
  }
});
