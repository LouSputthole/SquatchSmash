#!/usr/bin/env node
/**
 * Synchronize THE TAKE's authored dialogue with the sound manifest.
 *
 *   npm run vo:heist        -> synchronize the exact cue block
 *   npm run check:heist-vo  -> report missing/stale/text/cast drift
 *   npm run audio:todo      -> writes the recording handoff markdown
 *
 * The heist was half-wired. `src/heist/script.js` names 112 spoken lines and
 * the manifest carried 56 of them, so the other half — including eleven of
 * Big Uncle Lou's fourteen lines, and every single thing a hostage says when
 * you point a rifle at them — existed only as subtitles. Nothing was missing
 * from the writing; the cues simply never reached the recording sheet, so
 * nobody knew they were unrecorded.
 *
 * Three things this deliberately does not do:
 *
 * - **It does not touch the scene's sound effects.** `heist.` is the prefix
 *   for both the dialogue and the 46 effects (`heist.bank.alarm`,
 *   `heist.map.paper`), so this cannot filter by prefix the way its siblings
 *   do. It owns exactly the ids the script declares and nothing else.
 * - **It does not guess who anybody is.** VOICES below is explicit, and an
 *   unmapped speaker throws rather than quietly becoming a stranger.
 * - **It does not re-cast the lines already recorded.** The heist casts Lou on
 *   the `lou` profile, not `lou1`. Both exist in the voices table on purpose
 *   and this is not the place to merge them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import { ALL_HEIST_DIALOGUE } from '../src/heist/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

/**
 * Every voice in the bank, taken from what the 56 already-recorded cues use
 * rather than from the character roster's own `voiceProfile`. Those two
 * disagree for Lou and the disagreement is deliberate, so the recordings on
 * disk are the authority here.
 *
 * The bank's own people are cast by the name on the subtitle, because
 * `npcLine` derives its speakerId from the cue id and collapses every hostage
 * line onto one 'hostage' key regardless of who is actually talking.
 */
const VOICES = Object.freeze({
  [CHARACTER_IDS.SNOW]: 'snow',
  [CHARACTER_IDS.RIPPINFLOW]: 'rippinflow',
  [CHARACTER_IDS.SHUBENATOR]: 'shubenator',
  [CHARACTER_IDS.DEATHMEGATRON]: 'deathmegatron',
  [CHARACTER_IDS.NUMBSKULL]: 'numbskull',
  [CHARACTER_IDS.PROSPECT]: 'player',
  [CHARACTER_IDS.LOU]: 'lou',
});

const BANK_VOICES = Object.freeze({
  'Security Guard': 'heist-guard',
  'Bank Manager': 'heist-manager',
  'Bank Customer': 'heist-customer',
  /* One line, and no `heist-teller` profile exists to give her. Sharing the
   * customer voice is the smallest wrong answer available; casting her
   * properly is an owner decision and needs a voice id. */
  Teller: 'heist-customer',
});

function voiceFor(entry) {
  const byCharacter = VOICES[entry.speakerId];
  if (byCharacter) return byCharacter;
  const byRole = BANK_VOICES[entry.subtitleName];
  if (byRole) return byRole;
  throw new Error(
    `heist-vo: no voice for "${entry.subtitleName}" (${entry.id}). `
    + 'Add it to VOICES or BANK_VOICES rather than letting it fall to a stranger.',
  );
}

/** The set of manifest names this tool owns. Effects are not in it. */
export function heistDialogueCueNames() {
  return new Set(Object.values(ALL_HEIST_DIALOGUE).map((entry) => entry.cue));
}

export function collectHeistVoiceCues() {
  return Object.values(ALL_HEIST_DIALOGUE).map((entry) => ({
    name: entry.cue,
    voice: voiceFor(entry),
    say: entry.text,
    // Performance direction is written on the line for the person who has to
    // read it out. Dropping it here would deliver the words without the note
    // telling somebody how they are meant to land.
    ...(entry.direction ? { direction: entry.direction } : {}),
  }));
}

/** Return an updated manifest without mutating or writing the input. */
export function syncHeistVoiceManifest(manifest) {
  const owned = heistDialogueCueNames();
  const kept = (manifest.sfx || []).filter((cue) => !owned.has(cue.name));
  return { ...manifest, sfx: [...kept, ...collectHeistVoiceCues()] };
}

/** Report scene cue drift without changing the manifest. */
export function checkHeistVoiceManifest(manifest) {
  const failures = [];
  const expected = new Map();
  for (const cue of collectHeistVoiceCues()) {
    // Two lines sharing a cue collapse to one recording, and the loser's text
    // is never spoken by anybody.
    if (expected.has(cue.name) && expected.get(cue.name).say !== cue.say) {
      failures.push(`conflicting cue ${cue.name}`);
    }
    expected.set(cue.name, cue);
  }
  const owned = heistDialogueCueNames();
  const declared = new Map();
  for (const cue of (manifest.sfx || []).filter((entry) => owned.has(entry.name))) {
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
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (process.argv.includes('--check')) {
    const failures = checkHeistVoiceManifest(manifest);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} THE TAKE voice problem(s). Run \`npm run vo:heist\`.`);
      process.exitCode = 1;
    } else {
      console.log(`THE TAKE voice manifest matches ${collectHeistVoiceCues().length} cue(s).`);
    }
    return;
  }

  const owned = heistDialogueCueNames();
  const before = (manifest.sfx || []).filter((cue) => owned.has(cue.name)).length;
  const cues = collectHeistVoiceCues();
  fs.writeFileSync(MANIFEST, `${JSON.stringify(syncHeistVoiceManifest(manifest), null, 2)}\n`);

  const byVoice = {};
  for (const cue of cues) byVoice[cue.voice] = (byVoice[cue.voice] ?? 0) + 1;
  console.log(`${cues.length} THE TAKE voice cue(s) in the manifest (${cues.length - before} new).`);
  for (const [voice, count] of Object.entries(byVoice).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${voice.padEnd(16)} ${count}`);
  }
  console.log('\nRun `npm run audio:todo` for the recording sheet.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
