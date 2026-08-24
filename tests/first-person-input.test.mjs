import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIRST_PERSON_CAPTURE_MODES,
  FIRST_PERSON_MOVEMENT_CODES,
  createFirstPersonInput,
} from '../src/core/first-person-input.js';

class FakeTarget {
  constructor() { this.listeners = new Map(); this.options = new Map(); }
  addEventListener(type, listener, options = false) {
    const entries = this.listeners.get(type) ?? new Set();
    entries.add(listener);
    this.listeners.set(type, entries);
    this.options.set(type, options);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  listenerCount(type) { return this.listeners.get(type)?.size ?? 0; }
  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function fixture(options = {}) {
  const { canvasRequestPointerLock = null, ...inputOptions } = options;
  const windowTarget = new FakeTarget();
  const documentTarget = new FakeTarget();
  const canvas = new FakeTarget();
  documentTarget.pointerLockElement = null;
  documentTarget.exitPointerLock = () => {
    documentTarget.pointerLockElement = null;
    documentTarget.emit('pointerlockchange');
  };
  canvas.lockRequests = 0;
  canvas.requestPointerLock = () => {
    canvas.lockRequests += 1;
    return canvasRequestPointerLock?.();
  };
  const calls = { keys: [], clears: 0, looks: [], presses: 0, releases: 0, cancels: 0 };
  const player = {
    enabled: false,
    setKey: (code, down) => calls.keys.push([code, down]),
    clearKeys: () => { calls.clears += 1; },
    handleMouseMove: (x, y) => calls.looks.push([x, y]),
  };
  const interaction = {
    press: () => { calls.presses += 1; },
    release: () => { calls.releases += 1; },
    cancel: () => { calls.cancels += 1; },
  };
  const input = createFirstPersonInput({
    player, canvas, interaction, documentTarget, windowTarget,
    translateKey: (code) => (code === 'ArrowUp' ? 'KeyW' : code),
    ...inputOptions,
  });
  return { input, player, canvas, documentTarget, windowTarget, calls };
}

test('the shared Adapter owns the complete first-person movement vocabulary', () => {
  assert.deepEqual(FIRST_PERSON_MOVEMENT_CODES, [
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyC', 'Space',
  ]);
});

test('keyboard capture is an explicit Adapter option for focused flight UI', () => {
  const f = fixture({ keyboardCapture: true });
  assert.equal(f.windowTarget.options.get('keydown'), true);
  assert.equal(f.windowTarget.options.get('keyup'), true);
  f.input.destroy();
});

test('pointer lock is the single enable seam for translated movement and look', () => {
  const f = fixture();
  assert.equal(f.player.enabled, false);
  f.canvas.emit('mousedown', { button: 0, target: f.canvas });
  assert.equal(f.canvas.lockRequests, 1);

  f.documentTarget.pointerLockElement = f.canvas;
  f.documentTarget.emit('pointerlockchange');
  assert.equal(f.player.enabled, true);

  let prevented = 0;
  f.windowTarget.emit('keydown', { code: 'ArrowUp', preventDefault: () => { prevented += 1; } });
  f.windowTarget.emit('mousemove', { movementX: 8, movementY: -3 });
  f.windowTarget.emit('keyup', { code: 'ArrowUp' });
  assert.deepEqual(f.calls.keys, [['KeyW', true], ['KeyW', false]]);
  assert.deepEqual(f.calls.looks, [[8, -3]]);
  assert.equal(prevented, 1);
  assert.equal(f.input.snapshot().movementPresses, 1);
  assert.equal(f.input.snapshot().lookEvents, 1);
});

test('interaction, pause, focus loss, resume and teardown share the same Adapter', () => {
  const f = fixture();
  f.documentTarget.pointerLockElement = f.canvas;
  f.documentTarget.emit('pointerlockchange');
  f.windowTarget.emit('keydown', { code: 'KeyE', repeat: false });
  assert.equal(f.calls.presses, 1);
  const cancelsBeforeBlur = f.calls.cancels;
  f.windowTarget.emit('blur');
  assert.equal(f.calls.cancels, cancelsBeforeBlur + 1);
  f.windowTarget.emit('keyup', { code: 'KeyE' });
  assert.equal(f.calls.releases, 1);

  const clearsBeforePause = f.calls.clears;
  const cancelsBeforePause = f.calls.cancels;
  f.input.suspend();
  assert.equal(f.player.enabled, false);
  assert.equal(f.documentTarget.pointerLockElement, null);
  assert.ok(f.calls.clears > clearsBeforePause);
  assert.ok(f.calls.cancels > cancelsBeforePause);

  f.input.resume();
  assert.equal(f.canvas.lockRequests, 1);
  const keysBeforeDestroy = f.calls.keys.length;
  const cancelsBeforeDestroy = f.calls.cancels;
  f.input.destroy();
  f.windowTarget.emit('keydown', { code: 'KeyW' });
  assert.equal(f.calls.keys.length, keysBeforeDestroy);
  assert.ok(f.calls.cancels > cancelsBeforeDestroy);
});

test('scene policy handles choices without owning movement plumbing', () => {
  const seen = [];
  const f = fixture({ onKeyDown: (event, state) => seen.push([event.key, state.code, state.enabled]) });
  f.windowTarget.emit('keydown', { code: 'Digit2', key: '2' });
  assert.deepEqual(seen, [['2', 'Digit2', false]]);
});

test('controlState independently gates Player, movement, default look and interaction', () => {
  let policy = {
    playerEnabled: true,
    movementEnabled: false,
    defaultLookEnabled: true,
    interactionEnabled: false,
  };
  const f = fixture({ controlState: () => policy });
  f.documentTarget.pointerLockElement = f.canvas;
  f.documentTarget.emit('pointerlockchange');

  f.windowTarget.emit('keydown', { code: 'KeyW' });
  f.windowTarget.emit('keydown', { code: 'KeyE', repeat: false });
  f.windowTarget.emit('mousemove', { movementX: 4, movementY: 2 });
  assert.equal(f.player.enabled, true);
  assert.deepEqual(f.calls.keys, []);
  assert.equal(f.calls.presses, 0);
  assert.deepEqual(f.calls.looks, [[4, 2]]);

  policy = {
    playerEnabled: false,
    movementEnabled: false,
    lookEnabled: false,
    interactionEnabled: true,
  };
  const controls = f.input.refresh('vehicle-enter');
  f.windowTarget.emit('keydown', { code: 'KeyE', repeat: false });
  f.windowTarget.emit('mousemove', { movementX: 9, movementY: 9 });
  assert.equal(controls.playerEnabled, false);
  assert.equal(controls.interactionEnabled, true);
  assert.equal(f.player.enabled, false);
  assert.equal(f.calls.presses, 1);
  assert.deepEqual(f.calls.looks, [[4, 2]]);
  assert.equal(f.input.snapshot().lastClearReason, 'vehicle-enter');
});

test('pre-default routes can own scene policy while canonical releases remain non-consumable', () => {
  const seen = [];
  let consumeKeyDown = true;
  let consumeKeyUp = true;
  const routes = {
    keyDown: (_event, state) => {
      seen.push(['down', state.code, state.movementEnabled]);
      return consumeKeyDown;
    },
    keyUp: (_event, state) => {
      seen.push(['up', state.code, state.movementEnabled]);
      return consumeKeyUp;
    },
    mouseMove: () => true,
    mouseDown: (event) => {
      seen.push(['mouse-down', event.button]);
      return true;
    },
    mouseUp: (event) => {
      seen.push(['mouse-up', event.button]);
      return true;
    },
  };
  const f = fixture({ routes });
  f.documentTarget.pointerLockElement = f.canvas;
  f.documentTarget.emit('pointerlockchange');

  f.windowTarget.emit('keydown', { code: 'KeyW' });
  f.windowTarget.emit('keyup', { code: 'KeyW' });
  f.windowTarget.emit('mousemove', { movementX: 2, movementY: 1 });
  f.canvas.emit('mousedown', { button: 0, target: f.canvas });
  f.windowTarget.emit('mouseup', { button: 0 });
  assert.deepEqual(f.calls.keys, []);
  assert.deepEqual(f.calls.looks, []);
  assert.equal(f.canvas.lockRequests, 0);

  consumeKeyDown = false;
  f.windowTarget.emit('keydown', { code: 'KeyW' });
  assert.deepEqual(f.calls.keys, [['KeyW', true]]);
  // Although the route consumes key-up, the Adapter must release the default
  // movement press it owns.
  f.windowTarget.emit('keyup', { code: 'KeyW' });
  assert.deepEqual(f.calls.keys, [['KeyW', true], ['KeyW', false]]);
  assert.deepEqual(seen.slice(0, 6), [
    ['down', 'KeyW', true],
    ['up', 'KeyW', true],
    ['mouse-down', 0],
    ['mouse-up', 0],
    ['down', 'KeyW', true],
    ['up', 'KeyW', true],
  ]);
});

test('keyup releases the translation captured on physical keydown after a rebind', () => {
  let rebound = 'KeyW';
  const f = fixture({ translateKey: () => rebound });
  f.documentTarget.pointerLockElement = f.canvas;
  f.documentTarget.emit('pointerlockchange');

  f.windowTarget.emit('keydown', { code: 'KeyZ' });
  rebound = 'KeyD';
  f.windowTarget.emit('keyup', { code: 'KeyZ' });
  assert.deepEqual(f.calls.keys, [['KeyW', true], ['KeyW', false]]);
});

test('pointer-lock-or-drag recovers rejected capture, gates look to a held button, and retries lock', async () => {
  const failures = [];
  const f = fixture({
    captureMode: FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG,
    canvasRequestPointerLock: () => Promise.reject(new Error('denied')),
    onCaptureError: (_error, state) => failures.push([state.reason, state.recovered]),
  });

  f.canvas.emit('mousedown', { button: 0, target: f.canvas });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.input.captured, true);
  assert.equal(f.input.dragFallback, true);
  assert.equal(f.input.dragging, true);
  assert.equal(f.player.enabled, true);
  assert.deepEqual(failures, [['pointer-lock-rejected', true]]);

  f.windowTarget.emit('mousemove', { movementX: 7, movementY: -1 });
  f.windowTarget.emit('mouseup', { button: 0 });
  f.windowTarget.emit('mousemove', { movementX: 20, movementY: 20 });
  assert.deepEqual(f.calls.looks, [[7, -1]]);

  f.canvas.emit('mousedown', { button: 0, target: f.canvas });
  assert.equal(f.canvas.lockRequests, 2, 'fallback clicks must retry real pointer lock');
  f.documentTarget.pointerLockElement = f.canvas;
  f.documentTarget.emit('pointerlockchange');
  assert.equal(f.input.dragFallback, false, 'real capture retires fallback');
  assert.equal(f.input.locked, true);
});

test('one capture attempt reports at most one recovery when error and rejection both arrive', async () => {
  let rejectCapture;
  const failures = [];
  const f = fixture({
    captureMode: FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG,
    canvasRequestPointerLock: () => new Promise((_resolve, reject) => { rejectCapture = reject; }),
    onCaptureError: (_error, state) => failures.push(state.reason),
  });

  f.canvas.emit('mousedown', { button: 0, target: f.canvas });
  f.documentTarget.emit('pointerlockerror', { type: 'pointerlockerror' });
  rejectCapture(new Error('the same attempt was also rejected'));
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(failures, ['pointer-lock-error']);
  assert.equal(f.input.snapshot().pointerLockErrors, 1);
  assert.equal(f.input.dragFallback, true);
});

test('clear lifecycle reports reasons and disables channels through suspend/resume', () => {
  const reasons = [];
  const f = fixture({ onClear: (reason) => reasons.push(reason) });
  f.documentTarget.pointerLockElement = f.canvas;
  f.documentTarget.emit('pointerlockchange');
  f.windowTarget.emit('keydown', { code: 'KeyW' });
  f.windowTarget.emit('blur');
  assert.equal(reasons.at(-1), 'blur');

  f.input.suspend({ exitPointerLock: false });
  assert.equal(reasons.at(-1), 'suspend');
  assert.equal(f.input.snapshot().suspended, true);
  assert.equal(f.player.enabled, false);
  f.input.resume({ requestPointerLock: false });
  assert.equal(f.player.enabled, true);
});

test('destroy is idempotent, detaches the complete event surface, and ignores stale capture failure', async () => {
  let rejectCapture;
  const failures = [];
  const reasons = [];
  const f = fixture({
    captureMode: FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG,
    canvasRequestPointerLock: () => new Promise((_resolve, reject) => { rejectCapture = reject; }),
    onCaptureError: (_error, state) => failures.push(state.reason),
    onClear: (reason) => reasons.push(reason),
  });
  f.canvas.emit('mousedown', { button: 0, target: f.canvas });
  assert.equal(f.input.destroy(), true);
  assert.equal(f.input.destroy(), false);
  rejectCapture(new Error('late denial'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(f.player.enabled, false);
  assert.equal(f.input.resume(), false);
  assert.equal(f.input.requestPointerLock(), false);
  assert.deepEqual(failures, []);
  assert.equal(reasons.filter((reason) => reason === 'destroy').length, 1);
  assert.equal(f.canvas.listenerCount('mousedown'), 0);
  assert.equal(f.documentTarget.listenerCount('pointerlockchange'), 0);
  assert.equal(f.documentTarget.listenerCount('pointerlockerror'), 0);
  for (const type of ['mousemove', 'mouseup', 'keydown', 'keyup', 'blur']) {
    assert.equal(f.windowTarget.listenerCount(type), 0, `${type} listener should be detached`);
  }
});
