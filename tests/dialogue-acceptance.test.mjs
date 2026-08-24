import assert from 'node:assert/strict';
import test from 'node:test';

import { AudioEngine } from '../src/core/audio.js';
import {
  DIALOGUE_ACCEPTANCE,
  DialogueSequence,
  speak,
} from '../src/core/dialogue.js';

function legacyAudio({ decoded = true } = {}) {
  const calls = [];
  return {
    calls,
    hasSample: () => decoded,
    sampleDuration: () => 1,
    play(cue, options) {
      const source = { cue, stop() {} };
      calls.push({ cue, options, source });
      return source;
    },
    hold() {},
  };
}

test('legacy dialogue callers remain accepted and authored lines default to required recordings', () => {
  const audio = legacyAudio();

  const result = speak(audio, 'scene.line');

  assert.strictEqual(result.source, audio.calls[0].source);
  assert.equal(result.silent, false);
  assert.equal(audio.calls[0].options.requiredRecorded, true);
  assert.deepEqual(result.acceptance, {
    status: DIALOGUE_ACCEPTANCE.ACCEPTED,
    reason: null,
    receipt: null,
  });
});

test('a temporarily unavailable audio engine tells a queue to retry', () => {
  const receipt = Object.freeze({
    id: 9,
    requested: 'scene.line',
    actual: null,
    source: 'silent',
    started: false,
    fallbackReason: 'engine-not-ready',
  });
  const audio = {
    hasSample: () => true,
    sampleDuration: () => 1,
    playWithReceipt: () => ({ source: null, receipt }),
    hold() {},
  };

  const result = speak(audio, 'scene.line');

  assert.deepEqual(result.acceptance, {
    status: DIALOGUE_ACCEPTANCE.RETRY,
    reason: 'engine-not-ready',
    receipt,
  });
});

test('speak reads retry acceptance from the real AudioEngine receipt path', () => {
  const audio = new AudioEngine();

  const result = speak(audio, 'vo.scene.wait');

  assert.equal(result.acceptance.status, DIALOGUE_ACCEPTANCE.RETRY);
  assert.equal(result.acceptance.reason, 'engine-not-ready');
  assert.strictEqual(result.receipt, audio.lastPlaybackReceipt);
  assert.equal(result.receipt.requiredRecorded, true);
});

test('a missing audio adapter tells a queue to drop rather than retry forever', () => {
  const result = speak(null, 'scene.line');

  assert.equal(result.source, null);
  assert.equal(result.silent, true);
  assert.deepEqual(result.acceptance, {
    status: DIALOGUE_ACCEPTANCE.DROP,
    reason: 'audio-unavailable',
    receipt: null,
  });
});

test('DialogueSequence records acceptance without changing legacy pacing', () => {
  const audio = legacyAudio();
  const sequence = new DialogueSequence(audio, { gap: 0 });
  sequence.play([{ cue: 'one' }, { cue: 'two' }]);

  for (let elapsed = 0; elapsed < 4 && !sequence.done; elapsed += 0.1) sequence.update(0.1);

  assert.equal(sequence.done, true);
  assert.deepEqual(sequence.spoken.map(({ cue, acceptance }) => [cue, acceptance]), [
    ['one', DIALOGUE_ACCEPTANCE.ACCEPTED],
    ['two', DIALOGUE_ACCEPTANCE.ACCEPTED],
  ]);
});

test('DialogueSequence retries a temporary refusal without consuming the line', () => {
  let attempts = 0;
  let holds = 0;
  const audio = {
    hasSample: () => true,
    sampleDuration: () => 0.2,
    playWithReceipt(cue) {
      attempts += 1;
      const started = attempts > 1;
      return {
        source: started ? { cue } : null,
        receipt: {
          id: attempts,
          requested: cue,
          actual: started ? cue : null,
          source: started ? 'buffer' : 'silent',
          started,
          fallbackReason: started ? null : 'engine-not-ready',
        },
      };
    },
    hold: () => { holds += 1; },
  };
  const lines = [];
  const sequence = new DialogueSequence(audio, {
    gap: 0,
    retryDelay: 0.01,
    onLine: (line) => lines.push(line.cue),
  });
  sequence.play([{ cue: 'one' }]);

  sequence.update(0.1);
  assert.equal(sequence.index, -1);
  assert.deepEqual(sequence.spoken, []);
  assert.equal(holds, 0);
  sequence.update(0.1);
  assert.equal(sequence.index, 0);
  assert.deepEqual(lines, ['one']);
  assert.equal(holds, 1);
  assert.deepEqual(sequence.attempts.map(({ acceptance }) => acceptance), ['retry', 'accepted']);
});
