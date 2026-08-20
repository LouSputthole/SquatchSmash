/**
 * The ad break rotates, and a break only airs once it can be heard.
 *
 * 97.8 THE SQUATCH carried one commercial for a long time, and a station that
 * plays the same sixty seconds forever reads as scenery rather than a place.
 * It now carries four. Three of them are written but not yet recorded, so they
 * are indexed -- which is what puts them on the booth sheet -- and held off the
 * running order until their takes land.
 *
 * Three things can go wrong quietly. A break can regress to a flat array, in
 * which case `_refill` spreads segments wrong and playback gets objects with no
 * `line`. A break can be added and never indexed, in which case nothing ever
 * generates a cue for it and it can never be recorded. Or a break can be put on
 * air before its audio exists, in which case the ad slot plays silence -- and
 * NO WAKE, which preloads this station, fails its own audio gate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATIONS, voiceCues } from '../src/core/stations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQUATCH = STATIONS.find((st) => st.id === 'squatch');
const sayable = (line) => /[a-z0-9]/i.test(line);

test('the station carries several ad breaks, each a named list of segments', () => {
  assert.ok(Array.isArray(SQUATCH.commercials), 'squatch has no commercials array');
  assert.ok(SQUATCH.commercials.length > 1, 'the ad break is back down to one commercial');
  const ids = new Set();
  for (const ad of SQUATCH.commercials) {
    assert.equal(typeof ad.id, 'string', 'a commercial has no id');
    assert.ok(!ids.has(ad.id), `two commercials share the id ${ad.id}`);
    ids.add(ad.id);
    assert.equal(typeof ad.live, 'boolean', `${ad.id} does not say whether it is on air`);
    assert.ok(Array.isArray(ad.segments) && ad.segments.length, `${ad.id} has no segments`);
    for (const segment of ad.segments) {
      assert.equal(typeof segment.line, 'string', `${ad.id} has a segment with no line`);
    }
  }
  assert.ok(SQUATCH.commercials.some((ad) => ad.live), 'no ad break is on air at all');
});

test('every ad break is indexed, so an unrecorded one still reaches the booth', () => {
  const generated = new Set(voiceCues().map((cue) => cue.say));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
  const said = new Set(manifest.sfx.filter((cue) => cue.say).map((cue) => cue.say));
  for (const ad of SQUATCH.commercials) {
    for (const segment of ad.segments) {
      /* A beat with no words in it is staging, not a line, and needs no cue. */
      if (!sayable(segment.line)) continue;
      assert.ok(generated.has(segment.line), `${ad.id}: no generated cue for: ${segment.line}`);
      assert.ok(said.has(segment.line), `${ad.id}: not in the manifest: ${segment.line}`);
    }
  }
});

test('a break only goes on air once every line of it is recorded', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/index.json'), 'utf8'));
  const files = new Set(index.files || []);
  const cueFor = new Map(voiceCues().map((cue) => [cue.say, cue.file || `${cue.name}.mp3`]));
  for (const ad of SQUATCH.commercials.filter((entry) => entry.live)) {
    for (const segment of ad.segments) {
      if (!sayable(segment.line)) continue;
      const file = cueFor.get(segment.line);
      assert.ok(files.has(file),
        `${ad.id} is live but ${file} is not recorded — it would air as silence`);
    }
  }
});

test('the ad slot airs one whole live break, and a different one next time', async () => {
  const { Radio } = await import('../src/core/radio.js');
  const audio = {
    ready: true,
    play: () => ({ buffer: { duration: 1 }, stop() {} }),
    startLoop() {}, stopLoop() {}, setLoopVolume() {}, say() {},
  };
  const radio = new Radio(audio, { setRadio() {}, toast() {} }, { hour: 9 });

  const live = SQUATCH.commercials.filter((ad) => ad.live);
  const authored = live.map((ad) => ad.segments.map((s) => s.line).join(' '));
  const aired = [];
  for (let i = 0; i < 200 && aired.length < live.length * 2; i++) {
    radio._queue.length = 0;
    radio._refill();
    if (!radio._queue.some((s) => s.reaction === 'ad')) continue;
    const block = radio._queue.filter((s) => s.reaction !== 'ad');
    for (const segment of block) {
      assert.equal(typeof segment.line, 'string',
        'the ad slot queued something that is not a segment -- is commercials still nested?');
    }
    aired.push(block.map((s) => s.line).join(' '));
  }

  assert.ok(aired.length, 'the ad slot never came round');
  for (const block of aired) {
    assert.ok(authored.includes(block), 'an ad break aired that is not live');
  }
  // Every live break gets an airing before any of them comes round twice.
  assert.equal(new Set(aired.slice(0, live.length)).size, live.length,
    'the ad slot repeated a break before airing all the live ones');
});
