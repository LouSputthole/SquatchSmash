import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TV_AUDIO_SPATIAL_PROFILE,
  tvGainAtDistance,
  videoChannel,
} from '../src/core/tv.js';

test('television audibility is full nearby, monotonic, and quiet outside the room', () => {
  const { refDistance, outsideRoomDistance } = TV_AUDIO_SPATIAL_PROFILE;
  const distances = [0, refDistance, 5, 8, 11, outsideRoomDistance, 30];
  const gains = distances.map(tvGainAtDistance);

  assert.equal(gains[0], 1, 'standing at the set should keep its authored volume');
  assert.equal(gains[1], 1, 'the near field should keep its authored volume');
  for (let i = 1; i < gains.length; i++) {
    assert.ok(
      gains[i] <= gains[i - 1],
      `TV gain rose from ${gains[i - 1]} to ${gains[i]} while walking away`,
    );
  }
  assert.ok(
    tvGainAtDistance(outsideRoomDistance) <= 0.02,
    'a TV outside its room should be no louder than two percent',
  );
  assert.ok(
    tvGainAtDistance(outsideRoomDistance + 20) <= 0.02,
    'walking farther away must not reveal a non-zero PannerNode floor',
  );
});

function audioNode(extra = {}) {
  return {
    connections: [],
    connect(target) { this.connections.push(target); return target; },
    ...extra,
  };
}

test('an audible video channel uses the shared room-limited Panner profile', (t) => {
  const previousDocument = globalThis.document;
  const video = {
    readyState: 2,
    muted: false,
    paused: false,
    ended: false,
    currentSrc: 'http://test/assets/video/room-test.mp4',
    addEventListener() {},
    play() { return Promise.resolve(); },
    pause() {},
  };
  globalThis.document = { createElement: () => video };
  t.after(() => { globalThis.document = previousDocument; });

  const mediaSource = audioNode();
  const tone = audioNode({ frequency: { value: 0 } });
  const mediaGain = audioNode({ gain: { value: 0 } });
  const panner = audioNode({
    positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 },
  });
  const busMusic = audioNode();
  const listener = {
    positionX: { value: 6 }, positionY: { value: 2 }, positionZ: { value: -7 },
  };
  const audio = {
    ready: true,
    busMusic,
    ctx: {
      state: 'running',
      listener,
      createMediaElementSource: () => mediaSource,
      createBiquadFilter: () => tone,
      createGain: () => mediaGain,
      createPanner: () => panner,
    },
  };
  const channel = videoChannel({
    name: 'ROOM TEST', file: 'room-test.mp4', card: 'OFF AIR', glow: {},
  });

  channel.enter({ audio, position: { x: 4, y: 2, z: -7 } });

  assert.equal(video.muted, false, 'near-field playback should retain its authored media gain');
  assert.equal(mediaGain.gain.value, 0.9);
  assert.equal(panner.distanceModel, TV_AUDIO_SPATIAL_PROFILE.distanceModel);
  assert.equal(panner.refDistance, TV_AUDIO_SPATIAL_PROFILE.refDistance);
  assert.equal(panner.maxDistance, TV_AUDIO_SPATIAL_PROFILE.maxDistance);
  assert.equal(panner.rolloffFactor, TV_AUDIO_SPATIAL_PROFILE.rolloffFactor);
  assert.deepEqual(
    [mediaSource.connections[0], tone.connections[0], mediaGain.connections[0], panner.connections[0]],
    [tone, mediaGain, panner, busMusic],
    'media must pass through tone, authored gain, and the spatial Panner before the music bus',
  );

  const live = channel.debugAudio();
  assert.equal(live.wired, true);
  assert.equal(live.graphConnected, true);
  assert.equal(live.contextState, 'running');
  assert.equal(live.video.playing, true);
  assert.equal(live.video.muted, false);
  assert.match(live.video.src, /room-test\.mp4$/);
  assert.deepEqual(live.source, { x: 4, y: 2, z: -7 });
  assert.deepEqual(live.listener, { x: 6, y: 2, z: -7 });
  assert.equal(live.distance, 2);
  assert.equal(live.mediaGain, 0.9);
  assert.equal(live.spatialGain, 1);
  assert.equal(live.effectiveGain, 0.9);
  assert.deepEqual(live.panner, TV_AUDIO_SPATIAL_PROFILE);
});
