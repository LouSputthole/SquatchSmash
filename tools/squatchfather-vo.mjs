#!/usr/bin/env node
/**
 * Synchronize Squatchfather's runtime dialogue with the sound manifest.
 *
 * The scene loads authored words from dialogue.json and preloads the exact cue
 * list exported by audio/core.js. Keeping those two sources independent used
 * to make every rewrite a manual manifest edit. This generator zips the cues
 * the browser actually requests to the spoken rows the browser actually reads,
 * then checks both directions before touching the shared manifest.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SQUATCHFATHER_VO_CUES } from '../src/squatchfather/audio/core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIALOGUE = path.join(ROOT, 'src', 'squatchfather', 'dialogue', 'dialogue.json');
const MANIFEST = path.join(ROOT, 'assets', 'sfx', 'manifest.json');
const PREFIX = 'vo.sf.';
const VOICE_BY_TONE = Object.freeze({
  prospect: 'player',
  sal: 'sal',
  mcclawsky: 'mcclawsky',
  /* The family driver is offscreen here. Reuse the established anonymous
   * driver/doorman performer instead of minting a one-line voice profile. */
  driver: 'doorman',
});

export function collectSquatchfatherVoiceCues(dialogue) {
  const spoken = [];
  for (const [sequence, entries] of Object.entries(dialogue)) {
    if (sequence === 'speakers' || !Array.isArray(entries)) continue;
    for (const entry of entries) if (entry?.speaker && entry?.text) spoken.push(entry);
  }
  if (spoken.length !== SQUATCHFATHER_VO_CUES.length) {
    throw new Error(`Squatchfather dialogue has ${spoken.length} spoken rows but runtime preloads ${SQUATCHFATHER_VO_CUES.length} cues`);
  }
  return spoken.map((line, index) => {
    const tone = dialogue.speakers?.[line.speaker]?.tone;
    const voice = VOICE_BY_TONE[tone];
    if (!voice) throw new Error(`Squatchfather speaker ${line.speaker} has unmapped tone ${tone}`);
    return { name: SQUATCHFATHER_VO_CUES[index], voice, say: line.text };
  });
}

export function syncSquatchfatherVoiceManifest(manifest, dialogue) {
  const expected = new Map(collectSquatchfatherVoiceCues(dialogue).map((cue) => [cue.name, cue]));
  const seen = new Set();
  const sfx = [];
  for (const cue of manifest.sfx || []) {
    if (!cue.name.startsWith(PREFIX)) {
      sfx.push(cue);
      continue;
    }
    const replacement = expected.get(cue.name);
    if (!replacement || seen.has(cue.name)) continue;
    sfx.push(replacement);
    seen.add(cue.name);
  }
  for (const [name, cue] of expected) if (!seen.has(name)) sfx.push(cue);
  return { ...manifest, sfx };
}

export function checkSquatchfatherVoiceManifest(manifest, dialogue) {
  const failures = [];
  const expected = new Map(collectSquatchfatherVoiceCues(dialogue).map((cue) => [cue.name, cue]));
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
  const voices = new Set(Object.keys(manifest.voices || {}));
  if (voices.size) {
    for (const cue of expected.values()) {
      if (!voices.has(cue.voice)) failures.push(`${cue.name} wants missing voice profile ${cue.voice}`);
    }
  }
  return failures;
}

function main() {
  const dialogue = JSON.parse(fs.readFileSync(DIALOGUE, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (process.argv.includes('--check')) {
    const failures = checkSquatchfatherVoiceManifest(manifest, dialogue);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} Squatchfather voice problem(s). Run \`npm run vo:squatchfather\`.`);
      process.exitCode = 1;
    } else {
      console.log(`Squatchfather manifest matches ${collectSquatchfatherVoiceCues(dialogue).length} cue(s).`);
    }
    return;
  }
  const next = syncSquatchfatherVoiceManifest(manifest, dialogue);
  fs.writeFileSync(MANIFEST, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`${collectSquatchfatherVoiceCues(dialogue).length} Squatchfather voice cue(s) synchronized.`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
