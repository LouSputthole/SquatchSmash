import assert from 'node:assert/strict';
import test from 'node:test';

import { AudioEngine, RequiredRecordedAudioError } from '../src/core/audio.js';

function param(value = 0) {
  return {
    value,
    setValueAtTime(next) { this.value = next; },
    setTargetAtTime(next) { this.value = next; },
    linearRampToValueAtTime(next) { this.value = next; },
    exponentialRampToValueAtTime(next) { this.value = next; },
    cancelScheduledValues() {},
  };
}

function node(extra = {}) {
  return { connect() {}, disconnect() {}, ...extra };
}

function readyAudio(options = {}) {
  const ctx = {
    currentTime: 4,
    sampleRate: 8_000,
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ frequency: param(), Q: param() }),
    createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => node({
      buffer: null, playbackRate: param(1), start() {}, stop() {}, onended: null,
    }),
    createOscillator: () => node({ frequency: param(), start() {}, stop() {} }),
    createPanner: () => node({
      positionX: param(), positionY: param(), positionZ: param(),
    }),
  };
  const audio = new AudioEngine(options);
  audio.ctx = ctx;
  audio.ready = true;
  audio.busSfx = node();
  audio.busVoice = node();
  return audio;
}

test('a play request before audio is ready leaves a factual silent receipt', () => {
  const audio = new AudioEngine();

  assert.equal(audio.play('vo.scene.open', {
    requiredRecorded: true,
    position: { x: 3, y: 1.5, z: -2 },
    ref: 2.2,
    maxDist: 30,
    rolloff: 0.7,
  }), null);

  assert.deepEqual(audio.lastPlaybackReceipt, {
    id: 1,
    requested: 'vo.scene.open',
    actual: null,
    source: 'silent',
    requiredRecorded: true,
    started: false,
    fallbackReason: 'engine-not-ready',
    scheduledAt: null,
    voice: true,
    speakerId: null,
    ambient: false,
    positional: {
      enabled: true,
      position: { x: 3, y: 1.5, z: -2 },
      follows: false,
      ref: 2.2,
      maxDist: 30,
      rolloff: 0.7,
      distanceModel: 'inverse',
    },
  });
});

test('direct VO bypasses remain required in strict QA unless explicitly reviewed otherwise', () => {
  const audio = new AudioEngine();
  audio.play('vo.scene.direct');
  assert.equal(audio.lastPlaybackReceipt.voice, true);
  assert.equal(audio.lastPlaybackReceipt.requiredRecorded, true);

  audio.play('vo.scene.procedural', { requiredRecorded: false });
  assert.equal(audio.lastPlaybackReceipt.requiredRecorded, false);
});

test('a decoded cue returns its legacy source and records the actual buffer playback', () => {
  const audio = readyAudio();
  audio.buffers.set('vo.scene.open', [{ duration: 2.5 }]);

  const source = audio.play('vo.scene.open', {
    bus: 'voice', requiredRecorded: true, speakerId: 'LOU',
    position: { x: 1, y: 2, z: 3 },
  });

  assert.ok(source, 'play() must retain its source-or-null return contract');
  assert.equal(source.buffer.duration, 2.5);
  assert.deepEqual(audio.lastPlaybackReceipt, {
    id: 1,
    requested: 'vo.scene.open',
    actual: 'vo.scene.open',
    source: 'buffer',
    requiredRecorded: true,
    started: true,
    fallbackReason: null,
    scheduledAt: 4,
    voice: true,
    speakerId: 'LOU',
    ambient: false,
    positional: {
      enabled: true,
      position: { x: 1, y: 2, z: 3 },
      follows: false,
      ref: 1.4,
      maxDist: 18,
      rolloff: 1.4,
      distanceModel: 'inverse',
    },
  });
});

test('a missing optional cue records the synth fallback without becoming an error', () => {
  const audio = readyAudio();

  assert.equal(audio.play('ambience.optional'), null);
  assert.deepEqual(audio.lastPlaybackReceipt, {
    id: 1,
    requested: 'ambience.optional',
    actual: 'ambience.optional',
    source: 'synth',
    requiredRecorded: false,
    started: true,
    fallbackReason: 'recording-not-decoded',
    scheduledAt: 4,
    voice: false,
    speakerId: null,
    ambient: false,
    positional: {
      enabled: false,
      position: null,
      follows: false,
      ref: 1.4,
      maxDist: 18,
      rolloff: 1.4,
      distanceModel: 'inverse',
    },
  });
});

test('a stand-in receipt preserves both the requested and actual cue', () => {
  const audio = readyAudio();
  audio.buffers.set('gun.shot', [{ duration: 0.4 }]);

  const source = audio.play('gun.shot', {
    requestedCue: 'shotgun.fire',
    receiptSource: 'stand-in',
    fallbackReason: 'requested-recording-not-decoded',
  });

  assert.ok(source);
  assert.equal(audio.lastPlaybackReceipt.requested, 'shotgun.fire');
  assert.equal(audio.lastPlaybackReceipt.actual, 'gun.shot');
  assert.equal(audio.lastPlaybackReceipt.source, 'stand-in');
  assert.equal(audio.lastPlaybackReceipt.fallbackReason, 'requested-recording-not-decoded');
});

test('strict QA reports and throws when a required recording falls back', () => {
  const reported = [];
  const audio = readyAudio({
    strictQa: true,
    onQaViolation: (receipt) => reported.push(receipt),
  });

  assert.throws(
    () => audio.play('vo.required.missing', { bus: 'voice', requiredRecorded: true }),
    (error) => error instanceof RequiredRecordedAudioError
      && error.receipt.requested === 'vo.required.missing'
      && error.receipt.source === 'synth',
  );
  assert.equal(reported.length, 1);
  assert.strictEqual(reported[0], audio.lastPlaybackReceipt);
  assert.deepEqual(audio.qaViolations, [audio.lastPlaybackReceipt]);
  assert.equal(audio.lastPlaybackReceipt.started, false);
});

test('strict QA rejects a decoded stand-in before its source can start', () => {
  const audio = readyAudio({ strictQa: true });
  audio.buffers.set('gun.shot', [{ duration: 0.4 }]);
  let sourcesCreated = 0;
  audio.ctx.createBufferSource = () => {
    sourcesCreated += 1;
    return node({ buffer: null, playbackRate: param(1), start() {}, stop() {}, onended: null });
  };

  assert.throws(() => audio.play('gun.shot', {
    requestedCue: 'shotgun.fire',
    receiptSource: 'stand-in',
    fallbackReason: 'requested-recording-not-decoded',
    requiredRecorded: true,
  }), RequiredRecordedAudioError);
  assert.equal(sourcesCreated, 0);
  assert.equal(audio.lastPlaybackReceipt.source, 'stand-in');
  assert.equal(audio.lastPlaybackReceipt.started, false);
});

test('strict QA leaves optional ambience fallback compatible', () => {
  const audio = readyAudio({ strictQa: true });

  assert.doesNotThrow(() => audio.play('ambience.optional'));
  assert.equal(audio.lastPlaybackReceipt.source, 'synth');
  assert.deepEqual(audio.qaViolations, []);
});

test('browser certification can install strict QA before private scene engines boot', () => {
  const previous = globalThis.__SQUATCH_QA_AUDIO__;
  const engines = [];
  globalThis.__SQUATCH_QA_AUDIO__ = { strictRequiredRecordings: true, engines };
  try {
    const audio = readyAudio();
    assert.strictEqual(engines[0], audio);
    assert.throws(
      () => audio.play('vo.required.browser', { requiredRecorded: true }),
      RequiredRecordedAudioError,
    );
  } finally {
    if (previous === undefined) delete globalThis.__SQUATCH_QA_AUDIO__;
    else globalThis.__SQUATCH_QA_AUDIO__ = previous;
  }
});

test('playWithReceipt exposes the matching receipt without changing play()', () => {
  const audio = readyAudio();
  audio.buffers.set('scene.line', [{ duration: 1.2 }]);

  const { source, receipt } = audio.playWithReceipt('scene.line');

  assert.ok(source);
  assert.strictEqual(receipt, audio.lastPlaybackReceipt);
  assert.equal(receipt.source, 'buffer');
});

test('ordinary playback-log rotation cannot erase strict-QA violations', () => {
  const audio = readyAudio({ strictQa: true });
  assert.throws(() => audio.play('required.missing', { requiredRecorded: true }));
  assert.equal(audio.playbackReceipts.length, 1);
  assert.equal(audio.qaViolations.length, 1);

  audio.clearPlaybackLog();

  assert.equal(audio.lastPlaybackReceipt, null);
  assert.equal(audio.qaViolations.length, 1);
  audio.clearQaViolations();
  assert.deepEqual(audio.qaViolations, []);
});

test('receipt collection cannot make an unresolved follower throw before init', () => {
  const audio = new AudioEngine();
  let resolutions = 0;
  assert.doesNotThrow(() => audio.play('scene.line', {
    follow: () => {
      resolutions++;
      throw new Error('scene cast not built yet');
    },
  }));
  assert.equal(resolutions, 0, 'telemetry evaluated a follower on an early return');
  assert.equal(audio.lastPlaybackReceipt.positional.enabled, false);
});

test('receipt collection reuses the routed follower position without resolving it twice', () => {
  const audio = readyAudio();
  audio.buffers.set('scene.line', [{ duration: 1 }]);
  let resolutions = 0;

  audio.play('scene.line', {
    follow: () => {
      resolutions++;
      return { x: 4, y: 2, z: -3 };
    },
  });

  assert.equal(resolutions, 1);
  assert.deepEqual(audio.lastPlaybackReceipt.positional.position, { x: 4, y: 2, z: -3 });
});
