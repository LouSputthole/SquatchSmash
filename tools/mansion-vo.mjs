#!/usr/bin/env node
/**
 * Synchronize PROJECT SILENT SQUATCH's authored dialogue with the sound manifest.
 *
 *   npm run vo:mansion         -> synchronize the exact cue block
 *   npm run check:mansion-vo   -> report missing/stale/text/cast drift
 *   npm run audio:todo         -> writes the recording handoff markdown
 *
 * The mission shipped with all 147 spoken lines already named on a
 * `vo.silentsquatch.` prefix, and with `allSilentSquatchLines()` in
 * src/mansion/script.js written specifically to hand them to a tool like this
 * one -- and then the tool was never written. So the entire mission was
 * invisible to VOICE-LINES-TODO.md and to the voice run: the sheet said the
 * campaign was 419 cues short and none of those 147 were among them, because
 * a cue that is not in the manifest is not missing, it does not exist.
 *
 * That is the trap in docs/ENGINE-TRAPS.md — "a scene with no VO generator is
 * invisible" — happening for the second time, on the scene written after the
 * trap was documented. tests/mansion-voice-manifest.test.mjs now holds this
 * one shut.
 *
 * Two things this deliberately does not do:
 *
 * - **It does not invent cue names.** `script.js`'s own `cue()` helper already
 *   produced the fully-qualified name the DialogueController plays, and it is
 *   used here verbatim with no take suffix.
 * - **It does not give the HUD a voice.** `SPEAKERS.HUD` is on-screen prose in
 *   the game's own register and carries no cue, and stage directions
 *   (`lou.rotate`, `case.open`) are instructions to the mission, not lines.
 *   `allSilentSquatchLines()` already excludes both.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allSilentSquatchLines, PENDING_VOICE_PROFILES } from '../src/mansion/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

const PREFIX = 'vo.silentsquatch.';

/**
 * Every recordable line in the mission.
 *
 * The muffled lines -- the scientists behind the reinforced glass -- are
 * recorded DRY and filtered at runtime by `lab.glassAudio`. Baking the muffle
 * into the take would make the same performance unusable the moment the mission
 * plays it anywhere else, and it would give the voice actor a direction
 * ("sound like you are behind glass") that the engine is already carrying out.
 */
export function collectMansionVoiceCues() {
  return allSilentSquatchLines()
    .filter((line) => line.voice)
    .map((line) => ({ name: line.name, voice: line.voice, say: line.say }));
}

/** Return an updated manifest without mutating or writing the input. */
export function syncMansionVoiceManifest(manifest) {
  const kept = (manifest.sfx || []).filter((cue) => !cue.name.startsWith(PREFIX));
  return { ...manifest, sfx: [...kept, ...collectMansionVoiceCues()] };
}

/** Report scene cue drift without changing the manifest. */
export function checkMansionVoiceManifest(manifest) {
  const failures = [];
  const expected = new Map();
  for (const cue of collectMansionVoiceCues()) {
    /* Two lines sharing a name would silently collapse to one recording and
     * the loser's text would never be spoken by anybody. */
    if (expected.has(cue.name) && expected.get(cue.name).say !== cue.say) {
      failures.push(`conflicting cue ${cue.name}`);
    }
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

  /* A cue whose voice profile is not in the manifest's `voices` block cannot
   * be rendered at all -- `npm run sfx` has nothing to send. This is the
   * check that turns "the owner has not supplied an id yet" from a silent
   * no-op into a named blocker on the sheet. */
  const voices = manifest.voices ?? {};
  const uncast = new Set();
  for (const cue of expected.values()) if (!voices[cue.voice]) uncast.add(cue.voice);
  for (const voice of [...uncast].sort()) {
    failures.push(`uncast voice profile "${voice}" -- ${PENDING_VOICE_PROFILES.includes(voice)
      ? 'listed in PENDING_VOICE_PROFILES; the owner supplies the id'
      : 'not even listed as pending'}`);
  }
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (process.argv.includes('--check')) {
    const failures = checkMansionVoiceManifest(manifest);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} PROJECT SILENT SQUATCH voice problem(s). Run \`npm run vo:mansion\`.`);
      process.exitCode = 1;
    } else {
      console.log(`PROJECT SILENT SQUATCH voice manifest matches ${collectMansionVoiceCues().length} cue(s).`);
    }
    return;
  }

  const dropped = (manifest.sfx || []).filter((cue) => cue.name.startsWith(PREFIX)).length;
  const cues = collectMansionVoiceCues();
  fs.writeFileSync(MANIFEST, `${JSON.stringify(syncMansionVoiceManifest(manifest), null, 2)}\n`);

  const byVoice = {};
  for (const cue of cues) byVoice[cue.voice] = (byVoice[cue.voice] ?? 0) + 1;
  console.log(`${cues.length} PROJECT SILENT SQUATCH voice cue(s) in the manifest`
    + `${dropped ? ` (replaced ${dropped})` : ''}.`);
  const voices = manifest.voices ?? {};
  for (const [voice, count] of Object.entries(byVoice).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${voice.padEnd(14)} ${String(count).padStart(3)}${voices[voice] ? '' : '   << NO VOICE ID'}`);
  }
  console.log('\nRun `npm run audio:todo` for the recording sheet.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
