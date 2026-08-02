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

/**
 * A tiny reservation system for the Motel's single dialogue floor. Calls to
 * `say()` can come from timers, interactions, ambient barks and scripted
 * replies in the same frame; reserving first makes them a queue instead of a
 * collection of interruptions.
 */
export class DialogueFloor {
  constructor({ nowSeconds = () => performance.now() / 1000, gapSeconds = DIALOGUE_GAP_SECONDS } = {}) {
    this.nowSeconds = nowSeconds;
    this.gapSeconds = gapSeconds;
    this.availableAt = 0;
  }

  reserve(holdSeconds) {
    const now = this.nowSeconds();
    const hold = Math.max(0, Number(holdSeconds) || 0);
    const start = Math.max(now, this.availableAt);
    const delay = Math.max(0, start - now);
    this.availableAt = start + hold + this.gapSeconds;
    const clean = (value) => Math.round(value * 1000) / 1000;
    return {
      delaySeconds: clean(delay),
      holdSeconds: clean(hold),
      totalSeconds: clean(delay + hold),
    };
  }

  busy() {
    return this.nowSeconds() < this.availableAt;
  }

  reset() {
    this.availableAt = 0;
  }
}
