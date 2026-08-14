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

import { BADA_BING_PERFORMERS, makePerson, Npc } from '../src/bing/cast.js';
import { APE_FAMILY_MEMBER } from '../src/bing/family-ape.js';
import { SILVERCASE_APE_OUTFIT } from '../src/silvercase/cast/ape.js';
import {
  appearancesOf,
  PROCEDURAL_APPEARANCE_TEMPLATES,
} from '../src/core/appearances.js';
import {
  BIG_UNCLE_LOU, BIG_UNCLE_LOU_BING, BIG_UNCLE_LOU_MANSION,
  DEATHMEGATRON, HOG_MAMA,
} from '../src/core/wardrobe.js';

function boxOf(root, name) {
  root.updateMatrixWorld(true);
  const node = root.getObjectByName(name);
  return node ? new THREE.Box3().setFromObject(node) : null;
}

const WORLD_FRONT_RAY = new THREE.Raycaster();
const WORLD_BACK = new THREE.Vector3(0, 0, -1);

/**
 * Measure the visible front-surface clearance where two independently named
 * meshes really overlap. A parent-space centre comparison can prove only that
 * two things share a parent; this ray crosses their common x/y contact band
 * and measures the world surfaces the player sees separate.
 */
function worldFrontGapAtOverlap(root, garmentName, structureName) {
  root.updateMatrixWorld(true);
  const garment = root.getObjectByName(garmentName);
  const structure = root.getObjectByName(structureName);
  assert.ok(garment, `no ${garmentName}`);
  assert.ok(structure, `no ${structureName}`);

  const garmentBox = new THREE.Box3().setFromObject(garment);
  const structureBox = new THREE.Box3().setFromObject(structure);
  const minX = Math.max(garmentBox.min.x, structureBox.min.x);
  const maxX = Math.min(garmentBox.max.x, structureBox.max.x);
  const minY = Math.max(garmentBox.min.y, structureBox.min.y);
  const maxY = Math.min(garmentBox.max.y, structureBox.max.y);
  assert.ok(minX < maxX && minY < maxY,
    `${garmentName} and ${structureName} have no real contact band`);

  const x = (minX + maxX) / 2;
  const y = (minY + maxY) / 2;
  const originZ = Math.max(garmentBox.max.z, structureBox.max.z) + 1;
  WORLD_FRONT_RAY.set(new THREE.Vector3(x, y, originZ), WORLD_BACK);
  const garmentHit = WORLD_FRONT_RAY.intersectObject(garment, true)[0];
  WORLD_FRONT_RAY.set(new THREE.Vector3(x, y, originZ), WORLD_BACK);
  const structureHit = WORLD_FRONT_RAY.intersectObject(structure, true)[0];
  assert.ok(garmentHit, `${garmentName} has no front surface at its contact band`);
  assert.ok(structureHit, `${structureName} has no front surface at its contact band`);
  return garmentHit.point.z - structureHit.point.z;
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

test('Lou pinstripe chest layers fit his body once instead of stacking off each other', () => {
  const { group } = makePerson(BIG_UNCLE_LOU_BING);
  group.updateMatrixWorld(true);

  const belly = boxOf(group, 'person.gut.belly');
  assert.ok(belly, 'Lou has the structural belly the suit is fitted over');

  const stripes = [];
  group.traverse((node) => {
    if (node.name === 'suit.pinstripe.front') {
      stripes.push(new THREE.Box3().setFromObject(node));
    }
  });
  assert.equal(stripes.length, 6, 'the jacket has six front chalk stripes');

  const stripeFronts = stripes.map((box) => box.max.z);
  const stripeSpread = Math.max(...stripeFronts) - Math.min(...stripeFronts);
  assert.ok(
    stripeSpread < 0.0005,
    `symmetrical chalk stripes share one fitted surface (depth spread ${stripeSpread.toFixed(5)}m)`,
  );

  /* Measure the cloth, not the deliberately projecting V point or its
   * buttons. Those details sit on the waistcoat; they are not its fitted
   * surface. */
  const waistcoat = boxOf(group, 'suit.waistcoat.cloth');
  const lapels = [
    boxOf(group, 'suit.lapel.left'),
    boxOf(group, 'suit.lapel.right'),
  ];
  assert.ok(waistcoat && lapels.every(Boolean), 'Lou has the complete three-piece chest');

  const proudOfBody = (box) => box.max.z - belly.max.z;
  assert.ok(
    Math.max(...stripeFronts) - belly.max.z < 0.012,
    'chalk stripes lie on the jacket instead of floating in front of it',
  );
  assert.ok(
    proudOfBody(waistcoat) < 0.025,
    `waistcoat lies on Lou (${proudOfBody(waistcoat).toFixed(5)}m proud)`,
  );
  for (const [index, lapel] of lapels.entries()) {
    assert.ok(
      proudOfBody(lapel) < 0.032,
      `lapel ${index + 1} lies on Lou (${proudOfBody(lapel).toFixed(5)}m proud)`,
    );
  }
});

test('Lou pinstripe chest layers stay registered through the live breathing cycle', () => {
  const npc = new Npc(new THREE.Scene(), {
    name: 'Lou', tier: 'hero', job: 'sit',
    model: { ...BIG_UNCLE_LOU_BING, face: null },
  });
  const contacts = [
    ['waistcoat/belly', 'suit.waistcoat.cloth', 'person.gut.belly'],
    ['chalk stripe/belly', 'suit.pinstripe.front.cloth', 'person.gut.belly'],
  ];

  const worldClearances = (phase) => {
    npc.t = phase;
    npc.phase = 0;
    npc.update(0, new THREE.Vector3());
    const gaps = new Map(contacts.map(([label, garment, structure]) => [
      label,
      worldFrontGapAtOverlap(npc.group, garment, structure),
    ]));
    return { gaps, scale: npc.parts.torsoWrap.scale.x };
  };

  /* Npc.update drives the real Bing breathing range: sin(t*1.5) reaches -1
   * at -PI/3 and +1 at PI/3. Measure the cloth against Lou's independent
   * structural belly in world space; mapping both back through torsoWrap
   * would pass on parentage alone while the real gap opens by a centimetre. */
  const exhale = worldClearances(-Math.PI / 3);
  const inhale = worldClearances(Math.PI / 3);
  assert.ok(Math.abs(exhale.scale - 0.98) < 1e-9, 'the live exhale still reaches 98%');
  assert.ok(Math.abs(inhale.scale - 1.02) < 1e-9, 'the live inhale still reaches 102%');
  for (const [label] of contacts) {
    const rawDrift = Math.abs(exhale.gaps.get(label) - inhale.gaps.get(label));
    const normalizedDrift = Math.abs(
      exhale.gaps.get(label) / exhale.scale - inhale.gaps.get(label) / inhale.scale,
    );
    assert.ok(
      rawDrift <= 0.00125,
      `${label} world clearance drifted ${(rawDrift * 1000).toFixed(2)}mm`,
    );
    assert.ok(
      normalizedDrift < 0.0005,
      `${label} normalized clearance drifted ${(normalizedDrift * 1000).toFixed(2)}mm`,
    );
  }
});

test('every fitted torso garment shares the makePerson breathing rig', () => {
  const matrix = [
    ['suit', { ...BIG_UNCLE_LOU_BING, face: null }, [
      ['suit.waistcoat.cloth', 'person.gut.belly'],
    ]],
    ['shirt', {
      dress: 'shirt', trim: true, luxury: true, chain: 'gold', pendant: false,
    }, [
      ['shirt.placket', 'ribcage'],
      ['shirt.placket', 'waist'],
    ]],
    ['waistcoat', { dress: 'waistcoat' }, [
      ['waistcoat.front', 'ribcage'],
      ['waistcoat.front', 'waist'],
    ]],
    ['argyle', { dress: 'argyle', knickers: true }, [
      ['argyle.vest', 'ribcage'],
      ['argyle.vest', 'waist'],
    ]],
    ['bikini', {
      dress: 'bikini', gender: 'female', bodyShape: 'curvy', adult: true,
    }, [
      ['performer.bikini-top.band', 'person.soft.ribcage'],
    ]],
    ['bomber', { dress: 'bomber', patches: true }, [
      ['bomber.shell', 'ribcage'],
      ['bomber.shell', 'waist'],
    ]],
  ];

  for (const [label, look, contacts] of matrix) {
    const person = makePerson(look);
    const clearancesAt = (scale) => {
      person.torsoWrap.scale.set(scale, 1, scale);
      return new Map(contacts.map(([garment, structure]) => [
        `${garment}/${structure}`,
        worldFrontGapAtOverlap(person.group, garment, structure),
      ]));
    };

    const exhale = clearancesAt(0.98);
    const inhale = clearancesAt(1.02);
    for (const [garment, structure] of contacts) {
      const contact = `${garment}/${structure}`;
      const rawDrift = Math.abs(exhale.get(contact) - inhale.get(contact));
      const normalizedDrift = Math.abs(exhale.get(contact) / 0.98 - inhale.get(contact) / 1.02);
      assert.ok(
        rawDrift <= 0.00125,
        `${label} ${contact} world clearance drifted ${(rawDrift * 1000).toFixed(2)}mm`,
      );
      assert.ok(
        normalizedDrift < 0.0005,
        `${label} ${contact} normalized clearance drifted ${(normalizedDrift * 1000).toFixed(2)}mm`,
      );
    }
  }
});

const SILVER_FITTED_LAYERS = [
  {
    label: 'chef',
    look: { dress: 'chef' },
    parts: [
      ['chef.jacket', (m) => Math.abs(m.position.y - 1.3) < 1e-9
        && Math.abs(m.scale.y - 0.42) < 1e-9],
      ['chef.button.0.0', (m) => Math.abs(m.position.x + 0.055) < 1e-9
        && Math.abs(m.position.y - 1.46) < 1e-9],
    ],
  },
  {
    label: 'porter',
    look: { dress: 'porter' },
    parts: [
      ['porter.strap.left', (m) => Math.abs(m.position.x + 0.06) < 1e-9
        && Math.abs(m.position.y - 1.34) < 1e-9
        && Math.abs(m.scale.y - 0.34) < 1e-9],
      ['porter.strap.right', (m) => Math.abs(m.position.x - 0.06) < 1e-9
        && Math.abs(m.position.y - 1.34) < 1e-9
        && Math.abs(m.scale.y - 0.34) < 1e-9],
    ],
  },
  {
    label: 'gown',
    look: { dress: 'gown', gender: 'female', bodyShape: 'curvy', adult: true },
    parts: [
      ['gown.bodice', (m) => Math.abs(m.position.y - 1.32) < 1e-9
        && Math.abs(m.scale.y - 0.34) < 1e-9],
      ['gown.strap.left', (m) => Math.abs(m.position.x + 0.09) < 1e-9
        && Math.abs(m.position.y - 1.47) < 1e-9],
      ['gown.strap.right', (m) => Math.abs(m.position.x - 0.09) < 1e-9
        && Math.abs(m.position.y - 1.47) < 1e-9],
    ],
  },
];

for (const scenario of SILVER_FITTED_LAYERS) {
  test(`${scenario.label} chest layers stay registered through breathing`, () => {
    const person = makePerson(scenario.look);
    const resolved = scenario.parts.map(([name, legacyMatch]) => {
      const named = person.group.getObjectByName(name);
      if (named) return [name, named];
      const matches = [];
      person.group.traverse((node) => {
        if (node.isMesh && legacyMatch(node)) matches.push(node);
      });
      assert.equal(matches.length, 1, `${name} has one deterministic legacy geometry match`);
      return [name, matches[0]];
    });

    const frontCoordinates = (scale) => {
      person.torsoWrap.scale.set(scale, 1, scale);
      person.group.updateMatrixWorld(true);
      return new Map(resolved.map(([name, node]) => {
        const bounds = new THREE.Box3().setFromObject(node);
        const front = bounds.getCenter(new THREE.Vector3());
        front.z = bounds.max.z;
        return [name, person.torsoWrap.worldToLocal(front)];
      }));
    };

    const exhale = frontCoordinates(0.98);
    const inhale = frontCoordinates(1.02);
    for (const [name, node] of resolved) {
      const drift = exhale.get(name).distanceTo(inhale.get(name));
      assert.ok(
        drift < 0.0005,
        `${name} stays registered (torso-space front drift ${drift.toFixed(5)}m)`,
      );
      assert.equal(node.name, name, `${name} has a stable reusable mesh name`);
    }
  });
}

test('the gown skirt covers the dark hip shell up to the bodice without moving its hem', () => {
  const person = makePerson({
    height: 1.69,
    build: 1.06,
    dress: 'gown',
    shirt: 0x1a2a4a,
    hair: 'bald',
    hairColour: 0x2a1c14,
    skin: 0xd8a878,
    gender: 'female',
    bodyShape: 'curvy',
  });
  const skirt = boxOf(person.group, 'gown.skirt');
  const bodice = boxOf(person.group, 'gown.bodice');
  const hips = boxOf(person.group, 'person.soft.hips');
  assert.ok(skirt && bodice && hips, 'the gown coverage meshes are reusable by name');

  const overlap = skirt.max.y - bodice.min.y;
  assert.ok(
    overlap >= 0.005 * person.heightScale,
    `gown leaves ${(Math.max(0, -overlap) * 1000).toFixed(1)}mm of the hip shell exposed below its bodice`,
  );
  assert.ok(skirt.max.y > hips.max.y,
    'the dark hip shell reaches above the gown skirt');

  const authoredHem = 0.23 * person.heightScale;
  assert.ok(
    Math.abs(skirt.min.y - authoredHem) < 1e-6,
    `gown hem moved ${(Math.abs(skirt.min.y - authoredHem) * 1000).toFixed(2)}mm`,
  );
});

function worldMeshVertices(mesh) {
  mesh.updateWorldMatrix(true, false);
  const positions = mesh.geometry.getAttribute('position');
  const vertices = [];
  for (let i = 0; i < positions.count; i++) {
    vertices.push(new THREE.Vector3().fromBufferAttribute(positions, i)
      .applyMatrix4(mesh.matrixWorld));
  }
  return vertices;
}

function projectionRange(points, origin, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const projected = point.clone().sub(origin).dot(axis);
    min = Math.min(min, projected);
    max = Math.max(max, projected);
  }
  return { min, max };
}

/**
 * Signed clearance from every transformed hip vertex to the real faceted
 * skirt at that vertex's height. Axis extrema cannot prove containment for an
 * octagon: a rounded rectangle can clear X and Z while cutting straight
 * through a diagonal face. CylinderGeometry linearly interpolates its radius
 * from hem to waist, so reconstruct that exact polygon and test every inward
 * half-plane rather than an enclosing box or just the top ring.
 */
function hipClearanceInsideSkirt(skirt, hips) {
  skirt.updateWorldMatrix(true, false);
  hips.updateWorldMatrix(true, false);
  const {
    radiusTop, radiusBottom, height, radialSegments, thetaStart, thetaLength,
  } = skirt.geometry.parameters;
  assert.ok(radiusTop && radiusBottom && height && radialSegments >= 3,
    'gown.skirt exposes its authored tapered-cylinder profile');

  const toSkirt = skirt.matrixWorld.clone().invert();
  const hipPositions = hips.geometry.getAttribute('position');
  const scale = skirt.getWorldScale(new THREE.Vector3());
  const lateralWorldScale = Math.min(Math.abs(scale.x), Math.abs(scale.z));
  const hipVertex = new THREE.Vector3();
  let worst = { world: Infinity, local: null, edge: -1 };

  for (let vertexIndex = 0; vertexIndex < hipPositions.count; vertexIndex++) {
    hipVertex.fromBufferAttribute(hipPositions, vertexIndex)
      .applyMatrix4(hips.matrixWorld)
      .applyMatrix4(toSkirt);
    const heightRatio = THREE.MathUtils.clamp(
      (hipVertex.y + height / 2) / height,
      0,
      1,
    );
    const radius = THREE.MathUtils.lerp(radiusBottom, radiusTop, heightRatio);

    for (let edge = 0; edge < radialSegments; edge++) {
      const angleA = thetaStart + (edge / radialSegments) * thetaLength;
      const angleB = thetaStart + ((edge + 1) / radialSegments) * thetaLength;
      const ax = Math.sin(angleA) * radius;
      const az = Math.cos(angleA) * radius;
      const bx = Math.sin(angleB) * radius;
      const bz = Math.cos(angleB) * radius;
      const edgeX = bx - ax;
      const edgeZ = bz - az;
      const edgeLength = Math.hypot(edgeX, edgeZ);
      const centreSide = Math.sign(edgeX * -az - edgeZ * -ax);
      const pointSide = edgeX * (hipVertex.z - az)
        - edgeZ * (hipVertex.x - ax);
      const world = (pointSide * centreSide / edgeLength) * lateralWorldScale;
      if (world < worst.world) {
        worst = { world, local: hipVertex.clone(), edge };
      }
    }
  }
  return worst;
}

test('every fixed and procedural Silver gown explicitly occludes its internal hip shell', () => {
  const margo = appearancesOf('margo')
    .find((appearance) => appearance.scene === 'silver_room');
  assert.ok(margo, 'Silver Room Margo is represented in the appearance ledger');

  const cases = [{
    label: 'silver.margo',
    job: 'stand',
    model: margo.model,
  }];
  for (const template of PROCEDURAL_APPEARANCE_TEMPLATES) {
    if (template.scene !== 'silver_room' || template.dress !== 'gown') continue;
    for (const fixture of template.fixtures) {
      cases.push({
        label: `${template.id}.${fixture.id}`,
        job: template.job,
        model: fixture.model,
      });
    }
  }
  assert.deepEqual(
    cases.slice(1).map(({ label }) => label),
    [
      'silver.queue.gown.stand.min',
      'silver.queue.gown.stand.max',
      'silver.queue.gown.lean.min',
      'silver.queue.gown.lean.max',
      'silver.diner.gown.sit.min',
      'silver.diner.gown.sit.max',
      'silver.diner.gown.drink.min',
      'silver.diner.gown.drink.max',
    ],
    'the production gown family matrix stays explicit and finite',
  );
  const phases = [-Math.PI / 2, 0, Math.PI / 2];

  for (const { label, job, model } of cases) {
    const npc = new Npc(new THREE.Scene(), {
      name: label,
      tier: 'hero',
      job,
      look: false,
      model,
    });
    for (const phase of phases) {
      npc.t = phase / 1.6;
      npc.update(0, null);
      npc.group.updateMatrixWorld(true);
      const skirt = npc.group.getObjectByName('gown.skirt');
      const bodice = npc.group.getObjectByName('gown.bodice');
      const hips = npc.group.getObjectByName('person.soft.hips');
      assert.ok(skirt && bodice && hips,
        `${label} gown coverage meshes are reusable by name`);

      const origin = npc.parts.body.getWorldPosition(new THREE.Vector3());
      const yAxis = new THREE.Vector3(0, 1, 0)
        .transformDirection(npc.parts.body.matrixWorld);
      const skirtVertices = worldMeshVertices(skirt);
      const bodiceVertices = worldMeshVertices(bodice);
      const hipVertices = worldMeshVertices(hips);
      const clearance = hipClearanceInsideSkirt(skirt, hips);
      assert.ok(Number.isFinite(clearance.world),
        `${label} retains measurable internal hip collision geometry`);
      assert.equal(
        hips.visible,
        false,
        `${label} renders its internal hip shell through skirt edge ${clearance.edge} by ${(-clearance.world * 1000).toFixed(1)}mm`,
      );
      assert.equal(hips.userData.occludedBy, 'gown',
        `${label} records why its named hip shell is intentionally internal`);
      assert.ok(hips.geometry.getAttribute('position')?.count > 0,
        `${label} keeps direct named hip geometry available for rig and collision use`);
      for (const [side, leg, shinGroup] of [
        ['left', npc.parts.legL, npc.parts.shinL],
        ['right', npc.parts.legR, npc.parts.shinR],
      ]) {
        const thigh = leg.getObjectByName('person.soft.thigh');
        const knee = shinGroup.getObjectByName('person.soft.knee');
        const shin = shinGroup.getObjectByName('person.soft.shin');
        assert.ok(thigh && knee && shin,
          `${label} ${side} lower-body geometry stays reusable by name`);
        for (const internal of [thigh, knee]) {
          assert.equal(internal.visible, false,
            `${label} renders ${side} ${internal.name} through the opaque gown`);
          assert.equal(internal.userData.occludedBy, 'gown',
            `${label} labels the ${side} ${internal.name} as internal gown anatomy`);
          assert.ok(internal.geometry.getAttribute('position')?.count > 0,
            `${label} keeps ${side} ${internal.name} geometry for rig/collision use`);
        }
        assert.equal(
          shin.visible,
          !npc.seated,
          `${label} ${side} shin visibility follows the reversible seated-gown contract`,
        );
        assert.equal(shin.userData.occludedWhen, 'gown:seated',
          `${label} documents the pose-specific ${side} shin occlusion`);
        const shoes = [];
        shinGroup.traverse((node) => {
          if (node.isMesh && (node.name.startsWith('shoe.') || node.name === 'foot.bare')) {
            shoes.push(node);
          }
        });
        assert.ok(shoes.length > 0, `${label} ${side} keeps a visible foot below the hem`);
        assert.ok(shoes.every((shoe) => shoe.visible),
          `${label} ${side} shoes remain rendered when internal legs are occluded`);
      }
      assert.equal(skirt.geometry.parameters.radialSegments, 8,
        `${label} keeps the authored eight-sided gown silhouette`);
      for (const garment of [skirt, bodice]) {
        const materials = Array.isArray(garment.material)
          ? garment.material : [garment.material];
        assert.ok(
          garment.visible && materials.every((material) => (
            material.opacity === 1 && material.transparent === false
          )),
          `${label} uses an opaque visible ${garment.name} over the internal shell`,
        );
      }

      const skirtY = projectionRange(skirtVertices, origin, yAxis);
      const bodiceY = projectionRange(bodiceVertices, origin, yAxis);
      const hipY = projectionRange(hipVertices, origin, yAxis);
      const overlap = skirtY.max - bodiceY.min;
      assert.ok(
        overlap >= 0.005 * npc.parts.heightScale,
        `${label} leaves ${(-overlap * 1000).toFixed(1)}mm between skirt and bodice`,
      );
      assert.ok(
        skirtY.max > hipY.max,
        `${label} hip shell reaches ${(hipY.max - skirtY.max).toFixed(4)}m above skirt`,
      );
      const authoredHem = 0.23 * npc.parts.heightScale;
      assert.ok(
        Math.abs(skirtY.min - authoredHem) < 1e-6,
        `${label} hem moved ${(Math.abs(skirtY.min - authoredHem) * 1000).toFixed(2)}mm`,
      );
    }
  }

  const reversible = new Npc(new THREE.Scene(), {
    name: 'silver.gown.reversible', tier: 'hero', job: 'sit', look: false,
    model: margo.model,
  });
  const reversibleShins = [reversible.parts.shinL, reversible.parts.shinR]
    .map((shinGroup) => shinGroup.getObjectByName('person.soft.shin'));
  const assertReversibleShins = (visible, job) => {
    assert.ok(reversibleShins.every((shin) => shin?.visible === visible),
      `same gown Npc ${job} ${visible ? 'restores' : 'occludes'} both shins`);
    const shoes = [];
    for (const shinGroup of [reversible.parts.shinL, reversible.parts.shinR]) {
      shinGroup.traverse((node) => {
        if (node.isMesh && node.name.startsWith('shoe.')) shoes.push(node);
      });
    }
    assert.ok(shoes.length > 0 && shoes.every((shoe) => shoe.visible),
      `same gown Npc ${job} keeps both shoes visible`);
  };
  assertReversibleShins(false, 'sit');
  for (const [job, visible] of [
    ['stand', true], ['drink', false], ['lean', true], ['sit', false],
  ]) {
    reversible.job = job;
    reversible.update(0, null);
    assertReversibleShins(visible, job);
  }

  const uncovered = makePerson({
    dress: 'shirt', gender: 'female', bodyShape: 'curvy', adult: true,
  });
  const uncoveredHips = uncovered.group.getObjectByName('person.soft.hips');
  assert.ok(uncoveredHips, 'non-gown curvy hips stay reusable by name');
  assert.equal(uncoveredHips.visible, true,
    'a non-gown curvy body does not lose its visible anatomy');
  assert.equal(uncoveredHips.userData.occludedBy, undefined,
    'gown occlusion metadata never leaks to other clothing');
  for (const [side, leg, shinGroup] of [
    ['left', uncovered.legL, uncovered.shinL],
    ['right', uncovered.legR, uncovered.shinR],
  ]) {
    for (const part of [
      leg.getObjectByName('person.soft.thigh'),
      shinGroup.getObjectByName('person.soft.knee'),
      shinGroup.getObjectByName('person.soft.shin'),
    ]) {
      assert.ok(part, `non-gown ${side} lower-body mesh stays named`);
      assert.equal(part.visible, true,
        `non-gown ${side} ${part.name} remains visible`);
      assert.equal(part.userData.occludedBy, undefined,
        `gown-only occlusion never leaks to non-gown ${side} ${part.name}`);
      assert.equal(part.userData.occludedWhen, undefined,
        `seated-gown metadata never leaks to non-gown ${side} ${part.name}`);
    }
  }
});

const PENETRATION_RAY = new THREE.Raycaster();
const PENETRATION_DIRECTION = new THREE.Vector3(1, 0.371, 0.217).normalize();

function limbMesh(parts, side, kind) {
  const fore = side === 'left' ? parts.foreL : parts.foreR;
  const mesh = fore.children.find((node) => node.isMesh && node.name.endsWith(`.${kind}`));
  assert.ok(mesh, `${side} ${kind} mesh is not reusable by name`);
  return mesh;
}

function transformedVertexPenetration(parts) {
  parts.group.updateMatrixWorld(true);
  /* The dressed trunk is more than its anatomy. Performer hip panels, a gown
   * bodice, an apron or a bomber shell can be outside the pelvis/ribcage and
   * still be visibly pierced. Collect every closed mesh under `body`, while
   * excluding the source arms and the independently animated head. Legs are
   * siblings of body and therefore remain outside this trunk contract. */
  const excluded = new Set();
  for (const subtree of [parts.armL, parts.armR, parts.head]) {
    subtree.traverse((node) => excluded.add(node));
  }
  const colliders = [];
  parts.body.traverse((mesh) => {
    if (!mesh.isMesh || excluded.has(mesh) || !mesh.visible) return;
    mesh.geometry.computeBoundingBox();
    const localSize = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
    if (Math.min(localSize.x, localSize.y, localSize.z) <= 1e-6) return;
    colliders.push({ mesh, bounds: new THREE.Box3().setFromObject(mesh) });
  });
  const materialSides = new Map();
  for (const { mesh } of colliders) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!materialSides.has(material)) materialSides.set(material, material.side);
      material.side = THREE.DoubleSide;
    }
  }

  const pointInside = (point, collider) => {
    if (!collider.bounds.containsPoint(point)) return false;
    PENETRATION_RAY.set(point, PENETRATION_DIRECTION);
    const hits = PENETRATION_RAY.intersectObject(collider.mesh, false)
      .filter((hit) => hit.distance > 1e-6);
    let crossings = 0;
    let previous = -Infinity;
    for (const hit of hits) {
      if (hit.distance - previous > 1e-5) {
        crossings++;
        previous = hit.distance;
      }
    }
    return crossings % 2 === 1;
  };

  const counts = {};
  try {
    for (const side of ['left', 'right']) {
      for (const kind of ['forearm', 'hand']) {
        const mesh = limbMesh(parts, side, kind);
        const positions = mesh.geometry.getAttribute('position');
        let inside = 0;
        for (let i = 0; i < positions.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, i)
            .applyMatrix4(mesh.matrixWorld);
          if (colliders.some((collider) => pointInside(point, collider))) inside++;
        }
        counts[`${side}.${kind}`] = inside;
      }
    }
  } finally {
    for (const [material, side] of materialSides) material.side = side;
  }
  return counts;
}

for (const [name, model] of [
  ['DeathMegatron', DEATHMEGATRON],
  ['Hog Mama', HOG_MAMA],
]) {
  for (const job of ['stand', 'sit']) {
    test(`${name} ${job} keeps hands and forearms outside the dressed trunk`, () => {
      const npc = new Npc(new THREE.Scene(), {
        name, tier: 'hero', job, model: { ...model, face: null },
      });
      npc.t = 0;
      npc.phase = 0;
      npc.update(0, null);
      const counts = transformedVertexPenetration(npc.parts);
      assert.deepEqual(counts, {
        'left.forearm': 0,
        'left.hand': 0,
        'right.forearm': 0,
        'right.hand': 0,
      }, `${name} ${job} has transformed garment vertices inside the trunk`);
    });
  }
}

for (const job of ['lean', 'work']) {
  test(`Silver Room curvy gown ${job} keeps hands and forearms outside its dressed silhouette`, () => {
    const npc = new Npc(new THREE.Scene(), {
      name: `gown ${job}`, tier: 'hero', job,
      model: {
        height: 1.69, build: 1.06, dress: 'gown',
        gender: 'female', bodyShape: 'curvy', adult: true, face: null,
      },
    });
    npc.t = 0;
    npc.phase = 0;
    const maxima = {
      'left.forearm': 0,
      'left.hand': 0,
      'right.forearm': 0,
      'right.hand': 0,
    };
    const frames = job === 'work' ? 8 * 30 : 1;
    for (let frame = 0; frame < frames; frame++) {
      npc.update(job === 'work' ? 1 / 30 : 0, null);
      const counts = transformedVertexPenetration(npc.parts);
      for (const key of Object.keys(maxima)) maxima[key] = Math.max(maxima[key], counts[key]);
    }
    assert.deepEqual(maxima, {
      'left.forearm': 0,
      'left.hand': 0,
      'right.forearm': 0,
      'right.hand': 0,
    }, `gown ${job} penetrates a real Silver Room garment surface`);
  });
}

for (let routine = 0; routine < BADA_BING_PERFORMERS.length; routine++) {
  test(`dancer routine ${routine} keeps hands and forearms outside her trunk for all four bars`, () => {
    const npc = new Npc(new THREE.Scene(), {
      name: `dancer ${routine}`, tier: 'hero', job: 'dance', routine,
      pole: routine < 3,
      model: {
        role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
        height: 1.73, build: 1.08, dress: 'bikini',
        ...BADA_BING_PERFORMERS[routine],
      },
    });
    npc.t = 0;
    npc.phase = 0;
    const maxima = {
      'left.forearm': 0,
      'left.hand': 0,
      'right.forearm': 0,
      'right.hand': 0,
    };
    for (let frame = 0; frame < 12.4 * 30; frame++) {
      npc.update(1 / 30, null);
      const counts = transformedVertexPenetration(npc.parts);
      for (const key of Object.keys(maxima)) maxima[key] = Math.max(maxima[key], counts[key]);
    }
    assert.deepEqual(maxima, {
      'left.forearm': 0,
      'left.hand': 0,
      'right.forearm': 0,
      'right.hand': 0,
    }, `dancer routine ${routine} penetrates during its authored loop`);
  });
}

const NAMED_DRESS_MATRIX = [
  ['suit', { ...BIG_UNCLE_LOU_BING, face: null }],
  ['suit-tuxedo', {
    dress: 'suit', tuxedo: true, bowtie: true, luxury: true, trim: true,
  }],
  ['shirt-trim', { dress: 'shirt', trim: true }],
  ['shirt-luxury-v', {
    dress: 'shirt', luxury: true, neckline: 'v', chain: 'gold', pendant: false,
  }],
  ['shirt-heavy-optionals', {
    dress: 'shirt', build: 1.3, trim: true, belt: 'gold', trouserFit: 'creased',
    barefoot: true, chain: 'gold', chainStyle: 'layered', pendantStyle: 'crest',
    hat: 'fedora', hair: 'tied',
  }],
  ['shirt-gut-horn', {
    dress: 'shirt', build: 1.3, gut: 0.7, chain: 'gold', pendantStyle: 'horn',
    hair: 'receding',
  }],
  ['tracksuit', { dress: 'tracksuit', bandana: true }],
  ['tee', { dress: 'tee', glasses: true, beard: true }],
  ['waistcoat', { dress: 'waistcoat', bowtie: true }],
  ['work', { dress: 'work' }],
  ['chef', { dress: 'chef' }],
  ['porter', { dress: 'porter' }],
  ['gown', { dress: 'gown', gender: 'female', bodyShape: 'curvy', adult: true }],
  // DeathMegatron's exact look: the one belted, gold-ribbed gown on the roster.
  ['gown-belted', DEATHMEGATRON],
  // Ape's exact look: the trimmed tee under the open canvas work vest.
  ['tee-workvest', APE_FAMILY_MEMBER.model],
  ['bikini', {
    dress: 'bikini', gender: 'female', bodyShape: 'curvy', adult: true,
  }],
  ['bomber', { dress: 'bomber', patches: true }],
  ['argyle', {
    dress: 'argyle', knickers: true, shoeStyle: 'saddle', hat: 'flatcap',
  }],
  ['camp', { dress: 'camp', pattern: true }],
];

for (const [label, look] of NAMED_DRESS_MATRIX) {
  test(`${label} exposes a semantic name for every structural and garment mesh`, () => {
    const { group } = makePerson(look);
    const unnamed = [];
    group.traverse((node) => {
      if (!node.isMesh) return;
      if (node.name && node.name !== 'person.soft.slab') return;
      unnamed.push({
        parent: node.parent?.name || '(unnamed group)',
        y: +node.position.y.toFixed(3),
        scale: node.scale.toArray().map((n) => +n.toFixed(3)),
      });
    });
    assert.equal(unnamed.length, 0,
      `${label} has ${unnamed.length} anonymous meshes: ${JSON.stringify(unnamed.slice(0, 8))}`);
  });
}

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

test('argyle diamonds fit the vest once instead of stacking off earlier diamonds', () => {
  const { group } = makePerson({
    height: 1.80, build: 1.12, dress: 'argyle', knickers: true,
    shoeStyle: 'saddle', hat: 'flatcap', shirt: 0x8a2f34,
    argyle: { a: 0x2f6b46, b: 0xe8d9a8, line: 0x2c1a18 },
  });
  group.updateMatrixWorld(true);
  const fronts = [];
  group.traverse((node) => {
    if (node.name === 'argyle.diamond') {
      fronts.push(new THREE.Box3().setFromObject(node).max.z);
    }
  });
  assert.ok(fronts.length >= 10, `the vest carries a lattice (${fronts.length} diamonds)`);
  const spread = Math.max(...fronts) - Math.min(...fronts);
  assert.ok(
    spread < 0.0005,
    `the flat vest has one diamond plane (depth spread ${spread.toFixed(5)}m)`,
  );
});

test('the complete golf vest breathes with the chest instead of floating off it', () => {
  const person = makePerson({
    height: 1.80, build: 1.12, dress: 'argyle', knickers: true,
    shoeStyle: 'saddle', hat: 'flatcap', shirt: 0x8a2f34,
    argyle: { a: 0x2f6b46, b: 0xe8d9a8, line: 0x2c1a18 },
  });
  const { group, torsoWrap } = person;
  const vest = group.getObjectByName('argyle.vest');
  const ribcage = person.torso;
  const frontGap = () => {
    group.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(vest).max.z
      - new THREE.Box3().setFromObject(ribcage).max.z;
  };

  const neutral = frontGap();
  torsoWrap.scale.set(0.982, 1, 0.982);
  const exhale = frontGap();

  assert.ok(
    Math.abs(exhale - neutral) < 0.0005,
    `vest-to-chest gap drifted from ${neutral.toFixed(5)} to ${exhale.toFixed(5)}`,
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

/* ------------------------------------------------------------------ */
/* The August 2026 detail pass: Ape's work vest, DeathMegatron's gown  */
/* ------------------------------------------------------------------ */

test('Ape wears the open work vest over a trimmed tee, and every piece is visible', () => {
  const { group } = makePerson(APE_FAMILY_MEMBER.model);
  group.updateMatrixWorld(true);

  for (const part of [
    'workvest.front.left', 'workvest.front.right',
    'workvest.front.left.edge', 'workvest.front.right.edge',
    'workvest.pocket', 'workvest.pocket.flap',
    'workvest.strap.left', 'workvest.strap.right',
  ]) {
    assert.ok(group.getObjectByName(part), `no ${part}`);
  }
  const snaps = [];
  group.traverse((m) => { if (m.name === 'workvest.snap') snaps.push(m); });
  assert.equal(snaps.length, 4, 'two snap studs per front');

  /* The vest hangs OVER the shirt front, and the gap between its fronts is
   * where the shirt shows: placket and buttons on the centreline, panels
   * clear of it either side. */
  const left = boxOf(group, 'workvest.front.left');
  const right = boxOf(group, 'workvest.front.right');
  const placket = boxOf(group, 'shirt.placket');
  assert.ok(placket, 'the trimmed tee has a shirt front under the vest');
  assert.ok(
    left.max.z > placket.max.z && right.max.z > placket.max.z,
    'the vest is worn over the shirt front, not behind it',
  );
  assert.ok(
    left.max.x < placket.min.x && right.min.x > placket.max.x,
    'the open gap between the fronts leaves the placket and buttons visible',
  );
  /* Snaps stand proud of the cloth they fasten — measured in the panel's OWN
   * frame, because the panel is tilted to drape on his heavy trunk and a
   * world-z box comparison across a tilted panel compares two different
   * heights of it. The stud is a child of the panel group, so its local z
   * against the published cloth face is exactly the question. */
  for (const snap of snaps) {
    const face = snap.parent.userData.faceZ;
    assert.ok(Number.isFinite(face), 'the vest panel publishes its cloth face');
    assert.ok(
      snap.position.z - 0.003 >= face - 1e-6,
      `a snap is buried in the vest cloth (stud back ${(snap.position.z - 0.003).toFixed(4)}, face ${face.toFixed(4)})`,
    );
  }
  // The pocket is on his own left, which is +X — the pocket-square rule.
  const pocket = boxOf(group, 'workvest.pocket');
  assert.ok(pocket.getCenter(new THREE.Vector3()).x > 0, 'the pocket is on his left front');

  /* The metal is Rippinflow's silver, never the founders' gold: a thin
   * silver line with nothing hanging off it, and a silver watch. */
  assert.ok(group.getObjectByName('necklace.chain.silver'), 'the thin silver chain');
  assert.equal(group.getObjectByName('necklace.chain'), undefined, 'no gold rope');
  assert.equal(group.getObjectByName('necklace.pendant'), undefined, 'nothing hangs off it');
  const band = boxOf(group, 'person.watch.band.silver');
  assert.ok(band, 'the silver watch');
  assert.ok(band.getCenter(new THREE.Vector3()).x > 0, 'worn on his left wrist');
});

test('the Silver Case suit keeps Ape\'s vest and metal off, explicitly', () => {
  /* The scene outfit spreads ON TOP of the Family row, so the black-tailoring
   * beat only stays black tailoring while it turns the new layers off. */
  const { group } = makePerson({ ...APE_FAMILY_MEMBER.model, ...SILVERCASE_APE_OUTFIT });
  assert.equal(group.getObjectByName('workvest.front.left'), undefined, 'no canvas over the suit');
  assert.equal(group.getObjectByName('necklace.chain.silver'), undefined, 'no chain on this job');
  assert.equal(group.getObjectByName('person.watch.dial'), undefined, 'no watch on this job');
});

test('DeathMegatron\'s gown cinches with the gold belt, clear of the skirt and the breathing bodice', () => {
  const person = makePerson(DEATHMEGATRON);
  const { group } = person;
  group.updateMatrixWorld(true);

  const skirt = boxOf(group, 'gown.skirt');
  const bodice = boxOf(group, 'gown.bodice');
  const strap = boxOf(group, 'belt.strap');
  const buckle = boxOf(group, 'belt.buckle');
  assert.ok(skirt && bodice && strap && buckle, 'the gown and its belt are reusable by name');

  /* The hip line everyone else's belt sits on is INSIDE this skirt — the
   * skirt's top ring is deeper than the band. The gown belt therefore rides
   * above the skirt, on the bodice, at the seam a dress actually cinches. */
  assert.ok(
    strap.min.y > skirt.max.y,
    `the belt clears the skirt top (belt bottom ${strap.min.y.toFixed(4)}, skirt top ${skirt.max.y.toFixed(4)})`,
  );
  assert.ok(strap.min.y > bodice.min.y && strap.max.y < bodice.max.y,
    'the band lies on the bodice');
  assert.ok(buckle.max.z > strap.max.z, 'the buckle stands proud of the band');

  // And it stays proud of the bodice at full inhale — the bodice breathes
  // with torsoWrap and the belt does not.
  person.torsoWrap.scale.set(1.02, 1, 1.02);
  group.updateMatrixWorld(true);
  const inhaleBodice = boxOf(group, 'gown.bodice');
  const inhaleStrap = boxOf(group, 'belt.strap');
  assert.ok(
    inhaleStrap.max.z > inhaleBodice.max.z,
    `the belt is swallowed by the bodice at full inhale `
    + `(belt ${inhaleStrap.max.z.toFixed(4)}, bodice ${inhaleBodice.max.z.toFixed(4)})`,
  );
  person.torsoWrap.scale.set(1, 1, 1);
  group.updateMatrixWorld(true);

  /* The gold that marks her stays fabric-and-buckle, never jewellery: the
   * luxury ribbing stands proud of the bodice, and there is still no chain
   * and no watch — the men's vocabulary is not hers. */
  const ribs = [];
  group.traverse((m) => { if (m.name === 'shirt.luxury.rib') ribs.push(m); });
  assert.ok(ribs.length >= 6, 'the bodice carries the gold ribbing');
  for (const rib of ribs) {
    assert.ok(new THREE.Box3().setFromObject(rib).max.z > bodice.max.z,
      'a rib is drawn inside the bodice');
  }
  assert.equal(group.getObjectByName('necklace.chain'), undefined, 'no chain');
  assert.equal(group.getObjectByName('person.watch.dial'), undefined, 'no watch');

  // The strap is the built, structured one — not the slip default.
  const gownStrap = boxOf(group, 'gown.strap.left');
  const strapWidth = gownStrap.getSize(new THREE.Vector3()).x;
  assert.ok(
    strapWidth > 0.045,
    `the strap is a structured ${(strapWidth * 1000).toFixed(1)}mm, not a slip strap`,
  );
});
