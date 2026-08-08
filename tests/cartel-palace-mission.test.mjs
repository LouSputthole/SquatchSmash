import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WEAPON_IDS } from '../src/core/weapons/catalog.js';

import {
  CartelPalaceMission,
  EVIDENCE_IDS,
  PALACE_BEATS,
} from '../src/cartel-palace/mission.js';
import { buildCartelPalace, PALACE_ANCHORS } from '../src/cartel-palace/world.js';
import { buildPalaceCast, PALACE_GUARD_POSTS } from '../src/cartel-palace/cast.js';
import { PalaceSecurity } from '../src/cartel-palace/security.js';
import {
  PALACE_PREVIEW_CHECKPOINTS,
  previewPalaceCheckpointForLocation,
  previewSnapshotForCheckpoint,
} from '../src/cartel-palace/preview.js';

test('the palace begins as a rescue at the quiet estate approach', () => {
  const objectives = [];
  const mission = new CartelPalaceMission({
    onObjective: (objective) => objectives.push(objective),
  });

  assert.equal(mission.begin(), true);
  assert.equal(mission.beat, PALACE_BEATS.APPROACH);
  assert.equal(mission.snapshot().rescueCoverIntact, true);
  assert.match(objectives.at(-1).text, /reach the service gate/i);
});

test('Sauce is revealed by the complete environmental evidence trail, not at the gate', () => {
  const reveals = [];
  const mission = new CartelPalaceMission({ onReveal: (facts) => reveals.push(facts) });
  mission.begin();

  assert.equal(mission.collectEvidence(EVIDENCE_IDS.BELONGINGS), false,
    'evidence inside the estate cannot be collected from the approach');
  assert.equal(mission.enterPerimeter({ powerCut: true }), true);
  assert.equal(mission.enterEstate(), true);
  assert.equal(mission.snapshot().rescueCoverIntact, true);

  assert.equal(mission.collectEvidence(EVIDENCE_IDS.BELONGINGS), true);
  assert.equal(mission.collectEvidence(EVIDENCE_IDS.PAYMENT_LEDGER), true);
  assert.equal(mission.snapshot().rescueCoverIntact, true,
    'two suspicious facts do not announce the betrayal');
  assert.equal(mission.collectEvidence(EVIDENCE_IDS.SECURITY_STILL), true);

  const state = mission.snapshot();
  assert.equal(state.beat, PALACE_BEATS.BETRAYAL);
  assert.equal(state.rescueCoverIntact, false);
  assert.equal(state.sauceBetrayalConfirmed, true);
  assert.deepEqual(state.evidenceFound, Object.values(EVIDENCE_IDS));
  assert.deepEqual(reveals, [{
    evidenceFound: Object.values(EVIDENCE_IDS),
    sauceBetrayalConfirmed: true,
  }]);
});

function reachDiningRoom(mission) {
  mission.begin();
  mission.enterPerimeter({ powerCut: true });
  mission.enterEstate();
  for (const id of Object.values(EVIDENCE_IDS)) mission.collectEvidence(id);
  assert.equal(mission.enterDiningRoom(), true);
}

test('the final room is a two-target boss encounter and cannot clear early', () => {
  const completions = [];
  const mission = new CartelPalaceMission({ onComplete: (report) => completions.push(report) });
  reachDiningRoom(mission);

  assert.equal(mission.registerTargetDown('mark'), true);
  assert.equal(mission.extract(), false, 'Mark alone is not mission completion');
  assert.equal(mission.registerTargetDown('sauce'), true);
  assert.equal(mission.beat, PALACE_BEATS.CLEAR);
  assert.equal(mission.extract(), true);
  assert.deepEqual(completions, [{
    evidenceFound: Object.values(EVIDENCE_IDS),
    sauceBetrayalConfirmed: true,
    markEliminated: true,
    sauceEliminated: true,
    outcome: 'clean',
  }]);
});

test('raising the alarm preserves completion but records the hard exit', () => {
  const mission = new CartelPalaceMission();
  mission.begin();
  assert.equal(mission.raiseAlarm('guard_contact'), true);
  mission.enterPerimeter();
  mission.enterEstate();
  for (const id of Object.values(EVIDENCE_IDS)) mission.collectEvidence(id);
  mission.enterDiningRoom();
  mission.registerTargetDown('mark');
  mission.registerTargetDown('sauce');

  assert.equal(mission.snapshot().outcome, 'hard_exit');
});

test('a campaign checkpoint resumes the evidence trail without duplicating facts', () => {
  const mission = new CartelPalaceMission();
  assert.equal(mission.restore({
    status: 'in_progress',
    checkpoint: 'estate',
    powerCut: true,
    evidenceFound: [EVIDENCE_IDS.BELONGINGS, EVIDENCE_IDS.BELONGINGS, 'not_evidence'],
  }), true);

  assert.equal(mission.beat, PALACE_BEATS.ESTATE);
  assert.equal(mission.snapshot().powerCut, true);
  assert.deepEqual(mission.snapshot().evidenceFound, [EVIDENCE_IDS.BELONGINGS]);
  assert.equal(mission.collectEvidence(EVIDENCE_IDS.BELONGINGS), false);
  assert.equal(mission.collectEvidence(EVIDENCE_IDS.PAYMENT_LEDGER), true);
  assert.equal(mission.collectEvidence(EVIDENCE_IDS.SECURITY_STILL), true);
  assert.equal(mission.beat, PALACE_BEATS.BETRAYAL);
});

test('partial evidence, alarm, and one-target progress emit durable checkpoint facts immediately', () => {
  const checkpoints = [];
  const mission = new CartelPalaceMission({
    onCheckpoint: (checkpoint, facts) => checkpoints.push({ checkpoint, facts }),
  });
  mission.begin();
  mission.enterPerimeter({ powerCut: true });
  mission.enterEstate();

  mission.collectEvidence(EVIDENCE_IDS.BELONGINGS);
  assert.deepEqual(checkpoints.at(-1), {
    checkpoint: PALACE_BEATS.ESTATE,
    facts: {
      evidenceFound: [EVIDENCE_IDS.BELONGINGS],
      sauceBetrayalConfirmed: false,
      alarmRaised: false,
      alarmReason: null,
      markEliminated: false,
      sauceEliminated: false,
      outcome: null,
    },
  });

  mission.raiseAlarm('guard_contact');
  assert.equal(checkpoints.at(-1).facts.alarmRaised, true);
  assert.equal(checkpoints.at(-1).facts.alarmReason, 'guard_contact');

  mission.collectEvidence(EVIDENCE_IDS.PAYMENT_LEDGER);
  mission.collectEvidence(EVIDENCE_IDS.SECURITY_STILL);
  mission.enterDiningRoom();
  mission.registerTargetDown('mark');
  assert.equal(checkpoints.at(-1).checkpoint, PALACE_BEATS.DINING_ROOM);
  assert.equal(checkpoints.at(-1).facts.markEliminated, true);
  assert.equal(checkpoints.at(-1).facts.sauceEliminated, false);
  assert.equal(checkpoints.at(-1).facts.alarmRaised, true);
});

test('hard-exit outcome remains hard after clear is restored and extracted', () => {
  let clear = null;
  const first = new CartelPalaceMission({
    onCheckpoint: (checkpoint, facts) => {
      if (checkpoint === PALACE_BEATS.CLEAR) clear = { checkpoint, ...facts };
    },
  });
  reachDiningRoom(first);
  first.raiseAlarm('gunshot');
  first.registerTargetDown('mark');
  first.registerTargetDown('sauce');
  assert.equal(clear.outcome, 'hard_exit');

  const completions = [];
  const reloaded = new CartelPalaceMission({
    onComplete: (report) => completions.push(report),
  });
  assert.equal(reloaded.restore({ status: 'in_progress', ...clear }), true);
  assert.equal(reloaded.beat, PALACE_BEATS.CLEAR);
  assert.equal(reloaded.snapshot().alarmRaised, true);
  assert.equal(reloaded.snapshot().outcome, 'hard_exit');
  assert.equal(reloaded.extract(), true);
  assert.equal(completions[0].outcome, 'hard_exit');
});

test('a legacy clear checkpoint with no outcome replays the unresolved dining room', () => {
  const mission = new CartelPalaceMission();
  assert.equal(mission.restore({
    status: 'in_progress',
    checkpoint: 'clear',
    evidenceFound: Object.values(EVIDENCE_IDS),
    sauceBetrayalConfirmed: true,
    markEliminated: true,
    sauceEliminated: true,
    outcome: null,
  }), true);
  assert.equal(mission.beat, PALACE_BEATS.DINING_ROOM);
  assert.equal(mission.snapshot().markEliminated, false);
  assert.equal(mission.snapshot().sauceEliminated, false);
  assert.equal(mission.snapshot().outcome, null);
});

test('the palace is its own traversable compound with every clue physically staged', () => {
  const scene = new THREE.Scene();
  const world = buildCartelPalace(scene);

  assert.equal(world.root.name, 'cartel-palace.compound');
  assert.ok(world.colliders.length >= 20, 'walls, gates, rooms, furniture, and cover are solid');
  assert.deepEqual(Object.keys(world.evidence).sort(), Object.values(EVIDENCE_IDS).sort());
  for (const [id, target] of Object.entries(world.evidence)) {
    assert.equal(target.userData.evidenceId, id);
    const at = target.getWorldPosition(new THREE.Vector3());
    assert.ok(at.distanceTo(PALACE_ANCHORS.estate) < 38, `${id} is inside the estate route`);
  }
  assert.ok(PALACE_ANCHORS.approach.z > PALACE_ANCHORS.perimeter.z);
  assert.ok(PALACE_ANCHORS.perimeter.z > PALACE_ANCHORS.diningRoom.z,
    'the route gets steadily deeper instead of reusing one room');
  assert.notEqual(world.materialLanguage, 'mansion', 'this is not Lou\'s house recolored');
  assert.ok(world.lights.length >= 8, 'each route section has an authored practical light');
  assert.ok(world.lights.every((light) => light.intensity >= 4),
    'night interiors remain readable instead of rendering as black geometry');
});

test('Mark is a real armored boss and Sauce waits armed at his table', () => {
  const root = new THREE.Group();
  const cast = buildPalaceCast(root);

  assert.equal(cast.guards.length, PALACE_GUARD_POSTS.length);
  assert.ok(cast.guards.length >= 7, 'the infiltration has a defended route');
  assert.ok(cast.mark.actor.maxHealth >= 400);
  assert.ok(cast.mark.actor.armor >= 140);
  assert.equal(cast.mark.role, 'boss');
  assert.equal(cast.sauce.role, 'traitor');
  assert.equal(cast.sauce.armed, true);
  assert.ok(cast.sauce.root.position.distanceTo(PALACE_ANCHORS.sauce) < 0.01);
  assert.ok(cast.mark.root.position.distanceTo(PALACE_ANCHORS.mark) < 0.01);
});

test('cutting power materially helps stealth and a silent takedown does not raise the alarm', () => {
  const cast = buildPalaceCast(new THREE.Group());
  const alarms = [];
  const security = new PalaceSecurity({ cast, colliders: [], onAlarm: (reason) => alarms.push(reason) });
  const gateGuard = cast.guards[0];
  const player = new THREE.Vector3(gateGuard.root.position.x, 0, gateGuard.root.position.z - 8);

  assert.equal(security.canSee(gateGuard, player, { powerCut: false, crouching: false }), true);
  assert.equal(security.canSee(gateGuard, player, { powerCut: true, crouching: true }), false);
  assert.equal(security.silentTakedown(gateGuard.id, { distance: 1.7 }), true);
  assert.equal(gateGuard.down, true);
  assert.deepEqual(alarms, []);

  assert.equal(security.applyPlayerShot(cast.guards[1].root, WEAPON_IDS.PISTOL9).applied, true);
  assert.deepEqual(alarms, ['gunshot']);
});

test('palace preview checkpoints are bounded and cannot activate in a saved campaign', () => {
  assert.deepEqual(PALACE_PREVIEW_CHECKPOINTS, [
    'approach', 'perimeter', 'estate', 'betrayal', 'dining_room', 'clear',
  ]);
  assert.equal(previewPalaceCheckpointForLocation({
    pathname: '/cartel-palace.html', search: '?preview=1&checkpoint=dining_room',
  }), 'dining_room');
  assert.equal(previewPalaceCheckpointForLocation({
    pathname: '/cartel-palace.html', search: '?checkpoint=dining_room',
  }), null);
  assert.equal(previewPalaceCheckpointForLocation({
    pathname: '/cartel-palace.html', search: '?preview=1&checkpoint=wrong',
  }), 'approach');
  assert.equal(previewSnapshotForCheckpoint('betrayal').sauceBetrayalConfirmed, true);
});
