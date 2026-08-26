import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { cabinScriptCues } from '../src/cabin/script.js';

const manifest = JSON.parse(fs.readFileSync(
  new URL('../assets/sfx/manifest.json', import.meta.url),
  'utf8',
));

test('every Cabin chapter line has one exact manifest row', () => {
  const expected = cabinScriptCues();
  const byName = new Map();
  for (const row of manifest.sfx) {
    if (!byName.has(row.name)) byName.set(row.name, []);
    byName.get(row.name).push(row);
  }
  for (const cue of expected) {
    const matches = byName.get(cue.name) || [];
    assert.equal(matches.length, 1, cue.name + ' must appear exactly once');
    assert.equal(matches[0].voice, cue.voice, cue.name + ' casting drift');
    assert.equal(matches[0].say, cue.say, cue.name + ' text drift');
  }
});

test('new dungeon namespace does not consume the pre-existing Lag hint bank', () => {
  const names = manifest.sfx.map((row) => row.name);
  assert.equal(names.filter((name) => name.startsWith('vo.cabin.lag.')).length, 30);
  assert.ok(names.filter((name) => name.startsWith('vo.cabin.dungeon.')).length >= 100);
});

test('every Cabin chapter voice profile is cast', () => {
  const voices = new Set(cabinScriptCues().map((cue) => cue.voice));
  for (const voice of voices) {
    assert.ok(manifest.voices?.[voice]?.id, voice + ' needs a manifest voice id');
  }
});
