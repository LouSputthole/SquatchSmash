import test from 'node:test';
import assert from 'node:assert/strict';

import { Radio } from '../src/core/radio.js';
import { STATIONS, showAt, showIntroLine, voiceOf } from '../src/core/stations.js';

/**
 * THE BANK IS A BOOT-TIME SNAPSHOT; THE STATION IS LIVE.
 *
 * Owner, 2026-09-09: *"Some radio announcements arent working playing the
 * voices."* A scene decodes the boot hour's shows plus whatever news the
 * campaign had unlocked BY BOOT, and spoken cues have no synth fallback on
 * purpose — so a report unlocked by the job just done, or the next hour's
 * show, went on air as a caption over dead air for its whole authored hold.
 * The fix: `_unheardNews()` only surfaces reports whose recordings are
 * decoded (kicking `loadAdditional` for the rest, so they air a rotation
 * later), and `_refill()` holds an hour flip until the incoming show's intro
 * is speakable. These tests pin both, plus the two guard rails: a
 * subtitles-only line is never held for audio that cannot exist, and a stub
 * engine without the residency surface behaves exactly as before.
 */

function stubHud() {
  return { setRadio() {}, toast() {} };
}

function stubAudio({ samples = new Set(), decodable = new Set(), loads = [] } = {}) {
  return {
    ready: true,
    play: () => ({ buffer: { duration: 1 }, stop() {} }),
    startLoop() {}, stopLoop() {}, setLoopVolume() {}, say() {},
    hasSample: (name) => samples.has(name),
    canDecode: (name) => decodable.has(name),
    loadAdditional: (request) => { loads.push(request); return Promise.resolve({ loaded: 0 }); },
  };
}

const REPORT = Object.freeze({
  id: 'test.bulletin.midstay',
  day: 5,
  lines: ['First line of the report.', 'Second line of the report.'],
  clips: ['vo.radio.news.test.1', 'vo.radio.news.test.2'],
});

test('a report unlocked mid-stay waits for its decode instead of airing silent', () => {
  const samples = new Set();
  const loads = [];
  const audio = stubAudio({
    samples,
    decodable: new Set(REPORT.clips),
    loads,
  });
  const radio = new Radio(audio, stubHud(), { hour: 9 }, {
    news: () => [REPORT],
  });

  // Not yet decoded: the report stays off the unheard list and the decode
  // is kicked for exactly its clips.
  assert.deepEqual(radio._unheardNews(), []);
  assert.equal(loads.length, 1);
  assert.deepEqual([...loads[0].names].sort(), [...REPORT.clips].sort());

  // The decode lands: the very next rotation surfaces it, no further kick.
  for (const clip of REPORT.clips) samples.add(clip);
  const unheard = radio._unheardNews();
  assert.equal(unheard.length, 1);
  assert.equal(unheard[0].id, REPORT.id);
  assert.equal(loads.length, 1);
});

test('a subtitles-only report is never held for audio that cannot exist', () => {
  const loads = [];
  // Nothing is decodable: these lines have no recording anywhere, which is
  // the authored state of an undelivered take — text is how they air.
  const audio = stubAudio({ loads });
  const radio = new Radio(audio, stubHud(), { hour: 9 }, {
    news: () => [REPORT],
  });
  assert.equal(radio._unheardNews().length, 1);
  assert.equal(loads.length, 0);
});

test('the hour flip holds until the incoming show intro is speakable', () => {
  const station = STATIONS[0];
  const hours = [...new Set([9, 12, 15, 20, 23]
    .filter((hour) => showAt(station, hour))
    .map((hour) => [hour, showAt(station, hour)]).map(([h]) => h))];
  const [hourA, hourB] = (() => {
    for (const a of hours) {
      for (const b of hours) {
        if (showAt(station, a) !== showAt(station, b)) return [a, b];
      }
    }
    return [null, null];
  })();
  assert.ok(hourA !== null, 'the station needs two distinct shows to test the flip');

  const introCue = voiceOf(showIntroLine(showAt(station, hourB)))?.cue;
  assert.ok(introCue, 'the incoming show intro must resolve to a cue');

  const samples = new Set();
  const loads = [];
  const audio = stubAudio({ samples, decodable: new Set([introCue]), loads });
  const time = { hour: hourA };
  const radio = new Radio(audio, stubHud(), time);
  radio._show = showAt(station, hourA);

  // The hour turns but the incoming intro is not decoded: no flip, no
  // captioned-silent intro — the outgoing show fills the block while the
  // decode (kicked here) runs.
  time.hour = hourB;
  radio._queue.length = 0;
  radio._refill();
  assert.equal(radio._show, showAt(station, hourA));
  assert.ok(!radio._queue.some((s) => s.line === showIntroLine(showAt(station, hourB))));
  assert.ok(loads.some((request) => request.names.includes(introCue)));

  // Decode lands: the next refill flips and queues the intro.
  samples.add(introCue);
  radio._queue.length = 0;
  radio._refill();
  assert.equal(radio._show, showAt(station, hourB));
  assert.equal(radio._queue[0]?.line, showIntroLine(showAt(station, hourB)));
});

test('an engine without the residency surface airs everything, as before', () => {
  const audio = {
    ready: true,
    play: () => ({ buffer: { duration: 1 }, stop() {} }),
    startLoop() {}, stopLoop() {}, setLoopVolume() {}, say() {},
  };
  const radio = new Radio(audio, stubHud(), { hour: 9 }, {
    news: () => [REPORT],
  });
  assert.equal(radio._unheardNews().length, 1);
});
