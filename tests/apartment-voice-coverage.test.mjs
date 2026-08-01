import assert from 'node:assert/strict';
import test from 'node:test';

import { NO_WAKE_LOU_CALL } from '../src/core/apartment-story.js';
import { callScript } from '../src/core/phone.js';
import { allNoWakeVoiceLines } from '../src/nowake/dialogue.js';
import {
  checkNoWakeVoiceManifest,
  collectNoWakeVoiceCues,
  syncNoWakeVoiceManifest,
} from '../tools/nowake-vo.mjs';

test('the NO WAKE voice ledger is generated from the scene and canonical phone call', () => {
  const expectedScene = allNoWakeVoiceLines().map((line) => ({
    name: `vo.nowake.${line.cue}.1`,
    voice: line.voice,
    say: line.text,
  }));
  const expectedCall = callScript(NO_WAKE_LOU_CALL).map((turn) => ({
    name: turn.cue,
    voice: turn.who === 'me' ? 'player' : NO_WAKE_LOU_CALL.voiceProfile,
    say: turn.text,
  }));

  assert.deepEqual(collectNoWakeVoiceCues(), [...expectedScene, ...expectedCall]);
  assert.deepEqual(expectedCall.map((cue) => cue.name), [
    'vo.call.lou.no_wake.1',
    'vo.call.lou.no_wake.tony.1',
    'vo.call.lou.no_wake.2',
    'vo.call.lou.no_wake.tony.2',
    'vo.call.lou.no_wake.3',
    'vo.call.lou.no_wake.tony.3',
    'vo.call.lou.no_wake.4',
    'vo.call.lou.no_wake.tony.4',
  ]);
});

test('NO WAKE manifest sync replaces only its owned voice banks and stays pure', () => {
  const original = {
    voices: { player: { id: 'keep' } },
    sfx: [
      { name: 'radio.click', file: 'keep.wav' },
      { name: 'vo.nowake.stale.1', voice: 'lou', say: 'stale' },
      { name: 'vo.call.lou.no_wake.stale', voice: 'lou', say: 'stale' },
    ],
  };
  const snapshot = structuredClone(original);
  const synced = syncNoWakeVoiceManifest(original);

  assert.deepEqual(original, snapshot);
  assert.deepEqual(synced.voices, original.voices);
  assert.deepEqual(synced.sfx.filter((cue) => cue.name === 'radio.click'), [original.sfx[0]]);
  assert.equal(synced.sfx.some((cue) => cue.name.includes('stale')), false);
  assert.deepEqual(synced.sfx.slice(1), collectNoWakeVoiceCues());
  assert.deepEqual(checkNoWakeVoiceManifest(synced), []);
});

test('NO WAKE voice check reports missing, drifted, stale and duplicate cues', () => {
  const bad = syncNoWakeVoiceManifest({ sfx: [] });
  const removed = bad.sfx.shift();
  bad.sfx[0].voice = 'wrong';
  bad.sfx.push({ name: 'vo.call.lou.no_wake.stale', voice: 'lou1', say: 'stale' });
  bad.sfx.push({ ...bad.sfx[1] });

  const failures = checkNoWakeVoiceManifest(bad).join('\n');
  assert.match(failures, new RegExp(`missing cue ${removed.name.replaceAll('.', '\\.')}\\b`));
  assert.match(failures, /drifted cue /);
  assert.match(failures, /stale cue vo\.call\.lou\.no_wake\.stale/);
  assert.match(failures, /duplicate cue /);
});
