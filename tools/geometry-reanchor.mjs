#!/usr/bin/env node
/**
 * Re-point geometry allowlist entries at the lines their anchors moved to.
 *
 * Every entry in `tools/geometry-allowlists/*.json` carries a `source` of the
 * form `path/to/file.js:1483` and a `sourceAnchor` — a snippet that has to
 * appear on that exact line. The pairing is deliberate and good: it stops an
 * allowlist entry from outliving the geometry it excuses, because an entry
 * whose anchor is no longer on its line is reported as a configuration error
 * rather than quietly going on suppressing something.
 *
 * The cost is that the line NUMBER is a line number. Fixing five real defects
 * in `src/cartel-palace/world.js` inserted about fifty lines of code and
 * comment, and every one of the twenty-six entries anchored below the first
 * insertion broke at once — none of them because anything was wrong with the
 * geometry they describe.
 *
 * So this does the mechanical half: for each entry, find where its anchor
 * actually is now and rewrite the number. It deliberately does NOT touch
 * `reason`, `maxDepthM`, `left`, `right` or anything else — if the geometry
 * genuinely changed, that is a judgement for a person and the gate will still
 * say so.
 *
 * When an anchor appears on several lines it takes the one nearest the number
 * already there, which is the right guess for code that has shifted rather
 * than moved.
 *
 *   node tools/geometry-reanchor.mjs             # every allowlist
 *   node tools/geometry-reanchor.mjs cartel-palace
 *   node tools/geometry-reanchor.mjs --check     # report, change nothing
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'tools/geometry-allowlists');

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const only = argv.filter((value) => !value.startsWith('--'));

/** Every line of a source file, cached: one allowlist hits the same file often. */
const sources = new Map();
function linesOf(relative) {
  if (!sources.has(relative)) {
    const full = path.join(ROOT, relative);
    sources.set(relative, fs.existsSync(full)
      ? fs.readFileSync(full, 'utf8').split('\n')
      : null);
  }
  return sources.get(relative);
}

/** Where the anchor lives now, preferring the candidate nearest `was`. */
function findAnchor(lines, anchor, was) {
  const hits = [];
  for (const [index, line] of lines.entries()) {
    if (line.includes(anchor)) hits.push(index + 1);
  }
  if (!hits.length) return null;
  return hits.reduce((best, line) => (
    Math.abs(line - was) < Math.abs(best - was) ? line : best
  ));
}

let moved = 0;
let lost = 0;
const files = fs.readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .filter((name) => !only.length || only.includes(path.basename(name, '.json')));

for (const name of files) {
  const full = path.join(DIR, name);
  const raw = fs.readFileSync(full, 'utf8');
  const allowlist = JSON.parse(raw);
  let text = raw;
  for (const entry of allowlist.entries ?? []) {
    if (!entry.source || !entry.sourceAnchor) continue;
    const match = /^(.*):(\d+)$/.exec(entry.source);
    if (!match) continue;
    const [, file, wasText] = match;
    const was = Number(wasText);
    const lines = linesOf(file);
    if (!lines) {
      console.warn(`  MISSING ${entry.id}: ${file} does not exist`);
      lost++;
      continue;
    }
    if (lines[was - 1]?.includes(entry.sourceAnchor)) continue;
    const now = findAnchor(lines, entry.sourceAnchor, was);
    if (now === null) {
      console.warn(`  LOST    ${entry.id}: anchor ${JSON.stringify(entry.sourceAnchor)}`
        + ` is nowhere in ${file} — the geometry it excuses may be gone`);
      lost++;
      continue;
    }
    console.log(`  moved   ${entry.id}: ${file}:${was} -> ${now}`);
    /* Rewritten in the TEXT rather than by re-serialising the parsed object:
     * these files are hand-curated, and reprinting one would reflow every
     * entry in it and bury the real change in a thousand-line diff. */
    const before = `"source": ${JSON.stringify(entry.source)}`;
    const after = `"source": ${JSON.stringify(`${file}:${now}`)}`;
    const at = text.indexOf(`"id": ${JSON.stringify(entry.id)}`);
    const cut = text.indexOf(before, at);
    if (at < 0 || cut < 0) {
      console.warn(`  SKIP    ${entry.id}: could not find its source line in the file text`);
      lost++;
      continue;
    }
    text = text.slice(0, cut) + after + text.slice(cut + before.length);
    moved++;
  }
  if (text !== raw && !check) fs.writeFileSync(full, text);
}

console.log(`\n${moved} entr${moved === 1 ? 'y' : 'ies'} re-anchored`
  + `${lost ? `, ${lost} could not be` : ''}${check ? ' (--check: nothing written)' : ''}.`);
process.exit(lost ? 1 : 0);
