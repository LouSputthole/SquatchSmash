#!/usr/bin/env node
/**
 * Synchronize every NO WAKE spoken line into the global sound manifest.
 *
 *   npm run vo:nowake        -> updates assets/sfx/manifest.json
 *   npm run audio:todo       -> writes the recording handoff markdown
 *
 * The scene's dialogue catalog is authoritative. Rebuilding removes stale
 * `vo.nowake.*` cues before adding the current script, so renamed or deleted
 * lines cannot remain in the recording queue by accident.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allNoWakeVoiceLines } from '../src/nowake/dialogue.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const kept = manifest.sfx.filter((cue) => !cue.name.startsWith('vo.nowake.'));
const dropped = manifest.sfx.length - kept.length;

const lines = allNoWakeVoiceLines();
const added = lines.map((line) => ({
  name: `vo.nowake.${line.cue}.1`,
  voice: line.voice,
  say: line.text,
}));

manifest.sfx = [...kept, ...added];
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const byVoice = {};
for (const line of lines) byVoice[line.voice] = (byVoice[line.voice] ?? 0) + 1;
console.log(`${added.length} NO WAKE voice cue(s) in the manifest`
  + `${dropped ? ` (replaced ${dropped})` : ''}.`);
for (const [voice, count] of Object.entries(byVoice).sort()) {
  console.log(`  ${voice.padEnd(10)} ${count}`);
}
console.log('\nRun `npm run audio:todo` for the recording sheet.');
