#!/usr/bin/env node
/**
 * Put the Beef Run's spoken lines into the sound manifest.
 *
 *   npm run vo:beefrun        -> updates assets/sfx/manifest.json
 *
 * The mission's script is the authority: every line in `src/beefrun/script.js`
 * becomes one cue named `vo.<cue>.1`, carrying the words as `say` so the rest
 * of the audio toolchain can see it. Nothing here records anything — it exists
 * so that `npm run audio:todo` lists the mission's lines alongside the flat's,
 * and so `npm run sfx:listen` picks up an mp3 the moment one is dropped in.
 *
 * Idempotent: every `vo.beefrun.*` cue is removed and rebuilt, so renaming a
 * beat or rewording a line updates the manifest instead of leaving an orphan
 * cue nobody will ever record.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allCues, SPEAKERS } from '../src/beefrun/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const nonBeefRun = manifest.sfx.filter((c) => !c.name.startsWith('vo.beefrun.'));
const dropped = manifest.sfx.length - nonBeefRun.length;

const lines = allCues();
const added = lines.map((l) => {
  const speaker = SPEAKERS[l.who] ?? SPEAKERS.SASOLE;
  return {
    name: `vo.${l.cue}.1`,
    voice: speaker.voice ?? speaker.name.toLowerCase().replace(/\s+/g, '-'),
    say: l.text,
  };
});

/* Keep the authored cue block before the post-Bing `woo` effects. The old
 * version appended it after every unrelated effect, turning one added line
 * into a four-thousand-line manifest reorder that hid the meaningful review. */
const insertAt = nonBeefRun.findIndex((c) => c.name === 'woo.up');
manifest.sfx = insertAt < 0
  ? [...nonBeefRun, ...added]
  : [...nonBeefRun.slice(0, insertAt), ...added, ...nonBeefRun.slice(insertAt)];
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const byWho = {};
for (const l of lines) byWho[l.who] = (byWho[l.who] ?? 0) + 1;
console.log(`${added.length} Beef Run voice cue(s) in the manifest`
  + `${dropped ? ` (replaced ${dropped})` : ''}.`);
for (const [who, n] of Object.entries(byWho).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${(SPEAKERS[who] ?? SPEAKERS.SASOLE).name.padEnd(18)} ${n}`);
}
console.log('\nRun `npm run audio:todo` for the recording sheet.');
