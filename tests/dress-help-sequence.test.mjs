import assert from 'node:assert/strict';
import test from 'node:test';

import { TimingBar } from '../src/core/timingbar.js';
import { createDressHelpSequence } from '../src/world/dress-help.js';

function makeHarness(callbacks = {}) {
  const events = [];
  const audio = {
    play(name, options = {}) {
      events.push({ type: 'play', name, options });
    },
    startLoop(key, options = {}) {
      events.push({ type: 'startLoop', key, options });
    },
    stopLoop(key, fade) {
      events.push({ type: 'stopLoop', key, fade });
    },
  };
  const rig = {
    begin() { events.push({ type: 'rig', name: 'begin' }); },
    onHit(event) { events.push({ type: 'rig', name: 'hit', event }); },
    onMiss(event) { events.push({ type: 'rig', name: 'miss', event }); },
    finish() { events.push({ type: 'rig', name: 'finish' }); },
    reset() { events.push({ type: 'rig', name: 'reset' }); },
  };
  const sequence = createDressHelpSequence({
    timingBar: TimingBar,
    audio,
    rig,
    ...callbacks,
  });
  return { sequence, events };
}

test('dress help starts the exact seven-pull Margo rhythm', () => {
  const { sequence, events } = makeHarness();

  assert.equal(sequence.start(), true);
  assert.equal(sequence.active, true);
  assert.deepEqual(sequence.debug.view, {
    pos: 0,
    from: 0.72,
    to: 0.87,
    hits: 0,
    total: 7,
    flash: null,
  });
  assert.deepEqual(sequence.debug.config, {
    hits: 7,
    window: [0.72, 0.87],
    speed: 0.74,
    ramp: 1.13,
  });
  assert.deepEqual(events, [
    { type: 'rig', name: 'begin' },
    {
      type: 'startLoop',
      key: 'margo.dress.clap',
      options: {
        name: 'clap.wet.loop.1', volume: 0.32, ref: 0.9, maxDist: 6, fade: 0.35,
      },
    },
    {
      type: 'play',
      name: 'cloth.snap',
      options: { volume: 0.42, ref: 0.8, maxDist: 5 },
    },
  ]);
});

test('a miss does not advance, then a hit plays the first written pull', () => {
  const progress = [];
  const { sequence, events } = makeHarness({
    onProgress: (event) => progress.push(event),
  });
  sequence.start();
  events.length = 0;

  sequence.debug.bar.pos = 0.5;
  assert.equal(sequence.press(), false);
  assert.equal(sequence.hits, 0);
  assert.equal(sequence.misses, 1);

  sequence.debug.bar.pos = 0.8;
  assert.equal(sequence.press(), true);
  assert.equal(sequence.hits, 1);
  assert.equal(sequence.misses, 1);
  assert.deepEqual(progress, [{ index: 1, total: 7, progress: 1 / 7 }]);
  assert.deepEqual(events, [
    {
      type: 'play',
      name: 'cloth.snap',
      options: { volume: 0.30, rate: 1.22, ref: 0.8, maxDist: 5 },
    },
    { type: 'rig', name: 'miss', event: { index: 1 } },
    {
      type: 'play',
      name: 'moan.1',
      options: { volume: 0.60 + (1 / 7) * 0.30, ref: 0.9, maxDist: 6 },
    },
    { type: 'rig', name: 'hit', event: { index: 1, total: 7 } },
  ]);
});

test('seven successful pulls keep the authored cue order and finish once', () => {
  const { sequence, events } = makeHarness({
    onComplete: (event) => events.push({ type: 'callback', name: 'complete', event }),
    onAbandon: (event) => events.push({ type: 'callback', name: 'abandon', event }),
  });
  sequence.start();
  events.length = 0;

  for (let index = 1; index <= 7; index++) {
    sequence.debug.bar.pos = 0.8;
    assert.equal(sequence.press(), true, `pull ${index}`);
  }

  assert.equal(sequence.active, false);
  assert.equal(sequence.hits, 7);
  assert.deepEqual(
    events.filter((event) => event.type === 'play').map((event) => event.name),
    [
      'moan.1', 'moan.3', 'moan.4', 'moan.5', 'moan.6', 'moan.3', 'moan.5',
      'clap.wet.finish', 'cloth.snap',
    ],
  );
  assert.deepEqual(
    events.filter((event) => event.type === 'startLoop').map((event) => event.options.name),
    ['clap.wet.loop.2', 'clap.wet.loop.3'],
  );
  assert.deepEqual(
    events.filter((event) => event.type === 'stopLoop').map((event) => event.fade),
    [0.22, 0.22, 0.34],
  );
  assert.deepEqual(events.slice(-2), [
    { type: 'rig', name: 'finish' },
    {
      type: 'callback',
      name: 'complete',
      event: { hits: 7, misses: 0, earned: true },
    },
  ]);
  assert.equal(events.some((event) => event.name === 'abandon'), false);
});

test('abandon gives the same payoff, while reset is silent and starts clean', () => {
  const { sequence, events } = makeHarness({
    onAbandon: (event) => events.push({ type: 'callback', name: 'abandon', event }),
  });
  sequence.start();
  sequence.debug.bar.pos = 0.8;
  sequence.press();
  sequence.debug.bar.pos = 0.2;
  sequence.press();
  events.length = 0;

  assert.equal(sequence.abandon(), true);
  assert.equal(sequence.active, false);
  assert.deepEqual(
    events.filter((event) => event.type === 'play').map((event) => event.name),
    ['clap.wet.finish', 'cloth.snap'],
  );
  assert.deepEqual(events.at(-1), {
    type: 'callback',
    name: 'abandon',
    event: { hits: 1, misses: 1, earned: false },
  });
  const settledCount = events.length;
  assert.equal(sequence.abandon(), false);
  assert.equal(events.length, settledCount, 'an already settled sequence stays one-shot');

  sequence.start();
  sequence.debug.bar.pos = 0.8;
  sequence.press();
  events.length = 0;
  assert.equal(sequence.reset(), true);
  assert.equal(sequence.active, false);
  assert.equal(sequence.hits, 0);
  assert.equal(sequence.misses, 0);
  assert.equal(sequence.debug.view, null);
  assert.deepEqual(events, [
    { type: 'stopLoop', key: 'margo.dress.clap', fade: 0.34 },
    { type: 'rig', name: 'reset' },
  ]);
});

test('update exposes the canonical TimingBar view without owning a HUD', () => {
  const { sequence } = makeHarness();
  sequence.start();

  const view = sequence.update(0.5);
  assert.equal(view.pos, 0.37);
  assert.equal(view.total, 7);
  assert.deepEqual(view, sequence.debug.view);

  sequence.reset();
  assert.equal(sequence.update(0.5), null);
});
