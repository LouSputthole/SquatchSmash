import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { voiceCues } from '../src/core/stations.js';
import { buildAuditData } from '../tools/radio-audit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EVIDENCE_URL = new URL('../docs/audits/radio/content-transcriptions.json', import.meta.url);
const MANIFEST_URL = new URL('../assets/sfx/manifest.json', import.meta.url);

function textHash(text) {
  const normal = String(text)
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(normal).digest('hex').slice(0, 12);
}

function spokenRadioCues(manifest) {
  const authored = new Map(voiceCues().map((cue) => [cue.name, cue]));
  for (const cue of manifest.sfx) {
    if (typeof cue.say !== 'string' || !cue.say.trim()) continue;
    if (/(^|\.)(radio|news)(\.|$)/i.test(cue.name)) authored.set(cue.name, cue);
  }
  return [...authored.values()].sort((a, b) => a.name.localeCompare(b.name));
}

test('every spoken radio/news take has one current hash-bound Scribe receipt', async () => {
  const [evidence, manifest, toolSource] = await Promise.all([
    fs.readFile(EVIDENCE_URL, 'utf8').then(JSON.parse),
    fs.readFile(MANIFEST_URL, 'utf8').then(JSON.parse),
    fs.readFile(new URL('../tools/verify-radio-content.ps1', import.meta.url), 'utf8'),
  ]);
  const cues = spokenRadioCues(manifest);
  const receipts = new Map(evidence.receipts.map((receipt) => [receipt.cue, receipt]));

  assert.equal(evidence.schema, 'squatchsmash.radio-content-transcriptions.v1');
  assert.equal(evidence.model, 'scribe_v2');
  assert.equal(evidence.languageHint, 'eng');
  assert.equal(evidence.keyStoredInRepository, false);
  assert.equal(cues.length, 298);
  assert.equal(receipts.size, cues.length);
  assert.doesNotMatch(toolSource, /sk_[A-Za-z0-9_-]{12,}/);

  for (const cue of cues) {
    const receipt = receipts.get(cue.name);
    assert.ok(receipt, `missing transcription receipt for ${cue.name}`);
    const file = cue.file || `${cue.name}.mp3`;
    const bytes = await fs.readFile(path.join(ROOT, 'assets', 'sfx', file));
    assert.equal(receipt.file, file, cue.name);
    assert.equal(receipt.voice, cue.voice || 'player', cue.name);
    assert.equal(receipt.intended, cue.say, cue.name);
    assert.equal(receipt.intendedTextHash, textHash(cue.say), cue.name);
    assert.equal(receipt.sha256, createHash('sha256').update(bytes).digest('hex'), cue.name);
    assert.equal(receipt.bytes, bytes.length, cue.name);
    assert.ok(receipt.bytes > 512, cue.name);
    assert.equal(receipt.language, 'eng', cue.name);
    assert.ok(receipt.languageProbability >= 0.9, cue.name);
    assert.ok(receipt.similarity >= 0.86, cue.name);
    assert.equal(receipt.status, 'MATCH', cue.name);
  }
});

test('the generated audit distinguishes verified speech from owner-reviewed music identity', async () => {
  const data = await buildAuditData();
  const inventory = data.rows['Cue Inventory'];
  const verified = inventory.filter((row) => String(row['Filename-content mismatch']).startsWith('VERIFIED —'));
  const music = inventory.filter((row) => /^(music|track):/.test(row['Cue ID']));

  assert.equal(data.summary.verifiedSpokenCues, 298);
  assert.equal(data.summary.spokenCueTotal, 298);
  assert.equal(verified.length, 298);
  assert.equal(music.length, 28);
  assert.ok(music.every((row) => String(row['Filename-content mismatch']).startsWith('OWNER LISTEN —')));

  const finding = data.rows['Problems and Decisions']
    .find((row) => row['Station or cue'] === 'Filename/content and source-only audit limit');
  assert.match(finding.Problem, /298 spoken.*0 spoken/s);
  assert.match(finding.Status, /RESOLVED FOR SPOKEN CUES/);
  assert.match(data.revampMarkdown, /298 \/ 298/);
  assert.match(data.revampMarkdown, /does \*\*not\*\* claim a song's identity/);
});
