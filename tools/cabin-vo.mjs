#!/usr/bin/env node
/**
 * Synchronize the complete Cabin dungeon chapter into the SFX manifest.
 * The user is recording these takes separately; this tool makes the authored
 * script the single source for cue name, voice profile and spoken text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CABIN_BEATS,
  CABIN_PHONE_CALLS,
  CABIN_VO_PREFIX,
  cabinScriptCues,
} from '../src/cabin/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'assets', 'sfx', 'manifest.json');
const checkOnly = process.argv.includes('--check');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const beatById = new Map(CABIN_BEATS.map((entry) => [entry.id, entry]));
for (const call of Object.values(CABIN_PHONE_CALLS)) {
  beatById.set(call.id, { title: 'Phone call with ' + call.from });
}

const authored = [];
const authoredByName = new Map();
for (const cue of cabinScriptCues()) {
  const prior = authoredByName.get(cue.name);
  if (prior) {
    if (prior.voice !== cue.voice || prior.say !== cue.say) {
      throw new Error(cue.name + ' is reused with different words or casting');
    }
    continue;
  }
  const row = { name: cue.name, voice: cue.voice, say: cue.say };
  authoredByName.set(cue.name, row);
  authored.push({ ...cue, row });
}

const undefinedVoices = [...new Set(authored
  .map((entry) => entry.voice)
  .filter((voice) => !manifest.voices?.[voice]?.id))];
if (undefinedVoices.length) {
  console.error('Cabin VO has undefined voice profile(s): ' + undefinedVoices.join(', '));
  process.exit(1);
}

const callPrefixes = Object.values(CABIN_PHONE_CALLS).map((call) => 'vo.' + call.vo + '.');
const isCabinCue = ({ name = '' }) => (
  name.startsWith(CABIN_VO_PREFIX)
  || callPrefixes.some((prefix) => name.startsWith(prefix))
);
const current = manifest.sfx.filter(isCabinCue);
const currentByName = new Map(current.map((cue) => [cue.name, cue]));
const missing = authored.filter(({ name }) => !currentByName.has(name));
const stale = current.filter(({ name }) => !authoredByName.has(name));
const drift = authored.filter(({ name, voice, say }) => {
  const found = currentByName.get(name);
  return found && (found.voice !== voice || found.say !== say);
});
const duplicates = current
  .map((cue) => cue.name)
  .filter((name, index, all) => all.indexOf(name) !== index);

if (checkOnly) {
  const problems = missing.length + stale.length + drift.length + duplicates.length;
  if (problems) {
    console.error(
      'Cabin VO drift: ' + missing.length + ' missing, '
      + stale.length + ' stale, ' + drift.length + ' text/voice drift, '
      + duplicates.length + ' duplicate.',
    );
    process.exit(1);
  }
  console.log(authored.length + ' Cabin voice cues match the authored chapter.');
  process.exit(0);
}

const firstIndex = manifest.sfx.findIndex(isCabinCue);
const insertionIndex = firstIndex < 0
  ? manifest.sfx.length
  : manifest.sfx.slice(0, firstIndex).filter((cue) => !isCabinCue(cue)).length;
const kept = manifest.sfx.filter((cue) => !isCabinCue(cue));
const commented = new Set();
const generated = authored.map(({ beat, row }) => {
  if (commented.has(beat)) return row;
  commented.add(beat);
  return {
    _comment: beat + ' — ' + (beatById.get(beat)?.title || beat),
    ...row,
  };
});
manifest.sfx = [
  ...kept.slice(0, insertionIndex),
  ...generated,
  ...kept.slice(insertionIndex),
];
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  generated.length + ' Cabin voice cue(s) synchronized (replaced '
  + current.length + ').',
);
