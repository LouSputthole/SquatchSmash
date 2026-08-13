import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { resolveEvidenceOutputRoot } from './evidence-directory-transaction.mjs';

const LABEL = /^[a-z0-9][a-z0-9_-]*$/i;

function assertLabel(label) {
  if (!LABEL.test(label ?? '')) throw new Error(`unsafe evidence label: ${label ?? ''}`);
}

function assertDirectArtifactName(label, fileName) {
  if (path.basename(fileName) !== fileName
      || !fileName.startsWith(`${label}-`)
      || !/\.(?:png|json)$/i.test(fileName)) {
    throw new Error(`unsafe evidence artifact name: ${fileName}`);
  }
  return fileName;
}

function existingArtifacts(outputDir, label) {
  if (!fs.existsSync(outputDir)) return [];
  const matches = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.name === `${label}-evidence.json`
      || (entry.name.startsWith(`${label}-`) && entry.name.endsWith('.png')));
  for (const entry of matches) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`unsafe evidence output artifact: ${path.join(outputDir, entry.name)}`);
    }
  }
  return matches.map((entry) => entry.name).sort();
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    /* EPERM means the process exists but this account may not signal it. */
    return error?.code === 'EPERM';
  }
}

function stagingDirectories(outputDir, label) {
  const prefix = `.${label}-staging-`;
  const matches = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.name.startsWith(prefix));
  for (const entry of matches) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(`unsafe evidence staging residue: ${path.join(outputDir, entry.name)}`);
    }
  }
  return matches.map((entry) => path.join(outputDir, entry.name));
}

function removeUncommittedResidue(
  outputDir, label, assertOutputRootIdentity, { keepArtifacts = false } = {},
) {
  assertOutputRootIdentity();
  for (const stagingDir of stagingDirectories(outputDir, label)) {
    if (path.dirname(path.resolve(stagingDir)) !== outputDir) {
      throw new Error(`evidence staging directory escaped output root: ${stagingDir}`);
    }
    const stat = fs.lstatSync(stagingDir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`unsafe evidence staging residue: ${stagingDir}`);
    }
    assertOutputRootIdentity();
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  if (keepArtifacts) return;
  for (const name of existingArtifacts(outputDir, label)) {
    if (name === `${label}-evidence.json`) continue;
    assertOutputRootIdentity();
    fs.unlinkSync(path.join(outputDir, name));
  }
}

function claimTransactionLock(outputDir, label, assertOutputRootIdentity) {
  const lockPath = path.join(outputDir, `.${label}-transaction.json`);
  const token = randomUUID();
  const payload = JSON.stringify({ schema: 1, pid: process.pid, label, token });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assertOutputRootIdentity();
    try {
      fs.writeFileSync(lockPath, payload, { flag: 'wx' });
      return { lockPath, token };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const lockStat = fs.lstatSync(lockPath);
      if (lockStat.isSymbolicLink() || !lockStat.isFile()) {
        throw new Error(`unsafe evidence transaction lock: ${lockPath}`);
      }
      let owner = null;
      try { owner = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { /* invalid means stale */ }
      if (processIsAlive(owner?.pid)) {
        throw new Error(`evidence transaction is already active: ${label} (pid ${owner.pid})`);
      }
      const committed = fs.existsSync(path.join(outputDir, `${label}-evidence.json`));
      removeUncommittedResidue(outputDir, label, assertOutputRootIdentity, { keepArtifacts: committed });
      assertOutputRootIdentity();
      try { fs.unlinkSync(lockPath); } catch (unlinkError) {
        if (unlinkError?.code !== 'ENOENT') throw unlinkError;
      }
      if (committed) throw new Error(`evidence label already exists: ${label} (${label}-evidence.json)`);
    }
  }
  throw new Error(`could not claim evidence transaction: ${label}`);
}

function releaseTransactionLock(lockPath, token, assertOutputRootIdentity) {
  assertOutputRootIdentity();
  let owner = null;
  try {
    const stat = fs.lstatSync(lockPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`unsafe evidence transaction lock: ${lockPath}`);
    }
    owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (owner?.token !== token || owner?.pid !== process.pid) {
    throw new Error(`evidence transaction lock ownership changed: ${lockPath}`);
  }
  assertOutputRootIdentity();
  fs.unlinkSync(lockPath);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertRegularIdentity(filePath, expected, role) {
  const stat = fs.lstatSync(filePath, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size <= 0n) {
    throw new Error(`${role} is not a nonempty regular file: ${filePath}`);
  }
  const bytes = fs.readFileSync(filePath);
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
    throw new Error(`${role} differs from its capture binding: ${expected.file}`);
  }
  return Object.freeze({ stat, bytes });
}

function normalizedArtifactIdentity(label, identity) {
  const file = assertDirectArtifactName(label, identity?.file);
  const bytes = Number(identity?.bytes);
  const digest = String(identity?.sha256 ?? '').toLowerCase();
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`invalid captured evidence artifact identity: ${file}`);
  }
  return Object.freeze({ file, bytes, sha256: digest });
}

function flushFile(filePath) {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    try {
      fs.fsyncSync(descriptor);
    } catch (error) {
      /* Some managed Windows volumes deny fsync on a read-only descriptor
       * even though the completed file is already closed. Atomic same-volume
       * publication still holds; only unsupported/permission-shaped fsync
       * errors are tolerated, never an ordinary I/O failure. */
      if (!['EPERM', 'EINVAL', 'ENOTSUP'].includes(error?.code)) throw error;
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * Own one evidence label from first byte through publication.
 *
 * PNGs remain in a unique same-volume staging directory until every runtime
 * and semantic gate has passed. Complete staged files are published through
 * atomic hard links, then the ledger is linked last. A failed publish removes
 * only links created by this transaction; a failed run removes its staging
 * directory and can safely reuse the label.
 */
export function beginEvidenceOutputTransaction({ outputDir, label }) {
  assertLabel(label);
  const resolvedOutput = resolveEvidenceOutputRoot(outputDir);
  fs.mkdirSync(resolvedOutput, { recursive: true });
  resolveEvidenceOutputRoot(resolvedOutput);
  const initialRootStat = fs.lstatSync(resolvedOutput, { bigint: true });
  if (initialRootStat.isSymbolicLink() || !initialRootStat.isDirectory()) {
    throw new Error(`unsafe evidence output root directory: ${resolvedOutput}`);
  }
  const assertOutputRootIdentity = () => {
    resolveEvidenceOutputRoot(resolvedOutput);
    const current = fs.lstatSync(resolvedOutput, { bigint: true });
    if (current.isSymbolicLink() || !current.isDirectory()
        || current.dev !== initialRootStat.dev || current.ino !== initialRootStat.ino) {
      throw new Error(`evidence output root identity changed: ${resolvedOutput}`);
    }
  };
  const { lockPath, token } = claimTransactionLock(resolvedOutput, label, assertOutputRootIdentity);
  let stagingDir;
  try {
    assertOutputRootIdentity();
    const ledgerName = `${label}-evidence.json`;
    if (fs.existsSync(path.join(resolvedOutput, ledgerName))) {
      throw new Error(`evidence label already exists: ${label} (${ledgerName})`);
    }
    /* A missing ledger means any same-label PNGs/staging are provably
     * uncommitted, including hard links left by an abruptly killed publisher. */
    removeUncommittedResidue(resolvedOutput, label, assertOutputRootIdentity);
    assertOutputRootIdentity();
    stagingDir = fs.mkdtempSync(path.join(resolvedOutput, `.${label}-staging-`));
  } catch (error) {
    releaseTransactionLock(lockPath, token, assertOutputRootIdentity);
    throw error;
  }
  const stagingParent = path.dirname(path.resolve(stagingDir));
  if (stagingParent !== resolvedOutput) {
    releaseTransactionLock(lockPath, token, assertOutputRootIdentity);
    throw new Error(`evidence staging directory escaped output root: ${stagingDir}`);
  }
  const initialStagingStat = fs.lstatSync(stagingDir, { bigint: true });
  if (initialStagingStat.isSymbolicLink() || !initialStagingStat.isDirectory()) {
    releaseTransactionLock(lockPath, token, assertOutputRootIdentity);
    throw new Error(`unsafe evidence staging directory: ${stagingDir}`);
  }
  const assertStagingIdentity = () => {
    assertOutputRootIdentity();
    const current = fs.lstatSync(stagingDir, { bigint: true });
    if (current.isSymbolicLink() || !current.isDirectory()
        || current.dev !== initialStagingStat.dev || current.ino !== initialStagingStat.ino) {
      throw new Error(`unsafe evidence staging directory identity changed: ${stagingDir}`);
    }
  };

  let committed = false;
  let aborted = false;

  const stagePath = (fileName) => {
    assertStagingIdentity();
    return path.join(stagingDir, assertDirectArtifactName(label, fileName));
  };

  const abort = () => {
    if (committed || aborted) return false;
    assertStagingIdentity();
    fs.rmSync(stagingDir, { recursive: true, force: true });
    releaseTransactionLock(lockPath, token, assertOutputRootIdentity);
    aborted = true;
    return true;
  };

  const commit = ({ artifacts, ledgerName, ledgerBytes, link = fs.linkSync }) => {
    if (committed || aborted) throw new Error('evidence transaction is no longer active');
    assertStagingIdentity();
    const identities = artifacts.map((identity) => normalizedArtifactIdentity(label, identity));
    const names = [...new Set(identities.map(({ file }) => file))];
    if (!names.length || names.length !== identities.length) {
      throw new Error('evidence transaction requires a nonempty, duplicate-free artifact set');
    }
    if (names.some((name) => !name.endsWith('.png'))) {
      throw new Error('every staged evidence artifact must be a PNG');
    }
    assertDirectArtifactName(label, ledgerName);
    if (ledgerName !== `${label}-evidence.json`) {
      throw new Error(`evidence ledger must be named ${label}-evidence.json`);
    }
    if (names.includes(ledgerName)) throw new Error('evidence ledger cannot also be a PNG artifact');

    assertOutputRootIdentity();
    const occupiedNow = existingArtifacts(resolvedOutput, label);
    if (occupiedNow.length) {
      throw new Error(`evidence label became occupied during capture: ${occupiedNow.join(', ')}`);
    }

    const stagedProofs = new Map();
    for (const identity of identities) {
      const staged = stagePath(identity.file);
      const proof = assertRegularIdentity(staged, identity, 'staged evidence artifact');
      stagedProofs.set(identity.file, proof);
      flushFile(staged);
    }
    const ledgerBuffer = Buffer.from(ledgerBytes);
    if (!ledgerBuffer.length) throw new Error('evidence ledger cannot be empty');
    const stagedLedger = stagePath(ledgerName);
    fs.writeFileSync(stagedLedger, ledgerBuffer);
    flushFile(stagedLedger);
    const ledgerIdentity = Object.freeze({
      file: ledgerName,
      bytes: ledgerBuffer.length,
      sha256: sha256(ledgerBuffer),
    });
    const stagedLedgerProof = assertRegularIdentity(
      stagedLedger, ledgerIdentity, 'staged evidence ledger',
    );

    const published = [];
    try {
      for (const identity of identities) {
        assertStagingIdentity();
        const source = stagePath(identity.file);
        const destination = path.join(resolvedOutput, identity.file);
        link(source, destination);
        published.push(destination);
        assertStagingIdentity();
        const publishedProof = assertRegularIdentity(
          destination, identity, 'published evidence artifact',
        );
        const sourceProof = stagedProofs.get(identity.file);
        if (publishedProof.stat.dev !== sourceProof.stat.dev
            || publishedProof.stat.ino !== sourceProof.stat.ino) {
          throw new Error(`published evidence artifact is not the staged hard link: ${identity.file}`);
        }
      }
      assertStagingIdentity();
      const ledgerDestination = path.join(resolvedOutput, ledgerName);
      link(stagedLedger, ledgerDestination);
      published.push(ledgerDestination);
      assertStagingIdentity();
      const publishedLedgerProof = assertRegularIdentity(
        ledgerDestination, ledgerIdentity, 'published evidence ledger',
      );
      if (publishedLedgerProof.stat.dev !== stagedLedgerProof.stat.dev
          || publishedLedgerProof.stat.ino !== stagedLedgerProof.stat.ino) {
        throw new Error(`published evidence ledger is not the staged hard link: ${ledgerName}`);
      }
      /* The ledger link is deliberately last, but its syscall/injected hook is
       * still a mutation window for PNGs linked earlier. Rebind every final
       * PNG after the ledger exists and immediately before staging removal. */
      for (const identity of identities) {
        const destination = path.join(resolvedOutput, identity.file);
        const finalProof = assertRegularIdentity(
          destination, identity, 'published evidence artifact',
        );
        const sourceProof = stagedProofs.get(identity.file);
        if (finalProof.stat.dev !== sourceProof.stat.dev
            || finalProof.stat.ino !== sourceProof.stat.ino) {
          throw new Error(`published evidence artifact is not the staged hard link: ${identity.file}`);
        }
      }
      assertStagingIdentity();
      fs.rmSync(stagingDir, { recursive: true, force: true });
      committed = true;
      releaseTransactionLock(lockPath, token, assertOutputRootIdentity);
      return Object.freeze({
        artifacts: Object.freeze(names.map((name) => path.join(resolvedOutput, name))),
        ledger: ledgerDestination,
      });
    } catch (error) {
      for (const destination of published.reverse()) {
        try {
          assertOutputRootIdentity();
          const stat = fs.lstatSync(destination);
          if (!stat.isSymbolicLink() && stat.isFile()) fs.unlinkSync(destination);
        } catch { /* rollback remains best effort and never follows replaced roots */ }
      }
      throw error;
    }
  };

  return Object.freeze({
    outputDir: resolvedOutput,
    stagingDir,
    lockPath,
    stagePath,
    commit,
    abort,
    get committed() { return committed; },
  });
}
