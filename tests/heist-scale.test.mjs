import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { CHARACTER_IDS } from '../src/core/campaign.js';
import {
  DEATHMEGATRON,
  DEATHMEGATRON_HEIST,
  NUMBSKULL,
  RIPPINFLOW,
  RIPPINFLOW_HEIST,
  SHUBENATOR,
  SNOW,
} from '../src/core/wardrobe.js';
import { HEIST_CREW_PRESENTATION, buildHeistCrew, crewHeights } from '../src/heist/cast.js';
import { buildHeistLevel } from '../src/heist/level.js';
import {
  HEIST_HEIGHTS, HeistFigure, makeBankGuardFigure, makeHostageFigure, makePoliceFigure,
} from '../src/heist/people.js';
import { HEIST_PENDING_DIALOGUE, HEIST_DIALOGUE, pendingHeistCues } from '../src/heist/script.js';

/**
 * "Everyone is giant." — the owner, about every phase of this scene.
 *
 * The measurement that made it true: `src/core/person.js` puts the head at
 * 2.30 m with 26 cm of hair on it. This file is the gate that stops the scene
 * going back there: nobody in THE TAKE may be outside the range a person is,
 * and the player's own eye height is 1.66 m, so a 2.5 m crew member is half a
 * metre of shoulder above the camera.
 */
const HUMAN_MIN = 1.55;
const HUMAN_MAX = 2.0;

const CANONICAL_HEIST_CREW = Object.freeze({
  [CHARACTER_IDS.SNOW]: SNOW,
  [CHARACTER_IDS.RIPPINFLOW]: RIPPINFLOW,
  [CHARACTER_IDS.SHUBENATOR]: SHUBENATOR,
  [CHARACTER_IDS.DEATHMEGATRON]: DEATHMEGATRON,
  [CHARACTER_IDS.NUMBSKULL]: NUMBSKULL,
});

const EXPECTED_HEIST_PRESENTATION = Object.freeze({
  ...CANONICAL_HEIST_CREW,
  [CHARACTER_IDS.RIPPINFLOW]: RIPPINFLOW_HEIST,
  [CHARACTER_IDS.DEATHMEGATRON]: DEATHMEGATRON_HEIST,
});

const IDENTITY_FIELDS = Object.freeze([
  'height',
  'build',
  'gut',
  'gender',
  'bodyShape',
  'curveScale',
  'hair',
  'hairColour',
  'beard',
  'skin',
]);

function topOfHead(figure) {
  const box = new THREE.Box3().setFromObject(figure.root);
  return box.max.y;
}

test('every crew member is a person-sized person', () => {
  const scene = new THREE.Scene();
  const crew = buildHeistCrew(scene);
  assert.equal(crew.size, 5);
  for (const height of crewHeights(crew)) {
    assert.ok(height >= 1.7 && height <= HUMAN_MAX, `crew height ${height}`);
  }
  // Numbskull's canonical 1.95 m body is tall; it is not the old 2.56 m rig.
  const tallest = [...crew.values()].sort((a, b) => b.height - a.height)[0];
  assert.equal(tallest.id, CHARACTER_IDS.NUMBSKULL);
});

test('named heist crew keep their canonical bodies underneath the job gear', () => {
  const crew = buildHeistCrew(new THREE.Scene());

  for (const [id, canonical] of Object.entries(CANONICAL_HEIST_CREW)) {
    const presentation = HEIST_CREW_PRESENTATION[id];
    const actor = crew.get(id);
    assert.strictEqual(presentation.model, EXPECTED_HEIST_PRESENTATION[id],
      `${id} copied or restated its heist presentation`);
    for (const field of IDENTITY_FIELDS) {
      assert.equal(EXPECTED_HEIST_PRESENTATION[id][field], canonical[field],
        `${id} changed canonical ${field} in its heist presentation`);
    }
    assert.equal(actor.figure.height, canonical.height, `${id} changed height for the heist`);
    assert.equal(actor.figure.parts.profile.outfit, EXPECTED_HEIST_PRESENTATION[id].dress,
      `${id} lost its authored heist clothes`);
    assert.equal(actor.figure.parts.profile.gender, canonical.gender ?? 'unspecified', `${id} changed gender`);
    assert.equal(actor.figure.parts.profile.bodyShape, canonical.bodyShape ?? 'average', `${id} changed body shape`);
    assert.equal(
      actor.figure.parts.head.getObjectByName('person.neck').material.color.getHex(),
      canonical.skin,
      `${id} changed skin tone for the heist`,
    );
    if (canonical.hair === 'bald') {
      assert.equal(actor.figure.parts.head.getObjectByName('person.hair.crown'), undefined,
        `${id} grew scene-local hair`);
    } else if (!presentation.face && canonical.hairColour) {
      assert.equal(
        actor.figure.parts.head.getObjectByName('person.hair.crown').material.color.getHex(),
        canonical.hairColour,
        `${id} changed hair colour for the heist`,
      );
    }
    const hasPhotoFace = actor.figure.parts.head.getObjectByName('person.face.photo-skull') != null;
    assert.equal(
      actor.figure.parts.head.getObjectByName('person.hair.crown') != null,
      canonical.hair !== 'bald' && !hasPhotoFace,
      `${id} hair representation disagrees with its ${hasPhotoFace ? 'photo' : 'procedural'} head`,
    );
    assert.equal(
      actor.figure.parts.head.getObjectByName('person.face.beard') != null,
      canonical.beard === true,
      `${id} beard mesh disagrees with the canonical body`,
    );
    assert.ok(actor.figure.parts.body.getObjectByName('belt.strap'), `${id} lost the canonical belt`);
    assert.ok(actor.figure.parts.body.getObjectByName('crew-plate-carrier'), `${id} lost the tactical carrier`);
    const weaponName = id === CHARACTER_IDS.SNOW || id === CHARACTER_IDS.DEATHMEGATRON
      ? 'crew-carbine' : 'crew-sidearm';
    assert.ok(actor.figure.parts.body.getObjectByName(weaponName), `${id} lost the heist weapon overlay`);
    assert.ok(actor.figure.parts.body.getObjectByName('crew-weapon-sling'), `${id} lost the weapon sling`);
    if (id === CHARACTER_IDS.NUMBSKULL) {
      assert.ok(actor.figure.parts.head.getObjectByName('person.glasses.bridge'),
        'Numbskull lost his documented round-glasses face treatment');
    }
  }
});

test('the crew are built on the shared frame, not on the Sasquatch Smash rig', () => {
  const scene = new THREE.Scene();
  const crew = buildHeistCrew(scene);
  for (const actor of crew.values()) {
    const top = topOfHead(actor.figure);
    // Geometry, not a declared number: the actual bounding box of the figure,
    // with a little slack for a mask, a cap and a slung weapon.
    assert.ok(top >= HUMAN_MIN && top <= HUMAN_MAX + 0.12,
      `${actor.id} measures ${top.toFixed(2)} m to the top of its bounding box`);
    assert.equal(actor.identity.species, 'human');
  }
});

test('every crew member has an authored height in the presentation table', () => {
  for (const id of Object.keys(HEIST_CREW_PRESENTATION)) {
    const height = HEIST_CREW_PRESENTATION[id].model?.height;
    assert.ok(typeof height === 'number', `${id} has no authored height`);
    assert.ok(height >= 1.7 && height <= HUMAN_MAX, `${id} is ${height} m`);
  }
});

test('nobody the crew stands next to is a different species of size', () => {
  const level = buildHeistLevel(new THREE.Scene());
  const heights = level.phases.bank.civilians.map((root) => root.userData.figure.height);
  assert.equal(heights.length, 22);
  for (const height of heights) {
    assert.ok(height >= HEIST_HEIGHTS.civilianMin - 0.01 && height <= HEIST_HEIGHTS.civilianMax + 0.01,
      `a lobby civilian is ${height} m`);
  }
  // A lobby of one height is as wrong as a lobby of giants.
  assert.ok(new Set(heights.map((h) => h.toFixed(2))).size >= 8,
    `only ${new Set(heights).size} distinct heights in the lobby`);
  assert.ok(level.phases.bank.figures.guard.height <= HUMAN_MAX);
  assert.ok(level.phases.bank.figures.manager.height <= HUMAN_MAX);
});

test('the crew and the bank staff are within a foot of each other', () => {
  const scene = new THREE.Scene();
  const crew = buildHeistCrew(scene);
  const level = buildHeistLevel(new THREE.Scene());
  const crewTallest = Math.max(...crewHeights(crew));
  const bankShortest = Math.min(
    ...level.phases.bank.civilians.map((root) => root.userData.figure.height),
  );
  assert.ok(crewTallest - bankShortest < 0.4,
    `the tallest robber is ${(crewTallest - bankShortest).toFixed(2)} m over the shortest customer`);
});

test('officers, guards and hostages are all built by the same shared builder', () => {
  const police = makePoliceFigure({ name: 'p', x: 0, z: 0, yaw: 0, index: 0 });
  const guard = makeBankGuardFigure({ name: 'g', x: 0, z: 0, yaw: 0 });
  const hostage = makeHostageFigure({ id: 'h', index: 3, role: 'customer', x: 0, z: 0, yaw: 0 });
  for (const figure of [police, guard, hostage]) {
    assert.ok(figure instanceof HeistFigure);
    assert.ok(figure.parts.armL && figure.parts.legL && figure.parts.head,
      'not a makePerson part table');
    const top = topOfHead(figure);
    assert.ok(top >= HUMAN_MIN && top <= HUMAN_MAX + 0.12, `${figure.root.name} is ${top} m`);
  }
});

test('a prone figure lies on the floor rather than half inside it', () => {
  const figure = makeHostageFigure({ id: 'h', index: 0, role: 'customer', x: 0, z: 0, yaw: 0 });
  figure.prone();
  const box = new THREE.Box3().setFromObject(figure.root);
  assert.ok(box.min.y > -0.16, `prone body sinks to ${box.min.y.toFixed(2)} m`);
  assert.ok(box.max.y < 0.85, `prone body still stands ${box.max.y.toFixed(2)} m tall`);
  figure.stand();
  const standing = new THREE.Box3().setFromObject(figure.root);
  assert.ok(standing.max.y > 1.5);
});

test('a fallen figure stops breathing on the floor and resets cleanly to stand', () => {
  const figure = makeHostageFigure({ id: 'fallen', index: 0, role: 'customer', x: 0, z: 0, yaw: 0 });

  /* Enter the death pose from a real inhale. The animation offset used to be
   * baked into `_settle()`, then the next breath phase moved the corpse through
   * the floor. */
  figure.phase = Math.PI / 2;
  figure.update(0, { fear: 0 });
  figure.setState('down', { blend: false });

  const sample = (phase) => {
    figure.phase = phase;
    figure.update(0, { fear: 0 });
    figure.root.updateMatrixWorld(true);
    return {
      bodyY: figure.parts.body.position.y,
      bounds: new THREE.Box3().setFromObject(figure.root),
    };
  };
  const inhale = sample(Math.PI / 2);
  const exhale = sample(Math.PI * 1.5);

  assert.equal(inhale.bodyY, 0, 'the fallen chest kept breathing upward');
  assert.equal(exhale.bodyY, 0, 'the fallen chest kept breathing downward');
  assert.ok(Math.abs(inhale.bounds.min.y - exhale.bounds.min.y) < 1e-9,
    `the corpse floor contact moved ${inhale.bounds.min.y} -> ${exhale.bounds.min.y}`);
  assert.ok(exhale.bounds.min.y >= -1e-6,
    `the corpse dipped through the floor to ${exhale.bounds.min.y}`);

  figure.setState('ambient', { blend: false });
  assert.equal(figure.parts.body.position.y, 0, 'standing retained the corpse animation offset');
  assert.equal(figure.tilt.position.y, 0, 'standing retained the corpse floor-settle lift');
  assert.equal(figure.pose, 'stand');
});

test('lines written this pass are all in the pending bank with heist cues', () => {
  const pending = pendingHeistCues();
  assert.ok(pending.length >= 35, `only ${pending.length} new lines`);
  assert.equal(new Set(pending).size, pending.length, 'duplicate cue');
  for (const cue of pending) assert.match(cue, /^heist\./);
  // The two banks must never overlap: `tools/check.mjs` requires a manifest cue
  // for everything in HEIST_DIALOGUE and the manifest is generated centrally,
  // so a pending line in the first bank fails the build.
  const recorded = new Set(Object.keys(HEIST_DIALOGUE));
  for (const id of Object.keys(HEIST_PENDING_DIALOGUE)) {
    assert.ok(!recorded.has(id), `${id} is in both dialogue banks`);
  }
});

test('Big Uncle Lou has a real presence on the job and owns the debrief', () => {
  // He had exactly one cue in the whole mission — `heist.lou_call`, at the very
  // end — which is part of why the debrief did not read as anything.
  const lou = Object.entries(HEIST_PENDING_DIALOGUE)
    .filter(([, entry]) => entry.speakerId === 'lou');
  assert.ok(lou.length >= 10, `Lou still only has ${lou.length} new lines`);
  assert.ok(lou.some(([, entry]) => entry.states?.includes('LOBBY_CONTROL')),
    'Lou never speaks during the robbery itself');
  assert.equal(lou.filter(([, entry]) => entry.states?.includes('DEBRIEF')).length >= 6, true,
    'Lou does not carry the debrief');
  for (const [, entry] of lou) {
    assert.equal(entry.subtitleName, 'Big Uncle Lou');
    // lou1 is Big Uncle Lou Sputthole. lou2 is Captain Lou Sasole, a different
    // man, and the campaign is explicit that the two never merge.
    assert.notEqual(entry.speakerId, 'captain_lou_sasole');
  }
});

test('nothing authored this pass points at the film it is parodying', () => {
  // docs/TONE-AND-PARODY.md: the recognition is the player's, from outside.
  // Nobody in the scene may wink at it.
  const banned = /\bheat\b|\bmovie\b|\bfilm\b|\bcinema\b|like a movie|de niro|pacino|screenplay/i;
  for (const [id, entry] of Object.entries(HEIST_PENDING_DIALOGUE)) {
    assert.ok(!banned.test(entry.text), `${id} winks at the reference: ${entry.text}`);
  }
});
