/**
 * Re-point a staging allowlist's `source` line numbers at the lines its
 * `sourceAnchor` text actually sits on now.
 *
 *   node tools/staging-reanchor.mjs            # every allowlist
 *   node tools/staging-reanchor.mjs bing       # one scene
 *   node tools/staging-reanchor.mjs --check    # report, change nothing
 *
 * WHY THIS EXISTS. Every entry cites a file and a line, and the verifier
 * checks that the anchor text is on that line -- which is the whole value of
 * the citation, because an entry pointing at a line that has moved is an
 * entry nobody can check. But it means that inserting six lines into a scene
 * file invalidates every entry below them, and the geometry gate had 480
 * entries go stale in one commit for exactly that reason.
 *
 * This moves the numbers ONLY. It refuses an anchor that no longer appears in
 * the file at all, and refuses one that appears more than once, because both
 * of those are a human deciding whether the entry still means anything --
 * which is the judgement the citation exists to force.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'tools', 'staging-allowlists');

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const filters = argv.filter((a) => !a.startsWith('--'));

let moved = 0;
let stuck = 0;

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const scene = file.replace(/\.json$/, '');
  if (filters.length && !filters.includes(scene)) continue;
  const full = path.join(DIR, file);
  const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
  const entries = Array.isArray(doc) ? doc : (doc.entries ?? []);
  const lines = new Map();
  let changed = false;

  for (const entry of entries) {
    if (!entry.source || !entry.sourceAnchor) continue;
    const [rel, lineText] = String(entry.source).split(':');
    const target = path.join(ROOT, rel);
    if (!lines.has(rel)) {
      lines.set(rel, fs.existsSync(target) ? fs.readFileSync(target, 'utf8').split('\n') : null);
    }
    const body = lines.get(rel);
    if (!body) { console.log(`STUCK ${scene} ${entry.id}: ${rel} does not exist`); stuck += 1; continue; }

    const hits = [];
    body.forEach((text, i) => { if (text.includes(entry.sourceAnchor)) hits.push(i + 1); });
    if (hits.length === 0) {
      console.log(`STUCK ${scene} ${entry.id}: anchor is nowhere in ${rel}`);
      stuck += 1;
      continue;
    }
    if (hits.length > 1) {
      console.log(`STUCK ${scene} ${entry.id}: anchor is on ${hits.length} lines of ${rel} (${hits.join(', ')})`);
      stuck += 1;
      continue;
    }
    const was = Number(lineText);
    if (hits[0] === was) continue;
    console.log(`MOVE  ${scene} ${entry.id}: ${rel}:${was} -> ${hits[0]}`);
    entry.source = `${rel}:${hits[0]}`;
    changed = true;
    moved += 1;
  }

  if (changed && !check) fs.writeFileSync(full, `${JSON.stringify(doc, null, 2)}\n`);
}

console.log(`${moved} moved, ${stuck} need a human.`);
process.exit(stuck ? 1 : 0);
