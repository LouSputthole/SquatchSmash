/**
 * The outfits, asserted rather than screenshotted.
 *
 * DRESSING-THE-CAST.md ends on the rule this file enforces: name every part,
 * so a verifier can assert the garment exists on the right person without
 * anybody having to look at a picture. These tests exist because three of the
 * bugs this pass fixed were all the same bug — a piece of jewellery or a piece
 * of tailoring placed at a constant depth on a figure whose depth is not
 * constant, so it was drawn INSIDE the man and nobody noticed for months:
 *
 *   - the watch case and its entire bracelet sat inside the forearm slab;
 *   - the medallion sat inside Lou's belly;
 *   - the chalk stripes and the waistcoat sat inside it too.
 *
 * So the assertions here are mostly about depth. "It exists" is the easy half;
 * "you can see it" is the half that kept regressing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ensureDomShim } from '../tools/three-shim.mjs';

/* The cast builds photographed faces through `THREE.TextureLoader`, which
 * reaches for `document.createElementNS`. See `ensureDomShim`. */
ensureDomShim();

import { makePerson } from '../src/bing/cast.js';
import {
  BIG_UNCLE_LOU, BIG_UNCLE_LOU_BING, BIG_UNCLE_LOU_MANSION,
} from '../src/core/wardrobe.js';

function boxOf(root, name) {
  root.updateMatrixWorld(true);
  const node = root.getObjectByName(name);
  return node ? new THREE.Box3().setFromObject(node) : null;
}

/** Every mesh in the figure that is not part of `node`'s own subtree. */
function othersAround(root, node) {
  const own = new Set();
  node.traverse((m) => own.add(m));
  const others = [];
  root.traverse((m) => { if (m.isMesh && !own.has(m)) others.push(m); });
  return others;
}

/** Names of anything that physically intersects `name`'s bounding box. */
function intersecting(root, name, { ignore = [] } = {}) {
  root.updateMatrixWorld(true);
  const node = root.getObjectByName(name);
  assert.ok(node, `no ${name} on this figure`);
  const target = new THREE.Box3().setFromObject(node);
  const hits = [];
  for (const m of othersAround(root, node)) {
    const label = m.name || '(unnamed)';
    if (ignore.some((prefix) => label.startsWith(prefix))) continue;
    if (new THREE.Box3().setFromObject(m).intersectsBox(target)) hits.push(label);
  }
  return [...new Set(hits)];
}

/* ------------------------------------------------------------------ */
/* The corno                                                           */
/* ------------------------------------------------------------------ */

test('the horn is a horn: curved, tapered, ribbed and hung from a bail', () => {
  const { group } = makePerson({
    ...BIG_UNCLE_LOU, chain: 'gold', pendant: true, pendantStyle: 'horn',
  });
  const horn = boxOf(group, 'necklace.pendant.horn');
  assert.ok(horn, 'no horn');

  const size = horn.getSize(new THREE.Vector3());
  // Long and thin. A cornicello that is not much taller than it is wide is a
  // gold thimble, which is what the first attempt at the taper produced.
  assert.ok(size.y > size.x * 2.4, `the horn hangs (${size.y.toFixed(3)} tall, ${size.x.toFixed(3)} wide)`);

  // It curves. The tip is offset from the bail, in X, by a visible amount --
  // a straight taper reads as a spike and the whole shape is the point here.
  const segments = [];
  group.traverse((m) => { if (m.name === 'necklace.pendant.horn.segment') segments.push(m); });
  assert.ok(segments.length >= 8, 'the horn is built from a run of tapered segments');
  const lowest = segments
    .map((m) => ({ m, box: new THREE.Box3().setFromObject(m) }))
    .sort((a, b) => a.box.min.y - b.box.min.y)[0];
  const bail = boxOf(group, 'necklace.pendant.horn.bail');
  const drift = Math.abs(lowest.box.getCenter(new THREE.Vector3()).x
    - bail.getCenter(new THREE.Vector3()).x);
  assert.ok(drift > 0.012, `the horn curves away from its bail (drift ${drift.toFixed(4)}m)`);

  // And it tapers to a point rather than stopping on a flat disc.
  const tipWidth = lowest.box.getSize(new THREE.Vector3()).x;
  assert.ok(tipWidth < 0.008, `the tip is a point (${tipWidth.toFixed(4)}m across)`);

  let ribs = 0;
  group.traverse((m) => { if (m.name === 'necklace.pendant.horn.rib') ribs++; });
  assert.ok(ribs >= 5, `the horn is ribbed (${ribs} rings)`);
});

test('nothing overlaps the horn, on the widest man who wears one', () => {
  /* The owner's note was "make sure nothing is overlapping it or it will not
   * look right", and Lou is the hard case: his belly reaches nine centimetres
   * further forward than his chest, so a pendant hung off the chest plane is
   * a pendant hung inside a man. The chain is exempt -- the bail is a ring the
   * chain runs THROUGH, and they are supposed to touch. */
  for (const [label, look] of [
    ['the Bing', BIG_UNCLE_LOU_BING],
    ['the mansion', BIG_UNCLE_LOU_MANSION],
    ['the default suit', BIG_UNCLE_LOU],
  ]) {
    const { group } = makePerson(look);
    assert.deepEqual(
      intersecting(group, 'necklace.pendant.horn', { ignore: ['necklace.chain'] }),
      [],
      `${label}: something is drawn through the horn`,
    );
  }
});

test('the horn hangs off the front of the man, not inside him', () => {
  const { group } = makePerson(BIG_UNCLE_LOU_BING);
  const horn = boxOf(group, 'necklace.pendant.horn');
  const belly = boxOf(group, 'person.gut.belly');
  assert.ok(belly, 'Lou has a belly');
  assert.ok(
    horn.min.z > belly.max.z,
    `the whole horn clears the belly (horn back ${horn.min.z.toFixed(4)}, belly front ${belly.max.z.toFixed(4)})`,
  );
});

/* ------------------------------------------------------------------ */
/* The watch and the bracelet                                          */
/* ------------------------------------------------------------------ */

test('the watch is outside the sleeve at every build on the roster', () => {
  /* This is the regression that mattered. The case was placed at 0.045 * t on
   * a forearm whose front face is at 0.0525 * t, so it was inside the arm on
   * EVERY figure, and the bracelet ringed the wrist at 0.0355 * t inside a
   * slab half 0.05 * t wide, so not one link of it was ever drawn. */
  for (const build of [0.95, 1.0, 1.12, 1.38, 1.45]) {
    const { group } = makePerson({ build, dress: 'shirt', watch: 'gold', trim: true });
    group.updateMatrixWorld(true);

    const t = 0.55 + build * 0.45;
    const sleeveFront = 0.0525 * t;
    const forearm = group.getObjectByName('forearmL') ?? null;

    for (const part of ['person.watch.dial', 'person.watch.bezel', 'person.watch.face']) {
      const b = boxOf(group, part);
      assert.ok(b, `${part} is missing at build ${build}`);
      // Compare in the arm's own frame: the arm hangs straight down, so the
      // world Z of the watch is the local Z of the watch.
      assert.ok(
        b.max.z > sleeveFront + 0.004,
        `build ${build}: ${part} must stand proud of the sleeve `
        + `(part front ${b.max.z.toFixed(4)}, sleeve front ${sleeveFront.toFixed(4)})`,
      );
    }
    assert.equal(forearm, null, 'the forearm slab stays unnamed; this test reads geometry, not names');

    // The band wraps wider than the arm, so it is visible from the side.
    const band = boxOf(group, 'person.watch.band.gold');
    const bandWidth = band.getSize(new THREE.Vector3()).x;
    assert.ok(
      bandWidth > 0.10 * t + 0.006,
      `build ${build}: the bracelet wraps outside the arm (${bandWidth.toFixed(4)} vs arm ${(0.10 * t).toFixed(4)})`,
    );
  }
});

test('nothing overlaps the watch face, cuff included', () => {
  /* A shirt cuff is 32mm of cloth at the wrist and the watch used to sit in
   * the middle of it. The watch moved up the forearm rather than the cuff
   * moving down, because a cuff that clears a watch by moving down ends up
   * over the hand. */
  const { group } = makePerson({ ...BIG_UNCLE_LOU_BING });
  for (const part of ['person.watch.bezel', 'person.watch.face']) {
    assert.deepEqual(
      intersecting(group, part, { ignore: ['person.watch'] }),
      [],
      `${part} is buried in something`,
    );
  }
  const cuff = boxOf(group, 'shirt.cuff');
  const dial = boxOf(group, 'person.watch.dial');
  assert.ok(cuff && dial);
  assert.ok(cuff.max.y < dial.min.y, 'the watch sits above the cuff, the way it is worn');
});

test('the bracelet goes on the wrist the watch is not on', () => {
  const { group } = makePerson(BIG_UNCLE_LOU_MANSION);
  const watch = boxOf(group, 'person.watch.band.gold');
  const band = boxOf(group, 'person.bracelet.gold');
  assert.ok(watch, 'no watch');
  assert.ok(band, 'no bracelet');
  /* The figures face +Z, so a character's own left hand is on +X -- the same
   * convention the pocket square has always followed. Watch left, bracelet
   * right, which is both what the reference photograph shows and what this
   * builder's own handedness note has always claimed. */
  assert.ok(watch.getCenter(new THREE.Vector3()).x > 0, 'the watch is on his left wrist');
  assert.ok(band.getCenter(new THREE.Vector3()).x < 0, 'the bracelet is on his right');
  assert.deepEqual(
    intersecting(group, 'person.bracelet.plate', { ignore: ['person.bracelet'] }),
    [],
    'the ID plate is buried in the sleeve',
  );
});

/* ------------------------------------------------------------------ */
/* Garments that have to follow the man                                */
/* ------------------------------------------------------------------ */

test('a three-piece opens over a waistcoat, and the waistcoat lies on the belly', () => {
  const { group, profile } = makePerson(BIG_UNCLE_LOU_BING);
  assert.equal(profile.threePiece, true);
  assert.equal(profile.pinstripe, true);
  assert.equal(profile.hat, 'fedora');

  const vest = boxOf(group, 'suit.waistcoat');
  const belly = boxOf(group, 'person.gut.belly');
  assert.ok(vest, 'no waistcoat');
  assert.ok(
    vest.max.z > belly.max.z,
    `the waistcoat is in front of the belly it is worn over `
    + `(${vest.max.z.toFixed(4)} vs ${belly.max.z.toFixed(4)})`,
  );
  // Its buttons are on it, at full size -- `box()` carries size in scale, so a
  // button parented to a panel MESH came out a tenth of a millimetre thick.
  const buttons = [];
  group.traverse((m) => {
    if (m.parent?.name === 'suit.waistcoat' && m.geometry?.type === 'CylinderGeometry') buttons.push(m);
  });
  assert.ok(buttons.length >= 4, 'the waistcoat has buttons');
  for (const b of buttons) {
    const size = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3());
    assert.ok(size.x > 0.008, `a button is ${size.x.toFixed(5)}m across, which is nothing`);
  }

  // A tie on a three-piece stops at the waistcoat instead of hanging over it.
  const tie = boxOf(group, 'suit.tie');
  assert.ok(tie.min.y > vest.max.y - 0.05, 'the tie disappears into the waistcoat');
  assert.equal(group.getObjectByName('suit.tie.tip'), undefined, 'no tie tip below a waistcoat');
});

test('chalk stripes come over the front of him rather than through him', () => {
  const { group } = makePerson(BIG_UNCLE_LOU_BING);
  const belly = boxOf(group, 'person.gut.belly');
  const stripes = [];
  group.updateMatrixWorld(true);
  group.traverse((m) => { if (m.name === 'suit.pinstripe.front') stripes.push(m); });
  assert.ok(stripes.length >= 6, 'the front of the suit is striped');
  const overBelly = stripes.filter((m) => {
    const b = new THREE.Box3().setFromObject(m);
    return b.max.z > belly.max.z;
  });
  assert.equal(overBelly.length, stripes.length, 'every front stripe clears the belly');
});

test('the camp shirt hangs open over a tee and keeps its short sleeves', () => {
  const { group, profile } = makePerson(BIG_UNCLE_LOU_MANSION);
  assert.equal(profile.outfit, 'camp');
  for (const part of [
    'camp.undershirt', 'camp.front.left', 'camp.front.right',
    'camp.collar.left', 'camp.collar.right', 'camp.sleeve.hem',
  ]) {
    assert.ok(group.getObjectByName(part), `no ${part}`);
  }
  // The tee shows BETWEEN the fronts: they are either side of the centreline.
  const tee = boxOf(group, 'camp.undershirt');
  const left = boxOf(group, 'camp.front.left');
  const right = boxOf(group, 'camp.front.right');
  assert.ok(left.max.x < 0 || left.min.x < tee.min.x, 'the left front is off to the left');
  assert.ok(right.min.x > 0 || right.max.x > tee.max.x, 'the right front is off to the right');
  assert.ok(
    left.max.z > tee.max.z && right.max.z > tee.max.z,
    'the shirt is worn OVER the tee',
  );
  // And the pattern is on the cloth at a size a person could see.
  const tiles = [];
  group.traverse((m) => { if (m.name === 'camp.pattern.tile') tiles.push(m); });
  assert.ok(tiles.length >= 16, `the shirt has a pattern on it (${tiles.length} tiles)`);
  const tile = new THREE.Box3().setFromObject(tiles[0]).getSize(new THREE.Vector3());
  assert.ok(tile.x > 0.02 && tile.z > 0.002, `a tile is ${JSON.stringify(tile.toArray())}`);
});

/* ------------------------------------------------------------------ */
/* Silver Pines                                                        */
/* ------------------------------------------------------------------ */

test('the golf outfit is a vest, plus-fours, stockings, saddle shoes and a cap', () => {
  const look = {
    height: 1.80, build: 1.12, dress: 'argyle', knickers: true,
    shoeStyle: 'saddle', hat: 'flatcap', shirt: 0x8a2f34,
    argyle: { a: 0x2f6b46, b: 0xe8d9a8, line: 0x2c1a18 },
  };
  const { group, profile } = makePerson(look);
  assert.equal(profile.knickers, true);
  assert.equal(profile.hat, 'flatcap');
  for (const part of [
    'argyle.vest', 'argyle.vest.opening', 'argyle.vest.rib.hem',
    'argyle.shirt.collar.stand', 'knicker.blouse', 'knicker.band',
    'stocking', 'shoe.saddle.band', 'hat.flatcap.peak',
  ]) {
    assert.ok(group.getObjectByName(part), `no ${part}`);
  }

  const diamonds = [];
  const socks = [];
  group.traverse((m) => {
    if (m.name === 'argyle.diamond') diamonds.push(m);
    if (m.name === 'stocking.diamond') socks.push(m);
  });
  assert.ok(diamonds.length >= 10, `the vest carries a lattice (${diamonds.length} diamonds)`);
  assert.ok(socks.length >= 4, 'both stockings are argyle too');

  /* The vest and the socks share one colourway. That is what makes it an
   * outfit rather than a jumper and some socks, and it is the only thing
   * holding the two ends of the figure together. */
  const vestColours = new Set(diamonds.map((m) => m.material.color.getHex()));
  const sockColours = new Set(socks.map((m) => m.material.color.getHex()));
  assert.ok(
    [...sockColours].some((c) => vestColours.has(c)),
    'the stockings are cut from the vest colourway',
  );

  // The gathered band is wider than the leg it gathers, or nobody sees it.
  const blouse = boxOf(group, 'knicker.blouse');
  const band = boxOf(group, 'knicker.band');
  assert.ok(
    band.getSize(new THREE.Vector3()).x > blouse.getSize(new THREE.Vector3()).x,
    'the plus-four band stands outside the leg',
  );
});

test('a knee-length knicker leaves a stocking, not a bare shin', () => {
  const { group } = makePerson({
    build: 1.05, dress: 'argyle', knickers: true, shoeStyle: 'saddle',
  });
  const stocking = boxOf(group, 'stocking');
  const blouse = boxOf(group, 'knicker.blouse');
  assert.ok(stocking && blouse);
  assert.ok(
    stocking.max.y <= blouse.max.y,
    'the stocking starts under the knickers rather than over them',
  );
  assert.ok(stocking.min.y < 0.2, 'and runs down to the shoe');
});
