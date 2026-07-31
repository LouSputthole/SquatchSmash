#!/usr/bin/env node
/**
 * Rebuild assets/faces/index.json from what is actually in assets/faces/.
 *
 *   node tools/faces-index.mjs
 *
 * The index exists so scenes can ask "does lag.png exist yet?" without
 * fetching lag.png and eating a 404 — the same shape as assets/sfx/index.json
 * for recordings. Drop a Family photo into assets/faces/ under its ledger
 * name (docs/VOICE-CASTING.md lists the seven that are missing), run this,
 * and every scene picks the face up with no code changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'assets', 'faces');
const OUT = path.join(DIR, 'index.json');

const files = fs.readdirSync(DIR)
  .filter((f) => /\.(png|jpe?g)$/i.test(f))
  .sort();

fs.writeFileSync(OUT, `${JSON.stringify({
  note: 'Which face photos exist. Scenes fetch this instead of probing PNGs, '
    + 'because a probe for a photo that has not landed yet is a 404 in every '
    + 'console. Rebuild with: node tools/faces-index.mjs',
  files,
}, null, 2)}\n`);

console.log(`assets/faces/index.json — ${files.length} face(s): ${files.join(', ')}`);
