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
  EnolaMissionAudio, BLAST_LAYERS, BOOM_LEAD, FALLING_CUE, WIND_CUE, SIREN_CUE,
  ENOLA_NARRATIVE_MUSIC, ENOLA_ESCAPE_MUSIC_DELAY_SECONDS, isEnolaPreloadCue,
} = await import('../src/enolasquatch/audio.js');
const { MissionController } = await import('../src/enolasquatch/mission/MissionController.js');

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
  const media = [];
  const engine = {
    ctx,
    busSfx: node(),
    busAmb: node(),
    busMusic: node(),
    loops: new Map(),
    buffers: new Map(cues.map(([name, duration]) => [name, [{ duration }]])),
    hasSample(name) { return (this.buffers.get(name)?.length ?? 0) > 0; },
    startLoop(key, opts) { loops.push({ key, opts }); },
    startMusicLoop(key, url, opts) {
      const handle = { key, url, opts, released: false, ended: false, failed: false };
      this.loops.set(key, handle);
      media.push({ action: 'start', key, url, opts });
      return handle;
    },
    replaceMusicLoop(key, url, opts) {
      this.stopLoop(key, opts.crossfade ?? 0.65);
      const handle = this.startMusicLoop(key, url, opts);
      media.push({ action: 'replace', key, url, opts });
      return handle;
    },
    stopLoop(key, fade) {
      loops.push({ key, stopped: true, fade });
      const handle = this.loops.get(key);
      if (handle) handle.released = true;
      this.loops.delete(key);
    },
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
  return { audio, engine, ctx, loops, media, since };
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

test('the falling clip starts ON the release frame and is stretched to end on the impact', () => {
  const { audio, ctx, since } = fakeAudio({ cues: [[FALLING_CUE, 4.505]] });
  const t0 = ctx.currentTime;

  assert.equal(audio.fallingWhistle(8.4), true);
  const fall = audio.lastFall;
  assert.equal(fall.sampled, true);
  /* Both owner notes at once: "play right away when you drop the bomb"
   * (2026-08-18) is the start, "line up with the bomb fallling" (2026-08-06)
   * is the end — a 4.5 s clip covers an 8.4 s fall by playing slower, not by
   * waiting in silence. */
  assert.equal(fall.startAt, t0, 'audible from the frame the mount lets go');
  assert.ok(Math.abs(fall.rate - 4.505 / 8.4) < 1e-9,
    'the stretch is exactly clip length over fall time');
  assert.ok(Math.abs(fall.endsAt - (t0 + 8.4)) < 1e-9, 'and it still lands on the impact');
  assert.equal(since()[0].startedAt, t0);
  assert.ok(Math.abs(since()[0].playbackRate.value - fall.rate) < 1e-9,
    'the rate reaches the actual source node');

  // The impact arrives; the stamp is what the browser check reads.
  ctx.currentTime = t0 + 8.4;
  audio.endFallingWhistle(0.03);
  assert.ok(Math.abs(audio.lastFall.remainingAtCut) < 1e-9);
});

test('a fall shorter than the clip compresses it the same way — start now, end on impact', () => {
  const { audio, ctx } = fakeAudio({ cues: [[FALLING_CUE, 4.505]] });
  const t0 = ctx.currentTime;

  audio.fallingWhistle(2.2);
  assert.equal(audio.lastFall.startAt, t0, 'still no delay');
  assert.ok(Math.abs(audio.lastFall.rate - 4.505 / 2.2) < 1e-9);
  assert.ok(Math.abs(audio.lastFall.endsAt - (t0 + 2.2)) < 1e-9);
  ctx.currentTime = t0 + 2.2;
  audio.endFallingWhistle(0.03);
  assert.ok(Math.abs(audio.lastFall.remainingAtCut) < 1e-9);
});

test('the stretch is bounded, so a degenerate fall cannot mangle the recording', () => {
  const long = fakeAudio({ cues: [[FALLING_CUE, 4.505]] });
  long.audio.fallingWhistle(30);
  assert.equal(long.audio.lastFall.rate, 0.42, 'the floor holds for an absurdly long fall');

  const deck = fakeAudio({ cues: [[FALLING_CUE, 4.505]] });
  deck.audio.fallingWhistle(0.2);
  assert.equal(deck.audio.lastFall.rate, 2.5, 'the ceiling holds for a release on the deck');
  // Past either bound the impact cut trims what no longer lines up; the START
  // is the invariant that must never move.
  assert.equal(deck.audio.lastFall.startAt, deck.ctx.currentTime);
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

test('the owner-delivered approach and escape records are streamed once on the music bus', () => {
  const { audio, engine, media, loops } = fakeAudio();

  assert.equal(audio.startBombApproachMusic(), true);
  const approach = media.find((event) => event.action === 'start'
    && event.key === ENOLA_NARRATIVE_MUSIC.approach.key);
  assert.ok(approach, 'the target-run record must be handed to the streaming player');
  assert.equal(approach.url, `assets/music/${ENOLA_NARRATIVE_MUSIC.approach.file}`);
  assert.equal(approach.opts.loop, false, 'a narrative needle-drop is never a looping ambience bed');
  assert.equal(approach.opts.bus, 'music', 'dialogue ducking owns the record');
  assert.equal(approach.opts.ambience, false, 'the score has no fake world position');
  assert.ok(approach.opts.volume <= 0.25, 'the approach leaves headroom for the crew');

  assert.equal(audio.stopBombApproachMusic(0.04), true);
  const cut = loops.findLast((event) => event.stopped
    && event.key === ENOLA_NARRATIVE_MUSIC.approach.key);
  assert.equal(cut?.fade, 0.04, 'the release edge gets only a click-safe ramp');
  assert.equal(engine.loops.has(ENOLA_NARRATIVE_MUSIC.approach.key), false);

  assert.equal(audio.startEscapeMusic(), true);
  const escape = media.find((event) => event.action === 'start'
    && event.key === ENOLA_NARRATIVE_MUSIC.escape.key);
  assert.ok(escape, 'the flight-away record must be handed to the streaming player');
  assert.equal(escape.url, `assets/music/${ENOLA_NARRATIVE_MUSIC.escape.file}`);
  assert.equal(escape.opts.loop, false);
  assert.equal(escape.opts.bus, 'music');
  assert.ok(escape.opts.volume <= 0.25, 'the escape dialogue remains intelligible');
});

test('both delivered Enola records are present and their authored timing is documented', () => {
  for (const score of Object.values(ENOLA_NARRATIVE_MUSIC)) {
    const target = path.join(ROOT, 'assets/music', score.file);
    assert.ok(fs.existsSync(target), `${score.file} must ship with the page`);
    assert.ok(fs.statSync(target).size > 4096, `${score.file} must not be an empty placeholder`);
    assert.ok(Number.isFinite(score.duration) && score.duration > 20,
      `${score.file} needs an audited master duration`);
  }
  assert.ok(Math.abs(ENOLA_NARRATIVE_MUSIC.approach.duration - 37.704) < 0.001);
  assert.ok(Math.abs(ENOLA_NARRATIVE_MUSIC.escape.duration - 148.2) < 0.001);
});

test('escape music waits out the deliberate aftermath beat and starts only once', () => {
  const starts = [];
  const mission = {
    physics: { agl: 100 },
    _escapeT: 0,
    _escapeMusicStarted: false,
    _emergencyDecided: true,
    audio: {
      startEscapeMusic(options) {
        starts.push(options);
        return true;
      },
    },
    updateRearGunner() {},
    interceptors: { engagedCount: 0, activeCount: 1 },
    dialogue: { seen: () => true, play() {} },
    weather: { setConditions() {} },
  };

  MissionController.prototype.updateEscape.call(
    mission,
    ENOLA_ESCAPE_MUSIC_DELAY_SECONDS - 0.01,
  );
  assert.equal(starts.length, 0, 'the blast aftermath stays silent');

  MissionController.prototype.updateEscape.call(mission, 0.02);
  assert.deepEqual(starts, [{ restart: false }]);
  MissionController.prototype.updateEscape.call(mission, 5);
  assert.equal(starts.length, 1, 'later frames cannot restart the record');
});

test('the release frame cuts the approach record before the bomb is detached', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/enolasquatch/mission/MissionController.js'),
    'utf8',
  );
  const release = source.indexOf('this.payload.release(this.scene');
  const cut = source.lastIndexOf('this.audio?.stopBombApproachMusic?.(0.04)', release);
  assert.ok(release > 0, 'the payload release edge must remain findable');
  assert.ok(cut > 0 && cut < release,
    'music must leave before the release/transient frame, never after it');
});
