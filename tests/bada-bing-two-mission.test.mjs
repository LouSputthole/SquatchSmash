import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  SECOND_VISIT_CLEANUP_TASKS,
  SecondVisitMission,
  pendingCleanupPrerequisites,
  buildSecondVisitLouScript,
  buildHotDogPartySequence,
  secondVisitLouStartNode,
} from '../src/bing/second-visit.js';
import { createPartyCollider } from '../src/bing/party-collision.js';
import { restoreHotDogCleanupPresentation } from '../src/bing/hotdog-cleanup-presentation.js';
import {
  SHUBENATOR_SIGNATURE_TAKES,
  SHUBENATOR_SIGNATURE_TEXT,
} from '../src/core/shubenator-signature.js';

test('party actor colliders follow moving rigs, park, and disable when hidden', () => {
  const scene = new THREE.Scene();
  const parent = new THREE.Group();
  const target = new THREE.Group();
  scene.add(parent);
  parent.add(target);
  parent.position.set(2, 0.25, -3);
  target.position.set(1, 0.5, 2);

  const collision = createPartyCollider({
    id: 'test.mover',
    target,
    halfX: 0.3,
    halfZ: 0.2,
    minY: -0.1,
    maxY: 1.1,
    kind: 'cast',
    ownerActorId: 'test-actor',
  });
  assert.equal(collision.active, true);
  assert.equal(collision.box.enabled, true);
  assert.deepEqual(collision.snapshot(), {
    active: true,
    min: [2.7, 0.65, -1.2],
    max: [3.3, 1.85, -0.8],
  });

  target.position.x += 2;
  assert.deepEqual(collision.snapshot().min, [4.7, 0.65, -1.2]);

  parent.visible = false;
  assert.equal(collision.active, false);
  assert.equal(collision.box.enabled, false, 'hidden party bodies do not publish active collision');
  assert.ok(collision.box.min.x > 10_000);
});

test('the second Bing visit turns the closed party into a short cleanup mission', () => {
  const objectiveSnapshots = [];
  const mission = new SecondVisitMission({
    onObjective: (objectives) => objectiveSnapshots.push(structuredClone(objectives)),
  });

  assert.equal(mission.state, 'lot');
  assert.equal(mission.readyToLeave, false);
  /* Owner, 2026-08-19: the first objective is ENJOY THE PARTY, and the stage
   * is not an objective until the Prospect has actually had some of it. */
  assert.deepEqual(mission.objectives, [
    { id: 'party', text: 'Enjoy the party', done: false },
  ]);

  mission.enteredClub();
  assert.equal(mission.state, 'party');
  assert.equal(mission.objectives.some((o) => o.id === 'performance'), false,
    'walking in is not the same as having had the party');
  assert.equal(mission.enjoyedParty('shot'), true);
  assert.equal(mission.enjoyedParty('shot'), false, 'the same drink is not two drinks');
  assert.equal(mission.enjoyedParty('plate'), true);
  assert.equal(mission.objectives.some((o) => o.id === 'performance'), false);
  assert.equal(mission.enjoyedParty('talk'), true);
  assert.equal(mission.objectives.find((o) => o.id === 'party')?.done, true);
  assert.ok(mission.objectives.some((o) => o.id === 'performance'));

  assert.equal(mission.startPerformance(), true);
  assert.equal(mission.state, 'performance');
  assert.equal(mission.finishPerformance(), true);
  assert.equal(mission.state, 'tension');
  assert.equal(mission.startAttack(), true);
  assert.equal(mission.state, 'attack');

  assert.equal(mission.completeCleanup(SECOND_VISIT_CLEANUP_TASKS[0]), false);
  assert.equal(mission.resolveAttack(), true);
  assert.equal(mission.flags.attackResolved, true);
  assert.equal(mission.state, 'cleanup');
  /* The floor's three, and NOT the sweep: it does not exist as an objective
   * until Lou hands it out, which is after Billy has left the building. */
  assert.equal(mission.objectives.some((o) => o.id === 'cleanup.final_sweep'), false);
  for (const task of mission.roomTasks) {
    assert.equal(mission.completeCleanup(task), true, task);
  }
  assert.equal(mission.wrapBody(), true);
  assert.equal(mission.state, 'body-ready');
  assert.equal(mission.assign('reserve_pickup'), false, 'nobody loads a body they never picked up');
  assert.equal(mission.carryBody(), true);
  assert.equal(mission.assign('reserve_pickup'), true);
  assert.equal(mission.state, 'debrief');
  assert.equal(mission.readyToLeave, false, 'the sweep is still owed');
  assert.equal(mission.completeCleanup('final_sweep'), false, 'Lou has not asked for it yet');
  assert.equal(mission.debriefLou(), true);
  assert.equal(mission.state, 'sweep');
  assert.ok(mission.objectives.some((o) => o.id === 'cleanup.final_sweep'));
  assert.equal(mission.completeCleanup('final_sweep'), true);
  assert.equal(mission.readyToLeave, true);
  assert.equal(mission.beginDeparture(), true);
  assert.ok(mission.objectives.some((o) => o.id === 'leave'));
  assert.equal(mission.finish(), 'graveyard');
  assert.equal(mission.state, 'done');
  assert.equal(mission.objectives.find((objective) => objective.id === 'load')?.done, true);
  assert.equal(mission.objectives.find((objective) => objective.id === 'leave')?.done, true);
  assert.ok(objectiveSnapshots.length >= 5);
});

test('Lou cannot spoil the HotDog murder before the attack starts', () => {
  assert.equal(secondVisitLouStartNode('lot'), 'hang');
  assert.equal(secondVisitLouStartNode('party'), 'hang');
  assert.equal(secondVisitLouStartNode('performance'), 'hang');
  assert.equal(secondVisitLouStartNode('tension'), 'hang');
  assert.equal(secondVisitLouStartNode('attack'), 'enter');
  assert.equal(secondVisitLouStartNode('cleanup'), 'cleanup');
  assert.equal(secondVisitLouStartNode('body-ready'), 'cleanup');
  assert.equal(secondVisitLouStartNode('debrief'), 'cleanup');
  assert.equal(secondVisitLouStartNode('sweep'), 'cleanup');
  assert.equal(secondVisitLouStartNode('done'), 'cleanup');

  const cleanup = buildSecondVisitLouScript().cleanup;
  assert.equal(cleanup.cue, 'vo.bing2.lou.lockdown');
  assert.equal(
    cleanup.line,
    'Nobody leaves. Congratulations, everybody. You are all involved now.',
  );
});

test('the authored party sequence keeps the relaxed set, escalation, sudden attack, and motel handoff', () => {
  const sequence = buildHotDogPartySequence();
  const text = sequence.map((beat) => `${beat.who}: ${beat.line}`).join('\n');

  assert.match(text, /Hog Mama/i);
  assert.match(text, /fur brush/i);
  assert.match(text, /He didn.t leave\. He went quiet/i);
  assert.match(text, /Nobody leaves/i);
  assert.match(text, /motel/i);
  const beating = sequence.find((beat) => beat.action === 'begin-beating');
  assert.deepEqual(
    {
      who: beating?.who,
      line: beating?.line,
      cue: beating?.cue,
      direction: beating?.direction,
    },
    {
      who: 'Ape',
      line: 'Here\'s your fucking fur brush, HotDog.',
      cue: 'vo.bing2.ape.fur_brush',
      direction: 'Low, controlled fury; close and personal, not shouted. Let “fur brush” land hard.',
    },
  );
  assert.equal(sequence.some((beat) => beat.action === 'enable-gun-kick'), false);
  assert.equal(sequence.some((beat) => /revolver|gun/i.test(beat.line)), false);

  const signature = sequence.find((beat) => beat.cue === SHUBENATOR_SIGNATURE_TAKES.hotDogAftermath.cue);
  const music = sequence.findIndex((beat) => beat.cue === 'vo.bing2.shubenator.music');
  assert.deepEqual(
    {
      who: signature?.who,
      line: signature?.line,
      direction: signature?.direction,
      reaction: signature?.reaction,
    },
    {
      who: 'Shubenator',
      line: SHUBENATOR_SIGNATURE_TEXT,
      direction: SHUBENATOR_SIGNATURE_TAKES.hotDogAftermath.direction,
      reaction: 'shubenator-aftermath',
    },
  );
  assert.equal(sequence.indexOf(signature), music + 1, 'signature lands immediately after the music cut');
  assert.ok(
    sequence.filter((beat) => ['tension', 'attack'].includes(beat.phase)).every((beat) => beat.gapAfter >= 0.25),
    'the argument and murder beats breathe instead of firing as one continuous subtitle block',
  );
});

test('the closed-party stage and cleanup read clearly from the playable floor', () => {
  const source = fs.readFileSync(new URL('../src/bing/hotdog-party.js', import.meta.url), 'utf8');
  assert.match(source, /new THREE\.SpotLight/);
  assert.match(source, /mic\.position\.set\(-12, 0, -3\.45\)/);
  assert.match(source, /new THREE\.ShapeGeometry\(shape\)/);
  assert.doesNotMatch(source, /new THREE\.CircleGeometry\(1\.15/);
  // The body Rippin and Aubbie leave on the floor comes from the shared prop,
  // sized off Billy himself. It used to be a capsule with three rings on it,
  // and that must not come back.
  assert.match(source, /buildWrappedBody\(\{\s*\n\s*length: BILLY_HOTDOG_MODEL\.height/);
  assert.doesNotMatch(source, /CapsuleGeometry/);
  assert.match(source, /const evidenceMarkers = \{/);
  assert.match(source, /const serviceGuide = group\('service-exit-guide'\)/);
  assert.match(source, /ape\.fur-brush-knife/);
  assert.doesNotMatch(source, /makeRevolver/);
});

test('the HotDog runtime uses canonical faces and one Snow/Lawnmower body', () => {
  const source = fs.readFileSync(new URL('../src/bing/hotdog-party.js', import.meta.url), 'utf8');
  assert.match(source, /await loadFaceIndex\(\)/);
  assert.match(source, /const lawnmower = byId\[CHARACTER_IDS\.SNOW\]/);
  assert.doesNotMatch(source, /makeNpc\(scene, club, \{\s*name: 'Lawnmower'/);
});

test('closed-party Lou wears the canonical Bing three-piece without moving his party mark', () => {
  const source = fs.readFileSync(new URL('../src/bing/hotdog-party.js', import.meta.url), 'utf8');
  const start = source.indexOf('const lou = makeNpc(scene, club, {');
  const end = source.indexOf('const hotdog = makeNpc', start);
  assert.ok(start >= 0 && end > start, 'the closed-party Lou call site is missing');
  const lou = source.slice(start, end);

  assert.match(source, /import \{[^}]*BIG_UNCLE_LOU_BING[^}]*\} from '\.\.\/core\/wardrobe\.js';/s);
  assert.match(lou, /x: -16\.2, z: 2\.0, yaw: 2\.25, job: 'stand'/,
    'Lou moved or changed pose during the wardrobe reuse');
  assert.match(lou, /model: \{ \.\.\.BIG_UNCLE_LOU_BING, face: faces\.has\('lou\.png'\) \? 'assets\/faces\/lou\.png' : null \}/,
    'closed-party Lou is not the Bing variant with the existing face decision');
  assert.doesNotMatch(lou, /\.\.\.BIG_UNCLE_LOU(?:[, }])/, 'the plain Lou model returned');
});

test('completed cleanup tasks restore every matching party prop and pad', () => {
  const visible = () => ({ visible: true });
  const party = {
    banner: visible(),
    food: { group: visible() },
    cleanup: {
      bathroomPads: { mens: visible(), ladies: visible() },
      kit: visible(),
      cufflink: visible(),
      lapel: visible(),
      brokenStool: visible(),
      blood: { material: { opacity: 0.88 } },
    },
  };

  restoreHotDogCleanupPresentation(party, SECOND_VISIT_CLEANUP_TASKS);

  assert.equal(party.cleanup.bathroomPads.mens.visible, false);
  assert.equal(party.cleanup.bathroomPads.ladies.visible, false);
  assert.equal(party.cleanup.kit.visible, false);
  assert.equal(party.cleanup.cufflink.visible, false);
  assert.equal(party.cleanup.lapel.visible, false);
  assert.equal(party.banner.visible, false);
  assert.equal(party.food.group.visible, false);
  assert.equal(party.cleanup.brokenStool.visible, false);
  assert.equal(party.cleanup.blood.material.opacity, 0.2);
});

/* ================================================================== */
/* Lou's final sweep is LAST, whoever asks                             */
/*                                                                     */
/* The order used to live in one interaction in hotdog-main.js, so the  */
/* model itself would happily close the sweep first and leave the       */
/* bathrooms, Aubbie's kit and HotDog's jewellery standing as finished   */
/* business behind a mission that had already moved on. The rule is the  */
/* mission's now, and these walk the tasks in the order a confused       */
/* player, a replayed checkpoint or a new caller would.                  */
/* ================================================================== */

function missionInCleanup() {
  const mission = new SecondVisitMission();
  mission.enteredClub();
  mission.startPerformance();
  mission.finishPerformance();
  mission.startAttack();
  mission.resolveAttack();
  assert.equal(mission.state, 'cleanup');
  return mission;
}

/** Everything between the last floor task and Lou asking for his sweep. */
function bodyOutOfTheBuilding(mission) {
  assert.equal(mission.wrapBody(), true);
  assert.equal(mission.carryBody(), true);
  assert.equal(mission.assign('reserve_pickup'), true);
  assert.equal(mission.debriefLou(), true);
  assert.equal(mission.state, 'sweep');
}

test('the final sweep is refused until the club is actually clean', () => {
  const mission = missionInCleanup();

  assert.equal(mission.completeCleanup('final_sweep'), false,
    'nothing has been done yet -- there is nothing to sweep up after');
  assert.equal(mission.cleanup.has('final_sweep'), false);

  assert.equal(mission.completeCleanup('cleaning_kit'), true);
  assert.equal(mission.completeCleanup('final_sweep'), false, 'two prerequisites still owed');

  assert.equal(mission.completeCleanup('missing_evidence'), true);
  assert.equal(mission.completeCleanup('final_sweep'), false, 'the men\'s room is still owed');
  assert.equal(mission.objectives.find((o) => o.id === 'wrap'), undefined,
    'the body cannot be wrapped off a floor that is still dirty');

  assert.equal(mission.completeCleanup('bathrooms'), true);
  assert.ok(mission.objectives.find((o) => o.id === 'wrap'));
  /* And the sweep is STILL refused, because the sweep is not a cleanup task
   * you can reach off a clean floor any more -- Billy has to be out of the
   * building and Lou has to have asked for it. */
  assert.equal(mission.completeCleanup('final_sweep'), false,
    'Billy is still on the boards and Lou has not asked for a sweep');

  bodyOutOfTheBuilding(mission);
  assert.equal(mission.completeCleanup('final_sweep'), true, 'now it is the last thing left');
});

test('an out-of-order sweep cannot short-circuit the body being wrapped', () => {
  const mission = missionInCleanup();

  // The exact bypass: a caller that never walks the club's own order.
  for (const task of ['final_sweep', 'bathrooms', 'cleaning_kit']) mission.completeCleanup(task);
  assert.equal(mission.cleanup.has('final_sweep'), false);
  assert.equal(mission.wrapBody(), false, 'the jewellery is still on the carpet');

  assert.equal(mission.completeCleanup('missing_evidence'), true);
  bodyOutOfTheBuilding(mission);
  assert.equal(mission.completeCleanup('final_sweep'), true);
});

test('nothing but Lou can hand out the final evidence sweep', () => {
  const mission = missionInCleanup();
  for (const task of mission.roomTasks) mission.completeCleanup(task);
  assert.equal(mission.debriefLou(), false, 'there is still a body in the room');
  assert.equal(mission.wrapBody(), true);
  assert.equal(mission.debriefLou(), false, 'the body is wrapped and still in the room');
  assert.equal(mission.carryBody(), true);
  assert.equal(mission.debriefLou(), false, 'the body is in his arms, not in the trunk');
  assert.equal(mission.assign('reserve_pickup'), true);
  assert.equal(mission.objectives.some((o) => o.id === 'cleanup.final_sweep'), false);
  assert.equal(mission.debriefLou(), true);
  assert.ok(mission.objectives.some((o) => o.id === 'cleanup.final_sweep'));
  assert.equal(mission.debriefLou(), false, 'he only asks once');
});

test('the club cannot be left until the sweep and the cutscene are both done', () => {
  const mission = missionInCleanup();
  for (const task of mission.roomTasks) mission.completeCleanup(task);
  bodyOutOfTheBuilding(mission);
  assert.equal(mission.beginDeparture(), false, 'the sweep is still outstanding');
  assert.equal(mission.finish(), false);
  assert.equal(mission.completeCleanup('final_sweep'), true);
  assert.equal(mission.beginDeparture(), true);
  assert.equal(mission.beginDeparture(), false, 'the leave objective is added once');
  assert.equal(mission.finish(), 'graveyard');
});

test('the cleanup order is published so a caller can say what is still owed', () => {
  assert.deepEqual(pendingCleanupPrerequisites('final_sweep', new Set()),
    ['bathrooms', 'cleaning_kit', 'missing_evidence']);
  assert.deepEqual(
    pendingCleanupPrerequisites('final_sweep', new Set(['bathrooms', 'missing_evidence'])),
    ['cleaning_kit'],
  );
  assert.deepEqual(pendingCleanupPrerequisites('final_sweep', new Set(SECOND_VISIT_CLEANUP_TASKS)), []);
  // The other three are free-order: the player finds them in whatever order
  // the club sends him round it.
  for (const task of ['bathrooms', 'cleaning_kit', 'missing_evidence']) {
    assert.deepEqual(pendingCleanupPrerequisites(task, new Set()), [], task);
  }
});

test('the authored cleanup order ends on the final sweep', () => {
  assert.equal(SECOND_VISIT_CLEANUP_TASKS.at(-1), 'final_sweep',
    'callers that walk the authored list in order must still be walking a legal order');
  const mission = missionInCleanup();
  for (const task of mission.roomTasks) {
    assert.equal(mission.completeCleanup(task), true, task);
  }
  bodyOutOfTheBuilding(mission);
  assert.equal(mission.completeCleanup('final_sweep'), true);
  assert.deepEqual([...mission.cleanup], SECOND_VISIT_CLEANUP_TASKS,
    'the club still banks all four tasks, in the campaign\'s own order');
});
