import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AdaptivePixelRatioPolicy, LADDER, PIXEL_RATIO_CAP, PIXEL_RATIO_CAP_HEAVY, PIXEL_RATIO_FLOOR,
  isDeterministicRun, initialPixelRatio, attachPixelRatio,
} from '../src/core/pixel-ratio.js';

/** Feed `seconds` of frames at a fixed interval; return the levels reported. */
function run(policy, clock, seconds, frameMs) {
  const changes = [];
  const end = clock.t + seconds * 1000;
  while (clock.t < end) {
    clock.t += frameMs;
    const level = policy.sample(frameMs, clock.t);
    if (level !== null) changes.push({ at: clock.t, level });
  }
  return changes;
}

test('sustained slow frames walk the ratio down the ladder, one step at a time, then stop at the floor', () => {
  const clock = { t: 0 };
  const policy = new AdaptivePixelRatioPolicy({ now: 0 });
  const changes = run(policy, clock, 40, 50); // 20 fps, forty seconds
  assert.deepEqual(changes.map((c) => c.level), [1, 2, 3], `levels: ${JSON.stringify(changes)}`);
  // First step needs the hold (3 s) plus a full window (2 s); the rest a hold + window each.
  assert.ok(changes[0].at >= 4900 && changes[0].at < 5200, `first step at ${changes[0].at}`);
  assert.ok(changes[1].at - changes[0].at >= 4900 && changes[1].at - changes[0].at < 5200);
  assert.equal(policy.level, LADDER.length - 1);
  assert.equal(policy.ratioFor(1.5), Math.max(PIXEL_RATIO_FLOOR, 1.5 * LADDER[3]));
});

test('a merely uneven frame rate does not step down', () => {
  const clock = { t: 0 };
  const policy = new AdaptivePixelRatioPolicy({ now: 0 });
  const changes = [];
  for (let i = 0; i < 2000; i++) {
    const dt = i % 2 ? 50 : 12; // half the frames slow: under the 75% bar
    clock.t += dt;
    const level = policy.sample(dt, clock.t);
    if (level !== null) changes.push(level);
  }
  assert.deepEqual(changes, []);
});

test('recovery is slow, gated by a backoff that doubles each time a level fails again', () => {
  const clock = { t: 0 };
  const policy = new AdaptivePixelRatioPolicy({ now: 0 });
  assert.deepEqual(run(policy, clock, 6, 50).map((c) => c.level), [1], 'one step down');
  const droppedAt = clock.t;
  // Comfortable frames from here on. Recovery needs 8 s of them AND the 15 s backoff.
  const early = run(policy, clock, 12, 10);
  assert.deepEqual(early, [], 'no climb inside the backoff');
  const later = run(policy, clock, 20, 10);
  assert.deepEqual(later.map((c) => c.level), [0], 'climbs back once the backoff has passed');
  assert.ok(later[0].at - droppedAt >= 15000, `waited ${later[0].at - droppedAt} ms`);
  // Fail at the top again: the next retry needs twice the wait.
  assert.deepEqual(run(policy, clock, 6, 50).map((c) => c.level), [1]);
  const droppedAgain = clock.t;
  const second = run(policy, clock, 60, 10);
  assert.deepEqual(second.map((c) => c.level), [0]);
  assert.ok(second[0].at - droppedAgain >= 30000, `second retry waited ${second[0].at - droppedAgain} ms`);
});

test('a hitch (hidden tab, stall) is not evidence and resets the windows', () => {
  const clock = { t: 0 };
  const policy = new AdaptivePixelRatioPolicy({ now: 0 });
  run(policy, clock, 4.5, 50);            // 1.5 s into a slow window
  clock.t += 5000;
  assert.equal(policy.sample(5000, clock.t), null, 'the 5-second gap changes nothing');
  const changes = run(policy, clock, 1.9, 50);
  assert.deepEqual(changes, [], 'the window restarted after the hitch');
  assert.deepEqual(run(policy, clock, 0.5, 50).map((c) => c.level), [1], 'and then completes');
});

test('the deterministic switch: automation, ?adaptiveDpr and ?dpr', () => {
  assert.equal(isDeterministicRun({ webdriver: true }, { search: '' }), true);
  assert.equal(isDeterministicRun({ webdriver: false }, { search: '' }), false);
  assert.equal(isDeterministicRun({}, { search: '?preview=1' }), false, 'a human preview still adapts');
  assert.equal(isDeterministicRun({ webdriver: true }, { search: '?adaptiveDpr=1' }), false, 'forced on for the mechanism check');
  assert.equal(isDeterministicRun({ webdriver: false }, { search: '?adaptiveDpr=0' }), true);
  assert.equal(isDeterministicRun({ webdriver: false }, { search: '?dpr=1' }), true, 'a pinned ratio holds still');
});

test('the initial ratio is the display capped, or the pin', () => {
  assert.equal(initialPixelRatio(PIXEL_RATIO_CAP, { dpr: 2, loc: { search: '' } }), 1.5);
  assert.equal(initialPixelRatio(PIXEL_RATIO_CAP_HEAVY, { dpr: 2, loc: { search: '' } }), 1.25);
  assert.equal(initialPixelRatio(PIXEL_RATIO_CAP, { dpr: 1, loc: { search: '' } }), 1);
  assert.equal(initialPixelRatio(PIXEL_RATIO_CAP, { dpr: 3, loc: { search: '?dpr=0.8' } }), 0.8);
  assert.equal(initialPixelRatio(PIXEL_RATIO_CAP, { dpr: undefined, loc: { search: '' } }), 1);
  assert.ok(PIXEL_RATIO_CAP_HEAVY < PIXEL_RATIO_CAP);
});

test('attachPixelRatio: fixed under automation, adaptive when asked, and it re-fits the scene on change', () => {
  const calls = [];
  const renderer = { setPixelRatio: (v) => calls.push(v) };
  const saved = {
    navigator: globalThis.navigator, location: globalThis.location,
    devicePixelRatio: globalThis.devicePixelRatio, requestAnimationFrame: globalThis.requestAnimationFrame,
    performance: globalThis.performance,
  };
  try {
    Object.defineProperty(globalThis, 'navigator', { value: { webdriver: true }, configurable: true, writable: true });
    globalThis.location = { search: '' };
    globalThis.devicePixelRatio = 2;
    globalThis.requestAnimationFrame = () => { throw new Error('must not schedule under automation'); };
    const fixed = attachPixelRatio(renderer);
    assert.equal(fixed.adaptive, false);
    assert.deepEqual(calls, [1.5]);

    // Adaptive: pump a fake rAF with slow frames and watch it step down and notify.
    calls.length = 0;
    globalThis.location = { search: '?adaptiveDpr=1' };
    const queue = [];
    globalThis.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
    let now = 1000;
    globalThis.performance = { now: () => now };
    let notified = 0;
    const control = attachPixelRatio(renderer, { cap: PIXEL_RATIO_CAP, onChange: () => { notified++; } });
    assert.equal(control.adaptive, true);
    assert.deepEqual(calls, [1.5]);
    for (let i = 0; i < 400; i++) {  // 400 x 50 ms = 20 s of a 20 fps machine
      now += 50;
      const cb = queue.shift();
      cb(now);
    }
    assert.ok(control.level >= 2, `stepped down under load, level ${control.level}`);
    assert.equal(notified, control.changes);
    assert.equal(calls.at(-1), control.ratio);
    assert.ok(control.ratio < 1.5 && control.ratio >= PIXEL_RATIO_FLOOR);
    control.dispose();
    const pending = queue.length;
    now += 50; queue.shift()(now);
    assert.equal(queue.length, pending - 1, 'a disposed controller stops rescheduling');
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: saved.navigator, configurable: true, writable: true });
    globalThis.location = saved.location;
    globalThis.devicePixelRatio = saved.devicePixelRatio;
    globalThis.requestAnimationFrame = saved.requestAnimationFrame;
    globalThis.performance = saved.performance;
  }
});
