import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('../src/bing/main.js', import.meta.url), 'utf8');
const drinkTickStart = mainSource.indexOf('function drinkTick(dt)');
const drinkTickEnd = mainSource.indexOf('\n\n/* ------------------------------------------------------------------ *\n * Twenty-five seconds', drinkTickStart);
assert.ok(drinkTickStart >= 0 && drinkTickEnd > drinkTickStart,
  'the served-drink frame driver is missing');
const drinkTickSource = mainSource.slice(drinkTickStart, drinkTickEnd);

function servedDrinkFixture(heldDrink = 'beer') {
  let fDown = true;
  const game = { heldDrink, drinking: 0 };
  const calls = {
    drinks: [],
    inventoryRemovals: [],
    poses: [],
  };
  const drunk = {
    level: 0,
    drink(units) {
      calls.drinks.push(units);
      this.level += units;
    },
  };
  const inventory = {
    remove: (item) => calls.inventoryRemovals.push(item),
  };
  const tick = Function(
    'game',
    'bingInputPolicy',
    'poseHeldDrink',
    'heldDrinks',
    'DRINK_TIME',
    'WHISKEY_UNITS',
    'BEER_UNITS',
    'drunk',
    'audio',
    'inventory',
    'hud',
    'ITEMS',
    `${drinkTickSource}; return drinkTick;`,
  )(
    game,
    { isDown: (code) => code === 'KeyF' && fDown },
    (_rig, which, progress) => calls.poses.push({ which, progress }),
    {},
    2.4,
    0.72,
    0.36,
    drunk,
    { play() {} },
    inventory,
    { setHand() {}, setInventory() {}, say() {} },
    {},
  );
  return {
    game,
    calls,
    tick,
    releaseF() { fDown = false; },
  };
}

test('releasing F before 2.4 seconds cancels the served drink without consuming it', () => {
  const fixture = servedDrinkFixture('beer');
  fixture.tick(1.2);
  assert.equal(fixture.game.drinking, 1.2, 'the initial hold did not accumulate');

  fixture.releaseF();
  fixture.tick(0.05);

  assert.equal(fixture.game.drinking, 0);
  assert.equal(fixture.game.heldDrink, 'beer');
  assert.deepEqual(fixture.calls.drinks, []);
  assert.deepEqual(fixture.calls.inventoryRemovals, []);
  assert.deepEqual(fixture.calls.poses.at(-1), { which: null, progress: 0 });
});

test('holding F for the full 2.4 seconds consumes the served drink exactly once', () => {
  const fixture = servedDrinkFixture('beer');

  fixture.tick(1.2);
  assert.deepEqual(fixture.calls.drinks, [], 'the drink completed before the hold threshold');
  fixture.tick(1.2);
  fixture.tick(2.4);

  assert.equal(fixture.game.heldDrink, null);
  assert.equal(fixture.game.drinking, 0);
  assert.deepEqual(fixture.calls.drinks, [0.36]);
  assert.deepEqual(fixture.calls.inventoryRemovals, ['beer']);
  assert.deepEqual(fixture.calls.poses.at(-1), { which: null, progress: 0 });
  assert.doesNotMatch(mainSource, /\bautoDrink\b/,
    'the dead automatic-hold path returned to the served-drink frame driver');
});
