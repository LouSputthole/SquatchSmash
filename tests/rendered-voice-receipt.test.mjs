import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import {
  RENDERED_VOICE_AUDIT_SAMPLE_RATE,
  currentRenderedTakes,
  currentVoiceCoverage,
  validateEvidence,
} from '../tools/verify-rendered-voices.mjs';

const RECEIPTS = new URL('../docs/audits/voice/rendered-voice-receipts.json', import.meta.url);
const SCRIBE = new URL('../docs/audits/voice/scribe-spot-checks.json', import.meta.url);

test('every exact rendered take has a current text, performer, index, hash, and browser-decode receipt', async () => {
  const [current, evidence] = await Promise.all([
    currentRenderedTakes(),
    fs.readFile(RECEIPTS, 'utf8').then(JSON.parse),
  ]);
  const coverage = await currentVoiceCoverage(current.length);
  assert.equal(await validateEvidence(current, evidence, coverage), current.length);
  /* The five rewritten Margo cabin-call lines and the missing pickup are now
   * delivered, stamped, indexed and back in current evidence. vo.wake.5's
   * take named six o'clock and Day One wakes at five PM now, so that file
   * was deleted rather than left to play an hour-wrong bark
   * (assets/sfx/rerecord.json `retired`); the campaign-complete door refusal
   * landed with the motel audio-bed branch on 2026-09-02, and the same day
   * THE TAKE retired Lou's four radio lines and the repeated go-home order
   * with their takes (he is not on the job; Snow is), so 543. Then the
   * fifteen the next paragraph used to be waiting on were recorded, so 558
   * -- and the same day's playtest put the Scarface line back at the top of
   * the siege stairs ("what happened to the say hello to my little friend
   * line"), so vo.siege.prospect.little_friend's take -- rendered from the
   * retired punch-up wording -- left current evidence for the rerecord
   * queue: 557. Rendered on 2026-09-09 with the eight Booski silver-case
   * call lines, so 566 -- and the same playtest then reversed eight more
   * reconcile-era rewrites (the SAUCE grave, the initiation-tease flying
   * mail, the three zyn/dart/raw-milk toilet hints), whose takes on disk
   * speak the retired wording: 558. */
  assert.equal(current.length, 558);
  assert.equal(RENDERED_VOICE_AUDIT_SAMPLE_RATE, 44_100,
    'browser decode receipts must not drift with the host audio device');
  assert.ok(evidence.receipts.every((row) => row.sampleRate === RENDERED_VOICE_AUDIT_SAMPLE_RATE));
  assert.ok(evidence.receipts.every((row) => row.durationSeconds > 0.1));
  assert.deepEqual(evidence.coverage, coverage);
  assert.equal(coverage.authoredPlayable,
    coverage.currentDelivered + coverage.outstanding,
    'missing/rerecord/recast work must remain inside the displayed denominator');
  assert.equal(coverage.currentDelivered,
    coverage.renderedExact + coverage.assumedCurrent,
    'legacy assumed takes must remain visible beside exact render receipts');
  /* Eight outstanding, all re-records, nothing missing. The nine that stood
   * here before (eight Booski silver-case calls plus the little-friend
   * payoff) were rendered the same morning they were queued. What remains
   * is the owner's 2026-09-09 reversal of eight reconcile-era rewrites --
   * "Revert the grave back to Sauces" (four graveyard lines), the
   * initiation-tease flying mail, and the dart/zyn/raw-milk toilet hints --
   * each queued in assets/sfx/rerecord.json with its retired wording,
   * playing the old audio under the corrected caption until the next voice
   * run, the same discipline as the bag line before them. */
  assert.equal(coverage.outstanding, 8);
  assert.equal(coverage.missing.length, 0);
  assert.equal(coverage.rerecord.length, 8);
  assert.equal(coverage.recast.length, 0);
});

test('the independent Scribe sample covers the new cast and records proper-name normalizations honestly', async () => {
  const evidence = JSON.parse(await fs.readFile(SCRIBE, 'utf8'));
  assert.equal(evidence.model, 'scribe_v2');
  assert.equal(evidence.keyStoredInRepository, false);
  assert.equal(evidence.samples.length, 15);
  assert.ok(new Set(evidence.samples.map((row) => row.voice)).size >= 10);
  assert.ok(evidence.samples.every((row) => row.languageProbability === 1));
  assert.ok(evidence.samples.every((row) => String(row.result).startsWith('MATCH')));
  assert.ok(evidence.samples.some((row) => /proper-name/.test(row.result)));
  assert.ok(evidence.samples.some((row) => /custom name/.test(row.result)));
});
