import assert from 'node:assert/strict';
import test from 'node:test';

import { createVideoChannel } from '../src/core/tv.js';

test('a trimmed television tape never plays its discarded opening', () => {
  const listeners = new Map();
  const video = {
    currentTime: 0,
    duration: 34,
    loop: false,
    muted: true,
    playsInline: false,
    preload: '',
    readyState: 2,
    playCount: 0,
    addEventListener(type, handler) { listeners.set(type, handler); },
    play() { this.playCount += 1; return Promise.resolve(); },
    pause() {},
  };
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement(type) {
      assert.equal(type, 'video');
      return video;
    },
  };

  try {
    const channel = createVideoChannel({
      name: 'trimmed tape', file: 'show.mp4', card: 'off air',
      glow: { colour: 0, intensity: 0 }, startAt: 6,
    });
    channel.enter();
    assert.equal(video.currentTime, 6);
    assert.equal(video.loop, false);

    video.currentTime = video.duration;
    listeners.get('ended')();
    assert.equal(video.currentTime, 6);
    assert.equal(video.playCount, 2);
  } finally {
    globalThis.document = originalDocument;
  }
});
