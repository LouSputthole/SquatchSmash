#!/usr/bin/env node
/**
 * Rebuild Silver Pines' one-file-per-line voice bank from the scene script.
 *
 *   npm run vo:golf           -> updates assets/sfx/manifest.json
 *   npm run audio:todo        -> writes the recording sheet
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUES } from '../src/golf/script.js';
import { voiceProfileFor } from '../src/core/characters.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const kept = manifest.sfx.filter((cue) => !cue.name.startsWith('vo.golf.'));
const dropped = manifest.sfx.length - kept.length;

const added = Object.values(CUES).map((cue) => {
  const voice = voiceProfileFor(cue.speaker);
  if (!voice) throw new Error(`No voice profile for golf speaker ${cue.speaker}`);
  if (!cue.direction) throw new Error(`Golf cue ${cue.id} has no recording direction`);
  return {
    name: `vo.${cue.id}`,
    voice,
    say: cue.text,
    direction: cue.direction,
    ...(cue.hold > 0 ? { postLineHold: cue.hold } : {}),
  };
});

manifest.sfx = [...kept, ...added];
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const byVoice = {};
for (const cue of added) byVoice[cue.voice] = (byVoice[cue.voice] ?? 0) + 1;
console.log(`${added.length} Silver Pines voice cue(s) in the manifest`
  + `${dropped ? ` (replaced ${dropped})` : ''}.`);
for (const [voice, count] of Object.entries(byVoice).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${voice.padEnd(14)} ${count}`);
}
console.log('\nRun `npm run audio:todo` for the recording sheet.');
