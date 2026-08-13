import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { beginEvidenceDirectoryTransaction } from '../tools/evidence-directory-transaction.mjs';

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'squatch-evidence-directory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function expectBeginRejected(options, pattern) {
  let unexpected;
  try {
    assert.throws(() => {
      unexpected = beginEvidenceDirectoryTransaction(options);
    }, pattern);
  } finally {
    unexpected?.abort();
  }
}

test('a complete nested evidence tree publishes in one directory commit with its exact ledger bytes', (t) => {
  const outputRoot = workspace(t);
  const transaction = beginEvidenceDirectoryTransaction({ outputRoot, label: 'complete' });
  const screenshot = Buffer.from('complete screenshot bytes');
  const ledgerBytes = Buffer.from('{"ok":true}\n');

  fs.writeFileSync(transaction.stagePath('screenshots/one.png'), screenshot);
  fs.writeFileSync(transaction.stagePath('evidence.json'), ledgerBytes);
  const published = transaction.commit({ ledgerRelativePath: 'evidence.json', ledgerBytes });

  assert.equal(transaction.committed, true);
  assert.equal(fs.existsSync(transaction.stagingDirectory), false);
  assert.equal(fs.existsSync(transaction.markerPath), false);
  assert.equal(published.runDirectory, path.join(outputRoot, 'complete'));
  assert.deepEqual(fs.readFileSync(path.join(published.runDirectory, 'screenshots/one.png')), screenshot);
  assert.deepEqual(fs.readFileSync(published.ledgerFile), ledgerBytes);
  assert.deepEqual(published.ledger, {
    relativePath: 'evidence.json',
    bytes: ledgerBytes.length,
    sha256: createHash('sha256').update(ledgerBytes).digest('hex'),
  });
});

test('abort removes only the transaction-owned marker and staging tree', (t) => {
  const outputRoot = workspace(t);
  const sentinel = path.join(outputRoot, 'keep.txt');
  fs.writeFileSync(sentinel, 'unrelated bytes');
  const transaction = beginEvidenceDirectoryTransaction({ outputRoot, label: 'aborted' });
  fs.writeFileSync(transaction.stagePath('owner-masks/one.png'), 'partial artifact');

  assert.equal(transaction.abort(), true);
  assert.equal(transaction.abort(), false);
  assert.equal(fs.existsSync(transaction.stagingDirectory), false);
  assert.equal(fs.existsSync(transaction.markerPath), false);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'unrelated bytes');
  assert.deepEqual(fs.readdirSync(outputRoot), ['keep.txt']);
});

test('a committed final directory is immutable and refuses label reuse', (t) => {
  const outputRoot = workspace(t);
  const finalDirectory = path.join(outputRoot, 'accepted');
  fs.mkdirSync(finalDirectory);
  fs.writeFileSync(path.join(finalDirectory, 'evidence.json'), '{"accepted":true}\n');

  assert.throws(
    () => beginEvidenceDirectoryTransaction({ outputRoot, label: 'accepted' }),
    /already committed/,
  );
  assert.equal(fs.readFileSync(path.join(finalDirectory, 'evidence.json'), 'utf8'),
    '{"accepted":true}\n');
  assert.deepEqual(fs.readdirSync(outputRoot), ['accepted']);
});

test('an active owner marker cannot be stolen or have its staging tree cleaned', (t) => {
  const outputRoot = workspace(t);
  const active = beginEvidenceDirectoryTransaction({ outputRoot, label: 'active' });
  fs.writeFileSync(active.stagePath('screenshots/in-progress.png'), 'in progress');

  assert.throws(
    () => beginEvidenceDirectoryTransaction({ outputRoot, label: 'active' }),
    /already active.*pid/i,
  );
  assert.equal(fs.readFileSync(
    path.join(active.stagingDirectory, 'screenshots/in-progress.png'), 'utf8',
  ), 'in progress');
  assert.equal(fs.existsSync(active.markerPath), true);
  active.abort();
});

test('a retry recovers a real child process that exited before directory commit', (t) => {
  const outputRoot = workspace(t);
  const sentinel = path.join(outputRoot, 'keep.txt');
  fs.writeFileSync(sentinel, 'keep');
  const moduleUrl = new URL('../tools/evidence-directory-transaction.mjs', import.meta.url).href;
  const script = `
    import fs from 'node:fs';
    import { beginEvidenceDirectoryTransaction } from ${JSON.stringify(moduleUrl)};
    const transaction = beginEvidenceDirectoryTransaction({
      outputRoot: ${JSON.stringify(outputRoot)}, label: 'child-precommit',
    });
    fs.writeFileSync(transaction.stagePath('owner-masks/partial.png'), 'partial');
    process.stdout.write(JSON.stringify({
      stagingDirectory: transaction.stagingDirectory,
      markerPath: transaction.markerPath,
    }));
    process.exit(23);
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(child.status, 23, child.stderr);
  const stale = JSON.parse(child.stdout);
  assert.equal(fs.existsSync(stale.stagingDirectory), true);
  assert.equal(fs.existsSync(stale.markerPath), true);

  const retry = beginEvidenceDirectoryTransaction({ outputRoot, label: 'child-precommit' });
  assert.notEqual(retry.stagingDirectory, stale.stagingDirectory);
  assert.equal(fs.existsSync(stale.stagingDirectory), false);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep');
  retry.abort();
  assert.deepEqual(fs.readdirSync(outputRoot), ['keep.txt']);
});

test('commit refuses a missing or byte-drifted final ledger and cleans only owned state', (t) => {
  const outputRoot = workspace(t);
  fs.writeFileSync(path.join(outputRoot, 'keep.txt'), 'keep');
  const missing = beginEvidenceDirectoryTransaction({ outputRoot, label: 'missing-ledger' });
  fs.writeFileSync(missing.stagePath('screenshots/one.png'), 'complete png');
  assert.throws(
    () => missing.commit({ ledgerRelativePath: 'evidence.json', ledgerBytes: '{"ok":true}\n' }),
    /staged evidence ledger/i,
  );
  assert.equal(missing.aborted, true);
  assert.equal(fs.existsSync(missing.stagingDirectory), false);
  assert.equal(fs.existsSync(missing.markerPath), false);

  const drifted = beginEvidenceDirectoryTransaction({ outputRoot, label: 'drifted-ledger' });
  fs.writeFileSync(drifted.stagePath('evidence.json'), '{"ok":false}\n');
  assert.throws(
    () => drifted.commit({ ledgerRelativePath: 'evidence.json', ledgerBytes: '{"ok":true}\n' }),
    /does not match.*ledger bytes/i,
  );
  assert.equal(drifted.aborted, true);
  assert.deepEqual(fs.readdirSync(outputRoot), ['keep.txt']);
});

test('an injected atomic-rename failure leaves no partial final and permits retry', (t) => {
  const outputRoot = workspace(t);
  fs.writeFileSync(path.join(outputRoot, 'keep.txt'), 'keep');
  const transaction = beginEvidenceDirectoryTransaction(
    { outputRoot, label: 'rename-failure' },
    { renameDirectory() { throw new Error('injected atomic rename failure'); } },
  );
  const ledgerBytes = Buffer.from('{"ok":true}\n');
  fs.writeFileSync(transaction.stagePath('screenshots/one.png'), 'complete png');
  fs.writeFileSync(transaction.stagePath('evidence.json'), ledgerBytes);

  assert.throws(
    () => transaction.commit({ ledgerRelativePath: 'evidence.json', ledgerBytes }),
    /injected atomic rename failure/,
  );
  assert.equal(transaction.aborted, true);
  assert.equal(fs.existsSync(path.join(outputRoot, 'rename-failure')), false);
  assert.deepEqual(fs.readdirSync(outputRoot), ['keep.txt']);

  const retry = beginEvidenceDirectoryTransaction({ outputRoot, label: 'rename-failure' });
  retry.abort();
});

test('a real child exit after atomic rename preserves the committed final and recovers only its marker', (t) => {
  const outputRoot = workspace(t);
  const moduleUrl = new URL('../tools/evidence-directory-transaction.mjs', import.meta.url).href;
  const stateFile = path.join(outputRoot, 'child-commit-state.json');
  const script = `
    import fs from 'node:fs';
    import { beginEvidenceDirectoryTransaction } from ${JSON.stringify(moduleUrl)};
    const transaction = beginEvidenceDirectoryTransaction(
      { outputRoot: ${JSON.stringify(outputRoot)}, label: 'child-committed' },
      { afterRename() {
        fs.writeFileSync(${JSON.stringify(stateFile)}, JSON.stringify({
          markerPath: transaction.markerPath,
          stagingDirectory: transaction.stagingDirectory,
          finalDirectory: transaction.finalDirectory,
        }));
        process.exit(0);
      } },
    );
    const ledgerBytes = Buffer.from('{"ok":true}\\n');
    fs.writeFileSync(transaction.stagePath('screenshots/one.png'), 'committed png');
    fs.writeFileSync(transaction.stagePath('evidence.json'), ledgerBytes);
    transaction.commit({ ledgerRelativePath: 'evidence.json', ledgerBytes });
    process.exit(91);
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(child.status, 0, child.stderr);
  const stale = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(fs.existsSync(stale.stagingDirectory), false);
  assert.equal(fs.existsSync(stale.markerPath), true);
  assert.equal(fs.readFileSync(path.join(stale.finalDirectory, 'screenshots/one.png'), 'utf8'),
    'committed png');
  assert.equal(fs.readFileSync(path.join(stale.finalDirectory, 'evidence.json'), 'utf8'),
    '{"ok":true}\n');

  assert.throws(
    () => beginEvidenceDirectoryTransaction({ outputRoot, label: 'child-committed' }),
    /already committed/,
  );
  assert.equal(fs.existsSync(stale.markerPath), false, 'dead post-rename marker was not recovered');
  assert.equal(fs.readFileSync(path.join(stale.finalDirectory, 'screenshots/one.png'), 'utf8'),
    'committed png');
});

test('an output-root path containing traversal is rejected before reservation', (t) => {
  const sandbox = workspace(t);
  const traversalRoot = `${sandbox}${path.sep}nested${path.sep}..${path.sep}evidence`;
  expectBeginRejected({ outputRoot: traversalRoot, label: 'traversal' }, /unsafe.*output root.*traversal/i);
  assert.deepEqual(fs.readdirSync(sandbox), []);
});

test('an output-root directory junction is rejected before reservation', (t) => {
  const sandbox = workspace(t);
  const target = path.join(sandbox, 'junction-target');
  const outputRoot = path.join(sandbox, 'junction-output');
  fs.mkdirSync(target);
  fs.symlinkSync(target, outputRoot, process.platform === 'win32' ? 'junction' : 'dir');

  expectBeginRejected({ outputRoot, label: 'junction' }, /unsafe.*(?:junction|reparse|symbolic)/i);
  assert.deepEqual(fs.readdirSync(target), [], 'junction target was mutated before rejection');
});

test('a transaction rejects a staging directory replaced by a junction before writing', (t) => {
  const outputRoot = workspace(t);
  const transaction = beginEvidenceDirectoryTransaction({ outputRoot, label: 'staging-swap' });
  const target = path.join(outputRoot, 'junction-target');
  fs.mkdirSync(target);
  fs.rmSync(transaction.stagingDirectory, { recursive: true, force: true });
  fs.symlinkSync(target, transaction.stagingDirectory, process.platform === 'win32' ? 'junction' : 'dir');

  assert.throws(() => transaction.stagePath('evidence.json'), /unsafe evidence staging directory/i);
  assert.deepEqual(fs.readdirSync(target), []);
  fs.unlinkSync(transaction.stagingDirectory);
  fs.mkdirSync(transaction.stagingDirectory);
  transaction.abort();
});
