import assert from 'node:assert/strict';
import test from 'node:test';

import { AudioEngine } from '../src/core/audio.js';
import {
  DIALOGUE_ACCEPTANCE,
  SPEECH_GAP_S,
  SPEECH_MIX_CLOSE,
  SPEECH_MIX_INDOORS,
  speak,
  speakVariant,
} from '../src/core/dialogue.js';

function variantAudio() {
  const selected = [];
  const played = [];
  const held = [];
  const receipt = Object.freeze({
    id: 17,
    requested: 'vo.guard.warn.2',
    actual: 'vo.guard.warn.2',
    source: 'buffer',
    started: true,
    fallbackReason: null,
  });
  const source = { cue: receipt.actual, stop() {} };
  return {
    selected,
    played,
    held,
    receipt,
    source,
    selectVoiceVariant(group, options) {
      selected.push({ group, options });
      return receipt.actual;
    },
    hasSample: () => true,
    sampleDuration: () => 2.4,
    playWithReceipt(cue, options) {
      played.push({ cue, options });
      return { source, receipt };
    },
    hold: (seconds) => held.push(seconds),
  };
}

test('speakVariant selects once and preserves the complete dialogue Interface', () => {
  const audio = variantAudio();
  const speaker = { position: { x: 4, y: 1.7, z: -3 } };
  const position = { x: 4, y: 1.7, z: -3 };

  const result = speakVariant(audio, 'guard.warn', {
    chance: 0.75,
    speaker,
    position,
    mix: SPEECH_MIX_INDOORS,
    gain: 0.64,
    delay: 0.2,
    speakerId: 'front-guard',
    subtitle: 'You cannot come through here.',
  });

  assert.deepEqual(audio.selected, [{ group: 'guard.warn', options: { chance: 0.75 } }]);
  assert.equal(result.cue, 'vo.guard.warn.2');
  assert.equal(result.seconds, 2.4);
  assert.strictEqual(result.source, audio.source);
  assert.strictEqual(result.receipt, audio.receipt);
  assert.equal(result.subtitle, 'You cannot come through here.');
  assert.equal(result.acceptance.status, DIALOGUE_ACCEPTANCE.ACCEPTED);

  const [{ options }] = audio.played;
  assert.equal(options.bus, 'voice');
  assert.equal(options.analyse, true);
  assert.equal(options.requiredRecorded, true);
  assert.equal(options.volume, 0.64);
  assert.equal(options.delay, 0.2);
  assert.equal(options.speakerId, 'front-guard');
  assert.equal(options.subtitle, 'You cannot come through here.');
  assert.strictEqual(options.position, position);
  assert.strictEqual(options.follow, speaker);
  assert.equal(options.ref, SPEECH_MIX_INDOORS.ref);
  assert.equal(options.maxDist, SPEECH_MIX_INDOORS.maxDist);
  assert.equal(options.rolloff, SPEECH_MIX_INDOORS.rolloff);
  assert.equal(audio.held[0], 0.2 + 2.4 + SPEECH_GAP_S);
});

test('a close-mix variant cannot accidentally retain a positional follower', () => {
  const audio = variantAudio();
  const movingRadio = { position: { x: 30, y: 2, z: 8 } };

  speak(audio, 'vo.guard.warn.2', {
    mix: SPEECH_MIX_CLOSE,
    follow: movingRadio,
    position: movingRadio.position,
  });

  const [{ options }] = audio.played;
  assert.equal(options.follow, undefined);
  assert.equal(options.position, undefined);
  assert.equal(options.ref, undefined);
});

test('AudioEngine owns decoded bank invalidation and excludes empty takes', () => {
  const audio = new AudioEngine();
  audio.loadedCount = 1;
  audio.buffers.set('vo.door.wait.1', []);
  audio.buffers.set('vo.door.wait.2', [{ duration: 1.1 }]);

  assert.equal(audio.selectVoiceVariant('door.wait'), 'vo.door.wait.2');
  assert.equal(audio.selectVoiceVariant('late.bank'), null);

  audio.buffers.set('vo.late.bank.1', [{ duration: 0.8 }]);
  audio.loadedCount += 1;
  assert.equal(audio.selectVoiceVariant('late.bank'), 'vo.late.bank.1',
    'a bank requested before decode must become visible after residency changes');
});

test('legacy say delegates through speakVariant without losing spatial or subtitle options', () => {
  const audio = new AudioEngine();
  audio.ready = true;
  audio.ctx = { currentTime: 10 };
  audio.loadedCount = 1;
  audio.buffers.set('vo.guard.warn.1', [{ duration: 2.1 }]);
  const previous = { stopped: false, stop() { this.stopped = true; } };
  const next = { buffer: { duration: 2.1 }, stop() {} };
  const calls = [];
  audio._vo = previous;
  audio.playWithReceipt = (cue, options) => {
    calls.push({ cue, options });
    return {
      source: next,
      receipt: {
        id: 1,
        requested: cue,
        actual: cue,
        source: 'buffer',
        started: true,
        fallbackReason: null,
      },
    };
  };

  const follow = { position: { x: 8, y: 0, z: -2 } };
  const position = { x: 8, y: 1.5, z: -2 };
  assert.equal(audio.say('guard.warn', {
    volume: 0.6,
    delay: 0.3,
    follow,
    position,
    mix: SPEECH_MIX_INDOORS,
    speakerId: 'guard',
    subtitle: 'Stop.',
  }), true);

  assert.equal(previous.stopped, true);
  assert.strictEqual(audio.spokenSource(), next);
  assert.equal(calls[0].cue, 'vo.guard.warn.1');
  assert.equal(calls[0].options.volume, 0.6, 'legacy volume maps to canonical gain');
  assert.strictEqual(calls[0].options.follow, follow);
  assert.strictEqual(calls[0].options.position, position);
  assert.equal(calls[0].options.ref, SPEECH_MIX_INDOORS.ref);
  assert.equal(calls[0].options.speakerId, 'guard');
  assert.equal(calls[0].options.subtitle, 'Stop.');
  assert.ok(audio._busyUntil >= 10 + 0.3 + 2.1 + SPEECH_GAP_S);
});

test('a refused legacy bark does not cut the source already speaking', () => {
  const audio = new AudioEngine();
  audio.ready = true;
  const previous = { stopped: false, stop() { this.stopped = true; } };
  audio._vo = previous;

  assert.equal(audio.say('bank.that.is.not.decoded'), false);
  assert.equal(previous.stopped, false);
  assert.strictEqual(audio.spokenSource(), previous);
});

test('playback receipts bind subtitle, speaker, and spatial truth to one request', () => {
  const audio = new AudioEngine();
  const { source, receipt } = audio.playWithReceipt('vo.guard.warn.1', {
    bus: 'voice',
    speakerId: 'guard',
    subtitle: 'Stop.',
    position: { x: 3, y: 1, z: -9 },
    ref: 1.8,
    maxDist: 16,
    rolloff: 1,
  });

  assert.equal(source, null);
  assert.strictEqual(receipt, audio.lastPlaybackReceipt);
  assert.equal(receipt.requested, 'vo.guard.warn.1');
  assert.equal(receipt.speakerId, 'guard');
  assert.equal(receipt.subtitle, 'Stop.');
  assert.deepEqual(receipt.positional.position, { x: 3, y: 1, z: -9 });
  assert.equal(receipt.positional.ref, 1.8);
  assert.equal(receipt.positional.maxDist, 16);
  assert.equal(receipt.positional.rolloff, 1);
  assert.equal(receipt.fallbackReason, 'engine-not-ready');
});
