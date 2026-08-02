import assert from 'node:assert/strict';
import test from 'node:test';

import { SeatedDinnerFlow } from '../src/silver/dinner-flow.js';

test('an overdue table still finishes waiter service and champagne before Ape arrives', () => {
  const flow = new SeatedDinnerFlow({ elapsed: 96, index: 4 });
  const drinksDone = new Set(['drinks']);

  assert.equal(flow.next({ roundsDone: drinksDone }), 'champagne');
  assert.equal(flow.next({ roundsDone: drinksDone }), null);
  assert.equal(flow.next({ roundsDone: drinksDone, champagneComplete: true }), 'family');
});

test('dessert reaches the table at six minutes instead of dragging past seven', () => {
  const flow = new SeatedDinnerFlow({ elapsed: 359, index: 11 });
  assert.equal(flow.next(), null);
  flow.advance(1);
  assert.equal(flow.next(), 'dessert');
});

test('the see-again question follows dessert instead of being hidden on a key', () => {
  const flow = new SeatedDinnerFlow({ elapsed: 366, index: 12 });
  assert.equal(flow.next({ invitationReady: true }), null);
  assert.equal(flow.next({ dessertComplete: true, invitationReady: true }), 'invitation');
});
