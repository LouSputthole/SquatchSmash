/**
 * The tape segment: a recording somebody sent in, aired whole.
 *
 * Two things can go wrong with it and neither shows up as an error. The file
 * can be missing from the sfx index, in which case the station holds thirty
 * seconds of silence and calls it a segment. Or the block can take its dwell
 * from the written line rather than the recording, in which case the announcer
 * starts talking eight seconds into a thirty-four second tape.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATIONS } from '../src/core/stations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAPES = STATIONS.flatMap((st) => st.tapes ?? []);

test('every tape names a cue file that is actually on disk', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/index.json'), 'utf8'));
  const files = new Set(index.files || []);
  assert.ok(TAPES.length, 'no tapes to check');
  for (const tape of TAPES) {
    assert.ok(files.has(`${tape.cue}.mp3`), `${tape.cue}.mp3 is not in assets/sfx/index.json`);
  }
});

test('a tape airs intro, recording and outro, and holds for the recording', async () => {
  const { Radio } = await import('../src/core/radio.js');

  const played = [];
  // Every cue is a 34.4s buffer here; only the tape's dwell should reflect that,
  // and only because the block asked for the clip by name.
  const audio = {
    ready: true,
    play: (cue) => { played.push(cue); return { buffer: { duration: 34.4 }, stop() {} }; },
    startLoop() {}, stopLoop() {}, setLoopVolume() {}, say() {},
  };
  const radio = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 });

  // Walk the running order until the tape block comes round.
  const station = radio.station;
  const tape = station.tapes[0];
  let seen = null;
  for (let i = 0; i < 40 && !seen; i++) {
    radio._queue.length = 0;
    radio._refill();
    if (radio._queue.some((s) => s.clip)) seen = radio._queue.slice();
  }
  assert.ok(seen, 'the running order never reached a tape block');

  assert.deepEqual(seen.map((s) => s.line), [tape.intro, tape.title, tape.outro]);
  assert.equal(seen[1].clip, tape.cue);

  // The recording itself is what plays, and the block runs as long as it does.
  radio._queue = seen.slice();
  radio._pump();                       // intro
  radio._pump();                       // the tape
  assert.equal(played.at(-1), tape.cue);
  assert.ok(radio._dwell > 34, `tape dwell was ${radio._dwell}s, shorter than the recording`);
});

test('preparing a bulletin cannot pump ordinary radio before it starts', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const audio = {
    ready: false,
    play() { return null; },
    startLoop() {}, stopLoop() {}, setLoopVolume() {}, say() {},
  };
  const radio = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 7 });
  let tuned = 0;
  radio._tuneIn = () => { tuned++; };

  radio.prepareBroadcast();
  assert.equal(radio.on, true);
  assert.equal(tuned, 0);
  assert.equal(radio._broadcastT, Number.POSITIVE_INFINITY);

  radio.update(10);
  assert.equal(tuned, 0);
  assert.equal(radio._broadcastT, Number.POSITIVE_INFINITY);

  radio.broadcast({ cue: 'vo.news.radio.day_two.1', line: 'Breaking news.' });
  assert.ok(Number.isFinite(radio._broadcastT));
  assert.equal(tuned, 0);
});

test('venue-scoped records stay in their intended in-world music system', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const audio = { ready: false };
  const hud = { setRadio() {}, toast() {} };
  const tracks = [
    { file: 'legacy.mp3', title: 'Legacy rotation' },
    { file: 'cosmic-drift.mp3', title: 'Cosmic Drift', venue: 'apartment' },
    { file: 'club-only.mp3', title: 'Club only', venue: 'bada_bing' },
  ];

  const apartment = new Radio(audio, hud, { hour: 9 });
  apartment.tracks = tracks;
  assert.deepEqual(apartment.playlist.map((track) => track.file), [
    'legacy.mp3', 'cosmic-drift.mp3',
  ]);

  const club = new Radio(audio, hud, { hour: 9 }, { venue: 'bada_bing' });
  club.tracks = tracks;
  assert.deepEqual(club.playlist.map((track) => track.file), [
    'legacy.mp3', 'club-only.mp3',
  ]);
});
