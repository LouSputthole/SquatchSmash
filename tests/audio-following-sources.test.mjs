/**
 * A sound that starts on something moving has to move with it.
 *
 * `play()` builds a PannerNode and sets its position once, which is right for
 * a gunshot and wrong for everything that talks. A line spoken by a walking
 * golfer, or a DJ link coming out of a golf cart being driven across a course,
 * gets pinned to wherever its speaker stood when the clip started -- so it
 * begins at the right level and then fades out as the listener drives away
 * from a sound that is no longer where the thing making it is.
 *
 * Loops never had this problem: `moveLoop` has always pushed a new position
 * into a live panner. These tests cover the same guarantee for one-shots, in
 * both the shapes a caller uses -- `follow` for "glue it on and forget", and
 * `setPlaybackPosition` for a caller already doing per-frame work.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { AudioEngine } from '../src/core/audio.js';

/** Enough of a WebAudio context to see where a panner was told to be. */
function fakeContext() {
  const made = [];
  const param = (value = 0) => ({
    value,
    setTargetAtTime(next) { this.value = next; return this; },
    setValueAtTime(next) { this.value = next; return this; },
    linearRampToValueAtTime(next) { this.value = next; return this; },
    cancelScheduledValues() { return this; },
  });
  const node = () => ({ connect() {}, disconnect() {} });
  const ctx = {
    currentTime: 0,
    destination: node(),
    listener: {},
    createGain: () => ({ ...node(), gain: param(1) }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param(), Q: param() }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      playbackRate: param(1),
      onended: null,
      start() {},
      stop() {},
    }),
    createPanner: () => {
      const p = {
        ...node(),
        panningModel: '',
        distanceModel: '',
        refDistance: 0,
        maxDistance: 0,
        rolloffFactor: 0,
        positionX: param(),
        positionY: param(),
        positionZ: param(),
      };
      made.push(p);
      return p;
    },
  };
  return { ctx, made };
}

/** An engine wired to the fake context, with one decoded cue ready to play. */
function engineWithCue(name = 'vo.test.line') {
  const { ctx, made } = fakeContext();
  const engine = new AudioEngine();
  engine.ctx = ctx;
  engine.ready = true;
  engine.busSfx = { connect() {}, disconnect() {} };
  engine.buffers.set(name, [{ duration: 4 }]);
  return { engine, made, name };
}

test('a one-shot played with a position gets a panner placed there', () => {
  const { engine, made, name } = engineWithCue();
  engine.play(name, { position: { x: 1, y: 2, z: 3 } });
  assert.equal(made.length, 1);
  assert.deepEqual(
    [made[0].positionX.value, made[0].positionY.value, made[0].positionZ.value],
    [1, 2, 3],
  );
});

test('setPlaybackPosition moves a sound that has already started', () => {
  const { engine, made, name } = engineWithCue();
  const source = engine.play(name, { position: { x: 0, y: 0, z: 0 } });
  assert.ok(source, 'play returned no handle');

  assert.equal(engine.setPlaybackPosition(source, { x: 9, y: 0, z: -4 }), true);
  assert.equal(made[0].positionX.value, 9);
  assert.equal(made[0].positionZ.value, -4);
});

test('a sound played without a position has no panner to move', () => {
  const { engine, name } = engineWithCue();
  const source = engine.play(name, {});
  assert.equal(engine.setPlaybackPosition(source, { x: 1, y: 1, z: 1 }), false);
});

test('follow keeps the sound on its object as the object moves', () => {
  const { engine, made, name } = engineWithCue();
  /* Stands in for a radio on a golf cart: an Object3D whose world position
   * changes every frame while the clip is still running. */
  const cart = {
    at: { x: 0, y: 1, z: 0 },
    getWorldPosition(out) {
      out.set(this.at.x, this.at.y, this.at.z);
      return out;
    },
  };

  engine.play(name, { follow: cart });
  assert.equal(made.length, 1, 'follow did not create a panner');
  assert.equal(made[0].positionX.value, 0);

  cart.at = { x: 30, y: 1, z: -12 };
  engine.serviceFollowers();

  assert.equal(made[0].positionX.value, 30, 'the sound did not follow the cart');
  assert.equal(made[0].positionZ.value, -12);
});

test('follow accepts a getter, for a speaker chosen at play time', () => {
  const { engine, made, name } = engineWithCue();
  let where = { x: 2, y: 0, z: 2 };
  engine.play(name, { follow: () => where });
  assert.equal(made[0].positionX.value, 2);

  where = { x: -6, y: 0, z: 11 };
  engine.serviceFollowers();
  assert.equal(made[0].positionX.value, -6);
  assert.equal(made[0].positionZ.value, 11);
});

test('a follower stops being serviced once its source ends', () => {
  const { engine, made, name } = engineWithCue();
  const moving = { x: 0, y: 0, z: 0 };
  const source = engine.play(name, { follow: moving });
  assert.equal(engine._following.size, 1);

  source.onended?.();
  assert.equal(engine._following.size, 0, 'the follower outlived its sound');

  moving.x = 99;
  engine.serviceFollowers();
  assert.notEqual(made[0].positionX.value, 99, 'an ended sound was still being moved');
});

test('callers can ask for a gentler rolloff than a footstep gets', () => {
  const { engine, made, name } = engineWithCue();
  engine.play(name, { position: { x: 0, y: 0, z: 0 } });
  assert.equal(made[0].rolloffFactor, 1.4, 'the default curve changed');

  engine.play(name, { position: { x: 0, y: 0, z: 0 }, rolloff: 0.7, ref: 3, maxDist: 60 });
  assert.equal(made[1].rolloffFactor, 0.7);
  assert.equal(made[1].refDistance, 3);
  assert.equal(made[1].maxDistance, 60);
});
