import assert from 'node:assert/strict';
import test from 'node:test';

import { MissionAudio } from '../src/beefrun/audio.js';
import { DialogueSystem } from '../src/beefrun/dialogue.js';
import {
  checkBeefRunVoiceManifest,
  collectBeefRunVoiceCues,
  syncBeefRunVoiceManifest,
} from '../tools/beefrun-vo.mjs';

test('the Beef Run ledger contains every exact delivery with words and casting', () => {
  const cues = collectBeefRunVoiceCues();
  assert.equal(cues.length, 237);
  assert.equal(new Set(cues.map((cue) => cue.name)).size, cues.length);
  assert.equal(cues.every((cue) => cue.name.startsWith('vo.beefrun.') && cue.voice && cue.say), true);
});

test('Beef Run manifest sync is pure and its check catches text and cast drift', () => {
  const original = { voices: { keep: { id: 'x' } }, sfx: [
    { name: 'keep.effect', prompt: 'keep' },
    { name: 'vo.beefrun.stale.1', voice: 'lou2', say: 'stale' },
    { name: 'woo.up', prompt: 'keep order' },
  ] };
  const snapshot = structuredClone(original);
  const synced = syncBeefRunVoiceManifest(original);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(checkBeefRunVoiceManifest(synced), []);
  assert.equal(synced.sfx[0].name, 'keep.effect');
  assert.equal(synced.sfx.at(-1).name, 'woo.up');

  const bad = structuredClone(synced);
  const removed = bad.sfx.findIndex((cue) => cue.name.startsWith('vo.beefrun.'));
  bad.sfx.splice(removed, 1);
  const drifted = bad.sfx.find((cue) => cue.name.startsWith('vo.beefrun.'));
  drifted.say = 'wrong words';
  drifted.voice = 'wrong voice';
  bad.sfx.push({ name: 'vo.beefrun.stale.1', voice: 'lou2', say: 'stale' });
  bad.sfx.push({ ...bad.sfx.find((cue) => cue.name.startsWith('vo.beefrun.')) });
  const failures = checkBeefRunVoiceManifest(bad).join('\n');
  assert.match(failures, /missing cue/);
  assert.match(failures, /drifted cue/);
  assert.match(failures, /stale cue/);
  assert.match(failures, /duplicate cue/);
});

test('Beef Run dialogue holds a subtitle until a delivered take finishes', () => {
  const shown = [];
  const dialogue = new DialogueSystem({ say: (html, ms) => shown.push({ html, ms }) }, {
    audio: { line: () => 5.5 },
  });
  dialogue.queue.push({
    who: 'SASOLE', text: 'A long delivered line.', hold: 1.2, cue: 'beefrun.sasole.test',
  });
  dialogue.update(0);
  assert.equal(dialogue.timer, 5.95);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].ms, 6350);
});

test('Beef Run stops the prior speaker even when the next exact take is missing', () => {
  let stopped = 0;
  const engine = {
    _vo: { stop: () => { stopped++; } },
    buffers: new Map(),
    say: () => false,
  };
  const missionAudio = new MissionAudio(engine);
  assert.equal(missionAudio.line({ who: 'SASOLE', cue: 'beefrun.sasole.missing' }), 0);
  assert.equal(stopped, 1);
  assert.equal(engine._vo, null);
});
