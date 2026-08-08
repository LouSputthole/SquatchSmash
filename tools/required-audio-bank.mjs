/**
 * Compare a scene's required authored cues with both halves of the audio
 * contract: manifest metadata and the generated on-disk index.
 *
 * Keeping this independent of a browser prevents the verifier's old
 * false-green: filtering the required list through the manifest first made
 * an absent required cue disappear from the expectation as well as the game.
 */
export function inspectRequiredAudioBank({ requiredNames = [], manifest = {}, index = {} } = {}) {
  const required = [...new Set(requiredNames.filter((name) => typeof name === 'string' && name))]
    .sort();
  const byName = new Map((manifest.sfx ?? []).map((cue) => [cue.name, cue]));
  const indexed = new Set(index.files ?? []);
  const missingManifest = [];
  const missingFiles = [];
  const residentNames = [];

  for (const name of required) {
    const cue = byName.get(name);
    if (!cue) {
      missingManifest.push(name);
      continue;
    }
    const file = cue.file || `${name}.mp3`;
    if (!indexed.has(file)) {
      missingFiles.push({ name, file });
      continue;
    }
    residentNames.push(name);
  }

  return {
    ok: missingManifest.length === 0 && missingFiles.length === 0,
    requiredNames: required,
    missingManifest,
    missingFiles,
    residentNames,
  };
}
