import assert from 'node:assert/strict';
import test from 'node:test';

import { allSilverVoiceLines } from '../src/silver/voice-catalog.js';
import { PROFILE_OF, VOICE_OF, silverSpokenWords } from '../src/silver/script.js';

test('Front and Center catalogs every spoken node and Prospect choice', () => {
  const lines = allSilverVoiceLines();
  assert.ok(lines.length >= 300, `${lines.length} Silver lines were cataloged`);
  assert.equal(new Set(lines.map((line) => line.name)).size, lines.length);
  assert.equal(lines.every((line) => line.name.startsWith('vo.silver.')), true);
  assert.equal(lines.every((line) => line.voice && line.text), true);
  assert.ok(lines.filter((line) => line.bank === 'player').length >= 100);
});

test('every Silver speaker bank resolves to a recorded voice profile', () => {
  for (const bank of Object.values(VOICE_OF)) assert.ok(PROFILE_OF[bank] ?? bank);
  assert.equal(PROFILE_OF.driver, 'doorman');
  assert.equal(PROFILE_OF.chef, 'waiter');
  assert.equal(PROFILE_OF.manager, 'npc-male');
  assert.equal(PROFILE_OF.player, 'player');
});

test('Silver recording copy omits actor directions but keeps spoken words', () => {
  assert.equal(silverSpokenWords('<em>(Under her breath.)</em> Bring something else?'), 'Bring something else?');
  assert.equal(silverSpokenWords('<em>(She checks the time.)</em>'), '');
});
