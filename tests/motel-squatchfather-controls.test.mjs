import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FIRST_PERSON_CAPTURE_MODES } from '../src/core/first-person-input.js';
import { createMotelInputPolicy } from '../src/motel/controls.js';
import { createSquatchfatherInputPolicy } from '../src/squatchfather/controls.js';

test('Motel policy keeps custom physics actions behind canonical input lifecycle', () => {
  let active = false;
  const held = new Set();
  const calls = { look: [], keys: [], attack: 0, ranged: 0 };
  const policy = createMotelInputPolicy({
    held,
    isGameplayEnabled: () => active,
    look: (dx, dy) => calls.look.push([dx, dy]),
    routeKeyDown: (_event, code) => { calls.keys.push(code); return code === 'KeyE'; },
    attack: () => { calls.attack += 1; },
    ranged: () => { calls.ranged += 1; },
  });
  const options = policy.adapterOptions;
  assert.equal(options.captureMode, FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK);
  assert.equal(options.canEnable(), false);
  assert.equal(options.canHandleInput(), true);

  const prevented = [];
  options.routes.keyDown({ repeat: false, preventDefault: () => prevented.push('W') }, { code: 'KeyW' });
  assert.equal(policy.isDown('up'), false, 'menu movement leaked into gameplay state');
  active = true;
  options.routes.keyDown({ repeat: false, preventDefault: () => prevented.push('W') }, { code: 'KeyW' });
  options.routes.keyDown({ repeat: false, preventDefault() {} }, { code: 'ArrowLeft' });
  assert.equal(policy.isDown('up'), true);
  assert.equal(policy.isDown('turnL'), true);
  assert.deepEqual(prevented, ['W', 'W']);
  options.routes.keyUp({}, { code: 'KeyW' });
  assert.equal(policy.isDown('up'), false);

  assert.equal(options.routes.keyDown({ repeat: false }, { code: 'KeyE' }), true);
  assert.equal(options.routes.keyDown({ repeat: true, preventDefault() {} }, { code: 'KeyE' }), true);
  assert.deepEqual(calls.keys, ['KeyE'], 'browser repeat dispatched a second Motel action');

  options.routes.mouseDown({ button: 0 }, { locked: false });
  options.routes.mouseDown({ button: 0 }, { locked: true });
  options.routes.mouseDown({ button: 2 }, { locked: true });
  assert.deepEqual([calls.attack, calls.ranged], [1, 1]);
  policy.player.handleMouseMove(14, -6);
  assert.deepEqual(calls.look, [[14, -6]]);
  policy.player.clearKeys();
  assert.equal(held.size, 0);
});

test('Squatchfather policy preserves directional, hold-interaction and fire semantics', () => {
  let active = true;
  const keys = { forward: false, back: false, left: false, right: false, e: false };
  const calls = { look: [], press: 0, release: 0, cancel: 0, fire: 0, pause: 0, mute: 0 };
  const primaryControl = {
    press() { calls.press += 1; keys.e = true; },
    release() { calls.release += 1; keys.e = false; },
    cancel() { calls.cancel += 1; keys.e = false; },
  };
  const policy = createSquatchfatherInputPolicy({
    keys,
    isGameplayEnabled: () => active,
    look: (dx, dy) => calls.look.push([dx, dy]),
    primaryControl,
    fire: () => { calls.fire += 1; },
    togglePause: () => { calls.pause += 1; },
    toggleMute: () => { calls.mute += 1; },
  });
  const options = policy.adapterOptions;
  assert.equal(options.captureMode, FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK);

  options.routes.keyDown({ preventDefault() {} }, { code: 'KeyW' });
  options.routes.keyDown({ preventDefault() {} }, { code: 'ArrowLeft' });
  assert.equal(keys.forward, true);
  assert.equal(keys.left, true);
  options.routes.keyUp({}, { code: 'KeyW' });
  assert.equal(keys.forward, false);

  options.routes.keyDown({ repeat: false }, { code: 'KeyE' });
  options.routes.keyDown({ repeat: true }, { code: 'KeyE' });
  assert.equal(calls.press, 1, 'held E dispatched more than one interaction edge');
  assert.equal(keys.e, true);
  options.routes.keyUp({}, { code: 'KeyE' });
  assert.equal(calls.release, 1);
  assert.equal(keys.e, false);

  options.routes.mouseDown({ button: 0 }, { locked: false });
  options.routes.mouseDown({ button: 0 }, { locked: true });
  assert.equal(calls.fire, 1);
  options.routes.keyDown({ repeat: false }, { code: 'Escape' });
  options.routes.keyDown({ repeat: false }, { code: 'KeyM' });
  assert.deepEqual([calls.pause, calls.mute], [1, 1]);
  policy.player.handleMouseMove(9, -4);
  assert.deepEqual(calls.look, [[9, -4]]);

  active = false;
  options.routes.keyDown({ preventDefault() {} }, { code: 'KeyD' });
  assert.equal(keys.right, false, 'paused movement leaked into directional state');
  policy.player.clearKeys();
  assert.deepEqual(
    { forward: keys.forward, back: keys.back, left: keys.left, right: keys.right },
    { forward: false, back: false, left: false, right: false },
  );
});

test('Motel and Squatchfather delegate DOM-to-player browser plumbing to the canonical Adapter', () => {
  for (const [path, policyName] of [
    ['src/motel/main.js', 'createMotelInputPolicy'],
    ['src/squatchfather/main.js', 'createSquatchfatherInputPolicy'],
  ]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /import \{ createFirstPersonInput \} from '\.\.\/core\/first-person-input\.js';/);
    assert.match(source, new RegExp(`const \\w+InputPolicy = ${policyName}\\(\\{`));
    assert.match(source, /browserInput = createFirstPersonInput\(\{/);
    assert.match(source, /browserInput\??\.clear\('pause'\)/);
    assert.match(source, /browserInput\??\.requestPointerLock\(\)/);
    assert.doesNotMatch(
      source,
      /addEventListener\(['"](?:pointerlockchange|pointerlockerror|mousemove|mousedown|mouseup|keydown|keyup|blur)['"]/,
    );
    assert.doesNotMatch(source, /\.requestPointerLock\?\.\(/);
  }
});
