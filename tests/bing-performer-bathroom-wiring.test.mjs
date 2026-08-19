import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Bing runtime gives the shared bar input priority and preloads its exact cues', async () => {
  const source = await readFile(new URL('../src/bing/main.js', import.meta.url), 'utf8');
  assert.match(source, /performerBathroom\.stageAction\(game\.tips \|\| 0, isSecondVisit\)/);
  assert.match(source, /if \(performerBathroom\.active\)[\s\S]*performerBathroom\.press\(\)[\s\S]*performerBathroom\.abandon\(\)/);
  assert.match(source, /names: \[\.\.\.radioCueNames, \.\.\.BING_PERFORMER_BATHROOM_CUES\]/);
  assert.match(source, /for \(const npc of cast\.all\) npc\.update[\s\S]*performerBathroom\.update\(dt\)/);
  assert.match(source, /if \(performerBathroom\.active\) performerBathroom\.abandon\(\);[\s\S]*game\.paused = true/);
});
