#!/usr/bin/env node
/**
 * Synchronize The Silver Case's authored dialogue with the sound manifest.
 *
 *   npm run vo:silvercase        -> synchronize the exact cue block
 *   npm run check:silvercase-vo  -> report missing/stale/text/cast drift
 *   npm run audio:todo           -> writes the recording handoff markdown
 *
 * The mission shipped with every spoken line already named on a
 * `vo.silvercase.` prefix (see src/silvercase/dialogue/script.js) but with
 * nothing to carry those names into `assets/sfx/manifest.json` — so the whole
 * mission was invisible to the recording sheet and the voice run. This is that
 * missing half.
 *
 * Two things this deliberately does not do:
 *
 * - **It does not invent cue names.** `script.js`'s own `cue()` helper already
 *   produced the fully-qualified name the runtime plays, and
 *   `tools/verify-silvercase.mjs` asserts one of them by hand. The manifest
 *   name is that string verbatim, with no take suffix, because the scene's
 *   DialogueController looks the cue up whole rather than by prefix the way
 *   the Beef Run's `say()` does.
 * - **It does not give the HUD a voice.** The HUD speaker is on-screen prose —
 *   "Four glasses on the table. Three guys in the room." — and carries no cue
 *   in the script precisely because nobody says it out loud.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHOICES, SEQUENCES, SPEAKERS } from '../src/silvercase/dialogue/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

const PREFIX = 'vo.silvercase.';

/**
 * Every recordable line in the mission.
 *
 * `SEQUENCES` is mostly `id -> line[]`, but `louQuestionReaction` is
 * `id -> outcome -> line[]` because Ape answers differently depending on what
 * Tony said. Walking one level of nesting covers both without the script
 * having to flatten itself for the sake of this tool.
 */
export function collectSilverCaseVoiceCues() {
  const cues = [];
  const push = (line) => {
    if (!line?.cue) return; // HUD prose: written to be read, not performed.
    const speaker = SPEAKERS[line.speaker];
    cues.push({ name: line.cue, voice: speaker?.voice ?? 'npc-male', say: line.text });
  };

  for (const sequence of Object.values(SEQUENCES)) {
    if (Array.isArray(sequence)) sequence.forEach(push);
    else for (const branch of Object.values(sequence)) branch.forEach(push);
  }

  /* The player's own dialogue options. `silent` picks carry no cue for the
   * same reason the HUD does not: saying nothing is not a performance. */
  for (const choice of Object.values(CHOICES)) {
    for (const option of choice.options ?? []) {
      if (option.cue) cues.push({ name: option.cue, voice: SPEAKERS.PROSPECT.voice, say: option.text });
    }
  }
  return cues;
}

/** Return an updated manifest without mutating or writing the input. */
export function syncSilverCaseVoiceManifest(manifest) {
  const kept = (manifest.sfx || []).filter((cue) => !cue.name.startsWith(PREFIX));
  return { ...manifest, sfx: [...kept, ...collectSilverCaseVoiceCues()] };
}

/** Report scene cue drift without changing the manifest. */
export function checkSilverCaseVoiceManifest(manifest) {
  const failures = [];
  const expected = new Map();
  for (const cue of collectSilverCaseVoiceCues()) {
    /* Two nodes sharing a name would silently collapse to one recording and
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
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (process.argv.includes('--check')) {
    const failures = checkSilverCaseVoiceManifest(manifest);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} Silver Case voice problem(s). Run \`npm run vo:silvercase\`.`);
      process.exitCode = 1;
    } else {
      console.log(`Silver Case voice manifest matches ${collectSilverCaseVoiceCues().length} cue(s).`);
    }
    return;
  }

  const dropped = (manifest.sfx || []).filter((cue) => cue.name.startsWith(PREFIX)).length;
  const cues = collectSilverCaseVoiceCues();
  fs.writeFileSync(MANIFEST, `${JSON.stringify(syncSilverCaseVoiceManifest(manifest), null, 2)}\n`);

  const byVoice = {};
  for (const cue of cues) byVoice[cue.voice] = (byVoice[cue.voice] ?? 0) + 1;
  console.log(`${cues.length} Silver Case voice cue(s) in the manifest`
    + `${dropped ? ` (replaced ${dropped})` : ''}.`);
  for (const [voice, count] of Object.entries(byVoice).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${voice.padEnd(10)} ${count}`);
  }
  console.log('\nRun `npm run audio:todo` for the recording sheet.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
