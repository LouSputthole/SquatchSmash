#!/usr/bin/env node
/**
 * Synchronize the Beef Run's authored dialogue with the sound manifest.
 *
 *   npm run vo:beefrun          -> synchronize the exact cue block
 *   npm run check:beefrun-vo    -> report missing/stale/text/cast drift
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allCues, SPEAKERS } from '../src/beefrun/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

export function collectBeefRunVoiceCues() {
  return allCues().map((line) => {
    const speaker = SPEAKERS[line.who] ?? SPEAKERS.SASOLE;
    return {
      name: `vo.${line.cue}.1`,
      voice: speaker.voice ?? speaker.name.toLowerCase().replace(/\s+/g, '-'),
      say: line.text,
    };
  });
}

export function syncBeefRunVoiceManifest(manifest) {
  const kept = (manifest.sfx || []).filter((cue) => !cue.name.startsWith('vo.beefrun.'));
  const added = collectBeefRunVoiceCues();
  /* Keep the authored block before the post-Bing `woo` effects so one new
   * line does not reorder thousands of unrelated manifest rows. */
  const insertAt = kept.findIndex((cue) => cue.name === 'woo.up');
  return {
    ...manifest,
    sfx: insertAt < 0
      ? [...kept, ...added]
      : [...kept.slice(0, insertAt), ...added, ...kept.slice(insertAt)],
  };
}

export function checkBeefRunVoiceManifest(manifest) {
  const expected = new Map(collectBeefRunVoiceCues().map((cue) => [cue.name, cue]));
  const owned = (manifest.sfx || []).filter((cue) => cue.name.startsWith('vo.beefrun.'));
  const actual = new Map();
  const failures = [];
  for (const cue of owned) {
    if (actual.has(cue.name)) failures.push(`duplicate cue ${cue.name}`);
    else actual.set(cue.name, cue);
  }
  for (const [name, cue] of expected) {
    const got = actual.get(name);
    if (!got) failures.push(`missing cue ${name}`);
    else if (got.say !== cue.say || got.voice !== cue.voice) failures.push(`drifted cue ${name}`);
  }
  for (const name of actual.keys()) if (!expected.has(name)) failures.push(`stale cue ${name}`);
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (process.argv.includes('--check')) {
    const failures = checkBeefRunVoiceManifest(manifest);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} Beef Run voice problem(s). Run \`npm run vo:beefrun\`.`);
      process.exitCode = 1;
    } else {
      console.log(`Beef Run voice manifest matches ${collectBeefRunVoiceCues().length} cue(s).`);
    }
    return;
  }

  const dropped = (manifest.sfx || []).filter((cue) => cue.name.startsWith('vo.beefrun.')).length;
  const synced = syncBeefRunVoiceManifest(manifest);
  fs.writeFileSync(MANIFEST, `${JSON.stringify(synced, null, 2)}\n`);
  const byWho = {};
  for (const line of allCues()) byWho[line.who] = (byWho[line.who] ?? 0) + 1;
  console.log(`${collectBeefRunVoiceCues().length} Beef Run voice cue(s) in the manifest`
    + `${dropped ? ` (replaced ${dropped})` : ''}.`);
  for (const [who, count] of Object.entries(byWho).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(SPEAKERS[who] ?? SPEAKERS.SASOLE).name.padEnd(18)} ${count}`);
  }
  console.log('\nRun `npm run audio:todo` for the recording sheet.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
