import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

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

test('conversation range follows a speaker parented under a moving vehicle', () => {
  const scene = new THREE.Scene();
  const vehicle = new THREE.Group();
  vehicle.position.set(40, 0, -12);
  const anchor = new THREE.Group();
  anchor.position.set(0.5, 0.8, -0.3);
  const body = new THREE.Group();
  vehicle.add(anchor);
  anchor.add(body);
  scene.add(vehicle);
  const speaker = { name: 'Lou', group: body, say() {} };
  const dialogue = new Dialogue(ui());
  dialogue.start(tree, 'brief', speaker);

  dialogue.update(0.016, { x: 40.5, z: -12.3 });
  assert.equal(dialogue.active, true,
    'seat-local coordinates made a nearby moving speaker look forty metres away');

  vehicle.position.x += 20;
  dialogue.update(0.016, { x: 40.5, z: -12.3 });
  assert.equal(dialogue.lastEndReason, 'walked-away');
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

/* ================================================================== */
/* The subtitle belongs to the conversation on screen                  */
/*                                                                     */
/* Golf runs this class, and its tee talk is built out of reply-only   */
/* nodes (`line: null`, options underneath). The panel used to be       */
/* written to and never cleared, so hole two's chosen reply outlived     */
/* the conversation it belonged to and reappeared over hole three's      */
/* fresh question -- text the player had not said, in a hole he had not  */
/* answered yet, with no audio behind it because no live choose() ever   */
/* fired. Both halves are pinned here: end() empties the panel, and a    */
/* node with no line of its own refuses to inherit one.                  */
/* ================================================================== */

function stubDocument() {
  const prior = globalThis.document;
  globalThis.document = { createElement: () => ({ className: '', innerHTML: '' }) };
  return () => { globalThis.document = prior; };
}

const teeTalk = (question) => ({
  answer: {
    line: null,
    options: [{ text: question, next: 'beat' }],
  },
  // The follow-up beats golf authors after a tee answer: no line of their own.
  beat: { line: null, next: null },
});

test('a finished conversation leaves no subtitle behind for the next one', () => {
  const restore = stubDocument();
  const nodes = ui();
  const dialogue = new Dialogue(nodes);

  dialogue.start(teeTalk('I am cutting the corner.'), 'answer');
  assert.equal(dialogue.choose(0), true);
  assert.equal(nodes.line.innerHTML, 'I am cutting the corner.');
  assert.equal(nodes.name.textContent, 'PROSPECT');

  dialogue.end();
  assert.equal(nodes.root.classList.contains('hidden'), true);
  assert.equal(nodes.line.innerHTML, '', 'the hidden panel must not still hold the last reply');
  assert.equal(nodes.name.textContent, '', 'nor the last speaker');
  restore();
});

test('a reply-only node opens on an empty subtitle, not the previous hole\'s answer', () => {
  const restore = stubDocument();
  const nodes = ui();
  const dialogue = new Dialogue(nodes);

  // Hole two: the player answers, and the conversation ends on that reply.
  dialogue.start(teeTalk('I am cutting the corner.'), 'answer');
  dialogue.choose(0);
  dialogue.end();

  // Hole three opens its own tee talk, which is options with no line.
  dialogue.start(teeTalk('I am laying up.'), 'answer');
  assert.equal(nodes.root.classList.contains('hidden'), false, 'the new question must be answerable');
  assert.equal(dialogue.options.length, 1);
  assert.equal(nodes.line.innerHTML, '',
    'a node with no line of its own must not show the previous conversation\'s reply');
  assert.equal(nodes.name.textContent, '');
  restore();
});

test('an interrupting tree cannot inherit the interrupted line', () => {
  const restore = stubDocument();
  const nodes = ui();
  const dialogue = new Dialogue(nodes);

  dialogue.start(tree, 'brief');
  assert.equal(nodes.line.innerHTML, 'Listen close.');

  // No end() at all: one tree cuts straight over another.
  dialogue.start(teeTalk('I am cutting the corner.'), 'answer');
  assert.equal(nodes.line.innerHTML, '');
  assert.equal(nodes.name.textContent, '');
  restore();
});

test('a spoken node still paints its own line and speaker', () => {
  const nodes = ui();
  const dialogue = new Dialogue(nodes);
  dialogue.start(tree, 'brief', { name: 'Lou', group: { position: { x: 0, z: 0 } }, say() {} });

  assert.equal(nodes.line.innerHTML, 'Listen close.');
  assert.equal(nodes.name.textContent, 'LOU');
  assert.equal(nodes.root.classList.contains('hidden'), false);
});

test('a node with neither a line nor a reply puts the panel away', () => {
  const nodes = ui();
  const dialogue = new Dialogue(nodes);
  dialogue.start({
    said: { line: 'That is the last of it.', hold: 0.2, next: 'pause' },
    pause: { line: null, hold: 5, next: null },
  }, 'said');
  assert.equal(nodes.root.classList.contains('hidden'), false);

  dialogue.update(0.3);
  assert.equal(dialogue.nodeId, 'pause');
  assert.equal(nodes.root.classList.contains('hidden'), true,
    'an empty panel is worse than no panel');
  assert.equal(nodes.line.innerHTML, '');
});
