import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { BARKS, DINER_VOICE_PROFILES } from '../src/silver/script.js';
import { allSilverVoiceLines } from '../src/silver/voice-catalog.js';

test('Silver dining-floor patrons rotate across distinct recorded actors while waiters stay staff', () => {
  assert.equal(DINER_VOICE_PROFILES.length, 3);
  const catalog = new Map(allSilverVoiceLines().map((line) => [line.name, line]));
  const dinerVoices = [];
  const waiterVoices = [];

  BARKS.floor.forEach(([who], index) => {
    const cue = `vo.silver.room.floor.${index + 1}`;
    const line = catalog.get(cue);
    assert.ok(line, cue);
    if (who === 'a diner') dinerVoices.push(line.voice);
    if (who === 'a waiter') waiterVoices.push(line.voice);
  });

  assert.deepEqual([...new Set(dinerVoices)].sort(), [...DINER_VOICE_PROFILES].sort());
  assert.deepEqual([...new Set(waiterVoices)], ['waiter']);

  const manifest = JSON.parse(fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'));
  const ids = DINER_VOICE_PROFILES.map((profile) => manifest.voices[profile]?.id);
  assert.equal(ids.every(Boolean), true);
  assert.equal(new Set(ids).size, DINER_VOICE_PROFILES.length,
    'the three apparent diner profiles must be three actual ElevenLabs actors');
  assert.equal(ids.includes(manifest.voices.waiter.id), false);
  assert.equal(ids.includes(manifest.voices['silver-waiter'].id), false);
  assert.equal(ids.includes(manifest.voices.bandleader.id), false);
});
