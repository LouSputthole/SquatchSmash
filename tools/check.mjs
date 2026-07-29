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

/* ---- wall slots referenced by the art manifest must exist ----
 * Read straight out of apartment.js rather than kept as a second list here,
 * which would only ever drift out of date.
 */
const VALID_SLOTS = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'src/world/apartment.js'), 'utf8');
  const slots = new Set();
  for (const m of src.matchAll(/slot:\s*'([^']+)'/g)) slots.add(m[1]);
  const props = src.match(/const PROP_SLOTS = \[([^\]]*)\]/);
  if (props) for (const m of props[1].matchAll(/'([^']+)'/g)) slots.add(m[1]);
  return slots;
})();
if (VALID_SLOTS.size < 20) fail(`only found ${VALID_SLOTS.size} slots in apartment.js`);
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

/* ---- every audio.say() group must have lines to say ---- */
// say() looks for cues named `vo.<group>.<n>` and returns false without a
// murmur when it finds none, so a mistyped or renamed group is a line that
// silently never plays again. Nothing else would ever tell you.
try {
  const sfxManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
  const voCues = sfxManifest.sfx.filter((c) => c.name.startsWith('vo.')).map((c) => c.name);
  for (const file of ['src/main.js', 'src/world/apartment.js']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/audio\.say\(\s*'([^']+)'/g)) {
      const group = m[1];
      if (!voCues.some((n) => n.startsWith(`vo.${group}.`))) {
        fail(`${file}: audio.say('${group}') has no vo.${group}.* cue — it will never play`);
      }
    }
  }
} catch (err) {
  fail(err.message);
}

/* ---- the radio's voice cues must match what is on air ---- */
// Every line in stations.js is turned into a text-to-speech cue by a bit of
// parsing -- strip the `SPEAKER:` label, strip stage directions, pick a voice.
// Get that wrong and you do not find out until you hear a host solemnly read
// the words "long silence" on air, so it is checked here instead.
try {
  const { voiceCues, voiceOf, STATIONS } = await import('../src/core/stations.js');
  const sfxManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
  const cues = voiceCues();
  const declared = new Set(sfxManifest.sfx.filter((c) => c.name.startsWith('radio.vo.')).map((c) => c.name));

  for (const c of cues) {
    if (!declared.has(c.name)) fail(`radio cue ${c.name} is not in assets/sfx/manifest.json — run npm run radio:cues`);
    if (!sfxManifest.voices?.[c.voice]) fail(`radio cue ${c.name} wants voice "${c.voice}", which has no entry`);
    if (/^[A-Z][A-Z '’]*:/.test(c.say)) fail(`radio cue ${c.name} still has a speaker label: "${c.say}"`);
    if (c.say.includes('(')) fail(`radio cue ${c.name} still has a stage direction: "${c.say}"`);
    if (!/[a-z0-9]/i.test(c.say)) fail(`radio cue ${c.name} has nothing to say`);
  }
  if (declared.size !== cues.length) {
    fail(`manifest has ${declared.size} radio cues, stations.js has ${cues.length} — run npm run radio:cues`);
  }
  // Two Lous only works if they are two different voices.
  const lous = new Set(
    (STATIONS.find((s) => s.id === 'squatch')?.shows?.[0]?.lines ?? [])
      .map((l) => voiceOf(l)?.voice).filter(Boolean),
  );
  if (lous.size < 2) fail('Lou & Lou resolved to a single voice — the alternation broke');
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
