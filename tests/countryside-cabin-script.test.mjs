import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CABIN_BEATS,
  CABIN_PHONE_CALLS,
  CABIN_REQUIRED_LINES,
  MARGO_CALL_READY,
  cabinBeat,
  cabinBeatActions,
  cabinScriptCues,
} from '../src/cabin/script.js';

test('Cabin dungeon script has stable unique voice cues', () => {
  const cues = cabinScriptCues();
  assert.ok(cues.length >= 90, 'the complete chapter should have a production-sized VO list');
  assert.equal(new Set(cues.map((entry) => entry.name)).size, cues.length);
  assert.ok(cues.every((entry) => entry.name.startsWith('vo.')));
  assert.ok(cues.every((entry) => entry.voice && entry.say && entry.beat));
});

test('owner-authored interrogation jokes and clues are preserved exactly', () => {
  const text = cabinScriptCues().map((entry) => entry.say);
  for (const required of Object.values(CABIN_REQUIRED_LINES)) {
    assert.ok(text.includes(required), 'missing required line: ' + required);
  }
});

test('execution offer carries a ten-second yes/no action and both outcomes', () => {
  const actions = cabinBeatActions('EXECUTION_OFFER');
  assert.deepEqual(actions.filter((entry) => entry.action).map((entry) => ({
    action: entry.action,
    seconds: entry.seconds,
  })), [{ action: 'execution-choice', seconds: 10 }]);
  assert.ok(cabinBeat('EXECUTION_YES'));
  assert.ok(cabinBeat('EXECUTION_NO'));
  assert.ok(cabinBeat('EXECUTION_TIMEOUT'));
  assert.ok(cabinBeat('GRATIN_EXECUTES'));
});

test('bonfire sequence contains explicit player-controlled drink checkpoints', () => {
  const actions = CABIN_BEATS.flatMap((beat) => beat.lines
    .filter((entry) => entry.action)
    .map((entry) => ({ beat: beat.id, action: entry.action })));
  assert.ok(actions.some((entry) => entry.action === 'drink-beer'));
  assert.ok(actions.filter((entry) => entry.action === 'drink-whiskey').length >= 2);
  assert.ok(actions.some((entry) => entry.action === 'smoke'));
});

test('phone calls retain caller/reply parity and distinct cue banks', () => {
  const calls = Object.values(CABIN_PHONE_CALLS);
  /* Six: Lou on the first morning, Margo after the four walks, Booski about
   * the Captain, Gratin on the second morning, Ape after the blackout, and
   * Booski again about Billy. Three of those are the beats the bible moved
   * onto this porch when the cabin became an Act-One scene. */
  assert.equal(calls.length, 6);
  assert.equal(new Set(calls.map((call) => call.vo)).size, calls.length);
  for (const call of calls) {
    assert.equal(call.allowHangup, false, `${call.id} must finish naturally`);
    assert.equal(call.lines.length, call.replies.length);
    assert.ok(call.lines.length >= 3);
  }
});

/**
 * The hook and the call are two different things, and both now exist.
 *
 * MARGO_CALL_READY is the one-line setup on the first walk -- "maybe I should
 * give that girl from the bar a call" -- and it stayed an external event so
 * the owner could hang anything he liked off it. Beat 4 then ends on the call
 * itself, which is authored here like every other call in the chapter. The
 * thing worth holding is that the SETUP is still a hook: it fires once, on the
 * first walk, and it is not the call.
 */
test('Margo has both a one-shot setup hook and the authored call it sets up', () => {
  assert.equal(MARGO_CALL_READY.afterExplorationCount, 1);
  assert.equal(MARGO_CALL_READY.eventName, 'squatch:cabin-margo-call-ready');
  assert.equal(MARGO_CALL_READY.setupBeat, 'FIRST_EXPLORATION');

  const margoCalls = Object.values(CABIN_PHONE_CALLS)
    .filter((call) => /margo/i.test(`${call.from}${call.vo}`));
  assert.equal(margoCalls.length, 1, 'exactly one authored Margo call');
  assert.equal(margoCalls[0].id, 'cabin.margo.first_call');
  assert.equal(margoCalls[0].caller.voice, 'margo');
});
