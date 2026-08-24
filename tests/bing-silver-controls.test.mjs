import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBingInputPolicy } from '../src/bing/controls.js';
import { FIRST_PERSON_CAPTURE_MODES } from '../src/core/first-person-input.js';
import { createSilverInputPolicy } from '../src/silver/controls.js';

function fixture(createPolicy) {
  let active = true;
  const calls = { press: 0, release: 0, cancel: 0, keys: [] };
  const primaryControl = {
    press: () => { calls.press += 1; },
    release: () => { calls.release += 1; },
    cancel: () => { calls.cancel += 1; },
  };
  const policy = createPolicy({
    isActive: () => active,
    primaryControl,
    routeKeyDown: (_event, code) => {
      calls.keys.push(code);
      return code === 'KeyE';
    },
  });
  return { policy, calls, setActive: (value) => { active = value; } };
}

for (const [name, createPolicy] of [
  ['Bada Bing', createBingInputPolicy],
  ['Silver Room', createSilverInputPolicy],
]) {
  test(`${name} keeps authored actions on the canonical Adapter policy seam`, () => {
    const f = fixture(createPolicy);
    const options = f.policy.adapterOptions;
    assert.equal(options.captureMode, FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG);
    assert.equal(options.canEnable(), true);
    assert.equal(options.canHandleInput(), true);

    assert.equal(options.routes.keyDown({ repeat: false }, { code: 'KeyF' }), false);
    assert.equal(f.policy.isDown('KeyF'), true, 'canonical utility action was not held');
    assert.equal(options.routes.keyDown({ repeat: true }, { code: 'KeyF' }), true);
    assert.deepEqual(f.calls.keys, ['KeyF'], 'browser repeat dispatched an authored action twice');
    assert.equal(options.routes.keyUp({}, { code: 'KeyF' }), false);
    assert.equal(f.policy.isDown('KeyF'), false);

    assert.equal(options.routes.keyDown({ repeat: false }, { code: 'KeyE' }), true);
    assert.equal(options.routes.keyUp({}, { code: 'KeyE' }), true);
    assert.equal(f.calls.release, 1, 'authored E lifecycle did not release');

    assert.equal(options.routes.mouseDown({ button: 0 }), false);
    assert.equal(options.routes.mouseUp({ button: 0 }), false);
    assert.equal(f.calls.press, 1);
    assert.equal(f.calls.release, 2);

    options.routes.keyDown({ repeat: false }, { code: 'KeyF' });
    options.onClear();
    assert.equal(f.policy.isDown('KeyF'), false, 'focus/pause clear retained scene hold state');
    f.setActive(false);
    assert.equal(options.canEnable(), false);
    assert.equal(options.canHandleInput(), false);
  });
}

test('Bada Bing and Silver no longer own DOM-to-Player browser plumbing', () => {
  for (const [path, policyName] of [
    ['src/bing/main.js', 'createBingInputPolicy'],
    ['src/silver/main.js', 'createSilverInputPolicy'],
  ]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /import \{ createFirstPersonInput \} from '\.\.\/core\/first-person-input\.js';/);
    assert.match(source, new RegExp(`const \\w+InputPolicy = ${policyName}\\(\\{`));
    assert.match(source, /input = createFirstPersonInput\(\{/);
    assert.match(source, /input\.suspend\(\)/);
    assert.match(source, /input\.resume\(\)/);
    assert.match(source, /input\.requestPointerLock\(\)/);
    assert.match(source, /get renderedFrameCount\(\) \{ return renderedFrameCount; \}/);
    assert.doesNotMatch(source, /player\.(?:setKey|handleMouseMove|clearKeys)\(/);
    assert.doesNotMatch(
      source,
      /addEventListener\(['"](?:pointerlockchange|pointerlockerror|mousemove|mousedown|mouseup|keydown|keyup|blur)['"]/,
    );
  }
});
