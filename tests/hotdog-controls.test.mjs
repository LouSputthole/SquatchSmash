import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createHotDogInputPolicy } from '../src/bing/hotdog-controls.js';

function policyFixture() {
  const events = [];
  let active = true;
  let carrying = false;
  let drink = false;
  const policy = createHotDogInputPolicy({
    isActive: () => active,
    isCarrying: () => carrying,
    drinkShot: () => {
      events.push('drink');
      return drink;
    },
    primaryControl: {
      press: () => events.push('press'),
      release: () => events.push('release'),
    },
    notifyCarryRefusal: () => events.push('carry-refusal'),
    toggleBloom: () => true,
    showBloom: (enabled) => events.push(`bloom:${enabled}`),
  });
  return {
    policy,
    events,
    setActive: (value) => { active = value; },
    setCarrying: (value) => { carrying = value; },
    setDrink: (value) => { drink = value; },
  };
}

test('HotDog policy claims the glass interaction and translated carry restrictions', () => {
  const f = policyFixture();
  let prevented = 0;
  f.setCarrying(true);
  assert.equal(f.policy.routes.keyDown({ repeat: false, preventDefault: () => { prevented += 1; } }, {
    code: 'Space',
  }), true);
  assert.equal(prevented, 1);
  assert.deepEqual(f.events, ['carry-refusal']);

  f.setCarrying(false);
  f.setDrink(true);
  assert.equal(f.policy.routes.keyDown({}, { code: 'KeyE' }), true);
  f.setDrink(false);
  assert.equal(f.policy.routes.keyDown({}, { code: 'KeyE' }), false,
    'ordinary E must fall through to the Adapter-owned Interaction default');
  assert.deepEqual(f.events.slice(1), ['drink', 'drink']);
});

test('HotDog mouse policy interacts only after capture and releases globally', () => {
  const f = policyFixture();
  assert.equal(f.policy.routes.mouseDown({ button: 0 }, { locked: false }), false);
  assert.equal(f.policy.routes.mouseDown({ button: 0 }, { locked: true }), true);
  assert.equal(f.policy.routes.mouseUp({ button: 0 }), true);
  assert.deepEqual(f.events, ['press', 'release']);
  f.setActive(false);
  assert.equal(f.policy.canEnable(), false);
  assert.equal(f.policy.canHandleInput(), false);
});

test('HotDog root delegates browser plumbing without direct Player input bypasses', () => {
  const source = fs.readFileSync(new URL('../src/bing/hotdog-main.js', import.meta.url), 'utf8');
  assert.match(source, /createFirstPersonInput\(\{/);
  assert.match(source, /\.\.\.hotDogInputPolicy/);
  assert.match(source, /input\.suspend\(\)/);
  assert.match(source, /input\.resume\(\)/);
  assert.doesNotMatch(source, /player\.(?:setKey|handleMouseMove|clearKeys)\(/);
  assert.doesNotMatch(source, /addEventListener\(['"]pointerlockchange/);
});
