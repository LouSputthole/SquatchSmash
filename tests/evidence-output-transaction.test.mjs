import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { beginEvidenceOutputTransaction } from '../tools/evidence-output-transaction.mjs';

function artifact(file, value) {
  const bytes = Buffer.from(value);
  return Object.freeze({
    file,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'squatch-evidence-transaction-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function labelEntries(root, label) {
  return fs.readdirSync(root).filter((name) => name.startsWith(`${label}-`)).sort();
}

test('an existing evidence label is refused before staging or capture begins', (t) => {
  const root = workspace(t);
  fs.writeFileSync(path.join(root, 'accepted-evidence.json'), '{}\n');
  assert.throws(
    () => beginEvidenceOutputTransaction({ outputDir: root, label: 'accepted' }),
    /evidence label already exists/,
  );
  assert.deepEqual(fs.readdirSync(root), ['accepted-evidence.json']);
});

test('a dead publication owner recovers orphan PNGs and staging before reusing its label', (t) => {
  const root = workspace(t);
  const label = 'crash';
  const staleStage = fs.mkdtempSync(path.join(root, `.${label}-staging-`));
  fs.writeFileSync(path.join(staleStage, `${label}-one.png`), 'staged bytes');
  fs.writeFileSync(path.join(root, `${label}-one.png`), 'linked before abrupt exit');
  fs.writeFileSync(path.join(root, `.${label}-transaction.json`), JSON.stringify({
    schema: 1,
    pid: 2147483647,
    label,
  }));

  const retry = beginEvidenceOutputTransaction({ outputDir: root, label });
  assert.equal(fs.existsSync(path.join(root, `${label}-one.png`)), false,
    'orphan final PNG survived dead-owner recovery');
  assert.equal(fs.existsSync(staleStage), false,
    'orphan staging directory survived dead-owner recovery');
  retry.abort();
  assert.deepEqual(fs.readdirSync(root), []);
});

test('a live publication owner cannot be cleaned or reused by another process', (t) => {
  const root = workspace(t);
  const label = 'active';
  const stage = fs.mkdtempSync(path.join(root, `.${label}-staging-`));
  fs.writeFileSync(path.join(root, `.${label}-transaction.json`), JSON.stringify({
    schema: 1,
    pid: process.pid,
    label,
  }));
  assert.throws(
    () => beginEvidenceOutputTransaction({ outputDir: root, label }),
    /evidence transaction is already active/,
  );
  assert.equal(fs.existsSync(stage), true, 'live owner staging was deleted');
});

test('an injected prelaunch failure removes its unique staging directory', (t) => {
  const root = workspace(t);
  const run = beginEvidenceOutputTransaction({ outputDir: root, label: 'prelaunch' });
  assert.match(path.basename(run.stagingDir), /^\.prelaunch-staging-/);
  try {
    throw new Error('injected launch failure');
  } catch (error) {
    assert.match(error.message, /injected launch failure/);
  } finally {
    run.abort();
  }
  assert.deepEqual(fs.readdirSync(root), []);
});

test('an injected midshot failure leaves neither a partial PNG nor a ledger', (t) => {
  const root = workspace(t);
  const run = beginEvidenceOutputTransaction({ outputDir: root, label: 'midshot' });
  fs.writeFileSync(run.stagePath('midshot-first.png'), Buffer.from('complete staged png'));
  run.abort();
  assert.deepEqual(fs.readdirSync(root), []);
  assert.deepEqual(labelEntries(root, 'midshot'), []);
});

test('an injected postshot publish failure rolls back linked PNGs and permits a clean retry', (t) => {
  const root = workspace(t);
  const run = beginEvidenceOutputTransaction({ outputDir: root, label: 'postshot' });
  const first = Buffer.from('first complete png');
  const second = Buffer.from('second complete png');
  fs.writeFileSync(run.stagePath('postshot-first.png'), first);
  fs.writeFileSync(run.stagePath('postshot-second.png'), second);
  let links = 0;
  assert.throws(() => run.commit({
    artifacts: [artifact('postshot-first.png', first), artifact('postshot-second.png', second)],
    ledgerName: 'postshot-evidence.json',
    ledgerBytes: '{"ok":true}\n',
    link(source, destination) {
      links += 1;
      if (links === 2) throw new Error('injected second-artifact publish failure');
      fs.linkSync(source, destination);
    },
  }), /injected second-artifact publish failure/);
  run.abort();
  assert.deepEqual(fs.readdirSync(root), []);

  const retry = beginEvidenceOutputTransaction({ outputDir: root, label: 'postshot' });
  retry.abort();
});

test('a ledger-link failure rolls back every already-published PNG', (t) => {
  const root = workspace(t);
  const run = beginEvidenceOutputTransaction({ outputDir: root, label: 'ledgerfail' });
  const first = Buffer.from('first complete png');
  const second = Buffer.from('second complete png');
  fs.writeFileSync(run.stagePath('ledgerfail-first.png'), first);
  fs.writeFileSync(run.stagePath('ledgerfail-second.png'), second);
  assert.throws(() => run.commit({
    artifacts: [artifact('ledgerfail-first.png', first), artifact('ledgerfail-second.png', second)],
    ledgerName: 'ledgerfail-evidence.json',
    ledgerBytes: '{"ok":true}\n',
    link(source, destination) {
      if (destination.endsWith('-evidence.json')) throw new Error('injected ledger publish failure');
      fs.linkSync(source, destination);
    },
  }), /injected ledger publish failure/);
  run.abort();
  assert.deepEqual(fs.readdirSync(root), []);
});

test('complete PNGs publish atomically and the evidence ledger is always linked last', (t) => {
  const root = workspace(t);
  const run = beginEvidenceOutputTransaction({ outputDir: root, label: 'complete' });
  const first = Buffer.from('first complete png');
  const second = Buffer.from('second complete png');
  const ledger = Buffer.from('{"ok":true}\n');
  fs.writeFileSync(run.stagePath('complete-first.png'), first);
  fs.writeFileSync(run.stagePath('complete-second.png'), second);
  const order = [];
  const published = run.commit({
    artifacts: [artifact('complete-first.png', first), artifact('complete-second.png', second)],
    ledgerName: 'complete-evidence.json',
    ledgerBytes: ledger,
    link(source, destination) {
      order.push(path.basename(destination));
      fs.linkSync(source, destination);
    },
  });

  assert.deepEqual(order, [
    'complete-first.png',
    'complete-second.png',
    'complete-evidence.json',
  ]);
  assert.equal(run.committed, true);
  assert.equal(fs.existsSync(run.stagingDir), false);
  assert.deepEqual(fs.readFileSync(published.artifacts[0]), first);
  assert.deepEqual(fs.readFileSync(published.artifacts[1]), second);
  assert.deepEqual(fs.readFileSync(published.ledger), ledger);
  assert.equal(run.abort(), false);
});

test('an output-root directory junction is rejected before lock, cleanup, or staging', (t) => {
  const sandbox = workspace(t);
  const target = path.join(sandbox, 'junction-target');
  const outputDir = path.join(sandbox, 'junction-output');
  fs.mkdirSync(target);
  fs.symlinkSync(target, outputDir, process.platform === 'win32' ? 'junction' : 'dir');

  assert.throws(
    () => beginEvidenceOutputTransaction({ outputDir, label: 'junction' }),
    /unsafe.*(?:junction|reparse|symbolic)/i,
  );
  assert.deepEqual(fs.readdirSync(target), [], 'junction target was mutated before rejection');
});

test('a transaction rejects a staging directory replaced by a junction before writing', (t) => {
  const outputDir = workspace(t);
  const run = beginEvidenceOutputTransaction({ outputDir, label: 'staging-swap' });
  const originalStaging = `${run.stagingDir}-original`;
  const target = path.join(outputDir, 'junction-target');
  fs.mkdirSync(target);
  fs.renameSync(run.stagingDir, originalStaging);
  fs.symlinkSync(target, run.stagingDir, process.platform === 'win32' ? 'junction' : 'dir');

  assert.throws(() => run.stagePath('staging-swap-one.png'), /unsafe evidence staging directory/i);
  assert.deepEqual(fs.readdirSync(target), [], 'staging junction target was written before rejection');
  fs.unlinkSync(run.stagingDir);
  fs.renameSync(originalStaging, run.stagingDir);
  run.abort();
});

test('publication rechecks captured PNG bytes before and after each hard link', (t) => {
  const outputDir = workspace(t);
  const captured = Buffer.from('captured PNG A');
  const swapped = Buffer.from('substituted PNG B');

  const before = beginEvidenceOutputTransaction({ outputDir, label: 'before-swap' });
  const beforeName = 'before-swap-one.png';
  fs.writeFileSync(before.stagePath(beforeName), captured);
  fs.writeFileSync(before.stagePath(beforeName), swapped);
  assert.throws(() => before.commit({
    artifacts: [artifact(beforeName, captured)],
    ledgerName: 'before-swap-evidence.json',
    ledgerBytes: '{"ok":true}\n',
  }), /staged evidence artifact differs from its capture binding/i);
  before.abort();

  const after = beginEvidenceOutputTransaction({ outputDir, label: 'after-swap' });
  const afterName = 'after-swap-one.png';
  fs.writeFileSync(after.stagePath(afterName), captured);
  assert.throws(() => after.commit({
    artifacts: [artifact(afterName, captured)],
    ledgerName: 'after-swap-evidence.json',
    ledgerBytes: '{"ok":true}\n',
    link(source, destination) {
      fs.linkSync(source, destination);
      if (destination.endsWith('.png')) fs.writeFileSync(source, swapped);
    },
  }), /published evidence artifact differs from its capture binding/i);
  assert.equal(fs.existsSync(path.join(outputDir, afterName)), false,
    'byte-swapped publication survived rollback');
  after.abort();

  const ledgerWindow = beginEvidenceOutputTransaction({ outputDir, label: 'ledger-window' });
  const ledgerName = 'ledger-window-one.png';
  fs.writeFileSync(ledgerWindow.stagePath(ledgerName), captured);
  assert.throws(() => ledgerWindow.commit({
    artifacts: [artifact(ledgerName, captured)],
    ledgerName: 'ledger-window-evidence.json',
    ledgerBytes: '{"ok":true}\n',
    link(source, destination) {
      fs.linkSync(source, destination);
      if (destination.endsWith('-evidence.json')) {
        fs.writeFileSync(path.join(outputDir, ledgerName), swapped);
      }
    },
  }), /published evidence artifact differs from its capture binding/i);
  assert.equal(fs.existsSync(path.join(outputDir, ledgerName)), false,
    'ledger-link-window PNG mutation survived rollback');
  ledgerWindow.abort();
  assert.deepEqual(fs.readdirSync(outputDir), []);
});

test('the Mansion verifier stages every shot and closes runtime resources before publication', () => {
  const source = fs.readFileSync(new URL('../tools/shots-mansion-siege.mjs', import.meta.url), 'utf8');
  const begin = source.indexOf('beginEvidenceOutputTransaction({ outputDir: OUT, label: PASS })');
  const listen = source.indexOf('await listenEvidenceServer(server, PORT)');
  const stagedShot = source.indexOf('outputTransaction.stagePath(`${PASS}-${id}.png`)');
  const stagedRebound = source.indexOf('outputTransaction.stagePath(shotRecord.file)');
  const close = source.lastIndexOf('await closeEvidenceLifecycle({ browser, server });', source.indexOf('outputTransaction.commit({'));
  const commit = source.indexOf('outputTransaction.commit({');
  const abort = source.indexOf('outputTransaction.abort();');
  assert.ok(begin >= 0 && begin < listen, 'the label is not reserved before server/browser launch');
  assert.ok(stagedShot > begin, 'Playwright still writes a PNG directly to the final evidence directory');
  assert.ok(stagedRebound > stagedShot, 'the final rebound does not read the staged PNG');
  assert.ok(close > stagedRebound && close < commit, 'runtime resources are not closed before publication');
  assert.ok(abort > commit, 'failure cleanup does not cover the publication boundary');
});
