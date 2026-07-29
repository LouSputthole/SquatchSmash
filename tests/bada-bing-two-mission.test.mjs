import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SecondVisitMission,
  buildSecondVisitLouScript,
} from '../src/bing/second-visit.js';

test('the second Bing visit reuses the club but has its own assignment flow', () => {
  const objectiveSnapshots = [];
  const mission = new SecondVisitMission({
    onObjective: (objectives) => objectiveSnapshots.push(structuredClone(objectives)),
  });

  assert.equal(mission.state, 'lot');
  assert.equal(mission.readyToLeave, false);
  assert.equal(mission.flags.gotPackage, false);
  assert.deepEqual(mission.objectives, [
    { id: 'lou', text: 'Meet Lou in the back office', done: false },
  ]);

  mission.enteredClub();
  mission.reachedHallway();
  mission.enteredOffice();
  assert.equal(mission.state, 'office');
  assert.equal(mission.objectives.find((objective) => objective.id === 'speak')?.done, false);

  assert.equal(mission.assign('reserve_pickup'), true);
  assert.equal(mission.assignment, 'reserve_pickup');
  assert.equal(mission.readyToLeave, true);
  assert.equal(mission.flags.gotPackage, false);
  assert.equal(mission.state, 'briefed');
  assert.equal(mission.objectives.find((objective) => objective.id === 'speak')?.done, true);
  assert.equal(mission.objectives.find((objective) => objective.id === 'leave')?.done, false);

  mission.leftOffice();
  mission.backInLot();
  assert.equal(mission.state, 'lot-return');
  assert.equal(mission.finish(), 'motel');
  assert.equal(mission.state, 'done');
  assert.equal(mission.objectives.find((objective) => objective.id === 'leave')?.done, true);
  assert.ok(objectiveSnapshots.length >= 5);
});

test('Lou assigns the Motel without pretending to hand over the first package', () => {
  const mission = new SecondVisitMission();
  mission.enteredClub();
  mission.reachedHallway();
  mission.enteredOffice();
  const lou = buildSecondVisitLouScript({ mission });

  assert.match(lou.assignment.line, /Jerky Motel/i);
  assert.match(lou.assignment.line, /room twelve/i);
  assert.equal(mission.readyToLeave, false);
  lou.confirm.enter();
  assert.equal(mission.assignment, 'reserve_pickup');
  assert.equal(mission.readyToLeave, true);
  assert.equal(mission.flags.gotPackage, false);
});
