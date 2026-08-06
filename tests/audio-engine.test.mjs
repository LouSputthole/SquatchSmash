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

/**
 * A param that keeps a sorted automation timeline and can be sampled at a
 * time, the way a real AudioParam does. `audioParam` above collapses every
 * ramp to its target the instant it is scheduled, which cannot express the
 * failure these two tests cover: a short ramp scheduled while a longer one is
 * still running is inserted *before* it on the timeline, so the param reaches
 * the new value on time and then keeps travelling to the older target.
 */
function timelineParam(initial = 0) {
  return {
    events: [{ time: -Infinity, value: initial, kind: 'set' }],
    get value() { return this.at(this.sampleAt ?? 0); },
    set value(next) { this.events = [{ time: -Infinity, value: next, kind: 'set' }]; },
    sampleAt: 0,
    cancelScheduledValues(time) {
      this.events = this.events.filter((event) => event.time < time);
    },
    setValueAtTime(next, time) { this._insert({ time, value: next, kind: 'set' }); },
    linearRampToValueAtTime(next, time) { this._insert({ time, value: next, kind: 'ramp' }); },
    exponentialRampToValueAtTime(next, time) { this.linearRampToValueAtTime(next, time); },
    setTargetAtTime(next, time) { this.setValueAtTime(next, time); },
    _insert(event) {
      this.events.push(event);
      this.events.sort((a, b) => a.time - b.time);
    },
    at(time) {
      let previous = this.events[0];
      for (const event of this.events) {
        if (event.time > time) {
          if (event.kind !== 'ramp') return previous.value;
          const span = event.time - previous.time;
          if (!Number.isFinite(span) || span <= 0) return event.value;
          const t = (time - previous.time) / span;
          return previous.value + (event.value - previous.value) * t;
        }
        previous = event;
      }
      return previous.value;
    },
  };
}

function loopMixHarness() {
  const node = (extra = {}) => audioNode({ start() {}, stop() {}, ...extra });
  const ctx = {
    currentTime: 0,
    sampleRate: 8_000,
    createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => node({ playbackRate: audioParam(1), loop: false }),
    createOscillator: () => node({ frequency: audioParam(), type: 'sine' }),
    createBiquadFilter: () => audioNode({
      frequency: timelineParam(20_000), Q: audioParam(), type: 'lowpass',
    }),
    createGain: () => audioNode({ gain: timelineParam() }),
    createPanner: () => audioNode({
      positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 },
    }),
  };
  const engine = new AudioEngine();
  engine.ctx = ctx;
  engine.ready = true;
  engine.busAmb = audioNode();
  engine.busSfx = audioNode();
  engine.busMusic = audioNode();
  return { engine, ctx };
}

test('a room change wins against the fade-in it interrupts', () => {
  const { engine, ctx } = loopMixHarness();

  // Exactly what the closed party does: start outdoor rain over a long fade,
  // then duck it hard one frame later once the room resolves to indoors.
  const rain = engine.startLoop('party.rain', {
    name: 'ambience.rain', volume: 0.3, ambience: true, fade: 1.2,
  });
  ctx.currentTime = 0.016;
  engine.setLoopVolume('party.rain', 0.018, 0.8);

  assert.ok(rain.gain.gain.at(0.9) <= 0.03, 'the duck must land');
  for (const time of [1.2, 1.4, 2, 8]) {
    assert.ok(
      rain.gain.gain.at(time) <= 0.02,
      `rain must stay ducked at ${time}s, not climb back to the outdoor level`,
    );
  }
  assert.equal(rain.volume, 0.018);
});

test('a loop cutoff change discards the automation it interrupts', () => {
  const { engine, ctx } = loopMixHarness();

  const record = engine.startLoop('party.record', { name: 'ambience.crowd', volume: 0.2, fade: 1.2 });
  engine.setLoopCutoff('party.record', 900, 2);
  ctx.currentTime = 0.4;
  engine.setLoopCutoff('party.record', 12_000, 0.5);

  assert.ok(
    record.filter.frequency.at(3) >= 11_000,
    'a door opening must not slowly re-close itself',
  );
});

test('a synthesised engine bed has revs, not just a volume knob', () => {
  /* Owner, on THE TAKE's escape drive: "engine sounds are bad." They were one
   * bed at one pitch whose GAIN rose with speed, which reads as an engine
   * getting nearer rather than an engine working.
   *
   * The trap underneath the fix: `heist.vehicle.engine.load` has no recording
   * on disk, so it is served by `synthLoop` and has no `playbackRate` at all.
   * A re-pitch that only knew about decoded samples would have been a silent
   * no-op that still passed every other test in this file. */
  const { engine } = loopMixHarness();
  /* Oscillator frequencies in this harness are plain params; filter corners
   * are the timeline kind, which reports the value it holds AT A TIME. Read
   * both once the ramp has landed. */
  const settled = (param) => (param.at ? param.at(10) : param.value);

  const bed = engine.startLoop('heist.vehicle.engine.load', {
    name: 'heist.vehicle.engine.load', volume: 0.14, ambience: true, fade: 0.2,
  });
  assert.equal(bed.node.playbackRate, undefined, 'this bed is synthesised, not sampled');
  const voices = bed.node.voices;
  assert.ok(voices.length >= 3, `expected an oscillator bank, saw ${voices.length}`);
  const idle = voices.map((voice) => settled(voice.param));
  assert.deepEqual(idle, voices.map((voice) => voice.base),
    'a fresh bed sits at the frequencies it was authored with');

  assert.equal(engine.setLoopRate('heist.vehicle.engine.load', 1.8), true);
  for (const [index, voice] of voices.entries()) {
    assert.ok(settled(voice.param) > idle[index],
      `voice ${index} (${voice.kind}) did not move when the revs did`);
  }
  // The oscillators ARE the note and track the rate exactly; the noise bands
  // are the texture around it and travel half as far, or road roar becomes a
  // kettle.
  const [fundamental] = voices.filter((voice) => voice.kind === 'osc');
  const [wash] = voices.filter((voice) => voice.kind === 'noise');
  assert.ok(Math.abs(settled(fundamental.param) - fundamental.base * 1.8) < 1e-6);
  assert.ok(Math.abs(settled(wash.param) - wash.base * 1.4) < 1e-6);

  // Shifting up drops the revs; a gear change is the one thing a gain curve
  // can never produce.
  engine.setLoopRate('heist.vehicle.engine.load', 0.9);
  assert.ok(settled(fundamental.param) < fundamental.base * 1.8);

  // Clamped rather than allowed to become a whistle or a subsonic thud.
  engine.setLoopRate('heist.vehicle.engine.load', 40);
  assert.ok(Math.abs(settled(fundamental.param) - fundamental.base * 4) < 1e-6);
  engine.setLoopRate('heist.vehicle.engine.load', 0);
  assert.ok(settled(fundamental.param) <= fundamental.base * 0.35,
    'a rate below the clamp still lands at the bottom of the range');
  assert.ok(settled(fundamental.param) >= 20,
    'and never below something a speaker can move');
});

test('a recorded loop is re-pitched by its playback rate, and an absent one refuses', () => {
  const { engine } = loopMixHarness();
  engine.buffers.set('heist.vehicle.tires.road', [{ duration: 3 }]);

  const tyres = engine.startLoop('heist.vehicle.tires.road', {
    name: 'heist.vehicle.tires.road', volume: 0.08, ambience: true, fade: 0.25,
  });
  assert.equal(engine.setLoopRate('heist.vehicle.tires.road', 1.35), true);
  assert.ok(Math.abs(tyres.node.playbackRate.value - 1.35) < 1e-6);
  assert.equal(tyres.node.voices, undefined, 'a decoded loop has no voice bank');

  // A loop that is not running is not an error; the drive calls this every
  // frame and the beds are only alive during the escape.
  assert.equal(engine.setLoopRate('heist.vehicle.engine.load', 2), false);
});
