import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FIRST_PERSON_CAPTURE_MODES } from '../src/core/first-person-input.js';
import {
  APARTMENT_INPUT_OWNER,
  apartmentInputOwner,
  createApartmentInputPolicy,
} from '../src/apartment-controls.js';

function fixture(overrides = {}) {
  const state = {
    started: true,
    paused: false,
    left: false,
    seated: false,
    domArcade: false,
    coldOpen: false,
    ...overrides,
  };
  const calls = [];
  const route = (name) => (event, context) => {
    calls.push([name, event.type, context.code ?? null]);
    return name === 'keyDown';
  };
  const policy = createApartmentInputPolicy({
    readState: () => state,
    keyDown: route('keyDown'),
    keyUp: route('keyUp'),
    mouseMove: route('mouseMove'),
    mouseDown: route('mouseDown'),
    mouseUp: route('mouseUp'),
    clear: (reason) => calls.push(['clear', reason]),
  });
  return { state, calls, policy, options: policy.adapterOptions };
}

test('Apartment input ownership is explicit across world, pause, cold-open, and arcade modes', () => {
  assert.equal(apartmentInputOwner({ left: true }), APARTMENT_INPUT_OWNER.DISABLED);
  assert.equal(apartmentInputOwner(), APARTMENT_INPUT_OWNER.TITLE);
  assert.equal(apartmentInputOwner({ started: true, paused: true }), APARTMENT_INPUT_OWNER.PAUSED);
  assert.equal(apartmentInputOwner({ started: true, coldOpen: true }), APARTMENT_INPUT_OWNER.COLD_OPEN);
  assert.equal(apartmentInputOwner({ started: true }), APARTMENT_INPUT_OWNER.WORLD);
  assert.equal(
    apartmentInputOwner({ started: true, seated: true }),
    APARTMENT_INPUT_OWNER.RELATIVE_ARCADE,
  );
  assert.equal(
    apartmentInputOwner({ started: true, seated: true, domArcade: true, coldOpen: true }),
    APARTMENT_INPUT_OWNER.DOM_ARCADE,
    'the iframe owns focus even while the cold-open camera owns presentation',
  );
});

test('Apartment policy pre-arms capture but only world mode enables canonical movement and look', () => {
  const f = fixture({ started: false });
  assert.equal(f.options.captureMode, FIRST_PERSON_CAPTURE_MODES.POINTER_LOCK_OR_DRAG);
  assert.equal(f.options.dragFallbackDelayMs, 600);
  assert.equal(f.options.canEnable(), true, 'the Start gesture may acquire capture');
  assert.deepEqual(f.options.controlState(), {
    playerEnabled: false,
    movementEnabled: false,
    defaultLookEnabled: false,
    interactionEnabled: false,
  });

  f.state.started = true;
  assert.equal(f.policy.owner(), APARTMENT_INPUT_OWNER.WORLD);
  assert.deepEqual(f.options.controlState(), {
    playerEnabled: true,
    movementEnabled: true,
    defaultLookEnabled: true,
    interactionEnabled: false,
  });

  f.state.seated = true;
  assert.equal(f.policy.owner(), APARTMENT_INPUT_OWNER.RELATIVE_ARCADE);
  assert.deepEqual(f.options.controlState(), {
    playerEnabled: true,
    movementEnabled: false,
    defaultLookEnabled: false,
    interactionEnabled: false,
  });
});

test('DOM arcade owns capture without hiding parent Q/Escape routes', () => {
  const f = fixture({ seated: true, domArcade: true });
  assert.equal(f.policy.owner(), APARTMENT_INPUT_OWNER.DOM_ARCADE);
  assert.equal(f.options.canEnable(), false);
  assert.equal(f.options.canHandleInput(), true);
  assert.deepEqual(f.options.controlState(), {
    playerEnabled: false,
    movementEnabled: false,
    defaultLookEnabled: false,
    interactionEnabled: false,
  });

  f.state.left = true;
  assert.equal(f.policy.owner(), APARTMENT_INPUT_OWNER.DISABLED);
  assert.equal(f.options.canEnable(), false);
  assert.equal(f.options.canHandleInput(), false);
});

test('Apartment policy is a thin delegation seam for authored actions and cleanup', () => {
  const f = fixture();
  const context = { code: 'KeyQ' };
  assert.equal(f.options.routes.keyDown({ type: 'keydown' }, context), true);
  assert.equal(f.options.routes.keyUp({ type: 'keyup' }, context), false);
  f.options.routes.mouseMove({ type: 'mousemove' }, context);
  f.options.routes.mouseDown({ type: 'mousedown' }, context);
  f.options.routes.mouseUp({ type: 'mouseup' }, context);
  f.options.onClear('blur');
  assert.deepEqual(f.calls, [
    ['keyDown', 'keydown', 'KeyQ'],
    ['keyUp', 'keyup', 'KeyQ'],
    ['mouseMove', 'mousemove', 'KeyQ'],
    ['mouseDown', 'mousedown', 'KeyQ'],
    ['mouseUp', 'mouseup', 'KeyQ'],
    ['clear', 'blur'],
  ]);
});

test('Apartment delegates the complete first-person browser lifecycle to the canonical Adapter', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const policySource = readFileSync(new URL('../src/apartment-controls.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ createFirstPersonInput \} from '\.\/core\/first-person-input\.js';/);
  assert.match(source, /const apartmentInputPolicy = createApartmentInputPolicy\(\{/);
  assert.match(source, /browserInput = createFirstPersonInput\(\{/);
  assert.match(policySource, /captureMode: FIRST_PERSON_CAPTURE_MODES\.POINTER_LOCK_OR_DRAG/);
  assert.doesNotMatch(
    source,
    /addEventListener\(['"](?:pointerlockchange|pointerlockerror|mousemove|mousedown|mouseup|keydown|keyup|blur)['"]/,
  );
  assert.doesNotMatch(source, /canvas\.requestPointerLock/);
  assert.doesNotMatch(source, /\b(?:let\s+dragLook|let\s+dragging|fallBackToDragLook)\b/);

  const captureErrorStart = source.indexOf('onCaptureError:');
  const captureError = source.slice(
    captureErrorStart,
    source.indexOf('paintInputCapture(browserInput.snapshot());', captureErrorStart),
  );
  const pauseGuard = captureError.indexOf('pauseMenu.isPaused()');
  const recoverInput = captureError.indexOf('\n    enableInput();');
  assert.ok(pauseGuard >= 0 && recoverInput > pauseGuard,
    'a late pointer-lock error can resume simulation behind the open pause HUD');
});
