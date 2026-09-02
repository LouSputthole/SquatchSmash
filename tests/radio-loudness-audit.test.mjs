import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { buildAuditData } from '../tools/radio-audit.mjs';
import { ALGORITHM, SCHEMA, manifestTracks, validateEvidence } from '../tools/audio-loudness-audit.mjs';

const EVIDENCE_URL = new URL('../docs/audits/radio/loudness-measurements.json', import.meta.url);

test('every long-form music master has one current hash-bound loudness receipt', async () => {
  const tracks = await manifestTracks();
  const evidence = JSON.parse(await fs.readFile(EVIDENCE_URL, 'utf8'));

  assert.equal(evidence.schema, SCHEMA);
  assert.deepEqual(evidence.algorithm, ALGORITHM);
  assert.equal(await validateEvidence(tracks, evidence), tracks.length);
  assert.equal(evidence.measurements.length, 29);
  assert.equal(new Set(evidence.measurements.map(({ file }) => file)).size, tracks.length);

  for (const row of evidence.measurements) {
    assert.match(row.file, /^assets\/music\/.+\.mp3$/);
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    assert.ok(row.bytes > 512);
    assert.ok(row.decodedDurationSeconds > 1);
    assert.ok(row.sampleRate >= 32000);
    assert.ok(row.channels >= 1 && row.channels <= 8);
    assert.ok(Number.isFinite(row.integratedLufs));
    assert.ok(Number.isFinite(row.samplePeakDbfs));
    assert.ok(Number.isFinite(row.truePeakEstimateDbtp));
    assert.ok(row.blocks > 0);
    assert.ok(row.gatedBlocks > 0);
  }
});

test('the generated radio inventory publishes measurements without claiming normalization', async () => {
  const data = await buildAuditData();
  const musicRows = data.rows['Cue Inventory'].filter((row) => /^(music|track):/.test(row['Cue ID']));
  assert.equal(musicRows.length, 29);
  assert.equal(musicRows.filter((row) => String(row['Loudness issue']).startsWith('Measured:')).length, 29);
  assert.equal(data.summary.measuredMasters, 29);
  assert.equal(data.summary.musicMasters, 29);

  const loudnessFinding = data.rows['Problems and Decisions']
    .find((row) => row['Station or cue'] === 'Mix / loudness');
  assert.match(loudnessFinding.Problem, /29\/29/);
  assert.match(loudnessFinding.Status, /MEASURED/);
  assert.doesNotMatch(loudnessFinding.Evidence, /normalized/i);
  assert.match(data.revampMarkdown, /does \*\*not\*\* claim.*normalized/s);
});

test('the audit resolves dynamically composed apartment news and leaves only legacy identities orphaned', async () => {
  const data = await buildAuditData();
  const inventory = data.rows['Cue Inventory'];
  const apartmentNews = inventory.filter((row) => /^vo\.news\.(radio|tv)\./.test(row['Cue ID']));
  const orphans = inventory.filter((row) => String(row['Orphan status']).startsWith('YES'));

  assert.equal(apartmentNews.length, 10);
  for (const row of apartmentNews) {
    assert.equal(row['Orphan status'], 'No');
    assert.equal(row['Scenes using it'], 'apartment');
    assert.ok(Number(row['Number of uses']) > 0);
  }
  assert.deepEqual(orphans.map((row) => row['Cue ID']), [
    'radio.ident.ksqch',
    'radio.ident.uncle',
    'radio.sting.ksqch',
    'radio.sting.uncle',
  ]);
  assert.equal(data.summary.orphans, 4);
});

test('loudness tooling stays development-only and never rewrites production masters', async () => {
  const [source, packageJson] = await Promise.all([
    fs.readFile(new URL('../tools/audio-loudness-audit.mjs', import.meta.url), 'utf8'),
    fs.readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.match(source, /AudioContext/);
  assert.match(source, /4x cubic intersample estimate/);
  assert.doesNotMatch(source, /writeFile\([^,]+track\.file/);
  assert.equal(packageJson.scripts['audit:radio-loudness'], 'node tools/audio-loudness-audit.mjs');
  assert.equal(packageJson.scripts['audit:radio-loudness:check'], 'node tools/audio-loudness-audit.mjs --check');
});
