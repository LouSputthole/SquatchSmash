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
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls.map((call) => call.vo)).size, calls.length);
  for (const call of calls) {
    assert.equal(call.allowHangup, false, `${call.id} must finish naturally`);
    assert.equal(call.lines.length, call.replies.length);
    assert.ok(call.lines.length >= 3);
  }
});

test('Margo is an external one-shot hook, not a duplicate authored call', () => {
  assert.equal(MARGO_CALL_READY.afterExplorationCount, 1);
  assert.equal(MARGO_CALL_READY.eventName, 'squatch:cabin-margo-call-ready');
  assert.equal(
    Object.values(CABIN_PHONE_CALLS).some((call) => /margo/i.test(call.from + call.vo)),
    false,
  );
});
