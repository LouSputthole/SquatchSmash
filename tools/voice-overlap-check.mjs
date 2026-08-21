/**
 * Ask a running scene whether anybody talked over anybody.
 *
 * The analysis is `voiceOverlaps()` in src/core/dialogue.js and is pure. This
 * is the plumbing: pull the engine's own playback log out of the page and run
 * it. Deliberately NOT a second way of building a scene -- it rides whatever
 * the verifier has already driven, the same way the staging gate rides the
 * geometry adapters, so it costs one page evaluation and cannot disagree with
 * what the player would have heard.
 *
 * @param {import('playwright').Page} page
 * @param {string} audioPath a JS expression for the engine, e.g.
 *        `window.__bing.audio` or `window.INITIATION.audio`
 */
import { voiceOverlaps } from '../src/core/dialogue.js';

export async function voiceOverlapFindings(page, audioPath) {
  const playbacks = await page.evaluate((path) => {
    /* eslint-disable no-new-func */
    const engine = new Function(`return (${path}) ?? null;`)();
    if (!engine?.playbacks) return null;
    return engine.playbacks.map((entry) => ({
      name: entry.name,
      voice: entry.voice === true,
      scheduledAt: entry.scheduledAt,
      endedAt: entry.endedAt,
      seconds: entry.seconds,
      speakerId: entry.speakerId ?? null,
      interrupt: entry.interrupt === true,
    }));
  }, audioPath);

  /* A null log is not "no overlaps". It means the expression did not resolve
   * to an engine, and reporting that as a pass is exactly how a gate goes
   * quiet -- see the theatre recliners in docs/ENGINE-TRAPS.md 10. */
  if (playbacks === null) {
    return { reachable: false, voices: 0, findings: [] };
  }
  const voices = playbacks.filter((entry) => entry.voice);
  return {
    reachable: true,
    voices: voices.length,
    /* The raw window of each line, for when a finding needs explaining rather
     * than believing. Two theories about a 0.19 s overlap cost two eight-minute
     * runs; the numbers were always right here. */
    windows: voices.map((entry) => ({
      cue: entry.name.split('.').slice(-2)[0],
      at: Math.round(entry.scheduledAt * 1000) / 1000,
      secs: Math.round(entry.seconds * 1000) / 1000,
      ended: entry.endedAt === null ? null : Math.round(entry.endedAt * 1000) / 1000,
    })),
    findings: voiceOverlaps(playbacks),
  };
}
