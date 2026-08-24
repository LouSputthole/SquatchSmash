import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIRST_PERSON_MOVEMENT_CODES,
  createFirstPersonInput,
} from '../src/core/first-person-input.js';

class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const entries = this.listeners.get(type) ?? new Set();
    entries.add(listener);
    this.listeners.set(type, entries);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function fixture(options = {}) {
  const windowTarget = new FakeTarget();
  const documentTarget = new FakeTarget();
  const canvas = new FakeTarget();
  documentTarget.pointerLockElement = null;
  documentTarget.exitPointerLock = () => {
    documentTarget.pointerLockElement = null;
    documentTarget.emit('pointerlockchange');
  };
  canvas.lockRequests = 0;
  canvas.requestPointerLock = () => { canvas.lockRequests += 1; };
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
    ...options,
  });
  return { input, player, canvas, documentTarget, windowTarget, calls };
}

test('the shared Adapter owns the complete first-person movement vocabulary', () => {
  assert.deepEqual(FIRST_PERSON_MOVEMENT_CODES, [
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyC', 'Space',
  ]);
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
