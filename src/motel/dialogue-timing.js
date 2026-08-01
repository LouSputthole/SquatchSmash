/** Extra breathing room between two recorded character turns. */
export const DIALOGUE_GAP_SECONDS = 0.18;

/**
 * Resolve how long the current subtitle owns the voice floor.
 * Recorded takes use their real duration and retain the existing subtitle tail;
 * undelivered lines keep the authored fallback.
 */
export function resolveLineHold(authoredSeconds, recordedSeconds) {
  return recordedSeconds > 0 ? recordedSeconds + 0.5 : authoredSeconds;
}

/** Convert a resolved hold into a safe delay for the next character turn. */
export function nextLineDelayMs(holdSeconds, gapSeconds = DIALOGUE_GAP_SECONDS) {
  const gap = Number.isFinite(gapSeconds) ? gapSeconds : DIALOGUE_GAP_SECONDS;
  return Math.max(0, holdSeconds + gap) * 1000;
}
