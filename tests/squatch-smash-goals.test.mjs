import assert from 'node:assert/strict';
import test from 'node:test';

import { GoalTracker, buildGoals } from '../game/src/goals.js';

const FULL_COUNTS = Object.freeze({
  vehicles: 5,
  campsite: 8,
  trees: 60,
  hives: 4,
  gnomes: 6,
  smashable: 120,
});

test('Squatch Smash builds the complete data-driven goal set from the live campground', () => {
  const goals = buildGoals(FULL_COUNTS);

  assert.equal(goals.length, 14);
  assert.equal(goals.find(({ id }) => id === 'timber').target, 40);
  assert.equal(goals.find(({ id }) => id === 'derby').target, FULL_COUNTS.vehicles);
  assert.equal(goals.find(({ id }) => id === 'total').target, FULL_COUNTS.smashable);
  assert.equal(goals.find(({ id }) => id === 'untouchable').endOfRun, true);
});

test('goal progress is monotonic and completion pays exactly once', () => {
  const completed = [];
  const tracker = new GoalTracker(buildGoals(FULL_COUNTS), (goal) => completed.push(goal.id));

  tracker.set('timber', 10);
  tracker.set('timber', 5);
  tracker.bump('timber', 30);
  tracker.bump('timber', 30);

  assert.equal(tracker.get('timber').progress, 40);
  assert.equal(tracker.get('timber').done, true);
  assert.deepEqual(completed, ['timber']);
  assert.equal(tracker.earnedPoints, tracker.get('timber').points);
});

test('a failed end-of-run goal cannot be recovered by settlement', () => {
  const tracker = new GoalTracker(buildGoals(FULL_COUNTS));

  tracker.fail('untouchable');
  const landed = tracker.settle();

  assert.equal(tracker.get('untouchable').failed, true);
  assert.equal(tracker.get('untouchable').done, false);
  assert.equal(landed.some(({ id }) => id === 'untouchable'), false);
});
