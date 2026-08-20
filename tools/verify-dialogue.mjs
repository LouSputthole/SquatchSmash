#!/usr/bin/env node
/**
 * WHICH BEATS OF WHICH SCENE ARE SILENT, AND WHY.
 *
 *   npm run verify:dialogue             write docs/audio/SILENT-CUES.md
 *   npm run verify:dialogue -- --check  fail when the committed ledger drifted
 *
 * THE BUG THIS EXISTS FOR
 *
 * Silent Squatch's scientists are meant to cough as the gas takes them. The
 * trigger fires, the cue is in the manifest, the code is correct, and the
 * owner reported the cough as broken -- because `silent.cough.dry`, `.fit` and
 * `.choke` were never GENERATED. There is no file behind them. `play()` finds
 * no decoded buffer, falls through to the synth, the synth has no case for
 * them, and the scene plays nothing and tells nobody.
 *
 * `tools/check.mjs` already fails a cue that is not in the manifest, which
 * catches a typo. Nothing caught the other half: a cue that IS in the manifest
 * and has no recording. Five hundred and ninety-nine cues are in that state,
 * so this cannot be a hard failure -- most of them are lines waiting on a
 * recording session and are tracked in VOICE-LINES-TODO.md.
 *
 * What it can be is VISIBLE, and per scene. VOICE-LINES-TODO.md is a
 * production queue sorted by cue name; it answers "what is left to record". It
 * does not answer "what will the player hear nothing at", which is the
 * question a playtest asks. This does, by reading the call sites -- so a cue
 * the code plays and nobody recorded appears against the file that plays it,
 * and a NEW one shows up as a diff on a checked-in ledger rather than as a
 * mystery three weeks later.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'docs/audio/SILENT-CUES.md');
const CHECK = process.argv.includes('--check');
const unknown = process.argv.slice(2).filter((arg) => arg !== '--check');
if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(', ')}. Supported: --check`);
  process.exit(1);
}

const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

/**
 * Every cue name a source file mentions as a literal.
 *
 * Deliberately broader than `check.mjs`'s scanner, which only looks at
 * `audio.play(...)` and `audio.startLoop(...)`. A cue reaches the engine
 * through a dozen shapes in this codebase -- `speak(audio, cue)`, a `cue:`
 * field in a script table, a frozen array of bark names, `glassAudio.distant`
 * -- and a scanner that only knows two of them is a scanner that misses the
 * cough. So this matches any single-quoted string that LOOKS like a cue name
 * and is one, which is decidable: it has to be in the manifest.
 */
const CUE_LITERAL = /'([a-z][a-z0-9]*(?:\.[a-z0-9-]+)+)'/gi;

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) sourceFiles(`${dir}/${entry.name}`, out);
    else if (entry.name.endsWith('.js')) out.push(`${dir}/${entry.name}`);
  }
  return out;
}

/**
 * Which scene a source file belongs to.
 *
 * The second path segment, except under `src/core` and `src/world`, which are
 * shared and are reported as themselves. A silent cue in `src/core` is worse
 * than one in a scene: it is silent everywhere.
 */
function sceneOf(file) {
  const parts = file.split('/');
  if (parts.length < 3) return 'src (top level)';
  return parts[1];
}

const manifest = readJson('assets/sfx/manifest.json');
const index = readJson('assets/sfx/index.json');
const files = new Set(
  (Array.isArray(index) ? index : index.files ?? [])
    .map((name) => String(name).replace(/\.[a-z0-9]+$/i, '')),
);
const declared = new Map();
for (const cue of manifest.sfx ?? []) {
  if (cue?.name) declared.set(cue.name, cue);
}

/**
 * Scenes whose cue names are BUILT rather than typed.
 *
 * A literal scan cannot see `cueName(beat, speaker, n)`, and the three biggest
 * dialogue scripts in the game all do exactly that -- the Special Meeting's
 * two hundred and seven lines are assembled from a prefix, a speaker and a
 * beat slug and appear nowhere in the source as a string. `tools/check.mjs`
 * has a note about this trap; the answer is to import the table and read the
 * cue off it, which is what the game does.
 *
 * Each entry names a module and a function that pulls the cue names out of it.
 * Add a scene here when its script stops spelling its cues out.
 */
const CUE_TABLES = Object.freeze([
  {
    file: 'src/specialmeeting/script.js',
    cues: (mod) => (mod.BEATS ?? []).flatMap((beat) => (beat.lines ?? []).map((l) => l.cue)),
  },
  {
    file: 'src/heist/script.js',
    cues: (mod) => Object.values(mod.HEIST_DIALOGUE ?? {}).map((line) => line.cue),
  },
  {
    file: 'src/initiation/script.js',
    cues: (mod) => (mod.BEATS ?? []).flatMap((beat) => (beat.lines ?? []).map((l) => l.cue)),
  },
  {
    file: 'src/mansion/script.js',
    cues: (mod) => Object.values(mod.SEQUENCES ?? {})
      .flatMap((sequence) => (Array.isArray(sequence) ? sequence : []))
      .map((line) => line?.cue),
  },
]);

/** cue -> Set of files that name it */
const referenced = new Map();
const note = (cue, file) => {
  if (!cue || !declared.has(cue)) return;
  if (!referenced.has(cue)) referenced.set(cue, new Set());
  referenced.get(cue).add(file);
};

for (const file of sourceFiles('src')) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const match of text.matchAll(CUE_LITERAL)) note(match[1], file);
}

for (const table of CUE_TABLES) {
  let mod;
  try {
    mod = await import(new URL(`../${table.file}`, import.meta.url));
  } catch (error) {
    console.error(`Could not read the cue table in ${table.file}: ${error.message}`);
    process.exit(1);
  }
  for (const cue of table.cues(mod)) note(cue, table.file);
}

const silent = [...referenced.entries()]
  .filter(([cue]) => !files.has(cue))
  .map(([cue, where]) => ({
    cue,
    duration: declared.get(cue)?.duration ?? null,
    prompt: declared.get(cue)?.prompt ?? '',
    files: [...where].sort(),
  }))
  .sort((a, b) => (a.cue < b.cue ? -1 : a.cue > b.cue ? 1 : 0));

const byScene = new Map();
for (const entry of silent) {
  for (const file of entry.files) {
    const scene = sceneOf(file);
    if (!byScene.has(scene)) byScene.set(scene, new Map());
    byScene.get(scene).set(entry.cue, entry);
  }
}

const lines = [];
lines.push('# Cues the game plays and nobody recorded');
lines.push('');
lines.push('Generated by `npm run verify:dialogue`. Do not edit by hand.');
lines.push('');
lines.push('Every cue below is named by a source file, is declared in');
lines.push('`assets/sfx/manifest.json`, and has no file in `assets/sfx/`. The code that');
lines.push('plays it is correct and the player hears nothing. That is not always a bug —');
lines.push('most of these are lines waiting on a recording session, and');
lines.push('`VOICE-LINES-TODO.md` is the queue for them. This file answers the other');
lines.push('question: **which scene is silent, at which beat.**');
lines.push('');
lines.push(`**${silent.length} silent cues across ${byScene.size} scenes.**`);
lines.push('');
for (const scene of [...byScene.keys()].sort()) {
  const entries = [...byScene.get(scene).values()].sort((a, b) => (a.cue < b.cue ? -1 : 1));
  lines.push(`## ${scene} — ${entries.length}`);
  lines.push('');
  for (const entry of entries) {
    const seconds = entry.duration ? `${entry.duration}s` : 'unknown length';
    lines.push(`- \`${entry.cue}\` (${seconds}) — ${entry.files.join(', ')}`);
  }
  lines.push('');
}

const markdown = `${lines.join('\n').trimEnd()}\n`;

if (CHECK) {
  let current = '';
  try {
    current = fs.readFileSync(DEST, 'utf8');
  } catch {
    // A missing ledger is an out-of-date ledger.
  }
  if (current !== markdown) {
    console.error('docs/audio/SILENT-CUES.md is out of date. Run `npm run verify:dialogue`.');
    process.exit(1);
  }
  console.log(`docs/audio/SILENT-CUES.md is up to date (${silent.length} silent cues).`);
} else {
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.writeFileSync(DEST, markdown);
  console.log(`Wrote docs/audio/SILENT-CUES.md — ${silent.length} silent cues across ${byScene.size} scenes.`);
}
