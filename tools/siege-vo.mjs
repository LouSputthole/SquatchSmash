#!/usr/bin/env node
/**
 * Put MANSION UNDER SIEGE's spoken lines in the sound manifest.
 *
 *   npm run vo:siege          -> synchronize the `vo.siege.` cue block
 *   npm run check:siege-vo    -> report missing / stale / drifted cues
 *   npm run audio:todo        -> writes the recording handoff markdown
 *
 * ## WHY THIS FILE HAD TO BE WRITTEN AT THE SAME TIME AS THE DIALOGUE
 *
 * docs/ENGINE-TRAPS.md entry 3, verbatim: *"a scene with no VO generator is
 * invisible, however much is written for it."* It has happened three times in
 * this repo -- 147 lines across The Silver Case and The Enola Squatch, 55 in
 * THE TAKE, then PROJECT SILENT SQUATCH's whole 147 -- and every time the
 * mechanism was the same. `VOICE-LINES-TODO.md` is built from
 * `assets/sfx/manifest.json`; the manifest is built by the `tools/<scene>-vo.mjs`
 * family; a scene without one contributes nothing, so its lines never reach the
 * sheet, so nobody ever learns they are unrecorded. They simply play silent
 * with a subtitle, forever, and the sheet reports the project complete.
 *
 * The siege was on course to be the fourth. It had exactly one spoken cue --
 * `siege.prospect.little_friend` -- which was not on the `vo.` prefix, was in
 * no manifest, and was played by a bare `audio.play()` with no subtitle
 * anywhere. The 22 lines the mission now speaks are declared in
 * `src/mansion/siege/script.js`, this tool is the joint between them and the
 * ledger, and `tests/mansion-siege-voice.test.mjs` fails the build if the two
 * ever disagree.
 *
 * ## WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not invent cue names. `script.js`'s own `say()` helper produces the
 * fully-qualified name the runtime asks for, and it is used here verbatim with
 * no take suffix -- so a cue that reaches the voice booth is a cue the game
 * will actually play, which is the failure mode entry 3's corollary describes.
 *
 * It owns the `vo.siege.` prefix and nothing else. Compare ENGINE-TRAPS entry
 * 4: `heist.` names both THE TAKE's dialogue AND its 46 sound effects, so a
 * prefix rebuild there would delete the scene's whole effects bank. The
 * siege's own effects are on a bare `siege.` prefix -- `siege.alarm.tone`,
 * `siege.glass.shatter` -- and are NOT touched here, precisely so that this
 * tool can rebuild its block by prefix safely.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SIEGE_CUE_PREFIX, SIEGE_SPEAKER_NAMES, allSiegeLines,
} from '../src/mansion/siege/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const PREFIX = SIEGE_CUE_PREFIX;

/** Every recordable line in the mission, in the manifest's own shape. */
export function collectSiegeVoiceCues() {
  return allSiegeLines()
    .filter((line) => line.voice)
    .map((line) => ({
      name: line.name,
      voice: line.voice,
      say: line.say,
      /* Recording direction belongs beside the line it directs. The global
       * recording packet already preserves manifest metadata, so carrying it
       * here gives the new caller and Lou's half of the call an exact acting
       * brief without creating a Siege-only spreadsheet. */
      ...(typeof line.direction === 'string' && line.direction.trim()
        ? { direction: line.direction.trim() }
        : {}),
    }));
}

/** An updated manifest. Does not mutate or write the input. */
export function syncSiegeVoiceManifest(manifest) {
  const kept = (manifest.sfx || []).filter((cue) => !cue.name.startsWith(PREFIX));
  return { ...manifest, sfx: [...kept, ...collectSiegeVoiceCues()] };
}

/**
 * Every way the manifest and the script can disagree, named.
 *
 * Four kinds, and they fail for four different reasons: a MISSING cue is a
 * line nobody will be asked to record; a DRIFTED one is a take of the wrong
 * words or in the wrong voice; a STALE one is a recording session spent on a
 * line the game no longer says; a DUPLICATE is two entries where the loader
 * will pick whichever it saw last.
 */
export function checkSiegeVoiceManifest(manifest) {
  const failures = [];
  const expected = new Map(collectSiegeVoiceCues().map((cue) => [cue.name, cue]));
  const declared = new Map();
  for (const cue of (manifest.sfx || []).filter((entry) => entry.name.startsWith(PREFIX))) {
    if (declared.has(cue.name)) failures.push(`duplicate cue ${cue.name}`);
    else declared.set(cue.name, cue);
  }
  for (const [name, cue] of expected) {
    const actual = declared.get(name);
    if (!actual) failures.push(`missing cue ${name}`);
    else if (actual.voice !== cue.voice
      || actual.say !== cue.say
      || (actual.direction ?? '') !== (cue.direction ?? '')) {
      failures.push(`drifted cue ${name}`);
    }
  }
  for (const name of declared.keys()) if (!expected.has(name)) failures.push(`stale cue ${name}`);
  /* And the one that is not about the manifest at all: a speaker whose voice
   * profile does not exist produces a cue nobody can cast. */
  const voices = Object.keys(manifest.voices ?? {});
  if (voices.length) {
    for (const line of allSiegeLines()) {
      if (line.voice && !voices.includes(line.voice)) {
        failures.push(`${line.name} wants voice profile "${line.voice}", which the manifest does not have`);
      }
    }
  }
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (process.argv.includes('--check')) {
    const failures = checkSiegeVoiceManifest(manifest);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} mansion siege voice problem(s). Run \`npm run vo:siege\`.`);
      process.exitCode = 1;
    } else {
      console.log(`Mansion siege voice manifest matches ${collectSiegeVoiceCues().length} cue(s).`);
    }
    return;
  }

  const dropped = (manifest.sfx || []).filter((cue) => cue.name.startsWith(PREFIX)).length;
  const cues = collectSiegeVoiceCues();
  fs.writeFileSync(MANIFEST, `${JSON.stringify(syncSiegeVoiceManifest(manifest), null, 2)}\n`);

  const byWho = {};
  for (const line of allSiegeLines()) byWho[line.speaker] = (byWho[line.speaker] ?? 0) + 1;
  console.log(`${cues.length} mansion siege voice cue(s) in the manifest`
    + `${dropped ? ` (replaced ${dropped})` : ''}.`);
  for (const [who, count] of Object.entries(byWho).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(SIEGE_SPEAKER_NAMES[who] ?? who).padEnd(22)} ${count}`);
  }
  console.log('\nRun `npm run audio:todo` for the recording sheet.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
