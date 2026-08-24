import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { FAMILY } from '../src/bing/family.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import { wardrobeFor } from '../src/core/wardrobe.js';
import {
  INITIATION_PROSPECT_IDS,
  InitiationCeremonyFigure,
  canonicalInitiationModel,
  makeInitiationCeremonyFigure,
  poseFallen,
  poseKneeling,
  poseSeated,
  poseStanding,
} from '../src/initiation/ceremony-figure.js';

function boxOf(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object, true);
}

function namedDescendant(root, name) {
  return root.getObjectByName(name) ?? root.getObjectByName(`person.soft.${name}`);
}

test('Initiation formal figures retain canonical identities in nice non-tuxedo suits', () => {
  const cases = [
    [CHARACTER_IDS.NUMBSKULL, wardrobeFor(CHARACTER_IDS.NUMBSKULL)],
    [CHARACTER_IDS.KITTENBOSS, wardrobeFor(CHARACTER_IDS.KITTENBOSS)],
    [CHARACTER_IDS.SEFF, FAMILY.find((member) => member.id === CHARACTER_IDS.SEFF).model],
    [CHARACTER_IDS.PROSPECT, canonicalInitiationModel(CHARACTER_IDS.PROSPECT)],
    [INITIATION_PROSPECT_IDS.THREE, canonicalInitiationModel(INITIATION_PROSPECT_IDS.THREE)],
  ];

  for (const [identity, canonical] of cases) {
    const figure = makeInitiationCeremonyFigure(identity);
    assert.equal(figure.characterId, identity);
    assert.equal(figure.group.userData.characterId, identity);
    assert.equal(figure.identityModel, canonical, `${identity} did not retain its canonical body object`);
    for (const field of ['height', 'build', 'skin', 'hair', 'hairColour', 'gender', 'bodyShape']) {
      if (canonical[field] !== undefined) assert.equal(figure.model[field], canonical[field], `${identity}.${field}`);
    }
    assert.equal(figure.model.dress, 'suit');
    assert.equal(figure.model.trim, true);
    assert.equal(figure.model.trouserFit, 'creased');
    assert.equal(figure.model.tuxedo, false);
    assert.equal(figure.model.bowtie, false);
    assert.equal(figure.model.threePiece, false);
    assert.equal(figure.model.pinstripe, false);
    assert.equal(figure.model.luxury, false);
    assert.equal(figure.model.pocketSquare, false);
  }
});

test('every Circle station resolves to its established campaign body', () => {
  const familyById = new Map(FAMILY.map((member) => [member.id, member.model]));
  const circle = [
    ['BOOSKIBRO', CHARACTER_IDS.BOOSKI],
    ['LOU', CHARACTER_IDS.LOU],
    ['GRATIN', CHARACTER_IDS.GRATIN],
    ['SEFF', CHARACTER_IDS.SEFF],
    ['DEATHMEGATRON', CHARACTER_IDS.DEATHMEGATRON],
    ['RIPPINFLOW', CHARACTER_IDS.RIPPINFLOW],
    ['SHUBENATOR', CHARACTER_IDS.SHUBENATOR],
    ['NUMBSKULL', CHARACTER_IDS.NUMBSKULL],
    ['APE', CHARACTER_IDS.APE],
    ['SNOW', CHARACTER_IDS.SNOW],
    ['IRISH', CHARACTER_IDS.IRISH],
    ['HOGMAMA', CHARACTER_IDS.HOG_MAMA],
    ['LAG', CHARACTER_IDS.LAG],
    ['ERIC', CHARACTER_IDS.ERIC],
    ['SASOLE', CHARACTER_IDS.CAPTAIN_LOU_SASOLE],
  ];

  for (const [scriptKey, characterId] of circle) {
    const canonical = wardrobeFor(characterId) ?? familyById.get(characterId);
    assert.ok(canonical, `${characterId} has no established body`);
    assert.equal(canonicalInitiationModel(scriptKey), canonical, `${scriptKey} restated its model`);
    const figure = makeInitiationCeremonyFigure(scriptKey);
    assert.equal(figure.characterId, characterId);
    assert.equal(figure.identityModel, canonical);
    assert.equal(figure.model.dress, 'suit');
    assert.equal(figure.model.tuxedo, false);
  }
});

test('the compatibility surface exposes articulated hand and weapon sockets', () => {
  const figure = new InitiationCeremonyFigure({ identity: 'GRATIN' });
  for (const field of [
    'group', 'position', 'body', 'head', 'armL', 'armR', 'foreL', 'foreR',
    'handL', 'handR', 'legL', 'legR', 'shinL', 'shinR',
  ]) assert.ok(figure[field], `missing compatibility field ${field}`);
  assert.equal(figure.parts.handL, figure.handL);
  assert.equal(figure.parts.handR, figure.handR);
  assert.equal(figure.parts.foreR, figure.foreR);
  assert.equal(typeof figure.update, 'function');
  assert.equal(typeof figure.walkT, 'number');
  assert.equal(typeof figure.breatheT, 'number');
});

test('an earned ceremony detail does not replace Tony\'s canonical body', () => {
  const canonical = canonicalInitiationModel(CHARACTER_IDS.PROSPECT);
  const inducted = makeInitiationCeremonyFigure('TONY', { appearance: { bandana: true } });
  assert.equal(inducted.identityModel, canonical);
  assert.equal(inducted.formalModel.bandana, undefined);
  assert.equal(inducted.model.bandana, true);
  assert.ok(inducted.rig.getObjectByName('person.bandana.wrap'));
});

test('standing compatibility update keeps formal torso rest data live', () => {
  const figure = makeInitiationCeremonyFigure('TONY');
  assert.doesNotThrow(() => figure.update(1 / 60, new THREE.Vector3(0, 0, -1), 2.35));
  assert.ok(Number.isFinite(figure.torsoWrap.scale.x));
  assert.ok(Number.isFinite(figure.torsoWrap.scale.y));
  assert.ok(Number.isFinite(figure.torsoWrap.scale.z));
});

test('kneeling uses real knees at floor level without burying the figure root or anatomy', () => {
  const figure = makeInitiationCeremonyFigure(CHARACTER_IDS.PROSPECT);
  const mark = { x: 2.4, y: 0, z: -5.6, heading: 0.35 };
  const standingLegY = figure.legL.position.y;
  poseKneeling(figure, mark);

  assert.equal(figure.group.position.y, 0, 'the outer character root was buried');
  assert.equal(figure.position.x, mark.x);
  assert.equal(figure.position.z, mark.z);
  assert.equal(figure.heading, mark.heading);
  assert.ok(figure.legL.position.y < standingLegY - 0.3, 'the hips did not lower over the knees');
  assert.ok(figure.shinL.rotation.x > 2, 'the shin did not fold independently from the thigh');

  const whole = boxOf(figure.rig);
  assert.ok(whole.min.y >= -1e-5, `anatomy crosses the floor at y=${whole.min.y}`);
  for (const shin of [figure.shinL, figure.shinR]) {
    const knee = namedDescendant(shin, 'knee');
    assert.ok(knee, 'articulated rig lost a knee mesh');
    const kneeBox = boxOf(knee);
    assert.ok(Math.abs(kneeBox.min.y) <= 1e-4, `knee is not planted: y=${kneeBox.min.y}`);
  }
  assert.ok(boxOf(figure.hips).min.y > 0.12, 'pelvis was buried with the legacy root drop');
  assert.ok(boxOf(figure.torso).min.y > 0.35, 'torso was buried with the legacy root drop');
});

test('multiple prospects can occupy independent kneeling marks simultaneously', () => {
  const tony = makeInitiationCeremonyFigure('TONY');
  const kittenboss = makeInitiationCeremonyFigure('KITTENBOSS');
  poseKneeling(tony, { x: -2.2, z: -5.55, heading: 0.1 });
  poseKneeling(kittenboss, { x: -0.95, z: -5.55, heading: -0.1 });

  assert.deepEqual([tony.position.x, tony.position.z], [-2.2, -5.55]);
  assert.deepEqual([kittenboss.position.x, kittenboss.position.z], [-0.95, -5.55]);
  assert.notEqual(tony.legL, kittenboss.legL);
  assert.equal(tony.pose, 'kneeling');
  assert.equal(kittenboss.pose, 'kneeling');
  assert.ok(boxOf(tony.rig).min.y >= -1e-5);
  assert.ok(boxOf(kittenboss.rig).min.y >= -1e-5);
});

test('fallen and standing poses remain grounded and reversible', () => {
  const figure = makeInitiationCeremonyFigure('PROSPECT FOUR');
  const mark = { x: 1.3, z: -4.8, heading: -0.4 };
  poseFallen(figure, mark, 1);
  assert.equal(figure.pose, 'fallen');
  assert.equal(figure.group.position.y, 0);
  assert.ok(boxOf(figure.rig).min.y >= -1e-5, 'fallen anatomy went through the floor');

  poseStanding(figure, { x: 3, z: 4, heading: 0.7 });
  assert.equal(figure.pose, 'standing');
  assert.equal(figure.group.position.y, 0);
  assert.ok(Math.abs(figure.rig.rotation.x) < 1e-10);
  assert.ok(Math.abs(figure.shinL.rotation.x) < 1e-10);
  assert.ok(boxOf(figure.rig).min.y >= -1e-5, 'standing reset went through the floor');
});

test('Lou keeps the shared articulated chair pose without moving the scene root below the floor', () => {
  const lou = makeInitiationCeremonyFigure('LOU');
  poseSeated(lou, { x: 24, z: 29.42, heading: 2.4, cushion: 0.53 }, 0);
  assert.equal(lou.pose, 'seated');
  assert.equal(lou.group.position.y, 0);
  assert.equal(lou.legL.rotation.x, -1.45);
  assert.equal(lou.shinL.rotation.x, 1.4);
  assert.ok(boxOf(lou.hips).min.y > 0.35, 'Lou is buried below his chair cushion');
});

test('a ceremony figure throws the shared slam and lands it exactly once', () => {
  /* The regression: Booskibro's speech opens on `line.gesture === 'slam'` and
   * the scene calls `owner.startSmash()` on whoever carries it. The night
   * crashed at that line because the ceremony rig had no swing at all. */
  const boosk = makeInitiationCeremonyFigure('BOOSKIBRO');
  assert.equal(typeof boosk.startSmash, 'function');
  assert.equal(boosk.smashing, false);

  assert.equal(boosk.startSmash(), true);
  assert.equal(boosk.startSmash(), false, 'a swing in flight refuses a second one');
  assert.equal(boosk.smashing, true);

  /* Wind up: the right arm goes back, not through. */
  boosk.update(0.1);
  assert.ok(boosk.armR.rotation.x < -0.5, `wound back, got ${boosk.armR.rotation.x}`);
  assert.equal(boosk.consumeImpact(), false, 'no impact during the windup');

  /* Through the impact mark: the fist lands once, and only once. */
  boosk.update(0.2);
  assert.equal(boosk.consumeImpact(), true, 'the fist lands at the impact mark');
  assert.equal(boosk.consumeImpact(), false, 'and it lands once');

  /* Recovery: the clock expires and the arm comes back to the gait's rest. */
  boosk.update(0.4);
  assert.equal(boosk.smashing, false, 'the swing recovers to idle');
  assert.equal(boosk.armR.rotation.x, 0);
  assert.equal(boosk.startSmash(), true, 'and a new one can start');
});
