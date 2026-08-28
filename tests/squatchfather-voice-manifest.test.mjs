import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { SQUATCHFATHER_VO_CUES } from '../src/squatchfather/audio/core.js';
import {
  checkSquatchfatherVoiceManifest,
  collectSquatchfatherVoiceCues,
  syncSquatchfatherVoiceManifest,
} from '../tools/squatchfather-vo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dialogue = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'src/squatchfather/dialogue/dialogue.json'), 'utf8',
));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));

test('Squatchfather runtime cues, authored lines, and manifest are one exact bank', () => {
  const cues = collectSquatchfatherVoiceCues(dialogue);
  assert.equal(cues.length, 28);
  assert.deepEqual(cues.map(({ name }) => name), [...SQUATCHFATHER_VO_CUES]);
  assert.deepEqual(checkSquatchfatherVoiceManifest(manifest, dialogue), []);
});

test('Squatchfather sync repairs its bank without changing unrelated audio', () => {
  const broken = structuredClone(manifest);
  broken.sfx.find(({ name }) => name === 'vo.sf.opening.history.2').say = 'stale words';
  broken.sfx.push({ name: 'vo.sf.stale.1', voice: 'sal', say: 'stale' });
  const unrelatedBefore = broken.sfx.filter(({ name }) => !name.startsWith('vo.sf.'));
  const repaired = syncSquatchfatherVoiceManifest(broken, dialogue);
  assert.deepEqual(checkSquatchfatherVoiceManifest(repaired, dialogue), []);
  assert.deepEqual(repaired.sfx.filter(({ name }) => !name.startsWith('vo.sf.')), unrelatedBefore);
});
