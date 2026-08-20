/**
 * Every source file in the tree uses LF, on every platform.
 *
 * This is not tidiness. The suite reads its own source and matches it with
 * regexes — `assert.match(mainSource, /…\);\n  if \(!entry\)…/)` and a couple
 * of hundred more like it across twenty-odd files — and those regexes are
 * written with `\n` because the repository is written with `\n`. A checkout
 * that converts to CRLF makes every one of them unmatchable.
 *
 * The failure is nastier than it sounds, because it does not present as a
 * line-ending problem. It presents as six unrelated tests reporting that the
 * mansion has no cellar boundary, that the Palace has no acoustics, and that
 * the initiation's pistol changes hands twice — none of which is true, and
 * all of which look like somebody's recent change. That is exactly what the
 * recording pass hit on Windows, and it cost an afternoon of stashing changes
 * and re-running against pristine main to prove the failures belonged to
 * nobody.
 *
 * `.gitattributes` now pins `eol=lf`, which fixes it at the checkout. This is
 * the part that notices if that ever stops being true — including for a file
 * committed with CRLF already in it, which `.gitattributes` alone does not
 * catch.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEARCH = ['src', 'tests', 'tools', 'game'];
const TEXT = new Set(['.js', '.mjs', '.json', '.html', '.css', '.md']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'validation']);

function textFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) textFiles(full, out);
    else if (TEXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

test('.gitattributes pins the working tree to LF', () => {
  const attributes = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
  assert.match(attributes, /^\*\s+text=auto\s+eol=lf$/m,
    'the repository no longer pins line endings, so a Windows checkout will '
    + 'silently make every source-matching regex in this suite unmatchable');
});

test('no source file carries a carriage return', () => {
  const offenders = [];
  for (const dir of SEARCH) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    for (const file of textFiles(full)) {
      if (fs.readFileSync(file, 'utf8').includes('\r')) {
        offenders.push(path.relative(ROOT, file));
      }
    }
  }
  assert.deepEqual(offenders.slice(0, 20), [],
    'these files contain CRLF. Every regex in the suite that matches source '
    + 'across a line break will fail against them, and it will not look like a '
    + 'line-ending problem when it does. Run `git add --renormalize .`');
});
