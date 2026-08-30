import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INITIATION_CABIN_PROCESSION,
  INITIATION_CABIN_REQUIRED_AT_MARK,
  INITIATION_PROCESSION_PHASES,
  INITIATION_PROCESSION_POLICY,
  INITIATION_TRAIL_BEATS,
  INITIATION_TRAIL_FORMATION,
  cabinProcessionRoute,
  formationTarget,
  trailNarrativeStatus,
} from '../src/initiation/trail-formation.js';
import { PHASES } from '../src/initiation/phases.js';

test('the Circle walks in loose pairs instead of one centre-line conga', () => {
  assert.equal(INITIATION_TRAIL_FORMATION.length, 15);
  assert.equal(new Set(INITIATION_TRAIL_FORMATION.map(({ key }) => key)).size, 15);

  const pairedRows = new Map();
  for (const member of INITIATION_TRAIL_FORMATION) {
    assert.ok(Math.abs(member.lateral) <= 0.65, `${member.key} leaves the trail corridor`);
    assert.ok(member.speed >= 3 && member.speed <= 3.5, `${member.key} has an implausible walking speed`);
    const key = member.along.toFixed(3);
    pairedRows.set(key, [...(pairedRows.get(key) ?? []), member]);
  }
  assert.ok([...pairedRows.values()].filter((row) => row.length === 2).length >= 6,
    'the formation has no side-by-side pairs');
  for (const row of pairedRows.values().filter((members) => members.length === 2)) {
    assert.ok(row[0].lateral * row[1].lateral < 0,
      `${row.map(({ key }) => key).join('/')} occupy the same side of their row`);
  }
});

test('lateral formation offsets are perpendicular to the path heading', () => {
  const east = formationTarget({ x: 4, z: 8, heading: Math.PI / 2 }, 0.6);
  assert.ok(Math.abs(east.x - 4) < 1e-9);
  assert.ok(Math.abs(east.z - 7.4) < 1e-9);

  const north = formationTarget({ x: 4, z: 8, heading: 0 }, -0.6);
  assert.ok(Math.abs(north.x - 3.4) < 1e-9);
  assert.ok(Math.abs(north.z - 8) < 1e-9);
});

test('the trail procession uses one configured pacing policy in every phase', () => {
  assert.deepEqual(INITIATION_TRAIL_BEATS.map(({ id }) => id),
    ['IN-210', 'IN-220', 'IN-230', 'IN-240']);
  assert.deepEqual(INITIATION_TRAIL_BEATS.map(({ at }) => at), [0.16, 0.34, 0.50, 0.64]);
  assert.ok(INITIATION_PROCESSION_POLICY.moveScale > 0.7
    && INITIATION_PROCESSION_POLICY.moveScale < 0.85);
  assert.equal(INITIATION_PROCESSION_POLICY.allowSprint, false);
  assert.equal(INITIATION_PROCESSION_POLICY.dialogueTiming, 'recorded');

  for (const id of INITIATION_PROCESSION_PHASES) {
    assert.equal(PHASES[id].moveScale, INITIATION_PROCESSION_POLICY.moveScale, `${id} speed drifted`);
    assert.equal(PHASES[id].allowSprint, false, `${id} allows sprint past dialogue`);
    assert.equal(PHASES[id].dialogueTiming, 'recorded', `${id} stopped following delivered VO`);
  }
  assert.equal(PHASES.cabin_door.moveScale, 1, 'normal movement was not restored at the porch');
  assert.equal(PHASES.cabin_door.allowSprint, true, 'sprint remained globally disabled after procession');
});

test('cabin narrative gate requires every marker and a completed choice reply', () => {
  const all = INITIATION_TRAIL_BEATS.map(({ id }) => id);
  const missingBeat = trailNarrativeStatus({
    firedBeatIds: all.slice(0, -1),
    choiceUsed: true,
    choiceResolved: true,
  });
  assert.equal(missingBeat.storyComplete, false);
  assert.deepEqual(missingBeat.pendingBeatIds, ['IN-240']);

  const openReply = trailNarrativeStatus({
    firedBeatIds: all,
    choiceUsed: true,
    choiceResolved: false,
    dialogActive: true,
  });
  assert.equal(openReply.storyComplete, false, 'opening a choice was mistaken for finishing its reply');
  assert.equal(openReply.readyForCabin, false);

  const complete = trailNarrativeStatus({
    firedBeatIds: all,
    choiceUsed: true,
    choiceResolved: true,
  });
  assert.equal(complete.storyComplete, true);
  assert.equal(complete.readyForCabin, true);
  assert.deepEqual(complete.pendingBeatIds, []);
  assert.deepEqual(complete.firedBeatIds, all);

  const unrelatedDialogue = trailNarrativeStatus({
    firedBeatIds: all,
    choiceUsed: true,
    choiceResolved: true,
    dialogActive: true,
  });
  assert.equal(unrelatedDialogue.storyComplete, true,
    'completed trail story regressed when later cabin dialogue began');
  assert.equal(unrelatedDialogue.readyForCabin, false,
    'the transient cabin gate ignored live dialogue');
});

test('every family member takes a measured route through the one cabin doorway', () => {
  assert.equal(INITIATION_CABIN_PROCESSION.length, 15);
  assert.equal(new Set(INITIATION_CABIN_PROCESSION).size, 15);
  assert.deepEqual(INITIATION_CABIN_REQUIRED_AT_MARK, ['LOU', 'RIPPINFLOW', 'BOOSKIBRO']);

  const door = { x: 24, frontZ: 21.8, outsideZ: 20.4 };
  for (let index = 0; index < INITIATION_CABIN_PROCESSION.length; index += 1) {
    const final = { x: 19 + index * 0.55, z: 23 + (index % 3), heading: index / 10 };
    const route = cabinProcessionRoute({ door, final, index });
    assert.deepEqual(route.map(({ stage }) => stage), ['queue', 'porch', 'threshold', 'fan', 'mark']);
    assert.equal(route[2].x, door.x, 'the threshold must stay on the door centreline');
    assert.ok(route[2].z > door.frontZ, 'the threshold waypoint never enters the room');
    assert.deepEqual(route.at(-1), { ...final, stage: 'mark' });
  }
});
