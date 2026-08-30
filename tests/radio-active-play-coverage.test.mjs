import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { buildAuditData } from '../tools/radio-audit.mjs';
import {
  RADIO_ACTIVE_PLAY_COVERAGE,
  radioTimelineOwnerKey,
  summarizeRadioActivePlayCoverage,
  uniqueAuditedRadioOwners,
} from '../tools/radio-active-play-coverage.mjs';

test('every generated radio/music owner has one exact named active-play receipt', async () => {
  const data = await buildAuditData();
  const timeline = data.rows['Scene Timeline'];
  const owners = uniqueAuditedRadioOwners(timeline);
  const coverage = summarizeRadioActivePlayCoverage(timeline);

  assert.equal(owners.size, 26);
  assert.equal(coverage.total, owners.size);
  assert.equal(coverage.covered, owners.size);
  assert.equal(coverage.complete, true);
  assert.deepEqual(coverage.missing, []);
  assert.deepEqual(coverage.stale, []);
  assert.equal(RADIO_ACTIVE_PLAY_COVERAGE.size, owners.size);
  assert.equal(data.summary.lifecycleOwners, owners.size);
  assert.equal(data.summary.lifecycleCovered, owners.size);

  for (const [key, row] of owners) {
    assert.equal(key, radioTimelineOwnerKey(row));
    const evidence = RADIO_ACTIVE_PLAY_COVERAGE.get(key);
    assert.ok(evidence, `missing active-play mapping for ${key}`);
    assert.match(evidence.verifier, /^tools\/verify-[a-z0-9-]+\.mjs$/);
    assert.ok(evidence.receipt.length > 24, `receipt is not descriptive for ${key}`);
    const source = await fs.readFile(new URL(`../${evidence.verifier}`, import.meta.url), 'utf8');
    assert.ok(source.includes(evidence.receipt),
      `${evidence.verifier} no longer publishes receipt: ${evidence.receipt}`);
    assert.match(row['Implementation status'], /^Named active-play receipt · tools\/verify-/);
  }
});

test('the generated revamp separates mechanical ownership coverage from owner listening', async () => {
  const data = await buildAuditData();
  const lifecycle = data.rows['Problems and Decisions']
    .find((row) => row['Station or cue'] === 'Radio + venue/mission scores');
  const mix = data.rows['Problems and Decisions']
    .find((row) => row['Station or cue'] === 'Mix / loudness');
  const orphans = data.rows['Problems and Decisions']
    .find((row) => row['Station or cue'] === 'Cue inventory');

  assert.match(lifecycle.Status, /SOURCE \+ MAPPING CONTRACT GREEN/);
  assert.doesNotMatch(lifecycle.Status, /RERUN DUE|PENDING/,
    'the generated audit still describes the mapped source receipts as unfinished');
  assert.match(lifecycle.Problem, /26\/26/);
  assert.match(mix.Status, /OWNER AUDIBLE MIX REVIEW/);
  assert.match(orphans.Status, /OWNER — LEGACY IDENTITY CUES/);

  const receiptPlan = data.rows['Revamp Plan'].find((row) => row.Order === 4);
  const finalPlan = data.rows['Revamp Plan'].find((row) => row.Order === 9);
  assert.match(receiptPlan.Status, /^DONE — 26\/26 OWNERS MAPPED; SOURCE RECEIPTS GREEN$/);
  assert.match(finalPlan.Status,
    /^RELEASE-CANDIDATE LEDGERS \+ MAPPED RECEIPTS GREEN — FINAL HOSTED RECEIPT EXTERNAL$/);
  assert.doesNotMatch(`${receiptPlan.Status}\n${finalPlan.Status}`,
    /BROWSER RERUN DUE|FULL GATES PENDING/);
});
