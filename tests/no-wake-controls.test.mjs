import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createNoWakeInputPolicy } from '../src/nowake/controls.js';

const MAIN = fs.readFileSync(new URL('../src/nowake/main.js', import.meta.url), 'utf8');

function fixture(overrides = {}) {
  const calls = [];
  const state = { capture: true, active: true, helm: false, fire: false, target: true };
  const primaryControl = {
    press: () => calls.push('press'),
    release: () => calls.push('release'),
    cancel: () => calls.push('cancel'),
  };
  const helmInput = { setKey: (code, down) => calls.push(`helm:${code}:${down}`) };
  const policy = createNoWakeInputPolicy({
    canCapture: () => state.capture,
    isActive: () => state.active,
    isAtHelm: () => state.helm,
    helmInput,
    primaryControl,
    isReadyToFire: () => state.fire,
    fireExecution: () => calls.push('fire'),
    advanceRadio: () => calls.push('radio'),
    toggleBloom: () => { calls.push('bloom'); return true; },
    showBloom: (enabled) => calls.push(`show:${enabled}`),
    leaveHelm: () => calls.push('leave'),
    hasInteractionTarget: () => state.target,
    explainMissingInteraction: () => calls.push('explain'),
    ...overrides,
  });
  return { calls, state, policy, primaryControl, helmInput };
}

function key(code, { repeat = false } = {}) {
  return { code, repeat, preventDefault() { this.prevented = true; } };
}

test('NO WAKE policy separates captured walking from uncaptured helm keys', () => {
  const f = fixture();
  assert.equal(f.policy.canEnable(), true);
  assert.equal(f.policy.canHandleInput(), true);
  assert.deepEqual(f.policy.controlState(), {
    movementEnabled: true,
    interactionEnabled: true,
  });

  f.state.helm = true;
  assert.deepEqual(f.policy.controlState(), {
    movementEnabled: false,
    interactionEnabled: false,
  });
  const event = key('KeyW');
  assert.equal(f.policy.routes.keyDown(event, { code: 'KeyW' }), true);
  assert.deepEqual(f.calls, ['helm:KeyW:true']);
  assert.equal(event.prevented, true);
});

test('NO WAKE authored hotkeys remain policy while Player defaults pass through', () => {
  const f = fixture();
  assert.equal(f.policy.routes.keyDown(key('KeyW'), { code: 'KeyW' }), false);
  assert.equal(f.policy.routes.keyDown(key('KeyR'), { code: 'KeyR' }), true);
  assert.equal(f.policy.routes.keyDown(key('KeyB'), { code: 'KeyB' }), true);
  f.state.helm = true;
  assert.equal(f.policy.routes.keyDown(key('KeyQ'), { code: 'KeyQ' }), true);
  assert.deepEqual(f.calls, ['radio', 'bloom', 'show:true', 'leave']);
});

test('NO WAKE primary click selects execution or captured interaction', () => {
  const f = fixture();
  assert.equal(f.policy.routes.mouseDown({ button: 0 }, { locked: false }), false);
  assert.equal(f.policy.routes.mouseDown({ button: 0 }, { locked: true }), true);
  assert.equal(f.policy.routes.mouseUp({ button: 0 }), true);
  f.state.fire = true;
  assert.equal(f.policy.routes.mouseDown({ button: 0 }, { locked: false }), true);
  assert.deepEqual(f.calls, ['press', 'release', 'fire']);
});

test('NO WAKE refusal message follows a real canonical E press only', () => {
  const f = fixture();
  f.state.target = false;
  f.policy.onKeyDown(key('KeyE'), { code: 'KeyE', handled: true });
  f.policy.onKeyDown(key('KeyE'), { code: 'KeyE', handled: false });
  f.policy.onKeyDown(key('KeyE', { repeat: true }), { code: 'KeyE', handled: true });
  assert.deepEqual(f.calls, ['explain']);
});

test('NO WAKE root delegates the browser-to-Player seam to the canonical Adapter', () => {
  assert.match(MAIN, /import \{ createFirstPersonInput \} from '\.\.\/core\/first-person-input\.js';/);
  assert.match(MAIN, /const input = createFirstPersonInput\(\{/);
  assert.match(MAIN, /input\.suspend\(\)/);
  assert.match(MAIN, /input\.resume\(\{ requestPointerLock: !state\.atHelm \}\)/);
  assert.doesNotMatch(MAIN,
    /addEventListener\(['"](?:pointerlockchange|pointerlockerror|mousemove|mousedown|mouseup|keydown|keyup|blur)['"]/);
  assert.doesNotMatch(MAIN, /player\.(?:setKey|handleMouseMove|clearKeys)\(/);
});
