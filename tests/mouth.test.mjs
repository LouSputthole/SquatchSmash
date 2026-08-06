import assert from 'node:assert/strict';
import test from 'node:test';

import { Mouth } from '../src/core/mouth.js';
import { AudioEngine } from '../src/core/audio.js';

/**
 * The shared mouth system, on the two things that are actually load-bearing:
 * that it is driven by the SOUND, and that it stops when the sound stops —
 * including when the sound is cut rather than finished.
 *
 * The browser check (tools/verify-mouths.mjs) proves the same claims against a
 * real AnalyserNode and a real recording; this proves the logic around it,
 * which is the part that can be wrong in a way a screenshot cannot show.
 */

/** A mouth mesh in the shape `world/build.js`'s `box()` produces: size in scale. */
function fakeMouth({ visible = true } = {}) {
  return {
    visible,
    scale: { x: 0.052, y: 0.012, z: 0.016, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    position: { y: 0.113 },
  };
}

function fakeJaw() {
  return { position: { y: 0.065 } };
}

/**
 * An analyser that plays back a scripted loudness envelope.
 *
 * `levels` is a list of amplitudes 0..1; each read advances one step and the
 * last one repeats, which is how "the take has finished and the graph is
 * silent" is expressed.
 */
function fakeAnalyser(levels) {
  let at = 0;
  return {
    fftSize: 8,
    reads: 0,
    getByteTimeDomainData(bytes) {
      const level = levels[Math.min(at, levels.length - 1)];
      at += 1;
      this.reads += 1;
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = 128 + Math.round((i % 2 ? level : -level) * 127);
      }
    },
  };
}

/** A source node in the shape `AudioBufferSourceNode` presents to us. */
function fakeSource() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    /** What `stop()` and a natural finish both do. */
    end() { listeners.get('ended')?.(); },
    get listening() { return listeners.has('ended'); },
  };
}

function run(mouth, frames, dt = 1 / 60) {
  let peak = 0;
  for (let i = 0; i < frames; i++) peak = Math.max(peak, mouth.update(dt));
  return peak;
}

test('a mouth nobody is speaking through never moves', () => {
  const mesh = fakeMouth();
  const mouth = new Mouth({ mouth: mesh });
  run(mouth, 120);
  assert.equal(mouth.open, 0);
  assert.equal(mouth.mode, null);
  assert.equal(mesh.scale.y, 0.012);
});

test('an idle mouth costs nothing after it has settled', () => {
  const mouth = new Mouth({ mouth: fakeMouth() });
  mouth.update(0.016);
  assert.equal(mouth._settled, true);
  // The early-out returns 0 without touching anything else.
  assert.equal(mouth.update(0.016), 0);
});

test('the opening follows the amplitude, not the clock', () => {
  const mesh = fakeMouth();
  const mouth = new Mouth({ mouth: mesh }, { openScale: 2.6 });
  // Loud, silent, loud — a word, a gap, a word.
  const analyser = fakeAnalyser([
    ...Array(20).fill(0.5),
    ...Array(20).fill(0),
    ...Array(20).fill(0.5),
  ]);
  mouth.speak({ analyser, source: fakeSource(), seconds: 99 });
  assert.equal(mouth.mode, 'audio');

  const loud = run(mouth, 20);
  assert.ok(loud > 0.5, `mouth stayed shut through a loud passage (${loud})`);
  assert.ok(mesh.scale.y > 0.012, 'the mesh did not move');

  run(mouth, 20);
  assert.equal(mouth.open, 0, 'mouth stayed open through a gap between words');
  assert.ok(Math.abs(mesh.scale.y - 0.012) < 1e-9, 'the mesh did not return to rest');

  const again = run(mouth, 20);
  assert.ok(again > 0.5, 'mouth did not reopen on the next word');
});

test('a quiet take opens as wide as a loud one', () => {
  const loudMouth = new Mouth({ mouth: fakeMouth() });
  const quietMouth = new Mouth({ mouth: fakeMouth() });
  loudMouth.speak({ analyser: fakeAnalyser(Array(40).fill(0.8)), source: fakeSource(), seconds: 99 });
  quietMouth.speak({ analyser: fakeAnalyser(Array(40).fill(0.06)), source: fakeSource(), seconds: 99 });
  const loud = run(loudMouth, 30);
  const quiet = run(quietMouth, 30);
  assert.ok(loud > 0.8 && quiet > 0.8, `loud ${loud}, quiet ${quiet}`);
});

test('a line that is CUT mid-word shuts the mouth', () => {
  const mesh = fakeMouth();
  const mouth = new Mouth({ mouth: mesh });
  const source = fakeSource();
  mouth.speak({ analyser: fakeAnalyser(Array(200).fill(0.5)), source, seconds: 99 });
  run(mouth, 10);
  assert.ok(mouth.open > 0.5);

  // What `stopVoice()` / `source.stop()` produce.
  source.end();
  assert.equal(mouth.mode, null, 'the drive did not stop with the source');
  assert.equal(source.listening, false, 'the ended listener was not removed');

  run(mouth, 40);
  assert.equal(mouth.open, 0);
  assert.ok(Math.abs(mesh.scale.y - 0.012) < 1e-9, 'the mesh did not return to rest');
});

test('an explicit stop() shuts it too, and does not snap', () => {
  const mouth = new Mouth({ mouth: fakeMouth() });
  mouth.speak({ analyser: fakeAnalyser(Array(200).fill(0.6)), source: fakeSource(), seconds: 99 });
  run(mouth, 10);
  const before = mouth.open;
  mouth.stop();
  mouth.update(1 / 60);
  assert.equal(mouth.mode, null);
  assert.ok(mouth.open < before, 'it did not start closing');
  assert.ok(mouth.open > 0, 'it snapped shut in one frame rather than closing');
});

test('a jaw drops with the mouth and comes back to rest', () => {
  const jaw = fakeJaw();
  const mouth = new Mouth({ mouth: fakeMouth(), jaw }, { openScale: 2.4, jawDrop: 0.038 });
  mouth.speak({ analyser: fakeAnalyser(Array(200).fill(0.7)), source: fakeSource(), seconds: 99 });
  run(mouth, 12);
  assert.ok(jaw.position.y < 0.065, 'the jaw did not drop');
  mouth.stop();
  run(mouth, 60);
  assert.ok(Math.abs(jaw.position.y - 0.065) < 1e-6, 'the jaw did not come back');
});

test('an analyser that goes quiet for good releases the line', () => {
  const mouth = new Mouth({ mouth: fakeMouth() });
  const analyser = fakeAnalyser([...Array(10).fill(0.5), 0]);
  mouth.speak({ analyser, source: fakeSource(), seconds: 99 });
  run(mouth, 10);
  // Past the dead-air backstop (3 s) with nothing but silence on the graph.
  run(mouth, 240, 0.02);
  assert.equal(mouth.mode, null, 'a dead analyser was read forever');
});

/* ---------------------------------------------------------------- */
/* The fallback                                                      */
/* ---------------------------------------------------------------- */

test('a line with no recording still animates, and says that it is the fallback', () => {
  const mesh = fakeMouth();
  const mouth = new Mouth({ mouth: mesh });
  assert.equal(mouth.speak({ seconds: 2 }), 'fallback');
  const peak = run(mouth, 90);
  assert.ok(peak > 0.5, `the fallback never opened the mouth (${peak})`);
});

test('the fallback has gaps in it rather than flapping', () => {
  const mouth = new Mouth({ mouth: fakeMouth() });
  mouth.speak({ seconds: 6 });
  let open = 0;
  let shut = 0;
  for (let i = 0; i < 300; i++) {
    const v = mouth.update(1 / 60);
    if (v > 0.25) open += 1;
    if (v < 0.05) shut += 1;
  }
  assert.ok(open > 20, `never opened (${open} frames)`);
  assert.ok(shut > 20, `never shut between words (${shut} frames)`);
});

test('the fallback stops exactly when the subtitle does', () => {
  const mouth = new Mouth({ mouth: fakeMouth() });
  mouth.speak({ seconds: 1 });
  run(mouth, 55);            // 0.92 s — still talking
  assert.equal(mouth.mode, 'fallback');
  run(mouth, 20);            // past 1 s
  assert.equal(mouth.mode, null);
  assert.equal(mouth.open, 0);
});

test('two unrecorded lines in one room do not mouth in unison', () => {
  const a = new Mouth({ mouth: fakeMouth() });
  const b = new Mouth({ mouth: fakeMouth() });
  a.speak({ seconds: 5 });
  b.speak({ seconds: 5 });
  let apart = 0;
  for (let i = 0; i < 200; i++) {
    if (Math.abs(a.update(1 / 60) - b.update(1 / 60)) > 0.15) apart += 1;
  }
  assert.ok(apart > 20, 'both mouths ran on the same phase — a chorus line');
});

test('a real take never falls back', () => {
  const mouth = new Mouth({ mouth: fakeMouth() });
  assert.equal(
    mouth.speak({ analyser: fakeAnalyser([0.4]), source: fakeSource(), seconds: 3 }),
    'audio',
  );
});

/* ---------------------------------------------------------------- */
/* Photographed faces                                                */
/* ---------------------------------------------------------------- */

test('a photographed face is driven but never has a mouth drawn on it', () => {
  const hidden = fakeMouth({ visible: false });
  const mouth = new Mouth({ mouth: hidden });
  assert.equal(mouth.photo, true);
  mouth.speak({ analyser: fakeAnalyser(Array(200).fill(0.7)), source: fakeSource(), seconds: 99 });
  const peak = run(mouth, 20);
  assert.ok(peak > 0.5, 'the envelope must still be published for the head to use');
  assert.equal(hidden.scale.y, 0.012, 'a photograph cannot open its mouth');
  assert.equal(hidden.visible, false, 'the hidden placeholder must stay hidden');
});

test('a rig with no mouth at all still produces an envelope', () => {
  const mouth = new Mouth();
  assert.equal(mouth.photo, false);
  mouth.speak({ seconds: 3 });
  assert.ok(run(mouth, 60) > 0.4);
});

test('re-binding follows a head that was rebuilt underneath a live figure', () => {
  const first = fakeMouth();
  const second = fakeMouth();
  const mouth = new Mouth({ mouth: first });
  mouth.bind({ mouth: second });
  mouth.speak({ analyser: fakeAnalyser(Array(200).fill(0.7)), source: fakeSource(), seconds: 99 });
  run(mouth, 12);
  assert.ok(second.scale.y > 0.012, 'the new mouth was not animated');
  assert.equal(first.scale.y, 0.012, 'the discarded mouth was still being animated');
});

/* ---------------------------------------------------------------- */
/* The engine's side of the contract                                 */
/* ---------------------------------------------------------------- */

test('AudioEngine taps a voice cue and leaves an effect alone', () => {
  const created = [];
  const node = () => ({
    connect(next) { return next; },
    disconnect() {},
  });
  const analyserNode = () => {
    const a = { fftSize: 0, smoothingTimeConstant: 1, connect(n) { return n; } };
    created.push(a);
    return a;
  };
  const engine = new AudioEngine();
  const src = {
    ...node(),
    playbackRate: { value: 1 },
    buffer: null,
    start() {},
  };
  engine.ready = true;
  engine.ctx = {
    currentTime: 10,
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createBufferSource: () => src,
    createAnalyser: analyserNode,
  };
  engine.busSfx = node();
  engine.buffers.set('vo.test.line', [{ duration: 1.5 }]);
  engine.buffers.set('door.creak', [{ duration: 0.4 }]);

  const spoken = engine.play('vo.test.line');
  assert.equal(created.length, 1, 'a vo. cue was not tapped');
  assert.equal(created[0].fftSize, 256);
  assert.equal(created[0].smoothingTimeConstant, 0, 'a pre-smoothed analyser fills in the gaps');
  assert.equal(engine.analyserFor(spoken), created[0]);
  assert.equal(engine.lastVoicePlayback().source, spoken);

  engine.play('door.creak');
  assert.equal(created.length, 1, 'a door was given an analyser it has no use for');
  assert.equal(engine.analyserFor(src), created[0]);

  // The freshness window: a take from a minute ago is not this line's take.
  engine.ctx.currentTime = 70;
  assert.equal(engine.lastVoicePlayback(), null);
});

test('AudioEngine survives a context with no createAnalyser', () => {
  const engine = new AudioEngine();
  const node = () => ({ connect(n) { return n; }, disconnect() {} });
  const src = { ...node(), playbackRate: { value: 1 }, buffer: null, start() {} };
  engine.ready = true;
  engine.ctx = {
    currentTime: 0,
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createBufferSource: () => src,
  };
  engine.busSfx = node();
  engine.buffers.set('vo.test.line', [{ duration: 1 }]);
  const spoken = engine.play('vo.test.line');
  assert.equal(engine.analyserFor(spoken), null);
  // And a Mouth handed that take falls back rather than freezing.
  const mouth = new Mouth({ mouth: fakeMouth() });
  assert.equal(mouth.speak({ audio: engine, source: spoken, seconds: 2 }), 'fallback');
});
