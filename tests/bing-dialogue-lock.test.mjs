import assert from 'node:assert/strict';
import test from 'node:test';

import { Dialogue } from '../src/bing/dialogue.js';

function classList() {
  const values = new Set(['hidden']);
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); },
  };
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

test('a reply-only dialogue node makes its choices visible', () => {
  const priorDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ className: '', innerHTML: '' }),
  };
  const nodes = ui();
  const dialogue = new Dialogue(nodes);
  dialogue.start({
    choose: {
      line: null,
      options: [{ text: 'Tell me why.', next: null }],
    },
  }, 'choose');

  assert.equal(dialogue.active, true);
  assert.equal(dialogue.options.length, 1);
  assert.equal(nodes.root.classList.contains('hidden'), false,
    'the dialogue panel must open even when the node only contains replies');
  assert.equal(nodes.options.classList.contains('hidden'), false);
  globalThis.document = priorDocument;
});

test('hush() stops the take the current line is being spoken on, once', () => {
  const stopped = [];
  const dialogue = new Dialogue(ui(), {
    onLine: () => ({ audio: {}, source: { stop: () => stopped.push('line') } }),
  });
  dialogue.start(tree, 'brief');

  assert.equal(dialogue.hush(), true);
  assert.deepEqual(stopped, ['line']);
  // The take is released on the first call; a second hush finds nothing.
  assert.equal(dialogue.hush(), false);
  assert.deepEqual(stopped, ['line']);
});

test('walking away hushes the trailing take through the scene onEnd hook', () => {
  const stopped = [];
  const speaker = { name: 'Lou', group: { position: { x: 40, z: 40 } }, say() {} };
  const dialogue = new Dialogue(ui(), {
    onLine: () => ({ audio: {}, source: { stop: () => stopped.push('stopped') } }),
    /* The scenes' convention: every lapse hushes, a completed thread is
     * left to finish its cue hold. */
    onEnd: (reason) => { if (reason !== 'done') dialogue.hush(); },
  });
  dialogue.start(tree, 'brief', speaker);
  assert.deepEqual(stopped, []);

  dialogue.update(0.016, { x: 0, z: 0 }); // far outside conversation range
  assert.equal(dialogue.lastEndReason, 'walked-away');
  assert.deepEqual(stopped, ['stopped'],
    'the recording must stop when the conversation lapses, not just the subtitle');
});

test('a thread that runs to done is not hushed by the lapse convention', () => {
  const stopped = [];
  const dialogue = new Dialogue(ui(), {
    onLine: () => ({ audio: {}, source: { stop: () => stopped.push('stopped') } }),
    onEnd: (reason) => { if (reason !== 'done') dialogue.hush(); },
  });
  dialogue.start({ brief: { line: 'Listen close.', hold: 0.5, next: null } }, 'brief');
  dialogue.update(1.0);

  assert.equal(dialogue.active, false);
  assert.equal(dialogue.lastEndReason, 'done');
  assert.deepEqual(stopped, [], 'a finished line has had its full cue hold already');
});

test("a chosen reply's take replaces the node's as what hush() stops", () => {
  const priorDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ className: '', innerHTML: '' }),
  };
  const stopped = [];
  const takeFor = (tag) => ({ audio: {}, source: { stop: () => stopped.push(tag) } });
  const dialogue = new Dialogue(ui(), {
    onLine: () => takeFor('line'),
    onChoice: () => takeFor('reply'),
  });
  dialogue.start({
    ask: {
      line: 'Well?',
      options: [{ text: 'Fine.', next: null }],
    },
  }, 'ask');
  assert.equal(dialogue.choose(0), true);

  assert.equal(dialogue.hush(), true);
  assert.deepEqual(stopped, ['reply'],
    'after a reply is chosen, hush() must stop the reply, not the finished node line');
  globalThis.document = priorDocument;
});
