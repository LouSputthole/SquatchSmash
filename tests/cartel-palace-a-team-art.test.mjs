/**
 * THE PALACE'S SIX A-TEAM PIECES, AND THE THREE WAYS ART GOES WRONG.
 *
 * The owner asked for *"substantial A-Team themed wall art throughout the
 * palace"* and supplied six drawings. None of them is on disk -- they were
 * pasted into a chat -- so what shipped is six SLOTS on the shared art
 * pipeline: a row in assets/art/manifest.json, a frame in
 * src/cartel-palace/world.js (`A_TEAM_ART`), and a drawn placeholder from
 * src/world/gear.js FALLBACKS in the frame until a file lands.
 *
 * That arrangement has exactly one failure mode a person will not notice: the
 * manifest and the scene are two files, and nothing makes them agree. A slot
 * renamed in one is a picture that silently reverts to the generic Sasquatch
 * poster; a slot dropped from the scene is a manifest row nobody can ever see.
 * So the first two tests here are a two-way set comparison, not a spot check.
 *
 * The third is the one the mansion had to learn the hard way. Owner playtest,
 * 2026-08-04: *"A lot of the art is over doorways and stuff"*. The mansion's
 * answer was structural -- every picture records its own world box and
 * tools/verify-mansion.mjs intersects the lot against every declared opening
 * (`recordArt` in src/mansion/scenes/MansionInterior.js). The palace has no
 * opening list to intersect against, and inventing one here would be a second
 * hand-maintained copy of numbers that already exist as walls. So this asks
 * the question from the other end, which needs no new list and is strictly
 * stronger:
 *
 *   IS THERE WALL BEHIND EVERY CORNER OF EVERY PICTURE?
 *
 * A doorway is precisely a place where the wall is not. Nine probes across the
 * back of each frame, each fired half a metre into the surface it hangs on,
 * and every one of them has to land on a collider that is not a door leaf or a
 * gate. A picture hung across an opening fails because the opening has nothing
 * in it; a picture hung on thin air fails for the same reason; and a picture
 * covering a doorway only PARTLY -- which is what actually happens, and what
 * a centre-point check would pass -- fails on the corner that overhangs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import * as THREE from 'three';

import { buildCartelPalace } from '../src/cartel-palace/world.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The six landscape pieces, in the order the owner supplied them. */
const LANDSCAPE_SLOTS = [
  'cartel-palace.entry.the-a-team',
  'cartel-palace.entry.we-dont-miss',
  'cartel-palace.security.assault',
  'cartel-palace.dining.el-jefe',
  'cartel-palace.ops.champions',
  'cartel-palace.ops.strat',
];

/**
 * The four PORTRAIT pieces delivered 2026-08-25, which hang on the gallery
 * corridor's canvases rather than on the six frames authored for landscape.
 * A separate list because they are a separate shape: mixing them into one set
 * would mean the aspect check below could only assert something true of both,
 * which is nothing.
 */
const PORTRAIT_SLOTS = [
  'cartel-palace.gallery.respect-us',
  'cartel-palace.gallery.master-plan',
  'cartel-palace.gallery.stealth-mission',
  'cartel-palace.gallery.best-team',
];

const EXPECTED_SLOTS = [...LANDSCAPE_SLOTS, ...PORTRAIT_SLOTS];

/** 1456 x 1092 landscape, 1122 x 1402 portrait. Frames match, by hand. */
const DELIVERED_ASPECT = 4 / 3;
const PORTRAIT_ASPECT = 0.8;
const ASPECT_FOR = new Map([
  ...LANDSCAPE_SLOTS.map((slot) => [slot, DELIVERED_ASPECT]),
  ...PORTRAIT_SLOTS.map((slot) => [slot, PORTRAIT_ASPECT]),
]);

let cached = null;
function palace() {
  cached ??= buildCartelPalace(new THREE.Scene());
  return cached;
}

function manifest() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/art/manifest.json'), 'utf8'));
}

/** Every group in the built palace that carries an owner-art slot. */
function hungSlots() {
  const slots = [];
  palace().root.traverse((object) => {
    if (object.userData?.artSlot) slots.push(object.userData.artSlot);
  });
  return slots;
}

test('the manifest declares every palace A-Team slot', () => {
  const rows = manifest().art.filter((entry) => entry.slot?.startsWith('cartel-palace.'));
  assert.deepEqual(
    rows.map((entry) => entry.slot).sort(),
    [...EXPECTED_SLOTS].sort(),
    'assets/art/manifest.json must carry exactly the cartel-palace.* rows the scene builds',
  );
  for (const row of rows) {
    /* Title and caption are what the player reads off the wall on [E]. A row
     * with a file and no words is a picture nobody can identify; a row with
     * neither is just a comment. */
    assert.ok(row.title?.trim(), `${row.slot} needs a title`);
    assert.ok(row.caption?.trim(), `${row.slot} needs a caption`);
    /* A row may legitimately have no `file` -- that is the state all six are
     * in until the owner drops his drawings in. But a row that names one has
     * to name one that is there, or the palace silently shows a placeholder
     * and reports nothing. Same rule tools/check.mjs applies to every other
     * slot in the game; restated here so it holds for these six the day the
     * files land. */
    if (row.file) {
      assert.ok(
        fs.existsSync(path.join(ROOT, 'assets/art', row.file)),
        `${row.slot} names "${row.file}", which is not in assets/art/`,
      );
    }
  }
});

test('the palace hangs exactly those, once each', () => {
  const hung = hungSlots();
  assert.deepEqual(
    [...hung].sort(), [...EXPECTED_SLOTS].sort(),
    'the built scene and the manifest have drifted apart',
  );
  assert.equal(new Set(hung).size, hung.length, 'a slot is hung twice');
  assert.deepEqual(
    [...palace().art.slots].sort(), [...EXPECTED_SLOTS].sort(),
    'world.art.slots is what a verifier reads; it must match what is built',
  );
  assert.equal(palace().art.pieces.length, EXPECTED_SLOTS.length);
});

test('every frame is authored at the shape of the picture that goes in it', () => {
  for (const piece of palace().art.pieces) {
    /* The frames deliberately do NOT resize themselves from the file's own
     * aspect ratio when it arrives (see `dressATeamArt`). That is only safe
     * because they are authored at the shape the file will be -- otherwise
     * the doorway sweep below measures a frame the player never sees.
     *
     * Two shapes now, and the pairing is the point: put a 0.8 portrait in a
     * 4:3 frame and it is not a stretched picture in a test, it is a
     * stretched picture on a wall in the one corridor with no way around it. */
    const expected = ASPECT_FOR.get(piece.slot);
    assert.ok(expected, `${piece.slot} has no authored aspect on record`);
    assert.ok(
      Math.abs(piece.width / piece.height - expected) < 1e-9,
      `${piece.slot} is ${piece.width} x ${piece.height}, not ${expected}`,
    );
  }
});

test('no A-Team piece hangs across a doorway, a window or thin air', () => {
  const world = palace();
  /* A door leaf and a gate are not wall. Both are colliders, both are in the
   * array, and both are removed from it the moment the mission opens them --
   * so a picture "backed" by one is a picture that will be hanging over a
   * hole by the time the player walks past it. */
  const walls = world.colliders.filter((box) => !/door|gate/i.test(box.name || ''));
  const PROBE = 0.5;
  const INSET = 0.02;
  const hit = new THREE.Vector3();

  for (const piece of world.art.pieces) {
    // The direction the surface it hangs on is looking, and the surface's
    // own left-right axis. `wallArt` builds everything forward of the point.
    const normal = new THREE.Vector3(Math.sin(piece.yaw), 0, Math.cos(piece.yaw));
    const across = new THREE.Vector3(Math.cos(piece.yaw), 0, -Math.sin(piece.yaw));
    const anchor = new THREE.Vector3(piece.x, piece.y, piece.z);
    const back = normal.clone().negate();

    for (const u of [-piece.width / 2 + INSET, 0, piece.width / 2 - INSET]) {
      for (const v of [-piece.height / 2 + INSET, 0, piece.height / 2 - INSET]) {
        const from = anchor.clone()
          .addScaledVector(across, u)
          .addScaledVector(normal, 0.01);
        from.y += v;
        const ray = new THREE.Ray(from, back);
        const backing = walls.find((box) => (
          ray.intersectBox(box, hit) && from.distanceTo(hit) <= PROBE
        ));
        assert.ok(
          backing,
          `${piece.slot} has no wall behind (${from.x.toFixed(2)}, ${from.y.toFixed(2)}, `
          + `${from.z.toFixed(2)}) -- that corner is over an opening`,
        );
      }
    }
  }
});

test('no A-Team piece is buried in the wall or clipping furniture', () => {
  const world = palace();
  for (const piece of world.art.pieces) {
    for (const box of world.colliders) {
      /* Every one of these hangs a few millimetres PROUD of a measured wall
       * face, which is the 2026-08-20 rule that pulled the gallery's frames
       * back out of thin air and off the inside of their own panels. Touching
       * the wall collider means the frame is in the plaster; touching any
       * other collider means it is in the mop sink, the console table or the
       * rack column. */
      assert.ok(
        !piece.box.intersectsBox(box),
        `${piece.slot} intersects collider "${box.name || '(unnamed)'}"`,
      );
    }
  }
});

test('no A-Team piece overlaps another picture already on the wall', () => {
  const world = palace();
  const existing = [];
  world.root.traverse((object) => {
    if (object.userData?.artSlot) return;
    if (object.name === 'palace-wall-art' || object.name === 'mark-family-portrait') {
      existing.push({ name: object.name, box: new THREE.Box3().setFromObject(object) });
    }
  });
  assert.ok(existing.length > 0, 'the palace\'s own pictures should still be there');

  const pieces = world.art.pieces;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      assert.ok(
        !pieces[i].box.intersectsBox(pieces[j].box),
        `${pieces[i].slot} overlaps ${pieces[j].slot}`,
      );
    }
    for (const other of existing) {
      assert.ok(
        !pieces[i].box.intersectsBox(other.box),
        `${pieces[i].slot} overlaps an existing ${other.name}`,
      );
    }
  }
});

test('a slot with no file still gets a placeholder rather than a blank wall', async () => {
  /* `resolveGear` cannot run here: every placeholder in this project is drawn
   * into a real 2D canvas and Node has no `document`. What CAN be checked
   * without one is that the scene asked for its slots and survived being told
   * no -- the palace hands out the promise precisely so a caller can see that,
   * and a rejection that escaped it would take the whole scene down in the
   * browser the first time a manifest 404'd. */
  const dressed = await palace().art.ready;
  assert.ok(Array.isArray(dressed), 'world.art.ready must settle to a list, never reject');

  /* And the lettering it will draw is registered for all six. Read as source
   * rather than imported for the same canvas reason. */
  const gear = fs.readFileSync(path.join(ROOT, 'src/world/gear.js'), 'utf8');
  for (const slot of EXPECTED_SLOTS) {
    assert.ok(
      gear.includes(`'${slot}':`),
      `${slot} has no FALLBACKS entry in src/world/gear.js -- it would fall back to `
      + 'the apartment\'s bed poster, which is a Sasquatch in a forest',
    );
  }
});
