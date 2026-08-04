#!/usr/bin/env node
/**
 * Synchronize the closed-party incident and graveyard dialogue into the
 * global sound manifest.
 *
 *   npm run vo:hotdog        -> rewrite the `vo.bing2.` / `vo.graveyard.` block
 *   npm run check:hotdog-vo  -> report missing/stale/drifted/duplicate cues
 *   npm run audio:todo       -> writes the recording handoff markdown
 *
 * Runtime script modules are authoritative. This tool removes the old cue
 * banks before writing the current text, so rewritten lines cannot leave a
 * stale recording assignment behind.
 *
 * It does not invent cue names and it does not give the HUD a voice. The
 * catalog mints every name from the authored line itself, and prose that is
 * the Prospect's own read of a room carries no cue precisely because nobody
 * says it out loud -- see the header of src/bing/hotdog-room-voices.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allHotDogVoiceLines } from '../src/core/hotdog-voice-catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const PREFIXES = Object.freeze(['vo.bing2.', 'vo.graveyard.']);

const owned = (name) => PREFIXES.some((prefix) => name.startsWith(prefix));

/** Every recordable line in the closed party and the graveyard. */
export function collectHotDogVoiceCues() {
  return allHotDogVoiceLines().map((line) => ({
    name: line.cue,
    voice: line.voice,
    say: line.text,
    ...(line.direction ? { direction: line.direction } : {}),
  }));
}

/** Return an updated manifest without mutating or writing the input. */
export function syncHotDogVoiceManifest(manifest) {
  const kept = (manifest.sfx || []).filter((cue) => !owned(cue.name));
  const added = collectHotDogVoiceCues();
  /* Keep authored story VO together, immediately before the NO WAKE block when
   * it exists. This makes a one-line rewrite reviewable instead of moving the
   * entire effects library. */
  const insertAt = kept.findIndex((cue) => cue.name.startsWith('vo.nowake.'));
  return {
    ...manifest,
    sfx: insertAt < 0
      ? [...kept, ...added]
      : [...kept.slice(0, insertAt), ...added, ...kept.slice(insertAt)],
  };
}

/** Report scene cue drift without changing the manifest. */
export function checkHotDogVoiceManifest(manifest) {
  const failures = [];
  const expected = new Map();
  for (const cue of collectHotDogVoiceCues()) {
    /* Two lines sharing a name would collapse into one recording and the
     * loser's words would never be spoken by anybody. */
    if (expected.has(cue.name)) failures.push(`colliding cue ${cue.name}`);
    expected.set(cue.name, cue);
  }
  const declared = new Map();
  for (const cue of (manifest.sfx || []).filter((entry) => owned(entry.name))) {
    if (declared.has(cue.name)) failures.push(`duplicate cue ${cue.name}`);
    else declared.set(cue.name, cue);
  }
  for (const [name, cue] of expected) {
    const actual = declared.get(name);
    if (!actual) failures.push(`missing cue ${name}`);
    else if (actual.voice !== cue.voice
      || actual.say !== cue.say
      || (actual.direction ?? '') !== (cue.direction ?? '')) failures.push(`drifted cue ${name}`);
  }
  for (const name of declared.keys()) if (!expected.has(name)) failures.push(`stale cue ${name}`);
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (process.argv.includes('--check')) {
    const failures = checkHotDogVoiceManifest(manifest);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} HotDog incident/graveyard voice problem(s). `
        + 'Run `npm run vo:hotdog`.');
      process.exitCode = 1;
    } else {
      console.log('HotDog incident/graveyard voice manifest matches '
        + `${collectHotDogVoiceCues().length} cue(s).`);
    }
    return;
  }

  const dropped = (manifest.sfx || []).filter((cue) => owned(cue.name)).length;
  const cues = collectHotDogVoiceCues();
  fs.writeFileSync(MANIFEST, `${JSON.stringify(syncHotDogVoiceManifest(manifest), null, 2)}\n`);

  const byVoice = {};
  for (const cue of cues) byVoice[cue.voice] = (byVoice[cue.voice] ?? 0) + 1;
  console.log(`${cues.length} HotDog incident/graveyard voice cue(s) in the manifest`
    + `${dropped ? ` (replaced ${dropped})` : ''}.`);
  for (const [voice, count] of Object.entries(byVoice).sort()) {
    console.log(`  ${voice.padEnd(14)} ${count}`);
  }
  console.log('\nRun `npm run audio:todo` for the recording sheet.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
