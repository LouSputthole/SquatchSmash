/**
 * Build the delivery ledger used by the NO WAKE release verifier.
 *
 * The manifest defines the cues, the index defines what is actually on disk,
 * and the generated recording sheet must list exactly the authored voice files
 * that the index does not yet contain. Keeping that relationship here prevents
 * a verifier from preserving a hand-written "pending" list after files land.
 */
export function buildNoWakeAudioLedger({
  authoredVoice = [],
  soundIndex = {},
  recordingSheet = '',
  selectedCues = [],
} = {}) {
  const indexedFiles = new Set(soundIndex.files || []);
  const authoredVoiceFiles = authoredVoice
    .map((line) => `vo.nowake.${line.cue}.1.mp3`)
    .sort();

  return {
    authoredVoiceFiles,
    missingVoiceFiles: authoredVoiceFiles
      .filter((file) => !indexedFiles.has(file)),
    recordingSheetVoiceFiles: authoredVoiceFiles
      .filter((file) => recordingSheet.includes(`\`${file}\``)),
    pendingSelectedNames: selectedCues
      .filter((cue) => !indexedFiles.has(cue.file || `${cue.name}.mp3`))
      .map((cue) => cue.name)
      .sort(),
  };
}
