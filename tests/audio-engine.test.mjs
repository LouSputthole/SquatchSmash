import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/core/audio.js';
import { loadOnceRetriable, runWorkerPool } from '../src/core/load-queue.js';

test('concurrent and repeated manifest loads share one immutable result', async () => {
  const owner = { pending: null };
  let calls = 0;
  let finish;
  const loader = () => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  };
  const load = () => loadOnceRetriable(owner, 'pending', loader);

  const first = load();
  const concurrent = load();
  assert.strictEqual(concurrent, first);
  assert.equal(calls, 1);

  finish({ total: 1457, loaded: 1276 });
  const result = await first;
  assert.deepEqual(result, { total: 1457, loaded: 1276 });
  assert.strictEqual(load(), first);
  assert.equal(calls, 1);
});

test('a failed manifest load can be retried', async () => {
  const owner = { pending: null };
  let calls = 0;
  const loader = async () => {
    calls++;
    if (calls === 1) throw new Error('temporary read failure');
    return { total: 1, loaded: 1 };
  };
  const load = () => loadOnceRetriable(owner, 'pending', loader);

  await assert.rejects(load(), /temporary read failure/);
  assert.deepEqual(await load(), { total: 1, loaded: 1 });
  assert.equal(calls, 2);
});

test('sample loading is bounded instead of flooding the browser', async () => {
  let active = 0;
  let peak = 0;
  let loaded = 0;
  const loadOne = async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    loaded++;
  };

  await runWorkerPool(Array.from({ length: 48 }, (_, i) => ({ name: `cue.${i}` })), loadOne, 7);
  assert.equal(loaded, 48);
  assert.ok(peak > 1, `expected parallel work, observed ${peak}`);
  assert.ok(peak <= 7, `expected at most 7 concurrent loads, observed ${peak}`);
});

test('large scenes can prefetch a later audio chapter without decoding it at startup', async () => {
  const engine = new AudioEngine();
  engine.manifest = {
    sfx: [
      { name: 'vo.golf.h1.lou.open' },
      { name: 'vo.golf.h2.lou.open' },
      { name: 'vo.golf.h3.lou.open' },
      { name: 'golf.cup' },
    ],
  };
  engine._manifestLoadPromise = Promise.resolve({ total: 1, loaded: 1 });
  engine._availableFiles = new Set(engine.manifest.sfx.map((cue) => `${cue.name}.mp3`));
  engine.buffers.set('vo.golf.h1.lou.open', [{}]);
  const decoded = [];
  engine._loadWanted = async (wanted) => {
    for (const cue of wanted) {
      decoded.push(cue.name);
      engine.buffers.set(cue.name, [{}]);
      engine.loadedCount++;
    }
  };

  assert.deepEqual(await engine.loadAdditional({
    names: ['golf.cup'],
    prefixes: ['vo.golf.h2.', 'vo.golf.h3.'],
  }), { total: 3, loaded: 3 });
  assert.deepEqual(decoded, [
    'vo.golf.h2.lou.open',
    'vo.golf.h3.lou.open',
    'golf.cup',
  ]);

  // The same prefetch scope is idempotent and never decodes a second copy.
  assert.deepEqual(await engine.loadAdditional({
    names: ['golf.cup'],
    prefixes: ['vo.golf.h2.', 'vo.golf.h3.'],
  }), { total: 3, loaded: 3 });
  assert.equal(decoded.length, 3);
});

function audioParam(value = 0) {
  return {
    value,
    cancelScheduledValues() {},
    setValueAtTime(next) { this.value = next; },
    linearRampToValueAtTime(next) { this.value = next; },
    exponentialRampToValueAtTime(next) { this.value = next; },
    setTargetAtTime(next) { this.value = next; },
  };
}

function audioNode(extra = {}) {
  return {
    connections: [],
    connect(target) { this.connections.push(target); return target; },
    disconnect() { this.disconnected = true; },
    ...extra,
  };
}

test('long music loops stream through a media element and release it when stopped', async (t) => {
  const RealAudio = globalThis.Audio;
  const realWindow = globalThis.window;
  const realFetch = globalThis.fetch;
  const elements = [];
  const inputListeners = new Map();
  let fetches = 0;
  let throwOnPlay = false;
  let blockOnPlay = false;

  const fakeWindow = {
    addEventListener(name, listener) { inputListeners.set(name, listener); },
    removeEventListener(name, listener) {
      if (inputListeners.get(name) === listener) inputListeners.delete(name);
    },
    dispatch(name) { inputListeners.get(name)?.({ type: name, isTrusted: true }); },
  };

  class FakeAudio {
    constructor() {
      this.listeners = new Map();
      this.paused = true;
      elements.push(this);
    }

    addEventListener(name, listener) { this.listeners.set(name, listener); }
    removeEventListener(name) { this.listeners.delete(name); }
    play() {
      if (throwOnPlay) throw new Error('media policy rejected playback');
      if (blockOnPlay) {
        const error = new Error('a fresh gesture is required');
        error.name = 'NotAllowedError';
        return Promise.reject(error);
      }
      this.paused = false;
      return Promise.resolve();
    }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() { this.released = !this.src; }
  }

  globalThis.Audio = FakeAudio;
  globalThis.window = fakeWindow;
  globalThis.fetch = async () => {
    fetches++;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  t.after(() => {
    globalThis.Audio = RealAudio;
    globalThis.window = realWindow;
    globalThis.fetch = realFetch;
  });

  const mediaSources = [];
  const ctx = {
    currentTime: 4,
    createGain: () => audioNode({ gain: audioParam() }),
    createBiquadFilter: () => audioNode({ frequency: audioParam(20_000) }),
    createPanner: () => audioNode({
      positionX: { value: 0 },
      positionY: { value: 0 },
      positionZ: { value: 0 },
    }),
    createMediaElementSource: (element) => {
      const source = audioNode({ mediaElement: element });
      mediaSources.push(source);
      return source;
    },
  };
  const engine = new AudioEngine();
  engine.ctx = ctx;
  engine.ready = true;
  engine.busAmb = audioNode();
  engine.busSfx = audioNode();
  engine.busMusic = audioNode();

  const handle = engine.startMusicLoop('club.record', 'assets/music/long-record.mp3', {
    volume: 0.2,
    fade: 0,
    position: { x: 1, y: 2, z: 3 },
  });
  await Promise.resolve();

  assert.equal(fetches, 0, 'music must not be fetched into an ArrayBuffer');
  assert.equal(elements.length, 1);
  assert.strictEqual(handle.element, elements[0]);
  assert.strictEqual(handle.node, mediaSources[0]);
  assert.equal(handle.element.src, 'assets/music/long-record.mp3');
  assert.equal(handle.element.loop, true);
  assert.equal(handle.element.preload, 'auto');
  assert.equal(handle.element.paused, false);
  assert.equal(handle.node.connections.includes(handle.gain), true);

  let ended = 0;
  const oneShot = engine.startMusicLoop('stage.feature', 'assets/music/featured-record.mp3', {
    volume: 0.25,
    fade: 0,
    loop: false,
    bus: 'music',
    onEnded: () => { ended++; },
  });
  await Promise.resolve();
  assert.equal(oneShot.element.loop, false, 'a featured performance must not restart from the top');
  assert.equal(oneShot.filter.connections.includes(engine.busMusic), true,
    'featured music belongs on the music bus');
  oneShot.element.listeners.get('ended')?.();
  assert.equal(ended, 1, 'the performance owner needs the media element\'s natural ending');
  engine.stopLoop('stage.feature', 0);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(oneShot.element.listeners.has('ended'), false, 'release removes the ended callback');

  engine.stopLoop('club.record', 0);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(handle.element.paused, true);
  assert.equal(handle.element.src, '');
  assert.equal(handle.element.released, true);
  assert.equal(handle.node.disconnected, true);
  assert.equal(handle.gain.disconnected, true);
  assert.equal(handle.filter.disconnected, true);
  assert.equal(handle.panner.disconnected, true);

  throwOnPlay = true;
  let rejectedHandle;
  let rejectedError = null;
  assert.doesNotThrow(() => {
    rejectedHandle = engine.startMusicLoop('blocked.record', 'assets/music/blocked.mp3', {
      onError: (handle_, error) => { rejectedError = { handle: handle_, error }; },
    });
  });
  assert.strictEqual(rejectedError?.handle, rejectedHandle,
    'the performance owner is told which streamed handle failed');
  assert.match(rejectedError?.error?.message ?? '', /media policy rejected playback/);
  assert.equal(engine.loops.has('blocked.record'), false);
  assert.equal(rejectedHandle.released, true);
  assert.equal(rejectedHandle.element.src, '');
  assert.equal(rejectedHandle.node.disconnected, true);

  throwOnPlay = false;
  blockOnPlay = true;
  const retryHandle = engine.startMusicLoop('retry.record', 'assets/music/retry.mp3');
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(engine.loops.get('retry.record'), retryHandle);
  assert.equal(retryHandle.released, false);
  assert.equal(retryHandle.autoplayBlocked, true);
  assert.equal(typeof retryHandle.retryPlayback, 'function');
  assert.deepEqual([...inputListeners.keys()].sort(), ['keydown', 'pointerdown', 'touchend']);

  blockOnPlay = false;
  fakeWindow.dispatch('pointerdown');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(retryHandle.element.paused, false);
  assert.equal(retryHandle.autoplayBlocked, false);
  assert.equal(retryHandle.retryPlayback, null);
  assert.equal(inputListeners.size, 0);

  engine.stopLoop('retry.record', 0);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(retryHandle.released, true);
});

function proceduralAudioHarness() {
  let starts = 0;
  const startedNode = (extra = {}) => audioNode({
    start() { starts++; },
    stop() {},
    ...extra,
  });
  const ctx = {
    currentTime: 1,
    sampleRate: 8_000,
    createBuffer: (_channels, length) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => startedNode({
      playbackRate: audioParam(1),
      loop: false,
    }),
    createOscillator: () => startedNode({
      frequency: audioParam(),
      type: 'sine',
    }),
    createBiquadFilter: () => audioNode({
      frequency: audioParam(),
      Q: audioParam(),
      type: 'lowpass',
    }),
    createGain: () => audioNode({ gain: audioParam() }),
  };
  const engine = new AudioEngine();
  engine.ctx = ctx;
  engine.ready = true;
  engine.busSfx = audioNode();
  engine.busAmb = audioNode();
  return {
    engine,
    starts: () => starts,
  };
}

test('new NO WAKE and THE TAKE one-shots have authored procedural sound designs', () => {
  const { engine, starts } = proceduralAudioHarness();
  const cues = [
    'boat.board.step',
    'boat.engine.start',
    'boat.engine.shutdown',
    'boat.rope.release',
    'boat.body.drag',
    'boat.body.rail',
    'boat.gunshot.deck',
    'heist.map.paper',
    'heist.gear.armor.pickup',
    'heist.gear.carbine.pickup',
    'heist.van.door',
    'heist.bank.entry',
    'heist.guard.draw',
    'heist.guard.weapon.drop',
    'heist.weapon.carbine.indoor',
    'heist.crowd.react',
    'heist.body.marble',
    'heist.cash.lift',
    'heist.cash.drop',
    'heist.police.gunshot',
    'heist.bullet.whiz',
    'heist.bullet.impact',
  ];

  for (const cue of cues) {
    const before = starts();
    engine.play(cue);
    assert.ok(starts() - before >= 2, `${cue} must not use the generic single-tick fallback`);
  }
});

test('new NO WAKE and THE TAKE beds have layered seamless procedural loops', () => {
  const { engine, starts } = proceduralAudioHarness();
  const cues = [
    'boat.engine.underway',
    'boat.hull.wake',
    'heist.ambience.safehouse.prep',
    'heist.ambience.van',
    'heist.bank.alarm',
    'heist.vehicle.engine.load',
    'heist.vehicle.tires.road',
  ];

  for (const cue of cues) {
    const before = starts();
    const handle = engine.startLoop(`fallback:${cue}`, {
      name: cue,
      ambience: true,
      fade: 0,
    });
    assert.ok(handle, `${cue} must start through the public loop API`);
    assert.ok(starts() - before >= 2, `${cue} must not use the generic single-noise loop`);
  }
});
