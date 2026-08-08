import assert from 'node:assert/strict';
import test from 'node:test';

import { videoChannel } from '../src/core/tv.js';

function fakeVideo({ readyState = 2 } = {}) {
  const listeners = new Map();
  return {
    currentTime: 0,
    readyState,
    muted: false,
    playCalls: 0,
    pauseCalls: 0,
    addEventListener(name, fn) { listeners.set(name, fn); },
    play() { this.playCalls += 1; return Promise.resolve(); },
    pause() { this.pauseCalls += 1; },
    emit(name) { listeners.get(name)?.(); },
  };
}

test('a video channel can begin at a deliberate in-point on every entry', () => {
  const previousDocument = globalThis.document;
  const video = fakeVideo();
  globalThis.document = { createElement: () => video };
  try {
    const channel = videoChannel({
      name: 'TEST TAPE', file: 'test.mp4', card: 'OFF AIR', glow: {}, startAt: 6,
    });

    channel.enter();
    assert.equal(video.currentTime, 6);

    video.currentTime = 48;
    video.emit('ended');
    assert.equal(video.currentTime, 6, 'the editorial cut should survive a full tape loop');

    video.currentTime = 21;
    channel.leave();
    channel.enter();
    assert.equal(video.currentTime, 6, 'retuning the channel should start at its editorial in-point');
    assert.equal(video.playCalls, 3);
    assert.equal(video.pauseCalls, 1);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('an in-point waits for metadata before the first play request', () => {
  const previousDocument = globalThis.document;
  const video = fakeVideo({ readyState: 0 });
  globalThis.document = { createElement: () => video };
  try {
    const channel = videoChannel({
      name: 'LOADING TAPE', file: 'loading.mp4', card: 'OFF AIR', glow: {}, startAt: 6,
    });

    channel.enter();
    assert.equal(video.playCalls, 0, 'play was requested before the editorial seek could be applied');

    video.readyState = 1;
    video.emit('loadedmetadata');
    assert.equal(video.currentTime, 6);
    assert.equal(video.playCalls, 1);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('Hog Mama television uses the six-second editorial in-point', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(
    new URL('../src/core/tv.js', import.meta.url), 'utf8',
  ));
  assert.match(source, /const HOG_MAMAS_SHOW = videoChannel\(\{[\s\S]*?startAt: 6,[\s\S]*?\}\);/);
});
