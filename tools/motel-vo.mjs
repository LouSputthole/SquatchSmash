#!/usr/bin/env node
/** Synchronize every Jerky Motel character line into the global manifest. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allMotelVoiceLines } from '../src/motel/voice-catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const checkOnly = process.argv.includes('--check');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const lines = allMotelVoiceLines();
const expected = lines.map((line) => ({
  name: `${line.cue}.1`,
  voice: line.voice,
  say: line.text,
}));
const current = manifest.sfx.filter((cue) => cue.name.startsWith('vo.motel.'));

if (checkOnly) {
  const actual = new Map(current.map((cue) => [cue.name, cue]));
  const wanted = new Map(expected.map((cue) => [cue.name, cue]));
  const missing = expected.filter((cue) => !actual.has(cue.name));
  const stale = current.filter((cue) => !wanted.has(cue.name));
  const drifted = expected.filter((cue) => {
    const got = actual.get(cue.name);
    return got && (got.say !== cue.say || got.voice !== cue.voice);
  });
  if (missing.length || stale.length || drifted.length) {
    console.error(`Motel VO drift: ${missing.length} missing, ${stale.length} stale, ${drifted.length} changed.`);
    process.exit(1);
  }
  console.log(`${expected.length} Motel voice cues match the authored catalog.`);
  process.exit(0);
}

const kept = manifest.sfx.filter((cue) => !cue.name.startsWith('vo.motel.'));
const insertAt = kept.findIndex((cue) => cue.name.startsWith('vo.nowake.'));
manifest.sfx = insertAt < 0
  ? [...kept, ...expected]
  : [...kept.slice(0, insertAt), ...expected, ...kept.slice(insertAt)];
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const byVoice = {};
for (const line of lines) byVoice[line.voice] = (byVoice[line.voice] ?? 0) + 1;
console.log(`${expected.length} Motel voice cue(s) written.`);
for (const [voice, count] of Object.entries(byVoice).sort()) {
  console.log(`  ${voice.padEnd(10)} ${count}`);
}
