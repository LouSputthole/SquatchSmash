import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  createGraveyardInputPolicy,
  createPrimaryGraveControl,
} from '../src/graveyard/controls.js';

test('the primary control automatically disrespects an unresolved traitor and otherwise interacts', () => {
  const events = [];
  let traitor = 'brawny';
  let peeing = false;
  const control = createPrimaryGraveControl({
    interaction: {
      press: () => events.push('interact:press'),
      release: () => events.push('interact:release'),
    },
    currentTraitor: () => traitor,
    startDisrespect: (id) => {
      peeing = true;
      events.push(`disrespect:start:${id}`);
      return true;
    },
    stopDisrespect: () => {
      peeing = false;
      events.push('disrespect:stop');
    },
    isDisrespecting: () => peeing,
  });

  assert.equal(control.press(), 'disrespect');
  assert.equal(control.release(), 'disrespect');
  assert.deepEqual(events, ['disrespect:start:brawny', 'disrespect:stop']);

  traitor = null;
  assert.equal(control.press(), 'interact');
  assert.equal(control.release(), 'interact');
  assert.deepEqual(events, [
    'disrespect:start:brawny',
    'disrespect:stop',
    'interact:press',
    'interact:release',
  ]);
});

test('the graveyard presents E as its only interaction key', () => {
  const html = fs.readFileSync(new URL('../graveyard.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /<kbd>P<\/kbd>/);
  assert.match(html, /<div id="pee-hint"[^>]*><kbd>E<\/kbd><span>hold to disrespect traitor<\/span><\/div>/);
  assert.match(html, /<kbd>E<\/kbd>[^<]*(?:<[^>]+>[^<]*<\/[^>]+>[^<]*)*all interactions/i);
});

test('focus cleanup cancels an interaction hold without manufacturing a tap', () => {
  const events = [];
  const control = createPrimaryGraveControl({
    interaction: {
      press: () => events.push('interact:press'),
      release: () => events.push('interact:release'),
      cancel: () => events.push('interact:cancel'),
    },
    currentTraitor: () => null,
    startDisrespect() {},
    stopDisrespect() {},
    isDisrespecting: () => false,
  });
  control.press();
  assert.equal(control.cancel(), 'interact');
  assert.deepEqual(events, ['interact:press', 'interact:cancel']);
});

test('graveyard policy keeps carrying, disrespect, and mouse ownership scene-authored', () => {
  const events = [];
  let carrying = true;
  let disrespecting = true;
  const policy = createGraveyardInputPolicy({
    isActive: () => true,
    isCarrying: () => carrying,
    isDisrespecting: () => disrespecting,
    primaryControl: {
      press: () => events.push('press'),
      release: () => events.push('release'),
    },
    stopDisrespect: () => {
      disrespecting = false;
      events.push('stop');
    },
    notifyCarryRefusal: () => events.push('carry-refusal'),
    toggleBloom: () => false,
    showBloom: (enabled) => events.push(`bloom:${enabled}`),
  });

  assert.equal(policy.routes.keyDown({ repeat: false, preventDefault() {} }, { code: 'Space' }), true);
  carrying = false;
  assert.equal(policy.routes.keyDown({}, { code: 'KeyQ' }), true);
  assert.equal(policy.routes.mouseDown({ button: 0 }, { locked: true }), true);
  assert.equal(policy.routes.mouseUp({ button: 0 }), true);
  assert.deepEqual(events, ['carry-refusal', 'stop', 'press', 'release']);
});

test('graveyard root delegates browser plumbing without direct Player input bypasses', () => {
  const source = fs.readFileSync(new URL('../src/graveyard/main.js', import.meta.url), 'utf8');
  assert.match(source, /createFirstPersonInput\(\{/);
  assert.match(source, /\.\.\.graveyardInputPolicy/);
  assert.match(source, /input\.suspend\(\)/);
  assert.match(source, /input\.resume\(\)/);
  assert.doesNotMatch(source, /player\.(?:setKey|handleMouseMove|clearKeys)\(/);
  assert.doesNotMatch(source, /addEventListener\(['"]pointerlockchange/);
});
