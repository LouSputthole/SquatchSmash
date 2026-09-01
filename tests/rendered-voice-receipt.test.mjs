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
   * delivered, stamped, indexed and back in current evidence. */
  assert.equal(current.length, 544);
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
  assert.equal(coverage.outstanding, 1);
  assert.equal(coverage.missing.length, 1);
  assert.equal(coverage.rerecord.length, 0);
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
