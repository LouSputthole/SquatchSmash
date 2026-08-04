import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  SECOND_VISIT_CLEANUP_TASKS,
  SecondVisitMission,
  buildHotDogPartySequence,
} from '../src/bing/second-visit.js';
import { createPartyCollider } from '../src/bing/party-collision.js';
import { restoreHotDogCleanupPresentation } from '../src/bing/hotdog-cleanup-presentation.js';
import {
  SHUBENATOR_SIGNATURE_TAKES,
  SHUBENATOR_SIGNATURE_TEXT,
} from '../src/core/shubenator-signature.js';

test('party colliders follow moving props and park themselves when hidden', () => {
  const scene = new THREE.Scene();
  const parent = new THREE.Group();
  const target = new THREE.Group();
  scene.add(parent);
  parent.add(target);
  parent.position.set(2, 0.25, -3);
  target.position.set(1, 0.5, 2);

  const collision = createPartyCollider({
    id: 'test.mover', target, halfX: 0.3, halfZ: 0.2, minY: -0.1, maxY: 1.1,
  });
  assert.equal(collision.active, true);
  assert.deepEqual(collision.snapshot(), {
    active: true,
    min: [2.7, 0.65, -1.2],
    max: [3.3, 1.85, -0.8],
  });

  target.position.x += 2;
  assert.deepEqual(collision.snapshot().min, [4.7, 0.65, -1.2]);

  parent.visible = false;
  assert.equal(collision.active, false);
  assert.ok(collision.box.min.x > 10_000);
});

test('the second Bing visit turns the closed party into a short cleanup mission', () => {
  const objectiveSnapshots = [];
  const mission = new SecondVisitMission({
    onObjective: (objectives) => objectiveSnapshots.push(structuredClone(objectives)),
  });

  assert.equal(mission.state, 'lot');
  assert.equal(mission.readyToLeave, false);
  assert.deepEqual(mission.objectives, [
    { id: 'party', text: 'Join the closed party at the main bar', done: false },
  ]);

  mission.enteredClub();
  assert.equal(mission.state, 'party');
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
  for (const task of SECOND_VISIT_CLEANUP_TASKS) {
    assert.equal(mission.completeCleanup(task), true, task);
  }
  assert.equal(mission.wrapBody(), true);
  assert.equal(mission.assign('reserve_pickup'), true);
  assert.equal(mission.readyToLeave, true);
  assert.equal(mission.finish(), 'graveyard');
  assert.equal(mission.state, 'done');
  assert.equal(mission.objectives.find((objective) => objective.id === 'load')?.done, true);
  assert.ok(objectiveSnapshots.length >= 5);
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
