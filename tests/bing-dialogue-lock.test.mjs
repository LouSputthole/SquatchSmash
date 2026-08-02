import assert from 'node:assert/strict';
import test from 'node:test';

import { Dialogue } from '../src/bing/dialogue.js';

function classList() {
  return { add() {}, remove() {} };
}

function ui() {
  return {
    root: { classList: classList() },
    name: { textContent: '' },
    line: { innerHTML: '' },
    options: { classList: classList(), replaceChildren() {} },
  };
}

const tree = {
  brief: { line: 'Listen close.', hold: 30 },
  handoff: { line: 'Now take the package.', hold: 30 },
};

test('a locked Bing briefing stays locked across an implicit dialogue handoff', () => {
  const movement = [];
  const dialogue = new Dialogue(ui(), {
    onMovementLock: (locked) => movement.push(locked),
  });

  dialogue.start(tree, 'brief', null, { lockMovement: true });
  dialogue.start(tree, 'handoff');

  assert.equal(dialogue.lockMovement, true);
  assert.deepEqual(movement, [true]);

  dialogue.end();
  assert.equal(dialogue.lockMovement, false);
  assert.deepEqual(movement, [true, false]);
});

test('an explicit unlocked handoff releases a Bing briefing exactly once', () => {
  const movement = [];
  const dialogue = new Dialogue(ui(), {
    onMovementLock: (locked) => movement.push(locked),
  });

  dialogue.start(tree, 'brief', null, { lockMovement: true });
  dialogue.start(tree, 'handoff', null, { lockMovement: false });

  assert.equal(dialogue.lockMovement, false);
  assert.deepEqual(movement, [true, false]);
});

test('a dynamic dialogue hold resolves to seconds instead of becoming a stuck timer', () => {
  let holdCalls = 0;
  const dialogue = new Dialogue(ui());
  dialogue.start({
    callback: {
      line: null,
      hold: () => { holdCalls++; return 1.25; },
      next: null,
    },
  }, 'callback');

  assert.equal(holdCalls, 1);
  assert.equal(dialogue.timer, 1.25);
  dialogue.update(1.0);
  assert.equal(dialogue.active, true);
  dialogue.update(0.3);
  assert.equal(dialogue.active, false);
  assert.equal(dialogue.lastEndReason, 'done');
});
