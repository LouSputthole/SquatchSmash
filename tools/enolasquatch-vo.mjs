#!/usr/bin/env node
/**
 * Synchronize SQUATCHOLA GAY's authored dialogue with the sound manifest.
 *
 *   npm run vo:enolasquatch        -> synchronize the exact cue block
 *   npm run check:enolasquatch-vo  -> report missing/stale/text/cast drift
 *   npm run audio:todo             -> writes the recording handoff markdown
 *
 * The mission is written to the Beef Run's pattern deliberately (see the
 * header of src/enolasquatch/dialogue/script.js), so this is written to
 * tools/beefrun-vo.mjs's pattern for the same reason: `vo.<cue>.<take>`, one
 * take per line, the script as the single source of truth, and a rebuild that
 * drops the old block first so a renamed beat cannot leave an orphan behind.
 *
 * Nothing here mints a voice profile. Every speaker resolves to a profile that
 * already exists in the manifest's `voices` block — `lou2` for Sasole, `irish`,
 * `numbskull`, `shubenator`, `lou1` for Big Uncle Lou and `player` for Tony —
 * because this crew is five people the campaign has already cast.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEAKERS, allEnolaSquatchLines } from '../src/enolasquatch/dialogue/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

const PREFIX = 'vo.enolasquatch.';

export function collectEnolaSquatchVoiceCues() {
  return allEnolaSquatchLines().map((line) => {
    const speaker = SPEAKERS[line.who] ?? SPEAKERS.SASOLE;
    return { name: `vo.${line.cue}.1`, voice: speaker.voice, say: line.text };
  });
}

/** Return an updated manifest without mutating or writing the input. */
export function syncEnolaSquatchVoiceManifest(manifest) {
  const kept = (manifest.sfx || []).filter((cue) => !cue.name.startsWith(PREFIX));
  return { ...manifest, sfx: [...kept, ...collectEnolaSquatchVoiceCues()] };
}

/** Report scene cue drift without changing the manifest. */
export function checkEnolaSquatchVoiceManifest(manifest) {
  const failures = [];
  const expected = new Map();
  for (const cue of collectEnolaSquatchVoiceCues()) {
    /* `cueOf` keys on beat id + index + speaker, so a collision means two
     * different lines would share one recording. Worth failing loudly: the
     * symptom in game is a line that plays somebody else's audio. */
    if (expected.has(cue.name)) failures.push(`colliding cue ${cue.name}`);
    expected.set(cue.name, cue);
  }
  const declared = new Map();
  for (const cue of (manifest.sfx || []).filter((entry) => entry.name.startsWith(PREFIX))) {
    if (declared.has(cue.name)) failures.push(`duplicate cue ${cue.name}`);
    else declared.set(cue.name, cue);
  }
  for (const [name, cue] of expected) {
    const actual = declared.get(name);
    if (!actual) failures.push(`missing cue ${name}`);
    else if (actual.voice !== cue.voice || actual.say !== cue.say) failures.push(`drifted cue ${name}`);
  }
  for (const name of declared.keys()) if (!expected.has(name)) failures.push(`stale cue ${name}`);
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (process.argv.includes('--check')) {
    const failures = checkEnolaSquatchVoiceManifest(manifest);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} SQUATCHOLA GAY voice problem(s). Run \`npm run vo:enolasquatch\`.`);
      process.exitCode = 1;
    } else {
      console.log(`SQUATCHOLA GAY voice manifest matches ${collectEnolaSquatchVoiceCues().length} cue(s).`);
    }
    return;
  }

  const dropped = (manifest.sfx || []).filter((cue) => cue.name.startsWith(PREFIX)).length;
  const cues = collectEnolaSquatchVoiceCues();
  fs.writeFileSync(MANIFEST, `${JSON.stringify(syncEnolaSquatchVoiceManifest(manifest), null, 2)}\n`);

  const byWho = {};
  for (const line of allEnolaSquatchLines()) byWho[line.who] = (byWho[line.who] ?? 0) + 1;
  console.log(`${cues.length} SQUATCHOLA GAY voice cue(s) in the manifest`
    + `${dropped ? ` (replaced ${dropped})` : ''}.`);
  for (const [who, count] of Object.entries(byWho).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(SPEAKERS[who] ?? SPEAKERS.SASOLE).name.padEnd(20)} ${count}`);
  }
  console.log('\nRun `npm run audio:todo` for the recording sheet.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
