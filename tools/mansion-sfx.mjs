#!/usr/bin/env node
/**
 * Put PROJECT SILENT SQUATCH's sound effects into the manifest.
 *
 *   npm run sfx:mansion         -> synchronize the `silent.*` block
 *   npm run check:mansion-sfx   -> report missing/stale/drifted cues
 *   npm run sfx                 -> renders them, once they are in there
 *
 * WHY THIS EXISTS. `src/mansion/scenes/SilentSquatch.js` has authored every
 * sound in the basement since the day it was built -- a name and a paragraph
 * of direction for each one, the same shape `src/core/weapons/audio.js` uses
 * -- and not one of them was in `assets/sfx/manifest.json`. docs/RIGHT-FIRST-
 * TIME.md lists it under "the gaps the machines still have":
 *
 *   > `silent.*` cue sync. Promote the 33 locally-authored SilentSquatch cues
 *   > into the manifest so `npm run sfx` can render them (they are synth-only
 *   > until then).
 *
 * A cue that is not in the manifest is not a cue with no recording yet. It is
 * a cue that does not exist as far as production is concerned: `generate-sfx`
 * reads the manifest and cannot see it, `audio:todo` reads the manifest and
 * cannot list it, and the only reason the scene makes any noise at all is that
 * `AudioEngine.play()` falls through to a procedural synth for an unknown
 * name. Thirty-five sounds, fully described, invisible to everybody whose job
 * is to record them.
 *
 * This is `tools/mansion-vo.mjs` for the other half of the same scene, and it
 * keeps that file's two rules: it does not invent names (the scene's own table
 * is the source), and it does not write anything the scene did not author.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

const PREFIX = 'silent.';

/**
 * The scene's cue table, in manifest shape.
 *
 * Imported by READING THE SOURCE rather than by `await import()`: this module
 * builds canvas textures at module scope and drags a WebGL-shaped dependency
 * into anything that merely wants to know what noises it makes -- the same
 * reason `src/mansion/cast.js` writes its three floor heights out longhand
 * instead of importing MansionGrounds. `npm run check` runs in plain Node.
 *
 * The table is one array literal of `[name, prompt, seconds]` and the parse is
 * strict about that: anything it cannot read is a THROW, never a skip, because
 * a sync tool that silently drops half a scene is the fault this file exists
 * to stop.
 */
export function collectMansionSfxCues(source = null) {
  const src = source ?? fs.readFileSync(
    path.join(ROOT, 'src/mansion/scenes/SilentSquatch.js'), 'utf8',
  );
  const open = src.indexOf('export const SILENT_SQUATCH_CUES = Object.freeze([');
  if (open < 0) throw new Error('SILENT_SQUATCH_CUES is not where this tool looks for it');
  const close = src.indexOf('\n]);', open);
  if (close < 0) throw new Error('SILENT_SQUATCH_CUES is not closed where this tool expects');
  const block = src.slice(open, close);

  const cues = [];
  const entry = /\[\s*'([a-z0-9.]+)',\s*('(?:[^'\\]|\\.)*'),\s*([0-9.]+)\s*\]/g;
  for (const found of block.matchAll(entry)) {
    const [, name, quoted, seconds] = found;
    if (!name.startsWith(PREFIX)) throw new Error(`cue "${name}" is not on the ${PREFIX} prefix`);
    /* The prompts carry apostrophes, so they are authored with backslash
     * escapes; undo exactly those two and nothing else. */
    const prompt = quoted.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    const duration = Number(seconds);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`cue "${name}" has no length`);
    if (prompt.length < 40) throw new Error(`cue "${name}" has a prompt too thin to record from`);
    const cue = { name, duration };
    /* Derived, never authored twice: a prompt that opens "Loop." describes a
     * seamless bed. See the note on the table itself. */
    if (/^Loop\./.test(prompt)) cue.loop = true;
    cue.prompt = prompt;
    cues.push(cue);
  }
  if (!cues.length) throw new Error('parsed the cue table and found nothing in it');
  return cues;
}

/** An updated manifest, without mutating or writing the input. */
export function syncMansionSfxManifest(manifest, cues = collectMansionSfxCues()) {
  const kept = (manifest.sfx || []).filter((cue) => !cue.name.startsWith(PREFIX));
  return { ...manifest, sfx: [...kept, ...cues] };
}

/** Drift between the scene's table and the manifest, as a list of reasons. */
export function checkMansionSfxManifest(manifest, cues = collectMansionSfxCues()) {
  const failures = [];
  const expected = new Map();
  for (const cue of cues) {
    if (expected.has(cue.name)) failures.push(`duplicate authored cue ${cue.name}`);
    expected.set(cue.name, cue);
  }
  const declared = new Map();
  for (const cue of (manifest.sfx || []).filter((entry) => entry.name.startsWith(PREFIX))) {
    if (declared.has(cue.name)) failures.push(`duplicate manifest cue ${cue.name}`);
    else declared.set(cue.name, cue);
  }
  for (const [name, cue] of expected) {
    const actual = declared.get(name);
    if (!actual) { failures.push(`missing cue ${name}`); continue; }
    if (actual.prompt !== cue.prompt) failures.push(`drifted prompt ${name}`);
    if (actual.duration !== cue.duration) failures.push(`drifted duration ${name}`);
    if (Boolean(actual.loop) !== Boolean(cue.loop)) failures.push(`drifted loop flag ${name}`);
    /* A `silent.*` cue with a voice is a line of dialogue filed as a noise,
     * which is how the Shubenator ended up coming out of a briefcase. */
    if (actual.voice || actual.say) failures.push(`${name} is cast to a voice`);
  }
  for (const name of declared.keys()) if (!expected.has(name)) failures.push(`stale cue ${name}`);
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const cues = collectMansionSfxCues();
  if (process.argv.includes('--check')) {
    const failures = checkMansionSfxManifest(manifest, cues);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} PROJECT SILENT SQUATCH sound problem(s). Run \`npm run sfx:mansion\`.`);
      process.exitCode = 1;
    } else {
      console.log(`PROJECT SILENT SQUATCH sound manifest matches ${cues.length} cue(s).`);
    }
    return;
  }

  const dropped = (manifest.sfx || []).filter((cue) => cue.name.startsWith(PREFIX)).length;
  fs.writeFileSync(MANIFEST, `${JSON.stringify(syncMansionSfxManifest(manifest, cues), null, 2)}\n`);
  const loops = cues.filter((cue) => cue.loop).length;
  console.log(`${cues.length} PROJECT SILENT SQUATCH sound cue(s) in the manifest`
    + `${dropped ? ` (replaced ${dropped})` : ''} — ${loops} loop(s), ${cues.length - loops} one-shot(s).`);
  console.log('\nRun `npm run audio:todo` for the recording sheet, and `npm run sfx` to render them.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
