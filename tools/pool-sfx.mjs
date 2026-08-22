#!/usr/bin/env node
/**
 * Put the billiard table's five sounds into the manifest.
 *
 *   npm run sfx:pool         -> synchronize the `billiards.*` block
 *   npm run check:pool-sfx   -> report missing/stale/drifted cues
 *   npm run sfx              -> renders them, once they are in there
 *
 * This is `tools/mansion-sfx.mjs` for the pool table, and it exists for the
 * same reason: a cue that is not in assets/sfx/manifest.json is not a cue
 * awaiting a recording, it is a cue that does not exist. `generate-sfx` reads
 * the manifest and cannot see it, `audio:todo` reads the manifest and cannot
 * list it, and the only reason the table would make any noise at all is that
 * `AudioEngine.play()` falls through to a procedural synth for a name it does
 * not know -- which sounds like something, so nobody ever finds out.
 *
 * ONE DIFFERENCE FROM ITS SIBLING. `tools/mansion-sfx.mjs` parses the cue
 * table out of `SilentSquatch.js` as TEXT, because that module bakes canvas
 * textures at module scope and cannot be imported in plain Node. The pool
 * cues live in `src/mansion/interaction-audio.js`, which is deliberately free
 * of THREE and of the DOM, so this imports them for real. No regex, no
 * "silently dropped half the table" failure mode to guard against.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POOL_SFX_CUES } from '../src/mansion/interaction-audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

const PREFIX = 'billiards.';

/** The authored table, in manifest shape. */
export function collectPoolSfxCues() {
  return POOL_SFX_CUES.map(([name, prompt, duration]) => {
    if (!name.startsWith(PREFIX)) throw new Error(`cue "${name}" is not on the ${PREFIX} prefix`);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`cue "${name}" has no length`);
    if (prompt.length < 40) throw new Error(`cue "${name}" has a prompt too thin to record from`);
    return {
      name, duration, promptInfluence: 0.6, prompt,
    };
  });
}

/** An updated manifest, without mutating or writing the input. */
export function syncPoolSfxManifest(manifest, cues = collectPoolSfxCues()) {
  const kept = (manifest.sfx || []).filter((cue) => !cue.name.startsWith(PREFIX));
  return { ...manifest, sfx: [...kept, ...cues] };
}

/** Drift between the authored table and the manifest, as a list of reasons. */
export function checkPoolSfxManifest(manifest, cues = collectPoolSfxCues()) {
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
    /* A billiard click cast to a voice is a line of dialogue filed as a
     * noise. Same guard `tools/mansion-sfx.mjs` carries, same reason. */
    if (actual.voice || actual.say) failures.push(`${name} is cast to a voice`);
  }
  for (const name of declared.keys()) if (!expected.has(name)) failures.push(`stale cue ${name}`);
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const cues = collectPoolSfxCues();
  if (process.argv.includes('--check')) {
    const failures = checkPoolSfxManifest(manifest, cues);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} pool table sound problem(s). Run \`npm run sfx:pool\`.`);
      process.exitCode = 1;
    } else {
      console.log(`Pool table sound manifest matches ${cues.length} cue(s).`);
    }
    return;
  }

  const dropped = (manifest.sfx || []).filter((cue) => cue.name.startsWith(PREFIX)).length;
  fs.writeFileSync(MANIFEST, `${JSON.stringify(syncPoolSfxManifest(manifest, cues), null, 2)}\n`);
  console.log(`${cues.length} pool table sound cue(s) in the manifest`
    + `${dropped ? ` (replaced ${dropped})` : ''}.`);
  console.log('\nRun `npm run audio:todo` for the recording sheet, and `npm run sfx` to render them.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
