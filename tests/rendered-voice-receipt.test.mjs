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
   * with their takes (he is not on the job; Snow is), so 543. */
  assert.equal(current.length, 543);
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
  /* Fifteen outstanding, each with a ledger entry the booth sheet shows.
   * Missing: vo.wake.5 (retired with the five-PM start) and the twelve THE
   * TAKE lines authored 2026-09-02 -- Snow's four command beats that were
   * Lou's, and eight for DeathMegatron, Numbskull and the Shubenator in the
   * rooms they were quiet in. Re-record: the Squatchfather's Booski line
   * (back to the owner's colostomy-bag pick) and the apartment's heist
   * door refusal, which still names the Bing. */
  assert.equal(coverage.outstanding, 15);
  assert.equal(coverage.missing.length, 13);
  assert.equal(coverage.rerecord.length, 2);
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
