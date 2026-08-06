/**
 * The owner's bomb recordings, and the arithmetic that makes them land.
 *
 * `tools/verify-enola-bomb-audio.mjs` is the real proof — it decodes the mp3s
 * in a browser, runs the mission on the audio clock and measures what actually
 * happened. This file guards the two things a browser check is a slow and
 * expensive way to find out:
 *
 *   THE ALIGNMENT MATHS. Three clips with three different lead-ins have to
 *     bang at one instant. That is `startAt + (onset - offset)` being equal
 *     for all three, which is arithmetic and belongs here.
 *
 *   THE PROMISES AROUND THEM. Nothing schedules a stop on a blast layer (the
 *     44 s clip has to outlive the 30 s timeline); the procedural event is
 *     still there when the recordings are not; and the delivered files carry
 *     no generation prompt, so `npm run sfx --force` cannot overwrite them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureThreeShim, ensureDomShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  EnolaMissionAudio, BLAST_LAYERS, BOOM_LEAD, FALLING_CUE, WIND_CUE, SIREN_CUE, isEnolaPreloadCue,
} = await import('../src/enolasquatch/audio.js');

/* ------------------------------------------------------------------ */
/* A WebAudio context that records what it was told, and nothing else  */
/* ------------------------------------------------------------------ */

const param = (value = 0) => ({
  value,
  cancelScheduledValues() {},
  setValueAtTime(next) { this.value = next; },
  linearRampToValueAtTime(next) { this.value = next; },
  exponentialRampToValueAtTime(next) { this.value = next; },
  setTargetAtTime(next) { this.value = next; },
});

const node = (extra = {}) => ({
  connect(target) { (this.connections ??= []).push(target); return target; },
  disconnect() {},
  ...extra,
});

function fakeContext() {
  const sources = [];
  const ctx = {
    currentTime: 100,
    sampleRate: 48000,
    sources,
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ frequency: param(1000), Q: param(1), type: 'lowpass' }),
    createOscillator: () => node({
      frequency: param(440),
      type: 'sine',
      start(when) { this.startedAt = when; },
      stop(when) { this.stoppedAt = when; },
    }),
    createBuffer: (channels, length, rate) => ({
      duration: length / rate,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource() {
      const src = node({
        buffer: null,
        playbackRate: param(1),
        start(when, offset) { this.startedAt = when; this.startOffset = offset; },
        stop(when) { this.stoppedAt = when; },
      });
      sources.push(src);
      return src;
    },
  };
  return ctx;
}

function fakeAudio({ cues = [] } = {}) {
  const ctx = fakeContext();
  const loops = [];
  const engine = {
    ctx,
    busSfx: node(),
    busAmb: node(),
    buffers: new Map(cues.map(([name, duration]) => [name, [{ duration }]])),
    hasSample(name) { return (this.buffers.get(name)?.length ?? 0) > 0; },
    startLoop(key, opts) { loops.push({ key, opts }); },
    stopLoop(key) { loops.push({ key, stopped: true }); },
    setLoopVolume() {},
    setLoopCutoff() {},
  };
  const audio = new EnolaMissionAudio(engine);
  /* The real `init()`, on the fake context: the engines, the airframe wind and
   * the stall horn are all built here in production and `ready` means "that
   * graph exists". A stub that sets `ready` by hand is a stub that cannot see
   * a fallback reaching for a node that was never made. */
  audio.init();
  // Everything the mission builds afterwards, without init()'s own sources.
  const base = ctx.sources.length;
  const since = () => ctx.sources.slice(base);
  return { audio, engine, ctx, loops, since };
}

const BLAST_CUES = [['enola.blast.a', 44.0], ['enola.blast.b', 8.06], ['enola.blast.c', 22.31]];

/* ------------------------------------------------------------------ */

test('the three delivered blasts are scheduled so their booms land on one instant', () => {
  const { audio, since } = fakeAudio({ cues: BLAST_CUES });

  assert.equal(audio.detonation(1.45), true);
  const blast = audio.lastBlast;
  assert.equal(blast.sampled, true, 'the recordings must be used when they are decoded');
  assert.equal(blast.layers.length, 3);

  const booms = blast.layers.map((layer) => {
    const onset = BLAST_LAYERS.find((l) => l.name === layer.name).onset;
    // Where the transient really lands: the start time, plus however far the
    // onset is beyond the point the buffer was skipped to.
    return layer.startAt + (onset - layer.offset);
  });
  const spread = Math.max(...booms) - Math.min(...booms);
  assert.ok(spread < 1e-9, `the three transients must coincide; spread was ${spread}s`);
  for (const boom of booms) assert.ok(Math.abs(boom - blast.boomAt) < 1e-9);

  // Every source starts at the same instant — "play at the same time" — and it
  // is the buffer offset, never a delay, that does the aligning. A delay would
  // push the whole event later than the moment the pressure front arrives.
  const starts = new Set(since().map((s) => s.startedAt));
  assert.equal(starts.size, 1, 'all three sources start together');
  for (const layer of blast.layers) {
    const expected = Math.max(0, BLAST_LAYERS.find((l) => l.name === layer.name).onset - BOOM_LEAD);
    assert.ok(Math.abs(layer.offset - expected) < 1e-9, `${layer.name} skips ${expected}s in`);
  }
  // The earliest-banging clip is played from its first sample.
  assert.equal(blast.layers.find((l) => l.name === 'enola.blast.b').offset, 0);
});

test('nothing schedules a stop on a blast layer — the full clips get to play', () => {
  const { audio, since } = fakeAudio({ cues: BLAST_CUES });
  audio.detonation(1.45);

  assert.equal(since().length, 3);
  for (const src of since()) {
    assert.equal(src.stoppedAt, undefined,
      'a scheduled stop is how a 44s clip becomes a 30s clip');
  }
  // 44 s against the 30 s Detonation timeline, on purpose.
  const longest = Math.max(...audio.lastBlast.layers.map((l) => l.endsAt - l.startAt));
  assert.ok(longest > 40, `the long layer must outlive the set-piece; it ran ${longest}s`);
});

test('a checkpoint restart is the one thing that takes the explosion away', () => {
  const { audio, ctx, since } = fakeAudio({ cues: BLAST_CUES });
  audio.detonation(1.45);
  assert.equal(audio.blasting, true);

  assert.equal(audio.stopBlast(0.5), true);
  assert.equal(audio.blasting, false);
  for (const src of since()) {
    assert.ok(src.stoppedAt >= ctx.currentTime, 'every layer is released');
  }
  assert.equal(audio.stopBlast(0.5), false, 'stopping twice is not an error');
});

test('with no recordings decoded the procedural detonation still fires', () => {
  const { audio, since } = fakeAudio();
  assert.equal(audio.detonation(1.45), true);
  assert.equal(audio.lastBlast.sampled, false);
  assert.ok(since().length > 3, 'the synthesised event is still built');
});

test('the falling clip is scheduled to END on the impact, not to start at the release', () => {
  const { audio, ctx, since } = fakeAudio({ cues: [[FALLING_CUE, 4.505]] });
  const t0 = ctx.currentTime;

  assert.equal(audio.fallingWhistle(8.4), true);
  const fall = audio.lastFall;
  assert.equal(fall.sampled, true);
  assert.ok(Math.abs(fall.startAt - (t0 + 8.4 - 4.505)) < 1e-9,
    'it waits out the difference between the fall and the clip');
  assert.ok(Math.abs(fall.endsAt - (t0 + 8.4)) < 1e-9, 'and lands on the impact');
  assert.equal(since()[0].startedAt, fall.startAt);

  // The impact arrives; the stamp is what the browser check reads.
  ctx.currentTime = t0 + 8.4;
  audio.endFallingWhistle(0.03);
  assert.ok(Math.abs(audio.lastFall.remainingAtCut) < 1e-9);
});

test('a fall shorter than the clip starts it immediately and accepts the overlap', () => {
  const { audio, ctx } = fakeAudio({ cues: [[FALLING_CUE, 4.505]] });
  const t0 = ctx.currentTime;

  audio.fallingWhistle(2.2);
  assert.equal(audio.lastFall.startAt, t0, 'no delay is possible; the end is what matters');
  // Cut at the real impact, 2.3 s of clip still unplayed. That is the right way
  // round: the front of a falling whistle is the part you can afford to lose.
  ctx.currentTime = t0 + 2.2;
  audio.endFallingWhistle(0.03);
  assert.ok(audio.lastFall.remainingAtCut > 2.2);
});

test('with no falling recording the synthesised sweep still runs the whole fall', () => {
  const { audio } = fakeAudio();
  assert.equal(audio.fallingWhistle(8.4), true);
  assert.equal(audio.lastFall.sampled, false);
  assert.equal(audio.whistling, true);
  audio.endFallingWhistle(0.03);
  assert.equal(audio.whistling, false);
});

test('the wind bed and the sirens stay silent until somebody records them', () => {
  const { audio, loops } = fakeAudio({ cues: BLAST_CUES });
  audio.setAirspeed(78);
  audio.setAirRaidSiren({ x: 9000, y: 40, z: 0 }, 2400);
  assert.deepEqual(loops, [], 'no synth stand-in for an unrecorded cue on this page');

  const recorded = fakeAudio({ cues: [[WIND_CUE, 22], [SIREN_CUE, 22]] });
  recorded.audio.setAirspeed(78);
  recorded.audio.setAirRaidSiren({ x: 9000, y: 40, z: 0 }, 2400);
  assert.deepEqual(recorded.loops.map((l) => l.key), [WIND_CUE, SIREN_CUE]);
  // The sirens are the CITY's: positioned, and audible from kilometres away.
  const siren = recorded.loops.find((l) => l.key === SIREN_CUE);
  assert.deepEqual(siren.opts.position, { x: 9000, y: 40, z: 0 });
  assert.ok(siren.opts.maxDist > 5000, 'a falloff measured in metres, not furniture');

  // Out of range, or the target is gone: they fall away rather than stopping dead.
  recorded.audio.setAirRaidSiren(null);
  assert.equal(recorded.loops.at(-1).stopped, true);
});

test('the page that owns these cues is allowed to decode them', () => {
  for (const name of [FALLING_CUE, ...BLAST_LAYERS.map((l) => l.name), WIND_CUE, SIREN_CUE]) {
    assert.equal(isEnolaPreloadCue(name), true, `${name} must reach the decoder`);
  }
  // The near miss this guards: `enola.` is not `enolasquatch.`.
  assert.equal(isEnolaPreloadCue('enolasquatch.gun.rear'), true);
  assert.equal(isEnolaPreloadCue('vo.silvercase.chester.1'), false);
});

test('`npm run sfx` can never overwrite an owner-delivered bomb clip', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/index.json'), 'utf8'));
  const byName = new Map(manifest.sfx.map((cue) => [cue.name, cue]));
  const files = new Set(index.files);

  for (const name of [FALLING_CUE, ...BLAST_LAYERS.map((l) => l.name)]) {
    const cue = byName.get(name);
    assert.ok(cue, `${name} must be in the manifest`);
    /* THE WHOLE GUARD. `tools/generate-sfx.mjs` skips any cue with neither
     * `prompt` nor `say` before it ever looks at --force, so a delivered
     * recording with no prompt cannot be regenerated by any invocation. */
    assert.equal(cue.prompt, undefined, `${name} must carry no generation prompt`);
    assert.equal(cue.say, undefined);
    assert.match(cue._note ?? '', /OWNER-DELIVERED/);
    assert.equal(files.has(`${name}.mp3`), true, `${name} must be in the runtime index`);
    assert.ok(fs.statSync(path.join(ROOT, 'assets/sfx', `${name}.mp3`)).size > 4096);
  }

  // The two that still need recording are the other way round: a brief, a
  // duration, and no file yet.
  for (const name of [WIND_CUE, SIREN_CUE]) {
    const cue = byName.get(name);
    assert.ok(cue, `${name} must be in the manifest so it can be recorded`);
    assert.ok((cue.prompt ?? '').length > 40, `${name} needs a production-ready prompt`);
    assert.ok(Number.isFinite(cue.duration) && cue.duration > 0);
    assert.equal(cue.loop, true);
  }
});
