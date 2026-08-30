import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CabinExecutionChoice,
  EXECUTION_CHOICE_SECONDS,
} from '../src/cabin/execution-choice.js';

test('Cabin execution choice gives exactly ten simulation seconds', () => {
  const outcomes = [];
  const choice = new CabinExecutionChoice({
    onResolve: (result, reason) => outcomes.push({ result, reason }),
  });
  choice.open();
  choice.update(EXECUTION_CHOICE_SECONDS - 0.01);
  assert.equal(choice.active, true);
  choice.update(0.01);
  assert.equal(choice.active, false);
  assert.deepEqual(outcomes, [{ result: 'gratin', reason: 'timeout' }]);
});

test('yes selects Tony and no selects Gratin exactly once', () => {
  const outcomes = [];
  const yes = new CabinExecutionChoice({
    onResolve: (result, reason) => outcomes.push({ result, reason }),
  });
  yes.open();
  assert.equal(yes.handleKey('Digit1'), true);
  assert.equal(yes.handleKey('Digit2'), false);
  assert.deepEqual(outcomes, [{ result: 'player', reason: 'player' }]);

  const no = new CabinExecutionChoice({
    onResolve: (result, reason) => outcomes.push({ result, reason }),
  });
  no.open();
  assert.equal(no.handleKey('Numpad2'), true);
  assert.deepEqual(outcomes.at(-1), { result: 'gratin', reason: 'player' });
});
