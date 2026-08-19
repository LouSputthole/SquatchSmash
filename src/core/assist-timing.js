/**
 * One accessibility policy for authored reaction windows.
 *
 * Scene Implementations still own the beat, its base duration, and its
 * consequence. This Module only answers the cross-game question: when Assist
 * is enabled, how much more time does the player receive? Keeping that answer
 * here prevents three lethal/timed beats from quietly drifting into three
 * unrelated accessibility settings.
 */
import { get } from './settings.js';

/** A 40% wider window unless a beat supplies an authored assisted value. */
export const ASSIST_TIMING_SCALE = 1.4;

export function assistEnabled(explicit) {
  return typeof explicit === 'boolean' ? explicit : get('assist');
}

/**
 * Return the active timing window without mutating the authored base value.
 * `assisted` is for beats such as Silver's sway whose tuned accessible value
 * predates this shared policy and must remain exact.
 */
export function assistTimingWindow(base, {
  assist,
  assisted,
  scale = ASSIST_TIMING_SCALE,
} = {}) {
  const normal = Number(base);
  if (!Number.isFinite(normal) || normal <= 0) {
    throw new TypeError('assistTimingWindow requires a positive base duration');
  }
  if (!assistEnabled(assist)) return normal;
  const authored = Number(assisted);
  if (Number.isFinite(authored) && authored > 0) return Math.max(normal, authored);
  const multiplier = Number.isFinite(Number(scale)) && Number(scale) >= 1
    ? Number(scale) : ASSIST_TIMING_SCALE;
  return Math.round(normal * multiplier * 1000) / 1000;
}
