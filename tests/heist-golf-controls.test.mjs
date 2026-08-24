import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createHeistControlPolicy } from '../src/heist/controls.js';
import { createGolfControlPolicy } from '../src/golf/controls.js';

const HEIST_MAIN = await readFile(new URL('../src/heist/main.js', import.meta.url), 'utf8');
const GOLF_MAIN = await readFile(new URL('../src/golf/main.js', import.meta.url), 'utf8');

function playerSpy() {
  return {
    keys: new Set(),
    setKey(code, down) { if (down) this.keys.add(code); else this.keys.delete(code); },
  };
}

function interactionSpy() {
  return {
    presses: 0,
    releases: 0,
    press() { this.presses += 1; },
    release() { this.releases += 1; },
  };
}

test('Heist policy preserves translated movement and the uncaptured escape-car seam', () => {
  const current = { started: true, paused: false, driving: true, completed: false };
  const player = playerSpy();
  const interaction = interactionSpy();
  const calls = [];
  const policy = createHeistControlPolicy({
    state: () => current,
    player,
    interaction,
    isPreview: () => false,
    selectSlot: (slot) => calls.push(['slot', slot]),
    cycleSlot: (direction) => calls.push(['cycle', direction]),
    hostageVerb: (verb) => calls.push(['hostage', verb]),
    reload: () => calls.push(['reload']),
    dropBag: () => calls.push(['drop']),
    failPreview: () => calls.push(['fail']),
    fireWeapon: () => calls.push(['fire']),
    setAimed: (aimed) => calls.push(['aim', aimed]),
    pause: () => calls.push(['pause']),
    resumeSimulation: () => calls.push(['resume']),
    pauseMenuOpen: () => false,
  });

  assert.equal(policy.canEnable(), false);
  assert.equal(policy.canHandleInput(), true);
  assert.equal(policy.routes.keyDown({ code: 'KeyZ', preventDefault() {} }, { code: 'KeyW' }), true);
  assert.deepEqual([...player.keys], ['KeyW']);

  current.driving = false;
  assert.equal(policy.canEnable(), true);
  assert.equal(policy.routes.keyDown({ code: 'Digit3', preventDefault() {} }, { code: 'KeyD' }), true);
  assert.deepEqual(calls.at(-1), ['slot', 2]);
  assert.equal(player.keys.has('KeyD'), true,
    'an action key rebound to movement keeps both responsibilities');

  policy.routes.keyDown({ code: 'KeyE', preventDefault() {} }, { code: 'KeyE' });
  policy.routes.keyUp({ code: 'KeyE' }, { code: 'KeyE' });
  assert.equal(interaction.presses, 1);
  assert.equal(interaction.releases, 1);
});

test('Heist policy owns capture loss, blur recovery, firing, and aim cleanup', () => {
  const current = { started: true, paused: false, driving: false, completed: false };
  const player = playerSpy();
  const interaction = interactionSpy();
  const calls = [];
  const policy = createHeistControlPolicy({
    state: () => current,
    player,
    interaction,
    isPreview: () => false,
    selectSlot() {}, cycleSlot() {}, hostageVerb() {}, reload() {}, dropBag() {}, failPreview() {},
    fireWeapon: () => calls.push('fire'),
    setAimed: (aimed) => calls.push(`aim:${aimed}`),
    pause: () => calls.push('pause'),
    resumeSimulation: () => calls.push('resume'),
    pauseMenuOpen: () => false,
  });

  policy.routes.mouseDown({ button: 0 }, { locked: true });
  policy.routes.mouseDown({ button: 2 }, { locked: true });
  policy.routes.mouseUp({ button: 2 });
  policy.onCaptureChange({}, { locked: false });
  policy.onCaptureChange({}, { locked: true });
  policy.onClear('blur');

  assert.deepEqual(calls, ['fire', 'aim:true', 'aim:false', 'pause', 'resume', 'aim:false', 'pause']);
});

test('Golf policy routes address aim and swing without leaking movement defaults', () => {
  const modes = { WALK: 'walk', ADDRESS: 'address', CART: 'cart' };
  const current = {
    running: true, booting: false, paused: false, ended: false,
    camMode: modes.ADDRESS, pendingHoleTransition: false,
  };
  const player = playerSpy();
  const interaction = interactionSpy();
  const calls = [];
  const policy = createGolfControlPolicy({
    state: () => current,
    modes,
    player,
    interaction,
    advanceHoleTransition: () => calls.push(['advance']),
    adjustPlannedDistance: (direction) => calls.push(['distance', direction]),
    adjustAim: (delta) => calls.push(['aim-key', delta]),
    swingClick: () => calls.push(['swing']),
    chooseDigit: (slot) => calls.push(['digit', slot]),
    command: (code) => { calls.push(['command', code]); return code === 'KeyF'; },
    cancelItemUse: () => calls.push(['cancel']),
    aimMouse: (x, y) => calls.push(['aim-mouse', x, y]),
    cartMouse: (x, y) => calls.push(['cart-mouse', x, y]),
  });

  assert.deepEqual(policy.controlState(), {
    playerEnabled: false, movementEnabled: false, lookEnabled: false, interactionEnabled: false,
  });
  assert.equal(policy.routes.keyDown({ code: 'KeyW', preventDefault() {} }, { code: 'KeyW' }), true);
  assert.equal(policy.routes.keyDown({ code: 'ArrowRight', shiftKey: true, preventDefault() {} },
    { code: 'ArrowRight' }), true);
  assert.equal(policy.routes.keyDown({ code: 'Space', repeat: false, preventDefault() {} },
    { code: 'Space' }), true);
  policy.routes.mouseMove({ movementX: 7, movementY: -2 }, {
    locked: true, dragFallback: false, dragging: false,
  });
  assert.deepEqual(calls, [
    ['distance', 1], ['aim-key', -0.07], ['swing'], ['aim-mouse', 7, -2],
  ]);
});

test('Golf policy keeps cart input and physical-command cleanup alive without pointer lock', () => {
  const modes = { WALK: 'walk', ADDRESS: 'address', CART: 'cart' };
  const current = {
    running: true, booting: false, paused: false, ended: false,
    camMode: modes.CART, pendingHoleTransition: false,
  };
  const player = playerSpy();
  const interaction = interactionSpy();
  let cancelled = 0;
  const policy = createGolfControlPolicy({
    state: () => current,
    modes,
    player,
    interaction,
    advanceHoleTransition() {}, adjustPlannedDistance() {}, adjustAim() {}, swingClick() {},
    chooseDigit() {}, command: () => false,
    cancelItemUse: () => { cancelled += 1; },
    aimMouse() {}, cartMouse() {},
  });

  assert.equal(policy.routes.keyDown({ code: 'KeyW', preventDefault() {} }, { code: 'KeyW' }), true);
  assert.equal(player.keys.has('KeyW'), true);
  policy.routes.keyUp({ code: 'KeyE' }, { code: 'KeyE' });
  policy.routes.keyUp({ code: 'KeyF' }, { code: 'KeyF' });
  policy.onClear('blur');
  assert.equal(interaction.releases, 1);
  assert.equal(cancelled, 2);
});

test('Heist and Golf entrypoints delegate browser first-person lifecycle to the canonical Adapter', () => {
  for (const [name, source, policy] of [
    ['Heist', HEIST_MAIN, 'createHeistControlPolicy'],
    ['Golf', GOLF_MAIN, 'createGolfControlPolicy'],
  ]) {
    assert.match(source, /import \{ createFirstPersonInput \} from '\.\.\/core\/first-person-input\.js';/,
      `${name} lost the canonical Adapter import`);
    assert.match(source, new RegExp(`${policy}\\(\\{`));
    assert.match(source, /input = createFirstPersonInput\(\{/);
    assert.doesNotMatch(source,
      /addEventListener\(['"](?:pointerlockchange|pointerlockerror|mousemove|mousedown|mouseup|keydown|keyup|blur)['"]/,
      `${name} rebuilt canonical browser event plumbing`);
  }
  assert.match(HEIST_MAIN, /adapter: input\?\.snapshot\?\.\(\) \?\? null/);
  assert.match(GOLF_MAIN, /player, camera, scene, audio, input/);
});
