#!/usr/bin/env node
/**
 * Cheap project sanity check: parse every source file and every manifest.
 *
 *   npm run check
 *
 * There is no build step and no test framework here; this catches the class of
 * mistake that would otherwise only show up as a blank screen in the browser.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

let failures = 0;
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failures++; };

/* ---- syntax ---- */
const sources = [
  ...walk(path.join(ROOT, 'src')),
  ...walk(path.join(ROOT, 'tools')),
].filter((f) => /\.m?js$/.test(f));

console.log(`Parsing ${sources.length} source files…`);
for (const file of sources) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    fail(`${path.relative(ROOT, file)}\n${err.stderr?.toString().trim()}`);
  }
}

/* ---- manifests ---- */
const manifests = [
  ['assets/sfx/manifest.json', (d) => Array.isArray(d.sfx) || 'missing "sfx" array'],
  ['assets/music/manifest.json', (d) => Array.isArray(d.tracks) || 'missing "tracks" array'],
  ['assets/art/manifest.json', (d) => Array.isArray(d.art) || 'missing "art" array'],
  ['assets/sfx/index.json', (d) => Array.isArray(d.files) || 'missing "files" array'],
];

console.log(`Validating ${manifests.length} manifests…`);
for (const [rel, validate] of manifests) {
  const abs = path.join(ROOT, rel);
  try {
    const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const ok = validate(data);
    if (ok !== true) fail(`${rel}: ${ok}`);
  } catch (err) {
    fail(`${rel}: ${err.message}`);
  }
}

/* ---- wall slots referenced by the art manifest must exist ---- */
const VALID_SLOTS = new Set([
  'bed.above', 'bed.mid', 'bed.right',
  'gap.high', 'gap.low', 'gap.mid',
  'couch.left', 'couch.mid', 'couch.right',
  'shelf.left', 'cork.above', 'desk.left', 'desk.right', 'desk.high',
  'door.side', 'south.a', 'south.b', 'south.wide', 'south.portrait',
  'banner.main', 'banner.twitch', 'crest.round', 'zyn.lid',
  'shelf.photo', 'desk.photo', 'fridge.magnet',
]);
try {
  const art = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/art/manifest.json'), 'utf8'));
  for (const entry of art.art || []) {
    if (entry.slot && !VALID_SLOTS.has(entry.slot)) {
      fail(`assets/art/manifest.json: unknown slot "${entry.slot}"`);
    }
    if (entry.file) {
      const p = path.join(ROOT, 'assets/art', entry.file);
      if (!fs.existsSync(p)) fail(`assets/art/manifest.json: "${entry.file}" not found`);
    }
  }
  const music = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/music/manifest.json'), 'utf8'));
  for (const t of music.tracks || []) {
    if (!t.file) fail('assets/music/manifest.json: a track is missing "file"');
    else if (!fs.existsSync(path.join(ROOT, 'assets/music', t.file))) {
      fail(`assets/music/manifest.json: "${t.file}" not found`);
    }
  }
} catch (err) {
  fail(err.message);
}

/* ---- three.js must actually be vendored ---- */
const three = path.join(ROOT, 'vendor/three.module.min.js');
if (!fs.existsSync(three) || fs.statSync(three).size < 100_000) {
  fail('vendor/three.module.min.js is missing or truncated');
}

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log('\nAll good.');
