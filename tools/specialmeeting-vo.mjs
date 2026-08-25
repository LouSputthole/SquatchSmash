#!/usr/bin/env node
/**
 * Synchronize the Special Meeting's data-authored dialogue into the sound
 * manifest. The scene used to be the only large dialogue graph in `vo:sync`
 * with no synchronizer, so adding a line meant hand-editing a 30k-line JSON
 * file and made manifest drift the default.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BEATS, CALL_CUE_PREFIX, CUE_PREFIX, scriptCues,
} from '../src/specialmeeting/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'assets', 'sfx', 'manifest.json');
const checkOnly = process.argv.includes('--check');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const beatById = new Map(BEATS.map((entry) => [entry.id, entry]));

const uniqueAuthored = [];
const byName = new Map();
for (const cue of scriptCues()) {
  const prior = byName.get(cue.name);
  if (prior) {
    if (prior.voice !== cue.voice || prior.say !== cue.say) {
      throw new Error(`${cue.name} is deliberately reused but no longer says the same words`);
    }
    continue;
  }
  const row = { name: cue.name, voice: cue.voice, say: cue.say };
  byName.set(cue.name, row);
  uniqueAuthored.push({ ...cue, row });
}

const undefinedVoices = [...new Set(uniqueAuthored
  .map(({ voice }) => voice)
  .filter((voice) => !manifest.voices?.[voice]?.id))];
if (undefinedVoices.length) {
  console.error(`Special Meeting VO has undefined voice profile(s): ${undefinedVoices.join(', ')}`);
  process.exit(1);
}

const isSpecialMeetingCue = ({ name = '' }) => (
  name.startsWith(CUE_PREFIX) || name.startsWith(CALL_CUE_PREFIX)
);
const current = manifest.sfx.filter(isSpecialMeetingCue);
const currentByName = new Map(current.map((cue) => [cue.name, cue]));
const missing = uniqueAuthored.filter(({ name }) => !currentByName.has(name));
const stale = current.filter(({ name }) => !byName.has(name));
const drift = uniqueAuthored.filter(({ name, voice, say }) => {
  const found = currentByName.get(name);
  return found && (found.voice !== voice || found.say !== say);
});
const duplicateNames = current
  .map(({ name }) => name)
  .filter((name, index, all) => all.indexOf(name) !== index);

if (checkOnly) {
  const problems = missing.length + stale.length + drift.length + duplicateNames.length;
  if (problems) {
    console.error('Special Meeting VO drift:'
      + ` ${missing.length} missing, ${stale.length} stale,`
      + ` ${drift.length} text/voice drift, ${duplicateNames.length} duplicate.`);
    process.exit(1);
  }
  console.log(`${uniqueAuthored.length} Special Meeting voice cues match the authored graph.`);
  process.exit(0);
}

const firstIndex = manifest.sfx.findIndex(isSpecialMeetingCue);
const insertionIndex = firstIndex < 0
  ? manifest.sfx.length
  : manifest.sfx.slice(0, firstIndex).filter((cue) => !isSpecialMeetingCue(cue)).length;
const kept = manifest.sfx.filter((cue) => !isSpecialMeetingCue(cue));
const commentedBeats = new Set();
const generated = uniqueAuthored.map(({ beat, row }) => {
  if (commentedBeats.has(beat)) return row;
  commentedBeats.add(beat);
  const authoredBeat = beatById.get(beat);
  const note = authoredBeat?.note ? ` ${authoredBeat.note}` : '';
  return {
    _comment: `${beat} — ${authoredBeat?.title ?? beat}.${note}`,
    ...row,
  };
});

manifest.sfx = [
  ...kept.slice(0, insertionIndex),
  ...generated,
  ...kept.slice(insertionIndex),
];
fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${generated.length} Special Meeting voice cue(s) synchronized`
  + ` (replaced ${current.length}).`);
