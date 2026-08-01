import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  SPOOKY_RADIO_LINES,
  STATIONS,
  showIntroLine,
  voiceCues,
  voiceOf,
} from '../src/core/stations.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url)));
const manifestByName = new Map(manifest.sfx.map((cue) => [cue.name, cue]));

test('every clock-selected show introduction has one exact announcer cue', () => {
  const shows = STATIONS.flatMap((station) => [...(station.shows ?? []), station.overnight]
    .filter(Boolean));
  assert.equal(shows.length, 8);
  for (const show of shows) {
    const line = showIntroLine(show);
    const cue = voiceOf(line);
    assert.equal(cue?.voice, 'announcer');
    assert.equal(cue?.text, line.replace(/^ANNOUNCER:\s*/, ''));
    assert.deepEqual(manifestByName.get(cue.cue), {
      name: cue.cue,
      voice: cue.voice,
      say: cue.text,
    });
  }
});

test('both spooky apartment broadcasts have exact cast cues', () => {
  assert.equal(SPOOKY_RADIO_LINES.length, 2);
  for (const interruption of SPOOKY_RADIO_LINES) {
    const cue = voiceOf(interruption.line);
    assert.equal(cue?.voice, interruption.voice);
    assert.deepEqual(manifestByName.get(cue.cue), {
      name: cue.cue,
      voice: cue.voice,
      say: cue.text,
    });
  }
});

test('the generated radio ledger owns all dynamic and scheduled speech', () => {
  const generated = new Map(voiceCues().map((cue) => [cue.name, cue]));
  const dynamic = [
    ...STATIONS.flatMap((station) => [...(station.shows ?? []), station.overnight]
      .filter(Boolean).map(showIntroLine)),
    ...SPOOKY_RADIO_LINES.map((entry) => entry.line),
  ];
  for (const line of dynamic) {
    const cue = voiceOf(line);
    assert.deepEqual(generated.get(cue.cue), { name: cue.cue, voice: cue.voice, say: cue.text });
  }
});
