/**
 * THE CARD BURNS, AND THE BEAT CANNOT DEAD-END.
 *
 * IN-440 is what the whole scene walks toward, and until this pass nothing in
 * the code did it: the card was put in the player's palm and sat there, a
 * printed rectangle, while the line about flesh burning in hell played over
 * the top of it.
 *
 * The awkward parts are the release window and the commit, so those are what
 * this holds. From the script: the hold is real for about a second and a half;
 * release inside it and the card drops, and Lou relights it and puts it back
 * without a word, as many times as it takes; after it, Lou's hand closes over
 * the player's and a player who cannot or will not hold the button is held.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BURN_DURATION_S,
  CardBurn,
  MIN_HOLD_S,
  PLACE_S,
  RELIGHT_S,
} from '../src/initiation/cabin/card-burn.js';

/** Run the clock in small steps, the way a frame loop would. */
function run(burn, seconds, holding, step = 1 / 60) {
  const events = [];
  for (let t = 0; t < seconds; t += step) events.push(...burn.update(step, holding));
  return events;
}

test('an unlit card does nothing, however hard it is held', () => {
  const burn = new CardBurn();
  assert.deepEqual(run(burn, 3, true), []);
  assert.equal(burn.char, 0);
  assert.equal(burn.state, 'unlit');
  assert.equal(burn.flame, false);
});

test('it catches when Lou lights it, and the catch is announced once', () => {
  const burn = new CardBurn();
  burn.ignite();
  const events = run(burn, PLACE_S + 0.5, true);
  assert.deepEqual(events.filter((e) => e === 'catch'), ['catch'], 'the wince fires once');
  assert.ok(burn.char > 0 && burn.char < 1);
  assert.equal(burn.flame, true);
});

test('letting go inside the window drops it, and Lou puts it back', () => {
  const burn = new CardBurn();
  burn.ignite();
  run(burn, PLACE_S + MIN_HOLD_S * 0.5, true);
  assert.equal(burn.committed, false);

  const dropped = burn.update(1 / 60, false);
  assert.deepEqual(dropped, ['drop']);
  assert.equal(burn.state, 'dropped');
  assert.equal(burn.drops, 1);

  const charAtDrop = burn.char;
  run(burn, RELIGHT_S * 0.5, false);
  assert.equal(burn.state, 'dropped', 'it is on the boards until Lou gets to it');
  assert.equal(burn.char, charAtDrop, 'a card on the floor is not burning down');

  /* Just far enough to cross the relight, and no further: holding is still
   * false, and once Lou lets go of it again it will of course fall again. */
  const relit = run(burn, RELIGHT_S * 0.5 + 0.05, false);
  assert.ok(relit.includes('relight'));
  assert.equal(burn.state, 'lit');
  assert.equal(burn.heldT, 0, 'the window starts again');
  assert.ok(burn.placingT > 0, "Lou's hand is still on it");
});

test('a card being placed does not fall out of a hand that is not gripping yet', () => {
  /* The player's button is, of course, up while Lou is setting it down. An
   * earlier draft dropped it on the very next frame, forever. */
  const burn = new CardBurn();
  burn.ignite();
  const events = run(burn, PLACE_S * 0.8, false);
  assert.deepEqual(events, []);
  assert.equal(burn.state, 'lit');
  assert.equal(burn.char, 0, 'it is still in Lou\'s hand, not burning down in his');
});

test('it can be done again as many times as it takes', () => {
  const burn = new CardBurn();
  burn.ignite();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    run(burn, PLACE_S + MIN_HOLD_S * 0.4, true);
    burn.update(1 / 60, false);
    assert.equal(burn.state, 'dropped', `attempt ${attempt} should drop`);
    run(burn, RELIGHT_S + 0.01, false);
  }
  assert.equal(burn.drops, 5);
  assert.equal(burn.state, 'lit');
  assert.equal(burn.spent, false, 'five refusals have not failed anything');
});

test('past the window, releasing the button does nothing: he is held', () => {
  const burn = new CardBurn();
  burn.ignite();
  run(burn, PLACE_S + MIN_HOLD_S + 0.1, true);
  assert.equal(burn.committed, true);

  const after = run(burn, 0.5, false);
  assert.ok(!after.includes('drop'), 'Lou has hold of it now');
  assert.equal(burn.state, 'lit');
});

test('a player who never touches the button after the commit still finishes', () => {
  const burn = new CardBurn();
  burn.ignite();
  run(burn, PLACE_S + MIN_HOLD_S + 0.05, true);
  const events = run(burn, BURN_DURATION_S + 1, false);
  assert.ok(events.includes('spent'), 'the beat cannot dead-end');
  assert.equal(burn.char, 1);
  assert.equal(burn.spent, true);
  assert.equal(burn.flame, false, 'nothing left to burn');
});

test('char only ever goes one way', () => {
  const burn = new CardBurn();
  burn.ignite();
  let last = 0;
  for (let t = 0; t < BURN_DURATION_S * 2; t += 1 / 60) {
    burn.update(1 / 60, Math.random() > 0.5);
    assert.ok(burn.char >= last, 'a card does not un-burn');
    last = burn.char;
  }
});

test('it is spent once, not every frame after', () => {
  const burn = new CardBurn();
  burn.ignite();
  const events = run(burn, BURN_DURATION_S + 2, true);
  assert.deepEqual(events.filter((e) => e === 'spent'), ['spent']);
});

test('reset puts an unburnt card back in the hand', () => {
  const burn = new CardBurn();
  burn.ignite();
  run(burn, BURN_DURATION_S + 1, true);
  burn.reset();
  assert.equal(burn.state, 'unlit');
  assert.equal(burn.char, 0);
  assert.equal(burn.committed, false);
  assert.equal(burn.drops, 0);
});
