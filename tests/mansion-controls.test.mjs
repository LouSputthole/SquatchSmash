import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createMansionControlPolicy } from '../src/mansion/controls.js';

const MAIN = await readFile(new URL('../src/mansion/main.js', import.meta.url), 'utf8');

function fixture(overrides = {}) {
  const current = {
    running: true,
    tourBegun: true,
    paused: false,
    atPool: false,
    weaponEquipped: false,
    ...overrides,
  };
  const calls = [];
  const player = {
    keys: new Set(),
    setKey(code, down) { if (down) this.keys.add(code); else this.keys.delete(code); },
  };
  const interaction = {
    press: () => calls.push('interact:press'),
    release: () => calls.push('interact:release'),
  };
  const poolKeys = new Set();
  let silentConsumes = false;
  let dressActive = false;
  const policy = createMansionControlPolicy({
    state: () => current,
    player,
    interaction,
    poolKeys,
    silentKeydown: () => silentConsumes,
    dressHelpActive: () => dressActive,
    pressDressHelp: () => calls.push('dress:press'),
    abandonDressHelp: () => calls.push('dress:abandon'),
    poolPressE: () => calls.push('pool:press'),
    poolPutCueBack: () => calls.push('pool:leave'),
    command: (code) => {
      calls.push(`command:${code}`);
      return ['KeyE', 'KeyR', 'KeyQ', 'KeyB'].includes(code);
    },
    peeStop: () => calls.push('pee:stop'),
    setTrigger: (pressed) => calls.push(`trigger:${pressed}`),
    fireMissionWeapon: () => calls.push('mission:fire'),
    pause: () => calls.push('pause'),
  });
  return {
    current, calls, player, interaction, poolKeys, policy,
    setSilent(value) { silentConsumes = value; },
    setDress(value) { dressActive = value; },
  };
}

const event = (code, extra = {}) => ({
  code,
  key: code,
  repeat: false,
  prevented: false,
  preventDefault() { this.prevented = true; },
  ...extra,
});

test('Mansion keypad and dress-help modes get first refusal without leaking movement', () => {
  const f = fixture();
  f.setSilent(true);
  const keypad = event('Digit1', { key: '1' });
  assert.equal(f.policy.routes.keyDown(keypad, { code: 'KeyW' }), true);
  assert.equal(keypad.prevented, true);
  assert.deepEqual([...f.player.keys], []);

  f.setSilent(false);
  f.setDress(true);
  assert.equal(f.policy.routes.keyDown(event('KeyE'), { code: 'KeyE' }), true);
  assert.equal(f.policy.routes.keyDown(event('Escape'), { code: 'Escape' }), true);
  assert.deepEqual(f.calls, ['dress:press', 'dress:abandon']);
});

test('Mansion pool owns E/Q while A/D retain fine-aim key truth', () => {
  const f = fixture({ atPool: true });
  assert.equal(f.policy.routes.keyDown(event('KeyE'), { code: 'KeyE' }), true);
  assert.equal(f.policy.routes.keyDown(event('KeyQ'), { code: 'KeyQ' }), true);
  assert.equal(f.policy.routes.keyDown(event('KeyA'), { code: 'KeyA' }), undefined);
  assert.equal(f.poolKeys.has('KeyA'), true);
  assert.equal(f.player.keys.has('KeyA'), true);

  assert.equal(f.policy.routes.keyUp(event('KeyE'), { code: 'KeyE' }), true,
    'pool E release must not become an InteractionSystem tap');
  f.policy.routes.keyUp(event('KeyA'), { code: 'KeyA' });
  assert.equal(f.poolKeys.has('KeyA'), false);
  assert.deepEqual(f.calls, ['pool:press', 'pool:leave', 'command:KeyA']);
});

test('Mansion reads the configured code, so a rebound command follows the binding', () => {
  /* Physical R rebound to "forward" is a SWAP: bindKey hands reload the KeyW
   * that forward gave up, so R arrives translated as KeyW and means movement
   * only. The house used to run `command(event.code)` and fired reload as
   * well, which is the same raw compare that left a rebound Use answering
   * nothing at all. */
  const f = fixture();
  const rebound = event('KeyR');
  assert.equal(f.policy.routes.keyDown(rebound, { code: 'KeyW' }), undefined);
  assert.equal(f.player.keys.has('KeyW'), true);
  assert.equal(rebound.prevented, true);
  assert.deepEqual(f.calls, ['command:KeyW']);

  /* And the displaced reload answers on the key it moved to. */
  f.calls.length = 0;
  const displaced = event('KeyW');
  assert.equal(f.policy.routes.keyDown(displaced, { code: 'KeyR' }), true);
  assert.deepEqual(f.calls, ['command:KeyR']);
  assert.equal(f.player.keys.has('KeyR'), false,
    'a command key must not also be pushed into the Player as movement');
});

test('Mansion releases the interaction on the configured code, not the physical one', () => {
  /* Press and release must translate identically or a rebound Use is held
   * down for the rest of the tour. */
  const f = fixture();
  f.policy.routes.keyDown(event('KeyX'), { code: 'KeyE' });
  f.policy.routes.keyUp(event('KeyX'), { code: 'KeyE' });
  assert.deepEqual(f.calls, ['command:KeyE', 'interact:release', 'pee:stop']);
});

test('Mansion mouse policy keeps weapon, interaction, mission-fire, and cleanup distinct', () => {
  const f = fixture();
  f.policy.routes.mouseDown({ button: 0 }, { locked: true });
  assert.deepEqual(f.calls, ['interact:press', 'mission:fire']);

  f.calls.length = 0;
  f.current.weaponEquipped = true;
  f.policy.routes.mouseDown({ button: 0 }, { locked: true });
  f.policy.routes.mouseUp({ button: 0 });
  assert.deepEqual(f.calls, [
    'trigger:true', 'mission:fire', 'trigger:false', 'interact:release',
  ]);

  f.calls.length = 0;
  f.poolKeys.add('KeyA');
  f.policy.onClear('blur');
  f.policy.onCaptureChange({}, { locked: false });
  assert.deepEqual(f.calls, ['pee:stop', 'trigger:false', 'pause']);
  assert.equal(f.poolKeys.size, 0);
});

test('Mansion lifecycle policy separates early user capture from playable input', () => {
  const f = fixture({ running: false, tourBegun: true });
  assert.equal(f.policy.canEnable(), true,
    'the start gesture may acquire capture while audio banks load');
  assert.equal(f.policy.canHandleInput(), false);
  assert.deepEqual(f.policy.controlState(), {
    playerEnabled: false,
    movementEnabled: false,
    lookEnabled: false,
    interactionEnabled: false,
  });
  f.current.running = true;
  assert.equal(f.policy.canHandleInput(), true);
  assert.equal(f.policy.controlState().playerEnabled, true);
});

test('Mansion root delegates the complete first-person browser lifecycle to the canonical Adapter', () => {
  assert.match(MAIN,
    /import \{ createFirstPersonInput \} from '\.\.\/core\/first-person-input\.js';/);
  assert.match(MAIN, /const mansionControls = createMansionControlPolicy\(\{/);
  assert.match(MAIN, /input = createFirstPersonInput\(\{/);
  assert.match(MAIN, /player,\s*interaction,\s*input,\s*audio,/);
  assert.doesNotMatch(MAIN,
    /addEventListener\(['"](?:pointerlockchange|pointerlockerror|mousemove|mousedown|mouseup|keydown|keyup|blur)['"]/);
  assert.doesNotMatch(MAIN, /player\.(?:setKey|handleMouseMove|clearKeys)\(/);
});
