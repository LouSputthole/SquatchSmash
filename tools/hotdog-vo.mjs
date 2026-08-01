#!/usr/bin/env node
/**
 * Synchronize the closed-party incident and graveyard dialogue into the
 * global sound manifest.
 *
 * Runtime script modules are authoritative. This tool removes the old cue
 * banks before writing the current text, so rewritten lines cannot leave a
 * stale recording assignment behind.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allHotDogVoiceLines } from '../src/core/hotdog-voice-catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const PREFIXES = Object.freeze(['vo.bing2.', 'vo.graveyard.']);

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const kept = manifest.sfx.filter((cue) => !PREFIXES.some((prefix) => cue.name.startsWith(prefix)));
const dropped = manifest.sfx.length - kept.length;
const lines = allHotDogVoiceLines();
const added = lines.map((line) => ({
  name: line.cue,
  voice: line.voice,
  say: line.text,
}));

/* Keep authored story VO together, immediately before the NO WAKE block when
 * it exists. This makes a one-line rewrite reviewable instead of moving the
 * entire effects library. */
const insertAt = kept.findIndex((cue) => cue.name.startsWith('vo.nowake.'));
manifest.sfx = insertAt < 0
  ? [...kept, ...added]
  : [...kept.slice(0, insertAt), ...added, ...kept.slice(insertAt)];
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const byVoice = {};
for (const line of lines) byVoice[line.voice] = (byVoice[line.voice] ?? 0) + 1;
console.log(`${added.length} HotDog incident/graveyard voice cue(s) in the manifest`
  + `${dropped ? ` (replaced ${dropped})` : ''}.`);
for (const [voice, count] of Object.entries(byVoice).sort()) {
  console.log(`  ${voice.padEnd(12)} ${count}`);
}
console.log('\nRun `npm run audio:todo` for the recording sheet.');
