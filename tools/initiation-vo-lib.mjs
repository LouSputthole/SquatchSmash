import { allCeremonyVoiceLines } from '../src/initiation/dialogue.js';
import { allNpcVoiceLines } from '../src/initiation/npc.js';
import { uniqueInitiationVoiceLines } from '../src/initiation/voice.js';

/** Exact manifest records for every actor-readable Initiation subtitle. */
export function initiationManifestCues() {
  return uniqueInitiationVoiceLines(allCeremonyVoiceLines(), allNpcVoiceLines())
    .map((line) => ({ name: line.cue, voice: line.voice, say: line.say }));
}

export function initiationVoiceProfileGaps(manifest, expected = initiationManifestCues()) {
  return [...new Set(expected.map((cue) => cue.voice))]
    .filter((voice) => !manifest.voices?.[voice]?.id);
}

export function initiationManifestDrift(manifest, expected = initiationManifestCues()) {
  const current = manifest.sfx.filter((cue) => cue.name.startsWith('vo.initiation.'));
  const actual = new Map(current.map((cue) => [cue.name, cue]));
  const wanted = new Map(expected.map((cue) => [cue.name, cue]));
  const duplicateNames = [...new Set(current
    .map((cue) => cue.name)
    .filter((name, index, all) => all.indexOf(name) !== index))];

  return {
    missing: expected.filter((cue) => !actual.has(cue.name)),
    stale: current.filter((cue) => !wanted.has(cue.name)),
    textDrift: expected.filter((cue) => {
      const got = actual.get(cue.name);
      return got && got.say !== cue.say;
    }),
    voiceDrift: expected.filter((cue) => {
      const got = actual.get(cue.name);
      return got && got.voice !== cue.voice;
    }),
    duplicateNames,
  };
}
