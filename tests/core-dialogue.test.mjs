/**
 * THE SHARED DIALOGUE PATH.
 *
 * Four of the owner's playtest notes were one bug: every scene played its own
 * dialogue its own way, so volume, distance and timing all depended on which
 * room you were standing in. `src/core/dialogue.js` is the fix and this is
 * what holds it in place — because the failure mode is not a crash, it is a
 * scene quietly going back to `audio.play(cue, { volume: 0.85 })` and nobody
 * noticing until somebody listens.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DialogueSequence,
  SPEECH_GAIN,
  SPEECH_GAP_S,
  SPEECH_MIX,
  SPEECH_MIX_CLOSE,
  SPEECH_MIX_INDOORS,
  hasSpeech,
  speak,
  speechDuration,
} from '../src/core/dialogue.js';

/** An engine that records rather than sounds, with the shape `play()` has. */
function fakeAudio({ decoded = {}, manifest = [] } = {}) {
  const played = [];
  const held = [];
  return {
    played,
    held,
    manifest: { sfx: manifest },
    hasSample: (cue) => Object.prototype.hasOwnProperty.call(decoded, cue),
    sampleDuration: (cue) => decoded[cue] ?? null,
    hold: (secs) => held.push(secs),
    play(cue, opts = {}) {
      const source = { cue, stopped: false, stop() { this.stopped = true; } };
      played.push({ cue, opts, source });
      return source;
    },
  };
}

test('a spoken line declares itself to the voice bus', () => {
  const audio = fakeAudio({ decoded: { 'heist.snow.commit': 2.4 } });
  speak(audio, 'heist.snow.commit');
  assert.equal(audio.played[0].opts.bus, 'voice');
  /* The whole point of the bus. A cue outside `vo.` cannot be classified by
   * name -- `heist.snow.commit` is a line and `heist.cash.lift` is a sound
   * effect -- so the declaration has to come from the caller. */
});

test('the default gain is one, because level belongs to the bus', () => {
  const audio = fakeAudio({ decoded: { 'a.b': 1 } });
  speak(audio, 'a.b');
  assert.equal(audio.played[0].opts.volume, SPEECH_GAIN.normal);
  assert.equal(SPEECH_GAIN.normal, 1);
});

test('a quieter line says why it is quieter', () => {
  const audio = fakeAudio({ decoded: { 'a.b': 1 } });
  speak(audio, 'a.b', { gain: SPEECH_GAIN.muffled, muffle: 900 });
  assert.equal(audio.played[0].opts.volume, SPEECH_GAIN.muffled);
  assert.equal(audio.played[0].opts.muffle, 900);
  assert.ok(SPEECH_GAIN.muffled < SPEECH_GAIN.normal);
});

test('a line from a speaker follows him, and seeds the panner where he is', () => {
  const audio = fakeAudio({ decoded: { 'a.b': 1 } });
  const speaker = { position: { x: 3, y: 0, z: 4 } };
  const at = { x: 3, y: 0, z: 4 };
  speak(audio, 'a.b', { speaker, position: at });
  const { opts } = audio.played[0];
  assert.equal(opts.follow, speaker, 'the line is not glued to the speaker');
  assert.equal(opts.position, at, 'the panner was not seeded');
  /* Both, not either. `position` is where the line STARTS from and `follow`
   * is what keeps it there; a walking man needs the second and a scene that
   * already knows the point should not make the engine re-read it. */
  assert.equal(opts.ref, SPEECH_MIX.ref);
  assert.equal(opts.maxDist, SPEECH_MIX.maxDist);
  assert.equal(opts.rolloff, SPEECH_MIX.rolloff);
});

test('a line that is not in the world gets no panner at all', () => {
  const audio = fakeAudio({ decoded: { 'a.b': 1 } });
  speak(audio, 'a.b', { mix: SPEECH_MIX_CLOSE, speaker: { position: { x: 9, y: 0, z: 9 } } });
  const { opts } = audio.played[0];
  assert.equal(opts.follow, undefined, 'a phone call must not follow anybody');
  assert.equal(opts.position, undefined);
  assert.equal(opts.ref, undefined, 'a phone call must not attenuate with distance');
});

test('indoors carries less far than the open air', () => {
  assert.ok(SPEECH_MIX_INDOORS.maxDist < SPEECH_MIX.maxDist);
  assert.ok(SPEECH_MIX_INDOORS.rolloff > SPEECH_MIX.rolloff);
});

test('the mouth gets an analyser on every line', () => {
  const audio = fakeAudio({ decoded: { 'a.b': 1 } });
  speak(audio, 'a.b');
  assert.equal(audio.played[0].opts.analyse, true);
});

test('a line claims the floor for as long as it runs', () => {
  const audio = fakeAudio({ decoded: { 'a.b': 3.5 } });
  speak(audio, 'a.b');
  assert.equal(audio.held[0], 3.5 + SPEECH_GAP_S);
});

/* ---------------- how long a line is ---------------- */

test('a decoded take is measured, not guessed', () => {
  const audio = fakeAudio({ decoded: { 'a.b': 2.75 } });
  assert.equal(speechDuration(audio, 'a.b'), 2.75);
});

test('an unrecorded line falls back to its authored length, not to a constant', () => {
  /* This is what lets a scene read at the right pace with subtitles before the
   * VO session happens, and re-time itself when the recording lands. */
  const audio = fakeAudio({ manifest: [{ name: 'a.b', duration: 4.2 }] });
  assert.equal(speechDuration(audio, 'a.b'), 4.2);
  assert.equal(hasSpeech(audio, 'a.b'), false);
});

test('a cue nobody has heard of still returns a usable length', () => {
  const audio = fakeAudio();
  assert.ok(speechDuration(audio, 'nope.nope') > 0);
});

test('speak reports whether the player will actually hear anything', () => {
  const audio = fakeAudio({ decoded: { 'heard.this': 1 }, manifest: [{ name: 'silent.one', duration: 2 }] });
  assert.equal(speak(audio, 'heard.this').silent, false);
  assert.equal(speak(audio, 'silent.one').silent, true);
  /* The Silent Squatch coughs were exactly the second case: manifest entry,
   * correct trigger, no file, and nothing anywhere said so. */
});

test('a headless scene can speak without an engine and nothing throws', () => {
  const result = speak(null, 'a.b');
  assert.equal(result.source, null);
  assert.equal(result.silent, true);
  assert.ok(result.seconds > 0);
});

/* ---------------- conversations ---------------- */

function runSequence(audio, lines, seconds = 30, dt = 1 / 60) {
  const sequence = new DialogueSequence(audio, { gap: SPEECH_GAP_S });
  sequence.play(lines);
  for (let t = 0; t < seconds && !sequence.done; t += dt) sequence.update(dt);
  return sequence;
}

test('a conversation waits for the line before it to finish', () => {
  const audio = fakeAudio({ decoded: { 'a.one': 2, 'a.two': 1 } });
  const sequence = new DialogueSequence(audio, { gap: SPEECH_GAP_S });
  sequence.play([{ cue: 'a.one' }, { cue: 'a.two' }]);
  const dt = 1 / 60;
  sequence.update(dt);
  assert.equal(audio.played.length, 1, 'the first line did not start');
  /* Well inside the first line: the second must not have started. */
  for (let t = 0; t < 2.0; t += dt) sequence.update(dt);
  assert.equal(audio.played.length, 1, 'the second line stepped on the first');
  for (let t = 0; t < 0.5; t += dt) sequence.update(dt);
  assert.equal(audio.played.length, 2, 'the second line never came');
});

test('the pacing is the recording, not a number somebody typed', () => {
  /* The same two lines, one of them re-cut twice as long. The gap between them
   * has to move with it, which is the whole reason for the class. */
  const short = runSequence(fakeAudio({ decoded: { 'a.one': 1, 'a.two': 1 } }), [{ cue: 'a.one' }, { cue: 'a.two' }]);
  const long = runSequence(fakeAudio({ decoded: { 'a.one': 4, 'a.two': 1 } }), [{ cue: 'a.one' }, { cue: 'a.two' }]);
  assert.deepEqual(short.spoken.map((l) => l.seconds), [1, 1]);
  assert.deepEqual(long.spoken.map((l) => l.seconds), [4, 1]);
});

test('a deliberate beat is a beat, not a stand-in for a clip length', () => {
  const audio = fakeAudio({ decoded: { 'a.one': 1, 'a.two': 1 } });
  const sequence = new DialogueSequence(audio, { gap: 0 });
  sequence.play([{ cue: 'a.one' }, { cue: 'a.two', after: 2 }]);
  const dt = 1 / 60;
  for (let t = 0; t < 2.5; t += dt) sequence.update(dt);
  assert.equal(audio.played.length, 1, 'the pause before the answer was not taken');
  for (let t = 0; t < 1.0; t += dt) sequence.update(dt);
  assert.equal(audio.played.length, 2);
});

test('an unrecorded conversation still plays at the right pace', () => {
  const audio = fakeAudio({
    manifest: [{ name: 'a.one', duration: 3 }, { name: 'a.two', duration: 2 }],
  });
  const sequence = runSequence(audio, [{ cue: 'a.one' }, { cue: 'a.two' }]);
  assert.deepEqual(sequence.spoken.map((l) => l.seconds), [3, 2]);
  assert.deepEqual(sequence.spoken.map((l) => l.silent), [true, true]);
});

test('the sequence records who said what, in order, for a verifier', () => {
  const audio = fakeAudio({ decoded: { 'a.one': 1, 'a.two': 1, 'a.three': 1 } });
  const sequence = runSequence(audio, [
    { cue: 'a.one', speakerId: 'STOVE' },
    { cue: 'a.two', speakerId: 'SEFF' },
    { cue: 'a.three', speakerId: 'LAG' },
  ]);
  assert.deepEqual(sequence.spoken.map((l) => [l.speaker, l.cue]), [
    ['STOVE', 'a.one'], ['SEFF', 'a.two'], ['LAG', 'a.three'],
  ]);
  assert.equal(sequence.done, true);
});

test('stopping a conversation stops it', () => {
  const audio = fakeAudio({ decoded: { 'a.one': 5, 'a.two': 1 } });
  const sequence = new DialogueSequence(audio);
  sequence.play([{ cue: 'a.one' }, { cue: 'a.two' }]);
  sequence.update(1 / 60);
  sequence.stop();
  for (let t = 0; t < 10; t += 1 / 60) sequence.update(1 / 60);
  assert.equal(audio.played.length, 1, 'a stopped conversation carried on talking');
  assert.equal(sequence.done, true);
});

test('the line callback is the seam a scene hangs its subtitle on', () => {
  const audio = fakeAudio({ decoded: { 'a.one': 2.5 } });
  const seen = [];
  const sequence = new DialogueSequence(audio, {
    onLine: (line, spoken) => seen.push([line.cue, spoken.seconds]),
  });
  sequence.play([{ cue: 'a.one', text: 'Shut the door.' }]);
  sequence.update(1 / 60);
  assert.deepEqual(seen, [['a.one', 2.5]]);
});
