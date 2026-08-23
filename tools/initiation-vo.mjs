#!/usr/bin/env node
/**
 * Synchronize every actor-readable Initiation line into the sound manifest.
 * Pure stage directions are intentionally absent; mixed lines contain only
 * the words the actor reads. Idempotent: stale Initiation cues are removed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initiationCabinManifestCues,
  initiationManifestCues,
  initiationManifestDrift,
  initiationVoiceProfileGaps,
} from './initiation-vo-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const PENDING = path.join(ROOT, 'docs/audio/pending-initiation-cues.json');
const checkOnly = process.argv.includes('--check');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const added = initiationManifestCues();
const cabin = initiationCabinManifestCues();
const missingProfiles = initiationVoiceProfileGaps(manifest, added);
if (missingProfiles.length) {
  console.error(`Initiation VO has undefined voice profile(s): ${missingProfiles.join(', ')}`);
  process.exit(1);
}

if (checkOnly) {
  const drift = initiationManifestDrift(manifest, added);
  const pending = JSON.parse(fs.readFileSync(PENDING, 'utf8'));
  const handoffDrift = JSON.stringify(pending) !== JSON.stringify(cabin);
  const problemCount = drift.missing.length
    + drift.stale.length
    + drift.textDrift.length
    + drift.voiceDrift.length
    + drift.duplicateNames.length
    + Number(handoffDrift);
  if (problemCount) {
    console.error('Initiation VO drift:'
      + ` ${drift.missing.length} missing,`
      + ` ${drift.stale.length} stale,`
      + ` ${drift.textDrift.length} text drift,`
      + ` ${drift.voiceDrift.length} voice drift,`
      + ` ${drift.duplicateNames.length} duplicate,`
      + ` ${handoffDrift ? 1 : 0} cabin handoff drift.`);
    process.exit(1);
  }
  console.log(`${added.length} Initiation voice cues match the authored catalog.`);
  process.exit(0);
}

const isInitiationCue = (cue) => cue.name.startsWith('vo.initiation.');
const firstInitiationIndex = manifest.sfx.findIndex(isInitiationCue);
const insertionIndex = firstInitiationIndex < 0
  ? manifest.sfx.length
  : manifest.sfx.slice(0, firstInitiationIndex).filter((cue) => !isInitiationCue(cue)).length;
const kept = manifest.sfx.filter((cue) => !isInitiationCue(cue));
const dropped = manifest.sfx.length - kept.length;

manifest.sfx = [
  ...kept.slice(0, insertionIndex),
  ...added,
  ...kept.slice(insertionIndex),
];
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(PENDING, `${JSON.stringify(cabin, null, 2)}\n`);

const byVoice = {};
for (const cue of added) byVoice[cue.voice] = (byVoice[cue.voice] ?? 0) + 1;
console.log(`${added.length} Initiation voice cue(s) in the manifest`
  + `${dropped ? ` (replaced ${dropped})` : ''}.`);
for (const [voice, count] of Object.entries(byVoice).sort()) {
  console.log(`  ${voice.padEnd(16)} ${count}`);
}
console.log('\nRun `npm run audio:todo` for the recording sheet.');
