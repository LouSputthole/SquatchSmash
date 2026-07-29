#!/usr/bin/env node
/**
 * Sync the radio's spoken cues in assets/sfx/manifest.json with what is
 * actually on air in src/core/stations.js.
 *
 *   node tools/radio-cues.mjs        # rewrite the radio.vo.* block
 *   node tools/radio-cues.mjs --check  # exit 1 if it is out of date
 *
 * The scripts live in stations.js and nowhere else. Hand-maintaining 60-odd
 * matching manifest entries would guarantee they drift the first time
 * somebody rewrites a line, so they are derived instead. Run this after
 * editing any station's dialogue, then `npm run sfx:vo`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { voiceCues } from '../src/core/stations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets', 'sfx', 'manifest.json');
const CHECK = process.argv.includes('--check');

const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
const cues = voiceCues();

const missingVoices = [...new Set(cues.map((c) => c.voice))].filter((v) => !manifest.voices?.[v]);
if (missingVoices.length) {
  console.error(`No entry in the manifest "voices" block for: ${missingVoices.join(', ')}`);
  process.exit(1);
}

const kept = manifest.sfx.filter((c) => !c.name.startsWith('radio.vo.'));
const before = JSON.stringify(manifest.sfx.filter((c) => c.name.startsWith('radio.vo.')));
const after = JSON.stringify(cues);

if (before === after) {
  console.log(`Up to date — ${cues.length} radio line(s).`);
  process.exit(0);
}

if (CHECK) {
  console.error('assets/sfx/manifest.json is out of date. Run: node tools/radio-cues.mjs');
  process.exit(1);
}

// Radio lines go last so the hand-written effects at the top stay readable.
manifest.sfx = [...kept, ...cues];
await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

const byVoice = {};
for (const c of cues) byVoice[c.voice] = (byVoice[c.voice] ?? 0) + 1;
console.log(`Wrote ${cues.length} radio line(s) to assets/sfx/manifest.json:`);
for (const [v, n] of Object.entries(byVoice).sort()) console.log(`  ${v.padEnd(12)} ${n}`);
