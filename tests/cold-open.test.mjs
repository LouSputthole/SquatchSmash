/**
 * THE OPENING HAS TO SELL SQUATCH SMASH AS THE WHOLE GAME.
 *
 * The owner: *"the Squatch Smash game should be completely full screen and
 * when the user loads in they see it and go oh cool I guess this is the
 * game."* Two things have to be true for that, and both are checkable without
 * a browser:
 *
 *   1. The monitor FITS the viewport. It covered it until the owner's
 *      2026-09-02 playtest ("The opening is too full screen. You almost
 *      can't hit the resume button") -- overscan cropped the game's own
 *      edge UI, so the contract flipped: nothing cropped, the tight axis
 *      close against the border so it still reads as full screen.
 *   2. The phone does not ring during the reveal. The silence after the pull
 *      back is the beat the joke needs, and a call landing inside it steps on
 *      all of it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BEAT_S,
  COLD_OPEN_PHASES,
  ColdOpen,
  PULLBACK_S,
  SHUTDOWN_S,
  monitorFillDistance,
  pullbackEase,
} from '../src/core/cold-open.js';

/** What the frustum half-extents are at a given distance. */
const extents = (distance, fovDeg, aspect) => {
  const halfH = Math.tan((fovDeg * Math.PI / 180) / 2) * distance;
  return { halfH, halfW: halfH * aspect };
};

test('the monitor fits inside the viewport, on every shape of screen', () => {
  /* Fit, not cover, since 2026-09-01 — owner: "The opening is too full
   * screen. You almost can't hit the resume button." Cover cropped edge UI;
   * fit keeps every pixel of the game clickable, with the tight axis close
   * to the border so it still reads as full screen. */
  const screenW = 0.62;
  const screenH = 0.35;
  for (const aspect of [4 / 3, 16 / 10, 16 / 9, 21 / 9, 1, 0.6]) {
    for (const fovDeg of [55, 70, 85]) {
      const d = monitorFillDistance({ screenW, screenH, fovDeg, aspect });
      const { halfW, halfH } = extents(d, fovDeg, aspect);
      assert.ok(screenW / 2 <= halfW, `screen cropped horizontally at ${aspect}/${fovDeg}`);
      assert.ok(screenH / 2 <= halfH, `screen cropped vertically at ${aspect}/${fovDeg}`);
      const tight = Math.max((screenW / 2) / halfW, (screenH / 2) / halfH);
      assert.ok(tight > 0.9, `the tight axis stays near the border at ${aspect}/${fovDeg}`);
    }
  }
});

test('and it is not absurdly far: the margin is a margin, not a retreat', () => {
  const d = monitorFillDistance({ screenW: 0.62, screenH: 0.35, fovDeg: 70, aspect: 16 / 9 });
  const exact = monitorFillDistance({
    screenW: 0.62, screenH: 0.35, fovDeg: 70, aspect: 16 / 9, margin: 1,
  });
  assert.ok(d > exact, 'the margin backs the camera off');
  assert.ok(d < exact * 1.1, 'but only a little: 3% keeps it reading as full screen');
});

test('a portrait viewport is fitted by width rather than height', () => {
  /* The tall-and-narrow case is the one a naive "fit the height" gets wrong. */
  const d = monitorFillDistance({ screenW: 0.62, screenH: 0.35, fovDeg: 70, aspect: 0.5 });
  const { halfW, halfH } = extents(d, 70, 0.5);
  assert.ok(0.62 / 2 <= halfW && 0.35 / 2 <= halfH);
});

test('it refuses nonsense rather than returning a camera position', () => {
  assert.throws(() => monitorFillDistance({ screenW: 0, screenH: 1, fovDeg: 70, aspect: 1.7 }), RangeError);
  assert.throws(() => monitorFillDistance({ screenW: 1, screenH: 1, fovDeg: 0, aspect: 1.7 }), RangeError);
  assert.throws(() => monitorFillDistance({ screenW: 1, screenH: 1, fovDeg: 190, aspect: 1.7 }), RangeError);
  assert.throws(() => monitorFillDistance({ screenW: 1, screenH: 1, fovDeg: 70, aspect: 0 }), RangeError);
});

test('nothing moves until he quits', () => {
  const open = new ColdOpen();
  assert.equal(open.phase, 'playing');
  assert.deepEqual(open.update(10), [], 'ten seconds of playing changes nothing');
  assert.equal(open.phase, 'playing');
  assert.equal(open.pullbackK, 0);
  assert.equal(open.owningCamera, true);
});

test('quitting looks like closing before it looks like anything else', () => {
  const open = new ColdOpen();
  assert.equal(open.quit(), true);
  assert.equal(open.phase, 'shutdown');
  assert.deepEqual(open.update(SHUTDOWN_S * 0.5), [], 'still closing');
  assert.equal(open.pullbackK, 0, 'the camera has not moved yet');
});

test('the reveal fires once, when the camera starts to move', () => {
  const open = new ColdOpen();
  open.quit();
  const events = open.update(SHUTDOWN_S + 0.01);
  assert.deepEqual(events, ['reveal']);
  assert.equal(open.phase, 'pullback');
  assert.deepEqual(open.update(0.1), [], 'it does not fire again');
});

test('a slow rendered frame preserves wall time across the reveal seams', () => {
  const open = new ColdOpen();
  open.quit();

  /* The live failure was not a missing Quit event. Two WebGL scenes rendered
   * slowly, the apartment capped each frame to 0.05 seconds, and this five
   * second pull-back took several minutes. A single real-time step may cross
   * both short phases and must neither lose the overshoot nor skip events. */
  const events = open.update(SHUTDOWN_S + PULLBACK_S + 0.1);
  assert.deepEqual(events, ['reveal', 'land']);
  assert.equal(open.phase, 'beat');
  assert.ok(Math.abs(open.t - 0.1) < 1e-9, `expected 0.1s of the beat, got ${open.t}`);
  assert.equal(open.owningCamera, false);
});

test('the pull-back runs from the monitor to the chair and stops', () => {
  const open = new ColdOpen();
  open.quit();
  open.update(SHUTDOWN_S + 0.01);
  let last = 0;
  for (let t = 0; t < PULLBACK_S; t += 1 / 60) {
    open.update(1 / 60);
    if (open.phase !== 'pullback') break;
    assert.ok(open.pullbackK >= last, 'the dolly never goes backwards');
    last = open.pullbackK;
  }
  assert.equal(open.phase, 'beat');
  assert.equal(open.pullbackK, 1);
});

test('and then he is left alone for a good while', () => {
  const open = new ColdOpen();
  open.quit();
  open.update(SHUTDOWN_S + 0.01);
  open.update(PULLBACK_S + 0.01);
  assert.equal(open.phase, 'beat');
  assert.ok(BEAT_S >= 35, 'the silence is the point; do not trim it');

  /* THE REGRESSION THIS EXISTS FOR: the phone must not ring during the beat. */
  const early = open.update(BEAT_S * 0.9);
  assert.deepEqual(early, [], 'nothing rings while he is working it out');
  assert.equal(open.called, false);

  const late = open.update(BEAT_S * 0.2);
  assert.deepEqual(late, ['call']);
  assert.equal(open.phase, 'done');
});

test('the camera is handed back the moment the dolly lands', () => {
  const open = new ColdOpen();
  open.quit();
  open.update(SHUTDOWN_S + 0.01);
  assert.equal(open.owningCamera, true, 'held during the pull-back');
  open.update(PULLBACK_S + 0.01);
  assert.equal(open.owningCamera, false, 'he can look around during the beat');
});

test('the ease starts and ends still', () => {
  assert.equal(pullbackEase(0), 0);
  assert.equal(pullbackEase(1), 1);
  assert.ok(pullbackEase(0.02) < 0.02, 'slow off the monitor');
  assert.ok(pullbackEase(0.98) > 0.98, 'slow into the chair');
  assert.equal(pullbackEase(-3), 0);
  assert.equal(pullbackEase(9), 1);
});

test('quit only counts once', () => {
  const open = new ColdOpen();
  assert.equal(open.quit(), true);
  assert.equal(open.quit(), false, 'a second yes does not restart the sequence');
});

test('the phases are the ones the sequence actually uses', () => {
  const open = new ColdOpen();
  const seen = new Set([open.phase]);
  open.quit();
  seen.add(open.phase);
  for (const step of [SHUTDOWN_S + 0.01, PULLBACK_S + 0.01, BEAT_S + 0.01]) {
    open.update(step);
    seen.add(open.phase);
  }
  assert.deepEqual([...seen], [...COLD_OPEN_PHASES]);
});
