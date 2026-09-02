import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
import {
  HEIST_PENDING_DIALOGUE,
  HEIST_DIALOGUE,
  heistDebriefClosingLines,
  pendingHeistCues,
} from '../src/heist/script.js';

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
    /* In the firing hand, off the forearm, since the crew started holding
     * their guns rather than wearing them (2026-09-02). */
    const weapon = actor.figure.root.getObjectByName(weaponName);
    assert.ok(weapon, `${id} lost the heist weapon`);
    assert.equal(weapon.parent, actor.figure.parts.foreR, `${id} is not holding the ${weaponName}`);
    assert.equal(actor.figure.pose, 'ready', `${id} is not carrying the ${weaponName} at the low ready`);
    assert.ok(actor.figure.parts.body.getObjectByName('crew-weapon-sling'), `${id} lost the weapon sling`);
    if (id === CHARACTER_IDS.NUMBSKULL) {
      /* His photograph landed 2026-09-01 and he wears it since 2026-09-02;
       * the drawn round glasses went with the drawn head. A photograph is an
       * <img>, so under node --test the builder gives him the authored head
       * instead -- the presentation row is the proof here, and the browser
       * gate (tools/verify-heist.mjs) proves the photo skull itself. */
      assert.equal(HEIST_CREW_PRESENTATION[id].face, 'assets/faces/numbskull.png',
        'Numbskull is not wearing his photograph');
      assert.equal(actor.figure.parts.head.getObjectByName('person.glasses.bridge'), undefined,
        'Numbskull still has the procedural glasses');
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

test('Snow runs the job and Big Uncle Lou owns the telephone, once', () => {
  /* Lou had exactly one cue in the whole mission, then a later pass put him
   * on the radio for the robbery. Owner, 2026-09-02: he is not there -- Snow
   * is -- and the handset said the verdict twice. So: no Lou line is playable
   * anywhere but the call, the four command beats are Snow's, and the crew
   * who ARE in the room have lines in the rooms they were quiet in. */
  const lou = Object.entries(HEIST_PENDING_DIALOGUE)
    .filter(([, entry]) => entry.speakerId === 'lou');
  assert.ok(lou.length >= 8, `Lou lost his verdict: ${lou.length} lines`);
  for (const [id, entry] of lou) {
    assert.deepEqual(entry.states, ['LOU_CALL_SAFEHOUSE'], `${id} plays somewhere other than the call`);
  }
  assert.equal(HEIST_PENDING_DIALOGUE.lou_home_order, undefined, 'the repeated go-home verdict is retired');
  for (const id of ['snow_van_clock', 'snow_lobby_floor', 'snow_vault_eight', 'snow_street_sirens']) {
    assert.equal(HEIST_PENDING_DIALOGUE[id]?.speakerId, 'snow', `${id} is not Snow's`);
  }
  for (const id of ['death_doors_first', 'death_lobby_wide', 'death_vault_handles', 'death_van_dead',
    'death_garage_hold', 'death_debrief_people']) {
    assert.equal(HEIST_PENDING_DIALOGUE[id]?.speakerId, 'deathmegatron', `${id} is not DeathMegatron's`);
  }
  assert.equal(HEIST_PENDING_DIALOGUE.numb_vault_trolleys?.speakerId, 'numbskull');
  assert.equal(HEIST_PENDING_DIALOGUE.shubes_alarm_clock?.speakerId, 'shubenator');
  for (const [, entry] of lou) {
    assert.equal(entry.subtitleName, 'Big Uncle Lou');
    // lou1 is Big Uncle Lou Sputthole. lou2 is Captain Lou Sasole, a different
    // man, and the campaign is explicit that the two never merge.
    assert.notEqual(entry.speakerId, 'captain_lou_sasole');
  }
});

test('a dirty TAKE debrief never falls through to clean praise', () => {
  assert.deepEqual(heistDebriefClosingLines(true), ['snow_good', 'prospect_debrief']);
  assert.deepEqual(heistDebriefClosingLines(false), ['prospect_debrief_dirty']);

  const dirty = heistDebriefClosingLines(false)
    .map((id) => HEIST_PENDING_DIALOGUE[id] ?? HEIST_DIALOGUE[id]);
  assert.equal(dirty.every(Boolean), true, 'the dirty closing references a missing line');
  assert.match(dirty.map(({ text }) => text).join(' '), /rest is mine/i);
  assert.doesNotMatch(
    dirty.map(({ text }) => text).join(' '),
    /covered people before money|did not make anything worse|well done|good job/i,
  );
});

test('THE TAKE visibly occurs on Day Five and Lou sends the Prospect home by phone', () => {
  const html = readFileSync(new URL('../heist.html', import.meta.url), 'utf8');
  const closing = [
    HEIST_PENDING_DIALOGUE.lou_debrief_verdict_good,
    HEIST_PENDING_DIALOGUE.lou_phone_home,
    HEIST_PENDING_DIALOGUE.prospect_phone_home,
  ];
  const words = closing.map((line) => line?.text ?? '').join(' ');

  assert.match(html, />DAY FIVE</i);
  assert.doesNotMatch(html, />DAY FOUR</i);
  assert.equal(closing.every(Boolean), true, 'the closing phone exchange is incomplete');
  assert.match(words, /go home.*stay by your phone/i);
  assert.match(words, /nobody sees anybody tonight/i);
  assert.doesNotMatch(words, /Bada Bing|\bseven\b|wear|clothing|initiation|decide about you/i);
  assert.equal('lou_call' in HEIST_DIALOGUE, false, 'the obsolete recorded cue id survived');
  assert.equal('prospect_home' in HEIST_DIALOGUE, false, 'the obsolete Prospect cue id survived');
  assert.equal('lou_prospect_verdict' in HEIST_PENDING_DIALOGUE, false,
    'the obsolete initiation-adjacent cue id survived');
});

test('nothing authored this pass points at the film it is parodying', () => {
  // docs/TONE-AND-PARODY.md: the recognition is the player's, from outside.
  // Nobody in the scene may wink at it.
  const banned = /\bheat\b|\bmovie\b|\bfilm\b|\bcinema\b|like a movie|de niro|pacino|screenplay/i;
  for (const [id, entry] of Object.entries(HEIST_PENDING_DIALOGUE)) {
    assert.ok(!banned.test(entry.text), `${id} winks at the reference: ${entry.text}`);
  }
});
