/**
 * A DECORATED OPENING IS STILL A WALL.
 *
 * The owner's report was that he "can be shot through the service-wing door
 * before entering". He could. `estate-front-west` stops at x 11.5 and
 * `estate-front-east` starts at 15.5, leaving a 4.0 m x 4.8 m hole in the
 * front wall, and the only collider ever put in it was the door leaf --
 * 3.02 m wide and 2.6 m tall. The 2.2 m header above it and a ~0.49 m reveal
 * down each side were drawn as stucco and stone and traced as air.
 *
 * That is the authoring hazard this file exists to catch, and it is not
 * specific to one doorway: the shared ballistics and perception only ever see
 * `world.colliders`, so anything a player reads as solid and the array does
 * not contain is a hole. docs/CONTEXT.md states the rule one way -- appearance
 * never implies penetration -- and this is its converse: appearance does not
 * imply solidity either, and only the collider array decides.
 *
 * The trace here is deliberately the crude one: does any enabled Box3 lie on
 * the segment. It is not the shared stack's own path (that lives in
 * `src/core/combat/spatial.js` and is exercised by the combat contract tests);
 * it is the question those tests cannot ask, which is whether this SCENE hands
 * that stack a world with a wall in it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';
import { ensureDomShim } from '../tools/three-shim.mjs';

ensureDomShim();
const { buildCartelPalace } = await import('../src/cartel-palace/world.js');

let cached = null;
function palace() {
  cached ??= buildCartelPalace(new THREE.Scene());
  return cached;
}

/** Every enabled collider the segment from -> to passes through, by name. */
function contacts(colliders, from, to) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  direction.normalize();
  const ray = new THREE.Ray(from.clone(), direction);
  const hit = new THREE.Vector3();
  const names = [];
  for (const box of colliders) {
    if (box.enabled === false) continue;
    if (ray.intersectBox(box, hit) && from.distanceTo(hit) <= length) {
      names.push(box.name || '(unnamed)');
    }
  }
  return names;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* Inside the entry hall to outside the front wall, straight through it. The
 * wall band is z 11.75..12.25, so 6 -> 14.5 crosses it with room either side. */
const INSIDE_Z = 6;
const OUTSIDE_Z = 14.5;

test('the shut service door stops a round everywhere across its opening', () => {
  const { colliders } = palace();
  /* The opening is x 11.5..15.5 and y 0..4.8. Sampled at the leaf, in both
   * reveals, and at two heights above the leaf -- the four places the wall
   * was missing. */
  const samples = [
    { x: 13.5, y: 1.55, what: 'chest height, through the leaf' },
    { x: 11.7, y: 1.55, what: 'chest height, west reveal' },
    { x: 15.3, y: 1.55, what: 'chest height, east reveal' },
    { x: 11.7, y: 0.4, what: 'ankle height, west reveal' },
    { x: 15.3, y: 2.4, what: 'head height, east reveal' },
    { x: 13.5, y: 3.6, what: 'above the leaf, under the header' },
    { x: 13.5, y: 4.5, what: 'high in the opening' },
  ];
  for (const { x, y, what } of samples) {
    const names = contacts(colliders, V(x, y, INSIDE_Z), V(x, y, OUTSIDE_Z));
    assert.ok(
      names.length > 0,
      `a round at ${what} (x=${x}, y=${y}) left the estate without touching anything`,
    );
  }
});

test('the front wall either side of the opening is solid, and the doorway is walkable', () => {
  const { colliders } = palace();
  /* The control. If these stopped passing, the trace above would be proving
   * nothing about the opening -- it would be proving the whole wall is gone. */
  for (const x of [8, 18 - 2.5]) {
    assert.ok(
      contacts(colliders, V(x, 1.55, INSIDE_Z), V(x, 1.55, OUTSIDE_Z)).length > 0,
      `the front wall at x=${x} does not stop a round`,
    );
  }

  /* And the reveals must not have narrowed the doorway a player walks through.
   * The leaf is 3.02 m on centre 13.5, so 12.2 and 14.8 are inside the walkable
   * gap: with the leaf's own collider excluded (an open door), nothing else may
   * be standing there. */
  for (const x of [12.2, 14.8]) {
    const names = contacts(colliders, V(x, 1.0, INSIDE_Z), V(x, 1.0, OUTSIDE_Z))
      .filter((name) => name !== 'estate-service-door');
    assert.deepEqual(
      names, [],
      `the open doorway is obstructed at x=${x} by ${names.join(', ')}`,
    );
  }
});

test('the header and both reveals carry the combat material they are drawn as', () => {
  const { colliders } = palace();
  const header = colliders.filter((c) => c.name === 'estate-entry-header');
  const reveals = colliders.filter((c) => c.name === 'estate-entry-reveal');
  assert.equal(header.length, 1, 'the entry header has exactly one collider');
  assert.equal(reveals.length, 2, 'both entry reveals have a collider');
  assert.equal(header[0].combatMaterial, 'concrete', 'the header is the wall it continues');
  for (const reveal of reveals) {
    assert.equal(reveal.combatMaterial, 'stone', 'a reveal is the stone jamb it is drawn as');
  }
  /* THE LEAF STAYS UNTAGGED, AND IT IS LOAD-BEARING THAT IT DOES.
   *
   * This was tried the other way on 2026-08-24, reasoning that a round into a
   * shut oak door should sound like wood rather than concrete. It should --
   * and the tag that buys it is `wood_thin`, because that is what
   * `combatMaterialFor` maps every wood in the scene to; `wood_thin` is in the
   * shared ballistics' PENETRABLE set; and this collider is 0.30 m deep
   * against a 0.35 m ceiling. The nicer impact sound comes with rifle rounds
   * going through the shut door again, which is the owner's original report.
   *
   * So: untagged, which the shared stack reads as a stopper. If the sound is
   * ever worth having, it needs a material token that presents as wood without
   * joining PENETRABLE -- not a tag on this collider. */
  const leaf = colliders.find((c) => c.name === 'estate-service-door');
  assert.ok(leaf, 'the service door leaf still has a collider');
  assert.equal(leaf.combatMaterial, undefined,
    'the shut service door has been given a penetrable material and rounds can '
    + 'come through it again');
});

/* ================================================================== */
/* AND THE PALACE ENDS AT THE PALACE                                    */
/* ================================================================== */

test('nothing in the Palace promises the player an Initiation', () => {
  /* Owner, 2026-08-24: the Prospect is not leaving for the Initiation here.
   *
   * The campaign graph has agreed with him since the Palace was repointed:
   * `SCENES[CARTEL_PALACE].next` goes to the SPECIAL MEETING, and it is THAT
   * scene which hands off to the Initiation at the treeline. What happens
   * after the terrace is that Tony goes home not knowing whether killing
   * Sauce was the right call, and waits for a phone call.
   *
   * Four separate places said otherwise, all of them on the scene's last
   * screen: the terrace prompt, the objective hint, the ending card and its
   * button. The destination was never wrong -- only everything the player
   * could read about it. */
  const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const surfaces = [
    ['src/cartel-palace/mission.js', /hint: '[^']*Initiation[^']*'/],
    ['src/cartel-palace/main.js', /label: '[^']*Initiation[^']*'/],
  ];
  for (const [file, promise] of surfaces) {
    assert.doesNotMatch(read(file), promise,
      `${file} tells the player he is leaving for the Initiation. He goes home `
      + 'and waits for a phone call; the Special Meeting is what collects him');
  }

  const page = read('cartel-palace.html');
  /* Comments stripped: what is being checked is what the player READS, and the
   * markup carries a note explaining why the word is not in the copy. */
  const card = page
    .slice(page.indexOf('id="ending"'), page.indexOf('id="loading"'))
    .replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(card, /Initiation/,
    'the ending card still announces the Initiation');
  assert.doesNotMatch(card, /FINAL MISSION/,
    'the card still calls the Palace the final mission; the Initiation is, and '
    + 'saying so here pre-empts an ending two scenes away');
  assert.match(card, /id="depart-btn"/, 'the exit button is gone or renamed');
  assert.match(read('src/cartel-palace/main.js'), /getElementById\('depart-btn'\)/,
    'the runtime is looking for a button the page does not have, so the mission '
    + 'cannot be left at all');

  /* And the destination itself is untouched -- this is a wording pass, not a
   * re-route. */
  assert.match(read('src/cartel-palace/main.js'),
    /navigateCampaign\(campaign, SCENE_IDS\.SPECIAL_MEETING, \{ spawn: 'kerb'/,
    'the exit no longer goes to the Special Meeting');
});

test('the estate has no slot between its walls and its ceilings', () => {
  /* Owner, 2026-08-24: floating beige rectangles in the estate.
   *
   * They are the interior partitions, seen from the next room over. Every one
   * of them stood 4.2 m off the floor while the ceiling slabs above start at
   * 4.48 -- an unbroken 28 cm slot around the top of every wall in the
   * building. Stand at the office desk and look up and the sight line goes
   * over the office's south partition, over the guest suite's, and into rooms
   * two doors away; a lit beige panel with no floor under it and no ceiling
   * over it is exactly what that reads as. Traced from a screenshot:
   * `office-south-partition` at 11.1 m and `guest-south-partition` at 12.9 m,
   * from a camera standing at the desk.
   *
   * So: every partition's top is INSIDE the ceiling slab above it, not level
   * with its underside. A butt joint at exactly 4.48 is a hairline the depth
   * buffer can open at a glancing angle, which is this bug again in a form
   * that is harder to see. */
  const { root } = palace();
  root.updateMatrixWorld(true);
  const boxOf = (mesh) => {
    mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  };
  const partitions = [];
  const ceilings = [];
  root.traverse((node) => {
    if (!node.isMesh) return;
    if (/partition(-west|-east)?$/.test(node.name)) partitions.push(node);
    if (/ceiling$/.test(node.name)) ceilings.push(node);
  });
  /* Seven of the nine authored partitions carry the `...-partition` name; the
   * two dining ones are `dining-partition-west`/`-east`. Both shapes are
   * matched above, and the count is a floor rather than an equality so an art
   * pass can add a wall without editing this. */
  assert.ok(partitions.length >= 7, `only ${partitions.length} interior partitions found`);
  assert.ok(ceilings.length >= 6, `only ${ceilings.length} ceilings found`);

  const lowestCeiling = Math.min(...ceilings.map((mesh) => boxOf(mesh).min.y));
  for (const wall of partitions) {
    const top = boxOf(wall).max.y;
    assert.ok(top >= lowestCeiling + 0.05,
      `${wall.name} stops at ${top.toFixed(2)} m and the ceiling above it starts `
      + `at ${lowestCeiling.toFixed(2)} m, leaving a ${((lowestCeiling - top) * 1000).toFixed(0)} mm `
      + 'slot the player can see the next room through');
  }
});

test('the third-evidence wall is finished around one walkable doorway', () => {
  /* Owner: turn away from the third evidence and chair and a whole wall bay
   * was missing. That bay is the intended route into the guest suite, so the
   * repair must close the wall without sealing the route. Probe only the new
   * named assembly: unrelated furniture beside either room must not make an
   * accidentally blocked doorway look valid. */
  const { colliders } = palace();
  const assembly = colliders.filter((collider) => /^security-guest-/.test(collider.name));
  const names = assembly.map((collider) => collider.name).sort();
  assert.deepEqual(names, [
    'security-guest-door-header',
    'security-guest-partition-north',
    'security-guest-partition-south',
  ]);

  const across = (z, y) => contacts(
    assembly,
    V(9.8, y, z),
    V(11.2, y, z),
  );
  for (const z of [-13.4, -9.1]) {
    assert.ok(across(z, 1.6).some((name) => /partition/.test(name)),
      `the third-evidence wall is still open at z=${z}`);
  }
  assert.deepEqual(across(-11.25, 1.6), [],
    'the repaired wall blocks the guest-suite route at player height');
  assert.deepEqual(across(-11.25, 3.6), ['security-guest-door-header'],
    'the doorway still has an open wall above its head');
});

test('the open dresser drawer is in the dresser', () => {
  /* Owner: misaligned dresser drawer. Two faults compounding. The top-right
   * slot carried a CLOSED face and an OPEN drawer box at the same time, so the
   * player saw a shut drawer front with a second drawer hovering in front of
   * it; and the open box's back sat 4 cm PROUD of the cabinet's front face,
   * with daylight between the drawer and the furniture. */
  const { root } = palace();
  root.updateMatrixWorld(true);
  let dresser = null;
  root.traverse((node) => { if (node.name === 'guest-suite-detail.dresser') dresser = node; });
  assert.ok(dresser, 'the guest suite dresser is gone');
  const boxOf = (mesh) => {
    mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  };
  const named = (needle) => {
    const found = [];
    dresser.traverse((node) => { if (node.isMesh && node.name === needle) found.push(node); });
    return found;
  };
  const [body] = named('dresser-body');
  const [open] = named('dresser-open-drawer');
  assert.ok(body && open, 'the dresser has lost its body or its open drawer');
  const bodyBox = boxOf(body);
  const openBox = boxOf(open);
  /* The cabinet faces -z, so "into the body" is a drawer back at a LARGER z
   * than the body's front face. */
  assert.ok(openBox.max.z >= bodyBox.min.z,
    `the open drawer's back is at z ${openBox.max.z.toFixed(3)} and the cabinet `
    + `front is at ${bodyBox.min.z.toFixed(3)}: ${((bodyBox.min.z - openBox.max.z) * 1000).toFixed(0)} mm `
    + 'of daylight between a drawer and the furniture it slides out of');

  /* And nothing is shut and open at once. */
  const faces = named('dresser-drawer-face');
  const clash = faces.filter((face) => {
    const b = boxOf(face);
    return b.min.y < openBox.max.y && b.max.y > openBox.min.y
      && b.min.x < openBox.max.x && b.max.x > openBox.min.x
      && b.min.z > bodyBox.min.z - 0.06;
  });
  assert.equal(clash.length, 0,
    'a closed drawer face is still drawn in the slot the open drawer came out of');
  assert.equal(faces.length, 4, `${faces.length} drawer faces for four drawers`);
  assert.equal(named('dresser-spilled-sleeve').length, 0,
    'the random pale object is still sticking out of the guest-suite drawer');
});

test('the desk lamp\'s shade is on the end of its arm', () => {
  /* Owner: floating lamp on the first evidence desk. The shade was placed by
   * eye at (0.42, 0.46, 0.14) against an arm whose far end is at
   * (0.405, 0.624, 0.06) -- 16 cm low and 8 cm to the side. It is derived from
   * the arm's own transform now, so the two cannot drift apart again. */
  const { root } = palace();
  root.updateMatrixWorld(true);
  let neck = null;
  let shade = null;
  root.traverse((node) => {
    if (node.name === 'clue-lamp-neck') neck = node;
    if (node.name === 'clue-lamp-shade') shade = node;
  });
  assert.ok(neck && shade, 'the office clue lamp has lost its arm or its shade');
  const boxOf = (mesh) => {
    mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  };
  const arm = boxOf(neck);
  const hood = boxOf(shade);
  assert.ok(arm.intersectsBox(hood),
    'the shade is not touching the arm it hangs from, which at desk distance '
    + 'reads as a lampshade floating beside a gooseneck pointing at nothing');
});
