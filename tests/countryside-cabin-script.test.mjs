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
import { callScript } from '../src/core/phone.js';

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

test('dungeon cleanup does not spoil future Wake or Billy scenes', () => {
  const wrap = cabinBeat('WRAP_INSTRUCTIONS').lines.map((entry) => entry.text ?? '').join(' ');
  const offer = cabinBeat('EXECUTION_OFFER').lines.map((entry) => entry.text ?? '').join(' ');
  assert.doesNotMatch(wrap, /\bWake\b|Billy HotDog/i);
  assert.match(offer, /sofa can['’]t tell us there is a mole/i);
  assert.doesNotMatch(offer, /sofa doesn['’]t know who the mole is/i);
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
  /* Six definitions remain for save/audio compatibility. Fresh Act One uses
   * five: Lou, Margo, Booski about Sasole, Gratin, and one Booski/Billy wake.
   * Ape's old morning call is data-only for retired post-heist saves. */
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
 * give that girl from the bar a call" -- and it stayed a browser event so
 * presentation and analytics can observe it. Beat 4 then ends on the one call
 * itself, which is authored here like every other call in the chapter. The
 * event must never be treated as permission to ring a second conversation.
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
  assert.equal(margoCalls[0].outgoing, true, 'Tony must choose to place this call');
  assert.equal(margoCalls[0].vo, 'call.margo.cabin_date',
    'materially changed lines must not reuse the old recordings');
  assert.equal(margoCalls[0].lines.length, 3, 'the scheduling call should stay short');
  /* Owner, 2026-08-31: "I should tell her the spot, not her to tell me the
   * spot." Front & Center is Tony's line now; hers accepts. And the dial is
   * answered — she has the pickup word before the exchange begins. */
  assert.doesNotMatch(margoCalls[0].lines.join(' '), /Front & Center/);
  assert.match(margoCalls[0].replies.join(' '), /Front & Center/);
  assert.equal(margoCalls[0].pickup, '…Hello?');
  assert.match(margoCalls[0].replies.join(' '), /Silver Room/);
  assert.match(margoCalls[0].lines.join(' '), /Nine o’clock/);
  const everyWord = [margoCalls[0].pickup, ...margoCalls[0].lines, ...margoCalls[0].replies].join(' ');
  assert.doesNotMatch(everyWord,
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/,
    'the call must not hard-code a weekday that can drift from the campaign clock');
  const turns = callScript(margoCalls[0]);
  assert.equal(turns[0].who, 'them');
  assert.equal(turns[0].text, '…Hello?', 'the dial is answered before anybody talks');
  assert.equal(turns[1].who, 'me');
  assert.match(turns[1].text, /Margo\. It’s Tony\./);
});
