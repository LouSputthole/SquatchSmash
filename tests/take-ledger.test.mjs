import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  normaliseSay, recordTake, seedLedger, takeDrift, textHash,
} from '../tools/take-ledger.mjs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));

test('a rewritten line is caught even though its file never changed', () => {
  /* The bug this whole file exists for. The cue id does not carry the text, so
   * the filename is identical before and after the rewrite and every other
   * gate -- cue exists, file exists, nothing orphaned -- stays green. */
  const manifest = { sfx: [{ name: 'vo.x.one', say: 'The nightstand drawer.' }] };
  const onDisk = ['vo.x.one.mp3'];
  const ledger = { takes: seedLedger(manifest, { lines: [] }, onDisk) };
  assert.deepEqual(takeDrift(manifest, ledger, { lines: [] }, onDisk).stale, []);

  const rewritten = { sfx: [{ name: 'vo.x.one', say: 'The closet rail.' }] };
  const drift = takeDrift(rewritten, ledger, { lines: [] }, onDisk);
  assert.equal(drift.stale.length, 1);
  assert.equal(drift.stale[0].cue, 'vo.x.one');
});

test('a line already queued for re-record reports as queued, not as a failure', () => {
  const manifest = { sfx: [{ name: 'vo.x.one', say: 'The closet rail.' }] };
  const queue = { lines: [{ cue: 'vo.x.one', retiredText: 'The nightstand drawer.' }] };
  const onDisk = ['vo.x.one.mp3'];
  const ledger = { takes: seedLedger(manifest, queue, onDisk) };
  const drift = takeDrift(manifest, ledger, queue, onDisk);
  assert.deepEqual(drift.stale, [], 'a queued line must not fail the build twice');
  assert.equal(drift.queued.length, 1);
  assert.equal(ledger.takes['vo.x.one'].text, textHash('The nightstand drawer.'),
    'a queued line seeds from its recorded retiredText, not from the new script');
});

test('reseeding never overwrites an exact rendered stamp with an assumption', () => {
  const manifest = { sfx: [{ name: 'vo.x.one', say: 'The closet rail.' }] };
  const onDisk = ['vo.x.one.mp3'];
  const previous = { 'vo.x.one': { text: textHash('The nightstand drawer.'), source: 'rendered' } };
  const takes = seedLedger(manifest, { lines: [] }, onDisk, previous);
  assert.deepEqual(takes['vo.x.one'], previous['vo.x.one'],
    'a rendered stamp is evidence; reseeding must not quietly bless it as current');
});

test('typography is not a performance change', () => {
  assert.equal(normaliseSay('It’s  the  same — hand'), normaliseSay("It's the same - hand"));
});

test('a take with no file on disk is not a finding, and a dead entry is', () => {
  const manifest = { sfx: [{ name: 'vo.x.one', say: 'Unrecorded.' }] };
  const empty = takeDrift(manifest, { takes: {} }, { lines: [] }, []);
  assert.deepEqual(empty, { stale: [], queued: [], unledgered: [], orphaned: [] });
  const dead = takeDrift(manifest, { takes: { 'vo.gone': { text: 'x', source: 'assumed' } } },
    { lines: [] }, []);
  assert.deepEqual(dead.orphaned, ['vo.gone']);
});

test('fresh renders append exact text and voice provenance to one bounded ledger', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'squatch-takes-'));
  const ledgerFile = path.join(directory, 'takes.json');
  try {
    recordTake(ledgerFile, 'vo.test.one', 'First line.', { name: 'lou', id: 'voice-lou' });
    recordTake(ledgerFile, 'vo.test.two', 'Second line.', { name: 'tony', id: 'voice-tony' });
    const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    assert.deepEqual(ledger.takes['vo.test.one'], {
      text: textHash('First line.'), source: 'rendered', voice: 'lou', voiceId: 'voice-lou',
    });
    assert.deepEqual(ledger.takes['vo.test.two'], {
      text: textHash('Second line.'), source: 'rendered', voice: 'tony', voiceId: 'voice-tony',
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the shipped ledger is in step with the shipped manifest', () => {
  const manifest = read('../assets/sfx/manifest.json');
  const ledger = read('../assets/sfx/takes.json');
  const queue = read('../assets/sfx/rerecord.json');
  const onDisk = fs.readdirSync(new URL('../assets/sfx', import.meta.url))
    .filter((file) => file.endsWith('.mp3'));
  const drift = takeDrift(manifest, ledger, queue, onDisk);
  assert.deepEqual(drift.stale, [], 'a take on disk says words the script has retired');
  assert.deepEqual(drift.orphaned, [], 'the ledger names cues that no longer exist');
});
